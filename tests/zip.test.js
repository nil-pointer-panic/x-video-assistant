import test from 'node:test';
import assert from 'node:assert/strict';
import {zipEntries,writeZip,crc32Step,ZIP_LIMIT} from '../zip-stream.js';
const URL='https://video.twimg.com/ext_tw_video/1234/pu/vid/640x360/a.mp4';
const item={url:URL,postId:'2114161811985698973',handle:'user',quality:'360p',index:0};
const bytes=new TextEncoder().encode('Pretend video bytes from Twitter');
function streamOf(buf){return new ReadableStream({start(ctrl){ctrl.enqueue(buf.slice(0,5));ctrl.enqueue(buf.slice(5));ctrl.close();}});}
const fakeResponse=(buf)=>({ok:true,body:streamOf(buf)});
function memWriter(){const chunks=[];return {write:async x=>chunks.push(x),bytes:()=>Buffer.concat(chunks.map(x=>Buffer.from(x)))};}
test('ZIP entries only accept official MP4 URLs and safely encode filenames',()=>{
  const entries=zipEntries([item,{...item,handle:'../bad\\name'}]);
  assert.equal(entries.length,2);assert.equal(new Set(entries.map(x=>x.name)).size,2);
  assert.ok(entries.every(x=>!x.name.includes('/')&&!x.name.includes('\\')));
  assert.throws(()=>zipEntries([{...item,url:'https://bad.example/a.mp4'}]));
  assert.throws(()=>zipEntries([]));
});
test('CRC32 matches standard checksum',()=>{
  const crc=(crc32Step(0xffffffff,new TextEncoder().encode('123456789'))^0xffffffff)>>>0;
  assert.equal(crc,0xcbf43926);
});
test('streaming ZIP has one central directory for two MP4s and correct byte sizes',async()=>{
  const entries=zipEntries([item,{...item,postId:'2114161811985698974',quality:'720p'}]);
  const output=memWriter();
  const out=await writeZip(entries,output,{fetcher:async()=>fakeResponse(bytes)});
  const zip=output.bytes();
  assert.equal(out.saved,2);assert.equal(out.bytes,bytes.length*2);
  assert.equal(zip.readUInt32LE(0),0x04034b50);
  assert.equal(zip.readUInt32LE(zip.length-22),0x06054b50);
  assert.equal(zip.readUInt16LE(zip.length-12),2);
  assert.equal(out.archiveBytes,zip.length);
  assert.ok(zip.includes(bytes));
});
test('unavailable video is skipped and remaining MP4 is saved',async()=>{
  const entries=zipEntries([item,{...item,postId:'2114161811985698974'}]);
  const out=await writeZip(entries,memWriter(),{fetcher:async url=>url.includes('/1234/')?fakeResponse(bytes):{ok:false,status:404}});
  assert.equal(out.saved,2); // same video URL, both succeed
  const ids=zipEntries([{...item,url:'https://video.twimg.com/a.mp4'},{...item,url:URL}]);
  const one=await writeZip(ids,memWriter(),{fetcher:async u=>u.includes('a.mp4')&&!u.includes('/1234/')?{ok:false,status:403}:fakeResponse(bytes)});
  assert.equal(one.saved,1);assert.equal(one.skipped.length,1);
});
test('file size exceeding limit aborts instead of generating a corrupt ZIP',async()=>{
  const entries=zipEntries([item]);
  await assert.rejects(writeZip(entries,memWriter(),{fetcher:async()=>fakeResponse(bytes),maxBytes:40}),/4 GB/);
  assert.ok(ZIP_LIMIT<0xffffffff);
});
