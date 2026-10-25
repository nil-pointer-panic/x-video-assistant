(() => {
  if (window.__xvqContentReady) return;
  window.__xvqContentReady = true;

  const t=(key,args)=>XVAi18n.t(key,args);
  const pageMedia = new Map();
  const pagePosts = new Map();
  let modalRoot = null;
  let currentDialog = 0;
  let scheduled = false;
  let theater = null;
  const THEATER_ICON = '<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="1.85" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 3H4a1 1 0 0 0-1 1v4m13-5h4a1 1 0 0 1 1 1v4M3 16v4a1 1 0 0 0 1 1h4m13-5v4a1 1 0 0 1-1 1h-4"/><path d="M8 8h8v8H8z" opacity=".65"/></svg>';
  const CLOSE_ICON = '<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" aria-hidden="true"><path d="M6 6 18 18M18 6 6 18"/></svg>';

  const postIdFromURL = value => String(value || '').match(/\/status\/(\d{5,24})(?:[/?#]|$)/)?.[1] || '';
  const msg = async (data) => {
    try {
      const r = await chrome.runtime.sendMessage(data);
      if (!r?.ok) throw new Error(r?.error || t('communicationError'));
      return r.result;
    } catch (e) { throw new Error(e.message || t('communicationError')); }
  };

  window.addEventListener('message', e => {
    if (e.source !== window || e.origin !== location.origin || e.data?.source !== '__X_VIDEO_QUALITY_PAGE__') return;
    const items = Array.isArray(e.data.found) ? e.data.found.slice(0, 100) : [];
    for (const item of items) {
      if (!/^\d{5,24}$/.test(String(item?.postId))) continue;
      const key = String(item.postId);
      const existing = pageMedia.get(key) || [];
      if (existing.length > 30) continue;
      const known = new Set(existing.map(x => x.media?.video_info?.variants?.[0]?.url));
      const url = item.media?.video_info?.variants?.[0]?.url;
      try {
        if (new URL(url).hostname !== 'video.twimg.com') continue;
      } catch { continue; }
      if (!known.has(url)) existing.push({ media: item.media, handle: item.handle });
      pageMedia.set(key, existing);
      // Metadata comes from X's already loaded GraphQL response, not a third-party service.
      if (item.meta) pagePosts.set(key, cleanMeta(item.meta));
      if (pageMedia.size > 120) {
        const oldest = pageMedia.keys().next().value;
        pageMedia.delete(oldest); pagePosts.delete(oldest);
      }
    }
  });

  function safeAvatar(url) {
    try {
      const u = new URL(String(url || ''));
      return u.protocol === 'https:' && u.hostname === 'pbs.twimg.com' ? u.toString() : '';
    } catch { return ''; }
  }
  function cleanMeta(input = {}) {
    const value = s => String(s || '').replace(/\s+/g, ' ').trim();
    return {
      name: value(input.name).slice(0, 90),
      handle: value(input.handle).replace(/^@/, '').slice(0, 45),
      text: value(input.text).slice(0, 260),
      avatar: safeAvatar(input.avatar)
    };
  }
  function metaFromArticle(article) {
    const userLabel = article.querySelector('[data-testid="User-Name"]');
    const anchors = userLabel ? [...userLabel.querySelectorAll('a[href]')] : [];
    const userLink = anchors.find(a => /^\/[^/]+\/?$/.test(a.getAttribute('href') || ''));
    const handle = (userLink?.getAttribute('href') || '').replace(/^\//, '').replace(/\/$/, '');
    // In X's user-name block the first span is the display name, not the @handle.
    const userText = userLink?.innerText?.trim() || userLabel?.querySelector('span')?.innerText?.trim() || '';
    const textNode = article.querySelector('[data-testid="tweetText"]');
    const avatar = article.querySelector('[data-testid="Tweet-User-Avatar"] img');
    return cleanMeta({name:userText, handle, text:textNode?.innerText || textNode?.textContent, avatar:avatar?.src});
  }
  function mergeMeta(primary, backup) {
    return Object.fromEntries(['name','handle','text','avatar'].map(k => [k, primary?.[k] || backup?.[k] || '']));
  }

  function findTweetId(article) {
    const nodes = [...article.querySelectorAll('a[href*="/status/"]')];
    const preferred = nodes.find(x => x.querySelector('time')) || nodes[0];
    return postIdFromURL(preferred?.getAttribute('href')) || postIdFromURL(location.href);
  }

  function addButtons() {
    scheduled = false;
    addTheaterButtons();
    for (const article of document.querySelectorAll('article[data-testid="tweet"]')) {
      const hasVideo = !!article.querySelector('video, [data-testid="videoPlayer"], [data-testid="videoComponent"], [data-testid="videoPlayerContainer"]');
      if (!hasVideo || article.querySelector('.xvq-button')) continue;
      const postId = findTweetId(article);
      const action = article.querySelector('[role="group"]');
      if (!postId || !action) continue;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'xvq-button';
      button.setAttribute('aria-label', t('inlineDownload'));
      button.title = t('inlineDownload');
      button.innerHTML = '<svg aria-hidden="true" viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12m-4-4 4 4 4-4"/><path d="M4 16v2.5A2.5 2.5 0 0 0 6.5 21h11A2.5 2.5 0 0 0 20 18.5V16"/></svg>';
      Object.assign(button.style, {
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        background: 'transparent', border: 'none', borderRadius: '50%', color: '#71767b',
        width: '34px', height: '34px', padding: '7px', cursor: 'pointer',
        flexShrink: '0', marginInlineStart: '2px', transition: 'color .15s ease'
      });
      button.addEventListener('mouseenter', () => { button.style.color = 'inherit'; });
      button.addEventListener('mouseleave', () => { button.style.color = '#71767b'; });
      button.addEventListener('click', ev => {
        ev.preventDefault(); ev.stopPropagation();
        openPicker(postId).catch(console.error);
      });
      action.append(button);
    }
  }

  // Theater mode promotes the ORIGINAL player to Chrome's top layer with Popover.
  // There is no cloning, DOM reparenting, stream reload, or second <video>.
  // The existing media element, its React controls and playback state stay intact.
  function installTheaterCSS() {
    if (document.getElementById('xvq-theater-style')) return;
    const style = document.createElement('style');
    style.id = 'xvq-theater-style';
    style.textContent = `
      .xvq-theater-player::backdrop {
        background: rgba(0,0,0,.78) !important;
      }
      .xvq-theater-player:popover-open {
        box-sizing: border-box !important;
        position: fixed !important;
        inset: auto !important;
        left: 50% !important;
        top: 50% !important;
        right: auto !important;
        bottom: auto !important;
        transform: translate(-50%, -50%) !important;
        margin: 0 !important;
        padding: 0 !important;
        border: 0 !important;
        max-width: 85vw !important;
        max-height: 85vh !important;
        overflow: visible !important;
        z-index: 2147483646 !important;
        background: #000 !important;
        border-radius: 12px !important;
        box-shadow: 0 24px 90px rgba(0,0,0,.5) !important;
      }
      .xvq-theater-player:popover-open video {
        object-fit: contain !important;
      }
      .xvq-theater-launch {
        appearance: none !important;
        position: absolute !important;
        top: 8px !important;
        right: var(--xvq-theater-right, 8px) !important;
        bottom: auto !important;
        left: auto !important;
        z-index: 2147483645 !important;
        display: grid !important;
        place-items: center !important;
        width: 32px !important;
        height: 32px !important;
        min-width: 32px !important;
        min-height: 32px !important;
        padding: 0 !important;
        margin: 0 !important;
        border: 0 !important;
        border-radius: 50% !important;
        background: rgba(0,0,0,.48) !important;
        color: white !important;
        opacity: .93 !important;
        line-height: 1 !important;
        cursor: pointer !important;
        transition: background .14s ease, opacity .14s ease !important;
      }
      .xvq-theater-launch:hover { background:rgba(0,0,0,.72) !important; opacity:1 !important; }
      .xvq-theater-launch:focus-visible { outline: 2px solid #fff !important; outline-offset: 2px !important; }
      .xvq-theater-launch svg { display:block !important; width:19px !important; height:19px !important; fill:none !important; }
      .xvq-theater-player:popover-open .xvq-theater-launch {
        top: 10px !important;
        right: var(--xvq-theater-right, 10px) !important;
        width: 34px !important;
        height: 34px !important;
      }
      @media (prefers-reduced-motion: reduce) {
        .xvq-theater-launch { transition:none !important; }
      }
    `;
    (document.head || document.documentElement).append(style);
  }

  function choosePlayerRoot(video) {
    // Prefer the existing X React player wrapper so native controls enlarge too.
    for (const selector of ['[data-testid="videoPlayer"]', '[data-testid="videoPlayerContainer"]', '[data-testid="videoComponent"]']) {
      const node = video.closest(selector);
      if (node && node !== video && node.getBoundingClientRect().width >= 80) return node;
    }
    return video.parentElement;
  }

  function closeTheater() {
    const state = theater;
    if (!state) return;
    theater = null;
    const {root, launcher, originalStyle, hadStyle, originalPopover, scroll, url, article, articleMinHeight, articleMinHeightPriority} = state;
    document.removeEventListener('pointerdown', state.onOutside, true);
    document.removeEventListener('keydown', state.onKey, true);
    document.removeEventListener('wheel', state.onWheel, {capture:true});
    document.removeEventListener('touchmove', state.onWheel, {capture:true});
    window.removeEventListener('resize', state.resize);
    root.removeEventListener('toggle', state.onToggle);
    try { if (root.matches(':popover-open')) root.hidePopover(); } catch { /* removed by X */ }
    root.classList.remove('xvq-theater-player');
    if (hadStyle) root.setAttribute('style', originalStyle);
    else root.removeAttribute('style');
    if (originalPopover === null) root.removeAttribute('popover');
    else root.setAttribute('popover', originalPopover);
    if (article) {
      if (articleMinHeight) article.style.setProperty('min-height', articleMinHeight, articleMinHeightPriority);
      else article.style.removeProperty('min-height');
    }
    if (launcher.isConnected) {
      launcher.innerHTML = THEATER_ICON;
      launcher.setAttribute('aria-label', t('theaterOpen'));
      launcher.title = t('theaterOpen');
      try { launcher.focus({preventScroll:true}); } catch { /* detached */ }
    }
    // Do not jump back to an obsolete scroll position after an SPA navigation.
    if (url === location.href && (window.scrollX !== scroll.x || window.scrollY !== scroll.y)) {
      window.scrollTo(scroll.x, scroll.y);
    }
  }

  function openTheater(root, launcher) {
    if (theater?.root === root) { closeTheater(); return; }
    if (theater) closeTheater();
    if (typeof root.showPopover !== 'function' || !root.isConnected) return;
    installTheaterCSS();
    const originalStyle = root.getAttribute('style') || '';
    const hadStyle = root.hasAttribute('style');
    const originalPopover = root.getAttribute('popover');
    const article = root.closest('article[data-testid="tweet"]');
    const articleMinHeight = article?.style.getPropertyValue('min-height') || '';
    const articleMinHeightPriority = article?.style.getPropertyPriority('min-height') || '';
    const articleHeight = article?.getBoundingClientRect().height || 0;
    const rect = root.getBoundingClientRect();
    if (rect.width < 30 || rect.height < 30) return;
    const video = root.querySelector('video');
    const ratio = video?.videoWidth && video?.videoHeight
      ? video.videoWidth / video.videoHeight : rect.width / rect.height;
    const state = {
      root, launcher, originalStyle, hadStyle, originalPopover,
      article, articleMinHeight, articleMinHeightPriority,
      ratio: Number.isFinite(ratio) && ratio > 0 ? ratio : 16 / 9,
      scroll: {x:window.scrollX, y:window.scrollY}, url:location.href
    };
    const resize = () => {
      if (theater !== state) return;
      const width = Math.min(innerWidth * .85, innerHeight * .85 * state.ratio);
      const height = width / state.ratio;
      root.style.setProperty('width', `${Math.round(width)}px`, 'important');
      root.style.setProperty('height', `${Math.round(height)}px`, 'important');
    };
    state.resize = resize;
    state.onOutside = ev => {
      if (theater !== state) return;
      const box = root.getBoundingClientRect();
      if (ev.clientX >= box.left && ev.clientX <= box.right && ev.clientY >= box.top && ev.clientY <= box.bottom) return;
      ev.preventDefault(); ev.stopPropagation(); ev.stopImmediatePropagation();
      closeTheater();
    };
    state.onKey = ev => {
      if (ev.key !== 'Escape' || theater !== state) return;
      ev.preventDefault(); ev.stopPropagation();
      closeTheater();
    };
    state.onWheel = ev => {
      if (theater !== state) return;
      if (!root.contains(ev.target)) ev.preventDefault();
    };
    state.onToggle = ev => {
      if (ev.newState === 'closed' && theater === state) closeTheater();
    };
    try {
      // Reserve the tweet's layout height so X's virtualized feed won't collapse.
      if (article && articleHeight > 0) article.style.setProperty('min-height', `${Math.ceil(articleHeight)}px`, 'important');
      root.setAttribute('popover', 'manual');
      root.classList.add('xvq-theater-player');
      theater = state;
      resize();
      root.showPopover();
      launcher.innerHTML = CLOSE_ICON;
      launcher.setAttribute('aria-label', t('theaterClose'));
      launcher.title = t('theaterClose');
      document.addEventListener('pointerdown', state.onOutside, true);
      document.addEventListener('keydown', state.onKey, true);
      document.addEventListener('wheel', state.onWheel, {capture:true, passive:false});
      document.addEventListener('touchmove', state.onWheel, {capture:true, passive:false});
      window.addEventListener('resize', resize);
      root.addEventListener('toggle', state.onToggle);
      launcher.focus({preventScroll:true});
    } catch (error) {
      closeTheater();
      console.warn('[X Video Assistant] 无法开启网页内放大播放', error);
    }
  }

  function positionTheaterButton(root, launcher) {
    if (theater?.root === root) return;
    const box = root.getBoundingClientRect();
    if (box.width < 95 || box.height < 40) return;
    const controls = [...root.querySelectorAll('button, [role="button"]')]
      .filter(b => b !== launcher && !b.classList.contains('xvq-theater-launch'))
      .slice(0, 40).map(b => b.getBoundingClientRect())
      .filter(r => r.width >= 12 && r.height >= 12);
    let offset = 8;
    for (let i = 0; i < 5; i++) {
      const test = {left: box.right - offset - 32, right: box.right - offset,
        top:box.top + 8, bottom:box.top + 40};
      if (!controls.some(r => r.left < test.right && r.right > test.left && r.top < test.bottom && r.bottom > test.top)) break;
      offset += 40;
    }
    launcher.style.setProperty('--xvq-theater-right', `${offset}px`);
  }

  function addTheaterButtons() {
    installTheaterCSS();
    if (theater && (!theater.root.isConnected || location.href !== theater.url)) closeTheater();
    // Reuse the same article/video detection as the existing download button.
    // Do not inject download controls into the video itself.
    for (const article of document.querySelectorAll('article[data-testid="tweet"]')) {
      const hosts = new Set();
      for (const video of article.querySelectorAll('video')) {
        const root = choosePlayerRoot(video);
        if (root && root !== article) hosts.add(root);
      }
      // X may only create the <video> after clicking Play on a thumbnail.
      for (const node of article.querySelectorAll('[data-testid="videoPlayer"]')) {
        if (node.getBoundingClientRect().width >= 80 && ![...hosts].some(h => node.contains(h) || h.contains(node))) hosts.add(node);
      }
      for (const root of hosts) {
        const previousButton = root.querySelector(':scope > .xvq-theater-launch');
        if (previousButton) { positionTheaterButton(root, previousButton); continue; }
        const button = document.createElement('button');
        button.className = 'xvq-theater-launch';
        button.type = 'button';
        button.title = t('theaterOpen');
        button.setAttribute('aria-label', t('theaterOpen'));
        button.innerHTML = THEATER_ICON;
        // Retain the player in its original location; button is an overlay only.
        if (getComputedStyle(root).position === 'static') root.style.position = 'relative';
        button.addEventListener('click', ev => {
          ev.preventDefault(); ev.stopPropagation();
          openTheater(root, button);
        });
        root.append(button);
        positionTheaterButton(root, button);
      }
    }
  }

  function scheduleButtons() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(addButtons);
  }

  function createModal() {
    const container = document.createElement('div');
    container.id = 'xvq-extension-root';
    Object.assign(container.style, { position: 'fixed', inset: '0', zIndex: '2147483647', pointerEvents: 'none' });
    document.documentElement.appendChild(container);
    const root = container.attachShadow({ mode: 'open' });
    const css = document.createElement('style');
    css.textContent = MODAL_CSS;
    root.appendChild(css);
    const shade = document.createElement('div'); shade.className = 'shade';
    shade.innerHTML = '<section class="dialog" role="dialog" aria-modal="true"><header><div class="heading"><h2></h2><p></p></div><button class="close"><svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg></button></header><div class="body"></div><footer><svg aria-hidden="true" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12 5 5L20 7"/></svg><span></span></footer></section>';
    shade.querySelector('.dialog').setAttribute('aria-label',t('dialogAccessible'));
    shade.querySelector('h2').textContent=t('dialogTitle');
    shade.querySelector('.heading p').textContent=t('dialogSubtitle');
    shade.querySelector('.close').setAttribute('aria-label',t('close'));
    shade.querySelector('footer span').textContent=t('footer');
    root.appendChild(shade);
    shade.addEventListener('click', ev => { if (ev.target === shade) hide(); });
    shade.querySelector('.close').addEventListener('click', hide);
    document.addEventListener('keydown', ev => { if (ev.key === 'Escape' && modalRoot) hide(); });
    return { container, shade, body: shade.querySelector('.body'), title: shade.querySelector('h2') };
  }

  function hide() {
    if (!modalRoot) return;
    modalRoot.container.remove();
    modalRoot = null;
    currentDialog++;
  }

  function text(tag, className, value) {
    const e = document.createElement(tag); e.className = className; e.textContent = value; return e;
  }
  const readableSize = (b) => !Number.isFinite(b) || b <= 0 ? t('unknownSize') : `${(b / 1048576).toFixed(1)} MB`;
  const estimate = (video, variant) => video.durationMs && variant.bitrate
    ? Math.round(video.durationMs / 1000 * (variant.bitrate + 128000) / 8 * 1.03) : null;
  const label = v => v.height ? `${v.height}P · ${v.width}×${v.height}` :
    v.bitrate ? t('bitrate',{rate:Math.round(v.bitrate / 1000)}) : 'MP4 · unknown';

  const MODAL_CSS = `
    :host {--bg:#fff;--fg:#1a1a1a;--secondary:#737373;--muted:#929292;--line:#ededed;--field:#fafafa;--hover:#f7f7f7;--chosen:#fafafa;--chosen-border:#bcbcbc;--tag:#ededed;--error:#b42318;color-scheme:light dark}
    *{box-sizing:border-box}
    .shade{pointer-events:auto;position:fixed;inset:0;background:rgba(0,0,0,.46);display:grid;place-items:center;padding:20px;font:13px/1.5 -apple-system,BlinkMacSystemFont,'SF Pro Text','PingFang SC',sans-serif;color:var(--fg);-webkit-font-smoothing:antialiased}
    .dialog{width:min(520px,100%);max-height:min(88vh,850px);display:flex;flex-direction:column;background:var(--bg);border:1px solid var(--line);border-radius:19px;box-shadow:0 25px 90px rgba(0,0,0,.18);overflow:hidden}
    header{padding:23px 26px 18px;display:flex;align-items:flex-start;justify-content:space-between;gap:10px;border-bottom:1px solid var(--line)}
    header h2{font-size:19px;line-height:1.3;letter-spacing:-.3px;font-weight:670;margin:0}
    header p{font-size:12px;color:var(--secondary);margin:5px 0 0}
    .close{height:30px;width:30px;display:grid;place-items:center;background:transparent;border:0;color:var(--secondary);border-radius:8px;cursor:pointer;flex:none}
    .close:hover{background:var(--hover);color:var(--fg)}
    .body{padding:16px 24px 22px;overflow-y:auto;min-height:100px;overscroll-behavior:contain}
    .hint{font-size:11px;color:var(--muted);line-height:1.6;margin:0 0 14px}
    .hint a{color:var(--fg);text-decoration:underline;text-decoration-color:var(--line);text-underline-offset:2px}
    .preferences{display:flex;align-items:center;gap:11px;margin:0 0 14px;padding:0 0 17px;border-bottom:1px solid var(--line);color:var(--fg);font-size:12px}
    .preferences label{font-weight:590;white-space:nowrap}
    .preferences select{appearance:auto;background:var(--field);color:var(--fg);border:1px solid var(--line);border-radius:9px;max-width:100%;padding:9px 12px;flex:1;min-width:0;cursor:pointer;font:inherit}
    .preferences .saved{min-width:32px;color:var(--secondary);font-size:11px}
    .video{padding:0 0 13px;margin-bottom:12px;border-bottom:1px solid var(--line)}
    .video:last-child{border-bottom:0;margin:0;padding-bottom:0}
    .video-title{font-size:12px;font-weight:560;color:var(--secondary);margin:0 0 10px}
    .variant{cursor:pointer;width:100%;display:flex;align-items:center;gap:10px;border:1px solid var(--line);border-radius:11px;padding:13px 14px;background:var(--bg);color:var(--fg);text-align:left;margin-top:8px;transition:background .15s,border-color .15s}
    .variant:hover{background:var(--hover)}.variant:disabled{opacity:.55;cursor:wait}
    .variant.recommended{border-color:var(--chosen-border);background:var(--chosen)}
    .v-main{flex:1;min-width:0}.v-label{display:block;font-size:14px;font-weight:660;line-height:1.4}.v-note{display:block;color:var(--muted);font-size:11px;margin-top:4px;overflow-wrap:anywhere}
    .tag{font-size:10px;border-radius:5px;background:var(--tag);padding:2px 6px;color:var(--secondary);margin-left:8px;font-weight:550;vertical-align:2px}
    .v-size{font-size:12px;font-variant-numeric:tabular-nums;white-space:nowrap;color:var(--fg);font-weight:610}
    .v-arrow{color:var(--secondary);width:16px;height:16px;flex:none;opacity:.65}
    .status{border-radius:9px;background:var(--field);padding:11px 13px;color:var(--secondary);line-height:1.6;font-size:12px}
    .error{color:var(--error)}.action{border:1px solid var(--line);border-radius:9px;color:var(--fg);padding:10px 12px;background:var(--field);cursor:pointer;margin-top:10px;width:100%;font:inherit}
    .action:hover{background:var(--hover)}
    footer{display:flex;align-items:center;gap:6px;border-top:1px solid var(--line);padding:13px 26px;color:var(--muted);font-size:11px;line-height:1.5}
    button:focus-visible,select:focus-visible,a:focus-visible{outline:2px solid var(--fg);outline-offset:2px}
    @media(prefers-color-scheme:dark){:host{--bg:#1b1b1b;--fg:#f1f1f1;--secondary:#a8a8a8;--muted:#888;--line:#343434;--field:#242424;--hover:#292929;--chosen:#262626;--chosen-border:#707070;--tag:#383838;--error:#ff958a}}
    @media(max-width:480px){.body{padding:14px 16px 18px}header{padding:19px 18px 15px}footer{padding:11px 18px}.preferences{flex-wrap:wrap}.preferences select{flex-basis:100%}.preferences .saved{flex:none}}
    @media(prefers-reduced-motion:reduce){*{transition:none!important}}
  `;

  function showError(root, postId, error) {
    root.body.replaceChildren();
    root.body.append(text('div','status error', error));
    const tip = text('p','hint',t('hlsInfo'));
    tip.style.marginTop = '15px'; root.body.append(tip);
    const cmd = `yt-dlp -S "res:480" --merge-output-format mp4 "https://x.com/i/status/${postId}"`;
    const copy = text('button','action',t('copyYtdlp'));
    copy.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(cmd); copy.textContent=t('copied'); }
      catch { copy.textContent=t('copyFailed'); }
    });
    root.body.append(copy);
  }

  async function openPicker(postId) {
    if (!/^\d{5,24}$/.test(String(postId))) throw new Error(t('invalidPost'));
    await XVAi18n.ready;
    hide();
    modalRoot = createModal();
    const view = modalRoot;
    const serial = ++currentDialog;
    view.body.append(text('div','status',t('loadingMp4')));
    const fallback = { mediaDetails: (pageMedia.get(String(postId)) || []).map(x => x.media) };
    try {
      const [res, savedQuality] = await Promise.all([
        msg({ type: 'GET_VIDEOS', postId: String(postId), fallback }),
        XVQSettings.read().catch(() => XVQSettings.DEFAULT_QUALITY)
      ]);
      if (!modalRoot || serial !== currentDialog) return;
      view.body.replaceChildren();
      const hint = document.createElement('p'); hint.className='hint';
      hint.append(t('offeredQuality'));
      const link = text('a','', t('viewPost'));
      link.href = `https://x.com/i/status/${postId}`; link.target='_blank'; link.rel='noopener noreferrer';
      hint.appendChild(link);
      view.body.append(hint);
      let preferredQuality = savedQuality;
      const preference = document.createElement('div'); preference.className = 'preferences';
      const prefLabel = text('label','',t('qualityDefault'));
      const qualitySelect = document.createElement('select'); qualitySelect.id = 'xvq-default-quality';
      prefLabel.htmlFor = qualitySelect.id;
      for (const choice of XVQSettings.CHOICES) {
        const option = document.createElement('option'); option.value = choice.value;
        option.textContent = t(XVAi18n.QUALITY_KEYS[choice.value]); qualitySelect.append(option);
      }
      qualitySelect.value = preferredQuality;
      const saved = text('span','saved','');
      preference.append(prefLabel, qualitySelect, saved); view.body.append(preference);
      const updateRecommended = () => {
        view.body.querySelectorAll('section.video').forEach((section,i) => {
          const idx = XVQSettings.pickIndex(res.videos[i].variants, preferredQuality);
          section.querySelectorAll('.variant').forEach((btn,j) => {
            btn.classList.toggle('recommended', j === idx);
            const label = btn.querySelector('.v-label');
            const old = label.querySelector('.tag'); if (old) old.remove();
            if (j === idx) label.append(text('span','tag',t('defaultTag')));
          });
        });
      };
      qualitySelect.addEventListener('change', async () => {
        const previous = preferredQuality;
        const next = qualitySelect.value;
        preferredQuality = next;
        updateRecommended();
        saved.textContent = t('savePending');
        try { await XVQSettings.save(next); saved.textContent = t('saved'); }
        catch (e) {
          preferredQuality = previous; qualitySelect.value = previous;
          updateRecommended(); saved.textContent = t('saveFailed',{error:e.message});
        }
      });
      res.videos.forEach((v, index) => {
        const section = document.createElement('section'); section.className='video';
        section.append(text('h3','video-title',res.videos.length > 1 ? t('videoIndex',{index:index+1}) : t('selectQualityToDownload')));
        const recommended = XVQSettings.pickIndex(v.variants, preferredQuality);
        const slots = [];
        v.variants.forEach((variant, pos) => {
          const button = document.createElement('button'); button.type='button';
          button.className = `variant${pos === recommended ? ' recommended' : ''}`;
          const main = document.createElement('span'); main.className='v-main';
          const title = text('span','v-label',label(variant));
          if (pos === recommended) title.append(text('span','tag',t('defaultTag')));
          const note = text('span','v-note', variant.bitrate ? t('bitrate',{rate:Math.round(variant.bitrate/1000)}) : t('originalSave'));
          main.append(title,note);
          const estimated = estimate(v, variant);
          const size = text('span','v-size', estimated ? `${t('approximate')}${readableSize(estimated)}` : t('querying'));
          const arrow = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
          arrow.setAttribute('viewBox','0 0 24 24');
          arrow.setAttribute('class','v-arrow');
          arrow.setAttribute('fill','none');
          arrow.setAttribute('stroke','currentColor');
          arrow.setAttribute('stroke-width','1.7');
          arrow.setAttribute('stroke-linecap','round');
          arrow.setAttribute('stroke-linejoin','round');
          arrow.innerHTML = '<path d="M12 3v12m-4-4 4 4 4-4"/><path d="M4 16v2.5A2.5 2.5 0 0 0 6.5 21h11A2.5 2.5 0 0 0 20 18.5V16"/>';
          button.append(main,size,arrow);
          button.addEventListener('click', async () => {
            button.disabled = true;
            try {
              const result = await msg({type:'DOWNLOAD',postId:String(postId),url:variant.url,handle:v.handle,
                quality:variant.height ? `${variant.height}p` : `${Math.round(variant.bitrate/1000) || 'unknown'}k`,index});
              note.textContent=t('sentFile',{file:result.filename});
            } catch(e) { note.textContent = t('downloadFailed',{error:e.message}); }
            finally { button.disabled = false; }
          });
          section.append(button);
          slots.push({size,variant,estimated});
        });
        view.body.append(section);
        msg({type:'GET_SIZES',urls:slots.map(x=>x.variant.url)}).then(data => {
          if (!modalRoot || serial !== currentDialog) return;
          slots.forEach((s,i) => {
            const bytes = data.sizes?.[i];
            s.size.textContent = bytes ? readableSize(bytes) : s.estimated ? `${t('approximate')}${readableSize(s.estimated)}` : t('unknownSize');
            s.size.title = bytes ? t('sizeHead') : t('sizeEstimated');
          });
        }).catch(()=>{});
      });
    } catch(e) {
      if (modalRoot && serial===currentDialog) showError(view, postId, e.message);
    }
  }

  // Expose already-seen page media to the toolbar popup for explicit on-page sniffing.
  // No new network permissions or third-party endpoints are required.
  function sniffPage() {
    const ids = new Set();
    const visibleMeta = new Map();
    const current = postIdFromURL(location.href);
    if (current) ids.add(current);
    for (const article of document.querySelectorAll('article[data-testid="tweet"]')) {
      if (!article.querySelector('video, [data-testid="videoPlayer"], [data-testid="videoComponent"], [data-testid="videoPlayerContainer"]')) continue;
      const id = findTweetId(article);
      if (id) {
        ids.add(id);
        visibleMeta.set(id, metaFromArticle(article));
      }
      if (ids.size >= 30) break;
    }
    // Add cached entries as well: the X timeline virtualizes posts during scrolling.
    for (const id of [...pageMedia.keys()].reverse()) {
      if (ids.size >= 30) break;
      ids.add(id);
    }
    return { items:[...ids].slice(0,30).map(id=>({
      id,
      meta:mergeMeta(visibleMeta.get(id),pagePosts.get(id)),
      fallback:{mediaDetails:(pageMedia.get(id) || []).map(x=>x.media)}
    })) };
  }

  chrome.runtime.onMessage.addListener((message, sender, reply) => {
    if (message?.type === 'SNIFF_PAGE') {
      reply({ok:true,result:sniffPage()});
      return;
    }
    if (message?.type === 'OPEN_PICKER') {
      const id = postIdFromURL(message.postUrl || location.href);
      if (!id) { reply({ok:false,error:t('notPostPage')}); return; }
      openPicker(id).catch(console.error); reply({ok:true});
    }
  });

  const routeChanged = () => {
    if (theater && theater.url !== location.href) closeTheater();
  };
  window.addEventListener('popstate', routeChanged);
  window.addEventListener('hashchange', routeChanged);

  const localizeLaunchers = () => {
    document.querySelectorAll('.xvq-button').forEach(btn=>{
      btn.title=t('inlineDownload');btn.setAttribute('aria-label',t('inlineDownload'));
    });
    document.querySelectorAll('.xvq-theater-launch').forEach(btn=>{
      const key=theater?.launcher===btn?'theaterClose':'theaterOpen';
      btn.title=t(key);btn.setAttribute('aria-label',t(key));
    });
  };
  XVAi18n.ready.then(localizeLaunchers);
  XVAi18n.onChange(localizeLaunchers);
  const boot = () => {
    scheduleButtons();
    const observer = new MutationObserver(scheduleButtons);
    observer.observe(document.body, { childList: true, subtree: true });
  };
  if (document.body) boot();
  else document.addEventListener('DOMContentLoaded', boot, {once:true});
})();
