// Clutch's design-specific build logic: the editions as the page script's THEMES and SETS, the spec count-ups, the
// footer word's letters, and the rules the schema can't express. Runs at build time only.
'use strict';
const { FILTERS } = require('../../engine/template');
// the brick colours the rocket can be built from (the page's palette C)
const C = { white: '#f2f2ee', red: '#e3262f', blue: '#2c6cf0', yellow: '#ffc928', dark: '#2f333d', grey: '#9aa1ad', orange: '#ff7a1a', black: '#1c1e25', sky: '#56c6ff', green: '#2fa84f', pink: '#ff6fae', purple: '#7b4dff' };
const PARTS = ['body', 'accent', 'window', 'engine', 'tip'];
const key = (e, i) => e.id || 'e' + i;

function derive(c) {
  const js = FILTERS.js, esc = FILTERS.esc, E = c.sets.editions;
  const decimals = (v) => (String(v).includes('.') ? String(v).split('.')[1].length : 0);
  return {
    themesJs: E.map((e, i) => `    ${key(e, i)}: { ${PARTS.map((p) => `${p}: C.${e[p]}`).join(', ')} },`).join('\n'),
    setsJs: E.map((e, i) => `[${js(key(e, i))}, ${js(e.name)}, '${C[e.tint]}', ${e.price}]`).join(', '),
    firstKey: key(E[0], 0),
    heroAlt: `A brick ${c.sets.subject || 'rocket'} that builds itself as you scroll, then launches`,
    setNameAttr: FILTERS.attr(c.sets.name), setNameHtml: esc(c.sets.name), ageHtml: esc(c.sets.age), heightHtml: esc(c.sets.height),
    specsHtml: c.specs.items.map((s) => {
      const d = decimals(s.value), zero = d ? '0.' + '0'.repeat(d) : '0';
      return `      <div class="spec"><b data-to="${esc(s.value)}" data-dec="${d}"${s.prefix ? ` data-pre="${FILTERS.attr(s.prefix)}"` : ''}>${zero}<small>${esc(s.unit)}</small></b><span>${esc(s.text)}</span></div>`;
    }).join('\n'),
    footerLetters: [...c.brand.name].map((ch) => `<span>${ch === ' ' ? '&nbsp;' : esc(ch)}</span>`).join(''),
  };
}

function validate(c) {
  const e = [];
  const ids = c.sets.editions.map((x) => x.id).filter(Boolean);
  if (ids.some((id) => !/^[a-z][a-z0-9]{0,11}$/.test(id))) e.push('sets.editions.*.id: lowercase letters and digits (or leave it out)');
  if (new Set(ids).size !== ids.length) e.push('sets.editions.*.id: ids must be different');
  c.sets.editions.forEach((x, i) => {
    for (const p of PARTS.concat('tint')) if (!(x[p] in C)) e.push(`sets.editions.${i}.${p}: one of ${Object.keys(C).join(', ')}`);
    if (!Number.isInteger(x.price)) e.push(`sets.editions.${i}.price: a whole number`);
  });
  c.specs.items.forEach((s, i) => { if (!/^\d+(\.\d{1,3})?$/.test(s.value)) e.push(`specs.items.${i}.value: a plain number like 8.0, 0.005 or 1000000`); if (s.prefix && ![...s.prefix].every((ch) => '±~<>≈'.includes(ch))) e.push(`specs.items.${i}.prefix: ± ~ or ≈`); });
  return e;
}

module.exports = { derive, validate, COLOURS: C };
