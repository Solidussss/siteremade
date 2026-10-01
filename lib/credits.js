// THE AUTHORITATIVE CREDIT LEDGER (migrations/0009_credit_ledger.sql + 0010_credits_ownership.sql). Every paid action in
// both the builder (Business, Creative, premium media) and the client app (AI updates through the app bridge) spends
// from here. Credits pay for SiteRemade doing work; they never decide who owns a website.
//
// What an account may spend is a set of GRANTS, each created at most once (its id is deterministic):
//   purchase      a credit pack, bought once:            'purchase:<credit purchase id>'  never expires
//   bonus         the first purchased website's bonus:   'bonus:first_website:<account>'  never expires; once per account
//   trial         the one-time free trial:               'trial:<account>'                never expires
//   tester        the owner's separate tester allowance: 'tester:<account>:<UTC day>'     expires at the next UTC midnight
//   subscription  LEGACY: a paid Workspace month granted before subscriptions were retired, 'sub:<sub>:<start>'.
//                 Expires at its period end. No new Workspace subscription is sold.
//   admin         a recorded manual adjustment:          'admin:<id>'
// A refund revokes the unused part of the grant it paid for (spent credits stay spent: they paid for work done).
//
// A paid action is an OPERATION with a unique id: quote -> reserve -> execute -> settle. reserve() is idempotent per id:
// a retry, double click or reconnect that reuses the id gets the same reservation back -- it can never reserve or charge
// twice. An operation draws from grants in spend order (what expires first is used first) and stays charged against
// those grants. settle() charges what the work actually used and returns the rest (refunded); release() returns all of
// it when the work failed. A reservation nobody settles (a crash, an abandoned job) stops holding credits at its expiry.
//
// Every movement is ALSO an append-only credit_events row written in the same transaction: purchased,
// first_website_bonus, trial, tester, legacy_subscription, admin_adjustment, reserved, charged, released, refunded,
// revoked. The spendable balance derives from grants and allocations; the events are its audit trail.
// Everything here is synchronous inside db.transaction(): SQLite serialises it, so two parallel requests can never both
// spend the last credit.
'use strict';

const DEFAULT_TTL_MS = 20 * 60 * 1000; // longer than any single paid call (planning ~2 min, app edits <= 150 s)
const SPEND_ORDER = { tester: 0, subscription: 1, bonus: 2, trial: 3, admin: 4, purchase: 5 };
const GRANT_EVENT = { purchase: 'purchased', bonus: 'first_website_bonus', trial: 'trial', tester: 'tester', subscription: 'legacy_subscription', admin: 'admin_adjustment' };

function iso(d) { return (d instanceof Date ? d : new Date(d || Date.now())).toISOString(); }
function utcDay(now) { return iso(now).slice(0, 10); }
function nextUtcMidnight(now) { const d = new Date(now || Date.now()); return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1)).toISOString(); }
// (an adapter without the events table -- an older test double -- simply records nothing)
function event(db, e) { if (db.creditEvents) db.creditEvents.append(e); }

function insertGrant(db, g, reason) {
  const n = db.ledger.insertGrantIfNew(g);
  if (n) event(db, { accountId: g.accountId, type: GRANT_EVENT[g.kind] || 'admin_adjustment', amount: g.amount, grantId: g.id, reason: reason || g.source, ref: g.ref || null, createdAt: g.createdAt });
  return n;
}

// The automatic grants an account is due right now. `policy`: { trialCredits, testerDailyCredits (0 = not a tester),
// subscription: { id, periodStart, periodEnd, credits } | null (LEGACY: only a verified, paid, current Workspace month) }
function ensureGrants(db, accountId, policy, now) {
  const at = iso(now);
  db.transaction(() => {
    if (policy.trialCredits > 0) insertGrant(db, { id: `trial:${accountId}`, accountId, kind: 'trial', amount: policy.trialCredits, startsAt: '1970-01-01T00:00:00.000Z', expiresAt: null, source: 'free trial', createdAt: at });
    if (policy.testerDailyCredits > 0) insertGrant(db, { id: `tester:${accountId}:${utcDay(now)}`, accountId, kind: 'tester', amount: policy.testerDailyCredits, startsAt: `${utcDay(now)}T00:00:00.000Z`, expiresAt: nextUtcMidnight(now), source: 'tester allowance', createdAt: at });
    const s = policy.subscription;
    if (s && s.id && s.periodStart && s.periodEnd && s.credits > 0) {
      insertGrant(db, { id: `sub:${s.id}:${s.periodStart}`, accountId, kind: 'subscription', amount: s.credits, startsAt: s.periodStart, expiresAt: s.periodEnd, source: `legacy Workspace subscription ${s.id}`, createdAt: at });
    }
  });
}
// A purchase, a bonus or an admin adjustment: granted once per id, whatever retries or duplicated webhooks ask.
// -> { ok, created, grantId }
function grant(db, { id, accountId, kind, amount, source, reason, ref, now }) {
  if (!id || !accountId || !['purchase', 'bonus', 'admin'].includes(kind) || !(amount > 0)) throw new Error('grant needs an id, an account, a kind (purchase | bonus | admin) and a positive amount');
  const at = iso(now);
  const created = db.transaction(() => insertGrant(db, { id, accountId, kind, amount: Math.round(amount), startsAt: '1970-01-01T00:00:00.000Z', expiresAt: null, source: source || kind, ref, createdAt: at }, reason));
  return { ok: true, created: !!created, grantId: id };
}
// A refund: the grant's UNUSED credits end now (credits already spent paid for work that was done). -> { revoked: n }
function revokeGrant(db, grantId, { reason, ref, now } = {}) {
  const at = iso(now);
  return db.transaction(() => {
    const g = db.ledger.findGrant(grantId); if (!g || g.revoked_at) return { ok: !!g, revoked: 0, already: !!(g && g.revoked_at) };
    const remaining = Math.max(0, g.amount - db.ledger.usedOnGrant(g.id, at));
    db.ledger.revokeGrant(g.id, at);
    event(db, { accountId: g.account_id, type: 'revoked', amount: remaining, grantId: g.id, reason: reason || 'refund', ref, createdAt: at });
    return { ok: true, revoked: remaining };
  });
}
// LEGACY: an immediately cancelled Workspace plan ends its current month's remaining credits (committed use untouched).
function revokeSubscriptionGrants(db, accountId, subscriptionId, now) {
  const at = iso(now); let n = 0;
  db.ledger.grantsForAccount(accountId).filter(g => g.kind === 'subscription' && (!subscriptionId || g.id.startsWith(`sub:${subscriptionId}:`)) && !g.revoked_at && (!g.expires_at || g.expires_at > at))
    .forEach(g => { const r = revokeGrant(db, g.id, { reason: 'legacy Workspace subscription ended', now }); if (r.ok && !r.already) n++; });
  return n;
}

function liveGrants(db, accountId, now) {
  const at = iso(now);
  return db.ledger.grantsForAccount(accountId)
    .filter(g => g.starts_at <= at && (!g.expires_at || g.expires_at > at) && (!g.revoked_at || g.revoked_at > at))
    .map(g => ({ id: g.id, kind: g.kind, amount: g.amount, expiresAt: g.expires_at, remaining: Math.max(0, g.amount - db.ledger.usedOnGrant(g.id, at)) }))
    .sort((a, b) => ((SPEND_ORDER[a.kind] ?? 9) - (SPEND_ORDER[b.kind] ?? 9)) || String(a.expiresAt || '9').localeCompare(String(b.expiresAt || '9')));
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
function reserve(db, { accountId, opId, amount, kind, jobId = null, ttlMs = DEFAULT_TTL_MS, ref = null, now } = {}) {
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
      event(db, { accountId, type: 'reserved', amount: found.amount, opId, reason: `${found.kind} (retry)`, ref, createdAt: at });
      return { ok: true, opId, amount: found.amount, remaining: a.remaining, existing: false, retried: true, status: 'reserved' };
    }
    db.ledger.insertOp({ opId, accountId, kind, amount, status: 'reserved', jobId, expiresAt, createdAt: at });
    const a = allocate(db, accountId, opId, amount, now);
    if (!a.ok) { db.ledger.deleteOp(opId); return { ok: false, opId, remaining: a.remaining }; }
    event(db, { accountId, type: 'reserved', amount, opId, reason: kind, ref, createdAt: at });
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
    if (op.status === 'reserved' && op.expires_at > at) {
      db.ledger.setOpStatus(opId, 'reserved', 'committed', at);
      event(db, { accountId: op.account_id, type: 'charged', amount: op.amount, opId, reason: op.kind, createdAt: at });
      return { ok: true, charged: op.amount };
    }
    if (op.status === 'reserved') db.ledger.setOpStatus(opId, 'reserved', 'released', at);
    db.ledger.deleteAllocations(opId);
    const a = allocate(db, op.account_id, opId, op.amount, now);
    if (!a.ok) return { ok: false, reason: 'expired_unfunded', charged: 0 };
    db.ledger.setOpStatus(opId, 'released', 'committed', at);
    event(db, { accountId: op.account_id, type: 'charged', amount: op.amount, opId, reason: `${op.kind} (after its reservation expired)`, createdAt: at });
    return { ok: true, charged: op.amount, late: true };
  });
}
// The work is done and used `charge` of what was reserved (an optional part was not needed or failed): that much is
// charged, the rest goes back to the grants it came from. charge >= reserved is a plain commit; 0 is a release.
// -> { ok, charged, refunded }
function settle(db, opId, { charge, now, providerUsd, reason } = {}) {
  if (!opId) return { ok: true, charged: 0, refunded: 0 };
  const at = iso(now);
  return db.transaction(() => {
    const op = db.ledger.findOp(opId); if (!op) return { ok: false, reason: 'unknown_operation', charged: 0, refunded: 0 };
    const want = Math.max(0, Math.round(Number(charge)));
    if (!Number.isFinite(want) || want >= op.amount) { const c = commit(db, opId, { now, providerUsd }); return Object.assign({ refunded: 0 }, c); }
    if (want === 0) { const r = release(db, opId, { now, providerUsd }); return { ok: r.ok, charged: 0, refunded: op.status === 'reserved' ? op.amount : 0, status: r.status }; }
    if (op.status === 'committed') return { ok: true, charged: op.amount, refunded: 0, already: true };
    const c = commit(db, opId, { now, providerUsd }); if (!c.ok) return Object.assign({ refunded: 0 }, c);
    // give back from the grants spent last first (the longest-lived credits return to the customer)
    let back = op.amount - want;
    const allocs = db.ledger.allocationsForOp(opId).map(a => Object.assign({}, a, { order: SPEND_ORDER[(db.ledger.findGrant(a.grant_id) || {}).kind] ?? 9 })).sort((a, b) => b.order - a.order);
    for (const a of allocs) { if (!back) break; const take = Math.min(back, a.amount); db.ledger.setAllocationAmount(opId, a.grant_id, a.amount - take); back -= take; }
    db.ledger.setOpAmount(opId, want, at);
    event(db, { accountId: op.account_id, type: 'refunded', amount: op.amount - want, opId, reason: reason || 'unused part of the reservation', createdAt: at });
    return { ok: true, charged: want, refunded: op.amount - want };
  });
}
// The work failed or was abandoned: the reservation is returned. A committed charge is never undone here.
function release(db, opId, { now, providerUsd } = {}) {
  if (!opId) return { ok: true };
  const at = iso(now);
  return db.transaction(() => {
    const op = db.ledger.findOp(opId); if (!op) return { ok: false, reason: 'unknown_operation' };
    if (providerUsd > 0) db.ledger.addProviderUsd(opId, providerUsd, at);
    if (op.status === 'reserved') {
      db.ledger.setOpStatus(opId, 'reserved', 'released', at);
      event(db, { accountId: op.account_id, type: 'released', amount: op.amount, opId, reason: op.kind, createdAt: at });
    }
    return { ok: true, status: op.status === 'reserved' ? 'released' : op.status };
  });
}
// A long job keeps its reservation alive (a Creative page waiting on the owner's picture choice).
function extend(db, opId, untilIso, now) { const op = opId && db.ledger.findOp(opId); if (op && op.status === 'reserved') db.ledger.setOpExpiry(opId, untilIso, iso(now)); }
// provider expense is tracked per operation even when the customer is not charged
function addProviderUsd(db, opId, usd, now) { if (opId && usd > 0 && db.ledger.findOp(opId)) db.ledger.addProviderUsd(opId, usd, iso(now)); }
function findOperation(db, opId) { return opId ? db.ledger.findOp(opId) : null; }
function history(db, accountId, limit) { return db.creditEvents ? db.creditEvents.forAccount(accountId, limit) : []; }

module.exports = {
  DEFAULT_TTL_MS, SPEND_ORDER, utcDay, nextUtcMidnight,
  ensureGrants, grant, revokeGrant, revokeSubscriptionGrants, liveGrants, available, reserve, commit, settle, release, extend, addProviderUsd, findOperation, history,
};
