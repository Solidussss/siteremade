'use strict';
// INDUSTRY MODULES for the Business Reality Model (model.js): the common foundation (identity / offerings / operations)
// specialised per kind of business. A watchmaker, a barber, a SaaS company, a restaurant and a roofer get different
// structures, different material claims and different rules for what their pictures and demos must show.
//
// Each module:
//   id, label, words          detection (whole words, ./grounding wordMatch); `not` words veto it
//   offerings, operations      the fields this industry adds to the foundation, with what each means
//   material                   claim kinds that are commitments for this industry (beyond the universal ones)
//   phrases                    industry claims to look for in page text ({ kind, re })
//   consistent                 what must look and read the same in every view (hero, cards, close-ups, configurator)
//   imagery { must, avoid }    what its pictures must show / must never substitute
//   demos                      animated demonstrations that are honest only with these facts ({ id: [paths] })
//   derive(m, M)               derived facts from confirmed ones (M = model.js)
// detect(text) picks the module; nothing here calls a model.
const { wordMatch } = require('../premium/grounding');

// claims that are material for every business: a real business only states them when the owner did
const UNIVERSAL_MATERIAL = ['price', 'certification', 'review', 'customerCount', 'guarantee', 'legal', 'address', 'specification', 'award', 'founded', 'availability', 'contact', 'hours'];

const num = (v) => { const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/[^\d.]/g, '')); return isFinite(n) ? n : null; };
function priceRange(m, M, prefix) {
  const prices = Object.entries(m.facts).filter(([p, f]) => p.startsWith(prefix) && f.status === 'confirmed' && num(f.value) != null).map(([p, f]) => [p, num(f.value)]);
  if (prices.length < 2) return;
  const vals = prices.map(([, n]) => n);
  M.set(m, 'offerings.pricing.range', [Math.min(...vals), Math.max(...vals)], { status: 'derived', source: 'derived', from: prices.map(([p]) => p) });
}

const MODULES = [
  { id: 'software', label: 'Software / SaaS', words: ['saas', 'software', 'platform', 'app', 'api', 'dashboard', 'plugin', 'integration', 'analytics tool', 'crm'],
    offerings: { plans: 'plan names, prices, billing period and limits', features: 'what the product actually does', integrations: 'tools it connects to', trial: 'free trial or demo terms' },
    operations: { onboarding: 'how a customer starts', support: 'support channels and hours', security: 'compliance and data handling', uptime: 'availability commitments' },
    material: ['integration', 'compliance', 'uptime', 'customerLogo'],
    phrases: [{ kind: 'compliance', re: /\b(SOC ?2|ISO ?27001|HIPAA|GDPR[- ]compliant|PCI[- ]DSS|end-to-end encrypt\w*)\b/i }, { kind: 'uptime', re: /\b\d{2}(?:\.\d+)?% uptime\b|\bSLA\b/i }, { kind: 'integration', re: /\bintegrates? with\b/i }],
    consistent: ['the product interface: one navigation, one design system, one set of data in every screenshot and demo', 'plan names and limits wherever they appear'],
    imagery: { must: ['interfaces built from the product\'s real features and data relationships', 'charts whose numbers relate to each other (totals add up, trends match the story)'], avoid: ['decorative charts with nonsense numbers', 'features the brief does not describe', 'stock photos of people pointing at screens'] },
    demos: { walkthrough: ['offerings.features'], liveData: ['operations.dataSource'] },
    derive(m, M) { priceRange(m, M, 'offerings.plans.'); } },

  { id: 'watch', label: 'Watchmaker', words: ['watch', 'watchmaker', 'watchmaking', 'horology', 'horological', 'timepiece', 'chronograph', 'calibre', 'caliber', 'wristwatch'],
    offerings: { models: 'models and references', cases: 'case materials and finishes (steel, titanium, DLC, gold...)', dials: 'dial colours and finishes', straps: 'straps and bracelets: type (leather, rubber, fabric, metal bracelet) and colour', specs: 'case size, thickness, water resistance, movement, power reserve, jewels, frequency', complications: 'date, second time zone, chronograph...' },
    operations: { leadTime: 'delivery time per option', ordering: 'deposit, allocation, waiting list', warranty: 'warranty length', service: 'servicing interval and where' },
    material: ['waterResistance', 'origin', 'chronometer', 'powerReserve'],
    phrases: [{ kind: 'origin', re: /\b(Swiss[- ]made|Swiss movement|made in (?:Switzerland|Germany|Japan))\b/i }, { kind: 'chronometer', re: /\b(COSC|chronometer[- ]certified|certified chronometer)\b/i }, { kind: 'waterResistance', re: /\b\d+\s?(?:m|metres|meters|ATM|bar)\b(?=[^.]{0,30}water)|\bwater[- ]resist\w*\s+(?:to\s+)?\d+/i }, { kind: 'powerReserve', re: /\b\d+[- ]?(?:h|hours?)\b(?=[^.]{0,20}reserve)|\breserve of \d+/i }],
    consistent: ['the case material and colour (a black DLC case is black DLC in every view)', 'dial colour and markings', 'strap or bracelet type and colour (a metal bracelet is always drawn as links)', 'the complications shown on the dial'],
    imagery: { must: ['the watch as specified: case, dial, hands, strap or bracelet'], avoid: ['a different case material in another section', 'complications the watch does not have', 'a strap where the brief says bracelet'] },
    demos: { winding: ['offerings.specs.powerReserve', 'offerings.specs.crownTurns'], dualTime: ['offerings.complications.secondTimeZone'] },
    // general knowledge the page may state (not claims about this business): a ligne is 2.2558 mm
    general: { ligneMm: [2.2558, 2.26, 2.256] },
    derive(m, M) {
      const r = num(M.value(m, 'offerings.specs.powerReserve')), t = num(M.value(m, 'offerings.specs.crownTurns'));
      const rf = M.get(m, 'offerings.specs.powerReserve'), tf = M.get(m, 'offerings.specs.crownTurns');
      const hz = num(M.value(m, 'offerings.specs.frequencyHz')), hf = M.get(m, 'offerings.specs.frequencyHz');
      if (hz && hf.status === 'confirmed') M.set(m, 'offerings.specs.vph', Math.round(hz * 7200), { status: 'derived', source: 'derived', from: ['offerings.specs.frequencyHz'] });
      if (r && t && rf.status === 'confirmed' && tf.status === 'confirmed') M.set(m, 'offerings.specs.hoursPerTurn', +(r / t).toFixed(2), { status: 'derived', source: 'derived', from: ['offerings.specs.powerReserve', 'offerings.specs.crownTurns'] });
      priceRange(m, M, 'offerings.prices.');
    } },

  { id: 'hospitality', label: 'Restaurant, café or hotel', words: ['restaurant', 'cafe', 'café', 'coffee shop', 'bistro', 'bar', 'pizzeria', 'bakery', 'diner', 'brasserie', 'trattoria', 'hotel', 'inn', 'guesthouse', 'bed and breakfast', 'food truck', 'tasting menu'],
    offerings: { menu: 'dishes or drinks with prices', dietary: 'dietary options the kitchen actually offers', rooms: 'room types and rates (hotels)', events: 'private dining or events' },
    operations: { hours: 'opening hours per day', reservations: 'how to book, deposits, party sizes', ordering: 'pickup / delivery and where', location: 'address and access', amenities: 'facilities the place really has' },
    material: ['dietary', 'hygiene', 'amenity'],
    phrases: [{ kind: 'dietary', re: /\b(gluten[- ]free|vegan|vegetarian|halal|kosher|nut[- ]free|allergen[- ]free|organic)\b/i }, { kind: 'hygiene', re: /\b(hygiene rating|food safety rating|5[- ]star hygiene)\b/i }, { kind: 'amenity', re: /\b(parking|terrace|wheelchair accessible|wifi|wi-fi|pool|spa|gym|private dining|live music)\b/i }],
    consistent: ['the room: one architecture, materials and light in every view of the same place', 'dishes as described on the menu'],
    imagery: { must: ['the dishes and drinks on the menu', 'the place as it is (its counter, oven, dining room)'], avoid: ['amenities the brief does not mention', 'a different style of room between views', 'food that is not on the menu'] },
    demos: { orderAhead: ['operations.hours', 'operations.ordering'], booking: ['operations.reservations'] },
    derive(m, M) { priceRange(m, M, 'offerings.menu.'); } },

  { id: 'appointments', label: 'Appointments (barber, salon, clinic)', words: ['barber', 'barbershop', 'salon', 'hairdresser', 'nail', 'lashes', 'brows', 'spa', 'massage', 'clinic', 'dentist', 'dental', 'orthodontist', 'physio', 'physiotherapy', 'chiropractor', 'tattoo', 'esthetician', 'aesthetician', 'therapist'],
    offerings: { services: 'services with duration and price', staff: 'the people who do the work (only real names)', packages: 'packages and memberships' },
    operations: { hours: 'opening hours', booking: 'how to book, deposits, cancellation', walkIns: 'whether walk-ins are taken', location: 'address' },
    material: ['medical', 'staffCredential', 'outcome'],
    phrases: [{ kind: 'medical', re: /\b(painless|pain[- ]free|cure[sd]?|guaranteed results|clinically proven|FDA[- ]approved)\b/i }, { kind: 'staffCredential', re: /\b(board[- ]certified|licensed (?:dentist|therapist|barber|cosmetologist)|DDS|DMD|registered (?:nurse|physio\w*))\b/i }, { kind: 'outcome', re: /\b(\d+ shades whiter|results in \d+|lasts? \d+ (?:weeks|months))\b/i }],
    consistent: ['the shop or clinic interior and its tools', 'the staff (real people only, the same faces wherever they appear)'],
    imagery: { must: ['the trade\'s real tools and rooms (clippers and chairs; a dental chair and lamp)', 'the services listed'], avoid: ['invented staff', 'treatments the business does not offer', 'medical before/after pictures that are not the clinic\'s own'] },
    demos: { booking: ['offerings.services', 'operations.hours'], beforeAfter: ['offerings.services'] },
    derive(m, M) { priceRange(m, M, 'offerings.services.'); } },

  { id: 'fitness', label: 'Gym or fitness studio', words: ['gym', 'fitness', 'crossfit', 'pilates', 'yoga', 'boxing', 'strength club', 'personal trainer', 'spin', 'climbing gym', 'martial arts'],
    offerings: { classes: 'class types, length and intensity', memberships: 'membership options and prices', trial: 'trial offer' },
    operations: { timetable: 'the weekly timetable', capacity: 'class size limit', hours: 'opening hours', facilities: 'equipment and rooms it really has', coaches: 'coaches (real names only)' },
    material: ['amenity', 'outcome'],
    phrases: [{ kind: 'outcome', re: /\b(lose \d+|guaranteed results|in \d+ days)\b/i }, { kind: 'amenity', re: /\b(sauna|pool|showers|lockers|parking|childcare|cold plunge)\b/i }],
    consistent: ['the room and its equipment in every view', 'class names, times and coaches between the timetable and the cards'],
    imagery: { must: ['the equipment and classes the gym has'], avoid: ['machines or rooms the gym does not have', 'invented coaches'] },
    demos: { timetable: ['operations.timetable', 'operations.capacity'] },
    derive(m, M) { priceRange(m, M, 'offerings.memberships.'); } },

  { id: 'trades', label: 'Trades and home services', words: ['roofing', 'roofer', 'concrete', 'paving', 'asphalt', 'landscaping', 'landscaper', 'lawn care', 'plumbing', 'plumber', 'electrician', 'electrical', 'hvac', 'painting', 'painter', 'renovation', 'remodeling', 'remodelling', 'carpentry', 'cleaning', 'pressure washing', 'fencing', 'decking', 'flooring', 'tiling', 'masonry', 'contractor', 'detailing'],
    offerings: { services: 'the services, as specific as the owner says (decorative concrete is not asphalt paving)', materials: 'materials and systems used', projects: 'real past projects (only the owner\'s own)' },
    operations: { serviceArea: 'towns or radius served', estimates: 'how quotes work', scheduling: 'lead time and season', licensing: 'licences and insurance (only as stated)', warranty: 'workmanship warranty' },
    material: ['licensing', 'insurance', 'warranty', 'serviceArea'],
    phrases: [{ kind: 'licensing', re: /\b(licensed|bonded|certified installer|master (?:plumber|electrician))\b/i }, { kind: 'insurance', re: /\b(fully insured|insured)\b/i }, { kind: 'warranty', re: /\b(\d+[- ]year (?:warranty|guarantee)|workmanship (?:warranty|guarantee)|lifetime warranty)\b/i }, { kind: 'serviceArea', re: /\bserving (?:all of )?[A-Z][a-z]+/ }],
    consistent: ['the trade\'s own equipment, vehicles and uniforms when they are part of the brand', 'the materials in the services (a stone patio stays stone)'],
    imagery: { must: ['the specific services listed, with that trade\'s tools and materials', 'work in progress and finished work of that kind'], avoid: ['a neighbouring trade (asphalt for decorative concrete, mowing for a patio builder)', 'project photos presented as the owner\'s own when they are not'] },
    demos: { beforeAfter: ['offerings.projects'], process: ['offerings.services'], estimate: ['operations.estimates'] },
    derive() {} },

  { id: 'product', label: 'Product brand', words: ['furniture', 'sofa', 'chair', 'table', 'skincare', 'serum', 'moisturizer', 'moisturiser', 'cosmetics', 'apparel', 'clothing', 'sneaker', 'sneakers', 'shoes', 'handbag', 'jewellery', 'jewelry', 'perfume', 'fragrance', 'candle', 'headphones', 'speaker', 'bicycle', 'e-bike', 'car', 'vehicle', 'motorcycle', 'boat', 'drink', 'soda', 'coffee beans', 'tea', 'brick set', 'toy', 'products', 'collection', 'drop'],
    offerings: { products: 'products with their variants, materials, sizes and prices', variants: 'colourways, finishes, sizes, configurations', specs: 'measured specifications', ingredients: 'ingredients or materials (only as stated)' },
    operations: { shipping: 'where and how it ships, costs and times', returns: 'returns and exchanges', stock: 'availability, pre-orders, limited runs', warranty: 'warranty' },
    material: ['ingredient', 'origin', 'sustainability', 'stock'],
    phrases: [{ kind: 'ingredient', re: /\b(\d+% (?:vitamin|niacinamide|retinol|hyaluronic)\w*|dermatologist[- ]tested|hypoallergenic|non[- ]comedogenic)\b/i }, { kind: 'origin', re: /\b(made in [A-Z][a-z]+|handmade in [A-Z][a-z]+)\b/ }, { kind: 'sustainability', re: /\b(carbon[- ]neutral|recycled|sustainabl\w+|eco[- ]friendly|biodegradable|ethically sourced|vegan leather)\b/i }, { kind: 'stock', re: /\b(only \d+ left|limited to \d+|sold out|in stock)\b/i }],
    consistent: ['the product\'s geometry and proportions in every view', 'materials and finishes as specified (black DLC never reads as titanium)', 'colourways named and shown alike in the hero, cards, close-ups and configurator', 'markings and branding on the product'],
    imagery: { must: ['the product itself, from one reference, in every view', 'materials that read as what they are (metal, leather, glass, fabric, wood)'], avoid: ['a similar-looking product because it photographs better', 'a different variant than the one named', 'independent renders that change the product\'s shape between sections'] },
    demos: { configurator: ['offerings.variants'], turntable: ['offerings.products'] },
    derive(m, M) { priceRange(m, M, 'offerings.prices.'); } },

  { id: 'professional', label: 'Professional services', words: ['law firm', 'lawyer', 'attorney', 'accountant', 'accounting', 'bookkeeping', 'consultant', 'consultancy', 'consulting', 'financial advisor', 'architect', 'agency', 'real estate', 'realtor', 'estate agent', 'insurance broker', 'recruitment'],
    offerings: { services: 'practice areas or services', fees: 'fee structure (only as stated)', process: 'how an engagement works' },
    operations: { credentials: 'licences and memberships (only as stated)', jurisdiction: 'where they may practise', consultation: 'how to start' },
    material: ['credential', 'outcome', 'regulatory'],
    phrases: [{ kind: 'credential', re: /\b(CPA|chartered|bar (?:admitted|member)|FCA[- ]regulated|registered (?:architect|adviser|advisor))\b/i }, { kind: 'outcome', re: /\b(won \d+|\d+% success|recovered \$?\d+)\b/i }, { kind: 'regulatory', re: /\b(regulated by|authorised and regulated|not legal advice)\b/i }],
    consistent: ['the people (real only) and the office'], imagery: { must: ['the work as it is done (documents, meetings, sites, properties)'], avoid: ['invented case results', 'invented team members'] },
    demos: { process: ['offerings.process'] }, derive() {} },

  { id: 'creative', label: 'Creative studio', words: ['photographer', 'photography', 'videographer', 'design studio', 'graphic designer', 'illustrator', 'artist', 'musician', 'band', 'studio', 'portfolio'],
    offerings: { work: 'real projects (the owner\'s own)', services: 'what can be commissioned', rates: 'rates (only as stated)' }, operations: { booking: 'how to commission', turnaround: 'turnaround' },
    material: ['client'], phrases: [{ kind: 'client', re: /\b(clients include|worked with|trusted by)\b/i }],
    consistent: ['the owner\'s own work and style'], imagery: { must: ['the owner\'s work, or clearly placeholder frames'], avoid: ['someone else\'s work presented as theirs', 'invented client logos'] },
    demos: { gallery: ['offerings.work'] }, derive() {} },

  { id: 'nonprofit', label: 'Nonprofit', words: ['nonprofit', 'non-profit', 'charity', 'foundation', 'ngo', 'volunteer', 'donate', 'community group'],
    offerings: { programmes: 'programmes and who they serve', donations: 'donation options' }, operations: { registration: 'charity registration (only as stated)', impact: 'impact figures (only as stated)' },
    material: ['impact', 'registration'], phrases: [{ kind: 'impact', re: /\b\d[\d,]* (?:meals|people|families|children|trees|volunteers)\b/i }, { kind: 'registration', re: /\b(registered charity|501\(c\)\(3\)|charity (?:no|number))\b/i }],
    consistent: ['the programmes and the people they serve'], imagery: { must: ['the programmes as described'], avoid: ['invented beneficiaries or impact numbers'] },
    demos: { impact: ['operations.impact'] }, derive() {} },

  { id: 'retail', label: 'Shop', words: ['shop', 'store', 'boutique', 'retailer', 'market', 'florist', 'bookshop', 'record store', 'deli', 'grocery'],
    offerings: { range: 'what is stocked', prices: 'prices (only as stated)' }, operations: { hours: 'opening hours', location: 'address', delivery: 'delivery or click and collect' },
    material: ['stock'], phrases: [{ kind: 'stock', re: /\b(in stock|largest selection|only \d+ left)\b/i }],
    consistent: ['the shop interior and its range'], imagery: { must: ['what the shop sells, in the shop'], avoid: ['products it does not stock'] },
    demos: {}, derive(m, M) { priceRange(m, M, 'offerings.prices.'); } },
];

const OTHER = { id: 'other', label: 'Business', words: [], offerings: {}, operations: {}, material: [], phrases: [], consistent: ['the business\'s own name, offer and look'], imagery: { must: ['what the business actually does'], avoid: ['things the brief does not mention'] }, demos: {}, derive() {} };

// The module whose words the text uses most; earlier modules win ties (software before the trade it serves:
// "booking software for barbers" is software, a watch brand before generic product words).
function detect(text) {
  const t = String(text || '');
  let best = OTHER, score = 0;
  for (const mod of MODULES) {
    const hits = mod.words.filter((w) => wordMatch(t, w)).length;
    if (hits > score) { best = mod; score = hits; }
  }
  // software wins whenever its words appear next to a trade's (the product is the software, not the trade)
  if (best.id !== 'software' && MODULES[0].words.filter((w) => wordMatch(t, w)).length >= 1 && /\b(software|saas|platform|app)\b/i.test(t) && /\b(for|to help|helps)\b/i.test(t)) return MODULES[0];
  return best;
}
const byId = (id) => MODULES.find((m) => m.id === id) || OTHER;

module.exports = { MODULES, OTHER, UNIVERSAL_MATERIAL, detect, byId };
