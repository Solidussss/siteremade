'use strict';
// PREMIUM JOBS (lib/premium-jobs.js, server.js /api/creative/premium/start + /status): the ONE way provider money is spent
// on premium media -- the durable, server-owned job of a generation whose owner chose a video mode. These tests hold its
// money rules: one provider submission per role at most, never more clips than the mode, never past the budget, never a
// blind resubmission, a deadline that never pretends a provider cost away, a download retried without regenerating, a kill
// switch, truthful wording ("SiteRemade credits returned"), and per-role cost telemetry.
//
// EVERY provider here is a fake: an in-process fake Higgsfield on a fake clock (minutes and hours of provider time in
// milliseconds of test time), or the mocked Higgsfield / Anthropic of test/helpers/run-server.js. Real provider spend: $0.
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
const MIN = 60 * 1000, HOUR = 60 * MIN;
function clock(t0) { let t = t0 || Date.parse('2026-10-01T12:00:00Z'); return { now: () => t, advance: ms => { t += ms; } }; }
// plan[i] for the (i+1)-th submit: { ms: when it finishes, outcome: 'completed' | 'failed' | 'never', cancel: 'honour' |
// 'ignore' } -- and failure modes of the provider itself: submitError (with a status, or none), downloadFailures
function fakeProvider(c, plan, opts) {
  const o = opts || {}; let n = 0; const jobs = new Map(); let down = false; let dlFails = o.downloadFailures || 0;
  const log = { submits: 0, status: 0, downloads: 0, cancels: 0, statusErrors: 0, params: [] };
  return {
    log, setDown: v => { down = v; },
    async submit(endpoint, params) {
      n++; log.submits++; log.params.push(params);
      if (o.submitError) { const e = new Error(o.submitError.message || 'fetch failed'); if (o.submitError.status) e.status = o.submitError.status; throw e; }
      const id = `fake_${n}`; jobs.set(id, Object.assign({ t0: c.now() }, plan[n - 1] || { ms: 0, outcome: 'completed' })); return { requestId: id, status: 'queued' };
    },
    async status(id) {
      if (down) { log.statusErrors++; throw new Error('Higgsfield did not answer in time'); }
      log.status++; const j = jobs.get(id);
      if (j.cancelled) return { status: 'canceled', requestId: id };
      if (j.outcome === 'never' || c.now() - j.t0 < j.ms) return { status: c.now() - j.t0 < 30000 ? 'queued' : 'in_progress', requestId: id };
      return j.outcome === 'failed' ? { status: 'failed', requestId: id } : { status: 'completed', requestId: id, outputUrl: `https://fake-output.test/${id}.mp4`, mediaType: 'video' };
    },
    async cancel(id) { log.cancels++; const j = jobs.get(id); if (j && j.cancel === 'honour') j.cancelled = true; return true; },
    async download(url) { log.downloads++; if (dlFails > 0) { dlFails--; throw new Error('the output could not be downloaded (503)'); } return { bytes: Buffer.from(`mp4:${url}`), mime: 'video/mp4' }; },
  };
}
const PRESETS = { video_clip: { endpoint: 'kling-video/v3.0/4k/image-to-video', mediaType: 'video', params: { duration: 5, sound: 'off' }, costKey: 'video_clip', resolution: '4k', durationS: 5 } };
const COSTS = { higgsfield: { video_clip: 2.1 }, higgsfieldBudget: { video_clip: 2.25 } };
const QUIET = Object.assign(PJ.policy({}), { firstCheckMs: 1e9, checkMs: 1e9, maxCheckMs: 1e9, lateCheckMs: 1e9 }); // (no timer fires: the test ticks)
let dbn = 0;
function setup(roles, plan, opts) {
  const o = opts || {}; const file = path.join(os.tmpdir(), `sr-pj-${process.pid}-${Date.now()}-${dbn++}.db`); const db = resetSqliteAdapter(file);
  const c = clock(); const at = new Date(c.now()); const mode = o.mode || (roles.length > 1 ? 'showcase' : 'hero');
  credits.grant(db, { id: 'purchase:t1', accountId: 'acct_t', kind: 'purchase', amount: 100, source: 'test', now: at });
  const amount = roles.length * 12;
  assert.equal(credits.reserve(db, { accountId: 'acct_t', opId: 'cj_testjob0001:premium', amount, kind: 'creative_premium', now: at }).ok, true);
  const provider = fakeProvider(c, plan, o.provider);
  const spec = { accountId: 'acct_t', creativeJobId: 'cj_testjob0001', opId: 'cj_testjob0001:premium', mode, strategy: mode === 'showcase' ? 'showcase' : 'standard', creditsReserved: amount, budgetUsd: o.budgetUsd != null ? o.budgetUsd : Math.min(roles.length, PJ.MAX_CLIPS[mode]) * 2.25,
    roles: roles.map((role, i) => ({ role, intent: role === 'takeover' ? 'premium_transition' : 'cinematic_hero', sourceAssetId: i === 1 ? 'u2' : 'u1', sourceRef: 'a'.repeat(64), mime: 'image/png', sourceBase: 'https://siteremade.test', preset: 'video_clip', mediaType: 'video', subject: 'Zorbo', credits: 12, estimatedUsd: 2.25, observedUsd: 2.1, state: 'pending' })) };
  let on = true;
  const worker = (owner) => PJ.createWorker({ db, provider, presets: PRESETS, costs: COSTS, store: bytes => require('crypto').createHash('sha256').update(bytes).digest('hex'),
    sourceUrl: async (r) => `https://siteremade.test/api/premium-media/source/tok_${r.role}`, releaseSource: () => {}, enabled: () => on,
    policy: Object.assign({}, QUIET, o.policy || {}), now: c.now, owner });
  return { db, c, provider, spec, worker, switchOff: () => { on = false; }, balance: () => credits.available(db, 'acct_t', new Date(c.now())).total, file };
}
const viewOf = (db, id) => PJ.view(db.premiumJobs.find(id));
const counts = db => db.creditEvents.forAccount('acct_t', 100).reduce((m, e) => (m[e.type] = (m[e.type] || 0) + 1, m), {});
const creditsOf = v => ({ reserved: v.credits.reserved, charged: v.credits.charged, returned: v.credits.returned, settled: v.credits.settled });

test('1. a clip that takes the provider 6.5 minutes (past the old ~5-minute request death): created at once, never failed while it runs, delivered later, charged once', async () => {
  const t = setup(['single'], [{ ms: 6.5 * MIN }]);
  const t0 = Date.now(); const { job } = PJ.create(t.db, t.spec, t.c.now()); assert.ok(Date.now() - t0 < 200, 'creating the job waits for nothing');
  assert.equal(viewOf(t.db, job.id).status, 'queued'); assert.equal(viewOf(t.db, job.id).message, 'Creating cinematic hero…');
  const w = t.worker('w1'); await w.tick(job.id);
  assert.equal(t.provider.log.submits, 1);
  for (let m = 1; m <= 6; m++) { t.c.advance(MIN); await w.tick(job.id); const v = viewOf(t.db, job.id); assert.equal(v.status, 'running', `minute ${m}: running, never failed`); assert.equal(v.failed.length, 0); }
  t.c.advance(MIN); await w.tick(job.id);
  const v = viewOf(t.db, job.id); assert.equal(v.status, 'completed'); assert.equal(v.message, 'Cinematic hero ready'); assert.equal(v.delivered.length, 1);
  assert.deepEqual(creditsOf(v), { reserved: 12, charged: 12, returned: 0, settled: true }); assert.equal(t.provider.log.submits, 1, 'one submit, ever');
  w.stop();
});

test('2. a showcase\'s three clips finish at different times: 0/3 -> 1/3 -> 2/3 -> 3/3, each role on its own, exactly three submits', async () => {
  const t = setup(['hero', 'takeover', 'payoff'], [{ ms: 2 * MIN }, { ms: 4 * MIN }, { ms: 6 * MIN }]);
  const { job } = PJ.create(t.db, t.spec, t.c.now()); const w = t.worker('w1'); await w.tick(job.id);
  assert.equal(t.provider.log.submits, 3, 'all three submitted at once');
  const seen = []; const states = [];
  for (let m = 0; m <= 7; m++) { const v = viewOf(t.db, job.id); seen.push(v.completed); states.push(v.roles.map(r => r.state[0]).join('')); t.c.advance(MIN); await w.tick(job.id); }
  assert.deepEqual([...new Set(seen)], [0, 1, 2, 3]); assert.ok(states.some(x => x.startsWith('d') && x.slice(1).includes('p')), `hero ready while the others process: ${states}`);
  assert.equal(viewOf(t.db, job.id).message, 'Premium videos ready'); assert.equal(t.provider.log.submits, 3, 'never a fourth');
  assert.deepEqual(creditsOf(viewOf(t.db, job.id)), { reserved: 36, charged: 36, returned: 0, settled: true });
  w.stop();
});

test('3. one clip fails at the provider: the other two kept, only the failed role\'s SiteRemade credits returned -- and the words say exactly that', async () => {
  const t = setup(['hero', 'takeover', 'payoff'], [{ ms: MIN }, { ms: 2 * MIN }, { ms: 2 * MIN, outcome: 'failed' }]);
  const before = t.balance(); const { job } = PJ.create(t.db, t.spec, t.c.now()); const w = t.worker('w1'); await w.tick(job.id);
  for (let m = 0; m < 4; m++) { t.c.advance(MIN); await w.tick(job.id); }
  const v = viewOf(t.db, job.id);
  assert.equal(v.status, 'partial'); assert.deepEqual(v.delivered.map(m => m.role), ['hero', 'takeover']); assert.deepEqual(v.failed.map(f => f.role), ['payoff']);
  assert.deepEqual(creditsOf(v), { reserved: 36, charged: 24, returned: 12, settled: true });
  assert.equal(v.message, '2 of 3 premium videos ready. Payoff failed (the provider reported failed); 12 SiteRemade credits returned.');
  assert.doesNotMatch(v.message, /refund/i, 'never "refunded": nothing the provider was paid comes back');
  assert.equal(t.balance(), before + 12);
  const tel = PJ.telemetry(t.db.premiumJobs.find(job.id)); assert.deepEqual(tel.roles.map(r => [r.role, r.providerSpend]), [['hero', 'incurred'], ['takeover', 'incurred'], ['payoff', 'none']]);
  w.stop();
});

test('4. a server restart after the submits: a new worker on the same database picks the job up -- delivered roles stay delivered, nothing is submitted again, settled once', async () => {
  const t = setup(['hero', 'takeover', 'payoff'], [{ ms: MIN }, { ms: 5 * MIN }, { ms: 5 * MIN }]);
  const { job } = PJ.create(t.db, t.spec, t.c.now()); const a = t.worker('before-restart'); await a.tick(job.id);
  t.c.advance(2 * MIN); await a.tick(job.id); assert.equal(viewOf(t.db, job.id).completed, 1);
  a.stop(); // (the process dies; its lease is left behind)
  const db2 = resetSqliteAdapter(t.file);
  const b = PJ.createWorker({ db: db2, provider: t.provider, presets: PRESETS, costs: COSTS, store: () => 'b'.repeat(64), sourceUrl: async () => 'x', releaseSource: () => {}, enabled: () => true, policy: QUIET, now: t.c.now, owner: 'after-restart' });
  assert.equal(db2.premiumJobs.active().length, 1, 'the job is found again from the database');
  t.c.advance(5 * MIN); await b.tick(job.id);
  const v = PJ.view(db2.premiumJobs.find(job.id));
  assert.equal(v.status, 'completed'); assert.equal(t.provider.log.submits, 3, 'no role was submitted again'); assert.deepEqual(creditsOf(v), { reserved: 36, charged: 36, returned: 0, settled: true });
  assert.equal(b.resumeAll(), 0, 'a finished job is not resumed'); b.stop();
});

test('5. a crash in the middle of a submit: NEVER sent again (the provider may have it) -- recorded as a possible provider cost, SiteRemade credits returned', async () => {
  const t = setup(['single'], [{ ms: MIN }]);
  const { job } = PJ.create(t.db, t.spec, t.c.now()); const row = t.db.premiumJobs.find(job.id); const roles = PJ.rolesOf(row);
  Object.assign(roles[0], { state: 'submitting', submittingAt: new Date(t.c.now()).toISOString() });
  t.db.premiumJobs.update(job.id, row.version, { roles_json: JSON.stringify(roles), status: 'running' }, new Date(t.c.now()).toISOString());
  const w = t.worker('w1');
  await w.tick(job.id); assert.equal(viewOf(t.db, job.id).status, 'running', '(a submit still within its own time is left alone)');
  t.c.advance(10 * MIN); await w.tick(job.id);
  const v = viewOf(t.db, job.id); assert.equal(t.provider.log.submits, 0, 'not resubmitted'); assert.equal(v.status, 'failed'); assert.equal(v.failed[0].code, 'submission_uncertain');
  assert.deepEqual(creditsOf(v), { reserved: 12, charged: 0, returned: 12, settled: true });
  const tel = PJ.telemetry(t.db.premiumJobs.find(job.id)); assert.equal(tel.roles[0].providerState, 'unknown'); assert.equal(tel.roles[0].providerSpend, 'possible');
  for (let i = 0; i < 3; i++) { t.c.advance(MIN); await w.tick(job.id); } assert.equal(t.provider.log.submits, 0); w.stop();
});

test('6. a submit whose answer never arrives (timeout / dropped connection / provider 5xx) is never retried; a refusal the provider answered (4xx) costs nothing', async () => {
  const t = setup(['single'], [], { provider: { submitError: { message: 'Higgsfield did not answer in time' } } });
  const { job } = PJ.create(t.db, t.spec, t.c.now()); const w = t.worker('w1'); await w.tick(job.id);
  for (let i = 0; i < 4; i++) { t.c.advance(MIN); await w.tick(job.id); }
  let v = viewOf(t.db, job.id); assert.equal(t.provider.log.submits, 1, 'one attempt, never repeated'); assert.equal(v.failed[0].code, 'submission_uncertain'); assert.equal(v.credits.returned, 12);
  assert.equal(PJ.telemetry(t.db.premiumJobs.find(job.id)).roles[0].providerState, 'unknown', 'a possible provider cost, said so internally');
  const u = setup(['single'], [], { provider: { submitError: { status: 422, message: 'Higgsfield returned 422' } } });
  const j2 = PJ.create(u.db, u.spec, u.c.now()).job; const w2 = u.worker('w1'); await w2.tick(j2.id);
  v = viewOf(u.db, j2.id); assert.equal(u.provider.log.submits, 1); assert.equal(v.failed[0].code, 'provider_refused'); assert.equal(PJ.telemetry(u.db.premiumJobs.find(j2.id)).roles[0].providerSpend, 'none');
  w.stop(); w2.stop();
});

test('7. idempotency: one job per generation; two workers ticking at once submit each role once; repeated settlement and ticks change nothing', async () => {
  const t = setup(['hero', 'takeover', 'payoff'], [{ ms: MIN }, { ms: MIN }, { ms: MIN }]);
  const first = PJ.create(t.db, t.spec, t.c.now()); const again = PJ.create(t.db, t.spec, t.c.now());
  assert.equal(again.reused, true); assert.equal(again.job.id, first.job.id);
  const w1 = t.worker('w1'), w2 = t.worker('w2');
  await Promise.all([w1.tick(first.job.id), w2.tick(first.job.id), w1.tick(first.job.id)]);
  assert.equal(t.provider.log.submits, 3);
  t.c.advance(2 * MIN); await w1.tick(first.job.id); await w2.tick(first.job.id);
  const ev = counts(t.db); const v = viewOf(t.db, first.job.id); assert.equal(v.status, 'completed');
  for (let i = 0; i < 5; i++) { PJ.settle(t.db, first.job.id, t.c.now()); await w1.tick(first.job.id); await w2.tick(first.job.id); }
  assert.deepEqual(counts(t.db), ev, 'no second charge, no second return'); assert.deepEqual(viewOf(t.db, first.job.id), v); assert.equal(t.provider.log.submits, 3);
  w1.stop(); w2.stop();
});

test('8. the provider unreachable for a while is not a failure (status uncertain -> just a missed check, never a resubmit)', async () => {
  const t = setup(['single'], [{ ms: 10 * MIN }]);
  const { job } = PJ.create(t.db, t.spec, t.c.now()); const w = t.worker('w1'); await w.tick(job.id);
  t.provider.setDown(true); for (let i = 0; i < 5; i++) { t.c.advance(MIN); await w.tick(job.id); }
  assert.equal(viewOf(t.db, job.id).status, 'running'); assert.equal(t.provider.log.submits, 1);
  t.provider.setDown(false); t.c.advance(6 * MIN); await w.tick(job.id); assert.equal(viewOf(t.db, job.id).status, 'completed'); assert.equal(t.provider.log.submits, 1);
  w.stop();
});

test('9. the soft deadline: a cancellation the provider does not confirm keeps the role alive -- a late clip is delivered, kept and charged (never "returned" and thrown away)', async () => {
  const t = setup(['single'], [{ ms: 90 * MIN, cancel: 'ignore' }]);
  const { job } = PJ.create(t.db, t.spec, t.c.now()); const w = t.worker('w1'); await w.tick(job.id);
  t.c.advance(61 * MIN); await w.tick(job.id);
  let v = viewOf(t.db, job.id); assert.equal(t.provider.log.cancels, 1, 'asked to cancel at the deadline'); assert.equal(v.status, 'running', 'not failed: the cancellation was not confirmed');
  assert.equal(v.roles[0].late, true); assert.match(v.message, /taking longer than usual/);
  t.c.advance(30 * MIN); await w.tick(job.id);
  v = viewOf(t.db, job.id); assert.equal(v.status, 'completed', 'the late clip is delivered'); assert.equal(v.credits.charged, 12); assert.equal(t.provider.log.submits, 1);
  w.stop();
});

test('10. the soft deadline with a cancellation the provider CONFIRMS: no provider cost, SiteRemade credits returned', async () => {
  const t = setup(['single'], [{ ms: 90 * MIN, cancel: 'honour' }]);
  const { job } = PJ.create(t.db, t.spec, t.c.now()); const w = t.worker('w1'); await w.tick(job.id);
  t.c.advance(61 * MIN); await w.tick(job.id); t.c.advance(MIN); await w.tick(job.id);
  const v = viewOf(t.db, job.id); assert.equal(v.status, 'failed'); assert.equal(v.failed[0].code, 'cancelled'); assert.equal(v.credits.returned, 12);
  const tel = PJ.telemetry(t.db.premiumJobs.find(job.id)); assert.equal(tel.roles[0].providerState, 'cancelled'); assert.equal(tel.roles[0].providerSpend, 'none');
  w.stop();
});

test('11. the hard deadline: still not finished, cancellation never confirmed -- unresolved, a POSSIBLE provider cost (never claimed avoided); SiteRemade credits returned', async () => {
  const t = setup(['single'], [{ outcome: 'never', cancel: 'ignore' }]);
  const { job } = PJ.create(t.db, t.spec, t.c.now()); const w = t.worker('w1'); await w.tick(job.id);
  t.c.advance(2 * HOUR); await w.tick(job.id); assert.equal(viewOf(t.db, job.id).status, 'running');
  t.c.advance(4.5 * HOUR); await w.tick(job.id);
  const v = viewOf(t.db, job.id); assert.equal(v.status, 'failed'); assert.equal(v.failed[0].code, 'provider_unresolved'); assert.equal(v.credits.returned, 12);
  assert.match(v.message, /12 SiteRemade credits returned/); assert.doesNotMatch(v.message, /refund|no (provider )?cost|not charged/i, 'nothing claims the provider\'s money came back');
  const tel = PJ.telemetry(t.db.premiumJobs.find(job.id)); assert.equal(tel.roles[0].providerState, 'unknown'); assert.equal(tel.roles[0].providerSpend, 'possible'); assert.equal(tel.providerSpend.possibleUsd, 2.1);
  assert.equal(t.provider.log.submits, 1); w.stop();
});

test('12. the provider made the clip but its download fails for a while: only the download is retried (bounded), never the generation -- the clip is kept, charged once', async () => {
  const t = setup(['single'], [{ ms: MIN }], { provider: { downloadFailures: 3 } });
  const { job } = PJ.create(t.db, t.spec, t.c.now()); const w = t.worker('w1'); await w.tick(job.id);
  t.c.advance(2 * MIN); await w.tick(job.id);
  assert.equal(viewOf(t.db, job.id).roles[0].state, 'downloading');
  for (let i = 0; i < 6; i++) { t.c.advance(2 * MIN); await w.tick(job.id); }
  const v = viewOf(t.db, job.id); assert.equal(v.status, 'completed'); assert.equal(t.provider.log.submits, 1, 'never generated again'); assert.equal(t.provider.log.downloads, 4);
  assert.equal(v.credits.charged, 12);
  // a download that never recovers: kept on record as made by the provider (cost incurred), the owner's credits returned
  const u = setup(['single'], [{ ms: MIN }], { provider: { downloadFailures: 99 } });
  const j2 = PJ.create(u.db, u.spec, u.c.now()).job; const w2 = u.worker('w1'); await w2.tick(j2.id);
  for (let i = 0; i < 30; i++) { u.c.advance(3 * MIN); await w2.tick(j2.id); }
  const v2 = viewOf(u.db, j2.id); assert.equal(v2.status, 'failed'); assert.equal(v2.failed[0].code, 'download_failed'); assert.equal(u.provider.log.submits, 1); assert.equal(u.provider.log.downloads, PJ.policy({}).maxDownloadTries);
  const tel = PJ.telemetry(u.db.premiumJobs.find(j2.id)); assert.equal(tel.roles[0].providerState, 'completed'); assert.equal(tel.roles[0].providerSpend, 'incurred'); assert.ok(tel.roles[0].providerJobId);
  w.stop(); w2.stop();
});

test('13. the kill switch: unsent roles are never sent (credits returned); a role already at the provider is still collected', async () => {
  const t = setup(['hero', 'takeover', 'payoff'], [{ ms: MIN }]);
  t.switchOff(); const { job } = PJ.create(t.db, t.spec, t.c.now()); const w = t.worker('w1'); await w.tick(job.id);
  const v = viewOf(t.db, job.id); assert.equal(t.provider.log.submits, 0); assert.deepEqual(v.failed.map(f => f.code), ['premium_disabled', 'premium_disabled', 'premium_disabled']); assert.equal(v.credits.returned, 36);
  const u = setup(['single'], [{ ms: 3 * MIN }]); const j2 = PJ.create(u.db, u.spec, u.c.now()).job; const w2 = u.worker('w1'); await w2.tick(j2.id); // (sent)
  u.switchOff(); u.c.advance(4 * MIN); await w2.tick(j2.id);
  assert.equal(viewOf(u.db, j2.id).status, 'completed', 'what was already paid for is collected'); assert.equal(u.provider.log.submits, 1);
  w.stop(); w2.stop();
});

test('14. hard caps: a Cinematic Hero job never submits more than one clip, a Showcase never more than three, never past its budget', async () => {
  const t = setup(['hero', 'takeover', 'payoff'], [{ ms: MIN }, { ms: MIN }, { ms: MIN }], { mode: 'hero' });
  const { job } = PJ.create(t.db, t.spec, t.c.now()); const w = t.worker('w1'); await w.tick(job.id); t.c.advance(2 * MIN); await w.tick(job.id);
  assert.equal(t.provider.log.submits, 1, 'one clip in Cinematic Hero'); assert.deepEqual(viewOf(t.db, job.id).failed.map(f => f.code), ['over_mode_limit', 'over_mode_limit']);
  const four = setup(['hero', 'takeover', 'payoff', 'hero'], [{ ms: MIN }, { ms: MIN }, { ms: MIN }, { ms: MIN }], { mode: 'showcase', budgetUsd: 9 });
  const j2 = PJ.create(four.db, four.spec, four.c.now()).job; const w2 = four.worker('w1'); await w2.tick(j2.id);
  assert.equal(four.provider.log.submits, 3, 'never a fourth clip, even with budget for it');
  const tight = setup(['hero', 'takeover', 'payoff'], [{ ms: MIN }, { ms: MIN }, { ms: MIN }], { budgetUsd: 4.5 });
  const j3 = PJ.create(tight.db, tight.spec, tight.c.now()).job; const w3 = tight.worker('w1'); await w3.tick(j3.id);
  assert.equal(tight.provider.log.submits, 2, 'the budget (2 x 2.25) stops the third'); assert.equal(viewOf(tight.db, j3.id).failed[0].code, 'budget_blocked');
  w.stop(); w2.stop(); w3.stop();
});

test('15. telemetry answers "why did this cost money" per role -- model, resolution, duration, estimated and observed cost, provider job id, outcome, credits -- with no secrets, source links or provider URLs', async () => {
  const t = setup(['hero', 'takeover', 'payoff'], [{ ms: MIN }, { ms: MIN, outcome: 'failed' }, { ms: MIN }]);
  const { job } = PJ.create(t.db, t.spec, t.c.now()); const w = t.worker('w1'); await w.tick(job.id); t.c.advance(2 * MIN); await w.tick(job.id); t.c.advance(MIN); await w.tick(job.id);
  const tel = PJ.telemetry(t.db.premiumJobs.find(job.id));
  assert.equal(tel.providerSubmissions, 3); assert.equal(tel.budgetUsd, 6.75); assert.equal(tel.maxClips, 3);
  assert.deepEqual(tel.providerSpend, { incurredUsd: 4.2, possibleUsd: 0 });
  tel.roles.forEach(r => { assert.equal(r.model, 'kling-video/v3.0/4k/image-to-video'); assert.equal(r.resolution, '4k'); assert.equal(r.durationS, 5); assert.equal(r.estimatedUsd, 2.25); assert.ok(r.providerJobId); assert.ok(r.submittedAt && r.outcomeAt); });
  assert.deepEqual(tel.roles.map(r => [r.role, r.outcome, r.creditsCharged]), [['hero', 'delivered', 12], ['takeover', 'provider_failed', 0], ['payoff', 'delivered', 12]]);
  const text = JSON.stringify(tel) + JSON.stringify(viewOf(t.db, job.id));
  assert.doesNotMatch(text, /premium-media\/source|tok_|fake-output\.test|sourceRef|image_url/, 'no source link, no provider output URL');
  w.stop();
});

// ================================================================ the real server (Higgsfield and the models mocked)
async function withServer(env, fn, dirIn) {
  const dir = dirIn || fs.mkdtempSync(path.join(os.tmpdir(), 'sr-pj-srv-'));
  const e = Object.assign({ SITEREMADE_BACKEND: 'local', SITEREMADE_DB_PATH: path.join(dir, 'app.db'), SITEREMADE_ASSET_STORE_DIR: path.join(dir, 'assets'), SITEREMADE_EXPORTS_DIR: path.join(dir, 'exports'), SITEREMADE_PREMIUM_LOG_DIR: path.join(dir, 'p'), ANTHROPIC_API_KEY: 'test-only', OPENAI_API_KEY: '', STRIPE_SECRET_KEY: '', SITEREMADE_TRIAL_CREDITS: '60', MOCK_CALL_LOG: path.join(dir, 'calls.log'), NODE_ENV: 'test', HIGGSFIELD_API_KEY: 'hf-test-key:secret', HIGGSFIELD_VIDEO_ENDPOINT: 'https://api.higgsfield.ai/kling-video/v3.0/4k/image-to-video' }, env);
  const s = await startServer(e);
  try { await fn({ s, dir, port: s.port, calls: () => providerCalls(e.MOCK_CALL_LOG), env: e }); } finally { await s.stop(); if (!dirIn) fs.rmSync(dir, { recursive: true, force: true }); }
}
const SHOW = { on: true, moments: 3, eligibleUploads: 2 }; const HERO = { on: true, moments: 1, eligibleUploads: 1 }; const CREATIVE = { on: false };
const BRIEF = 'A showcase for Zorbo, our sneaker brand -- with a cinematic hero video and lots of video everywhere';
const hd = id => ({ id, origin: 'upload', title: id, mime: 'image/png', dataUrl: mockPng(id, '16:9-hd') });
async function signUp(call) { const who = { email: `pj-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@example.com`, password: 'correct-horse-battery-staple' }; await call('POST', '/api/auth/signup', who); return who; }
async function generation(call, premium, signedIn) {
  if (!signedIn) await signUp(call);
  const ask = await call('POST', '/api/creative/research', { brief: BRIEF, premium });
  const r = ask.body.needsConfirmation ? await call('POST', '/api/creative/research', { brief: BRIEF, premium, quoteId: ask.body.quote.id }) : ask;
  return r.body.jobId;
}
// (the studio's start body -- here with a director's extra suggestions and an arc of three, whatever the mode)
const body = (jobId, extra) => Object.assign({ jobId, brief: BRIEF, heroAsset: 'u1', premiumArc: [{ role: 'hero', asset: 'u1' }, { role: 'takeover', asset: 'u2' }, { role: 'payoff', asset: 'u1' }],
  premiumMedia: [{ intent: 'cinematic_hero', asset: 'u1' }, { intent: 'object_motion', asset: 'u2' }, { intent: 'environment_motion', asset: 'u2' }, { intent: 'image_to_video', asset: 'u1' }], assets: [hd('u1'), hd('u2')] }, extra || {});
const submits = calls => calls().filter(c => c.provider === 'higgsfield' && /image-to-video$/.test(c.endpoint)).length;

test('16. server: the start returns at once while the clip takes far longer; Cinematic Hero submits one clip, a Showcase exactly three (0/3 -> 3/3)', async () => {
  await withServer({ MOCK_HIGGSFIELD_MS: '2500' }, async ({ port, calls }) => {
    const call = client(port); const jobId = await generation(call, HERO);
    const t0 = Date.now(); const st = await startPremium(call, body(jobId)); const took = Date.now() - t0;
    assert.equal(st.body.ok, true); assert.ok(took < 1500, `the start returned in ${took} ms`);
    const end = await pollPremium(call, st.body.job.jobId); assert.equal(end.body.job.status, 'completed'); assert.equal(end.body.job.credits.charged, 12);
    assert.equal(submits(calls), 1, 'Cinematic Hero: one submit, whatever the director suggested and the arc listed');
  });
  await withServer({ MOCK_HIGGSFIELD_MS: '700,1600,2500' }, async ({ port, calls }) => {
    const call = client(port); const jobId = await generation(call, SHOW);
    const st = await startPremium(call, body(jobId)); const seen = [];
    const last = await pollPremium(call, st.body.job.jobId, { until: j => { seen.push(j.completed); return false; } }); seen.push(last.body.job.completed);
    assert.deepEqual(seen.filter((x, i) => i === 0 || x !== seen[i - 1]), [0, 1, 2, 3]); assert.equal(submits(calls), 3, 'Showcase: exactly three');
  });
});

test('17. server: Creative mode -- zero premium submits, even when the brief asks for video and the director suggests premium media', async () => {
  await withServer({ MOCK_DIRECTOR: 'follow' }, async ({ port, calls }) => {
    const call = client(port); const jobId = await generation(call, CREATIVE);
    const st = await startPremium(call, body(jobId)); assert.equal(st.body.job, null, 'no premium job without a video mode');
    const again = await startPremium(call, body(jobId)); assert.equal(again.body.job, null);
    await sleep(400); assert.equal(submits(calls), 0); assert.equal(calls().filter(c => c.provider === 'higgsfield').length, 0, 'not even a status call');
  });
});

test('18. server: the browser goes away right after the start (aborted fetch, cancelled poll) -- the job carries on; a reload finds the same job; nothing is sent twice', async () => {
  await withServer({ MOCK_HIGGSFIELD_MS: '1500,1800,2100' }, async ({ port, calls }) => {
    const call = client(port); const jobId = await generation(call, SHOW);
    const ctl = new AbortController(); const sent = call('POST', '/api/creative/premium/start', body(jobId), {}, { signal: ctl.signal }).catch(e => ({ aborted: String(e.name) }));
    await sleep(120); ctl.abort(); await sent; await sleep(300);
    const again = await startPremium(call, body(jobId)); assert.equal(again.body.reused, true); const pj = again.body.job.jobId;
    const c2 = new AbortController(); const p = call('GET', `/api/creative/premium/status/${pj}`, undefined, {}, { signal: c2.signal }).catch(() => null); c2.abort(); await p;
    assert.notEqual((await call('GET', `/api/creative/premium/status/${pj}`)).body.job.status, 'failed', 'a cancelled request is not a failure');
    const end = await pollPremium(call, pj); assert.equal(end.body.job.status, 'completed'); assert.equal(submits(calls), 3);
  });
});

test('19. server: one fake provider failure -- two clips kept, only that role\'s SiteRemade credits returned', async () => {
  await withServer({ MOCK_HIGGSFIELD: 'fail-3', MOCK_HIGGSFIELD_MS: '300,500,700' }, async ({ port }) => {
    const call = client(port); const jobId = await generation(call, SHOW);
    const st = await startPremium(call, body(jobId)); const j = (await pollPremium(call, st.body.job.jobId)).body.job;
    assert.equal(j.status, 'partial'); assert.deepEqual(j.delivered.map(m => m.role), ['hero', 'takeover']); assert.deepEqual(j.failed.map(f => f.role), ['payoff']);
    assert.deepEqual([j.credits.charged, j.credits.returned], [24, 12]); assert.match(j.message, /^2 of 3 premium videos ready\. Payoff failed .*; 12 SiteRemade credits returned\.$/);
  });
});

test('20. server: a restart BEFORE the provider fetches the source -- the link lives in the database, the provider still gets the picture after the restart, the clip succeeds; the link dies with the role', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sr-pj-src-'));
  let pj = null; let who = null; const env = { MOCK_HIGGSFIELD_FETCH_SOURCE: '1', MOCK_HIGGSFIELD_MS: '3000' };
  try {
    await withServer(env, async ({ port }) => {
      const call = client(port); who = await signUp(call); const jobId = await generation(call, HERO, true);
      const st = await startPremium(call, body(jobId)); pj = st.body.job.jobId;
      await pollPremium(call, pj, { until: j => j.roles.every(r => r.state === 'submitted' || r.state === 'processing') });
    }, dir); // (the server stops before the provider has fetched anything)
    await withServer(env, async ({ port, calls }) => {
      const call = client(port); assert.equal((await call('POST', '/api/auth/signin', who)).status, 200);
      const end = await pollPremium(call, pj); assert.equal(end.body.job.status, 'completed', JSON.stringify(end.body.job.roles));
      const fetches = calls().filter(c => c.endpoint === 'source-fetch'); assert.equal(fetches.length, 1); assert.equal(fetches[0].status, 200, 'the source link worked after the restart');
      assert.equal(submits(calls), 1, 'one submit, before the restart');
      // the link is gone once the role has an outcome
      const link = calls().find(c => c.provider === 'higgsfield' && /image-to-video$/.test(c.endpoint)).params.image_url.replace(/^https?:\/\/[^/]+/, `http://127.0.0.1:${port}`);
      assert.equal((await fetch(link)).status, 404);
      assert.equal((await fetch(`http://127.0.0.1:${port}/api/premium-media/source/not-a-real-token-at-all-000000`)).status, 404, 'guessing finds nothing');
    }, dir);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('21. server: a restart AFTER the submits -- the job reloads from the database, nothing is sent twice, settled once', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sr-pj-restart-'));
  let pj = null; let who = null; const env = { MOCK_HIGGSFIELD_MS: '2500,3000,3500' };
  try {
    await withServer(env, async ({ port }) => {
      const call = client(port); who = await signUp(call); const jobId = await generation(call, SHOW, true);
      const st = await startPremium(call, body(jobId)); pj = st.body.job.jobId;
      await pollPremium(call, pj, { until: j => j.roles.every(r => r.state === 'submitted' || r.state === 'processing') });
    }, dir);
    await withServer(env, async ({ port, calls }) => {
      const call = client(port); assert.equal((await call('POST', '/api/auth/signin', who)).status, 200);
      const v = (await pollPremium(call, pj)).body.job; assert.equal(v.status, 'completed'); assert.deepEqual([v.credits.charged, v.credits.returned, v.credits.settled], [36, 0, true]);
      assert.equal(submits(calls), 3, 'the first process\'s three: none again');
    }, dir);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('22. server: two server processes on one database race for the same job -- exactly one submission per role', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sr-pj-race-'));
  const env = { MOCK_HIGGSFIELD_MS: '1500,1700,1900' };
  try {
    await withServer(env, async ({ port: portA, calls }) => {
      await withServer(env, async ({ port: portB }) => {
        const a = client(portA); const who = await signUp(a); const jobId = await generation(a, SHOW, true);
        const b = client(portB); assert.equal((await b('POST', '/api/auth/signin', who)).status, 200);
        const st = await startPremium(a, body(jobId)); const pj = st.body.job.jobId;
        // both processes now check the job (B's status endpoint wakes B's worker) -- the lease lets one through at a time
        const polls = []; for (let i = 0; i < 25; i++) { polls.push(b('GET', `/api/creative/premium/status/${pj}`), a('GET', `/api/creative/premium/status/${pj}`)); await sleep(60); }
        await Promise.all(polls);
        const v = (await pollPremium(a, pj)).body.job; assert.equal(v.status, 'completed'); assert.equal(v.credits.charged, 36);
      }, dir);
      assert.equal(submits(calls), 3, 'two workers, three roles, three submits');
    }, dir);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('23. server: duplicate starts -> one job, one set of submits, no second reservation; repeated polling settles nothing twice; a finished job is never made again', async () => {
  await withServer({ MOCK_HIGGSFIELD_MS: '400,500,600' }, async ({ port, calls }) => {
    const call = client(port); const jobId = await generation(call, SHOW);
    const before = (await call('GET', '/api/credits')).body.credits.remaining;
    const [a, b] = await Promise.all([startPremium(call, body(jobId)), startPremium(call, body(jobId)), startPremium(call, body(jobId))]);
    assert.equal(a.body.job.jobId, b.body.job.jobId); assert.equal((await call('GET', '/api/credits')).body.credits.remaining, before, 'no second reservation');
    const end = await pollPremium(call, a.body.job.jobId); const v = end.body.job; const remaining = end.body.creditsRemaining;
    for (let i = 0; i < 15; i++) { const p = await call('GET', `/api/creative/premium/status/${v.jobId}`); assert.deepEqual(p.body.job, v); assert.equal(p.body.creditsRemaining, remaining); }
    const late = await startPremium(call, body(jobId)); assert.equal(late.body.reused, true); assert.equal(late.body.job.status, 'completed');
    assert.equal(submits(calls), 3); assert.equal(v.delivered.length, 3);
    calls().forEach(c => assert.ok(['anthropic', 'higgsfield'].includes(c.provider), JSON.stringify(c)));
  });
});

test('24. server: the provider makes the clip but the download fails for a while -- retried, never regenerated, delivered; a submit that never answers is not retried', async () => {
  await withServer({ MOCK_HIGGSFIELD_DOWNLOAD_FAILS: '2', MOCK_HIGGSFIELD_MS: '300', PREMIUM_JOB_DOWNLOAD_RETRY_MS: '100' }, async ({ port, calls }) => {
    const call = client(port); const jobId = await generation(call, HERO);
    const v = (await pollPremium(call, (await startPremium(call, body(jobId))).body.job.jobId)).body.job;
    assert.equal(v.status, 'completed'); assert.equal(submits(calls), 1); assert.equal(calls().filter(c => c.endpoint === 'download').length, 3);
  });
  await withServer({ MOCK_HIGGSFIELD_SUBMIT: 'vanish', PREMIUM_JOB_SUBMIT_STALE_MS: '100' }, async ({ port, calls }) => {
    const call = client(port); const jobId = await generation(call, HERO);
    const v = (await pollPremium(call, (await startPremium(call, body(jobId))).body.job.jobId)).body.job;
    assert.equal(v.status, 'failed'); assert.equal(v.failed[0].code, 'submission_uncertain'); assert.equal(v.credits.returned, 12);
    await sleep(500); assert.equal(submits(calls), 1, 'the uncertain submission is never sent again');
  });
});

test('25. server: the kill switch (PREMIUM_PROVIDER_ENABLED=false) -- video modes unavailable, no premium line, no job, zero submits; Creative still works', async () => {
  await withServer({ PREMIUM_PROVIDER_ENABLED: 'false' }, async ({ port, calls }) => {
    const call = client(port); await signUp(call);
    const pr = await call('POST', '/api/creative/price', { request: BRIEF, premium: HERO }); assert.equal(pr.body.premiumAvailable, false); assert.match(pr.body.premiumUnavailable, /switched off/);
    const q = await call('POST', '/api/quotes', { operation: 'creative_generation', request: BRIEF, premium: SHOW }); assert.equal(q.body.quote.credits, 6, 'no premium line while it is off'); assert.equal(q.body.premium.reason, 'premium_disabled');
    const jobId = await generation(call, SHOW, true); assert.ok(jobId, 'the Creative page still starts');
    const st = await startPremium(call, body(jobId)); assert.equal(st.body.job, null);
    assert.equal(submits(calls), 0);
    assert.doesNotMatch(JSON.stringify(pr.body) + JSON.stringify(q.body), /PREMIUM_PROVIDER_ENABLED/, 'the switch is never shown to the browser');
  });
});
