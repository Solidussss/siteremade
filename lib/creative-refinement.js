// "Update My Website" redesign for a CREATIVE page. A Creative page is a scene plan (lib/creative/validate2.js), not
// Business sections, so it is never flattened into the Business redesign: the SAME Creative director that made the
// page (lib/creative/ai.js direct -- its validation, claim check against the research facts and bounded repair) is
// asked to revise it, given the current plan and the owner's request.
//
// What never changes here: the research (page, facts, their sources), the pictures (every asset keeps its origin,
// author, licence, source page and processing record; no picture is added, fetched or generated), the owner's supplied
// details and choices (main picture, abstract interpretation), and the motion setting. Only direction.creative.plan
// is replaced -- with a plan validatePlan2 accepted against exactly those assets and facts -- and the previous concept
// is kept in the page's history.
'use strict';

const clip = (v, n) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, n) : '');

// the current page, compactly, for the director to revise (words, stages and pacing -- never pixels)
function compactCreativePlan(plan) {
  const p = plan && typeof plan === 'object' ? plan : {};
  return {
    concept: p.concept, palette: p.palette, type: p.type, atmosphere: p.atmosphere, motion: p.motion, thread: p.thread,
    scenes: (Array.isArray(p.scenes) ? p.scenes : []).map(s => ({
      id: s.id, name: s.name, purpose: s.purpose, height: s.height, pin: s.pin || undefined, camera: s.camera, background: s.background,
      text: s.text ? { kicker: s.text.kicker || undefined, heading: s.text.heading || undefined, body: clip(s.text.body, 300) || undefined, items: Array.isArray(s.text.items) && s.text.items.length ? s.text.items.length : undefined, region: s.text.region } : undefined,
      layers: (s.layers || []).map(L => ({ kind: L.kind, role: L.role, asset: L.asset || undefined, mask: L.mask && L.mask !== 'none' ? L.mask : undefined, word: L.word && L.word.text ? L.word.text : undefined })),
    })),
  };
}

// The direct() input for a revision, built from the STORED page only (nothing from the request body but the words).
function buildCreativeReviseInput(direction, request) {
  const c = (direction && direction.creative) || {};
  const u = c.understanding || {};
  const research = c.research || {};
  const assets = (Array.isArray(c.assets) ? c.assets : []).filter(a => a && !a.removed).map(a => Object.assign({}, a, { dataUrl: undefined, assetRef: a.assetRef || '0'.repeat(64) }));
  return {
    brief: c.brief || '', understanding: u, understandingLegacy: { kind: u.kind, subject: u.subject },
    page: research.page || null, facts: Array.isArray(research.facts) ? research.facts : [],
    supplied: c.supplied || { facts: [], memories: [] }, assets, thumbnails: [], maxThumbs: 0,
    mainAsset: c.mainAsset || null, abstractChosen: !!c.abstractChosen,
    coverage: research.curation ? { coverage: research.curation.coverage, missing: research.curation.missing || [], note: research.curation.note || '' } : null,
    revise: { request: clip(request, 600), current: compactCreativePlan(c.plan) },
  };
}

// -> the revised directionsState (a copy): only the plan and its bookkeeping change
function applyCreativeRevision(directionsState, directionIndex, plan, { model } = {}) {
  const state = JSON.parse(JSON.stringify(directionsState));
  const d = state.directions[directionIndex];
  const c = d.creative = d.creative || {};
  const old = c.plan || {};
  c.history = (Array.isArray(c.history) ? c.history : []).concat(old.concept ? [{ title: clip(old.concept.title, 80), logline: clip(old.concept.logline, 300), source: 'update', at: new Date().toISOString() }] : []).slice(-6);
  c.plan = plan;
  c.planMeta = Object.assign({}, c.planMeta || {}, { source: /^mock/i.test(model || '') ? 'mock' : 'ai', model: clip(model, 60), reason: 'owner update from the app', at: new Date().toISOString() });
  c.updatedAt = new Date().toISOString();
  return state;
}

module.exports = { compactCreativePlan, buildCreativeReviseInput, applyCreativeRevision };
