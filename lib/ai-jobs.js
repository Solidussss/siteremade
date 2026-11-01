'use strict';
// CUSTOMER AI JOBS -- every paid AI action in the studio goes through here, on top of the existing credit ledger
// (lib/credits.js: quote -> reserve -> run -> settle/release). Nothing here prices anything itself: lib/ai-prices.js does,
// on the server, from the action and its parameters.
//
//   quote(...)   what it would cost, and whether it may run now (balance, limits, budget) -- nothing is held
//   open(...)    one transaction: the same request (account + idempotency key) gets the same job back, never a second
//                charge; otherwise every check runs again and each PART's credits are reserved (a part is one paid call:
//                one for most jobs, one per transition for a property showcase)
//   run(...)     makes the parts in order; each part is charged when it delivers and refunded when it doesn't. What
//                the provider charged is recorded either way -- a part that cost money and delivered nothing is a loss
//                (loss_usd), counted against the day's budget, never against the customer.
//   retry(...)   a partial job's failed parts only, paid again (a fresh reservation); delivered parts are never re-run
//                or re-charged
//   recover(...) after a restart: jobs that were mid-way are closed (their unfinished parts refunded)
//
// THE LIMITS (all server-side, all configurable):
//   SITEREMADE_CUSTOMER_AI=on            customers may start paid AI at all (off by default: only the owner can)
//   SITEREMADE_AI_PRICES_VERIFIED=on     the provider prices were checked (lib/ai-prices.js): customers are refused
//                                        until then, so a guessed price is never charged
//   SITEREMADE_AI_DAILY_USD (30)         all AI jobs on this server, provider money per UTC day (owner's too)
//   SITEREMADE_AI_USER_DAILY_CREDITS (100) credits one customer may spend on AI per UTC day
//   SITEREMADE_AI_USER_CONCURRENT (1)    jobs one account may have in progress
//   SITEREMADE_AI_VIDEO_CONCURRENT (3)   video jobs in progress across the whole server
// The owner (lib: isDesignOwner) pays no credits but stays inside the server budget and the concurrency limits.
const crypto = require('crypto');
const credits = require('./credits');
const prices = require('./ai-prices');

const iso = (d) => (d instanceof Date ? d : new Date(d || Date.now())).toISOString();
const dayStart = (now) => iso(now).slice(0, 10) + 'T00:00:00.000Z';
const num = (v, d) => { const n = Number(v); return v != null && String(v).trim() !== '' && Number.isFinite(n) && n >= 0 ? n : d; };
const RESERVE_TTL_MS = 2 * 3600e3;     // a showcase can take a while; an abandoned reservation still expires

function limits(env = process.env) {
  return {
    customerAi: String(env.SITEREMADE_CUSTOMER_AI || 'off').trim().toLowerCase() === 'on',
    pricesVerified: String(env.SITEREMADE_AI_PRICES_VERIFIED || 'off').trim().toLowerCase() === 'on',
    dailyUsd: num(env.SITEREMADE_AI_DAILY_USD, 30),
    userDailyCredits: num(env.SITEREMADE_AI_USER_DAILY_CREDITS, 100),
    userConcurrent: Math.max(1, Math.floor(num(env.SITEREMADE_AI_USER_CONCURRENT, 1))),
    videoConcurrent: Math.max(1, Math.floor(num(env.SITEREMADE_AI_VIDEO_CONCURRENT, 3))),
  };
}

// every reason a job may not start, worded for the customer (code is for the client and the tests)
const REFUSE = {
  off: 'AI generation isn’t open to customers yet. Your edits are still free, and we can make this for you: use “Ask us”.',
  unverified: 'AI generation is paused while we confirm our prices. Nothing was charged.',
  busy: 'You already have something generating. Wait for it to finish, then try again.',
  video_busy: 'Our video makers are all busy right now. Try again in a few minutes. Nothing was charged.',
  budget: 'We’ve reached today’s limit for AI generation. Try again tomorrow. Nothing was charged.',
  user_daily: 'That would go over today’s AI limit for your account. Try again tomorrow. Nothing was charged.',
  balance: 'Not enough credits for this. Buy credits to continue.',
};

// What `kind` with `params` costs and whether `accountId` may run it now. Nothing is held. -> a view the client shows
// verbatim: balance, credits, after, allowed + why not.
function quote(db, { accountId, owner = false, kind, params = {}, env = process.env, now } = {}) {
  const q = prices.quote(kind, params, env); if (q.error) return { ok: false, code: 'bad_request', message: q.error };
  const L = limits(env); const at = iso(now);
  const balance = credits.available(db, accountId, now).total;
  const cost = owner ? 0 : q.credits;
  const why = refusal(db, { accountId, owner, q, L, at, balance });
  return { ok: true, kind, credits: cost, listCredits: q.credits, balance, after: balance - cost, owner: !!owner,
    parts: q.parts.map((p) => ({ n: p.n, what: p.what, credits: owner ? 0 : p.credits })),
    allowed: !why, code: why || null, message: why ? REFUSE[why] : null };
}
function refusal(db, { accountId, owner, q, L, at, balance }) {
  if (!owner && !L.customerAi) return 'off';
  if (!owner && !L.pricesVerified) return 'unverified';
  if (db.aiJobs.activeForAccount(accountId) >= L.userConcurrent) return 'busy';
  if (q.video && db.aiJobs.activeVideo() >= L.videoConcurrent) return 'video_busy';
  if (db.aiJobs.spendSince(dayStart(at)) + q.estUsd > L.dailyUsd) return 'budget';
  if (!owner && db.aiJobs.creditsSince(accountId, dayStart(at)) + q.credits > L.userDailyCredits) return 'user_daily';
  if (!owner && balance < q.credits) return 'balance';
  return null;
}

const opFor = (jobId, n, attempt) => `ai:${jobId}:${n}:${attempt}`;

// Start a job. idemKey comes from the client (one per confirmed click): the same key returns the same job. Everything
// -- the checks, the job, its parts and every part's credit reservation -- happens in ONE transaction, so two requests
// at once can never both pass a limit or both spend the last credits.
// -> { ok: true, job, existing } | { ok: false, code, message }
function open(db, { accountId, owner = false, kind, params = {}, idemKey, siteId = null, env = process.env, now } = {}) {
  if (!accountId) return { ok: false, code: 'auth', message: 'Sign in first.' };
  const key = String(idemKey || '').trim();
  if (!/^[A-Za-z0-9_-]{8,80}$/.test(key)) return { ok: false, code: 'bad_request', message: 'Missing request key.' };
  const q = prices.quote(kind, params, env); if (q.error) return { ok: false, code: 'bad_request', message: q.error };
  const L = limits(env); const at = iso(now);
  try { return openTx(db, { accountId, owner, kind, params, key, siteId, q, L, at, now }); } catch (e) {
    if (e && e.code === 'balance') return { ok: false, code: 'balance', message: REFUSE.balance };
    throw e;
  }
}
function openTx(db, { accountId, owner, kind, params, key, siteId, q, L, at, now }) {
  return db.transaction(() => {
    const had = db.aiJobs.findByKey(accountId, key);
    if (had) return { ok: true, job: view(db, had), existing: true };
    const balance = credits.available(db, accountId, now).total;
    const why = refusal(db, { accountId, owner, q, L, at, balance });
    if (why) return { ok: false, code: why, message: REFUSE[why], balance };
    const id = 'aij_' + crypto.randomBytes(12).toString('base64url');
    db.aiJobs.insert({ id, accountId, idemKey: key, kind, siteId, owner, video: q.video, status: 'queued', credits: owner ? 0 : q.credits, estUsd: q.estUsd, params, createdAt: at });
    for (const p of q.parts) {
      const cost = owner ? 0 : p.credits, opId = opFor(id, p.n, 1);
      if (cost > 0) {
        const r = credits.reserve(db, { accountId, opId, amount: cost, kind: `ai_${kind}`, jobId: id, ttlMs: RESERVE_TTL_MS, now });
        if (!r.ok) throw Object.assign(new Error('reserve failed'), { code: 'balance' });   // (rolls the whole job back)
      }
      db.aiJobs.insertPart({ jobId: id, n: p.n, status: 'pending', attempt: 1, opId: cost > 0 ? opId : null, credits: cost, estUsd: p.estUsd, updatedAt: at });
    }
    return { ok: true, job: view(db, db.aiJobs.find(id)), existing: false };
  });
}

// Make a job's pending parts. maker(part, job) is the paid work for one part: it resolves { result, usd } (usd = what
// the provider charged) or throws an error carrying e.usd when the provider charged anyway. Parts run in order; a
// showcase keeps going after a failed segment (each segment stands alone), so the customer gets everything that worked.
async function run(db, jobId, maker, { now = () => new Date() } = {}) {
  let job = db.aiJobs.find(jobId); if (!job || !['queued', 'running'].includes(job.status)) return job && view(db, job);
  db.aiJobs.set(jobId, { status: 'running', updated_at: iso(now()) });
  for (const part of db.aiJobs.parts(jobId)) {
    if (part.status !== 'pending') continue;
    db.aiJobs.setPart(jobId, part.n, { status: 'running', updated_at: iso(now()) });
    let out = null, err = null;
    try { out = await maker(part, job); } catch (e) { err = e; }
    const usd = Math.max(0, Number((out ? out.usd : err && err.usd) || 0));
    db.transaction(() => {
      const at = iso(now()); const p = db.aiJobs.parts(jobId).find((x) => x.n === part.n);
      if (out) {
        if (p.op_id) credits.commit(db, p.op_id, { providerUsd: usd, now: now() });
        db.aiJobs.setPart(jobId, part.n, { status: 'done', provider_usd: p.provider_usd + usd, result_json: JSON.stringify(out.result || null), error: null, updated_at: at });
      } else {
        if (p.op_id) credits.release(db, p.op_id, { providerUsd: usd, now: now() });   // refunded; the provider's charge is kept on the operation
        db.aiJobs.setPart(jobId, part.n, { status: 'failed', provider_usd: p.provider_usd + usd, loss_usd: p.loss_usd + usd, error: String((err && err.message) || 'failed').slice(0, 300), updated_at: at });
      }
    });
  }
  return finish(db, jobId, now());
}
function finish(db, jobId, now) {
  const parts = db.aiJobs.parts(jobId); const done = parts.filter((p) => p.status === 'done');
  const status = done.length === parts.length ? 'succeeded' : done.length ? 'partial' : 'failed';
  db.aiJobs.set(jobId, {
    status, charged: done.reduce((a, p) => a + p.credits, 0), provider_usd: +parts.reduce((a, p) => a + p.provider_usd, 0).toFixed(4),
    loss_usd: +parts.reduce((a, p) => a + p.loss_usd, 0).toFixed(4), error: status === 'succeeded' ? null : (parts.find((p) => p.status === 'failed') || {}).error || null,
    result_json: JSON.stringify(done.map((p) => ({ n: p.n, result: JSON.parse(p.result_json || 'null') }))), updated_at: iso(now), finished_at: iso(now),
  });
  return view(db, db.aiJobs.find(jobId));
}

// Try a partial or failed job's failed parts again. Only those parts are paid for (a new reservation each); what was
// already delivered is kept and never charged twice. Same checks as open().
function retry(db, { accountId, jobId, env = process.env, now } = {}) {
  const job = db.aiJobs.find(jobId);
  if (!job || job.account_id !== accountId) return { ok: false, code: 'not_found', message: 'Not found.' };
  if (!['partial', 'failed'].includes(job.status)) return { ok: false, code: 'bad_request', message: 'Nothing to retry.' };
  const L = limits(env); const at = iso(now); const owner = !!job.owner;
  try { return retryTx(db, { accountId, jobId, job, owner, L, at, now }); } catch (e) {
    if (e && e.code === 'balance') return { ok: false, code: 'balance', message: REFUSE.balance };
    throw e;
  }
}
function retryTx(db, { accountId, jobId, job, owner, L, at, now }) {
  return db.transaction(() => {
    const failed = db.aiJobs.parts(jobId).filter((p) => p.status === 'failed');
    const need = failed.reduce((a, p) => a + p.credits, 0);      // (an owner's parts carry 0 credits)
    const q = { video: !!job.video, credits: need, estUsd: failed.reduce((a, p) => a + p.est_usd, 0) };
    const balance = credits.available(db, accountId, now).total;
    const why = refusal(db, { accountId, owner, q, L, at, balance });
    if (why) return { ok: false, code: why, message: REFUSE[why], balance };
    for (const p of failed) {
      const attempt = p.attempt + 1, opId = p.credits > 0 ? opFor(jobId, p.n, attempt) : null;
      if (opId) { const r = credits.reserve(db, { accountId, opId, amount: p.credits, kind: `ai_${job.kind}`, jobId, ttlMs: RESERVE_TTL_MS, now }); if (!r.ok) throw Object.assign(new Error('reserve failed'), { code: 'balance' }); }
      db.aiJobs.setPart(jobId, p.n, { status: 'pending', attempt, op_id: opId, error: null, updated_at: at });
    }
    db.aiJobs.set(jobId, { status: 'queued', error: null, updated_at: at, finished_at: null });
    return { ok: true, job: view(db, db.aiJobs.find(jobId)), credits: need };
  });
}

// After a restart: a job that was mid-way can't be resumed safely, so its unfinished parts are refunded (whatever the
// provider may have charged for them is unknown -- the ledger's operation keeps any figure we had). Delivered parts stay.
function recover(db, { now } = {}) {
  let n = 0;
  for (const job of db.aiJobs.running()) {
    db.transaction(() => {
      for (const p of db.aiJobs.parts(job.id)) {
        if (!['pending', 'running'].includes(p.status)) continue;
        if (p.op_id) credits.release(db, p.op_id, { now });
        db.aiJobs.setPart(job.id, p.n, { status: 'failed', error: 'Interrupted by a server restart (refunded).', updated_at: iso(now) });
      }
      finish(db, job.id, now || new Date());
    });
    n++;
  }
  return n;
}

// what the client sees -- never provider figures
function view(db, job) {
  if (!job) return null;
  const parts = db.aiJobs.parts(job.id).map((p) => ({ n: p.n, status: p.status, credits: p.credits, attempt: p.attempt, error: p.status === 'failed' ? p.error : null, result: p.result_json ? JSON.parse(p.result_json) : null }));
  return { id: job.id, kind: job.kind, siteId: job.site_id, status: job.status, credits: job.credits, charged: job.charged,
    refunded: ['succeeded', 'partial', 'failed'].includes(job.status) ? Math.max(0, parts.filter((p) => p.status === 'failed').reduce((a, p) => a + p.credits, 0)) : 0,
    parts, params: JSON.parse(job.params_json || '{}'), error: job.error, createdAt: job.created_at, finishedAt: job.finished_at };
}

module.exports = { limits, quote, open, run, retry, recover, view, REFUSE, opFor };
