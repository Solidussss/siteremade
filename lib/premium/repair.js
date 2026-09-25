'use strict';
// Surgical repair: pick the 1-3 highest-impact defects, repair ONLY their
// targets, leave everything judged good untouched. Free repairs (variant
// swap, focal point, designed fallback, tokens) are applied here on a clone;
// paid repairs (regenerate one image, rewrite one copy block) are returned as
// pending and executed by the pipeline through injected providers so every
// dollar goes through the budget governor and the ledger.
//
// The same actions can be expressed as a normal refinement plan
// (asRefinementPlan) so the Workplace updater applies them through the
// existing lib/apply-refinement-plan.js path instead of a second code path.

const { STATES, stateOf, setState, allSections } = require('./section-state');
const { IMPACT } = require('./quality-review');
const { imageCostUsd, textCostUsd } = require('./cost-ledger');
const { focalFor, classifySlot } = require('./image-planning');

const { SECTION_VARIANTS } = require('./vocab');
const MAX_REPAIR_ACTIONS = 3;
const PAID = { regenerate_image: 'image', rewrite_copy: 'copy' };

const clone = o => JSON.parse(JSON.stringify(o));
const round = n => Math.round(n * 1e6) / 1e6;

function targetKey(d) {
  const t = d.target || {};
  return t.kind === 'image' ? ['image', t.id] : t.kind === 'section' ? ['section', t.id] : t.kind === 'hero' ? ['section', 'hero'] : null;
}

// Flag what the review found; anything unflagged stays "good" and is protected.
function markFlaggedTargets(direction, defects) {
  defects.filter(d => d.severity > 0).forEach(d => {
    const k = targetKey(d); if (!k) return;
    if (stateOf(direction, k[0], k[1]) === STATES.LOCKED) return;
    setState(direction, k[0], k[1], STATES.NEEDS_REPAIR, d.code);
  });
}

function estimateRepairUsd(action, direction, cfg) {
  if (action.kind === 'regenerate_image') {
    const e = (direction.imagePlan || []).find(x => x.slot === action.slot) || {};
    return imageCostUsd(cfg, { model: e.routeKind || 'support', quality: e.quality || 'medium', aspectRatio: e.aspectRatio || '16:9' });
  }
  if (action.kind === 'rewrite_copy') return textCostUsd(cfg, 'cheap', { inputTokens: 900, outputTokens: 350 });
  return 0;
}

// -> { actions, skipped, budgetLimitReached, flagged }
function planRepairs(direction, review, governor, cfg) {
  markFlaggedTargets(direction, review.defects);
  const seenTargets = new Set();
  const candidates = review.defects
    .filter(d => d.severity > 0 && d.repair && d.repair.kind)
    .filter(d => {
      const k = targetKey(d);
      // site-level fixes (tokens, missing CTA) have no per-target state; everything else must be flagged and unlocked
      if (!k) return true;
      const st = stateOf(direction, k[0], k[1]);
      return st === STATES.NEEDS_REPAIR;
    })
    .sort((a, b) => (b.severity * (IMPACT[b.category] || 1)) - (a.severity * (IMPACT[a.category] || 1)));
  const actions = [], skipped = [];
  for (const d of candidates) {
    // Removing invented sections is one repair ("remove unsupported social proof"), however many sections it covers.
    if (d.repair.kind === 'remove_section') {
      const existing = actions.find(x => x.kind === 'remove_section');
      if (existing) { existing.targetIds.push(d.repair.targetId); continue; }
      if (actions.length < MAX_REPAIR_ACTIONS) { actions.push({ kind: 'remove_section', targetIds: [d.repair.targetId], defectCode: d.code, category: d.category, target: d.target, severity: d.severity, estimatedUsd: 0, executor: 'free' }); }
      continue;
    }
    if (actions.length >= MAX_REPAIR_ACTIONS) { skipped.push({ code: d.code, reason: 'repair_round_limit' }); continue; }
    const key = (d.repair.kind + ':' + (d.repair.slot || d.repair.targetId || d.target && d.target.id || 'site'));
    if (seenTargets.has(key)) continue; seenTargets.add(key);
    const action = Object.assign({}, d.repair, { defectCode: d.code, category: d.category, target: d.target, severity: d.severity });
    action.estimatedUsd = round(estimateRepairUsd(action, direction, cfg));
    if (action.estimatedUsd === 0) { action.executor = 'free'; actions.push(action); continue; }
    const fallbacks = d.repair.fallback ? [{ id: d.repair.fallback, estimatedUsd: 0 }] : [];
    const dec = governor.decide({ operation: action.kind === 'regenerate_image' ? 'image_generation' : 'copy_rewrite_basic', phase: 'repair', priority: 'high', estimatedUsd: action.estimatedUsd, id: action.kind, fallbacks });
    if (!dec.allowed) { skipped.push({ code: d.code, reason: dec.reason, budgetLimitReached: dec.budgetLimitReached }); continue; }
    if (dec.choice.id !== action.kind) { // downgraded to the free fallback
      actions.push(Object.assign(action, { kind: dec.choice.id, estimatedUsd: 0, executor: 'free', downgradedFrom: d.repair.kind }));
    } else { action.executor = PAID[action.kind]; actions.push(action); }
  }
  return { actions, skipped, budgetLimitReached: governor.limitReached, flagged: review.defects.filter(d => d.severity > 0).length };
}

function newId(prefix) { return `${prefix}-${Date.now().toString(36)}${Math.random().toString(16).slice(2, 8)}`; }

// Applies the FREE actions to a clone; returns {direction, applied, pending}.
function applyFreeRepairs(direction, actions, ctx) {
  const d = clone(direction);
  const applied = [], pending = [];
  const sections = allSections(d);
  actions.forEach(a => {
    if (a.executor === 'image' || a.executor === 'copy') { pending.push(a); return; }
    if (a.kind === 'swap_variant') {
      const hit = sections.find(x => x.section.id === a.targetId);
      const opts = hit && SECTION_VARIANTS[hit.section.type];
      if (hit && opts) { const next = opts.find(v => v !== hit.section.variant) || opts[0]; hit.section.variant = next; applied.push(Object.assign({ variant: next }, a)); setState(d, 'section', a.targetId, STATES.REGENERATED, a.defectCode); }
    } else if (a.kind === 'set_focal' || a.kind === 'set_focal_all') {
      (d.imagePlan || []).forEach(e => { if (a.kind === 'set_focal_all' || e.slot === a.slot) { e.focal = focalFor(classifySlot(e)); } });
      applied.push(a);
    } else if (a.kind === 'use_designed_fallback') {
      const e = (d.imagePlan || []).find(x => x.slot === a.slot);
      if (e) { e.sourceType = 'designed'; e.fallbackReason = a.defectCode; setState(d, 'image', a.slot, STATES.REGENERATED, 'designed_fallback'); applied.push(a); }
    } else if (a.kind === 'apply_tokens' && ctx && ctx.tokens) {
      d.design = d.design || {}; d.design.premiumTokens = ctx.tokens; applied.push(a);
    } else if (a.kind === 'insert_cta_section') {
      const page = (d.pages || [])[0];
      if (page && Array.isArray(page.sections) && !page.sections.some(s => s.type === 'ctaBanner')) {
        const footerIdx = page.sections.findIndex(s => s.type === 'footer');
        const sec = { id: newId('ctaBanner'), type: 'ctaBanner', variant: 'plain', copy: null };
        page.sections.splice(footerIdx === -1 ? page.sections.length : footerIdx, 0, sec); applied.push(Object.assign({ sectionId: sec.id }, a));
      }
    } else if (a.kind === 'remove_section') {
      const ids = a.targetIds || [a.targetId];
      for (const id of ids) for (const p of (d.pages || [])) { const i = (p.sections || []).findIndex(s => s.id === id); if (i !== -1 && p.sections.length > 1) { p.sections.splice(i, 1); if (!applied.includes(a)) applied.push(a); break; } }
    } else if (a.kind === 'swap_hero_layout_text_led') {
      d.design = d.design || {}; d.design.dimensions = Object.assign({}, d.design.dimensions, { hero: 'minimal-text-only' }); applied.push(a);
    }
  });
  return { direction: d, applied, pending };
}

// Express repairs as a refinement plan (the shape lib/apply-refinement-plan.js consumes).
function asRefinementPlan(actions) {
  const operations = [], imageActions = [];
  actions.forEach(a => {
    if (a.kind === 'swap_variant') { const s = a.variant || null; if (s) operations.push({ action: 'change-variant', targetId: a.targetId, variant: s }); }
    else if (a.kind === 'remove_section') (a.targetIds || [a.targetId]).filter(Boolean).forEach(id => operations.push({ action: 'remove-section', targetId: id }));
    else if (a.kind === 'regenerate_image' && a.slot) imageActions.push({ action: 'regenerate', slot: a.slot });
  });
  return { scope: 'section', operations, imageActions, explanation: 'Automatic quality repair' };
}

module.exports = { MAX_REPAIR_ACTIONS, planRepairs, applyFreeRepairs, asRefinementPlan, estimateRepairUsd, markFlaggedTargets, SECTION_VARIANTS };
