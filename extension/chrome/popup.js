// QDM Extension Popup
chrome.runtime.sendMessage({ action: 'get-status' }, (response) => {
  const dot = document.getElementById('statusDot');
  const text = document.getElementById('statusText');
  
  if (response?.running) {
    dot.className = 'dot on';
    text.textContent = 'QDM is running — downloads will be intercepted';
    renderVideoList(response.config?.videoList || []);
  } else {
    dot.className = 'dot off';
    text.textContent = 'QDM is not running — start QDM to enable';
  }
});

function renderVideoList(videos) {
  const container = document.getElementById('videoList');
  if (!videos.length) return;
  
  container.innerHTML = videos.map(v => `
    <div class="video-item" data-id="${v.id}">
      <span class="icon">🎬</span>
      <div class="info">
        <div class="name" title="${v.text}">${v.text}</div>
        <div class="desc">${v.info || ''}</div>
      </div>
      <button class="dl-btn" data-id="${v.id}">⚡ DL</button>
    </div>
  `).join('');

  container.querySelectorAll('.dl-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      chrome.runtime.sendMessage({ action: 'download-video', id: btn.dataset.id });
      btn.textContent = '✓';
      btn.style.background = '#00b894';
    });
  });
}

document.getElementById('clearBtn').addEventListener('click', () => {
  chrome.runtime.sendMessage({ action: 'clear-videos' });
  document.getElementById('videoList').innerHTML = '<div class="empty">Cleared.</div>';
});

document.getElementById('grabLinksBtn').addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id) {
    chrome.tabs.sendMessage(tab.id, { action: 'grab-links' }, (response) => {
      const btn = document.getElementById('grabLinksBtn');
      btn.textContent = `✓ Sent ${response?.count || 0} links`;
      setTimeout(() => { btn.textContent = 'Grab Page Links'; }, 2000);
    });
  }
});
