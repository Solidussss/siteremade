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

function ensureRow(db, accountId) {
  const existing = db.prepare('SELECT * FROM direction_entitlements WHERE account_id = ?').get(accountId);
  if (existing) return existing;
  const ts = nowIso();
  db.prepare('INSERT INTO direction_entitlements (account_id, used, reserved, updated_at) VALUES (?, 0, 0, ?)').run(accountId, ts);
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
  db.exec('BEGIN IMMEDIATE');
  try {
    const row = ensureRow(db, accountId);
    if (row.used + row.reserved >= maxDirections) {
      db.exec('COMMIT'); // nothing mutated; commit is just to close the transaction cleanly
      return { ok: false, remaining: 0, used: row.used, reserved: row.reserved };
    }
    db.prepare('UPDATE direction_entitlements SET reserved = reserved + 1, updated_at = ? WHERE account_id = ?').run(nowIso(), accountId);
    db.exec('COMMIT');
    return { ok: true, remaining: Math.max(0, maxDirections - row.used - row.reserved - 1) };
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}
// A successful generation: move one slot from reserved -> used.
function commitDirection(db, accountId) {
  db.exec('BEGIN IMMEDIATE');
  try {
    db.prepare('UPDATE direction_entitlements SET reserved = MAX(0, reserved - 1), used = used + 1, updated_at = ? WHERE account_id = ?').run(nowIso(), accountId);
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); throw e; }
}
// A failed generation: release the reservation without consuming it --
// mirrors V8's own server-ledger comment ("a failed attempt does NOT
// consume one of this visitor's Claude attempts").
function releaseDirection(db, accountId) {
  db.exec('BEGIN IMMEDIATE');
  try {
    db.prepare('UPDATE direction_entitlements SET reserved = MAX(0, reserved - 1), updated_at = ? WHERE account_id = ?').run(nowIso(), accountId);
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); throw e; }
}

module.exports = { getEntitlement, reserveDirection, commitDirection, releaseDirection };
