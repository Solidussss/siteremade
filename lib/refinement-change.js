// "Update My Website" redesign: did the revision change enough to be worth saving (and charging for), and what did it
// change, in the owner's words. Compares the stored direction BEFORE with the validated direction AFTER -- the same
// objects the renderer reads -- never the model's own description of what it did.
//
//   measureBusinessChange(before, after) -> { score, areas, details }
//   isMeaningful(measure, scope)         -> { ok, reason }
//   describeBusinessChange(before, after, measure) -> ['Redesigned the top of your homepage', ...]
//   measureCreativeChange / describeCreativeChange: the same for a Creative page's scene plan.
//
// "Meaningful" is deliberately about what a visitor would see: design values, the type system, the hero actually on
// screen, the page/section structure, section layouts, and copy. A broad request whose result moves only one or two
// of those by a small amount is not a redesign -- the caller saves nothing and charges nothing.
'use strict';
const render = require('./site-render');
const SB = require('./premium/hero-storyboard');

const DIM_KEYS = ['hero', 'type', 'nav', 'card', 'imagery', 'cta', 'colorBehavior', 'motion', 'spacing', 'pattern', 'contentWidth', 'imageDominance',
  'imageArrangement', 'sectionRhythm', 'sectionAlignment', 'typographyScale', 'headingWidth', 'cardDensity', 'cardShape', 'splitRatio'];
const CD_KEYS = ['concept', 'visualMood', 'narrativeStrategy', 'imageStrategy', 'signatureMotif', 'heroStrategy', 'pageRhythm'];
// what a visitor sees -- a whole new type system is worth more than a changed nav style
const DIM_WEIGHT = { hero: 1.5, type: 1.5, colorBehavior: 1.2, spacing: 1, contentWidth: 1, sectionRhythm: 1, typographyScale: 1, cardDensity: 0.8, cardShape: 0.8, card: 0.8, imagery: 0.6, imageDominance: 0.8, imageArrangement: 0.6, sectionAlignment: 0.8, headingWidth: 0.6, splitRatio: 0.5, cta: 0.6, nav: 0.5, pattern: 0.4, motion: 0.6 };
// the least a revision of each scope must move (score) and across how many areas
const THRESHOLDS = { site: { score: 5, areas: 2 }, page: { score: 4, areas: 2 }, hero: { score: 2.5, areas: 1 } };

const isObj = v => !!v && typeof v === 'object' && !Array.isArray(v);
const same = (a, b) => JSON.stringify(a == null ? null : a) === JSON.stringify(b == null ? null : b);
const copyOf = s => (isObj(s && s.copy) ? s.copy : {});
function tokenKeys(d) {
  const t = d && d.design && d.design.premiumTokens;
  return t && t.vars ? { typography: t.typographyKey, spacing: t.vars['--site-space-major'] } : { typography: null, spacing: null };
}
function heroOnScreen(d) {
  const sb = SB.activeStoryboard(d);
  return sb ? `storyboard:${sb.composition}:${sb.tone}` : `layout:${render.effectiveHeroLayout(d)}`;
}

function measureBusinessChange(before, after) {
  const b = before || {}, a = after || {};
  const details = { dims: [], typeSystem: [], motionIntensity: false, creative: [], hero: false, heroCopy: [], pages: [] };
  const bd = (b.design && b.design.dimensions) || {}, ad = (a.design && a.design.dimensions) || {};
  let design = 0, structure = 0, copy = 0, direction = 0, hero = 0;
  DIM_KEYS.forEach(k => { if (ad[k] !== bd[k] && ad[k] != null) { details.dims.push(k); design += DIM_WEIGHT[k] || 0.5; } });
  const bt = tokenKeys(b), at = tokenKeys(a);
  if (bt.typography !== at.typography) { details.typeSystem.push('typography'); design += 2; }
  if (bt.spacing !== at.spacing) { details.typeSystem.push('spacing'); design += 1; }
  const bmi = b.design && b.design.premium && b.design.premium.mi, ami = a.design && a.design.premium && a.design.premium.mi;
  if (bmi !== ami && ami) { details.motionIntensity = true; design += 0.5; }
  const bcd = (b.intent && b.intent.creativeDirection) || {}, acd = (a.intent && a.intent.creativeDirection) || {};
  CD_KEYS.forEach(k => { if (acd[k] !== bcd[k] && acd[k] != null) { details.creative.push(k); direction += 0.5; } });
  if (heroOnScreen(b) !== heroOnScreen(a)) { details.hero = true; hero += 2; }
  const bc = b.copy || {}, ac = a.copy || {};
  [['headline', 1.5], ['sub', 0.6], ['kicker', 0.3], ['cta', 0.3]].forEach(([k, w]) => { if ((ac[k] || '') !== (bc[k] || '')) { details.heroCopy.push(k); copy += w; } });
  if (details.heroCopy.length) hero += 0.5;

  const bPages = new Map((b.pages || []).map(p => [p.id, p]));
  const aIds = new Set((a.pages || []).map(p => p.id));
  (a.pages || []).forEach((p, index) => {
    const old = bPages.get(p.id);
    const entry = { id: p.id, label: p.label, index, added: !old, removed: false, sectionsAdded: 0, sectionsRemoved: 0, reordered: false, layouts: 0, copy: 0, labelChanged: false };
    if (!old) { structure += 2; entry.sectionsAdded = (p.sections || []).length; details.pages.push(entry); return; }
    const oldIds = (old.sections || []).map(s => s.id), newIds = (p.sections || []).map(s => s.id);
    entry.sectionsAdded = newIds.filter(id => !oldIds.includes(id)).length;
    entry.sectionsRemoved = oldIds.filter(id => !newIds.includes(id)).length;
    const keptOld = oldIds.filter(id => newIds.includes(id)), keptNew = newIds.filter(id => oldIds.includes(id));
    entry.reordered = !same(keptOld, keptNew);
    const oldById = new Map((old.sections || []).map(s => [s.id, s]));
    (p.sections || []).forEach(s => {
      const o = oldById.get(s.id); if (!o) return;
      if (o.variant !== s.variant || o.mediaComposition !== s.mediaComposition) entry.layouts++;
      const oc = copyOf(o), nc = copyOf(s);
      if (['headline', 'body', 'ctaLabel'].some(k => (oc[k] || '') !== (nc[k] || ''))) entry.copy++;
    });
    (p.sections || []).forEach(s => { if (!oldById.has(s.id) && Object.keys(copyOf(s)).length) entry.copy++; });
    entry.labelChanged = (old.label || '') !== (p.label || '');
    structure += entry.sectionsAdded + entry.sectionsRemoved + (entry.reordered ? 1 : 0) + entry.layouts * 0.5 + (entry.labelChanged ? 0.25 : 0);
    copy += Math.min(3, entry.copy * 0.5);
    if (entry.sectionsAdded || entry.sectionsRemoved || entry.reordered || entry.layouts || entry.copy || entry.labelChanged) details.pages.push(entry);
  });
  (b.pages || []).forEach(p => { if (!aIds.has(p.id)) { structure += 2; details.pages.push({ id: p.id, label: p.label, removed: true }); } });
  if (!same((b.pages || []).map(p => p.id).filter(id => aIds.has(id)), (a.pages || []).map(p => p.id).filter(id => bPages.has(id)))) { details.pagesReordered = true; structure += 0.5; }

  const parts = { design, structure, copy, direction, hero };
  const areas = Object.keys(parts).filter(k => parts[k] >= 1);
  const score = +(design + structure + copy + direction + hero).toFixed(2);
  return { score, areas, parts, details };
}

function isMeaningful(measure, scope) {
  const t = THRESHOLDS[scope] || THRESHOLDS.site;
  if (scope === 'hero' && !(measure.details && (measure.details.hero || measure.details.heroCopy.includes('headline') || measure.details.dims.includes('hero')))) return { ok: false, reason: 'the top of the homepage would look the same' };
  if (measure.score < t.score) return { ok: false, reason: `the revision changed too little (${measure.score} of ${t.score})` };
  if (measure.areas.length < t.areas) return { ok: false, reason: `the revision changed only ${measure.areas.join(', ') || 'nothing'}` };
  return { ok: true, reason: '' };
}

// ---- the owner's summary ----------------------------------------------------------------------------------------------
const TYPE_WORDS = { 'editorial-contrast': 'a serif editorial type pairing', 'warm-editorial': 'a warm serif type pairing', 'refined-sans': 'a refined sans-serif type', 'technical-sans': 'a crisp technical sans-serif', 'humanist-workhorse': 'a friendly sans-serif type',
  'serif-editorial': 'serif editorial type', 'classic-serif-mix': 'a classic serif mix', 'geo-sans': 'clean geometric type', 'display-condensed': 'condensed display type', 'mono-technical': 'technical monospaced accents', humanist: 'friendly humanist type' };
const MOOD_WORDS = { restrained: 'restrained', warm: 'warm', cinematic: 'cinematic', energetic: 'energetic', precise: 'precise', expressive: 'expressive', 'quiet-luxury': 'quiet and luxurious' };
const COLOR_WORDS = { 'neutral-single-accent': 'a neutral palette with one accent', 'high-contrast-mono-accent': 'a high-contrast, mostly monochrome look', 'warm-earth-multi-tone': 'warm, earthy tones', 'dark-luxury-metallic': 'a dark, luxurious treatment' };
const SPACE_RANK = { compact: 0, tight: 0, 'tight-to-standard': 1, standard: 1, airy: 2, generous: 3 };
const DENSITY_RANK = { compact: 0, mixed: 1, airy: 2 };
const pageName = (p, i) => (i === 0 ? 'homepage' : `${p.label || 'page'} page`);

// At most 8 lines, the ones a visitor notices first: the hero, the type, the layout, which pages were restructured and
// rewritten -- then colour, spacing, cards, headings, pictures, mood and motion.
function describeBusinessChange(before, after, measure) {
  const m = measure || measureBusinessChange(before, after);
  const d = m.details, out = [];
  const bd = (before.design && before.design.dimensions) || {}, ad = (after.design && after.design.dimensions) || {};
  const acd = (after.intent && after.intent.creativeDirection) || {};
  if (d.hero) out.push(d.heroCopy.includes('headline') ? 'Redesigned the top of your homepage, with a new headline' : 'Redesigned the top of your homepage');
  else if (d.heroCopy.includes('headline')) out.push('Rewrote the headline at the top of your homepage');
  const at = after.design && after.design.premiumTokens;
  if (d.typeSystem.includes('typography') && at) out.push(`Switched to ${TYPE_WORDS[at.typographyKey] || 'a new type system'}`);
  else if (d.dims.includes('type')) out.push(`Switched to ${TYPE_WORDS[ad.type] || 'new typography'}`);
  const layoutKeys = ['sectionRhythm', 'contentWidth', 'sectionAlignment', 'pattern'];
  if (layoutKeys.some(k => d.dims.includes(k)) || d.creative.includes('pageRhythm')) out.push(ad.sectionRhythm === 'editorial' || acd.pageRhythm === 'steady-editorial' ? 'Changed the site to a more editorial layout and rhythm' : 'Changed the layout and pacing of your pages');
  const pages = (after.pages || []).map((p, i) => ({ p, i, e: d.pages.find(x => x.id === p.id) })).filter(x => x.e);
  pages.filter(x => x.e.added).forEach(x => out.push(`Added a new "${x.p.label}" page`));
  d.pages.filter(e => e.removed).forEach(e => out.push(`Removed the "${e.label}" page`));
  const restructured = pages.filter(x => !x.e.added && (x.e.sectionsAdded || x.e.sectionsRemoved || x.e.reordered));
  if (restructured.length > 2) out.push(`Reworked the structure of ${restructured.some(x => x.i === 0) ? 'the homepage and ' + (restructured.length - 1) + ' other pages' : restructured.length + ' pages'}`);
  else restructured.forEach(x => out.push(`Reworked the ${pageName(x.p, x.i)} structure`));
  const copyPages = pages.filter(x => !x.e.added && x.e.copy);
  if (copyPages.length === 1) out.push(`Rewrote the ${pageName(copyPages[0].p, copyPages[0].i)} copy`);
  else if (copyPages.length > 1) out.push(`Rewrote copy on ${copyPages.length} pages`);
  if (d.dims.includes('colorBehavior')) out.push(`Changed the colour treatment to ${COLOR_WORDS[ad.colorBehavior] || 'a new style'}`);
  const spaceBefore = SPACE_RANK[bd.spacing], spaceAfter = SPACE_RANK[ad.spacing];
  if (d.dims.includes('spacing') || d.typeSystem.includes('spacing')) out.push(spaceAfter != null && spaceBefore != null && spaceAfter < spaceBefore ? 'Tightened the spacing' : 'Gave every section more breathing room');
  if (d.dims.includes('cardDensity')) out.push((DENSITY_RANK[ad.cardDensity] || 0) > (DENSITY_RANK[bd.cardDensity] || 0) ? 'Reduced card density' : 'Made the cards more compact');
  else if (d.dims.includes('card') || d.dims.includes('cardShape')) out.push('Restyled the cards');
  if (d.dims.includes('typographyScale')) out.push(ad.typographyScale === 'display' ? 'Made the headings larger and more dramatic' : ad.typographyScale === 'compact' ? 'Made the headings more compact' : 'Adjusted the heading sizes');
  pages.filter(x => !x.e.added && !restructured.includes(x) && x.e.layouts).forEach(x => out.push(`Changed section layouts on the ${pageName(x.p, x.i)}`));
  if (['imagery', 'imageDominance', 'imageArrangement'].some(k => d.dims.includes(k))) out.push('Changed how pictures are presented');
  if (d.dims.includes('splitRatio') || d.dims.includes('headingWidth')) out.push('Rebalanced headings, text and pictures side by side');
  if (d.creative.includes('visualMood') && MOOD_WORDS[acd.visualMood]) out.push(`Shifted the overall mood to ${MOOD_WORDS[acd.visualMood]}`);
  else if (d.creative.includes('concept')) out.push('Gave the site a new creative direction');
  if (d.motionIntensity || d.dims.includes('motion')) out.push('Adjusted the motion');
  return [...new Set(out)].slice(0, 8);
}

// ---- Creative (scene plans) -------------------------------------------------------------------------------------------
function measureCreativeChange(before, after) {
  const b = before || {}, a = after || {};
  const details = { concept: false, palette: 0, type: [], atmosphere: [], tempo: false, thread: false, art: [], scenes: { added: 0, removed: 0, reordered: false, restaged: 0, rewritten: 0 } };
  let score = 0;
  if (((b.concept || {}).title || '') !== ((a.concept || {}).title || '') || ((b.concept || {}).logline || '') !== ((a.concept || {}).logline || '')) { details.concept = true; score += 1.5; }
  ['bg', 'bg2', 'ink', 'muted', 'accent', 'glow'].forEach(k => { if (((b.palette || {})[k] || '') !== ((a.palette || {})[k] || '')) details.palette++; });
  score += Math.min(2, details.palette * 0.4);
  ['display', 'scale', 'case'].forEach(k => { if (((b.type || {})[k] || '') !== ((a.type || {})[k] || '')) { details.type.push(k); score += k === 'display' ? 1.5 : 0.5; } });
  ['backdrop', 'light', 'particles'].forEach(k => { if (((b.atmosphere || {})[k] || '') !== ((a.atmosphere || {})[k] || '')) { details.atmosphere.push(k); score += 0.5; } });
  if (((b.motion || {}).tempo || '') !== ((a.motion || {}).tempo || '')) { details.tempo = true; score += 1; }
  if (((b.thread || {}).kind || '') !== ((a.thread || {}).kind || '')) { details.thread = true; score += 0.5; }
  // the art direction: how the page moves and scrolls, its typography and navigation treatment
  ['personality', 'scroll', 'typo', 'nav'].forEach(k => { if (((b.art || {})[k] || '') !== ((a.art || {})[k] || '')) { details.art.push(k); score += k === 'personality' ? 1.5 : k === 'scroll' ? 1 : 0.5; } });
  const bs = Array.isArray(b.scenes) ? b.scenes : [], as = Array.isArray(a.scenes) ? a.scenes : [];
  const bIds = bs.map(s => s.id), aIds = as.map(s => s.id);
  details.scenes.added = aIds.filter(id => !bIds.includes(id)).length;
  details.scenes.removed = bIds.filter(id => !aIds.includes(id)).length;
  details.scenes.reordered = !same(bIds.filter(id => aIds.includes(id)), aIds.filter(id => bIds.includes(id)));
  const bById = new Map(bs.map(s => [s.id, s]));
  as.forEach(s => {
    const o = bById.get(s.id); if (!o) return;
    const stage = x => JSON.stringify({ h: x.height, pin: !!x.pin, cam: x.camera, bg: x.background, layout: x.layout || 'free', choreo: x.choreo || 'settle', handoff: x.handoff || 'cut', layers: (x.layers || []).map(L => [L.kind, L.role, L.mask, L.asset, L.box && L.box.d]) });
    if (stage(o) !== stage(s)) details.scenes.restaged++;
    const words = x => JSON.stringify([x.text && x.text.kicker, x.text && x.text.heading, x.text && x.text.body]);
    if (words(o) !== words(s)) details.scenes.rewritten++;
  });
  score += details.scenes.added + details.scenes.removed + (details.scenes.reordered ? 1 : 0) + details.scenes.restaged * 0.75 + Math.min(2, details.scenes.rewritten * 0.4);
  const areas = [details.concept || details.scenes.rewritten ? 'words' : null, details.palette || details.type.length || details.atmosphere.length ? 'look' : null, details.tempo || details.thread || details.art.includes('personality') || details.art.includes('scroll') ? 'motion' : null, details.scenes.added || details.scenes.removed || details.scenes.reordered || details.scenes.restaged ? 'structure' : null].filter(Boolean);
  return { score: +score.toFixed(2), areas, details };
}
function describeCreativeChange(measure) {
  const d = measure.details, out = [];
  if (d.concept) out.push('Gave the page a new creative concept');
  if (d.type.includes('display')) out.push('Changed the display typography');
  if (d.palette >= 3) out.push('Changed the colour palette'); else if (d.palette) out.push('Adjusted the colours');
  if (d.atmosphere.length) out.push('Changed the atmosphere and backdrop');
  if ((d.art || []).includes('personality')) out.push('Gave the page a new motion personality');
  if ((d.art || []).includes('scroll')) out.push('Changed what scrolling does to the page');
  if (d.tempo || d.thread) out.push('Changed the pacing and motion');
  if (d.scenes.added || d.scenes.removed) out.push(`Reworked the page's scenes (${d.scenes.added} added, ${d.scenes.removed} removed)`);
  else if (d.scenes.reordered) out.push('Reordered the scenes');
  if (d.scenes.restaged) out.push(`Recomposed ${d.scenes.restaged} scene${d.scenes.restaged === 1 ? '' : 's'}`);
  if (d.scenes.rewritten) out.push('Rewrote the page\'s words');
  return out.slice(0, 8);
}

module.exports = { measureBusinessChange, isMeaningful, describeBusinessChange, measureCreativeChange, describeCreativeChange, THRESHOLDS };
