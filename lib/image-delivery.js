// Paid-image delivery that never silently loses a result.
//
// THE BUG THIS FIXES (verified in code): the browser aborted each
// /api/generate-image request after 30s, but the server had no timeout of
// its own -- a gpt-image-1 call that took longer (common at high quality)
// still completed, was charged (OpenAI bill + committed credits), was
// recorded as a success, and was then written into a response nobody was
// reading. Nothing was stored, so the paid image was simply gone, the slot
// fell back to a placeholder, and the next attempt paid again.
//
// What this adds around the existing generateImageWithCredits (whose gates
// -- configured, allowlists, credit reservation, spend reservation -- are
// untouched and still run first for every REAL provider call):
//   * every delivered image is stored in the content-addressed asset store
//     and recorded (generation_events) under its request key;
//   * a request whose key already has a delivered image REPLAYS it -- no
//     provider call, no credit, no spend -- so a browser retry, a page
//     reload mid-generation, or a plan that changes and then changes back
//     never pays twice for the same picture;
//   * a retry that arrives while the original paid call is still running
//     JOINS it instead of starting a second paid call.
// The request key is the browser's own (project id :: slot :: plan
// cacheKey) -- the same identity the client already uses to decide an image
// belongs to the current plan -- scoped server-side to the signed-in
// account, so one account can never read another's stored image.
'use strict';

function createImageDelivery({ generate, events, storeImage, loadImage, now = () => Date.now() }) {
  const inflight = new Map();
  const safe = fn => { try { return fn(); } catch (e) { return null; } };

  function base(args) {
    return { kind: 'image', accountId: args.accountId || null, projectId: args.projectId || null, requestKey: args.requestKey || null };
  }

  async function deliver(args) {
    const key = (args.accountId && args.requestKey) ? `${args.accountId}::${args.requestKey}` : null;
    if (key) {
      const prior = events.findDeliveredImage(args.accountId, args.requestKey);
      const dataUrl = prior && prior.asset_hash ? safe(() => loadImage(prior.asset_hash)) : null;
      if (dataUrl) {
        events.record({ ...base(args), outcome: 'replayed', provider: prior.provider, model: prior.model, quality: prior.quality, creditsCharged: 0, assetHash: prior.asset_hash });
        return { ok: true, dataUrl, model: prior.model, quality: prior.quality, creditsCharged: 0, replayed: true };
      }
      if (inflight.has(key)) {
        events.record({ ...base(args), outcome: 'joined', creditsCharged: 0 });
        const shared = await inflight.get(key);
        // The original request already carries the one real charge.
        return { ...shared, creditsCharged: 0, joined: true };
      }
    }
    const startedAt = now();
    const run = (async () => {
      const result = await generate(args);
      const latencyMs = now() - startedAt;
      if (result && result.ok && result.dataUrl) {
        const assetHash = safe(() => storeImage(result.dataUrl));
        events.record({
          ...base(args), outcome: 'delivered', provider: result.provider || null, model: result.model, quality: result.quality,
          latencyMs, estimatedCostUsd: result.estimatedCostUsd, creditsCharged: result.creditsCharged, assetHash,
          detail: { aspectRatio: args.aspectRatio || null, taskType: args.taskType || null, prompt: String(args.prompt || '').slice(0, 240), stored: !!assetHash },
        });
        return result;
      }
      events.record({
        ...base(args), outcome: (result && result.reason) || 'failed', model: args.model || null, quality: args.quality || null, latencyMs, creditsCharged: 0,
        detail: { aspectRatio: args.aspectRatio || null, taskType: args.taskType || null },
      });
      return result || { ok: false, reason: 'failed' };
    })();
    if (key) inflight.set(key, run);
    try { return await run; } finally { if (key && inflight.get(key) === run) inflight.delete(key); }
  }

  return { deliver, inflightCount: () => inflight.size };
}

module.exports = { createImageDelivery };
