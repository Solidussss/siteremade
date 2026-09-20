const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const modeDefaults = {
  luminous:  { main:'#315cff', background:'#0c1120', text:'#ffffff' },
  editorial: { main:'#8b6d4f', background:'#f5efe6', text:'#1d1915' },
  precision: { main:'#315cff', background:'#fafafa', text:'#111111' },
  studio:    { main:'#ff6b3d', background:'#f2e8db', text:'#111111' },
  executive: { main:'#b59b6d', background:'#13231d', text:'#f0eadf' },
  impact:    { main:'#e8ff43', background:'#ff5b37', text:'#111111' }
};

const modeData = {
  luminous: { number: '01', name: 'Luminous', tagline: 'Modern UI with controlled glow and depth.', brand: 'NORTHLINE', domain: 'yourbusiness.com', kicker: 'ELECTRICAL SERVICES', headline: 'Powering better spaces.' },
  editorial: { number: '02', name: 'Editorial', tagline: 'Publication-inspired structure with timeless typography.', brand: 'WESTRIDGE', domain: 'yourbusiness.com', kicker: 'LANDSCAPING SERVICES', headline: 'Outdoor spaces, considered.' },
  precision: { number: '03', name: 'Precision', tagline: 'Minimal, refined and intentionally quiet.', brand: 'ARC PLUMBING', domain: 'yourbusiness.com', kicker: 'PLUMBING SERVICES', headline: 'Clear work. Zero noise.' },
  studio: { number: '04', name: 'Studio', tagline: 'Expressive layouts with contemporary creative energy.', brand: 'NORTHWEST', domain: 'northwestpainting.ca', kicker: 'PAINTING / INTERIORS', headline: 'Colour changes everything.' },
  executive: { number: '05', name: 'Executive', tagline: 'Established, premium and built around trust.', brand: 'SUMMIT', domain: 'yourbusiness.com', kicker: 'RENOVATION SERVICES', headline: 'Craft built on reputation.' },
  impact: { number: '06', name: 'Impact', tagline: 'Big, direct and impossible to ignore.', brand: 'FORGE', domain: 'yourbusiness.com', kicker: 'ROOFING & EXTERIORS', headline: 'BUILT FOR THE WEATHER.' }
};

const industries = {
  electrical: { label: 'Electrical', kicker: 'ELECTRICAL SERVICES', headline: 'Powering better spaces.', sub: 'Residential and commercial electrical work delivered with clarity, care and zero runaround.', services: ['Residential', 'Commercial', 'Service Calls'] },
  plumbing: { label: 'Plumbing', kicker: 'PLUMBING SERVICES', headline: 'Clear work. Zero runaround.', sub: 'Straightforward plumbing service, repairs and installations for homes and businesses.', services: ['Emergency', 'Repairs', 'Water Heaters'] },
  landscaping: { label: 'Landscaping', kicker: 'LANDSCAPING SERVICES', headline: 'Outdoor spaces, considered.', sub: 'Landscaping, stonework and outdoor spaces built to look good and last.', services: ['Landscaping', 'Hardscaping', 'Outdoor Living'] },
  painting: { label: 'Painting', kicker: 'PAINTING SERVICES', headline: 'Colour changes everything.', sub: 'Interior and exterior painting with clean prep, sharp lines and a finish built to hold up.', services: ['Interiors', 'Exteriors', 'Commercial'] },
  roofing: { label: 'Roofing', kicker: 'ROOFING SERVICES', headline: 'Built for the weather.', sub: 'Roofing and exterior work backed by clear communication and dependable installation.', services: ['Roofing', 'Exteriors', 'Repairs'] },
  automotive: { label: 'Automotive', kicker: 'AUTOMOTIVE SERVICES', headline: 'Built for people who care about cars.', sub: 'Detailing, protection and automotive services presented with the same attention as the work itself.', services: ['Detailing', 'Protection', 'Restoration'] },
  cleaning: { label: 'Cleaning', kicker: 'CLEANING SERVICES', headline: 'A cleaner first impression.', sub: 'Reliable residential and commercial cleaning with simple booking and clear service options.', services: ['Residential', 'Commercial', 'Move-Out'] },
  renovation: { label: 'Renovation', kicker: 'RENOVATION SERVICES', headline: 'Craft built on reputation.', sub: 'Renovation work presented through strong projects, clear process and proof people can trust.', services: ['Kitchens', 'Basements', 'Full Home'] },
  other: { label: 'Service Business', kicker: 'YOUR BUSINESS', headline: 'Built to look worth calling.', sub: 'A modern website that makes the quality of your business obvious before the first phone call.', services: ['Service One', 'Service Two', 'Service Three'] }
};

// Keyword lists driving the generator's (real, deterministic) reading of a
// free-text business description -- no AI/LLM call is made anywhere in this
// file. See GENERATOR-V2.md section 2 for why, and what that means for the
// "generation" progress UI further down.
const industryKeywords = {
  electrical: ['electric', 'electrician', 'wiring', 'panel upgrade'],
  plumbing: ['plumb', 'pipe', 'drain', 'water heater'],
  landscaping: ['landscap', 'lawn', 'yard', 'garden', 'backyard', 'hardscape', 'outdoor living'],
  painting: ['paint'],
  roofing: ['roof', 'shingle', 'gutter'],
  automotive: ['auto', 'detailing', 'mechanic', 'car detail'],
  cleaning: ['clean', 'maid', 'janitorial'],
  renovation: ['renovat', 'remodel', 'contractor', 'construction', 'kitchen reno', 'basement'],
  other: []
};
const modeKeywords = {
  executive: ['luxury', 'premium', 'high-end', 'high end', 'upscale', 'exclusive', 'elite', 'established'],
  precision: ['modern', 'clean', 'minimal', 'simple', 'sleek'],
  impact: ['bold', 'loud', 'aggressive', 'stand out', 'eye-catching', 'eye catching'],
  studio: ['creative', 'colorful', 'colourful', 'fun', 'artsy', 'playful', 'vibrant', 'unique'],
  editorial: ['classic', 'timeless', 'traditional', 'heritage', 'elegant'],
  luminous: ['tech', 'digital', 'app', 'futuristic', 'glow']
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
// existing industry/mode dictionaries above and pulls a location if one
// reads like "... in <City>". Runs synchronously and instantly -- the
// generation-progress UI paces the *reveal* of this, it doesn't wait on it.
function analyzeDescription(text) {
  const industryOrder = rankedKeys(scoreKeywords(text, industryKeywords), 'other');
  const modeOrder = rankedKeys(scoreKeywords(text, modeKeywords), 'luminous');
  return {
    text: text.trim(),
    industryKey: industryOrder[0],
    modeKey: modeOrder[0],
    modeAlternates: modeOrder.slice(1, 3),
    location: extractLocation(text)
  };
}
// Tone is a deterministic copy swap, not a live rewrite -- three real,
// pre-written templates per tone. "Professional" is the existing curated
// sub-copy; the other two are honest variations, not claimed AI output.
function toneSub(tone, industry, location) {
  const loc = location ? ` in ${location}` : '';
  if (tone === 'bold') return `No filler. Just ${industry.label.toLowerCase()} work that gets noticed${loc} -- done right, done fast.`;
  if (tone === 'friendly') return `Choosing a ${industry.label.toLowerCase()} pro shouldn't feel stressful. We keep it simple and honest${loc}, with zero surprises.`;
  return industry.sub;
}
function prefersReducedMotion() {
  return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

const modeTabs = $$('.mode-tab');
const modeStage = $('#modeStage');
const modeNumber = $('#modeNumber');
const modeName = $('#modeName');
const modeTagline = $('#modeTagline');
const modeDomain = $('#modeDomain');
const previewBrand = $('#previewBrand');
const previewKicker = $('#previewKicker');
const previewHeadline = $('#previewHeadline');
const useThisDirection = $('#useThisDirection');
const builderMode = $('#builderMode');
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

// Refine-panel elements
const builderShell = $('#builderShell');
const refineLock = $('#refineLock');
const refineLockCta = $('#refineLockCta');
const suggestionsBlock = $('#suggestionsBlock');
const suggestionChips = $('#suggestionChips');
const toneToggle = $('#toneToggle');
const shuffleServices = $('#shuffleServices');

let selectedMode = 'luminous';
let selectedLayout = 'split';
let selectedTone = 'professional';
let uploadedLogoData = '';
let uploadedLogoName = '';
let currentAnalysis = null;
let hasGenerated = false;

function titleCase(value='') { return value.replace(/\b\w/g, c => c.toUpperCase()); }
function hexToRgb(hex) { const n = parseInt(hex.replace('#',''),16); return {r:(n>>16)&255,g:(n>>8)&255,b:n&255}; }
function rgbToHex(r,g,b){ return '#' + [r,g,b].map(v=>Math.max(0,Math.min(255,Math.round(v))).toString(16).padStart(2,'0')).join(''); }
function mix(hex, target, amount){ const a=hexToRgb(hex), b=hexToRgb(target); return rgbToHex(a.r+(b.r-a.r)*amount,a.g+(b.g-a.g)*amount,a.b+(b.b-a.b)*amount); }

function setMode(mode, syncBuilder = true) {
  selectedMode = mode;
  const data = modeData[mode];
  if (useThisDirection) useThisDirection.dataset.mode = mode;
  modeTabs.forEach(tab => tab.classList.toggle('active', tab.dataset.mode === mode));
  modeStage.dataset.mode = mode;
  modeNumber.textContent = data.number;
  modeName.textContent = data.name;
  modeTagline.textContent = data.tagline;
  modeDomain.textContent = data.domain;
  previewBrand.textContent = data.brand;
  previewKicker.textContent = data.kicker;
  previewHeadline.textContent = data.headline;
  $$('.mode-dots i').forEach((dot, i) => dot.classList.toggle('active', i === Number(data.number)-1));
  if (syncBuilder) {
    builderMode.value = mode;
    builderSite.dataset.mode = mode;
    applyModeDefaults(mode);
    updateBuilder();
  }
}
modeTabs.forEach(tab => tab.addEventListener('click', () => setMode(tab.dataset.mode)));
builderMode.addEventListener('change', e => setMode(e.target.value, true));

function updatePalette(main, background, text) {
  const dark = mix(main, '#000000', .55);
  const light = mix(main, '#ffffff', .76);
  const soft = mix(main, '#ffffff', .91);
  const bgDark = mix(background, '#000000', .18);
  const bgLight = mix(background, '#ffffff', .12);
  const textMuted = mix(text, background, .38);

  builderSite.style.setProperty('--site-accent', main);
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

function applyModeDefaults(mode) {
  const palette = modeDefaults[mode];
  brandColor.value = palette.main;
  backgroundColor.value = palette.background;
  textColor.value = palette.text;
}

function selectedSections(){ return $$('.section-toggles input:checked').map(input=>input.value); }
function updateBuilder() {
  const business = (businessName.value || 'Your Business').trim();
  const industry = industries[industrySelect.value] || industries.other;
  const color = brandColor.value;
  const bgColor = backgroundColor.value;
  const txtColor = textColor.value;
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
  siteKicker.textContent = industry.kicker;
  siteHeadline.textContent = industry.headline;
  siteSub.textContent = toneSub(selectedTone, industry, currentAnalysis ? currentAnalysis.location : '');
  builderSite.dataset.mode = selectedMode;
  builderSite.dataset.layout = selectedLayout;
  updatePalette(color, bgColor, txtColor);

  const sections = selectedSections();
  const serviceLabels = industry.services;
  siteSections.innerHTML = serviceLabels.map((label,i)=>`<div><small>0${i+1}</small><strong>${label}</strong></div>`).join('');
  siteSections.style.display = sections.includes('services') ? 'grid' : 'none';

  summaryMode.textContent = modeData[selectedMode].name;
  summaryColor.textContent = color.toUpperCase();
  summaryLayout.textContent = ({split:'Layout 1', center:'Layout 2', poster:'Layout 3'}[selectedLayout] || 'Layout 1');
  summaryIndustry.textContent = industry.label;
  handoffTitle.textContent = `${business} — ${modeData[selectedMode].name}`;
  handoffMeta.textContent = `${color.toUpperCase()} main · ${bgColor.toUpperCase()} background · ${txtColor.toUpperCase()} text · ${{split:'Layout 1', center:'Layout 2', poster:'Layout 3'}[selectedLayout] || 'Layout 1'} · ${industry.label}`;
  if (currentAnalysis && currentAnalysis.text) {
    handoffDescriptionNote.hidden = false;
    handoffDescriptionNote.textContent = `Based on: "${currentAnalysis.text}"`;
  } else {
    handoffDescriptionNote.hidden = true;
    handoffDescriptionNote.textContent = '';
  }
  formBusiness.value = business;
  formDescription.value = currentAnalysis ? currentAnalysis.text : '';
  formDesignMode.value = modeData[selectedMode].name;
  formBrandColor.value = color.toUpperCase();
  formBackgroundColor.value = bgColor.toUpperCase();
  formTextColor.value = txtColor.toUpperCase();
  formLogoName.value = uploadedLogoName;
  formLogoData.value = uploadedLogoData;
  formLayout.value = ({split:'Layout 1', center:'Layout 2', poster:'Layout 3'}[selectedLayout] || 'Layout 1');
  formIndustry.value = industry.label;
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

    // SVG can stay as-is. Raster images are resized to keep the submission light.
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
  applyModeDefaults(selectedMode);
  updateBuilder();
});
$$('.section-toggles input').forEach(input => input.addEventListener('change', updateBuilder));
$$('.device-toggle button').forEach(button => button.addEventListener('click', () => {
  $$('.device-toggle button').forEach(b => b.classList.toggle('active', b === button));
  builderDevice.classList.toggle('mobile', button.dataset.device === 'mobile');
}));

// ---- Refinement controls (tone, regenerate, alternate directions) ----
if (toneToggle) {
  $$('#toneToggle button').forEach(btn => btn.addEventListener('click', () => {
    selectedTone = btn.dataset.tone;
    $$('#toneToggle button').forEach(b => b.classList.toggle('active', b === btn));
    updateBuilder();
  }));
}
if (shuffleServices) {
  shuffleServices.addEventListener('click', () => {
    const industry = industries[industrySelect.value] || industries.other;
    industry.services.push(industry.services.shift());
    updateBuilder();
  });
}
function renderSuggestions(analysis) {
  if (!suggestionsBlock || !suggestionChips) return;
  const alts = (analysis.modeAlternates || []).filter(m => m && m !== analysis.modeKey);
  if (!alts.length) { suggestionsBlock.hidden = true; suggestionChips.innerHTML = ''; return; }
  suggestionsBlock.hidden = false;
  suggestionChips.innerHTML = alts.map(m => `<button type="button" class="suggestion-chip" data-mode="${m}">${modeData[m].name}</button>`).join('');
  $$('.suggestion-chip', suggestionChips).forEach(btn => btn.addEventListener('click', () => setMode(btn.dataset.mode, true)));
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
      const industry = industries[analysis.industryKey] || industries.other;
      const modeInfo = modeData[analysis.modeKey];
      if (heroKicker) heroKicker.textContent = industry.kicker;
      if (heroHeadline) heroHeadline.textContent = industry.headline;
      if (heroCardStyle) heroCardStyle.textContent = modeInfo.name;
      if (heroCardBrand) heroCardBrand.textContent = (modeDefaults[analysis.modeKey] || modeDefaults.luminous).main.toUpperCase();
      if (heroCardIndustry) heroCardIndustry.textContent = industry.label;
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

  setMode(analysis.modeKey, true);
  industrySelect.value = (analysis.industryKey in industries) ? analysis.industryKey : 'other';
  if (!businessName.value.trim() || businessName.value === 'Northline Electric') {
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

  const industry = industries[analysis.industryKey] || industries.other;
  const modeInfo = modeData[analysis.modeKey];
  const sectionCount = selectedSections().length || 4;

  const steps = [
    ['understand', `${industry.label} business detected${analysis.location ? ' in ' + analysis.location : ''}`],
    ['structure', `${sectionCount} sections selected for a service-business layout`],
    ['content', `Headline + service copy matched to ${industry.label}`],
    ['style', `${modeInfo.name} -- ${modeInfo.tagline}`],
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
if (useThisDirection) {
  useThisDirection.addEventListener('click', () => {
    const mode = useThisDirection.dataset.mode || selectedMode;
    const industryKey = (industrySelect.value in industries) ? industrySelect.value : 'other';
    const fallbackText = generatorInput && generatorInput.value.trim()
      ? generatorInput.value.trim()
      : `A ${industries[industryKey].label.toLowerCase()} business`;
    finishGeneration({
      text: fallbackText,
      industryKey,
      modeKey: mode,
      modeAlternates: [],
      location: currentAnalysis ? currentAnalysis.location : ''
    });
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

setMode('luminous');
applyModeDefaults('luminous');
updateBuilder();
year.textContent = new Date().getFullYear();
