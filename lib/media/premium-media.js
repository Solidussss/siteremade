'use strict';
// PREMIUM MEDIA -- provider-neutral. SiteRemade composes the website (direction, timeline, DOM and spatial renderers,
// typography, transitions, storage, export); a premium media provider (Higgsfield today) only supplies an occasional
// asset SiteRemade cannot reasonably make itself. The order of preference is fixed:
//   1 the customer's own assets   2 SiteRemade DOM/CSS   3 the spatial renderer   4 discovered, approved imagery
//   5 light image treatment       6 premium media -- only for a meaningful improvement nothing above can reproduce
//
// Bounded by construction:
//   - INTENTS is the whole vocabulary (the Creative plan names an intent and a source picture -- never an API parameter);
//     each intent maps to a fixed PRESET (endpoint, duration, resolution) chosen here
//   - this module PLANS and VALIDATES only: premium media is made by one system, the durable premium job of a generation
//     whose owner chose a video mode (lib/premium-jobs.js) -- one submit per clip at most, never more clips than the mode,
//     never past its budget, never a retried generation
//   - one premium video clip is budgeted at the OBSERVED per-clip cost (~2.10 USD, 2.25 with the buffer: lib/provider-
//     budget.js video_clip), whatever video model is configured
//   - the SOURCE is the owner's own UPLOAD only (or a cut-out of one), and only when it is good enough for a full-screen
//     cinematic video (lib/creative/premium-source.js: size, crop headroom, subject, sharpness, compression). Pictures
//     found on the web -- discovered, researched or picked -- may be on the page, but are never sent for transformation
//     (Google/SerpApi = discovery; the owner's upload = the only source; the provider = optional transformation;
//     SiteRemade = the final composition). No Wikimedia, ever.
//   - every finished output is downloaded and stored as a project asset (content-addressed) with its provenance; the
//     website and its export use that local file, never a provider URL
const crypto = require('crypto');
const PS = require('../creative/premium-source');

const INTENTS = {
  cinematic_hero: { mediaType: 'video', preset: 'video_clip', prompt: 'slow cinematic camera move, subtle parallax and light, the subject stays exactly as it is' },
  object_motion: { mediaType: 'video', preset: 'video_clip', prompt: 'the object turns slowly in place, studio light, no change to its shape or details' },
  image_to_video: { mediaType: 'video', preset: 'video_clip', prompt: 'gentle natural motion, the scene stays faithful to the picture' },
  environment_motion: { mediaType: 'video', preset: 'video_clip', prompt: 'ambient atmospheric motion in the environment, slow and seamless' },
  premium_transition: { mediaType: 'video', preset: 'video_clip', prompt: 'a smooth continuous camera move through the scene' },
  alternate_angle: { mediaType: 'image', preset: 'image_standard', prompt: 'the same subject seen from another angle, faithful to its design' },
  image_enhance: { mediaType: 'image', preset: 'image_standard', prompt: 'the same picture, cleaner light and detail, nothing added or removed' },
  stylized_treatment: { mediaType: 'image', preset: 'image_standard', prompt: 'the same picture in a refined editorial colour treatment' },
};
const INTENT_NAMES = Object.keys(INTENTS);
// (perGeneration: what a page's own requests may name; events: the most premium moments a showcase plans -- hero,
// takeover, payoff -- each its own credit line, reserved first, charged only when delivered)
const LIMITS = { perGeneration: 2, events: 3, subjectChars: 120 };
// the premium arc's roles, in the order a budget that cannot carry them all keeps them (the payoff falls back to the hero's
// own clip as its callback, then the takeover is dropped -- the hero is never dropped for the others)
const ROLE_ORDER = ['hero', 'takeover', 'payoff'];
const ROLE_INTENT = { hero: 'cinematic_hero', takeover: 'premium_transition', payoff: 'cinematic_hero' };

// ---- provider configuration (endpoints are Railway configuration, read and checked here) -------------------------------
// HIGGSFIELD_VIDEO_ENDPOINT / HIGGSFIELD_IMAGE_ENDPOINT may be a model id ("kling-video/v3.0/4k/image-to-video") or a full
// URL pasted from Higgsfield's docs ("https://api.higgsfield.ai/kling-video/v3.0/4k/image-to-video"): both normalise to
// the model id. Anything else is reported as invalid -- never silently dropped.
const HF_HOSTS = /^(api|platform|cloud|open)\.higgsfield\.ai$/i;
const MODEL_PATH = /^[a-z0-9][a-z0-9._-]*(\/[a-z0-9][a-z0-9._-]*)+$/i;
// -> { ok, endpoint, reason: missing | invalid_url | wrong_host | invalid_format }
function normalizeEndpoint(raw) {
  let v = String(raw == null ? '' : raw).trim().replace(/^["']|["']$/g, '');
  if (!v) return { ok: false, endpoint: null, reason: 'missing' };
  if (/^[a-z]+:\/\//i.test(v)) {
    let u; try { u = new URL(v); } catch (e) { return { ok: false, endpoint: null, reason: 'invalid_url' }; }
    if (!HF_HOSTS.test(u.hostname)) return { ok: false, endpoint: null, reason: 'wrong_host' };
    v = decodeURIComponent(u.pathname);
    // (a docs page URL: /models/<model>/api-reference)
    v = v.replace(/^\/+/, '').replace(/^models\//, '').replace(/\/api-reference\/?$/, '');
  }
  v = v.replace(/^\/+|\/+$/g, '');
  if (!MODEL_PATH.test(v) || /\.\./.test(v) || v.length > 100 || /^requests\//.test(v)) return { ok: false, endpoint: null, reason: 'invalid_format' };
  return { ok: true, endpoint: v, reason: '' };
}
// the request parameters a model family documents (the rest of each request is fixed by SiteRemade): Kling 3.0 takes no
// resolution (it is in the model id) and has sound on by default; Wan takes a resolution; anything else gets the one
// parameter every image-to-video model documents
function paramsFor(endpoint, mediaType) {
  if (mediaType !== 'video') return {};
  if (/^kling-video\//i.test(endpoint)) return { duration: 5, sound: 'off' };
  if (/^wan\//i.test(endpoint)) return { duration: 5, resolution: '720p' };
  return { duration: 5 };
}
// what the configured video model is asked for, for the telemetry (never a price): its resolution as its id or its
// parameters say, and the clip's length
function videoSpec(endpoint) { const p = paramsFor(endpoint, 'video'); return { resolution: /4k/i.test(endpoint || '') ? '4k' : /1080/i.test(endpoint || '') ? '1080p' : p.resolution || 'model default', durationS: p.duration || 5 }; }
// one premium video clip, whatever the configured model: budgeted at the OBSERVED per-clip cost (lib/provider-budget.js
// video_clip -- ~2.10 USD observed, 2.25 budgeted), never at a cheaper per-model guess
function presets(env = process.env) {
  const v = normalizeEndpoint(env.HIGGSFIELD_VIDEO_ENDPOINT); const i = normalizeEndpoint(env.HIGGSFIELD_IMAGE_ENDPOINT);
  const clip = Object.assign({ endpoint: v.endpoint, endpointError: v.reason, mediaType: 'video', params: paramsFor(v.endpoint, 'video'), costKey: 'video_clip' }, videoSpec(v.endpoint));
  return {
    video_clip: clip,
    // (the names older records carry: the same clip)
    video_5s_720p: clip, video_5s_1080p: clip,
    image_standard: { endpoint: i.endpoint, endpointError: i.reason, mediaType: 'image', params: {}, costKey: 'image_standard' },
  };
}

// ---- why premium media did (or did not) happen: one vocabulary, customer-safe words ------------------------------------
const REASONS = {
  not_requested: 'Not requested. Ask for a cinematic hero video, image-to-video, a product turn or another angle to include it.',
  // (premium video is a choice the owner makes in the generator: on or off, and how many moments)
  off: 'Premium video is off: no premium video is made or charged.',
  needs_upload: 'Premium video uses uploaded images only: upload a good photo to include it, or continue without premium video.',
  fewer_uploads: 'More premium moments need more suitable uploads: a takeover needs a second uploaded photo.',
  not_justified: 'Not needed for this page.',
  renderer_handled: 'The 3D renderer already turns this subject from its model, so no premium media is needed.',
  no_source: 'No picture to start from: add a photo of the subject (or keep one the search found) to make it.',
  source_not_eligible: 'Premium media blocked: premium video uses uploaded images only, and the upload must be good enough for full-screen video.',
  missing_api_key: 'Premium media is unavailable: the media provider is not configured on this server (missing API key).',
  paid_providers_off: 'Premium media is unavailable in this environment.',
  missing_video_endpoint: 'Premium media is unavailable: no video model is configured (missing video endpoint).',
  missing_image_endpoint: 'Premium media is unavailable: no image model is configured (missing image endpoint).',
  invalid_endpoint: 'Premium media is unavailable: the configured media model is not a valid endpoint.',
  intent_not_enabled: 'Premium media is not enabled for this kind of media.',
  budget_blocked: "Premium media blocked: it would exceed this generation's budget.",
  provider_failed: 'The media provider could not make it. Its SiteRemade credits were returned.',
  one_video_per_generation: 'One premium video per generation: the hero video is made; ask for another video separately.',
  showcase_budget: 'The provider budget could not carry every planned premium moment: the later ones were not made and their SiteRemade credits were returned.',
  premium_disabled: 'Premium video is switched off on this server right now. Creative pages are made as usual.',
  not_run: 'It was not made (the page stopped before that step). Its SiteRemade credits were returned.',
};
// the provider's state for one intent -> { ok, reason } (reason keys REASONS)
function providerState({ hasKey, mode, env } = {}, intent) {
  if (mode === 'off') return { ok: false, reason: 'paid_providers_off' };
  // (the server-side kill switch for paid premium generation: PREMIUM_PROVIDER_ENABLED=false)
  if (String((env && env.PREMIUM_PROVIDER_ENABLED) || 'true').trim().toLowerCase() === 'false') return { ok: false, reason: 'premium_disabled' };
  if (!hasKey) return { ok: false, reason: 'missing_api_key' };
  const def = INTENTS[intent]; if (!def) return { ok: false, reason: 'intent_not_enabled' };
  const p = presets(env)[def.preset];
  if (!p.endpoint) return { ok: false, reason: p.endpointError === 'missing' ? (def.mediaType === 'video' ? 'missing_video_endpoint' : 'missing_image_endpoint') : 'invalid_endpoint' };
  return { ok: true, reason: '' };
}

// ---- what the brief explicitly asks for (deterministic; no model call) --------------------------------------------------
const ASKS = [
  ['image_to_video', /\b(image[- ]to[- ]video|animate (?:the|my|our|this|a) (?:photo|picture|image)|(?:photo|picture|image)s? (?:that|which) (?:move|comes? to life)|living photo|bring (?:the|my|our|this) (?:photo|picture|image) to life)\b/i],
  ['object_motion', /\b(product turn|turntable|(?:rotating|spinning|turning) (?:product|object|shoe|sneaker|bottle|camera|car|watch)|(?:product|object) (?:turn|rotation|spin|motion)|360[- ]?(?:degree|°)?(?: view| spin| turn)?)\b/i],
  ['alternate_angle', /\b(alternate angles?|alternative angles?|another angle|other angles?|different angles?|side view of)\b/i],
  ['environment_motion', /\b(environment(?:al)? motion|ambient motion|moving (?:background|environment|scenery)|atmospheric (?:motion|video|movement)|living background)\b/i],
  ['premium_transition', /\b((?:premium|cinematic|morph(?:ing)?) transitions?)\b/i],
  ['cinematic_hero', /\b(cinematic (?:hero|video|motion|footage|shot|camera|movement|move)|hero (?:video|film|footage)|premium (?:hero )?(?:media|video|motion)|(?:strong|dramatic|sweeping|dynamic) camera (?:movement|motion|moves?)|video hero|full[- ]motion hero)\b/i],
];
// -> [{ intent, phrase }] (at most LIMITS.perGeneration, in the order above)
function requestedIntents(brief, opts) {
  const text = String(brief || ''); const out = [];
  for (const [intent, re] of ASKS) { const m = re.exec(text); if (m && !out.some(x => x.intent === intent)) out.push({ intent, phrase: m[0] }); }
  return opts && opts.all ? out : out.slice(0, LIMITS.perGeneration);
}
// The premium part of a Creative generation, decided BEFORE anything paid runs, so it is in the one quote the owner
// confirms. tierFor(intent, estimateUsd) -> 'premium_image' | 'premium_cinematic' | 'premium_expensive' | null (too
// expensive for any tier). -> { requested, planned: [{ intent, tier, phrase }], notPlanned: [{ intent, reason }], status }
// strategy: 'standard' (the default: at most one premium video), 'cinematic' (hero + takeover) or 'showcase' (hero +
// takeover + payoff) -- lib/creative/premium-arc.js strategyFor decides it from explicit words or an explicit request
function planForBrief({ brief, provider, costs, tierFor, strategy, asked: given }) {
  // the hero first: a cinematic hero video leads when it was asked for
  const asked = (given || requestedIntents(brief, { all: true })).sort((x, y) => (y.intent === 'cinematic_hero') - (x.intent === 'cinematic_hero'));
  const events = strategy === 'showcase' ? 3 : strategy === 'cinematic' ? 2 : 1;
  if (events > 1) return planArc({ asked, events, provider, costs, tierFor, strategy });
  const out = { requested: asked.length > 0, intents: asked.map(a => a.intent), planned: [], notPlanned: [], strategy: 'standard' };
  for (const a of asked) {
    // ONE premium video per generation (a 4K video is the most expensive thing SiteRemade buys): a second video is never
    // started automatically; a second asset only when it was explicitly asked for and is not another video
    if (INTENTS[a.intent].mediaType === 'video' && out.planned.some(p => INTENTS[p.intent].mediaType === 'video')) { out.notPlanned.push({ intent: a.intent, reason: 'one_video_per_generation' }); continue; }
    if (out.planned.length >= LIMITS.perGeneration) { out.notPlanned.push({ intent: a.intent, reason: 'one_video_per_generation' }); continue; }
    const st = providerState(provider, a.intent);
    if (!st.ok) { out.notPlanned.push({ intent: a.intent, reason: st.reason }); continue; }
    const pre = presets(provider.env)[INTENTS[a.intent].preset];
    const table = (costs && (costs.higgsfieldBudget || costs.higgsfield)) || {};
    const est = table[pre.costKey] || 0;
    const t = tierFor(a.intent, est);
    if (!t) { out.notPlanned.push({ intent: a.intent, reason: 'budget_blocked' }); continue; }
    out.planned.push(Object.assign({ intent: a.intent, phrase: a.phrase }, typeof t === 'object' ? { tier: t.code, credits: t.credits } : { tier: t }));
  }
  out.status = status(out);
  return out;
}
// The premium part of a Creative generation from the OWNER'S CHOICE in the generator (never from the brief's wording
// alone): choice = { on, moments: 1 | 2 | 3, eligibleUploads }. Off -> nothing planned (and, when the brief mentions
// video, the status says so). On -> the brief's named video intent (else a cinematic hero) as one moment, or the hero +
// takeover (+ payoff) arc. Fixed rule: every moment starts from an upload good enough for it -- none -> nothing planned
// and the owner is told; one -> the hero only (a takeover needs a second picture; the payoff returns to the hero's);
// two or more -> the moments asked for. -> the planForBrief shape, its status with { reduced } when fewer were planned
function planForChoice({ choice, brief, provider, costs, tierFor }) {
  const ch = choice || {}; const asks = requestedIntents(brief, { all: true });
  if (!ch.on) return { requested: false, intents: [], planned: [], notPlanned: [], strategy: 'standard', status: Object.assign({ planned: false, intents: [], reason: 'off', message: REASONS.off }, asks.some(a => INTENTS[a.intent].mediaType === 'video') ? { briefAsks: true } : {}) };
  const want = Math.max(1, Math.min(3, Math.round(Number(ch.moments) || 1))); const uploads = Math.max(0, Math.round(Number(ch.eligibleUploads) || 0));
  if (!uploads) return { requested: true, intents: [], planned: [], notPlanned: [{ intent: ROLE_INTENT.hero, reason: 'needs_upload' }], strategy: 'standard', status: { planned: false, intents: [], reason: 'needs_upload', message: REASONS.needs_upload, needsUpload: true } };
  const moments = uploads >= 2 ? want : 1;
  const video = asks.find(a => INTENTS[a.intent].mediaType === 'video');
  const p = moments > 1
    ? planArc({ asked: video ? [video] : [], events: moments, provider, costs, tierFor, strategy: moments === 3 ? 'showcase' : 'cinematic' })
    : planForBrief({ brief: '', provider, costs, tierFor, asked: [video || { intent: 'cinematic_hero', phrase: 'premium video' }] });
  p.requested = true;
  if (moments < want) p.status = Object.assign({}, p.status, { reduced: { asked: want, planned: moments, message: `${want === 3 ? 'A showcase' : 'Two premium moments'} need${want === 3 ? 's' : ''} at least 2 suitable uploaded photos; with 1, this includes the hero video only.` } });
  return p;
}
// a cinematic or showcase generation: one priced line per premium moment (hero, takeover, payoff), the hero's intent the
// one the brief named when it named a video; images it asked for are not part of the arc
function planArc({ asked, events, provider, costs, tierFor, strategy }) {
  const out = { requested: true, intents: [], planned: [], notPlanned: [], strategy };
  const heroIntent = (asked.find(a => INTENTS[a.intent].mediaType === 'video') || {}).intent || ROLE_INTENT.hero;
  for (const role of ROLE_ORDER.slice(0, events)) {
    const intent = role === 'hero' ? heroIntent : ROLE_INTENT[role]; out.intents.push(intent);
    const st = providerState(provider, intent); if (!st.ok) { out.notPlanned.push({ intent, role, reason: st.reason }); if (role === 'hero') break; continue; }
    const pre = presets(provider.env)[INTENTS[intent].preset]; const table = (costs && (costs.higgsfieldBudget || costs.higgsfield)) || {};
    const t = tierFor(intent, table[pre.costKey] || 0);
    if (!t) { out.notPlanned.push({ intent, role, reason: 'budget_blocked' }); if (role === 'hero') break; continue; }
    out.planned.push(Object.assign({ intent, role, phrase: role }, typeof t === 'object' ? { tier: t.code, credits: t.credits } : { tier: t }));
  }
  asked.filter(a => INTENTS[a.intent].mediaType !== 'video').forEach(a => out.notPlanned.push({ intent: a.intent, reason: 'not_justified' }));
  out.status = status(out);
  return out;
}
// the one line a customer reads: planned yes/no and, if no, why
function status(p) {
  if (p.planned.length) return { planned: true, intents: p.planned.map(x => x.intent), ...(p.strategy && p.strategy !== 'standard' ? { strategy: p.strategy, roles: p.planned.map(x => x.role) } : {}), credits: p.planned.reduce((n, x) => n + (x.credits || 0), 0), reason: '', message: `Premium media planned: ${p.planned.map(x => `${x.role && p.strategy && p.strategy !== 'standard' ? `${x.role} video` : x.intent.replace(/_/g, ' ')}${x.credits ? ` (${x.credits} credits)` : ''}`).join(', ')} -- made with Higgsfield after the page is directed; each charged only if it is delivered.${p.notPlanned.some(n => n.reason === 'one_video_per_generation') ? ' ' + REASONS.one_video_per_generation : ''}` };
  if (!p.requested) return { planned: false, intents: [], reason: 'not_requested', message: REASONS.not_requested };
  const r = p.notPlanned[0] ? p.notPlanned[0].reason : 'not_justified';
  return { planned: false, intents: p.intents, reason: r, message: REASONS[r] || REASONS.not_justified };
}

// -> { ok, reason }
// whether a picture may be sent for transformation: the owner's own upload, good enough for full-screen video
// (lib/creative/premium-source.js -- the studio shows the same verdict). ctx: { byId, measured } -> { ok, code, reason }
function sourceEligibility(asset, ctx) { return PS.eligible(asset, ctx); }

const clean = (v, n) => String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f<>{}]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
// The plan's (or the owner's) premium-media requests -> the bounded, validated set SiteRemade will consider.
// raw: [{ intent, asset, subject?, why? }]; ctx: { assets, models, mode, renderer, kind, measure(asset) -> what the file
// itself says (premium-source.js headerSize + its size), when the server has the bytes }
// -> { requests: [{ intent, mediaType, preset, sourceAssetId, subject, why }], dropped: [{ intent, reason }] }
function validateRequests(raw, ctx) {
  const c = ctx || {}; const out = []; const dropped = [];
  const byId = new Map((c.assets || []).filter(a => a && a.id).map(a => [a.id, a]));
  const hasModel = (c.models || []).length > 0;
  if (c.kind === 'business') return { requests: [], dropped: (raw || []).map(r => ({ intent: r && r.intent, reason: 'Business websites never use premium media automatically' })) };
  for (const r of (Array.isArray(raw) ? raw : []).slice(0, 6)) {
    const intent = r && INTENT_NAMES.includes(r.intent) ? r.intent : null;
    if (!intent) { dropped.push({ intent: r && r.intent, reason: 'not a premium media intent' }); continue; }
    if (out.length >= LIMITS.perGeneration) { dropped.push({ intent, reason: `at most ${LIMITS.perGeneration} premium assets per generation` }); continue; }
    if (out.some(x => x.intent === intent)) { dropped.push({ intent, reason: 'already requested' }); continue; }
    // the hierarchy: what SiteRemade already does well is never bought
    if (hasModel && ['object_motion', 'alternate_angle'].includes(intent)) { dropped.push({ intent, reason: 'the spatial renderer already turns this subject from its 3D model' }); continue; }
    if (['quiet', 'editorial'].includes(c.mode) && INTENTS[intent].mediaType === 'video') { dropped.push({ intent, reason: 'a restrained page does not need premium motion' }); continue; }
    const src = byId.get(r.asset);
    const el = sourceEligibility(src, { byId, measured: c.measure ? c.measure(src) : null });
    if (!el.ok) { dropped.push({ intent, reason: el.reason }); continue; }
    out.push({ intent, mediaType: INTENTS[intent].mediaType, preset: INTENTS[intent].preset, sourceAssetId: src.id, subject: clean(r.subject, LIMITS.subjectChars), why: clean(r.why, 160) });
  }
  return { requests: out, dropped };
}
function promptFor(req) { return `${INTENTS[req.intent].prompt}${req.subject ? `. Subject: ${req.subject}` : ''}`.slice(0, 400); }

// (there is no executor here: premium media is made only by the durable premium job of a generation -- lib/premium-jobs.js)

module.exports = { ROLE_ORDER, ROLE_INTENT, planArc, INTENTS, INTENT_NAMES, LIMITS, REASONS, presets, normalizeEndpoint, paramsFor, providerState, requestedIntents, planForBrief, planForChoice, status, sourceEligibility, validateRequests, promptFor };
