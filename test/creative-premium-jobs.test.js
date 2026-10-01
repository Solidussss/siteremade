'use strict';
// PREMIUM JOBS (lib/premium-jobs.js, server.js /api/creative/premium/start + /status): a generation's premium media is a
// durable, server-owned job. The browser starts it (a fast request) and polls it; the provider's minutes, a closed tab, an
// aborted fetch, a refresh or a server restart never end it or fail it; each role is submitted once, checked on its own,
// and the job is settled exactly once from what the provider delivered.
//
// EVERY provider here is a fake: an in-process fake Higgsfield on a fake clock (minutes of provider time in milliseconds of
// test time), or the mocked Higgsfield / Anthropic of test/helpers/run-server.js. Real provider spend: $0.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const PJ = require('../lib/premium-jobs');
const credits = require('../lib/credits');
const { resetSqliteAdapter } = require('../lib/adapters/sqlite-database-adapter');
const { startServer, client, providerCalls } = require('./helpers/server-process');
const { mockPng } = require('./helpers/mock-image');
const { startPremium, pollPremium, sleep } = require('./helpers/premium-job');

// ================================================================ in-process: a fake provider on a fake clock
const MIN = 60 * 1000;
function clock(t0) { let t = t0 || Date.parse('2026-10-01T12:00:00Z'); return { now: () => t, advance: ms => { t += ms; } }; }
// plan[i] = { ms: when the (i+1)-th submitted request finishes, outcome: 'completed' | 'failed' | 'never' }
function fakeProvider(c, plan) {
  let n = 0; const jobs = new Map(); const log = { submits: 0, status: 0, downloads: 0, cancels: 0, statusErrors: 0 }; let down = false;
  return {
    log, setDown: v => { down = v; },
    async submit(endpoint, params) { n++; log.submits++; const id = `fake_${n}`; jobs.set(id, Object.assign({ t0: c.now(), params }, plan[n - 1] || { ms: 0, outcome: 'completed' })); return { requestId: id, status: 'queued' }; },
    async status(id) { if (down) { log.statusErrors++; throw new Error('Higgsfield did not answer in time'); } log.status++; const j = jobs.get(id); if (j.outcome === 'never' || c.now() - j.t0 < j.ms) return { status: c.now() - j.t0 < 30000 ? 'queued' : 'in_progress', requestId: id }; return j.outcome === 'failed' ? { status: 'failed', requestId: id } : { status: 'completed', requestId: id, outputUrl: `https://fake-output.test/${id}.mp4`, mediaType: 'video' }; },
    async cancel() { log.cancels++; return true; },
    async download(url) { log.downloads++; return { bytes: Buffer.from(`mp4:${url}`), mime: 'video/mp4' }; },
  };
}
const PRESETS = { video_5s_720p: { endpoint: 'kling-video/v3.0/4k/image-to-video', mediaType: 'video', params: { duration: 5, sound: 'off' }, costKey: 'video_4k' } };
const COSTS = { higgsfield: { video_4k: 2.1 } };
const QUIET = Object.assign(PJ.policy({}), { firstCheckMs: 1e9, checkMs: 1e9, maxCheckMs: 1e9 }); // (no timer fires: the test ticks)
let dbn = 0;
function setup(roles, plan, opts) {
  const o = opts || {}; const file = path.join(os.tmpdir(), `sr-pj-${process.pid}-${Date.now()}-${dbn++}.db`); const db = resetSqliteAdapter(file);
  const c = clock(); const at = new Date(c.now());
  credits.grant(db, { id: 'purchase:t1', accountId: 'acct_t', kind: 'purchase', amount: 100, source: 'test', now: at });
  const amount = roles.reduce((n, r) => n + 12, 0);
  const res = credits.reserve(db, { accountId: 'acct_t', opId: 'cj_testjob0001:premium', amount, kind: 'creative_premium', now: at });
  assert.equal(res.ok, true);
  const provider = fakeProvider(c, plan);
  const spec = { accountId: 'acct_t', creativeJobId: 'cj_testjob0001', opId: 'cj_testjob0001:premium', mode: roles.length > 1 ? 'showcase' : 'hero', strategy: roles.length > 1 ? 'showcase' : 'standard', creditsReserved: amount,
    roles: roles.map((role, i) => ({ role, intent: role === 'takeover' ? 'premium_transition' : 'cinematic_hero', sourceAssetId: i === 1 ? 'u2' : 'u1', sourceRef: 'a'.repeat(64), mime: 'image/png', sourceBase: 'https://siteremade.test', preset: 'video_5s_720p', mediaType: 'video', subject: 'Zorbo', credits: 12, state: 'pending' })) };
  const worker = (owner) => PJ.createWorker({ db, provider, presets: PRESETS, costs: COSTS, store: bytes => require('crypto').createHash('sha256').update(bytes).digest('hex'), sourceUrl: async () => 'https://siteremade.test/api/premium-media/source/tok', policy: Object.assign({}, QUIET, o.policy || {}), now: c.now, owner });
  return { db, c, provider, spec, worker, balance: () => credits.available(db, 'acct_t', new Date(c.now())).total, file };
}
const viewOf = (db, id) => PJ.view(db.premiumJobs.find(id));
const counts = db => db.creditEvents.forAccount('acct_t', 100).reduce((m, e) => (m[e.type] = (m[e.type] || 0) + 1, m), {});

test('1. a clip that takes the provider 6.5 minutes: the job is created at once, checked on a schedule, delivered later -- and charged once', async () => {
  const t = setup(['single'], [{ ms: 6.5 * MIN, outcome: 'completed' }]);
  const t0 = Date.now(); const { job } = PJ.create(t.db, t.spec, t.c.now()); assert.ok(Date.now() - t0 < 200, 'creating the job does not wait for anything');
  assert.equal(viewOf(t.db, job.id).status, 'queued'); assert.equal(viewOf(t.db, job.id).message, 'Creating cinematic hero…');
  const w = t.worker('w1'); await w.tick(job.id);
  assert.equal(t.provider.log.submits, 1); assert.ok(['submitted', 'processing'].includes(viewOf(t.db, job.id).roles[0].state));
  for (let m = 1; m <= 6; m++) { t.c.advance(MIN); await w.tick(job.id); assert.equal(viewOf(t.db, job.id).status, 'running', `minute ${m}: still running, never failed`); }
  t.c.advance(MIN); await w.tick(job.id);
  const v = viewOf(t.db, job.id); assert.equal(v.status, 'completed'); assert.equal(v.message, 'Cinematic hero ready'); assert.equal(v.delivered.length, 1);
  assert.deepEqual(v.credits, { reserved: 12, charged: 12, refunded: 0, settled: true }); assert.equal(t.provider.log.submits, 1, 'one submit, ever');
  assert.equal(t.db.premiumMedia.find(v.delivered[0].video.mediaId).status, 'completed', 'stored with its provenance');
  w.stop();
});

test('2. a showcase\'s three clips finish at different times: 0/3 -> 1/3 -> 2/3 -> 3/3, each role on its own', async () => {
  const t = setup(['hero', 'takeover', 'payoff'], [{ ms: 2 * MIN }, { ms: 4 * MIN }, { ms: 6 * MIN }]);
  const { job } = PJ.create(t.db, t.spec, t.c.now()); const w = t.worker('w1'); await w.tick(job.id);
  assert.equal(t.provider.log.submits, 3, 'all three submitted at once, not one after another');
  const seen = []; const states = [];
  for (let m = 0; m <= 7; m++) { const v = viewOf(t.db, job.id); seen.push(v.completed); states.push(v.roles.map(r => r.state[0]).join('')); t.c.advance(MIN); await w.tick(job.id); }
  assert.deepEqual([...new Set(seen)], [0, 1, 2, 3]);
  assert.ok(states.includes('dpp'), `hero ready while the others are processing: ${states}`);
  assert.equal(viewOf(t.db, job.id).message, 'Premium videos ready'); assert.ok(seen.some(x => x === 1));
  const mid = PJ.messageFor('running', [{ state: 'delivered' }, { state: 'processing' }, { state: 'submitted' }]); assert.equal(mid, 'Creating premium videos — 1 of 3 complete');
  assert.deepEqual(viewOf(t.db, job.id).credits, { reserved: 36, charged: 36, refunded: 0, settled: true });
  w.stop();
});

test('3. one clip fails at the provider: the other two are kept, only the failed role is returned -- and the message says so', async () => {
  const t = setup(['hero', 'takeover', 'payoff'], [{ ms: MIN }, { ms: 2 * MIN }, { ms: 2 * MIN, outcome: 'failed' }]);
  const before = t.balance(); const { job } = PJ.create(t.db, t.spec, t.c.now()); const w = t.worker('w1'); await w.tick(job.id);
  for (let m = 0; m < 4; m++) { t.c.advance(MIN); await w.tick(job.id); }
  const v = viewOf(t.db, job.id);
  assert.equal(v.status, 'partial'); assert.deepEqual(v.delivered.map(m => m.role), ['hero', 'takeover']); assert.deepEqual(v.failed.map(f => f.role), ['payoff']);
  assert.deepEqual(v.credits, { reserved: 36, charged: 24, refunded: 12, settled: true });
  assert.equal(v.message, '2 of 3 premium videos ready. Payoff failed (the provider reported failed); 12 credits returned.');
  assert.equal(t.balance(), before + 12, 'the payoff\'s 12 credits are back in the balance');
  w.stop();
});

test('4. a server restart: a new worker picks the job up from the database -- delivered roles stay delivered, nothing is resubmitted, settled once', async () => {
  const t = setup(['hero', 'takeover', 'payoff'], [{ ms: MIN }, { ms: 5 * MIN }, { ms: 5 * MIN }]);
  const { job } = PJ.create(t.db, t.spec, t.c.now()); const a = t.worker('before-restart'); await a.tick(job.id);
  t.c.advance(2 * MIN); await a.tick(job.id); assert.equal(viewOf(t.db, job.id).completed, 1);
  a.stop(); // (the process dies; its lease is left behind)
  // the new process opens the same database; the old lease expires; the job is resumed
  const db2 = resetSqliteAdapter(t.file); const b = PJ.createWorker({ db: db2, provider: t.provider, presets: PRESETS, costs: COSTS, store: () => 'b'.repeat(64), sourceUrl: async () => 'x', policy: QUIET, now: t.c.now, owner: 'after-restart' });
  assert.equal(db2.premiumJobs.active().length, 1, 'the job is found again from the database');
  t.c.advance(5 * MIN); await b.tick(job.id);
  const v = PJ.view(db2.premiumJobs.find(job.id));
  assert.equal(v.status, 'completed'); assert.equal(t.provider.log.submits, 3, 'no role was submitted again'); assert.deepEqual(v.credits, { reserved: 36, charged: 36, refunded: 0, settled: true });
  assert.equal(b.resumeAll(), 0, 'a finished job is not resumed'); b.stop();
});

test('5. a crash in the middle of a submit: never sent again (the provider may have it) -- failed and returned', async () => {
  const t = setup(['single'], [{ ms: MIN }]);
  const { job } = PJ.create(t.db, t.spec, t.c.now()); const row = t.db.premiumJobs.find(job.id); const roles = PJ.rolesOf(row); roles[0].state = 'submitting';
  t.db.premiumJobs.update(job.id, row.version, { roles_json: JSON.stringify(roles), status: 'running' }, new Date(t.c.now()).toISOString());
  const w = t.worker('w1'); await w.tick(job.id);
  const v = viewOf(t.db, job.id); assert.equal(t.provider.log.submits, 0, 'not resubmitted'); assert.equal(v.status, 'failed'); assert.equal(v.failed[0].code, 'submission_uncertain');
  assert.deepEqual(v.credits, { reserved: 12, charged: 0, refunded: 12, settled: true }); w.stop();
});

test('6. idempotency: one job per generation, one submit per role even with two workers, one settlement however often it is asked', async () => {
  const t = setup(['hero', 'takeover', 'payoff'], [{ ms: MIN }, { ms: MIN }, { ms: MIN }]);
  const first = PJ.create(t.db, t.spec, t.c.now()); const again = PJ.create(t.db, t.spec, t.c.now());
  assert.equal(again.reused, true); assert.equal(again.job.id, first.job.id, 'a second start returns the first job');
  const w1 = t.worker('w1'), w2 = t.worker('w2');
  await Promise.all([w1.tick(first.job.id), w2.tick(first.job.id)]); // (two workers at once: the lease lets one through)
  assert.equal(t.provider.log.submits, 3);
  t.c.advance(2 * MIN); await w1.tick(first.job.id); await w2.tick(first.job.id);
  const ev = counts(t.db); const v = viewOf(t.db, first.job.id); assert.equal(v.status, 'completed');
  for (let i = 0; i < 5; i++) { PJ.settle(t.db, first.job.id, t.c.now()); await w1.tick(first.job.id); }
  assert.deepEqual(counts(t.db), ev, 'repeated settlement and ticks change nothing'); assert.deepEqual(viewOf(t.db, first.job.id), v);
  assert.equal(t.provider.log.submits, 3); w1.stop(); w2.stop();
});

test('7. the provider unreachable for a while is not a failure; the explicit server-side deadline is -- cancelled and returned', async () => {
  const t = setup(['single'], [{ ms: 10 * MIN }], { policy: { roleDeadlineMs: 30 * MIN } });
  const { job } = PJ.create(t.db, t.spec, t.c.now()); const w = t.worker('w1'); await w.tick(job.id);
  t.provider.setDown(true); for (let i = 0; i < 5; i++) { t.c.advance(MIN); await w.tick(job.id); }
  assert.equal(viewOf(t.db, job.id).status, 'running', 'a status check that fails is only a missed check');
  t.provider.setDown(false); t.c.advance(6 * MIN); await w.tick(job.id); assert.equal(viewOf(t.db, job.id).status, 'completed');
  // a clip that never finishes: failed at the deadline (30 minutes here), cancelled at the provider, returned
  const u = setup(['single'], [{ outcome: 'never' }], { policy: { roleDeadlineMs: 30 * MIN } });
  const j2 = PJ.create(u.db, u.spec, u.c.now()).job; const w2 = u.worker('w1'); await w2.tick(j2.id);
  u.c.advance(29 * MIN); await w2.tick(j2.id); assert.equal(viewOf(u.db, j2.id).status, 'running');
  u.c.advance(2 * MIN); await w2.tick(j2.id);
  const v = viewOf(u.db, j2.id); assert.equal(v.status, 'failed'); assert.equal(v.failed[0].code, 'timed_out'); assert.equal(u.provider.log.cancels, 1); assert.equal(v.credits.refunded, 12);
  w.stop(); w2.stop();
});

test('8. a role the start could not use (no eligible upload, over the provider ceiling) is blocked: never sent, never charged', async () => {
  const t = setup(['hero', 'takeover', 'payoff'], [{ ms: MIN }, { ms: MIN }]);
  t.spec.roles[2] = Object.assign({}, t.spec.roles[2], { state: 'blocked', failure: { code: 'budget_blocked', reason: 'the provider budget could not carry it' } });
  const { job } = PJ.create(t.db, t.spec, t.c.now()); const w = t.worker('w1'); await w.tick(job.id); t.c.advance(2 * MIN); await w.tick(job.id);
  const v = viewOf(t.db, job.id); assert.equal(t.provider.log.submits, 2); assert.equal(v.status, 'partial'); assert.deepEqual(v.credits, { reserved: 36, charged: 24, refunded: 12, settled: true });
  w.stop();
});

// ================================================================ the real server (Higgsfield and the models mocked)
async function withServer(env, fn, dirIn) {
  const dir = dirIn || fs.mkdtempSync(path.join(os.tmpdir(), 'sr-pj-srv-'));
  const e = Object.assign({ SITEREMADE_BACKEND: 'local', SITEREMADE_DB_PATH: path.join(dir, 'app.db'), SITEREMADE_ASSET_STORE_DIR: path.join(dir, 'assets'), SITEREMADE_EXPORTS_DIR: path.join(dir, 'exports'), SITEREMADE_PREMIUM_LOG_DIR: path.join(dir, 'p'), ANTHROPIC_API_KEY: 'test-only', OPENAI_API_KEY: '', STRIPE_SECRET_KEY: '', SITEREMADE_TRIAL_CREDITS: '60', MOCK_CALL_LOG: path.join(dir, 'calls.log'), NODE_ENV: 'test', HIGGSFIELD_API_KEY: 'hf-test-key:secret', HIGGSFIELD_VIDEO_ENDPOINT: 'https://api.higgsfield.ai/kling-video/v3.0/4k/image-to-video' }, env);
  const s = await startServer(e);
  try { await fn({ s, dir, port: s.port, calls: () => providerCalls(e.MOCK_CALL_LOG), env: e }); } finally { await s.stop(); if (!dirIn) fs.rmSync(dir, { recursive: true, force: true }); }
}
const SHOW = { on: true, moments: 3, eligibleUploads: 2 }; const HERO = { on: true, moments: 1, eligibleUploads: 1 };
const BRIEF = 'A showcase for Zorbo, our sneaker brand';
const hd = id => ({ id, origin: 'upload', title: id, mime: 'image/png', dataUrl: mockPng(id, '16:9-hd') });
async function signUp(call) { const who = { email: `pj-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@example.com`, password: 'correct-horse-battery-staple' }; await call('POST', '/api/auth/signup', who); return who; }
async function generation(call, premium, signedIn) {
  if (!signedIn) await signUp(call);
  const ask = await call('POST', '/api/creative/research', { brief: BRIEF, premium });
  const r = ask.body.needsConfirmation ? await call('POST', '/api/creative/research', { brief: BRIEF, premium, quoteId: ask.body.quote.id }) : ask;
  return r.body.jobId;
}
const body = (jobId, extra) => Object.assign({ jobId, brief: BRIEF, heroAsset: 'u1', premiumArc: [{ role: 'hero', asset: 'u1' }, { role: 'takeover', asset: 'u2' }, { role: 'payoff', asset: 'u1' }], assets: [hd('u1'), hd('u2')] }, extra || {});
const submits = calls => calls().filter(c => c.provider === 'higgsfield' && /image-to-video$/.test(c.endpoint)).length;

test('9. server: the start returns at once while the clip takes far longer; polling sees it delivered; a showcase goes 0/3 -> 3/3', async () => {
  await withServer({ MOCK_HIGGSFIELD_MS: '2500' }, async ({ port, calls }) => {
    const call = client(port); const jobId = await generation(call, HERO);
    const t0 = Date.now(); const st = await startPremium(call, body(jobId)); const took = Date.now() - t0;
    assert.equal(st.body.ok, true); assert.ok(took < 1500, `the start returned in ${took} ms`); assert.ok(['queued', 'running'].includes(st.body.job.status));
    const end = await pollPremium(call, st.body.job.jobId); assert.equal(end.body.job.status, 'completed'); assert.equal(end.body.job.credits.charged, 12); assert.equal(submits(calls), 1);
  });
  await withServer({ MOCK_HIGGSFIELD_MS: '700,1600,2500' }, async ({ port }) => {
    const call = client(port); const jobId = await generation(call, SHOW);
    const st = await startPremium(call, body(jobId)); const seen = [];
    const last = await pollPremium(call, st.body.job.jobId, { until: j => { seen.push(j.completed); return false; } }); seen.push(last.body.job.completed);
    const order = seen.filter((x, i) => i === 0 || x !== seen[i - 1]);
    assert.deepEqual(order, [0, 1, 2, 3], `progress ${order}`); assert.ok(order.every((x, i) => !i || x > order[i - 1]), 'never backwards');
  });
});

test('10. server: the browser goes away right after the start (aborted fetch, closed tab, cancelled poll) -- the job carries on; a reload finds the same job', async () => {
  await withServer({ MOCK_HIGGSFIELD_MS: '1500,1800,2100' }, async ({ port, calls }) => {
    const call = client(port); const jobId = await generation(call, SHOW);
    // the start is sent and the page goes away before its answer is read
    const ctl = new AbortController(); const sent = call('POST', '/api/creative/premium/start', body(jobId), {}, { signal: ctl.signal }).catch(e => ({ aborted: String(e.name) }));
    await sleep(120); ctl.abort(); await sent;
    await sleep(300);
    // a poll that is itself cancelled half-way
    const again = await startPremium(call, body(jobId)); assert.equal(again.body.reused, true, 'the reload gets the job that is already running'); const pj = again.body.job.jobId;
    const c2 = new AbortController(); const p = call('GET', `/api/creative/premium/status/${pj}`, undefined, {}, { signal: c2.signal }).catch(() => null); c2.abort(); await p;
    const mid = await call('GET', `/api/creative/premium/status/${pj}`); assert.notEqual(mid.body.job.status, 'failed', 'a cancelled request is not a failure');
    const end = await pollPremium(call, pj); assert.equal(end.body.job.status, 'completed'); assert.equal(submits(calls), 3, 'three clips, each sent once');
  });
});

test('11. server: one fake provider failure in a showcase -- two clips kept, only the failed role returned', async () => {
  await withServer({ MOCK_HIGGSFIELD: 'fail-3', MOCK_HIGGSFIELD_MS: '300,500,700' }, async ({ port }) => {
    const call = client(port); const jobId = await generation(call, SHOW);
    const st = await startPremium(call, body(jobId)); const end = await pollPremium(call, st.body.job.jobId); const j = end.body.job;
    assert.equal(j.status, 'partial'); assert.deepEqual(j.delivered.map(m => m.role), ['hero', 'takeover']); assert.deepEqual(j.failed.map(f => f.role), ['payoff']);
    assert.deepEqual(j.credits, { reserved: 36, charged: 24, refunded: 12, settled: true }); assert.match(j.message, /^2 of 3 premium videos ready\. Payoff failed .*; 12 credits returned\.$/);
  });
});

test('12. server: a restart in the middle -- the job reloads from the database, its checks continue, nothing is sent twice, it is settled once', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sr-pj-restart-'));
  let pj = null; let who = null; const env = { MOCK_HIGGSFIELD_MS: '2500,3000,3500' };
  try {
    await withServer(env, async ({ port }) => {
      const call = client(port); who = await signUp(call); const jobId = await generation(call, SHOW, true);
      const st = await startPremium(call, body(jobId)); pj = st.body.job.jobId;
      await pollPremium(call, pj, { until: j => j.roles.every(r => r.state === 'submitted' || r.state === 'processing') });
    }, dir); // (the process stops here: its timers die with it)
    // a new process on the same database; the mock provider's clips kept running meanwhile
    await withServer(env, async ({ port, calls }) => {
      const call = client(port); const si = await call('POST', '/api/auth/signin', who); assert.equal(si.status, 200, JSON.stringify(si.body));
      const end = await pollPremium(call, pj);
      const v = end.body.job; assert.equal(v.status, 'completed', JSON.stringify(v.roles)); assert.deepEqual(v.credits, { reserved: 36, charged: 36, refunded: 0, settled: true });
      assert.equal(submits(calls), 3, 'the three submits were the first process\'s: the new one sent nothing again');
      const all = calls().filter(c => c.provider === 'higgsfield' && /image-to-video$/.test(c.endpoint)).length; assert.equal(all, 3);
    }, dir);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('13. server: two starts at once -> one job, one set of submits, one reservation; polling it again and again changes nothing', async () => {
  await withServer({ MOCK_HIGGSFIELD_MS: '400,500,600' }, async ({ port, calls }) => {
    const call = client(port); const jobId = await generation(call, SHOW);
    const before = (await call('GET', '/api/credits')).body.credits.remaining;
    const [a, b] = await Promise.all([startPremium(call, body(jobId)), startPremium(call, body(jobId))]);
    assert.equal(a.body.job.jobId, b.body.job.jobId); assert.ok(a.body.reused || b.body.reused);
    assert.equal((await call('GET', '/api/credits')).body.credits.remaining, before, 'no second reservation');
    const end = await pollPremium(call, a.body.job.jobId); const remaining = end.body.creditsRemaining; const v = end.body.job;
    for (let i = 0; i < 15; i++) { const p = await call('GET', `/api/creative/premium/status/${v.jobId}`); assert.deepEqual(p.body.job, v); assert.equal(p.body.creditsRemaining, remaining); }
    assert.equal(submits(calls), 3); assert.equal(v.delivered.length, 3, 'three clips, no duplicates');
    // a start for a finished generation returns the finished job: nothing is made again
    const late = await startPremium(call, body(jobId)); assert.equal(late.body.reused, true); assert.equal(late.body.job.status, 'completed'); assert.equal(submits(calls), 3);
    // every provider call went to the mocks
    calls().forEach(c => assert.ok(['anthropic', 'higgsfield'].includes(c.provider), JSON.stringify(c)));
  });
});
