// Sereine's design-specific build logic: the page scripts' data written from the content (the batch's six steps and
// actives, the products, skin types and concerns, the ingredients) and the rules the schema can't express (routines
// that come out empty, product ids, prices, widths of the big type). Runs at build time only.
'use strict';
const { FILTERS } = require('../../engine/template');
const js = FILTERS.js;

const WINDOWS = ['[0,.14]', '[.14,.42]', '[.42,.54]', '[.54,.68]', '[.68,.84]', '[.84,1]'];
const list = (a) => a.map(js).join(',');
const num = (n) => String(+(+n).toFixed(2)).replace(/^0\./, '.');
const money = (cur, n) => cur + (Math.abs(n - Math.round(n)) < 0.005 ? String(Math.round(n)) : n.toFixed(2));

function derive(c) {
  const cur = c.locale.currency, S = c.shop;
  return {
    brandSaid: c.brand.name.replace(/\s*&\s*/g, ' and '),
    stagesJs: c.stages.map((s, i) => ` {n:${js(s.n)},c:${js(s.c)},w:${WINDOWS[i]}}`).join(',\n'),
    activesJs: c.actives.map((a) => ` {n:${js(a.n)},pct:${num(a.pct)},col:${js(a.col.toUpperCase())}}`).join(',\n'),
    batchJs: `const BATCH=${js(c.batch.ref)}, ML=${c.batch.ml}, PH=${num(c.batch.ph)}, DAYS=${c.batch.days};`,
    productsJs: S.products.map((p) => ` {id:${js(p.id)},n:${js(p.n)},d:${js(p.d)},kind:${js(p.kind)},col:${js(p.col.toUpperCase())},sizes:[${p.sizes.map((s) => `[${s[0]},${num(s[1])}]`).join(',')}],when:${js(p.when)},step:${p.step},skins:[${list(p.skins)}],for:[${list(p.for)}]${p.basic ? ',basic:true' : ''}}`).join(',\n'),
    skinsJs: list(c.routine.skins),
    concernsJs: list(c.routine.concerns.map((x) => x.n)),
    whyJs: c.routine.concerns.map((x) => ` ${js(x.n)}:${js(x.why)}`).join(',\n'),
    shopConstJs: `const SUB_OFF=${S.subOff}, FREE_SHIP=${S.freeShip}, REFILL=${js(S.refill)};`,
    ingredientsJs: c.ingredients.list.map((x) => ` {n:${js(x.n)},pct:${num(x.pct)},col:${js(x.col.toUpperCase())},what:${js(x.what)},from:${js(x.from)},works:${js(x.works)},avoid:${js(x.avoid)},in:[${list(x.in)}]}`).join(',\n'),
    subText: `Subscribe and save ${S.subOff}%, refills every ${S.refill}`,
    shipText: `Free delivery over ${money(cur, S.freeShip)}.`,
    firstStage: c.stages[0].n,
  };
}

// Widths of the big display type (Cormorant 500), in em (metrics.json).
// Hero title: 1440x900 desktop, 84.6px (9.4vh) in a 520px column, 6.15 em; the two lines together may take three lines
// before the copy reaches the label card (checked 1280x720 to 1920x1080). Phone: 48px in 288px on a 320px phone: no
// word wider than 6 em. Section titles: 41.6px there: no word wider than 6.9 em.
// Phone nav row on a 360px phone: the drop (18px), brand (23px, .06em) and the bag button (about 86px) in 328px.
const LIMITS = { heroEm: 6.15, heroLines: 3, heroWord: 6, sectionWord: 6.9, brandPx: 190 };
function wrapLines(words, width, em) { let n = 1, w = 0; const sp = em(' '); for (const word of words) { const ww = em(word); if (w && w + sp + ww > width) { n++; w = ww; } else w += (w ? sp : 0) + ww; } return n; }

function validate(c, ctx) {
  const e = [];
  const em = (t) => ctx.textEm('display', String(t));
  const words = (s) => String(s).split(/\s+/).filter(Boolean);
  const P = c.shop.products, ids = P.map((p) => p.id), skins = c.routine.skins, concerns = c.routine.concerns.map((x) => x.n);
  if (new Set(ids).size !== ids.length) e.push('shop.products: two products with the same id');
  P.forEach((p, i) => {
    if (!/^[a-z][a-z0-9]{1,13}$/.test(p.id)) e.push(`shop.products.${i}.id: lowercase letters and digits`);
    p.skins.forEach((s) => { if (s !== 'all' && !skins.includes(s)) e.push(`shop.products.${i}.skins: "${s}" is not one of routine.skins`); });
    p.for.forEach((s) => { if (!concerns.includes(s)) e.push(`shop.products.${i}.for: "${s}" is not one of routine.concerns`); });
    if (!p.basic && !p.for.length) e.push(`shop.products.${i}: neither basic nor for any concern, so no routine will ever show it`);
    p.sizes.forEach((s, k) => { if (!Number.isInteger(s[0])) e.push(`shop.products.${i}.sizes.${k}: whole millilitres`); if (Math.round(s[1] * 100) !== +(s[1] * 100).toFixed(6)) e.push(`shop.products.${i}.sizes.${k}: price to the penny`); });
    if (!Number.isInteger(p.step)) e.push(`shop.products.${i}.step: a whole number`);
  });
  // every routine the builder can show has something in the morning and the evening
  for (const sk of skins) for (const co of concerns) {
    const ps = P.filter((p) => (p.skins.includes('all') || p.skins.includes(sk)) && (p.basic || p.for.includes(co)));
    if (!ps.some((p) => p.when !== 'pm') || !ps.some((p) => p.when !== 'am')) { e.push(`shop.products: no ${ps.some((p) => p.when !== 'pm') ? 'evening' : 'morning'} product for ${sk} skin with ${co} (mark a product basic for everyone)`); break; }
  }
  c.ingredients.list.forEach((x, i) => x.in.forEach((id) => { if (!ids.includes(id)) e.push(`ingredients.list.${i}.in: "${id}" is not a product id`); }));
  if (!Number.isInteger(c.batch.ml) || !Number.isInteger(c.batch.days)) e.push('batch.ml and batch.days: whole numbers');
  const total = c.actives.reduce((a, x) => a + x.pct, 0);
  if (total > 40) e.push(`actives: ${total}% in all; at most 40%`);
  if (!Number.isInteger(c.shop.subOff)) e.push('shop.subOff: a whole percent');
  // the big type
  const lines = wrapLines(words(c.hero.title), LIMITS.heroEm, em) + wrapLines(words(c.hero.titleEm), LIMITS.heroEm, em);
  if (lines > LIMITS.heroLines) e.push(`hero.title + hero.titleEm: the hero title takes ${lines} lines on a desktop (room for ${LIMITS.heroLines}); shorten one`);
  for (const p of ['hero.title', 'hero.titleEm']) for (const w of words(ctx.get(c, p))) { const x = em(w); if (x > LIMITS.heroWord) e.push(`${p}: the word "${w}" is too wide for a phone (${x.toFixed(2)} em, room for ${LIMITS.heroWord})`); }
  for (const s of ['routine', 'ingredients', 'shop']) for (const p of [`${s}.title`, `${s}.titleEm`]) for (const w of words(ctx.get(c, p))) { const x = em(w); if (x > LIMITS.sectionWord) e.push(`${p}: the word "${w}" is too wide for a phone (${x.toFixed(2)} em, room for ${LIMITS.sectionWord})`); }
  const bw = ctx.textEm('word', c.brand.name) * 23;
  if (bw > LIMITS.brandPx) e.push(`brand.name: too wide for the phone nav (${Math.round(bw)}px, room for ${LIMITS.brandPx})`);
  return e;
}

module.exports = { derive, validate, LIMITS };
