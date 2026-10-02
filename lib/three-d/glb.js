'use strict';
// TRUE 3D — what a GLB file itself says (server only). A model is UNTRUSTED data: whoever made it -- a provider, Blender, an
// owner -- this reads its own header and JSON and measures it, without running anything and without trusting a number
// anyone reported about it. The pipeline (pipeline.js) uses it twice: on what a provider hands over, before Blender is
// given the file, and on what Blender hands back, before the model is stored. Nothing is stored that fails check().
//
//   inspect(buf)        -> { ok: true, info } | { ok: false, code, reason }
//   check(info, limits) -> { ok: true } | { ok: false, code, reason }      the budget of a model that may ship
//
//   info: { bytes, generator, meshes, primitives, triangles, vertices, materials, textures: { count, maxSize, images },
//           animations: [names], parts: [names of the nodes that carry a mesh], skins, bounds: { min, max }, center, size,
//           external: [addresses the file points at], extensionsUsed, extensionsRequired }
const { dimensions } = require('../creative/png');

const MAGIC = 0x46546c67; const JSON_CHUNK = 0x4e4f534a; const BIN_CHUNK = 0x004e4942;
const MAX_JSON_BYTES = 16 * 1024 * 1024;
const MAX_NODES = 20000;
// what the engine has no decoder for: a model that REQUIRES one of these cannot be drawn, so it is not shipped
const UNSUPPORTED = ['KHR_draco_mesh_compression', 'EXT_meshopt_compression', 'KHR_texture_basisu'];
const fail = (code, reason) => ({ ok: false, code, reason });
const isArr = Array.isArray;
const r6 = v => Math.round(v * 1e6) / 1e6;

// column-major 4x4
const IDENT = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
function mul(a, b) { const o = new Array(16); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) { let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k]; o[c * 4 + r] = s; } return o; }
const nums = (v, n) => isArr(v) && v.length === n && v.every(x => typeof x === 'number' && isFinite(x));
function local(node) {
  if (nums(node.matrix, 16)) return node.matrix.slice();
  const t = nums(node.translation, 3) ? node.translation : [0, 0, 0]; const q = nums(node.rotation, 4) ? node.rotation : [0, 0, 0, 1]; const s = nums(node.scale, 3) ? node.scale : [1, 1, 1];
  const [x, y, z, w] = q; const xx = x * x, yy = y * y, zz = z * z, xy = x * y, xz = x * z, yz = y * z, wx = w * x, wy = w * y, wz = w * z;
  return [(1 - 2 * (yy + zz)) * s[0], 2 * (xy + wz) * s[0], 2 * (xz - wy) * s[0], 0, 2 * (xy - wz) * s[1], (1 - 2 * (xx + zz)) * s[1], 2 * (yz + wx) * s[1], 0, 2 * (xz + wy) * s[2], 2 * (yz - wx) * s[2], (1 - 2 * (xx + yy)) * s[2], 0, t[0], t[1], t[2], 1];
}
const apply = (m, p) => [m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12], m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13], m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14]];

// the file's two parts: -> { json, bin } | { error: { code, reason } }
function parts(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 20) return { error: fail('not_glb', 'the file is too short to be a model') };
  if (buf.readUInt32LE(0) !== MAGIC) return { error: fail('not_glb', 'the file is not a binary glTF (GLB) model') };
  if (buf.readUInt32LE(4) !== 2) return { error: fail('unsupported_version', 'only glTF 2.0 models are supported') };
  const total = buf.readUInt32LE(8); if (total > buf.length || total < 20) return { error: fail('truncated', 'the model file is cut short') };
  let off = 12; let json = null; let bin = null;
  while (off + 8 <= total) {
    const len = buf.readUInt32LE(off); const type = buf.readUInt32LE(off + 4); const start = off + 8; const end = start + len;
    if (end > total) return { error: fail('truncated', 'the model file is cut short') };
    if (type === JSON_CHUNK && json === null) {
      if (len > MAX_JSON_BYTES) return { error: fail('too_large', 'the model description is too large') };
      try { json = JSON.parse(buf.toString('utf8', start, end)); } catch (e) { return { error: fail('malformed', 'the model description cannot be read') }; }
    } else if (type === BIN_CHUNK && bin === null) bin = buf.subarray(start, end);
    off = end + ((4 - (len % 4)) % 4);
  }
  if (!json || typeof json !== 'object' || isArr(json)) return { error: fail('malformed', 'the model has no description') };
  return { json, bin };
}

function inspect(buf) {
  const p = parts(buf); if (p.error) return p.error;
  const g = p.json; const bin = p.bin;
  const list = k => (isArr(g[k]) ? g[k] : []);
  const accessors = list('accessors'), meshes = list('meshes'), nodes = list('nodes'), views = list('bufferViews'), images = list('images');
  if (nodes.length > MAX_NODES) return fail('too_complex', 'the model has too many parts');
  // every address the file points at: a model that ships must be one self-contained file
  const external = [];
  list('buffers').forEach(b => { if (b && typeof b.uri === 'string' && !/^data:/i.test(b.uri)) external.push(String(b.uri).slice(0, 120)); });
  images.forEach(im => { if (im && typeof im.uri === 'string' && !/^data:/i.test(im.uri)) external.push(String(im.uri).slice(0, 120)); });
  // textures: what each embedded picture's own header says
  const pics = images.map(im => {
    if (!im || typeof im !== 'object') return null;
    let bytes = null;
    const v = Number.isInteger(im.bufferView) ? views[im.bufferView] : null;
    if (v && bin && (v.buffer === 0 || v.buffer === undefined) && Number.isInteger(v.byteLength) && v.byteLength > 0) { const o = v.byteOffset || 0; if (o >= 0 && o + v.byteLength <= bin.length) bytes = bin.subarray(o, o + v.byteLength); }
    else if (typeof im.uri === 'string') { const m = /^data:[^;,]*;base64,([A-Za-z0-9+/=]+)$/.exec(im.uri); if (m) bytes = Buffer.from(m[1], 'base64'); }
    const d = bytes ? dimensions(bytes) : null;
    return { mime: (d && d.mime) || String(im.mimeType || '').slice(0, 40), width: d ? d.width : 0, height: d ? d.height : 0, bytes: bytes ? bytes.length : 0 };
  }).filter(Boolean);
  // the default scene's nodes, with their place in the world
  const scene = list('scenes')[Number.isInteger(g.scene) ? g.scene : 0]; const roots = scene && isArr(scene.nodes) ? scene.nodes : [];
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  let triangles = 0, vertices = 0, primitives = 0, visited = 0; const names = []; const seen = new Set();
  const walk = (i, world, depth) => {
    const n = nodes[i]; if (!n || typeof n !== 'object' || seen.has(i) || depth > 64 || ++visited > MAX_NODES) return; seen.add(i);
    const m = mul(world, local(n));
    const mesh = Number.isInteger(n.mesh) ? meshes[n.mesh] : null;
    if (mesh && isArr(mesh.primitives)) {
      let drew = false;
      mesh.primitives.forEach(pr => {
        const pos = pr && pr.attributes && Number.isInteger(pr.attributes.POSITION) ? accessors[pr.attributes.POSITION] : null; if (!pos || !(pos.count > 0)) return;
        const idx = Number.isInteger(pr.indices) ? accessors[pr.indices] : null; const count = idx && idx.count > 0 ? idx.count : pos.count; const mode = pr.mode === undefined ? 4 : pr.mode;
        primitives++; vertices += pos.count; drew = true;
        triangles += mode === 4 ? Math.floor(count / 3) : mode === 5 || mode === 6 ? Math.max(0, count - 2) : 0;
        if (nums(pos.min, 3) && nums(pos.max, 3)) for (let c = 0; c < 8; c++) { const w = apply(m, [c & 1 ? pos.max[0] : pos.min[0], c & 2 ? pos.max[1] : pos.min[1], c & 4 ? pos.max[2] : pos.min[2]]); for (let k = 0; k < 3; k++) { if (w[k] < min[k]) min[k] = w[k]; if (w[k] > max[k]) max[k] = w[k]; } }
      });
      if (drew) names.push(String(n.name || mesh.name || `part-${names.length + 1}`).replace(/[\u0000-\u001f<>]/g, ' ').trim().slice(0, 60));
    }
    if (isArr(n.children)) n.children.forEach(ch => { if (Number.isInteger(ch)) walk(ch, m, depth + 1); });
  };
  roots.forEach(i => { if (Number.isInteger(i)) walk(i, IDENT, 0); });
  const bounded = min.every(isFinite) && max.every(isFinite);
  const info = {
    bytes: buf.length, generator: String((g.asset && g.asset.generator) || '').slice(0, 80), meshes: meshes.length, primitives, triangles, vertices, materials: list('materials').length,
    textures: { count: pics.length, maxSize: pics.reduce((n, x) => Math.max(n, x.width, x.height), 0), images: pics },
    animations: list('animations').map((a, i) => String((a && a.name) || `animation-${i + 1}`).replace(/[\u0000-\u001f<>]/g, ' ').trim().slice(0, 60)), parts: names, skins: list('skins').length,
    bounds: bounded ? { min: min.map(r6), max: max.map(r6) } : null, center: bounded ? min.map((v, k) => r6((v + max[k]) / 2)) : null, size: bounded ? min.map((v, k) => r6(max[k] - v)) : null,
    external, extensionsUsed: list('extensionsUsed').map(String), extensionsRequired: list('extensionsRequired').map(String),
  };
  if (!primitives || !triangles) return fail('empty', 'the model has nothing to draw');
  return { ok: true, info };
}

// the budget of a model that may be stored and shipped (limits: lib/creative/three-d.js LIMITS)
function check(info, limits) {
  const L = limits || {};
  if (!info) return fail('malformed', 'the model could not be read');
  if (info.external.length) return fail('external_resources', 'the model points at files outside itself');
  const need = info.extensionsRequired.find(x => UNSUPPORTED.includes(x)); if (need) return fail('unsupported_extension', `the model needs ${need}, which the website cannot decode`);
  if (L.modelBytes && info.bytes > L.modelBytes) return fail('too_large', `the model is ${(info.bytes / 1048576).toFixed(1)} MB; at most ${(L.modelBytes / 1048576).toFixed(0)} MB may ship`);
  if (L.triangles && info.triangles > L.triangles) return fail('too_many_triangles', `the model has ${info.triangles} triangles; at most ${L.triangles} may ship`);
  if (L.textureSize && info.textures.maxSize > L.textureSize) return fail('texture_too_large', `a texture is ${info.textures.maxSize} px; at most ${L.textureSize} px may ship`);
  if (L.textures && info.textures.count > L.textures) return fail('too_many_textures', `the model has ${info.textures.count} textures; at most ${L.textures} may ship`);
  if (!info.bounds) return fail('no_bounds', 'the model does not say how large it is');
  return { ok: true };
}

module.exports = { inspect, check, parts, UNSUPPORTED };
