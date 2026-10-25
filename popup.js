const urlInput = document.getElementById('url');
const result = document.getElementById('result');
const defaultQuality = document.getElementById('defaultQuality');
const prefState = document.getElementById('prefState');
const t = (key, args) => XVAi18n.t(key, args);
const postId = s => String(s || '').match(/\/status\/(\d{5,24})(?:[/?#]|$)/)?.[1] || '';
const readable = n => Number.isFinite(n) && n > 0 ? `${(n / 1048576).toFixed(1)} MB` : t('unknownSize');
const isSafeAvatar = src => { try { const u = new URL(src); return u.protocol === 'https:' && u.hostname === 'pbs.twimg.com'; } catch { return false; } };
function status(message, cls = 'muted') {
  const node = document.createElement('p'); node.className = cls; node.textContent = message; result.append(node); return node;
}
async function send(data) {
  const response = await chrome.runtime.sendMessage(data);
  if (!response?.ok) throw new Error(response?.error || t('communicationError'));
  return response.result;
}
for (const q of XVQSettings.CHOICES) {
  const o = document.createElement('option'); o.value = q.value; o.textContent = t(XVAi18n.QUALITY_KEYS[q.value]); defaultQuality.append(o);
}
let setting = XVQSettings.DEFAULT_QUALITY;
let lastData = null;
let busy = false;
const preferenceReady = XVQSettings.read().then(q => {
  setting = q; defaultQuality.value = q;
}).catch(e => { prefState.textContent = t('preferenceFailed',{error:e.message}); });

defaultQuality.addEventListener('change', async () => {
  const previous = setting;
  setting = defaultQuality.value;
  prefState.textContent = t('savePending');
  // A global preference change updates quality menus without altering selection.
  if (lastData) lastData.items.forEach(item => item.data.videos.forEach(v => {
    const select = document.querySelector(`[data-pick="${item.id}-${v._viewIndex}"]`);
    if (select) { select.value = String(XVQSettings.pickIndex(v.variants, setting)); select.dispatchEvent(new Event('change')); }
  }));
  try { await XVQSettings.save(setting); prefState.textContent = t('qualitySaved'); }
  catch(e) { setting = previous; defaultQuality.value = previous; prefState.textContent = t('saveFailed',{error:e.message}); }
});

const controls = document.createElement('div');
controls.className = 'batchbar';
const selectAll = document.createElement('input'); selectAll.type = 'checkbox'; selectAll.id = 'select-all';
const selectLabel = document.createElement('label'); selectLabel.htmlFor = selectAll.id;
selectLabel.append(selectAll, document.createTextNode(t('selectAll')));
const countGroup = document.createElement('div'); countGroup.className = 'batch-count-group';
const count = document.createElement('span'); count.className = 'batch-count'; count.textContent = t('selectedCount',{count:0});
const sizeTotal = document.createElement('span'); sizeTotal.className = 'batch-size';
sizeTotal.textContent = t('sizeHint');
sizeTotal.title = t('sizeExplain');
countGroup.append(count, sizeTotal);
const batch = document.createElement('button'); batch.id = 'batch'; batch.type = 'button'; batch.textContent = t('batchDownload'); batch.disabled = true;
const summary = document.createElement('div'); summary.className = 'batch-summary'; summary.setAttribute('role','status');
// Keep the selection toolbar OUTSIDE the scrolling list. A sticky bar inside
// the old scroll pane covered post content and exposed a phantom gap above it.
const resultList = document.createElement('div'); resultList.className = 'result-list';
controls.append(selectLabel, countGroup, batch);
const MAX_BATCH = 20;
function refreshBatch() {
  const checkboxes = [...result.querySelectorAll('input.video-check')];
  const selected = checkboxes.filter(x => x.checked).length;
  count.textContent = t('selectedCount',{count:selected});
  let bytes = 0, unknown = 0, estimated = 0;
  for (const checkbox of checkboxes) {
    if (!checkbox.checked) continue;
    const quality = checkbox.closest('.video-entry')?.querySelector('.video-quality');
    const n = Number(quality?.dataset.sizeBytes || 0);
    if (!Number.isFinite(n) || n <= 0) { unknown++; continue; }
    bytes += n;
    if (quality.dataset.sizeExact !== 'true') estimated++;
  }
  if (!selected) sizeTotal.textContent = t('sizeHint');
  else if (!bytes) sizeTotal.textContent = t('unknownCount',{count:unknown});
  else sizeTotal.textContent = t('sizeTotal',{prefix:estimated||unknown?t('approximate'):'',size:readable(bytes),unknown:unknown?t('plusUnknown',{count:unknown}):''});
  selectAll.checked = checkboxes.length > 0 && selected === checkboxes.length;
  selectAll.indeterminate = selected > 0 && selected < checkboxes.length;
  batch.disabled = busy || selected === 0 || selected > MAX_BATCH;
  batch.textContent = selected > MAX_BATCH ? t('batchLimit',{count:MAX_BATCH}) : t('zipCount',{count:selected});
}
selectAll.addEventListener('change', () => {
  result.querySelectorAll('input.video-check').forEach(x => {x.checked = selectAll.checked;});
  refreshBatch();
});
function filenameQuality(variant) {
  return variant.height ? `${variant.height}p` : `${Math.round(variant.bitrate / 1000) || 'unknown'}k`;
}
function buildPayload(id, v, index, sel) {
  const variant = v.variants[Number(sel.value)];
  return variant ? {type:'DOWNLOAD',postId:id,url:variant.url,handle:v.handle,index,quality:filenameQuality(variant)} : null;
}
async function singleDownload(btn, id, v, index, select, note) {
  const payload = buildPayload(id,v,index,select);
  if (!payload) return;
  btn.disabled = true;
  try {
    await send(payload); btn.textContent = t('started'); note.textContent = t('queuedChrome');
  } catch(e) { note.textContent = t('downloadFailed',{error:e.message}); }
  finally {btn.disabled = false;}
}
function makeAuthor(id, meta = {}) {
  const head = document.createElement('div'); head.className = 'post-head';
  const avatar = document.createElement('div'); avatar.className = 'avatar';
  avatar.textContent = (meta.name || meta.handle || 'X').slice(0,1).toUpperCase();
  if (isSafeAvatar(meta.avatar)) {
    const img = document.createElement('img'); img.src = meta.avatar; img.referrerPolicy = 'no-referrer'; img.alt = '';
    img.addEventListener('error', () => img.remove()); avatar.append(img);
  }
  const info = document.createElement('div'); info.className = 'author-info';
  const name = document.createElement('a'); name.className = 'author-name';
  name.textContent = meta.name || (meta.handle ? `@${meta.handle}` : t('unknownAuthor'));
  name.href = meta.handle ? `https://x.com/${encodeURIComponent(meta.handle)}/status/${id}` : `https://x.com/i/status/${id}`;
  name.target = '_blank'; name.rel = 'noopener noreferrer';
  const handle = document.createElement('div'); handle.className = 'author-handle';
  handle.textContent = meta.handle ? `@${meta.handle}` : t('postId',{id});
  info.append(name, handle); head.append(avatar,info);
  const link = document.createElement('a'); link.className = 'post-link'; link.textContent = t('originalPost');
  link.href = `https://x.com/i/status/${id}`; link.target = '_blank'; link.rel = 'noopener noreferrer'; head.append(link);
  return head;
}
function renderPost(item) {
  const {id,data,meta = {}} = item;
  const card = document.createElement('article'); card.className = 'post-card';
  card.append(makeAuthor(id,meta));
  if (meta.text) {
    const excerpt = document.createElement('div'); excerpt.className = 'post-excerpt';
    excerpt.textContent = meta.text.slice(0, 150) + (meta.text.length > 150 ? '…' : '');
    card.append(excerpt);
  }
  data.videos.forEach((v,index) => {
    v._viewIndex = index;
    const section = document.createElement('div'); section.className = 'video-entry';
    const check = document.createElement('input'); check.type = 'checkbox'; check.className='video-check';
    check.setAttribute('aria-label', t('selectVideo',{author:meta.name||id,index:index+1}));
    check.addEventListener('change',refreshBatch);
    const label = document.createElement('div'); label.className = 'video-number';
    label.textContent = data.videos.length > 1 ? t('videoIndex',{index:index+1}) : t('video');
    const select = document.createElement('select'); select.className = 'video-quality';
    select.dataset.pick = `${id}-${index}`;
    for (const [pos, variant] of v.variants.entries()) {
      const o = document.createElement('option'); o.value = String(pos);
      o.textContent = variant.height ? `${variant.height}P · ${variant.width}×${variant.height}` : `${Math.round(variant.bitrate/1000)} kbps`;
      select.append(o);
    }
    select.value = String(XVQSettings.pickIndex(v.variants,setting));
    const btn = document.createElement('button'); btn.type='button'; btn.className='download-one'; btn.textContent=t('download');
    const note = document.createElement('div'); note.className='video-note';
    const setSize = sizes => {
      const pos=Number(select.value), bytes=sizes?.[pos];
      const option = v.variants[pos];
      const est = v.durationMs && option?.bitrate ? Math.round(v.durationMs/1000 * (option.bitrate+128000)/8*1.03) : 0;
      const chosen = Number.isFinite(Number(bytes)) && Number(bytes) > 0 ? Number(bytes) : est;
      select.dataset.sizeBytes = String(chosen || 0);
      select.dataset.sizeExact = Number.isFinite(Number(bytes)) && Number(bytes) > 0 ? 'true' : 'false';
      note.textContent = bytes ? readable(bytes) : est ? `${t('approximate')}${readable(est)}` : t('unknownSize');
      refreshBatch();
    };
    let sizes = [];
    select.addEventListener('change',()=>setSize(sizes));
    setSize(sizes);
    btn.addEventListener('click',()=>singleDownload(btn,id,v,index,select,note));
    section.append(check,label,select,btn);
    card.append(section,note);
    // Fetch sizes in background; all HTML and links are built through DOM APIs.
    send({type:'GET_SIZES',urls:v.variants.map(x=>x.url)}).then(data => {
      sizes = data.sizes || []; if (card.isConnected) setSize(sizes);
    }).catch(()=>{});
  });
  return card;
}
function renderAll(items, mode = 'single', preserveScroll = false) {
  result.replaceChildren();
  document.body.classList.toggle('has-results',!!items.length);
  if(items.length) document.getElementById('otherModes').open = false;
  if (!items.length) { status(t('noVideos')); return; }
  status(mode === 'sniff' ? t('sniffResult',{count:items.length}) : t('chooseQualityHint'));
  result.append(controls, summary, resultList);
  summary.textContent = '';
  resultList.replaceChildren();
  for (const item of items) resultList.append(renderPost(item));
  refreshBatch();
  // Bring the larger results pane into view; the user can scroll the outer
  // popup back up to settings or scroll this pane independently.
  if (mode === 'sniff' && !preserveScroll) requestAnimationFrame(() => {
    if (controls.isConnected) controls.scrollIntoView({block:'start',behavior:'auto'});
  });
}
batch.addEventListener('click',async () => {
  if (!lastData || busy) return;
  const selected = [...result.querySelectorAll('.video-check')].filter(x=>x.checked);
  if (!selected.length || selected.length > MAX_BATCH) return;
  const payloads = [];
  for (const card of result.querySelectorAll('.post-card')) {
    const item = lastData.items[[...result.querySelectorAll('.post-card')].indexOf(card)];
    for (const [index,entry] of [...card.querySelectorAll('.video-entry')].entries()) {
      if (!entry.querySelector('.video-check').checked) continue;
      const payload = buildPayload(item.id,item.data.videos[index],index,entry.querySelector('.video-quality'));
      if (payload) payloads.push(payload);
    }
  }
  busy = true;refreshBatch();batch.textContent = t('openingZip');
  summary.textContent = t('zipPrompt');
  try {
    const response = await send({type:'CREATE_ZIP_JOB',items:payloads});
    summary.textContent = t('zipOpened',{count:response.count});
  } catch(e) { summary.textContent = t('zipJobFailed',{error:e.message}); }
  finally {busy = false;refreshBatch();}

});
async function lookup(value) {
  if (busy) return;
  const id = postId(value);
  result.replaceChildren(); document.body.classList.remove('has-results'); lastData = null;
  if (!id) return status(t('inputTweet'),'error');
  status(t('queryingQuality'));
  try {
    await preferenceReady;
    const data = await send({type:'GET_VIDEOS',postId:id});
    const item = {id,data,meta:data.meta || {handle:data.videos?.[0]?.handle || ''}};
    lastData={items:[item],mode:'single'};
    renderAll(lastData.items,'single');
  } catch(e) {result.replaceChildren();document.body.classList.remove('has-results');status(e.message,'error');}
}
document.getElementById('search').addEventListener('click',()=>lookup(urlInput.value));
urlInput.addEventListener('keydown', e=>{ if(e.key==='Enter') lookup(urlInput.value); });
document.getElementById('current').addEventListener('click', async() => {
  try {
    const [tab] = await chrome.tabs.query({active:true,currentWindow:true});
    if (!tab) throw new Error(t('noActiveTab'));
    const id = postId(tab.url);
    if (id) {urlInput.value=tab.url;lookup(tab.url);return;}
    const response = await chrome.tabs.sendMessage(tab.id,{type:'OPEN_PICKER'});
    if (!response?.ok) throw new Error(response?.error || t('openTweet'));
    window.close();
  } catch(e) {result.replaceChildren();document.body.classList.remove('has-results');status(e.message,'error');}
});
document.getElementById('sniff').addEventListener('click',async() => {
  if (busy) return;
  const button = document.getElementById('sniff');
  button.disabled=true;lastData=null;result.replaceChildren();document.body.classList.remove('has-results');status(t('findingVideos'));
  try {
    await preferenceReady;
    const [tab] = await chrome.tabs.query({active:true,currentWindow:true});
    if (!tab || !/^https:\/\/(?:www\.)?(?:x\.com|twitter\.com)\//.test(tab.url || ''))
      throw new Error(t('switchToX'));
    let response;
    try {response=await chrome.tabs.sendMessage(tab.id,{type:'SNIFF_PAGE'});}
    catch{throw new Error(t('refreshX'));}
    if (!response?.ok) throw new Error(response?.error || t('sniffFailed'));
    const candidates=(response.result?.items || []).slice(0,30);
    if (!candidates.length) throw new Error(t('noSeenVideo'));
    // All candidates resolve concurrently: inaccessible posts should not multiply
    // the X public endpoint's 12s timeout across batches.
    const resolved=await Promise.all(candidates.map(async entry=>{
      try {
        const data=await send({type:'GET_VIDEOS',postId:entry.id,fallback:entry.fallback});
        return data?.videos?.length ? {id:entry.id,data,meta:{...(data.meta || {}),...(entry.meta || {})}} : null;
      } catch{return null;}
    }));
    const found=resolved.filter(Boolean);
    if (!found.length) throw new Error(t('noDownloadable'));
    lastData={items:found,mode:'sniff'};
    renderAll(found,'sniff');
  } catch(e) {result.replaceChildren();document.body.classList.remove('has-results');status(e.message,'error');}
  finally {button.disabled=false;}
});

// Language is a secondary preference: expose it behind the header gear.
const languageSelect=document.getElementById('languagePreference');
function refreshLanguageOptions() {
  const lang=XVAi18n.browserLanguage();
  languageSelect.replaceChildren();
  for(const [value,label] of [
    ['auto',t('languageAutoCurrent',{language:lang==='zh'?'简体中文':'English'})],
    ['zh',t('languageZh')],['en',t('languageEn')]
  ]) {const option=document.createElement('option');option.value=value;option.textContent=label;languageSelect.append(option);}
  languageSelect.value=XVAi18n.preference;
}
function refreshLocalization() {
  const checks=[...result.querySelectorAll('.post-card')].map(card=>[...card.querySelectorAll('.video-entry')].map(entry=>({
    checked:entry.querySelector('.video-check')?.checked, quality:entry.querySelector('.video-quality')?.value
  })));
  const listScroll=resultList.scrollTop,outerScroll=document.scrollingElement?.scrollTop||0;
  XVAi18n.apply();
  document.title=t('name');
  for (const [index,q] of XVQSettings.CHOICES.entries())defaultQuality.options[index].textContent=t(XVAi18n.QUALITY_KEYS[q.value]);
  refreshLanguageOptions();
  if(lastData){
    renderAll(lastData.items,lastData.mode||'single',true);
    [...result.querySelectorAll('.post-card')].forEach((card,i)=>[...card.querySelectorAll('.video-entry')].forEach((entry,j)=>{
      const old=checks[i]?.[j];if(!old)return;
      entry.querySelector('.video-check').checked=!!old.checked;
      const select=entry.querySelector('.video-quality');if([...select.options].some(x=>x.value===old.quality)){select.value=old.quality;select.dispatchEvent(new Event('change'));}
    }));
    refreshBatch();resultList.scrollTop=listScroll;
    if(document.scrollingElement)document.scrollingElement.scrollTop=outerScroll;
  }
  selectLabel.lastChild.textContent=t('selectAll');
  sizeTotal.title=t('sizeExplain');
  refreshBatch();
  if(!lastData)prefState.textContent=t('defaultHint');
}
XVAi18n.onChange(refreshLocalization);
XVAi18n.ready.then(refreshLocalization);
languageSelect.addEventListener('change',async()=>{
  const before=XVAi18n.preference;
  try{await XVAi18n.save(languageSelect.value)}
  catch(error){languageSelect.value=before;prefState.textContent=t('saveFailed',{error:error.message});}
});
// Close this popover with outside click, without affecting the main results pane.
document.addEventListener('click',event=>{const node=document.getElementById('moreSettings');if(node.open&&!node.contains(event.target))node.open=false;});
document.addEventListener('keydown',event=>{if(event.key==='Escape')document.getElementById('moreSettings').open=false;});
