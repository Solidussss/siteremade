'use strict';
// CREDIT PACKS -- one-time Stripe purchases (never subscriptions). The browser never decides that credits were bought:
//   1 createCheckout() records a pending credit_purchases row for this account and pack (lib/pricing.js) BEFORE the
//     customer goes to Stripe; the Checkout Session carries its id (metadata.purchaseId, kind 'credit_pack')
//   2 fulfillBySession() runs only from the signature-verified Stripe event, only for a session Stripe reports PAID for
//     exactly the pack's amount and currency, and only once: the row moves pending -> fulfilled in the same transaction
//     that creates the grant 'purchase:<row id>' (a duplicated or retried webhook finds it fulfilled and does nothing)
//   3 a FULL refund revokes the pack's UNUSED credits (spent credits paid for work already done) and marks it refunded;
//     a partial refund is logged for a person to decide (no automatic change)
// A failed, expired or abandoned checkout grants nothing.
const crypto = require('crypto');
const credits = require('./credits');
const pricing = require('./pricing');

function iso(d) { return (d instanceof Date ? d : new Date(d || Date.now())).toISOString(); }
const grantIdFor = purchaseId => `purchase:${purchaseId}`;

function createCheckout(db, { accountId, packId, env, now }) {
  const pack = pricing.creditPack(packId, env); if (!pack) return { ok: false, reason: 'unknown_pack' };
  const id = 'cp_' + crypto.randomBytes(12).toString('base64url'); const at = iso(now);
  db.creditPurchases.insert({ id, accountId, packId: pack.id, credits: pack.credits, amount: pack.cents, currency: pack.currency, createdAt: at });
  return { ok: true, purchase: db.creditPurchases.findById(id), pack };
}
function attachSession(db, purchaseId, sessionId, now) { db.creditPurchases.attachSession(purchaseId, sessionId, iso(now)); }

// payment: what the signed Stripe session says -- { status, amountTotal, currency, paymentIntentId }
function fulfillBySession(db, sessionId, payment, { now } = {}) {
  const at = iso(now);
  return db.transaction(() => {
    const row = db.creditPurchases.findBySession(sessionId); if (!row) return { ok: false, reason: 'unknown_session' };
    if (row.status === 'fulfilled' || row.status === 'refunded') return { ok: true, already: true, purchaseId: row.id, credits: row.credits, accountId: row.account_id };
    if (!payment || payment.status !== 'paid') return { ok: false, reason: 'not_paid' };
    if (Number(payment.amountTotal) !== Number(row.amount) || String(payment.currency || '').toLowerCase() !== String(row.currency).toLowerCase()) return { ok: false, reason: 'amount_mismatch' };
    const grantId = grantIdFor(row.id);
    if (!db.creditPurchases.setStatus(row.id, row.status, 'fulfilled', at, { grantId, paymentIntentId: payment.paymentIntentId || null })) return { ok: true, already: true, purchaseId: row.id };
    credits.grant(db, { id: grantId, accountId: row.account_id, kind: 'purchase', amount: row.credits, source: `${row.credits} credits (${row.pack_id})`, reason: 'purchased', ref: sessionId, now });
    return { ok: true, purchaseId: row.id, credits: row.credits, accountId: row.account_id };
  });
}
function markTerminal(db, sessionId, status, { now } = {}) {
  const row = db.creditPurchases.findBySession(sessionId); if (!row || row.status !== 'pending') return { ok: false };
  return { ok: !!db.creditPurchases.setStatus(row.id, 'pending', status, iso(now)) };
}
// refund: { amountRefunded, amount } from the signed charge event
function refundByPaymentIntent(db, paymentIntentId, refund, { now } = {}) {
  const row = paymentIntentId && db.creditPurchases.findByPaymentIntent(paymentIntentId); if (!row) return { ok: false, reason: 'unknown_payment' };
  if (row.status === 'refunded') return { ok: true, already: true };
  const full = refund && Number(refund.amountRefunded) >= Number(row.amount);
  if (!full) return { ok: true, partial: true, purchaseId: row.id, note: 'partial refund: no credits changed automatically' };
  return db.transaction(() => {
    const r = credits.revokeGrant(db, row.grant_id || grantIdFor(row.id), { reason: 'credit pack refunded', ref: paymentIntentId, now });
    db.creditPurchases.setStatus(row.id, 'fulfilled', 'refunded', iso(now));
    return { ok: true, purchaseId: row.id, revoked: r.revoked };
  });
}

module.exports = { createCheckout, attachSession, fulfillBySession, markTerminal, refundByPaymentIntent, grantIdFor };
