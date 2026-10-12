// ONDO's design-specific build logic: the colourways as the page script's COLOURS, the big title letters, the spec
// tables, prices and labels drawn on the headphones, and the rules the schema can't express. Runs at build time only.
'use strict';
const { FILTERS } = require('../../engine/template');
const { rgbHsl, hexRgb } = require('../../engine/colour');
const KEYS = [['shell', 'shell'], ['hi', 'hi'], ['lo', 'lo'], ['pad', 'pad'], ['padHi', "'pad-hi'"], ['metal', 'metal'], ['metalLo', "'metal-lo'"], ['label', 'label']];
const key = (w, i) => w.id || 'c' + i;

function derive(c) {
  const js = FILTERS.js, esc = FILTERS.esc, full = `${c.brand.name} ${c.product.name}`;
  const letters = (s) => [...s.toUpperCase()].filter((ch) => ch.trim()).map((ch) => `<span>${esc(ch)}</span>`).join('');
  // non-breaking spaces between a number and its unit, and before the last word (as the original writes it)
  const nb = (s) => esc(s).replace(/(\d) (?=[A-Za-zµΩ°%])/g, '$1&nbsp;').replace(/ (\S+)$/, '&nbsp;$1');
  return {
    fullName: full,
    price: c.locale.currency + c.product.price,
    bigtype: `${letters(c.brand.name)}<span class="brk"></span>${letters(c.product.name)}`,
    cap1Title: nb(c.hero.caps[1].title),
    bandText: esc(c.brand.name.toUpperCase()),
    heroAlt: `${full} over-ear headphones with both drivers facing you`,
    cwAlt: `${full} in the selected colourway`,
    coloursJs: c.colourways.map((w, i) => `    { id: ${js(key(w, i))}, name: ${js(w.name)}, note: ${js(w.note)}, v: { ${KEYS.map(([k, out]) => `${out}: '${w[k]}'`).join(', ')} } },`).join('\n'),
    startDays: Math.floor(c.battery.on / 3),
    groupsHtml: c.specs.groups.map((g) => `      <div><h3>${esc(g.title)}</h3><table>\n${g.rows.map((r) => `        <tr><th scope="row">${esc(r.k)}</th><td>${esc(r.v)}</td></tr>`).join('\n')}\n      </table></div>`).join('\n'),
  };
}

// The giant outline words (brand over product in the hero, the colourway name behind the stand) bleed off the edges
// by design (the original's ONDO is 3.92 em, EMBER 4.72 em); a new name may bleed a little further, to 5 em,
// before it stops reading as a word. Checked on the sample brands' screenshots.
const LIMITS = { bigWord: 5.0, colourName: 5.0 };

function validate(c, ctx) {
  const e = [];
  const ids = c.colourways.map((w) => w.id).filter(Boolean);
  if (ids.some((id) => !/^[a-z][a-z0-9]{0,11}$/.test(id))) e.push('colourways.*.id: lowercase letters and digits (or leave it out)');
  if (new Set(ids).size !== ids.length) e.push('colourways.*.id: ids must be different');
  c.colourways.forEach((w, i) => {
    for (const [k] of KEYS) if (!/^#[0-9a-f]{6}$/i.test(w[k] || '')) e.push(`colourways.${i}.${k}: #rrggbb`);
    if (KEYS.every(([k]) => /^#[0-9a-f]{6}$/i.test(w[k] || ''))) {
      const L = (k) => rgbHsl(...hexRgb(w[k]))[2];
      if (!(L('hi') > L('shell') && L('shell') > L('lo'))) e.push(`colourways.${i}: hi must be lighter than shell, and lo darker (they shade the cups)`);
      if (!(L('padHi') > L('pad'))) e.push(`colourways.${i}: padHi must be lighter than pad`);
      if (!(L('metal') > L('metalLo'))) e.push(`colourways.${i}: metalLo must be darker than metal`);
    }
  });
  const B = c.battery;
  if (!(B.off >= B.on && B.on >= B.aware - 10)) e.push('battery: hours with ANC off should be at least the hours with ANC on');
  if (!Number.isInteger(c.product.price)) e.push('product.price: a whole number');
  const em = (t) => ctx.textEm('big', String(t).toUpperCase().replace(/\s+/g, ''));
  for (const p of ['brand.name', 'product.name']) if (em(ctx.get(c, p)) > LIMITS.bigWord) e.push(`${p}: too wide for the giant title (${em(ctx.get(c, p)).toFixed(2)} em, room for ${LIMITS.bigWord})`);
  c.colourways.forEach((w, i) => { if (em(w.name) > LIMITS.colourName) e.push(`colourways.${i}.name: too wide for the giant name (${em(w.name).toFixed(2)} em, room for ${LIMITS.colourName})`); });
  return e;
}

module.exports = { derive, validate, LIMITS };
