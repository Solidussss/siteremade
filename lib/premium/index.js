'use strict';
// PREMIUM_GENERATION_V1 shared core: quality-first generation with hard cost
// control. Pure logic + injected providers -- no network, no DB, no DOM.
// Consumed by server.js (landing generator), the Workplace app-bridge edit
// path, the browser (via the built premium-core.js bundle) and the fixture
// harness, so they can never drift into separate implementations.
//
//   startSession()        strategy + art direction + design tokens + budget governor
//   session.planImages()  role planning, source priority, composition prompts, budget tiers
//   session.record*()     every text/image operation lands in the cost ledger
//   session.reviewAndRepair()  ONE whole-site review + AT MOST ONE surgical repair round
//   session.finish()      per-generation log for the economics metrics

const { loadConfig } = require('./config');
const { CostLedger } = require('./cost-ledger');
const { BudgetGovernor } = require('./budget-governor');
const { routeOperation, OPERATIONS } = require('./model-routing');
const strategyLib = require('./strategy');
const artLib = require('./art-direction');
const imageLib = require('./image-planning');
const tokenLib = require('./design-tokens');
const stateLib = require('./section-state');
const reviewLib = require('./quality-review');
const repairLib = require('./repair');
const compositionLib = require('./composition');
const stampLib = require('./comp-stamp');
const metricsLib = require('./metrics');
const { textCostUsd, imageCostUsd } = require('./cost-ledger');

function newGenerationId() { return 'gen_' + Date.now().toString(36) + Math.random().toString(16).slice(2, 8); }

function createPremiumCore(cfgOrEnv, opts) {
  const cfg = cfgOrEnv && cfgOrEnv.budgets ? cfgOrEnv : loadConfig(cfgOrEnv);
  const o = opts || {};
  const ledger = new CostLedger(cfg, { sink: o.ledgerSink });
  const metrics = new MetricsStore(o);
  const sessions = new Map();
  const now = o.now || (() => Date.now());

  function startSession(input) {
    const generationId = (input && input.generationId) || newGenerationId();
    const strategy = strategyLib.normalizeStrategy(input && input.strategy, input || {});
    const palette = (input && input.palette) || {};
    const art = artLib.deriveArtDirection(strategy, palette);
    const tokens = tokenLib.buildDesignTokens(strategy, palette, { composition: !!(input && input.composition) });
    const governor = new BudgetGovernor(cfg, ledger, generationId);
    const session = new Session({ core: api, cfg, ledger, governor, generationId, strategy, art, tokens, input: input || {}, now });
    sessions.set(generationId, session);
    if (sessions.size > 500) sessions.delete(sessions.keys().next().value);
    return session;
  }

  const api = { cfg, ledger, metrics, startSession, getSession: id => sessions.get(id) || null, newGenerationId };
  return api;
}
const MetricsStore = metricsLib.MetricsStore;

class Session {
  constructor(x) {
    Object.assign(this, x);
    this.timings = {}; this.beforeReview = null; this.afterReview = null; this.repairRan = false; this.repairActions = [];
    this.fullRegenerationsRequested = 0; this.projectId = (x.input && x.input.projectId) || null;
  }
  // A session can be created early (first image request) before the client's real strategy is known; re-derive when it arrives.
  rebind(input) {
    const inp = Object.assign({}, this.input, input || {});
    this.input = inp; this.strategy = strategyLib.normalizeStrategy(inp.strategy, inp); this.art = artLib.deriveArtDirection(this.strategy, inp.palette || {}); this.tokens = tokenLib.buildDesignTokens(this.strategy, inp.palette || {}, { composition: !!inp.composition });
    if (inp.projectId) this.projectId = inp.projectId;
    return this;
  }
  route(operation) { return routeOperation(operation, this.cfg); }
  time(name, fn) { const t = this.now(); const r = fn(); if (r && typeof r.then === 'function') return r.then(v => { this.timings[name] = (this.timings[name] || 0) + (this.now() - t); return v; }); this.timings[name] = (this.timings[name] || 0) + (this.now() - t); return r; }

  // ---- ledger ---------------------------------------------------------------
  recordText({ operation, usage, provider, model, latencyMs, phase, ok }) {
    const r = this.route(operation);
    return this.ledger.record({ generationId: this.generationId, phase: phase || 'first_draft', kind: 'text', provider: provider || 'anthropic', model: model || r.model, operation, tier: r.tier === 'cheap' ? 'cheap' : 'strong', usage, latencyMs, ok: ok !== false });
  }
  recordImage({ operation, model, imageTier, quality, aspectRatio, phase, retryCount, ok, providerReached, latencyMs, slot }) {
    return this.ledger.record({ generationId: this.generationId, phase: phase || 'first_draft', kind: 'image', provider: 'openai', model, imageTier, operation: operation || 'image_generation', imageQuality: quality, imageSize: aspectRatio, imageCount: 1, retryCount: retryCount || 0, ok: ok !== false, providerReached, latencyMs, slot });
  }
  totals() { return this.ledger.totals(this.generationId); }
  budget() { return this.governor.summary(); }

  // ---- images ---------------------------------------------------------------
  planImages({ slots, uploads, credits, heroTextSide }) {
    return this.time('imagePlanning', () => imageLib.allocateImages({ slots, strategy: this.strategy, art: this.art, uploads, credits, heroTextSide, cfg: this.cfg, governor: this.governor }));
  }

  // ---- review + repair (one pass, one round) ---------------------------------
  // deps.selfRecorded: the provider callbacks already write to the ledger (server.js does, via recordOperation); don't double count.
  // deps (all optional): critic({system,user,tool}) -> {input, usage}; regenerateImage({slot, prompt, aspectRatio, ...}) -> {ok, dataUrl, evaluation};
  //                      rewriteCopy({targetId, field, current, constraint}) -> {ok, text, usage}
  async reviewAndRepair(direction, ctx, deps) {
    const d = deps || {};
    const c = Object.assign({ strategy: this.strategy, cfg: this.cfg, premiumEnabled: true, compositionV2: !!this.cfg.compositionV2 }, ctx || {});
    stateLib.markAllGood(direction);
    let review = this.time('review', () => reviewLib.reviewDirection(direction, c));
    // Optional model critique: ONE call, only if it fits the budget.
    if (typeof d.critic === 'function') {
      const est = textCostUsd(this.cfg, 'strong', { inputTokens: 2500, outputTokens: 600 });
      const dec = this.governor.decide({ operation: 'whole_site_critique', phase: 'first_draft', priority: 'high', estimatedUsd: est });
      if (dec.allowed) {
        try {
          const p = reviewLib.buildCritiquePrompt(direction, c);
          const res = await this.time('critique', () => d.critic({ system: p.system, user: p.user, tool: reviewLib.CRITIQUE_TOOL }));
          if (!d.selfRecorded) this.recordText({ operation: 'whole_site_critique', usage: res.usage, phase: 'first_draft' });
          const extra = reviewLib.parseCritique(res.input);
          review = reviewLib.summarize(review.defects.concat(extra), !!(direction.mobileReport && direction.mobileReport.widths && direction.mobileReport.widths.length), !!c.compositionV2);
        } catch (e) { this.critiqueError = String(e && e.message || e); }
      }
    }
    this.beforeReview = review.categories;
    const plan = repairLib.planRepairs(direction, review, this.governor, this.cfg);
    if (!plan.actions.length || this.cfg.retry.maxRepairRounds < 1) {
      this.afterReview = review.categories;
      return { direction, review, before: review.categories, after: review.categories, actions: [], skipped: plan.skipped, repaired: false, budgetLimitReached: this.governor.limitReached };
    }
    this.repairRan = true;
    const free = repairLib.applyFreeRepairs(direction, plan.actions, { tokens: this.tokens });
    let work = free.direction;
    const executed = free.applied.slice();
    for (const a of free.pending) {
      if (a.executor === 'image' && d.regenerateImage) {
        const entry = (work.imagePlan || []).find(e => e.slot === a.slot) || {};
        const res = await this.time('repair', () => d.regenerateImage({ slot: a.slot, prompt: entry.promptSimplified || entry.prompt, aspectRatio: entry.aspectRatio, model: entry.model, quality: entry.quality, routeKind: entry.routeKind }));
        if (!d.selfRecorded) this.recordImage({ model: entry.model, imageTier: entry.routeKind, quality: entry.quality, aspectRatio: entry.aspectRatio, phase: 'repair', retryCount: 1, ok: !!(res && res.ok), providerReached: true, slot: a.slot });
        if (res && res.ok && res.dataUrl) {
          const ev = imageLib.evaluateImageDeterministic(res.dataUrl, entry.aspectRatio);
          work.assets = work.assets || {}; work.assets.generated = work.assets.generated || {};
          if (!ev.poor) { work.assets.generated[a.slot] = { cacheKey: entry.cacheKey, status: 'ready', dataUrl: res.dataUrl, prompt: entry.promptSimplified || entry.prompt, evaluation: ev }; stateLib.setState(work, 'image', a.slot, stateLib.STATES.REGENERATED, a.defectCode); executed.push(a); continue; }
        }
        // one retry only: fall back instead of generating the same bad concept again
        const fb = repairLib.applyFreeRepairs(work, [{ kind: 'use_designed_fallback', slot: a.slot, executor: 'free', defectCode: a.defectCode }], {});
        work = fb.direction; executed.push(Object.assign({}, a, { kind: 'use_designed_fallback', downgradedFrom: 'regenerate_image' }));
      } else if (a.executor === 'copy' && d.rewriteCopy) {
        const res = await this.time('repair', () => d.rewriteCopy({ targetId: a.targetId, field: a.field, maxChars: a.maxChars, removeClaim: a.removeClaim, direction: work }));
        if (!d.selfRecorded) this.recordText({ operation: 'copy_rewrite_basic', usage: res && res.usage, phase: 'repair', ok: !!(res && res.ok) });
        if (res && res.ok && res.text) { applyCopy(work, a, res.text); stateLib.setState(work, a.targetId === 'hero' ? 'section' : 'section', a.targetId, stateLib.STATES.REGENERATED, a.defectCode); executed.push(a); }
      }
    }
    const after = reviewLib.reviewDirection(work, c);
    this.afterReview = after.categories;
    this.repairActions = executed; // what actually changed (planned-but-not-applicable actions are not counted)
    return { direction: work, review, before: review.categories, after: after.categories, remainingDefects: after.defects.filter(x => x.severity > 0), actions: executed, planned: plan.actions.length, skipped: plan.skipped, repaired: executed.length > 0, budgetLimitReached: this.governor.limitReached };
  }

  finish(extra) {
    const x = extra || {};
    return this.core.metrics.append(metricsLib.buildGenerationLog({
      generationId: this.generationId, premium: true, archetype: this.strategy.archetype, projectId: this.projectId, totals: this.totals(),
      before: this.beforeReview, after: this.afterReview, repairRan: this.repairRan, repairActions: this.repairActions,
      budgetLimitReached: this.governor.limitReached, fullRegenerationsRequested: x.fullRegenerationsRequested || this.fullRegenerationsRequested, timingsMs: this.timings,
    }));
  }
}

function applyCopy(direction, action, text) {
  if (action.targetId === 'hero') { direction.copy = Object.assign({}, direction.copy); direction.copy[action.field === 'body' ? 'sub' : action.field] = text; return; }
  const hit = stateLib.allSections(direction).find(s => s.section.id === action.targetId);
  if (hit) hit.section.copy = Object.assign({}, hit.section.copy, { [action.field === 'body' ? 'body' : action.field]: text });
}

module.exports = {
  createPremiumCore, loadConfig, OPERATIONS, routeOperation, imageCostUsd, textCostUsd,
  strategy: strategyLib, art: artLib, images: imageLib, tokens: tokenLib, sections: stateLib, review: reviewLib, repair: repairLib, composition: compositionLib, stamp: stampLib, metrics: metricsLib,
  CostLedger, BudgetGovernor,
};
