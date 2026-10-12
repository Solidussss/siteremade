// Scruff's design-specific build logic: the page scripts' data written from the content (the six steps of the groom or
// check-up, the tally, sizes and services with a price for each size, add-ons, the visit's steps, times and closed
// days) and the rules the schema can't express (a price for every size, tally stages in order, widths of the big type).
// Runs at build time only.
'use strict';
const { FILTERS } = require('../../engine/template');
const js = FILTERS.js;

const WINDOWS = ['[0,.12]', '[.12,.3]', '[.3,.48]', '[.48,.7]', '[.7,.86]', '[.86,1]'];
const num = (n) => String(+(+n).toFixed(2)).replace(/^0\./, '.');
const ints = (a) => a.map((x) => String(x)).join(',');
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function derive(c) {
  return {
    tel: c.contact.phone.replace(/[^\d+]/g, ''),
    businessSaid: c.business.name.replace(/\s*&\s*/g, ' and '),
    brandSaid: c.brand.name.replace(/\s*&\s*/g, ' and '),
    stagesJs: c.stages.map((s, i) => ` {n:${js(s.n)},c:${js(s.c)},clock:${js(s.clock)},w:${WINDOWS[i]}}`).join(',\n'),
    tallyJs: c.tally.map((t) => ` {label:${js(t.label)},unit:${js(t.unit)},from:${num(t.from)},to:${num(t.to)},at:[${t.at[0]},${t.at[1]}],dec:${t.dec}}`).join(',\n'),
    // the tally before the page script runs: its starting numbers
    tallyHtml: c.tally.map((t) => `${num(t.from).replace(/^\./, '0.')}${t.unit ? `<small>${esc(t.unit)}</small>` : ''}`),
    sizesJs: c.prices.sizes.map((s) => ` {n:${js(s.n)},d:${js(s.d)},shape:${js(s.shape)}}`).join(',\n'),
    servicesJs: c.prices.services.map((s) => ` {n:${js(s.n)},time:${js(s.time)},p:[${s.p.map(num).join(',')}],items:[${s.items.map(js).join(',')}],tag:${js(s.tag || '')}}`).join(',\n'),
    addonsJs: c.prices.addons.map((a) => `{n:${js(a.n)},p:${num(a.p)}}`).join(','),
    stepsJs: c.visit.steps.map((s) => ` {b:${js(s.b)},s:${js(s.s)}}`).join(',\n'),
    timesJs: c.book.times.map(js).join(','),
    closedJs: ints(c.book.closed),
    dogErr: "Add your dog's name.",
  };
}

// Widths of the big display type (Fredoka 600), in em (metrics.json).
// Hero title: 1440x900 desktop, 81px (9vh) in a 540px column, 6.65 em; the two lines together may take four lines
// before the copy reaches the step card (checked 1280x720 to 1920x1080). Phone: 46.4px in 288px on a 320px phone: no
// word wider than 6.2 em. Section titles: 41.6px there: no word wider than 6.9 em.
// Phone nav row on a 360px phone: the logo (32px), the brand (Fredoka 700, 22px) and the button (Fredoka 600, 15px,
// 36px of padding) with their gaps in 328px.
const LIMITS = { heroEm: 6.65, heroLines: 4, heroWord: 6.2, sectionWord: 6.9, navRow: 230 };
function wrapLines(words, width, em) { let n = 1, w = 0; const sp = em(' '); for (const word of words) { const ww = em(word); if (w && w + sp + ww > width) { n++; w = ww; } else w += (w ? sp : 0) + ww; } return n; }

function validate(c, ctx) {
  const e = [];
  const em = (t) => ctx.textEm('display', String(t));
  const words = (s) => String(s).split(/\s+/).filter(Boolean);
  c.prices.services.forEach((s, i) => { if (s.p.length !== c.prices.sizes.length) e.push(`prices.services.${i}.p: one price for each size of dog (${c.prices.sizes.length})`); });
  if (c.prices.start >= c.prices.sizes.length) e.push('prices.start: the number of a size in prices.sizes, from 0');
  c.tally.forEach((t, i) => { if (t.at[0] > t.at[1]) e.push(`tally.${i}.at: the first stage, then the last`); });
  if (c.book.closed.some((d) => !Number.isInteger(d) || d < 0 || d > 6) || new Set(c.book.closed).size !== c.book.closed.length) e.push('book.closed: days of the week, 0 (Sunday) to 6 (Saturday), each once');
  c.book.times.forEach((t, i) => { if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(t)) e.push(`book.times.${i}: a time like 08:30`); });
  // the big type
  const lines = wrapLines(words(c.hero.title), LIMITS.heroEm, em) + wrapLines(words(c.hero.titleEm), LIMITS.heroEm, em);
  if (lines > LIMITS.heroLines) e.push(`hero.title + hero.titleEm: the hero title takes ${lines} lines on a desktop (room for ${LIMITS.heroLines}); shorten one`);
  for (const p of ['hero.title', 'hero.titleEm']) for (const w of words(ctx.get(c, p))) { const x = em(w); if (x > LIMITS.heroWord) e.push(`${p}: the word "${w}" is too wide for a phone (${x.toFixed(2)} em, room for ${LIMITS.heroWord})`); }
  for (const p of ['prices.title', 'visit.title', 'book.title']) for (const w of words(ctx.get(c, p))) { const x = em(w); if (x > LIMITS.sectionWord) e.push(`${p}: the word "${w}" is too wide for a phone (${x.toFixed(2)} em, room for ${LIMITS.sectionWord})`); }
  const nav = ctx.textEm('brand', c.brand.name) * 22 + ctx.textEm('cta', c.nav.cta) * 15;
  if (nav > LIMITS.navRow) e.push(`brand.name + nav.cta: the phone nav row needs ${Math.round(nav)}px of text, a 360px phone has ${LIMITS.navRow}px`);
  return e;
}

module.exports = { derive, validate, LIMITS };
