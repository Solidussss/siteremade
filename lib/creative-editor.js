'use strict';
// CREATIVE WEBSITE EDITOR -- the builder half of the Client App's Website view for a CREATIVE website. The app is only the
// control surface: everything here operates on the REAL Creative project (direction.creative: its plan, its pictures and
// their provenance, its 3D block, its premium media) and every change is re-validated by the same Creative validator a
// save runs (validatePlan2, safety -- the store runs it again on save), so an edited page is always a valid Creative page
// that renders, previews and exports through the one Creative renderer. Nothing here calls a provider: the paid actions
// (AI revisions, a 3D model, a cinematic clip) are quoted, reserved and run by server.js through the existing quote,
// credit and premium-job systems; this module only reads the project and applies FREE, deterministic changes.
//
//   creativeOf(direction)                        -> direction.creative when it is a Creative page with a v2 plan, else null
//   outline(direction, opts)                     -> the editable outline the app shows (no secrets, no bytes, no provider data)
//   applyEdit(direction, op, opts)               -> { ok, creative, summary } | { ok:false, code, message }  (free ops)
//   addUpload(direction, png, opts)              -> { ok, creative, asset } | { ok:false, ... }  (measured here, never trusted)
//   attachDelivered(direction, job, target)      -> { changed, creative, summary }  (a finished premium job, once)
//   mergeWords(original, revised, scope)         -> the plan with ONLY the scoped words taken from a revision
//   mergeScenes(original, revised, ids)          -> the plan with the scoped scenes taken from a revision
//   textOf / sceneDiff                           -> what an edit actually changed (no change = no charge)
//
// THE RULE this module exists for: a Creative edit changes creative.plan (or the page's own 3D / media records) -- it never
// writes Business fields (copy, pages, sections, design) that the Creative renderer does not read.

const crypto = require('crypto');
const { validatePlan2 } = require('./creative/validate2');
const TD = require('./creative/three-d');
const LOOK = require('./creative/look');
const { renderCreative2 } = require('./creative/render2');
const TYPEFACES = require('./creative/fonts');
const COMP = require('./creative/composition');
const PNG = require('./creative/png');
const ASSETS = require('./creative/assets');
const PS = require('./creative/premium-source');

const LIMITS = { kicker: 70, heading: 110, body: 520, item: 260 };
const UPLOAD = { maxBytes: 8 * 1024 * 1024, minSide: 64, maxSide: 8000, maxAssets: 40 };
const FIELDS = ['kicker', 'heading', 'body', 'item'];
const ID = /^[\w-]{1,60}$/;
const clean = (v, n) => String(v == null ? '' : v).replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
const copy = x => JSON.parse(JSON.stringify(x));
const fail = (code, message, extra) => Object.assign({ ok: false, code, message }, extra || {});

function creativeOf(direction) {
  const d = direction || {}; const c = d.mode === 'creative' && d.creative && typeof d.creative === 'object' ? d.creative : null;
  return c && c.plan && c.plan.v === 2 && Array.isArray(c.plan.scenes) ? c : null;
}
const live = c => (Array.isArray(c.assets) ? c.assets : []).filter(a => a && a.id && !a.removed && !a.failed);
const byIdOf = c => new Map(live(c).map(a => [a.id, a]));
const rootOf = (a, byId) => (a ? LOOK.root(a, byId) : null);

// the validation context a saved Creative page is checked against (lib/creative/store.js sanitizeCreative)
function vctx(c, extra) {
  const r = c.research || {};
  return Object.assign({ mode: 'safety', page: r.page || null, assets: live(c), models: Array.isArray(c.models) ? c.models : [], facts: (c.plan && c.plan.facts) || r.facts || [],
    understanding: c.understanding || {}, supplied: [].concat((c.supplied && c.supplied.facts) || [], (c.supplied && c.supplied.memories) || []), mainAsset: c.mainAsset || null }, extra || {});
}
// opts: { baseline: the errors the page already had (a save keeps a page with them -- the store does not refuse it -- so an
// unrelated edit is never blocked by them), owner(error): an error about the owner's OWN words (a number the owner
// writes into their own headline is theirs to state; the honesty rule is for words SiteRemade wrote) }
function revalidate(c, plan, extra, opts) {
  const o = opts || {}; const v = validatePlan2(plan, vctx(c, extra)); const known = new Set(o.baseline || []);
  const errors = (v.errors || []).filter(e => !known.has(e) && !(o.owner && o.owner(e)));
  if (errors.length) return { ok: false, errors };
  return { ok: true, plan: v.plan, fixes: v.fixes || [] };
}

// what fitWords set again in one scene, in the owner's terms (validate2 records them as 'scene <id>: text layout -- ...')
const fitNotes = (fixes, id) => (fixes || []).filter(f => f.startsWith(`scene ${id}: text layout -- `)).map(f => f.slice(`scene ${id}: text layout -- `.length));
// the scenes whose words differ between two plans (an AI rewrite re-fits exactly those)
const changedWordScenes = (a, b) => b.scenes.filter(s => { const o = a.scenes.find(x => x.id === s.id); return o && JSON.stringify(textOf(o)) !== JSON.stringify(textOf(s)); }).map(s => s.id);
// what the saved page already does not satisfy (its errors as the validator words them): never held against a change
const baselineErrors = c => validatePlan2(copy(c.plan), vctx(c)).errors || [];

// ---------------------------------------------------------------- what a picture is, in the owner's terms
function sourceOf(a, byId) {
  const r = rootOf(a, byId) || a;
  const kind = r.origin === 'upload' ? (r.ownerPicked ? 'picked' : 'upload') : r.origin === 'research' ? 'web' : 'derived';
  return Object.assign({ kind, rootId: r.id, title: clean(r.title, 120), cutout: !!a.cutoutOf, copy: !!a.derivedFrom },
    kind === 'web' || kind === 'picked' ? { author: clean(r.author, 120), license: clean(r.license, 60), pageUrl: /^https:\/\//.test(r.pageUrl || '') ? r.pageUrl : '' } : {});
}
const textOf = s => ({ kicker: (s.text && s.text.kicker) || '', heading: (s.text && s.text.heading) || '', body: (s.text && s.text.body) || '', items: ((s.text && s.text.items) || []).map(i => i.text || '') });
// (a long heading names its scene by its first words, cut between words)
const sceneName = (s, i) => { const n = clean(s.navLabel || (s.text && s.text.heading) || s.name || `Scene ${i + 1}`, 400); return n.length <= 60 ? n : n.slice(0, 58).replace(/\s+\S*$/, '') + '…'; };

// the colours a scene may stand on: the page's own approved palette (plan.look's brand roles, else the plan palette) --
// never a free colour value
function sceneColours(plan) {
  const b = plan.look && plan.look.brand;
  if (b && b.primary) return [['primary', 'Brand colour', b.primary], ['light', 'Light', b.light], ['deep', 'Deep', b.deep]].filter(x => /^#[0-9a-f]{6}$/i.test(x[2] || '')).map(([role, label, hex]) => ({ role, label, hex }));
  const P = plan.palette || {};
  return [['bg', 'Page colour', P.bg], ['bg2', 'Second colour', P.bg2], ['accent', 'Accent', P.accent]].filter(x => /^#[0-9a-f]{6}$/i.test(x[2] || '')).map(([role, label, hex]) => ({ role, label, hex }));
}
// the compositions a scene's own pictures can carry (composition.js fit) -- the existing Creative recompose stages them
function compositionsFor(scene, byId, name) {
  let x; try { x = COMP.carryOf(scene, byId, { name }); } catch (e) { return []; }
  return COMP.COMPOSITIONS.filter(k => { try { return COMP.fit(k, x); } catch (e) { return false; } }).map(k => ({ id: k, label: clean(COMP.SPEC[k] && COMP.SPEC[k].what, 120) }));
}

// ---------------------------------------------------------------- the outline
// opts: { media: [premium media the account owns for this project: { mediaId, sourceAssetId, intent }],
//         can: { model3d: bool, motion: bool, ai: bool } (what the server offers right now) }
function outline(direction, opts) {
  const c = creativeOf(direction); if (!c) return null;
  const o = opts || {}; const can = o.can || {}; const plan = c.plan; const byId = byIdOf(c);
  const td = c.threeD && Array.isArray(c.threeD.assets) ? c.threeD : { assets: [], scenes: [] };
  const modelFor = rootId => td.assets.find(m => m && m.sourceAssetId && rootOf(byId.get(m.sourceAssetId), byId) && rootOf(byId.get(m.sourceAssetId), byId).id === rootId) || null;
  const ownerUpload = a => { const r = rootOf(a, byId); return !!(r && r.origin === 'upload' && !r.ownerPicked && !r.pageUrl && !r.sourceUrl && r.ownerRole !== 'logo'); };
  const used = new Set();
  const scenes = plan.scenes.map((s, i) => {
    const pictures = (s.layers || []).filter(L => L.kind === 'image' && byId.get(L.asset)).map(L => {
      const a = byId.get(L.asset); const r = rootOf(a, byId) || a; used.add(r.id);
      const vid = (r.video && r.video.mediaId ? r : a.video && a.video.mediaId ? a : null);
      const model = modelFor(r.id);
      const clip = vid ? { mediaId: vid.video.mediaId, intent: vid.video.intent || '' } : null;
      const actions = ['replace', 'remove'];
      if (ownerUpload(a) && can.model3d) actions.push(model ? 'model3d-reuse' : 'model3d');
      if (ownerUpload(a) && can.motion) actions.push(clip ? 'motion-new' : 'motion');
      if (clip) actions.push('motion-remove');
      else if ((o.media || []).some(m => m.sourceAssetId === r.id)) actions.push('motion-restore');
      return { layerId: L.id, assetId: a.id, role: L.role, callback: !!L.callback, source: sourceOf(a, byId), clip, model: model ? { id: model.id } : null, actions };
    });
    const models = (td.scenes || []).filter(x => x.sectionId === s.id).map(x => ({ id: x.id, modelId: x.assetId, composition: x.composition, distance: x.camera && x.camera.distance, azimuth: x.camera && x.camera.azimuth,
      actions: ['move', 'resize', 'turn', 'composition', 'remove'].concat(can.motion ? ['motion-from-3d'] : []) }));
    return {
      id: s.id, index: i, name: sceneName(s, i), composition: s.composition || s.layout || 'free', background: (s.ink && s.ink.surface) || '',
      text: textOf(s), pictures, models,
      compositions: compositionsFor(s, byId, plan.identity && plan.identity.name),
      actions: ['text'].concat(JSON.stringify(textOf(s)) !== JSON.stringify(textOf({})) ? ['text-layout'] : [], ['colour', 'composition'], can.ai ? ['ai-text', 'ai-scene'] : []),
    };
  });
  const pictures = live(c).filter(a => !a.cutoutOf && !a.derivedFrom && a.ownerRole !== 'logo' && a.kind !== 'logo').map(a => ({ assetId: a.id, source: sourceOf(a, byId), onPage: used.has(a.id), width: (a.assess && a.assess.width) || 0, height: (a.assess && a.assess.height) || 0 }));
  const look = plan.look ? { family: plan.look.type && plan.look.type.family, devices: plan.look.devices || [], enter: plan.look.enter } : null;
  return {
    kind: 'creative', name: clean(plan.identity && plan.identity.name, 120), look, palette: sceneColours(plan), scenes, pictures,
    models: td.assets.map(m => ({ id: m.id, sourceAssetId: m.sourceAssetId, placedIn: (td.scenes || []).filter(x => x.assetId === m.id).map(x => x.sectionId) })),
    media: live(c).filter(a => a.video && a.video.mediaId).map(a => ({ assetId: a.id, mediaId: a.video.mediaId, intent: a.video.intent || '' })),
    threeDCompositions: TD.COMPOSITION_NAMES, actions: ['reapply-look', 'fonts'].concat(can.ai ? ['ai-site'] : []),
    // the typefaces the page may use (fonts.js: ids, names, categories, pairings) and the ones it uses now -- null: the page's
    // own type, as it was made
    fonts: Object.assign(TYPEFACES.catalogue(), { current: TYPEFACES.sanitize(plan.fonts) }),
  };
}

// ---------------------------------------------------------------- free edits
const sceneAt = (plan, id) => plan.scenes.find(s => s.id === id) || null;
// op: { type, ... } -> { ok, creative (the new direction.creative), summary } | { ok:false, code, message }
// opts: { media(assetId) -> the account's completed premium media for that picture [{ mediaId, assetRef, mime, intent, provider, providerJobId }] }
function applyEdit(direction, op, opts) {
  const c0 = creativeOf(direction); if (!c0) return fail('not_creative', 'This website is not a Creative page.');
  const o = op && typeof op === 'object' ? op : {}; const c = copy(c0); const plan = c.plan; const byId = byIdOf(c);
  const scene = o.sceneId ? sceneAt(plan, String(o.sceneId)) : null;
  if (o.sceneId && !scene) return fail('not_found', 'That scene is not on the page any more. Refresh and try again.');
  const done = (p, summary, extra) => { c.plan = p; c.updatedAt = new Date().toISOString(); return Object.assign({ ok: true, creative: c, summary }, extra || {}); };
  const baseline = baselineErrors(c0);
  const ownWords = scene && o.type === 'text' ? e => e.includes(`(${scene.id})`) && /which no given fact supports|number/i.test(e) : null;
  const check = (p, extra) => revalidate(c, p, extra, { baseline, owner: ownWords });
  switch (o.type) {
    case 'text': {
      if (!scene) return fail('invalid_request', 'Choose the text to change.');
      const name0 = sceneName(scene, plan.scenes.indexOf(scene));
      const field = FIELDS.includes(o.field) ? o.field : null; if (!field) return fail('invalid_request', 'That text cannot be edited.');
      const value = clean(o.value, LIMITS[field]); if (!value && field !== 'kicker') return fail('invalid_request', 'Write the new text first.');
      if (String(o.value || '').trim().length > LIMITS[field]) return fail('too_long', `Please keep this under ${LIMITS[field]} characters.`);
      const t = scene.text = scene.text || {};
      if (field === 'item') {
        const k = Number(o.index); if (!Array.isArray(t.items) || !Number.isInteger(k) || !t.items[k]) return fail('not_found', 'That line is not on the page any more.');
        t.items[k] = Object.assign({}, t.items[k], { text: value, kind: 'supplied' }); delete t.items[k].cite;
      } else {
        t[field] = value;
        // (the owner's own words are theirs: a paragraph they write is marked as supplied, never as a cited fact)
        if (field === 'body') { t.kind = value ? 'supplied' : t.kind; delete t.cite; }
      }
      // (a line the owner writes that states a number is one of the owner's own details -- creative.supplied, the same place
      // the details they gave when the page was made live -- so every later check, and the AI director, treat it as theirs)
      if (/\d/.test(value)) { const sup = c.supplied = c.supplied && typeof c.supplied === 'object' ? c.supplied : { facts: [], memories: [] }; sup.facts = (Array.isArray(sup.facts) ? sup.facts : []).filter(x => x !== value).concat([value]).slice(-12); }
      // (the words are set again for what they say now -- ARCH.fitWords, the composition's own rules -- never left in a
      // layout made for the words they replaced)
      const v = check(plan, { refit: [scene.id] }); if (!v.ok) return fail('edit_failed', `That text could not be used: ${v.errors[0]}`);
      const after = textOf(sceneAt(v.plan, scene.id) || {});
      const got = field === 'item' ? after.items[Number(o.index)] : after[field];
      if (got !== value) return fail('edit_failed', 'That text could not be applied to this scene, so nothing was changed.');
      return done(v.plan, `Updated the ${field === 'item' ? 'line' : field} of “${name0}”`, { fitted: fitNotes(v.fixes, scene.id) });
    }
    case 'text-layout': {
      // FIX TEXT LAYOUT: the same words, set again by the composition's own rules (ARCH.fitWords) -- free, no provider
      if (!scene) return fail('invalid_request', 'Choose the scene first.');
      const name0 = sceneName(scene, plan.scenes.indexOf(scene)); const words0 = JSON.stringify(textOf(scene));
      if (words0 === JSON.stringify(textOf({}))) return fail('invalid_request', 'This scene has no words to fit.');
      const as = check(copy(plan)); const v = check(plan, { refit: [scene.id] });
      if (!as.ok || !v.ok) return fail('edit_failed', `The text layout could not be fixed: ${(v.errors || as.errors)[0]}`);
      const s1 = sceneAt(v.plan, scene.id); const s0 = sceneAt(as.plan, scene.id);
      // (never a word, and nothing but this scene's words' layout: the rest of the page exactly as a save leaves it)
      if (JSON.stringify(textOf(s1)) !== words0) return fail('edit_failed', 'The text layout could not be fixed without changing the words, so nothing was changed.');
      const rest = p => JSON.stringify(Object.assign({}, p, { scenes: p.scenes.map(s => (s.id === scene.id ? Object.assign({}, s, { text: null }) : s)) }));
      if (rest(v.plan) !== rest(as.plan)) return fail('edit_failed', 'The text layout could not be fixed without changing the rest of the page, so nothing was changed.');
      const notes = fitNotes(v.fixes, scene.id);
      // (judged by what the page LOOKS like -- the page as it renders now against the page with this scene set by today's
      // text-layout rules: a scene saved under older rules renders differently even when none of its words or fields change)
      const look = p => renderCreative2(p, live(c), { mode: 'export', src: a => a.id });
      if (look(v.plan) === look(as.plan)) return { ok: true, unchanged: true, creative: c0, summary: `Text already fits in “${name0}” -- nothing needed changing`, fitted: [] };
      if ((s0.text.fit || 0) < LOOK.TEXT_FIT) notes.push('the headline is set by today’s line-fitting rules (balanced lines, short words held together)');
      return done(v.plan, `Fixed the text layout of “${name0}” (the words are unchanged)`, { fitted: notes });
    }
    case 'picture-replace': case 'picture-remove': {
      if (!scene) return fail('invalid_request', 'Choose the picture first.');
      const L = (scene.layers || []).find(x => x.id === o.layerId && x.kind === 'image'); if (!L) return fail('not_found', 'That picture is not on the page any more.');
      if (o.type === 'picture-remove') {
        scene.layers = scene.layers.filter(x => x !== L);
        const v = check(plan); if (!v.ok) return fail('edit_failed', `The picture could not be removed: ${v.errors[0]}`);
        return done(v.plan, 'Removed a picture from the scene');
      }
      const a = byId.get(String(o.assetId || '')); if (!a) return fail('not_found', 'That picture is not in this project.');
      if (a.ownerRole === 'logo' || a.kind === 'logo') return fail('invalid_request', 'The logo is shown in the header, never as a scene picture.');
      const want = rootOf(a, byId).id;
      // (a picture already shown elsewhere is the SAME picture: the image ledger keeps one appearance -- never a duplicate)
      const elsewhere = plan.scenes.find(s => s !== scene && (s.layers || []).some(x => x.kind === 'image' && byId.get(x.asset) && rootOf(byId.get(x.asset), byId).id === want));
      if (elsewhere) return fail('already_on_page', `That picture is already on the page (in “${sceneName(elsewhere, plan.scenes.indexOf(elsewhere))}”). Each picture appears once -- remove it there first.`);
      L.asset = a.id; delete L.callback;
      const v = check(plan); if (!v.ok) return fail('edit_failed', `That picture could not be used: ${v.errors[0]}`);
      const shown = (sceneAt(v.plan, scene.id).layers || []).some(x => x.kind === 'image' && byId.get(x.asset) && rootOf(byId.get(x.asset), byId).id === want);
      if (!shown) return fail('edit_failed', 'That picture could not be shown in this scene, so nothing was changed.');
      return done(v.plan, `Replaced a picture in “${sceneName(scene, plan.scenes.indexOf(scene))}”`);
    }
    case 'composition': {
      if (!scene) return fail('invalid_request', 'Choose the scene first.');
      const k = String(o.composition || ''); if (!COMP.COMPOSITIONS.includes(k)) return fail('invalid_request', 'That composition is not available.');
      if (!compositionsFor(scene, byId, plan.identity && plan.identity.name).some(x => x.id === k)) return fail('not_supported', 'This scene’s pictures cannot carry that composition.');
      scene.composition = k;
      // (the existing Creative recompose: the scene is staged again by its archetype, the rest of the page as saved)
      const v = check(plan, { recompose: [scene.id] }); if (!v.ok) return fail('edit_failed', `That composition could not be applied: ${v.errors[0]}`);
      if ((sceneAt(v.plan, scene.id) || {}).composition !== k) return fail('not_supported', 'This scene could not take that composition, so nothing was changed.');
      return done(v.plan, `Changed the composition of “${sceneName(scene, plan.scenes.indexOf(scene))}”`);
    }
    case 'colour': {
      if (!scene) return fail('invalid_request', 'Choose the scene first.');
      const pick = sceneColours(plan).find(x => x.role === o.role); if (!pick) return fail('invalid_request', 'Choose one of the page’s own colours.');
      scene.background = 'base'; scene.tone = pick.hex;
      const v = check(plan); if (!v.ok) return fail('edit_failed', `That colour could not be applied: ${v.errors[0]}`);
      if ((sceneAt(v.plan, scene.id) || {}).tone !== pick.hex) return fail('edit_failed', 'That colour could not be applied, so nothing was changed.');
      return done(v.plan, `“${sceneName(scene, plan.scenes.indexOf(scene))}” now stands on the ${pick.label.toLowerCase()}`);
    }
    case 'fonts': {
      // THE PAGE'S TYPEFACES (fonts.js): a pairing, or a face for one role (headline, body, label) -- known ids only, never a
      // family string; '' gives a role back to the page's own type. Free, no provider, a draft. Every scene's words are then
      // set by today's text-layout rules (validatePlan2 refit: the chosen face's own width fits each heading).
      const cur = TYPEFACES.sanitize(plan.fonts) || {}; let next;
      if (o.preset != null && o.preset !== '') {
        const p = TYPEFACES.preset(String(o.preset)); if (!p) return fail('invalid_request', 'That font pairing is not available.');
        next = { headline: p.headline, body: p.body, label: p.label, preset: p.id };
      } else {
        next = Object.assign({}, cur); delete next.preset; let asked = 0;
        for (const r of TYPEFACES.ROLES) {
          if (o[r] === undefined) continue; asked++;
          if (o[r] === '' || o[r] === null) delete next[r];
          else if (!TYPEFACES.known(o[r])) return fail('invalid_request', 'That font is not available.');
          else next[r] = o[r];
        }
        if (!asked) return fail('invalid_request', 'Choose a font first.');
      }
      if (Object.keys(next).filter(k => k !== 'preset').length) plan.fonts = next; else delete plan.fonts;
      const as = check(copy(c0.plan)); const v = check(plan, { refit: plan.scenes.map(s => s.id) });
      if (!as.ok || !v.ok) return fail('edit_failed', `Those fonts could not be applied: ${(v.errors || as.errors)[0]}`);
      // (never a word: every scene says exactly what it said)
      if (v.plan.scenes.some((s, i) => JSON.stringify(textOf(s)) !== JSON.stringify(textOf(as.plan.scenes[i])))) return fail('edit_failed', 'Those fonts could not be applied without changing the words, so nothing was changed.');
      const look = p => renderCreative2(p, live(c), { mode: 'export', src: a => a.id });
      if (look(v.plan) === look(as.plan)) return { ok: true, unchanged: true, creative: c0, summary: 'The page already uses these fonts -- nothing needed changing', fitted: [] };
      const name = id => (TYPEFACES.get(id) || {}).label || 'the page’s own';
      const f = TYPEFACES.sanitize(v.plan.fonts);
      return done(v.plan, f ? `Fonts${f.preset ? ` (${TYPEFACES.preset(f.preset).name})` : ''}: headlines in ${name(f.headline)}, text in ${name(f.body)}, labels in ${name(f.label)}` : 'Back to the page’s own fonts');
    }
    case 'reapply-look': {
      // today's layout and look rules, as the studio's "Re-apply today's layout rules" (validatePlan2 accept)
      const v = check(plan, { mode: 'accept', art: undefined });
      if (!v.ok) return fail('edit_failed', `The current layout rules could not be applied: ${v.errors[0]}`);
      return done(v.plan, 'Re-applied the current layout and look rules');
    }
    case 'model-move': case 'model-resize': case 'model-turn': case 'model-composition': case 'model-remove': case 'model-place': {
      const td = c.threeD && Array.isArray(c.threeD.assets) ? c.threeD : null; if (!td || !td.assets.length) return fail('not_found', 'This page has no 3D model.');
      const sectionIds = plan.scenes.map(s => s.id); td.scenes = Array.isArray(td.scenes) ? td.scenes : [];
      if (o.type === 'model-place') {
        const m = td.assets.find(x => x.id === o.modelId); if (!m) return fail('not_found', 'That 3D model is not in this project.');
        const to = String(o.sectionId || ''); if (!sectionIds.includes(to)) return fail('invalid_request', 'Choose a scene on the page.');
        if (td.scenes.some(x => x.sectionId === to)) return fail('limit', 'That scene already shows a 3D model.');
        td.scenes.push({ id: `td-${to}`.slice(0, 40), assetId: m.id, sectionId: to, composition: TD.POSE.DEMO_COMPOSITION });
      } else {
        const sc = td.scenes.find(x => x.id === o.modelSceneId); if (!sc) return fail('not_found', 'That 3D model is not on the page any more.');
        if (o.type === 'model-remove') td.scenes = td.scenes.filter(x => x !== sc);
        else if (o.type === 'model-move') { const to = String(o.sectionId || ''); if (!sectionIds.includes(to)) return fail('invalid_request', 'Choose a scene on the page.'); if (td.scenes.some(x => x !== sc && x.sectionId === to)) return fail('limit', 'That scene already shows a 3D model.'); sc.sectionId = to; }
        else if (o.type === 'model-resize') { const d = Number(o.distance); if (!isFinite(d)) return fail('invalid_request', 'Choose a size.'); sc.camera = Object.assign({}, sc.camera, { distance: d }); }
        else if (o.type === 'model-turn') { const az = Number(o.azimuth); if (!isFinite(az)) return fail('invalid_request', 'Choose an angle.'); sc.camera = Object.assign({}, sc.camera, { azimuth: az }); }
        else if (o.type === 'model-composition') { if (!TD.COMPOSITION_NAMES.includes(o.composition)) return fail('invalid_request', 'That 3D staging is not available.'); const keep = sc.camera || {}; sc.composition = o.composition; sc.interaction = undefined; sc.camera = { distance: keep.distance }; sc.turns = undefined; }
      }
      // (bounded by the same 3D validator a save uses: numbers are clamped, unknown ids dropped)
      c.threeD = TD.normalise(td, { sectionIds });
      return done(plan, { 'model-place': 'Placed the existing 3D model (no new model was made)', 'model-remove': 'Took the 3D model off the scene (it stays in your project)', 'model-move': 'Moved the 3D model', 'model-resize': 'Resized the 3D model', 'model-turn': 'Turned the 3D model', 'model-composition': 'Changed how the 3D model moves' }[o.type]);
    }
    case 'motion-remove': case 'motion-restore': {
      const a = byId.get(String(o.assetId || '')); if (!a) return fail('not_found', 'That picture is not in this project.');
      const r = rootOf(a, byId); const target = c.assets.find(x => x.id === r.id);
      if (o.type === 'motion-remove') {
        if (!target.video) return fail('not_found', 'That picture has no cinematic clip.');
        delete target.video; if (target.premium && target.premium.sourceAssetId === target.id) delete target.premium;
        return done(plan, 'Took the cinematic clip off the picture (it stays in your account and can be put back for free)');
      }
      const list = (opts && typeof opts.media === 'function' ? opts.media(r.id) : []) || [];
      const m = list.find(x => x.mediaId === o.mediaId) || (!o.mediaId ? list[list.length - 1] : null);
      if (!m) return fail('not_found', 'There is no finished clip of this picture to put back.');
      target.video = { mediaId: m.mediaId, assetRef: m.assetRef, mime: 'video/mp4', intent: m.intent || 'image_to_video' };
      target.premium = { mediaId: m.mediaId, provider: m.provider || 'higgsfield', providerJobId: m.providerJobId || '', intent: m.intent || 'image_to_video', sourceAssetId: r.id };
      return done(plan, 'Put the cinematic clip back on the picture (no new clip was made)');
    }
    default: return fail('invalid_request', 'Unknown change.');
  }
}

// ---------------------------------------------------------------- an owner upload (PNG -- converted by the app's browser)
// The builder measures it itself: its own PNG decoder and the same assess/capabilities the studio uses. Nothing the app
// says about the picture (size, colours, transparency, where it came from) is taken.
function addUpload(direction, dataUrl, opts) {
  const c0 = creativeOf(direction); if (!c0) return fail('not_creative', 'This website is not a Creative page.');
  const o = opts || {};
  const m = typeof dataUrl === 'string' ? /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl) : null;
  if (!m) return fail('invalid_file', 'Upload a picture (it is sent as a PNG).');
  const buf = Buffer.from(m[1], 'base64');
  if (!buf.length || buf.length > UPLOAD.maxBytes) return fail('too_large', `Pictures can be up to ${Math.round(UPLOAD.maxBytes / 1048576)} MB.`);
  if (!PNG.isPng(buf)) return fail('invalid_file', 'That file is not a PNG picture.');
  const dims = PNG.dimensions(buf);
  if (!dims || dims.width < UPLOAD.minSide || dims.height < UPLOAD.minSide) return fail('too_small', 'That picture is too small to use.');
  if (dims.width > UPLOAD.maxSide || dims.height > UPLOAD.maxSide) return fail('too_large', 'That picture is too large -- please use one under 8000 pixels on its longest side.');
  let img; try { img = PNG.decode(buf); } catch (e) { img = null; }
  if (!img || !img.data) return fail('invalid_file', 'That picture could not be read.');
  const assess = ASSETS.assess(img);
  const c = copy(c0); if (live(c).length >= UPLOAD.maxAssets) return fail('limit', 'This page already holds as many pictures as it can.');
  const id = 'u' + crypto.randomBytes(6).toString('hex');
  const asset = { id, origin: 'upload', title: clean(o.title, 120) || 'Your picture', alt: clean(o.alt, 200), mime: 'image/png', assetRef: o.store(buf, 'image/png'), assess, ownerAffirmed: true };
  asset.caps = ASSETS.capabilities(asset);
  c.assets = (Array.isArray(c.assets) ? c.assets : []).concat([asset]); c.updatedAt = new Date().toISOString();
  return { ok: true, creative: c, asset, eligibleForVideo: PS.eligible(asset, { byId: new Map([[asset.id, asset]]) }).ok };
}

// ---------------------------------------------------------------- a finished premium job, attached ONCE (by its ids)
// job: premiumJobs.view(row); target: what the quote recorded { sceneId, layerId } (a clip shows where it was asked for).
function attachDelivered(direction, job, target) {
  const c0 = creativeOf(direction); if (!c0 || !job || !Array.isArray(job.delivered) || !job.delivered.length) return { changed: false };
  const c = copy(c0); const byId = byIdOf(c); const plan = c.plan; const said = []; let changed = false;
  // (each result once, ever: the ids attached before are remembered -- one the owner took off stays off)
  const once = new Set(Array.isArray(c.attachedMedia) ? c.attachedMedia : []); const mark = id => { once.add(id); c.attachedMedia = [...once].slice(-100); };
  for (const m of job.delivered) {
    if (m.kind === 'model3d' && m.threeD && m.threeD.id && m.threeD.assetRef) {
      const td = c.threeD && Array.isArray(c.threeD.assets) ? c.threeD : { assets: [], scenes: [] };
      if (once.has(m.threeD.id) || td.assets.some(x => x.id === m.threeD.id)) { if (!once.has(m.threeD.id)) { mark(m.threeD.id); changed = true; } continue; } // (already attached: a repeated read never adds it twice)
      const asset = Object.assign({}, m.threeD); delete asset.dataUrl;
      const sec = plan.scenes.some(s => s.id === m.sectionId) && !(td.scenes || []).some(x => x.sectionId === m.sectionId) ? m.sectionId : (plan.scenes.find(s => !(td.scenes || []).some(x => x.sectionId === s.id)) || {}).id;
      td.assets = td.assets.concat([asset]);
      if (sec) td.scenes = (td.scenes || []).concat([{ id: `td-${sec}`.slice(0, 40), assetId: asset.id, sectionId: sec, composition: m.composition || TD.POSE.DEMO_COMPOSITION }]);
      c.threeD = TD.normalise(td, { sectionIds: plan.scenes.map(s => s.id) }); mark(m.threeD.id); changed = true; said.push('Added the 3D model to the page');
    } else if (m.kind === 'video' && m.video && m.video.mediaId) {
      const src = byId.get(m.sourceAssetId); if (!src) continue;
      const root = rootOf(src, byId); const rec = c.assets.find(x => x.id === root.id);
      if (once.has(m.video.mediaId) || live(c).some(a => a.video && a.video.mediaId === m.video.mediaId)) { if (!once.has(m.video.mediaId)) { mark(m.video.mediaId); changed = true; } continue; } // (already attached)
      rec.video = { mediaId: m.video.mediaId, assetRef: m.video.assetRef, mime: 'video/mp4', intent: m.video.intent || 'image_to_video' };
      rec.premium = Object.assign({}, m.premium, { sourceAssetId: root.id });
      // (a clip is the whole picture: where the scene asked for it shows a cut-out of it, the scene shows the photo now)
      const s = target && target.sceneId ? sceneAt(plan, target.sceneId) : null;
      const L = s && (s.layers || []).find(x => x.id === target.layerId && x.kind === 'image');
      if (L && byId.get(L.asset) && rootOf(byId.get(L.asset), byId).id === root.id) L.asset = root.id;
      mark(m.video.mediaId); changed = true; said.push('Added the cinematic clip to the picture');
    }
  }
  if (!changed) return { changed: false };
  const v = revalidate(c, plan); if (v.ok) c.plan = v.plan;
  c.updatedAt = new Date().toISOString();
  return { changed: true, creative: c, summary: said };
}

// ---------------------------------------------------------------- AI revisions, scoped (server.js runs the director)
// scope: { sceneIds: [ids] | null (the whole page), field: 'kicker'|'heading'|'body'|null (every word field) }
function mergeWords(original, revised, scope) {
  const o = copy(original); const sc = scope || {}; const ids = Array.isArray(sc.sceneIds) && sc.sceneIds.length ? new Set(sc.sceneIds) : null;
  const fields = sc.field && ['kicker', 'heading', 'body'].includes(sc.field) ? [sc.field] : ['kicker', 'heading', 'body'];
  const from = new Map(((revised && revised.scenes) || []).map(s => [s.id, s]));
  o.scenes.forEach(s => {
    if (ids && !ids.has(s.id)) return; const r = from.get(s.id); if (!r || !r.text) return;
    s.text = s.text || {};
    fields.forEach(f => { if (typeof r.text[f] === 'string' && r.text[f].trim()) { s.text[f] = r.text[f]; if (f === 'body') { s.text.kind = r.text.kind || s.text.kind; if (r.text.cite) s.text.cite = r.text.cite; else delete s.text.cite; } } });
  });
  return o;
}
// the scoped scenes from a revision: their composition, words and how they are staged; their pictures only where the
// picture is already this page's (the ledger and the validator re-check every one)
function mergeScenes(original, revised, ids, byId) {
  const o = copy(original); const from = new Map(((revised && revised.scenes) || []).map(s => [s.id, s])); const want = new Set(ids || []);
  o.scenes = o.scenes.map(s => {
    if (!want.has(s.id) || !from.get(s.id)) return s; const r = from.get(s.id);
    const layers = Array.isArray(r.layers) && r.layers.length ? r.layers.filter(L => L.kind !== 'image' || (byId && byId.has(L.asset))) : s.layers;
    return Object.assign({}, s, { layout: r.layout || s.layout, composition: r.composition || undefined, choreo: r.choreo || s.choreo, arc: r.arc || s.arc,
      text: Object.assign({}, s.text, { kicker: r.text && r.text.kicker != null ? r.text.kicker : s.text.kicker, heading: (r.text && r.text.heading) || s.text.heading, body: r.text && r.text.body != null ? r.text.body : s.text.body }), layers });
  });
  return o;
}
const wordsOf = (plan, ids) => JSON.stringify((plan.scenes || []).filter(s => !ids || ids.includes(s.id)).map(s => [s.id, textOf(s)]));
const sceneDiff = (a, b, ids) => JSON.stringify((a.scenes || []).filter(s => ids.includes(s.id)).map(s => [s.composition || s.layout, textOf(s), (s.layers || []).map(L => [L.kind, L.asset || '', L.role])]))
  !== JSON.stringify((b.scenes || []).filter(s => ids.includes(s.id)).map(s => [s.composition || s.layout, textOf(s), (s.layers || []).map(L => [L.kind, L.asset || '', L.role])]));

module.exports = { baselineErrors, changedWordScenes, creativeOf, outline, applyEdit, addUpload, attachDelivered, mergeWords, mergeScenes, revalidate, vctx, wordsOf, sceneDiff, textOf, sceneColours, compositionsFor, LIMITS, UPLOAD };
