// KOVA's design-specific build logic: the colorways as the page script's COLORWAYS, the drop day and time, the
// labels printed on the drawn shoe, and the rules the schema can't express. Runs at build time only.
'use strict';
const { FILTERS } = require('../../engine/template');
const { rgbHsl, hexRgb, contrast } = require('../../engine/colour');
const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const KEYS = ['upper', 'over', 'mid', 'sole', 'lace', 'acc', 'tongue'];

function derive(c) {
  const js = FILTERS.js, d = DAYS.indexOf(c.drop.day), [h, m] = c.drop.time.split(':').map(Number);
  const price = c.locale.currency + c.product.price;
  return {
    colorwaysJs: c.colorways.map((w) => `    { name: ${js(w.name)}, ${KEYS.map((k) => `${k}: '${w[k]}'`).join(', ')}, plate: '#26282b', bg: '${w.bg}' },`).join('\n'),
    dropDay: d, dropH: h, dropM: m, dayName: NAMES[d], dayLower: NAMES[d].toLowerCase(),
    priceText: price,
    soleText: FILTERS.esc(`${c.brand.name} ${c.product.name}`.toUpperCase()),
    shoeAlt: FILTERS.attr(`${c.brand.name} ${c.product.name} sneaker`),
    endTitle: `${c.product.name} · ${c.colorways[0].name}`,
    endSub: `${price} · Drops ${NAMES[d]}`,
  };
}

// the faded colorway name behind the shoe is 22vw in capitals inside the page column (100vw less two 4vw gutters):
// it fits up to 4.1 em. Calibrated in the stress test ("Ultraviolet" spilled).
const LIMITS = { colorName: 4.1 };

function validate(c, ctx) {
  const e = [];
  if (!DAYS.includes(c.drop.day)) e.push(`drop.day: one of ${DAYS.join(', ')}`);
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(c.drop.time)) e.push('drop.time: HH:MM (24-hour)');
  if (!Number.isInteger(c.product.price)) e.push('product.price: a whole number');
  c.colorways.forEach((w, i) => {
    for (const k of KEYS.concat('bg')) if (!/^#[0-9a-f]{6}$/i.test(w[k] || '')) e.push(`colorways.${i}.${k}: #rrggbb`);
    if (/^#[0-9a-f]{6}$/i.test(w.bg || '')) {
      // the colorway section's background sits behind ink text and the drawn shoe
      if (rgbHsl(...hexRgb(w.bg))[2] < 0.7) e.push(`colorways.${i}.bg: a pale background (lightness 0.7 or more), the text on it is near-black`);
      if (contrast('#0f1012', w.bg) < 7) e.push(`colorways.${i}.bg: too dark for the text on it`);
    }
  });
  for (const [i, w] of c.colorways.entries()) { const em = ctx.textEm('cname', String(w.name).toUpperCase()); if (em > LIMITS.colorName) e.push(`colorways.${i}.name: "${w.name}" is too wide for the big name behind the shoe (${em.toFixed(2)} em, room for ${LIMITS.colorName})`); }
  return e;
}

module.exports = { derive, validate, LIMITS };
