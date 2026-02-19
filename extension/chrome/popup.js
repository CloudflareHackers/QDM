// QDM Extension Popup
chrome.runtime.sendMessage({ action: 'get-status' }, (response) => {
  const dot = document.getElementById('statusDot');
  const text = document.getElementById('statusText');
  if (response?.running) {
    dot.className = 'dot on';
    text.textContent = 'QDM is running';
    renderVideoList(response.config?.videoList || []);
  } else {
    dot.className = 'dot off';
    text.textContent = 'QDM is not running — start the app';
  }
});

function fmtSize(b) {
  if (!b || b <= 0) return '';
  const k = 1024, s = ['B','KB','MB','GB'];
  const i = Math.floor(Math.log(b) / Math.log(k));
  return parseFloat((b / Math.pow(k, i)).toFixed(1)) + ' ' + s[i];
}

function esc(s) { return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

function renderVideoList(videos) {
  const container = document.getElementById('videoList');
  const countEl = document.getElementById('mediaCount');
  if (!videos.length) { countEl.textContent = ''; return; }
  countEl.textContent = `${videos.length} found`;

  container.innerHTML = videos.map(v => {
    // v has: id, text (name), info (description), tabId, size, type
    const info = v.info || '';
    const size = v.size > 0 ? fmtSize(v.size) : '';
    const isYT = info.toLowerCase().includes('youtube') || (v.type === 'youtube');
    const isAudio = info.toLowerCase().includes('audio') || (v.type === 'audio');
    const icon = isYT ? '🎬' : isAudio ? '🎵' : '🎬';

    // Build badge list from info parts
    const badges = info.split('•').map(s => s.trim()).filter(Boolean);
    // Add size badge if not already in info
    if (size && !badges.some(b => /^\d/.test(b) && /[BKMG]/.test(b))) {
      badges.push(size);
    }

    return `<div class="video-item">
      <span class="icon">${icon}</span>
      <div class="info">
        <div class="name" title="${esc(v.text)}">${esc(v.text)}</div>
        <div class="meta">
          ${badges.map((b, i) => {
            const cls = i === 0 ? 'type' : (/^\d/.test(b) && /[BKMG]/.test(b)) ? 'size' : 'quality';
            return `<span class="badge ${cls}">${esc(b)}</span>`;
          }).join('')}
        </div>
      </div>
      <button class="dl-btn" data-id="${v.id}">⚡</button>
    </div>`;
  }).join('');

  container.querySelectorAll('.dl-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      chrome.runtime.sendMessage({ action: 'download-video', id: btn.dataset.id });
      btn.textContent = '✓'; btn.style.background = '#00b894';
    });
  });
}

document.getElementById('clearBtn').addEventListener('click', () => {
  chrome.runtime.sendMessage({ action: 'clear-videos' });
  document.getElementById('videoList').innerHTML = '<div class="empty">Cleared.</div>';
  document.getElementById('mediaCount').textContent = '';
});
