'use strict';
// Per-generation cost ledger. Every AI/image operation is recorded with the
// fields the brief lists, and aggregated into FIRST_DRAFT_COST, REPAIR_COST
// and TOTAL_SITE_COST. Dollar figures are ESTIMATES computed from token
// counts / image parameters and the price table in config.js -- never
// billing truth. This is internal/diagnostic data: nothing here is meant to
// be shown to normal customers.

const round = n => Math.round(n * 1e6) / 1e6;

function textCostUsd(cfg, tier, usage) {
  const p = (cfg.textPrices || {})[tier] || cfg.textPrices.strong;
  const u = usage || {};
  return round(
    ((u.inputTokens || 0) * p.input + (u.outputTokens || 0) * p.output +
     (u.cacheReadTokens || 0) * p.cacheRead + (u.cacheWriteTokens || 0) * p.cacheWrite) / 1e6);
}

// route: { model: 'support'|'premium'|<model id>, quality, aspectRatio }
function imageCostUsd(cfg, route) {
  const r = route || {};
  const table = (r.model === 'premium' || r.model === cfg.models.imagePremium) ? cfg.imagePrices.premium : cfg.imagePrices.support;
  const q = ['low', 'medium', 'high'].includes(r.quality) ? r.quality : 'medium';
  const isSquare = !r.aspectRatio || r.aspectRatio === '1:1';
  const base = table[q];
  return round(isSquare ? base : base * cfg.imagePrices.nonSquareMultiplier);
}

class CostLedger {
  constructor(cfg, opts) {
    this.cfg = cfg;
    this.entries = [];
    this.limit = (opts && opts.limit) || 5000;
    this.sink = (opts && opts.sink) || null; // optional (entry)=>void, e.g. JSONL append
    this.seq = 0;
  }
  // entry: { generationId, phase, provider, model, operation, kind:'text'|'image'|'other',
  //   tier, usage:{inputTokens,outputTokens,cacheReadTokens,cacheWriteTokens},
  //   imageCount, imageQuality, imageSize, retryCount, ok, latencyMs, costUsdOverride }
  record(entry) {
    const e = Object.assign({ phase: 'first_draft', kind: 'text', ok: true, retryCount: 0, imageCount: 0 }, entry);
    if (!e.generationId) throw new Error('ledger entry needs generationId');
    e.inputTokens = (e.usage && e.usage.inputTokens) || 0;
    e.outputTokens = (e.usage && e.usage.outputTokens) || 0;
    e.textCostUsd = e.kind === 'text' ? textCostUsd(this.cfg, e.tier || 'strong', e.usage) : 0;
    e.imageCostUsd = e.kind === 'image' && e.ok !== false ? round((e.imageCount || 1) * imageCostUsd(this.cfg, { model: e.imageTier || e.model, quality: e.imageQuality, aspectRatio: e.imageSize })) : 0;
    // A FAILED image call may still have been billed by a provider; be
    // conservative and count failures that reached the provider.
    if (e.kind === 'image' && e.ok === false && e.providerReached) e.imageCostUsd = round(imageCostUsd(this.cfg, { model: e.imageTier || e.model, quality: e.imageQuality, aspectRatio: e.imageSize }));
    e.costUsd = Number.isFinite(e.costUsdOverride) ? e.costUsdOverride : round(e.textCostUsd + e.imageCostUsd);
    e.cumulativeUsd = round(this.totalFor(e.generationId) + e.costUsd);
    e.seq = ++this.seq;
    e.ts = e.ts || new Date().toISOString();
    this.entries.push(e);
    if (this.entries.length > this.limit) this.entries.shift();
    if (this.sink) { try { this.sink(e); } catch (_) { /* diagnostics must never break generation */ } }
    return e;
  }
  forGeneration(id) { return this.entries.filter(e => e.generationId === id); }
  totalFor(id) { return round(this.forGeneration(id).reduce((n, e) => n + e.costUsd, 0)); }
  totals(id) {
    const rows = this.forGeneration(id);
    const sum = pred => round(rows.filter(pred).reduce((n, e) => n + e.costUsd, 0));
    const images = rows.filter(e => e.kind === 'image');
    return {
      generationId: id,
      FIRST_DRAFT_COST: sum(e => e.phase === 'first_draft'),
      REPAIR_COST: sum(e => e.phase === 'repair'),
      TOTAL_SITE_COST: sum(() => true),
      modelCalls: rows.filter(e => e.kind === 'text').length,
      imageCount: images.filter(e => e.ok !== false).reduce((n, e) => n + (e.imageCount || 1), 0),
      imageAttempts: images.length,
      imageRetries: images.reduce((n, e) => n + (e.retryCount || 0), 0),
      byOperation: rows.reduce((m, e) => { m[e.operation] = round((m[e.operation] || 0) + e.costUsd); return m; }, {}),
    };
  }
}

module.exports = { CostLedger, textCostUsd, imageCostUsd };
