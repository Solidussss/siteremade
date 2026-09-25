'use strict';
// One strong business/creative strategy object that drives the WHOLE site
// (page priorities, art direction, typography, image roles, CTA system), so
// sections cannot each invent their own personality.
//
// It is derived deterministically from what the planner/analysis already
// produce (archetype, category, facts, creativeDirection) -- zero extra
// model calls -- and can be *refined* by one strong-model call the
// pipeline may run when budget allows (see pipeline.js). Nothing here
// invents facts: trust requirements are stated as requirements, and any
// claim signal is only used if it was supplied.

const ARCHETYPES = ['editorial-brand', 'portfolio', 'launch-campaign', 'ecommerce-showcase', 'product-led-saas', 'hospitality',
  'premium-consultancy', 'trust-heavy-professional', 'service-business', 'community-nonprofit', 'local-conversion'];

// Layout/personality pattern per archetype (Part 18: curated set, chosen by strategy, not random).
const PROFILES = {
  'local-conversion': {
    pattern: 'trust-heavy-local-service', personality: ['direct', 'trustworthy', 'clean', 'high-contrast'], conversionGoal: 'request_quote',
    typography: 'humanist-workhorse', spacing: 'tight-to-standard',
    hierarchy: ['hero', 'trustStrip', 'services', 'process', 'proof', 'serviceAreas', 'faq', 'ctaBanner', 'contact'],
    trust: ['licensed/insured status only if supplied', 'service area', 'real project photos when supplied', 'clear contact method above the fold'],
  },
  'trust-heavy-professional': {
    pattern: 'trust-heavy-professional', personality: ['credible', 'calm', 'precise'], conversionGoal: 'book_consultation',
    typography: 'refined-sans', spacing: 'standard',
    hierarchy: ['hero', 'trustStrip', 'services', 'about', 'process', 'proof', 'faq', 'ctaBanner', 'contact'],
    trust: ['credentials only if supplied', 'named approach/process', 'clear next step'],
  },
  'premium-consultancy': {
    pattern: 'premium-consultancy', personality: ['authoritative', 'quiet-luxury', 'considered'], conversionGoal: 'book_consultation',
    typography: 'editorial-contrast', spacing: 'airy',
    hierarchy: ['hero', 'positioning', 'services', 'method', 'about', 'proof', 'ctaBanner', 'contact'],
    trust: ['point of view stated plainly', 'method over adjectives', 'no invented client names'],
  },
  'service-business': {
    pattern: 'service-led', personality: ['approachable', 'competent', 'clean'], conversionGoal: 'request_quote',
    typography: 'humanist-workhorse', spacing: 'standard',
    hierarchy: ['hero', 'services', 'process', 'about', 'proof', 'faq', 'ctaBanner', 'contact'],
    trust: ['what is offered and where', 'process transparency', 'clear contact method'],
  },
  hospitality: {
    pattern: 'hospitality', personality: ['warm', 'inviting', 'sensory'], conversionGoal: 'reserve',
    typography: 'warm-editorial', spacing: 'airy',
    hierarchy: ['hero', 'menu', 'story', 'gallery', 'hours', 'reservationCta', 'contact'],
    trust: ['real hours/location only if supplied', 'real food/space photography preferred'],
  },
  portfolio: {
    pattern: 'portfolio-heavy', personality: ['confident', 'image-led', 'minimal-chrome'], conversionGoal: 'view_work',
    typography: 'editorial-contrast', spacing: 'airy',
    hierarchy: ['hero', 'gallery', 'about', 'services', 'testimonial', 'ctaBanner', 'contact'],
    trust: ['the work is the proof', 'real project media only'],
  },
  'editorial-brand': {
    pattern: 'editorial', personality: ['expressive', 'cinematic', 'confident'], conversionGoal: 'view_work',
    typography: 'editorial-contrast', spacing: 'airy',
    hierarchy: ['hero', 'imageLedEditorial', 'gallery', 'about', 'ctaBanner', 'contact'],
    trust: ['point of view', 'real imagery'],
  },
  'product-led-saas': {
    pattern: 'product-led', personality: ['precise', 'modern', 'technical'], conversionGoal: 'start_trial',
    typography: 'technical-sans', spacing: 'standard',
    hierarchy: ['hero', 'productShowcase', 'features', 'integrations', 'pricing', 'faq', 'ctaBanner'],
    trust: ['what the product concretely does', 'no invented customer logos or metrics'],
  },
  'launch-campaign': {
    pattern: 'product-led', personality: ['bold', 'focused', 'energetic'], conversionGoal: 'join_waitlist',
    typography: 'technical-sans', spacing: 'standard',
    hierarchy: ['hero', 'features', 'productShowcase', 'faq', 'ctaBanner'],
    trust: ['clear promise', 'no fabricated traction'],
  },
  'ecommerce-showcase': {
    pattern: 'product-led', personality: ['clean', 'desirable', 'image-led'], conversionGoal: 'buy',
    typography: 'refined-sans', spacing: 'standard',
    hierarchy: ['hero', 'gallery', 'features', 'testimonial', 'faq', 'ctaBanner'],
    trust: ['shipping/returns only if supplied', 'real product photography preferred'],
  },
  'community-nonprofit': {
    pattern: 'story-led', personality: ['warm', 'sincere', 'human'], conversionGoal: 'get_involved',
    typography: 'warm-editorial', spacing: 'standard',
    hierarchy: ['hero', 'story', 'programs', 'impact', 'ctaBanner', 'contact'],
    trust: ['real impact figures only if supplied', 'real people photography preferred'],
  },
};

const CONVERSION_GOALS = ['request_quote', 'book_consultation', 'call', 'reserve', 'buy', 'view_work', 'start_trial', 'join_waitlist', 'get_involved'];

// What the imagery for a category should be OF (photography subject seeds).
// Deliberately concrete nouns, never "relevant image".
const CATEGORY_SUBJECTS = {
  roofing: { hero: 'a finished residential roof on a well-kept suburban home', detail: 'close detail of clean shingle courses and flashing', context: 'roofing crew at work seen from a distance, faces not featured' },
  plumbing: { hero: 'a clean, modern kitchen sink and fixtures', detail: 'close detail of neat copper and PEX pipe fittings', context: 'a plumber at work seen from behind' },
  electrical: { hero: 'a tidy modern electrical panel in a finished utility room', detail: 'close detail of neatly labelled wiring and breakers', context: 'an electrician at work seen from behind' },
  painting: { hero: 'a freshly painted living room with clean edges', detail: 'close detail of a crisp painted wall edge and brush', context: 'painter cutting in a wall, face not featured' },
  landscaping: { hero: 'a well-kept residential garden and lawn in daylight', detail: 'close detail of stone edging and planting beds', context: 'landscaper tending a bed, face not featured' },
  cleaning: { hero: 'a bright, spotless living space with natural light', detail: 'close detail of a polished kitchen counter and clean surfaces', context: 'cleaning supplies neatly arranged, no people' },
  renovation: { hero: 'a completed renovated kitchen or living space, natural light', detail: 'close detail of custom cabinetry joinery and finishes', context: 'craftsperson measuring in a room under renovation, face not featured' },
  automotive: { hero: 'a clean vehicle in a tidy, well-lit workshop', detail: 'close detail of engine bay or wheel assembly', context: 'technician working under the hood, face not featured' },
  hospitality: { hero: 'a warmly lit dining room or plated dish', detail: 'close detail of a plated dish with natural texture', context: 'the room set for service, no identifiable guests' },
  creative: { hero: 'the photographer or studio at work: camera, light and a finished frame', detail: 'close detail of gear and workspace', context: 'a shoot in progress seen from a distance' },
  tech: { hero: 'an abstract, product-led brand visual in the brand palette', detail: 'abstract gradient and geometry suggesting data flow', context: 'a calm workspace with a closed laptop and notebook' },
  finance: { hero: 'a calm, well-lit professional office interior', detail: 'close detail of documents, pen and desk', context: 'a meeting room set for a discussion, no identifiable people' },
  professional: { hero: 'a calm, well-lit professional office or consultation space', detail: 'close detail of notebook, pen and desk', context: 'a meeting table set for a discussion, no identifiable people' },
  realestate: { hero: 'a well-composed home exterior at golden hour', detail: 'close detail of a bright interior', context: 'a staged living room' },
  wellness: { hero: 'a calm treatment or studio space in soft natural light', detail: 'close detail of natural textures', context: 'a quiet studio set for a session, no identifiable people' },
  fitness: { hero: 'a well-lit training space with equipment', detail: 'close detail of equipment', context: 'a class or training session seen from a distance' },
  fashion: { hero: 'an editorial garment styling shot in natural light', detail: 'close detail of fabric and stitching', context: 'a studio rail of garments' },
  retail: { hero: 'a well-merchandised product arrangement in natural light', detail: 'close detail of a product', context: 'a tidy shop interior' },
  education: { hero: 'a bright learning space with natural light', detail: 'close detail of notebooks and materials', context: 'a classroom set up, no identifiable students' },
  nonprofit: { hero: 'a community space in warm daylight', detail: 'close detail of hands at work on a shared task', context: 'volunteers seen from a distance, faces not featured' },
  other: { hero: 'a clean, well-lit working environment appropriate to the business', detail: 'close detail of the tools of the trade', context: 'the workspace, no identifiable people' },
};

const clean = (s, max) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, max || 240);
const pick = (v, allowed, dflt) => (allowed.includes(v) ? v : dflt);

// input: { description, categoryKey, categoryLabel, archetype, facts, location, claudeStrategy, creativeDirection }
function deriveStrategy(input) {
  const inp = input || {};
  const archetype = pick(inp.archetype, ARCHETYPES, 'service-business');
  const prof = PROFILES[archetype];
  const cd = inp.creativeDirection || {};
  const cs = inp.claudeStrategy || {};
  const facts = inp.facts || {};
  const hasProof = !!(facts.years || facts.rating || facts.count);
  const category = inp.categoryKey || 'other';
  const subjects = CATEGORY_SUBJECTS[category] || CATEGORY_SUBJECTS.other;
  return {
    version: 1,
    businessType: clean(inp.categoryLabel || category, 80),
    categoryKey: category,
    archetype,
    layoutPattern: prof.pattern,
    primaryCustomer: clean((cs.audience && cs.audience.primary) || inp.audience || 'People looking for this service', 160),
    primaryOffer: clean(inp.offering || cs.primaryOffer || inp.categoryLabel, 160),
    // Differentiator must come from the supplied description or planner, never be invented.
    strongestDifferentiator: clean(cd.concept || cs.differentiator || '', 200) || null,
    trustRequirements: prof.trust.slice(),
    hasSuppliedProof: hasProof,
    conversionGoal: pick(inp.conversionGoal, CONVERSION_GOALS, prof.conversionGoal),
    visualPersonality: (Array.isArray(cd.mood) ? cd.mood : cd.mood ? [cd.mood] : prof.personality).slice(0, 4),
    typographyDirection: prof.typography,
    spacingCharacter: prof.spacing,
    imageDirectionKey: cd.imageStrategy || null,
    sectionHierarchy: prof.hierarchy.slice(),
    pagePriorities: prof.hierarchy.slice(0, 3),
    location: clean(inp.location || '', 80) || null,
    // V3: when a business grounding is supplied, its sub-vertical imagery (e.g. skincare products) replaces the generic category subjects
    imageSubjects: (inp.grounding && inp.grounding.imagerySubjects) ? Object.assign({}, subjects, inp.grounding.imagerySubjects) : subjects,
    imageAvoid: (inp.grounding && inp.grounding.imageryAvoid) || [],
  };
}

// Accept a strategy from any source (planner refinement, stored project);
// anything malformed falls back field-by-field to the derived one.
function normalizeStrategy(raw, fallbackInput) {
  const base = deriveStrategy(fallbackInput);
  if (!raw || typeof raw !== 'object') return base;
  const out = Object.assign({}, base);
  if (typeof raw.primaryCustomer === 'string') out.primaryCustomer = clean(raw.primaryCustomer, 160) || base.primaryCustomer;
  if (typeof raw.primaryOffer === 'string') out.primaryOffer = clean(raw.primaryOffer, 160) || base.primaryOffer;
  if (typeof raw.strongestDifferentiator === 'string') out.strongestDifferentiator = clean(raw.strongestDifferentiator, 200) || null;
  out.conversionGoal = pick(raw.conversionGoal, CONVERSION_GOALS, base.conversionGoal);
  if (Array.isArray(raw.visualPersonality)) out.visualPersonality = raw.visualPersonality.map(x => clean(x, 40)).filter(Boolean).slice(0, 4);
  if (!out.visualPersonality.length) out.visualPersonality = base.visualPersonality;
  if (Array.isArray(raw.sectionHierarchy)) { const h = raw.sectionHierarchy.map(x => clean(x, 40)).filter(Boolean).slice(0, 14); if (h.length >= 3) out.sectionHierarchy = h; }
  return out;
}

module.exports = { ARCHETYPES, PROFILES, CATEGORY_SUBJECTS, CONVERSION_GOALS, deriveStrategy, normalizeStrategy };
