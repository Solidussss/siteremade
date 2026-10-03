'use strict';
// CREATIVE ART DIRECTION: the recipe chooser (art.js), the layout archetypes (archetypes.js), image framing
// (framing.js), scene choreography and motion personality in the renderer, the built-in art director (director2.js),
// and that all of it survives saving, reopening, export and an "Update My Website" revision. The real browser review
// (test/review/creative-art-qa.js) renders real pages from real research at desktop and phone sizes; this file pins the
// rules that make those pages different from each other and keeps their pictures honestly framed.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const ART = require('../lib/creative/art');
const FR = require('../lib/creative/framing');
const ARCH = require('../lib/creative/archetypes');
const D2 = require('../lib/creative/director2');
const { validatePlan2, LAYOUT_VERSION } = require('../lib/creative/validate2');
const { renderCreative2 } = require('../lib/creative/render2');
const { sanitizeCreative } = require('../lib/creative/store');
const refinement = require('../lib/creative-refinement');

// pictures as the studio reads them: a wide sharp photo, a portrait, a tight close-up (the subject fills it), a
// plain-background photo with its clean cut-out, a setting, and one more photo
const A = (id, w, h, extra) => Object.assign({ id, origin: 'research', title: `File:${id}.jpg`, author: 'A. Photographer', license: 'CC BY 4.0', pageUrl: `https://commons.wikimedia.org/wiki/File:${id}.jpg`,
  assess: { width: w, height: h, aspect: +(w / h).toFixed(3), orientation: w > h * 1.15 ? 'landscape' : h > w * 1.15 ? 'portrait' : 'square', subject: null, colours: ['#c0502e'], background: { colour: '#333333', uniformity: 0.2 } },
  caps: { moveFreely: false, frame: true, backdrop: w > h, heroSize: true }, curation: { role: 'subject', identity: 'exact', depicts: id, issues: [] } }, extra || {});
// (a measured subject: a wide photo whose subject was located can take a letterbox crop; one never located is cropped gently)
const WIDE = A('wide', 2000, 1200, { assess: { width: 2000, height: 1200, aspect: 1.667, orientation: 'landscape', subject: [0.3, 0.2, 0.7, 0.85], colours: ['#c0502e', '#223344', '#ddeeff'], background: { colour: '#333333', uniformity: 0.3 } } });
const TALL = A('tall', 900, 1400);
const TIGHT = A('tight', 1200, 1200, { assess: { width: 1200, height: 1200, aspect: 1, orientation: 'square', subject: [0.01, 0.0, 0.99, 1.0], colours: ['#a03020'], background: { colour: '#eeeeee', uniformity: 0.3 } } });
const PLAIN = A('plain', 1400, 1400, { assess: { width: 1400, height: 1400, aspect: 1, orientation: 'square', subject: [0.2, 0.12, 0.8, 0.9], colours: ['#2255cc'], background: { colour: '#f4f4f4', uniformity: 0.95 } } });
const CUT = A('c-plain', 840, 1090, { origin: 'derived', cutout: true, cutoutOf: 'plain', assess: { width: 840, height: 1090, aspect: 0.771, orientation: 'portrait', transparent: true, subject: [0.02, 0.02, 0.98, 0.98], colours: ['#2255cc'] }, caps: { moveFreely: true } });
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
// a whole art-directed page from the built-in director, accepted by the validator
function page(subject, brief, tone, seed, extra) {
  const und = u(subject, brief, tone);
  const { plan, recipe } = D2.direct(Object.assign({ understanding: und, research: { page: PAGE, facts: FACTS }, assets: ASSETS, supplied: { facts: [], memories: [] }, seed }, extra || {}));
  const v = validatePlan2(plan, { assets: ASSETS, facts: FACTS, understanding: und, art: recipe, page: PAGE });
  return Object.assign(v, { recipe });
}

// ---------------------------------------------------------------- 1, 2, 11 (variation at the level of composition)
test('1. the art director produces meaningfully different high-level plans for different subjects and seeds', () => {
  const recipes = []; const personalities = new Set(), heroes = new Set(), scrolls = new Set(), layouts = new Set();
  BRIEFS.forEach(([s, b, t]) => ['1', '2'].forEach(seed => { const r = page(s, b, t, seed).plan.art; recipes.push(r.recipe); personalities.add(r.personality); scrolls.add(r.scroll); heroes.add(r.recipe.split('/')[2].split(',')[0]); r.recipe.split('/')[2].split(',').forEach(l => layouts.add(l)); }));
  assert.ok(new Set(recipes).size >= 15, `16 pages, ${new Set(recipes).size} distinct recipes`);
  assert.ok(personalities.size >= 5, `motion personalities used: ${[...personalities]}`);
  assert.ok(heroes.size >= 5, `opening archetypes used: ${[...heroes]}`);
  assert.ok(layouts.size >= 14, `archetypes used across the set: ${[...layouts].length}`);
  // the subject steers the choice: a tribute is never chaotic, a film leans cinematic, a fashion page leans luxe/editorial
  const tribute = ['a', 'b', 'c', 'd'].map(seed => ART.choose({ understanding: { kind: 'personal', subject: 'Grandad', brief: 'in memory of my grandad', tone: 'tender' }, assets: ASSETS, facts: [], seed }).personality);
  assert.ok(tribute.every(p => !['chaotic', 'playful', 'kinetic'].includes(p)), `a memorial stays respectful: ${tribute}`);
  const film = ['a', 'b', 'c', 'd', 'e', 'f'].map(seed => ART.choose({ understanding: u('Metropolis', 'a cinematic page for the 1927 film', 'cinematic'), assets: ASSETS, facts: FACTS, seed }).personality);
  assert.ok(film.filter(p => p === 'cinematic').length >= 3, `a film page leans cinematic: ${film}`);
});

test('11. anti-repetition: the same prompt steers away from what this account (and this page) already has', () => {
  const inp = seed => ({ understanding: u('Doughnut', 'a playful page about doughnuts', 'playful'), assets: ASSETS, facts: FACTS, seed });
  const first = ART.choose(inp('s1'));
  // the same seed without history reproduces; with the first recipe as history the choice moves away from it
  assert.equal(ART.choose(inp('s1')).recipe, first.recipe, 'deterministic for a seed');
  const next = ART.choose(Object.assign(inp('s1'), { history: [first.recipe] }));
  assert.ok(ART.similarity(next.recipe, first.recipe) < 0.7, `steered away: ${first.recipe} vs ${next.recipe}`);
  const again = ART.choose(Object.assign(inp('s1'), { avoid: first.recipe }));
  assert.notEqual(again.recipe, first.recipe, 'another direction is another recipe');
  // over a run of generations for one prompt with a growing history, no recipe repeats
  const hist = []; for (let i = 0; i < 6; i++) hist.push(ART.choose(Object.assign(inp(`run${i}`), { history: hist.slice() })).recipe);
  assert.equal(new Set(hist).size, hist.length, hist.join(' | '));
  assert.ok(Math.max(...hist.slice(1).map((r, i) => ART.similarity(r, hist[i]))) < 0.85, 'consecutive pages are not near-copies');
});

test('2. the archetypes are real compositions: every one places words and pictures differently', () => {
  const byId = new Map(ASSETS.map(a => [a.id, a]));
  const shapes = {};
  ARCH.ARCHETYPES.forEach(layout => {
    const S = { id: 's', layout, choreo: 'settle', handoff: 'cut', height: 'screen', pin: false, camera: 'none', layers: [
      { id: 'a', kind: 'image', role: 'focal', asset: ['offcanvas', 'floating', 'fullscreen-object', 'lineup', 'object-stage', 'depth-stack'].includes(layout) ? 'c-plain' : 'wide', box: { d: [50, 10, 40, 80], m: [10, 10, 80, 80] }, z: 5, rotate: 0, opacity: 1, mask: 'none', treatment: 'none', fit: 'cover', focus: '50% 50%', entrance: { kind: 'fade', delay: 0, dur: 1 }, loop: { kind: 'none', amp: 1, period: 9 }, scroll: { kind: 'none', amount: 0 } },
      ...['more', 'setting', 'tall'].map((id, i) => ({ id: `x${i}`, kind: 'image', role: 'support', asset: id, box: { d: [10, 10, 20, 20], m: [10, 10, 20, 20] }, z: 3, rotate: 0, opacity: 1, mask: 'none', treatment: 'none', fit: 'cover', focus: '50% 50%', entrance: { kind: 'fade', delay: 0, dur: 1 }, loop: { kind: 'none', amp: 1, period: 9 }, scroll: { kind: 'none', amount: 0 } }))],
      text: { kicker: 'Kicker', heading: 'Doughnut', body: 'A short line, said in six words.', kind: 'imagined', region: 'left', size: 'large', width: 'medium', list: 'plain', entrance: 'rise', items: ['sticky-steps', 'dense', 'brutalist', 'gallery', 'orbit', 'chapters'].includes(layout) ? [1, 2, 3, 4].map(i => ({ label: '', text: `Line ${i} of the facts.`, kind: 'imagined' })) : [] } };
    ARCH.composeScene(S, { byId, si: 1, hero: false, art: { personality: 'editorial' }, actorPose: layout === 'stage' ? { x: -20, y: 0, s: 1, r: 0 } : null, rng: ART.rng('x'), name: 'Doughnut', fixes: [], warnings: [], side: 'right' });
    assert.equal(S.layout, layout, `${layout} composed as itself with the pictures it needs`);
    shapes[layout] = JSON.stringify({ place: S.text.place, mplace: S.text.mplace, h: S.height, pin: S.pin, ch: S.choreo, boxes: S.layers.map(L => [L.kind, L.box.d.map(Math.round), L.z]) });
  });
  const distinct = new Set(Object.values(shapes));
  assert.equal(distinct.size, ARCH.ARCHETYPES.length, 'no two archetypes produce the same composition');
  assert.ok(ARCH.ARCHETYPES.length >= 20, `${ARCH.ARCHETYPES.length} archetypes`);
});

// ---------------------------------------------------------------- 3, 4 (scroll and motion)
test('3. several scroll models and scene choreographies exist, each with its own rendered behaviour', () => {
  const scrolls = new Set(), choreos = new Set();
  // (a composed scene's behaviour is its composition's: composition.js -- each one a different coordinated move)
  BRIEFS.forEach(([s, b, t]) => ['1', '2', '3'].forEach(seed => { const p = page(s, b, t, seed).plan; scrolls.add(p.art.scroll); p.scenes.forEach(x => choreos.add(x.composition ? `compose:${x.composition}` : x.choreo)); }));
  assert.ok(scrolls.size >= 4, `scroll models: ${[...scrolls]}`);
  assert.ok(choreos.size >= 8, `choreographies: ${[...choreos]}`);
  // every choreography has rendered behaviour (CSS keyed on it) and a still version for reduced motion
  const html = renderCreative2(page('Doughnut', 'a playful page about doughnuts', 'playful', '1').plan, ASSETS, { mode: 'export', src: a => a.id + '.jpg' });
  ['zoom-away', 'scale-through', 'mask-reveal', 'type-wipe', 'track', 'stack', 'depth', 'travel'].forEach(c => assert.ok(html.includes(`[data-choreo="${c}"]`), `${c} has rendered behaviour`));
  ['overlap', 'stack'].forEach(h => assert.ok(html.includes(`[data-handoff="${h}"]`), `${h} handoff`));
  assert.match(html, /\.sc\[data-hold\]\{position:sticky/); assert.match(html, /\.sc\[data-bleed\]\{background:color-mix/); assert.match(html, /\.ly\[data-exit="right"\]/);
  assert.match(html, /html\[data-motion="reduced"\] \.ly\{translate:none!important;scale:none!important;rotate:none!important\}/, 'reduced motion: every choreography at rest');
  assert.match(html, /__crArtFrame=frameArt/, 'the runtime drives the choreography');
  // a held scene is held only until the next one has covered it: the two share a wrapper; one hold at a time
  const stacked = page('Doughnut', 'a playful page about doughnuts', 'playful', '1').plan;
  const s2 = JSON.parse(JSON.stringify(stacked)); s2.scenes.forEach(s => { s.handoff = 'cut'; }); s2.scenes[1].handoff = 'stack'; s2.scenes[1].pin = false; s2.scenes[0].pin = false; s2.scenes[0].height = 'screen';
  const h2 = renderCreative2(s2, ASSETS, { mode: 'export', src: a => a.id + '.jpg' });
  assert.match(h2, /<div class="sc-pair">\n<section class="sc cr-hero[^>]*data-hold[\s\S]*?<\/section>\n<section class="sc cr-reveal"[^>]*data-handoff="stack"[\s\S]*?<\/section>\n<\/div>/, 'the held scene and the one covering it share a wrapper');
  const chain = JSON.parse(JSON.stringify(stacked)); chain.scenes.forEach((s, i) => { s.handoff = i ? 'stack' : 'cut'; s.pin = false; s.height = 'screen'; delete s.steps; });
  const vc = validatePlan2(chain, { assets: ASSETS, facts: FACTS, art: stacked.art, page: PAGE });
  assert.ok(vc.plan.scenes.every((s, i) => !(s.handoff === 'stack' && vc.plan.scenes[i - 1] && vc.plan.scenes[i - 1].handoff === 'stack')), 'no scene stacks onto a scene that is itself stacking');
  // one runtime, one scroll listener: the art runtime rides on the page's single frame loop
  assert.equal((html.match(/addEventListener\('scroll'/g) || []).length, 1);
});

test('4. motion personality changes rendered behaviour, not just a label', () => {
  const base = page('Doughnut', 'a playful page about doughnuts', 'playful', '1').plan;
  const as = p => { const x = JSON.parse(JSON.stringify(base)); x.art.personality = p; return renderCreative2(x, ASSETS, { mode: 'export', src: a => a.id + '.jpg' }); };
  const luxe = as('luxe'), kinetic = as('kinetic');
  const vars = h => /data-personality="(\w+)"[^>]*style="--range:([\d.]+);--ease:([^;]+);--pinv:(\d+)"/.exec(h).slice(1);
  const [lp, lr, le, lpin] = vars(luxe), [kp, kr, ke, kpin] = vars(kinetic);
  assert.equal(lp, 'luxe'); assert.equal(kp, 'kinetic');
  assert.ok(+kr > +lr * 2, `movement range ${kr} vs ${lr}`); assert.notEqual(ke, le, 'different easing'); assert.ok(+lpin > +kpin, 'luxe holds scenes longer');
  assert.match(luxe, /"personality":"luxe"/); assert.match(kinetic, /"personality":"kinetic"/); // the runtime eases in the page's language
  // and each scene arrives as ONE composed event in every language (look.js): one entrance for all its layers, no
  // stagger, the words riding the same mask -- the personality moves the page (range, easing, holds), not each layer
  const d = x => x.scenes.flatMap(s => s.layers.map(L => L.entrance.kind).concat([s.text.entrance]));
  const P1 = page('Birkin bag', 'a quiet, expensive luxury fashion page', 'restrained', '2').plan; const P2 = page('Brian Eno', 'an experimental page for an ambient music pioneer', 'extravagant', '2').plan;
  assert.notEqual(P1.art.personality, P2.art.personality);
  for (const P of [P1, P2]) P.scenes.forEach(s => { assert.equal(new Set(s.layers.map(L => `${L.entrance.kind}@${L.entrance.delay}`)).size <= 1, true, `${P.art.personality}: one entrance in ${s.id}`); assert.ok(s.layers.every(L => L.entrance.delay === 0)); assert.equal(s.text.entrance, 'none'); });
  assert.ok(d(P1).length && d(P2).length);
});

// ---------------------------------------------------------------- 5, 6, 7 (framing)
test('5. framing supports showing the whole subject: contain in a frame shaped to the picture', () => {
  const L = { box: { d: [50, 10, 40, 80], m: [10, 10, 80, 80] }, frame: 'full', role: 'focal', mask: 'window' };
  const f = FR.frameLayer(L, TALL, 'd', { anchor: 'cm' });
  assert.equal(f.fit, 'contain'); assert.equal(f.crop, 0);
  const b = f.box; assert.ok(Math.abs((b[2] * FR.STAGE.d) / b[3] - TALL.assess.aspect) < 0.02, 'the frame hugs the picture (no bands, no crop)');
  assert.equal(FR.frameLayer(Object.assign({}, L, { frame: 'framed' }), WIDE, 'm').fit, 'contain');
  // a cut-out always floats whole
  assert.equal(FR.frameLayer(Object.assign({}, L, { frame: 'bleed' }), CUT, 'd').fit, 'contain');
});

test('6. a tight picture is never cropped further or zoomed to fill a container', () => {
  assert.equal(FR.profile(TIGHT).tight, true, 'measured: the subject fills the picture');
  assert.equal(FR.profile(Object.assign({}, WIDE, { curation: { role: 'subject', identity: 'exact', framing: 'cropped' } })).tight, true, 'or the picture check said so');
  ['bleed', 'editorial', 'light', 'masked'].forEach(intent => {
    const f = FR.frameLayer({ box: { d: [0, 0, 100, 100], m: [0, 0, 100, 100] }, frame: intent, role: 'focal', mask: intent === 'masked' ? 'circle' : 'none' }, TIGHT, 'd');
    assert.equal(f.fit, 'contain', `${intent} on a tight picture`); assert.equal(f.crop, 0);
  });
  // an archetype that needs a full bleed does not force a tight picture into it: the scene is recomposed
  const byId = new Map(ASSETS.map(a => [a.id, a])); const fixes = [];
  const S = { id: 'h', layout: 'editorial-hero', choreo: 'zoom-away', handoff: 'cut', layers: [{ id: 'a', kind: 'image', role: 'focal', asset: 'tight', box: { d: [0, 0, 100, 100], m: [0, 0, 100, 100] }, z: 5, rotate: 0, opacity: 1, mask: 'none', treatment: 'none', fit: 'cover', focus: '50% 50%', entrance: { kind: 'fade', delay: 0, dur: 1 }, loop: { kind: 'kenburns', amp: 3, period: 9 }, scroll: { kind: 'zoom-in', amount: 1 } }], text: { heading: 'Doughnut', body: '', kind: 'imagined', region: 'left', size: 'display', width: 'medium', list: 'plain', entrance: 'rise', items: [] } };
  ARCH.composeScene(S, { byId, si: 0, hero: true, art: { personality: 'cinematic' }, rng: ART.rng('t'), name: 'Doughnut', fixes, warnings: [], side: 'right' });
  assert.notEqual(S.layout, 'editorial-hero'); const L = S.layers[0];
  assert.equal(L.fit, 'contain', `recomposed as ${S.layout}, the picture shown whole`); assert.notEqual(L.loop.kind, 'kenburns'); assert.equal(L.scroll.kind, 'none');
  assert.ok(fixes.some(f => /needs a wide, uncropped picture/.test(f)), fixes.join(' | '));
  // a free composition from a model: an absurd box is reshaped to the picture, and zooms are capped
  const plan = { identity: { name: 'Doughnut', kind: 'recognizable' }, concept: { title: 'x', logline: 'A page about doughnuts.' }, palette: {}, type: {}, atmosphere: {}, motion: { tempo: 'lively' },
    scenes: [{ id: 'h', purpose: 'p', height: 'screen', layers: [{ kind: 'image', role: 'focal', asset: 'wide', box: { d: [60, 5, 20, 90], m: [10, 5, 80, 90] }, fit: 'cover', mask: 'arch', loop: { kind: 'kenburns', amp: 3 }, scroll: { kind: 'zoom-in', amount: 1 } }], text: { heading: 'Doughnut', region: 'left' } }, { id: 'b', purpose: 'p', layers: [], text: { heading: 'More', region: 'center' } }] };
  const v = validatePlan2(plan, { assets: ASSETS, facts: FACTS });
  const f0 = v.plan.scenes[0].layers[0];
  const crop = f0.fit === 'cover' ? FR.coverCrop(WIDE.assess.aspect, (f0.box.d[2] * FR.STAGE.d) / f0.box.d[3]).crop : 0;
  assert.ok(crop <= FR.BUDGET.masked + 0.01, `a ${Math.round(crop * 100)}% crop (was ${Math.round(FR.coverCrop(WIDE.assess.aspect, 20 * 1.6 / 90).crop * 100)}%)`);
  assert.ok(1.02 + f0.loop.amp * 0.05 <= FR.ZOOM.loop + 1e-9, 'the slow zoom stays small'); assert.ok(1 + Math.abs(f0.scroll.amount) * 0.55 <= FR.ZOOM.scroll + 1e-9, 'the scroll zoom stays small');
});

test('7. an aggressive crop happens only when it is planned (an explicit detail framing), and keeps the subject', () => {
  const box = { d: [50, 0, 50, 100], m: [0, 0, 100, 100] };
  const light = FR.frameLayer({ box, frame: 'light', role: 'focal', mask: 'none' }, WIDE, 'd'); const detail = FR.frameLayer({ box, frame: 'detail', role: 'focal', mask: 'none' }, WIDE, 'd');
  assert.ok(light.crop <= FR.BUDGET.light + 0.005 && light.fit === 'cover', `light ${light.crop}`);
  assert.ok(detail.crop > 0.4, `detail may crop hard when asked (${detail.crop})`);
  assert.ok(Object.entries(FR.BUDGET).filter(([k]) => k !== 'detail' && k !== 'texture').every(([, b]) => b <= 0.34), 'no default intention crops more than a third');
  // a picture whose subject was never located (a busy photo, no picture check) is cropped gently -- nothing is guessed
  const unknown = FR.frameLayer({ box: { d: [0, 0, 100, 100], m: [0, 0, 100, 100] }, frame: 'editorial', role: 'focal', mask: 'none' }, MORE, 'd');
  assert.equal(FR.profile(MORE).source, 'unknown'); assert.ok(unknown.crop <= FR.UNKNOWN + 0.005, `unknown subject: ${unknown.crop}`);
  // the crop window holds the measured subject (a tall subject keeps its top: heads stay on)
  const person = Object.assign({}, TALL, { assess: Object.assign({}, TALL.assess, { subject: [0.3, 0.1, 0.7, 0.95] }) });
  const f = FR.frameLayer({ box: { d: [0, 20, 100, 60], m: [0, 0, 100, 100] }, frame: 'bleed', role: 'focal', mask: 'none' }, person, 'd', { allowReshape: false });
  assert.equal(f.fit, 'contain', 'a portrait never bleeds across a wide band: shown whole');
  const g = FR.frameLayer({ box: { d: [0, 0, 60, 100], m: [0, 0, 100, 100] }, frame: 'editorial', role: 'focal', mask: 'none' }, person, 'd', { allowReshape: false });
  const pos = g.focus.split(' ').map(p => parseFloat(p) / 100); const v = 1 - g.crop; const top = pos[1] * (1 - v);
  if (g.fit === 'cover' && FR.coverCrop(person.assess.aspect, 60 * 1.6 / 100).axis === 'y') assert.ok(top <= 0.1 + 1e-6, 'the crop window starts at or above the head');
  // the renderer carries the budget and the subject so the runtime guard holds them on any viewport
  // (a page that crops a picture -- seed 3's whole-page review now stands every picture whole, so seed 1)
  const html = renderCreative2(page('Doughnut', 'a playful page about doughnuts', 'playful', '1').plan, ASSETS, { mode: 'export', src: a => a.id + '.jpg' });
  assert.match(html, /data-crop="0\.\d+"/); assert.match(html, /function guard\(img\)/); assert.match(html, /if\(crop>max\+\.08\)\{img\.style\.objectFit='contain'/);
});

// ---------------------------------------------------------------- 8, 9, 10 (it all survives)
function savedCreative(v) { return sanitizeCreative({ brief: 'doughnuts', understanding: { kind: 'recognizable', subject: 'Doughnut' }, research: { page: PAGE, facts: FACTS }, assets: ASSETS.map(a => Object.assign({}, a, { assetRef: 'a'.repeat(64) })), plan: v.plan, history: [{ title: 'Before', logline: 'the page before', recipe: 'editorial/flow/split,text' }] }); }
test('8. framing, archetypes, choreography and art direction survive saving and reopening unchanged', () => {
  const v = page('Doughnut', 'a playful page about doughnuts', 'playful', '4');
  assert.equal(v.plan.layout.version, LAYOUT_VERSION);
  const c1 = savedCreative(v); const c2 = sanitizeCreative(JSON.parse(JSON.stringify(c1)));
  assert.equal(JSON.stringify(c2.plan), JSON.stringify(c1.plan)); assert.equal(JSON.stringify(c1.plan), JSON.stringify(v.plan), 'saved exactly as accepted');
  assert.ok(c1.plan.art && c1.plan.art.recipe && c1.plan.scenes.every(s => s.layout && s.choreo));
  assert.ok(c1.plan.scenes.some(s => s.layers.some(L => L.frame)), 'framing intentions stored');
  assert.equal(c1.history[0].recipe, 'editorial/flow/split,text', 'the recipe history is kept (anti-repetition)');
  // the picture check's framing judgement is kept with the picture
  const withSeen = sanitizeCreative({ brief: 'x', understanding: {}, research: {}, assets: [Object.assign({}, WIDE, { assetRef: 'b'.repeat(64), curation: { role: 'subject', identity: 'exact', depicts: 'x', framing: 'tight', focus: [0.4, 0.3] } })] });
  assert.deepEqual([withSeen.assets[0].curation.framing, withSeen.assets[0].curation.focus], ['tight', [0.4, 0.3]]);
});

test('9. the exported page is the page the studio previewed: same archetypes, framing and choreography', () => {
  const v = page('Metropolis', 'a cinematic page for the 1927 film', 'cinematic', '5');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sr-art-export-'));
  process.env.SITEREMADE_BACKEND = 'local'; process.env.SITEREMADE_ASSET_STORE_DIR = path.join(dir, 'assets');
  const { getDatabaseAdapter } = require('../lib/adapters/database-adapter'); const projectStore = require('../lib/project-store'); const { compileExport } = require('../lib/export-compiler');
  const db = getDatabaseAdapter(':memory:');
  const pix = n => { const b = Buffer.alloc(80); b.write('\x89PNG\r\n\x1a\n', 0, 'latin1'); b.writeUInt32BE(13, 8); b.write('IHDR', 12); b.writeUInt32BE(10, 16); b.writeUInt32BE(10, 20); b.writeUInt32BE(n, 60); return 'data:image/png;base64,' + b.toString('base64'); };
  const assets = ASSETS.map((a, i) => Object.assign({}, a, { dataUrl: pix(i + 1), mime: 'image/png' }));
  const direction = { mode: 'creative', meta: { id: 'c1' }, pages: [{ id: 'creative', label: 'Creative page', sections: [] }], creative: { brief: 'metropolis', understanding: { kind: 'recognizable', subject: 'Metropolis' }, research: { status: 'ok', page: PAGE, facts: FACTS }, assets, plan: v.plan } };
  const check = projectStore.validateDirectionsState({ directions: [direction], activeDirectionIndex: 0 });
  assert.ok(check.valid, check.error);
  projectStore.internalizeAssets(db, check.normalized);
  const workDir = path.join(dir, 'export');
  const res = compileExport(db, { project: { id: 'p9', revision: 1, directionsState: check.normalized }, directionIndex: 0, workDir });
  const out = fs.readFileSync(path.join(workDir, 'index.html'), 'utf8');
  const srcOf = a => (res.manifest.assets.find(m => m.hash === check.normalized.directions[0].creative.assets.find(x => x.id === a.id).assetRef) || {}).path || '';
  const preview = renderCreative2(v.plan, assets, { mode: 'preview', src: srcOf });
  const strip = h => h.replace(/data-mode="\w+"/, '').replace(/"mode":"\w+"/, '').replace(/<script>\n\(function\(\)\{\nvar d=document[\s\S]*<\/script>/, '');
  assert.equal(strip(out), strip(preview), 'identical page apart from the preview-only script');
  v.plan.scenes.forEach(s => { assert.ok(out.includes(`data-layout="${s.layout}" data-choreo="${s.choreo}"`), `${s.id}: ${s.layout}/${s.choreo} exported`); });
  assert.match(out, new RegExp(`data-personality="${v.plan.art.personality}"`)); assert.match(out, /data-frame="\w+"/);
});

test('10. an "Update My Website" revision keeps the art direction as its starting point and saves what the director changed', () => {
  const v = page('Doughnut', 'a playful page about doughnuts', 'playful', '6');
  const c = savedCreative(v);
  const direction = { mode: 'creative', creative: c };
  const input = refinement.buildCreativeReviseInput(direction, 'make it calmer', 'seed-x');
  assert.equal(input.art.personality, v.plan.art.personality, 'the current art direction is offered to the director');
  assert.deepEqual(input.art.scenes.map(s => s.layout), v.plan.scenes.map(s => s.layout));
  const compact = input.revise.current;
  assert.equal(compact.art.recipe, v.plan.art.recipe); assert.ok(compact.scenes.every(s => s.layout && s.choreo));
  assert.ok(compact.scenes.some(s => s.layers.some(L => L.frame)), 'framing is part of the page the director revises');
  // a revision the director builds on a new art direction is saved with it; the old recipe goes to the history
  const revised = JSON.parse(JSON.stringify(v.plan)); revised.art = Object.assign({}, revised.art, { personality: 'luxe' });
  const again = validatePlan2(revised, { assets: ASSETS, facts: FACTS, art: input.art, artOptional: true, page: PAGE });
  assert.equal(again.plan.art.personality, 'luxe');
  const state = refinement.applyCreativeRevision({ directions: [direction], activeDirectionIndex: 0 }, 0, again.plan, { model: 'mock-creative-director' });
  assert.equal(state.directions[0].creative.plan.art.personality, 'luxe'); assert.equal(state.directions[0].creative.history.slice(-1)[0].recipe, v.plan.art.recipe);
  // a revision that keeps the page as it was is not re-art-directed behind the owner's back
  const legacy = JSON.parse(JSON.stringify(v.plan)); delete legacy.art; legacy.scenes.forEach(s => { delete s.layout; delete s.choreo; delete s.handoff; });
  const kept = validatePlan2(legacy, { assets: ASSETS, facts: FACTS, art: input.art, artOptional: true, page: PAGE });
  assert.equal(kept.plan.art, undefined); assert.ok(kept.plan.scenes.every(s => !s.layout || s.layout === 'free'));
});

// ---------------------------------------------------------------- 12, 13 (mobile; nothing old breaks)
test('12. phones: every archetype has its own phone composition; nothing is allowed to push the page sideways', () => {
  const html = renderCreative2(page('Brutalism', 'a raw brutalist art project about architecture', 'serious', '7').plan, ASSETS, { mode: 'export', src: a => a.id + '.jpg' });
  const phone = html.slice(html.indexOf('/* phones: every archetype recomposes'));
  ARCH.ARCHETYPES.forEach(k => assert.match(phone, new RegExp(`\\.sc\\[data-layout="${k}"\\] \\.sc-stage\\{height:min\\(\\d+vw,(\\d+)svh\\)\\}`), `${k} phone stage`));
  [...phone.matchAll(/\.sc-stage\{height:min\(\d+vw,(\d+)svh\)\}/g)].forEach(m => assert.ok(+m[1] <= 86, 'a phone stage never fills more than the screen'));
  assert.match(html, /body\{[^}]*overflow-x:clip\}/); assert.match(html, /\.sc-pin\{[^}]*overflow:clip/, 'a picture that runs off a scene is cut by the scene, never the page');
  // a scene about to be overlapped reserves its foot on desktop only (on a phone its stage is in the flow: moving it up
  // would put the pictures over the words)
  assert.match(html, /@media \(min-width:721px\)\{\.sc\[data-overlapped\] \.sc-stage\{bottom:14vh\}/);
  assert.equal((html.match(/\.sc\[data-overlapped\] \.sc-stage\{bottom/g) || []).length, 1, 'and nowhere else');
  assert.match(phone, /html\.cr-js \.sc\[data-pin\]\[data-steps\]\{height:min\(calc\(100svh \+ var\(--steps,2\) \* var\(--pinv,110\) \* \.42svh\),300svh\)\}/, 'held scenes are shorter on phones, and bounded');
  assert.match(html, /html\.cr-js \.sc\[data-pin\]\[data-steps\]\{height:min\(calc\(100vh \+ var\(--steps,2\) \* var\(--pinv,110\) \* \.62vh\),420vh\)\}/, 'and bounded on desktop: nothing traps the reader');
  // an off-canvas subject only ever runs off the right and bottom -- never its top (heads stay whole)
  const byId = new Map(ASSETS.map(a => [a.id, a]));
  const S = { id: 'o', layout: 'offcanvas', choreo: 'travel', handoff: 'cut', layers: [{ id: 'a', kind: 'image', role: 'focal', asset: 'c-plain', box: { d: [0, 0, 10, 10], m: [0, 0, 10, 10] }, z: 5, rotate: 0, opacity: 1, mask: 'none', treatment: 'none', fit: 'contain', focus: '50% 50%', entrance: { kind: 'fade', delay: 0, dur: 1 }, loop: { kind: 'none', amp: 1, period: 9 }, scroll: { kind: 'none', amount: 0 } }], text: { heading: 'Big', body: '', kind: 'imagined', region: 'left', size: 'large', width: 'medium', list: 'plain', entrance: 'rise', items: [] } };
  ARCH.composeScene(S, { byId, si: 1, hero: false, art: { personality: 'chaotic' }, rng: ART.rng('o'), name: 'Big', fixes: [], warnings: [], side: 'right' });
  ['d', 'm'].forEach(k => { const b = S.layers[0].box[k]; assert.ok(b[1] >= 0 && b[0] >= 0, `${k}: top-left inside the scene`); assert.ok(b[0] + b[2] > 100, `${k}: runs off the right edge`); });
});

test('13. saved pages without art direction are untouched; the built-in director is honest about its words', () => {
  const saved = require('./fixtures/creative-saved-stage2.json').creative;
  const ctx = { mode: 'safety', assets: saved.assets, facts: saved.plan.facts, understanding: saved.understanding };
  const v = validatePlan2(saved.plan, ctx);
  assert.equal(JSON.stringify(v.plan), JSON.stringify(validatePlan2(v.plan, ctx).plan), 'stable');
  assert.equal(v.plan.art, undefined); assert.ok(v.plan.scenes.every(s => s.layout === undefined && s.choreo === undefined), 'no new fields on an old page');
  const html = renderCreative2(v.plan, saved.assets, { mode: 'export', src: a => a.id });
  assert.doesNotMatch(html, /data-layout=|data-personality=|===== art direction =====|__crArtFrame=frameArt/, 'an old page renders without the art-direction layer');
  // every factual line of a built-in page cites a real fact; everything else is marked imagined
  BRIEFS.forEach(([s, b, t]) => {
    const p = page(s, b, t, 'h').plan; const ids = new Set(FACTS.map(f => f.id));
    p.scenes.forEach(sc => { if (sc.text.body) assert.ok(sc.text.kind === 'imagined' ? !sc.text.cite : ids.has(sc.text.cite), `${s}/${sc.id}`); sc.text.items.forEach(it => assert.ok(it.kind !== 'sourced' || ids.has(it.cite))); });
  });
  // a personal page shows only the owner's own photos
  const own = Object.assign({}, MORE, { id: 'u1', origin: 'upload', license: '' });
  const res = D2.direct({ understanding: { kind: 'personal', subject: 'Rex', name: 'Rex', noun: 'dog', relation: 'my', tone: 'tender' }, research: { facts: [] }, assets: ASSETS.concat([own]), supplied: { facts: ['Rex loves the beach.', 'He is twelve years old.'], memories: ['The day he found the ball.'] }, seed: 'p' });
  const pv = validatePlan2(res.plan, { assets: ASSETS.concat([own]), facts: [], understanding: { kind: 'personal' }, art: res.recipe, supplied: ['Rex loves the beach.', 'He is twelve years old.', 'The day he found the ball.'] });
  assert.ok(pv.plan.scenes.every(sc => sc.layers.every(L => L.kind !== 'image' || L.asset === 'u1')), 'only the owner\'s photo');
  assert.ok(!['chaotic', 'kinetic', 'playful'].includes(pv.plan.art.personality), pv.plan.art.personality);
});
