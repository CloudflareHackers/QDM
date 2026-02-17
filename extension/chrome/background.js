/**
 * QDM Browser Extension - Background Service Worker
 * 
 * Intercepts downloads and media streams, forwards them to QDM's
 * local server (port 8597) for accelerated downloading.
 * 
 * Compatible with Chrome, Edge, Brave, Opera, Vivaldi.
 * Based on XDM's browser extension architecture.
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

// ── Sync with QDM ──────────────────────────────────────────────
async function syncWithQDM() {
  try {
    const res = await fetch(`${QDM_HOST}/sync`, { method: 'GET' });
    if (res.ok) {
      qdmConfig = await res.json();
      isQdmRunning = true;
      chrome.action.setIcon({ path: { 16: 'icons/icon16.png', 48: 'icons/icon48.png' } });
    }
  } catch {
    isQdmRunning = false;
    chrome.action.setIcon({ path: { 16: 'icons/icon16-off.png', 48: 'icons/icon48-off.png' } });
  }
}

// Poll every 3 seconds
setInterval(syncWithQDM, 3000);
syncWithQDM();

// ── Send message to QDM ────────────────────────────────────────
async function sendToQDM(endpoint, data) {
  if (!isQdmRunning || !qdmConfig.enabled) return false;
  try {
    const res = await fetch(`${QDM_HOST}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (res.ok) {
      const config = await res.json();
      if (config) qdmConfig = config;
    }
    return res.ok;
  } catch {
    return false;
  }
}

// ── Download Interception ──────────────────────────────────────
chrome.downloads.onCreated.addListener(async (downloadItem) => {
  if (!isQdmRunning || !qdmConfig.enabled) return;
  if (!downloadItem.url || downloadItem.url.startsWith('blob:')) return;

  const url = downloadItem.url.toLowerCase();
  const shouldIntercept = qdmConfig.fileExts.some(ext => url.includes(ext));
  
  if (shouldIntercept) {
    // Cancel Chrome's download
    chrome.downloads.cancel(downloadItem.id);
    chrome.downloads.erase({ id: downloadItem.id });

    // Send to QDM
    const tab = await getCurrentTab();
    await sendToQDM('/download', {
      url: downloadItem.url,
      file: downloadItem.filename || '',
      method: 'GET',
      tabUrl: tab?.url || '',
      tabId: tab?.id?.toString() || '',
    });
  }
});

// ── Media/Video Detection ──────────────────────────────────────
chrome.webRequest.onHeadersReceived.addListener(
  (details) => {
    if (!isQdmRunning || !qdmConfig.enabled) return;
    if (details.type === 'main_frame') return;

    const contentType = getHeader(details.responseHeaders, 'content-type') || '';
    const contentLength = parseInt(getHeader(details.responseHeaders, 'content-length') || '0');
    const url = details.url.toLowerCase();

    // Check if it's a media type
    const isMedia = qdmConfig.mediaTypes.some(type => contentType.includes(type));
    const isMediaUrl = qdmConfig.requestFileExts.some(ext => url.includes(ext));
    const isMatchingHost = qdmConfig.matchingHosts.some(host => url.includes(host));

    if (isMedia || isMediaUrl || isMatchingHost) {
      // Skip tiny files (< 100KB likely not actual media)
      if (contentLength > 0 && contentLength < 102400) return;

      const responseHeaders = {};
      if (details.responseHeaders) {
        details.responseHeaders.forEach(h => {
          responseHeaders[h.name] = h.value || '';
        });
      }

      sendToQDM('/media', {
        url: details.url,
        file: '',
        method: details.method,
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

// ── Tab Updates (for video name resolution) ────────────────────
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (!isQdmRunning || !qdmConfig.enabled) return;
  if (changeInfo.title && tab.url) {
    const shouldWatch = qdmConfig.tabsWatcher.some(pattern => tab.url.includes(pattern));
    if (shouldWatch) {
      sendToQDM('/tab-update', {
        tabUrl: tab.url,
        tabTitle: changeInfo.title,
        tabId: tabId.toString(),
      });
    }
  }
});

// ── Context Menu ───────────────────────────────────────────────
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'qdm-download-link',
    title: 'Download with QDM',
    contexts: ['link'],
  });
  chrome.contextMenus.create({
    id: 'qdm-download-media',
    title: 'Download media with QDM',
    contexts: ['video', 'audio'],
  });
  chrome.contextMenus.create({
    id: 'qdm-download-page-links',
    title: 'Grab all links with QDM',
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
  if (info.menuItemId === 'qdm-download-media' && (info.srcUrl || info.linkUrl)) {
    await sendToQDM('/media', {
      url: info.srcUrl || info.linkUrl,
      file: '',
      tabUrl: tab?.url || '',
      tabId: tab?.id?.toString() || '',
    });
  }
  if (info.menuItemId === 'qdm-download-page-links' && tab?.id) {
    chrome.tabs.sendMessage(tab.id, { action: 'grab-links' });
  }
});

// ── Message from content script or popup ───────────────────────
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

// ── Helpers ────────────────────────────────────────────────────
function getHeader(headers, name) {
  if (!headers) return null;
  const h = headers.find(h => h.name.toLowerCase() === name.toLowerCase());
  return h?.value || null;
}

async function getCurrentTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs[0] || null;
}
