// Inkwell's design-specific build logic: the page scripts' data written from the content (the six steps, the piece on
// the arm with its inks, banner word and skin, the numbers and the sitting's clock, the flash, sizes, places, artists,
// rates, aftercare and words) and the rules the schema can't express (a real start time, sizes whose hours run low to
// high, widths of the big type). Runs at build time only.
'use strict';
const { FILTERS } = require('../../engine/template');
const js = FILTERS.js;

const WINDOWS = ['[0,.15]', '[.15,.3]', '[.3,.52]', '[.52,.68]', '[.68,.84]', '[.84,1]'];
// the skin the piece goes on: a tone the content picks, drawn in this colour (the arm is shaded from it)
const SKIN = { light: '#E9C3A6', medium: '#D2A07F', tan: '#B47E57', deep: '#7B4B30' };
const num = (n) => String(+(+n).toFixed(3)).replace(/^(-?)0\./, '$1.');
const list = (a) => a.map(js).join(',');
const pad2 = (n) => String(n).padStart(2, '0');

function start(c) { const [h, m] = c.session.start.split(':').map(Number); return { h, m, h12: c.session.clock === '12h' }; }

function derive(c) {
  const S = start(c);
  return {
    tel: c.contact.phone.replace(/[^\d+]/g, ''),
    businessSaid: c.business.name.replace(/\s*&\s*/g, ' and '),
    brandSaid: c.brand.name.replace(/\s*&\s*/g, ' and '),
    stagesJs: c.stages.map((s, i) => ` {n:${js(s.n)},c:${js(s.c)},w:${WINDOWS[i]}}`).join(',\n'),
    pieceJs: `{motif:${js(c.piece.motif)},fine:${c.piece.style === 'fine'},inks:[${list(c.piece.inks)}],banner:${js(c.piece.banner)},skin:${js(SKIN[c.piece.skin])},caption:${js(c.piece.caption)}}`,
    countJs: `{hours:${num(c.count.hours)},needles:${c.count.needles},inks:${c.count.inks},heal:${js(c.count.heal)}}`,
    startJs: `{h:${S.h},m:${S.m},h12:${S.h12}}`,
    clock0: S.h12 ? `${(S.h % 12) || 12}:${pad2(S.m)} ${S.h < 12 ? 'am' : 'pm'}` : `${pad2(S.h)}:${pad2(S.m)}`,
    flashJs: c.flash.items.map((f) => ` {n:${js(f.n)},motif:${js(f.motif)},inks:[${list(f.inks)}],word:${js(f.word)},size:${js(f.size)},p:${num(f.p)},gone:${f.state === 'claimed'}}`).join(',\n'),
    sizesJs: c.book.sizes.map((s) => `{n:${js(s.n)},d:${js(s.d)},h:[${s.h.map(num).join(',')}]}`).join(','),
    placesJs: c.book.places.map((p) => `{n:${js(p.n)},x:${num(p.x)}}`).join(','),
    artistsJs: c.book.artists.map((a) => `{n:${js(a.n)},does:${js(a.does)},next:${js(a.next)}}`).join(','),
    rateJs: `{hour:${num(c.book.rate.hour)},min:${num(c.book.rate.min)},deposit:${num(c.book.rate.deposit)},day:${num(c.book.rate.day)}}`,
    wordsJs: `{hrs:${js(c.book.words.hrs)},one:${js(c.book.words.one)},flashAsk:${js(c.flash.words.ask)},flashPicked:${js(c.flash.words.picked)},flashIdea:${js(c.flash.words.idea)},sent:${js(c.book.words.sent)},reply:${js(c.book.words.reply)}}`,
    careJs: c.care.steps.map((s) => ` {when:${js(s.when)},n:${js(s.n)},d:${js(s.d)}}`).join(',\n'),
    doJs: list(c.care.do),
    dontJs: list(c.care.dont),
  };
}

// Widths of the big display type (Rozha One, -.005em), in em (metrics.json).
// Hero title: 1440x900 desktop, 90px (10vh) in a 540px column, 6 em; the two lines together may take four lines before
// the copy reaches the sheet (checked 1280x720 to 1920x1080). Phone: 48px in 288px on a 320px phone: no word wider than
// 5.9 em. Section titles: 44.8px there: no word wider than 6.3 em.
// Phone nav row on a 360px phone: the logo (30px), the brand (Rozha One 23px) and the button (Inter Tight 700, 13px,
// uppercase, 32px of padding) with their gaps in 328px.
const LIMITS = { heroEm: 6, heroLines: 4, heroWord: 5.9, sectionWord: 6.3, navRow: 236 };
function wrapLines(words, width, em) { let n = 1, w = 0; const sp = em(' '); for (const word of words) { const ww = em(word); if (w && w + sp + ww > width) { n++; w = ww; } else w += (w ? sp : 0) + ww; } return n; }

function validate(c, ctx) {
  const e = [];
  const em = (t) => ctx.textEm('display', String(t));
  const words = (s) => String(s).split(/\s+/).filter(Boolean);
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(c.session.start)) e.push('session.start: when the sitting starts, like 11:00 (24-hour)');
  c.book.sizes.forEach((s, i) => { if (s.h[0] > s.h[1]) e.push(`book.sizes.${i}.h: hours low then high, like [2, 3]`); });
  // the big type
  const lines = wrapLines(words(c.hero.title), LIMITS.heroEm, em) + wrapLines(words(c.hero.titleEm), LIMITS.heroEm, em);
  if (lines > LIMITS.heroLines) e.push(`hero.title + hero.titleEm: the hero title takes ${lines} lines on a desktop (room for ${LIMITS.heroLines}); shorten one`);
  for (const p of ['hero.title', 'hero.titleEm']) for (const w of words(ctx.get(c, p))) { const x = em(w); if (x > LIMITS.heroWord) e.push(`${p}: the word "${w}" is too wide for a phone (${x.toFixed(2)} em, room for ${LIMITS.heroWord})`); }
  for (const p of ['flash.title', 'flash.titleEm', 'book.title', 'book.titleEm', 'care.title', 'care.titleEm']) for (const w of words(ctx.get(c, p))) { const x = em(w); if (x > LIMITS.sectionWord) e.push(`${p}: the word "${w}" is too wide for a phone (${x.toFixed(2)} em, room for ${LIMITS.sectionWord})`); }
  const nav = ctx.textEm('display', c.brand.name) * 23 + ctx.textEm('cta', c.nav.cta) * 13;
  if (nav > LIMITS.navRow) e.push(`brand.name + nav.cta: the phone nav row needs ${Math.round(nav)}px of text, a 360px phone has ${LIMITS.navRow}px`);
  return e;
}

module.exports = { derive, validate, LIMITS };
