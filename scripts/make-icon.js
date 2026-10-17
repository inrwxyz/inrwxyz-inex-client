/**
 * Builds build/icon.png (512x512, ROUNDED square) from src/inex-logo.png for the Windows installer / exe / desktop shortcut.
 * Pure Node.js (no extra packages). electron-builder turns build/icon.png into the .ico automatically.
 * If the logo cannot be read it is used as is, so the build never fails because of the icon.
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const SRC = path.join(__dirname, '..', 'src', 'inex-logo.png');
const OUT_DIR = path.join(__dirname, '..', 'build');
const OUT = path.join(OUT_DIR, 'icon.png');
const SIZE = 512;
const RADIUS_RATIO = 0.22; // corner radius (same soft-square look as the launcher UI)

function decodePng(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('not a PNG');
  let pos = 8, width = 0, height = 0, bitDepth = 0, colorType = 0, interlace = 0;
  let palette = null, trns = null;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0); height = data.readUInt32BE(4);
      bitDepth = data[8]; colorType = data[9]; interlace = data[12];
    } else if (type === 'PLTE') palette = data;
    else if (type === 'tRNS') trns = data;
    else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    pos += 12 + len;
  }
  if (interlace) throw new Error('interlaced PNG not supported');
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[colorType];
  if (!channels) throw new Error('unsupported color type ' + colorType);
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const bitsPerPixel = channels * bitDepth;
  const bpp = Math.max(1, bitsPerPixel >> 3);
  const stride = Math.ceil((width * bitsPerPixel) / 8);
  const cur = Buffer.alloc(stride), prev = Buffer.alloc(stride);
  const rgba = Buffer.alloc(width * height * 4);
  let rp = 0;
  for (let y = 0; y < height; y++) {
    const ft = raw[rp++];
    for (let i = 0; i < stride; i++) {
      const x = raw[rp++];
      const a = i >= bpp ? cur[i - bpp] : 0, b = prev[i], c = i >= bpp ? prev[i - bpp] : 0;
      let v;
      switch (ft) {
        case 0: v = x; break;
        case 1: v = x + a; break;
        case 2: v = x + b; break;
        case 3: v = x + ((a + b) >> 1); break;
        case 4: { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
          v = x + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c); break; }
        default: throw new Error('bad filter');
      }
      cur[i] = v & 255;
    }
    const sample = (px, ch) => {
      if (bitDepth === 8) return cur[px * channels + ch];
      if (bitDepth === 16) return cur[(px * channels + ch) * 2];
      const per = 8 / bitDepth, byte = cur[Math.floor(px / per)];
      const shift = 8 - bitDepth * ((px % per) + 1);
      return (byte >> shift) & ((1 << bitDepth) - 1);
    };
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4;
      if (colorType === 6) { rgba[o] = sample(x, 0); rgba[o + 1] = sample(x, 1); rgba[o + 2] = sample(x, 2); rgba[o + 3] = sample(x, 3); }
      else if (colorType === 2) { rgba[o] = sample(x, 0); rgba[o + 1] = sample(x, 1); rgba[o + 2] = sample(x, 2); rgba[o + 3] = 255; }
      else if (colorType === 0) { let g = sample(x, 0); if (bitDepth < 8) g = Math.round(g * 255 / ((1 << bitDepth) - 1)); rgba[o] = rgba[o + 1] = rgba[o + 2] = g; rgba[o + 3] = 255; }
      else if (colorType === 4) { const g = sample(x, 0); rgba[o] = rgba[o + 1] = rgba[o + 2] = g; rgba[o + 3] = sample(x, 1); }
      else { const idx = sample(x, 0); rgba[o] = palette[idx * 3]; rgba[o + 1] = palette[idx * 3 + 1]; rgba[o + 2] = palette[idx * 3 + 2]; rgba[o + 3] = trns && idx < trns.length ? trns[idx] : 255; }
    }
    cur.copy(prev);
  }
  return { width, height, data: rgba };
}

const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(b) { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function encodePng(w, h, rgba) {
  const rows = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) { rows[y * (w * 4 + 1)] = 0; rgba.copy(rows, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4); }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(rows, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

function resizeBilinear(img, size) {
  const out = Buffer.alloc(size * size * 4);
  const sx = img.width / size, sy = img.height / size;
  for (let y = 0; y < size; y++) {
    const fy = Math.max(0, (y + 0.5) * sy - 0.5), y0 = Math.floor(fy), y1 = Math.min(img.height - 1, y0 + 1), ty = fy - y0;
    for (let x = 0; x < size; x++) {
      const fx = Math.max(0, (x + 0.5) * sx - 0.5), x0 = Math.floor(fx), x1 = Math.min(img.width - 1, x0 + 1), tx = fx - x0;
      for (let c = 0; c < 4; c++) {
        const p00 = img.data[(y0 * img.width + x0) * 4 + c], p10 = img.data[(y0 * img.width + x1) * 4 + c];
        const p01 = img.data[(y1 * img.width + x0) * 4 + c], p11 = img.data[(y1 * img.width + x1) * 4 + c];
        out[(y * size + x) * 4 + c] = Math.round((p00 * (1 - tx) + p10 * tx) * (1 - ty) + (p01 * (1 - tx) + p11 * tx) * ty);
      }
    }
  }
  return out;
}

function roundCorners(rgba, size, radius) {
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const cx = Math.min(x + 0.5, size - x - 0.5), cy = Math.min(y + 0.5, size - y - 0.5);
      let cover = 1;
      if (cx < radius && cy < radius) {
        const d = Math.hypot(radius - cx, radius - cy);
        cover = Math.max(0, Math.min(1, radius - d + 0.5)); // anti-aliased edge
      }
      const o = (y * size + x) * 4 + 3;
      rgba[o] = Math.round(rgba[o] * cover);
    }
  }
}

try {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  if (!fs.existsSync(SRC)) { console.log('[make-icon] src/inex-logo.png not found - skipping icon.'); process.exit(0); }
  const img = decodePng(fs.readFileSync(SRC));
  const px = resizeBilinear(img, SIZE);
  roundCorners(px, SIZE, SIZE * RADIUS_RATIO);
  fs.writeFileSync(OUT, encodePng(SIZE, SIZE, px));
  console.log('[make-icon] Rounded app icon written to build/icon.png');
} catch (err) {
  console.log('[make-icon] Could not round the icon (' + err.message + '). Using the original logo.');
  try { fs.mkdirSync(OUT_DIR, { recursive: true }); fs.copyFileSync(SRC, OUT); } catch (_) {}
}
