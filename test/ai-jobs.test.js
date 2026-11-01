'use strict';
// CUSTOMER AI JOBS (lib/ai-jobs.js + lib/ai-prices.js) on a real database and the real credit ledger: prices worked out
// on the server, every limit, one charge per request, refunds for what didn't deliver, retries that only pay for the
// missing parts, and recovery after a restart. No provider is called: the "paid work" is a scripted function.
const test = require('node:test');
const assert = require('node:assert/strict');
const credits = require('../lib/credits');
const jobs = require('../lib/ai-jobs');
const prices = require('../lib/ai-prices');

function freshDb() {
  process.env.SITEREMADE_BACKEND = 'local';
  const { resetDatabaseAdapter } = require('../lib/adapters/database-adapter');
  const db = resetDatabaseAdapter(':memory:');
  const ts = '2026-01-01T00:00:00.000Z';
  for (const a of ['acct_a', 'acct_b', 'acct_owner']) db.raw.prepare('INSERT INTO accounts (id, email, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)').run(a, `${a}@example.com`, 'x', ts, ts);
  return db;
}
const NOW = new Date('2026-11-02T10:00:00Z');
const ON = { SITEREMADE_CUSTOMER_AI: 'on', SITEREMADE_AI_PRICES_VERIFIED: 'on' };
const give = (db, acct, n) => credits.grant(db, { id: `admin:${acct}:${n}:${Math.random()}`, accountId: acct, kind: 'admin', amount: n, source: 'test', reason: 'test', now: NOW });
const bal = (db, acct) => credits.available(db, acct, NOW).total;
const key = (s) => `key_${s}_${Math.random().toString(36).slice(2, 10)}`;
const ok = (usd = 1.4) => async () => ({ result: { url: '/x.mp4' }, usd });
const boom = (usd = 0) => async () => { throw Object.assign(new Error('provider failed'), { usd }); };

test('prices come from one table; every default price clears the provider ceiling at the budgeted Wan rate', () => {
  assert.deepEqual(prices.check().map((r) => [r.action, r.credits, r.ok]), [['assist_update', 2, true], ['own_plan', 3, true], ['image', 2, true], ['video_5', 9, true], ['video_12', 21, true]]);
  const s = prices.quote('showcase', { images: 9, seconds: 5 });
  assert.equal(s.parts.length, 8, 'nine photos are eight transitions, not one call'); assert.equal(s.credits, 72);
  assert.equal(prices.quote('showcase', { images: 1 }).error, 'A showcase takes 2 to 9 photos.');
  assert.equal(prices.quote('video', { seconds: 7 }).error, 'Videos are 5 or 12 seconds.');
  assert.equal(prices.quote('video', { seconds: 12 }, { SITEREMADE_AI_PRICES: '{"credits":{"video_12":30}}' }).credits, 30, 'override in one place');
});

test('customers are refused until customer AI is switched on AND the prices are verified; the owner is not', () => {
  const db = freshDb(); give(db, 'acct_a', 50);
  assert.equal(jobs.open(db, { accountId: 'acct_a', kind: 'image', idemKey: key('a'), env: {}, now: NOW }).code, 'off');
  assert.equal(jobs.open(db, { accountId: 'acct_a', kind: 'image', idemKey: key('a'), env: { SITEREMADE_CUSTOMER_AI: 'on' }, now: NOW }).code, 'unverified');
  assert.equal(bal(db, 'acct_a'), 50, 'nothing held');
  const o = jobs.open(db, { accountId: 'acct_owner', owner: true, kind: 'image', idemKey: key('o'), env: {}, now: NOW });
  assert.equal(o.ok, true); assert.equal(o.job.credits, 0, 'the owner pays no credits');
});

test('the quote shows balance, cost and balance after; a short balance is refused before anything is held', () => {
  const db = freshDb(); give(db, 'acct_a', 10);
  const q = jobs.quote(db, { accountId: 'acct_a', kind: 'video', params: { seconds: 12 }, env: ON, now: NOW });
  assert.deepEqual([q.balance, q.credits, q.after, q.allowed, q.code], [10, 21, -11, false, 'balance']);
  const r = jobs.open(db, { accountId: 'acct_a', kind: 'video', params: { seconds: 12 }, idemKey: key('v'), env: ON, now: NOW });
  assert.equal(r.code, 'balance'); assert.equal(bal(db, 'acct_a'), 10);
  assert.equal(db.raw.prepare('SELECT COUNT(*) n FROM ai_jobs').get().n, 0, 'no job left behind');
});

test('a successful job is charged once; the same request again returns the same job, never a second charge', async () => {
  const db = freshDb(); give(db, 'acct_a', 30); const k = key('s');
  const a = jobs.open(db, { accountId: 'acct_a', kind: 'video', params: { seconds: 5 }, idemKey: k, env: ON, now: NOW });
  assert.equal(a.ok, true); assert.equal(bal(db, 'acct_a'), 21, 'reserved up front');
  const b = jobs.open(db, { accountId: 'acct_a', kind: 'video', params: { seconds: 5 }, idemKey: k, env: ON, now: NOW });
  assert.equal(b.existing, true); assert.equal(b.job.id, a.job.id); assert.equal(bal(db, 'acct_a'), 21, 'a double click holds nothing more');
  const done = await jobs.run(db, a.job.id, ok(1.37), { now: () => NOW });
  assert.equal(done.status, 'succeeded'); assert.equal(done.charged, 9); assert.equal(bal(db, 'acct_a'), 21);
  const row = db.aiJobs.find(a.job.id); assert.equal(row.provider_usd, 1.37); assert.equal(row.loss_usd, 0);
});

test('one job at a time per customer; three video jobs at a time across the server', () => {
  const db = freshDb(); give(db, 'acct_a', 200); give(db, 'acct_b', 200);
  assert.equal(jobs.open(db, { accountId: 'acct_a', kind: 'image', idemKey: key('1'), env: ON, now: NOW }).ok, true);
  assert.equal(jobs.open(db, { accountId: 'acct_a', kind: 'image', idemKey: key('2'), env: ON, now: NOW }).code, 'busy');
  const env = Object.assign({ SITEREMADE_AI_USER_CONCURRENT: '5' }, ON);
  for (let i = 0; i < 3; i++) assert.equal(jobs.open(db, { accountId: 'acct_b', kind: 'video', params: { seconds: 5 }, idemKey: key('v' + i), env, now: NOW }).ok, true);
  assert.equal(jobs.open(db, { accountId: 'acct_b', kind: 'video', params: { seconds: 5 }, idemKey: key('v4'), env, now: NOW }).code, 'video_busy');
});

test('the server-wide daily budget stops new jobs (the owner too); the per-customer daily credit limit stops a customer', async () => {
  const db = freshDb(); give(db, 'acct_a', 500);
  const env = Object.assign({ SITEREMADE_AI_DAILY_USD: '3' }, ON);
  const a = jobs.open(db, { accountId: 'acct_a', kind: 'video', params: { seconds: 5 }, idemKey: key('a'), env, now: NOW });
  await jobs.run(db, a.job.id, ok(1.4), { now: () => NOW });
  const b = jobs.open(db, { accountId: 'acct_a', kind: 'video', params: { seconds: 5 }, idemKey: key('b'), env, now: NOW });
  await jobs.run(db, b.job.id, ok(1.4), { now: () => NOW });
  assert.equal(jobs.open(db, { accountId: 'acct_a', kind: 'video', params: { seconds: 5 }, idemKey: key('c'), env, now: NOW }).code, 'budget');
  assert.equal(jobs.open(db, { accountId: 'acct_owner', owner: true, kind: 'video', params: { seconds: 5 }, idemKey: key('o'), env, now: NOW }).code, 'budget');
  assert.equal(jobs.open(db, { accountId: 'acct_a', kind: 'image', idemKey: key('d'), env, now: new Date('2026-11-03T00:00:01Z') }).ok, true, 'a new UTC day');
  const db2 = freshDb(); give(db2, 'acct_a', 500); const env2 = Object.assign({ SITEREMADE_AI_USER_DAILY_CREDITS: '20' }, ON);
  const c = jobs.open(db2, { accountId: 'acct_a', kind: 'video', params: { seconds: 5 }, idemKey: key('a'), env: env2, now: NOW });
  await jobs.run(db2, c.job.id, ok(), { now: () => NOW });
  assert.equal(jobs.open(db2, { accountId: 'acct_a', kind: 'video', params: { seconds: 12 }, idemKey: key('b'), env: env2, now: NOW }).code, 'user_daily');
  assert.equal(jobs.open(db2, { accountId: 'acct_a', kind: 'video', params: { seconds: 5 }, idemKey: key('c'), env: env2, now: NOW }).ok, true, '9 + 9 fits in 20');
});

test('a provider failure refunds the customer in full and records what the provider charged as a loss', async () => {
  const db = freshDb(); give(db, 'acct_a', 30);
  const a = jobs.open(db, { accountId: 'acct_a', kind: 'video', params: { seconds: 12 }, idemKey: key('f'), env: ON, now: NOW });
  assert.equal(bal(db, 'acct_a'), 9);
  const r = await jobs.run(db, a.job.id, boom(3.36), { now: () => NOW });
  assert.equal(r.status, 'failed'); assert.equal(r.charged, 0); assert.equal(r.refunded, 21); assert.equal(bal(db, 'acct_a'), 30);
  const row = db.aiJobs.find(a.job.id); assert.equal(row.loss_usd, 3.36); assert.equal(row.provider_usd, 3.36);
  assert.equal(credits.findOperation(db, jobs.opFor(a.job.id, 1, 1)).provider_usd, 3.36, 'kept on the ledger operation too');
});

test('a showcase keeps the segments that worked, charges only those, refunds the rest; a retry pays only for the missing ones', async () => {
  const db = freshDb(); give(db, 'acct_a', 100);
  const a = jobs.open(db, { accountId: 'acct_a', kind: 'showcase', params: { images: 4, seconds: 5 }, idemKey: key('s'), env: ON, now: NOW });
  assert.equal(a.job.credits, 27); assert.equal(bal(db, 'acct_a'), 73);
  const r = await jobs.run(db, a.job.id, async (p) => { if (p.n === 2) throw Object.assign(new Error('segment failed'), { usd: 1.4 }); return { result: { n: p.n }, usd: 1.4 }; }, { now: () => NOW });
  assert.equal(r.status, 'partial'); assert.equal(r.charged, 18); assert.equal(r.refunded, 9); assert.equal(bal(db, 'acct_a'), 82);
  assert.deepEqual(r.parts.map((p) => p.status), ['done', 'failed', 'done']);
  const again = jobs.retry(db, { accountId: 'acct_a', jobId: a.job.id, env: ON, now: NOW });
  assert.equal(again.ok, true); assert.equal(again.credits, 9); assert.equal(bal(db, 'acct_a'), 73, 'only the missing segment is reserved');
  const made = [];
  const r2 = await jobs.run(db, a.job.id, async (p) => { made.push(p.n); return { result: { n: p.n }, usd: 1.4 }; }, { now: () => NOW });
  assert.deepEqual(made, [2], 'delivered segments are never made again'); assert.equal(r2.status, 'succeeded'); assert.equal(r2.charged, 27);
  assert.equal(bal(db, 'acct_a'), 73); assert.equal(db.aiJobs.find(a.job.id).loss_usd, 1.4, 'the first failed attempt stays a recorded loss');
  assert.equal(jobs.retry(db, { accountId: 'acct_b', jobId: a.job.id, env: ON, now: NOW }).code, 'not_found', 'only its owner can retry it');
});

test('two requests at once can never both spend the last credits', () => {
  const db = freshDb(); give(db, 'acct_a', 9);
  const env = Object.assign({ SITEREMADE_AI_USER_CONCURRENT: '5' }, ON);
  const r = [jobs.open(db, { accountId: 'acct_a', kind: 'video', params: { seconds: 5 }, idemKey: key('x'), env, now: NOW }), jobs.open(db, { accountId: 'acct_a', kind: 'video', params: { seconds: 5 }, idemKey: key('y'), env, now: NOW })];
  assert.deepEqual(r.map((x) => x.ok), [true, false]); assert.equal(r[1].code, 'balance'); assert.equal(bal(db, 'acct_a'), 0);
  assert.ok(bal(db, 'acct_a') >= 0);
});

test('after a restart, jobs that were mid-way are closed and their unfinished parts refunded; delivered parts stay charged', async () => {
  const db = freshDb(); give(db, 'acct_a', 100);
  const a = jobs.open(db, { accountId: 'acct_a', kind: 'showcase', params: { images: 3 }, idemKey: key('r'), env: ON, now: NOW });
  db.aiJobs.set(a.job.id, { status: 'running' });
  db.transaction(() => { credits.commit(db, jobs.opFor(a.job.id, 1, 1), { now: NOW }); db.aiJobs.setPart(a.job.id, 1, { status: 'done', result_json: '{}' }); });
  assert.equal(jobs.recover(db, { now: NOW }), 1);
  const v = jobs.view(db, db.aiJobs.find(a.job.id));
  assert.equal(v.status, 'partial'); assert.equal(v.charged, 9); assert.equal(bal(db, 'acct_a'), 91);
});
