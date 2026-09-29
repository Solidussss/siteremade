'use strict';
// The multi-image moving hero (lib/premium/hero-storyboard.js), proved through
// the REAL client (script.js in a vm with premium-core.js, as on the page), the
// REAL export renderer, the REAL save validator and the REAL server -- with
// every image and planner response mocked (no provider call of any kind).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { HERO_MATRIX, PLANNED } = require('./fixtures/hero-matrix');
const F = require('./fixtures/businesses');
const { buildHeroFixture } = require('./helpers/hero-matrix-build');
const { loadClient, fundedProviderStatus, premiumProviderStatus, buildProject } = require('./helpers/load-client');
const { startServer, client, providerCalls } = require('./helpers/server-process');
const S = require('../lib/premium/hero-storyboard');
const siteRender = require('../lib/site-render');
const projectStore = require('../lib/project-store');

const CSS = fs.readFileSync(path.join(__dirname, '..', 'styles.css'), 'utf8');
const plain = v => JSON.parse(JSON.stringify(v));
const saveRoundTrip = proj => projectStore.validateDirectionsState({ directions: [plain(proj)], activeDirectionIndex: 0 }).normalized.directions[0];
const ctxOf = proj => ({ categoryKey: proj.business.categoryKey, name: proj.business.name, offerings: proj.business.offerings, text: proj.source.text });

let builtCache = null;
async function built() {
  if (builtCache) return builtCache;
  builtCache = {};
  for (const f of HERO_MATRIX.concat(PLANNED)) builtCache[f.id] = { fixture: f, ...(await buildHeroFixture(f)) };
  return builtCache;
}
// the rendered layers of one hero: slot, what it shows (an image src, or the drawn art kind), and its own motion track
function layersOf(html) {
  return [...html.matchAll(/<figure class="sb-layer[^"]*" data-slot="([^"]+)" data-motion="([^"]+)" data-reveal="[^"]+" data-source="(image|art)"(?: data-art="([^"]+)")? style="([^"]+)">([\s\S]*?)<\/figure>/g)]
    .map(m => ({ slot: m[1], motion: m[2], source: m[3], art: m[4] || null, style: m[5], src: m[3] === 'image' ? (m[6].match(/src="([^"]+)"/) || [])[1] : `art:${m[4]}`, track: (m[5].match(/--fx:[^;]+;--fy:[^;]+;--fs:[^;]+;--fr:[^;]+;--tx:[^;]+;--ty:[^;]+;--ts:[^;]+;--tr:[^;]+/) || [''])[0], delay: (m[5].match(/--delay:([^;]+)/) || [])[1] }));
}

test('the fixture matrix covers EVERY category the generator supports, each fixture classified by the real classifier', () => {
  const c = loadClient();
  const categories = Object.keys(c.run('categories'));
  const covered = new Set();
  HERO_MATRIX.forEach(f => {
    const got = c.ctx.analyzeDescription(f.text).categoryKey;
    assert.equal(got, f.category, `${f.id} classified as ${got}`);
    covered.add(got);
  });
  assert.deepEqual(categories.filter(k => !covered.has(k)), [], 'categories without a hero fixture');
  assert.ok(HERO_MATRIX.length >= categories.length + 10, 'plus several same-category businesses');
});

test('every Business hero has at least three visuals, each drawn by SiteRemade with its own motion track -- no layer is ever a generated image', async () => {
  const all = await built();
  for (const [id, b] of Object.entries(all)) {
    const sb = b.proj.heroStoryboard;
    assert.ok(sb && sb.layers.length >= 3, `${id}: storyboard with 3+ layers`);
    assert.equal(new Set(sb.layers.map(l => l.slot)).size, sb.layers.length, `${id}: one slot per layer`);
    // the Business generator (lib/premium/visual-mode.js): no hero layer is requested or planned as a generated image
    assert.equal(b.requests.length, 0, `${id}: no image requested`);
    const entries = b.proj.imagePlan.filter(e => e.storyboardLayer);
    assert.ok(entries.length && entries.every(e => e.sourceType === 'designed' && !e.creditCost), `${id}: every photo layer is a designed (drawn) visual at no cost`);
    // rendered: every layer drawn as its own deterministic art, with its own motion
    const layers = layersOf(b.heroHtml());
    assert.ok(layers.length >= 3, `${id}: ${layers.length} layers rendered`);
    assert.equal(layers.length, sb.layers.length, `${id}: every layer rendered`);
    assert.ok(layers.every(l => l.source === 'art' && l.art), `${id}: every layer is drawn art`);
    assert.equal(new Set(layers.map(l => `${l.track}|${l.delay}`)).size, layers.length, `${id}: every layer has its own motion track and phase`);
    layers.forEach(l => assert.ok(l.track && /--tx:/.test(l.track), `${id}: ${l.slot} carries a frame track`));
  }
});

test('every hero image subject fits the business and its industry', async () => {
  const all = await built();
  for (const [id, b] of Object.entries(all)) {
    b.proj.heroStoryboard.layers.forEach(l => {
      const r = S.relevance(`${l.subject}. ${l.prompt}`, ctxOf(b.proj));
      assert.ok(r.ok, `${id}: "${l.subject}" is not recognisably this business/industry`);
    });
  }
  // spot checks that read as the business, not a template
  const lead = id => all[id].proj.heroStoryboard.layers[0];
  assert.match(lead('fizzwell').prompt, /\bcans?\b/i);
  assert.match(lead('greenline').prompt, /\b(yard|patio|garden)\b/i);
  assert.match(lead('harbour-physio').prompt, /physiotherapist/i);
  assert.match(lead('fern-flint').prompt, /\bbeans\b/i, 'a roaster leads with its beans');
  assert.match(lead('little-fern').prompt, /interior of a neighbourhood caf/i, 'a café leads with its room');
  assert.match(lead('mirror-finish').prompt, /\bcar\b/i);
  assert.match(lead('stackwise').prompt, /developer workspace/i);
  assert.match(all['tide-tonic'].proj.heroStoryboard.conceptId, /^drink-/, 'a drinks maker the classifier could not place still gets a drinks hero');
});

test('an off-industry, incomplete or repetitive planner storyboard is rejected and replaced by a real fallback', async () => {
  const off = await buildHeroFixture({ text: F.GREENLINE_TEXT, plan: { ...F.GREENLINE_PLAN, heroStoryboard: F.OFF_INDUSTRY_STORYBOARD } });
  assert.equal(off.proj.heroStoryboard.source, 'fallback');
  assert.match(off.proj.heroStoryboard.fallbackReason, /off-industry for landscaping/);
  assert.ok(off.proj.heroStoryboard.layers.every(l => !/laptop|dashboard|spreadsheet|handshake/i.test(l.prompt)));
  const ctx = ctxOf(off.proj);
  const good = F.GREENLINE_PLAN.heroStoryboard;
  const two = { ...good, layers: good.layers.slice(0, 2) };
  assert.match(S.validatePlanned(two, ctx).problems.join(' '), /at least 3 image layers/);
  const dup = { ...good, layers: [good.layers[0], { ...good.layers[1], subject: good.layers[0].subject, prompt: good.layers[0].prompt }, good.layers[2]] };
  assert.match(S.validatePlanned(dup, ctx).problems.join(' '), /same picture/);
  const noLead = { ...good, layers: good.layers.map(l => ({ ...l, role: 'detail' })) };
  assert.match(S.validatePlanned(noLead, ctx).problems.join(' '), /exactly one lead/);
  assert.match(S.validatePlanned({ ...good, composition: 'grid-of-nine' }, ctx).problems.join(' '), /unknown composition/);
});

test('the planner schema offers exactly the compositions, roles, motions and pans the renderer knows', () => {
  const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  const block = server.slice(server.indexOf('heroStoryboard: {'), server.indexOf("offset: { type: 'number'"));
  const enumOf = key => JSON.parse(block.match(new RegExp(`${key}: \\{ type: 'string', enum: (\\[[^\\]]+\\])`))[1]);
  assert.deepEqual(enumOf('composition'), S.COMPOSITION_KEYS);
  assert.deepEqual(enumOf('role'), S.ROLES);
  assert.deepEqual(enumOf('anchor'), S.ANCHORS);
  assert.deepEqual(enumOf('aspectRatio'), S.ASPECTS);
  assert.deepEqual(enumOf('motion'), S.MOTION_KEYS);
  assert.deepEqual(enumOf('pan'), S.PAN_KEYS);
  // every composition places every anchor on desktop and phone, inside the stage
  for (const key of S.COMPOSITION_KEYS) for (const a of S.ANCHORS) {
    const p = S.placementFor(key, a);
    for (const r of [p.d, p.m]) { assert.equal(r.length, 4); assert.ok(r[0] >= 0 && r[1] >= 0 && r[0] + r[2] <= 100 && r[1] + r[3] <= 100, `${key}/${a} leaves the stage`); }
  }
});

test('the Claude-planned path and the fallback path both produce the multi-image hero', async () => {
  const all = await built();
  for (const p of PLANNED) {
    const sb = all[p.id].proj.heroStoryboard;
    assert.equal(sb.source, 'planner', `${p.id}: the planner's storyboard was used`);
    assert.equal(sb.composition, p.plan.heroStoryboard.composition);
    assert.deepEqual(plain(sb.layers.map(l => l.subject)), p.plan.heroStoryboard.layers.map(l => l.subject).sort((a, b) => (a === p.plan.heroStoryboard.layers.find(x => x.role === 'lead').subject ? -1 : 0) - (b === p.plan.heroStoryboard.layers.find(x => x.role === 'lead').subject ? -1 : 0)));
    assert.ok(layersOf(all[p.id].heroHtml()).length >= 3);
  }
  for (const f of HERO_MATRIX) {
    assert.equal(all[f.id].proj.heroStoryboard.source, 'fallback', `${f.id}: no planner -> fallback`);
    assert.ok(all[f.id].proj.heroStoryboard.layers.length >= 3);
  }
  // same business, planned vs fallback: genuinely different storyboards
  assert.notDeepEqual(plain(all['fizzwell-claude'].proj.heroStoryboard.layers.map(l => l.subject)), plain(all.fizzwell.proj.heroStoryboard.layers.map(l => l.subject)));
});

test('businesses in the same category get different concepts, image sets, compositions and motion', async () => {
  const all = await built();
  const groups = {};
  HERO_MATRIX.forEach(f => (groups[f.category] = groups[f.category] || []).push(f.id));
  const signature = sbv => { const sb = plain(sbv); return { concept: sb.conceptId, composition: sb.composition, subjects: sb.layers.map(l => l.subject), motion: sb.layers.map(l => `${l.anchor}:${l.motion.path}:${l.motion.amount}`).join(',') }; };
  let fullyDifferentPairs = 0;
  for (const ids of Object.values(groups)) {
    for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
      const a = signature(all[ids[i]].proj.heroStoryboard), b = signature(all[ids[j]].proj.heroStoryboard);
      assert.notEqual(a.concept, b.concept, `${ids[i]} vs ${ids[j]}: same concept`);
      // two businesses that both list the same service may both show it -- but never the same lead, never the same set
      const shared = a.subjects.filter(s => b.subjects.includes(s));
      assert.ok(shared.length <= 1 && a.subjects[0] !== b.subjects[0], `${ids[i]} vs ${ids[j]}: shared image subjects ${shared.join(', ')}`);
      assert.ok(a.composition !== b.composition || a.motion !== b.motion, `${ids[i]} vs ${ids[j]}: identical composition AND motion`);
      if (a.composition !== b.composition && a.motion !== b.motion) fullyDifferentPairs++;
    }
  }
  assert.ok(fullyDifferentPairs >= 10, `only ${fullyDifferentPairs} same-category pairs differ in both composition and motion`);
  // across the WHOLE matrix no two businesses were sent the same image prompts
  const promptSets = Object.values(all).map(b => b.proj.heroStoryboard.layers.map(l => l.prompt).join('|'));
  assert.equal(new Set(promptSets).size, promptSets.length);
});

test('the storyboard survives a save, and the preview and the export render the identical hero', async () => {
  const all = await built();
  const norm = h => h.replace(/\s+/g, ' ').trim();
  for (const [id, b] of Object.entries(all)) {
    const saved = saveRoundTrip(b.proj);
    assert.deepEqual(saved.heroStoryboard, plain(b.proj.heroStoryboard), `${id}: storyboard changed on save`);
    assert.equal(norm(siteRender.renderHero(saved, siteRender.categoryFor(saved))), norm(b.heroHtml()), `${id}: preview and export heroes differ`);
  }
});

test('every layer has a composed phone placement; the copy area is never covered', async () => {
  const all = await built();
  for (const [id, b] of Object.entries(all)) {
    const sb = b.proj.heroStoryboard;
    S.resolveLayers(sb).forEach(l => {
      [l.desktop, l.mobile].forEach(([x, y, w, h]) => {
        assert.ok(x >= 0 && y >= 0 && w > 10 && h > 10 && x + w <= 100.5 && y + h <= 100.5, `${id}: ${l.slot} placed outside its stage`);
      });
      // full-bleed compositions keep the copy corner (bottom-left) clear of the supporting frames
      if (sb.copySafe === 'bottom-left' && l.anchor !== 'lead') assert.ok(l.desktop[0] >= 55, `${id}: ${l.slot} would sit over the copy`);
    });
  }
  // the phone layout swaps every layer onto its own phone rectangle
  assert.match(CSS, /@container site \(max-width:700px\)\{[\s\S]*?\.hero-storyboard \.sb-layer\{left:calc\(var\(--mx\) \* 1%\);top:calc\(var\(--my\) \* 1%\);width:calc\(var\(--mw\) \* 1%\);height:calc\(var\(--mh\) \* 1%\)\}/);
});

test('reduced motion: every image stays visible, at rest in its composed position; the loop is seamless', () => {
  const reduced = CSS.slice(CSS.lastIndexOf('@media (prefers-reduced-motion:reduce){'));
  assert.match(reduced, /\.hero-storyboard \.sb-layer,\.hero-storyboard \.sb-media\{animation:none!important;transform:none!important\}/);
  assert.match(reduced, /\.hero-storyboard \.sb-frame\{animation:none!important;clip-path:none!important;opacity:1!important\}/);
  // no layer is hidden at rest: only the one-shot reveal animation starts from opacity 0
  assert.ok(!/\.sb-layer\{[^}]*opacity:0/.test(CSS) && !/\.sb-frame\{[^}]*opacity:0/.test(CSS));
  // every layer uses the same keyframes, which start and end on the same frame, on one shared loop length
  assert.match(CSS, /@keyframes sb-track\{0%,100%\{transform:translate3d\(var\(--fx\),var\(--fy\),0\) scale\(var\(--fs\)\) rotate\(var\(--fr\)\)\}50%/);
  assert.match(CSS, /\.hero-storyboard \.sb-layer\{[^}]*animation:sb-track var\(--sb-loop\)[^}]*infinite/);
  // the headline never moves on a loop
  assert.ok(!/\.sb-copy[^{]*\{[^}]*animation:[^}]*infinite/.test(CSS));
});

test('the hero never buys an image, whatever the budget, prices, credits or premium flag say', async () => {
  const twelve = { low: 0.12, medium: 0.12, high: 0.12 };
  const statuses = [
    fundedProviderStatus(),
    fundedProviderStatus({ costEstimateUsd: { 'gpt-image-1-mini': twelve, 'gpt-image-1': twelve }, budgetUsd: 100, heroBudgetUsd: 100 }),
    premiumProviderStatus(),
  ];
  for (const status of statuses) {
    for (const credits of [3, 500]) {
      const b = await buildHeroFixture({ text: F.GREENLINE_TEXT }, { providerStatus: status, credits });
      const hero = b.proj.imagePlan.filter(e => e.storyboardLayer);
      assert.ok(hero.length >= 3 && hero.every(e => e.sourceType === 'designed' && !e.estimatedCostUsd && !e.creditCost), 'every hero layer is drawn, at no cost');
      assert.equal(b.requests.length, 0, 'no image requested');
    }
  }
});

test('server: a hero image request for a Business site is refused before any credit or provider call', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sr-hero-budget-'));
  const env = {
    SITEREMADE_BACKEND: 'local', SITEREMADE_DB_PATH: path.join(dir, 'app.db'), SITEREMADE_ASSET_STORE_DIR: path.join(dir, 'assets'), SITEREMADE_PREMIUM_LOG_DIR: path.join(dir, 'premium'),
    OPENAI_API_KEY: 'mock-only', SITEREMADE_PAID_IMAGES: 'true', SITEREMADE_IMAGE_BUDGET_USD: '0.02', MOCK_CALL_LOG: path.join(dir, 'calls.log'), STRIPE_SECRET_KEY: '', NODE_ENV: 'test',
  };
  const server = await startServer(env);
  try {
    const call = client(server.port);
    const signup = await call('POST', '/api/auth/signup', { email: 'hero-budget@example.com', password: 'correct-horse-battery-staple' });
    assert.equal(signup.status, 200, JSON.stringify(signup.body));
    const status = await call('GET', '/api/image-provider-status');
    assert.ok(status.body.heroBudgetUsd >= 0.21 + 2 * 0.021 - 1e-9, `hero allowance ${status.body.heroBudgetUsd} cannot fund a lead + two supporting images`);
    assert.equal(status.body.heroMinImages, 3);
    const before = (await call('GET', '/api/credits')).body.credits.remaining;
    const req = (slot, extra) => call('POST', '/api/generate-image', { prompt: `Greenline Landscapes backyard ${slot}, garden detail, no text`, aspectRatio: '4:5', model: 'gpt-image-1-mini', quality: 'medium', projectId: 'proj_budget', requestKey: `proj_budget::${slot}::k`, ...extra });
    for (const slot of ['hero', 'hero-2', 'hero-3']) {
      const r = await req(slot, { heroLayer: true });
      assert.equal(r.body.ok, false); assert.equal(r.body.starterVisualsOnly, true, `${slot}: ${JSON.stringify(r.body)}`); assert.equal(r.body.creditsCharged, 0);
    }
    assert.equal((await call('GET', '/api/credits')).body.credits.remaining, before, 'no credit reserved or charged');
  } finally { await server.stop(); }
  assert.equal(providerCalls(env.MOCK_CALL_LOG).filter(c => c.provider === 'openai').length, 0, 'the image provider is never called');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('server: a project carrying several generated images saves (the 900kb parser used to reject it with a 413)', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sr-bigsave-'));
  const env = { SITEREMADE_BACKEND: 'local', SITEREMADE_DB_PATH: path.join(dir, 'app.db'), SITEREMADE_ASSET_STORE_DIR: path.join(dir, 'assets'), SITEREMADE_PREMIUM_LOG_DIR: path.join(dir, 'premium'), STRIPE_SECRET_KEY: '', NODE_ENV: 'test' };
  const b = await buildHeroFixture({ text: F.FIZZWELL_TEXT }, { savedImages: true }); // a project saved with its pictures
  const body = { name: 'Fizzwell', directionsState: { directions: [plain(b.proj)], activeDirectionIndex: 0 } };
  assert.ok(JSON.stringify(body).length > 900 * 1024, 'precondition: bigger than the generic parser limit');
  const server = await startServer(env);
  try {
    const call = client(server.port);
    await call('POST', '/api/auth/signup', { email: 'big-save@example.com', password: 'correct-horse-battery-staple' });
    const created = await call('POST', '/api/projects', body);
    assert.equal(created.status, 201, JSON.stringify(created.body || {}).slice(0, 200));
    const got = await call('GET', `/api/projects/${created.body.project.id}`);
    const d = got.body.project.directionsState.directions[0];
    assert.ok(d.heroStoryboard && d.heroStoryboard.layers.length >= 3);
    d.heroStoryboard.layers.forEach(l => assert.ok(d.assets.generated[l.slot] && d.assets.generated[l.slot].dataUrl, `${l.slot} image stored and returned`));
    const small = await call('POST', '/api/auth/signin', { email: 'big-save@example.com', password: 'x'.repeat(2 * 1024 * 1024) });
    assert.equal(small.status, 413, 'every other route keeps the small body limit');
  } finally { await server.stop(); }
  fs.rmSync(dir, { recursive: true, force: true });
});

test('no real provider call happens anywhere in the tests or the review harness', async () => {
  // the client harness answers every request itself -- there is no network in the vm
  const b = await buildHeroFixture({ text: F.FIZZWELL_TEXT });
  assert.ok(b.requests.length === 0 && b.client.fetchCalls.every(c => c.url.startsWith('/')), 'only relative same-origin calls, all answered by the mock -- and no image request at all');
  // the server harness intercepts both paid providers at the network edge and logs every call it answers
  const runner = fs.readFileSync(path.join(__dirname, 'helpers', 'run-server.js'), 'utf8');
  assert.match(runner, /u\.startsWith\('https:\/\/api\.openai\.com\/'\)/);
  assert.match(runner, /u\.startsWith\('https:\/\/api\.anthropic\.com\/'\)/);
  // no test, fixture or review script carries anything that looks like a real key
  const files = [];
  const walk = d => fs.readdirSync(d, { withFileTypes: true }).forEach(e => { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (/\.js$/.test(e.name)) files.push(p); });
  walk(__dirname);
  files.forEach(f => assert.ok(!/\b(sk-[A-Za-z0-9_-]{20,}|sk-ant-[A-Za-z0-9_-]{10,})/.test(fs.readFileSync(f, 'utf8')), `${path.basename(f)} contains a key-like string`));
});
