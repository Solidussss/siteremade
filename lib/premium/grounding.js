'use strict';
// BUSINESS_GROUNDING (V3): ONE authoritative description of what this business is and is not, derived from the
// customer's own words plus category/archetype rules, that every page, section, CTA, nav label and image prompt must obey.
//
// Three kinds of statement are kept strictly apart:
//   verifiedFacts      - literally present in what the customer supplied
//   inferred structure - what a business of this kind normally needs (sections, CTA vocabulary, image subjects)
//   forbidden invention- things a site must not assert unless supplied (testimonials, awards, years, staff, prices, ...)
//
// Pure, deterministic, no I/O: works in the browser bundle, on the server and in the Workplace updater. The optional
// whole-site critique (semantic.js) is the LLM layer on top; this file is the free layer underneath.

const esc = s => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// Whole-word match (optional plural). The legacy scorer only checked the character BEFORE a keyword, so "barrier" matched
// the hospitality keyword "bar", "apparel" matched "app", "space" matched "spa".
function wordMatch(text, kw) {
  const k = String(kw || '').trim().toLowerCase(); if (!k) return false;
  return new RegExp('(^|[^a-z0-9])' + esc(k) + '(?:s|es)?(?![a-z0-9])', 'i').test(String(text || '').toLowerCase());
}
const anyWord = (text, kws) => kws.some(k => wordMatch(text, k));

// ---- families: which "kind of website" this is -----------------------------------------------------------------------
function familyFor(archetype, categoryKey) {
  if (categoryKey === 'retail' || categoryKey === 'fashion' || archetype === 'ecommerce-showcase') return 'retail';
  if (archetype === 'editorial-brand' && categoryKey !== 'creative') return 'retail';
  if (archetype === 'hospitality' || categoryKey === 'hospitality') return 'hospitality';
  if (archetype === 'product-led-saas' || archetype === 'launch-campaign' || categoryKey === 'tech') return 'saas';
  if (archetype === 'community-nonprofit' || categoryKey === 'nonprofit') return 'nonprofit';
  if (archetype === 'local-conversion' && ['fitness', 'wellness'].includes(categoryKey)) return 'appointments';
  if (archetype === 'local-conversion') return 'local_service';
  if (['premium-consultancy', 'trust-heavy-professional'].includes(archetype) || ['finance', 'professional', 'realestate', 'education'].includes(categoryKey)) return 'professional';
  if (archetype === 'portfolio' || categoryKey === 'creative') return 'creative';
  return 'other';
}

// ---- sub-verticals: what is actually being sold (drives imagery + vocabulary) ------------------------------------------------
const SUBVERTICALS = [
  { id: 'skincare', label: 'skincare', family: 'retail', keywords: ['skincare', 'skin care', 'moisturizer', 'moisturiser', 'serum', 'cleanser', 'sunscreen', 'spf', 'toner', 'cosmetic', 'cosmetics', 'beauty', 'retinol', 'skin barrier', 'barrier repair', 'acne'],
    notService: ['facial', 'treatment', 'appointment', 'clinic', 'spa', 'esthetician', 'aesthetician', 'book a'],
    imagery: { hero: 'skincare products (bottles, jars and tubes) arranged on a clean surface in soft natural light', detail: 'close detail of a cream texture or a serum dropper', context: 'a calm vanity or bathroom shelf with skincare products, no faces' },
    avoid: ['handbag', 'purse', 'shoe', 'heel', 'sneaker', 'fashion model', 'runway', 'clothing', 'dress', 'jewelry', 'jewellery', 'restaurant', 'food', 'plate', 'dining', 'laptop', 'dashboard', 'office'] },
  { id: 'apparel', label: 'clothing', family: 'retail', keywords: ['clothing', 'apparel', 'menswear', 'womenswear', 'streetwear', 'garment', 'dresses', 'denim', 'knitwear'],
    imagery: { hero: 'garments styled on a rail or folded in natural light', detail: 'close detail of fabric and stitching', context: 'a tidy boutique rail, no identifiable faces' },
    avoid: ['skincare', 'serum', 'restaurant', 'food', 'plate', 'dashboard', 'laptop'] },
  { id: 'jewelry', label: 'jewellery', family: 'retail', keywords: ['jewelry', 'jewellery', 'rings', 'necklace', 'earrings', 'bracelet'],
    imagery: { hero: 'fine jewellery on a neutral surface in soft light', detail: 'macro detail of metal and stone', context: 'a jewellery tray on a workbench, no faces' },
    avoid: ['skincare', 'restaurant', 'food', 'dashboard', 'clothing rail'] },
  { id: 'home', label: 'home goods', family: 'retail', keywords: ['furniture', 'homeware', 'home goods', 'decor', 'candles', 'ceramics', 'linen', 'lighting'],
    imagery: { hero: 'a styled corner of a home with the products in natural light', detail: 'close detail of material and finish', context: 'a shelf styled with the products' },
    avoid: ['skincare', 'restaurant', 'food', 'dashboard', 'fashion model'] },
  { id: 'coffee_tea', label: 'coffee and tea', family: 'retail', keywords: ['coffee beans', 'roastery', 'loose leaf', 'tea blends', 'whole bean', 'ground coffee'],
    imagery: { hero: 'packaged coffee or tea products with beans or leaves on a wooden surface', detail: 'close detail of beans or leaves', context: 'a tidy shelf of packaged product' },
    avoid: ['dashboard', 'laptop', 'clothing', 'skincare'] },
  { id: 'pets', label: 'pet supplies', family: 'retail', keywords: ['pet supplies', 'dog food', 'cat food', 'pet store', 'pet accessories'],
    imagery: { hero: 'pet products arranged on a clean surface in daylight', detail: 'close detail of a product texture', context: 'a tidy pet-store shelf, no people' }, avoid: ['restaurant', 'dashboard', 'skincare'] },
];
function detectSubvertical(text) {
  const t = String(text || '');
  let best = null, bestScore = 0;
  SUBVERTICALS.forEach(sv => {
    const hits = sv.keywords.filter(k => wordMatch(t, k)).length;
    if (!hits) return;
    // a treatment/appointment business is a SERVICE business even if it says "skincare"
    if (sv.notService && sv.notService.some(k => wordMatch(t, k)) && !/\b(shop|store|products?|brand|online|buy|order)\b/i.test(t)) return;
    if (hits > bestScore) { best = sv; bestScore = hits; }
  });
  return best;
}

// ---- archetype inference with whole-word matching + family compatibility --------------------------------------------------
const ARCHETYPE_OVERRIDES = [
  { archetype: 'launch-campaign', keywords: ['launching', 'coming soon', 'pre-order', 'preorder', 'waitlist', 'early access', 'beta program'] },
  { archetype: 'premium-consultancy', keywords: ['luxury', 'high-end', 'high end', 'bespoke', 'private client', 'exclusive', 'boutique consult'] },
  { archetype: 'trust-heavy-professional', keywords: ['licensed', 'certified', 'accredited', 'regulated', 'law firm', 'legal', 'cpa'] },
  { archetype: 'editorial-brand', keywords: ['editorial', 'magazine', 'lookbook', 'journal-style'] },
  { archetype: 'portfolio', keywords: ['portfolio', 'showcase our work', 'case studies', 'our work speaks', 'video studio', 'documentary', 'documentaries', 'film studio', 'photography studio'] },
  { archetype: 'ecommerce-showcase', keywords: ['shop online', 'online store', 'buy online', 'e-commerce', 'ecommerce', 'dtc brand', 'direct-to-consumer'] },
  { archetype: 'community-nonprofit', keywords: ['nonprofit', 'non-profit', 'charity', 'volunteer', 'donate', 'ngo'] },
  { archetype: 'hospitality', keywords: ['restaurant', 'cafe', 'bistro', 'hotel', 'bar', 'reservation', 'menu'] },
  { archetype: 'product-led-saas', keywords: ['saas', 'software platform', 'api', 'developer tool', 'product-led'] },
  { archetype: 'local-conversion', keywords: ['near me', 'service area', 'same-day', 'same day', 'emergency service', 'free quote', 'serving the'] },
];
const COMPAT = {
  retail: ['ecommerce-showcase', 'editorial-brand', 'launch-campaign'],
  hospitality: ['hospitality', 'premium-consultancy', 'editorial-brand'],
  saas: ['product-led-saas', 'launch-campaign', 'premium-consultancy'],
};
function inferArchetypeStrict(categoryKey, text, categoryDefault, sv) {
  const fam = sv ? sv.family : null;
  for (const e of ARCHETYPE_OVERRIDES) {
    if (!anyWord(text, e.keywords)) continue;
    if (fam && COMPAT[fam] && !COMPAT[fam].includes(e.archetype)) continue; // "luxury skincare" is still a store, not a consultancy
    return e.archetype;
  }
  if (fam === 'retail') return 'ecommerce-showcase';
  return categoryDefault;
}
// Re-score the category with whole-word matching. `keywordMap` is the generator's own categoryKeywords table.
function strictCategory(text, keywordMap, fallback, sv) {
  if (sv && sv.family === 'retail') return 'retail';
  const t = String(text || '').toLowerCase();
  let bestKey = fallback || 'other', best = 0;
  Object.keys(keywordMap || {}).forEach(key => {
    const score = (keywordMap[key] || []).reduce((n, kw) => n + (wordMatch(t, kw.trim()) ? 1 : 0), 0);
    if (score > best) { best = score; bestKey = key; }
  });
  return best ? bestKey : (fallback || 'other');
}

// ---- rules per family ------------------------------------------------------------------------------------------------------
const W = (...ws) => ws;
const RULES = {
  retail: { sectionsForbidden: ['menu', 'reservationCta', 'pricing', 'integrations'], words: W('menu', 'reserve', 'reservation', 'guest', 'guests', 'plate', 'plates', 'table', 'dining', 'tasting', 'chef', 'starter', 'growth', 'enterprise', 'per seat', 'free trial', 'saas', 'workspace'),
    cta: { allow: /(shop|browse|view|explore|discover|see|visit|find|contact|learn|get in touch|join|sign up|subscribe)/i, forbid: /(reserve|book a|table|menu|free trial|demo|quote|estimate|track an order)/i }, pricing: 'products', primary: 'Shop now',
    pages: { home: 'brand and value, product emphasis, shop CTA', shop: 'products and categories, how to buy', about: 'story and product philosophy', contact: 'contact and support' } },
  hospitality: { sectionsForbidden: ['pricing', 'integrations', 'productShowcase', 'features'], words: W('starter', 'growth', 'enterprise', 'saas', 'platform', 'integrations', 'api', 'dashboard', 'free trial', 'per seat', 'workspace', 'enterprise plan'),
    cta: { allow: /(reserve|book|view|see|menu|visit|order|contact|find|directions|call)/i, forbid: /(free trial|demo|quote|enterprise|pricing)/i }, pricing: 'menu', primary: 'View the menu',
    pages: { home: 'atmosphere and food, reserve or visit CTA', menu: 'the menu', about: 'story and approach', contact: 'hours, location, reservations' } },
  saas: { sectionsForbidden: ['menu', 'gallery-food'], words: W('menu', 'reserve', 'reservation', 'guest', 'guests', 'plate', 'plates', 'dining', 'tasting', 'chef', 'add to cart', 'new arrivals', 'best sellers', 'shop now'),
    cta: { allow: /(start|try|book|request|see|get|sign|watch|talk|view|contact|learn|demo)/i, forbid: /(reserve|table|menu|shop now|add to cart|visit us)/i }, pricing: 'plans', primary: 'Start free',
    pages: { home: 'what the product does, primary signup CTA', product: 'features and how it works', pricing: 'plans if pricing is supplied', contact: 'sales and support' } },
  local_service: { sectionsForbidden: ['menu', 'pricing', 'integrations', 'productShowcase'], words: W('menu', 'guest', 'guests', 'plate', 'plates', 'dining', 'starter', 'growth', 'enterprise', 'saas', 'add to cart', 'shop now', 'new arrivals'),
    cta: { allow: /(quote|estimate|call|book|schedule|contact|request|get|view|see|check)/i, forbid: /(reserve a table|menu|free trial|shop now|add to cart)/i }, pricing: 'quotes', primary: 'Request a quote',
    pages: { home: 'trust and services, quote CTA', services: 'what is offered', about: 'the business', contact: 'how to reach us, service area' } },
  appointments: { sectionsForbidden: ['menu', 'pricing', 'integrations', 'productShowcase'], words: W('menu', 'guest', 'plate', 'dining', 'starter', 'enterprise', 'saas', 'add to cart'),
    cta: { allow: /(book|schedule|call|contact|view|see|join|get|start|visit)/i, forbid: /(reserve a table|menu|free trial|shop now)/i }, pricing: 'quotes', primary: 'Book now', pages: {} },
  professional: { sectionsForbidden: ['menu', 'integrations', 'productShowcase', 'pricing'], words: W('menu', 'reserve a table', 'guest', 'guests', 'plate', 'plates', 'dining', 'starter', 'growth', 'enterprise', 'saas', 'add to cart', 'shop now'),
    cta: { allow: /(book|request|schedule|contact|call|get|view|see|learn|talk)/i, forbid: /(reserve a table|menu|shop now|add to cart|free trial)/i }, pricing: 'quotes', primary: 'Book a consultation', pages: {} },
  creative: { sectionsForbidden: ['menu', 'integrations', 'pricing'], words: W('menu', 'reserve a table', 'guest', 'plate', 'dining', 'starter', 'growth', 'enterprise', 'saas', 'add to cart'),
    cta: { allow: /(view|see|start|inquire|enquire|contact|book|get|check|request)/i, forbid: /(reserve a table|menu|shop now|add to cart|free trial)/i }, pricing: 'packages', primary: 'View the work', pages: {} },
  nonprofit: { sectionsForbidden: ['menu', 'pricing', 'integrations', 'productShowcase'], words: W('menu', 'reserve a table', 'plate', 'dining', 'starter', 'growth', 'enterprise', 'saas', 'add to cart', 'shop now'),
    cta: { allow: /(donate|give|volunteer|get involved|join|support|learn|see|contact)/i, forbid: /(reserve a table|menu|shop now|add to cart|free trial|quote)/i }, pricing: 'none', primary: 'Get involved', pages: {} },
  other: { sectionsForbidden: ['menu', 'integrations'], words: W('starter', 'growth', 'enterprise', 'saas'), cta: { allow: /./, forbid: /(reserve a table|menu)/i }, pricing: 'none', primary: 'Get in touch', pages: {} },
};
// Forbidden vocabulary is allowed when the customer's own text uses it (a furniture store may sell "tables").
const VERIFIED_UNSUPPORTED = ['customer testimonials', 'reviews or review counts', 'years in business', 'awards or certifications', 'staff or founder names', 'customer counts', 'guarantees', 'shipping promises', 'best-seller or new-arrival claims', 'pricing tiers or prices', 'physical store locations', 'opening hours'];

const cleanPlace = loc => (loc ? String(loc).split(/[.,;]/)[0].trim() : '') || null;
const supplied = (text, re) => re.test(String(text || ''));

// input: { description, categoryKey, categoryLabel, archetype, location, facts, hasTeamAssets, refinements }
function deriveGrounding(input) {
  const inp = input || {};
  const text = String(inp.description || '');
  const sv = detectSubvertical(text);
  const archetype = inp.archetype || 'service-business';
  const categoryKey = inp.categoryKey || 'other';
  const family = sv ? sv.family : familyFor(archetype, categoryKey);
  const rules = RULES[family] || RULES.other;
  const r = inp.refinements || {};
  const claimsTestimonials = supplied(text, /testimonial|reviews?\b|customers? (say|said|love)|"[^"]{25,}"/i);
  const pricingSupplied = supplied(text, /\b(pricing|price list|plans?|packages?|membership|subscription|from \$|\$\d)/i);
  const teamSupplied = !!inp.hasTeamAssets || supplied(text, /\b(our team|founded by|founder|owner is|meet the)\b/i);
  const facts = inp.facts || {};
  const forbiddenWords = rules.words.filter(w => !wordMatch(text, w));
  const forbiddenSections = rules.sectionsForbidden.filter(s => !(s === 'pricing' && pricingSupplied && family === 'saas'));
  const g = {
    version: 3, family, subtype: sv ? sv.id : (r.subtype || null), businessType: sv ? sv.label : (inp.categoryLabel || categoryKey),
    industry: inp.categoryLabel || categoryKey, archetype, categoryKey,
    primaryOffer: (r.primaryOffer || text.split(/(?<=[.!?])\s+/)[0] || '').slice(0, 200) || null,
    products: sv ? sv.keywords.filter(k => wordMatch(text, k)).slice(0, 6) : [],
    salesModel: family === 'retail' ? 'sells products' : family === 'saas' ? 'software subscription' : family === 'hospitality' ? 'venue' : 'services',
    location: cleanPlace(inp.location),
    primaryCTA: r.primaryCTA || (family === 'hospitality' && !supplied(text, /reserv|book/i) ? 'View the menu' : rules.primary),
    pricingModel: pricingSupplied ? rules.pricing : 'none-supplied',
    allowedPageIntents: rules.pages,
    forbiddenSections, forbiddenWords, cta: { allow: rules.cta.allow.source, forbid: rules.cta.forbid.source },
    verifiedFacts: { location: cleanPlace(inp.location), description: text.slice(0, 400), years: !!facts.years, rating: !!facts.rating, count: !!facts.count },
    unsupportedFacts: VERIFIED_UNSUPPORTED.filter(x => !(x === 'customer testimonials' && claimsTestimonials) && !(x === 'pricing tiers or prices' && pricingSupplied)),
    testimonialAvailability: claimsTestimonials ? 'supplied' : 'none',
    teamAvailability: teamSupplied ? 'supplied' : 'none',
    trustSignalsAllowed: ['the business description as written', 'the place, if supplied', 'a clear next step'].concat(facts.years ? ['years, as supplied'] : []),
    imagerySubjects: sv ? sv.imagery : null, imageryAvoid: sv ? sv.avoid : ['text', 'logos', 'user interface'],
    newArrivalsJustified: supplied(text, /new arrivals?|new collection|just launched|drop\b/i),
  };
  if (r.imagerySubject) g.imagerySubjects = Object.assign({}, g.imagerySubjects, { hero: r.imagerySubject });
  return g;
}

module.exports = { wordMatch, anyWord, familyFor, SUBVERTICALS, detectSubvertical, ARCHETYPE_OVERRIDES, inferArchetypeStrict, strictCategory, RULES, deriveGrounding, cleanPlace };
