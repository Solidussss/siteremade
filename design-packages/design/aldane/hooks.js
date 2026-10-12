// Aldane's design-specific build logic: the configurator and spec table as the page script's CFG and SPEC, the text
// printed and engraved on the drawn watch, and the rules the schema can't express. Runs at build time only.
'use strict';
const { FILTERS } = require('../../engine/template');
// the configurator's options keep their drawn finishes (case metal, dial, strap) in this order
const KINDS = { case: [['steel', 'sw-steel'], ['ti', 'sw-ti'], ['gold', 'sw-gold']], dial: [['rh', 'sw-rh'], ['ink', 'sw-ink'], ['moss', 'sw-moss'], ['enamel', 'sw-enamel']], strap: [['tan', 'sw-tan'], ['cordovan', 'sw-cordovan'], ['suede', 'sw-suede'], ['oxblood', 'sw-oxblood']] };
const LINES = [4, 2, 3, 3]; // the spec table's rows as the original groups them in the script

function derive(c) {
  const js = FILTERS.js, esc = FILTERS.esc, C = c.configure;
  const opts = (grp, list) => `  ${grp}: [${list.map((o, i) => `[${js(KINDS[grp][i][0])}, ${js(o.name)}, ${o.price}, ${js(KINDS[grp][i][1])}]`).join(', ')}]`;
  const rows = c.specs.rows.map((r) => `[${[js(r.label)].concat(r.water ? [js('wr')] : r.mm != null ? [String(r.mm), js('len')].concat(r.note ? [js(r.note)] : []) : [js(r.value)].concat(r.note ? ['null', js(r.note)] : [])).join(', ')}]`);
  const lines = []; let k = 0;
  for (const n of LINES) { if (k >= rows.length) break; lines.push('  ' + rows.slice(k, k + n).join(', ')); k += n; }
  while (k < rows.length) { lines.push('  ' + rows.slice(k, k + 3).join(', ')); k += 3; }
  const W = c.specs.water;
  return {
    heroAccent: esc(c.hero.accent).replace(/(\d) (?=[a-zA-Z])/g, '$1&nbsp;'),
    pillsJs: c.hero.pills.map(js).join(', '),
    dialBrand: esc(c.brand.dialName), dialSub: esc(c.watch.dialSub), dialModel: esc(c.watch.dialModel), dialSub2: esc(c.watch.dialSub2), engraving: esc(c.watch.engraving),
    modelAttr: FILTERS.attr(c.watch.model), modelHtml: esc(c.watch.model), taxHtml: esc(C.taxNote), slotHtml: esc(c.reserve.slot),
    cfgJs: [opts('case', C.cases), opts('dial', C.dials), opts('strap', C.straps)].join(',\n'),
    specJs: lines.join(',\n'),
    wrM: `${W.m} m · ${W.bar} bar`,
    wrFt: `${Math.round(W.m * 3.28084 / 10) * 10} ft · ${W.bar} bar`,
  };
}

function validate(c) {
  const e = [];
  const C = c.configure;
  [['cases', C.cases], ['dials', C.dials], ['straps', C.straps]].forEach(([k, list]) => list.forEach((o, i) => { if (!Number.isInteger(o.price)) e.push(`configure.${k}.${i}.price: a whole number`); }));
  if (C.dials[0].price !== 0 || C.straps[0].price !== 0) e.push('configure: the first dial and strap are included in the case price (price 0)');
  c.specs.rows.forEach((r, i) => {
    const kinds = [r.water ? 1 : 0, r.mm != null ? 1 : 0, typeof r.value === 'string' ? 1 : 0].reduce((a, b) => a + b, 0);
    if (kinds !== 1) e.push(`specs.rows.${i}: exactly one of mm (a length in millimetres), value (text) or water: true`);
    if (r.mm != null && !(typeof r.mm === 'number' && r.mm > 0 && r.mm < 100)) e.push(`specs.rows.${i}.mm: a length in millimetres`);
  });
  if (c.specs.rows.filter((r) => r.water).length > 1) e.push('specs.rows: one water-resistance row at most');
  for (const k of ['dialName', 'dialSub', 'dialSub2', 'engraving']) { const v = k === 'dialName' ? c.brand.dialName : c.watch[k]; if (v && v !== v.toUpperCase()) e.push(`${k === 'dialName' ? 'brand' : 'watch'}.${k}: capitals, as printed on the dial`); }
  return e;
}

module.exports = { derive, validate };
