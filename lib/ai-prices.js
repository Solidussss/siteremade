'use strict';
// THE AI PRICE TABLE -- the one place customer AI is priced. Two numbers per action:
//   credits     what the customer pays (shown before anything runs; the server works it out, never the browser)
//   provider    what SiteRemade budgets to pay the provider (internal, never shown)
// Override either with SITEREMADE_AI_PRICES (JSON merged over the defaults, e.g. {"credits":{"video_5":10}}) -- no
// route carries a price of its own.
//
// Provider figures are BUDGETS, not quotes. Wan 3.0 Prime is UNVERIFIED: fal.ai lists 0.28 USD/s at 1080p; Higgsfield
// showed 0.112 USD/s at 1080p as a 60%-off promotion ending 2026-11-01 (so ~0.28 list). We budget the higher figure
// until the owner reads the real charge from the Higgsfield dashboard, then sets wan_usd_per_second (and turns
// SITEREMADE_AI_PRICES_VERIFIED on). Every credit price must also clear the existing provider ceiling
// (pricing.USD_PER_CREDIT_CEILING per credit) and the margin below -- check() says which ones don't.
const pricing = require('./pricing');

const DEFAULTS = {
  credits: {
    assist_update: 2,   // a Claude-assisted update (plan shown before it's applied)
    own_plan: 3,        // "Make It Your Own": the answers become a customisation plan + image/video prompts
    image: 2,           // one generated image (OpenAI)
    video_5: 9,         // one 5-second Wan 3.0 Prime clip, 1080p, no audio
    video_12: 21,       // one 12-second clip
  },
  provider: {
    claude_call_usd: 0.06,      // one planning call (Sonnet list price, ~8k tokens in / 1.5k out ~ 0.05)
    image_usd: 0.07,            // one gpt-image-1 medium portrait/landscape (~0.063 list)
    wan_usd_per_second: 0.28,   // Wan 3.0 Prime 1080p -- UNVERIFIED (see above)
  },
  margin: 1.2,                  // provider cost x this must fit inside what the credits may spend
};

function deepMerge(a, b) {
  const out = Array.isArray(a) ? a.slice() : Object.assign({}, a);
  for (const [k, v] of Object.entries(b || {})) out[k] = v && typeof v === 'object' && !Array.isArray(v) && a && typeof a[k] === 'object' ? deepMerge(a[k], v) : v;
  return out;
}
function table(env = process.env) {
  let over = {}; try { over = env.SITEREMADE_AI_PRICES ? JSON.parse(env.SITEREMADE_AI_PRICES) : {}; } catch (e) { over = {}; }
  const t = deepMerge(DEFAULTS, over);
  for (const [k, v] of Object.entries(t.credits)) t.credits[k] = Math.max(0, Math.round(Number(v) || 0));
  for (const [k, v] of Object.entries(t.provider)) t.provider[k] = Math.max(0, Number(v) || 0);
  t.margin = Math.max(1, Number(t.margin) || 1);
  return t;
}

const SECONDS = [5, 12];
const videoCredits = (t, s) => (s === 12 ? t.credits.video_12 : t.credits.video_5);
const videoUsd = (t, s) => +(s * t.provider.wan_usd_per_second).toFixed(4);

// What a request costs, worked out on the server from its kind and its (already validated) parameters.
// -> { credits, estUsd, video, parts: [{ n, credits, estUsd, what }] } or { error }
function quote(kind, params = {}, env = process.env) {
  const t = table(env); const part = (n, credits, estUsd, what) => ({ n, credits, estUsd: +estUsd.toFixed(4), what });
  let parts; let video = false;
  if (kind === 'assist_update') parts = [part(1, t.credits.assist_update, t.provider.claude_call_usd, 'Claude-assisted update')];
  else if (kind === 'own_plan') parts = [part(1, t.credits.own_plan, t.provider.claude_call_usd, 'Make It Your Own plan')];
  else if (kind === 'hero_build') {   // your start/end images -> Claude matches the website to them, Wan makes the hero
    const s = Number(params.seconds) || 5; if (!SECONDS.includes(s)) return { error: 'Videos are 5 or 12 seconds.' };
    video = true; parts = [part(1, t.credits.own_plan, t.provider.claude_call_usd * 2, 'Claude matches your website to your images'), part(2, videoCredits(t, s), videoUsd(t, s), `Your ${s}-second hero video`)];
  }
  else if (kind === 'image') {
    const n = Math.round(Number(params.count) || 1); if (n < 1 || n > 2) return { error: 'One or two images at a time.' };
    parts = Array.from({ length: n }, (_, i) => part(i + 1, t.credits.image, t.provider.image_usd, i ? 'End image' : (n > 1 ? 'Start image' : 'Image')));
  } else if (kind === 'video' || kind === 'exterior') {
    const s = Number(params.seconds) || 5; if (!SECONDS.includes(s)) return { error: 'Videos are 5 or 12 seconds.' };
    video = true; parts = [part(1, videoCredits(t, s), videoUsd(t, s), `${s}-second video`)];
  } else if (kind === 'showcase') {
    const n = Math.round(Number(params.images) || 0); if (n < 2 || n > 9) return { error: 'A showcase takes 2 to 9 photos.' };
    const s = Number(params.seconds) || 5; if (!SECONDS.includes(s)) return { error: 'Segments are 5 or 12 seconds.' };
    video = true; parts = Array.from({ length: n - 1 }, (_, i) => part(i + 1, videoCredits(t, s), videoUsd(t, s), `Segment ${i + 1}: photo ${i + 1} to ${i + 2}`));
  } else return { error: 'Unknown AI action.' };
  return { kind, credits: parts.reduce((a, p) => a + p.credits, 0), estUsd: +parts.reduce((a, p) => a + p.estUsd, 0).toFixed(4), video, parts };
}

// Is every price safe? A price must cover its provider budget x margin within the provider ceiling per credit.
// -> [{ action, credits, estUsd, ceilingUsd, ok }]
function check(env = process.env) {
  const t = table(env);
  const rows = [['assist_update', quote('assist_update', {}, env)], ['own_plan', quote('own_plan', {}, env)], ['image', quote('image', { count: 1 }, env)],
    ['video_5', quote('video', { seconds: 5 }, env)], ['video_12', quote('video', { seconds: 12 }, env)]];
  return rows.map(([action, q]) => {
    const ceilingUsd = +pricing.providerCeilingUsd(q.credits).toFixed(4);
    return { action, credits: q.credits, estUsd: q.estUsd, ceilingUsd, ok: ceilingUsd >= q.estUsd * t.margin };
  });
}

module.exports = { DEFAULTS, SECONDS, table, quote, check };
