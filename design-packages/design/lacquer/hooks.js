// Lacquer's design-specific build logic: the page scripts' data written from the content (the six steps, the nail with
// its shape, length, shade, finish, art and skin, the numbers, the menu, shades, opening hours, technicians and deposit)
// and the rules the schema can't express (opening hours for every day, at least one day open, widths of the big type).
// Runs at build time only.
'use strict';
const { FILTERS } = require('../../engine/template');
const js = FILTERS.js;

const WINDOWS = ['[0,.15]', '[.15,.3]', '[.3,.44]', '[.44,.64]', '[.64,.8]', '[.8,1]'];
const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
// the skin the nail is done on, and how long each length runs past the fingertip (in finger widths)
const SKIN = { light: '#F0CDB8', medium: '#E2B79C', tan: '#BF8A64', deep: '#7E5038' };
const LENGTH = { short: '.26', medium: '.4', long: '.56' };
const SHAPES = ['square', 'round', 'almond', 'coffin', 'stiletto'];
const FINISHES = ['cream', 'chrome', 'glitter', 'matte'];
const num = (n) => String(+(+n).toFixed(3)).replace(/^(-?)0\./, '$1.');

function derive(c) {
  const N = c.nail, S0 = c.shades.items[0];
  return {
    tel: c.contact.phone.replace(/[^\d+]/g, ''),
    businessSaid: c.business.name.replace(/\s*&\s*/g, ' and '),
    brandSaid: c.brand.name.replace(/\s*&\s*/g, ' and '),
    stagesJs: c.stages.map((s, i) => ` {n:${js(s.n)},c:${js(s.c)},tool:${js(s.tool)},w:${WINDOWS[i]}}`).join(',\n'),
    nailJs: `{shape:${js(N.shape)},length:${LENGTH[N.length]},col:${js(N.col)},shade:${js(N.shade)},finish:${js(N.finish)},art:${js(N.art)},artCol:${js(N.artCol)},skin:${js(SKIN[N.skin])}}`,
    countJs: `{mins:${c.count.mins},coats:${c.count.coats},lasts:${js(c.count.lasts)}}`,
    menuJs: c.menu.tabs.map((t) => ` {n:${js(t.n)},items:[${t.items.map((s) => `{n:${js(s.n)},d:${js(s.d)},mins:${s.mins},p:${num(s.p)}}`).join(',')}]}`).join(',\n'),
    wordsJs: `{${['add', 'added', 'min', 'empty', 'anyone', 'pickFirst', 'full', 'sent', 'reply'].map((k) => `${k}:${js(c.words[k])}`).join(',')}}`,
    shadesJs: (() => { const rows = []; for (let i = 0; i < c.shades.items.length; i += 4) rows.push(' ' + c.shades.items.slice(i, i + 4).map((s) => `{n:${js(s.n)},col:${js(s.col)},finish:${js(s.finish)},line:${js(s.line)}}`).join(',')); return rows.join(',\n'); })(),
    shapeNamesJs: `{${SHAPES.map((k) => `${k}:${js(c.shades.shapeNames[k])}`).join(',')}}`,
    finishJs: `{${FINISHES.map((k) => `${k}:${js(c.shades.finishNames[k])}`).join(',')}}`,
    skin: SKIN[N.skin],
    tSub0: `${S0.line} · ${c.shades.finishNames[S0.finish]} · ${c.shades.shapeNames[N.shape].toLowerCase()}`,
    openJs: `[${DAYS.map((k) => { const w = c.book.hours[k]; return w ? `[${js(w.open)},${js(w.close)}]` : 'null'; }).join(',')}]`,
    techsJs: c.book.techs.map((t) => `{n:${js(t.n)},does:${js(t.does)}}`).join(','),
    deposit: num(c.book.deposit),
    h12: String(c.book.clock === '12h'),
  };
}

// Widths of the big display type (Playfair Display, -.01em; the second line italic), in em (metrics.json).
// Hero title: 1440x900 desktop, 90px (10vh) in a 520px column, 5.75 em; the two lines together may take four lines
// before the copy reaches the card (checked 1280x720 to 1920x1080). Phone: 49.6px in 288px on a 320px phone: no word
// wider than 5.8 em. Section titles: 43.2px there: no word wider than 6.6 em.
// Phone nav row on a 360px phone: the logo (26px), the brand (Playfair 24px) and the button (Hanken Grotesk 600, 14px,
// 36px of padding) with their gaps in 328px.
const LIMITS = { heroEm: 5.75, heroLines: 4, heroWord: 5.8, sectionWord: 6.6, navRow: 236 };
function wrapLines(words, width, em) { let n = 1, w = 0; const sp = em(' '); for (const word of words) { const ww = em(word); if (w && w + sp + ww > width) { n++; w = ww; } else w += (w ? sp : 0) + ww; } return n; }

function validate(c, ctx) {
  const e = [];
  const em = (t) => ctx.textEm('display', String(t)), it = (t) => ctx.textEm('italic', String(t));
  const words = (s) => String(s).split(/\s+/).filter(Boolean);
  const H = c.book.hours;
  if (!H) e.push('book.hours: missing (Sunday to Saturday, null for closed)');
  else { for (const k of DAYS) if (H[k] === undefined) e.push(`book.hours.${k}: missing (use null for closed)`); if (DAYS.every((k) => !H[k])) e.push('book.hours: open at least one day'); }
  // the big type
  const lines = wrapLines(words(c.hero.title), LIMITS.heroEm, em) + wrapLines(words(c.hero.titleEm), LIMITS.heroEm, it);
  if (lines > LIMITS.heroLines) e.push(`hero.title + hero.titleEm: the hero title takes ${lines} lines on a desktop (room for ${LIMITS.heroLines}); shorten one`);
  for (const [p, f] of [['hero.title', em], ['hero.titleEm', it]]) for (const w of words(ctx.get(c, p))) { const x = f(w); if (x > LIMITS.heroWord) e.push(`${p}: the word "${w}" is too wide for a phone (${x.toFixed(2)} em, room for ${LIMITS.heroWord})`); }
  for (const s of ['menu', 'shades', 'book']) for (const [p, f] of [[`${s}.title`, em], [`${s}.titleEm`, it]]) for (const w of words(ctx.get(c, p))) { const x = f(w); if (x > LIMITS.sectionWord) e.push(`${p}: the word "${w}" is too wide for a phone (${x.toFixed(2)} em, room for ${LIMITS.sectionWord})`); }
  const nav = em(c.brand.name) * 24 + ctx.textEm('cta', c.nav.cta) * 14;
  if (nav > LIMITS.navRow) e.push(`brand.name + nav.cta: the phone nav row needs ${Math.round(nav)}px of text, a 360px phone has ${LIMITS.navRow}px`);
  return e;
}

module.exports = { derive, validate, LIMITS };
