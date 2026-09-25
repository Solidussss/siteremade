'use strict';
// Concrete quality rubric + whole-site review. The rubric is NOT "is it
// beautiful?": it is eight named categories, each PASS / NEEDS_REPAIR / FAIL
// (or UNVERIFIED when something genuinely was not measured), backed by
// checkable defects with a target and a proposed repair.
//
// The deterministic checks here are free and always run. An optional strong-
// model critique (one call, budget-gated) can add defects, but it is asked
// concrete questions (see CRITIQUE_CRITERIA), never for an overall opinion.

const { STATES, allSections, stateOf } = require('./section-state');
const { SECTION_VARIANTS } = require('./vocab');

const CATEGORIES = ['VISUAL_COHERENCE', 'IMAGE_QUALITY', 'TYPOGRAPHY', 'LAYOUT', 'BUSINESS_SPECIFICITY', 'CONVERSION_CLARITY', 'MOBILE_READINESS', 'TECHNICAL_VALIDITY',
  // PREMIUM_COMPOSITION_V2 (page-level composition). Reported NOT_APPLICABLE unless the composition flag is on for the site.
  'VISUAL_PACING', 'SECTION_CONTRAST', 'COMPOSITION_VARIETY', 'CTA_STRENGTH', 'FOOTER_COMPLETION'];
const COMPOSITION_CATEGORIES = ['VISUAL_PACING', 'SECTION_CONTRAST', 'COMPOSITION_VARIETY', 'CTA_STRENGTH', 'FOOTER_COMPLETION'];
// Where a fix pays off most for perceived quality (used to rank the 1-3 repairs we allow).
const IMPACT = { VISUAL_PACING: 2, SECTION_CONTRAST: 2, COMPOSITION_VARIETY: 2, CTA_STRENGTH: 2.5, FOOTER_COMPLETION: 1.5, IMAGE_QUALITY: 3, MOBILE_READINESS: 3, CONVERSION_CLARITY: 3, BUSINESS_SPECIFICITY: 2.5, VISUAL_COHERENCE: 2, LAYOUT: 2, TYPOGRAPHY: 1.5, TECHNICAL_VALIDITY: 3 };

const GENERIC_PHRASES = [/\belevate your\b/i, /\bwhere (quality|innovation|excellence) meets\b/i, /\bunlock (your|the) (full )?potential\b/i, /\bseamless(ly)?\b/i, /\bcutting[- ]edge\b/i, /\bworld[- ]class\b/i, /\bsolutions? tailored\b/i, /\bnext level\b/i, /\bstate[- ]of[- ]the[- ]art\b/i, /\bpassion for excellence\b/i, /\bcommitted to excellence\b/i];
// Claims a site must not make unless the customer supplied them.
const CLAIM_PATTERNS = [/\baward[- ]winning\b/i, /\b\d{1,3}\+? years\b/i, /\bsince (19|20)\d\d\b/i, /\b[45](\.\d)?[- ]?star\b/i, /\b\d[\d,]*\+? (happy |satisfied )?(customers|clients|projects|homes)\b/i, /\bcertified\b/i, /\blicensed (and|&) insured\b/i, /\btrusted by\b/i, /\b#1\b/i, /\bbest in\b/i, /\bguarantee[d]?\b/i];

function copyStrings(node, out, depth) {
  if (depth > 4 || node == null) return out;
  if (typeof node === 'string') { out.push(node); return out; }
  if (Array.isArray(node)) { node.forEach(n => copyStrings(n, out, depth + 1)); return out; }
  if (typeof node === 'object') Object.keys(node).forEach(k => { if (!/^(id|type|variant|slot|url|dataUrl|cacheKey)$/.test(k)) copyStrings(node[k], out, depth + 1); });
  return out;
}
const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();

// ctx: { description, facts:{years,rating,count}, strategy, cfg, premiumEnabled, knownSectionTypes:[...] }
function reviewDirection(direction, ctx) {
  const c = ctx || {};
  const defects = [];
  const add = d => defects.push(Object.assign({ severity: 1, target: { kind: 'site', id: null } }, d));
  const sections = allSections(direction);
  const plan = Array.isArray(direction.imagePlan) ? direction.imagePlan : [];
  const generated = (direction.assets && direction.assets.generated) || {};
  const strategy = c.strategy || {};
  const heroCopy = (direction.copy && direction.copy.headline) || '';

  // ---- TECHNICAL_VALIDITY
  if (!sections.length) add({ category: 'TECHNICAL_VALIDITY', code: 'no_sections', severity: 3, detail: 'no sections were generated' });
  const seen = new Set();
  sections.forEach(({ section }) => {
    if (!section.type) add({ category: 'TECHNICAL_VALIDITY', code: 'section_missing_type', severity: 3, target: { kind: 'section', id: section.id } });
    if (seen.has(section.id)) add({ category: 'TECHNICAL_VALIDITY', code: 'duplicate_section_id', severity: 3, target: { kind: 'section', id: section.id } });
    seen.add(section.id);
    if (c.knownSectionTypes && section.type && !c.knownSectionTypes.includes(section.type)) add({ category: 'TECHNICAL_VALIDITY', code: 'unknown_section_type', severity: 3, target: { kind: 'section', id: section.id }, detail: section.type });
  });

  // ---- IMAGE_QUALITY + VISUAL_COHERENCE (images)
  const heroPlan = plan.find(e => e.slot === 'hero');
  plan.filter(e => e.sourceType === 'generated').forEach(e => {
    const g = generated[e.slot];
    if (!g || g.status === 'error') add({ category: 'IMAGE_QUALITY', code: 'image_failed', severity: e.slot === 'hero' ? 3 : 2, target: { kind: 'image', id: e.slot }, detail: 'funded image did not resolve', repair: { kind: 'regenerate_image', slot: e.slot, fallback: 'use_designed_fallback' } });
    else if (g.evaluation && g.evaluation.poor) add({ category: 'IMAGE_QUALITY', code: 'image_flagged_poor', severity: e.slot === 'hero' ? 3 : 2, target: { kind: 'image', id: e.slot }, detail: (g.evaluation.reasons || []).join(','), repair: { kind: 'regenerate_image', slot: e.slot, fallback: 'use_designed_fallback' } });
    if (c.premiumEnabled && !e.focal) add({ category: 'IMAGE_QUALITY', code: 'missing_focal_point', severity: 1, target: { kind: 'image', id: e.slot }, repair: { kind: 'set_focal', slot: e.slot } });
  });
  if (heroPlan && heroPlan.sourceType !== 'generated' && heroPlan.sourceType !== 'user' && direction.design && direction.design.dimensions && direction.design.dimensions.imageDominance === 'dominant') {
    add({ category: 'IMAGE_QUALITY', code: 'dominant_layout_without_hero_image', severity: 2, target: { kind: 'hero', id: 'hero' }, detail: 'image-dominant layout but no real hero image', repair: { kind: 'swap_hero_layout_text_led' } });
  }
  const kinds = new Set(plan.filter(e => e.sourceType === 'generated' && e.kind).map(e => e.kind));
  if (kinds.size > 1 && strategy.archetype && !['product-led-saas', 'launch-campaign'].includes(strategy.archetype)) add({ category: 'VISUAL_COHERENCE', code: 'mixed_photo_and_abstract_imagery', severity: 1, detail: [...kinds].join('+') });

  // ---- LAYOUT (+ coherence): repeated patterns
  for (let i = 1; i < sections.length; i++) {
    const a = sections[i - 1].section, b = sections[i].section;
    if (a.type && a.type === b.type) add({ category: 'LAYOUT', code: 'adjacent_same_section_type', severity: 2, target: { kind: 'section', id: b.id }, detail: b.type, repair: SECTION_VARIANTS[b.type] ? { kind: 'swap_variant', targetId: b.id } : undefined });
  }
  let run = 1;
  for (let i = 1; i < sections.length; i++) {
    const a = sections[i - 1].section, b = sections[i].section;
    if (a.variant && b.variant && a.variant === b.variant && SECTION_VARIANTS[a.type] && SECTION_VARIANTS[b.type]) { run++; if (run === 3) add({ category: 'VISUAL_COHERENCE', code: 'three_same_variant_in_a_row', severity: 1, target: { kind: 'section', id: b.id }, repair: { kind: 'swap_variant', targetId: b.id } }); } else run = 1;
  }
  const cardish = new Set(['features', 'testimonial', 'team', 'testimonialsGrid', 'services']);
  let cardRun = 0;
  sections.forEach(({ section }) => { cardRun = cardish.has(section.type) ? cardRun + 1 : 0; if (cardRun === 3) add({ category: 'LAYOUT', code: 'three_consecutive_card_sections', severity: 1, target: { kind: 'section', id: section.id }, repair: SECTION_VARIANTS[section.type] ? { kind: 'swap_variant', targetId: section.id } : undefined }); });
  if (sections.length >= 3 && sections[0] && sections[1] && !['proof', 'metrics', 'services', 'features', 'productShowcase', 'about', 'process'].includes(sections[0].section.type) && sections.length > 2) { /* anchor check kept lenient */ }

  // ---- TYPOGRAPHY
  if (c.premiumEnabled && !(direction.design && direction.design.premiumTokens)) add({ category: 'TYPOGRAPHY', code: 'no_design_tokens', severity: 2, detail: 'site has no coherent token system', repair: { kind: 'apply_tokens' } });
  if (heroCopy.length > 80) add({ category: 'TYPOGRAPHY', code: 'hero_headline_too_long', severity: 1, detail: `${heroCopy.length} chars`, target: { kind: 'hero', id: 'hero' }, repair: { kind: 'rewrite_copy', targetId: 'hero', field: 'headline', maxChars: 60 } });

  // ---- BUSINESS_SPECIFICITY: generic phrasing + unsupported claims
  const description = norm(c.description);
  const facts = c.facts || {};
  const scan = (text, target) => {
    GENERIC_PHRASES.forEach(re => { const m = re.exec(text); if (m) add({ category: 'BUSINESS_SPECIFICITY', code: 'generic_phrase', severity: 1, target, detail: m[0], repair: { kind: 'rewrite_copy', targetId: target.id, field: 'body' } }); });
    CLAIM_PATTERNS.forEach(re => {
      const m = re.exec(text); if (!m) return;
      const claim = norm(m[0]);
      const supported = description.includes(claim) || (/years/.test(claim) && facts.years) || (/star/.test(claim) && facts.rating) || (/(customers|clients|projects|homes)/.test(claim) && facts.count);
      if (!supported) add({ category: 'BUSINESS_SPECIFICITY', code: 'unsupported_claim', severity: 3, target, detail: m[0], repair: { kind: 'rewrite_copy', targetId: target.id, field: 'body', removeClaim: m[0] } });
    });
  };
  if (direction.copy) scan(copyStrings(direction.copy, [], 0).join(' . '), { kind: 'hero', id: 'hero' });
  sections.forEach(({ section }) => { if (section.copy) scan(copyStrings(section.copy, [], 0).join(' . '), { kind: 'section', id: section.id }); });
  const headlines = [heroCopy].concat(sections.map(({ section }) => section.copy && section.copy.headline)).filter(Boolean).map(norm);
  const dup = headlines.find((h, i) => headlines.indexOf(h) !== i);
  if (dup) add({ category: 'BUSINESS_SPECIFICITY', code: 'repeated_headline', severity: 1, detail: dup });

  // Testimonial sections are only legitimate if the customer supplied testimonials. The generator has no input for them, so a
  // testimonial section on a fresh site is invented social proof (Part 39) and is removed.
  sections.forEach(({ section }) => {
    if (['testimonial', 'testimonialsGrid'].includes(section.type) && !/testimonial|review|customers? (say|said)|quote/i.test(c.description || '')) add({ category: 'BUSINESS_SPECIFICITY', code: 'fabricated_testimonial', severity: 3, target: { kind: 'section', id: section.id }, detail: 'testimonial section without customer-supplied testimonials', repair: { kind: 'remove_section', targetId: section.id } });
  });

  // ---- CONVERSION_CLARITY
  const CONVERSION_SECTIONS = ['contact', 'ctaBanner', 'reservationCta'];
  const hasPath = sections.some(({ section }) => CONVERSION_SECTIONS.includes(section.type) || section.module);
  if (!hasPath) add({ category: 'CONVERSION_CLARITY', code: 'no_conversion_path', severity: 3, repair: { kind: 'insert_cta_section' } });
  const ctas = new Set([direction.copy && direction.copy.cta].concat(sections.map(({ section }) => section.copy && section.copy.ctaLabel)).filter(Boolean).map(norm));
  if (ctas.size > 3) add({ category: 'CONVERSION_CLARITY', code: 'too_many_cta_labels', severity: 2, detail: [...ctas].join(' | ') });

  // ---- MOBILE_READINESS (measured by the client at phone width; never assumed)
  const mobile = direction.mobileReport;
  if (!mobile || !Array.isArray(mobile.widths) || !mobile.widths.length) {
    add({ category: 'MOBILE_READINESS', code: 'mobile_not_measured', severity: 0, detail: 'no phone-width measurement was supplied' });
  } else mobile.widths.forEach(w => {
    if (w.overflowX) add({ category: 'MOBILE_READINESS', code: 'horizontal_overflow', severity: 3, detail: `${w.width}px`, target: { kind: 'site', id: null } });
    if (w.heroHeadlineLines > 5) add({ category: 'MOBILE_READINESS', code: 'hero_headline_wraps_too_much', severity: 2, detail: `${w.heroHeadlineLines} lines at ${w.width}px`, target: { kind: 'hero', id: 'hero' }, repair: { kind: 'rewrite_copy', targetId: 'hero', field: 'headline', maxChars: 50 } });
    if (w.smallTapTargets > 0) add({ category: 'MOBILE_READINESS', code: 'small_tap_targets', severity: 1, detail: `${w.smallTapTargets} at ${w.width}px` });
    if (w.badImageCrops > 0) add({ category: 'MOBILE_READINESS', code: 'bad_image_crop', severity: 2, detail: `${w.badImageCrops} at ${w.width}px`, repair: { kind: 'set_focal_all' } });
  });

  // ---- PREMIUM_COMPOSITION_V2 categories: the planned page sequence is checked with the same rules that produced it
  if (c.compositionV2) {
    const tokens = direction.design && direction.design.premiumTokens;
    const composed = !!(tokens && tokens.vars && tokens.vars['--site-comp-brand-bg']);
    if (!composed) add({ category: 'COMPOSITION_VARIETY', code: 'composition_not_applied', severity: 2, detail: 'site has no page-composition surfaces', repair: { kind: 'apply_tokens' } });
    else {
      const stamp = require('./comp-stamp');
      // The homepage is one visual sequence; other pages are planned on their own, so evaluate the home page only.
      const secs = ((direction.pages && direction.pages[0] && direction.pages[0].sections) || []).filter(Boolean);
      const hasImg = secs.map(sec => plan.some(e => e.section === sec.id && (e.sourceType === 'generated' || e.sourceType === 'user')));
      const plan2 = stamp.planFor(direction, secs, hasImg, { variant: direction.design && direction.design.dimensions && direction.design.dimensions.hero, hasImage: !!(heroPlan && (heroPlan.sourceType === 'generated' || heroPlan.sourceType === 'user')) });
      require('./composition').evaluateComposition(plan2).forEach(d => add(Object.assign({}, d, d.code === 'no_final_cta' ? { repair: { kind: 'insert_cta_section' } } : {})));
    }
  }
  return summarize(defects, mobile && mobile.widths && mobile.widths.length ? true : false, !!c.compositionV2);
}

function summarize(defects, mobileMeasured, compositionOn) {
  const categories = {};
  CATEGORIES.forEach(cat => {
    const ds = defects.filter(d => d.category === cat && d.severity > 0);
    categories[cat] = ds.some(d => d.severity >= 3) ? 'FAIL' : ds.length ? 'NEEDS_REPAIR' : 'PASS';
  });
  if (!compositionOn) COMPOSITION_CATEGORIES.forEach(k => { categories[k] = 'NOT_APPLICABLE'; });
  if (!mobileMeasured) categories.MOBILE_READINESS = defects.some(d => d.category === 'MOBILE_READINESS' && d.severity > 0) ? categories.MOBILE_READINESS : 'UNVERIFIED';
  return { categories, defects, passing: Object.values(categories).every(v => v === 'PASS' || v === 'UNVERIFIED' || v === 'NOT_APPLICABLE') };
}

// ---- optional strong-model critique (one call, concrete criteria) -----------
const CRITIQUE_CRITERIA = [
  'Are two or more sections visually identical in structure back to back?',
  'Does any image look like a website/app screenshot, UI mockup, or contain readable text/logos?',
  'Do the images share one lighting/colour/realism style, or do they look like different sources?',
  'Does any image crop cut off its subject or leave the subject off-frame at desktop or phone width?',
  'Is there more than one font pairing, or headings that vary in weight/tracking without reason?',
  'Is spacing between sections uneven for no hierarchy reason (huge gaps, cramped blocks)?',
  'Does any copy read as generic AI filler that could describe any business?',
  'Does any copy state a fact (years, ratings, counts, certifications, awards, guarantees) not present in the customer description?',
  'Is there one clear primary call to action, or several competing ones?',
];
const CRITIQUE_TOOL = {
  name: 'report_defects', description: 'Report up to 5 concrete, checkable defects. Return an empty list if none.',
  input_schema: { type: 'object', additionalProperties: false, required: ['defects'], properties: { defects: { type: 'array', maxItems: 5, items: { type: 'object', additionalProperties: false, required: ['category', 'code', 'severity', 'targetKind', 'evidence'], properties: {
    category: { type: 'string', enum: CATEGORIES }, code: { type: 'string', maxLength: 60 }, severity: { type: 'integer', enum: [1, 2, 3] },
    targetKind: { type: 'string', enum: ['hero', 'section', 'image', 'site'] }, targetId: { type: 'string', maxLength: 80 }, evidence: { type: 'string', maxLength: 240 },
    repairKind: { type: 'string', enum: ['swap_variant', 'rewrite_copy', 'regenerate_image', 'set_focal', 'use_designed_fallback', 'none'] } } } } } },
};
function summarizeForCritique(direction, ctx) {
  const lines = [];
  lines.push(`Business: ${(ctx && ctx.description) || ''}`);
  lines.push(`Archetype: ${ctx && ctx.strategy && ctx.strategy.archetype}; goal: ${ctx && ctx.strategy && ctx.strategy.conversionGoal}`);
  lines.push(`Hero headline: ${(direction.copy && direction.copy.headline) || ''}`);
  allSections(direction).forEach(({ section }, i) => lines.push(`${i + 1}. ${section.type}/${section.variant || '-'} id=${section.id} headline="${(section.copy && section.copy.headline) || ''}"`));
  (direction.imagePlan || []).forEach(e => lines.push(`image ${e.slot}: ${e.sourceType}${e.kind ? '/' + e.kind : ''} ${e.aspectRatio || ''}`));
  return lines.join('\n').slice(0, 5000);
}
function buildCritiquePrompt(direction, ctx) {
  return { system: 'You review a generated small-business website against concrete criteria and report checkable defects only. Do not give an overall opinion. Do not invent problems: report only what the summary supports.', user: `Criteria:\n- ${CRITIQUE_CRITERIA.join('\n- ')}\n\nSite summary:\n${summarizeForCritique(direction, ctx)}` };
}
function parseCritique(input) {
  if (!input || !Array.isArray(input.defects)) return [];
  return input.defects.slice(0, 5).filter(d => d && CATEGORIES.includes(d.category)).map(d => ({
    category: d.category, code: String(d.code || 'model_defect').slice(0, 60), severity: [1, 2, 3].includes(d.severity) ? d.severity : 1,
    target: { kind: d.targetKind || 'site', id: d.targetId || null }, detail: String(d.evidence || '').slice(0, 240), source: 'model_critique',
    repair: d.repairKind && d.repairKind !== 'none' ? { kind: d.repairKind, targetId: d.targetId || null, slot: d.targetKind === 'image' ? d.targetId : undefined } : undefined,
  }));
}

module.exports = { CATEGORIES, IMPACT, GENERIC_PHRASES, CLAIM_PATTERNS, CRITIQUE_CRITERIA, CRITIQUE_TOOL, reviewDirection, summarize, buildCritiquePrompt, parseCritique, summarizeForCritique };
