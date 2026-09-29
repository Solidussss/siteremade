'use strict';
// REGRESSION: the Business generator uses SiteRemade's starter/mockup visuals only (lib/premium/visual-mode.js).
//
// Production failure this pins: with PREMIUM_GENERATION_V1 on and an OpenAI key configured, buildImagePlan routed
// Business slots to generated images ("Estimated cost: 24 credits -- includes 11 premium visuals"), the generation then
// waited on /api/generate-image and the premium review's image repairs, and the final admission gate rejected the site
// ("The website could not be completed") -- e.g. for an unresolved slot or the editable "Your Business" placeholder.
//
// Everything below runs the REAL client orchestration (script.js runGeneration in a vm, with premium-core.js), the REAL
// server (test/helpers/run-server.js: only Claude / OpenAI / Supabase / Stripe stubbed) and the REAL export compiler.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { loadClient, premiumProviderStatus, fundedProviderStatus, buildProject } = require('./helpers/load-client');
const { mockPng } = require('./helpers/mock-image');
const { startServer, client: httpClient, providerCalls } = require('./helpers/server-process');
const { FIZZWELL_TEXT, FIZZWELL_PLAN, GREENLINE_TEXT } = require('./fixtures/businesses');
const projectStore = require('../lib/project-store');
const siteRender = require('../lib/site-render');

const flush = (n = 30) => new Promise(res => { let i = 0; const tick = () => (++i >= n ? res() : setTimeout(tick, 5)); tick(); });

// One full Generate through runGeneration. `imageRoute` answers /api/generate-image (it must never be asked).
async function generate({ text = FIZZWELL_TEXT, plan = { ok: true, plan: FIZZWELL_PLAN, creditsRemaining: 38 }, providerStatus = premiumProviderStatus(), imageRoute, review, uploads = [], before } = {}) {
  const calls = { image: 0, review: [], diagnostics: [] };
  const client = loadClient({
    fetchHandler(url, options) {
      if (url === '/api/plan-website') return plan;
      if (url === '/api/generate-image') { calls.image++; return imageRoute ? imageRoute(options) : { ok: true, dataUrl: mockPng('should never happen', '1:1') }; }
      if (url === '/api/premium/review-repair') { const body = JSON.parse(options.body); calls.review.push(body); return review ? review(body) : { ok: true, patch: null, acceptance: { accepted: true, blockers: [] } }; }
      if (url === '/api/generation-diagnostics') { calls.diagnostics.push(JSON.parse(options.body)); return { ok: true }; }
      // what the page itself loads: the provider status (as production reports it) and the account balance
      if (url === '/api/image-provider-status') return providerStatus;
      if (url === '/api/credits') return { ok: true, credits: { remaining: 40, generationCost: 2, plan: 'free' } };
      return { ok: false };
    },
  });
  client.ctx.__siteremadeImageProvider = providerStatus;
  client.ctx.__uploads = uploads;
  client.run(`currentAccount = { id: 'acct_test', email: 'x@example.com' }; latestCredits = { remaining: 40, generationCost: 2 };
    if (resolveAuthReady) { resolveAuthReady(); resolveAuthReady = null; }
    pendingUploads = window.__uploads.map((u, i) => ({ id: 'up' + i, type: u.type, dataUrl: u.dataUrl, name: u.name || ('photo-' + i + '.png') }));`);
  if (before) before(client);
  await client.run(`runGeneration(${JSON.stringify(text)})`);
  await flush();
  const direction = client.run('directions[0] || null');
  // the estimate the generation gate shows for this project
  const costLine = direction ? client.run('(latestCredits = { remaining: 38, generationCost: 2 }, estimatedCostLine(directions[0]))') : null;
  return { client, calls, direction, costLine, failure: client.run('window.__lastGenerationFailure || null') };
}
const starterSlots = d => d.imagePlan.filter(e => e.sourceType === 'designed');

// ---- A. no uploads -----------------------------------------------------------------------------------------------
test('A. a Business generation with no uploads finishes on starter visuals: zero image requests, zero image credits, admitted', async () => {
  const { direction, calls, costLine, failure, client } = await generate();
  assert.ok(direction, `admitted (failure: ${JSON.stringify(failure)})`);
  assert.equal(calls.image, 0, 'no /api/generate-image request');
  assert.equal(direction.imagePlan.filter(e => e.sourceType === 'generated').length, 0);
  assert.ok(direction.imagePlan.every(e => !e.creditCost && !e.model && !e.estimatedCostUsd), 'no image credit or route planned');
  assert.equal(costLine, 'Estimated cost: 2 credits', 'only the base website cost is estimated -- no "premium visuals"');
  assert.ok(direction.design.premium && direction.design.premium.vs, 'starter visuals are on for this site');
  assert.ok(starterSlots(direction).length > 0);
  // every non-hero visual slot renders the deterministic starter visual (hero layers draw their own art)
  const rendered = starterSlots(direction).filter(e => !e.storyboardLayer).map(e => client.run(`renderVisualSlot(directions[0], ${JSON.stringify(e.slot)}, directions[0].design.dimensions.imagery, null)`));
  assert.ok(rendered.length && rendered.every(h => /visual-starter/.test(h)), 'starter/mockup visuals fill the slots');
  // the review ran (structural/content review kept) without any generated-photo payload
  assert.equal(calls.review.length, 1);
  assert.deepEqual(calls.review[0].vision, [], 'no generated photos sent to the critic');
  assert.ok(!calls.review[0].direction.imagePlan.some(e => e.sourceType === 'generated'));
});

// ---- B. uploads --------------------------------------------------------------------------------------------------
test('B. uploaded pictures take their slots; starter visuals fill the rest; still no image request', async () => {
  const uploads = [{ type: 'hero', dataUrl: mockPng('owner hero photo', '16:9') }, { type: 'gallery', dataUrl: mockPng('owner gallery 1', '1:1') }, { type: 'gallery', dataUrl: mockPng('owner gallery 2', '1:1') }];
  const { direction, calls, failure } = await generate({ uploads });
  assert.ok(direction, `admitted (failure: ${JSON.stringify(failure)})`);
  assert.equal(calls.image, 0);
  assert.equal(direction.assets.items.length, 3, 'the uploads are on the project');
  const user = direction.imagePlan.filter(e => e.sourceType === 'user');
  assert.ok(user.length >= 1, 'uploaded pictures fill slots');
  assert.ok(starterSlots(direction).length >= 1, 'starter visuals fill the remaining slots');
  assert.equal(direction.imagePlan.filter(e => e.sourceType === 'generated').length, 0);
});

// ---- C / D / E. the image provider missing, out of billing, or broken ----------------------------------------------
const providerCases = [
  ['C. OpenAI API key missing', { providerStatus: premiumProviderStatus({ configured: false, provider: null, reason: 'No server-side image-generation API key is configured in this environment.' }) }],
  ['D. OpenAI billing exhausted', { imageRoute: () => ({ ok: false, configured: true, message: 'Could not generate image right now.', providerError: 'billing_hard_limit_reached' }) }],
  ['E. /api/generate-image forcibly returns 500', { imageRoute: () => ({ __status: 500, ok: false, message: 'Internal Server Error' }) }],
];
for (const [label, opts] of providerCases) {
  test(`${label}: Business generation still succeeds, because the route is never called`, async () => {
    const { direction, calls, failure } = await generate(opts);
    assert.ok(direction, `admitted (failure: ${JSON.stringify(failure)})`);
    assert.equal(calls.image, 0);
    assert.ok(starterSlots(direction).length > 0);
  });
}

test('the editable "Your Business" placeholder name never blocks admission', async () => {
  const { direction, calls, failure } = await generate({ text: 'A mobile dog grooming service that comes to your driveway, gentle with nervous dogs.', plan: { ok: false, message: 'The AI planner returned something unusable this time.', creditsRemaining: 38 } });
  assert.ok(direction, `admitted (failure: ${JSON.stringify(failure)})`);
  assert.equal(calls.image, 0);
});

test('the review cannot slip a generated picture in, and its verdict never blocks admission', async () => {
  const { direction, failure } = await generate({
    review: () => ({ ok: true, repaired: true, acceptance: { accepted: false, blockers: ['photo_set_incomplete'] }, patch: { generated: { hero: { status: 'ready', dataUrl: mockPng('smuggled', '16:9') } } } }),
  });
  assert.ok(direction, `admitted (failure: ${JSON.stringify(failure)})`);
  assert.ok(!Object.values(direction.assets.generated || {}).some(g => g.status === 'ready'), 'no generated picture applied');
  assert.equal(direction.design.premium.review.accepted, false, 'the verdict is recorded');
});

test('a website that is not admitted says exactly why: blockers, phase, starter mode -- on screen and in diagnostics', async () => {
  const { direction, calls, failure, client } = await generate({
    before: c => c.run(`validateProjectQuality = function (p) { return { ready: false, blockers: ['duplicate_section_ids'], unresolvedImageSlots: [], duplicateImageSlots: [], duplicateSectionIds: ['sec_x'], starterVisualsOnly: true }; }`),
  });
  assert.equal(direction, null, 'not admitted');
  assert.equal(calls.image, 0);
  assert.deepEqual(JSON.parse(JSON.stringify([failure.outcome, failure.phase, failure.starterVisualsOnly, failure.blockers, failure.duplicateSectionIds])), ['admission_rejected', 'admission', true, ['duplicate_section_ids'], ['sec_x']]);
  const sent = calls.diagnostics.find(d => d.outcome === 'admission_rejected');
  assert.ok(sent && sent.phase === 'admission' && sent.blockers.includes('duplicate_section_ids'), 'reported to the private diagnostics');
  assert.equal(client.run('project && project.meta && project.meta.isDemoShell') !== undefined, true);
});

test('an exception in the review step is reported with its phase instead of a silent failure', async () => {
  const { direction, failure } = await generate({ before: c => c.run(`premiumPreReveal = async function () { throw new Error('review exploded'); }`) });
  assert.equal(direction, null);
  assert.equal(failure.outcome, 'generation_failed'); assert.equal(failure.phase, 'review'); assert.match(failure.error, /review exploded/);
});

// ---- F. the server review never regenerates pictures for a Business direction ---------------------------------------
test('F. server: /api/premium/review-repair asked to repair failed photos of a Business site regenerates nothing and still completes the review', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sr-starter-review-'));
  const env = {
    SITEREMADE_BACKEND: 'local', SITEREMADE_DB_PATH: path.join(dir, 'app.db'), SITEREMADE_ASSET_STORE_DIR: path.join(dir, 'assets'), SITEREMADE_PREMIUM_LOG_DIR: path.join(dir, 'premium'),
    PREMIUM_GENERATION_V1: 'true', ANTHROPIC_API_KEY: 'test-only', OPENAI_API_KEY: 'test-only', SITEREMADE_PAID_IMAGES: 'true', SITEREMADE_IMAGE_BUDGET_USD: '5',
    MOCK_CALL_LOG: path.join(dir, 'calls.log'), STRIPE_SECRET_KEY: '', NODE_ENV: 'test',
  };
  // a real Business direction (built by the client), whose plan still claims two failed generated photos -- exactly
  // what used to make the review request replacement images
  const c = loadClient();
  const { proj } = buildProject(c, GREENLINE_TEXT, { providerStatus: premiumProviderStatus() });
  const d = JSON.parse(JSON.stringify(proj, (k, v) => (k === 'dataUrl' ? undefined : v)));
  d.imagePlan.slice(0, 2).forEach(e => { e.sourceType = 'generated'; e.model = 'gpt-image-1'; e.quality = 'high'; e.routeKind = 'premium'; e.prompt = 'a finished natural stone patio, no text'; d.assets.generated[e.slot] = { cacheKey: e.cacheKey, status: 'error', prompt: e.prompt }; });
  const server = await startServer(env);
  try {
    const call = httpClient(server.port);
    await call('POST', '/api/auth/signup', { email: 'starter-review@example.com', password: 'correct-horse-battery-staple' });
    const plan = await call('POST', '/api/plan-website', { text: GREENLINE_TEXT, generationId: 'gen_starterrev1', premiumGenerationId: 'gen_starterrev1' });
    assert.equal(plan.body.ok, true, JSON.stringify(plan.body).slice(0, 200));
    const r = await call('POST', '/api/premium/review-repair', { generationId: 'gen_starterrev1', direction: d, description: GREENLINE_TEXT, categoryKey: proj.business.categoryKey });
    assert.equal(r.body.ok, true, JSON.stringify(r.body).slice(0, 300));
    assert.deepEqual(r.body.patch.generated, {}, 'no replacement picture');
    assert.ok(!(r.body.actions || []).some(a => a.kind === 'regenerate_image'), 'no image regeneration action executed');
    assert.ok(r.body.after, 'the structural/content review still completed');
    assert.ok(!((r.body.acceptance && r.body.acceptance.blockers) || []).some(b => /photo_set_incomplete|photo_led_mostly_starter_art/.test(b)), 'missing generated photos are never an acceptance blocker');
  } finally { await server.stop(); }
  assert.equal(providerCalls(env.MOCK_CALL_LOG).filter(x => x.provider === 'openai').length, 0, 'the image provider was never called');
  fs.rmSync(dir, { recursive: true, force: true });
});

// ---- G. export = preview ------------------------------------------------------------------------------------------
test('G. the exported purchased site carries the same starter/mockup visuals the preview showed', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sr-starter-export-'));
  process.env.SITEREMADE_BACKEND = 'local'; process.env.SITEREMADE_ASSET_STORE_DIR = path.join(dir, 'assets');
  const { getDatabaseAdapter } = require('../lib/adapters/database-adapter');
  const { compileExport } = require('../lib/export-compiler');
  const db = getDatabaseAdapter(':memory:');
  for (const text of [FIZZWELL_TEXT, GREENLINE_TEXT, 'Stackwise is a developer platform for API monitoring and alerting.']) {
    const c = loadClient();
    const { proj } = buildProject(c, text, { providerStatus: premiumProviderStatus() });
    c.ctx.__p = proj; c.run('project = window.__p; renderProject(project)');
    assert.ok(proj.design.premium && proj.design.premium.vs, `${text.slice(0, 20)}: starter visuals on`);
    const saved = projectStore.validateDirectionsState({ directions: [JSON.parse(JSON.stringify(proj))], activeDirectionIndex: 0 }).normalized.directions[0];
    assert.ok(saved.design.premium && saved.design.premium.vs, 'the starter marker survives the save');
    const strip = h => String(h).replace(/<button type="button" class="starter-replace"[^>]*>Replace<\/button>/g, '');
    for (const e of starterSlots(proj).filter(x => !x.storyboardLayer)) {
      const preview = strip(c.run(`renderVisualSlot(project, ${JSON.stringify(e.slot)}, project.design.dimensions.imagery, null)`));
      const exported = siteRender.renderVisualSlot(saved, e.slot, saved.design.dimensions.imagery, null);
      assert.ok(/visual-starter/.test(preview), `${e.slot}: a starter visual in the preview`);
      assert.equal(exported, preview, `${e.slot}: the export draws the identical starter visual`);
    }
    const norm = h => h.replace(/\s+/g, ' ').trim();
    assert.equal(norm(siteRender.renderHero(saved, siteRender.categoryFor(saved))), norm(c.run('renderHero(project, categories[project.business.categoryKey])')), 'the hero (starter/drawn art) is identical in the export');
    const workDir = path.join(dir, 'export-' + proj.business.categoryKey);
    compileExport(db, { project: { id: 'p1', revision: 1, directionsState: { directions: [saved], activeDirectionIndex: 0 } }, directionIndex: 0, workDir });
    const html = fs.readdirSync(workDir).filter(f => f.endsWith('.html')).map(f => fs.readFileSync(path.join(workDir, f), 'utf8')).join('\n');
    assert.ok(/visual-starter|data-source="art"/.test(html), 'the exported pages contain the starter visuals');
    assert.ok(!/starter-replace/.test(html), 'the preview-only Replace control is never exported');
  }
  fs.rmSync(dir, { recursive: true, force: true });
});

// ---- the review's own repairs never make a site inadmissible ----------------------------------------------------------
test('re-planning a photo-led layout (the server review does) never places one section twice', () => {
  const P = require('../lib/premium');
  for (const text of [FIZZWELL_TEXT, 'Wild Rose Yoga is a yoga studio in Calgary with small classes, mobility and recovery sessions.']) {
    const c = loadClient();
    const { proj } = buildProject(c, text, { providerStatus: premiumProviderStatus(), claudePlanRaw: text === FIZZWELL_TEXT ? FIZZWELL_PLAN : null });
    const g = P.grounding.deriveGrounding({ description: text, categoryKey: proj.business.categoryKey });
    let d = JSON.parse(JSON.stringify(proj));
    for (let i = 0; i < 3; i++) d = P.editorial.planLayout(d, g, text).direction;
    const ids = d.pages.flatMap(p => p.sections.map(s => s.id));
    assert.deepEqual(ids.filter((x, k) => ids.indexOf(x) !== k), [], `${text.slice(0, 20)}: duplicate section ids after re-planning`);
  }
});
