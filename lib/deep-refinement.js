// "Update My Website" -- the REDESIGN path (deep_refinement, see lib/edit-classifier.js) for a Business website.
//
// The surgical path (lib/refinement-normalizer.js + lib/apply-refinement-plan.js) turns a request into at most 8
// tiny operations on ONE page: three copy fields, seven design enums, default-shell sections. A request that describes
// a result ("make it feel premium", "redesign the hero") cannot be expressed that way, so this path does what the
// original planner does, starting from the site the owner already has:
//
//   buildRedesignContext   the WHOLE site, compactly: identity, the owner's own description and declared facts,
//                          strategy, creative direction, every controlled design value, the type system, the hero,
//                          every page with every section (type, variant, intent, copy, picture, form), the pictures.
//                          Never image bytes, never image prompts.
//   redesignTool           a strict schema (submit_website_redesign) built from the SAME enum vocabularies as the
//                          planner's submit_website_plan -- revised design values, type system, creative direction,
//                          hero, and scoped page plans. Pages it does not return are copied untouched.
//   normalizeRedesignPlan  validates every field against those vocabularies, maps every section back to the real
//                          stored section it revises (by id -- keeping its pictures, form, CTA target and settings),
//                          runs every new sentence through the generator's own fact/proof/filler rules
//                          (lib/premium/quality-review.js CLAIM_PATTERNS + GENERIC_PHRASES, lib/premium/semantic.js
//                          FAKE_PROOF + GENERIC) plus a numbers/contact check, and drops -- never "fixes" -- the rest.
//   applyRedesignPlan      builds the revised directionsState on a copy. The caller saves it through
//                          projectStore.updateOwnedProject, which re-validates the whole state like every save.
//
// Not a second website format: the result is an ordinary direction (the same pages/sections/design/intent fields the
// planner produces and lib/site-render.js renders). No HTML, CSS or code ever comes from the model, no picture is
// generated (Business pictures are the owner's uploads, then SiteRemade's starter visuals, then designed graphics --
// lib/premium/visual-mode.js), and nothing in assets is added, removed or replaced.
'use strict';
const crypto = require('crypto');
const VOCAB = require('./vocabulary');
const { SECTION_VARIANTS } = require('./refinement-normalizer');
const tokensLib = require('./premium/design-tokens');
const VE = require('./premium/visual-engine');
const ME = require('./premium/motion-engine');
const SB = require('./premium/hero-storyboard');
const { CLAIM_PATTERNS, GENERIC_PHRASES } = require('./premium/quality-review');
const { FAKE_PROOF, GENERIC } = require('./premium/semantic');
const render = require('./site-render');

const MAX_PAGES = 6;
const MAX_SECTIONS_PER_PAGE = 12;
// the design values a redesign may set (tool name -> stored design.dimensions key)
const DESIGN_FIELDS = {
  hero: 'hero', typography: 'type', nav: 'nav', card: 'card', imagery: 'imagery', cta: 'cta', colorBehavior: 'colorBehavior',
  motion: 'motion', spacing: 'spacing', pattern: 'pattern', contentWidth: 'contentWidth', imageDominance: 'imageDominance',
  imageArrangement: 'imageArrangement', sectionRhythm: 'sectionRhythm', sectionAlignment: 'sectionAlignment',
  typographyScale: 'typographyScale', headingWidth: 'headingWidth', cardDensity: 'cardDensity', cardShape: 'cardShape', splitRatio: 'splitRatio',
};
const CREATIVE_FIELDS = ['concept', 'visualMood', 'narrativeStrategy', 'imageStrategy', 'signatureMotif', 'heroStrategy', 'pageRhythm'];
// editorialFeature is a premium section with its own variants (lib/premium/editorial.js renderFeature)
const EDITORIAL_VARIANTS = ['image-left', 'image-right', 'full', 'quote'];
// Section types a redesign may ADD. Everything the renderer fills from the owner's own offerings/description or
// presents as a designed layout. Not addable (only kept if the site already has them): testimonials and team (people
// and quotes the owner never supplied), proof/metrics (numbers), pricing (prices), integrations (named products).
const ADDABLE_TYPES = ['services', 'features', 'productShowcase', 'process', 'gallery', 'caseStudies', 'imageLedEditorial', 'editorialFeature', 'about', 'faq', 'serviceAreas', 'contact', 'newsletter', 'ctaBanner', 'reservationCta', 'menu'];
// a page may hold several editorial features (the premium sequence does); any other type once per page
const REPEATABLE_TYPES = ['editorialFeature'];
// when a request asks for a plain/static hero, a new hero layout replaces the moving storyboard
const STATIC_HERO_ASK = /\b(static|no (animation|motion|movement)|without (the )?(animation|motion)|stop (the )?(animation|moving)|text[- ]only|simple hero|single (image|photo|picture))\b/i;
const PAGE_REMOVAL_ASK = /\b(remove|delete|drop|get rid of|fewer|combine|merge|consolidat\w*)\b[^.]{0,40}\bpages?\b|\bone[- ]page\b|\bsingle[- ]page\b/i;
// SiteRemade's token spacing/typography that best matches a stored dimension, when the model sets the dimension but
// not the type system (a premium site draws its type and rhythm from design.premiumTokens)
const SPACING_TO_TOKEN = { compact: 'tight', standard: 'standard', airy: 'airy', generous: 'airy' };
const TYPE_TO_TOKEN = { 'serif-editorial': 'editorial-contrast', 'classic-serif-mix': 'warm-editorial', 'geo-sans': 'refined-sans', 'display-condensed': 'technical-sans', 'mono-technical': 'technical-sans', humanist: 'humanist-workhorse' };
const COPY_LIMITS = { kicker: 40, headline: 140, sub: 280, body: 700, ctaLabel: 40, label: 40, purpose: 200 };
const CTA_LABEL = /^[A-Za-z0-9][A-Za-z0-9 '’&!?.,+-]{0,39}$/;
// proof words the generator's own lists don't carry; only allowed when the owner's words already have them
const EXTRA_CLAIMS = [/\baccredit(ed|ation)\b/i, /\b(top|highest|best)[- ]rated\b/i, /\brated\b/i, /\breviews?\b/i, /\btestimonials?\b/i, /\baward(s|ed)?\b/i, /\bfamily[- ](owned|run)\b/i, /\bestablished\b/i, /\bfounded\b/i, /\bexperienced team\b/i, /\bour team of\b/i, /\bexperts? in\b/i, /\bleading\b/i, /\bno\.? ?1\b/i, /\bnumber one\b/i, /\bpremier\b/i];

const isObj = v => !!v && typeof v === 'object' && !Array.isArray(v);
const clip = (v, n) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, n) : '');
const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9#@.+ ]+/g, ' ').replace(/\s+/g, ' ').trim();
function tokensOf(direction) { return (direction.design && tokensLib.sanitizeTokens(direction.design.premiumTokens)) || null; }
function spacingKeyOf(vars) { const hit = Object.keys(tokensLib.SPACING).find(k => tokensLib.SPACING[k].major === vars['--site-space-major']); return hit || null; }
function copyOf(section) { return isObj(section && section.copy) ? section.copy : {}; }
function newId(type) { return `${type}-${Date.now().toString(36)}${crypto.randomBytes(3).toString('hex')}`; }
function slugify(s) { return String(s || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40); }

// ---- context -------------------------------------------------------------------------------------------------------
function sectionHasPicture(direction, section) {
  const plan = Array.isArray(direction.imagePlan) ? direction.imagePlan : [];
  const gen = (direction.assets && direction.assets.generated) || {};
  return plan.some(e => (e.section === section.id || String(e.slot || '').startsWith(section.id + '::')) && e.sourceType && e.sourceType !== 'designed')
    || Object.keys(gen).some(slot => slot.startsWith(section.id + '::') && gen[slot] && (gen[slot].assetRef || gen[slot].dataUrl));
}
function uploadsOf(direction) {
  const items = (direction.assets && Array.isArray(direction.assets.items)) ? direction.assets.items : [];
  const plan = (direction.assets && direction.assets.plan) || {};
  const usedAs = id => Object.keys(plan).filter(k => plan[k] === id || (Array.isArray(plan[k]) && plan[k].includes(id)));
  return items.filter(a => a && a.id).map(a => ({ id: a.id, name: clip(a.name, 80) || undefined, alt: clip(a.alt, 120) || undefined, usedAs: usedAs(a.id) }));
}
// A compact but complete picture of the site -- everything the planner decides, nothing it doesn't need.
function buildRedesignContext(direction, { classification } = {}) {
  const d = isObj(direction) ? direction : {};
  const source = isObj(d.source) ? d.source : {};
  const dims = (d.design && d.design.dimensions) || {};
  const tokens = tokensOf(d);
  const sb = SB.activeStoryboard(d);
  const copy = isObj(d.copy) ? d.copy : {};
  const intent = isObj(d.intent) ? d.intent : {};
  const design = {};
  Object.keys(DESIGN_FIELDS).forEach(k => { if (dims[DESIGN_FIELDS[k]] != null) design[k] = dims[DESIGN_FIELDS[k]]; });
  return {
    scope: classification ? { reading: classification.scope, targetPages: classification.targetPages || 'any' } : undefined,
    business: { name: d.business && d.business.name, category: d.business && d.business.categoryKey, offerings: d.business && d.business.offerings, tone: d.business && d.business.tone, understanding: d.business && d.business.understanding },
    ownerDescription: clip(source.text, 1500),
    declaredFacts: { location: source.location || undefined, facts: isObj(source.facts) && Object.keys(source.facts).length ? source.facts : undefined },
    strategy: d.strategy ? { archetype: d.strategy.archetype, visitorIntent: d.strategy.visitorIntent, conversion: d.strategy.conversion, credibilityStrategy: d.strategy.credibilityStrategy } : undefined,
    creativeDirection: intent.creativeDirection || null,
    design,
    heroOnScreen: render.effectiveHeroLayout(d),
    typeSystem: tokens ? { typography: tokens.typographyKey, spacing: spacingKeyOf(tokens.vars) } : null,
    motionIntensity: d.design && d.design.premium && d.design.premium.mi || null,
    hero: {
      kicker: copy.kicker, headline: copy.headline, sub: copy.sub, ctaLabel: copy.cta,
      storyboard: sb ? { composition: sb.composition, tone: sb.tone, images: sb.layers.map(l => ({ role: l.role, subject: clip(l.subject, 80) })), note: 'The hero is a moving multi-image storyboard. Redesign it with storyboardComposition/storyboardTone and the hero copy; setting design.hero instead replaces it with a static layout.' } : null,
    },
    navigation: (d.pages || []).map(p => p.label),
    pages: (d.pages || []).map((p, i) => ({
      id: p.id, label: p.label, slug: p.slug || (i === 0 ? '' : undefined), purpose: p.purpose || undefined, isHome: i === 0,
      sections: (p.sections || []).map(s => {
        const c = copyOf(s);
        return {
          id: s.id, type: s.type, variant: s.variant, intent: s.intent, headlineRole: s.headlineRole, mediaComposition: s.mediaComposition,
          copy: Object.keys(c).length ? { headline: clip(c.headline, 160) || undefined, body: clip(c.body, 300) || undefined, ctaLabel: clip(c.ctaLabel, 40) || undefined } : 'renderer default (written from the business description)',
          picture: sectionHasPicture(d, s) || undefined,
          form: s.module ? s.module.type : undefined,
        };
      }),
    })),
    ownerUploads: uploadsOf(d),
    rules: [
      'Keep every section you are revising by its id (ref): that keeps its pictures, form and settings. A section you leave out of a page you return is removed from that page; a page you do not return is kept exactly as it is.',
      'Sections that hold a form are always kept. Owner uploads are always kept.',
      'No new pictures are created for this website. A section you add gets a designed graphic, not a photo -- prefer re-using sections that already have a picture for image-led moments.',
      'New testimonials, team, proof, metrics, pricing and integrations sections cannot be added (they would need facts the owner has not given).',
    ],
  };
}

// ---- tool schema ------------------------------------------------------------------------------------------------------
// vocab: the planner's enum lists, passed in from server.js (the same constants submit_website_plan is built from)
function redesignTool(v) {
  const e = (list, description) => Object.assign({ type: 'string', enum: list }, description ? { description } : {});
  const str = description => Object.assign({ type: 'string' }, description ? { description } : {});
  const designProps = {
    hero: e(v.heroKeys), typography: e(v.typeKeys), nav: e(v.navKeys), card: e(v.cardKeys), imagery: e(v.imageryKeys), cta: e(v.ctaKeys),
    colorBehavior: e(v.colorBehaviorKeys), motion: e(v.motionKeys), spacing: e(v.spacingKeys), pattern: e(v.patternKeys),
    contentWidth: e(v.contentWidthKeys), imageDominance: e(v.imageDominanceKeys), imageArrangement: e(v.imageArrangementKeys),
    sectionRhythm: e(v.sectionRhythmKeys), sectionAlignment: e(v.sectionAlignmentKeys), typographyScale: e(v.typographyScaleKeys),
    headingWidth: e(v.headingWidthKeys), cardDensity: e(v.cardDensityKeys), cardShape: e(v.cardShapeKeys), splitRatio: e(v.splitRatioKeys),
  };
  return {
    name: 'submit_website_redesign',
    description: 'Submit the revised structured website: design decisions, hero, and the pages/sections that change. Structure and copy only -- never HTML, CSS, or code.',
    input_schema: {
      type: 'object', additionalProperties: false,
      required: ['interpretation', 'design', 'creativeDirection', 'hero'],
      properties: {
        interpretation: str('One sentence: what the owner is really asking for, and how this revision delivers it.'),
        design: { type: 'object', additionalProperties: false, properties: designProps, description: 'The complete revised set of controlled design values. Repeat values that stay the same.' },
        typeSystem: { type: 'object', additionalProperties: false, description: 'The type pairing and vertical rhythm every page draws its text and spacing from.', properties: {
          typography: e(Object.keys(tokensLib.TYPE_SYSTEMS)), spacing: e(Object.keys(tokensLib.SPACING)) } },
        motionIntensity: e(ME.MOTION_INTENSITY, 'How much the site moves overall.'),
        creativeDirection: { type: 'object', additionalProperties: false, properties: {
          concept: e(v.creativeConceptKeys), visualMood: e(v.creativeMoodKeys), narrativeStrategy: e(v.creativeNarrativeKeys), imageStrategy: e(v.creativeImageStrategyKeys),
          signatureMotif: e(v.creativeSignatureKeys), heroStrategy: e(v.creativeHeroStrategyKeys), pageRhythm: e(v.creativePageRhythmKeys),
          avoid: { type: 'array', maxItems: 3, items: e(v.creativeAvoidKeys) } } },
        hero: { type: 'object', additionalProperties: false, properties: {
          kicker: str(), headline: str('The single most important line on the site, in the owner\'s own terms.'), sub: str(), ctaLabel: str(),
          storyboardComposition: e(SB.COMPOSITION_KEYS, 'Only when the site has a hero storyboard: its new composition.'),
          storyboardTone: e(['dark', 'light'], 'Only when the site has a hero storyboard.') } },
        pages: {
          type: 'array', maxItems: MAX_PAGES,
          description: 'Only the pages that change, each with its COMPLETE revised section list in order. Pages you leave out are kept exactly as they are.',
          items: { type: 'object', additionalProperties: false, required: ['pageId', 'sections'], properties: {
            pageId: str('An existing page id, or "new" for a new page.'), label: str(), purpose: str(),
            sections: { type: 'array', minItems: 1, maxItems: 10, items: { type: 'object', additionalProperties: false, required: ['type'], properties: {
              ref: str('The id of the existing section this entry revises (keeps its pictures, form and settings). Omit for a new section.'),
              type: e(v.sectionTypes.concat(['editorialFeature'])), variant: str('A layout variant the section type supports.'),
              intent: e(v.sectionIntentKeys), headlineRole: e(v.headlineRoleKeys), mediaComposition: e(VE.MEDIA_COMPOSITION_KEYS),
              headline: str(), body: str(), ctaLabel: str() } } } } },
        },
        pageOrder: { type: 'array', maxItems: MAX_PAGES, items: { type: 'string' }, description: 'Optional new navigation order, by page id (Home stays first).' },
        removePages: { type: 'array', maxItems: 4, items: { type: 'string' }, description: 'Only when the owner asked for fewer pages: page ids to remove (never Home).' },
      },
    },
  };
}

// ---- fact guard -------------------------------------------------------------------------------------------------------
// What the owner has already said or the site already says: new copy may only repeat claims, numbers, emails and links
// found here. Everything else a sentence might "add" (a rating, a year, a price, a phone number, an award) is rejected.
function copyCorpus(direction) {
  const parts = [];
  const push = v => { if (typeof v === 'string') parts.push(v); else if (Array.isArray(v)) v.forEach(push); else if (isObj(v)) Object.values(v).forEach(push); };
  const d = direction || {};
  push(d.source && d.source.text); push(d.source && d.source.facts); push(d.source && d.source.location);
  push(d.business); push(d.copy);
  (d.pages || []).forEach(p => { push(p.label); push(p.purpose); (p.sections || []).forEach(s => push(s.copy)); });
  const text = parts.join(' . ');
  return { norm: norm(text), numbers: new Set((text.match(/\d[\d,.]*/g) || []).map(n => n.replace(/[.,]+$/, '').replace(/,/g, ''))), lower: text.toLowerCase() };
}
// The facts a sentence carries: phone numbers, emails, links, and any other number (a year, a price, an address).
function factAnchors(text) {
  const t = String(text || '');
  const links = (t.match(/[^\s@]+@[^\s@]+\.[a-z]{2,}|https?:\/\/\S+|www\.\S+/gi) || []).map(x => x.toLowerCase());
  const numbers = (t.match(/\+?\d[\d\s().-]{5,}\d|\d[\d,.]*/g) || []).map(n => n.replace(/[^\d]/g, '')).filter(Boolean);
  return links.concat(numbers);
}
// New copy may not silently drop a fact the text it replaces carried ("Call 503-555-0147." -> a line with no number).
function lostFact(previous, next) {
  if (!previous) return null;
  const kept = factAnchors(next).join(' ');
  const lost = factAnchors(previous).filter(a => !kept.includes(a) && !String(next).toLowerCase().includes(a));
  return lost.length ? `would remove a fact the owner gave (${lost[0]})` : null;
}
function copyProblem(text, corpus, field) {
  if (!text) return 'empty';
  if (GENERIC_PHRASES.concat(GENERIC).some(re => re.test(text))) return 'generic filler';
  for (const re of CLAIM_PATTERNS.concat(FAKE_PROOF, EXTRA_CLAIMS)) {
    const m = re.exec(text);
    if (m && !corpus.norm.includes(norm(m[0]))) return `unsupported claim "${m[0]}"`;
  }
  for (const n of (text.match(/\d[\d,.]*/g) || []).map(x => x.replace(/[.,]+$/, '').replace(/,/g, ''))) if (n && !corpus.numbers.has(n)) return `a number the owner never gave (${n})`;
  for (const m of text.match(/[^\s@]+@[^\s@]+\.[a-z]{2,}|https?:\/\/\S+|www\.\S+/gi) || []) if (!corpus.lower.includes(m.toLowerCase())) return 'a contact detail or link the owner never gave';
  if (field === 'ctaLabel' && !CTA_LABEL.test(text)) return 'not a button label';
  return null;
}

// ---- validation -------------------------------------------------------------------------------------------------------
// -> { plan, dropped: [{where, reason}] } | null (nothing usable). Never throws, never invents a value.
function normalizeRedesignPlan(raw, direction, { vocab, classification, request } = {}) {
  if (!isObj(raw) || !isObj(direction) || !Array.isArray(direction.pages) || !direction.pages.length || !isObj(vocab)) return null;
  const dropped = [];
  const drop = (where, reason) => dropped.push({ where, reason });
  const scope = (classification && classification.scope) || 'site';
  const corpus = copyCorpus(direction);
  // previous: the text this field replaces -- a phone number, email, link or number it carried must survive
  const text = (value, field, where, limit, previous) => {
    if (value == null || value === '') return null;
    const v = clip(value, limit || COPY_LIMITS[field] || 300);
    const problem = copyProblem(v, corpus, field) || lostFact(previous, v);
    if (problem) { drop(where, problem); return null; }
    return v;
  };
  const oldHero = isObj(direction.copy) ? direction.copy : {};
  const plan = { design: {}, typeSystem: {}, creativeDirection: {}, hero: {}, pages: [], pageOrder: null, removePages: [], interpretation: clip(raw.interpretation, 300) };

  // design values: every one checked against the planner's own vocabulary
  const allow = {
    hero: vocab.heroKeys, typography: vocab.typeKeys, nav: vocab.navKeys, card: vocab.cardKeys, imagery: vocab.imageryKeys, cta: vocab.ctaKeys,
    colorBehavior: vocab.colorBehaviorKeys, motion: vocab.motionKeys, spacing: vocab.spacingKeys, pattern: vocab.patternKeys, contentWidth: vocab.contentWidthKeys,
    imageDominance: vocab.imageDominanceKeys, imageArrangement: vocab.imageArrangementKeys, sectionRhythm: vocab.sectionRhythmKeys, sectionAlignment: vocab.sectionAlignmentKeys,
    typographyScale: vocab.typographyScaleKeys, headingWidth: vocab.headingWidthKeys, cardDensity: vocab.cardDensityKeys, cardShape: vocab.cardShapeKeys, splitRatio: vocab.splitRatioKeys,
  };
  if (isObj(raw.design)) Object.keys(raw.design).forEach(k => {
    if (allow[k] && allow[k].includes(raw.design[k])) plan.design[DESIGN_FIELDS[k]] = raw.design[k]; else drop(`design.${k}`, 'not a supported value');
  });
  // the moving hero storyboard stays unless the owner asked for a static hero; its composition is the way to redesign it
  const sb = SB.activeStoryboard(direction);
  const currentHero = direction.design && direction.design.dimensions && direction.design.dimensions.hero;
  if (sb && plan.design.hero && plan.design.hero !== currentHero && !STATIC_HERO_ASK.test(String(request || ''))) {
    delete plan.design.hero; drop('design.hero', 'kept the moving hero storyboard (redesigned through its composition)');
  }
  if (isObj(raw.typeSystem)) {
    if (tokensLib.TYPE_SYSTEMS[raw.typeSystem.typography]) plan.typeSystem.typography = raw.typeSystem.typography; else if (raw.typeSystem.typography) drop('typeSystem.typography', 'not a supported value');
    if (tokensLib.SPACING[raw.typeSystem.spacing]) plan.typeSystem.spacing = raw.typeSystem.spacing; else if (raw.typeSystem.spacing) drop('typeSystem.spacing', 'not a supported value');
  }
  if (ME.MOTION_INTENSITY.includes(raw.motionIntensity)) plan.motionIntensity = raw.motionIntensity;
  const cdAllow = { concept: vocab.creativeConceptKeys, visualMood: vocab.creativeMoodKeys, narrativeStrategy: vocab.creativeNarrativeKeys, imageStrategy: vocab.creativeImageStrategyKeys, signatureMotif: vocab.creativeSignatureKeys, heroStrategy: vocab.creativeHeroStrategyKeys, pageRhythm: vocab.creativePageRhythmKeys };
  if (isObj(raw.creativeDirection)) {
    CREATIVE_FIELDS.forEach(k => { const val = raw.creativeDirection[k]; if (val == null) return; if (cdAllow[k] && cdAllow[k].includes(val)) plan.creativeDirection[k] = val; else drop(`creativeDirection.${k}`, 'not a supported value'); });
    if (Array.isArray(raw.creativeDirection.avoid)) plan.creativeDirection.avoid = raw.creativeDirection.avoid.filter(a => (vocab.creativeAvoidKeys || []).includes(a)).slice(0, 3);
  }
  // hero copy + storyboard
  if (isObj(raw.hero)) {
    const h = raw.hero;
    const kicker = text(h.kicker, 'kicker', 'hero.kicker', null, oldHero.kicker); if (kicker) plan.hero.kicker = kicker;
    const headline = text(h.headline, 'headline', 'hero.headline', 120, oldHero.headline); if (headline) plan.hero.headline = headline;
    const sub = text(h.sub, 'sub', 'hero.sub', null, oldHero.sub); if (sub) plan.hero.sub = sub;
    const cta = text(h.ctaLabel, 'ctaLabel', 'hero.ctaLabel', null, oldHero.cta); if (cta) plan.hero.cta = cta;
    if (sb && SB.COMPOSITION_KEYS.includes(h.storyboardComposition)) plan.hero.storyboardComposition = h.storyboardComposition;
    if (sb && ['dark', 'light'].includes(h.storyboardTone)) plan.hero.storyboardTone = h.storyboardTone;
  }

  // pages -- a hero-only request never restructures pages; a homepage request only restructures the homepage
  const pageById = new Map(direction.pages.map(p => [p.id, p]));
  const homeId = direction.pages[0].id;
  const sectionHome = new Map();
  direction.pages.forEach(p => (p.sections || []).forEach(s => { if (s && s.id) sectionHome.set(s.id, { page: p, section: s }); }));
  const usedRefs = new Set();
  const seenPages = new Set();
  const hadTestimonials = [...sectionHome.values()].some(x => ['testimonial', 'testimonialsGrid'].includes(x.section.type));
  const rawPages = Array.isArray(raw.pages) ? raw.pages.slice(0, MAX_PAGES + 2) : [];
  let newPages = 0;
  for (const [pi, rp] of rawPages.entries()) {
    const where = `pages[${pi}]`;
    if (!isObj(rp) || !Array.isArray(rp.sections)) { drop(where, 'malformed page'); continue; }
    if (scope === 'hero') { drop(where, 'a hero redesign leaves the pages as they are'); continue; }
    const isNew = rp.pageId === 'new';
    const existing = isNew ? null : pageById.get(rp.pageId);
    if (!isNew && !existing) { drop(where, 'unknown page'); continue; }
    if (existing && seenPages.has(existing.id)) { drop(where, 'page returned twice'); continue; }
    if (classification && Array.isArray(classification.targetPages) && classification.targetPages.includes('home') && (isNew || existing.id !== homeId)) { drop(where, 'the request was about the homepage'); continue; }
    if (isNew && direction.pages.length + newPages >= MAX_PAGES) { drop(where, 'too many pages'); continue; }
    const label = text(rp.label, 'label', `${where}.label`);
    if (isNew && !label) { drop(where, 'a new page needs a name'); continue; }
    const sections = [];
    const typesOnPage = new Set();
    for (const [si, rs] of rp.sections.slice(0, MAX_SECTIONS_PER_PAGE).entries()) {
      const sw = `${where}.sections[${si}]`;
      if (!isObj(rs) || typeof rs.type !== 'string') { drop(sw, 'malformed section'); continue; }
      const ref = typeof rs.ref === 'string' && sectionHome.get(rs.ref);
      const reuse = ref && !usedRefs.has(rs.ref) && ref.section.type === rs.type ? ref.section : null;
      if (ref && !reuse) drop(sw, usedRefs.has(rs.ref) ? 'section used twice' : 'a section cannot change type (added as a new section instead)');
      if (!reuse) {
        if (!VOCAB.SECTION_TYPE_KEYS.includes(rs.type)) { drop(sw, 'unknown section type'); continue; }
        if (!ADDABLE_TYPES.includes(rs.type) && !(hadTestimonials && ['testimonial', 'testimonialsGrid'].includes(rs.type))) { drop(sw, `a new ${rs.type} section would need facts the owner has not given`); continue; }
      }
      if (typesOnPage.has(rs.type) && !REPEATABLE_TYPES.includes(rs.type)) { drop(sw, 'the same section twice on one page'); continue; }
      typesOnPage.add(rs.type);
      const known = rs.type === 'editorialFeature' ? EDITORIAL_VARIANTS : SECTION_VARIANTS[rs.type];
      const entry = { ref: reuse ? reuse.id : null, type: rs.type };
      if (known && known.includes(rs.variant)) entry.variant = rs.variant; else if (rs.variant && known) drop(`${sw}.variant`, 'not a variant this section has');
      if ((vocab.sectionIntentKeys || []).includes(rs.intent)) entry.intent = rs.intent;
      if ((vocab.headlineRoleKeys || []).includes(rs.headlineRole)) entry.headlineRole = rs.headlineRole;
      if (VE.MEDIA_COMPOSITION_KEYS.includes(rs.mediaComposition) && ['editorialFeature', 'about', 'productShowcase'].includes(rs.type)) entry.mediaComposition = rs.mediaComposition;
      const copy = {};
      ['headline', 'body', 'ctaLabel'].forEach(f => { const val = text(rs[f], f, `${sw}.${f}`, null, reuse ? copyOf(reuse)[f] : null); if (val) copy[f] = val; });
      if (Object.keys(copy).length) entry.copy = copy;
      if (reuse) usedRefs.add(reuse.id);
      sections.push(entry);
    }
    if (!sections.length) { drop(where, 'no usable sections'); continue; }
    if (existing) seenPages.add(existing.id); else newPages++;
    plan.pages.push({ pageId: existing ? existing.id : 'new', label: label || null, purpose: text(rp.purpose, 'purpose', `${where}.purpose`), sections });
  }
  if (Array.isArray(raw.pageOrder) && scope === 'site') {
    const order = raw.pageOrder.filter(id => pageById.has(id));
    if (order.length && order[0] === homeId) plan.pageOrder = order; else if (raw.pageOrder.length) drop('pageOrder', 'Home stays first');
  }
  if (Array.isArray(raw.removePages) && raw.removePages.length) {
    if (scope === 'site' && PAGE_REMOVAL_ASK.test(String(request || ''))) plan.removePages = raw.removePages.filter(id => id !== homeId && pageById.has(id) && !seenPages.has(id));
    else drop('removePages', 'the owner did not ask for fewer pages');
  }
  const anything = Object.keys(plan.design).length || Object.keys(plan.typeSystem).length || plan.motionIntensity || Object.keys(plan.creativeDirection).length
    || Object.keys(plan.hero).length || plan.pages.length || plan.pageOrder || plan.removePages.length;
  return anything ? { plan, dropped } : null;
}

// ---- apply ------------------------------------------------------------------------------------------------------------
// the stored token vars for one type system / spacing rhythm, from the same tables buildDesignTokens reads
function reviseTokens(stored, { typography, spacing }) {
  const t = tokensLib.sanitizeTokens(stored);
  if (!t) return null;
  const vars = Object.assign({}, t.vars);
  let typographyKey = t.typographyKey;
  const type = typography && tokensLib.TYPE_SYSTEMS[typography];
  if (type) {
    Object.assign(vars, {
      '--site-font-heading': type.heading, '--site-font-body': type.body, '--site-heading-weight': String(type.weight), '--site-heading-tracking': type.tracking,
      '--site-heading-line': String(type.lineHeight), '--site-body-line': String(type.bodyLine), '--site-measure': type.measure,
      '--site-h1': type.scale.h1, '--site-h2': type.scale.h2, '--site-h3': type.scale.h3, '--site-body-size': type.scale.body,
    });
    typographyKey = typography;
  }
  const space = spacing && tokensLib.SPACING[spacing];
  if (space) Object.assign(vars, { '--site-space-hero': space.hero, '--site-space-major': space.major, '--site-space-minor': space.minor, '--site-gap': space.gap });
  return tokensLib.sanitizeTokens({ premium: true, version: 1, typographyKey, vars });
}
// Which kinds of sections keep the owner's uploads on screen (assets.plan: gallery -> gallery-like, about -> about)
function uploadSurfaces(direction) {
  const items = new Set(((direction.assets && direction.assets.items) || []).map(a => a && a.id).filter(Boolean));
  const plan = (direction.assets && direction.assets.plan) || {};
  const has = k => (Array.isArray(plan[k]) ? plan[k] : [plan[k]]).some(id => items.has(id));
  const out = [];
  if (has('gallery')) out.push(['gallery', 'caseStudies', 'productShowcase']);
  if (has('about')) out.push(['about']);
  return out;
}

// -> { ok: true, state, preserved: [..] } | { ok: false, reason }. Never mutates directionsState.
function applyRedesignPlan(directionsState, directionIndex, plan) {
  if (!directionsState || !Array.isArray(directionsState.directions) || !isObj(plan)) return { ok: false, reason: 'invalid_input' };
  const state = JSON.parse(JSON.stringify(directionsState));
  const d = state.directions[directionIndex];
  if (!d || !Array.isArray(d.pages) || !d.pages.length) return { ok: false, reason: 'invalid_direction' };
  const before = directionsState.directions[directionIndex];
  const preserved = [];
  d.design = isObj(d.design) ? d.design : {};
  const dims = d.design.dimensions = Object.assign({}, d.design.dimensions || {});

  // design values -- and the hero actually shown: an unfunded hero keeps showing its text-only form of the new layout
  const oldHero = dims.hero;
  Object.assign(dims, plan.design);
  if (plan.design.hero && plan.design.hero !== oldHero) {
    const wasDowngraded = dims.heroDisplayVariant && dims.heroDisplayVariant !== oldHero;
    if (dims.heroDisplayVariant) dims.heroDisplayVariant = wasDowngraded ? render.mapHeroToTextOnlyVariant(plan.design.hero) : plan.design.hero;
    if (!d.design.heroLayout || d.design.heroLayout === oldHero) d.design.heroLayout = plan.design.hero;
  }
  // the type system (premium sites draw type and rhythm from it): explicit, or following the dimensions that changed
  if (d.design.premiumTokens) {
    const ts = {
      typography: plan.typeSystem.typography || (plan.design.type && plan.design.type !== (before.design.dimensions || {}).type ? TYPE_TO_TOKEN[plan.design.type] : null),
      spacing: plan.typeSystem.spacing || (plan.design.spacing && plan.design.spacing !== (before.design.dimensions || {}).spacing ? SPACING_TO_TOKEN[plan.design.spacing] : null),
    };
    if (ts.typography || ts.spacing) { const t = reviseTokens(d.design.premiumTokens, ts); if (t) d.design.premiumTokens = t; }
  }
  if (plan.motionIntensity && isObj(d.design.premium)) d.design.premium = Object.assign({}, d.design.premium, { mi: plan.motionIntensity });
  if (Object.keys(plan.creativeDirection).length) {
    d.intent = isObj(d.intent) ? d.intent : {};
    d.intent.creativeDirection = Object.assign({}, d.intent.creativeDirection || {}, plan.creativeDirection);
  }
  // hero copy + the storyboard's composition (its images stay exactly the same pictures)
  if (Object.keys(plan.hero).some(k => ['kicker', 'headline', 'sub', 'cta'].includes(k))) {
    d.copy = Object.assign({}, isObj(d.copy) ? d.copy : {});
    ['kicker', 'headline', 'sub', 'cta'].forEach(k => { if (plan.hero[k]) d.copy[k] = plan.hero[k]; });
  }
  if (d.heroStoryboard && (plan.hero.storyboardComposition || plan.hero.storyboardTone)) {
    const comp = plan.hero.storyboardComposition || d.heroStoryboard.composition;
    const spec = SB.COMPOSITIONS[comp];
    const next = Object.assign({}, d.heroStoryboard, { composition: comp, copySafe: spec.copy, tone: plan.hero.storyboardTone || d.heroStoryboard.tone });
    next.layers = (d.heroStoryboard.layers || []).map(l => Object.assign({}, l, spec.anchors[l.anchor] ? { shape: spec.anchors[l.anchor].shape } : {}));
    const clean = SB.sanitizeStored(next);
    if (clean) d.heroStoryboard = clean;
  }

  // pages
  const allSections = new Map();
  (before.pages || []).forEach(p => (p.sections || []).forEach(s => { if (s && s.id) allSections.set(s.id, { pageId: p.id, section: s }); }));
  const referenced = new Set(plan.pages.flatMap(p => p.sections.map(s => s.ref).filter(Boolean)));
  const build = entry => {
    const base = entry.ref ? JSON.parse(JSON.stringify(allSections.get(entry.ref).section)) : { id: newId(entry.type), type: entry.type, copy: null };
    if (entry.variant) base.variant = entry.variant;
    else if (!entry.ref) base.variant = entry.type === 'editorialFeature' ? 'image-left' : (SECTION_VARIANTS[entry.type] || [])[0];
    if (entry.intent) base.intent = entry.intent;
    if (entry.headlineRole) base.headlineRole = entry.headlineRole;
    if (entry.mediaComposition) base.mediaComposition = entry.mediaComposition;
    if (entry.copy) base.copy = Object.assign({}, isObj(base.copy) ? base.copy : {}, entry.copy);
    // shape-checked with every other field when the caller validates/saves the whole state (validateDirectionsState)
    return base;
  };
  let pages = d.pages.map(p => {
    const rp = plan.pages.find(x => x.pageId === p.id);
    // a page not in the plan keeps its own sections -- minus any that moved to a revised page
    if (!rp) return Object.assign({}, p, { sections: p.sections.filter(s => !(referenced.has(s.id))) });
    return Object.assign({}, p, { label: rp.label || p.label, purpose: rp.purpose || p.purpose, sections: rp.sections.map(build).filter(Boolean) });
  });
  const usedSlugs = new Set(pages.map(p => p.slug));
  plan.pages.filter(p => p.pageId === 'new').forEach(rp => {
    let slug = slugify(rp.label) || `page-${pages.length + 1}`; let n = 2; const root = slug;
    while (usedSlugs.has(slug) || slug === 'home') slug = `${root}-${n++}`;
    usedSlugs.add(slug);
    pages.push({ id: `page_${slug}_${crypto.randomBytes(4).toString('hex')}`, slug, label: rp.label, purpose: rp.purpose || '', sections: rp.sections.map(build).filter(Boolean) });
  });
  // never silently lose a working form: a form section the plan left out goes back on its own page
  const present = () => new Set(pages.flatMap(p => p.sections.map(s => s.id)));
  const restore = (item, why) => {
    const page = pages.find(p => p.id === item.pageId && !(plan.removePages || []).includes(p.id)) || pages[0];
    // back where it was (by its original position on its page), never in front of a footer
    const origPage = (before.pages || []).find(p => p.id === item.pageId);
    const origIdx = origPage ? origPage.sections.findIndex(s => s.id === item.section.id) : -1;
    const footerIdx = page.sections.findIndex(s => s.type === 'footer');
    const end = footerIdx === -1 ? page.sections.length : footerIdx;
    page.sections.splice(origIdx === -1 ? end : Math.min(origIdx, end), 0, JSON.parse(JSON.stringify(item.section)));
    preserved.push({ sectionId: item.section.id, type: item.section.type, why });
  };
  allSections.forEach(item => { if (item.section.module && !present().has(item.section.id)) restore(item, 'holds a working form'); });
  // never hide the owner's uploads: if no section that shows them is left, the one that did comes back
  uploadSurfaces(before).forEach(types => {
    if (pages.some(p => p.sections.some(s => types.includes(s.type)))) return;
    const item = [...allSections.values()].find(x => types.includes(x.section.type));
    if (item) restore(item, 'shows the owner\'s uploaded pictures');
  });
  // a revised page never ends up empty
  pages.forEach(p => { if (!p.sections.length) { const orig = before.pages.find(x => x.id === p.id); if (orig) p.sections = JSON.parse(JSON.stringify(orig.sections)); } });
  if (plan.removePages && plan.removePages.length) pages = pages.filter(p => !plan.removePages.includes(p.id) || p === pages[0]);
  if (plan.pageOrder) {
    const rank = id => { const i = plan.pageOrder.indexOf(id); return i === -1 ? 999 : i; };
    const home = pages[0];
    pages = [home].concat(pages.slice(1).sort((a, b) => rank(a.id) - rank(b.id)));
  }
  d.pages = pages.slice(0, MAX_PAGES);
  d.activePageIndex = 0;
  // the export renders the complete set of layout attributes the builder's live preview applies (lib/export-compiler.js)
  d.design.layoutDataset = 1;
  return { ok: true, state, preserved };
}

module.exports = { buildRedesignContext, redesignTool, normalizeRedesignPlan, applyRedesignPlan, copyProblem, copyCorpus, reviseTokens, DESIGN_FIELDS, ADDABLE_TYPES, EDITORIAL_VARIANTS };
