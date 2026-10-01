'use strict';
// CREATIVE CONTINUITY (lib/creative/continuity.js + the continuity pass in lib/creative/ai.js): the page as ONE directed
// experience. Every seam is a contract whose outgoing state IS the next scene's incoming state; the choreography pass
// (one model call) and the critic (one cheap call) answer in a fixed vocabulary; both fall back safely; nothing here ever
// reaches a paid provider -- the model is an in-process fake or the mock server, and Higgsfield is never called.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const TL = require('../lib/creative/timeline');
const CT = require('../lib/creative/continuity');
const COMP = require('../lib/creative/composition');
const AI = require('../lib/creative/ai');
const D2 = require('../lib/creative/director2');
const { validatePlan2 } = require('../lib/creative/validate2');
const { renderCreative2 } = require('../lib/creative/render2');
const { startServer, client, providerCalls } = require('./helpers/server-process');
const { mockPng } = require('./helpers/mock-image');

// ---------------------------------------------------------------- fixtures (the pictures as measured: assess, curation)
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
const byId = new Map(ASSETS.map(a => [a.id, a]));
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
const html = (plan, extra) => renderCreative2(plan, (extra && extra.assets) || ASSETS, Object.assign({ mode: 'export', src: a => `${a.id}.png` }, extra || {}));
const BRIEFS = [['Grumpy Cat', 'An absurd shrine to Grumpy Cat, the internet meme', 'absurd'], ['Birkin bag', 'a quiet, expensive luxury fashion page', 'restrained'], ['Brian Eno', 'an experimental page for an ambient music pioneer', 'extravagant'], ['Quantum computer', 'a futuristic page about quantum computers', 'editorial'], ['Doughnut', 'a playful page about doughnuts', 'playful'], ['Tokyo', 'a cinematic travel page about Tokyo', 'cinematic']];
const ALL = BRIEFS.flatMap(([s, b, t]) => ['1', '2', '3'].map(seed => page(s, b, t, seed))).concat(['s1', 's2', 's3'].map(sd => story(sd)), ['e1', 'e2'].map(sd => story(sd, 'expressive')));
const withTl = ALL.filter(v => v.plan.timeline);
// (more pages, made only when a test needs a kind of page the first set does not happen to contain)
let more = null; const MORE_PAGES = () => more || (more = BRIEFS.flatMap(([s, b, t]) => ['4', '5', '6', '7', '8', '9'].map(seed => page(s, b, t, seed))).filter(v => v.plan.timeline));
const contractAt = (plan, at) => plan.timeline.continuity.contracts.find(k => k.at === at);
const familyAt = (plan, at) => plan.timeline.transitions.find(t => t.at === at).family;
// a saved page reopens exactly as it was (the continuity block included)
const canonical = (v, plan) => validatePlan2(plan, ctxOf(v.und, { mode: 'safety' })).plan;

// ---------------------------------------------------------------- the model, faked in-process (no network, $0)
const inputOf = (v, extra) => Object.assign({ assets: ASSETS, facts: FACTS, understandingLegacy: v.und, page: PAGE }, extra || {});
function model(answers) {
  const log = [];
  const call = async q => {
    log.push(q.tool.name); const a = answers[q.tool.name];
    if (a === undefined) throw new Error(`unexpected call ${q.tool.name}`);
    if (a instanceof Error) throw a;
    return { model: 'mock-test', usage: { input_tokens: 3000, output_tokens: 500 }, input: typeof a === 'function' ? a(q) : a };
  };
  return { call, log };
}
const headOf = q => { const t = q.content[0].text; return JSON.parse(t.slice(t.indexOf('{'))); };
// a choreography answer that keeps the current contracts and changes some
const echo = mut => q => { const h = headOf(q); const contracts = h.contracts.map(k => Object.assign({}, k)); const out = { contracts }; if (mut) mut(contracts, out, h); return out; };
const NO_FIXES = { fixes: [] };
async function run(v, answers, opts) {
  const m = model(answers);
  const out = await AI.continuity(v.plan, inputOf(v, opts && opts.input), Object.assign({ limits: Object.assign(AI.limits({}), (opts && opts.limits) || {}), call: m.call }, (opts && opts.deps) || {}));
  return Object.assign(out, { log: m.log });
}

// ================================================================ 1. end state = next start state
test('1. every seam: scene N\'s ending state IS scene N+1\'s starting state (one state, derived -- the model cannot set it)', async () => {
  assert.ok(withTl.length >= 20, `${withTl.length} pages`);
  withTl.forEach(v => {
    const P = v.plan; const ct = P.timeline.continuity; assert.ok(ct, 'every directed page has its contracts');
    assert.equal(ct.contracts.length, P.scenes.length - 1, 'one contract per seam');
    ct.contracts.forEach(k => {
      assert.deepEqual(k.outgoing, k.incoming, `${P.art.recipe}: seam ${k.at}`);
      const actor = P.timeline.actors.find(a => a.role === k.carriedActor);
      if (actor && k.outgoing.el === 'actor') { const s = TL.stateAt(actor, k.at); assert.equal(k.outgoing.x, Math.round(s.x)); assert.equal(k.outgoing.s, Math.round(s.s * 100) / 100); }
    });
    // and the timeline itself: every actor ends a scene exactly where it starts the next
    const st = TL.sceneStates(P.timeline, P.scenes.length);
    for (let i = 0; i + 1 < st.length; i++) Object.keys(st[i]).forEach(id => { if (st[i + 1][id]) assert.deepEqual(st[i][id].end, st[i + 1][id].start); });
  });
  // a model that claims different states on the two sides of a seam is ignored: the states come from the page
  const v = story('s1');
  const r = await run(v, { submit_creative_continuity: echo(c => { c[0].outgoing = { el: 'actor', x: -30, y: 0, s: 1, o: 1 }; c[0].incoming = { el: 'actor', x: 30, y: 0, s: 1, o: 1 }; }), submit_creative_continuity_fixes: NO_FIXES });
  const k = contractAt(r.plan, 1); assert.deepEqual(k.outgoing, k.incoming); assert.notEqual(k.outgoing.x, -30);
  const prim = r.plan.timeline.actors.find(a => a.role === 'primary'); assert.equal(k.outgoing.x, Math.round(TL.stateAt(prim, 1).x));
});

// ================================================================ 2. persistent hero actor
test('2. a persistent hero actor: one picture of the subject carried across its run -- the contracts carry it, never swap it', async () => {
  const stories = withTl.filter(v => v.plan.timeline.actors.some(a => a.role === 'primary'));
  assert.ok(stories.length >= 3);
  stories.forEach(v => {
    const P = v.plan; const prim = P.timeline.actors.find(a => a.role === 'primary'); const ct = P.timeline.continuity;
    assert.ok(CT.related(ct.hero.asset, prim.asset, byId), 'the hero IS the actor');
    for (let at = prim.from + 1; at <= prim.to; at++) {
      const k = contractAt(P, at); assert.equal(k.carriedActor, 'primary'); assert.equal(k.carriedAsset, prim.asset, 'the same picture all the way'); assert.equal(k.intent, 'carry');
    }
    assert.equal((html(P).match(/class="ca" data-role="primary"/g) || []).length, 1, 'one element on the page, never one per scene');
  });
  // a model cannot drop the actor from a seam it is on stage across
  const v = stories[0];
  const r = await run(v, { submit_creative_continuity: echo(c => { c[0].carriedActor = 'none'; }), submit_creative_continuity_fixes: NO_FIXES });
  assert.equal(contractAt(r.plan, 1).carriedActor, 'primary');
});

// ================================================================ 3. image-expand into the next background
test('3. image-expand: the next scene\'s picture opens from the window the previous frame (or the hero\'s subject) filled, and becomes the background', () => {
  // (a scene that continues the hero's own subject keeps it centred instead: the crop is for a NEW picture)
  const opens = x => familyAt(x.plan, 1) === 'image-expand' && x.plan.timeline.continuity.hero && !CT.related(contractAt(x.plan, 1).carriedAsset, x.plan.timeline.continuity.hero.asset, byId);
  const v = withTl.concat(MORE_PAGES()).find(opens); assert.ok(v, 'a page whose hero expands into scene 2');
  const P = v.plan; const k = contractAt(P, 1); const hero = P.timeline.continuity.hero;
  assert.equal(k.family, 'image-expand'); assert.equal(k.mask, 'inset'); assert.equal(k.background, 'expand');
  assert.equal(k.carriedAsset, P.scenes[1].layers.find(L => L.role === 'focal' && L.kind === 'image').asset);
  // the hero's measured subject, inside the hero's frame, is the window scene 2 opens from
  assert.equal(hero.end, 'detail-crop'); assert.deepEqual(k.outgoing.inset, hero.state.inset);
  const h = html(P);
  assert.match(h, new RegExp(`data-scene="1"[^>]*data-seam-in="image-expand"[^>]*style="[^"]*--sit:${k.outgoing.inset[0]}%;--sir:${k.outgoing.inset[1]}%;--sib:${k.outgoing.inset[2]}%;--sil:${k.outgoing.inset[3]}%`));
  // the backdrop starts handing over when the overlap starts
  assert.match(h, new RegExp(`data-scene="0"[^>]*data-bgw="${Math.round((1 + k.overlap.from) * 100) / 100}"`));
  // a later image-expand opens from the previous scene's own frame
  const w = withTl.map(x => ({ x, at: x.plan.timeline.transitions.find(t => t.family === 'image-expand' && t.at > 1) })).find(o => o.at);
  if (w) {
    const prevF = w.x.plan.scenes[w.at.at - 1].layers.find(L => L.role === 'focal' && L.kind === 'image'); const kk = contractAt(w.x.plan, w.at.at);
    // (when the actor is what leaves, it is the actor -- not a frame -- that the next picture opens from)
    if (prevF && prevF.box.d[2] < 90 && kk.outgoing.el === 'frame') { const d = prevF.box.d; assert.deepEqual(kk.outgoing.inset, [d[1], 100 - d[0] - d[2], 100 - d[1] - d[3], d[0]].map(x => Math.round(Math.max(0, Math.min(60, x))))); }
  }
});

// ================================================================ 4. card-expand into a full-screen scene
test('4. card-expand: a card of the gallery opens into the next, full-screen scene', () => {
  // (a card opens only when the next scene's picture IS one of the cards -- seams are chosen from their pictures)
  let v = null; for (let i = 1; i <= 40 && !v; i++) { const x = page('Doughnut', 'a playful page about doughnuts', 'playful', `g${i}`, { prefer: { family: 'horizontal-gallery', mode: 'expressive' } }); if (x.plan.timeline && x.plan.timeline.transitions.some(t => t.family === 'card-expand')) v = x; }
  const at = v && v.plan.timeline.transitions.find(t => t.family === 'card-expand'); assert.ok(at, 'the gallery page opens a card');
  const nextPic = v.plan.scenes[at.at].layers.find(L => L.role === 'focal' && L.kind === 'image').asset;
  assert.ok(v.plan.scenes[at.at - 1].layers.some(L => L.kind === 'image' && CT.related(L.asset, nextPic, byId)), 'the picture that opens is one of the cards');
  const k = contractAt(v.plan, at.at);
  assert.equal(k.family, 'card-expand'); assert.equal(k.mask, 'inset'); assert.equal(k.outgoing.el, 'frame');
  assert.deepEqual(k.outgoing.inset, CT.FRAME['card-expand'], 'from the card\'s place in the strip'); assert.deepEqual(k.incoming, k.outgoing);
  assert.ok(['cardstream', 'index', 'gallery', 'strip', 'image-wall'].includes(v.plan.scenes[at.at - 1].layout));
  const h = html(v.plan);
  assert.match(h, new RegExp(`data-scene="${at.at}"[^>]*data-seam-in="card-expand"[^>]*--sit:38%;--sir:52%;--sib:16%;--sil:12%`));
  assert.match(h, /\.sc\[data-seam-in="card-expand"\][^{]*\{clip-path:inset\(calc\(\(1 - var\(--sn,1\)\) \* var\(--sit,38%\)\)/, 'it grows to the whole screen as the scene arrives');
  // and only from a card: the same request between two plain scenes is refused (it stays what it was)
  const plain = withTl.find(x => x.plan.scenes.length > 2 && !['cardstream', 'index', 'gallery', 'strip'].includes(x.plan.scenes[1].layout));
  const n = CT.normalise({ contracts: [{ at: 2, family: 'card-expand' }] }, { scenes: plain.plan.scenes, timeline: plain.plan.timeline, byId, asked: true });
  assert.notEqual(n.continuity.contracts[1].family, 'card-expand'); assert.ok(n.fixes.some(f => /card-expand into scene 3 has nothing to work with/.test(f)));
});

// ================================================================ 5. typography behind / in front
test('5. typography sits behind the pictures or crosses in front of them, as its contracts say', async () => {
  const breaks = withTl.find(v => (v.plan.timeline.actors.find(a => a.role === 'typography') || {}).behavior === 'break');
  const behind = withTl.find(v => (v.plan.timeline.actors.find(a => a.role === 'typography') || {}).behavior === 'behind');
  assert.ok(breaks && behind);
  const layers = h => ({ back: h.slice(h.indexOf('<div class="cr-cast cr-back"'), h.indexOf('<main')), front: h.slice(h.indexOf('<div class="cr-cast cr-front"')) });
  // a name breaking apart crosses in front; a name behind the subject stays in the back layer
  assert.equal(contractAt(breaks.plan, 1).typography, 'front');
  let L = layers(html(breaks.plan)); assert.match(L.front, /class="ca" data-depth="front" data-role="typography"/); assert.doesNotMatch(L.back, /data-role="typography"/);
  assert.equal(contractAt(behind.plan, 1).typography, 'behind');
  L = layers(html(behind.plan)); assert.match(L.back, /class="ca" data-role="typography"/); assert.doesNotMatch(L.front, /data-role="typography"/);
  // the choreography may move it behind; "mask" is only for a type-mask seam
  const r = await run(breaks, { submit_creative_continuity: echo(c => c.forEach(k => { if (k.typography !== 'none') k.typography = k.at === 1 ? 'mask' : 'behind'; })), submit_creative_continuity_fixes: NO_FIXES });
  r.plan.timeline.continuity.contracts.forEach(k => assert.ok(k.typography !== 'mask' || k.family === 'type-mask'));
  assert.ok(r.plan.timeline.continuity.contracts.filter(k => k.at > 1).every(k => k.typography !== 'front'));
});

// ================================================================ 6. bounded overlap
test('6. overlap: the next scene starts while the last is leaving -- bounded, never a gap, never a pile-up; the actor moves inside it', async () => {
  withTl.forEach(v => v.plan.timeline.continuity.contracts.forEach(k => {
    assert.ok(k.overlap.from >= CT.OVERLAP.from[0] - 1e-9 && k.overlap.to <= CT.OVERLAP.to[1] + 1e-9, `${v.plan.art.recipe}: ${JSON.stringify(k.overlap)}`);
    assert.ok(k.overlap.to - k.overlap.from >= CT.OVERLAP.min - 1e-9 && k.overlap.to - k.overlap.from <= CT.OVERLAP.max + 1e-9);
  }));
  // out-of-range requests are clamped; a too-short window is widened to the minimum
  const v = story('s2'); const ctx = { scenes: v.plan.scenes, timeline: v.plan.timeline, byId, asked: true };
  const n = CT.normalise({ contracts: [{ at: 4, overlap: { from: -5, to: 9 } }, { at: 5, overlap: { from: -0.15, to: 0 } }] }, ctx).continuity;
  assert.deepEqual(contractAt({ timeline: { continuity: n } }, 4).overlap, { from: -0.5, to: 0.3 }, 'clamped, then held to the longest overlap');
  assert.deepEqual(contractAt({ timeline: { continuity: n } }, 5).overlap, { from: -0.25, to: 0 });
  // the carried actor leaves its pose and reaches the next inside the asked window
  const r = await run(v, { submit_creative_continuity: echo(c => { c[0].overlap = { from: -0.45, to: 0.15 }; }), submit_creative_continuity_fixes: NO_FIXES });
  const k = contractAt(r.plan, 1); assert.deepEqual(k.overlap, { from: -0.45, to: 0.15 });
  const prim = r.plan.timeline.actors.find(a => a.role === 'primary');
  assert.ok(prim.keys.some(x => x.g === 0.55) && prim.keys.some(x => x.g === 1.15), JSON.stringify(prim.keys.map(x => x.g)));
  // the rendered seam elements play across their contract's window
  const wipe = withTl.find(x => x.plan.timeline.transitions.some(t => t.family === 'foreground-wipe'));
  const t = wipe.plan.timeline.transitions.find(x => x.family === 'foreground-wipe'); const kw = contractAt(wipe.plan, t.at);
  assert.match(html(wipe.plan), new RegExp(`class="cs cs-wipe" data-at="${t.at}" data-lead="\\.3" data-span="${Math.round((kw.overlap.to - kw.overlap.from) * 100) / 100}" data-end="${kw.overlap.to}"`));
  assert.match(html(wipe.plan), /e0=sc\._top\+S\.end\*vh/, 'the runtime ends the seam where its contract says');
});

// ================================================================ 7. Higgsfield hero -> DOM handoff
test('7. the hero video hands into the page: planned at direction time, it settles into its own still frame as the next scene takes over', async () => {
  const v = withTl.concat(MORE_PAGES()).find(x => familyAt(x.plan, 1) === 'image-expand' && x.plan.timeline.continuity.hero && !CT.related(contractAt(x.plan, 1).carriedAsset, x.plan.timeline.continuity.hero.asset, byId));
  const heroId = v.plan.timeline.continuity.hero.asset;
  assert.equal(v.plan.timeline.continuity.hero.video, false, 'no premium video asked for: none planned');
  // the confirmed premium hero is part of the plan: its end state is planned before the video exists
  const planned = validatePlan2(Object.assign({}, v.plan, { premiumMedia: [{ intent: 'cinematic_hero', asset: heroId }] }), ctxOf(v.und, { mode: 'safety' })).plan;
  const hero = planned.timeline.continuity.hero; assert.equal(hero.video, true); assert.equal(hero.into, 1);
  assert.equal(hero.end, 'detail-crop', 'the next scene opens from the subject\'s crop');
  assert.deepEqual(contractAt(planned, 1).outgoing.inset, hero.state.inset);
  assert.doesNotMatch(html(planned), /data-vh=/, 'no video file yet: nothing to hand over');
  // the video arrives (premium media delivered): the hero scene hands it over
  const withVideo = ASSETS.map(a => (a.id === heroId ? Object.assign({}, a, { video: { mediaId: 'pm_test_000001', assetRef: 'a'.repeat(64), mime: 'video/mp4', intent: 'cinematic_hero' } }) : a));
  const h = html(planned, { assets: withVideo, videoSrc: a => (a.video ? `${a.id}.mp4` : '') });
  assert.match(h, /<section class="sc cr-hero"[^>]*data-vh="detail-crop"/); assert.match(h, /<video class="ly-vid"/);
  assert.match(h, /\.sc\[data-vh\] \.ly-vid\{opacity:calc\(1 - min\(1, var\(--sx,0\) \* 1\.6\)\)\}/, 'it settles into its still frame as the hero leaves');
  assert.match(h, /s\._seam=s\.hasAttribute\('data-seam-in'\)\|\|s\.hasAttribute\('data-seam-out'\)\|\|s\.hasAttribute\('data-vh'\)/);
  // the model's choice is checked: "subject-centred" needs the subject to continue -- here it does not
  const r = await run({ plan: planned, und: v.und }, { submit_creative_continuity: echo((c, out) => { out.hero = { end: 'subject-centred' }; }), submit_creative_continuity_fixes: NO_FIXES });
  assert.notEqual(r.plan.timeline.continuity.hero.end, 'subject-centred');
  // with a carried actor the subject does continue
  const s = story('s1'); assert.equal(s.plan.timeline.continuity.hero.end, 'subject-centred');
  // a video that just stops where the page starts (a hard cut into scene 2) is caught and connected
  const cut = await run({ plan: planned, und: v.und }, { submit_creative_continuity: echo(c => { c[0].family = 'cut'; c[0].intent = 'reset'; }), submit_creative_continuity_fixes: NO_FIXES });
  assert.ok(cut.meta.found.includes('pasted-video') || cut.meta.found.includes('hard-reset'), JSON.stringify(cut.meta.found));
  assert.notEqual(familyAt(cut.plan, 1), 'cut'); assert.deepEqual(cut.meta.remaining.filter(i => !COMP.AUDIT.includes(i.code)), []);
});

// ================================================================ 8. asset-aware planning
test('8. asset-aware: the plan reads the USED pictures\' subject position, negative space, colour, crop tolerance, weight and carryability', async () => {
  const right = A('right', 1600, 1000, { assess: { width: 1600, height: 1000, aspect: 1.6, orientation: 'landscape', subject: [0.6, 0.1, 0.95, 0.9], colours: ['#c0502e'], luminance: 120, background: { colour: '#333333', uniformity: 0.2 } } });
  const left = A('left', 1600, 1000, { assess: { width: 1600, height: 1000, aspect: 1.6, orientation: 'landscape', subject: [0.05, 0.1, 0.35, 0.9], colours: ['#c4542e'], luminance: 120, background: { colour: '#333333', uniformity: 0.2 } } });
  const R = CT.profileOf(right), Lp = CT.profileOf(left);
  assert.equal(R.side, 'right'); assert.equal(R.space, 'left'); assert.equal(R.room, 0.6); assert.equal(R.colour, '#c0502e'); assert.equal(R.crop, 'high'); assert.equal(R.carryable, false);
  assert.equal(Lp.side, 'left'); assert.equal(Lp.space, 'right');
  const C = CT.profileOf(CUT); assert.equal(C.carryable, true); assert.equal(C.crop, 'none', 'a cut-out floats: never cropped');
  const fit = CT.pairFit(R, Lp, new Map([['right', right], ['left', left]]));
  assert.ok(fit.why.includes('arrives into the empty side') && fit.why.includes('colours meet'), JSON.stringify(fit));
  assert.deepEqual(CT.pairFit(CT.profileOf(PLAIN), C, byId).why, ['the same subject']);
  // the choreography call sees ONLY the pictures the page uses: their profiles, the seams' fit, their thumbnails
  const v = withTl.concat(MORE_PAGES()).find(x => familyAt(x.plan, 1) === 'image-expand');
  const used = CT.usedAssets(v.plan, byId); assert.ok(used.length < ASSETS.length, 'some inventory pictures are not on the page');
  const thumbs = ASSETS.map(a => ({ id: a.id, dataUrl: 'data:image/png;base64,iVBORw0KGgo=' }));
  let seen = null;
  await run(v, { submit_creative_continuity: q => { seen = q; return echo()(q); }, submit_creative_continuity_fixes: NO_FIXES }, { input: { thumbnails: thumbs } });
  const head = headOf(seen);
  assert.deepEqual(head.pictures.map(p => p.id), used);
  head.pictures.forEach(p => ['subject', 'side', 'space', 'colour', 'crop', 'weight', 'carryable', 'orientation'].forEach(f => assert.ok(f in p, f)));
  assert.ok(head.seams.every(s => Array.isArray(s.possible) && typeof s.pictureFit.score === 'number'));
  const shown = seen.content.filter(c => c.type === 'text' && /^Thumbnail of picture/.test(c.text)).map(c => /"([^"]+)"/.exec(c.text)[1]);
  assert.deepEqual(shown, used.slice(0, 6), 'thumbnails of the used pictures only');
  assert.ok(seen.content.filter(c => c.type === 'image').length <= 6);
});

// ================================================================ 9. the critic catches a hard reset
test('9. the critic catches a hard reset and connects it', async () => {
  // three cuts in a row on a quiet page (the built-in plan) are found...
  const quiet = withTl.find(v => v.plan.timeline.transitions.filter(t => t.family === 'cut').length >= 2);
  assert.ok(CT.critique(quiet.plan, byId).some(i => i.code === 'hard-reset'));
  // ...and so is a model asking for a hard cut into scene 2
  const v = withTl.find(x => x.plan.art.family === 'cinematic-chapters');
  const r = await run(v, { submit_creative_continuity: echo(c => { c[0].family = 'cut'; c[0].intent = 'reset'; }), submit_creative_continuity_fixes: q => ({ fixes: headOf(q).found.map(f => ({ at: f.at, code: f.code, family: 'color-bleed', intent: 'continue' })) }) });
  // (the seams are all connected; a page-level finding its pictures cannot carry a fix for may remain, reported)
  const seamsLeft = x => x.filter(i => !COMP.AUDIT.includes(i.code));
  assert.ok(r.meta.found.includes('hard-reset')); assert.notEqual(familyAt(r.plan, 1), 'cut'); assert.deepEqual(seamsLeft(r.meta.remaining), []);
  assert.deepEqual(seamsLeft(r.plan.timeline.continuity.critic.remaining), []); assert.ok(r.plan.timeline.continuity.critic.found.includes('hard-reset'));
  // the quiet page: each run of cuts is connected
  const q = await run(quiet, { submit_creative_continuity: echo(), submit_creative_continuity_fixes: NO_FIXES });
  assert.ok(q.meta.found.includes('hard-reset')); assert.ok(q.plan.timeline.transitions.filter(t => t.family === 'cut').length <= 1); assert.deepEqual(seamsLeft(q.meta.remaining), []);
});

// ================================================================ 10. the critic catches competing motion
test('10. the critic catches competing motion in one overlap and calms it', async () => {
  // (a composed scene owns its planes, so the built-in pages keep their seams within the budget; a model asking for a
  // loud seam with a long overlap over a scene that already moves piles moves up -- that is what the critic must catch)
  const loudK = k => Object.assign({}, k, { family: 'foreground-wipe', overlap: { from: -0.6, to: 0.3 } });
  const early = (x, c) => x.plan.timeline.beats.filter(b => b.scene === c.at && b.from <= 0.4).length;
  let v = null, at = 0; for (const x of withTl.concat(MORE_PAGES())) { const k = x.plan.timeline.continuity.contracts.find(c => CT.movingAt(x.plan, loudK(c)) > CT.LIMITS.moving && CT.movingAt(x.plan, loudK(c)) - early(x, c) <= CT.LIMITS.moving); if (k) { v = x; at = k.at; break; } }
  assert.ok(v, 'a seam a model can overload');
  const loud = echo(c => { const k = c.find(x => x.at === at); Object.assign(k, { family: 'foreground-wipe', overlap: { from: -0.6, to: 0.3 } }); });
  // the critic's own fix (calm: the incoming scene's moves wait for the seam)
  const r = await run(v, { submit_creative_continuity: loud, submit_creative_continuity_fixes: q => ({ fixes: headOf(q).found.filter(f => f.code === 'competing-motion').map(f => ({ at: f.at, code: f.code, calm: true })) }) });
  assert.ok(r.meta.found.includes('competing-motion'));
  assert.ok(CT.movingAt(r.plan, contractAt(r.plan, at)) <= CT.LIMITS.moving, `${CT.movingAt(r.plan, contractAt(r.plan, at))} moving`);
  const k = contractAt(r.plan, at);
  assert.ok(r.plan.timeline.beats.filter(b => b.scene === at).every(b => b.from > Math.max(0, k.overlap.to) + 0.1 - 1e-9), 'the next scene\'s own moves wait');
  // a silent critic changes nothing about the outcome: the built-in fix applies
  const s = await run(v, { submit_creative_continuity: loud, submit_creative_continuity_fixes: NO_FIXES });
  assert.ok(CT.movingAt(s.plan, contractAt(s.plan, at)) <= CT.LIMITS.moving); assert.deepEqual(s.meta.remaining.filter(i => !COMP.AUDIT.includes(i.code)), []);
});

// ================================================================ 11. a failed choreography falls back safely
test('11. a failed, useless or unaffordable choreography falls back to the built-in contracts -- never retried', async () => {
  const v = withTl.find(x => x.plan.art.family === 'cinematic-chapters');
  const failed = await run(v, { submit_creative_continuity: new Error('mock: overloaded'), submit_creative_continuity_fixes: NO_FIXES });
  assert.equal(failed.meta.choreography, 'fallback'); assert.match(failed.meta.errors[0], /choreography: mock: overloaded/);
  assert.deepEqual(failed.log, ['submit_creative_continuity', 'submit_creative_continuity_fixes'], 'one attempt, no retry');
  assert.equal(failed.plan.timeline.continuity.source, 'built-in');
  assert.deepEqual(canonical(v, failed.plan), failed.plan, 'a valid page that reopens unchanged');
  // a useless answer is the built-in plan
  const junk = await run(v, { submit_creative_continuity: { contracts: [{ at: 99, family: 'teleport' }, { at: 1, family: 'warp-drive', overlap: { from: 'x' } }], hero: { end: 'explode' } }, submit_creative_continuity_fixes: NO_FIXES });
  assert.deepEqual(junk.plan.timeline.transitions, failed.plan.timeline.transitions);
  // over the page's provider ceiling: no call at all
  const broke = await run(v, { submit_creative_continuity: echo(), submit_creative_continuity_fixes: NO_FIXES }, { deps: { ceilingUsd: 0 } });
  assert.deepEqual(broke.log, []); assert.equal(broke.meta.calls, 0); assert.equal(broke.meta.usd, 0); assert.equal(broke.meta.choreography, 'fallback');
  assert.ok(broke.plan.timeline.continuity.contracts.length, 'the page keeps its built-in contracts');
  // switched off: no calls, the built-in critic still runs
  const off = await run(v, {}, { limits: { continuity: false, continuityCritic: false } });
  assert.deepEqual(off.log, []); assert.equal(off.meta.choreography, 'off'); assert.deepEqual(off.meta.remaining.filter(i => !COMP.AUDIT.includes(i.code)), []);
});

// ================================================================ 12. a failed critic does not break the generation
test('12. a failed critic never breaks the generation: the rules\' own fixes apply', async () => {
  const v = withTl.find(x => CT.critique(x.plan, byId).length > 0);
  const r = await run(v, { submit_creative_continuity: echo(), submit_creative_continuity_fixes: new Error('mock: critic down') });
  assert.equal(r.meta.critic, 'built-in'); assert.ok(r.meta.errors.some(e => /^critic: mock: critic down/.test(e)));
  assert.deepEqual(r.log, ['submit_creative_continuity', 'submit_creative_continuity_fixes'], 'one critic call, no retry');
  assert.deepEqual(r.meta.remaining.filter(i => !COMP.AUDIT.includes(i.code)), []); assert.equal(r.plan.timeline.continuity.critic.source, 'built-in');
  assert.deepEqual(canonical(v, r.plan), r.plan);
  // a critic answer outside the vocabulary is ignored
  const junk = await run(v, { submit_creative_continuity: echo(), submit_creative_continuity_fixes: { fixes: [{ at: 1, code: 'make-it-pop', family: 'explode' }, { at: 77, code: 'hard-reset' }, 'x'] } });
  assert.deepEqual(junk.meta.remaining.filter(i => !COMP.AUDIT.includes(i.code)), []); assert.equal(junk.plan.v, 2);
});

// ================================================================ cost controls (unit)
test('cost: at most one choreography and one critic call, bounded tokens, cheap critic model, usage reported per call', async () => {
  const L = AI.limits({});
  assert.equal(L.continuityMaxTokens, 1800); assert.equal(L.criticMaxTokens, 600); assert.equal(L.criticModel, L.understandModel, 'the critic runs on the cheap model');
  assert.ok(AI.continuityBoundUsd(L) > 0 && AI.continuityBoundUsd(L) < 0.1, `${AI.continuityBoundUsd(L)} USD at most`);
  assert.equal(AI.continuityBoundUsd(AI.limits({ CREATIVE_CONTINUITY: 'off', CREATIVE_CONTINUITY_CRITIC: 'off' })), 0);
  assert.equal(AI.CONTINUITY_TOOL.input_schema.properties.contracts.maxItems, 11); assert.equal(AI.CRITIC_TOOL.input_schema.properties.fixes.items.properties.code.enum.length, CT.CRITIC.length);
  const v = story('s3'); const usage = []; const seen = [];
  const m = model({ submit_creative_continuity: echo(), submit_creative_continuity_fixes: NO_FIXES });
  const out = await AI.continuity(v.plan, inputOf(v), { limits: L, call: q => { seen.push({ tool: q.tool.name, maxTokens: q.maxTokens, model: q.model }); return m.call(q); }, onUsage: x => usage.push(x) });
  assert.deepEqual(seen.map(s => s.tool), ['submit_creative_continuity', 'submit_creative_continuity_fixes']);
  assert.deepEqual(seen.map(s => s.maxTokens), [1800, 600]);
  assert.deepEqual(usage.map(x => x.step), ['continuity', 'critic']); assert.ok(usage.every(x => x.usd > 0));
  assert.equal(out.meta.calls, 2); assert.equal(out.meta.usd, +(usage[0].usd + usage[1].usd).toFixed(5));
});

// ================================================================ 13, 14, 15. the server, mocked providers only
const HF_KEY = 'hfkeyid_test_0001:hfsecret_test_never_shown';
async function withServer(env, fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sr-continuity-'));
  const e = Object.assign({ SITEREMADE_BACKEND: 'local', SITEREMADE_DB_PATH: path.join(dir, 'app.db'), SITEREMADE_ASSET_STORE_DIR: path.join(dir, 'assets'), SITEREMADE_EXPORTS_DIR: path.join(dir, 'exports'), SITEREMADE_PREMIUM_LOG_DIR: path.join(dir, 'p'), ANTHROPIC_API_KEY: 'test-only', OPENAI_API_KEY: '', STRIPE_SECRET_KEY: '', SITEREMADE_TRIAL_CREDITS: '30', MOCK_CALL_LOG: path.join(dir, 'calls.log'), NODE_ENV: 'test', HIGGSFIELD_API_KEY: HF_KEY, HIGGSFIELD_VIDEO_ENDPOINT: 'https://api.higgsfield.ai/kling-video/v3.0/4k/image-to-video' }, env);
  const s = await startServer(e); const call = client(s.port);
  await call('POST', '/api/auth/signup', { email: `ct-${process.pid}-${Date.now()}@example.com`, password: 'correct-horse-battery-staple' });
  try { await fn({ call, calls: () => providerCalls(e.MOCK_CALL_LOG), dir }); } finally { await s.stop(); fs.rmSync(dir, { recursive: true, force: true }); }
}
const SNEAKER = 'A cinematic hero video for an imaginary sneaker brand called Zorbo, with premium motion';
const upload = { id: 'u1', origin: 'upload', title: 'our sneaker', mime: 'image/png', dataUrl: mockPng('sneaker', '16:9') };
async function start(call, brief) { const ask = await call('POST', '/api/creative/research', { brief }); return ask.body.needsConfirmation ? call('POST', '/api/creative/research', { brief, quoteId: ask.body.quote.id }) : ask; }
const direct = (call, r) => call('POST', '/api/creative/plan', { brief: SNEAKER, jobId: r.body.jobId, understanding: r.body.understanding, facts: [], supplied: {}, assets: [upload], thumbnails: [], mainAsset: 'u1' });

test('13 + 14. server: one choreography and one critic call per Creative generation (mocked), in the usage ledger, no Higgsfield call -- the premium hero is still exactly one video', async () => {
  await withServer({}, async ({ call, calls }) => {
    const r = await start(call, SNEAKER); const p = await direct(call, r);
    assert.equal(p.body.ok, true, JSON.stringify(p.body).slice(0, 300));
    const tools = calls().filter(c => c.provider === 'anthropic').map(c => c.tool);
    assert.equal(tools.filter(t => t === 'submit_creative_continuity').length, 1, 'one choreography pass');
    assert.equal(tools.filter(t => t === 'submit_creative_continuity_fixes').length, 1, 'one critic pass');
    assert.equal(calls().filter(c => c.provider === 'higgsfield').length, 0, 'the continuity pass never calls Higgsfield');
    const m = p.body.meta.continuity; assert.equal(m.choreography, 'mock'); assert.equal(m.critic, 'mock'); assert.equal(m.calls, 2); assert.ok(m.usd > 0);
    assert.ok(p.body.meta.usdEstimated >= m.usd, 'its cost is part of what the direction recorded');
    const ct = p.body.plan.timeline && p.body.plan.timeline.continuity; assert.ok(ct, 'the page carries its contracts'); assert.equal(ct.source, 'mock', 'a mock is labelled as one');
    assert.ok(ct.hero && ct.hero.video, 'the confirmed premium hero is planned into the handoff');
    // every outbound call was answered by the mock: nothing reached a paid provider
    calls().forEach(c => assert.ok(['anthropic', 'higgsfield'].includes(c.provider), JSON.stringify(c)));
    // the premium hero runs after, on its own, once
    const pm = await call('POST', '/api/creative/premium', { jobId: r.body.jobId, brief: SNEAKER, heroAsset: 'u1', assets: [upload] });
    assert.deepEqual(pm.body.premium.delivered, ['cinematic_hero']);
    assert.equal(calls().filter(c => c.provider === 'higgsfield' && /image-to-video$/.test(c.endpoint)).length, 1, 'still exactly one video');
  });
  // a failing choreography and critic: the page is still directed and charged as normal
  await withServer({ MOCK_CONTINUITY: 'error', MOCK_CRITIC: 'error' }, async ({ call, calls }) => {
    const r = await start(call, SNEAKER); const p = await direct(call, r);
    assert.equal(p.body.ok, true); assert.equal(p.body.meta.continuity.choreography, 'fallback'); assert.equal(p.body.meta.continuity.critic, 'built-in');
    assert.equal(p.body.plan.timeline.continuity.source, 'built-in');
    const tools = calls().filter(c => c.provider === 'anthropic').map(c => c.tool);
    assert.equal(tools.filter(t => /^submit_creative_continuity/.test(t)).length, 2, 'no retry after a failure');
  });
});

test('14. no paid provider in dev or test: without the mock, every provider call is refused before it leaves', () => {
  const PP = require('../lib/paid-providers');
  assert.equal(PP.mode({ NODE_ENV: 'test' }, {}), 'off'); assert.equal(PP.mode({ NODE_ENV: 'development' }, {}), 'off');
  assert.equal(PP.allowed('anthropic', { NODE_ENV: 'test', ANTHROPIC_API_KEY: 'dev-machine-key' }, {}), false);
  assert.equal(PP.allowed('higgsfield', { NODE_ENV: 'test', HIGGSFIELD_API_KEY: 'dev-machine-key' }, {}), false);
  // the continuity pass only ever calls what it is given (the server's guarded model call)
  const src = fs.readFileSync(path.join(__dirname, '..', 'lib', 'creative', 'continuity.js'), 'utf8') + fs.readFileSync(path.join(__dirname, '..', 'lib', 'creative', 'ai.js'), 'utf8');
  assert.doesNotMatch(src, /\bfetch\(|https:\/\/api\.|higgsfield\.ai/);
});

test('15. Business is unchanged: a Business website plan makes no continuity call and carries no continuity', async () => {
  await withServer({}, async ({ call, calls }) => {
    const r = await call('POST', '/api/plan-website', { text: 'Greenline Landscapes, a landscaping company in Portland', generationId: 'gen_ctbiz001' });
    assert.equal(r.status, 200, JSON.stringify(r.body).slice(0, 200));
    const tools = calls().filter(c => c.provider === 'anthropic').map(c => c.tool);
    assert.ok(tools.length >= 1 && tools.every(t => t === 'submit_website_plan'), JSON.stringify(tools));
    assert.doesNotMatch(JSON.stringify(r.body), /continuity|data-seam|submit_creative/);
  });
  // and no Business module reads the Creative continuity
  ['lib/export-compiler.js', 'server.js'].forEach(f => { const s = fs.readFileSync(path.join(__dirname, '..', f), 'utf8'); assert.ok(!/require\(['"]\.\/(lib\/)?creative\/continuity/.test(s), f); });
});
