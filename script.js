const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

// ==========================================================================
// STYLE REGISTRY -- a style is a combination of reusable design dimensions
// (hero/type/nav/card/imagery/cta/colorBehavior/motion/spacing/pattern) plus
// a palette. Shared CSS rules (see styles.css "STYLE SYSTEM V3") key off
// these data-* values -- adding a style means adding an entry here, not a
// bespoke CSS block. See STYLE-SYSTEM-V3.md for the full architecture.
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
// CATEGORIES -- broadened beyond trades. Public product copy never assumes
// any one of these; this is the generator's internal knowledge, used to
// produce a real, category-appropriate result once a business is described.
// ==========================================================================
const categories = {
  electrical:   { label:'Electrical',              kicker:'ELECTRICAL SERVICES',    headline:'Powering better spaces.',                 sub:'Residential and commercial electrical work delivered with clarity, care and zero runaround.', services:['Residential','Commercial','Service Calls'], cta:'Request a Quote', noun:'electrical work' },
  plumbing:     { label:'Plumbing',                 kicker:'PLUMBING SERVICES',      headline:'Clear work. Zero runaround.',              sub:'Straightforward plumbing service, repairs and installations for homes and businesses.', services:['Emergency','Repairs','Water Heaters'], cta:'Request a Quote', noun:'plumbing work' },
  landscaping:  { label:'Landscaping',              kicker:'LANDSCAPING SERVICES',   headline:'Outdoor spaces, considered.',              sub:'Landscaping, stonework and outdoor spaces built to look good and last.', services:['Landscaping','Hardscaping','Outdoor Living'], cta:'Request a Quote', noun:'landscaping work' },
  painting:     { label:'Painting',                 kicker:'PAINTING SERVICES',      headline:'Colour changes everything.',               sub:'Interior and exterior painting with clean prep, sharp lines and a finish built to hold up.', services:['Interiors','Exteriors','Commercial'], cta:'Request a Quote', noun:'painting work' },
  roofing:      { label:'Roofing',                  kicker:'ROOFING SERVICES',       headline:'Built for the weather.',                   sub:'Roofing and exterior work backed by clear communication and dependable installation.', services:['Roofing','Exteriors','Repairs'], cta:'Request a Quote', noun:'roofing work' },
  automotive:   { label:'Automotive',               kicker:'AUTOMOTIVE SERVICES',    headline:'Built for people who care about cars.',    sub:'Detailing, protection and automotive services presented with the same attention as the work itself.', services:['Detailing','Protection','Restoration'], cta:'Book a Service', noun:'automotive work' },
  cleaning:     { label:'Cleaning',                 kicker:'CLEANING SERVICES',      headline:'A cleaner first impression.',              sub:'Reliable residential and commercial cleaning with simple booking and clear service options.', services:['Residential','Commercial','Move-Out'], cta:'Get a Quote', noun:'cleaning service' },
  renovation:   { label:'Renovation',               kicker:'RENOVATION SERVICES',    headline:'Craft built on reputation.',               sub:'Renovation work presented through strong projects, clear process and proof people can trust.', services:['Kitchens','Basements','Full Home'], cta:'Request a Quote', noun:'renovation work' },
  retail:       { label:'Retail',                   kicker:'RETAIL',                 headline:'Products worth stopping for.',             sub:'A storefront that makes browsing feel as good as buying, online or in person.', services:['New Arrivals','Best Sellers','In-Store'], cta:'Shop Now', noun:'products' },
  professional: { label:'Professional Services',    kicker:'PROFESSIONAL SERVICES',  headline:'Clarity you can act on.',                  sub:'Straightforward guidance from people who know the details, so you do not have to.', services:['Consulting','Advisory','Planning'], cta:'Book a Consultation', noun:'guidance' },
  hospitality:  { label:'Food & Hospitality',       kicker:'FOOD & HOSPITALITY',     headline:'Made to be experienced.',                  sub:'A menu and a room worth showing off before anyone walks in the door.', services:['Menu','Catering','Reservations'], cta:'View Menu', noun:'experience' },
  creative:     { label:'Creative Studio',          kicker:'CREATIVE STUDIO',        headline:'Work that speaks first.',                  sub:'A portfolio built to let the work do the talking.', services:['Portfolio','Process','Collaborations'], cta:'See Our Work', noun:'work' },
  wellness:     { label:'Health & Wellness',        kicker:'HEALTH & WELLNESS',      headline:'Feel better, starting here.',              sub:'A calm, trustworthy front door for people looking after themselves.', services:['Treatments','Booking','About'], cta:'Book Now', noun:'care' },
  tech:         { label:'Technology',               kicker:'TECHNOLOGY',            headline:'Built for how you work.',                  sub:'A product site that explains itself in the first ten seconds.', services:['Product','Pricing','Docs'], cta:'Get Started', noun:'product' },
  realestate:   { label:'Real Estate',              kicker:'REAL ESTATE',           headline:'Find the right place.',                    sub:'Listings and a story about how you work, presented properly.', services:['Listings','Buyers','Sellers'], cta:'View Listings', noun:'listings' },
  fitness:      { label:'Fitness',                  kicker:'FITNESS',                headline:'Progress you can see.',                    sub:'A site that makes it easy to show up for the first session.', services:['Programs','Coaching','Schedule'], cta:'Join Now', noun:'coaching' },
  education:    { label:'Education',                kicker:'EDUCATION',             headline:'Learning that sticks.',                    sub:'A clear front door for people deciding whether to enroll.', services:['Programs','Instructors','Enroll'], cta:'Enroll Now', noun:'programs' },
  nonprofit:    { label:'Community & Nonprofit',    kicker:'COMMUNITY',             headline:'Doing the work that matters.',             sub:'A site built to explain the mission and make it easy to help.', services:['Mission','Get Involved','Impact'], cta:'Get Involved', noun:'work' },
  other:        { label:'General Business',         kicker:'YOUR BUSINESS',          headline:'Built to make a strong first impression.', sub:'A modern website that makes the quality of your business obvious before anyone reaches out.', services:['Overview','What We Do','Get in Touch'], cta:'Get Started', noun:'business' }
};

// Keyword lists driving the generator's (real, deterministic) reading of a
// free-text business description -- no AI/LLM call is made anywhere in this
// file. This runs instantly and synchronously; the 5-step "progress" UI
// paces the *reveal* of an already-computed real result.
const categoryKeywords = {
  electrical:['electric','electrician','wiring','panel upgrade'],
  plumbing:['plumb','pipe','drain','water heater'],
  landscaping:['landscap','lawn','yard','garden','backyard','hardscape','outdoor living'],
  painting:['paint'],
  roofing:['roof','shingle','gutter'],
  automotive:['auto','detailing','mechanic','car detail'],
  cleaning:['clean','maid','janitorial'],
  renovation:['renovat','remodel','contractor','construction','kitchen reno','basement'],
  retail:['retail','shop','store','boutique','shopping'],
  professional:['consult','law firm','legal','accounting','financial','advisor','bookkeeping'],
  hospitality:['cafe','coffee','restaurant','bakery','catering','bar','eatery','food truck'],
  creative:['design studio','photography','photographer','creative agency','videograph','branding studio','illustrator'],
  wellness:['spa','wellness','therapy','massage','yoga studio','salon','esthetic'],
  tech:['software','saas','startup','tech company','platform','api'],
  realestate:['real estate','realtor','property management','realty'],
  fitness:['gym','fitness','personal training','crossfit','training studio'],
  education:['tutor','academy','course','education','coaching program','bootcamp'],
  nonprofit:['nonprofit','non-profit','charity','community organization','foundation'],
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
  nightshade:['nightlife','moody','dark','after hours','late night'],
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
// Small, deterministic nudge toward styles that tend to suit a detected
// category -- still just keyword-driven ranking, not a hidden preference
// that overrides an explicit style choice or a strong text signal.
const categoryStyleAffinity = {
  electrical:['impact','precision','foundry'], plumbing:['precision','impact','foundry'],
  landscaping:['terra','editorial','precision'], painting:['studio','bloom','precision'],
  roofing:['impact','foundry','precision'], automotive:['kinetic','impact','foundry'],
  cleaning:['precision','paper','civic'], renovation:['civic','foundry','precision'],
  retail:['bloom','studio','precision'], professional:['civic','executive','paper'],
  hospitality:['editorial','atelier','bloom'], creative:['studio','aperture','monolith'],
  wellness:['meridian','terra','paper'], tech:['signal','ledger','luminous'],
  realestate:['civic','executive','aviator'], fitness:['kinetic','impact','signal'],
  education:['civic','precision','editorial'], nonprofit:['terra','editorial','civic'],
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
// styles that suit the detected category, and pulls a location if one reads
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
const patternNotes = {
  standard: '',
  'portfolio-first': 'Selected work',
  'proof-first': 'Trusted by real customers',
  'story-first': 'A quick word about us first'
};

// ---- DOM refs ----
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
const siteKicker = $('#siteKicker');
const siteHeadline = $('#siteHeadline');
const siteSub = $('#siteSub');
const siteSections = $('#siteSections');
const sitePatternNote = $('#sitePatternNote');
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
const heroCardStyle = $('#heroCardStyle');
const heroCardBrand = $('#heroCardBrand');
const heroCardIndustry = $('#heroCardIndustry');
const generationProgress = $('#generationProgress');
const generationSteps = $('#generationSteps');
const styleSwatchRow = $('#styleSwatchRow');

// Refine-panel elements
const builderShell = $('#builderShell');
const refineLock = $('#refineLock');
const refineLockCta = $('#refineLockCta');
const suggestionsBlock = $('#suggestionsBlock');
const suggestionChips = $('#suggestionChips');
const toneToggle = $('#toneToggle');
const shuffleServices = $('#shuffleServices');
const regenerateButton = $('#regenerateButton');

let selectedStyle = 'precision';
let selectedStyleOverride = null; // set when the visitor explicitly picks a style
let selectedLayout = 'split';
let selectedTone = 'professional';
let uploadedLogoData = '';
let uploadedLogoName = '';
let currentAnalysis = null;
let hasGenerated = false;

function hexToRgb(hex) { const n = parseInt(hex.replace('#',''),16); return {r:(n>>16)&255,g:(n>>8)&255,b:n&255}; }
function rgbToHex(r,g,b){ return '#' + [r,g,b].map(v=>Math.max(0,Math.min(255,Math.round(v))).toString(16).padStart(2,'0')).join(''); }
function mix(hex, target, amount){ const a=hexToRgb(hex), b=hexToRgb(target); return rgbToHex(a.r+(b.r-a.r)*amount,a.g+(b.g-a.g)*amount,a.b+(b.b-a.b)*amount); }

// ---- Populate the style swatch row from the registry (20 buttons + Auto) ----
if (styleSwatchRow) {
  styleKeys.forEach(key => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'style-swatch';
    btn.dataset.style = key;
    btn.setAttribute('aria-pressed', 'false');
    btn.innerHTML = `<span class="swatch-dot" style="--swatch-color:${styles[key].palette.main}"></span>${styles[key].name}`;
    styleSwatchRow.appendChild(btn);
  });
}
function setStyleSwatchActive(key) {
  $$('.style-swatch', styleSwatchRow || document).forEach(btn => {
    const active = (key === null && btn.dataset.style === 'auto') || btn.dataset.style === key;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-pressed', String(active));
  });
}
if (styleSwatchRow) {
  styleSwatchRow.addEventListener('click', event => {
    const btn = event.target.closest('.style-swatch');
    if (!btn) return;
    selectedStyleOverride = btn.dataset.style === 'auto' ? null : btn.dataset.style;
    setStyleSwatchActive(selectedStyleOverride);
    if (hasGenerated) {
      const key = selectedStyleOverride || (currentAnalysis ? currentAnalysis.styleKey : 'precision');
      setStyle(key, true);
    }
  });
}

function applyStyleDimensions(key) {
  const s = styles[key];
  builderSite.dataset.style = key;
  builderSite.dataset.hero = s.hero;
  builderSite.dataset.type = s.type;
  builderSite.dataset.nav = s.nav;
  builderSite.dataset.card = s.card;
  builderSite.dataset.imagery = s.imagery;
  builderSite.dataset.cta = s.cta;
  builderSite.dataset.colorBehavior = s.colorBehavior;
  builderSite.dataset.motion = prefersReducedMotion() ? 'none' : s.motion;
  builderSite.dataset.spacing = s.spacing;
  builderSite.dataset.pattern = s.pattern;
}

function setStyle(key, syncBuilder = true) {
  selectedStyle = key;
  if (syncBuilder) {
    applyStyleDimensions(key);
    applyStyleDefaults(key);
    updateBuilder();
  }
}

function updatePalette(main, background, text, accent2) {
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

  brandColorHex.textContent = main.toUpperCase();
  backgroundColorHex.textContent = background.toUpperCase();
  textColorHex.textContent = text.toUpperCase();
}

function applyStyleDefaults(key) {
  const palette = styles[key].palette;
  brandColor.value = palette.main;
  backgroundColor.value = palette.background;
  textColor.value = palette.text;
}

function selectedSections(){ return $$('.section-toggles input:checked').map(input=>input.value); }

function updateBuilder() {
  const business = (businessName.value || 'Your Business').trim();
  const category = categories[industrySelect.value] || categories.other;
  const color = brandColor.value;
  const bgColor = backgroundColor.value;
  const txtColor = textColor.value;
  const accent2 = styles[selectedStyle] ? styles[selectedStyle].palette.accent2 : color;
  const displayBusiness = business.toUpperCase();
  siteBusiness.textContent = displayBusiness;
  if (uploadedLogoData) {
    siteLogo.src = uploadedLogoData;
    siteLogo.alt = `${business} logo`;
    siteLogo.classList.add('active');
    siteBusiness.classList.add('logo-active');
  } else {
    siteLogo.removeAttribute('src');
    siteLogo.alt = '';
    siteLogo.classList.remove('active');
    siteBusiness.classList.remove('logo-active');
  }
  siteKicker.textContent = category.kicker;
  siteHeadline.textContent = category.headline;
  siteSub.textContent = toneSub(selectedTone, category, currentAnalysis ? currentAnalysis.location : '');
  applyStyleDimensions(selectedStyle);
  builderSite.dataset.layout = selectedLayout;
  updatePalette(color, bgColor, txtColor, accent2);

  const sections = selectedSections();
  const serviceLabels = category.services;
  siteSections.innerHTML = serviceLabels.map((label,i)=>`<div><small>0${i+1}</small><strong>${label}</strong></div>`).join('');
  siteSections.style.display = sections.includes('services') ? 'grid' : 'none';

  const patternKey = styles[selectedStyle] ? styles[selectedStyle].pattern : 'standard';
  if (sitePatternNote) {
    const note = patternNotes[patternKey];
    sitePatternNote.hidden = !note;
    sitePatternNote.textContent = note;
  }

  const navButton = builderSite.querySelector('.site-nav button');
  const actionsButton = builderSite.querySelector('.site-actions button');
  if (navButton) navButton.textContent = category.cta;
  if (actionsButton) actionsButton.textContent = category.cta;

  summaryMode.textContent = styles[selectedStyle] ? styles[selectedStyle].name : selectedStyle;
  summaryColor.textContent = color.toUpperCase();
  summaryLayout.textContent = ({split:'Layout 1', center:'Layout 2', poster:'Layout 3'}[selectedLayout] || 'Layout 1');
  summaryIndustry.textContent = category.label;
  handoffTitle.textContent = `${business} — ${styles[selectedStyle] ? styles[selectedStyle].name : selectedStyle}`;
  handoffMeta.textContent = `${color.toUpperCase()} main · ${bgColor.toUpperCase()} background · ${txtColor.toUpperCase()} text · ${{split:'Layout 1', center:'Layout 2', poster:'Layout 3'}[selectedLayout] || 'Layout 1'} · ${category.label}`;
  if (currentAnalysis && currentAnalysis.text) {
    handoffDescriptionNote.hidden = false;
    handoffDescriptionNote.textContent = `Based on: "${currentAnalysis.text}"`;
  } else {
    handoffDescriptionNote.hidden = true;
    handoffDescriptionNote.textContent = '';
  }
  formBusiness.value = business;
  formDescription.value = currentAnalysis ? currentAnalysis.text : '';
  formDesignMode.value = styles[selectedStyle] ? styles[selectedStyle].name : selectedStyle;
  formBrandColor.value = color.toUpperCase();
  formBackgroundColor.value = bgColor.toUpperCase();
  formTextColor.value = txtColor.toUpperCase();
  formLogoName.value = uploadedLogoName;
  formLogoData.value = uploadedLogoData;
  formLayout.value = ({split:'Layout 1', center:'Layout 2', poster:'Layout 3'}[selectedLayout] || 'Layout 1');
  formIndustry.value = category.label;
  formSections.value = sections.join(', ');
}

[businessName, industrySelect, brandColor, backgroundColor, textColor].forEach(el => el.addEventListener('input', updateBuilder));

chooseLogo.addEventListener('click', () => businessLogo.click());
logoPreviewBox.addEventListener('click', () => businessLogo.click());

function clearLogo() {
  uploadedLogoData = '';
  uploadedLogoName = '';
  businessLogo.value = '';
  logoPreviewImage.removeAttribute('src');
  logoPreviewImage.classList.remove('active');
  logoPlaceholder.hidden = false;
  removeLogo.hidden = true;
  updateBuilder();
}

removeLogo.addEventListener('click', clearLogo);

businessLogo.addEventListener('change', event => {
  const file = event.target.files && event.target.files[0];
  if (!file) return;

  const allowed = ['image/png','image/jpeg','image/webp','image/svg+xml'];
  if (!allowed.includes(file.type)) {
    alert('Please choose a PNG, JPG, WEBP or SVG logo.');
    clearLogo();
    return;
  }
  if (file.size > 4 * 1024 * 1024) {
    alert('Please use a logo smaller than 4 MB.');
    clearLogo();
    return;
  }

  const reader = new FileReader();
  reader.onload = () => {
    const original = reader.result;

    if (file.type === 'image/svg+xml') {
      uploadedLogoData = original;
      uploadedLogoName = file.name;
      logoPreviewImage.src = original;
      logoPreviewImage.classList.add('active');
      logoPlaceholder.hidden = true;
      removeLogo.hidden = false;
      updateBuilder();
      return;
    }

    const img = new Image();
    img.onload = () => {
      const maxW = 720, maxH = 360;
      const scale = Math.min(1, maxW / img.width, maxH / img.height);
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(img.width * scale));
      canvas.height = Math.max(1, Math.round(img.height * scale));
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0,0,canvas.width,canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      uploadedLogoData = canvas.toDataURL('image/png', 0.92);
      uploadedLogoName = file.name.replace(/\.[^.]+$/, '') + '.png';
      logoPreviewImage.src = uploadedLogoData;
      logoPreviewImage.classList.add('active');
      logoPlaceholder.hidden = true;
      removeLogo.hidden = false;
      updateBuilder();
    };
    img.src = original;
  };
  reader.readAsDataURL(file);
});

$$('.layout-choice').forEach(button => button.addEventListener('click', () => {
  selectedLayout = button.dataset.layout;
  $$('.layout-choice').forEach(b => b.classList.toggle('active', b === button));
  updateBuilder();
}));
resetColors.addEventListener('click', () => {
  applyStyleDefaults(selectedStyle);
  updateBuilder();
});
$$('.section-toggles input').forEach(input => input.addEventListener('change', updateBuilder));
$$('.device-toggle button').forEach(button => button.addEventListener('click', () => {
  $$('.device-toggle button').forEach(b => b.classList.toggle('active', b === button));
  builderDevice.classList.toggle('mobile', button.dataset.device === 'mobile');
}));

// ---- Refinement controls (tone, regenerate, alternate styles) ----
if (toneToggle) {
  $$('#toneToggle button').forEach(btn => btn.addEventListener('click', () => {
    selectedTone = btn.dataset.tone;
    $$('#toneToggle button').forEach(b => b.classList.toggle('active', b === btn));
    updateBuilder();
  }));
}
if (shuffleServices) {
  shuffleServices.addEventListener('click', () => {
    const category = categories[industrySelect.value] || categories.other;
    category.services.push(category.services.shift());
    updateBuilder();
  });
}
function renderSuggestions(analysis) {
  if (!suggestionsBlock || !suggestionChips) return;
  const alts = (analysis.styleAlternates || []).filter(s => s && s !== analysis.styleKey);
  if (!alts.length) { suggestionsBlock.hidden = true; suggestionChips.innerHTML = ''; return; }
  suggestionsBlock.hidden = false;
  suggestionChips.innerHTML = alts.map(key => `<button type="button" class="suggestion-chip" data-style="${key}">${styles[key].name}</button>`).join('');
  $$('.suggestion-chip', suggestionChips).forEach(btn => btn.addEventListener('click', () => {
    selectedStyleOverride = btn.dataset.style;
    setStyleSwatchActive(selectedStyleOverride);
    setStyle(btn.dataset.style, true);
  }));
}
if (regenerateButton) {
  regenerateButton.addEventListener('click', () => {
    if (!currentAnalysis) return;
    // Regenerate = cycle to the next real ranked alternate (not random) and
    // reorder the services strip -- a fresh-feeling result built from the
    // same real analysis, not a new fabricated computation.
    const candidates = [currentAnalysis.styleKey, ...(currentAnalysis.styleAlternates || [])].filter(Boolean);
    const pool = selectedStyleOverride ? [selectedStyleOverride, ...candidates.filter(k => k !== selectedStyleOverride)] : candidates;
    const currentIndex = pool.indexOf(selectedStyle);
    const nextKey = pool[(currentIndex + 1) % pool.length] || pool[0];
    const category = categories[industrySelect.value] || categories.other;
    category.services.push(category.services.shift());
    setStyle(nextKey, true);
  });
}

// ---- Hero live micro-preview: updates as the visitor types, before they
// ever press Generate, so the hero already feels alive. Text-only changes,
// deliberately cheap (no theme/color recompute on every keystroke). ----
let heroLiveTimer;
if (generatorInput) {
  generatorInput.addEventListener('input', () => {
    clearTimeout(heroLiveTimer);
    heroLiveTimer = setTimeout(() => {
      const text = generatorInput.value.trim();
      if (!text) return;
      const analysis = analyzeDescription(text);
      const category = categories[analysis.categoryKey] || categories.other;
      const styleKey = selectedStyleOverride || analysis.styleKey;
      const styleInfo = styles[styleKey];
      if (heroKicker) heroKicker.textContent = category.kicker;
      if (heroHeadline) heroHeadline.textContent = category.headline;
      if (heroCardStyle) heroCardStyle.textContent = styleInfo.name;
      if (heroCardBrand) heroCardBrand.textContent = styleInfo.palette.main.toUpperCase();
      if (heroCardIndustry) heroCardIndustry.textContent = category.label;
    }, 220);
  });
}
$$('.example-chip').forEach(btn => btn.addEventListener('click', () => {
  generatorInput.value = btn.dataset.example;
  generatorInput.dispatchEvent(new Event('input'));
  generatorInput.focus();
  if (generatorForm.requestSubmit) generatorForm.requestSubmit();
  else generatorForm.dispatchEvent(new Event('submit', {cancelable: true}));
}));

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
  currentAnalysis = analysis;

  const styleKey = selectedStyleOverride || analysis.styleKey;
  setStyle(styleKey, true);
  industrySelect.value = (analysis.categoryKey in categories) ? analysis.categoryKey : 'other';
  if (!businessName.value.trim() || businessName.value === 'Your Business') {
    businessName.value = 'Your Business';
  }
  updateBuilder();
  renderSuggestions(analysis);

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
  const styleKey = selectedStyleOverride || analysis.styleKey;
  const styleInfo = styles[styleKey];
  const sectionCount = selectedSections().length || 4;

  const steps = [
    ['understand', `${category.label} business detected${analysis.location ? ' in ' + analysis.location : ''}`],
    ['structure', `${sectionCount} sections selected for your site`],
    ['content', `Headline + copy matched to ${category.label}`],
    ['style', `${styleInfo.name} — ${styleInfo.tagline}`],
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
  updateBuilder();
  const submitButton = leadForm.querySelector('button[type="submit"]');
  const originalLabel = submitButton.textContent;
  submitButton.disabled = true;
  submitButton.textContent = 'Sending…';
  formStatus.className = 'form-status';
  formStatus.textContent = 'Saving your direction…';
  try {
    const formData = new FormData(leadForm);
    const payload = Object.fromEntries(formData.entries());
    const response = await fetch('/api/lead', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload) });
    const result = await response.json().catch(()=>({}));
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

setStyle('precision');
applyStyleDefaults('precision');
updateBuilder();
year.textContent = new Date().getFullYear();
