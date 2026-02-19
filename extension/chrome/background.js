/**
 * QDM Browser Extension - Background Service Worker
 * 
 * SELECTIVE interception like IDM:
 * - Only intercepts actual file downloads (not web pages, images, CSS, JS)
 * - Only detects real media streams (video/audio with significant size)
 * - Uses paired request watching for cookie/header capture
 */

const QDM_PORT = 8597;
const QDM_HOST = `http://127.0.0.1:${QDM_PORT}`;
let isQdmRunning = false;
let qdmConfig = { enabled: true, videoList: [] };

const requestMap = new Map();

// Minimum sizes to consider (bytes)
const MIN_MEDIA_SIZE = 500 * 1024;    // 500KB — skip tiny media fragments
const MIN_DOWNLOAD_SIZE = 10 * 1024;   // 10KB — skip tiny files

// Extensions that are REAL downloads (not web resources)
const DOWNLOAD_EXTS = new Set([
  'zip','rar','7z','tar','gz','bz2','xz','zst','cab',
  'exe','msi','dmg','deb','rpm','appimage','apk',
  'pdf','doc','docx','xls','xlsx','ppt','pptx',
  'iso','img','bin','torrent','epub','mobi',
]);

// Extensions that are REAL media files
const MEDIA_EXTS = new Set([
  'mp4','mkv','webm','avi','mov','flv','m4v','wmv','ts',
  'mp3','flac','wav','aac','ogg','wma','m4a','opus',
]);

// SKIP these — they're web resources, not downloads
const SKIP_EXTS = new Set([
  'html','htm','php','asp','aspx','jsp','cgi',
  'js','mjs','css','scss','less',
  'json','xml','svg','woff','woff2','ttf','eot',
  'ico','cur','map','webmanifest',
]);

// SKIP these content types — web resources
const SKIP_CONTENT_TYPES = new Set([
  'text/html','text/css','text/javascript','application/javascript',
  'application/json','application/xml','text/xml',
  'image/svg+xml','font/woff','font/woff2',
  'application/x-javascript','text/ecmascript',
]);

// Content types that ARE downloads
const DOWNLOAD_CONTENT_TYPES = [
  'application/octet-stream',
  'application/zip','application/x-rar','application/x-7z-compressed',
  'application/gzip','application/x-tar',
  'application/pdf',
  'application/x-msdownload','application/x-msi',
  'application/x-apple-diskimage',
  'application/vnd.android.package-archive',
];

// YouTube video host patterns
const YOUTUBE_HOSTS = ['googlevideo.com','youtube.com/videoplayback'];

// ── Sync with QDM ──────────────────────────────────────────
async function syncWithQDM() {
  try {
    const res = await fetch(`${QDM_HOST}/sync`, { method: 'GET', signal: AbortSignal.timeout(3000) });
    if (res.ok) { qdmConfig = await res.json(); isQdmRunning = true; }
    else isQdmRunning = false;
  } catch { isQdmRunning = false; }
  chrome.action.setBadgeText({ text: isQdmRunning ? '' : '!' });
  chrome.action.setBadgeBackgroundColor({ color: '#e17055' });
}
chrome.alarms.create('qdm-sync', { periodInMinutes: 0.1 });
chrome.alarms.onAlarm.addListener(a => { if (a.name === 'qdm-sync') syncWithQDM(); });
syncWithQDM();

async function sendToQDM(endpoint, data) {
  if (!isQdmRunning || !qdmConfig.enabled) return false;
  try {
    const res = await fetch(`${QDM_HOST}${endpoint}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data), signal: AbortSignal.timeout(5000),
    });
    return res.ok;
  } catch { return false; }
}

// ── Get file extension from URL ────────────────────────────
function getExt(url) {
  try {
    const path = new URL(url).pathname;
    const lastDot = path.lastIndexOf('.');
    if (lastDot > 0) {
      const ext = path.substring(lastDot + 1).toLowerCase().split(/[?#]/)[0];
      if (ext.length <= 10) return ext;
    }
  } catch {}
  return '';
}

// ── Classify a request ─────────────────────────────────────
function classifyRequest(url, responseHeaders) {
  const ext = getExt(url);
  const contentType = (getHeader(responseHeaders, 'content-type') || '').toLowerCase().split(';')[0].trim();
  const contentLength = parseInt(getHeader(responseHeaders, 'content-length') || '0');
  const contentDisp = (getHeader(responseHeaders, 'content-disposition') || '').toLowerCase();
  const hostname = new URL(url).hostname.toLowerCase();

  // ALWAYS skip web resources
  if (SKIP_EXTS.has(ext)) return null;
  if (SKIP_CONTENT_TYPES.has(contentType)) return null;
  if (contentType.startsWith('image/') && contentLength < 5 * 1024 * 1024) return null; // skip images < 5MB
  if (contentType.startsWith('font/')) return null;
  
  // Check if it's a YouTube video stream
  if (YOUTUBE_HOSTS.some(h => url.toLowerCase().includes(h))) {
    // YouTube uses range requests — individual chunks are small
    // Check URL params for mime type to confirm it's actual video/audio
    const urlLower2 = url.toLowerCase();
    const hasVideoMime = urlLower2.includes('mime=video') || urlLower2.includes('mime=audio');
    const isVideoPlayback = urlLower2.includes('/videoplayback');
    if (hasVideoMime || isVideoPlayback) {
      return { type: 'media', reason: 'youtube' };
    }
    return null;
  }

  // Check Content-Disposition: attachment
  if (contentDisp.includes('attachment')) {
    return { type: 'download', reason: 'attachment' };
  }

  // Check known download extensions
  if (DOWNLOAD_EXTS.has(ext)) {
    return { type: 'download', reason: 'ext' };
  }

  // Check known media extensions
  if (MEDIA_EXTS.has(ext)) {
    if (contentLength === 0 || contentLength > MIN_MEDIA_SIZE) {
      return { type: 'media', reason: 'ext' };
    }
    return null;
  }

  // Check download content types
  if (DOWNLOAD_CONTENT_TYPES.some(t => contentType.includes(t))) {
    if (contentLength > MIN_DOWNLOAD_SIZE || contentLength === 0) {
      return { type: 'download', reason: 'content-type' };
    }
    return null;
  }

  // Check audio/video content types (only if substantial size)
  if (contentType.startsWith('video/') || contentType.startsWith('audio/')) {
    if (contentLength > MIN_MEDIA_SIZE || contentLength === 0) {
      return { type: 'media', reason: 'content-type' };
    }
    return null;
  }

  return null; // Don't match — it's a regular web request
}

// ── WebRequest Listeners ───────────────────────────────────
chrome.webRequest.onSendHeaders.addListener(
  (info) => {
    if (!isQdmRunning || !qdmConfig.enabled) return;
    requestMap.set(info.requestId, info);
    // Cleanup old entries
    if (requestMap.size > 300) {
      const cutoff = Date.now() - 30000;
      for (const [id, r] of requestMap) { if (r.timeStamp < cutoff) requestMap.delete(id); }
    }
  },
  { urls: ['http://*/*', 'https://*/*'] },
  ['requestHeaders', 'extraHeaders']
);

chrome.webRequest.onHeadersReceived.addListener(
  (res) => {
    if (!isQdmRunning || !qdmConfig.enabled) return;
    if (res.type === 'main_frame' || res.type === 'sub_frame') return;
    
    const req = requestMap.get(res.requestId);
    requestMap.delete(res.requestId);
    
    const result = classifyRequest(res.url, res.responseHeaders);
    if (!result) return;
    
    // Build data with cookies
    const data = {
      url: res.url,
      file: '',
      method: req?.method || 'GET',
      requestHeaders: {},
      responseHeaders: {},
      cookie: undefined,
      tabUrl: '',
      tabId: (res.tabId || -1) + '',
      contentType: getHeader(res.responseHeaders, 'content-type') || '',
      contentLength: parseInt(getHeader(res.responseHeaders, 'content-length') || '0'),
    };

    // For YouTube: get TOTAL size from Content-Range (bytes 0-X/TOTAL)
    const contentRange = getHeader(res.responseHeaders, 'content-range') || '';
    if (contentRange) {
      const totalMatch = contentRange.match(/\/(\d+)/);
      if (totalMatch) data.contentLength = parseInt(totalMatch[1]);
    }

    // For YouTube: extract quality from itag
    if (result.reason === 'youtube') {
      data.quality = getYouTubeQuality(res.url);
    }
    
    const cookies = [];
    if (req?.requestHeaders) {
      req.requestHeaders.forEach(h => {
        if (h.name.toLowerCase() === 'cookie') cookies.push(h.value);
        data.requestHeaders[h.name] = h.value;
      });
    }
    if (res.responseHeaders) {
      res.responseHeaders.forEach(h => { data.responseHeaders[h.name.toLowerCase()] = h.value; });
    }
    if (cookies.length > 0) data.cookie = cookies.join(';');

    // Get tab title for file name
    if (res.tabId && res.tabId !== -1) {
      chrome.tabs.get(res.tabId, (tab) => {
        if (!chrome.runtime.lastError && tab) {
          data.file = tab.title || '';
          data.tabUrl = tab.url || '';
        }
        sendToQDM(result.type === 'media' ? '/media' : '/download', data);
      });
    } else {
      sendToQDM(result.type === 'media' ? '/media' : '/download', data);
    }
  },
  { urls: ['http://*/*', 'https://*/*'] },
  ['responseHeaders', 'extraHeaders']
);

chrome.webRequest.onErrorOccurred.addListener(
  (info) => { requestMap.delete(info.requestId); },
  { urls: ['http://*/*', 'https://*/*'] }
);

// ── Download Interception ──────────────────────────────────
chrome.downloads.onCreated.addListener(async (item) => {
  if (!isQdmRunning || !qdmConfig.enabled) return;
  if (!item.url || item.url.startsWith('blob:') || item.url.startsWith('data:')) return;
  
  const ext = getExt(item.url);
  const isKnownFile = DOWNLOAD_EXTS.has(ext) || MEDIA_EXTS.has(ext);
  const isBigFile = (item.totalBytes || 0) > 1024 * 1024; // > 1MB
  const isMimeDownload = item.mime && DOWNLOAD_CONTENT_TYPES.some(t => item.mime.includes(t));
  
  if (isKnownFile || isBigFile || isMimeDownload) {
    try { chrome.downloads.cancel(item.id); chrome.downloads.erase({ id: item.id }); } catch {}
    const tab = await getCurrentTab();
    sendToQDM('/download', {
      url: item.url,
      file: item.filename ? item.filename.split(/[/\\]/).pop() : '',
      tabUrl: tab?.url || item.referrer || '',
      tabId: (tab?.id || -1) + '',
      contentType: item.mime || '',
      contentLength: item.totalBytes || 0,
    });
  }
});

// ── Tab watcher ────────────────────────────────────────────
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (!isQdmRunning) return;
  if (changeInfo.title && tab.url?.includes('youtube.com/watch')) {
    sendToQDM('/tab-update', { tabUrl: tab.url, tabTitle: changeInfo.title, tabId: tabId + '' });
  }
});

// ── Context Menu ───────────────────────────────────────────
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({ id: 'qdm-download-link', title: 'Download with QDM ⚡', contexts: ['link'] });
  chrome.contextMenus.create({ id: 'qdm-download-media', title: 'Download media with QDM ⚡', contexts: ['video', 'audio'] });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  const url = info.linkUrl || info.srcUrl;
  if (url) {
    sendToQDM('/download', { url, file: '', tabUrl: tab?.url || '', tabId: (tab?.id || -1) + '' });
  }
});

// ── Messages ───────────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'get-status') sendResponse({ running: isQdmRunning, config: qdmConfig });
  if (msg.action === 'download-video') sendToQDM('/vid', { vid: msg.id });
  if (msg.action === 'clear-videos') sendToQDM('/clear', {});
  if (msg.action === 'batch-links') sendToQDM('/link', msg.links);
  return true;
});

function getHeader(h, n) { if (!h) return null; const r = h.find(x => x.name.toLowerCase() === n.toLowerCase()); return r?.value || null; }
async function getCurrentTab() { try { const t = await chrome.tabs.query({ active: true, currentWindow: true }); return t[0] || null; } catch { return null; } }

function getYouTubeQuality(url) {
  try {
    const u = new URL(url);
    const itag = u.searchParams.get('itag');
    const mime = (u.searchParams.get('mime') || '').toLowerCase();
    if (!itag) {
      if (mime.includes('video')) return 'Video';
      if (mime.includes('audio')) return 'Audio';
      return '';
    }
    const map = {
      '18':'360p','22':'720p','133':'240p','134':'360p','135':'480p',
      '136':'720p','137':'1080p','138':'4K','160':'144p','264':'1440p',
      '266':'2160p','298':'720p60','299':'1080p60','303':'1080p60',
      '308':'1440p60','315':'2160p60',
      '242':'240p','243':'360p','244':'480p','247':'720p','248':'1080p',
      '271':'1440p','313':'2160p',
      '139':'48kbps','140':'128kbps','141':'256kbps',
      '249':'50kbps','250':'70kbps','251':'160kbps',
    };
    if (map[itag]) return map[itag];
    if (mime.includes('video')) return 'Video #'+itag;
    if (mime.includes('audio')) return 'Audio #'+itag;
    return '#'+itag;
  } catch { return ''; }
}
