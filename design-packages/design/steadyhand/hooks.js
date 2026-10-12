// Steady Hand's design-specific build logic: values the template shows that come from the content (the price list
// as the page script's MENU, opening hours for the booking board, the hero's chair label) and the rules the schema
// can't express (hours, prices, widths of the big type). Runs at build time only.
'use strict';
const { FILTERS } = require('../../engine/template');
const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const isTime = (s) => /^([01]\d|2[0-3]):[0-5]\d$/.test(s || '') || s === '24:00';
const hr = (s) => { const [h, m] = s.split(':').map(Number); return h + m / 60; };
const num = (v) => String(+v.toFixed(4));

function derive(c) {
  const js = FILTERS.js;
  const first = c.menu.groups[0].items[0];
  let k = 0;
  const lines = [];
  c.menu.groups.forEach((g, gi) => {
    lines.push(`  {h:${js(g.name)}},`);
    g.items.forEach((it, i) => {
      k++;
      lines.push(`  {id:${js(it.id || 'm' + k)},n:${js(it.name)},d:${js(it.desc)},min:${it.minutes},p:${it.price}${gi === 0 && i === 0 ? ',on:true' : ''}},`);
    });
  });
  const b0 = c.booking.barbers[0];
  return {
    menuJs: lines.join('\n'),
    first: { name: first.name, minutes: first.minutes, price: first.price },
    heroChair: `Chair ${b0.chair} · ${b0.name}`,
    hoursJs: '[' + DAYS.map((d) => { const w = c.hours[d]; return w ? `[${num(hr(w.open))},${num(hr(w.close))}]` : 'null'; }).join(',') + ']',
  };
}

// Widths of the big display type, in em of the chosen font (metrics.json, measured in capitals as the page shows it).
// Phone: the hero title is 14.4vw (54px on a 375px phone, 46px at 320) in the full-width column; each of its two lines
// must fit on one line there, so the head drawing below keeps its room. Section titles (52px) may wrap, but no single
// word may be wider than a 320px phone (288px). Desktop: the title column is min(470px, 35vw) for type up to 116px,
// 4.3 em at 1440x900, the tightest case (wider screens are taller too); the original wraps to 3 lines there, and a 4th
// runs the copy into the HUD (seen in the stress test), so the two lines may take at most 3. Calibrated in the stress test.
const LIMITS = { heroLine: 6.1, heroDesktopEm: 4.3, heroDesktopLines: 3, sectionWord: 5.4, navRow: 228 };
// lines a text wraps to in a column `width` em wide (greedy, as the browser does)
function wrapLines(words, width, em) { let n = 1, w = 0; const sp = em(' '); for (const word of words) { const ww = em(word); if (w && w + sp + ww > width) { n++; w = ww; } else w += (w ? sp : 0) + ww; } return n; }

function validate(c, ctx) {
  const e = [];
  const em = (t) => ctx.textEm('display', String(t).replace(/\*/g, '').toUpperCase());
  // opening hours
  const H = c.hours || {};
  for (const d of DAYS) {
    const w = H[d];
    if (w === undefined) { e.push(`hours.${d}: missing (use null for closed)`); continue; }
    if (w === null) continue;
    if (!isTime(w.open) || !isTime(w.close)) e.push(`hours.${d}: open and close as HH:MM (24-hour)`);
    else if (hr(w.close) <= hr(w.open)) e.push(`hours.${d}: closes before it opens (closing after midnight is not supported)`);
  }
  if (!DAYS.some((d) => H[d])) e.push('hours: no open day');
  // prices: whole numbers, as the page adds and shows them
  const prices = [['cut.fade', c.cut.fade], ['cut.taper', c.cut.taper], ['cut.part', c.cut.part], ['cut.textured', c.cut.textured], ['cut.buzzOff', c.cut.buzzOff]];
  c.menu.groups.forEach((g, gi) => g.items.forEach((it, i) => prices.push([`menu.groups.${gi}.items.${i}.price`, it.price])));
  for (const [p, v] of prices) if (!Number.isInteger(v)) e.push(`${p}: whole numbers only (${v})`);
  if (c.cut.buzzOff >= c.cut.fade) e.push('cut.buzzOff: the buzz-cut discount must be less than the fade price');
  // the menu
  const n = c.menu.groups.reduce((a, g) => a + g.items.length, 0);
  if (n > 14) e.push(`menu.groups: ${n} items in all (at most 14)`);
  const ids = c.menu.groups.flatMap((g) => g.items.map((it) => it.id)).filter(Boolean);
  if (ids.some((id) => !/^[a-z][a-z0-9]{0,11}$/.test(id))) e.push('menu.groups.*.items.*.id: lowercase letters and digits (or leave it out)');
  if (new Set(ids).size !== ids.length) e.push('menu.groups.*.items.*.id: ids must be different');
  // barbers
  const chairs = c.booking.barbers.map((b) => b.chair);
  if (new Set(chairs).size !== chairs.length) e.push('booking.barbers.*.chair: two barbers on the same chair');
  if (!/^[A-Z]{2,4}$/.test(c.booking.refPrefix)) e.push('booking.refPrefix: 2-4 capital letters');
  if (c.business.wordmark !== c.business.wordmark.toUpperCase()) e.push('business.wordmark: write it in capitals');
  // big type widths
  for (const p of ['hero.line1', 'hero.line2']) { const w = em(ctx.get(c, p)); if (w > LIMITS.heroLine) e.push(`${p}: too wide for the hero title on a phone (${w.toFixed(2)} em, room for ${LIMITS.heroLine})`); }
  const desk = ['hero.line1', 'hero.line2'].reduce((a, p) => a + wrapLines(String(ctx.get(c, p)).replace(/\*/g, '').split(/\s+/), LIMITS.heroDesktopEm, em), 0);
  if (desk > LIMITS.heroDesktopLines) e.push(`hero.line1 + hero.line2: the hero title wraps to ${desk} lines on a wide desktop (room for ${LIMITS.heroDesktopLines}); shorten one line`);
  for (const p of ['cut.titleA', 'cut.titleB', 'menu.title', 'booking.titleA', 'booking.titleB']) {
    const v = ctx.get(c, p);
    for (const word of v.split(/\s+/)) { const w = em(word); if (w > LIMITS.sectionWord) e.push(`${p}: the word "${word}" is too wide for a phone (${w.toFixed(2)} em, room for ${LIMITS.sectionWord})`); }
  }
  // phone nav row: pole + brand (20px, .06em tracking) + sound button + booking button (14px, 600) on a 375px phone
  const brand = (em(c.business.wordmark) + 0.05 * [...c.business.wordmark].length) * 20, cta = ctx.textEm('cta', c.nav.cta) * 14;
  if (brand + cta > LIMITS.navRow) e.push(`business.wordmark + nav.cta: the phone nav row needs ${Math.round(brand + cta)}px of text, a 360px phone has ${LIMITS.navRow}px ("${c.business.wordmark}" + "${c.nav.cta}")`);
  return e;
}

module.exports = { derive, validate, LIMITS };
