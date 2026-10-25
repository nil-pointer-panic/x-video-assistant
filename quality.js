/* Shared by the X page content script, extension popup, and tests.
   The "system" default is this extension's conservative 480p ceiling,
   NOT a claim to detect the adaptive playback quality chosen by X. */
(() => {
  const STORAGE_KEY = 'defaultQuality';
  const DEFAULT_QUALITY = 'system';
  const CHOICES = Object.freeze([
    { value: 'system', label: '系统默认（优先不超过 480P）' },
    { value: 'smallest', label: '最省空间（最低码率）' },
    { value: '360', label: '优先 360P' },
    { value: '480', label: '优先 480P' },
    { value: '720', label: '优先 720P' },
    { value: '1080', label: '优先 1080P' },
    { value: 'highest', label: '最高清晰度' }
  ]);
  const valid = new Set(CHOICES.map(q => q.value));
  const normalize = value => valid.has(String(value)) ? String(value) : DEFAULT_QUALITY;

  function pickIndex(variants, requested = DEFAULT_QUALITY) {
    if (!Array.isArray(variants) || !variants.length) return -1;
    const quality = normalize(requested);
    const candidates = variants.map((v, i) => ({
      i, height: Number(v?.height) || 0, bitrate: Number(v?.bitrate) || 0,
      width: Number(v?.width) || 0
    }));
    if (quality === 'smallest') {
      // Prefer known positive bitrates to unknown bitrate=0.
      return [...candidates].sort((a,b) =>
        (a.bitrate || Infinity) - (b.bitrate || Infinity) ||
        a.height - b.height || a.width - b.width)[0].i;
    }
    if (quality === 'highest') {
      return [...candidates].sort((a,b) => b.height-a.height || b.bitrate-a.bitrate || b.width-a.width)[0].i;
    }
    const target = quality === 'system' ? 480 : Number(quality);
    const withHeight = candidates.filter(v => v.height > 0);
    if (!withHeight.length) {
      return [...candidates].sort((a,b) => (a.bitrate || Infinity)-(b.bitrate || Infinity))[0].i;
    }
    const below = withHeight.filter(v => v.height <= target);
    if (below.length) {
      return below.sort((a,b) => b.height-a.height || b.bitrate-a.bitrate || b.width-a.width)[0].i;
    }
    // Nothing under the cap; choose the smallest available resolution.
    return withHeight.sort((a,b) => a.height-b.height || a.bitrate-b.bitrate || a.width-b.width)[0].i;
  }

  async function read() {
    const stored = await chrome.storage.local.get(STORAGE_KEY);
    return normalize(stored[STORAGE_KEY]);
  }
  async function save(value) {
    const quality = normalize(value);
    await chrome.storage.local.set({ [STORAGE_KEY]: quality });
    return quality;
  }
  globalThis.XVQSettings = Object.freeze({ STORAGE_KEY, DEFAULT_QUALITY, CHOICES, normalize, pickIndex, read, save });
})();
