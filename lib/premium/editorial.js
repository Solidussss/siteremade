'use strict';
// PREMIUM_PHOTO_LED_V6 -- editorial layout, real-photography shot lists and specific (never filler) content for photo-led businesses.
//
//   * isPhotoLed(g)        : generated photography is the DEFAULT for these businesses; starter graphics are only a fallback
//   * shotList(g)          : the minimum image set per business type (e.g. wellness: hero, movement, recovery, studio, atmosphere)
//   * packFor(g, text)     : specific offerings / first-visit flow / philosophy / FAQ, derived only from the customer's own words
//                            plus neutral definitions of the modalities they name (no schedules, prices, people, credentials)
//   * planLayout(...)      : deterministic page plan with alternating art-directed sections (image-left / image-right / full-bleed /
//                            editorial quote) instead of one repeated card template
//   * looksLikeInstruction : hard block for planner / builder text ("Explain each yoga class type...") on the customer site
//   * renderFeature(...)   : HTML for the `editorialFeature` section (shared by the live preview and the export)
//
// Pure and deterministic; no I/O. Used by the browser bundle, the server and lib/site-render.js.
const { wordMatch } = require('./grounding');

const clip = (s, n) => { s = String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s; };
const uid = p => `${p}-${Date.now().toString(36)}${Math.random().toString(16).slice(2, 6)}`;

// ---- which businesses are photo-led ---------------------------------------------------------------------------------
const PHOTO_LED_FAMILIES = new Set(['wellness', 'realestate', 'retail', 'hospitality', 'local_service', 'appointments', 'creative', 'nonprofit']);
function isPhotoLed(g, description) {
  if (!g) return false;
  if (PHOTO_LED_FAMILIES.has(g.family)) return true;
  // consultants with personal-brand positioning ("I help ...", coach, independent)
  if (g.family === 'professional' && /\b(i help|i work|my clients|coach|independent|solo|founder-led|personal brand)\b/i.test(String(description || ''))) return true;
  return false;
}

// ---- shot lists -----------------------------------------------------------------------------------------------------------
// Each shot: { id, brief } -- the brief is the SUBJECT of the photograph (no faces, no text, no UI). The first shot is the hero.
const SHOTS = {
  wellness: [
    { id: 'hero', brief: 'a calm, sunlit yoga and recovery studio interior: pale wooden floor, neatly arranged mats, soft plants, natural morning light, no people' },
    { id: 'movement', brief: 'a person practising a yoga pose on a mat in a bright studio, photographed from behind or in soft silhouette, calm and unposed' },
    { id: 'recovery', brief: 'a quiet treatment room: massage table dressed in natural linen, folded warm towels, a small ceramic dish, soft warm light, no people' },
    { id: 'studio', brief: 'a wide view of a serene wellness studio: bolsters, blocks and folded blankets on wooden shelves, a large window, muted natural palette' },
    { id: 'atmosphere', brief: 'close tactile detail: herbal tea in a ceramic cup beside a lit candle and a folded towel, shallow depth of field, warm light' },
    { id: 'group', brief: 'a relaxed small yoga class seen from behind, mats in rows, soft daylight through tall windows' },
    { id: 'detail', brief: 'macro detail of smooth stones and linen on a treatment table, warm neutral tones, shallow depth of field' },
  ],
  retail: [
    { id: 'hero', brief: null },
    { id: 'lifestyle', brief: null, ctx: true },
    { id: 'detail', brief: null, det: true },
    { id: 'environment', brief: 'the brand\'s tidy studio shelf where the products are kept, natural light, soft neutral surfaces, no people' },
    { id: 'lifestyle2', brief: null, ctx: true },
  ],
  hospitality: [
    { id: 'hero', brief: 'the signature dining space in warm evening light, tables set, no people' },
    { id: 'interior', brief: 'the interior seen from the entrance: warm materials, considered lighting, empty seats' },
    { id: 'offering', brief: 'the food or drink the business is known for, plated simply on a wooden table in natural light' },
    { id: 'atmosphere', brief: 'a tactile detail of the space: candlelight, glassware and linen, shallow depth of field' },
    { id: 'kitchen', brief: 'ingredients being prepared on a worn wooden counter, hands only, warm light' },
  ],
  professional: [
    { id: 'hero', brief: 'a calm, well-lit working environment: a desk with notebooks and materials, window light, no people, no screens' },
    { id: 'materials', brief: 'close detail of working materials: paper, notes, a pen, natural textures, shallow depth of field' },
    { id: 'place', brief: 'the place the work happens: a quiet meeting room or studio, soft daylight, no people' },
    { id: 'detail', brief: 'a tactile detail of the workspace: a coffee cup, a plant, a folded notebook, warm light' },
  ],
  realestate: [
    { id: 'hero', brief: 'a well-composed home exterior or downtown skyline at golden hour, no people, no address or signage visible' },
    { id: 'neighborhood', brief: 'a residential tree-lined street or downtown streetscape in daylight, no people, no readable signage' },
    { id: 'buyerLifestyle', brief: 'a bright, tidy living room interior with natural light, no people' },
    { id: 'sellerInterior', brief: 'a staged interior detail: kitchen or living space, natural light, no people' },
    { id: 'detail', brief: 'close detail of interior architecture: a staircase, large window or hardwood floor, natural light' },
  ],
  local_service: [
    { id: 'hero', brief: 'a finished, well-made result of the work in flattering natural light, no people' },
    { id: 'material', brief: 'close detail of the materials and craftsmanship involved in the work' },
    { id: 'process', brief: 'tools and materials laid out during the work, hands only, tidy and professional' },
    { id: 'environment', brief: 'the place where the work happens, clean and well lit, no people' },
    { id: 'result', brief: 'a wide view of a completed project seen in daylight' },
  ],
  appointments: [
    { id: 'hero', brief: 'a calm, professional treatment or consultation space in natural light, no people' },
    { id: 'detail', brief: 'close detail of the tools and materials used in a session, tidy and warm' },
    { id: 'environment', brief: 'the welcoming reception or waiting area, soft light, no people' },
    { id: 'atmosphere', brief: 'a tactile detail of the space: linen, plants, natural textures' },
  ],
  creative: [
    { id: 'hero', brief: 'a studio wall or table with finished work displayed in soft natural light, no people' },
    { id: 'work', brief: 'a close-up of a piece of finished work, detailed and crisp' },
    { id: 'work2', brief: 'a second piece of finished work in a different setting, editorial framing' },
    { id: 'studio', brief: 'the working studio, tools and materials in order, natural light, no people' },
  ],
  nonprofit: [
    { id: 'hero', brief: 'a community gathering place in warm daylight, people seen from a distance or from behind' },
    { id: 'activity', brief: 'hands at work on a community activity, close and human, no faces' },
    { id: 'place', brief: 'the place the organisation works in, honest documentary light' },
    { id: 'detail', brief: 'a small telling detail from the work: tools, supplies or handwritten notes' },
  ],
};
function shotList(g) {
  const fam = g && g.family; const base = SHOTS[fam] || SHOTS.wellness;
  const im = (g && g.imagerySubjects) || {};
  return base.map(s => ({ id: s.id, brief: s.brief || (s.det ? im.detail : s.ctx ? im.context : im.hero) || im.hero || null })).filter(s => s.brief);
}
// minimum generated-photo counts per business type (hero included)
const MIN_PHOTOS = { wellness: 5, realestate: 4, retail: 4, hospitality: 4, local_service: 4, appointments: 4, creative: 4, nonprofit: 4, professional: 3 };
function minPhotos(g) { return MIN_PHOTOS[g && g.family] || 3; }

// ---- specific content (wellness pack) ------------------------------------------------------------------------------------------
// Neutral definitions of modalities the CUSTOMER NAMED. Nothing here asserts prices, schedules, teachers, credentials, outcomes or history.
const MODALITIES = [
  { k: 'yoga', re: /\byoga\b/i, title: 'Yoga classes', body: 'Classes that build strength, mobility and calm, at a pace you can choose.' },
  { k: 'pilates', re: /\bpilates\b/i, title: 'Pilates', body: 'Controlled, low-impact work for core strength and posture.' },
  { k: 'restorative', re: /\brestorative\b/i, title: 'Restorative yoga', body: 'Long, supported holds that let the body settle and release.' },
  { k: 'flow', re: /\b(vinyasa|flow classes?)\b/i, title: 'Flow classes', body: 'Movement linked to breath, building heat and focus.' },
  { k: 'mobility', re: /\bmobility\b/i, title: 'Mobility work', body: 'Focused work on range of motion and everyday movement.' },
  { k: 'recovery', re: /\b(recovery|recover)\b/i, title: 'Recovery sessions', body: 'Time set aside for your body to rest, release and reset.' },
  { k: 'massage', re: /\bmassage\b/i, title: 'Massage', body: 'Hands-on treatment to ease tension and support recovery.' },
  { k: 'physio', re: /\b(physio|physiotherapy|chiropract\w*)\b/i, title: 'Hands-on therapy', body: 'Assessment and treatment for aches, strains and movement limits.' },
  { k: 'breathwork', re: /\bbreathwork\b/i, title: 'Breathwork', body: 'Guided breathing to settle the nervous system.' },
  { k: 'meditation', re: /\bmeditat\w*\b/i, title: 'Meditation', body: 'Quiet, guided practice for a clearer head.' },
  { k: 'sauna', re: /\bsauna\b/i, title: 'Sauna', body: 'Heat to relax the body and unwind after a long day.' },
  { k: 'cold', re: /\bcold (plunge|therapy|immersion)\b/i, title: 'Cold plunge', body: 'Short, invigorating cold exposure.' },
  { k: 'stretch', re: /\bstretch\w*\b/i, title: 'Stretch sessions', body: 'Guided stretching to release tight muscles.' },
  { k: 'acupuncture', re: /\bacupuncture\b/i, title: 'Acupuncture', body: 'Traditional treatment to support balance and relief.' },
];
function detectModalities(text) {
  const t = String(text || ''); const hits = MODALITIES.filter(m => m.re.test(t));
  // "restorative yoga" and "yoga" both matching is fine, but do not list plain yoga twice as separate cards when a specific style is named
  return hits.filter(m => !(m.k === 'yoga' && hits.some(x => x.k === 'restorative' || x.k === 'flow')));
}
function wellnessPack(g, text) {
  const mods = detectModalities(text);
  const offerings = mods.map(m => ({ title: m.title, body: m.body })).slice(0, 5);
  if (offerings.length < 3) offerings.push({ title: 'Guided sessions', body: 'Sessions guided from start to finish, so you always know what comes next.' });
  const move = mods.find(m => ['yoga', 'restorative', 'flow', 'pilates', 'mobility', 'stretch'].includes(m.k));
  const rest = mods.find(m => ['recovery', 'massage', 'physio', 'sauna', 'cold', 'acupuncture', 'breathwork', 'meditation'].includes(m.k));
  const place = g && g.location ? ` in ${g.location}` : '';
  const cta = (g && g.primaryCTA) || 'Book a class';
  return {
    positioning: clip(g && g.primaryOffer ? g.primaryOffer.split(String.fromCharCode(46))[0].trim() : 'A studio for movement and recovery', 150) + '. A calm place to move well, rest properly and come back' + (place ? ',' + place : '') + '.',
    offerings,
    home: [
      { id: 'movement', side: 'left', headline: move ? `${move.title.replace(/ classes$/i, '')}, at your own pace` : 'Movement, at your own pace', body: move ? move.body : 'Classes that build strength, mobility and calm, whatever your starting point.' },
      { id: 'recovery', side: 'right', headline: 'Rest is part of the practice', body: rest ? rest.body : 'Time set aside for your body to rest, release and reset.' },
      { id: 'studio', side: 'full', headline: 'A calm place to begin', body: 'Whether you come for movement or for rest, the room is here to help you slow down.' },
    ],
    offer: [
      { id: 'group', side: 'right', headline: 'Together, or on your own', body: 'Join a class with others, or ask about a quieter, more personal session.' },
      { id: 'detail', side: 'left', headline: 'Care in the details', body: 'The small things — a warm towel, a quiet room, time to settle — are part of how we work.' },
    ],
    studio: [
      { id: 'studio', side: 'full', headline: 'The space', body: 'A room designed for quiet, focus and ease.' },
      { id: 'atmosphere', side: 'left', headline: 'Slow down on arrival', body: 'Tea, soft light and a moment to arrive before anything begins.' },
    ],
    cta: { headline: `Begin with ${/\b(class|classes|yoga|pilates)\b/i.test(text) ? 'a class' : 'a session'}${place}`, label: cta },
    philosophy: 'Strength comes from listening to your body as much as from pushing it. Movement and rest belong together.',
    process: ['Get in touch', 'Choose a class or session', 'Arrive and settle in', 'Move, rest, return'],
    faq: [
      { title: 'Do I need experience?', body: 'No. Tell us what you are comfortable with and we will suggest where to start.' },
      { title: 'What should I bring?', body: 'Wear something comfortable you can move in. If you are unsure about anything else, ask before your first visit.' },
      { title: 'How do I book?', body: `Use the “${cta}” button on this page to get in touch and we will help you choose.` },
      { title: rest ? `Can I come just for ${rest.title.toLowerCase()}?` : 'Can I ask about a specific need first?', body: 'Ask us. Tell us what you are looking for and we will point you to the right session.' },
    ],
    intros: {
      home: `${clip(g && g.primaryOffer ? g.primaryOffer.replace(/\.$/, '') : 'Movement and recovery', 120)}.`,
      offer: mods.length ? (s => s.charAt(0).toUpperCase() + s.slice(1))(`${mods.slice(0, 3).map(m => m.title.toLowerCase()).join(', ')} and guided sessions.`) : 'Classes and sessions, guided from start to finish.',
      studio: 'The space, and the thinking behind it.',
      contact: 'Tell us what you are looking for and we will help you begin.',
    },
  };
}
// Neutral captions for photo-led families that have no content pack: they describe the PHOTOGRAPH's subject, never make a claim
// (no prices, hours, materials, credentials or outcomes).
const CAPTIONS = {
  retail: { home: [['Up close', 'A closer look at the products, the materials and the finish.'], ['In everyday life', 'Made to sit naturally in your routine.'], ['Behind the brand', 'Where the products are kept and prepared for you.']], offer: [['The range', 'See what is available and how it comes together.'], ['Details that matter', 'Texture, colour and finish, seen properly.']], studio: [['The space', 'A look at where it all happens.'], ['The atmosphere', 'The feel of the brand, beyond the products.']] },
  hospitality: { home: [['The room', 'Take a seat and take it in.'], ['On the table', 'A look at what is served.'], ['The atmosphere', 'How the room feels.']], offer: [['What we serve', 'A closer look at the food and drink.'], ['In the kitchen', 'Where the preparation happens.']], studio: [['The space', 'A look around the room.'], ['The details', 'The small touches that make the room.']] },
  local_service: { home: [['The work, up close', 'The materials and detail behind every job.'], ['How it gets done', 'Tools, materials and careful process.'], ['The result', 'What finished work looks like.']], offer: [['Materials and craft', 'A closer look at what goes into the work.'], ['The process', 'Tidy, careful and thorough.']], studio: [['Where we work', 'A look at the place the work happens.'], ['The details', 'The small things that show in the finish.']] },
  creative: { home: [['Selected work', 'A closer look at recent work.'], ['In detail', 'Craft, texture and finish.'], ['The studio', 'Where the work happens.']], offer: [['The work', 'A closer look at how it is made.'], ['Materials', 'Tools, textures and finish.']], studio: [['The studio', 'Where the thinking and making happen.'], ['The details', 'The small things that shape the work.']] },
  nonprofit: { home: [['In the community', 'A look at the work in the places it happens.'], ['Hands at work', 'The people and effort behind it.'], ['The place', 'Where the work takes place.']], offer: [['How we help', 'A closer look at the work.'], ['Up close', 'The small details of what we do.']], studio: [['Our place', 'Where the work takes place.'], ['The details', 'The small things that make the work.']] },
  professional: { home: [['The workspace', 'Where the thinking happens.'], ['In detail', 'The materials behind the work.'], ['The place', 'A quiet room to work through the problem.']], offer: [['How the work goes', 'A closer look at the working process.'], ['In detail', 'The small things that keep it on track.']], studio: [['The space', 'Where the work happens.'], ['The details', 'The small things that shape the day.']] },
};
CAPTIONS.appointments = CAPTIONS.local_service;
function genericPack(g, text) {
  const sentences = String(text || '').split(/(?<=[.!?])s+/).map(s => s.trim()).filter(s => s.length > 40 && s.length < 220);
  const shots = shotList(g); const caps = CAPTIONS[g && g.family] || CAPTIONS.retail;
  const mk = (list, i, side) => ({ id: (shots[Math.min(i + 1, shots.length - 1)] && shots[Math.min(i + 1, shots.length - 1)].id) || 'detail' + i, side, headline: list[i][0], body: list[i][1] });
  return {
    positioning: sentences[0] ? clip(sentences[0], 200) : '',
    offerings: [], process: null, faq: null, philosophy: sentences[1] ? clip(sentences[1], 200) : '',
    home: [mk(caps.home, 0, 'left'), mk(caps.home, 1, 'right'), mk(caps.home, 2, 'full')],
    offer: [mk(caps.offer, 0, 'right'), mk(caps.offer, 1, 'left')],
    studio: [mk(caps.studio, 0, 'full'), mk(caps.studio, 1, 'left')],
    intros: { home: '', offer: '', studio: '', contact: '' },
  };
}
function packFor(g, text) { return g && g.family === 'wellness' ? wellnessPack(g, text) : g && g.family === 'realestate' ? realestatePack(g, text) : genericPack(g, text); }
// ---- real-estate content pack (buyer / seller / neighbourhood framing; never claims live inventory) --------------------------
function detectSide(text) {
  const t = String(text || ''); const buy = /\bbuy(er|ers|ing)?\b/i.test(t); const sell = /\bsell(er|ers|ing)?\b/i.test(t);
  return buy && sell ? 'both' : sell ? 'seller' : 'buyer';
}
// framing that never implies live inventory exists (Part 16): rotate deterministically so repeated generations for the same
// business text stay stable, but different businesses don't all read identically.
const SAFE_OFFER_FRAMING = ['Property types we work with', 'Areas we specialize in', 'What we help buyers find', 'Neighbourhoods we know well'];
function realestatePack(g, text) {
  const side = detectSide(text); const place = g && g.location ? ` in ${g.location}` : '';
  const cta = (g && g.primaryCTA) || 'Contact an Agent';
  const offerLabel = SAFE_OFFER_FRAMING[Math.abs(hashStr(text)) % SAFE_OFFER_FRAMING.length];
  const offerings = [
    { title: 'Buying', body: 'Guidance from the first search to closing day.' },
    { title: 'Selling', body: 'Strategy from pricing through to a signed deal.' },
    { title: 'Neighbourhoods', body: `Local knowledge across the areas we work${place || '.'}`.replace(/\.\.$/, '.') },
  ];
  const buyerProcess = ['Define the search', 'Review properties', 'Tour & compare', 'Offer & close'];
  const sellerProcess = ['Property review', 'Pricing strategy', 'Prepare & launch', 'Negotiate & close'];
  const neutralProcess = ['Get in touch', 'Understand your goals', 'Tour or list the property', 'Close with confidence'];
  return {
    positioning: clip(g && g.primaryOffer ? g.primaryOffer.replace(/[.!?]+$/, '') : 'A real estate team', 150) + `. Working with buyers and sellers${place}.`,
    offerings, offerLabel,
    home: [
      { id: 'neighborhood', side: 'left', headline: 'Get to know the neighbourhoods', body: `A closer look at the areas we work${place || '.'}`.replace(/\.\.$/, '.') },
      { id: side === 'seller' ? 'sellerInterior' : 'buyerLifestyle', side: 'right', headline: side === 'seller' ? 'Ready when you are' : 'Find the right fit', body: side === 'seller' ? 'Straightforward guidance from listing to close.' : 'A considered search, matched to what you actually need.' },
      { id: 'detail', side: 'full', headline: 'Care in the details', body: 'The small things -- clear communication, careful timing -- are part of how we work.' },
    ],
    offer: [ // Buyers page
      { id: 'buyerLifestyle', side: 'right', headline: 'A search built around you', body: 'Tell us what matters and we will focus the search around it.' },
      { id: 'detail', side: 'left', headline: 'What to expect', body: 'A clear process from the first conversation to the keys.' },
    ],
    studio: [ // Sellers page
      { id: 'sellerInterior', side: 'full', headline: 'Prepared to sell', body: 'A considered plan for pricing, presentation and timing.' },
      { id: 'neighborhood', side: 'left', headline: 'Priced with the market in mind', body: 'A strategy grounded in the neighbourhood, not guesswork.' },
    ],
    philosophy: 'Buying or selling a home is a big decision. We keep the process clear and the communication direct.',
    processByRole: { home: neutralProcess, offer: buyerProcess, studio: sellerProcess },
    faq: [
      { title: 'Do you work with both buyers and sellers?', body: side === 'both' ? 'Yes -- tell us which applies to you and we will point you to the right next step.' : `We focus on ${side === 'seller' ? 'sellers' : 'buyers'}${place}; ask us if your situation is different.` },
      { title: 'How do I start if I\u2019m buying?', body: 'Reach out and tell us what you are looking for; we will help you shape the search.' },
      { title: 'How do I start if I\u2019m selling?', body: 'Reach out and we will walk through pricing and timing together.' },
      { title: 'Which areas do you work in?', body: place ? `Primarily${place}; ask us about anywhere nearby.` : 'Ask us -- we will tell you the areas we know best.' },
    ],
    intros: { home: '', offer: 'Buyer process and property types.', studio: 'Seller strategy, from pricing to close.', contact: 'Get in touch to start a conversation.' },
    cta: { headline: `Contact us about buying or selling${place}`, label: cta },
  };
}
function hashStr(s) { let h = 0; for (const c of String(s || '')) h = (h * 31 + c.charCodeAt(0)) | 0; return h; }
// Part 16/17: "current listings", "active/available/our/exclusive listings" and "current inventory" claim live property inventory
// that was never supplied -- replace with a safe, non-inventory-implying framing (rotated deterministically per text).
function wb(word) { return '(^|[^a-z0-9])' + word + '(?![a-z0-9])'; }
const INVENTORY_CLAIM_RE = new RegExp(wb('(current|active|available|our|exclusive) +listings') + '|' + wb('current +(inventory|properties)'), 'i');
function sanitizeListingClaim(text, g) {
  if (!g || g.family !== 'realestate') return null;
  const t = String(text || ''); if (!INVENTORY_CLAIM_RE.test(t)) return null;
  return SAFE_OFFER_FRAMING[Math.abs(hashStr(t)) % SAFE_OFFER_FRAMING.length];
}

// ---- instruction / filler detection ---------------------------------------------------------------------------------------------
const INSTRUCTION_VERBS = 'explain|convey|establish|communicate|demonstrate|clarify|reassure|address|outline|describe|introduce|highlight|emphasi[sz]e|position|articulate|reinforce|showcase|ensure|encourage|prompt|drive|guide visitors|help visitors|let visitors|give visitors|show visitors|remove friction|reduce friction|make (the )?(cost|starting|it easy)|answer the|orient the|put real people|prove quality|show exactly|show how|show what|set expectations|build trust|create a sense|capture the|tell the story|walk (a |the )?(prospective |visiting )?(visitor|buyer|seller|client|customer)s?( through)?|make (the )?cost clear';
const INSTRUCTION_RE = new RegExp('^\\s*(' + INSTRUCTION_VERBS + ')\\b', 'i');
const PERSONAL = /\b(you|your|we|our|us|i|my)\b/i;
const FILLER = [/\ba regular part of the .{0,40}on offer\b/i, /\breal .{0,30}, presented clearly\b/i, /\bhandled with the same rigor\b/i, /\bpart of (how|what)'?s? .{0,30}(gets done|launching)\b/i,
  /\breach out and we'll walk through\b/i, /\bwe.re happy to talk through whether\b/i, /\bis support included\b/i, /\breal help, not just documentation\b/i, /\bsimple, honest .{0,20} explained\b/i,
  /\ba considered seasonal selection\b/i, /\bmade for sharing, with detail in every choice\b/i, /\bbuilt around .{0,60}, without the busywork\b/i, /\bexplain each\b/i, /\bconvey the\b/i];
function looksLikeInstruction(text) {
  const t = String(text || '').trim(); if (!t) return false;
  if (FILLER.some(re => re.test(t))) return true;
  if (INSTRUCTION_RE.test(t) && !PERSONAL.test(t)) return true;
  // "<Verb> each/the/how/what ..." planner phrasing even when the verb is not in the list above
  if (/^\s*(explain|convey|establish|communicate|demonstrate|clarify|introduce|highlight|remove|reduce|answer|orient|prove|put|walk)\s+(each|the|how|what|why|who|real|friction|quality|objections?|a|prospective)\b/i.test(t)) return true;
  return false;
}

// ---- layout planning ----------------------------------------------------------------------------------------------------------
const roleOfLabel = label => {
  const l = String(label || '').toLowerCase();
  if (/contact|visit|find us|reach|hours|get in touch|book\b/.test(l)) return 'contact';
  if (/studio|about|story|space|philosoph|approach|who we|our |sellers?|selling/.test(l)) return 'studio';
  if (/class|session|recover|treat|service|program|offer|what we|menu|shop|product|work|collection|classes|buyers?|buying|listings?|neighbo(u)?rhood/.test(l)) return 'offer';
  return 'other';
};
function newSection(type, variant, copy, extra) { return Object.assign({ id: uid(type), type, variant, copy: copy || null, intent: 'educate', headlineRole: 'declarative' }, extra || {}); }
function setItems(copy, items) { copy = copy || {}; items.slice(0, 6).forEach((it, i) => { copy['t' + (i + 1)] = clip(it.title, 80); copy['b' + (i + 1)] = clip(it.body || '', 260); }); return copy; }
function itemsOf(section) {
  const c = section && section.copy; if (!c || typeof c !== 'object') return null; const out = [];
  for (let i = 1; i <= 6; i++) { if (typeof c['t' + i] === 'string' && c['t' + i]) out.push({ title: c['t' + i], body: typeof c['b' + i] === 'string' ? c['b' + i] : '' }); }
  return out.length ? out : null;
}
// SITEREMADE_VISUAL_ENGINE_V1 (Parts 5, 10): each feature gets a deliberately DIFFERENT media treatment from its
// neighbour (never the same composition twice in a row), instead of every image-left/image-right section looking
// like a plain rectangle in a frame.
// V1.1 (Part 6): all 6 defined compositions are now genuinely in rotation, not just the 3 originally wired.
const FEATURE_MEDIA_CYCLE = { left: ['OFFSET_IMAGE', 'OVERLAPPING_PAIR'], right: ['DEFAULT', 'VERTICAL_EDITORIAL'], full: ['FULL_WIDTH_BAND'], quote: ['VISUAL_QUOTE'] };
function featureSection(shot, spec, index) {
  const side = spec.side === 'full' ? 'full' : spec.side === 'left' ? 'left' : spec.side === 'right' ? 'right' : 'quote';
  const cycle = FEATURE_MEDIA_CYCLE[side] || ['DEFAULT'];
  const mediaComposition = cycle[(index || 0) % cycle.length];
  return newSection('editorialFeature', side === 'full' ? 'full' : side === 'left' ? 'image-left' : side === 'right' ? 'image-right' : 'quote',
    { headline: spec.headline, body: spec.body, brief: clip(shot ? shot.brief : '', 200), shot: spec.id }, { mediaComposition });
}
// Build the photo-led page plan. Existing sections whose type is reused keep their id (so uploads, edits and links survive).
// direction: the project/direction; returns a NEW direction and a change list. Deterministic; never removes the customer's own edits
// on pages it does not own (it only reshapes the pages of a fresh generation: home + offer/studio/contact-style pages).
function planLayout(direction, g, text) {
  const d = JSON.parse(JSON.stringify(direction)); const changes = [];
  if (!isPhotoLed(g, text) || !Array.isArray(d.pages) || !d.pages.length) return { direction: d, changes };
  const pack = packFor(g, text); const shots = shotList(g); const byId = Object.fromEntries(shots.map(s => [s.id, s]));
  const wellness = g.family === 'wellness'; const realestate = g.family === 'realestate'; const storyDriven = wellness || realestate;
  const take = (page, type) => { const i = (page.sections || []).findIndex(s => s.type === type); return i === -1 ? null : page.sections.splice(i, 1)[0]; };
  const keepFooter = page => (page.sections || []).filter(s => s.type === 'footer');
  const build = (page, role) => {
    const pool = page.sections || []; const foot = keepFooter(page);
    const rest = pool.filter(s => s.type !== 'footer');
    const bag = { about: null, services: null, faq: null, process: null, cta: null, contact: null, gallery: null };
    rest.forEach(s => { if (s.type === 'about' && !bag.about) bag.about = s; else if (s.type === 'services' && !bag.services) bag.services = s; else if (s.type === 'faq' && !bag.faq) bag.faq = s; else if (s.type === 'process' && !bag.process) bag.process = s; else if (s.type === 'ctaBanner' && !bag.cta) bag.cta = s; else if (s.type === 'contact' && !bag.contact) bag.contact = s; else if ((s.type === 'gallery' || s.type === 'caseStudies') && !bag.gallery) bag.gallery = s; });
    // planning twice must not create new feature sections (each one is an image slot = money): reuse the existing section for a shot id
    const existing = new Map(rest.filter(s => s.type === 'editorialFeature' && s.copy && s.copy.shot).map(s => [s.copy.shot, s]));
    let featIndex = 0;
    const feat = spec => existing.get(spec.id) || featureSection(byId[spec.id] || shots[shots.length - 1], spec, featIndex++);
    const withItems = (s, type, items, variant) => { const sec = s || newSection(type, variant, null); sec.copy = setItems(Object.assign({}, sec.copy), items); if (variant) sec.variant = variant; return sec; };
    const statement = (s, headline, body) => { const sec = s || newSection('about', 'statement', null); sec.variant = 'statement'; sec.imageDisplayVariant = 'statement'; sec.copy = Object.assign({}, sec.copy, { headline, body }); return sec; };
    const cta = bag.cta || newSection('ctaBanner', 'accent', null);
    if (storyDriven) cta.copy = Object.assign({}, cta.copy, { headline: pack.cta.headline, ctaLabel: pack.cta.label });
    const procSteps = role2 => ((pack.processByRole && pack.processByRole[role2]) || pack.process || []).map(t => ({ title: t, body: '' }));
    let seq = null;
    if (realestate && role === 'home') {
      seq = [statement(bag.about, 'Our approach', pack.positioning), withItems(bag.services, 'services', pack.offerings, 'described'), feat(pack.home[0]), feat(pack.home[1]), feat(pack.home[2]),
        withItems(bag.faq, 'faq', pack.faq), cta];
      seq[1].copy.headline = pack.offerLabel;
      seq[5].copy.headline = 'Good to know';
    } else if (realestate && role === 'offer') {
      seq = [feat(pack.offer[0]), withItems(bag.process, 'process', procSteps('offer')), feat(pack.offer[1]), withItems(bag.faq, 'faq', pack.faq), cta];
      seq[1].copy.headline = 'How it works';
    } else if (realestate && role === 'studio') {
      seq = [feat(pack.studio[0]), withItems(bag.process, 'process', procSteps('studio')), feat(pack.studio[1]), withItems(bag.faq, 'faq', pack.faq), cta];
      seq[1].copy.headline = 'How it works';
    } else if (wellness && role === 'home') {
      seq = [statement(bag.about, 'Our approach', pack.positioning), withItems(bag.services, 'services', pack.offerings, 'described'), feat(pack.home[0]), feat(pack.home[1]), feat(pack.home[2]),
        newSection('about', 'statement', { headline: 'Philosophy', body: pack.philosophy }, { imageDisplayVariant: 'statement' }),
        withItems(bag.process, 'process', procSteps('home')), withItems(bag.faq, 'faq', pack.faq), cta];
      seq[1].copy.headline = seq[1].copy.headline && !looksLikeInstruction(seq[1].copy.headline) ? seq[1].copy.headline : 'Classes & recovery';
      seq[6].copy.headline = 'Your first visit'; seq[7].copy.headline = 'Good to know';
    } else if (wellness && role === 'offer') {
      seq = [withItems(bag.services, 'services', pack.offerings, 'numbered'), feat(pack.offer[0]), feat(pack.offer[1]), withItems(bag.process, 'process', procSteps('offer')), cta];
      seq[0].copy.headline = seq[0].copy.headline && !looksLikeInstruction(seq[0].copy.headline) ? seq[0].copy.headline : 'What we offer'; seq[3].copy.headline = 'Your first visit';
    } else if (wellness && role === 'studio') {
      seq = [feat(pack.studio[0]), statement(bag.about, 'Philosophy', pack.philosophy), feat(pack.studio[1]), withItems(bag.faq, 'faq', pack.faq), cta];
      seq[3].copy.headline = 'Good to know';
    } else if (!wellness && role === 'home') {
      // keep the planner's own sections; break the repetition with alternating photographic features after the first two sections
      const kept = rest.filter(s => !['editorialFeature'].includes(s.type));
      const f1 = feat(pack.home[0]), f2 = feat(pack.home[1]), f3 = feat(pack.home[2]);
      seq = [].concat(kept.slice(0, 1), f1, kept.slice(1, 2), f2, kept.slice(2, 3), f3, kept.slice(3));
    } else if (!wellness && (role === 'offer' || role === 'studio') && rest.length < 5) {
      const kept = rest.filter(s => s.type !== 'editorialFeature'); const specs = role === 'offer' ? pack.offer : pack.studio;
      seq = [].concat(kept.slice(0, 1), feat(specs[0]), kept.slice(1, 2), feat(specs[1]), kept.slice(2));
    }
    if (!seq) return false;
    // drop generic filler bodies the planner or vocab produced; features must always carry a photograph brief
    page.sections = seq.filter(Boolean).concat(foot);
    // V1.1 Part 7: ONE deliberate, industry-fitting surface texture on this page's single strongest visual moment
    // (never the whole site -- "do not add random gradients everywhere"), and only when it will not hurt contrast.
    if (role === 'home') {
      try {
        const VE = require('./visual-engine'); const V = require('./visuals');
        const texturedId = VE.pickTexturedSection([page], g.family);
        if (texturedId) { const target = page.sections.find(s => s.id === texturedId); if (target) target.surfaceTexture = VE.surfaceTextureFor(V.profileFromGrounding(g).id); }
      } catch (err) { /* texture is cosmetic; never blocks generation */ }
    }
    // SITEREMADE_MOTION_ENGINE_V1 (Part 15): at most ONE lightweight sticky/
    // pinned feature per page (never per site), and only when this business's
    // own resolved motion intensity is MODERATE/EXPRESSIVE -- a SUBTLE/NONE
    // page (the explicit `motion:'none'` kill switch, or an industry that
    // leans restrained) must never scroll-pin anything (stickyEligible's own
    // rank check enforces this, not a duplicate check here).
    try {
      const ME = require('./motion-engine');
      const dims = direction.design && direction.design.dimensions;
      const intensity = ME.motionIntensityFor({ industryFamily: g.family, requestedMotion: dims && dims.motion });
      const stickyId = ME.pickStickySection(page.sections, intensity);
      if (stickyId) { const target = page.sections.find(s => s.id === stickyId); if (target) target.stickyMode = 'LIGHT'; }
    } catch (err) { /* sticky is cosmetic; never blocks generation */ }
    return true;
  };
  let seenOffer = false, seenStudio = false;
  const GENERIC_LABEL = /^(services?|work|our work|portfolio|shop|product|products|offerings?|about|about us|menu|collection|listings?)$/i;
  d.pages.forEach((p, i) => {
    let role = i === 0 ? 'home' : roleOfLabel(p.label);
    // a business needs one page for what it offers and one for the place / philosophy; a second "offer-like" page becomes the studio page
    if (storyDriven && i > 0) { if (role === 'offer' && seenOffer && !seenStudio) role = 'studio'; if (role === 'offer') seenOffer = true; if (role === 'studio') seenStudio = true; }
    if (storyDriven && i > 0 && GENERIC_LABEL.test(String(p.label || '').trim())) { const nl = realestate ? (role === 'offer' ? 'Buyers' : role === 'studio' ? 'Sellers' : null) : role === 'offer' ? (detectModalities(text).length >= 2 ? 'Classes & Recovery' : 'Classes & Sessions') : role === 'studio' ? 'The Studio' : null; if (nl && nl !== p.label) { p.label = nl; changes.push({ kind: 'rename_page', target: p.slug || 'home', label: nl }); } }
    if (role === 'contact' || role === 'other') { if (storyDriven && p.purpose && looksLikeInstruction(p.purpose)) p.purpose = pack.intros.contact; return; }
    if (build(p, role)) { changes.push({ kind: 'plan_photo_layout', target: p.slug || 'home', role }); if (storyDriven) p.purpose = pack.intros[role] || ''; else if (looksLikeInstruction(p.purpose)) p.purpose = ''; }
  });
  d.pages.forEach(p => { if (looksLikeInstruction(p.purpose)) { p.purpose = ''; changes.push({ kind: 'clear_purpose', target: p.slug || 'home' }); } });
  return { direction: d, changes };
}

// ---- gates -------------------------------------------------------------------------------------------------------------------------
function checkPhotoLed(direction, g, text) {
  const out = []; const add = d => out.push(Object.assign({ severity: 2, target: { kind: 'site', id: null }, source: 'deterministic' }, d));
  if (!isPhotoLed(g, text)) return out;
  const plan = direction.imagePlan || []; const pages = direction.pages || [];
  const secs = []; pages.forEach(p => (p.sections || []).forEach(s => secs.push({ p, s })));
  const visible = plan.filter(e => /^(hero|gallery-featured|about|product|.*feature-|.*gallery-)/.test(e.slot || '') || true);
  const generated = plan.filter(e => e.sourceType === 'generated'); const starters = plan.filter(e => e.sourceType === 'designed' && e.starter);
  const need = minPhotos(g);
  if (generated.length < need) add({ category: 'MEDIA_COMPLETENESS', code: 'photo_set_incomplete', severity: 3, detail: `${generated.length} generated photo slot(s), ${need} expected for ${g.family}`, repair: { kind: 'plan_photo_layout' } });
  if (plan.length && starters.length >= Math.max(2, plan.length / 2)) add({ category: 'INDUSTRY_VISUAL_FIT', code: 'photo_led_mostly_starter_art', severity: 3, detail: `${starters.length} of ${plan.length} visual slots are starter graphics on a photo-led site`, target: { kind: 'site', id: null } });
  const hero = plan.find(e => e.slot === 'hero'); const dims = (direction.design && direction.design.dimensions) || {}; const hv = dims.heroDisplayVariant || dims.hero;
  if (['centered-oversized', 'minimal-text-only', 'poster'].includes(hv) || (hero && hero.sourceType === 'designed' && !hero.starter)) add({ category: 'HERO_VISUAL_STRENGTH', code: 'photo_led_hero_without_anchor', severity: 3, detail: `hero layout ${hv} / ${hero ? hero.sourceType : 'no hero slot'}`, target: { kind: 'hero', id: 'hero' } });
  // repeated generic card sections on one page
  pages.forEach(p => { const cards = (p.sections || []).filter(s => ['services', 'features', 'testimonialsGrid', 'team'].includes(s.type)); if (cards.length >= 3) add({ category: 'GENERIC_TEMPLATE_FEEL', code: 'repeated_card_sections', severity: 2, detail: `${p.label}: ${cards.length} card-grid sections`, target: { kind: 'page', id: p.slug } }); });
  // sparse pages
  pages.forEach((p, i) => { const n = (p.sections || []).filter(s => s.type !== 'footer').length; const role = i === 0 ? 'home' : roleOfLabel(p.label); if (n < (i === 0 ? 6 : role === 'contact' ? 1 : 3) && role !== 'other') add({ category: 'SECONDARY_PAGE_DEPTH', code: 'page_too_sparse', severity: i === 0 ? 3 : 2, detail: `${p.label}: ${n} section(s)`, target: { kind: 'page', id: p.slug }, repair: { kind: 'plan_photo_layout' } }); });
  // generic FAQ answers
  secs.filter(x => x.s.type === 'faq').forEach(x => { const its = itemsOf(x.s); if (!its) add({ category: 'COPY_SPECIFICITY', code: 'generic_faq', severity: 2, detail: 'FAQ uses the template questions', target: { kind: 'section', id: x.s.id }, repair: { kind: 'plan_photo_layout' } }); });
  // filler / instruction text anywhere
  const scan = (where, t) => { if (typeof t === 'string' && looksLikeInstruction(t)) add({ category: 'PAGE_PURPOSE_CLARITY', code: 'instruction_text_on_site', severity: 3, detail: `${where}: ${t.slice(0, 80)}`, target: { kind: 'site', id: where } }); };
  Object.keys(direction.copy || {}).forEach(k => scan('hero.' + k, direction.copy[k]));
  pages.forEach(p => { scan('page:' + (p.slug || 'home') + '.purpose', p.purpose); (p.sections || []).forEach(s => Object.keys(s.copy || {}).forEach(k => scan(s.id + '.' + k, s.copy[k]))); });
  return out;
}

// ---- rendering (shared by preview and export) ---------------------------------------------------------------------------------------
// deps: { escapeHtml, renderVisualSlot(project, slot, imageryKey, assetId), renderCtaButton?(target, label, cls), slotFor(project, section) }
// one image slot per feature section, keyed by the section id (stable across reordering, like gallery tiles)
function featureSlot(project, section) { return `${section.id}::feature`; }
function renderFeature(project, section, deps) {
  const e = deps.escapeHtml; const c = (section && section.copy) || {}; const variant = (section && section.variant) || 'image-left';
  const headline = e(c.headline || ''); const body = c.body ? `<p class="feature-body">${e(c.body)}</p>` : '';
  if (variant === 'quote') return `<div class="site-section site-section-feature" data-variant="quote" data-media-comp="VISUAL_QUOTE"><blockquote class="feature-quote"><p>${e(c.body || c.headline || '')}</p>${c.headline && c.body ? `<cite>${headline}</cite>` : ''}</blockquote></div>`;
  const slot = deps.slotFor(project, section);
  const visual = deps.renderVisualSlot(project, slot, project.design.dimensions.imagery, null);
  // V1.1 Part 7/14: a surface texture is only ever applied where it will not hurt the site's own text/background
  // contrast -- checked against the real palette at render time (same, single implementation preview and export share).
  const texture = section && section.surfaceTexture; const pal = (project.design && project.design.palette) || {};
  const VE0 = require('./visual-engine'); const ME0 = require('./motion-engine');
  const textureAttr = (texture && VE0.safeToTexture(pal.text, pal.background)) ? ` data-surface-texture="${VE0.normalizeSurfaceTexture(texture)}"` : '';
  // SITEREMADE_VISUAL_ENGINE_V1 (Part 5): an optional media-composition treatment layered on top of the existing
  // image-left/image-right/full frame -- normalized so only the fixed vocabulary in visual-engine.js can ever reach here.
  const VE = require('./visual-engine'); const mc = VE.normalizeMediaComposition(section && section.mediaComposition, 'DEFAULT');
  const mediaCls = VE.MEDIA_COMPOSITIONS[mc].cls; const visualCls = 'feature-visual' + (mediaCls ? ' ' + mediaCls : '');
  // OVERLAPPING_PAIR (Part 6): a second, smaller image overlapping the corner -- reuses the hero's OWN already-
  // resolved image (zero new image-model spend, Part 27) rather than requesting a new asset.
  const echo = mc === 'OVERLAPPING_PAIR' ? `<div class="feature-visual-echo">${deps.renderVisualSlot(project, 'hero', project.design.dimensions.imagery, null)}</div>` : '';
  if (variant === 'full') return `<div class="site-section site-section-feature" data-variant="full" data-media-comp="${mc}"${textureAttr}><div class="${visualCls}">${visual}<div class="feature-scrim"></div></div><div class="feature-overlay"><h2 class="feature-headline">${headline}</h2>${body}</div></div>`;
  // SITEREMADE_MOTION_ENGINE_V1 (Part 15): the one lightweight sticky/pinned
  // feature editorial.js's planLayout may have chosen for this page (never
  // decided here -- this only renders a plan-time field, exactly like
  // mediaComposition/surfaceTexture above).
  const sticky = ME0.normalizeStickyMode(section && section.stickyMode) === 'LIGHT' ? ' data-sticky="LIGHT"' : '';
  return `<div class="site-section site-section-feature" data-variant="${variant === 'image-right' ? 'image-right' : 'image-left'}" data-media-comp="${mc}"${textureAttr}${sticky}><div class="${visualCls}">${visual}${echo}</div><div class="feature-copy"><h2 class="feature-headline">${headline}</h2>${body}</div></div>`;
}

module.exports = { INVENTORY_CLAIM_RE, sanitizeListingClaim, PHOTO_LED_FAMILIES, isPhotoLed, shotList, minPhotos, MODALITIES, detectModalities, packFor, wellnessPack, realestatePack, genericPack, looksLikeInstruction, INSTRUCTION_RE, FILLER,
  roleOfLabel, planLayout, checkPhotoLed, itemsOf, setItems, featureSlot, renderFeature, SHOTS };
