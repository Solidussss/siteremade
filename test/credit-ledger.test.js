'use strict';
// The authoritative credit ledger (lib/credits.js) and the Creative page job (lib/creative-jobs.js) on a real
// database: idempotent operation ids, expiry after a crash, day and billing-month boundaries, and the one-price job.
const test = require('node:test');
const assert = require('node:assert/strict');
const credits = require('../lib/credits');
const jobs = require('../lib/creative-jobs');

function freshDb() {
  process.env.SITEREMADE_BACKEND = 'local';
  const { resetDatabaseAdapter } = require('../lib/adapters/database-adapter');
  const db = resetDatabaseAdapter(':memory:');
  const ts = '2026-01-01T00:00:00.000Z';
  db.raw.prepare('INSERT INTO accounts (id, email, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)').run('acct_a', 'a@example.com', 'x', ts, ts);
  db.raw.prepare('INSERT INTO accounts (id, email, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)').run('acct_b', 'b@example.com', 'x', ts, ts);
  return db;
}
const T = s => new Date(s);
const trialOnly = n => ({ trialCredits: n, testerDailyCredits: 0, subscription: null });

test('the free trial is granted once, however often it is asked for', () => {
  const db = freshDb(); const now = T('2026-03-01T10:00:00Z');
  for (let i = 0; i < 5; i++) credits.ensureGrants(db, 'acct_a', trialOnly(6), now);
  assert.equal(credits.available(db, 'acct_a', now).total, 6);
  assert.equal(db.ledger.grantsForAccount('acct_a').length, 1);
});

test('an operation id reserves once: a retry or double click gets the same reservation, never a second charge', () => {
  const db = freshDb(); const now = T('2026-03-01T10:00:00Z');
  credits.ensureGrants(db, 'acct_a', trialOnly(6), now);
  const a = credits.reserve(db, { accountId: 'acct_a', opId: 'gen:1', amount: 2, kind: 'business_generation', now });
  const b = credits.reserve(db, { accountId: 'acct_a', opId: 'gen:1', amount: 2, kind: 'business_generation', now });
  assert.equal(a.ok, true); assert.equal(a.existing, false); assert.equal(b.existing, true);
  assert.equal(credits.available(db, 'acct_a', now).total, 4);
  credits.commit(db, 'gen:1', { now }); credits.commit(db, 'gen:1', { now });
  assert.equal(credits.available(db, 'acct_a', now).total, 4, 'committing twice charges once');
  // another account can never use (or learn about) this operation id
  credits.ensureGrants(db, 'acct_b', trialOnly(6), now);
  assert.equal(credits.reserve(db, { accountId: 'acct_b', opId: 'gen:1', amount: 2, kind: 'x', now }).ok, false);
});

test('a failed attempt is released and may retry under the same id; a zero balance refuses without a row', () => {
  const db = freshDb(); const now = T('2026-03-01T10:00:00Z');
  credits.ensureGrants(db, 'acct_a', trialOnly(2), now);
  credits.reserve(db, { accountId: 'acct_a', opId: 'x:1', amount: 2, kind: 'k', now });
  credits.release(db, 'x:1', { now, providerUsd: 0.01 });
  assert.equal(credits.available(db, 'acct_a', now).total, 2, 'a failure is not charged');
  assert.equal(credits.findOperation(db, 'x:1').provider_usd > 0, true, 'what the provider cost is still recorded');
  const again = credits.reserve(db, { accountId: 'acct_a', opId: 'x:1', amount: 2, kind: 'k', now });
  assert.equal(again.ok, true); assert.equal(again.retried, true);
  credits.commit(db, 'x:1', { now });
  const none = credits.reserve(db, { accountId: 'acct_a', opId: 'x:2', amount: 1, kind: 'k', now });
  assert.equal(none.ok, false); assert.equal(none.remaining, 0);
  assert.equal(credits.findOperation(db, 'x:2'), null, 'a refused reservation leaves nothing behind');
});

test('parallel reservations can never spend the same last credits twice', () => {
  const db = freshDb(); const now = T('2026-03-01T10:00:00Z');
  credits.ensureGrants(db, 'acct_a', trialOnly(6), now);
  const results = Array.from({ length: 10 }, (_, i) => credits.reserve(db, { accountId: 'acct_a', opId: `p:${i}`, amount: 2, kind: 'k', now }));
  assert.equal(results.filter(r => r.ok).length, 3);
  assert.equal(credits.available(db, 'acct_a', now).total, 0);
});

test('a crash leaves a reservation that stops holding credits at its expiry; a late commit only takes free credits', () => {
  const db = freshDb(); const t0 = T('2026-03-01T10:00:00Z');
  credits.ensureGrants(db, 'acct_a', trialOnly(4), t0);
  credits.reserve(db, { accountId: 'acct_a', opId: 'crash:1', amount: 4, kind: 'k', ttlMs: 60000, now: t0 });
  assert.equal(credits.available(db, 'acct_a', t0).total, 0);
  const later = T('2026-03-01T10:05:00Z');
  assert.equal(credits.available(db, 'acct_a', later).total, 4, 'the abandoned reservation no longer holds anything');
  // meanwhile someone else's work took two of them; the late result cannot take credits that are not free
  credits.reserve(db, { accountId: 'acct_a', opId: 'other', amount: 2, kind: 'k', now: later });
  const late = credits.commit(db, 'crash:1', { now: later });
  assert.equal(late.ok, false); assert.equal(late.reason, 'expired_unfunded');
  assert.equal(credits.available(db, 'acct_a', later).total, 2);
});

test('an action that crosses the tester day boundary is charged to the day it was reserved on, not the next', () => {
  const db = freshDb(); const before = T('2026-03-01T23:59:30Z'); const after = T('2026-03-02T00:00:30Z');
  const tester = { trialCredits: 6, testerDailyCredits: 500, subscription: null };
  credits.ensureGrants(db, 'acct_a', tester, before);
  credits.reserve(db, { accountId: 'acct_a', opId: 'late', amount: 2, kind: 'k', now: before });
  credits.ensureGrants(db, 'acct_a', tester, after);
  credits.commit(db, 'late', { now: after });
  const grants = credits.liveGrants(db, 'acct_a', after);
  assert.equal(grants.find(g => g.kind === 'tester').remaining, 500, 'the new day starts full');
  assert.equal(grants.find(g => g.kind === 'trial').remaining, 6, 'the tester allowance is spent before the trial');
});

test('a billing month grants once, does not roll over, and an immediate cancellation ends only the plan credits', () => {
  const db = freshDb(); const now = T('2026-03-10T10:00:00Z');
  const month = { id: 'sub_1', periodStart: '2026-03-01T00:00:00.000Z', periodEnd: '2026-04-01T00:00:00.000Z', credits: 100 };
  for (let i = 0; i < 3; i++) credits.ensureGrants(db, 'acct_a', { trialCredits: 6, testerDailyCredits: 0, subscription: month }, now);
  assert.equal(credits.available(db, 'acct_a', now).total, 106);
  credits.reserve(db, { accountId: 'acct_a', opId: 'u1', amount: 10, kind: 'k', now }); credits.commit(db, 'u1', { now });
  const next = T('2026-04-02T10:00:00Z');
  credits.ensureGrants(db, 'acct_a', { trialCredits: 6, testerDailyCredits: 0, subscription: { id: 'sub_1', periodStart: '2026-04-01T00:00:00.000Z', periodEnd: '2026-05-01T00:00:00.000Z', credits: 100 } }, next);
  assert.equal(credits.available(db, 'acct_a', next).total, 106, 'unused March credits do not roll into April');
  credits.revokeSubscriptionGrants(db, 'acct_a', 'sub_1', next);
  assert.equal(credits.available(db, 'acct_a', next).total, 6, 'the trial remainder stays');
  // the same month asked for again (a stale answer) does not come back
  credits.ensureGrants(db, 'acct_a', { trialCredits: 6, testerDailyCredits: 0, subscription: { id: 'sub_1', periodStart: '2026-04-01T00:00:00.000Z', periodEnd: '2026-05-01T00:00:00.000Z', credits: 100 } }, next);
  assert.equal(credits.available(db, 'acct_a', next).total, 6);
});

test('Creative: one page reserves 1 + 3 before research; research and direction are each charged once; 4 in all', () => {
  const db = freshDb(); const now = T('2026-03-01T10:00:00Z');
  credits.ensureGrants(db, 'acct_a', trialOnly(6), now);
  const b = jobs.begin(db, 'acct_a', { now });
  assert.equal(b.ok, true); assert.equal(credits.available(db, 'acct_a', now).total, 2);
  assert.equal(jobs.begin(db, 'acct_a', { now }).ok, false, 'a second page needs 4 more');
  assert.equal(db.ledger.opsForJob(b.job.id).length, 2, 'a refused page leaves no reservation behind');
  const job = jobs.get(db, 'acct_a', b.job.id, { now });
  assert.equal(jobs.get(db, 'acct_b', b.job.id, { now }), null, 'another account cannot continue this job');
  for (let i = 0; i < jobs.RESEARCH_RUNS; i++) assert.equal(jobs.takeResearchRun(db, job, { now }), true);
  assert.equal(jobs.takeResearchRun(db, job, { now }), false, 'research runs are bounded');
  jobs.researchDone(db, job, { now }); jobs.researchDone(db, job, { now });
  const d = jobs.beginDirection(db, 'acct_a', job, { now });
  assert.equal(d.ok, true);
  assert.equal(jobs.beginDirection(db, 'acct_a', job, { now }).reason, 'in_progress', 'a double click never directs twice');
  jobs.directionDone(db, job, d.op, { ok: true, plan: { v: 2 } }, { now });
  const replay = jobs.beginDirection(db, 'acct_a', job, { now });
  assert.deepEqual(replay.replay, { ok: true, plan: { v: 2 } }, 'a retry gets the directed page back');
  const spent = db.ledger.opsForJob(job.id).filter(o => o.status === 'committed').reduce((n, o) => n + o.amount, 0);
  assert.equal(spent, 4); assert.equal(credits.available(db, 'acct_a', now).total, 2);
  // another direction is its own 3 credits, and there are only 2
  assert.equal(jobs.beginDirection(db, 'acct_a', job, { another: true, now }).reason, 'insufficient');
});

test('Creative: a failed direction returns its 3 credits; an abandoned page keeps only the research credit', () => {
  const db = freshDb(); const now = T('2026-03-01T10:00:00Z');
  credits.ensureGrants(db, 'acct_a', trialOnly(8), now);
  const job = jobs.begin(db, 'acct_a', { now }).job;
  jobs.researchDone(db, job, { now });
  const d = jobs.beginDirection(db, 'acct_a', job, { now });
  jobs.directionFailed(db, job, d.op, { now });
  assert.equal(credits.available(db, 'acct_a', now).total, 7, 'only research is charged after a failed direction');
  const job2 = jobs.begin(db, 'acct_a', { now }).job;
  jobs.researchDone(db, job2, { now });
  const dayLater = T('2026-03-02T10:30:00Z');
  assert.equal(credits.available(db, 'acct_a', dayLater).total, 6, 'the abandoned page released its direction part');
  assert.equal(jobs.get(db, 'acct_a', job2.id, { now: dayLater }), null, 'and the job has ended');
});

test('Creative: a direction whose server died mid-call is recovered, not stuck', () => {
  const db = freshDb(); const now = T('2026-03-01T10:00:00Z');
  credits.ensureGrants(db, 'acct_a', trialOnly(6), now);
  const job = jobs.begin(db, 'acct_a', { now }).job;
  assert.equal(jobs.beginDirection(db, 'acct_a', job, { now }).ok, true);
  // (no settle: the process crashed)
  const later = T('2026-03-01T10:30:00Z');
  const again = jobs.beginDirection(db, 'acct_a', job, { now: later });
  assert.equal(again.ok, true, again.reason);
  jobs.directionDone(db, job, again.op, { ok: true }, { now: later });
  const spent = db.ledger.opsForJob(job.id).filter(o => o.status === 'committed').reduce((n, o) => n + o.amount, 0);
  assert.equal(spent, 3, 'the recovered direction is charged once');
});
