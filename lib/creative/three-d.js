'use strict';
// CREATIVE — TRUE 3D (shared: server validation, studio bundle, export, tests).
//
// A Creative page may carry a real 3D model of the owner's own subject: a GLB made from one of their UPLOADS (an
// image-to-3D provider, then Blender -- lib/three-d/), drawn by ONE fixed browser engine (vendor/three-d/sr3d.min.js:
// three.js, fetched only by a page that has a 3D scene, from the page's own files) and moved by scroll, pointer or click.
// This file is the whole model of it. Nothing in it is code: every field is an id, an enum or a bounded number,
// re-checked on every save, reopen and export.
//
//   creative.threeD = {
//     v: 1,
//     assets: [{ id, sourceAssetId, format: 'glb', assetRef | dataUrl, bytes, bounds, center, scale, triangles,
//                textures, animations, parts, normalized, provenance }]        the stored, normalised models
//     scenes: [{ id, assetId, sectionId, composition, interaction, camera, lighting, background, turns, phone }]
//   }
//   plan.premium3D = { planned, reason, sourceAssetId, composition }           the planner's INTENT only (intent())
//
// How it relates to the rest:
//   - the complete DOM page is always rendered underneath. A 3D stage sits where the subject's own picture is, and that
//     picture is hidden only once the model has been drawn; reduced motion, no WebGL, a phone the plan keeps flat, a page
//     opened from disk, a model that will not load or a slow start all leave the picture -- the page is never blank
//   - a page without a 3D scene carries none of this: no markup, no loader, no engine file
//   - the spatial tier (spatial.js) is a different thing: a depth layer for the timeline's pictures, with its own small
//     GLB reader. Models here are not offered to it, and its models are not drawn here (see CREATIVE_3D.md)
const POSE = require('./three-d-pose');

// THE BUDGET. 3D can ruin a page; none of these is a suggestion.
//   inputBytes        the largest file a provider may hand to Blender (before normalisation)
//   modelBytes        the largest normalised GLB that may be stored and shipped (target: what Blender aims for)
//   triangles         the most triangles a shipped model may have (target: above it Blender decimates, where safe)
//   textureSize       the longest edge of any texture (Blender scales larger ones down)
//   phone             above these a phone gets the picture, not the model; below, a lighter draw (dpr, no antialias)
//   loadTimeoutMs     a model that has not drawn by then is abandoned: the picture stays
const LIMITS = {
  assets: 2, scenes: 4, parts: 24, animations: 8, textures: 12,
  inputBytes: 64 * 1024 * 1024,
  modelBytes: 8 * 1024 * 1024, modelBytesTarget: 4 * 1024 * 1024,
  triangles: 200000, trianglesTarget: 100000,
  textureSize: 2048,
  dpr: 2,
  phone: { width: 720, modelBytes: 4 * 1024 * 1024, triangles: 100000, dpr: 1.5 },
  loadTimeoutMs: 20000,
};
const ASSET_ID = /^td[\w-]{1,38}$/;
const ID = /^[\w-]{1,60}$/;
const REF = /^[a-f0-9]{64}$/;
const DATA_URL = /^data:model\/gltf-binary;base64,([A-Za-z0-9+/=]+)$/;
const MIME = 'model/gltf-binary';
// where a page finds the engine: the studio's preview on SiteRemade's own server; an exported website in its OWN assets/
// folder (lib/export-compiler.js copies it there) -- a customer's site never asks SiteRemade, a CDN or a provider for it
const RUNTIME = { preview: '/vendor/three-d/sr3d.min.js', export: 'assets/sr3d.min.js' };

const s = (v, n) => (typeof v === 'string' ? v : v == null ? '' : String(v)).replace(/[\u0000-\u001f\u007f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
const num = (v, lo, hi, d) => (typeof v === 'number' && isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d);
const int = (v, lo, hi, d) => Math.round(num(v, lo, hi, d));
const r3 = v => Math.round(v * 1000) / 1000;
const oneOf = (v, list, d) => (list.includes(v) ? v : d);
const vec3 = (v, lo, hi) => (Array.isArray(v) && v.length === 3 && v.every(x => typeof x === 'number' && isFinite(x)) ? v.map(x => r3(Math.max(lo, Math.min(hi, x)))) : null);
const names = (list, max) => (Array.isArray(list) ? list : []).slice(0, max).map(x => s(x, 60)).filter(Boolean);

// ---------------------------------------------------------------- the stored model
// -> the record, or null: a model with no bytes, an unknown format, or one over the budget is not kept (never clamped
// into looking acceptable -- its numbers are facts about the file)
function cleanAsset(raw) {
  if (!raw || typeof raw !== 'object' || !ASSET_ID.test(raw.id || '')) return null;
  if (raw.format && raw.format !== 'glb') return null;
  const bytes = typeof raw.bytes === 'number' && isFinite(raw.bytes) ? Math.round(raw.bytes) : 0;
  const triangles = typeof raw.triangles === 'number' && isFinite(raw.triangles) ? Math.round(raw.triangles) : 0;
  if (bytes < 0 || bytes > LIMITS.modelBytes || triangles < 0 || triangles > LIMITS.triangles) return null;
  const min = raw.bounds && vec3(raw.bounds.min, -1e4, 1e4); const max = raw.bounds && vec3(raw.bounds.max, -1e4, 1e4);
  const tx = raw.textures && typeof raw.textures === 'object' ? raw.textures : {};
  if (num(tx.maxSize, 0, 1e6, 0) > LIMITS.textureSize) return null;
  const pv = raw.provenance && typeof raw.provenance === 'object' ? raw.provenance : {};
  const out = {
    id: raw.id, format: 'glb', mime: MIME, sourceAssetId: ID.test(raw.sourceAssetId || '') ? raw.sourceAssetId : '', title: s(raw.title, 120), bytes,
    bounds: min && max && min.every((v, i) => v <= max[i]) ? { min, max } : null, center: vec3(raw.center, -1e4, 1e4) || [0, 0, 0], scale: Math.round(num(raw.scale, 1e-6, 1e6, 1) * 1e6) / 1e6,
    triangles, textures: { count: int(tx.count, 0, LIMITS.textures, 0), maxSize: int(tx.maxSize, 0, LIMITS.textureSize, 0) },
    animations: names(raw.animations, LIMITS.animations), parts: names(raw.parts, LIMITS.parts), normalized: raw.normalized === true,
    // where it came from, in words only: never a provider URL, a signed link, a path or a key
    provenance: { provider: s(pv.provider, 30).replace(/[^\w-]/g, ''), providerAssetId: s(pv.providerAssetId, 120).replace(/[^\w.:-]/g, ''), processor: s(pv.processor, 60), requestId: s(pv.requestId, 80).replace(/[^\w.:-]/g, ''), at: s(pv.at, 40) },
  };
  if (typeof raw.dataUrl === 'string' && raw.dataUrl) {
    const m = DATA_URL.exec(raw.dataUrl);
    if (!m || Math.floor(m[1].length * 0.75) > LIMITS.modelBytes) return null;
    out.dataUrl = raw.dataUrl;
  } else if (typeof raw.assetRef === 'string' && REF.test(raw.assetRef)) out.assetRef = raw.assetRef;
  else return null;
  return out;
}

// ---------------------------------------------------------------- a scene
function cleanCamera(raw, preset) {
  const c = raw && typeof raw === 'object' ? raw : {}; const out = {};
  Object.keys(POSE.CAMERA).forEach(k => { out[k] = r3(num(c[k], POSE.CAMERA[k][0], POSE.CAMERA[k][1], preset[k])); });
  return out;
}
// ctx: { assetIds: Set of this block's model ids, sectionIds: Set of the plan's scene ids | null (not known: kept as saved) }
function cleanScene(raw, i, ctx) {
  if (!raw || typeof raw !== 'object' || !ctx.assetIds.has(raw.assetId)) return null;
  const sectionId = ID.test(raw.sectionId || '') ? raw.sectionId : '';
  if (!sectionId || (ctx.sectionIds && !ctx.sectionIds.has(sectionId))) return null;
  const composition = oneOf(raw.composition, POSE.COMPOSITION_NAMES, POSE.DEMO_COMPOSITION); const C = POSE.COMPOSITIONS[composition];
  return {
    id: ID.test(raw.id || '') ? raw.id.slice(0, 40) : `td-scene-${i + 1}`, assetId: raw.assetId, sectionId, composition,
    interaction: oneOf(raw.interaction, POSE.INTERACTIONS, C.interaction), camera: cleanCamera(raw.camera, C.camera),
    lighting: oneOf(raw.lighting, POSE.LIGHTING, 'studio'), background: oneOf(raw.background, POSE.BACKGROUNDS, 'transparent'),
    turns: r3(num(raw.turns, POSE.TURNS[0], POSE.TURNS[1], C.turns)), phone: oneOf(raw.phone, POSE.PHONE, 'lite'),
  };
}

// The block as it may be saved, reopened, previewed and exported. ctx: { sectionIds: [the plan's scene ids] | null }
// -> the block, or null when there is nothing 3D in it (the project then saves exactly as it did before 3D existed)
function normalise(raw, ctx) {
  if (!raw || typeof raw !== 'object') return null;
  const c = ctx || {}; const seen = new Set();
  const assets = (Array.isArray(raw.assets) ? raw.assets : []).map(cleanAsset).filter(a => a && !seen.has(a.id) && seen.add(a.id)).slice(0, LIMITS.assets);
  if (!assets.length) return null;
  const sctx = { assetIds: new Set(assets.map(a => a.id)), sectionIds: Array.isArray(c.sectionIds) ? new Set(c.sectionIds) : null };
  const taken = new Set(); const ids = new Set();
  // (one stage per section; several scenes may show the same model -- it is one file)
  const scenes = (Array.isArray(raw.scenes) ? raw.scenes : []).map((x, i) => cleanScene(x, i, sctx)).filter(x => x && !taken.has(x.sectionId) && taken.add(x.sectionId) && !ids.has(x.id) && ids.add(x.id)).slice(0, LIMITS.scenes);
  return { v: 1, assets, scenes };
}

// ---------------------------------------------------------------- the planner's intent
// 3D is never the default. A page MAY be planned with it only when every one of these holds; otherwise the plan says why
// not, in one word, and nothing is bought:
//   - the generation's mode explicitly allows 3D, and its quote and the owner's credits cover it (ctx.allow -- the
//     server's decision, made before anything is planned; ctx.blocked names why not)
//   - the source is the owner's own UPLOAD (never a picture found on the web, whatever its licence says), large enough,
//     showing one distinguishable subject
//   - the subject is an object -- a product, a thing, a character -- not a place, a crowd, a texture or a logo
const REASONS = {
  planned: 'A 3D model of the subject is planned from your upload.',
  mode_off: '3D is not part of this generation.',
  not_priced: '3D is not available yet.',
  provider_unavailable: '3D is unavailable on this server right now.',
  insufficient_credits: 'Not enough credits for a 3D model.',
  needs_upload: '3D uses your own uploaded picture of the subject: upload one to include it.',
  source_not_eligible: 'The uploaded picture is not suitable for a 3D model.',
  subject_not_suitable: 'This subject would not gain from a 3D model.',
};
const SOURCE = { minShort: 512, minSubject: 0.06 };
const SOURCE_MESSAGE = {
  missing: 'the picture is not on the page', not_upload: 'found on the web -- 3D uses uploaded pictures only', picked_web: 'a web picture you picked -- 3D uses uploaded pictures only',
  logo: 'a logo is not turned into a 3D model', too_small: 'the upload is too small for a 3D model', not_an_object: 'the upload shows a scene, not one object',
};
const no = code => ({ ok: false, code, reason: SOURCE_MESSAGE[code] });
// whether one picture may become a 3D model. ctx: { byId } (a cut-out is judged by the photo it came from)
function sourceEligible(asset, ctx) {
  const c = ctx || {}; const a = asset;
  if (!a || a.removed || a.failed) return no('missing');
  if (a.cutoutOf) { const p = c.byId && c.byId.get(a.cutoutOf); return p ? sourceEligible(p, c) : no('missing'); }
  if (a.ownerPicked) return no('picked_web');
  // (an upload carries no web address: a picture that does came from the web, whatever it is labelled)
  if (a.origin !== 'upload' || a.pageUrl || a.sourceUrl) return no('not_upload');
  if (a.ownerRole === 'logo' || a.kind === 'logo') return no('logo');
  const A = a.assess || {};
  if (Math.min(A.width || 0, A.height || 0) < SOURCE.minShort) return no('too_small');
  const cu = a.curation || {};
  if (a.ownerRole === 'background' || cu.role === 'environment' || cu.framing === 'scene' || cu.framing === 'texture') return no('not_an_object');
  const b = Array.isArray(A.subject) && A.subject.length === 4 ? A.subject : null;
  if (b && (b[2] - b[0]) * (b[3] - b[1]) < SOURCE.minSubject) return no('not_an_object');
  return { ok: true, code: 'ok', reason: 'your own upload, showing one subject' };
}
// ctx: { allow, blocked (a REASONS key, when not allowed), assets, mainAsset, concept: { product, character, place,
//        editorial } (spatial.js conceptOf), kind (the understanding's kind), request: the plan's own premium3D }
// -> { planned: true, reason: 'planned', sourceAssetId, composition } | { planned: false, reason }
function intent(ctx) {
  const c = ctx || {}; const off = reason => ({ planned: false, reason });
  if (!c.allow) return off(REASONS[c.blocked] ? c.blocked : 'mode_off');
  const assets = (c.assets || []).filter(a => a && !a.removed && !a.failed); const byId = new Map(assets.map(a => [a.id, a]));
  const req = c.request && typeof c.request === 'object' ? c.request : {};
  const uploads = assets.filter(a => a.origin === 'upload' && !a.cutoutOf && !a.ownerPicked);
  if (!uploads.length) return off('needs_upload');
  // the picture the page is built around first, then the one the plan named, then the other uploads
  const order = [c.mainAsset, req.sourceAssetId].concat(uploads.map(a => a.id)).filter((id, i, all) => id && byId.has(id) && all.indexOf(id) === i);
  const pick = order.map(id => { const a = byId.get(id); return a.cutoutOf && byId.get(a.cutoutOf) ? byId.get(a.cutoutOf) : a; }).find(a => sourceEligible(a, { byId }).ok);
  if (!pick) return off('source_not_eligible');
  const k = c.concept || {};
  if (c.kind === 'personal' || k.editorial || (k.place && !k.product && !k.character)) return off('subject_not_suitable');
  return { planned: true, reason: 'planned', sourceAssetId: pick.id, composition: oneOf(req.composition, POSE.COMPOSITION_NAMES, POSE.DEMO_COMPOSITION) };
}
// a saved plan's intent, re-checked as data (never re-decided: a saved page keeps what it was planned with)
function cleanIntent(raw, byId) {
  if (!raw || typeof raw !== 'object') return null;
  if (raw.planned !== true) return REASONS[raw.reason] ? { planned: false, reason: raw.reason } : null;
  if (!byId || !byId.has(raw.sourceAssetId)) return null;
  return { planned: true, reason: 'planned', sourceAssetId: raw.sourceAssetId, composition: oneOf(raw.composition, POSE.COMPOSITION_NAMES, POSE.DEMO_COMPOSITION) };
}

// ---------------------------------------------------------------- the page
// where a stage sits when its section does not show the source picture itself: [x, y, w, h] in percent of the scene's stage
const DEFAULT_BOX = { d: [50, 10, 44, 80], m: [8, 6, 84, 46] };
// What a page with 3D scenes adds, and only such a page.
//   block: the normalised threeD block; ctx: { scenes: the plan's scenes, byId: the page's pictures, src(asset) -> url (a
//   picture or a model: the same resolver the page uses), runtime: the engine's url (a file of the page itself) }
// -> null (nothing to draw) | { stages: Map(scene index -> html), json, css: CSS, loader: LOADER }
function forPage(block, ctx) {
  const c = ctx || {}; const b = block && Array.isArray(block.scenes) && Array.isArray(block.assets) ? block : null;
  if (!b || !b.scenes.length || !c.runtime) return null;
  const src = a => (a && c.src ? c.src(a) : '') || ''; const byId = c.byId || new Map(); const assets = new Map(b.assets.map(a => [a.id, a]));
  const stages = new Map(); const data = [];
  b.scenes.forEach(sc => {
    const a = assets.get(sc.assetId); const si = (c.scenes || []).findIndex(x => x && x.id === sc.sectionId);
    const model = a ? src(a) : ''; if (!a || si < 0 || !model || stages.has(si)) return;
    // the subject's own pictures (the upload, its cut-out, a copy of it): whichever of them this section shows is the
    // stage's place and its fallback
    const posters = [...byId.values()].filter(p => p && a.sourceAssetId && (p.id === a.sourceAssetId || p.cutoutOf === a.sourceAssetId || p.derivedFrom === a.sourceAssetId)).map(p => p.id);
    const L = ((c.scenes[si].layers || []).filter(x => x.kind === 'image' && posters.includes(x.asset)).sort((x, y) => (y.role === 'focal') - (x.role === 'focal'))[0]) || null;
    const box = L && L.box ? { d: L.box.d, m: L.box.m } : DEFAULT_BOX; const z = L ? (L.z || 0) + 1 : 6;
    const own = !L && byId.get(a.sourceAssetId) && src(byId.get(a.sourceAssetId)) ? `<img class="td-poster" src="${attr(src(byId.get(a.sourceAssetId)))}" alt="" decoding="async">` : '';
    stages.set(si, `<div class="td-stage" data-td="${attr(sc.id)}" data-td-comp="${sc.composition}" data-td-bg="${sc.background}" aria-hidden="true" style="--x:${box.d[0]};--y:${box.d[1]};--w:${box.d[2]};--h:${box.d[3]};--mx:${box.m[0]};--my:${box.m[1]};--mw:${box.m[2]};--mh:${box.m[3]};--z:${z}">${own}</div>`);
    data.push({ id: sc.id, model, bytes: a.bytes, triangles: a.triangles, bounds: a.bounds, composition: sc.composition, interaction: sc.interaction, camera: sc.camera, turns: sc.turns, lighting: sc.lighting, background: sc.background, phone: sc.phone, posters });
  });
  if (!data.length) return null;
  const json = JSON.stringify({ v: 1, runtime: c.runtime, limits: { bytes: LIMITS.modelBytes, triangles: LIMITS.triangles, dpr: LIMITS.dpr, phone: LIMITS.phone, timeoutMs: LIMITS.loadTimeoutMs }, scenes: data }).replace(/</g, '\\u003c');
  return { stages, json, css: CSS, loader: LOADER };
}
const attr = v => String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// the stage's page rules: it sits exactly where the subject's picture sits (the same box, per breakpoint), never wider
// than its scene; the picture it replaces is hidden only while the model is on (.td-on, set by the loader)
const CSS = `
.td-stage{position:absolute;left:calc(var(--x)*1%);top:calc(var(--y)*1%);width:calc(var(--w)*1%);height:calc(var(--h)*1%);z-index:var(--z);max-width:100%;overflow:hidden;pointer-events:none;contain:layout paint}
.td-stage[data-td-bg="surface"]{background:var(--s-surface,var(--bg));border-radius:18px}
.td-canvas{position:absolute;inset:0;width:100%;height:100%;display:block;opacity:0;transition:opacity .5s ease;touch-action:pan-y;pointer-events:none}
.td-stage.td-on .td-canvas{opacity:1}.td-stage[data-td-press] .td-canvas{pointer-events:auto;cursor:pointer}
.td-poster{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;display:block}
.td-stage.td-on .td-poster{visibility:hidden}.sc.td-live .td-src{visibility:hidden!important}
.td-away{animation:td-away .25s ease forwards}@keyframes td-away{to{opacity:0;visibility:hidden}}
@media (max-width:720px){.td-stage{left:calc(var(--mx)*1%);top:calc(var(--my)*1%);width:calc(var(--mw)*1%);height:calc(var(--mh)*1%)}}
@media print{.td-canvas{display:none}.td-stage.td-on .td-poster{visibility:visible}.sc.td-live .td-src{visibility:visible!important}.td-away{animation:none}}
`;

// ---------------------------------------------------------------- the loader
// The few lines a page with a 3D scene carries inline. It decides whether 3D may start at all (reduced motion, WebGL, the
// phone policy, a page opened from disk, a data-saving connection), fetches the engine only when a stage comes near the
// screen -- after the page's own content, never blocking it -- hands the engine each stage, and feeds it the scroll.
// Every way it can fail leaves the picture. window.__sr3d says what happened, for the studio and the tests.
/* eslint-disable */
function threeDLoader() {
  var d = document, html = d.documentElement, W = window, C = null;
  try { C = JSON.parse(d.getElementById('cr-3d').textContent); } catch (e) { return; }
  if (!C || !C.scenes || !C.scenes.length || !C.runtime) return;
  var ST = W.__sr3d = { state: 'idle', why: '', engine: 'none', stages: [] };
  var stages = [], engineWait = null, io = null, ticking = false, started = false;
  function reduced() { return html.getAttribute('data-motion') === 'reduced' || !!(W.matchMedia && W.matchMedia('(prefers-reduced-motion: reduce)').matches); }
  function phone() { return (W.innerWidth || 1024) <= C.limits.phone.width; }
  function webgl() {
    try {
      var c = d.createElement('canvas'), o = { failIfMajorPerformanceCaveat: true }, g = c.getContext('webgl2', o) || c.getContext('webgl', o);
      if (!g) return false; var x = g.getExtension && g.getExtension('WEBGL_lose_context'); if (x) x.loseContext(); return true;
    } catch (e) { return false; }
  }
  // why the whole page stays flat, if it does ('' when 3D may start)
  function blocked() {
    if (reduced()) return 'reduced motion';
    if (String(W.location && W.location.protocol) === 'file:') return 'opened from disk';
    var n = W.navigator || {};
    if (n.connection && n.connection.saveData) return 'data saver';
    if (!webgl()) return 'no hardware WebGL';
    return '';
  }
  // why one stage stays flat on this device
  function flat(s) {
    if (!phone()) return '';
    if (s.cfg.phone === 'poster') return 'phones get the picture';
    if (s.cfg.bytes > C.limits.phone.modelBytes || s.cfg.triangles > C.limits.phone.triangles) return 'too heavy for a phone';
    if (((W.navigator || {}).deviceMemory || 8) < 2) return 'low memory';
    return '';
  }
  function poster(s, why) {
    if (s.timer) { clearTimeout(s.timer); s.timer = 0; }
    if (s.handle) { try { s.handle.destroy(); } catch (e) {} s.handle = null; }
    s.el.classList.remove('td-on'); s.el.removeAttribute('data-td-press');
    if (s.sec) s.sec.classList.remove('td-live');
    s.st.state = 'poster'; s.st.why = why || s.st.why; away(s, false);
  }
  // the same subject's travelling pictures (the page carries its picture from scene to scene): they rest while the model
  // is the subject on screen, and come back the moment it is not
  function away(s, on) {
    if (on === s.away) return; s.away = on; s.st.away = on;
    s.carry.forEach(function (el) { el.classList[on ? 'add' : 'remove']('td-away'); });
  }
  function all(why) { stages.forEach(function (s) { poster(s, why); }); ST.state = 'poster'; ST.why = why; }
  // the engine: one script, a file of the page itself, asked for once
  function engine(cb) {
    if (W.SiteRemade3D) { cb(null); return; }
    if (engineWait) { engineWait.push(cb); return; }
    engineWait = [cb]; ST.engine = 'loading';
    var el = d.createElement('script'); el.src = C.runtime; el.async = true;
    var done = function (err) { var q = engineWait; engineWait = null; ST.engine = err ? 'failed' : 'ready'; q.forEach(function (f) { f(err); }); };
    el.onload = function () { done(W.SiteRemade3D ? null : 'engine missing'); };
    el.onerror = function () { done('engine failed to load'); };
    d.head.appendChild(el);
  }
  function mount(s) {
    if (s.handle || s.st.state === 'loading' || s.st.state === 'on') return;
    var why = flat(s); if (why) { poster(s, why); return; }
    if (!s.el.offsetWidth || !s.el.offsetHeight) { poster(s, 'stage hidden'); return; }
    s.st.state = 'loading'; ST.state = 'on';
    engine(function (err) {
      if (err) { all(err); return; }
      if (s.st.state !== 'loading') return;
      s.timer = setTimeout(function () { poster(s, 'timeout'); }, C.limits.timeoutMs);
      try {
        s.handle = W.SiteRemade3D.mount(s.el, { model: s.cfg.model, bounds: s.cfg.bounds, composition: s.cfg.composition, interaction: s.cfg.interaction, camera: s.cfg.camera, turns: s.cfg.turns, lighting: s.cfg.lighting, tier: phone() ? 'lite' : 'full', dpr: phone() ? C.limits.phone.dpr : C.limits.dpr, maxBytes: C.limits.bytes, maxTriangles: C.limits.triangles, anchor: s.pin ? 0 : 0.5 }, {
          ready: function (info) {
            if (s.timer) { clearTimeout(s.timer); s.timer = 0; }
            s.st.state = 'on'; s.st.info = info || null; s.el.classList.add('td-on');
            if (s.cfg.interaction === 'click-rotate') s.el.setAttribute('data-td-press', '');
            if (s.sec && s.src.length) s.sec.classList.add('td-live');
            measure(); frame();
          },
          error: function (why) { poster(s, 'model: ' + (why || 'failed')); },
          frame: function (v) { s.st.pose = v; s.st.frames = (s.st.frames || 0) + 1; },
        });
        // (told where the scroll is before its first frame: the model appears already turned to it, never swinging in)
        if (s.handle) { measure(); frame(); }
      } catch (e) { poster(s, 'start: ' + (e && e.message || e)); }
    });
  }
  // geometry is read on load, on resize and when the page's height changes -- never while scrolling
  function measure() {
    var y = W.scrollY || W.pageYOffset || 0;
    stages.forEach(function (s) { var r = (s.sec || s.el).getBoundingClientRect(); s.top = r.top + y; s.h = r.height || 1; });
  }
  function progress(s, y, vh) {
    var top = s.top - y;
    if (s.pin) { var span = s.h - vh; return span > 0 ? Math.max(0, Math.min(1, -top / span)) : 0; }
    return Math.max(0, Math.min(1, (vh - top) / (vh + s.h)));
  }
  function frame() {
    ticking = false; var y = W.scrollY || W.pageYOffset || 0, vh = W.innerHeight || 1;
    stages.forEach(function (s) {
      if (s.handle) { s.st.p = progress(s, y, vh); s.handle.setProgress(s.st.p); }
      // (how much of the screen the model's scene fills: past a fifth, the model is the subject)
      var top = s.top - y; if (s.carry.length) away(s, s.st.state === 'on' && (Math.min(vh, top + s.h) - Math.max(0, top)) / vh > 0.2);
    });
  }
  function onScroll() { if (!ticking) { ticking = true; (W.requestAnimationFrame || setTimeout)(frame); } }
  function start() {
    var why = blocked(); if (why) { all(why); return; }
    if (started) { stages.forEach(function (s) { if (s.near) mount(s); }); return; }
    started = true; ST.state = 'waiting'; measure();
    W.addEventListener('scroll', onScroll, { passive: true });
    W.addEventListener('resize', function () { measure(); onScroll(); });
    W.addEventListener('load', function () { measure(); onScroll(); });
    W.addEventListener('pagehide', function () { all('page hidden'); });
    W.addEventListener('pageshow', function (e) { if (e && e.persisted) start(); });
    if (W.ResizeObserver) { try { new W.ResizeObserver(function () { measure(); onScroll(); }).observe(d.body); } catch (e) {} }
    if ('IntersectionObserver' in W) {
      // (a stage is prepared a screen before it arrives, and rests -- no frames drawn -- once it has left)
      io = new W.IntersectionObserver(function (es) {
        es.forEach(function (e) {
          var s = stages.filter(function (x) { return x.el === e.target; })[0]; if (!s) return;
          s.near = e.isIntersecting; if (s.near) mount(s);
          if (s.handle) s.handle.setVisible(s.near);
        });
      }, { rootMargin: '100% 0px 100% 0px', threshold: 0 });
      stages.forEach(function (s) { io.observe(s.el); });
    } else stages.forEach(function (s) { s.near = true; mount(s); });
  }
  C.scenes.forEach(function (cfg) {
    var el = null, list = d.querySelectorAll('.td-stage');
    for (var i = 0; i < list.length; i++) if (list[i].getAttribute('data-td') === cfg.id) el = list[i];
    if (!el) return;
    var sec = el.closest ? el.closest('.sc') : null, src = [];
    // the pictures this stage stands in for: hidden only while the model is on
    if (sec) [].forEach.call(sec.querySelectorAll('img[data-asset]'), function (im) {
      if ((cfg.posters || []).indexOf(im.getAttribute('data-asset')) < 0) return;
      var ly = im.closest('.ly'); if (ly) { ly.classList.add('td-src'); src.push(ly); }
    });
    // ...and the same pictures where the page carries them between scenes (an actor, a seam's carrier)
    var carry = [], urls = [];
    [].forEach.call(d.querySelectorAll('img[data-asset]'), function (im) {
      if ((cfg.posters || []).indexOf(im.getAttribute('data-asset')) < 0) return;
      var u = im.getAttribute('src'), ca = im.closest('.ca'); if (u && urls.indexOf(u) < 0) urls.push(u); if (ca && carry.indexOf(ca) < 0) carry.push(ca);
    });
    [].forEach.call(d.querySelectorAll('.cs-carry'), function (cs) {
      if ([].some.call(cs.querySelectorAll('img'), function (im) { return urls.indexOf(im.getAttribute('src')) >= 0; })) carry.push(cs);
    });
    var st = { id: cfg.id, state: 'idle', why: '', p: 0, frames: 0, away: false }; ST.stages.push(st);
    stages.push({ cfg: cfg, el: el, sec: sec, src: src, carry: carry, away: false, pin: !!(sec && sec.hasAttribute('data-pin')), st: st, handle: null, near: false, top: 0, h: 1, timer: 0 });
  });
  if (!stages.length) return;
  // (the studio switches motion without reloading the page: 3D follows it)
  if (W.MutationObserver) { try { new W.MutationObserver(function () { if (reduced()) all('reduced motion'); else start(); }).observe(html, { attributes: true, attributeFilter: ['data-motion'] }); } catch (e) {} }
  start();
}

// the loader as it is written into a page: the same text on the server and in the studio bundle (whose copy of this file
// is indented -- leading whitespace is dropped, so preview and export carry the identical program); full-line comments
// stay in this file, not in every page
const LOADER = '(' + threeDLoader.toString().replace(/\r?\n[ \t]+/g, '\n').replace(/\n\/\/[^\n]*/g, '') + ')();';

// the CREATIVE_3D flag, read where pages are composed (the server): 3D may be planned only with it on
function enabled(env) { const e = env || (typeof process !== 'undefined' && process.env) || {}; return String(e.CREATIVE_3D || '').toLowerCase() === 'on'; }

module.exports = { LIMITS, MIME, RUNTIME, ASSET_ID, DATA_URL, REASONS, SOURCE, POSE, COMPOSITIONS: POSE.COMPOSITIONS, COMPOSITION_NAMES: POSE.COMPOSITION_NAMES, INTERACTIONS: POSE.INTERACTIONS, cleanAsset, cleanScene, normalise, sourceEligible, intent, cleanIntent, forPage, DEFAULT_BOX, CSS, LOADER, enabled };
