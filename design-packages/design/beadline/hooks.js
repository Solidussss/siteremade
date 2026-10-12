// Beadline's design-specific build logic: values the template shows that are computed from the content, and the
// rules about opening hours the schema alone can't express. Runs at build time only.
'use strict';
const { FILTERS } = require('../../engine/template');
const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const hm = (s) => { const [h, m] = s.split(':').map(Number); return h * 60 + m; };
const isTime = (s) => /^([01]\d|2[0-3]):[0-5]\d$/.test(s || '');

// opening windows by weekday (Sunday first), in minutes; a close at or before the open runs past midnight
function week(c) {
  return DAYS.map((k) => { const w = c.hours.week[k]; if (!w) return null; const o = hm(w.open), cl = hm(w.close); return { o, c: cl > o ? cl : cl + 1440, label: w.label || '' }; });
}

function derive(c) {
  const fmt = (n) => c.locale.currency + n.toLocaleString(c.locale.locale);
  const pk = c.packages.items[c.packages.default.package], sz = c.packages.sizes[c.packages.default.size];
  const hours = Math.round(pk.hours * sz.hoursFactor * 2) / 2;
  const days = hours <= c.hours.sameDayMax ? 0 : Math.ceil(hours / c.hours.perDay) + (pk.cure ? 1 : 0);
  const js = FILTERS.js;
  return {
    // what the quote and ticket show before the page script recomputes them (the original shows the base price here)
    init: { price: fmt(pk.price), pkg: pk.name, size: sz.name, hours: `${hours} h`, days: days === 0 ? c.hours.sameDayLabel : days + (days > 1 ? ' days' : ' day') },
    logoLetter: c.business.short[0].toUpperCase(),
    footerCols: c.footer.columns.map((col) => ({ label: col.label, lines: col.lines.map((t, i) => ({ text: t, mono: i === 0 && !!col.monoFirst })) })),
    hoursJs: `{week:[${DAYS.map((k) => { const w = c.hours.week[k]; return w ? `[${js(w.open)},${js(w.close)},${js(w.label || '')}]` : 'null'; }).join(',')}],perDay:${c.hours.perDay},short:${c.hours.sameDayMax},ready:${js(c.hours.ready)},readyWord:${js(c.hours.readyWord)},sameDay:${js(c.hours.sameDayLabel)}}`,
  };
}

function validate(c) {
  const e = [], H = c.hours || {};
  if (!H.week) return ['hours.week: missing'];
  for (const k of DAYS) {
    const w = H.week[k];
    if (w === undefined) e.push(`hours.week.${k}: missing (use null for closed)`);
    else if (w && (!isTime(w.open) || !isTime(w.close))) e.push(`hours.week.${k}: open and close as HH:MM`);
    else if (w && w.label && [...w.label].length > 9) e.push(`hours.week.${k}.label: at most 9 characters`);
    else if (w && w.open === w.close) e.push(`hours.week.${k}: open and close are the same`);
  }
  if (!isTime(H.ready)) e.push('hours.ready: HH:MM');
  if (e.length) return e;
  const W = week(c);
  if (!W.some(Boolean)) return ['hours.week: no open day'];
  const longest = Math.max(...W.filter(Boolean).map((w) => w.c - w.o));
  if (H.perDay * 60 > longest) e.push(`hours.perDay: ${H.perDay} h is longer than the longest opening day (${longest / 60} h)`);
  // every slot has to be bookable on at least one open day, or it would always show as taken
  c.booking.slots.forEach((s, i) => {
    if (!isTime(s.time)) return;
    const ok = W.some((w, day) => {
      if (!w) return false;
      if (s.kind === 'keysafe') return !!W[(day + 1) % 7];
      let t = hm(s.time); if (w.c > 1440 && t < w.o) t += 1440;
      return s.kind === 'short' ? t >= w.o && t + H.sameDayMax * 60 <= w.c : t >= w.o && t < w.c;
    });
    if (!ok) e.push(`booking.slots.${i}: ${s.time} (${s.kind}) is never inside the opening hours${s.kind === 'short' ? ` with ${H.sameDayMax} h to spare` : ''}`);
  });
  return e;
}

module.exports = { derive, validate };
