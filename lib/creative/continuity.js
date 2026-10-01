'use strict';
// CREATIVE — continuity: the page as ONE directed experience, not a row of animated sections.
//
// The timeline (timeline.js) already moves actors on one scroll axis, so an actor ends a scene exactly where it starts
// the next. This module plans every SEAM between two scenes as a contract, from the pictures the page actually uses:
//
//   assetProfiles(plan, byId)        -> what each USED picture is like (subject position, negative space, dominant
//                                       colour, crop tolerance, orientation, visual weight, carryability, video)
//   seamFit(plan, byId)              -> how well each pair of neighbouring scenes' pictures can hand over
//   normalise(raw, ctx)              -> { continuity, fixes }: the ONLY door. Every value from a fixed vocabulary or a
//                                       bounded number; every state DERIVED from the validated timeline and layout (the
//                                       model chooses what happens at a seam, never the numbers), so the outgoing state
//                                       of scene N is, by construction, the incoming state of scene N+1
//   feasibleFamilies(at, ctx)        -> the transitions a seam can carry (the same rules as timeline.normalise)
//   apply(plan, continuity)          -> { timeline (raw), handoffs }: the contracts written onto the timeline (families,
//                                       an actor's overlap window, the hero's handoff, calmer beats where asked)
//   critique(plan, byId)             -> [{ code, at }]: hard resets, unrelated swaps, dead gaps, competing motion,
//                                       duplicate motion, disconnected seams, a pasted-in hero video, no rest
//   fixesFor(issues, plan)           -> the built-in fix for each finding (used when the critic is off or fails)
//   withFixes(continuity, fixes)     -> a raw continuity with fixes folded in
//
// Data only (browser-safe, bundled into creative-core.js): no JS, CSS or HTML ever comes from a model. The renderer
// (render2.js) reads the validated contracts: seam windows, the window a picture opens from, the backdrop's handoff, the
// typography's depth, the hero video's end.

const TL = require('./timeline');
const FR = require('./framing');
const PAL = require('./palette');

const INTENTS = ['carry', 'continue', 'rest', 'reset'];
const CARRIED = ['none', 'primary', 'secondary', 'typography', 'background'];
const DEPTHS = ['same', 'over', 'under', 'through'];
const MASKS = ['none', 'inset', 'circle', 'type', 'wipe'];
const BACKGROUNDS = ['blend', 'carry', 'flood', 'expand'];
const TYPOGRAPHY = ['none', 'front', 'behind', 'mask'];
const CAMERAS = ['none', 'push', 'pull', 'pan', 'depth'];
const VIDEO_ENDS = ['subject-centred', 'detail-crop', 'static-frame'];
const VIDEO_INTENTS = ['cinematic_hero', 'image_to_video', 'object_motion', 'environment_motion'];
const CRITIC = ['hard-reset', 'unrelated-swap', 'dead-gap', 'competing-motion', 'duplicate-motion', 'disconnected', 'pasted-video', 'no-rest', 'too-quiet', 'same-direction', 'same-scale', 'no-payoff'];
const SOURCES = ['built-in', 'ai', 'mock'];
// a seam's overlap, in scenes, around the seam (g = at): the outgoing scene is still leaving while the incoming one
// arrives -- never "ends, empty gap, starts", never a pile-up
const OVERLAP = { from: [-0.6, -0.15], to: [0, 0.3], min: 0.25, max: 0.8 };
const LIMITS = { assets: 12, fixes: 6, spatial: 3, issues: 8, thumbs: 6, moving: TL.LIMITS.moving + 1, resets: 1 };
const CARDS = ['cardstream', 'index', 'gallery', 'strip'];

// what each family may be (the first value is its default)
const FAMILY = {
  'actor-carry': { depth: ['over', 'same'], mask: ['none'], background: ['blend', 'carry'], camera: ['none', 'pan'], overlap: [-0.3, 0.3] },
  'image-expand': { depth: ['same', 'over'], mask: ['inset', 'circle'], background: ['expand', 'blend'], camera: ['push', 'none'], overlap: [-0.45, 0.05], frame: true },
  'card-expand': { depth: ['same', 'over'], mask: ['inset'], background: ['expand', 'blend'], camera: ['push', 'none'], overlap: [-0.45, 0.05], frame: true },
  'type-mask': { depth: ['over'], mask: ['type'], background: ['expand', 'blend'], camera: ['push', 'none'], overlap: [-0.6, 0], frame: true },
  'depth-handoff': { depth: ['through'], mask: ['none'], background: ['blend'], camera: ['depth', 'push'], overlap: [-0.4, 0.1] },
  'foreground-wipe': { depth: ['over'], mask: ['wipe'], background: ['flood', 'blend'], camera: ['none', 'pan'], overlap: [-0.6, 0] },
  'shape-takeover': { depth: ['over'], mask: ['circle'], background: ['flood', 'blend'], camera: ['none'], overlap: [-0.45, 0] },
  'color-bleed': { depth: ['same'], mask: ['none'], background: ['blend', 'carry'], camera: ['none', 'pan', 'pull'], overlap: [-0.4, 0] },
  cut: { depth: ['same'], mask: ['none'], background: ['carry', 'blend'], camera: ['none'], overlap: [-0.15, 0.1] },
};
// the window (inset: top right bottom left, % of the screen) a picture opens from when nothing better is known
const FRAME = { 'image-expand': [30, 34, 30, 34], 'card-expand': [38, 52, 16, 12], 'type-mask': [34, 6, 34, 6] };

const r2 = v => Math.round(v * 100) / 100;
const q05 = v => r2(Math.round(v * 20) / 20);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const oneOf = (v, list, d) => (list.includes(v) ? v : d);
const num = (v, lo, hi, d) => { const n = typeof v === 'number' && isFinite(v) ? v : d; return clamp(n, lo, hi); };
const HEX = /^#[0-9a-f]{6}$/i;

// ---------------------------------------------------------------- the pictures
const focalOf = s => ((s && s.layers) || []).find(L => L.role === 'focal' && L.kind === 'image' && L.asset) || null;
const imagesOf = s => ((s && s.layers) || []).filter(L => L.kind === 'image' && L.asset).map(L => L.asset);
const boxOf = L => (L && L.box && Array.isArray(L.box.d) && L.box.d.length === 4 && L.box.d.every(v => typeof v === 'number') ? L.box.d : null);
const full = d => d[2] >= 90 && d[3] >= 90;
// a frame (x, y, w, h in % of the scene) as the inset a clip-path opens from
function insetOf(d) { return [d[1], 100 - d[0] - d[2], 100 - d[1] - d[3], d[0]].map(v => Math.round(clamp(v, 0, 60))); }
// a frame's centre and size in the actors' units (vw / vh from the centre, scale against the actor's 54vh)
function frameState(d) {
  const b = TL.BOUNDS.image;
  return { x: Math.round(clamp(d[0] + d[2] / 2 - 50, b.x[0], b.x[1])), y: Math.round(clamp(d[1] + d[3] / 2 - 50, b.y[0], b.y[1])), s: r2(clamp(d[3] / 54, b.s[0], b.s[1])) };
}
// the same picture, a cut-out of the other, or two cut-outs of one picture
function related(a, b, byId) {
  if (!a || !b) return false; if (a === b) return true;
  const A = byId && byId.get(a), B = byId && byId.get(b); if (!A || !B) return false;
  return ((A.cutoutOf || A.id) === (B.cutoutOf || B.id));
}
function rgb(h) { return HEX.test(h || '') ? [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)) : null; }
function colourDistance(a, b) { const x = rgb(a), y = rgb(b); if (!x || !y) return 0; return Math.round(Math.sqrt(x.reduce((t, v, i) => t + (v - y[i]) ** 2, 0))); }

// the pictures the page actually uses -- the hero first, then the actors, then each scene's, then premium sources --
// and nothing else (a picture in the inventory but not on the page is never inspected)
function usedAssets(plan, byId) {
  const out = []; const add = id => { if (id && byId.get(id) && !out.includes(id) && out.length < LIMITS.assets) out.push(id); };
  const h = heroOf(plan, byId); if (h) add(h.id);
  ((plan.timeline && plan.timeline.actors) || []).forEach(a => add(a.asset));
  (plan.scenes || []).forEach(s => imagesOf(s).forEach(add));
  (plan.premiumMedia || []).forEach(m => add(m.asset));
  return out;
}
// what one picture is like, from what was measured (assess) and seen (the picture check) -- never guessed
function profileOf(asset, heroId) {
  const p = FR.profile(asset); const a = asset.assess || {}; const s = p.subject;
  const cx = s ? (s[0] + s[2]) / 2 : p.focus[0]; const cy = s ? (s[1] + s[3]) / 2 : p.focus[1];
  // the emptiest side beside the subject: room for words, or for the next thing to arrive into
  let space = 'unknown', room = 0;
  if (s) { const sides = { left: s[0], right: 1 - s[2], top: s[1], bottom: 1 - s[3] }; Object.keys(sides).forEach(k => { if (sides[k] > room) { room = sides[k]; space = k; } }); if (room < 0.18) space = 'none'; }
  const colour = ((a.colours || [])[0]) || (a.background && a.background.colour) || '';
  // how much of it may be cut away: a cut-out is never cropped (it floats), a tight or unmeasured picture very little
  const crop = p.free ? 'none' : p.tight || p.source === 'unknown' ? 'low' : p.wide && p.big ? 'high' : 'medium';
  const fill = p.fill != null ? p.fill : 0.4;
  const weight = fill > 0.5 || (a.luminance && a.luminance < 60) ? 'heavy' : fill < 0.2 ? 'light' : 'medium';
  return {
    id: asset.id, orientation: a.orientation || (p.wide ? 'landscape' : p.tall ? 'portrait' : 'square'), aspect: r2(p.aspect),
    subject: [r2(cx), r2(cy)], side: cx < 0.4 ? 'left' : cx > 0.6 ? 'right' : 'centre', space, room: r2(room), colour, luminance: Math.round(a.luminance || 0),
    crop, weight, carryable: !!p.free, video: !!asset.video, hero: asset.id === heroId, measured: p.source,
  };
}
function assetProfiles(plan, byId) { const h = heroOf(plan, byId); return usedAssets(plan, byId).map(id => profileOf(byId.get(id), h && h.id)); }
// how well two pictures hand over (0..1) and why
function pairFit(A, B, byId) {
  if (!A || !B) return { score: 0, why: [] };
  if (related(A.id, B.id, byId)) return { score: 1, why: ['the same subject'] };
  let s = 0; const why = [];
  if (A.colour && B.colour && colourDistance(A.colour, B.colour) < 90) { s += 0.3; why.push('colours meet'); }
  if (A.side === B.side) { s += 0.25; why.push('subjects line up'); }
  if (A.space !== 'none' && A.space !== 'unknown' && A.space === B.side) { s += 0.25; why.push('arrives into the empty side'); }
  if (A.orientation === B.orientation) { s += 0.1; why.push('same orientation'); }
  if (A.weight === B.weight) { s += 0.1; why.push('same weight'); }
  return { score: r2(Math.min(1, s)), why };
}
// for each seam: the outgoing scene's main picture against the incoming one's
function seamFit(plan, byId) {
  const h = heroOf(plan, byId); const P = id => (id && byId.get(id) ? profileOf(byId.get(id), h && h.id) : null);
  const out = [];
  for (let at = 1; at < (plan.scenes || []).length; at++) {
    const a = focalOf(plan.scenes[at - 1]), b = focalOf(plan.scenes[at]);
    const f = pairFit(P(a && a.asset), P(b && b.asset), byId);
    out.push({ at, from: (a && a.asset) || '', to: (b && b.asset) || '', score: f.score, why: f.why });
  }
  return out;
}

// the hero: the opening scene's main picture (or the actor that opens the page) -- or, when the opening has no picture,
// the first scene led by the picture the premium hero video is made from
function heroOf(plan, byId, premiumMedia) {
  const scenes = plan.scenes || []; const f = focalOf(scenes[0]);
  const A = ((plan.timeline && plan.timeline.actors) || []).find(a => a.role === 'primary' && a.from === 0);
  const id = (f && f.asset) || (A && A.asset) || '';
  if (id && byId.get(id)) return { id, layer: f, actor: A || null, scene: 0 };
  const v = (premiumMedia || plan.premiumMedia || []).find(m => m && VIDEO_INTENTS.includes(m.intent) && byId.get(m.asset));
  const at = v ? scenes.findIndex(s => { const L = focalOf(s); return L && related(L.asset, v.asset, byId); }) : -1;
  return at > 0 ? { id: focalOf(scenes[at]).asset, layer: focalOf(scenes[at]), actor: null, scene: at } : null;
}

// ---------------------------------------------------------------- how two neighbouring pictures relate
// relationOf(sceneA, sceneB, byId, ctx) -> { relationship, score, vec, distance }. From what was measured and what the
// pictures were said to show -- never guessed beyond that:
//   same-picture   the same photo (or its cut-out) on both sides         -> continue its crop (image-expand) / carry it
//   detail-of      the same photo, the next a close crop of it            -> the crop continues into the detail
//   same-subject   another picture of the same thing (what both are said to show shares a noun beyond the page's name;
//                  a matching silhouette -- the subject's measured proportions -- makes it stronger) -> carry it across
//   palette        different subjects, colours that meet                 -> the colour flows
//   contrast       far-apart colours                                     -> a sweep hides the change
//   complement     neither                                               -> a plain handoff
// vec: which way things move across the seam -- the outgoing subject leaves toward its own side, the next arrives
// into its empty side (lr: rightward, rl: leftward).
const RELATIONSHIPS = ['same-picture', 'detail-of', 'same-subject', 'palette', 'complement', 'contrast', 'none'];
const CARRY = ['none', 'light', 'strong'];
const PALETTE_HANDOFFS = ['blend', 'hold', 'sweep', 'accent'];
const DEPTH_HANDOFFS = ['none', 'forward', 'back', 'through'];
const TEXT_PLACEMENTS = ['left', 'right', 'top', 'bottom', 'center'];
const VECTORS = ['none', 'lr', 'rl', 'in', 'out'];
// how loud a scene is by its place in the arc (timeline rhythm)
const INTENSITY = { setup: 2, acceleration: 3, event: 4, rest: 1, escalation: 5, payoff: 4 };
// how many seams may physically carry a subject, by mode (a carry is a statement, not a habit)
const CARRIES = { quiet: 1, editorial: 1, expressive: 2, immersive: 3 };
const STOP = new Set(['with', 'from', 'that', 'this', 'page', 'picture', 'photo', 'image', 'shows', 'showing', 'into', 'over', 'some', 'their', 'your', 'close', 'closeup', 'upload', 'file', 'shot']);
const nouns = s => new Set((String(s || '').toLowerCase().match(/[a-z]{4,}/g) || []).filter(w => !STOP.has(w)));
const saidOf = (a, sc) => [sc && sc.visual && sc.visual.subject, a && a.curation && a.curation.depicts, a && a.title, a && a.alt].filter(Boolean).join(' ');
function relationOf(sa, sb, byId, ctx) {
  const none = { relationship: 'none', score: 0, vec: 'none', distance: 0 };
  const a = focalOf(sa), b = focalOf(sb); if (!a || !b) return none;
  const A = byId.get(a.asset), B = byId.get(b.asset); if (!A || !B) return none;
  const PA = profileOf(A), PB = profileOf(B); const distance = PAL.distance(PAL.identity(A).hex || PA.colour, PAL.identity(B).hex || PB.colour);
  let relationship = 'complement', score = 0.35;
  if (related(a.asset, b.asset, byId)) { relationship = b.frame === 'detail' || (sb && sb.layout === 'edge-crop') ? 'detail-of' : 'same-picture'; score = 1; }
  else {
    const name = nouns(ctx && ctx.name); const wa = [...nouns(saidOf(A, sa))].filter(w => !name.has(w)); const wb = nouns(saidOf(B, sb));
    if (wa.some(w => wb.has(w))) {
      const sA = FR.profile(A).subject, sB = FR.profile(B).subject; const shape = (s, asp) => (s ? ((s[2] - s[0]) * asp) / Math.max(0.01, s[3] - s[1]) : 0);
      const silhouette = !!(sA && sB && Math.abs(Math.log(Math.max(0.01, shape(sA, PA.aspect)) / Math.max(0.01, shape(sB, PB.aspect)))) < 0.35);
      relationship = 'same-subject'; score = r2(0.6 + (silhouette ? 0.2 : 0) + (PA.carryable || PB.carryable ? 0.1 : 0));
    } else if (distance < 90) { relationship = 'palette'; score = 0.5; } else if (distance > 200) { relationship = 'contrast'; score = 0.3; }
  }
  const vec = PA.side === 'right' || PB.space === 'left' ? 'lr' : PA.side === 'left' || PB.space === 'right' ? 'rl' : 'none';
  return { relationship, score, vec, distance };
}

// ---------------------------------------------------------------- image-pair-driven seams
// chooseSeams(rawTimeline, ctx) -> { changed, seams }. Before the timeline is validated, each seam's family follows how
// its two pictures relate (relationOf) and how loud the incoming scene is (its rhythm), within the mode's signature
// budget -- the strongest relationships get the signature moves, two neighbouring seams never repeat one, and a seam
// whose pictures belong together never stays a generic bleed when a stronger move is free:
//   same picture / detail      -> image-expand (the crop continues)
//   same subject, a cut-out    -> depth-handoff (the subject comes forward as the last scene recedes)
//   a cut-out after a photo    -> depth-handoff on a loud scene
//   far-apart colours, loud    -> foreground-wipe (a sweep of the next colour hides the change)
//   the premium hero's seam    -> image-expand (the video's subject crop opens into scene 2)
// The flow's own signature choices (type-mask, shape-takeover, card-expand...) keep what budget is left. ctx: { scenes,
// byId, mode, premiumHero, name }
function chooseSeams(raw, ctx) {
  if (!raw || typeof raw !== 'object') return { changed: 0, seams: [] }; if (!Array.isArray(raw.transitions)) raw.transitions = [];
  const sc = ctx.scenes || []; const byId = ctx.byId || new Map(); const cast = TL.MODE_CAST[ctx.mode] || TL.MODE_CAST.expressive;
  const rhythm = Array.isArray(raw.rhythm) ? raw.rhythm : []; const seams = [];
  for (let at = 1; at < sc.length; at++) {
    let tr = raw.transitions.find(x => x && x.at === at); if (!tr) { tr = { at, family: 'color-bleed' }; raw.transitions.push(tr); }
    const was = TL.TRANSITIONS.includes(tr.family) ? tr.family : 'color-bleed';
    if (was === 'actor-carry') { seams.push({ at, tr, was, keep: true }); continue; }
    const rel = relationOf(sc[at - 1], sc[at], byId, ctx); const fa = focalOf(sc[at - 1]), fb = focalOf(sc[at]);
    const PA = fa && byId.get(fa.asset) ? profileOf(byId.get(fa.asset)) : null, PB = fb && byId.get(fb.asset) ? profileOf(byId.get(fb.asset)) : null;
    const loud = INTENSITY[rhythm[at]] || 2;
    let want = null; let bonus = 0;
    // (a card of a gallery that becomes the next scene: the next picture is one of the cards)
    const fromCards = CARDS.includes(sc[at - 1].layout) && fb && sc[at - 1].layers.some(L => L.kind === 'image' && related(L.asset, fb.asset, byId));
    if (fromCards) { want = 'card-expand'; bonus = 1; }
    else if (rel.relationship === 'same-picture' || rel.relationship === 'detail-of') want = 'image-expand';
    // (the same subject comes forward out of the last scene -- after a premium hero too: the video's subject carries on)
    else if (rel.relationship === 'same-subject' && PB && PB.carryable && fa) want = 'depth-handoff';
    else if (at === 1 && ctx.premiumHero && fb) want = 'image-expand';
    else if (PB && PB.carryable && PA && !PA.carryable && loud >= 3) want = 'depth-handoff';
    else if (rel.relationship === 'contrast' && loud >= 4) want = 'foreground-wipe';
    seams.push({ at, tr, was, rel, want, strength: rel.score + loud / 10 + bonus + (at === 1 && ctx.premiumHero ? 1 : 0) });
  }
  const chosen = new Map(); let used = 0;
  seams.filter(s => s.want).sort((x, y) => y.strength - x.strength || x.at - y.at).forEach(s => {
    if (used >= cast.signature) return;
    if ([s.at - 1, s.at + 1].some(k => chosen.get(k) === s.want)) return;
    chosen.set(s.at, s.want); used++;
  });
  let changed = 0;
  seams.forEach(s => {
    if (s.keep) return;
    let fam = chosen.get(s.at);
    if (!fam) {
      // the flow's own signature move, while budget is left and its neighbours do not already make the same move
      if (TL.SIGNATURE.includes(s.was) && used < cast.signature && ![s.at - 1, s.at + 1].some(k => chosen.get(k) === s.was)) { fam = s.was; chosen.set(s.at, fam); used++; }
      else fam = TL.SIGNATURE.includes(s.was) ? 'color-bleed' : s.was;
    }
    if (fam !== s.tr.family) { s.tr.family = fam; changed++; }
  });
  return { changed, seams: seams.map(s => ({ at: s.at, family: s.tr.family, relationship: s.rel ? s.rel.relationship : 'carry' })) };
}
// the way a delivered video moves, from two of its frames ({ width, height, data } RGBA; the studio samples 64 x 40): the
// one camera move -- a pan (the picture shifts) or a zoom (it scales about the centre) -- that best turns the first frame
// into the second, found by a small bounded search on brightness (at most 64 x 40 samples, a fixed set of candidates).
// -> { motion: lr | rl | in | out | none, confidence 0..1, pan: [dx, dy] px, zoom, why }
// It never invents a direction: 'none' when the frames barely differ, when no single move explains the change much
// better than standing still (a cut, noise, flicker), when the pan and the zoom are of a size (a mixed move has no one
// direction to continue), when the best pan and the best zoom explain it about equally, or when the move is vertical.
const ZOOMS = [0.8, 0.85, 0.9, 0.94, 0.97, 1, 1.03, 1.06, 1.11, 1.17, 1.25];
function estimateMotion(f1, f2) {
  const none = why => ({ motion: 'none', confidence: 0, pan: [0, 0], zoom: 1, why });
  if (!f1 || !f2 || !f1.data || !f2.data || f1.width !== f2.width || f1.height !== f2.height || f1.width < 16 || f1.height < 12) return none('no frames');
  const W = Math.min(64, f1.width), H = Math.min(40, f1.height);
  // brightness on a fixed small grid, each frame's mean taken away (a frame that only brightens has not moved)
  const lum = f => {
    const L = new Float32Array(W * H), sx = f.width / W, sy = f.height / H; let m = 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = (Math.floor((y + 0.5) * sy) * f.width + Math.floor((x + 0.5) * sx)) * 4; const v = 0.299 * f.data[i] + 0.587 * f.data[i + 1] + 0.114 * f.data[i + 2]; L[y * W + x] = v; m += v; }
    m /= W * H; for (let i = 0; i < L.length; i++) L[i] -= m; return L;
  };
  const A = lum(f1), B = lum(f2), cx = (W - 1) / 2, cy = (H - 1) / 2, M = 4, need = 0.5 * (W - 2 * M) * (H - 2 * M);
  // the mean difference between the second frame and the first moved by (zoom s about the centre, then shift tx, ty)
  const err = (s, tx, ty) => {
    let e = 0, n = 0;
    for (let y = M; y < H - M; y++) for (let x = M; x < W - M; x++) {
      const u = cx + (x - cx - tx) / s, v = cy + (y - cy - ty) / s; if (u < 0 || v < 0 || u > W - 1 || v > H - 1) continue;
      const x0 = Math.min(W - 2, Math.floor(u)), y0 = Math.min(H - 2, Math.floor(v)), fx = u - x0, fy = v - y0, i = y0 * W + x0;
      const a = A[i] + (A[i + 1] - A[i]) * fx, b = A[i + W] + (A[i + W + 1] - A[i + W]) * fx;
      e += Math.abs(B[y * W + x] - (a + (b - a) * fy)); n++;
    }
    return n >= need ? e / n : Infinity;
  };
  const E0 = err(1, 0, 0); if (E0 < 1.5) return none('static');
  const tried = []; let best = { s: 1, tx: 0, ty: 0, e: E0 };
  const look = (s, tx, ty) => { const e = err(s, tx, ty); tried.push({ s, tx, ty, e }); if (e < best.e) best = { s, tx, ty, e }; };
  for (const s of ZOOMS) for (let tx = -16; tx <= 16; tx += 2) for (let ty = -8; ty <= 8; ty += 2) look(s, tx, ty);
  const b0 = best; for (const ds of [-0.015, 0, 0.015]) for (const dx of [-1, 0, 1]) for (const dy of [-1, 0, 1]) if (ds || dx || dy) look(b0.s + ds, b0.tx + dx, b0.ty + dy);
  const gain = (E0 - best.e) / E0, zoomPx = Math.abs(best.s - 1) * W / 2, panPx = Math.hypot(best.tx, best.ty);
  const out = (motion, why) => ({ motion, confidence: motion === 'none' ? 0 : Math.round(gain * 100) / 100, pan: [best.tx, best.ty], zoom: Math.round(best.s * 1000) / 1000, why });
  if (gain < 0.3) return out('none', 'no single camera move explains the change');
  if (Math.max(zoomPx, panPx) < 1) return out('none', 'too small to continue');
  const zoomWins = zoomPx >= 2 * panPx, panWins = panPx >= 2 * zoomPx;
  if (!zoomWins && !panWins) return out('none', 'mixed pan and zoom');
  // the other kind of move must explain it clearly worse, or the reading is a guess
  const rival = tried.filter(c => (zoomWins ? Math.abs(c.s - 1) < 0.02 : Math.abs(c.s - 1) >= 0.03 && Math.hypot(c.tx, c.ty) <= 2)).reduce((m, c) => Math.min(m, c.e), Infinity);
  if (rival - best.e < 0.1 * E0) return out('none', 'pan and zoom explain it about equally');
  if (zoomWins) return out(best.s > 1 ? 'in' : 'out', best.s > 1 ? 'push in' : 'pull back');
  if (Math.abs(best.tx) < 1.5 * Math.abs(best.ty) || Math.abs(best.tx) < 1) return out('none', 'vertical move');
  return out(best.tx > 0 ? 'lr' : 'rl', 'pan');
}
// (the direction alone: what the page continues; 'none' unless it is sure)
function videoMotion(f1, f2) { return estimateMotion(f1, f2).motion; }
// (the earlier name: one upgrade pass -- now the whole page's seams are chosen from their pictures)
function upgradeSeams(raw, ctx) { return chooseSeams(raw, ctx).changed; }

// ---------------------------------------------------------------- what a seam can carry
function feasibleFamilies(at, ctx) {
  const t = ctx.timeline; const prev = ctx.scenes[at - 1], next = ctx.scenes[at]; if (!prev || !next) return ['color-bleed'];
  const bleedable = s => s.layers.some(L => L.kind === 'image' && (L.frame === 'bleed' || (L.box && L.box.d && L.box.d[2] >= 99 && L.box.d[3] >= 99)));
  const ok = {
    'actor-carry': t.actors.some(a => (a.role === 'primary' || a.role === 'secondary') && a.from <= at - 1 && a.to >= at),
    'image-expand': !!focalOf(next), 'card-expand': CARDS.includes(prev.layout) && !!focalOf(next),
    'type-mask': !!focalOf(next) && bleedable(next) && t.actors.some(a => a.role === 'typography' && a.to === at - 1),
    'depth-handoff': !!focalOf(prev), 'foreground-wipe': true, 'shape-takeover': true, 'color-bleed': true, cut: true,
  };
  return TL.TRANSITIONS.filter(f => ok[f]);
}
// the actor's move across a seam: its last key before the seam and its first after it
function keyWindow(A, at) {
  const k = A.keys; let before = -1, after = -1;
  k.forEach((x, i) => { if (x.g <= at && x.g >= at - 1) before = i; if (after < 0 && x.g > at && x.g <= at + 1) after = i; });
  return { before, after, from: before >= 0 ? r2(k[before].g - at) : -0.3, to: after >= 0 ? r2(k[after].g - at) : 0.3 };
}
const state = (o) => ({ el: o.el, x: o.x, y: o.y, s: o.s, o: o.o, ...(o.inset ? { inset: o.inset.slice() } : {}), surface: o.surface });

// ---------------------------------------------------------------- the only door
// ctx: { scenes (validated), timeline (validated), byId, premiumMedia, asked (a model's request, before it is applied:
// the families and overlaps it asks for are kept when feasible) }
function contract(at, g, c, fixes) {
  const t = c.timeline; const prev = c.scenes[at - 1], next = c.scenes[at];
  const truth = (t.transitions.find(x => x.at === at) || {}).family || 'color-bleed';
  let fam = truth;
  if (c.asked) { const want = oneOf(g.family, TL.TRANSITIONS, ''); if (want && want !== truth) { if (feasibleFamilies(at, c).includes(want)) fam = want; else fixes.push(`continuity: the ${want} into scene ${at + 1} has nothing to work with -- it stays ${truth}`); } }
  const intent0 = oneOf(g.intent, INTENTS, '');
  if (c.asked && intent0 === 'rest' && TL.SIGNATURE.includes(fam)) fam = 'color-bleed';
  if (c.asked && intent0 === 'reset') fam = 'cut';
  const F = FAMILY[fam] || FAMILY['color-bleed'];
  // who crosses the seam: a picture actor on stage across it always is the carried actor (it IS on stage); otherwise
  // the name or the background field, when one is there and was asked for
  const spans = t.actors.filter(a => a.from <= at - 1 && a.to >= at);
  const typo = t.actors.find(a => a.role === 'typography' && a.from <= at - 1 && a.to >= at - 1) || null;
  const pic = spans.find(a => a.role === 'primary') || spans.find(a => a.role === 'secondary') || null;
  let carried = 'none'; let A = null;
  if (pic) { carried = pic.role; A = pic; }
  else {
    const want = oneOf(g.carriedActor, CARRIED, '');
    const can = { typography: typo, background: spans.find(a => a.role === 'background') || null };
    if (want && can[want]) { carried = want; A = can[want]; }
    else if (!want && typo && typo.to >= at) { carried = 'typography'; A = typo; }
    if (want && want !== 'none' && !can[want] && want !== carried) fixes.push(`continuity: no ${want} actor crosses the seam into scene ${at + 1}`);
  }
  // the picture that continues: the carried actor's, the one a frame transition opens, or the same picture on both sides
  const fo = focalOf(prev), fi = focalOf(next);
  const asset = A && A.kind === 'image' ? A.asset : F.frame && fi ? fi.asset : fo && fi && related(fo.asset, fi.asset, c.byId) ? fi.asset : '';
  // the state at the seam, derived: one point of the actor's track, the frame the picture opens from, or the surface
  let st;
  if (A) { const v = TL.stateAt(A, at); st = { el: 'actor', x: Math.round(v.x), y: Math.round(v.y), s: r2(v.s), o: r2(v.o) }; }
  else if (F.frame) { const d = boxOf(fo); const own = fam === 'image-expand' && d && !full(d); st = Object.assign({ el: 'frame' }, own ? frameState(d) : { x: 0, y: 0, s: 1 }, { o: 1, inset: own ? insetOf(d) : FRAME[fam].slice() }); }
  else st = { el: 'surface', x: 0, y: 0, s: 1, o: 1 };
  st.surface = (next.ink && HEX.test(next.ink.surface || '') ? next.ink.surface.toLowerCase() : '');
  // the overlap: an actor's carry is where its keys put it; any other seam's is bounded
  let overlap;
  const o = g.overlap && typeof g.overlap === 'object' ? g.overlap : {};
  if (fam === 'actor-carry' && A && !c.asked) { const w = keyWindow(A, at); overlap = { from: w.from, to: w.to }; }
  else {
    let from = q05(num(o.from, OVERLAP.from[0], OVERLAP.from[1], F.overlap[0])); const to = q05(num(o.to, OVERLAP.to[0], OVERLAP.to[1], F.overlap[1]));
    if (to - from < OVERLAP.min - 1e-9) from = q05(Math.max(OVERLAP.from[0], to - OVERLAP.min));
    if (to - from > OVERLAP.max + 1e-9) from = q05(to - OVERLAP.max);
    overlap = { from, to };
  }
  let intent = intent0 || (fam === 'cut' ? 'reset' : A && A.kind === 'image' ? 'carry' : t.rhythm[at] === 'rest' && fam === 'color-bleed' ? 'rest' : 'continue');
  if (fam === 'cut') intent = 'reset'; else if (intent === 'reset') intent = 'continue';
  if (intent === 'carry' && !(A && A.kind === 'image')) intent = 'continue';
  if (intent === 'rest' && TL.SIGNATURE.includes(fam)) intent = 'continue';
  const pick = (v, list) => (list.includes(v) ? v : list[0]);
  const typoDefault = !typo ? 'none' : fam === 'type-mask' ? 'mask' : typo.behavior === 'break' ? 'front' : 'behind';
  const typography = !typo ? 'none' : fam === 'type-mask' ? 'mask' : ['front', 'behind'].includes(g.typography) ? g.typography : typoDefault;
  // ---- how the two pictures relate and what the page does with it -- derived from the pictures; a model may only ask
  // for less (no carry, no motion) or choose another palette handoff from the fixed list
  const rel = relationOf(prev, next, c.byId, c);
  // a subject carried physically across the seam: the same picture, or the same subject, shown on both sides -- unless
  // an actor already carries the run, or the seam's own move continues the picture (an expand, a card, a mask)
  const actorNear = t.actors.some(x => x.kind === 'image' && x.from <= at && x.to >= at - 1);
  // (two different full photos cross-fading in flight read as a slide changing, not a subject moving: another shot of
  // the subject is carried only when one side is the subject alone -- a cut-out)
  const alone = x => !!(x && c.byId.get(x.asset) && FR.profile(c.byId.get(x.asset)).free);
  const carriable = ['same-picture', 'detail-of'].includes(rel.relationship) || (rel.relationship === 'same-subject' && (alone(fo) || alone(fi)));
  let carry = !pic && !actorNear && fo && fi && !['image-expand', 'card-expand', 'type-mask'].includes(fam) && carriable ? (rel.score >= 0.75 || alone(fi) ? 'strong' : 'light') : 'none';
  if (g.carry === 'none' || (g.carry === 'light' && carry === 'strong')) carry = g.carry;
  const paletteHandoff = PALETTE_HANDOFFS.includes(g.paletteHandoff) ? g.paletteHandoff : fam === 'foreground-wipe' || fam === 'shape-takeover' || rel.relationship === 'contrast' ? 'sweep' : 'blend';
  const depthHandoff = fam === 'depth-handoff' ? 'through' : fam === 'image-expand' || fam === 'card-expand' || carry === 'strong' ? 'forward' : 'none';
  const motionVector = fam === 'actor-carry' || g.motionVector === 'none' ? 'none' : rel.vec;
  return {
    at, family: fam, intent, carriedActor: carried, carriedAsset: asset,
    outgoing: state(st), incoming: state(st), // (scene N's end IS scene N+1's start: one state, written twice)
    overlap, depth: pick(g.depth, F.depth), mask: pick(g.mask, F.mask), background: pick(g.background, F.background), typography, camera: pick(g.camera, F.camera),
    relationship: rel.relationship, carry, paletteHandoff, depthHandoff, textPlacement: placementOf(next), motionVector,
  };
}
// where a scene's words sit (after its composition): left, right, top, bottom or centre of the scene
function placementOf(s) {
  const r = String((s && s.text && s.text.region) || 'center');
  return /left/.test(r) ? 'left' : /right/.test(r) ? 'right' : /^top/.test(r) ? 'top' : /^bottom/.test(r) ? 'bottom' : 'center';
}

function normalise(raw, ctx) {
  const c = ctx || {}; const fixes = []; const t = c.timeline; const scenes = c.scenes || []; const n = scenes.length;
  if (!t || !Array.isArray(t.actors) || n < 1) return { continuity: null, fixes };
  const byId = c.byId || new Map(); const C = Object.assign({}, c, { byId });
  const r = raw && typeof raw === 'object' ? raw : {};
  const given = new Map((Array.isArray(r.contracts) ? r.contracts : []).slice(0, 40).filter(x => x && typeof x === 'object' && Number.isInteger(x.at)).map(x => [x.at, x]));
  const contracts = []; for (let at = 1; at < n; at++) contracts.push(contract(at, given.get(at) || {}, C, fixes));
  // the hero: where it hands over to the first scene after it -- and, with a premium video, how the video ends
  let hero = null; const H = heroOf({ scenes, timeline: t }, byId, c.premiumMedia);
  if (H) {
    const asset = byId.get(H.id); const p = FR.profile(asset);
    const video = !!asset.video || (Array.isArray(c.premiumMedia) ? c.premiumMedia : []).some(m => m && VIDEO_INTENTS.includes(m.intent) && related(m.asset, H.id, byId));
    const d = boxOf(H.layer) || [0, 0, 100, 100]; const s = p.subject;
    // where the subject is on the screen: the measured subject inside the hero's frame (else the frame's middle)
    const sub = s ? [d[0] + s[0] * d[2], d[1] + s[1] * d[3], (s[2] - s[0]) * d[2], (s[3] - s[1]) * d[3]] : [d[0] + d[2] * 0.3, d[1] + d[3] * 0.25, d[2] * 0.4, d[3] * 0.5];
    const into = H.scene + 1 < n ? H.scene + 1 : H.scene; const k1 = contracts.find(k => k.at === into && into > H.scene) || null;
    const continues = !!(k1 && related(k1.carriedAsset, H.id, byId));
    const canCrop = !!(k1 && ['image-expand', 'card-expand'].includes(k1.family) && s);
    const want = oneOf(r.hero && r.hero.end, VIDEO_ENDS, '');
    let end = want === 'detail-crop' && canCrop ? want : want === 'subject-centred' && continues ? want : want === 'static-frame' ? want : '';
    if (want && !end) fixes.push(`continuity: the hero cannot end as ${want} here`);
    if (!end) end = continues && k1 && k1.outgoing.el === 'actor' ? 'subject-centred' : canCrop ? 'detail-crop' : 'static-frame';
    const st = Object.assign({ el: 'frame' }, frameState(sub), { o: 1, inset: insetOf(sub) });
    // a detail crop: the next picture opens from the window the hero's subject filled
    if (end === 'detail-crop') { k1.outgoing = state(Object.assign({}, k1.outgoing, { el: 'frame', x: st.x, y: st.y, s: st.s, inset: st.inset })); k1.incoming = state(k1.outgoing); }
    const hs = scenes[H.scene];
    hero = { asset: H.id, scene: H.scene, video, end, into, state: state(Object.assign(st, { surface: (hs.ink && HEX.test(hs.ink.surface || '') ? hs.ink.surface.toLowerCase() : '') })) };
    // (the delivered video's measured colour cast, once it exists: the page's colours were re-tuned to it)
    if (r.hero && HEX.test(r.hero.cast || '')) hero.cast = r.hero.cast.toLowerCase();
    // the hero's motion (MEASURED from the delivered video's frames -- until then, or when the measurement is unsure, none:
    // a guessed direction never steers the next seams) and its language carried into the next two seams: the same
    // direction when there is one, and its colour holding before it hands over
    hero.motion = video ? oneOf(r.hero && r.hero.motion, VECTORS, 'none') : 'none';
    if (video) contracts.filter(k => k.at > H.scene && k.at <= H.scene + 2).forEach(k => {
      const g = given.get(k.at) || {};
      if (hero.motion !== 'none' && k.family !== 'actor-carry' && g.motionVector !== 'none') k.motionVector = hero.motion;
      if (!PALETTE_HANDOFFS.includes(g.paletteHandoff) && k.paletteHandoff === 'blend') k.paletteHandoff = 'hold';
    });
  }
  // a physical carry is a statement: the strongest relationships keep theirs, within the mode's number
  const carried = contracts.filter(k => k.carry !== 'none').sort((x, y) => (y.carry === 'strong') - (x.carry === 'strong') || x.at - y.at);
  carried.slice(CARRIES[c.mode] || CARRIES.expressive).forEach(k => { k.carry = 'none'; if (k.depthHandoff === 'forward' && k.family !== 'image-expand' && k.family !== 'card-expand') k.depthHandoff = 'none'; });
  // the page closes on what it opened with: the main subject returns, or at least its colour
  let callback = null;
  if (n >= 3 && hero) {
    const last = scenes[n - 1]; const lf = focalOf(last); const lt = last.ink && last.ink.surface; const ht = scenes[hero.scene].ink && scenes[hero.scene].ink.surface;
    callback = { scene: n - 1, kind: lf && related(lf.asset, hero.asset, byId) ? 'subject' : HEX.test(lt || '') && HEX.test(ht || '') && PAL.distance(lt, ht) < 40 ? 'colour' : 'echo' }; // (echo: the main picture returns as the closing scene's backdrop)
  }
  // where depth would help (ADVISORY ONLY: the spatial tier is decided by spatial.js, never by a model)
  const spatialUseful = [...new Set((Array.isArray(r.spatialUseful) ? r.spatialUseful : []).filter(i => Number.isInteger(i) && i >= 0 && i < n))].sort((a, b) => a - b).slice(0, LIMITS.spatial);
  const out = { v: 1, source: oneOf(r.source, SOURCES, 'built-in'), hero, contracts, spatialUseful, ...(callback ? { callback } : {}) };
  if (r.critic && typeof r.critic === 'object') {
    const k = r.critic;
    out.critic = { source: oneOf(k.source, ['built-in', 'ai', 'mock'], 'built-in'), found: (Array.isArray(k.found) ? k.found : []).filter(x => CRITIC.includes(x)).slice(0, LIMITS.issues), fixed: Math.round(num(k.fixed, 0, 20, 0)),
      remaining: (Array.isArray(k.remaining) ? k.remaining : []).filter(x => x && CRITIC.includes(x.code) && Number.isInteger(x.at) && x.at >= 0 && x.at < n).slice(0, LIMITS.issues).map(x => ({ code: x.code, at: x.at })) };
  }
  return { continuity: out, fixes };
}

// ---------------------------------------------------------------- writing the contracts onto the timeline
// apply(plan, continuity) -> { timeline (raw, to be validated again), handoffs: Map(scene -> handoff) }
function apply(plan, cont) {
  const tl = JSON.parse(JSON.stringify(plan.timeline)); const handoffs = new Map();
  const K = (cont && cont.contracts) || [];
  K.forEach(k => {
    const tr = tl.transitions.find(x => x.at === k.at); if (!tr) return;
    tr.family = k.family;
    // a carry's overlap: the actor leaves its pose and reaches the next inside the contract's window
    if (k.family === 'actor-carry') { const A = tl.actors.find(a => a.role === k.carriedActor && a.kind === 'image'); if (A) moveWindow(A, k.at, k.overlap); }
    if (k.calm) calmBeats(tl, k);
    if (TL.SIGNATURE.includes(k.family) || k.family === 'actor-carry') handoffs.set(k.at, 'cut');
  });
  // the hero's subject continues: the actor that carries it arrives from where the subject left the screen (same side,
  // same size), not from an arbitrary offstage point
  const h = cont && cont.hero;
  if (h && h.end === 'subject-centred') {
    const A = tl.actors.find(a => a.role === 'primary' && a.from === h.into && a.from > 0);
    if (A && A.keys.length && A.keys[0].g < A.from) { const b = TL.BOUNDS.image; Object.assign(A.keys[0], { x: clamp(h.state.x, b.x[0], b.x[1]), y: b.y[0], s: clamp(h.state.s, b.s[0], b.s[1]), r: 0 }); }
  }
  // (a page that should end on a payoff does: its last scene becomes one)
  if (cont && cont.payoff && Array.isArray(tl.rhythm) && tl.rhythm.length) tl.rhythm[tl.rhythm.length - 1] = 'payoff';
  tl.continuity = cont;
  return { timeline: tl, handoffs };
}
function moveWindow(A, at, ov) {
  const k = A.keys; const w = keyWindow(A, at);
  if (w.before >= 0) { const lo = w.before > 0 ? k[w.before - 1].g + 0.1 : -Infinity; k[w.before].g = q05(Math.max(lo, at + ov.from)); }
  if (w.after >= 0) { const hi = w.after < k.length - 1 ? k[w.after + 1].g - 0.1 : Infinity; k[w.after].g = q05(Math.min(hi, Math.max(at + ov.to, w.before >= 0 ? k[w.before].g + 0.25 : -Infinity))); }
}
// calm: the incoming scene's own beats wait until the seam's overlap is over (one thing arrives at a time)
function calmBeats(tl, k) {
  const start = r2(Math.min(0.6, Math.max(0, k.overlap.to) + 0.2));
  tl.beats.filter(b => b.scene === k.at && b.from < start).forEach(b => { const d = b.to - b.from; b.from = start; b.to = r2(Math.min(1, start + Math.max(0.1, d))); });
}

// ---------------------------------------------------------------- the critic (deterministic part)
const choreoMoves = s => !!(s && s.choreo && !['settle', 'actor'].includes(s.choreo));
const LONG = ['cardstream', 'scale-through', 'zoom-away', 'track', 'travel', 'depth'];
// how many things move during a seam's overlap
function movingAt(plan, k) {
  const t = plan.timeline; const prev = plan.scenes[k.at - 1], next = plan.scenes[k.at]; let m = 0;
  if (choreoMoves(prev) && LONG.includes(prev.choreo)) m++;
  if (choreoMoves(next) && !(next.choreo === 'expand' && k.family === 'image-expand')) m++;
  m += t.actors.filter(a => a.role !== 'background' && a.from <= k.at - 1 && a.to >= k.at).length;
  if (k.typography !== 'none' && k.carriedActor !== 'typography') m++;
  if (TL.SIGNATURE.includes(k.family)) m++;
  m += t.beats.filter(b => b.scene === k.at && b.from <= Math.max(0, k.overlap.to) + 0.1).length;
  m += t.beats.filter(b => b.scene === k.at - 1 && b.to >= 1 + k.overlap.from + 0.1 && b.from < 1 + k.overlap.from).length;
  return m;
}
function critique(plan, byId) {
  const t = plan && plan.timeline; const cont = t && t.continuity; if (!cont) return [];
  const K = cont.contracts; const issues = []; const add = (code, at) => { if (!issues.some(x => x.code === code && x.at === at)) issues.push({ code, at }); };
  const surf = s => (s && s.ink && s.ink.surface) || '';
  let resets = 0;
  K.forEach(k => {
    const prev = plan.scenes[k.at - 1], next = plan.scenes[k.at]; const far = colourDistance(surf(prev), surf(next)) > 140;
    // a hard reset: a cut (one deliberate cut is allowed, never the first seam and never between far-apart colours), or
    // a bare colour change between very different scenes with nothing crossing and almost no overlap
    if (k.family === 'cut') { resets++; if (resets > LIMITS.resets || k.at === 1 || far) add('hard-reset', k.at); }
    else if (k.carriedActor === 'none' && k.outgoing.el === 'surface' && far && k.overlap.to - k.overlap.from < 0.35) add('hard-reset', k.at);
    // an unrelated swap: a transition that says "this picture becomes the next" between two pictures that have nothing to
    // do with each other
    if (['image-expand', 'card-expand', 'type-mask'].includes(k.family) && k.carriedAsset) {
      const outs = imagesOf(prev).concat(t.actors.filter(a => a.kind === 'image' && a.from <= k.at - 1 && a.to >= k.at - 1).map(a => a.asset));
      const h = heroOf(plan, byId); const P = id => (byId.get(id) ? profileOf(byId.get(id), h && h.id) : null);
      const linked = k.family === 'card-expand' ? outs.includes(k.carriedAsset) || outs.some(o => related(o, k.carriedAsset, byId)) : outs.some(o => related(o, k.carriedAsset, byId) || pairFit(P(o), P(k.carriedAsset), byId).score >= 0.5);
      if (outs.length && !linked) add('unrelated-swap', k.at);
    }
    // a dead gap: the outgoing scene is gone before the next arrives
    if (k.overlap.to - k.overlap.from < OVERLAP.min - 1e-9) add('dead-gap', k.at);
    else if (t.actors.some(a => a.kind === 'image' && a.to === k.at - 1 && a.exit !== 'rejoin') && !focalOf(next) && ['color-bleed', 'cut'].includes(k.family)) add('dead-gap', k.at);
    // disconnected: a contract that names what is not there, or whose two sides do not meet
    const act = k.carriedActor !== 'none' ? t.actors.find(a => a.role === k.carriedActor) : null;
    if ((k.carriedActor !== 'none' && !act) || (k.carriedAsset && !byId.get(k.carriedAsset)) || JSON.stringify(k.outgoing) !== JSON.stringify(k.incoming)) add('disconnected', k.at);
    if (act && act.kind === 'image') { const v = TL.stateAt(act, k.at); if (Math.abs(v.x - k.outgoing.x) > 1 || Math.abs(v.s - k.outgoing.s) > 0.02) add('disconnected', k.at); }
    if (movingAt(plan, k) > LIMITS.moving) add('competing-motion', k.at);
  });
  // the same big idea twice in a row, or three times on one page
  const sig = K.filter(k => TL.SIGNATURE.includes(k.family));
  K.forEach((k, i) => { if (i && TL.SIGNATURE.includes(k.family) && K[i - 1].family === k.family) add('duplicate-motion', k.at); });
  const count = {}; sig.forEach(k => { count[k.family] = (count[k.family] || 0) + 1; if (count[k.family] === 3) add('duplicate-motion', k.at); });
  // visual rest: never three loud seams in a row (a physical carry is a loud move too)
  let loud = 0; K.forEach(k => { loud = TL.SIGNATURE.includes(k.family) || k.carry === 'strong' || (k.intent === 'carry' && t.rhythm[k.at] !== 'rest') ? loud + 1 : 0; if (loud === 3) add('no-rest', k.at); });
  // ...and never so quiet that a page meant to move only fades from section to section
  const mode = (plan.art && plan.art.mode) || 'expressive'; const moving = mode === 'expressive' || mode === 'immersive';
  if (moving && K.length >= 4 && !K.some(k => TL.SIGNATURE.includes(k.family) || k.family === 'actor-carry' || k.carry !== 'none')) {
    const best = K.filter(k => focalOf(plan.scenes[k.at])).sort((a, b) => (INTENSITY[t.rhythm[b.at]] || 2) - (INTENSITY[t.rhythm[a.at]] || 2) || a.at - b.at)[0];
    if (best) add('too-quiet', best.at);
  }
  // the same direction, or the same scale behaviour, three seams running reads as a loop, not a story
  K.forEach((k, i) => { if (i >= 2 && k.motionVector !== 'none' && K[i - 1].motionVector === k.motionVector && K[i - 2].motionVector === k.motionVector) add('same-direction', k.at); });
  K.forEach((k, i) => { if (i >= 2 && k.depthHandoff !== 'none' && K[i - 1].depthHandoff === k.depthHandoff && K[i - 2].depthHandoff === k.depthHandoff) add('same-scale', k.at); });
  // a page meant to move ends on a payoff -- or returns to what it opened with
  const n = plan.scenes.length;
  if (moving && n >= 4 && !['payoff', 'event', 'escalation'].includes(t.rhythm[n - 1]) && !(cont.callback && cont.callback.kind !== 'none')) add('no-payoff', n - 1);
  // a pasted-in hero video: a video that just stops where the page starts
  const h = cont.hero; const k1 = h ? K.find(k => k.at === h.into && h.into > h.scene) : null;
  if (h && h.video && k1 && (k1.family === 'cut' || (k1.carriedActor === 'none' && !related(k1.carriedAsset, h.asset, byId) && k1.overlap.to - k1.overlap.from < 0.35))) add('pasted-video', k1.at);
  return issues.slice(0, LIMITS.issues);
}
// the built-in fix for each finding
function fixesFor(issues, plan) {
  const K = (plan.timeline && plan.timeline.continuity && plan.timeline.continuity.contracts) || []; const out = [];
  issues.forEach(x => {
    const k = K.find(c => c.at === x.at);
    if (x.code === 'hard-reset' || x.code === 'unrelated-swap') out.push({ at: x.at, code: x.code, family: 'color-bleed', intent: 'continue', background: 'blend', overlap: { from: -0.45, to: 0.05 } });
    else if (x.code === 'dead-gap') out.push({ at: x.at, code: x.code, overlap: { from: k ? Math.min(k.overlap.from, k.overlap.to - 0.4) : -0.4, to: k ? k.overlap.to : 0 } });
    else if (x.code === 'competing-motion') out.push({ at: x.at, code: x.code, calm: true });
    else if (x.code === 'duplicate-motion' || x.code === 'no-rest') out.push({ at: x.at, code: x.code, family: 'color-bleed', intent: 'rest' });
    else if (x.code === 'disconnected') out.push({ at: x.at, code: x.code, reset: true });
    else if (x.code === 'pasted-video') out.push({ at: x.at, code: x.code, family: k && k.family === 'cut' ? 'color-bleed' : undefined, intent: 'continue', overlap: { from: -0.6, to: 0.1 }, heroEnd: 'static-frame' });
    else if (x.code === 'too-quiet') out.push({ at: x.at, code: x.code, family: 'image-expand', intent: 'continue' });
    else if (x.code === 'same-direction') out.push({ at: x.at, code: x.code, motionVector: 'none' });
    else if (x.code === 'same-scale') out.push({ at: x.at, code: x.code, family: 'color-bleed', carry: 'light' });
    else if (x.code === 'no-payoff') out.push({ at: x.at, code: x.code, payoff: true });
  });
  return out.slice(0, LIMITS.fixes);
}
// a fix, as a model or the built-in critic gives it (fixed vocabulary, bounded)
function cleanFixes(raw, n) {
  return (Array.isArray(raw) ? raw : []).slice(0, LIMITS.fixes).map(f => {
    if (!f || typeof f !== 'object' || !Number.isInteger(f.at) || f.at < 1 || f.at >= n || !CRITIC.includes(f.code)) return null;
    const o = { at: f.at, code: f.code };
    if (TL.TRANSITIONS.includes(f.family)) o.family = f.family;
    if (INTENTS.includes(f.intent)) o.intent = f.intent;
    if (BACKGROUNDS.includes(f.background)) o.background = f.background;
    if (TYPOGRAPHY.includes(f.typography)) o.typography = f.typography;
    if (f.overlap && typeof f.overlap === 'object') o.overlap = { from: num(f.overlap.from, OVERLAP.from[0], OVERLAP.from[1], -0.4), to: num(f.overlap.to, OVERLAP.to[0], OVERLAP.to[1], 0) };
    if (f.calm === true) o.calm = true;
    if (VIDEO_ENDS.includes(f.heroEnd)) o.heroEnd = f.heroEnd;
    // (a fix may only take motion away, lighten a carry, or turn the ending into a payoff)
    if (f.motionVector === 'none') o.motionVector = 'none';
    if (f.carry === 'none' || f.carry === 'light') o.carry = f.carry;
    if (f.payoff === true) o.payoff = true;
    return o;
  }).filter(Boolean);
}
// fold fixes into a raw continuity (a request: validated again before it is applied)
function withFixes(cont, fixes) {
  const c = JSON.parse(JSON.stringify(cont || {})); c.contracts = Array.isArray(c.contracts) ? c.contracts : [];
  (fixes || []).forEach(f => {
    let k = c.contracts.find(x => x.at === f.at); if (!k) { k = { at: f.at }; c.contracts.push(k); }
    if (f.reset) { delete k.carriedActor; delete k.carriedAsset; }
    ['family', 'intent', 'background', 'typography', 'overlap', 'motionVector', 'carry'].forEach(p => { if (f[p] !== undefined) k[p] = f[p]; });
    if (f.calm) k.calm = true;
    if (f.heroEnd) c.hero = Object.assign({}, c.hero || {}, { end: f.heroEnd });
    if (f.payoff) c.payoff = true;
  });
  return c;
}

module.exports = { videoMotion, estimateMotion, upgradeSeams, chooseSeams, relationOf, placementOf, RELATIONSHIPS, CARRY, PALETTE_HANDOFFS, DEPTH_HANDOFFS, TEXT_PLACEMENTS, VECTORS, INTENSITY, CARRIES, INTENTS, CARRIED, DEPTHS, MASKS, BACKGROUNDS, TYPOGRAPHY, CAMERAS, VIDEO_ENDS, CRITIC, OVERLAP, LIMITS, FAMILY, FRAME, usedAssets, profileOf, assetProfiles, pairFit, seamFit, heroOf, related, feasibleFamilies, normalise, apply, critique, fixesFor, cleanFixes, withFixes, movingAt, colourDistance };
