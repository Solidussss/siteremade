// Forno's design-specific build logic: the menu and the builder's toppings as the page script's MENU and TOPS, the
// filter counts, prices as the page shows them, pickup hours, and the rules the schema can't express (hours, prices,
// toppings, widths of the big type). Runs at build time only.
'use strict';
const { FILTERS } = require('../../engine/template');
const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
// the toppings the design can draw, and how many pieces one portion drops in the builder
const KINDS = { mozz: 7, salame: 9, nduja: 6, provola: 6, friar: 6, mush: 7, olive: 9, basil: 5, burrata: 1, garlic: 7, sausage: 10, morta: 5 };
const FINISH = ['oregano', 'oil', 'parm', 'honey', 'pist'];
const mins = (s) => { const [h, m] = s.split(':').map(Number); return h * 60 + m; };
const isTime = (s) => /^([01]\d|2[0-3]):(00|15|30|45)$/.test(s || '') || s === '24:00';
// a JS string as the original writes it: single quotes, or double quotes when the text has an apostrophe
const q = (s) => (s.includes("'") && !s.includes('"') ? FILTERS.jsd(s) : FILTERS.js(s));
const jsNum = (v) => String(+v.toFixed(4)).replace(/^0\./, '.');
const key = (t, i) => t.id || 't' + i;

function derive(c) {
  const cur = c.locale.currency, fmt = (v) => cur + v.toFixed(2), B = c.build, pies = c.menu.pies;
  const menuJs = pies.map((p) => {
    const o = p.finish.length ? `{ ${p.finish.map((f) => (f === 'oil' ? 'oil: 1' : `${f}: true`)).join(', ')} }` : '{}';
    const cat = [p.base].concat(p.veg ? ['veg'] : []);
    return `  { n: ${q(p.name)}, d: ${q(p.desc)}, p: ${jsNum(p.price)}, cat: [${cat.map(q).join(', ')}], tags: [${p.tags.map(q).join(', ')}], tops: [${p.toppings.map(([k, n]) => `[${q(k)}, ${n}]`).join(', ')}], o: ${o} }`;
  }).join(',\n');
  const topsJs = B.toppings.map((t, i) => `  { id: ${q(key(t, i))}, name: ${q(t.name)}, price: ${jsNum(t.price)}, n: ${KINDS[t.kind]}, type: ${q(t.kind)}${t.kind === 'burrata' ? ', max: 1' : ''} }`).join(',\n');
  const first = B.toppings[0];
  return {
    heroAccent: FILTERS.esc(c.hero.accent).replace(/ /g, '&nbsp;'),
    menuJs, topsJs,
    counts: { all: pies.length, rossa: pies.filter((p) => p.base === 'rossa').length, bianca: pies.filter((p) => p.base === 'bianca').length, veg: pies.filter((p) => p.veg).length },
    baseJs: jsNum(B.base), baseText: fmt(B.base),
    startTotal: fmt(B.base + first.price), startTotalJs: jsNum(B.base + first.price),
    firstTop: key(first, 0),
    partyStart: cur + 8 * c.party.avg, // the calculator opens at 8 people, hungry, no kids: 8 pies
    hoursJs: '[' + DAYS.map((d) => { const w = c.hours[d]; return w ? `[${mins(w.open)}, ${mins(w.close)}]` : 'null'; }).join(', ') + ']',
  };
}

// Phone (360px) nav row: logo (32px dough + name in Shrikhand 17px, wrapping to two lines) + sound button + order
// button (14px, 700); measured in Edge and WebKit, the longest name word plus the button text reaches the edge at 195px.
// Phone hero title 46px and section titles 42px in a 343px column: no single word wider than that.
// Calibrated in the stress test.
const LIMITS = { navRow: 188, heroWord: 7.0, titleWord: 7.6 };

function validate(c, ctx) {
  const e = [];
  // pickup hours
  const H = c.hours || {};
  for (const d of DAYS) {
    const w = H[d];
    if (w === undefined) { e.push(`hours.${d}: missing (use null for closed)`); continue; }
    if (w === null) continue;
    if (!isTime(w.open) || !isTime(w.close)) e.push(`hours.${d}: open and close as HH:MM on the quarter hour (24-hour)`);
    else if (mins(w.close) - mins(w.open) < 45) e.push(`hours.${d}: open at least 45 minutes (closing after midnight is not supported)`);
  }
  const open = DAYS.map((d) => !!H[d]);
  if (!open.some(Boolean)) e.push('hours: no open day');
  for (let i = 0; i < 7; i++) if (!open[i] && !open[(i + 1) % 7] && !open[(i + 2) % 7] && !open[(i + 3) % 7]) { e.push('hours: four closed days in a row (the pickup form shows the next four days)'); break; }
  // menu
  const cents = (v) => Math.abs(v * 100 - Math.round(v * 100)) < 1e-6;
  c.menu.pies.forEach((p, i) => {
    if (!cents(p.price)) e.push(`menu.pies.${i}.price: at most two decimals`);
    if (!p.toppings.length || p.toppings.length > 4) e.push(`menu.pies.${i}.toppings: 1-4 kinds`);
    for (const [k, n] of p.toppings) {
      if (!(k in KINDS)) e.push(`menu.pies.${i}.toppings: "${k}" is not a topping the design can draw (${Object.keys(KINDS).join(', ')})`);
      else if (!Number.isInteger(n) || n < 1 || n > (k === 'burrata' ? 1 : 14)) e.push(`menu.pies.${i}.toppings: ${k} count ${n} (1-${k === 'burrata' ? 1 : 14})`);
    }
    if (p.finish.some((f) => !FINISH.includes(f)) || new Set(p.finish).size !== p.finish.length) e.push(`menu.pies.${i}.finish: any of ${FINISH.join(', ')}, each once`);
    if (!['rossa', 'bianca'].includes(p.base)) e.push(`menu.pies.${i}.base: rossa or bianca`);
  });
  // builder
  const B = c.build, ids = B.toppings.map((t) => t.id).filter(Boolean);
  B.toppings.forEach((t, i) => { if (!(t.kind in KINDS)) e.push(`build.toppings.${i}.kind: "${t.kind}" is not one of ${Object.keys(KINDS).join(', ')}`); if (!cents(t.price)) e.push(`build.toppings.${i}.price: at most two decimals`); });
  if (ids.some((id) => !/^[a-z][a-z0-9]{0,9}$/.test(id))) e.push('build.toppings.*.id: lowercase letters and digits (or leave it out)');
  if (new Set(ids).size !== ids.length) e.push('build.toppings.*.id: ids must be different');
  if (new Set(B.toppings.map((t) => t.kind)).size !== B.toppings.length) e.push('build.toppings: each kind once');
  if (!cents(B.base)) e.push('build.base: at most two decimals');
  if (!Number.isInteger(c.party.avg)) e.push('party.avg: a whole number');
  if (!/^[A-Z]{2,4}$/.test(c.order.refPrefix)) e.push('order.refPrefix: 2-4 capital letters');
  // widths
  const em = (t) => ctx.textEm('display', String(t));
  for (const p of ['hero.title', 'hero.accent']) for (const w of String(ctx.get(c, p)).split(/\s+/)) if (em(w) > LIMITS.heroWord) e.push(`${p}: the word "${w}" is too wide for the hero on a phone (${em(w).toFixed(2)} em, room for ${LIMITS.heroWord})`);
  for (const p of ['menu.title', 'build.title', 'build.accent', 'party.title', 'party.accent', 'order.title', 'order.accent']) for (const w of String(ctx.get(c, p)).split(/\s+/)) if (em(w) > LIMITS.titleWord) e.push(`${p}: the word "${w}" is too wide for a phone (${em(w).toFixed(2)} em, room for ${LIMITS.titleWord})`);
  // (the logo name wraps onto two lines on small phones, as the original does; what must fit is its longest word)
  const nav = Math.max(...c.business.short.split(/\s+/).map(em)) * 17 + ctx.textEm('cta', c.nav.cta) * 14;
  if (nav > LIMITS.navRow) e.push(`business.short + nav.cta: the phone nav row needs ${Math.round(nav)}px of text, a 360px phone has ${LIMITS.navRow}px (the longest word of "${c.business.short}" + "${c.nav.cta}")`);
  return e;
}

module.exports = { derive, validate, LIMITS, KINDS };
