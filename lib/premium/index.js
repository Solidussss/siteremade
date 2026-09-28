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
const groundingLib = require('./grounding');
const semanticLib = require('./semantic');
const visualsLib = require('./visuals');
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

  // ---- V3 semantic pass: deterministic guards (free) + ONE whole-site critique + a handful of targeted fixes ------------------
  semanticSpent() { return this.ledger.forGeneration(this.generationId).filter(e => /^semantic/i.test(e.operation || '')).reduce((n, e) => n + e.costUsd, 0); }
  groundingFor(direction, c) {
    return c.grounding || groundingLib.deriveGrounding({ description: c.description, categoryKey: direction.business && direction.business.categoryKey, categoryLabel: this.strategy.businessType, archetype: (direction.strategy && direction.strategy.archetype) || this.strategy.archetype, location: direction.source && direction.source.location, facts: c.facts, hasTeamAssets: ((direction.assets && direction.assets.items) || []).some(a => a.type === 'team') });
  }
  async semanticPass(direction, c, d) {
    const g = this.groundingFor(direction, c); this.grounding = g;
    const visualsOn = !!(c.visualsV4 && this.cfg.visualsV4);
    let before = semanticLib.checkSemantics(direction, g, c);
    if (visualsOn) before = before.concat(visualsLib.checkVisuals(direction, c));
    const det = semanticLib.applyRepairs(direction, before, g);
    let work = det.direction; let changes = det.changes.slice(); let criticDefects = []; let criticRan = false;
    if (typeof d.semanticCritic === 'function') {
      const B = this.cfg.budgets;
      const est = textCostUsd(this.cfg, 'strong', { inputTokens: 7000, outputTokens: 2200 });
      const dec = this.governor.decide({ operation: 'semantic_critique', phase: 'first_draft', priority: 'high', estimatedUsd: est, subBudget: { spentUsd: this.semanticSpent(), ceilingUsd: B.SEMANTIC_REVIEW_TARGET_USD } });
      if (dec.allowed) {
        try {
          const p = semanticLib.buildSemanticCritique(work, g, null, visualsOn ? { criteria: visualsLib.VISUAL_CRITERIA, lines: visualsLib.visualLines(work) } : null);
          const res = await this.time('semanticCritique', () => d.semanticCritic({ system: p.system, user: p.user, tool: semanticLib.CRITIC_TOOL, images: (c.visionImages || []).slice(0, 2) }));
          if (!d.selfRecorded) this.recordText({ operation: 'semantic_critique', usage: res.usage, phase: 'first_draft' });
          criticDefects = semanticLib.parseSemanticCritique(res.input, work, g, { visuals: visualsOn }); criticRan = true;
        } catch (e) { this.semanticError = String(e && e.message || e); }
      } else this.semanticSkipped = dec.reason;
    }
    // one small repair pass: the highest-impact critic findings that carry a concrete, validated fix (max 5)
    const ranked = criticDefects.filter(x => x.repair).sort((a, b) => b.severity - a.severity).slice(0, 8);
    const fixed = semanticLib.applyRepairs(work, ranked, g); work = fixed.direction; changes = changes.concat(fixed.changes);
    // ONE image replacement (a primary image the critic judged clearly poor). Governed like any repair spend; verified before it replaces anything.
    const regenerated = [];
    const imgFix = ranked.find(x => x.repair.kind === 'regenerate_image');
    if (imgFix && typeof d.regenerateImage === 'function') {
      const slot = imgFix.repair.slot; const entry = (work.imagePlan || []).find(e => e.slot === slot);
      if (entry && entry.sourceType === 'generated' && /^(hero|product|about|gallery-featured)/.test(slot)) {
        let prompt = imgFix.repair.prompt ? String(imgFix.repair.prompt).replace(/[.s]+$/, '') + '. ' + (entry.aspectRatio === '16:9' ? 'Wide landscape frame' : (entry.aspectRatio || '4:3') + ' frame') + '.' : '';
        const okPrompt = prompt && imageLib.lintImagePrompt(prompt + ' ' + imageLib.NEGATIVE_TAIL).ok && imageLib.validateImagePromptSubject(prompt, g).ok && !semanticLib.briefHit(prompt);
        prompt = okPrompt ? prompt + ' ' + imageLib.NEGATIVE_TAIL : (entry.promptSimplified || entry.prompt);
        const est = imageCostUsd(this.cfg, { model: entry.routeKind === 'premium' ? 'premium' : 'support', quality: entry.quality || 'medium', aspectRatio: entry.aspectRatio || '16:9' });
        const dec = this.governor.decide({ operation: 'image_regeneration', phase: 'repair', priority: 'high', estimatedUsd: est });
        if (dec.allowed && prompt) {
          try {
            const res = await this.time('semanticImage', () => d.regenerateImage({ slot, prompt, aspectRatio: entry.aspectRatio, model: entry.model, quality: entry.quality, routeKind: entry.routeKind }));
            if (!d.selfRecorded) this.recordImage({ model: entry.model, imageTier: entry.routeKind, quality: entry.quality, aspectRatio: entry.aspectRatio, phase: 'repair', retryCount: 1, ok: !!(res && res.ok), providerReached: true, slot });
            if (res && res.ok && res.dataUrl) {
              const ev = imageLib.evaluateImageDeterministic(res.dataUrl, entry.aspectRatio);
              if (!ev.poor) { work.assets = work.assets || {}; work.assets.generated = work.assets.generated || {}; work.assets.generated[slot] = { cacheKey: entry.cacheKey, status: 'ready', dataUrl: res.dataUrl, prompt, evaluation: ev }; regenerated.push(slot); changes.push({ code: imgFix.code, kind: 'regenerate_image', target: slot, category: imgFix.category }); }
            }
          } catch (e) { this.semanticImageError = String(e && e.message || e); }
        }
      }
    }
    // V6: a photo-led site must not silently accept empty-looking visuals. Any generated photo slot that failed gets up to 3 governed retries
    // (simplified prompt); slots that still fail fall back to the starter visual and the acceptance gate reports the incomplete photo set.
    const photoRetried = [];
    if (c.photoLedV6 && typeof d.regenerateImage === 'function' && require('./editorial').isPhotoLed(g, (work.source && work.source.text) || c.description)) {
      const failed = (work.imagePlan || []).filter(e => e.sourceType === 'generated' && (!work.assets || !work.assets.generated || !work.assets.generated[e.slot] || work.assets.generated[e.slot].status === 'error')).slice(0, 3);
      for (const entry of failed) {
        entry.photoRetried = true;
        const est = imageCostUsd(this.cfg, { model: entry.routeKind === 'premium' ? 'premium' : 'support', quality: entry.quality || 'medium', aspectRatio: entry.aspectRatio || '4:3' });
        const dec = this.governor.decide({ operation: 'image_regeneration', phase: 'repair', priority: 'high', estimatedUsd: est });
        if (!dec.allowed) break;
        try {
          const prompt = entry.promptSimplified || entry.prompt; if (!prompt) continue;
          const res = await this.time('photoRetry', () => d.regenerateImage({ slot: entry.slot, prompt, aspectRatio: entry.aspectRatio, model: entry.model, quality: entry.quality, routeKind: entry.routeKind }));
          if (!d.selfRecorded) this.recordImage({ model: entry.model, imageTier: entry.routeKind, quality: entry.quality, aspectRatio: entry.aspectRatio, phase: 'repair', retryCount: 1, ok: !!(res && res.ok), providerReached: true, slot: entry.slot });
          if (res && res.ok && res.dataUrl) { const ev = imageLib.evaluateImageDeterministic(res.dataUrl, entry.aspectRatio); if (!ev.poor) { work.assets = work.assets || {}; work.assets.generated = work.assets.generated || {}; work.assets.generated[entry.slot] = { cacheKey: entry.cacheKey, status: 'ready', dataUrl: res.dataUrl, prompt, evaluation: ev }; photoRetried.push(entry.slot); regenerated.push(entry.slot); changes.push({ code: 'photo_slot_retry', kind: 'regenerate_image', target: entry.slot, category: 'MEDIA_COMPLETENESS' }); } }
        } catch (e) { this.photoRetryError = String(e && e.message || e); }
      }
    }
    let afterDefects = semanticLib.checkSemantics(work, g, c);
    if (visualsOn) afterDefects = afterDefects.concat(visualsLib.checkVisuals(work, c));
    const all = before.concat(criticDefects);
    const by = {}; all.forEach(x => { if (x.severity > 0) by[x.category] = (by[x.category] || 0) + 1; });
    this.semanticLog = { found: all.filter(x => x.severity > 0).length, deterministicFound: before.length, criticFound: criticDefects.length, criticRan, repairsApplied: changes.length, byCategory: by,
      wrongBusiness: (by.WRONG_BUSINESS_CONCEPTS || 0) + (by.BUSINESS_CONSISTENCY || 0), invented: (by.INVENTED_TRUST_SIGNALS || 0) + (by.FACTUAL_GROUNDING || 0), cta: by.CTA_CONSISTENCY || 0, imageSubject: by.IMAGE_SUBJECT_RELEVANCE || 0, secondaryDepth: by.SECONDARY_PAGE_DEPTH || 0, internalText: (by.PAGE_PURPOSE_CLARITY || 0) + (by.COPY_SPECIFICITY || 0),
      criticCostUsd: Math.round(this.semanticSpent() * 1e6) / 1e6, skipped: this.semanticSkipped || null,
      visuals: visualsOn ? { defects: all.filter(x => x.severity > 0 && semanticLib.VISUAL_CATEGORIES.includes(x.category)).length, byCategory: Object.fromEntries(semanticLib.VISUAL_CATEGORIES.map(k => [k, (by[k] || 0)]).filter(x => x[1])) } : null };
    return { regenerated, direction: work, changes, before: semanticLib.summarizeSemantic(all), after: semanticLib.summarizeSemantic(afterDefects), remaining: afterDefects.filter(x => x.severity > 0), grounding: g, log: this.semanticLog };
  }
  // ---- V4: ONE small strong-model call that tailors the starter product visual (its four workflow labels) to THIS product ----------
  async visualBriefPass(direction, c, d) {
    if (!(this.cfg.visualsV4 && typeof d.visualBrief === 'function')) return null;
    let ctx; try { ctx = visualsLib.contextFor(direction); } catch (e) { return null; }
    if (ctx.profile.id !== 'tech') return null; // photography businesses do not need a product-UI brief
    const est = textCostUsd(this.cfg, 'strong', { inputTokens: 500, outputTokens: 120 });
    const dec = this.governor.decide({ operation: 'visual_brief', phase: 'first_draft', priority: 'normal', estimatedUsd: est });
    if (!dec.allowed) { this.visualBriefSkipped = dec.reason; return null; }
    try {
      const p = visualsLib.buildBriefPrompt(c.description, this.grounding || null);
      const res = await this.time('visualBrief', () => d.visualBrief({ system: p.system, user: p.user, tool: visualsLib.BRIEF_TOOL }));
      if (!d.selfRecorded) this.recordText({ operation: 'visual_brief', usage: res.usage, phase: 'first_draft' });
      const b = visualsLib.validateBrief(res.input, c.description);
      return b ? visualsLib.encodeBrief(b) : null;
    } catch (e) { this.visualBriefError = String(e && e.message || e); return null; }
  }
  // FIRST-DRAFT ACCEPTANCE GATE: "would this look finished to a customer who has not touched the customizer?" Blockers are the
  // severity-3 findings still present after the one repair pass (empty media, placeholder text, wrong-business content, invented proof, ...).
  accept(review) {
    const blockers = ((review && review.defects) || []).filter(x => x.severity >= 3).map(x => x.code);
    this.acceptance = { accepted: blockers.length === 0, blockers: [...new Set(blockers)].slice(0, 8) };
    return this.acceptance;
  }
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
    const c = Object.assign({ strategy: this.strategy, cfg: this.cfg, premiumEnabled: true, compositionV2: !!this.cfg.compositionV2, groundingV3: !!this.cfg.groundingV3, visualsV4: !!this.cfg.visualsV4, photoLedV6: !!this.cfg.photoLedV6 }, ctx || {});
    let semanticResult = null;
    if (c.groundingV3) { semanticResult = await this.semanticPass(direction, c, d); direction = semanticResult.direction; c.grounding = semanticResult.grounding; }
    let visualBrief = null;
    if (c.visualsV4) { visualBrief = await this.visualBriefPass(direction, c, d); if (this.semanticLog) this.semanticLog.visualBrief = !!visualBrief; }
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
          review = reviewLib.summarize(review.defects.concat(extra), !!(direction.mobileReport && direction.mobileReport.widths && direction.mobileReport.widths.length), !!c.compositionV2, !!c.groundingV3, !!c.visualsV4);
        } catch (e) { this.critiqueError = String(e && e.message || e); }
      }
    }
    this.beforeReview = review.categories;
    const plan = repairLib.planRepairs(direction, review, this.governor, this.cfg);
    if (!plan.actions.length || this.cfg.retry.maxRepairRounds < 1) {
      this.afterReview = review.categories;
      const acceptance = this.accept(review);
      return { acceptance, direction, review, before: review.categories, after: review.categories, actions: [], skipped: plan.skipped, repaired: false, budgetLimitReached: this.governor.limitReached, semantic: semanticResult, visualBrief };
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
    const acceptance = this.accept(after);
    return { acceptance, direction: work, review, before: review.categories, after: after.categories, remainingDefects: after.defects.filter(x => x.severity > 0), actions: executed, planned: plan.actions.length, skipped: plan.skipped, repaired: executed.length > 0, budgetLimitReached: this.governor.limitReached, semantic: semanticResult, visualBrief };
  }

  finish(extra) {
    const x = extra || {};
    return this.core.metrics.append(metricsLib.buildGenerationLog({
      generationId: this.generationId, premium: true, archetype: this.strategy.archetype, projectId: this.projectId, totals: this.totals(),
      before: this.beforeReview, after: this.afterReview, repairRan: this.repairRan, repairActions: this.repairActions,
      budgetLimitReached: this.governor.limitReached, fullRegenerationsRequested: x.fullRegenerationsRequested || this.fullRegenerationsRequested, timingsMs: this.timings, semantic: this.semanticLog || null, acceptance: this.acceptance || null,
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
  strategy: strategyLib, art: artLib, images: imageLib, tokens: tokenLib, sections: stateLib, review: reviewLib, repair: repairLib, composition: compositionLib, stamp: stampLib, grounding: groundingLib, semantic: semanticLib, visuals: visualsLib, editorial: require('./editorial'), visualEngine: require('./visual-engine'), motionEngine: require('./motion-engine'), heroDirection: require('./hero-direction'), heroStoryboard: require('./hero-storyboard'), offeringCopy: require('./offering-copy'), sectionVoice: require('./section-voice'), metrics: metricsLib,
  CostLedger, BudgetGovernor,
};
