'use strict';
// CREATIVE FONTS: the one vocabulary of typefaces a Creative page may use -- the editor's picker, the renderer, validation
// and the export all read this list, and a page stores only these ids (plan.fonts: { headline, body, label, preset }),
// never a font-family string. Two kinds:
//   web     an open-source face (SIL Open Font License 1.1, from Fontsource -- see vendor/creative-fonts/manifest.json): its
//           Latin .woff2 files are vendored at the weights a page uses, a page loads ONLY the faces it uses, and an exported
//           website carries ONLY those files (with the licence beside them). Nothing is loaded from a third party.
//   system  a stack of faces the visitor's own device has. Nothing is downloaded -- in particular no proprietary face is
//           ever shipped: "Apple / System" asks for the device's own San Francisco through -apple-system, on Apple
//           devices only, and falls back to Helvetica Neue / Arial elsewhere.
// Every face carries its measured width (fonts-data.json, made by scripts/vendor-creative-fonts.js from the font files
// themselves): the headline fitting (look.js fitFor / measure) sizes a heading in a chosen face by that face's own
// width, so a narrow, a wide, a heavy or a serif display face fits its column the same way.
// Data only, browser-safe (bundled into creative-core.js).

const DATA = require('./fonts-data.json');

// (kind: the generic family a stack ends with; hw: the weight a headline is set in; lw: an eyebrow/label; caps: a face
// that has only capitals; track / lead: the letter-spacing and line height a headline is set with)
const F = (id, label, kind, extra) => Object.assign({ id, label, kind, source: 'web', hw: 700, lw: 700, track: -0.01, lead: 0.98 }, extra || {});
const S = (id, label, kind, stack, extra) => Object.assign({ id, label, kind, source: 'system', stack, hw: 700, lw: 700, track: -0.01, lead: 0.98 }, extra || {});
const LIST = [
  // ---- system faces (nothing downloaded)
  S('apple-system', 'Apple / System', 'sans-serif', '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Helvetica Neue", Arial, sans-serif', { metrics: { adv: 0.6, upper: 1.25 } }),
  S('avenir-next', 'Avenir Next', 'sans-serif', '"Avenir Next", Avenir, "SR Nunito Sans", "Segoe UI", sans-serif', { fallback: 'nunito-sans', metrics: { adv: 0.62, upper: 1.27 } }),
  S('helvetica', 'Helvetica', 'sans-serif', '"Helvetica Neue", Helvetica, Arial, sans-serif', { metrics: { adv: 0.58, upper: 1.27 } }),
  S('arial', 'Arial', 'sans-serif', 'Arial, "Helvetica Neue", Helvetica, sans-serif', { metrics: { adv: 0.58, upper: 1.27 } }),
  S('georgia', 'Georgia', 'serif', 'Georgia, "Times New Roman", serif', { metrics: { adv: 0.6, upper: 1.3 } }),
  S('times-new-roman', 'Times New Roman', 'serif', '"Times New Roman", Times, serif', { metrics: { adv: 0.55, upper: 1.44 } }),
  S('garamond', 'Garamond', 'serif', 'Garamond, "Garamond Premier Pro", "Adobe Garamond Pro", "Times New Roman", serif', { metrics: { adv: 0.55, upper: 1.45 } }),
  S('system-mono', 'System Mono', 'monospace', 'ui-monospace, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace', { track: 0, metrics: { adv: 0.66, upper: 1 } }),
  // ---- open-source web faces
  F('inter', 'Inter', 'sans-serif', { hw: 800, track: -0.025 }),
  F('manrope', 'Manrope', 'sans-serif', { hw: 800, track: -0.02 }),
  F('geist', 'Geist', 'sans-serif', { hw: 800, track: -0.025 }),
  F('dm-sans', 'DM Sans', 'sans-serif', { track: -0.02 }),
  F('plus-jakarta-sans', 'Plus Jakarta Sans', 'sans-serif', { hw: 800, track: -0.02 }),
  F('poppins', 'Poppins', 'sans-serif', { track: -0.015 }),
  F('montserrat', 'Montserrat', 'sans-serif', { hw: 800, track: -0.015 }),
  F('nunito-sans', 'Nunito Sans', 'sans-serif', { hw: 800, track: -0.015 }),
  F('urbanist', 'Urbanist', 'sans-serif', { hw: 800, track: -0.015 }),
  F('source-sans-3', 'Source Sans 3', 'sans-serif', { hw: 700 }),
  F('bodoni-moda', 'Bodoni Moda', 'serif', { lead: 1.02, track: -0.01 }),
  F('cormorant-garamond', 'Cormorant Garamond', 'serif', { hw: 600, lead: 1.02, track: -0.01 }),
  F('dm-serif-display', 'DM Serif Display', 'serif', { hw: 400, lw: 400, lead: 1.02, track: -0.01 }),
  F('playfair-display', 'Playfair Display', 'serif', { lead: 1.02, track: -0.01 }),
  F('libre-baskerville', 'Libre Baskerville', 'serif', { lead: 1.04, track: -0.015 }),
  F('instrument-serif', 'Instrument Serif', 'serif', { hw: 400, lw: 400, lead: 1, track: -0.01 }),
  F('source-serif-4', 'Source Serif 4', 'serif', { lead: 1.04 }),
  F('lora', 'Lora', 'serif', { lead: 1.04 }),
  F('merriweather', 'Merriweather', 'serif', { hw: 900, lead: 1.06, track: -0.015 }),
  F('newsreader', 'Newsreader', 'serif', { hw: 600, lead: 1.02 }),
  F('space-grotesk', 'Space Grotesk', 'sans-serif', { track: -0.02 }),
  F('sora', 'Sora', 'sans-serif', { track: -0.02 }),
  F('archivo', 'Archivo', 'sans-serif', { hw: 800, track: -0.015 }),
  F('ibm-plex-sans', 'IBM Plex Sans', 'sans-serif', { track: -0.015 }),
  F('outfit', 'Outfit', 'sans-serif', { hw: 800, track: -0.015 }),
  F('anton', 'Anton', 'sans-serif', { hw: 400, lw: 400, lead: 0.92, track: 0 }),
  F('archivo-black', 'Archivo Black', 'sans-serif', { hw: 400, lw: 400, lead: 0.94, track: -0.02 }),
  F('league-spartan', 'League Spartan', 'sans-serif', { hw: 800, lead: 0.92, track: -0.02 }),
  F('bebas-neue', 'Bebas Neue', 'sans-serif', { hw: 400, lw: 400, caps: true, lead: 0.9, track: 0.01 }),
  F('oswald', 'Oswald', 'sans-serif', { hw: 600, lead: 0.96, track: 0 }),
  F('syne', 'Syne', 'sans-serif', { hw: 800, track: -0.02 }),
  F('unbounded', 'Unbounded', 'sans-serif', { track: -0.02 }),
  F('bricolage-grotesque', 'Bricolage Grotesque', 'sans-serif', { hw: 800, track: -0.025 }),
  F('space-mono', 'Space Mono', 'monospace', { track: -0.02 }),
  F('fraunces', 'Fraunces', 'serif', { hw: 800, lead: 1, track: -0.015 }),
  F('quicksand', 'Quicksand', 'sans-serif', { track: -0.01 }),
  F('nunito', 'Nunito', 'sans-serif', { hw: 800, track: -0.01 }),
  F('rubik', 'Rubik', 'sans-serif', { track: -0.015 }),
  F('varela-round', 'Varela Round', 'sans-serif', { hw: 400, lw: 400, track: -0.01 }),
  F('comfortaa', 'Comfortaa', 'sans-serif', { track: -0.01 }),
  F('jetbrains-mono', 'JetBrains Mono', 'monospace', { hw: 800, track: -0.02 }),
  F('ibm-plex-mono', 'IBM Plex Mono', 'monospace', { track: -0.02 }),
  F('roboto-mono', 'Roboto Mono', 'monospace', { track: -0.02 }),
];
const BY_ID = new Map(LIST.map(f => [f.id, f]));

const CATEGORIES = [
  ['apple', 'Apple / Clean UI', ['apple-system', 'inter', 'manrope', 'geist', 'dm-sans', 'plus-jakarta-sans']],
  ['social', 'Social / Instagram-style', ['avenir-next', 'dm-sans', 'poppins', 'montserrat', 'nunito-sans', 'urbanist']],
  ['luxury', 'Luxury / Fashion', ['bodoni-moda', 'cormorant-garamond', 'dm-serif-display', 'playfair-display', 'libre-baskerville', 'instrument-serif']],
  ['editorial', 'Editorial', ['instrument-serif', 'source-serif-4', 'lora', 'merriweather', 'newsreader', 'source-sans-3']],
  ['tech', 'Modern Tech', ['space-grotesk', 'sora', 'archivo', 'ibm-plex-sans', 'urbanist', 'outfit']],
  ['bold', 'Bold / Brutalist', ['anton', 'archivo-black', 'league-spartan', 'bebas-neue', 'oswald']],
  ['creative', 'Creative / Experimental', ['syne', 'unbounded', 'bricolage-grotesque', 'space-mono', 'fraunces']],
  ['friendly', 'Friendly / Soft', ['quicksand', 'nunito', 'rubik', 'varela-round', 'comfortaa']],
  ['mono', 'Monospace', ['jetbrains-mono', 'ibm-plex-mono', 'roboto-mono', 'space-mono', 'system-mono']],
  ['classic', 'Classic / System', ['georgia', 'times-new-roman', 'helvetica', 'arial', 'garamond']],
].map(([id, label, fonts]) => ({ id, label, fonts }));

// pairings: a headline, a body and an eyebrow/label face that belong together
const PRESETS = [
  ['apple', 'Apple', 'apple-system', 'apple-system', 'apple-system'],
  ['instagram', 'Instagram', 'dm-sans', 'nunito-sans', 'dm-sans'],
  ['minimal', 'Minimal', 'inter', 'inter', 'inter'],
  ['luxury', 'Luxury', 'bodoni-moda', 'manrope', 'manrope'],
  ['editorial', 'Editorial', 'instrument-serif', 'source-sans-3', 'inter'],
  ['tech', 'Tech', 'space-grotesk', 'inter', 'ibm-plex-mono'],
  ['streetwear', 'Streetwear', 'anton', 'archivo', 'archivo'],
  ['bold-campaign', 'Bold Campaign', 'archivo-black', 'dm-sans', 'dm-sans'],
  ['friendly', 'Friendly', 'nunito', 'nunito', 'quicksand'],
  ['classic', 'Classic', 'georgia', 'georgia', 'helvetica'],
].map(([id, name, headline, body, label]) => ({ id, name, headline, body, label }));
const PRESET_BY_ID = new Map(PRESETS.map(p => [p.id, p]));

const ROLES = ['headline', 'body', 'label'];
const ID = /^[a-z0-9-]{2,40}$/;
const get = id => (typeof id === 'string' && ID.test(id) ? BY_ID.get(id) || null : null);
const known = id => !!get(id);
// the CSS family name a web face is declared under -- namespaced, so a face the visitor happens to have installed under the
// same name (perhaps another version) is never used in its place
const faceName = f => `SR ${f.label}`;
const GENERIC = { 'sans-serif': 'sans-serif', serif: 'serif', monospace: 'monospace' };
const FALLBACK = { 'sans-serif': '"Helvetica Neue", Arial, sans-serif', serif: 'Georgia, "Times New Roman", serif', monospace: 'ui-monospace, Menlo, Consolas, monospace' };
function stack(id) { const f = get(id); if (!f) return null; return f.source === 'system' ? f.stack : `"${faceName(f)}", ${FALLBACK[f.kind] || GENERIC[f.kind]}`; }
// the weights a web face was vendored at (fonts-data.json), and the nearest of them to the one asked for
const weightsOf = id => Object.keys((DATA.fonts[id] || {}).weights || {}).map(Number).sort((a, b) => a - b);
function nearest(id, w) { const ws = weightsOf(id); if (!ws.length) return null; return ws.reduce((b, x) => (Math.abs(x - w) < Math.abs(b - w) ? x : b), ws[0]); }
const fileOf = (id, w) => { const d = DATA.fonts[id]; const x = d && d.weights[String(w)]; return x ? x.file : null; };
// the faces a page needs for the fonts it uses: [{ id, weight, file, family }] -- a headline face at its headline weight,
// the body at 400 and 700, a label at its label weight; a system face that stands in for a web one (Avenir Next) brings
// that web face as its fallback. Nothing else.
function facesFor(fonts) {
  const want = []; const f = fonts || {};
  const add = (id, w) => { const x = get(id); if (!x) return; if (x.source === 'system') { if (x.fallback) add(x.fallback, w); return; } const n = nearest(id, w); if (n != null) want.push({ id, weight: n }); };
  if (f.headline) add(f.headline, get(f.headline).hw);
  if (f.body) { add(f.body, 400); add(f.body, 700); }
  if (f.label) add(f.label, get(f.label).lw);
  const seen = new Set();
  return want.filter(x => { const k = x.id + ':' + x.weight; if (seen.has(k)) return false; seen.add(k); return true; })
    .map(x => ({ id: x.id, weight: x.weight, file: fileOf(x.id, x.weight), family: faceName(get(x.id)) })).filter(x => x.file);
}
// @font-face rules for exactly those faces; src(file) -> the URL the page loads it from
function fontFaceCss(fonts, src) {
  return facesFor(fonts).map(x => `@font-face{font-family:"${x.family}";font-style:normal;font-weight:${x.weight};font-display:swap;src:url("${src(x.file)}") format("woff2")}`).join('\n');
}
// how wide a face sets a headline (em per character, and its capitals as a factor) -- measured from its own file at the
// weight a headline uses, with the same headroom the look's own families carry (look.js FAMILIES)
const HEADROOM = 1.15;
function metrics(id) {
  const f = get(id); if (!f) return null;
  if (f.source === 'system') return { adv: f.metrics.adv, upper: f.caps ? 1 : f.metrics.upper };
  const d = DATA.fonts[id]; const w = nearest(id, f.hw); const m = d && d.weights[String(w)];
  if (!m) return null;
  return { adv: +(m.adv * HEADROOM).toFixed(3), upper: f.caps ? 1 : +m.upper.toFixed(3) };
}
// the type a page's headlines are fitted with when its headline face is chosen: that face's own width, weight and setting
// (case stays the page's own -- a face of capitals only is always set as capitals)
function headlineType(fonts, base) {
  const f = fonts && get(fonts.headline); if (!f) return null; const m = metrics(f.id); if (!m) return null;
  const b = base || {};
  return { family: f.id, case: f.caps ? 'upper' : (b.case || 'normal'), adv: m.adv, upper: m.upper, track: f.track, lead: f.lead, weight: f.hw, fontId: f.id };
}
// plan.fonts as it may be stored: known ids only, never a family string; null when nothing is chosen
function sanitize(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const out = {}; ROLES.forEach(r => { if (known(raw[r])) out[r] = raw[r]; });
  if (typeof raw.preset === 'string' && PRESET_BY_ID.has(raw.preset)) out.preset = raw.preset;
  return Object.keys(out).filter(k => k !== 'preset').length ? out : null;
}
// what the editor's picker shows (no file names, no stacks it does not need)
function catalogue() {
  return {
    fonts: LIST.map(f => ({ id: f.id, label: f.label, kind: f.kind, source: f.source, caps: !!f.caps, categories: CATEGORIES.filter(c => c.fonts.includes(f.id)).map(c => c.id),
      specimen: f.source === 'web' ? { weight: nearest(f.id, f.hw), file: fileOf(f.id, nearest(f.id, f.hw)) } : null, stack: stack(f.id) })),
    categories: CATEGORIES.map(c => ({ id: c.id, label: c.label, fonts: c.fonts.slice() })),
    presets: PRESETS.map(p => Object.assign({}, p)),
  };
}
// every vendored file (the builder serves exactly these at /creative-fonts/<file>)
const FILES = Object.values(DATA.fonts).reduce((all, d) => all.concat(Object.values(d.weights).map(w => w.file)), []);

module.exports = { LIST, CATEGORIES, PRESETS, ROLES, get, known, stack, faceName, facesFor, fontFaceCss, metrics, headlineType, sanitize, catalogue, nearest, preset: id => PRESET_BY_ID.get(id) || null, FILES, DATA };
