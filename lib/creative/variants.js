'use strict';
// THE PICTURES A PAGE SHIPS, AT THE SIZES A SCREEN NEEDS. An owner's photo is stored as it came -- often a PNG up to 2400 px
// wide (the app makes every upload a PNG), several megabytes each. A phone was sent every one whole: tens of megabytes, and
// Safari's memory for a page with motion, clips and 3D ran out. Here each picture gets smaller copies: a photograph as a
// JPEG (a fraction of a PNG's weight), a picture with transparency (a cut-out) as a smaller PNG, so it keeps its clear
// edges; a screen picks the size it needs (the page's srcset). Copies are made once and kept (content-addressed by the
// stored file and the width), so a preview never makes them again.
//
//   variants(buf, mime, { ref, cacheDir }) -> [{ w, h, ext, mime, buf }] (widest last; [] when the picture is not one this
//     makes copies of -- a WebP, an SVG, a GIF, a file it cannot read -- or is already smaller than the smallest copy)
const fs = require('fs'); const path = require('path'); const os = require('os'); const crypto = require('crypto');
const PNG = require('./png');
let JPEG = null; try { JPEG = require('jpeg-js'); } catch (e) { JPEG = null; }

const WIDTHS = [640, 1200, 1920];
const QUALITY = 82;
const VERSION = 1;
const CACHE = path.join(os.tmpdir(), 'sr-picture-variants');

function decode(buf, mime) {
  if (/png/.test(mime) && PNG.isPng(buf)) return PNG.decode(buf);
  if (/jpe?g/.test(mime) && JPEG) { const j = JPEG.decode(buf, { useTArray: true, formatAsRGBA: true, maxMemoryUsageInMB: 512 }); return { width: j.width, height: j.height, data: j.data }; }
  return null;
}
// (transparent where it matters: more than a sliver of its pixels see through)
function transparent(img) {
  const d = img.data; const n = img.width * img.height; let clear = 0; const step = Math.max(1, Math.floor(n / 40000));
  for (let i = 0; i < n; i += step) if (d[i * 4 + 3] < 250) clear++;
  return clear / Math.ceil(n / step) > 0.002;
}
// a box-filtered copy w pixels wide (sharp at any reduction: every source pixel counts)
function shrink(img, w) {
  const k = w / img.width; const h = Math.max(1, Math.round(img.height * k)); const out = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    const y0 = Math.floor(y / k), y1 = Math.max(y0 + 1, Math.min(img.height, Math.floor((y + 1) / k)));
    for (let x = 0; x < w; x++) {
      const x0 = Math.floor(x / k), x1 = Math.max(x0 + 1, Math.min(img.width, Math.floor((x + 1) / k)));
      let r = 0, g = 0, b = 0, a = 0, n = 0;
      for (let yy = y0; yy < y1; yy++) { let i = (yy * img.width + x0) * 4; for (let xx = x0; xx < x1; xx++, i += 4) { r += img.data[i]; g += img.data[i + 1]; b += img.data[i + 2]; a += img.data[i + 3]; n++; } }
      const o = (y * w + x) * 4; out[o] = r / n; out[o + 1] = g / n; out[o + 2] = b / n; out[o + 3] = a / n;
    }
  }
  return { width: w, height: h, data: out };
}
function variants(buf, mime, opts) {
  const o = opts || {}; if (!buf || !buf.length || !/png|jpe?g/.test(mime || '')) return [];
  const dir = o.cacheDir || CACHE; const key = crypto.createHash('sha256').update(String(VERSION)).update(o.ref || '').update(buf.length ? buf.subarray(0, 4096) : '').update(String(buf.length)).digest('hex').slice(0, 24);
  const manifest = path.join(dir, key + '.json');
  try { const m = JSON.parse(fs.readFileSync(manifest, 'utf8')); return m.map(v => Object.assign({}, v, { buf: fs.readFileSync(path.join(dir, v.file)) })); } catch (e) { /* made below */ }
  let img; try { img = decode(buf, mime); } catch (e) { img = null; }
  if (!img || !img.width || !img.height) return [];
  const clear = transparent(img); if (!clear && !JPEG) return [];
  const out = [];
  for (const w of WIDTHS) {
    if (w >= img.width) break;
    const s = shrink(img, w);
    const enc = clear ? { ext: 'png', mime: 'image/png', buf: PNG.encode(s) } : { ext: 'jpg', mime: 'image/jpeg', buf: Buffer.from(JPEG.encode({ width: s.width, height: s.height, data: s.data }, QUALITY).data) };
    out.push({ w: s.width, h: s.height, ext: enc.ext, mime: enc.mime, buf: enc.buf });
  }
  // (an opaque photograph also gets a JPEG at its own size, when that is lighter than what was stored -- a big PNG photo)
  if (!clear) { const full = Buffer.from(JPEG.encode({ width: img.width, height: img.height, data: img.data }, QUALITY).data); if (full.length < buf.length * 0.8) out.push({ w: img.width, h: img.height, ext: 'jpg', mime: 'image/jpeg', buf: full, full: true }); }
  try {
    fs.mkdirSync(dir, { recursive: true });
    const m = out.map((v, i) => { const file = `${key}-${i}.${v.ext}`; fs.writeFileSync(path.join(dir, file), v.buf); return { w: v.w, h: v.h, ext: v.ext, mime: v.mime, full: !!v.full, file }; });
    fs.writeFileSync(manifest, JSON.stringify(m));
  } catch (e) { /* not kept: made again next time */ }
  return out;
}

module.exports = { variants, WIDTHS, QUALITY };
