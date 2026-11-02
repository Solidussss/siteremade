'use strict';
// THE AI PRICE TABLE -- the one place customer AI is priced. Two numbers per action:
//   credits     what the customer pays (shown before anything runs; the server works it out, never the browser)
//   provider    what SiteRemade budgets to pay the provider (internal, never shown)
// Override either with SITEREMADE_AI_PRICES (JSON merged over the defaults, e.g. {"credits":{"video_5":10}}) -- no
// route carries a price of its own.
//
// Provider figures are BUDGETS, not quotes. Wan 3.0 Prime is UNVERIFIED: Higgsfield's model page showed 2 to 30
// seconds at 480p to 1080p, 0.0272 to 0.112 USD/s as a 60%-off promotion ending 2026-11-01 -- so about 0.068 (480p)
// to 0.28 (1080p) at list; the owner's own 10 s 720p clip cost ~0.56 at the promotion (~0.14/s list). We budget list
// prices until the owner reads the real charge from the Higgsfield dashboard, then sets wan_usd_per_second (and turns
// SITEREMADE_AI_PRICES_VERIFIED on). A video's credits are worked out per second from its quality's budget, so a
// longer or sharper clip costs more and every price clears the provider ceiling (pricing.USD_PER_CREDIT_CEILING per
// credit) with the margin below -- check() says if one doesn't.
const pricing = require('./pricing');

const DEFAULTS = {
  credits: {
    assist_update: 2,   // a Claude-assisted update (plan shown before it's applied)
    own_plan: 3,        // "Make It Your Own": the answers become a customisation plan + image/video prompts
    image: 2,           // one generated image (OpenAI)
  },
  provider: {
    claude_call_usd: 0.06,      // one planning call (Sonnet list price, ~8k tokens in / 1.5k out ~ 0.05)
    image_usd: 0.07,            // one gpt-image-1 medium portrait/landscape (~0.063 list)
    wan_usd_per_second: { '480p': 0.068, '720p': 0.14, '1080p': 0.28 },   // Wan 3.0 Prime, no audio -- UNVERIFIED (see above)
  },
  video: { min: 2, max: 30, quality: '1080p' },   // what the customer can pick, like Higgsfield's playground (default 1080p)
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
  for (const [k, v] of Object.entries(t.provider)) {
    if (k === 'wan_usd_per_second') {   // per quality; a single number (the old form) is taken as every quality's price
      const o = v && typeof v === 'object' ? v : { '1080p': v }; t.provider[k] = {};
      for (const [q, usd] of Object.entries(o)) if (/^\d{3,4}p$/.test(q) && Number(usd) > 0) t.provider[k][q] = Number(usd);
      if (!Object.keys(t.provider[k]).length) t.provider[k] = Object.assign({}, DEFAULTS.provider.wan_usd_per_second);
    } else t.provider[k] = Math.max(0, Number(v) || 0);
  }
  const qs = Object.keys(t.provider.wan_usd_per_second).sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
  const min = Math.max(1, Math.round(Number(t.video && t.video.min) || 2)), max = Math.max(min, Math.round(Number(t.video && t.video.max) || 30));
  t.video = { min, max, qualities: qs, quality: qs.includes(t.video && t.video.quality) ? t.video.quality : qs[qs.length - 1] };
  t.margin = Math.max(1, Number(t.margin) || 1);
  return t;
}

// a clip's budget and its price: credits = ceil(seconds x USD/s x margin / USD per credit), so it always covers the cost
const videoUsd = (t, s, q) => +(s * t.provider.wan_usd_per_second[q]).toFixed(4);
const videoCredits = (t, s, q) => Math.ceil(+(videoUsd(t, s, q) * t.margin / pricing.USD_PER_CREDIT_CEILING).toFixed(6));
// a length and quality the customer may pick -> { seconds, quality } or { error }
function videoChoice(params = {}, t = table()) {
  const s = params.seconds == null || params.seconds === '' ? 5 : Number(params.seconds);
  if (!Number.isInteger(s) || s < t.video.min || s > t.video.max) return { error: `Videos are ${t.video.min} to ${t.video.max} seconds.` };
  const q = params.quality == null || params.quality === '' ? t.video.quality : String(params.quality);
  if (!t.video.qualities.includes(q)) return { error: `Pick a quality: ${t.video.qualities.join(', ')}.` };
  return { seconds: s, quality: q };
}
// what the studio shows next to the length slider and quality buttons (the server still quotes every job itself)
function videoMenu(env = process.env) {
  const t = table(env);
  return { min: t.video.min, max: t.video.max, quality: t.video.quality,
    qualities: t.video.qualities.map((q) => ({ id: q, creditsPerSecond: +(t.provider.wan_usd_per_second[q] * t.margin / pricing.USD_PER_CREDIT_CEILING).toFixed(4) })) };
}

// What a request costs, worked out on the server from its kind and its (already validated) parameters.
// -> { credits, estUsd, video, parts: [{ n, credits, estUsd, what }] } or { error }
function quote(kind, params = {}, env = process.env) {
  const t = table(env); const part = (n, credits, estUsd, what) => ({ n, credits, estUsd: +estUsd.toFixed(4), what });
  let parts; let video = false;
  if (kind === 'assist_update') parts = [part(1, t.credits.assist_update, t.provider.claude_call_usd, 'Claude-assisted update')];
  else if (kind === 'own_plan') parts = [part(1, t.credits.own_plan, t.provider.claude_call_usd, 'Make It Your Own plan')];
  else if (kind === 'hero_build') {   // your start/end images -> Claude matches the website to them, Wan makes the hero
    const v = videoChoice(params, t); if (v.error) return v;
    video = true; parts = [part(1, t.credits.own_plan, t.provider.claude_call_usd * 2, 'Claude matches your website to your images'), part(2, videoCredits(t, v.seconds, v.quality), videoUsd(t, v.seconds, v.quality), `Your ${v.seconds}-second ${v.quality} hero video`)];
  }
  else if (kind === 'image') {
    const n = Math.round(Number(params.count) || 1); if (n < 1 || n > 2) return { error: 'One or two images at a time.' };
    parts = Array.from({ length: n }, (_, i) => part(i + 1, t.credits.image, t.provider.image_usd, i ? 'End image' : (n > 1 ? 'Start image' : 'Image')));
  } else if (kind === 'video' || kind === 'exterior') {
    const v = videoChoice(params, t); if (v.error) return v;
    video = true; parts = [part(1, videoCredits(t, v.seconds, v.quality), videoUsd(t, v.seconds, v.quality), `${v.seconds}-second ${v.quality} video`)];
  } else if (kind === 'showcase') {
    const n = Math.round(Number(params.images) || 0); if (n < 2 || n > 9) return { error: 'A showcase takes 2 to 9 photos.' };
    const v = videoChoice(params, t); if (v.error) return v;
    video = true; parts = Array.from({ length: n - 1 }, (_, i) => part(i + 1, videoCredits(t, v.seconds, v.quality), videoUsd(t, v.seconds, v.quality), `Segment ${i + 1}: photo ${i + 1} to ${i + 2}`));
  } else return { error: 'Unknown AI action.' };
  return { kind, credits: parts.reduce((a, p) => a + p.credits, 0), estUsd: +parts.reduce((a, p) => a + p.estUsd, 0).toFixed(4), video, parts };
}

// Is every price safe? A price must cover its provider budget x margin within the provider ceiling per credit.
// -> [{ action, credits, estUsd, ceilingUsd, ok }]
function check(env = process.env) {
  const t = table(env);
  const rows = [['assist_update', quote('assist_update', {}, env)], ['own_plan', quote('own_plan', {}, env)], ['image', quote('image', { count: 1 }, env)]];
  for (const q of t.video.qualities) for (const s of [t.video.min, 5, t.video.max]) if (s >= t.video.min && s <= t.video.max) rows.push([`video_${s}s_${q}`, quote('video', { seconds: s, quality: q }, env)]);
  return rows.map(([action, q]) => {
    const ceilingUsd = +pricing.providerCeilingUsd(q.credits).toFixed(4);
    return { action, credits: q.credits, estUsd: q.estUsd, ceilingUsd, ok: ceilingUsd >= q.estUsd * t.margin };
  });
}

module.exports = { DEFAULTS, table, quote, check, videoChoice, videoMenu };
