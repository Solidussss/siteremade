// ONE CREATIVE PAGE = ONE JOB (billing pass). Research (understanding, picture search, picture checks), the owner's
// picture choice, the watermark check and the direction (with its claim check and one bounded automatic repair) are
// one identifiable generation job with one predictable price:
//   4 credits per Creative page = 1 for research + 3 for the direction.
// Both parts are reserved BEFORE any paid research begins, in one step (both or neither). Research is charged when it
// completes; the direction part is charged when the page is directed. The owner may search again or resume after a
// reload within the same job (at most RESEARCH_RUNS research runs in all, included in the price) -- a fresh start is a
// new job and a new price, so repeated starts cannot buy unlimited research. If the owner stops at the picture step,
// the job ends after JOB_TTL_MS: the direction part returns to them, the research credit stays spent. A direction that
// fails (the page falls back to the built-in layout) returns its 3 credits. "Try another direction" on a page that was
// already directed is a new direction on the same job: 3 credits (the research is reused, not repeated).
'use strict';
const crypto = require('crypto');
const credits = require('./credits.js');

const PRICES = { research: 1, direction: 3 };
const JOB_TTL_MS = 24 * 60 * 60 * 1000;
const RESEARCH_RUNS = 3;

function iso(d) { return (d instanceof Date ? d : new Date(d || Date.now())).toISOString(); }
function newJobId() { return 'cj_' + crypto.randomBytes(12).toString('base64url'); }

function start(db, accountId, { now } = {}) {
  const at = iso(now); const id = newJobId(); const expiresAt = iso(new Date(Date.parse(at) + JOB_TTL_MS));
  return db.transaction(() => {
    const r1 = credits.reserve(db, { accountId, opId: `${id}:research`, amount: PRICES.research, kind: 'creative_research', jobId: id, ttlMs: JOB_TTL_MS, now });
    if (!r1.ok) throw Object.assign(new Error('insufficient'), { remaining: r1.remaining });
    const r2 = credits.reserve(db, { accountId, opId: `${id}:direction:1`, amount: PRICES.direction, kind: 'creative_direction', jobId: id, ttlMs: JOB_TTL_MS, now });
    if (!r2.ok) throw Object.assign(new Error('insufficient'), { remaining: Math.max(0, (r2.remaining || 0) + PRICES.research) });
    db.ledger.insertJob({ id, accountId, status: 'open', expiresAt, createdAt: at });
    return { ok: true, job: db.ledger.findJob(id), remaining: r2.remaining };
  });
}
function begin(db, accountId, opts) {
  try { return start(db, accountId, opts); } catch (e) { if (e.message === 'insufficient') return { ok: false, remaining: e.remaining || 0 }; throw e; }
}

// the caller's own, still-running job
function get(db, accountId, jobId, { now } = {}) {
  if (!jobId || typeof jobId !== 'string' || !/^cj_[A-Za-z0-9_-]{8,40}$/.test(jobId)) return null;
  const j = db.ledger.findJob(jobId);
  if (!j || j.account_id !== accountId) return null;
  if (j.expires_at <= iso(now) && j.status !== 'done') return null;
  return j;
}
function directionOp(job) { return `${job.id}:direction:${Math.max(1, job.directions + 1)}`; }

// one research run of this job (the first, a "search again" or a resume after a reload), if any remain
function takeResearchRun(db, job, { now } = {}) {
  const at = iso(now);
  return db.transaction(() => {
    const j = db.ledger.findJob(job.id);
    if (!j || j.research_runs >= RESEARCH_RUNS) return false;
    db.ledger.updateJob(j.id, { research_runs: j.research_runs + 1 }, at);
    return true;
  });
}
function researchDone(db, job, { now, providerUsd } = {}) { return credits.commit(db, `${job.id}:research`, { now, providerUsd }); }
// research failed before anything usable came back: nothing is charged for it, and the job ends
function researchFailed(db, job, { now, providerUsd } = {}) {
  credits.release(db, `${job.id}:research`, { now, providerUsd });
  db.ledger.opsForJob(job.id).filter(o => o.status === 'reserved').forEach(o => credits.release(db, o.op_id, { now }));
  db.ledger.updateJob(job.id, { status: 'failed' }, iso(now));
}

// The direction step. Returns { ok, op, replay } -- replay: this job already has a directed page for this attempt
// (a double click, a retry after a lost response), returned as it is instead of paying the model again.
function beginDirection(db, accountId, job, { another = false, now } = {}) {
  const at = iso(now);
  return db.transaction(() => {
    const j = db.ledger.findJob(job.id);
    if (!j) return { ok: false, reason: 'no_job' };
    // a direction still running holds the job; one whose server died mid-call (no update for longer than any call
    // can take) is recovered so the owner can retry -- its reservation expired with it, so it is reserved afresh
    if (j.status === 'directing') {
      if (Date.parse(j.updated_at) + credits.DEFAULT_TTL_MS > Date.parse(at)) return { ok: false, reason: 'in_progress' };
      db.ledger.claimJob(j.id, 'directing', j.directions > 0 ? 'done' : 'open', at);
      Object.assign(j, db.ledger.findJob(j.id));
    }
    if (j.status === 'done' && !another && j.result_json) return { ok: true, replay: JSON.parse(j.result_json) };
    let op = directionOp(j);
    if (j.status === 'done' || another && j.directions > 0) {
      // a further direction for the same page: its own 3-credit reservation
      op = `${j.id}:direction:${j.directions + 1}`;
      const r = credits.reserve(db, { accountId, opId: op, amount: PRICES.direction, kind: 'creative_direction', jobId: j.id, now });
      if (!r.ok) return { ok: false, reason: 'insufficient', remaining: r.remaining };
    } else {
      const existing = db.ledger.findOp(op);
      if (!existing || existing.status === 'released') {
        const r = credits.reserve(db, { accountId, opId: op, amount: PRICES.direction, kind: 'creative_direction', jobId: j.id, now });
        if (!r.ok) return { ok: false, reason: 'insufficient', remaining: r.remaining };
      }
    }
    if (!db.ledger.claimJob(j.id, j.status, 'directing', at)) return { ok: false, reason: 'in_progress' };
    credits.extend(db, op, iso(new Date(Date.parse(at) + credits.DEFAULT_TTL_MS)), now);
    return { ok: true, op };
  });
}
function directionDone(db, job, op, result, { now, providerUsd } = {}) {
  const at = iso(now);
  credits.commit(db, op, { now, providerUsd });
  const j = db.ledger.findJob(job.id);
  db.ledger.updateJob(job.id, { status: 'done', directions: (j ? j.directions : 0) + 1, result_json: JSON.stringify(result) }, at);
}
// the direction did not produce a page (the studio falls back to the built-in layout): its credits come back
function directionFailed(db, job, op, { now, providerUsd } = {}) {
  credits.release(db, op, { now, providerUsd });
  const j = db.ledger.findJob(job.id);
  db.ledger.updateJob(job.id, { status: j && j.directions > 0 ? 'done' : 'open' }, iso(now));
}
// the watermark check on picked pictures belongs to a job that still has a direction ahead of it
function hasDirectionAhead(db, job) {
  const j = db.ledger.findJob(job.id); if (!j) return false;
  const op = db.ledger.findOp(directionOp(j));
  return !!(op && op.status === 'reserved') || j.status === 'directing';
}

module.exports = { PRICES, JOB_TTL_MS, RESEARCH_RUNS, begin, get, takeResearchRun, researchDone, researchFailed, beginDirection, directionDone, directionFailed, hasDirectionAhead, directionOp };
