// Camber's design-specific build logic: the page scripts' data written from the content (the check-over's six steps, the
// car, its checks and the fix, sizes and jobs, promises, the sample message, credentials, drop-off times and options)
// and the rules the schema can't express (one red check, a price for every size, widths of the big type). Runs at build
// time only.
'use strict';
const { FILTERS } = require('../../engine/template');
const js = FILTERS.js;

const WINDOWS = ['[0,.12]', '[.12,.26]', '[.26,.52]', '[.52,.64]', '[.64,.84]', '[.84,1]'];
const list = (a) => a.map(js).join(',');
const num = (n) => String(+(+n).toFixed(2)).replace(/^0\./, '.');
const ints = (a) => a.map((x) => String(x)).join(',');
const lowerFirst = (s) => s.replace(/^[A-Z](?=[a-z])/, (x) => x.toLowerCase());

function derive(c) {
  const a = c.promise.ask;
  return {
    tel: c.contact.phone.replace(/[^\d+]/g, ''),
    businessSaid: c.business.name.replace(/\s*&\s*/g, ' and '),
    brandSaid: c.brand.name.replace(/\s*&\s*/g, ' and '),
    checkCount: c.checks.length,
    priceZero: c.locale.currency + '0',
    stagesJs: c.stages.map((s, i) => ` {n:${js(s.n)},c:${js(s.c)},clock:${js(s.clock)},w:${WINDOWS[i]}}`).join(',\n'),
    checksJs: c.checks.map((k) => ` {n:${js(k.n)},key:${js(k.key)},v:${js(k.v)},s:${js(k.s)}}`).join(',\n'),
    sizesJs: c.prices.sizes.map((s) => ` {n:${js(s.n)},d:${js(s.d)},shape:${js(s.shape)}}`).join(',\n'),
    jobsJs: c.prices.jobs.map((j) => ` {n:${js(j.n)},d:${js(j.d)},p:[${j.p.map(num).join(',')}]}`).join(',\n'),
    startJobsJs: ints(c.prices.start.jobs),
    promisesJs: c.promise.promises.map((p) => ` {k:${js(p.k)},b:${js(p.b)},s:${js(p.s)}}`).join(',\n'),
    askJs: `{from:${js(a.from)},items:[${a.items.map((x) => `{n:${js(x.n)},s:${js(x.s)},p:${num(x.p)}}`).join(',')}],yes:${js(a.yes)},no:${js(a.no)}}`,
    credsJs: c.promise.creds.map((x) => `{k:${js(x.k)},n:${js(x.n)}}`).join(','),
    dropsJs: list(c.book.drops),
    closedJs: ints(c.book.closed),
    optsJs: c.book.opts.map((o) => ` {n:${js(o.n)},d:${js(o.d)},p:${js(o.p)}}`).join(',\n'),
    regErr: `Add your ${lowerFirst(c.book.regLabel)} so we can look the car up.`,
  };
}

// Widths of the big display type (Chakra Petch 700, upper case, -.01em), in em (metrics.json).
// Hero title: 1440x900 desktop, 75.6px (8.4vh) in a 560px column, 7.4 em; the two lines together may take four lines
// before the copy reaches the visit card (checked 1280x720 to 1920x1080). Phone: 41.6px in 288px on a 320px phone: no
// word wider than 6.9 em. Section titles: 36.8px there: no word wider than 7.8 em.
// Phone nav row on a 360px phone: the logo (30px), the brand (20px) and the button (13px, 32px of padding) with their
// gaps in 328px.
const LIMITS = { heroEm: 7.4, heroLines: 4, heroWord: 6.9, sectionWord: 7.8, navRow: 236 };
function wrapLines(words, width, em) { let n = 1, w = 0; const sp = em(' '); for (const word of words) { const ww = em(word); if (w && w + sp + ww > width) { n++; w = ww; } else w += (w ? sp : 0) + ww; } return n; }

function validate(c, ctx) {
  const e = [];
  const em = (t) => ctx.textEm('display', String(t));
  const words = (s) => String(s).split(/\s+/).filter(Boolean);
  const bad = c.checks.filter((k) => k.s === 'bad').length;
  if (bad !== 1) e.push(`checks: exactly one check is bad (the job the hero sends for approval and fixes); there are ${bad}`);
  if (new Set(c.checks.map((k) => k.key)).size !== c.checks.length) e.push('checks: each place on the car (key) once');
  c.prices.jobs.forEach((j, i) => { if (j.p.length !== c.prices.sizes.length) e.push(`prices.jobs.${i}.p: one price for each size of car (${c.prices.sizes.length})`); });
  if (c.prices.start.size >= c.prices.sizes.length) e.push('prices.start.size: the number of a size in prices.sizes, from 0');
  if (c.prices.start.jobs.some((i) => i >= c.prices.jobs.length) || new Set(c.prices.start.jobs).size !== c.prices.start.jobs.length) e.push('prices.start.jobs: numbers of jobs in prices.jobs, from 0, each once');
  if (!c.promise.ask.items.some((x) => x.s === 'bad')) e.push('promise.ask.items: at least one item that needs doing (bad) with its price');
  if (c.book.closed.some((d) => !Number.isInteger(d) || d < 0 || d > 6) || new Set(c.book.closed).size !== c.book.closed.length) e.push('book.closed: days of the week, 0 (Sunday) to 6 (Saturday), each once');
  // the big type
  const lines = wrapLines(words(c.hero.title), LIMITS.heroEm, em) + wrapLines(words(c.hero.titleEm), LIMITS.heroEm, em);
  if (lines > LIMITS.heroLines) e.push(`hero.title + hero.titleEm: the hero title takes ${lines} lines on a desktop (room for ${LIMITS.heroLines}); shorten one`);
  for (const p of ['hero.title', 'hero.titleEm']) for (const w of words(ctx.get(c, p))) { const x = em(w); if (x > LIMITS.heroWord) e.push(`${p}: the word "${w}" is too wide for a phone (${x.toFixed(2)} em, room for ${LIMITS.heroWord})`); }
  for (const p of ['prices.title', 'promise.title', 'book.title']) for (const w of words(ctx.get(c, p))) { const x = em(w); if (x > LIMITS.sectionWord) e.push(`${p}: the word "${w}" is too wide for a phone (${x.toFixed(2)} em, room for ${LIMITS.sectionWord})`); }
  const nav = ctx.textEm('brand', c.brand.name) * 20 + ctx.textEm('cta', c.nav.cta) * 13;
  if (nav > LIMITS.navRow) e.push(`brand.name + nav.cta: the phone nav row needs ${Math.round(nav)}px of text, a 360px phone has ${LIMITS.navRow}px`);
  return e;
}

module.exports = { derive, validate, LIMITS };
