'use strict';
// SITEREMADE_VISUAL_ENGINE_V1 -- the vocabulary layer beneath hero/media rendering.
//
// This is the layer the brief asks for: instead of Claude (or any planner) inventing markup, it reasons in a small,
// validated vocabulary -- a HERO_FAMILY, a MEDIA_COMPOSITION, a DEPTH level -- and SiteRemade already knows how to
// render each one at a premium level. Every normalize* function here takes an arbitrary (possibly planner-supplied,
// possibly missing) value and returns a value from the fixed vocabulary, falling back safely. Nothing here calls a
// model or does I/O; it is pure selection/validation logic, shared by the browser bundle, the server and the export
// compiler (same convention as every other lib/premium/*.js file).
//
// Composition PACING (which sections get 'weight'/visual moments across a whole page) already exists and is
// deliberately NOT duplicated here -- see lib/premium/composition.js (PREMIUM_COMPOSITION_V2), which this file's
// intensity vocabulary maps onto rather than replaces.

// ---- HERO_FAMILY ---------------------------------------------------------------------------------------------
// 8 genuinely distinct hero families. `variant` is the concrete hero layout key renderHero (script.js /
// lib/site-render.js) switches on -- 5 of the 8 map onto hero layouts that already exist (enhanced here with real
// depth/decoration so they read as premium, not "the same grid"); 3 (product-stage, floating-media, quiet-luxury)
// are new layouts built for this pass.
const HERO_FAMILIES = {
  EDITORIAL_SPLIT: { variant: 'split', textWidth: 'balanced', typographyMode: 'display', heroic: false },
  FULL_BLEED_CINEMATIC: { variant: 'fullbleed-image', textWidth: 'narrow', typographyMode: 'display', heroic: true },
  PRODUCT_STAGE: { variant: 'product-stage', textWidth: 'balanced', typographyMode: 'display', heroic: true },
  FLOATING_MEDIA: { variant: 'floating-media', textWidth: 'balanced', typographyMode: 'display', heroic: true },
  TYPOGRAPHIC_STATEMENT: { variant: 'poster', textWidth: 'wide', typographyMode: 'oversized', heroic: true },
  FRAME_WITHIN_FRAME: { variant: 'product-screenshot', textWidth: 'narrow', typographyMode: 'standard', heroic: false },
  COLLAGE: { variant: 'collage', textWidth: 'balanced', typographyMode: 'standard', heroic: false },
  QUIET_LUXURY: { variant: 'quiet-luxury', textWidth: 'narrow', typographyMode: 'restrained', heroic: false },
};
const HERO_FAMILY_KEYS = Object.keys(HERO_FAMILIES);
const VARIANT_TO_FAMILY = Object.fromEntries(HERO_FAMILY_KEYS.map(k => [HERO_FAMILIES[k].variant, k]));
function normalizeHeroFamily(value, fallback) {
  const k = String(value || '').toUpperCase().replace(/[\s-]+/g, '_');
  return HERO_FAMILY_KEYS.includes(k) ? k : (HERO_FAMILY_KEYS.includes(fallback) ? fallback : 'EDITORIAL_SPLIT');
}
function heroVariantFor(family) { return (HERO_FAMILIES[normalizeHeroFamily(family)] || HERO_FAMILIES.EDITORIAL_SPLIT).variant; }
function familyForVariant(variant) { return VARIANT_TO_FAMILY[variant] || null; }

// ---- industry defaults (Parts 4, 22): tendencies, not rigid rules -- a preference ORDER, filtered by what this
// business can actually support (photoLed vs interface-led vs no real media at all). ------------------------------
// Keyed by BUSINESS_GROUNDING's own family names (lib/premium/grounding.js) -- the canonical "what kind of
// business is this" signal already computed for every site, so no separate industry taxonomy is introduced.
const INDUSTRY_HERO_PREFERENCE = {
  saas: ['FRAME_WITHIN_FRAME', 'FLOATING_MEDIA', 'TYPOGRAPHIC_STATEMENT'],
  retail: ['PRODUCT_STAGE', 'COLLAGE', 'FULL_BLEED_CINEMATIC'],
  wellness: ['QUIET_LUXURY', 'EDITORIAL_SPLIT', 'FULL_BLEED_CINEMATIC'],
  hospitality: ['FULL_BLEED_CINEMATIC', 'EDITORIAL_SPLIT', 'QUIET_LUXURY'],
  creative: ['COLLAGE', 'TYPOGRAPHIC_STATEMENT', 'FLOATING_MEDIA'],
  local_service: ['EDITORIAL_SPLIT', 'FULL_BLEED_CINEMATIC', 'TYPOGRAPHIC_STATEMENT'],
  appointments: ['EDITORIAL_SPLIT', 'FULL_BLEED_CINEMATIC', 'QUIET_LUXURY'],
  realestate: ['FULL_BLEED_CINEMATIC', 'EDITORIAL_SPLIT', 'QUIET_LUXURY'],
  professional: ['QUIET_LUXURY', 'EDITORIAL_SPLIT', 'TYPOGRAPHIC_STATEMENT'],
  nonprofit: ['FULL_BLEED_CINEMATIC', 'EDITORIAL_SPLIT', 'COLLAGE'],
  other: ['EDITORIAL_SPLIT', 'FULL_BLEED_CINEMATIC'],
};
// families that require a real photograph/generated image to make sense at all (never chosen with no funded media)
const PHOTO_DEPENDENT = new Set(['FULL_BLEED_CINEMATIC', 'PRODUCT_STAGE', 'FLOATING_MEDIA', 'COLLAGE', 'EDITORIAL_SPLIT']);
// families that never carry a photograph (pure typography/interface) -- safe with zero real media
const NO_PHOTO_NEEDED = new Set(['TYPOGRAPHIC_STATEMENT', 'FRAME_WITHIN_FRAME', 'QUIET_LUXURY']);
// Pick the first family in the industry's preference order this business can actually support.
// hasStrongMedia: true when a real/generated hero image will actually be funded (photo-led or an uploaded asset).
function pickHeroFamily(industryKey, hasStrongMedia, currentFamily) {
  const cur = currentFamily ? normalizeHeroFamily(currentFamily, null) : null;
  if (cur && (hasStrongMedia || !PHOTO_DEPENDENT.has(cur))) return cur; // an already-good, still-viable choice is kept (Part 4: "do not force a fixed mapping")
  const order = INDUSTRY_HERO_PREFERENCE[industryKey] || INDUSTRY_HERO_PREFERENCE.other;
  const viable = order.find(f => hasStrongMedia || !PHOTO_DEPENDENT.has(f));
  return viable || (hasStrongMedia ? order[0] : 'TYPOGRAPHIC_STATEMENT');
}

// ---- MEDIA_COMPOSITION (Part 5) -- treatments a single-image section (editorialFeature, about-split, product
// showcase) can carry. 10 named, each a concrete class + crop/position recipe; 'default' is the plain treatment
// every image section already had before this pass. ----------------------------------------------------------
const MEDIA_COMPOSITIONS = {
  DEFAULT: { cls: '', aspect: null },
  OVERSIZED_IMAGE: { cls: 'media-oversized', aspect: '16/10' },
  OFFSET_IMAGE: { cls: 'media-offset', aspect: '4/5' },
  OVERLAPPING_PAIR: { cls: 'media-overlap-pair', aspect: '4/5', needsSecond: true },
  FULL_WIDTH_BAND: { cls: 'media-full-band', aspect: '21/9' },
  VERTICAL_EDITORIAL: { cls: 'media-vertical', aspect: '3/4' },
  VISUAL_QUOTE: { cls: 'media-quote', aspect: null },
};
const MEDIA_COMPOSITION_KEYS = Object.keys(MEDIA_COMPOSITIONS);
function normalizeMediaComposition(value, fallback) {
  const k = String(value || '').toUpperCase().replace(/[\s-]+/g, '_');
  return MEDIA_COMPOSITION_KEYS.includes(k) ? k : (MEDIA_COMPOSITION_KEYS.includes(fallback) ? fallback : 'DEFAULT');
}

// ---- DEPTH (Part 6) -- 4 levels. V1 scope: depth is currently a fixed property of each hero family / media
// composition (documented per-family below), not yet an independent axis a planner can tune -- see V7 doc's
// "known weaknesses" for the follow-up. Exposed here so the vocabulary and its CSS hooks already exist.
const DEPTH_LEVELS = ['FLAT', 'SUBTLE', 'LAYERED', 'DRAMATIC'];
function normalizeDepth(value, fallback) {
  const k = String(value || '').toUpperCase();
  return DEPTH_LEVELS.includes(k) ? k : (DEPTH_LEVELS.includes(fallback) ? fallback : 'SUBTLE');
}
const HERO_FAMILY_DEPTH = { EDITORIAL_SPLIT: 'SUBTLE', FULL_BLEED_CINEMATIC: 'LAYERED', PRODUCT_STAGE: 'DRAMATIC', FLOATING_MEDIA: 'DRAMATIC',
  TYPOGRAPHIC_STATEMENT: 'FLAT', FRAME_WITHIN_FRAME: 'LAYERED', COLLAGE: 'LAYERED', QUIET_LUXURY: 'FLAT' };
function depthForFamily(family) { return HERO_FAMILY_DEPTH[normalizeHeroFamily(family)] || 'SUBTLE'; }

// ---- SURFACE (Part 7) -- named treatments layered on top of the 4 existing composition tones (base/alt/contrast/
// brand from lib/premium/composition.js): this does not replace that colour system, it adds a texture/pattern
// class on top of whichever tone a section already resolved to. Kept tasteful and rare by design (Part 7: "do not
// add random gradients everywhere") -- only 3 sections per page may opt in (see pickSurfaceTexture).
const SURFACE_TEXTURES = ['clean', 'radial-field', 'grid-technical', 'editorial-paper'];
function normalizeSurfaceTexture(value, fallback) {
  const k = String(value || '').toLowerCase();
  return SURFACE_TEXTURES.includes(k) ? k : (SURFACE_TEXTURES.includes(fallback) ? fallback : 'clean');
}
// deterministic: technical grid for interface-led business, soft radial field for photo/atmosphere-led, plain otherwise
function surfaceTextureFor(profileId) {
  if (profileId === 'tech') return 'grid-technical';
  if (['wellness', 'hospitality', 'realestate'].includes(profileId)) return 'radial-field';
  if (['consultancy', 'consultancy_personal', 'portfolio'].includes(profileId)) return 'editorial-paper';
  return 'clean';
}

// ---- section INTENSITY (Parts 9, 10, 14) -- names the same 4 rungs lib/premium/composition.js already computes
// (quiet/medium/strong + the hero itself), so the planner/tests can reason in these terms without a second pacing
// engine. QUIET/NORMAL/FEATURE come straight from composition.js's `weight`; HEROIC is reserved for the hero and a
// true full-bleed/cinematic moment (kind 'fullbleed' or 'contrastband' with tone 'contrast'/'brand').
const INTENSITY_FROM_WEIGHT = { quiet: 'QUIET', medium: 'NORMAL', strong: 'FEATURE' };
function intensityFor(section) {
  if (!section) return 'NORMAL';
  if (section.moment === 'fullbleed' || (section.moment && (section.tone === 'contrast' || section.tone === 'brand') && section.weight === 'strong')) return 'HEROIC';
  return INTENSITY_FROM_WEIGHT[section.weight] || 'NORMAL';
}
// Part 14: "hero + 2-3 visual moments + 1 quiet section + 1 strong closing CTA" -- a deterministic check over an
// already-planned composition (lib/premium/composition.js's planPageComposition output), reusing its own fields.
function checkVisualMoments(plan) {
  const problems = [];
  const s = (plan && plan.sections) || [];
  if (!s.length) return problems;
  const moments = s.filter(x => x.moment && x.moment !== 'ctaband').length;
  if (moments < 1) problems.push({ code: 'no_visual_moment', detail: 'no visual moment besides the hero and the closing CTA' });
  if (moments > 4) problems.push({ code: 'too_many_visual_moments', detail: `${moments} visual moments -- every section competing for attention reads as none of them special` });
  if (!s.some(x => x.weight === 'quiet')) problems.push({ code: 'no_quiet_section', detail: 'no intentionally quiet section -- the page never lets the visitor rest' });
  const cta = s.filter(x => x.cta === 'band');
  if (!cta.length) problems.push({ code: 'no_strong_closing_cta', detail: 'no composed closing CTA band' });
  return problems;
}

// ---- anti-repetition (Part 10): identical MEDIA POSITION / layout streaks, beyond composition.js's existing
// weight/tone repetition checks. `layoutOf(section)` reads whatever "side"/layout signal the section already
// carries (editorialFeature's `variant` image-left/image-right/full/quote, or composition.js's own `layout`).
function layoutOf(section) {
  if (section.type === 'editorialFeature') return section.variant || 'quote';
  return (section.layout && section.layout !== 'default') ? section.layout : null;
}
function checkLayoutRepetition(sections) {
  const problems = []; let streak = 1;
  for (let i = 1; i < sections.length; i++) {
    const a = layoutOf(sections[i - 1]), b = layoutOf(sections[i]);
    if (a && b && a === b) { streak++; if (streak >= 3) problems.push({ code: 'repeated_media_position', detail: `3+ sections in a row use "${b}"`, index: i }); }
    else streak = 1;
  }
  return problems;
}

module.exports = {
  HERO_FAMILIES, HERO_FAMILY_KEYS, normalizeHeroFamily, heroVariantFor, familyForVariant,
  INDUSTRY_HERO_PREFERENCE, PHOTO_DEPENDENT, NO_PHOTO_NEEDED, pickHeroFamily,
  MEDIA_COMPOSITIONS, MEDIA_COMPOSITION_KEYS, normalizeMediaComposition,
  DEPTH_LEVELS, normalizeDepth, depthForFamily,
  SURFACE_TEXTURES, normalizeSurfaceTexture, surfaceTextureFor,
  intensityFor, checkVisualMoments, layoutOf, checkLayoutRepetition,
};
