// Petal's design-specific build logic: the page scripts' data written from the content (the six steps, the sixteen stems
// placed in the bouquet's fixed slots, the wrap and card, sizes, palettes, extras, seasons, delivery zones and words)
// and the rules the schema can't express (the right kind of stem in each slot, palettes that match, postcodes in
// zones, widths of the big type). Runs at build time only.
'use strict';
const { FILTERS } = require('../../engine/template');
const js = FILTERS.js;

const WINDOWS = ['[0,.14]', '[.14,.34]', '[.34,.52]', '[.52,.68]', '[.68,.86]', '[.86,1]'];
// where each of the sixteen stems sits: its stage, angle from upright, reach and size (the original's arrangement)
const SLOTS = [
  { st: 0, a: -0.75, d: 1, r: 0.34 }, { st: 0, a: 0.7, d: 0.95, r: 0.32 }, { st: 0, a: -0.35, d: 1.05, r: 0.3 }, { st: 0, a: 0.38, d: 1.08, r: 0.3 },
  { st: 1, a: -0.2, d: 0.72, r: 0.26 }, { st: 1, a: 0.22, d: 0.78, r: 0.3 }, { st: 1, a: 0.04, d: 0.95, r: 0.24 }, { st: 1, a: -0.45, d: 0.82, r: 0.27 }, { st: 1, a: 0.5, d: 0.86, r: 0.22 },
  { st: 2, a: -0.08, d: 0.58, r: 0.17 }, { st: 2, a: 0.36, d: 0.62, r: 0.16 }, { st: 2, a: -0.32, d: 0.62, r: 0.18 }, { st: 2, a: 0.62, d: 0.66, r: 0.16 },
  { st: 3, a: -0.6, d: 1.15, r: 0.3 }, { st: 3, a: 0.15, d: 1.18, r: 0.28 }, { st: 3, a: 0.85, d: 1.05, r: 0.34 },
];
const ROLE = (i) => (i < 4 ? 'green' : i < 9 ? 'focal' : i < 13 ? 'filler' : 'wild');
const KINDS = { green: ['eucalyptus', 'fern', 'grass'], focal: ['rose', 'peony', 'ranunculus', 'tulip', 'anemone', 'dahlia', 'daisy'], filler: ['ranunculus', 'spray', 'daisy', 'anemone', 'rose'], wild: ['grass', 'fern', 'eucalyptus', 'spray'] };
const num = (n) => String(+(+n).toFixed(3)).replace(/^(-?)0\./, '$1.');
const ints = (a) => a.map((x) => String(x)).join(',');

function derive(c) {
  return {
    tel: c.contact.phone.replace(/[^\d+]/g, ''),
    businessSaid: c.business.name.replace(/\s*&\s*/g, ' and '),
    brandSaid: c.brand.name.replace(/\s*&\s*/g, ' and '),
    stagesJs: c.stages.map((s, i) => ` {n:${js(s.n)},c:${js(s.c)},w:${WINDOWS[i]}}`).join(',\n'),
    stemsJs: c.bouquet.stems.map((s, i) => { const L = SLOTS[i]; return ` {kind:${js(s.kind)},col:${js(s.col)},st:${L.st},a:${num(L.a)},d:${num(L.d)},r:${num(L.r)},name:${js(s.name)}}`; }).join(',\n'),
    sizesJs: c.build.sizes.map((s) => `{n:${js(s.n)},stems:${s.stems},p:${num(s.p)}}`).join(','),
    palettesJs: c.build.palettes.map((p) => ` {n:${js(p.n)},d:${js(p.d)},cols:[${p.cols.map(js).join(',')}],kinds:[${p.kinds.map(js).join(',')}]}`).join(',\n'),
    extrasJs: c.build.extras.map((x) => `{n:${js(x.n)},p:${num(x.p)}}`).join(','),
    seasonsJs: c.season.seasons.map((s) => ` {n:${js(s.n)},from:${s.from},flowers:[${s.flowers.map((f) => `{n:${js(f.n)},d:${js(f.d)},lasts:${js(f.lasts)},kind:${js(f.kind)},col:${js(f.col)}}`).join(',')}]}`).join(',\n'),
    zonesJs: c.deliver.zones.map((z) => `{codes:[${z.codes.map(js).join(',')}],fee:${num(z.fee)},cut:${js(z.cut)}}`).join(','),
    closedJs: ints(c.deliver.closed),
    wordsJs: `{${['ask', 'yes', 'same', 'no', 'noTail', 'card'].map((k) => `${k}:${js(c.deliver.words[k])}`).join(',')}}`,
    zoneErr: `Add a ${c.deliver.codeLabel.toLowerCase()} we deliver to.`,
  };
}

// Widths of the big display type (Italiana, .005em), in em (metrics.json).
// Hero title: 1440x900 desktop, 93.6px (10.4vh) in a 520px column, 5.55 em; the two lines together may take four lines
// before the copy reaches the tag (checked 1280x720 to 1920x1080). Phone: 51.2px in 288px on a 320px phone: no word
// wider than 5.6 em. Section titles: 48px there: no word wider than 6 em.
// Phone nav row on a 360px phone: the logo (28px), the brand (Italiana 25px) and the button (Figtree 600, 14px, 36px
// of padding) with their gaps in 328px.
const LIMITS = { heroEm: 5.55, heroLines: 4, heroWord: 5.6, sectionWord: 6, navRow: 234 };
function wrapLines(words, width, em) { let n = 1, w = 0; const sp = em(' '); for (const word of words) { const ww = em(word); if (w && w + sp + ww > width) { n++; w = ww; } else w += (w ? sp : 0) + ww; } return n; }

function validate(c, ctx) {
  const e = [];
  const em = (t) => ctx.textEm('display', String(t));
  const words = (s) => String(s).split(/\s+/).filter(Boolean);
  c.bouquet.stems.forEach((s, i) => { const r = ROLE(i); if (!KINDS[r].includes(s.kind)) e.push(`bouquet.stems.${i}.kind: slot ${i} holds ${r === 'green' ? 'a green' : r === 'focal' ? 'a focal flower' : r === 'filler' ? 'a filler' : 'something wild'}: one of ${KINDS[r].join(', ')}`); });
  c.build.palettes.forEach((p, i) => { if (p.cols.length !== p.kinds.length) e.push(`build.palettes.${i}: one flower kind for each colour`); });
  c.season.seasons.forEach((s, i) => { if (!Number.isInteger(s.from) || s.from < 0 || s.from > 11) e.push(`season.seasons.${i}.from: the month it starts, 0 (January) to 11`); });
  c.deliver.zones.forEach((z, i) => { if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(z.cut)) e.push(`deliver.zones.${i}.cut: a time like 12:00`); z.codes.forEach((k, j) => { if (!/^[A-Z]{1,2}\d{1,2}[A-Z]?$|^\d{3,5}$/.test(k)) e.push(`deliver.zones.${i}.codes.${j}: the start of a postcode like E8 or a ZIP like 94110`); }); });
  if (c.deliver.closed.some((d) => !Number.isInteger(d) || d < 0 || d > 6) || new Set(c.deliver.closed).size !== c.deliver.closed.length) e.push('deliver.closed: days of the week, 0 (Sunday) to 6 (Saturday), each once');
  // the big type
  const lines = wrapLines(words(c.hero.title), LIMITS.heroEm, em) + wrapLines(words(c.hero.titleEm), LIMITS.heroEm, em);
  if (lines > LIMITS.heroLines) e.push(`hero.title + hero.titleEm: the hero title takes ${lines} lines on a desktop (room for ${LIMITS.heroLines}); shorten one`);
  for (const p of ['hero.title', 'hero.titleEm']) for (const w of words(ctx.get(c, p))) { const x = em(w); if (x > LIMITS.heroWord) e.push(`${p}: the word "${w}" is too wide for a phone (${x.toFixed(2)} em, room for ${LIMITS.heroWord})`); }
  for (const p of ['build.title', 'build.titleEm', 'season.title', 'season.titleEm', 'deliver.title']) for (const w of words(ctx.get(c, p))) { const x = em(w); if (x > LIMITS.sectionWord) e.push(`${p}: the word "${w}" is too wide for a phone (${x.toFixed(2)} em, room for ${LIMITS.sectionWord})`); }
  const nav = ctx.textEm('display', c.brand.name) * 25 + ctx.textEm('cta', c.nav.cta) * 14;
  if (nav > LIMITS.navRow) e.push(`brand.name + nav.cta: the phone nav row needs ${Math.round(nav)}px of text, a 360px phone has ${LIMITS.navRow}px`);
  return e;
}

module.exports = { derive, validate, LIMITS };
