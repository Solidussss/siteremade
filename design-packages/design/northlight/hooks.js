// Northlight's design-specific build logic: the page scripts' data written from the content (the six lighting steps,
// the shot's settings and numbers, kinds of session and their packages, the timeline, what's delivered, the diary's
// lead time and closed days) and the rules the schema can't express (where the packages start, the ratio, widths of
// the big type). Runs at build time only.
'use strict';
const { FILTERS } = require('../../engine/template');
const js = FILTERS.js;

const WINDOWS = ['[0,.12]', '[.12,.3]', '[.3,.45]', '[.45,.6]', '[.6,.74]', '[.74,1]'];
const num = (n) => String(+(+n).toFixed(2)).replace(/^0\./, '.');
const ints = (a) => a.map((x) => String(x)).join(',');

function derive(c) {
  const s = c.shot;
  return {
    tel: c.contact.phone.replace(/[^\d+]/g, ''),
    businessSaid: c.business.name.replace(/\s*&\s*/g, ' and '),
    brandSaid: c.brand.name.replace(/\s*&\s*/g, ' and '),
    stagesJs: c.stages.map((x, i) => ` {n:${js(x.n)},c:${js(x.c)},w:${WINDOWS[i]}}`).join(',\n'),
    shotJs: `{aperture:${js(s.aperture)},shutter:${js(s.shutter)},iso:${js(s.iso)},ratio:${js(s.ratio)},frames:${s.frames},keep:${s.keep}}`,
    kindsJs: c.sessions.kinds.map((k) => ` {n:${js(k.n)},line:${js(k.line)},tiers:[\n${k.tiers.map((t) => `  {n:${js(t.n)},p:${num(t.p)},from:${t.from},time:${js(t.time)},photos:${js(t.photos)},items:[${t.items.map(js).join(',')}],tag:${js(t.tag || '')}}`).join(',\n')}]}`).join(',\n'),
    stepsJs: c.process.steps.map((x) => ` {when:${js(x.when)},b:${js(x.b)},s:${js(x.s)}}`).join(',\n'),
    deliversJs: c.process.delivers.map((x) => `{k:${js(x.k)},s:${js(x.s)}}`).join(','),
    closedJs: ints(c.book.closed),
  };
}

// Widths of the big display type (Instrument Serif 400, -.01em), in em (metrics.json).
// Hero title: 1440x900 desktop, 86.4px (9.6vh) in a 540px column, 6.25 em; the two lines together may take four lines
// before the copy reaches the note card (checked 1280x720 to 1920x1080). Phone: 48px in 288px on a 320px phone: no word
// wider than 6 em. Section titles: 44.8px there: no word wider than 6.4 em.
// Phone nav row on a 360px phone: the logo (26px), the brand (25px) and the button (Geist 600, 13px, 32px of padding)
// with their gaps in 328px.
const LIMITS = { heroEm: 6.25, heroLines: 4, heroWord: 6, sectionWord: 6.4, navRow: 240 };
function wrapLines(words, width, em) { let n = 1, w = 0; const sp = em(' '); for (const word of words) { const ww = em(word); if (w && w + sp + ww > width) { n++; w = ww; } else w += (w ? sp : 0) + ww; } return n; }

function validate(c, ctx) {
  const e = [];
  const em = (t) => ctx.textEm('display', String(t));
  const words = (s) => String(s).split(/\s+/).filter(Boolean);
  const K = c.sessions.kinds, st = c.sessions.start;
  if (st.kind >= K.length) e.push('sessions.start.kind: the number of a kind in sessions.kinds, from 0');
  else if (st.tier >= K[st.kind].tiers.length) e.push(`sessions.start.tier: the number of a package in sessions.kinds.${st.kind}.tiers, from 0`);
  if (!/^\d+(\.\d+)?:1$/.test(c.shot.ratio)) e.push('shot.ratio: a lighting ratio like 3:1');
  if (c.shot.keep > c.shot.frames) e.push('shot.keep: no more keepers than frames');
  if (c.book.closed.some((d) => !Number.isInteger(d) || d < 0 || d > 6) || new Set(c.book.closed).size !== c.book.closed.length) e.push('book.closed: days of the week, 0 (Sunday) to 6 (Saturday), each once');
  // the big type
  const lines = wrapLines(words(c.hero.title), LIMITS.heroEm, em) + wrapLines(words(c.hero.titleEm), LIMITS.heroEm, em);
  if (lines > LIMITS.heroLines) e.push(`hero.title + hero.titleEm: the hero title takes ${lines} lines on a desktop (room for ${LIMITS.heroLines}); shorten one`);
  for (const p of ['hero.title', 'hero.titleEm']) for (const w of words(ctx.get(c, p))) { const x = em(w); if (x > LIMITS.heroWord) e.push(`${p}: the word "${w}" is too wide for a phone (${x.toFixed(2)} em, room for ${LIMITS.heroWord})`); }
  for (const p of ['sessions.title', 'sessions.titleEm', 'process.title', 'process.titleEm', 'book.title']) for (const w of words(ctx.get(c, p))) { const x = em(w); if (x > LIMITS.sectionWord) e.push(`${p}: the word "${w}" is too wide for a phone (${x.toFixed(2)} em, room for ${LIMITS.sectionWord})`); }
  const nav = ctx.textEm('display', c.brand.name) * 25 + ctx.textEm('cta', c.nav.cta) * 13;
  if (nav > LIMITS.navRow) e.push(`brand.name + nav.cta: the phone nav row needs ${Math.round(nav)}px of text, a 360px phone has ${LIMITS.navRow}px`);
  return e;
}

module.exports = { derive, validate, LIMITS };
