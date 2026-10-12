// Verge's design-specific build logic: the page scripts' data written from the content (the makeover's six steps, the
// job and its style, units, features and prices, the twelve months of care, plans, visit times and steps) and the rules
// the schema can't express (the size slider's range, the price spread, months in order, widths of the big type). Runs
// at build time only.
'use strict';
const { FILTERS } = require('../../engine/template');
const js = FILTERS.js;

const WINDOWS = ['[0,.14]', '[.14,.3]', '[.3,.48]', '[.48,.64]', '[.64,.82]', '[.82,1]'];
const list = (a) => a.map(js).join(',');
const num = (n) => String(+(+n).toFixed(2)).replace(/^0\./, '.');
const ints = (a) => a.map((x) => String(x)).join(',');

function derive(c) {
  const q = c.quote;
  return {
    tel: c.contact.phone.replace(/[^\d+]/g, ''),
    businessSaid: c.business.name.replace(/\s*&\s*/g, ' and '),
    brandSaid: c.brand.name.replace(/\s*&\s*/g, ' and '),
    stagesJs: c.stages.map((s, i) => ` {n:${js(s.n)},c:${js(s.c)},when:${js(s.when)},w:${WINDOWS[i]}}`).join(',\n'),
    jobJs: `{area:${c.job.area},tonnes:${num(c.job.tonnes)},plants:${c.job.plants},days:${c.job.days}}`,
    dimsJs: c.job.dims.map(num).join(','),
    featuresJs: q.features.map((f) => ` {n:${js(f.n)},d:${js(f.d)},icon:${js(f.icon)},from:${num(f.from)},rate:${num(f.rate)},days:${num(f.days)},per100:${num(f.per100)}}`).join(',\n'),
    finishJs: q.finish.map((f) => `{n:${js(f.n)},x:${num(f.x)}}`).join(','),
    sizeJs: `{min:${q.size.min},max:${q.size.max},start:${q.size.start},hint:${js(q.size.hint)}}`,
    sizeStart: q.size.start.toLocaleString('en-GB'),
    sizeStep: q.size.max > 1000 ? 50 : 5,
    spreadJs: q.spread.map(num).join(','),
    monthsJs: c.care.months.map((m) => ` {name:${js(m.name)},season:${js(m.season)},line:${js(m.line)},visits:${m.visits},jobs:[${m.jobs.map((j) => `{b:${js(j.b)},s:${js(j.s)}}`).join(',')}]}`).join(',\n'),
    plansJs: c.care.plans.map((p) => ` {b:${js(p.b)},p:${num(p.p)},unit:${js(p.unit)},s:${js(p.s)}}`).join(',\n'),
    timesJs: list(c.book.times),
    moreJs: list(c.book.more),
    closedJs: ints(c.book.closed),
    stepsJs: c.book.steps.map((s) => ` {b:${js(s.b)},s:${js(s.s)}}`).join(',\n'),
    codeErr: `Add your ${c.book.codeLabel.replace(/^[A-Z](?=[a-z])/, (x) => x.toLowerCase())} so we know where the garden is.`,
  };
}

// Widths of the big display type (Gloock 400, -.015em), in em (metrics.json).
// Hero title: 1440x900 desktop, 79.2px (8.8vh) in a 540px column, 6.8 em; the two lines together may take four lines
// before the copy reaches the log card (checked 1280x720 to 1920x1080). Phone: 44.8px in 288px on a 320px phone: no
// word wider than 6.4 em. Section titles: 38.4px there: no word wider than 7.5 em.
// Phone nav row on a 360px phone: the logo (28px), the brand (Gloock, 23px) and the button (Karla 800, 14px, 32px of
// padding) with their gaps in 328px.
const LIMITS = { heroEm: 6.8, heroLines: 4, heroWord: 6.4, sectionWord: 7.5, navRow: 238 };
function wrapLines(words, width, em) { let n = 1, w = 0; const sp = em(' '); for (const word of words) { const ww = em(word); if (w && w + sp + ww > width) { n++; w = ww; } else w += (w ? sp : 0) + ww; } return n; }

function validate(c, ctx) {
  const e = [];
  const em = (t) => ctx.textEm('display', String(t));
  const words = (s) => String(s).split(/\s+/).filter(Boolean);
  const q = c.quote;
  for (const k of ['min', 'max', 'start']) if (!Number.isInteger(q.size[k])) e.push(`quote.size.${k}: a whole number`);
  if (!(q.size.min < q.size.start && q.size.start < q.size.max)) e.push('quote.size: min, then start, then max (the slider starts between them)');
  const step = q.size.max > 1000 ? 50 : 5;
  if ((q.size.start - q.size.min) % step) e.push(`quote.size.start: the slider moves in steps of ${step} from min, so start must be min plus a multiple of ${step}`);
  if (!(q.spread[0] < 1 && q.spread[1] > 1)) e.push('quote.spread: a low factor under 1 and a high factor over 1 (e.g. .85 and 1.2)');
  if (q.finish[0].x !== 1) e.push('quote.finish: the first finish is the standard price (x 1)');
  c.care.months.forEach((m, i) => { if (!Number.isInteger(m.visits)) e.push(`care.months.${i}.visits: a whole number`); });
  if (c.book.closed.some((d) => !Number.isInteger(d) || d < 0 || d > 6) || new Set(c.book.closed).size !== c.book.closed.length) e.push('book.closed: days of the week, 0 (Sunday) to 6 (Saturday), each once');
  for (const k of ['area', 'plants', 'days']) if (!Number.isInteger(c.job[k])) e.push(`job.${k}: a whole number`);
  // the big type
  const lines = wrapLines(words(c.hero.title), LIMITS.heroEm, em) + wrapLines(words(c.hero.titleEm), LIMITS.heroEm, em);
  if (lines > LIMITS.heroLines) e.push(`hero.title + hero.titleEm: the hero title takes ${lines} lines on a desktop (room for ${LIMITS.heroLines}); shorten one`);
  for (const p of ['hero.title', 'hero.titleEm']) for (const w of words(ctx.get(c, p))) { const x = em(w); if (x > LIMITS.heroWord) e.push(`${p}: the word "${w}" is too wide for a phone (${x.toFixed(2)} em, room for ${LIMITS.heroWord})`); }
  for (const p of ['quote.title', 'care.title', 'book.title']) for (const w of words(ctx.get(c, p))) { const x = em(w); if (x > LIMITS.sectionWord) e.push(`${p}: the word "${w}" is too wide for a phone (${x.toFixed(2)} em, room for ${LIMITS.sectionWord})`); }
  const nav = ctx.textEm('brand', c.brand.name) * 23 + ctx.textEm('cta', c.nav.cta) * 14;
  if (nav > LIMITS.navRow) e.push(`brand.name + nav.cta: the phone nav row needs ${Math.round(nav)}px of text, a 360px phone has ${LIMITS.navRow}px`);
  return e;
}

module.exports = { derive, validate, LIMITS };
