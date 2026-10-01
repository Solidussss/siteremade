'use strict';
// PROVIDER SPEND PROTECTION -- centralised. Credits exist partly to protect SiteRemade from runaway provider cost: every
// planned operation carries a provider-spend ceiling (credits x pricing.USD_PER_CREDIT_CEILING, internal only), and no
// provider call may take the operation past it. Before a call, its ESTIMATED cost is checked against what is left; if it
// does not fit, the caller must reduce optional work, use a cheaper valid option, drop the premium enhancement, or ask
// for more credits -- never silently exceed the budget. After a call, its actual usage is recorded in the usage ledger
// (usage_ledger) and on the credit operation (provider_usd), without secrets.
//
// Cost tables are ESTIMATES used for budgeting (Anthropic list prices; SerpApi's plan cost per search; Higgsfield, whose
// public API documents no per-request price, by configured preset estimates) -- verify them against each provider's
// console and adjust here (or with the environment overrides below), in one place.
const P = require('./pricing');

const COSTS = {
  // USD per million tokens
  anthropic: { strong: { input: 3, output: 15 }, cheap: { input: 1, output: 5 } },
  // what one search costs SiteRemade on its SerpApi plan (plan price / included searches) -- an allocation, not a bill
  serpapiPerSearch: 0.015,
  // Higgsfield, per preset (lib/media/premium-media.js PRESETS), USD per generated asset.
  //   video_4k: CONFIRMED from production usage -- one 5-second 4K cinematic hero (kling-video/v3.0/4k/image-to-video)
  //             took 2.10 USD from the Higgsfield balance. (The earlier 0.90 guess under-quoted it more than twice over.)
  //   the others: estimates until confirmed the same way
  higgsfield: { image_standard: 0.06, video_5s_720p: 0.35, video_5s_1080p: 0.7, video_4k: 2.1 },
  // budgeting uses the cost with a small safety margin on top (2.10 -> 2.25): quotes and spend checks never assume the
  // provider is cheaper than it was
  higgsfieldSafetyBuffer: 1.07,
};
function num(v, d) { const n = Number(v); return v !== undefined && v !== null && String(v).trim() !== '' && Number.isFinite(n) && n >= 0 ? n : d; }
const upToCent = usd => Math.ceil(+(usd * 100).toFixed(6)) / 100;
// higgsfield: what each asset costs (what the usage ledger records); higgsfieldBudget: that cost with the safety buffer
// (what quotes are priced from and what every submit is checked against). Overrides: SITEREMADE_HIGGSFIELD_USD_<PRESET>
// (e.g. SITEREMADE_HIGGSFIELD_USD_VIDEO_4K) and SITEREMADE_HIGGSFIELD_SAFETY_BUFFER (never below 1).
function costs(env = process.env) {
  const higgsfield = Object.fromEntries(Object.entries(COSTS.higgsfield).map(([k, v]) => [k, num(env[`SITEREMADE_HIGGSFIELD_USD_${k.toUpperCase()}`], v)]));
  const buffer = Math.max(1, num(env.SITEREMADE_HIGGSFIELD_SAFETY_BUFFER, COSTS.higgsfieldSafetyBuffer));
  return {
    anthropic: COSTS.anthropic,
    serpapiPerSearch: num(env.SITEREMADE_SERPAPI_USD_PER_SEARCH, COSTS.serpapiPerSearch),
    higgsfield, higgsfieldSafetyBuffer: buffer,
    higgsfieldBudget: Object.fromEntries(Object.entries(higgsfield).map(([k, v]) => [k, upToCent(v * buffer)])),
  };
}
function anthropicUsd(model, usage, env) {
  const c = costs(env).anthropic[/haiku/i.test(String(model || '')) ? 'cheap' : 'strong']; const u = usage || {};
  return +((((u.input_tokens || u.inputTokens || 0) + (u.cache_creation_input_tokens || 0)) * c.input + (u.output_tokens || u.outputTokens || 0) * c.output) / 1e6).toFixed(5);
}

class BudgetExceededError extends Error {
  constructor(what, estimateUsd, remainingUsd) { super(`${what} would exceed this operation's provider budget`); this.code = 'BUDGET_EXCEEDED'; this.estimateUsd = estimateUsd; this.remainingUsd = remainingUsd; }
}

// budget for one operation. ceilingUsd: from the quote (credits x the per-credit ceiling). db/opId: where actual usage
// is recorded (optional for a pure check).
function createBudget({ db, opId, ceilingUsd, credits, now } = {}) {
  const ceiling = Number.isFinite(Number(ceilingUsd)) ? Number(ceilingUsd) : P.providerCeilingUsd(credits || 0);
  let spent = 0; let committed = 0; // committed: estimates of calls in flight
  const at = () => new Date(now || Date.now()).toISOString();
  const api = {
    ceilingUsd: ceiling,
    spentUsd: () => +spent.toFixed(5),
    remainingUsd: () => +Math.max(0, ceiling - spent - committed).toFixed(5),
    fits: estimateUsd => spent + committed + Math.max(0, Number(estimateUsd) || 0) <= ceiling + 1e-9,
    // reserve room for a call before making it; throws if it does not fit. Returns a release function (for a call that
    // never happened) -- record() settles it.
    check(what, estimateUsd) {
      const e = Math.max(0, Number(estimateUsd) || 0);
      if (!api.fits(e)) throw new BudgetExceededError(what, e, api.remainingUsd());
      committed += e; let open = true;
      return { release: () => { if (open) { committed -= e; open = false; } }, settle: actual => { if (open) { committed -= e; open = false; } spent += Math.max(0, Number(actual) || 0); } };
    },
    // record what a provider call actually used (provider: anthropic | serpapi | higgsfield | openai)
    record(provider, x) {
      const r = x || {}; const usd = Math.max(0, Number(r.usd) || 0);
      if (!r.settled) spent += usd;
      if (db && opId && db.usage) {
        const f = {};
        if (provider === 'anthropic') Object.assign(f, { anthropic_usd: usd, anthropic_input_tokens: r.inputTokens || 0, anthropic_output_tokens: r.outputTokens || 0 });
        if (provider === 'serpapi') Object.assign(f, { serpapi_searches: r.searches || 0, serpapi_usd: usd });
        if (provider === 'higgsfield') Object.assign(f, { higgsfield_jobs: r.jobs || 0, higgsfield_usd: usd });
        if (provider === 'openai') Object.assign(f, { openai_usd: usd });
        db.usage.add(opId, f, at());
      }
      if (db && opId && usd > 0 && db.ledger && db.ledger.findOp(opId)) db.ledger.addProviderUsd(opId, usd, at());
      return api.spentUsd();
    },
  };
  return api;
}

module.exports = { COSTS, costs, anthropicUsd, createBudget, BudgetExceededError };
