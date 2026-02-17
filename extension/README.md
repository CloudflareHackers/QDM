# QDM Browser Extensions

Browser extensions for Quantum Download Manager. Intercepts downloads and detects media (video/audio/streams) from web pages.

## Supported Browsers

| Browser | Extension Type | Folder |
|---------|---------------|--------|
| Chrome | Manifest V3 | `chrome/` |
| Edge | Manifest V3 | `chrome/` (same) |
| Brave | Manifest V3 | `chrome/` (same) |
| Opera | Manifest V3 | `chrome/` (same) |
| Vivaldi | Manifest V3 | `chrome/` (same) |
| Firefox | Manifest V2 | `firefox/` |

## Installing (Development)

### Chrome / Edge / Brave
1. Go to `chrome://extensions/` (or `edge://extensions/`)
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select the `extension/chrome/` folder

### Firefox
1. Go to `about:debugging#/runtime/this-firefox`
2. Click "Load Temporary Add-on"
3. Select `extension/firefox/manifest.json`

> **Note**: Firefox uses the same `background.js`, `content.js`, `popup.html`, and `popup.js` as Chrome.
> Copy them from `chrome/` to `firefox/` before loading, or symlink them.

## How It Works

1. Extension polls QDM's local server (`http://127.0.0.1:8597/sync`) every 3 seconds
2. When QDM is running, the extension activates:
   - **Download Interception**: Cancels browser downloads matching configured file extensions, sends to QDM
   - **Media Detection**: Monitors HTTP responses for `video/*` and `audio/*` content types
   - **YouTube Detection**: Tracks `googlevideo.com` requests and YouTube tab titles
   - **HLS/DASH**: Detects `.m3u8` and `.mpd` manifest URLs
3. Right-click context menu provides "Download with QDM" for any link
4. Popup shows connection status and list of detected media

## Extension Icons

Place the following icon files in the `icons/` folder:
- `icon16.png` (16×16)
- `icon48.png` (48×48)  
- `icon128.png` (128×128)

Generate from `build/icon.svg` using any image editor.
