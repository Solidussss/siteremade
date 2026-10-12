// Hearth's design-specific build logic: the page scripts' data written from the content (the six steps, the house's
// brick, door and five lit rooms, which one is yours, the numbers, the sign, rooms, weekend prices, words and places)
// and the rules the schema can't express (your room is one of the rooms, rings that grow, widths of the big type).
// Runs at build time only.
'use strict';
const { FILTERS } = require('../../engine/template');
const js = FILTERS.js;

const WINDOWS = ['[0,.15]', '[.15,.3]', '[.3,.48]', '[.48,.66]', '[.66,.84]', '[.84,1]'];
const BRICK = { red: '#B8654A', brown: '#8C5A44', stone: '#CBB994', white: '#E6DFD3' };
const num = (n) => String(+(+n).toFixed(3)).replace(/^(-?)0\./, '$1.');

function derive(c) {
  const R = c.rooms.list, r = c.stay.room, yours = Math.min(r, 4);
  // the five rooms in the house: the first five in the list (repeating a short list), yours in its own colours
  const slots = [0, 1, 2, 3, 4].map((i) => (i === yours ? R[r] : R[i % R.length]));
  const h12 = c.stay.clock === '12h';
  return {
    tel: c.contact.phone.replace(/[^\d+]/g, ''),
    businessSaid: c.business.name.replace(/\s*&\s*/g, ' and '),
    brandSaid: c.brand.name.replace(/\s*&\s*/g, ' and '),
    stagesJs: c.stages.map((s, i) => ` {n:${js(s.n)},c:${js(s.c)},w:${WINDOWS[i]}}`).join(',\n'),
    houseJs: `{brick:${js(BRICK[c.house.brick])},door:${js(c.house.door)},yours:${yours},rooms:[${slots.map((s) => `{wall:${js(s.wall)},throw:${js(s.throw)}}`).join(',')}]}`,
    keyJs: `{rooms:${c.key.rooms},in:${js(c.key.in)},breakfast:${js(c.key.breakfast)},walk:${js(c.key.walk)}}`,
    signJs: `[${c.sign.map((s) => `{n:${js(s.n)},m:${js(s.m)}}`).join(',')}]`,
    h12: String(h12),
    clock0: h12 ? '6:00 pm' : '18:00',
    roomsJs: R.map((x) => ` {n:${js(x.n)},d:${js(x.d)},sleeps:${x.sleeps},bed:${js(x.bed)},size:${js(x.size)},p:${num(x.p)},wall:${js(x.wall)},throw:${js(x.throw)}}`).join(',\n'),
    wordsJs: `{${['from', 'per', 'sleeps', 'pick', 'leave', 'min', 'taken', 'night', 'nights', 'sent', 'reply'].map((k) => `${k}:${js(c.dates.words[k])}`).join(',')}}`,
    rm: String(r),
    room0: R[r].n,
    weekend: num(c.dates.weekend),
    placesJs: c.nearby.places.map((p) => ` {n:${js(p.n)},d:${js(p.d)},m:${p.m},dir:${p.dir}}`).join(',\n'),
    ringJs: c.nearby.rings.join(','),
  };
}

// Widths of the big display type (Marcellus), in em (metrics.json).
// Hero title: 1440x900 desktop, 82.8px (9.2vh) in a 520px column, 6 em; the two lines together may take four lines
// before the copy reaches the card (checked 1280x720 to 1920x1080). Phone: 48px in 288px on a 320px phone: no word
// wider than 6 em. Section titles: 41.6px there: no word wider than 6.9 em.
// Phone nav row on a 360px phone: the logo (24px), the brand (Marcellus 19px) and the button (Albert Sans 600, 13.5px,
// 28px of padding) with their gaps (8px, 20px) in 328px.
const LIMITS = { heroEm: 6, heroLines: 4, heroWord: 6, sectionWord: 6.9, navRow: 248 };
function wrapLines(words, width, em) { let n = 1, w = 0; const sp = em(' '); for (const word of words) { const ww = em(word); if (w && w + sp + ww > width) { n++; w = ww; } else w += (w ? sp : 0) + ww; } return n; }

function validate(c, ctx) {
  const e = [];
  const em = (t) => ctx.textEm('display', String(t));
  const words = (s) => String(s).split(/\s+/).filter(Boolean);
  if (!Number.isInteger(c.stay.room) || c.stay.room >= c.rooms.list.length) e.push(`stay.room: one of the rooms, 0 to ${c.rooms.list.length - 1}`);
  if (c.nearby.rings[0] >= c.nearby.rings[1]) e.push('nearby.rings: the inner ring first, like [5, 10]');
  c.nearby.places.forEach((p, i) => { if (!Number.isInteger(p.dir)) e.push(`nearby.places.${i}.dir: whole degrees from north`); });
  // the big type
  const lines = wrapLines(words(c.hero.title), LIMITS.heroEm, em) + wrapLines(words(c.hero.titleEm), LIMITS.heroEm, em);
  if (lines > LIMITS.heroLines) e.push(`hero.title + hero.titleEm: the hero title takes ${lines} lines on a desktop (room for ${LIMITS.heroLines}); shorten one`);
  for (const p of ['hero.title', 'hero.titleEm']) for (const w of words(ctx.get(c, p))) { const x = em(w); if (x > LIMITS.heroWord) e.push(`${p}: the word "${w}" is too wide for a phone (${x.toFixed(2)} em, room for ${LIMITS.heroWord})`); }
  for (const p of ['rooms.title', 'rooms.titleEm', 'dates.title', 'dates.titleEm', 'nearby.title', 'nearby.titleEm']) for (const w of words(ctx.get(c, p))) { const x = em(w); if (x > LIMITS.sectionWord) e.push(`${p}: the word "${w}" is too wide for a phone (${x.toFixed(2)} em, room for ${LIMITS.sectionWord})`); }
  const nav = em(c.brand.name) * 19 + ctx.textEm('cta', c.nav.cta) * 13.5;
  if (nav > LIMITS.navRow) e.push(`brand.name + nav.cta: the phone nav row needs ${Math.round(nav)}px of text, a 360px phone has ${LIMITS.navRow}px`);
  return e;
}

module.exports = { derive, validate, LIMITS };
