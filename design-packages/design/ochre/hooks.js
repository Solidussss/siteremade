// Ochre & Ash's design-specific build logic: the page scripts' data written from the content (the appointment's seven
// steps, the menu with its levels, the shade looks, the team and the opening hours) and the rules the schema can't
// express (prices per level, menu ids, the client's colour, opening hours, widths of the big type). Build time only.
'use strict';
const { FILTERS } = require('../../engine/template');
const js = FILTERS.js;

// the hero's scroll window for each of the seven steps: the design's
const WINDOWS = ['[0,.12]', '[.12,.24]', '[.24,.44]', '[.44,.58]', '[.58,.70]', '[.70,.84]', '[.84,1]'];
const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const hr = (s) => { const [h, m] = s.split(':').map(Number); return +(h + m / 60).toFixed(4); };
const list = (a) => a.map(js).join(',');
const ids = (c) => c.menu.groups.flatMap((g) => g.items.map((i) => i.id));

function derive(c) {
  const digits = c.contact.phone.replace(/[^\d+]/g, '');
  const H = c.book.hours || {};
  return {
    tel: digits,
    businessSaid: c.business.name.replace(/\s*&\s*/g, ' and '),
    brandSaid: c.brand.name.replace(/\s*&\s*/g, ' and '),
    stagesJs: c.stages.map((s, i) => ` {n:${js(s.n)},c:${js(s.c)},time:${js(s.time)},w:${WINDOWS[i]}}`).join(',\n'),
    tonerJs: `{name:${js(c.client.toner.name)},hex:${js(c.client.toner.hex.toUpperCase())}}`,
    tiersJs: list(c.menu.tiers),
    menuJs: c.menu.groups.map((g) => ` {g:${js(g.g)},items:[\n${g.items.map((i) => `  {id:${js(i.id)},n:${js(i.n)},d:${js(i.d)},min:${i.min},p:[${i.p.join(',')}]}`).join(',\n')}]}`).join(',\n'),
    looksJs: c.shade.looks.map((l) => ` {n:${js(l.n)},lift:${l.lift},svc:${js(l.svc)},pattern:${js(l.pattern)},title:${js(l.title)}}`).join(',\n'),
    teamJs: c.team.people.map((p) => ` {n:${js(p.n)},lv:${p.lv},spec:${js(p.spec)},base:${p.base},lift:${p.lift},next:${js(p.next)}}`).join(',\n'),
    hoursJs: '[' + DAYS.map((d) => (H[d] ? `[${hr(H[d].open)},${hr(H[d].close)}]` : 'null')).join(',') + ']',
    firstLook: c.shade.looks[Math.min(2, c.shade.looks.length - 1)].title,
  };
}

// Widths of the big display type (Fraunces 400, -.015em), in em (metrics.json).
// Hero title: 1440x900 desktop, 81px (9vh) in a 540px column, 6.67 em; title and italic line together may take four
// lines before the copy reaches the client card (checked 1280x720 to 1920x1080). Phone: 44.8px in 288px on a 320px
// phone: no word wider than 6.4 em. Section titles: 38.4px on that phone: no word wider than 7.5 em.
// Phone nav row: the mark (26px) and brand (21px) and the booking button (14px DM Sans 600 + 34px) in 296px.
const LIMITS = { heroEm: 6.67, heroLines: 4, heroWord: 6.4, sectionWord: 7.5, navRow: 262 };
function wrapLines(words, width, em) { let n = 1, w = 0; const sp = em(' '); for (const word of words) { const ww = em(word); if (w && w + sp + ww > width) { n++; w = ww; } else w += (w ? sp : 0) + ww; } return n; }

function validate(c, ctx) {
  const e = [];
  const em = (t) => ctx.textEm('display', String(t));
  const words = (s) => String(s).split(/\s+/).filter(Boolean);
  // the menu: one price per level, ids unique and lowercase, whole minutes in quarter hours
  const T = c.menu.tiers.length, all = ids(c);
  c.menu.groups.forEach((g, gi) => g.items.forEach((it, ii) => {
    const p = `menu.groups.${gi}.items.${ii}`;
    if (it.p.length !== T) e.push(`${p}.p: one price per stylist level (${T})`);
    if (!/^[a-z][a-z0-9]{1,15}$/.test(it.id)) e.push(`${p}.id: lowercase letters and digits`);
    if (it.min % 15) e.push(`${p}.min: in quarter hours (15, 30, 45...)`);
    if (it.p.some((x) => !Number.isInteger(x))) e.push(`${p}.p: whole prices`);
  }));
  if (new Set(all).size !== all.length) e.push('menu: two services with the same id');
  c.shade.looks.forEach((l, i) => { if (!all.includes(l.svc)) e.push(`shade.looks.${i}.svc: "${l.svc}" is not a menu id`); if (!Number.isInteger(l.lift)) e.push(`shade.looks.${i}.lift: whole levels`); });
  if (!all.includes(c.book.first)) e.push(`book.first: "${c.book.first}" is not a menu id`);
  // the client and the team
  for (const k of ['natural', 'target', 'process', 'trim']) if (!Number.isInteger(c.client[k])) e.push(`client.${k}: a whole number`);
  if (c.client.target <= c.client.natural) e.push('client.target: lighter than the natural level (the hero paints a lift)');
  c.team.people.forEach((p, i) => { if (p.lv >= T) e.push(`team.people.${i}.lv: there are only ${T} stylist levels`); for (const k of ['lv', 'base', 'lift']) if (!Number.isInteger(p[k])) e.push(`team.people.${i}.${k}: a whole number`); if (p.lift < p.base) e.push(`team.people.${i}.lift: at least their base level`); });
  // opening hours: the half hours the booking offers
  const H = c.book.hours;
  if (!H) e.push('book.hours: the opening hours');
  else {
    if (!DAYS.some((d) => H[d])) e.push('book.hours: no open day');
    for (const d of DAYS) if (H[d]) for (const k of ['open', 'close']) if (!/:(00|30)$/.test(H[d][k] || '')) e.push(`book.hours.${d}.${k}: on the hour or half hour`);
  }
  if (!Number.isInteger(c.book.deposit)) e.push('book.deposit: a whole number');
  // the big type
  const lines = wrapLines(words(c.hero.title), LIMITS.heroEm, em) + wrapLines(words(c.hero.titleEm), LIMITS.heroEm, em);
  if (lines > LIMITS.heroLines) e.push(`hero.title + hero.titleEm: the hero title takes ${lines} lines on a desktop (room for ${LIMITS.heroLines}); shorten one`);
  for (const p of ['hero.title', 'hero.titleEm']) for (const w of words(ctx.get(c, p))) { const x = em(w); if (x > LIMITS.heroWord) e.push(`${p}: the word "${w}" is too wide for a phone (${x.toFixed(2)} em, room for ${LIMITS.heroWord})`); }
  for (const s of ['shade', 'menu', 'team', 'book']) for (const p of [`${s}.title`, `${s}.titleEm`]) for (const w of words(ctx.get(c, p))) { const x = em(w); if (x > LIMITS.sectionWord) e.push(`${p}: the word "${w}" is too wide for a phone (${x.toFixed(2)} em, room for ${LIMITS.sectionWord})`); }
  const nav = em(c.brand.name) * 21 + ctx.textEm('cta', c.nav.cta) * 14 + 34;
  if (nav > LIMITS.navRow) e.push(`brand.name + nav.cta: the phone nav row needs ${Math.round(nav)}px, a 360px phone has ${LIMITS.navRow}px ("${c.brand.name}" + "${c.nav.cta}")`);
  return e;
}

module.exports = { derive, validate, LIMITS };
