// Axis's design-specific build logic: the page scripts' data written from the content (the six stages of the recovery
// with angle, pain, strength and sessions; the areas, treatments, how to pay, practitioners and times) and the rules the
// schema can't express (a recovery that only gets better, a goal within reach of the joint, widths of the big type). Runs
// at build time only.
'use strict';
const { FILTERS } = require('../../engine/template');
const js = FILTERS.js;

const WINDOWS = ['[0,.12]', '[.12,.28]', '[.28,.45]', '[.45,.64]', '[.64,.82]', '[.82,1]'];
const num = (n) => String(+(+n).toFixed(2)).replace(/^0\./, '.');
const ints = (a) => a.map((x) => String(x)).join(',');
const REACH = { knee: 160, shoulder: 180, back: 120 }; // the furthest each joint's dial is drawn

function derive(c) {
  return {
    tel: c.contact.phone.replace(/[^\d+]/g, ''),
    businessSaid: c.business.name.replace(/\s*&\s*/g, ' and '),
    brandSaid: c.brand.name.replace(/\s*&\s*/g, ' and '),
    stagesJs: c.stages.map((s, i) => ` {n:${js(s.n)},c:${js(s.c)},when:${js(s.when)},angle:${s.angle},pain:${s.pain},strength:${s.strength},sessions:${s.sessions},w:${WINDOWS[i]}}`).join(',\n'),
    areasJs: c.where.areas.map((a) => ` {n:${js(a.n)},tag:${js(a.tag || '')},line:${js(a.line)},conds:[${a.conds.map(js).join(',')}],sessions:${js(a.sessions)},weeks:${js(a.weeks)},meanwhile:${js(a.meanwhile)},flag:${js(a.flag)}}`).join(',\n'),
    treatsJs: c.treatments.treats.map((x) => ` {n:${js(x.n)},d:${js(x.d)},len:${js(x.len)},p:${num(x.p)}}`).join(',\n'),
    paysJs: c.treatments.pays.map(js).join(','),
    peopleJs: c.book.people.map((p) => ` {n:${js(p.n)},role:${js(p.role)}}`).join(',\n'),
    timesJs: c.book.times.map(js).join(','),
    closedJs: ints(c.book.closed),
  };
}

// Widths of the big display type (Plus Jakarta Sans 800, -.028em), in em (metrics.json).
// Hero title: 1440x900 desktop, 73.8px (8.2vh) in a 540px column, 7.3 em; the two lines together may take four lines
// before the copy reaches the stage card (checked 1280x720 to 1920x1080). Phone: 41.6px in 288px on a 320px phone: no
// word wider than 6.9 em. Section titles: 36.8px there: no word wider than 7.8 em.
// Phone nav row on a 360px phone: the logo (28px), the brand (20px) and the button (14px, 32px of padding) with
// their gaps in 328px.
const LIMITS = { heroEm: 7.3, heroLines: 4, heroWord: 6.9, sectionWord: 7.8, navRow: 238 };
function wrapLines(words, width, em) { let n = 1, w = 0; const sp = em(' '); for (const word of words) { const ww = em(word); if (w && w + sp + ww > width) { n++; w = ww; } else w += (w ? sp : 0) + ww; } return n; }

function validate(c, ctx) {
  const e = [];
  const em = (t) => ctx.textEm('display', String(t));
  const words = (s) => String(s).split(/\s+/).filter(Boolean);
  const reach = REACH[c.job.joint] || 160;
  if (c.job.goal > reach) e.push(`job.goal: a ${c.job.joint} is drawn up to ${reach}°`);
  c.stages.forEach((s, i) => {
    if (s.angle > reach) e.push(`stages.${i}.angle: a ${c.job.joint} is drawn up to ${reach}°`);
    if (i > 0) { const p = c.stages[i - 1];
      if (s.angle < p.angle) e.push(`stages.${i}.angle: the range only grows through the recovery (was ${p.angle}°)`);
      if (s.pain > p.pain) e.push(`stages.${i}.pain: pain only falls through the recovery (was ${p.pain})`);
      if (s.sessions < p.sessions) e.push(`stages.${i}.sessions: sessions only add up`); }
  });
  if (c.book.closed.some((d) => !Number.isInteger(d) || d < 0 || d > 6) || new Set(c.book.closed).size !== c.book.closed.length) e.push('book.closed: days of the week, 0 (Sunday) to 6 (Saturday), each once');
  c.book.times.forEach((t, i) => { if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(t)) e.push(`book.times.${i}: a time like 08:00`); });
  // the big type
  const lines = wrapLines(words(c.hero.title), LIMITS.heroEm, em) + wrapLines(words(c.hero.titleEm), LIMITS.heroEm, em);
  if (lines > LIMITS.heroLines) e.push(`hero.title + hero.titleEm: the hero title takes ${lines} lines on a desktop (room for ${LIMITS.heroLines}); shorten one`);
  for (const p of ['hero.title', 'hero.titleEm']) for (const w of words(ctx.get(c, p))) { const x = em(w); if (x > LIMITS.heroWord) e.push(`${p}: the word "${w}" is too wide for a phone (${x.toFixed(2)} em, room for ${LIMITS.heroWord})`); }
  for (const p of ['where.title', 'treatments.title', 'book.title']) for (const w of words(ctx.get(c, p))) { const x = em(w); if (x > LIMITS.sectionWord) e.push(`${p}: the word "${w}" is too wide for a phone (${x.toFixed(2)} em, room for ${LIMITS.sectionWord})`); }
  const nav = ctx.textEm('brand', c.brand.name) * 20 + ctx.textEm('cta', c.nav.cta) * 14;
  if (nav > LIMITS.navRow) e.push(`brand.name + nav.cta: the phone nav row needs ${Math.round(nav)}px of text, a 360px phone has ${LIMITS.navRow}px`);
  return e;
}

module.exports = { derive, validate, LIMITS };
