'use strict';
// CREATIVE — the premium arc (shared: server, studio bundle, tests).
//
// Premium video is not an asset inside a layout: it is the visual surface of the page. A generation plans its premium
// moments BEFORE anything paid runs and before the scenes are composed -- the page is built around them:
//   standard   one premium event  (the hero)                                          -- the default
//   cinematic  up to two          (hero, takeover)                                    -- asked for explicitly
//   showcase   up to three        (hero, takeover, payoff -- one visual arc)          -- SiteRemade's own showcase builds and
//                                                                                        explicitly high-ambition requests
// Each event has a different job (the hero hooks and sets palette, subject, camera and scale; the takeover escalates --
// another environment, angle, scale or intensity -- and replaces the whole surface; the payoff returns to the hero and
// concludes), a full-viewport composition, a source picture from the approved pool, and an explicit continuation: what
// survives into the next scene (subject, colour, motion) and how the clip becomes it. Everything is a fixed vocabulary;
// a model may choose among it, never a provider parameter.
//
//   STRATEGIES, ROLES, strategyFor(brief, asked)          the premium strategy for a generation (deterministic)
//   eventsFor(strategy)                                    the roles a strategy plans, in order
//   pickSources(roles, pool, eligible, mainId)             a source picture per event (a different one for the takeover)
//   sceneFor(role, n, arc)                                 where each event sits in the page
//   normalise(raw, ctx)                                    the plan's premiumArc, validated against its scenes
//   attach(assets, delivered)                              delivered clips onto the page's pictures (studio)
//   retune(plan, role, measured)                           the page re-tuned to a delivered clip (studio)
//   audit(plan, byId) / metrics(plan, byId)                the showcase rules and numbers

const PAL = require('./palette');

const STRATEGIES = { standard: { events: 1 }, cinematic: { events: 2 }, showcase: { events: 3 } };
const STRATEGY_NAMES = Object.keys(STRATEGIES);
const ROLES = ['hero', 'takeover', 'payoff'];
// the premium-media intent each role is made with (lib/media/premium-media.js INTENTS -- its fixed prompt and preset)
const ROLE_INTENT = { hero: 'cinematic_hero', takeover: 'premium_transition', payoff: 'cinematic_hero' };
const VIDEO_INTENTS = ['cinematic_hero', 'image_to_video', 'object_motion', 'environment_motion', 'premium_transition'];
// what each event is for, how it moves, what it does to the palette (bounded choices a director may make)
const PURPOSES = ['hook', 'escalate', 'change-world', 'change-angle', 'change-scale', 'intensify', 'return', 'resolve'];
const MOTIONS = ['push-in', 'pull-back', 'pan', 'orbit', 'rise', 'drift', 'hold'];
const PALETTES = ['establish', 'shift', 'contrast', 'return'];
// how a clip becomes the next scene: the final frame freezes and the subject stays while the world changes behind it; the
// camera pushes through it and the next picture arrives as a depth plane; it settles on its last frame (the page ends)
const CONTINUATIONS = ['freeze-subject', 'push-through', 'settle'];
const DEFAULT = {
  hero: { purpose: 'hook', motion: 'push-in', palette: 'establish', continuation: 'freeze-subject' },
  takeover: { purpose: 'escalate', motion: 'pan', palette: 'shift', continuation: 'push-through' },
  payoff: { purpose: 'return', motion: 'pull-back', palette: 'return', continuation: 'settle' },
};
// the compositions each event may be staged on: the clip owns the viewport (a window that opens to full screen, a split
// that becomes the whole surface -- smaller only while the animation takes it INTO the full screen)
const COMPOSITIONS_FOR = { hero: ['fullscreen-subject', 'cinematic-chapter'], takeover: ['image-takeover', 'fullscreen-subject', 'cinematic-chapter', 'depth-stack'], payoff: ['fullscreen-subject', 'cinematic-chapter'] };
// the seams a continuation asks for, in order (continuity.js chooseSeams reads them)
const SEAMS_OUT = { 'freeze-subject': ['depth-handoff', 'image-expand'], 'push-through': ['depth-handoff', 'image-expand'], settle: [] };
const SEAMS_IN = { takeover: ['image-expand', 'depth-handoff'], payoff: ['image-expand', 'depth-handoff'] };

// ---------------------------------------------------------------- the strategy
// (explicit words only: three clips cost real money, so a showcase is never inferred from a mood)
const ASK = {
  showcase: /\b(showcase(?: build| mode| page| site)?|demo build|social demo|launch reel|premium showcase|full[- ]premium|three (?:premium|cinematic|hero) (?:videos|clips|moments|shots)|3 (?:premium|cinematic) (?:videos|clips|moments))\b/i,
  cinematic: /\b(two (?:premium|cinematic) (?:videos|clips|moments)|2 (?:premium|cinematic) (?:videos|clips)|(?:cinematic|premium|video) takeover|multiple (?:premium|cinematic) videos)\b/i,
};
// strategyFor(brief, asked) -> { strategy, why }. asked: an explicit strategy from the request (a studio control or
// SiteRemade's own build tooling); otherwise the brief's own words; otherwise standard.
function strategyFor(brief, asked) {
  if (STRATEGY_NAMES.includes(asked)) return { strategy: asked, why: 'asked for' };
  const t = String(brief || '');
  if (ASK.showcase.test(t)) return { strategy: 'showcase', why: 'the brief asks for a showcase' };
  if (ASK.cinematic.test(t)) return { strategy: 'cinematic', why: 'the brief asks for a cinematic takeover' };
  return { strategy: 'standard', why: '' };
}
function eventsFor(strategy) { return ROLES.slice(0, (STRATEGIES[strategy] || STRATEGIES.standard).events); }

// ---------------------------------------------------------------- sources
// pickSources(roles, pictures, eligible, mainId) -> { role: id }. pictures: the pool's pictures in order ({ id, bleed?,
// role?, colour? }); eligible(id) -> whether the picture may be transformed (premium-media.js sourceEligibility). The hero
// starts from the main picture when it may; the takeover from ANOTHER strong picture when there is one (an environment, a
// wide picture, a different colour -- the escalation changes the world); the payoff returns to the hero's picture.
function pickSources(roles, pictures, eligible, mainId) {
  const ok = (pictures || []).filter(p => p && eligible(p.id)); if (!ok.length) return {};
  const hero = ok.find(p => p.id === mainId) || ok[0];
  const out = { hero: hero.id };
  if (roles.includes('takeover')) {
    const rank = p => (p.bleed ? 2 : 0) + (p.role === 'environment' ? 1.5 : 0) + (p.colour && hero.colour && p.colour !== hero.colour ? 0.5 : 0);
    const other = ok.filter(p => p.id !== hero.id).sort((a, b) => rank(b) - rank(a))[0];
    out.takeover = (other || hero).id;
  }
  if (roles.includes('payoff')) out.payoff = hero.id;
  return out;
}
// where each event sits: the hero opens, the payoff closes, the takeover is the page's takeover beat (else past the middle,
// never next to the hero)
function sceneFor(role, n, arc) {
  if (role === 'hero') return 0;
  if (role === 'payoff') return n - 1;
  // (with room for it, a breath scene between the takeover and the payoff: the page lands before it concludes)
  const hi = lastTakeover(n); const t = (arc || []).indexOf('takeover'); if (t > 1 && t <= hi) return t;
  return Math.max(2, Math.min(hi, Math.round((n - 1) * 0.55)));
}
function lastTakeover(n) { return n >= 7 ? n - 3 : n - 2;
}

// ---------------------------------------------------------------- the plan's premium arc
const oneOf = (v, list, d) => (list.includes(v) ? v : d);
// normalise(raw, ctx) -> [{ role, intent, asset, scene, composition, purpose, motion, palette, continuation, callback?,
// next? }] -- ctx: { scenes (validated), byId, planned: [{ role, asset }] (the events the generation may make, with their
// sources), max }. A model may move an event's purpose, motion or palette within the vocabulary and choose its
// composition from the role's list; it may not add an event the quote did not plan, change its role, or name a picture
// that is not the planned source (or, when none was planned, an eligible picture already on the page).
function normalise(raw, ctx) {
  const c = ctx || {}; const n = (c.scenes || []).length; const max = Math.min(3, c.max == null ? 3 : c.max);
  const given = Array.isArray(raw) ? raw : []; const planned = Array.isArray(c.planned) ? c.planned : [];
  const out = []; const used = new Set();
  ROLES.forEach(role => {
    if (out.length >= max) return;
    const p = planned.find(x => x && x.role === role); const g = given.find(x => x && x.role === role) || {};
    if (!p && !(planned.length === 0 && g.role === role)) return;
    const asset = (p && p.asset) || (c.byId && c.byId.get(g.asset) ? g.asset : '');
    if (!asset || !c.byId || !c.byId.get(asset)) return;
    let scene = Number.isInteger(g.scene) && g.scene >= 0 && g.scene < n ? g.scene : Number.isInteger(p && p.scene) ? p.scene : sceneFor(role, n, c.arc);
    if (role === 'hero') scene = 0; if (role === 'payoff') scene = n - 1;
    if (used.has(scene) || (role === 'takeover' && (scene < 2 || scene > lastTakeover(n)))) scene = sceneFor(role, n, c.arc);
    if (used.has(scene) || scene < 0 || scene >= n) return; used.add(scene);
    const d = DEFAULT[role]; const comp = (c.scenes[scene] && c.scenes[scene].composition) || '';
    out.push({ role, intent: oneOf(p && p.intent, VIDEO_INTENTS, ROLE_INTENT[role]), asset, scene,
      composition: COMPOSITIONS_FOR[role].includes(g.composition) ? g.composition : COMPOSITIONS_FOR[role].includes(comp) ? comp : COMPOSITIONS_FOR[role][0],
      purpose: oneOf(g.purpose, PURPOSES, d.purpose), motion: oneOf(g.motion, MOTIONS, d.motion), palette: oneOf(g.palette, PALETTES, d.palette), continuation: d.continuation,
      ...(role === 'payoff' ? { callback: true } : {}),
      ...(g.measured && typeof g.measured === 'object' ? { measured: measuredOf(g.measured) } : {}) });
  });
  // the takeover must escalate: never the hero's own job again (a different purpose from the hook)
  const t = out.find(e => e.role === 'takeover'); if (t && t.purpose === 'hook') t.purpose = 'escalate';
  return out;
}
const HEX = /^#[0-9a-f]{6}$/i;
const SIDES = ['left', 'right', 'centre'];
const MOTION_V = ['lr', 'rl', 'in', 'out', 'none'];
function measuredOf(m) {
  const o = {};
  if (HEX.test(m.cast || '')) o.cast = m.cast.toLowerCase(); if (HEX.test(m.accent || '')) o.accent = m.accent.toLowerCase();
  if (typeof m.brightness === 'number' && isFinite(m.brightness)) o.brightness = Math.round(Math.max(0, Math.min(1, m.brightness)) * 100) / 100;
  if (MOTION_V.includes(m.motion)) o.motion = m.motion; if (SIDES.includes(m.side)) o.side = m.side;
  return o;
}

// ---------------------------------------------------------------- delivered clips onto the page (studio)
// attach(assets, delivered) -> { assets, byRole: { role: assetId } }. delivered: [{ role, sourceAssetId, video, premium }].
// A clip goes on its source picture; when that picture already carries another event's clip (the payoff starts from the
// hero's picture), the clip goes on a copy of the picture made for it -- one picture, one clip, every event its own.
function attach(assets, delivered) {
  const list = (assets || []).slice(); const byRole = {}; const taken = new Set(list.filter(a => a && a.video && a.video.role).map(a => a.id));
  (delivered || []).forEach(m => {
    if (!m || !m.video) return; const src = list.find(a => a && a.id === m.sourceAssetId); if (!src) return;
    const role = ROLES.includes(m.role) ? m.role : 'hero'; const v = Object.assign({}, m.video, { role });
    if (!src.video || src.video.role === role || !taken.has(src.id)) { Object.assign(src, { video: v, premium: m.premium }); taken.add(src.id); byRole[role] = src.id; return; }
    const id = `pv-${role}-${src.id}`.slice(0, 40);
    const copy = Object.assign({}, src, { id, origin: 'derived', derivedFrom: src.id, title: `${src.title || src.id} (${role} video)`, video: v, premium: m.premium });
    delete copy.cutoutOf;
    const at = list.findIndex(a => a && a.id === id); if (at >= 0) list[at] = copy; else list.push(copy);
    byRole[role] = id;
  });
  return { assets: list, byRole };
}
// the plan's events point at the picture that carries their clip (the copy, when one was made)
function repoint(plan, byRole) {
  if (!plan || !Array.isArray(plan.premiumArc)) return plan; const p = JSON.parse(JSON.stringify(plan));
  p.premiumArc.forEach(e => { const id = byRole && byRole[e.role]; if (!id || id === e.asset) return; const sc = p.scenes[e.scene]; const f = sc && sc.layers.find(L => L.kind === 'image' && L.role === 'focal'); if (f && (f.asset === e.asset || (f.asset || '').includes(e.asset))) f.asset = id; e.asset = id; });
  return p;
}

// ---------------------------------------------------------------- a delivered clip retunes the page (studio)
// retune(plan, role, measured) -> plan. measured: { cast, accent, brightness, motion, side } (measured from two frames in
// the browser). The event records it; its scene takes the clip's colour (the next two lean into it); a clip whose subject
// sits on the words' side moves the words to the other side; the motion leads the next two cameras (render2, continuity).
function retune(plan, role, measured) {
  if (!plan || !Array.isArray(plan.premiumArc)) return plan; const p = JSON.parse(JSON.stringify(plan));
  const e = p.premiumArc.find(x => x.role === role); if (!e) return plan; const m = measuredOf(measured || {}); e.measured = Object.assign({}, e.measured || {}, m);
  const n = p.scenes.length;
  if (m.cast) { const lean = [0, 0.55, 0.3]; for (let k = 0; k < 3 && e.scene + k < n; k++) { const s = p.scenes[e.scene + k]; if (!s.tone && k) continue; s.tone = k ? PAL.mix(s.tone, PAL.tone(m.cast, p.palette), lean[k]) : PAL.tone(m.cast, p.palette); } }
  const sc = p.scenes[e.scene]; const t = sc && sc.text; const pl = t && t.place;
  if (pl && Array.isArray(pl.gc) && (m.side === 'left' || m.side === 'right')) {
    const textSide = (pl.gc[0] + pl.gc[1]) / 2 < 6.5 ? 'left' : 'right';
    if (textSide === m.side && pl.gc[1] - pl.gc[0] < 9) { pl.gc = [13 - pl.gc[1], 13 - pl.gc[0]]; pl.align = pl.align === 'left' ? 'right' : pl.align === 'right' ? 'left' : pl.align; if (t.shade === 'left' || t.shade === 'right') t.shade = t.shade === 'left' ? 'right' : 'left'; }
  }
  // (a bright clip keeps its words readable: a soft shade under them, on the words' own side)
  if (t && typeof m.brightness === 'number' && m.brightness >= 0.6 && !t.shade) t.shade = pl && Array.isArray(pl.gc) && pl.gc[1] - pl.gc[0] < 9 ? ((pl.gc[0] + pl.gc[1]) / 2 < 6.5 ? 'left' : 'right') : 'bottom';
  return p;
}

// ---------------------------------------------------------------- the showcase rules
// audit(plan, byId) -> [{ code, at }]: for a page with premium events (every rule; a page without them -> [])
const AUDIT = ['premium-hero-not-fullscreen', 'premium-takeover-not-dominant', 'premium-payoff-not-dominant', 'premium-in-card', 'premium-in-split', 'premium-no-continuation', 'premium-same-job', 'premium-no-escalation', 'premium-no-payoff', 'premium-palette-disconnect', 'premium-hard-reset', 'premium-copy-heavy', 'too-many-sections'];
const SPLIT = ['split', 'framed', 'magazine', 'splitscreen', 'image', 'edge-crop', 'luxe', 'sticky-steps'];
const CARD = ['window', 'frame', 'polaroid', 'arch', 'circle', 'torn', 'blob', 'diamond', 'slit', 'porthole'];
// how much of the screen an event's picture covers (its focal box on desktop, %)
function coverage(s) { const f = s && (s.layers || []).find(L => L.kind === 'image' && L.role === 'focal'); if (!f || !f.box) return 0; return Math.round(f.box.d[2] * f.box.d[3]) / 100; }
function audit(plan, byId) {
  const A = (plan && plan.premiumArc) || []; if (!A.length) return []; const scenes = plan.scenes || []; const out = []; const add = (code, at) => { if (!out.some(x => x.code === code && x.at === at)) out.push({ code, at }); };
  const K = (plan.timeline && plan.timeline.continuity && plan.timeline.continuity.contracts) || [];
  A.forEach(e => {
    const s = scenes[e.scene]; if (!s) return; const cov = coverage(s); const f = s.layers.find(L => L.kind === 'image' && L.role === 'focal');
    if (cov < 80) add(e.role === 'hero' ? 'premium-hero-not-fullscreen' : e.role === 'takeover' ? 'premium-takeover-not-dominant' : 'premium-payoff-not-dominant', e.scene);
    // (a card or a split: the clip framed as a box, or set beside copy -- whatever the scene's composition calls itself)
    if (f && (CARD.includes(f.mask) || (CARD.includes(s.layout) && cov < 80))) add('premium-in-card', e.scene);
    if (SPLIT.includes(s.layout) && (!s.composition || !COMPOSITIONS_FOR[e.role].includes(s.composition) || cov < 80)) add('premium-in-split', e.scene);
    if (e.role !== 'payoff') { const k = K.find(x => x.at === e.scene + 1); if (k && (k.family === 'cut' || k.intent === 'reset')) add('premium-hard-reset', e.scene + 1); else if (k && !(k.family !== 'color-bleed' || k.carry !== 'none' || k.paletteHandoff === 'hold')) add('premium-no-continuation', e.scene + 1); }
    const t = s.text || {}; if ((t.body || '').length > 160 && t.copy !== 'caption') add('premium-copy-heavy', e.scene);
    if ((t.items || []).length > 3 && t.role === 'reading') add('premium-copy-heavy', e.scene);
    // (the clip's colour belongs to the page: a palette that jumps away from it on both sides is disconnected)
    const near = [scenes[e.scene - 1], scenes[e.scene + 1]].filter(Boolean).map(x => (x.ink && x.ink.surface) || x.tone || '');
    const mine = (e.measured && e.measured.cast) || (s.ink && s.ink.surface) || '';
    if (mine && near.length && near.every(h => h && dist(h, mine) > 230)) add('premium-palette-disconnect', e.scene);
  });
  if (A.length >= 2) {
    // (the same job: every clip staged, moved and sourced alike -- or two of them given the same purpose)
    const same = (A.every(e => e.composition === A[0].composition) && A.every(e => e.motion === A[0].motion) && A.every(e => e.asset === A[0].asset)) || A.some((e, i) => A.some((x, j) => j > i && x.purpose === e.purpose));
    if (same) add('premium-same-job', A[A.length - 1].scene);
    const t = A.find(e => e.role === 'takeover'); if (t && (t.purpose === 'hook' || t.purpose === 'return' || t.scene <= 1)) add('premium-no-escalation', t.scene);
  }
  if (A.length === 3) { const p = A.find(e => e.role === 'payoff'); if (!p || p.scene !== scenes.length - 1 || !p.callback) add('premium-no-payoff', scenes.length - 1); }
  // a showcase page is visual: conventional content sections (a picture beside copy, words alone) are the exception
  const sections = scenes.filter(s => !s.composition && (SPLIT.includes(s.layout) || ['text', 'dense', 'brutalist', 'magazine'].includes(s.layout))).length;
  if (A.length >= 3 && sections > Math.max(1, Math.floor(scenes.length / 4))) add('too-many-sections', scenes.findIndex(s => !s.composition && SPLIT.includes(s.layout)));
  return out;
}
function dist(a, b) { const p = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)); if (!HEX.test(a) || !HEX.test(b)) return 0; const x = p(a), y = p(b); return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]); }

// metrics(plan) -> the premium arc in numbers (QA and the report)
function metrics(plan) {
  const A = (plan && plan.premiumArc) || []; const scenes = (plan && plan.scenes) || []; const K = (plan && plan.timeline && plan.timeline.continuity && plan.timeline.continuity.contracts) || [];
  const span = e => { if (!e) return 0; let k = 0; for (let i = e.scene + 1; i < scenes.length && i <= e.scene + 3; i++) { const c = K.find(x => x.at === i); if (c && (c.paletteHandoff === 'hold' || (c.motionVector && c.motionVector !== 'none') || c.carry !== 'none' || c.family !== 'color-bleed')) k++; else break; } return k; };
  return { events: A.length, roles: A.map(e => e.role), coverage: A.map(e => coverage(scenes[e.scene])), inCards: A.filter(e => { const f = (scenes[e.scene] || { layers: [] }).layers.find(L => L.kind === 'image' && L.role === 'focal'); return f && CARD.includes(f.mask); }).length,
    hardResetsAfter: A.filter(e => { const k = K.find(x => x.at === e.scene + 1); return k && k.family === 'cut'; }).length, heroSpan: span(A.find(e => e.role === 'hero')), takeoverSpan: span(A.find(e => e.role === 'takeover')),
    payoffReferencesOpening: !!(A.find(e => e.role === 'payoff') && (A.find(e => e.role === 'payoff').callback)) || !!(plan && plan.timeline && plan.timeline.continuity && plan.timeline.continuity.callback), sources: [...new Set(A.map(e => e.asset))].length };
}

module.exports = { STRATEGIES, STRATEGY_NAMES, ROLES, ROLE_INTENT, VIDEO_INTENTS, PURPOSES, MOTIONS, PALETTES, CONTINUATIONS, DEFAULT, COMPOSITIONS_FOR, SEAMS_OUT, SEAMS_IN, AUDIT,
  strategyFor, eventsFor, pickSources, sceneFor, normalise, attach, repoint, retune, audit, metrics, coverage };
