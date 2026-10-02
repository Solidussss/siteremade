'use strict';
// TRUE 3D — the asset pipeline (server only): what a provider hands over -> a stored, normalised model a page may show.
//
//   image (the owner's upload) -> provider (provider.js) -> INTAKE -> BLENDER (blender.js) -> LIMITS (glb.js) -> STORE
//
//   normalise(delivery, deps) -> { ok: true, bytes, asset, report } | { ok: false, stage, code, reason, retry }
//     the part after the provider: used by the premium job once a model has been downloaded (lib/premium-jobs.js), and by
//     run() below. delivery: { modelFile: { name, bytes }, textures, sourceFormat, metadata, provider, providerAssetId,
//     sourceAssetId, requestId }
//   run(request, deps) -> { ok: true, asset (with assetRef), report } | { ok: false, stage, code, reason }
//     the whole thing in one call, for a script or a test: provider, normalise, store
//
// Every stage is a gate, and a model that fails one is not stored:
//   intake   the provider's file names are plain names (stageFiles' rules), the format is one Blender may be given, the
//            file is within the input size, it IS a model (its own header says so), and it points at nothing outside itself
//   blender  it is stood upright, centred, brought to one size, reduced to the triangle target where that is safe, its
//            textures scaled to the limit -- or Blender is not available / failed / ran out of time, said in one word
//   limits   what came back is measured again, from the file itself (never from Blender's own report): size, triangles,
//            textures, no outside references, nothing the website's engine cannot decode
//   store    the bytes go to the content-addressed asset store (the same one as the pictures and the videos)
//
// retry: whether trying again could help -- true for a missing or timed-out Blender (the model exists at the provider; the
// job retries the step, never the generation), false for a file that is simply not acceptable.
const path = require('path');
const crypto = require('crypto');
const TD = require('../creative/three-d');
const GLB = require('./glb');
const Blender = require('./blender');
const Provider = require('./provider');

const fail = (stage, code, reason, retry) => ({ ok: false, stage, code, reason, retry: !!retry });
// what a provider may say about its file that changes how it is processed (anything else it says is ignored)
function hints(meta) { const m = meta && typeof meta === 'object' ? meta : {}; return { upAxis: ['Y', 'Z', 'X', '-Y', '-Z', '-X'].includes(m.upAxis) ? m.upAxis : 'Y', yawDeg: typeof m.yawDeg === 'number' && isFinite(m.yawDeg) ? Math.max(-360, Math.min(360, m.yawDeg)) : 0 }; }

// deps: { blender: opts for blender.prepareAsset (timeoutMs, command, tmpRoot), limits (default TD.LIMITS), now() }
async function normalise(delivery, deps) {
  const d = delivery || {}; const D = deps || {}; const L = D.limits || TD.LIMITS;
  const file = d.modelFile && typeof d.modelFile === 'object' ? d.modelFile : null;
  if (!file || !Buffer.isBuffer(file.bytes) || !file.bytes.length) return fail('intake', 'malformed', 'the provider returned no model');
  // (names are only ever CHECKED -- the model is written under a fixed name of our own; a provider's name that tries to
  // reach outside the job's folder refuses the whole delivery)
  const named = [{ name: String(file.name || ''), bytes: file.bytes }].concat(Array.isArray(d.textures) ? d.textures : []);
  for (const f of named) { const n = f && typeof f.name === 'string' ? f.name : ''; if (!n || n.length > 120 || /[\\/:\u0000-\u001f]/.test(n) || n.includes('..') || /^\./.test(n)) return fail('intake', 'unsafe_path', 'a provider file has a name that is not allowed'); }
  const ext = path.extname(file.name).toLowerCase();
  if (!Blender.FORMATS.includes(ext)) return fail('intake', 'unsupported_format', 'this kind of model file is not accepted');
  if (file.bytes.length > L.inputBytes) return fail('intake', 'too_large', `the provider's model is larger than ${Math.round(L.inputBytes / 1048576)} MB`);
  let before = null;
  if (ext === '.glb') {
    const seen = GLB.inspect(file.bytes); if (!seen.ok) return fail('intake', seen.code, seen.reason);
    if (seen.info.external.length) return fail('intake', 'external_resources', 'the model points at files outside itself');
    before = seen.info;
  }
  const h = hints(d.metadata);
  const made = await Blender.prepareAsset({ bytes: file.bytes, ext, options: { targetSize: 1, maxTriangles: L.trianglesTarget, maxTexture: L.textureSize, origin: 'center', upAxis: h.upAxis, yawDeg: h.yawDeg, applyTransforms: true } }, D.blender);
  if (!made.ok) return fail('blender', made.code, made.reason, made.code === 'blender_unavailable' || made.code === 'timeout' || made.code === 'no_workspace');
  // what Blender wrote, measured from the file itself
  const after = GLB.inspect(made.glb); if (!after.ok) return fail('limits', after.code, after.reason);
  const within = GLB.check(after.info, L); if (!within.ok) return fail('limits', within.code, within.reason);
  const info = after.info; const hash = crypto.createHash('sha256').update(made.glb).digest('hex');
  const asset = TD.cleanAsset({
    // (the same bytes are the same model: a retried job, or the same upload modelled twice, is one asset)
    id: `td-${hash.slice(0, 16)}`, format: 'glb', sourceAssetId: d.sourceAssetId || '', title: d.title || '', bytes: info.bytes,
    bounds: info.bounds, center: info.center, scale: made.report.scale, triangles: info.triangles, textures: { count: info.textures.count, maxSize: info.textures.maxSize },
    animations: info.animations, parts: info.parts, normalized: true,
    provenance: { provider: d.provider || '', providerAssetId: d.providerAssetId || '', requestId: d.requestId || '', processor: `blender ${made.blender}`, at: new Date(D.now ? D.now() : Date.now()).toISOString() },
    // (a placeholder reference: the caller stores the bytes and sets the real one)
    assetRef: hash,
  });
  if (!asset) return fail('limits', 'malformed', 'the processed model could not be described');
  delete asset.assetRef;
  return { ok: true, bytes: made.glb, asset, report: { before: before ? { bytes: before.bytes, triangles: before.triangles, size: before.size, center: before.center, textureMax: before.textures.maxSize } : null, after: { bytes: info.bytes, triangles: info.triangles, size: info.size, center: info.center, textureMax: info.textures.maxSize }, blender: made.report } };
}

// request: { provider: an adapter (provider.js), sourceImage: Buffer, sourceAssetId, prompt, mode, requestId, title }
// deps: normalise's, plus { store(bytes, mime) -> assetRef, provider: generate3D's opts (pollMs, timeoutMs) }
async function run(request, deps) {
  const r = request || {}; const D = deps || {};
  if (!r.provider) return fail('provider', 'provider_unavailable', 'no 3D provider is configured');
  if (typeof D.store !== 'function') return fail('store', 'no_store', 'there is nowhere to store the model');
  let delivery;
  try { delivery = await Provider.generate3D(r.provider, { sourceImage: r.sourceImage, sourceAssetId: r.sourceAssetId, prompt: r.prompt, mode: r.mode, requestId: r.requestId }, D.provider); }
  catch (e) { return fail('provider', (e && e.code) || 'provider_failed', String((e && e.message) || 'the 3D provider failed').slice(0, 200)); }
  const out = await normalise(Object.assign({}, delivery, { requestId: r.requestId || '', title: r.title || '' }), D);
  if (!out.ok) return out;
  let assetRef;
  try { assetRef = D.store(out.bytes, TD.MIME); } catch (e) { return fail('store', 'store_failed', 'the model could not be stored', true); }
  if (!/^[a-f0-9]{64}$/.test(String(assetRef || ''))) return fail('store', 'store_failed', 'the model could not be stored', true);
  return { ok: true, asset: Object.assign({}, out.asset, { assetRef }), report: out.report };
}

module.exports = { normalise, run, hints };
