'use strict';
// TRUE 3D — what a 3D model costs SiteRemade, and what it would be quoted at (server only).
//
// NOT PRICED YET. This is the SHAPE of the money, so that when a real provider is chosen the price is a configuration
// change and not a redesign. A 3D model has two costs of its own:
//   provider   what the image-to-3D provider charges for one model (unknown until a provider is chosen and observed)
//   blender    what the normalisation costs to run (server compute for a few seconds to a few minutes)
// and it is sold the way every premium asset is (lib/quotes.js, lib/premium-jobs.js): quoted in SiteRemade credits before
// anything is spent, reserved, made by the durable premium job, charged only if delivered, the rest returned.
//
//   estimate(env) -> { priced, providerUsd, blenderUsd, observedUsd, budgetUsd, credits, reason }
//     priced: false until SITEREMADE_3D_PROVIDER_USD is set -- an unpriced model is never planned, quoted or made
//     budgetUsd: the observed cost with the same safety margin the video budget uses; credits: what covers it at the
//     per-credit provider ceiling (lib/pricing.js USD_PER_CREDIT_CEILING) -- never under the cost
//   role(estimate, extra) -> the fields a premium job's 3D role carries (credits, estimatedUsd, observedUsd)
const P = require('../pricing');

const SAFETY_BUFFER = 1.07;
const MAX_CREDITS = 40; // (the same ceiling as any single premium asset: lib/quotes.js MAX_PREMIUM_CREDITS)
const num = v => { const n = Number(v); return v !== undefined && v !== null && String(v).trim() !== '' && Number.isFinite(n) && n >= 0 ? n : undefined; };
const upToCent = usd => Math.ceil(+(usd * 100).toFixed(6)) / 100;

function estimate(env = process.env) {
  const providerUsd = num(env.SITEREMADE_3D_PROVIDER_USD); const blenderUsd = num(env.SITEREMADE_3D_BLENDER_USD) || 0;
  if (providerUsd === undefined) return { priced: false, providerUsd: null, blenderUsd, observedUsd: null, budgetUsd: null, credits: null, reason: 'not_priced' };
  const buffer = Math.max(1, num(env.SITEREMADE_3D_SAFETY_BUFFER) || SAFETY_BUFFER);
  const observedUsd = +(providerUsd + blenderUsd).toFixed(4); const budgetUsd = upToCent(observedUsd * buffer);
  const credits = Math.max(1, Math.ceil(+(budgetUsd / P.USD_PER_CREDIT_CEILING).toFixed(6)));
  if (credits > MAX_CREDITS) return { priced: false, providerUsd, blenderUsd, observedUsd, budgetUsd, credits, reason: 'not_priced' };
  return { priced: true, providerUsd, blenderUsd, observedUsd, budgetUsd, credits, reason: '' };
}
// one 3D model as a role of a premium job (lib/premium-jobs.js): what it is quoted at, budgeted at and observed to cost
function role(est, extra) {
  const e = est || estimate();
  return Object.assign({ role: 'model3d', mediaType: 'model3d', intent: 'image_to_3d', preset: 'model3d', credits: e.credits || 0, estimatedUsd: e.budgetUsd || 0, observedUsd: e.observedUsd || 0, state: 'pending' }, extra || {});
}

module.exports = { SAFETY_BUFFER, MAX_CREDITS, estimate, role };
