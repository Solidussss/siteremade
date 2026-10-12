// Halden & Vale's design-specific build logic: the page scripts' data written from the content (the matter's six
// steps, folders and memo, the areas and situations, fees, people and first-call options) and the rules the schema
// can't express (who handles what, rising days, fee ranges, widths of the big type). Runs at build time only.
'use strict';
const { FILTERS } = require('../../engine/template');
const js = FILTERS.js;

const WINDOWS = ['[0,.12]', '[.12,.3]', '[.3,.48]', '[.48,.64]', '[.64,.82]', '[.82,1]'];
const list = (a) => a.map(js).join(',');

function derive(c) {
  return {
    tel: c.contact.phone.replace(/[^\d+]/g, ''),
    businessSaid: c.business.name.replace(/\s*&\s*/g, ' and '),
    brandSaid: c.brand.name.replace(/\s*&\s*/g, ' and '),
    stagesJs: c.stages.map((s, i) => ` {n:${js(s.n)},c:${js(s.c)},day:${s.day},w:${WINDOWS[i]}}`).join(',\n'),
    foldersJs: list(c.matter.folders),
    memoJs: `{title:${js(c.matter.memo.title)},points:[${list(c.matter.memo.points)}]}`,
    areasJs: c.guide.areas.map((a) => ` {n:${js(a.n)},d:${js(a.d)},sits:[\n${a.sits.map((s) => `  {n:${js(s.n)},fee:[${s.fee[0]},${s.fee[1]}],time:${js(s.time)},who:${js(s.who)},steps:[${list(s.steps)}],bring:${js(s.bring)}}`).join(',\n')}]}`).join(',\n'),
    first: c.guide.areas[0].sits[0],
    feesJs: c.fees.items.map((f) => ` {area:${js(f.area)},n:${js(f.n)},p:${f.p},from:${f.from},incl:[${list(f.incl)}]}`).join(',\n'),
    peopleJs: c.people.list.map((p) => ` {n:${js(p.n)},role:${js(p.role)},bio:${js(p.bio)},tags:[${list(p.tags)}]}`).join(',\n'),
    slotsJs: list(c.consult.slots),
    howJs: list(c.consult.how),
    promisesJs: c.consult.promises.map((p) => ` {t:${js(p.t)},d:${js(p.d)}}`).join(',\n'),
  };
}

// Widths of the big display type (Newsreader 400), in em (metrics.json).
// Hero title: 1440x900 desktop, 72px (8vh) in a 560px column, 7.78 em; the two lines together may take four lines
// before the copy reaches the file card (checked 1280x720 to 1920x1080). Phone: 43.2px in 288px on a 320px phone: no
// word wider than 6.6 em. Section titles: 38.4px there: no word wider than 7.5 em.
// Phone nav row on a 360px phone: 328px less the mark (26px) and two gaps (10px, 22px) for the brand (20px) and the
// button (14px Public Sans 600 + 32px).
const LIMITS = { heroEm: 7.78, heroLines: 4, heroWord: 6.6, sectionWord: 7.5, navRow: 270 };
function wrapLines(words, width, em) { let n = 1, w = 0; const sp = em(' '); for (const word of words) { const ww = em(word); if (w && w + sp + ww > width) { n++; w = ww; } else w += (w ? sp : 0) + ww; } return n; }

function validate(c, ctx) {
  const e = [];
  const em = (t) => ctx.textEm('display', String(t));
  const words = (s) => String(s).split(/\s+/).filter(Boolean);
  // the matter's days rise; the flags are whole
  c.stages.forEach((s, i) => { if (!Number.isInteger(s.day)) e.push(`stages.${i}.day: a whole number`); if (i && s.day < c.stages[i - 1].day) e.push(`stages.${i}.day: the days only go forward`); });
  if (!Number.isInteger(c.matter.flags)) e.push('matter.flags: a whole number');
  // who handles each situation is on the team; fee ranges run low to high
  const names = c.people.list.map((p) => p.n);
  c.guide.areas.forEach((a, ai) => a.sits.forEach((s, si) => { const p = `guide.areas.${ai}.sits.${si}`; if (!names.includes(s.who)) e.push(`${p}.who: "${s.who}" is not in people.list`); if (s.fee[0] > s.fee[1]) e.push(`${p}.fee: low, then high`); if (s.fee.some((x) => !Number.isInteger(x))) e.push(`${p}.fee: whole amounts`); }));
  c.fees.items.forEach((f, i) => { if (!Number.isInteger(f.p)) e.push(`fees.items.${i}.p: a whole amount`); });
  if (!Number.isInteger(c.fees.vat)) e.push('fees.vat: a whole percent');
  c.consult.slots.forEach((s, i) => { if (!/^([01]?\d|2[0-3]):[0-5]\d$/.test(s)) e.push(`consult.slots.${i}: H:MM, 24-hour`); });
  // the big type
  const lines = wrapLines(words(c.hero.title), LIMITS.heroEm, em) + wrapLines(words(c.hero.titleEm), LIMITS.heroEm, em);
  if (lines > LIMITS.heroLines) e.push(`hero.title + hero.titleEm: the hero title takes ${lines} lines on a desktop (room for ${LIMITS.heroLines}); shorten one`);
  for (const p of ['hero.title', 'hero.titleEm']) for (const w of words(ctx.get(c, p))) { const x = em(w); if (x > LIMITS.heroWord) e.push(`${p}: the word "${w}" is too wide for a phone (${x.toFixed(2)} em, room for ${LIMITS.heroWord})`); }
  for (const p of ['guide.title', 'fees.title', 'people.title', 'consult.title']) for (const w of words(ctx.get(c, p))) { const x = em(w); if (x > LIMITS.sectionWord) e.push(`${p}: the word "${w}" is too wide for a phone (${x.toFixed(2)} em, room for ${LIMITS.sectionWord})`); }
  const nav = em(c.brand.name) * 20 + ctx.textEm('cta', c.nav.cta) * 14 + 32;
  if (nav > LIMITS.navRow) e.push(`brand.name + nav.cta: the phone nav row needs ${Math.round(nav)}px, a 360px phone has ${LIMITS.navRow}px ("${c.brand.name}" + "${c.nav.cta}")`);
  return e;
}

module.exports = { derive, validate, LIMITS };
