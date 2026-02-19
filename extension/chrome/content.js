/**
 * QDM Content Script
 * 
 * 1. IDM-style video download banner on hover
 * 2. YouTube page parser — extracts all video formats from ytInitialPlayerResponse
 * 3. Link grabbing on request
 */

(() => {
  const QDM_PORT = 8597;
  const QDM_HOST = `http://127.0.0.1:${QDM_PORT}`;
  const BANNER_ID = 'qdm-download-banner';

  let isQdmRunning = false;
  let currentBannerTarget = null;
  let bannerTimeout = null;
  let ytParsed = false;
  let lastYtUrl = '';

  // ── Check QDM ──────────────────────────────────────────────
  async function checkQDM() {
    try {
      const res = await fetch(`${QDM_HOST}/sync`, { method: 'GET', signal: AbortSignal.timeout(2000) });
      isQdmRunning = res.ok;
    } catch { isQdmRunning = false; }
  }
  checkQDM();
  setInterval(checkQDM, 10000);

  // ── Send to QDM ───────────────────────────────────────────
  async function sendMedia(data) {
    if (!isQdmRunning) return;
    try {
      await fetch(`${QDM_HOST}/media`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
    } catch {}
  }

  async function sendDownload(url) {
    if (!isQdmRunning || !url) return;
    try {
      await fetch(`${QDM_HOST}/download`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, file: '', tabUrl: location.href, tabId: '' }),
      });
    } catch {}
  }

  // ── YouTube Parser (like IDM / yt-dlp) ────────────────────
  // Extracts video formats from ytInitialPlayerResponse embedded in page JS
  
  const ITAG_QUALITY = {
    // Video + Audio (legacy progressive)
    '18': '360p', '22': '720p',
    // Video only (DASH MP4)
    '133': '240p', '134': '360p', '135': '480p', '136': '720p',
    '137': '1080p', '138': '4320p', '160': '144p',
    '264': '1440p', '266': '2160p',
    '298': '720p60', '299': '1080p60',
    // Video only (DASH VP9/WebM)
    '242': '240p', '243': '360p', '244': '480p', '247': '720p',
    '248': '1080p', '271': '1440p', '313': '2160p',
    '302': '720p60', '303': '1080p60', '308': '1440p60', '315': '2160p60',
    // AV1
    '394': '144p', '395': '240p', '396': '360p', '397': '480p',
    '398': '720p', '399': '1080p', '400': '1440p', '401': '2160p',
    // Audio only
    '139': '48kbps', '140': '128kbps', '141': '256kbps',
    '171': 'Vorbis 128k', '249': 'Opus 50k', '250': 'Opus 70k', '251': 'Opus 160k',
  };

  function formatSize(bytes) {
    if (!bytes || bytes <= 0) return '';
    const k = 1024;
    const s = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + s[i];
  }

  function parseYouTubeFormats() {
    if (!location.hostname.includes('youtube.com') || !location.pathname.startsWith('/watch')) return;
    if (lastYtUrl === location.href && ytParsed) return;
    lastYtUrl = location.href;
    ytParsed = false;

    // Method 1: Extract from ytInitialPlayerResponse in page scripts
    let playerResponse = null;

    // Try window object (may be available)
    try {
      const scripts = document.querySelectorAll('script');
      for (const script of scripts) {
        const text = script.textContent || '';
        
        // Look for ytInitialPlayerResponse
        let match = text.match(/ytInitialPlayerResponse\s*=\s*(\{.+?\});/s);
        if (!match) match = text.match(/ytInitialPlayerResponse\s*=\s*(\{.+?\})\s*;?\s*(?:var|let|const|if|<\/script)/s);
        
        if (match) {
          try { playerResponse = JSON.parse(match[1]); } catch {}
          break;
        }
      }
    } catch {}

    if (!playerResponse) {
      // Method 2: Try ytcfg.set or ytplayer
      try {
        const scripts = document.querySelectorAll('script');
        for (const script of scripts) {
          const text = script.textContent || '';
          const match = text.match(/"streamingData"\s*:\s*(\{[^]*?"adaptiveFormats"\s*:\s*\[[^]*?\]\s*\})/);
          if (match) {
            try { playerResponse = { streamingData: JSON.parse(match[1]) }; } catch {}
            break;
          }
        }
      } catch {}
    }

    if (!playerResponse?.streamingData) {
      // Retry after page loads more
      if (!ytParsed) setTimeout(parseYouTubeFormats, 3000);
      return;
    }

    ytParsed = true;
    const title = document.title.replace(/ - YouTube$/, '').trim() || 'YouTube Video';
    const streamingData = playerResponse.streamingData;
    const formats = [
      ...(streamingData.formats || []),
      ...(streamingData.adaptiveFormats || []),
    ];

    // Send each format to QDM as a media item
    const seen = new Set();
    for (const fmt of formats) {
      const url = fmt.url;
      if (!url || seen.has(fmt.itag)) continue;
      seen.add(fmt.itag);

      const itag = String(fmt.itag);
      const quality = ITAG_QUALITY[itag] || fmt.qualityLabel || fmt.quality || '';
      const mime = fmt.mimeType || '';
      const size = parseInt(fmt.contentLength || '0');
      const isAudio = mime.startsWith('audio/');
      const isVideo = mime.startsWith('video/');
      const codec = mime.match(/codecs="([^"]+)"/)?.[1] || '';

      let description = 'YouTube';
      if (size > 0) description += ` • ${formatSize(size)}`;
      if (quality) description += ` • ${quality}`;
      if (codec) description += ` (${codec.split(',')[0]})`;

      const ext = isAudio ? '.m4a' : '.mp4';
      const name = `${title}${ext}`;

      sendMedia({
        url,
        file: name,
        tabUrl: location.href,
        tabId: '',
        contentType: mime,
        contentLength: size,
        quality: quality + (codec ? ` ${codec.split(',')[0]}` : ''),
      });
    }
  }

  // ── Video Banner (IDM-style overlay) ──────────────────────
  function createBanner() {
    if (document.getElementById(BANNER_ID)) return document.getElementById(BANNER_ID);
    const banner = document.createElement('div');
    banner.id = BANNER_ID;
    banner.innerHTML = `<div style="display:flex;align-items:center;gap:6px;background:linear-gradient(135deg,#6c5ce7,#a855f7);color:#fff;padding:6px 12px;border-radius:8px;font-family:-apple-system,'Segoe UI',sans-serif;font-size:12px;font-weight:600;box-shadow:0 4px 20px rgba(108,92,231,0.5);cursor:pointer;user-select:none;transition:transform .15s,opacity .2s;white-space:nowrap" id="qdm-banner-inner"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg><span>Download with QDM</span></div>`;
    Object.assign(banner.style, { position:'absolute', zIndex:'2147483647', pointerEvents:'auto', opacity:'0', transform:'scale(0.9)', transition:'opacity .2s,transform .2s' });
    banner.addEventListener('click', e => { e.stopPropagation(); e.preventDefault(); if (currentBannerTarget) sendDownload(currentBannerTarget); hideBanner(); });
    banner.addEventListener('mouseenter', () => { clearTimeout(bannerTimeout); });
    banner.addEventListener('mouseleave', () => { scheduleBannerHide(); });
    document.body.appendChild(banner);
    return banner;
  }

  function showBanner(target, url) {
    if (!isQdmRunning) return;
    const banner = createBanner();
    currentBannerTarget = url;
    const rect = target.getBoundingClientRect();
    banner.style.top = (rect.top + window.scrollY + 8) + 'px';
    banner.style.left = (rect.right + window.scrollX - 180) + 'px';
    requestAnimationFrame(() => { banner.style.opacity = '1'; banner.style.transform = 'scale(1)'; });
    clearTimeout(bannerTimeout);
    scheduleBannerHide();
  }

  function hideBanner() {
    const b = document.getElementById(BANNER_ID);
    if (b) { b.style.opacity = '0'; b.style.transform = 'scale(0.9)'; }
  }
  function scheduleBannerHide() { clearTimeout(bannerTimeout); bannerTimeout = setTimeout(hideBanner, 3000); }

  // ── Media element detection ───────────────────────────────
  function getMediaSrc(el) {
    if (el.src && !el.src.startsWith('blob:') && !el.src.startsWith('data:')) return el.src;
    if (el.currentSrc && !el.currentSrc.startsWith('blob:') && !el.currentSrc.startsWith('data:')) return el.currentSrc;
    for (const s of el.querySelectorAll('source')) {
      if (s.src && !s.src.startsWith('blob:') && !s.src.startsWith('data:')) return s.src;
    }
    return null;
  }

  function attachBanner(el) {
    if (el._qdm) return;
    el._qdm = true;
    el.addEventListener('mouseenter', () => {
      const url = getMediaSrc(el);
      if (url) showBanner(el, url);
    });
    el.addEventListener('mouseleave', () => scheduleBannerHide());
  }

  function scanMedia() {
    document.querySelectorAll('video, audio').forEach(attachBanner);
    // Embedded players
    document.querySelectorAll('iframe').forEach(iframe => {
      if (iframe._qdm) return;
      iframe._qdm = true;
      if (/youtube\.com\/embed|player\.vimeo\.com|dailymotion\.com\/embed/i.test(iframe.src || '')) {
        iframe.addEventListener('mouseenter', () => showBanner(iframe, location.href));
        iframe.addEventListener('mouseleave', () => scheduleBannerHide());
      }
    });
  }

  // ── Init ──────────────────────────────────────────────────
  function init() {
    scanMedia();
    parseYouTubeFormats();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Watch for SPA navigation (YouTube is SPA)
  let lastHref = location.href;
  new MutationObserver(() => {
    if (location.href !== lastHref) {
      lastHref = location.href;
      ytParsed = false;
      setTimeout(() => { scanMedia(); parseYouTubeFormats(); }, 2000);
    }
    scanMedia();
  }).observe(document.documentElement, { childList: true, subtree: true });

  // Also try parsing after a delay (YT loads data async)
  setTimeout(parseYouTubeFormats, 5000);
  setTimeout(parseYouTubeFormats, 10000);

  // ── Link grabbing ─────────────────────────────────────────
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action === 'grab-links') {
      const links = [], seen = new Set();
      document.querySelectorAll('a[href]').forEach(a => {
        const url = a.href;
        if (url && !seen.has(url) && (url.startsWith('http://') || url.startsWith('https://'))) {
          seen.add(url);
          links.push({ url, file: a.download || a.textContent?.trim().substring(0, 100) || '', tabUrl: location.href });
        }
      });
      chrome.runtime.sendMessage({ action: 'batch-links', links });
      sendResponse({ count: links.length });
    }
    return true;
  });
})();
