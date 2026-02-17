/**
 * Icon Generator for QDM
 * 
 * This script generates a simple SVG icon and converts it to PNG.
 * For production, replace build/icon.png with a proper 512x512 PNG icon,
 * then use tools like png2ico or electron-icon-builder to generate .ico and .icns.
 * 
 * Quick steps:
 * 1. Create a 512x512 PNG icon and save as build/icon.png
 * 2. Run: npx electron-icon-builder --input=build/icon.png --output=build
 *    This generates icon.ico (Windows) and icon.icns (macOS)
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
console.log('To generate Windows .ico and macOS .icns:');
console.log('1. Convert SVG to 512x512 PNG (use any converter)');
console.log('2. Run: npx electron-icon-builder --input=build/icon.png --output=build');
console.log('');
console.log('Or for a quick .ico, install png-to-ico:');
console.log('   npm install -g png-to-ico');
console.log('   png-to-ico build/icon.png > build/icon.ico');
