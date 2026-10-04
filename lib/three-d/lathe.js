'use strict';
// 3D FROM THE OWNER'S OWN PICTURE, FREE: a product that is round about its upright axis -- a can, a bottle, a jar, a cup, a
// candle -- is turned into a real 3D model from its cut-out alone. Its outline, measured row by row, is its profile; the
// profile turned about the axis is its shape (a surface of revolution); the photograph is wrapped back onto that shape the
// way it was printed (each column of the picture lands at the angle it was seen at: x = r * sin(angle)), so the label sits on
// the curve exactly as in the photo. No provider, no money: nothing leaves the server.
//   fromCutout(img, opts) -> { ok: true, glb: Buffer, info: { triangles, height, symmetry, rows } } | { ok: false, reason }
//     img: { width, height, data: RGBA } -- a cut-out (transparent background), as lib/creative/assets.js makes them
// A product that is not round about its axis (a shoe, a mug with a handle, a person) is refused: it stays a picture.
const PNG = require('../creative/png');

const LIMITS = { minRows: 40, maxAsym: 0.045, minFill: 0.86, rows: 150, segments: 96, texMax: 1536 };

function profile(img) {
  const { width: w, height: h, data } = img; const rows = [];
  for (let y = 0; y < h; y++) {
    let l = -1, r = -1, n = 0;
    for (let x = 0; x < w; x++) if (data[(y * w + x) * 4 + 3] > 128) { if (l < 0) l = x; r = x; n++; }
    if (l >= 0 && r - l >= 3) rows.push({ y, l, r, fill: n / (r - l + 1) });
  }
  return rows;
}
const median = a => { const s = a.slice().sort((x, y) => x - y); return s.length ? s[s.length >> 1] : 0; };

function fromCutout(img, opts) {
  const o = Object.assign({}, LIMITS, opts || {});
  if (!img || !img.width || !img.height || !img.data) return { ok: false, reason: 'no picture' };
  const rows = profile(img); if (rows.length < o.minRows) return { ok: false, reason: 'too small to measure' };
  // (a cast shadow left at the foot of the cut-out spreads wider than the product: rows at the bottom that jump past the
  // product's own width are the shadow, not the shape)
  { const lower = rows.slice(Math.floor(rows.length * 0.55), Math.floor(rows.length * 0.85)).map(r => r.r - r.l); const ref = median(lower) || 1;
    while (rows.length > o.minRows && (rows[rows.length - 1].r - rows[rows.length - 1].l) > ref * 1.08) rows.pop(); }
  // the axis: where the outline's middles agree; the shape must be round about it (left and right edges mirror each other)
  const cx = median(rows.map(r => (r.l + r.r) / 2)); const wMax = Math.max(...rows.map(r => r.r - r.l)) || 1;
  const asym = rows.map(r => Math.abs((cx - r.l) - (r.r - cx)) / wMax); const meanAsym = asym.reduce((a, b) => a + b, 0) / asym.length;
  const offRows = asym.filter(a => a > o.maxAsym * 2.5).length / asym.length;
  if (meanAsym > o.maxAsym || offRows > 0.1) return { ok: false, reason: 'not round about its axis', symmetry: +meanAsym.toFixed(3) };
  if (median(rows.map(r => r.fill)) < o.minFill) return { ok: false, reason: 'not a solid shape (gaps across it)' };
  // the profile: a half-width per row, smoothed (5-row median), sampled to a fixed number of rings
  const y0 = rows[0].y, y1 = rows[rows.length - 1].y, H = Math.max(1, y1 - y0);
  const byY = new Map(rows.map(r => [r.y, r]));
  const half = y => { const vs = []; for (let k = -2; k <= 2; k++) { const r = byY.get(Math.round(y) + k); if (r) vs.push(Math.max(0.5, Math.min(cx - r.l, r.r - cx))); } /* (the narrower side: a shadow on one side never widens the shape) */ return vs.length ? median(vs) : 0; };
  const N = Math.min(o.rows, H), M = o.segments; const ring = [];
  for (let i = 0; i <= N; i++) { const yp = y0 + (H * i) / N; ring.push({ yp, rp: Math.max(0.5, half(yp)) }); }
  // the texture: the cut-out's own box, its transparent surroundings filled with each row's edge colour (no dark seam at
  // the sides), within the size limit
  const bx0 = Math.max(0, Math.floor(cx - wMax / 2 - 2)), bx1 = Math.min(img.width - 1, Math.ceil(cx + wMax / 2 + 2));
  const tw0 = bx1 - bx0 + 1, th0 = H + 1, k = Math.min(1, o.texMax / Math.max(tw0, th0)); const TW = Math.max(8, Math.round(tw0 * k)), TH = Math.max(8, Math.round(th0 * k));
  const tex = new Uint8Array(TW * TH * 4);
  for (let ty = 0; ty < TH; ty++) {
    const sy = Math.min(y1, y0 + Math.round(ty / k)); const r = byY.get(sy) || byY.get(sy - 1) || byY.get(sy + 1) || rows[0];
    for (let tx = 0; tx < TW; tx++) {
      let sx = bx0 + Math.round(tx / k); sx = Math.max(r.l + 2, Math.min(r.r - 2, sx));
      const si = (sy * img.width + sx) * 4, ti = (ty * TW + tx) * 4; tex[ti] = img.data[si]; tex[ti + 1] = img.data[si + 1]; tex[ti + 2] = img.data[si + 2]; tex[ti + 3] = 255;
    }
  }
  const png = PNG.encode({ width: TW, height: TH, data: tex });
  // the mesh: model units are the product's height (1), centred on the origin, the front facing the camera (+z)
  const S = 1 / H; const pos = [], nor = [], uv = [], idx = [];
  const uOf = (yp, rp, phi) => { const s = Math.sin(Math.max(-Math.PI / 2, Math.min(Math.PI / 2, phi))); return ((cx + rp * 0.97 * s) - bx0) / tw0; };
  for (let i = 0; i <= N; i++) {
    const { yp, rp } = ring[i]; const Y = (y1 - yp) * S - 0.5, R = rp * S;
    const dR = i === 0 ? (ring[1].rp - ring[0].rp) : i === N ? (ring[N].rp - ring[N - 1].rp) : (ring[i + 1].rp - ring[i - 1].rp) / 2;
    const dY = -(H / N); const slope = (dR * S) / (dY * S); // dr/dY in model units
    for (let j = 0; j <= M; j++) {
      const phi = -Math.PI + (2 * Math.PI * j) / M; const sp = Math.sin(phi), cp = Math.cos(phi);
      pos.push(R * sp, Y, R * cp); const nl = Math.sqrt(1 + slope * slope); nor.push(sp / nl, -slope / nl, cp / nl);
      // (the visible half takes the photo at the column it was seen at; the far half continues the edge's colour)
      const ph = Math.abs(phi) <= Math.PI / 2 ? phi : Math.sign(phi) * Math.PI / 2;
      uv.push(Math.max(0, Math.min(1, uOf(yp, rp, ph))), (yp - y0) / th0);
    }
  }
  for (let i = 0; i < N; i++) for (let j = 0; j < M; j++) { const a = i * (M + 1) + j, b = a + M + 1; idx.push(a, b, a + 1, a + 1, b, b + 1); }
  // the caps: the top and the bottom closed, in the colour of the outline's middle at that end
  const cap = (i, up) => {
    const { yp, rp } = ring[i]; const Y = (y1 - yp) * S - 0.5, R = rp * S; const c0 = pos.length / 3; const v = (yp - y0) / th0, uc = (cx - bx0) / tw0;
    pos.push(0, Y, 0); nor.push(0, up ? 1 : -1, 0); uv.push(uc, v);
    for (let j = 0; j <= M; j++) { const phi = -Math.PI + (2 * Math.PI * j) / M; pos.push(R * Math.sin(phi), Y, R * Math.cos(phi)); nor.push(0, up ? 1 : -1, 0); uv.push(uc, v); }
    for (let j = 0; j < M; j++) { if (up) idx.push(c0, c0 + 1 + j, c0 + 2 + j); else idx.push(c0, c0 + 2 + j, c0 + 1 + j); }
  };
  cap(0, true); cap(N, false);
  const glb = writeGlb({ pos, nor, uv, idx, png, metal: o.metal == null ? 0.25 : o.metal, rough: o.rough == null ? 0.38 : o.rough });
  return { ok: true, glb, info: { triangles: idx.length / 3, height: 1, radius: Math.max(...ring.map(r => r.rp)) * S, symmetry: +meanAsym.toFixed(3), rows: N, texture: [TW, TH] } };
}

// a minimal, valid binary glTF 2.0: one mesh (positions, normals, texture coordinates, indices), one textured material
function writeGlb({ pos, nor, uv, idx, png, metal, rough }) {
  const f32 = a => Buffer.from(new Float32Array(a).buffer); const big = pos.length / 3 > 65535;
  const ib = big ? Buffer.from(new Uint32Array(idx).buffer) : Buffer.from(new Uint16Array(idx).buffer);
  const parts = [f32(pos), f32(nor), f32(uv), ib, png]; const views = []; let off = 0; const chunks = [];
  parts.forEach((b, i) => { const pad = (4 - (b.length % 4)) % 4; views.push({ buffer: 0, byteOffset: off, byteLength: b.length, ...(i < 3 ? { target: 34962 } : i === 3 ? { target: 34963 } : {}) }); chunks.push(b, Buffer.alloc(pad)); off += b.length + pad; });
  const bin = Buffer.concat(chunks);
  const mn = [0, 1, 2].map(k => Math.min(...pos.filter((_, i) => i % 3 === k))), mx = [0, 1, 2].map(k => Math.max(...pos.filter((_, i) => i % 3 === k)));
  const n = pos.length / 3;
  const json = {
    asset: { version: '2.0', generator: 'SiteRemade lathe (from the owner\'s cut-out)' }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0, name: 'Product' }],
    meshes: [{ name: 'Product', primitives: [{ attributes: { POSITION: 0, NORMAL: 1, TEXCOORD_0: 2 }, indices: 3, material: 0 }] }],
    materials: [{ name: 'Label', doubleSided: true, pbrMetallicRoughness: { baseColorTexture: { index: 0 }, metallicFactor: metal, roughnessFactor: rough } }],
    textures: [{ source: 0, sampler: 0 }], samplers: [{ magFilter: 9729, minFilter: 9987, wrapS: 33071, wrapT: 33071 }], images: [{ bufferView: 4, mimeType: 'image/png' }],
    accessors: [{ bufferView: 0, componentType: 5126, count: n, type: 'VEC3', min: mn, max: mx }, { bufferView: 1, componentType: 5126, count: n, type: 'VEC3' }, { bufferView: 2, componentType: 5126, count: n, type: 'VEC2' },
      { bufferView: 3, componentType: big ? 5125 : 5123, count: idx.length, type: 'SCALAR' }],
    bufferViews: views, buffers: [{ byteLength: bin.length }],
  };
  let js = Buffer.from(JSON.stringify(json)); const jpad = (4 - (js.length % 4)) % 4; js = Buffer.concat([js, Buffer.alloc(jpad, 0x20)]);
  const head = Buffer.alloc(12); head.writeUInt32LE(0x46546c67, 0); head.writeUInt32LE(2, 4); head.writeUInt32LE(12 + 8 + js.length + 8 + bin.length, 8);
  const jh = Buffer.alloc(8); jh.writeUInt32LE(js.length, 0); jh.writeUInt32LE(0x4e4f534a, 4); const bh = Buffer.alloc(8); bh.writeUInt32LE(bin.length, 0); bh.writeUInt32LE(0x004e4942, 4);
  return Buffer.concat([head, jh, js, bh, bin]);
}

module.exports = { fromCutout, writeGlb, LIMITS };
