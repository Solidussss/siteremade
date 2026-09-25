'use strict';
// PREMIUM_COMPOSITION_V2: plan the WHOLE homepage as one visual sequence before rendering it.
//
// Pure and deterministic (no model call, no I/O): a function of the ordered sections, the strategy/archetype and the
// palette. Because it is derived rather than stored, the live preview, the purchased export and the Workplace updater
// all compute the same plan from the same project JSON and cannot drift.
//
// What it decides per section: role (why it exists), visual weight (strong/medium/quiet), surface tone (base / alt /
// contrast / brand), whether it is a visual MOMENT (fullbleed media, contrast band, typographic statement, offset
// composition, CTA band), whether cards are dropped in favour of open editorial layout, and how forms and the footer are
// composed. It then verifies its own output (neighbour contrast, no long runs of the same weight, enough moments, a
// real final CTA) so the same rules the reviewer applies are guaranteed on the way in.

const ROLE = {
  proof: 'PROVE', metrics: 'PROVE', testimonial: 'PROVE', testimonialsGrid: 'PROVE', serviceAreas: 'TRUST',
  services: 'EDUCATE', features: 'EDUCATE', integrations: 'EDUCATE', pricing: 'EDUCATE', faq: 'EDUCATE', process: 'EDUCATE',
  gallery: 'SHOW', caseStudies: 'SHOW', imageLedEditorial: 'SHOW', productShowcase: 'SHOW', menu: 'SHOW', team: 'SHOW',
  about: 'STORY', ctaBanner: 'CONVERT', reservationCta: 'CONVERT', contact: 'CONVERT', newsletter: 'CONVERT', footer: 'CLOSE', hero: 'ORIENT',
};
const CONVERT_TYPES = ['ctaBanner', 'reservationCta', 'contact'];
const SHOW_MEDIA = ['gallery', 'caseStudies', 'imageLedEditorial', 'productShowcase'];
const CARD_KEEP = ['services', 'features', 'pricing', 'team', 'integrations', 'productShowcase'];

// Per-archetype visual grammar (Part 17): how many moments, and which kind of surface carries them.
const GRAMMAR = {
  'local-conversion': { moments: 3, contrastForProof: true, footer: 'contrast', ctaTone: 'brand', statement: false, feel: 'assertive' },
  'trust-heavy-professional': { moments: 3, contrastForProof: true, footer: 'contrast', ctaTone: 'contrast', statement: true, feel: 'assertive' },
  'service-business': { moments: 3, contrastForProof: true, footer: 'contrast', ctaTone: 'brand', statement: false, feel: 'assertive' },
  'premium-consultancy': { moments: 2, contrastForProof: false, footer: 'base', ctaTone: 'contrast', statement: true, feel: 'restrained' },
  hospitality: { moments: 3, contrastForProof: true, footer: 'contrast', ctaTone: 'contrast', statement: false, feel: 'immersive' },
  portfolio: { moments: 2, contrastForProof: false, footer: 'base', ctaTone: 'contrast', statement: true, feel: 'immersive' },
  'editorial-brand': { moments: 3, contrastForProof: false, footer: 'contrast', ctaTone: 'contrast', statement: true, feel: 'immersive' },
  'product-led-saas': { moments: 3, contrastForProof: true, footer: 'contrast', ctaTone: 'brand', statement: false, feel: 'structured' },
  'launch-campaign': { moments: 3, contrastForProof: true, footer: 'contrast', ctaTone: 'brand', statement: true, feel: 'structured' },
  'ecommerce-showcase': { moments: 2, contrastForProof: false, footer: 'contrast', ctaTone: 'brand', statement: false, feel: 'structured' },
  'community-nonprofit': { moments: 3, contrastForProof: true, footer: 'brand', ctaTone: 'brand', statement: true, feel: 'story' },
};
const GOAL_HEAD = {
  request_quote: 'Request a quote for your {noun}{loc}', book_consultation: 'Book a consultation{loc}', call: 'Call to talk it through{loc}',
  reserve: 'Reserve a table{loc}', buy: 'Shop the collection', view_work: 'See the work, then let\'s talk', start_trial: 'Start using {name}',
  join_waitlist: 'Join the waitlist', get_involved: 'Get involved{loc}',
};

// ---- colour helpers ------------------------------------------------------------------------------------------
function hexToRgb(h) { const m = /^#?([0-9a-f]{6})$/i.exec(String(h || '')); if (!m) return null; const n = parseInt(m[1], 16); return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }; }
const toHex = c => '#' + [c.r, c.g, c.b].map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
function mix(a, b, t) { const x = hexToRgb(a), y = hexToRgb(b); if (!x || !y) return a; return toHex({ r: x.r + (y.r - x.r) * t, g: x.g + (y.g - x.g) * t, b: x.b + (y.b - x.b) * t }); }
function lum(hex) { const c = hexToRgb(hex); if (!c) return 0.5; const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); }
const contrast = (a, b) => { const la = lum(a), lb = lum(b); return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05); };

// Surface colours for the four tones, derived from the site's own palette (nothing hard-coded to a brand).
function compositionVars(palette) {
  const p = palette || {};
  const bg = hexToRgb(p.background) ? p.background : '#f7f7f8', text = hexToRgb(p.text) ? p.text : '#111111', main = hexToRgb(p.main) ? p.main : '#315cff';
  const darkTheme = lum(bg) < 0.25;
  const altBg = mix(bg, text, darkTheme ? 0.07 : 0.045);
  // "contrast" is the INVERSE of the base theme: a dark band on a light site, a light band on a dark one.
  // On a dark site the contrast surface is a deep brand tone (a real change of colour, not a pale inversion that fights the theme).
  const contrastBg = darkTheme ? mix(main, '#000000', 0.5) : mix('#0b0d12', main, 0.22);
  const contrastInk = lum(contrastBg) < 0.4 ? '#f4f5f7' : '#101216';
  const brandBg = main;
  const brandInk = contrast(main, '#ffffff') >= 3.2 ? '#ffffff' : '#101216';
  const contrastAccent = lum(contrastBg) < 0.4 ? mix(main, '#ffffff', darkTheme ? 0.55 : 0.2) : main;
  return {
    '--site-comp-alt-bg': altBg, '--site-comp-contrast-bg': contrastBg, '--site-comp-contrast-ink': contrastInk,
    '--site-comp-contrast-muted': mix(contrastBg, contrastInk, 0.68), '--site-comp-contrast-accent': contrastAccent,
    '--site-comp-brand-bg': brandBg, '--site-comp-brand-ink': brandInk, '--site-comp-brand-muted': mix(brandBg, brandInk, 0.78),
    '--site-comp-line': mix(bg, text, 0.16),
  };
}

// ---- planning ------------------------------------------------------------------------------------------------
const TONE_DIST = { 'base:alt': 0.5, 'base:contrast': 1, 'base:brand': 1, 'alt:contrast': 1, 'alt:brand': 1, 'contrast:brand': 0.6 };
const toneDistance = (a, b) => (a === b ? 0 : TONE_DIST[a + ':' + b] || TONE_DIST[b + ':' + a] || 1);
const WEIGHT_N = { quiet: 0, medium: 1, strong: 2 };
// How visibly different two neighbours are (>=1 means "clearly different").
function neighbourContrast(a, b) {
  const layoutDiff = (a.moment !== b.moment ? 1 : 0) || (a.open !== b.open ? 0.5 : 0) || (a.layout !== b.layout ? 0.5 : 0);
  return toneDistance(a.tone, b.tone) + Math.abs(WEIGHT_N[a.weight] - WEIGHT_N[b.weight]) * 0.5 + layoutDiff;
}

// input: { sections:[{id,type,variant,copyChars?,hasImage?}], strategy:{archetype,conversionGoal,...}, palette, hero:{variant,hasImage},
//          businessName, noun, location }
function planPageComposition(input) {
  const inp = input || {};
  const strat = inp.strategy || {};
  const g = GRAMMAR[strat.archetype] || GRAMMAR['service-business'];
  const all = (inp.sections || []).filter(s => s && s.type !== 'footer');
  const items = all.map((s, i) => ({
    id: s.id, type: s.type, index: i, role: ROLE[s.type] || 'EDUCATE', tone: 'base', weight: 'medium', moment: null, open: false, layout: 'default',
    cta: null, form: !!s.hasForm, hasImage: !!s.hasImage, copyChars: Number.isFinite(s.copyChars) ? s.copyChars : 0,
  }));
  const heroStrong = !!(inp.hero && (inp.hero.hasImage || ['fullbleed-image', 'poster', 'collage', 'centered-oversized'].includes(inp.hero.variant)));

  // 1. the closing conversion moment (the final CTA lives here, before the footer)
  let finalIdx = -1;
  for (let i = items.length - 1; i >= 0; i--) if (CONVERT_TYPES.includes(items[i].type)) { finalIdx = i; break; }

  // 2. score sections as visual-moment candidates by role (business-specific through archetype grammar)
  const cand = [];
  items.forEach(it => {
    if (it.index === finalIdx) return;
    let score = 0, kind = null;
    if (it.role === 'SHOW' && SHOW_MEDIA.includes(it.type)) { kind = it.hasImage ? 'fullbleed' : 'contrastband'; score = it.hasImage ? 3 : 2; }
    else if (it.type === 'menu') { kind = 'contrastband'; score = 2.5; }
    else if (it.role === 'PROVE') { kind = g.contrastForProof ? 'contrastband' : 'statement'; score = 2.5; }
    else if (it.type === 'about') { kind = g.statement && it.copyChars <= 260 ? 'statement' : 'offset'; score = 2; }
    else if (it.type === 'serviceAreas') { kind = 'statement'; score = it.copyChars <= 200 ? 1.5 : 0; }
    else if (it.type === 'process') { kind = 'steps'; score = 1.6; }
    else if (it.type === 'services' || it.type === 'features') { kind = 'offset'; score = 0.8; }
    if (kind && score > 0) cand.push({ it, kind, score });
  });
  cand.sort((a, b) => b.score - a.score || a.it.index - b.it.index);
  const chosen = [];
  const want = Math.min(g.moments - (finalIdx >= 0 ? 1 : 0), cand.length);
  for (const c of cand) {
    if (chosen.length >= want) break;
    // moments need air between them: never two in a row (the CTA band counts as a moment)
    if (chosen.some(x => Math.abs(x.it.index - c.it.index) < 2) || (finalIdx >= 0 && Math.abs(finalIdx - c.it.index) < 2 && c.kind !== 'fullbleed')) continue;
    chosen.push(c);
  }
  // Guarantee: a page is never left with fewer than two moments (final CTA included) when it has content to spare.
  const minMoments = Math.min(2, items.length - 1);
  for (const c2 of cand) {
    if (chosen.length + (finalIdx >= 0 ? 1 : 0) >= minMoments) break;
    if (!chosen.includes(c2) && !chosen.some(x => Math.abs(x.it.index - c2.it.index) < 2)) chosen.push(c2);
  }
  chosen.forEach(({ it, kind }) => {
    it.moment = kind; it.weight = 'strong';
    if (kind === 'contrastband') it.tone = 'contrast';
    if (kind === 'statement') it.tone = g.feel === 'restrained' ? 'base' : 'alt';
    if (kind === 'fullbleed') it.tone = 'base';
    if (kind === 'offset') it.layout = 'offset';
    if (kind === 'steps') { it.layout = 'large-steps'; it.tone = 'base'; }
  });
  if (finalIdx >= 0) { const f = items[finalIdx]; f.moment = 'ctaband'; f.weight = 'strong'; f.tone = g.ctaTone; f.cta = 'band'; f.form = f.form || f.type === 'contact'; }
  // forms (contact) sit on a tighter, contrasting surface with a split layout instead of a giant pale panel
  items.forEach(it => { if (it.type === 'contact' || (it.type === 'reservationCta')) { it.form = true; it.layout = 'split'; } });

  // 3. cards: only where the content really is a repeated unit; everything else is open editorial
  items.forEach(it => { it.open = !CARD_KEEP.includes(it.type); });

  // 4. quiet sections carry the rest; alternate base/alt surfaces between moments (never two identical pale neighbours)
  let lastSurface = 'alt';
  items.forEach(it => {
    if (it.moment) { lastSurface = it.tone === 'contrast' || it.tone === 'brand' ? 'alt' : it.tone; return; }
    it.weight = it.role === 'EDUCATE' && it.type !== 'faq' ? 'medium' : 'quiet';
    it.tone = lastSurface === 'alt' ? 'base' : 'alt'; lastSurface = it.tone;
  });

  // 5. verify + repair the sequence: no 3 equal weights in a row, and every neighbour pair clearly different
  for (let pass = 0; pass < 3; pass++) {
    for (let i = 2; i < items.length; i++) {
      if (items[i].weight === items[i - 1].weight && items[i].weight === items[i - 2].weight && !items[i].moment) items[i].weight = items[i].weight === 'quiet' ? 'medium' : 'quiet';
    }
    for (let i = 1; i < items.length; i++) {
      const a = items[i - 1], b = items[i];
      if (neighbourContrast(a, b) >= 1) continue;
      if (!b.moment && b.tone !== 'contrast') { b.layout = b.layout === 'default' ? (b.type === 'about' || b.type === 'services' ? 'offset' : 'quiet-air') : b.layout; }
      if (neighbourContrast(a, b) < 1 && !b.moment) b.tone = b.tone === 'base' ? 'alt' : 'base';
    }
  }
  const finalItem = finalIdx >= 0 ? items[finalIdx] : null;
  const footer = { tone: finalItem && finalItem.tone === g.footer ? (g.footer === 'brand' ? 'contrast' : 'base') : g.footer, layout: 'resolved' };
  if (footer.tone === 'base' && finalItem && (finalItem.tone === 'base' || finalItem.tone === 'alt')) footer.tone = 'contrast';
  return {
    version: 2, archetype: strat.archetype || 'service-business', feel: g.feel, heroStrong,
    sections: items.map(it => ({ id: it.id, type: it.type, role: it.role, tone: it.tone, weight: it.weight, moment: it.moment, open: it.open, layout: it.layout, cta: it.cta, form: it.form })),
    footer, moments: items.filter(i => i.moment).length, needsFinalCta: finalIdx < 0,
  };
}

// Business-specific closing headline from the strategy; only used when the section has no copy of its own.
// Never a claim: it names the action and, when known, the offering and place.
function finalCtaHeadline(strategy, ctx) {
  const c = ctx || {};
  const tpl = GOAL_HEAD[(strategy && strategy.conversionGoal) || 'request_quote'] || GOAL_HEAD.request_quote;
  // The generator location extraction can carry sentence fragments (Winnipeg. We); only the place name is used.
  const place = c.location ? String(c.location).split(/[.,;]/)[0].trim() : '';
  const loc = place ? ' in ' + place : '';
  const noun = String(c.noun || 'project').toLowerCase();
  return tpl.replace('{noun}', noun).replace('{loc}', loc).replace('{name}', c.businessName || 'it');
}

// ---- verification (shared by the review rubric) -------------------------------------------------------------------
// plan: from planPageComposition. Returns concrete findings with codes the rubric maps to categories.
function evaluateComposition(plan) {
  const out = [];
  const s = (plan && plan.sections) || [];
  if (s.length < 3) return out;
  // VISUAL_PACING: runs of identical weight, and pages that never reach 'strong'
  for (let i = 2; i < s.length; i++) if (s[i].weight === s[i - 1].weight && s[i].weight === s[i - 2].weight) { out.push({ category: 'VISUAL_PACING', code: 'flat_pacing_run', severity: 2, detail: `3 ${s[i].weight} sections in a row ending at ${s[i].type}`, target: { kind: 'section', id: s[i].id } }); break; }
  if (!s.some(x => x.weight === 'strong')) out.push({ category: 'VISUAL_PACING', code: 'no_strong_moment', severity: 2, detail: 'no section carries strong visual weight' });
  // SECTION_CONTRAST: neighbours nearly identical
  for (let i = 1; i < s.length; i++) if (neighbourContrast(s[i - 1], s[i]) < 1) { out.push({ category: 'SECTION_CONTRAST', code: 'adjacent_sections_too_similar', severity: 2, detail: `${s[i - 1].type} / ${s[i].type}`, target: { kind: 'section', id: s[i].id } }); break; }
  // COMPOSITION_VARIETY: REPETITIVE_COMPOSITION when most sections share tone/alignment/frame treatment
  const tones = s.reduce((m, x) => { m[x.tone] = (m[x.tone] || 0) + 1; return m; }, {});
  const dominant = Math.max.apply(null, Object.values(tones)) / s.length;
  const moments = s.filter(x => x.moment).length;
  if (dominant > 0.75 || moments < 2 && s.length >= 4) out.push({ category: 'COMPOSITION_VARIETY', code: 'REPETITIVE_COMPOSITION', severity: 2, detail: `${Math.round(dominant * 100)}% of sections share one surface; ${moments} visual moments` });
  const cards = s.filter(x => !x.open).length;
  if (cards / s.length > (plan.feel === 'structured' ? 0.85 : 0.6) && s.length >= 4) out.push({ category: 'COMPOSITION_VARIETY', code: 'card_overuse', severity: 1, detail: `${cards}/${s.length} sections are card-framed` });
  // CTA_STRENGTH
  const cta = s.filter(x => x.role === 'CONVERT');
  if (!cta.length) out.push({ category: 'CTA_STRENGTH', code: 'no_final_cta', severity: 3, detail: 'no closing conversion section' });
  else if (!cta.some(x => x.cta === 'band')) out.push({ category: 'CTA_STRENGTH', code: 'weak_final_cta', severity: 2, detail: 'closing CTA is not a composed band', target: { kind: 'section', id: cta[cta.length - 1].id } });
  // FOOTER_COMPLETION
  if (!plan.footer || plan.footer.layout !== 'resolved') out.push({ category: 'FOOTER_COMPLETION', code: 'footer_unfinished', severity: 2, detail: 'footer is the minimal legacy variant' });
  return out;
}

module.exports = { ROLE, GRAMMAR, planPageComposition, compositionVars, finalCtaHeadline, evaluateComposition, neighbourContrast, toneDistance, mix, lum, contrast };
