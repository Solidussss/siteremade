'use strict';
// Image role planning, source priority, composition-aware prompts, aspect
// handling, focal points, budget tiers and retry policy.
//
// The rule this module enforces: NEVER "generate a random relevant image".
// Every slot gets an explicit role BEFORE anything is generated, a source
// decision by priority, a composition brief written for the actual slot
// (ratio, subject position, negative space for the headline), a budget
// tier, and a focal point so crops do not fall back to `center` blindly.
//
// Honesty rules (Part 39): no fabricated staff, customers or projects. Team
// tiles and project galleries are NOT filled with generated "people" or
// "projects" -- real media is preferred and absent real media the slot is
// left to the designed treatment.

const { imageCostUsd } = require('./cost-ledger');
const NEGATIVE_TAIL = 'Photograph or graphic only. Absolutely no text, lettering, signage, captions, logos or watermarks. No browser windows, website or app interface, buttons, dashboards, charts, phone or laptop screens showing content, or UI of any kind. No collage of panels. No identifiable faces.';
const ABSTRACT_NEGATIVE_TAIL = 'Abstract graphic only. No text, lettering, logos or watermarks. No interface, buttons, dashboards, charts, screens or UI of any kind. No people.';

const ASPECT_SIZE = { '1:1': '1024x1024', '16:9': '1536x1024', '3:2': '1536x1024', '4:3': '1536x1024', '4:5': '1024x1536', '3:4': '1024x1536', '9:16': '1024x1536' };
const ROLE_ASPECT = { hero: '16:9', product: '4:3', editorial: '16:9', about: '4:5', service: '4:3', gallery: '4:3', team: '4:5', decorative: '4:3' };
function providerSizeFor(aspect) { return ASPECT_SIZE[aspect] || '1024x1024'; }
const ratioOf = a => { const [w, h] = String(a || '1:1').split(':').map(Number); return w > 0 && h > 0 ? w / h : 1; };

// Client slot ({role, sectionType, slot}) -> premium role.
function classifySlot(slot) {
  const st = slot.sectionType || '', role = slot.role || '';
  if (role === 'hero') return 'hero';
  if (st === 'productShowcase' || role === 'product') return 'product';
  if (st === 'imageLedEditorial') return 'editorial';
  if (st === 'team') return 'team';
  if (st === 'about' || role === 'team') return 'about';
  if (st === 'testimonial' || st === 'testimonialsGrid') return 'testimonial';
  if (st === 'gallery' || st === 'caseStudies' || role === 'gallery') return 'gallery';
  if (st === 'services' || st === 'features') return 'service';
  return 'decorative';
}

// Budget tier per role (hero > primary > decorative).
const ROLE_TIER = { hero: 'hero', product: 'primary', editorial: 'primary', about: 'primary', service: 'primary', gallery: 'primary', team: 'primary', decorative: 'decorative', testimonial: 'none' };
const ROUTE_LADDER = {
  hero: [['premium', 'high'], ['premium', 'medium'], ['support', 'high'], ['support', 'medium']],
  primary: [['premium', 'medium'], ['support', 'high'], ['support', 'medium'], ['support', 'low']],
  decorative: [['support', 'medium'], ['support', 'low']],
};
// The first few primary images are 'normal' priority (funded up to the soft budget); further ones are 'optional' and stop at
// the first-draft cost target, so an image-heavy layout cannot quietly spend the whole soft budget.
const MAX_NORMAL_PRIMARY = 2;
const ABSTRACT_ARCHETYPES = ['product-led-saas', 'launch-campaign'];
const GALLERY_GENERATION_OK = ['hospitality', 'editorial-brand', 'ecommerce-showcase'];

function uploadQuality(meta) {
  if (!meta) return 'unknown';
  const w = Number(meta.width) || 0, h = Number(meta.height) || 0;
  if (w && h && Math.min(w, h) < 500) return 'poor';
  if (w && h && w * h < 400000) return 'poor';
  return 'ok';
}

// How much of the source would `object-fit: cover` throw away for this slot?
function cropAdvice(srcW, srcH, slotAspect) {
  const src = srcW > 0 && srcH > 0 ? srcW / srcH : ratioOf(slotAspect), slot = ratioOf(slotAspect);
  const loss = 1 - Math.min(src, slot) / Math.max(src, slot);
  return { loss: Math.round(loss * 100) / 100, recommend: loss > 0.5 ? 'contain' : 'cover' };
}

// Focal point (0..1) so `object-position` is meaningful. Prompts place the
// subject deliberately, so the focal point is known from the brief without
// any paid vision call. For real uploads (no brief) faces/subjects sit in
// the upper-middle of portrait crops and mid-frame for landscape.
function focalFor(role, opts) {
  const o = opts || {};
  let x = 0.5, y = 0.5;
  if (role === 'hero' || role === 'editorial') { x = o.subjectSide === 'left' ? 0.28 : o.subjectSide === 'center' ? 0.5 : 0.72; y = 0.55; }
  else if (role === 'about' || role === 'team') { x = 0.5; y = 0.38; }
  else if (role === 'product') { x = 0.5; y = 0.5; }
  else if (role === 'gallery' || role === 'service') { x = 0.5; y = 0.5; }
  return { x, y, objectPosition: `${Math.round(x * 100)}% ${Math.round(y * 100)}%` };
}

function isAbstractSlot(role, strategy) {
  return role === 'decorative' || (ABSTRACT_ARCHETYPES.includes(strategy.archetype) && (role === 'hero' || role === 'product' || role === 'editorial'));
}

function compositionFor(role, ctx) {
  const side = ctx.textSide || 'left';
  const subjectSide = side === 'left' ? 'right' : side === 'right' ? 'left' : 'center';
  switch (role) {
    case 'hero':
      return { subjectSide, text: subjectSide === 'center'
        ? 'Wide landscape frame, single clear subject centered with calm negative space above and below for a headline'
        : `Wide landscape frame, main subject occupying the ${subjectSide} 55% of the frame, clean uncluttered negative space on the ${side} for a headline` };
    case 'editorial':
      return { subjectSide: 'right', text: 'Wide landscape frame, subject placed on the right third line, strong negative space on the left' };
    case 'product':
      return { subjectSide: 'center', text: '4:3 frame, one clear focal subject slightly off-centre, shallow depth of field, soft uncluttered background' };
    case 'about':
      return { subjectSide: 'center', text: '4:5 portrait crop, subject in the upper two-thirds, calm depth, foreground softly out of focus' };
    case 'service': case 'gallery':
      return { subjectSide: 'center', text: '4:3 close crop, the detail fills the frame, simple background, clean edges' };
    default:
      return { subjectSide: 'center', text: '4:3 frame, balanced composition with soft negative space' };
  }
}

function subjectFor(role, strategy, art, abstract) {
  const s = strategy.imageSubjects || {};
  if (abstract) {
    const pal = art.palette || {};
    return `Abstract brand graphic: layered flowing forms and soft depth in ${pal.temperature || 'balanced'} ${pal.tone || ''} tones drawn from the brand colour, suggesting ${strategy.businessType || 'the business'}`.replace(/\s+/g, ' ');
  }
  if (role === 'hero' || role === 'editorial' || role === 'product') return s.hero || 'a clean, well-lit environment appropriate to the business';
  if (role === 'about') return s.context || s.hero;
  return s.detail || s.hero;
}

// spec: { role, aspectRatio, textSide, simplified }
function buildImagePrompt(spec, strategy, art) {
  const abstract = isAbstractSlot(spec.role, strategy);
  const comp = compositionFor(spec.role, spec);
  const subject = subjectFor(spec.role, strategy, art, abstract);
  const loc = strategy.location && !abstract ? `, subtle ${strategy.location} regional setting (no landmarks)` : '';
  if (spec.simplified) {
    // Retry variant: fewer constraints, single subject -- a different approach, not the same prompt again.
    return `${subject}${loc}. Simple, uncluttered composition, ${spec.aspectRatio || ROLE_ASPECT[spec.role]} frame. ${abstract ? ABSTRACT_NEGATIVE_TAIL : NEGATIVE_TAIL}`;
  }
  const style = abstract
    ? `${art.lighting}; ${art.colorMood}; clean, modern, premium`
    : `${art.photographyStyle}; ${art.lighting}; ${art.colorMood}; ${art.realismLevel}; ${art.humanPresence}; ${art.contrast} contrast`;
  return `${subject}${loc}. ${comp.text}. ${style}. Consistent with the rest of the site: ${art.subjectTreatment}. ${abstract ? ABSTRACT_NEGATIVE_TAIL : NEGATIVE_TAIL}`;
}

// Guard against the "UI mockup as a photo" failure: positive instructions
// must not ask for interface/browser/dashboard content. The negative tail is
// removed before checking so the words appear only as prohibitions there.
const UI_WORDS = /\b(browser|website|web page|webpage|landing page|dashboard|app screen|screenshot|mockup|mock-up|user interface|ui|interface|button|buttons|wireframe|navbar|laptop screen|phone screen)\b/i;
function lintImagePrompt(prompt) {
  const p = String(prompt || '');
  // Prohibitions ("No dashboards...") are allowed to name UI words; only positive instructions are checked. Sentence-based so a
  // tail truncated by a length limit cannot be misread as a request.
  const body = p.split(/(?<=[.!?])\s+/).filter(sent => !/^\s*(absolutely\s+)?no\b/i.test(sent)).join(' ');
  const problems = [];
  const m = UI_WORDS.exec(body); if (m) problems.push(`asks for interface content: "${m[0]}"`);
  if (!/no text|no text,/i.test(p)) problems.push('missing explicit no-text instruction');
  if (!/\b(16:9|4:3|4:5|1:1|3:4|landscape|portrait|frame|crop)\b/i.test(p)) problems.push('no composition/crop guidance');
  return { ok: problems.length === 0, problems };
}

// ---- cheap, deterministic image evaluation (no paid vision call) -----------
function decodeHead(dataUrl) {
  const m = /^data:(image\/[a-z+]+);base64,(.+)$/i.exec(String(dataUrl || ''));
  if (!m) return null;
  const b64 = m[2];
  let bytes;
  try {
    if (typeof Buffer !== 'undefined') bytes = Buffer.from(b64.slice(0, 64), 'base64');
    else { const bin = atob(b64.slice(0, 64)); bytes = Uint8Array.from(bin, c => c.charCodeAt(0)); }
  } catch (e) { return null; }
  return { mime: m[1].toLowerCase(), bytes, byteLength: Math.floor(b64.length * 3 / 4) };
}
function evaluateImageDeterministic(dataUrl, requestedAspect) {
  const head = decodeHead(dataUrl);
  const reasons = [];
  if (!head) return { ok: false, poor: true, reasons: ['not_an_image'] };
  let width = 0, height = 0;
  if (head.mime === 'image/png' && head.bytes.length >= 24) {
    width = ((head.bytes[16] << 24) | (head.bytes[17] << 16) | (head.bytes[18] << 8) | head.bytes[19]) >>> 0;
    height = ((head.bytes[20] << 24) | (head.bytes[21] << 16) | (head.bytes[22] << 8) | head.bytes[23]) >>> 0;
  }
  if (width && height) {
    const bpp = head.byteLength / (width * height);
    if (head.mime === 'image/png' && bpp < 0.05) reasons.push('flat_or_blank');
    const want = ratioOf(requestedAspect), got = width / height;
    // provider sizes are fixed (3:2 / 2:3 / 1:1): the check is that orientation matches the request.
    if (want > 1.05 && got < 1) reasons.push('orientation_mismatch');
    if (want < 0.95 && got > 1) reasons.push('orientation_mismatch');
  } else if (head.byteLength < 8000) reasons.push('tiny_payload');
  return { ok: reasons.length === 0, poor: reasons.length > 0, reasons, width, height, byteLength: head.byteLength };
}

// After a poor result: ONE retry with a genuinely different (simplified) prompt,
// then stop and fall back. Never the same concept again.
function retryDecision(state, cfg) {
  const attempt = state.attempt || 0;
  if (!state.evaluation || !state.evaluation.poor) return { action: 'accept' };
  if (attempt < cfg.retry.maxImageRetries) return { action: 'retry', simplifiedPrompt: true, attempt: attempt + 1 };
  return { action: 'fallback', to: state.hasAlternateSource ? 'alternate_source' : 'designed' };
}

// ---- allocation ---------------------------------------------------------------
function routeOption(cfg, tierName, kind, quality, aspect) {
  const model = kind === 'premium' ? cfg.models.imagePremium : cfg.models.imageSupport;
  return { id: `${kind}:${quality}`, kind, model, quality, estimatedUsd: imageCostUsd(cfg, { model: kind, quality, aspectRatio: aspect }) };
}

// input: { slots:[{slot,role,sectionType,assetId,aspectRatio,rank,cacheKey,...}], strategy, art, uploads:[{id,type,width,height}],
//          cfg, governor, credits?:{remaining, support, premium}, heroTextSide }
function allocateImages(input) {
  const { slots, strategy, art, cfg, governor } = input;
  const uploads = input.uploads || [];
  const credits = input.credits || null;
  let committed = 0, primaryFunded = 0, creditsLeft = credits && Number.isFinite(credits.remaining) ? credits.remaining : Infinity;
  const notes = [];
  const enriched = slots.map((s, i) => ({ s, i, role: classifySlot(s) }));
  const order = enriched.slice().sort((a, b) => {
    const ta = { hero: 0, primary: 1, decorative: 2, none: 3 }[ROLE_TIER[a.role]] - { hero: 0, primary: 1, decorative: 2, none: 3 }[ROLE_TIER[b.role]];
    return ta || ((a.s.rank || 0) - (b.s.rank || 0)) || a.i - b.i;
  });
  const out = new Array(slots.length);
  order.forEach(({ s, i, role }) => {
    const aspect = s.aspectRatio || ROLE_ASPECT[role] || '1:1';
    const base = { slot: s.slot, role, premiumRole: role, aspectRatio: aspect, providerSize: providerSizeFor(aspect), tier: ROLE_TIER[role], cacheKey: s.cacheKey };
    const focal = focalFor(role, { subjectSide: compositionFor(role, { textSide: input.heroTextSide }).subjectSide });
    // 1/2. real images first
    const own = s.assetId ? uploads.find(u => u.id === s.assetId) : null;
    if (s.assetId) {
      const q = uploadQuality(own);
      if (q !== 'poor' || ROLE_TIER[role] === 'decorative') {
        const adv = own ? cropAdvice(own.width, own.height, aspect) : { loss: 0, recommend: 'cover' };
        out[i] = Object.assign(base, { sourceType: 'user', reason: 'real_image_supplied', focal: focalFor(role, { subjectSide: 'center' }), crop: adv, estimatedUsd: 0 });
        return;
      }
      notes.push(`${s.slot}: supplied image is low resolution; considering a generated alternative`);
    }
    // never fabricate people / projects / testimonials
    if (role === 'testimonial') { out[i] = Object.assign(base, { sourceType: 'designed', reason: 'no_generated_image_for_testimonials', omitImage: true, estimatedUsd: 0 }); return; }
    if (role === 'team') { out[i] = Object.assign(base, { sourceType: 'designed', reason: 'real_team_photos_only', omitImage: true, estimatedUsd: 0 }); return; }
    if (role === 'gallery' && !GALLERY_GENERATION_OK.includes(strategy.archetype)) { out[i] = Object.assign(base, { sourceType: 'designed', reason: 'real_project_media_only', omitImage: true, estimatedUsd: 0 }); return; }
    // 3/4. generated photography or abstract graphic, by budget tier
    const tier = ROLE_TIER[role];
    const cap = cfg.imageTierCaps[tier] != null ? cfg.imageTierCaps[tier] : 0;
    const options = (ROUTE_LADDER[tier] || []).map(([k, q]) => routeOption(cfg, tier, k, q, aspect)).filter(o => o.estimatedUsd <= cap + 1e-9)
      .filter(o => !credits || (o.kind === 'premium' ? credits.premium : credits.support) <= creditsLeft);
    if (!options.length) { out[i] = Object.assign(base, { sourceType: 'designed', reason: credits ? 'credits_or_tier_cap' : 'tier_cap', omitImage: role !== 'hero', estimatedUsd: 0 }); return; }
    const d = governor.decide({ operation: 'image_generation', phase: 'first_draft', priority: tier === 'hero' ? 'critical' : (tier === 'primary' && primaryFunded < MAX_NORMAL_PRIMARY) ? 'normal' : 'optional', estimatedUsd: options[0].estimatedUsd, id: options[0].id, fallbacks: options.slice(1), committedUsd: committed });
    if (!d.allowed) { out[i] = Object.assign(base, { sourceType: 'designed', reason: d.reason, budgetLimitReached: d.budgetLimitReached, estimatedUsd: 0 }); return; }
    const route = d.choice;
    const full = options.find(o => o.id === route.id);
    if (tier === 'primary') primaryFunded++;
    committed += full.estimatedUsd; if (credits) creditsLeft -= (full.kind === 'premium' ? credits.premium : credits.support);
    const abstract = isAbstractSlot(role, strategy);
    const spec = { role, aspectRatio: aspect, textSide: input.heroTextSide || 'left' };
    out[i] = Object.assign(base, {
      sourceType: 'generated', reason: d.reason === 'downgraded' ? 'budget_downgraded_route' : 'funded', kind: abstract ? 'abstract' : 'photo',
      model: full.model, routeKind: full.kind, quality: full.quality, estimatedUsd: full.estimatedUsd, focal,
      prompt: buildImagePrompt(spec, strategy, art), promptSimplified: buildImagePrompt(Object.assign({ simplified: true }, spec), strategy, art),
    });
  });
  return { slots: out, committedUsd: Math.round(committed * 1e6) / 1e6, notes };
}

module.exports = {
  NEGATIVE_TAIL, ABSTRACT_NEGATIVE_TAIL, ROLE_ASPECT, ROLE_TIER, ROUTE_LADDER,
  providerSizeFor, classifySlot, uploadQuality, cropAdvice, focalFor, buildImagePrompt, lintImagePrompt,
  evaluateImageDeterministic, retryDecision, allocateImages, isAbstractSlot,
};
