// Drape's design-specific build logic: the page scripts' data written from the content (the six steps, the outfit's five
// pieces, the box, the till, the shop's pieces and sizes, words, the free-delivery threshold, opening hours and styling
// times) and the rules the schema can't express (opening hours for every day, styling times inside them, widths of the
// big type). Runs at build time only.
'use strict';
const { FILTERS } = require('../../engine/template');
const js = FILTERS.js;

const WINDOWS = ['[0,.15]', '[.15,.3]', '[.3,.45]', '[.45,.62]', '[.62,.8]', '[.8,1]'];
const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
// the third to fifth pieces are always drawn as shoes, a bag, and the small things
const FIXED = [null, null, 'shoes', 'bag', 'extras'];
const num = (n) => String(+(+n).toFixed(3)).replace(/^(-?)0\./, '$1.');
const list = (a) => a.map(js).join(',');
const W = ['add', 'pick', 'bag', 'colour', 'size', 'remove', 'freeYes', 'left', 'piece', 'pieces', 'empty', 'sent', 'reserved', 'reply'];

function money(c, n) { return c.locale.currency + (Math.abs(n - Math.round(n)) < 0.005 ? Math.round(n).toLocaleString('en-GB') : n.toFixed(2)); }

function derive(c) {
  const O = c.outfit.pieces;
  return {
    tel: '',
    businessSaid: c.business.name.replace(/\s*&\s*/g, ' and '),
    brandSaid: c.brand.name.replace(/\s*&\s*/g, ' and '),
    stagesJs: c.stages.map((s, i) => ` {n:${js(s.n)},c:${js(s.c)},w:${WINDOWS[i]}}`).join(',\n'),
    outfitJs: O.map((o, i) => ` {kind:${js(FIXED[i] || o.kind)},col:${js(o.col)},pat:${js(o.pat)},n:${js(o.n)},p:${num(o.p)}}`).join(',\n'),
    boxJs: `{col:${js(c.theme.accent)},mark:${js(c.outfit.mark)}}`,
    tillJs: `{sizes:${js(c.till.sizes)},returns:${js(c.till.returns)}}`,
    productsJs: c.shop.items.map((p) => ` {n:${js(p.n)},kind:${js(p.kind)},cols:[${list(p.cols)}],p:${num(p.p)},sizes:[${p.sizes.map((z) => `[${js(z.z)},${z.ok ? 1 : 0}]`).join(',')}]}`).join(',\n'),
    wordsJs: `{${W.map((k) => `${k}:${js(c.words[k])}`).join(',')}}`,
    free: num(c.shop.free),
    free0: money(c, c.shop.free),
    openJs: `[${DAYS.map((k) => { const w = c.visit.hours[k]; return w ? `[${js(w.open)},${js(w.close)}]` : 'null'; }).join(',')}]`,
    styleJs: `[${list(c.visit.styleTimes)}]`,
    daysJs: `[${list(c.visit.days)}]`,
  };
}

// Widths of the big display type (Prata, -.01em; the second line italic in the browser's Prata), in em (metrics.json).
// Hero title: 1440x900 desktop, 84.6px (9.4vh) in a 500px column, 5.9 em; the two lines together may take four lines
// before the copy reaches the card (checked 1280x720 to 1920x1080). Phone: 48px in 288px on a 320px phone: no word
// wider than 6 em. Section titles: 41.6px there: no word wider than 6.9 em.
// Phone nav row on a 360px phone: the logo (26px), the brand (Prata 23px) and the button (Sora 600, 12.5px, uppercase,
// 32px of padding) with their gaps in 328px.
const LIMITS = { heroEm: 5.9, heroLines: 4, heroWord: 6, sectionWord: 6.9, navRow: 240 };
function wrapLines(words, width, em) { let n = 1, w = 0; const sp = em(' '); for (const word of words) { const ww = em(word); if (w && w + sp + ww > width) { n++; w = ww; } else w += (w ? sp : 0) + ww; } return n; }

function validate(c, ctx) {
  const e = [];
  const em = (t) => ctx.textEm('display', String(t));
  const words = (s) => String(s).split(/\s+/).filter(Boolean);
  const H = c.visit.hours;
  if (!H) e.push('visit.hours: missing (Sunday to Saturday, null for closed)');
  else {
    for (const k of DAYS) if (H[k] === undefined) e.push(`visit.hours.${k}: missing (use null for closed)`);
    if (DAYS.every((k) => !H[k])) e.push('visit.hours: open at least one day');
    else if (!c.visit.styleTimes.some((t) => DAYS.some((k) => H[k] && t >= H[k].open && t < H[k].close))) e.push('visit.styleTimes: at least one time inside the opening hours');
  }
  c.visit.styleTimes.forEach((t, i) => { if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(t)) e.push(`visit.styleTimes.${i}: a time like 10:00 (24-hour)`); });
  c.shop.items.forEach((p, i) => { if (!p.sizes.some((z) => z.ok)) e.push(`shop.items.${i}.sizes: at least one size in stock`); });
  // the big type
  const lines = wrapLines(words(c.hero.title), LIMITS.heroEm, em) + wrapLines(words(c.hero.titleEm), LIMITS.heroEm, em);
  if (lines > LIMITS.heroLines) e.push(`hero.title + hero.titleEm: the hero title takes ${lines} lines on a desktop (room for ${LIMITS.heroLines}); shorten one`);
  for (const p of ['hero.title', 'hero.titleEm']) for (const w of words(ctx.get(c, p))) { const x = em(w); if (x > LIMITS.heroWord) e.push(`${p}: the word "${w}" is too wide for a phone (${x.toFixed(2)} em, room for ${LIMITS.heroWord})`); }
  for (const p of ['shop.title', 'shop.titleEm', 'visit.title', 'visit.titleEm']) for (const w of words(ctx.get(c, p))) { const x = em(w); if (x > LIMITS.sectionWord) e.push(`${p}: the word "${w}" is too wide for a phone (${x.toFixed(2)} em, room for ${LIMITS.sectionWord})`); }
  const nav = em(c.brand.name) * 23 + ctx.textEm('cta', c.nav.cta) * 12.5;
  if (nav > LIMITS.navRow) e.push(`brand.name + nav.cta: the phone nav row needs ${Math.round(nav)}px of text, a 360px phone has ${LIMITS.navRow}px`);
  return e;
}

module.exports = { derive, validate, LIMITS };
