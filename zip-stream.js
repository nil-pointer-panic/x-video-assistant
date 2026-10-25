/* Streaming, uncompressed ZIP writer (STORE). MP4 is already compressed;
   ZIP storage avoids transcoding, CPU overhead, and whole-archive RAM use.
   Classic ZIP's 32-bit offsets cap output at <4 GiB; enforce a safe limit. */
export const ZIP_LIMIT = 0xFFF00000; // ~4 GiB; ZIP64 intentionally unsupported
const localized=(key,fallback)=>globalThis.XVAi18n?.t(key)||fallback;
const encoder = new TextEncoder();
const crcTable = Uint32Array.from({length:256},(_,i)=>{
  let n=i;for(let j=0;j<8;j++)n=(n&1)?(0xedb88320^(n>>>1)):(n>>>1);
  return n>>>0;
});
export function crc32Step(crc,bytes) {
  let c=crc>>>0;
  for(let i=0;i<bytes.length;i++) c=crcTable[(c^bytes[i])&255]^(c>>>8);
  return c>>>0;
}
const put16=(d,o,v)=>d.setUint16(o,v,true);
const put32=(d,o,v)=>d.setUint32(o,v>>>0,true);
const dateParts=(dt)=>{
  const year=Math.max(1980,Math.min(2107,dt.getFullYear()));
  return {date:((year-1980)<<9)|((dt.getMonth()+1)<<5)|dt.getDate(),
    time:(dt.getHours()<<11)|(dt.getMinutes()<<5)|Math.floor(dt.getSeconds()/2)};
};
const fileName=(name)=>{
  const s=String(name||'video.mp4').normalize('NFC').replace(/[/\\\x00-\x1f\x7f]/g,'_').replace(/\.\./g,'_').slice(0,120);
  return s||'video.mp4';
};
export function zipEntries(items) {
  const seen=new Set();
  if(!Array.isArray(items)||!items.length||items.length>20)throw new Error(localized('zipErrRange','请勾选 1–20 个视频'));
  return items.map((m,i)=>{
    const u=new URL(m.url);
    if(u.protocol!=='https:'||u.hostname!=='video.twimg.com'||!/\.mp4$/i.test(u.pathname))throw new Error(localized('zipErrSource','仅支持 X 官方 MP4 视频链接'));
    if(!/^\d{5,24}$/.test(String(m.postId)))throw new Error(localized('zipErrId','推文 ID 无效'));
    const safe=s=>String(s||'').replace(/[^\p{L}\p{N}._-]/gu,'_').replace(/_+/g,'_').slice(0,45)||'X';
    const idx=Number.isInteger(m.index)&&m.index>=0&&m.index<20?m.index+1:i+1;
    const base=fileName(`${safe(m.handle)}_${m.postId}_${idx}_${safe(m.quality)}.mp4`);
    // Avoid duplicate archive member names even with repeated author/media IDs.
    let name=base, n=2;
    while(seen.has(name)) name=base.replace(/\.mp4$/,`_${n++}.mp4`);
    seen.add(name);
    return {url:u.href,name};
  });
}

/**
 * @param {Array<{url:string,name:string}>} entries
 * @param {{write:(data:Uint8Array)=>Promise<void>}} writable
 * @param {{fetcher?:typeof fetch,signal?:AbortSignal,onProgress?:(p:object)=>void,maxBytes?:number}} options
 */
export async function writeZip(entries,writable,{fetcher=fetch,signal,onProgress=()=>{},maxBytes=ZIP_LIMIT}={}) {
  if(!Array.isArray(entries)||!entries.length||entries.length>20)throw new Error(localized('zipErrTooMany','ZIP 视频数超出范围'));
  const records=[];let offset=0;let done=0;const skipped=[];
  const write=async bytes=>{
    if(offset+bytes.length>maxBytes)throw new Error(localized('zipErrTooLarge','ZIP 超过约 4 GB 限制，请分批下载'));
    await writable.write(bytes);offset+=bytes.length;
  };
  const stamp=dateParts(new Date());
  for(const [i,item] of entries.entries()) {
    if(signal?.aborted)throw new DOMException(localized('zipErrAborted','下载已取消'),'AbortError');
    onProgress({phase:'fetch',index:i+1,total:entries.length,name:item.name,bytes:done});
    let response;
    try {
      response=await fetcher(item.url,{signal,credentials:'omit',referrerPolicy:'no-referrer'});
      if(!response.ok||!response.body)throw new Error(`HTTP ${response.status||'无响应'}`);
    } catch(e) {
      if(signal?.aborted)throw e;
      skipped.push({name:item.name,error:e?.message||String(e)});
      onProgress({phase:'skip',index:i+1,total:entries.length,name:item.name,bytes:done});
      continue;
    }
    const name=encoder.encode(fileName(item.name));
    const header=new Uint8Array(30+name.length),h=new DataView(header.buffer);
    put32(h,0,0x04034b50);put16(h,4,20);put16(h,6,0x0808);put16(h,8,0);
    put16(h,10,stamp.time);put16(h,12,stamp.date);
    put16(h,26,name.length);header.set(name,30);
    const start=offset;
    await write(header);
    let size=0,crc=0xffffffff;
    const reader=response.body.getReader();
    try {
      for(;;) {
        if(signal?.aborted)throw new DOMException(localized('zipErrAborted','下载已取消'),'AbortError');
        const {done:ended,value}=await reader.read();
        if(ended)break;
        if(!value?.length)continue;
        size+=value.length;
        if(size>0xffffffff)throw new Error(localized('zipErrEntryTooLarge','单条视频超过 ZIP 格式大小限制'));
        crc=crc32Step(crc,value);
        await write(value);
        onProgress({phase:'download',index:i+1,total:entries.length,name:item.name,bytes:done+size});
      }
    } finally { reader.releaseLock(); }
    crc=(crc^0xffffffff)>>>0;
    const descriptor=new Uint8Array(16),v=new DataView(descriptor.buffer);
    put32(v,0,0x08074b50);put32(v,4,crc);put32(v,8,size);put32(v,12,size);
    await write(descriptor);
    records.push({name,offset:start,crc,size});done+=size;
    onProgress({phase:'finished',index:i+1,total:entries.length,name:item.name,bytes:done});
  }
  if(!records.length)throw new Error(localized('zipErrNoSuccess','没有成功获取到 MP4，未生成空 ZIP'));
  const centralStart=offset;
  for(const r of records) {
    const c=new Uint8Array(46+r.name.length),v=new DataView(c.buffer);
    put32(v,0,0x02014b50);put16(v,4,20);put16(v,6,20);
    put16(v,8,0x0808);put16(v,10,0);put16(v,12,stamp.time);put16(v,14,stamp.date);
    put32(v,16,r.crc);put32(v,20,r.size);put32(v,24,r.size);
    put16(v,28,r.name.length);put32(v,42,r.offset);c.set(r.name,46);
    await write(c);
  }
  const tail=new Uint8Array(22),v=new DataView(tail.buffer);
  put32(v,0,0x06054b50);put16(v,8,records.length);put16(v,10,records.length);
  put32(v,12,offset-centralStart);put32(v,16,centralStart);
  await write(tail);
  return {saved:records.length,skipped,bytes:done,archiveBytes:offset};
}
