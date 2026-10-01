// LEGACY WORKSPACE SUBSCRIPTIONS (retired). SiteRemade no longer sells a subscription: a website is bought once and
// owned permanently, and credits (packs, the first-website bonus, the trial) pay for AI and media work. No new Workspace
// subscription can be started. This module remains ONLY so that a customer Stripe is still billing for an existing
// Workspace subscription keeps receiving the monthly credits they paid for, until that subscription is cancelled
// (by them in the billing portal, or by SiteRemade at Stripe). Nothing here gates ownership, export, editing or the app.
//
// (original design, still accurate for the legacy path:)
//
// Who owns the allowance: the builder account that is linked (lib/identity-links.js, one-to-one) to the app user who
// OWNS a workspace with a paid Workspace subscription. One subscription = one allowance per billing month, whatever
// workspace is selected in the app and however many times the owner links, logs in or switches: the monthly grant's
// id is 'sub:<subscription>:<period start>' (lib/credits.js), so it can exist only once.
//
// Where the truth comes from: never the browser, account metadata, an email or a checkout redirect. The builder asks
// the app, server to server, with a request signed by a secret only the two servers hold (SITEREMADE_BILLING_SECRET);
// the app answers from its own workspace records AND the subscription's live state at Stripe (see the app's
// lib/billing-entitlement.js). Because the answer is the subscription's CURRENT state, duplicate or out-of-order Stripe
// events cannot restore a stale entitlement. The answer is cached for a few minutes; if the app cannot be reached, the
// last verified answer is used for at most a day, then the account falls back to its free credits (fail closed).
//
// Access policy:
//   active / trialing                 100 credits for the current billing month (no rollover)
//   active, cancel at period end      the month continues to its end; nothing after
//   past_due (payment failed)         no NEW month is granted; a month already granted keeps its end date; paying the
//                                     invoice (status active again) grants the month -- once
//   canceled / unpaid / expired       the current month's unused plan credits end now; the free trial remainder,
//                                     every project and every purchased website stay
'use strict';
const crypto = require('crypto');
const credits = require('./credits.js');

const PAID = new Set(['active', 'trialing']);
const ENDED = new Set(['canceled', 'unpaid', 'incomplete_expired']);

function signBody(secret, timestamp, body) { return crypto.createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex'); }

// a configured whole number (0 allowed), else the default
function num(v, d) { const n = Number(v); return v !== undefined && v !== null && String(v).trim() !== '' && Number.isFinite(n) && n >= 0 ? Math.floor(n) : d; }

function createBilling({ db, env = process.env, fetchImpl = globalThis.fetch, isTester = () => false }) {
  const cfg = {
    appUrl: String(env.SITEREMADE_APP_URL || 'https://app.siteremade.com').replace(/\/$/, ''),
    secret: String(env.SITEREMADE_BILLING_SECRET || ''),
    trialCredits: num(env.SITEREMADE_TRIAL_CREDITS, 6),
    planMonthlyCredits: num(env.SITEREMADE_PLAN_MONTHLY_CREDITS, 100),
    testerDailyCredits: num(env.SITEREMADE_TESTER_DAILY_CREDITS, 500),
    cacheMs: num(env.SITEREMADE_BILLING_CACHE_MS, 5 * 60 * 1000),
    staleMs: 24 * 60 * 60 * 1000,
  };
  const inflight = new Map(); // accountId -> promise (one lookup at a time per account)

  async function askApp(supabaseUserId) {
    if (!cfg.secret) return { ok: false, reason: 'not_configured' };
    const body = JSON.stringify({ supabaseUserId });
    const ts = String(Math.floor(Date.now() / 1000));
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 8000);
    try {
      const r = await fetchImpl(`${cfg.appUrl}/api/internal/billing/entitlement`, {
        method: 'POST', body, signal: controller.signal, redirect: 'error',
        headers: { 'content-type': 'application/json', 'x-siteremade-timestamp': ts, 'x-siteremade-signature': signBody(cfg.secret, ts, body) },
      });
      const data = await r.json().catch(() => null);
      if (!r.ok || !data || data.ok !== true) return { ok: false, reason: `app_${r.status}` };
      return { ok: true, entitlement: data.entitlement || null };
    } catch (e) { return { ok: false, reason: 'unreachable' }; } finally { clearTimeout(timer); }
  }

  function clean(e) {
    if (!e || typeof e !== 'object') return null;
    const d = v => { const t = Date.parse(v); return Number.isFinite(t) ? new Date(t).toISOString() : null; };
    const status = String(e.status || '').toLowerCase().slice(0, 30);
    if (!status || !/^[a-z_]+$/.test(status)) return null;
    return { status, subscriptionId: String(e.subscriptionId || '').slice(0, 120) || null, workspaceId: String(e.workspaceId || '').slice(0, 80) || null, periodStart: d(e.periodStart), periodEnd: d(e.periodEnd), cancelAtPeriodEnd: !!e.cancelAtPeriodEnd };
  }

  // The verified state for an account, refreshed from the app when the cache is old (or `force`).
  async function refresh(accountId, { force = false, now } = {}) {
    if (!accountId) return null;
    const link = db.identityLinks.findActiveByAccount(accountId);
    const cached = db.ledger.findEntitlement(accountId);
    const at = Date.now();
    if (!link) { if (cached && cached.status !== 'none') db.ledger.upsertEntitlement({ accountId, status: 'none', checkedAt: new Date(at).toISOString() }); applyGrants(accountId, null, now); return null; }
    const fresh = cached && cached.supabase_user_id === link.supabase_user_id && at - Date.parse(cached.checked_at) < cfg.cacheMs;
    if (fresh && !force) { applyGrants(accountId, cached, now); return cached; }
    if (!inflight.has(accountId)) inflight.set(accountId, askApp(link.supabase_user_id).finally(() => inflight.delete(accountId)));
    const answer = await inflight.get(accountId);
    if (!answer.ok) {
      const usable = cached && cached.supabase_user_id === link.supabase_user_id && at - Date.parse(cached.checked_at) < cfg.staleMs ? cached : null;
      applyGrants(accountId, usable, now); return usable;
    }
    const e = clean(answer.entitlement) || { status: 'none' };
    db.ledger.upsertEntitlement({ accountId, supabaseUserId: link.supabase_user_id, workspaceId: e.workspaceId, subscriptionId: e.subscriptionId, status: e.status, periodStart: e.periodStart, periodEnd: e.periodEnd, cancelAtPeriodEnd: e.cancelAtPeriodEnd, checkedAt: new Date(at).toISOString() });
    const row = db.ledger.findEntitlement(accountId);
    applyGrants(accountId, row, now);
    return row;
  }

  function isPaidPeriod(ent, now) {
    const at = new Date(now || Date.now()).toISOString();
    return !!(ent && PAID.has(ent.status) && ent.subscription_id && ent.period_start && ent.period_end && ent.period_start <= at && ent.period_end > at);
  }
  function applyGrants(accountId, ent, now) {
    credits.ensureGrants(db, accountId, {
      trialCredits: cfg.trialCredits,
      testerDailyCredits: isTester(accountId) ? cfg.testerDailyCredits : 0,
      subscription: isPaidPeriod(ent, now) ? { id: ent.subscription_id, periodStart: ent.period_start, periodEnd: ent.period_end, credits: cfg.planMonthlyCredits } : null,
    }, now);
    if (ent && ENDED.has(ent.status) && ent.subscription_id) credits.revokeSubscriptionGrants(db, accountId, ent.subscription_id, now);
  }

  // What the customer sees, identically in the builder and the app (the app reads it through the bridge).
  function summary(accountId, costs, now) {
    const ent = db.ledger.findEntitlement(accountId);
    const { total, grants } = credits.available(db, accountId, now);
    const by = kind => grants.filter(g => g.kind === kind);
    const sub = by('subscription')[0] || null; const tester = by('tester')[0] || null; const trial = by('trial')[0] || null;
    const subscribed = isPaidPeriod(ent, now);
    const sum = kind => by(kind).reduce((n, g) => n + g.remaining, 0);
    // no plans any more: an account has credits (a tester also has the daily tester allowance)
    const plan = isTester(accountId) ? 'tester' : 'credits';
    return {
      plan, planLabel: plan === 'tester' ? 'Tester allowance' : 'Credits',
      remaining: total,
      purchased: sum('purchase'), bonus: sum('bonus'), adjustments: sum('admin'),
      trial: { credits: cfg.trialCredits, remaining: trial ? trial.remaining : 0, oneTime: true },
      // LEGACY: an existing Workspace subscription that is still billing (no new ones are sold)
      subscription: ent && ent.subscription_id ? { legacy: true, active: subscribed,
        status: ent.status, credits: cfg.planMonthlyCredits, remaining: sub ? sub.remaining : 0,
        renewsAt: subscribed && !ent.cancel_at_period_end ? ent.period_end : null, endsAt: ent.cancel_at_period_end ? ent.period_end : null,
        periodEnd: ent.period_end, paymentProblem: ent.status === 'past_due',
      } : null,
      tester: tester ? { credits: tester.amount, remaining: tester.remaining, resetsAt: tester.expiresAt } : null,
      costs,
      billingLinked: !!(ent && ent.supabase_user_id), billingVerified: !!cfg.secret,
    };
  }

  return { cfg, refresh, applyGrants, summary, isPaidPeriod, signBody };
}

module.exports = { createBilling, signBody, PAID, ENDED };
