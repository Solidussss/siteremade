'use strict';
// CREATIVE AI DIRECTION: the v2 scene-plan validator (the gate every model plan passes), the v2
// renderer's safety, persistence and export of accepted plans, and the server path with a MOCK
// provider (understanding -> direction -> validation -> one repair -> labelled fallback, limits,
// ledger). Mocks prove the plumbing only; they say nothing about creative quality.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { validatePlan2, LIMITS } = require('../lib/creative/validate2');
const { renderCreative2 } = require('../lib/creative/render2');
const { sanitizeCreative } = require('../lib/creative/store');
const ai = require('../lib/creative/ai');
const { startServer, client } = require('./helpers/server-process');

const A = (id, extra) => Object.assign({ id, origin: 'research', title: `File:${id}.jpg`, author: 'A. Photographer', license: 'CC BY-SA 4.0', pageUrl: `https://commons.wikimedia.org/wiki/File:${id}.jpg`, assess: { width: 1200, height: 900, aspect: 1.333, orientation: 'landscape', subject: [0.2, 0.1, 0.8, 0.9], colours: ['#aa7744'] }, caps: { moveFreely: false, frame: true } }, extra);
const CUT = A('c-r1', { origin: 'derived', cutout: true, cutoutOf: 'r1', assess: { width: 700, height: 900, aspect: 0.78, orientation: 'portrait', transparent: true, subject: [0.02, 0.02, 0.98, 0.98], colours: [] }, caps: { moveFreely: true } });
const ASSETS = [A('r1'), CUT, A('r2'), A('u1', { origin: 'upload', title: 'my photo', license: '' })];
const FACTS = [{ id: 'f1', text: 'Toilet paper is a tissue paper product.', section: 'Overview' }, { id: 'f2', text: 'Packaged toilet paper was introduced in 1857.', section: 'History' }];
const box = (d, m) => ({ d, m: m || [10, 10, 80, 80] });
function basePlan() {
  return {
    identity: { name: 'Toilet paper', kind: 'recognizable' }, concept: { title: 'Coronation', logline: 'The humblest object, crowned.' },
    palette: { bg: '#111111', bg2: '#222222', ink: '#f5f5f5', muted: '#bbbbbb', accent: '#d8b46a', glow: '#fff1cf' },
    type: { display: 'didone' }, atmosphere: { backdrop: 'spotlight', particles: 'dust' }, motion: { tempo: 'measured' }, thread: { kind: 'ribbon' },
    assetNotes: [{ asset: 'c-r1', depicts: 'a pink toilet roll', matches: 'yes' }, { asset: 'r2', depicts: 'a cat', matches: 'no' }],
    scenes: [
      { id: 'hero', purpose: 'the reveal', height: 'screen', layers: [{ kind: 'image', role: 'focal', asset: 'c-r1', box: box([55, 8, 38, 84]) }], text: { heading: 'Toilet paper', region: 'left', size: 'display', body: 'It is a tissue paper product.', kind: 'sourced', cite: 'f1' } },
      { id: 'two', purpose: 'history', height: 'auto', layers: [{ kind: 'shape', role: 'focal', shape: { form: 'circle' }, box: box([60, 20, 30, 50]) }], text: { heading: 'A short history', region: 'left', items: [{ label: '1857', text: 'Packaged toilet paper arrived.', kind: 'sourced', cite: 'f2' }] } },
    ],
  };
}

test('v2 validator: a clean plan passes, with every enum and number bounded', () => {
  const { plan, errors } = validatePlan2(basePlan(), { assets: ASSETS, facts: FACTS });
  assert.deepEqual(errors, []);
  assert.equal(plan.v, 2); assert.equal(plan.scenes.length, 2);
  assert.equal(plan.scenes[0].layers[0].asset, 'c-r1');
  assert.equal(plan.credits[0].asset, 'r1', 'the cutout is credited to its original');
  assert.ok(plan.derived.some(d => d.asset === 'c-r1'));
});

test('v2 validator: hostile or careless model output is bounded, made honest, or sent back for repair', () => {
  const p = basePlan();
  p.type.display = 'comic-sans'; p.atmosphere.particles = 'fireworks';
  p.scenes[0].layers.push({ kind: 'image', role: 'support', asset: 'r1', box: box([900, -500, 400, 400]), loop: { kind: 'wiggle', amp: 99 } }); // flat photo, absurd box
  p.scenes[0].layers.push({ kind: 'image', role: 'support', asset: 'r2', box: box([5, 70, 10, 20]) }); // the director said it is not the subject
  p.scenes[1].text.items.push({ text: 'An unsupported claim.', kind: 'sourced' });
  p.scenes[1].text.items.push({ text: '“Toilet paper changed my life,” said Napoleon.', kind: 'imagined' });
  p.scenes[1].text.body = 'x'.repeat(LIMITS.body + 10);
  p.scenes.push({ id: 'pin', purpose: 'p', height: 'tall', pin: true, layers: [{ kind: 'shape', role: 'focal', shape: { form: 'star' }, box: box([40, 20, 20, 40]) }], text: { heading: 'Pinned with nothing moving' } });
  const { plan, fixes, errors } = validatePlan2(p, { assets: ASSETS, facts: FACTS });
  assert.equal(plan.type.display, 'serif'); assert.equal(plan.atmosphere.particles, 'none');
  const flat = plan.scenes[0].layers.find(l => l.asset === 'r1');
  assert.ok(flat.box.d.every(v => v >= 0 && v <= 100), 'box clamped'); assert.equal(flat.loop.kind, 'none');
  assert.notEqual(flat.mask, 'none', 'a flat photo never floats as a bare rectangle');
  assert.ok(!plan.scenes[0].layers.some(l => l.asset === 'r2'), 'a picture the director saw is not the subject is not used');
  assert.deepEqual(plan.scenes[1].text.items.map(i => i.text), ['Packaged toilet paper arrived.'], 'uncited "sourced" line and invented quote removed');
  assert.ok(errors.some(e => /body is \d+ characters/.test(e)), 'an overlong paragraph is sent back, never cut mid-sentence');
  assert.equal(plan.scenes[2].pin, false, 'pinned with nothing moving on scroll -- unpinned');
  assert.ok(fixes.length >= 4);
});

test('v2 validator: missing focal pictures and pages without words are errors worth one repair', () => {
  const p = basePlan(); p.scenes[0].layers[0].asset = 'nope'; p.scenes[0].text.heading = '';
  const { errors } = validatePlan2(p, { assets: ASSETS, facts: FACTS });
  assert.ok(errors.some(e => /does not exist/.test(e))); assert.ok(errors.some(e => /first scene needs a heading/.test(e)));
});

test('v2 validator: motion budget, repetition, personal photos, and the focal kept large and clear of the words', () => {
  const p = basePlan();
  p.scenes[0].layers = [
    { kind: 'image', role: 'focal', asset: 'c-r1', box: box([10, 30, 12, 20]), loop: { kind: 'float' } }, // tiny and under the words
    { kind: 'shape', role: 'support', shape: { form: 'ring' }, box: box([70, 10, 20, 30]), loop: { kind: 'spin' } },
    { kind: 'shape', role: 'support', shape: { form: 'dots' }, box: box([72, 60, 20, 30]), loop: { kind: 'sway' } },
  ];
  for (let i = 0; i < 4; i++) p.scenes.push({ id: `rep${i}`, purpose: 'x', height: 'auto', layers: [{ kind: 'image', role: 'focal', asset: 'r1', mask: 'window', box: box([55, 10, 40, 80]) }], text: { heading: `Scene ${i}`, region: 'left' } });
  const { plan } = validatePlan2(p, { assets: ASSETS, facts: FACTS });
  const hero = plan.scenes[0];
  assert.ok(hero.layers.filter(l => l.loop.kind !== 'none').length <= LIMITS.loopsPerScene);
  const f = hero.layers.find(l => l.role === 'focal'); assert.ok(f.box.d[2] * f.box.d[3] > 12 * 20, 'grown, never shrunk');
  const photoUses = plan.scenes.flatMap(s => s.layers).filter(l => l.asset === 'r1').length;
  assert.ok(photoUses <= LIMITS.photoUses, `a photo is not repeated as filler (${photoUses})`);
  const personal = validatePlan2(Object.assign(basePlan(), { identity: { name: 'Bubbles', kind: 'personal' } }), { assets: ASSETS, facts: FACTS }).plan;
  assert.ok(personal.scenes.flatMap(s => s.layers).filter(l => l.kind === 'image').every(l => ['u1'].includes(l.asset)), 'only the owner\'s own photos on a personal page');
});

test('v2 renderer: every string escaped, only its own runtime, nothing remote, a complete reduced-motion version', () => {
  const p = basePlan(); p.scenes[0].text.heading = '<script>alert(1)</script>'; p.concept.logline = '"><img src=x onerror=alert(2)>';
  p.scenes[1].layers.push({ kind: 'word', role: 'texture', word: { text: '</style><b>' }, box: box([0, 0, 100, 40]) });
  const { plan } = validatePlan2(p, { assets: ASSETS, facts: FACTS });
  const html = renderCreative2(plan, ASSETS, { src: a => `assets/${a.id}.png`, mode: 'export' });
  assert.equal((html.match(/<script/g) || []).length, 3);
  assert.ok(!html.includes('<script>alert(1)')); assert.ok(!html.includes('onerror=alert(2)>')); assert.ok(!html.includes('</style><b>'));
  assert.ok(!/src="https?:/.test(html), 'no hotlinked pictures or scripts');
  assert.match(html, /html\[data-motion="reduced"\] \.sc\[data-pin\]/, 'pinned scenes unpin in reduced motion');
  assert.ok(!html.includes('cr-edit'), 'the studio listener is not exported');
  assert.match(renderCreative2(plan, ASSETS, { src: () => 'blob:x', mode: 'preview' }), /cr-edit/);
  assert.match(html, /\[1\]/, 'sourced lines carry numbered citations');
});

test('v2 persistence: an accepted plan is stored as validated and reopens identical; provenance and history kept', () => {
  const plan = validatePlan2(Object.assign(basePlan(), { direction: { source: 'ai', model: 'claude-x', attempt: 2, repaired: true } }), { assets: ASSETS, facts: FACTS }).plan;
  const assets = ASSETS.map(a => Object.assign({}, a, { assetRef: 'a'.repeat(64) }));
  const c1 = sanitizeCreative({ brief: 'toilet paper', understanding: { kind: 'recognizable', subject: 'toilet paper', source: 'ai', identity: { name: 'Toilet paper', kind: 'recognizable', what: 'the product' }, tone: { register: 'extravagant' } }, research: { facts: FACTS }, assets, plan, planMeta: { source: 'ai', model: 'claude-x', usdEstimated: 0.12, attempts: 2, repaired: true }, history: [{ title: 'A', logline: 'first' }], cost: { researchRequests: 3, aiCalls: 2, aiUsdEstimated: 0.12 } });
  const c2 = sanitizeCreative(JSON.parse(JSON.stringify(c1)));
  assert.equal(JSON.stringify(c2.plan), JSON.stringify(c1.plan), 'saving again does not change the design');
  assert.equal(c1.plan.direction.repaired, true); assert.equal(c1.planMeta.source, 'ai'); assert.equal(c1.history.length, 1);
  assert.equal(c1.understanding.identity.what, 'the product'); assert.equal(c1.understanding.tone.register, 'extravagant');
  // the page keeps its own record of the model calls behind it (the operator's estimated cost; no credits)
  assert.equal(c2.cost.aiCalls, 2); assert.equal(c2.cost.aiUsdEstimated, 0.12); assert.equal(c2.cost.credits, 0);
});

test('a personal subject\'s name is never researched (no "Bubbles the chimpanzee"), only its general type', () => {
  const u = ai.normaliseUnderstanding({ identity: { name: 'Bubbles', kind: 'personal', ownerSubject: { name: 'Bubbles', type: 'goldfish' } }, research: { scope: 'subject', wikipediaTitles: ['Bubbles'] }, clarify: { needed: true, options: [{ label: 'Bubbles (chimpanzee)' }, { label: 'Bubbles (The Wire)' }] }, tone: { register: 'playful' } }, 'A page for my goldfish Bubbles');
  assert.equal(u.query, 'goldfish'); assert.equal(u.research.scope, 'general-topic'); assert.deepEqual(u.research.wikipediaTitles, []); assert.equal(u.clarify, null);
  assert.equal(u.kind, 'personal');
});

test('"supplied" means the owner\'s words: an embellished line is relabelled imagined, a close restatement stays supplied', () => {
  const supplied = ['He is a common goldfish with bright orange scales.', 'He races to the front of the tank whenever someone walks into the kitchen.'];
  const p = { identity: { name: 'Bubbles', kind: 'personal' }, concept: { logline: 'x' }, scenes: [
    { id: 'a', purpose: 'p', layers: [], text: { heading: 'Bubbles', body: 'Bright orange, endlessly curious, and utterly convinced the kitchen exists to greet him.', kind: 'supplied' } },
    { id: 'b', purpose: 'p', layers: [], text: { heading: 'Family', body: 'A common goldfish with bright orange scales who races to the front of the tank when someone walks into the kitchen.', kind: 'supplied' } }] };
  const { plan } = validatePlan2(p, { assets: [], facts: [], supplied });
  assert.deepEqual(plan.scenes.map(s => s.text.kind), ['imagined', 'supplied']);
});

test('numbers in "imagined" copy must come from the facts: restated ones become cited, invented ones go back for repair', () => {
  const facts = [{ id: 'f1', text: 'A stony asteroid some 50 to 60 metres across.' }];
  const mk = body => ({ identity: { name: 'T' }, concept: { logline: 'x' }, scenes: [{ id: 'a', purpose: 'p', layers: [], text: { heading: 'T', body, kind: 'imagined' } }, { id: 'b', purpose: 'p', layers: [], text: { heading: 'x' } }] });
  let v = validatePlan2(mk('It measured fifty to sixty metres.'), { assets: [], facts });
  assert.equal(v.plan.scenes[0].text.kind, 'sourced'); assert.equal(v.plan.scenes[0].text.cite, 'f1');
  v = validatePlan2(mk('Taller than 300 metres.'), { assets: [], facts }); assert.ok(v.errors.some(e => /no given fact supports/.test(e)));
  v = validatePlan2(mk('Some stories are best told in low light.'), { assets: [], facts }); assert.deepEqual(v.errors, []);
  // a summary of a few facts is fine when every number comes from one of them; one invented number still goes back
  const more = facts.concat({ id: 'f2', text: 'It moved at about 27 km/s.' });
  v = validatePlan2(mk('Fifty to sixty metres wide, at twenty-seven kilometres a second.'), { assets: [], facts: more });
  assert.deepEqual(v.errors, []); assert.equal(v.plan.scenes[0].text.kind, 'sourced');
  v = validatePlan2(mk('Fifty to sixty metres wide, at 27 km/s, from 900 km up.'), { assets: [], facts: more }); assert.ok(v.errors.length);
});

test('composition: a text-height scene with layers gets a stage; built-on layers travel with the focal; secondaries step aside', () => {
  const p = basePlan();
  p.scenes[1] = { id: 'sword', purpose: 'a sword', height: 'auto', text: { heading: 'A sword', region: 'right', body: 'It waits.' }, layers: [
    { id: 'blade', kind: 'shape', role: 'focal', shape: { form: 'line' }, box: box([44, 5, 8, 80]) },
    { id: 'hilt', kind: 'shape', role: 'support', shape: { form: 'cross' }, box: box([41, 55, 14, 8]) },
  ] };
  p.scenes.push({ id: 'three', purpose: 'markers', height: 'auto', text: { heading: 'Markers', region: 'center' }, layers: [
    { id: 'm1', kind: 'shape', role: 'focal', shape: { form: 'star' }, box: box([6, 30, 20, 30]) },
    { id: 'm2', kind: 'shape', role: 'support', shape: { form: 'diamond' }, box: box([40, 35, 20, 20]) },
  ] });
  const { plan } = validatePlan2(p, { assets: ASSETS, facts: FACTS });
  const [, sword, three] = plan.scenes;
  assert.equal(sword.height, 'short'); assert.equal(three.height, 'short');
  const blade = sword.layers.find(L => L.id === 'blade').box.d, hilt = sword.layers.find(L => L.id === 'hilt').box.d;
  assert.ok(blade[0] + blade[2] <= 50, 'the blade moved clear of the words');
  assert.ok(hilt[0] < blade[0] + blade[2] && hilt[0] + hilt[2] > blade[0], 'the hilt stays on the blade');
  const m2 = three.layers.find(L => L.id === 'm2');
  assert.equal(m2.opacity, 1, 'moved beside the words rather than faded'); assert.ok(m2.box.d[0] >= 5 && m2.box.d[0] + m2.box.d[2] <= 95);
  // a scene whose only picture was called "support" still gets a main visual, kept clear of the words
  const q = basePlan(); q.scenes[1] = { id: 'aside', purpose: 'p', height: 'short', text: { heading: 'Before', region: 'right', items: [{ text: 'Sponges.', kind: 'imagined' }] }, layers: [{ id: 'pic', kind: 'image', role: 'support', asset: 'r1', mask: 'circle', box: box([62, 22, 30, 56]) }] };
  const qa = validatePlan2(q, { assets: ASSETS, facts: FACTS }).plan.scenes[1].layers[0];
  assert.equal(qa.role, 'focal'); assert.ok(qa.box.d[0] + qa.box.d[2] <= 50, 'moved clear of the right-hand words');
  // clear at rest but growing over the words on scroll: the zoom is kept, anchored to grow away from them
  const z = basePlan(); z.scenes[1] = { id: 'zoom', purpose: 'p', height: 'tall', camera: 'none', text: { heading: 'Plies', region: 'right' }, layers: [{ id: 'roll', kind: 'shape', role: 'focal', shape: { form: 'blob' }, box: box([5, 15, 42, 70]), scroll: { kind: 'zoom-in', amount: 0.35 } }] };
  const zl = validatePlan2(z, { assets: ASSETS, facts: FACTS }).plan.scenes[1].layers[0];
  assert.equal(zl.scroll.kind, 'zoom-in'); assert.equal(zl.scroll.amount, 0.35); assert.equal(zl.scroll.anchor, 'right');
  assert.match(renderCreative2(validatePlan2(z, { assets: ASSETS, facts: FACTS }).plan, [], {}), /data-scroll="zoom-in" data-amount="0.35" data-anchor="right"/);
  // touching the words already: any zoom would cross them, so it moves on scroll without growing sideways
  z.scenes[1].layers[0].box = box([8, 15, 42, 70]);
  assert.equal(validatePlan2(z, { assets: ASSETS, facts: FACTS }).plan.scenes[1].layers[0].scroll.kind, 'parallax');
  // legibility: words on a full-bleed photo get a scrim; a word layer across them becomes a ghost; long headings are not towers
  const g = basePlan(); g.scenes[1] = { id: 'bleed', purpose: 'p', height: 'screen', text: { heading: 'A shockwave that broke windows hundreds of kilometres away', width: 'narrow', region: 'left', body: 'It knocked people off their feet.' }, layers: [
    { id: 'photo', kind: 'image', role: 'backdrop', asset: 'r1', opacity: 0.5, box: box([0, 0, 100, 100]) },
    { id: 'date', kind: 'word', role: 'support', word: { text: '30 JUNE 1908', style: 'outline' }, box: box([6, 30, 60, 20]) }] };
  const gs = validatePlan2(g, { assets: ASSETS, facts: FACTS }).plan.scenes[1];
  assert.equal(gs.text.scrim, true); assert.equal(gs.text.width, 'medium'); assert.ok(gs.layers.find(L => L.id === 'date').opacity <= 0.2);
  // a page validated again (reopen, export) keeps the same composition
  assert.deepEqual(validatePlan2(plan, { assets: ASSETS, facts: FACTS }).plan.scenes, plan.scenes);
});

test('citations are read as the model writes them, but only given fact ids are ever accepted', () => {
  const facts = [{ id: 'f2', text: 'It approached at about 27 km/s.' }, { id: 'f3', text: 'It exploded 5 to 10 km above the ground.' }];
  const mk = cites => ({ identity: { name: 'T' }, concept: { logline: 'x' }, scenes: [{ id: 'a', purpose: 'p', layers: [], text: { heading: 'T', items: cites.map(c => ({ text: 'A line about the event.', kind: 'sourced', cite: c })) } }, { id: 'b', purpose: 'p', layers: [], text: { heading: 'x' } }] });
  const v = validatePlan2(mk(['f2, f3', 'F3', '[f2]', 'fact 3', 'f03']), { assets: [], facts });
  assert.deepEqual(v.plan.scenes[0].text.items.map(i => i.cite), ['f2', 'f3', 'f2', 'f3', 'f3']); assert.deepEqual(v.errors, []);
  const bad = validatePlan2(mk(['f9', 'source 2', 'f9', 'f2']), { assets: [], facts });
  assert.equal(bad.plan.scenes[0].text.items.length, 1, 'lines citing no given fact are removed');
  assert.ok(bad.errors.some(e => /"f9"/.test(e) && /f2…f3/.test(e)), 'the repair message names the bad cites and the valid ids');
});

test('headings, kickers, labels and the concept may not bring numbers no fact states (small counts are fine)', () => {
  const facts = [{ id: 'f1', text: 'Trees were felled over an area of 2,150 km2 by the eighteenth century standards.' }];
  const mk = (heading, kicker, logline) => ({ identity: { name: 'T' }, concept: { title: 'T', logline }, scenes: [{ id: 'a', purpose: 'p', layers: [], text: { heading, kicker } }, { id: 'b', purpose: 'p', layers: [], text: { heading: 'x', items: [{ label: '18th century', text: 'A line.', kind: 'imagined' }] } }] });
  assert.deepEqual(validatePlan2(mk('Across 2,150 square kilometres', 'Two-ply. Twelve rolls.', 'A forest lies down.'), { assets: [], facts }).errors, []);
  const v = validatePlan2(mk('Eighty million trees, pointed away', 'At 7:14', 'Eighty million trees fell.'), { assets: [], facts });
  assert.ok(v.errors.some(e => /heading states 80/.test(e))); assert.ok(v.errors.some(e => /logline states 80/.test(e))); assert.ok(v.errors.some(e => /kicker states 14/.test(e)));
});

test('research keeps a date with an old-style bracket in one sentence', () => {
  const { splitSentences } = require('../lib/creative/research');
  const s = splitSentences('The explosion occurred on 30 June [O.S. 17 June] 1908, at around 7:14 in the morning. Trees fell.');
  assert.equal(s[0], 'The explosion occurred on 30 June [O.S. 17 June] 1908, at around 7:14 in the morning.');
});

test('cost estimates come from the configured per-million prices', () => {
  const L = ai.limits({ PREMIUM_PRICE_STRONG_INPUT: '3', PREMIUM_PRICE_STRONG_OUTPUT: '15' });
  assert.equal(ai.estimateUsd({ input_tokens: 10000, output_tokens: 4000 }, L.prices.strong), 0.09);
  assert.equal(L.enabled, true); assert.equal(ai.limits({ CREATIVE_AI_DIRECTION: 'off' }).enabled, false);
});

async function withServer(env, fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sr-cr-ai-'));
  const s = await startServer(Object.assign({ SITEREMADE_BACKEND: 'local', SITEREMADE_DB_PATH: path.join(dir, 'app.db'), SITEREMADE_ASSET_STORE_DIR: path.join(dir, 'a'), SITEREMADE_PREMIUM_LOG_DIR: path.join(dir, 'p'), ANTHROPIC_API_KEY: 'mock-only', OPENAI_API_KEY: '', STRIPE_SECRET_KEY: '', MOCK_CALL_LOG: path.join(dir, 'calls.log'), NODE_ENV: 'test' }, env));
  try { const call = client(s.port); await call('POST', '/api/auth/signup', { email: `ai-${Date.now()}@example.com`, password: 'correct-horse-battery-staple' }); await fn(call, dir); } finally { await s.stop(); }
}
const BRIEF = 'An imaginary kingdom run entirely by cats'; // invented: no research, so no network in tests
const planBody = u => ({ brief: BRIEF, understanding: u, facts: [], supplied: {}, assets: [{ id: 'u1', origin: 'upload', title: 'cat', assess: { width: 800, height: 600, aspect: 1.33, orientation: 'landscape' }, caps: { moveFreely: false } }], thumbnails: [{ id: 'u1', dataUrl: 'data:image/jpeg;base64,/9j/4AAQ' }] });
const ledger = dir => { const f = path.join(dir, 'p', 'creative-ledger.jsonl'); return fs.existsSync(f) ? fs.readFileSync(f, 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l)) : []; };

test('server (MOCK provider): understanding before research, a validated direction labelled as a mock, costs in the Creative ledger', async () => {
  await withServer({}, async (call, dir) => {
    const r = await call('POST', '/api/creative/research', { brief: BRIEF });
    assert.equal(r.body.understandMeta.source, 'ai'); assert.equal(r.body.understanding.identity.kind, 'invented'); assert.equal(r.body.research.status, 'skipped');
    const p = await call('POST', '/api/creative/plan', planBody(r.body.understanding));
    assert.equal(p.body.ok, true); assert.equal(p.body.plan.v, 2);
    assert.equal(p.body.plan.direction.source, 'mock', 'a mock is never labelled as AI direction');
    assert.ok(p.body.meta.usdEstimated > 0);
    for (let i = 0; i < 40 && ledger(dir).length < 3; i++) await new Promise(res => setTimeout(res, 50));
    const rows = ledger(dir);
    assert.deepEqual(rows.map(x => x.kind), ['creative_understand', 'creative_research', 'creative_direct']);
    assert.ok(rows.every(x => x.estimated !== false)); assert.equal(rows[2].estimated, true);
  });
});

test('server (MOCK provider): one bounded repair, then an explicit fallback with the reason', async () => {
  await withServer({ MOCK_CREATIVE: 'repair' }, async call => {
    const p = await call('POST', '/api/creative/plan', planBody({ kind: 'invented', subject: 'cats' }));
    assert.equal(p.body.ok, true); assert.equal(p.body.meta.attempts.length, 2); assert.equal(p.body.plan.direction.repaired, true);
  });
  await withServer({ MOCK_CREATIVE: 'invalid' }, async call => {
    const p = await call('POST', '/api/creative/plan', planBody({ kind: 'invented', subject: 'cats' }));
    assert.equal(p.body.ok, false); assert.equal(p.body.fallback, true); assert.match(p.body.reason, /repair attempt/); assert.equal(p.body.meta.attempts.length, 2);
  });
  await withServer({ MOCK_CREATIVE: 'error' }, async call => {
    const p = await call('POST', '/api/creative/plan', planBody({ kind: 'invented', subject: 'cats' }));
    assert.equal(p.body.ok, false); assert.match(p.body.reason, /model call failed/);
  });
});

test('server (MOCK provider): the claim check sends unsupported words back once, then takes them out; its cost is its own ledger row', async () => {
  await withServer({ MOCK_CREATIVE: 'claims' }, async (call, dir) => {
    const body = Object.assign(planBody({ kind: 'recognizable', subject: 'Cats', identity: { name: 'Cats', kind: 'recognizable' } }), { facts: [{ id: 'f1', text: 'Cats are small carnivorous mammals.' }] });
    const r = await call('POST', '/api/creative/plan', body);
    assert.equal(r.body.ok, true); assert.equal(r.body.meta.attempts.length, 2, 'one repair for the unsupported heading');
    assert.ok(r.body.meta.attempts.every(a => a.claims && a.claims.unsupported === 1));
    const reveal = r.body.plan.scenes.find(s => s.id === 'reveal');
    assert.equal(reveal.text.heading, '', 'the unsupported heading is cleared, not replaced by new unchecked words');
    assert.ok(reveal.layers.length, 'the scene keeps its pictures, so it stays');
    assert.ok(r.body.fixes.some(f => /"Closer" was taken out/.test(f)));
    assert.deepEqual(r.body.plan.claims, { status: 'verified', checked: r.body.plan.claims.of, of: r.body.plan.claims.of, removed: 1, calls: 1 });
    for (let i = 0; i < 40 && ledger(dir).length < 4; i++) await new Promise(res => setTimeout(res, 50)); // (the ledger is written in order, after the reply)
    const rows = ledger(dir);
    assert.equal(rows.filter(x => x.kind === 'creative_claims').length, 2); assert.equal(rows.filter(x => x.kind === 'creative_direct').length, 2);
  });
  // switched off: no claim call at all
  await withServer({ MOCK_CREATIVE: 'claims', CREATIVE_CLAIM_CHECK: 'off' }, async (call, dir) => {
    const body = Object.assign(planBody({ kind: 'recognizable', subject: 'Cats', identity: { name: 'Cats', kind: 'recognizable' } }), { facts: [{ id: 'f1', text: 'Cats are small carnivorous mammals.' }] });
    const r = await call('POST', '/api/creative/plan', body);
    assert.equal(r.body.ok, true); assert.equal(r.body.meta.attempts.length, 1); assert.equal(ledger(dir).filter(x => x.kind === 'creative_claims').length, 0);
  });
});

// ---- accepted designs stay put: a page saved by the stage-2 code, reopened with today's layout rules
test('stability: a page saved under the previous layout rules reopens unchanged; edits change only what was edited', () => {
  const saved = require('./fixtures/creative-saved-stage2.json').creative;
  const reopened = sanitizeCreative(JSON.parse(JSON.stringify(saved)));
  assert.deepEqual(reopened.plan.scenes, saved.plan.scenes, 'no layer, box, height or region moved');
  assert.equal(reopened.plan.layout.version, 0, 'marked as composed under the old rules, not silently upgraded');
  // a text edit: only that text differs
  const edited = JSON.parse(JSON.stringify(saved)); edited.plan.scenes[1].text.heading = 'A new heading of my own';
  const e = sanitizeCreative(edited).plan.scenes;
  const expect = JSON.parse(JSON.stringify(saved.plan.scenes)); expect[1].text.heading = 'A new heading of my own';
  assert.deepEqual(e, expect);
  // replacing one picture: that layer shows the new asset, in the same place
  const swapped = JSON.parse(JSON.stringify(saved)); const L = swapped.plan.scenes.flatMap(s => s.layers).find(x => x.kind === 'image' && x.role === 'focal');
  const other = swapped.assets.find(a => a.origin === 'research' && a.id !== L.asset && !a.cutoutOf && a.id !== (swapped.assets.find(b => b.id === L.asset) || {}).cutoutOf);
  const before = JSON.parse(JSON.stringify(L)); L.asset = other.id;
  const after = sanitizeCreative(swapped).plan.scenes.flatMap(s => s.layers).find(x => x.id === L.id);
  assert.equal(after.asset, other.id); assert.deepEqual(after.box, before.box); assert.deepEqual(after.entrance, before.entrance); assert.deepEqual(after.scroll, before.scroll);
  // an explicit recompose is the only way to today's rules
  const recomposed = validatePlan2(saved.plan, { assets: saved.assets, facts: saved.plan.facts }).plan;
  assert.equal(recomposed.layout.version, require('../lib/creative/validate2').LAYOUT_VERSION);
});

// ---- licence delivery: the facts' article is credited, and the bundle carries only pictures the page shows
test('sources and export: cited facts credit their article; unused pictures are not shipped', () => {
  const page = { title: 'Toilet paper', url: 'https://en.wikipedia.org/wiki/Toilet_paper', license: 'CC BY-SA 4.0', retrieved: '2026-09-28' };
  const v = validatePlan2(basePlan(), { assets: ASSETS, facts: FACTS, page });
  assert.deepEqual(v.plan.sources.map(s => [s.title, s.license]), [['Toilet paper', 'CC BY-SA 4.0']]);
  const html = renderCreative2(v.plan, ASSETS, { mode: 'export', src: a => a.id + '.png' });
  assert.match(html, /From <a href="https:\/\/en\.wikipedia\.org\/wiki\/Toilet_paper"[^>]*>Toilet paper<\/a> \(CC BY-SA 4\.0\)/);
  // a saved plan without sources (every v2 plan before this fix) gets them on reopen and export
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sr-cr2-export-'));
  process.env.SITEREMADE_BACKEND = 'local'; process.env.SITEREMADE_ASSET_STORE_DIR = path.join(dir, 'assets');
  const { getDatabaseAdapter } = require('../lib/adapters/database-adapter'); const projectStore = require('../lib/project-store'); const { compileExport } = require('../lib/export-compiler');
  const db = getDatabaseAdapter(':memory:');
  const pix = n => { const b = Buffer.alloc(80); b.write('\x89PNG\r\n\x1a\n', 0, 'latin1'); b.writeUInt32BE(13, 8); b.write('IHDR', 12); b.writeUInt32BE(10, 16); b.writeUInt32BE(10, 20); b.writeUInt32BE(n, 60); return 'data:image/png;base64,' + b.toString('base64'); };
  const assets = ASSETS.map((a, i) => Object.assign({}, a, { dataUrl: pix(i + 1), mime: 'image/png' }));
  const saved = Object.assign({}, v.plan, { sources: [] });
  const direction = { mode: 'creative', meta: { id: 'c1' }, pages: [{ id: 'creative', label: 'Creative page', sections: [] }], creative: { brief: 'toilet paper', understanding: { kind: 'recognizable', subject: 'toilet paper' }, research: { status: 'ok', page, facts: FACTS }, assets, plan: saved } };
  const check = projectStore.validateDirectionsState({ directions: [direction], activeDirectionIndex: 0 });
  assert.ok(check.valid, check.error);
  assert.equal(check.normalized.directions[0].creative.plan.sources[0].title, 'Toilet paper', 'reopening credits the article');
  projectStore.internalizeAssets(db, check.normalized);
  const workDir = path.join(dir, 'export');
  const res = compileExport(db, { project: { id: 'p2', revision: 1, directionsState: check.normalized }, directionIndex: 0, workDir });
  const out = fs.readFileSync(path.join(workDir, 'index.html'), 'utf8');
  const shipped = fs.readdirSync(path.join(workDir, 'assets'));
  assert.equal(shipped.length, 1, 'only the cutout the page shows is shipped (not r1, r2 or the upload)');
  assert.ok(out.includes('assets/' + shipped[0])); assert.equal(res.manifest.assets.length, 1);
  const attribution = fs.readFileSync(path.join(workDir, 'ATTRIBUTION.md'), 'utf8');
  assert.match(attribution, /Toilet paper \(CC BY-SA 4\.0\)\n  https:\/\/en\.wikipedia\.org\/wiki\/Toilet_paper/);
  assert.match(attribution, /- r1 — A\. Photographer \(CC BY-SA 4\.0\)/); assert.match(attribution, /Background removed by SiteRemade/);
  assert.doesNotMatch(attribution, /uploaded by the page owner/, 'an upload the page does not show is neither shipped nor counted');
});

test('groups: parts of one object render inside one wrapper that carries the motion; members keep their relative places', () => {
  const p = basePlan(); p.scenes[1] = { id: 'sword', purpose: 'p', height: 'screen', text: { heading: 'A sword', region: 'right' }, layers: [
    { id: 'blade', kind: 'shape', role: 'focal', group: 'sword', shape: { form: 'line' }, box: box([20, 5, 6, 80], [40, 5, 6, 80]), entrance: { kind: 'descend' }, loop: { kind: 'float' }, scroll: { kind: 'parallax', amount: 0.3 } },
    { id: 'hilt', kind: 'shape', role: 'support', group: 'sword', shape: { form: 'cross' }, box: box([15, 55, 16, 8], [35, 55, 16, 8]), entrance: { kind: 'pop' }, loop: { kind: 'sway' } },
  ] };
  const { plan } = validatePlan2(p, { assets: ASSETS, facts: FACTS });
  const html = renderCreative2(plan, ASSETS, {});
  const g = html.slice(html.indexOf('data-kind="group"')); const wrap = g.slice(0, g.indexOf('ly-group-art'));
  assert.match(wrap, /data-scroll="parallax"/); assert.match(wrap, /data-entrance="descend"/); assert.match(wrap, /data-loop="float"/);
  const inner = g.slice(g.indexOf('ly-group-art'), g.indexOf('</section>'));
  assert.equal((inner.match(/data-entrance="none"/g) || []).length, 2, 'members have no entrance of their own'); assert.match(inner, /data-loop="sway"/, 'a member keeps its own ambient loop');
  // moving the focal clear of the words moves the whole object
  const q = basePlan(); q.scenes[1] = { id: 'sword', purpose: 'p', height: 'screen', text: { heading: 'A sword', region: 'right', body: 'It waits.' }, layers: [
    { id: 'blade', kind: 'shape', role: 'focal', shape: { form: 'line' }, box: box([46, 5, 8, 80]) },
    { id: 'hilt', kind: 'shape', role: 'support', shape: { form: 'cross' }, box: box([44, 55, 12, 8]) }] };
  const s = validatePlan2(q, { assets: ASSETS, facts: FACTS }).plan.scenes[1];
  const blade = s.layers.find(L => L.id === 'blade'), hilt = s.layers.find(L => L.id === 'hilt');
  assert.equal(blade.group, hilt.group, 'the hilt lying on the blade became part of it');
  assert.ok(Math.abs((hilt.box.d[0] - blade.box.d[0]) - (44 - 46)) < 0.5, 'their relative placement is unchanged');
});

test('imagery: a logo is never the hero when a picture of the subject exists; a missing subject is marked degraded', () => {
  const pics = [A('r5', { curation: { role: 'logo', identity: 'related', depicts: 'a wordmark' } }), A('r6', { curation: { role: 'subject', identity: 'form', depicts: 'a cosplayer dressed as the hero' } })];
  const p = basePlan(); p.scenes[0].layers = [{ kind: 'image', role: 'focal', asset: 'r5', mask: 'window', box: box([55, 8, 38, 60]) }];
  const v = validatePlan2(p, { assets: pics, facts: FACTS, visuals: { main: 'the hero himself' } });
  assert.ok(v.errors.some(e => /is a logo -- use a picture of the subject \(r6\)/.test(e)));
  p.scenes[0].layers = [{ kind: 'image', role: 'focal', asset: 'r6', mask: 'arch', box: box([55, 8, 38, 60]) }];
  assert.equal(validatePlan2(p, { assets: pics, facts: FACTS }).plan.imagery.status, 'form');
  // nothing shows the subject: the plan is kept, but labelled degraded with what is missing
  p.scenes[0].layers = [{ kind: 'shape', role: 'focal', shape: { form: 'triangle' }, box: box([55, 8, 38, 60]) }];
  const d = validatePlan2(p, { assets: [], facts: FACTS, coverage: { coverage: 'none', missing: ['a clear picture of the character himself'] } }).plan.imagery;
  assert.equal(d.status, 'missing'); assert.equal(d.degraded, true); assert.deepEqual(d.missing, ['a clear picture of the character himself']);
  // an owner's upload is a picture of the subject: a supporting picture may not lead instead of it
  const withUpload = pics.concat([A('u9', { origin: 'upload', title: 'my artwork', license: '' }), A('r7', { curation: { role: 'supporting', identity: 'exact', depicts: 'an ocarina' } })]);
  p.scenes[0].layers = [{ kind: 'image', role: 'focal', asset: 'r7', mask: 'arch', box: box([55, 8, 38, 60]) }];
  assert.ok(validatePlan2(p, { assets: withUpload, facts: FACTS, visuals: { main: 'the hero himself' } }).errors.some(e => /shows a supporting object, not the subject -- r6, u9 show the subject/.test(e)));
  // a brief "invented" by kind can still have a picture it cannot do without: the stated visuals decide
  p.identity = { name: 'A meme', kind: 'invented' }; p.scenes[0].layers = [{ kind: 'shape', role: 'focal', shape: { form: 'triangle' }, box: box([55, 8, 38, 60]) }];
  assert.equal(validatePlan2(p, { assets: [], facts: FACTS, visuals: { main: 'the original photograph' } }).plan.imagery.status, 'missing');
  p.identity = { name: 'Toilet paper', kind: 'recognizable' };
  // an intentionally geometric brief is not degraded
  assert.equal(validatePlan2(p, { assets: [], facts: FACTS, visuals: { main: 'none -- a pure geometry piece' } }).plan.imagery.status, 'not-needed');
  // a picture the check found unrelated is never used
  const u = basePlan(); u.scenes[0].layers.push({ kind: 'image', role: 'support', asset: 'x1', mask: 'window', box: box([10, 60, 20, 20]) });
  const w = validatePlan2(u, { assets: ASSETS.concat([A('x1', { curation: { role: 'unrelated', identity: 'other', depicts: 'a street parade' } })]), facts: FACTS });
  assert.ok(!w.plan.scenes[0].layers.some(L => L.asset === 'x1')); assert.ok(w.fixes.some(f => /a street parade/.test(f)));
});

test('footer: an "invented" subject that cites real facts is never called a work of pure imagination', () => {
  const p = basePlan(); p.identity = { name: 'The Backrooms', kind: 'invented' };
  const cites = renderCreative2(validatePlan2(p, { assets: ASSETS, facts: FACTS }).plan, ASSETS, {});
  assert.doesNotMatch(cites, /nothing on this page describes real events/); assert.match(cites, /The numbered lines come from the sources below/);
  p.scenes.forEach(s => { s.text.body = ''; s.text.items = []; s.text.kind = 'imagined'; s.text.cite = null; });
  assert.match(renderCreative2(validatePlan2(p, { assets: ASSETS, facts: [] }).plan, ASSETS, {}), /nothing on this page describes real events/);
});

test('research: directed results must match their own search, logos are recognised by their categories, one shoot counts once', async () => {
  const { research } = require('../lib/creative/research');
  const info = (t, extra) => Object.assign({ imageinfo: [{ url: 'https://upload.wikimedia.org/x.jpg', thumburl: 'https://upload.wikimedia.org/x.jpg', descriptionurl: 'https://commons.wikimedia.org/wiki/' + encodeURIComponent(t), width: 3000, height: 2000, mime: 'image/jpeg', extmetadata: Object.assign({ LicenseShortName: { value: 'CC BY-SA 4.0' }, Artist: { value: 'Someone' } }, extra || {}) }] }, { title: t });
  const files = {
    'File:Volksfestumzug in Hof 20230728 HOF04609.jpg': info('File:Volksfestumzug in Hof 20230728 HOF04609.jpg', { ImageDescription: { value: 'Street parade' } }),
    'File:Volksfestumzug in Hof 20230728 HOF04610.jpg': info('File:Volksfestumzug in Hof 20230728 HOF04610.jpg', { ImageDescription: { value: 'Street parade' } }),
    'File:Link cosplay at a convention 2025.jpg': info('File:Link cosplay at a convention 2025.jpg'),
    'File:Ocarina Chronicle.png': (() => { const x = info('File:Ocarina Chronicle.png', { Categories: { value: 'Video game logos|Ocarina' } }); x.imageinfo[0].mime = 'image/png'; return x; })(),
  };
  const fetchImpl = async url => {
    const json = x => ({ ok: true, status: 200, headers: { get: () => 'application/json' }, text: async () => JSON.stringify(x), arrayBuffer: async () => new ArrayBuffer(0) });
    if (/rest_v1\/page\/summary/.test(url)) return json({ type: 'standard', title: 'Ocarina', description: 'a game', extract: 'Ocarina is a game about a hero in a green tunic who explores a kingdom.' });
    if (/prop=extracts/.test(url)) return json({ query: { pages: { 1: { extract: 'Ocarina is a game about a hero in a green tunic who explores a kingdom of forests.' } } } });
    if (/prop=images/.test(url)) return json({ query: { pages: { 1: { images: [] } } } });
    if (/list=search/.test(url)) return json({ query: { search: /cosplay/.test(decodeURIComponent(url)) ? Object.keys(files).map(title => ({ title })) : [] } });
    if (/prop=imageinfo/.test(url)) return json({ query: { pages: Object.fromEntries(Object.values(files).map((v, i) => [i, v])) } });
    return { ok: true, status: 200, headers: { get: () => 'image/jpeg' }, arrayBuffer: async () => new ArrayBuffer(8) };
  };
  const trace = [];
  await research({ query: 'Ocarina' }, { fetchImpl, queries: ['Link cosplay Ocarina'], trace, maxImages: 3 });
  const row = t => trace.find(x => x.title === t && x.relevance != null);
  assert.ok(row('File:Link cosplay at a convention 2025.jpg').picked, 'the photo that matches its search is picked');
  assert.equal(row('File:Link cosplay at a convention 2025.jpg').kind, 'form');
  assert.equal(row('File:Ocarina Chronicle.png').kind, 'logo', 'a wordmark whose name hides it is known by its categories');
  assert.ok(row('File:Ocarina Chronicle.png').relevance < row('File:Link cosplay at a convention 2025.jpg').relevance);
  assert.ok(!row('File:Volksfestumzug in Hof 20230728 HOF04609.jpg').picked && !row('File:Volksfestumzug in Hof 20230728 HOF04610.jpg').picked, 'a large photo matching nothing is not picked for its size');
});

// ---- the claim check's accounting, against a scripted checker (every failure mode found in stage 2)
const LIM = ai.limits({});
const claimPlan = () => validatePlan2({ identity: { name: 'Tunguska event' }, concept: { title: 'The Sky Split', logline: 'A morning in Siberia.' }, scenes: [
  { id: 'hero', purpose: 'p', layers: [{ kind: 'shape', role: 'focal', shape: { form: 'circle' }, box: box([55, 10, 35, 60]) }], text: { heading: 'The Sky Split', kicker: 'Behold', body: 'Trees fell across the forest.', kind: 'sourced', cite: 'f1' } },
  { id: 'wave', purpose: 'p', layers: [], text: { kicker: 'Measured', heading: 'A shockwave that circled the planet', body: 'Windows broke far away.', kind: 'sourced', cite: 'f2' } },
  { id: 'rest', purpose: 'p', layers: [{ kind: 'image', role: 'focal', asset: 'r1', box: box([55, 10, 35, 70]) }], text: { heading: 'The forest remembers', items: [{ text: 'A stone the width of a stadium.', kind: 'imagined' }] } },
] }, { assets: ASSETS, facts: [{ id: 'f1', text: 'Trees fell across 2,150 km2 of forest.' }, { id: 'f2', text: 'The shock wave broke windows hundreds of kilometres away.' }] }).plan;
const claimInput = { facts: [{ id: 'f1', text: 'Trees fell across 2,150 km2 of forest.' }, { id: 'f2', text: 'The shock wave broke windows hundreds of kilometres away.' }], supplied: { facts: [], memories: [] } };
// a scripted checker: each call answers with answer(lines, callNo) or throws
const scripted = answer => { let n = 0; const calls = []; return { calls, deps: { limits: LIM, call: async req => { n++; const asked = JSON.parse(req.content[0].text.split('\n\nGive')[0]).lines; calls.push(asked.map(l => l.ref)); const a = answer(asked, n); if (a instanceof Error) throw a; return { input: a, usage: { input_tokens: 1000, output_tokens: 100 }, model: 'test-checker' }; } } }; };
const verdictFor = l => (/circled|stadium/.test(l.text) ? { ref: l.ref, verdict: 'unsupported', claim: l.text } : /Behold|Sky Split|remembers|morning|Measured/.test(l.text) ? { ref: l.ref, verdict: 'no-claim' } : { ref: l.ref, verdict: 'supported', evidence: [/Windows/.test(l.text) ? 'f2' : 'f1'] });

test('claim check: every line needs a verdict -- unanswered lines get one follow-up, and only they are asked again', async () => {
  const s = scripted((lines, n) => ({ lines: (n === 1 ? lines.filter((_, i) => i % 2) : lines).map(verdictFor) }));
  const c = await ai.verifyClaims(claimPlan(), claimInput, s.deps, 1);
  assert.equal(s.calls.length, 2); assert.equal(s.calls[1].length, s.calls[0].length - Math.floor(s.calls[0].length / 2), 'the follow-up asks only the unanswered lines');
  assert.equal(c.status, 'verified'); assert.equal(c.unresolved.length, 0); assert.deepEqual(c.unsupported.map(u => u.what).sort(), ['heading', 'line 1']);
});

test('claim check: lines still unanswered after the follow-up are unresolved, never reported as checked', async () => {
  const s = scripted(lines => ({ lines: lines.slice(1).map(verdictFor) })); // always skips the first line asked
  const c = await ai.verifyClaims(claimPlan(), claimInput, s.deps, 1);
  assert.equal(s.calls.length, 2, 'bounded: the check and one follow-up'); assert.equal(c.status, 'partial'); assert.equal(c.unresolved.length, 1); assert.equal(c.checked, c.lines - 1);
});

test('claim check: "supported" must point at evidence that exists; unknown refs are ignored; conflicting answers resolve to the stricter', async () => {
  const s = scripted(lines => ({ lines: lines.map(l => { const v = verdictFor(l); return v.verdict === 'supported' ? Object.assign(v, { evidence: /Trees/.test(l.text) ? [] : ['f99'] }) : v; }).concat([{ ref: 's9.heading', verdict: 'supported', evidence: ['f1'] }, { ref: 'concept.title', verdict: 'unsupported', claim: 'conflict' }]) }));
  const c = await ai.verifyClaims(claimPlan(), claimInput, s.deps, 1);
  assert.ok(c.noEvidence >= 2, 'supported without evidence, or with an id that does not exist, is not a verdict'); assert.ok(c.unknown >= 1, 'answers for lines that were not asked are ignored');
  assert.equal(c.conflicts, 1); assert.ok(c.unsupported.some(u => u.ref === 'concept.title'), 'no-claim vs unsupported: unsupported holds');
  assert.equal(c.status, 'partial'); assert.ok(c.unresolved.some(u => /Trees/.test(u.text)));
});

test('claim check: a failed or malformed check is retried once, then reported as unchecked -- never as verified', async () => {
  let s = scripted((lines, n) => (n === 1 ? new Error('the model ran out of output room before finishing') : { lines: lines.map(verdictFor) }));
  let c = await ai.verifyClaims(claimPlan(), claimInput, s.deps, 1); assert.equal(s.calls.length, 2); assert.equal(c.status, 'verified');
  s = scripted(() => ({ note: 'no lines here' }));
  c = await ai.verifyClaims(claimPlan(), claimInput, s.deps, 1); assert.equal(s.calls.length, 2); assert.equal(c.status, 'unchecked'); assert.equal(c.checked, 0);
  s = scripted(() => new Error('overloaded'));
  c = await ai.verifyClaims(claimPlan(), claimInput, s.deps, 1); assert.equal(c.status, 'unchecked'); assert.equal(c.errors.length, 2);
});

test('claim removal repairs the section: no orphaned headings, kickers or blank scenes; humour stays; the hero keeps a name', () => {
  const plan = claimPlan(); const lines = ai.claimLines(plan); const pick = re => lines.filter(l => re.test(l.text));
  // the wave scene loses its heading and its paragraph: a kicker with nothing under it and no picture -> the scene goes
  let cut = ai.withoutClaims(plan, pick(/circled|Windows/));
  assert.ok(!cut.plan.scenes.some(s => s.id === 'wave')); assert.ok(cut.notes.some(n => /dropped/.test(n)));
  assert.equal(cut.plan.scenes[0].text.kicker, 'Behold', 'humour and mood are not touched');
  // the hero's heading falls back to the subject's name, never to blank or to new words
  cut = ai.withoutClaims(plan, pick(/^The Sky Split$/)); assert.equal(cut.plan.scenes[0].text.heading, 'Tunguska event');
  // a scene with a picture keeps its picture when its words go; its emptied list is gone, not left empty
  cut = ai.withoutClaims(plan, pick(/stadium/)); const rest = cut.plan.scenes.find(s => s.id === 'rest');
  assert.ok(rest && rest.layers.length); assert.deepEqual(rest.text.items, []);
  // could not be checked at all: invented prose goes, cited and owner lines stay
  cut = ai.withoutClaims(plan, [], true); assert.deepEqual(cut.plan.scenes.find(s => s.id === 'rest').text.items, []); assert.equal(cut.plan.scenes[0].text.body, 'Trees fell across the forest.');
});

test('direction: an unchecked page is accepted only as explicitly degraded, with invented prose removed', async () => {
  const good = claimPlan(); const planInput = JSON.parse(JSON.stringify(good)); delete planInput.claims;
  let n = 0;
  const deps = { limits: Object.assign({}, LIM, { repairs: 1 }), call: async req => { n++; if (req.tool.name === 'submit_creative_plan') return { input: planInput, usage: { input_tokens: 1, output_tokens: 1 }, model: 'test-director' }; throw new Error('checker unavailable'); } };
  // (no owner upload here: a drawn hero beside an unused upload would rightly be sent back first)
  const r = await ai.direct({ facts: claimInput.facts, supplied: claimInput.supplied, assets: ASSETS.filter(a => a.origin !== 'upload'), thumbnails: [] }, deps);
  assert.equal(r.ok, true); assert.equal(r.plan.claims.status, 'unchecked'); assert.equal(r.plan.claims.checked, 0);
  assert.ok(r.warnings.some(w => /could NOT be checked/.test(w)));
  assert.deepEqual(r.plan.scenes.find(s => s.id === 'rest').text.items, [], 'the invented line is gone');
});

test('server: limits are explicit -- account cap, off switch, no key', async () => {
  await withServer({ CREATIVE_ACCOUNT_DAILY_PLANS: '1' }, async call => {
    assert.equal((await call('POST', '/api/creative/plan', planBody({ kind: 'invented' }))).body.ok, true);
    const second = await call('POST', '/api/creative/plan', planBody({ kind: 'invented' }));
    assert.equal(second.body.ok, false); assert.match(second.body.reason, /today's 1 AI directions/);
  });
  await withServer({ CREATIVE_AI_DIRECTION: 'off' }, async call => { const p = await call('POST', '/api/creative/plan', planBody({})); assert.match(p.body.reason, /switched off/); });
  await withServer({ ANTHROPIC_API_KEY: '' }, async call => {
    const p = await call('POST', '/api/creative/plan', planBody({})); assert.match(p.body.reason, /no AI model is configured/);
    const r = await call('POST', '/api/creative/research', { brief: BRIEF }); assert.equal(r.body.understandMeta.source, 'rules');
  });
});

test('the main picture is never blurred on a new plan; a saved page keeps what it had', () => {
  const p = basePlan(); p.scenes[0].layers[0].treatment = 'soft';
  assert.equal(validatePlan2(p, { assets: ASSETS, facts: FACTS }).plan.scenes[0].layers[0].treatment, 'none');
  assert.equal(validatePlan2(p, { assets: ASSETS, facts: FACTS, mode: 'safety' }).plan.scenes[0].layers[0].treatment, 'soft');
});

test('research: for a fictional character, a Commons file credited as someone\'s own work is not the official depiction', async () => {
  const { research } = require('../lib/creative/research');
  const info = (t, credit) => ({ title: t, imageinfo: [{ url: 'https://upload.wikimedia.org/x.png', thumburl: 'https://upload.wikimedia.org/x.png', descriptionurl: 'https://commons.wikimedia.org/wiki/' + encodeURIComponent(t), width: 900, height: 900, mime: 'image/png', extmetadata: { LicenseShortName: { value: 'CC BY-SA 3.0' }, Artist: { value: 'Someone' }, Credit: { value: credit }, ImageDescription: { value: 'X the character' } } }] });
  const files = { 'File:X drawing.png': info('File:X drawing.png', 'Own work'), 'File:X official.png': info('File:X official.png', 'The Studio (official channel)') };
  const fetchImpl = async url => {
    const json = x => ({ ok: true, status: 200, headers: { get: () => 'application/json' }, text: async () => JSON.stringify(x), arrayBuffer: async () => new ArrayBuffer(0) });
    if (/rest_v1\/page\/summary/.test(url)) return json({ type: 'standard', title: 'X', description: 'a character', extract: 'X is a character in a video game series who explores a kingdom.' });
    if (/prop=extracts/.test(url)) return json({ query: { pages: { 1: { extract: 'X is a character in a video game series who explores a kingdom of forests.' } } } });
    if (/prop=images/.test(url)) return json({ query: { pages: { 1: { images: [] } } } });
    if (/list=search/.test(url)) return json({ query: { search: Object.keys(files).map(title => ({ title })) } });
    if (/prop=imageinfo/.test(url)) return json({ query: { pages: Object.fromEntries(Object.values(files).map((v, i) => [i, v])) } });
    return { ok: true, status: 200, headers: { get: () => 'image/png' }, arrayBuffer: async () => new ArrayBuffer(8) };
  };
  const curate = async ({ candidates }) => ({ verdicts: Object.fromEntries(candidates.map(c => [c.id, { role: 'subject', identity: 'exact', origin: 'official', depicts: 'X', quality: 3 }])), selection: candidates.map(c => c.id), coverage: 'strong', missing: [], judged: candidates.length, of: candidates.length });
  const r = await research({ query: 'X' }, { fictional: true, fetchImpl, queries: ['X artwork'], maxImages: 3, curate });
  const byTitle = Object.fromEntries(r.diagnostics.judged.map(j => [j.title, j]));
  assert.equal(byTitle['File:X drawing.png'].outcome, 'fan-made, not official artwork');
  assert.equal(byTitle['File:X official.png'].outcome, 'used');
  // a real-world subject is not affected by the rule
  const r2 = await research({ query: 'X' }, { fictional: false, fetchImpl, queries: ['X artwork'], maxImages: 3, curate });
  assert.ok(r2.diagnostics.judged.every(j => j.outcome === 'used'));
});
