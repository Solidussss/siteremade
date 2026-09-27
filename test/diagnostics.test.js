'use strict';
// Generation diagnostics must survive a real server restart and stay
// private. The restart test runs the REAL server.js twice (two separate
// processes) against the same SQLite file and asset store, with only the
// paid providers stubbed at the network edge (test/helpers/run-server.js).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { startServer, client, providerCalls } = require('./helpers/server-process');

const ADMIN = 'test-admin-token';

test('planner and image outcomes are still readable after a server restart, and a paid image is replayed (not re-paid) after it', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sr-diag-'));
  const env = {
    SITEREMADE_BACKEND: 'local', SITEREMADE_DB_PATH: path.join(dir, 'app.db'), SITEREMADE_ASSET_STORE_DIR: path.join(dir, 'assets'),
    ANTHROPIC_API_KEY: 'test-only', OPENAI_API_KEY: 'test-only', SITEREMADE_PAID_IMAGES: 'true', SITEREMADE_IMAGE_BUDGET_USD: '5',
    SITEREMADE_ADMIN_TOKEN: ADMIN, MOCK_PLANNER: 'malformed', MOCK_CALL_LOG: path.join(dir, 'provider-calls.log'),
    STRIPE_SECRET_KEY: '', NODE_ENV: 'test',
  };
  const requestKey = 'proj_local1::hero::abc123';
  const imageBody = { prompt: 'Fizzwell can on an orange backdrop', aspectRatio: '16:9', quality: 'high', model: 'gpt-image-1', projectId: 'proj_local1', requestKey };

  // ---- first process: one AI-plan attempt (unusable), one paid image ----
  const first = await startServer(env);
  try {
    const call = client(first.port);
    const signup = await call('POST', '/api/auth/signup', { email: 'diag-test@example.com', password: 'correct-horse-battery-staple' });
    assert.equal(signup.status, 200, JSON.stringify(signup.body));
    const plan = await call('POST', '/api/plan-website', { text: 'Fizzwell is a sparkling energy drink brand.', taskType: 'NEW_SITE', generationId: 'gen_test_1' });
    assert.equal(plan.body.ok, false, 'a malformed plan falls back');
    const img = await call('POST', '/api/generate-image', imageBody);
    assert.equal(img.body.ok, true);
    assert.ok(img.body.creditsCharged > 0, 'the first image is a real (mock-)paid call');
    const report = await call('POST', '/api/generation-diagnostics', { outcome: 'plan_fallback', reason: 'server_not_ok', generationId: 'gen_test_1', projectId: 'proj_local1' });
    assert.equal(report.body.ok, true);
    const bad = await call('POST', '/api/generation-diagnostics', { outcome: 'DROP TABLE', reason: 'x' });
    assert.equal(bad.status, 400, 'client outcomes are allowlisted');
  } finally { await first.stop(); }
  assert.equal(providerCalls(env.MOCK_CALL_LOG).filter(c => c.provider === 'openai').length, 1);

  // ---- second process: same database file, fresh memory ----
  const second = await startServer(env);
  try {
    const call = client(second.port);
    const events = await call('GET', '/api/admin/generation-events?limit=100', null, { 'x-admin-token': ADMIN });
    assert.equal(events.status, 200);
    const rows = events.body.entries;
    const planner = rows.find(r => r.kind === 'planner' && r.outcome === 'malformed_output');
    assert.ok(planner, 'the unusable-plan outcome survived the restart');
    assert.equal(planner.detail.generationId, 'gen_test_1');
    const delivered = rows.find(r => r.kind === 'image' && r.outcome === 'delivered' && r.request_key === requestKey);
    assert.ok(delivered && delivered.asset_hash, 'the delivered image and where it is stored survived the restart');
    assert.ok(rows.some(r => r.kind === 'client_outcome' && r.outcome === 'plan_fallback' && r.detail.generationId === 'gen_test_1'), 'the browser\'s own fallback report survived');
    assert.ok(rows.some(r => r.kind === 'operation' && r.provider === 'openai'), 'the operation ledger is durable now');

    const denied = await call('GET', '/api/admin/generation-events');
    assert.equal(denied.status, 404, 'diagnostics are not readable without the admin token');

    // The browser retries the same image after the restart (reload, dropped
    // connection): served from storage, no second provider call, no charge.
    await call('POST', '/api/auth/signin', { email: 'diag-test@example.com', password: 'correct-horse-battery-staple' });
    const replay = await call('POST', '/api/generate-image', imageBody);
    assert.equal(replay.body.ok, true);
    assert.equal(replay.body.replayed, true);
    assert.equal(replay.body.creditsCharged, 0);
    assert.ok(replay.body.dataUrl.startsWith('data:image/png;base64,'));

    // The public status route keeps its original, minimal shape.
    const publicStatus = await call('GET', '/api/planner-status');
    const allowed = new Set(['timestamp', 'outcome', 'latencyMs', 'model', 'errorCategory']);
    Object.keys(publicStatus.body.lastAttempt || {}).forEach(k => assert.ok(allowed.has(k), `public /api/planner-status leaked "${k}"`));
    assert.ok(!JSON.stringify(publicStatus.body).includes('gen_test_1'), 'the public status route never exposes diagnostic detail');
  } finally { await second.stop(); }
  assert.equal(providerCalls(env.MOCK_CALL_LOG).filter(c => c.provider === 'openai').length, 1, 'the replay made no provider call');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('recording a diagnostic can never break the request that triggered it', () => {
  const { createGenerationEvents } = require('../lib/generation-events');
  const broken = { generationEvents: { insert() { throw new Error('disk full'); }, deleteOlderThan() { throw new Error('disk full'); }, findLatestDeliveredImage() { throw new Error('x'); }, listRecent() { return []; } } };
  const events = createGenerationEvents(broken);
  assert.doesNotThrow(() => events.record({ kind: 'image', outcome: 'delivered' }));
  assert.equal(events.findDeliveredImage('a', 'k'), null);
  assert.ok(events.stats().writeFailures >= 1, 'failures are counted, not thrown');
});

test('diagnostics are bounded: rows older than the retention window are pruned', () => {
  process.env.SITEREMADE_BACKEND = 'local';
  const { resetDatabaseAdapter } = require('../lib/adapters/database-adapter');
  const db = resetDatabaseAdapter(':memory:');
  const { createGenerationEvents } = require('../lib/generation-events');
  let clock = new Date('2026-01-01T00:00:00Z');
  const events = createGenerationEvents(db, { now: () => clock, retentionDays: 30 });
  events.record({ kind: 'planner', outcome: 'success' });
  clock = new Date('2026-03-01T00:00:00Z'); // 59 days later, a new day
  events.record({ kind: 'planner', outcome: 'error' });
  const rows = events.listRecent({ limit: 10 });
  assert.deepEqual(rows.map(r => r.outcome), ['error']);
});

test('diagnostics never reach a generated site: the export path does not read them', () => {
  for (const file of ['lib/export-compiler.js', 'lib/site-render.js']) {
    const src = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
    assert.ok(!/generation[-_]?events|generationEvents|generation-diagnostics/i.test(src), `${file} must not touch diagnostics`);
  }
});

test('live PREMIUM_GENERATION_V1 image path: delivered through the same store, evaluation kept, replayed without a second paid call', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sr-diag-premium-'));
  const env = {
    SITEREMADE_BACKEND: 'local', SITEREMADE_DB_PATH: path.join(dir, 'app.db'), SITEREMADE_ASSET_STORE_DIR: path.join(dir, 'assets'),
    SITEREMADE_PREMIUM_LOG_DIR: path.join(dir, 'premium'), PREMIUM_GENERATION_V1: 'true',
    ANTHROPIC_API_KEY: 'test-only', OPENAI_API_KEY: 'test-only', SITEREMADE_PAID_IMAGES: 'true', SITEREMADE_IMAGE_BUDGET_USD: '5',
    SITEREMADE_ADMIN_TOKEN: ADMIN, MOCK_CALL_LOG: path.join(dir, 'provider-calls.log'), STRIPE_SECRET_KEY: '', NODE_ENV: 'test',
  };
  const requestKey = 'proj_local2::hero::def456';
  const imageBody = {
    prompt: 'Fizzwell can on an orange backdrop, studio light, no text', aspectRatio: '16:9', quality: 'medium', model: 'gpt-image-1',
    projectId: 'proj_local2', requestKey, premiumGenerationId: 'gen_premiumtest1', premiumTier: 'hero', promptAlt: 'Fizzwell can, plain orange backdrop, no text',
  };
  const server = await startServer(env);
  try {
    const call = client(server.port);
    const signup = await call('POST', '/api/auth/signup', { email: 'premium-test@example.com', password: 'correct-horse-battery-staple' });
    assert.equal(signup.status, 200, JSON.stringify(signup.body));
    const first = await call('POST', '/api/generate-image', imageBody);
    assert.equal(first.body.ok, true, JSON.stringify(first.body));
    assert.ok(first.body.creditsCharged > 0);
    assert.ok(first.body.evaluation, 'the live premium evaluation still reaches the browser');
    assert.equal(first.body.replayed, false);
    const paidCalls = providerCalls(env.MOCK_CALL_LOG).filter(c => c.provider === 'openai').length;
    assert.ok(paidCalls >= 1);

    const again = await call('POST', '/api/generate-image', imageBody);
    assert.equal(again.body.ok, true);
    assert.equal(again.body.replayed, true);
    assert.equal(again.body.creditsCharged, 0);
    assert.equal(again.body.dataUrl, first.body.dataUrl);
    assert.equal(providerCalls(env.MOCK_CALL_LOG).filter(c => c.provider === 'openai').length, paidCalls, 'the replay made no provider call');

    const events = await call('GET', '/api/admin/generation-events?limit=100', null, { 'x-admin-token': ADMIN });
    const rows = events.body.entries;
    assert.ok(rows.some(r => r.kind === 'image' && r.outcome === 'delivered' && r.request_key === requestKey && r.asset_hash));
    assert.ok(rows.some(r => r.kind === 'image' && r.outcome === 'replayed' && r.request_key === requestKey));
    assert.ok(rows.some(r => r.kind === 'operation' && r.provider === 'openai'), 'premium provider calls still reach the durable operation log');
  } finally { await server.stop(); }
  fs.rmSync(dir, { recursive: true, force: true });
});

test('a request whose browser disconnects produces TWO image rows: its delivery row (with the charge) plus client_disconnected (no charge)', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sr-diag-disconnect-'));
  const env = {
    SITEREMADE_BACKEND: 'local', SITEREMADE_DB_PATH: path.join(dir, 'app.db'), SITEREMADE_ASSET_STORE_DIR: path.join(dir, 'assets'),
    SITEREMADE_PREMIUM_LOG_DIR: path.join(dir, 'premium'), OPENAI_API_KEY: 'test-only', SITEREMADE_PAID_IMAGES: 'true', SITEREMADE_IMAGE_BUDGET_USD: '5',
    SITEREMADE_ADMIN_TOKEN: ADMIN, MOCK_IMAGE_DELAY_MS: '700', MOCK_CALL_LOG: path.join(dir, 'provider-calls.log'), STRIPE_SECRET_KEY: '', NODE_ENV: 'test',
  };
  const requestKey = 'proj_local3::hero::ghi789';
  const prompt = 'Fizzwell can on a cobalt backdrop, studio light, no text';
  const imageBody = { prompt, aspectRatio: '16:9', quality: 'medium', model: 'gpt-image-1-mini', projectId: 'proj_local3', requestKey };
  const server = await startServer(env);
  try {
    const call = client(server.port);
    const signup = await call('POST', '/api/auth/signup', { email: 'disconnect-test@example.com', password: 'correct-horse-battery-staple' });
    assert.equal(signup.status, 200, JSON.stringify(signup.body));

    // The browser gives up while the (mock) provider is still working.
    const controller = new AbortController();
    const pending = call('POST', '/api/generate-image', imageBody, {}, { signal: controller.signal }).catch(e => e);
    setTimeout(() => controller.abort(), 150);
    assert.equal((await pending).name, 'AbortError');

    let rows = [];
    for (let i = 0; i < 50 && !rows.some(r => r.outcome === 'client_disconnected'); i++) {
      await new Promise(r => setTimeout(r, 100));
      rows = (await call('GET', '/api/admin/generation-events?limit=100', null, { 'x-admin-token': ADMIN })).body.entries.filter(r => r.kind === 'image' && r.request_key === requestKey);
    }
    assert.deepEqual(rows.map(r => r.outcome).sort(), ['client_disconnected', 'delivered'], 'one delivery row plus one extra client_disconnected row');
    const delivered = rows.find(r => r.outcome === 'delivered');
    const gone = rows.find(r => r.outcome === 'client_disconnected');
    assert.ok(delivered.asset_hash, 'stored, so recoverable');
    assert.equal(delivered.credits_charged, 1, 'the charge is on the delivery row');
    assert.equal(gone.credits_charged, null, 'never double-counted on the disconnect row');
    assert.equal(gone.detail.deliveryOutcome, 'delivered');
    assert.equal(gone.detail.creditsChargedOnDeliveryRow, 1);
    assert.equal(gone.detail.recoverableByReplay, true);
    const chargedTotal = rows.filter(r => r.outcome === 'delivered' || r.outcome === 'delivered_not_stored').reduce((n, r) => n + r.credits_charged, 0);
    assert.equal(chargedTotal, 1, 'counting delivery outcomes only gives the real charge');
    assert.ok(rows.every(r => !JSON.stringify(r).includes('cobalt')), 'no prompt text in any row');
    assert.equal(delivered.detail.promptChars, prompt.length);

    // The browser comes back (retry / reload): replayed from storage, free.
    const replay = await call('POST', '/api/generate-image', imageBody);
    assert.equal(replay.body.replayed, true);
    assert.equal(replay.body.creditsCharged, 0);
  } finally { await server.stop(); }
  assert.equal(providerCalls(env.MOCK_CALL_LOG).filter(c => c.provider === 'openai').length, 1, 'paid exactly once');
  fs.rmSync(dir, { recursive: true, force: true });
});
