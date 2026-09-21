// V8.5: server-authoritative direction entitlement for AUTHENTICATED
// accounts -- the durable counterpart to V8's anonymous HttpOnly-cookie +
// in-memory ledger (server.js's own `directionsLedger`, kept unchanged and
// still used for anonymous visitors). Reuses the exact reserve-before-call
// / commit-on-success / release-on-failure discipline V8.1.1's client-side
// concurrency lock established (see SITE-PROJECT-V8.1.1.md), now enforced
// durably per account_id instead of per in-memory browser session, so a
// refresh or a second device can never reset or exceed the allowance.
//
// Concurrency correctness: every exported function here runs fully
// synchronously (node:sqlite has no async I/O -- a statement either
// finishes or throws before the function returns). Node's event loop
// cannot interleave another request's JavaScript in the middle of a
// synchronous call, so two concurrent HTTP requests for the SAME account
// can never both observe "not yet reserved" and both proceed -- the
// reservation itself is the atomicity boundary, not a separate lock. The
// SQL transaction below is real defense in depth (correct even if this
// were ever split across connections/processes), not the only thing
// preventing the race.
'use strict';
const { nowIso } = require('./db.js');

// `db` is a DatabaseAdapter (see lib/adapters/database-adapter.js) -- V8.7
// moved this file's raw SQL into lib/adapters/sqlite-database-adapter.js's
// `entitlements` namespace, unchanged in text/semantics, and its
// hand-rolled BEGIN IMMEDIATE/COMMIT/ROLLBACK into the adapter's shared
// `transaction()` primitive.
function ensureRow(db, accountId) {
  const existing = db.entitlements.find(accountId);
  if (existing) return existing;
  const ts = nowIso();
  db.entitlements.insertZeroRow(accountId, ts);
  return { account_id: accountId, used: 0, reserved: 0, updated_at: ts };
}
function getEntitlement(db, accountId, maxDirections) {
  const row = ensureRow(db, accountId);
  return { used: row.used, reserved: row.reserved, remaining: Math.max(0, maxDirections - row.used - row.reserved) };
}
// Attempts to reserve one direction slot. Returns {ok:false} without
// mutating anything if the account has already used+reserved its full
// allowance -- a failed reservation attempt is a true no-op, never a
// partial charge.
function reserveDirection(db, accountId, maxDirections) {
  return db.transaction(() => {
    const row = ensureRow(db, accountId);
    if (row.used + row.reserved >= maxDirections) {
      return { ok: false, remaining: 0, used: row.used, reserved: row.reserved };
    }
    db.entitlements.incrementReserved(accountId, nowIso());
    return { ok: true, remaining: Math.max(0, maxDirections - row.used - row.reserved - 1) };
  });
}
// A successful generation: move one slot from reserved -> used.
function commitDirection(db, accountId) {
  db.transaction(() => { db.entitlements.commitReservedToUsed(accountId, nowIso()); });
}
// A failed generation: release the reservation without consuming it --
// mirrors V8's own server-ledger comment ("a failed attempt does NOT
// consume one of this visitor's Claude attempts").
function releaseDirection(db, accountId) {
  db.transaction(() => { db.entitlements.releaseReserved(accountId, nowIso()); });
}

module.exports = { getEntitlement, reserveDirection, commitDirection, releaseDirection };
