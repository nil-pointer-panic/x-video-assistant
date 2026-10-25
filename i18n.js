/* Shared, zero-dependency runtime localization for the popup, X content script,
   and ZIP export tab. A saved override always wins over Chrome's UI language. */
(() => {
  const KEY = 'languagePreference';
  const dictionaries = {
    zh: {
      name:'X 视频助手', tagline:'放大播放 · 自选画质 · 批量保存', qualityDefault:'默认清晰度', qualityRemember:'自动记住设置', defaultHint:'默认优先 480P，也可以随时更改。',
      downloads:'下载视频', sniff:'嗅探当前页面', otherWays:'其他下载方式', currentPost:'解析当前帖子的视频', orUrl:'或粘贴推文链接', parseLink:'解析链接', footer:'原始 MP4 · 自选画质',
      settings:'偏好设置', language:'界面语言', languageAuto:'跟随浏览器', languageAutoCurrent:'跟随浏览器（当前：{language}）', languageZh:'简体中文', languageEn:'English', languageHelp:'仅影响插件界面，不影响视频内容。',
      qualitySystem:'系统默认（优先不超过 480P）', qualitySmallest:'最省空间（最低码率）', quality360:'优先 360P', quality480:'优先 480P', quality720:'优先 720P', quality1080:'优先 1080P', qualityHighest:'最高清晰度',
      savePending:'保存中…', qualitySaved:'默认画质已保存', saveFailed:'保存失败：{error}', preferenceFailed:'读取设置失败：{error}', communicationError:'扩展通信失败',
      unknownSize:'大小未知', selectAll:'全选', selectedCount:'已选 {count} 个视频', sizeHint:'勾选后显示预计大小', unknownCount:'{count} 项大小未知 · 压缩前', sizeTotal:'{prefix}{size}{unknown} · 压缩前', approximate:'约 ', plusUnknown:' + {count} 项未知', sizeExplain:'根据所选视频的当前画质，累计原始 MP4 的大小。优先使用文件真实大小，否则按照码率和时长估算。',
      batchDownload:'批量下载', batchLimit:'每批最多 {count} 个', zipCount:'打包 ZIP ({count})', download:'下载', started:'已开始', queuedChrome:'已交给 Chrome 下载管理器', downloadFailed:'下载失败：{error}', unknownAuthor:'未知博主', postId:'推文 ID {id}', originalPost:'原帖 ↗', selectVideo:'选择 {author} 的视频 {index}', video:'视频', videoIndex:'视频 {index}', noVideos:'没有找到可下载的视频', sniffResult:'识别到 {count} 条视频推文。可以勾选后批量下载。', chooseQualityHint:'选择画质下载，不会更改默认设置。',
      openingZip:'正在打开打包页…', zipPrompt:'即将打开 ZIP 打包页面，选择一次保存位置即可。', zipOpened:'已打开打包页（{count} 个视频）。在新标签页中选择保存位置，之后无需逐个确认。', zipJobFailed:'无法创建打包任务：{error}', inputTweet:'请输入含 /status/数字 的推文链接。', queryingQuality:'正在查询可用画质…', noActiveTab:'未找到当前标签页', openTweet:'请先打开视频推文', findingVideos:'正在识别当前 X 页面…', switchToX:'请先切换到 X 页面，再点击嗅探。', refreshX:'无法读取当前页面，请刷新 X 页面后重试。', sniffFailed:'页面嗅探失败', noSeenVideo:'没有发现视频，请滚动到视频推文或播放后再试。', noDownloadable:'找到视频推文，但没有可下载的 MP4。尝试播放后重新嗅探。',
      theaterOpen:'网页内放大播放', theaterClose:'关闭剧场模式', inlineDownload:'下载视频 · 选择画质', dialogTitle:'选择下载画质', dialogSubtitle:'选择合适的清晰度和文件大小', close:'关闭', loadingMp4:'正在读取可用的 MP4 画质…', offeredQuality:'只显示 X 实际提供的清晰度 · ', viewPost:'查看原帖', defaultTag:'默认', saved:'已保存', selectQualityToDownload:'点击需要的清晰度下载（不会修改默认设置）', bitrate:'视频码率 {rate} kbps', originalSave:'源文件直接保存，不压缩', querying:'查询中…', sentFile:'已交给 Chrome 下载管理器：{file}', sizeHead:'从服务器 Content-Length 获取', sizeEstimated:'按照视频码率、时长粗略估算，实际大小可能不同', hlsInfo:'部分帖子仅提供 HLS 分片，或公开媒体接口暂时不可用。可在 Mac 上通过 yt-dlp 下载，并限制清晰度。', copyYtdlp:'复制 480P 的 yt-dlp 下载命令', copied:'命令已复制', copyFailed:'复制失败：请在安全上下文中重试', invalidPost:'无效帖子 ID', notPostPage:'当前不是推文详情页。请在视频帖子下点击下载图标', dialogAccessible:'下载 X 视频',
      zipTitle:'X 视频助手 · 批量打包', zipBrand:'X 视频助手 · 批量打包', zipHeading:'一次保存，下载全部视频', zipSubtitle:'所选视频将合并为一个 ZIP 文件。MP4 保持原画质，不重新编码；压缩包主要用于集中保存，不会显著减小总体积。', zipLoading:'正在读取任务…', zipPrivacy:'仅保存在本机 · 不上传到其他服务器', zipStart:'选择保存位置并开始', zipCancel:'取消下载', zipFootnote:'使用 Chrome 的文件保存对话框一次选择位置，随后逐条读取视频并直接写入 ZIP，不需要每条视频单独确认。打包过程中请保持此标签页打开；经典 ZIP 格式单包上限约 4 GB。', zipConnecting:'正在连接', zipWriting:'正在写入', zipSkipping:'跳过无法获取的视频', zipComplete:'已完成', zipProgress:'{state} {index}/{total}：{name} · 已读取 {size}', zipBadJob:'无效的下载任务链接', zipSelected:'已选择 {count} 个 MP4 视频', zipUnsupported:'此 Chrome 版本不支持一次选择位置并流式写入 ZIP，请更新 Chrome 浏览器。', zipDescription:'ZIP 压缩包', zipPickerError:'无法打开保存窗口：{error}', zipCancelled:'用户取消', zipSuccess:'保存成功：{count} 个视频，共 {size}。{extra}', zipSkipped:'另有 {count} 个源视频无法读取，已跳过：{names}', zipSaved:'已保存', zipAbort:'已取消。未完成的 ZIP 不会保存。', zipFailure:'打包失败：{error}。未保存不完整的 ZIP，可重试。', zipLoadError:'无法读取下载任务：{error}',
      errHttp:'X 视频信息接口返回 HTTP {status}', zipErrRange:'请勾选 1–20 个视频', zipErrSource:'仅支持 X 官方 MP4 视频链接', zipErrId:'推文 ID 无效', zipErrTooMany:'ZIP 视频数超出范围', zipErrTooLarge:'ZIP 超过约 4 GB 限制，请分批下载', zipErrAborted:'下载已取消', zipErrEntryTooLarge:'单条视频超过 ZIP 格式大小限制', zipErrNoSuccess:'没有成功获取到 MP4，未生成空 ZIP',
      errPrivate:'这条帖子不可公开访问', errBadId:'无效的帖子 ID', errMP4:'未能取得 MP4：{error}。可以尝试播放一次视频后重试。', errNoMP4:'此视频没有可下载的 MP4 版本，可能只有 HLS 流。可使用 yt-dlp 下载。', errVideoSource:'仅允许下载来自 video.twimg.com 的 MP4 文件', errIdWrong:'帖子 ID 不正确', errChromeDownload:'Chrome 未能开始下载', errBatchRange:'每批请选择 1–{count} 个视频', errInvalidLink:'存在无效的视频链接或帖子 ID', errNoZipVideo:'没有可打包的视频', errParameter:'参数错误', errUnsupported:'不支持的操作'
    },
    en: {
      name:'X Video Assistant', tagline:'Theater mode · Quality options · Batch saves', qualityDefault:'Default quality', qualityRemember:'Saved automatically', defaultHint:'Prefers up to 480p by default. Change anytime.',
      downloads:'Download videos', sniff:'Detect videos on this page', otherWays:'Other download options', currentPost:'Find videos in this post', orUrl:'Or paste a post URL', parseLink:'Analyze URL', footer:'Original MP4 · Choose quality',
      settings:'Preferences', language:'Interface language', languageAuto:'Follow browser', languageAutoCurrent:'Follow browser (currently: {language})', languageZh:'简体中文', languageEn:'English', languageHelp:'Only changes the extension interface, not the video content.',
      qualitySystem:'Auto (prefer 480p or lower)', qualitySmallest:'Smallest file (lowest bitrate)', quality360:'Prefer 360p', quality480:'Prefer 480p', quality720:'Prefer 720p', quality1080:'Prefer 1080p', qualityHighest:'Highest quality',
      savePending:'Saving…', qualitySaved:'Default quality saved', saveFailed:'Could not save: {error}', preferenceFailed:'Could not read settings: {error}', communicationError:'Extension connection failed',
      unknownSize:'Size unknown', selectAll:'Select all', selectedCount:'{count} videos selected', sizeHint:'Select videos to see estimated size', unknownCount:'{count} sizes unknown · before ZIP', sizeTotal:'{prefix}{size}{unknown} · before ZIP', approximate:'Est. ', plusUnknown:' + {count} unknown', sizeExplain:'Total uncompressed MP4 size for selected qualities. Uses exact file sizes when available, otherwise estimates from bitrate and duration.',
      batchDownload:'Batch download', batchLimit:'Max {count} per batch', zipCount:'Save ZIP ({count})', download:'Download', started:'Started', queuedChrome:'Sent to Chrome downloads', downloadFailed:'Download failed: {error}', unknownAuthor:'Unknown creator', postId:'Post ID {id}', originalPost:'Open post ↗', selectVideo:'Select video {index} by {author}', video:'Video', videoIndex:'Video {index}', noVideos:'No downloadable videos found', sniffResult:'Found {count} video posts. Select videos to save them together.', chooseQualityHint:'Choose a quality to download. Your default stays unchanged.',
      openingZip:'Opening ZIP exporter…', zipPrompt:'A ZIP export tab will open. Select a save location once.', zipOpened:'ZIP exporter opened for {count} videos. Choose the save location in the new tab just once.', zipJobFailed:'Could not create ZIP job: {error}', inputTweet:'Paste a post URL containing /status/ followed by its ID.', queryingQuality:'Checking available qualities…', noActiveTab:'No active tab found', openTweet:'Open a video post first', findingVideos:'Scanning the current X page…', switchToX:'Switch to an X page before scanning.', refreshX:'Cannot access this page. Refresh X and try again.', sniffFailed:'Could not scan this page', noSeenVideo:'No videos detected. Scroll to a video post or play a video, then retry.', noDownloadable:'Found video posts but no downloadable MP4. Try playing a video and scanning again.',
      theaterOpen:'Expand video in page', theaterClose:'Exit theater mode', inlineDownload:'Download video · Choose quality', dialogTitle:'Choose video quality', dialogSubtitle:'Find the right resolution and file size', close:'Close', loadingMp4:'Loading available MP4 qualities…', offeredQuality:'Only qualities provided by X · ', viewPost:'View original post', defaultTag:'Default', saved:'Saved', selectQualityToDownload:'Click a quality to download (does not change your default)', bitrate:'Video bitrate: {rate} kbps', originalSave:'Original MP4, no re-encoding', querying:'Checking…', sentFile:'Sent to Chrome downloads: {file}', sizeHead:'Reported by server Content-Length', sizeEstimated:'Estimated from video bitrate and duration; actual size may differ', hlsInfo:'Some posts offer only HLS segments, or the public media endpoint may be unavailable. You can use yt-dlp on Mac to download at a limited resolution.', copyYtdlp:'Copy 480p yt-dlp command', copied:'Command copied', copyFailed:'Could not copy: try again in a secure context', invalidPost:'Invalid post ID', notPostPage:'This is not a post page. Use the download icon on a video post.', dialogAccessible:'Download X video',
      zipTitle:'X Video Assistant · ZIP export', zipBrand:'X Video Assistant · ZIP export', zipHeading:'Save all videos at once', zipSubtitle:'The selected videos will be bundled into one ZIP. MP4 files keep their original quality and are not re-encoded. ZIP packaging generally does not reduce the total file size.', zipLoading:'Loading task…', zipPrivacy:'Saved locally · Never uploaded to a third-party server', zipStart:'Choose where to save & start', zipCancel:'Cancel download', zipFootnote:'Use Chrome’s save dialog once, then the videos are streamed directly into one ZIP file. Keep this tab open while saving. Classic ZIP files have a limit of approximately 4 GB.', zipConnecting:'Connecting', zipWriting:'Writing', zipSkipping:'Skipping an unavailable video', zipComplete:'Finished', zipProgress:'{state} {index}/{total}: {name} · {size} read', zipBadJob:'Invalid download task link', zipSelected:'{count} MP4 videos selected', zipUnsupported:'This version of Chrome does not support the one-dialog streaming ZIP export. Please update Chrome.', zipDescription:'ZIP archive', zipPickerError:'Could not open the save dialog: {error}', zipCancelled:'Cancelled', zipSuccess:'Saved {count} videos ({size}). {extra}', zipSkipped:'Skipped {count} unavailable videos: {names}', zipSaved:'Saved', zipAbort:'Cancelled. The incomplete ZIP was not saved.', zipFailure:'ZIP export failed: {error}. Incomplete files are not saved. You can retry.', zipLoadError:'Could not load download task: {error}',
      errHttp:'X video info endpoint returned HTTP {status}', zipErrRange:'Select 1–20 videos', zipErrSource:'Only official X MP4 video URLs are supported', zipErrId:'Invalid post ID', zipErrTooMany:'Too many videos for one ZIP', zipErrTooLarge:'ZIP exceeds the ~4 GB limit. Split into smaller batches.', zipErrAborted:'Download cancelled', zipErrEntryTooLarge:'One video exceeds the classic ZIP size limit', zipErrNoSuccess:'No MP4 files could be fetched; an empty ZIP was not created',
      errPrivate:'This post is not publicly accessible', errBadId:'Invalid post ID', errMP4:'Could not get an MP4: {error}. Try playing the video and retry.', errNoMP4:'This video has no downloadable MP4. It may only offer an HLS stream. Try yt-dlp.', errVideoSource:'Only MP4 files from video.twimg.com can be downloaded', errIdWrong:'Invalid post ID', errChromeDownload:'Chrome could not start the download', errBatchRange:'Select 1–{count} videos per batch', errInvalidLink:'Invalid video URL or post ID', errNoZipVideo:'No videos to package', errParameter:'Invalid parameters', errUnsupported:'Unsupported operation'
    }
  };
  const QUALITY_KEYS={system:'qualitySystem',smallest:'qualitySmallest','360':'quality360','480':'quality480','720':'quality720','1080':'quality1080',highest:'qualityHighest'};
  const normalizePreference = value => ['auto','zh','en'].includes(value) ? value : 'auto';
  const browserLanguage = () => {
    const language = (typeof chrome !== 'undefined' && chrome.i18n?.getUILanguage?.()) || navigator.language || 'en';
    return /^zh(?:[-_]|$)/i.test(language) ? 'zh' : 'en';
  };
  let preference='auto';
  let locale=browserLanguage();
  const subscribers=new Set();
  const resolve = p => p === 'auto' ? browserLanguage() : p;
  const t = (key, args={}) => {
    const template=dictionaries[locale]?.[key] ?? dictionaries.en[key] ?? key;
    return template.replace(/\{(\w+)\}/g,(_,k)=>String(args[k] ?? ''));
  };
  function change(p) {
    const next=normalizePreference(p);
    const resolved=resolve(next);
    if(preference===next && locale===resolved)return;
    preference=next;
    locale=resolved;
    subscribers.forEach(fn=>{try{fn(locale);}catch(err){console.error(err);}});
  }
  const ready=(async()=>{
    try { const r=await chrome.storage.local.get(KEY); change(r[KEY]); }
    catch{change('auto');}
  })();
  async function save(p) {
    const next=normalizePreference(p);
    await chrome.storage.local.set({[KEY]:next});
    change(next);
  }
  if(chrome.storage?.onChanged?.addListener)chrome.storage.onChanged.addListener((changes, area)=>{
    if(area==='local'&&changes[KEY])change(changes[KEY].newValue);
  });
  const onChange=fn=>{subscribers.add(fn);return()=>subscribers.delete(fn);};
  function apply(root=document) {
    document.documentElement.lang=locale==='zh'?'zh-CN':'en';
    root.querySelectorAll('[data-i18n]').forEach(el=>{el.textContent=t(el.dataset.i18n);});
    root.querySelectorAll('[data-i18n-title]').forEach(el=>{el.title=t(el.dataset.i18nTitle);});
    root.querySelectorAll('[data-i18n-aria]').forEach(el=>{el.setAttribute('aria-label',t(el.dataset.i18nAria));});
    root.querySelectorAll('[data-i18n-placeholder]').forEach(el=>{el.placeholder=t(el.dataset.i18nPlaceholder);});
  }
  globalThis.XVAi18n=Object.freeze({KEY,QUALITY_KEYS,ready,save,t,apply,onChange,browserLanguage,normalizePreference,get locale(){return locale;},get preference(){return preference;}});
})();
