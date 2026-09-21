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
    'product-screenshot': ['app','product screenshot','interface','mobile app','web app','demo']
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
function composeStyleFromAnalysis(text, categoryKey, seedKey) {
  const seed = styles[seedKey] || styles.precision;
  const catDefaults = categoryDimensionDefaults[categoryKey] || categoryDimensionDefaults.other;
  const composed = { name: seed.name, tagline: seed.tagline, seedKey, categoryKey };
  Object.keys(dimensionKeywords).forEach(dim => {
    const scores = scoreKeywords(text || '', dimensionKeywords[dim]);
    const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]);
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
  return ['hero', ...middle, 'footer'];
}
// Variant choice is tied to an existing composed dimension (or, on
// Regenerate, a variation counter) rather than independently random, so a
// result still reads as one coherent design system.
function pickVariant(type, composed, variationSeed) {
  const v = variationSeed || 0;
  const flip = v % 2 === 1;
  switch (type) {
    case 'services': { const d = ['image-led', 'elevated-shadow', 'numbered-editorial'].includes(composed.card) ? 'described' : 'numbered'; return flip ? (d === 'described' ? 'numbered' : 'described') : d; }
    case 'gallery': { const d = ['asymmetric-offset', 'fullbleed-image', 'collage'].includes(composed.hero) ? 'featured' : 'grid'; return flip ? (d === 'featured' ? 'grid' : 'featured') : d; }
    case 'testimonial': return (composed.spacing === 'airy' || composed.spacing === 'generous') ? 'centered' : 'card';
    case 'about': return (composed.spacing === 'airy' || composed.spacing === 'generous') ? 'split' : 'statement';
    case 'ctaBanner': return ['high-contrast-mono-accent', 'dark-luxury-metallic'].includes(composed.colorBehavior) ? 'accent' : 'plain';
    case 'proof': return 'facts';
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
const copyHeadlinePools = {
  tech: [subj => `${titleCase(subj)}, built to move fast.`, subj => `Software for ${subj}, done right.`],
  finance: [subj => `Clarity for ${subj}.`, subj => `${titleCase(subj)}, handled with care.`],
  fashion: [subj => `${titleCase(subj)}. Made to be seen.`, subj => `A ${subj} collection, presented properly.`],
  hospitality: [(subj, d, loc) => `${titleCase(subj)}${loc ? ' in ' + loc : ''}, worth the trip.`, subj => `${titleCase(subj)}, made to be tasted.`],
  creative: [subj => `${titleCase(subj)} work that speaks first.`, subj => `A ${subj} studio, in its own words.`],
  fitness: [subj => `${titleCase(subj)} progress you can see.`, subj => `Train ${subj}, see it show up.`],
  realestate: [(subj, d, loc) => `Find the right place${loc ? ' in ' + loc : ''}.`],
  wellness: [subj => `Feel better, through ${subj}.`],
  retail: [subj => `${titleCase(subj)}, worth stopping for.`],
  nonprofit: [subj => `Real work on ${subj}.`],
  professional: [subj => `${titleCase(subj)}, explained clearly.`],
  education: [subj => `Learn ${subj}, and have it stick.`],
  electrical: [subj => `${titleCase(subj)}, wired right.`], plumbing: [subj => `${titleCase(subj)}, fixed properly.`],
  landscaping: [subj => `${titleCase(subj)}, outdoors done right.`], painting: [subj => `${titleCase(subj)}, finished clean.`],
  roofing: [subj => `${titleCase(subj)}, built for the weather.`], automotive: [subj => `${titleCase(subj)}, cared for properly.`],
  cleaning: [subj => `${titleCase(subj)}, done thoroughly.`], renovation: [subj => `${titleCase(subj)}, built on reputation.`],
  other: [subj => `${titleCase(subj)}, done properly.`]
};
function buildCopy(category, categoryKey, analysis, descriptor) {
  descriptor = descriptor || {};
  const loc = analysis.location || '';
  const hasSignal = descriptor.descriptor || descriptor.offering;
  const kicker = descriptor.descriptor ? descriptor.descriptor.toUpperCase() : category.kicker;
  let headline = category.headline;
  let sub = category.sub;
  if (hasSignal) {
    const subject = descriptor.descriptor || category.noun;
    const pool = copyHeadlinePools[categoryKey] || copyHeadlinePools.other;
    const template = pool[hashString(analysis.text) % pool.length];
    headline = template(subject, descriptor, loc);
    sub = descriptor.offering ? `Built for ${descriptor.offering}${loc ? ' in ' + loc : ''}.`
      : (descriptor.outcome ? `Here to ${descriptor.outcome}${loc ? ' in ' + loc : ''}.` : category.sub);
  } else if (loc) {
    sub = `${category.sub} Serving ${loc}.`;
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
  return `<div class="visual-generated${generating ? ' visual-generating' : ''}" data-imagery="${escapeHtml(imageryKey || 'abstract-geometric')}" data-role="${escapeHtml(slot)}">${generating ? `<span class="visual-generating-label">Generating ${escapeHtml(imageSlotLabel(slot))}…</span>` : ''}</div>`;
}
function imageSlotLabel(slot) {
  return { hero: 'hero image', 'collage-2': 'hero image', about: 'team image', product: 'product visual', 'gallery-featured': 'gallery image' }[slot] || 'image';
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
function buildImagePrompt(project, category, role) {
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
  return hashString(`${project.business.categoryKey}::${composed.imagery}::${role}::${slot}::${project.source.text || ''}`).toString(36);
}
function buildImagePlan(project, category) {
  if (project.meta && project.meta.isDemoShell) return [];
  const plan = project.assets.plan;
  const composed = project.design.dimensions;
  const providerConfigured = !!(window.__siteremadeImageProvider && window.__siteremadeImageProvider.configured);
  const slots = [];
  const heroSection = project.sections.find(s => s.type === 'hero');
  // centered-oversized/minimal-text-only/poster are deliberately text-only
  // hero treatments -- renderHero never calls renderVisualSlot for them, so
  // planning (and generating) a hero image for those layouts would pay for
  // an image nothing ever displays.
  const heroHasVisual = heroSection && !['centered-oversized', 'minimal-text-only', 'poster'].includes(composed.hero);
  if (heroHasVisual) {
    slots.push({ slot: 'hero', role: 'hero', section: heroSection.id, sectionType: 'hero', assetId: plan.hero, aspectRatio: '16:9', intent: `Primary hero visual for ${category.label}` });
    // The collage hero layout uses a second image-bearing card -- only real
    // when that layout is actually selected, so we never plan/generate an
    // image for a slot that won't be on screen.
    if (composed.hero === 'collage') {
      slots.push({ slot: 'collage-2', role: 'hero', section: heroSection.id, sectionType: 'hero', assetId: (plan.gallery || [])[0], aspectRatio: '4:3', intent: `Secondary hero visual for ${category.label}` });
    }
  }
  const productSection = project.sections.find(s => s.type === 'productShowcase');
  if (productSection) {
    slots.push({ slot: 'product', role: 'product', section: productSection.id, sectionType: 'productShowcase', assetId: (plan.gallery || [])[0], aspectRatio: '4:3', intent: 'Product / interface visual' });
  }
  // renderAbout only ever shows a visual for the 'split' variant (or when a
  // real upload exists) -- matching that here avoids planning/generating an
  // image the 'statement' variant would never display.
  const aboutSection = project.sections.find(s => s.type === 'about');
  if (aboutSection && (aboutSection.variant === 'split' || plan.about)) {
    slots.push({ slot: 'about', role: 'team', section: aboutSection.id, sectionType: 'about', assetId: plan.about, aspectRatio: '1:1', intent: 'Team / people visual' });
  }
  const editorialSection = project.sections.find(s => s.type === 'imageLedEditorial');
  if (editorialSection) {
    slots.push({ slot: 'gallery-featured', role: 'gallery', section: editorialSection.id, sectionType: 'imageLedEditorial', assetId: (plan.gallery || [])[0], aspectRatio: '4:3', intent: 'Supporting gallery visual' });
  }
  return slots.map(s => {
    const sourceType = s.assetId ? 'user' : (providerConfigured ? 'generated' : 'designed');
    return { ...s, placement: s.role, prompt: buildImagePrompt(project, category, s.role), sourceType, cacheKey: computeImageCacheKey(project, s.role, s.slot) };
  });
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
function resolveImagePlanAssets(proj) {
  if (!proj || (proj.meta && proj.meta.isDemoShell)) return;
  if (!window.__siteremadeImageProvider || !window.__siteremadeImageProvider.configured) return;
  proj.assets.generated = proj.assets.generated || {};
  (proj.imagePlan || []).forEach(entry => {
    if (entry.sourceType !== 'generated') return; // a user asset covers this slot, or the provider isn't configured
    const slot = entry.slot;
    const existing = proj.assets.generated[slot];
    // Already have this exact image, or already asked for it -- an ordinary
    // re-render (color/tone/layout/device) must never cause a second paid
    // request for a slot whose identity hasn't changed.
    if (existing && existing.cacheKey === entry.cacheKey && (existing.status === 'ready' || existing.status === 'pending')) return;
    const reqKey = `${proj.meta.id}::${slot}::${entry.cacheKey}`;
    if (imageRequestsInFlight.has(reqKey)) return; // de-dupe concurrent triggers for the same request
    imageRequestsInFlight.add(reqKey);
    proj.assets.generated[slot] = { cacheKey: entry.cacheKey, status: 'pending', prompt: entry.prompt };
    if (proj === project) renderProject(project); // shows the honest "Generating…" state right away, without blocking anything else on the page
    fetch('/api/generate-image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: entry.prompt, aspectRatio: entry.aspectRatio, role: entry.role })
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
        if (proj === project) renderProject(project);
      })
      .catch(() => {
        imageRequestsInFlight.delete(reqKey);
        const current = proj.assets.generated[slot];
        if (current && current.cacheKey === entry.cacheKey) proj.assets.generated[slot] = { cacheKey: entry.cacheKey, status: 'error', prompt: entry.prompt };
        if (proj === project) renderProject(project);
      });
  });
}

// ---- Section HTML renderers ----------------------------------------------
// Every generated/placeholder image uses the honest, art-directed CSS
// treatment described above (no fabricated photos, ever) -- these functions
// only decide *whether* a role has a real user asset to show instead.
// V7: 10 structurally distinct hero layouts (was 1 DOM shape reskinned by
// CSS) -- see SITE-PROJECT-V7.md part 4.
function renderHero(project, category) {
  const composed = project.design.dimensions;
  const plan = project.assets.plan;
  const copy = project.copy || { kicker: category.kicker, headline: category.headline, sub: toneSub(project.business.tone, category, project.source.location), cta: category.cta };
  const kicker = escapeHtml(copy.kicker), headline = escapeHtml(copy.headline), sub = escapeHtml(copy.sub), cta = escapeHtml(copy.cta || category.cta);
  const visual = renderVisualSlot(project, 'hero', composed.imagery, plan.hero);
  const layout = (project.meta && project.meta.isDemoShell) ? 'demo' : composed.hero;
  switch (layout) {
    case 'demo': return `<div class="site-hero hero-demo-shell">
        <div class="site-copy"><p>PREVIEW</p><h3>Describe your business above</h3><p>Your generated site will appear here — real layout, real copy, real palette, built from what you type.</p></div>
        <div class="site-visual"><div class="visual-generated" data-imagery="demo-shell"></div></div>
      </div>`;
    case 'centered-oversized': return `<div class="site-hero hero-centered-oversized">
        <p class="hero-kicker-center">${kicker}</p><h3 class="hero-headline-oversized">${headline}</h3><p class="hero-sub-center">${sub}</p>
        <div class="site-actions center"><button>${cta}</button></div>
      </div>`;
    case 'fullbleed-image': return `<div class="site-hero hero-fullbleed">
        <div class="hero-fullbleed-media">${visual}<div class="hero-fullbleed-scrim"></div></div>
        <div class="hero-fullbleed-copy"><p>${kicker}</p><h3>${headline}</h3><p>${sub}</p><div class="site-actions"><button>${cta}</button></div></div>
      </div>`;
    case 'stacked-image-below': return `<div class="site-hero hero-stacked">
        <div class="hero-stacked-copy"><p>${kicker}</p><h3>${headline}</h3><p>${sub}</p><div class="site-actions center"><button>${cta}</button></div></div>
        <div class="hero-stacked-visual">${visual}</div>
      </div>`;
    case 'asymmetric-offset': return `<div class="site-hero hero-asymmetric">
        <div class="hero-asym-headline"><p>${kicker}</p><h3>${headline}</h3></div>
        <div class="hero-asym-visual">${visual}</div>
        <div class="hero-asym-meta"><p>${sub}</p><div class="site-actions"><button>${cta}</button></div></div>
      </div>`;
    case 'minimal-text-only': return `<div class="site-hero hero-minimal">
        <p>${kicker}</p><h3>${headline}</h3><p>${sub}</p><div class="site-actions"><span class="minimal-link">${cta} ↗</span></div>
      </div>`;
    case 'grid-dashboard': return `<div class="site-hero hero-grid-dashboard">
        <div class="site-copy"><p>${kicker}</p><h3>${headline}</h3><p>${sub}</p><div class="site-actions"><button>${cta}</button></div></div>
        <div class="hero-dash-grid"><div class="dash-panel dash-panel-visual">${visual}</div><div class="dash-panel"></div><div class="dash-panel"></div><div class="dash-panel"></div></div>
      </div>`;
    case 'poster': return `<div class="site-hero hero-poster">
        <p class="hero-kicker-center">${kicker}</p><h3 class="hero-poster-headline">${headline}</h3>
        <div class="hero-poster-row"><p>${sub}</p><button>${cta}</button></div>
      </div>`;
    case 'collage': { const b = renderVisualSlot(project, 'collage-2', composed.imagery, (plan.gallery || [])[0]);
      return `<div class="site-hero hero-collage">
        <div class="hero-collage-copy"><p>${kicker}</p><h3>${headline}</h3><p>${sub}</p><div class="site-actions"><button>${cta}</button></div></div>
        <div class="hero-collage-stack"><div class="collage-card collage-card-1">${visual}</div><div class="collage-card collage-card-2">${b}</div></div>
      </div>`; }
    case 'product-screenshot': return `<div class="site-hero hero-product-screenshot">
        <div class="site-copy center"><p>${kicker}</p><h3>${headline}</h3><p>${sub}</p><div class="site-actions center"><button>${cta}</button></div></div>
        <div class="hero-product-frame"><div class="hero-product-chrome"><span></span><span></span><span></span></div><div class="hero-product-body">${visual}</div></div>
      </div>`;
    default: return `<div class="site-hero hero-split">
        <div class="site-copy"><p>${kicker}</p><h3>${headline}</h3><p>${sub}</p><div class="site-actions"><button>${cta}</button><span>See our work ↗</span></div></div>
        <div class="site-visual">${visual}</div>
      </div>`;
  }
}
function renderServices(project, category, variant) {
  const labels = category.services;
  if (variant === 'described') {
    return `<div class="site-section site-section-services" data-variant="described">
      <div class="site-services-cards">${labels.map(l => `<div class="service-card"><strong>${escapeHtml(l)}</strong><p>Real ${escapeHtml(category.noun)}, presented clearly.</p></div>`).join('')}</div>
    </div>`;
  }
  return `<div class="site-section site-section-services" data-variant="numbered">
    <div class="site-sections">${labels.map((l, i) => `<div><small>0${i + 1}</small><strong>${escapeHtml(l)}</strong></div>`).join('')}</div>
  </div>`;
}
// V7: never fabricates a number. Only ever shows a fact the description
// itself supplied (see extractBusinessFacts) -- composeSections only
// includes this section at all when at least one such fact exists.
function renderProof(project, category) {
  const facts = project.source.facts || {};
  const stats = [];
  if (facts.years) stats.push({ n: facts.years + '+', l: 'Years' });
  if (facts.rating) stats.push({ n: facts.rating, l: 'Rating' });
  if (facts.count) stats.push({ n: facts.count + '+', l: 'Served' });
  if (!stats.length) return '';
  return `<div class="site-section site-section-proof" data-variant="facts">
    <div class="site-proof-stats">${stats.map(s => `<div><strong>${escapeHtml(s.n)}</strong><small>${escapeHtml(s.l)}</small></div>`).join('')}</div>
  </div>`;
}
function renderMetrics(project, category) { return renderProof(project, category); }
function renderGallery(project, category, variant, labelOverride) {
  const plan = project.assets.plan;
  const galleryAssets = (plan.gallery || []).map(id => project.assets.items.find(a => a.id === id)).filter(Boolean);
  const label = escapeHtml(labelOverride || navLabelFor('gallery', project.business.categoryKey));
  const tileCount = variant === 'featured' ? 3 : 4;
  const tiles = [];
  for (let i = 0; i < tileCount; i++) {
    const asset = galleryAssets[i];
    const featuredClass = (i === 0 && variant === 'featured') ? ' gallery-tile-featured' : '';
    if (asset) tiles.push(`<div class="gallery-tile has-image${featuredClass}"><img src="${asset.dataUrl}" alt="${escapeHtml(asset.alt || label + ' photo')}" /></div>`);
    else tiles.push(`<div class="gallery-tile gallery-tile-placeholder visual-generated${featuredClass}" data-imagery="${escapeHtml(project.design.dimensions.imagery)}"></div>`);
  }
  return `<div class="site-section site-section-gallery" data-variant="${variant}">
    <p class="site-section-label">${label}</p>
    <div class="gallery-grid gallery-layout-${variant}">${tiles.join('')}</div>
  </div>`;
}
function renderCaseStudies(project, category) { return renderGallery(project, category, 'grid', 'Recent Projects'); }
// V7: the specific numbered claim ("Verified") is dropped -- an
// illustrative quote used as placeholder marketing copy is normal, but
// asserting it is a *verified* real review when none exists is exactly the
// kind of invented proof part 6 asks to remove.
function renderTestimonial(project, category, variant) {
  const quote = `“Working with a ${escapeHtml(category.label.toLowerCase())} team that actually explains things clearly made this easy.”`;
  const attribution = `— ${escapeHtml(category.label)} client`;
  if (variant === 'card') {
    return `<div class="site-section site-section-testimonial" data-variant="card">
      <div class="testimonial-card"><p>${quote}</p><span>${attribution}</span></div>
    </div>`;
  }
  return `<div class="site-section site-section-testimonial" data-variant="centered">
    <blockquote>${quote}<cite>${attribution}</cite></blockquote>
  </div>`;
}
function renderTestimonialsGrid(project, category) {
  const quotes = ['Clear communication from start to finish.', 'Exactly what we needed, delivered well.', 'Would recommend without hesitation.'];
  return `<div class="site-section site-section-testimonials-grid" data-variant="grid">
    <p class="site-section-label">What people say</p>
    <div class="testimonials-grid">${quotes.map(q => `<div class="testimonial-card"><p>“${escapeHtml(q)}”</p><span>— ${escapeHtml(category.label)} client</span></div>`).join('')}</div>
  </div>`;
}
function renderAbout(project, category, variant) {
  const plan = project.assets.plan;
  const aboutAsset = plan.about ? project.assets.items.find(a => a.id === plan.about) : null;
  const statement = `We're a ${escapeHtml(category.label.toLowerCase())} team focused on getting the details right, from the first conversation to the finished result.`;
  if (variant === 'split' || aboutAsset) {
    const visual = renderVisualSlot(project, 'about', project.design.dimensions.imagery, plan.about);
    return `<div class="site-section site-section-about" data-variant="split">
      <div class="about-visual">${visual}</div>
      <div class="about-copy"><p class="site-section-label">About</p><p>${statement}</p></div>
    </div>`;
  }
  return `<div class="site-section site-section-about" data-variant="statement">
    <p class="site-section-label">About</p>
    <p class="about-statement-text">${statement}</p>
  </div>`;
}
function renderTeam(project, category) {
  const teamAssets = project.assets.items.filter(a => a.type === 'team');
  const cards = [];
  for (let i = 0; i < Math.max(teamAssets.length, 3); i++) {
    const a = teamAssets[i];
    cards.push(a ? `<div class="team-card has-image"><img src="${a.dataUrl}" alt="${escapeHtml(a.alt || 'Team member')}" /></div>` : `<div class="team-card team-card-placeholder"></div>`);
  }
  return `<div class="site-section site-section-team" data-variant="grid">
    <p class="site-section-label">Team</p>
    <div class="team-grid">${cards.slice(0, 4).join('')}</div>
  </div>`;
}
function renderCtaBanner(project, category, variant) {
  return `<div class="site-section site-section-cta-banner cta-banner-${variant}" data-variant="${variant}">
    <p>Ready to see this as your real website?</p><button>${escapeHtml(category.cta)}</button>
  </div>`;
}
function featureBodyFor(project, category, label, i) {
  const d = project.source.descriptor || {};
  const base = d.offering || d.descriptor || category.noun;
  const templates = [`Built around ${base}, without the busywork.`, `Everything ${base} needs, in one place.`, `Designed to make ${(label || '').toLowerCase()} feel effortless.`];
  return templates[i % templates.length];
}
function renderFeatures(project, category) {
  const labels = category.services;
  return `<div class="site-section site-section-features" data-variant="grid">
    <p class="site-section-label">What it does</p>
    <div class="features-grid">${labels.map((l, i) => `<div class="feature-card"><span class="feature-mark">${escapeHtml((l || 'F').charAt(0))}</span><strong>${escapeHtml(l)}</strong><p>${escapeHtml(featureBodyFor(project, category, l, i))}</p></div>`).join('')}</div>
  </div>`;
}
function renderProductShowcase(project, category) {
  const businessName = escapeHtml(project.business.name || 'Your Business');
  const caption = escapeHtml((project.copy && project.copy.sub) || category.sub);
  return `<div class="site-section site-section-product" data-variant="showcase">
    <p class="site-section-label">Product</p><h4>${businessName} in action</h4>
    <div class="product-frame">${renderVisualSlot(project, 'product', 'dashboard-ui', (project.assets.plan.gallery || [])[0])}</div>
    <p class="product-caption">${caption}</p>
  </div>`;
}
const categoryIntegrationLabels = {
  tech: ['Calendar', 'Payments', 'Analytics', 'Messaging', 'Automation', 'Storage'],
  finance: ['Reporting', 'Compliance', 'Payments', 'Planning'],
  hospitality: ['Reservations', 'Delivery', 'Loyalty', 'Point of Sale'],
  retail: ['Inventory', 'Shipping', 'Payments', 'Loyalty'],
  default: ['Calendar', 'Payments', 'Analytics', 'Support']
};
function renderIntegrations(project, category, categoryKey) {
  const labels = categoryIntegrationLabels[categoryKey] || categoryIntegrationLabels.default;
  return `<div class="site-section site-section-integrations" data-variant="chips">
    <p class="site-section-label">Works with what you already use</p>
    <div class="integration-chips">${labels.map(l => `<span class="integration-chip">${escapeHtml(l)}</span>`).join('')}</div>
  </div>`;
}
function renderPricingSection(project, category) {
  const tiers = [{ name: 'Starter', blurb: 'For getting started quickly.' }, { name: 'Growth', blurb: 'For teams scaling up.' }, { name: 'Enterprise', blurb: 'Custom for larger needs.' }];
  return `<div class="site-section site-section-pricing" data-variant="tiers">
    <p class="site-section-label">Pricing</p>
    <div class="pricing-tiers">${tiers.map(t => `<div class="pricing-tier"><strong>${escapeHtml(t.name)}</strong><p>${escapeHtml(t.blurb)}</p><button>${escapeHtml(category.cta)}</button></div>`).join('')}</div>
  </div>`;
}
function renderFaq(project, category) {
  const d = project.source.descriptor || {};
  const noun = d.descriptor || category.noun;
  const qas = [
    { q: `What does ${escapeHtml(project.business.name || 'this business')} actually do?`, a: escapeHtml(category.sub) },
    { q: 'How do I get started?', a: `Reach out and we'll walk through ${escapeHtml(noun)} together.` },
    { q: 'Is support included?', a: 'Yes — real help, not just documentation.' }
  ];
  return `<div class="site-section site-section-faq" data-variant="list">
    <p class="site-section-label">FAQ</p>
    <div class="faq-list">${qas.map(x => `<div class="faq-item"><strong>${x.q}</strong><p>${x.a}</p></div>`).join('')}</div>
  </div>`;
}
function renderProcess(project, category) {
  const steps = ['Reach out', 'We scope the work', 'We deliver', 'You review & sign off'];
  return `<div class="site-section site-section-process" data-variant="steps">
    <p class="site-section-label">How it works</p>
    <div class="process-steps">${steps.map((s, i) => `<div><small>0${i + 1}</small><strong>${escapeHtml(s)}</strong></div>`).join('')}</div>
  </div>`;
}
function renderMenu(project, category) {
  const groups = ['Starters', 'Mains', 'Desserts'];
  return `<div class="site-section site-section-menu" data-variant="columns">
    <p class="site-section-label">Menu</p>
    <div class="menu-groups">${groups.map(g => `<div class="menu-group"><strong>${escapeHtml(g)}</strong><span class="menu-line"></span><span class="menu-line"></span><span class="menu-line"></span></div>`).join('')}</div>
  </div>`;
}
function renderReservationCta(project, category) {
  return `<div class="site-section site-section-reservation" data-variant="banner">
    <p>Book a table.</p><button>${escapeHtml(category.cta)}</button>
  </div>`;
}
function renderServiceAreas(project, category) {
  const loc = project.source.location;
  const label = loc ? `${escapeHtml(loc)} and surrounding areas` : 'Local & surrounding areas';
  return `<div class="site-section site-section-areas" data-variant="list">
    <p class="site-section-label">Service Areas</p><p class="areas-statement">${label}</p>
  </div>`;
}
function renderContact(project, category) {
  const loc = project.source.location ? escapeHtml(project.source.location) + ' · ' : '';
  return `<div class="site-section site-section-contact" data-variant="simple">
    <p class="site-section-label">Contact</p><p>${loc}Get in touch to get started.</p><button>${escapeHtml(category.cta)}</button>
  </div>`;
}
function renderNewsletter(project, category) {
  return `<div class="site-section site-section-newsletter" data-variant="inline">
    <p>Stay in the loop.</p>
    <div class="newsletter-row"><input type="email" placeholder="you@email.com" disabled /><button>Subscribe</button></div>
  </div>`;
}
function renderImageLedEditorial(project, category) {
  return `<div class="site-section site-section-editorial" data-variant="image-led">
    <div class="editorial-visual">${renderVisualSlot(project, 'gallery-featured', project.design.dimensions.imagery, (project.assets.plan.gallery || [])[0])}</div>
    <p class="editorial-caption">${escapeHtml((project.copy && project.copy.sub) || category.sub)}</p>
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
function renderSectionHTML(project, section, category) {
  switch (section.type) {
    case 'hero': return renderHero(project, category);
    case 'proof': return renderProof(project, category);
    case 'metrics': return renderMetrics(project, category);
    case 'services': return renderServices(project, category, section.variant);
    case 'features': return renderFeatures(project, category);
    case 'productShowcase': return renderProductShowcase(project, category);
    case 'integrations': return renderIntegrations(project, category, project.business.categoryKey);
    case 'pricing': return renderPricingSection(project, category);
    case 'faq': return renderFaq(project, category);
    case 'process': return renderProcess(project, category);
    case 'gallery': return renderGallery(project, category, section.variant);
    case 'caseStudies': return renderCaseStudies(project, category);
    case 'imageLedEditorial': return renderImageLedEditorial(project, category);
    case 'about': return renderAbout(project, category, section.variant);
    case 'team': return renderTeam(project, category);
    case 'testimonial': return renderTestimonial(project, category, section.variant);
    case 'testimonialsGrid': return renderTestimonialsGrid(project, category);
    case 'menu': return renderMenu(project, category);
    case 'reservationCta': return renderReservationCta(project, category);
    case 'serviceAreas': return renderServiceAreas(project, category);
    case 'contact': return renderContact(project, category);
    case 'newsletter': return renderNewsletter(project, category);
    case 'ctaBanner': return renderCtaBanner(project, category, section.variant);
    case 'footer': return renderSiteFooter(project, category, section.variant);
    default: return '';
  }
}
function insertSection(proj, type) {
  const variant = pickVariant(type, proj.design.dimensions, proj.intent && proj.intent.variationSeed);
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
  const sections = composeSections(category, dimensions, assets.plan, analysis.categoryKey, facts)
    .map((type, i) => ({ id: `${type}-${i}-${Date.now().toString(36)}`, type, variant: pickVariant(type, dimensions, 0) }));
  // V6: prefer a name explicitly captured from THIS description (a fresh
  // Generate submission describing a different business should not keep
  // showing the previous one's name); otherwise keep whatever name already
  // existed (manual edits survive regeneration); otherwise a neutral
  // fallback -- the site identity is never left empty. See part 2 of
  // SITE-PROJECT-V6.md.
  const extractedName = extractBusinessName(analysis.text);
  const priorName = preserved && preserved.business && preserved.business.name;
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
    sections,
    assets,
    responsive: { device: (preserved && preserved.responsive && preserved.responsive.device) || 'desktop' }
  };
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
  builderSite.dataset.hero = composed.hero;
  builderSite.dataset.type = composed.type;
  builderSite.dataset.nav = composed.nav;
  builderSite.dataset.card = composed.card;
  builderSite.dataset.imagery = composed.imagery;
  builderSite.dataset.cta = composed.cta;
  builderSite.dataset.colorBehavior = composed.colorBehavior;
  builderSite.dataset.motion = prefersReducedMotion() ? 'none' : composed.motion;
  builderSite.dataset.spacing = composed.spacing;
  builderSite.dataset.pattern = composed.pattern;
  builderSite.dataset.layout = proj.design.heroLayout;
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
  const navTypes = proj.sections.map(s => s.type).filter(t => t === 'services' || t === 'gallery' || t === 'about').slice(0, 3);
  if (siteNavLinks) siteNavLinks.innerHTML = navTypes.map(t => `<span>${escapeHtml(navLabelFor(t, proj.business.categoryKey))}</span>`).join('');
  if (siteNavCta) siteNavCta.textContent = category.cta;
  if (siteSectionsRoot) siteSectionsRoot.innerHTML = proj.sections.map(s => renderSectionHTML(proj, s, category)).join('');
}
function renderChrome(proj, category) {
  const logoAsset = proj.assets.plan.logo ? proj.assets.items.find(a => a.id === proj.assets.plan.logo) : null;
  const layoutLabel = LAYOUT_LABELS[proj.design.heroLayout] || 'Layout 1';
  summaryMode.textContent = `${proj.sections.length} sections · Composed`;
  summaryColor.textContent = proj.design.palette.main.toUpperCase();
  summaryLayout.textContent = layoutLabel;
  summaryIndustry.textContent = category.label;

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
  formSections.value = proj.sections.map(s => s.type).join(', ');

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
  const category = categories[proj.business.categoryKey] || categories.other;
  proj.assets.plan = planAssets(proj.assets);
  proj.imagePlan = buildImagePlan(proj, category);
  applyDesignDataset(proj);
  renderSections(proj, category);
  renderChrome(proj, category);
}
function renderAssetPanels(proj) {
  const byType = t => proj.assets.items.filter(a => a.type === t);
  const thumbHtml = a => `<div class="asset-thumb"><img src="${a.dataUrl}" alt="" /><button type="button" class="asset-thumb-remove" data-asset-id="${a.id}" aria-label="Remove image">×</button></div>`;
  if (heroAssetThumbs) heroAssetThumbs.innerHTML = byType('hero').map(thumbHtml).join('');
  if (galleryAssetThumbs) galleryAssetThumbs.innerHTML = byType('gallery').map(thumbHtml).join('');
  if (teamAssetThumbs) teamAssetThumbs.innerHTML = byType('team').map(thumbHtml).join('');
}

// ---- Serialization / persistence (client-side this pass -- see SITE-PROJECT-V5.md part 6) ----
function serializeProject(proj) { return JSON.stringify(proj); }
function setProjectStatus(msg) {
  if (projectDataStatus) projectDataStatus.textContent = msg;
  if (projectDataStatusLock) projectDataStatusLock.textContent = msg;
}
function saveProjectToStorage() {
  if (!project) { setProjectStatus('Generate a direction first.'); return; }
  try {
    localStorage.setItem('siteremade:lastProject', serializeProject(project));
    setProjectStatus('Saved — this exact project (including your images) can be reloaded anytime.');
  } catch (e) { setProjectStatus('Could not save (storage may be full or unavailable).'); }
}
function loadProjectFromStorage() {
  let raw;
  try { raw = localStorage.getItem('siteremade:lastProject'); } catch (e) { raw = null; }
  if (!raw) { setProjectStatus('No saved project found yet.'); return; }
  try {
    project = JSON.parse(raw);
    project.assets = project.assets || {};
    project.assets.generated = project.assets.generated || {}; // restore generated imagery same as user uploads
    renderProject(project);
    markGenerated();
    resolveImagePlanAssets(project); // covers any slot that was still pending/errored when it was saved
    setProjectStatus('Loaded your last saved project from stored data.');
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

// Generator (hero) elements
const generatorForm = $('#generatorForm');
const generatorInput = $('#generatorInput');
const generatorSubmitButton = $('.generator-submit');
const generatorSubmitLabel = generatorSubmitButton ? generatorSubmitButton.querySelector('.btn-label') : null;
const heroMachine = $('#heroMachine');
const heroDemoCopy = $('#heroDemoCopy');
const heroKicker = $('#heroKicker');
const heroHeadline = $('#heroHeadline');
const heroCardSections = $('#heroCardSections');
const heroCardBrand = $('#heroCardBrand');
const heroCardIndustry = $('#heroCardIndustry');
const generationProgress = $('#generationProgress');
const generationSteps = $('#generationSteps');
const exampleChipRow = $('#exampleChipRow');

// Refine-panel elements
const builderShell = $('#builderShell');
const toneToggle = $('#toneToggle');
const regenerateButton = $('#regenerateButton');
const sectionToggles = $('#sectionToggles');

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

// ---- Module state: the project itself is the only real state -----------
let project = null;
let hasGenerated = false;

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
if (regenerateButton) {
  regenerateButton.addEventListener('click', () => {
    if (!project) return;
    // V7: bump the deterministic variation counter (feeds the palette hash
    // and alternates between equally-valid variants -- see pickVariant),
    // and cycle to the next real ranked seed from the ORIGINAL analysis for
    // any dimension that still has no explicit text signal. Never random,
    // never named to the visitor -- reads as "the ambiguous parts get a
    // fresh take."
    project.intent.variationSeed = (project.intent.variationSeed || 0) + 1;
    const candidates = [project.intent.seedKey, ...(project.intent.styleAlternates || [])].filter(Boolean);
    const pool = candidates.length ? candidates : [project.intent.seedKey];
    const currentIndex = pool.indexOf(project.intent.seedKey);
    const nextKey = pool[(currentIndex + 1) % pool.length] || pool[0];
    project.intent.seedKey = nextKey;
    const variationText = project.source.text + '::v' + project.intent.variationSeed;
    const composed = composeStyleFromAnalysis(variationText, project.business.categoryKey, nextKey);
    project.design.palette = { ...composed.palette };
    project.design.dimensions = { hero: composed.hero, type: composed.type, nav: composed.nav, card: composed.card, imagery: composed.imagery, cta: composed.cta, colorBehavior: composed.colorBehavior, motion: composed.motion, spacing: composed.spacing, pattern: composed.pattern };
    project.sections.forEach(s => { s.variant = pickVariant(s.type, project.design.dimensions, project.intent.variationSeed); });
    const category = categories[project.business.categoryKey] || categories.other;
    category.services.push(category.services.shift());
    project.imagePlan = buildImagePlan(project, category);
    renderProject(project);
    resolveImagePlanAssets(project); // imagery direction may have changed -- no-ops if the cache key is unchanged
  });
}
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
// Builds the initial (already-real) shell of a WebsiteProject: business
// identity + category + a seed design, enough to render a meaningful first
// paint (the hero, with the right name/category/palette) immediately, then
// returns the ordered list of remaining real phases that progressively
// refine it into the finished project. Nothing here is fake -- it is
// createProject's own logic, exposed as separate steps instead of one
// opaque call, so the UI can reflect each one as it actually runs.
function buildGenerationPlan(text, preserved) {
  const analysis = analyzeDescription(text);
  const category = categories[analysis.categoryKey] || categories.other;
  const catDefaults = categoryDimensionDefaults[analysis.categoryKey] || categoryDimensionDefaults.other;
  const extractedName = extractBusinessName(analysis.text);
  const priorName = preserved && preserved.business && preserved.business.name;
  const facts = extractBusinessFacts(analysis.text);
  const descriptor = extractBusinessDescriptor(analysis.text);

  // V7: the first-paint shell now seeds its dimensions from the detected
  // CATEGORY's defaults, not the named seed's raw values -- so even before
  // the "structure"/"typography" steps run, an AI company already shows a
  // SaaS-shaped hero instead of the generic split-hero default every result
  // used to start from.
  const proj = {
    meta: { id: 'proj_' + Date.now().toString(36), createdAt: new Date().toISOString(), version: 'v7', isDemoShell: false },
    source: { text: analysis.text, location: analysis.location, facts, descriptor },
    business: { name: extractedName || priorName || 'Your Business', categoryKey: analysis.categoryKey, tone: (preserved && preserved.business && preserved.business.tone) || 'professional' },
    intent: { seedKey: analysis.styleKey, styleAlternates: analysis.styleAlternates, variationSeed: 0 },
    design: {
      palette: composePalette(analysis.categoryKey, catDefaults, analysis.text),
      dimensions: { ...catDefaults },
      heroLayout: (preserved && preserved.design && preserved.design.heroLayout) || 'split'
    },
    copy: buildCopy(category, analysis.categoryKey, analysis, descriptor),
    sections: [{ id: 'hero-seed-' + Date.now().toString(36), type: 'hero', variant: 'default' }],
    // A fresh Generate submission describes a business that may be entirely
    // different from the last one -- uploaded images still carry over (the
    // person's own asset didn't stop being relevant), but any previously
    // generated images did belong to the old imagePlan's cache keys and are
    // deliberately not carried forward; a real new imagePlan will ask for
    // whatever it actually needs.
    assets: (preserved && preserved.assets) ? { items: preserved.assets.items.slice(), plan: {}, generated: {} } : { items: [], plan: {}, generated: {} },
    responsive: { device: (preserved && preserved.responsive && preserved.responsive.device) || 'desktop' }
  };
  proj.assets.plan = planAssets(proj.assets);

  let composed = null;
  const steps = [
    { key: 'understand', run() {
        // Real work already happened above (analyzeDescription + the shell
        // build) -- this step announces that real result rather than
        // recomputing it.
        return `${category.label} business detected${analysis.location ? ' in ' + analysis.location : ''}`;
      } },
    { key: 'structure', run() {
        composed = composeStyleFromAnalysis(analysis.text, analysis.categoryKey, analysis.styleKey);
        const orderedTypes = composeSections(category, { ...proj.design.dimensions, pattern: composed.pattern }, proj.assets.plan, analysis.categoryKey, facts);
        proj.sections = orderedTypes.map((type, i) => ({ id: `${type}-${i}-${Date.now().toString(36)}`, type, variant: 'default' }));
        return `${proj.sections.length} sections planned (${category.label.toLowerCase()})`;
      } },
    { key: 'typography', run() {
        proj.design.palette = { ...composed.palette };
        proj.design.dimensions = { hero: composed.hero, type: composed.type, nav: composed.nav, card: composed.card, imagery: composed.imagery, cta: composed.cta, colorBehavior: composed.colorBehavior, motion: composed.motion, spacing: composed.spacing, pattern: composed.pattern };
        return describeComposition(composed);
      } },
    { key: 'sections', run() {
        proj.sections.forEach(s => { s.variant = pickVariant(s.type, proj.design.dimensions, 0); });
        proj.copy = buildCopy(category, analysis.categoryKey, analysis, descriptor);
        return `Content matched to ${category.label}`;
      } },
    { key: 'imagery', run() {
        proj.assets.plan = planAssets(proj.assets);
        ensureAssetDrivenSections(proj);
        proj.imagePlan = buildImagePlan(proj, category);
        const n = proj.assets.items.length;
        const generatedCount = proj.imagePlan.filter(p => p.sourceType === 'generated').length;
        if (n) return `${n} of your images placed`;
        if (generatedCount) return `${generatedCount} image${generatedCount === 1 ? '' : 's'} generated`;
        return 'Art-directed imagery matched to your brand';
      } },
    { key: 'build', run() {
        return 'Desktop + mobile preview ready';
      } }
  ];
  return { proj, category, steps };
}
function finishGeneration(proj) {
  project = proj;
  renderProject(project);
  markGenerated();
  resolveImagePlanAssets(project); // fire real image requests for this freshly-built plan, async, non-blocking

  if (generationProgress) generationProgress.hidden = true;
  if (heroMachine) heroMachine.classList.remove('generating');
  if (heroDemoCopy) heroDemoCopy.style.removeProperty('opacity');
  if (generatorSubmitButton) generatorSubmitButton.disabled = false;
  if (generatorSubmitLabel) generatorSubmitLabel.textContent = 'Generate website';

  const target = document.getElementById('build');
  if (target) target.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' });
}
function runGeneration(text) {
  if (!text || !text.trim()) return;
  const { proj, steps } = buildGenerationPlan(text, project);

  if (prefersReducedMotion() || !generationProgress || !generationSteps) {
    // Real work still runs in full -- only the frame-by-frame reveal is
    // skipped, matching the person's reduced-motion preference.
    steps.forEach(s => s.run());
    finishGeneration(proj);
    return;
  }

  if (generatorSubmitButton) generatorSubmitButton.disabled = true;
  if (generatorSubmitLabel) generatorSubmitLabel.textContent = 'Generating…';
  if (heroMachine) heroMachine.classList.add('generating');
  if (heroDemoCopy) heroDemoCopy.style.opacity = '0';
  generationProgress.hidden = false;

  const stepEls = steps.map(s => generationSteps.querySelector(`[data-step="${s.key}"]`));
  stepEls.forEach(li => setStepState(li, null, ''));

  // First paint: the real shell built above (business name, category,
  // seed palette, hero section) is already meaningful -- show it now
  // instead of waiting for every later step. This is the "begin appearing
  // as soon as enough project state exists" progressive render.
  project = proj;
  renderProject(project);

  let i = 0;
  function nextStep() {
    if (i > 0) setStepState(stepEls[i - 1], 'done');
    if (i >= steps.length) { finishGeneration(project); return; }
    const note = steps[i].run(); // the real work for this step happens here
    setStepState(stepEls[i], 'active', note);
    renderProject(project); // reflect exactly what that real work just changed
    i++;
    // One requestAnimationFrame guarantees a paint has happened before the
    // next step runs -- not a fixed-duration stall. On a typical display
    // the whole 6-step pipeline finishes in well under 150ms.
    requestAnimationFrame(nextStep);
  }
  nextStep();
}

if (generatorForm) {
  generatorForm.addEventListener('submit', event => {
    event.preventDefault();
    runGeneration(generatorInput.value);
  });
}

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
function purchaseSummaryPayload(proj) {
  return {
    projectId: proj.meta.id,
    businessName: proj.business.name || 'Your Business',
    industry: (categories[proj.business.categoryKey] || categories.other).label,
    sectionsSummary: proj.sections.map(s => s.type).join(', '),
    brandColor: proj.design.palette.main
  };
}
if (buyButton) {
  buyButton.addEventListener('click', async () => {
    if (!project) return;
    buyButton.disabled = true;
    if (purchaseStatus) { purchaseStatus.dataset.sticky = '1'; purchaseStatus.className = 'purchase-status'; purchaseStatus.textContent = 'Starting checkout…'; }
    try {
      try { localStorage.setItem('siteremade:purchase:' + project.meta.id, serializeProject(project)); } catch (e) { /* best-effort only */ }
      const response = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(purchaseSummaryPayload(project))
      });
      const result = await response.json().catch(() => ({}));
      if (result.ok && result.url) {
        if (purchaseStatus) purchaseStatus.textContent = 'Redirecting to checkout…';
        window.location.href = result.url;
        return;
      }
      if (purchaseStatus) {
        purchaseStatus.className = 'purchase-status error';
        purchaseStatus.textContent = result.configured === false
          ? 'Checkout isn’t live in this environment yet. Use "Get in Touch" below and we’ll set up your purchase directly.'
          : (result.message || 'Could not start checkout. Please try again shortly.');
      }
    } catch (error) {
      if (purchaseStatus) { purchaseStatus.className = 'purchase-status error'; purchaseStatus.textContent = 'Could not reach checkout. Please try again shortly.'; }
    } finally {
      buyButton.disabled = false;
    }
  });
}
// A completed (or cancelled) Checkout redirects back here with a query
// param -- reflect that honestly using whatever this browser still has for
// that project id, rather than pretending a fully synced order record
// exists (it doesn't yet; see the persistence gap in SITE-PROJECT-V6.md).
(function handlePurchaseReturn() {
  const params = new URLSearchParams(window.location.search);
  if (!purchaseStatus) return;
  if (params.get('purchased') === '1') {
    const id = params.get('project');
    let recovered = null;
    if (id) { try { recovered = localStorage.getItem('siteremade:purchase:' + id); } catch (e) { /* ignore */ } }
    purchaseStatus.dataset.sticky = '1';
    purchaseStatus.className = 'purchase-status success';
    purchaseStatus.textContent = recovered
      ? 'Payment received — this exact project is on file and SiteRemade will follow up to start delivery.'
      : 'Payment received — SiteRemade will follow up by email to start delivery.';
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

// ---- Bootstrap: an initial demo shell, deliberately NOT styled like a real
// generated result (V7 part 7d -- see hero-demo-shell / isDemoShell above).
// It shows neutral copy and a distinct "preview" visual treatment so a
// visitor never mistakes the empty state for an actual generated site.
project = createProject({ text: '', categoryKey: 'other', styleKey: 'precision', styleAlternates: [], location: '' }, null, true);
renderProject(project);
year.textContent = new Date().getFullYear();
// V7: best-effort provider status check -- see buildImagePlan. Never blocks
// generation; if this hasn't resolved yet, imagePlan safely defaults to the
// honest 'designed' tier (see server.js for what /api/image-provider-status
// actually reports in this environment).
fetch('/api/image-provider-status').then(r => r.json()).then(status => {
  window.__siteremadeImageProvider = status;
  if (project) {
    project.imagePlan = buildImagePlan(project, categories[project.business.categoryKey] || categories.other);
    renderProject(project);
    resolveImagePlanAssets(project); // provider may have just become configured -- fires real requests for whatever the current plan needs
  }
}).catch(() => {});
