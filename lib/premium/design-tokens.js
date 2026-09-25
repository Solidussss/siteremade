'use strict';
// One coherent token system per generated site: palette roles, curated type
// pairing, spacing rhythm, radius and content width. Sections read these
// variables; they never style themselves independently.
//
// Fonts are SYSTEM stacks only: generated/exported sites make zero webfont
// requests (same posture the client apps already document). "Curated" means
// a deliberate pairing + scale per business character -- not a random serif.

const SANS = "Inter,'Segoe UI Variable Text','Segoe UI',system-ui,-apple-system,'Helvetica Neue',Arial,sans-serif";
const SERIF = "'Iowan Old Style','Palatino Linotype',Palatino,'Book Antiqua',Georgia,serif";
const MONO = 'ui-monospace,SFMono-Regular,Menlo,Consolas,monospace';

// heading/body families, weight, tracking, line-height, measure (max line length),
// and a modular scale for h1 (hero), h2 (section), h3 (card), body.
const TYPE_SYSTEMS = {
  'humanist-workhorse': { heading: SANS, body: SANS, weight: 750, tracking: '-0.03em', lineHeight: 1.06, bodyLine: 1.6, measure: '60ch', scale: { h1: 'clamp(2rem,5.4cqw,3.5rem)', h2: 'clamp(1.4rem,3cqw,2.05rem)', h3: '1.15rem', body: '1rem' } },
  'refined-sans': { heading: SANS, body: SANS, weight: 650, tracking: '-0.035em', lineHeight: 1.05, bodyLine: 1.65, measure: '58ch', scale: { h1: 'clamp(2.05rem,5.6cqw,3.7rem)', h2: 'clamp(1.45rem,3.1cqw,2.15rem)', h3: '1.15rem', body: '1rem' } },
  'technical-sans': { heading: SANS, body: SANS, weight: 780, tracking: '-0.045em', lineHeight: 1.02, bodyLine: 1.6, measure: '56ch', mono: MONO, scale: { h1: 'clamp(2.1rem,5.9cqw,3.9rem)', h2: 'clamp(1.5rem,3.2cqw,2.25rem)', h3: '1.1rem', body: '1rem' } },
  'editorial-contrast': { heading: SERIF, body: SANS, weight: 500, tracking: '-0.02em', lineHeight: 1.08, bodyLine: 1.7, measure: '58ch', scale: { h1: 'clamp(2.1rem,5.7cqw,3.8rem)', h2: 'clamp(1.5rem,3.2cqw,2.3rem)', h3: '1.2rem', body: '1.02rem' } },
  'warm-editorial': { heading: SERIF, body: SANS, weight: 500, tracking: '-0.015em', lineHeight: 1.1, bodyLine: 1.7, measure: '56ch', scale: { h1: 'clamp(2.05rem,5.5cqw,3.6rem)', h2: 'clamp(1.45rem,3.1cqw,2.2rem)', h3: '1.2rem', body: '1.02rem' } },
};

// Spacing rhythm by importance: hero > major sections > minor. Values scale with the strategy's spacing character.
const SPACING = {
  tight: { hero: '72px', major: '56px', minor: '36px', gap: '20px' },
  'tight-to-standard': { hero: '84px', major: '64px', minor: '40px', gap: '22px' },
  standard: { hero: '96px', major: '72px', minor: '44px', gap: '24px' },
  airy: { hero: '120px', major: '92px', minor: '56px', gap: '28px' },
};
const RADIUS = { 'trust-heavy-local-service': '12px', 'trust-heavy-professional': '10px', 'premium-consultancy': '4px', 'service-led': '12px', hospitality: '14px', 'portfolio-heavy': '2px', editorial: '2px', 'product-led': '14px', 'story-led': '14px' };
const CONTENT_WIDTH = { 'trust-heavy-local-service': '1120px', 'trust-heavy-professional': '1120px', 'premium-consultancy': '1080px', 'service-led': '1120px', hospitality: '1160px', 'portfolio-heavy': '1280px', editorial: '1280px', 'product-led': '1200px', 'story-led': '1120px' };

// strategy: from strategy.js; palette: {background, main, text, accent2}
function buildDesignTokens(strategy, palette) {
  const type = TYPE_SYSTEMS[strategy.typographyDirection] || TYPE_SYSTEMS['humanist-workhorse'];
  const space = SPACING[strategy.spacingCharacter] || SPACING.standard;
  const radius = RADIUS[strategy.layoutPattern] || '12px';
  const width = CONTENT_WIDTH[strategy.layoutPattern] || '1120px';
  const p = palette || {};
  const vars = {
    '--site-font-heading': type.heading, '--site-font-body': type.body,
    '--site-heading-weight': String(type.weight), '--site-heading-tracking': type.tracking, '--site-heading-line': String(type.lineHeight),
    '--site-body-line': String(type.bodyLine), '--site-measure': type.measure,
    '--site-h1': type.scale.h1, '--site-h2': type.scale.h2, '--site-h3': type.scale.h3, '--site-body-size': type.scale.body,
    '--site-space-hero': space.hero, '--site-space-major': space.major, '--site-space-minor': space.minor, '--site-gap': space.gap,
    '--site-radius': radius, '--site-content-width': width,
  };
  return {
    version: 1, premium: true, typographyKey: strategy.typographyDirection, spacingKey: strategy.spacingCharacter,
    palette: { background: p.background || null, surface: p.background || null, text: p.text || null, accent: p.main || null, accent2: p.accent2 || p.main || null },
    typography: { heading: type.heading, body: type.body, weight: type.weight, tracking: type.tracking, measure: type.measure, scale: type.scale },
    spacing: space, radius, contentWidth: width, vars,
    dataAttrs: { 'data-premium': '1', 'data-premium-type': strategy.typographyDirection || 'humanist-workhorse' },
  };
}

// Only accept values of the expected shape (this object round-trips through stored project JSON).
function sanitizeTokens(tokens) {
  if (!tokens || typeof tokens !== 'object' || tokens.premium !== true || !tokens.vars || typeof tokens.vars !== 'object') return null;
  const vars = {};
  Object.keys(tokens.vars).forEach(k => {
    if (!/^--site-[a-z0-9-]+$/.test(k)) return;
    const v = String(tokens.vars[k]);
    if (v.length > 200 || /[;{}<>\\]|url\(|expression\(/i.test(v)) return;
    vars[k] = v;
  });
  const key = /^[a-z-]{1,40}$/.test(String(tokens.typographyKey)) ? tokens.typographyKey : 'humanist-workhorse';
  return { premium: true, version: 1, typographyKey: key, vars, dataAttrs: { 'data-premium': '1', 'data-premium-type': key } };
}

module.exports = { TYPE_SYSTEMS, SPACING, buildDesignTokens, sanitizeTokens };
