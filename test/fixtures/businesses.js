'use strict';
// Representative businesses for the mocked generation tests and the export
// fixture renderer. `claudePlan` is a realistic mocked /api/plan-website
// response body (`plan`) -- shaped like the real tool schema in server.js --
// so the Claude-planned path can be exercised end to end with zero API calls.

const FIZZWELL_TEXT = 'Fizzwell is a sparkling energy drink brand. Zero sugar, natural flavours: peach, cherry and citrus. Sold online and in Toronto shops.';

const FIZZWELL_PLAN = {
  business: {
    name: 'Fizzwell',
    understanding: 'A zero-sugar sparkling energy drink brand with three natural flavours, sold online and in Toronto shops.',
    category: 'retail',
    targetCustomer: 'Health-conscious 20-35 year olds who want energy without sugar',
    positioning: 'Bold flavour, zero sugar, no crash',
    tone: 'bold',
    goals: ['Drive online orders', 'Introduce the three flavours'],
    offerings: ['Peach Energy', 'Cherry Energy', 'Citrus Energy', 'Variety 12-pack'],
  },
  declaredFacts: { location: 'Toronto', otherFacts: ['Zero sugar', 'Natural flavours'] },
  strategy: {
    archetype: 'ecommerce-showcase', visitorIntent: 'Find a flavour and buy it', primaryConversion: 'Shop the flavours', secondaryConversion: 'Find a Toronto stockist',
    credibilityStrategy: 'Show the product and its ingredients plainly', sophisticationLevel: 'general', businessScope: 'national', proofStrategy: 'Product imagery and ingredient transparency',
    informationHierarchy: ['product', 'flavours', 'ingredients', 'where to buy'],
  },
  heroCopy: { kicker: 'ZERO SUGAR ENERGY', headline: 'Sparkling energy. Zero sugar.', sub: 'Peach, cherry and citrus -- natural flavour, no crash.', ctaLabel: 'Shop the flavours' },
  visualDirection: { hero: 'fullbleed-image', typography: 'display-condensed', nav: 'minimal-until-scroll', card: 'image-led', imagery: 'editorial-bold', cta: 'sharp-block', colorBehavior: 'high-contrast-mono-accent', motion: 'expressive', spacing: 'generous', pattern: 'portfolio-first', rationale: 'A product-led drink brand should lead with the can.' },
  creativeDirection: { concept: 'product-led-technical', visualMood: 'energetic', narrativeStrategy: 'product-demo-led', imageStrategy: 'macro-detail', signatureMotif: 'product-showcase', heroStrategy: 'image-dominant', pageRhythm: 'expressive-alternating', avoid: [] },
  pages: [
    { id: 'home', label: 'Home', purpose: 'Introduce the drink and the flavours', plan: { visualIntensity: 'bold', imageCritical: true }, sections: [
      { type: 'productShowcase', intent: 'introduce', headlineRole: 'declarative', headline: 'Three flavours. Zero sugar.', body: 'Every can is naturally flavoured and sugar free.' },
      { type: 'features', intent: 'explain', headlineRole: 'benefit-led', headline: 'What is inside', body: 'Natural caffeine, real fruit flavour, nothing else.' },
      { type: 'gallery', intent: 'prove', headlineRole: 'declarative', headline: 'Pick your flavour' },
      { type: 'faq', intent: 'reassure', headlineRole: 'question', headline: 'Questions' },
      { type: 'ctaBanner', intent: 'convert', headlineRole: 'declarative', headline: 'Find your can', ctaLabel: 'Shop now' },
    ] },
  ],
  imagePlan: [
    { role: 'hero', intent: 'The can is the brand', prompt: 'A single glossy Fizzwell sparkling energy drink can standing centred on a molten orange-to-red gradient backdrop, dramatic rim lighting, condensation droplets, low camera angle, bold commercial product photography', aspectRatio: '16:9' },
    { role: 'product', intent: 'Show the range', prompt: 'Three Fizzwell cans in peach, cherry and citrus colourways arranged in a staggered row on a seamless warm studio sweep, crisp shadows, premium beverage advertising', aspectRatio: '4:3' },
    { role: 'feature', intent: 'Ingredients', prompt: 'Macro close-up of sparkling bubbles rising through a glass of peach energy drink with fresh peach slices, backlit, vivid warm tones', aspectRatio: '4:3' },
    { role: 'atmosphere', intent: 'Where it is enjoyed', prompt: 'A Fizzwell cherry can on a sunlit Toronto rooftop ledge at golden hour, skyline softly out of focus, lifestyle product photography', aspectRatio: '1:1' },
    { role: 'gallery', intent: 'Peach flavour', prompt: 'Fizzwell peach can floating above sliced ripe peaches on a peach-coloured backdrop, splash of sparkling water, studio product shot', aspectRatio: '1:1' },
    { role: 'gallery', intent: 'Cherry flavour', prompt: 'Fizzwell cherry can surrounded by fresh cherries on a deep red backdrop, dramatic side light, studio product shot', aspectRatio: '1:1' },
    { role: 'gallery', intent: 'Citrus flavour', prompt: 'Fizzwell citrus can with halved lemons and limes on a bright yellow backdrop, crisp shadows, studio product shot', aspectRatio: '1:1' },
  ],
  functionalityPlan: [],
};

// A local SERVICE business (not a product): the planner leads with finished
// work and the services, and converts on a quote.
const GREENLINE_TEXT = 'Greenline Landscapes is a landscaping company in Calgary. Garden design, natural stone patios, lawn care and seasonal cleanups for homeowners.';
const GREENLINE_PLAN = {
  business: {
    name: 'Greenline Landscapes',
    understanding: 'A residential landscaping company in Calgary doing garden design, stone patios, lawn care and seasonal cleanups.',
    category: 'landscaping', targetCustomer: 'Calgary homeowners planning a yard project', positioning: 'Design-led yards built to last Calgary winters', tone: 'warm',
    goals: ['Get quote requests', 'Show finished projects'],
    offerings: ['Garden Design', 'Natural Stone Patios', 'Lawn Care', 'Seasonal Cleanups'],
  },
  declaredFacts: { location: 'Calgary', otherFacts: [] },
  strategy: {
    archetype: 'local-conversion', visitorIntent: 'See finished yards and ask for a quote', primaryConversion: 'Request a quote', secondaryConversion: 'See recent projects',
    credibilityStrategy: 'Finished project photography', sophisticationLevel: 'general', businessScope: 'local', proofStrategy: 'Before/after project work',
    informationHierarchy: ['finished work', 'services', 'process', 'quote'],
  },
  heroCopy: { kicker: 'CALGARY LANDSCAPING', headline: 'Yards worth coming home to.', sub: 'Garden design, stone patios and lawn care from one Calgary crew.', ctaLabel: 'Request a quote' },
  visualDirection: { hero: 'fullbleed-image', typography: 'humanist', nav: 'inline', card: 'image-led', imagery: 'trade-proof', cta: 'solid-pill', colorBehavior: 'warm-earth-multi-tone', motion: 'subtle', spacing: 'generous', pattern: 'proof-first', rationale: 'Lead with a finished yard; the work sells itself.' },
  creativeDirection: { concept: 'portfolio-led', visualMood: 'warm', narrativeStrategy: 'portfolio-led', imageStrategy: 'project-portfolio', signatureMotif: 'case-study-band', heroStrategy: 'image-dominant', pageRhythm: 'sparse-open-dense-mid', avoid: [] },
  pages: [
    { id: 'home', label: 'Home', purpose: 'Show finished yards and win quote requests', plan: { visualIntensity: 'standard', imageCritical: true }, sections: [
      { type: 'services', intent: 'explain', headlineRole: 'benefit-led', headline: 'What we build', body: 'Design, stonework and upkeep -- one crew from plan to first mow.' },
      { type: 'gallery', intent: 'showcase', headlineRole: 'declarative', headline: 'Recent Calgary yards' },
      { type: 'process', intent: 'reassure', headlineRole: 'explanatory', headline: 'From sketch to first mow' },
      { type: 'testimonial', intent: 'prove', headlineRole: 'proof-led', headline: 'What homeowners say' },
      { type: 'contact', intent: 'convert', headlineRole: 'declarative', headline: 'Tell us about your yard', ctaLabel: 'Request a quote' },
    ] },
  ],
  imagePlan: [
    { role: 'hero', intent: 'A finished yard is the proof', prompt: 'A finished Calgary backyard at golden hour: natural flagstone patio, layered perennial garden beds, fresh green lawn, warm evening light, wide architectural garden photography', aspectRatio: '16:9' },
    { role: 'gallery', intent: 'Patio project', prompt: 'Close view of a newly laid natural stone patio with low stone wall and planted borders, soft overcast light, landscape portfolio photography', aspectRatio: '4:3' },
    { role: 'gallery', intent: 'Garden design', prompt: 'Layered perennial garden with ornamental grasses and a curved gravel path in a Calgary front yard, morning light, landscape design photography', aspectRatio: '4:3' },
    { role: 'gallery', intent: 'Lawn care', prompt: 'Freshly mowed striped lawn edged cleanly against garden beds in a suburban Calgary yard, bright daylight, landscaping photography', aspectRatio: '4:3' },
  ],
  functionalityPlan: [],
};

// An appointment-led CARE business: people and reassurance, not products.
const HARBOUR_TEXT = 'Harbour Physio is a physiotherapy clinic in Halifax offering sports injury rehab, dry needling and post-surgery recovery. Book online.';

const BUSINESSES = [
  { id: 'fizzwell', text: FIZZWELL_TEXT, expect: { name: 'Fizzwell', notCategory: 'wellness' } },
  { id: 'glow-theory', text: 'Glow Theory is an online skincare store in Vancouver selling gentle cleansers, serums and moisturizers for sensitive skin.', expect: { name: 'Glow Theory' } },
  { id: 'fern-flint', text: 'Fern & Flint is a specialty coffee roaster and café in Portland. Single-origin beans, pour-over bar and fresh pastries.', expect: { name: 'Fern & Flint' } },
  { id: 'ledgerly', text: 'Ledgerly is scheduling software for physiotherapy clinics with online booking and automatic reminders.', expect: { name: 'Ledgerly' } },
  { id: 'greenline', text: GREENLINE_TEXT, expect: { name: 'Greenline Landscapes' } },
  { id: 'harbour-physio', text: HARBOUR_TEXT, expect: { name: 'Harbour Physio' } },
];

module.exports = { BUSINESSES, FIZZWELL_TEXT, FIZZWELL_PLAN, GREENLINE_TEXT, GREENLINE_PLAN, HARBOUR_TEXT };
