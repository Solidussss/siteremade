'use strict';
// BESPOKE (v5) -- the business's own photos, prepared for the page: cropped to what the photo review chose (text
// overlays, app UI and people cut away), resized to at most 1600px wide, saved as JPEG into <out>/media/.
//   prepare(plan, { inDir, outDir }) -> [{ file, out, ok, error? }]
//   plan: [{ file: 'IMG_1.jpg', out: 'room.jpg', crop?: { x, y, w, h } }]   crop values are fractions of the photo
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

function ffmpegPath() {
  try { return require('ffmpeg-static'); } catch (e) { return 'ffmpeg'; }
}
const SAFE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,80}\.(?:jpe?g|png|webp)$/i;
const frac = (v) => Math.min(1, Math.max(0, Number(v) || 0));

function filter(crop, maxWidth = 1600) {
  const parts = [];
  if (crop) {
    const x = frac(crop.x), y = frac(crop.y), w = Math.min(frac(crop.w) || 1, 1 - x), h = Math.min(frac(crop.h) || 1, 1 - y);
    parts.push(`crop=trunc(iw*${w.toFixed(4)}/2)*2:trunc(ih*${h.toFixed(4)}/2)*2:trunc(iw*${x.toFixed(4)}):trunc(ih*${y.toFixed(4)})`);
  }
  parts.push(`scale='min(${maxWidth},iw)':-2`);
  return parts.join(',');
}

function prepare(plan, { inDir, outDir, run = execFileSync } = {}) {
  const dir = path.join(outDir, 'media');
  fs.mkdirSync(dir, { recursive: true });
  return (plan || []).map((p) => {
    if (!SAFE.test(p.file || '') || !SAFE.test(p.out || '')) return { file: p.file, out: p.out, ok: false, error: 'bad file name' };
    const src = path.join(inDir, p.file);
    if (!fs.existsSync(src)) return { file: p.file, out: p.out, ok: false, error: 'no such photo' };
    const out = path.join(dir, p.out.replace(/\.(png|webp)$/i, '.jpg'));
    try {
      run(ffmpegPath(), ['-v', 'error', '-y', '-i', src, '-vf', filter(p.crop), '-q:v', '3', out]);
      return { file: p.file, out: path.basename(out), ok: true };
    } catch (e) { return { file: p.file, out: p.out, ok: false, error: String(e.message || e).slice(0, 200) }; }
  });
}

module.exports = { prepare, filter, SAFE };
