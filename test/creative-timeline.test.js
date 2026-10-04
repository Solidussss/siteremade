'use strict';
// CREATIVE AS ONE TIMELINE (lib/creative/timeline.js): actors that live across scenes with keyframes on one scroll axis,
// beats inside scenes, structured transitions between them, a rhythm with two or three memorable moments, behavioural
// anti-repetition, asset needs that follow the motion, and the renderer tier abstraction. The rules pinned here keep it
// continuous (no respawns, no resets), bounded (every number, every count), and honest on phones and with reduced motion.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const TL = require('../lib/creative/timeline');
const ART = require('../lib/creative/art');
const D2 = require('../lib/creative/director2');
const { validatePlan2 } = require('../lib/creative/validate2');
const { renderCreative2 } = require('../lib/creative/render2');
const { sanitizeCreative } = require('../lib/creative/store');
const RENDERERS = require('../lib/creative/renderers');

const A = (id, w, h, extra) => Object.assign({ id, origin: 'research', title: `File:${id}.jpg`, author: 'A. Photographer', license: 'CC BY 4.0', pageUrl: `https://example.org/${id}`,
  assess: { width: w, height: h, aspect: +(w / h).toFixed(3), orientation: w > h * 1.15 ? 'landscape' : h > w * 1.15 ? 'portrait' : 'square', subject: null, colours: ['#c0502e'], luminance: 120, background: { colour: '#333333', uniformity: 0.2 } },
  caps: { moveFreely: false, frame: true, backdrop: w > h, heroSize: true }, curation: { role: 'subject', identity: 'exact', depicts: id, issues: [] } }, extra || {});
const WIDE = A('wide', 2000, 1200, { assess: { width: 2000, height: 1200, aspect: 1.667, orientation: 'landscape', subject: [0.3, 0.2, 0.7, 0.85], colours: ['#c0502e'], luminance: 110, background: { colour: '#333333', uniformity: 0.3 } } });
const WIDE2 = A('wide2', 1900, 1100, { assess: { width: 1900, height: 1100, aspect: 1.727, orientation: 'landscape', subject: [0.25, 0.2, 0.75, 0.9], colours: ['#335577'], luminance: 100, background: { colour: '#222222', uniformity: 0.3 } } });
const TALL = A('tall', 900, 1400);
const PLAIN = A('plain', 1400, 1400, { assess: { width: 1400, height: 1400, aspect: 1, orientation: 'square', subject: [0.2, 0.12, 0.8, 0.9], colours: ['#2255cc'], luminance: 150, background: { colour: '#f4f4f4', uniformity: 0.95 } } });
const CUT = A('c-plain', 840, 1090, { origin: 'derived', cutout: true, cutoutOf: 'plain', assess: { width: 840, height: 1090, aspect: 0.771, orientation: 'portrait', transparent: true, subject: [0.02, 0.02, 0.98, 0.98], colours: ['#2255cc'], luminance: 96 }, caps: { moveFreely: true } });
const CUT2 = A('c-two', 800, 1000, { origin: 'upload', cutout: true, assess: { width: 800, height: 1000, aspect: 0.8, orientation: 'portrait', transparent: true, subject: [0.02, 0.02, 0.98, 0.98], colours: ['#cc2255'], luminance: 100 }, caps: { moveFreely: true } });
const MORE = A('more', 1300, 1000);
const SCENE = A('setting', 1800, 1000, { curation: { role: 'environment', identity: 'related', depicts: 'a street', issues: [] } });
const ASSETS = [WIDE, WIDE2, TALL, PLAIN, CUT, CUT2, MORE, SCENE];
const FACTS = ['A doughnut is a fried dough confection.', 'Doughnuts were popular in the Netherlands in the nineteenth century.', 'The ring shape became common in 1847.', 'Doughnuts may be glazed, frosted or filled with jam or custard, and they are sold in bakeries and supermarkets around the world in many varieties.', 'In 1920 an automated doughnut machine was invented.', 'Some doughnuts are made from potato dough.', 'National Doughnut Day is held in June.'].map((text, i) => ({ id: `f${i + 1}`, text, section: 'x' }));
const PAGE = { title: 'Doughnut', url: 'https://en.wikipedia.org/wiki/Doughnut', license: 'CC BY-SA 4.0' };
const u = (subject, brief, tone) => ({ kind: 'recognizable', subject, brief, tone: { register: tone } });
const ctxOf = (und, extra) => Object.assign({ assets: ASSETS, facts: FACTS, understanding: und, page: PAGE }, extra || {});
function page(subject, brief, tone, seed, extra) {
  const und = u(subject, brief, tone);
  const { plan, recipe } = D2.direct(Object.assign({ understanding: und, research: { page: PAGE, facts: FACTS }, assets: ASSETS, supplied: { facts: [], memories: [] }, seed }, extra || {}));
  return Object.assign(validatePlan2(plan, ctxOf(und, { art: recipe })), { recipe, und });
}
const story = (seed, mode) => page('Doughnut', 'a playful page about doughnuts', 'playful', seed, { prefer: { family: 'object-story', mode: mode || 'immersive' } });
const html = (plan, extra) => renderCreative2(plan, ASSETS, Object.assign({ mode: 'export', src: a => `${a.id}.png` }, extra || {}));
const BRIEFS = [['Grumpy Cat', 'An absurd shrine to Grumpy Cat, the internet meme', 'absurd'], ['Birkin bag', 'a quiet, expensive luxury fashion page', 'restrained'], ['Brian Eno', 'an experimental page for an ambient music pioneer', 'extravagant'], ['Quantum computer', 'a futuristic page about quantum computers', 'editorial'], ['The Great Wave', 'an editorial magazine long-read', 'editorial'], ['Doughnut', 'a playful page about doughnuts', 'playful'], ['Metropolis', 'a cinematic page for the 1927 film', 'cinematic'], ['Brutalism', 'a raw brutalist art project', 'serious']];
const ALL = BRIEFS.flatMap(([s, b, t]) => ['1', '2', '3'].map(seed => page(s, b, t, seed))).concat(['s1', 's2', 's3'].map(sd => story(sd)), ['e1', 'e2'].map(sd => story(sd, 'expressive')));
const withTl = ALL.filter(v => v.plan.timeline);
const rawTl = (extra) => Object.assign({ rhythm: ['setup', 'event', 'rest', 'escalation'], actors: [], beats: [], transitions: [], moments: [] }, extra || {});
const rawScenes = n => Array.from({ length: n }, (_, i) => ({ id: `s${i}`, purpose: 'x', height: 'screen', layout: i === 0 ? 'stage' : i === 1 ? 'stage' : i === 2 ? 'framed' : 'image', layers: i >= 2 ? [{ id: 'l1', kind: 'image', role: 'focal', asset: 'wide' }] : [], text: { heading: `Scene ${i + 1}`, body: 'A line long enough to be filled word by word as it is read slowly.', kind: 'imagined', alt: 'Look again' } }));

// ---------------------------------------------------------------- 1, 2 (continuity)
test('1. actor state continuity: a scene ends exactly where the next begins, for every actor on every page', () => {
  assert.ok(withTl.length >= 20, `${withTl.length} pages with a timeline`);
  withTl.forEach(v => {
    const tl = v.plan.timeline; const states = TL.sceneStates(tl, v.plan.scenes.length);
    for (let i = 0; i + 1 < states.length; i++) Object.keys(states[i]).forEach(id => { if (!states[i + 1][id]) return; assert.deepEqual(states[i][id].end, states[i + 1][id].start, `${v.plan.art.recipe}: ${id} at the seam into scene ${i + 2}`); });
  });
  // and across a carry the actor moves smoothly: sampled every hundredth of a scene, it never jumps
  const P = story('c1').plan; const prim = P.timeline.actors.find(a => a.role === 'primary'); assert.ok(prim, 'the story has a primary actor');
  // (continuous: the change between two samples shrinks with the distance between them -- a fast swoop, never a cut)
  let prev = TL.stateAt(prim, prim.from);
  for (let g = prim.from; g <= prim.to + 1; g += 0.001) { const s = TL.stateAt(prim, g); assert.ok(Math.abs(s.x - prev.x) < 1 && Math.abs(s.s - prev.s) < 0.02 && Math.abs(s.r - prev.r) < 1, `continuous at g=${g.toFixed(3)}`); prev = s; }
  // the rendered page carries exactly those keys (the runtime samples the same track)
  const keys = /class="ca" data-role="primary"[^>]*data-keys="([^"]*)"/.exec(html(P))[1].split(';').map(k => k.split(',').map(Number));
  assert.deepEqual(keys.map(k => k.slice(0, 6)), prim.keys.map(k => [k.g, k.x, k.y, k.s, k.r, k.o]));
});

test('2. no accidental respawn during a carry: an actor never fades out and back inside its run, and never jumps', () => {
  const scenes = rawScenes(4).map((s, i) => Object.assign({}, s, { layers: [], choreo: 'settle', text: { heading: 'x' } }));
  const { timeline, fixes } = TL.normalise(rawTl({ actors: [{ role: 'typography', text: 'Doughnut', from: 0, to: 2, keys: [{ g: 0, x: 0, y: 0, s: 1, o: 1 }, { g: 1.5, x: 0, y: 0, s: 1, o: 0 }, { g: 2.2, x: 0, y: 0, s: 1, o: 1 }, { g: 2.25, x: 30, y: 0, s: 1.9, o: 1 }, { g: 3, o: 0 }] }] }), { scenes, mode: 'immersive' });
  const k = timeline.actors[0].keys;
  assert.equal(k.find(x => x.g === 1.5).o, 1, 'the mid-run fade is taken out'); assert.ok(fixes.some(f => /stays visible/.test(f)));
  const jump = k.find(x => x.g === 2.25); assert.equal(jump.x, 0, 'two keys a twentieth of a scene apart cannot be 30vw apart'); assert.ok(fixes.some(f => /does not jump/.test(f)));
  // every page's actors hold their visibility inside their run
  withTl.forEach(v => v.plan.timeline.actors.filter(a => a.role !== 'background').forEach(a => { for (let g = a.from + 0.25; g < a.to + 0.75; g += 0.05) assert.ok(TL.stateAt(a, g).o >= 0.5, `${v.plan.art.recipe}: ${a.role} visible at ${g.toFixed(2)}`); }));
});

// ---------------------------------------------------------------- 3, 4, 5 (the vocabulary is the only door)
test('3. transitions are validated: unknown, impossible or over-budget families become a colour bleed', () => {
  const scenes = rawScenes(5).map((s, i) => Object.assign({}, s, { layers: i === 4 ? [{ id: 'l1', kind: 'image', role: 'focal', asset: 'wide', frame: 'bleed', box: { d: [0, 0, 100, 100] } }] : s.layers.map(L => Object.assign({ box: { d: [50, 10, 40, 80] } }, L)), choreo: 'settle' }));
  const t = TL.normalise(rawTl({ rhythm: ['setup', 'event', 'rest', 'escalation', 'payoff'], transitions: [{ at: 1, family: 'teleport' }, { at: 2, family: 'actor-carry' }, { at: 3, family: 'card-expand' }, { at: 4, family: 'type-mask' }] }), { scenes, mode: 'expressive' });
  assert.deepEqual(t.timeline.transitions.map(x => x.family), ['color-bleed', 'color-bleed', 'color-bleed', 'color-bleed'], 'no actor to carry, no card to open, no word to mask with');
  const ok = TL.normalise(rawTl({ actors: [{ role: 'typography', text: 'Doughnut', from: 0, to: 3, keys: [{ g: 0, o: 1 }, { g: 4, o: 0 }] }], rhythm: ['setup', 'event', 'rest', 'escalation', 'payoff'], transitions: [{ at: 1, family: 'foreground-wipe' }, { at: 2, family: 'shape-takeover' }, { at: 3, family: 'image-expand' }, { at: 4, family: 'type-mask' }] }), { scenes, mode: 'immersive' });
  assert.deepEqual(ok.timeline.transitions.map(x => x.family), ['foreground-wipe', 'shape-takeover', 'image-expand', 'type-mask']);
  // an editorial page keeps one signature transition; a quiet page none
  const ed = TL.normalise(rawTl({ rhythm: ['setup', 'event', 'rest', 'rest', 'rest'], transitions: [{ at: 1, family: 'foreground-wipe' }, { at: 2, family: 'shape-takeover' }] }), { scenes, mode: 'editorial' });
  assert.deepEqual(ed.timeline.transitions.slice(0, 2).map(x => x.family), ['foreground-wipe', 'color-bleed']);
  assert.ok(TL.normalise(rawTl({ transitions: [{ at: 1, family: 'foreground-wipe' }] }), { scenes, mode: 'quiet' }).timeline.transitions.every(x => !TL.SIGNATURE.includes(x.family)));
  // every page's transitions come from the vocabulary
  withTl.forEach(v => v.plan.timeline.transitions.forEach(x => assert.ok(TL.TRANSITIONS.includes(x.family))));
});

test('4. every timeline number is bounded: keys, scales against the picture, beat windows and values, counts', () => {
  const scenes = rawScenes(4).map(s => Object.assign({}, s, { choreo: 'settle' }));
  const small = Object.assign({}, CUT, { id: 'c-small', assess: Object.assign({}, CUT.assess, { height: 400 }) });
  const byId = new Map(ASSETS.concat([small]).map(a => [a.id, a]));
  const { timeline } = TL.normalise(rawTl({ actors: [{ role: 'primary', keys: Array.from({ length: 40 }, (_, i) => ({ g: i * 0.13 - 3, x: 900, y: -900, s: 99, r: 400, o: 7 })) }],
    beats: [{ scene: 2, from: -4, to: 9, op: 'scale', target: 'focal', v: 40 }, { scene: 2, from: 0.3, to: 0.31, op: 'translate', target: 'heading', v: 999, v2: -999 }, { scene: 3, op: 'background', target: 'scene', v: 'plaid' }] }),
    { scenes, mode: 'immersive', actor: { asset: 'c-small', from: 0, to: 1 }, byId, resCap: id => Math.min(1.4, byId.get(id).assess.height * 1.15 / 670) });
  const p = timeline.actors[0]; assert.ok(p.keys.length <= TL.LIMITS.keys);
  p.keys.forEach(k => { assert.ok(k.g >= p.from - 0.5 && k.g <= p.to + 1.1); assert.ok(Math.abs(k.x) <= 34 && Math.abs(k.y) <= 24 && Math.abs(k.r) <= 18 && k.o <= 1); assert.ok(k.s <= 400 * 1.15 / 670 + 1e-9, `scale ${k.s} held to what the picture holds`); });
  const b = timeline.beats; assert.equal(b.length, 3);
  assert.ok(b[0].from >= 0 && b[0].to <= 1 && b[0].v <= TL.VALUE.scale[1]); assert.ok(b[1].to - b[1].from >= 0.1); assert.ok(Math.abs(b[1].v) <= 24 && Math.abs(b[1].v2) <= 24); assert.equal(b[2].v, 'accent');
  withTl.forEach(v => { const t = v.plan.timeline; assert.ok(t.beats.length <= TL.LIMITS.beats && t.moments.length <= 3 && t.actors.length <= 4); });
});

test('5. at most three things move at once in a scene (two on a phone): beats give way first', () => {
  withTl.forEach(v => v.plan.scenes.forEach((s, i) => assert.ok(TL.movingIn(v.plan.timeline, i, s) <= TL.LIMITS.moving, `${v.plan.art.recipe}/${s.id}: ${TL.movingIn(v.plan.timeline, i, s)} moving`)));
  const scenes = rawScenes(4).map(s => Object.assign({}, s, { choreo: 'zoom-away' }));
  const { timeline, fixes } = TL.normalise(rawTl({ rhythm: ['setup', 'event', 'rest', 'escalation'], actors: [{ role: 'typography', text: 'Doughnut', from: 0, to: 3, keys: [{ g: 0, o: 1 }, { g: 4, o: 0 }] }], beats: [{ scene: 1, op: 'text-swap', target: 'heading' }, { scene: 1, op: 'word-fill', target: 'body' }, { scene: 1, op: 'background', target: 'scene' }] }), { scenes, mode: 'immersive' });
  assert.equal(timeline.beats.filter(b => b.scene === 1).length, 1, 'a choreography and an actor leave room for one beat'); assert.ok(fixes.some(f => /moving thing/.test(f)));
  const h = html(story('m5').plan); assert.match(h, /\.ca\[data-role="secondary"\],\.ca\[data-role="background"\]\{display:none\}/, 'phones: fewer actors at once');
});

// ---------------------------------------------------------------- 6, 7 (moments and rhythm)
test('6. hero moments: two or three on expressive and immersive pages, one at most on editorial, none on quiet -- each where it fits', () => {
  withTl.forEach(v => {
    const t = v.plan.timeline; const mode = v.plan.art.mode;
    assert.ok(t.moments.length <= TL.MODE_CAST[mode].moments, `${v.plan.art.recipe}: ${t.moments.length} moments on a ${mode} page`);
    t.moments.forEach(m => { assert.ok(TL.MOMENTS.includes(m.kind)); assert.ok(m.scene === 0 || t.rhythm[m.scene] !== 'rest', `${v.plan.art.recipe}: a moment never rests`); });
    if (mode === 'quiet') assert.equal(t.moments.length, 0);
  });
  const big = withTl.filter(v => ['expressive', 'immersive'].includes(v.plan.art.mode));
  assert.ok(big.filter(v => v.plan.timeline.moments.length >= 2).length >= big.length * 0.6, 'most expressive pages have two or three moments');
  // a moment is what its scene can carry
  withTl.forEach(v => v.plan.timeline.moments.forEach(m => { const L = v.plan.scenes[m.scene].layout; if (L === 'chapters') assert.equal(m.kind, 'chapter-flight'); if (L === 'takeover') assert.equal(m.kind, 'word-takeover'); }));
  const flow = TL.planFlow(() => 0.3, { family: 'object-story', mode: 'immersive', personality: 'playful', scenes: [{ layout: 'stage' }, { layout: 'stage' }, { layout: 'stage' }, { layout: 'lineup' }, { layout: 'text' }, { layout: 'text' }], actor: { from: 0, to: 2 }, shortName: true });
  assert.deepEqual(flow.moments.map(m => m.kind), ['actor-entrance', 'actor-turn', 'lineup-rush'], 'the actor arrives, turns, and the lineup rushes in');
});

test('7. setup -> event -> rest -> escalation -> payoff: never two events side by side, big moves only at events, quiet pages rest', () => {
  withTl.forEach(v => {
    const r = v.plan.timeline.rhythm; assert.equal(r[0], 'setup');
    for (let i = 1; i < r.length; i++) assert.ok(!(['event', 'escalation'].includes(r[i]) && ['event', 'escalation'].includes(r[i - 1])), `${v.plan.art.recipe}: ${r.join(' ')}`);
    v.plan.timeline.beats.filter(b => TL.INTENSE.includes(b.op)).forEach(b => assert.ok(r[b.scene] !== 'rest', `${v.plan.art.recipe}: ${b.op} in a resting scene`));
    if (v.plan.art.mode === 'quiet') { assert.ok(r.slice(1).every(x => x === 'rest')); assert.ok(v.plan.timeline.beats.every(b => !TL.INTENSE.includes(b.op))); }
  });
  const { timeline, fixes } = TL.normalise(rawTl({ rhythm: ['event', 'event', 'escalation', 'event'] }), { scenes: rawScenes(4), mode: 'expressive' });
  assert.deepEqual(timeline.rhythm, ['setup', 'event', 'rest', 'event']); assert.ok(fixes.some(f => /side by side/.test(f)));
  assert.equal(TL.normalise(rawTl({ beats: [{ scene: 2, op: 'perspective', target: 'stage', v: 10 }] }), { scenes: rawScenes(4), mode: 'expressive' }).timeline.beats.length, 0, 'a resting scene gets no perspective');
});

// ---------------------------------------------------------------- 8 (typography as an actor)
test('8. typography is an actor: the name breaks apart, sits behind the subject, recedes, or becomes the mask onto the next picture', () => {
  const typed = withTl.flatMap(v => v.plan.timeline.actors.filter(a => a.role === 'typography').map(a => ({ a, v })));
  assert.ok(typed.length >= 5, `${typed.length} typography actors`);
  assert.ok(new Set(typed.map(x => x.a.behavior)).size >= 2, 'more than one behaviour');
  typed.forEach(({ a, v }) => {
    assert.equal(a.kind, 'word'); assert.ok(a.text.length <= 24 && !/[<>]/.test(a.text)); assert.ok(['ghost', 'outline', 'solid'].includes(a.style));
    a.keys.forEach(k => assert.ok(k.sp >= 0 && k.sp <= 1 && k.s >= TL.BOUNDS.word.s[0] && k.s <= TL.BOUNDS.word.s[1]));
    if (a.behavior === 'break') { assert.equal(a.keys[0].sp, 1, 'it starts spread apart'); assert.ok(a.keys.some(k => k.sp === 0 && k.s < 0.5), 'and recedes small'); }
    if (a.behavior === 'mask') assert.ok(v.plan.timeline.transitions.some(t => t.family === 'type-mask' && t.at === a.to + 1) || !v.plan.timeline.transitions.some(t => t.family === 'type-mask'), 'a mask word ends where its mask begins');
    // on the page: behind the content (the back layer) -- or in front of the pictures where its continuity contracts put
    // it -- one element, its letters spread by translate only
    const h = html(v.plan); const front = v.plan.timeline.continuity.contracts.some(k => k.typography === 'front');
    const layer = front ? h.slice(h.indexOf('<div class="cr-cast cr-front"')) : h.slice(h.indexOf('<div class="cr-cast cr-back"'), h.indexOf('<main'));
    assert.match(layer, front ? /class="ca" data-depth="front" data-role="typography"/ : /class="ca" data-role="typography"/); assert.match(layer, /<span class="ch" style="--ci:0">/);
  });
  assert.match(html(typed[0].v.plan), /\.ca-word \.ch\{display:inline-block;translate:calc\(\(var\(--ci,0\) - \(var\(--cn,8\) - 1\) \/ 2\) \* var\(--sp,0\) \* \.45em\) 0\}/);
});

// ---------------------------------------------------------------- 9, 10, 11 (transitions on the page)
test('9. image expand: the next scene\'s picture grows from a window into the scene as it arrives -- a clip, never a zoom', () => {
  const v = withTl.find(x => x.plan.timeline.transitions.some(t => t.family === 'image-expand')); assert.ok(v, 'some page expands a picture');
  const at = v.plan.timeline.transitions.find(t => t.family === 'image-expand').at; const h = html(v.plan);
  assert.match(h, new RegExp(`data-scene="${at}"[^>]*data-seam-in="image-expand"`));
  const rule = /\.sc\[data-seam-in="image-expand"\] \.ly:is\(\[data-role="focal"\],\[data-role="subject"\]\) \.ly-loop\{[^}]*\}/.exec(h)[0];
  // (it opens from the window its continuity contract names -- the previous scene's frame -- else a centred window)
  assert.match(rule, /clip-path:inset\(calc\(\(1 - var\(--sn,1\)\) \* var\(--sit,30%\)\)/); assert.doesNotMatch(rule, /scale/);
  assert.ok(v.plan.scenes[at].layers.some(L => L.role === 'focal' && L.kind === 'image'), 'there is a picture to expand');
  assert.match(h, /s\.style\.setProperty\('--sn',cl\(1-top\/vh\)/, 'the runtime drives it from the scene\'s arrival');
});

test('10. mask transition: the name becomes the window onto the next scene\'s own picture, then opens -- shown at the size that scene shows it', () => {
  const scenes = [{ layout: 'giant-type' }, { layout: 'chapters' }];
  const flow = TL.planFlow(() => 0.01, { family: 'typography-led', mode: 'expressive', personality: 'kinetic', typo: 'giant', scenes, actor: null, shortName: true });
  assert.equal(flow.seams[0].family, 'type-mask'); assert.equal(flow.cast.typography.behavior, 'mask'); assert.equal(flow.cast.typography.to, 0);
  // rendered: one element with the word and the picture, the picture at cover (no enlargement), the letters as the window
  const P = JSON.parse(JSON.stringify(withTl.find(v => v.plan.timeline.actors.some(a => a.role === 'typography')).plan));
  const typo = P.timeline.actors.find(a => a.role === 'typography'); const at = Math.min(P.scenes.length - 1, typo.to + 1);
  P.scenes[at].layers = [{ id: 'bleed', kind: 'image', role: 'focal', asset: 'wide', frame: 'bleed', fit: 'cover', focus: '50% 50%', box: { d: [0, 0, 100, 100], m: [0, 0, 100, 100] }, z: 3, rotate: 0, opacity: 1, mask: 'none', treatment: 'none', entrance: { kind: 'fade', delay: 0, dur: 1 }, loop: { kind: 'none', amp: 1, period: 9 }, scroll: { kind: 'none', amount: 0 } }];
  P.timeline.transitions = P.timeline.transitions.map(t => (t.at === at ? { at, family: 'type-mask' } : t));
  const h = html(P);
  assert.match(h, new RegExp(`<div class="cs cs-mask" data-at="${at}"[^>]*><span class="csm-word" style="background-image:url\\('wide\\.png'\\)">`));
  assert.match(h, /\.csm-word\{[^}]*background-size:cover;[^}]*-webkit-background-clip:text;background-clip:text;color:transparent;scale:calc\(\.94 \+ min\(\.5, var\(--w,0\)\) \* \.12\)\}/, 'never more than its own size');
  assert.match(h, /\.csm-img\{[^}]*clip-path:circle\(/);
});

test('11. colour bleed: the scenes an actor crosses share one backdrop whose colour flows from scene to scene; a flood or takeover leaves the scene in its new colour', () => {
  const v = withTl.find(x => x.plan.timeline.actors.length); const h = html(v.plan);
  assert.match(h, /<div class="cr-cast cr-back" aria-hidden="true"><i class="cb cb-a"><\/i><i class="cb cb-b"><\/i>/);
  assert.match(h, /html\.cr-js:not\(\[data-motion="reduced"\]\) \.sc\[data-cast\]\{background:transparent!important\}/);
  v.plan.scenes.forEach((s, i) => assert.match(h, new RegExp(`data-scene="${i}"[^>]*data-surf="${s.ink.surface}"`)));
  // (a sweep reveals the second sheet through a moving mask instead of fading it -- still no repaint of a colour per frame)
  assert.match(h, /cb2\.style\.opacity=mode==='sweep'\?\(t>0\?'1':'0'\):String\(t\)/, 'the runtime crossfades two sheets (opacity, never a repaint of a colour per frame)');
  // a takeover beat: the scene rests in the new colour, which grows as a circle over the old one
  const tk = withTl.find(x => x.plan.timeline.beats.some(b => b.op === 'takeover')); assert.ok(tk, 'some page takes a scene over');
  const b = tk.plan.timeline.beats.find(x => x.op === 'takeover'); assert.equal(tk.plan.scenes[b.scene].background, b.v);
  assert.match(html(tk.plan), /<i class="sc-take" aria-hidden="true" data-b\d="takeover-in"><\/i>/);
});

// ---------------------------------------------------------------- 12, 13 (phones, reduced motion)
test('12. phones recompose the timeline: smaller moves, fewer actors, the actor above the words, no sideways overflow', () => {
  const h = html(story('p12').plan); const phone = h.slice(h.lastIndexOf('@media (max-width:720px)'));
  const all = h.slice(h.indexOf('/* phones: every archetype recomposes'));
  assert.match(all, /html\{--mk:\.5\}/, 'every beat moves half as far'); assert.match(h, /\* var\(--mk,1\)\)/);
  assert.match(all, /\.ca\[data-img\],\.actor-static\{top:calc\(var\(--nav\) \+ 1svh\);height:36svh;max-width:72vw;/, 'the picture actor stands in the top of the screen');
  assert.match(all, /rotate:clamp\(-8deg, calc\(var\(--ar,0\) \* 1deg\), 8deg\)/); assert.match(all, /\.cs-wipe\{skew:0deg 0\}/);
  assert.match(all, /\.ca\[data-role="typography"\]\{translate:calc\(-50% \+ var\(--ax,0\) \* \.4vw\)/);
  assert.match(h, /\.cr-cast\{position:fixed;inset:0;pointer-events:none;overflow:clip;display:none\}/); assert.match(h, /body\{[^}]*overflow-x:clip\}/);
  assert.ok(phone.length > 0);
});

test('13. reduced motion (and no scripting): the cast does not play, the actor rests in its scene, every beat and seam shows its finished state', () => {
  const P = story('r13').plan; const h = html(P);
  assert.match(h, /html\.cr-js:not\(\[data-motion="reduced"\]\) \.cr-cast\{display:block\}/); assert.match(h, /html\.cr-js:not\(\[data-motion="reduced"\]\) \.actor-static\{display:none\}/);
  assert.match(h, /<div class="actor-static" data-img style="--aa:[\d.]+;--ax:-?\d+;--ay:-?\d+;--as:[\d.]+;--ar:-?\d+"><img class="actor-img" data-asset="c-plain"[^>]*alt="[^"]+"/, 'a real picture with its alternative text');
  assert.match(h, /function frameCast\(y,red\)\{if\(red/); assert.match(h, /if\(red\)\{(?:if\(s\._ct\)compRest\(s\);)?s\._bw\.forEach\(function\(b,j\)\{s\.style\.removeProperty\('--b'\+j\)\}\)/);
  // with no beat progress, every rule falls back to the scene at rest: in-beats read 1, out-beats read 0
  assert.match(h, /\[data-b0="scale-in"\]\{scale:calc\(1 \+ \(var\(--v0,0\) - 1\) \* \(1 - var\(--b0,1\)\) \* var\(--mk,1\)\)\}/);
  assert.match(h, /\[data-b0="translate-out"\]\{translate:calc\(var\(--v0,0\) \* var\(--b0,0\) \* 1vw/);
  assert.match(h, /\.sc-bgx\[data-b0="background-in"\]\{opacity:calc\(1 - var\(--b0,1\)\)\}/);
  // (unset, a beat is finished: the swapped-in heading shows whole -- and the swap is one line, then the other, never both)
  assert.match(h, /\[data-b0="text-swap-in"\] \.hs-main\{opacity:clamp\(0, var\(--b0,1\) \* 2\.2 - 1\.2, 1\)/);
  assert.match(h, /\[data-b0="text-swap-in"\] \.hs-alt\{opacity:clamp\(0, 1 - var\(--b0,1\) \* 2\.2, 1\)/);
  assert.match(h, /\.sc\[data-seam-in="image-expand"\][^{]*\{clip-path:inset\(calc\(\(1 - var\(--sn,1\)\)/, 'an expanding picture rests open');
});

// ---------------------------------------------------------------- 14 (behavioural anti-repetition)
test('14. anti-repetition compares how pages MOVE: different layouts with the same choreography still count as the same', () => {
  const beh = 'c:P0-1.T0-1|t:actor-carry,shape-takeover|r:SERXP|m:actor-entrance,actor-turn,lineup-rush|y:behind|p:accent-takeover|s:sequence';
  const a = `object-story.expressive.playful/sequence/stage,stage,lineup,gallery,text#${beh}`, b = `colour-progression.immersive.kinetic/flow/campaign,splitscreen,takeover,index,shrine#${beh}`;
  assert.ok(ART.layoutSimilarity(a.split('#')[0], b.split('#')[0]) < 0.25, 'their layouts are far apart');
  assert.equal(TL.behaviorSimilarity(beh, beh), 1); assert.ok(ART.similarity(a, b) >= 0.55, `alike overall: ${ART.similarity(a, b)}`);
  const other = 'c:none|t:image-expand,depth-handoff|r:SERRR|m:chapter-flight|y:fill|p:dark-to-light|s:continuous';
  assert.ok(TL.behaviorSimilarity(beh, other) < 0.3);
  // every page's stored fingerprint carries its behaviour, and a run of pages for one account varies how it moves
  withTl.forEach(v => { assert.match(v.plan.art.recipe, /#c:/); assert.equal(v.plan.art.recipe.split('#')[1], v.plan.timeline.behavior); });
  const hist = []; const bs = [];
  BRIEFS.forEach(([s, b2, t]) => { const v = page(s, b2, t, 'h', { history: hist.slice(-10) }); hist.push(v.plan.art.recipe); bs.push(v.plan.timeline ? v.plan.timeline.behavior : ''); });
  assert.ok(new Set(bs.map(x => x.split('|').slice(1, 4).join('|'))).size >= 6, 'transitions, rhythm and moments vary across eight pages');
});

// ---------------------------------------------------------------- 15, 16 (it all survives)
test('15. saving, reopening and exporting keep the timeline byte for byte', () => {
  const saved = v => sanitizeCreative({ brief: 'x', understanding: { kind: 'recognizable', subject: 'Doughnut' }, research: { page: PAGE, facts: FACTS }, assets: ASSETS.map(a => Object.assign({}, a, { assetRef: 'a'.repeat(64) })), plan: v.plan, history: [] });
  withTl.slice(0, 16).forEach(v => { const c1 = saved(v); const c2 = sanitizeCreative(JSON.parse(JSON.stringify(c1))); assert.equal(JSON.stringify(c1.plan), JSON.stringify(v.plan), 'saved as accepted'); assert.equal(JSON.stringify(c2.plan), JSON.stringify(c1.plan), 'reopened unchanged'); assert.ok(c2.plan.timeline); });
  // the export is the page the studio previewed, cast and all
  const v = story('x15');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sr-tl-export-'));
  process.env.SITEREMADE_BACKEND = 'local'; process.env.SITEREMADE_ASSET_STORE_DIR = path.join(dir, 'assets');
  const { getDatabaseAdapter } = require('../lib/adapters/database-adapter'); const projectStore = require('../lib/project-store'); const { compileExport } = require('../lib/export-compiler');
  const db = getDatabaseAdapter(':memory:');
  const pix = n => { const b = Buffer.alloc(80); b.write('\x89PNG\r\n\x1a\n', 0, 'latin1'); b.writeUInt32BE(13, 8); b.write('IHDR', 12); b.writeUInt32BE(10, 16); b.writeUInt32BE(10, 20); b.writeUInt32BE(n, 60); return 'data:image/png;base64,' + b.toString('base64'); };
  const assets = ASSETS.map((a, i) => Object.assign({}, a, { dataUrl: pix(i + 1), mime: 'image/png' }));
  const direction = { mode: 'creative', meta: { id: 'c1' }, pages: [{ id: 'creative', label: 'Creative page', sections: [] }], creative: { brief: 'doughnuts', understanding: { kind: 'recognizable', subject: 'Doughnut' }, research: { status: 'ok', page: PAGE, facts: FACTS }, assets, plan: v.plan } };
  const check = projectStore.validateDirectionsState({ directions: [direction], activeDirectionIndex: 0 }); assert.ok(check.valid, check.error);
  projectStore.internalizeAssets(db, check.normalized);
  const workDir = path.join(dir, 'export'); const res = compileExport(db, { project: { id: 'p15', revision: 1, directionsState: check.normalized }, directionIndex: 0, workDir });
  const out = fs.readFileSync(path.join(workDir, 'index.html'), 'utf8');
  const srcOf = a => (res.manifest.assets.find(m => m.hash === check.normalized.directions[0].creative.assets.find(x => x.id === a.id).assetRef) || {}).path || '';
  const strip = h => h.replace(/data-mode="\w+"/, '').replace(/"mode":"\w+"/, '').replace(/<script>\n\(function\(\)\{\nvar d=document[\s\S]*<\/script>/, '');
  assert.equal(strip(out), strip(renderCreative2(v.plan, assets, { mode: 'preview', src: srcOf })));
  assert.match(out, /class="cr-cast cr-front"/); assert.match(out, /data-role="primary"[^>]*data-keys="[-\d.,;]+"/);
});

test('16. old projects stay valid: pages saved before the timeline (and before modes) render exactly as they did', () => {
  const old = require('./fixtures/creative-saved-stage2.json').creative;
  const v = validatePlan2(old.plan, { mode: 'safety', assets: old.assets, facts: old.plan.facts, understanding: old.understanding });
  assert.equal(v.plan.timeline, undefined); assert.doesNotMatch(renderCreative2(v.plan, old.assets, { mode: 'export', src: a => a.id }), /<div class="cr-cast|data-renderer=|data-beats=/);
  // an art page from before modes: no timeline is invented on reopening
  const legacy = JSON.parse(JSON.stringify(page('Metropolis', 'a cinematic page for the 1927 film', 'cinematic', 'l').plan)); delete legacy.art.family; delete legacy.art.mode; delete legacy.timeline;
  const again = validatePlan2(legacy, ctxOf(u('Metropolis', 'x', 'cinematic'), { mode: 'safety' }));
  assert.equal(again.plan.timeline, undefined); assert.equal(JSON.stringify(again.plan.scenes), JSON.stringify(legacy.scenes));
});

// ---------------------------------------------------------------- the renderer tiers and the asset needs
test('renderer tiers: dom by default; a spatial request without a validated spatial block is dom, and loads nothing heavy (the tier itself: creative-spatial.test.js)', () => {
  assert.equal(RENDERERS.resolve({ timeline: { renderer: 'dom' } }).id, 'dom');
  assert.equal(RENDERERS.resolve({ timeline: { renderer: 'spatial' } }).id, 'dom', 'no spatial block');
  assert.equal(RENDERERS.RENDERERS.spatial.available, true);
  const P = JSON.parse(JSON.stringify(story('sp').plan)); P.timeline.renderer = 'spatial';
  const v = validatePlan2(P, ctxOf(u('Doughnut', 'x', 'playful'), { mode: 'safety' }));
  assert.equal(v.plan.timeline.renderer, 'dom', 'nothing spatial to draw: the page is dom'); assert.match(html(v.plan), /data-renderer="dom"/);
  assert.doesNotMatch(html(v.plan), /three|webgl|<canvas|cr-spatial/i, 'no heavy dependency is loaded');
});

test('asset needs follow the motion: a page records what its choreography needed from its pictures, and discovery searches for it', () => {
  const P = story('n1').plan; const needs = P.timeline.needs || [];
  assert.ok(needs.some(n => n.need === 'cutout' && n.met === P.actor.asset), JSON.stringify(needs));
  assert.deepEqual(TL.motionIntent({ identity: { kind: 'fictional', what: 'a video game character' } }), Object.assign(TL.motionIntent({ identity: { kind: 'fictional', what: 'a video game character' } }), { cutout: true }));
  const D = require('../lib/creative/discovery');
  const plan = D.planSearches({ identity: { name: 'Neon Brawl', kind: 'fictional', what: 'a fighting video game' }, visuals: { depiction: 'artwork' } }, { needs: { cutout: true, bleed: true } });
  assert.ok(plan.some(p => p.need === 'cutout' && /transparent png render/.test(p.q)) && plan.some(p => p.need === 'bleed' && /wallpaper/.test(p.q)));
  assert.deepEqual(D.planSearches({ identity: { name: 'X', kind: 'fictional', what: 'a fighting video game' } }).map(p => p.need).filter(Boolean), [], 'no need, no extra family');
});
