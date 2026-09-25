'use strict';
// Preservation model. Once a piece of the site is judged good it is kept:
// repair and regeneration touch only what is weak, and only what the user
// asked for. State lives INSIDE the stored direction (direction.premium),
// so it survives save/load and is visible to the Workplace updater.
//
// Internal states (not shown to customers): good, needs_repair,
// regenerated, locked. `locked` is what a future "Keep this" button sets;
// nothing in this pass exposes UI for it, but every regeneration path
// already honours it.

const STATES = Object.freeze({ GOOD: 'good', NEEDS_REPAIR: 'needs_repair', REGENERATED: 'regenerated', LOCKED: 'locked' });
const SCOPES = Object.freeze({ HERO: 'hero', IMAGE: 'image', SECTION: 'section', COPY: 'copy', STYLE: 'style', FULL_SITE: 'full_site' });

function ensure(direction) {
  direction.premium = direction.premium && typeof direction.premium === 'object' ? direction.premium : {};
  const p = direction.premium;
  p.sectionState = p.sectionState && typeof p.sectionState === 'object' ? p.sectionState : {};
  p.imageState = p.imageState && typeof p.imageState === 'object' ? p.imageState : {};
  return p;
}
function allSections(direction) {
  const out = [];
  (direction.pages || []).forEach(pg => (pg.sections || []).forEach(s => { if (s && s.id) out.push({ pageId: pg.id || pg.slug, section: s }); }));
  return out;
}
function stateOf(direction, kind, id) {
  const p = ensure(direction);
  const bag = kind === 'image' ? p.imageState : p.sectionState;
  return (bag[id] && bag[id].state) || STATES.GOOD; // unreviewed material defaults to good: never disturbed without evidence
}
function setState(direction, kind, id, state, reason) {
  const p = ensure(direction);
  const bag = kind === 'image' ? p.imageState : p.sectionState;
  const prev = bag[id] || {};
  bag[id] = { state, reason: reason || prev.reason || null, revision: (prev.revision || 0) + (state === STATES.REGENERATED ? 1 : 0), at: new Date().toISOString() };
  return bag[id];
}
function markAllGood(direction) {
  allSections(direction).forEach(({ section }) => { if (stateOf(direction, 'section', section.id) !== STATES.LOCKED) setState(direction, 'section', section.id, STATES.GOOD, 'first_draft'); });
  (direction.imagePlan || []).forEach(e => { if (e.sourceType === 'generated' && stateOf(direction, 'image', e.slot) !== STATES.LOCKED) setState(direction, 'image', e.slot, STATES.GOOD, 'first_draft'); });
}
const lock = (direction, kind, id) => setState(direction, kind, id, STATES.LOCKED, 'kept_by_user');
const unlock = (direction, kind, id) => setState(direction, kind, id, STATES.GOOD, 'unlocked_by_user');

// May an AUTOMATIC repair touch this target? Only if it was flagged, never if locked.
function autoRepairAllowed(direction, kind, id) {
  const s = stateOf(direction, kind, id);
  return s === STATES.NEEDS_REPAIR;
}

// What a regeneration request would discard vs preserve. Full-site regeneration
// is the only scope that discards everything, and it must be explicit.
function planRegeneration(direction, request) {
  const scope = request && request.scope;
  const target = request && request.targetId;
  const lockedIds = [];
  allSections(direction).forEach(({ section }) => { if (stateOf(direction, 'section', section.id) === STATES.LOCKED) lockedIds.push(section.id); });
  (direction.imagePlan || []).forEach(e => { if (stateOf(direction, 'image', e.slot) === STATES.LOCKED) lockedIds.push(e.slot); });
  if (!Object.values(SCOPES).includes(scope)) return { ok: false, reason: 'unknown_scope' };
  if (scope === SCOPES.FULL_SITE) {
    if (!request.explicit) return { ok: false, reason: 'full_regeneration_must_be_explicit' };
    return { ok: true, scope, touches: 'everything_not_locked', preserve: lockedIds, newGeneration: true }; // a NEW generation session with its own budget
  }
  if (scope === SCOPES.STYLE) return { ok: true, scope, touches: ['tokens', 'palette', 'typography'], preserve: 'all_content_and_images', newGeneration: false };
  if (!target) return { ok: false, reason: 'target_required' };
  const kind = scope === SCOPES.IMAGE || scope === SCOPES.HERO ? 'image' : 'section';
  const id = scope === SCOPES.HERO ? 'hero' : target;
  if (stateOf(direction, kind, id) === STATES.LOCKED && !request.overrideLock) return { ok: false, reason: 'target_is_locked' };
  return { ok: true, scope, touches: [id], preserve: 'everything_else', newGeneration: false };
}

module.exports = { STATES, SCOPES, ensure, allSections, stateOf, setState, markAllGood, lock, unlock, autoRepairAllowed, planRegeneration };
