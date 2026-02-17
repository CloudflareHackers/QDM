/**
 * QDM Content Script
 * Grabs all links from the page when requested by the extension popup or context menu.
 */

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'grab-links') {
    const links = [];
    const seen = new Set();
    
    document.querySelectorAll('a[href]').forEach(a => {
      const url = a.href;
      if (url && !seen.has(url) && (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('ftp://'))) {
        seen.add(url);
        links.push({
          url: url,
          file: a.download || a.textContent?.trim().substring(0, 100) || '',
          tabUrl: window.location.href,
        });
      }
    });

    // Also grab media sources
    document.querySelectorAll('video source, audio source, video[src], audio[src]').forEach(el => {
      const url = el.src || el.getAttribute('src');
      if (url && !seen.has(url)) {
        seen.add(url);
        links.push({ url, file: '', tabUrl: window.location.href });
      }
    });

    chrome.runtime.sendMessage({ action: 'batch-links', links });
    sendResponse({ count: links.length });
  }
  return true;
});
