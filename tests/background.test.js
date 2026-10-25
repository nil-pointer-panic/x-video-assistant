import test from 'node:test';
import assert from 'node:assert/strict';
let listener;
const downloads=[];
const savedJobs={};const openedTabs=[];
globalThis.chrome={
  runtime:{ getURL:(path)=>'chrome-extension://abc123/'+path,onMessage:{addListener: cb=>{listener=cb;}}},
  storage:{session:{set:async obj=>Object.assign(savedJobs,obj)}},
  tabs:{create:async opt=>{openedTabs.push(opt);return {id:11};}},
  downloads:{download:async req=>{downloads.push(req);return 42;}}
};
const playlist = {
  id_str:'2114161811985698973',
  user: {screen_name:'demo'},
  mediaDetails: [{id_str:'123456',video_info:{duration_millis:30000,variants:[
    {url:'https://video.twimg.com/ext_tw_video/123/pu/vid/640x360/demo.mp4',bitrate:832000,content_type:'video/mp4'},
    {url:'https://video.twimg.com/ext_tw_video/123/pu/vid/1280x720/demo.mp4',bitrate:2176000,content_type:'video/mp4'}
  ]}}]
};
const requests=[];
globalThis.fetch = async (url, init={})=>{
  requests.push({url:String(url),init});
  if (String(url).includes('tweet-result')) return {ok:true,json:async()=>playlist};
  if (init.method === 'HEAD') return {ok:true,headers:new Headers({'content-length':'10485760'})};
  throw new Error('Unexpected URL: '+url);
};
await import('../background.js');
const sender={tab:{id:8},url:'https://x.com/demo/status/2114161811985698973'};
function request(m,source=sender){
  return new Promise((resolve,reject)=>{
    if (listener(m,source,response=>resolve(response))!==true) reject(new Error('No listener'));
  });
}

test('syndication URL gets computed token; video options are listed', async()=>{
  const r=await request({type:'GET_VIDEOS',postId:'2114161811985698973'});
  assert.equal(r.ok,true);
  assert.equal(r.result.videos.length,1);
  assert.deepEqual(r.result.videos[0].variants.map(x=>x.height),[360,720]);
  const fetchRequest=requests.find(x=>x.url.includes('tweet-result'));
  assert.equal(new URL(fetchRequest.url).searchParams.get('id'),'2114161811985698973');
  assert.match(new URL(fetchRequest.url).searchParams.get('token'),/^[a-z0-9]+$/);
});

test('accurate content-length from MP4 head response',async()=>{
  const r=await request({type:'GET_SIZES',urls:[playlist.mediaDetails[0].video_info.variants[0].url]});
  assert.deepEqual(r.result.sizes,[10485760]);
});

test('file starts as MP4 in X-Videos directory and avoids overbroad URLs',async()=>{
  const p=playlist.mediaDetails[0].video_info.variants[0].url;
  const r=await request({type:'DOWNLOAD',postId:'2114161811985698973',url:p,handle:'demo',quality:'360p',index:0});
  assert.equal(r.ok,true);
  assert.equal(r.result.downloadId,42);
  assert.equal(downloads[0].filename,'X-Videos/demo_2114161811985698973_1_360p.mp4');
  const blocked=await request({type:'DOWNLOAD',postId:'2114161811985698973',url:'https://evil.example/test.mp4'});
  assert.equal(blocked.ok,false);
});

test('rejects invalid ID before downloading',async()=>{
  const r=await request({type:'GET_VIDEOS',postId:'abc'});
  assert.equal(r.ok,false);
});

test('page media fallback is immediately usable without an X API fetch or timeout', async()=>{
  const before=requests.length;
  const r=await request({type:'GET_VIDEOS',postId:'2114161811985698999',fallback:playlist});
  assert.equal(r.ok,true);
  assert.equal(r.result.via,'当前页面媒体数据');
  assert.deepEqual(r.result.videos[0].variants.map(x=>x.height),[360,720]);
  assert.equal(requests.length,before);
});

test('batch ZIP job opens one tab; does not start one download per MP4',async()=>{
  const first=playlist.mediaDetails[0].video_info.variants[0].url;
  const second=playlist.mediaDetails[0].video_info.variants[1].url;
  const before=downloads.length;
  const r=await request({type:'CREATE_ZIP_JOB',items:[
    {postId:'2114161811985698973',url:first,handle:'demo',quality:'360p',index:0},
    {postId:'2114161811985698973',url:second,handle:'demo',quality:'720p',index:0}
  ]});
  assert.equal(r.ok,true);assert.equal(r.result.count,2);
  assert.equal(downloads.length,before); // No multiple browser download prompts
  assert.equal(openedTabs.length,1);
  const job=new URL(openedTabs[0].url).searchParams.get('job');
  assert.equal(savedJobs[`zip_${job}`].length,2);
});

test('batch ZIP deduplicates entries and rejects bad URLs before opening tab',async()=>{
  const first=playlist.mediaDetails[0].video_info.variants[0].url;
  const r=await request({type:'CREATE_ZIP_JOB',items:[
    {postId:'2114161811985698973',url:first,handle:'demo',quality:'360p',index:0},
    {postId:'2114161811985698973',url:first,handle:'demo',quality:'360p',index:0}
  ]});
  assert.equal(r.ok,true);assert.equal(r.result.count,1);
  const before=openedTabs.length;
  const bad=await request({type:'CREATE_ZIP_JOB',items:[{postId:'2114161811985698973',url:'https://evil.example/a.mp4'}]});
  assert.equal(bad.ok,false);assert.equal(openedTabs.length,before);
});

test('batch ZIP rejects empty or excessive selection',async()=>{
  const empty=await request({type:'CREATE_ZIP_JOB',items:[]});
  const excessive=await request({type:'CREATE_ZIP_JOB',items:Array(21).fill({})});
  assert.equal(empty.ok,false);assert.equal(excessive.ok,false);
});
