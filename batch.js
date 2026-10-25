import {zipEntries,writeZip} from './zip-stream.js';

const $=id=>document.getElementById(id);
const t=(k,a)=>XVAi18n.t(k,a);
await XVAi18n.ready;
XVAi18n.apply();
document.title=t('zipTitle');

const start=$('start'),cancel=$('cancel'),message=$('message'),progress=$('progressWrap');
const key=new URLSearchParams(location.search).get('job');
let entries=[], controller=null, running=false;
const label=(text,isError=false)=>{message.textContent=text;message.classList.toggle('error',isError);};
const human=n=>`${(n/1048576).toFixed(1)} MB`;
function display(p) {
  const text=p.phase==='fetch'?t('zipConnecting'):p.phase==='download'?t('zipWriting'):p.phase==='skip'?t('zipSkipping'):t('zipComplete');
  $('progressText').textContent=t('zipProgress',{state:text,index:p.index,total:p.total,name:p.name,size:human(p.bytes)});
  $('bar').style.width=`${Math.round((p.index-(p.phase==='fetch'?1:0))/p.total*100)}%`;
}
async function load() {
  if(!key||!/^[-a-f0-9]{36}$/.test(key))throw new Error(t('zipBadJob'));
  const obj=await chrome.storage.session.get(`zip_${key}`);
  entries=zipEntries(obj[`zip_${key}`]);
  $('count').textContent=t('zipSelected',{count:entries.length});
  for(const e of entries){const line=document.createElement('div');line.className='file';line.textContent=e.name;$('filelist').append(line);}
  if(typeof showSaveFilePicker!=='function')throw new Error(t('zipUnsupported'));
  start.disabled=false;
}
start.addEventListener('click',async()=>{
  if(running||!entries.length)return;
  // Picker must be invoked immediately inside the user's click gesture.
  let handle;
  try {
    handle=await showSaveFilePicker({suggestedName:`X-Videos-${new Date().toISOString().slice(0,10)}.zip`,types:[{description:t('zipDescription'),accept:{'application/zip':['.zip']}}]});
  }catch(e){if(e?.name!=='AbortError')label(t('zipPickerError',{error:e.message}),true);return;}
  running=true;start.disabled=true;cancel.hidden=false;controller=new AbortController();
  progress.hidden=false;label('');
  let writable=null;
  try {
    writable=await handle.createWritable();
    const out=await writeZip(entries,writable,{signal:controller.signal,onProgress:display});
    if(controller.signal.aborted)throw new DOMException(t('zipCancelled'),'AbortError');
    await writable.close();writable=null;
    await chrome.storage.session.remove(`zip_${key}`);
    $('bar').style.width='100%';
    label(t('zipSuccess',{count:out.saved,size:human(out.bytes),extra:out.skipped.length?t('zipSkipped',{count:out.skipped.length,names:out.skipped.slice(0,3).map(x=>x.name).join(', ')}):''}));
    cancel.hidden=true;
    start.textContent=t('zipSaved');
  }catch(e){
    if(writable)try{await writable.abort();}catch{}
    label(e?.name==='AbortError'?t('zipAbort'):t('zipFailure',{error:e.message}),e?.name!=='AbortError');
    start.disabled=false;cancel.hidden=true;
  }finally{running=false;controller=null;}
});
cancel.addEventListener('click',()=>{if(controller)controller.abort();});
load().catch(e=>label(t('zipLoadError',{error:e.message}),true));
