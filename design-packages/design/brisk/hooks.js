// Brisk's design-specific build logic: the page scripts' data written from the content (the visit's six steps and the
// four rooms' tasks, types of clean, how-often discounts, extras, checklists, promises, start times and closed days) and
// the rules the schema can't express (which types of clean an extra or task belongs to, the one-off option, the
// steppers' starting values, widths of the big type). Runs at build time only.
'use strict';
const { FILTERS } = require('../../engine/template');
const js = FILTERS.js;

const WINDOWS = ['[0,.12]', '[.12,.32]', '[.32,.5]', '[.5,.68]', '[.68,.86]', '[.86,1]'];
const list = (a) => a.map(js).join(',');
const num = (n) => String(+(+n).toFixed(2)).replace(/^0\./, '.');
const ints = (a) => a.map((x) => String(x)).join(',');

function derive(c) {
  return {
    tel: c.contact.phone.replace(/[^\d+]/g, ''),
    businessSaid: c.business.name.replace(/\s*&\s*/g, ' and '),
    brandSaid: c.brand.name.replace(/\s*&\s*/g, ' and '),
    roomCount: c.clean.rooms.length,
    stagesJs: c.stages.map((s, i) => ` {n:${js(s.n)},c:${js(s.c)},clock:${js(s.clock)},w:${WINDOWS[i]}}`).join(',\n'),
    roomsJs: c.clean.rooms.map((r) => ` {n:${js(r.n)},tasks:[${list(r.tasks)}]}`).join(',\n'),
    kindsJs: c.quote.kinds.map((k) => ` {n:${js(k.n)},base:${num(k.base)},bed:${num(k.bed)},bath:${num(k.bath)},mins:[${ints(k.mins)}],repeat:${k.repeat}}`).join(',\n'),
    oftenJs: c.quote.often.map((o) => `{n:${js(o.n)},off:${num(o.off)}}`).join(','),
    extrasJs: c.quote.extras.map((x) => ` {n:${js(x.n)},p:${num(x.p)},m:${x.m},in:[${ints(x.in)}]}`).join(',\n'),
    checklistJs: c.included.checklist.map((r) => ` {n:${js(r.n)},tasks:[${r.tasks.map((t) => `{t:${js(t.t)},in:[${ints(t.in)}]}`).join(',')}]}`).join(',\n'),
    promisesJs: c.included.promises.map((p) => ` {b:${js(p.b)},s:${js(p.s)}}`).join(',\n'),
    timesJs: list(c.book.times),
    closedJs: ints(c.book.closed),
  };
}

// Widths of the big display type (Lexend 600, -.025em), in em (metrics.json).
// Hero title: 1440x900 desktop, 73.8px (8.2vh) in a 520px column, 7.05 em; the two lines together may take four lines
// before the copy reaches the visit card (checked 1280x720 to 1920x1080). Phone: 41.6px in 288px on a 320px phone: no
// word wider than 6.9 em. Section titles: 36.8px there: no word wider than 7.8 em.
// Phone nav row on a 360px phone: the logo (28px), the brand (Lexend 700, 19px) and the button (Nunito Sans 800, 14px,
// 34px of padding) with their gaps in 328px.
const LIMITS = { heroEm: 7.05, heroLines: 4, heroWord: 6.9, sectionWord: 7.8, navRow: 236 };
function wrapLines(words, width, em) { let n = 1, w = 0; const sp = em(' '); for (const word of words) { const ww = em(word); if (w && w + sp + ww > width) { n++; w = ww; } else w += (w ? sp : 0) + ww; } return n; }

function validate(c, ctx) {
  const e = [];
  const em = (t) => ctx.textEm('display', String(t));
  const words = (s) => String(s).split(/\s+/).filter(Boolean);
  const K = c.quote.kinds.length;
  const kindsOk = (a, where) => { if (a.some((k) => !Number.isInteger(k) || k < 0 || k >= K)) e.push(`${where}: type-of-clean numbers from 0 to ${K - 1} (the order of quote.kinds)`); if (new Set(a).size !== a.length) e.push(`${where}: each type of clean once`); };
  c.quote.kinds.forEach((k, i) => { if (k.mins.some((m) => !Number.isInteger(m))) e.push(`quote.kinds.${i}.mins: whole minutes`); });
  const last = c.quote.often[c.quote.often.length - 1];
  if (last.off !== 0) e.push('quote.often: the last option is the one-off clean, with no discount (off 0)');
  c.quote.often.forEach((o, i) => { if (!Number.isInteger(o.off)) e.push(`quote.often.${i}.off: a whole percentage`); });
  if (c.quote.often.length < 2 && c.quote.kinds.some((k) => k.repeat)) e.push('quote.often: a regular clean needs at least one repeat option before the one-off');
  c.quote.extras.forEach((x, i) => { kindsOk(x.in, `quote.extras.${i}.in`); if (!Number.isInteger(x.m)) e.push(`quote.extras.${i}.m: whole minutes`); });
  c.included.checklist.forEach((r, i) => r.tasks.forEach((t, j) => kindsOk(t.in, `included.checklist.${i}.tasks.${j}.in`)));
  // the steppers start on a 2-bedroom, 1-bathroom home
  const { bed, bath } = c.quote.limits;
  if (!(bed[0] <= 2 && bed[1] >= 2)) e.push('quote.limits.bed: the range must include 2 (the calculator starts on 2 bedrooms)');
  if (!(bath[0] <= 1 && bath[1] >= 1)) e.push('quote.limits.bath: the range must include 1 (the calculator starts on 1 bathroom)');
  if (bed[0] > bed[1] || bath[0] > bath[1]) e.push('quote.limits: low, then high');
  if (c.book.closed.some((d) => !Number.isInteger(d) || d < 0 || d > 6) || new Set(c.book.closed).size !== c.book.closed.length) e.push('book.closed: days of the week, 0 (Sunday) to 6 (Saturday), each once');
  if (!Number.isInteger(c.clean.minutes)) e.push('clean.minutes: whole minutes');
  // the big type
  const lines = wrapLines(words(c.hero.title), LIMITS.heroEm, em) + wrapLines(words(c.hero.titleEm), LIMITS.heroEm, em);
  if (lines > LIMITS.heroLines) e.push(`hero.title + hero.titleEm: the hero title takes ${lines} lines on a desktop (room for ${LIMITS.heroLines}); shorten one`);
  for (const p of ['hero.title', 'hero.titleEm']) for (const w of words(ctx.get(c, p))) { const x = em(w); if (x > LIMITS.heroWord) e.push(`${p}: the word "${w}" is too wide for a phone (${x.toFixed(2)} em, room for ${LIMITS.heroWord})`); }
  for (const p of ['quote.title', 'included.title', 'book.title']) for (const w of words(ctx.get(c, p))) { const x = em(w); if (x > LIMITS.sectionWord) e.push(`${p}: the word "${w}" is too wide for a phone (${x.toFixed(2)} em, room for ${LIMITS.sectionWord})`); }
  const nav = ctx.textEm('brand', c.brand.name) * 19 + ctx.textEm('cta', c.nav.cta) * 14;
  if (nav > LIMITS.navRow) e.push(`brand.name + nav.cta: the phone nav row needs ${Math.round(nav)}px of text, a 360px phone has ${LIMITS.navRow}px`);
  return e;
}

module.exports = { derive, validate, LIMITS };
