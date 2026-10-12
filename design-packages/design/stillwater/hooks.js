// Stillwater's design-specific build logic: the page scripts' data written from the content (the six phases of the
// class with their minutes, effort and breath, the week's timetable, passes and the calculator, what to bring and the
// questions) and the rules the schema can't express (phases that run back to back, places in a class, widths of the
// big type). Runs at build time only.
'use strict';
const { FILTERS } = require('../../engine/template');
const js = FILTERS.js;

const WINDOWS = ['[0,.12]', '[.12,.26]', '[.26,.44]', '[.44,.68]', '[.68,.86]', '[.86,1]'];
const num = (n) => String(+(+n).toFixed(2)).replace(/^0\./, '.');

function derive(c) {
  const k = c.prices.calc;
  return {
    tel: c.contact.phone.replace(/[^\d+]/g, ''),
    businessSaid: c.business.name.replace(/\s*&\s*/g, ' and '),
    brandSaid: c.brand.name.replace(/\s*&\s*/g, ' and '),
    stagesJs: c.stages.map((s, i) => ` {n:${js(s.n)},c:${js(s.c)},cue:${js(s.cue)},from:${s.from},to:${s.to},effort:${s.effort},bpm:${s.bpm},w:${WINDOWS[i]}}`).join(',\n'),
    effortJs: c.class.effort.map(js).join(','),
    typesJs: c.timetable.types.map(js).join(','),
    weekJs: c.timetable.week.map((x) => ` {d:${x.d},t:${js(x.t)},k:${x.k},who:${js(x.who)},len:${x.len},level:${js(x.level)},cap:${x.cap},taken:${x.taken}}`).join(',\n'),
    passesJs: c.prices.passes.map((p) => ` {n:${js(p.n)},p:${num(p.p)},per:${js(p.per)},s:${js(p.s)},tag:${js(p.tag || '')},intro:${!!p.intro}}`).join(',\n'),
    calcJs: `{dropIn:${num(k.dropIn)},pack:{n:${k.pack.n},p:${num(k.pack.p)}},member:${num(k.member)}}`,
    bringJs: c.first.bring.map(js).join(','),
    faqJs: c.first.faq.map((f) => ` {q:${js(f.q)},a:${js(f.a)}}`).join(',\n'),
  };
}

// Widths of the big display type (DM Serif Display, -.01em), in em (metrics.json).
// Hero title: 1440x900 desktop, 81px (9vh) in a 520px column, 6.4 em; the two lines together may take four lines before
// the copy reaches the phase card (checked 1280x720 to 1920x1080). Phone: 44.8px in 288px on a 320px phone: no word
// wider than 6.4 em. Section titles: 41.6px there: no word wider than 6.9 em.
// Phone nav row on a 360px phone: the logo (28px), the brand (23px) and the button (Albert Sans 600, 14px, 36px of
// padding) with their gaps in 328px.
const LIMITS = { heroEm: 6.4, heroLines: 4, heroWord: 6.4, sectionWord: 6.9, navRow: 234 };
function wrapLines(words, width, em) { let n = 1, w = 0; const sp = em(' '); for (const word of words) { const ww = em(word); if (w && w + sp + ww > width) { n++; w = ww; } else w += (w ? sp : 0) + ww; } return n; }

function validate(c, ctx) {
  const e = [];
  const em = (t) => ctx.textEm('display', String(t));
  const words = (s) => String(s).split(/\s+/).filter(Boolean);
  // the phases run back to back from 0 to the class length
  let at = 0;c.stages.forEach((s, i) => { if (s.from !== at) e.push(`stages.${i}.from: each phase starts where the last ended (${at})`); if (!(s.to > s.from)) e.push(`stages.${i}.to: after its start`); at = s.to; });
  if (at !== c.class.length) e.push(`stages: the last phase ends at the class length (${c.class.length}), not ${at}`);
  c.timetable.week.forEach((x, i) => {
    if (x.k >= c.timetable.types.length) e.push(`timetable.week.${i}.k: the number of a kind in timetable.types, from 0`);
    if (x.taken > x.cap) e.push(`timetable.week.${i}.taken: no more taken than places`);
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(x.t)) e.push(`timetable.week.${i}.t: a time like 07:00`);
  });
  if (c.prices.passes.filter((p) => p.intro).length > 1) e.push('prices.passes: at most one intro pass');
  // the big type
  const lines = wrapLines(words(c.hero.title), LIMITS.heroEm, em) + wrapLines(words(c.hero.titleEm), LIMITS.heroEm, em);
  if (lines > LIMITS.heroLines) e.push(`hero.title + hero.titleEm: the hero title takes ${lines} lines on a desktop (room for ${LIMITS.heroLines}); shorten one`);
  for (const p of ['hero.title', 'hero.titleEm']) for (const w of words(ctx.get(c, p))) { const x = em(w); if (x > LIMITS.heroWord) e.push(`${p}: the word "${w}" is too wide for a phone (${x.toFixed(2)} em, room for ${LIMITS.heroWord})`); }
  for (const p of ['timetable.title', 'timetable.titleEm', 'prices.title', 'prices.titleEm', 'first.title', 'first.titleEm']) for (const w of words(ctx.get(c, p))) { const x = em(w); if (x > LIMITS.sectionWord) e.push(`${p}: the word "${w}" is too wide for a phone (${x.toFixed(2)} em, room for ${LIMITS.sectionWord})`); }
  const nav = ctx.textEm('display', c.brand.name) * 23 + ctx.textEm('cta', c.nav.cta) * 14;
  if (nav > LIMITS.navRow) e.push(`brand.name + nav.cta: the phone nav row needs ${Math.round(nav)}px of text, a 360px phone has ${LIMITS.navRow}px`);
  return e;
}

module.exports = { derive, validate, LIMITS };
