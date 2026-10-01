'use strict';
// SITEREMADE PRODUCT PRICING -- the one place prices, credit packs and action credits are defined.
//
//   Buy the website once. Own it permanently. Credits power whatever SiteRemade does for you afterward.
//
// Website ownership is a one-time purchase per website, by kind (Business / Creative). Credits are the usage currency
// for SiteRemade's AI and media work; there is no subscription. Ownership never depends on a credit balance.
//
// Stripe price/product ids are configuration (environment), never source: with a STRIPE_PRICE_* id set, Checkout uses
// that Stripe Price; without it, Checkout sends the amount below as inline price_data. Either way the webhook only
// fulfils a session whose paid amount and currency equal the amount defined here -- so a Stripe Price created with a
// different amount can never unlock anything (it is refused and logged).
//
// The internal provider budget per credit (USD_PER_CREDIT_CEILING) is an operating rule, never shown to customers and
// never an exchange rate: every planned operation gets a provider-spend ceiling of credits x this, and no provider call
// may take an operation past it.

const CURRENCY = 'cad';

// one-time website ownership, CAD cents
const WEBSITE_PRICES = {
  business: { cents: 14999, currency: CURRENCY, label: 'Business Website', stripePriceEnv: 'STRIPE_PRICE_BUSINESS_WEBSITE' },
  creative: { cents: 49999, currency: CURRENCY, label: 'Creative Website', stripePriceEnv: 'STRIPE_PRICE_CREATIVE_WEBSITE' },
};

// credit packs: one-time purchases (never subscriptions)
const CREDIT_PACKS = [
  { id: 'credits_10', credits: 10, cents: 999, currency: CURRENCY, label: '10 SiteRemade Credits', stripePriceEnv: 'STRIPE_PRICE_CREDITS_10' },
  { id: 'credits_30', credits: 30, cents: 2499, currency: CURRENCY, label: '30 SiteRemade Credits', stripePriceEnv: 'STRIPE_PRICE_CREDITS_30' },
  { id: 'credits_75', credits: 75, cents: 4999, currency: CURRENCY, label: '75 SiteRemade Credits', stripePriceEnv: 'STRIPE_PRICE_CREDITS_75' },
  { id: 'credits_200', credits: 200, cents: 9999, currency: CURRENCY, label: '200 SiteRemade Credits', stripePriceEnv: 'STRIPE_PRICE_CREDITS_200' },
];

// the account's first purchased website includes this many credits, once (ledger reason: first_website_bonus)
const FIRST_WEBSITE_BONUS_CREDITS = 30;

// The initial action-credit rules. A quote (lib/quotes.js) is built from these items for the work actually planned --
// never a flat number per button.
const ACTION_CREDITS = {
  text_update: 1,            // a simple text / content update
  section_update: 2,         // a normal section redesign or update
  page_rework: 2,            // rework an existing page
  page_add: 3,               // add a new page
  business_generation: 4,    // a whole Business website
  deep_redesign: 5,          // a deep whole-site redesign
  creative_dom: 6,           // a Creative website (DOM renderer)
  spatial_surcharge: 2,      // ... rendered with the spatial (WebGL) layer: 8 in all
  creative_direction: 5,     // another direction for an existing Creative page (its research is reused)
  premium_image: 1,          // a premium image enhancement (Higgsfield)
  premium_cinematic: 3,      // a short cinematic asset (Higgsfield)
  premium_expensive: 5,      // an unusually expensive cinematic / video operation (Higgsfield)
  image_support: 1,          // an optional generated picture (support model)
  image_premium: 2,          // an optional generated picture (premium model)
};

// internal: the most provider spend (USD) one credit may support. Normal operations should cost far less.
const USD_PER_CREDIT_CEILING = 0.2;

function num(v) { const n = Number(v); return Number.isFinite(n) && n > 0 ? Math.round(n) : null; }
// a configured price override (whole cents) for a kind, else the defined price. (The old single
// SITEREMADE_WEBSITE_PRICE_CENTS -- one price for every kind -- is deliberately no longer read.)
function websitePrice(kind, env = process.env) {
  const k = kind === 'creative' ? 'creative' : 'business';
  const base = WEBSITE_PRICES[k];
  const override = num(env[k === 'creative' ? 'SITEREMADE_CREATIVE_WEBSITE_PRICE_CENTS' : 'SITEREMADE_BUSINESS_WEBSITE_PRICE_CENTS']);
  return { kind: k, cents: override || base.cents, currency: base.currency, label: base.label, stripePriceId: String(env[base.stripePriceEnv] || '').trim() || null };
}
function creditPack(id, env = process.env) {
  const p = CREDIT_PACKS.find(x => x.id === id); if (!p) return null;
  return Object.assign({}, p, { stripePriceId: String(env[p.stripePriceEnv] || '').trim() || null });
}
function creditPacks(env = process.env) { return CREDIT_PACKS.map(p => creditPack(p.id, env)); }
function display(cents, currency = CURRENCY) { return `$${(cents / 100).toFixed(2)} ${String(currency).toUpperCase()}`; }
// what customers see: prices and packs, never Stripe ids or the internal budget
function publicCatalog(env = process.env) {
  return {
    websites: { business: (({ cents, currency, label }) => ({ cents, currency, label, display: display(cents, currency) }))(websitePrice('business', env)), creative: (({ cents, currency, label }) => ({ cents, currency, label, display: display(cents, currency) }))(websitePrice('creative', env)) },
    packs: creditPacks(env).map(p => ({ id: p.id, credits: p.credits, cents: p.cents, currency: p.currency, label: p.label, display: display(p.cents, p.currency) })),
    firstWebsiteBonus: FIRST_WEBSITE_BONUS_CREDITS,
    actionCredits: Object.assign({}, ACTION_CREDITS),
  };
}
function providerCeilingUsd(credits) { return +(Math.max(0, Number(credits) || 0) * USD_PER_CREDIT_CEILING).toFixed(4); }

module.exports = { CURRENCY, WEBSITE_PRICES, CREDIT_PACKS, FIRST_WEBSITE_BONUS_CREDITS, ACTION_CREDITS, USD_PER_CREDIT_CEILING, websitePrice, creditPack, creditPacks, publicCatalog, providerCeilingUsd, display };
