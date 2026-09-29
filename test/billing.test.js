'use strict';
// SUBSCRIPTION, CREDITS AND WEBSITE PURCHASE, end to end on the REAL server.js route table (test/helpers/run-server.js):
// only Claude, OpenAI, Stripe and Supabase's token check are stubbed at the network edge, and the client app's
// signed billing endpoint is a small local server here. Nothing is charged and no real model is called.
//
// The agreed rules: 6 one-time free trial credits; 100 credits per Workspace billing month (no rollover); Business
// generation 2; Creative page 4 (research, pictures and automatic repairs included); AI update 1; generated image
// 1 support / 2 premium; manual edits free. Both kinds of website need the same one-time purchase; a subscription
// never includes it.
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

// ------------------------------------------------------------------------------------------------ free users
test('free trial: 6 one-time credits; a Business website costs 2; the fourth is refused before any model call', async () => {
  await withServer({}, async ({ port, calls }) => {
    const call = await signUp(port);
    const start = await balance(call);
    assert.equal(start.plan, 'free'); assert.equal(start.remaining, 6); assert.equal(start.trial.oneTime, true);
    assert.deepEqual([start.costs.businessGeneration, start.costs.creativePage, start.costs.aiUpdate, start.costs.imageSupport, start.costs.imagePremium, start.costs.manualEdit], [2, 4, 1, 1, 2, 0]);
    for (let i = 0; i < 3; i++) {
      const r = await call('POST', '/api/plan-website', { text: TEXT, generationId: `gen_free${i}aa` });
      assert.equal(r.body.ok, true, JSON.stringify(r.body)); assert.equal(r.body.creditsCharged, 2); assert.equal(r.body.creditsRemaining, 4 - 2 * i);
    }
    const planned = anthropic(calls, 'submit_website_plan');
    const refused = await call('POST', '/api/plan-website', { text: TEXT, generationId: 'gen_free3aa' });
    assert.equal(refused.body.ok, false); assert.equal(refused.body.creditsExceeded, true); assert.equal(refused.body.creditsRemaining, 0);
    assert.equal(anthropic(calls, 'submit_website_plan'), planned, 'no planner call without credits');
    assert.equal((await balance(call)).remaining, 0, 'the trial does not come back the next day');
  });
});

test('free trial: a Creative page costs 4 in all (research, direction and its repairs); the next page is refused before any call', async () => {
  await withServer({}, async ({ port, calls }) => {
    const call = await signUp(port);
    const r = await call('POST', '/api/creative/research', { brief: BRIEF });
    assert.equal(r.body.ok, true); assert.ok(r.body.jobId); assert.equal(r.body.creditCosts.page, 4);
    assert.equal(r.body.creditsRemaining, 2, 'the whole page is reserved before any paid step');
    const p = await call('POST', '/api/creative/plan', { brief: BRIEF, jobId: r.body.jobId, understanding: r.body.understanding, facts: [], supplied: {}, assets: [], thumbnails: [] });
    assert.equal(p.body.ok, true, JSON.stringify(p.body));
    assert.equal(p.body.creditsRemaining, 2); assert.equal((await balance(call)).remaining, 2, '4 charged for the page, no more');
    // a double submit of the same page gets the directed page back, not a second direction
    const before = anthropic(calls);
    const again = await call('POST', '/api/creative/plan', { brief: BRIEF, jobId: r.body.jobId, understanding: r.body.understanding, facts: [], supplied: {}, assets: [], thumbnails: [] });
    assert.equal(again.body.ok, true); assert.equal(again.body.replayed, true); assert.equal(anthropic(calls), before);
    // the next page needs 4 and there are 2: refused before the understanding call
    const next = await call('POST', '/api/creative/research', { brief: BRIEF });
    assert.equal(next.body.ok, false); assert.equal(next.body.creditsExceeded, true); assert.equal(anthropic(calls), before);
    assert.match(next.body.message, /costs 4 credits/);
  });
});

test('zero balance: every paid path refuses before the provider -- research, picture checks, direction, planning, AI edits, images; manual saves stay free', async () => {
  await withServer({ SITEREMADE_TRIAL_CREDITS: '0' }, async ({ port, calls }) => {
    const call = await signUp(port);
    assert.equal((await balance(call)).remaining, 0);
    const png = 'data:image/png;base64,' + Buffer.from('\x89PNG\r\n\x1a\n0000000000000000', 'latin1').toString('base64');
    assert.equal((await call('POST', '/api/creative/research', { brief: BRIEF })).body.creditsExceeded, true);
    assert.equal((await call('POST', '/api/creative/check-pictures', { jobId: 'cj_guessedguessed', pictures: [{ id: 'p1', dataUrl: png }] })).status, 402);
    assert.equal((await call('POST', '/api/creative/plan', { brief: BRIEF, jobId: 'cj_guessedguessed', understanding: {}, assets: [], thumbnails: [] })).status, 402);
    assert.equal((await call('POST', '/api/plan-website', { text: TEXT, generationId: 'gen_zeroaaaa' })).body.creditsExceeded, true);
    // an edit the browser labels as a free colour change still needs the AI update's credit to reach the model
    assert.equal((await call('POST', '/api/refine-website', { taskType: 'COLOR_CHANGE', request: 'make it blue' })).body.creditsExceeded, true);
    // (a Business site never generates a picture at all -- refused before any balance check; lib/premium/visual-mode.js)
    assert.equal((await call('POST', '/api/generate-image', { prompt: 'a calm spa interior, no text', model: 'gpt-image-1-mini', quality: 'medium', aspectRatio: '1:1' })).body.starterVisualsOnly, true);
    assert.equal(anthropic(calls), 0, 'no model call was made'); assert.equal(openai(calls), 0, 'no image was generated');
    // manual edits and saves are free
    const project = await saveProject(call, 'Manual', await businessDirection());
    const put = await call('PUT', `/api/projects/${project.id}`, { name: 'Manual edit', expectedRevision: project.revision, directionsState: (await call('GET', `/api/projects/${project.id}`)).body.project.directionsState });
    assert.equal(put.body.ok, true, JSON.stringify(put.body));
    assert.equal((await balance(call)).remaining, 0);
  });
});

test('a Business AI edit costs one AI update whatever the browser labels it; a failed plan is not charged; a double click plans once', async () => {
  await withServer({}, async ({ port, calls }) => {
    const call = await signUp(port);
    const e = await call('POST', '/api/refine-website', { taskType: 'COLOR_CHANGE', request: 'make the headline warmer', requestId: 'edit-1' });
    assert.equal(e.body.ok, true); assert.equal(e.body.creditsCharged, 1); assert.equal(e.body.creditsRemaining, 5);
    const retry = await call('POST', '/api/refine-website', { taskType: 'COLOR_CHANGE', request: 'make the headline warmer', requestId: 'edit-1' });
    assert.equal(retry.body.replayed, true); assert.equal(retry.body.creditsCharged, 0); assert.equal((await balance(call)).remaining, 5);
    // two clicks on Generate for the same generation: one planner call, one charge
    const before = anthropic(calls, 'submit_website_plan');
    const both = await Promise.all([1, 2].map(() => call('POST', '/api/plan-website', { text: TEXT, generationId: 'gen_doubleclick' })));
    // the second click either finds the first still running (409) or gets its finished plan back -- never a new plan
    assert.equal(both.filter(r => r.status === 200 && r.body.ok && !r.body.replayed).length, 1);
    assert.ok(both.every(r => r.status === 409 || (r.status === 200 && r.body.ok)));
    assert.equal(anthropic(calls, 'submit_website_plan'), before + 1);
    assert.equal((await balance(call)).remaining, 3);
    // a reconnect retrying that generation gets the plan back
    const reconnect = await call('POST', '/api/plan-website', { text: TEXT, generationId: 'gen_doubleclick' });
    assert.equal(reconnect.body.ok, true); assert.equal(reconnect.body.replayed, true); assert.equal((await balance(call)).remaining, 3);
    assert.equal(anthropic(calls, 'submit_website_plan'), before + 1);
  });
  await withServer({ MOCK_PLANNER: 'error' }, async ({ port }) => {
    const call = await signUp(port);
    const r = await call('POST', '/api/plan-website', { text: TEXT, generationId: 'gen_failedaa' });
    assert.equal(r.body.ok, false); assert.equal((await balance(call)).remaining, 6, 'a failed plan is not charged');
  });
});

test('parallel generations can never overspend: 6 credits buy exactly three Business websites', async () => {
  await withServer({}, async ({ port, calls }) => {
    const call = await signUp(port);
    const results = await Promise.all(Array.from({ length: 6 }, (_, i) => call('POST', '/api/plan-website', { text: TEXT, generationId: `gen_parallel${i}` })));
    assert.equal(results.filter(r => r.body && r.body.ok).length, 3);
    assert.equal(results.filter(r => r.body && r.body.creditsExceeded).length, 3);
    assert.equal(anthropic(calls, 'submit_website_plan'), 3);
    assert.equal((await balance(call)).remaining, 0);
  });
});

// ------------------------------------------------------------------------------------------------ subscribers
test('Workspace plan: 100 credits a month, verified server to server, granted once, one balance in the builder and the app', async () => {
  await withServer({ MOCK_REFINEMENT_COPY: 'Gentle skincare, made in Vancouver' }, async ({ port, app, calls }) => {
    app.state.entitlement = Object.assign({ status: 'active', subscriptionId: 'sub_test_1', workspaceId: 'ws_1', cancelAtPeriodEnd: false }, period(-10, 20));
    const call = await appUser(port);
    const builder = await balance(call);
    assert.equal(builder.plan, 'workspace'); assert.equal(builder.remaining, 106, '100 plan credits + the 6 trial credits');
    assert.equal(builder.subscription.credits, 100); assert.ok(builder.subscription.renewsAt);
    for (let i = 0; i < 3; i++) assert.equal((await balance(call)).remaining, 106, 'asking again never grants again');
    // the app reads the same balance, prices and renewal time through the bridge
    const inApp = await call('GET', '/api/app-bridge/credits?refresh=1', null, { authorization: 'Bearer test-access-token-1' });
    assert.equal(inApp.status, 200); assert.equal(inApp.body.credits.remaining, 106);
    assert.deepEqual(inApp.body.credits.costs, builder.costs); assert.equal(inApp.body.credits.subscription.renewsAt, builder.subscription.renewsAt);
    assert.deepEqual(inApp.body.websitePrice, { cents: 14999, currency: 'cad', display: '$149.99' });
    // an AI update made in the app spends from the same balance the builder shows
    const project = await saveProject(call, 'Glow Theory', await businessDirection());
    const before = openai(calls);
    const edit = await call('POST', `/api/app-bridge/website/${project.id}/edits`, { baseRevision: project.revision, request: 'Give the homepage a fresh hero photo.' }, { authorization: 'Bearer test-access-token-1', 'idempotency-key': 'app-edit-1' });
    assert.equal(edit.status, 200, JSON.stringify(edit.body)); assert.equal(edit.body.creditsCharged, 1, '1 AI update; the requested picture is not generated');
    assert.equal((await balance(call)).remaining, 105);
    // the app retrying that update (a lost response) gets the result back: no second edit, charge or image
    const retried = await call('POST', `/api/app-bridge/website/${project.id}/edits`, { baseRevision: project.revision, request: 'Give the homepage a fresh hero photo.' }, { authorization: 'Bearer test-access-token-1', 'idempotency-key': 'app-edit-1' });
    assert.equal(retried.body.replayed, true); assert.equal(openai(calls), before); assert.equal((await balance(call)).remaining, 105);
    // the billing request is signed and carries only the Supabase user id -- never an email or a browser field
    assert.equal(app.state.rejected, 0);
    app.state.bodies.forEach(b => assert.deepEqual(Object.keys(b), ['supabaseUserId']));
  });
});

test('billing changes: scheduled cancellation runs to the period end; cancellation ends plan credits only; stale answers never restore; payment failure grants no new month; recovery grants it once', async () => {
  await withServer({}, async ({ port, app }) => {
    const P1 = period(-10, 20);
    app.state.entitlement = Object.assign({ status: 'active', subscriptionId: 'sub_a', workspaceId: 'ws_1', cancelAtPeriodEnd: false }, P1);
    const call = await appUser(port, 'test-access-token-2');
    assert.equal((await balance(call)).remaining, 106);
    const project = await saveProject(call, 'Kept', await businessDirection());
    // scheduled cancellation: the month continues; the page shows when it ends instead of a renewal
    app.state.entitlement = Object.assign({}, app.state.entitlement, { cancelAtPeriodEnd: true });
    const scheduled = await balance(call);
    assert.equal(scheduled.remaining, 106); assert.equal(scheduled.subscription.renewsAt, null); assert.equal(scheduled.subscription.endsAt, P1.periodEnd);
    // cancelled now: the month's plan credits end; the trial remainder, projects and purchases stay
    app.state.entitlement = Object.assign({}, app.state.entitlement, { status: 'canceled' });
    const cancelled = await balance(call);
    assert.equal(cancelled.plan, 'free'); assert.equal(cancelled.remaining, 6);
    assert.ok((await call('GET', '/api/projects')).body.projects.some(p => p.id === project.id), 'cancellation never deletes a project');
    // a stale "active" for the same month (an out-of-order answer) cannot bring it back
    app.state.entitlement = Object.assign({ status: 'active', subscriptionId: 'sub_a', workspaceId: 'ws_1', cancelAtPeriodEnd: false }, P1);
    assert.equal((await balance(call)).remaining, 6);
    // a new subscription whose first payment failed: no month is granted, and the page says there is a payment problem
    const P2 = period(-1, 29);
    app.state.entitlement = Object.assign({ status: 'past_due', subscriptionId: 'sub_b', workspaceId: 'ws_1', cancelAtPeriodEnd: false }, P2);
    const pastDue = await balance(call);
    assert.equal(pastDue.remaining, 6); assert.equal(pastDue.subscription.paymentProblem, true);
    // the payment recovers: the month is granted, once
    app.state.entitlement = Object.assign({}, app.state.entitlement, { status: 'active' });
    assert.equal((await balance(call)).remaining, 106);
    assert.equal((await balance(call)).remaining, 106);
  });
});

test('fail closed: without the shared secret, or with an answer that is not signed correctly, an account is on its free trial', async () => {
  await withServer({ SITEREMADE_BILLING_SECRET: '' }, async ({ port, app }) => {
    app.state.entitlement = Object.assign({ status: 'active', subscriptionId: 'sub_x', workspaceId: 'ws_1' }, period(-1, 29));
    const c = await balance(await appUser(port, 'test-access-token-3'));
    assert.equal(c.plan, 'free'); assert.equal(c.remaining, 6); assert.equal(c.billingVerified, false); assert.equal(app.state.calls, 0);
  });
  await withServer({ SITEREMADE_BILLING_SECRET: 'not-the-app-secret' }, async ({ port, app }) => {
    app.state.entitlement = Object.assign({ status: 'active', subscriptionId: 'sub_x', workspaceId: 'ws_1' }, period(-1, 29));
    const c = await balance(await appUser(port, 'test-access-token-4'));
    assert.equal(c.plan, 'free'); assert.equal(c.remaining, 6); assert.ok(app.state.rejected > 0);
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

// ------------------------------------------------------------------------------------------------ purchases
test('website purchase: a Creative page needs the same $149.99 CAD purchase as Business; a plan never unlocks it; only a paid, matching Stripe event does; re-download needs no new payment', async () => {
  await withServer({ STRIPE_SECRET_KEY: 'sk_test_mock_only' }, async ({ port, app, calls }) => {
    app.state.entitlement = Object.assign({ status: 'active', subscriptionId: 'sub_p', workspaceId: 'ws_1' }, period(-1, 29));
    const call = await appUser(port, 'test-access-token-5');
    assert.equal((await balance(call)).plan, 'workspace');
    const creative = await saveProject(call, 'Toilet paper', creativeDirection());
    const business = await saveProject(call, 'Glow Theory', await businessDirection());
    // subscribed, but nothing is bought yet: no official export, by id, for either kind
    assert.equal((await call('POST', `/api/projects/${creative.id}/export`)).status, 403);
    assert.equal((await call('POST', `/api/projects/${business.id}/export`)).status, 403);
    // another account cannot export it (or learn it exists)
    const stranger = await signUp(port);
    assert.equal((await stranger('POST', `/api/projects/${creative.id}/export`)).status, 404);
    assert.equal((await stranger('POST', `/api/checkout`, { projectId: creative.id })).status, 404);
    // checkout: the same canonical price and currency for both kinds
    const co = await call('POST', '/api/checkout', { projectId: creative.id, businessName: 'Toilet paper' });
    assert.equal(co.body.ok, true, JSON.stringify(co.body));
    const cb = await call('POST', '/api/checkout', { projectId: business.id, businessName: 'Glow Theory' });
    const sessions = calls().filter(c => c.provider === 'stripe' && c.endpoint === 'checkout');
    assert.deepEqual(sessions.map(s => [s.amount, s.currency, s.mode, s.websiteMode]), [[14999, 'cad', 'payment', 'creative'], [14999, 'cad', 'payment', 'business']]);
    const creativeSession = sessions[0].session;
    // the page changes after checkout: what was bought is the revision agreed at checkout
    const current = (await call('GET', `/api/projects/${creative.id}`)).body.project;
    const put = await call('PUT', `/api/projects/${creative.id}`, { name: 'Toilet paper, edited', expectedRevision: current.revision, directionsState: current.directionsState });
    assert.equal(put.body.ok, true);
    // not paid yet (an asynchronous payment), or a different amount: nothing unlocks
    await stripeEvent(port, 'checkout.session.completed', { id: creativeSession, payment_status: 'unpaid', amount_total: 14999, currency: 'cad' });
    assert.equal((await call('POST', `/api/projects/${creative.id}/export`)).status, 403);
    await stripeEvent(port, 'checkout.session.completed', { id: creativeSession, payment_status: 'paid', amount_total: 100, currency: 'cad' });
    assert.equal((await call('POST', `/api/projects/${creative.id}/export`)).status, 403);
    // paid, in full: the Creative page -- and only it -- unlocks
    const paid = await stripeEvent(port, 'checkout.session.async_payment_succeeded', { id: creativeSession, payment_status: 'paid', amount_total: 14999, currency: 'cad' });
    assert.equal(paid.status, 200);
    const exported = exportedDeployment(await call('POST', `/api/projects/${creative.id}/export`));
    assert.equal(exported.manifest.mode, 'creative');
    assert.equal(exported.deployment.projectRevision, current.revision, 'the revision agreed at checkout, not the later edit');
    assert.equal((await call('POST', `/api/projects/${business.id}/export`)).status, 403, 'buying one website unlocks only that one');
    // a duplicate delivery changes nothing; re-downloading needs no new payment
    await stripeEvent(port, 'checkout.session.completed', { id: creativeSession, payment_status: 'paid', amount_total: 14999, currency: 'cad' });
    exportedDeployment(await call('POST', `/api/projects/${creative.id}/export`));
    const snap = await call('GET', `/api/projects/${creative.id}/purchase-snapshot`);
    assert.equal(snap.body.snapshot.projectRevision, current.revision);
    assert.equal((await call('POST', '/api/checkout', { projectId: creative.id })).status, 409, 'it cannot be bought twice');
    // a second checkout for the Business website closes the first one at Stripe (never two open payments for one site)
    await call('POST', '/api/checkout', { projectId: business.id, businessName: 'Glow Theory' });
    assert.ok(calls().some(c => c.provider === 'stripe' && c.endpoint === 'expire' && c.session === sessions[1].session));
    assert.ok(cb.body.ok);
    // turning the bought Creative page into a different kind of website does not carry the purchase over
    const bought = (await call('GET', `/api/projects/${creative.id}`)).body.project;
    const swapped = await call('PUT', `/api/projects/${creative.id}`, { name: bought.name, expectedRevision: bought.revision, directionsState: { directions: [await businessDirection()], activeDirectionIndex: 0 } });
    assert.equal(swapped.body.ok, true);
    const pub = await call('POST', `/api/app-bridge/website/${creative.id}/publish`, { revision: swapped.body.project.revision }, { authorization: 'Bearer test-access-token-5' });
    assert.equal(pub.status, 409); assert.equal(pub.body.error.code, 'not_purchased');
    const still = exportedDeployment(await call('POST', `/api/projects/${creative.id}/export`));
    assert.equal(still.manifest.mode, 'creative', 'the export is still the Creative page that was bought');
    // subscription cancelled: the purchased website stays downloadable
    app.state.entitlement = Object.assign({}, app.state.entitlement, { status: 'canceled' });
    assert.equal((await balance(call)).plan, 'free');
    exportedDeployment(await call('POST', `/api/projects/${creative.id}/export`));
  });
});

test('the quality review runs only for a Business generation this account paid for, and only once', async () => {
  await withServer({ PREMIUM_GENERATION_V1: 'true' }, async ({ port, calls }) => {
    const call = await signUp(port);
    const direction = { pages: [{ id: 'home', sections: [] }], design: {}, copy: {} };
    const before = anthropic(calls);
    const guessed = await call('POST', '/api/premium/review-repair', { generationId: 'gen_guessed123', direction, description: TEXT });
    assert.equal(guessed.body.ok, false); assert.equal(anthropic(calls), before, 'a guessed generation gets no paid review');
    const plan = await call('POST', '/api/plan-website', { text: TEXT, generationId: 'gen_paidreview1', premiumGenerationId: 'gen_paidreview1' });
    assert.equal(plan.body.ok, true);
    const first = await call('POST', '/api/premium/review-repair', { generationId: 'gen_paidreview1', direction, description: TEXT });
    assert.notEqual(first.body.message, 'Quality review was skipped.');
    const second = await call('POST', '/api/premium/review-repair', { generationId: 'gen_paidreview1', direction, description: TEXT });
    assert.equal(second.body.ok, false); assert.match(second.body.message, /already ran/);
    assert.equal((await balance(call)).remaining, 4, 'the review is part of the 2-credit generation');
  });
});
