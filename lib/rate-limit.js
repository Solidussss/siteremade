// FINAL GENERATOR HARDENING pass: a real, in-memory, bounded rate limiter.
// Same honesty posture as server.js's own directionsLedger/operationLedger
// (see their own comments): not durable across a restart, not shared
// across horizontally-scaled instances, but genuine, immediately-enforced
// sliding-ish-window accounting -- never a decorative stub. The durable/
// shared upgrade path (a small table, or a shared store like Redis) is the
// same kind of deliberately-deferred upgrade those ledgers already
// document, and is not built here -- the brief is explicit: "do not build
// a huge anti-fraud platform." This is the smallest real thing that
// actually slows a single-process abuse burst, no new dependency, no
// external service.
//
// Two independent primitives on the same underlying bucket store:
//   - checkAndRecord: "does this request count against the limit, and is
//     it still allowed?" -- increments on every call. Used for plain
//     request-rate limiting (signup, generic per-route throttling).
//   - peek + recordFailure: "how many recent FAILURES does this key have,
//     without this check itself counting as one?" -- used for login
//     brute-force protection, where a successful attempt must never nudge
//     the counter (a legitimate user retrying after a typo, then
//     succeeding, should never edge closer to a lockout on their own
//     success) and a check has to happen BEFORE the real auth attempt
//     without itself being indistinguishable from a failure.
'use strict';

// A hard ceiling on distinct tracked keys, so a flood of spoofed/rotating
// IPs can never grow this map without bound. Map iteration order is
// insertion order, so eviction below removes the oldest-inserted entries
// first -- a defensive ceiling, not a precise LRU, but sufficient for its
// actual job (bounding memory), not a claim of exactness.
const MAX_TRACKED_KEYS = 20000;
const buckets = new Map(); // key -> { count, windowStart }

function prune() {
  if (buckets.size <= MAX_TRACKED_KEYS) return;
  const overflow = buckets.size - MAX_TRACKED_KEYS;
  let i = 0;
  for (const k of buckets.keys()) {
    if (i++ >= overflow) break;
    buckets.delete(k);
  }
}

function getOrResetBucket(key, windowMs, now) {
  let bucket = buckets.get(key);
  if (!bucket || now - bucket.windowStart >= windowMs) {
    bucket = { count: 0, windowStart: now };
    buckets.set(key, bucket);
  }
  return bucket;
}
function retryAfterSecondsFor(bucket, windowMs, now) {
  return Math.max(1, Math.ceil((bucket.windowStart + windowMs - now) / 1000));
}

// Increments and checks in one step. Returns {allowed, remaining,
// retryAfterSeconds}. retryAfterSeconds is always the real time left in
// the CURRENT window, so a 429 response can give a caller an honest
// number, never a guess.
function checkAndRecord(key, max, windowMs, now = Date.now()) {
  const bucket = getOrResetBucket(key, windowMs, now);
  const retryAfterSeconds = retryAfterSecondsFor(bucket, windowMs, now);
  if (bucket.count >= max) return { allowed: false, remaining: 0, retryAfterSeconds };
  bucket.count++;
  prune();
  return { allowed: true, remaining: Math.max(0, max - bucket.count), retryAfterSeconds };
}

// Read-only: the current failure count for `key` within its live window,
// without mutating anything. {count, retryAfterSeconds} -- retryAfterSeconds
// is 0 when the window is empty/expired (nothing to wait out).
function peek(key, windowMs, now = Date.now()) {
  const bucket = buckets.get(key);
  if (!bucket || now - bucket.windowStart >= windowMs) return { count: 0, retryAfterSeconds: 0 };
  return { count: bucket.count, retryAfterSeconds: retryAfterSecondsFor(bucket, windowMs, now) };
}
// Records ONE failure against `key`. Never called for a successful
// attempt -- see this file's own header comment for why that matters.
function recordFailure(key, windowMs, now = Date.now()) {
  const bucket = getOrResetBucket(key, windowMs, now);
  bucket.count++;
  prune();
}

// Test-only introspection/reset -- direct `require()` only, no HTTP
// surface here (same convention as server.js's own /__test/* routes,
// which call INTO this module rather than this module exposing routes
// itself).
function _resetAll() { buckets.clear(); }
function _bucketCount() { return buckets.size; }

module.exports = { checkAndRecord, peek, recordFailure, _resetAll, _bucketCount };
