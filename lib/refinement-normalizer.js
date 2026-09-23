// App bridge pass (Phase 4): SERVER-SIDE validation of a refinement plan
// returned by Claude (the `submit_website_refinement` tool, see server.js
// REFINEMENT_TOOL) before anything is applied to a stored project.
//
// Why this exists: /api/refine-website returns Claude's raw tool_use input
// to the browser unvalidated, and only the browser's own client-side
// normalizeRefinementPlan (script.js) shapes it -- fine when the browser
// applies the plan to its own in-memory copy, NOT fine when the server
// applies a plan straight to persisted state. Named distinctly
// (normalizeServerRefinementPlan) so it can never be confused with the
// browser function of a similar name.
//
// Same defensive philosophy as server.js normalizePlannerPlan: never throw,
// never "fix" bad content into something that looks real. Unknown action
// types, ids that don't exist on the page being edited, out-of-vocabulary
// enum values, non-string copy, malformed arrays -- each is DROPPED, one
// operation at a time, so one bad operation never takes the whole plan
// down. If nothing usable survives, returns null and the caller treats it
// exactly like any other failed edit (credits released, nothing saved).
//
// Enum vocabularies are passed IN from server.js (the same constants its
// REFINEMENT_TOOL schema is built from) rather than copied here, so there
// is exactly one list of each.
'use strict';

const MAX_OPERATIONS = 8;          // matches REFINEMENT_TOOL's own maxItems
const MAX_IMAGE_REGENERATIONS = 4; // each one is a separately-credited paid image
const COPY_LIMITS = { headline: 200, body: 2000, ctaLabel: 60 };
const MAX_PAGES = 6;               // matches lib/project-store.js MAX_PAGES

// The only variants the browser renderer (script.js pickVariant) knows for
// each section type that HAS more than one. change-variant is only ever
// allowed to move a section between these -- never to an invented value.
const SECTION_VARIANTS = {
  services: ['described', 'numbered'],
  gallery: ['featured', 'grid'],
  testimonial: ['centered', 'card'],
  about: ['split', 'statement'],
  features: ['list', 'grid'],
  ctaBanner: ['accent', 'plain'],
  proof: ['statement', 'facts'],
};

function isPlainObject(v) { return !!v && typeof v === 'object' && !Array.isArray(v); }
function cleanString(v, max) {
  if (typeof v !== 'string') return null;
  const s = v.replace(/\s+/g, ' ').trim().slice(0, max);
  return s || null;
}

function activePage(direction) {
  if (!direction || !Array.isArray(direction.pages) || !direction.pages.length) return null;
  const idx = Number.isInteger(direction.activePageIndex) ? direction.activePageIndex : 0;
  return direction.pages[Math.max(0, Math.min(direction.pages.length - 1, idx))] || null;
}

// vocab: { sectionTypes, heroKeys, imageryKeys, colorBehaviorKeys,
//          spacingKeys, imageStrategyKeys, heroStrategyKeys, pageRhythmKeys }
function normalizeServerRefinementPlan(rawPlan, direction, vocab) {
  if (!isPlainObject(rawPlan) || !isPlainObject(direction) || !isPlainObject(vocab)) return null;
  const page = activePage(direction);
  if (!page || !Array.isArray(page.sections)) return null;
  const sectionById = new Map(page.sections.filter(s => s && typeof s.id === 'string').map(s => [s.id, s]));
  const generated = (direction.assets && isPlainObject(direction.assets.generated)) ? direction.assets.generated : {};
  const heroAsset = generated.hero;
  const heroHasPrompt = !!(heroAsset && typeof heroAsset.prompt === 'string' && heroAsset.prompt.trim());

  const designAllow = {
    hero: vocab.heroKeys, imagery: vocab.imageryKeys, colorBehavior: vocab.colorBehaviorKeys, spacing: vocab.spacingKeys,
    imageStrategy: vocab.imageStrategyKeys, heroStrategy: vocab.heroStrategyKeys, pageRhythm: vocab.pageRhythmKeys,
  };

  const rawOps = Array.isArray(rawPlan.operations) ? rawPlan.operations.slice(0, MAX_OPERATIONS) : [];
  const operations = [];
  let dropped = Array.isArray(rawPlan.operations) ? Math.max(0, rawPlan.operations.length - MAX_OPERATIONS) : 0;
  let wantsHeroImage = false;
  let pagesAfter = Array.isArray(direction.pages) ? direction.pages.length : 0;

  for (const op of rawOps) {
    const normalized = normalizeOperation(op);
    if (normalized) operations.push(normalized); else dropped++;
  }

  function normalizeOperation(op) {
    if (!isPlainObject(op) || typeof op.action !== 'string') return null;
    const changes = isPlainObject(op.changes) ? op.changes : {};
    switch (op.action) {
      case 'edit-copy': {
        const target = op.targetId === 'hero' ? 'hero' : (sectionById.has(op.targetId) ? op.targetId : null);
        if (!target) return null;
        const out = {};
        for (const key of Object.keys(COPY_LIMITS)) {
          const v = cleanString(changes[key], COPY_LIMITS[key]);
          if (v) out[key] = v;
        }
        if (!Object.keys(out).length) return null;
        return { action: 'edit-copy', targetId: target, changes: out };
      }
      case 'change-design': {
        const out = {};
        for (const key of Object.keys(designAllow)) {
          if (Array.isArray(designAllow[key]) && designAllow[key].includes(changes[key])) out[key] = changes[key];
        }
        if (!Object.keys(out).length) return null;
        return { action: 'change-design', changes: out };
      }
      case 'change-image-strategy': {
        const strategy = changes.imageStrategy;
        if (!Array.isArray(vocab.imageStrategyKeys) || !vocab.imageStrategyKeys.includes(strategy)) return null;
        // Mirrors the browser's own mapping (script.js normalizeRefinementPlan):
        // change-image-strategy == change-design {imageStrategy, imageDominance:'dominant'},
        // plus a replacement hero image -- but ONLY when there is a stored
        // hero prompt to regenerate from (the server has no image planner).
        if (heroHasPrompt) wantsHeroImage = true;
        return { action: 'change-design', changes: { imageStrategy: strategy, imageDominance: 'dominant' }, fromImageStrategy: true };
      }
      case 'change-variant': {
        const section = sectionById.get(op.targetId);
        if (!section) return null;
        const known = SECTION_VARIANTS[section.type];
        if (!known) return null;
        let variant = typeof op.variant === 'string' && known.includes(op.variant) ? op.variant : null;
        // REFINEMENT_TOOL's schema has no `variant` field, so a Claude plan
        // can never name one -- "change the layout" of a two-variant section
        // deterministically means "switch to the other known variant".
        if (!variant) variant = known.find(v => v !== section.variant) || null;
        if (!variant || variant === section.variant) return null;
        return { action: 'change-variant', targetId: section.id, variant };
      }
      case 'move-section': {
        if (!sectionById.has(op.targetId) || !sectionById.has(op.beforeId) || op.targetId === op.beforeId) return null;
        return { action: 'move-section', targetId: op.targetId, beforeId: op.beforeId };
      }
      case 'remove-section': {
        if (!sectionById.has(op.targetId)) return null;
        return { action: 'remove-section', targetId: op.targetId };
      }
      case 'insert-section': {
        if (!Array.isArray(vocab.sectionTypes) || !vocab.sectionTypes.includes(op.sectionType)) return null;
        // Same rule as the browser's add-section: a page never gets a second
        // section of a type it already has. Dropped (not "applied") so the
        // change summary never claims something that didn't happen.
        if (page.sections.some(s => s && s.type === op.sectionType)) return null;
        return { action: 'insert-section', sectionType: op.sectionType };
      }
      case 'add-page': {
        if (pagesAfter >= MAX_PAGES) return null;
        pagesAfter++;
        const sectionType = Array.isArray(vocab.sectionTypes) && vocab.sectionTypes.includes(op.sectionType) ? op.sectionType : 'services';
        const label = cleanString(op.label, 40) || null;
        return { action: 'add-page', sectionType, label };
      }
      default:
        return null; // unknown/unsupported action -- dropped, never guessed at
    }
  }

  const imageActions = [];
  const seenSlots = new Set();
  const rawImageActions = Array.isArray(rawPlan.imageActions) ? rawPlan.imageActions : [];
  for (const ia of rawImageActions) {
    if (!isPlainObject(ia) || ia.action !== 'regenerate') { dropped++; continue; } // 'add' needs the browser's image planner to place a new slot -- unsupported server-side
    const slot = typeof ia.slot === 'string' ? ia.slot : null;
    const entry = slot ? generated[slot] : null;
    if (!entry || typeof entry.prompt !== 'string' || !entry.prompt.trim() || seenSlots.has(slot)) { dropped++; continue; }
    seenSlots.add(slot);
    imageActions.push({ action: 'regenerate', slot });
  }
  if (wantsHeroImage && !seenSlots.has('hero')) { seenSlots.add('hero'); imageActions.push({ action: 'regenerate', slot: 'hero', fromImageStrategy: true }); }
  const cappedImageActions = imageActions.slice(0, MAX_IMAGE_REGENERATIONS);
  dropped += imageActions.length - cappedImageActions.length;

  if (!operations.length && !cappedImageActions.length) return null;
  return {
    scope: ['section', 'page', 'site'].includes(rawPlan.scope) ? rawPlan.scope : 'section',
    operations,
    imageActions: cappedImageActions,
    droppedCount: dropped,
  };
}

// The server-side counterpart of the browser's refinementContext()
// (script.js) -- the same fields, built from STORED state instead of the
// browser's in-memory project, so the prompt Claude sees for a bridge edit
// is shaped like the one it sees for a browser refinement. Differences,
// both deliberate: the hero is exposed as a targetable pseudo-section with
// id 'hero' (see lib/apply-refinement-plan.js), and image slots come from
// stored assets.generated (the only image data the server keeps -- the
// browser's imagePlan is never persisted) listing only slot ids + status,
// never image bytes.
function buildRefinementContext(direction) {
  if (!isPlainObject(direction)) return {};
  const page = activePage(direction);
  const generated = (direction.assets && isPlainObject(direction.assets.generated)) ? direction.assets.generated : {};
  const source = isPlainObject(direction.source) ? direction.source : {};
  const heroCopy = isPlainObject(direction.copy) ? direction.copy : {};
  return {
    note: 'Operations may only target sections on the editable page below (by id), or the hero via targetId "hero" with edit-copy (headline/body/ctaLabel). Image regeneration may only name a slot listed in imageSlots.',
    source: { text: source.text, location: source.location, facts: source.facts },
    business: direction.business,
    creativeDirection: direction.intent && direction.intent.creativeDirection,
    design: direction.design && direction.design.dimensions,
    hero: { id: 'hero', headline: heroCopy.headline, body: heroCopy.sub, ctaLabel: heroCopy.cta },
    editablePage: page ? { id: page.id, slug: page.slug, label: page.label, sections: (page.sections || []).map(s => ({ id: s.id, type: s.type, variant: s.variant, copy: s.copy })) } : null,
    otherPages: (direction.pages || []).filter(p => p !== page).map(p => ({ id: p.id, label: p.label })),
    imageSlots: Object.keys(generated).filter(slot => generated[slot] && typeof generated[slot].prompt === 'string' && generated[slot].prompt.trim()).map(slot => ({ slot, status: generated[slot].status || null })),
  };
}

module.exports = { normalizeServerRefinementPlan, buildRefinementContext, SECTION_VARIANTS, MAX_OPERATIONS, MAX_IMAGE_REGENERATIONS, activePage };
