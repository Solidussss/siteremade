// Plumb's design-specific build logic: the page scripts' data written from the content (the six steps, the house and
// its new part, the board's numbers and stage weeks, projects, finishes, words, the finished job's facts and the build
// plan) and the rules the schema can't express (weeks and sizes that make sense, widths of the big type). Runs at
// build time only.
'use strict';
const { FILTERS } = require('../../engine/template');
const js = FILTERS.js;

const WINDOWS = ['[0,.14]', '[.14,.32]', '[.32,.52]', '[.52,.7]', '[.7,.86]', '[.86,1]'];
const BRICK = { red: '#B4664B', reclaimed: '#C98A62', yellow: '#C9A66B', grey: '#8E8C86', render: '#E6E0D4' };
const num = (n) => String(+(+n).toFixed(3)).replace(/^(-?)0\./, '$1.');

function derive(c) {
  const H = c.house, K0 = c.price.kinds[0];
  return {
    tel: c.contact.phone.replace(/[^\d+]/g, ''),
    businessSaid: c.business.name.replace(/\s*&\s*/g, ' and '),
    brandSaid: c.brand.name.replace(/\s*&\s*/g, ' and '),
    stagesJs: c.stages.map((s, i) => ` {n:${js(s.n)},c:${js(s.c)},w:${WINDOWS[i]}}`).join(',\n'),
    houseJs: `{house:${js(BRICK[H.brick])},ext:${js(BRICK[H.newBrick])},frame:${js(H.frame)},kitchen:${js(H.kitchen)},blue:${js(c.theme.accent)},dims:[${H.dims.map(js).join(',')}]}`,
    countJs: `{weeks:${c.count.weeks},bricks:${c.count.bricks},budget:${c.count.budget},checks:${c.count.checks}}`,
    startsJs: c.count.starts.join(','),
    kindsJs: c.price.kinds.map((k) => ` {n:${js(k.n)},d:${js(k.d)},rate:[${k.rate.map(num).join(',')}],weeks:[${k.weeks.map(num).join(',')}],size:[${k.size.join(',')}]}`).join(',\n'),
    finishesJs: c.price.finishes.map((f) => `{n:${js(f.n)},d:${js(f.d)},x:${num(f.x)}}`).join(','),
    deposit: num(c.price.deposit),
    wordsJs: `{unit:${js(c.price.words.unit)},week:${js(c.price.words.week)},weeks:${js(c.price.words.weeks)}}`,
    size0: String(K0.size[2]), sizeMin: String(K0.size[0]), sizeMax: String(K0.size[1]),
    factsJs: c.work.facts.map((f) => `{k:${js(f.k)},v:${js(f.v)}}`).join(','),
    planJs: c.how.plan.map((s) => ` {n:${js(s.n)},d:${js(s.d)},start:${s.start},len:${s.len}}`).join(',\n'),
  };
}

// Widths of the big display type (Barlow Condensed 700, uppercase), in em (metrics.json).
// Hero title: 1440x900 desktop, 90px (10vh) in a 520px column, 5.75 em; the two lines together may take four lines
// before the copy reaches the card (checked 1280x720 to 1920x1080). Phone: 44.8px in 288px on a 320px phone: no word
// wider than 6.4 em. Section titles: 48px there: no word wider than 6 em.
// Phone nav row on a 360px phone: the logo (28px), the brand (Barlow Condensed 22px, uppercase) and the button (Barlow
// 700, 14px, 32px of padding) with their gaps in 328px.
const LIMITS = { heroEm: 5.75, heroLines: 4, heroWord: 6.4, sectionWord: 6, navRow: 238 };
function wrapLines(words, width, em) { let n = 1, w = 0; const sp = em(' '); for (const word of words) { const ww = em(word); if (w && w + sp + ww > width) { n++; w = ww; } else w += (w ? sp : 0) + ww; } return n; }

function validate(c, ctx) {
  const e = [];
  const em = (t) => ctx.textEm('display', String(t).toUpperCase());
  const words = (s) => String(s).split(/\s+/).filter(Boolean);
  const S = c.count.starts;
  if (S[0] !== 0 || S.some((w, i) => i && w < S[i - 1]) || S[5] >= c.count.weeks) e.push('count.starts: the week each stage starts, from 0, rising, all before count.weeks');
  c.price.kinds.forEach((k, i) => {
    if (k.rate[0] > k.rate[1]) e.push(`price.kinds.${i}.rate: low then high`);
    if (!(k.size[0] < k.size[1] && k.size[2] >= k.size[0] && k.size[2] <= k.size[1])) e.push(`price.kinds.${i}.size: smallest, largest, and a start between them`);
  });
  c.how.plan.forEach((s, i) => { if (s.start + s.len > c.how.weeks) e.push(`how.plan.${i}: ends after week ${c.how.weeks}`); });
  // the big type
  const lines = wrapLines(words(c.hero.title), LIMITS.heroEm, em) + wrapLines(words(c.hero.titleEm), LIMITS.heroEm, em);
  if (lines > LIMITS.heroLines) e.push(`hero.title + hero.titleEm: the hero title takes ${lines} lines on a desktop (room for ${LIMITS.heroLines}); shorten one`);
  for (const p of ['hero.title', 'hero.titleEm']) for (const w of words(ctx.get(c, p))) { const x = em(w); if (x > LIMITS.heroWord) e.push(`${p}: the word "${w}" is too wide for a phone (${x.toFixed(2)} em, room for ${LIMITS.heroWord})`); }
  for (const p of ['price.title', 'price.titleEm', 'work.title', 'work.titleEm', 'how.title', 'how.titleEm']) for (const w of words(ctx.get(c, p))) { const x = em(w); if (x > LIMITS.sectionWord) e.push(`${p}: the word "${w}" is too wide for a phone (${x.toFixed(2)} em, room for ${LIMITS.sectionWord})`); }
  const nav = em(c.brand.name) * 22 + ctx.textEm('cta', c.nav.cta) * 14;
  if (nav > LIMITS.navRow) e.push(`brand.name + nav.cta: the phone nav row needs ${Math.round(nav)}px of text, a 360px phone has ${LIMITS.navRow}px`);
  return e;
}

module.exports = { derive, validate, LIMITS };
