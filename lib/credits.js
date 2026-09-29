// THE AUTHORITATIVE CREDIT LEDGER (billing pass; migrations/0009_credit_ledger.sql). Every paid action in both the
// builder (Business, Creative) and the client app (AI updates through the app bridge) spends from here.
//
// What an account may spend is a set of GRANTS, each created at most once (its id is deterministic):
//   trial         the one-time free trial:              'trial:<account>'             never expires
//   subscription  each paid Workspace billing month:     'sub:<subscription>:<start>'  expires at the period end (no
//                 rollover); revoked early if the plan is cancelled immediately
//   tester        the owner's separate tester allowance: 'tester:<account>:<UTC day>'  expires at the next UTC midnight
// A paid action is an OPERATION with a unique id. reserve() is idempotent per id: a retry, double click or reconnect
// that reuses the id gets the same reservation back -- it can never reserve or charge twice. An operation draws from
// grants in spend order (tester day -> subscription month -> trial: what expires first is used first) and stays
// charged against those grants, so an action that crosses a day or billing-month boundary never touches another
// period's credits. A reservation nobody settles (a crash, an abandoned job) stops holding credits at its expiry.
// Everything here is synchronous inside db.transaction(): SQLite serialises it, so two parallel requests can never
// both spend the last credit.
'use strict';

const DEFAULT_TTL_MS = 20 * 60 * 1000; // longer than any single paid call (planning ~2 min, app edits <= 150 s)
const SPEND_ORDER = { tester: 0, subscription: 1, trial: 2 };

function iso(d) { return (d instanceof Date ? d : new Date(d || Date.now())).toISOString(); }
function utcDay(now) { return iso(now).slice(0, 10); }
function nextUtcMidnight(now) { const d = new Date(now || Date.now()); return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1)).toISOString(); }

// The grants an account is due right now. `policy`: { trialCredits, testerDailyCredits (0 = not a tester),
// subscription: { id, periodStart, periodEnd, credits } | null (only for a verified, paid, current period) }
function ensureGrants(db, accountId, policy, now) {
  const at = iso(now);
  db.transaction(() => {
    if (policy.trialCredits > 0) db.ledger.insertGrantIfNew({ id: `trial:${accountId}`, accountId, kind: 'trial', amount: policy.trialCredits, startsAt: '1970-01-01T00:00:00.000Z', expiresAt: null, source: 'free trial', createdAt: at });
    if (policy.testerDailyCredits > 0) db.ledger.insertGrantIfNew({ id: `tester:${accountId}:${utcDay(now)}`, accountId, kind: 'tester', amount: policy.testerDailyCredits, startsAt: `${utcDay(now)}T00:00:00.000Z`, expiresAt: nextUtcMidnight(now), source: 'tester allowance', createdAt: at });
    const s = policy.subscription;
    if (s && s.id && s.periodStart && s.periodEnd && s.credits > 0) {
      db.ledger.insertGrantIfNew({ id: `sub:${s.id}:${s.periodStart}`, accountId, kind: 'subscription', amount: s.credits, startsAt: s.periodStart, expiresAt: s.periodEnd, source: `Workspace subscription ${s.id}`, createdAt: at });
    }
  });
}
// An immediately cancelled plan ends its current month's remaining credits (committed use is untouched).
function revokeSubscriptionGrants(db, accountId, subscriptionId, now) {
  const at = iso(now); let n = 0;
  db.ledger.grantsForAccount(accountId).filter(g => g.kind === 'subscription' && (!subscriptionId || g.id.startsWith(`sub:${subscriptionId}:`)) && !g.revoked_at && (!g.expires_at || g.expires_at > at))
    .forEach(g => { n += db.ledger.revokeGrant(g.id, at); });
  return n;
}

function liveGrants(db, accountId, now) {
  const at = iso(now);
  return db.ledger.grantsForAccount(accountId)
    .filter(g => g.starts_at <= at && (!g.expires_at || g.expires_at > at) && (!g.revoked_at || g.revoked_at > at))
    .map(g => ({ id: g.id, kind: g.kind, amount: g.amount, expiresAt: g.expires_at, remaining: Math.max(0, g.amount - db.ledger.usedOnGrant(g.id, at)) }))
    .sort((a, b) => (SPEND_ORDER[a.kind] - SPEND_ORDER[b.kind]) || String(a.expiresAt || '9').localeCompare(String(b.expiresAt || '9')));
}
function available(db, accountId, now) {
  const grants = liveGrants(db, accountId, now);
  return { total: grants.reduce((n, g) => n + g.remaining, 0), grants };
}

function allocate(db, accountId, opId, amount, now) {
  const grants = liveGrants(db, accountId, now);
  const total = grants.reduce((n, g) => n + g.remaining, 0);
  if (amount > total) return { ok: false, remaining: total };
  let left = amount;
  for (const g of grants) { if (!left) break; const take = Math.min(left, g.remaining); if (take > 0) { db.ledger.insertAllocation(opId, g.id, take); left -= take; } }
  return { ok: true, remaining: total - amount };
}

// Reserve `amount` credits for operation `opId`. Returns { ok, opId, amount, remaining, existing, status }.
// A zero-cost action never touches the ledger. Reusing an id returns the existing reservation (or its settled state);
// an id whose earlier attempt was released may reserve again (a legitimate retry after a failure).
function reserve(db, { accountId, opId, amount, kind, jobId = null, ttlMs = DEFAULT_TTL_MS, now } = {}) {
  if (!accountId || !opId) throw new Error('reserve needs an account and an operation id');
  if (!(amount > 0)) return { ok: true, opId, amount: 0, remaining: null, existing: false, status: 'free' };
  const at = iso(now); const expiresAt = iso(new Date(new Date(at).getTime() + ttlMs));
  return db.transaction(() => {
    db.ledger.releaseExpired(at, at);
    const found = db.ledger.findOp(opId);
    if (found) {
      if (found.account_id !== accountId) return { ok: false, opId, reason: 'foreign_operation', remaining: available(db, accountId, now).total };
      if (found.status !== 'released') return { ok: true, opId, amount: found.amount, remaining: available(db, accountId, now).total, existing: true, status: found.status };
      // a released attempt, retried: allocate afresh under the same id
      db.ledger.deleteAllocations(opId);
      const a = allocate(db, accountId, opId, found.amount, now);
      if (!a.ok) return { ok: false, opId, remaining: a.remaining };
      db.ledger.setOpStatus(opId, 'released', 'reserved', at); db.ledger.setOpExpiry(opId, expiresAt, at);
      return { ok: true, opId, amount: found.amount, remaining: a.remaining, existing: false, retried: true, status: 'reserved' };
    }
    db.ledger.insertOp({ opId, accountId, kind, amount, status: 'reserved', jobId, expiresAt, createdAt: at });
    const a = allocate(db, accountId, opId, amount, now);
    if (!a.ok) { db.ledger.deleteOp(opId); return { ok: false, opId, remaining: a.remaining }; }
    return { ok: true, opId, amount, remaining: a.remaining, existing: false, status: 'reserved' };
  });
}

// The work succeeded: the reservation becomes a charge. If it had already expired and been released (the work
// outlived its reservation), it is charged only if the credits are still free now -- never by taking credits another
// operation holds.
function commit(db, opId, { now, providerUsd } = {}) {
  if (!opId) return { ok: true, charged: 0 };
  const at = iso(now);
  return db.transaction(() => {
    const op = db.ledger.findOp(opId); if (!op) return { ok: false, reason: 'unknown_operation', charged: 0 };
    if (providerUsd > 0) db.ledger.addProviderUsd(opId, providerUsd, at);
    if (op.status === 'committed') return { ok: true, charged: op.amount, already: true };
    if (op.status === 'reserved' && op.expires_at > at) { db.ledger.setOpStatus(opId, 'reserved', 'committed', at); return { ok: true, charged: op.amount }; }
    if (op.status === 'reserved') db.ledger.setOpStatus(opId, 'reserved', 'released', at);
    db.ledger.deleteAllocations(opId);
    const a = allocate(db, op.account_id, opId, op.amount, now);
    if (!a.ok) return { ok: false, reason: 'expired_unfunded', charged: 0 };
    db.ledger.setOpStatus(opId, 'released', 'committed', at);
    return { ok: true, charged: op.amount, late: true };
  });
}
// The work failed or was abandoned: the reservation is returned. A committed charge is never undone here.
function release(db, opId, { now, providerUsd } = {}) {
  if (!opId) return { ok: true };
  const at = iso(now);
  return db.transaction(() => {
    const op = db.ledger.findOp(opId); if (!op) return { ok: false, reason: 'unknown_operation' };
    if (providerUsd > 0) db.ledger.addProviderUsd(opId, providerUsd, at);
    if (op.status === 'reserved') db.ledger.setOpStatus(opId, 'reserved', 'released', at);
    return { ok: true, status: op.status === 'reserved' ? 'released' : op.status };
  });
}
// A long job keeps its reservation alive (a Creative page waiting on the owner's picture choice).
function extend(db, opId, untilIso, now) { const op = opId && db.ledger.findOp(opId); if (op && op.status === 'reserved') db.ledger.setOpExpiry(opId, untilIso, iso(now)); }
// provider expense is tracked per operation even when the customer is not charged
function addProviderUsd(db, opId, usd, now) { if (opId && usd > 0 && db.ledger.findOp(opId)) db.ledger.addProviderUsd(opId, usd, iso(now)); }
function findOperation(db, opId) { return opId ? db.ledger.findOp(opId) : null; }

module.exports = {
  DEFAULT_TTL_MS, utcDay, nextUtcMidnight,
  ensureGrants, revokeSubscriptionGrants, liveGrants, available, reserve, commit, release, extend, addProviderUsd, findOperation,
};
