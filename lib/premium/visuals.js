'use strict';
// PREMIUM_VISUALS_V4 -- industry-native starter visuals.
//
// A generated site must look COMPLETE before the customer uploads anything. Every important visual slot therefore resolves
// through one priority ladder (customer upload > verified business asset > generated image > STARTER VISUAL > nothing), and the
// starter visual is built here: deterministic inline SVG (zero image-model cost, identical in the live preview and the export).
//
//   INDUSTRY_VISUAL_PROFILE  <- BUSINESS_GROUNDING (family / sub-type / archetype)
//   media type per role      PHOTO | PRODUCT_UI | DIAGRAM | DATA_VISUAL | DEVICE_MOCKUP | ABSTRACT_GRAPHIC | ILLUSTRATION | NONE
//   starter kinds            ui-dashboard, ui-workflow, ui-command, ui-canvas, ui-document, diagram-system, data-chart,
//                            retail-arrangement, hospitality-scene, trades-blueprint, consult-matrix, portfolio-frames, brand-mark
//
// HONESTY: product UI starters are conceptual. Labels come from the customer's own description or generic verbs ("Review",
// "Publish"); there are NO invented numbers, customer names, logos, ratings or metrics -- bars and lines carry no values.
const { wordMatch, deriveGrounding } = require('./grounding');

const MEDIA_TYPES = ['PHOTO', 'PRODUCT_UI', 'ABSTRACT_GRAPHIC', 'DIAGRAM', 'DATA_VISUAL', 'DEVICE_MOCKUP', 'SCREENSHOT_STYLE_VISUAL', 'ILLUSTRATION', 'NONE'];
const DETERMINISTIC = new Set(['PRODUCT_UI', 'DIAGRAM', 'DATA_VISUAL', 'DEVICE_MOCKUP', 'SCREENSHOT_STYLE_VISUAL', 'ABSTRACT_GRAPHIC', 'ILLUSTRATION']);

const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clip = (s, n) => { s = String(s || '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s; };

// ---- profiles -----------------------------------------------------------------------------------------------------------
// role keys: hero, product, editorial, about, gallery, team, service, decorative
const PROFILES = {
  tech: { id: 'tech', label: 'Technology / SaaS', density: 'high', heroVariant: 'product-screenshot', heroVariants: ['product-screenshot'], deterministicFirst: true,
    media: { hero: 'PRODUCT_UI', product: 'PRODUCT_UI', editorial: 'DIAGRAM', about: 'ABSTRACT_GRAPHIC', gallery: 'DIAGRAM', team: 'ABSTRACT_GRAPHIC', service: 'DIAGRAM', decorative: 'ABSTRACT_GRAPHIC' },
    treatment: 'interface-led: layered product UI, workflow and system diagrams, technical grid' },
  retail: { id: 'retail', label: 'Retail', density: 'medium', deterministicFirst: false, heroVariants: ['asymmetric-offset', 'editorial-rail', 'fullbleed-image'], heroVariant: 'asymmetric-offset',
    media: { hero: 'PHOTO', product: 'PHOTO', editorial: 'PHOTO', about: 'PHOTO', gallery: 'PHOTO', team: 'ABSTRACT_GRAPHIC', service: 'PHOTO', decorative: 'ABSTRACT_GRAPHIC' },
    fallbackKind: 'retail-arrangement', treatment: 'product photography, collection imagery, detail shots' },
  hospitality: { id: 'hospitality', label: 'Restaurant / hospitality', density: 'medium', deterministicFirst: false, heroVariants: ['fullbleed-image', 'asymmetric-offset', 'editorial-rail'], heroVariant: 'fullbleed-image',
    media: { hero: 'PHOTO', product: 'PHOTO', editorial: 'PHOTO', about: 'PHOTO', gallery: 'PHOTO', team: 'ABSTRACT_GRAPHIC', service: 'PHOTO', decorative: 'ABSTRACT_GRAPHIC' },
    fallbackKind: 'hospitality-scene', treatment: 'food, atmosphere and the space' },
  trades: { id: 'trades', label: 'Trades / local service', density: 'medium', deterministicFirst: false, heroVariants: ['split', 'stacked-image-below', 'fullbleed-image', 'asymmetric-offset'], heroVariant: 'split',
    media: { hero: 'PHOTO', product: 'PHOTO', editorial: 'PHOTO', about: 'PHOTO', gallery: 'PHOTO', team: 'ABSTRACT_GRAPHIC', service: 'PHOTO', decorative: 'ABSTRACT_GRAPHIC' },
    fallbackKind: 'trades-blueprint', treatment: 'project work, materials, finished results' },
  consultancy: { id: 'consultancy', label: 'Consultancy / professional', density: 'low', deterministicFirst: false, heroVariants: ['editorial-rail', 'poster', 'asymmetric-offset', 'split'], heroVariant: 'editorial-rail',
    media: { hero: 'PHOTO', product: 'DIAGRAM', editorial: 'DIAGRAM', about: 'ABSTRACT_GRAPHIC', gallery: 'DIAGRAM', team: 'ABSTRACT_GRAPHIC', service: 'DIAGRAM', decorative: 'ABSTRACT_GRAPHIC' },
    fallbackKind: 'consult-matrix', treatment: 'editorial typography, diagrams, restrained imagery' },
  consultancy_personal: { id: 'consultancy_personal', label: 'Personal-brand consultant / coach', density: 'low', deterministicFirst: false, photoLed: true, heroVariants: ['editorial-rail', 'asymmetric-offset', 'fullbleed-image'], heroVariant: 'editorial-rail',
    media: { hero: 'PHOTO', product: 'PHOTO', editorial: 'PHOTO', about: 'PHOTO', gallery: 'PHOTO', team: 'ABSTRACT_GRAPHIC', service: 'PHOTO', decorative: 'ABSTRACT_GRAPHIC' },
    fallbackKind: 'consult-matrix', treatment: 'editorial portraiture-free photography: workspace, materials, place, detail' },
  portfolio: { id: 'portfolio', label: 'Portfolio / creative', density: 'low', deterministicFirst: false, heroVariants: ['collage', 'fullbleed-image', 'editorial-rail', 'asymmetric-offset'], heroVariant: 'collage',
    media: { hero: 'PHOTO', product: 'PHOTO', editorial: 'PHOTO', about: 'PHOTO', gallery: 'PHOTO', team: 'ABSTRACT_GRAPHIC', service: 'PHOTO', decorative: 'ABSTRACT_GRAPHIC' },
    fallbackKind: 'portfolio-frames', treatment: 'image-dominant, project-first, minimal chrome' },
  wellness: { id: 'wellness', label: 'Wellness / yoga / recovery', density: 'low', deterministicFirst: false, photoLed: true, heroVariants: ['fullbleed-image', 'editorial-rail', 'asymmetric-offset'], heroVariant: 'fullbleed-image',
    media: { hero: 'PHOTO', product: 'PHOTO', editorial: 'PHOTO', about: 'PHOTO', gallery: 'PHOTO', team: 'ABSTRACT_GRAPHIC', service: 'PHOTO', decorative: 'ABSTRACT_GRAPHIC' },
    fallbackKind: 'wellness-scene', treatment: 'calm editorial photography: studio, movement, recovery, atmosphere' },
  cause: { id: 'cause', label: 'Nonprofit / cause', density: 'medium', deterministicFirst: false, heroVariants: ['fullbleed-image', 'collage', 'stacked-image-below', 'split'], heroVariant: 'fullbleed-image',
    media: { hero: 'PHOTO', product: 'PHOTO', editorial: 'PHOTO', about: 'PHOTO', gallery: 'PHOTO', team: 'ABSTRACT_GRAPHIC', service: 'PHOTO', decorative: 'ABSTRACT_GRAPHIC' },
    fallbackKind: 'brand-mark', treatment: 'human, place and impact imagery' },
  general: { id: 'general', label: 'General', density: 'medium', deterministicFirst: false,
    media: { hero: 'PHOTO', product: 'PHOTO', editorial: 'PHOTO', about: 'ABSTRACT_GRAPHIC', gallery: 'PHOTO', team: 'ABSTRACT_GRAPHIC', service: 'PHOTO', decorative: 'ABSTRACT_GRAPHIC' },
    fallbackKind: 'brand-mark', treatment: 'clean brand imagery' },
};
const FAMILY_PROFILE = { wellness: 'wellness', saas: 'tech', retail: 'retail', hospitality: 'hospitality', local_service: 'trades', appointments: 'trades', professional: 'consultancy', creative: 'portfolio', nonprofit: 'cause' };

// ---- product concept (what to draw for a software product) -----------------------------------------------------------------
// Detected from the customer's words only. Labels are generic verbs / the customer's own nouns; never data.
const CONCEPTS = [
  { kind: 'ui-dashboard', re: /\b(analytics?|dashboards?|metrics?|reporting|insights?|monitor(ing)?|no[- ]shows?|scheduling|booking|crm|finance|accounting|inventory)\b/i, steps: ['Overview', 'Activity', 'Trends', 'Reports'], panels: ['Overview', 'Activity', 'Team'] },
  { kind: 'ui-document', re: /\b(documents?|contracts?|invoices?|pdfs?|paperwork|forms?|extract(ion)?|ocr|receipts?)\b/i, steps: ['Upload', 'Extract', 'Review', 'Export'], panels: ['Document', 'Fields', 'Review'] },
  { kind: 'ui-canvas', re: /\b(creative|design(ers?)?|canvas|video|photo|music|audio|illustration|brand(ing)?|studio|edit(ing|or)?|content creators?)\b/i, steps: ['Brief', 'Create', 'Review', 'Publish'], panels: ['Layers', 'Canvas', 'Export'] },
  { kind: 'ui-workflow', re: /\b(ai|ml|machine learning|agents?|automation|automate|workflows?|pipelines?|models?|copilot|assistant)\b/i, steps: ['Input', 'Understand', 'Review', 'Deliver'], panels: ['Assistant', 'Workflow', 'Output'] },
  { kind: 'diagram-system', re: /\b(api|integrations?|infrastructure|developer|devops|cloud|platform|security|network)\b/i, steps: ['Source', 'Platform', 'Actions', 'Apps'], panels: ['Sources', 'Platform', 'Apps'] },
];
function deriveConcept(text, businessType) {
  const t = String(text || '') + ' ' + String(businessType || '');
  for (const c of CONCEPTS) if (c.re.test(t)) return { kind: c.kind, steps: c.steps.slice(), panels: c.panels.slice() };
  return { kind: 'ui-dashboard', steps: ['Overview', 'Activity', 'Trends', 'Reports'], panels: ['Overview', 'Activity', 'Team'] };
}
// "kind|s1|s2|s3|s4" (<=200 chars): the ONE flat string persisted under design.premium.vb when a model refined the labels.
function encodeBrief(b) { return [b.kind].concat(b.steps || []).map(x => clip(x, 22).replace(/\|/g, ' ')).join('|').slice(0, 200); }
function decodeBrief(str, base) {
  const parts = String(str || '').split('|').map(x => x.trim()).filter(Boolean); if (parts.length < 4) return base;
  const kinds = CONCEPTS.map(c => c.kind);
  const kind = kinds.includes(parts[0]) ? parts[0] : base.kind;
  return { kind, steps: parts.slice(1, 5).map(x => clip(x, 22)), panels: base.panels };
}
const BRIEF_TOOL = {
  name: 'submit_visual_brief', description: 'Describe the starter product visual for a software website. Conceptual only: NO numbers, NO customer names, NO metrics, NO logos.',
  input_schema: { type: 'object', additionalProperties: false, required: ['kind', 'steps'], properties: {
    kind: { type: 'string', enum: CONCEPTS.map(c => c.kind) },
    steps: { type: 'array', minItems: 4, maxItems: 4, items: { type: 'string', maxLength: 22, description: 'One or two words, Title Case, generic verb or noun from THIS product\'s workflow' } } } },
};
function validateBrief(input, description) {
  if (!input || !Array.isArray(input.steps) || input.steps.length !== 4) return null;
  const steps = input.steps.map(s => clip(s, 22));
  const bad = steps.some(s => !s || /\d/.test(s) || /\b(inc|llc|ltd|acme|corp|verified|\$|%)\b/i.test(s));
  const kind = CONCEPTS.some(c => c.kind === input.kind) ? input.kind : null;
  if (bad || !kind) return null;
  return { kind, steps, panels: (CONCEPTS.find(c => c.kind === kind) || {}).panels || [] };
}
function buildBriefPrompt(description, g) {
  return { system: 'You design the starter product visual for a software company website. Be concrete about THIS product\'s workflow, using only what the customer wrote. Never invent numbers, names, customers or metrics.',
    user: `Business: ${(g && g.businessType) || 'software'}\nCustomer wrote: "${clip(description, 600)}"\nReturn the kind of interface that best explains the product and the four steps of its workflow as 1-2 word labels.` };
}

// ---- profile / concept for a project ------------------------------------------------------------------------------------------
function profileFromGrounding(g) {
  let id = FAMILY_PROFILE[g && g.family] || 'general';
  // consultants with personal-brand positioning ("I help ...", coach, independent) default to real imagery like any photo-led business
  if (id === 'consultancy' && require('./editorial').isPhotoLed(g, g && g.verifiedFacts && g.verifiedFacts.description)) id = 'consultancy_personal';
  return PROFILES[id];
}
const cache = new WeakMap();
function contextFor(project) {
  const src = (project && project.source) || {};
  const key = [src.text, project && project.business && project.business.categoryKey, project && project.strategy && project.strategy.archetype, project && project.design && project.design.premium && project.design.premium.vb].join('\u0001');
  const hit = cache.get(project); if (hit && hit.key === key) return hit.v;
  let g = null; try { g = deriveGrounding({ description: src.text, categoryKey: project.business && project.business.categoryKey, archetype: project.strategy && project.strategy.archetype, location: src.location, facts: src.facts }); } catch (e) { g = null; }
  const profile = profileFromGrounding(g);
  let concept = deriveConcept(src.text, g && g.businessType);
  concept = decodeBrief(project && project.design && project.design.premium && project.design.premium.vb, concept);
  const v = { g, profile, concept, name: (project && project.business && project.business.name) || '' };
  cache.set(project, { key, v }); return v;
}
function mediaTypeFor(profile, role) { return (profile && profile.media[role]) || 'PHOTO'; }
function enabled(project) { return !!(project && project.design && project.design.premium && project.design.premium.vs); }

// ---- SVG builders -------------------------------------------------------------------------------------------------------------
// Colours come from the site's own CSS variables through classes (styles.css: .sv-*), so light/dark/brand palettes all work.
const W = 640, H = 400;
let U = ''; // unique suffix per rendered visual so gradient ids never collide (or vanish inside a hidden page)
const svg = (body, vb, label) => `<svg class="starter-svg" viewBox="${vb || `0 0 ${W} ${H}`}" preserveAspectRatio="xMidYMid slice" role="img" aria-label="${esc(label || 'Illustration')}" xmlns="http://www.w3.org/2000/svg">${body}</svg>`;
const r = (x, y, w, h, c, rx) => `<rect class="${c}" x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx == null ? 6 : rx}"/>`;
const line = (x1, y1, x2, y2, c) => `<line class="${c || 'sv-line'}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`;
const text = (x, y, s, c, anchor) => `<text class="${c || 'sv-label'}" x="${x}" y="${y}" text-anchor="${anchor || 'start'}">${esc(s)}</text>`;
const dots = (n, x, y, gap) => Array.from({ length: n }, (_, i) => `<circle class="sv-dot${i === 0 ? '' : '-dim'}" cx="${x + i * gap}" cy="${y}" r="3.5"/>`).join('');
const grid = () => { let s = ''; for (let x = 0; x <= W; x += 40) s += line(x, 0, x, H, 'sv-grid'); for (let y = 0; y <= H; y += 40) s += line(0, y, W, y, 'sv-grid'); return s; };
const glow = () => `<defs><radialGradient id="svg-a${U}" cx="30%" cy="20%" r="70%"><stop offset="0" class="sv-stop-a"/><stop offset="1" class="sv-stop-0"/></radialGradient><radialGradient id="svg-b${U}" cx="85%" cy="90%" r="60%"><stop offset="0" class="sv-stop-b"/><stop offset="1" class="sv-stop-0"/></radialGradient></defs><rect class="sv-bg" width="${W}" height="${H}"/><rect fill="url(#svg-a${U})" width="${W}" height="${H}"/><rect fill="url(#svg-b${U})" width="${W}" height="${H}"/>`;
const win = (x, y, w, h, title) => r(x, y, w, h, 'sv-panel', 12) + r(x, y, w, 26, 'sv-panel-top', 12) + `<circle class="sv-dot" cx="${x + 16}" cy="${y + 13}" r="3.5"/><circle class="sv-dot-dim" cx="${x + 30}" cy="${y + 13}" r="3.5"/><circle class="sv-dot-dim" cx="${x + 44}" cy="${y + 13}" r="3.5"/>` + (title ? text(x + 62, y + 17, title, 'sv-label-sm') : '');
// deterministic pseudo-variation from a string so two different sites do not draw the identical chart
const seedOf = s => { let h = 2166136261; for (const ch of String(s || 'x')) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
const rnd = seed => { let s = seed || 1; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; };

function uiDashboard(c, seed) {
  const R = rnd(seed); const bars = Array.from({ length: 12 }, () => 0.25 + R() * 0.7);
  let path = ''; bars.forEach((v, i) => { path += (i ? ' L' : 'M') + (250 + i * 30) + ' ' + (250 - v * 90).toFixed(1); });
  return svg(glow() + grid().replace(/class="sv-grid"/g, 'class="sv-grid" opacity=".5"') + win(28, 26, 584, 348, c.panels[0]) +
    r(28, 52, 118, 322, 'sv-side', 0) + [0, 1, 2, 3, 4].map(i => r(44, 70 + i * 34, i === 0 ? 86 : 70, 12, i === 0 ? 'sv-accent' : 'sv-bar-dim', 6)).join('') +
    [0, 1, 2].map(i => r(164 + i * 148, 68, 136, 62, 'sv-card', 10) + text(176 + i * 148, 90, (c.panels[i] || c.steps[i] || 'Overview'), 'sv-label-sm') + r(176 + i * 148, 102, 56 + (i * 17) % 40, 10, i === 0 ? 'sv-accent' : 'sv-bar', 5) + r(176 + i * 148, 116, 90, 6, 'sv-bar-dim', 3)).join('') +
    r(164, 146, 436, 122, 'sv-card', 10) + text(178, 168, c.steps[1] || 'Activity', 'sv-label-sm') +
    bars.map((v, i) => r(250 + i * 30 - 8, 250 - v * 90, 16, v * 90, i % 3 === 1 ? 'sv-accent' : 'sv-bar', 4)).join('') + `<path class="sv-path" d="${path}" fill="none"/>` +
    [0, 1, 2].map(i => r(164, 282 + i * 26, 436, 20, 'sv-row', 6) + r(176, 289 + i * 26, 90 + i * 22, 6, 'sv-bar', 3) + r(520, 289 + i * 26, 60, 6, i === 0 ? 'sv-accent' : 'sv-bar-dim', 3)).join(''), null, 'Dashboard concept');
}
function uiWorkflow(c) {
  const X0 = 62, NW = 100, GAP = 44, y = 196; const steps = c.steps;
  let s = glow() + grid().replace(/class="sv-grid"/g, 'class="sv-grid" opacity=".5"') + win(28, 26, 584, 348, 'Workflow');
  for (let i = 0; i < 3; i++) { const x1 = X0 + i * (NW + GAP) + NW, x2 = x1 + GAP; s += `<path class="sv-path" d="M${x1} ${y} C ${x1 + 18} ${y}, ${x2 - 18} ${y + (i % 2 ? -30 : 30)}, ${x2} ${y}" fill="none"/>`; }
  steps.forEach((label, i) => { const x = X0 + i * (NW + GAP); s += r(x, y - 44, NW, 88, i === 1 ? 'sv-card-hi' : 'sv-card', 14) + `<circle class="${i === 1 ? 'sv-accent' : 'sv-dot-dim'}" cx="${x + 16}" cy="${y - 26}" r="6"/>` + text(x + NW / 2, y - 18, '0' + (i + 1), 'sv-label-sm', 'middle') + text(x + NW / 2, y + 8, label, 'sv-label', 'middle') + r(x + 16, y + 22, NW - 32, 6, 'sv-bar-dim', 3); });
  s += r(62, 292, 516, 46, 'sv-card', 12) + text(82, 320, 'Ask or describe what you need…', 'sv-label-sm') + r(520, 304, 44, 22, 'sv-accent', 11);
  return svg(s, null, 'Workflow concept');
}
function uiCommand(c) {
  return svg(glow() + win(80, 44, 480, 312, 'Search') + r(104, 84, 432, 40, 'sv-card-hi', 10) + text(122, 109, 'Ask or search…', 'sv-label') + r(492, 94, 32, 20, 'sv-accent', 6) +
    c.steps.map((st, i) => r(104, 140 + i * 50, 432, 40, i === 0 ? 'sv-card-hi' : 'sv-card', 10) + `<circle class="${i === 0 ? 'sv-accent' : 'sv-dot-dim'}" cx="128" cy="${160 + i * 50}" r="8"/>` + text(150, 165 + i * 50, st, 'sv-label') + r(400, 156 + i * 50, 110, 8, 'sv-bar-dim', 4)).join(''), null, 'Command interface concept');
}
function uiCanvas(c) {
  return svg(glow() + win(28, 26, 584, 348, 'Canvas') + r(28, 52, 44, 322, 'sv-side', 0) + [0, 1, 2, 3].map(i => `<circle class="${i === 1 ? 'sv-accent' : 'sv-dot-dim'}" cx="50" cy="${80 + i * 40}" r="9"/>`).join('') +
    r(96, 74, 330, 280, 'sv-card', 8) + r(124, 100, 170, 120, 'sv-accent', 10) + r(310, 100, 92, 56, 'sv-bar', 8) + r(310, 168, 92, 52, 'sv-card-hi', 8) + r(124, 240, 278, 10, 'sv-bar', 5) + r(124, 262, 200, 8, 'sv-bar-dim', 4) + r(124, 300, 90, 30, 'sv-card-hi', 15) +
    r(444, 74, 156, 280, 'sv-side', 8) + text(458, 98, c.panels[0] || 'Layers', 'sv-label-sm') + [0, 1, 2, 3, 4].map(i => r(458, 114 + i * 36, 128, 26, i === 1 ? 'sv-card-hi' : 'sv-card', 6) + r(468, 124 + i * 36, 60 + (i * 13) % 30, 6, 'sv-bar', 3)).join(''), null, 'Creative canvas concept');
}
function uiDocument(c) {
  return svg(glow() + win(28, 26, 584, 348, 'Review') + r(52, 68, 200, 282, 'sv-card', 8) + [0, 1, 2, 3, 4, 5, 6, 7].map(i => r(70, 92 + i * 30, i % 3 === 2 ? 120 : 164, 8, i === 2 || i === 5 ? 'sv-accent' : 'sv-bar-dim', 4)).join('') +
    `<path class="sv-path" d="M262 208 L318 208" fill="none"/><path class="sv-path" d="M310 198 L322 208 L310 218" fill="none"/>` +
    r(332, 68, 256, 282, 'sv-card', 8) + text(348, 94, c.panels[1] || 'Fields', 'sv-label-sm') + [0, 1, 2, 3, 4].map(i => r(348, 108 + i * 46, 224, 34, 'sv-row', 8) + r(360, 120 + i * 46, 70, 6, 'sv-bar-dim', 3) + r(360, 130 + i * 46, 120 + (i * 17) % 60, 8, i === 2 ? 'sv-accent' : 'sv-bar', 4)).join(''), null, 'Document workflow concept');
}
function diagramSystem(c) {
  const cx = 320, cy = 200; const nodes = [[110, 90], [110, 200], [110, 310], [530, 90], [530, 200], [530, 310]];
  let s = glow() + grid().replace(/class="sv-grid"/g, 'class="sv-grid" opacity=".45"');
  nodes.forEach(([x, y], i) => { s += `<path class="sv-path" d="M${x + (x < cx ? 46 : -46)} ${y} C ${(x + cx) / 2} ${y}, ${(x + cx) / 2} ${cy}, ${cx + (x < cx ? -62 : 62)} ${cy}" fill="none"/>` + r(x - 46, y - 20, 92, 40, 'sv-card', 10) + `<circle class="sv-dot${i % 2 ? '-dim' : ''}" cx="${x - 30}" cy="${y}" r="5"/>` + r(x - 16, y - 4, 50, 8, 'sv-bar-dim', 4); });
  s += r(cx - 62, cy - 52, 124, 104, 'sv-card-hi', 18) + `<circle class="sv-accent" cx="${cx}" cy="${cy - 8}" r="18"/>` + text(cx, cy + 34, c.steps[1] || 'Platform', 'sv-label', 'middle');
  return svg(s, null, 'System diagram concept');
}
function dataChart(c, seed) {
  const R = rnd(seed); const pts = Array.from({ length: 10 }, (_, i) => [60 + i * 60, 300 - (0.2 + R() * 0.6) * 200 - i * 4]);
  return svg(glow() + grid().replace(/class="sv-grid"/g, 'class="sv-grid" opacity=".5"') + `<path class="sv-area" d="M${pts.map(p => p.join(' ')).join(' L')} L${pts[pts.length - 1][0]} 340 L60 340 Z"/>` + `<path class="sv-path" d="M${pts.map(p => p.join(' ')).join(' L')}" fill="none"/>` + pts.map(p => `<circle class="sv-dot" cx="${p[0]}" cy="${p[1].toFixed(1)}" r="4"/>`).join('') + text(60, 44, c.steps[2] || 'Trends', 'sv-label'), null, 'Data visual concept');
}
// Layered hero composition for interface-led businesses: a dimmed back window, a lifted front window carrying the product concept, floating step chips.
function miniContent(kind, c, x, y, w, h, seed) {
  const R2 = rnd(seed); let o = '';
  if (kind === 'ui-workflow' || kind === 'ui-command' || kind === 'diagram-system') {
    const n = 4, nw = 74, gap = (w - 32 - n * nw) / (n - 1);
    for (let i = 0; i < n; i++) { const nx = x + 16 + i * (nw + gap), ny = y + h / 2 - 30; if (i) o += `<path class="sv-path" d="M${nx - gap} ${ny + 30} C ${nx - gap / 2} ${ny + 30}, ${nx - gap / 2} ${ny + (i % 2 ? 14 : 46)}, ${nx} ${ny + 30}" fill="none"/>`; o += r(nx, ny, nw, 60, i === 1 ? 'sv-card-hi' : 'sv-card', 10) + text(nx + nw / 2, ny + 26, c.steps[i] || '', 'sv-label-sm', 'middle') + r(nx + 12, ny + 38, nw - 24, 6, 'sv-bar-dim', 3); }
    o += r(x + 16, y + h - 46, w - 32, 30, 'sv-card', 8) + text(x + 30, y + h - 26, 'Describe what you need…', 'sv-label-sm') + r(x + w - 60, y + h - 39, 32, 16, 'sv-accent', 8);
  } else if (kind === 'ui-canvas' || kind === 'ui-document') {
    o += r(x + 16, y + 14, w * 0.58, h - 28, 'sv-card', 8) + r(x + 32, y + 30, w * 0.34, h * 0.4, 'sv-accent', 8) + r(x + 32 + w * 0.36, y + 30, w * 0.16, h * 0.18, 'sv-bar', 6) + r(x + 32, y + 40 + h * 0.4, w * 0.5, 8, 'sv-bar', 4) + r(x + 32, y + 58 + h * 0.4, w * 0.36, 6, 'sv-bar-dim', 3);
    for (let i = 0; i < 4; i++) o += r(x + w * 0.62 + 16, y + 14 + i * 34, w * 0.34 - 16, 26, i === 1 ? 'sv-card-hi' : 'sv-card', 6);
  } else {
    const bars = Array.from({ length: 10 }, () => 0.3 + R2() * 0.65); let p = '';
    bars.forEach((v, i) => { o += r(x + 24 + i * (w - 48) / 10, y + h - 30 - v * (h - 90), 14, v * (h - 90), i % 3 === 1 ? 'sv-accent' : 'sv-bar', 4); p += (i ? ' L' : 'M') + (x + 31 + i * (w - 48) / 10) + ' ' + (y + h - 30 - v * (h - 90)).toFixed(1); });
    o += `<path class="sv-path" d="${p}" fill="none"/>` + [0, 1, 2].map(i => r(x + 24 + i * ((w - 64) / 3 + 8), y + 14, (w - 64) / 3, 44, 'sv-card', 8) + r(x + 36 + i * ((w - 64) / 3 + 8), y + 26, 44, 8, i === 0 ? 'sv-accent' : 'sv-bar', 4)).join('');
  }
  return o;
}
function uiStack(c, seed) {
  const back = c.kind === 'ui-dashboard' ? 'ui-workflow' : 'ui-dashboard';
  return svg(glow() + grid().replace(/class="sv-grid"/g, 'class="sv-grid" opacity=".4"') +
    '<g style="opacity:.6">' + win(18, 20, 400, 240, c.panels[0]) + miniContent(back, c, 30, 50, 376, 200, seed + 7) + '</g>' +
    '<g class="sv-lift">' + win(120, 88, 500, 288, c.steps[1] || c.panels[1]) + miniContent(c.kind, c, 128, 116, 484, 250, seed) + '</g>' +
    '<g class="sv-lift">' + r(36, 300, 132, 40, 'sv-card-hi', 20) + `<circle class="sv-accent" cx="58" cy="320" r="7"/>` + text(74, 325, c.steps[0] || 'Start', 'sv-label-sm') + '</g>' +
    '<g class="sv-lift">' + r(470, 40, 138, 40, 'sv-card-hi', 20) + `<circle class="sv-dot" cx="492" cy="60" r="7"/>` + text(508, 65, c.steps[3] || 'Done', 'sv-label-sm') + '</g>', null, 'Layered product interface concept');
}
// Non-technology starters: intentional graphic compositions, never an empty box.
function retailArrangement(seed) {
  return svg(`<defs><linearGradient id="svg-p${U}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="sv-stop-b"/><stop offset="1" class="sv-stop-0"/></linearGradient></defs><rect class="sv-bg" width="${W}" height="${H}"/><ellipse class="sv-soft" cx="320" cy="330" rx="260" ry="34"/>` +
    `<rect class="sv-panel" x="200" y="130" width="74" height="190" rx="14"/><rect class="sv-accent" x="222" y="96" width="30" height="42" rx="6"/><rect class="sv-card-hi" x="212" y="180" width="50" height="60" rx="6"/>` +
    `<rect class="sv-card-hi" x="300" y="200" width="120" height="120" rx="20"/><rect class="sv-accent" x="296" y="180" width="128" height="34" rx="10"/><rect class="sv-bar-dim" x="322" y="250" width="76" height="8" rx="4"/>` +
    `<path class="sv-panel" d="M448 320 L470 130 Q472 116 486 116 L500 116 Q514 116 516 130 L538 320 Z"/><rect class="sv-accent" x="466" y="92" width="38" height="28" rx="6"/><rect class="sv-bar-dim" x="474" y="220" width="22" height="8" rx="4"/>` +
    `<circle class="sv-dot-dim" cx="120" cy="300" r="26"/><circle class="sv-accent" cx="150" cy="282" r="10"/>`, null, 'Product arrangement');
}
function hospitalityScene() {
  return svg(`<rect class="sv-bg" width="${W}" height="${H}"/><defs><radialGradient id="svg-w${U}" cx="50%" cy="45%" r="55%"><stop offset="0" class="sv-stop-a"/><stop offset="1" class="sv-stop-0"/></radialGradient></defs><rect fill="url(#svg-w${U})" width="${W}" height="${H}"/>` +
    `<ellipse class="sv-panel" cx="320" cy="230" rx="170" ry="120"/><ellipse class="sv-card-hi" cx="320" cy="230" rx="128" ry="88"/><ellipse class="sv-accent" cx="320" cy="230" rx="52" ry="34"/>` +
    `<rect class="sv-bar" x="96" y="120" width="8" height="220" rx="4"/><rect class="sv-bar" x="538" y="120" width="8" height="220" rx="4"/><circle class="sv-accent" cx="100" cy="106" r="16"/><circle class="sv-accent" cx="542" cy="106" r="16"/>`, null, 'Table setting');
}
function tradesBlueprint() {
  return svg(`<rect class="sv-bg" width="${W}" height="${H}"/>` + grid() + `<path class="sv-path" d="M120 300 L120 190 L320 90 L520 190 L520 300 Z" fill="none"/><path class="sv-path" d="M120 190 L520 190" fill="none"/><rect class="sv-accent" x="290" y="220" width="60" height="80" rx="4"/>` +
    line(120, 330, 520, 330) + line(120, 322, 120, 338) + line(520, 322, 520, 338) + line(560, 90, 560, 300) + line(552, 90, 568, 90) + line(552, 300, 568, 300), null, 'Project plan');
}
function consultMatrix() {
  return svg(glow() + [0, 1, 2].map(i => r(70 + i * 190, 80, 170, 240, i === 1 ? 'sv-card-hi' : 'sv-card', 12) + `<circle class="${i === 1 ? 'sv-accent' : 'sv-dot-dim'}" cx="${100 + i * 190}" cy="116" r="10"/>` + [0, 1, 2, 3].map(j => r(92 + i * 190, 150 + j * 36, 120 - j * 14, 8, j === 0 ? 'sv-bar' : 'sv-bar-dim', 4)).join('')).join('') + `<path class="sv-path" d="M240 200 L260 200 M430 200 L450 200" fill="none"/>`, null, 'Approach diagram');
}
function portfolioFrames() {
  return svg(`<rect class="sv-bg" width="${W}" height="${H}"/>` + r(70, 60, 250, 190, 'sv-card', 6) + r(90, 80, 210, 150, 'sv-accent', 4) + r(300, 130, 250, 190, 'sv-card-hi', 6) + r(320, 150, 210, 150, 'sv-bar', 4) + r(190, 240, 150, 110, 'sv-panel', 6) + r(206, 256, 118, 78, 'sv-bar-dim', 4), null, 'Selected work');
}
function wellnessScene() {
  return svg(`<defs><radialGradient id="svg-w${U}" cx="50%" cy="55%" r="60%"><stop offset="0" class="sv-stop-a"/><stop offset="1" class="sv-stop-0"/></radialGradient></defs><rect class="sv-bg" width="${W}" height="${H}"/><rect fill="url(#svg-w${U})" width="${W}" height="${H}"/>` +
    `<circle class="sv-soft" cx="320" cy="170" r="110"/><path class="sv-path" d="M60 300 Q 200 250 320 300 T 580 300" fill="none"/><path class="sv-line" d="M40 330 Q 200 290 320 330 T 600 330" fill="none"/>` +
    `<ellipse class="sv-panel" cx="320" cy="262" rx="88" ry="20"/><ellipse class="sv-card-hi" cx="320" cy="238" rx="66" ry="17"/><ellipse class="sv-accent" cx="320" cy="217" rx="42" ry="13"/>`, null, 'Calm studio still life');
}
function brandMark(name) {
  const ch = (String(name || '').trim()[0] || 'S').toUpperCase();
  return svg(glow() + `<circle class="sv-soft" cx="320" cy="200" r="150"/><circle class="sv-panel" cx="320" cy="200" r="104"/><circle class="sv-accent" cx="320" cy="200" r="64"/>` + text(320, 224, ch, 'sv-mono', 'middle'), null, 'Brand mark');
}

const KIND_BUILDERS = {
  'wellness-scene': () => wellnessScene(),
  'ui-stack': (c, s) => uiStack(c, s),
  'ui-dashboard': (c, s) => uiDashboard(c, s), 'ui-workflow': c => uiWorkflow(c), 'ui-command': c => uiCommand(c), 'ui-canvas': c => uiCanvas(c),
  'ui-document': c => uiDocument(c), 'diagram-system': c => diagramSystem(c), 'data-chart': (c, s) => dataChart(c, s),
  'retail-arrangement': (c, s) => retailArrangement(s), 'hospitality-scene': () => hospitalityScene(), 'trades-blueprint': () => tradesBlueprint(),
  'consult-matrix': () => consultMatrix(), 'portfolio-frames': () => portfolioFrames(), 'brand-mark': (c, s, n) => brandMark(n),
};
const STARTER_KINDS = Object.keys(KIND_BUILDERS);

// Which starter kind fills a slot. Technology alternates product UI / diagram / chart so pages don't repeat one picture.
function starterKindFor(ctx, role, slot) {
  const p = ctx.profile; const mt = mediaTypeFor(p, role);
  if (p.id === 'tech') {
    if (role === 'hero') return 'ui-stack';
    if (role === 'product') return ctx.concept.kind === 'ui-workflow' ? 'ui-command' : (ctx.concept.kind === 'ui-dashboard' ? 'ui-workflow' : 'ui-dashboard');
    if (role === 'about' || role === 'team') return 'brand-mark';
    const pool = ['diagram-system', 'data-chart', 'ui-command'];
    return pool[seedOf(slot) % pool.length];
  }
  if (role === 'team' || role === 'about' && mt === 'ABSTRACT_GRAPHIC') return 'brand-mark';
  if (mt === 'DIAGRAM' || mt === 'DATA_VISUAL') return p.id === 'consultancy' ? 'consult-matrix' : 'data-chart';
  return p.fallbackKind || 'brand-mark';
}
// slot -> role, mirroring image-planning's classifySlot by slot name (renderers only know the slot id)
function roleOfSlot(slot) {
  const s = String(slot || '');
  if (s === 'hero' || s === 'collage-2') return 'hero';
  if (/product/.test(s)) return 'product';
  if (/team|about/.test(s)) return /about/.test(s) && !/team-/.test(s) ? 'about' : 'team';
  if (/::feature$/.test(s)) return 'editorial';
  if (/gallery|case/.test(s)) return 'gallery';
  if (/editorial/.test(s)) return 'editorial';
  return 'decorative';
}
// Interface-led sites: the "what it does" cards explain the product's WORKFLOW (the same four steps the starter visual draws) instead of
// repeating category filler such as "Product / Pricing / Docs". Neutral how-it-works statements only -- no feature, price or proof claims.
const STEP_BODIES = {
  'ui-workflow': ['Describe what you need in your own words.', 'The software works through it step by step.', 'You check the result and adjust it.', 'Then it goes where it is needed.'],
  'ui-dashboard': ['See where things stand at a glance.', 'Follow what changed and when.', 'Spot patterns as they build up.', 'Keep the whole team looking at the same picture.'],
  'ui-document': ['Bring in the documents you already have.', 'Pull out the details that matter.', 'Confirm what was found.', 'Send clean results onward.'],
  'ui-canvas': ['Start from a clear brief.', 'Build and iterate in one workspace.', 'Review the work together.', 'Publish when it is ready.'],
  'ui-command': ['Ask or search in plain language.', 'Get to the right place quickly.', 'Review what comes back.', 'Act on it.'],
  'diagram-system': ['Start from the tools you already use.', 'Bring everything through one platform.', 'Decide what happens next.', 'Deliver to the apps that need it.'],
};
function featureItemsFor(project) {
  if (!enabled(project)) return null;
  try {
    const ctx = contextFor(project); if (ctx.profile.id !== 'tech') return null;
    const bodies = STEP_BODIES[ctx.concept.kind] || STEP_BODIES['ui-workflow'];
    return ctx.concept.steps.slice(0, 4).map((label, i) => ({ label, body: bodies[i] }));
  } catch (e) { return null; }
}

// HTML for one starter visual (or null when V4 is off for this project).
function starterHtml(project, slot, opts) {
  if (!enabled(project)) return null;
  try {
    U = '-' + seedOf(String(slot) + (project.business && project.business.name)).toString(36);
    const ctx = contextFor(project); const role = roleOfSlot(slot); const kind = starterKindFor(ctx, role, slot);
    const inner = KIND_BUILDERS[kind](ctx.concept, seedOf(String(ctx.name) + slot), ctx.name);
    const mt = mediaTypeFor(ctx.profile, role);
    return `<div class="visual-generated visual-starter" data-starter="${kind}" data-media="${DETERMINISTIC.has(mt) ? mt : 'GRAPHIC_FALLBACK'}" data-role="${esc(slot)}" data-funded="true">${inner}</div>`;
  } catch (e) { return null; }
}

// ---- V4 deterministic checks (FIRST_DRAFT_COMPLETENESS + visual critique categories) ----------------------------------------------
// keep the site's own hero when it belongs to the industry's hero family; otherwise use the family's default
function chooseHero(profile, current) { if (!profile || !profile.heroVariants) return current; if (current === 'demo' || profile.heroVariants.includes(current)) return current; return profile.heroVariant; }
const TEXT_ONLY_HEROES = ['centered-oversized', 'minimal-text-only', 'poster'];
const PLACEHOLDER_TEXT = /(lorem ipsum|placeholder|your (image|photo|logo|picture) here|upload (your|a|an) (image|photo|logo|picture)|add (an? )?(image|photo)|image (goes|coming) here|coming soon|\bTBD\b|\[[^\]]{2,30}\])/i;
// photo-led business types (generated photography is the default; starter graphics are only the failure fallback)
for (const k of ['retail', 'hospitality', 'trades', 'portfolio', 'cause']) PROFILES[k].photoLed = true;
const VISUAL_SLOT_ROLES = new Set(['hero', 'product', 'editorial', 'about']);
function walkStrings(direction, fn) {
  const c = direction.copy || {}; Object.keys(c).forEach(k => { if (typeof c[k] === 'string') fn('hero.' + k, c[k]); });
  (direction.pages || []).forEach(p => {
    if (typeof p.purpose === 'string') fn(`page:${p.slug || 'home'}.purpose`, p.purpose);
    (p.sections || []).forEach(s => { const cp = s.copy || {}; Object.keys(cp).forEach(k => { if (typeof cp[k] === 'string') fn(`${s.id}.${k}`, cp[k]); }); });
  });
}
function checkVisuals(direction, ctx) {
  const defects = []; const add = d => defects.push(Object.assign({ severity: 2, target: { kind: 'site', id: null }, source: 'deterministic' }, d));
  let vctx; try { vctx = contextFor(direction); } catch (e) { return defects; }
  const prof = vctx.profile; const on = enabled(direction);
  const dims = (direction.design && direction.design.dimensions) || {}; const heroVariant = dims.heroDisplayVariant || dims.hero;
  const plan = direction.imagePlan || []; const pages = direction.pages || [];
  const allSecs = []; pages.forEach(p => (p.sections || []).forEach(s => allSecs.push({ p, s })));

  // V6: photo-led quality gates (photo set, hero anchor, repeated cards, sparse pages, generic FAQ, instruction text)
  if (ctx && ctx.photoLedV6) { try { const G = require('./grounding'); const g = ctx.grounding || G.deriveGrounding({ description: (direction.source && direction.source.text) || ctx.description, categoryKey: direction.business && direction.business.categoryKey, archetype: direction.strategy && direction.strategy.archetype, location: direction.source && direction.source.location }); require('./editorial').checkPhotoLed(direction, g, (direction.source && direction.source.text) || ctx.description).forEach(d => add(d)); } catch (e) { /* gates are best-effort */ } }
  // hero must not be typography over nothing on an interface-led business
  if (!prof.deterministicFirst && prof.heroVariants && heroVariant !== 'demo' && !prof.heroVariants.includes(heroVariant)) add({ category: 'HERO_VISUAL_STRENGTH', code: 'hero_family_mismatch', severity: TEXT_ONLY_HEROES.includes(heroVariant) ? 3 : 2, detail: `${prof.label} hero is ${heroVariant}; ${prof.heroVariants.join(' / ')} fit the industry`, target: { kind: 'hero', id: 'hero' }, repair: { kind: 'set_hero_variant', value: prof.heroVariant } });
  if (prof.deterministicFirst && TEXT_ONLY_HEROES.includes(heroVariant)) add({ category: 'HERO_VISUAL_STRENGTH', code: 'hero_has_no_product_visual', severity: 3, detail: `${prof.label} hero is ${heroVariant} (no product visual)`, target: { kind: 'hero', id: 'hero' }, repair: { kind: 'set_hero_variant', value: prof.heroVariant } });
  // every important visual slot must resolve to real media, a generated image or a starter visual -- never an empty box
  plan.forEach(e => {
    const role = roleOfSlot(e.slot); if (!VISUAL_SLOT_ROLES.has(role)) return;
    if (e.sourceType === 'designed' && !e.starter && !on) add({ category: 'MEDIA_COMPLETENESS', code: 'empty_visual_slot', severity: 3, detail: `${e.slot} has no media and no starter visual`, target: { kind: 'image', id: e.slot }, repair: { kind: 'enable_starter' } });
  });
  if (prof.deterministicFirst) {
    plan.forEach(e => { if (e.sourceType === 'generated' && (e.kind === 'photo') && (e.role === 'hero' || e.role === 'product')) add({ category: 'INDUSTRY_VISUAL_FIT', code: 'photo_for_interface_business', severity: 1, detail: `${e.slot}: photography on a ${prof.label} site (product UI/diagram fits better)`, target: { kind: 'image', id: e.slot } }); });
    if (!allSecs.some(x => x.s.type === 'productShowcase' || x.s.type === 'imageLedEditorial' || x.s.type === 'editorialFeature') && (TEXT_ONLY_HEROES.includes(heroVariant) || !on)) add({ category: 'PRODUCT_VISUAL_EXPLANATION', code: 'no_product_visual_section', severity: 2, detail: 'no section shows the product visually', target: { kind: 'site', id: null }, repair: { kind: 'add_product_visual' } });
    else if (!allSecs.some(x => x.s.type === 'productShowcase' || x.s.type === 'imageLedEditorial')) add({ category: 'PRODUCT_VISUAL_EXPLANATION', code: 'no_product_visual_section', severity: 2, detail: 'no section explains the product visually', target: { kind: 'site', id: null }, repair: { kind: 'add_product_visual' } });
    const visualCount = (TEXT_ONLY_HEROES.includes(heroVariant) ? 0 : 1) + allSecs.filter(x => ['productShowcase', 'imageLedEditorial', 'gallery', 'integrations'].includes(x.s.type)).length;
    if (visualCount < 2) add({ category: 'VISUAL_DEPTH', code: 'too_few_visual_moments', severity: 1, detail: `${visualCount} visual moment(s) on an interface-led site`, target: { kind: 'site', id: null } });
  }
  // leaked placeholder wording in customer-visible text
  walkStrings(direction, (where, text) => { const m = PLACEHOLDER_TEXT.exec(text); if (m) add({ category: 'PLACEHOLDER_LEAKAGE', code: 'placeholder_text', severity: 3, detail: `${where}: "${m[0]}"`, target: { kind: 'site', id: where } }); });
  // secondary pages that are the same page twice
  const seqs = pages.slice(1).map(p => (p.sections || []).map(s => s.type).join('>')).filter(Boolean);
  if (seqs.length >= 2 && new Set(seqs).size < seqs.length) add({ category: 'PAGE_VISUAL_VARIETY', code: 'repeated_page_composition', severity: 1, detail: 'two secondary pages share one section sequence', target: { kind: 'site', id: null } });
  // completeness roll-up: anything that would make the first output look unfinished
  defects.filter(d => ['MEDIA_COMPLETENESS', 'PLACEHOLDER_LEAKAGE', 'HERO_VISUAL_STRENGTH'].includes(d.category) && d.severity >= 3)
    .forEach(d => add({ category: 'FIRST_DRAFT_COMPLETENESS', code: d.code, severity: 3, detail: d.detail, target: d.target }));
  return defects;
}
const VISUAL_CRITERIA = [
  'HERO_VISUAL_STRENGTH: is the hero a strong, industry-native composition (product UI for software, product for retail, food/space for hospitality), or typography over an empty panel?',
  'INDUSTRY_VISUAL_FIT: does every visual use the visual language of THIS industry (interface/diagram for software, photography for retail/hospitality/trades)?',
  'MEDIA_COMPLETENESS / PLACEHOLDER_LEAKAGE: is any visual area empty, dotted, spinner-like, or expecting the customer to upload something to look finished?',
  'PRODUCT_VISUAL_EXPLANATION: for software, does a visual (UI, workflow, diagram) explain what the product does, instead of repeating text in cards?',
  'VISUAL_DEPTH / PAGE_VISUAL_VARIETY: do pages differ in composition, or are they all heading + cards + footer?',
  'COPY_SPECIFICITY: flag vague product copy ("done right", "everything in one place", "feel effortless"); propose a concrete replacement using only what the customer wrote.',
];
function visualLines(direction) {
  let v; try { v = contextFor(direction); } catch (e) { return []; }
  const dims = (direction.design && direction.design.dimensions) || {};
  const L = [`profile=${v.profile.id} (${v.profile.treatment}); hero layout=${dims.heroDisplayVariant || dims.hero}; concept=${v.concept.kind}`];
  (direction.imagePlan || []).forEach(e => L.push(`slot ${e.slot}: ${e.sourceType}${e.starter ? '/starter(' + (e.mediaType || 'graphic') + ')' : ''}`));
  return L;
}

// one starter kind rendered on demand (used by the QA contact sheet and tests)
function renderKind(kind, project, slot) { const ctx = contextFor(project); return `<div class="visual-generated visual-starter" data-starter="${kind}">${KIND_BUILDERS[kind](ctx.concept, seedOf(String(slot || kind)), ctx.name)}</div>`; }
module.exports = { chooseHero, renderKind, featureItemsFor, checkVisuals, VISUAL_CRITERIA, visualLines, MEDIA_TYPES, DETERMINISTIC, PROFILES, FAMILY_PROFILE, CONCEPTS, STARTER_KINDS, BRIEF_TOOL, profileFromGrounding, deriveConcept, encodeBrief, decodeBrief, validateBrief, buildBriefPrompt,
  contextFor, mediaTypeFor, enabled, starterKindFor, roleOfSlot, starterHtml, seedOf };
