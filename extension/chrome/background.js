/**
 * QDM Browser Extension - Background Service Worker
 * 
 * Intercepts file downloads and detects media streams.
 * Inspired by IDM's extension approach - intercepts downloads via
 * chrome.downloads API and media via webRequest.
 */

const QDM_PORT = 8597;
const QDM_HOST = `http://127.0.0.1:${QDM_PORT}`;

let qdmConfig = {
  enabled: true,
  fileExts: [],
  blockedHosts: [],
  requestFileExts: [],
  mediaTypes: ['audio/', 'video/'],
  tabsWatcher: ['.youtube.', '/watch?v='],
  videoList: [],
  matchingHosts: ['googlevideo'],
};

let isQdmRunning = false;

// ── File extensions that QDM should always intercept ───────
const DOWNLOAD_EXTENSIONS = [
  // Archives
  '.zip', '.rar', '.7z', '.tar', '.gz', '.bz2', '.xz', '.zst', '.cab',
  // Programs
  '.exe', '.msi', '.dmg', '.deb', '.rpm', '.appimage', '.apk', '.app',
  // Documents
  '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
  // Media
  '.mp3', '.flac', '.wav', '.aac', '.ogg', '.wma', '.m4a', '.opus',
  '.mp4', '.mkv', '.avi', '.mov', '.wmv', '.flv', '.webm', '.m4v',
  // Images (large)
  '.iso', '.img', '.bin', '.torrent',
  // Other
  '.epub', '.mobi',
];

// Content types that indicate downloadable files
const DOWNLOAD_CONTENT_TYPES = [
  'application/octet-stream',
  'application/zip', 'application/x-rar', 'application/x-7z-compressed',
  'application/gzip', 'application/x-tar',
  'application/pdf',
  'application/x-msdownload', 'application/x-msi',
  'application/x-apple-diskimage',
  'application/vnd.android.package-archive',
  'application/x-iso9660-image',
];

// ── Sync with QDM ──────────────────────────────────────────
async function syncWithQDM() {
  try {
    const res = await fetch(`${QDM_HOST}/sync`, { 
      method: 'GET',
      signal: AbortSignal.timeout(3000),
    });
    if (res.ok) {
      qdmConfig = await res.json();
      isQdmRunning = true;
    } else {
      isQdmRunning = false;
    }
  } catch {
    isQdmRunning = false;
  }
  // Update badge
  chrome.action.setBadgeText({ text: isQdmRunning ? '' : '!' });
  chrome.action.setBadgeBackgroundColor({ color: '#e17055' });
}

setInterval(syncWithQDM, 5000);
syncWithQDM();

// ── Send to QDM ────────────────────────────────────────────
async function sendToQDM(endpoint, data) {
  if (!isQdmRunning || !qdmConfig.enabled) return false;
  try {
    const res = await fetch(`${QDM_HOST}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) {
      try { qdmConfig = await res.json(); } catch {}
    }
    return res.ok;
  } catch {
    return false;
  }
}

// ── Should QDM intercept this URL? ─────────────────────────
function shouldIntercept(url, contentType, fileSize) {
  if (!url || url.startsWith('blob:') || url.startsWith('data:')) return false;
  
  const urlLower = url.toLowerCase();
  
  // Check file extension
  if (DOWNLOAD_EXTENSIONS.some(ext => urlLower.includes(ext))) return true;
  
  // Check extensions from QDM config
  if (qdmConfig.fileExts && qdmConfig.fileExts.some(ext => urlLower.includes(ext))) return true;
  
  // Check content type
  if (contentType) {
    const ct = contentType.toLowerCase();
    if (DOWNLOAD_CONTENT_TYPES.some(type => ct.includes(type))) return true;
    // application/x-* usually means download
    if (ct.startsWith('application/x-') && !ct.includes('javascript') && !ct.includes('json')) return true;
  }
  
  // Large files (> 5MB) with attachment disposition are likely downloads
  if (fileSize > 5 * 1024 * 1024) return true;
  
  return false;
}

// ── Download Interception (via chrome.downloads) ───────────
chrome.downloads.onCreated.addListener(async (downloadItem) => {
  if (!isQdmRunning || !qdmConfig.enabled) return;
  
  const url = downloadItem.url;
  if (!url || url.startsWith('blob:') || url.startsWith('data:')) return;
  
  // Check if we should intercept
  const intercept = shouldIntercept(
    url, 
    downloadItem.mime || '',
    downloadItem.totalBytes || downloadItem.fileSize || 0
  );
  
  if (intercept) {
    // Cancel Chrome's download immediately
    try {
      chrome.downloads.cancel(downloadItem.id);
      chrome.downloads.erase({ id: downloadItem.id });
    } catch {}

    // Get the tab info
    const tab = await getCurrentTab();
    
    // Send to QDM
    const sent = await sendToQDM('/download', {
      url: url,
      file: downloadItem.filename ? downloadItem.filename.split(/[/\\]/).pop() : '',
      method: 'GET',
      tabUrl: tab?.url || downloadItem.referrer || '',
      tabId: tab?.id?.toString() || '',
      contentType: downloadItem.mime || '',
      contentLength: downloadItem.totalBytes || 0,
    });

    if (sent) {
      // Show notification
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icons/icon128.png',
        title: 'QDM',
        message: `Download intercepted: ${downloadItem.filename?.split(/[/\\]/).pop() || url.split('/').pop()}`,
      });
    }
  }
});

// ── Media Detection (via webRequest) ───────────────────────
chrome.webRequest.onHeadersReceived.addListener(
  (details) => {
    if (!isQdmRunning || !qdmConfig.enabled) return;
    if (details.type === 'main_frame' || details.type === 'sub_frame') return;

    const contentType = getHeader(details.responseHeaders, 'content-type') || '';
    const contentLength = parseInt(getHeader(details.responseHeaders, 'content-length') || '0');
    const url = details.url;

    // Detect media content
    const isAudioVideo = qdmConfig.mediaTypes.some(type => contentType.toLowerCase().includes(type));
    const isMediaUrl = qdmConfig.requestFileExts?.some(ext => url.toLowerCase().includes(ext));
    const isMatchingHost = qdmConfig.matchingHosts?.some(host => url.toLowerCase().includes(host));

    if (isAudioVideo || isMediaUrl || isMatchingHost) {
      // Skip tiny files (< 100KB, probably not real media)
      if (contentLength > 0 && contentLength < 102400) return;
      // Skip tracking pixels and analytics
      if (contentType.includes('image/') && contentLength < 1024000) return;

      const responseHeaders = {};
      if (details.responseHeaders) {
        details.responseHeaders.forEach(h => {
          responseHeaders[h.name.toLowerCase()] = h.value || '';
        });
      }

      sendToQDM('/media', {
        url: details.url,
        file: '',
        method: details.method || 'GET',
        responseHeaders,
        contentType,
        contentLength,
        tabUrl: details.initiator || '',
        tabId: details.tabId?.toString() || '',
      });
    }
  },
  { urls: ['<all_urls>'] },
  ['responseHeaders']
);

// ── Tab Updates ────────────────────────────────────────────
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (!isQdmRunning || !qdmConfig.enabled) return;
  if (changeInfo.title && tab.url) {
    const shouldWatch = qdmConfig.tabsWatcher?.some(pattern => tab.url.includes(pattern));
    if (shouldWatch) {
      sendToQDM('/tab-update', {
        tabUrl: tab.url,
        tabTitle: changeInfo.title,
        tabId: tabId.toString(),
      });
    }
  }
});

// ── Context Menu ───────────────────────────────────────────
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'qdm-download-link',
    title: 'Download with QDM ⚡',
    contexts: ['link'],
  });
  chrome.contextMenus.create({
    id: 'qdm-download-media',
    title: 'Download media with QDM ⚡',
    contexts: ['video', 'audio', 'image'],
  });
  chrome.contextMenus.create({
    id: 'qdm-grab-links',
    title: 'Grab all page links with QDM',
    contexts: ['page'],
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'qdm-download-link' && info.linkUrl) {
    await sendToQDM('/download', {
      url: info.linkUrl,
      file: '',
      tabUrl: tab?.url || '',
      tabId: tab?.id?.toString() || '',
    });
  }
  if (info.menuItemId === 'qdm-download-media') {
    const url = info.srcUrl || info.linkUrl;
    if (url) {
      await sendToQDM('/download', {
        url: url,
        file: '',
        tabUrl: tab?.url || '',
        tabId: tab?.id?.toString() || '',
      });
    }
  }
  if (info.menuItemId === 'qdm-grab-links' && tab?.id) {
    chrome.tabs.sendMessage(tab.id, { action: 'grab-links' });
  }
});

// ── Messages from content script / popup ───────────────────
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'get-status') {
    sendResponse({ running: isQdmRunning, config: qdmConfig });
  }
  if (message.action === 'download-video') {
    sendToQDM('/vid', { vid: message.id });
  }
  if (message.action === 'clear-videos') {
    sendToQDM('/clear', {});
  }
  if (message.action === 'batch-links') {
    sendToQDM('/link', message.links);
  }
  return true;
});

// ── Helpers ────────────────────────────────────────────────
function getHeader(headers, name) {
  if (!headers) return null;
  const h = headers.find(h => h.name.toLowerCase() === name.toLowerCase());
  return h?.value || null;
}

async function getCurrentTab() {
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    return tabs[0] || null;
  } catch {
    return null;
  }
}
