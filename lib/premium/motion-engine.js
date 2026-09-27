'use strict';
// SITEREMADE MOTION ENGINE V1
//
// A pure, validated motion vocabulary module -- no I/O, no model calls, no
// randomness (Part 26) -- bundled and shared identically by the live client
// (script.js), the server (server.js) and the static-export renderer
// (lib/site-render.js), exactly like lib/premium/visual-engine.js.
//
// PART 2 AUDIT (what already existed, reused rather than duplicated):
//   * ONE shared IntersectionObserver already drives a one-shot fade+rise
//     reveal on every top-level .site-hero/.site-page-header/.site-section
//     on the real exported site (lib/export-compiler.js's SITE_RUNTIME_JS),
//     with a passive scroll-catch-up fallback for instant jumps. The live
//     in-editor preview deliberately runs a simpler, instant-reveal copy
//     instead (script.js's initSiteMotion) because it rebuilds
//     siteSectionsRoot.innerHTML on every keystroke -- there is no
//     "already revealed" state to preserve across that replace. This pass
//     does not touch that distinction; it is already correct and documented
//     at both call sites.
//   * Per-section stagger already exists for one case (`.process-flow>*`
//     nth-child transition-delay, keyed to an existing `--stagger-step`
//     custom property) -- this pass generalises the SAME mechanism
//     (`[data-stagger]>*`) rather than inventing a second one.
//   * A per-archetype `[data-motion-character]` recipe already sets
//     --reveal-y/--reveal-dur/--hover-lift/--stagger-step/--img-hover-scale;
//     a per-category `[data-motion="none"|"expressive"]` kill switch/boost
//     already exists and already cascades under prefers-reduced-motion.
//     This pass's new intensity axis is independent of both (Part 4) and
//     composes with them rather than replacing them.
//   * `data-nav="minimal-until-scroll"` already exists as a *static* nav
//     style name with no actual scroll behaviour behind it -- Part 18's
//     header motion is wired onto this existing, already-chosen vocabulary
//     value instead of inventing a new one.
//   * Visual Engine V1/V1.1's `data-hero-family`/`data-depth` are the real
//     signal this module keys its hero-motion and depth-motion choices off
//     of -- never a second, parallel hero taxonomy.
//
// IMPLEMENTATION PHILOSOPHY (Part 36): a small set of treatments that
// combine well, not a large library of presets. 6 reveal modes, 4 depth-
// motion levels, 5 hero-motion patterns, 4 intensity levels -- and every
// image-motion/product-motion/UI-motion requirement in the brief is met by
// composing THOSE, not by adding a 6th/7th parallel vocabulary tree.

// ---- Reveal (Part 3, 7, 10) -------------------------------------------------
// MASK folds in Part 10's "mask reveal" (clip-path) and Part 11's "reveal
// from crop" -- one clip-path-driven treatment covers both asks. SCALE folds
// in Part 11's "slow scale"/"restrained zoom" for a single media element.
const REVEAL_MODES = ['NONE', 'FADE', 'RISE', 'SLIDE', 'SCALE', 'MASK'];
function normalizeReveal(v) { return REVEAL_MODES.includes(v) ? v : 'RISE'; }

// ---- Motion intensity (Part 4) -- independent of Visual Engine's static
// visual intensity/depth. A QUIET_LUXURY hero can sit on a visually rich
// palette and still move at SUBTLE; a PRODUCT_STAGE hero on a plain palette
// still deserves real motion.
const MOTION_INTENSITY = ['NONE', 'SUBTLE', 'MODERATE', 'EXPRESSIVE'];
function normalizeIntensity(v) { return MOTION_INTENSITY.includes(v) ? v : 'SUBTLE'; }
function intensityRank(v) { return Math.max(0, MOTION_INTENSITY.indexOf(normalizeIntensity(v))); }
function capIntensity(v, max) { return intensityRank(v) > intensityRank(max) ? max : normalizeIntensity(v); }

// ---- Depth motion (Part 9) -- reads the EXISTING static hero depth
// (visual-engine.js DEPTH_LEVELS: FLAT/SUBTLE/LAYERED/DRAMATIC) and the
// resolved motion intensity; never a second depth taxonomy.
const DEPTH_MOTION = ['NONE', 'SUBTLE', 'PARALLAX', 'LAYERED'];
function normalizeDepthMotion(v) { return DEPTH_MOTION.includes(v) ? v : 'NONE'; }
function depthMotionFor(staticDepth, intensity) {
  const i = normalizeIntensity(intensity);
  if (i === 'NONE') return 'NONE';
  const table = {
    DRAMATIC: { SUBTLE: 'SUBTLE', MODERATE: 'LAYERED', EXPRESSIVE: 'PARALLAX' },
    LAYERED: { SUBTLE: 'SUBTLE', MODERATE: 'SUBTLE', EXPRESSIVE: 'LAYERED' },
    SUBTLE: { SUBTLE: 'NONE', MODERATE: 'SUBTLE', EXPRESSIVE: 'SUBTLE' },
    FLAT: { SUBTLE: 'NONE', MODERATE: 'NONE', EXPRESSIVE: 'NONE' },
  };
  const row = table[staticDepth] || table.FLAT;
  return row[i] || 'NONE';
}

// ---- Hero motion (Part 6) -- one pattern per hero family, reusing Visual
// Engine's own 8-family taxonomy (never a parallel one). Two families
// legitimately share a pattern where the brief's own description is the
// same movement idea (COLLAGE and FLOATING_MEDIA both want staggered,
// depth-differentiated media entry) -- the CSS still differentiates them
// via each hero's own existing markup (hero-float-card vs collage tiles).
const HERO_MOTION_MODES = ['STATIC', 'FLOAT', 'PARALLAX', 'STAGE_REVEAL', 'EDITORIAL_REVEAL'];
function normalizeHeroMotion(v) { return HERO_MOTION_MODES.includes(v) ? v : 'STATIC'; }
const HERO_FAMILY_MOTION = {
  PRODUCT_STAGE: { heroMotion: 'STAGE_REVEAL', intensity: 'EXPRESSIVE' },
  FLOATING_MEDIA: { heroMotion: 'FLOAT', intensity: 'MODERATE' },
  FULL_BLEED_CINEMATIC: { heroMotion: 'PARALLAX', intensity: 'MODERATE' },
  EDITORIAL_SPLIT: { heroMotion: 'EDITORIAL_REVEAL', intensity: 'SUBTLE' },
  FRAME_WITHIN_FRAME: { heroMotion: 'EDITORIAL_REVEAL', intensity: 'MODERATE' },
  COLLAGE: { heroMotion: 'FLOAT', intensity: 'MODERATE' },
  QUIET_LUXURY: { heroMotion: 'STATIC', intensity: 'SUBTLE' },
  TYPOGRAPHIC_STATEMENT: { heroMotion: 'STATIC', intensity: 'SUBTLE' },
};
function heroMotionFor(family) { return (HERO_FAMILY_MOTION[family] || HERO_FAMILY_MOTION.EDITORIAL_SPLIT).heroMotion; }

// ---- Compatibility rules (Part 24) -- never allow a choice that fights
// the layout or a hero family's own restrained identity.
const MOTION_INTENSITY_CAP = { QUIET_LUXURY: 'SUBTLE', TYPOGRAPHIC_STATEMENT: 'MODERATE' };
// Section types that are dense/functional and must never get anything
// beyond a plain fade -- a sliding/scaling/masking contact form or FAQ
// accordion is exactly the "fights the layout" case Part 24 names.
const MINIMAL_MOTION_SECTIONS = ['faq', 'contact', 'pricing', 'process'];
function sectionMotionCompatible(sectionType, reveal) {
  if (!MINIMAL_MOTION_SECTIONS.includes(sectionType)) return true;
  return reveal === 'NONE' || reveal === 'FADE';
}

// ---- Industry tendencies (Part 25) -- soft defaults, not hard locks: only
// consulted when nothing more specific (an explicit planner choice) is
// present; a hero family's own base intensity plus this pass's
// compatibility cap always take precedence over a tendency.
const INDUSTRY_MOTION_TENDENCY = {
  saas: 'MODERATE', retail: 'MODERATE', wellness: 'SUBTLE', hospitality: 'MODERATE',
  realestate: 'SUBTLE', local_service: 'SUBTLE', appointments: 'SUBTLE', professional: 'SUBTLE',
  creative: 'EXPRESSIVE', nonprofit: 'SUBTLE',
};

// ---- Deterministic whole-business motion intensity (Parts 4, 23, 24, 25, 26)
// PART 23 note: no new planner field was added for this. `visualDirection.motion`
// (server.js's existing MOTION_KEYS: none/subtle/expressive) is ALREADY a real,
// already-round-tripped planner-facing motion choice -- Part 2's own audit found
// it before this pass wrote a single line of new schema. Reusing it as the
// ceiling below means Claude's payload does not grow by one byte (Part 33) and
// its existing meaning is preserved exactly (a category/business explicitly
// marked "subtle" today must never newly jump to MODERATE/EXPRESSIVE, and
// "none" must stay an absolute kill switch): 'none' forces NONE outright,
// 'subtle' caps at SUBTLE, and 'expressive' UNLOCKS (does not force) the hero
// family's own fuller default -- a QUIET_LUXURY hero on an "expressive" category
// still lands on SUBTLE via MOTION_INTENSITY_CAP below, because unlocking a
// range is not the same as demanding its top end.
// ctx: { heroFamily, industryFamily, requestedMotion (dims.motion: 'none'|'subtle'|'expressive'|falsy) }
function motionIntensityFor(ctx) {
  ctx = ctx || {};
  const base = (HERO_FAMILY_MOTION[ctx.heroFamily] || HERO_FAMILY_MOTION.EDITORIAL_SPLIT).intensity;
  const tendency = INDUSTRY_MOTION_TENDENCY[ctx.industryFamily];
  let resolved = tendency || base;
  if (ctx.requestedMotion === 'none') resolved = 'NONE';
  else if (ctx.requestedMotion === 'subtle') resolved = capIntensity(resolved, 'SUBTLE');
  // 'expressive' (or no explicit value at all): leave `resolved` as the
  // hero-family/industry default -- see note above.
  const cap = MOTION_INTENSITY_CAP[ctx.heroFamily];
  if (cap) resolved = capIntensity(resolved, cap);
  return resolved;
}

// ---- Deterministic per-section reveal + stagger (Parts 3, 7, 8, 26) --
// cycles through a small, intensity-scaled palette by the section's own
// position among media-bearing sections (same "cycle by real position, no
// pseudo-random calls" discipline as editorial.js's FEATURE_MEDIA_CYCLE) --
// never random, always reproducible for the same plan.
const STAGGER_SECTION_TYPES = ['features', 'services', 'pricing', 'process', 'testimonialsGrid', 'gallery', 'integrations', 'team'];
const MEDIA_REVEAL_CYCLE = { NONE: ['NONE'], SUBTLE: ['FADE', 'RISE'], MODERATE: ['RISE', 'SLIDE', 'SCALE'], EXPRESSIVE: ['SLIDE', 'MASK', 'SCALE', 'RISE'] };
function sectionRevealFor(sectionType, intensity, mediaIndex) {
  const i = normalizeIntensity(intensity);
  if (i === 'NONE') return 'NONE';
  if (MINIMAL_MOTION_SECTIONS.includes(sectionType)) return 'FADE';
  const cycle = MEDIA_REVEAL_CYCLE[i];
  const reveal = cycle[Math.max(0, mediaIndex || 0) % cycle.length];
  return sectionMotionCompatible(sectionType, reveal) ? reveal : 'FADE';
}
function staggerFor(sectionType, intensity) {
  return normalizeIntensity(intensity) !== 'NONE' && STAGGER_SECTION_TYPES.includes(sectionType);
}

// ---- Sticky/pinned-light (Part 15, 23) -- at most one per page, only on a
// genuinely two-column, media+copy feature section, and only when the
// page's own resolved intensity is MODERATE/EXPRESSIVE (a SUBTLE/NONE page
// should never scroll-pin anything -- that would itself be the "fights the
// layout" case Part 24 warns about).
const STICKY_MODES = ['NONE', 'LIGHT'];
function normalizeStickyMode(v) { return STICKY_MODES.includes(v) ? v : 'NONE'; }
function stickyEligible(section, intensity) {
  if (intensityRank(intensity) < intensityRank('MODERATE')) return false;
  return section && section.type === 'editorialFeature' && (section.variant === 'image-left' || section.variant === 'image-right');
}
// sections: this PAGE's own section list (never cross-page -- Part 15's "max
// limited number per page"). Returns the id of the one section to make
// sticky, or null.
function pickStickySection(sections, intensity) {
  const hit = (sections || []).find(s => stickyEligible(s, intensity));
  return hit ? hit.id : null;
}

module.exports = {
  REVEAL_MODES, normalizeReveal,
  MOTION_INTENSITY, normalizeIntensity, intensityRank, capIntensity,
  DEPTH_MOTION, normalizeDepthMotion, depthMotionFor,
  HERO_MOTION_MODES, normalizeHeroMotion, HERO_FAMILY_MOTION, heroMotionFor,
  MOTION_INTENSITY_CAP, MINIMAL_MOTION_SECTIONS, sectionMotionCompatible,
  INDUSTRY_MOTION_TENDENCY, motionIntensityFor,
  STAGGER_SECTION_TYPES, sectionRevealFor, staggerFor,
  STICKY_MODES, normalizeStickyMode, stickyEligible, pickStickySection,
};
