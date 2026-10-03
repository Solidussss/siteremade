'use strict';
const credits = require('./credits.js');

// SiteRemade has no Workspace membership/subscription. This module keeps the
// existing billing API shape used by server.js, but only manages one-time
// credits, tester allowance and the one-time trial/bonus grants.
function num(v, d) {
  const n = Number(v);
  return v !== undefined && v !== null && String(v).trim() !== '' && Number.isFinite(n) && n >= 0 ? Math.floor(n) : d;
}

function createBilling({ db, env = process.env, isTester = () => false }) {
  const cfg = {
    trialCredits: num(env.SITEREMADE_TRIAL_CREDITS, 6),
    testerDailyCredits: num(env.SITEREMADE_TESTER_DAILY_CREDITS, 500),
  };

  function applyGrants(accountId, _unused = null, now) {
    credits.ensureGrants(db, accountId, {
      trialCredits: cfg.trialCredits,
      testerDailyCredits: isTester(accountId) ? cfg.testerDailyCredits : 0,
      subscription: null,
    }, now);
    // Retired memberships must not keep adding spendable monthly allowance.
    // Revoke any still-live historical subscription grant the next time the
    // account is touched.
    credits.revokeSubscriptionGrants(db, accountId, null, now);
  }

  async function refresh(accountId, { now } = {}) {
    if (!accountId) return null;
    applyGrants(accountId, null, now);
    return null;
  }

  function summary(accountId, costs, now) {
    const { total, grants } = credits.available(db, accountId, now);
    const by = kind => grants.filter(g => g.kind === kind);
    const tester = by('tester')[0] || null;
    const trial = by('trial')[0] || null;
    const sum = kind => by(kind).reduce((n, g) => n + g.remaining, 0);
    const plan = isTester(accountId) ? 'tester' : 'credits';
    return {
      plan,
      planLabel: plan === 'tester' ? 'Tester allowance' : 'Credits',
      remaining: total,
      purchased: sum('purchase'),
      bonus: sum('bonus'),
      adjustments: sum('admin'),
      trial: { credits: cfg.trialCredits, remaining: trial ? trial.remaining : 0, oneTime: true },
      tester: tester ? { credits: tester.amount, remaining: tester.remaining, resetsAt: tester.expiresAt } : null,
      costs,
    };
  }

  return { cfg, refresh, applyGrants, summary };
}

module.exports = { createBilling };
