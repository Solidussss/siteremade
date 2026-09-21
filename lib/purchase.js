// V8.5: purchase-intent binding + Stripe webhook verification/fulfillment.
//
// The core commercial invariant this file exists to enforce: a payment
// must grant ownership of the EXACT project the buyer intended to
// purchase. The server never infers the purchased project from whatever
// happens to be in localStorage/a query string when the browser returns
// from checkout -- it reconciles a Stripe event to a purchase_intents row
// that was created server-side, BEFORE redirecting to Stripe, binding
// (account, exact project, Stripe Checkout Session).
//
// No `stripe` npm package (can't be installed in this sandbox -- see
// SITE-PROJECT-V8.5.md part 1); webhook signature verification is
// hand-rolled from Node's core `crypto`, following Stripe's own documented
// scheme exactly (https://docs.stripe.com/webhooks#verify-manually):
// header `t=<unix ts>,v1=<hex hmac>[,v1=<hex hmac>...]`, signed payload is
// `${t}.${rawBody}`, expected = HMAC-SHA256(webhookSecret, signedPayload).
'use strict';
const crypto = require('crypto');
const { nowIso } = require('./db.js');

function genId(prefix) { return `${prefix}_${crypto.randomBytes(18).toString('base64url')}`; }

// ---- Webhook signature verification ---------------------------------------
// Accepts if ANY v1 signature in the header matches (Stripe sends multiple
// during secret rotation) and the timestamp is within `toleranceSeconds` of
// now (replay-window defense) -- both checks are real, not decorative.
function verifyStripeWebhookSignature(rawBody, signatureHeader, secret, { toleranceSeconds = 300, now = Date.now() } = {}) {
  if (!secret || !signatureHeader || typeof signatureHeader !== 'string') return false;
  const parts = {};
  signatureHeader.split(',').forEach(kv => {
    const idx = kv.indexOf('=');
    if (idx === -1) return;
    const key = kv.slice(0, idx).trim();
    const val = kv.slice(idx + 1).trim();
    (parts[key] = parts[key] || []).push(val);
  });
  const t = parts.t && parts.t[0];
  const v1s = parts.v1 || [];
  if (!t || !v1s.length) return false;
  const ageSeconds = Math.abs(now / 1000 - Number(t));
  if (!Number.isFinite(ageSeconds) || ageSeconds > toleranceSeconds) return false;
  const expected = crypto.createHmac('sha256', secret).update(`${t}.${rawBody}`).digest('hex');
  const expectedBuf = Buffer.from(expected, 'hex');
  return v1s.some(sig => {
    let sigBuf;
    try { sigBuf = Buffer.from(sig, 'hex'); } catch (e) { return false; }
    return sigBuf.length === expectedBuf.length && crypto.timingSafeEqual(sigBuf, expectedBuf);
  });
}

// ---- Purchase intents -------------------------------------------------------
// Created BEFORE redirecting to Stripe -- this row, not the browser's
// return URL, is the source of truth for "which exact project is being
// bought by which exact account." Refuses to create a new intent for a
// project that's already purchased; re-attempting checkout on a project
// that's merely checkout_pending (an earlier attempt was abandoned) is
// allowed and creates a fresh intent, so an abandoned checkout never
// permanently blocks a retry.
// `db` is a DatabaseAdapter (see lib/adapters/database-adapter.js) -- V8.7
// moved this file's raw SQL into lib/adapters/sqlite-database-adapter.js's
// `projects`/`purchaseIntents` namespaces, unchanged in text/semantics.
function createPurchaseIntent(db, { ownerId, projectId, amount, currency = 'cad' }) {
  const project = db.projects.findOwned(ownerId, projectId);
  if (!project) return { ok: false, reason: 'not_found' };
  if (project.status === 'purchased') return { ok: false, reason: 'already_purchased' };
  const id = genId('pi');
  const ts = nowIso();
  db.purchaseIntents.insert({ id, ownerId, projectId, amount, currency, createdAt: ts, updatedAt: ts });
  db.projects.markCheckoutPendingFromDraft(projectId, ts);
  return { ok: true, intent: { id, projectId, status: 'pending' } };
}
function attachStripeSession(db, intentId, stripeSessionId) {
  db.purchaseIntents.attachStripeSession(intentId, stripeSessionId, nowIso());
}
// Ownership-checked read, for the client polling verified status after a
// checkout redirect -- the ?purchased=1 query param is only ever a UX
// trigger to make this call, never itself treated as truth (see
// SITE-PROJECT-V8.5.md part 6).
function getOwnedPurchaseIntent(db, ownerId, intentId) {
  const row = db.purchaseIntents.findOwned(ownerId, intentId);
  if (!row) return null;
  return { id: row.id, projectId: row.project_id, status: row.status, updatedAt: row.updated_at };
}

// ---- Fulfillment (webhook-driven) ------------------------------------------
// Idempotent by construction: fulfilling an already-fulfilled intent is a
// safe no-op (duplicate webhook delivery -- Stripe's own docs say to
// expect this -- never double-applies anything). Looked up by Stripe
// session id, never by a client-supplied project id, so the webhook path
// can only ever mark exactly the project a real, signature-verified
// Stripe event says was paid for.
function fulfillBySessionId(db, stripeSessionId) {
  const intent = db.purchaseIntents.findByStripeSessionId(stripeSessionId);
  if (!intent) return { ok: false, reason: 'unknown_session' };
  if (intent.status === 'fulfilled') return { ok: true, alreadyFulfilled: true, projectId: intent.project_id };
  if (intent.status === 'cancelled' || intent.status === 'failed') return { ok: false, reason: 'intent_' + intent.status };
  const ts = nowIso();
  db.transaction(() => {
    db.purchaseIntents.markFulfilled(intent.id, ts);
    db.projects.markPurchased(intent.project_id, stripeSessionId, ts);
  });
  return { ok: true, alreadyFulfilled: false, projectId: intent.project_id };
}
// Checkout was abandoned/cancelled/failed -- release the project back to a
// normal editable draft rather than leaving it stuck at checkout_pending
// forever. Never touches an already-fulfilled intent (idempotent w.r.t. a
// late-arriving failure event after a successful payment already landed).
function markIntentTerminal(db, stripeSessionId, status) {
  const intent = db.purchaseIntents.findByStripeSessionId(stripeSessionId);
  if (!intent || intent.status !== 'pending') return { ok: false, reason: intent ? 'not_pending' : 'unknown_session' };
  const ts = nowIso();
  db.transaction(() => {
    db.purchaseIntents.markTerminal(intent.id, status, ts);
    db.projects.markDraftFromCheckoutPending(intent.project_id, ts);
  });
  return { ok: true, projectId: intent.project_id };
}

module.exports = {
  verifyStripeWebhookSignature,
  createPurchaseIntent, attachStripeSession, getOwnedPurchaseIntent,
  fulfillBySessionId, markIntentTerminal,
};
