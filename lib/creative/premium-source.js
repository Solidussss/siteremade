'use strict';
// WHICH PICTURES HIGGSFIELD MAY TRANSFORM (premium video and premium images) -- browser-safe: the studio shows the same
// verdict the server enforces.
//
// The rule is simple: the owner's own UPLOADS only. A picture found on the web (research, discovery, a web picture the
// owner picked) can be on the page -- in the layout, a composition, the art direction -- but it is never sent to
// Higgsfield, whatever its licence says. And an upload must be good enough to become a full-screen cinematic video:
//
//   eligible(asset, ctx)  -> { ok, code, reason }   the whole verdict (an upload, then good enough)
//   quality(asset, ctx)   -> { ok, code, reason }   the quality gate alone
//   sharpness(img)        -> number | null           how crisp a picture's strongest edges are ({ width, height, data } RGBA)
//
// ctx: { byId } (a cut-out is judged by the photo it came from), { measured: { width, height, bytes, mime } } (what the
// server read from the file itself: it wins over what the browser reported)
const GATE = {
  minLong: 1280, minShort: 720,      // the picture itself
  cropW: 1280, cropH: 720,           // what is left after a full-screen 16:9 crop
  minSubject: 0.02,                  // the subject's share of the frame (when the picture shows where it is)
  minSharpness: 0.45,                // crisp edges (sharpness(): about 1 for a sharp photo, under 0.3 when clearly blurred)
  maxBlockiness: 2,                  // blockiness(): about 1 for a clean picture, 2 and above when heavily compressed
  minBpp: 0.015,                     // (the server's own check, from the file: bytes per pixel of a JPEG / WebP this low is
                                     // heavily compressed whatever the picture shows)
};
const MESSAGE = {
  not_upload: 'found on the web -- premium video uses uploaded images only',
  picked_web: 'a web picture you picked -- premium video uses uploaded images only',
  logo: 'your logo is never turned into video',
  missing: 'the picture is not on the page',
  too_small: 'upload too small',
  too_narrow: 'upload not suitable for full-screen premium video (too narrow to fill a wide screen)',
  subject_cut: 'upload not suitable for full-screen premium video (the subject would be cut off)',
  subject_small: 'upload not suitable for full-screen premium video (the subject is too small in the picture)',
  transparent: 'a transparent cut-out -- upload the full photo for premium video',
  too_blurry: 'upload too blurry',
  too_compressed: 'upload too heavily compressed',
  not_measured: 'the upload could not be checked',
};
const say = (code, extra) => ({ ok: false, code, reason: MESSAGE[code] + (extra ? ` ${extra}` : '') });

function eligible(asset, ctx) {
  const c = ctx || {}; const a = asset;
  if (!a || a.removed || a.failed) return say('missing');
  // (a cut-out is the owner's picture when the photo it came from is)
  if (a.cutoutOf) { const p = c.byId && c.byId.get(a.cutoutOf); return p ? eligible(p, Object.assign({}, c, { measured: null })) : say('missing'); }
  if (a.ownerPicked) return say('picked_web');
  // (an upload carries no web address: a picture that does came from the web, whatever it is labelled)
  if (a.origin !== 'upload' || a.pageUrl || a.sourceUrl) return say('not_upload');
  if (a.ownerRole === 'logo' || a.kind === 'logo') return say('logo');
  return quality(a, c);
}

function quality(asset, ctx) {
  const c = ctx || {}; const a = asset || {}; const s = a.assess || {}; const m = c.measured || null;
  const w = (m && m.width) || s.width || 0, h = (m && m.height) || s.height || 0;
  if (!w || !h) return say('not_measured');
  if (s.transparent) return say('transparent');
  if (Math.max(w, h) < GATE.minLong || Math.min(w, h) < GATE.minShort) return say('too_small', `(${w}×${h}; premium video needs at least ${GATE.minLong}×${GATE.minShort})`);
  // the full-screen frame: a 16:9 crop of the picture must itself be at least 1280 x 720
  const cw = Math.min(w, h * 16 / 9), ch = cw * 9 / 16;
  if (cw < GATE.cropW || ch < GATE.cropH) return say('too_narrow');
  // where the subject is (a plain-background or transparent picture shows it): big enough, and inside that frame
  const b = Array.isArray(s.subject) && s.subject.length === 4 ? s.subject : null;
  if (b) {
    const sw = b[2] - b[0], sh = b[3] - b[1];
    if (sw * sh < GATE.minSubject) return say('subject_small');
    if (sw > (cw / w) * 1.04 || sh > (ch / h) * 1.04) return say('subject_cut');
  }
  const sharp = a.quality && typeof a.quality.sharpness === 'number' ? a.quality.sharpness : null;
  if (sharp != null && sharp < GATE.minSharpness) return say('too_blurry');
  const blk = a.quality && typeof a.quality.blockiness === 'number' ? a.quality.blockiness : null;
  if (blk != null && blk >= GATE.maxBlockiness) return say('too_compressed');
  const bytes = (m && m.bytes) || 0; const mime = (m && m.mime) || a.mime || '';
  if (bytes && /jpeg|webp/.test(mime) && bytes / (w * h) < GATE.minBpp) return say('too_compressed');
  return { ok: true, code: 'ok', reason: "your own upload, good enough for full-screen premium video" };
}

// how crisp the strongest edges are, independent of contrast: at a sharp edge the second derivative is as large as the
// first; blur spreads the edge and the second derivative falls much faster (ratio ~ 1 / blur radius). Measured on the
// brightest 3% of edges of the picture as the studio reads it (at most ~1100 px wide -- about the video's own size).
function sharpness(img) {
  const W = img && img.width, H = img && img.height, d = img && img.data; if (!W || !H || !d || W < 16 || H < 16) return null;
  const step = Math.max(1, Math.floor(Math.sqrt((W * H) / 250000)));
  const L = (x, y) => { const i = (y * W + x) * 4; return 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]; };
  const pts = [];
  for (let y = 2; y < H - 2; y += step) for (let x = 2; x < W - 2; x += step) {
    const gx = (L(x + 1, y) - L(x - 1, y)) / 2, gy = (L(x, y + 1) - L(x, y - 1)) / 2; const g = Math.hypot(gx, gy); if (g < 6) continue;
    pts.push([g, x, y]);
  }
  if (pts.length < 40) return null; // (a picture with almost no edges cannot be judged: never rejected for blur)
  pts.sort((p, q) => q[0] - p[0]); const top = pts.slice(0, Math.max(40, Math.round(pts.length * 0.03)));
  let sum = 0;
  top.forEach(([g, x, y]) => { let lap = 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const xx = x + dx, yy = y + dy; const v = Math.abs(4 * L(xx, yy) - L(xx - 1, yy) - L(xx + 1, yy) - L(xx, yy - 1) - L(xx, yy + 1)); if (v > lap) lap = v; } sum += Math.min(3, lap / g); });
  return +(sum / top.length).toFixed(3);
}

// how blocky a JPEG's 8 x 8 grid has become: the brightness steps across block boundaries against the steps inside the
// blocks, on a crop read at the file's own resolution (aligned to the grid: x, y from 0). About 1 for a clean picture;
// heavy compression makes the boundary steps stand out (1.3 and above). null when the crop is too flat to tell.
function blockiness(img) {
  const W = img && img.width, H = img && img.height, d = img && img.data; if (!W || !H || !d || W < 64 || H < 64) return null;
  const L = (x, y) => { const i = (y * W + x) * 4; return 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]; };
  let on = 0, nOn = 0, off = 0, nOff = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W - 1; x++) { const v = Math.abs(L(x + 1, y) - L(x, y)); if (x % 8 === 7) { on += v; nOn++; } else { off += v; nOff++; } }
  for (let y = 0; y < H - 1; y++) for (let x = 0; x < W; x++) { const v = Math.abs(L(x, y + 1) - L(x, y)); if (y % 8 === 7) { on += v; nOn++; } else { off += v; nOff++; } }
  const a = on / Math.max(1, nOn), b = off / Math.max(1, nOff);
  if (b < 0.4 && a < 0.6) return null; // (a flat area: nothing to compare)
  return +(a / Math.max(0.05, b)).toFixed(3);
}

// the dimensions written in an image file's own header (PNG, JPEG, WebP) -- what the server trusts over the browser
function headerSize(buf) {
  const b = buf; if (!b || b.length < 30) return null;
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return { width: (b[16] << 24 | b[17] << 16 | b[18] << 8 | b[19]) >>> 0, height: (b[20] << 24 | b[21] << 16 | b[22] << 8 | b[23]) >>> 0, mime: 'image/png' };
  if (b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) { i++; continue; } const mk = b[i + 1]; if (mk === 0xd8 || mk === 0x01 || (mk >= 0xd0 && mk <= 0xd7)) { i += 2; continue; }
      const len = b[i + 2] << 8 | b[i + 3];
      if ((mk >= 0xc0 && mk <= 0xcf) && ![0xc4, 0xc8, 0xcc].includes(mk)) return { height: b[i + 5] << 8 | b[i + 6], width: b[i + 7] << 8 | b[i + 8], mime: 'image/jpeg' };
      i += 2 + len;
    }
    return null;
  }
  if (b.toString && b.slice(0, 4).toString('latin1') === 'RIFF' && b.slice(8, 12).toString('latin1') === 'WEBP') {
    const kind = b.slice(12, 16).toString('latin1');
    if (kind === 'VP8X') return { width: 1 + (b[24] | b[25] << 8 | b[26] << 16), height: 1 + (b[27] | b[28] << 8 | b[29] << 16), mime: 'image/webp' };
    if (kind === 'VP8L') { const v = b[21] | b[22] << 8 | b[23] << 16 | b[24] << 24; return { width: 1 + (v & 0x3fff), height: 1 + ((v >>> 14) & 0x3fff), mime: 'image/webp' }; }
    if (kind === 'VP8 ') return { width: (b[26] | b[27] << 8) & 0x3fff, height: (b[28] | b[29] << 8) & 0x3fff, mime: 'image/webp' };
  }
  return null;
}

module.exports = { GATE, MESSAGE, eligible, quality, sharpness, blockiness, headerSize };
