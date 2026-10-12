// Gather's design-specific build logic: the page scripts' data written from the content (the six steps, the room and
// how it's dressed, the numbers and the clock, spaces, seasons, days, guests, words and the day) and the rules the
// schema can't express (a guest range that runs low to high, seasons that don't share months, widths of the big type).
// Runs at build time only.
'use strict';
const { FILTERS } = require('../../engine/template');
const js = FILTERS.js;

const WINDOWS = ['[0,.14]', '[.14,.3]', '[.3,.46]', '[.46,.64]', '[.64,.82]', '[.82,1]'];
const DOW = ['[6]', '[5]', '[0]', '[1,2,3,4]'];
const num = (n) => String(+(+n).toFixed(3)).replace(/^(-?)0\./, '$1.');
const list = (a) => a.map(js).join(',');

function derive(c) {
  const V = c.venue, h12 = c.event.clock === '12h';
  return {
    tel: c.contact.phone.replace(/[^\d+]/g, ''),
    businessSaid: c.business.name.replace(/\s*&\s*/g, ' and '),
    brandSaid: c.brand.name.replace(/\s*&\s*/g, ' and '),
    stagesJs: c.stages.map((s, i) => ` {n:${js(s.n)},c:${js(s.c)},w:${WINDOWS[i]}}`).join(',\n'),
    venueJs: `{kind:${js(V.kind)},guests:${V.guests},seats:${V.seats},chair:${js(V.chair)},linen:${js(V.linen)},flowers:[${list(V.flowers)}]}`,
    countJs: `{candles:${c.count.candles},last:${js(c.count.last)}}`,
    h12: String(h12),
    clock0: h12 ? '10:00 am' : '10:00',
    spacesJs: c.spaces.list.map((s) => ` {n:${js(s.n)},d:${js(s.d)},kind:${js(s.kind)},layout:${js(s.layout)},ceremony:${s.ceremony},dinner:${s.dinner},evening:${s.evening}}`).join(',\n'),
    capsJs: `[${list(c.spaces.caps)}]`,
    lookJs: `{chair:${js(V.chair)},linen:${js(V.linen)},flowers:[${list(V.flowers)}]}`,
    seasonsJs: c.price.seasons.map((s) => ` {n:${js(s.n)},d:${js(s.d)},months:[${s.months.join(',')}],hire:[${s.hire.map(num).join(',')}]}`).join(',\n'),
    daysJs: `[${c.price.days.map((d, i) => `{n:${js(d)},dow:${DOW[i]}}`).join(',')}]`,
    guestsJs: `{min:${c.price.guests.min},max:${c.price.guests.max},start:${c.price.guests.start},perHead:${num(c.price.guests.perHead)}}`,
    wordsJs: `{${['hire', 'perGuest', 'guests', 'note', 'none', 'sent', 'reply'].map((k) => `${k}:${js(c.price.words[k])}`).join(',')}}`,
    dayJs: c.day.items.map((s) => ` {t:${js(s.t)},n:${js(s.n)},d:${js(s.d)}}`).join(',\n'),
  };
}

// Widths of the big display type (Gilda Display, -.005em), in em (metrics.json).
// Hero title: 1440x900 desktop, 86.4px (9.6vh) in a 520px column, 6 em; the two lines together may take four lines
// before the copy reaches the card (checked 1280x720 to 1920x1080). Phone: 48px in 288px on a 320px phone: no word
// wider than 6 em. Section titles: 41.6px there: no word wider than 6.9 em.
// Phone nav row on a 360px phone: the logo (28px), the brand (Gilda 23px) and the button (Karla 600, 14px, .02em, 36px
// of padding) with their gaps in 328px.
const LIMITS = { heroEm: 6, heroLines: 4, heroWord: 6, sectionWord: 6.9, navRow: 234 };
function wrapLines(words, width, em) { let n = 1, w = 0; const sp = em(' '); for (const word of words) { const ww = em(word); if (w && w + sp + ww > width) { n++; w = ww; } else w += (w ? sp : 0) + ww; } return n; }

function validate(c, ctx) {
  const e = [];
  const em = (t) => ctx.textEm('display', String(t));
  const words = (s) => String(s).split(/\s+/).filter(Boolean);
  const G = c.price.guests;
  if (!(G.min < G.max && G.start >= G.min && G.start <= G.max)) e.push('price.guests: min below max, and start between them');
  if ((G.max - G.min) % 5 || (G.start - G.min) % 5) e.push('price.guests: the slider moves in fives, so min, max and start differ by fives');
  const seen = new Set();c.price.seasons.forEach((s, i) => s.months.forEach((mo) => { if (!Number.isInteger(mo)) e.push(`price.seasons.${i}.months: whole months, 0 (January) to 11`); else if (seen.has(mo)) e.push(`price.seasons.${i}.months: month ${mo} is already in another season`); seen.add(mo); }));
  if (!c.spaces.list.every((s) => s.ceremony || s.dinner || s.evening)) e.push('spaces.list: each space holds someone for a ceremony, dinner or the evening');
  // the big type
  const lines = wrapLines(words(c.hero.title), LIMITS.heroEm, em) + wrapLines(words(c.hero.titleEm), LIMITS.heroEm, em);
  if (lines > LIMITS.heroLines) e.push(`hero.title + hero.titleEm: the hero title takes ${lines} lines on a desktop (room for ${LIMITS.heroLines}); shorten one`);
  for (const p of ['hero.title', 'hero.titleEm']) for (const w of words(ctx.get(c, p))) { const x = em(w); if (x > LIMITS.heroWord) e.push(`${p}: the word "${w}" is too wide for a phone (${x.toFixed(2)} em, room for ${LIMITS.heroWord})`); }
  for (const p of ['spaces.title', 'spaces.titleEm', 'price.title', 'price.titleEm', 'day.title', 'day.titleEm']) for (const w of words(ctx.get(c, p))) { const x = em(w); if (x > LIMITS.sectionWord) e.push(`${p}: the word "${w}" is too wide for a phone (${x.toFixed(2)} em, room for ${LIMITS.sectionWord})`); }
  const nav = em(c.brand.name) * 23 + ctx.textEm('cta', c.nav.cta) * 14;
  if (nav > LIMITS.navRow) e.push(`brand.name + nav.cta: the phone nav row needs ${Math.round(nav)}px of text, a 360px phone has ${LIMITS.navRow}px`);
  return e;
}

module.exports = { derive, validate, LIMITS };
