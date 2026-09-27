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
const { spawn } = require('child_process');

const RUNNER = path.join(__dirname, 'helpers', 'run-server.js');
const ADMIN = 'test-admin-token';

function startServer(env) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [RUNNER], { env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    const timer = setTimeout(() => { child.kill(); reject(new Error('server did not start:\n' + out)); }, 20000);
    child.stdout.on('data', d => {
      out += d;
      const m = /LISTENING (\d+)/.exec(out);
      if (m) { clearTimeout(timer); resolve({ port: Number(m[1]), stop: () => new Promise(r => { child.once('exit', r); child.kill(); }) }); }
    });
    child.stderr.on('data', d => { out += d; });
    child.once('exit', code => { clearTimeout(timer); if (!/LISTENING/.test(out)) reject(new Error(`server exited ${code}:\n${out}`)); });
  });
}
function client(port) {
  const jar = new Map(); // cookie name -> value (a session cookie must survive an unrelated Set-Cookie)
  return async function call(method, url, body, headers = {}) {
    const cookie = [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
    const res = await fetch(`http://127.0.0.1:${port}${url}`, {
      method, headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}), ...headers },
      body: body ? JSON.stringify(body) : undefined,
    });
    (res.headers.getSetCookie ? res.headers.getSetCookie() : []).forEach(c => {
      const [pair] = c.split(';'); const i = pair.indexOf('=');
      jar.set(pair.slice(0, i).trim(), pair.slice(i + 1));
    });
    return { status: res.status, body: await res.json().catch(() => null) };
  };
}
const providerCalls = file => fs.existsSync(file) ? fs.readFileSync(file, 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l)) : [];

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
