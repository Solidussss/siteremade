'use strict';
// CREATIVE — the SPATIAL tier (shared: server validation, studio bundle, tests).
//
// A Creative page is one validated timeline (timeline.js). Most pages are drawn by the DOM renderer; a page whose concept
// genuinely gains from real depth -- an object that turns, a camera that flies through chapters, a lineup in
// perspective, a field of particles, a globe of data points -- may ALSO be drawn by the spatial renderer: a small WebGL
// runtime (spatial-runtime.js) that reads the SAME timeline (scenes, actors, moments, rhythm, transitions, pictures,
// words, colours) plus the few structured fields below. Nothing here is code: every field is an enum or a bounded number,
// chosen by a deterministic decision (decide), composed from the timeline (compose) and re-checked on every save, reopen
// and export (normalise). The DOM page is always rendered underneath: the spatial layer only replaces what it draws once
// it has drawn it, and any failure -- no WebGL, a lost context, a picture or model that will not load, a slow device,
// reduced motion -- leaves the DOM page exactly as it would have been.
//
//   timeline.renderer = 'spatial', timeline.why = [codes: why this renderer], timeline.spatial = {
//     v: 1, quality: high|medium (the ceiling; the device may lower it), phone: lite|dom, depth: layered|deep|tunnel,
//     fog: 0..0.8,
//     camera: [{ g, dz, dx, dy, yaw, pitch }]      bounded keys on the page's scroll axis (the rhythm decides them)
//     moves: [{ scene, move }]                     what the camera does in each scene (for the fingerprint and review)
//     actors: [{ role, form: billboard|plane|model, model?, z: [..], ry: [..] }]   depth and turn per timeline key
//     pieces: [{ kind: flight|lineup|cards|globe, scene, scenes?, assets?, points?, arcs? }]
//     particles: { style, count, fill, scene? }    one bounded field (or none)
//     seams: [{ at, family }]                      the timeline's transitions, mapped to their spatial equivalents
//     morphs: [{ at, kind: dissolve|cross }]       image morphs only (no geometry morphs: see MORPHS)
//   }

const CAMERA_MOVES = ['hold', 'push-in', 'pull-back', 'lateral', 'rise', 'fall', 'orbit', 'handoff', 'reveal', 'fly-through'];
const DEPTHS = ['layered', 'deep', 'tunnel'];
const PARTICLES = ['none', 'burst', 'ambient', 'dust', 'stars', 'points', 'data'];
const FORMS = ['billboard', 'plane', 'model'];
const PIECES = ['flight', 'lineup', 'cards', 'globe'];
const FILLS = ['accent', 'glow', 'ink'];
const QUALITIES = ['high', 'medium'];
const PHONE = ['lite', 'dom'];
// every DOM transition has a spatial meaning (type-mask stays a DOM effect: a word as a window is sharpest as type)
const SEAM_MAP = { cut: 'cut', 'color-bleed': 'fog-bleed', 'actor-carry': 'world-carry', 'depth-handoff': 'camera-dive', 'foreground-wipe': 'object-pass', 'image-expand': 'plane-approach', 'card-expand': 'card-flight', 'shape-takeover': 'disc-approach', 'type-mask': 'dom' };
const SPATIAL_SEAMS = [...new Set(Object.values(SEAM_MAP))];
// image morphs only: a dissolve (a picture leaving through a noise edge) and a cross-morph (one picture becoming the next
// in the same place). A geometry morph needs two models with matching morph targets -- not supported (see CREATIVE_MODE.md)
const MORPHS = ['dissolve', 'cross'];
// why a page is (or is not) spatial -- recorded on the timeline and shown in the diagnostics
const WHY = {
  // reasons for the spatial tier (strong ones count twice)
  model: 2, 'object-turn': 2, 'camera-flight': 2, globe: 2, lineup: 1, particles: 1, 'card-planes': 1,
  // reasons to stay DOM
  'flag-off': 0, 'restrained-mode': 0, 'editorial-subject': 0, 'personal-page': 0, 'calm-personality': 0, 'weak-pictures': 0, 'no-reason': 0, 'dom-requested': 0,
};
const WHY_CODES = Object.keys(WHY);

// the hard budget of a spatial page, per device tier (the runtime picks the tier; the plan only sets the ceiling)
const QUALITY = {
  high: { dpr: 1.75, particles: 1600, globe: 2400, arcs: 12, textures: 16, texSize: 2048, planes: 24, models: 1, tris: 80000, drawCalls: 40, shadow: 1 },
  medium: { dpr: 1.25, particles: 800, globe: 1400, arcs: 8, textures: 12, texSize: 1600, planes: 16, models: 1, tris: 40000, drawCalls: 28, shadow: 1 },
  low: { dpr: 1, particles: 260, globe: 600, arcs: 4, textures: 8, texSize: 1024, planes: 10, models: 0, tris: 0, drawCalls: 16, shadow: 0 },
};
const CAPS = { camKeys: 24, pieces: 4, flight: 5, lineup: 7, cards: 10, textures: 16, models: 1, modelBytes: 8 * 1024 * 1024, particles: 1600, globePoints: 2400, arcs: 12, objects: 40 };
// the bounds of every camera number: dz is a fraction of the camera's distance (+ = toward the page), dx/dy fractions of
// the screen, yaw/pitch degrees
const CAM = { dz: [-0.3, 0.5], dx: [-0.12, 0.12], dy: [-0.12, 0.12], yaw: [-14, 14], pitch: [-8, 8] };
// the fastest each camera number may change per unit of the scroll axis
const CAM_RATE = { dz: 0.9, dx: 0.3, dy: 0.3, yaw: 30, pitch: 20 };
// (a flat picture turned past ~16 degrees reads as a card; a wide or group picture past ~8 -- real prompts showed both)
const ACTOR3D = { z: [-0.6, 0.35], ry: { billboard: [0, 0], plane: [-16, 16], model: [-360, 360] }, wideTurn: 8 };
const PARTICLE_MAX = { none: 0, burst: 700, ambient: 900, dust: 800, stars: 1600, points: 1400, data: 1200 };

const num = (v, lo, hi, d) => (typeof v === 'number' && isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d);
const oneOf = (v, list, d) => (list.includes(v) ? v : d);
const r2 = v => Math.round(v * 100) / 100;
const q05 = v => Math.round(v * 20) / 20;

// ---------------------------------------------------------------- what the concept is about
const RX = {
  product: /\b(products?|bottles?|cans?|drinks?|soda|sneakers?|shoes?|watch(es)?|phones?|headphones?|gadgets?|devices?|perfume|cosmetics?|snacks?|launch|packaging|chairs?|lamps?|cars?|bikes?|cameras?|consoles?|toys?|doughnuts?|donuts?|burgers?|coffee|energy drink)\b/i,
  character: /\b(games?|gaming|video game|characters?|mascots?|fighters?|franchise|anime|cartoons?|esports|meme|figurine)\b/i,
  tech: /\b(data|network|logistics|shipping|freight|supply chain|software|cloud computing|artificial intelligence|satellites?|airlines?|telecom|fintech|analytics|infrastructure|technology|quantum|computing|semiconductors?|processors?)\b/i,
  // a subject that IS a network spread over the world (the point globe): never merely 'digital' or 'online'
  data: /\b(data|networks?|logistics|shipping|freight|supply chain|satellites?|constellation|telecom|airlines?|global (trade|network|internet|coverage)|worldwide network|infrastructure)\b/i,
  place: /\b(travel|city|cities|architecture|buildings?|towers?|hotels?|resorts?|islands?|mountains?|coast|landscapes?|destinations?|residences?|skyline|airports?|harbou?rs?|yachts?|aviation|flight|landmarks?|venues?|opera house|cathedrals?|bridges?|monuments?|heritage site|temples?|castles?|palaces?|stadiums?)\b/i,
  abstract: /\b(abstract|experimental|generative|art project|installation|ambient|synth|electronic music|visual art|sound art|kinetic)\b/i,
  editorial: /\b(fashion|couture|runway|designer|portfolio|photographer|editorial|magazine|memoir|poem|poetry|wedding|memorial|obituary|tribute to my)\b/i,
  space: /\b(outer space|space (exploration|travel|station|flight|telescope|mission)|spacecraft|rockets?|galaxy|galaxies|cosmos|astronom\w*|nebula|night sky|planets?|starfield)\b/i,
};
function conceptOf(ctx) {
  const c = ctx || {}; const text = [c.name, c.title, c.logline, c.what, c.visuals, (c.motifs || []).join(' ')].filter(Boolean).join(' ');
  const o = {}; Object.keys(RX).forEach(k => { o[k] = RX[k].test(text); });
  const subject = [c.name, c.what, c.visuals].filter(Boolean).join(' '); o.editorial = RX.editorial.test(subject);
  if (c.kind === 'invented' && !o.product && !o.character && !o.tech && !o.place) o.abstract = true;
  return o;
}

// ---------------------------------------------------------------- pictures the spatial layer can use
const wide = a => !!(a && a.assess && a.assess.width >= 1100 && a.assess.aspect >= 1.15);
const sharp = (a, px) => !!(a && a.assess && Math.max(a.assess.width, a.assess.height) >= (px || 700));
const cutoutOf = a => !!(a && (a.cutout || (a.assess && a.assess.transparent)));
const imageLayers = s => (s.layers || []).filter(L => L.kind === 'image' && L.asset);
const BLEEDY = ['editorial-hero', 'cinematic', 'image', 'splitscreen', 'edge-crop', 'poster', 'campaign', 'depth'];
const LINEUPS = ['lineup', 'cardstream', 'strip', 'index'];
const CARDISH = ['gallery', 'collage', 'scrapbook', 'cardstream', 'strip'];
const QUIET_TEXT = ['text', 'statement', 'index', 'takeover', 'giant-type', 'magazine', 'sticky-steps', 'brutalist', 'floating'];
// scene choreographies whose pictures the spatial layer must not take over (they are the scene's own steps)
const OWN_PICTURES = ['chapters', 'track', 'pin-steps', 'cardstream'];

// the flight: the longest run (2..5) of neighbouring scenes that each show one wide, sharp picture across the screen --
// else the steps of one held chapters scene (its pictures, one after another in depth: the camera flies from chapter to
// chapter). -> { scene, scenes, assets, steps } | null
const stepPics = (s, byId) => [...new Set(imageLayers(s).sort((a, b) => (a.step || 0) - (b.step || 0)).map(L => L.asset))].filter(id => { const a = byId.get(id); return a && sharp(a, 1100) && a.assess.aspect >= 0.95; });
function flightRun(scenes, byId) {
  const run = flightScenes(scenes, byId);
  if (run) return { scene: run[0].scene, scenes: run.map(x => x.scene), assets: run.map(x => x.asset), steps: false };
  for (let i = 1; i < scenes.length; i++) { const s = scenes[i]; if (s.layout !== 'chapters' || !s.pin) continue; const ids = stepPics(s, byId).slice(0, CAPS.flight); if (ids.length >= 2) return { scene: i, scenes: [i], assets: ids, steps: true }; }
  return null;
}
function flightScenes(scenes, byId) {
  const ok = s => { const L = imageLayers(s).find(x => x.role === 'focal' || x.frame === 'bleed'); const a = L && byId.get(L.asset); return L && wide(a) && sharp(a, 1300) && !OWN_PICTURES.includes(s.choreo) && (BLEEDY.includes(s.layout) || L.frame === 'bleed') ? a.id : null; };
  let best = null; let cur = [];
  scenes.forEach((s, i) => { const id = i > 0 ? ok(s) : null; if (id && !cur.some(x => x.asset === id)) cur.push({ scene: i, asset: id }); else cur = id ? [{ scene: i, asset: id }] : []; if (cur.length >= 2 && (!best || cur.length > best.length)) best = cur.slice(0, CAPS.flight); });
  return best;
}
function lineupScene(scenes, byId) {
  for (let i = 1; i < scenes.length; i++) { const s = scenes[i]; if (!LINEUPS.includes(s.layout)) continue; const ids = [...new Set(imageLayers(s).map(L => L.asset))].filter(id => sharp(byId.get(id), 300)); if (ids.length >= 3) return { scene: i, assets: ids.slice(0, CAPS.lineup) }; }
  return null;
}
function cardsScene(scenes, byId, taken) {
  for (let i = 1; i < scenes.length; i++) { const s = scenes[i]; if (taken.has(i) || !CARDISH.includes(s.layout)) continue; const ids = [...new Set(imageLayers(s).map(L => L.asset))].filter(id => sharp(byId.get(id), 300)); if (ids.length >= 4) return { scene: i, assets: ids.slice(0, CAPS.cards) }; }
  return null;
}
function globeScene(scenes, taken) {
  const n = scenes.length; const order = [];
  for (let i = 1; i < n; i++) order.push(i);
  // (a scene of words without its own main picture, toward the middle of the page)
  order.sort((a, b) => Math.abs(a - n / 2) - Math.abs(b - n / 2));
  const free = order.find(i => !taken.has(i) && !imageLayers(scenes[i]).some(L => L.role === 'focal') && QUIET_TEXT.includes(scenes[i].layout));
  return free != null ? free : order.find(i => !taken.has(i) && !imageLayers(scenes[i]).some(L => L.role === 'focal'));
}

// ---------------------------------------------------------------- the decision: is spatial justified?
// ctx: { enabled (the CREATIVE_SPATIAL flag), mode, family, personality, kind, name, title, logline, what, visuals, motifs,
//        scenes (validated), timeline (validated, dom), byId, models: [{ id, of }], request: 'dom'|'spatial'|'' }
// -> { renderer, why: [codes], score, found: { flight, lineup, cards, globe } }
function decide(ctx) {
  const c = ctx || {}; const why = []; const tl = c.timeline || { actors: [], moments: [], transitions: [] }; const byId = c.byId || new Map();
  const con = conceptOf(c); const scenes = c.scenes || [];
  // what the page would gain
  const primary = (tl.actors || []).find(a => a.role === 'primary'); const pa = primary && byId.get(primary.asset);
  const moments = (tl.moments || []).map(m => m.kind);
  const model = primary && (c.models || []).find(m => m && (m.of === primary.asset || m.of === (pa && pa.cutoutOf) || (!m.of && (c.models || []).length === 1)));
  const found = { flight: flightRun(scenes, byId), lineup: lineupScene(scenes, byId), cards: null, globe: null };
  const taken = new Set([...(found.flight ? found.flight.scenes : []), ...(found.lineup ? [found.lineup.scene] : [])]);
  found.cards = cardsScene(scenes, byId, taken); if (found.cards) taken.add(found.cards.scene);
  if (model) why.push('model');
  if (primary && cutoutOf(pa) && sharp(pa, 700) && (con.product || con.character) && moments.some(k => ['actor-turn', 'actor-entrance', 'reveal'].includes(k))) why.push('object-turn');
  if (found.flight && (moments.some(k => ['chapter-flight', 'depth-dive', 'world-change'].includes(k)) || con.place || ['cinematic-chapters', 'layered-parallax', 'mask-transition'].includes(c.family))) why.push('camera-flight');
  if (con.data && !con.product && !con.character && !con.editorial) { found.globe = globeScene(scenes, taken); if (found.globe != null) why.push('globe'); }
  if (found.lineup && (con.product || con.character)) why.push('lineup');
  if ((con.character || con.product || con.abstract || con.space || con.tech) && ['expressive', 'immersive'].includes(c.mode)) why.push('particles');
  if (found.cards && (con.abstract || con.tech)) why.push('card-planes');
  const score = why.reduce((t, k) => t + (WHY[k] || 0), 0);
  // what keeps it DOM (any one is enough) -- and immersive mode alone is never a reason
  const stay = [];
  if (!(c.enabled === true || c.enabled === 'on')) stay.push('flag-off');
  if (c.request === 'dom') stay.push('dom-requested');
  if (['quiet', 'editorial'].includes(c.mode) || ['editorial-sticky', 'gallery-progression'].includes(c.family)) stay.push('restrained-mode');
  if (con.editorial) stay.push('editorial-subject');
  if (c.kind === 'personal') stay.push('personal-page');
  if (['luxe', 'still', 'editorial'].includes(c.personality)) stay.push('calm-personality');
  // (the spatial layer is only as good as its pictures: without one sharp picture it would enlarge soft ones)
  const imgs = [...byId.values()].filter(a => a && a.assess);
  if (!imgs.some(a => sharp(a, 1100)) && !why.includes('globe') && !why.includes('model')) stay.push('weak-pictures');
  if (score < 2) stay.push('no-reason');
  if (stay.length) return { renderer: 'dom', why: stay.concat(why.length && !stay.includes('flag-off') ? why : []).slice(0, 8), score, found };
  return { renderer: 'spatial', why: why.slice(0, 8), score, found };
}

// ---------------------------------------------------------------- composing the spatial block from the timeline
// ctx as decide, plus: rng, palette, atmosphere; d = decide(ctx)
function compose(ctx, d) {
  const c = ctx || {}; const tl = c.timeline; const n = (c.scenes || []).length; const con = conceptOf(c); const why = d.why;
  const strong = why.filter(k => WHY[k] === 2).length;
  const sp = { v: 1, quality: c.mode === 'immersive' && strong >= 1 ? 'high' : 'medium', phone: why.every(k => ['particles', 'card-planes'].includes(k)) ? 'dom' : 'lite', depth: d.found.flight && why.includes('camera-flight') ? 'tunnel' : c.mode === 'immersive' ? 'deep' : 'layered', fog: 0.35 };
  if (sp.depth === 'tunnel') sp.fog = 0.5;
  // the camera follows the rhythm: an event moves it, a rest holds it still, the payoff pulls back to the whole picture
  const moves = []; const keys = [{ g: 0, dz: 0, dx: 0, dy: 0, yaw: 0, pitch: 0 }];
  const momentAt = i => ((tl.moments || []).find(m => m.scene === i) || {}).kind || '';
  const side = i => ((i * 7 + n) % 2 ? 1 : -1);
  for (let i = 0; i < n; i++) {
    const R = tl.rhythm[i]; const M = momentAt(i); const k = R === 'escalation' ? 1.3 : 1;
    let move = 'hold';
    if (i === 0) move = M === 'actor-entrance' || M === 'type-break' ? 'pull-back' : 'hold';
    else if (R === 'event' || R === 'escalation') move = ({ 'actor-turn': 'orbit', 'actor-entrance': 'orbit', 'chapter-flight': 'fly-through', 'depth-dive': 'fly-through', 'lineup-rush': 'lateral', 'world-change': 'rise', 'color-flood': 'rise', 'type-break': 'pull-back', 'word-takeover': 'pull-back', reveal: 'reveal', 'image-expand': 'push-in' })[M] || 'push-in';
    else if (R === 'payoff') move = 'pull-back';
    // (the last scene holds the camera at rest: the page ends on its designed composition, wherever the reader can stop)
    if (i === n - 1 && i > 0) move = 'hold';
    moves.push({ scene: i, move });
    const at = (g, o) => keys.push(Object.assign({ g: q05(g), dz: 0, dx: 0, dy: 0, yaw: 0, pitch: 0 }, o));
    if (move === 'hold') continue;
    if (move === 'pull-back' && i === 0) { keys[0] = { g: 0, dz: 0.14, dx: 0, dy: 0, yaw: 0, pitch: 0 }; at(0.6, {}); continue; }
    if (move === 'orbit') { at(i + 0.15, {}); at(i + 0.55, { dz: r2(0.1 * k), yaw: Math.round(9 * k * side(i)) }); at(i + 0.8, { dz: r2(0.1 * k), yaw: Math.round(9 * k * side(i)) }); continue; }
    if (move === 'fly-through') { at(i + 0.1, {}); at(i + 0.6, { dz: r2(0.2 * k) }); at(i + 0.85, { dz: r2(0.2 * k) }); continue; }
    if (move === 'lateral') { at(i + 0.1, {}); at(i + 0.6, { dx: r2(-0.07 * k * side(i)), yaw: Math.round(-4 * side(i)) }); at(i + 0.85, { dx: r2(-0.07 * k * side(i)), yaw: Math.round(-4 * side(i)) }); continue; }
    if (move === 'rise') { at(i + 0.1, {}); at(i + 0.6, { dy: r2(0.06 * k), pitch: -4 }); at(i + 0.85, { dy: r2(0.06 * k), pitch: -4 }); continue; }
    if (move === 'pull-back') { at(i + 0.1, {}); at(i + 0.6, { dz: r2(-0.12 * k) }); at(i + (R === 'payoff' ? 1 : 0.85), { dz: r2(-0.12 * k) }); continue; }
    if (move === 'reveal') { at(i + 0.05, { dz: r2(0.18 * k) }); at(i + 0.6, {}); continue; }
    at(i + 0.1, {}); at(i + 0.6, { dz: r2(0.2 * k) }); at(i + 0.85, { dz: r2(0.2 * k) });
  }
  // a depth hand-off dives through its seam (the camera moves in fast, the next scene settles back to rest)
  // (not into the last scene: it may never reach the top of the screen, and the camera ends at rest)
  (tl.transitions || []).filter(t => t.family === 'depth-handoff' && t.at < n - 1).forEach(t => { keys.push({ g: q05(t.at - 0.5), dz: 0, dx: 0, dy: 0, yaw: 0, pitch: 0 }, { g: q05(t.at - 0.05), dz: 0.3, dx: 0, dy: 0, yaw: 0, pitch: 0 }, { g: q05(t.at + 0.4), dz: 0, dx: 0, dy: 0, yaw: 0, pitch: 0 }); moves.push({ scene: t.at, move: 'handoff' }); });
  keys.push({ g: n, dz: 0, dx: 0, dy: 0, yaw: 0, pitch: 0 });
  sp.camera = keys; sp.moves = moves;
  // the actors in depth: they arrive from far, come toward the camera at their events, turn; leave by their exit
  sp.actors = (tl.actors || []).filter(a => a.kind === 'image').map(a => {
    const model = a.role === 'primary' && why.includes('model') ? (c.models || []).find(m => m && (m.of === a.asset || !m.of || (c.byId.get(a.asset) || {}).cutoutOf === m.of)) : null;
    const form = model ? 'model' : a.role === 'primary' && why.includes('object-turn') ? 'plane' : 'billboard';
    const turn = form === 'model' ? 1 : form === 'plane' ? 1 : 0; let flip = 1;
    const z = [], ry = [];
    a.keys.forEach((k, j) => {
      const R = tl.rhythm[Math.max(0, Math.min(n - 1, Math.floor(k.g)))]; const big = ['event', 'escalation'].includes(R) && k.g - Math.floor(k.g) >= 0.45;
      if (k.o === 0 && j === 0) { z.push(-0.45); ry.push(form === 'model' ? -90 : turn * -12); return; }
      if (j === a.keys.length - 1 && a.exit !== 'none') { z.push(a.exit === 'offstage' ? 0.25 : a.exit === 'shrink' ? -0.5 : -0.3); ry.push(form === 'model' ? 180 * flip : turn * 10 * flip); return; }
      if (big) { flip = -flip; z.push(0.12); ry.push(form === 'model' ? 180 * (j % 2 ? 1 : -1) : turn * 14 * flip); return; }
      z.push(0); ry.push(form === 'model' ? 0 : 0);
    });
    return Object.assign({ role: a.role, form }, model ? { model: model.id } : {}, { z, ry });
  });
  // the set pieces: the scenes whose pictures the spatial layer draws in depth
  const pieces = [];
  if (why.includes('camera-flight') && d.found.flight) { const f = d.found.flight; pieces.push(Object.assign({ kind: 'flight', scene: f.scene, scenes: f.scenes, assets: f.assets }, f.steps ? { steps: true } : {})); }
  if (why.includes('lineup') && d.found.lineup) pieces.push({ kind: 'lineup', scene: d.found.lineup.scene, assets: d.found.lineup.assets });
  if (why.includes('card-planes') && d.found.cards) pieces.push({ kind: 'cards', scene: d.found.cards.scene, assets: d.found.cards.assets });
  if (why.includes('globe') && d.found.globe != null) pieces.push({ kind: 'globe', scene: d.found.globe, points: 2000, arcs: 8, fill: 'accent' });
  sp.pieces = pieces.slice(0, CAPS.pieces);
  // one bounded particle field, its style from the concept
  const event = (tl.moments || []).find(m => m.scene > 0) || null;
  const style = !why.includes('particles') && !why.includes('globe') && sp.depth !== 'tunnel' ? 'none'
    : con.space ? 'stars' : (con.character || con.product) && event ? 'burst' : con.tech ? 'data' : con.abstract ? 'points' : con.place ? 'dust' : 'ambient';
  sp.particles = style === 'none' ? { style: 'none', count: 0, fill: 'glow' } : Object.assign({ style, count: Math.min(PARTICLE_MAX[style], style === 'burst' ? 600 : style === 'stars' ? 1400 : style === 'dust' ? 700 : 1000), fill: style === 'data' || style === 'burst' ? 'accent' : 'glow' }, style === 'burst' ? { scene: event.scene } : {});
  return normalise(sp, { scenes: c.scenes, timeline: tl, byId: c.byId, models: c.models });
}

// ---------------------------------------------------------------- validation: the only door into the spatial runtime
// normalise(raw, ctx) -> the bounded block, or null (then the page is DOM). ctx: { scenes, timeline (validated), byId,
// models (undefined = unknown: a saved model reference is then kept as it was) }
function normalise(raw, ctx) {
  const c = ctx || {}; const t = raw && typeof raw === 'object' ? raw : null; if (!t) return null;
  const scenes = c.scenes || []; const n = scenes.length; const tl = c.timeline || { actors: [], transitions: [] }; const byId = c.byId || new Map();
  if (n < 2) return null;
  const out = { v: 1, quality: oneOf(t.quality, QUALITIES, 'medium'), phone: oneOf(t.phone, PHONE, 'lite'), depth: oneOf(t.depth, DEPTHS, 'layered'), fog: r2(num(t.fog, 0, 0.8, 0.35)) };
  // the camera: bounded keys, sorted, one per point; it starts and ends at rest; two close keys never jump
  const seen = new Set(); let keys = [];
  (Array.isArray(t.camera) ? t.camera : []).slice(0, 60).forEach(k => {
    if (!k || typeof k !== 'object' || typeof k.g !== 'number' || !isFinite(k.g)) return; const g = q05(num(k.g, 0, n, 0)); if (seen.has(g)) return; seen.add(g);
    keys.push({ g, dz: r2(num(k.dz, CAM.dz[0], CAM.dz[1], 0)), dx: r2(num(k.dx, CAM.dx[0], CAM.dx[1], 0)), dy: r2(num(k.dy, CAM.dy[0], CAM.dy[1], 0)), yaw: Math.round(num(k.yaw, CAM.yaw[0], CAM.yaw[1], 0)), pitch: Math.round(num(k.pitch, CAM.pitch[0], CAM.pitch[1], 0)) });
  });
  keys.sort((a, b) => a.g - b.g);
  const rest = g => ({ g, dz: 0, dx: 0, dy: 0, yaw: 0, pitch: 0 });
  if (!keys.length || keys[0].g > 0) keys.unshift(rest(0));
  const last = keys[keys.length - 1]; if (last.g < n || last.dz || last.dx || last.dy || last.yaw || last.pitch) { if (last.g >= n) keys.pop(); keys.push(rest(n)); }
  if (keys.length > CAPS.camKeys) keys = keys.slice(0, CAPS.camKeys - 1).concat([rest(n)]);
  // (the camera never jumps: between two keys each number changes no faster than its rate, per unit of scroll axis --
  // a key that would is brought toward its predecessor; the last key, at rest, is reached by easing)
  for (let i = 1; i < keys.length - 1; i++) { const A = keys[i - 1], B = keys[i], dg = B.g - A.g; Object.keys(CAM_RATE).forEach(f => { const lim = CAM_RATE[f] * dg; if (Math.abs(B[f] - A[f]) > lim) B[f] = f === 'yaw' || f === 'pitch' ? Math.round(A[f] + Math.sign(B[f] - A[f]) * lim) : r2(A[f] + Math.sign(B[f] - A[f]) * lim); }); }
  out.camera = keys;
  out.moves = (Array.isArray(t.moves) ? t.moves : []).slice(0, 2 * n).map(m => m && typeof m === 'object' ? { scene: Math.round(num(m.scene, 0, n - 1, 0)), move: oneOf(m.move, CAMERA_MOVES, 'hold') } : null).filter(Boolean);
  // the actors: their depth and turn per timeline key (the timeline's own keys keep x, y, scale, rotation and opacity)
  const models = c.models;
  out.actors = [];
  (Array.isArray(t.actors) ? t.actors : []).forEach(x => {
    if (!x || typeof x !== 'object') return; const a = (tl.actors || []).find(y => y.role === x.role && y.kind === 'image'); if (!a || out.actors.some(y => y.role === a.role)) return;
    let form = oneOf(x.form, FORMS, 'billboard'); let model = typeof x.model === 'string' && /^[\w-]{1,40}$/.test(x.model) ? x.model : '';
    // (a model that is not in the project is not drawn: the actor's own picture takes its place)
    if (form === 'model' && (!model || a.role !== 'primary' || (Array.isArray(models) && !models.some(m => m && m.id === model && m.format === 'glb' && !(m.bytes > CAPS.modelBytes))))) { form = 'plane'; model = ''; }
    if (form !== 'model') model = '';
    const pic = byId.get(a.asset); const wideish = form === 'plane' && pic && pic.assess && pic.assess.aspect >= 1.25;
    const zr = wideish ? [-ACTOR3D.wideTurn, ACTOR3D.wideTurn] : ACTOR3D.ry[form]; const K = a.keys.length;
    const z = Array.from({ length: K }, (_, j) => r2(num((x.z || [])[j], ACTOR3D.z[0], ACTOR3D.z[1], 0)));
    const ry = Array.from({ length: K }, (_, j) => Math.round(num((x.ry || [])[j], zr[0], zr[1], 0)));
    // (no jumps between two close keys)
    for (let j = 1; j < K; j++) if (a.keys[j].g - a.keys[j - 1].g < 0.1) { if (Math.abs(z[j] - z[j - 1]) > 0.1) z[j] = z[j - 1]; if (Math.abs(ry[j] - ry[j - 1]) > 30) ry[j] = ry[j - 1]; }
    out.actors.push(Object.assign({ role: a.role, form }, model ? { model } : {}, { z, ry }));
  });
  // the set pieces
  const used = new Set(); out.pieces = [];
  const img = id => { const a = byId.get(id); return a && a.assess && !a.format ? a : null; };
  (Array.isArray(t.pieces) ? t.pieces : []).slice(0, 8).forEach(p => {
    if (!p || typeof p !== 'object' || out.pieces.length >= CAPS.pieces) return; const kind = oneOf(p.kind, PIECES, ''); if (!kind || out.pieces.some(x => x.kind === kind)) return;
    const scene = Math.round(num(p.scene, -1, n - 1, -1)); if (scene < 1 || used.has(scene)) return;
    if (kind === 'globe') { used.add(scene); out.pieces.push({ kind, scene, points: Math.round(num(p.points, 200, CAPS.globePoints, 1600)), arcs: Math.round(num(p.arcs, 0, CAPS.arcs, 6)), fill: oneOf(p.fill, FILLS, 'accent') }); return; }
    const onPage = new Set(imageLayers(scenes[scene]).map(L => L.asset));
    if (kind === 'flight') {
      const list = Array.isArray(p.scenes) ? p.scenes : []; const assets = Array.isArray(p.assets) ? p.assets : [];
      // (the steps of one held chapters scene: its own pictures, in its own order)
      if (p.steps === true) { const s = scenes[scene]; if (s.layout !== 'chapters' || !s.pin) return; const ok = stepPics(s, byId); const ids = [...new Set(assets)].filter(id => ok.includes(id)).slice(0, CAPS.flight); if (ids.length < 2) return; used.add(scene); out.pieces.push({ kind, scene, scenes: [scene], assets: ids, steps: true }); return; }
      const run = []; for (let j = 0; j < Math.min(CAPS.flight, list.length); j++) { const si = Math.round(num(list[j], -1, n - 1, -1)); const a = img(assets[j]); if (si !== scene + j || used.has(si) || !a || !wide(a) || !imageLayers(scenes[si]).some(L => L.asset === a.id)) break; run.push({ si, id: a.id }); }
      if (run.length < 2) return; run.forEach(r => used.add(r.si));
      out.pieces.push({ kind, scene, scenes: run.map(r => r.si), assets: run.map(r => r.id) }); return;
    }
    const ids = [...new Set((Array.isArray(p.assets) ? p.assets : []).filter(id => img(id) && onPage.has(id)))].slice(0, CAPS[kind]);
    if (ids.length < (kind === 'lineup' ? 3 : 4)) return; used.add(scene); out.pieces.push({ kind, scene, assets: ids });
  });
  // the particle field
  const P = t.particles && typeof t.particles === 'object' ? t.particles : {};
  const style = oneOf(P.style, PARTICLES, 'none');
  out.particles = style === 'none' ? { style: 'none', count: 0, fill: 'glow' } : Object.assign({ style, count: Math.round(num(P.count, 50, PARTICLE_MAX[style], Math.min(600, PARTICLE_MAX[style]))), fill: oneOf(P.fill, FILLS, 'glow') }, style === 'burst' ? { scene: Math.round(num(P.scene, 1, n - 1, 1)) } : {});
  // the transitions keep their meaning in depth (derived from the timeline: never chosen apart from it)
  out.seams = (tl.transitions || []).map(x => ({ at: x.at, family: SEAM_MAP[x.family] || 'fog-bleed' })).filter(x => x.family !== 'fog-bleed' && x.family !== 'cut');
  out.morphs = [];
  const fl = out.pieces.find(p => p.kind === 'flight'); if (fl) (fl.steps ? [fl.scene] : fl.scenes.slice(1)).forEach(si => out.morphs.push({ at: si, kind: 'dissolve' }));
  out.seams.filter(s => s.family === 'plane-approach' || s.family === 'card-flight').forEach(s => { if (!out.morphs.some(m => m.at === s.at)) out.morphs.push({ at: s.at, kind: 'cross' }); });
  out.morphs.sort((a, b) => a.at - b.at);
  // a spatial page with nothing spatial on it is a DOM page
  if (!out.actors.length && !out.pieces.length && out.particles.style === 'none') return null;
  return out;
}
function cleanWhy(list) { return (Array.isArray(list) ? list : []).filter(k => WHY_CODES.includes(k)).filter((k, i, a) => a.indexOf(k) === i).slice(0, 8); }

// ---------------------------------------------------------------- the behavioural fingerprint, spatial part
// x:<camera moves>/<depth>/<spatial seams>/<particles>/<actor forms>/<pieces>
function fingerprint(sp) {
  if (!sp) return '';
  const moves = [...new Set((sp.moves || []).map(m => m.move).filter(m => m !== 'hold'))].sort().join('+') || '-';
  const seams = [...new Set((sp.seams || []).map(s => s.family))].sort().join('+') || '-';
  const forms = (sp.actors || []).map(a => a.form).join('+') || '-';
  const pieces = (sp.pieces || []).map(p => p.kind).sort().join('+') || '-';
  return `x:${moves}/${sp.depth}/${seams}/${(sp.particles && sp.particles.style) || 'none'}/${forms}/${pieces}`;
}
function parseX(x) { const p = String(x || '').split('/'); const list = s => (s && s !== '-' ? s.split('+') : []); return { moves: list(p[0]), depth: p[1] || '', seams: list(p[2]), particles: p[3] || '', forms: list(p[4]), pieces: list(p[5]) }; }
const jac = (a, b) => { const A = new Set(a), B = new Set(b); if (!A.size && !B.size) return 1; const i = [...A].filter(x => B.has(x)).length; return i / new Set([...A, ...B]).size; };
function similarity(x, y) {
  if (!x || !y) return 0; const a = parseX(x), b = parseX(y);
  return +(0.3 * jac(a.moves, b.moves) + 0.1 * (a.depth === b.depth) + 0.2 * jac(a.seams, b.seams) + 0.15 * (a.particles === b.particles) + 0.1 * jac(a.forms, b.forms) + 0.15 * jac(a.pieces, b.pieces)).toFixed(3);
}

// ---------------------------------------------------------------- what the spatial layer needs from the pictures
// (asked of discovery and the picture check alongside timeline.assetNeeds: never required -- every need has a fallback)
// another angle of the subject is worth a search only for a physical product (a game, a character or a person turns as
// a picture, within a small angle; a 'side view' search for them brings in fan renders)
function wantsAlternate(u) { const x = u || {}; const c = conceptOf({ name: x.identity && x.identity.name, what: x.identity && x.identity.what, visuals: x.visuals && x.visuals.main }); return !!(c.product && !c.character); }
function assetNeeds(intent) {
  const i = intent || {}; const out = [];
  if (i.cutout) out.push({ need: 'transparent', for: 'the subject on a transparent background (a PNG cut-out) to move and turn in depth' }, { need: 'alternate', for: 'the same subject from another angle or pose' });
  if (i.bleed) out.push({ need: 'environment', for: 'a wide environment picture for the background planes' }, { need: 'foreground', for: 'a foreground element to pass the camera' });
  if (i.cutout && i.object) out.push({ need: 'model', for: 'a 3D model (GLB), only if one is supplied -- otherwise the picture turns as a plane' });
  return out;
}

module.exports = { CAMERA_MOVES, DEPTHS, PARTICLES, FORMS, PIECES, FILLS, SEAM_MAP, SPATIAL_SEAMS, MORPHS, WHY, WHY_CODES, QUALITY, CAPS, CAM, CAM_RATE, ACTOR3D, PARTICLE_MAX, conceptOf, wantsAlternate, decide, compose, normalise, cleanWhy, fingerprint, parseX, similarity, assetNeeds };
