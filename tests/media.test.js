import test from 'node:test';
import assert from 'node:assert/strict';
import { isSafeVideoURL, resolutionFromURL, extractVideos, estimateBytes, suggestedIndex, qualityLabel, formatMB } from '../media.js';

const BASE = 'https://video.twimg.com/ext_tw_video/2114161811985698973/pu/vid';
const v360 = `${BASE}/640x360/abc.mp4?tag=12`;
const v720 = `${BASE}/1280x720/abc.mp4?tag=12`;
const v1080 = `${BASE}/1920x1080/abc.mp4?tag=12`;
const tweet = {
  user: { screen_name: 'xiaohuiyuan' },
  id_str: '2114161811985698973',
  mediaDetails: [{
    id_str: '987654321', type:'video', video_info: { duration_millis: 521000,
      variants: [
        { url:v1080, content_type: 'video/mp4', bitrate: 5600000 },
        { url:v720, content_type:'video/mp4', bitrate: 2176000 },
        { url:v360, content_type:'video/mp4', bitrate: 832000 },
        { url:v720, content_type:'video/mp4', bitrate: 2176000 },
        { url:'https://video.twimg.com/a/stream.m3u8', content_type:'application/x-mpegURL' }
      ]
    }
  }]
};

test('reject URL attacks and non-MP4', () => {
  assert.equal(isSafeVideoURL(v360), true);
  assert.equal(isSafeVideoURL('https://evil.com/v.mp4'), false);
  assert.equal(isSafeVideoURL('javascript:alert(1)'), false);
  assert.equal(isSafeVideoURL('https://video.twimg.com.evil.com/v.mp4'),false);
  assert.equal(isSafeVideoURL('http://video.twimg.com/a.mp4'), false);
  assert.equal(isSafeVideoURL('https://video.twimg.com/vid.m3u8'),false);
});

test('resolution parsing', () => {
  assert.deepEqual(resolutionFromURL(v720),{width:1280,height:720});
  assert.equal(resolutionFromURL('https://video.twimg.com/a/b.mp4'),null);
});

test('normalize and sort actual MP4 variants, no made-up 480p', () => {
  const videos = extractVideos(tweet);
  assert.equal(videos.length,1);
  assert.equal(videos[0].handle,'xiaohuiyuan');
  assert.equal(videos[0].durationMs,521000);
  assert.deepEqual(videos[0].variants.map(v=>v.height),[360,720,1080]);
  assert.equal(suggestedIndex(videos[0].variants,480),0);
  assert.equal(suggestedIndex(videos[0].variants,800),1);
  assert.equal(suggestedIndex(videos[0].variants,200),0);
  assert.match(qualityLabel(videos[0].variants[1]), /720P/);
});

test('estimate approximate size from source bitrate', () => {
  const v=extractVideos(tweet)[0];
  const bytes=estimateBytes(v,v.variants[0]);
  assert.ok(bytes>60_000_000 && bytes<80_000_000);
  assert.match(formatMB(bytes),/ MB$/);
});

test('extract videos from nested GraphQL tweet result', () => {
  const d={ data:{tweetResult:{result:{rest_id:'2114161811985698973', core:{user_results:{result:{legacy:{screen_name:'tester'}}}}, legacy:{extended_entities:{media:[{
    id_str:'111',video_info:{duration_millis:26000,variants:[{url:v360,bitrate:832000,content_type:'video/mp4'}]}
  }]}}}}}};
  const videos=extractVideos(d);
  assert.equal(videos.length,1);
  assert.equal(videos[0].handle,'tester');
  assert.equal(videos[0].variants[0].height,360);
});

test('does not treat HLS playlist as MP4', () => {
  const videos=extractVideos({mediaDetails:[{id_str:'123',video_info:{variants:[{url:'https://video.twimg.com/1/master.m3u8',content_type:'application/x-mpegURL'}]}}]});
  assert.deepEqual(videos,[]);
});
