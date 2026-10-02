'use strict';
// A FAKE TRIPO -- the whole provider, answered in-process. Nothing here touches a network: it is a `fetch` that speaks
// Tripo's documented V3 API (https://openapi.tripo3d.ai/v3: POST /generation/image-to-model, GET /tasks/<id>) and serves
// its "signed" output addresses, from the fixture models of this repository. The real adapter
// (lib/three-d/providers/tripo.js) is pointed at it two ways:
//   - a unit test hands the adapter `fake.fetch` as its fetchImpl
//   - the test server (test/helpers/run-server.js) answers every *.tripo3d.ai / *.tripo3d.com request with it, so the
//     real server, the real premium job and the real adapter run end to end -- and any Tripo request it does NOT answer is
//     refused by that harness, never sent.
// REAL PROVIDER SPEND: $0, by construction.
//
// Modes (opts.mode, or MOCK_TRIPO on the test server):
//   success        (default) queued -> running -> success, a normal model
//   queued         stays queued for a while (MOCK_TRIPO_MS), then succeeds: waiting is not failing
//   slow           never finishes
//   failed         the provider reports failed (no charge)
//   banned         the provider refuses the content (no charge)
//   busy           the first submits are answered 429 "too many at once" (MOCK_TRIPO_BUSY of them), then accepted
//   expired-url    the first download address handed out has already expired (403): only a FRESH one works
//                  (opts.expiredUrls: how many of the first addresses are expired; default 1)
//   download-retry the first downloads fail with 503 (MOCK_TRIPO_DOWNLOAD_FAILS of them)
//   large          a valid model of about 6 MB -- inside the limits, the size a real textured model is (the fixture is 0.14 MB)
//   oversized      a valid model over the size a website may ship
//   malformed      bytes that are not a model
//   compressed     a model that REQUIRES meshopt decompression (what Tripo's `compress` option produces)
//   heavy-texture  a model whose texture is over the limit
//   submit-timeout the submit is never answered (the adapter gives up: an uncertain submission)
//   vanish         the provider takes the submit but the answer never arrives (an uncertain submission that DID happen)
// A task's state is a function of its id and the clock (the id carries when it was made), so it survives a restart of the
// server it runs inside -- as a real provider's would. Every request is logged (never the key itself).
const fs = require('fs');
const path = require('path');

const FIX = path.join(__dirname, '..', 'fixtures', 'three-d');
const API = 'openapi.tripo3d.ai'; const CDN = 'mock-output.tripo3d.com';
const MODES = ['success', 'queued', 'slow', 'failed', 'banned', 'busy', 'expired-url', 'download-retry', 'large', 'oversized', 'malformed', 'compressed', 'heavy-texture', 'submit-timeout', 'vanish'];
const json = (body, status, extra) => new Response(JSON.stringify(body), { status: status || 200, headers: Object.assign({ 'content-type': 'application/json' }, extra || {}) });

// ---- the fixture models, as each mode needs them (made from the two committed GLBs; nothing new on disk)
function glbParts(buf) { const jl = buf.readUInt32LE(12); return { json: JSON.parse(buf.toString('utf8', 20, 20 + jl)), bin: buf.subarray(20 + jl + 8, 20 + jl + 8 + buf.readUInt32LE(20 + jl)) }; }
function glbFrom(jsonObj, bin) {
  let j = Buffer.from(JSON.stringify(jsonObj)); if (j.length % 4) j = Buffer.concat([j, Buffer.alloc(4 - (j.length % 4), 0x20)]);
  const b = bin.length % 4 ? Buffer.concat([bin, Buffer.alloc(4 - (bin.length % 4))]) : bin;
  const head = Buffer.alloc(20); head.writeUInt32LE(0x46546c67, 0); head.writeUInt32LE(2, 4); head.writeUInt32LE(28 + j.length + b.length, 8); head.writeUInt32LE(j.length, 12); head.writeUInt32LE(0x4e4f534a, 16);
  const bh = Buffer.alloc(8); bh.writeUInt32LE(b.length, 0); bh.writeUInt32LE(0x004e4942, 4);
  return Buffer.concat([head, j, bh, b]);
}
let cache = null;
function models() {
  if (cache) return cache;
  const normal = fs.readFileSync(path.join(FIX, 'product-normalized.glb')); const raw = fs.readFileSync(path.join(FIX, 'product-raw.glb')); const p = glbParts(normal);
  cache = {
    normal,
    // (the same model with 9 MB of unused data after its geometry: a real, readable GLB that is simply too large)
    // (6 MB: the same model with extra data in its buffer, as a heavier texture would add -- it passes every 3D limit)
    large: glbFrom(p.json, Buffer.concat([p.bin, Buffer.alloc(6 * 1024 * 1024 - normal.length, 7)])),
    oversized: glbFrom(p.json, Buffer.concat([p.bin, Buffer.alloc(9 * 1024 * 1024, 1)])),
    malformed: Buffer.from('<html><body>503 Service Unavailable</body></html>'.repeat(30)),
    compressed: glbFrom(Object.assign({}, p.json, { extensionsUsed: ['EXT_meshopt_compression'], extensionsRequired: ['EXT_meshopt_compression'] }), p.bin),
    'heavy-texture': raw,
  };
  return cache;
}

// opts: { mode, queuedMs, busy, downloadFails, expiredUrls, urlTtlMs, key (if set, only this key is accepted), log(entry), now(),
//         fetchSource(link) -> Response (the provider fetching the picture it was given) }
function createFakeTripo(opts) {
  const o = opts || {}; const clock = o.now || Date.now; const say = e => { calls.push(e); if (o.log) o.log(Object.assign({ provider: 'tripo' }, e)); };
  const calls = []; const inputs = new Map(); const fetched = new Set();
  const count = { submits: 0, accepted: 0, status: 0, downloads: 0, busy: 0, urls: 0, served: 0 };
  const mode = () => { const m = typeof o.mode === 'function' ? o.mode() : o.mode; return MODES.includes(m) ? m : 'success'; };
  const queuedMs = () => (o.queuedMs != null ? o.queuedMs : mode() === 'queued' ? 1200 : 120);
  const trace = () => ({ 'x-tripo-trace-id': `trace_mock_${calls.length + 1}` });
  const authed = options => { const h = (options && options.headers) || {}; const a = String(h.Authorization || h.authorization || ''); return /^Bearer .{4,}$/.test(a) && (!o.key || a === `Bearer ${o.key}`); };
  // a download address as Tripo signs one: good for a few minutes, a different one every time it is asked for
  const sign = id => { count.urls++; const exp = clock() + (mode() === 'expired-url' && count.urls <= (o.expiredUrls != null ? o.expiredUrls : 1) ? -1000 : (o.urlTtlMs != null ? o.urlTtlMs : 5 * 60 * 1000)); return `https://${CDN}/output/${id}/${count.urls}/model.glb?Expires=${exp}&Signature=sig${count.urls}`; };

  async function api(u, options) {
    const method = String((options && options.method) || 'GET').toUpperCase();
    if (!authed(options)) { say({ endpoint: 'unauthorized', path: u.pathname }); return json({ code: 1002, message: 'Authentication failed', suggestion: 'check your API key' }, 401, trace()); }
    if (method === 'POST' && u.pathname === '/v3/generation/image-to-model') {
      let body = {}; try { body = JSON.parse((options && options.body) || '{}'); } catch (e) { return json({ code: 2002, message: 'invalid body' }, 400, trace()); }
      count.submits++; say({ endpoint: 'submit', body, auth: true });
      if (mode() === 'submit-timeout') return new Promise((resolve, reject) => { const sig = options && options.signal; if (sig) sig.addEventListener('abort', () => reject(Object.assign(new Error('This operation was aborted'), { name: 'AbortError' }))); });
      if (mode() === 'busy' && count.busy < (o.busy != null ? o.busy : 2)) { count.busy++; return json({ code: 2000, message: 'You have exceeded the limit of generation', suggestion: 'retry later' }, 429, trace()); }
      if (typeof body.input !== 'string' || !/^https?:\/\//.test(body.input)) return json({ code: 2003, message: 'The input file is empty', suggestion: 'provide an image url' }, 400, trace());
      if (!body.model || /latest/i.test(body.model)) return json({ code: 2002, message: 'unsupported model version' }, 400, trace());
      count.accepted++; const id = `tsk_mock_${count.accepted}_${clock()}`; inputs.set(id, body.input);
      if (mode() === 'vanish') throw new TypeError('fetch failed (the answer never arrived)');
      return json({ code: 0, data: { task_id: id } }, 200, trace());
    }
    const m = /^\/v3\/tasks\/([\w-]+)$/.exec(u.pathname);
    if (method === 'GET' && m) {
      count.status++; const id = m[1]; const t = /^tsk_mock_(\d+)_(\d+)$/.exec(id);
      if (!t) { say({ endpoint: 'status', task: id, status: 'not-found' }); return json({ code: 2001, message: 'Task not found' }, 404, trace()); }
      const age = clock() - Number(t[2]); const q = queuedMs(); const base = { task_id: id, type: 'image_to_model', created_at: new Date(Number(t[2])).toISOString() };
      let status = mode() === 'slow' ? 'running' : age < q * 0.5 ? 'queued' : age < q ? 'running' : mode() === 'failed' ? 'failed' : mode() === 'banned' ? 'banned' : 'success';
      // (like the real provider, the fake fetches the picture it was given when it gets to the task: a link that no longer
      // works fails the task)
      if (status === 'success' && o.fetchSource && inputs.has(id) && !fetched.has(id)) {
        const got = await o.fetchSource(inputs.get(id)).catch(() => null); fetched.add(id);
        say({ endpoint: 'source-fetch', task: id, status: got ? got.status : 0, type: got ? String(got.headers.get('content-type') || '') : '' });
        if (!got || got.status !== 200) status = 'failed';
      }
      say({ endpoint: 'status', task: id, status });
      if (status === 'success') return json({ code: 0, data: Object.assign(base, { status, progress: 100, output: { model_url: sign(id), rendered_image_url: `https://${CDN}/output/${id}/preview.png` }, credits_consumed: 30, completed_at: new Date(clock()).toISOString() }) }, 200, trace());
      if (status === 'failed') return json({ code: 0, data: Object.assign(base, { status, progress: 0, error_code: 3000, error_message: 'generation failed' }) }, 200, trace());
      if (status === 'banned') return json({ code: 0, data: Object.assign(base, { status, progress: 0, error_message: 'content policy' }) }, 200, trace());
      return json({ code: 0, data: Object.assign(base, { status, progress: status === 'queued' ? 0 : 40 }) }, 200, trace());
    }
    say({ endpoint: 'unknown', path: u.pathname, method }); return json({ code: 404, message: 'not found' }, 404, trace());
  }
  function cdn(u) {
    count.downloads++; const exp = Number(u.searchParams.get('Expires')); const id = (/^\/output\/([\w-]+)\//.exec(u.pathname) || [])[1];
    if (!(exp > clock())) { say({ endpoint: 'download', task: id, status: 403, why: 'expired' }); return new Response('<Error><Code>AccessDenied</Code><Message>Request has expired</Message></Error>', { status: 403 }); }
    if (mode() === 'download-retry' && count.downloads <= (o.downloadFails != null ? o.downloadFails : 2)) { say({ endpoint: 'download', task: id, status: 503 }); return new Response('temporarily unavailable', { status: 503 }); }
    const all = models(); const bytes = all[mode()] || all.normal; count.served++;
    say({ endpoint: 'download', task: id, status: 200, bytes: bytes.length });
    return new Response(bytes, { status: 200, headers: { 'content-type': 'model/gltf-binary', 'content-length': String(bytes.length) } });
  }
  return {
    MODES, calls, count, models,
    // -> a Response for anything addressed to Tripo; null for everything else (which is not this fake's to answer)
    async fetch(url, options) {
      let u; try { u = new URL(String((url && url.url) || url)); } catch (e) { return null; }
      if (u.hostname === API) return api(u, options);
      if (u.hostname === CDN) return cdn(u);
      return null;
    },
  };
}

module.exports = { createFakeTripo, MODES, API, CDN, glbFrom, glbParts };
