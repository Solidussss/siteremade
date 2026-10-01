'use strict';
// Procedural stand-in for a generated image -- NOT photography. It exists so
// the image pipeline (request -> response -> storage -> render) can be
// exercised and screenshotted without a paid call. The colour is a hash of
// the PROMPT, so two slots sent the identical prompt come back visibly
// identical: repetition in the image plan is obvious in a screenshot.
//
// The silhouette follows what the prompt asks for (a product, fruit or
// ingredients, a person, a table/food, an outdoor scene, a house, an
// interior, a device, a car, a garment, a material texture) so a reviewer
// can judge whether each hero layer got the KIND of picture its role needs,
// and how the composition and motion treat it. A fine deterministic grain
// keeps it from being judged "flat or blank" by the premium image check, as a
// real photograph never would be. It says nothing about real image quality.
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

// Which kind of picture a prompt asks for -- most specific first.
const KINDS = [
  ['device', /\b(laptop|phone|monitor|workspace|keyboard|display|server|software|screen)\b/],
  ['car', /\b(car|cars|vehicle|polisher|garage|lift|hood|leather car)\b/],
  ['product', /\b(cans?|bottles?|jars?|bag|packag\w*|dropper|vessels?)\b/],
  ['garment', /\b(garment|garments|dress|gown|jacket|clothing|rail|hanger|fabric|lace|seam|weave|collection|apparel|model walking)\b/],
  ['fruit', /\b(splash|fruit|peach|cherry|citrus|chilies|chili|botanicals?|beans|spices|ingredients|stones|oat|herbs?|leaves|flour)\b/],
  ['house', /\b(roof|roofline|shingles|home exterior|house|family home|exterior at dusk|townhouses)\b/],
  ['person', /\b(therapist|physiotherapist|patient|athlete|boxer|coach|model|volunteers?|crew|roofer|painter|plumber|electrician|barista|chef|bartender|stylist|mechanic|photographer|seamstress|engineers|team|people|hands?|tutor|student|client|lawyer|builder|cleaner|landscapers?)\b/],
  ['outdoor', /\b(yard|garden|lawn|patio|flagstone|pavers?|landscap\w*|backyard|park|rooftop|skyline|street|outdoor|neighbourhood|community project)\b/],
  ['table', /\b(cup|coffee|latte|espresso|pour-over|plate|dish|pasta|pastr\w*|croissant|bread|loaves|cocktail|glassware|jar|sauce|drizzle)\b/],
  ['room', /\b(interior|kitchen|bathroom|living room|studio|bar|dining room|room|café|cafe|gym|library|classroom|roastery|office|bay|clinic)\b/],
  ['texture', /\b(macro|texture|swatch|swatches|close-up|detail|tile|joinery|grain|marble)\b/],
];
function subjectOf(prompt) {
  const p = String(prompt || '').toLowerCase().split('. ')[0]; // the subject sentence, not the framing tail
  for (const [kind, re] of KINDS) if (re.test(p)) return kind;
  return 'product';
}

function pixel(kind, u, v, hue, W, H) {
  const bgA = hsl(hue, 0.7, 0.55), bgB = hsl((hue + 25) % 360, 0.75, 0.3), obj = hsl((hue + 180) % 360, 0.35, 0.9);
  const ar = W / H;
  switch (kind) {
    case 'outdoor': {
      const horizon = 0.46 + 0.04 * Math.sin(u * 6 + hue);
      let c;
      if (v < horizon - 0.08 * (0.6 + 0.4 * Math.sin(u * 23 + hue))) c = mix(hsl((hue % 40) + 190, 0.55, 0.78), hsl(35, 0.8, 0.72), v / horizon);
      else if (v < horizon) c = hsl(120, 0.35, 0.22 + 0.06 * Math.sin(u * 40));
      else c = mix(hsl(100, 0.5, 0.42), hsl(95, 0.45, 0.28), (v - horizon) / (1 - horizon));
      if (v > 0.66 && Math.abs(u - 0.62) < 0.18 + (v - 0.66) * 0.5) c = mix(hsl(30, 0.12, 0.72), hsl(30, 0.1, 0.55), ((Math.floor(u * 18) + Math.floor(v * 14)) % 2) * 0.35);
      if (v > horizon && v < horizon + 0.12 && (u < 0.4 || u > 0.85)) c = hsl((hue + 300) % 360, 0.5, 0.45 + 0.1 * Math.sin(u * 60));
      return c;
    }
    case 'house': {
      let c = mix(hsl(210, 0.45, 0.72), hsl(30, 0.7, 0.62), v);
      if (v > 0.8) c = hsl(100, 0.4, 0.34);
      const body = Math.abs(u - 0.5) < 0.3 && v > 0.45 && v < 0.82;
      const roof = v > 0.2 && v <= 0.45 && Math.abs(u - 0.5) < 0.34 - (0.45 - v) * 1.2;
      if (body) c = hsl((hue + 30) % 360, 0.2, 0.8);
      if (roof) c = mix(hsl(hue, 0.25, 0.28), hsl(hue, 0.2, 0.2), (Math.floor(v * 40) % 2) * 0.5);
      if (body && v > 0.55 && v < 0.68 && (Math.abs(u - 0.36) < 0.06 || Math.abs(u - 0.64) < 0.06)) c = hsl(45, 0.9, 0.7);
      if (body && v > 0.62 && Math.abs(u - 0.5) < 0.05) c = hsl(hue, 0.3, 0.3);
      return c;
    }
    case 'room': {
      let c = mix(hsl((hue + 20) % 360, 0.25, 0.82), hsl((hue + 20) % 360, 0.25, 0.64), v);
      if (v > 0.68) c = mix(hsl(28, 0.35, 0.5), hsl(28, 0.35, 0.36), (v - 0.68) * 3);
      if (u > 0.58 && u < 0.86 && v > 0.14 && v < 0.5) c = mix([250, 244, 226], hsl(45, 0.8, 0.8), v);
      if (v > 0.5 && v < 0.7 && u > 0.08 && u < 0.5) c = mix(obj, bgB, 0.55);
      return c;
    }
    case 'device': {
      let c = mix(hsl(hue, 0.35, 0.16), hsl(hue, 0.4, 0.08), v);
      const inScreen = u > 0.14 && u < 0.86 && v > 0.14 && v < 0.72;
      if (inScreen) c = mix(bgA, [255, 255, 255], 0.35 + 0.25 * Math.sin(u * 8 + v * 5));
      if (v >= 0.72 && v < 0.8 && Math.abs(u - 0.5) < 0.42) c = hsl(hue, 0.08, 0.7);
      return c;
    }
    case 'car': {
      let c = mix(hsl(hue, 0.2, 0.25), hsl(hue, 0.2, 0.1), v);
      const bodyTop = 0.5 - 0.12 * Math.exp(-Math.pow((u - 0.52) / 0.18, 2));
      if (u > 0.12 && u < 0.9 && v > bodyTop && v < 0.72) c = mix(hsl((hue + 180) % 360, 0.6, 0.55), [255, 255, 255], Math.max(0, 0.6 - Math.abs(v - bodyTop - 0.04) * 8));
      if (Math.hypot((u - 0.27) * ar, v - 0.72) < 0.08 || Math.hypot((u - 0.75) * ar, v - 0.72) < 0.08) c = [20, 20, 22];
      return c;
    }
    case 'garment': {
      let c = mix(hsl(hue, 0.15, 0.85), hsl(hue, 0.15, 0.7), v);
      const shoulders = v > 0.18 && v < 0.3 && Math.abs(u - 0.5) < 0.12 + (v - 0.18) * 1.6;
      const body = v >= 0.3 && v < 0.9 && Math.abs(u - 0.5) < 0.3 - (v - 0.3) * 0.08;
      if (shoulders || body) c = mix(hsl((hue + 200) % 360, 0.45, 0.4), hsl((hue + 200) % 360, 0.45, 0.3), (Math.floor(u * 60) % 2) * 0.4);
      if (v < 0.18 && v > 0.08 && Math.abs(u - 0.5) < 0.01) c = [60, 60, 60];
      return c;
    }
    case 'fruit': {
      let c = mix(bgB, hsl(hue, 0.3, 0.12), v);
      for (let k = 0; k < 7; k++) {
        const cx = 0.15 + ((k * 37 + hue) % 70) / 100, cy = 0.2 + ((k * 53 + hue) % 60) / 100, r = 0.07 + (k % 3) * 0.03;
        if (Math.hypot((u - cx) * ar, v - cy) < r) c = mix(hsl((hue + k * 25) % 360, 0.75, 0.55), [255, 255, 255], Math.max(0, 0.35 - Math.hypot((u - cx + 0.02) * ar, v - cy + 0.02) * 4));
      }
      return c;
    }
    case 'person': {
      let c = mix(bgA, bgB, Math.hypot(u - 0.5, v - 0.3));
      if (v > 0.52 && Math.abs(u - 0.5) * ar < 0.08 + (v - 0.52) * 0.9) c = mix(obj, bgB, 0.25);
      if (Math.hypot((u - 0.5) * ar, v - 0.36) < 0.13) c = hsl(28, 0.45, 0.4);
      return c;
    }
    case 'table': {
      let c = v > 0.62 ? mix(hsl(28, 0.4, 0.42), hsl(28, 0.4, 0.3), (v - 0.62) * 2.5) : mix(bgA, bgB, v * 0.8);
      if (Math.hypot((u - 0.5) / 0.22 * ar, (v - 0.66) / 0.05) < 1) c = [238, 236, 230];
      if (Math.abs(u - 0.5) * ar < 0.12 && v > 0.42 && v < 0.66) c = mix(obj, [255, 255, 255], 0.4 - Math.abs(u - 0.5) * 2);
      return c;
    }
    case 'texture':
      return mix(hsl(hue, 0.4, 0.5), hsl((hue + 30) % 360, 0.45, 0.3), 0.5 + 0.5 * Math.sin(u * 40 + Math.sin(v * 12) * 3));
    default: {
      let c = mix(bgA, bgB, Math.min(1, Math.hypot(u - 0.5, (v - 0.44) / ar) / 0.75));
      const ow = Math.min(W, H) * 0.18 / W, oh = 0.34;
      const dx = Math.abs(u - 0.5) / ow, dy = Math.abs(v - 0.55) / oh;
      if (dx <= 1 && dy <= 1 && !(dy > 0.85 && dx > 0.8)) c = obj.map((val, i) => Math.round(val * 0.85 + c[i] * 0.15 - dx * 30));
      if (dx >= 0.12 && dx <= 0.25 && dy <= 0.9) c = [255, 255, 255];
      return c;
    }
  }
}

function mockPng(prompt, aspectRatio) {
  const [W, H] = aspectRatio === '16:9-hd' ? [1280, 720] : aspectRatio === '16:9' ? [640, 360] : aspectRatio === '4:3' ? [480, 360] : aspectRatio === '4:5' ? [320, 400] : aspectRatio === '3:4' ? [300, 400] : [400, 400];
  const seed = hash(String(prompt || ''));
  const hue = seed % 360;
  const kind = subjectOf(prompt);
  const row = W * 3 + 1, raw = Buffer.alloc(row * H);
  let n = seed || 1;
  for (let y = 0; y < H; y++) {
    raw[y * row] = 0;
    for (let x = 0; x < W; x++) {
      const c = pixel(kind, x / W, y / H, hue, W, H);
      n ^= n << 13; n ^= n >>> 17; n ^= n << 5; // xorshift grain
      const g = ((n >>> 0) % 13) - 6;
      const o = y * row + 1 + x * 3;
      raw[o] = Math.max(0, Math.min(255, c[0] + g)); raw[o + 1] = Math.max(0, Math.min(255, c[1] + g)); raw[o + 2] = Math.max(0, Math.min(255, c[2] + g));
    }
  }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 2;
  const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 6 })), chunk('IEND', Buffer.alloc(0))]);
  return `data:image/png;base64,${png.toString('base64')}`;
}

module.exports = { mockPng, subjectOf };
