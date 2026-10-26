// PHOTO ANALYSIS: where the subject of a business's photo is (the car, the plate, the haircut), so the photo hero can
// light and focus the subject itself instead of moving the whole picture. U²-Netp (design-packages/engine/models) runs
// once per photo when the site is built, on the server, through onnxruntime-web's WebAssembly: about 3 seconds a
// photo, no GPU and no paid service. The result travels with the photo as a small greyscale JPEG mask.
//
// It never decides on its own that a photo has a subject: a mask that covers almost nothing (a wide scene: a garden,
// a room, a launch pad) or almost everything (a close-up) says "scene", and the hero keeps its plain camera moves.
'use strict';

const fs = require('fs');
const path = require('path');
const jpeg = require('jpeg-js');

const S = 320; // the model's input and output size
const MODEL = path.join(__dirname, '..', 'design-packages', 'engine', 'models', 'u2netp.onnx');
const MEAN = [0.485, 0.456, 0.406], STD = [0.229, 0.224, 0.225];

let session = null;
async function model() {
  if (!session) {
    const ort = require('onnxruntime-web');
    ort.env.wasm.numThreads = 1; // (one thread: steady on a small server, and no worker files to serve)
    session = ort.InferenceSession.create(fs.readFileSync(MODEL)).then((s) => ({ ort, s }));
  }
  return session;
}

// a JPEG (Buffer or data URL) as RGBA pixels; anything else -> null (the browser sends JPEGs; others go unanalysed)
function decode(input) {
  let buf = input;
  if (typeof input === 'string') { const m = /^data:image\/jpeg;base64,(.+)$/.exec(input); if (!m) return null; buf = Buffer.from(m[1], 'base64'); }
  if (!Buffer.isBuffer(buf) || buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  try { const j = jpeg.decode(buf, { useTArray: true, maxMemoryUsageInMB: 256 }); return { w: j.width, h: j.height, d: j.data }; } catch (e) { return null; }
}

// the photo squeezed to the model's 320×320, normalised, channels first
function tensorData(img) {
  const out = new Float32Array(3 * S * S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const sx = Math.min(img.w - 1, Math.max(0, (x + 0.5) * img.w / S - 0.5)), sy = Math.min(img.h - 1, Math.max(0, (y + 0.5) * img.h / S - 0.5));
    const x0 = Math.floor(sx), y0 = Math.floor(sy), x1 = Math.min(img.w - 1, x0 + 1), y1 = Math.min(img.h - 1, y0 + 1), fx = sx - x0, fy = sy - y0;
    for (let c = 0; c < 3; c++) {
      const p = (xx, yy) => img.d[(yy * img.w + xx) * 4 + c];
      const v = (p(x0, y0) * (1 - fx) + p(x1, y0) * fx) * (1 - fy) + (p(x0, y1) * (1 - fx) + p(x1, y1) * fx) * fy;
      out[c * S * S + y * S + x] = (v / 255 - MEAN[c]) / STD[c];
    }
  }
  return out;
}

// the photo's subject: { kind: 'subject'|'scene', mask (data URL), coverage, cx, cy, box: [x0, y0, x1, y1] } in
// percent of the photo; null when the photo can't be read
async function analyse(input) {
  const img = decode(input);
  if (!img) return null;
  const { ort, s } = await model();
  const out = await s.run({ [s.inputNames[0]]: new ort.Tensor('float32', tensorData(img), [1, 3, S, S]) });
  const m = out[s.outputNames[0]].data;
  let lo = Infinity, hi = -Infinity; for (const v of m) { if (v < lo) lo = v; if (v > hi) hi = v; }
  const span = hi - lo > 1e-6 ? hi - lo : 1, px = Buffer.alloc(S * S * 4);
  let cov = 0, sx = 0, sy = 0, x0 = S, y0 = S, x1 = 0, y1 = 0;
  for (let i = 0; i < S * S; i++) {
    const v = (m[i] - lo) / span, g = Math.round(v * 255), x = i % S, y = (i - x) / S;
    px[i * 4] = px[i * 4 + 1] = px[i * 4 + 2] = g; px[i * 4 + 3] = 255;
    cov += v; sx += v * x; sy += v * y;
    if (v > 0.5) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  const coverage = cov / (S * S), pct = (n) => Math.round(n / S * 100);
  // a subject is something that stands out and leaves room around it; a near-empty or near-full mask is a scene
  const kind = coverage >= 0.05 && coverage <= 0.75 && hi - lo > 0.5 && x1 > x0 ? 'subject' : 'scene';
  const mask = 'data:image/jpeg;base64,' + Buffer.from(jpeg.encode({ width: S, height: S, data: px }, 82).data).toString('base64');
  return { kind, mask, coverage: +coverage.toFixed(3), cx: cov ? pct(sx / cov) : 50, cy: cov ? pct(sy / cov) : 50, box: x1 > x0 ? [pct(x0), pct(y0), pct(x1 + 1), pct(y1 + 1)] : null };
}

module.exports = { analyse, decode, S };
