/**
 * QDM Content Script - IDM-Style Video Detection & Download Banner
 * 
 * Detects video and audio elements on web pages and shows a floating
 * download button overlay (like IDM does). Also grabs page links on request.
 */

(() => {
  const QDM_PORT = 8597;
  const QDM_HOST = `http://127.0.0.1:${QDM_PORT}`;
  const BANNER_ID = 'qdm-download-banner';
  const MIN_VIDEO_SIZE = 1024 * 100; // 100KB minimum to show banner

  let isQdmRunning = false;
  let currentBannerTarget = null;
  let bannerTimeout = null;

  // ── Check if QDM is running ────────────────────────────────
  async function checkQDM() {
    try {
      const res = await fetch(`${QDM_HOST}/sync`, { method: 'GET', signal: AbortSignal.timeout(2000) });
      isQdmRunning = res.ok;
    } catch {
      isQdmRunning = false;
    }
  }
  checkQDM();
  setInterval(checkQDM, 10000);

  // ── Create download banner ─────────────────────────────────
  function createBanner() {
    if (document.getElementById(BANNER_ID)) return document.getElementById(BANNER_ID);

    const banner = document.createElement('div');
    banner.id = BANNER_ID;
    banner.innerHTML = `
      <div style="
        display: flex; align-items: center; gap: 6px;
        background: linear-gradient(135deg, #6c5ce7, #a855f7);
        color: white; padding: 6px 12px; border-radius: 8px;
        font-family: -apple-system, 'Segoe UI', sans-serif;
        font-size: 12px; font-weight: 600;
        box-shadow: 0 4px 20px rgba(108, 92, 231, 0.5);
        cursor: pointer; user-select: none;
        transition: transform 0.15s, opacity 0.2s;
        white-space: nowrap;
      " id="qdm-banner-inner">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
          <polyline points="7 10 12 15 17 10"/>
          <line x1="12" y1="15" x2="12" y2="3"/>
        </svg>
        <span>Download with QDM</span>
      </div>
    `;
    
    Object.assign(banner.style, {
      position: 'absolute',
      zIndex: '2147483647',
      pointerEvents: 'auto',
      opacity: '0',
      transform: 'scale(0.9)',
      transition: 'opacity 0.2s, transform 0.2s',
    });

    banner.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      if (currentBannerTarget) {
        downloadMedia(currentBannerTarget);
      }
    });

    banner.addEventListener('mouseenter', () => {
      clearTimeout(bannerTimeout);
      const inner = document.getElementById('qdm-banner-inner');
      if (inner) inner.style.transform = 'scale(1.05)';
    });

    banner.addEventListener('mouseleave', () => {
      const inner = document.getElementById('qdm-banner-inner');
      if (inner) inner.style.transform = 'scale(1)';
      scheduleBannerHide();
    });

    document.body.appendChild(banner);
    return banner;
  }

  function showBanner(target, mediaUrl) {
    if (!isQdmRunning) return;
    
    const banner = createBanner();
    currentBannerTarget = mediaUrl;

    const rect = target.getBoundingClientRect();
    const scrollX = window.scrollX;
    const scrollY = window.scrollY;

    // Position at top-right of the video element
    banner.style.top = (rect.top + scrollY + 8) + 'px';
    banner.style.left = (rect.right + scrollX - banner.offsetWidth - 8) + 'px';
    
    // Ensure visible
    requestAnimationFrame(() => {
      banner.style.opacity = '1';
      banner.style.transform = 'scale(1)';
    });

    clearTimeout(bannerTimeout);
    scheduleBannerHide();
  }

  function hideBanner() {
    const banner = document.getElementById(BANNER_ID);
    if (banner) {
      banner.style.opacity = '0';
      banner.style.transform = 'scale(0.9)';
    }
  }

  function scheduleBannerHide() {
    clearTimeout(bannerTimeout);
    bannerTimeout = setTimeout(hideBanner, 3000);
  }

  // ── Send to QDM ───────────────────────────────────────────
  async function downloadMedia(url) {
    if (!isQdmRunning || !url) return;
    try {
      await fetch(`${QDM_HOST}/download`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: url,
          file: '',
          tabUrl: window.location.href,
          tabId: '',
        }),
      });
      // Visual feedback
      const inner = document.getElementById('qdm-banner-inner');
      if (inner) {
        inner.querySelector('span').textContent = '✓ Sent to QDM';
        inner.style.background = 'linear-gradient(135deg, #00b894, #00cec9)';
        setTimeout(hideBanner, 1500);
      }
    } catch (err) {
      console.warn('[QDM] Failed to send download:', err);
    }
  }

  async function sendMediaToQDM(url, type) {
    if (!isQdmRunning || !url) return;
    try {
      await fetch(`${QDM_HOST}/media`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: url,
          file: '',
          tabUrl: window.location.href,
          tabId: '',
          contentType: type || '',
        }),
      });
    } catch {}
  }

  // ── Video/Audio Element Detection ──────────────────────────
  function getMediaSrc(el) {
    // Direct src
    if (el.src && !el.src.startsWith('blob:') && !el.src.startsWith('data:')) {
      return el.src;
    }
    // currentSrc (may be set by <source> children)
    if (el.currentSrc && !el.currentSrc.startsWith('blob:') && !el.currentSrc.startsWith('data:')) {
      return el.currentSrc;
    }
    // Check <source> children
    const sources = el.querySelectorAll('source');
    for (const source of sources) {
      if (source.src && !source.src.startsWith('blob:') && !source.src.startsWith('data:')) {
        return source.src;
      }
    }
    return null;
  }

  function attachBannerToMedia(el) {
    if (el._qdmAttached) return;
    el._qdmAttached = true;

    el.addEventListener('mouseenter', () => {
      const url = getMediaSrc(el);
      if (url) {
        showBanner(el, url);
        sendMediaToQDM(url, el.tagName === 'VIDEO' ? 'video' : 'audio');
      }
    });

    el.addEventListener('mouseleave', () => {
      scheduleBannerHide();
    });

    // Also detect when video starts playing (for dynamically loaded sources)
    el.addEventListener('loadeddata', () => {
      const url = getMediaSrc(el);
      if (url) {
        sendMediaToQDM(url, el.tagName === 'VIDEO' ? 'video' : 'audio');
      }
    });
  }

  function scanForMedia() {
    // Scan video elements
    document.querySelectorAll('video, audio').forEach(el => {
      attachBannerToMedia(el);
    });

    // Scan iframes for embedded players (YouTube, Vimeo, etc.)
    document.querySelectorAll('iframe').forEach(iframe => {
      if (iframe._qdmAttached) return;
      iframe._qdmAttached = true;

      const src = iframe.src || '';
      const isVideoEmbed = /youtube\.com\/embed|player\.vimeo\.com|dailymotion\.com\/embed|facebook\.com\/plugins\/video/i.test(src);
      
      if (isVideoEmbed) {
        iframe.addEventListener('mouseenter', () => {
          showBanner(iframe, window.location.href);
        });
        iframe.addEventListener('mouseleave', () => {
          scheduleBannerHide();
        });
      }
    });
  }

  // Initial scan
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', scanForMedia);
  } else {
    scanForMedia();
  }

  // Watch for dynamically added media elements
  const observer = new MutationObserver((mutations) => {
    let needsScan = false;
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType === 1) {
          if (node.tagName === 'VIDEO' || node.tagName === 'AUDIO' || node.tagName === 'IFRAME') {
            needsScan = true;
            break;
          }
          if (node.querySelector && node.querySelector('video, audio, iframe')) {
            needsScan = true;
            break;
          }
        }
      }
      if (needsScan) break;
    }
    if (needsScan) scanForMedia();
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });

  // ── Message handler for link grabbing ─────────────────────
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'grab-links') {
      const links = [];
      const seen = new Set();
      
      // Collect all <a> links
      document.querySelectorAll('a[href]').forEach(a => {
        const url = a.href;
        if (url && !seen.has(url) && (url.startsWith('http://') || url.startsWith('https://'))) {
          seen.add(url);
          links.push({
            url: url,
            file: a.download || a.textContent?.trim().substring(0, 100) || '',
            tabUrl: window.location.href,
          });
        }
      });

      // Collect media sources
      document.querySelectorAll('video source, audio source, video[src], audio[src]').forEach(el => {
        const url = el.src || el.getAttribute('src');
        if (url && !seen.has(url) && !url.startsWith('blob:')) {
          seen.add(url);
          links.push({ url, file: '', tabUrl: window.location.href });
        }
      });

      chrome.runtime.sendMessage({ action: 'batch-links', links });
      sendResponse({ count: links.length });
    }
    return true;
  });
})();
