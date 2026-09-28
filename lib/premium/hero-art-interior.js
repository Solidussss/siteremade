'use strict';
// HERO ART -- interiors (rooms a business works in or delivers) and the tools of
// the trades that work indoors. Built on the kit in ./hero-art.
const A = require('./hero-art');
const O = require('./hero-art-outdoor');
const { mix, lighten, darken, rng, hashStr, inkOn } = A;
const { rect, circ, ell, path, line, g, P, n1, mark, markFrom } = A._svg;

// ---- furniture & fixtures ----------------------------------------------------------------------------------------
function sofa(e, x, baseY, W, c) {
  const col = e.tint(c || '#8a9a8c'); const H = W * 0.36; const u = W / 100; let s = e.shadow(x, baseY, W * 0.55, W * 0.05, 0.3);
  s += rect(x - W / 2, baseY - H, W, H * 0.62, e.lin([[0, lighten(col, 0.1)], [1, darken(col, 0.12)]], { x1: 0, y1: 0, x2: 0, y2: 1 }), { rx: 6 * u });
  s += rect(x - W / 2 + 6 * u, baseY - H * 0.52, W - 12 * u, H * 0.34, e.lin([[0, lighten(col, 0.18)], [1, col]], { x1: 0, y1: 0, x2: 0, y2: 1 }), { rx: 4 * u });
  s += line(x, baseY - H * 0.5, x, baseY - H * 0.2, darken(col, 0.2), 1 * u);
  s += rect(x - W / 2 - 3 * u, baseY - H * 0.62, 10 * u, H * 0.5, darken(col, 0.06), { rx: 4 * u }) + rect(x + W / 2 - 7 * u, baseY - H * 0.62, 10 * u, H * 0.5, darken(col, 0.06), { rx: 4 * u });
  s += rect(x - W / 2 + 2 * u, baseY - H * 0.18, W - 4 * u, H * 0.12, darken(col, 0.2), { rx: 2 * u });
  s += line(x - W * 0.42, baseY - H * 0.06, x - W * 0.42, baseY, '#3b2b20', 2 * u) + line(x + W * 0.42, baseY - H * 0.06, x + W * 0.42, baseY, '#3b2b20', 2 * u);
  s += rect(x - W * 0.34, baseY - H * 0.86, W * 0.16, H * 0.3, e.lin([[0, lighten(e.accent, 0.35)], [1, lighten(e.accent, 0.1)]], { x1: 0, y1: 0, x2: 0, y2: 1 }), { rx: 4 * u, transform: `rotate(-8 ${n1(x - W * 0.26)} ${n1(baseY - H * 0.7)})` });
  s += rect(x + W * 0.18, baseY - H * 0.84, W * 0.15, H * 0.28, e.lin([[0, '#f3ece0'], [1, '#d8cdbb']], { x1: 0, y1: 0, x2: 0, y2: 1 }), { rx: 4 * u, transform: `rotate(7 ${n1(x + W * 0.25)} ${n1(baseY - H * 0.7)})` });
  return s;
}
function plantPot(e, x, baseY, h, o) {
  const k = o || {}; let s = e.shadow(x, baseY, h * 0.3, h * 0.05, 0.3);
  const pot = e.tint(k.pot || '#d9c7b0');
  s += path(P([[x - h * 0.18, baseY - h * 0.3], [x + h * 0.18, baseY - h * 0.3], [x + h * 0.14, baseY], [x - h * 0.14, baseY]]), e.cyl(pot));
  for (let i = 0; i < 9; i++) { const a = -150 + i * 15 + (i % 2) * 6; s += A.leaf(e, x, baseY - h * 0.3, h * (0.42 + (i % 3) * 0.1), a, e.tint(i % 2 ? '#4f7f45' : '#5f9152'), { width: 0.34 }); }
  return s;
}
function floorLamp(e, x, baseY, h, on) {
  let s = line(x, baseY, x, baseY - h * 0.82, '#2f2c29', 2.4 * e.s) + ell(x, baseY, h * 0.1, h * 0.02, '#2f2c29');
  s += path(P([[x - h * 0.12, baseY - h * 0.8], [x + h * 0.12, baseY - h * 0.8], [x + h * 0.08, baseY - h], [x - h * 0.08, baseY - h]]), on ? e.lin([[0, '#fff1c9'], [1, '#f2d28b']], { x1: 0, y1: 0, x2: 0, y2: 1 }) : e.tint('#efe6d6'));
  if (on) s += circ(x, baseY - h * 0.86, h * 0.35, '#ffe2a0', { opacity: 0.2 });
  return s;
}
function artFrame(e, x, y, w, h) {
  let s = rect(x, y, w, h, '#2d2a27') + rect(x + 4 * e.s, y + 4 * e.s, w - 8 * e.s, h - 8 * e.s, '#f7f3ec');
  s += circ(x + w * 0.4, y + h * 0.45, Math.min(w, h) * 0.2, lighten(e.accent, 0.2)) + path(`M${n1(x + 8 * e.s)} ${n1(y + h * 0.78)} Q${n1(x + w * 0.5)} ${n1(y + h * 0.5)} ${n1(x + w - 8 * e.s)} ${n1(y + h * 0.7)}`, 'none', { stroke: darken(e.accent, 0.2), 'stroke-width': n1(3 * e.s) });
  return s;
}
function pendant(e, x, top, drop, r, on, c) {
  let s = line(x, top, x, top + drop, '#2a2724', 1.4 * e.s);
  s += path(`M${n1(x - r)} ${n1(top + drop + r * 0.9)} Q${n1(x - r)} ${n1(top + drop)} ${n1(x)} ${n1(top + drop)} Q${n1(x + r)} ${n1(top + drop)} ${n1(x + r)} ${n1(top + drop + r * 0.9)} Z`, e.lin([[0, lighten(c || '#2f2c29', 0.2)], [1, darken(c || '#2f2c29', 0.2)]], { x1: 0, y1: 0, x2: 0, y2: 1 }));
  if (on) s += ell(x, top + drop + r * 0.9, r * 0.8, r * 0.2, '#fff2c9') + path(P([[x - r * 0.8, top + drop + r * 0.9], [x + r * 0.8, top + drop + r * 0.9], [x + r * 2.6, top + drop + r * 6], [x - r * 2.6, top + drop + r * 6]]), '#ffe7ae', { opacity: 0.16 });
  return s;
}
function cabinetRun(e, x, y, w, h, c, o) {
  const k = o || {}; const col = e.tint(c || '#dfe3df'); const doors = Math.max(2, Math.round(w / (h * 0.55))); const dw = w / doors; let s = rect(x, y, w, h, darken(col, 0.18));
  for (let i = 0; i < doors; i++) { s += rect(x + i * dw + 2 * e.s, y + 2 * e.s, dw - 4 * e.s, h - 4 * e.s, e.lin([[0, lighten(col, 0.08)], [1, darken(col, 0.06)]], { x1: 0, y1: 0, x2: 0.4, y2: 1 }), { rx: 1.5 * e.s }); s += rect(x + i * dw + dw * 0.18, y + h * 0.14, dw * 0.64, h * 0.72, 'none', { stroke: darken(col, 0.1), 'stroke-width': n1(1 * e.s) }); s += rect(x + i * dw + (i % 2 ? dw * 0.14 : dw * 0.78), y + (k.upper ? h * 0.7 : h * 0.18), 2.5 * e.s, h * 0.14, '#b89a5a', { rx: 1 * e.s }); }
  return s;
}
function tileGrid(e, x, y, w, h, c, o) {
  const k = o || {}; const col = e.tint(c || '#e9eef0'); const tw = (k.size || 26) * e.s, th = tw * (k.subway ? 0.5 : 1); let s = rect(x, y, w, h, darken(col, 0.12)); const R = rng(hashStr(`tile${x}${y}`));
  for (let r = 0; r * th < h; r++) for (let q = -1; q * tw < w; q++) { const ox = k.subway && r % 2 ? tw / 2 : 0; const px = x + q * tw + ox, py = y + r * th; const x0 = Math.max(x, px + 1), x1 = Math.min(x + w, px + tw - 1); if (x1 <= x0) continue; s += rect(x0, py + 1, x1 - x0, Math.min(th - 2, y + h - py - 1), mix(col, lighten(col, 0.3), R() * 0.5)); }
  return s;
}
function table(e, x, topY, W, c, o) {
  const k = o || {}; const col = e.tint(c || '#8b6a4c'); let s = e.shadow(x, topY + W * 0.34, W * 0.5, W * 0.04, 0.28);
  s += rect(x - W / 2, topY, W, W * 0.05, e.lin([[0, lighten(col, 0.15)], [1, darken(col, 0.2)]], { x1: 0, y1: 0, x2: 0, y2: 1 }), { rx: 2 * e.s });
  s += rect(x - W * 0.44, topY + W * 0.05, W * 0.03, W * 0.3, darken(col, 0.25)) + rect(x + W * 0.41, topY + W * 0.05, W * 0.03, W * 0.3, darken(col, 0.25));
  if (k.cloth) s += rect(x - W / 2 - 2 * e.s, topY - 1, W + 4 * e.s, W * 0.12, '#f6f2ea', { rx: 2 * e.s });
  return s;
}
function stool(e, x, baseY, h, c) { return rect(x - h * 0.2, baseY - h, h * 0.4, h * 0.08, e.cyl(e.tint(c || '#6b4a33')), { rx: 3 * e.s }) + line(x - h * 0.14, baseY - h * 0.92, x - h * 0.2, baseY, '#2d2926', 2 * e.s) + line(x + h * 0.14, baseY - h * 0.92, x + h * 0.2, baseY, '#2d2926', 2 * e.s) + line(x - h * 0.17, baseY - h * 0.35, x + h * 0.17, baseY - h * 0.35, '#2d2926', 1.4 * e.s); }
function mirrorRound(e, x, y, r) { return circ(x, y, r, '#c9a86a') + circ(x, y, r * 0.92, e.lin([[0, '#eef4f6'], [1, '#c8d6dc']], { x1: 0, y1: 0, x2: 1, y2: 1 })) + path(P([[x - r * 0.5, y - r * 0.5], [x - r * 0.2, y - r * 0.7], [x + r * 0.2, y + r * 0.6], [x - r * 0.1, y + r * 0.75]]), '#fff', { opacity: 0.35 }); }
function sparkle(e, x, y, r, c) { return path(`M${n1(x)} ${n1(y - r)} Q${n1(x + r * 0.12)} ${n1(y - r * 0.12)} ${n1(x + r)} ${n1(y)} Q${n1(x + r * 0.12)} ${n1(y + r * 0.12)} ${n1(x)} ${n1(y + r)} Q${n1(x - r * 0.12)} ${n1(y + r * 0.12)} ${n1(x - r)} ${n1(y)} Q${n1(x - r * 0.12)} ${n1(y - r * 0.12)} ${n1(x)} ${n1(y - r)} Z`, c || '#ffffff', { opacity: 0.9 }); }
function bookRow(e, x, baseY, w, h, o) {
  const k = o || {}; const R = rng(hashStr(`bk${x}${baseY}`)); const cols = k.law ? ['#6b1f24', '#2e3f2e', '#1f2b44', '#5a3b1d', '#7a2e2e'] : ['#c65d3b', '#3f6c8a', '#e0b44a', '#6b8f5a', '#8c5a8a', '#2f3b4a']; let s = '', cx = x;
  while (cx < x + w - 6 * e.s) { const bw = (8 + R() * 8) * e.s, bh = h * (0.72 + R() * 0.28); const c = e.tint(cols[Math.floor(R() * cols.length)]); s += rect(cx, baseY - bh, bw - 1, bh, e.lin([[0, lighten(c, 0.12)], [1, darken(c, 0.18)]]), { rx: 1 * e.s }); if (k.law) { s += rect(cx + 1, baseY - bh * 0.8, bw - 3, 2 * e.s, '#d8b25a') + rect(cx + 1, baseY - bh * 0.3, bw - 3, 2 * e.s, '#d8b25a'); } else s += rect(cx + 2, baseY - bh * 0.7, bw - 5, 3 * e.s, lighten(c, 0.4), { opacity: 0.8 }); cx += bw; }
  return s;
}
// ---- rooms ------------------------------------------------------------------------------------------------------
function livingRoom(e, o) {
  const k = o || {}; const wall = k.wall ? e.tint(k.wall) : null; const hz = e.h * 0.7;
  let s = A.room(e, { horizon: 0.7, wall, window: k.city ? [0.5, 0.08, 0.44, 0.5] : [0.62, 0.12, 0.26, 0.4], city: !!k.city, night: !!k.night });
  if (k.trim !== false) s += rect(0, hz - 10 * e.s, e.w, 4 * e.s, '#fbfaf7');
  s += artFrame(e, e.w * 0.18, e.h * 0.18, e.w * 0.18, e.h * 0.2);
  s += rect(e.w * 0.08, hz + (e.h - hz) * 0.25, e.w * 0.84, (e.h - hz) * 0.55, e.tint(k.rug || '#d8cbb7'), { rx: 4 * e.s, opacity: 0.85 });
  s += mark(sofa(e, e.w * 0.42, hz + (e.h - hz) * 0.42, e.w * 0.5, k.sofa));
  s += floorLamp(e, e.w * 0.78, hz + (e.h - hz) * 0.3, e.h * 0.5, !!k.lampOn) + plantPot(e, e.w * 0.1, hz + (e.h - hz) * 0.3, e.h * 0.34);
  s += mark(table(e, e.w * 0.46, hz + (e.h - hz) * 0.55, e.w * 0.22, '#7a5b40'));
  if (k.sparkle) [[0.3, 0.84], [0.62, 0.88], [0.52, 0.76], [0.86, 0.9], [0.2, 0.92]].forEach(([fx, fy], i) => { s += sparkle(e, e.w * fx, e.h * fy, (6 + (i % 3) * 3) * e.s); });
  return s;
}
function kitchen(e, o) {
  const k = o || {}; const hz = e.h * 0.62; const cab = k.cabinets || '#dde2dc';
  let s = A.room(e, { horizon: 0.62, boards: true, floor: e.tint(k.floor || '#b58d67') });
  s += tileGrid(e, e.w * 0.06, e.h * 0.28, e.w * 0.88, e.h * 0.16, '#eef1f0', { subway: true, size: 22 });
  s += cabinetRun(e, e.w * 0.06, e.h * 0.06, e.w * 0.36, e.h * 0.2, cab, { upper: true }) + cabinetRun(e, e.w * 0.58, e.h * 0.06, e.w * 0.36, e.h * 0.2, cab, { upper: true });
  s += path(P([[e.w * 0.44, e.h * 0.06], [e.w * 0.56, e.h * 0.06], [e.w * 0.6, e.h * 0.24], [e.w * 0.4, e.h * 0.24]]), e.cyl('#bfc4c9'));
  s += rect(e.w * 0.06, e.h * 0.44, e.w * 0.88, e.h * 0.03, e.lin([[0, '#f4f2ef'], [1, '#cfccc7']], { x1: 0, y1: 0, x2: 0, y2: 1 })) + cabinetRun(e, e.w * 0.06, e.h * 0.47, e.w * 0.88, hz - e.h * 0.47, cab);
  // island in front
  const iy = e.h * 0.66; s += e.shadow(e.cx, e.h * 0.95, e.w * 0.36, e.h * 0.02, 0.3); const m0 = s.length;
  s += rect(e.w * 0.2, iy, e.w * 0.6, e.h * 0.035, e.lin([[0, '#f7f5f2'], [1, '#d6d2cb']], { x1: 0, y1: 0, x2: 0, y2: 1 })) + cabinetRun(e, e.w * 0.22, iy + e.h * 0.035, e.w * 0.56, e.h * 0.25, k.island || darken(e.tint(cab), 0.3));
  s += A.ceramic(e, e.w * 0.36, iy, e.h * 0.12, '#e9e1d4', { form: 'vase', stems: true }); s = markFrom(s, m0);
  [0.32, 0.5, 0.68].forEach(f => { s += pendant(e, e.w * f, 0, e.h * 0.1, e.w * 0.035, true, '#2d2a27'); });
  return s;
}
function bathroom(e, o) {
  const k = o || {}; let s = rect(0, 0, e.w, e.h, e.tint('#e9eceb')) + tileGrid(e, 0, 0, e.w, e.h * 0.78, k.tile || '#e6ecec', { size: 34 });
  s += rect(0, e.h * 0.78, e.w, e.h * 0.22, e.lin([[0, e.tint('#cfc7bd')], [1, e.tint('#a79d91')]], { x1: 0, y1: 0, x2: 0, y2: 1 }));
  // glass shower panel with rain head
  s += rect(e.w * 0.64, e.h * 0.06, e.w * 0.3, e.h * 0.72, '#dff0f5', { opacity: 0.35, stroke: '#b7c6cc', 'stroke-width': n1(2 * e.s) }) + line(e.w * 0.8, e.h * 0.06, e.w * 0.8, e.h * 0.2, '#b0b5ba', 3 * e.s) + ell(e.w * 0.8, e.h * 0.21, e.w * 0.05, e.h * 0.012, '#c9ced3');
  for (let i = 0; i < 12; i++) s += line(e.w * (0.76 + (i % 6) * 0.016), e.h * 0.23, e.w * (0.755 + (i % 6) * 0.018), e.h * (0.4 + (i % 4) * 0.08), '#bfe3f2', 1 * e.s, { opacity: 0.6 });
  // vanity, vessel sink, faucet, mirror
  const m0 = s.length; s += mirrorRound(e, e.w * 0.32, e.h * 0.28, e.w * 0.13);
  s += rect(e.w * 0.1, e.h * 0.52, e.w * 0.44, e.h * 0.04, e.lin([[0, '#f5f3ef'], [1, '#d7d3cc']], { x1: 0, y1: 0, x2: 0, y2: 1 })) + cabinetRun(e, e.w * 0.11, e.h * 0.56, e.w * 0.42, e.h * 0.2, k.vanity || '#7a5b40');
  s += ell(e.w * 0.32, e.h * 0.515, e.w * 0.1, e.h * 0.03, '#ffffff', { stroke: '#d9dde0', 'stroke-width': n1(1.5 * e.s) }) + faucetShape(e, e.w * 0.32, e.h * 0.49, e.h * 0.1, false); s = markFrom(s, m0);
  s += rect(e.w * 0.03, e.h * 0.4, e.w * 0.05, e.h * 0.22, e.tint(k.towel || '#e7d8c6'), { rx: 3 * e.s }) + plantPot(e, e.w * 0.5, e.h * 0.52, e.h * 0.18);
  return s;
}
function treatmentRoom(e, o) {
  const k = o || {}; const hz = e.h * 0.68;
  let s = A.room(e, { horizon: 0.68, window: [0.7, 0.1, 0.22, 0.38], wall: e.tint(k.wall || (k.spa ? '#efe4d8' : '#eef0ec')) });
  if (k.spa) {
    // a spa room: warm wall, a shelf of candles and rolled towels instead of a clinical chart
    s += rect(e.w * 0.08, e.h * 0.3, e.w * 0.3, 4 * e.s, '#8b6a4c');
    for (let i = 0; i < 3; i++) s += A.candle(e, e.w * (0.12 + i * 0.1), e.h * 0.3, e.h * 0.05, e.tint('#efe6d6'), { noLabel: true });
  } else {
    // anatomy chart: a simple spine and knee study
    s += rect(e.w * 0.08, e.h * 0.1, e.w * 0.14, e.h * 0.3, '#fbfaf7', { stroke: '#d5d0c8', 'stroke-width': n1(1.5 * e.s) });
    for (let i = 0; i < 9; i++) s += rect(e.w * 0.145 - 5 * e.s, e.h * (0.14 + i * 0.026), 10 * e.s, e.h * 0.018, e.tint('#c9b8a6'), { rx: 2 * e.s });
  }
  // treatment table
  const ty = hz + (e.h - hz) * 0.18; const tx = e.w * 0.46, tw = e.w * 0.48;
  s += e.shadow(tx, e.h * 0.94, tw * 0.55, e.h * 0.02, 0.3); const m0 = s.length;
  const uph = k.upholstery || (k.spa ? '#d8c8b4' : '#3f5f6b');
  s += rect(tx - tw / 2, ty, tw, e.h * 0.05, e.lin([[0, lighten(e.tint(uph), 0.15)], [1, darken(e.tint(uph), 0.15)]], { x1: 0, y1: 0, x2: 0, y2: 1 }), { rx: 5 * e.s });
  if (!k.spa) s += path(P([[tx - tw / 2, ty], [tx - tw / 2 + tw * 0.2, ty], [tx - tw / 2 + tw * 0.14, ty - e.h * 0.08], [tx - tw / 2 - tw * 0.02, ty - e.h * 0.05]]), e.tint(darken(uph, 0.05)));
  else s += rect(tx - tw * 0.3, ty - e.h * 0.03, tw * 0.5, e.h * 0.035, '#f6f1e8', { rx: 4 * e.s }) + A.sprig(e, tx + tw * 0.2, ty - e.h * 0.02, e.h * 0.1, -30);
  s += rect(tx - tw / 2 + tw * 0.62, ty - e.h * 0.02, tw * 0.22, e.h * 0.025, '#f6f3ee', { rx: 4 * e.s });
  // the legs stand on the floor where the shadow falls (they used to run off the bottom of the picture)
  const legH = e.h * 0.93 - (ty + e.h * 0.05);
  s += rect(tx - tw * 0.36, ty + e.h * 0.05, 6 * e.s, legH, '#b6bbc0') + rect(tx + tw * 0.34, ty + e.h * 0.05, 6 * e.s, legH, '#b6bbc0') + rect(tx - tw * 0.36, ty + e.h * 0.05 + legH * 0.62, tw * 0.72, 4 * e.s, '#b6bbc0');
  s = markFrom(s, m0);
  if (k.spa) return s + O.shrub(e, e.w * 0.88, e.h * 0.9, e.h * 0.06) + plantPot(e, e.w * 0.07, hz + (e.h - hz) * 0.25, e.h * 0.26);
  // equipment on the floor: exercise ball, foam roller, resistance bands on a hook
  s += circ(e.w * 0.86, e.h * 0.84, e.h * 0.1, e.rad([[0, lighten(e.accent, 0.4)], [1, darken(e.accent, 0.15)]], { cx: 0.35, cy: 0.3 })) + e.shadow(e.w * 0.86, e.h * 0.95, e.h * 0.1, e.h * 0.015, 0.3);
  s += rect(e.w * 0.1, e.h * 0.88, e.w * 0.2, e.h * 0.05, e.cyl('#3a4a5a'), { rx: e.h * 0.025, transform: `rotate(-4 ${n1(e.w * 0.2)} ${n1(e.h * 0.9)})` });
  ['#e05a47', '#3f8fd1', '#6cbf5a'].forEach((c, i) => { s += path(`M${n1(e.w * 0.3 + i * 10 * e.s)} ${n1(e.h * 0.1)} q${n1(-8 * e.s)} ${n1(e.h * 0.12)} 0 ${n1(e.h * 0.24)}`, 'none', { stroke: c, 'stroke-width': n1(4 * e.s), 'stroke-linecap': 'round' }); });
  s += plantPot(e, e.w * 0.07, hz + (e.h - hz) * 0.25, e.h * 0.26);
  return s;
}
function menuBoard(e, x, y, w, h, items) {
  let s = rect(x, y, w, h, '#23211f', { rx: 3 * e.s, stroke: '#6b4a33', 'stroke-width': n1(4 * e.s) });
  const list = (items || []).slice(0, 5);
  list.forEach((it, i) => { s += A.wordmark(e, it, x + w * 0.1, y + h * (0.22 + i * 0.16), Math.min(h * 0.09, w * 0.07), '#f3eee4', { anchor: 'start', weight: 600, spacing: '0.02em', maxWidth: w * 0.62 }) + line(x + w * 0.72, y + h * (0.2 + i * 0.16), x + w * 0.86, y + h * (0.2 + i * 0.16), '#f3eee4', 1 * e.s, { opacity: 0.35, 'stroke-dasharray': `${n1(2 * e.s)} ${n1(3 * e.s)}` }); });
  if (!list.length) for (let i = 0; i < 4; i++) s += rect(x + w * 0.1, y + h * (0.18 + i * 0.18), w * (0.5 + (i % 2) * 0.2), 3 * e.s, '#f3eee4', { opacity: 0.6 });
  return s;
}
function espressoMachine(e, x, baseY, W, c) {
  const col = c || '#c9ccd1'; const H = W * 0.62; let s = e.shadow(x, baseY, W * 0.55, W * 0.04, 0.3);
  s += rect(x - W / 2, baseY - H, W, H, e.lin([[0, lighten(col, 0.3)], [0.3, col], [1, darken(col, 0.35)]]), { rx: 5 * e.s });
  s += rect(x - W / 2, baseY - H, W, H * 0.16, darken(col, 0.2), { rx: 5 * e.s }) + rect(x - W * 0.3, baseY - H * 0.78, W * 0.6, H * 0.12, '#2a2724', { rx: 2 * e.s });
  [-0.22, 0.22].forEach(f => { s += rect(x + f * W - W * 0.08, baseY - H * 0.56, W * 0.16, H * 0.1, e.cyl('#3b3632'), { rx: 2 * e.s }) + line(x + f * W, baseY - H * 0.5, x + f * W + W * 0.16, baseY - H * 0.5, '#2a2724', 3.2 * e.s); });
  s += circ(x, baseY - H * 0.72, W * 0.05, '#fdfdfd', { stroke: '#555', 'stroke-width': n1(1.2 * e.s) }) + line(x, baseY - H * 0.72, x + W * 0.03, baseY - H * 0.74, '#c0392b', 1 * e.s);
  s += rect(x - W * 0.4, baseY - H * 0.14, W * 0.8, H * 0.06, '#3b3632', { rx: 1.5 * e.s });
  s += A.ceramic(e, x - W * 0.22, baseY - H * 0.14, H * 0.16, '#f4f1ec', { form: 'mug', drink: '#5d3a1e' });
  return s;
}
function cafeRoom(e, o) {
  const k = o || {}; const hz = e.h * 0.64;
  let s = A.room(e, { horizon: 0.64, wall: e.tint(k.wall || '#e8dccb'), window: [0.72, 0.1, 0.22, 0.36] });
  s += menuBoard(e, e.w * 0.08, e.h * 0.1, e.w * 0.3, e.h * 0.26, k.items);
  // shelves with cups
  s += rect(e.w * 0.42, e.h * 0.2, e.w * 0.24, 4 * e.s, '#6b4a33') + rect(e.w * 0.42, e.h * 0.32, e.w * 0.24, 4 * e.s, '#6b4a33');
  for (let i = 0; i < 5; i++) { s += A.ceramic(e, e.w * 0.45 + i * e.w * 0.045, e.h * 0.2, e.h * 0.05, i % 2 ? '#e9e1d4' : e.tint('#b9855a'), { form: 'mug' }); s += A.ceramic(e, e.w * 0.46 + i * e.w * 0.045, e.h * 0.32, e.h * 0.045, '#f1ede6', { form: 'bowl' }); }
  // counter across the room
  const cy = e.h * 0.5; s += rect(0, cy, e.w, e.h * 0.03, e.lin([[0, '#9a7250'], [1, '#6b4a33']], { x1: 0, y1: 0, x2: 0, y2: 1 })) + rect(0, cy + e.h * 0.03, e.w, hz - cy, e.lin([[0, e.tint('#efe7da')], [1, e.tint('#d5c8b4')]], { x1: 0, y1: 0, x2: 0, y2: 1 }));
  for (let i = 0; i < 16; i++) s += line(i * e.w / 16, cy + e.h * 0.03, i * e.w / 16, hz, e.tint('#c4b39c'), 1 * e.s, { opacity: 0.7 });
  s += mark(espressoMachine(e, e.w * 0.6, cy, e.w * 0.22));
  s += A.jar(e, e.w * 0.28, cy, e.h * 0.1, '#e8f0f2', { open: false, lid: '#c9ccd1', noLabel: true, contents: '#c99a5c', wide: 0.8 });
  [0.22, 0.46, 0.7].forEach(f => { s += pendant(e, e.w * f, 0, e.h * 0.07, e.w * 0.03, true, '#1f1d1b'); });
  [0.18, 0.38, 0.58, 0.78].forEach(f => { s += stool(e, e.w * f, e.h * 0.96, e.h * 0.26, '#6b4a33'); });
  s += plantPot(e, e.w * 0.92, cy, e.h * 0.2);
  return s;
}
function barRoom(e, o) {
  const k = o || {}; let s = rect(0, 0, e.w, e.h, e.lin([[0, '#1d1714'], [1, '#0e0b0a']], { x1: 0, y1: 0, x2: 0, y2: 1 }));
  // backlit shelves of bottles
  const sy = [0.14, 0.3, 0.46]; s += rect(e.w * 0.06, e.h * 0.06, e.w * 0.88, e.h * 0.48, e.rad([[0, '#6a4a28', 0.9], [1, '#1d1714', 0.2]], { cx: 0.5, cy: 0.4, r: 0.7 }));
  const cols = ['#3d6b3a', '#8a3b2a', '#c9a24a', '#2e4a6b', '#d9d2c3', '#5a2b3b'];
  sy.forEach((fy, r) => { s += rect(e.w * 0.06, e.h * fy + e.h * 0.1, e.w * 0.88, 3 * e.s, '#b8914a'); for (let i = 0; i < 12; i++) s += A.bottle(e, e.w * 0.1 + i * e.w * 0.07, e.h * fy + e.h * 0.1, e.h * (0.1 + ((i + r) % 3) * 0.015), e.tint(cols[(i + r) % cols.length]), { style: (i + r) % 4 === 0 ? 'spirit' : (i % 3 ? 'wine' : 'oil') }); });
  // the bar
  s += rect(0, e.h * 0.62, e.w, e.h * 0.04, e.lin([[0, '#a57a4c'], [1, '#5a3b22']], { x1: 0, y1: 0, x2: 0, y2: 1 })) + rect(0, e.h * 0.66, e.w, e.h * 0.34, e.lin([[0, '#3a2618'], [1, '#1b120c']], { x1: 0, y1: 0, x2: 0, y2: 1 }));
  s += line(0, e.h * 0.9, e.w, e.h * 0.9, '#c9a24a', 3 * e.s);
  s += mark(glassware(e, e.w * 0.32, e.h * 0.62, e.h * 0.14, 'coupe', '#e8a23a') + glassware(e, e.w * 0.62, e.h * 0.62, e.h * 0.16, 'rocks', '#b8642a'));
  [0.25, 0.5, 0.75].forEach(f => { s += pendant(e, e.w * f, 0, e.h * 0.04, e.w * 0.025, true, '#c9a24a'); });
  return s;
}
function glassware(e, x, baseY, H, kind, drink, o) {
  const k = o || {}; let s = e.shadow(x, baseY, H * 0.3, H * 0.04, 0.3); const glass = '#e9f2f5';
  if (kind === 'coupe') {
    s += line(x, baseY, x, baseY - H * 0.5, glass, 2 * e.s, { opacity: 0.8 }) + ell(x, baseY, H * 0.18, H * 0.03, glass, { opacity: 0.8 });
    s += path(`M${n1(x - H * 0.36)} ${n1(baseY - H * 0.9)} Q${n1(x - H * 0.3)} ${n1(baseY - H * 0.5)} ${n1(x)} ${n1(baseY - H * 0.5)} Q${n1(x + H * 0.3)} ${n1(baseY - H * 0.5)} ${n1(x + H * 0.36)} ${n1(baseY - H * 0.9)} Z`, drink, { opacity: 0.85 }) + ell(x, baseY - H * 0.9, H * 0.36, H * 0.05, lighten(drink, 0.3));
    if (k.garnish !== false) s += A.citrusWheel(e, x + H * 0.3, baseY - H * 0.92, H * 0.12, A.FLAVOUR_COLOURS[k.garnish] || A.FLAVOUR_COLOURS.orange);
  } else if (kind === 'wine') {
    s += line(x, baseY, x, baseY - H * 0.45, glass, 2 * e.s, { opacity: 0.8 }) + ell(x, baseY, H * 0.16, H * 0.03, glass, { opacity: 0.8 });
    s += path(`M${n1(x - H * 0.2)} ${n1(baseY - H)} Q${n1(x - H * 0.26)} ${n1(baseY - H * 0.5)} ${n1(x)} ${n1(baseY - H * 0.45)} Q${n1(x + H * 0.26)} ${n1(baseY - H * 0.5)} ${n1(x + H * 0.2)} ${n1(baseY - H)} Z`, glass, { opacity: 0.35 }) + path(`M${n1(x - H * 0.23)} ${n1(baseY - H * 0.7)} Q${n1(x - H * 0.22)} ${n1(baseY - H * 0.5)} ${n1(x)} ${n1(baseY - H * 0.47)} Q${n1(x + H * 0.22)} ${n1(baseY - H * 0.5)} ${n1(x + H * 0.23)} ${n1(baseY - H * 0.7)} Z`, drink, { opacity: 0.9 });
  } else if (kind === 'pint') {
    s += path(P([[x - H * 0.26, baseY - H], [x + H * 0.26, baseY - H], [x + H * 0.2, baseY], [x - H * 0.2, baseY]]), e.lin([[0, lighten(drink, 0.2)], [0.35, drink], [1, darken(drink, 0.25)]]), { opacity: 0.92 }) + rect(x - H * 0.26, baseY - H, H * 0.52, H * 0.14, '#fbf5e6') + A.bubbles(e, x - H * 0.18, baseY - H * 0.8, H * 0.36, H * 0.7, 12, 0.5);
  } else { // rocks / serving glass over ice
    s += path(P([[x - H * 0.34, baseY - H * 0.8], [x + H * 0.34, baseY - H * 0.8], [x + H * 0.3, baseY], [x - H * 0.3, baseY]]), glass, { opacity: 0.4 }) + rect(x - H * 0.3, baseY - H * 0.55, H * 0.6, H * 0.52, drink, { opacity: 0.85 });
    for (let i = 0; i < 3; i++) s += rect(x - H * 0.22 + i * H * 0.14, baseY - H * (0.62 - (i % 2) * 0.08), H * 0.16, H * 0.16, '#f2f8fb', { opacity: 0.8, rx: 2 * e.s, transform: `rotate(${i * 14 - 10} ${n1(x)} ${n1(baseY - H * 0.5)})` });
    if (k.garnish) s += A.citrusWheel(e, x + H * 0.28, baseY - H * 0.8, H * 0.14, A.FLAVOUR_COLOURS[k.garnish] || A.FLAVOUR_COLOURS.lime);
    if (k.garnishSprig) s += A.sprig(e, x - H * 0.05, baseY - H * 0.7, H * 0.5, -80);
  }
  return s + A._svg.rect(x - H * 0.28, baseY - H * 0.85, H * 0.05, H * 0.5, '#fff', { opacity: 0.25, rx: 2 * e.s });
}
function diningRoom(e, o) {
  let s = rect(0, 0, e.w, e.h, e.lin([[0, e.tint('#2a1e17')], [1, e.tint('#140e0b')]], { x1: 0, y1: 0, x2: 0, y2: 1 }));
  s += rect(0, e.h * 0.55, e.w, e.h * 0.45, e.lin([[0, '#3b281c'], [1, '#1c130d']], { x1: 0, y1: 0, x2: 0, y2: 1 }));
  for (let i = 0; i < 5; i++) s += rect(e.w * (0.05 + i * 0.2), e.h * 0.12, e.w * 0.12, e.h * 0.24, e.tint('#3f2c20'), { stroke: '#8a6a3a', 'stroke-width': n1(2 * e.s) });
  const m0 = s.length;
  [[0.25, 0.7, 0.34], [0.72, 0.68, 0.3], [0.5, 0.86, 0.4]].forEach(([fx, fy, fw]) => {
    const x = e.w * fx, y = e.h * fy, w = e.w * fw;
    s += e.shadow(x, y + w * 0.35, w * 0.55, w * 0.05, 0.5) + ell(x, y, w / 2, w * 0.1, '#f6efe2') + rect(x - w * 0.02, y + w * 0.08, w * 0.04, w * 0.3, '#2a1d15');
    s += A.ceramic(e, x - w * 0.18, y - 1, w * 0.06, '#f4f1ec', { form: 'bowl' }) + A.ceramic(e, x + w * 0.18, y - 1, w * 0.06, '#f4f1ec', { form: 'bowl' });
    s += rect(x - 2 * e.s, y - w * 0.14, 4 * e.s, w * 0.14, '#fbf3df') + circ(x, y - w * 0.17, 4 * e.s, '#ffcf6b') + circ(x, y - w * 0.17, w * 0.18, '#ffc864', { opacity: 0.18 });
    s += glassware(e, x + w * 0.3, y - 1, w * 0.12, 'wine', '#7a1f2b');
  }); s = markFrom(s, m0);
  [0.2, 0.5, 0.8].forEach(f => { s += pendant(e, e.w * f, 0, e.h * 0.06, e.w * 0.025, true, '#c9a24a'); });
  return s;
}
function classroom(e, o) {
  const k = o || {}; let s = A.room(e, { horizon: 0.7, wall: e.tint('#efe9dc'), window: [0.76, 0.1, 0.18, 0.36] });
  const m0 = s.length; s += rect(e.w * 0.08, e.h * 0.1, e.w * 0.58, e.h * 0.32, '#2f4a3c', { stroke: '#8a6a4c', 'stroke-width': n1(6 * e.s) });
  const chalk = (k.subject === 'math') ? ['x² + 3x = 10', '(x + 5)(x − 2) = 0'] : (k.subject === 'reading') ? ['Chapter 3', 'Main idea · Evidence'] : ['Today', 'Practice · Review'];
  chalk.forEach((t, i) => { s += A.wordmark(e, t, e.w * 0.12, e.h * (0.2 + i * 0.09), e.h * 0.045, '#f3f1e8', { anchor: 'start', weight: 500, spacing: '0.01em', serif: true, opacity: 0.9 }); });
  s += path(`M${n1(e.w * 0.46)} ${n1(e.h * 0.3)} q${n1(e.w * 0.04)} ${n1(-e.h * 0.08)} ${n1(e.w * 0.12)} ${n1(-e.h * 0.02)}`, 'none', { stroke: '#f3f1e8', 'stroke-width': n1(2 * e.s), opacity: 0.8 }); s = markFrom(s, m0);
  [[0.24, 0.8], [0.56, 0.8], [0.4, 0.95]].forEach(([fx, fy]) => { s += table(e, e.w * fx, e.h * fy - e.h * 0.1, e.w * 0.22, '#b98a55'); s += rect(e.w * fx - e.w * 0.06, e.h * fy - e.h * 0.115, e.w * 0.07, e.h * 0.012, '#fbfaf5') + rect(e.w * fx + e.w * 0.02, e.h * fy - e.h * 0.118, e.w * 0.05, e.h * 0.015, e.tint('#c65d3b')); });
  return s;
}
function office(e, o) {
  const k = o || {}; let s = A.room(e, { horizon: 0.7, wall: e.tint(k.wall || '#e9e6e0'), window: [0.1, 0.08, 0.5, 0.5], city: true, night: !!k.night });
  s += rect(e.w * 0.68, e.h * 0.08, e.w * 0.26, e.h * 0.62, e.tint('#6b4a33'));
  [0.2, 0.36, 0.52].forEach(f => { s += rect(e.w * 0.68, e.h * f, e.w * 0.26, 4 * e.s, '#4a3222') + bookRow(e, e.w * 0.7, e.h * f, e.w * 0.22, e.h * 0.1, { law: k.law }); });
  const m0 = s.length; s += table(e, e.w * 0.4, e.h * 0.72, e.w * 0.5, '#5a3e2a');
  s += rect(e.w * 0.22, e.h * 0.705, e.w * 0.14, e.h * 0.016, '#fbfaf5', { transform: `rotate(-4 ${n1(e.w * 0.29)} ${n1(e.h * 0.71)})` }) + A.ceramic(e, e.w * 0.52, e.h * 0.72, e.h * 0.05, '#f1ede6', { form: 'mug' }); s = markFrom(s, m0);
  s += floorLamp(e, e.w * 0.62, e.h * 0.72, e.h * 0.16, true);
  return s;
}
function studioRoom(e, o) {
  const k = o || {}; let s = A.room(e, { horizon: 0.58, wall: e.tint(k.wall || '#f1ece4'), window: [0.08, 0.08, 0.3, 0.36] });
  s += rect(e.w * 0.46, e.h * 0.08, e.w * 0.46, e.h * 0.44, e.lin([[0, '#eef2f3'], [1, '#d4dde0']], { x1: 0, y1: 0, x2: 1, y2: 1 }), { stroke: '#cfc7bb', 'stroke-width': n1(3 * e.s) });
  const eq = k.equipment || 'reformer';
  const m0 = s.length; [0, 1, 2].forEach(i => { const y = e.h * (0.7 + i * 0.12), x = e.w * (0.52 - i * 0.03), W = e.w * (0.7 + i * 0.12); s += eq === 'mat' ? yogaMat(e, x, y, W * 0.7) : reformer(e, x, y, W); }); s = markFrom(s, m0);
  s += O.shrub(e, e.w * 0.92, e.h * 0.6, e.h * 0.06);
  return s;
}
// a pilates reformer seen from the side: wooden frame on feet, the padded carriage, shoulder blocks, footbar, springs, straps
function reformer(e, x, y, W) {
  const wood = e.tint('#c49a6c'); const pad = e.tint('#e9e2d6'); const steel = '#a9aeb3'; let s = e.shadow(x, y + W * 0.02, W * 0.52, W * 0.03, 0.3);
  const fy = y - W * 0.05; // top of the frame rail
  s += rect(x - W * 0.47, fy + W * 0.05, W * 0.03, W * 0.03, darken(wood, 0.35)) + rect(x + W * 0.44, fy + W * 0.05, W * 0.03, W * 0.03, darken(wood, 0.35));
  s += rect(x - W / 2, fy, W, W * 0.055, e.lin([[0, lighten(wood, 0.22)], [0.5, wood], [1, darken(wood, 0.28)]], { x1: 0, y1: 0, x2: 0, y2: 1 }), { rx: W * 0.012 });
  // springs at the foot end
  for (let i = 0; i < 4; i++) s += path(`M${n1(x + W * 0.14)} ${n1(fy + W * (0.012 + i * 0.01))} ${Array.from({ length: 10 }, (_, q) => `L${n1(x + W * (0.16 + q * 0.018))} ${n1(fy + W * (0.012 + i * 0.01) + (q % 2 ? -2 : 2) * e.s)}`).join(' ')}`, 'none', { stroke: ['#e05a47', '#e0b44a', '#3f8fd1', '#6cbf5a'][i], 'stroke-width': n1(1.3 * e.s) });
  // carriage + shoulder blocks + headrest
  s += rect(x - W * 0.36, fy - W * 0.045, W * 0.44, W * 0.05, e.lin([[0, lighten(pad, 0.1)], [1, darken(pad, 0.14)]], { x1: 0, y1: 0, x2: 0, y2: 1 }), { rx: W * 0.018 });
  s += rect(x - W * 0.24, fy - W * 0.1, W * 0.03, W * 0.06, e.cyl(e.tint('#d8cdbd')), { rx: W * 0.01 }) + rect(x - W * 0.18, fy - W * 0.1, W * 0.03, W * 0.06, e.cyl(e.tint('#d8cdbd')), { rx: W * 0.01 });
  s += rect(x - W * 0.37, fy - W * 0.07, W * 0.07, W * 0.03, e.lin([[0, lighten(pad, 0.1)], [1, darken(pad, 0.12)]], { x1: 0, y1: 0, x2: 0, y2: 1 }), { rx: W * 0.012, transform: `rotate(-10 ${n1(x - W * 0.34)} ${n1(fy - W * 0.055)})` });
  // footbar
  s += path(`M${n1(x + W * 0.38)} ${n1(fy)} L${n1(x + W * 0.34)} ${n1(fy - W * 0.13)} L${n1(x + W * 0.42)} ${n1(fy - W * 0.13)}`, 'none', { stroke: steel, 'stroke-width': n1(W * 0.012), 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }) + rect(x + W * 0.325, fy - W * 0.142, W * 0.11, W * 0.025, e.cyl('#2d2a27'), { rx: W * 0.012 });
  // risers + ropes and loop straps
  s += line(x - W * 0.47, fy, x - W * 0.47, fy - W * 0.22, steel, W * 0.01) + circ(x - W * 0.47, fy - W * 0.22, W * 0.012, steel);
  s += path(`M${n1(x - W * 0.47)} ${n1(fy - W * 0.21)} Q${n1(x - W * 0.3)} ${n1(fy - W * 0.12)} ${n1(x - W * 0.12)} ${n1(fy - W * 0.06)}`, 'none', { stroke: '#2d2a27', 'stroke-width': n1(1.2 * e.s), opacity: 0.75 }) + ell(x - W * 0.11, fy - W * 0.06, W * 0.02, W * 0.012, 'none', { stroke: '#2d2a27', 'stroke-width': n1(2 * e.s) });
  return s;
}
function yogaMat(e, x, y, W, c) { const col = e.tint(c || lighten(e.accent, 0.3)); return e.shadow(x, y, W * 0.5, W * 0.03, 0.2) + path(P([[x - W * 0.42, y - W * 0.07], [x + W * 0.42, y - W * 0.07], [x + W * 0.5, y + W * 0.04], [x - W * 0.5, y + W * 0.04]]), e.lin([[0, lighten(col, 0.15)], [1, darken(col, 0.1)]], { x1: 0, y1: 0, x2: 0, y2: 1 })) + ell(x + W * 0.5, y - W * 0.02, W * 0.04, W * 0.07, darken(col, 0.15)); }
function salon(e, o) {
  let s = A.room(e, { horizon: 0.72, wall: e.tint('#efe6de'), boards: false, floor: e.tint('#d9d2c8') });
  [0.28, 0.72].forEach(f => { const x = e.w * f; s += rect(x - e.w * 0.12, e.h * 0.1, e.w * 0.24, e.h * 0.38, e.lin([[0, '#eef3f5'], [1, '#cdd8dc']], { x1: 0, y1: 0, x2: 1, y2: 1 }), { rx: e.w * 0.12, stroke: '#c9a86a', 'stroke-width': n1(3 * e.s) }); for (let i = 0; i < 5; i++) s += circ(x - e.w * 0.13 + i * e.w * 0.065, e.h * 0.08, 3.5 * e.s, '#fff7dc'); s += mark(salonChair(e, x, e.h * 0.94, e.h * 0.42)); });
  s += rect(e.w * 0.44, e.h * 0.52, e.w * 0.12, e.h * 0.02, '#c9a86a') + A.pump(e, e.w * 0.47, e.h * 0.52, e.h * 0.12, '#f3ede4') + A.bottle(e, e.w * 0.53, e.h * 0.52, e.h * 0.1, e.tint('#2d2d2d'), { style: 'toner' });
  return s;
}
function salonChair(e, x, baseY, h) {
  const c = e.tint('#3a3431'); let s = e.shadow(x, baseY, h * 0.35, h * 0.04, 0.3) + ell(x, baseY - 2 * e.s, h * 0.2, h * 0.035, '#9aa0a6') + rect(x - 3 * e.s, baseY - h * 0.38, 6 * e.s, h * 0.36, e.cyl('#b6bbc0'));
  s += rect(x - h * 0.24, baseY - h * 0.48, h * 0.48, h * 0.12, e.lin([[0, lighten(c, 0.2)], [1, darken(c, 0.2)]], { x1: 0, y1: 0, x2: 0, y2: 1 }), { rx: 6 * e.s }) + rect(x - h * 0.2, baseY - h * 0.95, h * 0.4, h * 0.5, e.lin([[0, lighten(c, 0.18)], [1, darken(c, 0.15)]], { x1: 0, y1: 0, x2: 0, y2: 1 }), { rx: 10 * e.s });
  s += rect(x - h * 0.3, baseY - h * 0.6, h * 0.08, h * 0.04, '#b6bbc0', { rx: 2 * e.s }) + rect(x + h * 0.22, baseY - h * 0.6, h * 0.08, h * 0.04, '#b6bbc0', { rx: 2 * e.s });
  return s;
}
function framing(e, o) {
  let s = A.room(e, { horizon: 0.74, wall: e.tint('#d9d2c6'), floor: e.tint('#b89a78') });
  const stud = e.tint('#d8b98a'); s += rect(0, e.h * 0.08, e.w, e.h * 0.03, e.cyl(stud)) + rect(0, e.h * 0.72, e.w, e.h * 0.03, e.cyl(stud));
  for (let i = 0; i < 9; i++) { const x = e.w * (0.05 + i * 0.115); s += rect(x, e.h * 0.11, e.w * 0.035, e.h * 0.61, e.lin([[0, lighten(stud, 0.15)], [0.5, stud], [1, darken(stud, 0.2)]])); for (let q = 0; q < 3; q++) s += line(x + e.w * 0.01, e.h * (0.2 + q * 0.18), x + e.w * 0.012, e.h * (0.26 + q * 0.18), darken(stud, 0.25), 0.8 * e.s, { opacity: 0.5 }); }
  s += rect(e.w * 0.32, e.h * 0.34, e.w * 0.28, e.h * 0.03, e.cyl(stud));
  s += mark(sawhorse(e, e.w * 0.3, e.h * 0.96, e.w * 0.24) + drill(e, e.w * 0.66, e.h * 0.92, e.w * 0.16));
  const R = rng(hashStr('dust')); for (let i = 0; i < 40; i++) s += circ(R() * e.w, e.h * (0.78 + R() * 0.2), (0.8 + R() * 1.6) * e.s, '#f1e3c6', { opacity: 0.7 });
  return s;
}
function sawhorse(e, x, baseY, W) { const wood = e.tint('#c9a26f'); return rect(x - W / 2, baseY - W * 0.44, W, W * 0.06, e.cyl(wood)) + line(x - W * 0.4, baseY - W * 0.38, x - W * 0.5, baseY, darken(wood, 0.2), 4 * e.s) + line(x + W * 0.4, baseY - W * 0.38, x + W * 0.5, baseY, darken(wood, 0.2), 4 * e.s) + rect(x - W * 0.3, baseY - W * 0.5, W * 0.6, W * 0.06, e.cyl(lighten(wood, 0.1)), { transform: `rotate(-3 ${n1(x)} ${n1(baseY - W * 0.47)})` }); }
// ---- trade tools ------------------------------------------------------------------------------------------------
function drill(e, x, baseY, L, c) {
  const col = c || '#e2a21a'; const u = L / 100; let s = e.shadow(x, baseY, L * 0.45, L * 0.06, 0.3);
  s += path(P([[x - 16 * u, baseY - 68 * u], [x + 6 * u, baseY - 68 * u], [x + 12 * u, baseY - 26 * u], [x - 8 * u, baseY - 26 * u]]), e.cyl('#2f3033')) + rect(x - 2 * u, baseY - 64 * u, 5 * u, 9 * u, '#1d1e20', { rx: 2 * u });
  s += path(`M${n1(x - 34 * u)} ${n1(baseY - 96 * u)} L${n1(x + 26 * u)} ${n1(baseY - 96 * u)} Q${n1(x + 34 * u)} ${n1(baseY - 96 * u)} ${n1(x + 34 * u)} ${n1(baseY - 84 * u)} L${n1(x + 34 * u)} ${n1(baseY - 74 * u)} Q${n1(x + 34 * u)} ${n1(baseY - 66 * u)} ${n1(x + 24 * u)} ${n1(baseY - 66 * u)} L${n1(x - 34 * u)} ${n1(baseY - 66 * u)} Z`, e.lin([[0, lighten(col, 0.25)], [1, darken(col, 0.3)]], { x1: 0, y1: 0, x2: 0, y2: 1 }));
  s += rect(x - 52 * u, baseY - 88 * u, 20 * u, 14 * u, e.cyl('#3a3b3f'), { rx: 3 * u }) + line(x - 74 * u, baseY - 81 * u, x - 52 * u, baseY - 81 * u, '#c9ccd1', 3 * u);
  s += rect(x - 16 * u, baseY - 26 * u, 34 * u, 20 * u, e.lin([[0, '#3a3b3f'], [1, '#1d1e20']], { x1: 0, y1: 0, x2: 0, y2: 1 }), { rx: 4 * u }) + rect(x - 16 * u, baseY - 12 * u, 34 * u, 6 * u, col, { rx: 2 * u });
  return s;
}
function paintCan(e, x, baseY, H, paint, o) {
  const k = o || {}; const W = H * 1.05, r = W / 2, top = baseY - H, er = W * 0.14;
  let s = e.shadow(x + W * 0.1, baseY + 2, W * 0.6, er * 0.6) + path(`M${n1(x - r)} ${n1(top)} L${n1(x - r)} ${n1(baseY)} A${n1(r)} ${n1(er)} 0 0 0 ${n1(x + r)} ${n1(baseY)} L${n1(x + r)} ${n1(top)} Z`, e.cyl('#c9ccd1', { edge: 0.35, hi: 0.4 }));
  s += rect(x - r, top + H * 0.2, W, H * 0.5, e.cyl(k.label || '#f4f1ec', { edge: 0.2 })) + rect(x - r, top + H * 0.2, W, H * 0.14, e.cyl(paint, { edge: 0.25 }));
  if (k.open) s += ell(x, top, r, er, '#9da2a7') + ell(x, top + 1, r * 0.88, er * 0.8, paint) + path(`M${n1(x + r * 0.2)} ${n1(top)} q${n1(r * 0.4)} ${n1(er * 0.5)} ${n1(r * 0.8)} ${n1(H * 0.4)}`, 'none', { stroke: paint, 'stroke-width': n1(5 * e.s), 'stroke-linecap': 'round' });
  else s += ell(x, top, r, er, e.rad([[0, '#eceef0'], [1, '#9da2a7']], { cx: 0.4, cy: 0.35 }));
  s += path(`M${n1(x - r * 0.9)} ${n1(top + H * 0.1)} Q${n1(x)} ${n1(top - H * 0.5)} ${n1(x + r * 0.9)} ${n1(top + H * 0.1)}`, 'none', { stroke: '#8b9096', 'stroke-width': n1(1.8 * e.s) });
  return s;
}
function rollerTray(e, x, baseY, W, paint) {
  let s = e.shadow(x, baseY, W * 0.55, W * 0.05, 0.3);
  s += path(P([[x - W / 2, baseY - W * 0.1], [x + W / 2, baseY - W * 0.2], [x + W / 2, baseY - W * 0.1], [x - W / 2, baseY]]), e.lin([[0, '#e2e4e6'], [1, '#a5aab0']], { x1: 0, y1: 0, x2: 0, y2: 1 }));
  s += path(P([[x - W * 0.46, baseY - W * 0.095], [x + W * 0.05, baseY - W * 0.15], [x + W * 0.05, baseY - W * 0.1], [x - W * 0.46, baseY - W * 0.03]]), paint, { opacity: 0.95 });
  // roller resting across
  const ry = baseY - W * 0.22; s += rect(x - W * 0.2, ry - W * 0.07, W * 0.46, W * 0.14, e.lin([[0, lighten(paint, 0.2)], [0.5, paint], [1, darken(paint, 0.25)]], { x1: 0, y1: 0, x2: 0, y2: 1 }), { rx: W * 0.07 });
  s += path(`M${n1(x + W * 0.26)} ${n1(ry)} L${n1(x + W * 0.34)} ${n1(ry)} L${n1(x + W * 0.34)} ${n1(ry - W * 0.14)} L${n1(x + W * 0.5)} ${n1(ry - W * 0.2)}`, 'none', { stroke: '#8b9096', 'stroke-width': n1(2.2 * e.s), 'stroke-linejoin': 'round' }) + rect(x + W * 0.48, ry - W * 0.34, W * 0.06, W * 0.2, e.cyl('#2d2a27'), { rx: W * 0.03, transform: `rotate(-24 ${n1(x + W * 0.51)} ${n1(ry - W * 0.24)})` });
  return s;
}
function brush(e, x, y, L, ang, paint) {
  const u = L / 100; return g(rect(-8 * u, -54 * u, 16 * u, 40 * u, e.cyl('#b98a55'), { rx: 6 * u }) + rect(-10 * u, -16 * u, 20 * u, 14 * u, e.cyl('#c9ccd1')) + path(P([[-10 * u, -2 * u], [10 * u, -2 * u], [9 * u, 22 * u], [-9 * u, 22 * u]]), e.lin([[0, '#e8dcc2'], [1, paint || '#d9d2c6']], { x1: 0, y1: 0, x2: 0, y2: 1 })), { transform: `translate(${n1(x)} ${n1(y)}) rotate(${ang || 0})` });
}
// a wall meeting the trim, the brush cutting a clean line, masking tape
function cuttingIn(e, o) {
  const k = o || {}; const paint = e.tint(k.paint || '#6f8f86'); const old = e.tint('#e9e3d8'); const y = e.h * 0.62;
  let s = rect(0, 0, e.w, e.h, old) + path(P([[0, 0], [e.w * 0.78, 0], [e.w * 0.7, y], [0, y]]), e.lin([[0, lighten(paint, 0.08)], [1, darken(paint, 0.08)]], { x1: 0, y1: 0, x2: 1, y2: 1 }));
  s += rect(0, y, e.w, e.h * 0.06, e.lin([[0, '#fdfcf9'], [1, '#e6e1d7']], { x1: 0, y1: 0, x2: 0, y2: 1 })) + rect(0, y + e.h * 0.06, e.w, e.h * 0.08, e.lin([[0, '#f7f5f0'], [1, '#d9d3c7']], { x1: 0, y1: 0, x2: 0, y2: 1 })) + rect(0, y + e.h * 0.14, e.w, e.h * 0.86 - y, e.tint('#b58d67'));
  s += rect(0, y - 3 * e.s, e.w, 5 * e.s, '#6fa3d6', { opacity: 0.85 });
  s += brush(e, e.w * 0.74, y - e.h * 0.12, e.h * 0.55, 38, paint);
  return s;
}
function faucetShape(e, x, baseY, H, running) {
  const chrome = e.lin([[0, '#7d848b'], [0.25, '#f4f6f8'], [0.5, '#aab2b9'], [1, '#6a7178']]);
  let s = rect(x - H * 0.09, baseY - H * 0.35, H * 0.18, H * 0.35, chrome, { rx: H * 0.04 }) + path(`M${n1(x - H * 0.05)} ${n1(baseY - H * 0.34)} L${n1(x - H * 0.05)} ${n1(baseY - H * 0.9)} Q${n1(x - H * 0.05)} ${n1(baseY - H * 1.05)} ${n1(x + H * 0.15)} ${n1(baseY - H * 1.05)} Q${n1(x + H * 0.4)} ${n1(baseY - H * 1.05)} ${n1(x + H * 0.4)} ${n1(baseY - H * 0.8)}`, 'none', { stroke: '#c9cfd4', 'stroke-width': n1(H * 0.1), 'stroke-linecap': 'round' });
  s += rect(x + H * 0.08, baseY - H * 0.62, H * 0.3, H * 0.06, chrome, { rx: H * 0.03 });
  if (running) s += path(`M${n1(x + H * 0.37)} ${n1(baseY - H * 0.76)} Q${n1(x + H * 0.39)} ${n1(baseY - H * 0.3)} ${n1(x + H * 0.36)} ${n1(baseY + H * 0.2)}`, 'none', { stroke: '#d6eef8', 'stroke-width': n1(H * 0.06), opacity: 0.85, 'stroke-linecap': 'round' }) + path(`M${n1(x + H * 0.36)} ${n1(baseY - H * 0.7)} Q${n1(x + H * 0.37)} ${n1(baseY - H * 0.3)} ${n1(x + H * 0.355)} ${n1(baseY + H * 0.2)}`, 'none', { stroke: '#fff', 'stroke-width': n1(H * 0.015), opacity: 0.9 });
  return s;
}
function basinFaucet(e) {
  let s = tileGrid(e, 0, 0, e.w, e.h * 0.62, '#e5ebed', { size: 40 }) + rect(0, e.h * 0.62, e.w, e.h * 0.38, e.lin([[0, '#f7f5f1'], [1, '#d9d4cc']], { x1: 0, y1: 0, x2: 0, y2: 1 }));
  s += ell(e.cx + e.w * 0.08, e.h * 0.78, e.w * 0.3, e.h * 0.1, '#ffffff', { stroke: '#d4d8db', 'stroke-width': n1(2 * e.s) }) + ell(e.cx + e.w * 0.08, e.h * 0.8, e.w * 0.22, e.h * 0.06, e.rad([[0, '#e7eef1'], [1, '#c9d3d8']]));
  s += faucetShape(e, e.cx - e.w * 0.22, e.h * 0.64, e.h * 0.5, true);
  s += A.droplets(e, e.cx - e.w * 0.02, e.h * 0.72, e.w * 0.2, e.h * 0.1, 10);
  return s;
}
function copperPipes(e, o) {
  const cu = e.lin([[0, '#8a4a22'], [0.3, '#e7a36b'], [0.55, '#c8773f'], [1, '#6e3718']], { x1: 0, y1: 0, x2: 0, y2: 1 }); const cuV = e.lin([[0, '#8a4a22'], [0.3, '#e7a36b'], [0.55, '#c8773f'], [1, '#6e3718']]);
  let s = rect(0, 0, e.w, e.h, e.tint('#e6e0d6')) + rect(0, e.h * 0.82, e.w, e.h * 0.18, e.tint('#cfc7bb'));
  const p = e.h * 0.05;
  s += rect(e.w * 0.08, e.h * 0.3, e.w * 0.62, p, cu) + rect(e.w * 0.66, e.h * 0.3, p, e.h * 0.52, cuV) + rect(e.w * 0.3, e.h * 0.52, e.w * 0.62, p, cu) + rect(e.w * 0.3, e.h * 0.52, p, e.h * 0.3, cuV);
  [[0.66, 0.3], [0.3, 0.52], [0.24, 0.3], [0.8, 0.52]].forEach(([fx, fy]) => { s += rect(e.w * fx - p * 0.2, e.h * fy - p * 0.2, p * 1.4, p * 1.4, e.lin([[0, '#d99a5f'], [1, '#8a4a22']], { x1: 0, y1: 0, x2: 1, y2: 1 }), { rx: p * 0.3 }); });
  // a quarter-turn valve
  s += rect(e.w * 0.46, e.h * 0.28, e.w * 0.08, p * 1.4, e.cyl('#c9a24a'), { rx: 3 * e.s }) + rect(e.w * 0.44, e.h * 0.2, e.w * 0.12, e.h * 0.035, '#c0392b', { rx: 4 * e.s }) + line(e.w * 0.5, e.h * 0.235, e.w * 0.5, e.h * 0.28, '#6a7178', 3 * e.s);
  // adjustable wrench resting on the pipe
  s += g(rect(0, -8 * e.s, e.w * 0.36, 16 * e.s, e.lin([[0, '#e1e4e7'], [1, '#7d848b']], { x1: 0, y1: 0, x2: 0, y2: 1 }), { rx: 8 * e.s }) + path(`M${n1(e.w * 0.34)} ${n1(-18 * e.s)} L${n1(e.w * 0.44)} ${n1(-18 * e.s)} L${n1(e.w * 0.44)} ${n1(-4 * e.s)} L${n1(e.w * 0.4)} ${n1(-4 * e.s)} L${n1(e.w * 0.4)} ${n1(4 * e.s)} L${n1(e.w * 0.44)} ${n1(4 * e.s)} L${n1(e.w * 0.44)} ${n1(18 * e.s)} L${n1(e.w * 0.34)} ${n1(18 * e.s)} Z`, e.lin([[0, '#d6dadd'], [1, '#6a7178']], { x1: 0, y1: 0, x2: 0, y2: 1 })), { transform: `translate(${n1(e.w * 0.14)} ${n1(e.h * 0.74)}) rotate(-18)` });
  return s;
}
function breakerPanel(e, o) {
  const k = o || {}; let s = rect(0, 0, e.w, e.h, e.tint('#dcd6cc'));
  const x = e.w * 0.24, y = e.h * 0.08, w = e.w * 0.52, h = e.h * 0.84; s += e.shadow(e.cx + 6 * e.s, y + h, w * 0.5, h * 0.03, 0.3);
  s += rect(x, y, w, h, e.lin([[0, '#eceef0'], [1, '#b9bec4']], { x1: 0, y1: 0, x2: 1, y2: 1 }), { rx: 4 * e.s }) + rect(x + w * 0.08, y + h * 0.06, w * 0.84, h * 0.88, '#3a3d42', { rx: 3 * e.s });
  const labels = (k.items && k.items.length ? k.items : ['Kitchen', 'Lights', 'Laundry', 'Bath', 'Heat', 'Outlets', 'Garage', 'Office', 'EV', 'Spare']);
  for (let i = 0; i < 12; i++) { const col = i % 2, row = Math.floor(i / 2); const bx = x + w * (col ? 0.52 : 0.14), by = y + h * (0.12 + row * 0.13); s += rect(bx, by, w * 0.34, h * 0.09, e.lin([[0, '#f5f5f3'], [1, '#c8c9c6']], { x1: 0, y1: 0, x2: 0, y2: 1 }), { rx: 2 * e.s }) + rect(bx + w * (col ? 0.02 : 0.24), by + h * 0.025, w * 0.08, h * 0.04, '#2b2d31', { rx: 1.5 * e.s }); if (labels[i]) s += A.wordmark(e, labels[i], bx + w * (col ? 0.12 : 0.02), by + h * 0.058, Math.min(h * 0.03, w * 0.045), '#3a3d42', { anchor: 'start', weight: 600, spacing: '0.02em' }); }
  // tidy cable runs down the sides
  ['#1d1d1d', '#c0392b', '#f2f2f2', '#2e7d32'].forEach((c, i) => { s += line(x + w * 0.1 + i * 3 * e.s, y + h * 0.95, x + w * 0.1 + i * 3 * e.s, e.h, c, 2 * e.s); });
  return s;
}
function outletPlate(e, x, y, w, kind) {
  let s = rect(x - w / 2, y - w * 0.8, w, w * 1.6, e.lin([[0, '#fbfbf9'], [1, '#dedbd4']], { x1: 0, y1: 0, x2: 0.5, y2: 1 }), { rx: w * 0.08 }) + e.shadow(x + w * 0.05, y + w * 0.85, w * 0.5, w * 0.06, 0.2);
  if (kind === 'switch') s += rect(x - w * 0.14, y - w * 0.36, w * 0.28, w * 0.72, '#f3f1ec', { rx: w * 0.04, stroke: '#cfcbc2', 'stroke-width': n1(1 * e.s) });
  else [-0.36, 0.36].forEach(f => { s += rect(x - w * 0.28, y + f * w - w * 0.2, w * 0.56, w * 0.4, '#f6f4ef', { rx: w * 0.12, stroke: '#d4d0c7', 'stroke-width': n1(1 * e.s) }) + rect(x - w * 0.12, y + f * w - w * 0.1, w * 0.05, w * 0.14, '#3a3a3a') + rect(x + w * 0.07, y + f * w - w * 0.1, w * 0.05, w * 0.14, '#3a3a3a'); });
  return s;
}
function evCharger(e, x, y, w) {
  let s = e.shadow(x + w * 0.1, y + w * 1.1, w * 0.5, w * 0.05, 0.3) + rect(x - w / 2, y - w * 0.7, w, w * 1.3, e.lin([[0, '#f7f7f5'], [1, '#c7c9cc']], { x1: 0, y1: 0, x2: 1, y2: 1 }), { rx: w * 0.14 });
  s += rect(x - w * 0.3, y - w * 0.45, w * 0.6, w * 0.08, '#2ecc71', { rx: w * 0.04 }) + circ(x, y + w * 0.1, w * 0.2, '#2b2d31') + circ(x, y + w * 0.1, w * 0.1, '#50555c');
  s += path(`M${n1(x)} ${n1(y + w * 0.3)} C${n1(x)} ${n1(y + w * 1.4)} ${n1(x + w * 1.6)} ${n1(y + w * 0.4)} ${n1(x + w * 1.4)} ${n1(y + w * 1.3)}`, 'none', { stroke: '#2b2d31', 'stroke-width': n1(w * 0.09), 'stroke-linecap': 'round' });
  return s;
}
function sprayBottle(e, x, baseY, H, c) {
  const col = e.tint(c || lighten(e.accent, 0.4)); const W = H * 0.36, r = W / 2; let s = e.shadow(x, baseY, W * 0.7, W * 0.1, 0.3);
  s += path(`M${n1(x - r)} ${n1(baseY - H * 0.55)} Q${n1(x - r * 1.1)} ${n1(baseY - H * 0.3)} ${n1(x - r)} ${n1(baseY - H * 0.05)} Q${n1(x - r)} ${n1(baseY)} ${n1(x - r + 4 * e.s)} ${n1(baseY)} L${n1(x + r - 4 * e.s)} ${n1(baseY)} Q${n1(x + r)} ${n1(baseY)} ${n1(x + r)} ${n1(baseY - H * 0.05)} L${n1(x + r)} ${n1(baseY - H * 0.55)} Q${n1(x + r * 0.5)} ${n1(baseY - H * 0.64)} ${n1(x + r * 0.35)} ${n1(baseY - H * 0.68)} L${n1(x - r * 0.35)} ${n1(baseY - H * 0.68)} Q${n1(x - r * 0.5)} ${n1(baseY - H * 0.64)} ${n1(x - r)} ${n1(baseY - H * 0.55)} Z`, e.cyl(col, { edge: 0.3 }), { opacity: 0.95 });
  s += rect(x - r * 0.4, baseY - H * 0.78, r * 0.8, H * 0.1, '#f4f4f2', { rx: 2 * e.s }) + path(P([[x - r * 0.5, baseY - H * 0.94], [x + r * 1.2, baseY - H * 0.94], [x + r * 1.2, baseY - H * 0.86], [x - r * 0.5, baseY - H * 0.78]]), '#f4f4f2') + path(`M${n1(x + r * 0.2)} ${n1(baseY - H * 0.86)} q${n1(-r * 0.1)} ${n1(H * 0.1)} ${n1(-r * 0.25)} ${n1(H * 0.14)}`, 'none', { stroke: '#f4f4f2', 'stroke-width': n1(4 * e.s), 'stroke-linecap': 'round' });
  s += rect(x - r * 0.8, baseY - H * 0.42, W * 0.8, H * 0.2, '#ffffff', { opacity: 0.85, rx: 3 * e.s });
  return s;
}
function clothStack(e, x, baseY, W, cols) { let s = ''; (cols || ['#5fa8d3', '#f2c14e', '#e76f51']).forEach((c, i) => { const y = baseY - i * W * 0.14; s += rect(x - W / 2 + i * 3 * e.s, y - W * 0.14, W, W * 0.14, e.lin([[0, lighten(e.tint(c), 0.15)], [1, darken(e.tint(c), 0.15)]], { x1: 0, y1: 0, x2: 0, y2: 1 }), { rx: W * 0.05 }); }); return e.shadow(x, baseY, W * 0.55, W * 0.05, 0.3) + s; }
function caddy(e, x, baseY, W) {
  let s = e.shadow(x, baseY, W * 0.6, W * 0.06, 0.3);
  s += sprayBottle(e, x - W * 0.26, baseY - W * 0.2, W * 0.62, '#7fc8e8') + sprayBottle(e, x + W * 0.02, baseY - W * 0.2, W * 0.56, '#f4a261');
  s += rect(x + W * 0.18, baseY - W * 0.62, W * 0.12, W * 0.4, e.cyl('#f2c14e'), { rx: 4 * e.s }) + rect(x + W * 0.16, baseY - W * 0.66, W * 0.16, W * 0.06, '#5a8f3e', { rx: 3 * e.s });
  s += path(P([[x - W / 2, baseY - W * 0.3], [x + W / 2, baseY - W * 0.3], [x + W * 0.46, baseY], [x - W * 0.46, baseY]]), e.lin([[0, e.tint(lighten(e.accent, 0.1))], [1, e.tint(darken(e.accent, 0.2))]], { x1: 0, y1: 0, x2: 0, y2: 1 }));
  s += path(`M${n1(x - W * 0.08)} ${n1(baseY - W * 0.3)} L${n1(x - W * 0.08)} ${n1(baseY - W * 0.72)} Q${n1(x)} ${n1(baseY - W * 0.8)} ${n1(x + W * 0.08)} ${n1(baseY - W * 0.72)} L${n1(x + W * 0.08)} ${n1(baseY - W * 0.3)}`, 'none', { stroke: e.tint(darken(e.accent, 0.1)), 'stroke-width': n1(5 * e.s) });
  s += clothStack(e, x + W * 0.72, baseY, W * 0.4, ['#5fa8d3', '#e9c46a']);
  return s;
}
function vacuum(e, x, baseY, H, c) {
  const col = c || e.accent; let s = e.shadow(x, baseY, H * 0.3, H * 0.04, 0.3);
  s += rect(x - H * 0.2, baseY - H * 0.08, H * 0.4, H * 0.08, e.lin([[0, '#4a4d52'], [1, '#1d1e20']], { x1: 0, y1: 0, x2: 0, y2: 1 }), { rx: H * 0.03 }) + circ(x - H * 0.15, baseY - 3 * e.s, H * 0.03, '#222') + circ(x + H * 0.15, baseY - 3 * e.s, H * 0.03, '#222');
  s += rect(x - H * 0.09, baseY - H * 0.62, H * 0.18, H * 0.54, e.cyl(col), { rx: H * 0.06 }) + rect(x - H * 0.06, baseY - H * 0.5, H * 0.12, H * 0.22, '#d9eef7', { opacity: 0.6, rx: H * 0.03 });
  s += line(x, baseY - H * 0.62, x, baseY - H, '#9aa0a6', 3 * e.s) + rect(x - H * 0.07, baseY - H * 1.03, H * 0.14, H * 0.05, '#2d2a27', { rx: H * 0.02 });
  return s;
}

module.exports = {
  sofa, plantPot, floorLamp, artFrame, pendant, cabinetRun, tileGrid, table, stool, mirrorRound, sparkle, bookRow,
  livingRoom, kitchen, bathroom, treatmentRoom, menuBoard, espressoMachine, cafeRoom, barRoom, glassware, diningRoom, classroom, office, studioRoom, reformer, yogaMat, salon, salonChair, framing, sawhorse,
  drill, paintCan, rollerTray, brush, cuttingIn, faucetShape, basinFaucet, copperPipes, breakerPanel, outletPlate, evCharger, sprayBottle, clothStack, caddy, vacuum,
};
