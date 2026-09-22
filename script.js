const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

// ==========================================================================
// STYLE SEEDS -- internal only as of V5. These 20 named combinations are
// fallbacks/anchors/tested design references, never shown to a visitor by
// name anywhere in the UI, the generation-progress copy, or the customer-
// facing confirmation email (see SITE-PROJECT-V5.md, part 5). Each is a
// combination of reusable design dimensions (hero/type/nav/card/imagery/
// cta/colorBehavior/motion/spacing/pattern) plus a palette. Shared CSS
// rules key off these data-* values -- adding a seed means adding an entry
// here, not a bespoke CSS block.
// ==========================================================================
const styles = {
  luminous:  { name:'Luminous',  tagline:'Modern UI with controlled glow and depth.',
    palette:{ main:'#315cff', accent2:'#7d8fff', background:'#0c1120', text:'#ffffff' },
    hero:'split', type:'geo-sans', nav:'inline', card:'elevated-shadow', imagery:'abstract-geometric',
    cta:'solid-pill', colorBehavior:'high-contrast-mono-accent', motion:'subtle', spacing:'standard', pattern:'standard' },
  editorial: { name:'Editorial', tagline:'Publication-inspired structure with timeless typography.',
    palette:{ main:'#8b6d4f', accent2:'#c9a877', background:'#f5efe6', text:'#1d1915' },
    hero:'split', type:'serif-editorial', nav:'centered-logo', card:'outline-ghost', imagery:'texture-organic',
    cta:'sharp-block', colorBehavior:'warm-earth-multi-tone', motion:'subtle', spacing:'airy', pattern:'story-first' },
  precision: { name:'Precision', tagline:'Minimal, refined and intentionally quiet.',
    palette:{ main:'#315cff', accent2:'#8fa6ff', background:'#fafafa', text:'#111111' },
    hero:'split', type:'geo-sans', nav:'inline', card:'flat', imagery:'abstract-geometric',
    cta:'solid-pill', colorBehavior:'neutral-single-accent', motion:'subtle', spacing:'standard', pattern:'standard' },
  studio:    { name:'Studio', tagline:'Expressive layouts with contemporary creative energy.',
    palette:{ main:'#ff6b3d', accent2:'#315cff', background:'#f2e8db', text:'#111111' },
    hero:'split', type:'display-condensed', nav:'inline', card:'outline-ghost', imagery:'illustration',
    cta:'sharp-block', colorBehavior:'warm-earth-multi-tone', motion:'expressive', spacing:'standard', pattern:'portfolio-first' },
  executive: { name:'Executive', tagline:'Established, premium and built around trust.',
    palette:{ main:'#b59b6d', accent2:'#d5c49f', background:'#13231d', text:'#f0eadf' },
    hero:'split', type:'classic-serif-mix', nav:'centered-logo', card:'bordered', imagery:'abstract-geometric',
    cta:'outline-ghost', colorBehavior:'dark-luxury-metallic', motion:'subtle', spacing:'airy', pattern:'proof-first' },
  impact:    { name:'Impact', tagline:'Big, direct and impossible to ignore.',
    palette:{ main:'#e8ff43', accent2:'#ff5b37', background:'#ff5b37', text:'#111111' },
    hero:'split', type:'display-condensed', nav:'inline', card:'bordered', imagery:'abstract-geometric',
    cta:'sharp-block', colorBehavior:'high-contrast-mono-accent', motion:'expressive', spacing:'compact', pattern:'standard' },
  atelier:   { name:'Atelier', tagline:'Warm, tactile and hand-crafted in feel.',
    palette:{ main:'#a9714f', accent2:'#d9b48f', background:'#f6efe4', text:'#241c14' },
    hero:'stacked-image-below', type:'serif-editorial', nav:'centered-logo', card:'outline-ghost', imagery:'texture-organic',
    cta:'underline-link', colorBehavior:'warm-earth-multi-tone', motion:'subtle', spacing:'airy', pattern:'story-first' },
  foundry:   { name:'Foundry', tagline:'Industrial structure with technical precision.',
    palette:{ main:'#8c8f96', accent2:'#c6c9d0', background:'#1b1c1f', text:'#f1f2f4' },
    hero:'asymmetric-offset', type:'mono-technical', nav:'sidebar', card:'bordered', imagery:'grid-mosaic',
    cta:'sharp-block', colorBehavior:'neutral-single-accent', motion:'none', spacing:'compact', pattern:'standard' },
  signal:    { name:'Signal', tagline:'High-contrast and startup-fast.',
    palette:{ main:'#5b5bff', accent2:'#00e5c7', background:'#0a0a12', text:'#f5f5ff' },
    hero:'minimal-text-only', type:'geo-sans', nav:'minimal-until-scroll', card:'elevated-shadow', imagery:'abstract-geometric',
    cta:'floating-badge', colorBehavior:'high-contrast-mono-accent', motion:'expressive', spacing:'compact', pattern:'proof-first' },
  meridian:  { name:'Meridian', tagline:'Calm, spacious and considered.',
    palette:{ main:'#7c8f7a', accent2:'#d8cdb8', background:'#f4f1ea', text:'#2c2b26' },
    hero:'stacked-image-below', type:'humanist', nav:'centered-logo', card:'flat', imagery:'texture-organic',
    cta:'underline-link', colorBehavior:'neutral-single-accent', motion:'subtle', spacing:'generous', pattern:'story-first' },
  nightshade:{ name:'Nightshade', tagline:'Moody, after-hours and cinematic.',
    palette:{ main:'#7c5cff', accent2:'#ff5cb3', background:'#0a0812', text:'#ece7ff' },
    hero:'fullbleed-image', type:'geo-sans', nav:'minimal-until-scroll', card:'elevated-shadow', imagery:'abstract-geometric',
    cta:'floating-badge', colorBehavior:'dark-luxury-metallic', motion:'subtle', spacing:'standard', pattern:'standard' },
  paper:     { name:'Paper', tagline:'Stark, minimal and almost monochrome.',
    palette:{ main:'#111111', accent2:'#555555', background:'#ffffff', text:'#111111' },
    hero:'minimal-text-only', type:'geo-sans', nav:'inline', card:'flat', imagery:'abstract-geometric',
    cta:'underline-link', colorBehavior:'neutral-single-accent', motion:'none', spacing:'generous', pattern:'standard' },
  terra:     { name:'Terra', tagline:'Earthy, natural and unhurried.',
    palette:{ main:'#5c7a4d', accent2:'#c98f4e', background:'#f1ece0', text:'#26241c' },
    hero:'stacked-image-below', type:'humanist', nav:'inline', card:'outline-ghost', imagery:'texture-organic',
    cta:'solid-pill', colorBehavior:'warm-earth-multi-tone', motion:'subtle', spacing:'airy', pattern:'story-first' },
  aperture:  { name:'Aperture', tagline:'Photography-first and gallery-quiet.',
    palette:{ main:'#111111', accent2:'#e8e8e8', background:'#0d0d0d', text:'#f5f5f5' },
    hero:'fullbleed-image', type:'geo-sans', nav:'minimal-until-scroll', card:'image-led', imagery:'photo-led-placeholder',
    cta:'underline-link', colorBehavior:'neutral-single-accent', motion:'subtle', spacing:'compact', pattern:'portfolio-first' },
  civic:     { name:'Civic', tagline:'Institutional, trustworthy and composed.',
    palette:{ main:'#1f3a5f', accent2:'#c7a252', background:'#f5f4f0', text:'#1a1a1a' },
    hero:'centered', type:'classic-serif-mix', nav:'boxed-pill', card:'bordered', imagery:'abstract-geometric',
    cta:'solid-pill', colorBehavior:'neutral-single-accent', motion:'none', spacing:'standard', pattern:'proof-first' },
  kinetic:   { name:'Kinetic', tagline:'Energetic, athletic and fast-moving.',
    palette:{ main:'#ff3d3d', accent2:'#111111', background:'#111111', text:'#ffffff' },
    hero:'asymmetric-offset', type:'display-condensed', nav:'inline', card:'bordered', imagery:'abstract-geometric',
    cta:'sharp-block', colorBehavior:'high-contrast-mono-accent', motion:'expressive', spacing:'compact', pattern:'standard' },
  ledger:    { name:'Ledger', tagline:'Data-forward with a technical edge.',
    palette:{ main:'#0ea5a3', accent2:'#111827', background:'#0b0f14', text:'#e6f1f0' },
    hero:'split', type:'mono-technical', nav:'inline', card:'elevated-shadow', imagery:'grid-mosaic',
    cta:'solid-pill', colorBehavior:'neutral-single-accent', motion:'subtle', spacing:'compact', pattern:'proof-first' },
  bloom:     { name:'Bloom', tagline:'Playful, soft and boutique.',
    palette:{ main:'#e88ba5', accent2:'#f6d9a8', background:'#fdf2f0', text:'#3a2430' },
    hero:'centered', type:'humanist', nav:'boxed-pill', card:'flat', imagery:'illustration',
    cta:'solid-pill', colorBehavior:'warm-earth-multi-tone', motion:'subtle', spacing:'airy', pattern:'standard' },
  monolith:  { name:'Monolith', tagline:'Oversized, architectural and stark.',
    palette:{ main:'#d5d5d5', accent2:'#8a8a8a', background:'#101010', text:'#f2f2f2' },
    hero:'asymmetric-offset', type:'display-condensed', nav:'sidebar', card:'outline-ghost', imagery:'abstract-geometric',
    cta:'underline-link', colorBehavior:'neutral-single-accent', motion:'none', spacing:'generous', pattern:'standard' },
  aviator:   { name:'Aviator', tagline:'Heritage-inspired and quietly premium.',
    palette:{ main:'#8a5a34', accent2:'#c9a86a', background:'#1a1410', text:'#f1e6d8' },
    hero:'centered', type:'classic-serif-mix', nav:'centered-logo', card:'bordered', imagery:'texture-organic',
    cta:'outline-ghost', colorBehavior:'dark-luxury-metallic', motion:'subtle', spacing:'airy', pattern:'proof-first' }
};
const styleKeys = Object.keys(styles);

// ==========================================================================
// CATEGORIES -- broad by default. Public product copy never assumes any one
// of these; this is the generator's internal knowledge, used to produce a
// real, category-appropriate result once a business is described. Trades
// are one category family among many, not the default.
// ==========================================================================
const categories = {
  tech:         { label:'Technology',               kicker:'TECHNOLOGY',            headline:'Built for how you work.',                  sub:'A product site that explains itself in the first ten seconds.', services:['Product','Pricing','Docs'], cta:'Get Started', noun:'product' },
  finance:      { label:'Finance',                   kicker:'FINANCE',                headline:'Clarity for the long term.',               sub:'A site that earns trust before the first conversation happens.', services:['Approach','Planning','Insights'], cta:'Book a Consultation', noun:'guidance' },
  fashion:      { label:'Fashion',                   kicker:'FASHION',                headline:'Made to be seen.',                         sub:'A storefront with the same restraint and confidence as the collection.', services:['Collection','Lookbook','Stockists'], cta:'Shop the Collection', noun:'collection' },
  hospitality:  { label:'Food & Hospitality',        kicker:'FOOD & HOSPITALITY',     headline:'Made to be experienced.',                  sub:'A menu and a room worth showing off before anyone walks in the door.', services:['Menu','Catering','Reservations'], cta:'View Menu', noun:'experience' },
  creative:     { label:'Creative Studio',           kicker:'CREATIVE STUDIO',        headline:'Work that speaks first.',                  sub:'A portfolio built to let the work do the talking.', services:['Portfolio','Process','Collaborations'], cta:'See Our Work', noun:'work' },
  fitness:      { label:'Fitness',                   kicker:'FITNESS',                headline:'Progress you can see.',                    sub:'A site that makes it easy to show up for the first session.', services:['Programs','Coaching','Schedule'], cta:'Join Now', noun:'coaching' },
  realestate:   { label:'Real Estate',               kicker:'REAL ESTATE',           headline:'Find the right place.',                    sub:'Listings and a story about how you work, presented properly.', services:['Listings','Buyers','Sellers'], cta:'View Listings', noun:'listings' },
  wellness:     { label:'Health & Wellness',         kicker:'HEALTH & WELLNESS',      headline:'Feel better, starting here.',              sub:'A calm, trustworthy front door for people looking after themselves.', services:['Treatments','Booking','About'], cta:'Book Now', noun:'care' },
  retail:       { label:'Retail',                    kicker:'RETAIL',                 headline:'Products worth stopping for.',             sub:'A storefront that makes browsing feel as good as buying, online or in person.', services:['New Arrivals','Best Sellers','In-Store'], cta:'Shop Now', noun:'products' },
  nonprofit:    { label:'Community & Nonprofit',     kicker:'COMMUNITY',             headline:'Doing the work that matters.',             sub:'A site built to explain the mission and make it easy to help.', services:['Mission','Get Involved','Impact'], cta:'Get Involved', noun:'work' },
  professional: { label:'Professional Services',     kicker:'PROFESSIONAL SERVICES',  headline:'Clarity you can act on.',                  sub:'Straightforward guidance from people who know the details, so you do not have to.', services:['Consulting','Advisory','Planning'], cta:'Book a Consultation', noun:'guidance' },
  education:    { label:'Education',                 kicker:'EDUCATION',             headline:'Learning that sticks.',                    sub:'A clear front door for people deciding whether to enroll.', services:['Programs','Instructors','Enroll'], cta:'Enroll Now', noun:'programs' },
  electrical:   { label:'Electrical',                kicker:'ELECTRICAL SERVICES',    headline:'Powering better spaces.',                 sub:'Residential and commercial electrical work delivered with clarity, care and zero runaround.', services:['Residential','Commercial','Service Calls'], cta:'Request a Quote', noun:'electrical work' },
  plumbing:     { label:'Plumbing',                  kicker:'PLUMBING SERVICES',      headline:'Clear work. Zero runaround.',              sub:'Straightforward plumbing service, repairs and installations for homes and businesses.', services:['Emergency','Repairs','Water Heaters'], cta:'Request a Quote', noun:'plumbing work' },
  landscaping:  { label:'Landscaping',                kicker:'LANDSCAPING SERVICES',   headline:'Outdoor spaces, considered.',              sub:'Landscaping, stonework and outdoor spaces built to look good and last.', services:['Landscaping','Hardscaping','Outdoor Living'], cta:'Request a Quote', noun:'landscaping work' },
  painting:     { label:'Painting',                  kicker:'PAINTING SERVICES',      headline:'Colour changes everything.',               sub:'Interior and exterior painting with clean prep, sharp lines and a finish built to hold up.', services:['Interiors','Exteriors','Commercial'], cta:'Request a Quote', noun:'painting work' },
  roofing:      { label:'Roofing',                   kicker:'ROOFING SERVICES',       headline:'Built for the weather.',                   sub:'Roofing and exterior work backed by clear communication and dependable installation.', services:['Roofing','Exteriors','Repairs'], cta:'Request a Quote', noun:'roofing work' },
  automotive:   { label:'Automotive',                kicker:'AUTOMOTIVE SERVICES',    headline:'Built for people who care about cars.',    sub:'Detailing, protection and automotive services presented with the same attention as the work itself.', services:['Detailing','Protection','Restoration'], cta:'Book a Service', noun:'automotive work' },
  cleaning:     { label:'Cleaning',                  kicker:'CLEANING SERVICES',      headline:'A cleaner first impression.',              sub:'Reliable residential and commercial cleaning with simple booking and clear service options.', services:['Residential','Commercial','Move-Out'], cta:'Get a Quote', noun:'cleaning service' },
  renovation:   { label:'Renovation',                kicker:'RENOVATION SERVICES',    headline:'Craft built on reputation.',               sub:'Renovation work presented through strong projects, clear process and proof people can trust.', services:['Kitchens','Basements','Full Home'], cta:'Request a Quote', noun:'renovation work' },
  other:        { label:'General Business',          kicker:'YOUR BUSINESS',          headline:'Built to make a strong first impression.', sub:'A modern website that makes the quality of your business obvious before anyone reaches out.', services:['Overview','What We Do','Get in Touch'], cta:'Get Started', noun:'business' }
};

// Keyword lists driving the generator's (real, deterministic) reading of a
// free-text business description -- no AI/LLM call is made anywhere in this
// file. This runs instantly and synchronously; the 5-step "progress" UI
// paces the *reveal* of an already-computed real result.
// V7: substantially broadened so a phrase like "AI company" or "fintech
// startup" actually scores instead of silently falling through to `other`
// (the single biggest cause of generic-looking output -- see
// SITE-PROJECT-V7.md part 1). Each list mixes exact nouns, industry jargon
// and common phrasing so real prompts hit real signal.
const categoryKeywords = {
  tech:['software','saas','tech company','platform','api','app','ai ','a.i.','artificial intelligence','machine learning',' ml ','automation tool','developer tool','dev tool','cloud platform','data platform','tech startup','digital product','ai company','ai startup','ai platform','no-code','productivity tool','analytics platform','devtools'],
  finance:['finance','wealth','financial','investment','accounting','bookkeeping','fintech','banking','payments company','lending','insurtech','crypto','trading platform','asset management'],
  fashion:['fashion','apparel','clothing brand','clothing line','label','couture','luxury fashion','streetwear','designer brand','ready-to-wear'],
  hospitality:['cafe','coffee','restaurant','bakery','catering','bar','eatery','food truck','bistro','diner','sushi','ramen','izakaya','pizzeria','gastropub','brewery'],
  creative:['design studio','photography','photographer','creative agency','videograph','branding studio','illustrator','creative studio','ad agency','marketing agency','film studio','animation studio'],
  fitness:['gym','fitness','personal training','crossfit','training studio','boutique fitness','pilates','spin studio','martial arts','boxing gym'],
  realestate:['real estate','realtor','property management','realty','brokerage','property developer'],
  wellness:['spa','wellness','therapy','massage','yoga studio','salon','esthetic','acupuncture','holistic health','meditation studio'],
  retail:['retail','shop','store','boutique','shopping','e-commerce','ecommerce','online store','dtc brand','direct-to-consumer','skincare brand','beauty brand'],
  nonprofit:['nonprofit','non-profit','charity','community organization','foundation','ngo','advocacy group','ocean cleanup','conservation','humanitarian'],
  professional:['consult','law firm','legal','advisor','accounting firm','cpa firm','advisory firm','consultancy'],
  education:['tutor','academy','course','education','coaching program','bootcamp','online school','learning platform'],
  electrical:['electric','electrician','wiring','panel upgrade'],
  plumbing:['plumb','pipe','drain','water heater'],
  landscaping:['landscap','lawn','yard','garden','backyard','hardscape','outdoor living'],
  painting:['paint'],
  roofing:['roof','shingle','gutter'],
  automotive:['auto','detailing','mechanic','car detail'],
  cleaning:['clean','maid','janitorial'],
  renovation:['renovat','remodel','contractor','construction','kitchen reno','basement'],
  other:[]
};
const styleKeywords = {
  executive:['luxury','premium','high-end','high end','upscale','exclusive','elite','established'],
  precision:['modern','clean','minimal','simple','sleek'],
  impact:['bold','loud','aggressive','stand out','eye-catching','eye catching'],
  studio:['creative','colorful','colourful','fun','artsy','playful','vibrant','unique'],
  editorial:['classic','timeless','traditional','heritage','elegant'],
  luminous:['tech','digital','app','futuristic','glow'],
  atelier:['craft','artisan','handmade','gallery'],
  foundry:['industrial','raw','structural','metal','warehouse'],
  signal:['startup','innovative','cutting edge','cutting-edge','disruptive'],
  meridian:['calm','spa feel','relaxed','peaceful','mindful'],
  nightshade:['nightlife','moody','dark','after hours','late night','cinematic'],
  paper:['minimalist','stark','monochrome','quiet','understated'],
  terra:['natural','organic','sustainable','earthy','eco'],
  aperture:['photography','visual','portfolio','photo'],
  civic:['trusted','institutional','established firm','reputable'],
  kinetic:['energetic','athletic','sport','dynamic','fast-paced'],
  ledger:['data','analytics','dashboard','metrics'],
  bloom:['boutique feel','feminine','soft','pretty','cheerful'],
  monolith:['architectural','brutalist','monumental','concrete'],
  aviator:['heritage brand','legacy','vintage','classic luxury']
};
// Small, deterministic nudge toward seeds that tend to suit a detected
// category -- still just keyword-driven ranking, not a hidden preference
// that overrides an explicit style choice or a strong text signal.
const categoryStyleAffinity = {
  tech:['signal','ledger','luminous'], finance:['civic','executive','paper'],
  fashion:['aperture','bloom','paper'], hospitality:['editorial','atelier','bloom'],
  creative:['studio','aperture','monolith'], fitness:['kinetic','impact','signal'],
  realestate:['civic','executive','aviator'], wellness:['meridian','terra','paper'],
  retail:['bloom','studio','precision'], nonprofit:['terra','editorial','civic'],
  professional:['civic','executive','paper'], education:['civic','precision','editorial'],
  electrical:['impact','precision','foundry'], plumbing:['precision','impact','foundry'],
  landscaping:['terra','editorial','precision'], painting:['studio','bloom','precision'],
  roofing:['impact','foundry','precision'], automotive:['kinetic','impact','foundry'],
  cleaning:['precision','paper','civic'], renovation:['civic','foundry','precision'],
  other:['precision','luminous','editorial']
};

// V7: left-boundary-aware matching. Plain substring matching had a real
// false positive that fed the convergence bug -- "fintech startup" matched
// tech's "tech startup" phrase (glued inside "finTECH STARTup") as well as
// finance's "fintech", turning a clear fintech prompt into a coin-flip tie.
// A keyword now only counts when it isn't glued to another letter/digit
// *before* it. The right side deliberately stays open (no suffix check),
// because a lot of these keywords are intentional stems relying on normal
// suffix growth -- "roof" matching "roofing", "paint" matching "painting",
// "plumb" matching "plumbing", "auto" matching "automotive" -- and a full
// two-sided boundary would silently break every one of those.
function scoreKeywords(text, keywordMap) {
  const lower = text.toLowerCase();
  const scores = {};
  Object.keys(keywordMap).forEach(key => {
    scores[key] = keywordMap[key].reduce((n, kwRaw) => {
      const kw = kwRaw.trim();
      if (!kw) return n;
      let idx = 0;
      while (true) {
        const found = lower.indexOf(kw, idx);
        if (found === -1) return n;
        const before = lower[found - 1];
        if (!before || !/[a-z0-9]/.test(before)) return n + 1;
        idx = found + 1;
      }
    }, 0);
  });
  return scores;
}
function rankedKeys(scores, fallback) {
  const entries = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const ranked = entries.map(e => e[0]);
  if (!entries.length || entries[0][1] === 0) {
    return [fallback, ...ranked.filter(k => k !== fallback)];
  }
  return ranked;
}
function extractLocation(text) {
  const match = text.match(/\bin\s+([A-Z][a-zA-Z'.-]+(?:\s[A-Z][a-zA-Z'.-]+){0,2})/);
  return match ? match[1].trim().replace(/[.,]+$/, '') : '';
}
// V6: real (non-AI) business-name capture -- "...called X" / "...named X".
// Deliberately conservative (only fires on an explicit naming phrase) so it
// never guesses wrong; when it finds nothing, the caller falls back to
// whatever name already exists, then to a neutral "Your Business" -- the
// site's identity is never left blank. See SITE-PROJECT-V6.md part 2.
function extractBusinessName(text) {
  if (!text) return '';
  const patterns = [
    /\bcalled\s+([A-Z][A-Za-z0-9&'.-]*(?:\s+(?:&\s+)?[A-Z][A-Za-z0-9&'.-]*){0,3})/,
    /\bnamed\s+([A-Z][A-Za-z0-9&'.-]*(?:\s+(?:&\s+)?[A-Z][A-Za-z0-9&'.-]*){0,3})/
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return match[1].trim().replace(/[.,]+$/, '');
  }
  return '';
}
// V7: only ever returns a fact the person actually typed -- never invents
// one. Feeds the proof section (SITE-PROJECT-V7.md part 6): "10+ years" or
// "4.9 rating" only ever appear if the description itself said so.
function extractBusinessFacts(text) {
  if (!text) return {};
  const facts = {};
  const years = text.match(/\b(\d{1,2})\+?\s*years?\b/i);
  if (years) facts.years = years[1];
  const rating = text.match(/\b(\d(?:\.\d)?)\s*(?:star|★|\/\s*5|out of 5|rating)/i);
  if (rating) facts.rating = rating[1];
  const count = text.match(/\b(\d[\d,]{1,6})\+?\s*(?:clients|customers|members|projects|orders)\b/i);
  if (count) facts.count = count[1].replace(/,/g, '');
  return facts;
}
// V7: pulls the actual descriptive words the person used for what the
// business IS ("AI", "luxury fashion", "Japanese", "roofing") and what it
// DOES ("focused on...", "specializing in...", "offering..."), so copy can
// be built from the prompt itself instead of a fixed per-category template
// every time. Conservative regexes only -- no invention.
function extractBusinessDescriptor(text) {
  if (!text) return {};
  const t = text.trim();
  const descMatch = t.match(/\b(?:a|an)\s+([a-z][a-z0-9&'\s-]{0,45}?)\s+(?:company|business|studio|firm|agency|brand|startup|shop|store|practice|service|team|label|restaurant|caf[eé]|bar|nonprofit|organi[sz]ation|platform|app)\b/i);
  const offerMatch = t.match(/\b(?:focused on|focusing on|specializ(?:ing|es) in|offering|that (?:helps|builds|makes|serves)|building)\s+([a-z][^.,;]{3,70})/i);
  const outcomeMatch = t.match(/\bto\s+(help|grow|increase|attract|book|sell|automate|streamline)\s+([a-z][^.,;]{3,60})/i);
  return {
    descriptor: descMatch ? descMatch[1].trim() : '',
    offering: offerMatch ? offerMatch[1].trim().replace(/[.,]+$/, '') : '',
    outcome: outcomeMatch ? `${outcomeMatch[1]} ${outcomeMatch[2]}`.trim().replace(/[.,]+$/, '') : ''
  };
}
// Real (non-AI) analysis: keyword-scores the description against the
// categories/styles dictionaries above, adds a small affinity bonus toward
// seeds that suit the detected category, and pulls a location if one reads
// like "... in <City>". Runs synchronously and instantly.
function analyzeDescription(text) {
  const categoryOrder = rankedKeys(scoreKeywords(text, categoryKeywords), 'other');
  const categoryKey = categoryOrder[0];

  const styleScores = scoreKeywords(text, styleKeywords);
  (categoryStyleAffinity[categoryKey] || []).forEach((key, i) => {
    styleScores[key] = (styleScores[key] || 0) + (3 - i) * 0.4;
  });
  const styleOrder = rankedKeys(styleScores, 'precision');

  return {
    text: text.trim(),
    categoryKey,
    styleKey: styleOrder[0],
    styleAlternates: styleOrder.slice(1, 3),
    location: extractLocation(text)
  };
}

function createGenerationSource(text) {
  const normalizedText = String(text || '').trim();
  const analysis = analyzeDescription(normalizedText);
  return Object.freeze({
    key: hashString(normalizedText.toLowerCase()),
    text: analysis.text,
    analysis,
    facts: extractBusinessFacts(analysis.text),
    descriptor: extractBusinessDescriptor(analysis.text),
    extractedName: extractBusinessName(analysis.text)
  });
}

// ==========================================================================
// COMPOSITIONAL LAYER -- the 20 named seeds above are fallbacks/anchors, not
// the ceiling of what the generator can produce. Each dimension is scored
// independently against the description; a dimension with a real signal in
// the text is composed in directly, and only a dimension with no signal
// falls back to the matching value from the nearest seed (chosen by
// analyzeDescription above). So a generated result can -- and often will --
// diverge from every one of the 20 named presets. Palette still comes from
// the seed for coherence (real independent colour generation is future
// work, not built here); every other dimension can diverge freely.
// ==========================================================================
// V7: hero and imagery vocabularies substantially expanded (see
// SITE-PROJECT-V7.md part 1/4). A dimension with a real keyword hit in the
// text still wins outright; the change is what happens when nothing
// matches -- see categoryDimensionDefaults below, which replaces "fall back
// to the nearest named seed" with "fall back to what actually suits this
// category." That swap is the fix for prompts converging on one look.
const dimensionKeywords = {
  hero: {
    'fullbleed-image': ['photo','photography','visual','gallery','atmosphere','ambience'],
    'centered-oversized': ['simple','focus','statement','declaration'],
    'stacked-image-below': ['calm','story','wellness','handmade','artisan'],
    'asymmetric-offset': ['dynamic','bold','edgy','athletic','architectural','editorial'],
    'minimal-text-only': ['stark','quiet','understated'],
    'grid-dashboard': ['dashboard','analytics','saas','platform','data platform','workflow'],
    'poster': ['collection','lookbook','runway','couture','streetwear'],
    'collage': ['portfolio','creative agency','branding studio','mixed media'],
    'product-screenshot': ['app','product screenshot','interface','mobile app','web app','demo'],
    'editorial-rail': ['magazine','editorial rail','longform']
  },
  type: {
    'serif-editorial': ['editorial','classic','literary','elegant'],
    'display-condensed': ['bold','loud','energetic','athletic','oversized'],
    'classic-serif-mix': ['luxury','heritage','established','legacy'],
    'humanist': ['friendly','warm','approachable','boutique'],
    'mono-technical': ['technical','data','software','engineering','analytics','ai ','machine learning'],
    'geo-sans': ['modern','clean','minimal','tech','startup','saas']
  },
  nav: {
    'boxed-pill': ['friendly','approachable','playful','retail'],
    'minimal-until-scroll': ['startup','app','tech','software','saas','ai ','platform'],
    'sidebar': ['technical','industrial','dashboard','engineering'],
    'centered-logo': ['heritage','elegant','boutique','premium','luxury']
  },
  card: {
    'flat': ['minimal','clean','quiet'],
    'bordered': ['institutional','trusted','professional','established'],
    'elevated-shadow': ['modern','tech','product','software','saas'],
    'image-led': ['visual','portfolio','photo','photography','lookbook'],
    'numbered-editorial': ['editorial','magazine','story'],
    'outline-ghost': ['handmade','craft','boutique','artisan']
  },
  imagery: {
    'photo-led-placeholder': ['photo','photography','visual','gallery'],
    'illustration': ['playful','fun','colorful','colourful'],
    'texture-organic': ['natural','organic','earthy','handmade'],
    'grid-mosaic': ['dashboard'],
    'technical-network': ['ai ','artificial intelligence','machine learning','neural','data platform','algorithm'],
    'editorial-bold': ['fashion','couture','lookbook','runway','streetwear'],
    'atmospheric-warm': ['restaurant','cafe','wellness','spa','yoga','food'],
    'trade-proof': ['contractor','roofing','plumb','electric','renovat','landscap'],
    'chart-financial': ['finance','investment','wealth','fintech','trading'],
    'nature-cause': ['nonprofit','conservation','ocean','environment','sustainab'],
    'creative-collage': ['creative agency','branding studio','design studio','videograph'],
    'dashboard-ui': ['saas','platform','workflow','product screenshot']
  },
  cta: {
    'sharp-block': ['bold','edgy','loud','athletic'],
    'outline-ghost': ['premium','established','trusted','luxury'],
    'underline-link': ['minimal','editorial','quiet'],
    'floating-badge': ['startup','app','tech','saas','ai ']
  },
  colorBehavior: {
    'high-contrast-mono-accent': ['bold','tech','startup','modern','ai '],
    'warm-earth-multi-tone': ['warm','earthy','handmade','boutique'],
    'dark-luxury-metallic': ['luxury','premium','high-end','upscale'],
    'neutral-single-accent': ['minimal','clean','professional','quiet']
  },
  motion: {
    'none': ['calm','institutional','stark','formal'],
    'expressive': ['energetic','dynamic','playful','bold','athletic']
  },
  spacing: {
    'compact': ['fast-paced','dense','startup','urban'],
    'airy': ['calm','premium','editorial'],
    'generous': ['luxury','architectural','minimal']
  },
  pattern: {
    'portfolio-first': ['portfolio','photography','creative'],
    'proof-first': ['trusted','established','data','enterprise'],
    'story-first': ['about','story','mission','handmade']
  },
  contentWidth: {
    contained: ['focused','intimate','local'], wide: ['broad','scale','enterprise'], 'edge-to-edge': ['immersive','full bleed','cinematic']
  },
  imageDominance: {
    supporting: ['minimal','quiet','technical'], balanced: ['balanced','modern','clean'], dominant: ['visual','photography','editorial','immersive']
  },
  imageArrangement: {
    single: ['focused','single'], stacked: ['stacked','layered'], mosaic: ['mosaic','collage','mixed media'], rail: ['rail','showcase','carousel']
  },
  sectionRhythm: {
    steady: ['clear','direct','efficient'], alternating: ['alternating','contrast','dynamic'], 'feature-band': ['feature','campaign','bold'], editorial: ['editorial','story','magazine']
  },
  sectionAlignment: {
    left: ['direct','technical','practical'], center: ['ceremonial','premium','wellness'], split: ['asymmetric','editorial','architectural']
  },
  typographyScale: {
    compact: ['dense','precise','technical'], standard: ['clear','professional','balanced'], display: ['bold','editorial','expressive']
  },
  headingWidth: {
    narrow: ['focused','intimate','quiet'], balanced: ['clear','balanced','modern'], wide: ['declaration','bold','large']
  },
  cardDensity: {
    airy: ['spacious','premium','calm'], compact: ['dense','efficient','dashboard'], mixed: ['editorial','varied','layered']
  },
  cardShape: {
    square: ['sharp','architectural','technical'], soft: ['friendly','warm','approachable'], pill: ['playful','rounded','wellness']
  },
  splitRatio: {
    even: ['balanced','equal'], 'text-heavy': ['copy-led','explanation','story'], 'media-heavy': ['visual-led','photography','showcase']
  }
};
// V7: what a category composes toward when the description gives no
// explicit signal for a dimension. This is the direct fix for the
// convergence bug: previously an under-specified prompt fell back to
// whichever of the 20 *named seeds* scored highest overall (usually
// "precision" -- the same blue/white split-hero look as the bootstrap
// placeholder, regardless of category). Now the fallback is keyed to the
// detected category itself, so "AI company in Vancouver" (which matches no
// hero/type/nav keyword at all) still lands on a SaaS-appropriate look
// instead of the generic default. Seeds still exist and still win when a
// prompt's language actually matches one (see composeStyleFromAnalysis).
const categoryDimensionDefaults = {
  tech:         { hero:'grid-dashboard',      type:'geo-sans',           nav:'minimal-until-scroll', card:'elevated-shadow',  imagery:'technical-network', cta:'floating-badge',   colorBehavior:'high-contrast-mono-accent', motion:'expressive', spacing:'compact',  pattern:'proof-first' },
  finance:      { hero:'split',               type:'classic-serif-mix', nav:'centered-logo',        card:'bordered',         imagery:'chart-financial',   cta:'outline-ghost',    colorBehavior:'dark-luxury-metallic',      motion:'none',       spacing:'airy',     pattern:'proof-first' },
  fashion:      { hero:'poster',              type:'display-condensed', nav:'minimal-until-scroll', card:'image-led',        imagery:'editorial-bold',     cta:'underline-link',   colorBehavior:'neutral-single-accent',     motion:'subtle',     spacing:'generous', pattern:'portfolio-first' },
  hospitality:  { hero:'fullbleed-image',     type:'serif-editorial',    nav:'centered-logo',        card:'image-led',        imagery:'atmospheric-warm',   cta:'solid-pill',       colorBehavior:'warm-earth-multi-tone',     motion:'subtle',     spacing:'airy',     pattern:'story-first' },
  creative:     { hero:'collage',             type:'display-condensed', nav:'sidebar',              card:'image-led',        imagery:'creative-collage',   cta:'underline-link',   colorBehavior:'high-contrast-mono-accent', motion:'expressive', spacing:'standard', pattern:'portfolio-first' },
  fitness:      { hero:'asymmetric-offset',   type:'display-condensed', nav:'inline',                card:'elevated-shadow',  imagery:'atmospheric-warm',   cta:'sharp-block',      colorBehavior:'high-contrast-mono-accent', motion:'expressive', spacing:'compact',  pattern:'proof-first' },
  realestate:   { hero:'split',               type:'classic-serif-mix', nav:'centered-logo',        card:'bordered',         imagery:'abstract-geometric', cta:'solid-pill',       colorBehavior:'neutral-single-accent',     motion:'none',       spacing:'airy',     pattern:'proof-first' },
  wellness:     { hero:'stacked-image-below', type:'humanist',           nav:'centered-logo',        card:'flat',             imagery:'atmospheric-warm',   cta:'underline-link',   colorBehavior:'neutral-single-accent',     motion:'subtle',     spacing:'generous', pattern:'story-first' },
  retail:       { hero:'product-screenshot',  type:'geo-sans',           nav:'boxed-pill',           card:'image-led',        imagery:'editorial-bold',     cta:'solid-pill',       colorBehavior:'warm-earth-multi-tone',     motion:'subtle',     spacing:'standard', pattern:'standard' },
  nonprofit:    { hero:'stacked-image-below', type:'humanist',           nav:'inline',                card:'flat',             imagery:'nature-cause',       cta:'solid-pill',       colorBehavior:'neutral-single-accent',     motion:'subtle',     spacing:'airy',     pattern:'story-first' },
  professional: { hero:'centered-oversized',  type:'classic-serif-mix', nav:'centered-logo',        card:'bordered',         imagery:'abstract-geometric', cta:'outline-ghost',    colorBehavior:'neutral-single-accent',     motion:'none',       spacing:'airy',     pattern:'proof-first' },
  education:    { hero:'split',               type:'humanist',           nav:'inline',                card:'bordered',         imagery:'abstract-geometric', cta:'solid-pill',       colorBehavior:'neutral-single-accent',     motion:'subtle',     spacing:'standard', pattern:'proof-first' },
  electrical:   { hero:'asymmetric-offset',   type:'mono-technical',    nav:'inline',                card:'bordered',         imagery:'trade-proof',        cta:'sharp-block',      colorBehavior:'high-contrast-mono-accent', motion:'none',       spacing:'compact',  pattern:'proof-first' },
  plumbing:     { hero:'split',               type:'geo-sans',           nav:'inline',                card:'bordered',         imagery:'trade-proof',        cta:'sharp-block',      colorBehavior:'neutral-single-accent',     motion:'none',       spacing:'compact',  pattern:'proof-first' },
  landscaping:  { hero:'stacked-image-below', type:'humanist',           nav:'inline',                card:'outline-ghost',    imagery:'trade-proof',        cta:'solid-pill',       colorBehavior:'warm-earth-multi-tone',     motion:'subtle',     spacing:'airy',     pattern:'story-first' },
  painting:     { hero:'asymmetric-offset',   type:'geo-sans',           nav:'inline',                card:'flat',             imagery:'trade-proof',        cta:'solid-pill',       colorBehavior:'warm-earth-multi-tone',     motion:'subtle',     spacing:'standard', pattern:'proof-first' },
  roofing:      { hero:'minimal-text-only',   type:'mono-technical',    nav:'inline',                card:'bordered',         imagery:'trade-proof',        cta:'sharp-block',      colorBehavior:'high-contrast-mono-accent', motion:'none',       spacing:'compact',  pattern:'proof-first' },
  automotive:   { hero:'asymmetric-offset',   type:'display-condensed', nav:'inline',                card:'bordered',         imagery:'trade-proof',        cta:'sharp-block',      colorBehavior:'high-contrast-mono-accent', motion:'expressive', spacing:'compact',  pattern:'proof-first' },
  cleaning:     { hero:'split',               type:'geo-sans',           nav:'inline',                card:'flat',             imagery:'trade-proof',        cta:'solid-pill',       colorBehavior:'neutral-single-accent',     motion:'none',       spacing:'standard', pattern:'proof-first' },
  renovation:   { hero:'collage',             type:'classic-serif-mix', nav:'inline',                card:'bordered',         imagery:'trade-proof',        cta:'outline-ghost',    colorBehavior:'neutral-single-accent',     motion:'none',       spacing:'airy',     pattern:'proof-first' },
  other:        { hero:'minimal-text-only',   type:'geo-sans',           nav:'inline',                card:'flat',             imagery:'abstract-geometric', cta:'underline-link',   colorBehavior:'neutral-single-accent',     motion:'none',       spacing:'standard', pattern:'standard' }
};
const extendedDimensionDefaults = {
  contentWidth: 'contained', imageDominance: 'balanced', imageArrangement: 'single',
  sectionRhythm: 'steady', sectionAlignment: 'left', typographyScale: 'standard',
  headingWidth: 'balanced', cardDensity: 'airy', cardShape: 'soft', splitRatio: 'even'
};
// ---- CREATIVE DIRECTOR V2: creative posture above archetype/category -----
// heroStrategy/pageRhythm/avoid are the 3 new creativeDirection fields (see
// server.js WEBSITE_PLAN_TOOL). On the Claude path they're Claude's own
// deliberate choices, validated below in normalizeClaudePlan exactly like
// concept/visualMood/etc already were. On the deterministic (no-Claude)
// path, inferCreativePosture synthesizes them from the SAME kind of
// keyword-signal detection archetypeKeywordOverrides/categoryKeywords
// already use elsewhere -- not a new NLP system, not per-industry tables --
// so the renderer always consumes one creativeDirection shape regardless of
// which path produced it (this is what makes a quiet omakase counter and a
// loud ramen bar diverge even with Claude unavailable/disabled).
const CREATIVE_HERO_STRATEGY_KEYS = ['image-dominant', 'text-dominant', 'product-ui-dominant', 'editorial', 'proof-first', 'offer-first', 'restrained-minimal', 'portfolio-led'];
const CREATIVE_PAGE_RHYTHM_KEYS = ['sparse-open-dense-mid', 'steady-editorial', 'dense-proof-compressed', 'expressive-alternating'];
const CREATIVE_AVOID_KEYS = ['generic-cards', 'saas-cta-blocks', 'rounded-cards', 'bright-cheerful'];
// Which EXISTING hero dimension keys a given heroStrategy maps to -- used
// only on the deterministic fallback (which has no hero decision of its own
// today) and by the critic's hero-contradicts-posture check. Never adds a
// new hero renderer; only picks among the 11 that already exist.
const HERO_STRATEGY_ALLOWED_HERO = {
  'image-dominant': ['fullbleed-image', 'collage', 'stacked-image-below'],
  'text-dominant': ['minimal-text-only', 'centered-oversized'],
  'product-ui-dominant': ['product-screenshot', 'grid-dashboard'],
  editorial: ['poster', 'editorial-rail', 'asymmetric-offset'],
  'proof-first': ['split', 'grid-dashboard'],
  'offer-first': ['centered-oversized', 'split'],
  'restrained-minimal': ['minimal-text-only', 'split'],
  'portfolio-led': ['collage', 'asymmetric-offset', 'editorial-rail']
};
// The coherence half of "hero as a creative decision": secondary EXISTING
// extended dimensions a heroStrategy should agree with, regardless of which
// exact hero key got picked -- e.g. an image-dominant hero should not also
// be paired with a 'supporting' image role elsewhere on the page.
const HERO_STRATEGY_DIMENSION_BIAS = {
  'image-dominant': { imageDominance: 'dominant', contentWidth: 'edge-to-edge' },
  'text-dominant': { imageDominance: 'supporting', contentWidth: 'contained' },
  'product-ui-dominant': { imageDominance: 'balanced', contentWidth: 'wide' },
  editorial: { imageDominance: 'dominant', headingWidth: 'wide' },
  'proof-first': { cardDensity: 'compact' },
  'offer-first': { contentWidth: 'contained' },
  'restrained-minimal': { imageDominance: 'supporting', cardDensity: 'airy' },
  'portfolio-led': { imageArrangement: 'mosaic', imageDominance: 'dominant' }
};
function applyHeroStrategyBias(dimensions, heroStrategy) {
  const bias = HERO_STRATEGY_DIMENSION_BIAS[heroStrategy];
  return bias ? { ...dimensions, ...bias } : dimensions;
}
// Real business-description signal words -- premium/accessible, urgent/
// considered, visual/informational, expressive, proof-heavy -- the exact
// axes CREATIVE DIRECTOR V2 asks for, applied by simple keyword vote (same
// mechanism as archetypeKeywordOverrides above). Deliberately not a per-
// industry table: the same 5 signal groups apply to every category.
const POSTURE_SIGNAL_WORDS = {
  premium: ['premium', 'luxury', 'high-end', 'high end', 'bespoke', 'exclusive', 'refined', 'artisan', 'elevated', 'curated', 'private', 'boutique', 'fine dining', 'quiet', 'intimate', 'tasting menu', 'omakase', 'architectural'],
  accessible: ['casual', 'affordable', 'friendly', 'fun', 'loud', 'fast', 'quick', 'easy', 'family', 'everyday', 'walk-in', 'no-frills', 'value', 'street food', 'late-night', 'late night'],
  urgent: ['emergency', 'same-day', 'same day', '24/7', '24-hour', '24 hour', 'urgent', 'immediate', 'right away', 'fast response'],
  visual: ['photography', 'portfolio', 'gallery', 'visual', 'design-led', 'showcase', 'lookbook', 'aesthetic', 'atmosphere'],
  expressive: ['playful', 'bold', 'vibrant', 'energetic', 'nightlife', 'students', 'edgy'],
  proofHeavy: ['certified', 'licensed', 'insured', 'award', 'rated', 'trusted', 'years of experience', 'reviews']
};
function countSignalWords(text, words) {
  const t = (text || '').toLowerCase();
  return words.reduce((n, w) => n + (t.includes(w) ? 1 : 0), 0);
}
function inferCreativePosture(text, archetype) {
  const premium = countSignalWords(text, POSTURE_SIGNAL_WORDS.premium);
  const accessible = countSignalWords(text, POSTURE_SIGNAL_WORDS.accessible);
  const urgent = countSignalWords(text, POSTURE_SIGNAL_WORDS.urgent);
  const visual = countSignalWords(text, POSTURE_SIGNAL_WORDS.visual);
  const expressive = countSignalWords(text, POSTURE_SIGNAL_WORDS.expressive);
  const proofHeavy = countSignalWords(text, POSTURE_SIGNAL_WORDS.proofHeavy);

  let pageRhythm;
  if (urgent > 0 && urgent >= premium) pageRhythm = 'dense-proof-compressed';
  else if (premium > accessible) pageRhythm = 'steady-editorial';
  else if (expressive > 0 || accessible > premium) pageRhythm = 'expressive-alternating';
  else pageRhythm = 'sparse-open-dense-mid';

  const portfolioArchetypes = ['portfolio', 'editorial-brand', 'ecommerce-showcase'];
  let heroStrategy;
  if (urgent > 0) heroStrategy = 'offer-first';
  else if (archetype === 'product-led-saas') heroStrategy = expressive > 0 ? 'text-dominant' : 'product-ui-dominant';
  else if (visual > 0 || portfolioArchetypes.includes(archetype)) heroStrategy = premium > accessible ? 'editorial' : 'portfolio-led';
  else if (premium > accessible + 1) heroStrategy = 'restrained-minimal';
  else if (proofHeavy > 0 && archetype === 'trust-heavy-professional') heroStrategy = 'proof-first';
  else heroStrategy = 'image-dominant';

  const avoid = [];
  if (premium > accessible) {
    avoid.push('bright-cheerful');
    if (premium > 1) avoid.push('generic-cards');
  }
  if (archetype === 'product-led-saas' && premium > 0) avoid.push('saas-cta-blocks');

  return { heroStrategy, pageRhythm, avoid: avoid.slice(0, 3) };
}
function composeCreativeDirection(categoryKey, variationSeed, claudeDirection, signalText, archetype) {
  if (claudeDirection) return { ...claudeDirection };
  const byCategory = {
    finance: [
      { concept: 'private-client-luxury', visualMood: 'quiet-luxury', narrativeStrategy: 'credibility-first', imageStrategy: 'sparse-premium', signatureMotif: 'large-type-break' },
      { concept: 'institutional-editorial', visualMood: 'restrained', narrativeStrategy: 'expertise-first', imageStrategy: 'mostly-typographic', signatureMotif: 'asymmetric-index' },
      { concept: 'founder-focused', visualMood: 'precise', narrativeStrategy: 'founder-story-led', imageStrategy: 'people-team', signatureMotif: 'split-story' }
    ],
    hospitality: [
      { concept: 'chef-led-premium', visualMood: 'cinematic', narrativeStrategy: 'editorial', imageStrategy: 'editorial-lifestyle', signatureMotif: 'media-interruption' },
      { concept: 'intimate-editorial', visualMood: 'warm', narrativeStrategy: 'conversion-first', imageStrategy: 'photography-led', signatureMotif: 'editorial-image-rail' },
      { concept: 'conversion-first', visualMood: 'energetic', narrativeStrategy: 'expertise-first', imageStrategy: 'architecture-interior', signatureMotif: 'staggered-mosaic' }
    ],
    tech: [
      { concept: 'product-led-technical', visualMood: 'precise', narrativeStrategy: 'product-demo-led', imageStrategy: 'product-ui', signatureMotif: 'product-showcase' },
      { concept: 'expressive-creative-technology', visualMood: 'expressive', narrativeStrategy: 'editorial', imageStrategy: 'abstract-branded', signatureMotif: 'oversized-manifesto' },
      { concept: 'enterprise-systems', visualMood: 'restrained', narrativeStrategy: 'technical-product', imageStrategy: 'mostly-typographic', signatureMotif: 'large-type-break' }
    ]
  };
  const fallback = [
    { concept: 'methodology-led', visualMood: 'precise', narrativeStrategy: 'expertise-first', imageStrategy: 'abstract-branded', signatureMotif: 'process-timeline' },
    { concept: 'portfolio-led', visualMood: 'cinematic', narrativeStrategy: 'portfolio-led', imageStrategy: 'project-portfolio', signatureMotif: 'staggered-mosaic' },
    { concept: 'conversion-first', visualMood: 'warm', narrativeStrategy: 'conversion-first', imageStrategy: 'photography-led', signatureMotif: 'editorial-image-rail' }
  ];
  const base = (byCategory[categoryKey] || fallback)[variationSeed % 3];
  const posture = inferCreativePosture(signalText || '', archetype || 'service-business');
  return { ...base, ...posture };
}
// ---- V7: independent palette composition ---------------------------------
// Previously `composed.palette` was always a straight copy of the matched
// named seed's fixed palette -- two results landing on the same seed (very
// common, since seed-matching used the whole-text keyword vote) got the
// literal same hex codes. Palette is now generated from the category (a
// base hue family) plus a deterministic hash of the exact input text (a
// small, stable hue/tone jitter) plus the composed colorBehavior (which
// picks the lightness/saturation "recipe" -- dark vs light, muted vs
// vivid). Same category, different real prompts -> related but distinct
// palettes. Same prompt -> same palette every time (deterministic, not
// random). Named seeds remain available as an internal reference/reset
// point, per the V7 brief.
function hashString(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) { h = (h * 31 + str.charCodeAt(i)) | 0; }
  return Math.abs(h);
}
function hslToHex(h, s, l) {
  h = ((h % 360) + 360) % 360; s = Math.max(0, Math.min(100, s)) / 100; l = Math.max(0, Math.min(100, l)) / 100;
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = l - c / 2;
  let r, g, b;
  if (h < 60) { r = c; g = x; b = 0; } else if (h < 120) { r = x; g = c; b = 0; }
  else if (h < 180) { r = 0; g = c; b = x; } else if (h < 240) { r = 0; g = x; b = c; }
  else if (h < 300) { r = c; g = 0; b = x; } else { r = x; g = 0; b = c; }
  return rgbToHex((r + m) * 255, (g + m) * 255, (b + m) * 255);
}
const categoryBaseHue = {
  tech:225, finance:212, fashion:20, hospitality:18, creative:275, fitness:8, realestate:206,
  wellness:152, retail:335, nonprofit:168, professional:214, education:200,
  electrical:38, plumbing:205, landscaping:110, painting:280, roofing:16, automotive:4, cleaning:196, renovation:30,
  other:224
};
const paletteRecipes = {
  'high-contrast-mono-accent': { bgL:7,  bgS:28, mainL:56, mainS:88, textL:96, accent2Off:34, accent2L:66 },
  'warm-earth-multi-tone':     { bgL:93, bgS:34, mainL:44, mainS:46, textL:15, accent2Off:-24, accent2L:68 },
  'dark-luxury-metallic':      { bgL:11, bgS:22, mainL:62, mainS:32, textL:92, accent2Off:16, accent2L:74 },
  'neutral-single-accent':     { bgL:97, bgS:6,  mainL:44, mainS:62, textL:11, accent2Off:12, accent2L:68 }
};
function composePalette(categoryKey, composed, text) {
  const baseHue = categoryBaseHue[categoryKey] ?? categoryBaseHue.other;
  const jitter = (hashString((text || categoryKey) + '::' + categoryKey) % 25) - 12; // -12..+12, deterministic
  const hue = baseHue + jitter;
  const recipe = paletteRecipes[composed.colorBehavior] || paletteRecipes['neutral-single-accent'];
  return {
    main: hslToHex(hue, recipe.mainS, recipe.mainL),
    accent2: hslToHex(hue + recipe.accent2Off, recipe.mainS, recipe.accent2L),
    background: hslToHex(hue, recipe.bgS, recipe.bgL),
    text: hslToHex(hue, Math.min(recipe.bgS, 12), recipe.textL)
  };
}
// OUTPUT QUALITY PASS: which of a heroStrategy's own allowed HERO_KEYS to
// use, when there's more than one -- a stable hash of the business text
// (not the variationSeed, which already does its own job elsewhere) so two
// UNRELATED businesses that land on the same heroStrategy still don't all
// get the identical hero layout, while the SAME business regenerating
// stays deterministic.
function pickHeroForStrategy(heroStrategy, text) {
  const allowed = HERO_STRATEGY_ALLOWED_HERO[heroStrategy];
  if (!allowed || !allowed.length) return null;
  return allowed[hashString(text || '') % allowed.length];
}
function composeStyleFromAnalysis(text, categoryKey, seedKey, heroStrategy) {
  const seed = styles[seedKey] || styles.precision;
  const catDefaults = { ...extendedDimensionDefaults, ...(categoryDimensionDefaults[categoryKey] || categoryDimensionDefaults.other) };
  const composed = { name: seed.name, tagline: seed.tagline, seedKey, categoryKey };
  Object.keys(dimensionKeywords).forEach(dim => {
    const scores = scoreKeywords(text || '', dimensionKeywords[dim]);
    const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]);
    // OUTPUT QUALITY PASS: a real keyword match in the business's own text
    // still always wins, unchanged. Only the FALLBACK priority changes for
    // `hero` specifically -- previously a flat category default (the exact
    // reason two same-category businesses got an identical hero layout);
    // heroStrategy is itself already a real, business-signal-derived
    // decision (see inferCreativePosture), so it's a strictly stronger
    // fallback than the category default it now takes priority over.
    if (dim === 'hero' && !(ranked.length && ranked[0][1] > 0)) {
      const strategic = pickHeroForStrategy(heroStrategy, text);
      if (strategic) { composed[dim] = strategic; return; }
    }
    composed[dim] = (ranked.length && ranked[0][1] > 0) ? ranked[0][0] : (catDefaults[dim] || seed[dim]);
  });
  composed.palette = composePalette(categoryKey, composed, text);
  return composed;
}
// A short, plain-language descriptor of a composed result for the
// generation-progress UI -- deliberately not the seed's internal name.
function describeComposition(composed) {
  const energy = composed.motion === 'expressive' ? 'energetic'
    : (composed.spacing === 'airy' || composed.spacing === 'generous') ? 'spacious' : 'clean';
  const tone = composed.colorBehavior === 'dark-luxury-metallic' ? 'premium'
    : composed.colorBehavior === 'warm-earth-multi-tone' ? 'warm'
    : composed.colorBehavior === 'high-contrast-mono-accent' ? 'bold' : 'balanced';
  return `${tone.charAt(0).toUpperCase() + tone.slice(1)}, ${energy} composition`;
}

// Tone is a deterministic copy swap, not a live rewrite -- three real,
// pre-written templates per tone, generalized so they read naturally across
// every category (not just trades). "Professional" is the curated sub-copy.
function toneSub(tone, category, location) {
  const loc = location ? ` in ${location}` : '';
  if (tone === 'bold') return `No filler. Just results that get noticed${loc} — done right, done fast.`;
  if (tone === 'friendly') return `Finding the right ${category.label.toLowerCase()} team shouldn't feel stressful${loc}. We keep it simple and honest, with zero surprises.`;
  return category.sub;
}
function prefersReducedMotion() {
  return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

// ==========================================================================
// EXAMPLE PROMPTS -- broad and varied on purpose. These are illustrative
// example businesses a visitor might type ("Try:"), not real customers or a
// claim about where SiteRemade operates. Trades are one category among many
// here, not the default -- they show up occasionally, weighted low, so the
// page reads as broadly applicable at a glance (a startup, a restaurant, a
// fashion brand, a finance firm) rather than contractor-specific.
// ==========================================================================
const EXAMPLE_PROMPTS = [
  { text: 'A modern AI software company in Los Angeles building tools for creative teams', weight: 'broad' },
  { text: 'A private finance firm in New York focused on long-term wealth planning', weight: 'broad' },
  { text: 'A premium fashion label in Los Angeles with a minimal editorial aesthetic', weight: 'broad' },
  { text: 'A modern Japanese restaurant in San Francisco with a dark cinematic feel', weight: 'broad' },
  { text: 'A boutique fitness studio in Miami offering strength and mobility coaching', weight: 'broad' },
  { text: 'A creative design studio in Chicago specializing in brand identity', weight: 'broad' },
  { text: 'A residential real estate team in Toronto selling in the downtown core', weight: 'broad' },
  { text: 'A direct-to-consumer skincare brand shipping across North America', weight: 'broad' },
  { text: 'A B2B scheduling SaaS product based in London', weight: 'broad' },
  { text: 'A wellness studio in Los Angeles offering yoga and recovery therapy', weight: 'broad' },
  { text: 'A boutique hotel in Miami with a mid-century modern design', weight: 'broad' },
  { text: 'A nonprofit in Chicago supporting youth education programs', weight: 'broad' },
  { text: 'An independent law practice in New York focused on startups', weight: 'broad' },
  { text: 'A specialty coffee shop and roastery in Toronto', weight: 'broad' },
  { text: 'An electrician in Edmonton focused on fast residential service calls', weight: 'trade' },
  { text: 'A boutique house painting company in Victoria, high-end finishes', weight: 'trade' }
];
function pickExamples(n) {
  const broad = EXAMPLE_PROMPTS.filter(p => p.weight === 'broad');
  const trade = EXAMPLE_PROMPTS.filter(p => p.weight === 'trade');
  const pool = [...broad, ...broad, ...broad, ...broad, ...trade];
  const chosen = [];
  const used = new Set();
  let guard = 0;
  while (chosen.length < n && used.size < EXAMPLE_PROMPTS.length && guard < 200) {
    guard++;
    const candidate = pool[Math.floor(Math.random() * pool.length)];
    if (!used.has(candidate.text)) { used.add(candidate.text); chosen.push(candidate); }
  }
  return chosen;
}

// ==========================================================================
// V5 -- WEBSITE PROJECT MODEL. See SITE-PROJECT-V5.md for the full write-up.
// `project` (declared further down) is the single source of truth for the
// generated result. Every control mutates a field on it and then calls
// renderProject(project); nothing else writes to the preview DOM directly.
// ==========================================================================

// ---- Nav / section label helpers (category-aware, never a seed name) ----
const sectionNavLabelOverrides = {
  services: { tech:'Product', fashion:'Collection', hospitality:'Menu', creative:'Work', fitness:'Programs', realestate:'Listings', wellness:'Treatments', retail:'Shop', nonprofit:'Get Involved', education:'Programs' },
  gallery: { creative:'Work', fashion:'Lookbook', hospitality:'Gallery', realestate:'Listings', retail:'Shop' },
  features: { tech:'Product' }, productShowcase: { tech:'Product' }, pricing: { tech:'Pricing' },
  menu: { hospitality:'Menu' }, faq: { tech:'FAQ' }, caseStudies: { creative:'Work' }
};
function navLabelFor(type, categoryKey) {
  if (type === 'about') return 'About';
  const overrides = sectionNavLabelOverrides[type] || {};
  if (overrides[categoryKey]) return overrides[categoryKey];
  const fallback = { gallery:'Gallery', features:'Features', productShowcase:'Product', pricing:'Pricing', faq:'FAQ',
    menu:'Menu', team:'Team', contact:'Contact', caseStudies:'Work', serviceAreas:'Service Areas' };
  return fallback[type] || 'Services';
}

// ---- V9: deterministic strategy + page-architecture reasoning ------------
// Everything in this block is the non-Claude equivalent of the planner's
// new `strategy` reasoning (server.js PLANNER_SYSTEM_PROMPT rule 8): a
// business archetype is inferred (never 1:1 with `categoryKey` -- several
// categories can share an archetype, and the same category can land on a
// different archetype depending on the actual words used), a small set of
// strategic defaults follow from that archetype, and those strategic
// defaults are what then drive real per-archetype page architecture,
// section-recipe selection for secondary pages, and the 9 "extended"
// visual dimensions below -- all deterministic and reproducible, never
// randomized (randomness stays confined to `variationSeed` cycling, exactly
// as it already was for style/section-variant selection).
const categoryDefaultArchetype = {
  tech:'product-led-saas', finance:'trust-heavy-professional', fashion:'editorial-brand',
  hospitality:'hospitality', creative:'portfolio', fitness:'local-conversion',
  realestate:'trust-heavy-professional', wellness:'local-conversion', retail:'ecommerce-showcase',
  nonprofit:'community-nonprofit', professional:'premium-consultancy', education:'service-business',
  electrical:'local-conversion', plumbing:'local-conversion', landscaping:'local-conversion',
  painting:'local-conversion', roofing:'local-conversion', automotive:'local-conversion',
  cleaning:'local-conversion', renovation:'local-conversion', other:'service-business'
};
// Checked in order, first keyword match wins -- lets the actual wording of
// a description pull a business toward a different archetype than its bare
// category would suggest (a "boutique consulting" services business reads
// as premium-consultancy, not the generic service-business default; a
// "launching soon" SaaS reads as launch-campaign, not product-led-saas).
const archetypeKeywordOverrides = [
  { archetype: 'launch-campaign', keywords: ['launching', 'coming soon', 'pre-order', 'preorder', 'waitlist', 'early access', 'beta program'] },
  { archetype: 'premium-consultancy', keywords: ['luxury', 'premium', 'high-end', 'high end', 'bespoke', 'private client', 'exclusive', 'boutique consult'] },
  { archetype: 'trust-heavy-professional', keywords: ['licensed', 'certified', 'accredited', 'regulated', 'law firm', 'legal', 'cpa'] },
  { archetype: 'editorial-brand', keywords: ['editorial', 'magazine', 'lookbook', 'journal-style'] },
  { archetype: 'portfolio', keywords: ['portfolio', 'showcase our work', 'case studies', 'our work speaks', 'video studio', 'documentary', 'documentaries', 'film studio', 'photography studio'] },
  { archetype: 'ecommerce-showcase', keywords: ['shop online', 'online store', 'buy online', 'e-commerce', 'ecommerce', 'dtc brand'] },
  { archetype: 'community-nonprofit', keywords: ['nonprofit', 'non-profit', 'charity', 'volunteer', 'donate', 'ngo'] },
  { archetype: 'hospitality', keywords: ['restaurant', 'cafe', 'bistro', 'hotel', 'bar', 'reservation', 'menu'] },
  { archetype: 'product-led-saas', keywords: ['saas', 'software platform', 'api', 'developer tool', 'product-led'] },
  { archetype: 'local-conversion', keywords: ['near me', 'service area', 'same-day', 'same day', 'emergency service', 'free quote', 'serving the'] }
];
function inferArchetype(categoryKey, text) {
  const lower = String(text || '').toLowerCase();
  for (const entry of archetypeKeywordOverrides) {
    if (entry.keywords.some(kw => lower.includes(kw))) return entry.archetype;
  }
  return categoryDefaultArchetype[categoryKey] || categoryDefaultArchetype.other;
}
const archetypeStrategyDefaults = {
  'product-led-saas': { visitorIntent: 'Evaluate whether this product solves my workflow problem', primaryConversion: 'Start a free trial or request a demo', secondaryConversion: 'Explore pricing or documentation', credibilityStrategy: 'Show the product working and name real integrations and workflows', sophisticationLevel: 'informed', businessScope: 'digital', proofStrategy: 'Product screenshots, integration logos, usage metrics' },
  'service-business': { visitorIntent: 'Understand what is offered and whether it fits my need', primaryConversion: 'Book a consultation or request a quote', secondaryConversion: 'Browse services or learn about process', credibilityStrategy: 'Clear process and a direct explanation of expertise', sophisticationLevel: 'general', businessScope: 'local', proofStrategy: 'Testimonials and clear service descriptions' },
  'premium-consultancy': { visitorIntent: 'Decide if this firm is credible enough to trust with a high-stakes decision', primaryConversion: 'Book a private consultation', secondaryConversion: 'Review approach or credentials', credibilityStrategy: 'Restraint and understated expertise signaling', sophisticationLevel: 'expert', businessScope: 'national', proofStrategy: 'Track record, credentials, client discretion' },
  'editorial-brand': { visitorIntent: 'Experience the brand aesthetic and decide if it resonates', primaryConversion: 'Shop the collection or join the list', secondaryConversion: 'Explore the story or lookbook', credibilityStrategy: 'Visual quality and editorial voice carry the credibility', sophisticationLevel: 'informed', businessScope: 'national', proofStrategy: 'Editorial imagery, press mentions, brand story' },
  portfolio: { visitorIntent: 'Judge the quality of the work before anything else', primaryConversion: 'Start a project inquiry', secondaryConversion: 'View more work', credibilityStrategy: 'Let the work speak for itself, minimal persuasion copy', sophisticationLevel: 'informed', businessScope: 'national', proofStrategy: 'Case studies and the project work itself' },
  'ecommerce-showcase': { visitorIntent: 'Find a product worth buying', primaryConversion: 'Shop now', secondaryConversion: 'Join the list for drops or offers', credibilityStrategy: 'Product quality, reviews, styling', sophisticationLevel: 'general', businessScope: 'national', proofStrategy: 'Reviews, product imagery, bestseller signals' },
  'local-conversion': { visitorIntent: 'Find a reliable local provider fast', primaryConversion: 'Request a quote or call now', secondaryConversion: 'View service areas or past work', credibilityStrategy: 'Proof of real completed work plus fast responsiveness', sophisticationLevel: 'general', businessScope: 'local', proofStrategy: 'Before/after project photos, service-area coverage, guarantees' },
  'trust-heavy-professional': { visitorIntent: 'Confirm this firm is legitimate and competent before sharing sensitive information', primaryConversion: 'Book a consultation', secondaryConversion: 'Read credentials or FAQ', credibilityStrategy: 'Institutional signals: credentials, regulation, longevity', sophisticationLevel: 'expert', businessScope: 'national', proofStrategy: 'Credentials, years in business, client outcomes' },
  'launch-campaign': { visitorIntent: 'Understand what is launching and why it matters now', primaryConversion: 'Join the waitlist or pre-order', secondaryConversion: 'Share or learn more', credibilityStrategy: 'Momentum and clarity of the offer', sophisticationLevel: 'general', businessScope: 'digital', proofStrategy: 'Early access signals, founder story, urgency' },
  'community-nonprofit': { visitorIntent: 'Understand the mission and how to help', primaryConversion: 'Donate or get involved', secondaryConversion: 'Learn about impact', credibilityStrategy: 'Transparency about impact and mission', sophisticationLevel: 'general', businessScope: 'local', proofStrategy: 'Impact metrics and real stories' },
  hospitality: { visitorIntent: 'Decide if this experience is worth visiting', primaryConversion: 'Reserve a table or book', secondaryConversion: 'View the menu or gallery', credibilityStrategy: 'Atmosphere and sensory presentation', sophisticationLevel: 'general', businessScope: 'local', proofStrategy: 'Imagery-led atmosphere and reviews' }
};
// The deterministic mirror of Claude's own `strategy` reasoning
// (normalizeClaudePlan above returns the identical shape for the AI path)
// -- archetype first, then everything else follows from it, same order the
// planner prompt now asks Claude to reason in.
function inferStrategy(categoryKey, text, facts, descriptor) {
  facts = facts || {}; descriptor = descriptor || {};
  const archetype = inferArchetype(categoryKey, text);
  const base = archetypeStrategyDefaults[archetype] || archetypeStrategyDefaults['service-business'];
  const category = categories[categoryKey] || categories.other;
  const hasProof = !!(facts.years || facts.rating || facts.count);
  const secondaryAudience = descriptor.offering ? `People evaluating ${descriptor.offering}` : 'Repeat visitors comparing options';
  return {
    archetype,
    audience: { primary: category.noun, secondary: secondaryAudience },
    visitorIntent: base.visitorIntent,
    conversion: { primary: base.primaryConversion, secondary: base.secondaryConversion },
    credibilityStrategy: base.credibilityStrategy,
    sophisticationLevel: base.sophisticationLevel,
    businessScope: base.businessScope,
    proofStrategy: hasProof ? base.proofStrategy : `${base.proofStrategy} (qualitative -- no numeric claims were supplied)`,
    informationHierarchy: []
  };
}
// The 9(10)-field "extended" dimension set previously had exactly one flat
// default shared by all 21 categories (see `extendedDimensionDefaults`
// above, still the base fallback) even though styles.css already fully
// supports every enum value of every one of these fields. This is the fix:
// real per-archetype variation, merged UNDER the per-category table in
// `buildGenerationPlan` (category-specific data still wins when it exists;
// archetype fills in the rest) so two categories that share an archetype
// (e.g. several trades all defaulting to local-conversion) still diverge
// wherever the category table itself has an opinion, while genuinely empty
// categories now inherit real, coherent variation instead of the same
// contained/balanced/single/steady/left/standard/balanced/airy/soft/even
// defaults every time.
const archetypeExtendedDimensionDefaults = {
  'product-led-saas': { contentWidth:'wide', imageDominance:'dominant', imageArrangement:'stacked', sectionRhythm:'feature-band', sectionAlignment:'left', typographyScale:'display', headingWidth:'balanced', cardDensity:'mixed', cardShape:'soft', splitRatio:'media-heavy' },
  'service-business': { contentWidth:'contained', imageDominance:'balanced', imageArrangement:'single', sectionRhythm:'steady', sectionAlignment:'left', typographyScale:'standard', headingWidth:'balanced', cardDensity:'airy', cardShape:'soft', splitRatio:'even' },
  'premium-consultancy': { contentWidth:'contained', imageDominance:'supporting', imageArrangement:'single', sectionRhythm:'editorial', sectionAlignment:'center', typographyScale:'display', headingWidth:'narrow', cardDensity:'airy', cardShape:'square', splitRatio:'text-heavy' },
  'editorial-brand': { contentWidth:'edge-to-edge', imageDominance:'dominant', imageArrangement:'mosaic', sectionRhythm:'editorial', sectionAlignment:'split', typographyScale:'display', headingWidth:'wide', cardDensity:'mixed', cardShape:'square', splitRatio:'media-heavy' },
  portfolio: { contentWidth:'wide', imageDominance:'dominant', imageArrangement:'mosaic', sectionRhythm:'alternating', sectionAlignment:'split', typographyScale:'display', headingWidth:'wide', cardDensity:'mixed', cardShape:'square', splitRatio:'media-heavy' },
  'ecommerce-showcase': { contentWidth:'wide', imageDominance:'dominant', imageArrangement:'rail', sectionRhythm:'feature-band', sectionAlignment:'left', typographyScale:'standard', headingWidth:'balanced', cardDensity:'mixed', cardShape:'soft', splitRatio:'media-heavy' },
  'local-conversion': { contentWidth:'contained', imageDominance:'balanced', imageArrangement:'stacked', sectionRhythm:'steady', sectionAlignment:'left', typographyScale:'compact', headingWidth:'balanced', cardDensity:'compact', cardShape:'square', splitRatio:'even' },
  'trust-heavy-professional': { contentWidth:'contained', imageDominance:'supporting', imageArrangement:'single', sectionRhythm:'steady', sectionAlignment:'center', typographyScale:'standard', headingWidth:'narrow', cardDensity:'airy', cardShape:'square', splitRatio:'text-heavy' },
  'launch-campaign': { contentWidth:'edge-to-edge', imageDominance:'dominant', imageArrangement:'single', sectionRhythm:'feature-band', sectionAlignment:'center', typographyScale:'display', headingWidth:'wide', cardDensity:'mixed', cardShape:'pill', splitRatio:'media-heavy' },
  'community-nonprofit': { contentWidth:'wide', imageDominance:'dominant', imageArrangement:'stacked', sectionRhythm:'alternating', sectionAlignment:'left', typographyScale:'standard', headingWidth:'wide', cardDensity:'airy', cardShape:'pill', splitRatio:'media-heavy' },
  hospitality: { contentWidth:'edge-to-edge', imageDominance:'dominant', imageArrangement:'mosaic', sectionRhythm:'editorial', sectionAlignment:'center', typographyScale:'display', headingWidth:'wide', cardDensity:'mixed', cardShape:'pill', splitRatio:'media-heavy' }
};

// ---- V9: deterministic page architecture ----------------------------------
// Previously the deterministic path was ALWAYS exactly one page (Home) --
// real multi-page generation only existed when Claude succeeded. This gives
// the deterministic engine the same real page-architecture reasoning,
// driven off the archetype inferred above rather than a random page count.
const archetypePageRoles = {
  'product-led-saas': ['home', 'product', 'pricing', 'about', 'contact'],
  'service-business': ['home', 'services', 'process', 'about', 'contact'],
  'premium-consultancy': ['home', 'services', 'about', 'contact'],
  'editorial-brand': ['home', 'work', 'about', 'contact'],
  portfolio: ['home', 'work', 'process', 'about', 'contact'],
  'ecommerce-showcase': ['home', 'product', 'about', 'contact'],
  'local-conversion': ['home', 'services', 'work', 'contact'],
  'trust-heavy-professional': ['home', 'services', 'about', 'faq', 'contact'],
  'launch-campaign': ['home', 'product', 'faq', 'contact'],
  'community-nonprofit': ['home', 'about', 'contact'],
  hospitality: ['home', 'menu', 'about', 'contact']
};
const pageRoleMeta = {
  home: { label: 'Home', purpose: 'Orient the visitor and make the case for why this business is worth their attention.', question: 'Is this for me, and why should I care?' },
  services: { label: 'Services', purpose: 'Explain what is offered and how it is structured.', question: 'What exactly can I get here?' },
  product: { label: 'Product', purpose: 'Show how the product works and what it solves.', question: 'Does this actually solve my problem?' },
  pricing: { label: 'Pricing', purpose: 'Make the cost and plans clear before the visitor has to ask.', question: 'What will this cost me?' },
  work: { label: 'Work', purpose: 'Prove quality through real examples of finished work.', question: 'Is the work actually good?' },
  about: { label: 'About', purpose: 'Establish who is behind the business and why they can be trusted.', question: 'Why should I trust these people?' },
  process: { label: 'Process', purpose: 'Explain how an engagement actually unfolds, step by step.', question: 'What happens after I reach out?' },
  contact: { label: 'Contact', purpose: 'Remove friction and make starting easy.', question: 'How do I actually start?' },
  faq: { label: 'FAQ', purpose: 'Answer the objections that stop a visitor from converting.', question: 'What am I still unsure about?' },
  menu: { label: 'Menu', purpose: 'Show exactly what is available to order.', question: 'What can I eat or drink here?' },
  team: { label: 'Team', purpose: 'Put real people behind the business.', question: 'Who will I actually be working with?' }
};
const pageRoleLabelOverrides = {
  services: { hospitality: 'Menu', fashion: 'Collection', realestate: 'Listings', tech: 'Platform' },
  work: { creative: 'Portfolio', fashion: 'Lookbook', realestate: 'Listings' },
  product: { retail: 'Shop' }
};
function planPageArchitecture(archetype, categoryKey) {
  const roles = archetypePageRoles[archetype] || archetypePageRoles['service-business'];
  return roles.map(role => {
    const meta = pageRoleMeta[role] || pageRoleMeta.home;
    const overrides = pageRoleLabelOverrides[role] || {};
    return { role, label: overrides[categoryKey] || meta.label, purpose: meta.purpose, visitorQuestion: meta.question };
  });
}
// Section-type recipes for every NON-home page role -- deliberately
// separate from `categorySectionRecipes` below, which stays exactly as it
// was and continues to own Home's section selection alone. `default` is the
// role's base recipe; `byArchetype` lets a specific archetype override it
// where the generic recipe would feel wrong (a SaaS "product" page needs
// integrations, not a trade's caseStudies).
const pageRoleSectionRecipes = {
  default: {
    services: ['services', 'process', 'proof', 'faq'],
    product: ['features', 'productShowcase', 'pricing'],
    pricing: ['pricing', 'faq', 'ctaBanner'],
    work: ['gallery', 'caseStudies', 'testimonial'],
    about: ['about', 'team', 'proof'],
    process: ['process', 'proof', 'testimonial'],
    contact: ['contact'],
    faq: ['faq', 'contact'],
    menu: ['menu', 'reservationCta'],
    team: ['team', 'about']
  },
  byArchetype: {
    'product-led-saas': { product: ['features', 'productShowcase', 'integrations'], pricing: ['pricing', 'faq'] },
    hospitality: { menu: ['menu', 'gallery'], about: ['about', 'testimonialsGrid'] },
    portfolio: { work: ['gallery', 'caseStudies'], about: ['about'] },
    'editorial-brand': { work: ['imageLedEditorial', 'gallery'] },
    'local-conversion': { services: ['serviceAreas', 'caseStudies', 'testimonial'] },
    'premium-consultancy': { services: ['services', 'proof', 'faq'], about: ['about', 'proof'] },
    'community-nonprofit': { about: ['about', 'metrics', 'newsletter'] }
  }
};
function sectionRecipeForPageRole(role, archetype, facts) {
  facts = facts || {};
  const overrides = pageRoleSectionRecipes.byArchetype[archetype] || {};
  const recipe = overrides[role] || pageRoleSectionRecipes.default[role] || ['about'];
  // Same never-fabricate-proof rule composeSections already applies to Home.
  return recipe.filter(type => !((type === 'proof' || type === 'metrics') && !facts.years && !facts.rating && !facts.count));
}
// ---- V9: deterministic section grammar ------------------------------------
// A section's `intent`/`headlineRole` (the same two fields Claude's plan
// now carries per section, see PLANNER_SYSTEM_PROMPT / normalizeClaudePlan)
// are derived here from the section TYPE plus its POSITION on the page --
// never randomly. The first content section on a page orients before it
// argues (unless its type is inherently a closing one); a proof/testimonial
// /FAQ type landing last on a page closes by reassuring.
const sectionTypeIntent = {
  proof: 'prove', metrics: 'prove', services: 'explain', features: 'explain', productShowcase: 'demonstrate',
  integrations: 'explain', pricing: 'compare', faq: 'reassure', process: 'educate', gallery: 'showcase',
  caseStudies: 'demonstrate', imageLedEditorial: 'narrate', about: 'introduce', team: 'introduce',
  testimonial: 'reassure', testimonialsGrid: 'reassure', menu: 'showcase', reservationCta: 'convert',
  serviceAreas: 'explain', contact: 'convert', newsletter: 'convert', ctaBanner: 'convert'
};
const intentHeadlineRole = {
  introduce: 'declarative', explain: 'explanatory', compare: 'benefit-led', prove: 'proof-led',
  demonstrate: 'benefit-led', reassure: 'proof-led', convert: 'benefit-led', educate: 'explanatory',
  showcase: 'editorial', narrate: 'editorial'
};
function planSectionGrammar(type, pageRole, archetype, index, total) {
  let intent = sectionTypeIntent[type] || 'explain';
  if (index === 0 && !['contact', 'reservationCta', 'newsletter', 'ctaBanner'].includes(type)) {
    intent = 'introduce';
  } else if (total > 1 && index === total - 1 && ['proof', 'metrics', 'testimonial', 'testimonialsGrid', 'faq'].includes(type)) {
    intent = 'reassure';
  }
  return { intent, headlineRole: intentHeadlineRole[intent] || 'declarative' };
}
// CREATIVE DIRECTOR V2: page rhythm's per-section half. Reuses the section's
// EXISTING intent (computed above by planSectionGrammar on the deterministic
// path, or validated straight from Claude's own choice) -- no new per-
// section schema field. The LAST section on a page always reads as the
// close, regardless of its own intent, since that's where CTA intensity
// should concentrate no matter what type of section it happens to be.
const RHYTHM_POSITION_BY_INTENT = {
  introduce: 'open', explain: 'build', educate: 'build', demonstrate: 'build', narrate: 'build',
  compare: 'build', showcase: 'build', prove: 'proof', reassure: 'proof', convert: 'close'
};
function rhythmPositionForSection(section, index, total) {
  if (total > 1 && index === total - 1) return 'close';
  return RHYTHM_POSITION_BY_INTENT[section && section.intent] || 'build';
}

// ---- Compositional section system ----------------------------------------
// V7: the old version scored 4 add-on section types against a fixed
// "hero + services + footer" spine, so nearly every result had the same
// 3-5 section silhouette regardless of category (see SITE-PROJECT-V7.md
// part 1/5). Section choice is now a per-category recipe -- an AI company
// gets features/product/integrations/pricing instead of a generic services
// list; a restaurant gets menu/reservations instead of a portfolio gallery.
// This is still entirely deterministic and prompt-driven (keyed off the
// detected category + composed pattern/spacing + real extracted facts),
// never randomized.
const categorySectionRecipes = {
  tech:         ['features', 'productShowcase', 'integrations', 'pricing', 'faq'],
  finance:      ['services', 'proof', 'process', 'testimonial', 'faq'],
  fashion:      ['imageLedEditorial', 'gallery', 'about', 'newsletter'],
  hospitality:  ['menu', 'gallery', 'about', 'testimonialsGrid', 'reservationCta'],
  creative:     ['gallery', 'features', 'about', 'testimonial'],
  fitness:      ['features', 'testimonialsGrid', 'pricing', 'process'],
  realestate:   ['gallery', 'services', 'proof', 'testimonial', 'contact'],
  wellness:     ['services', 'testimonialsGrid', 'about', 'faq'],
  retail:       ['productShowcase', 'gallery', 'newsletter', 'testimonial'],
  nonprofit:    ['about', 'metrics', 'gallery', 'newsletter', 'contact'],
  professional: ['services', 'process', 'proof', 'faq'],
  education:    ['services', 'process', 'testimonial', 'faq'],
  electrical:   ['serviceAreas', 'caseStudies', 'proof', 'testimonial'],
  plumbing:     ['serviceAreas', 'process', 'testimonial', 'contact'],
  landscaping:  ['caseStudies', 'serviceAreas', 'testimonial'],
  painting:     ['caseStudies', 'process', 'testimonial'],
  roofing:      ['serviceAreas', 'proof', 'caseStudies'],
  automotive:   ['services', 'caseStudies', 'testimonial'],
  cleaning:     ['services', 'serviceAreas', 'testimonial'],
  renovation:   ['caseStudies', 'process', 'testimonial'],
  other:        ['services', 'about']
};
function composeSections(category, composed, assetPlan, categoryKey, facts) {
  facts = facts || {};
  const recipe = categorySectionRecipes[categoryKey] || categorySectionRecipes.other;
  const middle = [];
  recipe.forEach(type => {
    // Never fabricate proof -- only include a facts-dependent section when
    // the description actually supplied a real number (SITE-PROJECT-V7.md
    // part 6).
    if ((type === 'proof' || type === 'metrics') && !facts.years && !facts.rating && !facts.count) return;
    middle.push(type);
  });
  if (!middle.length) middle.push('services');
  if ((composed.spacing === 'airy' || composed.spacing === 'generous') && !middle.includes('ctaBanner') && categoryKey !== 'fashion' && categoryKey !== 'tech') middle.push('ctaBanner');
  if (composed.spacing === 'compact' && middle.length > 5) middle.length = 5;
  // V8.2: 'hero' and 'footer' are no longer literal entries in this list --
  // both are now page-aware chrome rendered directly by renderSections
  // (the home page's real hero vs. a lightweight header for any other
  // page, and one shared footer on every page) rather than content a page
  // stores. This returns only the real, composed content section types.
  return middle;
}
// Variant choice is tied to an existing composed dimension (or, on
// Regenerate, a variation counter) rather than independently random, so a
// result still reads as one coherent design system.
// OUTPUT QUALITY PASS: `context` is a new, entirely OPTIONAL 4th argument
// (every pre-existing call site that omits it gets EXACTLY the prior
// behavior, since `ctx` just defaults to `{}`) -- `{avoid, pageRhythm,
// heroStrategy}` pulled straight from the already-resolved creativeDirection.
// This is what lets variant selection respond to the creative plan instead
// of only ever the flat dimension set, without changing pickVariant's
// return contract (still one of each type's existing variant strings).
function pickVariant(type, composed, variationSeed, context) {
  const v = variationSeed || 0;
  const flip = v % 2 === 1;
  const ctx = context || {};
  const avoidCards = (ctx.avoid || []).includes('generic-cards');
  switch (type) {
    case 'services': { const d = (avoidCards || ['image-led', 'elevated-shadow', 'numbered-editorial'].includes(composed.card)) ? 'described' : 'numbered'; return (flip && !avoidCards) ? (d === 'described' ? 'numbered' : 'described') : d; }
    case 'gallery': { const d = ['asymmetric-offset', 'fullbleed-image', 'collage'].includes(composed.hero) ? 'featured' : 'grid'; return flip ? (d === 'featured' ? 'grid' : 'featured') : d; }
    case 'testimonial': return (avoidCards || composed.spacing === 'airy' || composed.spacing === 'generous') ? 'centered' : 'card';
    case 'about': return (avoidCards || composed.spacing === 'airy' || composed.spacing === 'generous') ? 'split' : 'statement';
    // Brand-experience pass: 'features' previously had zero variance --
    // always a 3-card grid, for every archetype. `sectionRhythm` is already
    // a real, per-archetype (and Claude-settable) composition dimension --
    // 'editorial' rhythm (premium-consultancy/editorial-brand/hospitality)
    // reads as restrained, spacious, text-led, so those get a numbered
    // editorial list instead of a card grid; everything else keeps the
    // existing card behavior unchanged. OUTPUT QUALITY PASS: avoid:
    // generic-cards now has the same real effect, regardless of rhythm.
    case 'features': return (avoidCards || composed.sectionRhythm === 'editorial') ? 'list' : 'grid';
    // OUTPUT QUALITY PASS: CTA composition now responds to the creative
    // plan's own urgency/restraint signal first (heroStrategy/pageRhythm),
    // falling back to the original colorBehavior-only rule when neither
    // applies -- still only ever the 2 existing variants.
    case 'ctaBanner': {
      const urgent = ctx.pageRhythm === 'dense-proof-compressed' || ctx.heroStrategy === 'offer-first';
      const restrained = !urgent && (ctx.heroStrategy === 'restrained-minimal' || ctx.pageRhythm === 'steady-editorial' || avoidCards);
      if (urgent) return 'accent';
      if (restrained) return 'plain';
      return ['high-contrast-mono-accent', 'dark-luxury-metallic'].includes(composed.colorBehavior) ? 'accent' : 'plain';
    }
    // OUTPUT QUALITY PASS: 'proof' previously had zero variance at all
    // (always the boxed stat grid, and didn't even receive `section`).
    // 'statement' is the one new variant this pass adds -- a quiet inline
    // line instead of a card grid, for exactly the case the brief names
    // ("single proof statement" as usually-bad card use) -- reusing
    // renderSectionHeader's own data-headline-role treatment, no new CSS
    // dimension.
    case 'proof': return avoidCards ? 'statement' : 'facts';
    case 'footer': return ['sidebar', 'centered-logo'].includes(composed.nav) ? 'columns' : 'simple';
    default: return 'default';
  }
}

// ---- Asset model + placement --------------------------------------------
// One entry per uploaded image. `source` is always 'user' today -- the
// model has room for a future 'generated' source without changing shape.
function createAsset(type, dataUrl, name) {
  return { id: 'asset_' + Math.random().toString(36).slice(2, 9), source: 'user', type, dataUrl, name: name || '', alt: '', addedAt: new Date().toISOString() };
}
function readImageAsDataUrl(file, maxW, maxH) {
  return new Promise((resolve, reject) => {
    const allowed = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'];
    if (!allowed.includes(file.type)) { reject(new Error('Please choose a PNG, JPG, WEBP or SVG image.')); return; }
    if (file.size > 6 * 1024 * 1024) { reject(new Error('Please use an image smaller than 6 MB.')); return; }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read that file.'));
    reader.onload = () => {
      const original = reader.result;
      if (file.type === 'image/svg+xml') { resolve(original); return; }
      const img = new Image();
      img.onerror = () => reject(new Error('Could not read that image.'));
      img.onload = () => {
        const scale = Math.min(1, maxW / img.width, maxH / img.height);
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/png', 0.88));
      };
      img.src = original;
    };
    reader.readAsDataURL(file);
  });
}
// Not a hard-wired "upload #1 -> slot #1" -- role assignment. A dedicated
// hero upload wins the hero slot; otherwise the first gallery/product
// upload is borrowed for the hero and the rest stay in the gallery plan
// (matches the brief's own example: logo -> nav/footer, strongest product
// photo -> hero, remaining product photos -> gallery, founder photo -> about).
function planAssets(assets) {
  const items = (assets && assets.items) || [];
  const logo = items.find(a => a.type === 'logo');
  const heroUploads = items.filter(a => a.type === 'hero');
  const galleryUploads = items.filter(a => a.type === 'gallery');
  const teamUploads = items.filter(a => a.type === 'team');
  let heroId = null;
  let galleryIds = galleryUploads.map(a => a.id);
  if (heroUploads.length) {
    heroId = heroUploads[0].id;
  } else if (galleryUploads.length) {
    heroId = galleryUploads[0].id;
    galleryIds = galleryUploads.slice(1).map(a => a.id);
  }
  return { logo: logo ? logo.id : null, hero: heroId, gallery: galleryIds, about: teamUploads.length ? teamUploads[0].id : null };
}

// ---- V7: copy generation ---------------------------------------------------
// Headlines/sub-copy are now built from what the description actually says
// (a captured descriptor/offering/outcome phrase) rather than always
// falling back to the one fixed sentence stored on the category. The
// category sentence is still the honest fallback when the prompt truly
// gives nothing to work with (SITE-PROJECT-V7.md part 6) -- never invented,
// just genuinely generic input getting genuinely generic (not fake) copy.
function titleCase(s) { return String(s || '').replace(/\b\w/g, c => c.toUpperCase()); }
// V9: every category now carries at least two real templates (several
// previously had only one, which meant a second/third deterministic
// direction for the same business always produced the identical headline --
// see buildCopy's `variationSeed`-aware pool selection above).
const copyHeadlinePools = {
  tech: [subj => `${titleCase(subj)}, built to move fast.`, subj => `Software for ${subj}, done right.`],
  finance: [subj => `Clarity for ${subj}.`, subj => `${titleCase(subj)}, handled with care.`],
  fashion: [subj => `${titleCase(subj)}. Made to be seen.`, subj => `A ${subj} collection, presented properly.`],
  hospitality: [(subj, d, loc) => `${titleCase(subj)}${loc ? ' in ' + loc : ''}, worth the trip.`, subj => `${titleCase(subj)}, made to be tasted.`],
  creative: [subj => `${titleCase(subj)} work that speaks first.`, subj => `A ${subj} studio, in its own words.`],
  fitness: [subj => `${titleCase(subj)} progress you can see.`, subj => `Train ${subj}, see it show up.`],
  realestate: [(subj, d, loc) => `Find the right place${loc ? ' in ' + loc : ''}.`, subj => `${titleCase(subj)}, presented properly.`],
  wellness: [subj => `Feel better, through ${subj}.`, subj => `${titleCase(subj)}, on your own terms.`],
  retail: [subj => `${titleCase(subj)}, worth stopping for.`, subj => `${titleCase(subj)}, made to be noticed.`],
  nonprofit: [subj => `Real impact, through ${subj}.`, subj => `${titleCase(subj)}, because it matters.`],
  professional: [subj => `${titleCase(subj)}, explained clearly.`, subj => `${titleCase(subj)}, handled with expertise.`],
  education: [subj => `Learn ${subj}, and have it stick.`, subj => `${titleCase(subj)}, taught properly.`],
  electrical: [subj => `${titleCase(subj)}, wired right.`, subj => `${titleCase(subj)}, done to code.`],
  plumbing: [subj => `${titleCase(subj)}, fixed properly.`, subj => `${titleCase(subj)}, handled fast.`],
  landscaping: [subj => `${titleCase(subj)}, outdoors done right.`, subj => `${titleCase(subj)}, built to last a season.`],
  painting: [subj => `${titleCase(subj)}, finished clean.`, subj => `${titleCase(subj)}, colour done right.`],
  roofing: [subj => `${titleCase(subj)}, built for the weather.`, subj => `${titleCase(subj)}, done to last.`],
  automotive: [subj => `${titleCase(subj)}, cared for properly.`, subj => `${titleCase(subj)}, detailed right.`],
  cleaning: [subj => `${titleCase(subj)}, done thoroughly.`, subj => `${titleCase(subj)}, spotless every time.`],
  renovation: [subj => `${titleCase(subj)}, built on reputation.`, subj => `${titleCase(subj)}, done to last.`],
  other: [subj => `${titleCase(subj)}, done properly.`, subj => `${titleCase(subj)}, built the right way.`]
};
function buildCopy(category, categoryKey, analysis, descriptor, variationSeed) {
  descriptor = descriptor || {};
  variationSeed = variationSeed || 0;
  const loc = analysis.location || '';
  const hasSignal = descriptor.descriptor || descriptor.offering;
  const kicker = descriptor.descriptor ? descriptor.descriptor.toUpperCase() : category.kicker;
  let headline = category.headline;
  let sub = category.sub;
  if (hasSignal) {
    const subject = descriptor.descriptor || category.noun;
    const pool = copyHeadlinePools[categoryKey] || copyHeadlinePools.other;
    // V9: a second/third deterministic direction for the same business
    // previously always landed on the exact same headline template (the
    // hash only ever depended on the unchanging base text) -- folding
    // `variationSeed` into the hash lets a direction with more than one
    // real template in its pool actually pick a different one, while
    // staying fully deterministic/reproducible.
    const template = pool[hashString(analysis.text + '::v' + variationSeed) % pool.length];
    headline = template(subject, descriptor, loc);
    sub = descriptor.offering ? `Built for ${descriptor.offering}${loc ? ' in ' + loc : ''}.`
      : (descriptor.outcome ? `Here to ${descriptor.outcome}${loc ? ' in ' + loc : ''}.` : category.sub);
  } else {
    // V9: previously a description with no captured descriptor/offering
    // phrase always fell back to the exact same static `category.headline`
    // string, on every direction -- confirmed by this pass's own 8-brief
    // variety test (several genuinely different businesses, e.g. "a fitness
    // coach offering 1-on-1 coaching", never trip the regex-based
    // descriptor/offering capture at all, so this branch is common, not an
    // edge case). Routing it through the same headline pool used above
    // (keyed off the category noun instead of a captured subject) keeps the
    // output honest -- nothing invented, still a real category-appropriate
    // sentence -- while letting a second/third direction actually read
    // differently instead of being a silent clone.
    const pool = copyHeadlinePools[categoryKey] || copyHeadlinePools.other;
    const template = pool[hashString(categoryKey + '::v' + variationSeed) % pool.length];
    headline = template(category.noun, descriptor, loc);
    if (loc) sub = `${category.sub} Serving ${loc}.`;
  }
  return { kicker, headline, sub, cta: category.cta };
}

// ---- V7.1: image plan + designed visual slots + real async generation ----
// Every visual role in the project resolves through one funnel, in the
// priority order the brief specifies: a real user upload always wins; a
// real generated image is shown next, but ONLY once resolveImagePlanAssets
// (below) has actually asked the server for it and gotten a dataUrl back --
// never merely because a provider is configured; then the honest fallback
// used today -- an art-directed CSS composition keyed to the category's
// `imagery` dimension, never a fabricated photo. `window.__siteremadeImageProvider`
// is populated (async, best-effort) by a status check against the server on load.
function renderVisualSlot(project, slot, imageryKey, assetId) {
  if (project && Array.isArray(project._visibleImageSlots) && !project._visibleImageSlots.includes(slot)) project._visibleImageSlots.push(slot);
  const asset = assetId ? project.assets.items.find(a => a.id === assetId) : null;
  if (asset) return `<img class="site-visual-img" src="${asset.dataUrl}" alt="${escapeHtml(asset.alt || (project.business.name || 'Business') + ' image')}" />`;
  const planEntry = (project.imagePlan || []).find(p => p.slot === slot);
  const generated = project.assets.generated && project.assets.generated[slot];
  // A cached generated image is only shown if it matches the CURRENT plan
  // entry's cache key. If the business/category/imagery direction changed
  // since it was generated, the stale image is never displayed -- the slot
  // just falls back to the designed CSS treatment until a fresh request
  // (fired elsewhere, see resolveImagePlanAssets) resolves.
  const cacheMatches = !!(generated && planEntry && generated.cacheKey === planEntry.cacheKey);
  if (cacheMatches && generated.status === 'ready' && generated.dataUrl) {
    return `<img class="site-visual-img site-visual-generated-img" src="${generated.dataUrl}" alt="${escapeHtml((project.business.name || 'Business') + ' image')}" />`;
  }
  const generating = cacheMatches && generated.status === 'pending';
  // PLACEHOLDER/COMPOSITION FIX: distinguish WHY this slot has no real
  // image. `generating` (an attempt is actively in flight) keeps the
  // existing pulse animation -- that's an honest, temporary loading state.
  // Everything else -- this slot was never even planned for paid
  // generation (sourceType !== 'generated', the common budget/rank
  // decision this whole system is built around), or a real attempt was
  // made and failed -- means NO real photo is coming this render pass, and
  // showing the same full-size, photo-styled gradient block for that case
  // is exactly the "giant fake box" this pass's brief calls out. Those get
  // a distinct `visual-generated-unfunded` class instead: a visibly
  // smaller, deliberately pattern-styled "branded accent" treatment (see
  // styles.css), plus a `data-funded="false"` hook that lets the
  // section's own outer container (site-visual/product-frame/editorial-
  // visual/gallery-tile/team-card/about-visual) shrink itself via CSS
  // `:has()` instead of holding the full photo-sized box open for
  // something that was never going to arrive.
  const unfunded = !generating && (!planEntry || planEntry.sourceType !== 'generated' || (cacheMatches && generated.status === 'error'));
  const stateClass = generating ? ' visual-generating' : (unfunded ? ' visual-generated-unfunded' : '');
  return `<div class="visual-generated${stateClass}" data-imagery="${escapeHtml(imageryKey || 'abstract-geometric')}" data-role="${escapeHtml(slot)}" data-funded="${unfunded ? 'false' : 'true'}">${generating ? `<span class="visual-generating-label">Generating ${escapeHtml(imageSlotLabel(slot))}…</span>` : ''}</div>`;
}
function imageSlotLabel(slot) {
  if (slot === 'hero' || slot === 'collage-2') return 'hero image';
  if (slot.includes('product')) return 'product visual';
  if (slot.includes('about') || slot.includes('team-')) return 'team image';
  if (slot.includes('gallery')) return 'gallery image';
  return 'image';
}
const imageStyleDescriptions = {
  'technical-network': 'abstract technical visualization of interconnected data and systems',
  'editorial-bold': 'editorial fashion photography composition',
  'atmospheric-warm': 'warm atmospheric lifestyle photography',
  'trade-proof': 'clean documentary-style trade and craftsmanship photography',
  'chart-financial': 'abstract financial data visualization',
  'nature-cause': 'environmental and nature-focused photography',
  'creative-collage': 'creative studio collage composition',
  'dashboard-ui': 'modern product interface mockup',
  'photo-led-placeholder': 'clean documentary photography',
  'texture-organic': 'soft organic texture photography',
  'illustration': 'flat brand illustration',
  'grid-mosaic': 'technical grid/data mosaic composition',
  'abstract-geometric': 'clean abstract geometric composition'
};
// V8: when this project came from the Claude planner, it supplies its own
// specific, business-aware prompt per image role (see normalizeClaudePlan /
// project.intent.claudeImagePrompts below) -- Claude never generates images
// itself, it only writes the prompt; the actual generation still goes
// through the exact same OpenAI provider / cache / dedup / fallback funnel
// as every other image (buildImagePlan, resolveImagePlanAssets), completely
// unchanged. When no Claude prompt exists for this role (deterministic
// path, or Claude simply didn't plan an image for it), the original
// category/palette-driven deterministic prompt is used, exactly as before.
function buildImagePrompt(project, category, role) {
  const override = project.intent && project.intent.claudeImagePrompts && project.intent.claudeImagePrompts[role];
  if (override) return override;
  const composed = project.design.dimensions;
  const loc = project.source.location ? `, subtle ${project.source.location} atmosphere` : '';
  const paletteDesc = `${project.design.palette.background} background, ${project.design.palette.main} accent colour`;
  const styleWord = imageStyleDescriptions[composed.imagery] || 'clean abstract brand composition';
  return `${styleWord} for a ${category.label.toLowerCase()} brand${loc}, ${paletteDesc}, premium brand aesthetic, ${role} composition, no text`;
}
// One entry per real, currently-rendered visual slot (the same slot ids
// renderHero/renderAbout/renderProductShowcase/renderImageLedEditorial pass
// to renderVisualSlot) -- not one per section -- so the plan matches
// exactly what renderProject is about to put on screen. Each entry carries
// a stable `cacheKey` that only changes when the business itself changes
// (category, imagery direction, or the source description) -- deliberately
// NOT when palette/tone/hero-layout-preview/device are tweaked, so ordinary
// refinement never invalidates an already-generated image. See
// resolveImagePlanAssets below and SITE-PROJECT-V7.1.md.
function computeImageCacheKey(project, role, slot) {
  const composed = project.design.dimensions;
  const revision = project.intent && project.intent.imageRevisions && project.intent.imageRevisions[slot] || 0;
  return hashString(`${project.business.categoryKey}::${composed.imagery}::${role}::${slot}::${revision}::${project.source.text || ''}`).toString(36);
}
// V8.2: page-qualified slot naming -- a slug prefix for every page except
// Home (slug ''), whose slots keep their original bare names ('product',
// 'about', 'gallery-featured') exactly as before V8.2. That's deliberate,
// not cosmetic: an existing direction restored from storage has real
// generated images cached under those bare keys (proj.assets.generated),
// and Home is by far the common case (every pre-V8.2 project, and most
// V8.2 ones too) -- so an old cached image is still found under the exact
// same key it was always stored under, and migrating to the page-aware
// model never throws away a paid-for image or pays to regenerate one that
// already exists. Only genuinely NEW secondary-page slots get a prefix, to
// keep them from colliding with each other or with Home's.
function pageSlotPrefix(page) {
  return (page && page.slug) ? `${page.slug}::` : '';
}
function galleryTileCount(variant) { return variant === 'featured' ? 3 : 4; }
function galleryTileSlot(section, index) { return `${section.id}::gallery-${index + 1}`; }
function teamTileSlot(section, index) { return `${section.id}::team-${index + 1}`; }

// ---- Image Decision Engine -------------------------------------------------
// Control-plane pass, brief part 4: "image count should depend on the
// business and visual strategy, not a fixed number." Slot PLANNING below
// (which sections get an image slot at all) is unchanged -- it already only
// plans a slot a layout will actually display (see the function's own
// existing comments). This is the new layer on top: how many of those
// slots are worth PAYING to generate. A real user upload is never affected
// -- it's free and always shown. Only slots with no upload compete for the
// budget, in role-priority order (hero first -- it's the one image every
// visitor sees regardless of business type), and anything beyond the
// budget degrades to the honest 'designed' CSS tier rather than a paid
// call. Matches the brief's own worked examples: a restaurant (hospitality)
// gets ~1-2 paid images (hero, maybe a founder/chef shot), a roofer
// (local-conversion) gets just the hero and is expected to supply real
// project photos itself, and an editorial fashion brand gets several,
// because imagery is genuinely central to that business.
const ARCHETYPE_IMAGE_BUDGET = {
  'editorial-brand': 6, portfolio: 5, 'launch-campaign': 4, 'ecommerce-showcase': 4,
  'product-led-saas': 3, hospitality: 2, 'premium-consultancy': 2,
  'trust-heavy-professional': 2, 'service-business': 2, 'community-nonprofit': 2,
  'local-conversion': 1
};
const DEFAULT_IMAGE_BUDGET = 2;
function imageBudgetForArchetype(archetype) {
  return ARCHETYPE_IMAGE_BUDGET[archetype] ?? DEFAULT_IMAGE_BUDGET;
}
// CREATIVE DIRECTOR V2: imageStrategy is real image ECONOMICS, not more
// images -- never raises the archetype's own ceiling (the hard invariant
// the brief requires), only ever holds it or spends it more sparingly for
// a posture that calls for one strong image over four weak ones. Every
// value not listed here (photography-led/editorial-lifestyle/people-team/
// architecture-interior/project-portfolio) keeps the archetype's own
// budget exactly as before -- this is additive, not a rewrite of the
// existing Image Decision Engine.
const IMAGE_STRATEGY_BUDGET_DELTA = { 'sparse-premium': -1, 'mostly-typographic': -2, 'abstract-branded': -1, 'macro-detail': -1 };
function imageBudgetForProject(project) {
  const archetype = (project.strategy && project.strategy.archetype) || 'service-business';
  const base = imageBudgetForArchetype(archetype);
  const cd = project.intent && project.intent.creativeDirection;
  const delta = (cd && IMAGE_STRATEGY_BUDGET_DELTA[cd.imageStrategy]) || 0;
  return Math.max(0, base + delta);
}
// A strategy can also change which unfilled ROLE is worth spending the
// (unchanged) budget on first -- e.g. a product-ui-led business should
// prioritize its product shot over a generic gallery tile. Small, additive
// nudges only; the base priority order is untouched for every strategy not
// listed.
const IMAGE_STRATEGY_ROLE_PRIORITY_BOOST = {
  'product-ui': { product: -1 },
  'people-team': { team: -1 },
  'photography-led': { gallery: -0.5 },
  'editorial-lifestyle': { gallery: -0.5 }
};
const IMAGE_ROLE_PRIORITY = { hero: 0, product: 1, team: 2, gallery: 3 };

// ---- MULTI-MODEL IMAGE ROUTER PASS -------------------------------------
// Supersedes the earlier "tiered quality" pass. That pass added real
// dollar-denominated spend planning and per-slot quality routing, but a
// post-deployment audit found it incomplete: every funded slot still
// requested the SAME model (gpt-image-1) at a different `quality` setting
// -- and real production billing showed a single gpt-image-1 image costing
// roughly $0.50, several times this codebase's own prior 'high' estimate.
// Quality alone cannot buy real savings when the model itself is the
// expensive part. This section keeps the dollar-budget planner (preserved,
// not replaced -- imageSpendCeilingUsd below still reuses
// imageBudgetForArchetype's table as its base unit) but replaces "pick a
// quality on gpt-image-1" with "pick a real {model, quality} ROUTE" --
// hero/highest-value slots may still reach for the premium model at a
// contained quality, but supporting slots now route through a genuinely
// cheaper model (gpt-image-1-mini by default), not just a cheaper setting
// on the same one.
//
// Cost estimates are intentionally sourced from the SERVER (see
// /api/image-provider-status's costEstimateUsd/models/landscapeCostMultiplier,
// itself env-overridable) rather than a second hardcoded copy here -- one
// source of truth for "what does this actually cost," honestly labeled as
// an estimate, not a guarantee of the exact billed amount (see that
// endpoint's own honesty note in server.js -- the real $0.50 data point is
// exactly why this codebase refuses to call any of these numbers a
// guarantee).
const DEFAULT_IMAGE_MODEL_KEYS = { support: 'gpt-image-1-mini', premium: 'gpt-image-1' };
function imageModelKeys() {
  const fromServer = (typeof window !== 'undefined' && window.__siteremadeImageProvider && window.__siteremadeImageProvider.models) || null;
  return { ...DEFAULT_IMAGE_MODEL_KEYS, ...(fromServer || {}) };
}
const DEFAULT_IMAGE_MODEL_COST_ESTIMATE_USD = {
  [DEFAULT_IMAGE_MODEL_KEYS.support]: { low: 0.006, medium: 0.015, high: 0.03 },
  [DEFAULT_IMAGE_MODEL_KEYS.premium]: { low: 0.05, medium: 0.15, high: 0.45 }
};
function imageModelCostTable() {
  const fromServer = (typeof window !== 'undefined' && window.__siteremadeImageProvider && window.__siteremadeImageProvider.costEstimateUsd) || null;
  return { ...DEFAULT_IMAGE_MODEL_COST_ESTIMATE_USD, ...(fromServer || {}) };
}
const DEFAULT_IMAGE_LANDSCAPE_COST_MULTIPLIER = 1.4;
function imageLandscapeCostMultiplier() {
  const fromServer = (typeof window !== 'undefined' && window.__siteremadeImageProvider && window.__siteremadeImageProvider.landscapeCostMultiplier);
  return (typeof fromServer === 'number' && fromServer > 0) ? fromServer : DEFAULT_IMAGE_LANDSCAPE_COST_MULTIPLIER;
}
// Estimated cost for one real {model, quality, aspectRatio} route -- the
// allocator below always compares candidate ROUTES against this, never a
// single generic low/medium/high number, so a decision between "premium at
// medium" and "support at high" is a real comparison of what those two
// specific requests are each estimated to cost, not two labels assumed to
// cost the same.
function imageRouteCostEstimate(model, quality, aspectRatio) {
  const table = imageModelCostTable();
  const modelKeys = imageModelKeys();
  const base = (table[model] || table[modelKeys.support])[quality];
  const isSquare = !aspectRatio || aspectRatio === '1:1';
  return isSquare ? base : base * imageLandscapeCostMultiplier();
}
// The hard per-generation paid-image spend ceiling -- env-configurable on
// the server (SITEREMADE_IMAGE_BUDGET_USD), read here the same way
// `configured` already is, never hardcoded twice. Lowered from the prior
// pass's $0.30 default to $0.10, per this pass's brief -- the earlier
// default was sized around gpt-image-1's own (mis-estimated) cost; the new
// default targets the $0.08-$0.12 "several real images for about a dime"
// range now that supporting images route through a genuinely cheaper model.
const DEFAULT_IMAGE_BUDGET_USD = 0.10;
// CREATIVE DIRECTOR V2's imageStrategy delta used to subtract a fixed
// integer from the archetype's own slot COUNT. Expressed in the new dollar
// model as a spend multiplier instead -- capped at 1 (Math.min below) so
// it can only ever hold or LOWER the archetype's own ceiling, exactly the
// same hard invariant IMAGE_STRATEGY_BUDGET_DELTA already enforced, never
// raise it. (IMAGE_STRATEGY_BUDGET_DELTA itself is left completely
// untouched above -- this is an additive sibling for the new allocator,
// not a replacement of the old one, which other code may still reference.)
const IMAGE_STRATEGY_SPEND_MULTIPLIER = { 'sparse-premium': 0.6, 'mostly-typographic': 0.3, 'abstract-branded': 0.6, 'macro-detail': 0.6 };
// The real per-generation dollar ceiling this pass actually enforces.
// Archetype influence is PRESERVED (ARCHETYPE_IMAGE_BUDGET's existing,
// already-tuned per-archetype table is reused as-is, read as "this many
// support-model-medium-equivalent images worth of spend" instead of a raw
// slot count) rather than retuned from scratch -- but the final number is
// always clamped to the env-configured global ceiling, which is the part
// that makes SITEREMADE_IMAGE_BUDGET_USD a real, enforced cap rather than
// an unenforced suggestion. Uses the SUPPORT model's medium cost as its
// per-unit rate (not a flat generic figure) because that is the route most
// slots will actually be funded through -- see IMAGE_ROUTE_CANDIDATES_BY_
// IDEAL_TIER below.
function imageSpendCeilingUsd(project) {
  const fromServer = (typeof window !== 'undefined' && window.__siteremadeImageProvider && window.__siteremadeImageProvider.budgetUsd);
  const globalCeiling = (typeof fromServer === 'number' && fromServer > 0) ? fromServer : DEFAULT_IMAGE_BUDGET_USD;
  const archetype = (project.strategy && project.strategy.archetype) || 'service-business';
  const archetypeUnits = imageBudgetForArchetype(archetype);
  const modelKeys = imageModelKeys();
  const costTable = imageModelCostTable();
  const archetypeCeilingUsd = archetypeUnits * (costTable[modelKeys.support] || {}).medium;
  const cd = project.intent && project.intent.creativeDirection;
  const strategyMultiplier = Math.min(1, (cd && IMAGE_STRATEGY_SPEND_MULTIPLIER[cd.imageStrategy]) || 1);
  const afterStrategy = archetypeCeilingUsd * strategyMultiplier;
  return Math.max(0, Math.min(afterStrategy, globalCeiling));
}
// Every {model, quality} ROUTE a slot may be downgraded through when its
// ideal one can't be afforded, cheapest-acceptable-first -- this is the
// real multi-model router the brief asked for, not a same-model quality
// slider. 'high' (hero-class) tries the PREMIUM model at a contained
// quality first (never premium+high -- "do not automatically use the
// expensive model at high quality for the hero"), then falls back through
// the cheap support model's own quality ladder, so the hero is still the
// LAST slot to go fully unfunded, just very often ends up on a strong
// support-model image rather than a premium one once real economics are
// applied. 'medium'/'low' (supporting slots) never even attempt the
// premium model -- they only ever compete on the support model's own
// quality ladder, which is what actually makes them cheaper than the hero,
// not just labeled differently. 'none' slots (bucket 4) are never in this
// table -- see the `idealTier !== 'none'` filter in buildImagePlan --
// matching the brief's own "decorative/low-value visuals: deterministic/
// non-paid treatment only, no paid generation" tier.
function imageRouteCandidatesForIdealTier(idealTier, modelKeys) {
  if (idealTier === 'high') {
    return [
      { model: modelKeys.premium, quality: 'medium' },
      { model: modelKeys.support, quality: 'high' },
      { model: modelKeys.support, quality: 'medium' },
      { model: modelKeys.support, quality: 'low' }
    ];
  }
  if (idealTier === 'medium') {
    return [{ model: modelKeys.support, quality: 'medium' }, { model: modelKeys.support, quality: 'low' }];
  }
  if (idealTier === 'low') {
    return [{ model: modelKeys.support, quality: 'medium' }, { model: modelKeys.support, quality: 'low' }];
  }
  return [];
}
// Deterministic slot-importance ranking (rank, lower = funded first) and
// each bucket's ideal quality tier, matching the brief's own 6-level
// example: 0) hero, 1) key product/lead gallery showcase, 2) about/team
// supporting trust image, 3) secondary gallery/team tiles, 4) decorative
// extras (never paid, 'none'). Computed per-slot at push time in
// buildImagePlan below (role + position within its section), not derived
// from array order.
const IMAGE_SLOT_TIER_BUCKETS = [
  { rank: 0, idealTier: 'high' },   // hero / secondary hero visual
  { rank: 1, idealTier: 'medium' }, // product showcase / lead gallery-or-proof image
  { rank: 2, idealTier: 'medium' }, // about/team supporting trust image
  { rank: 3, idealTier: 'low' },    // secondary gallery/team tile
  { rank: 4, idealTier: 'none' }    // decorative/low-value extras -- deterministic only
];
// Hero layouts that render NO visual container at all -- shared between
// buildImagePlan (so these never plan/pay for a hero image nothing would
// display) and reconcileImageSupplyWithSections's hero-downgrade step
// below (the layout an unfunded hero falls back to). Kept as one list so
// the two can never drift apart.
const TEXT_ONLY_HERO_VARIANTS = ['centered-oversized', 'minimal-text-only', 'poster'];
function buildImagePlan(project, category) {
  if (project.meta && project.meta.isDemoShell) return [];
  const plan = project.assets.plan;
  const composed = project.design.dimensions;
  const providerConfigured = !!(window.__siteremadeImageProvider && window.__siteremadeImageProvider.configured);
  const slots = [];
  const pages = (Array.isArray(project.pages) && project.pages.length) ? project.pages : [{ slug: '', sections: project.sections || [] }];
  const homePage = pages[0];
  // centered-oversized/minimal-text-only/poster are deliberately text-only
  // hero treatments -- renderHero never calls renderVisualSlot for them, so
  // planning (and generating) a hero image for those layouts would pay for
  // an image nothing ever displays. The hero itself is Home-only chrome,
  // not a section stored on any page, so this no longer looks one up. Also
  // respects a reconciled `heroDisplayVariant` override (see
  // reconcileImageSupplyWithSections) the same way section-level
  // `imageDisplayVariant`/`imageTileCount` overrides already are below.
  const effectiveHeroVariant = composed.heroDisplayVariant || composed.hero;
  const heroHasVisual = !TEXT_ONLY_HERO_VARIANTS.includes(effectiveHeroVariant);
  // TIERED IMAGE SPEND PASS: every pushed slot now also carries `rank`
  // (lower = funded first) and `idealTier` (see IMAGE_SLOT_TIER_BUCKETS)
  // computed at push time from its actual role/position, not guessed later
  // from array order -- bucket 0 (hero) always outranks bucket 4
  // (decorative), matching the brief's own 6-level importance example.
  if (heroHasVisual) {
    slots.push({ slot: 'hero', role: 'hero', page: homePage.slug, section: 'hero', sectionType: 'hero', assetId: plan.hero, aspectRatio: '16:9', intent: `Primary hero visual for ${category.label}`, ...IMAGE_SLOT_TIER_BUCKETS[0] });
    // The collage hero layout uses a second image-bearing card -- only real
    // when that layout is actually selected, so we never plan/generate an
    // image for a slot that won't be on screen.
    if (composed.hero === 'collage') {
      slots.push({ slot: 'collage-2', role: 'hero', page: homePage.slug, section: 'hero', sectionType: 'hero', assetId: (plan.gallery || [])[0], aspectRatio: '4:3', intent: `Secondary hero visual for ${category.label}`, ...IMAGE_SLOT_TIER_BUCKETS[0] });
    }
  }
  // V8.2: every real page's own image-bearing sections are planned here --
  // not just the page currently on screen -- so that switching pages later
  // never has to plan or request anything new (see resolveImagePlanAssets /
  // switchPage). Each slot is scoped to its own page via pageSlotPrefix.
  pages.forEach(page => {
    const prefix = pageSlotPrefix(page);
    const pageSections = page.sections || [];
    const productSection = pageSections.find(s => s.type === 'productShowcase');
    if (productSection) {
      slots.push({ slot: `${prefix}product`, role: 'product', page: page.slug, section: productSection.id, sectionType: 'productShowcase', assetId: (plan.gallery || [])[0], aspectRatio: '4:3', intent: 'Product / interface visual', ...IMAGE_SLOT_TIER_BUCKETS[1] });
    }
    // renderAbout only ever shows a visual for the 'split' variant (or when
    // a real upload exists) -- matching that here avoids planning/
    // generating an image the 'statement' variant would never display. Also
    // respects a reconciled `imageDisplayVariant` override (see
    // reconcileImageSupplyWithSections) so once an unfunded about-split is
    // downgraded to 'statement', re-planning never asks to pay for an image
    // that layout wouldn't show either.
    const aboutSection = pageSections.find(s => s.type === 'about');
    const aboutEffectiveVariant = aboutSection && (aboutSection.imageDisplayVariant || aboutSection.variant);
    if (aboutSection && (aboutEffectiveVariant === 'split' || plan.about)) {
      slots.push({ slot: `${prefix}about`, role: 'team', page: page.slug, section: aboutSection.id, sectionType: 'about', assetId: plan.about, aspectRatio: '1:1', intent: 'Team / people visual', ...IMAGE_SLOT_TIER_BUCKETS[2] });
    }
    const editorialSection = pageSections.find(s => s.type === 'imageLedEditorial');
    if (editorialSection) {
      slots.push({ slot: `${prefix}gallery-featured`, role: 'gallery', page: page.slug, section: editorialSection.id, sectionType: 'imageLedEditorial', assetId: (plan.gallery || [])[0], aspectRatio: '4:3', intent: 'Supporting gallery visual', ...IMAGE_SLOT_TIER_BUCKETS[1] });
    }
    // IMAGE COHERENCE PASS: a section's own already-reconciled
    // `imageTileCount` (see reconcileImageSupplyWithSections below) always
    // wins over the raw variant-based count when present -- this is the one
    // place layout tile count and the image plan actually agree, so a
    // reconciled section renders exactly as many tiles as it planned, no
    // more. Absent (not yet reconciled, or a pre-existing saved project),
    // falls back to the original variant-only count, unchanged.
    // TIERED IMAGE SPEND PASS: tile 0 ("lead proof/gallery image") gets
    // bucket 1, tile 1 ("secondary") bucket 3, tile 2+ ("decorative
    // extras") bucket 4 -- never paid at all, regardless of remaining
    // budget, so the budget is never spent on a 4th gallery tile instead
    // of a stronger hero or a real secondary tile.
    pageSections.filter(s => s.type === 'gallery' || s.type === 'caseStudies').forEach(gallerySection => {
      const count = gallerySection.imageTileCount || galleryTileCount(gallerySection.variant);
      const galleryDisplayVariant = gallerySection.imageDisplayVariant || gallerySection.variant;
      for (let i = 0; i < count; i++) {
        const bucket = i === 0 ? IMAGE_SLOT_TIER_BUCKETS[1] : i === 1 ? IMAGE_SLOT_TIER_BUCKETS[3] : IMAGE_SLOT_TIER_BUCKETS[4];
        slots.push({ slot: galleryTileSlot(gallerySection, i), role: 'gallery', page: page.slug, section: gallerySection.id, sectionType: gallerySection.type, assetId: (plan.gallery || [])[i], aspectRatio: galleryDisplayVariant === 'featured' && i === 0 ? '4:3' : '1:1', intent: `Gallery visual ${i + 1} for ${category.label}`, ...bucket });
      }
    });
    pageSections.filter(s => s.type === 'team').forEach(teamSection => {
      const teamCount = teamSection.imageTileCount || Math.max((project.assets.items || []).filter(a => a.type === 'team').length, 3);
      for (let i = 0; i < Math.min(teamCount, 4); i++) {
        const bucket = i === 0 ? IMAGE_SLOT_TIER_BUCKETS[2] : i === 1 ? IMAGE_SLOT_TIER_BUCKETS[3] : IMAGE_SLOT_TIER_BUCKETS[4];
        slots.push({ slot: teamTileSlot(teamSection, i), role: 'team', page: page.slug, section: teamSection.id, sectionType: 'team', assetId: ((project.assets.items || []).filter(a => a.type === 'team')[i] || {}).id || null, aspectRatio: '1:1', intent: `Team visual ${i + 1} for ${category.label}`, ...bucket });
      }
    });
  });
  // MULTI-MODEL IMAGE ROUTER PASS: replaces the old same-model quality-only
  // allocator with a real {model, quality} ROUTE-aware one. Still respects
  // every existing invariant: archetype influence preserved
  // (imageSpendCeilingUsd reuses imageBudgetForArchetype's own table), the
  // role-priority boost still only ever REORDERS which unfilled slot
  // competes for the (unchanged-or-lower) budget first, and a real user
  // upload is never touched -- it's free, always shown, never enters this
  // allocation at all. The allocator compares candidate ROUTES against
  // imageRouteCostEstimate's real model+quality+aspect-specific figure, not
  // a single generic per-tier number, so a hero that can afford a strong
  // support-model image but not a premium one actually gets routed to the
  // cheaper model, not just a cheaper label on the same one.
  const spendCeilingUsd = imageSpendCeilingUsd(project);
  const modelKeys = imageModelKeys();
  const roleBoost = (IMAGE_STRATEGY_ROLE_PRIORITY_BOOST[(project.intent && project.intent.creativeDirection && project.intent.creativeDirection.imageStrategy)]) || {};
  const fundedRouteBySlotIndex = new Map();
  if (providerConfigured) {
    let remainingUsd = spendCeilingUsd;
    slots
      .map((s, i) => ({ i, role: s.role, rank: s.rank, idealTier: s.idealTier, aspectRatio: s.aspectRatio, hasUpload: !!s.assetId }))
      .filter(s => !s.hasUpload && s.idealTier !== 'none')
      .sort((a, b) => ((a.rank + (roleBoost[a.role] || 0)) - (b.rank + (roleBoost[b.role] || 0))))
      .forEach(candidate => {
        const routeCandidates = imageRouteCandidatesForIdealTier(candidate.idealTier, modelKeys);
        const affordableRoute = routeCandidates.find(route => imageRouteCostEstimate(route.model, route.quality, candidate.aspectRatio) <= remainingUsd);
        if (affordableRoute) {
          const cost = imageRouteCostEstimate(affordableRoute.model, affordableRoute.quality, candidate.aspectRatio);
          fundedRouteBySlotIndex.set(candidate.i, { model: affordableRoute.model, quality: affordableRoute.quality, estimatedCostUsd: cost });
          remainingUsd -= cost;
        }
      });
  }
  return slots.map((s, i) => {
    const fundedRoute = fundedRouteBySlotIndex.get(i) || null;
    const sourceType = s.assetId ? 'user' : (fundedRoute ? 'generated' : 'designed');
    return {
      ...s, placement: s.role, prompt: buildImagePrompt(project, category, s.role), sourceType,
      model: fundedRoute ? fundedRoute.model : null,
      quality: fundedRoute ? fundedRoute.quality : null,
      estimatedCostUsd: fundedRoute ? fundedRoute.estimatedCostUsd : null,
      cacheKey: computeImageCacheKey(project, s.role, s.slot)
    };
  });
}
// IMAGE COHERENCE PASS ("visible image demand <= fulfillable image supply"):
// buildImagePlan above decides, for a FIXED tile count, which of those
// tiles are worth a real generated image -- it never changes how many
// tiles a gallery/caseStudies/team section actually renders. That's the
// root cause of "it said it made 2 images but the layout still shows 6
// slots": a gallery section always requested galleryTileCount(variant)
// (3 or 4) tiles regardless of the archetype's own image budget, so most
// of them silently fell back to the plain 'designed' CSS treatment with no
// upstream awareness that they'd done so.
//
// This runs buildImagePlan once (its normal, unchanged budget/priority
// logic -- no new provider or Claude call, just reading its own result),
// counts how many of a section's own tiles actually resolved to a real
// visual (an upload OR a slot the existing budget pays to generate), and
// -- only when that's fewer than the section currently renders -- stamps a
// real `imageTileCount` on the section so buildImagePlan/renderGallery/
// renderTeam (see their own `section.imageTileCount ||` fallbacks above and
// below) all agree on a SMALLER, fully-intentional count next time. Never
// raises a count, never invents a new visual, never touches the budget
// itself -- purely reconciles how many slots the layout asks for down to
// what that unchanged budget can actually fulfill.
//
// The floor is MIN_IMAGE_TILES (2) when at least one real image exists for
// the section -- a thin-but-real gallery still reads as a deliberate 2-up
// layout, not a missing section. But PLACEHOLDER/COMPOSITION FIX: when a
// section's real supply is truly ZERO (no upload, nothing funded at all),
// even 2 equal-weight CSS-designed tiles side by side reads as an obviously
// fake/empty gallery grid, not a deliberate layout -- exactly what the
// brief calls out ("do not stop at the previous minimum 2 tiles fix... if
// it still produces obviously fake image grids... collapse a gallery
// entirely if it has no useful real imagery"). For that true-zero case,
// this collapses the section down to ZERO_SUPPLY_TILE_COUNT (1) -- a single
// small, deliberately styled accent element (see renderVisualSlot's
// `visual-generated-unfunded` treatment) rather than a "grid" at all.
// Removing the section entirely would mean touching section-type selection
// (composeSections), which this pass still does not do -- one accent tile
// is the smallest structural footprint achievable without that.
const MIN_IMAGE_TILES = 2;
const ZERO_SUPPLY_TILE_COUNT = 1;
const IMAGE_TILE_SECTION_TYPES = ['gallery', 'caseStudies', 'team'];
// When a gallery/caseStudies section's real supply is zero, this ALSO
// stamps a display-only `imageDisplayVariant: 'featured'` so renderGallery
// gives the one remaining tile the existing `gallery-tile-featured` visual
// treatment (a deliberate wide/banner shape) instead of a plain square --
// "prefer fewer, larger, obviously-intentional visuals over many weak
// ones." This never touches the section's own stored `variant` (so nothing
// else that reads it -- composeSections, save/restore, tests -- is
// affected), and never invents a new image or spends any budget; it only
// changes how the same already-decided tile count is visually composed.
const IMAGE_DISPLAY_VARIANT_SECTION_TYPES = ['gallery', 'caseStudies'];
function reconcileImageSupplyWithSections(proj, category) {
  const firstPass = buildImagePlan(proj, category);
  const bySection = new Map();
  firstPass.forEach(entry => {
    if (!bySection.has(entry.section)) bySection.set(entry.section, []);
    bySection.get(entry.section).push(entry);
  });
  let changed = false;
  (proj.pages && proj.pages.length ? proj.pages : [{ sections: proj.sections }]).forEach(page => {
    (page.sections || []).forEach(section => {
      if (!IMAGE_TILE_SECTION_TYPES.includes(section.type)) return;
      const entries = bySection.get(section.id);
      if (!entries || !entries.length) return;
      const currentCount = entries.length;
      const realCount = entries.filter(e => e.sourceType !== 'designed').length;
      if (realCount === 0) {
        if (IMAGE_DISPLAY_VARIANT_SECTION_TYPES.includes(section.type)) {
          const effectiveVariant = section.imageDisplayVariant || section.variant;
          if (effectiveVariant !== 'featured') {
            section.imageDisplayVariant = 'featured';
            changed = true;
          }
        }
        if (currentCount > ZERO_SUPPLY_TILE_COUNT && section.imageTileCount !== ZERO_SUPPLY_TILE_COUNT) {
          section.imageTileCount = ZERO_SUPPLY_TILE_COUNT;
          changed = true;
        }
        return;
      }
      if (realCount >= currentCount) return; // already fully supplied -- nothing to reconcile
      const resolved = Math.max(MIN_IMAGE_TILES, Math.min(currentCount, realCount));
      if (resolved < currentCount && section.imageTileCount !== resolved) {
        section.imageTileCount = resolved;
        changed = true;
      }
    });
  });
  // PLACEHOLDER/COMPOSITION FIX: hero layout downgrade. If the hero slot
  // has no upload and funded no real image, and the project's current hero
  // layout is one that shows a (now-empty) visual container, fall back to
  // the existing text-only hero treatment instead. Deterministic,
  // idempotent (checks the CURRENT effective variant before stamping), and
  // never touches `dimensions.hero` itself.
  const heroEntry = firstPass.find(e => e.slot === 'hero');
  if (heroEntry && heroEntry.sourceType === 'designed') {
    const composed = proj.design.dimensions;
    const effectiveHeroVariant = composed.heroDisplayVariant || composed.hero;
    if (!TEXT_ONLY_HERO_VARIANTS.includes(effectiveHeroVariant)) {
      composed.heroDisplayVariant = 'minimal-text-only';
      changed = true;
    }
  }
  // PLACEHOLDER/COMPOSITION FIX: about-split layout downgrade, same
  // reasoning as hero above, per real page (about can exist on more than
  // one page; hero cannot).
  (proj.pages && proj.pages.length ? proj.pages : [{ slug: '', sections: proj.sections }]).forEach(page => {
    const prefix = pageSlotPrefix(page);
    const aboutSection = (page.sections || []).find(s => s.type === 'about');
    if (!aboutSection) return;
    const aboutEntry = firstPass.find(e => e.slot === `${prefix}about`);
    if (!aboutEntry || aboutEntry.sourceType !== 'designed') return;
    const effectiveAboutVariant = aboutSection.imageDisplayVariant || aboutSection.variant;
    if (effectiveAboutVariant === 'split' && aboutSection.imageDisplayVariant !== 'statement') {
      aboutSection.imageDisplayVariant = 'statement';
      changed = true;
    }
  });
  // The edits above change what buildImagePlan itself would generate next
  // (fewer/different slots competing for the same, unchanged budget), so
  // the authoritative plan is always the one built AFTER reconciling --
  // this is the one real recomputation this pass adds, and it's pure JS,
  // not a provider call.
  proj.imagePlan = changed ? buildImagePlan(proj, category) : firstPass;
  return proj.imagePlan;
}

// ---- V7.1: real async image generation ------------------------------------
// The ONLY function that calls POST /api/generate-image. It is invoked from
// explicit "the image-relevant identity of the project just changed" points
// (finished a Generate, hit Regenerate, uploaded/removed an asset, toggled a
// section, changed industry, restored a save, or the provider status just
// came back) -- never from renderProject/renderVisualSlot, which stay pure
// and synchronous. That split is what makes a color tweak, tone toggle or
// device-preview switch free to call renderProject as often as it wants
// without ever re-requesting an image. Per-slot state lives in
// project.assets.generated -- plain JSON, so it travels through
// save/restore for free, the same as a user upload.
const imageRequestsInFlight = new Set();
const imageRequestPromises = new Map();
const IMAGE_REQUEST_TIMEOUT_MS = 30000;
function resolveImagePlanAssets(proj, onProgress, options = {}) {
  if (!proj || (proj.meta && proj.meta.isDemoShell)) return Promise.resolve();
  proj.assets.generated = proj.assets.generated || {};
  if (!window.__siteremadeImageProvider || !window.__siteremadeImageProvider.configured) {
    (proj.imagePlan || []).forEach(entry => {
      if (entry.sourceType !== 'generated') return;
      const current = proj.assets.generated[entry.slot];
      if (!current || current.cacheKey !== entry.cacheKey || !['ready', 'error'].includes(current.status)) {
        proj.assets.generated[entry.slot] = { cacheKey: entry.cacheKey, status: 'error', prompt: entry.prompt };
        if (onProgress) onProgress();
      }
    });
    return Promise.resolve();
  }
  const requests = [];
  (proj.imagePlan || []).forEach(entry => {
    if (entry.sourceType !== 'generated') return;
    const slot = entry.slot;
    const existing = proj.assets.generated[slot];
    // Already have this exact image, or already asked for it -- an ordinary
    // re-render (color/tone/layout/device) must never cause a second paid
    // request for a slot whose identity hasn't changed.
    if (existing && existing.cacheKey === entry.cacheKey && (existing.status === 'ready' || existing.status === 'error')) return;
    const reqKey = `${proj.meta.id}::${slot}::${entry.cacheKey}`;
    if (imageRequestsInFlight.has(reqKey)) {
      requests.push(imageRequestPromises.get(reqKey) || Promise.resolve());
      return;
    }
    imageRequestsInFlight.add(reqKey);
    proj.assets.generated[slot] = { cacheKey: entry.cacheKey, status: 'pending', prompt: entry.prompt };
    if (proj === project && !options.suppressRender) renderProject(project);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), IMAGE_REQUEST_TIMEOUT_MS);
    const request = fetch('/api/generate-image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // taskType/projectId are observability metadata only for the server's
      // operation ledger (see server.js recordOperation) -- absent or
      // generic, this call behaves identically.
      // MULTI-MODEL IMAGE ROUTER PASS: entry.model/entry.quality are the
      // funded ROUTE this slot's importance actually earned (see
      // buildImagePlan's route allocator) -- the server still re-validates
      // both against its own ALLOWED_IMAGE_MODELS/ALLOWED_IMAGE_QUALITIES
      // allowlists and safely downgrades anything missing/malformed to the
      // cheap support model at 'medium', so a bad or tampered client value
      // can never silently buy the premium model or the most expensive
      // quality.
      body: JSON.stringify({ prompt: entry.prompt, aspectRatio: entry.aspectRatio, role: entry.role, model: entry.model || undefined, quality: entry.quality || 'medium', taskType: options.taskType || 'IMAGE_ADD', projectId: proj.meta && proj.meta.id }),
      signal: controller.signal
    })
      .then(r => r.json().catch(() => ({})))
      .then(data => {
        imageRequestsInFlight.delete(reqKey);
        const current = proj.assets.generated[slot];
        if (!current || current.cacheKey !== entry.cacheKey) return; // superseded by a newer plan before this returned
        if (!data || data.ok !== true || !data.dataUrl) {
          // Honest failure path: fall back cleanly to the designed CSS visual.
          proj.assets.generated[slot] = { cacheKey: entry.cacheKey, status: 'error', prompt: entry.prompt };
        } else {
          proj.assets.generated[slot] = { cacheKey: entry.cacheKey, status: 'ready', dataUrl: data.dataUrl, prompt: entry.prompt };
        }
        if (proj === project && !options.suppressRender) renderProject(project);
        if (onProgress) onProgress();
      })
      .catch(() => {
        imageRequestsInFlight.delete(reqKey);
        const current = proj.assets.generated[slot];
        if (current && current.cacheKey === entry.cacheKey) proj.assets.generated[slot] = { cacheKey: entry.cacheKey, status: 'error', prompt: entry.prompt };
        if (proj === project && !options.suppressRender) renderProject(project);
        if (onProgress) onProgress();
      })
      .finally(() => { clearTimeout(timer); imageRequestsInFlight.delete(reqKey); imageRequestPromises.delete(reqKey); });
    imageRequestPromises.set(reqKey, request);
    requests.push(request);
  });
  return Promise.all(requests).then(() => undefined);
}

function imagePlanIsTerminal(proj) {
  return (proj.imagePlan || []).every(entry => entry.sourceType !== 'generated' || (
    proj.assets.generated && proj.assets.generated[entry.slot] &&
    proj.assets.generated[entry.slot].cacheKey === entry.cacheKey &&
    ['ready', 'error'].includes(proj.assets.generated[entry.slot].status)
  ));
}

function validateProjectQuality(proj) {
  const slots = (proj.imagePlan || []).map(entry => entry.slot);
  const uniqueSlots = new Set(slots);
  const sectionIds = (proj.pages || []).flatMap(page => (page.sections || []).map(section => section.id));
  return {
    ready: imagePlanIsTerminal(proj) && slots.length === uniqueSlots.size && sectionIds.length === new Set(sectionIds).size && !!(proj.business && proj.business.name) && proj.business.name !== 'Your Business',
    unresolvedImageSlots: (proj.imagePlan || []).filter(entry => entry.sourceType === 'generated' && !(proj.assets.generated && proj.assets.generated[entry.slot] && ['ready', 'error'].includes(proj.assets.generated[entry.slot].status))).map(entry => entry.slot),
    duplicateImageSlots: slots.filter((slot, index) => slots.indexOf(slot) !== index),
    duplicateSectionIds: sectionIds.filter((id, index) => sectionIds.indexOf(id) !== index)
  };
}

function imageSlotDiagnostic(proj) {
  const planned = new Set((proj && proj.imagePlan || []).map(entry => entry.slot));
  const visible = new Set(proj && proj._visibleImageSlots || []);
  return { missing: [...visible].filter(slot => !planned.has(slot)), orphaned: [...planned].filter(slot => !visible.has(slot)) };
}

// ---- Section HTML renderers ----------------------------------------------
// Every generated/placeholder image uses the honest, art-directed CSS
// treatment described above (no fabricated photos, ever) -- these functions
// only decide *whether* a role has a real user asset to show instead.
// V7: 10 structurally distinct hero layouts (was 1 DOM shape reskinned by
// CSS) -- see SITE-PROJECT-V7.md part 4.
// V8.2: structured section copy, threaded field-by-field ------------------
// Each section instance may carry a `copy` object (headline/subhead/body/
// ctaLabel/claims) written by Claude and already validated/length-capped by
// normalizeClaudePlan -- never trusted as HTML, only ever inserted through
// escapeHtml() at render time, exactly like every other piece of text here.
// `copy` is null for a purely deterministic section (no Claude plan, or
// Claude simply didn't cover this section). sectionCopyField never returns
// an empty/whitespace value -- a section with a real Claude headline but no
// body keeps that headline and silently falls back to the deterministic
// body, field by field, never all-or-nothing (see SITE-PROJECT-V8.2.md).
//
// Deliberately NOT threaded into renderProof/renderMetrics (fact-gated,
// numbers-only -- see composeSections/renderProof) or into the actual
// testimonial quote/attribution in renderTestimonial/renderTestimonialsGrid
// (Claude's schema has no per-quote fields at all; threading free-text
// `body` into what reads as a customer's own words would risk exactly the
// fabricated-testimonial risk the system prompt forbids). Everywhere else,
// this is the same "persuasive copy is fine, invented facts are not" rule
// the hero copy and heroCopy-vs-category fallback already apply -- just
// extended past the hero to every other section type.
function sectionCopyField(section, field, fallback) {
  const value = section && section.copy && section.copy[field];
  return (typeof value === 'string' && value) ? value : fallback;
}
function renderHero(project, category) {
  const composed = project.design.dimensions;
  const plan = project.assets.plan;
  const copy = project.copy || { kicker: category.kicker, headline: category.headline, sub: toneSub(project.business.tone, category, project.source.location), cta: category.cta };
  const kicker = escapeHtml(copy.kicker), headline = escapeHtml(copy.headline), sub = escapeHtml(copy.sub), cta = escapeHtml(copy.cta || category.cta);
  // V8.4: the hero's primary CTA can target a page/section/tel/mailto/
  // external URL (see normalizeCtaTarget) instead of being permanently
  // decorative -- unset (the common case for a fresh direction) renders the
  // exact same plain button it always has.
  const ctaBtn = renderCtaButton(copy.ctaTarget, cta, 'hero-cta-btn');
  const ctaMinimal = renderCtaButton(copy.ctaTarget, cta + ' ↗', 'minimal-link');
  const visual = renderVisualSlot(project, 'hero', composed.imagery, plan.hero);
  // PLACEHOLDER/COMPOSITION FIX: a reconciled `heroDisplayVariant` (see
  // reconcileImageSupplyWithSections) overrides the stored hero layout for
  // RENDERING only -- when the hero has no upload and funds no real image,
  // this switches to one of the existing deliberately text-only layouts
  // (see TEXT_ONLY_HERO_VARIANTS) instead of showing a giant empty photo
  // box as the first thing on the page. `composed.hero` itself is never
  // mutated (so the editor's own hero picker, save/restore, and every
  // archetype/heroStrategy invariant that reads the real value are
  // unaffected).
  const layout = (project.meta && project.meta.isDemoShell) ? 'demo' : (composed.heroDisplayVariant || composed.hero);
  // Item 17: the default split hero always appended a second, purely
  // decorative "See our work ↗" link next to the real CTA -- generic
  // filler text promising a showcase that may not exist on this business's
  // own site. Now shown only when a real showcase section is actually on
  // Home, so it stops being a promise the site itself doesn't keep.
  const hasShowcase = (project.sections || []).some(s => ['gallery', 'caseStudies', 'imageLedEditorial', 'productShowcase'].includes(s.type));
  switch (layout) {
    case 'demo': return `<div class="site-hero hero-demo-shell">
        <div class="site-copy"><p>PREVIEW</p><h3>Describe your business above</h3><p>Your generated site will appear here — real layout, real copy, real palette, built from what you type.</p></div>
        <div class="site-visual"><div class="visual-generated" data-imagery="demo-shell"></div></div>
      </div>`;
    case 'centered-oversized': return `<div class="site-hero hero-centered-oversized">
        <p class="hero-kicker-center">${kicker}</p><h3 class="hero-headline-oversized">${headline}</h3><p class="hero-sub-center">${sub}</p>
        <div class="site-actions center">${ctaBtn}</div>
      </div>`;
    case 'fullbleed-image': return `<div class="site-hero hero-fullbleed">
        <div class="hero-fullbleed-media">${visual}<div class="hero-fullbleed-scrim"></div></div>
        <div class="hero-fullbleed-copy"><p>${kicker}</p><h3>${headline}</h3><p>${sub}</p><div class="site-actions">${ctaBtn}</div></div>
      </div>`;
    case 'stacked-image-below': return `<div class="site-hero hero-stacked">
        <div class="hero-stacked-copy"><p>${kicker}</p><h3>${headline}</h3><p>${sub}</p><div class="site-actions center">${ctaBtn}</div></div>
        <div class="hero-stacked-visual">${visual}</div>
      </div>`;
    case 'asymmetric-offset': return `<div class="site-hero hero-asymmetric">
        <div class="hero-asym-headline"><p>${kicker}</p><h3>${headline}</h3></div>
        <div class="hero-asym-visual">${visual}</div>
        <div class="hero-asym-meta"><p>${sub}</p><div class="site-actions">${ctaBtn}</div></div>
      </div>`;
    case 'minimal-text-only': return `<div class="site-hero hero-minimal">
        <p>${kicker}</p><h3>${headline}</h3><p>${sub}</p><div class="site-actions">${ctaMinimal}</div>
      </div>`;
    case 'grid-dashboard': return `<div class="site-hero hero-grid-dashboard">
        <div class="site-copy"><p>${kicker}</p><h3>${headline}</h3><p>${sub}</p><div class="site-actions">${ctaBtn}</div></div>
        <div class="hero-dash-grid"><div class="dash-panel dash-panel-visual">${visual}</div><div class="dash-panel"></div><div class="dash-panel"></div><div class="dash-panel"></div></div>
      </div>`;
    case 'poster': return `<div class="site-hero hero-poster">
        <p class="hero-kicker-center">${kicker}</p><h3 class="hero-poster-headline">${headline}</h3>
        <div class="hero-poster-row"><p>${sub}</p>${ctaBtn}</div>
      </div>`;
    case 'collage': { const b = renderVisualSlot(project, 'collage-2', composed.imagery, (plan.gallery || [])[0]);
      return `<div class="site-hero hero-collage">
        <div class="hero-collage-copy"><p>${kicker}</p><h3>${headline}</h3><p>${sub}</p><div class="site-actions">${ctaBtn}</div></div>
        <div class="hero-collage-stack"><div class="collage-card collage-card-1">${visual}</div><div class="collage-card collage-card-2">${b}</div></div>
      </div>`; }
    case 'product-screenshot': return `<div class="site-hero hero-product-screenshot">
        <div class="site-copy center"><p>${kicker}</p><h3>${headline}</h3><p>${sub}</p><div class="site-actions center">${ctaBtn}</div></div>
        <div class="hero-product-frame"><div class="hero-product-chrome"><span></span><span></span><span></span></div><div class="hero-product-body">${visual}</div></div>
      </div>`;
    case 'editorial-rail': return `<div class="site-hero hero-editorial-rail">
        <div class="hero-editorial-copy"><p>${kicker}</p><h3>${headline}</h3><p>${sub}</p><div class="site-actions">${ctaBtn}</div></div>
        <div class="hero-editorial-visual">${visual}</div>
      </div>`;
    default: return `<div class="site-hero hero-split">
        <div class="site-copy"><p>${kicker}</p><h3>${headline}</h3><p>${sub}</p><div class="site-actions">${ctaBtn}${hasShowcase ? '<span>See our work ↗</span>' : ''}</div></div>
        <div class="site-visual">${visual}</div>
      </div>`;
  }
}
// ---- Control-plane pass: light primitive extraction (task #218) -----------
// Two compositional patterns are duplicated, near-verbatim, across many of
// the renderX functions below: (1) a section label + optional intro
// paragraph, and (2) a grid of uniform "cards" built from a list of items.
// These two are pulled into shared helpers because the duplication is
// obvious and repeated across many distinct renderers (see call sites
// below). This is a deliberately light, incremental extraction -- the
// existing 19-dimension/11-archetype composition system and the renderX
// functions themselves are NOT being redesigned or migrated; every renderX
// function below still owns its own markup and still decides for itself
// whether/how to use these helpers. A "ProofBlock" primitive (matching
// renderProof, per the brief's own suggested example) was considered but
// NOT extracted: renderMetrics is already a pure alias of renderProof
// (`function renderMetrics(...) { return renderProof(...); }`), so there is
// only one real call site and no actual duplication left to remove there --
// extracting it now would be abstraction for its own sake, not
// deduplication. Likewise CTAGroup was considered but not extracted: the
// pre-existing renderCtaButton() helper already covers that pattern and is
// already reused across renderHero, renderCtaBanner, renderReservationCta
// and renderContact. Both remain good candidates for a future pass; see
// PRIMITIVES-NOTES below this block for the full inventory.
// V-brand-experience fix: `headlineRole` (computed per-section by
// planSectionGrammar from intent+position, see sectionTypeIntent/
// intentHeadlineRole above) used to be stored on every section and never
// read anywhere -- real, already-computed metadata silently discarded.
// Threaded through here as a `data-headline-role` attribute on the SAME
// two elements this already returned (never a new wrapper div -- several
// existing CSS rules key off `.site-section` being a direct CSS grid
// parent of its own children, e.g. [data-section-alignment="split"]
// .site-section{display:grid;...} and .site-section-about[data-variant=
// "split"]{display:grid;...} -- adding a wrapper would have changed which
// element receives grid-column placement and silently broken those
// layouts). Defaults to 'declarative' -- the same fallback
// intentHeadlineRole itself uses -- so a call site that doesn't pass a
// role (there are none left, but this keeps the function safe on its own)
// renders identically to before this fix.
function renderSectionHeader(label, intro, headlineRole) {
  const role = headlineRole || 'declarative';
  const labelHtml = label ? `<p class="site-section-label" data-headline-role="${escapeHtml(role)}">${escapeHtml(label)}</p>` : '';
  const introHtml = intro ? `<p class="site-section-intro" data-headline-role="${escapeHtml(role)}">${escapeHtml(intro)}</p>` : '';
  return labelHtml + introHtml;
}
function renderCardGroup(items, cardClassName, itemRenderer) {
  return (items || []).map((item, i) => `<div class="${cardClassName}">${itemRenderer(item, i)}</div>`).join('');
}
// ---- Business-semantic section vocabulary (brand-experience pass) --------
// buildCopy() only ever produced the HERO's copy -- every other section on
// the deterministic path (no Claude, or Claude unavailable/failed) fell
// back to whichever single hardcoded English string its own renderer
// happened to contain, regardless of the business. That's the literal
// source of e.g. a restaurant rendering "HOW WE WORK / Clear communication
// from start to finish / A considered process, from first conversation to
// final delivery / Useful expertise without unnecessary complexity" --
// those three sentences were renderTestimonialsGrid's only hardcoded pool,
// shown to every business on earth.
//
// This table is keyed by ARCHETYPE, never by a single named business, so it
// generalizes across every category that shares an archetype (a cafe, a
// bar and a bistro are all `hospitality`; a roofer, a plumber and a
// landscaper are all `local-conversion`). Every string is illustrative
// marketing copy, exactly like the pre-existing hardcoded strings it
// replaces -- never a specific fabricated claim (no invented years, award
// names, headcounts, or named people). `service-business` keeps the
// original strings verbatim, since they're a genuine fit for that
// archetype; every other archetype gets its own real framing.
const ARCHETYPE_SECTION_VOCAB = {
  'service-business': {
    aboutLabel: 'About', processLabel: 'How We Work',
    processSteps: ['Reach out', 'We scope the work', 'We deliver', 'You review & sign off'],
    testimonialsLabel: 'What Clients Say',
    testimonialQuotes: ['Clear communication from start to finish.', 'A considered process, from first conversation to final delivery.', 'Useful expertise without unnecessary complexity.'],
    testimonialAttribution: 'Client',
    aboutFrame: (category) => `We're a ${category.label.toLowerCase()} team focused on getting the details right, from the first conversation to the finished result.`,
    serviceCardBody: (item, category) => `Real ${category.noun}, presented clearly.`,
    faqSecondQuestion: 'How do I get started?'
  },
  hospitality: {
    aboutLabel: 'Our Philosophy', processLabel: 'The Experience',
    processSteps: ['Reserve', 'Arrive & settle in', 'Let the menu lead', 'Come back for more'],
    testimonialsLabel: 'What Guests Say',
    testimonialQuotes: ['A room worth returning to.', 'Every detail felt considered, right down to the pacing.', 'The kind of evening you end up telling people about.'],
    testimonialAttribution: 'Regular guest',
    aboutFrame: (category) => `${category.label} built around atmosphere as much as what's on the plate -- considered, not staged.`,
    serviceCardBody: (item, category) => `A regular part of the ${category.noun} on offer.`,
    faqSecondQuestion: 'How do I make a reservation?'
  },
  'premium-consultancy': {
    aboutLabel: 'Our Approach', processLabel: 'How We Work Together',
    processSteps: ['A private consultation', 'A plan built around you', 'Careful, considered execution', 'A result worth the trust'],
    testimonialsLabel: 'What Clients Say',
    testimonialQuotes: ['Exactly the kind of judgment you want on something this important.', 'Discreet, thorough, and worth every conversation.', 'A rare level of care for the details that matter.'],
    testimonialAttribution: 'Private client',
    aboutFrame: (category) => `A considered, understated approach to ${category.noun} -- expertise that doesn't need to shout.`,
    serviceCardBody: () => 'Handled with the same restraint and care as everything else.',
    faqSecondQuestion: 'How do I book a consultation?'
  },
  portfolio: {
    aboutLabel: 'About', processLabel: 'How We Work',
    processSteps: ['A first conversation', 'Concept & direction', 'The work itself', 'Delivery'],
    testimonialsLabel: 'Client Feedback',
    testimonialQuotes: ['Work that speaks for itself.', 'Exactly the direction we didn’t know we needed.', 'Meticulous, from the first sketch to the final file.'],
    testimonialAttribution: 'Client',
    aboutFrame: (category) => `${titleCase(category.noun)} that lets the work do the talking.`,
    serviceCardBody: () => 'One part of how the work comes together.',
    faqSecondQuestion: 'How do I start a project?'
  },
  'product-led-saas': {
    aboutLabel: 'About', processLabel: 'How It Works',
    processSteps: ['Sign up', 'Connect your workflow', 'See it in action', 'Scale with confidence'],
    testimonialsLabel: 'What Teams Say',
    testimonialQuotes: ['It just works, and support actually answers.', 'Cut our setup time down to almost nothing.', 'The one tool the whole team actually uses.'],
    testimonialAttribution: 'Product lead',
    aboutFrame: (category) => `${titleCase(category.noun)} built for teams who'd rather it just work.`,
    serviceCardBody: () => 'Built around real workflows, not a feature checklist.',
    faqSecondQuestion: 'How do I get started?'
  },
  'editorial-brand': {
    aboutLabel: 'Our Story', processLabel: 'From Concept to Collection',
    processSteps: ['Concept', 'Craft', 'Collection', 'In your hands'],
    testimonialsLabel: 'In Their Words',
    testimonialQuotes: ['Every piece feels considered.', 'A point of view you can actually see.', 'Quality that holds up past the first wear.'],
    testimonialAttribution: 'Customer',
    aboutFrame: (category) => `${titleCase(category.noun)} with a point of view -- made deliberately, not mass-produced.`,
    serviceCardBody: () => 'Part of the current collection.',
    faqSecondQuestion: 'How do I shop the collection?'
  },
  'ecommerce-showcase': {
    aboutLabel: 'About', processLabel: 'How It Works',
    processSteps: ['Browse', 'Order', 'Fast, tracked shipping', 'Enjoy'],
    testimonialsLabel: 'What Customers Say',
    testimonialQuotes: ['Exactly as described, and it arrived fast.', 'The quality is obviously a step up.', 'Already ordered a second time.'],
    testimonialAttribution: 'Verified customer',
    aboutFrame: (category) => `${titleCase(category.noun)} chosen and made with real care, not just stocked.`,
    serviceCardBody: () => "A closer look at what's in stock.",
    faqSecondQuestion: 'How do I place an order?'
  },
  'local-conversion': {
    aboutLabel: 'About', processLabel: 'How We Work',
    processSteps: ['Reach out', 'A straight quote', 'We do the work', 'Final walkthrough'],
    testimonialsLabel: 'What Customers Say',
    testimonialQuotes: ['Showed up on time and did it right the first time.', 'Straightforward pricing, no surprises.', 'Would call them again without hesitation.'],
    testimonialAttribution: 'Local customer',
    aboutFrame: (category) => `${titleCase(category.noun)} focused on doing the job right the first time.`,
    serviceCardBody: (item, category) => `Real ${category.noun}, presented clearly.`,
    faqSecondQuestion: 'How do I get a quote?'
  },
  'trust-heavy-professional': {
    aboutLabel: 'About', processLabel: 'How We Work Together',
    processSteps: ['An initial review', 'A clear plan', 'Ongoing management', 'Peace of mind'],
    testimonialsLabel: 'What Clients Say',
    testimonialQuotes: ['Finally, someone who explains things clearly.', 'Diligent and always reachable when it mattered.', 'Handled things I didn’t even know to ask about.'],
    testimonialAttribution: 'Client',
    aboutFrame: (category) => `${titleCase(category.noun)} grounded in diligence, not shortcuts.`,
    serviceCardBody: () => 'Handled with the same rigor as everything else.',
    faqSecondQuestion: 'How do I book a consultation?'
  },
  'launch-campaign': {
    aboutLabel: 'About', processLabel: 'How It Works',
    processSteps: ['Join early', 'Get access', 'Help shape it', 'Launch together'],
    testimonialsLabel: 'Early Feedback',
    testimonialQuotes: ['Exactly the kind of thing I’ve been waiting for.', 'Already better than what I was using.', 'Glad I got in early.'],
    testimonialAttribution: 'Early user',
    aboutFrame: (category) => `${titleCase(category.noun)}, built in the open and improving fast.`,
    serviceCardBody: () => "Part of what's launching.",
    faqSecondQuestion: 'How do I get early access?'
  },
  'community-nonprofit': {
    aboutLabel: 'Our Mission', processLabel: 'How You Can Help',
    processSteps: ['Learn the need', 'Get involved', 'See the impact', 'Stay connected'],
    testimonialsLabel: 'Voices from the Community',
    testimonialQuotes: ['This work made a real difference for us.', 'Transparent about where the help actually goes.', 'Easy to get involved, and it mattered.'],
    testimonialAttribution: 'Community member',
    aboutFrame: (category) => `${titleCase(category.noun)} driven by the people it serves.`,
    serviceCardBody: () => 'Part of how the mission gets done.',
    faqSecondQuestion: 'How do I get involved?'
  }
};
function sectionVocab(project) {
  const archetype = (project.strategy && project.strategy.archetype) || 'service-business';
  return ARCHETYPE_SECTION_VOCAB[archetype] || ARCHETYPE_SECTION_VOCAB['service-business'];
}
function renderServices(project, category, section) {
  // V8.4: a 'quote' module enabled on a services section renders the real
  // quote-request form directly beneath the static services content --
  // never replacing it, since the list of services is still real, useful
  // information a quote module doesn't duplicate.
  const moduleHtml = (section && section.module && section.module.enabled && section.module.type === 'quote')
    ? renderFormModuleWidget(project, section, 'Request a quote') : '';
  const variant = section && section.variant;
  const labels = category.services;
  const headline = sectionCopyField(section, 'headline', '');
  const intro = sectionCopyField(section, 'body', '');
  const headerHtml = renderSectionHeader(headline, intro, section && section.headlineRole);
  if (variant === 'described') {
    const vocab = sectionVocab(project);
    return `<div class="site-section site-section-services" data-variant="described">
      ${headerHtml}
      <div class="site-services-cards">${renderCardGroup(labels, 'service-card', l => `<strong>${escapeHtml(l)}</strong><p>${escapeHtml(vocab.serviceCardBody(l, category))}</p>`)}</div>
      ${moduleHtml}
    </div>`;
  }
  return `<div class="site-section site-section-services" data-variant="numbered">
    ${headerHtml}
    <div class="site-sections">${labels.map((l, i) => `<div><small>0${i + 1}</small><strong>${escapeHtml(l)}</strong></div>`).join('')}</div>
    ${moduleHtml}
  </div>`;
}
// V7: never fabricates a number. Only ever shows a fact the description
// itself supplied (see extractBusinessFacts) -- composeSections only
// includes this section at all when at least one such fact exists.
// V8.2: deliberately NOT threaded with Claude copy -- this is exactly the
// numbers-only, fact-gated section the no-fabrication rule exists for.
// OUTPUT QUALITY PASS: previously zero variance (always the boxed stat
// grid) and didn't even receive `section` -- one new variant, 'statement',
// reusing the SAME facts data as an inline editorial line instead of a
// card grid, for the exact case the brief names ("a single proof
// statement" as usually-bad card use). Picked by pickVariant('proof', ...)
// when avoid:generic-cards applies; falls back to 'facts' (the original,
// only) behavior for every project this ran on before.
function renderProof(project, category, section) {
  const facts = project.source.facts || {};
  const stats = [];
  if (facts.years) stats.push({ n: facts.years + '+', l: 'Years' });
  if (facts.rating) stats.push({ n: facts.rating, l: 'Rating' });
  if (facts.count) stats.push({ n: facts.count + '+', l: 'Served' });
  if (!stats.length) return '';
  const variant = (section && section.variant) || 'facts';
  const role = (section && section.headlineRole) || 'proof-led';
  if (variant === 'statement') {
    return `<div class="site-section site-section-proof" data-variant="statement">
      <p class="site-proof-statement" data-headline-role="${escapeHtml(role)}">${stats.map(s => `<strong>${escapeHtml(s.n)}</strong> ${escapeHtml(s.l)}`).join(' &nbsp;·&nbsp; ')}</p>
    </div>`;
  }
  return `<div class="site-section site-section-proof" data-variant="facts">
    <div class="site-proof-stats">${stats.map(s => `<div><strong>${escapeHtml(s.n)}</strong><small>${escapeHtml(s.l)}</small></div>`).join('')}</div>
  </div>`;
}
function renderMetrics(project, category, section) { return renderProof(project, category, section); }
function renderGallery(project, category, section, labelOverride) {
  // TIERED IMAGE SPEND PASS: a reconciled `imageDisplayVariant` (see
  // reconcileImageSupplyWithSections) overrides the stored variant for
  // RENDERING only -- when a gallery has zero real imagery, this switches
  // it to the existing 'featured' treatment (one larger, deliberate tile)
  // instead of a flat equal-weight grid of designed placeholders. The
  // section's own stored `variant` is never mutated.
  const variant = section && (section.imageDisplayVariant || section.variant);
  const plan = project.assets.plan;
  const galleryAssets = (plan.gallery || []).map(id => project.assets.items.find(a => a.id === id)).filter(Boolean);
  const label = sectionCopyField(section, 'headline', labelOverride || navLabelFor('gallery', project.business.categoryKey));
  const caption = sectionCopyField(section, 'body', '');
  // IMAGE COHERENCE PASS: a reconciled `imageTileCount` (see
  // reconcileImageSupplyWithSections) always wins over the raw
  // variant-based count -- this is what actually shrinks a gallery from
  // e.g. 4 tiles to 2 when the image budget can't fill more than 2, so the
  // grid itself, not just the image plan behind it, reflects real supply.
  // Untouched (falls back to the original count) for a section that was
  // never reconciled, including every pre-existing saved project.
  const tileCount = (section && section.imageTileCount) || galleryTileCount(variant);
  const tiles = [];
  for (let i = 0; i < tileCount; i++) {
    const asset = galleryAssets[i];
    // A collapsed single tile (zero real supply, see
    // reconcileImageSupplyWithSections) always gets the wide/banner
    // 'featured' treatment regardless of the section's own variant -- a
    // lone tile in a plain square shape reads as an accident, a lone tile
    // in a deliberate wide banner shape reads as a choice.
    const featuredClass = (i === 0 && (variant === 'featured' || tileCount === 1)) ? ' gallery-tile-featured' : '';
    const slot = galleryTileSlot(section, i);
    tiles.push(`<div class="gallery-tile${featuredClass}">${renderVisualSlot(project, slot, project.design.dimensions.imagery, asset && asset.id)}</div>`);
  }
  return `<div class="site-section site-section-gallery" data-variant="${variant}">
    ${renderSectionHeader(label, caption, section && section.headlineRole)}
    <div class="gallery-grid gallery-layout-${variant}" data-tile-count="${tileCount}">${tiles.join('')}</div>
  </div>`;
}
function renderCaseStudies(project, category, section) { return renderGallery(project, category, { ...(section || {}), variant: 'grid' }, 'Recent Projects'); }
// V7: the specific numbered claim ("Verified") is dropped -- an
// illustrative quote used as placeholder marketing copy is normal, but
// asserting it is a *verified* real review when none exists is exactly the
// kind of invented proof part 6 asks to remove.
// V8.2: deliberately NOT threaded with Claude copy for the quote/attribution
// itself -- Claude's schema has no per-testimonial quote fields, and
// putting free-text `body` into what reads as a customer's own words would
// risk exactly the fabricated-testimonial the system prompt forbids. Only
// the section label is eligible (see sectionCopyField note above).
function renderTestimonial(project, category, section) {
  const variant = section && section.variant;
  const vocab = sectionVocab(project);
  // Deterministic per-business pick (not always index 0) so a second/third
  // direction for the same business, or two businesses that share an
  // archetype, don't always land on the identical quote.
  const quoteIndex = hashString((project.source && project.source.text) || '') % vocab.testimonialQuotes.length;
  const quote = escapeHtml(vocab.testimonialQuotes[quoteIndex]);
  const attribution = escapeHtml(vocab.testimonialAttribution);
  if (variant === 'card') {
    return `<div class="site-section site-section-testimonial" data-variant="card">
      ${renderCardGroup([{ quote, attribution }], 'testimonial-card', c => `<p>${c.quote}</p><span>${c.attribution}</span>`)}
    </div>`;
  }
  return `<div class="site-section site-section-testimonial" data-variant="centered">
    <blockquote>${quote}<cite>${attribution}</cite></blockquote>
  </div>`;
}
function renderTestimonialsGrid(project, category, section) {
  const vocab = sectionVocab(project);
  const label = sectionCopyField(section, 'headline', vocab.testimonialsLabel);
  const attribution = escapeHtml(vocab.testimonialAttribution);
  return `<div class="site-section site-section-testimonials-grid" data-variant="grid">
    ${renderSectionHeader(label, '', section && section.headlineRole)}
    <div class="testimonials-grid">${renderCardGroup(vocab.testimonialQuotes, 'testimonial-card', q => `<p>${escapeHtml(q)}</p><span>${attribution}</span>`)}</div>
  </div>`;
}
// V8.2: the example the spec itself gives -- a valid Claude heading with a
// missing/invalid body keeps that heading and falls back to the
// deterministic body, field by field.
function renderAbout(project, category, section) {
  // PLACEHOLDER/COMPOSITION FIX: a reconciled `imageDisplayVariant` (see
  // reconcileImageSupplyWithSections) overrides the stored variant for
  // RENDERING only -- when an about-split section funds no real image and
  // has no upload, this switches it to the existing 'statement' (text-only)
  // treatment instead of showing an empty photo box next to the copy. The
  // section's own stored `variant` is never mutated.
  const variant = section && (section.imageDisplayVariant || section.variant);
  const plan = project.assets.plan;
  const aboutAsset = plan.about ? project.assets.items.find(a => a.id === plan.about) : null;
  const vocab = sectionVocab(project);
  const heading = sectionCopyField(section, 'headline', vocab.aboutLabel);
  const statement = sectionCopyField(section, 'body', vocab.aboutFrame(category));
  if (variant === 'split' || aboutAsset) {
    const slot = pageSlotPrefix(project.pages && project.pages[project.activePageIndex]) + 'about';
    const visual = renderVisualSlot(project, slot, project.design.dimensions.imagery, plan.about);
    return `<div class="site-section site-section-about" data-variant="split">
      <div class="about-visual">${visual}</div>
      <div class="about-copy"><p class="site-section-label" data-headline-role="${escapeHtml((section && section.headlineRole) || 'declarative')}">${escapeHtml(heading)}</p><p>${escapeHtml(statement)}</p></div>
    </div>`;
  }
  return `<div class="site-section site-section-about" data-variant="statement">
    <p class="site-section-label" data-headline-role="${escapeHtml((section && section.headlineRole) || 'declarative')}">${escapeHtml(heading)}</p>
    <p class="about-statement-text">${escapeHtml(statement)}</p>
  </div>`;
}
function renderTeam(project, category, section) {
  const label = sectionCopyField(section, 'headline', 'Team');
  const teamAssets = project.assets.items.filter(a => a.type === 'team');
  // IMAGE COHERENCE PASS: same reconciled-count fallback as renderGallery.
  const teamCount = (section && section.imageTileCount) || Math.max(teamAssets.length, 3);
  const slots = [];
  for (let i = 0; i < teamCount; i++) slots.push(teamAssets[i]);
  const cardsHtml = renderCardGroup(slots.slice(0, 4), 'team-card', (a, i) => renderVisualSlot(project, teamTileSlot(section, i), project.design.dimensions.imagery, a && a.id));
  return `<div class="site-section site-section-team" data-variant="grid">
    ${renderSectionHeader(label, '', section && section.headlineRole)}
    <div class="team-grid">${cardsHtml}</div>
  </div>`;
}
// ---- CTA intelligence -------------------------------------------------
// `category.cta` (a single fixed string, e.g. 'View Menu') used to be the
// fallback for every CTA-bearing section -- hero, nav, CTA banner, pricing,
// reservation and contact all rendered the literal same button text. It
// stays the hero/nav standard (already a real, considered per-category
// value -- unchanged here).
//
// V-brand-experience fix (leakage bug): the first version of this keyed
// the *other* sections' CTA text off ARCHETYPE alone. Archetype is a
// design-posture bucket (tone/composition/rhythm) shared by many unrelated
// businesses -- 'editorial-brand' covers a fashion label AND a wedding
// photographer AND a film studio -- so archetype-only resolution leaked
// one business's vocabulary ("Find a Stockist") onto an unrelated one that
// happens to share its posture (a photographer, who has no stock to find).
// CATEGORY is the system that already carries real business semantics
// (`categories`/`categoryKeywords` -- fashion vs creative vs roofing are
// already distinct categories, detected from the actual description, not
// one-off business names), so CTA text now resolves in this order:
//   1. section role + CATEGORY semantics (CATEGORY_SECTION_CTA) -- primary
//   2. section role + ARCHETYPE tone (ARCHETYPE_SECONDARY_CTA) -- fallback
//      for any category with no specific entry above (keeps a `local-
//      conversion` trade with no dedicated row, say, tonally consistent
//      rather than falling straight to the generic hero CTA)
//   3. category.cta -- final fallback, same as before this pass
// Every entry below is deliberately generalized to the whole category
// (never a single named business) -- see e.g. 'creative', which covers
// photographers, ad agencies, illustrators and film studios alike, so its
// contact CTA reads "Inquire About Your Project" rather than the
// wedding-specific "Inquire About Your Date" a narrower business would use.
const CATEGORY_SECTION_CTA = {
  tech: { ctaBanner: 'See It In Action', pricing: 'View Pricing', reservationCta: 'Request a Demo', contact: 'Talk to Sales' },
  finance: { ctaBanner: 'Schedule a Consultation', pricing: 'View Our Services', reservationCta: 'Book a Consultation', contact: 'Get in Touch' },
  fashion: { ctaBanner: 'View the Lookbook', pricing: 'Shop the Collection', reservationCta: 'Shop the Collection', contact: 'Find a Stockist' },
  hospitality: { ctaBanner: 'Explore the Menu', pricing: 'View the Menu', reservationCta: 'Reserve a Table', contact: 'Private Dining' },
  creative: { ctaBanner: 'View the Portfolio', pricing: 'View Packages', reservationCta: 'Check Availability', contact: 'Inquire About Your Project' },
  fitness: { ctaBanner: 'View Class Schedule', pricing: 'View Membership Plans', reservationCta: 'Book a Class', contact: 'Get in Touch' },
  realestate: { ctaBanner: 'Browse Listings', pricing: 'View Listings', reservationCta: 'Schedule a Showing', contact: 'Contact an Agent' },
  wellness: { ctaBanner: 'Explore Treatments', pricing: 'View Pricing', reservationCta: 'Book an Appointment', contact: 'Get in Touch' },
  retail: { ctaBanner: 'Shop New Arrivals', pricing: 'Shop Now', reservationCta: 'Shop Now', contact: 'Contact Us' },
  nonprofit: { ctaBanner: 'See Our Impact', pricing: 'Ways to Give', reservationCta: 'Get Involved', contact: 'Contact Us' },
  professional: { ctaBanner: 'Learn Our Approach', pricing: 'View Our Services', reservationCta: 'Book a Consultation', contact: 'Get in Touch' },
  education: { ctaBanner: 'Explore Programs', pricing: 'View Tuition', reservationCta: 'Enroll Now', contact: 'Request Info' },
  electrical: { ctaBanner: 'View Recent Work', pricing: 'Request a Quote', reservationCta: 'Schedule Service', contact: 'Request a Quote' },
  plumbing: { ctaBanner: 'View Recent Work', pricing: 'Request a Quote', reservationCta: 'Schedule Service', contact: 'Request a Quote' },
  landscaping: { ctaBanner: 'View Recent Work', pricing: 'Request a Quote', reservationCta: 'Request a Quote', contact: 'Get in Touch' },
  painting: { ctaBanner: 'View Recent Work', pricing: 'Request a Quote', reservationCta: 'Request a Quote', contact: 'Get in Touch' },
  roofing: { ctaBanner: 'View Recent Work', pricing: 'Request an Estimate', reservationCta: 'Check Service Areas', contact: 'Request an Estimate' },
  automotive: { ctaBanner: 'View Recent Work', pricing: 'Get a Quote', reservationCta: 'Book a Service', contact: 'Get a Quote' },
  cleaning: { ctaBanner: 'View Our Services', pricing: 'Get a Quote', reservationCta: 'Book a Cleaning', contact: 'Get a Quote' },
  renovation: { ctaBanner: 'View Recent Projects', pricing: 'Request a Quote', reservationCta: 'Request a Quote', contact: 'Get in Touch' }
  // 'other' intentionally has no entry -- falls through to the archetype
  // table, then category.cta, exactly like any unrecognized category did
  // before this pass.
};
// Tone-only fallback for a category with no CATEGORY_SECTION_CTA entry
// (currently just 'other') -- archetype is still a legitimate signal for
// TONE (how formal/urgent/considered the ask sounds), it just may not be
// the right signal for the actual NOUN of the ask, which is why it now
// only applies once category semantics have had first say.
const ARCHETYPE_SECONDARY_CTA = {
  hospitality: { reservationCta: 'Reserve a Table', ctaBanner: 'Private Dining', contact: 'Get Directions', pricing: 'View the Menu' },
  'premium-consultancy': { reservationCta: 'Book a Consultation', ctaBanner: 'Request a Proposal', contact: 'Get in Touch', pricing: 'Book a Consultation' },
  portfolio: { reservationCta: 'Start a Project', ctaBanner: 'View Full Portfolio', contact: 'Get in Touch', pricing: 'Start a Project' },
  'product-led-saas': { reservationCta: 'Request a Demo', ctaBanner: 'Talk to Sales', contact: 'Contact Sales', pricing: 'Start Free Trial' },
  'editorial-brand': { reservationCta: 'Join the List', ctaBanner: 'Find a Stockist', contact: 'Get in Touch', pricing: 'Shop the Collection' },
  'ecommerce-showcase': { reservationCta: 'Join the List', ctaBanner: 'Track an Order', contact: 'Contact Us', pricing: 'Shop Now' },
  'local-conversion': { reservationCta: 'Call Now', ctaBanner: 'Check Service Areas', contact: 'Get in Touch', pricing: 'Request a Quote' },
  'trust-heavy-professional': { reservationCta: 'Book a Consultation', ctaBanner: 'Read Our FAQ', contact: 'Get in Touch', pricing: 'Book a Consultation' },
  'launch-campaign': { reservationCta: 'Get Early Access', ctaBanner: 'Learn More', contact: 'Contact Us', pricing: 'Join the Waitlist' },
  'community-nonprofit': { reservationCta: 'Get Involved', ctaBanner: 'See Our Impact', contact: 'Contact Us', pricing: 'Donate Now' },
  'service-business': { reservationCta: 'Book a Consultation', ctaBanner: 'Request a Quote', contact: 'Get in Touch', pricing: 'Request a Quote' }
};
function ctaLabelForSection(project, category, sectionType) {
  const categoryKey = project.business && project.business.categoryKey;
  const categoryOverrides = CATEGORY_SECTION_CTA[categoryKey];
  if (categoryOverrides && categoryOverrides[sectionType]) return categoryOverrides[sectionType];
  const archetype = (project.strategy && project.strategy.archetype) || 'service-business';
  const archetypeOverrides = ARCHETYPE_SECONDARY_CTA[archetype] || ARCHETYPE_SECONDARY_CTA['service-business'];
  return archetypeOverrides[sectionType] || category.cta;
}
function renderCtaBanner(project, category, section) {
  // V8.4: a ctaBanner is the most generically-compatible host (see
  // MODULE_SECTION_COMPATIBILITY) -- any of contact/quote/newsletter/
  // booking/action can land here when Claude or the deterministic fallback
  // picks it, or when the editor moves a module onto it.
  if (section && section.module && section.module.enabled) {
    switch (section.module.type) {
      case 'contact': return renderFormModuleWidget(project, section, sectionCopyField(section, 'headline', 'Contact'));
      case 'quote': return renderFormModuleWidget(project, section, sectionCopyField(section, 'headline', 'Request a quote'));
      case 'newsletter': return renderFormModuleWidget(project, section, sectionCopyField(section, 'headline', 'Stay in the loop.'));
      case 'booking': return renderFormModuleWidget(project, section, sectionCopyField(section, 'headline', 'Request a booking'));
      case 'action': return renderActionModuleWidget(project, section);
    }
  }
  const variant = section && section.variant;
  const message = sectionCopyField(section, 'headline', 'Ready to see this as your real website?');
  const cta = escapeHtml(sectionCopyField(section, 'ctaLabel', ctaLabelForSection(project, category, 'ctaBanner')));
  return `<div class="site-section site-section-cta-banner cta-banner-${variant}" data-variant="${variant}">
    <p>${escapeHtml(message)}</p>${renderCtaButton(section && section.ctaTarget, cta)}
  </div>`;
}
function featureBodyFor(project, category, label, i) {
  const d = project.source.descriptor || {};
  const base = d.offering || d.descriptor || category.noun;
  const templates = [`Built around ${base}, without the busywork.`, `Everything ${base} needs, in one place.`, `Designed to make ${(label || '').toLowerCase()} feel effortless.`];
  return templates[i % templates.length];
}
function renderFeatures(project, category, section) {
  const label = sectionCopyField(section, 'headline', 'What it does');
  const intro = sectionCopyField(section, 'body', '');
  const labels = category.services;
  const variant = (section && section.variant) || 'grid';
  if (variant === 'list') {
    // Reuses the same numbered-editorial markup/CSS as renderProcess's
    // .process-steps -- not a new component, just a second, more
    // restrained composition for the same content, chosen by
    // sectionRhythm (see pickVariant) rather than always defaulting to
    // cards.
    return `<div class="site-section site-section-features" data-variant="list">
      ${renderSectionHeader(label, intro, section && section.headlineRole)}
      <div class="process-steps features-list">${labels.map((l, i) => `<div><small>0${i + 1}</small><strong>${escapeHtml(l)}</strong><p>${escapeHtml(featureBodyFor(project, category, l, i))}</p></div>`).join('')}</div>
    </div>`;
  }
  return `<div class="site-section site-section-features" data-variant="grid">
    ${renderSectionHeader(label, intro, section && section.headlineRole)}
    <div class="features-grid">${renderCardGroup(labels, 'feature-card', (l, i) => `<span class="feature-mark">${escapeHtml((l || 'F').charAt(0))}</span><strong>${escapeHtml(l)}</strong><p>${escapeHtml(featureBodyFor(project, category, l, i))}</p>`)}</div>
  </div>`;
}
function renderProductShowcase(project, category, section) {
  const businessName = escapeHtml(project.business.name || 'Your Business');
  const label = sectionCopyField(section, 'headline', 'Product');
  const caption = sectionCopyField(section, 'body', (project.copy && project.copy.sub) || category.sub);
  const slot = pageSlotPrefix(project.pages && project.pages[project.activePageIndex]) + 'product';
  const moduleHtml = section && section.module && section.module.enabled
    ? (section.module.type === 'product' ? renderProductModuleWidget(project, section) : (section.module.type === 'action' ? renderActionModuleWidget(project, section) : ''))
    : '';
  return `<div class="site-section site-section-product" data-variant="showcase">
    ${renderSectionHeader(label, '', section && section.headlineRole)}<h4>${businessName} in action</h4>
    <div class="product-frame">${renderVisualSlot(project, slot, 'dashboard-ui', (project.assets.plan.gallery || [])[0])}</div>
    <p class="product-caption">${escapeHtml(caption)}</p>
    ${moduleHtml}
  </div>`;
}
const categoryIntegrationLabels = {
  tech: ['Calendar', 'Payments', 'Analytics', 'Messaging', 'Automation', 'Storage'],
  finance: ['Reporting', 'Compliance', 'Payments', 'Planning'],
  hospitality: ['Reservations', 'Delivery', 'Loyalty', 'Point of Sale'],
  retail: ['Inventory', 'Shipping', 'Payments', 'Loyalty'],
  default: ['Calendar', 'Payments', 'Analytics', 'Support']
};
function renderIntegrations(project, category, categoryKey, section) {
  const label = sectionCopyField(section, 'headline', 'Works with what you already use');
  const labels = categoryIntegrationLabels[categoryKey] || categoryIntegrationLabels.default;
  return `<div class="site-section site-section-integrations" data-variant="chips">
    ${renderSectionHeader(label, '', section && section.headlineRole)}
    <div class="integration-chips">${labels.map(l => `<span class="integration-chip">${escapeHtml(l)}</span>`).join('')}</div>
  </div>`;
}
function renderPricingSection(project, category, section) {
  const label = sectionCopyField(section, 'headline', 'Pricing');
  const intro = sectionCopyField(section, 'body', '');
  const cta = sectionCopyField(section, 'ctaLabel', ctaLabelForSection(project, category, 'pricing'));
  const tiers = [{ name: 'Starter', blurb: 'For getting started quickly.' }, { name: 'Growth', blurb: 'For teams scaling up.' }, { name: 'Enterprise', blurb: 'Custom for larger needs.' }];
  return `<div class="site-section site-section-pricing" data-variant="tiers">
    ${renderSectionHeader(label, intro, section && section.headlineRole)}
    <div class="pricing-tiers">${renderCardGroup(tiers, 'pricing-tier', t => `<strong>${escapeHtml(t.name)}</strong><p>${escapeHtml(t.blurb)}</p><button>${escapeHtml(cta)}</button>`)}</div>
  </div>`;
}
// SECTION SEMANTICS FIX: descriptor.offering/descriptor.descriptor are
// regex-captured free text meant for templates that read naturally with a
// full clause dropped in ("Built for {offering}.", a kicker line). Plugged
// into a template that expects a short NOUN instead -- "Seasonal {x}",
// "we'll walk through {x} together" -- a long captured clause reads as a
// broken run-on ("Seasonal seasonal tasting menus and intimate evening
// reservations"). This guard only accepts a candidate short enough to read
// as a noun phrase; anything longer falls through to the next candidate,
// and finally to the category's own safe noun.
function shortSubjectPhrase(descriptor, fallback, maxWords) {
  const words = maxWords || 3;
  const candidates = [descriptor && descriptor.descriptor, descriptor && descriptor.offering].filter(Boolean);
  const short = candidates.find(c => c.trim().split(/\s+/).length <= words);
  return short || fallback;
}
function renderFaq(project, category, section) {
  const label = sectionCopyField(section, 'headline', 'FAQ');
  const intro = sectionCopyField(section, 'body', '');
  const d = project.source.descriptor || {};
  const noun = shortSubjectPhrase(d, category.noun);
  const vocab = sectionVocab(project);
  const qas = [
    { q: `What does ${escapeHtml(project.business.name || 'this business')} actually do?`, a: escapeHtml(category.sub) },
    { q: escapeHtml(vocab.faqSecondQuestion), a: `Reach out and we'll walk through ${escapeHtml(noun)} together.` },
    // Deliberately universal, not SaaS-coded ("Is support included? Yes --
    // real help, not just documentation." used to render verbatim for
    // every category, including a restaurant or a nonprofit) -- this
    // closing question works honestly for any business without asserting
    // anything specific and unverified about it.
    { q: 'What if I’m not sure this is right for me?', a: 'Reach out -- we’re happy to talk through whether it’s a good fit.' }
  ];
  return `<div class="site-section site-section-faq" data-variant="list">
    ${renderSectionHeader(label, intro, section && section.headlineRole)}
    <div class="faq-list">${qas.map(x => `<div class="faq-item"><strong>${x.q}</strong><p>${x.a}</p></div>`).join('')}</div>
  </div>`;
}
function renderProcess(project, category, section) {
  const vocab = sectionVocab(project);
  const label = sectionCopyField(section, 'headline', vocab.processLabel);
  const intro = sectionCopyField(section, 'body', '');
  const steps = vocab.processSteps;
  return `<div class="site-section site-section-process" data-variant="steps">
    ${renderSectionHeader(label, intro, section && section.headlineRole)}
    <div class="process-steps">${steps.map((s, i) => `<div><small>0${i + 1}</small><strong>${escapeHtml(s)}</strong></div>`).join('')}</div>
  </div>`;
}
function renderMenu(project, category, section) {
  const label = sectionCopyField(section, 'headline', 'Menu');
  const intro = sectionCopyField(section, 'body', '');
  const descriptor = project.source.descriptor || {};
  // SECTION SEMANTICS FIX: the raw (potentially long, clause-length)
  // descriptor/offering text used to be dropped straight into "Seasonal
  // {x}" with no length guard -- for a business whose captured offering was
  // a full sentence ("seasonal tasting menus and intimate evening
  // reservations"), that produced a genuinely broken menu heading
  // ("Seasonal seasonal tasting menus and intimate evening reservations").
  // shortSubjectPhrase only accepts a candidate short enough to read as a
  // real noun phrase; when nothing qualifies, the safe non-interpolated
  // "Seasonal Selections" heading is used instead of forcing a fit.
  const subject = shortSubjectPhrase(descriptor, null);
  const subjectLabel = subject ? titleCase(subject) : null;
  const groups = category === categories.hospitality
    ? [subjectLabel ? `Seasonal ${subjectLabel}` : 'Seasonal Selections', 'Shared Plates', 'Something Sweet']
    : ['Featured Offerings', 'Popular Choices', 'Seasonal Selection'];
  const firstGroupBody = subject ? `A considered take on ${subject}.` : `A considered seasonal selection.`;
  return `<div class="site-section site-section-menu" data-variant="columns">
    ${renderSectionHeader(label, intro, section && section.headlineRole)}
    <div class="menu-groups">${groups.map((g, i) => `<div class="menu-group"><strong>${escapeHtml(g)}</strong><p>${escapeHtml(i === 0 ? firstGroupBody : i === 1 ? `Made for sharing, with detail in every choice.` : `A concise finish to the ${category.label.toLowerCase()} experience.`)}</p></div>`).join('')}</div>
  </div>`;
}
function renderReservationCta(project, category, section) {
  // V8.4: 'booking' is the real, functional replacement for the static
  // banner; 'action' (e.g. an external booking link) renders as a single
  // real CTA in its place. Neither type invents a live calendar/scheduler
  // -- see the booking module's own honest "preview" submission state.
  if (section && section.module && section.module.enabled) {
    if (section.module.type === 'booking') return renderFormModuleWidget(project, section, sectionCopyField(section, 'headline', 'Request a booking'));
    if (section.module.type === 'action') return renderActionModuleWidget(project, section);
  }
  const message = sectionCopyField(section, 'headline', 'Book a table.');
  const cta = escapeHtml(sectionCopyField(section, 'ctaLabel', ctaLabelForSection(project, category, 'reservationCta')));
  return `<div class="site-section site-section-reservation" data-variant="banner">
    <p>${escapeHtml(message)}</p>${renderCtaButton(section && section.ctaTarget, cta)}
  </div>`;
}
function renderServiceAreas(project, category, section) {
  // V8.4: a 'location' module enabled here renders the real (never
  // fabricated) address/placeholder widget in place of the decorative
  // areas statement; 'contact' renders a real contact form instead.
  if (section && section.module && section.module.enabled) {
    if (section.module.type === 'location') return renderLocationModuleWidget(project, section);
    if (section.module.type === 'contact') return renderFormModuleWidget(project, section, sectionCopyField(section, 'headline', 'Contact'));
  }
  const label = sectionCopyField(section, 'headline', 'Service Areas');
  const loc = project.source.location;
  const areasText = loc ? `${loc} and surrounding areas` : 'Local & surrounding areas';
  return `<div class="site-section site-section-areas" data-variant="list">
    ${renderSectionHeader(label, '', section && section.headlineRole)}<p class="areas-statement">${escapeHtml(areasText)}</p>
  </div>`;
}
function renderContact(project, category, section) {
  // V8.4: contact/quote/booking/location/action modules all render a real,
  // functional widget here in place of the decorative static block --
  // exactly the module types requirement #8's compatibility map allows on
  // a 'contact' section (see MODULE_SECTION_COMPATIBILITY -- every one of
  // those five module types lists 'contact' as a valid target, so this
  // switch must handle all five or a legitimately-compatible, enabled
  // module would silently fall through to the static block instead of
  // rendering at all). An unrecognized/incompatible module.type is never
  // reached (setSectionModuleType/normalizeSectionModuleFromClaude already
  // refuse it), so this always has a real renderer for whatever is here.
  if (section && section.module && section.module.enabled) {
    switch (section.module.type) {
      case 'contact': return renderFormModuleWidget(project, section, sectionCopyField(section, 'headline', 'Contact'));
      case 'quote': return renderFormModuleWidget(project, section, sectionCopyField(section, 'headline', 'Request a quote'));
      case 'booking': return renderFormModuleWidget(project, section, sectionCopyField(section, 'headline', 'Request a booking'));
      case 'location': return renderLocationModuleWidget(project, section);
      case 'action': return renderActionModuleWidget(project, section);
    }
  }
  const label = sectionCopyField(section, 'headline', 'Contact');
  const cta = escapeHtml(sectionCopyField(section, 'ctaLabel', ctaLabelForSection(project, category, 'contact')));
  const loc = project.source.location ? escapeHtml(project.source.location) + ' · ' : '';
  // V-brand-experience, item 16: the plain fallback form used to be just a
  // label, one generic sentence and a button -- real empty space with
  // nothing to fill it. Rather than inventing a fact (an address, hours,
  // a phone number) that was never given, this surfaces whatever REAL
  // facts the business description actually contained (the same `facts`
  // object renderProof already uses, never a new source), so a contact
  // section for a business that mentioned "15 years" or "4.9 stars" shows
  // that alongside the form instead of standing empty next to it.
  const facts = project.source.facts || {};
  const factChips = [];
  if (facts.years) factChips.push(`${escapeHtml(String(facts.years))}+ years`);
  if (facts.rating) factChips.push(`${escapeHtml(String(facts.rating))} rating`);
  if (facts.count) factChips.push(`${escapeHtml(String(facts.count))}+ served`);
  const factsHtml = factChips.length ? `<div class="contact-facts">${factChips.map(f => `<span>${f}</span>`).join('')}</div>` : '';
  return `<div class="site-section site-section-contact" data-variant="simple">
    ${renderSectionHeader(label, '', section && section.headlineRole)}<p>${loc}Get in touch to get started.</p>${factsHtml}${renderCtaButton(section && section.ctaTarget, cta)}
  </div>`;
}
function renderNewsletter(project, category, section) {
  if (section && section.module && section.module.enabled && section.module.type === 'newsletter') {
    return renderFormModuleWidget(project, section, sectionCopyField(section, 'headline', 'Stay in the loop.'));
  }
  const message = sectionCopyField(section, 'headline', 'Stay in the loop.');
  return `<div class="site-section site-section-newsletter" data-variant="inline">
    <p>${escapeHtml(message)}</p>
    <div class="newsletter-row"><input type="email" placeholder="you@email.com" disabled /><button>Subscribe</button></div>
  </div>`;
}
function renderImageLedEditorial(project, category, section) {
  const caption = sectionCopyField(section, 'body', (project.copy && project.copy.sub) || category.sub);
  const slot = pageSlotPrefix(project.pages && project.pages[project.activePageIndex]) + 'gallery-featured';
  return `<div class="site-section site-section-editorial" data-variant="image-led">
    <div class="editorial-visual">${renderVisualSlot(project, slot, project.design.dimensions.imagery, (project.assets.plan.gallery || [])[0])}</div>
    <p class="editorial-caption">${escapeHtml(caption)}</p>
  </div>`;
}
function renderSiteFooter(project, category, variant) {
  const plan = project.assets.plan;
  const logoAsset = plan.logo ? project.assets.items.find(a => a.id === plan.logo) : null;
  const businessName = escapeHtml((project.business.name || 'Your Business').trim());
  const brandInner = logoAsset ? `<img class="site-footer-logo-img" src="${logoAsset.dataUrl}" alt="${businessName} logo" />` : `<strong>${businessName}</strong>`;
  const year = new Date().getFullYear();
  if (variant === 'columns') {
    const cols = [
      { title: navLabelFor('services', project.business.categoryKey), items: category.services },
      { title: 'Company', items: ['About', 'Contact'] }
    ];
    return `<div class="site-section site-footer" data-variant="columns">
      <div class="site-footer-brand">${brandInner}</div>
      <div class="site-footer-columns">${cols.map(c => `<div><small>${escapeHtml(c.title)}</small>${c.items.map(i => `<span>${escapeHtml(i)}</span>`).join('')}</div>`).join('')}</div>
      <p class="site-footer-copy">© ${year} ${businessName}</p>
    </div>`;
  }
  return `<div class="site-section site-footer" data-variant="simple">
    <div class="site-footer-brand">${brandInner}</div>
    <p class="site-footer-copy">© ${year} ${businessName}</p>
  </div>`;
}

// ---- V8.4: functionality module rendering ----------------------------------
// Renders a CTA button/link from a normalized CTA target (see
// normalizeCtaTarget). `escapedLabel` must already be escapeHtml()'d by the
// caller, exactly like every other piece of text this file interpolates --
// never escaped twice, never left unescaped. tel:/mailto:/external targets
// are real <a href> elements the browser handles natively; page/section
// targets are <button> elements picked up by the single delegated listener
// on siteSectionsRoot (see handleCtaTargetClick) -- neither path ever
// creates a direction, calls Claude, or requests an image.
function renderCtaButton(target, escapedLabel, extraClass) {
  const cls = `module-cta-btn${extraClass ? ' ' + extraClass : ''}`;
  if (!target) return `<button type="button" class="${cls}">${escapedLabel}</button>`;
  switch (target.kind) {
    case 'tel': return `<a class="${cls}" href="tel:${escapeHtml(target.value.replace(/[^\d+]/g, ''))}" data-cta-kind="tel">${escapedLabel}</a>`;
    case 'mailto': return `<a class="${cls}" href="mailto:${escapeHtml(target.value)}" data-cta-kind="mailto">${escapedLabel}</a>`;
    case 'external': return `<a class="${cls}" href="${escapeHtml(target.value)}" target="_blank" rel="noopener noreferrer" data-cta-kind="external">${escapedLabel}</a>`;
    case 'page': return `<button type="button" class="${cls}" data-cta-kind="page" data-cta-page-id="${escapeHtml(target.pageId)}">${escapedLabel}</button>`;
    case 'section': return `<button type="button" class="${cls}" data-cta-kind="section" data-cta-page-id="${escapeHtml(target.pageId)}" data-cta-section-id="${escapeHtml(target.sectionId)}">${escapedLabel}</button>`;
    default: return `<button type="button" class="${cls}">${escapedLabel}</button>`;
  }
}
// Live, in-preview, per-VISITOR form state -- deliberately NOT part of the
// WebsiteProject model. This is the exact split requirement #7/#9 draw
// between "editor configuration" (what fields exist, are they required,
// the success message -- real model state, undoable, persisted) and
// "someone typing into the live preview" (ephemeral, never undoable, never
// saved, never able to trigger a re-render of its own -- see the
// siteSectionsRoot 'input' listener, which updates this map directly
// without ever calling renderProject, so typing never loses focus).
const moduleRuntimeState = new Map();
function getModuleRuntime(sectionId) {
  if (!moduleRuntimeState.has(sectionId)) moduleRuntimeState.set(sectionId, { status: 'idle', values: {}, errors: {}, message: '' });
  return moduleRuntimeState.get(sectionId);
}
function moduleFieldInputHtml(section, field, runtime) {
  const rawValue = (runtime.values && runtime.values[field.key]) || '';
  const value = escapeHtml(rawValue);
  const id = `mf-${section.id}-${field.key}`;
  const errId = `${id}-err`;
  const err = runtime.errors && runtime.errors[field.key];
  const reqAttr = field.required ? ' required aria-required="true"' : '';
  const invalidAttr = err ? ' aria-invalid="true"' : '';
  const describedBy = ` aria-describedby="${errId}"`;
  let input;
  if (field.kind === 'textarea') {
    input = `<textarea id="${id}" data-field-key="${field.key}" maxlength="1000"${reqAttr}${invalidAttr}${describedBy}>${value}</textarea>`;
  } else if (field.kind === 'select') {
    const opts = (field.options || []).map(o => `<option value="${escapeHtml(o)}"${rawValue === o ? ' selected' : ''}>${escapeHtml(o)}</option>`).join('');
    input = `<select id="${id}" data-field-key="${field.key}"${reqAttr}${invalidAttr}${describedBy}><option value="">Select…</option>${opts}</select>`;
  } else {
    const type = ['email', 'tel', 'date', 'time'].includes(field.kind) ? field.kind : 'text';
    input = `<input id="${id}" type="${type}" data-field-key="${field.key}" maxlength="200" value="${value}"${reqAttr}${invalidAttr}${describedBy} />`;
  }
  return `<div class="module-field${err ? ' module-field-error' : ''}">
    <label for="${id}">${escapeHtml(field.label)}${field.required ? ' <span class="module-required-mark" aria-hidden="true">*</span>' : ''}</label>
    ${input}
    <span class="module-field-err" id="${errId}" role="alert">${err ? escapeHtml(err) : ''}</span>
  </div>`;
}
// A real, functional form -- shared by the contact/quote/newsletter/booking
// module types (renderContact/renderServices/renderNewsletter/
// renderReservationCta/renderCtaBanner below all call this once a
// compatible module is enabled). Field rendering, required/email/phone/
// select validation, disabled/submitting state and success/failure state
// are handled by the shared siteSectionsRoot listeners (input/focusout/
// submit) further down this file -- this function only ever renders the
// CURRENT runtime snapshot, exactly like every other renderer in this file
// is a pure function of state.
function renderFormModuleWidget(project, section, headingFallback) {
  const module = section.module;
  const runtime = getModuleRuntime(section.id);
  const heading = sectionCopyField(section, 'headline', headingFallback);
  const ctaLabel = escapeHtml(sectionCopyField(section, 'ctaLabel', defaultModuleCtaLabel(module.type)));
  if (runtime.status === 'success') {
    const preview = resolveModuleProvider(module).name === 'preview';
    return `<div class="site-section site-section-module module-${module.type}" data-variant="module" id="module-${section.id}">
      <div class="module-success" role="status" tabindex="-1">
        <p>${escapeHtml((module.successState && module.successState.message) || defaultSuccessMessage(module.type))}</p>
        ${preview ? '<p class="module-preview-note">Preview mode — this form isn’t connected to a live inbox yet.</p>' : ''}
      </div>
    </div>`;
  }
  return `<div class="site-section site-section-module module-${module.type}" data-variant="module" id="module-${section.id}">
    <form class="module-form" data-module-form data-section-id="${section.id}" novalidate>
      <p class="site-section-label">${escapeHtml(heading)}</p>
      ${(module.fields || []).map(f => moduleFieldInputHtml(section, f, runtime)).join('')}
      ${runtime.status === 'error' ? `<p class="module-submit-error" role="alert">${escapeHtml(runtime.message || 'Something went wrong. Please try again.')}</p>` : ''}
      <button type="submit" class="module-submit-btn" data-idle-label="${ctaLabel}"${runtime.status === 'submitting' ? ' disabled' : ''}>${runtime.status === 'submitting' ? 'Sending…' : ctaLabel}</button>
    </form>
  </div>`;
}
// Structured location data only -- never a fabricated address (see
// defaultModuleConfig). No live map embed is ever rendered (no provider is
// configured in this environment, and no key is or could be sent to the
// browser) -- an honest, art-directed placeholder stands in for one, the
// same convention every other unconfigured visual slot in this app uses.
function renderLocationModuleWidget(project, section) {
  const module = section.module;
  const address = (module.config && module.config.address) || '';
  const heading = sectionCopyField(section, 'headline', 'Find us');
  return `<div class="site-section site-section-module module-location" data-variant="module">
    <p class="site-section-label">${escapeHtml(heading)}</p>
    <div class="module-map-placeholder visual-generated" data-imagery="abstract-geometric">
      <span class="module-map-note">${address ? escapeHtml(address) : 'No address on file yet'}</span>
    </div>
    ${!address ? '<p class="module-empty-note">Add a real address in the editor — nothing is ever invented here.</p>' : ''}
  </div>`;
}
function googleMapsSearchUrl(address) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}
function defaultActionLabel(actionKind) {
  switch (actionKind) {
    case 'call': return 'Call us';
    case 'email': return 'Email us';
    case 'directions': return 'Get directions';
    case 'external-booking': return 'Book now';
    case 'external-store': return 'Shop now';
    default: return 'Learn more';
  }
}
// Turns an action module's own config into the same CTA target shape every
// other CTA uses, so it renders through the exact same renderCtaButton path
// -- one real target model, not two.
function actionModuleTarget(project, section) {
  const cfg = (section.module && section.module.config) || {};
  if (cfg.actionKind === 'call') return cfg.target ? { kind: 'tel', value: cfg.target } : null;
  if (cfg.actionKind === 'email') return cfg.target ? { kind: 'mailto', value: cfg.target } : null;
  if (cfg.actionKind === 'directions') {
    const address = cfg.target || (section.module.config && section.module.config.address) || project.source.location || '';
    return address ? { kind: 'external', value: googleMapsSearchUrl(address) } : null;
  }
  if (cfg.actionKind === 'external-booking' || cfg.actionKind === 'external-store') return cfg.target ? { kind: 'external', value: cfg.target } : null;
  return null;
}
function renderActionModuleWidget(project, section) {
  const module = section.module;
  const label = escapeHtml(sectionCopyField(section, 'ctaLabel', defaultActionLabel(module.config && module.config.actionKind)));
  const target = actionModuleTarget(project, section);
  return `<div class="site-section site-section-module module-action" data-variant="module">
    ${target ? renderCtaButton(target, label) : `<p class="module-empty-note">Add a phone number, email or link in the editor to make this button real.</p><button type="button" class="module-cta-btn" disabled>${label}</button>`}
  </div>`;
}
// Structured architecture for a future real ecommerce/payment integration --
// never a full commerce platform in this pass (see SITE-PROJECT-V8.4.md).
// An unconfigured checkout target renders an honest disabled state rather
// than a button that would silently do nothing.
function renderProductModuleWidget(project, section) {
  const module = section.module;
  const cfg = module.config || {};
  const name = escapeHtml(cfg.name || project.business.name || 'Product');
  const priceHtml = cfg.priceLabel ? `<p class="module-product-price">${escapeHtml(cfg.priceLabel)}</p>` : '';
  const ctaLabel = escapeHtml(cfg.ctaLabel || 'View product');
  const target = cfg.checkoutUrl ? { kind: 'external', value: cfg.checkoutUrl } : null;
  const button = target ? renderCtaButton(target, ctaLabel) : `<button type="button" class="module-cta-btn module-product-btn-disabled" disabled>${ctaLabel} — not connected yet</button>`;
  return `<div class="module-product-cta"><strong>${name}</strong>${priceHtml}${button}</div>`;
}
function renderSectionHTML(project, section, category) {
  switch (section.type) {
    case 'hero': return renderHero(project, category);
    case 'proof': return renderProof(project, category, section);
    case 'metrics': return renderMetrics(project, category, section);
    case 'services': return renderServices(project, category, section);
    case 'features': return renderFeatures(project, category, section);
    case 'productShowcase': return renderProductShowcase(project, category, section);
    case 'integrations': return renderIntegrations(project, category, project.business.categoryKey, section);
    case 'pricing': return renderPricingSection(project, category, section);
    case 'faq': return renderFaq(project, category, section);
    case 'process': return renderProcess(project, category, section);
    case 'gallery': return renderGallery(project, category, section);
    case 'caseStudies': return renderCaseStudies(project, category, section);
    case 'imageLedEditorial': return renderImageLedEditorial(project, category, section);
    case 'about': return renderAbout(project, category, section);
    case 'team': return renderTeam(project, category, section);
    case 'testimonial': return renderTestimonial(project, category, section);
    case 'testimonialsGrid': return renderTestimonialsGrid(project, category, section);
    case 'menu': return renderMenu(project, category, section);
    case 'reservationCta': return renderReservationCta(project, category, section);
    case 'serviceAreas': return renderServiceAreas(project, category, section);
    case 'contact': return renderContact(project, category, section);
    case 'newsletter': return renderNewsletter(project, category, section);
    case 'ctaBanner': return renderCtaBanner(project, category, section);
    case 'footer': return renderSiteFooter(project, category, section.variant);
    default: return '';
  }
}
function insertSection(proj, type) {
  const cd = proj.intent && proj.intent.creativeDirection;
  const variant = pickVariant(type, proj.design.dimensions, proj.intent && proj.intent.variationSeed, cd && { avoid: cd.avoid, pageRhythm: cd.pageRhythm, heroStrategy: cd.heroStrategy });
  const section = { id: type + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), type, variant };
  const footerIdx = proj.sections.findIndex(s => s.type === 'footer');
  const insertAt = footerIdx === -1 ? proj.sections.length : footerIdx;
  proj.sections.splice(insertAt, 0, section);
}
// Asset availability can add a section the composition didn't already
// include -- not just fill a slot inside a fixed template.
function ensureAssetDrivenSections(proj) {
  const plan = proj.assets.plan;
  const types = proj.sections.map(s => s.type);
  if ((plan.gallery || []).length && !types.includes('gallery') && !types.includes('caseStudies') && !types.includes('imageLedEditorial')) insertSection(proj, 'gallery');
  if (plan.about && !types.includes('about') && !types.includes('team')) insertSection(proj, 'about');
}

function ensureSignatureSection(proj, creativeDirection) {
  if (!proj || !creativeDirection || !Array.isArray(proj.sections)) return;
  const motifToType = {
    'oversized-manifesto': 'ctaBanner', 'asymmetric-index': 'services', 'editorial-image-rail': 'imageLedEditorial',
    'large-type-break': 'ctaBanner', 'case-study-band': 'caseStudies', 'split-story': 'about',
    'staggered-mosaic': 'gallery', 'media-interruption': 'imageLedEditorial', 'process-timeline': 'process',
    'visual-philosophy': 'about', 'product-showcase': 'productShowcase'
  };
  const type = motifToType[creativeDirection.signatureMotif] || 'ctaBanner';
  if (proj.sections.some(section => section.type === type)) return;
  insertSection(proj, type);
}
// CREATIVE DIRECTOR V2: a real deterministic suppression pass over already-
// assigned section variants/dimensions -- never invents a new variant, only
// steers away from ones the creative direction explicitly asked to avoid.
// Idempotent with the existing archetype-driven defaults (e.g. sectionRhythm
// 'editorial' already picks the 'list' features variant over 'grid' --
// avoiding 'generic-cards' just keeps that choice rather than reverting it).
function applyAvoidList(proj, creativeDirection) {
  const avoid = (creativeDirection && Array.isArray(creativeDirection.avoid)) ? creativeDirection.avoid : [];
  if (!avoid.length) return;
  const avoidGenericCards = avoid.includes('generic-cards');
  const avoidSaasCta = avoid.includes('saas-cta-blocks');
  const avoidRoundedCards = avoid.includes('rounded-cards');
  const avoidBrightCheerful = avoid.includes('bright-cheerful');
  const pages = (proj.pages && proj.pages.length) ? proj.pages : [{ sections: proj.sections }];
  pages.forEach(page => {
    (page.sections || []).forEach(s => {
      if (avoidGenericCards) {
        if (s.type === 'features' && s.variant === 'grid') s.variant = 'list';
        if (s.type === 'testimonial' && s.variant === 'card') s.variant = 'centered';
        // OUTPUT QUALITY PASS: 'proof' now has a real second variant.
        if ((s.type === 'proof' || s.type === 'metrics') && s.variant === 'facts') s.variant = 'statement';
      }
      if (avoidSaasCta && s.type === 'ctaBanner' && s.variant === 'accent') s.variant = 'plain';
    });
  });
  if (avoidRoundedCards && proj.design.dimensions.cardShape === 'pill') proj.design.dimensions.cardShape = 'square';
  if (avoidBrightCheerful && proj.design.dimensions.colorBehavior === 'warm-earth-multi-tone') proj.design.dimensions.colorBehavior = 'neutral-single-accent';
}

// ---- V8.2: multi-page model ------------------------------------------------
// A direction (WebsiteProject) now owns real pages -- proj.pages[], each
// {slug, label, purpose, sections}. This is exactly one level inside the
// existing direction system's own shape (directions[] / activeDirectionIndex
// / project): proj.activePageIndex says which page the live preview shows,
// and proj.sections is a live pointer at proj.pages[proj.activePageIndex]
// .sections -- kept in sync by syncActivePageSections, called at the top of
// every renderProject (after any direct mutation of proj.sections, e.g.
// toggleSection's wholesale reassignment) and again when leaving a page.
// Every pre-V8.2 single-page project (fresh or restored) migrates into a
// one-page `pages` array via migrateProjectPages -- see below.
function syncActivePageSections(proj) {
  if (!proj || !Array.isArray(proj.pages) || !proj.pages.length) return;
  const idx = Math.max(0, Math.min(proj.pages.length - 1, Number.isInteger(proj.activePageIndex) ? proj.activePageIndex : 0));
  proj.activePageIndex = idx;
  proj.pages[idx].sections = proj.sections;
}
// Ensures a WebsiteProject -- however it arrived (freshly created, restored
// from localStorage, or a legacy V8.1.2-and-earlier save with only a flat
// `sections[]` that literally included 'hero'/'footer' entries) -- has a
// valid, page-aware shape before anything else touches it. Never throws,
// never drops data: a legacy flat section list becomes a single Home page
// with the same content sections (hero/footer split back out into chrome,
// the footer's own variant preserved), so an old save still renders and
// edits exactly as it used to.
// V9: backfills a page's `plan` and a section's `intent`/`headlineRole` for
// any project saved before those fields existed -- never reconstructs a
// page/section wholesale, only adds the missing field so nothing already
// there is disturbed. `intent`/`headlineRole` fall back to the same
// type-based lookup the deterministic engine itself uses (`sectionTypeIntent`
// / `intentHeadlineRole`), so an old save at least gets a coherent, non-
// arbitrary value rather than one flat default everywhere.
const DEFAULT_PAGE_PLAN = { visitorQuestion: '', primaryCta: '', secondaryCta: '', visualIntensity: 'standard', informationDensity: 'standard', copyTone: '', imageCritical: false };
function backfillPageAndSectionPlanning(pages) {
  (pages || []).forEach(p => {
    if (!p) return;
    if (!p.plan || typeof p.plan !== 'object') p.plan = { ...DEFAULT_PAGE_PLAN };
    (p.sections || []).forEach(s => {
      if (!s) return;
      if (!s.intent) s.intent = sectionTypeIntent[s.type] || 'explain';
      if (!s.headlineRole) s.headlineRole = intentHeadlineRole[s.intent] || 'declarative';
    });
  });
}
function migrateProjectPages(proj) {
  if (!proj) return proj;
  if (!proj.strategy) {
    // V9: additive backfill for a pre-V9 save -- inferred from whatever real
    // signal the project already has (its own source text/category/facts),
    // never fabricated. Cheap and idempotent; safe to run on every load.
    const categoryKey = (proj.business && proj.business.categoryKey) || 'other';
    const srcText = (proj.source && proj.source.text) || '';
    const facts = (proj.source && proj.source.facts) || {};
    const descriptor = (proj.source && proj.source.descriptor) || {};
    proj.strategy = inferStrategy(categoryKey, srcText, facts, descriptor);
  }
  if (Array.isArray(proj.pages) && proj.pages.length) {
    proj.activePageIndex = Math.max(0, Math.min(proj.pages.length - 1, Number.isInteger(proj.activePageIndex) ? proj.activePageIndex : 0));
    proj.sections = proj.pages[proj.activePageIndex].sections || [];
    if (!proj.footerVariant) proj.footerVariant = 'simple';
    backfillPageAndSectionPlanning(proj.pages);
    return proj;
  }
  const legacySections = Array.isArray(proj.sections) ? proj.sections : [];
  const footerSection = legacySections.find(s => s.type === 'footer');
  const content = legacySections.filter(s => s.type !== 'hero' && s.type !== 'footer');
  proj.pages = [{ slug: '', label: 'Home', purpose: '', sections: content }];
  proj.activePageIndex = 0;
  proj.sections = proj.pages[0].sections;
  proj.footerVariant = (footerSection && footerSection.variant) || 'simple';
  backfillPageAndSectionPlanning(proj.pages);
  return proj;
}
function sanitizeSlug(str) {
  return String(str || '').toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}
function uniqueSlug(base, usedSlugs) {
  const root = base || 'page';
  let slug = root, n = 2;
  while (usedSlugs.has(slug)) { slug = `${root}-${n}`; n++; }
  usedSlugs.add(slug);
  return slug;
}
// Turns normalizeClaudePlan's already shape-validated `pages` (each
// {id,label,purpose,sections:[{type,copy}]}) into the project's real
// pages[] -- the one step normalizeClaudePlan deliberately leaves to the
// caller (see its own comments): unique/stable slugs, no duplicate Home
// page, and a hard product-level cap, on top of the raw-shape safety
// (known section types only, length-capped strings) already applied there.
// index 0 is always Home, regardless of what Claude itself called it --
// its real label is kept for the nav, only its routing slug is forced.
function buildClaudePages(claudePages, variationSeed, dimensions, creativeDirection) {
  if (!Array.isArray(claudePages) || !claudePages.length) return null;
  const cd = creativeDirection || {};
  const pickCtx = { avoid: cd.avoid, pageRhythm: cd.pageRhythm, heroStrategy: cd.heroStrategy };
  const usedSlugs = new Set(['']);
  const pages = [];
  claudePages.forEach((p, i) => {
    if (pages.length >= MAX_PAGES) return;
    if (!p || !Array.isArray(p.sections) || !p.sections.length) return;
    const isHome = pages.length === 0;
    const labelRaw = (p.label && String(p.label).trim()) || (isHome ? 'Home' : `Page ${i + 1}`);
    // Prevent a duplicate Home page: once Home exists (always page 0), any
    // later Claude-authored page that is ALSO clearly "Home" is dropped
    // rather than creating a second, redundant entry.
    if (!isHome && sanitizeSlug(labelRaw) === 'home') return;
    const slug = isHome ? '' : uniqueSlug(sanitizeSlug(p.id || labelRaw) || `page-${i}`, usedSlugs);
    const sections = p.sections.map((s, si) => ({
      id: `${s.type}-${slug || 'home'}-${si}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`,
      type: s.type,
      // OUTPUT QUALITY PASS: pickVariant now also gets this page's real
      // creative context (avoid/pageRhythm/heroStrategy), not just the flat
      // dimension set -- see pickVariant's own comment.
      variant: pickVariant(s.type, dimensions, variationSeed, pickCtx),
      // V9: normalizeClaudePlan already validated/defaulted these -- carried
      // through as-is, same posture as `copy`/`module` below.
      intent: s.intent || 'explain',
      headlineRole: s.headlineRole || 'declarative',
      copy: s.copy || null,
      module: s.module || null // already fully validated by normalizeSectionModuleFromClaude -- carried through as-is
    }));
    // V9: forwards Claude's per-page plan (purpose/visitor-question/CTA/
    // density reasoning) onto the real page object -- previously computed by
    // normalizeClaudePlan and then dropped here, never reaching `proj.pages`.
    pages.push({ slug, label: labelRaw.slice(0, 40), purpose: (p.purpose && String(p.purpose).slice(0, 200)) || '', plan: p.plan || null, sections });
  });
  if (!pages.length) return null;
  pages[0].slug = ''; // enforced regardless of what slug the loop above computed for it
  return pages;
}
// The primary CTA button in the live preview's nav only targets a specific
// page once there's genuinely more than one -- a single-page project keeps
// the exact original, fully decorative behavior. Prefers the first page
// (after Home) whose own content is actually about converting a visitor.
function findCtaTargetPage(proj) {
  if (!proj || !Array.isArray(proj.pages) || proj.pages.length < 2) return -1;
  const priority = ['contact', 'reservationCta', 'newsletter'];
  for (let i = 1; i < proj.pages.length; i++) {
    if ((proj.pages[i].sections || []).some(s => priority.includes(s.type))) return i;
  }
  return -1;
}
// The lightweight equivalent of the home page's hero for every OTHER page
// -- deliberately not a second full hero layout (no extra image slot, no
// extra generation cost) so secondary pages stay cheap while still reading
// as real pages of the same site rather than disconnected fragments.
function renderPageHeader(project, page, category) {
  const kicker = escapeHtml(category.kicker || category.label);
  const title = escapeHtml((page && page.label) || 'Page');
  const sub = (page && page.purpose) ? page.purpose : ((project.copy && project.copy.sub) || category.sub);
  return `<div class="site-page-header">
    <p class="site-page-header-kicker">${kicker}</p>
    <h3 class="site-page-header-title">${title}</h3>
    <p class="site-page-header-sub">${escapeHtml(sub)}</p>
  </div>`;
}
// V8.2: switches which PAGE of the current direction is shown in the live
// preview. Exactly parallel to switchDirection's own contract: pure
// client-side state, zero Claude calls, zero image-provider calls (every
// image any page could need was already planned/resolved for ALL pages
// when the direction was generated -- see buildImagePlan -- so this never
// calls resolveImagePlanAssets), and explicitly NOT a new direction: it
// never touches directions[]/activeDirectionIndex/the 3-direction meter.
// Refuses outright while generationInFlight, the same guard switchDirection
// uses, so a page-nav click can never land mid-transaction.
function switchPage(index) {
  if (!project || !Array.isArray(project.pages) || !project.pages.length) return;
  if (generationInFlight) return;
  index = Math.max(0, Math.min(project.pages.length - 1, index));
  syncActivePageSections(project); // commit any pending in-place edits to the page we're leaving
  if (index === project.activePageIndex) return;
  project.activePageIndex = index;
  project.sections = project.pages[index].sections;
  renderProject(project);
  persistDirectionsSilently();
}

// ---- V8.3: editor/remix model ----------------------------------------------
// A non-AI editing layer over the exact model V8.2 established -- real
// pages[]/sections[] mutations, zero Claude calls, zero DOM hacks. Every
// operation below is a pure function of (proj, ...ids) -- it mutates the
// project model in place and returns a truthy result on success / null or
// false on a safely-refused edit; it never touches the DOM, and the UI layer
// further down is the only thing that calls renderProject afterward. This
// mirrors the "model first, view second" split the V8.2 renderer already
// uses (renderSections/renderChrome are pure functions OF the model, never
// the other way around).
function newSectionId(type) {
  return `${type}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}
function newPageId(slug) {
  return `page_${slug || 'home'}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}
// Assigns a stable id to any page or section that doesn't already have one
// (a pre-V8.3 direction, restored from storage, or one built by any of the
// several existing project-construction paths). Idempotent and side-effect
// bounded: once an id is set it is never regenerated, so it survives every
// subsequent render, reorder, direction switch, page switch and
// save/restore for the rest of that object's life -- exactly the "stable
// unique id that survives reorder/duplicate/page moves/direction
// switching/save-restore" requirement. Called from renderProject itself
// (alongside syncActivePageSections) so every existing project-creation
// path -- createProject, buildGenerationPlan's two branches,
// buildClaudePages, migrateProjectPages -- gets ids for free, with zero
// changes needed at any of those call sites.
function ensureEditorIds(proj) {
  if (!proj || !Array.isArray(proj.pages)) return;
  proj.pages.forEach(page => {
    if (!page.id) page.id = newPageId(page.slug);
    (page.sections || []).forEach(section => {
      if (!section.id) section.id = newSectionId(section.type);
    });
  });
}
function findPageById(proj, pageId) {
  return (proj && Array.isArray(proj.pages)) ? (proj.pages.find(p => p.id === pageId) || null) : null;
}
function findPageIndexById(proj, pageId) {
  return (proj && Array.isArray(proj.pages)) ? proj.pages.findIndex(p => p.id === pageId) : -1;
}
function findSectionIndex(page, sectionId) {
  return page ? (page.sections || []).findIndex(s => s.id === sectionId) : -1;
}
function findSectionById(page, sectionId) {
  const idx = findSectionIndex(page, sectionId);
  return idx === -1 ? null : page.sections[idx];
}
// Deep-clones a section's own content (never shares the source's `copy`
// object or its nested `claims` array) and assigns it a brand-new id --
// used by both duplicateSection (same direction) and
// importSectionFromDirection (cross-direction), so an edit to the copy
// afterward can never be observed by the original. JSON round-tripping is
// exact and safe here because a section's shape is already guaranteed to
// be plain, serializable data (see normalizeClaudePlan/buildClaudePages).
function cloneSectionForInsert(source) {
  const copy = source.copy ? JSON.parse(JSON.stringify(source.copy)) : null;
  // V8.4: a section's functionality module and CTA target are real
  // configuration, exactly like `copy` -- deep-cloned (never a shared
  // reference) so duplicateSection/importSectionFromDirection (both of
  // which call this) carry them along instead of silently dropping them,
  // and so editing the COPY afterward can never mutate the original's
  // module/ctaTarget by reference (see requirement #8/#15 and the
  // cross-direction-import independence tests).
  const module = source.module ? JSON.parse(JSON.stringify(source.module)) : null;
  const ctaTarget = source.ctaTarget ? JSON.parse(JSON.stringify(source.ctaTarget)) : null;
  return { id: newSectionId(source.type), type: source.type, variant: source.variant, copy, module, ctaTarget };
}

// ---- Section operations ----------------------------------------------------
function moveSection(proj, pageId, sectionId, targetIndex) {
  const page = findPageById(proj, pageId);
  if (!page) return false;
  const idx = findSectionIndex(page, sectionId);
  if (idx === -1) return false;
  const clamped = Math.max(0, Math.min(page.sections.length - 1, targetIndex));
  if (clamped === idx) return true;
  const [item] = page.sections.splice(idx, 1);
  page.sections.splice(clamped, 0, item);
  return true;
}
function duplicateSection(proj, pageId, sectionId) {
  const page = findPageById(proj, pageId);
  if (!page) return null;
  const idx = findSectionIndex(page, sectionId);
  if (idx === -1) return null;
  const clone = cloneSectionForInsert(page.sections[idx]);
  page.sections.splice(idx + 1, 0, clone);
  return clone;
}
function removeSection(proj, pageId, sectionId) {
  const page = findPageById(proj, pageId);
  if (!page) return false;
  const idx = findSectionIndex(page, sectionId);
  if (idx === -1) return false;
  page.sections.splice(idx, 1);
  return true;
}
function moveSectionToPage(proj, sourcePageId, sectionId, targetPageId, targetIndex) {
  if (sourcePageId === targetPageId) return moveSection(proj, sourcePageId, sectionId, targetIndex);
  const sourcePage = findPageById(proj, sourcePageId);
  const targetPage = findPageById(proj, targetPageId);
  if (!sourcePage || !targetPage) return false;
  const idx = findSectionIndex(sourcePage, sectionId);
  if (idx === -1) return false;
  const [item] = sourcePage.sections.splice(idx, 1);
  const clamped = Math.max(0, Math.min(targetPage.sections.length, targetIndex));
  targetPage.sections.splice(clamped, 0, item);
  return true;
}
// Copies (never moves, never shares references) one real content section
// from another direction's page into the CURRENT project. The source
// direction's own object graph is never touched -- only ever read -- so it
// remains byte-for-byte unchanged by anything done to the imported copy
// afterward. Only a section whose type is still in the real renderer
// vocabulary is importable (defense in depth -- every section already in
// `directions[]` came from either normalizeClaudePlan or the deterministic
// engine, both of which already only ever produce real types, but this
// keeps the guarantee local to the operation itself rather than trusting a
// prior validation pass forever).
function importSectionFromDirection(sourceDirectionIndex, sourcePageId, sectionId, targetPageId, targetIndex) {
  if (!project) return null;
  const sourceDirection = directions[sourceDirectionIndex];
  if (!sourceDirection) return null;
  const sourcePage = findPageById(sourceDirection, sourcePageId);
  if (!sourcePage) return null;
  const sourceSection = findSectionById(sourcePage, sectionId);
  // A real content section instance is only ever one of these types -- the
  // same controlled vocabulary normalizeClaudePlan already enforces on a
  // Claude plan (referenced here, not aliased at module-eval time, since
  // CLAUDE_SECTION_TYPE_KEYS is declared later in this file -- this
  // function itself is only ever called at runtime, long after the whole
  // script has finished its own top-to-bottom evaluation). Hero and footer
  // are chrome (see the V8.2 section above), never literal section
  // entries, so they can never be imported as if they were ordinary
  // content -- there is simply no section object for them to operate on.
  if (!sourceSection || !CLAUDE_SECTION_TYPE_KEYS.includes(sourceSection.type)) return null;
  const targetPage = findPageById(project, targetPageId);
  if (!targetPage) return null;
  const clone = cloneSectionForInsert(sourceSection);
  const clamped = Math.max(0, Math.min(targetPage.sections.length, Number.isInteger(targetIndex) ? targetIndex : targetPage.sections.length));
  targetPage.sections.splice(clamped, 0, clone);
  return clone;
}
// A lightweight parallel to importSectionFromDirection for the hero, which
// (as V8.2 established) is chrome, not a section object -- there is
// nothing to "import" as a list entry. Copies just the hero's own visual
// treatment and hero copy from another direction into the current one,
// which is the real, renderable equivalent of "bring the hero from
// Direction 2" without pretending the hero is a section it isn't.
function importHeroFromDirection(sourceDirectionIndex) {
  if (!project) return false;
  const sourceDirection = directions[sourceDirectionIndex];
  if (!sourceDirection || !sourceDirection.design) return false;
  project.design.dimensions.hero = sourceDirection.design.dimensions.hero;
  if (sourceDirection.copy) {
    project.copy = { ...project.copy, ...JSON.parse(JSON.stringify(sourceDirection.copy)) };
  }
  return true;
}

// ---- Page operations --------------------------------------------------------
function addPage(proj, label) {
  if (!Array.isArray(proj.pages) || proj.pages.length >= MAX_PAGES) return null;
  const usedSlugs = new Set(proj.pages.map(p => p.slug));
  const labelSafe = (label && String(label).trim().slice(0, 40)) || `Page ${proj.pages.length + 1}`;
  const slug = uniqueSlug(sanitizeSlug(labelSafe) || `page-${proj.pages.length}`, usedSlugs);
  const page = { id: newPageId(slug), slug, label: labelSafe, purpose: '', sections: [] };
  proj.pages.push(page);
  return page;
}
function renamePage(proj, pageId, newLabel) {
  const page = findPageById(proj, pageId);
  if (!page) return false;
  const safe = String(newLabel || '').trim().slice(0, 40);
  if (!safe) return false;
  page.label = safe;
  return true;
}
// The image-bearing slots a page can own -- kept in exact sync with
// buildImagePlan's own per-page slot names (product/about/gallery-featured)
// so a slug change can carry a page's already-generated images along with
// it under their new, correctly-prefixed keys instead of silently
// orphaning them (which would look identical to a cache miss and cause a
// wasted paid regeneration the next time that page is viewed).
const EDITOR_SLOT_ROLE_BY_BASE = { product: 'product', about: 'team', 'gallery-featured': 'gallery' };
function migratePageImageCache(proj, oldPrefix, newPrefix) {
  if (oldPrefix === newPrefix || !proj.assets || !proj.assets.generated) return;
  Object.keys(EDITOR_SLOT_ROLE_BY_BASE).forEach(base => {
    const oldSlot = oldPrefix + base;
    const entry = proj.assets.generated[oldSlot];
    if (!entry) return;
    delete proj.assets.generated[oldSlot];
    // A still-in-flight request closed over the OLD slot name; it will
    // safely no-op against the now-deleted key when it resolves (see
    // resolveImagePlanAssets). Dropping rather than migrating a 'pending'
    // entry lets the very next resolveImagePlanAssets call -- always
    // triggered right after a slug change -- start a fresh, correctly-keyed
    // request instead of leaving a stuck marker nothing will ever resolve.
    if (entry.status === 'pending') return;
    const newSlot = newPrefix + base;
    proj.assets.generated[newSlot] = { ...entry, cacheKey: computeImageCacheKey(proj, EDITOR_SLOT_ROLE_BY_BASE[base], newSlot) };
  });
}
function changePageSlug(proj, pageId, newSlugRaw) {
  const pageIndex = findPageIndexById(proj, pageId);
  if (pageIndex <= 0) return false; // Home's slug ('') is permanently fixed -- the same invariant V8.2 established
  const page = proj.pages[pageIndex];
  const oldPrefix = pageSlotPrefix(page);
  const usedSlugs = new Set(proj.pages.filter((p, i) => i !== pageIndex).map(p => p.slug));
  const candidate = sanitizeSlug(newSlugRaw) || 'page';
  page.slug = uniqueSlug(candidate, usedSlugs);
  migratePageImageCache(proj, oldPrefix, pageSlotPrefix(page));
  return true;
}
function reorderPage(proj, pageId, targetIndex) {
  if (!Array.isArray(proj.pages)) return false;
  const idx = findPageIndexById(proj, pageId);
  if (idx <= 0) return false; // Home (always index 0) can never be reordered, nor can anything be reordered into index 0
  const activePage = proj.pages[proj.activePageIndex];
  const activeId = activePage ? activePage.id : null;
  const clamped = Math.max(1, Math.min(proj.pages.length - 1, targetIndex));
  if (clamped !== idx) {
    const [item] = proj.pages.splice(idx, 1);
    proj.pages.splice(clamped, 0, item);
  }
  if (activeId) {
    const newActiveIdx = proj.pages.findIndex(p => p.id === activeId);
    if (newActiveIdx !== -1) proj.activePageIndex = newActiveIdx;
  }
  syncActivePageSections(proj);
  return true;
}
function removePage(proj, pageId) {
  if (!Array.isArray(proj.pages) || proj.pages.length <= 1) return false;
  const idx = findPageIndexById(proj, pageId);
  if (idx <= 0) return false; // Home can never be removed
  proj.pages.splice(idx, 1);
  if (proj.activePageIndex >= proj.pages.length) proj.activePageIndex = proj.pages.length - 1;
  else if (proj.activePageIndex > idx) proj.activePageIndex -= 1;
  syncActivePageSections(proj);
  return true;
}

// ---- Hero/section variant remixing -----------------------------------------
// Swaps only the visual TREATMENT -- never touches copy/content, never
// makes a Claude call. Whether this needs a new generated image is decided
// entirely by the existing buildImagePlan/resolveImagePlanAssets funnel the
// next time the caller re-renders: buildImagePlan derives the hero image
// slot purely from `dimensions.hero` (see heroHasVisual), so switching
// between two visual hero layouts with the SAME category/imagery/text
// reuses the exact same cache entry (the cache key never encodes the hero
// layout itself), and switching to a text-only layout simply stops
// planning that slot at all -- neither path is special-cased here.
function swapHeroLayout(proj, newHeroKey) {
  if (!CLAUDE_HERO_KEYS.includes(newHeroKey)) return false;
  proj.design.dimensions.hero = newHeroKey;
  return true;
}
// Only a variant a renderer actually branches on is offered -- swapping to
// anything else would be a silent no-op in the UI, which is worse than not
// offering it. Kept in sync with the render*() functions themselves.
const SECTION_VARIANT_OPTIONS = {
  services: ['numbered', 'described'],
  gallery: ['grid', 'featured'],
  caseStudies: ['grid', 'featured'],
  testimonial: ['card', 'centered'],
  about: ['statement', 'split'],
  ctaBanner: ['plain', 'accent']
};
function swapSectionVariant(proj, pageId, sectionId, newVariant) {
  const page = findPageById(proj, pageId);
  const section = page && findSectionById(page, sectionId);
  if (!section) return false;
  const allowed = SECTION_VARIANT_OPTIONS[section.type];
  if (!allowed || !allowed.includes(newVariant)) return false;
  section.variant = newVariant;
  return true;
}

// ---- Copy editing ------------------------------------------------------------
// The exact same field set sectionCopyField already threads into each
// renderer -- see the field-availability map the editor UI uses
// (SECTION_EDITABLE_FIELDS below) to only ever offer a field a renderer
// actually reads. That map is what keeps the V8.2 fabrication boundary
// intact here too: proof/metrics have no editable fields at all (fact-
// gated, numbers-only, never copy-driven -- see renderProof), and
// testimonial/testimonialsGrid never expose the quote/attribution text
// itself (only testimonialsGrid's own label, which is all its renderer
// ever reads from `copy`) -- so this generic setter can never be used, via
// the shipped UI, to fabricate a proof stat or put invented words in a
// customer's mouth. editSectionCopy itself stays a plain, general setter
// (defense in depth: even a value written to an excluded field is simply
// never rendered, because the corresponding render function never calls
// sectionCopyField for it).
const EDITOR_COPY_FIELD_LIMITS = { headline: 160, subhead: 220, body: 500, ctaLabel: 40 };
const SECTION_EDITABLE_FIELDS = {
  services: ['headline', 'body'], features: ['headline', 'body'], productShowcase: ['headline', 'body'],
  integrations: ['headline'], pricing: ['headline', 'body', 'ctaLabel'], faq: ['headline', 'body'],
  process: ['headline', 'body'], gallery: ['headline', 'body'], caseStudies: ['headline', 'body'],
  imageLedEditorial: ['body'], about: ['headline', 'body'], team: ['headline'],
  testimonialsGrid: ['headline'], menu: ['headline', 'body'], reservationCta: ['headline', 'ctaLabel'],
  serviceAreas: ['headline'], contact: ['headline', 'ctaLabel'], newsletter: ['headline'],
  ctaBanner: ['headline', 'ctaLabel']
  // proof, metrics, testimonial: deliberately absent -- see the comment above.
};
function editSectionCopy(proj, pageId, sectionId, field, value) {
  if (!(field in EDITOR_COPY_FIELD_LIMITS)) return false;
  const page = findPageById(proj, pageId);
  const section = page && findSectionById(page, sectionId);
  if (!section) return false;
  if (!(SECTION_EDITABLE_FIELDS[section.type] || []).includes(field)) return false;
  if (!section.copy) section.copy = { headline: '', subhead: '', body: '', ctaLabel: '', claims: [] };
  section.copy[field] = String(value == null ? '' : value).slice(0, EDITOR_COPY_FIELD_LIMITS[field]);
  return true;
}

// ==========================================================================
// V8.4: functionality module model -----------------------------------------
// A controlled, structured "does something real" layer on top of the exact
// V8.3 model -- a module lives on `section.module`, one more plain field on
// the same section object every editor/undo/save-restore path already
// carries, never a second parallel document. Claude may only ever choose a
// module TYPE and which of a fixed, developer-authored field set to include
// (see MODULE_FIELD_ALLOWLIST) -- it never invents a field's label/kind/
// validation, an API key, a webhook, a price, an address or a booking slot.
// Every module type is rendered by a real, hand-written SiteRemade
// renderer; there is no path from a module object to arbitrary HTML/CSS/JS.
// ==========================================================================
const MODULE_TYPE_KEYS = ['contact', 'quote', 'newsletter', 'booking', 'location', 'action', 'product'];
// Which section TYPES a module type is allowed to attach to -- the
// compatibility map IS the safety mechanism requirement #8 asks for: it is
// kept in exact sync with the section renderers that actually know how to
// draw a given module (renderContact/renderCtaBanner/renderServiceAreas/
// renderServices/renderNewsletter/renderReservationCta/renderProductShowcase
// below), so an incompatible pairing is always rejected before it can ever
// reach a renderer that wouldn't know what to do with it.
const MODULE_SECTION_COMPATIBILITY = {
  contact: ['contact', 'ctaBanner', 'serviceAreas'],
  quote: ['services', 'contact', 'ctaBanner'],
  newsletter: ['newsletter', 'ctaBanner'],
  // 'ctaBanner' is included here (not just 'reservationCta'/'contact')
  // because CATEGORY_MODULE_RECIPE already places a booking module there
  // for the fitness/wellness/professional deterministic fallbacks, and
  // renderCtaBanner already has a real 'booking' case -- this map has to
  // agree with what's actually wired up, or the editor/Claude-planning
  // path would refuse a pairing the deterministic path (and the renderer)
  // already rely on working.
  booking: ['reservationCta', 'contact', 'ctaBanner'],
  location: ['contact', 'serviceAreas'],
  action: ['contact', 'ctaBanner', 'reservationCta', 'productShowcase'],
  product: ['productShowcase']
};
function moduleCompatibleTypesForSection(sectionType) {
  return MODULE_TYPE_KEYS.filter(t => (MODULE_SECTION_COMPATIBILITY[t] || []).includes(sectionType));
}
// The full catalogue of fields a module TYPE could ever expose -- labels and
// input kinds are fixed here (developer-authored), never supplied by Claude
// and never freely typed by the editor beyond a capped label string (see
// setModuleFieldLabel). `removable:false` marks a field no module of that
// type can ever be left without (name/email on a contact-style form, the
// requested date on a booking) -- enforced by removeModuleField/
// setModuleFieldRequired below, not just by the editor UI.
const MODULE_FIELD_ALLOWLIST = {
  contact: [
    { key: 'name', label: 'Name', kind: 'text', removable: false },
    { key: 'email', label: 'Email', kind: 'email', removable: false },
    { key: 'phone', label: 'Phone', kind: 'tel', removable: true },
    { key: 'message', label: 'Message', kind: 'textarea', removable: true }
  ],
  quote: [
    { key: 'name', label: 'Name', kind: 'text', removable: false },
    { key: 'email', label: 'Email', kind: 'email', removable: false },
    { key: 'phone', label: 'Phone', kind: 'tel', removable: true },
    { key: 'service', label: 'Service', kind: 'text', removable: true },
    { key: 'description', label: 'Project description', kind: 'textarea', removable: true },
    { key: 'preferredContact', label: 'Preferred contact method', kind: 'select', removable: true, options: ['Email', 'Phone'] }
  ],
  newsletter: [
    { key: 'email', label: 'Email', kind: 'email', removable: false },
    { key: 'name', label: 'Name', kind: 'text', removable: true }
  ],
  booking: [
    { key: 'name', label: 'Name', kind: 'text', removable: false },
    { key: 'email', label: 'Email', kind: 'email', removable: false },
    { key: 'phone', label: 'Phone', kind: 'tel', removable: true },
    { key: 'date', label: 'Requested date', kind: 'date', removable: false },
    { key: 'time', label: 'Requested time', kind: 'time', removable: true },
    { key: 'partySize', label: 'Party size / service', kind: 'text', removable: true },
    { key: 'notes', label: 'Notes', kind: 'textarea', removable: true }
  ],
  location: [], action: [], product: []
};
function getModuleFieldAllowlist(moduleType) { return MODULE_FIELD_ALLOWLIST[moduleType] || []; }
// The sane, real default subset (and order) a fresh module of each type
// starts with -- everything else in the allowlist is available as an
// addable optional field through the editor (addModuleField) or a
// Claude-planned `fields` list (see normalizeSectionModuleFromClaude).
const MODULE_DEFAULT_FIELD_KEYS = {
  contact: ['name', 'email', 'phone', 'message'],
  quote: ['name', 'email', 'phone', 'service', 'description'],
  newsletter: ['email', 'name'],
  booking: ['name', 'email', 'date', 'time', 'partySize', 'notes'],
  location: [], action: [], product: []
};
function defaultModuleFieldsFor(type) {
  const allow = getModuleFieldAllowlist(type);
  return (MODULE_DEFAULT_FIELD_KEYS[type] || []).map(k => {
    const def = allow.find(f => f.key === k);
    return def ? { key: def.key, label: def.label, kind: def.kind, options: def.options, required: def.removable === false } : null;
  }).filter(Boolean);
}
function defaultModuleCtaLabel(type) {
  switch (type) {
    case 'contact': return 'Send message';
    case 'quote': return 'Request a quote';
    case 'newsletter': return 'Subscribe';
    case 'booking': return 'Request booking';
    default: return 'Submit';
  }
}
// Never a claim that a message was actually delivered anywhere real -- see
// the 'preview' submission provider below, whose UI always appends an
// honest "preview mode" note alongside whatever message is configured here.
function defaultSuccessMessage(type) {
  switch (type) {
    case 'contact': return "Thanks — we've got your message and will be in touch soon.";
    case 'quote': return "Thanks — we'll review this and follow up with a quote.";
    case 'newsletter': return "You're subscribed.";
    case 'booking': return "Thanks — we'll confirm your request shortly.";
    default: return 'Thanks — we received that.';
  }
}
function defaultModuleConfig(type, proj) {
  switch (type) {
    // Grounded reuse of a REAL declared fact already on the project (see
    // extractLocation) -- never a fabricated address. Empty when the
    // business description never named a location; the location module
    // renders an honest, editable empty state in that case (see
    // renderLocationModuleWidget), not an invented placeholder address.
    case 'location': return { address: (proj && proj.source && proj.source.location) || '' };
    case 'action': return { actionKind: 'call', target: '' };
    case 'product': return { name: '', priceLabel: '', ctaLabel: 'View product', checkoutUrl: '' };
    default: return {};
  }
}
// A controlled, honest "not connected yet" record for a future real
// integration -- `connected` is never anything but false in this pass
// (there is no OAuth/API-key flow to actually connect one), so this is
// documentation of INTENT for a later pass, never a claim of a live wire-up.
const MODULE_INTEGRATION_DEFAULTS = { booking: 'calendly', product: 'shopify', location: 'google-maps', newsletter: 'mailchimp' };
const INTEGRATION_PROVIDER_KEYS = ['calendly', 'shopify', 'square', 'stripe', 'mailchimp', 'google-maps'];
function defaultIntegration(type) {
  const provider = MODULE_INTEGRATION_DEFAULTS[type] || null;
  return { provider, connected: false, note: provider ? `Connect ${humanizeEditorLabel(provider)} later to make this live.` : '' };
}
function createDefaultModule(type, proj) {
  return {
    type,
    enabled: true,
    fields: defaultModuleFieldsFor(type),
    config: defaultModuleConfig(type, proj),
    submitBehavior: { provider: 'preview' },
    successState: { message: defaultSuccessMessage(type) },
    integration: defaultIntegration(type)
  };
}

// ---- Module editor operations (all pure functions of the model, exactly
// like the V8.3 section/page operations above -- called only through
// runEditorAction) ----------------------------------------------------------
function setSectionModuleType(proj, pageId, sectionId, moduleType) {
  const page = findPageById(proj, pageId);
  const section = page && findSectionById(page, sectionId);
  if (!section) return false;
  if (!moduleCompatibleTypesForSection(section.type).includes(moduleType)) return false;
  section.module = createDefaultModule(moduleType, proj);
  return true;
}
function setSectionModuleEnabled(proj, pageId, sectionId, enabled) {
  const page = findPageById(proj, pageId);
  const section = page && findSectionById(page, sectionId);
  if (!section) return false;
  if (enabled) {
    if (section.module) { section.module.enabled = true; return true; }
    const compatible = moduleCompatibleTypesForSection(section.type);
    if (!compatible.length) return false;
    section.module = createDefaultModule(compatible[0], proj);
    return true;
  }
  if (!section.module) return false;
  section.module.enabled = false;
  return true;
}
function addModuleField(proj, pageId, sectionId, fieldKey) {
  const page = findPageById(proj, pageId);
  const section = page && findSectionById(page, sectionId);
  if (!section || !section.module) return false;
  const def = getModuleFieldAllowlist(section.module.type).find(f => f.key === fieldKey);
  if (!def) return false;
  if (section.module.fields.some(f => f.key === fieldKey)) return false;
  if (section.module.fields.length >= 8) return false;
  section.module.fields.push({ key: def.key, label: def.label, kind: def.kind, options: def.options, required: false });
  return true;
}
function removeModuleField(proj, pageId, sectionId, fieldKey) {
  const page = findPageById(proj, pageId);
  const section = page && findSectionById(page, sectionId);
  if (!section || !section.module) return false;
  const def = getModuleFieldAllowlist(section.module.type).find(f => f.key === fieldKey);
  if (def && def.removable === false) return false;
  const idx = section.module.fields.findIndex(f => f.key === fieldKey);
  if (idx === -1) return false;
  if (section.module.fields.length <= 1) return false; // never leave a module with zero fields
  section.module.fields.splice(idx, 1);
  return true;
}
function moveModuleField(proj, pageId, sectionId, fieldKey, direction) {
  const page = findPageById(proj, pageId);
  const section = page && findSectionById(page, sectionId);
  if (!section || !section.module) return false;
  const idx = section.module.fields.findIndex(f => f.key === fieldKey);
  if (idx === -1) return false;
  const target = idx + (direction === 'up' ? -1 : 1);
  if (target < 0 || target >= section.module.fields.length) return false;
  const [item] = section.module.fields.splice(idx, 1);
  section.module.fields.splice(target, 0, item);
  return true;
}
function setModuleFieldRequired(proj, pageId, sectionId, fieldKey, required) {
  const page = findPageById(proj, pageId);
  const section = page && findSectionById(page, sectionId);
  if (!section || !section.module) return false;
  const field = section.module.fields.find(f => f.key === fieldKey);
  if (!field) return false;
  const def = getModuleFieldAllowlist(section.module.type).find(f => f.key === fieldKey);
  if (def && def.removable === false && !required) return false; // an essential field can't be made optional
  field.required = !!required;
  return true;
}
function setModuleFieldLabel(proj, pageId, sectionId, fieldKey, label) {
  const page = findPageById(proj, pageId);
  const section = page && findSectionById(page, sectionId);
  if (!section || !section.module) return false;
  const field = section.module.fields.find(f => f.key === fieldKey);
  if (!field) return false;
  const safe = String(label || '').trim().slice(0, 60);
  if (!safe) return false;
  field.label = safe;
  return true;
}
function setModuleSuccessMessage(proj, pageId, sectionId, message) {
  const page = findPageById(proj, pageId);
  const section = page && findSectionById(page, sectionId);
  if (!section || !section.module) return false;
  section.module.successState = { message: String(message || '').trim().slice(0, 200) || defaultSuccessMessage(section.module.type) };
  return true;
}
const MODULE_CONFIG_KEYS = { location: ['address'], action: ['actionKind', 'target'], product: ['name', 'priceLabel', 'ctaLabel', 'checkoutUrl'] };
const ACTION_KIND_KEYS = ['call', 'email', 'directions', 'external-booking', 'external-store'];
function setModuleConfigValue(proj, pageId, sectionId, key, value) {
  const page = findPageById(proj, pageId);
  const section = page && findSectionById(page, sectionId);
  if (!section || !section.module) return false;
  const allowed = MODULE_CONFIG_KEYS[section.module.type] || [];
  if (!allowed.includes(key)) return false;
  const safeValue = String(value == null ? '' : value).trim();
  if (key === 'actionKind') {
    if (!ACTION_KIND_KEYS.includes(safeValue)) return false;
    section.module.config.actionKind = safeValue;
    // A phone number left over from 'call' is meaningless (and not
    // re-validated) as an email or URL once the kind changes -- clearing it
    // forces a deliberate re-entry for the new kind rather than letting
    // actionModuleTarget render a stale, wrong-shaped value as if it were
    // real (e.g. a "mailto:" link whose value is actually a phone number).
    section.module.config.target = '';
    return true;
  }
  if (key === 'target') {
    const kind = section.module.config.actionKind;
    if (kind === 'call' && safeValue && !validatePhone(safeValue)) return false;
    if (kind === 'email' && safeValue && !validateEmail(safeValue)) return false;
    if ((kind === 'external-booking' || kind === 'external-store') && safeValue && !validateUrl(safeValue)) return false;
    section.module.config.target = safeValue.slice(0, 300);
    return true;
  }
  if (key === 'checkoutUrl') {
    if (safeValue && !validateUrl(safeValue)) return false;
    section.module.config.checkoutUrl = safeValue.slice(0, 500);
    return true;
  }
  if (key === 'address') { section.module.config.address = safeValue.slice(0, 200); return true; }
  if (key === 'name' || key === 'priceLabel' || key === 'ctaLabel') { section.module.config[key] = safeValue.slice(0, key === 'name' ? 80 : 40); return true; }
  return false;
}
function setModuleIntegrationProvider(proj, pageId, sectionId, provider) {
  const page = findPageById(proj, pageId);
  const section = page && findSectionById(page, sectionId);
  if (!section || !section.module) return false;
  const safe = provider === '' || provider == null ? null : provider;
  if (safe !== null && !INTEGRATION_PROVIDER_KEYS.includes(safe)) return false;
  section.module.integration = { provider: safe, connected: false, note: safe ? `Connect ${humanizeEditorLabel(safe)} later to make this live.` : '' };
  return true;
}

// ---- CTA targeting ----------------------------------------------------------
// A structured target for a CTA button -- page/section navigation inside the
// current direction, or a real tel:/mailto:/external link -- so a CTA never
// has to overload an ambiguous raw string. Clicking any of these is always a
// pure client-side action (page switch, scroll, or a native <a href> the
// browser itself handles): never a new direction, never a Claude call, never
// an image request. See handleCtaTargetClick / the siteSectionsRoot listener.
const CTA_TARGET_KINDS = ['page', 'section', 'tel', 'mailto', 'external'];
function validateEmail(v) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v || '').trim()); }
function validatePhone(v) { const d = String(v || '').replace(/[^\d]/g, ''); return d.length >= 7 && d.length <= 15; }
function validateUrl(v) { try { const u = new URL(String(v || '').trim()); return u.protocol === 'http:' || u.protocol === 'https:'; } catch (e) { return false; } }
function normalizeCtaTarget(proj, raw) {
  if (!raw || typeof raw !== 'object' || !raw.kind) return null;
  if (!CTA_TARGET_KINDS.includes(raw.kind)) return null;
  if (raw.kind === 'page') { const page = findPageById(proj, raw.pageId); return page ? { kind: 'page', pageId: page.id } : null; }
  if (raw.kind === 'section') {
    const page = findPageById(proj, raw.pageId);
    const section = page && findSectionById(page, raw.sectionId);
    return section ? { kind: 'section', pageId: page.id, sectionId: section.id } : null;
  }
  if (raw.kind === 'tel') return validatePhone(raw.value) ? { kind: 'tel', value: String(raw.value).trim().slice(0, 40) } : null;
  if (raw.kind === 'mailto') return validateEmail(raw.value) ? { kind: 'mailto', value: String(raw.value).trim().slice(0, 180) } : null;
  if (raw.kind === 'external') return validateUrl(raw.value) ? { kind: 'external', value: String(raw.value).trim().slice(0, 500) } : null;
  return null;
}
function setSectionCtaTarget(proj, pageId, sectionId, rawTarget) {
  const page = findPageById(proj, pageId);
  const section = page && findSectionById(page, sectionId);
  if (!section) return false;
  if (!rawTarget || !rawTarget.kind) { section.ctaTarget = null; return true; }
  const normalized = normalizeCtaTarget(proj, rawTarget);
  if (!normalized) return false;
  section.ctaTarget = normalized;
  return true;
}
function setHeroCtaTarget(proj, rawTarget) {
  if (!rawTarget || !rawTarget.kind) { proj.copy.ctaTarget = null; return true; }
  const normalized = normalizeCtaTarget(proj, rawTarget);
  if (!normalized) return false;
  proj.copy.ctaTarget = normalized;
  return true;
}

// ---- Field-level validation (shared by the live preview form and, in
// spirit, by whatever real backend eventually receives this payload) -------
const MODULE_FIELD_MAX_LEN = { text: 120, email: 180, tel: 40, textarea: 1000, select: 60, date: 20, time: 20 };
function validateModuleField(field, rawValue) {
  const maxLen = MODULE_FIELD_MAX_LEN[field.kind] || 200;
  const value = String(rawValue == null ? '' : rawValue).slice(0, maxLen);
  if (field.required && !value.trim()) return { valid: false, error: `${field.label} is required.` };
  if (!value.trim()) return { valid: true, value: '' };
  if (field.kind === 'email' && !validateEmail(value)) return { valid: false, error: 'Enter a valid email address.' };
  if (field.kind === 'tel' && !validatePhone(value)) return { valid: false, error: 'Enter a valid phone number.' };
  if (field.kind === 'select' && field.options && !field.options.includes(value)) return { valid: false, error: 'Choose a valid option.' };
  return { valid: true, value };
}
// Rejects unexpected keys by construction -- only ever iterates the
// module's OWN configured fields, so a payload can never carry more than
// what the form itself declared.
function validateModuleSubmission(module, rawValues) {
  const errors = {}, values = {};
  (module.fields || []).forEach(f => {
    const r = validateModuleField(f, rawValues ? rawValues[f.key] : '');
    if (!r.valid) errors[f.key] = r.error; else values[f.key] = r.value;
  });
  return { valid: Object.keys(errors).length === 0, errors, values };
}

// ---- Submission provider abstraction ---------------------------------------
// Renderers only ever display a module; submission behavior is isolated
// here, behind the same {name, ...} shape the image/Claude-plan providers
// in server.js already use, so a future real backend or external
// integration provider can register alongside 'preview' without any
// renderer or editor code changing. Today only 'preview' exists -- see
// SITE-PROJECT-V8.4.md for why a mock, clearly-labeled client-side
// provider was chosen over standing up a new server endpoint this pass
// (no real inbox/backend exists yet to receive a submission honestly).
const MODULE_SUBMIT_PROVIDERS = {
  preview: {
    name: 'preview',
    async submit(module, payload) {
      await new Promise(resolve => setTimeout(resolve, 450)); // real async boundary, not an instant fake
      return { ok: true, preview: true };
    }
  }
};
function resolveModuleProvider(module) {
  const key = (module.submitBehavior && module.submitBehavior.provider) || 'preview';
  return MODULE_SUBMIT_PROVIDERS[key] || MODULE_SUBMIT_PROVIDERS.preview;
}
// The one function that ever "sends" a module submission. Never fakes a
// success it didn't get from the resolved provider, and never throws.
async function submitModule(module, payload, projectContext) {
  const provider = resolveModuleProvider(module);
  try {
    const result = await provider.submit(module, payload, projectContext);
    return result && typeof result === 'object' ? result : { ok: false, message: 'Submission failed.' };
  } catch (e) {
    return { ok: false, message: 'Could not submit right now.' };
  }
}

// ---- Deterministic functionality fallback ----------------------------------
// If Claude is unavailable, misconfigured, times out, or its module plan is
// invalid/empty, SiteRemade still ships a real, working, category-aware
// functionality module -- conservative by construction: it only ever
// attaches to a section type that's already compatible (see
// MODULE_SECTION_COMPATIBILITY), and the only section type this pass will
// ever CREATE from scratch is 'contact' (a business asking to be reached is
// never an invented fact); it never invents a menu/reservation/product
// section that would imply business facts nothing here has evidence for.
const CATEGORY_MODULE_RECIPE = {
  tech: [{ module: 'newsletter', into: ['newsletter', 'ctaBanner'] }, { module: 'contact', into: ['contact', 'ctaBanner'], createSectionType: 'contact' }],
  finance: [{ module: 'quote', into: ['services', 'ctaBanner', 'contact'], createSectionType: 'contact' }],
  fashion: [{ module: 'newsletter', into: ['newsletter', 'ctaBanner'] }],
  // A hospitality direction's own deterministic section recipe (menu/
  // gallery/about/testimonialsGrid/reservationCta -- see
  // categorySectionRecipes.hospitality) never includes 'serviceAreas' or
  // 'contact', so a location entry with no createSectionType of its own
  // would be permanently dead here (same class of bug as the quote/booking
  // fix above) -- a real business's address is exactly the kind of grounded,
  // non-fabricated fact worth a fresh section for, so 'location' carries
  // createSectionType here instead of a separate trailing 'contact' entry.
  hospitality: [{ module: 'booking', into: ['reservationCta', 'contact'] }, { module: 'location', into: ['serviceAreas', 'contact'], createSectionType: 'contact' }],
  creative: [{ module: 'contact', into: ['contact', 'ctaBanner'], createSectionType: 'contact' }],
  fitness: [{ module: 'booking', into: ['ctaBanner', 'contact'], createSectionType: 'contact' }],
  realestate: [{ module: 'contact', into: ['contact'], createSectionType: 'contact' }],
  wellness: [{ module: 'booking', into: ['ctaBanner', 'contact'], createSectionType: 'contact' }],
  retail: [{ module: 'newsletter', into: ['newsletter', 'ctaBanner'] }, { module: 'product', into: ['productShowcase'] }],
  nonprofit: [{ module: 'contact', into: ['contact'], createSectionType: 'contact' }, { module: 'newsletter', into: ['newsletter', 'ctaBanner'] }],
  professional: [{ module: 'booking', into: ['ctaBanner', 'contact'], createSectionType: 'contact' }],
  education: [{ module: 'contact', into: ['contact'], createSectionType: 'contact' }],
  electrical: [{ module: 'quote', into: ['services', 'ctaBanner', 'contact'], createSectionType: 'contact' }],
  plumbing: [{ module: 'quote', into: ['services', 'ctaBanner', 'contact'], createSectionType: 'contact' }],
  landscaping: [{ module: 'quote', into: ['services', 'ctaBanner', 'contact'], createSectionType: 'contact' }],
  painting: [{ module: 'quote', into: ['services', 'ctaBanner', 'contact'], createSectionType: 'contact' }],
  roofing: [{ module: 'quote', into: ['services', 'ctaBanner', 'contact'], createSectionType: 'contact' }],
  automotive: [{ module: 'quote', into: ['services', 'ctaBanner', 'contact'], createSectionType: 'contact' }],
  cleaning: [{ module: 'quote', into: ['services', 'ctaBanner', 'contact'], createSectionType: 'contact' }],
  renovation: [{ module: 'quote', into: ['services', 'ctaBanner', 'contact'], createSectionType: 'contact' }],
  other: [{ module: 'contact', into: ['contact', 'ctaBanner'], createSectionType: 'contact' }]
};
function findFirstCompatibleSection(proj, intoTypes) {
  for (const page of proj.pages) {
    for (const section of page.sections) {
      if (intoTypes.includes(section.type) && !(section.module && section.module.enabled)) return section;
    }
  }
  return null;
}
// Called once per generated direction (both the Claude-planned and
// deterministic paths -- see buildGenerationPlan's 'sections' step). A
// no-op whenever a real module already exists anywhere on the site (Claude
// successfully planned one, or a prior pass already did) -- this never
// overrides real planned functionality with the generic fallback.
// Turns Claude's raw, already-schema-constrained section.module payload
// (see server.js WEBSITE_PLAN_TOOL) into a real module object -- or null,
// silently dropped, if it names an unknown type, a type incompatible with
// this section (defense in depth on top of the JSON Schema enum), or ends
// up with no usable fields. Field LABELS/KINDS always come from this
// file's own MODULE_FIELD_ALLOWLIST, never from Claude -- it only ever
// picks which allowlisted keys to include and which of those to mark
// required, plus a success-message string and a "someday" integration
// provider hint, all independently re-validated here.
function normalizeSectionModuleFromClaude(raw, sectionType) {
  if (!raw || typeof raw !== 'object') return null;
  const type = claudeEnum(raw.type, MODULE_TYPE_KEYS, null);
  if (!type) return null;
  if (!(MODULE_SECTION_COMPATIBILITY[type] || []).includes(sectionType)) return null;
  const allowlist = getModuleFieldAllowlist(type);
  const allowedKeys = allowlist.map(f => f.key);
  const requestedKeys = Array.isArray(raw.fields) ? raw.fields.filter(k => typeof k === 'string' && allowedKeys.includes(k)) : [];
  const requiredKeys = Array.isArray(raw.requiredFields) ? raw.requiredFields.filter(k => typeof k === 'string' && allowedKeys.includes(k)) : [];
  const mustHave = allowlist.filter(f => f.removable === false).map(f => f.key);
  const finalKeys = Array.from(new Set([...mustHave, ...requestedKeys])).slice(0, 8);
  const fields = finalKeys.length
    ? finalKeys.map(k => {
        const def = allowlist.find(f => f.key === k);
        return { key: k, label: def.label, kind: def.kind, options: def.options, required: def.removable === false ? true : requiredKeys.includes(k) };
      })
    : defaultModuleFieldsFor(type);
  const successMessage = claudeStr(raw.successMessage, 200) || defaultSuccessMessage(type);
  const integrationProvider = claudeEnum(raw.integrationProvider, INTEGRATION_PROVIDER_KEYS, MODULE_INTEGRATION_DEFAULTS[type] || null);
  return {
    type,
    enabled: true,
    fields,
    config: {}, // deterministic per-type defaults (address/actionKind/product fields) are filled in once the real project object exists -- see ensureFunctionalityDefaults' hasAnyModule skip and createDefaultModule's own callers; a Claude-planned module never fabricates config values itself
    submitBehavior: { provider: 'preview' },
    successState: { message: successMessage },
    integration: { provider: integrationProvider, connected: false, note: integrationProvider ? `Connect ${humanizeEditorLabel(integrationProvider)} later to make this live.` : '' }
  };
}
function ensureFunctionalityDefaults(proj, categoryKey) {
  if (!proj || !Array.isArray(proj.pages) || !proj.pages.length) return;
  // Backfill grounded config defaults (e.g. a location module's real,
  // already-declared address) for any module a Claude plan already created
  // -- normalizeSectionModuleFromClaude runs before the real project object
  // exists, so it always leaves config empty; this is the one place that
  // can safely reuse a real declared fact. Never overwrites a config that
  // already has values (an editor edit, or a prior call here).
  proj.pages.forEach(p => (p.sections || []).forEach(s => {
    if (s.module && s.module.enabled && s.module.config && Object.keys(s.module.config).length === 0) {
      const filled = defaultModuleConfig(s.module.type, proj);
      if (Object.keys(filled).length) s.module.config = filled;
    }
  }));
  const recipe = CATEGORY_MODULE_RECIPE[categoryKey] || CATEGORY_MODULE_RECIPE.other;
  const hasAnyModule = proj.pages.some(p => (p.sections || []).some(s => s.module && s.module.enabled));
  if (hasAnyModule) return;
  const homePage = proj.pages[0];
  recipe.forEach(entry => {
    const targetSection = findFirstCompatibleSection(proj, entry.into);
    if (targetSection) { targetSection.module = createDefaultModule(entry.module, proj); return; }
    if (entry.createSectionType) {
      const type = entry.createSectionType;
      if (homePage.sections.some(s => s.type === type)) return; // already has one, just not compatible/available (shouldn't happen, defensive)
      const variant = pickVariant(type, proj.design.dimensions, (proj.intent && proj.intent.variationSeed) || 0);
      homePage.sections.push({ id: newSectionId(type), type, variant, copy: null, module: createDefaultModule(entry.module, proj) });
    }
  });
}

// ---- Undo / redo -------------------------------------------------------------
// Bounded, whole-project immutable snapshots -- not fragile partial inverse
// operations. Keyed by the direction OBJECT's own identity via a WeakMap
// (not an array index, not a serialized id) so: (a) each direction gets its
// own independent history for free, with no explicit reset code needed
// anywhere switchDirection/finishGeneration/loadProjectFromStorage already
// run, because a freshly-admitted or freshly-restored direction is always a
// brand-new object the WeakMap has never seen -- satisfying "generation
// completion/restoring a saved project establishes a fresh baseline"
// without a single extra line at either of those call sites; (b) direction
// switching itself is not and cannot become an undo event, because nothing
// about switching ever touches this WeakMap; and (c) a direction's history
// is automatically released for GC once nothing else references that
// direction object any more (e.g. after loading a different saved project
// replaces `directions` with entirely new objects) -- a plain Map would
// leak every superseded direction's snapshots for the rest of the session.
const EDITOR_UNDO_LIMIT = 40;
const editorHistory = new WeakMap();
function getEditorHistory(proj) {
  if (!proj) return { undo: [], redo: [] };
  if (!editorHistory.has(proj)) editorHistory.set(proj, { undo: [], redo: [] });
  return editorHistory.get(proj);
}
// A project's own shape is already guaranteed plain/serializable (it is
// saved to localStorage as JSON today), so a JSON round-trip is an exact,
// simple, dependency-free deep clone -- no shared references with the live
// project survive it.
function snapshotProjectForUndo(proj) { return JSON.parse(JSON.stringify(proj)); }
function pushEditorUndoSnapshot() {
  if (!project) return;
  const h = getEditorHistory(project);
  h.undo.push(snapshotProjectForUndo(project));
  if (h.undo.length > EDITOR_UNDO_LIMIT) h.undo.shift();
  h.redo = []; // a fresh edit always invalidates whatever redo branch existed
}
// Replaces the ACTIVE direction object's own contents in place (never
// reassigns `directions[activeDirectionIndex]` or `project` to a new
// reference) so every piece of the app that depends on that identity --
// direction switching, the V8.1.2 rollback invariant, this very WeakMap --
// keeps working unchanged.
function applyRestoredSnapshot(snapshot) {
  Object.keys(project).forEach(k => { delete project[k]; });
  Object.assign(project, snapshot);
  syncActivePageSections(project);
  renderProject(project);
  persistDirectionsSilently();
  // Never requests anything the snapshot's own restored assets.generated
  // cache doesn't already justify -- resolveImagePlanAssets' own dedupe
  // check (matching cacheKey + ready/pending) means restoring a snapshot
  // that already had an image resolved reuses it, exactly like restoring a
  // saved project does today.
  resolveImagePlanAssets(project);
}
function editorUndo() {
  if (!project || generationInFlight) return false;
  const h = getEditorHistory(project);
  if (!h.undo.length) return false;
  const current = snapshotProjectForUndo(project);
  const previous = h.undo.pop();
  h.redo.push(current);
  if (h.redo.length > EDITOR_UNDO_LIMIT) h.redo.shift();
  applyRestoredSnapshot(previous);
  return true;
}
function editorRedo() {
  if (!project || generationInFlight) return false;
  const h = getEditorHistory(project);
  if (!h.redo.length) return false;
  const current = snapshotProjectForUndo(project);
  const next = h.redo.pop();
  h.undo.push(current);
  if (h.undo.length > EDITOR_UNDO_LIMIT) h.undo.shift();
  applyRestoredSnapshot(next);
  return true;
}
// The one entry point every editor UI action goes through: snapshot first
// (so it's always undoable), run the pure model mutation, and only render/
// persist/request-images if the mutation actually succeeded -- a refused
// edit (an invalid id, a guardrail like "Home can't be removed") pops its
// own just-pushed snapshot back off rather than leaving a no-op entry in
// undo history. `imagesMayChange` is passed by callers whose mutation could
// plausibly add or drop a real image-bearing slot (see buildImagePlan);
// resolveImagePlanAssets' own cache-key check makes calling it a safe no-op
// whenever nothing actually changed.
function runEditorAction(mutateFn, imagesMayChange) {
  if (!project || generationInFlight) return false;
  pushEditorUndoSnapshot();
  const result = mutateFn();
  if (!result) {
    const h = getEditorHistory(project);
    h.undo.pop();
    return false;
  }
  renderProject(project);
  persistDirectionsSilently();
  if (imagesMayChange) resolveImagePlanAssets(project);
  return true;
}

// ==========================================================================
// GENERATION CONTROL PLANE -- decides what work a request actually needs
// before anything expensive runs. SiteRemade's editor controls (color,
// spacing, typography pickers, drag-reorder, device toggle, section
// toggles) already ran entirely through `runEditorAction` with zero network
// calls -- that part of "SiteRemade does the work itself" was already true.
// The one real gap the audit found: the free-text refine box
// (`applyRefinementRequest` below) always tried Claude FIRST and only fell
// back to the already-existing local/deterministic classifier
// (`buildLocalRefinementPlan`) on failure -- so a request a local pattern
// could fully handle (e.g. "make it darker") still paid for a Claude call
// whenever one was configured. `classifyRefinementRequest` fixes the
// ordering: classify first, run locally when confident, and reach the
// network only for a task type that genuinely needs reasoning (a rewrite,
// an audience/positioning change, or free text no local pattern matches).
// ExecutionPlan is deliberately a SEPARATE object from a WebsiteProject/
// GenerationPlan (buildGenerationPlan's own return shape) -- see the
// architecture-pass brief part 2: "what the website should be" vs "what
// expensive work needs to happen to produce it."
const TASK_TYPES = ['NEW_SITE', 'NEW_DIRECTION', 'COPY_REWRITE', 'COPY_TARGET_CHANGE', 'SECTION_REORDER', 'STYLE_CHANGE', 'COLOR_CHANGE', 'TYPOGRAPHY_CHANGE', 'LAYOUT_CHANGE', 'IMAGE_REGENERATE', 'IMAGE_ADD', 'IMAGE_REMOVE', 'PAGE_ADD', 'PAGE_REMOVE', 'SECTION_ADD', 'SECTION_REMOVE', 'CONTENT_EDIT', 'RESPONSIVE_FIX', 'QUALITY_REPAIR'];
// Kept in sync with server.js's OPERATION_COST_CLASS, same mirroring
// convention this file already uses for every CLAUDE_*_KEYS enum. Cost
// CLASS only -- no dollar amounts anywhere in this pass (see brief part 12).
const TASK_COST_CLASS = {
  NEW_SITE: 'standard', NEW_DIRECTION: 'standard',
  COPY_REWRITE: 'cheap', COPY_TARGET_CHANGE: 'cheap', QUALITY_REPAIR: 'cheap',
  IMAGE_REGENERATE: 'standard', IMAGE_ADD: 'standard',
  SECTION_REORDER: 'free', STYLE_CHANGE: 'free', COLOR_CHANGE: 'free', TYPOGRAPHY_CHANGE: 'free',
  LAYOUT_CHANGE: 'free', IMAGE_REMOVE: 'free', PAGE_ADD: 'free', PAGE_REMOVE: 'free',
  SECTION_ADD: 'free', SECTION_REMOVE: 'free', CONTENT_EDIT: 'free', RESPONSIVE_FIX: 'free'
};
function buildExecutionPlan(taskType, overrides) {
  return {
    taskType,
    needsClaude: false,
    needsImageGeneration: false,
    reuseExistingAssets: true,
    deterministicOperations: [],
    costClass: TASK_COST_CLASS[taskType] || 'standard',
    ...(overrides || {})
  };
}
// Free text shaped like a real strategy/audience/copy change -- checked
// BEFORE the deterministic pattern match below, and always escalates, even
// if a coincidental deterministic pattern also happens to match. This is
// the brief's own worked example: "rewrite this for commercial clients
// instead of homeowners" must reach real reasoning, not a design-dimension
// tweak.
const REASONING_REQUIRED_PATTERNS = [
  // Broadened beyond the original "for X clients"/"audience"/"targeting"
  // phrasing to also catch the brief's own worked example verbatim
  // ("change this roofing site from residential homeowners to commercial
  // property managers") -- a generic "from <audience> to <audience>" shift
  // naming a real audience-type noun on either side, without requiring the
  // literal word "clients".
  { taskType: 'COPY_TARGET_CHANGE', test: /\bfor (commercial|residential|enterprise|consumer|business|b2b|b2c)\b.*\bclients?\b|\baudience\b|\btarget(ing)? (customer|market|client)|\bfrom\b.{0,40}\bto\b.{0,60}(homeowners?|clients?|customers?|managers?|owners?|businesses?|residents?|tenants?|consumers?|enterprises?|professionals?)\b/i },
  { taskType: 'COPY_REWRITE', test: /\brewrite\b|\brewritten\b|\bdifferent (tone|voice|angle)\b|\bmore (professional|casual|formal|technical)\b|\bpositioning\b|\bfrom .+ to .+ clients?\b/i }
];
// Deterministic, in-vocabulary color-word -> real colorBehavior mapping
// (control-plane pass, test scenario B: "make the accent blue" must resolve
// with zero AI calls). This system has exactly 4 real colorBehavior modes
// -- there is no literal hue/hex system anywhere in the renderer or CSS --
// so this maps common color/tone words onto the closest existing mode
// rather than inventing new visual capability. Deliberately honest about
// its limits: a color word outside this list falls through and the request
// still safely escalates to Claude (or a no-op local plan) rather than
// silently doing nothing while claiming success.
const COLOR_WORD_TO_BEHAVIOR = {
  blue: 'high-contrast-mono-accent', teal: 'high-contrast-mono-accent', purple: 'high-contrast-mono-accent',
  cool: 'high-contrast-mono-accent', bold: 'high-contrast-mono-accent', tech: 'high-contrast-mono-accent',
  orange: 'warm-earth-multi-tone', warm: 'warm-earth-multi-tone', earthy: 'warm-earth-multi-tone', terracotta: 'warm-earth-multi-tone',
  black: 'dark-luxury-metallic', gold: 'dark-luxury-metallic', dark: 'dark-luxury-metallic', metallic: 'dark-luxury-metallic',
  grey: 'neutral-single-accent', gray: 'neutral-single-accent', neutral: 'neutral-single-accent', monochrome: 'neutral-single-accent'
};
// Generic "move <section keyword> before/after <section keyword>" detector
// (control-plane pass, test scenario C: "move testimonials before services"
// must resolve with zero AI calls). The pre-existing rule below only ever
// recognized the single specific phrase "about above services"; this covers
// the general case for any pair of known section-type keywords so an
// arbitrary deterministic reorder request doesn't fall through to Claude.
const SECTION_TYPE_KEYWORDS = [
  { type: 'testimonialsGrid', re: /testimonials?/i }, { type: 'services', re: /\bservices?\b/i },
  { type: 'about', re: /\babout\b/i }, { type: 'gallery', re: /\b(gallery|portfolio)\b/i },
  { type: 'team', re: /\bteam\b/i }, { type: 'pricing', re: /\b(pricing|tiers?)\b/i },
  { type: 'faq', re: /\bfaq\b|frequently asked/i }, { type: 'process', re: /\bprocess\b|how it works/i },
  { type: 'menu', re: /\bmenu\b/i }, { type: 'contact', re: /\bcontact\b/i },
  { type: 'features', re: /\bfeatures?\b/i }, { type: 'productShowcase', re: /\bproduct\b/i },
  { type: 'integrations', re: /\bintegrations?\b/i }, { type: 'newsletter', re: /\bnewsletter\b/i },
  { type: 'ctaBanner', re: /\bcta\b|call.?to.?action/i }, { type: 'reservationCta', re: /\b(reservation|booking)\b/i },
  { type: 'serviceAreas', re: /service areas?/i }
];
function matchSectionTypeKeyword(phrase) {
  const hit = SECTION_TYPE_KEYWORDS.find(entry => entry.re.test(phrase));
  return hit ? hit.type : null;
}
function detectGenericSectionMove(text, page) {
  if (!page) return null;
  const beforeMatch = text.match(/move\s+(.+?)\s+(before|above|ahead of)\s+(.+)/i);
  const afterMatch = !beforeMatch && text.match(/move\s+(.+?)\s+(after|below)\s+(.+)/i);
  const m = beforeMatch || afterMatch;
  if (!m) return null;
  const fromType = matchSectionTypeKeyword(m[1]);
  const toType = matchSectionTypeKeyword(m[3]);
  if (!fromType || !toType || fromType === toType) return null;
  const source = page.sections.find(s => s.type === fromType);
  const target = page.sections.find(s => s.type === toType);
  if (!source || !target) return null;
  if (beforeMatch) return { action: 'move-section', targetId: source.id, beforeId: target.id };
  const idx = page.sections.findIndex(s => s.id === target.id);
  const nextSection = page.sections[idx + 1];
  return { action: 'move-section', targetId: source.id, beforeId: nextSection ? nextSection.id : target.id };
}
// Labels a CONFIDENT local plan for the ledger/observability only -- it
// never affects what actually executes (`applyLocalRefinementPlan` already
// does that, unchanged). Order matters: image actions and page/section
// structure changes are checked before the generic 'change-design' bucket,
// which covers both pure style AND layout-shaped dimensions.
function inferLocalTaskType(localPlan) {
  if (localPlan.imageActions && localPlan.imageActions.length) {
    return localPlan.imageActions.some(a => a.action === 'regenerate') ? 'IMAGE_REGENERATE' : 'IMAGE_ADD';
  }
  const actions = (localPlan.operations || []).map(o => o.action);
  if (actions.includes('add-page')) return 'PAGE_ADD';
  if (actions.includes('move-section')) return 'SECTION_REORDER';
  if (actions.includes('add-section') || actions.includes('replace-section')) return 'SECTION_ADD';
  if (actions.includes('change-footer') || actions.includes('change-variant')) return 'LAYOUT_CHANGE';
  const designChange = localPlan.operations.find(o => o.action === 'change-design');
  if (designChange) {
    if (designChange.changes && designChange.changes.colorBehavior) return 'COLOR_CHANGE';
    return 'STYLE_CHANGE';
  }
  return 'CONTENT_EDIT';
}
// The real classifier: local-first, Claude only when genuinely needed.
function classifyRefinementRequest(text) {
  const trimmed = String(text || '').trim();
  const localPlan = buildLocalRefinementPlan(trimmed);
  for (const rule of REASONING_REQUIRED_PATTERNS) {
    if (rule.test.test(trimmed)) {
      return { executionPlan: buildExecutionPlan(rule.taskType, { needsClaude: true }), localPlan };
    }
  }
  // NOTE: imageActions is a separate array from operations (see
  // buildLocalRefinementPlan) -- a request that ONLY produces an image
  // action (e.g. "regenerate the hero image", test scenario E) has
  // operations.length === 0, so this must check both, not just operations,
  // or a pure image-regenerate request would wrongly fall through to the
  // Claude-escalation branch below.
  if (localPlan.operations.length || localPlan.imageActions.length) {
    const taskType = inferLocalTaskType(localPlan);
    return {
      executionPlan: buildExecutionPlan(taskType, {
        needsClaude: false,
        needsImageGeneration: localPlan.imageActions.length > 0,
        deterministicOperations: localPlan.operations.map(o => o.action)
      }),
      localPlan
    };
  }
  // No confident local match -- genuinely ambiguous free text. Escalating
  // is the honest choice here (matches every request this app already
  // supported before this pass); it is not the common case in practice,
  // since most real refinement requests hit a local pattern or a
  // reasoning-required one above.
  return { executionPlan: buildExecutionPlan('CONTENT_EDIT', { needsClaude: true }), localPlan };
}

function buildLocalRefinementPlan(request) {
  const text = String(request || '').toLowerCase();
  const page = project && project.pages && project.pages[project.activePageIndex];
  const operations = [];
  const imageActions = [];
  if (/premium|luxury|elevated/.test(text)) operations.push({ action: 'change-design', changes: { colorBehavior: 'dark-luxury-metallic', spacing: 'airy', card: 'bordered' } });
  if (/darker|darken|less blue|less corporate/.test(text)) operations.push({ action: 'change-design', changes: { colorBehavior: /less blue/.test(text) ? 'warm-earth-multi-tone' : 'dark-luxury-metallic' } });
  if (/hero.*(boring|visual|dramatic)|more visual/.test(text)) {
    operations.push({ action: 'change-design', changes: { hero: 'fullbleed-image', imageDominance: 'dominant', imageStrategy: 'photography-led' } });
    imageActions.push({ action: 'regenerate', slot: 'hero' });
  }
  // Plain "regenerate the X image" request (control-plane pass, test
  // scenario E) -- distinct from the hero-boring/dramatic rule above, which
  // also changes the hero LAYOUT. A bare regenerate request changes nothing
  // about the design, it only asks for one new asset in an existing slot.
  if (!imageActions.some(a => a.action === 'regenerate') && /\b(regenerate|redo|refresh|new)\b.*\b(image|photo|picture)\b|\bregenerate\b/i.test(text)) {
    const roleWord = ['hero', 'about', 'product', 'team', 'gallery', 'logo'].find(w => new RegExp(`\\b${w}\\b`, 'i').test(text));
    if (roleWord) imageActions.push({ action: 'regenerate', slot: roleWord });
  }
  if (/more (photo|imagery|images)|add.*imagery/.test(text)) {
    operations.push({ action: 'add-section', sectionType: 'gallery' });
    operations.push({ action: 'change-design', changes: { imageArrangement: 'mosaic', imageDominance: 'dominant' } });
    imageActions.push({ action: 'plan-new-slots', role: 'gallery' });
  }
  if (/replace.*(testimonial|weakest)|don't like.*section/.test(text)) {
    const target = page && page.sections.find(section => /testimonial/.test(section.type));
    if (target) operations.push({ action: 'replace-section', targetId: target.id, sectionType: 'features' });
  }
  if (/about.*above.*services|move.*about/.test(text) && page) {
    const about = page.sections.find(section => section.type === 'about');
    const services = page.sections.find(section => section.type === 'services');
    if (about && services) operations.push({ action: 'move-section', targetId: about.id, beforeId: services.id });
  }
  if (/add.*(services )?page/.test(text)) operations.push({ action: 'add-page', label: 'Services' });
  if (/about.*editorial|editorial.*about/.test(text)) {
    const about = page && page.sections.find(section => section.type === 'about');
    if (about) operations.push({ action: 'change-variant', targetId: about.id, variant: 'split' });
  }
  if (/footer.*(refined|better)/.test(text)) operations.push({ action: 'change-footer', variant: 'columns' });
  // Generic color-word mapping -- only when no more-specific design rule
  // above already fired (premium/luxury/darker take precedence over a
  // loose color word match).
  if (!operations.some(op => op.action === 'change-design') && /\b(accent|colou?r|palette|tone)\b/i.test(text)) {
    const hueWord = Object.keys(COLOR_WORD_TO_BEHAVIOR).find(w => new RegExp(`\\b${w}\\b`, 'i').test(text));
    if (hueWord) operations.push({ action: 'change-design', changes: { colorBehavior: COLOR_WORD_TO_BEHAVIOR[hueWord] } });
  }
  // Generic section-move detector -- only when the specific "about above
  // services" rule above didn't already produce one, to avoid a duplicate
  // move-section op for the same request.
  if (!operations.some(op => op.action === 'move-section') && page) {
    const generic = detectGenericSectionMove(text, page);
    if (generic) operations.push(generic);
  }
  return { scope: operations.length > 1 ? 'site' : 'section', operations, imageActions, explanation: operations.length ? 'Applied a scoped structured refinement to the current direction.' : 'No supported scoped change was detected.' };
}

function applyLocalRefinementPlan(plan) {
  if (!project || !plan || !Array.isArray(plan.operations)) return false;
  let imagesMayChange = false;
  const changed = runEditorAction(() => {
    const page = project.pages[project.activePageIndex];
    for (const operation of plan.operations) {
      if (operation.action === 'change-design') {
        project.design.dimensions = { ...project.design.dimensions, ...operation.changes };
        if (operation.changes.imageStrategy || operation.changes.imageDominance) {
          project.intent.creativeDirection = { ...(project.intent.creativeDirection || {}), imageStrategy: operation.changes.imageStrategy || project.intent.creativeDirection.imageStrategy };
          project.intent.imageRevisions = project.intent.imageRevisions || {};
          project.intent.imageRevisions.hero = (project.intent.imageRevisions.hero || 0) + 1;
          imagesMayChange = true;
        }
        // CREATIVE DIRECTOR V2: same shape as the imageStrategy handling
        // above -- a genuine creative-direction refinement (from a real
        // Claude call, only ever reached once classifyRefinementRequest
        // already decided reasoning was needed) can actually change the
        // resolved posture, not just be stored and ignored. renderProject
        // (called once after every operation, below) re-derives page-
        // rhythm/hero-strategy-driven rendering from this on its own.
        if (operation.changes.heroStrategy || operation.changes.pageRhythm) {
          const existing = project.intent.creativeDirection || {};
          project.intent.creativeDirection = {
            ...existing,
            heroStrategy: operation.changes.heroStrategy || existing.heroStrategy,
            pageRhythm: operation.changes.pageRhythm || existing.pageRhythm
          };
        }
      } else if (operation.action === 'add-section') {
        if (!page.sections.some(section => section.type === operation.sectionType)) insertSection(project, operation.sectionType);
        imagesMayChange = true;
      } else if (operation.action === 'replace-section') {
        const target = findSectionById(page, operation.targetId);
        if (!target) return false;
        target.type = operation.sectionType;
        target.variant = pickVariant(operation.sectionType, project.design.dimensions, project.intent.variationSeed);
        target.copy = null;
        imagesMayChange = true;
      } else if (operation.action === 'remove-section') {
        if (!removeSection(project, page.id, operation.targetId)) return false;
        imagesMayChange = true;
      } else if (operation.action === 'edit-copy') {
        const target = findSectionById(page, operation.targetId);
        if (!target) return false;
        target.copy = { ...(target.copy || {}), ...operation.changes };
      } else if (operation.action === 'move-section') {
        const targetIndex = findSectionIndex(page, operation.beforeId);
        if (!moveSection(project, page.id, operation.targetId, targetIndex)) return false;
      } else if (operation.action === 'change-variant') {
        const target = findSectionById(page, operation.targetId);
        if (!target) return false;
        target.variant = operation.variant;
      } else if (operation.action === 'add-page') {
        const added = addPage(project, operation.label);
        if (!added) return false;
        added.sections.push({ id: newSectionId('services'), type: 'services', variant: 'described', copy: null });
      } else if (operation.action === 'change-footer') {
        project.footerVariant = operation.variant;
      } else return false;
    }
    return true;
  }, imagesMayChange);
  return changed;
}

function refinementContext() {
  if (!project) return {};
  return {
    source: { text: project.source.text, location: project.source.location, facts: project.source.facts },
    business: project.business,
    creativeDirection: project.intent && project.intent.creativeDirection,
    design: project.design.dimensions,
    pages: (project.pages || []).map(page => ({ id: page.id, slug: page.slug, label: page.label, sections: (page.sections || []).map(section => ({ id: section.id, type: section.type, variant: section.variant, copy: section.copy })) })),
    imagePlan: (project.imagePlan || []).map(entry => ({ slot: entry.slot, role: entry.role, page: entry.page, section: entry.section, aspectRatio: entry.aspectRatio, sourceType: entry.sourceType, status: project.assets.generated && project.assets.generated[entry.slot] && project.assets.generated[entry.slot].status }))
  };
}

function normalizeRefinementPlan(plan) {
  if (!plan || !Array.isArray(plan.operations)) return null;
  return {
    ...plan,
    operations: plan.operations.map(operation => {
      if (operation.action === 'insert-section') return { action: 'add-section', sectionType: operation.sectionType };
      if (operation.action === 'remove-section') return { action: 'remove-section', targetId: operation.targetId };
      if (operation.action === 'edit-copy') return { action: 'edit-copy', targetId: operation.targetId, changes: operation.changes || {} };
      if (operation.action === 'change-image-strategy') return { action: 'change-design', changes: { imageStrategy: operation.changes && operation.changes.imageStrategy, imageDominance: 'dominant' } };
      return operation;
    })
  };
}

async function applyRefinementRequest(request) {
  if (!project || generationInFlight || refinementInFlight || !String(request || '').trim()) return false;
  refinementInFlight = true;
  generationState = 'refining';
  try {
    if (refinementStatus) refinementStatus.textContent = 'Understanding request…';
    // Control plane: classify BEFORE any network call. A confident local
    // plan is applied directly with zero AI calls -- Claude is only reached
    // for a task type the classifier decided genuinely needs reasoning.
    const classification = classifyRefinementRequest(request);
    let plan = classification.executionPlan.needsClaude ? null : classification.localPlan;
    if (classification.executionPlan.needsClaude && window.__siteremadePlanMeter && window.__siteremadePlanMeter.planConfigured) {
      try {
        const response = await fetch('/api/refine-website', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ request, context: refinementContext(), taskType: classification.executionPlan.taskType, projectId: project.meta && project.meta.id })
        });
        const data = await response.json().catch(() => ({}));
        plan = normalizeRefinementPlan(data && data.ok ? data.plan : null);
      } catch (error) { plan = null; }
    }
    // A reasoning-required classification that Claude couldn't fulfill
    // (unconfigured or failed) still falls back to whatever the local
    // classifier found -- possibly nothing, but never worse than before
    // this pass.
    plan = plan || classification.localPlan || buildLocalRefinementPlan(request);
    if (!plan.operations.length) {
      if (refinementStatus) refinementStatus.textContent = 'That request needs a more specific supported change.';
      return false;
    }
    if (refinementStatus) refinementStatus.textContent = 'Updating your website…';
    const changed = applyLocalRefinementPlan(plan);
    if (!changed) return false;
    generationState = plan.imageActions && plan.imageActions.length ? 'refinement_images' : 'refinement_finalizing';
    await resolveImagePlanAssets(project, null, { taskType: classification.executionPlan.taskType });
    renderProject(project);
    if (refinementStatus) refinementStatus.textContent = 'Updated. Your next refinement can build on this version.';
    return true;
  } catch (error) {
    if (refinementStatus) refinementStatus.textContent = 'The refinement could not be applied.';
    return false;
  } finally {
    refinementInFlight = false;
    generationState = 'ready';
  }
}

// ---- WebsiteProject construction + rendering -----------------------------
function createProject(analysis, preserved, isDemoShell) {
  const category = categories[analysis.categoryKey] || categories.other;
  const seedKey = analysis.styleKey;
  const composed = composeStyleFromAnalysis(analysis.text, analysis.categoryKey, seedKey);
  const assets = (preserved && preserved.assets) ? { items: preserved.assets.items.slice(), generated: {} } : { items: [], generated: {} };
  assets.plan = planAssets(assets);
  const dimensions = { hero: composed.hero, type: composed.type, nav: composed.nav, card: composed.card, imagery: composed.imagery, cta: composed.cta, colorBehavior: composed.colorBehavior, motion: composed.motion, spacing: composed.spacing, pattern: composed.pattern };
  const facts = extractBusinessFacts(analysis.text);
  const descriptor = extractBusinessDescriptor(analysis.text);
  const composedSectionTypes = composeSections(category, dimensions, assets.plan, analysis.categoryKey, facts);
  const sections = composedSectionTypes.map((type, i) => {
    const grammar = planSectionGrammar(type, 'home', categoryDefaultArchetype[analysis.categoryKey] || 'service-business', i, composedSectionTypes.length);
    return { id: `${type}-${i}-${Date.now().toString(36)}`, type, variant: pickVariant(type, dimensions, 0), intent: grammar.intent, headlineRole: grammar.headlineRole };
  });
  // V6: prefer a name explicitly captured from THIS description (a fresh
  // Generate submission describing a different business should not keep
  // showing the previous one's name); otherwise keep whatever name already
  // existed (manual edits survive regeneration); otherwise a neutral
  // fallback -- the site identity is never left empty. See part 2 of
  // SITE-PROJECT-V6.md.
  const extractedName = extractBusinessName(analysis.text);
  const priorName = preserved && preserved.business && preserved.business.name;
  // V8.2: built directly in the page-aware shape -- a single Home page
  // carrying these content sections, with hero/footer handled as chrome by
  // the renderer (see renderSections/renderPageHeader). createProject is
  // only ever used for the neutral demo shell now (buildGenerationPlan
  // builds real directions itself, Claude-planned or deterministic), but
  // it stays consistent with that same shape rather than relying on the
  // migration shim for something freshly created.
  const homePage = { slug: '', label: 'Home', purpose: '', sections };
  const proj = {
    meta: { id: 'proj_' + Date.now().toString(36), createdAt: new Date().toISOString(), version: 'v7', isDemoShell: !!isDemoShell },
    source: { text: analysis.text, location: analysis.location, facts, descriptor },
    business: {
      name: extractedName || priorName || 'Your Business',
      categoryKey: analysis.categoryKey,
      tone: (preserved && preserved.business && preserved.business.tone) || 'professional'
    },
    intent: { seedKey, styleAlternates: analysis.styleAlternates, variationSeed: 0 },
    design: { palette: { ...composed.palette }, dimensions, heroLayout: (preserved && preserved.design && preserved.design.heroLayout) || 'split' },
    copy: buildCopy(category, analysis.categoryKey, analysis, descriptor),
    pages: [homePage],
    activePageIndex: 0,
    sections: homePage.sections,
    footerVariant: pickVariant('footer', dimensions, 0),
    assets,
    responsive: { device: (preserved && preserved.responsive && preserved.responsive.device) || 'desktop' }
  };
  // V9: additive, for shape consistency with the real directions
  // buildGenerationPlan produces -- the demo shell itself never reasons
  // about section grammar/page architecture (it's a single static preview
  // page, not a generated result).
  proj.strategy = inferStrategy(analysis.categoryKey, analysis.text, facts, descriptor);
  homePage.plan = { ...DEFAULT_PAGE_PLAN, visitorQuestion: (pageRoleMeta.home && pageRoleMeta.home.question) || '' };
  ensureAssetDrivenSections(proj);
  proj.imagePlan = buildImagePlan(proj, category);
  return proj;
}
function mix(hex, target, amount) { const a = hexToRgb(hex), b = hexToRgb(target); return rgbToHex(a.r + (b.r - a.r) * amount, a.g + (b.g - a.g) * amount, a.b + (b.b - a.b) * amount); }
function hexToRgb(hex) { const n = parseInt(hex.replace('#', ''), 16); return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }; }
function rgbToHex(r, g, b) { return '#' + [r, g, b].map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join(''); }
function updatePaletteFromProject(proj) {
  const { main, background, text, accent2 } = proj.design.palette;
  const dark = mix(main, '#000000', .55);
  const light = mix(main, '#ffffff', .76);
  const soft = mix(main, '#ffffff', .91);
  const bgDark = mix(background, '#000000', .18);
  const bgLight = mix(background, '#ffffff', .12);
  const textMuted = mix(text, background, .38);
  builderSite.style.setProperty('--site-accent', main);
  builderSite.style.setProperty('--site-accent-2', accent2 || main);
  builderSite.style.setProperty('--site-accent-dark', dark);
  builderSite.style.setProperty('--site-accent-light', light);
  builderSite.style.setProperty('--site-bg', background);
  builderSite.style.setProperty('--site-bg-dark', bgDark);
  builderSite.style.setProperty('--site-bg-light', bgLight);
  builderSite.style.setProperty('--site-text', text);
  builderSite.style.setProperty('--site-muted', textMuted);
  document.documentElement.style.setProperty('--picker-primary', main);
  document.documentElement.style.setProperty('--picker-dark', background);
  document.documentElement.style.setProperty('--picker-light', text);
  document.documentElement.style.setProperty('--picker-soft', soft);
}
const LAYOUT_LABELS = { split: 'Layout 1', center: 'Layout 2', poster: 'Layout 3' };

// V6: renderProject is now a thin composition of three real, independently
// callable phases -- applyDesignDataset (palette/typography-level CSS),
// renderSections (section HTML/content/imagery) and renderChrome (nav,
// summary chips, handoff + purchase cards, form/control mirrors). Ordinary
// refinement controls still just call renderProject(project) once, same as
// V5. The generation pipeline below calls the three phases separately,
// across real animation frames, so the *labelled progress steps correspond
// to real function calls* instead of a decorative timer -- see
// SITE-PROJECT-V6.md part 1.
function applyDesignDataset(proj) {
  const composed = proj.design.dimensions;
  builderSite.dataset.style = proj.intent.seedKey;
  // PLACEHOLDER/COMPOSITION FIX: keep the [data-hero="..."] CSS in sync
  // with whatever layout renderHero actually rendered (see its own
  // heroDisplayVariant override) -- otherwise a downgraded-to-text-only
  // hero would render 'hero-minimal' markup while every [data-hero=
  // "<original-variant>"] CSS rule kept applying, aimed at markup that no
  // longer exists on the page.
  builderSite.dataset.hero = composed.heroDisplayVariant || composed.hero;
  builderSite.dataset.type = composed.type;
  builderSite.dataset.nav = composed.nav;
  builderSite.dataset.card = composed.card;
  builderSite.dataset.imagery = composed.imagery;
  builderSite.dataset.cta = composed.cta;
  builderSite.dataset.colorBehavior = composed.colorBehavior;
  builderSite.dataset.motion = prefersReducedMotion() ? 'none' : composed.motion;
  builderSite.dataset.spacing = composed.spacing;
  builderSite.dataset.pattern = composed.pattern;
  builderSite.dataset.contentWidth = composed.contentWidth || 'contained';
  builderSite.dataset.imageDominance = composed.imageDominance || 'balanced';
  builderSite.dataset.imageArrangement = composed.imageArrangement || 'single';
  builderSite.dataset.sectionRhythm = composed.sectionRhythm || 'steady';
  builderSite.dataset.sectionAlignment = composed.sectionAlignment || 'left';
  builderSite.dataset.typographyScale = composed.typographyScale || 'standard';
  builderSite.dataset.headingWidth = composed.headingWidth || 'balanced';
  builderSite.dataset.cardDensity = composed.cardDensity || 'airy';
  builderSite.dataset.cardShape = composed.cardShape || 'soft';
  builderSite.dataset.splitRatio = composed.splitRatio || 'even';
  builderSite.dataset.layout = proj.design.heroLayout;
  // CREATIVE DIRECTOR V2: the page's overall density curve -- paired with
  // each section's own data-rhythm-position (set in renderSections) to
  // drive real per-position spacing (see styles.css), instead of every
  // dimension applying as one flat value across the whole page.
  builderSite.dataset.pageRhythm = (proj.intent && proj.intent.creativeDirection && proj.intent.creativeDirection.pageRhythm) || 'sparse-open-dense-mid';
  updatePaletteFromProject(proj);
}
function renderSections(proj, category) {
  const logoAsset = proj.assets.plan.logo ? proj.assets.items.find(a => a.id === proj.assets.plan.logo) : null;
  const businessDisplay = (proj.business.name || 'Your Business').trim().toUpperCase();
  siteBusiness.textContent = businessDisplay;
  if (logoAsset) {
    siteLogo.src = logoAsset.dataUrl;
    siteLogo.alt = `${proj.business.name} logo`;
    siteLogo.classList.add('active');
    siteBusiness.classList.add('logo-active');
  } else {
    siteLogo.removeAttribute('src');
    siteLogo.alt = '';
    siteLogo.classList.remove('active');
    siteBusiness.classList.remove('logo-active');
  }
  // V8.2: once a direction genuinely has more than one page, the nav
  // becomes real page links (still zero Claude/image calls -- see
  // switchPage). A single-page direction (the deterministic engine today,
  // or a one-page Claude plan) keeps the exact original decorative
  // content-type labels, unchanged.
  const pages = proj.pages || [];
  if (pages.length > 1 && siteNavLinks) {
    siteNavLinks.innerHTML = pages.map((p, i) => `<button type="button" class="site-nav-link${i === proj.activePageIndex ? ' active' : ''}" data-page-index="${i}">${escapeHtml(p.label || (i === 0 ? 'Home' : `Page ${i + 1}`))}</button>`).join('');
  } else if (siteNavLinks) {
    const navTypes = proj.sections.map(s => s.type).filter(t => t === 'services' || t === 'gallery' || t === 'about').slice(0, 3);
    siteNavLinks.innerHTML = navTypes.map(t => `<span>${escapeHtml(navLabelFor(t, proj.business.categoryKey))}</span>`).join('');
  }
  if (siteNavCta) siteNavCta.textContent = category.cta;

  const activePage = pages[proj.activePageIndex] || null;
  const isHome = !activePage || proj.activePageIndex === 0;
  const introHtml = isHome ? renderHero(proj, category) : renderPageHeader(proj, activePage, category);
  const contentHtml = proj.sections.map(s => renderSectionHTML(proj, s, category)).join('');
  const footerHtml = renderSiteFooter(proj, category, proj.footerVariant || 'simple');
  if (siteSectionsRoot) {
    siteSectionsRoot.innerHTML = introHtml + contentHtml + footerHtml;
    applySectionRhythmPositions(siteSectionsRoot, proj.sections, proj.intent && proj.intent.creativeDirection);
  }
}
// CREATIVE DIRECTOR V2 / OUTPUT QUALITY PASS: additive-only, same pattern
// as data-headline-role (Phase C) -- stamps data attributes onto the
// ALREADY-RENDERED `.site-section` elements, never wraps them in a new
// container (several existing CSS rules depend on `.site-section`'s direct
// children for CSS grid placement; a wrapper would silently break those).
// Each renderX section function returns exactly one top-level `.site-
// section...` element, in the same order as `proj.sections` -- confirmed
// by direct inspection of every renderSectionHTML case -- so a straight
// index zip is safe here.
//
// OUTPUT QUALITY PASS added `data-section-width`/`data-section-align`
// alongside the existing `data-rhythm-position`: the SAME contentWidth/
// sectionAlignment CSS values the global `data-content-width`/`data-
// section-alignment` dimensions already use (styles.css), now applied per
// section instead of once for the whole page -- reusing existing CSS
// values, adding no new dimension. `sectionAlignForSection` deliberately
// only ever returns '' or 'center' -- never 'split' -- because the
// existing `[data-section-alignment="split"] .site-section{display:grid;
// grid-template-columns:...}` rule assumes exactly a 2-child structure
// that only `about`'s own 'split' variant markup guarantees; forcing it
// onto an arbitrary section type could silently misplace its children.
function applySectionRhythmPositions(root, sections, creativeDirection) {
  const els = Array.prototype.filter.call(root.children, el => el.classList.contains('site-section'));
  const total = sections.length;
  const pageRhythm = (creativeDirection && creativeDirection.pageRhythm) || 'sparse-open-dense-mid';
  sections.forEach((s, i) => {
    const el = els[i];
    if (!el) return;
    const position = rhythmPositionForSection(s, i, total);
    el.dataset.rhythmPosition = position;
    const width = sectionWidthForSection(s, position, pageRhythm);
    if (width) el.dataset.sectionWidth = width; else delete el.dataset.sectionWidth;
    const align = sectionAlignForSection(s, position, pageRhythm);
    if (align) el.dataset.sectionAlign = align; else delete el.dataset.sectionAlign;
  });
}
// IMMERSIVE_SECTION_TYPES: sections whose whole job is to show something
// (imagery, a menu, a product) rather than explain or convert -- these are
// the ones a wider/edge-to-edge treatment actually benefits; a text-heavy
// section (about/faq/process/pricing/contact) stays contained regardless
// of rhythm so body copy never stretches to an unreadable line length.
const IMMERSIVE_SECTION_TYPES = ['gallery', 'imageLedEditorial', 'caseStudies', 'productShowcase', 'menu'];
function sectionWidthForSection(section, position, pageRhythm) {
  const immersive = IMMERSIVE_SECTION_TYPES.includes(section.type);
  if (pageRhythm === 'dense-proof-compressed') {
    // Tight, scannable, conversion-focused -- even an immersive section
    // stays no wider than 'wide', and the proof/close positions pull in
    // to 'contained' so the CTA reads as the obvious next step.
    if (position === 'proof' || position === 'close') return 'contained';
    return immersive ? 'wide' : 'contained';
  }
  if (pageRhythm === 'steady-editorial') {
    // Consistent, measured, few boxed sections -- the one real width
    // change is giving an immersive section real room; everything else
    // holds a single restrained measure throughout.
    return immersive ? 'wide' : 'contained';
  }
  if (pageRhythm === 'expressive-alternating') {
    // Stronger section contrast is the whole point here -- an immersive
    // section goes fully edge-to-edge, and the opening section gets extra
    // room even when it isn't immersive, for a real width contrast against
    // the contained sections that follow.
    if (immersive) return 'edge-to-edge';
    return position === 'open' ? 'wide' : 'contained';
  }
  // sparse-open-dense-mid (the default): a large, breathing opening, a
  // visually compressed/contained middle, a calm (contained) close.
  if (position === 'open') return immersive ? 'edge-to-edge' : 'wide';
  if (position === 'proof') return 'contained';
  return immersive ? 'wide' : 'contained';
}
function sectionAlignForSection(section, position, pageRhythm) {
  // A restrained editorial page reads its statement-shaped sections
  // (about/process/proof/the closing CTA) centered, the way a printed
  // editorial page centers a pull-quote -- never forced on a card-grid or
  // list-shaped section, which centering would make harder to scan.
  const STATEMENT_TYPES = ['about', 'process', 'proof', 'metrics', 'ctaBanner'];
  if (!STATEMENT_TYPES.includes(section.type)) return '';
  if (pageRhythm === 'steady-editorial') return 'center';
  if (position === 'close' && section.type === 'ctaBanner') return 'center';
  return '';
}
// CREATIVE DIRECTOR V2: a compact, real summary of the resolved creative
// direction (Mood/Design idea/Page behavior/Avoiding), using the real
// creativeDirection values already produced by composeCreativeDirection
// (Claude's own choice, or the signal-driven deterministic fallback) --
// never placeholder copy. humanizeToken only turns a-kebab-key into
// Title Case; the label maps below give the 3 fields that need real
// phrasing (rather than a raw enum key) a short, polished sentence.
function humanizeToken(str) {
  return String(str || '').split('-').map(w => w ? w.charAt(0).toUpperCase() + w.slice(1) : w).join(' ');
}
const CREATIVE_MOOD_LABELS = { restrained: 'Restrained', warm: 'Warm', cinematic: 'Cinematic, atmospheric', energetic: 'Energetic', precise: 'Precise', expressive: 'Expressive', 'quiet-luxury': 'Quiet, luxury' };
const PAGE_RHYTHM_LABELS = {
  'sparse-open-dense-mid': 'Sparse opening → denser middle → calm close',
  'steady-editorial': 'Even, restrained pacing throughout',
  'dense-proof-compressed': 'Tight and scannable, proof-forward',
  'expressive-alternating': 'Bold contrast between sections'
};
const AVOID_LABELS = { 'generic-cards': 'generic card grids', 'saas-cta-blocks': 'SaaS-style CTA blocks', 'rounded-cards': 'heavy rounded cards', 'bright-cheerful': 'bright, cheerful styling' };
function renderCreativeDirectionSummary(proj) {
  const panel = document.getElementById('creativeDirectionSummary');
  if (!panel) return;
  const cd = proj.intent && proj.intent.creativeDirection;
  if (!cd) { panel.hidden = true; return; }
  panel.hidden = false;
  const mood = document.getElementById('cdsMood');
  const idea = document.getElementById('cdsIdea');
  const rhythm = document.getElementById('cdsRhythm');
  const avoid = document.getElementById('cdsAvoid');
  if (mood) mood.textContent = CREATIVE_MOOD_LABELS[cd.visualMood] || humanizeToken(cd.visualMood);
  if (idea) idea.textContent = humanizeToken(cd.concept);
  if (rhythm) rhythm.textContent = PAGE_RHYTHM_LABELS[cd.pageRhythm] || humanizeToken(cd.pageRhythm);
  if (avoid) avoid.textContent = (cd.avoid && cd.avoid.length) ? cd.avoid.map(a => AVOID_LABELS[a] || humanizeToken(a)).join(', ') : 'Nothing specific';
}
function renderChrome(proj, category) {
  const logoAsset = proj.assets.plan.logo ? proj.assets.items.find(a => a.id === proj.assets.plan.logo) : null;
  const layoutLabel = LAYOUT_LABELS[proj.design.heroLayout] || 'Layout 1';
  summaryMode.textContent = `${proj.sections.length} sections · Composed`;
  summaryColor.textContent = proj.design.palette.main.toUpperCase();
  summaryLayout.textContent = layoutLabel;
  summaryIndustry.textContent = category.label;
  renderCreativeDirectionSummary(proj);

  const businessDisplayName = proj.business.name || 'Your Business';
  handoffTitle.textContent = businessDisplayName;
  handoffMeta.textContent = `${proj.design.palette.main.toUpperCase()} main · ${proj.design.palette.background.toUpperCase()} background · ${proj.design.palette.text.toUpperCase()} text · ${layoutLabel} · ${category.label}`;
  if (purchaseTitle) purchaseTitle.textContent = businessDisplayName;
  if (purchaseMeta) purchaseMeta.textContent = `${proj.design.palette.main.toUpperCase()} · ${layoutLabel} · ${category.label}`;
  if (proj.source.text) {
    handoffDescriptionNote.hidden = false;
    handoffDescriptionNote.textContent = `Based on: "${proj.source.text}"`;
    if (purchaseDescriptionNote) { purchaseDescriptionNote.hidden = false; purchaseDescriptionNote.textContent = `Based on: "${proj.source.text}"`; }
  } else {
    handoffDescriptionNote.hidden = true;
    handoffDescriptionNote.textContent = '';
    if (purchaseDescriptionNote) { purchaseDescriptionNote.hidden = true; purchaseDescriptionNote.textContent = ''; }
  }

  formBusiness.value = proj.business.name || 'Your Business';
  formDescription.value = proj.source.text || '';
  formDesignMode.value = (styles[proj.intent.seedKey] || {}).name || proj.intent.seedKey; // internal reference only, never shown to the customer
  formBrandColor.value = proj.design.palette.main.toUpperCase();
  formBackgroundColor.value = proj.design.palette.background.toUpperCase();
  formTextColor.value = proj.design.palette.text.toUpperCase();
  formLogoName.value = logoAsset ? (logoAsset.name || '') : '';
  formLogoData.value = logoAsset ? logoAsset.dataUrl : '';
  formLayout.value = layoutLabel;
  formIndustry.value = category.label;
  formSections.value = sectionsSummaryText(proj);

  // Mirror controls to project state (covers programmatic changes, e.g. Load project)
  businessName.value = proj.business.name || '';
  industrySelect.value = (proj.business.categoryKey in categories) ? proj.business.categoryKey : 'other';
  brandColor.value = proj.design.palette.main;
  backgroundColor.value = proj.design.palette.background;
  textColor.value = proj.design.palette.text;
  brandColorHex.textContent = proj.design.palette.main.toUpperCase();
  backgroundColorHex.textContent = proj.design.palette.background.toUpperCase();
  textColorHex.textContent = proj.design.palette.text.toUpperCase();
  $$('.layout-choice').forEach(b => b.classList.toggle('active', b.dataset.layout === proj.design.heroLayout));
  $$('#toneToggle button').forEach(b => b.classList.toggle('active', b.dataset.tone === proj.business.tone));
  if (sectionToggles) $$('input', sectionToggles).forEach(input => { input.checked = proj.sections.some(s => s.type === input.value); });
  builderDevice.classList.toggle('mobile', proj.responsive.device === 'mobile');
  $$('.device-toggle button').forEach(b => b.classList.toggle('active', b.dataset.device === proj.responsive.device));

  renderAssetPanels(proj);
}
// renderProject is what every ordinary refinement control calls -- it runs
// all three real phases in one synchronous pass (they're each cheap; this
// is unchanged from V5 behaviour for anything other than the generation
// pipeline itself, which calls the phases separately -- see runGeneration).
function renderProject(proj) {
  // V8.2: the sync boundary -- commits whatever proj.sections currently
  // points to back onto proj.pages[proj.activePageIndex] before anything
  // else reads proj.pages. Covers every existing single-page control that
  // still freely mutates proj.sections wholesale (toggleSection) or
  // in-place (the animated build steps), with zero changes needed at those
  // call sites. A no-op once things are already in sync (the common case).
  syncActivePageSections(proj);
  // V8.3: guarantees every page/section has a stable editor id before
  // anything (including the editor panel itself) reads proj.pages -- see
  // ensureEditorIds' own comment for why this is the one universal call
  // site that covers every existing project-construction path for free.
  ensureEditorIds(proj);
  const category = categories[proj.business.categoryKey] || categories.other;
  proj._visibleImageSlots = [];
  proj.assets.plan = planAssets(proj.assets);
  proj.imagePlan = buildImagePlan(proj, category);
  applyDesignDataset(proj);
  renderSections(proj, category);
  renderChrome(proj, category);
  renderEditorPanel(proj, category);
  lifecycle.projectKind = isDemoProject(proj) ? 'demo' : 'real';
}
function renderAssetPanels(proj) {
  const byType = t => proj.assets.items.filter(a => a.type === t);
  const thumbHtml = a => `<div class="asset-thumb"><img src="${a.dataUrl}" alt="" /><button type="button" class="asset-thumb-remove" data-asset-id="${a.id}" aria-label="Remove image">×</button></div>`;
  if (heroAssetThumbs) heroAssetThumbs.innerHTML = byType('hero').map(thumbHtml).join('');
  if (galleryAssetThumbs) galleryAssetThumbs.innerHTML = byType('gallery').map(thumbHtml).join('');
  if (teamAssetThumbs) teamAssetThumbs.innerHTML = byType('team').map(thumbHtml).join('');
}

// ---- V8.3: editor panel rendering ------------------------------------------
// A friendly display label for a section type / variant key -- editor UI
// only, never shown anywhere in the generated site itself.
const EDITOR_TYPE_LABEL_OVERRIDES = {
  faq: 'FAQ', ctaBanner: 'CTA Banner', productShowcase: 'Product Showcase', imageLedEditorial: 'Editorial', testimonialsGrid: 'Testimonials Grid', reservationCta: 'Reservation CTA', serviceAreas: 'Service Areas', headline: 'Headline', subhead: 'Subheading', body: 'Body text', ctaLabel: 'Button label',
  // V8.4: module type / action-kind / integration-provider labels
  contact: 'Contact form', quote: 'Quote request', newsletter: 'Newsletter signup', booking: 'Booking request', location: 'Location / map', action: 'Direct action', product: 'Product',
  call: 'Call', email: 'Email', directions: 'Directions', 'external-booking': 'External booking link', 'external-store': 'External store link',
  calendly: 'Calendly', shopify: 'Shopify', square: 'Square', stripe: 'Stripe', mailchimp: 'Mailchimp', 'google-maps': 'Google Maps'
};
function humanizeEditorLabel(key) {
  if (EDITOR_TYPE_LABEL_OVERRIDES[key]) return EDITOR_TYPE_LABEL_OVERRIDES[key];
  const spaced = String(key || '').replace(/-/g, ' ').replace(/([A-Z])/g, ' $1').trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}
// Pure function of the model, exactly like renderSections/renderChrome --
// rebuilds the whole panel's innerHTML from proj every render; all
// interaction is delegated (see the pageSectionEditor listeners below), so
// nothing here needs to re-attach a single event handler.
// ---- V8.4: functionality module + CTA-target editor UI ---------------------
// A phone/email/URL target's KIND is auto-detected from the value itself
// (rather than a separate kind selector the visitor would have to keep in
// sync) -- simple, unambiguous, and avoids a two-step "pick a kind, THEN
// see the right input appear" UI that would need extra transient state.
function detectCtaKindFromValue(v) {
  const s = String(v || '').trim();
  if (!s) return null;
  if (/^https?:\/\//i.test(s)) return 'external';
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) return 'mailto';
  return 'tel';
}
// Section types whose static fallback renders a single primary CTA button
// (see renderContact/renderCtaBanner/renderReservationCta) -- only these
// ever show the CTA-target editor, and only while no form/action module is
// enabled on them (a module renders its own submit button / action button
// instead, which isn't what ctaTarget points at).
const CTA_TARGET_SECTION_TYPES = ['contact', 'ctaBanner', 'reservationCta'];
function renderCtaTargetEditorHtml(pages, ownerAttr, cur) {
  return `<div class="editor-cta-target">
    <label>Button links to<select data-action="editor-cta-page" ${ownerAttr}>
      <option value="">Not linked (decorative)</option>
      ${pages.map(p => `<option value="${p.id}"${cur && cur.kind === 'page' && cur.pageId === p.id ? ' selected' : ''}>${escapeHtml(p.label)}</option>`).join('')}
    </select></label>
    <label>Or a phone / email / link<input type="text" placeholder="(555) 123-4567, you@business.com, https://…" data-action="editor-cta-value" ${ownerAttr} value="${cur && cur.kind !== 'page' && cur.kind !== 'section' ? escapeHtml(cur.value || '') : ''}" maxlength="200" /></label>
  </div>`;
}
// Everything needed to enable/disable a module, swap its type (among
// whatever's compatible with this section -- see MODULE_SECTION_COMPATIBILITY),
// edit its fields/success message/type-specific config, and set a future
// integration hint. Every control here mutates the model through
// runEditorAction (see the pageSectionEditor listeners below) -- nothing
// here writes to the DOM directly.
function renderModuleEditorHtml(section) {
  const compatible = moduleCompatibleTypesForSection(section.type);
  if (!compatible.length) return '';
  const module = section.module;
  const enabled = !!(module && module.enabled);
  let detail = '';
  if (enabled) {
    const isForm = ['contact', 'quote', 'newsletter', 'booking'].includes(module.type);
    const allowlist = getModuleFieldAllowlist(module.type);
    const fieldsHtml = isForm ? `
      <div class="editor-module-fields">${module.fields.map((f, i) => {
        const def = allowlist.find(d => d.key === f.key);
        const removable = !def || def.removable !== false;
        return `<div class="editor-module-field-row">
          <input type="text" class="editor-module-field-label" data-action="editor-module-field-label" data-section-id="${section.id}" data-field-key="${f.key}" value="${escapeHtml(f.label)}" maxlength="60" />
          <label class="editor-module-field-required"><input type="checkbox" data-action="editor-module-field-required" data-section-id="${section.id}" data-field-key="${f.key}"${f.required ? ' checked' : ''}${!removable ? ' disabled' : ''} /> Required</label>
          <button type="button" data-action="editor-module-field-up" data-section-id="${section.id}" data-field-key="${f.key}" aria-label="Move field up"${i === 0 ? ' disabled' : ''}>↑</button>
          <button type="button" data-action="editor-module-field-down" data-section-id="${section.id}" data-field-key="${f.key}" aria-label="Move field down"${i === module.fields.length - 1 ? ' disabled' : ''}>↓</button>
          <button type="button" class="editor-danger" data-action="editor-module-field-remove" data-section-id="${section.id}" data-field-key="${f.key}"${(!removable || module.fields.length <= 1) ? ' disabled' : ''}>Remove</button>
        </div>`;
      }).join('')}</div>
      ${(() => {
        const addable = allowlist.filter(d => !module.fields.some(f => f.key === d.key));
        return addable.length ? `<label>Add field<select data-action="editor-module-field-add" data-section-id="${section.id}"><option value="">Choose…</option>${addable.map(d => `<option value="${d.key}">${escapeHtml(d.label)}</option>`).join('')}</select></label>` : '';
      })()}
      <label>Success message<textarea rows="2" maxlength="200" data-action="editor-module-success" data-section-id="${section.id}">${escapeHtml((module.successState && module.successState.message) || '')}</textarea></label>` : '';
    const cfg = module.config || {};
    const configHtml = module.type === 'location'
      ? `<label>Address<input type="text" maxlength="200" data-action="editor-module-config" data-section-id="${section.id}" data-config-key="address" value="${escapeHtml(cfg.address || '')}" /></label>`
      : module.type === 'action'
      ? `<label>Action<select data-action="editor-module-config" data-section-id="${section.id}" data-config-key="actionKind">${ACTION_KIND_KEYS.map(k => `<option value="${k}"${cfg.actionKind === k ? ' selected' : ''}>${humanizeEditorLabel(k)}</option>`).join('')}</select></label>
         <label>${cfg.actionKind === 'call' ? 'Phone number' : cfg.actionKind === 'email' ? 'Email address' : cfg.actionKind === 'directions' ? 'Address (optional — uses business location if blank)' : 'Link URL'}<input type="text" maxlength="300" data-action="editor-module-config" data-section-id="${section.id}" data-config-key="target" value="${escapeHtml(cfg.target || '')}" /></label>`
      : module.type === 'product'
      ? `<label>Product name<input type="text" maxlength="80" data-action="editor-module-config" data-section-id="${section.id}" data-config-key="name" value="${escapeHtml(cfg.name || '')}" /></label>
         <label>Price (optional)<input type="text" maxlength="40" data-action="editor-module-config" data-section-id="${section.id}" data-config-key="priceLabel" value="${escapeHtml(cfg.priceLabel || '')}" /></label>
         <label>Button label<input type="text" maxlength="40" data-action="editor-module-config" data-section-id="${section.id}" data-config-key="ctaLabel" value="${escapeHtml(cfg.ctaLabel || '')}" /></label>
         <label>Checkout URL<input type="text" maxlength="500" data-action="editor-module-config" data-section-id="${section.id}" data-config-key="checkoutUrl" value="${escapeHtml(cfg.checkoutUrl || '')}" /></label>`
      : '';
    const integrationHtml = `<label>Connect later via<select data-action="editor-module-integration" data-section-id="${section.id}"><option value="">None</option>${INTEGRATION_PROVIDER_KEYS.map(p => `<option value="${p}"${module.integration && module.integration.provider === p ? ' selected' : ''}>${humanizeEditorLabel(p)}</option>`).join('')}</select></label>`;
    detail = `${fieldsHtml}${configHtml}${integrationHtml}`;
  }
  return `<div class="editor-module-block">
    <div class="editor-module-header">
      <label class="editor-module-toggle"><input type="checkbox" data-action="editor-module-toggle" data-section-id="${section.id}"${enabled ? ' checked' : ''} /> Functionality module</label>
      ${enabled ? `<select data-action="editor-module-type" data-section-id="${section.id}">${compatible.map(t => `<option value="${t}"${module.type === t ? ' selected' : ''}>${humanizeEditorLabel(t)}</option>`).join('')}</select>` : ''}
    </div>
    ${detail}
  </div>`;
}
function renderEditorPanel(proj, category) {
  if (!editorPageTabs || !proj || !Array.isArray(proj.pages)) return;
  const pages = proj.pages;
  const activeIdx = Math.max(0, Math.min(pages.length - 1, proj.activePageIndex || 0));
  const activePage = pages[activeIdx];
  const history = getEditorHistory(proj);

  if (editorUndoBtn) editorUndoBtn.disabled = !history.undo.length;
  if (editorRedoBtn) editorRedoBtn.disabled = !history.redo.length;
  if (editorAddPageBtn) editorAddPageBtn.disabled = pages.length >= MAX_PAGES;

  editorPageTabs.innerHTML = pages.map((p, i) =>
    `<button type="button" class="editor-page-tab${i === activeIdx ? ' active' : ''}" data-action="editor-page-tab" data-page-id="${p.id}">${escapeHtml(p.label || (i === 0 ? 'Home' : `Page ${i + 1}`))}</button>`
  ).join('');

  if (editorPageDetail) {
    if (!activePage) {
      editorPageDetail.innerHTML = '';
    } else {
      const isHome = activeIdx === 0;
      editorPageDetail.innerHTML = `
        <div class="editor-page-detail-row">
          <label>Page title<input type="text" data-action="editor-page-rename" data-page-id="${activePage.id}" value="${escapeHtml(activePage.label || '')}" maxlength="40" /></label>
          ${isHome ? '' : `<label>Page path<div class="editor-slug-row"><span>/</span><input type="text" data-action="editor-page-slug" data-page-id="${activePage.id}" value="${escapeHtml(activePage.slug || '')}" maxlength="40" /></div></label>`}
        </div>
        <div class="editor-page-detail-actions">
          ${isHome ? '<span class="editor-home-note">Home is always the first page and can’t be moved or removed.</span>' : `
            <button type="button" data-action="editor-page-move-left" data-page-id="${activePage.id}"${activeIdx <= 1 ? ' disabled' : ''}>← Move earlier</button>
            <button type="button" data-action="editor-page-move-right" data-page-id="${activePage.id}"${activeIdx >= pages.length - 1 ? ' disabled' : ''}>Move later →</button>
            <button type="button" class="editor-danger" data-action="editor-page-remove" data-page-id="${activePage.id}">Remove page</button>
          `}
        </div>`;
    }
  }

  // A project-level dimension, not a per-page one -- applies to Home's real
  // hero only (see renderHero); secondary pages use the lightweight page
  // header instead (renderPageHeader) and are unaffected by this control.
  if (editorHeroSelect) {
    editorHeroSelect.innerHTML = CLAUDE_HERO_KEYS.map(k => `<option value="${k}"${proj.design.dimensions.hero === k ? ' selected' : ''}>${humanizeEditorLabel(k)}</option>`).join('');
  }
  if (editorHeroCta) {
    editorHeroCta.innerHTML = renderCtaTargetEditorHtml(pages, 'data-owner="hero"', proj.copy && proj.copy.ctaTarget);
  }

  const sections = activePage ? (activePage.sections || []) : [];
  if (editorSectionList) {
    if (!sections.length) {
      editorSectionList.innerHTML = '<p class="editor-empty-note">No content sections on this page yet.</p>';
    } else {
      const otherPages = pages.filter(p => p.id !== (activePage && activePage.id));
      editorSectionList.innerHTML = sections.map((s, i) => {
        const variantOptions = SECTION_VARIANT_OPTIONS[s.type];
        const fields = SECTION_EDITABLE_FIELDS[s.type] || [];
        return `<div class="editor-section-card" data-section-id="${s.id}">
          <div class="editor-section-card-head">
            <strong>${escapeHtml(humanizeEditorLabel(s.type))}</strong>
            <div class="editor-section-card-controls">
              <button type="button" data-action="editor-section-up" data-section-id="${s.id}" aria-label="Move up"${i === 0 ? ' disabled' : ''}>↑</button>
              <button type="button" data-action="editor-section-down" data-section-id="${s.id}" aria-label="Move down"${i === sections.length - 1 ? ' disabled' : ''}>↓</button>
              <button type="button" data-action="editor-section-duplicate" data-section-id="${s.id}">Duplicate</button>
              <button type="button" class="editor-danger" data-action="editor-section-remove" data-section-id="${s.id}">Remove</button>
            </div>
          </div>
          <div class="editor-section-card-row">
            ${otherPages.length ? `<label>Move to page<select data-action="editor-section-move-page" data-section-id="${s.id}"><option value="">Move to…</option>${otherPages.map(p => `<option value="${p.id}">${escapeHtml(p.label)}</option>`).join('')}</select></label>` : ''}
            ${variantOptions ? `<label>Layout<select data-action="editor-section-variant" data-section-id="${s.id}">${variantOptions.map(v => `<option value="${v}"${s.variant === v ? ' selected' : ''}>${humanizeEditorLabel(v)}</option>`).join('')}</select></label>` : ''}
          </div>
          ${fields.length ? `<div class="editor-section-copy-fields">${fields.map(f => f === 'body'
            ? `<label>${humanizeEditorLabel(f)}<textarea rows="2" data-action="editor-section-copy" data-section-id="${s.id}" data-field="${f}" maxlength="${EDITOR_COPY_FIELD_LIMITS[f]}">${escapeHtml(sectionCopyField(s, f, ''))}</textarea></label>`
            : `<label>${humanizeEditorLabel(f)}<input type="text" data-action="editor-section-copy" data-section-id="${s.id}" data-field="${f}" maxlength="${EDITOR_COPY_FIELD_LIMITS[f]}" value="${escapeHtml(sectionCopyField(s, f, ''))}" /></label>`
          ).join('')}</div>` : ''}
          ${renderModuleEditorHtml(s)}
          ${(!s.module || !s.module.enabled) && CTA_TARGET_SECTION_TYPES.includes(s.type) ? renderCtaTargetEditorHtml(pages, `data-owner="section" data-section-id="${s.id}"`, s.ctaTarget) : ''}
        </div>`;
      }).join('');
    }
  }

  if (editorImportPanel) {
    const otherDirections = directions.map((d, i) => ({ d, i })).filter(x => x.d !== proj);
    if (!otherDirections.length) {
      editorImportPanel.innerHTML = '';
    } else {
      const selected = editorImportPanel.dataset.selectedDirection ? Number(editorImportPanel.dataset.selectedDirection) : otherDirections[0].i;
      const sourceDir = directions[selected];
      const importableRows = sourceDir ? (sourceDir.pages || []).flatMap(p => (p.sections || []).map(s => ({ p, s }))) : [];
      editorImportPanel.innerHTML = `
        <label>Import from<select data-action="editor-import-source">${otherDirections.map(x => `<option value="${x.i}"${x.i === selected ? ' selected' : ''}>Direction ${x.i + 1}</option>`).join('')}</select></label>
        <button type="button" data-action="editor-import-hero" data-source-direction="${selected}">Use Direction ${selected + 1}’s hero style</button>
        <div class="editor-import-list">${importableRows.length ? importableRows.map(({ p, s }) =>
          `<div class="editor-import-row"><span>${escapeHtml(p.label)} — ${escapeHtml(humanizeEditorLabel(s.type))}</span><button type="button" data-action="editor-import-section" data-source-direction="${selected}" data-source-page-id="${p.id}" data-section-id="${s.id}">Import</button></div>`
        ).join('') : '<p class="editor-empty-note">That direction has no content sections to import.</p>'}</div>`;
    }
  }
}

// ---- Serialization / persistence (client-side this pass -- see SITE-PROJECT-V5.md part 6) ----
// V8.1: persists ALL existing directions plus which one is active -- not
// just the single active WebsiteProject -- so Save/Restore reconstructs the
// whole 1/2/3 set, not only whichever one happened to be on screen.
function serializeDirectionsState() { return JSON.stringify({ directions, activeDirectionIndex }); }
function setProjectStatus(msg) {
  if (projectDataStatus) projectDataStatus.textContent = msg;
  if (projectDataStatusLock) projectDataStatusLock.textContent = msg;
}
// Best-effort, silent, and separate from the explicit Save button below: its
// only job is closing the "just refresh the page" loophole around the
// 3-direction cap (a plain reload used to reset `directions` to empty,
// letting the visitor generate 3 more) -- it is NOT a promise that every
// fine-grained edit survives a refresh (that stays the explicit Save
// button's job, which shares the same storage key so the two never
// disagree). A visitor who deliberately clears site data can still reset
// the count -- same disclosed, honest limitation class as the anonymous
// cookie itself (SITE-PROJECT-V8.md part 7/8).
function persistDirectionsSilently() {
  try { localStorage.setItem('siteremade:lastProject', serializeDirectionsState()); } catch (e) { /* best-effort only */ }
  // V8.5: this is the single chokepoint every mutation path already routes
  // through (runEditorAction, generation completion, direction switching --
  // see this function's own call sites) -- reusing it here, rather than
  // wiring a server-save call into each of those individually, is exactly
  // the "hook durable persistence into the centralized mutation
  // architecture" the spec asks for. A no-op whenever there's no signed-in
  // account or no server-side project yet (see scheduleServerAutosave).
  scheduleServerAutosave();
}
function saveProjectToStorage() {
  if (!directions.length) { setProjectStatus('Generate a direction first.'); return; }
  try {
    localStorage.setItem('siteremade:lastProject', serializeDirectionsState());
    setProjectStatus(`Saved — all ${directions.length} direction${directions.length === 1 ? '' : 's'} (including images) can be reloaded anytime.`);
  } catch (e) { setProjectStatus('Could not save (storage may be full or unavailable).'); }
}
// V8.5: shared by loadProjectFromStorage (localStorage) below and the
// owned-project restore / conflict-resolution paths further down (the
// server) -- the exact same real, tested migration/render/resolve
// sequence applies regardless of where the {directions,
// activeDirectionIndex} state came from, so there is exactly one place
// that ever "becomes" a loaded project.
async function applyDirectionsState(restoredDirections, restoredIndex) {
  const activeCandidate = restoredDirections[Math.max(0, Math.min(restoredDirections.length - 1, Number.isInteger(restoredIndex) ? restoredIndex : 0))];
  const restoreKey = activeCandidate && activeCandidate.source
    ? (activeCandidate.source.generationKey || hashString(String(activeCandidate.source.text || '').trim().toLowerCase()))
    : null;
  const sliced = restoredDirections
    .filter(d => !restoreKey || !d.source || (d.source.generationKey || hashString(String(d.source.text || '').trim().toLowerCase())) === restoreKey)
    .slice(0, MAX_DIRECTIONS);
  sliced.forEach(d => { d.assets = d.assets || {}; d.assets.generated = d.assets.generated || {}; }); // restore generated imagery same as user uploads
  // V8.2: every restored direction gets migrated into the page-aware
  // shape -- a real pages[] for one already saved that way, or a real
  // single Home page split back out of a legacy flat sections[] for one
  // that isn't (see migrateProjectPages).
  directions = sliced.map(migrateProjectPages);
  activeDirectionIndex = Math.max(0, Math.min(directions.length - 1, Number.isInteger(restoredIndex) ? restoredIndex : 0));
  project = directions[activeDirectionIndex];
  generationSession = project && project.source ? createGenerationSource(project.source.text) : null;
  if (isDemoProject(project)) {
    lifecycle.waitingForProvider = false;
    setLifecycleState('idle', project);
    renderProject(project);
    showIdleGenerationGate();
    return;
  }
  lifecycle.waitingForProvider = !window.__siteremadeImageProvider;
  const preparationToken = ++lifecycle.preparationToken;
  setLifecycleState('restoring', project);
  showGenerationGate('finalizing', 'restore');
  renderDirectionSwitcher();
  updateDirectionControls();
  revealPreparationInFlight = true;
  try {
    await prepareProjectForReveal(project, 'restore', preparationToken);
  } finally {
    revealPreparationInFlight = false;
  }
}
function loadProjectFromStorage() {
  let raw;
  try { raw = localStorage.getItem('siteremade:lastProject'); } catch (e) { raw = null; }
  if (!raw) { setProjectStatus('No saved project found yet.'); return; }
  try {
    const parsed = JSON.parse(raw);
    let restored, restoredIndex;
    if (parsed && Array.isArray(parsed.directions) && parsed.directions.length) {
      restored = parsed.directions;
      restoredIndex = Number.isInteger(parsed.activeDirectionIndex) ? parsed.activeDirectionIndex : 0;
    } else if (parsed && parsed.meta) {
      // Backward-compat: a save from before the multi-direction model (V8
      // and earlier) was a single WebsiteProject -- migrate it into
      // Direction 1 rather than failing to load it.
      restored = [parsed];
      restoredIndex = 0;
    } else {
      throw new Error('Unrecognized saved format');
    }
    applyDirectionsState(restored, restoredIndex);
    setProjectStatus(`Loaded your saved project${directions.length > 1 ? ` (${directions.length} directions)` : ''}.`);
  } catch (e) { setProjectStatus('Saved project could not be read.'); }
}

// ---- DOM refs -------------------------------------------------------------
const businessName = $('#businessName');
const industrySelect = $('#industrySelect');
const brandColor = $('#brandColor');
const brandColorHex = $('#brandColorHex');
const backgroundColor = $('#backgroundColor');
const backgroundColorHex = $('#backgroundColorHex');
const textColor = $('#textColor');
const textColorHex = $('#textColorHex');
const resetColors = $('#resetColors');
const businessLogo = $('#businessLogo');
const chooseLogo = $('#chooseLogo');
const removeLogo = $('#removeLogo');
const logoPreviewBox = $('#logoPreviewBox');
const logoPreviewImage = $('#logoPreviewImage');
const logoPlaceholder = $('#logoPlaceholder');
const siteLogo = $('#siteLogo');
const builderSite = $('#builderSite');
const builderDevice = $('#builderDevice');
const siteNav = $('#siteNav');
const siteBusiness = $('#siteBusiness');
const siteNavLinks = $('#siteNavLinks');
const siteNavCta = $('#siteNavCta');
const siteSectionsRoot = $('#siteSectionsRoot');
const summaryMode = $('#summaryMode');
const summaryColor = $('#summaryColor');
const summaryLayout = $('#summaryLayout');
const summaryIndustry = $('#summaryIndustry');
const handoffTitle = $('#handoffTitle');
const handoffMeta = $('#handoffMeta');
const handoffDescriptionNote = $('#handoffDescriptionNote');
const purchaseTitle = $('#purchaseTitle');
const purchaseMeta = $('#purchaseMeta');
const purchaseDescriptionNote = $('#purchaseDescriptionNote');
const buyButton = $('#buyButton');
const purchaseStatus = $('#purchaseStatus');
const formBusiness = $('#formBusiness');
const formDescription = $('#formDescription');
const formDesignMode = $('#formDesignMode');
const formBrandColor = $('#formBrandColor');
const formBackgroundColor = $('#formBackgroundColor');
const formTextColor = $('#formTextColor');
const formLogoName = $('#formLogoName');
const formLogoData = $('#formLogoData');
const formLayout = $('#formLayout');
const formIndustry = $('#formIndustry');
const formSections = $('#formSections');
const leadForm = $('#leadForm');
const formStatus = $('#formStatus');
const year = $('#year');

// V8.2: page navigation inside the generated preview itself -- real clicks,
// not decorative spans, but wired once via delegation on the stable #siteNav
// element rather than re-attached on every render (siteNavLinks' own inner
// HTML is replaced wholesale each render). Logo/business-name click always
// goes Home; nav links go to their own page; the CTA button only targets a
// page once findCtaTargetPage finds a genuinely relevant one to send it to
// (a single-page project's CTA stays exactly as decorative as it always
// was -- see findCtaTargetPage).
if (siteNav) {
  siteNav.addEventListener('click', event => {
    if (!project) return;
    const link = event.target.closest('.site-nav-link');
    if (link) { switchPage(Number(link.dataset.pageIndex)); return; }
    const brand = event.target.closest('.site-brand-lockup');
    if (brand) { switchPage(0); return; }
    if (siteNavCta && (event.target === siteNavCta || siteNavCta.contains(event.target))) {
      if (project.copy && project.copy.ctaTarget) { handleCtaTargetClick(project.copy.ctaTarget); return; }
      const target = findCtaTargetPage(project);
      if (target !== -1) switchPage(target);
    }
  });
}

// ---- V8.4: CTA targeting + live module-form interaction --------------------
// A page/section CTA target is resolved here, the one place both the nav
// CTA (above) and any in-page CTA button share. tel:/mailto:/external
// targets are real <a href> elements the browser already handles -- there
// is nothing for this function to do for those, by design.
function handleCtaTargetClick(target) {
  if (!target || !project) return;
  if (target.kind === 'page') { const idx = findPageIndexById(project, target.pageId); if (idx !== -1) switchPage(idx); return; }
  if (target.kind === 'section') {
    const idx = findPageIndexById(project, target.pageId);
    if (idx === -1) return;
    const scrollToSection = () => { const el = document.getElementById(`module-${target.sectionId}`); if (el) el.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' }); };
    if (idx !== project.activePageIndex) { switchPage(idx); requestAnimationFrame(scrollToSection); } else scrollToSection();
  }
}
// Directly patches one field's inline error (no full renderProject -- see
// moduleRuntimeState's own comment for why: a full re-render would wipe
// whatever the visitor is mid-typing elsewhere in the form).
function patchModuleFieldError(form, fieldKey, error) {
  const field = form.querySelector(`[data-field-key="${fieldKey}"]`);
  if (!field) return;
  const errEl = document.getElementById(field.getAttribute('aria-describedby'));
  // aria-invalid is a tristate ARIA attribute (screen readers read its
  // STRING value), not a boolean HTML attribute like `disabled`/`required`
  // -- toggleAttribute would leave it present-but-empty (aria-invalid="")
  // on error, which is not the same as aria-invalid="true" to assistive
  // tech. Matches the string the initial render already uses (see
  // moduleFieldInputHtml's invalidAttr) so a live-patched error state is
  // exactly as accessible as a freshly-rendered one.
  if (error) field.setAttribute('aria-invalid', 'true'); else field.removeAttribute('aria-invalid');
  if (errEl) errEl.textContent = error || '';
  const wrapper = field.closest('.module-field');
  if (wrapper) wrapper.classList.toggle('module-field-error', !!error);
}
function patchModuleSubmittingState(form, isSubmitting) {
  form.querySelectorAll('input, select, textarea, button').forEach(el => { el.disabled = isSubmitting; });
  const btn = form.querySelector('.module-submit-btn');
  if (btn) btn.textContent = isSubmitting ? 'Sending…' : btn.dataset.idleLabel || btn.textContent;
}
function patchModuleErrorBanner(form, message) {
  let banner = form.querySelector('.module-submit-error');
  if (!banner) {
    banner = document.createElement('p');
    banner.className = 'module-submit-error';
    banner.setAttribute('role', 'alert');
    form.insertBefore(banner, form.querySelector('.module-submit-btn'));
  }
  banner.textContent = message;
}
function patchModuleSuccessState(form, module) {
  const wrapper = form.closest('.site-section-module');
  if (!wrapper) return;
  const preview = resolveModuleProvider(module).name === 'preview';
  wrapper.innerHTML = `<div class="module-success" role="status" tabindex="-1">
    <p>${escapeHtml((module.successState && module.successState.message) || defaultSuccessMessage(module.type))}</p>
    ${preview ? '<p class="module-preview-note">Preview mode — this form isn’t connected to a live inbox yet.</p>' : ''}
  </div>`;
  const successEl = wrapper.querySelector('.module-success');
  if (successEl) successEl.focus();
}
async function handleModuleFormSubmit(form) {
  if (!project) return;
  const sectionId = form.dataset.sectionId;
  const activePage = project.pages[project.activePageIndex];
  const section = activePage && findSectionById(activePage, sectionId);
  if (!section || !section.module) return;
  const runtime = getModuleRuntime(sectionId);
  const raw = {};
  (section.module.fields || []).forEach(f => {
    const el = form.querySelector(`[data-field-key="${f.key}"]`);
    raw[f.key] = el ? el.value : '';
  });
  const { valid, errors, values } = validateModuleSubmission(section.module, raw);
  runtime.values = { ...runtime.values, ...raw };
  runtime.errors = errors;
  (section.module.fields || []).forEach(f => patchModuleFieldError(form, f.key, errors[f.key] || ''));
  if (!valid) {
    const firstBadKey = (section.module.fields || []).map(f => f.key).find(k => errors[k]);
    if (firstBadKey) { const el = form.querySelector(`[data-field-key="${firstBadKey}"]`); if (el) el.focus(); }
    return;
  }
  runtime.status = 'submitting';
  patchModuleSubmittingState(form, true);
  const result = await submitModule(section.module, values, { businessName: project.business.name, categoryKey: project.business.categoryKey, projectId: project.meta.id });
  // Guard against a slow response landing after the visitor navigated away
  // from this page/direction/section entirely -- never patches stale DOM.
  if (!project || project.pages[project.activePageIndex] !== activePage || !document.body.contains(form)) return;
  if (result && result.ok) {
    runtime.status = 'success';
    patchModuleSuccessState(form, section.module);
  } else {
    runtime.status = 'error';
    runtime.message = (result && result.message) || 'Something went wrong. Please try again.';
    patchModuleSubmittingState(form, false);
    patchModuleErrorBanner(form, runtime.message);
  }
}
if (siteSectionsRoot) {
  // Page/section CTA clicks (tel/mailto/external are native <a href>
  // elements -- the browser handles those with no JS at all).
  siteSectionsRoot.addEventListener('click', event => {
    const cta = event.target.closest('[data-cta-kind]');
    if (cta && (cta.dataset.ctaKind === 'page' || cta.dataset.ctaKind === 'section')) {
      handleCtaTargetClick({ kind: cta.dataset.ctaKind, pageId: cta.dataset.ctaPageId, sectionId: cta.dataset.ctaSectionId });
    }
  });
  // Typing into a module field only ever updates the ephemeral runtime map
  // -- never calls renderProject, so focus/caret position are never lost.
  siteSectionsRoot.addEventListener('input', event => {
    const field = event.target.closest('[data-field-key]');
    const form = field && field.closest('[data-module-form]');
    if (!form) return;
    const runtime = getModuleRuntime(form.dataset.sectionId);
    runtime.values[field.dataset.fieldKey] = field.value;
  });
  // Validate a field once the visitor leaves it -- patches only that one
  // field's error text/aria-invalid, never a full re-render.
  siteSectionsRoot.addEventListener('focusout', event => {
    const field = event.target.closest('[data-field-key]');
    const form = field && field.closest('[data-module-form]');
    if (!form || !project) return;
    const activePage = project.pages[project.activePageIndex];
    const section = activePage && findSectionById(activePage, form.dataset.sectionId);
    const fieldDef = section && section.module && (section.module.fields || []).find(f => f.key === field.dataset.fieldKey);
    if (!fieldDef) return;
    const result = validateModuleField(fieldDef, field.value);
    const runtime = getModuleRuntime(section.id);
    if (!result.valid) runtime.errors[fieldDef.key] = result.error; else delete runtime.errors[fieldDef.key];
    patchModuleFieldError(form, fieldDef.key, result.valid ? '' : result.error);
  });
  siteSectionsRoot.addEventListener('submit', event => {
    const form = event.target.closest('[data-module-form]');
    if (!form) return;
    event.preventDefault();
    handleModuleFormSubmit(form);
  });
}

// Generator (hero) elements
const generatorForm = $('#generatorForm');
const generatorInput = $('#generatorInput');
const generatorSubmitButton = $('.generator-submit');
const generatorSubmitLabel = generatorSubmitButton ? generatorSubmitButton.querySelector('.btn-label') : null;

// ---- Pre-generation upload staging ----------------------------------------
// Item 8/9 of the brand-experience brief: real image upload lives right in
// the generation box, before any business/project exists yet -- attach,
// drag or paste. Staged files are converted with the exact same pure/local
// readImageAsDataUrl + createAsset pair the post-generation editor already
// uses (see chooseLogo/heroAssetInput/etc above and below), so a staged
// upload becomes a real WebsiteProject asset the moment generation runs,
// not a separate "AI context" concept. Nothing here ever performs a
// network request -- reading/resizing an image client-side costs nothing
// and triggers neither a Claude call nor an image-generation call, so the
// existing cost invariants (upload != Claude call, upload != image-gen
// call) hold structurally, the same way they already do post-generation.
const generatorUpload = $('#generatorUpload');
const generatorUploadInput = $('#generatorUploadInput');
const generatorUploadBtn = $('#generatorUploadBtn');
const generatorUploadThumbs = $('#generatorUploadThumbs');
let pendingUploads = []; // { id, type, dataUrl, name } -- same shape createAsset produces, pre-assigned an id so thumbs can be removed before a project exists
// No CV/classification pass (brief item 11 explicitly rules that out this
// pass) -- just the same kind of obvious, local, filename-based signal a
// person would use themselves. Defaults to 'gallery', which is also the
// role planAssets already borrows from first for the hero when no
// dedicated hero/logo upload exists -- so an unlabeled photo still ends up
// somewhere sensible.
function inferUploadType(filename) {
  const n = String(filename || '').toLowerCase();
  if (/logo|brandmark|wordmark/.test(n)) return 'logo';
  if (/team|founder|portrait|headshot|owner|staff|chef|stylist|crew/.test(n)) return 'team';
  return 'gallery';
}
function renderPendingUploads() {
  if (!generatorUploadThumbs) return;
  generatorUploadThumbs.hidden = !pendingUploads.length;
  generatorUploadThumbs.innerHTML = pendingUploads.map(u => `<div class="asset-thumb"><img src="${u.dataUrl}" alt="${escapeHtml(u.name)}" /><button type="button" class="asset-thumb-remove" data-upload-id="${u.id}" aria-label="Remove ${escapeHtml(u.name)}">×</button></div>`).join('');
}
function stagePendingUploadFiles(fileList) {
  const files = Array.from(fileList || []).filter(f => f && f.type && f.type.startsWith('image/'));
  if (!files.length) return;
  const room = Math.max(0, 6 - pendingUploads.length);
  if (!room) return;
  Promise.all(files.slice(0, room).map(f => readImageAsDataUrl(f, 1000, 1000).then(dataUrl => ({
    id: 'pending_' + Math.random().toString(36).slice(2, 9),
    type: inferUploadType(f.name),
    dataUrl,
    name: f.name || 'image'
  })).catch(() => null))).then(results => {
    pendingUploads = pendingUploads.concat(results.filter(Boolean));
    renderPendingUploads();
  });
}
if (generatorUploadBtn && generatorUploadInput) {
  generatorUploadBtn.addEventListener('click', () => generatorUploadInput.click());
  generatorUploadInput.addEventListener('change', e => {
    stagePendingUploadFiles(e.target.files);
    generatorUploadInput.value = '';
  });
}
if (generatorUploadThumbs) {
  generatorUploadThumbs.addEventListener('click', e => {
    const btn = e.target.closest('.asset-thumb-remove');
    if (!btn) return;
    pendingUploads = pendingUploads.filter(u => u.id !== btn.dataset.uploadId);
    renderPendingUploads();
  });
}
// Drag-and-drop + paste, scoped to the generator form itself (minimal UI
// change -- no new drop zone chrome, the existing textarea/upload row just
// becomes drag/paste-aware).
if (generatorForm) {
  ['dragenter', 'dragover'].forEach(evt => generatorForm.addEventListener(evt, e => {
    if (!e.dataTransfer || !Array.from(e.dataTransfer.types || []).includes('Files')) return;
    e.preventDefault();
    if (generatorUpload) generatorUpload.classList.add('is-dragover');
  }));
  ['dragleave', 'drop'].forEach(evt => generatorForm.addEventListener(evt, () => {
    if (generatorUpload) generatorUpload.classList.remove('is-dragover');
  }));
  generatorForm.addEventListener('drop', e => {
    if (!e.dataTransfer || !e.dataTransfer.files || !e.dataTransfer.files.length) return;
    e.preventDefault();
    stagePendingUploadFiles(e.dataTransfer.files);
  });
  generatorForm.addEventListener('paste', e => {
    const items = e.clipboardData && e.clipboardData.items;
    if (!items) return;
    const imageFiles = Array.from(items).filter(it => it.kind === 'file' && it.type.startsWith('image/')).map(it => it.getAsFile()).filter(Boolean);
    if (!imageFiles.length) return;
    stagePendingUploadFiles(imageFiles);
  });
}
const heroMachine = $('#heroMachine');
const heroDemoCopy = $('#heroDemoCopy');
const heroKicker = $('#heroKicker');
const heroHeadline = $('#heroHeadline');
const heroCardSections = $('#heroCardSections');
const heroCardBrand = $('#heroCardBrand');
const heroCardIndustry = $('#heroCardIndustry');
const generationProgress = $('#generationProgress');
const generationSteps = $('#generationSteps');
const generationGate = $('#generationGate');
const generationGateIdle = $('#generationGateIdle');
const generationGateBuilding = $('#generationGateBuilding');
const generationGateCta = $('#generationGateCta');
const generationGateSteps = $('#generationGateSteps');
const generationGateStatus = $('#generationGateStatus');
const generationGateRetry = $('#generationGateRetry');
const exampleChipRow = $('#exampleChipRow');

// Refine-panel elements
const builderShell = $('#builderShell');
const toneToggle = $('#toneToggle');
const regenerateButton = $('#regenerateButton');
const sectionToggles = $('#sectionToggles');
const conversationRefinement = $('#conversationRefinement');
const refinementInput = $('#refinementInput');
const refinementSubmit = $('#refinementSubmit');
const refinementStatus = $('#refinementStatus');

// Asset upload elements
const heroAssetInput = $('#heroAssetInput'); const heroAssetAdd = $('#heroAssetAdd'); const heroAssetThumbs = $('#heroAssetThumbs');
const galleryAssetInput = $('#galleryAssetInput'); const galleryAssetAdd = $('#galleryAssetAdd'); const galleryAssetThumbs = $('#galleryAssetThumbs');
const teamAssetInput = $('#teamAssetInput'); const teamAssetAdd = $('#teamAssetAdd'); const teamAssetThumbs = $('#teamAssetThumbs');

// Project data elements
const saveProjectButton = $('#saveProjectButton');
const loadProjectButton = $('#loadProjectButton');
const loadProjectButtonLock = $('#loadProjectButtonLock');
const projectDataStatus = $('#projectDataStatus');
const projectDataStatusLock = $('#projectDataStatusLock');

// V8.5: account / durable-sync elements
const accountSignedOut = $('#accountSignedOut');
const accountSignedIn = $('#accountSignedIn');
const accountEmailInput = $('#accountEmailInput');
const accountPasswordInput = $('#accountPasswordInput');
const accountSignInBtn = $('#accountSignInBtn');
const accountSignUpBtn = $('#accountSignUpBtn');
const accountAuthStatus = $('#accountAuthStatus');
const accountEmailLabel = $('#accountEmailLabel');
const accountSignOutBtn = $('#accountSignOutBtn');
const accountProjectNameInput = $('#accountProjectNameInput');
const accountSaveStatus = $('#accountSaveStatus');
const accountConflictBlock = $('#accountConflictBlock');
const accountKeepMineBtn = $('#accountKeepMineBtn');
const accountLoadTheirsBtn = $('#accountLoadTheirsBtn');
const accountProjectsSelect = $('#accountProjectsSelect');
const accountLoadProjectBtn = $('#accountLoadProjectBtn');
const purchaseOwnershipBadge = $('#purchaseOwnershipBadge');

// V8.3: editor/remix panel elements -- a compact control-block inside the
// same collapsible "Advanced customization" drawer the color/layout/section
// controls already live in, deliberately not a permanent overlay on the
// live site preview itself (see SITE-PROJECT-V8.3.md part 8). Its own
// innerHTML is rebuilt wholesale by renderEditorPanel on every
// renderProject call -- the same pattern renderSections/renderAssetPanels
// already use -- so all interaction is wired once via delegation on the
// stable outer containers below rather than re-attached per render.
const pageSectionEditor = $('#pageSectionEditor');
const editorUndoBtn = $('#editorUndoBtn');
const editorRedoBtn = $('#editorRedoBtn');
const editorAddPageBtn = $('#editorAddPageBtn');
const editorHeroSelect = $('#editorHeroSelect');
const editorHeroCta = $('#editorHeroCta');
const editorPageTabs = $('#editorPageTabs');
const editorPageDetail = $('#editorPageDetail');
const editorSectionList = $('#editorSectionList');
const editorImportPanel = $('#editorImportPanel');

// V8.3: the editor panel is wired the same way page nav is -- one delegated
// click listener and one delegated change listener on the panel's stable
// outer container, since renderEditorPanel replaces the inner HTML of
// every sub-section on each render. Every mutation goes through
// runEditorAction (snapshot -> mutate -> render/persist/maybe-resolve-
// images); undo/redo and plain page navigation are the only two actions
// that deliberately do NOT (navigating is not an edit -- see switchPage's
// own contract; undo/redo must not themselves become undoable).
if (pageSectionEditor) {
  pageSectionEditor.addEventListener('click', event => {
    if (!project) return;
    const btn = event.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;
    const pageId = btn.dataset.pageId;
    const sectionId = btn.dataset.sectionId;
    const activePage = project.pages[project.activePageIndex];
    switch (action) {
      case 'editor-undo': editorUndo(); return;
      case 'editor-redo': editorRedo(); return;
      case 'editor-page-tab': { const idx = findPageIndexById(project, pageId); if (idx !== -1) switchPage(idx); return; }
      case 'editor-add-page':
        runEditorAction(() => {
          const p = addPage(project, `Page ${project.pages.length + 1}`);
          if (!p) return false;
          const idx = findPageIndexById(project, p.id);
          project.activePageIndex = idx;
          project.sections = project.pages[idx].sections;
          return true;
        }, false);
        return;
      case 'editor-page-move-left':
        runEditorAction(() => reorderPage(project, pageId, findPageIndexById(project, pageId) - 1), false);
        return;
      case 'editor-page-move-right':
        runEditorAction(() => reorderPage(project, pageId, findPageIndexById(project, pageId) + 1), false);
        return;
      case 'editor-page-remove':
        runEditorAction(() => removePage(project, pageId), true);
        return;
      case 'editor-section-up':
        runEditorAction(() => moveSection(project, activePage.id, sectionId, findSectionIndex(activePage, sectionId) - 1), false);
        return;
      case 'editor-section-down':
        runEditorAction(() => moveSection(project, activePage.id, sectionId, findSectionIndex(activePage, sectionId) + 1), false);
        return;
      case 'editor-section-duplicate':
        runEditorAction(() => !!duplicateSection(project, activePage.id, sectionId), true);
        return;
      case 'editor-section-remove':
        runEditorAction(() => removeSection(project, activePage.id, sectionId), true);
        return;
      case 'editor-import-hero':
        runEditorAction(() => importHeroFromDirection(Number(btn.dataset.sourceDirection)), true);
        return;
      case 'editor-import-section':
        runEditorAction(() => !!importSectionFromDirection(Number(btn.dataset.sourceDirection), btn.dataset.sourcePageId, sectionId, activePage.id, activePage.sections.length), true);
        return;
      // V8.4: module field reordering/removal -- module edits never affect
      // images (see requirement #13), so these always pass `false`.
      case 'editor-module-field-up':
        runEditorAction(() => moveModuleField(project, activePage.id, sectionId, btn.dataset.fieldKey, 'up'), false);
        return;
      case 'editor-module-field-down':
        runEditorAction(() => moveModuleField(project, activePage.id, sectionId, btn.dataset.fieldKey, 'down'), false);
        return;
      case 'editor-module-field-remove':
        runEditorAction(() => removeModuleField(project, activePage.id, sectionId, btn.dataset.fieldKey), false);
        return;
    }
  });
  pageSectionEditor.addEventListener('change', event => {
    if (!project) return;
    const el = event.target.closest('[data-action]');
    if (!el) return;
    const action = el.dataset.action;
    const pageId = el.dataset.pageId;
    const sectionId = el.dataset.sectionId;
    const activePage = project.pages[project.activePageIndex];
    switch (action) {
      case 'editor-page-rename':
        runEditorAction(() => renamePage(project, pageId, el.value), false);
        return;
      case 'editor-page-slug':
        runEditorAction(() => changePageSlug(project, pageId, el.value), true);
        return;
      case 'editor-hero-swap':
        runEditorAction(() => swapHeroLayout(project, el.value), true);
        return;
      case 'editor-section-variant':
        runEditorAction(() => swapSectionVariant(project, activePage.id, sectionId, el.value), true);
        return;
      case 'editor-section-move-page': {
        if (!el.value) return; // the "Move to…" placeholder was re-selected -- not a real choice
        const targetPage = findPageById(project, el.value);
        if (!targetPage) return;
        runEditorAction(() => moveSectionToPage(project, activePage.id, sectionId, targetPage.id, targetPage.sections.length), true);
        return;
      }
      case 'editor-section-copy':
        runEditorAction(() => editSectionCopy(project, activePage.id, sectionId, el.dataset.field, el.value), false);
        return;
      case 'editor-import-source':
        editorImportPanel.dataset.selectedDirection = el.value;
        renderEditorPanel(project, categories[project.business.categoryKey] || categories.other);
        return;
      // V8.4: functionality module editing -- all model mutations, all
      // through runEditorAction (undo/redo + persist + never an image
      // request), exactly like every V8.3 editor control above.
      case 'editor-module-toggle':
        runEditorAction(() => setSectionModuleEnabled(project, activePage.id, sectionId, el.checked), false);
        return;
      case 'editor-module-type':
        runEditorAction(() => setSectionModuleType(project, activePage.id, sectionId, el.value), false);
        return;
      case 'editor-module-field-label':
        runEditorAction(() => setModuleFieldLabel(project, activePage.id, sectionId, el.dataset.fieldKey, el.value), false);
        return;
      case 'editor-module-field-required':
        runEditorAction(() => setModuleFieldRequired(project, activePage.id, sectionId, el.dataset.fieldKey, el.checked), false);
        return;
      case 'editor-module-field-add':
        if (!el.value) return;
        runEditorAction(() => addModuleField(project, activePage.id, sectionId, el.value), false);
        return;
      case 'editor-module-success':
        runEditorAction(() => setModuleSuccessMessage(project, activePage.id, sectionId, el.value), false);
        return;
      case 'editor-module-config':
        runEditorAction(() => setModuleConfigValue(project, activePage.id, sectionId, el.dataset.configKey, el.value), false);
        return;
      case 'editor-module-integration':
        runEditorAction(() => setModuleIntegrationProvider(project, activePage.id, sectionId, el.value), false);
        return;
      // V8.4: CTA targeting -- shared between the hero (data-owner="hero")
      // and a compatible section's own primary CTA (data-owner="section").
      case 'editor-cta-page': {
        const target = el.value ? { kind: 'page', pageId: el.value } : null;
        if (el.dataset.owner === 'hero') runEditorAction(() => setHeroCtaTarget(project, target), false);
        else runEditorAction(() => setSectionCtaTarget(project, activePage.id, el.dataset.sectionId, target), false);
        return;
      }
      case 'editor-cta-value': {
        const kind = detectCtaKindFromValue(el.value);
        const target = kind ? { kind, value: el.value } : null;
        if (el.dataset.owner === 'hero') runEditorAction(() => setHeroCtaTarget(project, target), false);
        else runEditorAction(() => setSectionCtaTarget(project, activePage.id, el.dataset.sectionId, target), false);
        return;
      }
    }
  });
}

// ---- Module state -----------------------------------------------------
// V8.1: the real product rule is "a visitor gets exactly 3 complete website
// directions, total -- through Claude OR the deterministic engine, doesn't
// matter." `directions` holds every direction that has actually been
// created this session (in creation order, never more than MAX_DIRECTIONS);
// `project` always === `directions[activeDirectionIndex]` once at least one
// exists (before that, it's the neutral, never-counted demo shell). Every
// existing refinement control below still just mutates `project` in place
// and calls renderProject(project) -- since `project` IS the same object
// reference held in `directions[activeDirectionIndex]`, those edits land on
// exactly the active direction and no other, with no extra plumbing.
const MAX_DIRECTIONS = 3;
let directions = [];
let activeDirectionIndex = -1;
let project = null;
let generationSession = null;
let hasGenerated = false;
// V8.1.1: a generation transaction lock. `directions.length` is not
// incremented until finishGeneration() admits a finished project, so
// checking only `directions.length >= MAX_DIRECTIONS` at the top of
// runGeneration() (V8.1's guard) left a real race: two overlapping calls
// (a double-click, or two independent runGeneration() invocations) can
// both read the same pre-increment length, both pass the gate, and both
// eventually push -- defeating the cap. `generationInFlight` closes that:
// it is set synchronously, before any await, and checked synchronously,
// before anything else, at the very top of runGeneration() and
// switchDirection() -- see SITE-PROJECT-V8.1.1.md.
let generationInFlight = false;
let generationState = 'idle';
let refinementInFlight = false;
let revealPreparationInFlight = false;
let imageProviderStatusResolve;
const imageProviderStatusReady = new Promise(resolve => { imageProviderStatusResolve = resolve; });
const lifecycle = {
  state: 'idle',
  projectKind: 'demo',
  waitingForProvider: false,
  gateVisible: false,
  websiteVisible: false,
  preparationToken: 0
};

function isDemoProject(proj) { return !!(proj && proj.meta && proj.meta.isDemoShell === true); }
function setLifecycleState(state, proj = project) {
  lifecycle.state = state;
  generationState = state;
  lifecycle.projectKind = isDemoProject(proj) ? 'demo' : (proj ? 'real' : 'none');
  lifecycle.gateVisible = !!(generationGate && !generationGate.hidden);
  // The site DOM is never actually hidden anymore (see the preview blur/
  // overlay redesign) -- it stays rendered underneath, blurred, whenever
  // the gate is active. "Visible" here means genuinely visible/usable to
  // the visitor, i.e. a real project with the gate NOT covering it.
  lifecycle.websiteVisible = !!(proj && !isDemoProject(proj) && builderSite && !(generationGate && !generationGate.hidden));
}
function lifecycleDiagnostics() {
  const active = project && !isDemoProject(project) ? project : null;
  return {
    projectType: isDemoProject(project) ? 'demo' : (project ? 'real' : 'none'),
    state: lifecycle.state,
    gateVisible: !!(generationGate && !generationGate.hidden),
    websiteVisible: !!(active && builderSite && !(generationGate && !generationGate.hidden)),
    unresolvedImageCount: active ? (active.imagePlan || []).filter(entry => entry.sourceType === 'generated' && !(active.assets.generated && active.assets.generated[entry.slot] && ['ready', 'error'].includes(active.assets.generated[entry.slot].status))).length : 0,
    activeDirection: activeDirectionIndex
  };
}
// V8.2: the real product rule one level down -- a direction is now a real,
// potentially multi-page site, not always one page. `proj.pages` holds
// every page of the CURRENT direction (in nav order, never more than
// MAX_PAGES); `proj.activePageIndex` is which one the live preview is
// currently showing; `proj.sections` is a live pointer at
// `proj.pages[proj.activePageIndex].sections` -- see syncActivePageSections
// below. This mirrors the direction system exactly one level in: the same
// "array + active index + a pointer everything else already reads/writes"
// shape, just for pages inside a direction instead of directions inside a
// session. Deliberately conservative: 6 clean nav entries is already a lot
// for a small-business marketing site preview, well under the 8-page raw
// ceiling normalizeClaudePlan already enforces defensively at parse time.
const MAX_PAGES = 6;
// Read-only test hooks (no setters) -- let Playwright tests observe real
// direction/page state without reaching into module-private state. Not
// sensitive, not written to, and harmless to ship.
try {
  Object.defineProperty(window, '__siteremadeDirections', {
    get: () => ({
      count: directions.length,
      activeIndex: activeDirectionIndex,
      max: MAX_DIRECTIONS,
      inFlight: generationInFlight,
      state: lifecycle.state,
      categories: directions.map(d => d.business && d.business.categoryKey),
      sourceKeys: directions.map(d => d.source && d.source.generationKey)
    })
  });
  Object.defineProperty(window, '__siteremadeLifecycle', { get: lifecycleDiagnostics });
  Object.defineProperty(window, '__siteremadePages', {
    get: () => ({
      count: (project && Array.isArray(project.pages)) ? project.pages.length : 0,
      activeIndex: project ? project.activePageIndex : -1,
      slugs: (project && Array.isArray(project.pages)) ? project.pages.map(p => p.slug) : [],
      max: MAX_PAGES
    })
  });
  Object.defineProperty(window, '__siteremadeImagePlan', {
    get: () => project ? (project.imagePlan || []).map(entry => ({ slot: entry.slot, sectionType: entry.sectionType, aspectRatio: entry.aspectRatio, sourceType: entry.sourceType })) : []
  });
  Object.defineProperty(window, '__siteremadeImageDiagnostics', {
    get: () => project ? imageSlotDiagnostic(project) : { missing: [], orphaned: [] }
  });
  // V8.3: read-only, same pattern as the two hooks above -- lets tests
  // observe the ACTIVE direction's own undo/redo depth (and, for
  // convenience, the current page's own section ids in nav order, so a
  // test can assert on reorder/duplicate/move results without reaching
  // into module-private state) without exposing any way to mutate it.
  Object.defineProperty(window, '__siteremadeEditor', {
    get: () => {
      const h = project ? getEditorHistory(project) : { undo: [], redo: [] };
      const activePage = (project && Array.isArray(project.pages)) ? project.pages[project.activePageIndex] : null;
      return {
        undoCount: h.undo.length,
        redoCount: h.redo.length,
        sectionIds: activePage ? (activePage.sections || []).map(s => s.id) : [],
        pageIds: (project && Array.isArray(project.pages)) ? project.pages.map(p => p.id) : []
      };
    }
  });
  // V8.4: read-only -- every section on the active page that carries a
  // module, plus its enabled state/type/field keys, so a test can assert on
  // functionality-module state without reaching into module-private state.
  Object.defineProperty(window, '__siteremadeModules', {
    get: () => {
      if (!project || !Array.isArray(project.pages)) return { modules: [], heroCtaTarget: null };
      const modules = [];
      project.pages.forEach(p => (p.sections || []).forEach(s => {
        if (s.module) modules.push({ pageId: p.id, sectionId: s.id, sectionType: s.type, type: s.module.type, enabled: s.module.enabled, fieldKeys: (s.module.fields || []).map(f => f.key), requiredKeys: (s.module.fields || []).filter(f => f.required).map(f => f.key) });
      }));
      return { modules, heroCtaTarget: (project.copy && project.copy.ctaTarget) || null };
    }
  });
} catch (e) { /* ignore in environments where this isn't definable */ }

// ---- Refinement controls: mutate `project`, then re-render --------------
[businessName].forEach(el => el.addEventListener('input', () => { if (!project) return; project.business.name = businessName.value; renderProject(project); }));
industrySelect.addEventListener('input', () => { if (!project) return; project.business.categoryKey = industrySelect.value; renderProject(project); resolveImagePlanAssets(project); });
[brandColor, backgroundColor, textColor].forEach(el => el.addEventListener('input', () => {
  if (!project) return;
  project.design.palette.main = brandColor.value;
  project.design.palette.background = backgroundColor.value;
  project.design.palette.text = textColor.value;
  renderProject(project);
}));

chooseLogo.addEventListener('click', () => businessLogo.click());
logoPreviewBox.addEventListener('click', () => businessLogo.click());
function clearLogo() {
  if (project) { project.assets.items = project.assets.items.filter(a => a.type !== 'logo'); }
  businessLogo.value = '';
  logoPreviewImage.removeAttribute('src');
  logoPreviewImage.classList.remove('active');
  logoPlaceholder.hidden = false;
  removeLogo.hidden = true;
  if (project) renderProject(project);
}
removeLogo.addEventListener('click', clearLogo);
businessLogo.addEventListener('change', event => {
  const file = event.target.files && event.target.files[0];
  if (!file) return;
  readImageAsDataUrl(file, 720, 360).then(dataUrl => {
    if (!project) return;
    project.assets.items = project.assets.items.filter(a => a.type !== 'logo');
    project.assets.items.push(createAsset('logo', dataUrl, file.name));
    logoPreviewImage.src = dataUrl;
    logoPreviewImage.classList.add('active');
    logoPlaceholder.hidden = true;
    removeLogo.hidden = false;
    renderProject(project);
  }).catch(err => { alert(err.message); clearLogo(); });
});

function afterAssetsChanged() {
  if (!project) return;
  project.assets.plan = planAssets(project.assets);
  ensureAssetDrivenSections(project);
  renderProject(project);
  // Uploading a real image always outranks a generated one (no request
  // needed); removing one can newly leave a slot needing a generated image.
  // Either way this recomputes what's actually still missing -- it never
  // re-requests a slot a user asset already covers.
  resolveImagePlanAssets(project);
}
if (heroAssetAdd) heroAssetAdd.addEventListener('click', () => heroAssetInput.click());
if (heroAssetInput) heroAssetInput.addEventListener('change', e => {
  const file = e.target.files && e.target.files[0];
  heroAssetInput.value = '';
  if (!file || !project) return;
  readImageAsDataUrl(file, 1200, 900).then(dataUrl => {
    project.assets.items = project.assets.items.filter(a => a.type !== 'hero');
    project.assets.items.push(createAsset('hero', dataUrl, file.name));
    afterAssetsChanged();
  }).catch(err => alert(err.message));
});
if (teamAssetAdd) teamAssetAdd.addEventListener('click', () => teamAssetInput.click());
if (teamAssetInput) teamAssetInput.addEventListener('change', e => {
  const file = e.target.files && e.target.files[0];
  teamAssetInput.value = '';
  if (!file || !project) return;
  readImageAsDataUrl(file, 700, 700).then(dataUrl => {
    project.assets.items = project.assets.items.filter(a => a.type !== 'team');
    project.assets.items.push(createAsset('team', dataUrl, file.name));
    afterAssetsChanged();
  }).catch(err => alert(err.message));
});
if (galleryAssetAdd) galleryAssetAdd.addEventListener('click', () => galleryAssetInput.click());
if (galleryAssetInput) galleryAssetInput.addEventListener('change', e => {
  const files = e.target.files;
  const fileList = files ? Array.from(files) : [];
  galleryAssetInput.value = '';
  if (!fileList.length || !project) return;
  const existing = project.assets.items.filter(a => a.type === 'gallery').length;
  const room = Math.max(0, 4 - existing);
  const toAdd = fileList.slice(0, room);
  if (!toAdd.length) { alert('Up to 4 gallery images.'); return; }
  Promise.all(toAdd.map(f => readImageAsDataUrl(f, 1000, 1000).then(dataUrl => createAsset('gallery', dataUrl, f.name))))
    .then(newAssets => { project.assets.items.push(...newAssets); afterAssetsChanged(); })
    .catch(err => alert(err.message));
});
function wireThumbRemoval(container) {
  if (!container) return;
  container.addEventListener('click', e => {
    const btn = e.target.closest('.asset-thumb-remove');
    if (!btn || !project) return;
    project.assets.items = project.assets.items.filter(a => a.id !== btn.dataset.assetId);
    afterAssetsChanged();
  });
}
[heroAssetThumbs, galleryAssetThumbs, teamAssetThumbs].forEach(wireThumbRemoval);

$$('.layout-choice').forEach(button => button.addEventListener('click', () => {
  if (!project) return;
  project.design.heroLayout = button.dataset.layout;
  renderProject(project);
}));
resetColors.addEventListener('click', () => {
  if (!project) return;
  const palette = (styles[project.intent.seedKey] || styles.precision).palette;
  project.design.palette = { main: palette.main, background: palette.background, text: palette.text, accent2: palette.accent2 };
  renderProject(project);
});
function toggleSection(type, on) {
  if (!project) return;
  if (on) { if (!project.sections.some(s => s.type === type)) insertSection(project, type); }
  else { project.sections = project.sections.filter(s => s.type !== type); }
  renderProject(project);
  resolveImagePlanAssets(project); // switching on an image-bearing section (e.g. Product) may newly need a generated image
}
if (sectionToggles) {
  sectionToggles.addEventListener('change', event => {
    const input = event.target.closest('input[type="checkbox"]');
    if (!input) return;
    toggleSection(input.value, input.checked);
  });
}
$$('.device-toggle button').forEach(button => button.addEventListener('click', () => {
  $$('.device-toggle button').forEach(b => b.classList.toggle('active', b === button));
  builderDevice.classList.toggle('mobile', button.dataset.device === 'mobile');
  if (project) project.responsive.device = button.dataset.device;
}));

// ---- Refinement controls: tone + regenerate (no named styles anywhere) ----
if (toneToggle) {
  $$('#toneToggle button').forEach(btn => btn.addEventListener('click', () => {
    if (!project) return;
    project.business.tone = btn.dataset.tone;
    renderProject(project);
  }));
}
// V8.1: "Try another direction" is no longer a same-project remix -- it is
// the exact same direction-creation path as the main Generate form (real
// Claude attempt when configured, deterministic variation fallback
// otherwise), just seeded from the CURRENT direction's own business text
// rather than whatever is currently sitting in the textarea. Before the
// limit, this counts toward the 3-direction allowance like any other
// generation. Once 3 directions exist, it creates nothing at all -- it
// becomes the same "switch to the next direction" action the explicit
// Direction 1/2/3 pills provide (renderDirectionSwitcher), so it can never
// be an unlimited-deterministic-generation loophole.
if (regenerateButton) {
  regenerateButton.addEventListener('click', () => {
    if (!project) return;
    if (directions.length >= MAX_DIRECTIONS) {
      switchDirection((activeDirectionIndex + 1) % directions.length);
      return;
    }
    runGeneration(project.source.text);
  });
}
if (conversationRefinement) conversationRefinement.hidden = true;
if (refinementSubmit) refinementSubmit.addEventListener('click', async () => {
  const request = refinementInput && refinementInput.value.trim();
  if (!request) return;
  refinementSubmit.disabled = true;
  await applyRefinementRequest(request);
  refinementSubmit.disabled = false;
  if (refinementInput) refinementInput.value = '';
});
if (saveProjectButton) saveProjectButton.addEventListener('click', saveProjectToStorage);
if (loadProjectButton) loadProjectButton.addEventListener('click', loadProjectFromStorage);
// V6: the builder panel is no longer blurred/locked pre-generation (the old
// full-panel lock overlay is gone -- see SITE-PROJECT-V6.md part 1), but a
// returning visitor still needs a quick way to load a saved project without
// scrolling into the Advanced panel first, so a small link stays next to
// the builder intro copy, wired to the same loader.
if (loadProjectButtonLock) loadProjectButtonLock.addEventListener('click', loadProjectFromStorage);

// ---- Hero live micro-preview: updates as the visitor types, before they
// ever press Generate. Text-only + a live "sections planned" count so the
// compositional system feels alive pre-generation too. ----
let heroLiveTimer;
if (generatorInput) {
  generatorInput.addEventListener('input', () => {
    clearTimeout(heroLiveTimer);
    heroLiveTimer = setTimeout(() => {
      const text = generatorInput.value.trim();
      if (!text) return;
      const analysis = analyzeDescription(text);
      const category = categories[analysis.categoryKey] || categories.other;
      const composed = composeStyleFromAnalysis(text, analysis.categoryKey, analysis.styleKey);
      const dims = { hero: composed.hero, type: composed.type, nav: composed.nav, card: composed.card, imagery: composed.imagery, cta: composed.cta, colorBehavior: composed.colorBehavior, motion: composed.motion, spacing: composed.spacing, pattern: composed.pattern };
      const plan = planAssets(project ? project.assets : { items: [] });
      const previewSections = composeSections(category, dims, plan, analysis.categoryKey, extractBusinessFacts(text));
      const copy = buildCopy(category, analysis.categoryKey, analysis, extractBusinessDescriptor(text));
      if (heroKicker) heroKicker.textContent = copy.kicker;
      if (heroHeadline) heroHeadline.textContent = copy.headline;
      if (heroCardSections) heroCardSections.textContent = `${previewSections.length} planned`;
      if (heroCardBrand) heroCardBrand.textContent = composed.palette.main.toUpperCase();
      if (heroCardIndustry) heroCardIndustry.textContent = category.label;
    }, 220);
  });
}
function wireExampleChip(btn) {
  btn.addEventListener('click', () => {
    generatorInput.value = btn.dataset.example;
    generatorInput.dispatchEvent(new Event('input'));
    generatorInput.focus();
    if (generatorForm.requestSubmit) generatorForm.requestSubmit();
    else generatorForm.dispatchEvent(new Event('submit', { cancelable: true }));
  });
}
if (exampleChipRow) {
  pickExamples(3).forEach(example => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'example-chip';
    btn.dataset.example = example.text;
    const words = example.text.replace(/^A(n)?\s+/i, '').split(' ');
    btn.textContent = words.slice(0, 4).join(' ') + (words.length > 4 ? '…' : '');
    wireExampleChip(btn);
    exampleChipRow.appendChild(btn);
  });
}

// ---- Generation sequence ------------------------------------------------
// V6: each labelled step below IS a real function call that mutates the
// in-progress project, not a decorative timer running alongside an
// already-finished computation (that was the V5 bug: steps were pre-scored
// text taking a fixed 500ms each while the actual generation had already
// completed). The whole pipeline is synchronous/deterministic and normally
// finishes in well under a millisecond of real work; pacing comes only from
// a requestAnimationFrame between steps (so the browser actually paints
// each step's state), never from an artificial setTimeout hold. See
// SITE-PROJECT-V6.md part 1.
function setStepState(li, state, note) {
  if (!li) return;
  li.classList.remove('done', 'active');
  if (state) li.classList.add(state);
  if (note !== undefined) {
    const small = li.querySelector('small');
    if (small) small.textContent = note;
  }
}
function markGenerated() {
  hasGenerated = true;
  if (buyButton) buyButton.disabled = false;
  if (purchaseStatus && !purchaseStatus.dataset.sticky) purchaseStatus.textContent = 'Ready — this is the project that will be purchased.';
}
// ==========================================================================
// V8: Claude website-planning integration
// ==========================================================================
// Claude never renders anything and never becomes a second source of truth
// -- see SITE-PROJECT-V8.md. The server (POST /api/plan-website) forces a
// single structured tool call whose JSON Schema already enum-constrains
// every design field (server.js WEBSITE_PLAN_TOOL). normalizeClaudePlan
// below validates the response AGAIN, independently, against the exact same
// vocabulary the renderer supports -- never trusting the network -- and
// degrades a partially-bad response field-by-field (an unknown/missing enum
// falls back to this category's own default) rather than discarding an
// otherwise-good plan. Only a plan with literally no usable page/section
// structure is rejected outright, sending the caller back to the real V7
// deterministic engine (never "AI unavailable, nothing works").
//
// These lists mirror server.js's HERO_KEYS/TYPE_KEYS/NAV_KEYS/CARD_KEYS/
// IMAGERY_KEYS/CTA_KEYS/COLOR_BEHAVIOR_KEYS/MOTION_KEYS/SPACING_KEYS/
// PATTERN_KEYS/SECTION_TYPE_KEYS one-for-one and MUST stay in sync with
// them (and with dimensionKeywords/categoryDimensionDefaults above, which
// remain this file's own source of truth for what the renderer supports).
const CLAUDE_HERO_KEYS = ['split', 'fullbleed-image', 'centered-oversized', 'stacked-image-below', 'asymmetric-offset', 'minimal-text-only', 'grid-dashboard', 'poster', 'collage', 'product-screenshot', 'editorial-rail'];
const CLAUDE_TYPE_KEYS = ['geo-sans', 'serif-editorial', 'display-condensed', 'classic-serif-mix', 'mono-technical', 'humanist'];
const CLAUDE_NAV_KEYS = ['inline', 'boxed-pill', 'minimal-until-scroll', 'sidebar', 'centered-logo'];
const CLAUDE_CARD_KEYS = ['flat', 'bordered', 'elevated-shadow', 'image-led', 'numbered-editorial', 'outline-ghost'];
const CLAUDE_IMAGERY_KEYS = ['abstract-geometric', 'photo-led-placeholder', 'illustration', 'texture-organic', 'grid-mosaic', 'technical-network', 'editorial-bold', 'atmospheric-warm', 'trade-proof', 'chart-financial', 'nature-cause', 'creative-collage', 'dashboard-ui'];
const CLAUDE_CTA_KEYS = ['solid-pill', 'sharp-block', 'outline-ghost', 'underline-link', 'floating-badge'];
const CLAUDE_COLOR_BEHAVIOR_KEYS = ['neutral-single-accent', 'high-contrast-mono-accent', 'warm-earth-multi-tone', 'dark-luxury-metallic'];
const CLAUDE_MOTION_KEYS = ['none', 'subtle', 'expressive'];
const CLAUDE_SPACING_KEYS = ['standard', 'compact', 'airy', 'generous'];
const CLAUDE_PATTERN_KEYS = ['standard', 'proof-first', 'story-first', 'portfolio-first'];
const CLAUDE_CONTENT_WIDTH_KEYS = ['contained', 'wide', 'edge-to-edge'];
const CLAUDE_IMAGE_DOMINANCE_KEYS = ['supporting', 'balanced', 'dominant'];
const CLAUDE_IMAGE_ARRANGEMENT_KEYS = ['single', 'stacked', 'mosaic', 'rail'];
const CLAUDE_SECTION_RHYTHM_KEYS = ['steady', 'alternating', 'feature-band', 'editorial'];
const CLAUDE_SECTION_ALIGNMENT_KEYS = ['left', 'center', 'split'];
const CLAUDE_TYPOGRAPHY_SCALE_KEYS = ['compact', 'standard', 'display'];
const CLAUDE_HEADING_WIDTH_KEYS = ['narrow', 'balanced', 'wide'];
const CLAUDE_CARD_DENSITY_KEYS = ['airy', 'compact', 'mixed'];
const CLAUDE_CARD_SHAPE_KEYS = ['square', 'soft', 'pill'];
const CLAUDE_SPLIT_RATIO_KEYS = ['even', 'text-heavy', 'media-heavy'];
const CREATIVE_CONCEPT_KEYS = ['institutional-editorial','private-client-luxury','founder-focused','product-led-technical','expressive-creative-technology','enterprise-systems','intimate-editorial','chef-led-premium','portfolio-led','methodology-led','conversion-first','technical-product'];
const CREATIVE_MOOD_KEYS = ['restrained','warm','cinematic','energetic','precise','expressive','quiet-luxury'];
const CREATIVE_NARRATIVE_KEYS = ['editorial','expertise-first','portfolio-led','product-demo-led','credibility-first','conversion-first','founder-story-led','methodology-led','technical-product'];
const CREATIVE_IMAGE_STRATEGY_KEYS = ['photography-led','sparse-premium','editorial-lifestyle','people-team','product-ui','architecture-interior','macro-detail','project-portfolio','abstract-branded','mostly-typographic'];
const CREATIVE_SIGNATURE_KEYS = ['oversized-manifesto','asymmetric-index','editorial-image-rail','large-type-break','case-study-band','split-story','staggered-mosaic','media-interruption','process-timeline','visual-philosophy','product-showcase'];
const CLAUDE_SECTION_TYPE_KEYS = ['proof', 'metrics', 'services', 'features', 'productShowcase', 'integrations', 'pricing', 'faq', 'process', 'gallery', 'caseStudies', 'imageLedEditorial', 'about', 'team', 'testimonial', 'testimonialsGrid', 'menu', 'reservationCta', 'serviceAreas', 'contact', 'newsletter', 'ctaBanner'];
// V9: expanded past the original 4 (hero/product/team/gallery) -- the
// original 4 stay valid so nothing cached/saved with an old role breaks;
// the rest are additions for WHY an image exists, mirroring server.js's
// IMAGE_ROLE_KEYS one-for-one (must stay in sync -- see the sync note above).
const CLAUDE_IMAGE_ROLE_KEYS = ['hero', 'product', 'team', 'gallery', 'atmosphere', 'process', 'founder', 'portfolio', 'location', 'texture', 'editorial', 'feature', 'beforeAfter'];
const CLAUDE_FUNCTIONALITY_STATUS_KEYS = ['supportedNow', 'plannedIntegration', 'requiresCustomBuild'];
// V9: mirrors server.js's ARCHETYPE_KEYS/SOPHISTICATION_KEYS/BUSINESS_SCOPE_KEYS/
// VISUAL_INTENSITY_KEYS/INFORMATION_DENSITY_KEYS/SECTION_INTENT_KEYS/
// HEADLINE_ROLE_KEYS one-for-one -- same dual-file sync requirement as
// every other CLAUDE_*_KEYS list in this block.
const CLAUDE_ARCHETYPE_KEYS = ['product-led-saas', 'service-business', 'premium-consultancy', 'editorial-brand', 'portfolio', 'ecommerce-showcase', 'local-conversion', 'trust-heavy-professional', 'launch-campaign', 'community-nonprofit', 'hospitality'];
const CLAUDE_SOPHISTICATION_KEYS = ['general', 'informed', 'expert'];
const CLAUDE_BUSINESS_SCOPE_KEYS = ['local', 'national', 'digital'];
const CLAUDE_VISUAL_INTENSITY_KEYS = ['quiet', 'standard', 'bold'];
const CLAUDE_INFORMATION_DENSITY_KEYS = ['compact', 'standard', 'spacious'];
const CLAUDE_SECTION_INTENT_KEYS = ['introduce', 'explain', 'compare', 'prove', 'demonstrate', 'reassure', 'convert', 'educate', 'showcase', 'narrate'];
const CLAUDE_HEADLINE_ROLE_KEYS = ['declarative', 'explanatory', 'benefit-led', 'proof-led', 'editorial', 'contrast', 'question'];

function claudeEnum(value, allowed, fallback) { return (typeof value === 'string' && allowed.includes(value)) ? value : fallback; }
function claudeStr(value, max) { return (typeof value === 'string' && value.trim()) ? value.trim().slice(0, max) : ''; }

// Turns Claude's raw submit_website_plan payload into the same shape
// buildGenerationPlan's deterministic path already produces (a validated
// dimensions object, a list of real section types, hero copy, image
// prompts by role) so the renderer never has to know or care which path
// produced a given WebsiteProject. Returns null (never throws) for a plan
// with no usable page/section structure at all -- the caller's job is to
// fall back to the deterministic engine when this returns null.
function normalizeClaudePlan(raw, catDefaults) {
  if (!raw || typeof raw !== 'object') return null;

  const vd = (raw.visualDirection && typeof raw.visualDirection === 'object') ? raw.visualDirection : {};
  const dimensionDefaults = { ...extendedDimensionDefaults, ...(catDefaults || {}) };
  const dimensions = {
    hero: claudeEnum(vd.hero, CLAUDE_HERO_KEYS, dimensionDefaults.hero),
    type: claudeEnum(vd.typography, CLAUDE_TYPE_KEYS, dimensionDefaults.type),
    nav: claudeEnum(vd.nav, CLAUDE_NAV_KEYS, dimensionDefaults.nav),
    card: claudeEnum(vd.card, CLAUDE_CARD_KEYS, dimensionDefaults.card),
    imagery: claudeEnum(vd.imagery, CLAUDE_IMAGERY_KEYS, dimensionDefaults.imagery),
    cta: claudeEnum(vd.cta, CLAUDE_CTA_KEYS, dimensionDefaults.cta),
    colorBehavior: claudeEnum(vd.colorBehavior, CLAUDE_COLOR_BEHAVIOR_KEYS, dimensionDefaults.colorBehavior),
    motion: claudeEnum(vd.motion, CLAUDE_MOTION_KEYS, dimensionDefaults.motion),
    spacing: claudeEnum(vd.spacing, CLAUDE_SPACING_KEYS, dimensionDefaults.spacing),
    pattern: claudeEnum(vd.pattern, CLAUDE_PATTERN_KEYS, dimensionDefaults.pattern),
    contentWidth: claudeEnum(vd.contentWidth, CLAUDE_CONTENT_WIDTH_KEYS, dimensionDefaults.contentWidth),
    imageDominance: claudeEnum(vd.imageDominance, CLAUDE_IMAGE_DOMINANCE_KEYS, dimensionDefaults.imageDominance),
    imageArrangement: claudeEnum(vd.imageArrangement, CLAUDE_IMAGE_ARRANGEMENT_KEYS, dimensionDefaults.imageArrangement),
    sectionRhythm: claudeEnum(vd.sectionRhythm, CLAUDE_SECTION_RHYTHM_KEYS, dimensionDefaults.sectionRhythm),
    sectionAlignment: claudeEnum(vd.sectionAlignment, CLAUDE_SECTION_ALIGNMENT_KEYS, dimensionDefaults.sectionAlignment),
    typographyScale: claudeEnum(vd.typographyScale, CLAUDE_TYPOGRAPHY_SCALE_KEYS, dimensionDefaults.typographyScale),
    headingWidth: claudeEnum(vd.headingWidth, CLAUDE_HEADING_WIDTH_KEYS, dimensionDefaults.headingWidth),
    cardDensity: claudeEnum(vd.cardDensity, CLAUDE_CARD_DENSITY_KEYS, dimensionDefaults.cardDensity),
    cardShape: claudeEnum(vd.cardShape, CLAUDE_CARD_SHAPE_KEYS, dimensionDefaults.cardShape),
    splitRatio: claudeEnum(vd.splitRatio, CLAUDE_SPLIT_RATIO_KEYS, dimensionDefaults.splitRatio)
  };
  const cd = (raw.creativeDirection && typeof raw.creativeDirection === 'object') ? raw.creativeDirection : {};
  const creativeDirection = {
    concept: claudeEnum(cd.concept, CREATIVE_CONCEPT_KEYS, 'methodology-led'),
    visualMood: claudeEnum(cd.visualMood, CREATIVE_MOOD_KEYS, 'precise'),
    narrativeStrategy: claudeEnum(cd.narrativeStrategy, CREATIVE_NARRATIVE_KEYS, 'expertise-first'),
    imageStrategy: claudeEnum(cd.imageStrategy, CREATIVE_IMAGE_STRATEGY_KEYS, 'abstract-branded'),
    signatureMotif: claudeEnum(cd.signatureMotif, CREATIVE_SIGNATURE_KEYS, 'large-type-break'),
    // CREATIVE DIRECTOR V2: independently enum-validated/defaulted exactly
    // like every other creativeDirection field above -- a missing/invalid
    // value never rejects the plan, it just falls back to a neutral
    // default so the deterministic interpreters below (applyHeroStrategy-
    // Bias/rhythmPositionForSection/applyAvoidList) always have something
    // real to read.
    heroStrategy: claudeEnum(cd.heroStrategy, CREATIVE_HERO_STRATEGY_KEYS, 'image-dominant'),
    pageRhythm: claudeEnum(cd.pageRhythm, CREATIVE_PAGE_RHYTHM_KEYS, 'sparse-open-dense-mid'),
    avoid: Array.isArray(cd.avoid) ? cd.avoid.filter(a => typeof a === 'string' && CREATIVE_AVOID_KEYS.includes(a)).slice(0, 3) : []
  };

  // Declared here (rather than at its original lower call site) because the
  // strategy block just below needs business.targetCustomer too.
  const businessRaw = (raw.business && typeof raw.business === 'object') ? raw.business : {};

  // V9: site-strategy reasoning. Every field independently enum-validated/
  // defaulted exactly like `dimensions`/`creativeDirection` above -- a
  // missing or malformed strategy object never rejects the plan, it just
  // falls back to a neutral default (inferStrategy's own 'other' shape is
  // NOT used here deliberately: this is Claude's own reasoning, degraded
  // field-by-field, not silently replaced by the deterministic inference).
  const stratRaw = (raw.strategy && typeof raw.strategy === 'object') ? raw.strategy : {};
  const strategy = {
    archetype: claudeEnum(stratRaw.archetype, CLAUDE_ARCHETYPE_KEYS, 'service-business'),
    audience: { primary: claudeStr(businessRaw.targetCustomer, 120), secondary: claudeStr(stratRaw.secondaryAudience, 120) },
    visitorIntent: claudeStr(stratRaw.visitorIntent, 200),
    conversion: { primary: claudeStr(stratRaw.primaryConversion, 120), secondary: claudeStr(stratRaw.secondaryConversion, 120) },
    credibilityStrategy: claudeStr(stratRaw.credibilityStrategy, 200),
    sophisticationLevel: claudeEnum(stratRaw.sophisticationLevel, CLAUDE_SOPHISTICATION_KEYS, 'general'),
    businessScope: claudeEnum(stratRaw.businessScope, CLAUDE_BUSINESS_SCOPE_KEYS, 'local'),
    proofStrategy: claudeStr(stratRaw.proofStrategy, 200),
    informationHierarchy: Array.isArray(stratRaw.informationHierarchy)
      ? stratRaw.informationHierarchy.filter(x => typeof x === 'string' && x.trim()).slice(0, 6).map(x => x.trim().slice(0, 120))
      : []
  };

  // A page/section survives only if it is structurally real. A page left
  // with zero valid sections after filtering is dropped rather than
  // rendered empty; if nothing survives at all, the whole plan is rejected
  // -- a plan with no usable structure isn't "genuinely influencing
  // structure," it's noise, and noise should fall back to the real engine.
  const rawPages = Array.isArray(raw.pages) ? raw.pages : [];
  const pages = rawPages.map((p, pi) => {
    if (!p || typeof p !== 'object') return null;
    const rawSections = Array.isArray(p.sections) ? p.sections : [];
    // V9: claims dedupe -- dropped here rather than at the schema level so a
    // section keeps its OTHER copy even when one of its claims repeats an
    // earlier one verbatim on this page (never reject a whole section over
    // one redundant line). Compared on trimmed/lowercased text so trivial
    // punctuation/casing differences don't defeat the check.
    const usedClaimTexts = new Set();
    const sections = rawSections
      .filter(s => s && typeof s === 'object' && CLAUDE_SECTION_TYPE_KEYS.includes(s.type))
      .slice(0, 10)
      .map(s => {
        const claims = Array.isArray(s.claims)
          ? s.claims.filter(c => c && typeof c.text === 'string').slice(0, 6).map(c => ({ text: c.text.slice(0, 200), sourced: !!c.sourced }))
          : [];
        const dedupedClaims = claims.filter(c => {
          const key = c.text.trim().toLowerCase();
          if (!key || usedClaimTexts.has(key)) return false;
          usedClaimTexts.add(key);
          return true;
        });
        return {
          type: s.type,
          // V9: why this section exists and what rhetorical shape its
          // headline takes -- independently validated/defaulted like every
          // other enum field; a missing/invalid value never blocks the
          // section, it just falls back to a neutral default so the
          // section-grammar-aware renderer paths (pickVariant/planSection-
          // Grammar) always have something real to read.
          intent: claudeEnum(s.intent, CLAUDE_SECTION_INTENT_KEYS, 'explain'),
          headlineRole: claudeEnum(s.headlineRole, CLAUDE_HEADLINE_ROLE_KEYS, 'declarative'),
          copy: {
            headline: claudeStr(s.headline, 160),
            subhead: claudeStr(s.subhead, 220),
            body: claudeStr(s.body, 500),
            ctaLabel: claudeStr(s.ctaLabel, 40),
            claims: dedupedClaims
          },
          // V8.4: Claude may choose a functionality module (and which of the
          // fixed allowlisted fields to include) for this section -- never a
          // freeform shape. normalizeSectionModuleFromClaude independently
          // re-validates every field against MODULE_SECTION_COMPATIBILITY/
          // MODULE_FIELD_ALLOWLIST regardless of what the schema already
          // constrained server-side, and returns null (silently dropped, never
          // a broken render) for anything unusable -- exactly the same
          // "never trust the network, degrade field-by-field" posture the
          // copy fields above already use.
          module: normalizeSectionModuleFromClaude(s.module, s.type)
        };
      });
    if (!sections.length) return null;
    const planRaw = (p.plan && typeof p.plan === 'object') ? p.plan : {};
    return {
      id: claudeStr(p.id, 40) || `page-${pi}`,
      label: claudeStr(p.label, 40) || `Page ${pi + 1}`,
      purpose: claudeStr(p.purpose, 200),
      // V9: per-page plan, additive -- a page whose `plan` didn't validate
      // still renders exactly as before (defaults match the pre-V9 flat
      // "every page the same weight" behavior), it just doesn't get the
      // extra rhythm/density variation a real plan drives.
      plan: {
        visitorQuestion: claudeStr(planRaw.visitorQuestion, 200),
        primaryCta: claudeStr(planRaw.primaryCta, 60),
        secondaryCta: claudeStr(planRaw.secondaryCta, 60),
        visualIntensity: claudeEnum(planRaw.visualIntensity, CLAUDE_VISUAL_INTENSITY_KEYS, 'standard'),
        informationDensity: claudeEnum(planRaw.informationDensity, CLAUDE_INFORMATION_DENSITY_KEYS, 'standard'),
        copyTone: claudeStr(planRaw.copyTone, 120),
        imageCritical: !!planRaw.imageCritical
      },
      sections
    };
  }).filter(Boolean).slice(0, 8);
  if (!pages.length) return null;

  const heroCopyRaw = (raw.heroCopy && typeof raw.heroCopy === 'object') ? raw.heroCopy : {};
  const heroCopy = {
    kicker: claudeStr(heroCopyRaw.kicker, 40) || null,
    headline: claudeStr(heroCopyRaw.headline, 120) || null,
    sub: claudeStr(heroCopyRaw.sub, 200) || null,
    ctaLabel: claudeStr(heroCopyRaw.ctaLabel, 40) || null
  };

  const imagePromptsByRole = {};
  (Array.isArray(raw.imagePlan) ? raw.imagePlan : []).forEach(entry => {
    if (!entry || typeof entry !== 'object') return;
    const role = claudeEnum(entry.role, CLAUDE_IMAGE_ROLE_KEYS, null);
    const prompt = claudeStr(entry.prompt, 500);
    if (!role || !prompt || imagePromptsByRole[role]) return; // first prompt per role wins; matches one-slot-per-role rendering
    imagePromptsByRole[role] = prompt;
  });

  const functionalityPlan = (Array.isArray(raw.functionalityPlan) ? raw.functionalityPlan : [])
    .filter(f => f && typeof f.feature === 'string' && CLAUDE_FUNCTIONALITY_STATUS_KEYS.includes(f.status))
    .slice(0, 8)
    .map(f => ({ feature: claudeStr(f.feature, 80) || f.feature.slice(0, 80), status: f.status, note: claudeStr(f.note, 200) }));

  // V9: these existed in the schema/prompt long before this pass (business.
  // targetCustomer/positioning/goals, declaredFacts) but nothing ever read
  // them off `raw` -- they were validated by the schema, then discarded.
  // Surfaced here so real business/audience reasoning actually reaches
  // `proj.strategy`/`proj.intent` instead of being computed and thrown away.
  const declaredFactsRaw = (raw.declaredFacts && typeof raw.declaredFacts === 'object') ? raw.declaredFacts : {};
  const declaredFacts = {
    years: claudeStr(declaredFactsRaw.years, 20) || null,
    rating: claudeStr(declaredFactsRaw.rating, 20) || null,
    customerCount: claudeStr(declaredFactsRaw.customerCount, 20) || null,
    location: claudeStr(declaredFactsRaw.location, 80) || null,
    otherFacts: Array.isArray(declaredFactsRaw.otherFacts)
      ? declaredFactsRaw.otherFacts.filter(x => typeof x === 'string' && x.trim()).slice(0, 5).map(x => x.trim().slice(0, 200))
      : []
  };

  return {
    dimensions,
    creativeDirection,
    strategy,
    pages,
    heroCopy,
    businessName: claudeStr(businessRaw.name, 60) || null,
    understanding: claudeStr(businessRaw.understanding, 300),
    targetCustomer: claudeStr(businessRaw.targetCustomer, 200),
    positioning: claudeStr(businessRaw.positioning, 200),
    goals: Array.isArray(businessRaw.goals) ? businessRaw.goals.filter(g => typeof g === 'string' && g.trim()).slice(0, 5).map(g => g.trim().slice(0, 120)) : [],
    declaredFacts,
    rationale: claudeStr(vd.rationale, 240),
    imagePromptsByRole,
    functionalityPlan
  };
}

// The only function that calls POST /api/plan-website. Fails soft in every
// direction (network error, non-200, ok:false, unusable JSON) by returning
// {ok:false} -- runGeneration below is what decides that a failure here
// means "fall back to the deterministic engine," never "generation is
// broken." A failed or skipped call never touches window.__siteremadePlanMeter
// itself; only a real successful response (or an explicit limited response)
// updates the visible "N of 3 AI-planned directions" meter.
async function requestClaudePlan(text, taskType) {
  try {
    const response = await fetch('/api/plan-website', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // taskType is observability metadata only (server.js recordOperation)
      // -- the route's own behavior/limits are unchanged by it.
      body: JSON.stringify({ text, taskType: taskType || 'NEW_SITE' })
    });
    const data = await response.json().catch(() => ({}));
    return data && typeof data === 'object' ? data : { ok: false };
  } catch (error) {
    return { ok: false };
  }
}

// V8.1: this strip now communicates the REAL product rule -- total
// directions used, out of 3, regardless of whether Claude or the
// deterministic engine produced them. It intentionally does NOT read the
// server's Claude-only counter for this number (see requestClaudePlan /
// server.js part 8): `directions.length` is the one number that is always
// accurate, because it's incremented in exactly one place (finishGeneration)
// no matter which engine produced a given direction. Never invasive, never
// blocking.
const generatorAiHint = $('#generatorAiHint');
function updateGeneratorAiHint() {
  if (!generatorAiHint) return;
  const used = directions.length;
  if (used === 0) { generatorAiHint.textContent = ''; generatorAiHint.hidden = true; return; }
  generatorAiHint.hidden = false;
  const aiNote = (window.__siteremadePlanMeter && window.__siteremadePlanMeter.planConfigured) ? ' (AI-planned when available)' : '';
  if (used < MAX_DIRECTIONS) {
    generatorAiHint.textContent = `${used} of ${MAX_DIRECTIONS} website directions used${aiNote}.`;
  } else {
    generatorAiHint.textContent = `You've used all ${MAX_DIRECTIONS} website directions — switch between them below, or keep editing the one you're on.`;
  }
}
// Only ever tells this session whether it's worth ATTEMPTING Claude for the
// next direction -- never the source of truth for how many directions a
// visitor has used (that's directions.length, always). See server.js's
// /api/generation-status for exactly what this does and doesn't observe.
window.__siteremadePlanMeter = { planConfigured: false };

// ---- V8.1: the Direction 1/2/3 switcher -----------------------------------
// Explicit, minimal UI: a row of pills, one per existing direction, shown
// once there is more than one. Switching is pure client-side state --
// zero Claude calls, zero image-provider calls, by construction (it never
// calls requestClaudePlan or resolveImagePlanAssets, it only reassigns
// which already-built WebsiteProject `project` points at and re-renders).
const directionSwitcherEl = $('#directionSwitcher');
function renderDirectionSwitcher() {
  if (!directionSwitcherEl) return;
  if (directions.length < 2) { directionSwitcherEl.hidden = true; directionSwitcherEl.innerHTML = ''; return; }
  directionSwitcherEl.hidden = false;
  directionSwitcherEl.innerHTML = directions.map((d, i) =>
    `<button type="button" class="direction-pill${i === activeDirectionIndex ? ' active' : ''}" data-direction-index="${i}" role="tab" aria-selected="${i === activeDirectionIndex}">Direction ${i + 1}</button>`
  ).join('');
}
function switchDirection(index) {
  // V8.1.1: refuse while a generation transaction owns `directions`/
  // `project` -- otherwise switching mid-generation could reassign global
  // `project` out from under the in-flight transaction (see runGeneration/
  // finishGeneration) or let a stale click land after a direction the
  // visitor was looking at got replaced. This check is authoritative even
  // if switchDirection is called programmatically, not just from the
  // (also disabled, for UX) pill buttons.
  if (generationInFlight || revealPreparationInFlight) return;
  if (!directions.length) return;
  index = Math.max(0, Math.min(directions.length - 1, index));
  if (index === activeDirectionIndex) return;
  const previousIndex = activeDirectionIndex;
  activeDirectionIndex = index;
  project = directions[activeDirectionIndex];
  const preparationToken = ++lifecycle.preparationToken;
  setLifecycleState('switching', project);
  renderDirectionSwitcher();
  revealPreparationInFlight = true;
  prepareProjectForReveal(project, 'switch', preparationToken).then(ready => {
    if (ready) persistDirectionsSilently();
    else {
      activeDirectionIndex = previousIndex;
      project = directions[activeDirectionIndex];
      const rollbackToken = ++lifecycle.preparationToken;
      prepareProjectForReveal(project, 'switch', rollbackToken);
      renderDirectionSwitcher();
    }
  }).finally(() => { revealPreparationInFlight = false; });
}
directionSwitcherEl && directionSwitcherEl.addEventListener('click', event => {
  const pill = event.target.closest('.direction-pill');
  if (pill) switchDirection(Number(pill.dataset.directionIndex));
});
// "Try another direction" reads as exactly that before the limit, and turns
// into the same switching action the pills above provide once all 3 exist
// -- never a second UI concept, never a way past the cap.
function updateDirectionControls() {
  if (!regenerateButton) return;
  const atLimit = directions.length >= MAX_DIRECTIONS;
  regenerateButton.textContent = atLimit ? 'Switch direction' : 'Try another direction';
  updateGeneratorAiHint();
}
// V8.1.1: UX-only -- visually/interactively disables the controls that
// could otherwise start or interrupt a generation while one is already in
// flight (main Generate, "Try another direction"/"Switch direction", and
// the direction pills). This is NOT the enforcement mechanism: it exists
// so a visitor doesn't see a button appear to do nothing when they
// double-click it, but generationInFlight (checked inside runGeneration
// and switchDirection themselves) is what actually makes a concurrent
// call impossible, including a programmatic one that never touches these
// elements at all.
function setGenerationControlsDisabled(disabled) {
  if (generatorSubmitButton) generatorSubmitButton.disabled = disabled;
  if (regenerateButton) regenerateButton.disabled = disabled;
  if (directionSwitcherEl) directionSwitcherEl.classList.toggle('direction-switcher-locked', disabled);
}
function announceDirectionLimitReached() {
  updateGeneratorAiHint();
  renderDirectionSwitcher();
  const target = directionSwitcherEl && !directionSwitcherEl.hidden ? directionSwitcherEl : document.getElementById('build');
  if (target) target.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' });
}

// ---- Deterministic quality critic ------------------------------------------
// Control-plane pass, brief part 8: evaluates the finished WebsiteProject
// before reveal. Entirely rule-based -- no Claude call, ever, for this pass
// (part 9's "targeted AI repair" describes escalating to Claude only when a
// deterministic rule can't fix an issue; this pass implements the
// deterministic side and the detection, and applies the handful of repairs
// that ARE safely automatable, leaving the rest as a real, inspectable
// report rather than silently ignoring them or fabricating a fix).
function findDuplicateSectionPattern(proj) {
  const issues = [];
  (proj.pages || []).forEach(page => {
    const sections = page.sections || [];
    for (let i = 1; i < sections.length; i++) {
      if (sections[i].type === sections[i - 1].type && sections[i].variant === sections[i - 1].variant) {
        issues.push({ pageId: page.id || page.slug, sectionId: sections[i].id, type: sections[i].type });
      }
    }
  });
  return issues;
}
function findRepeatedHeadlines(proj) {
  const seen = new Map();
  const repeats = [];
  (proj.pages || []).forEach(page => (page.sections || []).forEach(section => {
    const headline = section.copy && typeof section.copy.headline === 'string' ? section.copy.headline.trim().toLowerCase() : '';
    if (!headline) return;
    if (seen.has(headline)) repeats.push({ sectionId: section.id, matchesSectionId: seen.get(headline), headline: section.copy.headline });
    else seen.set(headline, section.id);
  }));
  return repeats;
}
function findRepeatedClaims(proj) {
  const seen = new Map();
  const repeats = [];
  (proj.pages || []).forEach(page => (page.sections || []).forEach(section => {
    (section.copy && Array.isArray(section.copy.claims) ? section.copy.claims : []).forEach(claim => {
      const key = String(claim.text || '').trim().toLowerCase();
      if (!key) return;
      if (seen.has(key)) repeats.push({ sectionId: section.id, matchesSectionId: seen.get(key), text: claim.text });
      else seen.set(key, section.id);
    });
  }));
  return repeats;
}
function hasConversionPath(proj) {
  const convertingTypes = ['contact', 'reservationCta', 'newsletter', 'ctaBanner'];
  return (proj.pages || []).some(page => (page.sections || []).some(s => convertingTypes.includes(s.type) || (s.module && s.module.enabled)));
}
function findPagesRepeatingHome(proj) {
  const pages = proj.pages || [];
  if (pages.length < 2) return [];
  const homeSignature = (pages[0].sections || []).map(s => s.type).join(',');
  return pages.slice(1).filter(p => (p.sections || []).map(s => s.type).join(',') === homeSignature).map(p => p.id || p.slug);
}
// Brand-experience pass, item 15/25: a repeated CTA string across multiple
// conversion sections is exactly the "same button everywhere" complaint the
// brief calls out -- ctaLabelForSection (see sectionVocab area above) was
// built to prevent this structurally, but a Claude-authored ctaLabel can
// still override it per section, so this is the safety net that actually
// catches it if it happens, the same "detect, don't silently accept" role
// findRepeatedHeadlines already plays for headline text.
function findRepeatedCtaText(proj, category) {
  const ctaSectionTypes = ['ctaBanner', 'pricing', 'reservationCta', 'contact'];
  const seen = new Map();
  const repeats = [];
  (proj.pages || []).forEach(page => (page.sections || []).forEach(section => {
    if (!ctaSectionTypes.includes(section.type)) return;
    const text = (section.copy && section.copy.ctaLabel) || ctaLabelForSection(proj, category, section.type);
    const key = String(text || '').trim().toLowerCase();
    if (!key) return;
    if (seen.has(key)) repeats.push({ sectionId: section.id, matchesSectionId: seen.get(key), text });
    else seen.set(key, section.id);
  }));
  return repeats;
}
// Item 7/25: a layout that was composed assuming a dominant hero image
// (imageDominance:'dominant') but ends up with no real upload and no
// generated image is real, worth surfacing (a future pass could downgrade
// dominance in this exact case) -- but not safely auto-repairable here,
// since imageDominance is a project-wide dimension other sections may also
// depend on, so this only reports it, same as too_few_images_for_archetype.
function findOversizedEmptyDominantVisuals(proj) {
  if (!proj.design || !proj.design.dimensions || proj.design.dimensions.imageDominance !== 'dominant') return [];
  return (proj.imagePlan || []).filter(entry => entry.role === 'hero' && entry.sourceType === 'designed').map(entry => ({ slot: entry.slot }));
}
// CREATIVE DIRECTOR V2: critic checks that support the new creative layer.
// Every check here reads fields the interpreter above already produced
// (creativeDirection.heroStrategy/pageRhythm/imageStrategy, data-rhythm-
// position) -- no AI critic, no new reasoning, same "detect, repair only
// when safe, otherwise report" posture as the existing checks above.
function findTooManyCardGrids(proj) {
  const GRID_VARIANT_TYPES = { features: 'grid', testimonial: 'card', team: 'grid', testimonialsGrid: 'grid' };
  const offenders = [];
  (proj.pages || [{ sections: proj.sections }]).forEach(page => {
    const gridSections = (page.sections || []).filter(s => GRID_VARIANT_TYPES[s.type] === s.variant);
    if (gridSections.length >= 3) gridSections.slice(2).forEach(s => offenders.push({ pageId: page.id || page.slug, sectionId: s.id, type: s.type }));
  });
  return offenders;
}
function findHeroContradictsPosture(proj, creativeDirection) {
  // Claude-path only: PLANNER_SYSTEM_PROMPT rule 12 explicitly asks Claude
  // to make heroStrategy and visualDirection.hero agree, so a mismatch
  // there is a real signal. The deterministic fallback deliberately never
  // forces `dimensions.hero` from heroStrategy (see applyHeroStrategyBias's
  // own comment -- it only biases secondary dimensions, to avoid fighting
  // the existing seed-matched hero pick), so flagging every deterministic
  // mismatch here would just be reporting an expected, by-design gap, not
  // a real defect.
  if (!proj.meta || proj.meta.planSource !== 'anthropic') return [];
  const heroStrategy = creativeDirection && creativeDirection.heroStrategy;
  const allowed = HERO_STRATEGY_ALLOWED_HERO[heroStrategy];
  if (!allowed || !proj.design || !proj.design.dimensions) return [];
  return allowed.includes(proj.design.dimensions.hero) ? [] : [{ heroStrategy, hero: proj.design.dimensions.hero }];
}
function findImageLedStrategyWithNoImageSection(proj, creativeDirection) {
  const IMAGE_LED_STRATEGIES = ['photography-led', 'editorial-lifestyle', 'architecture-interior', 'project-portfolio'];
  const imageStrategy = creativeDirection && creativeDirection.imageStrategy;
  if (!IMAGE_LED_STRATEGIES.includes(imageStrategy)) return [];
  const IMAGE_LED_SECTION_TYPES = ['gallery', 'imageLedEditorial', 'caseStudies', 'productShowcase'];
  const hasImageLedSection = (proj.pages || [{ sections: proj.sections }]).some(page => (page.sections || []).some(s => IMAGE_LED_SECTION_TYPES.includes(s.type)));
  return hasImageLedSection ? [] : [{ imageStrategy }];
}
function findWeakConversionSection(proj) {
  const CONVERSION_TYPES = ['ctaBanner', 'contact', 'reservationCta', 'newsletter', 'pricing'];
  const sections = proj.sections || [];
  if (!sections.length) return [];
  const last = sections[sections.length - 1];
  return CONVERSION_TYPES.includes(last.type) ? [] : [{ sectionId: last.id, type: last.type }];
}
function findFlatPageRhythm(proj) {
  const sections = proj.sections || [];
  if (sections.length < 4) return [];
  const positions = new Set(sections.map((s, i) => rhythmPositionForSection(s, i, sections.length)));
  return positions.size <= 1 ? [{ pageId: (proj.pages && proj.pages[0] && (proj.pages[0].id || proj.pages[0].slug)) || 'home' }] : [];
}
function findSignatureDeviceMissing(proj, creativeDirection) {
  const motifToType = {
    'oversized-manifesto': 'ctaBanner', 'asymmetric-index': 'services', 'editorial-image-rail': 'imageLedEditorial',
    'large-type-break': 'ctaBanner', 'case-study-band': 'caseStudies', 'split-story': 'about',
    'staggered-mosaic': 'gallery', 'media-interruption': 'imageLedEditorial', 'process-timeline': 'process',
    'visual-philosophy': 'about', 'product-showcase': 'productShowcase'
  };
  const motif = creativeDirection && creativeDirection.signatureMotif;
  const type = motifToType[motif];
  if (!type) return [];
  const present = (proj.pages || [{ sections: proj.sections }]).some(page => (page.sections || []).some(s => s.type === type));
  return present ? [] : [{ signatureMotif: motif, expectedType: type }];
}
// GENERATION STRENGTHENING pass: checks that catch ADJACENT/uniform
// composition -- the sharper "AI template" smell than findTooManyCardGrids'
// own cumulative-count check (which only fires once 3+ card-shaped sections
// exist anywhere on the page, even with plenty of non-card sections between
// them). All of these read fields the composition layer above already
// produces (pickVariant's variant choices, sectionWidthForSection/
// rhythmPositionForSection) -- no new reasoning, no AI critic.
const CARD_SHAPED_VARIANTS = { features: 'grid', testimonial: 'card', team: 'grid', testimonialsGrid: 'grid' };
function findConsecutiveCardSections(proj) {
  const offenders = [];
  (proj.pages || [{ sections: proj.sections }]).forEach(page => {
    const sections = page.sections || [];
    for (let i = 1; i < sections.length; i++) {
      const prevCard = CARD_SHAPED_VARIANTS[sections[i - 1].type] === sections[i - 1].variant;
      const curCard = CARD_SHAPED_VARIANTS[sections[i].type] === sections[i].variant;
      if (prevCard && curCard) offenders.push({ pageId: page.id || page.slug, sectionId: sections[i].id, type: sections[i].type, prevType: sections[i - 1].type });
    }
  });
  return offenders;
}
// Two+ back-to-back card-shaped sections is exactly what avoid:generic-cards
// and pickVariant's card-avoidance branches exist to prevent -- so this is
// safely repairable the same way findTooManyCardGrids already repairs: swap
// the LATER section to the existing non-card variant for its type, never
// touching copy/content.
const CARD_SHAPED_REPAIR_VARIANT = { features: 'list', testimonial: 'centered', team: null, testimonialsGrid: null };
function findRepeatedLayoutVariant(proj) {
  const TRACKED_VARIANTS = ['split', 'centered', 'statement'];
  const offenders = [];
  (proj.pages || [{ sections: proj.sections }]).forEach(page => {
    const counts = {};
    (page.sections || []).forEach(s => {
      if (!TRACKED_VARIANTS.includes(s.variant)) return;
      const key = s.variant;
      counts[key] = (counts[key] || 0) + 1;
      if (counts[key] > 2) offenders.push({ pageId: page.id || page.slug, sectionId: s.id, type: s.type, variant: s.variant });
    });
  });
  return offenders;
}
// A page where every section resolves to the same computed width is only a
// real smell for the rhythms that are DESIGNED to vary width by position
// (sparse-open-dense-mid, dense-proof-compressed, expressive-alternating) --
// steady-editorial deliberately keeps most sections contained by design
// ("fewer boxed sections"), so uniform width there is intended, not a defect.
function findRepeatedSectionWidth(proj) {
  const cd = proj.intent && proj.intent.creativeDirection;
  const pageRhythm = (cd && cd.pageRhythm) || 'sparse-open-dense-mid';
  if (pageRhythm === 'steady-editorial') return [];
  const offenders = [];
  (proj.pages || [{ sections: proj.sections }]).forEach(page => {
    const sections = page.sections || [];
    const total = sections.length;
    if (total < 4) return;
    const widths = sections.map((s, i) => sectionWidthForSection(s, rhythmPositionForSection(s, i, total), pageRhythm));
    if (widths.every(w => w === widths[0])) offenders.push({ pageId: page.id || page.slug, width: widths[0] });
  });
  return offenders;
}
// More than one ctaBanner on the same page dilutes the close instead of
// sharpening it -- report-only: removing a section is a content-structure
// change, not a safe variant swap.
function findTooManyCtaBlocks(proj) {
  const offenders = [];
  (proj.pages || [{ sections: proj.sections }]).forEach(page => {
    const ctaSections = (page.sections || []).filter(s => s.type === 'ctaBanner');
    if (ctaSections.length > 1) ctaSections.slice(1).forEach(s => offenders.push({ pageId: page.id || page.slug, sectionId: s.id }));
  });
  return offenders;
}
// The section right after the hero is the first real "this site was made
// for THIS business" moment -- flag when it's a type with no visual/proof
// weight of its own (report-only: which section to promote is a content
// decision, not a safe mechanical swap).
const STRONG_ANCHOR_TYPES = ['imageLedEditorial', 'gallery', 'productShowcase', 'caseStudies', 'proof', 'metrics', 'services', 'menu'];
function findNoAnchorAfterHero(proj) {
  const sections = proj.sections || [];
  if (!sections.length) return [];
  const first = sections[0];
  return STRONG_ANCHOR_TYPES.includes(first.type) ? [] : [{ sectionId: first.id, type: first.type }];
}
// IMAGE COHERENCE PASS: the reveal-gate regression guard for "visible image
// demand <= fulfillable image supply". reconcileImageSupplyWithSections
// already enforces this once, at generation time, by shrinking a section's
// own imageTileCount -- this re-checks the CURRENT proj.imagePlan against
// whatever each gallery/caseStudies/team section is actually about to
// render, so a later mutation that changes the image plan or a section's
// tile count without re-reconciling (a refinement operation, a restored
// project with a stale imageTileCount) still surfaces the gap instead of
// silently revealing an oversupplied grid. Report-only: closing the gap
// safely means re-running reconciliation, which only the generation flow
// itself has enough context to do without risking a mid-edit surprise.
function findImageSupplyDemandMismatch(proj) {
  const bySection = new Map();
  (proj.imagePlan || []).forEach(entry => {
    if (!bySection.has(entry.section)) bySection.set(entry.section, []);
    bySection.get(entry.section).push(entry);
  });
  const offenders = [];
  (proj.pages || [{ sections: proj.sections }]).forEach(page => {
    (page.sections || []).forEach(section => {
      if (!IMAGE_TILE_SECTION_TYPES.includes(section.type)) return;
      const entries = bySection.get(section.id);
      if (!entries || !entries.length) return;
      const renderedCount = section.imageTileCount || (section.type === 'team' ? entries.length : galleryTileCount(section.variant));
      const realCount = entries.filter(e => e.sourceType !== 'designed').length;
      const tolerated = Math.max(MIN_IMAGE_TILES, realCount);
      if (renderedCount > tolerated) offenders.push({ sectionId: section.id, type: section.type, renderedCount, realCount, tolerated });
    });
  });
  return offenders;
}
// Runs once per finished direction (both Claude and deterministic paths --
// called from the 'build' step below, which both already share), detects
// real issues, and applies ONLY the repairs that are unambiguous and
// reversible through machinery this file already has (pickVariant,
// insertSection) -- never a copy rewrite, which would need real reasoning
// and belongs to the targeted-repair path (part 9), not this one.
function runQualityCritic(proj, variationSeed) {
  const issues = [];
  const criticCreativeDirection = proj.intent && proj.intent.creativeDirection;
  const criticPickCtx = criticCreativeDirection && { avoid: criticCreativeDirection.avoid, pageRhythm: criticCreativeDirection.pageRhythm, heroStrategy: criticCreativeDirection.heroStrategy };
  const duplicatePatterns = findDuplicateSectionPattern(proj);
  duplicatePatterns.forEach(dup => {
    const page = (proj.pages || []).find(p => (p.id || p.slug) === dup.pageId);
    const section = page && (page.sections || []).find(s => s.id === dup.sectionId);
    if (section) {
      // Safe, reversible repair: nudge the variant so two back-to-back
      // same-type sections don't render as visually identical blocks. Never
      // touches copy/content, only the existing variant vocabulary.
      const nudged = pickVariant(section.type, proj.design.dimensions, (variationSeed || 0) + 1, criticPickCtx);
      if (nudged !== section.variant) { section.variant = nudged; issues.push({ code: 'duplicate_section_pattern', detail: dup, repaired: true }); return; }
    }
    issues.push({ code: 'duplicate_section_pattern', detail: dup, repaired: false });
  });
  findRepeatedHeadlines(proj).forEach(dup => issues.push({ code: 'repeated_headline', detail: dup, repaired: false }));
  findRepeatedClaims(proj).forEach(dup => issues.push({ code: 'repeated_claim', detail: dup, repaired: false }));
  if (!hasConversionPath(proj)) {
    // Safe, reversible repair: add the one section type this codebase
    // already treats as the generic conversion close (see
    // ensureSignatureSection's own fallback) to Home.
    insertSection(proj, 'ctaBanner');
    issues.push({ code: 'missing_conversion_path', repaired: true });
  }
  findPagesRepeatingHome(proj).forEach(pageId => issues.push({ code: 'page_repeats_home', detail: { pageId }, repaired: false }));
  const archetype = (proj.strategy && proj.strategy.archetype) || 'service-business';
  const imageLed = imageBudgetForArchetype(archetype) >= 4;
  const realImageCount = (proj.imagePlan || []).filter(p => p.sourceType === 'generated' || p.sourceType === 'user').length;
  if (imageLed && realImageCount === 0) issues.push({ code: 'too_few_images_for_archetype', detail: { archetype }, repaired: false });
  const category = categories[proj.business && proj.business.categoryKey] || categories.other;
  findRepeatedCtaText(proj, category).forEach(dup => issues.push({ code: 'repeated_cta_text', detail: dup, repaired: false }));
  findOversizedEmptyDominantVisuals(proj).forEach(dup => issues.push({ code: 'dominant_layout_no_image', detail: dup, repaired: false }));

  // CREATIVE DIRECTOR V2 checks.
  const creativeDirection = proj.intent && proj.intent.creativeDirection;
  findTooManyCardGrids(proj).forEach(offender => {
    const page = (proj.pages || []).find(p => (p.id || p.slug) === offender.pageId);
    const section = page && (page.sections || []).find(s => s.id === offender.sectionId);
    // Safe, reversible repair: the exact same variant-swap applyAvoidList
    // already uses for 'generic-cards' -- only steers an EXISTING section
    // to a variant that already exists for its type, never invents one.
    if (section && offender.type === 'features' && section.variant === 'grid') { section.variant = 'list'; issues.push({ code: 'too_many_card_grids', detail: offender, repaired: true }); return; }
    if (section && offender.type === 'testimonial' && section.variant === 'card') { section.variant = 'centered'; issues.push({ code: 'too_many_card_grids', detail: offender, repaired: true }); return; }
    issues.push({ code: 'too_many_card_grids', detail: offender, repaired: false });
  });
  // Report-only: swapping the hero post-hoc could desync it from an
  // already-built imagePlan/hero copy that assumed the original hero
  // layout (e.g. a text-only hero has no hero image slot) -- repairing
  // that safely needs re-running the imagery step, out of scope here.
  findHeroContradictsPosture(proj, creativeDirection).forEach(detail => issues.push({ code: 'hero_contradicts_posture', detail, repaired: false }));
  findImageLedStrategyWithNoImageSection(proj, creativeDirection).forEach(detail => {
    // Safe, reversible repair: the same insertSection primitive
    // ensureSignatureSection/missing_conversion_path already use.
    insertSection(proj, 'imageLedEditorial');
    issues.push({ code: 'image_led_strategy_no_image_section', detail, repaired: true });
  });
  findWeakConversionSection(proj).forEach(detail => issues.push({ code: 'weak_conversion_section', detail, repaired: false }));
  findFlatPageRhythm(proj).forEach(detail => issues.push({ code: 'flat_page_rhythm', detail, repaired: false }));
  findSignatureDeviceMissing(proj, creativeDirection).forEach(detail => issues.push({ code: 'signature_device_missing', detail, repaired: false }));

  // GENERATION STRENGTHENING pass: adjacency/uniformity checks.
  findConsecutiveCardSections(proj).forEach(offender => {
    const page = (proj.pages || []).find(p => (p.id || p.slug) === offender.pageId);
    const section = page && (page.sections || []).find(s => s.id === offender.sectionId);
    const repairVariant = CARD_SHAPED_REPAIR_VARIANT[offender.type];
    if (section && repairVariant) { section.variant = repairVariant; issues.push({ code: 'consecutive_card_sections', detail: offender, repaired: true }); return; }
    issues.push({ code: 'consecutive_card_sections', detail: offender, repaired: false });
  });
  findRepeatedLayoutVariant(proj).forEach(detail => issues.push({ code: 'repeated_layout_variant', detail, repaired: false }));
  findRepeatedSectionWidth(proj).forEach(detail => issues.push({ code: 'repeated_section_width', detail, repaired: false }));
  findTooManyCtaBlocks(proj).forEach(detail => issues.push({ code: 'too_many_cta_blocks', detail, repaired: false }));
  findNoAnchorAfterHero(proj).forEach(detail => issues.push({ code: 'no_anchor_after_hero', detail, repaired: false }));
  findImageSupplyDemandMismatch(proj).forEach(detail => issues.push({ code: 'image_supply_demand_mismatch', detail, repaired: false }));

  return { issues, checkedAt: new Date().toISOString() };
}

// Builds the initial (already-real) shell of a WebsiteProject: business
// identity + category + a seed design, enough to render a meaningful first
// paint (the hero, with the right name/category/palette) immediately, then
// returns the ordered list of remaining real phases that progressively
// refine it into the finished project. Nothing here is fake -- it is
// createProject's own logic, exposed as separate steps instead of one
// opaque call, so the UI can reflect each one as it actually runs.
function buildGenerationPlan(text, preserved, claudePlan, variationSeed, canonicalSource) {
  variationSeed = variationSeed || 0;
  const directionNumber = variationSeed + 1;
  const source = canonicalSource || createGenerationSource(text);
  const analysis = source.analysis;
  const category = categories[analysis.categoryKey] || categories.other;
  const sameSource = !!(preserved && preserved.source && preserved.source.generationKey === source.key);
  const facts = source.facts;
  const descriptor = source.descriptor;

  // V8: categoryKey/category detection itself STAYS fully deterministic
  // even for an AI-planned direction -- it's what the renderer's fixed
  // `categories` lookup, palette base-hue table and image-role labels key
  // off of. Claude reasons about the actual business in its own free-text
  // `business.category`/`understanding` fields (kept for the report/report
  // metadata only); it does not get to pick an arbitrary categoryKey the
  // renderer doesn't know about. This is the "which deterministic functions
  // become normalizers vs primary decision makers" answer from
  // SITE-PROJECT-V8.md part 14.1/14.2 made concrete.
  const usingClaude = !!claudePlan;
  // V9: strategy is reasoned about BEFORE structure/dimensions, same order
  // PLANNER_SYSTEM_PROMPT rule 8 asks of Claude -- the deterministic engine
  // holds itself to the same sequence. `strategy.archetype` then feeds the
  // extended-dimension defaults below (this is also the fix for the 9
  // extended dims -- contentWidth/imageDominance/etc -- having had no real
  // per-category variation at all; see archetypeExtendedDimensionDefaults).
  const strategy = usingClaude ? claudePlan.strategy : inferStrategy(analysis.categoryKey, source.text, facts, descriptor);
  const catDefaults = {
    ...extendedDimensionDefaults,
    ...(archetypeExtendedDimensionDefaults[strategy.archetype] || null),
    ...(categoryDimensionDefaults[analysis.categoryKey] || categoryDimensionDefaults.other)
  };
  const dimensions = usingClaude ? claudePlan.dimensions : { ...catDefaults };
  const creativeDirection = composeCreativeDirection(analysis.categoryKey, variationSeed, usingClaude ? claudePlan.creativeDirection : null, source.text, strategy.archetype);
  const previewName = source.extractedName || `${category.label} Studio`;

  // V7: the first-paint shell now seeds its dimensions from the detected
  // CATEGORY's defaults, not the named seed's raw values -- so even before
  // the "structure"/"typography" steps run, an AI company already shows a
  // SaaS-shaped hero instead of the generic split-hero default every result
  // used to start from. V8: when a Claude plan is present, its already-
  // validated dimensions are the real ones from the very first paint --
  // there is no later "compose from keywords" pass to wait for.
  const proj = {
    meta: {
      id: 'proj_' + Date.now().toString(36), createdAt: new Date().toISOString(),
      version: usingClaude ? 'v8' : 'v7', isDemoShell: false,
      planSource: usingClaude ? 'anthropic' : 'deterministic', previewBrandName: !source.extractedName
    },
    source: { text: source.text, location: analysis.location, facts, descriptor, generationKey: source.key },
    business: {
      name: previewName,
      categoryKey: analysis.categoryKey,
      tone: (sameSource && preserved.business && preserved.business.tone) || 'professional'
    },
    intent: {
      seedKey: analysis.styleKey, styleAlternates: analysis.styleAlternates, variationSeed,
      // Claude supplies image PROMPTS/roles only -- the OpenAI image
      // provider remains the only thing that ever generates an actual
      // image (buildImagePrompt/buildImagePlan/resolveImagePlanAssets are
      // completely unchanged by this). See SITE-PROJECT-V8.md part 9.
      claudeImagePrompts: usingClaude ? claudePlan.imagePromptsByRole : null,
      brief: usingClaude ? { understanding: claudePlan.understanding, rationale: claudePlan.rationale } : null,
      creativeDirection
    },
    design: {
      palette: composePalette(analysis.categoryKey, dimensions, analysis.text),
      dimensions: { ...dimensions },
      heroLayout: (sameSource && preserved.design && preserved.design.heroLayout) || 'split'
    },
    copy: buildCopy(category, analysis.categoryKey, analysis, descriptor, variationSeed),
    // V8.2: the real page-aware shape from the very first paint -- an empty
    // Home page (hero is chrome, rendered separately; see renderSections).
    // The 'structure' step below replaces this with the real page(s), same
    // as it has always replaced the placeholder single-section shell.
    pages: [{ slug: '', label: 'Home', purpose: '', sections: [] }],
    activePageIndex: 0,
    footerVariant: 'simple',
    functionalityPlan: usingClaude ? claudePlan.functionalityPlan : null,
    // A fresh Generate submission describes a business that may be entirely
    // different from the last one -- uploaded images still carry over (the
    // person's own asset didn't stop being relevant), but any previously
    // generated images did belong to the old imagePlan's cache keys and are
    // deliberately not carried forward; a real new imagePlan will ask for
    // whatever it actually needs.
    assets: (sameSource && preserved.assets) ? { items: preserved.assets.items.slice(), plan: {}, generated: {} } : { items: [], plan: {}, generated: {} },
    responsive: { device: (sameSource && preserved.responsive && preserved.responsive.device) || 'desktop' }
  };
  proj.sections = proj.pages[0].sections; // same array reference -- see syncActivePageSections
  proj.assets.plan = planAssets(proj.assets);
  // V9: additive -- see migrateProjectPages for the backfill that keeps a
  // pre-V9 saved project (with no `strategy` at all) loading and rendering
  // exactly as it always did.
  proj.strategy = strategy;

  let composed = null;
  const steps = [
    { key: 'understand', run() {
        // Real work already happened above (analyzeDescription + the shell
        // build, or -- for an AI-planned direction -- the already-completed
        // Claude call) -- this step announces that real result rather than
        // recomputing it.
        if (usingClaude) {
          return `Direction ${directionNumber}: ${claudePlan.understanding || (category.label + ' business detected')}${analysis.location ? ' · ' + analysis.location : ''} — AI-planned`;
        }
        return `Direction ${directionNumber}: ${category.label} business detected${analysis.location ? ' in ' + analysis.location : ''}`;
      } },
    { key: 'structure', run() {
        if (usingClaude) {
          // V8.2: assembles ALL of Claude's planned pages (slugs/ids made
          // unique and stable, a duplicate "Home" page prevented, capped at
          // MAX_PAGES) -- not just pages[0] -- into the project's real
          // pages[]. The animated build below still only walks through the
          // HOME page's own section list (proj.sections, unchanged UX from
          // V8.1.2); any secondary pages are fully built here, ready the
          // moment generation finishes -- see switchPage.
          const pages = buildClaudePages(claudePlan.pages, variationSeed, proj.design.dimensions, creativeDirection);
          if (pages) {
            proj.pages = pages;
            proj.activePageIndex = 0;
            proj.sections = proj.pages[0].sections;
            proj.footerVariant = pickVariant('footer', proj.design.dimensions, variationSeed);
            return `${proj.sections.length} sections planned (AI-selected for ${category.label.toLowerCase()}${proj.pages.length > 1 ? `, ${proj.pages.length} pages planned` : ''})`;
          }
          // Defensive only -- normalizeClaudePlan already guarantees at
          // least one page with at least one valid section, so this should
          // be unreachable; falls through to the deterministic build below
          // exactly like an unusable/failed Claude response would.
        }
        // V8.1: a second/third DETERMINISTIC direction for the same business
        // (Claude unavailable/not configured/failed) must still look like a
        // genuinely different direction, not a clone -- this is exactly the
        // old regenerateButton's own "give the ambiguous parts a fresh take"
        // trick (V7), now applied at direction-creation time instead of via
        // in-place mutation: the palette hash and any dimension with no
        // explicit keyword signal are recomputed against a variation-tagged
        // copy of the text, and the ranked style seed is cycled to the next
        // real alternate. Deterministic and reproducible -- never random.
        // (V7's old version of this also rotated the shared `category.services`
        // array in place, which would have silently changed a DIFFERENT,
        // already-created direction's copy on next render -- fixed here by
        // never mutating shared category data at all.)
        // V9: the deterministic engine now plans a REAL multi-page
        // architecture too, driven off the same `strategy.archetype` Claude
        // reasons about -- it previously was always exactly one page. Home's
        // own section selection is untouched (still `composeSections` /
        // `categorySectionRecipes`, deliberately not rebuilt); this adds
        // real secondary pages via `planPageArchitecture`/
        // `sectionRecipeForPageRole`, the deterministic mirror of
        // `buildClaudePages`.
        const stylePool = [analysis.styleKey, ...(analysis.styleAlternates || [])].filter(Boolean);
        const variationStyleKey = stylePool.length ? stylePool[variationSeed % stylePool.length] : analysis.styleKey;
        const variationText = variationSeed ? `${analysis.text}::v${variationSeed}` : analysis.text;
        composed = composeStyleFromAnalysis(variationText, analysis.categoryKey, variationStyleKey, creativeDirection.heroStrategy);
        proj.intent.seedKey = variationStyleKey;
        const orderedTypes = composeSections(category, { ...proj.design.dimensions, pattern: composed.pattern }, proj.assets.plan, analysis.categoryKey, facts);
        const architecture = planPageArchitecture(strategy.archetype, analysis.categoryKey);
        const homeMeta = architecture[0] || pageRoleMeta.home;
        const planFor = (role, imageCritical) => ({
          visitorQuestion: (pageRoleMeta[role] || pageRoleMeta.home).question,
          primaryCta: strategy.conversion.primary,
          secondaryCta: strategy.conversion.secondary,
          visualIntensity: composed.motion === 'expressive' ? 'bold' : (composed.spacing === 'compact' ? 'quiet' : 'standard'),
          informationDensity: composed.cardDensity === 'compact' ? 'compact' : (composed.cardDensity === 'mixed' ? 'standard' : 'spacious'),
          copyTone: strategy.credibilityStrategy,
          imageCritical
        });
        const homeSections = orderedTypes.map((type, i) => {
          const grammar = planSectionGrammar(type, 'home', strategy.archetype, i, orderedTypes.length);
          return { id: `${type}-${i}-${Date.now().toString(36)}`, type, variant: 'default', intent: grammar.intent, headlineRole: grammar.headlineRole };
        });
        const pages = [{ slug: '', label: homeMeta.label || 'Home', purpose: homeMeta.purpose || '', plan: planFor('home', true), sections: homeSections }];
        const usedSlugs = new Set(['']);
        architecture.slice(1).forEach(pageMeta => {
          if (pages.length >= MAX_PAGES) return;
          const types = sectionRecipeForPageRole(pageMeta.role, strategy.archetype, facts);
          if (!types.length) return;
          const slug = uniqueSlug(sanitizeSlug(pageMeta.role), usedSlugs);
          const sections = types.map((type, i) => {
            const grammar = planSectionGrammar(type, pageMeta.role, strategy.archetype, i, types.length);
            return {
              id: `${type}-${slug}-${i}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`,
              type, variant: pickVariant(type, proj.design.dimensions, variationSeed, { avoid: creativeDirection.avoid, pageRhythm: creativeDirection.pageRhythm, heroStrategy: creativeDirection.heroStrategy }),
              intent: grammar.intent, headlineRole: grammar.headlineRole
            };
          });
          pages.push({ slug, label: pageMeta.label, purpose: pageMeta.purpose, plan: planFor(pageMeta.role, ['product', 'work', 'menu'].includes(pageMeta.role)), sections });
        });
        proj.pages = pages;
        proj.activePageIndex = 0;
        proj.sections = proj.pages[0].sections;
        proj.footerVariant = pickVariant('footer', proj.design.dimensions, variationSeed);
        return `${proj.sections.length} sections planned (${category.label.toLowerCase()}${proj.pages.length > 1 ? `, ${proj.pages.length} pages planned` : ''})`;
      } },
    { key: 'typography', run() {
        if (usingClaude) {
          // Dimensions were already validated and applied when the shell
          // was built above -- this step's job is only to announce that
          // real result, same contract as the deterministic path.
          return claudePlan.rationale || describeComposition(proj.design.dimensions);
        }
        proj.design.palette = { ...composed.palette };
        proj.design.dimensions = { hero: composed.hero, type: composed.type, nav: composed.nav, card: composed.card, imagery: composed.imagery, cta: composed.cta, colorBehavior: composed.colorBehavior, motion: composed.motion, spacing: composed.spacing, pattern: composed.pattern, contentWidth: composed.contentWidth, imageDominance: composed.imageDominance, imageArrangement: composed.imageArrangement, sectionRhythm: composed.sectionRhythm, sectionAlignment: composed.sectionAlignment, typographyScale: composed.typographyScale, headingWidth: composed.headingWidth, cardDensity: composed.cardDensity, cardShape: composed.cardShape, splitRatio: composed.splitRatio };
        // CREATIVE DIRECTOR V2 / OUTPUT QUALITY PASS: the deterministic
        // (no-Claude) path had no business-driven hero decision at all --
        // every business in a category got the same fixed hero and the
        // same fixed hero-adjacent dimensions. `composed.hero` above ALREADY
        // reflects heroStrategy now when no real hero keyword matched the
        // text (composeStyleFromAnalysis's own tiebreaker, still losing to
        // a genuine keyword match every time -- see its comment). This bias
        // step is the remaining half: the SECONDARY dimensions
        // (imageDominance/contentWidth/etc) heroStrategy is also
        // responsible for, kept coherent with whichever hero got picked.
        proj.design.dimensions = applyHeroStrategyBias(proj.design.dimensions, creativeDirection.heroStrategy);
        return describeComposition(composed);
      } },
    { key: 'sections', run() {
        const pickCtx = { avoid: creativeDirection.avoid, pageRhythm: creativeDirection.pageRhythm, heroStrategy: creativeDirection.heroStrategy };
        proj.sections.forEach(s => { s.variant = pickVariant(s.type, proj.design.dimensions, variationSeed, pickCtx); });
      ensureSignatureSection(proj, creativeDirection);
        applyAvoidList(proj, creativeDirection);
        proj.copy = buildCopy(category, analysis.categoryKey, analysis, descriptor, variationSeed);
        if (usingClaude) {
          // Deterministic copy above is still computed first so every
          // field always has a safe, real value even when Claude supplied
          // only some of the four heroCopy fields.
          proj.copy = {
            kicker: claudePlan.heroCopy.kicker || proj.copy.kicker,
            headline: claudePlan.heroCopy.headline || proj.copy.headline,
            sub: claudePlan.heroCopy.sub || proj.copy.sub,
            cta: claudePlan.heroCopy.ctaLabel || proj.copy.cta
          };
          // V8.4: whether or not Claude itself planned real functionality
          // (module) on any section, this is the one place both paths
          // always pass through -- ensureFunctionalityDefaults is a no-op
          // the moment a real enabled module already exists anywhere on
          // the site, and otherwise applies the conservative,
          // category-aware deterministic default (see its own comment).
          ensureFunctionalityDefaults(proj, analysis.categoryKey);
          return 'Copy written for this exact business';
        }
        ensureFunctionalityDefaults(proj, analysis.categoryKey);
        return `Content matched to ${category.label}`;
      } },
    { key: 'imagery', run() {
        proj.assets.plan = planAssets(proj.assets);
        ensureAssetDrivenSections(proj);
        // IMAGE COHERENCE PASS: reconciles gallery/caseStudies/team tile
        // counts DOWN to what the unchanged image budget can actually
        // fulfill (never up -- see reconcileImageSupplyWithSections' own
        // comment) before computing the final plan, so a low-budget
        // archetype never ends up rendering more visual slots than it can
        // pay to fill. Runs once, here, at real generation time; every
        // other buildImagePlan call site (ordinary re-render, restore)
        // just reads the `imageTileCount` this stamps onto the section.
        proj.imagePlan = reconcileImageSupplyWithSections(proj, category);
        const n = proj.assets.items.length;
        const generatedCount = proj.imagePlan.filter(p => p.sourceType === 'generated').length;
        if (n) return `${n} of your images placed`;
        if (generatedCount) return `${generatedCount} image${generatedCount === 1 ? '' : 's'} generated`;
        return 'Art-directed imagery matched to your brand';
      } },
    { key: 'build', run() {
        // Additive, never blocks reveal -- a real issue is reported (and,
        // where safely automatable, repaired), not hidden and not a reason
        // to stop the generation this project already promised the visitor.
        proj.qualityReport = runQualityCritic(proj, variationSeed);
        return 'Desktop + mobile preview ready';
      } }
  ];
  return { proj, category, steps };
}
// V8.1: the single place a new WebsiteProject is ever admitted into
// `directions`. Called once generation (Claude or deterministic) has fully
// finished -- this is also where the hard 3-direction cap becomes real:
// nothing before this point has touched `directions`, so a run that never
// reaches here (blocked earlier by the cap) has created nothing at all.
// V8.1.1: takes the *reserved* index this transaction was promised at the
// top of runGeneration(), and never trusts global `project` for identity
// -- only the locally-created `proj` this exact call was handed. Every
// invariant a concurrent/out-of-order call could violate is checked
// before anything is pushed, rendered, or requested; this function -- not
// the generationInFlight lock -- is the hard backstop that decides
// admission.
// V8.1.1: shared by finishGeneration's non-admissible path and the
// generation-step error guard below -- whatever ends a transaction
// (success, a rejected admission, or a genuine runtime exception mid-step)
// must leave Generate/progress UI in the same clean, usable state.
const generationGateOrder = ['understand', 'creative', 'pages', 'copy', 'imagery', 'finalizing'];
function updateGenerationGate(step, note) {
  if (!generationGateSteps) return;
  const currentIndex = generationGateOrder.indexOf(step);
  generationGateOrder.forEach((key, index) => {
    const item = generationGateSteps.querySelector(`[data-gate-step="${key}"]`);
    if (!item) return;
    item.classList.toggle('done', currentIndex > -1 && index < currentIndex);
    item.classList.toggle('active', index === currentIndex);
    const small = item.querySelector('small');
    if (small && index === currentIndex) small.textContent = note || '';
  });
}
function showGenerationGate(state, mode = 'generation') {
  if (!generationGate || !builderDevice) return;
  if (isDemoProject(project) && mode !== 'generation') return;
  builderDevice.classList.add('gate-active');
  if (generationGateIdle) generationGateIdle.hidden = true;
  if (generationGateBuilding) generationGateBuilding.hidden = false;
  generationGate.hidden = false;
  if (generationGateRetry) generationGateRetry.hidden = true;
  if (generationGateStatus) generationGateStatus.textContent = mode === 'restore' ? 'Preparing your website...' : mode === 'switch' ? 'Preparing this direction...' : 'Creating a custom website for your business...';
  updateGenerationGate(state === 'analyzing' ? 'understand' : state === 'planning' ? 'creative' : state === 'composing' ? 'pages' : state === 'generating_images' ? 'imagery' : 'copy');
  lifecycle.gateVisible = true;
}
// Idle-demo state: the demo/example site renders underneath but blurred,
// with this same gate showing a "Generate your website" blocker instead of
// the building checklist -- reuses the identical gate element/positioning,
// just a different inner panel (see index.html). Only meaningful for the
// demo shell; a real project always either has a finished, ungated preview
// or is actively gated by showGenerationGate/failGenerationGate above.
function showIdleGenerationGate() {
  if (!generationGate || !builderDevice) return;
  if (generationGateIdle) generationGateIdle.hidden = false;
  if (generationGateBuilding) generationGateBuilding.hidden = true;
  generationGate.hidden = false;
  builderDevice.classList.add('gate-active');
  lifecycle.gateVisible = true;
}
if (generationGateCta) {
  generationGateCta.addEventListener('click', () => {
    // Reuses the exact same input + validation + generation path as the
    // hero form's own submit button (see wireExampleChip above) -- no
    // second input system, no duplicated generation logic. If
    // #generatorInput is empty, its native `required` attribute blocks the
    // submit and shows the browser's own validation prompt, exactly like
    // pressing the hero Generate button on an empty description.
    if (generatorInput) generatorInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
    if (generatorForm && generatorForm.requestSubmit) generatorForm.requestSubmit();
    else if (generatorForm) generatorForm.dispatchEvent(new Event('submit', { cancelable: true }));
  });
}
function prepareProjectImagePlan(proj) {
  if (!proj || (proj.meta && proj.meta.isDemoShell)) return;
  proj.assets = proj.assets || { items: [], generated: {} };
  proj.assets.generated = proj.assets.generated || {};
  proj.assets.plan = planAssets(proj.assets);
  const category = categories[proj.business && proj.business.categoryKey] || categories.other;
  proj.imagePlan = buildImagePlan(proj, category);
}
async function prepareProjectForReveal(proj, mode = 'restore', token = lifecycle.preparationToken) {
  if (!proj || isDemoProject(proj)) return false;
  if (mode !== 'generation') showGenerationGate('generating_images', mode);
  if (!window.__siteremadeImageProvider && mode !== 'generation') await imageProviderStatusReady;
  if (token !== lifecycle.preparationToken || project !== proj) return false;
  lifecycle.waitingForProvider = false;
  prepareProjectImagePlan(proj);
  if (!window.__siteremadeImageProvider || !window.__siteremadeImageProvider.configured) {
    (proj.imagePlan || []).forEach(entry => {
      if (entry.sourceType !== 'generated') return;
      const current = proj.assets.generated[entry.slot];
      if (!current || current.cacheKey !== entry.cacheKey || !['ready', 'error'].includes(current.status)) {
        proj.assets.generated[entry.slot] = { cacheKey: entry.cacheKey, status: 'error', prompt: entry.prompt };
      }
    });
  }
  if (imagePlanIsTerminal(proj)) {
    renderProject(proj);
    markGenerated();
    completeGenerationGate();
    if (conversationRefinement) conversationRefinement.hidden = false;
    setLifecycleState('ready', proj);
    return true;
  }

  setLifecycleState(mode === 'switch' ? 'generating_images' : 'finalizing', proj);
  updateGenerationGate('imagery', `${imageProgressNote(proj)}${mode === 'restore' ? ' — restoring' : ''}`);
  await resolveImagePlanAssets(proj, () => updateGenerationGate('imagery', imageProgressNote(proj)), { suppressRender: true });
  if (token !== lifecycle.preparationToken || project !== proj) return false;
  updateGenerationGate('finalizing');
  const quality = validateProjectQuality(proj);
  if (!quality.ready) {
    failGenerationGate();
    setLifecycleState('failed', proj);
    return false;
  }
  renderProject(proj);
  markGenerated();
  completeGenerationGate();
  if (conversationRefinement) conversationRefinement.hidden = false;
  setLifecycleState('ready', proj);
  return true;
}
function failGenerationGate() {
  // No isDemoProject bail here (unlike showGenerationGate's restore/switch
  // guard): a failed FIRST attempt reverts `project` back to the demo
  // shell (see runGeneration's finally block), and that failure/retry
  // state must still show -- the demo must never sit fully exposed after
  // a failed generation, only ever idle-gated or failure-gated.
  if (!generationGate || !builderDevice) return;
  builderDevice.classList.add('gate-active');
  if (generationGateIdle) generationGateIdle.hidden = true;
  if (generationGateBuilding) generationGateBuilding.hidden = false;
  generationGate.hidden = false;
  if (generationGateStatus) generationGateStatus.textContent = 'The website could not be completed. Your previous version is safe.';
  if (generationGateRetry) generationGateRetry.hidden = false;
  lifecycle.gateVisible = true;
  generationGateOrder.forEach(key => {
    const item = generationGateSteps && generationGateSteps.querySelector(`[data-gate-step="${key}"]`);
    if (item) item.classList.remove('active');
  });
}
function completeGenerationGate() {
  if (!generationGate || !builderDevice) return;
  updateGenerationGate('finalizing', 'Ready to reveal');
  generationGate.hidden = true;
  builderDevice.classList.remove('gate-active');
  lifecycle.gateVisible = false;
}
function imageProgressNote(proj) {
  const generated = (proj && proj.imagePlan || []).filter(entry => entry.sourceType === 'generated');
  const terminal = generated.filter(entry => proj.assets.generated && proj.assets.generated[entry.slot] && ['ready', 'error'].includes(proj.assets.generated[entry.slot].status)).length;
  return `${terminal} / ${generated.length}`;
}
if (generationGateRetry) generationGateRetry.addEventListener('click', () => {
  if (generationGateStatus) generationGateStatus.textContent = 'Creating a custom website for your business...';
  // Dismissing a failure always reveals whatever is actually safe/finished
  // underneath (see runGeneration's finally block: `project` is already the
  // last good direction, or the demo shell if none exists yet). A demo
  // shell must stay gated -- swap straight back to the idle-demo blocker
  // instead of leaving the raw demo exposed; a real previous direction is
  // already finished, so just dismiss the gate.
  if (isDemoProject(project)) { showIdleGenerationGate(); return; }
  generationGate.hidden = true;
  builderDevice.classList.remove('gate-active');
});

function resetGenerationChromeUI() {
  if (generationProgress) generationProgress.hidden = true;
  if (heroMachine) heroMachine.classList.remove('generating');
  if (heroDemoCopy) heroDemoCopy.style.removeProperty('opacity');
  if (generatorSubmitButton) generatorSubmitButton.disabled = false;
  if (generatorSubmitLabel) generatorSubmitLabel.textContent = 'Generate website';
}
// V8.1.2: returns whether `proj` was actually admitted (true) or not
// (false), so callers can tell runGeneration's `finally` block whether
// global `project` -- reassigned to the transient `proj` for progressive
// first-paint -- needs to be restored to what was actually active before
// this attempt. Nothing about admission itself changes.
function finishGeneration(proj, expectedDirectionIndex) {
  const admissible = generationInFlight
    && directions.length < MAX_DIRECTIONS
    && directions.length === expectedDirectionIndex
    && !directions.includes(proj);
  if (!admissible) {
    // Should be unreachable given the lock in runGeneration -- this is the
    // deliberate defense-in-depth backstop, not the primary mechanism.
    // Never push, never touch resolveImagePlanAssets, never create a
    // direction; just recover the UI so nothing looks stuck.
    resetGenerationChromeUI();
    updateDirectionControls();
    return false;
  }
  directions.push(proj);
  activeDirectionIndex = expectedDirectionIndex;
  project = directions[activeDirectionIndex];
  renderProject(project);
  markGenerated();
  completeGenerationGate();
  if (conversationRefinement) conversationRefinement.hidden = false;
  renderDirectionSwitcher();
  updateDirectionControls();
  persistDirectionsSilently(); // so a plain page refresh can't reset the 3-direction cap -- see SITE-PROJECT-V8.1.md part "closing the reload loophole"

  resetGenerationChromeUI();

  const target = document.getElementById('build');
  if (target) target.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' });
  return true;
}
// V8.1: the ONLY function that creates a new WebsiteProject. Used by both
// the main Generate form and "Try another direction" (before the limit) --
// both just call this with a business description. The hard product rule
// lives at the very top: once 3 directions exist, this returns immediately,
// before any network call, before any deterministic build, before any
// image plan -- Claude being unconfigured/unavailable/failed NEVER
// re-opens the door to "just use the free deterministic engine instead" once
// the visitor already has 3 real directions (that was the bug V8.1 fixes --
// see SITE-PROJECT-V8.1.md).
// V8.1.1: `directions.length` isn't incremented until finishGeneration()
// admits a project, so the check above, alone, doesn't stop two
// overlapping calls from both reading the same length and both passing.
// generationInFlight closes that -- checked and set synchronously, before
// any await, so only one transaction can ever be in progress. The
// transaction's identity is the locally-created `proj` and its reserved
// `expectedDirectionIndex`, captured once up front and threaded through
// every step, the animated reveal, and finishGeneration -- global
// `project` is only ever used here for what's currently on screen, never
// to decide what gets admitted (see SITE-PROJECT-V8.1.1.md).
async function runGeneration(text) {
  if (!text || !text.trim()) return;
  if (generationInFlight) return;
  if (directions.length >= MAX_DIRECTIONS) {
    announceDirectionLimitReached();
    return;
  }
  const expectedDirectionIndex = directions.length; // the exact slot this transaction is reserved for
  const variationSeed = expectedDirectionIndex; // 0, 1, 2 -- which direction this attempt will become if it succeeds
  const submittedSource = createGenerationSource(text);
  if (!generationSession || generationSession.key !== submittedSource.key) generationSession = submittedSource;
  // V8.1.2: this transaction's own pre-generation project, captured before
  // `project` is ever reassigned to the transient `proj` below. `project`
  // cannot change out from under this capture -- switchDirection refuses
  // outright while generationInFlight is true, and nothing else touches it
  // -- so it stays valid as the exact thing to restore to if this attempt
  // never ends up admitting `proj`: either the direction that was active
  // (if any exist yet), or the pre-generation/demo shell (if none do).
  const previousProject = project;
  let admitted = false; // set true only by a successful finishGeneration call below
  generationInFlight = true;
  lifecycle.waitingForProvider = false;
  lifecycle.preparationToken++;
  setLifecycleState('analyzing', project);
  showGenerationGate('analyzing');
  setGenerationControlsDisabled(true);
  try {
    let claudePlan = null;
    const meter = window.__siteremadePlanMeter;
    if (meter && meter.planConfigured) {
      setLifecycleState('planning', project);
      updateGenerationGate('creative');
      if (generatorSubmitButton) generatorSubmitButton.disabled = true;
      if (generatorSubmitLabel) generatorSubmitLabel.textContent = 'Planning with Claude…';
      const result = await requestClaudePlan(text, variationSeed > 0 ? 'NEW_DIRECTION' : 'NEW_SITE');
      if (result && result.ok && result.plan) {
        const catDefaults = categoryDimensionDefaults[analyzeDescription(text).categoryKey] || categoryDimensionDefaults.other;
        claudePlan = normalizeClaudePlan(result.plan, catDefaults);
        // A structurally unusable response (normalizeClaudePlan returned
        // null) is exactly the "invalid model output" case SITE-PROJECT-V8.md
        // part 12 requires falling back from -- it does NOT re-throw or
        // block; claudePlan simply stays null and buildGenerationPlan below
        // runs the real deterministic engine instead. Either way this attempt
        // still produces exactly one direction (see finishGeneration) -- a
        // failed/unusable Claude response is never a reason to produce
        // NOTHING, and it is never a reason to produce a SECOND direction
        // either. It also never releases and re-acquires the lock between
        // the Claude attempt and the deterministic fallback below -- this
        // is all still the same one reserved transaction.
      }
      // A limited/unconfigured/failed response is invisible beyond this --
      // there is no separate error state for the visitor, because nothing is
      // actually broken from their side: the deterministic engine below still
      // produces this direction. It also does NOT re-check `directions.length`
      // again -- the guard at the top of this function already reserved this
      // attempt's place in the 3-direction budget before any network call.
    }

    const { proj, steps } = buildGenerationPlan(generationSession.text, project, claudePlan, variationSeed, generationSession);
    // Whatever was staged in the generator box (attach/drag/paste, before
    // this business even had a project) becomes real assets on THIS
    // project now -- appended, not replacing whatever buildGenerationPlan
    // already carried over from a same-source preserved project above.
    // This runs before any step below (in particular the 'imagery' step,
    // which recomputes assets.plan/imagePlan from assets.items) so a
    // staged upload is treated exactly like a post-generation upload: it
    // wins its slot outright, no generated/paid image is ever requested
    // for it. Purely local state -- no network call of any kind.
    if (pendingUploads.length) {
      pendingUploads.forEach(u => proj.assets.items.push(createAsset(u.type, u.dataUrl, u.name)));
      pendingUploads = [];
      renderPendingUploads();
    }
    setLifecycleState('composing', proj);
    updateGenerationGate('pages');

    if (prefersReducedMotion() || !generationGateSteps) {
      // Real work still runs in full -- only the frame-by-frame reveal is
      // skipped, matching the person's reduced-motion preference.
      steps.forEach(s => s.run());
      setLifecycleState('generating_images', proj);
      updateGenerationGate('imagery', `0 / ${(proj.imagePlan || []).filter(entry => entry.sourceType === 'generated').length}`);
      await resolveImagePlanAssets(proj, () => updateGenerationGate('imagery', imageProgressNote(proj)));
      setLifecycleState('finalizing', proj);
      updateGenerationGate('finalizing');
      const quality = validateProjectQuality(proj);
      if (!quality.ready) throw new Error('Generated project failed its deterministic quality gate');
      admitted = finishGeneration(proj, expectedDirectionIndex);
      return;
    }

    if (generatorSubmitButton) generatorSubmitButton.disabled = true;
    if (generatorSubmitLabel) generatorSubmitLabel.textContent = 'Generating…';

    // First paint: the real shell built above (business name, category,
    // seed palette, hero section) is already meaningful -- show it now
    // instead of waiting for every later step. This is the "begin appearing
    // as soon as enough project state exists" progressive render. `project`
    // is reassigned here purely for what's on screen; the step loop below
    // closes over the local `proj` reference directly and never reads
    // `project` back, so even a stray reassignment of `project` elsewhere
    // (blocked anyway while generationInFlight -- see switchDirection)
    // could not change which object this transaction finalizes.
    project = proj;
    renderProject(proj);

    // V8.1.1: awaited so the try/finally below only releases the lock once
    // the whole animated pipeline -- not just this synchronous kickoff --
    // has actually finished admitting (or failing to admit) `proj`. Each
    // tick also runs inside its own try/catch: a step scheduled via
    // requestAnimationFrame runs outside this function's own call stack,
    // so a genuine exception there would otherwise never reach the
    // try/finally above at all -- the awaited Promise would simply hang
    // forever, permanently stuck with generationInFlight === true. Any
    // such failure resolves (never admits `proj`) and cleans up the UI,
    // the same contract finishGeneration's own non-admissible path keeps.
    await new Promise(resolve => {
      let i = 0;
      function nextStep() {
        try {
          if (i >= steps.length) {
            setLifecycleState('generating_images', proj);
            updateGenerationGate('imagery', `0 / ${(proj.imagePlan || []).filter(entry => entry.sourceType === 'generated').length}`);
            resolveImagePlanAssets(proj, () => updateGenerationGate('imagery', imageProgressNote(proj))).then(() => {
              setLifecycleState('finalizing', proj);
              updateGenerationGate('finalizing');
              const quality = validateProjectQuality(proj);
              if (quality.ready) admitted = finishGeneration(proj, expectedDirectionIndex);
              else resetGenerationChromeUI();
              resolve();
            }).catch(() => { resetGenerationChromeUI(); resolve(); });
            return;
          }
          const note = steps[i].run(); // the real work for this step happens here
          const gateStep = { understand: 'understand', structure: 'pages', typography: 'creative', sections: 'copy', imagery: 'imagery', build: 'finalizing' }[steps[i].key] || 'copy';
          updateGenerationGate(gateStep, note);
          renderProject(proj); // reflect exactly what that real work just changed, on the transaction's own object
          i++;
          // One requestAnimationFrame guarantees a paint has happened before the
          // next step runs -- not a fixed-duration stall. On a typical display
          // the whole 6-step pipeline finishes in well under 150ms.
          requestAnimationFrame(nextStep);
        } catch (error) {
          resetGenerationChromeUI();
          updateDirectionControls();
          resolve();
        }
      }
      nextStep();
    });
  } finally {
    // V8.1.1: the backstop. finishGeneration already resets this chrome on
    // both its success and non-admissible paths, and the in-loop catch
    // above resets it for a step-time exception -- but an exception
    // thrown anywhere else in this transaction (buildGenerationPlan, the
    // first-paint render, or an unforeseen path) would otherwise still
    // release the lock via this finally while leaving Generate/progress
    // UI visibly stuck. Calling it here too is always safe: by the time a
    // successful transaction reaches this point the chrome is already in
    // exactly this state, so it's a no-op, never a second admission or a
    // second image request.
    generationInFlight = false;
    setLifecycleState(admitted ? 'ready' : 'failed', project);
    setGenerationControlsDisabled(false);
    resetGenerationChromeUI();
    updateDirectionControls();
    // V8.1.2: if this transaction did NOT end up admitting `proj` --
    // whether finishGeneration refused it, a genuine exception was caught
    // mid-rAF-step above, or anything else in this transaction threw --
    // global `project` must not keep pointing at that orphaned transient
    // object. Restore it to whatever direction is actually active
    // (directions/activeDirectionIndex are untouched by a failed
    // transaction, so directions[activeDirectionIndex] is exactly right),
    // or to the pre-generation/demo project captured above if no direction
    // has been admitted yet at all. This only re-renders an already-built
    // project -- it never calls resolveImagePlanAssets, so restoring can't
    // cause a new image request.
    if (!admitted) {
      project = directions.length ? directions[activeDirectionIndex] : previousProject;
      renderProject(project);
      renderDirectionSwitcher();
      failGenerationGate();
    }
  }
}

if (generatorForm) {
  generatorForm.addEventListener('submit', event => {
    event.preventDefault();
    runGeneration(generatorInput.value);
  });
}

// ---- V8.5: account / durable project sync ---------------------------------
// After this pass, localStorage is a CACHE/recovery mechanism, never the
// authority for who owns a purchased project -- authentication identifies
// the user, the server/database identifies the project, and verified
// payment binds that exact project to that exact owner (see
// SITE-PROJECT-V8.5.md). Anonymous generation (everything above this block)
// is left completely unaffected: every function here is a no-op until a
// visitor signs in, and even then only ever ADDS a durable server copy on
// top of the existing localStorage behavior, never replaces it.
let currentAccount = null; // {id, email} | null
let serverProjectId = null; // the owned server project this browser is synced to, once signed in + migrated/loaded
let serverProjectRevision = null; // last-known revision, for optimistic-concurrency PUTs (see lib/project-store.js updateOwnedProject)
let ownedProjectsCache = [];
let pendingConflictServerProject = null; // the server's project while accountConflictBlock is asking the visitor to choose
let autosaveTimer = null;
let currentFlushPromise = null; // the in-flight PUT, if any -- see flushServerAutosave
let autosavePendingWhileInFlight = false;
let autosaveRequestSeq = 0;
let autosaveHighestAppliedSeq = 0; // a response is only ever applied if no NEWER request has already completed -- see doAutosaveSave
let autosaveState = 'idle'; // idle | dirty | saving | saved | failed | conflict
const AUTOSAVE_DEBOUNCE_MS = 1500;
const AUTOSAVE_RETRY_MS = 5000;
let resolveAuthReady;
// handlePurchaseReturn (below) can run before this module's own
// refreshAuthState() call has resolved -- it awaits this so a purchase-
// intent poll is never sent unauthenticated and misread as "not found."
const authReadyPromise = new Promise(resolve => { resolveAuthReady = resolve; });

async function apiFetch(path, options = {}) {
  let response;
  try {
    response = await fetch(path, {
      method: options.method || 'GET',
      headers: options.body ? { 'Content-Type': 'application/json' } : undefined,
      body: options.body ? JSON.stringify(options.body) : undefined,
      credentials: 'same-origin',
    });
  } catch (e) {
    return { ok: false, status: 0, data: { ok: false, message: 'Could not reach the server.' } };
  }
  let data = {};
  try { data = await response.json(); } catch (e) { /* non-JSON error page etc. -- data stays {} */ }
  return { ok: response.ok, status: response.status, data };
}

function setAccountAuthStatus(msg, isError) {
  if (accountAuthStatus) accountAuthStatus.textContent = msg;
  if (accountAuthStatus) accountAuthStatus.className = 'account-status' + (isError ? ' error' : '');
}
function setAutosaveState(state, detail) {
  autosaveState = state;
  if (!accountSaveStatus) return;
  const labels = {
    idle: 'Not saved to your account yet.',
    dirty: 'Unsaved changes…',
    saving: 'Saving…',
    saved: 'Saved to your account.',
    failed: 'Could not save — will retry automatically.',
    conflict: 'This project changed on another device — choose a version below.',
  };
  accountSaveStatus.textContent = detail || labels[state] || '';
  accountSaveStatus.dataset.state = state;
}
function updatePurchaseOwnershipBadge() {
  if (!purchaseOwnershipBadge) return;
  const summary = serverProjectId ? ownedProjectsCache.find(p => p.id === serverProjectId) : null;
  const status = summary ? summary.status : null;
  if (status === 'purchased') {
    purchaseOwnershipBadge.hidden = false;
    purchaseOwnershipBadge.dataset.status = 'purchased';
    purchaseOwnershipBadge.textContent = 'Purchased — owned by your account';
  } else if (status === 'checkout_pending') {
    purchaseOwnershipBadge.hidden = false;
    purchaseOwnershipBadge.dataset.status = 'checkout_pending';
    purchaseOwnershipBadge.textContent = 'Checkout in progress for this project…';
  } else {
    purchaseOwnershipBadge.hidden = true;
  }
}
function updateAccountUI() {
  const signedIn = !!currentAccount;
  if (accountSignedOut) accountSignedOut.hidden = signedIn;
  if (accountSignedIn) accountSignedIn.hidden = !signedIn;
  if (signedIn && accountEmailLabel) accountEmailLabel.textContent = currentAccount.email;
  if (signedIn && accountProjectNameInput && !accountProjectNameInput.value && project) {
    accountProjectNameInput.value = (project.business && project.business.name) || 'My website';
  }
  if (accountProjectsSelect) {
    const previousValue = accountProjectsSelect.value;
    accountProjectsSelect.innerHTML = '<option value="">— select a project —</option>' +
      ownedProjectsCache.map(p => `<option value="${escapeHtml(p.id)}">${escapeHtml(p.name)} (${escapeHtml(p.status)})</option>`).join('');
    if (previousValue && ownedProjectsCache.some(p => p.id === previousValue)) accountProjectsSelect.value = previousValue;
  }
  updatePurchaseOwnershipBadge();
  // V8.6: re-render the export/deploy panel from the same account/ownership
  // chokepoint every other account-dependent UI already re-renders from
  // (see this function's own call sites) -- see refreshExportPanel below.
  if (typeof refreshExportPanel === 'function') refreshExportPanel();
  // Product-flow pass: same chokepoint, for the account-wide (not just
  // currently-open-project) My Websites list.
  if (typeof refreshMyWebsitesPanel === 'function') refreshMyWebsitesPanel(false);
}
async function refreshServerProjectStatus() {
  if (!currentAccount || !serverProjectId) return;
  const { ok, data } = await apiFetch(`/api/projects/${encodeURIComponent(serverProjectId)}/purchase-status`);
  if (!ok || !data.ok) return;
  const idx = ownedProjectsCache.findIndex(p => p.id === serverProjectId);
  const patch = { id: data.status.id, status: data.status.status, purchaseRef: data.status.purchaseRef, updatedAt: data.status.updatedAt };
  if (idx === -1) ownedProjectsCache.push({ name: (accountProjectNameInput && accountProjectNameInput.value) || 'Untitled project', ...patch });
  else ownedProjectsCache[idx] = { ...ownedProjectsCache[idx], ...patch };
  updatePurchaseOwnershipBadge();
  if (typeof refreshExportPanel === 'function') refreshExportPanel();
  if (typeof refreshMyWebsitesPanel === 'function') refreshMyWebsitesPanel(true); // a purchase may have just completed -- force a fresh My Websites fetch, don't wait for the lazy per-account cache
}

// A one-time anonymous -> account migration marker, persisted so a visitor
// who signs in, gets migrated, then reloads (or signs out and back in on
// the same browser) is reattached to the SAME server project rather than
// creating a second one -- the server's own sourceLocalId unique index
// (per owner) is the real guarantee; this is a client-side fast path that
// avoids even attempting a redundant create call.
function readMigrationMap() {
  try { return JSON.parse(localStorage.getItem('siteremade:migrationMap') || '{}'); } catch (e) { return {}; }
}
function writeMigrationMapEntry(localId, serverId) {
  try {
    const map = readMigrationMap();
    map[localId] = serverId;
    localStorage.setItem('siteremade:migrationMap', JSON.stringify(map));
  } catch (e) { /* best-effort only */ }
}

function showConflict(serverProject) {
  pendingConflictServerProject = serverProject;
  serverProjectId = serverProject.id;
  if (accountConflictBlock) accountConflictBlock.hidden = false;
  setAutosaveState('conflict');
}
function hideConflict() {
  pendingConflictServerProject = null;
  if (accountConflictBlock) accountConflictBlock.hidden = true;
}

// The single place a loaded server project's directionsState "becomes" the
// live browser state -- reuses applyDirectionsState (shared with
// loadProjectFromStorage above) so there is exactly one restore/migrate/
// render sequence regardless of where the state came from.
function adoptServerProject(serverProject) {
  serverProjectId = serverProject.id;
  serverProjectRevision = serverProject.revision;
  applyDirectionsState(serverProject.directionsState.directions, serverProject.directionsState.activeDirectionIndex);
  if (accountProjectNameInput) accountProjectNameInput.value = serverProject.name;
  try { localStorage.setItem('siteremade:lastProject', serializeDirectionsState()); } catch (e) { /* best-effort only */ }
}

// Loads an owned project by id. If the browser already has unsaved local
// directions that differ from the server's copy, this does NOT silently
// pick a winner (last-write-wins) -- it surfaces the conflict block and
// waits for an explicit choice (see resolveConflictKeepMine/LoadTheirs),
// per the spec's explicit "prefer explicit conflict detection" instruction.
async function loadSelectedOwnedProjectById(id) {
  const { ok, data } = await apiFetch(`/api/projects/${encodeURIComponent(id)}`);
  if (!ok || !data.ok) { setAutosaveState('failed', 'Could not load that project from your account.'); return; }
  const serverProject = data.project;
  const hasLocalContent = directions.length > 0;
  const localMatchesServer = hasLocalContent && serializeDirectionsState() === JSON.stringify(serverProject.directionsState);
  if (hasLocalContent && !localMatchesServer) { showConflict(serverProject); return; }
  adoptServerProject(serverProject);
  setAutosaveState('saved', 'Loaded your saved project.');
  setProjectStatus('Loaded your account project.');
  updateAccountUI();
}
async function resolveConflictKeepMine() {
  if (!pendingConflictServerProject) return;
  const serverProject = pendingConflictServerProject;
  hideConflict();
  serverProjectId = serverProject.id;
  serverProjectRevision = serverProject.revision;
  setAutosaveState('saving');
  const keepName = accountProjectNameInput && accountProjectNameInput.value.trim() ? accountProjectNameInput.value.trim() : undefined;
  const { ok, data } = await apiFetch(`/api/projects/${encodeURIComponent(serverProject.id)}`, {
    method: 'PUT',
    body: { directionsState: { directions, activeDirectionIndex }, expectedRevision: serverProjectRevision, ...(keepName ? { name: keepName } : {}) },
  });
  if (ok && data.ok) {
    serverProjectRevision = data.project.revision;
    setAutosaveState('saved', 'Kept your local version and saved it to your account.');
    await loadOwnedProjectsList();
  } else if (data && data.reason === 'conflict' && data.current) {
    // Something else saved again in the window between showing this
    // conflict and resolving it -- re-present rather than blindly
    // overwriting a version the visitor never actually saw.
    showConflict(data.current);
  } else {
    setAutosaveState('failed', 'Could not save your version — will retry automatically.');
  }
}
function resolveConflictLoadTheirs() {
  if (!pendingConflictServerProject) return;
  const serverProject = pendingConflictServerProject;
  hideConflict();
  adoptServerProject(serverProject);
  setAutosaveState('saved', 'Loaded your account’s version.');
  setProjectStatus('Loaded your account project.');
  updateAccountUI();
}

async function loadOwnedProjectsList() {
  if (!currentAccount) return;
  const { ok, data } = await apiFetch('/api/projects');
  if (ok && data.ok) { ownedProjectsCache = data.projects; updateAccountUI(); }
}

// The exact in-browser project a visitor built pre-auth becomes account-
// owned here, unmodified -- never regenerated, never a semantically
// different project (see SITE-PROJECT-V8.5.md "anonymous -> account
// migration"). A no-op once serverProjectId is already set (this session,
// or reattached via the migration map below) -- never creates a duplicate.
async function migrateLocalProjectToAccount() {
  if (!currentAccount || serverProjectId) return;
  if (!directions.length || !directions[0] || !directions[0].meta) return; // nothing local worth migrating (demo shell only)
  const localId = directions[0].meta.id;
  const migrationMap = readMigrationMap();
  if (migrationMap[localId]) { await loadSelectedOwnedProjectById(migrationMap[localId]); return; }
  const name = (project && project.business && project.business.name) || 'My website';
  const { ok, data } = await apiFetch('/api/projects', {
    method: 'POST',
    body: { name, directionsState: { directions, activeDirectionIndex }, sourceLocalId: localId },
  });
  if (ok && data.ok) {
    serverProjectId = data.project.id;
    serverProjectRevision = data.project.revision;
    writeMigrationMapEntry(localId, serverProjectId);
    if (accountProjectNameInput) accountProjectNameInput.value = data.project.name;
    setAutosaveState('saved', data.migrated ? 'Your saved project is now on your account.' : 'Saved to your account.');
    await loadOwnedProjectsList();
  } else {
    setAutosaveState('failed', (data && data.message) || 'Could not sync to your account yet — your local copy is safe.');
  }
}

async function refreshAuthState() {
  const { ok, data } = await apiFetch('/api/auth/me');
  if (ok && data.authenticated) {
    currentAccount = data.account;
    setAccountAuthStatus(`Signed in as ${data.account.email}.`);
    updateAccountUI();
    await onSignedIn();
  } else {
    currentAccount = null;
  }
  updateAccountUI();
  if (resolveAuthReady) { resolveAuthReady(); resolveAuthReady = null; }
}
async function onSignedIn() {
  await loadOwnedProjectsList();
  await migrateLocalProjectToAccount();
  updateAccountUI();
}

// Sends the CURRENT directions/activeDirectionIndex now, coalescing any
// edit that arrives while a save is already in flight into exactly ONE
// follow-up flush after the current one resolves (never two overlapping
// PUTs, and never more than one queued behind an in-flight one) -- see
// SITE-PROJECT-V8.5.md "autosave". Callers that need a hard guarantee the
// state on screen right now reached the server (checkout) should `await`
// this function's returned promise.
function flushServerAutosave() {
  if (autosaveTimer) { clearTimeout(autosaveTimer); autosaveTimer = null; }
  if (!currentAccount || !serverProjectId) return Promise.resolve(false);
  if (currentFlushPromise) { autosavePendingWhileInFlight = true; return currentFlushPromise; }
  currentFlushPromise = doAutosaveSave().finally(() => {
    currentFlushPromise = null;
    if (autosavePendingWhileInFlight) { autosavePendingWhileInFlight = false; flushServerAutosave(); }
  });
  return currentFlushPromise;
}
async function doAutosaveSave() {
  setAutosaveState('saving');
  // Read at send time, not schedule time -- a coalesced follow-up flush
  // (above) always sends whatever `directions`/`activeDirectionIndex` look
  // like the moment it actually fires, never a stale queued snapshot. The
  // project-name field (below) deliberately does NOT PUT on its own -- it
  // just schedules a flush like any other edit, so a name edit and a
  // content edit can never race each other with two independent PUTs each
  // carrying their own stale expectedRevision (this file's ONE save path,
  // matching runEditorAction's own "one chokepoint" precedent).
  const mySeq = ++autosaveRequestSeq;
  const name = accountProjectNameInput && accountProjectNameInput.value.trim() ? accountProjectNameInput.value.trim() : undefined;
  const payload = { directionsState: { directions, activeDirectionIndex }, expectedRevision: serverProjectRevision, ...(name ? { name } : {}) };
  const { ok, data } = await apiFetch(`/api/projects/${encodeURIComponent(serverProjectId)}`, { method: 'PUT', body: payload });
  // A later flush's response may already have landed and been applied
  // while this one was in flight (shouldn't happen given the in-flight
  // guard above, but this is real defense in depth, not decorative) -- a
  // stale response is never allowed to overwrite newer applied state.
  if (mySeq <= autosaveHighestAppliedSeq) return false;
  autosaveHighestAppliedSeq = mySeq;
  if (ok && data.ok) { serverProjectRevision = data.project.revision; setAutosaveState('saved'); return true; }
  if (data && data.reason === 'conflict' && data.current) { showConflict(data.current); return false; }
  setAutosaveState('failed', (data && data.message) || 'Could not save — will retry automatically.');
  autosaveTimer = setTimeout(() => { autosaveTimer = null; flushServerAutosave(); }, AUTOSAVE_RETRY_MS);
  return false;
}
function scheduleServerAutosave() {
  // No-op until signed in AND synced to a server project (migration/load
  // handles that) -- and paused entirely while a conflict is being shown,
  // so further local edits don't spam repeat conflicts against a revision
  // the visitor hasn't yet chosen to keep or discard.
  if (!currentAccount || !serverProjectId || autosaveState === 'conflict') return;
  setAutosaveState('dirty');
  if (autosaveTimer) clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(() => { autosaveTimer = null; flushServerAutosave(); }, AUTOSAVE_DEBOUNCE_MS);
}
// Guarantees the exact on-screen project state reaches the server before
// checkout binds a purchase intent to it (spec: "payment must grant
// ownership of the EXACT project intended") -- waits out any in-flight/
// coalesced save rather than trusting a save that may already be stale by
// the time this is called.
async function forceSyncBeforeCheckout() {
  if (!currentAccount) return false;
  if (!serverProjectId) { await migrateLocalProjectToAccount(); }
  if (!serverProjectId) return false;
  for (let guard = 0; guard < 6 && (currentFlushPromise || autosavePendingWhileInFlight || autosaveState === 'dirty'); guard++) {
    await flushServerAutosave();
  }
  return autosaveState === 'saved';
}

if (accountSignInBtn) accountSignInBtn.addEventListener('click', () => submitAuthForm('signin'));
if (accountSignUpBtn) accountSignUpBtn.addEventListener('click', () => submitAuthForm('signup'));
async function submitAuthForm(mode) {
  const email = accountEmailInput ? accountEmailInput.value.trim() : '';
  const password = accountPasswordInput ? accountPasswordInput.value : '';
  if (!email || !password) { setAccountAuthStatus('Enter an email and password.', true); return; }
  const btn = mode === 'signin' ? accountSignInBtn : accountSignUpBtn;
  const otherBtn = mode === 'signin' ? accountSignUpBtn : accountSignInBtn;
  if (btn) btn.disabled = true;
  if (otherBtn) otherBtn.disabled = true;
  setAccountAuthStatus(mode === 'signin' ? 'Signing in…' : 'Creating your account…');
  const { ok, data } = await apiFetch(`/api/auth/${mode}`, { method: 'POST', body: { email, password } });
  if (ok && data.ok) {
    currentAccount = data.account;
    if (accountPasswordInput) accountPasswordInput.value = '';
    setAccountAuthStatus(`Signed in as ${data.account.email}.`);
    updateAccountUI();
    await onSignedIn();
  } else {
    setAccountAuthStatus((data && data.message) || 'Could not sign in.', true);
  }
  if (btn) btn.disabled = false;
  if (otherBtn) otherBtn.disabled = false;
}
if (accountSignOutBtn) accountSignOutBtn.addEventListener('click', async () => {
  await apiFetch('/api/auth/signout', { method: 'POST' });
  currentAccount = null;
  serverProjectId = null;
  serverProjectRevision = null;
  ownedProjectsCache = [];
  myWebsitesLoadedForAccount = null;
  latestSnapshot = null;
  hideConflict();
  if (autosaveTimer) { clearTimeout(autosaveTimer); autosaveTimer = null; }
  setAutosaveState('idle');
  setAccountAuthStatus('Signed out.');
  updateAccountUI();
});
// Renaming schedules a flush through the SAME sequenced/coalesced save
// path as any other edit (see doAutosaveSave, which reads this field's own
// current value at send time) -- never a second, independent PUT that
// could race a content autosave and conflict against a stale revision.
if (accountProjectNameInput) accountProjectNameInput.addEventListener('change', () => {
  if (!currentAccount || !serverProjectId) return;
  flushServerAutosave().then(() => loadOwnedProjectsList());
});
if (accountLoadProjectBtn) accountLoadProjectBtn.addEventListener('click', () => {
  const id = accountProjectsSelect ? accountProjectsSelect.value : '';
  if (id) loadSelectedOwnedProjectById(id);
});
if (accountKeepMineBtn) accountKeepMineBtn.addEventListener('click', resolveConflictKeepMine);
if (accountLoadTheirsBtn) accountLoadTheirsBtn.addEventListener('click', resolveConflictLoadTheirs);

// Read-only test hook, matching the existing window.__siteremade* convention.
Object.defineProperty(window, '__siteremadeAccount', {
  get: () => ({
    signedIn: !!currentAccount,
    email: currentAccount ? currentAccount.email : null,
    serverProjectId, serverProjectRevision, autosaveState,
    conflict: !!pendingConflictServerProject,
    ownedProjects: ownedProjectsCache,
  })
});

// ---- V6: purchase flow ---------------------------------------------------
// Buying always purchases the CURRENT in-memory `project` state (whatever
// was last refined), never a stale snapshot from when the page loaded. See
// SITE-PROJECT-V6.md for the full architecture writeup, including what
// backend work this intentionally does not yet do.
//
// The compact payload sent to the server is deliberately NOT the full
// WebsiteProject -- Stripe Checkout metadata is capped (500 chars/value,
// 50 keys) and would reject a project containing uploaded-image data URLs
// anyway. The full project is kept in the browser (localStorage, tagged by
// project id) so a return visit in the same browser can reunite a
// completed payment with the exact project that was bought; reliably
// recovering it from a different device or cleared storage needs the
// backend persistence work documented in SITE-PROJECT-V6.md.
// V8.2: summarizes every real page of the site, not just whichever page the
// live preview happened to be showing when Buy was clicked -- the purchase
// is of the whole multi-page site, so the description on the Stripe line
// item (and the /api/lead "Included" field, same helper) should say so.
// Still a compact description string, never the full WebsiteProject (see
// the note below on why) -- the server clamps it further on its own.
function sectionsSummaryText(proj) {
  const pages = (Array.isArray(proj.pages) && proj.pages.length) ? proj.pages : [{ label: 'Home', sections: proj.sections || [] }];
  if (pages.length === 1) return pages[0].sections.map(s => s.type).join(', ');
  return pages.map(p => `${p.label}: ${(p.sections || []).map(s => s.type).join(', ')}`).join(' | ');
}
function purchaseSummaryPayload(proj) {
  return {
    projectId: proj.meta.id,
    businessName: proj.business.name || 'Your Business',
    industry: (categories[proj.business.categoryKey] || categories.other).label,
    sectionsSummary: sectionsSummaryText(proj),
    brandColor: proj.design.palette.main
  };
}
// V8.5: purchasing is now auth-gated -- payment grants ownership of the
// EXACT server-side project, so there has to BE one before Stripe is ever
// involved (see SITE-PROJECT-V8.5.md part 6). Anonymous visitors are asked
// to sign in first rather than silently buying something that can't yet be
// durably owned; everything else about the flow (compact Stripe metadata,
// never the full WebsiteProject) is unchanged from V6.
if (buyButton) {
  buyButton.addEventListener('click', async () => {
    if (!project) return;
    if (!currentAccount) {
      if (purchaseStatus) { purchaseStatus.dataset.sticky = '1'; purchaseStatus.className = 'purchase-status error'; purchaseStatus.textContent = 'Sign in (or create a free account) above to buy this exact project — purchases are tied to your account, not just this browser.'; }
      if (accountSignedOut) accountSignedOut.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'center' });
      return;
    }
    buyButton.disabled = true;
    if (purchaseStatus) { purchaseStatus.dataset.sticky = '1'; purchaseStatus.className = 'purchase-status'; purchaseStatus.textContent = 'Preparing checkout…'; }
    try {
      // Buying always purchases the CURRENT in-memory project -- guarantee
      // the server-side project this checkout will bind to reflects that
      // exact state before creating the purchase intent (never buy a stale
      // server snapshot; see forceSyncBeforeCheckout).
      const synced = await forceSyncBeforeCheckout();
      if (autosaveState === 'conflict') {
        purchaseStatus.className = 'purchase-status error';
        purchaseStatus.textContent = 'Resolve the version conflict above before buying.';
        return;
      }
      if (!synced || !serverProjectId) throw new Error('sync-failed');
      if (purchaseStatus) purchaseStatus.textContent = 'Starting checkout…';
      const { ok, data } = await apiFetch('/api/checkout', {
        method: 'POST',
        body: { ...purchaseSummaryPayload(project), projectId: serverProjectId },
      });
      if (ok && data.ok && data.url) {
        if (purchaseStatus) purchaseStatus.textContent = 'Redirecting to checkout…';
        window.location.href = data.url;
        return;
      }
      if (purchaseStatus) {
        purchaseStatus.className = 'purchase-status error';
        purchaseStatus.textContent = data.configured === false
          ? 'Checkout isn’t live in this environment yet. Use "Get in Touch" below and we’ll set up your purchase directly.'
          : (data.message || 'Could not start checkout. Please try again shortly.');
      }
    } catch (error) {
      if (purchaseStatus) { purchaseStatus.className = 'purchase-status error'; purchaseStatus.textContent = 'Could not reach checkout. Please try again shortly.'; }
    } finally {
      buyButton.disabled = false;
    }
  });
}
// A completed (or cancelled) Checkout redirects back here carrying the
// purchase-INTENT id, never the raw project id or a trusted "it worked"
// flag -- the query string is only ever a UX trigger to ask the server for
// the intent's real, verified status (see SITE-PROJECT-V8.5.md part 6). The
// webhook that actually fulfils the intent may land before or after this
// return, so this polls briefly rather than treating "not fulfilled yet" on
// the first check as failure.
(function handlePurchaseReturn() {
  const params = new URLSearchParams(window.location.search);
  if (!purchaseStatus) return;
  const intentId = params.get('intent');
  if (params.get('purchased') === '1' && intentId) {
    purchaseStatus.dataset.sticky = '1';
    purchaseStatus.className = 'purchase-status';
    purchaseStatus.textContent = 'Confirming your payment…';
    (async () => {
      await authReadyPromise; // never poll unauthenticated -- would be misread as "not found"
      for (let attempt = 0; attempt < 8; attempt++) {
        const { ok, data } = await apiFetch(`/api/purchase-intents/${encodeURIComponent(intentId)}`);
        if (ok && data.ok) {
          if (data.intent.status === 'fulfilled') {
            purchaseStatus.className = 'purchase-status success';
            purchaseStatus.textContent = 'Payment received — this exact project is now owned by your account.';
            serverProjectId = data.intent.projectId;
            await loadOwnedProjectsList();
            await refreshServerProjectStatus();
            return;
          }
          if (data.intent.status === 'cancelled' || data.intent.status === 'failed') {
            purchaseStatus.className = 'purchase-status error';
            purchaseStatus.textContent = 'This checkout was not completed — your project is unchanged.';
            return;
          }
        } else if (ok === false && !currentAccount) {
          purchaseStatus.className = 'purchase-status';
          purchaseStatus.textContent = 'Sign in to see your payment status for this project.';
          return;
        }
        await new Promise(r => setTimeout(r, 1200));
      }
      purchaseStatus.className = 'purchase-status';
      purchaseStatus.textContent = 'Payment is still being confirmed — this will update shortly, or you can reload the page.';
    })();
  } else if (params.get('purchase_cancelled') === '1') {
    purchaseStatus.dataset.sticky = '1';
    purchaseStatus.className = 'purchase-status';
    purchaseStatus.textContent = 'Checkout was cancelled — your project is unchanged and still here whenever you’re ready.';
  }
})();

const revealItems = $$('.reveal');
if ('IntersectionObserver' in window) {
  const observer = new IntersectionObserver(entries => entries.forEach(entry => {
    if (entry.isIntersecting) { entry.target.classList.add('visible'); observer.unobserve(entry.target); }
  }), { threshold: .1 });
  revealItems.forEach(item => observer.observe(item));
} else revealItems.forEach(item => item.classList.add('visible'));

leadForm.addEventListener('submit', async event => {
  event.preventDefault();
  // Note: the visible "Business name" field in this form shares the
  // generator's business name via #formBusiness, kept in sync by every
  // renderProject() call already -- deliberately NOT re-synced here, or a
  // visitor's manual edit to this field made right before submitting would
  // get silently overwritten (a real bug caught in V5 lead-handoff testing).
  const submitButton = leadForm.querySelector('button[type="submit"]');
  const originalLabel = submitButton.textContent;
  submitButton.disabled = true;
  submitButton.textContent = 'Sending…';
  formStatus.className = 'form-status';
  formStatus.textContent = 'Saving your direction…';
  try {
    const formData = new FormData(leadForm);
    const payload = Object.fromEntries(formData.entries());
    const response = await fetch('/api/lead', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.ok) throw new Error(result.message || 'Unable to send your design.');
    formStatus.className = 'form-status success';
    formStatus.textContent = result.message || 'Design received. We’ll review it and get back to you.';
  } catch (error) {
    formStatus.className = 'form-status error';
    formStatus.textContent = error.message || 'Something went wrong. Please email hello@siteremade.com.';
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = originalLabel;
  }
});

// ---- Bootstrap ------------------------------------------------------------
// V8.1: try a SILENT restore of any directions this visitor already has
// before falling back to the neutral demo shell. Without this, a plain page
// refresh would reset `directions` to empty and quietly hand the visitor 3
// more free directions -- the exact "does not fully cap our paid API
// exposure" gap this pass exists to close. This is best-effort and shares
// storage with the explicit Save/Restore feature (same key) -- a visitor
// who deliberately clears site data can still reset the count, which is the
// same disclosed, honest limitation as the anonymous cookie mechanism
// itself (SITE-PROJECT-V8.md part 7/8); this only closes the casual,
// non-adversarial "I hit refresh" case.
let restoredDirectionsOnBoot = false;
try {
  const raw = localStorage.getItem('siteremade:lastProject');
  if (raw) {
    const parsed = JSON.parse(raw);
    if (parsed && Array.isArray(parsed.directions) && parsed.directions.length) {
      // V8.5: reuses the exact same restore/migrate/render sequence
      // loadProjectFromStorage uses (see applyDirectionsState above) -- one
      // real, tested "become a loaded {directions, activeDirectionIndex}
      // state" path, not a second hand-duplicated copy of it here.
      applyDirectionsState(parsed.directions, parsed.activeDirectionIndex);
      restoredDirectionsOnBoot = true;
    }
  }
} catch (e) { /* falls through to the demo shell below */ }
if (!restoredDirectionsOnBoot) {
  // Deliberately NOT styled like a real generated result (V7 part 7d -- see
  // hero-demo-shell / isDemoShell above) and never counted as a direction.
  // It shows neutral copy and a distinct "preview" visual treatment so a
  // visitor never mistakes the empty state for an actual generated site.
  project = createProject({ text: '', categoryKey: 'other', styleKey: 'precision', styleAlternates: [], location: '' }, null, true);
  lifecycle.waitingForProvider = false;
  lifecycle.preparationToken++;
  setLifecycleState('idle', project);
  renderProject(project);
  showIdleGenerationGate();
}
year.textContent = new Date().getFullYear();
// V8.5: resolve signed-in state (and, if signed in, load owned projects and
// migrate whatever local project just got restored above) -- fire-and-
// forget from bootstrap's own synchronous flow; authReadyPromise is how the
// purchase-return handler above waits for this without blocking first
// paint on it.
refreshAuthState();
// V7: best-effort provider status check -- see buildImagePlan. Never blocks
// generation; if this hasn't resolved yet, imagePlan safely defaults to the
// honest 'designed' tier (see server.js for what /api/image-provider-status
// actually reports in this environment).
fetch('/api/image-provider-status').then(r => r.json()).then(status => {
  window.__siteremadeImageProvider = status;
  imageProviderStatusResolve();
  if (project && !isDemoProject(project) && lifecycle.waitingForProvider && !revealPreparationInFlight) {
    const preparationToken = ++lifecycle.preparationToken;
    revealPreparationInFlight = true;
    prepareProjectForReveal(project, 'restore', preparationToken).finally(() => { revealPreparationInFlight = false; });
  }
}).catch(() => { imageProviderStatusResolve(); });
// V8: best-effort AI-planning status + remaining-credits check -- same
// never-blocks contract as the image-provider check above. If this hasn't
// resolved yet (or fails outright), window.__siteremadePlanMeter keeps its
// honest default (planConfigured:false), so a Generate submission simply
// skips the Claude attempt entirely and runs the real deterministic engine,
// exactly as it always has.
fetch('/api/generation-status').then(r => r.json()).then(meter => {
  if (meter && typeof meter === 'object') {
    window.__siteremadePlanMeter = meter;
    updateDirectionControls(); // refreshes the hint's "(AI-planned when available)" note; the direction COUNT it shows always comes from directions.length, never from this
  }
}).catch(() => {});

// ==========================================================================
// V8.6: export + deployment packaging + hosting/domain handoff -- minimum
// delivery UI (spec §27). Purely additive: reads serverProjectId/
// serverProjectRevision/apiFetch/ownedProjectsCache, all established by
// V8.5 above, and never mutates the in-memory `project`/`directions` model
// -- export is read-only from the client's perspective (the server compiles
// from ITS OWN persisted copy, never from anything this panel sends).
// ==========================================================================
const exportPanel = $('#exportPanel');
const exportRuntimeLine = $('#exportRuntimeLine');
const exportRuntimeReasons = $('#exportRuntimeReasons');
const exportRevisionNote = $('#exportRevisionNote');
const exportSnapshotBadge = $('#exportSnapshotBadge');
const exportStatusHeadline = $('#exportStatusHeadline');
const exportHostingRecommendation = $('#exportHostingRecommendation');
const exportButton = $('#exportButton');
const exportStatus = $('#exportStatus');
const exportDownloadLink = $('#exportDownloadLink');
const domainHandoff = $('#domainHandoff');
const domainInput = $('#domainInput');
const domainSubmitButton = $('#domainSubmitButton');
const domainRecords = $('#domainRecords');
const domainVerifyButton = $('#domainVerifyButton');
const domainStatus = $('#domainStatus');
// Product-flow pass: hosting CHOICE (distinct from the read-only technical
// recommendation above) + My Websites, both additive to the V8.6 panel.
const hostingChoiceBlock = $('#hostingChoiceBlock');
const hostingProviderSelect = $('#hostingProviderSelect');
const hostingProviderNote = $('#hostingProviderNote');
const hostingChoiceSaveBtn = $('#hostingChoiceSaveBtn');
const hostingChoiceSelfBtn = $('#hostingChoiceSelfBtn');
const hostingChoiceSkipBtn = $('#hostingChoiceSkipBtn');
const hostingChoiceStatus = $('#hostingChoiceStatus');
const myWebsitesPanel = $('#myWebsitesPanel');
const myWebsitesEmpty = $('#myWebsitesEmpty');
const myWebsitesList = $('#myWebsitesList');

let exportPanelLoaded = false; // avoids refetching hosting-recommendation/deployments on every unrelated updateAccountUI() call
let latestDeployment = null;
let latestDomainId = null;
let latestSnapshot = null; // { id, directionIndex, projectRevision, hostingChoice, createdAt } for the currently open project, once purchased
let hostingProvidersCache = null; // GET /api/hosting-providers is public + static -- fetched once, reused by both the export panel and every My Websites row
let myWebsitesLoadedForAccount = null; // the account id My Websites was last fetched for -- refetches on sign-in/out, not on every unrelated updateAccountUI() call

const RUNTIME_REASON_LABELS = {
  contact_form_submission: 'a contact form that really needs to receive submissions',
  quote_request: 'a quote-request form',
  booking_request: 'a booking-request form',
  newsletter_submission: 'a newsletter signup',
};
function humanizeRuntimeReason(reason) { return RUNTIME_REASON_LABELS[reason] || reason; }

async function refreshExportPanel() {
  if (!exportPanel) return;
  const summary = serverProjectId ? ownedProjectsCache.find(p => p.id === serverProjectId) : null;
  const purchased = summary && summary.status === 'purchased';
  exportPanel.hidden = !purchased;
  if (!purchased) return;
  if (exportButton) exportButton.disabled = false;
  if (exportStatus) exportStatus.textContent = 'Ready to export this exact project.';
  if (hostingChoiceBlock) hostingChoiceBlock.hidden = false;
  if (exportPanelLoaded) { renderHostingChoiceUi(); return; } // one-time load per purchased-project view -- exportButton's own click handler refreshes after a real export
  exportPanelLoaded = true;
  const [{ ok: recOk, data: recData }, { ok: depOk, data: depData }, { ok: snapOk, data: snapData }, providers] = await Promise.all([
    apiFetch(`/api/projects/${encodeURIComponent(serverProjectId)}/hosting-recommendation`),
    apiFetch(`/api/projects/${encodeURIComponent(serverProjectId)}/deployments`),
    apiFetch(`/api/projects/${encodeURIComponent(serverProjectId)}/purchase-snapshot`),
    loadHostingProviders(),
  ]);
  if (recOk && recData.ok) {
    const rec = recData.recommendation;
    if (exportRuntimeLine) exportRuntimeLine.textContent = rec.runtimeType === 'static'
      ? 'This site needs no server -- static/shared hosting is enough.'
      : 'This site needs a real backend -- it has:';
    if (exportRuntimeReasons) exportRuntimeReasons.innerHTML = (rec.runtimeReasons || [])
      .map(reason => `<li>${escapeHtml(humanizeRuntimeReason(reason))}</li>`).join('');
    if (exportHostingRecommendation) {
      const names = rec.recommendedTargets.map(k => k).join(', ');
      exportHostingRecommendation.textContent = `Fits: ${names || 'local export'}. ${rec.reasoning}`;
    }
  }
  if (snapOk && snapData.ok) latestSnapshot = snapData.snapshot;
  if (depOk && depData.ok && depData.deployments.length) {
    const goodOne = depData.deployments.find(d => d.state === 'ready' || d.state === 'live') || null;
    latestDeployment = goodOne || depData.deployments[0];
    applyDeploymentToUi(latestDeployment, depData.deployments[0]);
  }
  renderHostingChoiceUi();
}
// Providers are static, public, and shared by both the export panel and
// every row of the My Websites list -- fetched once per page load.
async function loadHostingProviders() {
  if (hostingProvidersCache) return hostingProvidersCache;
  const { ok, data } = await apiFetch('/api/hosting-providers');
  hostingProvidersCache = (ok && data.ok) ? data.providers : [];
  return hostingProvidersCache;
}
function renderHostingChoiceUi() {
  if (!hostingProviderSelect || !hostingProvidersCache) return;
  if (!hostingProviderSelect.dataset.populated) {
    hostingProviderSelect.dataset.populated = '1';
    hostingProviderSelect.innerHTML = '<option value="">— choose a host —</option>' + hostingProvidersCache
      .filter(p => p.key !== 'local')
      .map(p => `<option value="${escapeHtml(p.key)}">${escapeHtml(p.label)}${p.available ? '' : ' (handoff not yet automated here)'}</option>`).join('');
  }
  const choice = latestSnapshot && latestSnapshot.hostingChoice;
  if (choice && choice.provider && choice.provider !== 'self') {
    hostingProviderSelect.value = choice.provider;
    const p = hostingProvidersCache.find(x => x.key === choice.provider);
    if (hostingProviderNote) { hostingProviderNote.hidden = false; hostingProviderNote.textContent = p ? p.description : ''; }
    if (hostingChoiceStatus) hostingChoiceStatus.textContent = `Hosting: ${p ? p.label : choice.provider} -- saved.`;
  } else if (choice && choice.provider === 'self') {
    if (hostingChoiceStatus) hostingChoiceStatus.textContent = 'Hosting: you chose to self-host.';
  } else if (choice && choice.skipped) {
    if (hostingChoiceStatus) hostingChoiceStatus.textContent = 'Hosting: not decided yet -- your download works either way.';
  } else {
    if (hostingChoiceStatus) hostingChoiceStatus.textContent = '';
  }
}
async function saveHostingChoice(body) {
  if (!serverProjectId) return;
  [hostingChoiceSaveBtn, hostingChoiceSelfBtn, hostingChoiceSkipBtn].forEach(b => { if (b) b.disabled = true; });
  if (hostingChoiceStatus) hostingChoiceStatus.textContent = 'Saving…';
  const { ok, data } = await apiFetch(`/api/projects/${encodeURIComponent(serverProjectId)}/hosting-choice`, { method: 'POST', body });
  [hostingChoiceSaveBtn, hostingChoiceSelfBtn, hostingChoiceSkipBtn].forEach(b => { if (b) b.disabled = false; });
  if (!ok || !data.ok) { if (hostingChoiceStatus) hostingChoiceStatus.textContent = (data && data.message) || 'Could not save that.'; return; }
  if (latestSnapshot) latestSnapshot = { ...latestSnapshot, hostingChoice: data.hostingChoice };
  renderHostingChoiceUi();
  refreshMyWebsitesPanel(true); // this project's row should reflect the new choice immediately
}
if (hostingChoiceSaveBtn) hostingChoiceSaveBtn.addEventListener('click', () => {
  const provider = hostingProviderSelect ? hostingProviderSelect.value : '';
  if (!provider) { if (hostingChoiceStatus) hostingChoiceStatus.textContent = 'Pick a host from the list first.'; return; }
  saveHostingChoice({ provider });
});
if (hostingChoiceSelfBtn) hostingChoiceSelfBtn.addEventListener('click', () => saveHostingChoice({ provider: 'self' }));
if (hostingChoiceSkipBtn) hostingChoiceSkipBtn.addEventListener('click', () => saveHostingChoice({ skipped: true }));
function applyDeploymentToUi(goodDeployment, mostRecent) {
  if (!goodDeployment) return;
  if (exportStatusHeadline) exportStatusHeadline.textContent = `Exported (revision ${goodDeployment.projectRevision})`;
  // Always-visible (not conditional on a revision mismatch, unlike
  // exportRevisionNote below): this download is a frozen purchase
  // snapshot, permanently bound to this revision, distinct from whatever
  // the live editable draft above is now at.
  if (exportSnapshotBadge) {
    exportSnapshotBadge.hidden = false;
    exportSnapshotBadge.textContent = `Purchased snapshot — revision ${goodDeployment.projectRevision}, frozen forever`;
  }
  if (exportDownloadLink) {
    exportDownloadLink.hidden = false;
    exportDownloadLink.href = `/api/deployments/${encodeURIComponent(goodDeployment.id)}/download`;
  }
  if (domainHandoff) domainHandoff.hidden = false;
  // Product-flow pass: export now compiles EXCLUSIVELY from the immutable
  // purchase snapshot (see server.js's rewritten POST .../export), never
  // from the live draft -- so a higher live serverProjectRevision no longer
  // means "export again to publish it." Re-exporting always reproduces the
  // exact same purchased version. This note is now purely informational:
  // it tells the owner their later edits are saved to the project but are
  // NOT part of this download, rather than implying a re-export would help.
  if (exportRevisionNote && serverProjectRevision != null) {
    if (mostRecent && mostRecent.id !== goodDeployment.id && mostRecent.state === 'failed') {
      exportRevisionNote.hidden = false;
      exportRevisionNote.textContent = `A more recent export attempt failed (${mostRecent.failureReason || 'unknown error'}) -- the version above is still the last good one.`;
    } else if (serverProjectRevision > goodDeployment.projectRevision) {
      exportRevisionNote.hidden = false;
      exportRevisionNote.textContent = `This download is the exact version you purchased (revision ${goodDeployment.projectRevision}). You've since made further edits in the editor above (now at revision ${serverProjectRevision}) -- those are saved to your project, but this purchased download stays exactly as bought and won't include them.`;
    } else {
      exportRevisionNote.hidden = true;
    }
  }
}
if (exportButton) {
  exportButton.addEventListener('click', async () => {
    if (!serverProjectId) return;
    exportButton.disabled = true;
    if (exportStatus) exportStatus.textContent = 'Saving your latest changes…';
    // §3: force/verify the latest autosave before export -- refuses to
    // export a stale in-memory snapshot the server hasn't actually seen.
    if (typeof flushServerAutosave === 'function') await flushServerAutosave();
    if (exportStatus) exportStatus.textContent = 'Compiling your export…';
    const { ok, data } = await apiFetch(`/api/projects/${encodeURIComponent(serverProjectId)}/export`, {
      method: 'POST', body: { expectedRevision: serverProjectRevision },
    });
    exportButton.disabled = false;
    if (!ok || !data.ok) {
      if (data && data.reason === 'stale_revision') {
        if (exportStatus) exportStatus.textContent = 'Your project changed since this page loaded -- reloading and trying again may help.';
      } else {
        if (exportStatus) exportStatus.textContent = (data && data.message) || 'Export failed.';
      }
      return;
    }
    latestDeployment = data.deployment;
    if (exportStatus) exportStatus.textContent = 'Export ready.';
    applyDeploymentToUi(data.deployment, data.deployment);
  });
}
if (domainSubmitButton) {
  domainSubmitButton.addEventListener('click', async () => {
    if (!serverProjectId || !domainInput) return;
    domainSubmitButton.disabled = true;
    const { ok, data } = await apiFetch(`/api/projects/${encodeURIComponent(serverProjectId)}/domain`, {
      method: 'POST', body: { domain: domainInput.value, target: 'local' },
    });
    domainSubmitButton.disabled = false;
    if (!ok || !data.ok) { if (domainStatus) domainStatus.textContent = (data && data.message) || 'Enter a valid domain.'; return; }
    latestDomainId = data.domain.id;
    if (domainRecords) {
      domainRecords.innerHTML = '<p>Add these DNS records with your domain registrar:</p><ul>' +
        data.domain.dnsRecords.map(r => `<li>${escapeHtml(r.type)} · ${escapeHtml(r.hostName)} → ${escapeHtml(r.valueTarget)} (TTL ${r.ttl})<br><small>${escapeHtml(r.note || '')}</small></li>`).join('') +
        '</ul>';
    }
    if (domainVerifyButton) domainVerifyButton.hidden = false;
    if (domainStatus) domainStatus.textContent = 'Instructions generated -- not verified yet.';
  });
}
if (domainVerifyButton) {
  domainVerifyButton.addEventListener('click', async () => {
    if (!latestDomainId) return;
    domainVerifyButton.disabled = true;
    if (domainStatus) domainStatus.textContent = 'Checking…';
    const { ok, data } = await apiFetch(`/api/domains/${encodeURIComponent(latestDomainId)}/verify`, { method: 'POST' });
    domainVerifyButton.disabled = false;
    if (!ok || !data.ok) { if (domainStatus) domainStatus.textContent = 'Could not run the check.'; return; }
    if (domainStatus) domainStatus.textContent = data.check.ok
      ? `Reachable (${data.domain.state}).`
      : `Not live yet: ${data.check.message}`;
  });
}

// ==========================================================================
// Product-flow pass: My Websites (spec: "retain access to purchased sites in
// account"). Every project this account has actually PURCHASED, across the
// whole account -- not just whichever one is currently open in the editor
// above. Reads from GET /api/my-websites (server.js), which itself reads
// from the immutable purchase_snapshots table, so a row here never
// disappears or changes just because the live draft keeps getting edited.
// ==========================================================================
let myWebsitesCache = [];

async function refreshMyWebsitesPanel(force) {
  if (!myWebsitesPanel) return;
  const signedIn = !!currentAccount;
  if (!signedIn) { myWebsitesLoadedForAccount = null; myWebsitesPanel.hidden = true; return; }
  myWebsitesPanel.hidden = false;
  if (!force && myWebsitesLoadedForAccount === currentAccount.id) return;
  myWebsitesLoadedForAccount = currentAccount.id;
  const [{ ok, data }] = await Promise.all([
    apiFetch('/api/my-websites'),
    loadHostingProviders(), // rows need provider labels too -- shares the same cache the export panel populates
  ]);
  if (!ok || !data.ok) return;
  myWebsitesCache = data.websites;
  renderMyWebsitesList();
}
function hostingChoiceSummary(hostingChoice) {
  if (!hostingChoice || (!hostingChoice.provider && !hostingChoice.skipped)) return 'Hosting: not decided yet';
  if (hostingChoice.provider === 'self') return 'Hosting: self-hosted';
  if (hostingChoice.provider) {
    const p = (hostingProvidersCache || []).find(x => x.key === hostingChoice.provider);
    return `Hosting: ${p ? p.label : hostingChoice.provider}`;
  }
  return 'Hosting: not decided yet';
}
function renderMyWebsitesList() {
  if (!myWebsitesList) return;
  if (myWebsitesEmpty) myWebsitesEmpty.hidden = myWebsitesCache.length > 0;
  myWebsitesList.innerHTML = myWebsitesCache.map(w => {
    const purchasedDate = w.purchasedAt ? new Date(w.purchasedAt).toLocaleDateString() : '';
    const snapshotRevision = w.snapshot ? w.snapshot.projectRevision : null;
    const downloadHtml = w.latestDeployment && w.latestDeployment.downloadUrl
      ? `<a href="${escapeHtml(w.latestDeployment.downloadUrl)}" class="link-button" download>Download purchased snapshot (.zip)</a>`
      : `<button type="button" class="link-button" data-my-website-export="${escapeHtml(w.projectId)}">Compile purchased snapshot (.zip)</button>`;
    return `<div class="my-website-item" data-my-website-id="${escapeHtml(w.projectId)}">
      <strong>${escapeHtml(w.projectName || 'Untitled project')}</strong>
      <small>Purchased ${escapeHtml(purchasedDate)}${w.purchaseRef ? ` · ${escapeHtml(w.purchaseRef)}` : ''}</small>
      <p class="snapshot-badge">${snapshotRevision != null ? `Frozen snapshot — revision ${escapeHtml(String(snapshotRevision))}, never changes` : 'Frozen purchased snapshot'}</p>
      <p class="my-website-hosting">${escapeHtml(hostingChoiceSummary(w.hostingChoice))}</p>
      <div class="my-website-actions">
        <button type="button" class="link-button" data-my-website-open="${escapeHtml(w.projectId)}">Open live draft to edit</button>
        ${downloadHtml}
      </div>
      <p class="my-website-snapshot-note">The download above always matches what you purchased, exactly — editing the live draft never changes it.</p>
      <p class="my-website-status" data-my-website-status="${escapeHtml(w.projectId)}" aria-live="polite"></p>
    </div>`;
  }).join('');
}
function myWebsitesStatusEl(projectId) {
  return myWebsitesList ? myWebsitesList.querySelector(`[data-my-website-status="${CSS.escape(projectId)}"]`) : null;
}
if (myWebsitesList) {
  myWebsitesList.addEventListener('click', async (e) => {
    const openId = e.target.getAttribute && e.target.getAttribute('data-my-website-open');
    if (openId) { loadSelectedOwnedProjectById(openId); return; }
    const exportId = e.target.getAttribute && e.target.getAttribute('data-my-website-export');
    if (!exportId) return;
    e.target.disabled = true;
    const statusEl = myWebsitesStatusEl(exportId);
    if (statusEl) statusEl.textContent = 'Compiling your export…';
    const { ok, data } = await apiFetch(`/api/projects/${encodeURIComponent(exportId)}/export`, { method: 'POST' });
    e.target.disabled = false;
    if (!ok || !data.ok) { if (statusEl) statusEl.textContent = (data && data.message) || 'Export failed.'; return; }
    const row = myWebsitesCache.find(w => w.projectId === exportId);
    if (row) row.latestDeployment = { id: data.deployment.id, state: data.deployment.state, createdAt: data.deployment.createdAt, downloadUrl: `/api/deployments/${data.deployment.id}/download` };
    renderMyWebsitesList();
    // If this row's project is also the one currently open in the editor,
    // keep the export panel above in sync too, rather than leaving it stale.
    if (exportId === serverProjectId) { latestDeployment = data.deployment; applyDeploymentToUi(data.deployment, data.deployment); }
  });
}
