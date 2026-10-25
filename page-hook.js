/* MAIN world：只从 X 自己的 GraphQL 响应里提取视频 MP4 变体。
   不修改请求，不读取 Cookie，不发送数据到第三方。 */
(() => {
  if (window.__xvqHookInstalled) return;
  window.__xvqHookInstalled = true;
  const VIDEO_HOST = 'video.twimg.com';
  function valid(u) {
    try { const x = new URL(u); return x.protocol === 'https:' && x.hostname === VIDEO_HOST && x.pathname.endsWith('.mp4'); }
    catch { return false; }
  }
  function collect(json) {
    const list = [];
    const seen = new WeakSet();
    let visited = 0;
    function scan(node, tweetId, handle, depth, meta = {}) {
      if (!node || typeof node !== 'object' || depth > 18 || ++visited > 14000 || seen.has(node)) return;
      seen.add(node);
      if (Array.isArray(node)) { for (const child of node) scan(child, tweetId, handle, depth + 1, meta); return; }
      let id = tweetId, user = handle, details = meta;
      if (node.rest_id && /^\d{5,24}$/.test(String(node.rest_id)) && node.legacy) {
        const author = node.core?.user_results?.result?.legacy || {};
        details = {
          name: String(author.name || '').slice(0, 90),
          handle: String(author.screen_name || '').slice(0, 45),
          avatar: String(author.profile_image_url_https || '').replace(/_normal(\.[a-z]+)(\?.*)?$/i, '_normal$1$2'),
          text: String(node.note_tweet?.note_tweet_results?.result?.text || node.legacy?.full_text || '').slice(0, 260)
        };
      }
      if (node.rest_id && /^\d{5,24}$/.test(String(node.rest_id)) && node.legacy) id = String(node.rest_id);
      if (node.legacy?.screen_name && (node.is_blue_verified !== undefined || node.profile_image_shape !== undefined)) user = node.legacy.screen_name;
      if (node.core?.user_results?.result?.legacy?.screen_name) user = node.core.user_results.result.legacy.screen_name;
      if (node.video_info?.variants && id) {
        const variants = node.video_info.variants.filter(v => valid(v?.url))
          .map(v => ({ url: v.url, content_type: 'video/mp4', bitrate: Number(v.bitrate) || 0 }));
        if (variants.length) list.push({ postId: id, media: {
          id_str: String(node.id_str || node.id || node.media_key || ''),
          video_info: { variants, duration_millis: node.video_info.duration_millis || 0 }
        }, handle: user || '', meta: details });
      }
      for (const [k, v] of Object.entries(node)) {
        if (['variants','video_info','sizes','indices','features'].includes(k)) continue;
        if (v && typeof v === 'object') scan(v, id, user, depth + 1, details);
      }
    }
    scan(json, '', '', 0);
    return list.slice(0, 100);
  }
  function inspect(data) {
    try {
      const found = collect(data);
      if (found.length) window.postMessage({ source: '__X_VIDEO_QUALITY_PAGE__', found }, location.origin);
    } catch { /* X 数据结构变化时静默忽略 */ }
  }
  function interesting(url) { return typeof url === 'string' && url.includes('/graphql/'); }
  const originalFetch = window.fetch;
  if (typeof originalFetch === 'function') {
    window.fetch = function(...args) {
      const url = typeof args[0] === 'string' ? args[0] : args[0]?.url;
      const result = originalFetch.apply(this, args);
      if (interesting(url)) {
        result.then(r => {
          if (!r.ok || Number(r.headers.get('content-length')) > 4_000_000) return;
          r.clone().json().then(inspect).catch(() => {});
        }).catch(() => {});
      }
      return result;
    };
  }
  const xo = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function(method, url, ...rest) {
    this.__xvqInterested = interesting(String(url));
    if (this.__xvqInterested) this.addEventListener('load', function() {
      try {
        if (this.status === 200 && (!this.responseType || this.responseType === 'text') && this.responseText.length < 4_000_000)
          inspect(JSON.parse(this.responseText));
      } catch { /* 忽略非 JSON 响应 */ }
    }, { once: true });
    return xo.call(this, method, url, ...rest);
  };
})();
