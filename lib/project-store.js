// V8.5: durable, ownership-checked persistence for a WebsiteProject
// "directions state" (the exact `{directions:[...], activeDirectionIndex}`
// shape script.js's own serializeDirectionsState()/loadProjectFromStorage()
// already produce/consume for localStorage -- reused byte-for-byte here so
// nothing about the client's own save/restore shape has to change, see
// SITE-PROJECT-V8.5.md part 2).
//
// Every read/write here is scoped to an explicit ownerId the CALLER
// already authenticated (see lib/auth.js) -- this module never trusts a
// client-supplied owner id, and never returns a row belonging to a
// different account; a mismatch and a genuinely-missing row are always
// indistinguishable (`null`) so a caller can never learn whether a given
// project id even exists (see SITE-PROJECT-V8.5.md "security").
'use strict';
const crypto = require('crypto');
const { nowIso } = require('./db.js');
const VOCAB = require('./vocabulary.js');
// V8.7: asset BYTES go through the AssetStore adapter (local filesystem
// today, a real object-storage service behind the same interface later);
// asset METADATA (content type/byte length) stays in the DatabaseAdapter's
// asset_blobs table, same as before -- see lib/adapters/asset-store.js and
// lib/adapters/local-asset-store.js for why the split is deliberate.
const { getAssetStore } = require('./adapters/asset-store.js');

const MAX_DIRECTIONS = 3;
const MAX_PAGES = 6;
const MAX_SECTIONS_PER_PAGE = 14; // generous vs Claude's own maxItems:10 -- headroom for duplicate/import edits
const MAX_ASSET_ITEMS = 40;
const MAX_DATA_URL_BYTES = 8 * 1024 * 1024; // 8MB decoded -- generous for a generated hero/about image, still bounded
const MAX_DIRECTION_JSON_BYTES = 14 * 1024 * 1024; // per direction, BEFORE asset internalization strips embedded images down to refs
const MAX_TOTAL_PAYLOAD_BYTES = 32 * 1024 * 1024; // absolute ceiling across all directions combined, pre-internalization
// V8.7: ASSET_STORE_DIR no longer lives here -- it's the local AssetStore's
// own concern now (lib/adapters/local-asset-store.js, SITEREMADE_ASSET_STORE_DIR-
// overridable). Nothing in this file or lib/export-compiler.js touches a
// filesystem path directly anymore; both go through getAssetStore().

function genId(prefix) { return `${prefix}_${crypto.randomBytes(18).toString('base64url')}`; }

// ---- Generic bounding walker -------------------------------------------
// Used for the parts of a WebsiteProject this validator deliberately does
// NOT re-implement renderer-by-renderer (design.dimensions, palette,
// intent, business copy strings, etc. -- see the spec's own "does not need
// to duplicate every renderer rule line-for-line"). Truncates any string
// over maxLen, caps array length and object key count, drops functions/
// symbols outright, and never executes or evaluates anything -- it only
// ever shortens or removes, never fabricates new content.
function capStringsDeep(value, { maxLen = 2000, maxArray = 60, maxKeys = 60, depth = 6 } = {}) {
  if (depth <= 0) return null;
  if (value == null) return value;
  const t = typeof value;
  if (t === 'string') return value.slice(0, maxLen);
  if (t === 'number' || t === 'boolean') return value;
  if (t === 'function' || t === 'symbol' || t === 'bigint') return undefined;
  if (Array.isArray(value)) return value.slice(0, maxArray).map(v => capStringsDeep(v, { maxLen, maxArray, maxKeys, depth: depth - 1 }));
  if (t === 'object') {
    const out = {};
    Object.keys(value).slice(0, maxKeys).forEach(k => {
      const v = capStringsDeep(value[k], { maxLen, maxArray, maxKeys, depth: depth - 1 });
      if (v !== undefined) out[k] = v;
    });
    return out;
  }
  return undefined;
}

// ---- CTA targets -------------------------------------------------------
function validatePhone(v) { const d = String(v || '').replace(/[^\d]/g, ''); return d.length >= 7 && d.length <= 15; }
function validateEmailAddr(v) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v || '').trim()); }
function validateHttpUrl(v) { try { const u = new URL(String(v || '').trim()); return u.protocol === 'http:' || u.protocol === 'https:'; } catch (e) { return false; } }
// pageIds/sectionIds is the set of ids that survived section/page
// filtering for THIS direction -- a target that points at a page/section
// that doesn't (or no longer) exists is dropped, never left dangling.
function validateCtaTarget(raw, pageIds, sectionIds) {
  if (!raw || typeof raw !== 'object' || !VOCAB.CTA_TARGET_KINDS.includes(raw.kind)) return null;
  if (raw.kind === 'page') return pageIds.has(raw.pageId) ? { kind: 'page', pageId: raw.pageId } : null;
  if (raw.kind === 'section') return (pageIds.has(raw.pageId) && sectionIds.has(raw.sectionId)) ? { kind: 'section', pageId: raw.pageId, sectionId: raw.sectionId } : null;
  if (raw.kind === 'tel') return validatePhone(raw.value) ? { kind: 'tel', value: String(raw.value).slice(0, 40) } : null;
  if (raw.kind === 'mailto') return validateEmailAddr(raw.value) ? { kind: 'mailto', value: String(raw.value).slice(0, 180) } : null;
  if (raw.kind === 'external') return validateHttpUrl(raw.value) ? { kind: 'external', value: String(raw.value).slice(0, 500) } : null;
  return null;
}

// ---- Functionality modules ----------------------------------------------
function validateModule(raw, sectionType) {
  if (!raw || typeof raw !== 'object') return null;
  const type = VOCAB.MODULE_TYPE_KEYS.includes(raw.type) ? raw.type : null;
  if (!type) return null;
  if (!(VOCAB.MODULE_SECTION_COMPATIBILITY[type] || []).includes(sectionType)) return null; // §requirement: known+compatible module types only
  const fields = Array.isArray(raw.fields) ? raw.fields.slice(0, 8).map(f => {
    if (!f || typeof f !== 'object' || !VOCAB.MODULE_FIELD_KEYS.includes(f.key)) return null;
    return {
      key: f.key,
      label: String(f.label || '').slice(0, 80),
      kind: String(f.kind || 'text').slice(0, 20),
      options: Array.isArray(f.options) ? f.options.slice(0, 10).map(o => String(o).slice(0, 60)) : undefined,
      required: !!f.required,
    };
  }).filter(Boolean) : [];
  const config = capStringsDeep(raw.config && typeof raw.config === 'object' ? raw.config : {}, { maxLen: 500, maxArray: 10, maxKeys: 10, depth: 2 });
  return {
    type,
    enabled: !!raw.enabled,
    fields,
    config,
    // The provider is always forced to the one real provider this app
    // implements -- a client payload can never claim a different/fake
    // submission provider (see SITE-PROJECT-V8.4.md's submission-provider
    // abstraction; this is the server-side half of not trusting a client
    // purchase/connection claim, same principle as integration.connected
    // below).
    submitBehavior: { provider: 'preview' },
    successState: { message: String((raw.successState && raw.successState.message) || '').slice(0, 200) },
    integration: {
      provider: VOCAB.INTEGRATION_PROVIDER_KEYS.includes(raw.integration && raw.integration.provider) ? raw.integration.provider : null,
      connected: false, // never trust a client claim of a live connected integration
      note: String((raw.integration && raw.integration.note) || '').slice(0, 200),
    },
  };
}

// ---- Sections / pages / directions ---------------------------------------
function validateSection(raw) {
  if (!raw || typeof raw !== 'object') return null;
  if (!VOCAB.SECTION_TYPE_KEYS.includes(raw.type)) return null; // unknown type -- drop the section, never the whole page/direction
  const section = {
    id: String(raw.id || genId('section')).slice(0, 120),
    type: raw.type,
    variant: raw.variant ? String(raw.variant).slice(0, 60) : undefined,
    copy: raw.copy && typeof raw.copy === 'object' ? capStringsDeep(raw.copy, { maxLen: 2000, maxArray: 20, maxKeys: 20, depth: 3 }) : null,
    // BUG FIX (design intelligence pass): these were all silently dropped
    // by this whitelist on every save -- headlineRole/imageTileCount/
    // imageDisplayVariant are EXISTING fields reconcileImageSupplyWithSections
    // (script.js) sets on a section, so the "image coherence"/hero-adjacent
    // reconciliation this codebase already relies on never actually
    // survived a save+reload or a purchase+export through the server (a
    // real, previously-undiscovered gap -- found by this pass's own new
    // v10-design-test.js, the same shape as the hero/gallery preview-vs-
    // export gaps found and fixed elsewhere in this pass). zeroSupplyTreatment
    // is this pass's own new field (part 7's gallery fix) and would have
    // had the identical problem without this fix.
    headlineRole: raw.headlineRole ? String(raw.headlineRole).slice(0, 60) : undefined,
    imageTileCount: Number.isInteger(raw.imageTileCount) ? Math.max(1, Math.min(8, raw.imageTileCount)) : undefined,
    imageDisplayVariant: raw.imageDisplayVariant ? String(raw.imageDisplayVariant).slice(0, 60) : undefined,
    zeroSupplyTreatment: raw.zeroSupplyTreatment ? String(raw.zeroSupplyTreatment).slice(0, 60) : undefined,
  };
  const module = validateModule(raw.module, raw.type);
  if (module) section.module = module;
  // ctaTarget is re-validated again in a second pass once every page's
  // real surviving section ids are known (see validateDirection) -- a
  // placeholder raw copy travels through until then.
  if (raw.ctaTarget) section.__rawCtaTarget = raw.ctaTarget;
  return section;
}
function validatePage(raw) {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.sections)) return null;
  const sections = raw.sections.slice(0, MAX_SECTIONS_PER_PAGE).map(validateSection).filter(Boolean);
  return {
    id: String(raw.id || genId('page')).slice(0, 120),
    slug: typeof raw.slug === 'string' ? raw.slug.slice(0, 100) : '',
    label: String(raw.label || 'Page').slice(0, 200),
    purpose: String(raw.purpose || '').slice(0, 500),
    sections,
  };
}
function validateAssetEntry(entry) {
  if (!entry || typeof entry !== 'object') return null;
  const out = { ...entry };
  if (typeof out.dataUrl === 'string' && out.dataUrl) {
    const m = /^data:(image\/[a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=]+)$/.exec(out.dataUrl);
    if (!m) return null; // not a real embedded image data URL -- drop the whole entry rather than store garbage
    const approxBytes = Math.floor(m[2].length * 0.75);
    if (approxBytes > MAX_DATA_URL_BYTES) return null;
  }
  if (out.name != null) out.name = String(out.name).slice(0, 200);
  if (out.alt != null) out.alt = String(out.alt).slice(0, 300);
  if (out.prompt != null) out.prompt = String(out.prompt).slice(0, 1000);
  return out;
}
function validateAssets(raw) {
  const assets = { items: [], generated: {}, plan: {} };
  if (raw && Array.isArray(raw.items)) assets.items = raw.items.slice(0, MAX_ASSET_ITEMS).map(validateAssetEntry).filter(Boolean);
  if (raw && raw.generated && typeof raw.generated === 'object') {
    Object.keys(raw.generated).slice(0, MAX_ASSET_ITEMS).forEach(slot => {
      const v = validateAssetEntry(raw.generated[slot]);
      if (v) assets.generated[String(slot).slice(0, 120)] = v;
    });
  }
  if (raw && raw.plan && typeof raw.plan === 'object') assets.plan = capStringsDeep(raw.plan, { maxLen: 1000, maxArray: 20, maxKeys: 20, depth: 3 });
  return assets;
}
function validateDirection(raw) {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.pages) || !raw.pages.length) return null;
  const serializedBytes = Buffer.byteLength(JSON.stringify(raw), 'utf8');
  if (serializedBytes > MAX_DIRECTION_JSON_BYTES) return null;
  const pages = raw.pages.slice(0, MAX_PAGES).map(validatePage).filter(Boolean);
  if (!pages.length) return null;
  const pageIds = new Set(pages.map(p => p.id));
  const sectionIds = new Set(pages.flatMap(p => p.sections.map(s => s.id)));
  pages.forEach(p => p.sections.forEach(s => {
    if (s.__rawCtaTarget) { const t = validateCtaTarget(s.__rawCtaTarget, pageIds, sectionIds); if (t) s.ctaTarget = t; delete s.__rawCtaTarget; }
  }));
  const heroCtaTarget = raw.copy ? validateCtaTarget(raw.copy.ctaTarget, pageIds, sectionIds) : null;
  return {
    meta: {
      id: String((raw.meta && raw.meta.id) || genId('proj')).slice(0, 120),
      createdAt: (raw.meta && raw.meta.createdAt) || nowIso(),
      version: String((raw.meta && raw.meta.version) || 'v8').slice(0, 20),
      isDemoShell: !!(raw.meta && raw.meta.isDemoShell),
    },
    source: raw.source && typeof raw.source === 'object' ? capStringsDeep(raw.source, { maxLen: 3000, maxArray: 20, maxKeys: 20, depth: 3 }) : { text: '', location: '', facts: {}, descriptor: {} },
    business: raw.business && typeof raw.business === 'object' ? capStringsDeep(raw.business, { maxLen: 300, maxArray: 20, maxKeys: 20, depth: 3 }) : {},
    intent: raw.intent && typeof raw.intent === 'object' ? capStringsDeep(raw.intent, { maxLen: 200, maxArray: 20, maxKeys: 10, depth: 3 }) : {},
    // BUG FIX (design intelligence pass): `strategy` (archetype/visitor
    // intent/conversion goals -- see inferStrategy/normalizeClaudePlan in
    // script.js) was never preserved by this whitelist at all, on any
    // save. This pass's icon/decorative Creative Director integration
    // (part 19/20) reads project.strategy.archetype to pick icon weight,
    // density, presentation and decorative motif -- without this fix every
    // saved/purchased/exported project would silently fall back to the
    // same 'service-business' default regardless of its real archetype,
    // which is exactly the homogenization part 20 explicitly calls out.
    strategy: raw.strategy && typeof raw.strategy === 'object' ? capStringsDeep(raw.strategy, { maxLen: 500, maxArray: 20, maxKeys: 20, depth: 3 }) : undefined,
    // BUG FIX (design intelligence pass): maxKeys was 20, exactly the
    // number of pre-existing dimensions.* fields (hero/type/.../splitRatio)
    // -- this pass's 4 new icon/decorative fields (iconWeight/iconDensity/
    // iconPresentation/decorativeMotif) pushed a real project's dimensions
    // object to 24 keys, and capStringsDeep's per-object maxKeys silently
    // dropped whichever 4 keys land past the limit (verified: headingWidth/
    // cardDensity/cardShape/splitRatio, all pre-existing fields, not even
    // the new ones) on every single save. Raised with real headroom rather
    // than the exact current count, so the next dimension this codebase
    // adds doesn't reintroduce the identical silent-drop bug.
    design: raw.design && typeof raw.design === 'object' ? capStringsDeep(raw.design, { maxLen: 200, maxArray: 20, maxKeys: 40, depth: 4 }) : {},
    copy: raw.copy && typeof raw.copy === 'object' ? { ...capStringsDeep(raw.copy, { maxLen: 2000, maxArray: 20, maxKeys: 20, depth: 3 }), ctaTarget: heroCtaTarget } : { ctaTarget: heroCtaTarget },
    pages,
    activePageIndex: Number.isInteger(raw.activePageIndex) ? Math.max(0, Math.min(pages.length - 1, raw.activePageIndex)) : 0,
    footerVariant: typeof raw.footerVariant === 'string' ? raw.footerVariant.slice(0, 60) : 'simple',
    assets: validateAssets(raw.assets),
    responsive: raw.responsive && typeof raw.responsive === 'object' ? capStringsDeep(raw.responsive, { maxLen: 60, maxArray: 5, maxKeys: 5, depth: 2 }) : { device: 'desktop' },
  };
}
// The top-level entry point: validates/normalizes the exact
// `{directions, activeDirectionIndex}` shape the client sends. Never
// throws on bad input -- always returns {valid:false, error} instead, so a
// malformed/hostile payload can never crash the request handler.
function validateDirectionsState(payload) {
  if (!payload || typeof payload !== 'object' || !Array.isArray(payload.directions)) {
    return { valid: false, error: 'Malformed project state.' };
  }
  const totalBytes = Buffer.byteLength(JSON.stringify(payload), 'utf8');
  if (totalBytes > MAX_TOTAL_PAYLOAD_BYTES) return { valid: false, error: 'Project state is too large.' };
  const directions = payload.directions.slice(0, MAX_DIRECTIONS).map(validateDirection).filter(Boolean);
  if (!directions.length) return { valid: false, error: 'No valid direction in project state.' };
  const activeDirectionIndex = Number.isInteger(payload.activeDirectionIndex)
    ? Math.max(0, Math.min(directions.length - 1, payload.activeDirectionIndex))
    : 0;
  return { valid: true, normalized: { directions, activeDirectionIndex } };
}

// ---- Asset internalization (content-addressed local store) ---------------
// Swaps every embedded base64 dataUrl for a stable {assetRef:<sha256>}
// marker at PERSIST time (deduping identical bytes across saves/projects),
// and reverses it at READ time -- entirely transparent to the client
// renderer, which only ever sees a real dataUrl again once hydrated. See
// SITE-PROJECT-V8.5.md "asset persistence" for why this -- not a full
// object-storage service -- is the right-sized V8.5 strategy.
function internalizeOneEntry(db, entry) {
  if (!entry || typeof entry.dataUrl !== 'string') return entry;
  const m = /^data:(image\/[a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=]+)$/.exec(entry.dataUrl);
  if (!m) return entry;
  const buf = Buffer.from(m[2], 'base64');
  const { hash } = getAssetStore().put(buf); // writes the bytes (no-op if already present -- content-addressed)
  db.assetBlobs.insertIfMissing({ hash, contentType: m[1], byteLength: buf.length, createdAt: nowIso() });
  const { dataUrl, ...rest } = entry;
  return { ...rest, assetRef: hash };
}
function hydrateOneEntry(db, entry) {
  if (!entry || typeof entry.assetRef !== 'string' || entry.dataUrl) return entry;
  const row = db.assetBlobs.find(entry.assetRef);
  if (!row) return entry; // referenced blob missing (shouldn't happen) -- degrade to no image rather than throw
  const buf = getAssetStore().get(entry.assetRef);
  if (!buf) return entry;
  return { ...entry, dataUrl: `data:${row.content_type};base64,${buf.toString('base64')}` };
}
function internalizeAssets(db, directionsState) {
  directionsState.directions.forEach(proj => {
    if (!proj.assets) return;
    proj.assets.items = (proj.assets.items || []).map(e => internalizeOneEntry(db, e));
    const gen = proj.assets.generated || {};
    Object.keys(gen).forEach(slot => { gen[slot] = internalizeOneEntry(db, gen[slot]); });
  });
  return directionsState;
}
function hydrateAssets(db, directionsState) {
  directionsState.directions.forEach(proj => {
    if (!proj.assets) return;
    proj.assets.items = (proj.assets.items || []).map(e => hydrateOneEntry(db, e));
    const gen = proj.assets.generated || {};
    Object.keys(gen).forEach(slot => { gen[slot] = hydrateOneEntry(db, gen[slot]); });
  });
  return directionsState;
}

// ---- Row <-> API shape ----------------------------------------------------
function rowToSummary(row) {
  return { id: row.id, name: row.name, status: row.status, purchaseRef: row.purchase_ref || null, revision: row.revision, createdAt: row.created_at, updatedAt: row.updated_at };
}
function rowToFull(db, row) {
  const directionsState = hydrateAssets(db, JSON.parse(row.state_json));
  return { ...rowToSummary(row), directionsState };
}

// ---- Ownership-scoped CRUD -------------------------------------------------
// Every function below takes an explicit ownerId and never returns/mutates
// a row belonging to a different account -- see this file's own header
// comment. A caller (the HTTP layer) is responsible for having already
// authenticated ownerId itself; nothing here accepts an owner id from the
// request body.
function listOwnedProjects(db, ownerId) {
  return db.projects.listOwned(ownerId).map(rowToSummary);
}
function getOwnedProject(db, ownerId, projectId) {
  const row = db.projects.findOwned(ownerId, projectId);
  return row ? rowToFull(db, row) : null;
}
// V8.6: like getOwnedProject, but returns the RAW row (state_json parsed,
// assets left as {assetRef} content-hash markers, NOT hydrated to dataUrl)
// alongside the full row (status/revision/etc). Added for the export
// compiler (lib/export-compiler.js), which needs two things
// getOwnedProject's hydrated shape doesn't give it: (1) a stable,
// dataUrl-free JSON shape to hash for export reproducibility (§12 -- a
// hydrated dataUrl would make the hash depend on this project's OWN
// asset-store file layout, not just its logical content), and (2) full
// control over exactly when/how each assetRef gets resolved to a real
// exported file (see hydrateAssetsForExport in lib/export-compiler.js).
// Purely additive -- getOwnedProject/rowToFull/hydrateAssets are untouched.
function getOwnedProjectRaw(db, ownerId, projectId) {
  const row = db.projects.findOwned(ownerId, projectId);
  if (!row) return null;
  return { ...rowToSummary(row), directionsState: JSON.parse(row.state_json) };
}
function getOwnedProjectStatus(db, ownerId, projectId) {
  const row = db.projects.findOwned(ownerId, projectId);
  return row ? { id: row.id, status: row.status, purchaseRef: row.purchase_ref || null, updatedAt: row.updated_at } : null;
}
// App bridge pass (Phase 4): the projects.deployment_status summary column
// (kept in sync by lib/deployment-store.js syncProjectDeploymentStatus) was
// never exposed by any read here. Additive, ownership-scoped, read-only.
function getOwnedProjectDeploymentStatus(db, ownerId, projectId) {
  const row = db.projects.findOwned(ownerId, projectId);
  return row ? (row.deployment_status || 'not_deployed') : null;
}
// Idempotent create/migrate: if `sourceLocalId` names a local project this
// account has already migrated, returns that EXISTING row untouched
// (never a duplicate, never silently overwritten by a second migration
// call with possibly-older local state -- see SITE-PROJECT-V8.5.md
// "anonymous -> account migration").
function createProject(db, ownerId, { name, directionsState, sourceLocalId } = {}) {
  if (sourceLocalId) {
    const existing = db.projects.findOwnedBySourceLocalId(ownerId, String(sourceLocalId).slice(0, 120));
    if (existing) return { ok: true, migrated: false, alreadyExisted: true, project: rowToSummary(existing) };
  }
  const check = validateDirectionsState(directionsState);
  if (!check.valid) return { ok: false, error: check.error };
  internalizeAssets(db, check.normalized);
  const id = genId('proj');
  const ts = nowIso();
  db.projects.insert({
    id, ownerId, name: String(name || 'Untitled project').slice(0, 200),
    sourceLocalId: sourceLocalId ? String(sourceLocalId).slice(0, 120) : null,
    stateJson: JSON.stringify(check.normalized), createdAt: ts, updatedAt: ts,
  });
  const row = db.projects.findById(id);
  return { ok: true, migrated: !!sourceLocalId, alreadyExisted: false, project: rowToSummary(row) };
}
// Optimistic concurrency: if `expectedRevision` is supplied and doesn't
// match the row's current revision, the update is refused with the
// server's own current state attached, rather than blindly overwriting
// newer server state with stale local state (see SITE-PROJECT-V8.5.md
// "cross-device restore" / "autosave" conflict strategy).
function updateOwnedProject(db, ownerId, projectId, { name, directionsState, expectedRevision } = {}) {
  const row = db.projects.findOwned(ownerId, projectId);
  if (!row) return { ok: false, reason: 'not_found' };
  if (Number.isInteger(expectedRevision) && expectedRevision !== row.revision) {
    return { ok: false, reason: 'conflict', current: rowToFull(db, row) };
  }
  let normalized = JSON.parse(row.state_json);
  if (directionsState) {
    const check = validateDirectionsState(directionsState);
    if (!check.valid) return { ok: false, reason: 'invalid', error: check.error };
    normalized = internalizeAssets(db, check.normalized);
  }
  const ts = nowIso();
  const newName = name != null ? String(name).slice(0, 200) : row.name;
  // The revision check is repeated in the compare-and-swap WHERE clause
  // (still enforced by the adapter's updateWithRevisionCheck) as real
  // defense in depth, even though this whole function already runs
  // synchronously start-to-finish (see lib/entitlement.js's own comment on
  // why that already rules out interleaving in this single process).
  const result = db.projects.updateWithRevisionCheck({
    id: projectId, ownerId, name: newName, stateJson: JSON.stringify(normalized),
    expectedRevision: row.revision, updatedAt: ts,
  });
  if (result.changes === 0) {
    const fresh = db.projects.findOwned(ownerId, projectId);
    return { ok: false, reason: 'conflict', current: fresh ? rowToFull(db, fresh) : null };
  }
  const updated = db.projects.findById(projectId);
  return { ok: true, project: rowToSummary(updated) };
}
// Only a DRAFT may be archived -- refuses on checkout_pending/purchased,
// never silently archives a project mid-purchase or already bought.
function archiveProject(db, ownerId, projectId) {
  const row = db.projects.findOwned(ownerId, projectId);
  if (!row) return { ok: false, reason: 'not_found' };
  if (row.status !== 'draft') return { ok: false, reason: 'not_draft' };
  db.projects.archiveDraft(projectId, nowIso());
  return { ok: true };
}

module.exports = {
  MAX_DIRECTIONS, MAX_PAGES, MAX_DATA_URL_BYTES, MAX_TOTAL_PAYLOAD_BYTES,
  validateDirectionsState, capStringsDeep,
  // App bridge pass (Phase 4): exported (additively, unchanged) so
  // lib/apply-refinement-plan.js can validate a section it is about to
  // insert with the exact same whitelist every save already applies,
  // instead of a second copy of section-shape rules.
  validateSection, validateDirection,
  listOwnedProjects, getOwnedProject, getOwnedProjectRaw, getOwnedProjectStatus, getOwnedProjectDeploymentStatus, createProject, updateOwnedProject, archiveProject,
  internalizeAssets, hydrateAssets,
};
// V8.7 backward-compat: pre-V8.7 code (including the already-shipped,
// frozen v8-6-deployment-test.js, which pokes a synthetic asset blob
// directly onto disk to test a missing-DB-row edge case) reached into
// `projectStore.ASSET_STORE_DIR` directly. That constant is now the local
// AssetStore's own concern (lib/adapters/local-asset-store.js), so this is
// a live-computed passthrough -- always the real current local asset
// directory, honoring SITEREMADE_ASSET_STORE_DIR the same as the store
// itself -- rather than a second, potentially-stale copy of the same path.
Object.defineProperty(module.exports, 'ASSET_STORE_DIR', { enumerable: true, get: () => getAssetStore().dir });
