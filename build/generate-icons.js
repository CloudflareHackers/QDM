/**
 * Icon Generator for QDM
 * Generates SVG icon and a 256x256 PNG icon using Node.js
 * 
 * For production builds, electron-builder can auto-convert PNG to .ico and .icns
 * Just set icon path to the PNG file in the build config.
 */

const fs = require('fs');
const path = require('path');

// Generate SVG icon
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#6c5ce7;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#a855f7;stop-opacity:1" />
    </linearGradient>
  </defs>
  <rect width="512" height="512" rx="80" fill="url(#bg)"/>
  <path d="M256 120 L256 320 M180 260 L256 340 L332 260" 
        stroke="white" stroke-width="40" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
  <line x1="160" y1="380" x2="352" y2="380" stroke="white" stroke-width="40" stroke-linecap="round"/>
</svg>`;

fs.writeFileSync(path.join(__dirname, 'icon.svg'), svg);
console.log('✅ Generated build/icon.svg');
console.log('');
console.log('For production icons, you need a 256x256+ PNG file at build/icon.png');
console.log('electron-builder will auto-convert it to .ico (Windows) and .icns (macOS)');
console.log('');
console.log('Quick generation options:');
console.log('  Option 1: Use an online SVG-to-PNG converter with build/icon.svg');
console.log('  Option 2: npm install -g svg2png-cli && svg2png build/icon.svg -o build/icon.png -w 512 -h 512');
console.log('  Option 3: Use Inkscape CLI: inkscape build/icon.svg -o build/icon.png -w 512 -h 512');
