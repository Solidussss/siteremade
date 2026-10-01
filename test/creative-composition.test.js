'use strict';
// CREATIVE COMPOSITIONS (lib/creative/composition.js): the motion-first layer above the layouts. A page meant to move is
// not six variants of image + copy: what dominates the screen, what moves and what transforms is a composition from a
// fixed vocabulary, staged on its base archetype, played by one coordinated set of plane tracks. Mocks and fixtures only.
const test = require('node:test');
const assert = require('node:assert/strict');
const COMP = require('../lib/creative/composition');
const CT = require('../lib/creative/continuity');
const ART = require('../lib/creative/art');
const ARCH = require('../lib/creative/archetypes');
const PAL = require('../lib/creative/palette');
const AI = require('../lib/creative/ai');
const FR = require('../lib/creative/framing');
const D2 = require('../lib/creative/director2');
const { validatePlan2 } = require('../lib/creative/validate2');
const { renderCreative2 } = require('../lib/creative/render2');

// ---------------------------------------------------------------- fixtures (as measured: assess)
const A = (id, extra) => Object.assign({ id, origin: 'upload', title: id, relevance: 2, mime: 'image/png', assetRef: 'a'.repeat(64), caps: { moveFreely: false, frame: true, backdrop: true, heroSize: true } }, extra);
const ms = (w, h, bg, cols, subject, more) => Object.assign({ width: w, height: h, aspect: +(w / h).toFixed(3), orientation: w > h * 1.15 ? 'landscape' : h > w * 1.15 ? 'portrait' : 'square', background: { colour: bg, uniformity: 0.3, tolerance: 60 }, colours: cols, subject, luminance: 90, transparent: false }, more || {});
// a chrome figure in deep space: the action shot (main), the figure cut out, a portrait with its cut-out, deep space
const ACTION = A('act', { title: 'the drifter surfing through space', ownerRole: 'main', assess: ms(1920, 1080, '#05081a', ['#c8ccd8', '#05081a', '#3050c0'], [0.55, 0.15, 0.8, 0.85]) });
const FIG = A('fig', { title: 'the drifter, cut out', assess: ms(900, 1300, '#ffffff', ['#c8ccd8', '#8890a0', '#ffffff'], [0.1, 0.02, 0.9, 0.98], { transparent: true }), caps: { moveFreely: true } });
const POR = A('por', { title: 'the drifter, portrait', assess: ms(1400, 1600, '#0c1846', ['#c8ccd8', '#0c1846', '#8890a0'], [0.26, 0.16, 0.74, 0.98], { background: { colour: '#0c1846', uniformity: 0.95, tolerance: 24 } }) });
const PORCUT = A('c-por', { origin: 'derived', cutout: true, cutoutOf: 'por', title: 'the drifter, portrait', assess: ms(720, 1380, '#ffffff', ['#c8ccd8', '#8890a0'], [0.02, 0.02, 0.98, 0.98], { transparent: true }), caps: { moveFreely: true } });
const SPACE = A('space', { origin: 'research', title: 'deep space', license: 'CC0', pageUrl: 'https://example.org/space', author: 'X', curation: { role: 'environment', identity: 'related', depicts: 'deep space', issues: [] }, assess: ms(1920, 1080, '#05081a', ['#05081a', '#3050c0', '#ffffff'], [0, 0, 1, 1]) });
const LOGO = A('lg', { title: 'logo', ownerRole: 'logo', relevance: 0, assess: ms(480, 140, '#ffffff', ['#8aa0ff'], [0.02, 0.1, 0.96, 0.9], { transparent: true }) });
const ASSETS = [ACTION, FIG, POR, PORCUT, SPACE, LOGO];
const byId = new Map(ASSETS.map(a => [a.id, a]));
const UND = { kind: 'recognizable', subject: 'Argent Drifter', name: 'Argent Drifter', brief: 'A page about the Argent Drifter, the chrome cosmic surfer: epic and cinematic', tone: { register: 'cinematic' },
  identity: { name: 'Argent Drifter', kind: 'fictional', type: 'fictional-character', what: 'a chrome-skinned cosmic herald who surfs alone through deep space on a silver board' }, visuals: { main: 'a silver chrome figure on a surfboard in deep space' }, motifs: ['chrome', 'cosmic', 'speed'] };
const FACTS = [{ id: 'f1', text: 'The Argent Drifter travels between stars on a silver board.', section: 'x' }, { id: 'f2', text: 'Its chrome skin reflects every light it passes.', section: 'x' }];
function page(seed, extra) {
  const x = extra || {};
  const { plan, recipe } = D2.direct(Object.assign({ understanding: UND, research: { page: null, facts: FACTS }, assets: ASSETS, supplied: { facts: [], memories: [] }, seed, mainAsset: 'act' }, x.premium ? { premium: x.premium } : {}));
  const v = validatePlan2(plan, Object.assign({ assets: ASSETS, facts: FACTS, understanding: UND, art: recipe, mainAsset: 'act' }, x.ctx || {}));
  assert.deepEqual(v.errors, []); return Object.assign(v, { recipe, raw: plan });
}
const SEEDS = ['1', '2', '3', '4', '5', '6', '7', '8'];
const moving = SEEDS.map(s => page(s)).filter(v => ['expressive', 'immersive'].includes(v.plan.art.mode));
const html = (P, extra) => renderCreative2(P, (extra && extra.assets) || ASSETS, Object.assign({ mode: 'export', src: a => `${a.id}.png` }, extra || {}));

// ================================================================ 1. the vocabulary
test('1. a bounded vocabulary of compositions: each says what dominates, what moves, what stays, what it becomes -- staged on a real archetype', () => {
  assert.equal(COMP.COMPOSITIONS.length, 15);
  COMP.COMPOSITIONS.forEach(k => {
    const S = COMP.SPEC[k];
    ['what', 'dominant', 'intensity', 'camera', 'frame', 'text', 'act', 'becomes', 'fixed', 'moves'].forEach(f => assert.ok(S[f] != null && S[f] !== '', `${k}.${f}`));
    assert.ok(COMP.CAMERAS.includes(S.camera)); assert.ok(COMP.TEXT_ROLES.includes(S.text)); assert.ok(COMP.TYPE_ACTS.includes(S.act)); assert.ok(S.arcs.every(a => COMP.ARC.includes(a)));
    COMP.BASES[k].forEach(b => assert.ok(ARCH.ARCHETYPES.includes(b), `${k} is staged on ${b}`));
    // every key is a number inside the bounds
    Object.values(S.planes).forEach(keys => keys.forEach(q => { assert.equal(q.length, 8); const b = COMP.boundKey(q, 6.5); assert.deepEqual(b, q.map(v => Math.round(v * 100) / 100)); }));
  });
  // the new stages are archetypes of their own, with their own phone stage
  ['object-stage', 'depth-stack', 'type-stage', 'mask-stage', 'image-wall', 'canvas'].forEach(l => { assert.ok(ARCH.ARCHETYPES.includes(l)); assert.ok(ARCH.MSTAGE[l]); assert.ok(ART.LAYOUTS.includes(l)); });
  assert.ok(ART.CHOREOS.includes('compose'));
});

// ================================================================ 2. the model chooses from the vocabulary only
test('2. a composition is a name from the vocabulary, validated against the scene\'s own pictures -- never motion described by a model', () => {
  const v = moving[0]; const raw = JSON.parse(JSON.stringify(v.raw));
  raw.scenes[1].composition = 'banana-spin'; raw.scenes[2].composition = 'mask-stage';
  const r = validatePlan2(raw, { assets: ASSETS, facts: FACTS, understanding: UND, art: v.recipe, mainAsset: 'act' });
  assert.ok(COMP.COMPOSITIONS.includes(r.plan.scenes[1].composition) || !r.plan.scenes[1].composition, 'an unknown name never passes');
  assert.ok(r.fixes.some(f => /banana-spin|composition/.test(f)));
  // a composition a scene's pictures cannot carry is staged as the nearest one they can (or not at all), and says so
  const flat = { layers: [{ kind: 'image', role: 'focal', asset: 'space' }], text: { heading: 'A very long heading that is not a few words at all', items: [] } };
  const x = COMP.carryOf(flat, byId, {}); assert.equal(x.cut, false); assert.equal(COMP.fit('object-stage', x), false);
  assert.ok(COMP.alternatives('object-stage', 'reveal').some(k => COMP.fit(k, x)));
  // no motion field passes through: tracks are computed from the name at render time, never stored
  r.plan.scenes.forEach(s => { assert.equal(s.tracks, undefined); assert.equal(s.planes, undefined); });
  // a saved page keeps its compositions exactly (re-validating is idempotent)
  const again = validatePlan2(r.plan, { mode: 'safety', assets: ASSETS, facts: FACTS, understanding: UND });
  assert.equal(JSON.stringify(again.plan.scenes), JSON.stringify(r.plan.scenes));
  // a quiet page carries no composition
  const quiet = page('q1', { ctx: {} }); if (quiet.plan.art.mode === 'quiet') assert.ok(quiet.plan.scenes.every(s => !s.composition));
});

// ================================================================ 3. not six variants of image + copy
test('3. expressive and immersive pages are not editorial: few splits, no runs of them, a takeover, a full-screen visual, the subject centred, a typography moment', () => {
  assert.ok(moving.length >= 4);
  moving.forEach(v => {
    const m = COMP.metrics(v.plan); const tag = `${v.plan.art.recipe.split('#')[0]}`;
    assert.ok(m.editorial <= 2 && m.longestEditorialRun < 3 && m.longestFramedRun < 3, `${tag}: ${JSON.stringify(m)}`);
    assert.ok(m.compositions >= Math.ceil(v.plan.scenes.length / 2), `${tag}: most scenes are compositions (${m.compositions})`);
    assert.ok(m.takeovers >= 1 && m.centred >= 1 && m.typeLed >= 1 && m.camera >= 2, `${tag}: ${JSON.stringify(m)}`);
    assert.deepEqual(COMP.audit(v.plan, { subject: true }).filter(x => ['too-editorial', 'repeated-split', 'framed-images', 'no-takeover', 'no-hook', 'same-composition'].includes(x.code)), [], tag);
  });
  // the structure rules themselves: six image + copy splits fail every one of them
  const split = (i, side) => ({ id: `s${i}`, layout: i % 2 ? 'split' : 'framed', layers: [{ kind: 'image', role: 'focal', asset: 'por', mask: 'window', box: { d: side ? [52, 10, 40, 76] : [8, 10, 40, 76], m: [0, 0, 100, 60] } }], text: { heading: 'x', items: [] }, choreo: 'settle' });
  const editorial = { art: { mode: 'expressive' }, scenes: [0, 1, 2, 3, 4, 5].map(i => split(i, i % 2)) };
  const codes = COMP.audit(editorial, { subject: true }).map(x => x.code);
  ['too-editorial', 'repeated-split', 'framed-images', 'no-takeover', 'no-fullscreen', 'no-type-moment', 'no-transformation', 'flat-depth', 'no-camera', 'no-hook'].forEach(c => assert.ok(codes.includes(c), `${c} in ${codes}`));
  // an editorial or quiet page is not held to them
  assert.deepEqual(COMP.audit(Object.assign({}, editorial, { art: { mode: 'editorial' } })), []);
});

// ================================================================ 4. the validator repairs a page that came back editorial
test('4. a director that returns image + copy on every scene is repaired: the findings move onto scenes that can carry a composition -- never losing a picture', () => {
  const v = moving[0]; const raw = JSON.parse(JSON.stringify(v.raw));
  raw.scenes.forEach((s, i) => { if (i) { s.layout = i % 2 ? 'split' : 'framed'; delete s.composition; } });
  const art = Object.assign({}, v.recipe, { scenes: v.recipe.scenes.map((s, i) => (i ? Object.assign({}, s, { composition: undefined, layout: i % 2 ? 'split' : 'framed' }) : s)) });
  const r = validatePlan2(raw, { assets: ASSETS, facts: FACTS, understanding: UND, art, mainAsset: 'act' });
  const page = r.fixes.filter(f => /^page: /.test(f)); assert.ok(page.length >= 1, r.fixes.join('\n'));
  const m = COMP.metrics(r.plan); assert.ok(m.longestEditorialRun < 3, JSON.stringify(m));
  assert.ok(COMP.audit(r.plan, { subject: true }).length < COMP.audit({ art: r.plan.art, scenes: raw.scenes.map(s => Object.assign({ layers: [] }, s)) }, { subject: true }).length + 1);
  // every picture the director placed is still on the page
  const pics = P => new Set(P.scenes.flatMap(s => (s.layers || []).filter(L => L.kind === 'image').map(L => (byId.get(L.asset) && byId.get(L.asset).cutoutOf) || L.asset)));
  const before = pics({ scenes: raw.scenes }); const after = pics(r.plan); [...before].filter(id => byId.has(id) && id !== 'lg').forEach(id => assert.ok(after.has(id), `${id} kept`));
});

// ================================================================ 5. subjects escape their frames
test('5. what dominates is never trapped in a card: no window or polaroid around a composition\'s subject; the name stands behind it; the frame transforms', () => {
  moving.forEach(v => v.plan.scenes.forEach(s => {
    if (!s.composition || ['tunnel-stage', 'perspective-lineup'].includes(s.composition)) return;
    const f = s.layers.find(L => L.kind === 'image' && L.role === 'focal'); if (f) assert.ok(!COMP.CARD_MASKS.includes(f.mask), `${s.composition}: ${f.mask}`);
  }));
  // the object stage: the subject's own name set huge BEHIND it (a lower z), the words a small label at the edge
  const stage = moving.flatMap(v => v.plan.scenes).find(s => s.composition === 'object-stage' && s.layers.some(L => L.kind === 'word'));
  if (stage) { const w = stage.layers.find(L => L.kind === 'word'); const f = stage.layers.find(L => L.role === 'focal'); assert.ok(w.z < f.z); assert.equal(stage.text.role, 'label'); assert.equal(stage.text.act, 'behind-subject'); }
  // a picture that opens from a window: the window is part of its track (closed at the start, open later)
  const P = moving.map(v => v.plan).find(p => p.scenes.some(s => ['image-takeover', 'split-transform'].includes(s.composition)));
  if (P) { const i = P.scenes.findIndex(s => ['image-takeover', 'split-transform'].includes(s.composition)); const t = COMP.tracks(P.scenes[i], i, { byId }); const sub = Object.values(t.planes).find(q => q.plane === 'subject'); assert.ok(sub.win && sub.keys[0][6] === 1 && sub.keys[sub.keys.length - 1][6] === 0, JSON.stringify(sub)); }
  // a busy picture (a starfield measures tight everywhere) may still fill the screen within a light crop
  assert.equal(FR.profile(SPACE).tight, true); assert.equal(FR.canBleed(SPACE, 1.6), true);
  // a studio shot (a plain background, so a clean cut-out) is never stretched full-bleed: its cut-out stands on the stage
  assert.equal(COMP.carryOf({ layers: [{ kind: 'image', role: 'focal', asset: 'por' }], text: { heading: 'x' } }, byId, {}).bleed, false);
});

// ================================================================ 6. the premium hero is the opening event
test('6. the premium hero video owns the opening: full screen, never a split or a card, never giant type over it -- and its measured motion leads the next scenes\' camera', () => {
  const v = page('3', { premium: { video: true, intent: 'cinematic_hero', source: 'act' }, ctx: { premiumHero: { intent: 'cinematic_hero', source: 'act' } } });
  const s0 = v.plan.scenes[0];
  assert.ok(['fullscreen-subject', 'cinematic-chapter'].includes(s0.composition), s0.composition); assert.equal(s0.layout, 'editorial-hero');
  const f = s0.layers.find(L => L.kind === 'image' && L.role === 'focal'); assert.equal(f.asset, 'act', 'the photo the video is made from, full-bleed'); assert.equal(f.frame, 'bleed');
  assert.notEqual(s0.text.size, 'display'); assert.ok(!s0.text.giant); assert.equal(s0.text.act, 'pinned');
  // the video plays inside that full-bleed frame
  const withVideo = ASSETS.map(a => (a.id === 'act' ? Object.assign({}, a, { video: { mediaId: 'pm_test_000002', assetRef: 'a'.repeat(64), mime: 'video/mp4' } }) : a));
  const P = validatePlan2(PAL.retune(v.plan, '#0a1440', 'in'), { mode: 'safety', assets: withVideo, facts: FACTS, understanding: UND }).plan;
  const h = html(P, { assets: withVideo, videoSrc: a => (a.video ? 'hero.mp4' : '') });
  assert.match(h, /<section class="sc cr-hero"[^>]*data-comp="(fullscreen-subject|cinematic-chapter)"/); assert.match(h, /<video class="ly-vid"/);
  // the measured push-in continues through the next two scenes' cameras (and no further)
  const lead = (i, m) => COMP.tracks(P.scenes[i], i, { byId, lead: m, leadNear: i >= 1 && i <= 2 });
  const comp = P.scenes.findIndex((s, i) => i >= 1 && i <= 2 && s.composition && COMP.SPEC[s.composition].planes.subject);
  if (comp > 0) { const a = Object.values(lead(comp, 'in').planes).find(q => q.plane === 'subject'); const b = Object.values(lead(comp, 'none').planes).find(q => q.plane === 'subject'); assert.ok(a.keys[a.keys.length - 1][3] >= b.keys[b.keys.length - 1][3]); }
  const far = COMP.tracks(P.scenes[1], 4, { byId, lead: 'lr', leadNear: false }); const near = COMP.tracks(P.scenes[1], 1, { byId, lead: 'lr', leadNear: true });
  if (far && near && Object.keys(near.planes).length) assert.notDeepEqual(JSON.stringify(near.planes), JSON.stringify(far.planes), 'a pan carries into the scene after the hero');
});

// ================================================================ 7. typography is an actor
test('7. typography as part of the composition: a type takeover, a word mask, words stacked, a label at the edge -- long copy becomes a late caption, never dropped', () => {
  const S = s => moving.flatMap(v => v.plan.scenes).find(s);
  const tt = S(s => s.composition === 'type-takeover');
  if (tt) { assert.ok(tt.text.giant || tt.layers.some(L => L.kind === 'word'), 'the type IS the visual: the heading set giant, or the subject\'s name'); assert.ok(['scale-through', 'word-stack', 'pinned'].includes(tt.text.act)); }
  // a scene's own long body is not a paragraph beside the picture: a caption revealed late (every fact stays on the page)
  const long = moving.flatMap(v => v.plan.scenes.map(s => ({ v, s }))).find(x => x.s.composition && x.s.text.copy === 'caption');
  if (long) { assert.ok(x => x); const h = html(long.v.plan); assert.ok(h.includes(long.s.text.body.split(' ').slice(0, 3).join(' ').replace(/&/g, '&amp;')), 'the caption is on the page'); assert.match(h, /data-copy="caption"/); }
  const h = html(moving[0].plan);
  assert.match(h, /\.sc\[data-comp="mask-stage"\] :is\(\.sc-text\[data-giant\] \.sc-heading,\.ly\[data-kind="word"\] \.ly-word\)\{background:var\(--mimg\)/, 'a word mask cuts the picture out of the letters');
  assert.match(h, /\.sc-text\[data-act="word-stack"\] \.sc-heading \.w\{display:block/);
  assert.match(h, /\.sc\[data-comp\] \.sc-text\[data-copy="caption"\] \.sc-body\{[^}]*opacity:clamp\(0,calc\(\(var\(--p,1\) - \.42\) \* 4\),1\)/);
  // the director is told the words' role for each composed scene
  const input = AI.directContent ? AI.DIRECTOR_SYSTEM : ''; assert.match(input, /wordsRole/);
});

// ================================================================ 8. one camera with depth
test('8. one coordinated camera: every plane\'s keys come from the composition\'s one spec, bounded, a photo never enlarged past its ceiling, depth by plane', () => {
  moving.forEach(v => v.plan.scenes.forEach((s, i) => {
    if (!s.composition) return; const t = COMP.tracks(s, i, { byId });
    Object.entries(t.planes).forEach(([id, q]) => {
      assert.ok(['subject', 'bg', 'fg', 'type'].includes(q.plane));
      const L = s.layers.find(x => x.id === id); const a = L && L.kind === 'image' && byId.get(L.asset); const free = a && ((a.caps && a.caps.moveFreely) || a.cutout || (a.assess && a.assess.transparent));
      q.keys.forEach(k => { assert.ok(k[0] >= 0 && k[0] <= 1); assert.ok(Math.abs(k[1]) <= 60 && Math.abs(k[2]) <= 40 && k[5] >= 0 && k[5] <= 1); if (a && !free && q.plane === 'subject' && !COMP.SPEC[s.composition].wall) assert.ok(k[3] <= FR.ZOOM.detail + 1e-9, `${s.composition} ${a.id} x${k[3]}`); });
    });
  }));
  // the depth stack: the far plane recedes while the subject comes forward and a foreground light passes -- one move
  const D = COMP.SPEC['depth-stack'].planes; assert.ok(D.bg[0][3] > D.bg[D.bg.length - 1][3] && D.subject[D.subject.length - 1][3] > D.subject[0][3] && D.fg[0][1] < D.fg[D.fg.length - 1][1]);
  // words on the right open windows from the left (mirrored), the rest of the move the same
  const S = { composition: 'image-takeover', layers: [{ id: 'f', kind: 'image', role: 'focal', asset: 'space', box: { d: [0, 0, 100, 100] } }], text: {} };
  const L = COMP.tracks(S, 1, { byId }), R = COMP.tracks(S, 1, { byId, mirror: true });
  assert.equal(R.planes.f.win[0], 100 - L.planes.f.win[0] - L.planes.f.win[2]);
  assert.deepEqual(COMP.sample([[0, 0, 0, 1, 0, 1, 0, 0], [1, 10, 0, 2, 0, 1, 0, 0]], 0.5).slice(0, 3), [5, 0, 1.5]);
});

// ================================================================ 9. the page plays its compositions
test('9. the renderer honours the compositions: planes with their keys, the resting state inline (reduced motion, no scripting), a phone shortens the travel', () => {
  const P = moving.find(v => v.plan.scenes.some(s => s.composition)).plan; const h = html(P);
  const i = P.scenes.findIndex(s => s.composition); const s = P.scenes[i];
  assert.match(h, new RegExp(`data-scene="${i}"[^>]*data-comp="${s.composition}" data-cam="${COMP.SPEC[s.composition].camera}" data-rest="${COMP.SPEC[s.composition].rest}"`));
  assert.match(h, /data-plane="(subject|bg|fg|type|text)" data-tk="[-\d.,;]+"/);
  assert.match(h, /data-plane="[a-z]+" data-tk="[^"]+"[^>]*style="[^"]*--ko:[\d.]+;transform:translate3d\(/, 'the resting state is written inline');
  assert.match(h, /function compFrame\(s,p,vw\)\{var m=vw<=720\?\.55:1;/, 'a phone travels about half as far');
  assert.match(h, /if\(red\)\{if\(s\._ct\)compRest\(s\);/, 'reduced motion holds every plane at the resting state');
  assert.match(h, /html\.cr-js \.sc\[data-pin\]\[data-choreo="compose"\]\{height:190vh\}/); assert.match(h, /html\.cr-js \.sc\[data-pin\]\[data-choreo="compose"\]\{height:160svh\}/);
  assert.match(h, /html\[data-motion="reduced"\] \.sc\[data-comp\]\[data-pin\]\{height:auto\}/);
  const reduced = renderCreative2(P, ASSETS, { mode: 'export', src: a => `${a.id}.png`, motion: 'reduced' }); assert.match(reduced, /data-comp=/, 'the structure stays');
  // the held compositions stay within the mode's own budget
  moving.forEach(v => { const held = v.plan.scenes.filter(x => x.pin && x.choreo === 'compose').length; assert.ok(held <= COMP.HOLDS[v.plan.art.mode], `${held} held`); });
});

// ================================================================ 10. the critic scores the page as a whole
test('10. the critic hears the whole page: too editorial, framed, no takeover, no hook, flat, no camera -- with bounded fixes the server applies by recomposing', async () => {
  assert.ok(COMP.AUDIT.every(c => CT.CRITIC.includes(c)));
  const v = moving[0]; const P = JSON.parse(JSON.stringify(v.plan));
  // take the page back to image + copy (as a model might have written it) and ask the critic
  P.scenes.forEach((s, i) => { if (i > 0 && i < P.scenes.length - 1) { delete s.composition; s.layout = i % 2 ? 'split' : 'framed'; s.layers.forEach(L => { if (L.kind === 'image') { L.mask = 'window'; L.box = { d: i % 2 ? [52, 10, 38, 76] : [8, 10, 38, 76], m: [0, 0, 100, 60] }; } }); } });
  const found = CT.critique(P, byId); const codes = found.map(x => x.code);
  assert.ok(codes.some(c => COMP.AUDIT.includes(c)), codes.join());
  const fx = CT.fixesFor(found, P, byId).filter(f => f.composition);
  assert.ok(fx.length >= 1); fx.forEach(f => { assert.ok(COMP.COMPOSITIONS.includes(f.composition)); assert.ok(Number.isInteger(f.scene)); });
  // a model's fix is cleaned to the vocabulary
  assert.deepEqual(CT.cleanFixes([{ at: 2, code: 'too-editorial', scene: 2, composition: 'object-stage' }, { at: 2, code: 'too-editorial', scene: 2, composition: 'spin-forever' }], P.scenes.length).map(f => f.composition), ['object-stage', undefined]);
  // the server pass (built-in only: no model calls) recomposes the scenes the fixes name
  const L = Object.assign(AI.limits({}), { continuity: false, continuityCritic: false });
  const r = await AI.continuity(P, { assets: ASSETS, facts: FACTS, understanding: UND, premiumRequested: [] }, { limits: L });
  assert.ok(r.meta.found.some(c => COMP.AUDIT.includes(c)), r.meta.found.join());
  assert.ok(COMP.metrics(r.plan).editorial < COMP.metrics(P).editorial, `${COMP.metrics(P).editorial} -> ${COMP.metrics(r.plan).editorial} editorial scenes`);
  assert.equal(r.meta.calls, 0, 'no model was called');
});

// ================================================================ 11. the subject decides the concept
test('11. what the subject IS shapes the page: a chrome cosmic figure lives in a dark void with stars, catches the light, and is staged alone and vast', () => {
  const d = COMP.artDirection(UND);
  ['cosmic', 'chrome', 'speed', 'figure'].forEach(t => assert.ok(d.traits.includes(t), t)); assert.equal(d.field, 'void'); assert.equal(d.light, 'specular');
  assert.ok(d.weights['fullscreen-subject'] > 1 && d.weights['object-stage'] > 1 && (d.weights['image-wall'] || 1) < 1);
  const P = moving[0].plan; assert.equal(P.art.direction.field, 'void');
  assert.ok(PAL.lum ? PAL.lum(P.palette.bg) < 0.08 : true, `a dark field (${P.palette.bg})`); assert.equal(P.atmosphere.particles, 'stars');
  const sheen = moving.flatMap(v => v.plan.scenes).filter(s => ['object-stage', 'object-focus'].includes(s.composition)).flatMap(s => s.layers.filter(L => L.role === 'focal' && byId.get(L.asset) && FR.profile(byId.get(L.asset)).free));
  sheen.forEach(L => assert.equal(L.loop.kind, 'sheen', 'chrome catches the light'));
  // a product sits in a studio; a world gets chapters -- and a subject with no visual traits keeps the even weights
  assert.equal(COMP.artDirection({ subject: 'Volt Runner', identity: { what: 'a running sneaker' } }).field, 'studio');
  assert.ok(COMP.artDirection({ subject: 'Lisbon', identity: { what: 'a coastal city' } }).weights['cinematic-chapter'] > 1);
  assert.deepEqual(COMP.artDirection({ subject: 'Thing' }).traits, []);
});

// ================================================================ 12. rhythm and anti-repetition
test('12. a page plays an arc -- hook, transformation, reveal, breath, takeover, payoff -- never two events side by side, and pages are compared by what they do', () => {
  moving.forEach(v => {
    const arcs = v.plan.scenes.map(s => s.arc).filter(Boolean); if (!arcs.length) return;
    assert.equal(v.plan.scenes[0].arc, 'hook'); assert.equal(v.plan.scenes[v.plan.scenes.length - 1].arc, 'payoff');
    const R = v.plan.timeline.rhythm; for (let i = 1; i < R.length; i++) assert.ok(!(['event', 'escalation'].includes(R[i]) && ['event', 'escalation'].includes(R[i - 1])), R.join());
  });
  [3, 4, 5, 6, 7, 9].forEach(n => [0, 0.5, 0.99].forEach(p => { const a = COMP.arcFor(n, 'immersive', p); assert.equal(a.length, n); assert.equal(a[0], 'hook'); assert.equal(a[n - 1], 'payoff'); }));
  assert.notDeepEqual(COMP.arcFor(6, 'expressive', 0), COMP.arcFor(6, 'expressive', 0.9), 'more than one arc per length');
  // the fingerprint names a composed scene by its composition
  const fp = ART.fingerprint(moving[0].plan); moving[0].plan.scenes.filter(s => s.composition).forEach(s => assert.ok(fp.includes(`=${s.composition}`), fp));
});
