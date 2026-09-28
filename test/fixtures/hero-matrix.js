'use strict';
// The hero fixture matrix: at least one business for EVERY category the
// generator supports (script.js `categories`), plus several products/services
// within the categories that most often repeat. `category` is what the REAL
// classifier must assign (the tests assert it, so a fixture can't silently
// drift into another category). Used by test/hero-storyboard.test.js and the
// browser review (test/review/hero-matrix-review.js). All mocked -- no provider.
const F = require('./businesses');

const HERO_MATRIX = [
  // retail -- drinks, skincare, packaged food, home goods, general
  { id: 'fizzwell', category: 'retail', text: F.FIZZWELL_TEXT },
  { id: 'tide-tonic', category: 'other', // the classifier has no drinks-maker keyword; the storyboard still finds the drinks concept
    expectConcept: /^drink-/, text: 'Tide & Tonic makes small-batch sparkling tonic water and botanical mixers in Halifax. Flavours: grapefruit, yuzu and ginger.' },
  { id: 'glow-theory', category: 'retail', text: 'Glow Theory is an online skincare store in Vancouver selling gentle cleansers, serums and moisturizers for sensitive skin.' },
  { id: 'ember-salt', category: 'retail', text: 'Ember & Salt is an online shop selling small-batch hot sauce made with fermented chilies. Three heat levels: mild, smoky and ghost pepper.' },
  { id: 'hearth-wick', category: 'retail', text: 'Hearth & Wick is a boutique store selling hand-poured soy candles and ceramic vessels, made in Victoria.' },
  // fashion
  { id: 'northbound', category: 'fashion', text: 'Northbound Supply is a streetwear label making heavyweight hoodies, denim and caps in Montreal.' },
  { id: 'maison-vale', category: 'fashion', text: 'Maison Vale is a bridal fashion atelier designing made-to-measure wedding gowns and veils.' },
  // hospitality -- roaster (a product), café (a venue), restaurant, bakery, bar
  { id: 'fern-flint', category: 'hospitality', text: 'Fern & Flint is a specialty coffee roaster and café in Portland. Single-origin beans, pour-over bar and fresh pastries.' },
  { id: 'little-fern', category: 'hospitality', text: 'Little Fern is a neighbourhood café in Leeds serving espresso, brunch plates and cakes.' },
  { id: 'nonna-rosa', category: 'hospitality', text: 'Nonna Rosa is a family Italian restaurant in Boston serving handmade pasta, wood-fired pizza and tiramisu.' },
  { id: 'crumb-co', category: 'hospitality', text: 'Crumb & Co is a bakery in Ottawa making sourdough loaves, croissants and seasonal pastries.' },
  { id: 'copper-still', category: 'hospitality', text: 'The Copper Still is a cocktail bar in Chicago with seasonal cocktails, natural wine and late-night snacks.' },
  // creative
  { id: 'lumen-photo', category: 'creative', text: 'Lumen is a wedding and portrait photographer based in Toronto.' },
  { id: 'half-tone', category: 'creative', text: 'Half Tone is a branding and design studio creating identities, packaging and websites for independent brands.' },
  // tech
  { id: 'ledgerly', category: 'tech', text: 'Ledgerly is scheduling software for physiotherapy clinics with online booking and automatic reminders.' },
  { id: 'stackwise', category: 'tech', text: 'Stackwise is a developer platform with an API for monitoring cloud infrastructure and alerting on-call teams.' },
  // finance / professional / education
  { id: 'harbourline', category: 'finance', text: 'Harbourline Wealth is a financial planning firm helping families with retirement, savings and tax planning.' },
  { id: 'whitfield-law', category: 'professional', text: 'Whitfield Law is a law firm in Calgary handling wills, estates and small business contracts.' },
  { id: 'northwind', category: 'professional', text: 'Northwind Advisory is a consultancy helping manufacturers with operations strategy and workshops for leadership teams.' },
  { id: 'brightpath', category: 'education', text: 'BrightPath Tutoring offers one-to-one tutoring in math, reading and exam prep for high school students.' },
  // fitness
  { id: 'iron-harbour', category: 'fitness', text: 'Iron Harbour is a boxing gym in Belfast with beginner boxing classes, sparring and personal training.' },
  { id: 'still-pilates', category: 'fitness', text: 'Still is a pilates studio offering reformer classes, mat pilates and private sessions.' },
  // real estate
  { id: 'keystone', category: 'realestate', text: 'Keystone Realty is a real estate brokerage helping families buy and sell homes in Kelowna.' },
  { id: 'skyline-lofts', category: 'realestate', text: 'Skyline Lofts is a real estate agency selling luxury downtown condos and penthouses in Vancouver.' },
  // wellness
  { id: 'harbour-physio', category: 'wellness', text: F.HARBOUR_TEXT },
  { id: 'stillwater-spa', category: 'wellness', text: 'Stillwater is a day spa offering massage, facials and a sauna ritual in Banff.' },
  // nonprofit
  { id: 'riverside-food', category: 'nonprofit', text: 'Riverside Food Bank is a nonprofit charity collecting and distributing groceries to families in Hamilton, run by volunteers.' },
  // trades
  { id: 'greenline', category: 'landscaping', text: F.GREENLINE_TEXT },
  { id: 'cutline-lawn', category: 'landscaping', text: 'Cutline Lawn Co does weekly lawn mowing, aeration and fall cleanups for homeowners in Guelph.' },
  { id: 'summit-roofing', category: 'roofing', text: 'Summit Roofing replaces and repairs shingle roofs, gutters and flashing in Edmonton.' },
  { id: 'oak-joinery', category: 'renovation', text: 'Oak & Joinery is a renovation contractor rebuilding kitchens, bathrooms and basements in Ottawa.' },
  { id: 'brightline-paint', category: 'painting', text: 'Brightline Painting paints interiors, exteriors and kitchen cabinets for homeowners in Regina.' },
  { id: 'flowright', category: 'plumbing', text: 'FlowRight Plumbing fixes leaks, drains and water heaters and installs bathroom fixtures in Winnipeg.' },
  { id: 'volt-co', category: 'electrical', text: 'Volt & Co is an electrician service installing lighting, panel upgrades and EV chargers in Saskatoon.' },
  { id: 'spotless-nest', category: 'cleaning', text: 'Spotless Nest provides home cleaning, deep cleans and move-out cleaning in Burnaby.' },
  { id: 'mirror-finish', category: 'automotive', text: 'Mirror Finish is a car detailing studio offering paint correction, ceramic coating and interior detailing.' },
  { id: 'northside-auto', category: 'automotive', text: 'Northside Auto is a mechanic shop doing brake repair, oil changes and engine diagnostics in Surrey.' },
  // other -- businesses outside every named category
  { id: 'tidewater-charters', category: 'other', text: 'Tidewater Charters runs fishing charters and sunset boat tours from Tofino.' },
  { id: 'paperbark', category: 'other', text: 'Paperbark makes letterpress wedding invitations and custom stationery by hand.' },
];

// The Claude-planned path: realistic mocked planner responses (with a
// heroStoryboard) for two businesses, plus one planner storyboard that must be
// rejected as off-industry.
const PLANNED = [
  { id: 'fizzwell-claude', category: 'retail', text: F.FIZZWELL_TEXT, plan: F.FIZZWELL_PLAN },
  { id: 'greenline-claude', category: 'landscaping', text: F.GREENLINE_TEXT, plan: F.GREENLINE_PLAN },
];

module.exports = { HERO_MATRIX, PLANNED };
