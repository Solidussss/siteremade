'use strict';
// A stand-in for server.js's POST /api/generate-image that runs the REAL
// lib/image-delivery.js (replay / join / store logic) and only fakes the
// paid provider call. Each paid call is held open until the test releases
// it, so tests can change the plan WHILE a request is in flight.
const { createImageDelivery } = require('../../lib/image-delivery');

function createMockImageServer({ accountId = 'acct_test' } = {}) {
  const events = [];
  const assets = new Map();
  const paidCalls = []; // every call that would have reached (and been billed by) the provider
  let seq = 0;

  const eventsStore = {
    record(evt) { events.push({ ...evt, at: ++seq }); return evt; },
    findDeliveredImage(acct, requestKey) {
      const hits = events.filter(e => e.kind === 'image' && e.outcome === 'delivered' && e.accountId === acct && e.requestKey === requestKey && e.assetHash);
      const last = hits[hits.length - 1];
      return last ? { asset_hash: last.assetHash, model: last.model, quality: last.quality, provider: last.provider } : null;
    },
  };

  // generate(args): a paid call. Resolves only when the test calls
  // release(i) / fail(i), so a request can be kept "in flight" on purpose.
  function generate(args) {
    return new Promise(resolve => {
      const call = { args, resolve, index: paidCalls.length, settled: false };
      paidCalls.push(call);
    });
  }
  const delivery = createImageDelivery({
    generate,
    events: eventsStore,
    storeImage: dataUrl => { const hash = 'h' + assets.size; assets.set(hash, dataUrl); return hash; },
    loadImage: hash => assets.get(hash) || null,
  });

  function release(i, dataUrl) {
    const call = paidCalls[i];
    call.settled = true;
    call.resolve({ ok: true, dataUrl: dataUrl || `data:image/png;base64,UEFJRC0${i}`, model: 'gpt-image-1', quality: 'high', provider: 'openai', creditsCharged: 2, estimatedCostUsd: 0.25 });
  }
  function fail(i, reason = 'provider_error') {
    const call = paidCalls[i];
    call.settled = true;
    call.resolve({ ok: false, reason });
  }
  function releaseAll() { paidCalls.forEach((c, i) => { if (!c.settled) release(i); }); }

  // The route body, as server.js runs it for the browser.
  function handle(url, options) {
    if (url === '/api/generation-diagnostics') { events.push({ kind: 'client_outcome', ...JSON.parse(options.body), at: ++seq }); return { ok: true }; }
    if (url !== '/api/generate-image') return new Promise(() => {});
    const body = JSON.parse(options.body);
    return delivery.deliver({ accountId, prompt: body.prompt, model: body.model, quality: body.quality, aspectRatio: body.aspectRatio, projectId: body.projectId, requestKey: body.requestKey })
      .then(result => result.ok
        ? { ok: true, dataUrl: result.dataUrl, creditsCharged: result.creditsCharged, replayed: !!result.replayed }
        : { ok: false, message: 'Could not generate image right now.' });
  }

  return { handle, delivery, events, paidCalls, release, fail, releaseAll, assets };
}

// Let queued promise callbacks (and timer-0 callbacks) run.
function flush(times = 5) {
  let p = Promise.resolve();
  for (let i = 0; i < times; i++) p = p.then(() => new Promise(r => setImmediate(r)));
  return p;
}

module.exports = { createMockImageServer, flush };
