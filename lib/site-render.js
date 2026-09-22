// V8.6: a Node-only, hand-ported copy of script.js's PURE section/chrome
// renderer functions (project+category+section in, HTML string out, no DOM
// access) -- used by the export compiler (lib/export-compiler.js) to
// compile a persisted, purchased project's SELECTED direction into a real
// static HTML/CSS package without the SiteRemade editor UI being present
// (V8.6 spec §2/§7).
//
// This is a DELIBERATE, DOCUMENTED duplication, explicitly extending the
// exact convention lib/vocabulary.js already established in V8.5 ("a
// deliberate, documented duplication, not an oversight" -- script.js is a
// browser global-scope script, not a CommonJS module, so it cannot be
// require()'d here). script.js itself is NOT modified by V8.6 (it is
// frozen/regression-protected, per V8.5) -- every function below is a
// faithful, line-for-line-where-possible copy of the corresponding pure
// function in script.js, with only two categories of change:
//   1. Browser globals that don't exist in Node are removed (there is no
//      DOM here -- renderVisualSlot below no longer reads
//      project.imagePlan/`generating` state, because a compiled export
//      only ever has two states for a slot: a real resolved asset, or the
//      honest static CSS placeholder -- an export can never be "generating"
//      since it never calls the image provider, see V8.6 spec §11).
//   2. `asset.dataUrl` may be a real base64 data URL (rare -- only if the
//      export compiler couldn't resolve a file path) OR, in the normal
//      case, a RELATIVE FILE PATH the export compiler wrote into the same
//      `dataUrl` field name (e.g. "assets/<sha256>.png") after resolving
//      the project's {assetRef} markers to real exported files -- see
//      lib/export-compiler.js's `hydrateAssetsForExport`. Every renderer
//      below just does `src="${asset.dataUrl}"` exactly like script.js
//      does, so this substitution is transparent to every function here.
//
// Whenever script.js's renderers change, this file must be re-synced by
// hand -- same discipline lib/vocabulary.js already documents.
'use strict';

// Responsive/QA pass: mirrors script.js's own TEXT_ONLY_HERO_VARIANTS /
// HERO_TEXT_ONLY_FALLBACK / mapHeroToTextOnlyVariant (see that file's
// comment for the full rationale) -- kept in sync by hand for the same
// documented reason this file's own header already explains. Without this,
// a purchased/exported site whose hero has no funded real image would
// render an image-bearing hero layout (e.g. hero-split/.site-visual) with
// nothing real in the visual slot, even though the LIVE builder preview
// (script.js's reconcileImageSupplyWithSections, which DOES run this same
// mapping) already correctly shows a clean text-only hero for the exact
// same project -- a real gap between preview and export, not just a
// cosmetic one, found during this pass and fixed here rather than only in
// script.js so the two never again show different hero layouts for the
// same unfunded direction.
const TEXT_ONLY_HERO_VARIANTS = ['centered-oversized', 'minimal-text-only', 'poster'];
const HERO_TEXT_ONLY_FALLBACK = {
  'fullbleed-image': 'poster',
  collage: 'poster',
  'asymmetric-offset': 'centered-oversized',
  split: 'minimal-text-only',
  centered: 'minimal-text-only',
  'stacked-image-below': 'minimal-text-only',
  'grid-dashboard': 'minimal-text-only',
  'product-screenshot': 'minimal-text-only',
};
function mapHeroToTextOnlyVariant(originalHero) {
  if (TEXT_ONLY_HERO_VARIANTS.includes(originalHero)) return originalHero;
  return HERO_TEXT_ONLY_FALLBACK[originalHero] || 'minimal-text-only';
}
// Ground truth for "does the hero slot actually have a funded real image"
// is project.imagePlan (persisted -- see script.js line ~4413's own
// serialization of it), the SAME signal reconcileImageSupplyWithSections
// reads client-side, NOT a boolean re-derived from the design dimensions.
// Prefers an already-reconciled `heroDisplayVariant` when the persisted
// project has one (keeps a purchased snapshot's export pixel-identical to
// what the buyer actually saw in their own preview); only recomputes from
// imagePlan as a fallback for a project that was never reconciled
// client-side (e.g. an older saved direction). Never mutates the project.
function effectiveHeroLayout(project) {
  const composed = project.design.dimensions;
  if (composed.heroDisplayVariant) return composed.heroDisplayVariant;
  if (TEXT_ONLY_HERO_VARIANTS.includes(composed.hero)) return composed.hero;
  const heroEntry = (project.imagePlan || []).find(e => e.slot === 'hero' || e.role === 'hero');
  if (heroEntry && heroEntry.sourceType === 'designed') return mapHeroToTextOnlyVariant(composed.hero);
  return composed.hero;
}

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

// ---- Category data (script.js lines ~109-131) -----------------------------
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
function categoryFor(project) { return categories[project.business && project.business.categoryKey] || categories.other; }

// ---- Nav / label helpers (script.js line 576-589) -------------------------
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

// ---- Tone / palette helpers (script.js lines 453-521, 2711-2713) ----------
function hashString(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) { h = (h * 31 + str.charCodeAt(i)) | 0; }
  return Math.abs(h);
}
function toneSub(tone, category, location) {
  const loc = location ? ` in ${location}` : '';
  if (tone === 'bold') return `No filler. Just results that get noticed${loc} — done right, done fast.`;
  if (tone === 'friendly') return `Finding the right ${category.label.toLowerCase()} team shouldn't feel stressful${loc}. We keep it simple and honest, with zero surprises.`;
  return category.sub;
}
function hexToRgb(hex) { const n = parseInt(String(hex || '#000000').replace('#', ''), 16); return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }; }
function rgbToHex(r, g, b) { return '#' + [r, g, b].map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join(''); }
function mix(hex, target, amount) { const a = hexToRgb(hex), b = hexToRgb(target); return rgbToHex(a.r + (b.r - a.r) * amount, a.g + (b.g - a.g) * amount, a.b + (b.b - a.b) * amount); }
// The exact 9 --site-* custom properties script.js's updatePaletteFromProject
// sets on #builderSite at render time -- reproduced here so the exported
// page can set the same inline style block once, at build time, and get
// pixel-identical color output from the SAME styles.css rules.
function paletteVars(palette) {
  const { main, background, text, accent2 } = palette || {};
  const dark = mix(main, '#000000', .55);
  const light = mix(main, '#ffffff', .76);
  const bgDark = mix(background, '#000000', .18);
  const bgLight = mix(background, '#ffffff', .12);
  const textMuted = mix(text, background, .38);
  return {
    '--site-accent': main, '--site-accent-2': accent2 || main, '--site-accent-dark': dark, '--site-accent-light': light,
    '--site-bg': background, '--site-bg-dark': bgDark, '--site-bg-light': bgLight, '--site-text': text, '--site-muted': textMuted,
  };
}

// ---- Asset slot resolution (script.js lines 773-791, 850-852) -------------
// Export-time simplification of renderVisualSlot: an export never has a
// "generating" in-flight state (it never calls the image provider -- V8.6
// spec §11), so this only ever has two outcomes: a real resolved asset
// (asset.dataUrl already rewritten to a relative exported file path by the
// export compiler), or the same honest static CSS placeholder script.js's
// live preview shows before an image exists.
function renderVisualSlot(project, slot, imageryKey, assetId) {
  const asset = assetId ? (project.assets.items || []).find(a => a.id === assetId) : null;
  if (asset && asset.dataUrl) return `<img class="site-visual-img" src="${escapeHtml(asset.dataUrl)}" alt="${escapeHtml(asset.alt || (project.business.name || 'Business') + ' image')}" />`;
  return `<div class="visual-generated" data-imagery="${escapeHtml(imageryKey || 'abstract-geometric')}" data-role="${escapeHtml(slot)}"></div>`;
}
function pageSlotPrefix(page) { return (page && page.slug) ? `${page.slug}::` : ''; }

function sectionCopyField(section, field, fallback) {
  const value = section && section.copy && section.copy[field];
  return (typeof value === 'string' && value) ? value : fallback;
}

// ---- CTA button (script.js lines 1402-1413) --------------------------------
function renderCtaButton(target, escapedLabel, extraClass) {
  const cls = `module-cta-btn${extraClass ? ' ' + extraClass : ''}`;
  if (!target) return `<button type="button" class="${cls}">${escapedLabel}</button>`;
  switch (target.kind) {
    case 'tel': return `<a class="${cls}" href="tel:${escapeHtml(String(target.value || '').replace(/[^\d+]/g, ''))}" data-cta-kind="tel">${escapedLabel}</a>`;
    case 'mailto': return `<a class="${cls}" href="mailto:${escapeHtml(target.value)}" data-cta-kind="mailto">${escapedLabel}</a>`;
    case 'external': return `<a class="${cls}" href="${escapeHtml(target.value)}" target="_blank" rel="noopener noreferrer" data-cta-kind="external">${escapedLabel}</a>`;
    case 'page': return `<button type="button" class="${cls}" data-cta-kind="page" data-cta-page-id="${escapeHtml(target.pageId)}">${escapedLabel}</button>`;
    case 'section': return `<button type="button" class="${cls}" data-cta-kind="section" data-cta-page-id="${escapeHtml(target.pageId)}" data-cta-section-id="${escapeHtml(target.sectionId)}">${escapedLabel}</button>`;
    default: return `<button type="button" class="${cls}">${escapedLabel}</button>`;
  }
}

// ---- Module field / form rendering (script.js lines 2146-2166, 2385-2439, 1427-1483) ----
function defaultModuleCtaLabel(type) {
  switch (type) {
    case 'contact': return 'Send message';
    case 'quote': return 'Request a quote';
    case 'newsletter': return 'Subscribe';
    case 'booking': return 'Request booking';
    default: return 'Submit';
  }
}
function defaultSuccessMessage(type) {
  switch (type) {
    case 'contact': return "Thanks — we've got your message and will be in touch soon.";
    case 'quote': return "Thanks — we'll review this and follow up with a quote.";
    case 'newsletter': return "You're subscribed.";
    case 'booking': return "Thanks — we'll confirm your request shortly.";
    default: return 'Thanks — we received that.';
  }
}
// V8.6: unlike script.js's resolveModuleProvider (which only ever knows
// about the client-side 'preview' provider), the export compiler decides
// per-export whether a module is backed by a real production submission
// endpoint -- see lib/export-compiler.js's `classifyRuntime`/manifest. This
// render layer only needs to know the PRESENTATION difference between the
// two: a preview-labelled note, or none.
function moduleFieldInputHtml(section, field) {
  const id = `mf-${section.id}-${field.key}`;
  const errId = `${id}-err`;
  const reqAttr = field.required ? ' required aria-required="true"' : '';
  const describedBy = ` aria-describedby="${errId}"`;
  let input;
  if (field.kind === 'textarea') {
    input = `<textarea id="${id}" name="${escapeHtml(field.key)}" data-field-key="${field.key}" maxlength="1000"${reqAttr}${describedBy}></textarea>`;
  } else if (field.kind === 'select') {
    const opts = (field.options || []).map(o => `<option value="${escapeHtml(o)}">${escapeHtml(o)}</option>`).join('');
    input = `<select id="${id}" name="${escapeHtml(field.key)}" data-field-key="${field.key}"${reqAttr}${describedBy}><option value="">Select…</option>${opts}</select>`;
  } else {
    const type = ['email', 'tel', 'date', 'time'].includes(field.kind) ? field.kind : 'text';
    input = `<input id="${id}" type="${type}" name="${escapeHtml(field.key)}" data-field-key="${field.key}" maxlength="200"${reqAttr}${describedBy} />`;
  }
  return `<div class="module-field">
    <label for="${id}">${escapeHtml(field.label)}${field.required ? ' <span class="module-required-mark" aria-hidden="true">*</span>' : ''}</label>
    ${input}
    <span class="module-field-err" id="${errId}" role="alert"></span>
  </div>`;
}
// A rendered module form only ever appears in a SERVER_REQUIRED export
// (a project with an enabled contact/quote/booking/newsletter module
// always classifies server_required -- see lib/runtime-classifier.js --
// and a static export never contains one). Its exported site.js always
// POSTs to that package's own real `/api/submit/:sectionId` endpoint
// (lib/export-compiler.js's compileServerRequiredPackage), which really
// validates and persists the submission -- so the honest note here is
// never "preview mode" (script.js's live-editor wording, for a submission
// nothing real ever received): it says a real backend accepted it, while
// still never claiming an email/CRM notification exists unless one is
// actually configured (spec §9 -- "never silently use the preview
// provider as though real" cuts both ways: never claim less than what
// really happened, either).
function renderFormModuleWidget(project, section, headingFallback) {
  const module = section.module;
  const heading = sectionCopyField(section, 'headline', headingFallback);
  const ctaLabel = escapeHtml(sectionCopyField(section, 'ctaLabel', defaultModuleCtaLabel(module.type)));
  return `<div class="site-section site-section-module module-${module.type}" data-variant="module" id="module-${section.id}">
    <form class="module-form" data-module-form data-section-id="${section.id}" data-module-type="${escapeHtml(module.type)}" novalidate>
      <p class="site-section-label">${escapeHtml(heading)}</p>
      ${(module.fields || []).map(f => moduleFieldInputHtml(section, f)).join('')}
      <p class="module-submit-error" role="alert" hidden></p>
      <button type="submit" class="module-submit-btn" data-idle-label="${ctaLabel}">${ctaLabel}</button>
    </form>
    <div class="module-success" role="status" tabindex="-1" hidden data-success-message="${escapeHtml((module.successState && module.successState.message) || defaultSuccessMessage(module.type))}" data-integration-note="Received by your site — no email or CRM notification is connected yet."></div>
  </div>`;
}
function renderLocationModuleWidget(project, section) {
  const module = section.module;
  const address = (module.config && module.config.address) || '';
  const heading = sectionCopyField(section, 'headline', 'Find us');
  return `<div class="site-section site-section-module module-location" data-variant="module">
    <p class="site-section-label">${escapeHtml(heading)}</p>
    <div class="module-map-placeholder visual-generated" data-imagery="abstract-geometric">
      <span class="module-map-note">${address ? escapeHtml(address) : 'No address on file yet'}</span>
    </div>
    ${!address ? '<p class="module-empty-note">No address on file yet.</p>' : ''}
  </div>`;
}
function googleMapsSearchUrl(address) { return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`; }
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
    ${target ? renderCtaButton(target, label) : `<p class="module-empty-note">This action isn't configured yet.</p><button type="button" class="module-cta-btn" disabled>${label}</button>`}
  </div>`;
}
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

// ---- Hero (script.js lines 991-1051) ---------------------------------------
function renderHero(project, category) {
  const composed = project.design.dimensions;
  const plan = project.assets.plan || {};
  const copy = project.copy || { kicker: category.kicker, headline: category.headline, sub: toneSub(project.business.tone, category, project.source.location), cta: category.cta };
  const kicker = escapeHtml(copy.kicker), headline = escapeHtml(copy.headline), sub = escapeHtml(copy.sub), cta = escapeHtml(copy.cta || category.cta);
  const ctaBtn = renderCtaButton(copy.ctaTarget, cta, 'hero-cta-btn');
  const ctaMinimal = renderCtaButton(copy.ctaTarget, cta + ' ↗', 'minimal-link');
  const visual = renderVisualSlot(project, 'hero', composed.imagery, plan.hero);
  const layout = (project.meta && project.meta.isDemoShell) ? 'demo' : effectiveHeroLayout(project);
  switch (layout) {
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
    default: return `<div class="site-hero hero-split">
        <div class="site-copy"><p>${kicker}</p><h3>${headline}</h3><p>${sub}</p><div class="site-actions">${ctaBtn}<span>See our work ↗</span></div></div>
        <div class="site-visual">${visual}</div>
      </div>`;
  }
}
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

// ---- Section renderers (script.js lines 1052-1391) -------------------------
// `submitMode` ('preview'|'live') is threaded through to every module-form
// call site -- see renderFormModuleWidget's own comment.
function renderServices(project, category, section, submitMode) {
  const moduleHtml = (section && section.module && section.module.enabled && section.module.type === 'quote')
    ? renderFormModuleWidget(project, section, 'Request a quote', submitMode) : '';
  const variant = section && section.variant;
  const labels = category.services;
  const headline = sectionCopyField(section, 'headline', '');
  const intro = sectionCopyField(section, 'body', '');
  const labelHtml = headline ? `<p class="site-section-label">${escapeHtml(headline)}</p>` : '';
  const introHtml = intro ? `<p class="site-section-intro">${escapeHtml(intro)}</p>` : '';
  if (variant === 'described') {
    return `<div class="site-section site-section-services" data-variant="described">
      ${labelHtml}${introHtml}
      <div class="site-services-cards">${labels.map(l => `<div class="service-card"><strong>${escapeHtml(l)}</strong><p>Real ${escapeHtml(category.noun)}, presented clearly.</p></div>`).join('')}</div>
      ${moduleHtml}
    </div>`;
  }
  return `<div class="site-section site-section-services" data-variant="numbered">
    ${labelHtml}${introHtml}
    <div class="site-sections">${labels.map((l, i) => `<div><small>0${i + 1}</small><strong>${escapeHtml(l)}</strong></div>`).join('')}</div>
    ${moduleHtml}
  </div>`;
}
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
function renderGallery(project, category, section, labelOverride) {
  const variant = section && section.variant;
  const plan = project.assets.plan || {};
  const galleryAssets = (plan.gallery || []).map(id => (project.assets.items || []).find(a => a.id === id)).filter(Boolean);
  const label = escapeHtml(sectionCopyField(section, 'headline', labelOverride || navLabelFor('gallery', project.business.categoryKey)));
  const caption = sectionCopyField(section, 'body', '');
  const tileCount = variant === 'featured' ? 3 : 4;
  const tiles = [];
  for (let i = 0; i < tileCount; i++) {
    const asset = galleryAssets[i];
    const featuredClass = (i === 0 && variant === 'featured') ? ' gallery-tile-featured' : '';
    if (asset && asset.dataUrl) tiles.push(`<div class="gallery-tile has-image${featuredClass}"><img src="${escapeHtml(asset.dataUrl)}" alt="${escapeHtml(asset.alt || label + ' photo')}" /></div>`);
    else tiles.push(`<div class="gallery-tile gallery-tile-placeholder visual-generated${featuredClass}" data-imagery="${escapeHtml(project.design.dimensions.imagery)}"></div>`);
  }
  return `<div class="site-section site-section-gallery" data-variant="${variant}">
    <p class="site-section-label">${label}</p>
    ${caption ? `<p class="site-section-intro">${escapeHtml(caption)}</p>` : ''}
    <div class="gallery-grid gallery-layout-${variant}">${tiles.join('')}</div>
  </div>`;
}
function renderCaseStudies(project, category, section) { return renderGallery(project, category, { ...(section || {}), variant: 'grid' }, 'Recent Projects'); }
function renderTestimonial(project, category, section) {
  const variant = section && section.variant;
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
function renderTestimonialsGrid(project, category, section) {
  const label = sectionCopyField(section, 'headline', 'What people say');
  const quotes = ['Clear communication from start to finish.', 'Exactly what we needed, delivered well.', 'Would recommend without hesitation.'];
  return `<div class="site-section site-section-testimonials-grid" data-variant="grid">
    <p class="site-section-label">${escapeHtml(label)}</p>
    <div class="testimonials-grid">${quotes.map(q => `<div class="testimonial-card"><p>“${escapeHtml(q)}”</p><span>— ${escapeHtml(category.label)} client</span></div>`).join('')}</div>
  </div>`;
}
function renderAbout(project, category, section) {
  const variant = section && section.variant;
  const plan = project.assets.plan || {};
  const aboutAsset = plan.about ? (project.assets.items || []).find(a => a.id === plan.about) : null;
  const heading = sectionCopyField(section, 'headline', 'About');
  const statement = sectionCopyField(section, 'body', `We're a ${category.label.toLowerCase()} team focused on getting the details right, from the first conversation to the finished result.`);
  if (variant === 'split' || aboutAsset) {
    const slot = pageSlotPrefix(project.__exportPage) + 'about';
    const visual = renderVisualSlot(project, slot, project.design.dimensions.imagery, plan.about);
    return `<div class="site-section site-section-about" data-variant="split">
      <div class="about-visual">${visual}</div>
      <div class="about-copy"><p class="site-section-label">${escapeHtml(heading)}</p><p>${escapeHtml(statement)}</p></div>
    </div>`;
  }
  return `<div class="site-section site-section-about" data-variant="statement">
    <p class="site-section-label">${escapeHtml(heading)}</p>
    <p class="about-statement-text">${escapeHtml(statement)}</p>
  </div>`;
}
function renderTeam(project, category, section) {
  const label = sectionCopyField(section, 'headline', 'Team');
  const teamAssets = (project.assets.items || []).filter(a => a.type === 'team');
  const cards = [];
  for (let i = 0; i < Math.max(teamAssets.length, 3); i++) {
    const a = teamAssets[i];
    cards.push(a && a.dataUrl ? `<div class="team-card has-image"><img src="${escapeHtml(a.dataUrl)}" alt="${escapeHtml(a.alt || 'Team member')}" /></div>` : `<div class="team-card team-card-placeholder"></div>`);
  }
  return `<div class="site-section site-section-team" data-variant="grid">
    <p class="site-section-label">${escapeHtml(label)}</p>
    <div class="team-grid">${cards.slice(0, 4).join('')}</div>
  </div>`;
}
function renderCtaBanner(project, category, section, submitMode) {
  if (section && section.module && section.module.enabled) {
    switch (section.module.type) {
      case 'contact': return renderFormModuleWidget(project, section, sectionCopyField(section, 'headline', 'Contact'), submitMode);
      case 'quote': return renderFormModuleWidget(project, section, sectionCopyField(section, 'headline', 'Request a quote'), submitMode);
      case 'newsletter': return renderFormModuleWidget(project, section, sectionCopyField(section, 'headline', 'Stay in the loop.'), submitMode);
      case 'booking': return renderFormModuleWidget(project, section, sectionCopyField(section, 'headline', 'Request a booking'), submitMode);
      case 'action': return renderActionModuleWidget(project, section);
    }
  }
  const variant = section && section.variant;
  const message = sectionCopyField(section, 'headline', 'Ready to get started?');
  const cta = escapeHtml(sectionCopyField(section, 'ctaLabel', category.cta));
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
  return `<div class="site-section site-section-features" data-variant="grid">
    <p class="site-section-label">${escapeHtml(label)}</p>
    ${intro ? `<p class="site-section-intro">${escapeHtml(intro)}</p>` : ''}
    <div class="features-grid">${labels.map((l, i) => `<div class="feature-card"><span class="feature-mark">${escapeHtml((l || 'F').charAt(0))}</span><strong>${escapeHtml(l)}</strong><p>${escapeHtml(featureBodyFor(project, category, l, i))}</p></div>`).join('')}</div>
  </div>`;
}
function renderProductShowcase(project, category, section) {
  const businessName = escapeHtml(project.business.name || 'Your Business');
  const label = sectionCopyField(section, 'headline', 'Product');
  const caption = sectionCopyField(section, 'body', (project.copy && project.copy.sub) || category.sub);
  const slot = pageSlotPrefix(project.__exportPage) + 'product';
  const moduleHtml = section && section.module && section.module.enabled
    ? (section.module.type === 'product' ? renderProductModuleWidget(project, section) : (section.module.type === 'action' ? renderActionModuleWidget(project, section) : ''))
    : '';
  return `<div class="site-section site-section-product" data-variant="showcase">
    <p class="site-section-label">${escapeHtml(label)}</p><h4>${businessName} in action</h4>
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
    <p class="site-section-label">${escapeHtml(label)}</p>
    <div class="integration-chips">${labels.map(l => `<span class="integration-chip">${escapeHtml(l)}</span>`).join('')}</div>
  </div>`;
}
function renderPricingSection(project, category, section) {
  const label = sectionCopyField(section, 'headline', 'Pricing');
  const intro = sectionCopyField(section, 'body', '');
  const cta = sectionCopyField(section, 'ctaLabel', category.cta);
  const tiers = [{ name: 'Starter', blurb: 'For getting started quickly.' }, { name: 'Growth', blurb: 'For teams scaling up.' }, { name: 'Enterprise', blurb: 'Custom for larger needs.' }];
  return `<div class="site-section site-section-pricing" data-variant="tiers">
    <p class="site-section-label">${escapeHtml(label)}</p>
    ${intro ? `<p class="site-section-intro">${escapeHtml(intro)}</p>` : ''}
    <div class="pricing-tiers">${tiers.map(t => `<div class="pricing-tier"><strong>${escapeHtml(t.name)}</strong><p>${escapeHtml(t.blurb)}</p><button>${escapeHtml(cta)}</button></div>`).join('')}</div>
  </div>`;
}
function renderFaq(project, category, section) {
  const label = sectionCopyField(section, 'headline', 'FAQ');
  const intro = sectionCopyField(section, 'body', '');
  const d = project.source.descriptor || {};
  const noun = d.descriptor || category.noun;
  const qas = [
    { q: `What does ${escapeHtml(project.business.name || 'this business')} actually do?`, a: escapeHtml(category.sub) },
    { q: 'How do I get started?', a: `Reach out and we'll walk through ${escapeHtml(noun)} together.` },
    { q: 'Is support included?', a: 'Yes — real help, not just documentation.' }
  ];
  return `<div class="site-section site-section-faq" data-variant="list">
    <p class="site-section-label">${escapeHtml(label)}</p>
    ${intro ? `<p class="site-section-intro">${escapeHtml(intro)}</p>` : ''}
    <div class="faq-list">${qas.map(x => `<div class="faq-item"><strong>${x.q}</strong><p>${x.a}</p></div>`).join('')}</div>
  </div>`;
}
function renderProcess(project, category, section) {
  const label = sectionCopyField(section, 'headline', 'How it works');
  const intro = sectionCopyField(section, 'body', '');
  const steps = ['Reach out', 'We scope the work', 'We deliver', 'You review & sign off'];
  return `<div class="site-section site-section-process" data-variant="steps">
    <p class="site-section-label">${escapeHtml(label)}</p>
    ${intro ? `<p class="site-section-intro">${escapeHtml(intro)}</p>` : ''}
    <div class="process-steps">${steps.map((s, i) => `<div><small>0${i + 1}</small><strong>${escapeHtml(s)}</strong></div>`).join('')}</div>
  </div>`;
}
function renderMenu(project, category, section) {
  const label = sectionCopyField(section, 'headline', 'Menu');
  const intro = sectionCopyField(section, 'body', '');
  const groups = ['Starters', 'Mains', 'Desserts'];
  return `<div class="site-section site-section-menu" data-variant="columns">
    <p class="site-section-label">${escapeHtml(label)}</p>
    ${intro ? `<p class="site-section-intro">${escapeHtml(intro)}</p>` : ''}
    <div class="menu-groups">${groups.map(g => `<div class="menu-group"><strong>${escapeHtml(g)}</strong><span class="menu-line"></span><span class="menu-line"></span><span class="menu-line"></span></div>`).join('')}</div>
  </div>`;
}
function renderReservationCta(project, category, section, submitMode) {
  if (section && section.module && section.module.enabled) {
    if (section.module.type === 'booking') return renderFormModuleWidget(project, section, sectionCopyField(section, 'headline', 'Request a booking'), submitMode);
    if (section.module.type === 'action') return renderActionModuleWidget(project, section);
  }
  const message = sectionCopyField(section, 'headline', 'Book a table.');
  const cta = escapeHtml(sectionCopyField(section, 'ctaLabel', category.cta));
  return `<div class="site-section site-section-reservation" data-variant="banner">
    <p>${escapeHtml(message)}</p>${renderCtaButton(section && section.ctaTarget, cta)}
  </div>`;
}
function renderServiceAreas(project, category, section, submitMode) {
  if (section && section.module && section.module.enabled) {
    if (section.module.type === 'location') return renderLocationModuleWidget(project, section);
    if (section.module.type === 'contact') return renderFormModuleWidget(project, section, sectionCopyField(section, 'headline', 'Contact'), submitMode);
  }
  const label = sectionCopyField(section, 'headline', 'Service Areas');
  const loc = project.source.location;
  const areasText = loc ? `${loc} and surrounding areas` : 'Local & surrounding areas';
  return `<div class="site-section site-section-areas" data-variant="list">
    <p class="site-section-label">${escapeHtml(label)}</p><p class="areas-statement">${escapeHtml(areasText)}</p>
  </div>`;
}
function renderContact(project, category, section, submitMode) {
  if (section && section.module && section.module.enabled) {
    switch (section.module.type) {
      case 'contact': return renderFormModuleWidget(project, section, sectionCopyField(section, 'headline', 'Contact'), submitMode);
      case 'quote': return renderFormModuleWidget(project, section, sectionCopyField(section, 'headline', 'Request a quote'), submitMode);
      case 'booking': return renderFormModuleWidget(project, section, sectionCopyField(section, 'headline', 'Request a booking'), submitMode);
      case 'location': return renderLocationModuleWidget(project, section);
      case 'action': return renderActionModuleWidget(project, section);
    }
  }
  const label = sectionCopyField(section, 'headline', 'Contact');
  const cta = escapeHtml(sectionCopyField(section, 'ctaLabel', category.cta));
  const loc = project.source.location ? escapeHtml(project.source.location) + ' · ' : '';
  return `<div class="site-section site-section-contact" data-variant="simple">
    <p class="site-section-label">${escapeHtml(label)}</p><p>${loc}Get in touch to get started.</p>${renderCtaButton(section && section.ctaTarget, cta)}
  </div>`;
}
function renderNewsletter(project, category, section, submitMode) {
  if (section && section.module && section.module.enabled && section.module.type === 'newsletter') {
    return renderFormModuleWidget(project, section, sectionCopyField(section, 'headline', 'Stay in the loop.'), submitMode);
  }
  const message = sectionCopyField(section, 'headline', 'Stay in the loop.');
  return `<div class="site-section site-section-newsletter" data-variant="inline">
    <p>${escapeHtml(message)}</p>
    <div class="newsletter-row"><input type="email" placeholder="you@email.com" disabled /><button disabled>Subscribe</button></div>
  </div>`;
}
function renderImageLedEditorial(project, category, section) {
  const caption = sectionCopyField(section, 'body', (project.copy && project.copy.sub) || category.sub);
  const slot = pageSlotPrefix(project.__exportPage) + 'gallery-featured';
  return `<div class="site-section site-section-editorial" data-variant="image-led">
    <div class="editorial-visual">${renderVisualSlot(project, slot, project.design.dimensions.imagery, (project.assets.plan.gallery || [])[0])}</div>
    <p class="editorial-caption">${escapeHtml(caption)}</p>
  </div>`;
}
function renderSiteFooter(project, category, variant) {
  const plan = project.assets.plan || {};
  const logoAsset = plan.logo ? (project.assets.items || []).find(a => a.id === plan.logo) : null;
  const businessName = escapeHtml((project.business.name || 'Your Business').trim());
  const brandInner = (logoAsset && logoAsset.dataUrl) ? `<img class="site-footer-logo-img" src="${escapeHtml(logoAsset.dataUrl)}" alt="${businessName} logo" />` : `<strong>${businessName}</strong>`;
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

// ---- Master dispatch (script.js lines 1550-1578) ---------------------------
function renderSectionHTML(project, section, category, submitMode) {
  switch (section.type) {
    case 'proof': return renderProof(project, category);
    case 'metrics': return renderMetrics(project, category);
    case 'services': return renderServices(project, category, section, submitMode);
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
    case 'reservationCta': return renderReservationCta(project, category, section, submitMode);
    case 'serviceAreas': return renderServiceAreas(project, category, section, submitMode);
    case 'contact': return renderContact(project, category, section, submitMode);
    case 'newsletter': return renderNewsletter(project, category, section, submitMode);
    case 'ctaBanner': return renderCtaBanner(project, category, section, submitMode);
    default: return '';
  }
}

// ---- V8.6: whole-page body compose (new -- has no script.js equivalent, ----
// since the live preview only ever shows ONE page mirrored through
// proj.sections; an export needs every page rendered independently). Sets
// `project.__exportPage` for the duration of the call so the ported
// about/product/editorial slot-id helpers above (which read
// proj.pages[proj.activePageIndex] in script.js) resolve the same slot id
// an export's asset plan was built against, without needing activePageIndex
// mutated globally.
function renderPageBody(project, page, isHome, category, submitMode) {
  project.__exportPage = page;
  const introHtml = isHome ? renderHero(project, category) : renderPageHeader(project, page, category);
  const contentHtml = (page.sections || []).map(s => renderSectionHTML(project, s, category, submitMode)).join('');
  const footerHtml = renderSiteFooter(project, category, project.footerVariant || 'simple');
  delete project.__exportPage;
  return introHtml + contentHtml + footerHtml;
}
function renderNavHtml(pages, activeIndex) {
  return pages.map((p, i) => `<a href="${escapeHtml(pageHref(p, i))}" class="site-nav-link${i === activeIndex ? ' active' : ''}">${escapeHtml(p.label || (i === 0 ? 'Home' : `Page ${i + 1}`))}</a>`).join('');
}
// The exported site's own file naming: Home is always index.html; every
// other page is <safe-slug-or-fallback>.html, all siblings in one flat
// directory (see lib/export-compiler.js's own comment for why -- keeps
// every asset/css/js reference identical regardless of which page it's on).
function pageFileName(page, index) {
  if (index === 0) return 'index.html';
  const slug = String((page && page.slug) || '').toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
  return `${slug || 'page-' + (index + 1)}.html`;
}
function pageHref(page, index) { return pageFileName(page, index); }

module.exports = {
  categories, categoryFor, escapeHtml, navLabelFor, toneSub, hashString, paletteVars,
  renderCtaButton, renderSectionHTML, renderHero, renderPageHeader, renderSiteFooter,
  renderPageBody, renderNavHtml, pageFileName, pageHref, sectionCopyField,
  TEXT_ONLY_HERO_VARIANTS, mapHeroToTextOnlyVariant, effectiveHeroLayout,
};
