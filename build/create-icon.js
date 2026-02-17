/**
 * Creates a minimal 256x256 PNG icon for electron-builder.
 * 
 * This generates a valid PNG file with the QDM logo (purple gradient + download arrow).
 * electron-builder will auto-convert this to .ico (Windows) and .icns (macOS).
 * 
 * Uses raw PNG encoding - no external dependencies needed.
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const SIZE = 512;

function createPNG(width, height, pixels) {
  // PNG signature
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  
  // IHDR chunk
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 2;  // color type (RGB)
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace
  const ihdrChunk = makeChunk('IHDR', ihdr);
  
  // IDAT chunk (image data)
  const rawData = Buffer.alloc(height * (1 + width * 3));
  for (let y = 0; y < height; y++) {
    rawData[y * (1 + width * 3)] = 0; // filter byte (none)
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 3;
      const offset = y * (1 + width * 3) + 1 + x * 3;
      rawData[offset] = pixels[i];     // R
      rawData[offset + 1] = pixels[i + 1]; // G
      rawData[offset + 2] = pixels[i + 2]; // B
    }
  }
  const compressed = zlib.deflateSync(rawData);
  const idatChunk = makeChunk('IDAT', compressed);
  
  // IEND chunk
  const iendChunk = makeChunk('IEND', Buffer.alloc(0));
  
  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

function makeChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeBuffer = Buffer.from(type, 'ascii');
  const crc = crc32(Buffer.concat([typeBuffer, data]));
  const crcBuffer = Buffer.alloc(4);
  crcBuffer.writeUInt32BE(crc, 0);
  return Buffer.concat([length, typeBuffer, data, crcBuffer]);
}

function crc32(buf) {
  let c = 0xFFFFFFFF;
  const table = [];
  for (let n = 0; n < 256; n++) {
    let cn = n;
    for (let k = 0; k < 8; k++) {
      cn = (cn & 1) ? (0xEDB88320 ^ (cn >>> 1)) : (cn >>> 1);
    }
    table[n] = cn;
  }
  for (let i = 0; i < buf.length; i++) {
    c = table[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  }
  return (c ^ 0xFFFFFFFF) >>> 0;
}

// Draw the QDM icon
function drawIcon(size) {
  const pixels = new Uint8Array(size * size * 3);
  
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 3;
      
      // Normalized coordinates
      const nx = x / size;
      const ny = y / size;
      
      // Rounded rect check (with radius)
      const margin = 0.02;
      const radius = 0.15;
      const inRect = isInRoundedRect(nx, ny, margin, margin, 1 - margin * 2, 1 - margin * 2, radius);
      
      if (!inRect) {
        // Transparent (black background)
        pixels[i] = 0;
        pixels[i + 1] = 0;
        pixels[i + 2] = 0;
        continue;
      }
      
      // Gradient background: #6c5ce7 to #a855f7
      const t = (nx + ny) / 2;
      const r = Math.round(108 + (168 - 108) * t);
      const g = Math.round(92 + (85 - 92) * t);
      const b = Math.round(231 + (247 - 231) * t);
      
      pixels[i] = r;
      pixels[i + 1] = g;
      pixels[i + 2] = b;
      
      // Draw white arrow (download symbol)
      const cx = 0.5;
      
      // Vertical line of arrow
      const lineWidth = 0.06;
      if (Math.abs(nx - cx) < lineWidth && ny > 0.22 && ny < 0.62) {
        pixels[i] = 255;
        pixels[i + 1] = 255;
        pixels[i + 2] = 255;
      }
      
      // Arrow head (V shape)
      const arrowY = 0.62;
      const arrowSpread = 0.18;
      const dy = ny - arrowY;
      if (dy > -0.18 && dy < 0.02) {
        const expectedX1 = cx + dy * (arrowSpread / 0.18);
        const expectedX2 = cx - dy * (arrowSpread / 0.18);
        if (Math.abs(nx - expectedX1) < lineWidth || Math.abs(nx - expectedX2) < lineWidth) {
          if (ny > 0.44 && ny < 0.66) {
            pixels[i] = 255;
            pixels[i + 1] = 255;
            pixels[i + 2] = 255;
          }
        }
      }
      
      // Base line
      if (ny > 0.72 && ny < 0.78 && nx > 0.28 && nx < 0.72) {
        pixels[i] = 255;
        pixels[i + 1] = 255;
        pixels[i + 2] = 255;
      }
    }
  }
  
  return Buffer.from(pixels);
}

function isInRoundedRect(px, py, rx, ry, rw, rh, radius) {
  if (px < rx || px > rx + rw || py < ry || py > ry + rh) return false;
  
  // Check corners
  const corners = [
    [rx + radius, ry + radius],
    [rx + rw - radius, ry + radius],
    [rx + radius, ry + rh - radius],
    [rx + rw - radius, ry + rh - radius],
  ];
  
  for (const [cx, cy] of corners) {
    const inCornerRegion = (
      (px < rx + radius && py < ry + radius) ||
      (px > rx + rw - radius && py < ry + radius) ||
      (px < rx + radius && py > ry + rh - radius) ||
      (px > rx + rw - radius && py > ry + rh - radius)
    );
    if (inCornerRegion) {
      const dx = px - cx;
      const dy = py - cy;
      if (dx * dx + dy * dy > radius * radius) return false;
    }
  }
  
  return true;
}

// Generate and save
const pixels = drawIcon(SIZE);
const png = createPNG(SIZE, SIZE, pixels);
const outputPath = path.join(__dirname, 'icon.png');
fs.writeFileSync(outputPath, png);
console.log(`✅ Generated ${outputPath} (${SIZE}x${SIZE} PNG, ${png.length} bytes)`);
