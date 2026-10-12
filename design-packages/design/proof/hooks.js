// Proof's design-specific build logic: the page scripts' data written from the content (the six steps of the bake, the
// board, today's bakes, cake sizes, sponges, fillings and finishes, opening hours) and the rules the schema can't express
// (board stages in order, hours for all seven days, widths of the big type). Runs at build time only.
'use strict';
const { FILTERS } = require('../../engine/template');
const js = FILTERS.js;

const WINDOWS = ['[0,.12]', '[.12,.32]', '[.32,.46]', '[.46,.7]', '[.7,.84]', '[.84,1]'];
const num = (n) => String(+(+n).toFixed(2)).replace(/^0\./, '.');
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function derive(c) {
  const k = c.cakes;
  return {
    tel: c.contact.phone.replace(/[^\d+]/g, ''),
    businessSaid: c.business.name.replace(/\s*&\s*/g, ' and '),
    brandSaid: c.brand.name.replace(/\s*&\s*/g, ' and '),
    stagesJs: c.stages.map((s, i) => ` {n:${js(s.n)},c:${js(s.c)},clock:${js(s.clock)},w:${WINDOWS[i]}}`).join(',\n'),
    boardJs: c.board.map((t) => ` {label:${js(t.label)},unit:${js(t.unit)},from:${num(t.from)},to:${num(t.to)},at:[${t.at[0]},${t.at[1]}],dec:${t.dec}}`).join(',\n'),
    // the board before the page script runs: its starting numbers
    boardHtml: c.board.map((t) => `${num(t.from).replace(/^\./, '0.')}${t.unit ? `<small>${esc(t.unit)}</small>` : ''}`),
    todayJs: c.today.bakes.map((b) => ` {n:${js(b.n)},d:${js(b.d)},p:${num(b.p)},left:${b.left},glyph:${js(b.glyph)}}`).join(',\n'),
    sizesJs: k.sizes.map((s) => ` {n:${js(s.n)},serves:${js(s.serves)},p:${num(s.p)},tiers:${s.tiers},notice:${s.notice}}`).join(',\n'),
    spongesJs: k.sponges.map((s) => `{n:${js(s.n)},p:${num(s.p)},col:${js(s.col)}}`).join(','),
    fillsJs: k.fills.map((s) => `{n:${js(s.n)},p:${num(s.p)},col:${js(s.col)}}`).join(','),
    finishesJs: k.finishes.map((s) => `{n:${js(s.n)},p:${num(s.p)},ice:${js(s.ice)}}`).join(','),
    hoursJs: c.order.hours.map((h) => `{d:${js(h.d)},h:${js(h.h)}}`).join(','),
  };
}

// Widths of the big display type (Libre Caslon Display, -.01em), in em (metrics.json).
// Hero title: 1440x900 desktop, 90px (10vh) in a 540px column, 6 em; the two lines together may take four lines before
// the copy reaches the ticket (checked 1280x720 to 1920x1080). Phone: 48px in 288px on a 320px phone: no word wider than
// 6 em. Section titles: 44.8px there: no word wider than 6.4 em.
// Phone nav row on a 360px phone: the logo (30px), the brand (24px) and the button (Mulish 800 caps, 13px, 32px of
// padding) with their gaps in 328px.
const LIMITS = { heroEm: 6, heroLines: 4, heroWord: 6, sectionWord: 6.4, navRow: 232 };
function wrapLines(words, width, em) { let n = 1, w = 0; const sp = em(' '); for (const word of words) { const ww = em(word); if (w && w + sp + ww > width) { n++; w = ww; } else w += (w ? sp : 0) + ww; } return n; }

function validate(c, ctx) {
  const e = [];
  const em = (t) => ctx.textEm('display', String(t));
  const words = (s) => String(s).split(/\s+/).filter(Boolean);
  c.board.forEach((t, i) => { if (t.at[0] > t.at[1]) e.push(`board.${i}.at: the first stage, then the last`); });
  c.today.bakes.forEach((b, i) => { if (!Number.isInteger(b.left)) e.push(`today.bakes.${i}.left: a whole number (0 is sold out)`); });
  if (c.order.hours.length !== 7) e.push('order.hours: seven days, Monday first');
  if (c.order.hours.every((h) => h.h === c.order.closedWord)) e.push('order.hours: open at least one day');
  // the big type
  const lines = wrapLines(words(c.hero.title), LIMITS.heroEm, em) + wrapLines(words(c.hero.titleEm), LIMITS.heroEm, em);
  if (lines > LIMITS.heroLines) e.push(`hero.title + hero.titleEm: the hero title takes ${lines} lines on a desktop (room for ${LIMITS.heroLines}); shorten one`);
  for (const p of ['hero.title', 'hero.titleEm']) for (const w of words(ctx.get(c, p))) { const x = em(w); if (x > LIMITS.heroWord) e.push(`${p}: the word "${w}" is too wide for a phone (${x.toFixed(2)} em, room for ${LIMITS.heroWord})`); }
  for (const p of ['today.title', 'today.titleEm', 'cakes.title', 'cakes.titleEm', 'order.title']) for (const w of words(ctx.get(c, p))) { const x = em(w); if (x > LIMITS.sectionWord) e.push(`${p}: the word "${w}" is too wide for a phone (${x.toFixed(2)} em, room for ${LIMITS.sectionWord})`); }
  const nav = ctx.textEm('display', c.brand.name) * 24 + ctx.textEm('cta', c.nav.cta) * 13;
  if (nav > LIMITS.navRow) e.push(`brand.name + nav.cta: the phone nav row needs ${Math.round(nav)}px of text, a 360px phone has ${LIMITS.navRow}px`);
  return e;
}

module.exports = { derive, validate, LIMITS };
