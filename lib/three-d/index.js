'use strict';
// TRUE 3D — the ONE 3D system (server side). An image of the owner's own subject becomes a real 3D asset, checked (or
// normalised by Blender), stored like every other asset, shown by one fixed browser engine, and shipped inside the
// customer's own files. See CREATIVE_3D.md for the whole picture; in short:
//
//   A  SOURCE      provider.js (the adapter interface) + mock-provider.js (a fixture) + providers/tripo.js (Tripo V3)
//   B  NORMALISE   pipeline.js: verify-only (glb.js; the default, nothing installed) or Blender -- blender.js (headless
//                  wrapper) + scripts/blender/prepare_asset.py (the normalisation itself)
//   C  DATA MODEL  lib/creative/three-d.js (creative.threeD: assets + scenes; plan.premium3D: the planner's intent)
//   D  RENDERER    lib/three-d/runtime-src.js -> vendor/three-d/sr3d.min.js (three.js, lazy) + the page's inline loader
//   E  EXPORT      lib/export-compiler.js copies the model and the engine into the customer's assets/ folder
//   F  BUDGET      lib/creative/three-d.js LIMITS, enforced by glb.js on the file itself
//   G  SECURITY    blender.js (fixed arguments, private folder, bounded size and time, no secrets) + glb.js + pipeline.js
//   H  MONEY       cost.js (the shape of the price) + lib/premium-jobs.js (a 3D model is one more premium asset type)
//   I  PLANNING    lib/creative/three-d.js intent(): uploads only, an object, a mode that allows it -- never by default
const fs = require('fs');
const path = require('path');
const schema = require('../creative/three-d');
const glb = require('./glb');
const blender = require('./blender');
const provider = require('./provider');
const pipeline = require('./pipeline');
const cost = require('./cost');
const { createMockProvider } = require('./mock-provider');
const { createTripo } = require('./providers/tripo');

const VENDOR_DIR = path.join(__dirname, '..', '..', 'vendor', 'three-d');
// the built engine and what is known about it: -> { file, bytes, gzipBytes, three, sha256, path, licensePath } | null
function engine() {
  try {
    const m = JSON.parse(fs.readFileSync(path.join(VENDOR_DIR, 'manifest.json'), 'utf8')); const file = path.join(VENDOR_DIR, m.file);
    if (!fs.statSync(file).isFile()) return null;
    return Object.assign({}, m, { path: file, licensePath: path.join(VENDOR_DIR, 'LICENSE-three.txt') });
  } catch (e) { return null; }
}
// THE NORMALISER this server uses for a delivered model (THREE_D_NORMALIZER; pipeline.js says what each one does).
// verify is the default: it needs nothing installed, which is what production has today. -> { ok, name, reason }
function normalizer(env = process.env) {
  const name = String(env.THREE_D_NORMALIZER || 'verify').trim().toLowerCase();
  if (pipeline.NORMALIZERS.includes(name)) return { ok: true, name, reason: '' };
  return { ok: false, name, reason: name === 'gltf-transform' ? 'the gltf-transform normaliser is planned, not built yet' : `unknown THREE_D_NORMALIZER "${name.slice(0, 30)}" (verify | blender)` };
}
// whether a 3D model could be made on this server right now, and if not, why (a REASONS key: lib/creative/three-d.js).
// Every condition is the server's own: the flag, a price, a provider that may be called here, a normaliser that can run
// (Blender only when Blender is the normaliser). -> { ok, reason, provider?, estimate?, normalizer? }
async function availability(env = process.env) {
  if (!schema.enabled(env)) return { ok: false, reason: 'mode_off' };
  const est = cost.estimate(env); if (!est.priced) return { ok: false, reason: 'not_priced' };
  const sel = provider.selected(env); if (!sel.ok) return { ok: false, reason: 'provider_unavailable', detail: sel.message };
  const n = normalizer(env); if (!n.ok) return { ok: false, reason: 'provider_unavailable', detail: n.reason };
  if (n.name === 'blender') { const b = await blender.detect(); if (!b.available) return { ok: false, reason: 'provider_unavailable', detail: b.reason }; }
  return { ok: true, reason: '', provider: sel.name, estimate: est, normalizer: n.name };
}

module.exports = { schema, glb, blender, provider, pipeline, cost, createMockProvider, createTripo, engine, availability, normalizer, VENDOR_DIR };
