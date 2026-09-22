// Product-flow pass: a real, durable, DAILY-resetting credit allowance for
// authenticated accounts -- separate from (and additive to)
// lib/entitlement.js's own already-shipped, unrelated lifetime-3-directions
// cap. Where entitlement.js answers "has this account ever used its 3
// total website directions," this file answers "has this account used
// today's allowance of credit-consuming actions" -- a renewing daily
// throttle covering a broader set of actions (full generation, image
// generation/regeneration, AI-assisted copy rewrites), per the brief's own
// "small daily allowance... enough to try the product, not enough to abuse
// expensive generation."
//
// Reuses the EXACT reserve-before-call / commit-on-success /
// release-on-failure discipline lib/entitlement.js already established
// (see that file's own comment for why this is real, single-process-
// synchronous atomicity, not merely an app-level check). `db` is a
// DatabaseAdapter (lib/adapters/database-adapter.js); this file's own SQL
// lives in lib/adapters/sqlite-database-adapter.js's `credits` namespace,
// same convention as every other domain module in this repo.
'use strict';
const { nowIso } = require('./db.js');

// UTC, not server-local time -- deterministic regardless of the host
// timezone/deployment region, and trivially testable by passing an explicit
// `today` override (every exported function below accepts one).
function todayUtcDate(now) {
  return (now || new Date()).toISOString().slice(0, 10); // 'YYYY-MM-DD'
}

// Ensures a row exists AND reflects TODAY's allowance. A day rollover
// resets used/reserved to 0 -- the daily allowance does not accumulate
// across days, and calling this again later the SAME day is a true no-op
// (last_grant_date already matches "today"), so a page refresh can never
// re-grant credits mid-day.
function ensureRow(db, accountId, today) {
  const existing = db.credits.find(accountId);
  const ts = nowIso();
  if (!existing) {
    db.credits.insertRow(accountId, today, ts);
    return { account_id: accountId, used: 0, reserved: 0, lifetime_used: 0, last_grant_date: today, updated_at: ts };
  }
  if (existing.last_grant_date !== today) {
    db.credits.resetForNewDay(accountId, today, ts);
    return { account_id: accountId, used: 0, reserved: 0, lifetime_used: existing.lifetime_used, last_grant_date: today, updated_at: ts };
  }
  return existing;
}

// Read-only: today's used/reserved/remaining against `dailyFreeCredits`
// (the caller's configured allowance -- see server.js's
// SITEREMADE_DAILY_FREE_CREDITS -- this module has no opinion on the
// number itself, same separation lib/entitlement.js keeps from
// MAX_DIRECTIONS).
function getCredits(db, accountId, dailyFreeCredits, today) {
  today = today || todayUtcDate();
  const row = ensureRow(db, accountId, today);
  return {
    used: row.used, reserved: row.reserved,
    remaining: Math.max(0, dailyFreeCredits - row.used - row.reserved),
    dailyFreeCredits,
  };
}

// Attempts to reserve `cost` credits. A cost of 0 (a free-class action,
// see server.js's OPERATION_COST_CLASS/CREDIT_COST_BY_CLASS) is a true
// no-op that never touches the ledger at all -- not a zero-cost row
// mutation -- mirroring lib/entitlement.js's own "a failed reservation
// attempt is a true no-op" discipline for the failure case. Returns
// {ok:false} without mutating anything if the reservation would exceed
// today's allowance.
function reserveCredits(db, accountId, cost, dailyFreeCredits, today) {
  if (!(cost > 0)) return { ok: true, remaining: null, charged: 0 };
  today = today || todayUtcDate();
  return db.transaction(() => {
    const row = ensureRow(db, accountId, today);
    const remaining = dailyFreeCredits - row.used - row.reserved;
    if (cost > remaining) return { ok: false, remaining: Math.max(0, remaining) };
    db.credits.incrementReserved(accountId, cost, nowIso());
    return { ok: true, remaining: remaining - cost, charged: cost };
  });
}
// A successful operation: move `cost` credits from reserved -> used (and
// into the lifetime_used observability counter).
function commitCredits(db, accountId, cost) {
  if (!(cost > 0)) return;
  db.transaction(() => { db.credits.commitReservedToUsed(accountId, cost, nowIso()); });
}
// A failed operation (provider error, validation failure before the
// provider was ever called, etc.): release the reservation without
// consuming it -- a failed attempt never permanently charges a credit.
function releaseCredits(db, accountId, cost) {
  if (!(cost > 0)) return;
  db.transaction(() => { db.credits.releaseReserved(accountId, cost, nowIso()); });
}

module.exports = { todayUtcDate, getCredits, reserveCredits, commitCredits, releaseCredits };
