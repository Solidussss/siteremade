'use strict';
// Procedural stand-in for an OpenAI image response -- NOT photography. It
// exists so the image pipeline (request -> response -> storage -> render)
// can be exercised and screenshotted without a paid call. The colour is a
// hash of the PROMPT, so two slots that were sent the identical prompt come
// back visibly identical: repetition in the image plan is obvious in a
// screenshot instead of hidden behind "an image loaded".
const zlib = require('zlib');

const crcTable = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(buf) { let c = 0xffffffff; for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function hsl(h, s, l) {
  const a = s * Math.min(l, 1 - l);
  const f = n => { const k = (n + h / 30) % 12; return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)))); };
  return [f(0), f(8), f(4)];
}

// A warm colour field with one centred "object" silhouette (a tall rounded
// shape -- reads as a product/subject at thumbnail size), so composition and
// cropping are judgeable in a screenshot.
function mockPng(prompt, aspectRatio) {
  const [W, H] = aspectRatio === '16:9' ? [480, 270] : aspectRatio === '4:3' ? [400, 300] : [320, 320];
  const h = hash(String(prompt || ''));
  const hue = h % 360;
  const bgA = hsl(hue, 0.7, 0.55), bgB = hsl((hue + 25) % 360, 0.75, 0.3), obj = hsl((hue + 180) % 360, 0.35, 0.92);
  const row = W * 3 + 1, raw = Buffer.alloc(row * H);
  const cx = W / 2, cy = H * 0.55, ow = Math.min(W, H) * 0.18, oh = H * 0.34;
  for (let y = 0; y < H; y++) {
    raw[y * row] = 0;
    for (let x = 0; x < W; x++) {
      const d = Math.min(1, Math.hypot(x - cx, y - cy * 0.8) / (Math.max(W, H) * 0.75));
      let c = bgA.map((v, i) => Math.round(v * (1 - d) + bgB[i] * d));
      const dx = Math.abs(x - cx) / ow, dy = Math.abs(y - cy) / oh;
      if (dx <= 1 && dy <= 1 && !(dy > 0.85 && dx > 0.8)) c = obj.map((v, i) => Math.round(v * 0.85 + c[i] * 0.15 - (dx * 30)));
      const o = y * row + 1 + x * 3; raw[o] = c[0]; raw[o + 1] = c[1]; raw[o + 2] = c[2];
    }
  }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 2;
  const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 6 })), chunk('IEND', Buffer.alloc(0))]);
  return `data:image/png;base64,${png.toString('base64')}`;
}

module.exports = { mockPng };
