// Saltglass's design-specific build logic: the visit reasons, the price list and opening hours as the page script's
// REASONS, PRICES and HOURS, the hours table, team list and FAQ as the page shows them, and the rules the schema
// can't express. Runs at build time only.
'use strict';
const { FILTERS } = require('../../engine/template');
const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const GROUPS = [['preventive', 'Preventive'], ['basic', 'Basic'], ['major', 'Major'], ['cosmetic', 'Cosmetic']];
const isTime = (s) => /^([01]\d|2[0-3]):(00|30)$/.test(s || '') || s === '24:00';
const hr = (s) => { const [h, m] = s.split(':').map(Number); return h + m / 60; };
const num = (v) => String(+v.toFixed(4));
const jsd = FILTERS.jsd, esc = FILTERS.esc, rich = FILTERS.rich;
// 7:30 am, 6:00 pm (the hours table's style)
const clock = (h) => { const hh = Math.floor(h), mm = Math.round((h - hh) * 60); return `${((hh + 11) % 12) + 1}:${String(mm).padStart(2, '0')} ${hh < 12 || hh === 24 ? 'am' : 'pm'}`; };

function hoursTable(c) {
  const order = [1, 2, 3, 4, 5, 6, 0], text = (d) => { const w = c.hours[DAYS[d]]; return w ? `${clock(hr(w.open))} – ${clock(hr(w.close))}` : 'Closed'; };
  const rows = [];
  for (const d of order) { const t = text(d), last = rows[rows.length - 1]; if (last && last.t === t && d !== 0) last.days.push(d); else rows.push({ t, days: [d] }); }
  return rows.map((r) => { const dd = r.days.join(','), label = r.days.length === 1 ? FULL[r.days[0]] : `${SHORT[r.days[0]]} – ${SHORT[r.days[r.days.length - 1]]}`; return `            <dt data-d="${dd}">${label}</dt><dd data-d="${dd}">${r.t}</dd>`; }).join('\n');
}
const initials = (name) => { const w = name.split(',')[0].replace(/^(Dr|Mr|Mrs|Ms|Mx|Prof)\.?\s+/i, '').trim().split(/\s+/); return (w[0][0] + (w.length > 1 ? w[w.length - 1][0] : '')).toUpperCase(); };

function derive(c) {
  const money = (n) => c.locale.currency + Math.round(n).toLocaleString(c.locale.locale);
  return {
    reasonsJs: c.booking.reasons.map((r, i) => `  {id:${jsd(r.id || 'r' + i)},name:${jsd(r.name)},min:${r.minutes},note:${jsd(r.note)},with:${jsd(r.with)}}`).join(',\n'),
    hoursJs: '{' + DAYS.map((d, i) => [d, i]).filter(([d]) => c.hours[d]).map(([d, i]) => `${i}:[${num(hr(c.hours[d].open))},${num(hr(c.hours[d].close))}]`).join(',') + '}',
    pricesJs: GROUPS.map(([k, g], gi) => `  {g:${jsd(g)},items:[\n${c.prices[k].map((it) => `    [${jsd(it.name)},${jsd(it.note)},${it.price}]`).join(',\n')}]}${gi < GROUPS.length - 1 ? ',' : ''}`).join('\n'),
    yearText: money(c.prices.year),
    zeroText: c.locale.currency + '0',
    hoursHtml: hoursTable(c),
    teamHtml: c.team.map((t) => `            <li><span class="mono-av">${esc(initials(t.name))}</span><div><b>${esc(t.name)}</b><span>${esc(t.role)}</span></div></li>`).join('\n'),
    faqHtml: c.faq.items.map((f, i) => {
      const open = i === 0 ? ' open' : '', head = `        <details${open}>\n          <summary>${esc(f.q)}<i aria-hidden="true"></i></summary>\n`;
      const body = f.a.length === 1 ? `          <div class="faq-body"><p>${rich(f.a[0])}</p></div>\n` : `          <div class="faq-body">\n${f.a.map((p) => `            <p>${rich(p)}</p>`).join('\n')}\n          </div>\n`;
      return head + body + '        </details>';
    }).join('\n'),
  };
}

const LIMITS = { navRow: 210 };

function validate(c, ctx) {
  const e = [];
  const H = c.hours || {};
  for (const d of DAYS) {
    const w = H[d];
    if (w === undefined) { e.push(`hours.${d}: missing (use null for closed)`); continue; }
    if (w === null) continue;
    if (!isTime(w.open) || !isTime(w.close)) e.push(`hours.${d}: open and close as HH:MM on the hour or half hour (24-hour)`);
    else if (hr(w.close) - hr(w.open) < 1.5) e.push(`hours.${d}: open at least 90 minutes`);
  }
  if (!DAYS.some((d) => H[d])) e.push('hours: no open day');
  const ids = c.booking.reasons.map((r) => r.id).filter(Boolean);
  if (ids.some((id) => !/^[a-z][a-z0-9]{0,9}$/.test(id))) e.push('booking.reasons.*.id: lowercase letters and digits (or leave it out)');
  if (new Set(ids).size !== ids.length) e.push('booking.reasons.*.id: ids must be different');
  c.booking.reasons.forEach((r, i) => { if (r.minutes % 5) e.push(`booking.reasons.${i}.minutes: a multiple of 5`); });
  for (const [k] of GROUPS) (c.prices[k] || []).forEach((it, i) => { if (!Number.isInteger(it.price)) e.push(`prices.${k}.${i}.price: whole numbers (the list rounds to whole amounts)`); });
  if (!Number.isInteger(c.prices.year)) e.push('prices.year: a whole number');
  const nav = ctx.textEm('brand', c.business.short) * 18 + ctx.textEm('cta', c.nav.cta) * 14;
  if (nav > LIMITS.navRow) e.push(`business.short + nav.cta: the phone nav row needs ${Math.round(nav)}px of text, a 360px phone has ${LIMITS.navRow}px ("${c.business.short}" + "${c.nav.cta}")`);
  return e;
}

module.exports = { derive, validate, LIMITS };
