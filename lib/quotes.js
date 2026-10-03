'use strict';
// QUOTE -> RESERVE -> EXECUTE -> SETTLE. What a planned operation will cost is calculated from the work actually planned
// (lib/pricing.js ACTION_CREDITS), shown to the customer as credits only ("This generation will use 10 credits."),
// confirmed, and only then reserved. Execution spends provider money only inside the operation's provider ceiling
// (lib/provider-budget.js); settlement charges what was delivered and returns the rest.
//
//   build(operation, plan)          -> { operation, items, credits, minCredits, ceilingUsd, message }   pure, deterministic
//   create(db, { accountId, projectId, operation, plan }) -> stored quote (15 minutes)
//   accept(db, { accountId, quoteId }) -> reserves the quote's credits ONCE under 'quote:<id>' (accepting again, a double
//                                       click or a retry returns the same reservation)
//   settle(db, quoteId, { delivered })  -> charges the required items plus the optional ones delivered; refunds the rest
//   fail(db, quoteId)                   -> the work failed: everything reserved goes back
//
// Customers never see provider pricing: no tokens, searches or dollars appear in a quote they receive.
const crypto = require('crypto');
const P = require('./pricing');
const credits = require('./credits');
const { classifyEditRequest } = require('./edit-classifier');

const QUOTE_TTL_MS = 15 * 60 * 1000;
// premium media (lib/media/premium-media.js INTENTS): which credit tier an IMAGE intent costs when nothing else priced it
const PREMIUM_TIER = { image_enhance: 'premium_image', stylized_treatment: 'premium_image', alternate_angle: 'premium_image' };
// every VIDEO intent is one premium clip, priced from its OBSERVED cost whatever a caller says (lib/provider-budget.js
// video_clip: ~2.10 USD observed, 2.25 budgeted -> 12 credits): no path can quote a clip in a cheap tier
const VIDEO_INTENTS = new Set(['cinematic_hero', 'object_motion', 'image_to_video', 'environment_motion', 'premium_transition']);
function clipPrice() { return premiumTier('video', require('./provider-budget').costs().higgsfieldBudget.video_clip); }
const MAX_PREMIUM_PER_GENERATION = 2;
// a premium arc (a cinematic or showcase generation): one line per moment -- hero, takeover, payoff -- each its own credits,
// each charged only when that moment is delivered
const MAX_PREMIUM_EVENTS = 3;
const ROLE_LABEL = { hero: 'Premium hero video', takeover: 'Premium takeover video', payoff: 'Premium payoff video' };
const LABEL = {
  business_generation: 'Business website generation', creative_dom: 'Creative website (art direction, motion, research)', spatial_surcharge: 'Spatial (3D depth) rendering, only if the page uses it',
  creative_direction: 'Another Creative direction', text_update: 'Text or content update', section_update: 'Section update', page_rework: 'Page rework', page_add: 'New page',
  deep_redesign: 'Whole-site redesign', premium_image: 'Premium image enhancement', premium_cinematic: 'Short cinematic media', premium_expensive: 'Extended cinematic media', premium_video_4k: '4K cinematic video',
  image_support: 'Generated picture', image_premium: 'Premium generated picture',
  premium_3d: 'Interactive 3D model (only if it is made)',
};
const item = (code, extra) => Object.assign({ code, label: LABEL[code] || code, credits: P.ACTION_CREDITS[code] }, extra || {});

// which kind of update a request is, deterministically and for free (no model call before the owner confirms)
function updateScope(request, opts) {
  const o = opts || {}; const text = String(request || '').toLowerCase();
  if (o.deep === true) return 'deep_redesign';
  if (/\b(add|create|build|make)\s+(a\s+|an\s+)?(new\s+)?(\w+\s+)?page\b/.test(text)) return 'page_add';
  const c = classifyEditRequest(request);
  if (c.mode === 'deep') return c.scope === 'site' ? 'deep_redesign' : c.scope === 'page' ? 'page_rework' : 'section_update';
  if (c.signals.structural || /\b(section|layout|redesign|rearrange|reorder)\b/.test(text)) return 'section_update';
  return 'text_update';
}
// What a premium asset is priced at, from its BUDGETED provider cost (lib/provider-budget.js higgsfieldBudget): the
// credits whose provider-spend ceiling (credits x USD_PER_CREDIT_CEILING) covers it, in the defined tiers -- image 1,
// cinematic 3, extended 5 -- and, above those, the video-clip tier at max(its 11-credit floor, the credits the cost needs).
// A premium video clip (~2.10 USD observed, 2.25 budgeted) -> 12 credits. Never under the cost. -> { code, credits } | null
const MAX_PREMIUM_CREDITS = 40;
function premiumTier(mediaType, budgetUsd) {
  const usd = Math.max(0, Number(budgetUsd) || 0);
  const need = Math.ceil(+(usd / P.USD_PER_CREDIT_CEILING).toFixed(6));
  const order = mediaType === 'image' ? ['premium_image', 'premium_cinematic', 'premium_expensive'] : ['premium_cinematic', 'premium_expensive'];
  const tier = order.find(code => need <= P.ACTION_CREDITS[code]);
  if (tier) return { code: tier, credits: P.ACTION_CREDITS[tier] };
  const credits = Math.max(P.ACTION_CREDITS.premium_video_4k, need);
  return credits <= MAX_PREMIUM_CREDITS ? { code: 'premium_video_4k', credits } : null;
}
const INTENT_LABEL = { cinematic_hero: 'Cinematic hero video', object_motion: 'Product turn video', image_to_video: 'Image-to-video', environment_motion: 'Environment motion video', premium_transition: 'Cinematic transition video', alternate_angle: 'Alternate angle image', image_enhance: 'Enhanced image', stylized_treatment: 'Stylised image treatment' };
function premiumItems(list) {
  const arc = (Array.isArray(list) ? list : []).some(m => m && ROLE_LABEL[m.role]);
  return (Array.isArray(list) ? list : []).slice(0, arc ? MAX_PREMIUM_EVENTS : MAX_PREMIUM_PER_GENERATION).map(m => {
    const clip = m && VIDEO_INTENTS.has(m.intent) ? clipPrice() : null;
    const tier = clip ? clip.code : m && P.ACTION_CREDITS[m.tier] && /^premium_/.test(m.tier) ? m.tier : m && m.extended ? 'premium_expensive' : PREMIUM_TIER[m && m.intent];
    // (a computed price is never below the tier's own floor -- and a video clip never below its observed-cost price)
    const floor = clip ? clip.credits : tier && P.ACTION_CREDITS[tier];
    const credits = tier && Number.isInteger(m.credits) && m.credits >= floor ? m.credits : floor;
    // (a premium item carries its validated source -- the stored picture it transforms -- so execution never trusts the
    // browser again; publicView never shows it)
    return tier ? item(tier, Object.assign({ credits, intent: m.intent, optional: !!(m && m.optional), label: `${(arc && ROLE_LABEL[m.role]) || INTENT_LABEL[m.intent] || LABEL[tier]} (premium media${m && m.optional ? ', only if it is made' : ''})` }, ROLE_LABEL[m.role] ? { role: m.role } : {}, m.source ? { source: m.source } : {})) : null;
  }).filter(Boolean);
}

// THE CREATIVE WEBSITE EDITOR's AI changes (the Client App, lib/creative-editor.js): one line, priced like the update of
// the same size -- a rewrite 1, a scene 2, a rebuild of several scenes 3, the whole page 5 -- carrying what was quoted
// (the scenes, the field, the owner's words) so the change that runs is exactly the one that was priced. publicView never shows it.
const CREATIVE_EDIT = { 'ai-text': ['text_update', 'AI rewrite'], 'ai-scene': ['section_update', 'Scene redesign'], 'ai-rebuild': ['page_add', 'Rebuild of several scenes'], 'ai-site': ['deep_redesign', 'Whole-page redesign'] };
// operation: business_generation | creative_generation | creative_direction | website_update | premium_media | image | creative_3d | creative_edit
function build(operation, plan) {
  const p = plan || {}; let items = [];
  switch (operation) {
    case 'business_generation': items = [item('business_generation')]; break;
    // (premium media the brief asked for is part of this one quote, charged only if it is delivered)
    case 'creative_generation': items = [item('creative_dom')].concat(p.spatialPossible ? [item('spatial_surcharge', { optional: true })] : [], premiumItems((p.premium || []).map(m => Object.assign({}, m, { optional: true })))); break;
    case 'creative_direction': items = [item('creative_direction')].concat(p.spatialPossible ? [item('spatial_surcharge', { optional: true })] : []); break;
    case 'website_update': items = [item(updateScope(p.request, p))]; break;
    // (premium media is charged only for what is delivered: a failed or declined asset costs nothing)
    case 'premium_media': items = premiumItems((p.media || []).map(m => Object.assign({}, m, { optional: true }))); break;
    case 'image': items = [item(p.premium ? 'image_premium' : 'image_support')]; break;
    case 'creative_edit': { const e = CREATIVE_EDIT[p.kind]; if (!e) throw new Error('unknown Creative edit'); items = [item(e[0], { label: e[1], kind: p.kind, target: p.target || {} })]; break; }
    // TRUE 3D (lib/three-d): one model, made from the owner's own upload. Its credits are NOT a fixed price list entry:
    // they are computed by lib/three-d/cost.js from what the model costs to make (provider + processing, with the same
    // safety margin and per-credit ceiling as every premium asset) and handed in here -- never under that cost, never over
    // the most a single premium asset may be. Charged only if the model is delivered; the item carries its validated
    // source (the stored upload) so nothing is taken from the browser again at execution. publicView never shows it.
    case 'creative_3d': {
      const n = Number(p.credits);
      if (!Number.isInteger(n) || n < 1 || n > MAX_PREMIUM_CREDITS || n < Math.ceil(+((Number(p.budgetUsd) || 0) / P.USD_PER_CREDIT_CEILING).toFixed(6))) throw new Error('a 3D model has no valid price');
      if (!p.source || !/^[a-f0-9]{64}$/.test(p.source.ref || '')) throw new Error('a 3D model has no source');
      items = [item('premium_3d', { credits: n, optional: true, intent: 'image_to_3d', source: p.source, sectionId: p.sectionId || '', composition: p.composition || 'scroll-rotate' })];
      break;
    }
    default: throw new Error(`unknown operation ${operation}`);
  }
  if (!items.length) throw new Error('nothing to quote');
  const total = items.reduce((n, i) => n + i.credits, 0);
  const min = items.filter(i => !i.optional).reduce((n, i) => n + i.credits, 0);
  return { operation, items, credits: total, minCredits: min, ceilingUsd: P.providerCeilingUsd(total), message: messageFor(operation, total, min) };
}
function messageFor(operation, total, min) {
  const noun = operation === 'website_update' || operation === 'creative_edit' ? 'update' : operation === 'premium_media' ? 'media' : 'generation';
  if (operation === 'premium_media') return `This premium media will use up to ${total} credit${total === 1 ? '' : 's'} -- only for media that is delivered.`;
  if (operation === 'creative_3d') return `This 3D model will use ${total} credit${total === 1 ? '' : 's'} -- only if the model is made.`;
  return min === total ? `This ${noun} will use ${total} credit${total === 1 ? '' : 's'}.` : `This ${noun} will use up to ${total} credits (${min} if the optional parts are not used).`;
}
// what the customer's screen gets (no internal ceiling)
function publicView(q) { return { id: q.id, operation: q.operation, items: q.items.map(i => Object.assign({ code: i.code, label: i.label, credits: i.credits, optional: !!i.optional }, i.role ? { role: i.role } : {})), credits: q.credits, minCredits: q.minCredits, message: q.message, expiresAt: q.expiresAt, status: q.status }; }

function iso(d) { return (d instanceof Date ? d : new Date(d || Date.now())).toISOString(); }
function fromRow(r) {
  if (!r) return null;
  return { id: r.id, accountId: r.account_id, projectId: r.project_id, operation: r.operation, items: JSON.parse(r.items_json), credits: r.credits, minCredits: r.min_credits, ceilingUsd: r.ceiling_usd, status: r.status, opId: r.op_id, expiresAt: r.expires_at, message: messageFor(r.operation, r.credits, r.min_credits) };
}

function create(db, { accountId, projectId, operation, plan, now }) {
  const q = build(operation, plan); const at = iso(now); const id = 'q_' + crypto.randomBytes(12).toString('base64url');
  const expiresAt = iso(new Date(Date.parse(at) + QUOTE_TTL_MS));
  db.quotes.insert({ id, accountId, projectId, operation, itemsJson: JSON.stringify(q.items), credits: q.credits, minCredits: q.minCredits, ceilingUsd: q.ceilingUsd, expiresAt, createdAt: at });
  return fromRow(db.quotes.find(id));
}
function get(db, accountId, quoteId) { const r = quoteId && db.quotes.find(String(quoteId)); return r && r.account_id === accountId ? fromRow(r) : null; }
const opIdFor = quoteId => `quote:${quoteId}`;

// -> { ok, quote, opId, remaining } | { ok:false, reason: not_found | expired | insufficient | closed, remaining }
function accept(db, { accountId, quoteId, ttlMs, now }) {
  const at = iso(now);
  return db.transaction(() => {
    const q = get(db, accountId, quoteId); if (!q) return { ok: false, reason: 'not_found' };
    const opId = opIdFor(q.id);
    if (q.status === 'accepted' || q.status === 'settled') { const op = credits.findOperation(db, opId); return { ok: true, quote: q, opId, existing: true, status: op && op.status, remaining: credits.available(db, accountId, now).total }; }
    if (q.status !== 'open') return { ok: false, reason: 'closed' };
    if (q.expiresAt <= at) { db.quotes.setStatus(q.id, 'open', 'expired', at); return { ok: false, reason: 'expired' }; }
    const r = credits.reserve(db, { accountId, opId, amount: q.credits, kind: q.operation, ttlMs, ref: q.id, now });
    if (!r.ok) return { ok: false, reason: 'insufficient', remaining: r.remaining, quote: q };
    db.quotes.setStatus(q.id, 'open', 'accepted', at, opId);
    if (db.usage) { db.usage.ensure({ opId, accountId, projectId: q.projectId, operation: q.operation, createdAt: at }); db.usage.add(opId, { quoted: q.credits, reserved: q.credits, ceiling_usd: q.ceilingUsd }, at); }
    return { ok: true, quote: Object.assign({}, q, { status: 'accepted', opId }), opId, remaining: r.remaining };
  });
}
// delivered: the codes of OPTIONAL items that were actually delivered (required items are always charged)
function settle(db, quoteId, { delivered, providerUsd, now } = {}) {
  const at = iso(now); const r = db.quotes.find(quoteId); if (!r) return { ok: false, reason: 'not_found' };
  const q = fromRow(r); if (q.status === 'settled') return { ok: true, already: true };
  const got = Array.isArray(delivered) ? delivered.slice() : [];
  const charge = q.items.reduce((n, i) => { if (!i.optional) return n + i.credits; const k = got.indexOf(i.code); if (k >= 0) { got.splice(k, 1); return n + i.credits; } return n; }, 0);
  const s = credits.settle(db, opIdFor(q.id), { charge, now, providerUsd });
  db.quotes.setStatus(q.id, 'accepted', 'settled', at);
  if (db.usage) db.usage.add(opIdFor(q.id), { settled: s.charged || 0, refunded: s.refunded || 0, status: 'ok' }, at);
  return Object.assign({ ok: s.ok }, s);
}
function fail(db, quoteId, { providerUsd, now } = {}) {
  const at = iso(now); const r = db.quotes.find(quoteId); if (!r) return { ok: false, reason: 'not_found' };
  const out = credits.release(db, opIdFor(quoteId), { now, providerUsd });
  db.quotes.setStatus(quoteId, r.status, 'cancelled', at);
  if (db.usage) db.usage.add(opIdFor(quoteId), { status: 'failed', settled: 0, refunded: r.credits }, at);
  return out;
}

module.exports = { MAX_PREMIUM_EVENTS, premiumTier, QUOTE_TTL_MS, MAX_PREMIUM_PER_GENERATION, PREMIUM_TIER, build, publicView, create, get, accept, settle, fail, opIdFor, updateScope };
