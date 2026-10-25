import test from 'node:test';
import assert from 'node:assert/strict';
await import('../quality.js');
const p = globalThis.XVQSettings;
const data = [
  {height:1080,width:1920,bitrate:4800000},
  {height:360,width:640,bitrate:500000},
  {height:720,width:1280,bitrate:2200000},
  {height:720,width:1280,bitrate:1500000}
];

test('initial setting is SYSTEM, with no hidden 480p requirement', () => {
  assert.equal(p.DEFAULT_QUALITY, 'system');
  assert.equal(p.normalize(undefined),'system');
  assert.equal(p.normalize('garbage'),'system');
  assert.equal(p.CHOICES.length,7);
});
test('system fallback picks largest available height <=480, does not invent variants', () => {
  assert.equal(p.pickIndex(data, 'system'),1);
  assert.equal(p.pickIndex(data, '480'),1);
  assert.equal(p.pickIndex(data, '360'),1);
  assert.equal(p.pickIndex(data, '720'),2); // 720p higher bitrate at same resolution
  assert.equal(p.pickIndex(data, '1080'),0);
  assert.equal(p.pickIndex(data, 'highest'),0);
  assert.equal(p.pickIndex(data, 'smallest'),1);
});
test('all provided qualities are above requested: pick lowest available', () => {
  assert.equal(p.pickIndex([{height:720,bitrate:1500000},{height:1080,bitrate:5000000}], '360'),0);
});
test('multiple variants same resolution: pick highest bitrate except smallest', () => {
  assert.equal(p.pickIndex([{height:480,bitrate:750000},{height:480,bitrate:600000}], '480'),0);
  assert.equal(p.pickIndex([{height:480,bitrate:750000},{height:480,bitrate:600000}], 'smallest'),1);
});
test('unknown bitrates do not appear as the smallest', () => {
  assert.equal(p.pickIndex([{height:360,bitrate:0},{height:720,bitrate:2500000}],'smallest'),1);
  assert.equal(p.pickIndex([], 'system'),-1);
});
test('settings persist and survive a simulated popup reopening', async () => {
  const saved = {};
  globalThis.chrome={storage:{local:{
    get:async key=> ({[key]:saved[key]}),
    set:async obj=>Object.assign(saved,obj)
  }}};
  assert.equal(await p.read(),'system');
  assert.equal(await p.save('720'),'720');
  assert.equal(saved.defaultQuality,'720');
  assert.equal(await p.read(),'720');
  assert.equal(await p.save('highest'),'highest');
  assert.equal(await p.read(),'highest');
  assert.equal(await p.save('nonsense'),'system');
});
