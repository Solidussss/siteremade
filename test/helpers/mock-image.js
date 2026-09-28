'use strict';
// Procedural stand-in for an OpenAI image response -- NOT photography. It
// exists so the image pipeline (request -> response -> storage -> render)
// can be exercised and screenshotted without a paid call. The colour is a
// hash of the PROMPT, so two slots that were sent the identical prompt come
// back visibly identical: repetition in the image plan is obvious in a
// screenshot instead of hidden behind "an image loaded".
//
// The silhouette follows what the prompt asks for (a product, an outdoor
// scene, an interior/table, a person, an interface) so a reviewer can judge
// whether each slot got the KIND of picture its section needs, and how the
// hero composition and camera motion treat it. It says nothing about real
// image quality.
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
const mix = (a, b, t) => { t = Math.max(0, Math.min(1, t)); return a.map((v, i) => Math.round(v * (1 - t) + b[i] * t)); };

function subjectOf(prompt) {
  const p = String(prompt || '').toLowerCase();
  if (/\b(dashboard|interface|screen|software|app|ui|calendar view)\b/.test(p)) return 'ui';
  if (/\b(yard|garden|patio|lawn|landscap\w*|backyard|park|outdoor|terrace|trail|flagstone|perennial)\b/.test(p)) return 'outdoor';
  if (/\b(therapist|patient|person|people|team|portrait|athlete|trainer|hands|client|founder|staff)\b/.test(p)) return 'person';
  if (/\b(cafe|café|coffee|cup|pour-over|plate|table|interior|kitchen|bar|bakery|pastr\w*|dining|room)\b/.test(p)) return 'table';
  return 'product';
}

function pixel(kind, u, v, hue, W, H) {
  const bgA = hsl(hue, 0.7, 0.55), bgB = hsl((hue + 25) % 360, 0.75, 0.3), obj = hsl((hue + 180) % 360, 0.35, 0.92);
  if (kind === 'outdoor') {
    const horizon = 0.46 + 0.04 * Math.sin(u * 6 + hue);
    let c;
    if (v < horizon - 0.08 * (0.6 + 0.4 * Math.sin(u * 23 + hue))) c = mix(hsl((hue % 40) + 190, 0.55, 0.78), hsl(35, 0.8, 0.72), v / horizon); // sky
    else if (v < horizon) c = hsl(120, 0.35, 0.22 + 0.06 * Math.sin(u * 40)); // tree line
    else c = mix(hsl(100, 0.5, 0.42), hsl(95, 0.45, 0.28), (v - horizon) / (1 - horizon)); // lawn
    if (v > 0.66 && Math.abs(u - 0.62) < 0.18 + (v - 0.66) * 0.5) c = mix(hsl(30, 0.12, 0.72), hsl(30, 0.1, 0.55), ((Math.floor(u * 18) + Math.floor(v * 14)) % 2) * 0.35); // patio
    if (v > horizon && v < horizon + 0.12 && (u < 0.4 || u > 0.85)) c = hsl((hue + 300) % 360, 0.5, 0.45 + 0.1 * Math.sin(u * 60)); // planted bed
    return c;
  }
  if (kind === 'ui') {
    if (!(u > 0.1 && u < 0.9 && v > 0.12 && v < 0.9)) return mix(bgA, bgB, v);
    if (v < 0.19) return [226, 229, 236];
    if (u < 0.28) return [234, 236, 242];
    if (v > 0.3 && v < 0.55 && Math.floor(u * 10) % 3 !== 0) return mix(bgA, [255, 255, 255], 0.35);
    if (v > 0.62 && v < 0.84 && u > 0.33 && Math.abs(v - (0.8 - 0.15 * Math.sin(u * 9))) < 0.012) return bgB;
    return [246, 247, 250];
  }
  if (kind === 'person') {
    let c = mix(bgA, bgB, Math.hypot(u - 0.5, v - 0.3));
    if (v > 0.52 && Math.abs(u - 0.5) * W / H < 0.08 + (v - 0.52) * 0.9) c = mix(obj, bgB, 0.25); // shoulders
    if (Math.hypot((u - 0.5) * W / H, v - 0.36) < 0.13) c = hsl(28, 0.45, 0.66); // head
    return c;
  }
  if (kind === 'table') {
    let c = v > 0.62 ? mix(hsl(28, 0.4, 0.42), hsl(28, 0.4, 0.3), (v - 0.62) * 2.5) : mix(bgA, bgB, v * 0.8);
    if (Math.hypot((u - 0.5) / 0.22 * W / H, (v - 0.66) / 0.05) < 1) c = [238, 236, 230]; // saucer
    if (Math.abs(u - 0.5) * W / H < 0.12 && v > 0.42 && v < 0.66) c = mix(obj, [255, 255, 255], 0.4 - Math.abs(u - 0.5) * 2); // cup
    return c;
  }
  // product: a tall rounded object on a lit colour field, with a highlight
  let c = mix(bgA, bgB, Math.min(1, Math.hypot(u - 0.5, (v - 0.44) * H / W) / 0.75));
  const ow = Math.min(W, H) * 0.18 / W, oh = 0.34;
  const dx = Math.abs(u - 0.5) / ow, dy = Math.abs(v - 0.55) / oh;
  if (dx <= 1 && dy <= 1 && !(dy > 0.85 && dx > 0.8)) c = obj.map((val, i) => Math.round(val * 0.85 + c[i] * 0.15 - dx * 30));
  if (dx >= 0.12 && dx <= 0.25 && dy <= 0.9) c = [255, 255, 255];
  return c;
}

function mockPng(prompt, aspectRatio) {
  const [W, H] = aspectRatio === '16:9' ? [640, 360] : aspectRatio === '4:3' ? [480, 360] : aspectRatio === '4:5' ? [320, 400] : [400, 400];
  const hue = hash(String(prompt || '')) % 360;
  const kind = subjectOf(prompt);
  const row = W * 3 + 1, raw = Buffer.alloc(row * H);
  for (let y = 0; y < H; y++) {
    raw[y * row] = 0;
    for (let x = 0; x < W; x++) {
      const c = pixel(kind, x / W, y / H, hue, W, H);
      const o = y * row + 1 + x * 3; raw[o] = c[0]; raw[o + 1] = c[1]; raw[o + 2] = c[2];
    }
  }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 2;
  const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 6 })), chunk('IEND', Buffer.alloc(0))]);
  return `data:image/png;base64,${png.toString('base64')}`;
}

module.exports = { mockPng, subjectOf };
