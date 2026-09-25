'use strict';
// PREMIUM_GENERATION_V1 configuration: the ONE place budgets, prices, model
// tiers and the feature flag are defined. Every number is env-overridable
// and is a planning input, not a billing guarantee (same honesty rule the
// existing image cost table in server.js documents).
//
// Shared core: this file (like every module in lib/premium/) is plain
// CommonJS with no I/O, bundled for the browser by scripts/build-premium-
// core.js and `require`d directly by server.js and by the Workplace app-
// bridge edit path, so the landing generator and the app updater run the
// SAME budget/route/repair logic.

const num = (v, d) => { const n = Number(v); return Number.isFinite(n) && n >= 0 && v !== '' && v != null ? n : d; };
const truthy = v => ['1', 'true', 'on', 'yes'].includes(String(v || '').toLowerCase());

// Text pricing, USD per 1M tokens. ESTIMATES: set PREMIUM_PRICE_* from your
// real invoice. `cacheRead` is the discounted cached-prefix read rate.
const DEFAULT_TEXT_PRICES = {
  strong: { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 },
  cheap: { input: 1, output: 5, cacheRead: 0.1, cacheWrite: 1.25 },
};

function loadConfig(env) {
  env = env || (typeof process !== 'undefined' && process.env) || {};
  const heroMax = num(env.PREMIUM_HERO_IMAGE_MAX_USD, 0.75);
  return {
    enabled: truthy(env.PREMIUM_GENERATION_V1),
    // V2 composition (page-level visual planning). Sub-flag: only meaningful when PREMIUM_GENERATION_V1 is on. Default OFF.
    compositionV2: truthy(env.PREMIUM_GENERATION_V1) && truthy(env.PREMIUM_COMPOSITION_V2),
    // V3: business grounding + one whole-site semantic critique + one small targeted repair. Sub-flag, default OFF, requires V1.
    groundingV3: truthy(env.PREMIUM_GENERATION_V1) && truthy(env.PREMIUM_GROUNDING_V3),
    budgets: {
      TARGET_FIRST_DRAFT_USD: num(env.TARGET_FIRST_DRAFT_USD, 1.5),
      TARGET_PUBLISHABLE_SITE_USD: num(env.TARGET_PUBLISHABLE_SITE_USD, 3.0),
      SOFT_SITE_BUDGET_USD: num(env.SOFT_SITE_BUDGET_USD, 4.0),
      HARD_SITE_BUDGET_USD: num(env.HARD_SITE_BUDGET_USD, 5.0),
      // Kept free for the one automatic repair round so first-draft image
      // spending can never starve it.
      REPAIR_RESERVE_USD: num(env.PREMIUM_REPAIR_RESERVE_USD, 0.75),
      // Semantic review (V3) has its own small budget inside the site budget: judgment is where the extra spend goes.
      SEMANTIC_REVIEW_TARGET_USD: num(env.SEMANTIC_REVIEW_TARGET_USD, 0.10),
      SEMANTIC_REPAIR_TARGET_USD: num(env.SEMANTIC_REPAIR_TARGET_USD, 0.10),
      SEMANTIC_REVIEW_HARD_CEILING_USD: num(env.SEMANTIC_REVIEW_HARD_CEILING_USD, 0.30),
    },
    // Per-slot image spend ceilings by budget tier (USD, estimated).
    imageTierCaps: {
      hero: heroMax,
      primary: num(env.PREMIUM_PRIMARY_IMAGE_MAX_USD, 0.3),
      decorative: num(env.PREMIUM_DECORATIVE_IMAGE_MAX_USD, 0.04),
    },
    retry: { maxImageRetries: num(env.PREMIUM_IMAGE_MAX_AUTO_RETRIES, 1), maxRepairRounds: num(env.PREMIUM_MAX_REPAIR_ROUNDS, 1) },
    models: {
      strong: env.PREMIUM_MODEL_STRONG || env.ANTHROPIC_MODEL || 'claude-sonnet-5',
      cheap: env.PREMIUM_MODEL_CHEAP || 'claude-haiku-4-5-20251001',
      imageSupport: env.SITEREMADE_IMAGE_MODEL_SUPPORT || 'gpt-image-1-mini',
      imagePremium: env.SITEREMADE_IMAGE_MODEL_PREMIUM || 'gpt-image-1',
    },
    textPrices: {
      strong: {
        input: num(env.PREMIUM_PRICE_STRONG_INPUT, DEFAULT_TEXT_PRICES.strong.input), output: num(env.PREMIUM_PRICE_STRONG_OUTPUT, DEFAULT_TEXT_PRICES.strong.output),
        cacheRead: num(env.PREMIUM_PRICE_STRONG_CACHE_READ, DEFAULT_TEXT_PRICES.strong.cacheRead), cacheWrite: num(env.PREMIUM_PRICE_STRONG_CACHE_WRITE, DEFAULT_TEXT_PRICES.strong.cacheWrite),
      },
      cheap: {
        input: num(env.PREMIUM_PRICE_CHEAP_INPUT, DEFAULT_TEXT_PRICES.cheap.input), output: num(env.PREMIUM_PRICE_CHEAP_OUTPUT, DEFAULT_TEXT_PRICES.cheap.output),
        cacheRead: num(env.PREMIUM_PRICE_CHEAP_CACHE_READ, DEFAULT_TEXT_PRICES.cheap.cacheRead), cacheWrite: num(env.PREMIUM_PRICE_CHEAP_CACHE_WRITE, DEFAULT_TEXT_PRICES.cheap.cacheWrite),
      },
    },
    // Same env names/defaults as server.js's existing IMAGE_MODEL_COST_ESTIMATE_USD
    // so there is one set of image price knobs, not two.
    imagePrices: {
      support: { low: num(env.SITEREMADE_IMAGE_COST_SUPPORT_LOW_USD, 0.006), medium: num(env.SITEREMADE_IMAGE_COST_SUPPORT_MEDIUM_USD, 0.015), high: num(env.SITEREMADE_IMAGE_COST_SUPPORT_HIGH_USD, 0.03) },
      premium: { low: num(env.SITEREMADE_IMAGE_COST_PREMIUM_LOW_USD, 0.05), medium: num(env.SITEREMADE_IMAGE_COST_PREMIUM_MEDIUM_USD, 0.15), high: num(env.SITEREMADE_IMAGE_COST_PREMIUM_HIGH_USD, 0.45) },
      nonSquareMultiplier: num(env.SITEREMADE_IMAGE_LANDSCAPE_COST_MULTIPLIER, 1.4),
    },
  };
}

module.exports = { loadConfig, DEFAULT_TEXT_PRICES, truthy };
