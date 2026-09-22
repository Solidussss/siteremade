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
  let snapshotCreated = false;
  let projectRow = null;
  db.transaction(() => {
    db.purchaseIntents.markFulfilled(intent.id, ts);
    db.projects.markPurchased(intent.project_id, stripeSessionId, ts);
    // Product-flow pass: freeze the EXACT state_json/revision as it stands
    // at THIS moment, in the SAME transaction as markPurchased -- "the
    // project is purchased" and "the immutable handoff snapshot exists"
    // become true atomically, never one without the other. Never
    // overwrites an existing snapshot (the unique index on project_id
    // would refuse it anyway) -- fulfillment is only ever expected to run
    // this path once per project, per createPurchaseIntent's own
    // already-purchased refusal.
    projectRow = db.projects.findById(intent.project_id);
    const existingSnapshot = db.purchaseSnapshots.findByProject(intent.project_id);
    if (projectRow && !existingSnapshot) {
      createSnapshotFromRow(db, projectRow, intent.id);
      snapshotCreated = true;
    }
  });
  // ownerId/projectName/ownerEmail are returned so the caller (server.js's
  // Stripe webhook handler) can send a real post-purchase confirmation
  // email without reaching into `db` directly itself -- keeps the "HTTP
  // layer never touches db.* directly, only domain modules do" convention
  // this whole codebase already follows everywhere else.
  const ownerAccount = projectRow ? db.accounts.findById(projectRow.owner_id) : null;
  return {
    ok: true, alreadyFulfilled: false, projectId: intent.project_id, snapshotCreated,
    ownerId: intent.owner_id, projectName: projectRow ? projectRow.name : null,
    ownerEmail: ownerAccount ? ownerAccount.email : null,
  };
}

// ---- Purchase snapshots (product-flow pass) --------------------------------
// See migrations/0003_credits_and_snapshots.sql's own comment for the full
// invariant. `state_json`/`direction_index`/`project_revision` are written
// exactly ONCE, here, at creation -- nothing in this file (or anywhere else
// in the codebase) ever rewrites them afterward. Only `hosting_choice_json`
// is ever updated post-creation (setSnapshotHostingChoice below), and that
// update never touches the frozen content columns.
function createSnapshotFromRow(db, projectRow, purchaseIntentId) {
  const ts = nowIso();
  const directionsState = JSON.parse(projectRow.state_json);
  const id = genId('snap');
  db.purchaseSnapshots.insert({
    id, projectId: projectRow.id, ownerId: projectRow.owner_id, purchaseIntentId: purchaseIntentId || null,
    directionIndex: Number.isInteger(directionsState.activeDirectionIndex) ? directionsState.activeDirectionIndex : 0,
    stateJson: projectRow.state_json, projectRevision: projectRow.revision,
    hostingChoiceJson: null, createdAt: ts,
  });
  return db.purchaseSnapshots.findByProject(projectRow.id);
}
// Best-effort backfill: creates a snapshot for a project that is genuinely
// 'purchased' but (for any reason -- most plausibly, data that predates
// this feature) has no snapshot row yet. A true no-op if one already
// exists (never overwrites). Refuses for anything not actually purchased
// -- a snapshot is never taken from a draft/checkout_pending project's
// current, still-mutable state.
function ensureSnapshotForOwnedProject(db, ownerId, projectId) {
  const existing = db.purchaseSnapshots.findByProject(projectId);
  if (existing) return { ok: true, snapshot: existing, created: false };
  const row = db.projects.findOwned(ownerId, projectId);
  if (!row) return { ok: false, reason: 'not_found' };
  if (row.status !== 'purchased') return { ok: false, reason: 'not_purchased' };
  const snapshot = createSnapshotFromRow(db, row, null);
  return { ok: true, snapshot, created: true };
}
// Owner-scoped, metadata-only read (no directionsState -- see the Raw
// variant below for the export compiler's own needs).
function getOwnedPurchaseSnapshot(db, ownerId, projectId) {
  const row = db.purchaseSnapshots.findOwnedByProject(ownerId, projectId);
  if (!row) return null;
  return {
    id: row.id, projectId: row.project_id, directionIndex: row.direction_index,
    projectRevision: row.project_revision, createdAt: row.created_at,
    hostingChoice: row.hosting_choice_json ? JSON.parse(row.hosting_choice_json) : null,
  };
}
// Full shape, including the frozen directionsState -- used only by the
// export route (server.js), which must compile from exactly this, never
// from the live project's current state_json (spec: "download ZIP
// generated FROM THE PURCHASED SNAPSHOT, not whatever's currently open").
function getOwnedPurchaseSnapshotRaw(db, ownerId, projectId) {
  const row = db.purchaseSnapshots.findOwnedByProject(ownerId, projectId);
  if (!row) return null;
  return {
    id: row.id, projectId: row.project_id, ownerId: row.owner_id, directionIndex: row.direction_index,
    projectRevision: row.project_revision, directionsState: JSON.parse(row.state_json),
    hostingChoice: row.hosting_choice_json ? JSON.parse(row.hosting_choice_json) : null, createdAt: row.created_at,
  };
}
// The post-purchase hosting upsell's own write path -- chosen sometime
// AFTER payment completes, so it can never be known at snapshot-creation
// time. `hostingChoice` is `{provider, skipped}`; server.js validates
// `provider` against lib/hosting.js's real provider keys (plus the literal
// 'self' for self-hosting) before this is ever called -- this function
// itself does no validation of its own, matching every other function in
// this file's "the HTTP layer validates, the store layer persists" split.
function setSnapshotHostingChoice(db, ownerId, projectId, hostingChoice) {
  const row = db.purchaseSnapshots.findOwnedByProject(ownerId, projectId);
  if (!row) return { ok: false, reason: 'not_found' };
  const stored = { ...hostingChoice, chosenAt: nowIso() };
  db.purchaseSnapshots.setHostingChoice(projectId, JSON.stringify(stored));
  return { ok: true, hostingChoice: stored };
}
// My Websites (server.js) -- every purchase snapshot this account owns, in
// the same metadata-only shape getOwnedPurchaseSnapshot returns.
function listOwnedPurchaseSnapshots(db, ownerId) {
  return db.purchaseSnapshots.listOwned(ownerId).map(row => ({
    id: row.id, projectId: row.project_id, directionIndex: row.direction_index,
    projectRevision: row.project_revision, createdAt: row.created_at,
    hostingChoice: row.hosting_choice_json ? JSON.parse(row.hosting_choice_json) : null,
  }));
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
  ensureSnapshotForOwnedProject, getOwnedPurchaseSnapshot, getOwnedPurchaseSnapshotRaw,
  setSnapshotHostingChoice, listOwnedPurchaseSnapshots,
};
