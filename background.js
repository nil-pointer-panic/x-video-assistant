import { extractVideos, isSafeVideoURL } from './media.js';
import './i18n.js';
const t=(key,args)=>XVAi18n.t(key,args);

const sizeCache = new Map();
const infoCache = new Map();
const ID_RE = /^\d{5,24}$/;
const FETCH_TIMEOUT = 12000;

async function fetchWithTimeout(url, init = {}, ms = FETCH_TIMEOUT) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ac.signal, credentials: 'omit', referrerPolicy: 'no-referrer' });
  } finally { clearTimeout(timer); }
}

function tweetToken(id) {
  return ((Number(id) / 1e15) * Math.PI).toString(36).replace(/(0+|\.)/g, '');
}

async function fetchSyndication(id) {
  const api = new URL('https://cdn.syndication.twimg.com/tweet-result');
  api.searchParams.set('id', id);
  api.searchParams.set('lang', 'en');
  api.searchParams.set('token', tweetToken(id));
  const r = await fetchWithTimeout(api.toString());
  if (!r.ok) throw new Error(t('errHttp',{status:r.status}));
  const d = await r.json();
  if (d?.__typename === 'TweetTombstone') throw new Error(t('errPrivate'));
  return d;
}

function mergeVideoLists(primary, fallback) {
  const out = [];
  const keys = new Map();
  for (const v of [...primary, ...fallback]) {
    const valid = v.variants.filter(x => isSafeVideoURL(x.url));
    if (!valid.length) continue;
    // 以媒体 ID 或第一个视频链接的路径区分多视频帖子。
    const key = v.id && /^(?:\d+|\d+_\d+)$/.test(v.id) ? `id:${v.id}` : `url:${valid[0].url.replace(/\/vid\/.*$/, '')}`;
    if (keys.has(key)) {
      const old = keys.get(key);
      const urls = new Set(old.variants.map(x => x.url));
      for (const x of valid) if (!urls.has(x.url)) { old.variants.push(x); urls.add(x.url); }
      old.variants.sort((a,b) => a.height - b.height || a.bitrate - b.bitrate);
      continue;
    }
    const entry = { ...v, variants: valid };
    keys.set(key, entry);
    out.push(entry);
  }
  return out;
}


function postMetadata(d = {}) {
  const user = d.user || d.author || {};
  const clean = x => String(x || '').replace(/\s+/g,' ').trim();
  const name = clean(user.name).slice(0,90);
  const handle = clean(user.screen_name).replace(/^@/,'').slice(0,45);
  const avatar = clean(user.profile_image_url_https || user.profile_image_url).slice(0,500);
  const message = clean(d.full_text || d.text || d.note_tweet?.text).slice(0,260);
  return {name,handle,avatar,text:message};
}

async function getVideos(postId, fallbackRaw) {
  if (!ID_RE.test(postId)) throw new Error(t('errBadId'));
  const fallback = extractVideos(fallbackRaw || {});
  // The current tab has already loaded the media metadata. Avoid an unnecessary
  // 12-second network timeout on the public embed endpoint.
  if (fallback.length) {
    return { videos: mergeVideoLists([], fallback), via: '当前页面媒体数据' };
  }
  const cached = infoCache.get(postId);
  if (cached && Date.now() - cached.at < 120000) {
    const merged = mergeVideoLists(cached.videos, fallback);
    if (merged.length) return { videos: merged, via: cached.via };
  }
  let data, error;
  try { data = await fetchSyndication(postId); } catch(e) { error = e; }
  const videos = mergeVideoLists(extractVideos(data), fallback);
  if (!videos.length) {
    throw new Error(error ? t('errMP4',{error:error.message}) :
      t('errNoMP4'));
  }
  const result = { videos, meta: postMetadata(data), via: data ? 'X 公开媒体接口' : '当前页面媒体数据' };
  infoCache.set(postId, { ...result, at: Date.now() });
  return result;
}

async function headSize(url) {
  if (!isSafeVideoURL(url)) return null;
  if (sizeCache.has(url)) return sizeCache.get(url);
  try {
    const r = await fetchWithTimeout(url, { method: 'HEAD' }, 5000);
    const raw = r.headers.get('content-length');
    const n = raw ? Number(raw) : NaN;
    const value = r.ok && Number.isFinite(n) && n > 0 ? n : null;
    sizeCache.set(url, value);
    return value;
  } catch {
    sizeCache.set(url, null);
    return null;
  }
}

function sanitizeFile(s, fallback) {
  const out = String(s || '').replace(/[^\p{L}\p{N}._-]/gu, '_').replace(/_+/g, '_').slice(0, 60);
  return out || fallback;
}

async function download(message) {
  if (!isSafeVideoURL(message.url)) throw new Error(t('errVideoSource'));
  if (!ID_RE.test(String(message.postId || ''))) throw new Error(t('errIdWrong'));
  const handle = sanitizeFile(message.handle, 'twitter');
  const quality = sanitizeFile(message.quality, 'video');
  const number = Number.isInteger(message.index) && message.index >= 0 && message.index < 20 ? `_${message.index + 1}` : '';
  const filename = `X-Videos/${handle}_${message.postId}${number}_${quality}.mp4`;
  const downloadId = await chrome.downloads.download({ url: message.url, filename, conflictAction: 'uniquify', saveAs: false });
  if (!downloadId) throw new Error(t('errChromeDownload'));
  return { downloadId, filename };
}

const MAX_BATCH = 20;
async function createZipJob(items) {
  if (!Array.isArray(items) || items.length < 1 || items.length > MAX_BATCH)
    throw new Error(t('errBatchRange',{count:MAX_BATCH}));
  const seen = new Set();
  const clean = [];
  for (const item of items) {
    if (!item || !isSafeVideoURL(item.url) || !ID_RE.test(String(item.postId || '')))
      throw new Error(t('errInvalidLink'));
    const dedupe = `${item.postId}:${item.index}:${item.url}`;
    if (seen.has(dedupe)) continue;
    seen.add(dedupe);
    clean.push({ url: item.url, postId: String(item.postId),
      handle: sanitizeFile(item.handle, 'X'), quality: sanitizeFile(item.quality, 'video'),
      index: Number.isInteger(item.index) ? item.index : 0 });
  }
  if (!clean.length) throw new Error(t('errNoZipVideo'));
  // Keep the selection in extension session storage; no video files are staged.
  const jobId = crypto.randomUUID();
  await chrome.storage.session.set({ [`zip_${jobId}`]: clean });
  const tab = await chrome.tabs.create({ url: chrome.runtime.getURL(`batch.html?job=${jobId}`), active: true });
  return { count: clean.length, tabId: tab.id };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || typeof message !== 'object') return;
  if (sender.tab && !/^https:\/\/(?:www\.)?(?:x\.com|twitter\.com)\//.test(sender.url || sender.tab.url || '')) return;
  const run = async () => {
    await XVAi18n.ready;
    switch(message.type) {
      case 'GET_VIDEOS': return await getVideos(String(message.postId || ''), message.fallback);
      case 'GET_SIZES': {
        if (!Array.isArray(message.urls)) throw new Error(t('errParameter'));
        const urls = message.urls.slice(0, 16);
        const sizes = await Promise.all(urls.map(headSize));
        return { sizes };
      }
      case 'DOWNLOAD': return await download(message);
      case 'CREATE_ZIP_JOB': return await createZipJob(message.items);
      default: throw new Error(t('errUnsupported'));
    }
  };
  run().then(result => sendResponse({ ok: true, result }), e => sendResponse({ ok: false, error: e?.message || String(e) }));
  return true;
});
