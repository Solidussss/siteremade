// Plait's design-specific build logic: the page scripts' data written from the content (the week's six steps, the
// sources, lanes and cards, the readouts, integrations, plans and questions) and the rules the schema can't express
// (cards per lane, which cards ship, plan limits, widths of the big type). Runs at build time only.
'use strict';
const { FILTERS } = require('../../engine/template');
const js = FILTERS.js;

// the hero's scroll window for each of the six steps: the design's
const WINDOWS = ['[0,.14]', '[.14,.32]', '[.32,.5]', '[.5,.68]', '[.68,.84]', '[.84,1]'];
// a share as the page writes it: 0.6 -> .6
const frac = (pct) => String(+(pct / 100).toFixed(4)).replace(/^0\./, '.');
const list = (a) => a.map(js).join(',');

function derive(c) {
  const cur = c.locale.currency;
  const slug = c.demo.team.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30) || 'team';
  return {
    brandSaid: c.brand.name.replace(/\s*&\s*/g, ' and '),
    sourceCount: c.sources.length,
    stagesJs: c.stages.map((s, i) => ` {n:${js(s.n)},c:${js(s.c)},clock:${js(s.clock)},w:${WINDOWS[i]}}`).join(',\n'),
    sourcesJs: c.sources.map((s) => ` {n:${js(s.n)},g:${js(s.g)}}`).join(',\n'),
    lanesJs: list(c.lanes),
    cardsJs: c.cards.map((x) => ` {t:${js(x.t)},s:${x.s},l:${x.l},who:${js(x.who)}}`).join(',\n'),
    shipJs: c.cards.map((x, i) => (x.ships ? i : -1)).filter((i) => i >= 0).join(','),
    readJs: `{open:[${c.demo.open[0]},${c.demo.open[1]}],tools:[SOURCES.length,1],sw:[${c.demo.switches[0]},${c.demo.switches[1]}],back:[0,${c.demo.hoursBack}]}`,
    saveJs: frac(c.cost.save),
    lostText: `${c.cost.lost} h`,
    rateText: cur + Math.round(c.cost.rate).toLocaleString('en-US'),
    catsJs: list(c.integrations.kinds),
    intsJs: c.integrations.items.map((x) => ` {n:${js(x.n)},k:${js(x.k)},in:${js(x.in)},out:${js(x.out)},sync:${js(x.sync)}}`).join(',\n'),
    offJs: frac(c.pricing.yearlyOff),
    offText: `−${Math.round(c.pricing.yearlyOff)}%`,
    tiersJs: c.pricing.tiers.map((t) => ` {n:${js(t.n)},for:${js(t.for)},price:${t.price},max:${t.max},feats:[${list(t.feats)}],cta:${js(t.cta)}}`).join(',\n'),
    faqJs: c.faq.items.map((f) => ` {q:${js(f.q)},a:${js(f.a)}}`).join(',\n'),
    presetJs: list(c.start.preset),
    slug,
  };
}

// Widths of the big display type (Bricolage Grotesque 800, -.025em), in em (metrics.json).
// Hero title: 1440x900 desktop, 75.6px (8.4vh) in a 560px column, 7.4 em; title and accent line together may take 4
// lines before the copy reaches the step card (checked at 1280x720 to 1920x1080). Phone: 41.6px in a 288px column on a
// 320px phone: no word wider than 6.9 em. Section titles: 36.8px on that phone: no word wider than 7.8 em.
// Phone nav row: mark (28px) + gap + brand (19px) + the button (14px Inter 600 + 30px padding) in 328px less 32px gaps.
const LIMITS = { heroEm: 7.4, heroLines: 4, heroWord: 6.9, sectionWord: 7.8, navRow: 268 };
function wrapLines(words, width, em) { let n = 1, w = 0; const sp = em(' '); for (const word of words) { const ww = em(word); if (w && w + sp + ww > width) { n++; w = ww; } else w += (w ? sp : 0) + ww; } return n; }

function validate(c, ctx) {
  const e = [];
  const em = (t) => ctx.textEm('display', String(t));
  const words = (s) => String(s).split(/\s+/).filter(Boolean);
  // the cards: four at most per lane to start with; one to three ship, never from the last lane
  for (let l = 0; l < 4; l++) { const n = c.cards.filter((x) => x.l === l).length; if (n > 4) e.push(`cards: ${n} start in lane ${l} (${c.lanes[l]}); at most 4`); }
  c.cards.forEach((x, i) => { if (!Number.isInteger(x.s) || !Number.isInteger(x.l)) e.push(`cards.${i}: s and l are whole numbers`); if (x.ships != null && typeof x.ships !== 'boolean') e.push(`cards.${i}.ships: true or false`); if (x.ships && x.l === 3) e.push(`cards.${i}.ships: a card already in the last lane cannot ship`); if (!/^[A-Z]{1,3}$/.test(x.who)) e.push(`cards.${i}.who: initials in capitals`); });
  const ships = c.cards.filter((x) => x.ships).length;
  if (ships < 1 || ships > 3) e.push(`cards: ${ships} cards ship during the week; one to three`);
  // the readouts fall over the week
  if (!(c.demo.open[0] > c.demo.open[1])) e.push('demo.open: more open items before than after');
  if (!(c.demo.switches[0] > c.demo.switches[1])) e.push('demo.switches: more tool switches before than after');
  // integrations
  c.integrations.items.forEach((x, i) => { if (!c.integrations.kinds.includes(x.k)) e.push(`integrations.items.${i}.k: "${x.k}" is not one of integrations.kinds`); });
  const names = c.integrations.items.map((x) => x.n);
  c.start.preset.forEach((n, i) => { if (!names.includes(n)) e.push(`start.preset.${i}: "${n}" is not one of integrations.items`); });
  // plans: seat limits rise, the last has none
  const T = c.pricing.tiers;
  T.forEach((t, i) => { if (!Number.isInteger(t.max)) e.push(`pricing.tiers.${i}.max: a whole number`); if (i < T.length - 1 && (t.max <= 0 || (i > 0 && t.max <= T[i - 1].max))) e.push(`pricing.tiers.${i}.max: seat limits rise from plan to plan (0 only on the last)`); });
  if (T[T.length - 1].max !== 0) e.push('pricing.tiers: the last plan has no seat limit (max 0)');
  if (!Number.isInteger(c.pricing.yearlyOff)) e.push('pricing.yearlyOff: a whole percent');
  if (Math.round(c.cost.lost * 2) !== c.cost.lost * 2) e.push('cost.lost: in half hours');
  if (!Number.isInteger(c.cost.rate) || !Number.isInteger(c.cost.team) || !Number.isInteger(c.pricing.seats)) e.push('cost.rate, cost.team and pricing.seats: whole numbers');
  // the big type
  const lines = wrapLines(words(c.hero.title), LIMITS.heroEm, em) + wrapLines(words(c.hero.titleEm), LIMITS.heroEm, em);
  if (lines > LIMITS.heroLines) e.push(`hero.title + hero.titleEm: the hero title takes ${lines} lines on a desktop (room for ${LIMITS.heroLines}); shorten one`);
  for (const p of ['hero.title', 'hero.titleEm']) for (const w of words(ctx.get(c, p))) { const x = em(w); if (x > LIMITS.heroWord) e.push(`${p}: the word "${w}" is too wide for a phone (${x.toFixed(2)} em, room for ${LIMITS.heroWord})`); }
  for (const p of ['cost.title', 'integrations.title', 'pricing.title', 'start.title']) for (const w of words(ctx.get(c, p))) { const x = em(w); if (x > LIMITS.sectionWord) e.push(`${p}: the word "${w}" is too wide for a phone (${x.toFixed(2)} em, room for ${LIMITS.sectionWord})`); }
  const nav = em(c.brand.name) * 19 + ctx.textEm('cta', c.nav.cta) * 14 + 30;
  if (nav > LIMITS.navRow) e.push(`brand.name + nav.cta: the phone nav row needs ${Math.round(nav)}px, a 360px phone has ${LIMITS.navRow}px ("${c.brand.name}" + "${c.nav.cta}")`);
  return e;
}

module.exports = { derive, validate, LIMITS };
