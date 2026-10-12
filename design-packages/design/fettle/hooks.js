// Fettle's design-specific build logic: the page scripts' data written from the content (the call-out's six steps and
// trade, problems, rates, jobs, areas, credentials, booking windows) and the rules the schema can't express (price
// ranges, rate lines, area codes, widths of the big type). Runs at build time only.
'use strict';
const { FILTERS } = require('../../engine/template');
const js = FILTERS.js;

const WINDOWS = ['[0,.14]', '[.14,.32]', '[.32,.5]', '[.5,.66]', '[.66,.84]', '[.84,1]'];
const list = (a) => a.map(js).join(',');
const num = (n) => String(+(+n).toFixed(2)).replace(/^0\./, '.');

function derive(c) {
  return {
    tel: c.contact.phone.replace(/[^\d+]/g, ''),
    businessSaid: c.business.name.replace(/\s*&\s*/g, ' and '),
    brandSaid: c.brand.name.replace(/\s*&\s*/g, ' and '),
    brandUpper: c.brand.name.toUpperCase(),
    hoursSp: c.contact.hours + ' ',
    stagesJs: c.stages.map((s, i) => ` {n:${js(s.n)},c:${js(s.c)},clock:${js(s.clock)},w:${WINDOWS[i]}}`).join(',\n'),
    testJs: `{label:${js(c.job.test.label)},value:${js(c.job.test.value)}}`,
    jobJs: `{ref:${js(c.job.ref)},eta:${c.job.eta},minutes:${c.job.minutes},parts:${c.job.parts},price:${js(c.job.price)}}`,
    problemsJs: c.fix.problems.map((p) => ` {n:${js(p.n)},hint:${js(p.hint)},now:${js(p.now)},price:[${p.price[0]},${p.price[1]}],time:${js(p.time)},urgent:${p.urgent}}`).join(',\n'),
    soonJs: `{urgent:${js(c.fix.soon.urgent)},routine:${js(c.fix.soon.routine)}}`,
    first: c.fix.problems[0].n,
    priceConstJs: `const CALLOUT=${num(c.prices.callout)}, OOH=${num(c.prices.ooh)};`,
    ratesJs: c.prices.rates.map((r) => (r.p != null ? `{t:${js(r.t)},p:${num(r.p)}}` : `{t:${js(r.t)},v:${js(r.v || '')}}`)).join(','),
    jobsJs: c.prices.jobs.map((j) => ` {n:${js(j.n)},d:${js(j.d)},p:${num(j.p)}}`).join(',\n'),
    areasJs: (() => { const it = c.area.areas.map((a) => `{n:${js(a.n)},codes:[${list(a.codes)}],m:${a.m}}`), rows = []; for (let i = 0; i < it.length; i += 4) rows.push(' ' + it.slice(i, i + 4).join(',')); return rows.join(',\n'); })(),
    credsJs: c.area.credentials.map((x) => ` {k:${js(x.k)},n:${js(x.n)},d:${js(x.d)}}`).join(',\n'),
    windowsJs: list(c.book.windows),
    sosJs: list(c.book.sos),
  };
}

// Widths of the big display type (Outfit 700, -.02em), in em (metrics.json).
// Hero title: 1440x900 desktop, 68.4px (7.6vh) in a 520px column, 7.6 em; the two lines together may take four lines
// before the copy reaches the job card (checked 1280x720 to 1920x1080). Phone: 40px in 288px on a 320px phone: no word
// wider than 7.2 em. Section titles: 36.8px there: no word wider than 7.8 em.
// Phone nav row on a 360px phone: the tile (28px) and brand (19px) and the phone number (14px mono, 600) in 328px.
const LIMITS = { heroEm: 7.6, heroLines: 4, heroWord: 7.2, sectionWord: 7.8, navRow: 270 };
function wrapLines(words, width, em) { let n = 1, w = 0; const sp = em(' '); for (const word of words) { const ww = em(word); if (w && w + sp + ww > width) { n++; w = ww; } else w += (w ? sp : 0) + ww; } return n; }

function validate(c, ctx) {
  const e = [];
  const em = (t) => ctx.textEm('display', String(t));
  const words = (s) => String(s).split(/\s+/).filter(Boolean);
  c.fix.problems.forEach((p, i) => { if (p.price[0] > p.price[1]) e.push(`fix.problems.${i}.price: low, then high`); if (p.price.some((x) => !Number.isInteger(x))) e.push(`fix.problems.${i}.price: whole amounts`); });
  c.prices.rates.forEach((r, i) => { if ((r.p == null) === !r.v) e.push(`prices.rates.${i}: either a price (p) or a plain answer (v)`); });
  c.area.areas.forEach((a, i) => { a.codes.forEach((k, j) => { if (!/^[A-Z]{1,2}[0-9]{1,2}[A-Z]?$|^[0-9]{3,5}$/.test(k)) e.push(`area.areas.${i}.codes.${j}: a postcode area like BS8 or a ZIP like 94110`); }); if (!Number.isInteger(a.m)) e.push(`area.areas.${i}.m: whole minutes`); });
  for (const k of ['eta', 'minutes', 'parts']) if (!Number.isInteger(c.job[k])) e.push(`job.${k}: a whole number`);
  // the big type
  const lines = wrapLines(words(c.hero.title), LIMITS.heroEm, em) + wrapLines(words(c.hero.titleEm), LIMITS.heroEm, em);
  if (lines > LIMITS.heroLines) e.push(`hero.title + hero.titleEm: the hero title takes ${lines} lines on a desktop (room for ${LIMITS.heroLines}); shorten one`);
  for (const p of ['hero.title', 'hero.titleEm']) for (const w of words(ctx.get(c, p))) { const x = em(w); if (x > LIMITS.heroWord) e.push(`${p}: the word "${w}" is too wide for a phone (${x.toFixed(2)} em, room for ${LIMITS.heroWord})`); }
  for (const p of ['fix.title', 'prices.title', 'area.title', 'book.title']) for (const w of words(ctx.get(c, p))) { const x = em(w); if (x > LIMITS.sectionWord) e.push(`${p}: the word "${w}" is too wide for a phone (${x.toFixed(2)} em, room for ${LIMITS.sectionWord})`); }
  const nav = ctx.textEm('word', c.brand.name) * 19 + ctx.textEm('cta', c.contact.phone) * 14 + 26;
  if (nav > LIMITS.navRow) e.push(`brand.name + contact.phone: the phone nav row needs ${Math.round(nav)}px, a 360px phone has ${LIMITS.navRow}px`);
  return e;
}

module.exports = { derive, validate, LIMITS };
