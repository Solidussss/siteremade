'use strict';
// TRUE 3D — the SOURCE of a model: an image-to-3D provider, behind one interface (server only).
//
// SiteRemade never talks to "a 3D API". It talks to an ADAPTER with four calls, shaped exactly like the premium video
// provider's (lib/media/higgsfield.js), so a model is made by the same durable premium job that makes a video
// (lib/premium-jobs.js) -- one submission ever, followed to its outcome, downloaded, stored:
//
//   submit(endpoint, params)        -> { requestId }      params: { image_url | image, prompt, mode, requestId }
//   status(requestId)               -> { status: queued | in_progress | completed | failed | canceled, outputUrl? }
//   cancel(requestId)               -> true | false
//   download(outputUrl, 'model3d')  -> { bytes, mime, modelFile: { name, bytes }, textures: [{ name, bytes }], sourceFormat, metadata }
//
// and, for a script or a test that wants the whole thing in one call:
//
//   generate3D(adapter, { sourceImage, sourceAssetId, prompt, mode, requestId })
//     -> { provider, providerAssetId, sourceFormat, modelFile, textures, metadata }
//
// PHASE 1 HAS NO REAL PROVIDER. The only adapter is the mock (mock-provider.js: a fixture file, no network). A real one is
// added by writing an adapter with these four calls, registering it here, and listing its hosts and key in
// lib/paid-providers.js -- so that, like every other paid provider, it is unreachable outside production and its key never
// leaves the server (a browser is never given a provider address, a signed link or a credential: it gets the stored,
// normalised file, by SiteRemade's own path).
//
// The SOURCE PICTURE is the owner's own upload, always (lib/creative/three-d.js sourceEligible). Nothing found on the web is
// ever sent to be modelled.
const MODES = ['object', 'product', 'character'];
const STATES = ['queued', 'in_progress', 'completed', 'failed', 'canceled'];
const NAME = /^[a-z][a-z0-9-]{1,30}$/;

const adapters = new Map();
// adapter: { name, configured() -> bool, submit, status, cancel, download }
function register(adapter) {
  const a = adapter || {};
  if (!NAME.test(a.name || '')) throw new Error('a 3D provider adapter needs a plain name');
  ['submit', 'status', 'cancel', 'download'].forEach(k => { if (typeof a[k] !== 'function') throw new Error(`3D provider ${a.name}: missing ${k}()`); });
  adapters.set(a.name, a); return a;
}
function unregister(name) { adapters.delete(name); }
function get(name) { return adapters.get(name) || null; }
function names() { return [...adapters.keys()]; }
// which adapter a server uses: THREE_D_PROVIDER names it; nothing is the default (3D is then unavailable, and says so)
function selected(env) {
  const e = env || process.env; const want = String(e.THREE_D_PROVIDER || '').trim().toLowerCase();
  const a = want ? get(want) : null;
  if (!want) return { ok: false, reason: 'provider_unavailable', message: 'no 3D provider is configured on this server' };
  if (!a) return { ok: false, reason: 'provider_unavailable', message: `the 3D provider "${want.slice(0, 30)}" is not available` };
  if (typeof a.configured === 'function' && !a.configured()) return { ok: false, reason: 'provider_unavailable', message: 'the 3D provider is not configured on this server' };
  return { ok: true, adapter: a, name: a.name };
}

const sleep = ms => new Promise(r => setTimeout(r, ms));
const clean = (v, n) => String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f<>{}]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
// The whole exchange in one call (scripts and tests; the server uses the premium job, which survives restarts).
// opts: { pollMs, timeoutMs }. Throws with .code: provider_failed | provider_timeout | provider_empty.
async function generate3D(adapter, req, opts) {
  const r = req || {}; const o = opts || {};
  const requestId = clean(r.requestId, 80) || `req_${Date.now().toString(36)}`;
  const sub = await adapter.submit('image-to-3d', { image: r.sourceImage || null, image_url: r.sourceUrl || '', prompt: clean(r.prompt, 300), mode: MODES.includes(r.mode) ? r.mode : 'object', requestId });
  const t0 = Date.now(); let st = null;
  for (;;) {
    st = await adapter.status(sub.requestId);
    if (st.status === 'completed' && st.outputUrl) break;
    if (st.status === 'failed' || st.status === 'canceled') throw Object.assign(new Error(`the 3D provider reported ${st.status}`), { code: 'provider_failed' });
    if (Date.now() - t0 > (o.timeoutMs || 10 * 60 * 1000)) { try { await adapter.cancel(sub.requestId); } catch (e) { /* it is reported either way */ } throw Object.assign(new Error('the 3D provider did not finish in time'), { code: 'provider_timeout' }); }
    await sleep(o.pollMs || 1500);
  }
  const out = await adapter.download(st.outputUrl, 'model3d');
  if (!out || !out.modelFile || !Buffer.isBuffer(out.modelFile.bytes) || !out.modelFile.bytes.length) throw Object.assign(new Error('the 3D provider returned no model'), { code: 'provider_empty' });
  return { provider: adapter.name, providerAssetId: sub.requestId, sourceAssetId: clean(r.sourceAssetId, 60), sourceFormat: out.sourceFormat || 'glb', modelFile: out.modelFile, textures: Array.isArray(out.textures) ? out.textures : [], metadata: out.metadata && typeof out.metadata === 'object' ? out.metadata : {} };
}

module.exports = { MODES, STATES, register, unregister, get, names, selected, generate3D };
