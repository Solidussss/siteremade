// Compass's design-specific build logic: the page scripts' data written from the content (the six steps, the route's
// words and numbers, the map's colours, programmes, questions and their scoring, call times, words and credentials)
// and the rules the schema can't express (one score per programme, a badge on a real programme, real times, widths
// of the big type). Runs at build time only.
'use strict';
const { FILTERS } = require('../../engine/template');
const js = FILTERS.js;

const WINDOWS = ['[0,.14]', '[.14,.3]', '[.3,.46]', '[.46,.66]', '[.66,.84]', '[.84,1]'];
const num = (n) => String(+(+n).toFixed(3)).replace(/^(-?)0\./, '$1.');
const list = (a) => a.map(js).join(',');

function derive(c) {
  const R = c.route;
  return {
    tel: c.contact.phone.replace(/[^\d+]/g, ''),
    businessSaid: c.business.name.replace(/\s*&\s*/g, ' and '),
    brandSaid: c.brand.name.replace(/\s*&\s*/g, ' and '),
    stagesJs: c.stages.map((s, i) => ` {n:${js(s.n)},c:${js(s.c)},w:${WINDOWS[i]}}`).join(',\n'),
    routeJs: `{start:${js(R.start)},goals:[${list(R.goals)}],sessions:${R.sessions},weeks:${R.weeks}}`,
    landJs: `{land:'#EEEADD',route:${js(c.theme.accent)},flag:${js(R.flag)}}`,
    progsJs: c.programmes.list.map((p) => ` {n:${js(p.n)},who:${js(p.who)},p:${num(p.p)},per:${js(p.per)},sessions:${js(p.sessions)},length:${js(p.length)},inc:[${list(p.inc)}],why:${js(p.why)}}`).join(',\n'),
    qsJs: c.fit.qs.map((q) => ` {q:${js(q.q)},a:[${q.a.map((a) => `[${js(a.t)},[${a.s.join(',')}]]`).join(',')}]}`).join(',\n'),
    timesJs: `[${list(c.call.times)}]`,
    wordsJs: `{sent:${js(c.call.words.sent)},reply:${js(c.call.words.reply)},taken:${js(c.call.words.taken)}}`,
    credsJs: `[${list(c.coach.creds)}]`,
  };
}

// Widths of the big display type (Spectral 500, -.015em; the second line italic), in em (metrics.json).
// Hero title: 1440x900 desktop, 86.4px (9.6vh) in a 520px column, 6 em; the two lines together may take four lines
// before the copy reaches the card (checked 1280x720 to 1920x1080). Phone: 48px in 288px on a 320px phone: no word
// wider than 6 em. Section titles: 41.6px there: no word wider than 6.9 em.
// Phone nav row on a 360px phone: the logo (28px), the brand (Spectral 23px) and the button (Onest 600, 14px, 36px of
// padding) with their gaps in 328px.
const LIMITS = { heroEm: 6, heroLines: 4, heroWord: 6, sectionWord: 6.9, navRow: 234 };
function wrapLines(words, width, em) { let n = 1, w = 0; const sp = em(' '); for (const word of words) { const ww = em(word); if (w && w + sp + ww > width) { n++; w = ww; } else w += (w ? sp : 0) + ww; } return n; }

function validate(c, ctx) {
  const e = [];
  const em = (t) => ctx.textEm('display', String(t)), it = (t) => ctx.textEm('italic', String(t));
  const words = (s) => String(s).split(/\s+/).filter(Boolean);
  const P = c.programmes.list.length;
  c.fit.qs.forEach((q, i) => q.a.forEach((a, j) => { if (a.s.length !== P) e.push(`fit.qs.${i}.a.${j}.s: one score for each programme (${P})`); }));
  if (c.programmes.badged >= P || !Number.isInteger(c.programmes.badged)) e.push(`programmes.badged: one of the programmes, 0 to ${P - 1}, or -1 for none`);
  c.call.times.forEach((t, i) => { if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(t)) e.push(`call.times.${i}: a time like 12:30 (24-hour)`); });
  // the big type
  const lines = wrapLines(words(c.hero.title), LIMITS.heroEm, em) + wrapLines(words(c.hero.titleEm), LIMITS.heroEm, it);
  if (lines > LIMITS.heroLines) e.push(`hero.title + hero.titleEm: the hero title takes ${lines} lines on a desktop (room for ${LIMITS.heroLines}); shorten one`);
  for (const [p, f] of [['hero.title', em], ['hero.titleEm', it]]) for (const w of words(ctx.get(c, p))) { const x = f(w); if (x > LIMITS.heroWord) e.push(`${p}: the word "${w}" is too wide for a phone (${x.toFixed(2)} em, room for ${LIMITS.heroWord})`); }
  for (const s of ['programmes', 'fit', 'call']) for (const [p, f] of [[`${s}.title`, em], [`${s}.titleEm`, it]]) for (const w of words(ctx.get(c, p))) { const x = f(w); if (x > LIMITS.sectionWord) e.push(`${p}: the word "${w}" is too wide for a phone (${x.toFixed(2)} em, room for ${LIMITS.sectionWord})`); }
  const nav = em(c.brand.name) * 23 + ctx.textEm('cta', c.nav.cta) * 14;
  if (nav > LIMITS.navRow) e.push(`brand.name + nav.cta: the phone nav row needs ${Math.round(nav)}px of text, a 360px phone has ${LIMITS.navRow}px`);
  return e;
}

module.exports = { derive, validate, LIMITS };
