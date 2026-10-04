'use strict';
// CREATIVE SCROLL STORYTELLING: the scene model's second vocabulary (art.js families and intensity modes, the persistent
// actor, the new archetypes in archetypes.js, text treatments, scene exits) and how the renderer plays it (render2.js:
// the actor's rail, chapters, card streams, expanding pictures, word fills, cached-geometry runtime). The rules pinned here
// are the ones that keep it choreography rather than weight: bounded numbers from fixed vocabularies, one actor, no fake
// zoom, the mode's limits, phones and reduced motion. The browser review (test/review/creative-art-qa.js) looks at real pages.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const ART = require('../lib/creative/art');
const FR = require('../lib/creative/framing');
const ARCH = require('../lib/creative/archetypes');
const D2 = require('../lib/creative/director2');
const { validatePlan2 } = require('../lib/creative/validate2');
const { renderCreative2 } = require('../lib/creative/render2');
const { sanitizeCreative } = require('../lib/creative/store');

// the same pictures as creative-art.test.js (each with the brightness the studio measures on every picture): a wide sharp photo (subject located), a portrait, a tight close-up, a
// plain-background photo with its clean cut-out, a setting, one more photo
const A = (id, w, h, extra) => Object.assign({ id, origin: 'research', title: `File:${id}.jpg`, author: 'A. Photographer', license: 'CC BY 4.0', pageUrl: `https://commons.wikimedia.org/wiki/File:${id}.jpg`,
  assess: { width: w, height: h, aspect: +(w / h).toFixed(3), orientation: w > h * 1.15 ? 'landscape' : h > w * 1.15 ? 'portrait' : 'square', subject: null, colours: ['#c0502e'], luminance: 120, background: { colour: '#333333', uniformity: 0.2 } },
  caps: { moveFreely: false, frame: true, backdrop: w > h, heroSize: true }, curation: { role: 'subject', identity: 'exact', depicts: id, issues: [] } }, extra || {});
const WIDE = A('wide', 2000, 1200, { assess: { width: 2000, height: 1200, aspect: 1.667, orientation: 'landscape', subject: [0.3, 0.2, 0.7, 0.85], colours: ['#c0502e', '#223344', '#ddeeff'], luminance: 110, background: { colour: '#333333', uniformity: 0.3 } } });
const TALL = A('tall', 900, 1400);
const TIGHT = A('tight', 1200, 1200, { assess: { width: 1200, height: 1200, aspect: 1, orientation: 'square', subject: [0.01, 0.0, 0.99, 1.0], colours: ['#a03020'], luminance: 100, background: { colour: '#eeeeee', uniformity: 0.3 } } });
const PLAIN = A('plain', 1400, 1400, { assess: { width: 1400, height: 1400, aspect: 1, orientation: 'square', subject: [0.2, 0.12, 0.8, 0.9], colours: ['#2255cc'], luminance: 150, background: { colour: '#f4f4f4', uniformity: 0.95 } } });
const CUT = A('c-plain', 840, 1090, { origin: 'derived', cutout: true, cutoutOf: 'plain', assess: { width: 840, height: 1090, aspect: 0.771, orientation: 'portrait', transparent: true, subject: [0.02, 0.02, 0.98, 0.98], colours: ['#2255cc'], luminance: 96 }, caps: { moveFreely: true } });
const SCENE = A('setting', 1800, 1000, { curation: { role: 'environment', identity: 'related', depicts: 'a street', issues: [] } });
const MORE = A('more', 1300, 1000);
const ASSETS = [WIDE, TALL, TIGHT, PLAIN, CUT, SCENE, MORE];
const FACTS = ['A doughnut is a fried dough confection.', 'Doughnuts were popular in the Netherlands in the nineteenth century.', 'The ring shape became common in 1847.', 'Doughnuts may be glazed, frosted or filled with jam or custard, and they are sold in bakeries and supermarkets around the world in many varieties.', 'In 1920 an automated doughnut machine was invented.', 'Some doughnuts are made from potato dough.', 'National Doughnut Day is held in June.']
  .map((text, i) => ({ id: `f${i + 1}`, text, section: 'x' }));
const PAGE = { title: 'Doughnut', url: 'https://en.wikipedia.org/wiki/Doughnut', license: 'CC BY-SA 4.0' };
const BRIEFS = [
  ['Grumpy Cat', 'An absurd shrine to Grumpy Cat, the internet meme', 'absurd'], ['Birkin bag', 'a quiet, expensive luxury fashion page', 'restrained'],
  ['Brian Eno', 'an experimental page for an ambient music pioneer', 'extravagant'], ['Quantum computer', 'a futuristic page about quantum computers', 'editorial'],
  ['The Great Wave', 'an editorial magazine long-read about a woodblock print', 'editorial'], ['Doughnut', 'a playful page about doughnuts', 'playful'],
  ['Metropolis', 'a cinematic page for the 1927 film', 'cinematic'], ['Brutalism', 'a raw brutalist art project about architecture', 'serious'],
];
const u = (subject, brief, tone) => ({ kind: 'recognizable', subject, brief, tone: { register: tone } });
const ctxOf = (und, extra) => Object.assign({ assets: ASSETS, facts: FACTS, understanding: und, page: PAGE }, extra || {});
function page(subject, brief, tone, seed, extra) {
  const und = u(subject, brief, tone);
  const { plan, recipe } = D2.direct(Object.assign({ understanding: und, research: { page: PAGE, facts: FACTS }, assets: ASSETS, supplied: { facts: [], memories: [] }, seed }, extra || {}));
  const v = validatePlan2(plan, ctxOf(und, { art: recipe }));
  return Object.assign(v, { recipe, und });
}
// an object story: the built-in director asked for the family (the chooser gives it to subjects with a clean cut-out)
const story = (seed, mode) => page('Doughnut', 'a playful page about doughnuts', 'playful', seed, { prefer: { family: 'object-story', mode: mode || 'immersive' } });
const html = (plan, mode) => renderCreative2(plan, ASSETS, { mode: mode || 'export', src: a => `${a.id}.png` });
const NEW = ['stage', 'campaign', 'splitscreen', 'fullscreen-object', 'orbit', 'index', 'scrapbook', 'takeover', 'chapters', 'lineup', 'cardstream', 'edge-crop'];
const SEEDS = ['1', '2', '3', '4'];
const ALL = BRIEFS.flatMap(([s, b, t]) => SEEDS.map(seed => page(s, b, t, seed)));
// a raw plan as a model might return it (the renderer's vocabulary only; the validator decides what stands)
const rawScene = (id, extra) => Object.assign({ id, purpose: 'x', height: 'screen', layers: [{ id: 'l1', kind: 'image', role: 'focal', asset: 'wide' }], text: { heading: `Scene ${id}`, kind: 'imagined' } }, extra || {});
const rawPlan = (scenes, extra) => Object.assign({ identity: { name: 'Doughnut', kind: 'recognizable' }, concept: { title: 'Doughnut', logline: 'x' }, palette: { bg: '#101014', bg2: '#1c1c22', ink: '#f4f1ea', muted: '#b9b4aa', accent: '#e4572e', glow: '#ffd166' }, type: { display: 'grotesk' }, atmosphere: { backdrop: 'solid' }, motion: { tempo: 'measured' }, assetNotes: [], scenes }, extra || {});

// ---------------------------------------------------------------- 1, 2 (variety at the level of the arc)
test('1. different subjects get different compositions, drawn from the second vocabulary too', () => {
  // (an opening's structure is its composition when it has one: composition.js)
  const recipes = new Set(ALL.map(v => v.plan.art.recipe)); const heroes = new Set(ALL.map(v => v.plan.scenes[0].composition || v.plan.scenes[0].layout));
  const layouts = new Set(ALL.flatMap(v => v.plan.scenes.map(s => s.layout)));
  assert.ok(recipes.size >= 28, `${ALL.length} pages, ${recipes.size} distinct recipes`);
  assert.ok(heroes.size >= 7, `opening compositions: ${[...heroes]}`);
  // (and the motion-first stages the compositions are staged on: composition.js)
  const fresh = NEW.concat(['object-stage', 'depth-stack', 'type-stage', 'mask-stage', 'image-wall', 'canvas']).filter(k => layouts.has(k));
  assert.ok(fresh.length >= 7, `new archetypes in use: ${fresh}`);
  // each page is several different compositions, not one repeated
  ALL.forEach(v => { const L = v.plan.scenes.map(s => s.layout).filter(k => k !== 'stage'); assert.ok(new Set(L).size >= Math.min(L.length, 3), `${v.plan.art.recipe}`); });
  // and pages made one after another for one account keep moving apart (history)
  const hist = []; const fams = [];
  BRIEFS.forEach(([s, b, t]) => { const v = page(s, b, t, 'h', { history: hist.slice(-10) }); hist.push(v.plan.art.recipe); fams.push(v.plan.art.family); });
  const sims = []; for (let i = 0; i < hist.length; i++) for (let j = i + 1; j < hist.length; j++) sims.push(ART.similarity(hist[i], hist[j]));
  // (0.22, was 0.2: a page with a look commits to a few devices and never crosses a seam with a flat shape, so how pages
  // MOVE has fewer, stronger options -- their families, layouts and arcs still differ: layout similarity stays near 0.1;
  // 0.23, was 0.22: a scene left without a picture is set in words, so a few more pages share a typographic device)
  assert.ok(sims.reduce((a, b) => a + b, 0) / sims.length < 0.23, `mean similarity ${sims.reduce((a, b) => a + b, 0) / sims.length}`);
  const lsim = []; for (let i = 0; i < hist.length; i++) for (let j = i + 1; j < hist.length; j++) lsim.push(ART.layoutSimilarity(hist[i].split('#')[0], hist[j].split('#')[0]));
  assert.ok(lsim.reduce((a, b) => a + b, 0) / lsim.length < 0.15, 'the compositions themselves stay far apart');
  assert.ok(new Set(fams).size >= 6, `families in a row of eight: ${fams}`);
});

test('2. choreography families and intensity modes: several arcs, several intensities, each inside its limits', () => {
  const fams = new Set(ALL.map(v => v.plan.art.family)); const modes = new Set(ALL.map(v => v.plan.art.mode));
  assert.ok(fams.size >= 6, `families: ${[...fams]}`); assert.ok(modes.size >= 3, `modes: ${[...modes]}`);
  ALL.forEach(v => {
    const a = v.plan.art; const lim = ART.MODE_LIMITS[a.mode];
    assert.ok(ART.FAMILY[a.family].modes.includes(a.mode), `${a.recipe}: ${a.family} is never played ${a.mode}`);
    // (a composition held while its camera plays counts against the mode's composition holds, a layout's pin against its pins)
    const COMP = require('../lib/creative/composition'); const comp = s => s.choreo === 'compose' && COMP.SPEC[s.composition] && COMP.SPEC[s.composition].hold;
    const pins = v.plan.scenes.filter(s => s.pin && !comp(s)).length; assert.ok(pins <= lim.pins, `${a.recipe}: ${pins} held scenes, ${a.mode} allows ${lim.pins}`);
    const holds = v.plan.scenes.filter(s => s.pin && comp(s)).length; assert.ok(holds <= (COMP.HOLDS[a.mode] || 0), `${a.recipe}: ${holds} held compositions, ${a.mode} allows ${COMP.HOLDS[a.mode] || 0}`);
    const driven = v.plan.scenes.filter(s => s.choreo && s.choreo !== 'settle' && s.choreo !== 'actor').length; assert.ok(driven <= lim.driven, `${a.recipe}: ${driven} driven scenes`);
    if (a.mode === 'quiet') assert.ok(v.plan.scenes.every(s => ['settle', 'mask-reveal', 'type-wipe', 'word-fill'].includes(s.choreo) && !s.pin), `${a.recipe}: a quiet page only settles and reveals`);
  });
  // not every page is immersive: calm registers stay calm
  assert.ok(ALL.filter(v => v.plan.art.mode === 'immersive').length <= ALL.length / 3, 'immersive is the exception');
  ALL.filter(v => ['restrained', 'serious'].includes(v.und.tone.register)).forEach(v => assert.notEqual(v.plan.art.mode, 'immersive', v.plan.art.recipe));
});

// ---------------------------------------------------------------- 3, 4 (the persistent actor)
test('3. a persistent actor: ONE picture of the subject lives across its run -- never re-pasted into each scene', () => {
  const v = story('a1'); const P = v.plan; const act = P.actor;
  assert.ok(act, 'the object story carries an actor');
  const a = ASSETS.find(x => x.id === act.asset); assert.ok(a.cutout || a.assess.transparent, 'a clean cut-out');
  assert.ok(act.to > act.from && act.to - act.from + 1 <= ART.MODE_LIMITS[P.art.mode].actor);
  for (let i = act.from; i <= act.to; i++) {
    assert.equal(P.scenes[i].layout, 'stage', `scene ${i} is an actor scene`);
    assert.ok(!P.scenes[i].layers.some(L => L.kind === 'image' && (L.asset === act.asset || L.asset === a.cutoutOf)), `scene ${i} does not paste the subject again`);
  }
  const h = html(P);
  // one element on the cast layer carries it through the run (plus its resting copy for reduced motion / no scripting)
  assert.equal((h.match(/class="ca" data-role="primary"/g) || []).length, 1, 'one actor on the page');
  assert.equal((h.match(/class="ca-img" data-asset="/g) || []).filter(Boolean).length, (P.timeline.actors.filter(x => x.kind === 'image').length), 'one picture element per picture actor');
  assert.equal((h.match(/class="actor-static"/g) || []).length, 1, 'and one resting copy, in the scene it opens');
  for (let i = act.from; i <= act.to; i++) assert.match(h, new RegExp(`data-scene="${i}"[^>]*data-cast`), `scene ${i} is part of the actor's run`);
  assert.match(h, new RegExp(`class="ca-img" data-asset="${act.asset}"`));
  // its picture is credited like any other
  assert.ok(P.credits.some(c => c.asset === a.cutoutOf) && P.derived.some(d => d.asset === act.asset));
  // quiet and editorial pages carry no actor
  const calm = page('Doughnut', 'a playful page about doughnuts', 'playful', 'c1', { prefer: { family: 'editorial-sticky', mode: 'editorial' } });
  assert.equal(calm.plan.actor, undefined);
});

test('4. the actor carries between scenes: bounded poses, eased by the runtime, the run joined by cuts or colour', () => {
  const P = story('a2').plan; const act = P.actor;
  assert.equal(act.poses.length, act.to - act.from + 1);
  assert.ok(new Set(act.poses.map(q => `${q.x},${q.s},${q.r}`)).size >= 2, 'the actor moves between scenes');
  assert.ok(['offstage', 'shrink', 'rejoin'].includes(act.exit));
  for (let i = act.from + 1; i <= act.to; i++) assert.ok(['cut', 'bleed'].includes(P.scenes[i].handoff), `scene ${i} meets the run with ${P.scenes[i].handoff}`);
  if (P.scenes[act.to + 1]) assert.notEqual(P.scenes[act.to + 1].handoff, 'stack', 'nothing holds across the end of the run');
  const h = html(P);
  const keys = /class="ca" data-role="primary"[^>]*data-keys="([^"]*)"/.exec(h)[1]; assert.match(keys, /^[-\d.,;]+$/, 'numbers only');
  const prim = P.timeline.actors.find(x => x.role === 'primary'); assert.equal(keys.split(';').length, prim.keys.length);
  // the renderer moves it with translate, scale, rotate and opacity only, from its numbers
  const actorCss = /\n\.ca\{[^}]*\}/.exec(h)[0];
  assert.match(actorCss, /translate:calc\(-50% \+ var\(--ax,0\) \* 1vw\)/); assert.match(actorCss, /scale:var\(--as,1\)/); assert.match(actorCss, /rotate:calc\(var\(--ar,0\) \* 1deg\)/);
  assert.doesNotMatch(actorCss, /left:calc|width:calc\(var/, 'no layout properties are animated');
  assert.match(h, /function sample\(A,g\)/);
  // a model's run inside which scenes slide or stack is joined by cuts instead, and the scene after it cannot stack
  const raw = rawPlan([rawScene('a', { layout: 'stage' }), rawScene('b', { layout: 'stage', handoff: 'overlap' }), rawScene('c', { handoff: 'stack', layout: 'framed' })], { art: { personality: 'playful', scroll: 'sequence', family: 'object-story', mode: 'expressive' }, actor: { asset: 'c-plain', from: 0, to: 1, poses: [{ x: -10, y: 0, s: 1, r: 4 }, { x: 12, y: 2, s: 1.1, r: -4 }], exit: 'shrink' } });
  const v = validatePlan2(raw, ctxOf(u('Doughnut', 'x', 'playful')));
  assert.deepEqual(v.plan.scenes.slice(0, 2).map(s => s.handoff), ['cut', 'cut']); assert.notEqual(v.plan.scenes[2].handoff, 'stack', 'nothing holds across the end of the run');
});

// ---------------------------------------------------------------- 5, 6, 7 (the schema is the only door)
test('5. the scene schema: new fields validate; anything outside the vocabulary is dropped, never passed on', () => {
  const raw = rawPlan([
    rawScene('a', { layout: 'campaign', sceneType: 'takeover', exit: 'fade', text: { heading: 'Behold', kind: 'imagined', treatment: 'outline' } }),
    rawScene('b', { layout: 'takeover', sceneType: 'hologram', exit: 'explode', text: { heading: 'A statement', body: 'One thought given all the room it needs today.', kind: 'imagined', treatment: 'blink' } }),
    rawScene('c', { layout: 'cardstream', layers: ['wide', 'tall', 'more', 'setting'].map((asset, k) => ({ id: `l${k}`, kind: 'image', role: k ? 'support' : 'focal', asset, seq: k })) }),
  ], { art: { personality: 'kinetic', scroll: 'sequence', family: 'hologram-story', mode: 'ludicrous', typo: 'giant' } });
  const v = validatePlan2(raw, ctxOf(u('Doughnut', 'x', 'playful')));
  const [a, b, c] = v.plan.scenes;
  assert.equal(v.plan.art.family, undefined, 'an unknown family is not kept'); assert.equal(v.plan.art.mode, undefined);
  assert.equal(b.sceneType, 'typography', 'the composer names what the scene is'); assert.notEqual(b.exit, 'explode');
  assert.ok(!b.text.treatment || ART.TREATMENTS.includes(b.text.treatment)); assert.equal(b.text.treatment, 'word-fill');
  assert.ok(ART.LAYOUTS.includes(a.layout) && ART.LAYOUTS.includes(c.layout));
  assert.ok(c.layers.filter(L => L.seq != null).every(L => Number.isInteger(L.seq) && L.seq >= 0 && L.seq <= 9));
  // everything the renderer reads is an enum or a bounded number: no string reaches CSS or script
  const h = html(v.plan);
  assert.doesNotMatch(h, /hologram|ludicrous|explode|blink/);
  // and the validator is idempotent on it
  assert.equal(JSON.stringify(validatePlan2(v.plan, ctxOf(u('Doughnut', 'x', 'playful'), { mode: 'safety' })).plan), JSON.stringify(v.plan));
});

test('6. out-of-range transforms are clamped: actor poses, card places, windows', () => {
  const raw = rawPlan([rawScene('a', { layout: 'stage' }), rawScene('b', { layout: 'stage' }), rawScene('c', { layout: 'stage' }), rawScene('d')],
    { art: { personality: 'chaotic', scroll: 'sequence', family: 'object-story', mode: 'immersive' }, actor: { asset: 'c-plain', from: -4, to: 99, poses: [{ x: 500, y: -99, s: 9, r: 90 }, { x: -500, y: 99, s: -3, r: -90 }, { x: 'left', y: null, s: '2', r: {} }], exit: 'teleport' } });
  const v = validatePlan2(raw, ctxOf(u('Doughnut', 'x', 'playful')));
  const act = v.plan.actor; assert.ok(act);
  assert.equal(act.from, 0); assert.ok(act.to <= 3 && act.to - act.from + 1 <= ART.MODE_LIMITS.immersive.actor);
  const res = Math.min(1.4, CUT.assess.height * 1.15 / 670);
  act.poses.forEach(q => { assert.ok(Math.abs(q.x) <= 30 && Math.abs(q.y) <= 20 && Math.abs(q.r) <= 18, JSON.stringify(q)); assert.ok(q.s >= 0.5 && q.s <= res + 1e-9, `scale ${q.s} within ${res}`); });
  assert.deepEqual(act.poses[0], { x: 30, y: -20, s: Math.round(res * 100) / 100, r: 18 });
  assert.deepEqual(act.poses[2], { x: 0, y: 0, s: 1, r: 0 }, 'nonsense becomes the rest pose');
  assert.equal(act.exit, 'offstage');
  // a layer's card place and window
  // (scene b shows a picture of its own: a picture appears once on a page -- the image ledger)
  const raw2 = rawPlan([rawScene('a'), rawScene('b', { layers: [{ id: 'l1', kind: 'image', role: 'focal', asset: 'setting', seq: 44, win: [-50, 400, 900, -3] }] })]);
  const L = validatePlan2(raw2, ctxOf(u('Doughnut', 'x', 'playful'))).plan.scenes[1].layers[0];
  assert.equal(L.seq, 9); assert.ok(L.win.every(n => typeof n === 'number' && Number.isFinite(n)));
});

test('7. bounded counts: one actor, runs no longer than the mode allows, at most three moving layers a scene, two expensive effects', () => {
  ALL.concat(SEEDS.map(s => story(`b${s}`)), SEEDS.map(s => story(`e${s}`, 'expressive'))).forEach(v => {
    const P = v.plan; const lim = ART.MODE_LIMITS[P.art.mode];
    if (P.actor) assert.ok(P.actor.to - P.actor.from + 1 <= lim.actor, `${P.art.recipe}: a run of ${P.actor.to - P.actor.from + 1}`);
    P.scenes.forEach(s => {
      assert.ok(s.layers.filter(L => L.scroll.kind !== 'none').length <= 3, `${P.art.recipe}/${s.id}: moving layers`);
      const cost = (['mask-reveal', 'expand', 'cardstream', 'chapters'].includes(s.choreo) ? 1 : 0) + (s.text.scrim ? 1 : 0) + s.layers.filter(L => (L.kind === 'image' && (L.treatment === 'duotone' || L.treatment === 'soft')) || (L.kind === 'shape' && L.shape.form === 'blob' && L.opacity > 0.15)).length;
      assert.ok(cost <= 2, `${P.art.recipe}/${s.id}: ${cost} expensive effects`);
    });
    assert.ok(P.scenes.filter(s => s.pin).length <= 3);
  });
  // a model that asks for an actor on an editorial page gets none
  const raw = rawPlan([rawScene('a', { layout: 'stage' }), rawScene('b', { layout: 'stage' }), rawScene('c')], { art: { personality: 'editorial', scroll: 'flow', family: 'editorial-sticky', mode: 'editorial' }, actor: { asset: 'c-plain', from: 0, to: 1, poses: [{}, {}] } });
  const v = validatePlan2(raw, ctxOf(u('Doughnut', 'x', 'playful')));
  assert.equal(v.plan.actor, undefined); assert.ok(v.fixes.some(f => /carries no actor/.test(f)));
});

// ---------------------------------------------------------------- 8, 9 (phones; reduced motion)
test('8. phones: the actor and every new choreography stay inside the screen and move less', () => {
  const P = story('m1').plan; const h = html(P);
  const phone = h.slice(h.indexOf('/* phones: the actor stands in the top of the screen'));
  const actor = /\.ca\[data-img\],\.actor-static\{top:calc\(var\(--nav\) \+ 1svh\);height:36svh;max-width:72vw;translate:calc\(-50% \+ var\(--ax,0\) \* \.35vw\) calc\(var\(--ay,0\) \* \.3vh\);rotate:clamp\(-8deg, calc\(var\(--ar,0\) \* 1deg\), 8deg\)\}/;
  assert.match(phone, actor, 'smaller moves, at most 8 degrees of turn');
  assert.match(phone, /\.ca\[data-role="secondary"\],\.ca\[data-role="background"\]\{display:none\}/, 'fewer actors at once on a phone');
  // every pose the validator allows keeps the actor's centre on a phone screen, and the rail clips anything larger
  const maxX = 30 * 0.35; assert.ok(50 + maxX < 100 && 50 - maxX > 0);
  assert.match(h, /\.cr-cast\{position:fixed;inset:0;pointer-events:none;overflow:clip;display:none\}/, 'the cast layer clips anything larger than the screen');
  assert.match(phone, /\.sc\[data-layout="stage"\] \.sc-stage\{height:38svh\}/, 'the actor scene keeps room for the actor above its words');
  assert.match(phone, /html\.cr-js \.sc\[data-pin\]:is\(\[data-choreo="cardstream"\],\[data-choreo="expand"\]\)\{height:calc\(100svh \+ var\(--pinv,110\) \* \.8svh\)\}/, 'shorter holds on phones');
  // letters spread less, lifts are shorter
  assert.match(phone, /\* \.1em\) 0\}/); assert.match(phone, /translate:0 calc\(var\(--xe\) \* -5vh\)/);
  // svh units and a clipped page (nothing pushes sideways)
  assert.match(h, /body\{[^}]*overflow-x:clip\}/); assert.match(h, /height:100svh/);
  // every new archetype has a phone stage
  NEW.forEach(k => assert.match(h, new RegExp(`\\.sc\\[data-layout="${k}"\\] \\.sc-stage\\{height:min\\(\\d+vw,\\d+svh\\)\\}`), k));
});

test('9. reduced motion (and no scripting): the finished composition of every new choreography', () => {
  const h = html(story('r1').plan, 'export');
  assert.match(h, /html\.cr-js:not\(\[data-motion="reduced"\]\) \.cr-cast\{display:block\}/, 'the cast plays only with motion on (and scripting)');
  assert.match(h, /html\.cr-js:not\(\[data-motion="reduced"\]\) \.actor-static\{display:none\}/, 'otherwise the actor rests in its first scene');
  ['html[data-motion="reduced"] .wf{opacity:1!important}', 'html[data-motion="reduced"] .sc-text .ch{translate:none!important}', 'html[data-motion="reduced"] .sc[data-pin][data-pin]{height:auto!important}', 'html[data-motion="reduced"] .sc[data-steps] .sc-item{grid-area:auto!important}',
    'html[data-motion="reduced"] .sc[data-exit] :is(.sc-stage,.sc-text){opacity:1!important;translate:none!important;scale:none!important}', 'html[data-motion="reduced"] .ly-loop{clip-path:none!important}',
    ':is(html[data-motion="reduced"],html:not(.cr-js)) .sc[data-choreo="chapters"] .ly[data-step]:not([data-step="0"]){opacity:0!important}']
    .forEach(rule => assert.ok(h.includes(rule), rule));
  // the fallbacks of the scroll variables are the finished state: words filled (pe 1), cards dealt (pe 0), windows open (pe 1)
  assert.match(h, /\.wf\{opacity:calc\(\.16 \+ \.84 \* clamp\(0, var\(--pe,1\)/); assert.match(h, /inset\(calc\(\(1 - var\(--pe,1\)\)/);
  // the runtime rests the actor in its first pose when reduced
  assert.match(h, /function frameCast\(y,red\)\{if\(red/, 'with reduced motion the cast does not play at all');
});

// ---------------------------------------------------------------- 10, 11, 12 (framing stays honest)
test('10. a moving actor is never a tight crop: only a clean cut-out can be the actor', () => {
  const run = asset => rawPlan([rawScene('a', { layout: 'stage' }), rawScene('b', { layout: 'stage' }), rawScene('c')], { art: { personality: 'playful', scroll: 'sequence', family: 'object-story', mode: 'expressive' }, actor: { asset, from: 0, to: 1, poses: [{ x: -10 }, { x: 10 }] } });
  const v = validatePlan2(run('tight'), ctxOf(u('Doughnut', 'x', 'playful')));
  assert.equal(v.plan.actor.asset, 'c-plain', 'the tight photo is replaced by the clean cut-out'); assert.ok(v.fixes.some(f => /carries the run/.test(f)));
  // with no cut-out at all there is no actor: each scene composes on its own
  const noCut = ASSETS.filter(a => !a.cutout);
  const v2 = validatePlan2(run('tight'), ctxOf(u('Doughnut', 'x', 'playful'), { assets: noCut }));
  assert.equal(v2.plan.actor, undefined); assert.ok(v2.plan.scenes.every(s => s.layout !== 'stage'), 'the run falls back to archetypes that frame pictures');
  // on a personal page the actor is the owner's own picture or nothing
  const own = Object.assign({}, CUT, { id: 'c-own', cutoutOf: 'own' }); const ownBase = Object.assign({}, PLAIN, { id: 'own', origin: 'upload', license: '' });
  const v3 = validatePlan2(run('c-plain'), ctxOf({ kind: 'personal', subject: 'Rex' }, { assets: ASSETS.concat([ownBase, own]) }));
  assert.equal(v3.plan.actor.asset, 'c-own');
});

test('11. nothing is enlarged past its picture: the actor, chapters, card streams and expanding pictures', () => {
  // a small cut-out cannot be scaled up past what its pixels hold
  const small = Object.assign({}, CUT, { id: 'c-small', assess: Object.assign({}, CUT.assess, { width: 300, height: 420 }) });
  const raw = rawPlan([rawScene('a', { layout: 'stage' }), rawScene('b', { layout: 'stage' }), rawScene('c')], { art: { personality: 'playful', scroll: 'sequence', family: 'object-story', mode: 'expressive' }, actor: { asset: 'c-small', from: 0, to: 1, poses: [{ s: 1.4 }, { s: 1.3 }] } });
  const v = validatePlan2(raw, ctxOf(u('Doughnut', 'x', 'playful'), { assets: ASSETS.concat([small]) }));
  v.plan.actor.poses.forEach(q => assert.ok(q.s <= 420 * 1.15 / 670 + 1e-9, `scale ${q.s}`));
  const h = html(story('z1').plan);
  // chapters push by 4% (inside the scroll ceiling), a card grows at most 12% as it passes, an expanding picture only opens its window
  assert.match(h, /\.sc\[data-choreo="chapters"\] \.ly\[data-step\]\.is-on\{scale:1\.04\}/); assert.ok(1.04 <= FR.ZOOM.scroll && 1 + 1.2 * 0.1 <= FR.ZOOM.scroll);
  const expand = /\.sc\[data-choreo="expand"\] \.ly\[data-win\] \.ly-loop\{[^}]*\}/.exec(h)[0]; assert.doesNotMatch(expand, /scale/);
  // an expanding picture fills the scene only within its bleed budget -- otherwise it is revealed in its frame
  const S = { id: 'x', layout: 'image', choreo: 'expand', handoff: 'cut', height: 'screen', pin: false, camera: 'none', layers: [{ id: 'a', kind: 'image', role: 'focal', asset: 'tall', box: { d: [50, 10, 40, 80], m: [10, 10, 80, 80] }, z: 5, rotate: 0, opacity: 1, mask: 'none', treatment: 'none', fit: 'cover', focus: '50% 50%', entrance: { kind: 'fade', delay: 0, dur: 1 }, loop: { kind: 'none', amp: 1, period: 9 }, scroll: { kind: 'none', amount: 0 } }], text: { heading: 'Tall', body: '', kind: 'imagined', region: 'left', size: 'large', width: 'medium', list: 'plain', entrance: 'rise', items: [] } };
  const fixes = []; ARCH.composeScene(S, { byId: new Map(ASSETS.map(a => [a.id, a])), si: 1, hero: false, art: { personality: 'cinematic', mode: 'expressive' }, rng: ART.rng('t'), name: 'Tall', fixes, warnings: [], side: 'right' });
  assert.notEqual(S.choreo, 'expand', 'a portrait picture is not stretched across a wide scene'); assert.ok(fixes.some(f => /revealed in its frame/.test(f)));
});

test('12. a close crop only where it is meant: the edge crop needs a located subject with room around it', () => {
  const byId = new Map(ASSETS.map(a => [a.id, a]));
  const compose = asset => { const S = { id: 'e', layout: 'edge-crop', choreo: 'settle', handoff: 'cut', height: 'screen', pin: false, camera: 'none', layers: [{ id: 'a', kind: 'image', role: 'focal', asset, box: { d: [50, 10, 40, 80], m: [10, 10, 80, 80] }, z: 5, rotate: 0, opacity: 1, mask: 'none', treatment: 'none', fit: 'cover', focus: '50% 50%', entrance: { kind: 'fade', delay: 0, dur: 1 }, loop: { kind: 'none', amp: 1, period: 9 }, scroll: { kind: 'none', amount: 0 } }], text: { heading: 'Edge', body: '', kind: 'imagined', region: 'left', size: 'large', width: 'medium', list: 'plain', entrance: 'rise', items: [] } };
    ARCH.composeScene(S, { byId, si: 1, hero: false, art: { personality: 'editorial', mode: 'editorial' }, rng: ART.rng('e'), name: 'Edge', fixes: [], warnings: [], side: 'right' }); return S; };
  const ok = compose('wide'); assert.equal(ok.layout, 'edge-crop'); assert.equal(ok.layers[0].frame, 'detail');
  assert.notEqual(compose('tight').layout, 'edge-crop', 'a picture the subject already fills is never cropped closer');
  assert.notEqual(compose('more').layout, 'edge-crop', 'nor one whose subject was never located');
  // the chooser only offers it for such a picture
  assert.equal(ART.eligible('edge-crop', ART.inventory([TIGHT, MORE]), {}, false), false);
});

// ---------------------------------------------------------------- 13, 14, 15, 16 (it all survives; nothing else changes)
function saved(v) { return sanitizeCreative({ brief: 'doughnuts', understanding: { kind: 'recognizable', subject: 'Doughnut' }, research: { page: PAGE, facts: FACTS }, assets: ASSETS.map(a => Object.assign({}, a, { assetRef: 'a'.repeat(64) })), plan: v.plan, history: [] }); }
test('13. saving and reopening keeps the choreography byte for byte: actor, modes, scene types, exits, treatments', () => {
  [story('s1'), story('s2', 'expressive')].concat(ALL.slice(0, 12)).forEach(v => {
    const c1 = saved(v); const c2 = sanitizeCreative(JSON.parse(JSON.stringify(c1)));
    assert.equal(JSON.stringify(c1.plan), JSON.stringify(v.plan), `${v.plan.art.recipe}: saved as accepted`);
    assert.equal(JSON.stringify(c2.plan), JSON.stringify(c1.plan), `${v.plan.art.recipe}: reopened unchanged`);
  });
  const P = saved(story('s3')).plan;
  assert.ok(P.actor && P.art.family === 'object-story' && P.art.mode);
  assert.ok(ALL.some(v => v.plan.scenes.some(s => s.exit)) && ALL.some(v => v.plan.scenes.some(s => s.text.treatment)) && ALL.every(v => v.plan.scenes.every(s => !s.sceneType || ART.SCENE_TYPES.includes(s.sceneType))));
});

test('14. the export is the page the studio previewed, actor and all', () => {
  const v = story('x1');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sr-scroll-export-'));
  process.env.SITEREMADE_BACKEND = 'local'; process.env.SITEREMADE_ASSET_STORE_DIR = path.join(dir, 'assets');
  const { getDatabaseAdapter } = require('../lib/adapters/database-adapter'); const projectStore = require('../lib/project-store'); const { compileExport } = require('../lib/export-compiler');
  const db = getDatabaseAdapter(':memory:');
  const pix = n => { const b = Buffer.alloc(80); b.write('\x89PNG\r\n\x1a\n', 0, 'latin1'); b.writeUInt32BE(13, 8); b.write('IHDR', 12); b.writeUInt32BE(10, 16); b.writeUInt32BE(10, 20); b.writeUInt32BE(n, 60); return 'data:image/png;base64,' + b.toString('base64'); };
  const assets = ASSETS.map((a, i) => Object.assign({}, a, { dataUrl: pix(i + 1), mime: 'image/png' }));
  const direction = { mode: 'creative', meta: { id: 'c1' }, pages: [{ id: 'creative', label: 'Creative page', sections: [] }], creative: { brief: 'doughnuts', understanding: { kind: 'recognizable', subject: 'Doughnut' }, research: { status: 'ok', page: PAGE, facts: FACTS }, assets, plan: v.plan } };
  const check = projectStore.validateDirectionsState({ directions: [direction], activeDirectionIndex: 0 }); assert.ok(check.valid, check.error);
  projectStore.internalizeAssets(db, check.normalized);
  const workDir = path.join(dir, 'export');
  const res = compileExport(db, { project: { id: 'p14', revision: 1, directionsState: check.normalized }, directionIndex: 0, workDir });
  const out = fs.readFileSync(path.join(workDir, 'index.html'), 'utf8');
  const srcOf = a => (res.manifest.assets.find(m => m.hash === check.normalized.directions[0].creative.assets.find(x => x.id === a.id).assetRef) || {}).path || '';
  const preview = renderCreative2(v.plan, assets, { mode: 'preview', src: srcOf });
  const strip = h => h.replace(/data-mode="\w+"/, '').replace(/"mode":"\w+"/, '').replace(/<script>\n\(function\(\)\{\nvar d=document[\s\S]*<\/script>/, '');
  assert.equal(strip(out), strip(preview), 'identical page apart from the preview-only script');
  assert.match(out, /class="cr-cast cr-front"/); assert.match(out, /data-role="primary"[^>]*data-keys="[-\d.,;]+"/);
  // the actor's picture is shipped with the page and credited
  const actorFile = srcOf({ id: v.plan.actor.asset }); assert.ok(actorFile && fs.existsSync(path.join(workDir, actorFile)), 'the actor picture is in the export');
  assert.match(out, /<h3>Pictures<\/h3>/);
});

test('15. what the scroll runtime reads: cached geometry, never a layout read per frame', () => {
  const h = html(story('p1').plan);
  const rt = h.slice(h.indexOf('<script>\n(function(){'));
  // the per-frame functions work from the scroll position and cached tops and heights
  const body = name => { const i = rt.indexOf(`function ${name}(`); let depth = 0, j = rt.indexOf('{', i); for (let k = j; k < rt.length; k++) { if (rt[k] === '{') depth++; else if (rt[k] === '}') { depth--; if (!depth) return rt.slice(i, k + 1); } } return ''; };
  ['frame', 'frameArt', 'navFrame', 'frameCast', 'sample', 'G', 'prog'].forEach(n => { const b = body(n); assert.ok(b, n); assert.doesNotMatch(b, /getBoundingClientRect|offsetTop|offsetHeight|getComputedStyle|querySelector/, `${n} reads no layout`); });
  assert.match(body('measure'), /topOf\(/, 'measured when the layout changes'); assert.match(body('topOf'), /getBoundingClientRect/);
  // the far haze no longer blurs a huge animated layer
  assert.doesNotMatch(h, /\.amb-haze\{[^}]*filter:blur/);
  // no WebGL at load, no canvas, no third-party script -- the one WebGL context is the kinetic layer's hover lens
  // (kinetic.js), made only when a mouse is over a photograph
  const KIN = require('../lib/creative/kinetic');
  assert.doesNotMatch(h.replace(KIN.js, ''), /webgl|<canvas|three(\.min)?\.js|<script src=/i);
  assert.doesNotMatch(h, /<canvas|three(\.min)?\.js|<script src=/i);
  const lensInit = KIN.js.slice(KIN.js.indexOf('function lensInit('), KIN.js.indexOf('function lensDraw('));
  assert.match(lensInit, /getContext\('webgl'/, 'the lens makes its context itself');
  assert.equal((KIN.js.match(/getContext\(/g) || []).length, 1, 'and nothing else in the layer does');
  assert.match(KIN.js, /if\(on&&L\.ok===null&&L\.img\.complete&&L\.img\.naturalWidth\)lensInit\(L\)/, 'only when the mouse is over the photograph');
});

test('16. old pages are untouched: a saved page without the new fields renders without any of them', () => {
  const old = require('./fixtures/creative-saved-stage2.json').creative;
  const ctx = { mode: 'safety', assets: old.assets, facts: old.plan.facts, understanding: old.understanding };
  const v = validatePlan2(old.plan, ctx);
  const h = renderCreative2(v.plan, old.assets, { mode: 'export', src: a => a.id });
  assert.doesNotMatch(h, /<div class="cr-cast|<section[^>]*data-(exit|type|cast|beats)=|<div class="sc-text[^>]*data-treatment=/);
  assert.equal(v.plan.actor, undefined);
  // an art page saved before families and modes keeps its own limits (three held scenes) on reopening
  const legacy = JSON.parse(JSON.stringify(page('Metropolis', 'a cinematic page for the 1927 film', 'cinematic', 'l').plan)); delete legacy.art.family; delete legacy.art.mode;
  const again = validatePlan2(legacy, ctxOf(u('Metropolis', 'x', 'cinematic'), { mode: 'safety' }));
  assert.equal(JSON.stringify(again.plan.scenes), JSON.stringify(legacy.scenes));
});
