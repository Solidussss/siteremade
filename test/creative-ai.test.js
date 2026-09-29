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
