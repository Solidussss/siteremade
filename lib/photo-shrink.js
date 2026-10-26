// A photo made the site's size: a JPEG at most 1600 px on its long side, under the site's photo limit. Pure
// JavaScript (jpeg-js), so it runs anywhere; lib/photo-work.js runs it off the server's main thread.
'use strict';

const jpeg = require('jpeg-js');

// a JPEG at most 1600 px on its long side (each output pixel the average of the pixels it covers), re-encoded to stay
// under the site's photo size
function shrink(buf, side = 1600) {
  let img; try { img = jpeg.decode(buf, { useTArray: true, maxMemoryUsageInMB: 700 }); } catch (e) { return null; }
  const k = Math.min(1, side / Math.max(img.width, img.height)), W = Math.max(1, Math.round(img.width * k)), H = Math.max(1, Math.round(img.height * k));
  const out = Buffer.alloc(W * H * 4);
  for (let y = 0; y < H; y++) {
    const y0 = Math.floor(y / k), y1 = Math.min(img.height, Math.max(y0 + 1, Math.floor((y + 1) / k)));
    for (let x = 0; x < W; x++) {
      const x0 = Math.floor(x / k), x1 = Math.min(img.width, Math.max(x0 + 1, Math.floor((x + 1) / k)));
      let r = 0, g = 0, b = 0, n = 0;
      for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) { const i = (yy * img.width + xx) * 4; r += img.data[i]; g += img.data[i + 1]; b += img.data[i + 2]; n++; }
      const o = (y * W + x) * 4; out[o] = r / n; out[o + 1] = g / n; out[o + 2] = b / n; out[o + 3] = 255;
    }
  }
  for (const q of [84, 76, 68, 60]) { const enc = Buffer.from(jpeg.encode({ width: W, height: H, data: out }, q).data); if (enc.length < 850 * 1024) return enc; }
  return null;
}

module.exports = { shrink };
