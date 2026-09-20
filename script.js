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
const categoryKeywords = {
  tech:['software','saas','startup','tech company','platform','api','app'],
  finance:['finance','wealth','financial','investment','accounting','bookkeeping'],
  fashion:['fashion','apparel','clothing brand','clothing line','label'],
  hospitality:['cafe','coffee','restaurant','bakery','catering','bar','eatery','food truck'],
  creative:['design studio','photography','photographer','creative agency','videograph','branding studio','illustrator'],
  fitness:['gym','fitness','personal training','crossfit','training studio'],
  realestate:['real estate','realtor','property management','realty'],
  wellness:['spa','wellness','therapy','massage','yoga studio','salon','esthetic'],
  retail:['retail','shop','store','boutique','shopping','e-commerce','ecommerce'],
  nonprofit:['nonprofit','non-profit','charity','community organization','foundation'],
  professional:['consult','law firm','legal','advisor'],
  education:['tutor','academy','course','education','coaching program','bootcamp'],
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

function scoreKeywords(text, keywordMap) {
  const lower = text.toLowerCase();
  const scores = {};
  Object.keys(keywordMap).forEach(key => {
    scores[key] = keywordMap[key].reduce((n, kw) => n + (lower.includes(kw) ? 1 : 0), 0);
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
const dimensionKeywords = {
  hero: {
    'fullbleed-image': ['photo','photography','visual','gallery','portfolio'],
    'centered': ['simple','focus','modern','minimal'],
    'stacked-image-below': ['calm','story','wellness','handmade','artisan'],
    'asymmetric-offset': ['dynamic','bold','edgy','athletic','architectural'],
    'minimal-text-only': ['stark','quiet','understated']
  },
  type: {
    'serif-editorial': ['editorial','classic','literary','elegant'],
    'display-condensed': ['bold','loud','energetic','athletic'],
    'classic-serif-mix': ['luxury','heritage','established','legacy'],
    'humanist': ['friendly','warm','approachable','boutique'],
    'mono-technical': ['technical','data','software','engineering','analytics'],
    'geo-sans': ['modern','clean','minimal','tech','startup']
  },
  nav: {
    'boxed-pill': ['friendly','approachable','playful','retail'],
    'minimal-until-scroll': ['startup','app','tech','software','saas'],
    'sidebar': ['technical','industrial','dashboard','engineering'],
    'centered-logo': ['heritage','elegant','boutique','premium','luxury']
  },
  card: {
    'flat': ['minimal','clean','quiet'],
    'bordered': ['institutional','trusted','professional','established'],
    'elevated-shadow': ['modern','tech','product','software'],
    'image-led': ['visual','portfolio','photo','photography'],
    'numbered-editorial': ['editorial','magazine','story'],
    'outline-ghost': ['handmade','craft','boutique','artisan']
  },
  imagery: {
    'photo-led-placeholder': ['photo','photography','visual','gallery'],
    'illustration': ['playful','fun','creative','colorful','colourful'],
    'texture-organic': ['natural','organic','earthy','handmade','wellness'],
    'grid-mosaic': ['data','technical','dashboard','software','analytics']
  },
  cta: {
    'sharp-block': ['bold','edgy','loud','athletic'],
    'outline-ghost': ['premium','established','trusted','luxury'],
    'underline-link': ['minimal','editorial','quiet'],
    'floating-badge': ['startup','app','tech','saas']
  },
  colorBehavior: {
    'high-contrast-mono-accent': ['bold','tech','startup','modern'],
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
function composeStyleFromAnalysis(text, seedKey) {
  const seed = styles[seedKey] || styles.precision;
  const composed = { name: seed.name, tagline: seed.tagline, palette: seed.palette, seedKey };
  Object.keys(dimensionKeywords).forEach(dim => {
    const scores = scoreKeywords(text || '', dimensionKeywords[dim]);
    const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]);
    composed[dim] = (ranked.length && ranked[0][1] > 0) ? ranked[0][0] : seed[dim];
  });
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
  gallery: { creative:'Work', fashion:'Lookbook', hospitality:'Gallery', realestate:'Listings', retail:'Shop' }
};
function navLabelFor(type, categoryKey) {
  if (type === 'about') return 'About';
  const overrides = sectionNavLabelOverrides[type] || {};
  if (overrides[categoryKey]) return overrides[categoryKey];
  return type === 'gallery' ? 'Gallery' : 'Services';
}

// ---- Compositional section system --------------------------------------
// The old "site-sections" was one fixed 3-box grid every result shared.
// V5 assembles an ordered list of section *types*, scored per result from
// the composed dimensions + detected category + which assets are actually
// available -- so two results in the same category can end up with a
// genuinely different section count and order, not just different labels
// inside the same shape. See SITE-PROJECT-V5.md part 4 for the full table.
function composeSections(category, composed, assetPlan, categoryKey) {
  const trustHeavy = ['finance','professional','realestate','tech','education','civic'];
  const portfolioish = ['creative','fashion','hospitality','retail','realestate'];
  const personalTrust = ['nonprofit','creative','wellness','professional','education'];
  const consumerTrust = ['wellness','fitness','professional','hospitality','realestate','education'];

  const scores = {
    proof: (composed.pattern === 'proof-first' ? 2 : 0) + (trustHeavy.includes(categoryKey) ? 1 : 0),
    gallery: (composed.pattern === 'portfolio-first' ? 2 : 0) + (portfolioish.includes(categoryKey) ? 1 : 0) + ((assetPlan.gallery || []).length ? 2 : 0),
    about: (composed.pattern === 'story-first' ? 2 : 0) + (personalTrust.includes(categoryKey) ? 1 : 0) + (assetPlan.about ? 2 : 0),
    testimonial: (composed.pattern === 'proof-first' ? 1 : 0) + (consumerTrust.includes(categoryKey) ? 1 : 0)
  };
  let chosen = Object.keys(scores).filter(k => scores[k] >= 2);
  if (!chosen.length) {
    const best = Object.keys(scores).reduce((a, b) => (scores[a] >= scores[b] ? a : b));
    chosen = [best];
  }

  const middle = [];
  if (composed.pattern === 'story-first' && chosen.includes('about')) middle.push('about');
  middle.push('services'); // baseline content every result gets
  ['proof', 'gallery', 'about', 'testimonial'].forEach(k => { if (chosen.includes(k) && !middle.includes(k)) middle.push(k); });
  if (composed.spacing === 'airy' || composed.spacing === 'generous') middle.push('ctaBanner');

  return ['hero', ...middle, 'footer'];
}
// Variant choice is tied to an existing composed dimension rather than
// independently random, so a result still reads as one coherent design
// system rather than mismatched parts bolted together.
function pickVariant(type, composed) {
  switch (type) {
    case 'services': return ['image-led', 'elevated-shadow', 'numbered-editorial'].includes(composed.card) ? 'described' : 'numbered';
    case 'gallery': return ['asymmetric-offset', 'fullbleed-image'].includes(composed.hero) ? 'featured' : 'grid';
    case 'testimonial': return (composed.spacing === 'airy' || composed.spacing === 'generous') ? 'centered' : 'card';
    case 'about': return (composed.spacing === 'airy' || composed.spacing === 'generous') ? 'split' : 'statement';
    case 'ctaBanner': return ['high-contrast-mono-accent', 'dark-luxury-metallic'].includes(composed.colorBehavior) ? 'accent' : 'plain';
    case 'proof': return ['mono-technical', 'geo-sans'].includes(composed.type) ? 'stats' : 'statement';
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

// ---- Section HTML renderers ----------------------------------------------
// Every generated/placeholder image uses the same honest, art-directed CSS
// treatment as V3/V4 (no fabricated photos, ever) via the `imagery`
// composed dimension -- these functions only decide *whether* a role has a
// real user asset to show instead.
function renderHero(project, category) {
  const composed = project.design.dimensions;
  const plan = project.assets.plan;
  const heroAsset = plan.hero ? project.assets.items.find(a => a.id === plan.hero) : null;
  const businessName = (project.business.name || 'Your Business').trim();
  const kicker = escapeHtml(category.kicker);
  const headline = escapeHtml(category.headline);
  const sub = escapeHtml(toneSub(project.business.tone, category, project.source.location));
  const cta = escapeHtml(category.cta);
  const initial = escapeHtml((businessName.charAt(0) || 'Y').toUpperCase());
  const visualInner = heroAsset
    ? `<img class="site-visual-img" src="${heroAsset.dataUrl}" alt="${escapeHtml(heroAsset.alt || businessName + ' photo')}" />`
    : `<div class="visual-grid"></div><div class="visual-mark">${initial}</div><div class="visual-card"><small>LOCAL RATING</small><strong>4.9 / 5</strong></div>`;
  return `<div class="site-hero">
    <div class="site-copy">
      <p>${kicker}</p>
      <h3>${headline}</h3>
      <p>${sub}</p>
      <div class="site-actions"><button>${cta}</button><span>See our work ↗</span></div>
    </div>
    <div class="site-visual">${visualInner}</div>
  </div>`;
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
function renderProof(project, category, variant) {
  if (variant === 'stats') {
    const stats = [{ n: '10+', l: 'Years' }, { n: '4.9★', l: 'Avg. rating' }, { n: '100%', l: category.noun.charAt(0).toUpperCase() + category.noun.slice(1) }];
    return `<div class="site-section site-section-proof" data-variant="stats">
      <div class="site-proof-stats">${stats.map(s => `<div><strong>${escapeHtml(s.n)}</strong><small>${escapeHtml(s.l)}</small></div>`).join('')}</div>
    </div>`;
  }
  return `<div class="site-section site-section-proof" data-variant="statement">
    <p class="site-proof-statement">Trusted by people who need real ${escapeHtml(category.noun)}, not just a nice website.</p>
  </div>`;
}
function renderGallery(project, category, variant) {
  const plan = project.assets.plan;
  const galleryAssets = (plan.gallery || []).map(id => project.assets.items.find(a => a.id === id)).filter(Boolean);
  const label = escapeHtml(navLabelFor('gallery', project.business.categoryKey));
  const tileCount = variant === 'featured' ? 3 : 4;
  const tiles = [];
  for (let i = 0; i < tileCount; i++) {
    const asset = galleryAssets[i];
    const featuredClass = (i === 0 && variant === 'featured') ? ' gallery-tile-featured' : '';
    if (asset) tiles.push(`<div class="gallery-tile has-image${featuredClass}"><img src="${asset.dataUrl}" alt="${escapeHtml(asset.alt || label + ' photo')}" /></div>`);
    else tiles.push(`<div class="gallery-tile gallery-tile-placeholder${featuredClass}"></div>`);
  }
  return `<div class="site-section site-section-gallery" data-variant="${variant}">
    <p class="site-section-label">${label}</p>
    <div class="gallery-grid gallery-layout-${variant}">${tiles.join('')}</div>
  </div>`;
}
function renderTestimonial(project, category, variant) {
  const quote = `“Working with a ${escapeHtml(category.label.toLowerCase())} team that actually explains things clearly made this easy.”`;
  const attribution = `— Verified ${escapeHtml(category.label)} client`;
  if (variant === 'card') {
    return `<div class="site-section site-section-testimonial" data-variant="card">
      <div class="testimonial-card"><p>${quote}</p><span>${attribution}</span></div>
    </div>`;
  }
  return `<div class="site-section site-section-testimonial" data-variant="centered">
    <blockquote>${quote}<cite>${attribution}</cite></blockquote>
  </div>`;
}
function renderAbout(project, category, variant) {
  const plan = project.assets.plan;
  const aboutAsset = plan.about ? project.assets.items.find(a => a.id === plan.about) : null;
  const businessName = (project.business.name || 'Your Business').trim();
  const statement = `We're a ${escapeHtml(category.label.toLowerCase())} team focused on getting the details right, from the first conversation to the finished result.`;
  if (variant === 'split' || aboutAsset) {
    const visual = aboutAsset
      ? `<img src="${aboutAsset.dataUrl}" alt="${escapeHtml(aboutAsset.alt || 'Team photo')}" />`
      : `<div class="about-avatar-placeholder">${escapeHtml((businessName.charAt(0) || 'Y').toUpperCase())}</div>`;
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
function renderCtaBanner(project, category, variant) {
  const heading = 'Ready to see this as your real website?';
  const cta = escapeHtml(category.cta);
  return `<div class="site-section site-section-cta-banner cta-banner-${variant}" data-variant="${variant}">
    <p>${escapeHtml(heading)}</p><button>${cta}</button>
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
    case 'proof': return renderProof(project, category, section.variant);
    case 'services': return renderServices(project, category, section.variant);
    case 'gallery': return renderGallery(project, category, section.variant);
    case 'about': return renderAbout(project, category, section.variant);
    case 'testimonial': return renderTestimonial(project, category, section.variant);
    case 'ctaBanner': return renderCtaBanner(project, category, section.variant);
    case 'footer': return renderSiteFooter(project, category, section.variant);
    default: return '';
  }
}
function insertSection(proj, type) {
  const variant = pickVariant(type, proj.design.dimensions);
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
  if ((plan.gallery || []).length && !types.includes('gallery')) insertSection(proj, 'gallery');
  if (plan.about && !types.includes('about')) insertSection(proj, 'about');
}

// ---- WebsiteProject construction + rendering -----------------------------
function createProject(analysis, preserved) {
  const category = categories[analysis.categoryKey] || categories.other;
  const seedKey = analysis.styleKey;
  const composed = composeStyleFromAnalysis(analysis.text, seedKey);
  const assets = (preserved && preserved.assets) ? { items: preserved.assets.items.slice() } : { items: [] };
  assets.plan = planAssets(assets);
  const dimensions = { hero: composed.hero, type: composed.type, nav: composed.nav, card: composed.card, imagery: composed.imagery, cta: composed.cta, colorBehavior: composed.colorBehavior, motion: composed.motion, spacing: composed.spacing, pattern: composed.pattern };
  const sections = composeSections(category, dimensions, assets.plan, analysis.categoryKey)
    .map((type, i) => ({ id: `${type}-${i}-${Date.now().toString(36)}`, type, variant: pickVariant(type, dimensions) }));
  const proj = {
    meta: { id: 'proj_' + Date.now().toString(36), createdAt: new Date().toISOString(), version: 'v5' },
    source: { text: analysis.text, location: analysis.location },
    business: {
      name: (preserved && preserved.business && preserved.business.name) || 'Your Business',
      categoryKey: analysis.categoryKey,
      tone: (preserved && preserved.business && preserved.business.tone) || 'professional'
    },
    intent: { seedKey, styleAlternates: analysis.styleAlternates },
    design: { palette: { ...composed.palette }, dimensions, heroLayout: (preserved && preserved.design && preserved.design.heroLayout) || 'split' },
    sections,
    assets,
    responsive: { device: (preserved && preserved.responsive && preserved.responsive.device) || 'desktop' }
  };
  ensureAssetDrivenSections(proj);
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

// renderProject is the ONLY function that writes to the live preview DOM.
// Every control listener mutates `project` and then calls this.
function renderProject(proj) {
  const category = categories[proj.business.categoryKey] || categories.other;
  const composed = proj.design.dimensions;
  proj.assets.plan = planAssets(proj.assets);

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

  const layoutLabel = LAYOUT_LABELS[proj.design.heroLayout] || 'Layout 1';
  summaryMode.textContent = `${proj.sections.length} sections · Composed`;
  summaryColor.textContent = proj.design.palette.main.toUpperCase();
  summaryLayout.textContent = layoutLabel;
  summaryIndustry.textContent = category.label;

  handoffTitle.textContent = proj.business.name || 'Your Business';
  handoffMeta.textContent = `${proj.design.palette.main.toUpperCase()} main · ${proj.design.palette.background.toUpperCase()} background · ${proj.design.palette.text.toUpperCase()} text · ${layoutLabel} · ${category.label}`;
  if (proj.source.text) {
    handoffDescriptionNote.hidden = false;
    handoffDescriptionNote.textContent = `Based on: "${proj.source.text}"`;
  } else {
    handoffDescriptionNote.hidden = true;
    handoffDescriptionNote.textContent = '';
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
    hasGenerated = true;
    unlockRefine();
    renderProject(project);
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
const refineLock = $('#refineLock');
const refineLockCta = $('#refineLockCta');
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
industrySelect.addEventListener('input', () => { if (!project) return; project.business.categoryKey = industrySelect.value; renderProject(project); });
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
    // Cycle to the next real ranked seed from the ORIGINAL analysis (not
    // random), recompose design dimensions + section variants against it,
    // and reorder the services strip -- reads as "the ambiguous parts get
    // a fresh take," never named to the visitor.
    const candidates = [project.intent.seedKey, ...(project.intent.styleAlternates || [])].filter(Boolean);
    const pool = candidates.length ? candidates : [project.intent.seedKey];
    const currentIndex = pool.indexOf(project.intent.seedKey);
    const nextKey = pool[(currentIndex + 1) % pool.length] || pool[0];
    const composed = composeStyleFromAnalysis(project.source.text, nextKey);
    project.intent.seedKey = nextKey;
    project.design.palette = { ...composed.palette };
    project.design.dimensions = { hero: composed.hero, type: composed.type, nav: composed.nav, card: composed.card, imagery: composed.imagery, cta: composed.cta, colorBehavior: composed.colorBehavior, motion: composed.motion, spacing: composed.spacing, pattern: composed.pattern };
    project.sections.forEach(s => { s.variant = pickVariant(s.type, project.design.dimensions); });
    const category = categories[project.business.categoryKey] || categories.other;
    category.services.push(category.services.shift());
    renderProject(project);
  });
}
if (saveProjectButton) saveProjectButton.addEventListener('click', saveProjectToStorage);
if (loadProjectButton) loadProjectButton.addEventListener('click', loadProjectFromStorage);
// This one lives in the pre-generation lock overlay (not inside the
// Advanced panel, which is blurred/non-interactive until hasGenerated is
// true) -- otherwise a returning visitor could never reach it at all.
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
      const composed = composeStyleFromAnalysis(text, analysis.styleKey);
      const dims = { hero: composed.hero, type: composed.type, nav: composed.nav, card: composed.card, imagery: composed.imagery, cta: composed.cta, colorBehavior: composed.colorBehavior, motion: composed.motion, spacing: composed.spacing, pattern: composed.pattern };
      const plan = planAssets(project ? project.assets : { items: [] });
      const previewSections = composeSections(category, dims, plan, analysis.categoryKey);
      if (heroKicker) heroKicker.textContent = category.kicker;
      if (heroHeadline) heroHeadline.textContent = category.headline;
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

// ---- Generation sequence ----
function setStepState(li, state, note) {
  if (!li) return;
  li.classList.remove('done', 'active');
  if (state) li.classList.add(state);
  if (note !== undefined) {
    const small = li.querySelector('small');
    if (small) small.textContent = note;
  }
}
function unlockRefine() {
  if (refineLock) refineLock.hidden = true;
  if (builderShell) builderShell.classList.remove('locked');
}
function finishGeneration(analysis) {
  hasGenerated = true;
  project = createProject(analysis, project);
  renderProject(project);

  if (generationProgress) generationProgress.hidden = true;
  if (heroMachine) heroMachine.classList.remove('generating');
  if (heroDemoCopy) heroDemoCopy.style.removeProperty('opacity');
  if (generatorSubmitButton) generatorSubmitButton.disabled = false;
  if (generatorSubmitLabel) generatorSubmitLabel.textContent = 'Generate my website';

  unlockRefine();
  const target = document.getElementById('build');
  if (target) target.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' });
}
function runGeneration(text) {
  if (!text || !text.trim()) return;
  const analysis = analyzeDescription(text);

  if (prefersReducedMotion() || !generationProgress || !generationSteps) {
    finishGeneration(analysis);
    return;
  }

  const category = categories[analysis.categoryKey] || categories.other;
  const composed = composeStyleFromAnalysis(analysis.text, analysis.styleKey);
  const dims = { hero: composed.hero, type: composed.type, nav: composed.nav, card: composed.card, imagery: composed.imagery, cta: composed.cta, colorBehavior: composed.colorBehavior, motion: composed.motion, spacing: composed.spacing, pattern: composed.pattern };
  const plan = planAssets(project ? project.assets : { items: [] });
  const previewSections = composeSections(category, dims, plan, analysis.categoryKey);

  const steps = [
    ['understand', `${category.label} business detected${analysis.location ? ' in ' + analysis.location : ''}`],
    ['structure', `${previewSections.length} sections selected for your site`],
    ['content', `Headline + copy matched to ${category.label}`],
    ['style', describeComposition(composed)],
    ['preview', 'Desktop + mobile preview ready']
  ];

  if (generatorSubmitButton) generatorSubmitButton.disabled = true;
  if (generatorSubmitLabel) generatorSubmitLabel.textContent = 'Generating…';
  if (heroMachine) heroMachine.classList.add('generating');
  if (heroDemoCopy) heroDemoCopy.style.opacity = '0';
  generationProgress.hidden = false;

  const stepEls = steps.map(([key]) => generationSteps.querySelector(`[data-step="${key}"]`));
  stepEls.forEach(li => setStepState(li, null, ''));

  let i = 0;
  function nextStep() {
    if (i > 0) setStepState(stepEls[i - 1], 'done');
    if (i >= steps.length) { finishGeneration(analysis); return; }
    setStepState(stepEls[i], 'active', steps[i][1]);
    i++;
    setTimeout(nextStep, 500);
  }
  nextStep();
}

if (generatorForm) {
  generatorForm.addEventListener('submit', event => {
    event.preventDefault();
    runGeneration(generatorInput.value);
  });
}
if (refineLockCta) {
  refineLockCta.addEventListener('click', () => {
    if (generatorInput) generatorInput.focus({ preventScroll: false });
    const hero = document.querySelector('.hero');
    if (hero) hero.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' });
  });
}

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

// ---- Bootstrap: an initial placeholder project so the (locked/blurred)
// preview shows sensible generic content before the first real generation,
// same as V3/V4's static markup used to, but now built the same way any
// other project is. ----
project = createProject({ text: '', categoryKey: 'other', styleKey: 'precision', styleAlternates: [], location: '' }, null);
renderProject(project);
year.textContent = new Date().getFullYear();
