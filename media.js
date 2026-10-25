/* 可在 Chrome Service Worker 和 Node.js 中运行的纯数据逻辑。 */

export function isSafeVideoURL(value) {
  try {
    const u = new URL(value);
    return u.protocol === 'https:' && u.hostname === 'video.twimg.com' &&
      /\.mp4$/i.test(u.pathname);
  } catch { return false; }
}

export function resolutionFromURL(value) {
  try {
    const p = new URL(value).pathname;
    // X 常见的 /vid/avc1/1280x720/、/pu/vid/640x360/ 路径
    const matches = [...p.matchAll(/(?:^|\/)(\d{2,5})x(\d{2,5})(?:\/|$)/g)];
    if (!matches.length) return null;
    const [, w, h] = matches.at(-1);
    const width = Number(w), height = Number(h);
    if (width < 100 || height < 100 || width > 10000 || height > 10000) return null;
    return { width, height };
  } catch { return null; }
}

function normalizeVariants(input) {
  const seen = new Set();
  const result = [];
  for (const item of Array.isArray(input) ? input : []) {
    if (!item || !isSafeVideoURL(item.url) || seen.has(item.url)) continue;
    if (item.content_type && !String(item.content_type).includes('video/mp4')) continue;
    seen.add(item.url);
    const r = resolutionFromURL(item.url);
    const bitrate = Number(item.bitrate) || 0;
    result.push({ url: item.url, width: r?.width || 0, height: r?.height || 0, bitrate });
  }
  return result.sort((a, b) => a.height - b.height || a.bitrate - b.bitrate || a.width - b.width);
}

export function extractVideos(data) {
  const videos = [];
  const indexed = new Map();
  const seen = new WeakSet();
  let count = 0;
  const tweet = data && typeof data === 'object' ? data : {};
  const rootHandle = tweet.user?.screen_name || tweet.author?.screen_name || '';
  const rootDuration = tweet.video?.duration_millis || 0;

  function add(item, context) {
    const variants = normalizeVariants(item.video_info?.variants || item.variants);
    if (!variants.length) return;
    const id = String(item.id_str || item.id || item.media_key || item.media_url_https || item.media_url || variants[0].url.split('/')[3] || videos.length);
    const durationMs = Number(item.video_info?.duration_millis || item.duration_millis || context?.durationMs || rootDuration) || 0;
    const handle = String(context?.handle || rootHandle).replace(/^@/, '');
    const key = `${context?.postId || ''}:${id}`;
    if (indexed.has(key)) {
      const old = indexed.get(key);
      old.variants = normalizeVariants([...old.variants, ...variants]);
      if (!old.durationMs) old.durationMs = durationMs;
      return;
    }
    const v = { key, id, durationMs, handle, variants };
    indexed.set(key, v);
    videos.push(v);
  }

  function walk(obj, context, depth) {
    if (!obj || typeof obj !== 'object' || depth > 18 || ++count > 14000) return;
    if (seen.has(obj)) return;
    seen.add(obj);
    if (Array.isArray(obj)) {
      for (const child of obj) walk(child, context, depth + 1);
      return;
    }
    const ctx = { ...context };
    if (obj.rest_id && /^\d+$/.test(String(obj.rest_id))) ctx.postId = String(obj.rest_id);
    if (obj.id_str && (obj.full_text || obj.extended_entities)) ctx.postId = String(obj.id_str);
    if (obj.user?.screen_name) ctx.handle = obj.user.screen_name;
    if (obj.core?.user_results?.result?.legacy?.screen_name) ctx.handle = obj.core.user_results.result.legacy.screen_name;
    if (obj.video_info?.variants || (obj.variants && obj.variants.some?.(v => v?.content_type === 'video/mp4'))) add(obj, ctx);
    // 数据结构不同的推文都允许遍历；只保留 MP4 视频节点。
    for (const [k, value] of Object.entries(obj)) {
      if (k === 'variants' || k === 'video_info' || k === 'sizes' || k === 'indices' || k === 'features') continue;
      if (value && typeof value === 'object') walk(value, ctx, depth + 1);
    }
  }
  walk(data, { handle: rootHandle, postId: tweet.id_str || tweet.rest_id || '', durationMs: rootDuration }, 0);
  return videos;
}

export function estimateBytes(video, variant) {
  if (!video?.durationMs || !variant?.bitrate) return null;
  // bitrate 通常不包含音频轨、容器开销；仅作粗略估算。
  return Math.round((video.durationMs / 1000) * (variant.bitrate + 128000) / 8 * 1.03);
}

export function suggestedIndex(variants, preferredHeight = 480) {
  if (!variants?.length) return -1;
  const options = variants.map((x, i) => ({ ...x, i })).filter(x => x.height > 0);
  if (!options.length) return 0;
  const below = options.filter(x => x.height <= preferredHeight);
  if (below.length) return below.sort((a,b) => b.height - a.height || b.bitrate - a.bitrate)[0].i;
  return options.sort((a,b) => a.height - b.height || a.bitrate - b.bitrate)[0].i;
}

export function qualityLabel(v) {
  if (v.height) return `${v.height}P · ${v.width}×${v.height}`;
  if (v.bitrate) return `码率 ${Math.round(v.bitrate / 1000)} kbps`;
  return 'MP4 · 未知画质';
}

export function formatMB(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return '未知';
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
