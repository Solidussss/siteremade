'use strict';
// OWNERSHIP + CREDITS, end to end on the REAL server.js route table (test/helpers/run-server.js): only Claude, OpenAI,
// SerpApi, Higgsfield, Stripe and Supabase's token check are stubbed at the network edge, and the client app's signed
// billing endpoint (legacy Workspace subscriptions) is a small local server here. Nothing is charged, no real provider is
// called ($0 of provider spend).
//
// The product: buy the website once (Business $149.99 CAD, Creative $499.99 CAD), own it permanently; credits pay for
// SiteRemade's AI and media work (packs of 10 / 30 / 75 / 200; 30 bonus credits with the first purchased website; a
// one-time trial). No subscription is required or sold. Business generation 4; Creative 6 (8 with the spatial layer);
// updates by size 1-5; premium media +1 / +3 / +5. Dynamic work is quoted and confirmed before anything paid runs.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const { startServer, client, providerCalls } = require('./helpers/server-process');
const { loadClient, fundedProviderStatus, buildProject, seedSavedImages } = require('./helpers/load-client');
const { mockPng } = require('./helpers/mock-image');
const { signBody } = require('../lib/billing');

const SECRET = 'test-billing-secret';
const WEBHOOK_SECRET = 'whsec_test_mock';
const TEXT = 'Glow Theory is an online skincare store in Vancouver selling gentle cleansers, serums and moisturizers for sensitive skin.';
const BRIEF = 'An imaginary kingdom run entirely by cats'; // invented: no encyclopedia lookup, no network

// ---- the client app's signed billing endpoint (what the real app answers from its workspace + Stripe records)
function mockApp() {
  const state = { entitlement: null, calls: 0, rejected: 0, bodies: [] };
  const server = http.createServer((req, res) => {
    let body = ''; req.on('data', d => { body += d; });
    req.on('end', () => {
      if (req.method !== 'POST' || req.url !== '/api/internal/billing/entitlement') { res.writeHead(404); return res.end('{}'); }
      const ts = req.headers['x-siteremade-timestamp']; const sig = String(req.headers['x-siteremade-signature'] || '');
      const want = signBody(SECRET, ts, body);
      if (sig.length !== want.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(want))) { state.rejected++; res.writeHead(401, { 'content-type': 'application/json' }); return res.end('{"ok":false}'); }
      state.calls++; state.bodies.push(JSON.parse(body));
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true, entitlement: state.entitlement }));
    });
  });
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve({ state, url: `http://127.0.0.1:${server.address().port}`, close: () => new Promise(r => server.close(r)) })));
}

function envFor(dir, extra) {
  return Object.assign({
    SITEREMADE_BACKEND: 'local', SITEREMADE_DB_PATH: path.join(dir, 'app.db'), SITEREMADE_ASSET_STORE_DIR: path.join(dir, 'assets'),
    SITEREMADE_PREMIUM_LOG_DIR: path.join(dir, 'premium'), SITEREMADE_EXPORTS_DIR: path.join(dir, 'exports'),
    ANTHROPIC_API_KEY: 'test-only', OPENAI_API_KEY: 'test-only', SITEREMADE_PAID_IMAGES: 'true', SITEREMADE_IMAGE_BUDGET_USD: '5',
    SITEREMADE_APP_BRIDGE_ENABLED: 'true', SITEREMADE_IDENTITY_BRIDGE_MODE: 'full',
    SUPABASE_URL: 'https://supabase.test', SUPABASE_ANON_KEY: 'test-anon-key', SUPABASE_PUBLISHABLE_KEY: '',
    STRIPE_SECRET_KEY: '', STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET, SITEREMADE_BILLING_SECRET: SECRET, SITEREMADE_BILLING_CACHE_MS: '0',
    SITEREMADE_TESTER_EMAILS: '', PREMIUM_GENERATION_V1: 'false',
    MOCK_CALL_LOG: path.join(dir, 'provider-calls.log'), NODE_ENV: 'test',
  }, extra);
}
async function withServer(extra, fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sr-billing-'));
  const app = await mockApp();
  const env = envFor(dir, Object.assign({ SITEREMADE_APP_URL: app.url }, extra));
  const server = await startServer(env);
  const calls = () => providerCalls(env.MOCK_CALL_LOG);
  try { await fn({ port: server.port, app, calls, env, dir }); }
  finally { await server.stop(); await app.close(); fs.rmSync(dir, { recursive: true, force: true }); }
}
let seq = 0;
async function signUp(port) {
  const call = client(port);
  const r = await call('POST', '/api/auth/signup', { email: `billing-${process.pid}-${Date.now()}-${seq++}@example.com`, password: 'correct-horse-battery-staple' });
  assert.ok(r.status === 200 || r.status === 201, JSON.stringify(r.body));
  return call;
}
// an app user (Supabase identity) signed into the builder through the identity bridge -- the account that owns the plan
async function appUser(port, token = 'test-access-token-1') {
  const call = client(port);
  const r = await call('POST', '/api/identity/supabase/session', { supabaseAccessToken: token });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  return call;
}
const balance = async call => (await call('GET', '/api/credits')).body.credits;
const anthropic = (calls, tool) => calls().filter(c => c.provider === 'anthropic' && (!tool || c.tool === tool)).length;
const openai = calls => calls().filter(c => c.provider === 'openai').length;
const DAY = 86400000;
const period = (fromDays, toDays) => ({ periodStart: new Date(Date.now() + fromDays * DAY).toISOString(), periodEnd: new Date(Date.now() + toDays * DAY).toISOString() });

// a saved Business direction carrying the pictures a site saved before the starter-visual rule has (so an app AI
// update could ask to regenerate its hero -- which a Business site never does)
async function businessDirection() {
  const c = loadClient({ fetchHandler: () => new Promise(() => {}) });
  const { proj } = buildProject(c, TEXT, { providerStatus: fundedProviderStatus() });
  seedSavedImages(proj, mockPng);
  return JSON.parse(JSON.stringify(proj));
}
// a finished Creative page (the built-in director, synthetic pictures)
function creativeDirection() {
  const { assess, capabilities } = require('../lib/creative/assets');
  const { direct } = require('../lib/creative/director');
  const { understandBrief } = require('../lib/creative/understand');
  const png = require('../lib/creative/png');
  const w = 160, h = 120, data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) data.set([(i * 37) % 255, (i * 53) % 255, (i * 29) % 255, 255], i * 4);
  const img = { width: w, height: h, data };
  const assets = ['r1', 'r2', 'r3'].map(id => { const a = { id, origin: 'research', title: `File:${id}.png`, relevance: 1, author: 'A. Photographer', license: 'CC BY-SA 4.0', pageUrl: `https://commons.wikimedia.org/wiki/File:${id}.png`, assess: assess(img) }; a.caps = capabilities(a); return a; });
  const u = understandBrief('A website about toilet paper — make it grand and a bit absurd');
  const facts = [{ id: 'f1', text: 'Toilet paper is a tissue paper product used for cleaning.', section: 'Overview' }, { id: 'f2', text: 'Most rolls are wound around a cardboard tube.', section: 'Design' }];
  const plan = direct({ understanding: u, research: { page: { title: 'Toilet paper', url: 'https://en.wikipedia.org/wiki/Toilet_paper', description: 'Tissue paper product', extract: 'Toilet paper is a tissue paper product.', category: 'object', retrieved: '2026-09-28' }, facts }, assets });
  const withPixels = assets.map(a => Object.assign({}, a, { dataUrl: `data:image/png;base64,${png.encode(img).toString('base64')}`, mime: 'image/png' }));
  return { mode: 'creative', meta: { id: 'creative_test' }, pages: [{ id: 'creative', label: 'Creative page', sections: [] }], creative: { brief: 'toilet paper', understanding: u, assets: withPixels, plan } };
}
async function saveProject(call, name, direction) {
  const r = await call('POST', '/api/projects', { name, directionsState: { directions: [direction], activeDirectionIndex: 0 } });
  assert.ok(r.status === 200 || r.status === 201, JSON.stringify(r.body));
  return r.body.project;
}
// The export route compiled the purchased website. (Packaging it as a .zip needs the system `zip` tool, which the
// production image has; a test machine without it gets the compiled website's deployment row with the archive step
// failed -- the purchase gate, which is what these tests are about, has been passed either way.)
function exportedDeployment(r) {
  if (r.status === 201) return r.body;
  const zipMissing = r.status === 500 && r.body && r.body.deployment && /zip ENOENT/.test(r.body.deployment.failureReason || '');
  assert.ok(zipMissing, `export was not unlocked: ${r.status} ${JSON.stringify(r.body).slice(0, 300)}`);
  return { deployment: r.body.deployment, manifest: r.body.deployment.manifest };
}
function stripeEvent(port, type, session) {
  const body = JSON.stringify({ id: 'evt_' + crypto.randomBytes(6).toString('hex'), type, data: { object: session } });
  const t = Math.floor(Date.now() / 1000);
  const sig = crypto.createHmac('sha256', WEBHOOK_SECRET).update(`${t}.${body}`).digest('hex');
  return fetch(`http://127.0.0.1:${port}/api/stripe/webhook`, { method: 'POST', headers: { 'content-type': 'application/json', 'stripe-signature': `t=${t},v1=${sig}` }, body }).then(async r => ({ status: r.status, body: await r.json().catch(() => null) }));
}

const { research } = require('./helpers/server-process');
const bearer = token => ({ authorization: `Bearer ${token || 'test-access-token-1'}` });
const stripeSessions = calls => calls().filter(c => c.provider === 'stripe' && c.endpoint === 'checkout');
const paidEvent = (port, session, amount, pi) => stripeEvent(port, 'checkout.session.completed', { id: session, payment_status: 'paid', amount_total: amount, currency: 'cad', payment_intent: pi });
const refundEvent = (port, pi, amount) => stripeEvent(port, 'charge.refunded', { id: 'ch_' + crypto.randomBytes(4).toString('hex'), payment_intent: pi, amount, amount_refunded: amount });
const history = async call => (await call('GET', '/api/credits/history')).body.events;

// ------------------------------------------------------------------------------------------------ credits, not plans
test('credits, not plans: a new account has its one-time trial; a Business website costs 4; the next is refused before any model call', async () => {
  await withServer({}, async ({ port, calls }) => {
    const call = await signUp(port);
    const start = await balance(call);
    assert.equal(start.plan, 'credits'); assert.equal(start.remaining, 6); assert.equal(start.trial.oneTime, true); assert.equal(start.subscription, null);
    assert.deepEqual([start.costs.businessGeneration, start.costs.creativePage, start.costs.aiUpdate, start.costs.imageSupport, start.costs.imagePremium, start.costs.manualEdit], [4, 6, 1, 1, 2, 0]);
    const r = await call('POST', '/api/plan-website', { text: TEXT, generationId: 'gen_free0aa' });
    assert.equal(r.body.ok, true, JSON.stringify(r.body)); assert.equal(r.body.creditsCharged, 4); assert.equal(r.body.creditsRemaining, 2);
    const planned = anthropic(calls, 'submit_website_plan');
    const refused = await call('POST', '/api/plan-website', { text: TEXT, generationId: 'gen_free1aa' });
    assert.equal(refused.body.ok, false); assert.equal(refused.body.creditsExceeded, true); assert.equal(refused.body.creditsRemaining, 2);
    assert.equal(anthropic(calls, 'submit_website_plan'), planned, 'no planner call without credits');
    const catalog = (await call('GET', '/api/billing/catalog')).body;
    assert.equal(catalog.subscriptionRequired, false); assert.equal(catalog.ownershipNeedsCredits, false);
    assert.deepEqual(catalog.catalog.packs.map(p => [p.id, p.credits, p.cents, p.currency]), [['credits_10', 10, 999, 'cad'], ['credits_30', 30, 2499, 'cad'], ['credits_75', 75, 4999, 'cad'], ['credits_200', 200, 9999, 'cad']]);
    assert.deepEqual([catalog.catalog.websites.business.cents, catalog.catalog.websites.creative.cents], [14999, 49999]);
    assert.equal(catalog.catalog.firstWebsiteBonus, 30);
    assert.doesNotMatch(JSON.stringify(catalog), /stripe|price_|usd|ceiling/i, 'no Stripe ids or provider costs reach customers');
  });
});

test('Creative: quoted and confirmed before anything paid runs; 6 credits on DOM; the next page is refused before any call; the economics are recorded', async () => {
  await withServer({ SITEREMADE_ADMIN_TOKEN: 'admin-test' }, async ({ port, calls }) => {
    const call = await signUp(port);
    const asked = await call('POST', '/api/creative/research', { brief: BRIEF });
    assert.equal(asked.body.ok, false); assert.equal(asked.body.needsConfirmation, true);
    assert.equal(asked.body.quote.credits, 6); assert.equal(asked.body.quote.message, 'This generation will use 6 credits.');
    assert.equal(anthropic(calls), 0, 'nothing paid runs before the owner confirms'); assert.equal((await balance(call)).remaining, 6, 'nothing is reserved either');
    const r = await call('POST', '/api/creative/research', { brief: BRIEF, quoteId: asked.body.quote.id });
    assert.equal(r.body.ok, true); assert.ok(r.body.jobId); assert.equal(r.body.creditCosts.page, 6);
    assert.equal(r.body.creditsRemaining, 0, 'the whole page is reserved before any paid step');
    const body = { brief: BRIEF, jobId: r.body.jobId, understanding: r.body.understanding, facts: [], supplied: {}, assets: [], thumbnails: [] };
    const p = await call('POST', '/api/creative/plan', body);
    assert.equal(p.body.ok, true, JSON.stringify(p.body)); assert.equal(p.body.creditsCharged, 5, 'the direction part (research was 1)');
    assert.equal((await balance(call)).remaining, 0, '6 charged for the page, no more');
    const before = anthropic(calls);
    const again = await call('POST', '/api/creative/plan', body);
    assert.equal(again.body.ok, true); assert.equal(again.body.replayed, true); assert.equal(anthropic(calls), before);
    const next = await research(call, { brief: BRIEF });
    assert.equal(next.body.ok, false); assert.equal(next.body.creditsExceeded, true); assert.equal(anthropic(calls), before);
    assert.match(next.body.message, /will use 6 credits/);
    // what it cost SiteRemade, per operation type (operators only)
    assert.equal((await call('GET', '/api/admin/usage-summary')).status, 404, 'not without the admin token');
    const econ = (await call('GET', '/api/admin/usage-summary', null, { 'x-admin-token': 'admin-test' })).body;
    const dir = econ.operations.find(o => o.operation === 'creative_direction'); const res = econ.operations.find(o => o.operation === 'creative_research');
    assert.ok(dir && dir.credits_settled === 5 && dir.succeeded === 1, JSON.stringify(econ.operations)); assert.ok(res && res.credits_settled === 1);
    assert.ok(dir.avg_anthropic_usd > 0, 'the direction call cost is recorded');
  });
});

test('zero balance: every paid path refuses before the provider -- research, picture checks, direction, planning, AI edits, images, premium media; manual saves stay free', async () => {
  await withServer({ SITEREMADE_TRIAL_CREDITS: '0' }, async ({ port, calls }) => {
    const call = await signUp(port);
    assert.equal((await balance(call)).remaining, 0);
    const png = 'data:image/png;base64,' + Buffer.from('\x89PNG\r\n\x1a\n0000000000000000', 'latin1').toString('base64');
    assert.equal((await research(call, { brief: BRIEF })).body.creditsExceeded, true);
    assert.equal((await call('POST', '/api/creative/check-pictures', { jobId: 'cj_guessedguessed', pictures: [{ id: 'p1', dataUrl: png }] })).status, 402);
    assert.equal((await call('POST', '/api/creative/plan', { brief: BRIEF, jobId: 'cj_guessedguessed', understanding: {}, assets: [], thumbnails: [] })).status, 402);
    assert.equal((await call('POST', '/api/plan-website', { text: TEXT, generationId: 'gen_zeroaaaa' })).body.creditsExceeded, true);
    assert.equal((await call('POST', '/api/refine-website', { taskType: 'COLOR_CHANGE', request: 'make it blue' })).body.creditsExceeded, true);
    assert.equal((await call('POST', '/api/generate-image', { prompt: 'a calm spa interior, no text', model: 'gpt-image-1-mini', quality: 'medium', aspectRatio: '1:1' })).body.starterVisualsOnly, true);
    assert.equal(anthropic(calls), 0, 'no model call was made'); assert.equal(openai(calls), 0, 'no image was generated');
    const project = await saveProject(call, 'Manual', await businessDirection());
    const put = await call('PUT', `/api/projects/${project.id}`, { name: 'Manual edit', expectedRevision: project.revision, directionsState: (await call('GET', `/api/projects/${project.id}`)).body.project.directionsState });
    assert.equal(put.body.ok, true, JSON.stringify(put.body));
    assert.equal((await balance(call)).remaining, 0);
  });
});

test('updates are priced by what they change: a text change 1 at once; a whole-site redesign 5, only after the owner confirms; a failed plan is not charged; a double click plans once', async () => {
  await withServer({ SITEREMADE_TRIAL_CREDITS: '20' }, async ({ port, calls }) => {
    const call = await signUp(port);
    const e = await call('POST', '/api/refine-website', { taskType: 'COLOR_CHANGE', request: 'make the headline warmer', requestId: 'edit-1' });
    assert.equal(e.body.ok, true, JSON.stringify(e.body)); assert.equal(e.body.creditsCharged, 1); assert.equal(e.body.creditsRemaining, 19);
    const retry = await call('POST', '/api/refine-website', { taskType: 'COLOR_CHANGE', request: 'make the headline warmer', requestId: 'edit-1' });
    assert.equal(retry.body.replayed, true); assert.equal(retry.body.creditsCharged, 0); assert.equal((await balance(call)).remaining, 19);
    const planned = anthropic(calls);
    const big = await call('POST', '/api/refine-website', { request: 'Redesign the whole website to feel premium and editorial, like a luxury brand', requestId: 'edit-2' });
    assert.equal(big.body.needsConfirmation, true); assert.equal(big.body.quote.credits, 5); assert.equal(big.body.quote.message, 'This update will use 5 credits.');
    assert.equal(anthropic(calls), planned, 'no model call before the owner confirms'); assert.equal((await balance(call)).remaining, 19);
    const done = await call('POST', '/api/refine-website', { request: 'Redesign the whole website to feel premium and editorial, like a luxury brand', requestId: 'edit-2', quoteId: big.body.quote.id });
    assert.equal(done.body.ok, true, JSON.stringify(done.body)); assert.equal(done.body.creditsCharged, 5); assert.equal((await balance(call)).remaining, 14);
    // two clicks on Generate for the same generation: one planner call, one charge
    const before = anthropic(calls, 'submit_website_plan');
    const both = await Promise.all([1, 2].map(() => call('POST', '/api/plan-website', { text: TEXT, generationId: 'gen_doubleclick' })));
    assert.equal(both.filter(r => r.status === 200 && r.body.ok && !r.body.replayed).length, 1);
    assert.ok(both.every(r => r.status === 409 || (r.status === 200 && r.body.ok)));
    assert.equal(anthropic(calls, 'submit_website_plan'), before + 1);
    assert.equal((await balance(call)).remaining, 10);
    const reconnect = await call('POST', '/api/plan-website', { text: TEXT, generationId: 'gen_doubleclick' });
    assert.equal(reconnect.body.ok, true); assert.equal(reconnect.body.replayed, true); assert.equal((await balance(call)).remaining, 10);
  });
  await withServer({ MOCK_PLANNER: 'error' }, async ({ port }) => {
    const call = await signUp(port);
    const r = await call('POST', '/api/plan-website', { text: TEXT, generationId: 'gen_failedaa' });
    assert.equal(r.body.ok, false); assert.equal((await balance(call)).remaining, 6, 'a failed plan is not charged');
  });
});

test('parallel generations can never overspend: 12 credits buy exactly three Business websites', async () => {
  await withServer({ SITEREMADE_TRIAL_CREDITS: '12' }, async ({ port, calls }) => {
    const call = await signUp(port);
    const results = await Promise.all(Array.from({ length: 6 }, (_, i) => call('POST', '/api/plan-website', { text: TEXT, generationId: `gen_parallel${i}` })));
    assert.equal(results.filter(r => r.body && r.body.ok).length, 3);
    assert.equal(results.filter(r => r.body && r.body.creditsExceeded).length, 3);
    assert.equal(anthropic(calls, 'submit_website_plan'), 3);
    assert.equal((await balance(call)).remaining, 0);
  });
});

// ------------------------------------------------------------------------------------------------ legacy subscribers
test('no subscription is required or sold: a legacy Workspace subscriber keeps the month already paid for; the app reads the same balance; an app update runs only with a confirmed quote', async () => {
  await withServer({ MOCK_REFINEMENT_COPY: 'Gentle skincare, made in Vancouver' }, async ({ port, app, calls }) => {
    app.state.entitlement = Object.assign({ status: 'active', subscriptionId: 'sub_test_1', workspaceId: 'ws_1', cancelAtPeriodEnd: false }, period(-10, 20));
    const call = await appUser(port);
    const builder = await balance(call);
    assert.equal(builder.plan, 'credits'); assert.equal(builder.remaining, 106, 'the legacy month (100) + the trial (6)');
    assert.equal(builder.subscription.legacy, true); assert.equal(builder.subscription.credits, 100);
    for (let i = 0; i < 3; i++) assert.equal((await balance(call)).remaining, 106, 'asking again never grants again');
    const inApp = await call('GET', '/api/app-bridge/credits?refresh=1', null, bearer());
    assert.equal(inApp.status, 200); assert.equal(inApp.body.credits.remaining, 106); assert.equal(inApp.body.subscriptionRequired, false);
    assert.deepEqual(inApp.body.credits.costs, builder.costs);
    assert.deepEqual([inApp.body.catalog.websites.business.cents, inApp.body.catalog.websites.creative.cents], [14999, 49999]);
    const project = await saveProject(call, 'Glow Theory', await businessDirection());
    const request = 'Give the homepage a fresh hero photo.';
    const before = openai(calls); const planned = anthropic(calls);
    const ask = await call('POST', `/api/app-bridge/website/${project.id}/edits`, { baseRevision: project.revision, request }, Object.assign({ 'idempotency-key': 'app-edit-1' }, bearer()));
    assert.equal(ask.status, 409); assert.equal(ask.body.error.code, 'confirmation_required'); assert.ok(ask.body.error.quote.credits >= 1);
    assert.equal(anthropic(calls), planned, 'nothing runs before the owner approves'); assert.equal((await balance(call)).remaining, 106);
    const q = await call('POST', '/api/app-bridge/quotes', { operation: 'website_update', request, projectId: project.id }, bearer());
    assert.equal(q.status, 200); assert.equal(q.body.quote.credits, ask.body.error.quote.credits, 'the same price from the app quote');
    const edit = await call('POST', `/api/app-bridge/website/${project.id}/edits`, { baseRevision: project.revision, request, quoteId: q.body.quote.id }, Object.assign({ 'idempotency-key': 'app-edit-1' }, bearer()));
    assert.equal(edit.status, 200, JSON.stringify(edit.body)); assert.equal(edit.body.creditsCharged, q.body.quote.credits, 'the quoted price; the requested picture is not generated');
    assert.equal((await balance(call)).remaining, 106 - q.body.quote.credits);
    const retried = await call('POST', `/api/app-bridge/website/${project.id}/edits`, { baseRevision: project.revision, request, quoteId: q.body.quote.id }, Object.assign({ 'idempotency-key': 'app-edit-1' }, bearer()));
    assert.equal(retried.body.replayed, true); assert.equal(openai(calls), before); assert.equal((await balance(call)).remaining, 106 - q.body.quote.credits);
    assert.equal(app.state.rejected, 0);
    app.state.bodies.forEach(b => assert.deepEqual(Object.keys(b), ['supabaseUserId']));
  });
});

test('legacy subscriptions wind down safely: cancellation ends only that month\'s plan credits; stale answers never restore; payment failure grants nothing; projects and purchases stay', async () => {
  await withServer({}, async ({ port, app }) => {
    const P1 = period(-10, 20);
    app.state.entitlement = Object.assign({ status: 'active', subscriptionId: 'sub_a', workspaceId: 'ws_1', cancelAtPeriodEnd: false }, P1);
    const call = await appUser(port, 'test-access-token-2');
    assert.equal((await balance(call)).remaining, 106);
    const project = await saveProject(call, 'Kept', await businessDirection());
    app.state.entitlement = Object.assign({}, app.state.entitlement, { cancelAtPeriodEnd: true });
    const scheduled = await balance(call);
    assert.equal(scheduled.remaining, 106); assert.equal(scheduled.subscription.renewsAt, null); assert.equal(scheduled.subscription.endsAt, P1.periodEnd);
    app.state.entitlement = Object.assign({}, app.state.entitlement, { status: 'canceled' });
    const cancelled = await balance(call);
    assert.equal(cancelled.plan, 'credits'); assert.equal(cancelled.remaining, 6);
    assert.ok((await call('GET', '/api/projects')).body.projects.some(p => p.id === project.id), 'cancellation never deletes a project');
    app.state.entitlement = Object.assign({ status: 'active', subscriptionId: 'sub_a', workspaceId: 'ws_1', cancelAtPeriodEnd: false }, P1);
    assert.equal((await balance(call)).remaining, 6);
    app.state.entitlement = Object.assign({ status: 'past_due', subscriptionId: 'sub_b', workspaceId: 'ws_1', cancelAtPeriodEnd: false }, period(-1, 29));
    const pastDue = await balance(call);
    assert.equal(pastDue.remaining, 6); assert.equal(pastDue.subscription.paymentProblem, true);
  });
});

test('fail closed: without the shared secret, or with an answer that is not signed correctly, an account simply has its own credits', async () => {
  await withServer({ SITEREMADE_BILLING_SECRET: '' }, async ({ port, app }) => {
    app.state.entitlement = Object.assign({ status: 'active', subscriptionId: 'sub_x', workspaceId: 'ws_1' }, period(-1, 29));
    const c = await balance(await appUser(port, 'test-access-token-3'));
    assert.equal(c.plan, 'credits'); assert.equal(c.remaining, 6); assert.equal(c.billingVerified, false); assert.equal(app.state.calls, 0);
  });
  await withServer({ SITEREMADE_BILLING_SECRET: 'not-the-app-secret' }, async ({ port, app }) => {
    app.state.entitlement = Object.assign({ status: 'active', subscriptionId: 'sub_x', workspaceId: 'ws_1' }, period(-1, 29));
    const c = await balance(await appUser(port, 'test-access-token-4'));
    assert.equal(c.plan, 'credits'); assert.equal(c.remaining, 6); assert.ok(app.state.rejected > 0);
  });
});

test('the tester allowance is kept, separate from the trial', async () => {
  const email = `tester-${Date.now()}@example.com`;
  await withServer({ SITEREMADE_TESTER_EMAILS: email }, async ({ port }) => {
    const call = client(port);
    await call('POST', '/api/auth/signup', { email, password: 'correct-horse-battery-staple' });
    const c = await balance(call);
    assert.equal(c.plan, 'tester'); assert.equal(c.tester.credits, 500); assert.equal(c.remaining, 506); assert.ok(c.tester.resetsAt);
  });
});

// ------------------------------------------------------------------------------------------------ ownership
test('website ownership: Business $149.99 and Creative $499.99 CAD, one time; only a paid, matching Stripe event unlocks it; no subscription is involved; re-download needs no new payment', async () => {
  await withServer({ STRIPE_SECRET_KEY: 'sk_test_mock_only' }, async ({ port, calls }) => {
    const call = await signUp(port);
    const creative = await saveProject(call, 'Toilet paper', creativeDirection());
    const business = await saveProject(call, 'Glow Theory', await businessDirection());
    assert.equal((await call('POST', `/api/projects/${creative.id}/export`)).status, 403);
    assert.equal((await call('POST', `/api/projects/${business.id}/export`)).status, 403);
    const stranger = await signUp(port);
    assert.equal((await stranger('POST', `/api/projects/${creative.id}/export`)).status, 404);
    assert.equal((await stranger('POST', `/api/checkout`, { projectId: creative.id })).status, 404);
    const co = await call('POST', '/api/checkout', { projectId: creative.id, businessName: 'Toilet paper' });
    assert.equal(co.body.ok, true, JSON.stringify(co.body));
    const cb = await call('POST', '/api/checkout', { projectId: business.id, businessName: 'Glow Theory' });
    const sessions = stripeSessions(calls);
    assert.deepEqual(sessions.map(s => [s.amount, s.currency, s.mode, s.websiteMode]), [[49999, 'cad', 'payment', 'creative'], [14999, 'cad', 'payment', 'business']], 'one-time payments, priced by kind');
    const creativeSession = sessions[0].session;
    const current = (await call('GET', `/api/projects/${creative.id}`)).body.project;
    assert.equal((await call('PUT', `/api/projects/${creative.id}`, { name: 'Toilet paper, edited', expectedRevision: current.revision, directionsState: current.directionsState })).body.ok, true);
    await stripeEvent(port, 'checkout.session.completed', { id: creativeSession, payment_status: 'unpaid', amount_total: 49999, currency: 'cad' });
    assert.equal((await call('POST', `/api/projects/${creative.id}/export`)).status, 403);
    await stripeEvent(port, 'checkout.session.completed', { id: creativeSession, payment_status: 'paid', amount_total: 14999, currency: 'cad' });
    assert.equal((await call('POST', `/api/projects/${creative.id}/export`)).status, 403, 'the Business price does not buy a Creative website');
    const paid = await stripeEvent(port, 'checkout.session.async_payment_succeeded', { id: creativeSession, payment_status: 'paid', amount_total: 49999, currency: 'cad', payment_intent: 'pi_creative_1' });
    assert.equal(paid.status, 200);
    const exported = exportedDeployment(await call('POST', `/api/projects/${creative.id}/export`));
    assert.equal(exported.manifest.mode, 'creative');
    assert.equal(exported.deployment.projectRevision, current.revision, 'the revision agreed at checkout, not the later edit');
    assert.equal((await call('POST', `/api/projects/${business.id}/export`)).status, 403, 'buying one website unlocks only that one');
    await stripeEvent(port, 'checkout.session.completed', { id: creativeSession, payment_status: 'paid', amount_total: 49999, currency: 'cad' });
    exportedDeployment(await call('POST', `/api/projects/${creative.id}/export`));
    assert.equal((await call('GET', `/api/projects/${creative.id}/purchase-snapshot`)).body.snapshot.projectRevision, current.revision);
    assert.equal((await call('POST', '/api/checkout', { projectId: creative.id })).status, 409, 'it cannot be bought twice');
    await call('POST', '/api/checkout', { projectId: business.id, businessName: 'Glow Theory' });
    assert.ok(calls().some(c => c.provider === 'stripe' && c.endpoint === 'expire' && c.session === sessions[1].session));
    assert.ok(cb.body.ok);
    const bought = (await call('GET', `/api/projects/${creative.id}`)).body.project;
    assert.equal((await call('PUT', `/api/projects/${creative.id}`, { name: bought.name, expectedRevision: bought.revision, directionsState: { directions: [await businessDirection()], activeDirectionIndex: 0 } })).body.ok, true);
    assert.equal(exportedDeployment(await call('POST', `/api/projects/${creative.id}/export`)).manifest.mode, 'creative', 'the export is still the Creative page that was bought');
  });
});

test('an owned website stays downloadable with zero credits and no subscription', async () => {
  const email = `owner-${Date.now()}@example.com`;
  await withServer({ SITEREMADE_TRIAL_CREDITS: '0', SITEREMADE_FREE_PURCHASE_TESTER_EMAILS: email }, async ({ port }) => {
    const call = client(port);
    await call('POST', '/api/auth/signup', { email, password: 'correct-horse-battery-staple' });
    const project = await saveProject(call, 'Owned', await businessDirection());
    const bought = await call('POST', '/api/checkout', { projectId: project.id, businessName: 'Owned' });
    assert.equal(bought.body.testerPurchase, true); assert.equal(bought.body.fulfilled, true);
    const b = await balance(call);
    assert.equal(b.remaining, 0, 'a tester purchase is not a payment: no first-website bonus'); assert.equal(b.subscription, null);
    exportedDeployment(await call('POST', `/api/projects/${project.id}/export`));
    exportedDeployment(await call('POST', `/api/projects/${project.id}/export`));
    assert.ok((await call('GET', '/api/projects')).body.projects.some(p => p.id === project.id && p.status === 'purchased'));
  });
});

test('first website bonus: exactly 30 credits, once, only after a real paid website; a duplicated webhook or a second website adds nothing; a refund revokes what is unused', async () => {
  await withServer({ STRIPE_SECRET_KEY: 'sk_test_mock_only' }, async ({ port, calls }) => {
    const call = await signUp(port);
    const first = await saveProject(call, 'First', await businessDirection());
    await call('POST', '/api/checkout', { projectId: first.id, businessName: 'First' });
    const s1 = stripeSessions(calls).pop().session;
    await paidEvent(port, s1, 14999, 'pi_web_1');
    assert.equal((await balance(call)).remaining, 36, 'the trial (6) + the first-website bonus (30)');
    await paidEvent(port, s1, 14999, 'pi_web_1');
    assert.equal((await balance(call)).remaining, 36, 'a retried webhook never grants twice');
    assert.equal((await history(call)).filter(e => e.type === 'first_website_bonus').map(e => e.amount).join(), '30');
    const second = await saveProject(call, 'Second', creativeDirection());
    await call('POST', '/api/checkout', { projectId: second.id, businessName: 'Second' });
    await paidEvent(port, stripeSessions(calls).pop().session, 49999, 'pi_web_2');
    assert.equal((await balance(call)).remaining, 36, 'only the first website has a bonus');
    // the bonus is spent first; a refund of the first website takes back only what is left of it
    assert.equal((await call('POST', '/api/plan-website', { text: TEXT, generationId: 'gen_bonusspend' })).body.creditsCharged, 4);
    assert.equal((await balance(call)).remaining, 32);
    await refundEvent(port, 'pi_web_1', 14999);
    assert.equal((await balance(call)).remaining, 6, 'the unused 26 bonus credits end; the 4 spent paid for work done; the trial stays');
    await refundEvent(port, 'pi_web_1', 14999);
    assert.equal((await balance(call)).remaining, 6, 'a repeated refund event changes nothing');
    assert.ok((await history(call)).some(e => e.type === 'revoked' && e.amount === 26));
  });
});

test('credit packs: 10 / 30 / 75 / 200 for $9.99 / $24.99 / $49.99 / $99.99 CAD, one-time; granted only by a paid, matching webhook, once; a refund revokes unused credits', async () => {
  await withServer({ STRIPE_SECRET_KEY: 'sk_test_mock_only', MOCK_SUPABASE_USER_ID: '00000000-0000-4000-8000-000000000007' }, async ({ port, calls }) => {
    const call = await signUp(port);
    const made = [];
    for (const packId of ['credits_10', 'credits_30', 'credits_75', 'credits_200']) { const r = await call('POST', '/api/credits/checkout', { packId }); assert.equal(r.body.ok, true, JSON.stringify(r.body)); made.push(r.body.purchaseId); }
    const sessions = stripeSessions(calls);
    assert.deepEqual(sessions.map(s => [s.amount, s.currency, s.mode, s.kind, s.packId]), [[999, 'cad', 'payment', 'credit_pack', 'credits_10'], [2499, 'cad', 'payment', 'credit_pack', 'credits_30'], [4999, 'cad', 'payment', 'credit_pack', 'credits_75'], [9999, 'cad', 'payment', 'credit_pack', 'credits_200']]);
    assert.equal((await call('POST', '/api/credits/checkout', { packId: 'credits_1000' })).status, 400);
    const s30 = sessions[1].session;
    await stripeEvent(port, 'checkout.session.completed', { id: s30, payment_status: 'unpaid', amount_total: 2499, currency: 'cad' });
    await stripeEvent(port, 'checkout.session.completed', { id: s30, payment_status: 'paid', amount_total: 999, currency: 'cad' });
    assert.equal((await balance(call)).remaining, 6, 'unpaid or a different amount grants nothing');
    await paidEvent(port, s30, 2499, 'pi_pack_30');
    await paidEvent(port, s30, 2499, 'pi_pack_30');
    const b = await balance(call);
    assert.equal(b.remaining, 36); assert.equal(b.purchased, 30, 'exactly 30, once');
    assert.equal((await call('GET', `/api/credits/purchases/${made[1]}`)).body.purchase.status, 'fulfilled');
    const stranger = await signUp(port);
    assert.equal((await stranger('GET', `/api/credits/purchases/${made[1]}`)).status, 404);
    await paidEvent(port, sessions[3].session, 9999, 'pi_pack_200');
    assert.equal((await balance(call)).remaining, 236);
    // the trial is spent before bought credits
    await call('POST', '/api/plan-website', { text: TEXT, generationId: 'gen_packspend' });
    assert.equal((await balance(call)).purchased, 230);
    await refundEvent(port, 'pi_pack_30', 2499);
    assert.equal((await balance(call)).remaining, 202, 'the refunded pack loses its 30 unused credits');
    assert.ok((await history(call)).some(e => e.type === 'purchased' && e.amount === 200));
    // the app starts a pack checkout through the bridge (credits are still granted only by the webhook)
    const app = await appUser(port, 'test-access-token-7');
    const viaApp = await app('POST', '/api/app-bridge/credits/checkout', { packId: 'credits_10' }, bearer('test-access-token-7'));
    assert.equal(viaApp.status, 200, JSON.stringify(viaApp.body)); assert.equal(viaApp.body.ok, true);
  });
});

test('the quality review runs only for a Business generation this account paid for, and only once', async () => {
  await withServer({ PREMIUM_GENERATION_V1: 'true' }, async ({ port, calls }) => {
    const call = await signUp(port);
    const direction = { pages: [{ id: 'home', sections: [] }], design: {}, copy: {} };
    const before = anthropic(calls);
    const guessed = await call('POST', '/api/premium/review-repair', { generationId: 'gen_guessed123', direction, description: TEXT });
    assert.equal(guessed.body.ok, false); assert.equal(anthropic(calls), before, 'a guessed generation gets no paid review');
    assert.equal((await call('POST', '/api/plan-website', { text: TEXT, generationId: 'gen_paidreview1', premiumGenerationId: 'gen_paidreview1' })).body.ok, true);
    assert.notEqual((await call('POST', '/api/premium/review-repair', { generationId: 'gen_paidreview1', direction, description: TEXT })).body.message, 'Quality review was skipped.');
    const second = await call('POST', '/api/premium/review-repair', { generationId: 'gen_paidreview1', direction, description: TEXT });
    assert.equal(second.body.ok, false); assert.match(second.body.message, /already ran/);
    assert.equal((await balance(call)).remaining, 2, 'the review is part of the 4-credit generation');
  });
});

// ------------------------------------------------------------------------------------------------ paid providers
test('paid providers are off outside production: a development server with keys in its environment calls nothing and reports why, without the keys', async () => {
  const keys = { ANTHROPIC_API_KEY: 'dev-machine-anthropic-key', SERPAPI_API_KEY: 'serp-looks-real-0000', HIGGSFIELD_API_KEY: 'hf-key-id-0000:hf-secret-looks-real-0000', OPENAI_API_KEY: 'dev-machine-openai-key' };
  await withServer(Object.assign({ SITEREMADE_TEST_NO_PROVIDER_MOCK: '1', SITEREMADE_ADMIN_TOKEN: 'admin-test', SITEREMADE_TRIAL_CREDITS: '20' }, keys), async ({ port, calls }) => {
    const call = await signUp(port);
    const plan = await call('POST', '/api/plan-website', { text: TEXT, generationId: 'gen_devmode1' });
    assert.equal(plan.body.configured, false, 'the planner reports itself unavailable');
    const r = await research(call, { brief: BRIEF });
    assert.equal(r.body.understandMeta.source, 'rules', 'Creative uses its built-in reader');
    const pm = await call('POST', '/api/creative/price', { request: BRIEF, premium: { on: true, moments: 1, eligibleUploads: 1 } });
    assert.equal(pm.body.premiumAvailable, false); assert.match(pm.body.premiumUnavailable, /unavailable in this environment/); assert.equal(pm.body.credits, 6, 'no premium line while paid providers are off');
    assert.equal(calls().filter(c => ['anthropic', 'serpapi', 'higgsfield', 'openai'].includes(c.provider)).length, 0, 'not one paid request left the server');
    const status = (await call('GET', '/api/admin/paid-providers', null, { 'x-admin-token': 'admin-test' })).body;
    assert.equal(status.mode, 'off');
    for (const n of ['anthropic', 'serpapi', 'higgsfield', 'openai']) { assert.equal(status.providers[n].configured, true); assert.equal(status.providers[n].enabled, false); }
    const text = JSON.stringify(status) + JSON.stringify(pm.body) + JSON.stringify(plan.body);
    for (const v of Object.values(keys)) for (const part of v.split(':')) assert.ok(!text.includes(part), 'no key ever reaches a response');
  });
});
