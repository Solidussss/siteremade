// Nube's design-specific build logic: values the template shows that come from the content (prices as the page
// formats them, opening hours for the visit card) and the rules the schema can't express (hours, prices, widths of
// the stretching headings and the phone nav row). Runs at build time only.
'use strict';
const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const isTime = (s) => /^([01]\d|2[0-3]):[0-5]\d$/.test(s || '') || s === '24:00';
const hr = (s) => { const [h, m] = s.split(':').map(Number); return h + m / 60; };
const num = (v) => String(+v.toFixed(4));

function derive(c) {
  const money = (n) => c.locale.currency + n.toFixed(2);
  return {
    price0: money(c.drinks[0].price),
    price2: money(c.drinks[2].price),
    milkExtra: money(c.order.milkExtra),
    // numbers as the page script writes them (.5, not 0.5)
    sizeStepJs: num(c.order.sizeStep).replace(/^0\./, '.'),
    milkExtraJs: num(c.order.milkExtra).replace(/^0\./, '.'),
    hoursJs: '[' + DAYS.map((d) => { const w = c.hours[d]; return w ? `[${num(hr(w.open))}, ${num(hr(w.close))}]` : 'null'; }).join(', ') + ']',
  };
}

// Headings stretch to "wdth" 110 as they scroll in (measured there, metrics.json "heading"). No single word may be
// wider than its column: the grind and order titles get 7 em on a phone (44px type in a 328px column at 360px; on
// desktop their grid column widens to fit the word), the menu title about 6 em (1fr of 3.1fr at 4.6vw, a column that
// can't widen). Phone nav: cloud logo + name (26px) + order button (15px); measured in Edge and WebKit, the button
// wraps past 232px of text on a 360px phone. Calibrated with scratch/nube-calibrate.js.
const LIMITS = { word: 7.0, menuWord: 5.8, navRow: 228 };

function validate(c, ctx) {
  const e = [];
  const H = c.hours || {};
  for (const d of DAYS) {
    const w = H[d];
    if (w === undefined) { e.push(`hours.${d}: missing (use null for closed)`); continue; }
    if (w === null) continue;
    if (!isTime(w.open) || !isTime(w.close)) e.push(`hours.${d}: open and close as HH:MM (24-hour)`);
    else if (hr(w.close) <= hr(w.open)) e.push(`hours.${d}: closes before it opens (closing after midnight is not supported)`);
  }
  if (!DAYS.some((d) => H[d])) e.push('hours: no open day');
  const cents = (v) => Math.abs(v * 100 - Math.round(v * 100)) < 1e-6;
  c.drinks.forEach((d, i) => { if (!cents(d.price)) e.push(`drinks.${i}.price: at most two decimals`); });
  for (const p of ['order.sizeStep', 'order.milkExtra']) if (!cents(ctx.get(c, p))) e.push(`${p}: at most two decimals`);
  const em = (m, t) => ctx.textEm(m, String(t));
  for (const [p, lim] of [['grind.titleA', LIMITS.word], ['grind.titleB', LIMITS.word], ['order.titleA', LIMITS.word], ['order.titleB', LIMITS.word], ['menu.titleA', LIMITS.menuWord], ['menu.titleB', LIMITS.menuWord]]) {
    for (const word of String(ctx.get(c, p)).split(/\s+/)) { const w = em('heading', word); if (w > lim) e.push(`${p}: the word "${word}" is too wide for its column (${w.toFixed(2)} em, room for ${lim})`); }
  }
  const nav = em('logo', c.business.wordmark) * 26 + em('button', c.nav.cta) * 15;
  if (nav > LIMITS.navRow) e.push(`business.wordmark + nav.cta: the phone nav row needs ${Math.round(nav)}px of text, a 360px phone has ${LIMITS.navRow}px ("${c.business.wordmark}" + "${c.nav.cta}")`);
  return e;
}

module.exports = { derive, validate, LIMITS };
