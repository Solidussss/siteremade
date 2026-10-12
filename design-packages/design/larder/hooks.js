// Larder & Lamp's design-specific build logic: the page scripts' data written from the content (the dinner's six
// moments and the plates it serves, the menu, the tables, the hours and the map) and the rules the schema can't express
// (table sizes per spot, prices, hours, widths of the big type). Runs at build time only.
'use strict';
const { FILTERS } = require('../../engine/template');
const js = FILTERS.js;

const WINDOWS = ['[0,.14]', '[.14,.3]', '[.3,.48]', '[.48,.68]', '[.68,.84]', '[.84,1]'];
const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const hr = (s) => { const [h, m] = s.split(':').map(Number); return +(h + m / 60).toFixed(4); };
const num = (n) => String(+n.toFixed(2));
// the plan's nine spots: round (2-4), square (2-4) or long (4-8)
const SPOT = ['round', 'round', 'round', 'square', 'square', 'long', 'round', 'square', 'long'];

function derive(c) {
  const H = c.visit.hours || {};
  const M = c.visit.map;
  return {
    tel: c.contact.phone.replace(/[^\d+]/g, ''),
    businessSaid: c.business.name.replace(/\s*&\s*/g, ' and '),
    brandSaid: c.brand.name.replace(/\s*&\s*/g, ' and '),
    stagesJs: c.stages.map((s, i) => ` {n:${js(s.n)},c:${js(s.c)},when:${js(s.when)},w:${WINDOWS[i]}}`).join(',\n'),
    dishesJs: c.dishes.map((pair) => ` [${pair.map((d) => `{kind:${js(d.kind)},col:${js(d.col.toUpperCase())}}`).join(',')}]`).join(',\n'),
    dinnerJs: `const TABLE=${c.dinner.table}, MINUTES=${c.dinner.minutes}, WINE=${c.dinner.wine}, COVERS=[${c.dinner.covers[0]},${c.dinner.covers[1]}];`,
    menuJs: c.menu.courses.map((g) => ` {c:${js(g.c)},items:[\n${g.items.map((it) => `  {n:${js(it.n)},d:${js(it.d)},p:${num(it.p)},t:[${it.t.map(js).join(',')}]}`).join(',\n')}]}`).join(',\n'),
    seatsJs: c.room.seats.join(','),
    hoursJs: '[' + DAYS.map((d) => (H[d] ? `[${hr(H[d].open)},${hr(H[d].close)}]` : 'null')).join(',') + ']',
    mapJs: `{street:${js(M.street)},cross:${js(M.cross)},side:${js(M.side)},water:${M.water ? js(M.water) : 'null'},walk:${js(M.walk)}}`,
  };
}

// Widths of the big display type (Young Serif 400), in em (metrics.json).
// Hero title: 1440x900 desktop, 68.4px (7.6vh) in a 580px column, 8.48 em; title and second line together may take
// four lines before the copy reaches the ticket (checked 1280x720 to 1920x1080). Phone: 41.6px in 288px on a 320px
// phone: no word wider than 6.9 em. Section titles: 38.4px there: no word wider than 7.5 em.
// Phone nav row on a 360px phone: 328px less the mark (24px) and two gaps (10px, 22px) for the brand (20px) and the button (14px Work Sans 600 + 32px).
const LIMITS = { heroEm: 8.48, heroLines: 4, heroWord: 6.9, sectionWord: 7.5, navRow: 272 };
function wrapLines(words, width, em) { let n = 1, w = 0; const sp = em(' '); for (const word of words) { const ww = em(word); if (w && w + sp + ww > width) { n++; w = ww; } else w += (w ? sp : 0) + ww; } return n; }

function validate(c, ctx) {
  const e = [];
  const em = (t) => ctx.textEm('display', String(t));
  const words = (s) => String(s).split(/\s+/).filter(Boolean);
  // the plan's tables
  c.room.seats.forEach((s, i) => { const k = SPOT[i]; if (!Number.isInteger(s)) e.push(`room.seats.${i}: a whole number`); else if (k === 'long' ? s < 4 : s > 4) e.push(`room.seats.${i}: table ${i + 1} is ${k} (${k === 'long' ? '4-8' : '2-4'} seats)`); });
  // prices to the penny; the dinner's numbers
  c.menu.courses.forEach((g, gi) => g.items.forEach((it, ii) => { if (Math.round(it.p * 100) !== +(it.p * 100).toFixed(6)) e.push(`menu.courses.${gi}.items.${ii}.p: to the penny`); if (new Set(it.t).size !== it.t.length) e.push(`menu.courses.${gi}.items.${ii}.t: a tag twice`); }));
  for (const k of ['table', 'minutes', 'wine']) if (!Number.isInteger(c.dinner[k])) e.push(`dinner.${k}: a whole number`);
  if (!(c.dinner.covers[0] <= c.dinner.covers[1])) e.push('dinner.covers: covers at the start of the evening, then at the end (no fewer)');
  // opening hours: quarter hours, open before close, at least one night
  const H = c.visit.hours;
  if (!H) e.push('visit.hours: the opening hours');
  else {
    if (!DAYS.some((d) => H[d])) e.push('visit.hours: no open day');
    for (const d of DAYS) if (H[d]) { for (const k of ['open', 'close']) if (!/:(00|15|30|45)$/.test(H[d][k] || '')) e.push(`visit.hours.${d}.${k}: in quarter hours`); if (hr(H[d].close) - hr(H[d].open) < 1.5) e.push(`visit.hours.${d}: open at least an hour and a half (the last booking is an hour before closing)`); }
  }
  // the big type
  const lines = wrapLines(words(c.hero.title), LIMITS.heroEm, em) + wrapLines(words(c.hero.titleEm), LIMITS.heroEm, em);
  if (lines > LIMITS.heroLines) e.push(`hero.title + hero.titleEm: the hero title takes ${lines} lines on a desktop (room for ${LIMITS.heroLines}); shorten one`);
  for (const p of ['hero.title', 'hero.titleEm']) for (const w of words(ctx.get(c, p))) { const x = em(w); if (x > LIMITS.heroWord) e.push(`${p}: the word "${w}" is too wide for a phone (${x.toFixed(2)} em, room for ${LIMITS.heroWord})`); }
  for (const p of ['menu.title', 'room.title', 'visit.title']) for (const w of words(ctx.get(c, p))) { const x = em(w); if (x > LIMITS.sectionWord) e.push(`${p}: the word "${w}" is too wide for a phone (${x.toFixed(2)} em, room for ${LIMITS.sectionWord})`); }
  const nav = em(c.brand.name) * 20 + ctx.textEm('cta', c.nav.cta) * 14 + 32;
  if (nav > LIMITS.navRow) e.push(`brand.name + nav.cta: the phone nav row needs ${Math.round(nav)}px, a 360px phone has ${LIMITS.navRow}px ("${c.brand.name}" + "${c.nav.cta}")`);
  return e;
}

module.exports = { derive, validate, LIMITS };
