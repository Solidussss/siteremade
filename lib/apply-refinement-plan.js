// App bridge pass (Phase 4): the server-side port of the browser's
// applyLocalRefinementPlan (script.js) -- applies an ALREADY-NORMALIZED plan
// (lib/refinement-normalizer.js) to a working copy of a stored project's
// directionsState.
//
// Why a port and not a require(): script.js is a browser global-scope
// script, not a CommonJS module, so the server cannot load it (same reason
// lib/vocabulary.js exists). This is a deliberate, minimal, faithful port
// of the same action set -- edit-copy, change-design (incl. the browser's
// change-image-strategy mapping), change-variant, move-section,
// remove-section, insert-section (browser: add-section), add-page -- with
// the same semantics:
//   - every operation acts on the direction's ACTIVE page;
//   - operations run in order and the whole plan is atomic: if any
//     operation can't be applied (e.g. its target was removed by an
//     earlier operation), NOTHING is applied and the caller saves nothing
//     (the browser's runEditorAction has the same all-or-nothing shape);
//   - inserted sections go before a footer section if one exists, with a
//     variant chosen from the same variant vocabulary the browser uses.
// Deliberate, documented differences from the browser:
//   - edit-copy may target 'hero' (the direction's top-level `copy` --
//     headline/sub/cta), which the browser's version cannot express;
//   - change-image-strategy does NOT bump intent.imageRevisions: the server
//     regenerates the hero itself (through the same paid-image path as
//     /api/generate-image) and keeps the slot's cacheKey, so the browser
//     never pays to regenerate the same image a second time on next open.
//
// Shape validation is NOT reimplemented here: a new section is run through
// lib/project-store.js's own validateSection, and the caller saves through
// projectStore.updateOwnedProject, which re-validates the whole state with
// validateDirectionsState exactly like every other save.
'use strict';
const crypto = require('crypto');
const { validateSection } = require('./project-store.js');
const { SECTION_VARIANTS, activePage } = require('./refinement-normalizer.js');

const SECTION_LABELS = {
  proof: 'Proof', metrics: 'Numbers', services: 'Services', features: 'Features', productShowcase: 'Product',
  integrations: 'Integrations', pricing: 'Pricing', faq: 'FAQ', process: 'How it works', gallery: 'Gallery',
  caseStudies: 'Case studies', imageLedEditorial: 'Feature story', about: 'About', team: 'Team',
  testimonial: 'Testimonial', testimonialsGrid: 'Testimonials', menu: 'Menu', reservationCta: 'Booking',
  serviceAreas: 'Service areas', contact: 'Contact', newsletter: 'Newsletter', ctaBanner: 'Call-to-action',
};
const DESIGN_SUMMARY = {
  colorBehavior: 'Changed the colour style', spacing: 'Changed the spacing', hero: 'Changed the layout of the top of your homepage',
  imagery: 'Changed the image style', imageStrategy: 'Changed how photos are used', heroStrategy: 'Changed the approach of the top of your homepage',
  pageRhythm: 'Changed the pacing of your page',
};
const COPY_FIELD_WORDS = { headline: 'headline', body: 'text', ctaLabel: 'button text' };
const HERO_COPY_FIELD = { headline: 'headline', body: 'sub', ctaLabel: 'cta' };

function sectionLabel(type) { return SECTION_LABELS[type] || 'page'; }
function slotLabel(slot) {
  if (slot === 'hero') return 'main image at the top of your homepage';
  const base = String(slot).split('::').pop().replace(/-\d+$/, '').replace(/[-_]/g, ' ');
  return `${base} image`;
}
function listWords(words) { return words.length <= 1 ? words.join('') : `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`; }
function newSectionId(type) { return `${type}-${Date.now().toString(36)}${crypto.randomBytes(3).toString('hex')}`; }
function sanitizeSlug(str) { return String(str || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40); }
function uniqueSlug(base, used) { const root = base || 'page'; let slug = root, n = 2; while (used.has(slug)) { slug = `${root}-${n}`; n++; } return slug; }
function variantFor(type, direction) {
  const known = SECTION_VARIANTS[type];
  if (!known) return undefined;
  const dims = (direction.design && direction.design.dimensions) || {};
  // A small, deterministic subset of the browser's pickVariant defaults.
  if (type === 'services') return ['image-led', 'elevated-shadow', 'numbered-editorial'].includes(dims.card) ? 'described' : 'numbered';
  if (type === 'about' || type === 'testimonial') return (dims.spacing === 'airy' || dims.spacing === 'generous') ? known[0] : known[1];
  if (type === 'features') return dims.sectionRhythm === 'editorial' ? 'list' : 'grid';
  if (type === 'ctaBanner') return ['high-contrast-mono-accent', 'dark-luxury-metallic'].includes(dims.colorBehavior) ? 'accent' : 'plain';
  if (type === 'proof') return 'facts';
  return known[0];
}

// Returns {ok:true, state, applied, summary, imageRequests} or
// {ok:false, reason}. Never mutates `directionsState` itself.
function applyRefinementPlan(directionsState, directionIndex, plan) {
  if (!directionsState || !Array.isArray(directionsState.directions) || !plan) return { ok: false, reason: 'invalid_input' };
  const state = JSON.parse(JSON.stringify(directionsState));
  const direction = state.directions[directionIndex];
  if (!direction) return { ok: false, reason: 'invalid_direction' };
  const page = activePage(direction);
  if (!page || !Array.isArray(page.sections)) return { ok: false, reason: 'invalid_page' };
  const applied = [];
  const summary = [];
  const findIdx = id => page.sections.findIndex(s => s && s.id === id);

  for (const op of plan.operations || []) {
    if (op.action === 'edit-copy') {
      if (op.targetId === 'hero') {
        const copy = direction.copy && typeof direction.copy === 'object' ? direction.copy : {};
        Object.keys(op.changes).forEach(k => { copy[HERO_COPY_FIELD[k]] = op.changes[k]; });
        direction.copy = copy;
        summary.push(`Updated the ${listWords(Object.keys(op.changes).map(k => COPY_FIELD_WORDS[k]))} at the top of your homepage`);
      } else {
        const idx = findIdx(op.targetId);
        if (idx === -1) return { ok: false, reason: 'target_missing' };
        const section = page.sections[idx];
        section.copy = { ...(section.copy && typeof section.copy === 'object' ? section.copy : {}), ...op.changes };
        summary.push(`Updated the ${listWords(Object.keys(op.changes).map(k => COPY_FIELD_WORDS[k]))} of your ${sectionLabel(section.type)} section`);
      }
      applied.push({ action: op.action, targetId: op.targetId, fields: Object.keys(op.changes) });
    } else if (op.action === 'change-design') {
      direction.design = direction.design && typeof direction.design === 'object' ? direction.design : {};
      const before = { ...(direction.design.dimensions || {}) };
      direction.design.dimensions = { ...before, ...op.changes };
      direction.intent = direction.intent && typeof direction.intent === 'object' ? direction.intent : {};
      if (op.changes.imageStrategy || op.changes.heroStrategy || op.changes.pageRhythm) {
        const cd = direction.intent.creativeDirection && typeof direction.intent.creativeDirection === 'object' ? direction.intent.creativeDirection : {};
        direction.intent.creativeDirection = {
          ...cd,
          ...(op.changes.imageStrategy ? { imageStrategy: op.changes.imageStrategy } : {}),
          ...(op.changes.heroStrategy ? { heroStrategy: op.changes.heroStrategy } : {}),
          ...(op.changes.pageRhythm ? { pageRhythm: op.changes.pageRhythm } : {}),
        };
      }
      Object.keys(op.changes).forEach(k => { if (DESIGN_SUMMARY[k] && before[k] !== op.changes[k]) summary.push(DESIGN_SUMMARY[k]); });
      applied.push({ action: op.fromImageStrategy ? 'change-image-strategy' : 'change-design', changes: { ...op.changes } });
    } else if (op.action === 'change-variant') {
      const idx = findIdx(op.targetId);
      if (idx === -1) return { ok: false, reason: 'target_missing' };
      page.sections[idx].variant = op.variant;
      summary.push(`Switched the layout of your ${sectionLabel(page.sections[idx].type)} section`);
      applied.push({ action: op.action, targetId: op.targetId, variant: op.variant });
    } else if (op.action === 'move-section') {
      const from = findIdx(op.targetId);
      const before = findIdx(op.beforeId);
      if (from === -1 || before === -1) return { ok: false, reason: 'target_missing' };
      // Browser semantics: moveSection(targetIndex = current index of beforeId).
      const clamped = Math.max(0, Math.min(page.sections.length - 1, before));
      if (clamped !== from) { const [item] = page.sections.splice(from, 1); page.sections.splice(clamped, 0, item); }
      const moved = page.sections.find(s => s.id === op.targetId);
      const anchor = page.sections.find(s => s.id === op.beforeId);
      summary.push(`Moved your ${sectionLabel(moved.type)} section next to ${sectionLabel(anchor.type)}`);
      applied.push({ action: op.action, targetId: op.targetId, beforeId: op.beforeId });
    } else if (op.action === 'remove-section') {
      const idx = findIdx(op.targetId);
      if (idx === -1) return { ok: false, reason: 'target_missing' };
      if (page.sections.length <= 1) return { ok: false, reason: 'would_empty_page' };
      const [removed] = page.sections.splice(idx, 1);
      summary.push(`Removed the ${sectionLabel(removed.type)} section`);
      applied.push({ action: op.action, targetId: op.targetId, sectionType: removed.type });
    } else if (op.action === 'insert-section') {
      if (page.sections.some(s => s && s.type === op.sectionType)) return { ok: false, reason: 'already_present' };
      const section = validateSection({ id: newSectionId(op.sectionType), type: op.sectionType, variant: variantFor(op.sectionType, direction), copy: null });
      if (!section) return { ok: false, reason: 'invalid_section' };
      const footerIdx = page.sections.findIndex(s => s && s.type === 'footer');
      page.sections.splice(footerIdx === -1 ? page.sections.length : footerIdx, 0, section);
      summary.push(`Added a ${sectionLabel(op.sectionType)} section`);
      applied.push({ action: op.action, sectionType: op.sectionType, sectionId: section.id });
    } else if (op.action === 'add-page') {
      if (direction.pages.length >= 6) return { ok: false, reason: 'too_many_pages' };
      const label = op.label || SECTION_LABELS[op.sectionType] || 'Services';
      const used = new Set(direction.pages.map(p => p.slug));
      const slug = uniqueSlug(sanitizeSlug(label) || `page-${direction.pages.length}`, used);
      const section = validateSection({ id: newSectionId(op.sectionType), type: op.sectionType, variant: op.sectionType === 'services' ? 'described' : variantFor(op.sectionType, direction), copy: null });
      if (!section) return { ok: false, reason: 'invalid_section' };
      const newPage = { id: `page_${slug}_${Date.now().toString(36)}${crypto.randomBytes(2).toString('hex')}`, slug, label, purpose: '', sections: [section] };
      direction.pages.push(newPage);
      summary.push(`Added a new "${label}" page`);
      applied.push({ action: op.action, pageId: newPage.id, label, sectionType: op.sectionType });
    } else {
      return { ok: false, reason: 'unsupported_operation' };
    }
  }

  const imageRequests = [];
  const generated = (direction.assets && direction.assets.generated) || {};
  for (const ia of plan.imageActions || []) {
    const entry = generated[ia.slot];
    if (!entry || typeof entry.prompt !== 'string' || !entry.prompt.trim()) return { ok: false, reason: 'image_slot_missing' };
    imageRequests.push({ slot: ia.slot, prompt: entry.prompt.trim().slice(0, 1200), aspectRatio: ia.slot === 'hero' ? '16:9' : '1:1' });
  }
  return { ok: true, state, applied, summary, imageRequests };
}

// Writes one freshly generated image into a working state (never the stored
// row) -- keeps the slot's existing cacheKey/prompt so the browser renderer
// treats it as an already-resolved image instead of paying to regenerate it,
// and drops the old assetRef so the save path internalizes the new bytes.
function setGeneratedImage(state, directionIndex, slot, dataUrl) {
  const direction = state.directions[directionIndex];
  direction.assets = direction.assets || { items: [], generated: {}, plan: {} };
  direction.assets.generated = direction.assets.generated || {};
  const { assetRef, dataUrl: _old, ...rest } = direction.assets.generated[slot] || {};
  direction.assets.generated[slot] = { ...rest, status: 'ready', dataUrl };
}

function imageSummary(slot) { return `Replaced the ${slotLabel(slot)}`; }

module.exports = { applyRefinementPlan, setGeneratedImage, imageSummary, SECTION_LABELS };
