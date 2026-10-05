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
const LATHE = require('./three-d/lathe');
const GLB = require('./three-d/glb');
const KIN = require('./creative/kinetic');
// (a picture scene's composition, by what the picture is: an object on its own floats on the page's colour; a photograph
// is shown big, as the whole picture)
const SCENE_LAYOUTS = { free: ['shrine', 'floating', 'framed'], wide: ['image', 'cinematic', 'framed'], tall: ['image', 'framed', 'shrine'] };

const LIMITS = { kicker: 70, heading: 110, body: 520, item: 260 };
const LIMITS_SCENES_MIN = 3;
const SCENE_LIMIT = 9; // (validate2's most scenes a page holds)
const PICTURES_PER_SCENE = 3; // (the most an owner adds to one scene: a focal picture and two beside it)
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
  // the page's hero clip, as the page shows it (render2 heroVideo): its own item in its scene, apart from the pictures --
  // where it plays (inside its photo when the scene shows that photo large, else full-bleed behind the scene)
  const hero = plan.timeline && plan.timeline.continuity && plan.timeline.continuity.hero;
  const heroClip = (() => {
    if (!hero) return null; const a = byId.get(hero.asset); const base = a && a.cutoutOf ? byId.get(a.cutoutOf) : a;
    return [base, a].concat((plan.premiumMedia || []).map(m => byId.get(m.asset))).filter(Boolean).find(x => x.video && x.video.mediaId) || null;
  })();
  const clipsOf = (s, i) => {
    if (!heroClip || (hero.scene || 0) !== i) return [];
    const inFrame = (s.layers || []).some(L => L.kind === 'image' && L.asset === heroClip.id && L.box && L.box.d && L.box.d[2] * L.box.d[3] >= 4500);
    return [{ assetId: heroClip.id, mediaId: heroClip.video.mediaId, title: clean(heroClip.title, 80) || 'Cinematic clip', where: inFrame ? 'picture' : 'behind', actions: ['motion-remove'] }];
  };
  const scenes = plan.scenes.map((s, i) => {
    const pictures = (s.layers || []).filter(L => L.kind === 'image' && byId.get(L.asset)).map(L => {
      const a = byId.get(L.asset); const r = rootOf(a, byId) || a; used.add(r.id);
      const vid = (r.video && r.video.mediaId ? r : a.video && a.video.mediaId ? a : null);
      const model = modelFor(r.id);
      const clip = vid ? { mediaId: vid.video.mediaId, intent: vid.video.intent || '' } : null;
      const actions = ['replace', 'remove'];
      if (ownerUpload(a) && (can.model3d || can.model3dUsed)) actions.push(model ? 'model3d-reuse' : can.model3d ? 'model3d' : 'model3d-used');
      // (free: a 3D model shaped from the owner's own cut-out, when it is round about its axis -- three-d/lathe.js)
      if (ownerUpload(a) && !model && (a.cutoutOf || (a.assess && a.assess.transparent) || live(c).some(x => x.cutoutOf === r.id))) actions.push('model-lathe');
      if (ownerUpload(a) && can.motion) actions.push(clip ? 'motion-new' : 'motion');
      if (clip) actions.push('motion-remove');
      else if ((o.media || []).some(m => m.sourceAssetId === r.id)) actions.push('motion-restore');
      return { layerId: L.id, assetId: a.id, role: L.role, callback: !!L.callback, source: sourceOf(a, byId), clip, model: model ? { id: model.id } : null, actions };
    });
    // (the subject the page carries through this scene -- the actor -- is one of its pictures too: it can become a 3D model)
    const A = plan.actor; const inRun = A && Number.isInteger(A.from) && Number.isInteger(A.to) && i >= A.from && i <= A.to && byId.get(A.asset);
    if (inRun && !pictures.some(p => p.assetId === A.asset || (rootOf(byId.get(p.assetId), byId) || {}).id === (rootOf(byId.get(A.asset), byId) || {}).id)) {
      const a = byId.get(A.asset); const r = rootOf(a, byId) || a; const model = modelFor(r.id); const actions = [];
      if (ownerUpload(a) && (can.model3d || can.model3dUsed)) actions.push(model ? 'model3d-reuse' : can.model3d ? 'model3d' : 'model3d-used');
      if (ownerUpload(a) && !model && (a.cutoutOf || (a.assess && a.assess.transparent) || live(c).some(x => x.cutoutOf === r.id))) actions.push('model-lathe');
      pictures.push({ layerId: '', assetId: a.id, role: 'actor', carried: true, callback: false, source: sourceOf(a, byId), clip: null, model: model ? { id: model.id } : null, actions });
    }
    const models = (td.scenes || []).filter(x => x.sectionId === s.id).map(x => ({ id: x.id, modelId: x.assetId, composition: x.composition, distance: x.camera && x.camera.distance, azimuth: x.camera && x.camera.azimuth,
      actions: ['move', 'resize', 'turn', 'composition', 'remove'].concat(can.motion ? ['motion-from-3d'] : []) }));
    return {
      id: s.id, index: i, name: sceneName(s, i), composition: s.composition || s.layout || 'free', background: (s.ink && s.ink.surface) || '',
      text: textOf(s), pictures, models, clips: clipsOf(s, i),
      // (with a look: how this scene moves, and the page's set piece -- the ones this scene can carry)
      ...(plan.look ? { move: Object.assign({}, s.move || {}), signature: plan.signature && plan.signature.scene === s.id ? plan.signature.kind : '', signatures: KIN.SIGNATURES.filter(k => KIN.sigFits(k, s, i, plan.scenes.length, byId)) } : {}),
      compositions: compositionsFor(s, byId, plan.identity && plan.identity.name),
      actions: ['text'].concat(JSON.stringify(textOf(s)) !== JSON.stringify(textOf({})) ? ['text-layout'] : [], ['colour', 'composition'], plan.look ? ['scene-move', 'signature'] : [], i > 0 && plan.scenes.length > LIMITS_SCENES_MIN ? ['scene-remove'] : [], plan.scenes.length < SCENE_LIMIT ? ['picture-scene'] : [], (s.layers || []).filter(x => x.kind === 'image' && x.role !== 'texture' && x.role !== 'backdrop').length < PICTURES_PER_SCENE && !inActorRun(plan, i) ? ['picture-add'] : [], can.ai ? ['ai-text', 'ai-scene'] : []),
    };
  });
  const pictures = live(c).filter(a => !a.cutoutOf && !a.derivedFrom && a.ownerRole !== 'logo' && a.kind !== 'logo').map(a => ({ assetId: a.id, source: sourceOf(a, byId), onPage: used.has(a.id), width: (a.assess && a.assess.width) || 0, height: (a.assess && a.assess.height) || 0 }));
  const look = plan.look ? { family: plan.look.type && plan.look.type.family, devices: plan.look.devices || [], enter: plan.look.enter } : null;
  return {
    kind: 'creative', name: clean(plan.identity && plan.identity.name, 120), look, palette: sceneColours(plan), scenes, pictures,
    models: td.assets.map(m => ({ id: m.id, sourceAssetId: m.sourceAssetId, placedIn: (td.scenes || []).filter(x => x.assetId === m.id).map(x => x.sectionId) })),
    media: live(c).filter(a => a.video && a.video.mediaId).map(a => ({ assetId: a.id, mediaId: a.video.mediaId, intent: a.video.intent || '' })),
    threeDCompositions: TD.COMPOSITION_NAMES, moves: KIN.MOVES, signatures: KIN.SIGNATURES, signature: plan.signature || null, actions: ['reapply-look', 'fonts'].concat(can.ai ? ['ai-site'] : []),
    // the typefaces the page may use (fonts.js: ids, names, categories, pairings) and the ones it uses now -- null: the page's
    // own type, as it was made
    fonts: Object.assign(TYPEFACES.catalogue(), { current: TYPEFACES.sanitize(plan.fonts) }),
  };
}

// ---------------------------------------------------------------- free edits
// (a scene the page carries its subject through -- the actor run: its stage is the subject's, it takes no other picture)
const inActorRun = (plan, i) => { const A = plan.actor; return !!(A && Number.isInteger(A.from) && Number.isInteger(A.to) && i >= A.from && i <= A.to); };
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
    // a picture ADDED to the page: its own new scene, after the chosen one, the picture shown big -- every scene the page
    // already has stays exactly as it was composed. The ending stays last, and a run that carries the main picture down the
    // page is never broken (the new scene goes after it). The owner may give it a line of their own.
    case 'scene-remove': {
      // a scene taken off the page (free): never the opening; the page keeps its fewest scenes; what pointed at scenes by
      // their place (the carried subject's run, the clips' moments) moves up with them, a 3D model staged in it goes too
      if (!scene) return fail('invalid_request', 'Choose the scene first.');
      const at = plan.scenes.indexOf(scene); const n = plan.scenes.length;
      if (at === 0) return fail('not_supported', 'The opening scene stays -- change its words or picture instead.');
      if (n <= LIMITS_SCENES_MIN) return fail('limit', 'The page needs at least ' + LIMITS_SCENES_MIN + ' scenes.');
      const p = copy(plan); p.scenes.splice(at, 1);
      const ac = p.actor && Number.isInteger(p.actor.from) && Number.isInteger(p.actor.to) ? p.actor : null;
      if (ac) {
        if (at < ac.from) p.actor = Object.assign({}, ac, { from: ac.from - 1, to: ac.to - 1 });
        else if (at <= ac.to) { if (ac.to - 1 > ac.from) p.actor = Object.assign({}, ac, { to: ac.to - 1 }); else delete p.actor; }
      }
      if (Array.isArray(p.premiumArc)) p.premiumArc = p.premiumArc.filter(e => !(e && e.scene === at)).map(e => (e && Number.isInteger(e.scene) && e.scene > at ? Object.assign({}, e, { scene: e.scene - 1 }) : e));
      if (c.threeD && Array.isArray(c.threeD.scenes)) c.threeD = Object.assign({}, c.threeD, { scenes: c.threeD.scenes.filter(x => x.sectionId !== scene.id) });
      const v = check(p, { recompose: p.scenes[at] ? [p.scenes[at].id] : [] }); if (!v.ok) return fail('edit_failed', `That scene could not be removed: ${v.errors[0]}`);
      return done(v.plan, `Removed “${sceneName(scene, at)}” from the page`);
    }
    case 'picture-add': {
      // a picture put INTO this scene (free), beside its words -- a page that holds as many scenes as it can still takes
      // one: the scene is composed again around it (its own layout first, then the ones a picture scene uses)
      if (!scene) return fail('invalid_request', 'Choose the scene first.');
      const a = byId.get(String(o.assetId || '')); if (!a) return fail('not_found', 'That picture is not in this project.');
      if (a.ownerRole === 'logo' || a.kind === 'logo') return fail('invalid_request', 'The logo is shown in the header, never as a scene picture.');
      const want = rootOf(a, byId).id;
      const showsIn = (p, sid) => ((sceneAt(p, sid) || {}).layers || []).some(x => x.kind === 'image' && byId.get(x.asset) && rootOf(byId.get(x.asset), byId).id === want);
      const elsewhere = plan.scenes.find(s => showsIn(plan, s.id));
      if (elsewhere) return fail('already_on_page', `That picture is already on the page (in “${sceneName(elsewhere, plan.scenes.indexOf(elsewhere))}”). Each picture appears once -- remove it there first.`);
      if (inActorRun(plan, plan.scenes.indexOf(scene))) return fail('not_supported', 'Your product floats through this scene, so it holds no other picture. Add the picture to another scene, or as a new scene.');
      const pics = (scene.layers || []).filter(x => x.kind === 'image' && x.role !== 'texture' && x.role !== 'backdrop');
      if (pics.length >= PICTURES_PER_SCENE) return fail('limit', `This scene already shows ${PICTURES_PER_SCENE} pictures. Replace one of them instead.`);
      const free = !!(a.cutoutOf || (a.assess && a.assess.transparent)); const as = (a.assess && a.assess.aspect) || 1.5;
      let lid = 'l-' + want.replace(/[^w-]/g, '').slice(0, 30); while ((scene.layers || []).some(x => x.id === lid)) lid += 'x';
      const layer = { id: lid, kind: 'image', role: pics.some(x => x.role === 'focal') ? 'support' : 'focal', asset: a.id, box: { d: [52, 8, 44, 84], m: [0, 0, 100, 56] }, z: 3, fit: free ? 'contain' : 'cover', mask: 'none', entrance: { kind: 'rise' } };
      // first the scene as it is -- its layout, its words as big as they were -- with the picture on the side its words
      // leave free (words in the middle move to one side; on a phone the picture sits above or below them); a big ghost
      // word behind the words goes, so nothing lies across the picture. Then, only if that cannot hold, the scene is
      // composed again around the picture.
      let v = null;
      {
        const p = copy(plan); const s2 = sceneAt(p, scene.id); const t = s2.text || (s2.text = {});
        const g = (t.place && Array.isArray(t.place.gc) && t.place.gc.length === 2) ? t.place.gc : [1, 6]; const mid = (g[0] + g[1]) / 2;
        const right = mid >= 7.5; // (the words on the right: the picture on the left)
        const moved = mid > 6 && mid < 7.5; if (moved) t.place = Object.assign({}, t.place, { gc: [1, 8], align: 'left' });
        // (on a phone the words and the picture's stage stack: the words above it -- never laid over it -- and the picture
        // fills its stage)
        if (t.mplace !== 'below') t.mplace = 'above';
        const wide = !right && (moved || g[1] >= 7); const box = { d: right ? [4, 8, 44, 84] : wide ? [65, 6, 32, 88] : [54, 8, 42, 84], m: [4, 2, 92, 96] };
        const crosses = x => { const b = x.box && x.box.d; return !b || (b[0] < box.d[0] + box.d[2] && b[0] + b[2] > box.d[0] && b[1] < box.d[1] + box.d[3] && b[1] + b[3] > box.d[1]); };
        s2.layers = (s2.layers || []).filter(x => !(x.kind === 'word' && x.role === 'echo' && crosses(x))).concat([Object.assign(copy(layer), { box })]);
        const tr = check(p);
        if (tr.ok && showsIn(tr.plan, scene.id)) v = tr; else if (!tr.ok) v = tr;
      }
      const layouts = v && v.ok ? [] : [...new Set([pics.length ? scene.layout : null].concat(SCENE_LAYOUTS[free ? 'free' : as >= 1.15 ? 'wide' : 'tall']).filter(Boolean))];
      if (layouts.length) v = null;
      for (const l of layouts) {
        const p = copy(plan); const s2 = sceneAt(p, scene.id); s2.layout = l; s2.layers = (s2.layers || []).concat([copy(layer)]);
        const t = check(p, { recompose: [scene.id] });
        if (t.ok && showsIn(t.plan, scene.id)) { v = t; break; }
        if (!t.ok && !v) v = t;
      }
      if (!v || !v.ok) return fail('edit_failed', `That picture could not be added: ${(v && v.errors && v.errors[0]) || 'the scene could not show it'}`);
      if (!showsIn(v.plan, scene.id)) return fail('edit_failed', 'That picture could not be shown in this scene, so nothing was changed.');
      return done(v.plan, `Added your picture to “${sceneName(scene, plan.scenes.indexOf(scene))}”`, { sceneId: scene.id });
    }
    case 'picture-scene': {
      if (!scene) return fail('invalid_request', 'Choose where the picture goes first.');
      const a = byId.get(String(o.assetId || '')); if (!a) return fail('not_found', 'That picture is not in this project.');
      if (a.ownerRole === 'logo' || a.kind === 'logo') return fail('invalid_request', 'The logo is shown in the header, never as a scene picture.');
      const r = rootOf(a, byId); const want = r.id; const n = plan.scenes.length;
      const showsIn = (p, sid) => ((sceneAt(p, sid) || {}).layers || []).some(x => x.kind === 'image' && byId.get(x.asset) && rootOf(byId.get(x.asset), byId).id === want);
      const elsewhere = plan.scenes.find(s => showsIn(plan, s.id));
      if (elsewhere) return fail('already_on_page', `That picture is already on the page (in “${sceneName(elsewhere, plan.scenes.indexOf(elsewhere))}”). Each picture appears once -- remove it there first.`);
      if (n >= SCENE_LIMIT) return fail('limit', `This page already has ${SCENE_LIMIT} scenes, as many as it can hold. Replace a picture instead.`);
      let at = Math.min(plan.scenes.indexOf(scene) + 1, n - 1);
      const ac = plan.actor && Number.isInteger(plan.actor.from) && Number.isInteger(plan.actor.to) ? plan.actor : null;
      if (ac && at > ac.from && at <= ac.to) at = ac.to + 1 < n ? ac.to + 1 : ac.from;
      if (ac && at <= ac.from) plan.actor = Object.assign({}, ac, { from: ac.from + 1, to: ac.to + 1 });
      if (Array.isArray(plan.premiumArc)) plan.premiumArc.forEach(e => { if (e && Number.isInteger(e.scene) && e.scene >= at) e.scene += 1; });
      let sid = 'picture-' + want.replace(/[^\w-]/g, '').slice(0, 40); while (plan.scenes.some(s => s.id === sid)) sid += 'x';
      const caption = clean(o.caption, LIMITS.heading); const near = plan.scenes[Math.max(0, at - 1)];
      const free = !!(a.cutoutOf || (a.assess && a.assess.transparent)); const as = (a.assess && a.assess.aspect) || 1.5;
      const fresh = l => ({ id: sid, name: 'Picture', purpose: 'a picture the owner added', height: 'screen', background: 'base', tone: near.tone, layout: l,
        text: { kicker: '', heading: caption, body: '', kind: 'supplied', items: [] },
        layers: [{ id: 'l1', kind: 'image', role: 'focal', asset: a.id, box: { d: [4, 4, 92, 84], m: [0, 0, 100, 80] }, z: 3, fit: free ? 'contain' : 'cover', mask: 'none', entrance: { kind: 'rise' } }] });
      let v = null;
      for (const l of SCENE_LAYOUTS[free ? 'free' : as >= 1.15 ? 'wide' : 'tall']) {
        const p = copy(plan); p.scenes.splice(at, 0, fresh(l));
        const t = check(p, { recompose: [sid] });
        if (t.ok && showsIn(t.plan, sid)) { v = t; break; }
        if (!t.ok && !v) v = t;
      }
      if (!v || !v.ok) return fail('edit_failed', `That picture could not be added: ${(v && v.errors && v.errors[0]) || 'no scene could show it'}`);
      if (!showsIn(v.plan, sid)) return fail('edit_failed', 'That picture could not be shown, so nothing was changed.');
      return done(v.plan, `Added your picture as a new scene after “${sceneName(plan.scenes[at - 1] || scene, Math.max(0, at - 1))}”`, { sceneId: sid });
    }
    // A 3D MODEL FROM THE OWNER'S OWN PICTURE, FREE: the picture's cut-out, if the product is round about its upright axis (a
    // can, a bottle, a jar), is turned into a real model (three-d/lathe.js), stored, and shown in this scene turning with the
    // scroll within the side the photo shows. Nothing is asked of any provider. opts: { read(ref) -> Buffer, store(buf, mime) -> ref }
    case 'model-lathe': {
      if (!scene) return fail('invalid_request', 'Choose the scene first.');
      const a = byId.get(String(o.assetId || '')); if (!a) return fail('not_found', 'That picture is not in this project.');
      const root = rootOf(a, byId) || a; if (root.origin !== 'upload' || root.ownerPicked || root.ownerRole === 'logo') return fail('not_supported', 'A free 3D model is made only from your own uploaded picture.');
      const cut = a.cutoutOf || (a.assess && a.assess.transparent) ? a : live(c).find(x => x.cutoutOf === root.id);
      if (!cut) return fail('not_supported', 'This picture has no cut-out to shape a 3D model from.');
      const opt = opts || {}; let buf = null; const m = typeof cut.dataUrl === 'string' ? /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(cut.dataUrl) : null;
      if (m) buf = Buffer.from(m[1], 'base64'); else if (cut.assetRef && opt.read) { try { buf = opt.read(cut.assetRef); } catch (e) { buf = null; } }
      if (!buf || !PNG.isPng(buf)) return fail('not_supported', 'The cut-out could not be read.');
      let img; try { img = PNG.decode(buf); } catch (e) { img = null; } if (!img || !img.data) return fail('not_supported', 'The cut-out could not be read.');
      const made = LATHE.fromCutout(img); if (!made.ok) return fail('not_supported', `A free 3D model is made from something round about its upright axis (a can, a bottle, a jar) -- this one is ${made.reason}. It stays a picture.`);
      if (!opt.store) return fail('not_supported', 'The model could not be stored.');
      const seen = GLB.inspect(made.glb); const chk = GLB.check(seen.info, TD.LIMITS); if (!chk.ok) return fail('not_supported', 'The model came out too heavy for a page.');
      const ref = opt.store(made.glb, TD.MIME); const id = ('tdl-' + root.id.replace(/[^\w-]/g, '')).slice(0, 40);
      const td = c.threeD && Array.isArray(c.threeD.assets) ? c.threeD : { assets: [], scenes: [] }; td.scenes = Array.isArray(td.scenes) ? td.scenes : [];
      if (!td.assets.some(x => x.id === id)) td.assets = td.assets.concat([TD.cleanAsset({ id, sourceAssetId: root.id, title: clean(root.title, 120) || 'Product', bytes: seen.info.bytes, bounds: seen.info.bounds, center: seen.info.center, scale: 1, triangles: seen.info.triangles, textures: seen.info.textures, parts: seen.info.parts, animations: seen.info.animations, normalized: true, provenance: { provider: 'siteremade-lathe', processor: 'lathe (from the owner\'s cut-out)', at: new Date().toISOString() }, assetRef: ref })].filter(Boolean));
      if (td.scenes.some(x => x.sectionId === scene.id)) return fail('limit', 'That scene already shows a 3D model.');
      td.scenes = td.scenes.concat([{ id: `td-${scene.id}`.slice(0, 40), assetId: id, sectionId: scene.id, composition: 'label-turn', lighting: 'studio' }]);
      c.threeD = TD.normalise(td, { sectionIds: plan.scenes.map(s => s.id) });
      if (!c.threeD.assets.some(x => x.id === id) || !c.threeD.scenes.some(x => x.sectionId === scene.id)) return fail('limit', 'This page already carries as many 3D models as it can.');
      return done(plan, `Made a 3D model of “${clean(root.title, 60) || 'your product'}” from your picture, shown in “${sceneName(scene, plan.scenes.indexOf(scene))}” -- free`);
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
    case 'scene-move': {
      if (!scene) return fail('invalid_request', 'Choose the scene first.');
      if (!plan.look) return fail('not_supported', 'This page was made before scene motion could be chosen.');
      const mv = Object.assign({}, scene.move || {});
      for (const [k, list] of [['words', KIN.MOVES.words], ['picture', KIN.MOVES.picture]]) {
        if (!Object.prototype.hasOwnProperty.call(o, k)) continue; const v = String(o[k] || '');
        if (v && !list.includes(v)) return fail('invalid_request', 'That motion is not available.');
        if (v) mv[k] = v; else delete mv[k];
      }
      if (Object.keys(mv).length) scene.move = mv; else delete scene.move;
      const v = check(plan); if (!v.ok) return fail('edit_failed', `That motion could not be applied: ${v.errors[0]}`);
      return done(v.plan, `Changed how “${sceneName(scene, plan.scenes.indexOf(scene))}” moves`);
    }
    case 'signature': {
      if (!plan.look) return fail('not_supported', 'This page was made before set pieces.');
      const kind = String(o.kind || '');
      if (!kind || kind === 'none') { delete plan.signature; const v = check(plan); if (!v.ok) return fail('edit_failed', `That could not be applied: ${v.errors[0]}`); return done(v.plan, 'Took the set piece off the page'); }
      if (!scene) return fail('invalid_request', 'Choose the scene first.');
      if (!KIN.SIGNATURES.includes(kind)) return fail('invalid_request', 'That set piece is not available.');
      if (!KIN.sigFits(kind, scene, plan.scenes.indexOf(scene), plan.scenes.length, byId)) return fail('not_supported', 'This scene cannot carry that set piece (never the first or last scene; pour needs a short headline, type wall a cut-out, spotlight a photo).');
      plan.signature = { kind, scene: scene.id };
      const v = check(plan); if (!v.ok) return fail('edit_failed', `That set piece could not be applied: ${v.errors[0]}`);
      if (!v.plan.signature || v.plan.signature.scene !== scene.id) return fail('not_supported', 'This scene could not take that set piece, so nothing was changed.');
      return done(v.plan, `Made “${sceneName(scene, plan.scenes.indexOf(scene))}” the page’s ${kind === 'typewall' ? 'type wall' : kind}`);
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
// a box-filtered copy at most max pixels on its longest side (the cut-out works at the studio's size)
function shrink(img, max) {
  const k = Math.min(1, max / Math.max(img.width, img.height)); if (k >= 1) return img;
  const w = Math.max(1, Math.round(img.width * k)), h = Math.max(1, Math.round(img.height * k)); const out = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const x0 = Math.floor(x / k), x1 = Math.min(img.width, Math.floor((x + 1) / k)), y0 = Math.floor(y / k), y1 = Math.min(img.height, Math.floor((y + 1) / k)); const acc = [0, 0, 0, 0]; let n = 0;
    for (let yy = y0; yy < Math.max(y1, y0 + 1); yy++) for (let xx = x0; xx < Math.max(x1, x0 + 1); xx++) { const i = (yy * img.width + xx) * 4; acc[0] += img.data[i]; acc[1] += img.data[i + 1]; acc[2] += img.data[i + 2]; acc[3] += img.data[i + 3]; n++; }
    const o = (y * w + x) * 4; for (let c2 = 0; c2 < 4; c2++) out[o + c2] = Math.round(acc[c2] / n);
  }
  return { width: w, height: h, data: out };
}
// THE OWNER'S OWN 3D MODEL (a .glb they have), free: checked as every model is (lib/three-d/glb.js against the page's
// limits -- size, triangles, textures, nothing outside itself), stored, and shown in the chosen scene turning as the page
// scrolls, in the place of the scene's main picture (which stays its stand-in: shown until the model draws, and wherever it
// cannot). A model already shown in that scene gives its place to this one (it stays in the project, to show elsewhere).
//   opts: { sceneId, title, store(buf, mime) -> ref } -> { ok, creative, modelId, summary } | fail
function addModelUpload(direction, dataUrl, opts) {
  const c0 = creativeOf(direction); if (!c0) return fail('not_creative', 'This website is not a Creative page.');
  const o = opts || {};
  const m = typeof dataUrl === 'string' ? /^data:[\w.+/-]*;base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl) : null;
  if (!m) return fail('invalid_file', 'Upload a 3D model as a .glb file.');
  const buf = Buffer.from(m[1], 'base64');
  if (!buf.length || buf.length > TD.LIMITS.modelBytes) return fail('too_large', `A 3D model can be up to ${Math.round(TD.LIMITS.modelBytes / 1048576)} MB.`);
  if (buf.length < 12 || buf.toString('latin1', 0, 4) !== 'glTF') return fail('invalid_file', 'That file is not a .glb 3D model.');
  let seen; try { seen = GLB.inspect(buf); } catch (e) { seen = null; }
  if (!seen || !seen.ok) return fail('invalid_file', `That 3D model could not be read${seen && seen.reason ? ` (${seen.reason})` : ''}.`);
  const chk = GLB.check(seen.info, TD.LIMITS); if (!chk.ok) return fail('not_supported', `That 3D model can't be shown on a page: ${chk.reason}.`);
  if (typeof o.store !== 'function') return fail('not_supported', 'The model could not be stored.');
  const c = copy(c0); const plan = c.plan; const scene = sceneAt(plan, String(o.sceneId || '')); if (!scene) return fail('not_found', 'Choose the scene first.');
  const byId = byIdOf(c);
  const main = (scene.layers || []).filter(x => x.kind === 'image' && byId.get(x.asset) && x.role !== 'texture' && x.role !== 'backdrop').sort((x, y) => (y.role === 'focal') - (x.role === 'focal'))[0];
  const src = main ? (rootOf(byId.get(main.asset), byId) || byId.get(main.asset)) : null;
  const td = c.threeD && Array.isArray(c.threeD.assets) ? copy(c.threeD) : { assets: [], scenes: [] }; td.scenes = Array.isArray(td.scenes) ? td.scenes : [];
  if (td.assets.length >= TD.LIMITS.assets) return fail('limit', `A page can carry at most ${TD.LIMITS.assets} 3D models. Take one off first.`);
  const id = 'tdu-' + crypto.randomBytes(5).toString('hex'); const title = clean(o.title, 120) || 'Your 3D model';
  const asset = TD.cleanAsset({ id, sourceAssetId: src ? src.id : '', title, bytes: seen.info.bytes, bounds: seen.info.bounds, center: seen.info.center, scale: 1, triangles: seen.info.triangles, textures: seen.info.textures, parts: seen.info.parts, animations: seen.info.animations, normalized: false, provenance: { provider: 'owner', processor: 'uploaded by the owner', at: new Date().toISOString() }, assetRef: o.store(buf, TD.MIME) });
  if (!asset) return fail('not_supported', 'That 3D model is too heavy for a page.');
  td.assets = td.assets.concat([asset]);
  td.scenes = td.scenes.filter(x => x.sectionId !== scene.id).concat([{ id: `td-${scene.id}`.slice(0, 40), assetId: id, sectionId: scene.id, composition: 'scroll-rotate', lighting: 'studio' }]);
  c.threeD = TD.normalise(td, { sectionIds: plan.scenes.map(s => s.id) });
  if (!c.threeD.assets.some(x => x.id === id) || !c.threeD.scenes.some(x => x.sectionId === scene.id && x.assetId === id)) return fail('limit', 'This page already carries as many 3D models as it can.');
  c.updatedAt = new Date().toISOString();
  return { ok: true, creative: c, modelId: id, summary: `Added your 3D model to “${sceneName(scene, plan.scenes.indexOf(scene))}” -- it turns as the page scrolls. Free.` };
}
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
  const add = [asset];
  if (!assess.transparent && assess.background && assess.background.uniformity >= 0.8) {
    try {
      const small = shrink(img, 1100); const cut = ASSETS.cutout(small);
      if (cut.clean && cut.img) {
        const cropped = ASSETS.crop(cut.img, cut.bbox, 0.02); const png = PNG.encode(cropped);
        const derived = { id: 'c-' + id, origin: 'derived', cutout: true, cutoutOf: id, title: asset.title, alt: asset.alt, mime: 'image/png', assetRef: o.store(png, 'image/png'), assess: ASSETS.assess(cropped), cutVersion: 2 };
        derived.caps = ASSETS.capabilities(derived); add.push(derived);
      }
    } catch (e) { /* kept as a framed picture */ }
  }
  c.assets = (Array.isArray(c.assets) ? c.assets : []).concat(add); c.updatedAt = new Date().toISOString();
  return { ok: true, creative: c, asset, cutout: add[1] || null, eligibleForVideo: PS.eligible(asset, { byId: new Map([[asset.id, asset]]) }).ok };
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

module.exports = { baselineErrors, changedWordScenes, creativeOf, outline, applyEdit, addUpload, addModelUpload, attachDelivered, mergeWords, mergeScenes, revalidate, vctx, wordsOf, sceneDiff, textOf, sceneColours, compositionsFor, LIMITS, UPLOAD };
