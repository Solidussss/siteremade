'use strict';
// CREATIVE — the page as ONE directed timeline (shared: server validation, studio bundle, tests).
//
// A Creative page used to be a list of scenes, each with its own choreography. The timeline makes it one continuous
// experience: things that live ACROSS scenes (actors), what happens INSIDE a scene while it plays (beats), how one scene
// BECOMES the next (transitions), and the page's RHYTHM with its few MEMORABLE MOMENTS. Everything is structured data from
// fixed vocabularies with bounded numbers: the model (or the built-in director) chooses, the renderer implements.
//
// The scroll axis: g = scene index + progress through that scene (0 when its top reaches the top of the screen, 1 when
// its bottom does). An actor is ONE element with keyframes on that axis -- so a scene's end state IS the next scene's
// start state (the same track, sampled at the same point): an actor cannot respawn between scenes unless its keys say
// so, and the validator forbids a fade-out-and-back inside a run.
//
//   timeline = {
//     v: 1, renderer: 'dom' | 'spatial',
//     actors: [{ id: role, role: primary|secondary|typography|background, kind: image|word|shape, asset?, text?, style?,
//                shape?, from, to, ease, exit, keys: [{ g, x, y, s, r, o, sp? }] }],
//     beats: [{ scene, from, to, op, target, dir: in|out, v?, v2? }],       inside a scene, on its own progress window
//     transitions: [{ at, family }],                                        the seam between scene at-1 and scene at
//     rhythm: [setup|event|rest|escalation|payoff per scene], moments: [{ scene, kind, label }],
//     behavior: 'c:...|t:...|r:...' (a fingerprint of how the page MOVES, for anti-repetition)
//     why?: [codes]   why the page has the renderer it has (spatial.js decide)
//     spatial?: {...} the spatial tier's own bounded fields, when renderer is 'spatial' (spatial.js)
//   }

const SP = require('./spatial');

const ROLES = ['primary', 'secondary', 'typography', 'background'];
const KINDS = { primary: 'image', secondary: 'image', typography: 'word', background: 'shape' };
const OPS = ['translate', 'scale', 'rotate', 'opacity', 'clip', 'crossfade', 'text-swap', 'word-fill', 'letter-spread', 'depth-shift', 'perspective', 'background', 'takeover'];
const OP_TARGETS = { translate: ['heading', 'body', 'focal', 'stage'], scale: ['heading', 'focal', 'stage'], rotate: ['focal'], opacity: ['heading', 'body', 'focal', 'stage'], clip: ['focal'], crossfade: ['focal'], 'text-swap': ['heading'], 'word-fill': ['body', 'heading'], 'letter-spread': ['heading'], 'depth-shift': ['stage'], perspective: ['stage'], background: ['scene'], takeover: ['scene'] };
// the big moves: only where the page's rhythm has an event (never in a resting scene)
const INTENSE = ['perspective', 'takeover', 'letter-spread', 'background', 'clip', 'depth-shift'];
const TRANSITIONS = ['cut', 'color-bleed', 'actor-carry', 'image-expand', 'card-expand', 'foreground-wipe', 'type-mask', 'shape-takeover', 'depth-handoff'];
const SIGNATURE = ['image-expand', 'card-expand', 'foreground-wipe', 'type-mask', 'shape-takeover', 'depth-handoff'];
const MOMENTS = ['type-break', 'actor-entrance', 'actor-turn', 'color-flood', 'world-change', 'image-expand', 'lineup-rush', 'chapter-flight', 'word-takeover', 'depth-dive', 'reveal'];
const RHYTHM = ['setup', 'acceleration', 'event', 'rest', 'escalation', 'payoff'];
const EASES = ['smooth', 'snap', 'spring'];
const EXITS = ['none', 'offstage', 'shrink', 'fade', 'rejoin'];
const RENDERERS = ['dom', 'spatial'];
const WORD_STYLES = ['ghost', 'outline', 'solid'];
const SHAPES = ['glow', 'ring', 'blob'];
const FILLS = ['accent', 'glow', 'ink', 'muted'];
const BG_VALUES = ['accent', 'invert', 'deep'];
// what each mode may put on stage: how many actors at once, which roles, how many signature transitions and moments
const MODE_CAST = {
  quiet: { actors: 0, roles: [], signature: 0, moments: 0 },
  editorial: { actors: 1, roles: ['typography', 'background'], signature: 1, moments: 1 },
  expressive: { actors: 2, roles: ['primary', 'typography', 'background'], signature: 3, moments: 3 },
  immersive: { actors: 3, roles: ['primary', 'secondary', 'typography', 'background'], signature: 4, moments: 3 },
};
const LIMITS = { keys: 18, beatsPerScene: 3, beats: 18, moments: 3, moving: 3, movingPhone: 2 };
// the bounds of every actor number, by kind (images are also held to what their pixels allow: resCap)
const BOUNDS = { image: { x: [-34, 34], y: [-24, 24], s: [0.4, 1.4], r: [-18, 18] }, word: { x: [-40, 40], y: [-32, 32], s: [0.2, 2.2], r: [-12, 12] }, shape: { x: [-50, 50], y: [-40, 40], s: [0.3, 2.6], r: [-45, 45] } };
// the bounds of every beat value, by op (a scale on a picture never passes the scroll zoom ceiling: framing.js ZOOM)
const VALUE = { translate: [-24, 24], scale: [0.82, 1.15], rotate: [-10, 10], opacity: [0, 0.9], clip: [0.1, 0.45], perspective: [-14, 14], 'depth-shift': [0.5, 1.5] };

const num = (v, lo, hi, d) => (typeof v === 'number' && isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d);
const oneOf = (v, list, d) => (list.includes(v) ? v : d);
const r2 = v => Math.round(v * 100) / 100;
const q05 = v => Math.round(v * 20) / 20;
const clean = (v, n) => String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, n);

// ---------------------------------------------------------------- sampling an actor
const EASE = { smooth: t => t * t * (3 - 2 * t), snap: t => (t < 0.5 ? 16 * t ** 5 : 1 - (-2 * t + 2) ** 5 / 2), spring: t => { const c = 1.4; return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2; } };
// the actor's state at a point g of the scroll axis (the same function the runtime implements)
function stateAt(actor, g) {
  const k = actor.keys; if (!k.length) return null;
  const b = BOUNDS[KINDS[actor.role] || 'image'];
  if (g <= k[0].g) return pick(k[0]); if (g >= k[k.length - 1].g) return pick(k[k.length - 1]);
  let i = 0; while (i < k.length - 1 && k[i + 1].g < g) i++;
  const A = k[i], B = k[i + 1]; const t = (EASE[actor.ease] || EASE.smooth)((g - A.g) / Math.max(1e-6, B.g - A.g));
  const L = f => (A[f] == null ? 0 : A[f]) + ((B[f] == null ? 0 : B[f]) - (A[f] == null ? 0 : A[f])) * t;
  const out = { x: L('x'), y: L('y'), s: L('s'), r: L('r'), o: Math.max(0, Math.min(1, L('o'))) };
  if (A.sp != null || B.sp != null) out.sp = Math.max(0, Math.min(1, L('sp')));
  // (a spring may overshoot a little; it never leaves the bounds)
  ['x', 'y', 's', 'r'].forEach(f => { out[f] = Math.max(b[f][0], Math.min(b[f][1], out[f])); });
  return out;
}
function pick(k) { const o = { x: k.x, y: k.y, s: k.s, r: k.r, o: k.o }; if (k.sp != null) o.sp = k.sp; return o; }
// each scene's start and end state for each actor it contains: end(k) is start(k+1) -- the same point of one track
function sceneStates(tl, n) {
  const out = [];
  for (let i = 0; i < n; i++) { const row = {}; (tl.actors || []).forEach(a => { if (i >= a.from - 0.5 && i <= a.to + 1) row[a.id] = { start: stateAt(a, i), end: stateAt(a, i + 1) }; }); out.push(row); }
  return out;
}

// ---------------------------------------------------------------- the flow: rhythm, moments, transitions, cast
// planFlow(r, spec) -> { rhythm, moments, seams, cast, typo }. spec: { family, mode, personality, typo, scenes: [{ layout,
// choreo, carries }], actor: { from, to } | null, shortName }
const FAMILY_SEAMS = {
  'object-story': ['actor-carry', 'shape-takeover', 'color-bleed'], 'cinematic-chapters': ['image-expand', 'depth-handoff', 'color-bleed'],
  'editorial-sticky': ['color-bleed', 'foreground-wipe'], 'layered-parallax': ['depth-handoff', 'foreground-wipe', 'color-bleed'],
  'typography-led': ['type-mask', 'shape-takeover', 'foreground-wipe'], 'horizontal-gallery': ['card-expand', 'foreground-wipe', 'color-bleed'],
  'mask-transition': ['image-expand', 'type-mask', 'color-bleed'], 'poster-to-scene': ['type-mask', 'image-expand', 'shape-takeover'],
  'gallery-progression': ['card-expand', 'color-bleed'], 'colour-progression': ['shape-takeover', 'color-bleed', 'foreground-wipe'],
};
// the moment a scene can carry, from what it is
function momentFor(sc, i, spec) {
  if (sc.run) return i === (spec.actor && spec.actor.from) ? 'actor-entrance' : 'actor-turn';
  return ({ takeover: 'word-takeover', chapters: 'chapter-flight', cardstream: 'lineup-rush', lineup: 'lineup-rush', campaign: 'color-flood', splitscreen: 'color-flood', depth: 'depth-dive', 'fullscreen-object': 'reveal', 'giant-type': 'type-break', poster: 'type-break', strip: 'world-change' })[sc.layout]
    || (sc.choreo === 'expand' ? 'image-expand' : sc.choreo === 'scale-through' ? 'reveal' : '');
}
// which transitions two neighbouring scenes can carry, from their archetypes (the validator re-checks with the pictures)
const WITH_PICTURE = ['editorial-hero', 'cinematic', 'split', 'shrine', 'offcanvas', 'framed', 'floating', 'collage', 'poster', 'magazine', 'image', 'luxe', 'depth', 'gallery', 'campaign', 'splitscreen', 'fullscreen-object', 'orbit', 'chapters', 'lineup', 'edge-crop', 'scrapbook'];
const FULL_BLEED = ['editorial-hero', 'cinematic', 'image', 'chapters', 'splitscreen', 'edge-crop'];
function feasible(fam, prev, next, spec) {
  switch (fam) {
    case 'image-expand': return WITH_PICTURE.includes(next.layout);
    case 'card-expand': return ['cardstream', 'index', 'gallery', 'strip'].includes(prev.layout) && WITH_PICTURE.includes(next.layout);
    case 'type-mask': return FULL_BLEED.includes(next.layout) && !!spec.shortName;
    case 'depth-handoff': return WITH_PICTURE.includes(prev.layout) && prev.layout !== 'stage';
    default: return true;
  }
}
function planFlow(r, spec) {
  const n = spec.scenes.length; const cast = MODE_CAST[spec.mode] || MODE_CAST.editorial;
  const scenes = spec.scenes.map((s, i) => Object.assign({}, s, { run: !!(spec.actor && i >= spec.actor.from && i <= spec.actor.to) }));
  // rhythm: the opening sets up; the scenes that can carry a moment become events (never two events side by side --
  // rest between them); the last one pays off on an expressive page
  const rhythm = scenes.map((s, i) => (i === 0 ? 'setup' : 'rest'));
  const candidates = scenes.map((s, i) => ({ i, kind: momentFor(s, i, spec) })).filter(c => c.kind && c.i > 0);
  const events = [];
  candidates.forEach(c => { if (events.length < Math.max(0, cast.moments) && !events.some(e => Math.abs(e.i - c.i) < 2)) events.push(c); });
  events.forEach((e, k) => { rhythm[e.i] = k === 0 ? 'event' : 'escalation'; });
  if (cast.moments >= 2 && n >= 4 && rhythm[n - 1] === 'rest' && rhythm[n - 2] === 'rest') rhythm[n - 1] = 'payoff';
  // the opening's own moment: its type breaking apart, or the actor arriving -- when the page has a moment to spare
  const moments = [];
  const open = scenes[0].run ? 'actor-entrance' : ['giant-type', 'poster'].includes(scenes[0].layout) && spec.shortName ? 'type-break' : '';
  if (open && cast.moments >= 2 && events.length < cast.moments) moments.push({ scene: 0, kind: open });
  events.forEach(e => { if (moments.length < cast.moments) moments.push({ scene: e.i, kind: e.kind }); });
  moments.sort((a, b) => a.scene - b.scene);
  // transitions: a signature transition INTO each event (or at the end of the actor's run); colour bleeds elsewhere --
  // a quiet page only cuts and bleeds
  const pref = FAMILY_SEAMS[spec.family] || ['color-bleed'];
  const seams = []; let signature = 0;
  for (let i = 1; i < n; i++) {
    let fam = 'color-bleed';
    if (spec.actor && i > spec.actor.from && i <= spec.actor.to) fam = 'actor-carry';
    else if (signature < cast.signature && (rhythm[i] === 'event' || rhythm[i] === 'escalation' || rhythm[i] === 'payoff' || (spec.actor && i === spec.actor.to + 1))) {
      // (only a transition the two scenes can carry: an image to expand, a card to open, a picture behind a word...)
      const can = f => feasible(f, scenes[i - 1], scenes[i], spec);
      const options = pref.filter(f => SIGNATURE.includes(f) && can(f)); const any = options.length ? options : ['shape-takeover', 'foreground-wipe'].filter(can);
      if (any.length && spec.mode !== 'quiet') { fam = any[Math.floor(r() * any.length) % any.length]; signature++; }
    } else if (spec.mode === 'quiet' && r() < 0.5) fam = 'cut';
    seams.push({ at: i, family: fam });
  }
  // the cast: the actor's run (already planned by the recipe), the name as a typography actor on type-led pages, a
  // background field on immersive ones
  const c = {};
  if (spec.actor && cast.roles.includes('primary')) c.primary = { from: spec.actor.from, to: spec.actor.to };
  const typeLed = ['typography-led', 'poster-to-scene', 'object-story', 'colour-progression'].includes(spec.family) || ['giant', 'poster'].includes(spec.typo);
  if (spec.shortName && typeLed && cast.roles.includes('typography') && Object.keys(c).length < cast.actors) {
    const maskAt = seams.find(s => s.family === 'type-mask');
    c.typography = maskAt ? { from: 0, to: maskAt.at - 1, behavior: 'mask' } : c.primary ? { from: 0, to: Math.min(n - 1, c.primary.to), behavior: 'behind' } : { from: 0, to: Math.min(1, n - 1), behavior: 'break' };
  }
  if (cast.roles.includes('background') && Object.keys(c).length < cast.actors && spec.mode === 'immersive' && spec.family !== 'cinematic-chapters') c.background = { from: 0, to: Math.min(n - 1, 3) };
  const typo = [];
  if (c.typography) typo.push(c.typography.behavior === 'mask' ? 'mask' : c.typography.behavior === 'break' ? 'spread' : 'behind');
  if (scenes.some(s => s.layout === 'takeover')) typo.push('fill');
  return { rhythm, moments, seams, cast: c, typo };
}

// ---------------------------------------------------------------- behavioral fingerprint
function behavior(tl, art) {
  const t = tl || {}; const a = art || {};
  const cast = (t.actors || (t.cast ? Object.entries(t.cast).map(([role, v]) => Object.assign({ role }, v)) : [])).map(x => `${x.role[0].toUpperCase()}${x.from}-${x.to}`).join('.') || 'none';
  const seams = (t.transitions || t.seams || []).map(s => s.family).filter(f => f !== 'cut' && f !== 'color-bleed');
  const rhythm = (t.rhythm || []).map(x => ({ setup: 'S', acceleration: 'A', event: 'E', rest: 'R', escalation: 'X', payoff: 'P' })[x] || '?').join('');
  const moments = (t.moments || []).map(m => m.kind);
  const typo = t.typo || (t.actors || []).filter(x => x.role === 'typography').map(x => x.behavior || 'word').concat((t.beats || []).filter(b => ['word-fill', 'letter-spread', 'text-swap'].includes(b.op)).map(b => b.op));
  // (a spatial page adds how it moves in depth: its camera, depth, spatial transitions, particles, actor forms, set pieces)
  const x = t.renderer === 'spatial' && t.spatial ? '|' + SP.fingerprint(t.spatial) : '';
  return `c:${cast}|t:${seams.join(',') || '-'}|r:${rhythm || '-'}|m:${moments.join(',') || '-'}|y:${[...new Set(typo)].sort().join(',') || '-'}|p:${a.progression || '-'}|s:${a.scroll || '-'}${x}`.slice(0, 360);
}
function parseBehavior(s) { const o = {}; String(s || '').split('|').forEach(p => { const i = p.indexOf(':'); if (i > 0) o[p.slice(0, i)] = p.slice(i + 1); }); return o; }
const jac = (a, b) => { const A = new Set(a), B = new Set(b); if (!A.size && !B.size) return 1; const i = [...A].filter(x => B.has(x)).length; return i / new Set([...A, ...B]).size; };
// how alike two pages MOVE (0..1): the actors' lifecycle, the transitions, the rhythm, the moments, the typography's
// behaviour, the background progression and the scroll model
function behaviorSimilarity(x, y) {
  const a = parseBehavior(x), b = parseBehavior(y); if (!a.c || !b.c) return 0;
  const roles = s => (s === 'none' ? [] : s.split('.').map(p => p[0]));
  const list = s => (s && s !== '-' ? s.split(',') : []);
  const rh = (p, q) => { if (!p || !q) return 0; const n = Math.max(p.length, q.length); let same = 0; for (let i = 0; i < n; i++) if (p[i] === q[i]) same++; return same / n; };
  const base = 0.2 * jac(roles(a.c), roles(b.c)) + 0.25 * jac(list(a.t), list(b.t)) + 0.15 * rh(a.r, b.r) + 0.2 * jac(list(a.m), list(b.m)) + 0.1 * jac(list(a.y), list(b.y)) + 0.05 * (a.p === b.p) + 0.05 * (a.s === b.s);
  // (two DOM pages compare exactly as before; a spatial page is also compared by how it moves in depth -- and a spatial
  // page never reads as the same as a DOM one)
  if (!a.x && !b.x) return +base.toFixed(3);
  return +(0.8 * base + 0.2 * (a.x && b.x ? SP.similarity('x:' + a.x, 'x:' + b.x) : 0)).toFixed(3);
}

// ---------------------------------------------------------------- what the motion needs from the pictures
// before any picture is found (discovery): what the kind of subject will probably be asked to do
function motionIntent(u) {
  const x = u || {}; const said = `${(x.identity && x.identity.what) || ''} ${(x.visuals && x.visuals.main) || ''}`;
  const kind = String((x.identity && x.identity.kind) || x.kind || '');
  const character = /fictional|invented/.test(kind) || /\b(character|mascot|game|cartoon|anime|meme|product|object|toy|food|shoe|bag|car|gadget)\b/i.test(said);
  const place = /\b(place|city|building|architecture|landscape|travel|park|mountain|coast|museum)\b/i.test(said);
  return { cutout: character, bleed: place || /\b(film|movie|game|show|series|world|scenery)\b/i.test(said), why: [character ? 'a clean picture of the subject alone, to move it across scenes' : '', place ? 'a wide picture to fill the screen' : ''].filter(Boolean) };
}
// after the recipe: what this page's motion needs, and whether the pictures have it
function assetNeeds(flow, recipe) {
  const out = []; const f = flow || {};
  if (f.cast && f.cast.primary) out.push({ need: 'cutout', for: 'the persistent actor (the subject alone, on a plain or transparent background)' });
  if (f.cast && f.cast.secondary) out.push({ need: 'cutout', for: 'a second actor (another figure, cut out)' });
  (f.seams || []).forEach(s => { if (s.family === 'image-expand' || s.family === 'type-mask') out.push({ need: 'bleed', for: `a wide, sharp picture that can fill the screen (${s.family} into scene ${s.at + 1})` }); });
  if ((recipe && recipe.scenes || []).some(s => s.layout === 'chapters')) out.push({ need: 'bleed', for: 'several wide pictures for the chapters' });
  if ((f.seams || []).some(s => s.family === 'depth-handoff') || (recipe && recipe.scenes || []).some(s => s.layout === 'depth')) out.push({ need: 'layers', for: 'a foreground subject and a background picture' });
  if ((recipe && recipe.scenes || []).some(s => s.layout === 'edge-crop')) out.push({ need: 'detail', for: 'a picture with room for a close crop' });
  return out.slice(0, 6);
}

// ---------------------------------------------------------------- composing the timeline for a validated page
// ctx: { scenes (validated), flow, actor (validated primary: asset, from, to, poses, exit), byId, name, mode, personality,
//        rng, resCap(asset) }
function compose(ctx) {
  const c = ctx; const n = c.scenes.length; const r = c.rng || Math.random; const flow = c.flow || defaultFlow(c);
  const tl = { v: 1, renderer: 'dom', actors: [], beats: [], transitions: flow.seams.map(s => Object.assign({}, s)), rhythm: flow.rhythm.slice(0, n), moments: flow.moments.map(m => Object.assign({}, m)) };
  const calm = ['luxe', 'still', 'cinematic'].includes(c.personality); const rot = calm ? 0 : 1;
  // the primary actor: its poses become keys -- arriving, a turn inside an event scene, moving on between scenes, leaving
  const A = c.actor;
  if (A && flow.cast.primary !== undefined) {
    const P = k => A.poses[Math.min(A.poses.length - 1, Math.max(0, k - A.from))]; const keys = [];
    const p0 = P(A.from); const side = p0.x >= 0 ? 1 : -1;
    if (A.from > 0) keys.push({ g: A.from - 0.3, x: p0.x + side * 40, y: p0.y + 6, s: r2(p0.s * 0.85), r: p0.r + side * 8 * rot, o: 0 });
    for (let k = A.from; k <= A.to; k++) {
      const p = P(k); const big = ['event', 'escalation'].includes(tl.rhythm[k]);
      // (the actor holds its pose through the middle of a scene and moves between scenes over six tenths of one -- a move
      // tied to the scroll reads as travel when it is given room, as a lurch when it is squeezed)
      keys.push({ g: k + (k === 0 ? 0 : 0.3), x: p.x, y: p.y, s: p.s, r: p.r, o: 1 });
      // inside an event the actor transforms while the scene holds: it grows a little, turns, shifts toward centre
      if (big) keys.push({ g: k + 0.5, x: p.x, y: p.y - 3, s: r2(p.s * 1.1), r: Math.round(p.r + (p.x >= 0 ? -6 : 6) * rot), o: 1 });
      keys.push({ g: k + 0.7, x: p.x, y: big ? p.y - 3 : p.y, s: big ? r2(p.s * 1.1) : p.s, r: big ? Math.round(p.r + (p.x >= 0 ? -6 : 6) * rot) : p.r, o: 1 });
    }
    const last = P(A.to); const out = A.exit === 'rejoin' ? { g: A.to + 1.05, x: 0, y: 12, s: r2(last.s * 0.55), r: 0, o: 0 } : A.exit === 'shrink' ? { g: A.to + 1, x: last.x, y: last.y + 6, s: r2(last.s * 0.4), r: last.r, o: 0 }
      : { g: A.to + 1, x: last.x >= 0 ? 72 : -72, y: last.y, s: last.s, r: last.r + (last.x >= 0 ? 10 : -10) * rot, o: 0.85 };
    keys.push(out);
    // (scroll-linked travel eases smoothly: a snap or a spring is steep in the middle, and a steep move under the finger reads
    // as a jump; the personality shows in the poses -- tilt, reach, scale -- instead)
    tl.actors.push({ id: 'primary', role: 'primary', kind: 'image', asset: A.asset, from: A.from, to: A.to, ease: 'smooth', exit: A.exit, keys });
  }
  // the typography actor: the subject's name as an object of its own
  const T = flow.cast.typography; const word = clean(c.name, 24);
  if (T && word) {
    const keys = T.behavior === 'break'
      ? [{ g: 0, x: 0, y: -2, s: 1.15, r: 0, o: 1, sp: 1 }, { g: 0.35, x: 0, y: -2, s: 1, r: 0, o: 1, sp: 0 }, { g: Math.max(1.3, T.to + 0.3), x: 0, y: -34, s: 0.3, r: 0, o: 0.5, sp: 0 }, { g: Math.max(1.35, T.to + 0.8), x: 0, y: -34, s: 0.3, r: 0, o: 0.5, sp: 0 }, { g: Math.max(1.5, T.to + 1), x: 0, y: -34, s: 0.3, r: 0, o: 0, sp: 0 }]
      : T.behavior === 'mask'
        ? [{ g: 0, x: 0, y: 0, s: 1, r: 0, o: 0.9, sp: 0.4 }, { g: 0.3, x: 0, y: 0, s: 1, r: 0, o: 0.9, sp: 0 }, { g: T.to + 0.78, x: 0, y: 0, s: 1.08, r: 0, o: 0.9, sp: 0 }, { g: T.to + 0.92, x: 0, y: 0, s: 1.1, r: 0, o: 0, sp: 0 }]
        : [{ g: 0, x: 0, y: 6, s: 1.1, r: 0, o: 0.85, sp: 0 }, { g: T.to + 0.8, x: 8, y: -4, s: 0.8, r: 0, o: 0.6, sp: 0 }, { g: T.to + 1, x: 10, y: -10, s: 0.62, r: 0, o: 0, sp: 0 }];
    tl.actors.push({ id: 'typography', role: 'typography', kind: 'word', text: word, // (the name as an object is never louder than the page's own heading: a stroke when it breaks apart, a ghost behind)
      style: T.behavior === 'behind' ? 'ghost' : 'outline', behavior: T.behavior, from: T.from, to: T.to, ease: 'smooth', exit: 'fade', keys });
  }
  // a second actor on an immersive page with a second clean cut-out: it joins the primary for the end of its run,
  // entering from the other side, and leaves with it (it takes the place a background field would have had)
  const second = A && c.mode === 'immersive' && c.byId ? [...c.byId.values()].find(x => x && x.id !== A.asset && (x.cutout || (x.assess && x.assess.transparent)) && !(x.cutoutOf && x.cutoutOf === (c.byId.get(A.asset) || {}).cutoutOf) && x.id !== (c.byId.get(A.asset) || {}).cutoutOf && !(x.curation && (x.curation.role === 'unrelated' || x.curation.identity === 'other' || x.curation.identity === 'form'))) : null;
  if (second && A.to > A.from) {
    const from = A.to; const p = A.poses[A.poses.length - 1]; const side = p.x >= 0 ? -1 : 1;
    tl.actors.push({ id: 'secondary', role: 'secondary', kind: 'image', asset: second.id, from, to: A.to, ease: 'smooth', exit: A.exit === 'rejoin' ? 'rejoin' : 'fade',
      keys: [{ g: from - 0.35, x: side * 60, y: 6, s: 0.7, r: side * -6 * rot, o: 0 }, { g: from + 0.2, x: side * 22, y: 4, s: 0.78, r: side * -3 * rot, o: 1 }, { g: from + 0.85, x: side * 20, y: 4, s: 0.8, r: 0, o: 1 }, { g: A.to + 1.05, x: side * 8, y: 12, s: 0.45, r: 0, o: 0 }] });
  }
  const B = flow.cast.background;
  if (B && !(second && A && A.to > A.from)) {
    const keys = []; for (let k = B.from; k <= B.to; k++) keys.push({ g: k + 0.5, x: (k % 2 ? 12 : -12), y: (k % 2 ? -5 : 6), s: r2(1 + 0.25 * (k - B.from) + (['event', 'escalation'].includes(tl.rhythm[k]) ? 0.4 : 0)), r: k * 12, o: 0.55 });
    keys.push({ g: B.to + 1, x: 0, y: 0, s: 2.2, r: (B.to + 1) * 12, o: 0 });
    tl.actors.push({ id: 'background', role: 'background', kind: 'shape', shape: { form: 'glow', fill: 'accent' }, from: B.from, to: B.to, ease: 'smooth', exit: 'fade', keys });
  }
  // beats: what plays inside each scene, by its place in the rhythm -- events and escalations carry the big moves,
  // resting scenes at most a gentle one
  c.scenes.forEach((s, i) => {
    const has = { heading: !!s.text.heading, body: s.text.body && s.text.body.split(/\s+/).length >= 8, focal: s.layers.some(L => L.role === 'focal' && L.kind === 'image'), alt: !!s.text.alt, stage: s.layers.length > 0 };
    const add = b => { if (tl.beats.filter(x => x.scene === i).length < LIMITS.beatsPerScene) tl.beats.push(Object.assign({ scene: i }, b)); };
    const R = tl.rhythm[i]; const typed = ['giant-type', 'poster', 'campaign', 'takeover'].includes(s.layout);
    if (R === 'setup') { if (has.heading && !(T && T.from === 0)) add(typed && s.text.heading.length <= 18 && !calm ? { from: 0, to: 0.6, op: 'letter-spread', target: 'heading', dir: 'out' } : { from: 0, to: 0.7, op: 'translate', target: 'heading', dir: 'out', v: 0, v2: -8 }); return; }
    if (R === 'event' || R === 'escalation') {
      const withActor = !!(A && i >= A.from && i <= A.to + 1); const flood = withActor ? 'invert' : 'accent';
      if (!['campaign', 'splitscreen', 'chapters', 'takeover', 'cinematic', 'editorial-hero', 'image'].includes(s.layout) && c.mode !== 'editorial' && !s.tone) add(r() < 0.5 || R === 'escalation' ? { from: 0.05, to: 0.45, op: 'takeover', target: 'scene', dir: 'in', v: flood } : { from: 0.05, to: 0.4, op: 'background', target: 'scene', dir: 'in', v: flood });
      if (has.alt) add({ from: 0.4, to: 0.7, op: 'text-swap', target: 'heading', dir: 'in' });
      if (has.focal && s.layout !== 'chapters' && s.choreo !== 'expand') add(R === 'escalation' ? { from: 0, to: 0.5, op: 'scale', target: 'focal', dir: 'in', v: 0.88 } : { from: 0.1, to: 0.5, op: 'clip', target: 'focal', dir: 'in', v: 0.3 });
      else if (has.stage && R === 'escalation' && !calm) add({ from: 0, to: 0.55, op: 'depth-shift', target: 'stage', dir: 'in', v: 1.2 });
      return;
    }
    if (R === 'payoff') { if (has.focal) add({ from: 0.05, to: 0.5, op: 'clip', target: 'focal', dir: 'in', v: 0.2 }); else if (has.heading) add({ from: 0.05, to: 0.5, op: 'opacity', target: 'heading', dir: 'in', v: 0 }); return; }
    // rest: a statement fills in as it is read; otherwise the scene simply settles
    if (has.body && !['takeover'].includes(s.layout) && r() < 0.5) add({ from: 0, to: 0.6, op: 'word-fill', target: 'body', dir: 'in' });
  });
  return tl;
}
function defaultFlow(c) {
  return planFlow(c.rng || Math.random, { family: (c.art && c.art.family) || '', mode: c.mode, personality: c.personality, typo: c.art && c.art.typo, scenes: c.scenes.map(s => ({ layout: s.layout, choreo: s.choreo })), actor: c.actor ? { from: c.actor.from, to: c.actor.to } : null, shortName: !!(c.name && c.name.length <= 18 && c.name.split(/\s+/).length <= 3) });
}

// ---------------------------------------------------------------- validation: the only door into the renderer
// normalise(raw, ctx) -> { timeline, fixes }. ctx: { scenes (validated), mode, actor (validated plan.actor), byId,
// resCap(asset), safety }. The same rules in both modes: what the accept pass returns re-validates unchanged.
function normalise(raw, ctx) {
  const c = ctx || {}; const fixes = []; const n = c.scenes.length; const t = raw && typeof raw === 'object' ? raw : {};
  const mode = MODE_CAST[c.mode] ? c.mode : 'expressive'; const cast = MODE_CAST[mode];
  const rhythm = Array.from({ length: n }, (_, i) => oneOf((t.rhythm || [])[i], RHYTHM, i === 0 ? 'setup' : 'rest'));
  rhythm[0] = 'setup';
  // (setup -> event -> rest -> escalation -> payoff: never two events side by side)
  for (let i = 1; i < n; i++) if (['event', 'escalation'].includes(rhythm[i]) && ['event', 'escalation'].includes(rhythm[i - 1])) { rhythm[i] = 'rest'; fixes.push(`timeline: scene ${i + 1} rests (two events side by side lose both)`); }
  if (!cast.moments) for (let i = 1; i < n; i++) if (rhythm[i] !== 'rest') rhythm[i] = 'rest';
  // actors
  const actors = [];
  (Array.isArray(t.actors) ? t.actors : []).forEach(a => {
    if (!a || typeof a !== 'object') return; const role = oneOf(a.role, ROLES, ''); if (!role || actors.some(x => x.role === role)) return;
    if (!cast.roles.includes(role)) { fixes.push(`timeline: a ${mode} page has no ${role} actor`); return; }
    if (actors.length >= cast.actors) { fixes.push(`timeline: at most ${cast.actors} actor(s) on a ${mode} page`); return; }
    const kind = KINDS[role]; const out = { id: role, role, kind };
    if (role === 'primary') { if (!c.actor) { fixes.push('timeline: no primary actor without a validated actor picture'); return; } Object.assign(out, { asset: c.actor.asset, from: c.actor.from, to: c.actor.to }); }
    else {
      const from = Math.round(num(a.from, 0, n - 1, 0)); const to = Math.round(num(a.to, from, n - 1, from)); Object.assign(out, { from, to });
      if (role === 'secondary') { const img = c.byId && c.byId.get(a.asset); if (!img || !(img.cutout || (img.assess && img.assess.transparent)) || (c.actor && (a.asset === c.actor.asset))) { fixes.push('timeline: the secondary actor needs a second clean cut-out'); return; } out.asset = img.id; if (to - from > 1) out.to = from + 1; }
      if (role === 'typography') { const w = clean(a.text, 24); if (!w) return; out.text = w; out.style = oneOf(a.style, WORD_STYLES, 'outline'); out.behavior = oneOf(a.behavior, ['break', 'behind', 'mask'], 'behind'); }
      if (role === 'background') out.shape = { form: oneOf(a.shape && a.shape.form, SHAPES, 'glow'), fill: oneOf(a.shape && a.shape.fill, FILLS, 'accent') };
    }
    out.ease = oneOf(a.ease, EASES, 'smooth'); out.exit = oneOf(a.exit, EXITS, 'fade');
    const b = BOUNDS[kind]; const cap = kind === 'image' && c.resCap ? Math.min(b.s[1], c.resCap(out.asset)) : b.s[1];
    const lo = out.from - 0.5, hi = out.to + 1.1;
    const seen = new Set(); let keys = [];
    (Array.isArray(a.keys) ? a.keys : []).slice(0, 40).forEach(k => {
      if (!k || typeof k !== 'object' || typeof k.g !== 'number' || !isFinite(k.g)) return; const g = q05(num(k.g, lo, hi, lo)); if (seen.has(g)) return; seen.add(g);
      const key = { g, x: Math.round(num(k.x, b.x[0], b.x[1], 0)), y: Math.round(num(k.y, b.y[0], b.y[1], 0)), s: Math.floor(num(k.s, b.s[0], cap, Math.min(1, cap)) * 100 + 1e-6) / 100, r: Math.round(num(k.r, b.r[0], b.r[1], 0)), o: r2(num(k.o, 0, 1, 1)) };
      if (kind === 'word') key.sp = r2(num(k.sp, 0, 1, 0));
      keys.push(key);
    });
    keys.sort((p, q) => p.g - q.g); keys = keys.slice(0, LIMITS.keys);
    if (keys.length < 2) { fixes.push(`timeline: the ${role} actor needs at least two keyframes`); return; }
    // continuity: inside its run an actor never fades out and back in (a respawn) -- it stays on stage
    keys.forEach(k => { if (k.g > out.from + 0.2 && k.g < out.to + 0.8 && k.o < 0.5 && role !== 'background') { k.o = 1; fixes.push(`timeline: the ${role} actor stays visible through its run`); } });
    // and it never jumps: two keys closer than a tenth of a scene cannot be far apart
    for (let i = 1; i < keys.length; i++) { const A = keys[i - 1], B = keys[i]; if (B.g - A.g < 0.1 && (Math.abs(B.x - A.x) > 12 || Math.abs(B.s - A.s) > 0.3)) { B.x = A.x; B.y = A.y; B.s = A.s; fixes.push(`timeline: the ${role} actor does not jump between two close keys`); } }
    out.keys = keys; actors.push(out);
  });
  // beats
  const beats = []; const scene = i => c.scenes[i];
  (Array.isArray(t.beats) ? t.beats : []).slice(0, 40).forEach(b => {
    if (!b || typeof b !== 'object') return; const i = Math.round(num(b.scene, -1, n - 1, -1)); if (i < 0) return; const s = scene(i);
    const op = oneOf(b.op, OPS, ''); if (!op) return; const target = oneOf(b.target, OP_TARGETS[op], ''); if (!target) return;
    if (beats.filter(x => x.scene === i).length >= LIMITS.beatsPerScene || beats.length >= LIMITS.beats) return;
    if (beats.some(x => x.scene === i && x.target === target && (x.op === op || (VALUE[x.op] && VALUE[op] && prop(x.op) === prop(op))))) return;
    if (INTENSE.includes(op) && !['event', 'escalation', 'payoff', 'setup'].includes(rhythm[i])) { fixes.push(`timeline: scene ${i + 1} rests -- its ${op} is left out`); return; }
    if (mode === 'quiet' && INTENSE.includes(op)) return;
    // the element must exist
    const focal = s.layers.some(L => L.role === 'focal' && L.kind === 'image');
    if ((target === 'focal' && !focal) || (target === 'body' && !s.text.body) || (target === 'heading' && !s.text.heading) || (op === 'text-swap' && !s.text.alt) || (target === 'stage' && !s.layers.length)) return;
    const owns = CHOREO_OWNS[s.choreo] || []; if (owns.includes(target + ':' + prop(op)) || (op === 'clip' && owns.includes('focal:clip'))) return;
    if ((op === 'word-fill' && s.text.treatment === 'word-fill') || (op === 'letter-spread' && s.text.treatment === 'letter-spread')) return;
    if (op === 'crossfade' && !s.layers.some(L => L.kind === 'image' && L.role !== 'focal' && L.role !== 'texture')) return;
    let from = q05(num(b.from, 0, 0.9, 0)), to = q05(num(b.to, from + 0.1, 1, Math.min(1, from + 0.4)));
    if (to - from < 0.1) to = Math.min(1, from + 0.1);
    const out = { scene: i, from, to, op, target, dir: oneOf(b.dir, ['in', 'out'], 'in') };
    if (VALUE[op]) { out.v = r2(num(b.v, VALUE[op][0], VALUE[op][1], op === 'scale' ? 0.92 : op === 'opacity' ? 0 : op === 'depth-shift' ? 1 : op === 'clip' ? 0.3 : 0)); if (op === 'translate') out.v2 = r2(num(b.v2, VALUE.translate[0], VALUE.translate[1], 0)); }
    if (op === 'background' || op === 'takeover') out.v = oneOf(b.v, BG_VALUES, 'accent');
    if (['background', 'takeover', 'word-fill', 'text-swap'].includes(op)) out.dir = 'in';
    beats.push(out);
  });
  // simultaneous motion: a scene holds at most three moving things (its choreography, its beats, the actors on stage) --
  // the beats give way first
  for (let i = 0; i < n; i++) {
    const s = scene(i); const onStage = actors.filter(a => a.role !== 'background' && i >= a.from && i <= a.to).length;
    const base = (s.choreo && s.choreo !== 'settle' && s.choreo !== 'actor' ? 1 : 0) + onStage;
    let mine = beats.filter(b => b.scene === i);
    while (mine.length && base + mine.length > LIMITS.moving) { const drop = mine[mine.length - 1]; beats.splice(beats.indexOf(drop), 1); mine = mine.slice(0, -1); fixes.push(`timeline: scene ${i + 1} already has ${base} moving thing(s) -- its ${drop.op} is left out`); }
  }
  // transitions
  const transitions = []; let signature = 0;
  for (let at = 1; at < n; at++) {
    const want = oneOf(((Array.isArray(t.transitions) ? t.transitions : []).find(x => x && x.at === at) || {}).family, TRANSITIONS, 'color-bleed');
    let fam = want; const prev = scene(at - 1), next = scene(at);
    const bleedable = s => s.layers.some(L => L.kind === 'image' && (L.frame === 'bleed' || (L.box && L.box.d[2] >= 99 && L.box.d[3] >= 99)));
    const focalOf = s => s.layers.find(L => L.role === 'focal' && L.kind === 'image');
    const ok = {
      'actor-carry': actors.some(a => (a.role === 'primary' || a.role === 'secondary') && a.from <= at - 1 && a.to >= at),
      'image-expand': !!focalOf(next), 'card-expand': ['cardstream', 'index', 'gallery', 'strip'].includes(prev.layout) && !!focalOf(next),
      'type-mask': !!focalOf(next) && bleedable(next) && actors.some(a => a.role === 'typography' && a.to === at - 1),
      'depth-handoff': !!focalOf(prev), 'foreground-wipe': true, 'shape-takeover': true, 'color-bleed': true, cut: true,
    };
    if (!ok[fam]) { fixes.push(`timeline: the ${fam} into scene ${at + 1} has nothing to work with -- it bleeds instead`); fam = 'color-bleed'; }
    if (SIGNATURE.includes(fam)) { if (signature >= cast.signature) { fixes.push(`timeline: a ${mode} page keeps its signature transitions to ${cast.signature}`); fam = 'color-bleed'; } else signature++; }
    transitions.push({ at, family: fam });
  }
  // moments
  const moments = [];
  (Array.isArray(t.moments) ? t.moments : []).forEach(m => {
    if (!m || typeof m !== 'object' || moments.length >= Math.min(LIMITS.moments, cast.moments)) return; const i = Math.round(num(m.scene, -1, n - 1, -1)); if (i < 0 || moments.some(x => x.scene === i)) return;
    const kind = oneOf(m.kind, MOMENTS, ''); if (!kind) return;
    if (i > 0 && rhythm[i] === 'rest') { rhythm[i] = moments.some(x => x.scene > 0) ? 'escalation' : 'event'; if (['event', 'escalation'].includes(rhythm[i - 1]) || ['event', 'escalation'].includes(rhythm[i + 1] || '')) { rhythm[i] = 'rest'; return; } }
    moments.push(Object.assign({ scene: i, kind }, m.label ? { label: clean(m.label, 60) } : {}));
  });
  moments.sort((a, b) => a.scene - b.scene);
  // what the motion needed from the pictures, and whether this page had it (shown to the owner; never a claim)
  const needs = (Array.isArray(t.needs) ? t.needs : []).slice(0, 10).map(x => x && typeof x === 'object' ? { need: oneOf(x.need, ['cutout', 'bleed', 'layers', 'detail', 'transparent', 'alternate', 'environment', 'foreground', 'model'], ''), for: clean(x.for, 100), met: clean(x.met, 40) } : null).filter(x => x && x.need);
  const tl = { v: 1, renderer: oneOf(t.renderer, RENDERERS, 'dom'), actors, beats, transitions, rhythm, moments, ...(needs.length ? { needs } : {}) };
  // why the page has its renderer, and the spatial tier's own fields -- a spatial block that no longer holds anything
  // spatial makes the page DOM again
  if (Array.isArray(t.why)) tl.why = SP.cleanWhy(t.why);
  if (tl.renderer === 'spatial') { const sp = SP.normalise(t.spatial, { scenes: c.scenes, timeline: tl, byId: c.byId, models: c.models }); if (sp) tl.spatial = sp; else { tl.renderer = 'dom'; fixes.push('timeline: nothing on this page needs the spatial renderer -- it is drawn as DOM'); } }
  tl.behavior = behavior(tl, c.art);
  return { timeline: tl, fixes };
}
// the properties each scene choreography already drives: a beat never fights them (one owner per property per element)
const CHOREO_OWNS = { 'zoom-away': ['focal:scale'], 'scale-through': ['focal:scale', 'focal:translate'], travel: ['focal:translate', 'focal:rotate'], depth: ['focal:translate', 'stage:translate', 'heading:translate'], 'mask-reveal': ['focal:clip'], expand: ['focal:clip', 'focal:scale'], 'type-wipe': ['heading:translate', 'heading:clip'], chapters: ['focal:scale', 'focal:opacity', 'focal:clip'], cardstream: ['focal:scale', 'focal:translate', 'focal:opacity'], track: ['stage:translate'], stack: ['focal:translate', 'focal:scale'], 'pin-steps': ['focal:opacity'] };
// (two beats that drive the same CSS property of the same element would fight: one each)
function prop(op) { return { translate: 'translate', 'depth-shift': 'translate', scale: 'scale', rotate: 'rotate', perspective: 'rotate', opacity: 'opacity', crossfade: 'opacity', clip: 'clip' }[op] || op; }

// how many things move at once in a scene (for the budgets and the tests)
function movingIn(tl, i, sc) { return (sc && sc.choreo && sc.choreo !== 'settle' && sc.choreo !== 'actor' ? 1 : 0) + (tl.actors || []).filter(a => a.role !== 'background' && i >= a.from && i <= a.to).length + (tl.beats || []).filter(b => b.scene === i).length; }

module.exports = { CHOREO_OWNS, ROLES, KINDS, OPS, OP_TARGETS, INTENSE, TRANSITIONS, SIGNATURE, MOMENTS, RHYTHM, EASES, EXITS, RENDERERS, MODE_CAST, LIMITS, BOUNDS, VALUE, EASE, stateAt, sceneStates, planFlow, momentFor, behavior, parseBehavior, behaviorSimilarity, motionIntent, assetNeeds, compose, normalise, movingIn };
