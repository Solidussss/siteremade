'use strict';
// HERO ART -- the registry of complete pictures. Each KIND composes the parts in
// ./hero-art, ./hero-art-outdoor, ./hero-art-interior, ./hero-art-objects and
// ./hero-art-ui into one framed illustration for one hero layer: backdrop,
// the subject large and centred (inside the middle ~70% so the layer's crop and
// camera move never lose it), and a few supporting props.
//
// drawArt({ kind, params }, { aspect, accent, tone, role, seed, uid }) -> HTML
//   params (all optional): label (the business name, printed on packaging),
//   sub, flavours[], variant, variants[], items[] (the owner's own words for
//   UI labels / menu boards), audience, reminders, colour.
const A = require('./hero-art');
const O = require('./hero-art-outdoor');
const I = require('./hero-art-interior');
const B = require('./hero-art-objects');
const U = require('./hero-art-ui');
const { lighten, darken, mix, FLAVOUR_COLOURS, flavourColour } = A;
const { rect, circ, ell, path, line, g, n1 } = A._svg;

const BOX = { '16:9': [640, 360], '4:3': [560, 420], '1:1': [480, 480], '4:5': [480, 600], '3:4': [480, 640] };
const fl = (p, i) => { const f = (p.flavours || [])[i]; return f || (p.flavours || [])[0] || null; };
const fc = (p, i, d) => flavourColour(fl(p, i)) || d;
const brand = p => String(p.label || '').slice(0, 22);
const tall = e => e.h / e.w; // >1 portrait
// the size of a standing product for this frame: tall frames get a taller product
const prodH = e => Math.min(e.h * 0.62, e.w * (tall(e) > 1.05 ? 1.0 : 0.72));

// ---- retail: drinks ---------------------------------------------------------------------------------------------------
function canHero(e, p) {
  const H = prodH(e); const base = e.cy + H * 0.5; const c = fc(p, 0, e.accent);
  let s = A.studio(e, { horizon: (base - H * 0.02) / e.h });
  if (fl(p, 1)) s += A.flavourPiece(e, fl(p, 1), e.cx - H * 0.42, base - H * 0.08, H * 0.12);
  s += A.flavourPiece(e, fl(p, 0) || 'citrus', e.cx + H * 0.4, base - H * 0.06, H * 0.14);
  s += A.can(e, e.cx, base, H, c, { label: brand(p) || 'Sparkling', sub: fl(p, 0) || '', fruit: fl(p, 0), cold: true, detail: e.detail });
  return s + A.bubbles(e, e.cx - H * 0.6, base - H * 1.05, H * 1.2, H * 0.4, 16, 0.35);
}
function canRange(e, p) {
  const fls = (p.flavours || []).slice(0, 3); while (fls.length < 3) fls.push(fls[fls.length - 1] || null);
  const H = prodH(e) * 0.82; const base = e.cy + H * 0.52; let s = A.studio(e, { horizon: (base - 2) / e.h });
  const xs = [e.cx - H * 0.56, e.cx + H * 0.56, e.cx];
  fls.forEach((f, i) => { const hh = i === 2 ? H * 1.05 : H * 0.92; s += A.can(e, xs[i], base + (i === 2 ? H * 0.04 : 0), hh, flavourColour(f) || [e.accent, lighten(e.accent, 0.3), darken(e.accent, 0.2)][i], { label: brand(p) || 'Sparkling', sub: f || '', fruit: f, cold: true }); });
  return s;
}
function canIce(e, p) {
  const c = fc(p, 0, e.accent); const W = Math.min(e.w * 0.78, e.h * 0.95); const y = e.h * 0.8;
  let s = A.studio(e, { horizon: 0.64, wall: e.dark ? mix('#0c2233', e.accent, 0.2) : mix('#dff0f6', e.accent, 0.1) });
  s += ell(e.cx, y + W * 0.04, W * 0.5, W * 0.12, darken('#b9c4cc', 0.2)) + path(`M${n1(e.cx - W * 0.5)} ${n1(y - W * 0.1)} L${n1(e.cx - W * 0.42)} ${n1(y + W * 0.12)} L${n1(e.cx + W * 0.42)} ${n1(y + W * 0.12)} L${n1(e.cx + W * 0.5)} ${n1(y - W * 0.1)} Z`, e.lin([[0, '#9aa5ad'], [0.3, '#eef3f6'], [0.6, '#b9c4cc'], [1, '#76818a']]));
  s += A.can(e, e.cx + W * 0.06, y - W * 0.04, W * 0.62, c, { label: brand(p), sub: fl(p, 0) || '', cold: true });
  const R = A.rng(A.hashStr('ice' + e.uid)); for (let i = 0; i < 26; i++) { const x = e.cx - W * 0.46 + R() * W * 0.92, yy = y - W * 0.12 + R() * W * 0.06; s += rect(x, yy, W * 0.08, W * 0.07, '#f4fbff', { opacity: 0.85, rx: 3 * e.s, transform: `rotate(${n1(R() * 60 - 30)} ${n1(x)} ${n1(yy)})`, stroke: '#cfe6f2', 'stroke-width': n1(1 * e.s) }); }
  return s + ell(e.cx, y - W * 0.1, W * 0.5, W * 0.05, 'none', { stroke: '#dfe7ec', 'stroke-width': n1(4 * e.s) });
}
function bottleHero(e, p) {
  if (p.range && (p.flavours || []).length > 1) return bottleRange(e, p);
  const H = prodH(e) * 1.02; const base = e.cy + H * 0.5; const v = p.variant || 'kombucha'; const c = fc(p, 0, e.accent);
  const glass = { wine: '#2f4a2a', beer: '#5a3b1d', kombucha: '#dbe7dc', juice: '#eef3ee', spirit: '#e9eef0', woozy: '#eee7da', oil: '#9aa84a', toner: '#e9e1d6' }[v] || '#dbe7dc';
  const liquid = { kombucha: c, juice: c, woozy: fc(p, 0, '#c9291d'), spirit: '#f3e7c4', toner: '#f7f1e8' }[v];
  let s = A.studio(e, { horizon: (base - 2) / e.h });
  if (fl(p, 0)) s += A.flavourPiece(e, fl(p, 0), e.cx + H * 0.34, base - H * 0.07, H * 0.12);
  if (fl(p, 1)) s += A.flavourPiece(e, fl(p, 1), e.cx - H * 0.36, base - H * 0.06, H * 0.1);
  s += A.bottle(e, e.cx, base, H, glass, { style: v, liquid, label: brand(p), labelColour: '#f4efe6', labelBand: c, fruit: v !== 'wine' && v !== 'beer' ? fl(p, 0) : null, serif: v === 'wine', cold: v === 'beer' || v === 'kombucha' || v === 'juice' });
  return s;
}
// a bottled range: one bottle per stated flavour, the liquid showing the flavour
function bottleRange(e, p) {
  const fls = p.flavours.slice(0, 3); const v = p.variant || 'kombucha'; const H = prodH(e) * 0.9; const base = e.cy + H * 0.52;
  let s = A.studio(e, { horizon: (base - 2) / e.h });
  const gap = Math.min(e.w * 0.28, H * 0.42); const order = fls.length === 3 ? [0, 2, 1] : [0, 1];
  order.forEach(i => { const x = e.cx + (i - (fls.length - 1) / 2) * gap; const hh = i === 1 && fls.length === 3 ? H : H * 0.9; s += A.bottle(e, x, base + (i === 1 ? H * 0.02 : 0), hh, v === 'wine' ? '#2f4a2a' : '#dbe7dc', { style: v, liquid: flavourColour(fls[i]) || e.accent, label: brand(p), labelColour: '#f4efe6', labelBand: flavourColour(fls[i]) || e.accent, fruit: v !== 'wine' ? fls[i] : null, cold: true }); });
  return s;
}
function drinkPour(e, p) {
  const v = p.variant || 'rocks'; const c = fc(p, 0, v === 'pint' ? '#e0a33a' : e.accent); const H = Math.min(e.h * 0.56, e.w * 0.7); const base = e.cy + H * 0.46;
  let s = A.studio(e, { horizon: (base - 2) / e.h });
  if (p.container === 'can') s += A.can(e, e.cx + H * 0.52, base, H * 0.8, c, { label: brand(p), sub: fl(p, 0) || '', cold: true });
  else if (p.container === 'bottle') s += A.bottle(e, e.cx + H * 0.5, base, H * 0.9, '#dbe7dc', { style: 'kombucha', liquid: c, label: brand(p), labelBand: c });
  s += I.glassware(e, e.cx - (p.container ? H * 0.12 : 0), base, H * 0.8, v, lighten(c, 0.15), { garnish: fl(p, 0) && /lemon|lime|orange|grapefruit|yuzu|citrus/.test(fl(p, 0)) ? fl(p, 0) : (v === 'coupe' ? 'orange' : null), garnishSprig: /mint|basil/.test(fl(p, 0) || '') });
  if (fl(p, 1)) s += A.flavourPiece(e, fl(p, 1), e.cx - H * 0.5, base - H * 0.06, H * 0.11);
  return s + A.bubbles(e, e.cx - H * 0.3, base - H * 0.6, H * 0.36, H * 0.4, 14, 0.5);
}
function fruitSplash(e, p) {
  const fls = (p.flavours && p.flavours.length ? p.flavours : ['citrus']).slice(0, 3); const r = Math.min(e.w, e.h) * 0.16;
  let s = A.studio(e, { horizon: 0.78, wall: e.dark ? mix(fc(p, 0, e.accent), '#0c0c10', 0.7) : mix(fc(p, 0, e.accent), '#ffffff', 0.78) });
  // a crown of splashing water behind the fruit
  s += path(`M${n1(e.cx - r * 2.4)} ${n1(e.cy + r * 0.8)} Q${n1(e.cx - r * 2)} ${n1(e.cy - r * 1.6)} ${n1(e.cx - r * 1.2)} ${n1(e.cy - r * 0.6)} Q${n1(e.cx - r * 0.6)} ${n1(e.cy - r * 2.4)} ${n1(e.cx)} ${n1(e.cy - r * 0.9)} Q${n1(e.cx + r * 0.6)} ${n1(e.cy - r * 2.3)} ${n1(e.cx + r * 1.2)} ${n1(e.cy - r * 0.6)} Q${n1(e.cx + r * 2)} ${n1(e.cy - r * 1.5)} ${n1(e.cx + r * 2.4)} ${n1(e.cy + r * 0.8)} Z`, e.lin([[0, '#ffffff', 0.85], [1, '#cfe9f5', 0.35]], { x1: 0, y1: 0, x2: 0, y2: 1 }));
  A.droplets && (s += A.droplets(e, e.cx - r * 2.6, e.cy - r * 2.6, r * 5.2, r * 2, 28));
  const spots = [[0, -0.1, 1.15], [-1.35, 0.55, 0.85], [1.35, 0.5, 0.9]];
  fls.concat(fls).slice(0, 3).forEach((f, i) => { const [dx, dy, k] = spots[i]; s += A.flavourPiece(e, f, e.cx + dx * r, e.cy + dy * r, r * k); });
  return s + A.bubbles(e, e.cx - r * 2.5, e.cy - r * 1.5, r * 5, r * 3.4, 30, 0.55);
}
// ---- retail: skincare ------------------------------------------------------------------------------------------------------
const SKIN = { dropper: (e, x, b, H, c, o) => A.dropper(e, x, b, H * 0.95, c || '#b8742f', o), pump: (e, x, b, H, c, o) => A.pump(e, x, b, H, c || '#ece5da', o), jar: (e, x, b, H, c, o) => A.jar(e, x, b, H * 0.42, c || '#f1ece6', Object.assign({ ribs: true, wide: 1.2 }, o)), tube: (e, x, b, H, c, o) => A.tube(e, x, b - H * 0.12, H * 0.8, c || '#f3d9c6', Object.assign({ angle: -18 }, o)), tin: (e, x, b, H, c, o) => A.tin(e, x, b, H * 0.55, c || '#c9ccd1', o), toner: (e, x, b, H, c, o) => A.bottle(e, x, b, H * 0.9, c || '#ece4d8', Object.assign({ style: 'toner', liquid: '#f7f1e8' }, o)), bar: (e, x, b, H, c) => soapBar(e, x, b, H * 0.5, c) };
const SKIN_SUB = { dropper: 'serum', pump: 'cleanser', jar: 'cream', tube: 'SPF', tin: 'balm', toner: 'toner', bar: 'soap' };
function soapBar(e, x, baseY, W, c) { const col = e.tint(c || '#efe6d8'); return e.shadow(x, baseY, W * 0.6, W * 0.08, 0.3) + rect(x - W / 2, baseY - W * 0.34, W, W * 0.34, e.lin([[0, lighten(col, 0.15)], [1, darken(col, 0.15)]], { x1: 0, y1: 0, x2: 0, y2: 1 }), { rx: W * 0.12 }) + ell(x, baseY - W * 0.34, W * 0.48, W * 0.06, lighten(col, 0.25)) + A.sprig(e, x - W * 0.2, baseY - W * 0.36, W * 0.4, -10); }
function stone(e, x, y, w, h) { return e.shadow(x, y + h * 0.6, w * 0.6, h * 0.18, 0.3) + ell(x, y, w / 2, h / 2, e.rad([[0, e.tint('#f1ebe2')], [0.7, e.tint('#ddd3c4')], [1, e.tint('#b9ad9a')]], { cx: 0.35, cy: 0.3 })) + ell(x, y - h * 0.18, w * 0.44, h * 0.18, '#fff', { opacity: 0.25 }); }
function skincareHero(e, p) {
  const v = SKIN[p.variant] ? p.variant : 'dropper'; const H = prodH(e) * 0.92; const base = e.cy + H * 0.5;
  let s = A.studio(e, { horizon: (base + H * 0.02) / e.h, wall: e.dark ? undefined : mix(e.accent, '#f3efe8', 0.9) });
  s += stone(e, e.cx, base + H * 0.02, H * 0.9, H * 0.16) + A.sprig(e, e.cx - H * 0.46, base - H * 0.02, H * 0.46, -62);
  s += SKIN[v](e, e.cx, base, H, null, { label: brand(p), sub: p.sub || SKIN_SUB[v] });
  return s + ell(e.cx - H * 0.2, e.cy - H * 0.55, H * 0.5, H * 0.3, '#fff', { opacity: e.dark ? 0.05 : 0.25 });
}
function skincareRange(e, p) {
  const vs = (p.variants && p.variants.length ? p.variants : ['pump', 'dropper', 'jar']).filter(v => SKIN[v]).slice(0, 3); const H = prodH(e) * (e.w > e.h * 1.2 ? 0.9 : 0.72); const base = e.cy + H * 0.62;
  let s = A.studio(e, { horizon: (base + 2) / e.h, wall: e.dark ? undefined : mix(e.accent, '#f3efe8', 0.9) }) + stone(e, e.cx, base + H * 0.03, e.w * 0.9, H * 0.16);
  const n = vs.length; const gap = Math.min(e.w * 0.3, H * 0.6);
  vs.forEach((v, i) => { const x = e.cx + (i - (n - 1) / 2) * gap; s += SKIN[v](e, x, base, v === 'jar' || v === 'tin' ? H * 0.9 : H * (i === 1 ? 1.08 : 0.95), null, { label: brand(p), sub: SKIN_SUB[v] }); });
  return s + A.sprig(e, e.cx + gap * 1.2, base - 2, H * 0.4, -120);
}
function textureSwatch(e, p) {
  const c = e.tint(p.colour || '#f3e6d8'); let s = rect(0, 0, e.w, e.h, e.lin([[0, e.dark ? '#1d1a1a' : '#ece6de'], [1, e.dark ? '#121010' : '#d9d1c5']], { x1: 0, y1: 0, x2: 1, y2: 1 }));
  s += path(`M${n1(e.w * 0.08)} ${n1(e.h * 0.62)} C${n1(e.w * 0.25)} ${n1(e.h * 0.3)} ${n1(e.w * 0.55)} ${n1(e.h * 0.28)} ${n1(e.w * 0.9)} ${n1(e.h * 0.4)} C${n1(e.w * 0.94)} ${n1(e.h * 0.52)} ${n1(e.w * 0.6)} ${n1(e.h * 0.66)} ${n1(e.w * 0.3)} ${n1(e.h * 0.72)} C${n1(e.w * 0.14)} ${n1(e.h * 0.76)} ${n1(e.w * 0.05)} ${n1(e.h * 0.7)} ${n1(e.w * 0.08)} ${n1(e.h * 0.62)} Z`, e.lin([[0, lighten(c, 0.35)], [0.5, c], [1, darken(c, 0.12)]], { x1: 0, y1: 0, x2: 0.6, y2: 1 }));
  for (let i = 0; i < 6; i++) s += path(`M${n1(e.w * (0.14 + i * 0.1))} ${n1(e.h * (0.64 - i * 0.03))} Q${n1(e.w * (0.3 + i * 0.1))} ${n1(e.h * (0.44 - i * 0.02))} ${n1(e.w * (0.5 + i * 0.07))} ${n1(e.h * (0.46 - i * 0.01))}`, 'none', { stroke: '#ffffff', 'stroke-width': n1(2.2 * e.s), opacity: 0.4 });
  s += circ(e.w * 0.72, e.h * 0.34, e.w * 0.09, e.rad([[0, '#fff'], [0.6, lighten(c, 0.2)], [1, darken(c, 0.1)]], { cx: 0.35, cy: 0.3 })) + A.bubbles(e, e.w * 0.2, e.h * 0.36, e.w * 0.6, e.h * 0.3, 16, 0.6);
  if (p.variant) s += SKIN[p.variant] ? SKIN[p.variant](e, e.w * 0.8, e.h * 0.92, e.h * 0.36, null, { label: brand(p), sub: SKIN_SUB[p.variant] }) : '';
  return s;
}
function botanicals(e, p) {
  let s = rect(0, 0, e.w, e.h, e.lin([[0, e.tint('#efe9df')], [1, e.tint('#dcd3c4')]], { x1: 0, y1: 0, x2: 1, y2: 1 }));
  const R = A.rng(A.hashStr('bot' + e.uid)); const m = Math.min(e.w, e.h);
  for (let i = 0; i < 7; i++) s += A.leaf(e, e.w * (0.1 + R() * 0.8), e.h * (0.1 + R() * 0.8), m * (0.2 + R() * 0.16), R() * 360, e.tint(i % 2 ? '#6e9a58' : '#89ad6c'));
  for (let i = 0; i < 5; i++) { const x = e.w * (0.18 + R() * 0.64), y = e.h * (0.18 + R() * 0.64); for (let q = 0; q < 10; q++) { const a = q / 10 * Math.PI * 2; s += ell(x + Math.cos(a) * m * 0.035, y + Math.sin(a) * m * 0.035, m * 0.03, m * 0.012, '#fbf8f1', { transform: `rotate(${n1(a * 57)} ${n1(x + Math.cos(a) * m * 0.035)} ${n1(y + Math.sin(a) * m * 0.035)})` }); } s += circ(x, y, m * 0.022, '#f2c23b'); }
  for (let i = 0; i < 26; i++) s += ell(e.w * R(), e.h * R(), m * 0.014, m * 0.007, '#e8d9b8', { transform: `rotate(${n1(R() * 180)} ${n1(e.w * 0.5)} ${n1(e.h * 0.5)})` });
  s += path(`M${n1(e.w * 0.62)} ${n1(e.h * 0.9)} Q${n1(e.w * 0.66)} ${n1(e.h * 0.5)} ${n1(e.w * 0.76)} ${n1(e.h * 0.2)} Q${n1(e.w * 0.8)} ${n1(e.h * 0.55)} ${n1(e.w * 0.7)} ${n1(e.h * 0.9)} Z`, e.lin([[0, '#9cc58a'], [1, '#5f8f4e']]));
  return s;
}
function basinRitual(e, p) {
  let s = I.tileGrid(e, 0, 0, e.w, e.h * 0.62, '#eef0ef', { size: 42 }) + rect(0, e.h * 0.62, e.w, e.h * 0.38, e.lin([[0, '#f7f5f1'], [1, '#d6d0c7']], { x1: 0, y1: 0, x2: 0, y2: 1 }));
  s += ell(e.w * 0.62, e.h * 0.7, e.w * 0.28, e.h * 0.06, '#ffffff', { stroke: '#dcdfe1', 'stroke-width': n1(2 * e.s) }) + I.faucetShape(e, e.w * 0.62, e.h * 0.66, e.h * 0.22, false);
  const vs = (p.variants && p.variants.length ? p.variants : ['pump', 'dropper']).filter(v => SKIN[v]).slice(0, 2);
  vs.forEach((v, i) => { s += SKIN[v](e, e.w * (0.18 + i * 0.15), e.h * 0.64, e.h * 0.32, null, { label: brand(p), sub: SKIN_SUB[v] }); });
  s += B.towelRoll(e, e.w * 0.3, e.h * 0.84, e.h * 0.06) + I.plantPot(e, e.w * 0.9, e.h * 0.64, e.h * 0.26);
  return s;
}
// ---- retail: pantry & home ---------------------------------------------------------------------------------------------------
function pantryHero(e, p) {
  const v = p.variant || 'jar'; const H = prodH(e) * 0.95; const base = e.cy + H * 0.5; const c = fc(p, 0, v === 'woozy' ? '#c9291d' : '#e0a21a');
  let s = A.studio(e, { horizon: (base + 2) / e.h, floor: e.tint('#6b4a33') });
  s += rect(e.cx - H * 0.8, base - H * 0.02, H * 1.6, H * 0.08, e.lin([[0, '#a57a4c'], [1, '#6b4a33']], { x1: 0, y1: 0, x2: 0, y2: 1 }), { rx: 4 * e.s });
  if (v === 'woozy') s += A.bottle(e, e.cx, base, H, '#eee7da', { style: 'woozy', liquid: c, label: brand(p), labelColour: '#f6efe2', labelBand: c });
  else if (v === 'pouch') s += A.pouch(e, e.cx, base, H * 0.86, e.tint(p.colour || '#8a6a4a'), { label: brand(p), sub: p.sub || '', valve: true });
  else if (v === 'bar') s += chocolate(e, e.cx, base - H * 0.2, H * 0.9, c);
  else if (v === 'tin') s += A.tin(e, e.cx, base, H * 0.8, e.tint(c), { label: brand(p) });
  else s += A.jar(e, e.cx, base, H * 0.66, lighten(c, 0.2), { lid: e.tint('#2d2a27'), contents: c, label: brand(p), sub: p.sub || '', wide: 0.9, labelColour: '#f6efe2' });
  (p.flavours || []).slice(0, 2).forEach((f, i) => { s += A.flavourPiece(e, f, e.cx + (i ? -1 : 1) * H * 0.5, base - H * 0.08, H * 0.12); });
  return s;
}
function chocolate(e, x, y, W, c) { const u = W / 100; let s = e.shadow(x, y + 36 * u, W * 0.45, W * 0.05, 0.3) + g(rect(-40 * u, -30 * u, 80 * u, 60 * u, '#5b3a1e', { rx: 3 * u }) + Array.from({ length: 12 }, (_, i) => rect(-38 * u + (i % 4) * 19.5 * u, -28 * u + Math.floor(i / 4) * 19 * u, 17 * u, 17 * u, e.lin([[0, '#7a4e2a'], [1, '#4a2d15']], { x1: 0, y1: 0, x2: 1, y2: 1 }), { rx: 2 * u })).join('') + path(`M${n1(-42 * u)} ${n1(4 * u)} L${n1(42 * u)} ${n1(-10 * u)} L${n1(42 * u)} ${n1(32 * u)} L${n1(-42 * u)} ${n1(32 * u)} Z`, e.tint(c || e.accent)), { transform: `translate(${n1(x)} ${n1(y)}) rotate(-8)` }); return s; }
function ingredients(e, p) {
  const fls = (p.flavours && p.flavours.length ? p.flavours : ['chili', 'garlic', 'lime']); const m = Math.min(e.w, e.h);
  let s = rect(0, 0, e.w, e.h, e.lin([[0, e.tint('#3a3633')], [1, e.tint('#22201e')]], { x1: 0, y1: 0, x2: 1, y2: 1 }));
  const R = A.rng(A.hashStr('ing' + e.uid)); for (let i = 0; i < 40; i++) s += circ(e.w * R(), e.h * R(), (0.6 + R()) * e.s, '#6a625a', { opacity: 0.5 });
  const spots = [[0.3, 0.35, 0.16], [0.68, 0.3, 0.14], [0.52, 0.64, 0.17], [0.22, 0.72, 0.12], [0.8, 0.7, 0.12]];
  spots.forEach(([fx, fy, k], i) => { s += A.flavourPiece(e, fls[i % fls.length], e.w * fx, e.h * fy, m * k); });
  for (let i = 0; i < 30; i++) s += circ(e.w * (0.2 + R() * 0.6), e.h * (0.2 + R() * 0.6), (1 + R() * 1.4) * e.s, R() > 0.5 ? '#c9291d' : '#e0a21a', { opacity: 0.8 });
  return s;
}
function plated(e, p) {
  const r = Math.min(e.w * 0.36, e.h * 0.5); let s = rect(0, 0, e.w, e.h, e.lin([[0, e.tint(e.dark ? '#2a221d' : '#e9e1d6')], [1, e.tint(e.dark ? '#16110e' : '#cfc3b3')]], { x1: 0, y1: 0, x2: 0, y2: 1 }));
  if (e.dark) s += circ(e.cx, e.cy - r * 0.2, r * 1.6, '#ffcf8a', { opacity: 0.12 });
  s += B.plate(e, e.cx, e.cy + r * 0.1, r, p.variant || 'generic');
  s += line(e.cx - r * 1.35, e.cy - r * 0.2, e.cx - r * 1.35, e.cy + r * 0.6, '#c9ccd1', 3 * e.s) + line(e.cx + r * 1.35, e.cy - r * 0.2, e.cx + r * 1.35, e.cy + r * 0.6, '#c9ccd1', 3 * e.s);
  if (p.glass !== false) s += I.glassware(e, e.cx + r * 1.15, e.cy - r * 0.35, r * 0.7, 'wine', p.variant === 'pizza' || p.variant === 'pasta' ? '#7a1f2b' : '#e7d9a8');
  return s;
}
function homeObject(e, p) {
  const v = p.variant || 'candle'; const H = prodH(e); const base = e.cy + H * 0.5; let s = A.studio(e, { horizon: (base + 2) / e.h });
  s += rect(e.cx - e.w * 0.46, base - 2, e.w * 0.92, H * 0.07, e.lin([[0, e.tint('#c8a57a')], [1, e.tint('#8f6a45')]], { x1: 0, y1: 0, x2: 0, y2: 1 }), { rx: 3 * e.s });
  if (v === 'candle') s += A.candle(e, e.cx + H * 0.1, base, H * 0.5, e.tint('#e8ddcc'), { label: brand(p), sub: p.sub || 'soy candle' }) + A.ceramic(e, e.cx - H * 0.46, base, H * 0.55, e.tint('#8fa89b'), { form: 'vase', stems: true });
  else if (v === 'mug') s += A.ceramic(e, e.cx - H * 0.2, base, H * 0.36, e.tint(p.colour || '#d9cbb6'), { form: 'mug' }) + A.ceramic(e, e.cx + H * 0.28, base, H * 0.28, e.tint('#8fa89b'), { form: 'mug' }) + A.ceramic(e, e.cx + H * 0.02, base - H * 0.02, H * 0.14, e.tint('#e9e1d4'), { form: 'bowl' });
  else s += A.ceramic(e, e.cx, base, H * 0.85, e.tint(p.colour || '#8fa89b'), { form: 'vase', stems: true }) + A.ceramic(e, e.cx + H * 0.42, base, H * 0.3, e.tint('#e7dccb'), { form: 'mug' });
  return s;
}
function workbench(e, p) {
  let s = rect(0, 0, e.w, e.h * 0.6, e.tint('#e9e0d2')) + rect(0, e.h * 0.6, e.w, e.h * 0.4, e.lin([[0, e.tint('#a57a4c')], [1, e.tint('#6b4a33')]], { x1: 0, y1: 0, x2: 0, y2: 1 }));
  for (let i = 0; i < 5; i++) s += line(0, e.h * (0.64 + i * 0.07), e.w, e.h * (0.63 + i * 0.07), e.tint('#7a5538'), 1.2 * e.s, { opacity: 0.5 });
  s += rect(e.w * 0.08, e.h * 0.18, e.w * 0.84, 4 * e.s, '#6b4a33');
  const v = p.variant || 'candle';
  if (v === 'candle') { for (let i = 0; i < 4; i++) s += A.candle(e, e.w * (0.18 + i * 0.12), e.h * 0.18, e.h * 0.08, e.tint('#e8ddcc'), { noLabel: true }); s += I.paintCan(e, e.w * 0.62, e.h * 0.72, e.h * 0.2, '#f3e6c4', { open: true }) + A.candle(e, e.w * 0.32, e.h * 0.76, e.h * 0.16, e.tint('#e8ddcc'), { noLabel: true }); }
  else if (v === 'pottery') { s += ell(e.cx, e.h * 0.74, e.w * 0.26, e.h * 0.05, '#5a5f66') + A.ceramic(e, e.cx, e.h * 0.72, e.h * 0.3, e.tint('#c9a27a'), { form: 'vase' }); for (let i = 0; i < 4; i++) s += A.ceramic(e, e.w * (0.18 + i * 0.13), e.h * 0.18, e.h * 0.1, e.tint(['#8fa89b', '#d9cbb6', '#b56576', '#e9e1d4'][i]), { form: i % 2 ? 'mug' : 'vase' }); }
  else { s += I.drill(e, e.w * 0.3, e.h * 0.86, e.w * 0.22) + I.sawhorse(e, e.w * 0.7, e.h * 0.92, e.w * 0.3); }
  return s;
}
// ---- apparel -------------------------------------------------------------------------------------------------------------------
function apparel(e, p) {
  const v = p.variant || 'hoodie'; const m = Math.min(e.w, e.h * 0.8); const c = p.colour || (e.dark ? lighten(e.accent, 0.15) : e.accent);
  let s = A.studio(e, { horizon: 0.84 });
  if (v === 'hoodie' || v === 'tee' || v === 'jacket') { s += B.hanger(e, e.cx, e.cy - m * 0.46, m * 0.4); s += v === 'tee' ? B.tee(e, e.cx, e.cy - m * 0.38, m * 0.78, c) : B.hoodie(e, e.cx, e.cy - m * 0.36, m * 0.74, c); }
  else if (v === 'jeans') s += B.jeansStack(e, e.cx, e.cy + m * 0.3, m * 0.8);
  else if (v === 'sneaker') s += B.sneaker(e, e.cx, e.cy + m * 0.2, m * 0.95, p.colour || '#f2f0ec') + B.sneaker(e, e.cx + m * 0.08, e.cy + m * 0.34, m * 0.9, p.colour || '#f2f0ec');
  else if (v === 'cap') s += B.cap(e, e.cx - m * 0.1, e.cy, m * 0.7, c);
  else if (v === 'gown') s += B.dressForm(e, e.cx, e.h * 0.9, e.h * 0.78, '#f7f2ea');
  else if (v === 'ring') s += stone(e, e.cx, e.cy + m * 0.26, m * 0.7, m * 0.16) + B.ring(e, e.cx, e.cy + m * 0.06, m * 0.18, lighten(e.accent, 0.6));
  else if (v === 'knit') s += B.weave(e, c, { knit: true });
  else s += B.hanger(e, e.cx, e.cy - m * 0.46, m * 0.4) + B.hoodie(e, e.cx, e.cy - m * 0.36, m * 0.74, c);
  return s;
}
// ---- hospitality ----------------------------------------------------------------------------------------------------------------
function coffeeBag(e, p) {
  const H = prodH(e) * 0.9; const base = e.cy + H * 0.52; let s = A.studio(e, { horizon: (base + 2) / e.h, floor: e.tint(e.dark ? '#2a211b' : '#b58d67') });
  s += A.pouch(e, e.cx - H * 0.08, base, H, e.tint(p.colour || '#8a6a4a'), { label: brand(p) || 'Coffee', sub: p.sub || 'whole bean', valve: true });
  s += A.beanPile(e, e.cx + H * 0.36, base + H * 0.02, H * 0.3, '#4b2e1c') + A.ceramic(e, e.cx + H * 0.52, base - H * 0.02, H * 0.2, e.tint('#f1ece4'), { form: 'mug', drink: '#3a2213' });
  return s;
}
function counterScene(e, fn) { const top = e.h * 0.7; return A.studio(e, { horizon: 0.7, floor: e.tint(e.dark ? '#2a211b' : '#d8cbb9') }) + rect(0, top - 2, e.w, 6 * e.s, e.tint(e.dark ? '#3a2c22' : '#efe8dd')) + fn(top); }
const hospitality = {
  'pour-over': (e) => A.studio(e, { horizon: 0.82 }) + B.pourOver(e, e.cx - e.w * 0.1, e.h * 0.84, Math.min(e.h * 0.7, e.w * 0.62)),
  latte: (e, p) => rect(0, 0, e.w, e.h, e.lin([[0, e.tint('#efe6da')], [1, e.tint('#d9cbb8')]], { x1: 0, y1: 0, x2: 1, y2: 1 })) + B.latteTop(e, e.cx - e.w * 0.08, e.cy - e.h * 0.04, Math.min(e.w, e.h) * 0.25) + (p.side === 'croissant' ? B.croissant(e, e.cx + e.w * 0.24, e.cy + e.h * 0.28, Math.min(e.w, e.h) * 0.36) : B.loaf(e, e.cx + e.w * 0.26, e.cy + e.h * 0.28, Math.min(e.w, e.h) * 0.3)),
  espresso: (e) => counterScene(e, top => I.espressoMachine(e, e.cx, top, Math.min(e.w * 0.7, e.h * 0.9))),
  roaster: (e) => A.studio(e, { horizon: 0.84, floor: e.tint('#2a2420') }) + B.roasterDrum(e, e.cx, e.h * 0.86, Math.min(e.w * 0.62, e.h * 0.7)),
  cafe: (e, p) => I.cafeRoom(e, { items: p.items }),
  bakery: (e, p) => counterScene(e, top => (p.variant === 'cake' ? B.cake(e, e.cx, top + 4, Math.min(e.w * 0.66, e.h * 0.7)) : p.variant === 'croissant' ? B.croissant(e, e.cx - e.w * 0.14, top - e.h * 0.02, e.w * 0.36) + B.croissant(e, e.cx + e.w * 0.16, top + e.h * 0.02, e.w * 0.32) + B.loaf(e, e.cx, top - e.h * 0.14, e.w * 0.3) : B.loaf(e, e.cx - e.w * 0.16, top - Math.min(e.w, e.h) * 0.08, Math.min(e.w, e.h) * 0.5) + B.loaf(e, e.cx + e.w * 0.06, top + e.h * 0.06, Math.min(e.w, e.h) * 0.62, 'baguette') + B.croissant(e, e.cx + e.w * 0.26, top - Math.min(e.w, e.h) * 0.12, Math.min(e.w, e.h) * 0.34))),
  dining: (e) => I.diningRoom(e, {}),
  bar: (e) => I.barRoom(e, {}),
  cocktail: (e, p) => A.studio(e, { horizon: 0.78, wall: e.tint('#2a1f1a'), floor: e.tint('#3a2618') }) + I.glassware(e, e.cx, e.h * 0.8, Math.min(e.h * 0.62, e.w * 0.8), p.variant || 'coupe', fc(p, 0, '#e8a23a'), { garnish: fl(p, 0) || 'orange' }) + A.flavourPiece(e, fl(p, 1) || 'lime', e.cx + e.w * 0.3, e.h * 0.78, e.w * 0.08),
  taps: (e) => B.beerTaps(e),
  table: (e, p) => plated(e, p),
};
// ---- creative ---------------------------------------------------------------------------------------------------------------------
const creative = {
  'camera-set': (e) => A.studio(e, { horizon: 0.8 }) + B.softbox(e, e.w * 0.24, e.h * 0.82, e.h * 0.66) + B.camera(e, e.w * 0.62, e.h * 0.56, Math.min(e.w * 0.5, e.h * 0.56)),
  prints: (e) => A.studio(e, { horizon: 0.06, floor: e.tint('#d9d2c6') }) + B.prints(e, e.cx, e.cy, Math.min(e.w * 0.96, e.h * 1.3), { loupe: true }),
  moodboard: (e) => B.moodboard(e),
  'sketch-desk': (e) => A.studio(e, { horizon: 0.06, floor: e.tint('#e3dccf') }) + B.sketchbook(e, e.cx - e.w * 0.06, e.cy - e.h * 0.04, Math.min(e.w * 0.7, e.h * 0.9)) + B.swatchFan(e, e.cx + e.w * 0.3, e.cy + e.h * 0.4, Math.min(e.w, e.h) * 0.3),
};
// ---- software ------------------------------------------------------------------------------------------------------------------------
const tech = {
  interface: (e, p) => null, // rendered by drawArt directly (HTML, two layouts)
  'phone-notice': (e, p) => A.studio(e, { horizon: 0.86 }) + U.phoneNotice(e, e.cx, e.cy, Math.min(e.h * 0.84, e.w * 1.5), { app: p.label || 'App', title: (p.items && p.items[0]) || 'New booking', body: (p.items && p.items[1]) || 'Confirmed', time: '9:41' }),
  'server-rack': (e) => { let s = rect(0, 0, e.w, e.h, e.lin([[0, '#11141b'], [1, '#07080c']], { x1: 0, y1: 0, x2: 0, y2: 1 })); const R = A.rng(A.hashStr('rack' + e.uid)); for (let c = 0; c < 3; c++) { const x = e.w * (0.08 + c * 0.3), w = e.w * 0.26; s += rect(x, e.h * 0.06, w, e.h * 0.9, '#1b1f29', { rx: 4 * e.s }); for (let r = 0; r < 12; r++) { const y = e.h * (0.09 + r * 0.072); s += rect(x + 6 * e.s, y, w - 12 * e.s, e.h * 0.06, '#252b38', { rx: 2 * e.s }); for (let q = 0; q < 4; q++) s += circ(x + w * 0.12 + q * 7 * e.s, y + e.h * 0.03, 2 * e.s, R() > 0.25 ? (R() > 0.8 ? '#f2a33a' : '#2fb67c') : '#3a4254'); s += rect(x + w * 0.5, y + e.h * 0.022, w * 0.36, 3 * e.s, '#3a4254', { rx: 1.5 * e.s }); } } return s + rect(0, 0, e.w, e.h, e.rad([[0, e.accent, 0.25], [1, e.accent, 0]], { cx: 0.5, cy: 0.1, r: 0.8 })); },
  'team-table': (e) => { let s = rect(0, 0, e.w, e.h, e.tint(e.dark ? '#2a2724' : '#d9cbb6')) + ell(e.cx, e.cy, e.w * 0.42, e.h * 0.3, e.lin([[0, e.tint('#a57a4c')], [1, e.tint('#6b4a33')]], { x1: 0, y1: 0, x2: 1, y2: 1 })); [[-0.22, -0.12, -10], [0.18, -0.14, 12], [-0.02, 0.14, 180]].forEach(([dx, dy, a]) => { s += g(rect(-e.w * 0.1, -e.h * 0.07, e.w * 0.2, e.h * 0.14, '#2a2d33', { rx: 4 * e.s }) + rect(-e.w * 0.09, -e.h * 0.06, e.w * 0.18, e.h * 0.12, e.lin([[0, mix(e.accent, '#ffffff', 0.5)], [1, e.accent]], { x1: 0, y1: 0, x2: 1, y2: 1 }), { rx: 2 * e.s, opacity: 0.8 }), { transform: `translate(${n1(e.cx + dx * e.w)} ${n1(e.cy + dy * e.h)}) rotate(${a})` }); }); s += A.ceramic(e, e.cx + e.w * 0.24, e.cy + e.h * 0.1, e.h * 0.07, '#f1ede6', { form: 'mug' }) + B.paper(e, e.cx - e.w * 0.28, e.cy + e.h * 0.12, e.w * 0.14, e.h * 0.18, 8, { lines: 5 }); return s; },
};
// ---- desk, advice, learning -------------------------------------------------------------------------------------------------------------
const desk = {
  'desk-docs': (e, p) => A.studio(e, { horizon: 0.05, floor: e.tint(e.dark ? '#3a2a1e' : '#d9d2c6') }) + B.paper(e, e.cx - e.w * 0.12, e.cy - e.h * 0.02, Math.min(e.w * 0.4, e.h * 0.56), Math.min(e.w * 0.54, e.h * 0.74), -6, { chart: p.variant !== 'contract', band: 'none' }) + B.paper(e, e.cx + e.w * 0.1, e.cy + e.h * 0.02, Math.min(e.w * 0.38, e.h * 0.5), Math.min(e.w * 0.5, e.h * 0.68), 7, { signature: true }) + (p.variant === 'contract' ? '' : B.calculator(e, e.cx + e.w * 0.32, e.cy + e.h * 0.2, Math.min(e.w, e.h) * 0.16, 12)) + B.pen(e, e.cx + e.w * 0.02, e.cy + e.h * 0.3, Math.min(e.w, e.h) * 0.46, -28),
  'sticky-wall': (e, p) => B.stickyWall(e, { items: p.items }),
  office: (e, p) => I.office(e, { law: p.variant === 'law', night: e.dark }),
  keys: (e) => A.studio(e, { horizon: 0.72 }) + B.keysOnTag(e, e.cx + e.w * 0.08, e.cy + e.h * 0.14, Math.min(e.w, e.h) * 0.62),
  classroom: (e, p) => I.classroom(e, { subject: p.variant }),
  'study-desk': (e, p) => { let s = A.studio(e, { horizon: 0.06, floor: e.tint('#e3d8c6') }); s += B.paper(e, e.cx + e.w * 0.08, e.cy, Math.min(e.w * 0.46, e.h * 0.6), Math.min(e.w * 0.6, e.h * 0.8), 5, { lines: 7 }); s += A.wordmark(e, p.variant === 'reading' ? 'Chapter 3' : '3x + 4 = 19', e.cx + e.w * 0.08, e.cy - e.h * 0.14, Math.min(e.w, e.h) * 0.06, '#2d3a67', { serif: true, weight: 500 }); s += I.bookRow(e, e.w * 0.04, e.h * 0.34, e.w * 0.3, e.h * 0.3); s += B.pen(e, e.cx + e.w * 0.1, e.cy + e.h * 0.3, Math.min(e.w, e.h) * 0.4, -24, '#e9b949'); return s; },
  library: (e) => { let s = rect(0, 0, e.w, e.h, e.tint('#3a281c')); for (let r = 0; r < 5; r++) { const y = e.h * (0.18 + r * 0.19); s += rect(0, y, e.w, 5 * e.s, '#2a1c12') + I.bookRow(e, e.w * 0.02, y, e.w * 0.96, e.h * 0.16, { law: true }); } return s + I.floorLamp(e, e.w * 0.82, e.h * 0.99, e.h * 0.5, true) + rect(0, 0, e.w, e.h, e.rad([[0, '#ffd98a', 0.18], [1, '#000', 0]], { cx: 0.8, cy: 0.6, r: 0.6 })); },
  books: (e) => { let s = A.studio(e, { horizon: 0.74, floor: e.tint('#c9a26f') }); const m = Math.min(e.w, e.h); const cols = ['#c65d3b', '#3f6c8a', '#e0b44a', '#6b8f5a']; cols.forEach((c, i) => { const y = e.h * 0.8 - i * m * 0.07; s += rect(e.cx - m * 0.3 + (i % 2) * 6 * e.s, y - m * 0.07, m * 0.56, m * 0.07, e.lin([[0, lighten(e.tint(c), 0.1)], [1, darken(e.tint(c), 0.15)]], { x1: 0, y1: 0, x2: 0, y2: 1 }), { rx: 2 * e.s }) + rect(e.cx + m * 0.2 + (i % 2) * 6 * e.s, y - m * 0.065, m * 0.04, m * 0.06, '#f6f1e6'); }); s += A.ceramic(e, e.cx + m * 0.4, e.h * 0.8, m * 0.2, e.tint('#e9e1d4'), { form: 'mug', drink: '#f6f1e6' }); ['#e9b949', '#e05a47', '#3f8fd1'].forEach((c, i) => { s += line(e.cx + m * (0.36 + i * 0.04), e.h * 0.8 - m * 0.18, e.cx + m * (0.34 + i * 0.05), e.h * 0.8 - m * 0.34, c, 4 * e.s); }); return s + B.paper(e, e.cx - m * 0.3, e.h * 0.92, m * 0.34, m * 0.2, -8, { lines: 4 }); },
  music: (e, p) => A.studio(e, { horizon: 0.84 }) + (p.variant === 'piano' ? piano(e) : B.guitar(e, e.cx, e.cy + e.h * 0.05, Math.min(e.h * 0.7, e.w * 1.1))),
};
function piano(e) { const y = e.h * 0.5, x0 = e.w * 0.06, w = e.w * 0.88; let s = rect(x0, y - e.h * 0.12, w, e.h * 0.4, '#16171b', { rx: 4 * e.s }); const n = 14; for (let i = 0; i < n; i++) s += rect(x0 + 6 * e.s + i * (w - 12 * e.s) / n, y, (w - 12 * e.s) / n - 2 * e.s, e.h * 0.26, e.lin([[0, '#ffffff'], [1, '#dcdad4']], { x1: 0, y1: 0, x2: 0, y2: 1 }), { rx: 2 * e.s }); [0, 1, 3, 4, 5, 7, 8, 10, 11, 12].forEach(i => { s += rect(x0 + 6 * e.s + (i + 0.68) * (w - 12 * e.s) / n, y, (w - 12 * e.s) / n * 0.62, e.h * 0.16, '#16171b', { rx: 1.5 * e.s }); }); return s; }
// ---- fitness & care ---------------------------------------------------------------------------------------------------------------------------
const body = {
  boxing: (e) => A.studio(e, { horizon: 0.86, wall: e.tint('#2a1f1f') }) + B.heavyBag(e, e.cx + e.w * 0.14, e.h * 0.08, e.h * 0.78) + B.glove(e, e.cx - e.w * 0.18, e.h * 0.62, Math.min(e.w, e.h) * 0.36, fc({ flavours: [] }, 0, '#c0392b')),
  wraps: (e) => A.studio(e, { horizon: 0.7, wall: e.tint('#2a1f1f') }) + B.wraps(e, e.cx - e.w * 0.12, e.h * 0.66, Math.min(e.w, e.h) * 0.12) + B.glove(e, e.cx + e.w * 0.14, e.h * 0.5, Math.min(e.w, e.h) * 0.36, '#c0392b') + B.glove(e, e.cx + e.w * 0.3, e.h * 0.62, Math.min(e.w, e.h) * 0.3, '#c0392b', true),
  ring: (e) => { let s = rect(0, 0, e.w, e.h, e.lin([[0, '#1a1414'], [1, '#0b0909']], { x1: 0, y1: 0, x2: 0, y2: 1 })) + path(`M0 ${n1(e.h * 0.7)} L${n1(e.w)} ${n1(e.h * 0.62)} L${n1(e.w)} ${n1(e.h)} L0 ${n1(e.h)} Z`, e.tint('#3a4a6b')); [0.36, 0.46, 0.56].forEach(f => { s += line(0, e.h * f + e.h * 0.1, e.w, e.h * f, '#d8d2c8', 3 * e.s); }); s += rect(e.w * 0.08, e.h * 0.3, 10 * e.s, e.h * 0.45, '#c0392b') + [0.2, 0.5, 0.8].map(f => I.pendant(e, e.w * f, 0, e.h * 0.08, e.w * 0.04, true, '#2d2a27')).join(''); return s; },
  reformer: (e) => I.studioRoom(e, { equipment: 'reformer' }),
  yoga: (e) => I.studioRoom(e, { equipment: 'mat' }),
  kettlebells: (e) => A.studio(e, { horizon: 0.74, wall: e.tint('#1f2530') }) + [0, 1, 2, 3].map(i => B.kettlebell(e, e.w * (0.17 + i * 0.22), e.h * 0.84, Math.min(e.w, e.h) * (0.26 + (i % 2) * 0.06), ['#2d2f33', '#c0392b', '#2d6cdf', '#e0b44a'][i])).join('') + rect(e.w * 0.05, e.h * 0.86, e.w * 0.9, e.h * 0.02, '#3a3d42'),
  reception: (e) => { let s = A.room(e, { horizon: 0.7, wall: e.tint('#eef0ec'), window: [0.66, 0.1, 0.26, 0.4] }); s += rect(e.w * 0.14, e.h * 0.5, e.w * 0.46, e.h * 0.24, e.lin([[0, e.tint('#e9e4dc')], [1, e.tint('#c9c2b6')]], { x1: 0, y1: 0, x2: 0, y2: 1 }), { rx: 6 * e.s }) + rect(e.w * 0.12, e.h * 0.48, e.w * 0.5, e.h * 0.03, e.tint('#8b6a4c'), { rx: 3 * e.s }); s += I.plantPot(e, e.w * 0.08, e.h * 0.82, e.h * 0.3) + I.bookRow(e, e.w * 0.18, e.h * 0.48, e.w * 0.14, e.h * 0.06); [0.7, 0.84].forEach(f => { s += O.chair(e, e.w * f, e.h * 0.96, e.h * 0.24, '#8fa89b'); }); s += A.ceramic(e, e.w * 0.46, e.h * 0.48, e.h * 0.1, '#e9e1d4', { form: 'vase', stems: true }); return s; },
  weights: (e) => A.studio(e, { horizon: 0.72, wall: e.tint('#1f2530') }) + B.barbell(e, e.cx, e.h * 0.5, e.w * 0.92) + B.kettlebell(e, e.cx - e.w * 0.24, e.h * 0.9, e.h * 0.24) + B.dumbbell(e, e.cx + e.w * 0.22, e.h * 0.84, e.w * 0.3),
  'treatment-room': (e, p) => I.treatmentRoom(e, { spa: p.variant === 'spa' }),
  'exercise-kit': (e) => { let s = A.studio(e, { horizon: 0.56 }); s += I.yogaMat(e, e.cx, e.h * 0.84, e.w * 0.9, lighten(e.accent, 0.35)); s += B.band(e, e.w * 0.2, e.h * 0.62, e.w * 0.62, e.h * 0.66, '#e05a47') + B.band(e, e.w * 0.3, e.h * 0.7, e.w * 0.74, e.h * 0.74, '#3f8fd1'); s += rect(e.w * 0.1, e.h * 0.72, e.w * 0.32, e.h * 0.08, e.cyl('#3a4a5a'), { rx: e.h * 0.04 }); s += B.dumbbell(e, e.w * 0.7, e.h * 0.8, e.w * 0.28, '#6cbf9a'); s += ell(e.w * 0.56, e.h * 0.9, e.w * 0.14, e.h * 0.03, e.tint('#e0b44a')); return s; },
  spa: (e) => { const m = Math.min(e.w, e.h); return A.studio(e, { horizon: 0.6 }) + B.towelRoll(e, e.cx + m * 0.12, e.h * 0.64, m * 0.1) + B.stones(e, e.cx - m * 0.2, e.h * 0.8, m * 0.62) + A.dropper(e, e.cx + m * 0.4, e.h * 0.8, m * 0.46, '#b8742f', { label: 'Oil' }) + A.sprig(e, e.cx - m * 0.62, e.h * 0.8, m * 0.4, -40); },
  needles: (e) => A.studio(e, { horizon: 0.6 }) + B.needles(e, e.cx, e.h * 0.66, e.w * 0.62) + B.towelRoll(e, e.cx + e.w * 0.2, e.h * 0.86, Math.min(e.w, e.h) * 0.06),
  salon: (e) => I.salon(e, {}),
  'salon-tools': (e) => A.studio(e, { horizon: 0.6 }) + B.scissorsComb(e, e.cx - e.w * 0.08, e.h * 0.66, e.w * 0.5) + A.pump(e, e.cx + e.w * 0.3, e.h * 0.8, e.h * 0.34, '#f3ede4', { label: 'Salon' }),
  nails: (e) => A.studio(e, { horizon: 0.72 }) + ['#c2185b', '#e76f51', '#f4a3b4', '#8e3b6b'].map((c, i) => B.nailPolish(e, e.w * (0.2 + i * 0.2), e.h * 0.76, e.h * 0.3, c)).join(''),
  dental: (e) => A.studio(e, { horizon: 0.72, wall: e.tint('#e9f3f4') }) + B.tooth(e, e.cx, e.cy, Math.min(e.w, e.h) * 0.5),
};
// ---- outdoor trades ------------------------------------------------------------------------------------------------------------------------------
const outdoor = {
  'lawn-mowing': (e) => { const hz = e.h * 0.42; return A.outdoors(e, { horizon: 0.42, time: 'day' }) + O.house(e, e.w * 0.74, hz + 4 * e.s, e.w * 0.34, {}) + O.shrub(e, e.w * 0.54, hz + 4 * e.s, e.w * 0.035) + O.lawn(e, hz) + O.mower(e, e.w * 0.4, e.h * 0.9, Math.min(e.w * 0.36, e.h * 0.6), e.tint('#c8402f')); },
  edging: (e) => O.lawn(e, 0, { stripes: false }) + O.mulchBed(e, e.w * 0.42, e.h * 0.34, e.w * 0.78, e.h * 0.8) + O.perennial(e, e.w * 0.76, e.h * 0.78, e.h * 0.2, '#9a86c8') + O.shrub(e, e.w * 0.86, e.h * 0.58, e.h * 0.09, null, { flowers: '#f2c14e' }) + O.trimmer(e, e.w * 0.38, e.h * 0.72, Math.min(e.w, e.h) * 0.6),
  aeration: (e) => { const hz = e.h * 0.3; return A.outdoors(e, { horizon: 0.3, time: 'day' }) + O.lawn(e, hz, { stripes: true }) + O.soilCores(e, 0, hz + e.h * 0.08, e.w, e.h * 0.62, 46) + O.aerator(e, e.cx + e.w * 0.08, e.h * 0.9, Math.min(e.w * 0.4, e.h * 0.7)); },
  'leaf-cleanup': (e) => O.lawn(e, 0, { stripes: false }) + O.leafPile(e, e.cx + e.w * 0.06, e.h * 0.72, Math.min(e.w, e.h) * 0.34) + O.rake(e, e.cx - e.w * 0.22, e.h * 0.8, Math.min(e.w, e.h) * 0.62),
  hedge: (e) => A.outdoors(e, { horizon: 0.3, time: 'day' }) + O.lawn(e, e.h * 0.3, { stripes: true }) + O.shrub(e, e.w * 0.3, e.h * 0.66, e.w * 0.16, '#3f6f35', { clipped: true }) + O.shrub(e, e.w * 0.7, e.h * 0.66, e.w * 0.16, '#3f6f35', { clipped: true }) + O.shrub(e, e.cx, e.h * 0.92, e.w * 0.14, '#4b7d3e'),
  patio: (e) => { const hz = e.h * 0.45; return A.outdoors(e, { horizon: 0.45, time: 'golden' }) + O.lawn(e, hz, { stripes: false }) + O.tree(e, e.w * 0.12, hz + e.h * 0.1, e.h * 0.42) + O.pergola(e, e.w * 0.74, hz + e.h * 0.24, e.w * 0.3, e.h * 0.3) + O.pavers(e, [[e.w * 0.02, e.h], [e.w * 0.98, e.h], [e.w * 0.82, hz + e.h * 0.14], [e.w * 0.18, hz + e.h * 0.14]], '#cdb99d', { flag: true }) + O.shrub(e, e.w * 0.9, hz + e.h * 0.16, e.w * 0.05, null, { flowers: '#e6a4b4' }) + O.grasses(e, e.w * 0.08, hz + e.h * 0.24, e.h * 0.12) + O.firePit(e, e.cx, e.h * 0.8, Math.min(e.w, e.h) * 0.12) + O.chair(e, e.w * 0.3, e.h * 0.84, e.h * 0.2) + O.chair(e, e.w * 0.66, e.h * 0.86, e.h * 0.2); },
  'retaining-wall': (e) => { const hz = e.h * 0.3; return A.outdoors(e, { horizon: 0.3, time: 'day' }) + O.lawn(e, hz, { stripes: false }) + O.shrub(e, e.w * 0.2, e.h * 0.44, e.w * 0.07) + O.grasses(e, e.w * 0.46, e.h * 0.45, e.h * 0.14) + O.perennial(e, e.w * 0.66, e.h * 0.45, e.h * 0.14, '#e07a5f') + O.shrub(e, e.w * 0.86, e.h * 0.44, e.w * 0.065, null, { flowers: '#fff3b0' }) + O.stoneWall(e, 0, e.h * 0.45, e.w, e.h * 0.36, '#b8a88f', { rows: 4, cap: true }) + O.pavers(e, [[0, e.h], [e.w, e.h], [e.w, e.h * 0.81], [0, e.h * 0.81]], '#c9bba5', { rows: 3, cols: 6 }); },
  // flagstones going down: sand bed, a rubber mallet, a level
  'paver-laying': (e) => { let s = rect(0, 0, e.w, e.h, e.tint('#d9c7a6')); const R = A.rng(A.hashStr('sand' + e.uid)); for (let i = 0; i < 120; i++) s += circ(e.w * R(), e.h * R(), (0.6 + R()) * e.s, '#bfa982', { opacity: 0.6 }); s += O.pavers(e, [[-e.w * 0.1, e.h * 0.62], [e.w * 0.72, e.h * 0.66], [e.w * 0.6, -e.h * 0.05], [-e.w * 0.2, -e.h * 0.05]], '#c9b8a0', { flag: true, rows: 4, cols: 3 }); s += g(rect(-e.w * 0.18, -e.h * 0.05, e.w * 0.36, e.h * 0.1, e.lin([[0, '#3a3d42'], [1, '#1d1e20']], { x1: 0, y1: 0, x2: 0, y2: 1 }), { rx: e.h * 0.03 }) + rect(-e.w * 0.02, e.h * 0.05, e.w * 0.04, e.h * 0.3, e.cyl('#b98a55'), { rx: e.w * 0.02 }), { transform: `translate(${n1(e.w * 0.74)} ${n1(e.h * 0.6)}) rotate(-24)` }); s += rect(e.w * 0.08, e.h * 0.8, e.w * 0.56, e.h * 0.06, e.lin([[0, '#e2a21a'], [1, '#9a6a0f']], { x1: 0, y1: 0, x2: 0, y2: 1 }), { rx: 3 * e.s }) + rect(e.w * 0.3, e.h * 0.815, e.w * 0.1, e.h * 0.03, '#bfe3a0', { rx: e.h * 0.015 }) + circ(e.w * 0.35, e.h * 0.83, e.h * 0.008, '#2d6cdf'); return s; },
  'planting-bed': (e) => { let s = O.lawn(e, 0, { stripes: false }) + O.mulchBed(e, -e.w * 0.1, e.h * 0.18, e.w * 1.2, e.h * 0.7); [[0.18, 0.5, 'shrub'], [0.4, 0.6, 'grass'], [0.62, 0.52, 'per'], [0.82, 0.62, 'shrub'], [0.3, 0.76, 'per'], [0.56, 0.8, 'grass']].forEach(([fx, fy, k], i) => { s += k === 'shrub' ? O.shrub(e, e.w * fx, e.h * fy, Math.min(e.w, e.h) * 0.1, null, { flowers: i % 2 ? '#f2c14e' : '#e6a4b4' }) : k === 'grass' ? O.grasses(e, e.w * fx, e.h * fy, e.h * 0.2) : O.perennial(e, e.w * fx, e.h * fy, e.h * 0.18, i % 2 ? '#9a86c8' : '#e07a5f'); }); return s + stone(e, e.w * 0.1, e.h * 0.9, e.w * 0.16, e.h * 0.06) + stone(e, e.w * 0.3, e.h * 0.94, e.w * 0.14, e.h * 0.05); },
  'garden-path': (e) => { const hz = e.h * 0.36; return A.outdoors(e, { horizon: 0.36, time: 'golden' }) + O.lawn(e, hz, { stripes: false }) + O.tree(e, e.w * 0.82, hz + e.h * 0.06, e.h * 0.34) + O.pavers(e, [[e.w * 0.3, e.h], [e.w * 0.7, e.h], [e.w * 0.54, hz + 4], [e.w * 0.46, hz + 4]], '#c9bba5', { rows: 9, cols: 2, flag: true }) + O.shrub(e, e.w * 0.18, e.h * 0.62, e.w * 0.08, null, { flowers: '#e6a4b4' }) + O.grasses(e, e.w * 0.8, e.h * 0.74, e.h * 0.14) + O.perennial(e, e.w * 0.24, e.h * 0.9, e.h * 0.14, '#9a86c8'); },
  pergola: (e) => { const hz = e.h * 0.5; return A.outdoors(e, { horizon: 0.5, time: 'golden' }) + O.lawn(e, hz, { stripes: false }) + O.pavers(e, [[0, e.h], [e.w, e.h], [e.w * 0.88, hz + e.h * 0.12], [e.w * 0.12, hz + e.h * 0.12]], '#cdb99d') + O.pergola(e, e.cx, e.h * 0.84, e.w * 0.66, e.h * 0.46) + O.chair(e, e.cx - e.w * 0.12, e.h * 0.84, e.h * 0.2) + O.chair(e, e.cx + e.w * 0.14, e.h * 0.86, e.h * 0.2); },
  'fire-pit': (e) => { const hz = e.h * 0.4; return A.outdoors(e, { horizon: 0.4, time: 'dusk' }) + O.lawn(e, hz, { stripes: false, colour: '#35502e' }) + O.pavers(e, [[0, e.h], [e.w, e.h], [e.w * 0.86, hz + e.h * 0.1], [e.w * 0.14, hz + e.h * 0.1]], '#9c9486') + O.firePit(e, e.cx, e.h * 0.74, Math.min(e.w, e.h) * 0.2) + O.chair(e, e.w * 0.2, e.h * 0.8, e.h * 0.24) + O.chair(e, e.w * 0.8, e.h * 0.8, e.h * 0.24) + B.stringLights(e, e.h * 0.1); },
  irrigation: (e) => O.lawn(e, 0, { stripes: true }) + O.sprinkler(e, e.cx - e.w * 0.18, e.h * 0.74, Math.min(e.w, e.h) * 0.46) + O.sprinkler(e, e.cx + e.w * 0.26, e.h * 0.5, Math.min(e.w, e.h) * 0.3),
  'roof-house': (e, p) => { const hz = e.h * 0.62; return A.outdoors(e, { horizon: 0.62, time: p.variant === 'dusk' ? 'dusk' : 'day' }) + O.lawn(e, hz, { stripes: false }) + O.tree(e, e.w * 0.1, hz + e.h * 0.04, e.h * 0.4) + O.house(e, e.cx + e.w * 0.04, hz + e.h * 0.05, e.w * 0.62, { roof: p.colour || '#4a4a52', chimney: true, time: p.variant }) + O.shrub(e, e.w * 0.3, hz + e.h * 0.05, e.w * 0.04) + O.shrub(e, e.w * 0.76, hz + e.h * 0.05, e.w * 0.04); },
  shingles: (e, p) => O.shingleField(e, 0, 0, e.w, e.h, p.colour || '#50535c') + rect(0, e.h * 0.66, e.w, e.h * 0.05, e.lin([[0, '#e1e4e7'], [1, '#8a9097']], { x1: 0, y1: 0, x2: 0, y2: 1 })) + circ(e.w * 0.3, e.h * 0.4, 3 * e.s, '#c9ccd1') + circ(e.w * 0.62, e.h * 0.52, 3 * e.s, '#c9ccd1'),
  'roof-ladder': (e, p) => A.outdoors(e, { horizon: 0.95, time: 'day', treeline: false }) + O.shingleField(e, 0, e.h * 0.1, e.w, e.h * 0.62, p.colour || '#50535c', { rowH: 20 }) + rect(0, e.h * 0.72, e.w, e.h * 0.06, e.lin([[0, '#f4f2ee'], [1, '#c9c4ba']], { x1: 0, y1: 0, x2: 0, y2: 1 })) + rect(0, e.h * 0.78, e.w, e.h * 0.22, e.tint('#e8e1d4')) + O.ladder(e, e.w * 0.62, e.h * 1.02, e.w * 0.76, e.h * 0.34, e.w * 0.1) + rect(e.w * 0.18, e.h * 0.46, e.w * 0.2, e.h * 0.1, e.lin([[0, '#6a6d74'], [1, '#3a3d42']], { x1: 0, y1: 0, x2: 0, y2: 1 }), { rx: 2 * e.s }),
  'house-dusk': (e) => { const hz = e.h * 0.62; return A.outdoors(e, { horizon: 0.62, time: 'dusk' }) + O.lawn(e, hz, { stripes: false, colour: '#35502e' }) + O.tree(e, e.w * 0.14, hz + e.h * 0.08, e.h * 0.46, { colour: '#2d4a2c' }) + O.house(e, e.cx + e.w * 0.06, hz + e.h * 0.08, e.w * 0.56, { time: 'dusk', chimney: true }) + O.pavers(e, [[e.cx - e.w * 0.02, e.h], [e.cx + e.w * 0.14, e.h], [e.cx + e.w * 0.09, hz + e.h * 0.08], [e.cx + e.w * 0.03, hz + e.h * 0.08]], '#9c9486', { rows: 6, cols: 2 }); },
  street: (e) => { const hz = e.h * 0.7; let s = A.outdoors(e, { horizon: 0.7, time: 'golden', treeline: false }) + rect(0, hz, e.w, e.h - hz, e.tint('#b9b1a4')); const cols = ['#e8d9c4', '#c9d6d8', '#e2c9b5', '#d6dcc8']; for (let i = 0; i < 4; i++) s += O.house(e, e.w * (0.14 + i * 0.25), hz, e.w * 0.24, { siding: cols[i], tall: true, roof: i % 2 ? '#5a4a42' : '#4a4a52' }); s += O.tree(e, e.w * 0.28, hz + e.h * 0.02, e.h * 0.36) + O.tree(e, e.w * 0.78, hz + e.h * 0.02, e.h * 0.34); return s; },
  boat: (e) => A.outdoors(e, { horizon: 0.55, time: 'golden' }) + O.water(e, e.h * 0.55, '#2a6f86', { glint: '#ffe0a8' }) + O.boat(e, e.cx, e.h * 0.7, e.w * 0.62),
  sailboat: (e) => A.outdoors(e, { horizon: 0.58, time: 'day' }) + O.water(e, e.h * 0.58, '#2f6d8f') + O.sailboat(e, e.cx + e.w * 0.04, e.h * 0.74, Math.min(e.w * 0.7, e.h * 0.9)) + O.sailboat(e, e.w * 0.18, e.h * 0.64, Math.min(e.w, e.h) * 0.22, '#e9e4da'),
  // a mooring cleat on a teak deck with a coiled line: the hands-on detail of sailing
  'rope-cleat': (e) => { let s = rect(0, 0, e.w, e.h, e.lin([[0, e.tint('#c49a6c')], [1, e.tint('#8f6a45')]], { x1: 0, y1: 0, x2: 1, y2: 1 })); for (let i = 1; i < 9; i++) s += rect(0, e.h * i / 9 - 2 * e.s, e.w, 4 * e.s, '#3a2a1c', { opacity: 0.8 }); const m = Math.min(e.w, e.h); const cx = e.cx - m * 0.12, cy = e.cy + m * 0.12; s += e.shadow(cx, cy + m * 0.06, m * 0.3, m * 0.05, 0.35) + rect(cx - m * 0.3, cy - m * 0.05, m * 0.6, m * 0.08, e.lin([[0, '#eceef0'], [0.5, '#a9aeb3'], [1, '#6a7076']], { x1: 0, y1: 0, x2: 0, y2: 1 }), { rx: m * 0.04 }) + rect(cx - m * 0.08, cy - m * 0.02, m * 0.16, m * 0.1, e.lin([[0, '#c9ccd1'], [1, '#7d848b']], { x1: 0, y1: 0, x2: 0, y2: 1 }), { rx: m * 0.02 }); for (let r = 0; r < 5; r++) s += ell(e.cx + m * 0.2, e.cy - m * 0.08, m * (0.26 - r * 0.045), m * (0.16 - r * 0.028), 'none', { stroke: r % 2 ? '#e9e2d0' : '#f6f1e3', 'stroke-width': n1(m * 0.035) }); s += path(`M${n1(cx - m * 0.2)} ${n1(cy - m * 0.03)} C${n1(cx - m * 0.1)} ${n1(cy - m * 0.12)} ${n1(cx + m * 0.1)} ${n1(cy + m * 0.04)} ${n1(cx + m * 0.22)} ${n1(cy - m * 0.03)} S${n1(e.cx + m * 0.1)} ${n1(e.cy - m * 0.2)} ${n1(e.cx + m * 0.04)} ${n1(e.cy - m * 0.1)}`, 'none', { stroke: '#f3eddc', 'stroke-width': n1(m * 0.035), 'stroke-linecap': 'round' }); return s; },
  'boat-dusk': (e) => A.outdoors(e, { horizon: 0.5, time: 'dusk' }) + O.water(e, e.h * 0.5, '#1d3550', { glint: '#ffb877' }) + circ(e.w * 0.2, e.h * 0.46, e.w * 0.08, '#ffb877', { opacity: 0.5 }) + O.boat(e, e.cx + e.w * 0.06, e.h * 0.66, e.w * 0.72),
  fishing: (e) => A.outdoors(e, { horizon: 0.5, time: 'golden', treeline: false }) + O.water(e, e.h * 0.5, '#2a6f86', { glint: '#ffe0a8' }) + rect(0, e.h * 0.66, e.w, e.h * 0.34, e.lin([[0, '#a57a4c'], [1, '#6b4a33']], { x1: 0, y1: 0, x2: 0, y2: 1 })) + [0.2, 0.4, 0.6, 0.8].map(f => line(0, e.h * (0.66 + f * 0.34), e.w, e.h * (0.66 + f * 0.34), '#5a3b22', 1.4 * e.s, { opacity: 0.5 })).join('') + B.fishingGear(e, e.cx, e.h * 0.74, e.w * 0.8),
  bicycle: (e) => A.outdoors(e, { horizon: 0.66, time: 'day' }) + rect(0, e.h * 0.66, e.w, e.h * 0.34, e.tint('#b9b1a4')) + O.bicycle(e, e.cx, e.h * 0.84, Math.min(e.w * 0.8, e.h * 1.1)),
  solar: (e) => A.outdoors(e, { horizon: 0.95, time: 'day', treeline: false }) + path(`M0 ${n1(e.h * 0.34)} L${n1(e.w)} ${n1(e.h * 0.1)} L${n1(e.w)} ${n1(e.h)} L0 ${n1(e.h)} Z`, e.tint('#50535c')) + O.solarPanels(e, e.w * 0.14, e.h * 0.34, e.w * 0.72, e.h * 0.44),
  'produce-crate': (e) => { let s = A.studio(e, { horizon: 0.6 }); const W = e.w * 0.8, y = e.h * 0.84; s += e.shadow(e.cx, y, W * 0.55, W * 0.04, 0.3) + rect(e.cx - W / 2, y - e.h * 0.24, W, e.h * 0.24, e.lin([[0, e.tint('#c9a26f')], [1, e.tint('#8f6a45')]], { x1: 0, y1: 0, x2: 0, y2: 1 }), { rx: 3 * e.s }); for (let i = 1; i < 3; i++) s += line(e.cx - W / 2, y - e.h * 0.08 * i, e.cx + W / 2, y - e.h * 0.08 * i, e.tint('#7a5538'), 2 * e.s); const R = A.rng(A.hashStr('crate' + e.uid)); const veg = ['apple', 'orange', 'lemon', 'pear', 'strawberry', 'mango']; for (let i = 0; i < 9; i++) s += A.flavourPiece(e, veg[i % veg.length], e.cx - W * 0.4 + (i % 5) * W * 0.2 + R() * 6, y - e.h * 0.24 - Math.floor(i / 5) * e.h * 0.06, Math.min(e.w, e.h) * 0.07); s += A.sprig(e, e.cx + W * 0.36, y - e.h * 0.3, e.h * 0.26, -70); return s; },
  seedling: (e) => { let s = A.outdoors(e, { horizon: 0.3, time: 'day' }) + rect(0, e.h * 0.3, e.w, e.h * 0.7, e.lin([[0, '#5a3a24'], [1, '#3a2416']], { x1: 0, y1: 0, x2: 0, y2: 1 })); const R = A.rng(A.hashStr('soil' + e.uid)); for (let i = 0; i < 80; i++) s += circ(e.w * R(), e.h * (0.32 + R() * 0.68), (1 + R() * 2) * e.s, R() > 0.5 ? '#6b4a33' : '#2a1a10'); [[0.3, 0.7], [0.6, 0.62], [0.8, 0.84]].forEach(([fx, fy], i) => { s += line(e.w * fx, e.h * fy, e.w * fx, e.h * (fy - 0.14), '#5f8f4e', 2.4 * e.s) + A.leaf(e, e.w * fx, e.h * (fy - 0.12), e.h * 0.1, -150) + A.leaf(e, e.w * fx, e.h * (fy - 0.14), e.h * 0.1, -30); }); s += g(path(`M0 0 L${n1(e.w * 0.2)} ${n1(-e.w * 0.03)} L${n1(e.w * 0.2)} ${n1(e.w * 0.03)} Z`, e.lin([[0, '#eceef0'], [1, '#7d848b']])) + rect(-e.w * 0.14, -e.w * 0.02, e.w * 0.14, e.w * 0.04, e.tint('#2e7d32'), { rx: e.w * 0.02 }), { transform: `translate(${n1(e.w * 0.18)} ${n1(e.h * 0.88)}) rotate(-20)` }); return s; },
  'community-table': (e) => { let s = A.outdoors(e, { horizon: 0.5, time: 'golden' }) + O.lawn(e, e.h * 0.5, { stripes: false }) + B.stringLights(e, e.h * 0.08); s += I.table(e, e.cx, e.h * 0.64, e.w * 0.8, '#8b6a4c', { cloth: true }); for (let i = 0; i < 5; i++) s += A.ceramic(e, e.w * (0.2 + i * 0.15), e.h * 0.64, e.h * 0.05, '#f4f1ec', { form: 'bowl' }); s += B.bouquet(e, e.cx, e.h * 0.64, e.h * 0.26); return s; },
};
// ---- indoor trades ---------------------------------------------------------------------------------------------------------------------------------------
const indoor = {
  'living-room': (e, p) => I.livingRoom(e, { wall: p.colour, lampOn: e.dark || p.variant === 'city', city: p.variant === 'city', night: e.dark && p.variant === 'city' }),
  'painted-room': (e, p) => I.livingRoom(e, { wall: p.colour || lighten(e.accent, 0.35) }),
  'lit-room': (e) => I.livingRoom(e, { lampOn: true, wall: '#e9dcc7' }) + [0.3, 0.5, 0.7].map(f => I.pendant(e, e.w * f, 0, e.h * 0.1, e.w * 0.03, true, '#2d2a27')).join(''),
  'clean-room': (e) => I.livingRoom(e, { sparkle: true }),
  kitchen: (e, p) => I.kitchen(e, { cabinets: p.colour }),
  bathroom: (e) => I.bathroom(e, {}),
  framing: (e) => I.framing(e, {}),
  'tile-detail': (e) => I.tileGrid(e, 0, 0, e.w, e.h * 0.64, '#e6ecec', { size: 56 }) + rect(0, e.h * 0.64, e.w, e.h * 0.05, e.lin([[0, '#f4f2ef'], [1, '#cfccc7']], { x1: 0, y1: 0, x2: 0, y2: 1 })) + I.cabinetRun(e, 0, e.h * 0.69, e.w, e.h * 0.31, '#7a5b40') + [0, 1, 2].map(i => path(`M${n1(e.w * (0.2 + i * 0.25))} ${n1(e.h * 0.2)} l${n1(8 * e.s)} 0 l0 ${n1(-8 * e.s)}`, 'none', { stroke: '#e05a47', 'stroke-width': n1(2.4 * e.s) })).join(''),
  joinery: (e) => { let s = rect(0, 0, e.w, e.h, e.lin([[0, '#c49a6c'], [1, '#8f6a45']], { x1: 0, y1: 0, x2: 1, y2: 1 })); for (let i = 0; i < 26; i++) s += path(`M0 ${n1(e.h * i / 26)} Q${n1(e.w * 0.5)} ${n1(e.h * i / 26 + (i % 3 - 1) * 6 * e.s)} ${n1(e.w)} ${n1(e.h * i / 26)}`, 'none', { stroke: '#7a5538', 'stroke-width': n1(1 * e.s), opacity: 0.4 }); s += path(`M${n1(e.w * 0.5)} 0 L${n1(e.w * 0.5)} ${n1(e.h)}`, 'none', { stroke: '#5a3b22', 'stroke-width': n1(2 * e.s) }); for (let i = 0; i < 5; i++) s += path(`M${n1(e.w * 0.5)} ${n1(e.h * (0.1 + i * 0.2))} l${n1(e.w * 0.06)} ${n1(e.h * 0.03)} l0 ${n1(e.h * 0.1)} l${n1(-e.w * 0.06)} ${n1(e.h * 0.03)}`, e.tint('#d8b98a'), { stroke: '#5a3b22', 'stroke-width': n1(1.4 * e.s) }); return s + B.pen(e, e.w * 0.3, e.h * 0.8, e.w * 0.4, -20, '#e9b949'); },
  tools: (e) => A.studio(e, { horizon: 0.72, floor: e.tint('#a57a4c') }) + I.drill(e, e.cx - e.w * 0.14, e.h * 0.86, Math.min(e.w, e.h) * 0.5) + I.sawhorse(e, e.cx + e.w * 0.26, e.h * 0.94, e.w * 0.36),
  'cutting-in': (e, p) => I.cuttingIn(e, { paint: p.colour || lighten(e.accent, 0.3) }),
  'paint-tray': (e, p) => A.studio(e, { horizon: 0.6 }) + I.paintCan(e, e.cx - e.w * 0.26, e.h * 0.8, Math.min(e.w, e.h) * 0.28, p.colour || lighten(e.accent, 0.3), { open: true }) + I.rollerTray(e, e.cx + e.w * 0.14, e.h * 0.88, e.w * 0.5, p.colour || lighten(e.accent, 0.3)),
  'house-paint': (e, p) => { const hz = e.h * 0.66; return A.outdoors(e, { horizon: 0.66, time: 'day' }) + O.lawn(e, hz, { stripes: false }) + O.house(e, e.cx, hz + e.h * 0.04, e.w * 0.66, { siding: p.colour || lighten(e.accent, 0.5) }) + O.ladder(e, e.w * 0.14, e.h * 0.98, e.w * 0.26, e.h * 0.42, e.w * 0.07) + I.paintCan(e, e.w * 0.3, e.h * 0.94, e.h * 0.1, p.colour || lighten(e.accent, 0.5), { open: true }); },
  faucet: (e) => I.basinFaucet(e),
  pipes: (e) => I.copperPipes(e),
  'water-heater': (e) => { let s = A.studio(e, { horizon: 0.84, wall: e.tint('#e6e0d6') }); s += rect(e.cx - e.w * 0.18, e.h * 0.14, e.w * 0.36, e.h * 0.7, e.cyl('#e9ecef', { edge: 0.25 }), { rx: e.w * 0.06 }) + rect(e.cx - e.w * 0.08, e.h * 0.54, e.w * 0.16, e.h * 0.1, '#c9ccd1', { rx: 3 * e.s }) + circ(e.cx, e.h * 0.59, e.w * 0.03, '#3a3d42'); [[-0.06, '#c8773f'], [0.06, '#3f7ea6']].forEach(([f, c]) => { s += rect(e.cx + f * e.w - 4 * e.s, 0, 8 * e.s, e.h * 0.16, e.cyl(c)); }); return s; },
  panel: (e, p) => I.breakerPanel(e, { items: p.items }),
  outlets: (e) => A.studio(e, { horizon: 0.86 }) + I.outletPlate(e, e.cx - e.w * 0.14, e.cy, Math.min(e.w, e.h) * 0.2) + I.outletPlate(e, e.cx + e.w * 0.14, e.cy, Math.min(e.w, e.h) * 0.2, 'switch'),
  'ev-charger': (e) => A.studio(e, { horizon: 0.78 }) + I.evCharger(e, e.cx - e.w * 0.12, e.h * 0.38, Math.min(e.w, e.h) * 0.26) + B.car(e, e.cx + e.w * 0.44, e.h * 0.86, e.w * 0.8, lighten(e.accent, 0.1)),
  pendants: (e) => rect(0, 0, e.w, e.h, e.lin([[0, e.tint('#2a2420')], [1, e.tint('#171310')]], { x1: 0, y1: 0, x2: 0, y2: 1 })) + [0.28, 0.5, 0.72].map((f, i) => I.pendant(e, e.w * f, 0, e.h * (0.28 + (i % 2) * 0.1), e.w * 0.08, true, '#c9a24a')).join('') + rect(0, e.h * 0.84, e.w, e.h * 0.16, e.tint('#3a2c22')),
  'spray-shine': (e) => A.studio(e, { horizon: 0.66, floor: e.tint('#eceae6') }) + I.sprayBottle(e, e.cx - e.w * 0.16, e.h * 0.8, Math.min(e.h * 0.52, e.w * 0.7)) + I.clothStack(e, e.cx + e.w * 0.2, e.h * 0.82, e.w * 0.34) + [[0.6, 0.5], [0.72, 0.4], [0.3, 0.3]].map(([fx, fy], i) => I.sparkle(e, e.w * fx, e.h * fy, (8 + i * 4) * e.s)).join(''),
  caddy: (e) => A.studio(e, { horizon: 0.7 }) + I.caddy(e, e.cx - e.w * 0.08, e.h * 0.84, Math.min(e.w * 0.62, e.h * 0.7)),
  vacuum: (e) => I.livingRoom(e, { sparkle: true }) + I.vacuum(e, e.w * 0.78, e.h * 0.96, e.h * 0.5),
  'car-shine': (e, p) => A.studio(e, { horizon: 0.78, wall: e.dark ? undefined : e.tint('#2a2c31') }) + [0.2, 0.5, 0.8].map(f => rect(e.w * f - e.w * 0.1, e.h * 0.06, e.w * 0.2, e.h * 0.02, '#f6f3e8', { opacity: 0.9 })).join('') + B.car(e, e.cx, e.h * 0.82, e.w * 0.92, p.colour || darken(e.accent, 0.15), { shine: true }),
  polisher: (e, p) => { const c = p.colour || darken(e.accent, 0.15); let s = rect(0, 0, e.w, e.h, e.lin([[0, lighten(c, 0.3)], [0.5, c], [1, darken(c, 0.4)]], { x1: 0, y1: 0, x2: 0.3, y2: 1 })); for (let i = 0; i < 18; i++) s += circ(e.w * 0.3, e.h * 0.62, (8 + i * 6) * e.s, 'none', { stroke: '#ffffff', 'stroke-width': n1(0.8 * e.s), opacity: 0.08 }); s += path(`M${n1(e.w * 0.5)} 0 L${n1(e.w * 0.62)} 0 L${n1(e.w * 0.32)} ${n1(e.h)} L${n1(e.w * 0.2)} ${n1(e.h)} Z`, '#ffffff', { opacity: 0.2 }); return s + B.polisher(e, e.w * 0.62, e.h * 0.5, Math.min(e.w, e.h) * 0.62); },
  rim: (e) => A.studio(e, { horizon: 0.86, wall: e.tint('#1f2126') }) + B.rim(e, e.cx, e.cy, Math.min(e.w, e.h) * 0.38),
  'car-lift': (e, p) => B.carLift(e, { colour: p.colour }),
  'engine-parts': (e) => A.studio(e, { horizon: 0.4, floor: e.tint('#3a3633') }) + B.engineParts(e, e.cx, e.cy + e.h * 0.06, Math.min(e.w * 0.9, e.h * 1.1)),
};
// ---- other subjects ---------------------------------------------------------------------------------------------------------------------------------------
const misc = {
  dog: (e) => A.studio(e, { horizon: 0.8 }) + B.dog(e, e.cx, e.h * 0.86, Math.min(e.h * 0.66, e.w * 0.8)),
  bouquet: (e) => A.studio(e, { horizon: 0.82 }) + B.bouquet(e, e.cx, e.h * 0.88, Math.min(e.h * 0.8, e.w * 1.1)),
  stationery: (e, p) => A.studio(e, { horizon: 0.05, floor: e.tint('#e3dccf') }) + B.stationery(e, e.cx, e.cy, Math.min(e.w * 0.86, e.h * 1.05), { title: p.variant || '&' }),
  // a close-up of the finishing: wax seal, ribbon, a calligraphy nib
  'stationery-detail': (e) => { let s = rect(0, 0, e.w, e.h, e.tint('#efe6d8')); const m = Math.min(e.w, e.h); s += B.paper(e, e.cx - m * 0.05, e.cy, m * 0.9, m * 0.62, -4, { lines: 0 }); s += path(`M${n1(e.cx - m * 0.5)} ${n1(e.cy + m * 0.06)} Q${n1(e.cx)} ${n1(e.cy - m * 0.04)} ${n1(e.cx + m * 0.5)} ${n1(e.cy + m * 0.1)}`, 'none', { stroke: e.tint('#b8a07a'), 'stroke-width': n1(m * 0.03) }); s += circ(e.cx, e.cy + m * 0.04, m * 0.13, e.rad([[0, lighten(e.tint('#9b2c3a'), 0.25)], [1, darken(e.tint('#9b2c3a'), 0.2)]], { cx: 0.4, cy: 0.35 })) + circ(e.cx, e.cy + m * 0.04, m * 0.08, 'none', { stroke: darken(e.tint('#9b2c3a'), 0.3), 'stroke-width': n1(2 * e.s) }) + A.wordmark(e, '&', e.cx, e.cy + m * 0.075, m * 0.09, darken(e.tint('#9b2c3a'), 0.4), { serif: true, weight: 500 }); s += A.sprig(e, e.cx - m * 0.42, e.cy + m * 0.28, m * 0.3, -30, e.tint('#8aa46a')); return s + B.pen(e, e.cx + m * 0.26, e.cy + m * 0.34, m * 0.5, -38, '#1f2d3d'); },
  'flower-buckets': (e) => { let s = A.studio(e, { horizon: 0.66, floor: e.tint('#b58d67') }); const m = Math.min(e.w, e.h); const cols = ['#f4a3b4', '#e76f51', '#fbf7f0', '#c9a7e8']; [-0.28, 0, 0.28].forEach((f, i) => { const x = e.cx + f * e.w, base = e.h * 0.86, H = m * 0.34; s += e.shadow(x, base, H * 0.45, H * 0.06, 0.3) + A._svg.path(`M${n1(x - H * 0.36)} ${n1(base - H)} L${n1(x + H * 0.36)} ${n1(base - H)} L${n1(x + H * 0.28)} ${n1(base)} L${n1(x - H * 0.28)} ${n1(base)} Z`, e.cyl('#aab2b8', { edge: 0.35 })) + A._svg.rect(x - H * 0.38, base - H - 3 * e.s, H * 0.76, 5 * e.s, '#c9d0d5', { rx: 2 * e.s }); const R = A.rng(A.hashStr('fb' + i + e.uid)); for (let q = 0; q < 7; q++) { const tx = x + (R() - 0.5) * H * 0.9, ty = base - H - H * (0.5 + R() * 0.7); s += A._svg.line(x + (R() - 0.5) * H * 0.3, base - H, tx, ty, e.tint('#5f8a4a'), 1.6 * e.s); const c = e.tint(cols[(i + q) % cols.length]); for (let p = 0; p < 6; p++) { const a = p / 6 * Math.PI * 2; s += A._svg.circ(tx + Math.cos(a) * H * 0.05, ty + Math.sin(a) * H * 0.05, H * 0.06, c); } s += A._svg.circ(tx, ty, H * 0.04, darken(c, 0.25)); } for (let q = 0; q < 3; q++) s += A.leaf(e, x + (R() - 0.5) * H * 0.6, base - H * (1.1 + R() * 0.4), H * 0.3, -60 - R() * 60); }); s += B.scissorsComb ? '' : ''; return s + A._svg.circ(e.w * 0.9, e.h * 0.92, m * 0.05, e.tint('#c8a57a')) + A._svg.circ(e.w * 0.9, e.h * 0.92, m * 0.02, e.tint('#8f6a45')); },
  moving: (e) => A.studio(e, { horizon: 0.84 }) + B.movingBoxes(e, e.cx, e.h * 0.86, Math.min(e.w * 0.8, e.h * 0.9)),
  'event-lights': (e) => { const hz = e.h * 0.62; return A.outdoors(e, { horizon: 0.62, time: 'dusk' }) + O.lawn(e, hz, { stripes: false, colour: '#35502e' }) + B.stringLights(e, e.h * 0.12, 16) + B.stringLights(e, e.h * 0.26, 14) + I.table(e, e.cx, e.h * 0.74, e.w * 0.6, '#8b6a4c', { cloth: true }) + B.bouquet(e, e.cx, e.h * 0.74, e.h * 0.22); },
  travel: (e) => A.studio(e, { horizon: 0.82 }) + B.suitcase(e, e.cx - e.w * 0.08, e.h * 0.86, Math.min(e.h * 0.6, e.w * 0.8)) + A.ceramic(e, e.cx + e.w * 0.3, e.h * 0.84, e.h * 0.1, '#f1ede6', { form: 'mug' }),
  sewing: (e) => A.studio(e, { horizon: 0.78 }) + B.sewingMachine(e, e.cx, e.h * 0.82, Math.min(e.w * 0.8, e.h * 1.0)),
  cake: (e) => hospitality.bakery(e, { variant: 'cake' }),
  pet: (e) => misc.dog(e),
  // last resort: the owner's own offerings as a designed stack of cards -- honest, readable, never a random object
  'offer-cards': (e, p) => { const items = (p.items && p.items.length ? p.items : [p.label].filter(Boolean)).slice(0, 3); if (!items.length) return A.studio(e, { horizon: 0.86 }) + misc.stationery(e, { variant: '' }); let s = A.studio(e, { horizon: 0.86 }); items.forEach((it, i) => { const w = e.w * 0.62, h = e.h * 0.2, x = e.cx - w / 2 + (i - 1) * e.w * 0.05, y = e.h * (0.18 + i * 0.22); s += e.shadow(x + w / 2, y + h, w * 0.45, h * 0.08, 0.25) + rect(x, y, w, h, i === 1 ? e.accent : (e.dark ? '#1f2026' : '#fbfaf7'), { rx: h * 0.16, transform: `rotate(${(i - 1) * -3} ${n1(x + w / 2)} ${n1(y + h / 2)})` }) + A.wordmark(e, it, x + w * 0.08, y + h * 0.6, Math.min(h * 0.28, w * 0.07), i === 1 ? A.inkOn(e.accent) : e.ink, { anchor: 'start', weight: 700, maxWidth: w * 0.84, spacing: '-0.01em' }); }); return s; },
};

const KINDS = Object.assign({
  'can-hero': canHero, 'can-range': canRange, 'can-ice': canIce, 'bottle-hero': bottleHero, 'drink-pour': drinkPour, 'fruit-splash': fruitSplash,
  'skincare-hero': skincareHero, 'skincare-range': skincareRange, 'texture-swatch': textureSwatch, botanicals, 'basin-ritual': basinRitual,
  'pantry-hero': pantryHero, ingredients, plated, 'home-object': homeObject, workbench, apparel,
  rail: (e, p) => B.clothingRail(e, { kind: p.variant }), fabric: (e, p) => B.weave(e, p.colour || e.accent, { knit: p.variant === 'knit', seam: p.variant !== 'knit' }),
  'coffee-bag': coffeeBag,
}, hospitality, creative, tech, desk, body, outdoor, indoor, misc);
const ART_KINDS = Object.keys(KINDS);

// the one entry point: an art spec for one layer -> self-contained HTML (inline SVG)
function drawArt(spec, o) {
  const k = o || {}; const kind = spec && KINDS[spec.kind] ? spec.kind : 'offer-cards'; const params = (spec && spec.params) || {};
  const align = /^x(Min|Mid|Max)Y(Min|Mid|Max)$/.test(k.align || '') ? k.align : 'xMidYMid';
  // canvas: the frame's own proportions when known (clamped so no picture is squashed), else the image aspect
  let [w, h] = BOX[k.aspect] || BOX['1:1'];
  // a line-up of products is built to sit in a narrow column; scenes need a wider canvas to stay composed
  const minRatio = { 'skincare-range': 0.42, 'can-range': 0.42, 'bottle-hero': 0.42 }[kind] || 0.62;
  if (Number.isFinite(k.ratio) && k.ratio > 0) { const r = Math.max(minRatio, Math.min(2.6, k.ratio)); if (r >= 1) { w = 640; h = Math.round(640 / r); } else { h = 640; w = Math.round(640 * r); } }
  const e = A.makeEnv({ w, h, tone: k.tone, accent: k.accent, seed: A.hashStr(`${kind}|${k.seed || ''}`), uid: k.uid, kind, detail: k.role && k.role !== 'lead' ? 'simple' : 'full' });
  if (kind === 'interface') return `<div class="ha-art" data-art="interface">${U.renderInterface(e, params.ui || 'analytics', { title: params.label || 'Product', items: params.items, audience: params.audience, reminders: params.reminders })}</div>`;
  let bodySvg = '';
  try { bodySvg = KINDS[kind](e, params) || ''; } catch (err) { bodySvg = misc['offer-cards'](e, params); }
  if (k.role === 'lead' && !e.dark) bodySvg += A.grain(e, 0.06);
  const label = A.esc(params.alt || kind.replace(/-/g, ' '));
  return `<div class="ha-art" data-art="${A.esc(kind)}"><svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="${align} slice" role="img" aria-label="${label}" xmlns="http://www.w3.org/2000/svg"><defs>${e.defs.join('')}</defs>${bodySvg}</svg></div>`;
}

module.exports = { KINDS, ART_KINDS, BOX, drawArt };
