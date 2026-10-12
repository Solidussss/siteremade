// Keel & Ridge's design-specific build logic: the page script's data written from the content (the eight stages, the
// inspection tags, the materials with their per-kind constants, the damage-check signs with their weights, the towns,
// the map's coast and the booking windows) and the rules the schema can't express (colour tones per kind, the service
// area, widths of the big type). Runs at build time only.
'use strict';
const { FILTERS } = require('../../engine/template');
const js = FILTERS.js;

// the hero's scroll windows and where the inspection marks each problem on the old roof: the design's, by position
const WINDOWS = ['[0,.10]', '[.10,.24]', '[.24,.34]', '[.34,.48]', '[.48,.57]', '[.57,.79]', '[.79,.88]', '[.88,1]'];
const ISSUE_AT = ['u:.20,v:.66', 'u:.258,v:.455', 'u:.56,v:.40', 'u:.715,v:.57', 'u:.40,v:.58', 'u:.86,v:.62'];
// per kind: units per square (bundles, panels), fasteners per square, pounds per square; tones per colour
const KIND = {
  asphalt: { per: '3', perSq: 320, lbSq: 230, tones: 4 },
  metal: { per: '1.65', perSq: 48, lbSq: 110, tones: 1 },
  cedar: { per: '4', perSq: 420, lbSq: 350, tones: 4 },
};
// how much each sign moves the damage check towards a new roof (the design's scoring)
const WEIGHT = { missing: 2, granules: 2, curl: 3, stain: 3, sag: 5, light: 4, moss: 1, hail: 2 };
const COASTS = {
  east: { path: 'M400 0 L400 300 L230 300 C250 262 262 236 268 214 C282 190 300 176 318 150 C330 120 350 100 372 70 C384 46 392 24 400 0 Z', home: [236, 170] },
  west: { path: 'M0 0 L0 300 L170 300 C150 262 138 236 132 214 C118 190 100 176 82 150 C70 120 50 100 28 70 C16 46 8 24 0 0 Z', home: [164, 170] },
  south: { path: 'M0 300 L0 236 C40 244 80 230 120 238 C160 246 196 228 236 234 C276 240 316 224 356 232 C376 236 390 228 400 226 L400 300 Z', home: [200, 128] },
  none: { path: '', home: [200, 150] },
};

function derive(c) {
  const m0 = c.materials[0];
  const said = (s) => s.replace(/\s*&\s*/g, ' and ');
  const digits = c.contact.phone.replace(/[^\d+]/g, '');
  const tel = digits.startsWith('+') ? digits : digits.length === 10 ? '+1' + digits : digits;
  const mat = (m) => ` {id:${js(m.kind)},name:${js(m.name)},short:${js(m.short)},${m.lay ? `lay:${js(m.lay)},` : ''}${m.ridge ? `ridge:${js(m.ridge)},` : ''}blurb:${js(m.blurb)},life:${js(m.life)},wind:${js(m.wind)},warranty:${js(m.warranty)},weight:${js(m.weight)},price:[${m.price[0]},${m.price[1]}],unit:${js(m.unit)},per:${KIND[m.kind].per},fasten:${js(m.fasten)},perSq:${KIND[m.kind].perSq},lbSq:${KIND[m.kind].lbSq},\n  colours:[${m.colours.map((x) => `{name:${js(x.name)},c:[${x.c.map((h) => js(h.toLowerCase())).join(',')}]}`).join(',')}]}`;
  const coast = COASTS[c.book.coast];
  return {
    tel,
    businessSaid: said(c.business.name),
    brandSaid: said(c.brand.name),
    brandUpper: c.brand.name.toUpperCase(),
    unitsTotal: Math.round(c.job.squares * +KIND[m0.kind].per),
    stagesJs: c.stages.map((s, i) => ` {n:${js(s.n)},c:${js(s.c)},w:${WINDOWS[i]}}`).join(',\n'),
    issuesJs: c.issues.map((t, i) => ` {${ISSUE_AT[i]},t:${js(t)}}`).join(',\n'),
    materialsJs: c.materials.map(mat).join(',\n'),
    symptomsJs: c.check.symptoms.map((s) => ` {id:${js(s.id)},label:${js(s.label)},hint:${js(s.hint)},w:${WEIGHT[s.id]},check:${js(s.check)}}`).join(',\n'),
    townsJs: c.book.towns.map((t) => ` {n:${js(t.n)},m:${t.m}${t.dir ? `,dir:${js(t.dir)}` : ''}}`).join(',\n'),
    slotsJs: c.book.slots.map(js).join(','),
    coastJs: js(coast.path),
    homeX: coast.home[0],
    homeY: coast.home[1],
  };
}

// Widths of the big display type (Barlow Condensed 800, capitals), in em (metrics.json).
// Hero title: on a 1440x900 desktop it is 77.4px (8.6vh) in a 540px column, 6.98 em; the title and its accent line wrap
// there (balanced) and may take 4 lines at most before the copy runs into the job ticket (seen in the stress test).
// On a 320px phone it is 41.6px in a 288px column: no single word wider than 6.9 em.
// Section titles: clamp(40px..) on a 320px phone in a 288px column: no word wider than 7.0 em.
// Phone nav row: chevron + brand (18px, .04em tracking) + the booking button (14px Barlow 700 + 30px padding) on a
// 360px phone with 16px gutters: 328px, less the chevron (40px) and the gap (20px).
const LIMITS = { heroEm: 6.98, heroLines: 4, heroWord: 6.9, sectionWord: 7.0, navRow: 262 };
function wrapLines(words, width, em) { let n = 1, w = 0; const sp = em(' '); for (const word of words) { const ww = em(word); if (w && w + sp + ww > width) { n++; w = ww; } else w += (w ? sp : 0) + ww; } return n; }

function validate(c, ctx) {
  const e = [];
  const em = (t) => ctx.textEm('display', String(t).toUpperCase());
  // materials: tones per kind, prices low to high (two lines of the same kind are fine)
  c.materials.forEach((m, i) => {
    const t = KIND[m.kind].tones;
    m.colours.forEach((x, k) => { if (x.c.length !== t) e.push(`materials.${i}.colours.${k}.c: ${m.kind} colours take ${t} tone${t > 1 ? 's' : ''} (${x.c.length} given)`); });
    if (!(m.price[0] < m.price[1])) e.push(`materials.${i}.price: low, then high (per square, installed)`);
  });
  if (!(c.estimate.tear[0] <= c.estimate.tear[1])) e.push('estimate.tear: low, then high (per square, per layer)');
  // the damage check: every sign once
  const ids = c.check.symptoms.map((s) => s.id);
  if (new Set(ids).size !== 8) e.push('check.symptoms: each of the eight signs exactly once');
  // the service area
  const T = c.book.towns;
  if (T[0].m !== 0 || T[0].dir) e.push('book.towns.0: the yard\'s own town, m 0 and no direction');
  T.slice(1).forEach((t, i) => { if (t.m < 5) e.push(`book.towns.${i + 1}.m: 5-45 minutes from the yard`); if (!t.dir) e.push(`book.towns.${i + 1}.dir: the compass direction from the yard`); });
  const names = T.map((t) => t.n.toLowerCase());
  if (!names.slice(1).includes(c.book.townExample.toLowerCase())) e.push('book.townExample: one of the towns in book.towns (not the yard\'s)');
  if (c.book.saturday > c.book.slots.length) e.push('book.saturday: more Saturday windows than weekday windows');
  if (!Number.isInteger(c.book.saturday)) e.push('book.saturday: a whole number');
  // job ticket
  if (!/^[A-Z]{1,4}-\d{2,6}$/.test(c.job.ref)) e.push('job.ref: capitals, a dash and digits (KR-2611)');
  if (!Number.isInteger(c.job.squares)) e.push('job.squares: a whole number');
  // the big type
  const words = (s) => String(s).split(/\s+/).filter(Boolean);
  const lines = wrapLines(words(c.hero.title), LIMITS.heroEm, em) + wrapLines(words(c.hero.titleEm), LIMITS.heroEm, em);
  if (lines > LIMITS.heroLines) e.push(`hero.title + hero.titleEm: the hero title takes ${lines} lines on a desktop (room for ${LIMITS.heroLines}); shorten one`);
  for (const p of ['hero.title', 'hero.titleEm']) for (const w of words(ctx.get(c, p))) { const x = em(w); if (x > LIMITS.heroWord) e.push(`${p}: the word "${w}" is too wide for a phone (${x.toFixed(2)} em, room for ${LIMITS.heroWord})`); }
  for (const p of ['check.title', 'estimate.title', 'board.title', 'book.title']) for (const w of words(ctx.get(c, p))) { const x = em(w); if (x > LIMITS.sectionWord) e.push(`${p}: the word "${w}" is too wide for a phone (${x.toFixed(2)} em, room for ${LIMITS.sectionWord})`); }
  const nav = (em(c.brand.name) + 0.04 * [...c.brand.name].length) * 18 + ctx.textEm('cta', c.nav.cta) * 14 + 30;
  if (nav > LIMITS.navRow) e.push(`brand.name + nav.cta: the phone nav row needs ${Math.round(nav)}px, a 360px phone has ${LIMITS.navRow}px ("${c.brand.name}" + "${c.nav.cta}")`);
  return e;
}

module.exports = { derive, validate, LIMITS };
