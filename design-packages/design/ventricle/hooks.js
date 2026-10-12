// Ventricle's design-specific build logic: the class list and weekly timetable as the page script's CL and WEEK,
// opening hours, the yearly-billing numbers, and the rules the schema can't express (timetable, hours, the brand
// colour against the plate colours). Runs at build time only.
'use strict';
const { FILTERS } = require('../../engine/template');
const { rgbHsl, hexRgb } = require('../../engine/colour');
const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const MON_FIRST = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const isTime = (s) => /^([01]\d|2[0-3]):[0-5]\d$/.test(s || '') || s === '24:00';
const hr = (s) => { const [h, m] = s.split(':').map(Number); return h + m / 60; };
const num = (v) => String(+v.toFixed(4));
const key = (cl, i) => cl.id || 'c' + i;

function derive(c) {
  const js = FILTERS.js, S = c.schedule;
  const n = c.join.freeMonths;
  return {
    spotsExpr: S.capacity >= 14 ? '3+((d*7+i*5+3)%10)' : `Math.max(1,Math.round((3+((d*7+i*5+3)%10))*${S.capacity - 1}/13))`,
    clJs: S.classes.map((k, i) => ` ${key(k, i)}:{n:${js(k.name)},z:${k.zone},rpe:${js(k.rpe)},d:${k.minutes},f:${js(k.format)},c:${js(k.coach)}}`).join(',\n'),
    weekJs: MON_FIRST.map((d) => ` [${S.week[d].map(([t, ci]) => `[${js(t)},${js(key(S.classes[ci], ci))}]`).join(',')}]`).join(',\n'),
    trialClass: S.classes[S.trialClass].name,
    hoursJs: '[' + DAYS.map((d) => { const w = c.hours.week[d]; return w ? `[${num(hr(w.open))},${num(hr(w.close))}]` : 'null'; }).join(',') + ']',
    payMonths: 12 - n,
    freeLabel: n === 1 ? '1 month free' : `${n} months free`,
  };
}

// The brand colour is also zone 5 and the 25 kg plate, so it has to read apart from the other plate colours.
const PLATES = [['blue', '#2463d6'], ['yellow', '#f3c01c'], ['green', '#169a4b']];
// Phone (360px): the highlighted tier's header holds its two-line name (44px condensed type) and the tag (10.5px mono,
// about 7.1px a letter plus padding) in 284px; measured in WebKit, the estimate runs 8px short, so 274 is the limit.
const LIMITS = { hueGap: 35, popularHeader: 274 };

function validate(c, ctx) {
  const e = [], S = c.schedule;
  // classes and the timetable
  const ids = S.classes.map((k) => k.id).filter(Boolean);
  if (ids.some((id) => !/^[a-z][a-z0-9]{0,7}$/.test(id))) e.push('schedule.classes.*.id: lowercase letters and digits (or leave it out)');
  if (new Set(ids).size !== ids.length) e.push('schedule.classes.*.id: ids must be different');
  if (!Number.isInteger(S.trialClass) || !S.classes[S.trialClass]) e.push(`schedule.trialClass: the index of a class in schedule.classes (0-${S.classes.length - 1})`);
  let total = 0;
  for (const d of MON_FIRST) {
    const day = S.week[d];
    if (!Array.isArray(day)) { e.push(`schedule.week.${d}: missing (use [] for no classes)`); continue; }
    if (day.length > 8) e.push(`schedule.week.${d}: at most 8 classes a day`);
    day.forEach((slot, i) => {
      if (!Array.isArray(slot) || slot.length !== 2) { e.push(`schedule.week.${d}.${i}: ["HH:MM", class index]`); return; }
      const [t, ci] = slot;
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(t)) e.push(`schedule.week.${d}.${i}: time as HH:MM (24-hour)`);
      if (!Number.isInteger(ci) || !S.classes[ci]) e.push(`schedule.week.${d}.${i}: class ${ci} is not in schedule.classes`);
      if (i && t <= day[i - 1][0]) e.push(`schedule.week.${d}: times in order, earliest first`);
    });
    total += day.length;
  }
  if (!total) e.push('schedule.week: no classes at all');
  S.classes.forEach((k, i) => { if (!S.classes.length || !MON_FIRST.some((d) => (S.week[d] || []).some((s) => s[1] === i))) e.push(`schedule.classes.${i}: "${k.name}" is never on the timetable`); });
  // opening hours
  const H = c.hours.week || {};
  for (const d of DAYS) {
    const w = H[d];
    if (w === undefined) { e.push(`hours.week.${d}: missing (use null for closed)`); continue; }
    if (w === null) continue;
    if (!isTime(w.open) || !isTime(w.close)) e.push(`hours.week.${d}: open and close as HH:MM (24-hour)`);
    else if (hr(w.close) <= hr(w.open)) e.push(`hours.week.${d}: closes before it opens (closing after midnight is not supported)`);
  }
  if (!DAYS.some((d) => H[d])) e.push('hours.week: no open day');
  // prices and wording
  c.join.tiers.forEach((t, i) => { if (!Number.isInteger(t.price)) e.push(`join.tiers.${i}.price: whole numbers only`); });
  if (c.join.tiers.some((t, i) => i && t.price <= c.join.tiers[i - 1].price)) e.push('join.tiers: cheapest first, each dearer than the one before');
  if (c.business.wordmark !== c.business.wordmark.toUpperCase()) e.push('business.wordmark: write it in capitals');
  const em = (t) => ctx.textEm('disp', String(t).toUpperCase());
  const mid = c.join.tiers[1], head = Math.max(em(mid.nameA), em(mid.nameB)) * 44 + [...c.join.popularTag].length * 7.14 + 24;
  if (head > LIMITS.popularHeader) e.push(`join.tiers.1 + join.popularTag: the highlighted plan's name and tag need ${Math.round(head)}px on a 360px phone, there is ${LIMITS.popularHeader}px; shorten the name or the tag`);
  // brand colour vs the plate colours
  const [h, s] = rgbHsl(...hexRgb(c.theme.accent));
  for (const [name, hex] of PLATES) {
    const ph = rgbHsl(...hexRgb(hex))[0], gap = Math.min(Math.abs(h - ph), 360 - Math.abs(h - ph));
    if (s > 0.15 && gap < LIMITS.hueGap) e.push(`theme.accent: too close to the ${name} plate colour (hue ${Math.round(gap)}° apart, needs ${LIMITS.hueGap}°); the brand colour is also zone 5 and the 25 kg plate`);
  }
  return e;
}

module.exports = { derive, validate, LIMITS };
