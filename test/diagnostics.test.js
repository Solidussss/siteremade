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

test('planner outcomes and admission failures are still readable after a server restart; a Business image request is refused, never paid', async () => {
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
    assert.equal(img.body.ok, false); assert.equal(img.body.starterVisualsOnly, true); assert.equal(img.body.creditsCharged, 0);
    const report = await call('POST', '/api/generation-diagnostics', { outcome: 'plan_fallback', reason: 'server_not_ok', generationId: 'gen_test_1', projectId: 'proj_local1' });
    assert.equal(report.body.ok, true);
    // a website that is not admitted says exactly why (script.js generationFailureDiagnostic)
    const rejected = await call('POST', '/api/generation-diagnostics', { outcome: 'admission_rejected', generationId: 'gen_test_1', projectId: 'proj_local1', phase: 'admission', starterVisualsOnly: true, blockers: ['duplicate_section_ids'], unresolvedSlots: [], duplicateSlots: [], duplicateSectionIds: ['sec_a'], error: null });
    assert.equal(rejected.body.ok, true);
    const bad = await call('POST', '/api/generation-diagnostics', { outcome: 'DROP TABLE', reason: 'x' });
    assert.equal(bad.status, 400, 'client outcomes are allowlisted');
  } finally { await first.stop(); }
  assert.equal(providerCalls(env.MOCK_CALL_LOG).filter(c => c.provider === 'openai').length, 0, 'the image provider is never called for a Business site');

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
    assert.ok(!rows.some(r => r.kind === 'image' && r.outcome === 'delivered'), 'no image was delivered');
    const admission = rows.find(r => r.kind === 'client_outcome' && r.outcome === 'admission_rejected');
    assert.ok(admission, 'the admission failure survived the restart');
    assert.deepEqual([admission.detail.phase, admission.detail.starterVisualsOnly, admission.detail.blockers, admission.detail.duplicateSectionIds], ['admission', true, ['duplicate_section_ids'], ['sec_a']]);
    assert.ok(rows.some(r => r.kind === 'client_outcome' && r.outcome === 'plan_fallback' && r.detail.generationId === 'gen_test_1'), 'the browser\'s own fallback report survived');
    assert.ok(!rows.some(r => r.kind === 'operation' && r.provider === 'openai'), 'no image provider operation');

    const denied = await call('GET', '/api/admin/generation-events');
    assert.equal(denied.status, 404, 'diagnostics are not readable without the admin token');


    // The public status route keeps its original, minimal shape.
    const publicStatus = await call('GET', '/api/planner-status');
    const allowed = new Set(['timestamp', 'outcome', 'latencyMs', 'model', 'errorCategory']);
    Object.keys(publicStatus.body.lastAttempt || {}).forEach(k => assert.ok(allowed.has(k), `public /api/planner-status leaked "${k}"`));
    assert.ok(!JSON.stringify(publicStatus.body).includes('gen_test_1'), 'the public status route never exposes diagnostic detail');
  } finally { await second.stop(); }
  assert.equal(providerCalls(env.MOCK_CALL_LOG).filter(c => c.provider === 'openai').length, 0);
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

test('PREMIUM_GENERATION_V1 on: a premium image request for a Business site is refused before any credit, provider call or delivery row', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sr-diag-premium-'));
  const env = {
    SITEREMADE_BACKEND: 'local', SITEREMADE_DB_PATH: path.join(dir, 'app.db'), SITEREMADE_ASSET_STORE_DIR: path.join(dir, 'assets'),
    SITEREMADE_PREMIUM_LOG_DIR: path.join(dir, 'premium'), PREMIUM_GENERATION_V1: 'true',
    ANTHROPIC_API_KEY: 'test-only', OPENAI_API_KEY: 'test-only', SITEREMADE_PAID_IMAGES: 'true', SITEREMADE_IMAGE_BUDGET_USD: '5',
    SITEREMADE_ADMIN_TOKEN: ADMIN, MOCK_CALL_LOG: path.join(dir, 'provider-calls.log'), STRIPE_SECRET_KEY: '', NODE_ENV: 'test',
  };
  const imageBody = {
    prompt: 'Fizzwell can on an orange backdrop, studio light, no text', aspectRatio: '16:9', quality: 'medium', model: 'gpt-image-1',
    projectId: 'proj_local2', requestKey: 'proj_local2::hero::def456', premiumGenerationId: 'gen_premiumtest1', premiumTier: 'hero', promptAlt: 'Fizzwell can, plain orange backdrop, no text',
  };
  const server = await startServer(env);
  try {
    const call = client(server.port);
    const signup = await call('POST', '/api/auth/signup', { email: 'premium-test@example.com', password: 'correct-horse-battery-staple' });
    assert.equal(signup.status, 200, JSON.stringify(signup.body));
    const before = (await call('GET', '/api/credits')).body.credits.remaining;
    for (let i = 0; i < 2; i++) {
      const r = await call('POST', '/api/generate-image', imageBody);
      assert.equal(r.body.ok, false); assert.equal(r.body.starterVisualsOnly, true); assert.equal(r.body.creditsCharged, 0);
    }
    assert.equal((await call('GET', '/api/credits')).body.credits.remaining, before);
    const rows = (await call('GET', '/api/admin/generation-events?limit=100', null, { 'x-admin-token': ADMIN })).body.entries;
    const imageRows = rows.filter(r => r.kind === 'image');
    assert.ok(imageRows.length && imageRows.every(r => r.outcome === 'starter_visuals_only'), 'each refused request is logged as refused, none as delivered');
    assert.ok(!rows.some(r => r.kind === 'operation' && r.provider === 'openai'), 'no image provider operation');
  } finally { await server.stop(); }
  assert.equal(providerCalls(env.MOCK_CALL_LOG).filter(c => c.provider === 'openai').length, 0);
  fs.rmSync(dir, { recursive: true, force: true });
});
