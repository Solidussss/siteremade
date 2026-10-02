'use strict';
// The 3D fixture: a small bottle, made here from numbers -- no provider, no download, no licence to track. It stands in for
// what an image-to-3D provider hands back, and it is deliberately the kind of file one hands back:
//   - lying on its side (authored Z-up, though glTF says Y-up), 40 times too large and nowhere near the origin
//   - three named parts (Body, Cap, Label) with three materials, one of them textured
//   - a label texture twice the size a website may ship (4096 px)
// so that normalisation has something to prove. product-raw.glb is the provider's file; product-normalized.glb is what
// Blender (scripts/blender/prepare_asset.py) made of it, committed so that everything after Blender -- storage, the page,
// the export -- is tested on machines that have no Blender.
//
//   node test/fixtures/three-d/make-fixture.js              write product-raw.glb
//   node test/fixtures/three-d/make-fixture.js --normalize  also run Blender and write product-normalized.glb
const fs = require('fs');
const path = require('path');
const PNG = require('../../../lib/creative/png');

const DIR = __dirname;
const TAU = Math.PI * 2;

// a surface of revolution about +Y. profile: [[radius, height]] from bottom to top; v runs along it, u around it
function lathe(profile, seg) {
  const pos = [], nor = [], uv = [], idx = []; const n = profile.length; const len = [0];
  for (let i = 1; i < n; i++) len.push(len[i - 1] + Math.hypot(profile[i][0] - profile[i - 1][0], profile[i][1] - profile[i - 1][1]));
  for (let i = 0; i < n; i++) {
    const a = profile[Math.max(0, i - 1)], b = profile[Math.min(n - 1, i + 1)]; let nr = b[1] - a[1], ny = -(b[0] - a[0]); const l = Math.hypot(nr, ny) || 1; nr /= l; ny /= l;
    for (let s = 0; s <= seg; s++) { const t = (s / seg) * TAU; pos.push(profile[i][0] * Math.cos(t), profile[i][1], profile[i][0] * Math.sin(t)); nor.push(nr * Math.cos(t), ny, nr * Math.sin(t)); uv.push(1 - s / seg, 1 - len[i] / len[n - 1]); }
  }
  for (let i = 0; i < n - 1; i++) for (let s = 0; s < seg; s++) { const a = i * (seg + 1) + s, b = a + seg + 1; idx.push(a, b, a + 1, a + 1, b, b + 1); }
  return { pos, nor, uv, idx };
}
// the label's picture: unmistakably different on each side, so a turn is visible in a screenshot
function labelTexture(w, h) {
  const data = new Uint8ClampedArray(w * h * 4);
  const put = (x, y, r, g, b) => { const o = (y * w + x) * 4; data[o] = r; data[o + 1] = g; data[o + 2] = b; data[o + 3] = 255; };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const u = x / w, v = y / h;
    let c = [244, 236, 218];                                                   // paper
    if (u < 0.34) c = [196, 48, 40];                                           // a red panel: the front
    if (u < 0.34 && Math.hypot((u - 0.17) * (w / h), v - 0.5) < 0.3) c = [250, 244, 230]; // its disc
    if (u > 0.4 && u < 0.62 && Math.floor(v * 9) % 2 === 0) c = [28, 60, 110];  // blue bars: one side
    if (u > 0.7 && u < 0.94 && Math.floor((u + v * 0.25) * 28) % 2 === 0) c = [30, 120, 84]; // green stripes: the back
    if (v < 0.06 || v > 0.94) c = [200, 160, 60];                              // a gold rule top and bottom
    put(x, y, c[0], c[1], c[2]);
  }
  return PNG.encode({ width: w, height: h, data });
}

// the bottle's outline, as (radius at height): the same numbers the model is turned from
const BODY = [[0, 0], [0.3, 0], [0.33, 0.03], [0.33, 0.2], [0.33, 0.38], [0.33, 0.55], [0.31, 0.62], [0.25, 0.7], [0.17, 0.76], [0.12, 0.8], [0.11, 0.84], [0.11, 0.92], [0.125, 0.94], [0.125, 0.96], [0.1, 0.96]];
function radiusAt(y) {
  if (y >= 0.93 && y <= 1.02) return y > 1.0 ? 0.135 - (y - 1.0) * 0.75 : 0.135;
  let r = 0; for (let i = 1; i < BODY.length; i++) { const p = BODY[i - 1], q = BODY[i]; if (q[1] === p[1]) { if (Math.abs(y - p[1]) < 1e-6) r = Math.max(r, p[0], q[0]); continue; } if (y >= p[1] && y <= q[1]) r = Math.max(r, p[0] + (q[0] - p[0]) * ((y - p[1]) / (q[1] - p[1]))); }
  return r;
}
// "the owner's upload": a plain front-on picture of the same bottle (drawn, not photographed), on a plain backdrop or cut
// out. It is the SOURCE of the 3D model in the demo and the tests, and what the page shows wherever the model cannot run.
function productPhoto(w, h, cutout) {
  const data = new Uint8ClampedArray(w * h * 4); const scale = (h * 0.86) / 1.02; const cx = w / 2; const base = h * 0.93;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const Y = (base - y) / scale; const dx = (x - cx) / scale; const r = Y >= 0 && Y <= 1.02 ? radiusAt(Y) : 0; const o = (y * w + x) * 4;
    if (!r || Math.abs(dx) > r) { if (!cutout) { const g = 1 - 0.07 * (y / h); data[o] = 241 * g; data[o + 1] = 236 * g; data[o + 2] = 226 * g; data[o + 3] = 255; } continue; }
    const t = dx / r; const lit = 0.42 + 0.7 * Math.sqrt(Math.max(0, 1 - t * t)) + 0.35 * Math.exp(-((t + 0.45) ** 2) / 0.012);
    let c = [26, 82, 140];
    if (Y >= 0.93) c = [212, 158, 56];
    else if (Y >= 0.16 && Y <= 0.5) { c = [244, 236, 218]; if (Math.abs(t) < 0.8) c = [196, 48, 40]; if (Math.hypot(t * 0.6, (Y - 0.33) / 0.2) < 0.55) c = [250, 244, 230]; if (Y < 0.18 || Y > 0.48) c = [200, 160, 60]; }
    data[o] = Math.min(255, c[0] * lit); data[o + 1] = Math.min(255, c[1] * lit); data[o + 2] = Math.min(255, c[2] * lit); data[o + 3] = 255;
  }
  return PNG.encode({ width: w, height: h, data });
}

function build() {
  const bin = []; let offset = 0; const views = []; const accessors = [];
  const pad = b => (b.length % 4 ? Buffer.concat([b, Buffer.alloc(4 - (b.length % 4))]) : b);
  const view = (buf, target) => { const b = pad(buf); views.push(Object.assign({ buffer: 0, byteOffset: offset, byteLength: buf.length }, target ? { target } : {})); bin.push(b); offset += b.length; return views.length - 1; };
  const f32 = (arr, type, withBounds) => {
    const n = { VEC3: 3, VEC2: 2 }[type]; const acc = { bufferView: view(Buffer.from(new Float32Array(arr).buffer), 34962), componentType: 5126, count: arr.length / n, type };
    if (withBounds) { acc.min = [0, 1, 2].map(k => Math.min(...arr.filter((_, i) => i % 3 === k))); acc.max = [0, 1, 2].map(k => Math.max(...arr.filter((_, i) => i % 3 === k))); }
    accessors.push(acc); return accessors.length - 1;
  };
  const u32 = arr => { accessors.push({ bufferView: view(Buffer.from(new Uint32Array(arr).buffer), 34963), componentType: 5125, count: arr.length, type: 'SCALAR' }); return accessors.length - 1; };
  const mesh = (name, g, material) => ({ name, primitives: [{ attributes: { POSITION: f32(g.pos, 'VEC3', true), NORMAL: f32(g.nor, 'VEC3'), TEXCOORD_0: f32(g.uv, 'VEC2') }, indices: u32(g.idx), material }] });

  const body = lathe(BODY, 96);
  const cap = lathe([[0.135, 0.93], [0.135, 0.97], [0.135, 1.0], [0.12, 1.02], [0.06, 1.02], [0, 1.02]], 96);
  const label = lathe([[0.334, 0.16], [0.334, 0.27], [0.334, 0.38], [0.334, 0.5]], 96);
  const meshes = [mesh('Body', body, 0), mesh('Cap', cap, 1), mesh('Label', label, 2)];
  const image = view(labelTexture(4096, 1024));
  const s = Math.SQRT1_2;
  const json = {
    asset: { version: '2.0', generator: 'SiteRemade 3D fixture (test/fixtures/three-d/make-fixture.js)' }, scene: 0, scenes: [{ name: 'Scene', nodes: [0] }],
    // the mess a provider leaves: the bottle's own up (+Y) turned to +Z, 40 times too large, far from the origin
    nodes: [{ name: 'Product', children: [1, 2, 3], rotation: [s, 0, 0, s], scale: [40, 40, 40], translation: [3.2, 1.5, -2] }, { name: 'Body', mesh: 0 }, { name: 'Cap', mesh: 1 }, { name: 'Label', mesh: 2 }],
    meshes,
    materials: [
      { name: 'Glass', pbrMetallicRoughness: { baseColorFactor: [0.0103, 0.0844, 0.2623, 1], metallicFactor: 0.1, roughnessFactor: 0.22 } },
      { name: 'Gold', pbrMetallicRoughness: { baseColorFactor: [0.83, 0.62, 0.22, 1], metallicFactor: 1, roughnessFactor: 0.3 } },
      { name: 'Paper', pbrMetallicRoughness: { baseColorTexture: { index: 0 }, metallicFactor: 0, roughnessFactor: 0.8 } },
    ],
    textures: [{ sampler: 0, source: 0 }], samplers: [{ magFilter: 9729, minFilter: 9987, wrapS: 10497, wrapT: 33071 }], images: [{ name: 'label', mimeType: 'image/png', bufferView: image }],
    accessors, bufferViews: views, buffers: [{ byteLength: offset }],
  };
  let j = Buffer.from(JSON.stringify(json), 'utf8'); if (j.length % 4) j = Buffer.concat([j, Buffer.alloc(4 - (j.length % 4), 0x20)]);
  const b = Buffer.concat(bin);
  const head = Buffer.alloc(12); head.writeUInt32LE(0x46546c67, 0); head.writeUInt32LE(2, 4); head.writeUInt32LE(12 + 8 + j.length + 8 + b.length, 8);
  const jh = Buffer.alloc(8); jh.writeUInt32LE(j.length, 0); jh.writeUInt32LE(0x4e4f534a, 4);
  const bh = Buffer.alloc(8); bh.writeUInt32LE(b.length, 0); bh.writeUInt32LE(0x004e4942, 4);
  return Buffer.concat([head, jh, j, bh, b]);
}

if (require.main === module) {
  const raw = build(); fs.writeFileSync(path.join(DIR, 'product-raw.glb'), raw);
  console.log(`wrote product-raw.glb (${raw.length} bytes)`);
  if (process.argv.includes('--normalize')) {
    const blender = require('../../../lib/three-d/blender');
    blender.prepareAsset({ bytes: raw, ext: '.glb', options: { upAxis: 'Z' } }).then(r => {
      if (!r.ok) { console.error(`Blender did not normalise it: ${r.code} -- ${r.reason}`); process.exit(1); }
      fs.writeFileSync(path.join(DIR, 'product-normalized.glb'), r.glb);
      fs.writeFileSync(path.join(DIR, 'product-normalized.report.json'), JSON.stringify(Object.assign({}, r.report, { blender: r.blender }), null, 2) + '\n');
      console.log(`wrote product-normalized.glb (${r.glb.length} bytes, Blender ${r.blender})`);
    });
  }
}
module.exports = { build, lathe, labelTexture, productPhoto };
