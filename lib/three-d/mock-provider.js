'use strict';
// TRUE 3D — the MOCK image-to-3D provider: the only one there is in phase 1. It makes no network request and costs
// nothing: whatever picture it is "sent", it answers with a fixture GLB from this repository (the bottle of
// test/fixtures/three-d/, as a provider would leave it: on its side, far too large, off centre, an oversized texture).
// It behaves like a real asynchronous provider otherwise -- a request id, a status that takes a few checks, an output to
// download -- so the job, the pipeline, the page and the export are exercised exactly as they will be.
//
//   createMockProvider({ fixture, polls, outcome, metadata, downloadFailures }) -> adapter (lib/three-d/provider.js)
//     fixture    a file path or a Buffer (default: test/fixtures/three-d/product-raw.glb)
//     polls      how many status checks say "in progress" before it completes (default 1)
//     outcome    'completed' (default) | 'failed' | 'never'
//     metadata   what the provider says about its file (default: { upAxis: 'Z' } -- true of the fixture)
//     files      extra side files to return with the model (tests: [{ name, bytes }])
//   adapter.log  { submits, status, downloads, cancels, params } -- so a test can prove what was asked, and how often
//
// IDEMPOTENT: a submit carrying a requestId it has already seen returns the SAME provider request (a retry after a lost
// answer is not a second generation -- the property a real adapter must have too).
const fs = require('fs');
const path = require('path');

const DEFAULT_FIXTURE = path.join(__dirname, '..', '..', 'test', 'fixtures', 'three-d', 'product-raw.glb');

function createMockProvider(options) {
  const o = options || {}; const jobs = new Map(); const byRequest = new Map(); let n = 0; let dlFails = o.downloadFailures || 0;
  const log = { submits: 0, generations: 0, status: 0, downloads: 0, cancels: 0, params: [] };
  const bytes = () => (Buffer.isBuffer(o.fixture) ? o.fixture : fs.readFileSync(o.fixture || DEFAULT_FIXTURE));
  return {
    name: 'mock', log, configured: () => true,
    async submit(endpoint, params) {
      const p = params || {}; log.submits++; log.params.push(Object.assign({}, p, p.image ? { image: `<${p.image.length} bytes>` } : {}));
      if (o.submitError) { const e = new Error(o.submitError.message || 'mock: refused'); if (o.submitError.status) e.status = o.submitError.status; throw e; }
      if (p.requestId && byRequest.has(p.requestId)) return { requestId: byRequest.get(p.requestId), status: 'queued', reused: true };
      const id = `mock3d_${++n}`; log.generations++;
      jobs.set(id, { checks: 0, cancelled: false }); if (p.requestId) byRequest.set(p.requestId, id);
      return { requestId: id, status: 'queued' };
    },
    async status(requestId) {
      log.status++; const j = jobs.get(requestId); if (!j) return { status: 'failed', requestId };
      if (j.cancelled) return { status: 'canceled', requestId };
      j.checks++;
      if (o.outcome === 'never' || j.checks <= (o.polls == null ? 1 : o.polls)) return { status: j.checks === 1 ? 'queued' : 'in_progress', requestId };
      if (o.outcome === 'failed') return { status: 'failed', requestId };
      // (an output reference, not an address: nothing here is ever fetched from a network)
      return { status: 'completed', requestId, outputUrl: `mock3d://${requestId}/model.glb`, mediaType: 'model3d' };
    },
    async cancel(requestId) { log.cancels++; const j = jobs.get(requestId); if (j) j.cancelled = true; return !!j; },
    async download(outputUrl) {
      log.downloads++;
      if (dlFails > 0) { dlFails--; throw new Error('mock: the output could not be downloaded (503)'); }
      const m = /^mock3d:\/\/(mock3d_\d+)\/model\.glb$/.exec(String(outputUrl || '')); if (!m || !jobs.has(m[1])) throw new Error('mock: unknown output');
      const b = bytes();
      return { bytes: b, mime: 'model/gltf-binary', sourceFormat: 'glb', modelFile: { name: o.fileName || 'model.glb', bytes: b }, textures: o.files || [], metadata: Object.assign({ upAxis: 'Z', units: 'unknown', generator: 'mock' }, o.metadata || {}) };
    },
  };
}

module.exports = { createMockProvider, DEFAULT_FIXTURE };
