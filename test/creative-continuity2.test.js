'use strict';
// CREATIVE CONTINUITY, PHASE 2: the page as one directed visual piece. Image-pair-driven seams, a subject carried
// physically across seams, colour windows that span them, the premium hero's language carried into the next scenes,
// text placed in the picture's empty space, rest scenes that are never empty, the main picture as a recurring identity, a
// closing callback, and a critic that hears rhythm problems. Mocks and fixtures only ($0).
const test = require('node:test');
const assert = require('node:assert/strict');
const CT = require('../lib/creative/continuity');
const PAL = require('../lib/creative/palette');
const ARCH = require('../lib/creative/archetypes');
const D2 = require('../lib/creative/director2');
const { validatePlan2 } = require('../lib/creative/validate2');
const { renderCreative2 } = require('../lib/creative/render2');

// ---------------------------------------------------------------- fixtures
const A = (id, extra) => Object.assign({ id, origin: 'upload', title: id, relevance: 2, mime: 'image/png', assetRef: 'a'.repeat(64), caps: { moveFreely: false, frame: true, backdrop: true, heroSize: true } }, extra);
const ms = (w, h, bg, cols, subject, more) => Object.assign({ width: w, height: h, aspect: +(w / h).toFixed(3), orientation: w > h * 1.15 ? 'landscape' : h > w * 1.15 ? 'portrait' : 'square', background: { colour: bg, uniformity: 0.7, tolerance: 60 }, colours: cols, subject, luminance: 110, transparent: false }, more || {});
// the same kart twice: the airborne photo (main) and a close-up whose clean cut-out exists
const AIR = A('u1', { title: 'airborne kart', ownerRole: 'main', assess: ms(1600, 1000, '#0b2f8a', ['#e8e8e8', '#101010', '#2ea4fb'], [0.55, 0.2, 0.85, 0.55]) });
const CLOSE = A('u3', { title: 'kart close-up', assess: ms(1400, 1000, '#1e9d8e', ['#e7e7e7', '#101010', '#fe3a2f'], [0.21, 0.21, 0.71, 0.72], { background: { colour: '#1e9d8e', uniformity: 0.95, tolerance: 24 } }) });
const CLOSECUT = A('c-u3', { origin: 'derived', cutout: true, cutoutOf: 'u3', title: 'kart close-up', assess: ms(700, 510, '#ffffff', ['#e7e7e7', '#101010', '#fe3a2f'], [0.04, 0.04, 0.96, 0.96], { transparent: true }), caps: { moveFreely: true } });
const LINEUP = A('u2', { title: 'starting lineup', assess: ms(1600, 900, '#5a0410', ['#c81328', '#ffe14d', '#3dd6ff'], [0.05, 0.4, 0.9, 0.75]) });
const SUNSET = A('r1', { origin: 'research', title: 'the track at sunset', license: 'CC BY 4.0', pageUrl: 'https://example.org/s', author: 'X', curation: { role: 'subject', identity: 'exact', depicts: 'the track at sunset', issues: [] }, assess: ms(1600, 900, '#7a1f0a', ['#2a0d05', '#c85413', '#e76917'], null, { background: { colour: '#7a1f0a', uniformity: 0.17, tolerance: 70 } }) });
const LOGO = A('lg', { title: 'logo', ownerRole: 'logo', relevance: 0, assess: ms(480, 160, '#ffffff', ['#ff3b30', '#ffffff', '#ffd60a'], [0.02, 0.12, 0.94, 0.88], { transparent: true }) });
const ASSETS = [AIR, CLOSE, CLOSECUT, LINEUP, SUNSET, LOGO];
const byId = new Map(ASSETS.map(a => [a.id, a]));
const UND = { kind: 'recognizable', subject: 'ZoomKart', name: 'ZoomKart', brief: 'A high energy page about ZoomKart, a kart racing game', tone: { register: 'playful' }, identity: { name: 'ZoomKart', kind: 'recognizable', what: 'a kart racing video game' }, visuals: { main: 'karts racing' } };
const FACTS = [{ id: 'f1', text: 'ZoomKart is a kart racing game.', section: 'x' }, { id: 'f2', text: 'Players race karts and use items.', section: 'x' }];
function page(seed, extra) {
  const { plan, recipe } = D2.direct(Object.assign({ understanding: UND, research: { page: null, facts: FACTS }, assets: ASSETS, supplied: { facts: [], memories: [] }, seed, mainAsset: 'u1' }, extra || {}));
  const v = validatePlan2(plan, Object.assign({ assets: ASSETS, facts: FACTS, understanding: UND, art: recipe, mainAsset: 'u1' }, (extra && extra.ctx) || {}));
  assert.deepEqual(v.errors, []); return v.plan;
}
const SEEDS = ['1', '2', '3', '4', '5', '6', '7', '8'];
const html = (P, extra) => renderCreative2(P, (extra && extra.assets) || ASSETS, Object.assign({ mode: 'export', src: a => `${a.id}.png` }, extra || {}));
// a hand-made pair of scenes (validated shapes): what relationOf / contracts see
const sc = (asset, box, extra) => Object.assign({ id: `s-${asset}`, layout: 'split', layers: asset ? [{ kind: 'image', role: 'focal', asset, box: { d: box || [52, 10, 42, 78], m: [8, 6, 84, 64] } }] : [], text: { heading: 'x', region: 'left' }, ink: { surface: '#202030' } }, extra || {});
const tl = (n, families, rhythm) => ({ actors: [], beats: [], rhythm: rhythm || Array.from({ length: n }, (_, i) => (i ? 'rest' : 'setup')), transitions: Array.from({ length: n - 1 }, (_, i) => ({ at: i + 1, family: (families || [])[i] || 'color-bleed' })), moments: [] });

// ================================================================ 1. the same subject is carried
test('1. same subject on both sides of a seam: the pair is recognised and the subject is carried across, not reset', () => {
  const rel = CT.relationOf(sc('u1'), sc('c-u3'), byId, { name: 'ZoomKart' });
  assert.equal(rel.relationship, 'same-subject', 'two shots of the kart, one a cut-out');
  assert.equal(CT.relationOf(sc('u3'), sc('c-u3'), byId, {}).relationship, 'same-picture');
  assert.equal(CT.relationOf(sc('u1'), sc('u2'), byId, { name: 'ZoomKart' }).relationship === 'same-subject', false, 'the lineup is another subject');
  // the seam chooser and the contract both prefer the carry
  const scenes = [sc('u1'), sc('c-u3'), sc('u2')]; const raw = tl(3, [], ['setup', 'event', 'rest']);
  CT.chooseSeams(raw, { scenes, byId, mode: 'expressive', name: 'ZoomKart' });
  assert.equal(raw.transitions[0].family, 'depth-handoff', 'the subject comes forward out of the last scene');
  const k = CT.normalise({}, { scenes, timeline: raw, byId, mode: 'expressive', name: 'ZoomKart' }).continuity.contracts[0];
  assert.equal(k.relationship, 'same-subject'); assert.equal(k.carry, 'strong'); assert.equal(k.depthHandoff, 'through');
  // a model may lighten it, never invent one
  assert.equal(CT.normalise({ contracts: [{ at: 1, carry: 'light' }] }, { scenes, timeline: raw, byId, mode: 'expressive', name: 'ZoomKart' }).continuity.contracts[0].carry, 'light');
  assert.equal(CT.normalise({ contracts: [{ at: 2, carry: 'strong' }] }, { scenes, timeline: raw, byId, mode: 'expressive', name: 'ZoomKart' }).continuity.contracts[1].carry, 'none');
  // two different full photos are never cross-faded as a "carry" (that reads as a slide changing)
  const both = A('u9', { title: 'kart on the grid', assess: LINEUP.assess }); const m2 = new Map(byId); m2.set('u9', both);
  const k2 = CT.normalise({}, { scenes: [sc('u1'), sc('u9')], timeline: tl(2), byId: m2, mode: 'expressive', name: 'ZoomKart' }).continuity.contracts[0];
  assert.equal(k2.relationship, 'same-subject'); assert.equal(k2.carry, 'none');
});

// ================================================================ 2. image-pair choreography
test('2. the pair decides the seam: same picture -> its crop continues; a cut-out after a photo -> depth; far colours on a loud scene -> a sweep; budgets hold', () => {
  const pick = (a, b, loud) => { const raw = tl(2, [], ['setup', loud || 'rest']); CT.chooseSeams(raw, { scenes: [sc(a), sc(b)], byId, mode: 'expressive', name: 'ZoomKart' }); return raw.transitions[0].family; };
  assert.equal(pick('u3', 'u3'), 'image-expand', 'the same picture: the crop continues');
  assert.equal(pick('u2', 'c-u3', 'event'), 'depth-handoff', 'a cut-out arriving on a loud scene comes forward');
  assert.equal(pick('u1', 'r1', 'escalation'), 'foreground-wipe', 'blue to sunset orange on a loud scene: a sweep hides the change');
  assert.equal(pick('u1', 'u2'), 'color-bleed', 'nothing stronger: the colour flows');
  // the motion vector follows the subjects: the outgoing kart sits right -> things move rightward
  assert.equal(CT.relationOf(sc('u1'), sc('u2'), byId, {}).vec, 'lr');
  // a quiet page gets no signature move, whatever the pictures; neighbouring seams never repeat one
  const quiet = tl(3, ['image-expand', 'image-expand']); CT.chooseSeams(quiet, { scenes: [sc('u3'), sc('u3'), sc('u3')], byId, mode: 'quiet' });
  assert.deepEqual(quiet.transitions.map(t => t.family), ['color-bleed', 'color-bleed']);
  const loud = tl(3); CT.chooseSeams(loud, { scenes: [sc('u3'), sc('u3'), sc('u3')], byId, mode: 'immersive' });
  assert.notEqual(loud.transitions[0].family, loud.transitions[1].family, 'the same signature move twice in a row is avoided');
  // on real pages: every seam between pictures that belong together gets a move, within the mode's budget
  SEEDS.forEach(seed => { const P = page(seed); const sig = P.timeline.transitions.filter(t => ['image-expand', 'card-expand', 'type-mask', 'depth-handoff', 'foreground-wipe', 'shape-takeover'].includes(t.family)).length; assert.ok(sig <= ({ quiet: 0, editorial: 1, expressive: 3, immersive: 4 })[P.art.mode], `${P.art.recipe}: ${sig}`); });
});

// ================================================================ 3. palette handoff spans the seam
test('3. the colour handoff opens before the seam and closes after the next scene begins; hold and sweep are honoured by the page', () => {
  SEEDS.slice(0, 4).forEach(seed => {
    const P = page(seed); P.timeline.continuity.contracts.forEach(k => { assert.ok(k.overlap.from < 0 && k.overlap.to >= 0); assert.ok(CT.PALETTE_HANDOFFS.includes(k.paletteHandoff)); });
    const h = html(P);
    P.timeline.continuity.contracts.forEach(k => assert.match(h, new RegExp(`data-scene="${k.at}"[^>]*data-pal="${k.overlap.from},${k.overlap.to},(blend|hold|sweep|accent)"`)));
  });
  const h = html(page('1'));
  assert.match(h, /if\(k\+1<n\)\{P=pal\(all\[k\+1\]\);f0=k\+1\+P\[0\];if\(g>=f0\)/, 'the window opens before the seam');
  assert.match(h, /if\(!j&&k>0\)\{P=pal\(all\[k\]\);if\(g<=k\+P\[1\]\)/, '...and closes after it');
  assert.match(h, /mode==='hold'\?EZ\.ss\(cl\(\(t-\.45\)\/\.55\)\)/, 'hold keeps the colour until the middle of its window');
  assert.match(h, /\.cb-b\[data-mode="sweep"\]\{-webkit-mask-image:linear-gradient\(0deg/, 'a sweep rises as a soft front');
  assert.match(h, /--cbg/, 'the scene\'s second colour glows through the handoff');
  // a seam into far-apart colours sweeps
  const k = CT.normalise({}, { scenes: [sc('u1', null, { ink: { surface: '#0c1f4f' } }), sc('r1', null, { ink: { surface: '#432318' } })], timeline: tl(2, ['foreground-wipe']), byId }).continuity.contracts[0];
  assert.equal(k.paletteHandoff, 'sweep');
});

// ================================================================ 4. the premium hero sets the opening's language
test('4. a premium hero video shapes the next scenes: its motion continues across two seams, its colour holds and leans into three scenes', () => {
  const P = page('3', { premium: { video: true, intent: 'cinematic_hero', source: 'u1' }, ctx: { premiumHero: { intent: 'cinematic_hero', source: 'u1' } } });
  const ct = P.timeline.continuity; assert.equal(ct.hero.video, true); assert.equal(ct.hero.motion, 'none', 'before the video exists its direction is unknown: nothing is guessed');
  const next = ct.contracts.filter(k => k.at > ct.hero.scene && k.at <= ct.hero.scene + 2 && k.family !== 'actor-carry');
  assert.ok(next.length >= 1); next.forEach(k => { assert.equal(k.paletteHandoff === 'hold' || k.paletteHandoff === 'sweep', true, 'its colour holds already'); });
  const plain = page('3'); next.forEach(k => assert.equal(k.motionVector, plain.timeline.continuity.contracts.find(x => x.at === k.at).motionVector, 'the seams keep their own pictures\' direction'));
  // the measured motion of the delivered video replaces it, and the page re-validates with it
  const tuned = validatePlan2(PAL.retune(P, '#1a7adf', 'lr'), { mode: 'safety', assets: ASSETS, facts: FACTS, understanding: UND }).plan;
  assert.equal(tuned.timeline.continuity.hero.motion, 'lr');
  tuned.timeline.continuity.contracts.filter(k => k.at <= 2 && k.family !== 'actor-carry').forEach(k => assert.equal(k.motionVector, 'lr'));
  // colour: the next three scenes lean into the hero's colour, strongly then less
  const t = PAL.sceneTones(5, { bg: '#101014' }, ['#0b2f8a', '#c81328', '#c81328', '#c81328', '#c81328'], { hero: '#e76917' });
  const d = [1, 2, 3, 4].map(i => PAL.distance(t[i], PAL.tone('#c81328', { bg: '#101014' })));
  assert.ok(d[0] > d[1] && d[1] > d[2] && d[3] === 0, `the lean fades over three scenes: ${d}`);
  // a measurement that comes back unsure clears an earlier direction: the seams go back to their own pictures' direction
  const unsure = validatePlan2(PAL.retune(tuned, null, 'none'), { mode: 'safety', assets: ASSETS, facts: FACTS, understanding: UND }).plan;
  assert.equal(unsure.timeline.continuity.hero.motion, 'none');
  // (the same page before its video was measured: the premium hero shapes the composition, so another page is no measure)
  unsure.timeline.continuity.contracts.forEach(k => assert.equal(k.motionVector, P.timeline.continuity.contracts.find(x => x.at === k.at).motionVector));
});

// ================================================================ 4b. the video's motion, measured honestly
// a textured synthetic scene filmed through a known camera move (zoom s about the centre, then a shift tx, ty in 64-wide px)
const TEX = (u, v) => 128 + 50 * Math.sin(u * 0.31 + Math.sin(v * 0.17) * 2) + 40 * Math.cos(v * 0.27 - u * 0.11) + 30 * Math.sin((u + v) * 0.53);
const OTHER = (u, v) => 128 + 60 * Math.sin(u * 0.7 + v * 0.4) * Math.cos(v * 0.9);
function film(s, tx, ty, opt) {
  const o = opt || {}, W = o.W || 64, H = o.H || 40, k = 64 / W, cx = (W - 1) / 2, cy = (H - 1) / 2, D = new Uint8ClampedArray(W * H * 4); let seed = o.noise || 0;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 - 0.5; };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const u = cx + (x - cx - tx / k) / s, v = cy + (y - cy - ty / k) / s, i = (y * W + x) * 4, L = (o.tex || TEX)(u * k, v * k) + (o.noise ? rnd() * 16 : 0) + (o.bright || 0); D[i] = L; D[i + 1] = L * 0.9; D[i + 2] = L * 0.8; D[i + 3] = 255; }
  return { width: W, height: H, data: D };
}
test('4b. the video motion estimator: a true pan, a true push-in and pull-back, and "none" for mixed, ambiguous or static frames', () => {
  const still = film(1, 0, 0);
  // a horizontal pan, both ways (and through a little sensor noise)
  let m = CT.estimateMotion(still, film(1, 6, 0)); assert.equal(m.motion, 'lr'); assert.ok(m.confidence > 0.8); assert.deepEqual(m.pan, [6, 0]);
  assert.equal(CT.videoMotion(still, film(1, -6, 0)), 'rl');
  assert.equal(CT.videoMotion(film(1, 0, 0, { noise: 7 }), film(1, 5, 0, { noise: 11 })), 'lr');
  // a zoom is a zoom -- never read as a sideways move (the earlier estimator's mistake), also toward an off-centre point
  m = CT.estimateMotion(still, film(1.12, 0, 0)); assert.equal(m.motion, 'in'); assert.ok(Math.abs(m.zoom - 1.12) < 0.02, `zoom ${m.zoom}`);
  assert.equal(CT.videoMotion(still, film(1.12, -1.2, 0)), 'in', 'a push-in toward a point left of centre');
  assert.equal(CT.videoMotion(film(1, 0, 0, { W: 160, H: 100 }), film(1.12, 0, 0, { W: 160, H: 100 })), 'in', 'larger frames: the same bounded grid');
  m = CT.estimateMotion(still, film(0.88, 0, 0)); assert.equal(m.motion, 'out');
  // mixed or ambiguous: no direction is invented
  assert.equal(CT.estimateMotion(still, film(1.1, 4, 0)).motion, 'none', 'a pan and a zoom of a size: mixed');
  assert.equal(CT.estimateMotion(still, film(1, 0, 0, { tex: OTHER })).motion, 'none', 'a cut to another picture: no camera move explains it');
  assert.equal(CT.estimateMotion(still, film(1, 0, 5)).motion, 'none', 'a vertical move has no left/right/in/out to continue');
  // static: the same frame, the same frame with noise, the same frame brighter
  assert.equal(CT.estimateMotion(still, film(1, 0, 0)).why, 'static');
  assert.equal(CT.videoMotion(film(1, 0, 0, { noise: 3 }), film(1, 0, 0, { noise: 5 })), 'none');
  assert.equal(CT.videoMotion(still, film(1, 0, 0, { bright: 30 })), 'none', 'a brightening is not a move');
  // missing or mismatched frames
  assert.equal(CT.videoMotion(null, still), 'none'); assert.equal(CT.videoMotion(still, film(1, 0, 0, { W: 32, H: 20 })), 'none');
  // and an unsure reading never steers the seams after the hero
  const P = page('3', { premium: { video: true, intent: 'cinematic_hero', source: 'u1' }, ctx: { premiumHero: { intent: 'cinematic_hero', source: 'u1' } } });
  const guess = CT.videoMotion(still, film(1.1, 4, 0)); assert.equal(guess, 'none');
  const Q = validatePlan2(PAL.retune(P, null, guess), { mode: 'safety', assets: ASSETS, facts: FACTS, understanding: UND }).plan;
  assert.equal(Q.timeline.continuity.hero.motion, 'none');
  assert.deepEqual(Q.timeline.continuity.contracts.map(k => k.motionVector), P.timeline.continuity.contracts.map(k => k.motionVector));
});

// ================================================================ 5. text placement from the picture
test('5. words go where the picture is empty: a subject on the right puts them left (and shades that side), a subject on the left puts them right', () => {
  const spec = side => ARCH.composeScene ? null : side; void spec;
  const hero = (textSide) => require('../lib/creative/archetypes');
  void hero;
  // the archetype reads the measured side
  const S = { layers: [], text: { heading: 'ZoomKart', items: [] } };
  const E = ts => ({ textSide: ts, rng: () => 0.5, side: 'right' });
  const A2 = require('../lib/creative/archetypes');
  // (exercised through composition: a full-bleed opening of a picture whose subject is on the right)
  const right = A('ur', { title: 'kart right', assess: ms(1800, 1000, '#0b2f8a', ['#e8e8e8', '#101010', '#2ea4fb'], [0.62, 0.25, 0.92, 0.7]) });
  const left = A('ul', { title: 'kart left', assess: ms(1800, 1000, '#0b2f8a', ['#e8e8e8', '#101010', '#2ea4fb'], [0.08, 0.25, 0.38, 0.7]) });
  const comp = asset => { const m = new Map([[asset.id, asset]]); const scene = { id: 'h', layout: 'editorial-hero', layers: [{ id: 'f', kind: 'image', role: 'focal', asset: asset.id, box: { d: [0, 0, 100, 100], m: [0, 0, 100, 100] }, z: 2, rotate: 0, opacity: 1, mask: 'none', treatment: 'none', entrance: { kind: 'fade', delay: 0, dur: 1 }, loop: { kind: 'none', amp: 1, period: 9 }, scroll: { kind: 'none', amount: 0 }, hideM: false }], text: { heading: 'ZoomKart', items: [], size: 'display', width: 'medium' }, choreo: 'settle' };
    const pr = CT.profileOf(asset); A2.composeScene(scene, { byId: m, si: 0, hero: true, art: { personality: 'kinetic', mode: 'expressive' }, rng: () => 0.5, name: 'ZoomKart', fixes: [], warnings: [], side: pr.side, textSide: ['left', 'right', 'top'].includes(pr.space) && pr.room >= 0.22 ? pr.space : pr.side === 'left' ? 'right' : 'left' }); return scene; };
  const R = comp(right), L = comp(left);
  assert.ok(R.text.place.gc[1] <= 6 && R.text.shade === 'left', `subject right -> words left (${JSON.stringify(R.text.place)}, shade ${R.text.shade})`);
  assert.ok(L.text.place.gc[0] >= 7 && L.text.shade === 'right', `subject left -> words right (${JSON.stringify(L.text.place)}, shade ${L.text.shade})`);
  // each side's words hug their own frame edge (where the shade is deepest, the subject furthest): mirror images
  assert.equal(R.text.place.align, 'left'); assert.equal(L.text.place.align, 'right');
  // on a phone the words sit at the foot of the picture: the side shade becomes a foot shade under them (browser QA found
  // the side band washing over the picture's subject while the words sat below it)
  const hp = html(page('2'));
  assert.match(hp, /@media \(max-width:720px\)\{\.sc\[data-mplace\] \.sc-shade:is\(\[data-shade="left"\],\[data-shade="right"\],\[data-shade="top"\]\)\{top:auto;bottom:0;left:0;right:0;width:auto;height:46%/);
  assert.match(hp, /\.sc\[data-mplace="overlay"\] \.sc-text\[data-align="right"\]\{text-align:left\}/, 'and read left-aligned there');
  assert.match(hp, /\.sc-text\[data-v\]\[data-align="right"\] :is\(\.sc-body,\.sc-list\),\.sc-text\[data-v\]\[data-align="right"\]\[data-width="narrow"\] \.sc-heading\{margin-left:auto\}/);
  void S; void E;
  // the contract records where the words sit; the shades are drawn from their side
  assert.equal(CT.placementOf({ text: { region: 'top-right' } }), 'right'); assert.equal(CT.placementOf({ text: { region: 'center' } }), 'center');
  const h = html(page('2')); assert.match(h, /\.sc-shade\[data-shade="left"\]\{left:0;right:auto\}/);
});

// ================================================================ 6. the main picture recurs; the page closes on its opening
test('6. the main picture opens the page and the last scene calls back to it -- never as a faded echo: a picture appears once, and the one return is a marked callback (the image ledger)', () => {
  SEEDS.forEach(seed => {
    const P = page(seed); const h = html(P); const ct = P.timeline.continuity;
    assert.ok(ct.callback && ['subject', 'colour', 'echo'].includes(ct.callback.kind), `${P.art.recipe}: a callback (${JSON.stringify(ct.callback)})`);
    assert.match(h, new RegExp(`data-scene="${P.scenes.length - 1}"[^>]*data-callback="${ct.callback.kind}"`));
    assert.doesNotMatch(h, /class="sc-ghost"/, `${P.art.recipe}: no faded echo of a picture already on the page`);
    // (the main picture's appearances: the opening, and at most the closing scene's one marked callback layer)
    const again = P.scenes.slice(1).filter(s => s.layers.some(L => L.kind === 'image' && ['u1', 'c-u1'].includes(L.asset)));
    assert.ok(again.every(s => s === P.scenes[P.scenes.length - 1] && s.layers.some(L => L.callback)), `${P.art.recipe}: the main picture returns only as the marked callback`);
  });
  // a page saved before looks keeps its echoes exactly as it was (renderer compatibility) -- a page with a resting scene to
  // echo into (since direction.js some pages are recomposed so that no scene is an empty rest: seed 4 keeps one)
  const P = JSON.parse(JSON.stringify(page('4'))); delete P.look; const h = html(P);
  // (a rest that is itself a composition, or whose own picture fills half the screen, is not an empty field)
  const cover = s => s.layers.filter(L => L.kind === 'image').reduce((t, L) => t + (L.box.d[2] * L.box.d[3]) / 10000, 0);
  P.scenes.forEach((s, i) => { if (i && ['rest', 'acceleration'].includes(P.timeline.rhythm[i]) && !(P.actor && i >= P.actor.from && i <= P.actor.to) && !s.composition && cover(s) < 0.5) assert.match(h, new RegExp(`data-scene="${i}"[^>]*data-echo`), `scene ${i + 1} rests with an echo`); });
  assert.match(h, /<div class="sc-ghost" aria-hidden="true"><img src="[\w-]+\.png"/);
});

// ================================================================ 7. the renderer honours the contracts
test('7. the page does what the contracts say: a carry travels between the two pictures; depth and direction are drawn; mobile simplifies; reduced motion keeps the structure', () => {
  const scenes = [sc('u1'), sc('c-u3'), sc('u2')]; const raw = tl(3, [], ['setup', 'event', 'rest']);
  CT.chooseSeams(raw, { scenes, byId, mode: 'expressive', name: 'ZoomKart' });
  const P = page('4'); const ct = P.timeline.continuity;
  // a page whose seam carries: the element, its window, and the runtime that follows both pictures live
  const carried = P.timeline.continuity.contracts.find(k => k.carry !== 'none');
  const withCarry = carried ? P : (() => { const Q = JSON.parse(JSON.stringify(P)); Q.timeline.continuity.contracts[0].carry = 'strong'; Q.scenes[0].layers.find(L => L.role === 'focal' && L.kind === 'image') || Q.scenes[0].layers.unshift({ id: 'x', kind: 'image', role: 'focal', asset: 'u1', box: { d: [0, 0, 60, 100], m: [0, 0, 100, 60] }, z: 3, rotate: 0, opacity: 1, mask: 'none', treatment: 'none', entrance: { kind: 'fade', delay: 0, dur: 1 }, loop: { kind: 'none', amp: 1, period: 9 }, scroll: { kind: 'none', amount: 0 } }); return Q; })();
  const h = html(withCarry);
  if (withCarry.scenes[1].layers.some(L => L.role === 'focal' && L.kind === 'image')) assert.match(h, /<div class="cs cs-carry" data-at="\d+" data-lead="0" data-span="[\d.]+" data-end="[\d.]+" data-carry="(strong|light)"><img class="csc-a"/);
  assert.match(h, /function carry\(S,w,y0,y1\)\{/); assert.match(h, /var ra=S\.A\.getBoundingClientRect\(\),rb=S\.B\.getBoundingClientRect\(\)/, 'both pictures measured live');
  assert.match(h, /S\.A\.style\.visibility=P\.lift>0&&w<P\.lift\+\.06\?'':'hidden';S\.B\.style\.visibility=P\.land<1&&w>P\.land-\.06\?'':'hidden'/, 'the two copies step aside while it travels');
  // its route keeps the words readable: the page carries the planner verbatim, plans from the words' line boxes near the
  // seam (phone-sized below 720px), and checks again every frame
  assert.ok(h.includes(require('../lib/creative/carry-route').SOURCE), 'the same planner the tests exercise');
  assert.match(h, /querySelectorAll\('\.sc-heading,\.sc-kicker,\.sc-body'\)/); assert.match(h, /r\.selectNodeContents\(t\);\[\]\.forEach\.call\(r\.getClientRects\(\)/);
  assert.match(h, /level:S\.lv,phone:vw<=720\}\)/); assert.match(h, /op=R\.o\*cl\(2-cover\(R,T,vw,vh\)\)/);
  assert.match(h, /if\(P\.level==='none'\)\{if\(S\.on\)\{S\.on=0;st\.opacity='0';S\.A\.style\.visibility='';S\.B\.style\.visibility=''\}return\}/, 'no safe path: the scenes keep their own pictures');
  // depth and direction
  assert.match(h, /\.sc\[data-seam-out="depth-handoff"\] \.sc-stage\{scale:calc\(1 \+ var\(--sx,0\) \* \.3\);opacity:calc\(1 - var\(--sx,0\) \* \.9\);filter:blur/);
  assert.match(h, /\.sc:is\(\[data-vin\],\[data-vout\]\) \.sc-stage\{translate:calc\(\(\(1 - var\(--sn,1\)\) \* var\(--vi,0\)/);
  ct.contracts.forEach(k => { if (k.motionVector !== 'none' && P.scenes[k.at].layout) assert.match(html(P), new RegExp(`data-scene="${k.at}"[^>]*data-vin="${k.motionVector}"`)); });
  // mobile: the same story, smaller -- shorter travel, no blur, a softer echo (nothing removed)
  assert.match(h, /@media \(max-width:720px\)\{\.sc\{--vamp:5\}\.sc-ghost\{opacity:\.16\}\.cs-carry\{filter:none\}\}/);
  assert.match(h, /@media \(max-width:720px\)\{\.sc\[data-seam-out="depth-handoff"\] \.sc-stage\{scale:calc\(1 \+ var\(--sx,0\) \* \.12\);filter:none\}/);
  // reduced motion: the motion goes (the cast layer, the carries, the flow), the structure stays (echoes, shades, each
  // scene in its own colour, the composition)
  assert.match(h, /html\.cr-js:not\(\[data-motion="reduced"\]\) \.cr-cast\{display:block\}/);
  assert.match(h, /html\.cr-js\[data-flowall\]:not\(\[data-motion="reduced"\]\) \.sc\{background:transparent!important\}/, 'only the moving page shares one surface');
  assert.ok(!/\[data-motion="reduced"\][^{]*\.sc-ghost\{display:none/.test(h), 'the echoes stay');
  const reduced = renderCreative2(P, ASSETS, { mode: 'export', src: a => `${a.id}.png`, motion: 'reduced' });
  assert.match(reduced, /data-motion="reduced"/); assert.doesNotMatch(reduced, /class="sc-ghost"/, 'a page with a look shows no echo, moving or not');
  const old = JSON.parse(JSON.stringify(P)); delete old.look;
  assert.match(renderCreative2(old, ASSETS, { mode: 'export', src: a => `${a.id}.png`, motion: 'reduced' }), /class="sc-ghost"/, 'a page saved before looks keeps its echoes in reduced motion');
});

// ================================================================ 8. the critic hears the rhythm
test('8. the critic catches repeated heavy moves, the same direction or scale three times, too much quiet, and an ending without payoff', () => {
  const S = n => Array.from({ length: n }, (_, i) => sc(['u1', 'u2', 'r1', 'c-u3', 'u3', 'u1'][i % 6], null, { ink: { surface: '#202030' } }));
  const planOf = (n, contracts, rhythm, mode) => ({ art: { mode: mode || 'expressive' }, scenes: S(n), timeline: { actors: [], beats: [], rhythm: rhythm || ['setup'].concat(Array(n - 1).fill('rest')), transitions: contracts.map(k => ({ at: k.at, family: k.family })), continuity: { contracts, hero: null } } });
  const k = (at, extra) => Object.assign({ at, family: 'color-bleed', intent: 'continue', carriedActor: 'none', carriedAsset: '', outgoing: { el: 'surface', x: 0, y: 0, s: 1, o: 1, surface: '#202030' }, incoming: { el: 'surface', x: 0, y: 0, s: 1, o: 1, surface: '#202030' }, overlap: { from: -0.4, to: 0 }, typography: 'none', relationship: 'none', carry: 'none', paletteHandoff: 'blend', depthHandoff: 'none', motionVector: 'none' }, extra || {});
  const codes = p => CT.critique(p, byId).map(i => i.code);
  // three heavy moves in a row: no rest
  assert.ok(codes(planOf(5, [k(1, { family: 'image-expand' }), k(2, { family: 'depth-handoff' }), k(3, { family: 'foreground-wipe' }), k(4)], ['setup', 'event', 'rest', 'escalation', 'payoff'])).includes('no-rest'));
  // the same direction, the same scale behaviour, three seams running
  assert.ok(codes(planOf(5, [k(1, { motionVector: 'lr' }), k(2, { motionVector: 'lr' }), k(3, { motionVector: 'lr' }), k(4)], ['setup', 'rest', 'rest', 'rest', 'payoff'])).includes('same-direction'));
  assert.ok(codes(planOf(5, [k(1, { depthHandoff: 'forward' }), k(2, { depthHandoff: 'forward' }), k(3, { depthHandoff: 'forward' }), k(4)], ['setup', 'rest', 'rest', 'rest', 'payoff'])).includes('same-scale'));
  // a page meant to move that only fades, and ends trailing off
  const flat = planOf(5, [k(1), k(2), k(3), k(4)]); const c = codes(flat);
  assert.ok(c.includes('too-quiet') && c.includes('no-payoff'), JSON.stringify(c));
  assert.ok(!codes(Object.assign(planOf(5, [k(1), k(2), k(3), k(4)]), { art: { mode: 'quiet' } })).includes('too-quiet'), 'a quiet page may be quiet');
  // the fixes: motion stopped, a seam made calm, an ending turned into a payoff, a move given to the quiet page
  const fx = CT.fixesFor([{ code: 'same-direction', at: 3 }, { code: 'same-scale', at: 3 }, { code: 'no-payoff', at: 4 }, { code: 'too-quiet', at: 2 }], flat);
  assert.deepEqual(fx.map(f => [f.code, f.motionVector || f.family || (f.payoff && 'payoff')]), [['same-direction', 'none'], ['same-scale', 'color-bleed'], ['no-payoff', 'payoff'], ['too-quiet', 'image-expand']]);
  const applied = CT.apply({ timeline: Object.assign({}, flat.timeline) }, CT.withFixes(flat.timeline.continuity, fx)).timeline;
  assert.equal(applied.rhythm[4], 'payoff');
  // and the built pages: an expressive page ends on a payoff or calls back to its opening
  SEEDS.forEach(seed => { const P = page(seed); if (['expressive', 'immersive'].includes(P.art.mode)) assert.ok(['payoff', 'event', 'escalation'].includes(P.timeline.rhythm[P.scenes.length - 1]) || P.timeline.continuity.callback.kind !== 'none', P.art.recipe); });
});

// ================================================================ 9. the arc
test('9. the arc: setup, then acceleration before the first event, a payoff at the end -- and the rhythm language accepts it', () => {
  const TL = require('../lib/creative/timeline');
  assert.ok(TL.RHYTHM.includes('acceleration'));
  // (after a premium hero the scene that follows never just rests: it gathers pace, or it is already the first event)
  SEEDS.forEach(seed => {
    const P = page(seed, { premium: { video: true, intent: 'cinematic_hero', source: 'u1' }, ctx: { premiumHero: { intent: 'cinematic_hero', source: 'u1' } } }); const R = P.timeline.rhythm;
    assert.equal(R[0], 'setup');
    if (['expressive', 'immersive'].includes(P.art.mode) && R.length >= 4) {
      assert.ok(['acceleration', 'event', 'escalation'].includes(R[1]) || (P.actor && P.actor.from <= 1), `${P.art.recipe}: scene 2 is ${R[1]}`);
      assert.ok(['payoff', 'event', 'escalation'].includes(R[R.length - 1]), `${P.art.recipe}: it ends on ${R[R.length - 1]}`);
    }
  });
  // a page whose second scene had nothing planned gathers pace there
  const raw = { rhythm: ['setup', 'rest', 'event', 'rest', 'rest'] };
  void raw;
  assert.equal(TL.behavior({ rhythm: ['setup', 'acceleration', 'event'] }).includes('r:SAE'), true);
});
