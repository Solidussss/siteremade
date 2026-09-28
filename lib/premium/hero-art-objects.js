'use strict';
// HERO ART -- objects: garments, food and drink, studio tools, fitness and care
// equipment, desk and paperwork, vehicles, and the everyday things unusual
// businesses are about. Built on the kit in ./hero-art.
const A = require('./hero-art');
const { mix, lighten, darken, rng, hashStr, inkOn } = A;
const { rect, circ, ell, path, line, g, P, n1 } = A._svg;

// ---- garments ----------------------------------------------------------------------------------------------------
function fabricFill(e, c) { return e.lin([[0, lighten(c, 0.14)], [0.5, c], [1, darken(c, 0.2)]], { x1: 0, y1: 0, x2: 0.8, y2: 1 }); }
function hanger(e, x, y, w) { return path(`M${n1(x - w / 2)} ${n1(y + w * 0.2)} L${n1(x)} ${n1(y)} L${n1(x + w / 2)} ${n1(y + w * 0.2)} Z`, 'none', { stroke: '#b98a55', 'stroke-width': n1(2.4 * e.s), 'stroke-linejoin': 'round' }) + path(`M${n1(x)} ${n1(y)} L${n1(x)} ${n1(y - w * 0.1)} Q${n1(x)} ${n1(y - w * 0.2)} ${n1(x + w * 0.08)} ${n1(y - w * 0.18)}`, 'none', { stroke: '#9aa0a6', 'stroke-width': n1(1.6 * e.s) }); }
function hoodie(e, x, y, W, c) {
  const col = e.tint(c || '#3d4b5c'); const u = W / 100; let s = '';
  const body = `M${n1(x - 30 * u)} ${n1(y + 8 * u)} L${n1(x - 48 * u)} ${n1(y + 22 * u)} L${n1(x - 56 * u)} ${n1(y + 84 * u)} L${n1(x - 44 * u)} ${n1(y + 86 * u)} L${n1(x - 36 * u)} ${n1(y + 44 * u)} L${n1(x - 34 * u)} ${n1(y + 108 * u)} L${n1(x + 34 * u)} ${n1(y + 108 * u)} L${n1(x + 36 * u)} ${n1(y + 44 * u)} L${n1(x + 44 * u)} ${n1(y + 86 * u)} L${n1(x + 56 * u)} ${n1(y + 84 * u)} L${n1(x + 48 * u)} ${n1(y + 22 * u)} L${n1(x + 30 * u)} ${n1(y + 8 * u)} Z`;
  s += path(body, fabricFill(e, col));
  s += path(`M${n1(x - 20 * u)} ${n1(y + 8 * u)} Q${n1(x - 24 * u)} ${n1(y - 18 * u)} ${n1(x)} ${n1(y - 20 * u)} Q${n1(x + 24 * u)} ${n1(y - 18 * u)} ${n1(x + 20 * u)} ${n1(y + 8 * u)} Q${n1(x)} ${n1(y + 18 * u)} ${n1(x - 20 * u)} ${n1(y + 8 * u)} Z`, fabricFill(e, darken(col, 0.08)));
  s += path(`M${n1(x - 12 * u)} ${n1(y + 6 * u)} Q${n1(x)} ${n1(y + 14 * u)} ${n1(x + 12 * u)} ${n1(y + 6 * u)}`, 'none', { stroke: darken(col, 0.35), 'stroke-width': n1(1.4 * u) });
  s += line(x - 5 * u, y + 10 * u, x - 6 * u, y + 34 * u, '#f3efe8', 1.2 * u) + line(x + 5 * u, y + 10 * u, x + 6 * u, y + 34 * u, '#f3efe8', 1.2 * u);
  s += path(`M${n1(x - 22 * u)} ${n1(y + 64 * u)} L${n1(x + 22 * u)} ${n1(y + 64 * u)} L${n1(x + 26 * u)} ${n1(y + 84 * u)} L${n1(x - 26 * u)} ${n1(y + 84 * u)} Z`, darken(col, 0.1), { opacity: 0.8 });
  s += rect(x - 34 * u, y + 100 * u, 68 * u, 8 * u, darken(col, 0.15)) + rect(x - 56 * u, y + 80 * u, 12 * u, 6 * u, darken(col, 0.15)) + rect(x + 44 * u, y + 80 * u, 12 * u, 6 * u, darken(col, 0.15));
  for (let i = 0; i < 10; i++) s += line(x - 33 * u + i * 7.3 * u, y + 101 * u, x - 33 * u + i * 7.3 * u, y + 107 * u, darken(col, 0.3), 0.6 * u, { opacity: 0.6 });
  return s;
}
function tee(e, x, y, W, c) {
  const col = e.tint(c || '#e9e4da'); const u = W / 100;
  return path(`M${n1(x - 16 * u)} ${n1(y)} Q${n1(x)} ${n1(y + 10 * u)} ${n1(x + 16 * u)} ${n1(y)} L${n1(x + 44 * u)} ${n1(y + 10 * u)} L${n1(x + 56 * u)} ${n1(y + 38 * u)} L${n1(x + 38 * u)} ${n1(y + 44 * u)} L${n1(x + 36 * u)} ${n1(y + 102 * u)} L${n1(x - 36 * u)} ${n1(y + 102 * u)} L${n1(x - 38 * u)} ${n1(y + 44 * u)} L${n1(x - 56 * u)} ${n1(y + 38 * u)} L${n1(x - 44 * u)} ${n1(y + 10 * u)} Z`, fabricFill(e, col)) +
    path(`M${n1(x - 16 * u)} ${n1(y)} Q${n1(x)} ${n1(y + 10 * u)} ${n1(x + 16 * u)} ${n1(y)}`, 'none', { stroke: darken(col, 0.2), 'stroke-width': n1(2.5 * u) }) + line(x - 38 * u, y + 44 * u, x - 36 * u, y + 30 * u, darken(col, 0.12), 0.8 * u);
}
function jeansStack(e, x, baseY, W) {
  const cols = ['#2e4a6e', '#3d5f8a', '#23374f']; let s = e.shadow(x, baseY, W * 0.55, W * 0.05, 0.3);
  cols.forEach((c, i) => { const y = baseY - (i + 1) * W * 0.16; const col = e.tint(c); s += rect(x - W / 2 + (i % 2) * 4 * e.s, y, W, W * 0.16, fabricFill(e, col), { rx: W * 0.04 }); s += line(x - W / 2 + 6 * e.s + (i % 2) * 4 * e.s, y + W * 0.03, x + W / 2 - 6 * e.s, y + W * 0.03, '#d9a441', 1 * e.s, { 'stroke-dasharray': `${n1(3 * e.s)} ${n1(2 * e.s)}`, opacity: 0.8 }); s += rect(x + W * 0.3, y + W * 0.05, W * 0.1, W * 0.06, '#b98a55', { rx: 1 * e.s }); });
  return s;
}
function sneaker(e, x, baseY, L, c) {
  const col = e.tint(c || '#f2f0ec'); const u = L / 100; let s = e.shadow(x, baseY, L * 0.5, L * 0.05, 0.3);
  s += path(`M${n1(x - 48 * u)} ${n1(baseY - 8 * u)} Q${n1(x - 50 * u)} ${n1(baseY)} ${n1(x - 40 * u)} ${n1(baseY)} L${n1(x + 46 * u)} ${n1(baseY)} Q${n1(x + 52 * u)} ${n1(baseY - 2 * u)} ${n1(x + 50 * u)} ${n1(baseY - 10 * u)} Z`, '#ffffff', { stroke: '#d8d4cc', 'stroke-width': n1(1 * u) });
  s += path(`M${n1(x - 46 * u)} ${n1(baseY - 8 * u)} Q${n1(x - 48 * u)} ${n1(baseY - 30 * u)} ${n1(x - 34 * u)} ${n1(baseY - 36 * u)} L${n1(x - 14 * u)} ${n1(baseY - 38 * u)} Q${n1(x + 6 * u)} ${n1(baseY - 26 * u)} ${n1(x + 26 * u)} ${n1(baseY - 22 * u)} Q${n1(x + 48 * u)} ${n1(baseY - 20 * u)} ${n1(x + 50 * u)} ${n1(baseY - 10 * u)} Z`, fabricFill(e, col));
  s += path(`M${n1(x - 20 * u)} ${n1(baseY - 30 * u)} Q${n1(x + 6 * u)} ${n1(baseY - 8 * u)} ${n1(x + 36 * u)} ${n1(baseY - 14 * u)}`, 'none', { stroke: e.accent, 'stroke-width': n1(5 * u), 'stroke-linecap': 'round' });
  for (let i = 0; i < 4; i++) s += line(x - 12 * u + i * 7 * u, baseY - 34 * u + i * 3 * u, x - 4 * u + i * 7 * u, baseY - 30 * u + i * 3 * u, darken(col, 0.3), 1.4 * u);
  s += rect(x - 46 * u, baseY - 9 * u, 96 * u, 3 * u, darken(col, 0.12));
  return s;
}
function cap(e, x, y, W, c) {
  const col = e.tint(c || '#2d3a2e'); const u = W / 100;
  return path(`M${n1(x - 40 * u)} ${n1(y + 20 * u)} Q${n1(x - 38 * u)} ${n1(y - 26 * u)} ${n1(x)} ${n1(y - 28 * u)} Q${n1(x + 38 * u)} ${n1(y - 26 * u)} ${n1(x + 40 * u)} ${n1(y + 20 * u)} Z`, fabricFill(e, col)) + path(`M${n1(x + 30 * u)} ${n1(y + 16 * u)} Q${n1(x + 70 * u)} ${n1(y + 18 * u)} ${n1(x + 78 * u)} ${n1(y + 30 * u)} Q${n1(x + 50 * u)} ${n1(y + 30 * u)} ${n1(x + 26 * u)} ${n1(y + 22 * u)} Z`, darken(col, 0.15)) + circ(x, y - 27 * u, 3 * u, darken(col, 0.2)) + line(x, y - 26 * u, x - 4 * u, y + 18 * u, darken(col, 0.25), 0.8 * u) + line(x, y - 26 * u, x + 18 * u, y + 18 * u, darken(col, 0.25), 0.8 * u);
}
function dressForm(e, x, baseY, H, c, o) {
  const k = o || {}; const col = e.tint(c || '#f5f0e8'); let s = e.shadow(x, baseY, H * 0.2, H * 0.03, 0.3);
  s += line(x, baseY, x, baseY - H * 0.36, '#6b4a33', 3 * e.s) + path(`M${n1(x - H * 0.1)} ${n1(baseY)} L${n1(x)} ${n1(baseY - H * 0.06)} L${n1(x + H * 0.1)} ${n1(baseY)}`, 'none', { stroke: '#6b4a33', 'stroke-width': n1(3 * e.s) });
  // bodice + skirt of a gown
  s += path(`M${n1(x - H * 0.1)} ${n1(baseY - H * 0.92)} Q${n1(x)} ${n1(baseY - H * 0.96)} ${n1(x + H * 0.1)} ${n1(baseY - H * 0.92)} L${n1(x + H * 0.08)} ${n1(baseY - H * 0.68)} Q${n1(x + H * 0.3)} ${n1(baseY - H * 0.34)} ${n1(x + H * 0.36)} ${n1(baseY - H * 0.1)} L${n1(x - H * 0.36)} ${n1(baseY - H * 0.1)} Q${n1(x - H * 0.3)} ${n1(baseY - H * 0.34)} ${n1(x - H * 0.08)} ${n1(baseY - H * 0.68)} Z`, e.lin([[0, lighten(col, 0.3)], [0.5, col], [1, darken(col, 0.12)]]));
  for (let i = -3; i <= 3; i++) s += path(`M${n1(x + i * H * 0.02)} ${n1(baseY - H * 0.66)} Q${n1(x + i * H * 0.06)} ${n1(baseY - H * 0.4)} ${n1(x + i * H * 0.1)} ${n1(baseY - H * 0.11)}`, 'none', { stroke: darken(col, 0.1), 'stroke-width': n1(1 * e.s), opacity: 0.6 });
  s += rect(x - H * 0.08, baseY - H * 0.72, H * 0.16, H * 0.03, k.sash || e.tint('#d8c3a0'), { rx: 2 * e.s });
  if (k.lace !== false) { const R = rng(hashStr(`lace${x}`)); for (let i = 0; i < 26; i++) s += circ(x + (R() - 0.5) * H * 0.18, baseY - H * (0.72 + R() * 0.2), (0.8 + R()) * e.s, '#fff', { opacity: 0.8 }); }
  s += ell(x, baseY - H * 0.97, H * 0.035, H * 0.02, '#6b4a33');
  return s;
}
function ring(e, x, y, r, stone) {
  const gold = e.lin([[0, '#8a6a22'], [0.3, '#f5d98a'], [0.6, '#c99a36'], [1, '#7a5a1a']]);
  return e.shadow(x, y + r * 1.1, r * 1.1, r * 0.2, 0.3) + ell(x, y, r, r * 0.8, 'none', { stroke: gold, 'stroke-width': n1(r * 0.2) }) + path(P([[x - r * 0.3, y - r * 0.8], [x + r * 0.3, y - r * 0.8], [x + r * 0.18, y - r * 1.25], [x - r * 0.18, y - r * 1.25]]), e.lin([[0, '#ffffff'], [0.5, stone || '#cfe8f7'], [1, '#8fb9d6']], { x1: 0, y1: 0, x2: 1, y2: 1 })) + A._svg.line(x - r * 0.18, y - r * 1.25, x + r * 0.1, y - r * 0.8, '#fff', 1 * e.s, { opacity: 0.8 });
}
function weave(e, c, o) {
  const k = o || {}; const col = e.tint(c || '#7c8a9a'); const st = (k.knit ? 24 : 18) * e.s; let s = rect(0, 0, e.w, e.h, darken(col, 0.25));
  // one shared gradient per stitch type (a gradient per stitch made a fabric swatch over half a megabyte)
  const lc = e.lin([[0, lighten(col, 0.25)], [1, darken(col, 0.12)]], { x1: 0, y1: 0, x2: 1, y2: 1 }); const wc = e.lin([[0, lighten(col, 0.2)], [1, darken(col, 0.1)]], { x1: 0, y1: 0, x2: 0, y2: 1 });
  for (let y = 0; y < e.h + st; y += st) for (let x = 0; x < e.w + st; x += st) {
    if (k.knit) { s += ell(x + st * 0.3, y + st * 0.5, st * 0.2, st * 0.42, lc, { transform: `rotate(-28 ${n1(x + st * 0.3)} ${n1(y + st * 0.5)})` }) + ell(x + st * 0.7, y + st * 0.5, st * 0.2, st * 0.42, lc, { transform: `rotate(28 ${n1(x + st * 0.7)} ${n1(y + st * 0.5)})` }); }
    else s += rect(x + ((y / st) % 2 ? st / 2 : 0), y, st * 0.9, st * 0.45, wc, { rx: st * 0.2 });
  }
  if (k.seam) s += line(0, e.h * 0.62, e.w, e.h * 0.55, darken(col, 0.4), 2 * e.s) + line(0, e.h * 0.64, e.w, e.h * 0.57, lighten(k.thread || '#d9a441', 0.1), 1.6 * e.s, { 'stroke-dasharray': `${n1(6 * e.s)} ${n1(4 * e.s)}` });
  return s;
}
function clothingRail(e, o) {
  const k = o || {}; const cols = k.colours || ['#2d3a2e', '#c65d3b', '#e8e2d6', '#3d4b5c', '#b89a6a'];
  let s = A.studio(e, { horizon: 0.84 }) + line(e.w * 0.08, e.h * 0.14, e.w * 0.92, e.h * 0.14, '#9aa0a6', 4 * e.s) + line(e.w * 0.1, e.h * 0.14, e.w * 0.1, e.h * 0.84, '#9aa0a6', 4 * e.s) + line(e.w * 0.9, e.h * 0.14, e.w * 0.9, e.h * 0.84, '#9aa0a6', 4 * e.s);
  const n = 5; for (let i = 0; i < n; i++) { const x = e.w * (0.2 + i * 0.15); s += hanger(e, x, e.h * 0.16, e.w * 0.12); s += (k.kind === 'tee' || i % 2) ? tee(e, x, e.h * 0.19, e.w * 0.14, cols[i % cols.length]) : hoodie(e, x, e.h * 0.21, e.w * 0.13, cols[i % cols.length]); }
  return s;
}
// ---- food & drink ---------------------------------------------------------------------------------------------------
function latteTop(e, x, y, r, o) {
  const k = o || {}; let s = e.shadow(x + r * 0.1, y + r * 0.2, r * 1.3, r * 1.2, 0.3) + ell(x, y + r * 0.9, r * 1.35, r * 0.4, e.tint('#f1ece4')) + circ(x, y, r, e.tint(k.cup || '#f4f1ec')) + circ(x, y, r * 0.82, '#b07a4f');
  s += circ(x, y, r * 0.7, '#c8966a') + path(`M${n1(x)} ${n1(y + r * 0.55)} Q${n1(x - r * 0.5)} ${n1(y)} ${n1(x)} ${n1(y - r * 0.5)} Q${n1(x + r * 0.5)} ${n1(y)} ${n1(x)} ${n1(y + r * 0.55)} Z`, '#f6ecdc');
  for (let i = 0; i < 5; i++) s += path(`M${n1(x - r * (0.4 - i * 0.04))} ${n1(y - r * (0.35 - i * 0.16))} Q${n1(x)} ${n1(y - r * (0.1 - i * 0.16))} ${n1(x + r * (0.4 - i * 0.04))} ${n1(y - r * (0.35 - i * 0.16))}`, 'none', { stroke: '#c8966a', 'stroke-width': n1(r * 0.05) });
  s += path(`M${n1(x + r * 0.95)} ${n1(y - r * 0.2)} Q${n1(x + r * 1.4)} ${n1(y - r * 0.2)} ${n1(x + r * 1.4)} ${n1(y + r * 0.1)} Q${n1(x + r * 1.4)} ${n1(y + r * 0.35)} ${n1(x + r * 0.95)} ${n1(y + r * 0.3)}`, 'none', { stroke: e.tint(k.cup || '#f4f1ec'), 'stroke-width': n1(r * 0.14) });
  return s;
}
function pourOver(e, x, baseY, H) {
  let s = e.shadow(x, baseY, H * 0.35, H * 0.04, 0.3);
  // glass carafe
  s += path(`M${n1(x - H * 0.16)} ${n1(baseY - H * 0.4)} L${n1(x + H * 0.16)} ${n1(baseY - H * 0.4)} Q${n1(x + H * 0.28)} ${n1(baseY - H * 0.2)} ${n1(x + H * 0.24)} ${n1(baseY - H * 0.04)} Q${n1(x + H * 0.22)} ${n1(baseY)} ${n1(x + H * 0.16)} ${n1(baseY)} L${n1(x - H * 0.16)} ${n1(baseY)} Q${n1(x - H * 0.22)} ${n1(baseY)} ${n1(x - H * 0.24)} ${n1(baseY - H * 0.04)} Q${n1(x - H * 0.28)} ${n1(baseY - H * 0.2)} ${n1(x - H * 0.16)} ${n1(baseY - H * 0.4)} Z`, '#e7f1f4', { opacity: 0.45, stroke: '#c7d8de', 'stroke-width': n1(1.2 * e.s) });
  s += path(`M${n1(x - H * 0.25)} ${n1(baseY - H * 0.14)} Q${n1(x)} ${n1(baseY - H * 0.16)} ${n1(x + H * 0.25)} ${n1(baseY - H * 0.14)} L${n1(x + H * 0.22)} ${n1(baseY - H * 0.02)} L${n1(x - H * 0.22)} ${n1(baseY - H * 0.02)} Z`, '#4a2c18', { opacity: 0.9 });
  // ceramic dripper with the coffee bed blooming
  s += path(P([[x - H * 0.26, baseY - H * 0.68], [x + H * 0.26, baseY - H * 0.68], [x + H * 0.1, baseY - H * 0.42], [x - H * 0.1, baseY - H * 0.42]]), e.cyl(e.tint('#f2eee8'))) + ell(x, baseY - H * 0.68, H * 0.26, H * 0.04, '#e3ddd3') + ell(x, baseY - H * 0.675, H * 0.22, H * 0.03, '#6b4428');
  s += A.bubbles(e, x - H * 0.18, baseY - H * 0.7, H * 0.36, H * 0.03, 8, 0.7);
  // gooseneck kettle pouring
  const kx = x + H * 0.5, ky = baseY - H * 0.9;
  s += path(`M${n1(kx - H * 0.14)} ${n1(ky)} L${n1(kx + H * 0.14)} ${n1(ky)} L${n1(kx + H * 0.18)} ${n1(ky + H * 0.24)} L${n1(kx - H * 0.18)} ${n1(ky + H * 0.24)} Z`, e.lin([[0, '#5a5d62'], [0.3, '#b9bdc2'], [1, '#2d2f33']])) + path(`M${n1(kx - H * 0.16)} ${n1(ky + H * 0.2)} Q${n1(kx - H * 0.36)} ${n1(ky + H * 0.18)} ${n1(kx - H * 0.4)} ${n1(ky - H * 0.02)}`, 'none', { stroke: '#8b8f95', 'stroke-width': n1(H * 0.03), 'stroke-linecap': 'round' });
  s += path(`M${n1(kx - H * 0.4)} ${n1(ky - H * 0.01)} Q${n1(kx - H * 0.46)} ${n1(ky + H * 0.12)} ${n1(x + H * 0.02)} ${n1(baseY - H * 0.68)}`, 'none', { stroke: '#d2a679', 'stroke-width': n1(H * 0.012), opacity: 0.85 });
  s += path(`M${n1(kx + H * 0.14)} ${n1(ky + H * 0.04)} Q${n1(kx + H * 0.3)} ${n1(ky + H * 0.1)} ${n1(kx + H * 0.16)} ${n1(ky + H * 0.2)}`, 'none', { stroke: '#2d2f33', 'stroke-width': n1(H * 0.03) });
  for (let i = 0; i < 3; i++) s += path(`M${n1(x - H * 0.1 + i * H * 0.1)} ${n1(baseY - H * 0.74)} q${n1(-H * 0.05)} ${n1(-H * 0.08)} 0 ${n1(-H * 0.16)} q${n1(H * 0.05)} ${n1(-H * 0.08)} 0 ${n1(-H * 0.16)}`, 'none', { stroke: '#ffffff', 'stroke-width': n1(2 * e.s), opacity: 0.35 });
  return s;
}
function roasterDrum(e, x, baseY, W) {
  let s = e.shadow(x, baseY, W * 0.55, W * 0.05, 0.35); const steel = e.lin([[0, '#3a3c40'], [0.3, '#8c9096'], [1, '#232427']], { x1: 0, y1: 0, x2: 0, y2: 1 });
  s += rect(x - W * 0.38, baseY - W * 0.34, W * 0.12, W * 0.34, '#2a2b2e') + rect(x + W * 0.1, baseY - W * 0.34, W * 0.12, W * 0.34, '#2a2b2e');
  s += rect(x - W * 0.45, baseY - W * 0.7, W * 0.7, W * 0.38, steel, { rx: W * 0.08 }) + circ(x - W * 0.45, baseY - W * 0.51, W * 0.19, e.lin([[0, '#b9914f'], [1, '#6a4a1f']], { x1: 0, y1: 0, x2: 1, y2: 1 })) + circ(x - W * 0.45, baseY - W * 0.51, W * 0.11, '#20160f');
  s += path(P([[x - W * 0.05, baseY - W * 0.7], [x + W * 0.15, baseY - W * 0.7], [x + W * 0.22, baseY - W * 1.05], [x - W * 0.12, baseY - W * 1.05]]), steel);
  // cooling tray with beans
  s += ell(x + W * 0.32, baseY - W * 0.18, W * 0.28, W * 0.08, '#3a3c40') + ell(x + W * 0.32, baseY - W * 0.2, W * 0.24, W * 0.06, '#5a3a22') + A.beanPile(e, x + W * 0.32, baseY - W * 0.21, W * 0.18, '#4b2e1c');
  s += path(`M${n1(x - W * 0.48)} ${n1(baseY - W * 0.4)} Q${n1(x - W * 0.2)} ${n1(baseY - W * 0.25)} ${n1(x + W * 0.18)} ${n1(baseY - W * 0.22)}`, 'none', { stroke: '#5a3a22', 'stroke-width': n1(W * 0.03), 'stroke-dasharray': `${n1(4 * e.s)} ${n1(3 * e.s)}` });
  return s;
}
function croissant(e, x, y, L) {
  const c = '#d99a45'; let s = e.shadow(x, y + L * 0.2, L * 0.5, L * 0.08, 0.3);
  const segs = [[-0.42, 0.08, 0.14, 25], [-0.24, -0.04, 0.2, 12], [0, -0.08, 0.24, 0], [0.24, -0.04, 0.2, -12], [0.42, 0.08, 0.14, -25]];
  segs.forEach(([dx, dy, r, a]) => { s += ell(x + dx * L, y + dy * L, r * L * 0.62, r * L, e.rad([[0, '#f5c77a'], [0.6, c], [1, darken(c, 0.35)]], { cx: 0.4, cy: 0.3 }), { transform: `rotate(${a} ${n1(x + dx * L)} ${n1(y + dy * L)})` }); });
  return s;
}
function loaf(e, x, y, L, kind) {
  const c = '#c98a44'; let s = e.shadow(x, y + L * 0.3, L * 0.55, L * 0.06, 0.3);
  if (kind === 'baguette') return s + rect(x - L * 0.6, y - L * 0.1, L * 1.2, L * 0.2, e.lin([[0, '#e8b36a'], [1, darken(c, 0.25)]], { x1: 0, y1: 0, x2: 0, y2: 1 }), { rx: L * 0.1, transform: `rotate(-12 ${n1(x)} ${n1(y)})` }) + [-0.35, -0.12, 0.11, 0.34].map(f => path(`M${n1(x + f * L - L * 0.06)} ${n1(y - L * 0.05 - f * L * 0.2)} q${n1(L * 0.06)} ${n1(-L * 0.05)} ${n1(L * 0.13)} ${n1(-L * 0.02)}`, 'none', { stroke: '#f3d9a6', 'stroke-width': n1(L * 0.03), 'stroke-linecap': 'round' })).join('');
  s += ell(x, y, L * 0.5, L * 0.3, e.rad([[0, '#eab874'], [0.6, c], [1, darken(c, 0.4)]], { cx: 0.4, cy: 0.3 }));
  s += path(`M${n1(x - L * 0.3)} ${n1(y - L * 0.02)} Q${n1(x)} ${n1(y - L * 0.22)} ${n1(x + L * 0.3)} ${n1(y - L * 0.02)}`, 'none', { stroke: '#f6e3bd', 'stroke-width': n1(L * 0.04), 'stroke-linecap': 'round' });
  const R = rng(hashStr(`fl${x}`)); for (let i = 0; i < 20; i++) s += circ(x + (R() - 0.5) * L * 0.8, y - R() * L * 0.2, (0.6 + R()) * e.s, '#fbf6ea', { opacity: 0.7 });
  return s;
}
function cake(e, x, baseY, W, o) {
  const k = o || {}; const icing = e.tint(k.icing || '#f6ede3'); let s = e.shadow(x, baseY, W * 0.6, W * 0.05, 0.3) + ell(x, baseY, W * 0.62, W * 0.1, '#e9e4dc');
  [[0.5, 0.28], [0.36, 0.24], [0.24, 0.2]].forEach(([r, h], i) => { const y = baseY - W * (0.02 + [0, 0.28, 0.52][i]); s += rect(x - W * r, y - W * h, W * r * 2, W * h, e.cyl(icing, { edge: 0.18, hi: 0.2 })) + ell(x, y - W * h, W * r, W * 0.05, lighten(icing, 0.3)); s += path(`M${n1(x - W * r)} ${n1(y - W * h)} ${Array.from({ length: 8 }, (_, q) => `Q${n1(x - W * r + (q + 0.5) * W * r * 2 / 8)} ${n1(y - W * h + W * 0.05)} ${n1(x - W * r + (q + 1) * W * r * 2 / 8)} ${n1(y - W * h)}`).join(' ')}`, 'none', { stroke: k.drip || e.tint('#b56576'), 'stroke-width': n1(3 * e.s) }); });
  s += A.flavourPiece(e, k.fruit || 'strawberry', x, baseY - W * 0.82, W * 0.08);
  return s;
}
// a plate seen from above at a slight angle; dish: pasta pizza salad steak sushi ramen burger tacos eggs
function plate(e, x, y, r, dish) {
  const d = String(dish || 'generic'); let s = e.shadow(x + r * 0.08, y + r * 0.2, r * 1.1, r * 0.55, 0.35) + ell(x, y, r, r * 0.62, e.lin([[0, '#fbfaf7'], [1, '#d9d4cc']], { x1: 0, y1: 0, x2: 0, y2: 1 })) + ell(x, y, r * 0.72, r * 0.44, '#f4f1ec', { stroke: '#e3ded5', 'stroke-width': n1(1 * e.s) });
  const R = rng(hashStr(`dish${d}${x}`));
  if (d === 'ramen') s = e.shadow(x + r * 0.08, y + r * 0.3, r * 1.1, r * 0.5, 0.35) + path(`M${n1(x - r)} ${n1(y)} Q${n1(x - r)} ${n1(y + r * 0.9)} ${n1(x)} ${n1(y + r * 0.9)} Q${n1(x + r)} ${n1(y + r * 0.9)} ${n1(x + r)} ${n1(y)} Z`, e.cyl(e.tint('#2d2a27'))) + ell(x, y, r, r * 0.4, '#1f1d1b') + ell(x, y + 2, r * 0.92, r * 0.34, '#d9a15b') + [0, 1, 2, 3, 4, 5].map(i => path(`M${n1(x - r * 0.6)} ${n1(y - r * 0.05 + i * r * 0.05)} Q${n1(x)} ${n1(y + r * 0.15 - i * r * 0.03)} ${n1(x + r * 0.5)} ${n1(y - r * 0.02 + i * r * 0.04)}`, 'none', { stroke: '#f3dc9a', 'stroke-width': n1(2.2 * e.s) })).join('') + halfEgg(e, x + r * 0.35, y - r * 0.06, r * 0.18) + ell(x - r * 0.4, y - r * 0.12, r * 0.18, r * 0.08, '#4a7a3a') + line(x + r * 0.2, y - r * 0.6, x + r * 1.1, y - r * 0.9, '#b98a55', 3 * e.s) + line(x + r * 0.28, y - r * 0.56, x + r * 1.16, y - r * 0.8, '#b98a55', 3 * e.s);
  else if (d === 'pasta') { for (let i = 0; i < 26; i++) { const a = R() * Math.PI * 2, rr = R() * r * 0.45; s += path(`M${n1(x + Math.cos(a) * rr)} ${n1(y + Math.sin(a) * rr * 0.6)} q${n1((R() - 0.5) * r * 0.5)} ${n1((R() - 0.5) * r * 0.2)} ${n1((R() - 0.5) * r * 0.6)} ${n1((R() - 0.5) * r * 0.3)}`, 'none', { stroke: '#efcf7e', 'stroke-width': n1(2.6 * e.s), 'stroke-linecap': 'round' }); } s += ell(x, y - r * 0.02, r * 0.28, r * 0.12, '#c0392b', { opacity: 0.85 }) + A.leaf(e, x + r * 0.1, y - r * 0.1, r * 0.2, -30, '#4f8a3b') + A.leaf(e, x - r * 0.05, y - r * 0.12, r * 0.16, 200, '#4f8a3b'); }
  else if (d === 'pizza') { s += ell(x, y, r * 0.78, r * 0.48, '#d9924a') + ell(x, y, r * 0.66, r * 0.4, '#c8412c') + ell(x, y, r * 0.62, r * 0.37, '#f2d38a', { opacity: 0.85 }); for (let i = 0; i < 7; i++) { const a = i / 7 * Math.PI * 2; s += ell(x + Math.cos(a) * r * 0.36, y + Math.sin(a) * r * 0.22, r * 0.09, r * 0.055, '#b33a2a'); } for (let i = 0; i < 5; i++) s += A.leaf(e, x + (R() - 0.5) * r * 0.8, y + (R() - 0.5) * r * 0.4, r * 0.12, R() * 360, '#3f7a34'); }
  else if (d === 'sushi') { for (let i = 0; i < 6; i++) { const px = x - r * 0.45 + (i % 3) * r * 0.45, py = y - r * 0.12 + Math.floor(i / 3) * r * 0.26; s += ell(px, py + r * 0.04, r * 0.18, r * 0.09, '#faf7f0') + ell(px, py, r * 0.18, r * 0.1, i % 2 ? '#f08a5d' : '#e55c5c') + line(px - r * 0.12, py - r * 0.02, px + r * 0.12, py + r * 0.02, '#fff', 1.2 * e.s, { opacity: 0.6 }); } }
  else if (d === 'steak') { s += ell(x - r * 0.1, y, r * 0.42, r * 0.24, e.rad([[0, '#8a3b22'], [1, '#4a1f12']], { cx: 0.4, cy: 0.3 })) + [0, 1, 2].map(i => line(x - r * 0.4 + i * r * 0.22, y - r * 0.12, x - r * 0.26 + i * r * 0.22, y + r * 0.12, '#2a120a', 3 * e.s, { opacity: 0.7 })).join('') + ell(x + r * 0.42, y + r * 0.05, r * 0.18, r * 0.1, '#6fa34a') + ell(x + r * 0.38, y - r * 0.12, r * 0.12, r * 0.07, '#e8c16a'); }
  else if (d === 'salad') { for (let i = 0; i < 18; i++) s += A.leaf(e, x + (R() - 0.5) * r * 0.9, y + (R() - 0.5) * r * 0.5, r * 0.24, R() * 360, ['#6aa84f', '#8cc05a', '#4f8a3b'][i % 3], { width: 0.5 }); for (let i = 0; i < 5; i++) s += circ(x + (R() - 0.5) * r * 0.7, y + (R() - 0.5) * r * 0.4, r * 0.06, '#d9442f'); }
  else if (d === 'burger') { s = e.shadow(x, y + r * 0.3, r * 0.9, r * 0.3, 0.35) + ell(x, y + r * 0.26, r * 0.9, r * 0.3, '#eae6df'); const by = y + r * 0.2; s += ell(x, by, r * 0.55, r * 0.14, '#c98a44') + rect(x - r * 0.58, by - r * 0.2, r * 1.16, r * 0.12, '#4a2616', { rx: r * 0.06 }) + path(`M${n1(x - r * 0.62)} ${n1(by - r * 0.2)} q${n1(r * 0.3)} ${n1(r * 0.1)} ${n1(r * 0.62)} 0 q${n1(r * 0.3)} ${n1(r * 0.1)} ${n1(r * 0.62)} 0`, 'none', { stroke: '#6aa84f', 'stroke-width': n1(r * 0.06) }) + rect(x - r * 0.55, by - r * 0.26, r * 1.1, r * 0.06, '#f2c14e') + path(`M${n1(x - r * 0.56)} ${n1(by - r * 0.26)} Q${n1(x - r * 0.56)} ${n1(by - r * 0.7)} ${n1(x)} ${n1(by - r * 0.72)} Q${n1(x + r * 0.56)} ${n1(by - r * 0.7)} ${n1(x + r * 0.56)} ${n1(by - r * 0.26)} Z`, e.rad([[0, '#e8b36a'], [1, '#b4722f']], { cx: 0.4, cy: 0.3 })); for (let i = 0; i < 9; i++) s += ell(x + (R() - 0.5) * r * 0.7, by - r * (0.4 + R() * 0.25), 1.2 * e.s, 2.2 * e.s, '#fbf1d6'); }
  else if (d === 'tacos') { [-0.35, 0.05, 0.45].forEach(f => { s += path(`M${n1(x + f * r - r * 0.24)} ${n1(y + r * 0.1)} Q${n1(x + f * r)} ${n1(y - r * 0.5)} ${n1(x + f * r + r * 0.24)} ${n1(y + r * 0.1)} Z`, '#e8c06a') + ell(x + f * r, y - r * 0.02, r * 0.16, r * 0.06, '#7a3b1f') + [0, 1, 2].map(q => ell(x + f * r - r * 0.08 + q * r * 0.08, y - r * 0.08, r * 0.04, r * 0.03, q === 1 ? '#f4f1ec' : '#6aa84f')).join(''); }); }
  else if (d === 'eggs') { s += halfEgg(e, x - r * 0.25, y, r * 0.24) + halfEgg(e, x + r * 0.15, y - r * 0.05, r * 0.24) + rect(x - r * 0.1, y + r * 0.12, r * 0.6, r * 0.14, '#c98a44', { rx: r * 0.05 }) + ell(x + r * 0.45, y - r * 0.12, r * 0.14, r * 0.08, '#6aa84f'); }
  else { s += ell(x - r * 0.15, y, r * 0.3, r * 0.18, e.rad([[0, '#d98f4e'], [1, '#8a4a22']], { cx: 0.4, cy: 0.3 })) + ell(x + r * 0.3, y + r * 0.04, r * 0.2, r * 0.12, '#6fa34a') + ell(x + r * 0.25, y - r * 0.14, r * 0.12, r * 0.07, '#e8c16a') + path(`M${n1(x - r * 0.5)} ${n1(y + r * 0.2)} Q${n1(x)} ${n1(y + r * 0.3)} ${n1(x + r * 0.5)} ${n1(y + r * 0.15)}`, 'none', { stroke: '#8a2b1a', 'stroke-width': n1(3 * e.s), opacity: 0.7 }); }
  return s;
}
function halfEgg(e, x, y, r) { return ell(x, y, r, r * 0.8, '#fbf8f1') + circ(x, y, r * 0.42, e.rad([[0, '#ffc84a'], [1, '#f0961e']], { cx: 0.4, cy: 0.35 })); }
function beerTaps(e, o) {
  let s = rect(0, 0, e.w, e.h, e.lin([[0, e.tint('#2a1f18')], [1, e.tint('#120d0a')]], { x1: 0, y1: 0, x2: 0, y2: 1 })) + rect(0, 0, e.w, e.h * 0.2, e.tint('#3b2a1e'));
  for (let i = 0; i < 16; i++) s += rect(i * e.w / 16, e.h * 0.2, e.w / 16 - 2 * e.s, e.h * 0.4, e.tint(i % 2 ? '#4a3524' : '#3f2d1f'));
  s += rect(e.w * 0.08, e.h * 0.3, e.w * 0.84, e.h * 0.05, e.lin([[0, '#f1f3f5'], [0.5, '#a9aeb3'], [1, '#6f757b']], { x1: 0, y1: 0, x2: 0, y2: 1 }), { rx: 4 * e.s });
  ['#e0b44a', '#b8642a', '#3a2418', '#e6c56a', '#8a3b2a'].forEach((c, i) => { const x = e.w * (0.16 + i * 0.17); s += rect(x - 3 * e.s, e.h * 0.35, 6 * e.s, e.h * 0.08, '#c9ccd1') + rect(x - e.w * 0.02, e.h * 0.18, e.w * 0.04, e.h * 0.14, e.lin([[0, lighten(c, 0.25)], [1, darken(c, 0.3)]]), { rx: 3 * e.s }); });
  s += rect(0, e.h * 0.66, e.w, e.h * 0.05, e.lin([[0, '#a57a4c'], [1, '#5a3b22']], { x1: 0, y1: 0, x2: 0, y2: 1 })) + rect(0, e.h * 0.71, e.w, e.h * 0.29, '#1b120c');
  const I = require('./hero-art-interior');
  s += I.glassware(e, e.w * 0.3, e.h * 0.66, e.h * 0.24, 'pint', '#e0a33a') + I.glassware(e, e.w * 0.52, e.h * 0.66, e.h * 0.24, 'pint', '#6b2e18') + I.glassware(e, e.w * 0.72, e.h * 0.66, e.h * 0.24, 'pint', '#f0c55a');
  return s;
}
// ---- studio tools --------------------------------------------------------------------------------------------------
function camera(e, x, y, W, o) {
  const k = o || {}; const body = e.lin([[0, '#3d3f43'], [1, '#141517']], { x1: 0, y1: 0, x2: 0, y2: 1 }); let s = e.shadow(x, y + W * 0.42, W * 0.55, W * 0.05, 0.35);
  s += rect(x - W / 2, y - W * 0.28, W, W * 0.6, body, { rx: W * 0.06 }) + rect(x - W * 0.2, y - W * 0.4, W * 0.34, W * 0.14, body, { rx: W * 0.03 }) + rect(x + W * 0.24, y - W * 0.36, W * 0.14, W * 0.08, '#2a2b2e', { rx: W * 0.02 });
  s += rect(x - W / 2, y - W * 0.12, W * 0.24, W * 0.36, '#26272a', { rx: W * 0.04 });
  for (let i = 0; i < 8; i++) s += line(x - W * 0.48, y - W * 0.08 + i * W * 0.04, x - W * 0.28, y - W * 0.08 + i * W * 0.04, '#3a3b3f', 1 * e.s);
  // lens
  [0.3, 0.26, 0.2, 0.14].forEach((r, i) => { s += circ(x + W * 0.08, y + W * 0.03, W * r, i === 0 ? '#1b1c1e' : i === 1 ? e.lin([[0, '#55585d'], [1, '#1b1c1e']], { x1: 0, y1: 0, x2: 1, y2: 1 }) : i === 2 ? '#0e0f10' : e.rad([[0, '#6a89c9'], [0.5, '#1c2640'], [1, '#07090f']], { cx: 0.35, cy: 0.3 })); });
  s += circ(x + W * 0.08, y + W * 0.03, W * 0.3, 'none', { stroke: k.ring || '#c0392b', 'stroke-width': n1(1.4 * e.s) }) + circ(x + W * 0.02, y - W * 0.03, W * 0.04, '#fff', { opacity: 0.6 }) + circ(x - W * 0.34, y - W * 0.2, W * 0.03, '#c0392b');
  return s;
}
function softbox(e, x, baseY, H) {
  let s = e.shadow(x, baseY, H * 0.25, H * 0.03, 0.3) + line(x, baseY, x, baseY - H * 0.62, '#2a2b2e', 2.4 * e.s) + path(`M${n1(x - H * 0.16)} ${n1(baseY)} L${n1(x)} ${n1(baseY - H * 0.18)} L${n1(x + H * 0.16)} ${n1(baseY)}`, 'none', { stroke: '#2a2b2e', 'stroke-width': n1(2.2 * e.s) });
  s += g(rect(-H * 0.2, -H * 0.24, H * 0.4, H * 0.3, '#1d1e20', { rx: 3 * e.s }) + rect(-H * 0.18, -H * 0.22, H * 0.36, H * 0.26, e.rad([[0, '#ffffff'], [1, '#f1ead8']], { cx: 0.5, cy: 0.5, r: 0.7 }), { rx: 2 * e.s }), { transform: `translate(${n1(x)} ${n1(baseY - H * 0.66)}) rotate(-14)` });
  s += path(P([[x - H * 0.2, baseY - H * 0.62], [x + H * 0.2, baseY - H * 0.7], [x + H * 0.9, baseY - H * 0.1], [x - H * 0.2, baseY]]), '#fff6dd', { opacity: 0.08 });
  return s;
}
function prints(e, x, y, W, o) {
  const k = o || {}; const R = rng(hashStr(`pr${x}${y}`)); let s = '';
  const scenes = k.scenes || ['sea', 'hill', 'city', 'portrait', 'forest'];
  scenes.slice(0, 5).forEach((sc, i) => { const px = x + (i - 2) * W * 0.2 + (R() - 0.5) * W * 0.05, py = y + (i % 2) * W * 0.08 - W * 0.04; const pw = W * 0.26, ph = W * 0.2; const a = (R() - 0.5) * 16;
    let inner = rect(-pw / 2, -ph / 2, pw, ph, '#fbfaf7') + rect(-pw / 2 + pw * 0.06, -ph / 2 + pw * 0.06, pw * 0.88, ph - pw * 0.2, sc === 'city' ? '#2b3a67' : '#bcd7e6');
    const ix = -pw / 2 + pw * 0.06, iy = -ph / 2 + pw * 0.06, iw = pw * 0.88, ih = ph - pw * 0.2;
    if (sc === 'sea') inner += rect(ix, iy + ih * 0.55, iw, ih * 0.45, '#3f7ea6') + circ(ix + iw * 0.7, iy + ih * 0.3, ih * 0.12, '#fff4d6');
    else if (sc === 'hill') inner += path(`M${n1(ix)} ${n1(iy + ih)} L${n1(ix)} ${n1(iy + ih * 0.6)} Q${n1(ix + iw * 0.4)} ${n1(iy + ih * 0.25)} ${n1(ix + iw)} ${n1(iy + ih * 0.65)} L${n1(ix + iw)} ${n1(iy + ih)} Z`, '#6a9a4f');
    else if (sc === 'city') inner += [0, 1, 2, 3, 4].map(q => rect(ix + q * iw / 5, iy + ih * (0.3 + (q % 3) * 0.15), iw / 5 - 1, ih * (0.7 - (q % 3) * 0.15), '#131b31')).join('');
    else if (sc === 'portrait') inner += rect(ix, iy, iw, ih, '#d8c2a6') + circ(ix + iw * 0.5, iy + ih * 0.4, ih * 0.2, '#8a5a3b') + path(`M${n1(ix + iw * 0.25)} ${n1(iy + ih)} Q${n1(ix + iw * 0.5)} ${n1(iy + ih * 0.5)} ${n1(ix + iw * 0.75)} ${n1(iy + ih)} Z`, '#3d4b5c');
    else inner += rect(ix, iy, iw, ih, '#2f4a2c') + [0, 1, 2, 3].map(q => path(P([[ix + q * iw / 4 + iw * 0.05, iy + ih], [ix + q * iw / 4 + iw * 0.125, iy + ih * 0.2], [ix + q * iw / 4 + iw * 0.2, iy + ih]]), '#4f7a3a')).join('');
    s += e.shadow(px + 3 * e.s, py + ph * 0.55, pw * 0.5, ph * 0.1, 0.25) + g(inner, { transform: `translate(${n1(px)} ${n1(py)}) rotate(${n1(a)})` }); });
  if (k.loupe) s += circ(x + W * 0.25, y + W * 0.02, W * 0.07, '#dfe9ee', { opacity: 0.6, stroke: '#2a2b2e', 'stroke-width': n1(3 * e.s) });
  return s;
}
function swatchFan(e, x, y, L, cols) {
  const cs = cols || [e.accent, lighten(e.accent, 0.3), '#e76f51', '#f4a261', '#e9c46a', '#2a9d8f', '#264653']; let s = e.shadow(x, y + L * 0.1, L * 0.6, L * 0.08, 0.3);
  cs.forEach((c, i) => { const a = -70 + i * (100 / cs.length); s += g(rect(-L * 0.08, -L, L * 0.16, L, '#fbfaf7', { rx: 3 * e.s }) + rect(-L * 0.07, -L * 0.98, L * 0.14, L * 0.6, e.tint(c), { rx: 2 * e.s }) + line(-L * 0.05, -L * 0.3, L * 0.03, -L * 0.3, '#9a958c', 1.4 * e.s) + line(-L * 0.05, -L * 0.24, L * 0.01, -L * 0.24, '#bdb8af', 1.2 * e.s), { transform: `translate(${n1(x)} ${n1(y)}) rotate(${n1(a)})` }); });
  return s + circ(x, y, L * 0.03, '#9aa0a6');
}
function moodboard(e, o) {
  const k = o || {}; let s = rect(0, 0, e.w, e.h, e.tint('#e9e2d6')) + rect(e.w * 0.06, e.h * 0.06, e.w * 0.88, e.h * 0.8, e.tint('#cbb89a'), { rx: 4 * e.s });
  const R = rng(hashStr('mood' + e.uid)); const cards = [[0.1, 0.1, 0.3, 0.34], [0.44, 0.12, 0.22, 0.3], [0.7, 0.1, 0.2, 0.22], [0.12, 0.5, 0.24, 0.3], [0.4, 0.48, 0.3, 0.32], [0.74, 0.38, 0.16, 0.42]];
  cards.forEach(([fx, fy, fw, fh], i) => { const x = e.w * fx, y = e.h * fy, w = e.w * fw, h = e.h * fh; const a = (R() - 0.5) * 6;
    let inner = rect(0, 0, w, h, '#fbfaf7');
    if (i === 0) inner += A.wordmark(e, 'Aa', w * 0.5, h * 0.66, h * 0.5, darken(e.accent, 0.2), { serif: true, weight: 700 });
    else if (i === 2 || i === 5) inner += [0, 1, 2, 3].map(q => rect(w * 0.1, h * (0.08 + q * 0.23), w * 0.8, h * 0.18, e.tint([e.accent, '#e9c46a', '#2a9d8f', '#e76f51'][q]))).join('');
    else if (i === 3) inner += path(`M${n1(w * 0.1)} ${n1(h * 0.8)} Q${n1(w * 0.3)} ${n1(h * 0.2)} ${n1(w * 0.5)} ${n1(h * 0.6)} T${n1(w * 0.9)} ${n1(h * 0.3)}`, 'none', { stroke: '#3a3a3a', 'stroke-width': n1(2 * e.s) }) + circ(w * 0.7, h * 0.7, h * 0.1, 'none', { stroke: '#3a3a3a', 'stroke-width': n1(1.5 * e.s) });
    else inner += rect(w * 0.06, h * 0.06, w * 0.88, h * 0.88, e.lin([[0, lighten(e.accent, 0.4)], [1, e.tint('#a3b8a0')]], { x1: 0, y1: 0, x2: 1, y2: 1 })) + circ(w * 0.3, h * 0.35, h * 0.12, '#fbf3df');
    s += e.shadow(x + w / 2 + 3 * e.s, y + h, w * 0.4, h * 0.05, 0.25) + g(inner + circ(w * 0.5, h * 0.05, 4 * e.s, '#c0392b'), { transform: `translate(${n1(x)} ${n1(y)}) rotate(${n1(a)} ${n1(w / 2)} ${n1(h / 2)})` }); });
  if (k.swatches !== false) s += swatchFan(e, e.w * 0.78, e.h * 0.96, e.h * 0.3);
  return s;
}
function sketchbook(e, x, y, W) {
  let s = e.shadow(x, y + W * 0.36, W * 0.55, W * 0.06, 0.3) + rect(x - W / 2, y - W * 0.34, W, W * 0.68, '#fbfaf5', { rx: 3 * e.s, stroke: '#ddd6ca', 'stroke-width': n1(1 * e.s) }) + line(x, y - W * 0.34, x, y + W * 0.34, '#d8d1c4', 1.5 * e.s);
  s += path(`M${n1(x - W * 0.42)} ${n1(y + W * 0.1)} Q${n1(x - W * 0.3)} ${n1(y - W * 0.25)} ${n1(x - W * 0.12)} ${n1(y - W * 0.02)} T${n1(x - W * 0.05)} ${n1(y - W * 0.2)}`, 'none', { stroke: '#4a4a4a', 'stroke-width': n1(1.6 * e.s) }) + rect(x + W * 0.08, y - W * 0.24, W * 0.3, W * 0.2, 'none', { stroke: '#4a4a4a', 'stroke-width': n1(1.4 * e.s) }) + line(x + W * 0.08, y + W * 0.04, x + W * 0.38, y + W * 0.04, '#9a9a9a', 1.2 * e.s) + line(x + W * 0.08, y + W * 0.1, x + W * 0.3, y + W * 0.1, '#9a9a9a', 1.2 * e.s);
  s += g(rect(0, -3 * e.s, W * 0.5, 6 * e.s, '#e9b949') + path(P([[W * 0.5, -3 * e.s], [W * 0.58, 0], [W * 0.5, 3 * e.s]]), '#e8cfa6') + rect(-W * 0.05, -3 * e.s, W * 0.05, 6 * e.s, '#e37b8a'), { transform: `translate(${n1(x + W * 0.05)} ${n1(y + W * 0.28)}) rotate(-24)` });
  return s;
}
// ---- fitness ---------------------------------------------------------------------------------------------------------
function glove(e, x, y, W, c, flip) {
  const col = c || '#c0392b'; const u = W / 100;
  const inner = path(`M${n1(-30 * u)} ${n1(40 * u)} L${n1(-34 * u)} ${n1(-10 * u)} Q${n1(-38 * u)} ${n1(-50 * u)} ${n1(4 * u)} ${n1(-52 * u)} Q${n1(40 * u)} ${n1(-50 * u)} ${n1(38 * u)} ${n1(-8 * u)} L${n1(34 * u)} ${n1(20 * u)} Q${n1(28 * u)} ${n1(40 * u)} ${n1(10 * u)} ${n1(40 * u)} Z`, e.rad([[0, lighten(col, 0.35)], [0.6, col], [1, darken(col, 0.35)]], { cx: 0.35, cy: 0.3 })) +
    path(`M${n1(-36 * u)} ${n1(-6 * u)} Q${n1(-52 * u)} ${n1(-6 * u)} ${n1(-48 * u)} ${n1(10 * u)} Q${n1(-44 * u)} ${n1(20 * u)} ${n1(-32 * u)} ${n1(16 * u)}`, darken(col, 0.08)) + rect(-32 * u, 34 * u, 64 * u, 30 * u, e.lin([[0, '#f4f1ec'], [1, '#cfc8bc']]), { rx: 6 * u }) + rect(-32 * u, 44 * u, 64 * u, 8 * u, darken(col, 0.1)) + ell(-8 * u, -30 * u, 12 * u, 6 * u, '#fff', { opacity: 0.3, transform: 'rotate(-20)' });
  return g(inner, { transform: `translate(${n1(x)} ${n1(y)})${flip ? ' scale(-1 1)' : ''} rotate(${flip ? -12 : 12})` });
}
function heavyBag(e, x, top, H, c) {
  const col = e.tint(c || '#2d2a27'); let s = line(x, 0, x, top, '#6a6f75', 2 * e.s) + path(`M${n1(x)} ${n1(top)} L${n1(x - H * 0.14)} ${n1(top + H * 0.08)} M${n1(x)} ${n1(top)} L${n1(x + H * 0.14)} ${n1(top + H * 0.08)}`, 'none', { stroke: '#6a6f75', 'stroke-width': n1(1.6 * e.s) });
  s += rect(x - H * 0.16, top + H * 0.08, H * 0.32, H * 0.9, e.cyl(col, { edge: 0.4, hi: 0.18 }), { rx: H * 0.08 }) + rect(x - H * 0.16, top + H * 0.3, H * 0.32, H * 0.06, darken(col, 0.3)) + rect(x - H * 0.16, top + H * 0.72, H * 0.32, H * 0.06, darken(col, 0.3));
  return s;
}
function wraps(e, x, y, r, c) { const col = e.tint(c || '#e05a47'); let s = e.shadow(x, y + r * 0.8, r * 1.2, r * 0.2, 0.3) + circ(x, y, r, e.rad([[0, lighten(col, 0.2)], [1, darken(col, 0.25)]], { cx: 0.4, cy: 0.35 })); for (let i = 1; i < 5; i++) s += circ(x, y, r * i / 5, 'none', { stroke: darken(col, 0.2), 'stroke-width': n1(1 * e.s), opacity: 0.6 }); return s + path(`M${n1(x + r)} ${n1(y)} Q${n1(x + r * 1.6)} ${n1(y + r * 0.2)} ${n1(x + r * 2.4)} ${n1(y + r * 0.9)}`, 'none', { stroke: col, 'stroke-width': n1(r * 0.5), 'stroke-linecap': 'round' }); }
function kettlebell(e, x, baseY, H, c) { const col = c || '#2d2f33'; return e.shadow(x, baseY, H * 0.45, H * 0.06, 0.35) + path(`M${n1(x - H * 0.24)} ${n1(baseY - H * 0.62)} Q${n1(x - H * 0.28)} ${n1(baseY - H)} ${n1(x)} ${n1(baseY - H)} Q${n1(x + H * 0.28)} ${n1(baseY - H)} ${n1(x + H * 0.24)} ${n1(baseY - H * 0.62)}`, 'none', { stroke: col, 'stroke-width': n1(H * 0.1) }) + circ(x, baseY - H * 0.34, H * 0.36, e.rad([[0, lighten(col, 0.35)], [1, darken(col, 0.3)]], { cx: 0.35, cy: 0.3 })) + rect(x - H * 0.28, baseY - 4 * e.s, H * 0.56, 4 * e.s, darken(col, 0.3)); }
function dumbbell(e, x, y, L, c) { const col = c || '#2d2f33'; const u = L / 100; return e.shadow(x, y + 14 * u, L * 0.5, L * 0.05, 0.3) + rect(x - 30 * u, y - 3 * u, 60 * u, 6 * u, e.lin([[0, '#e1e4e7'], [1, '#7d848b']], { x1: 0, y1: 0, x2: 0, y2: 1 })) + [-1, 1].map(sd => rect(x + sd * 38 * u - 9 * u, y - 16 * u, 18 * u, 32 * u, e.lin([[0, lighten(col, 0.3)], [1, darken(col, 0.3)]]), { rx: 4 * u }) + rect(x + sd * 26 * u - 5 * u, y - 12 * u, 10 * u, 24 * u, e.lin([[0, lighten(col, 0.2)], [1, darken(col, 0.3)]]), { rx: 3 * u })).join(''); }
function barbell(e, x, y, L) { const u = L / 100; let s = e.shadow(x, y + 30 * u, L * 0.55, L * 0.04, 0.35) + rect(x - 50 * u, y - 1.6 * u, 100 * u, 3.2 * u, e.lin([[0, '#f1f3f5'], [1, '#7d848b']], { x1: 0, y1: 0, x2: 0, y2: 1 })); [-1, 1].forEach(sd => { [[36, 26, '#c0392b'], [30, 22, '#2d6cdf'], [25, 16, '#2d2f33']].forEach(([off, r, c]) => { s += rect(x + sd * off * u - 3 * u, y - r * u, 6 * u, r * 2 * u, e.lin([[0, lighten(c, 0.2)], [1, darken(c, 0.3)]], { x1: 0, y1: 0, x2: 0, y2: 1 }), { rx: 2 * u }); }); }); for (let i = -6; i <= 6; i++) s += line(x + i * 2 * u, y - 1.6 * u, x + i * 2 * u + 1 * u, y + 1.6 * u, '#6a7178', 0.5 * u); return s; }
// ---- care & wellness ---------------------------------------------------------------------------------------------------
function stones(e, x, baseY, W) { let s = e.shadow(x, baseY, W * 0.4, W * 0.05, 0.3); [[0.5, 0.16], [0.4, 0.14], [0.3, 0.12], [0.2, 0.1]].forEach(([r, h], i) => { const y = baseY - W * [0.08, 0.22, 0.34, 0.44][i]; s += ell(x + (i % 2 ? 3 : -3) * e.s, y, W * r * 0.5, W * h * 0.5, e.rad([[0, '#6a6f75'], [0.6, '#3a3d42'], [1, '#1f2023']], { cx: 0.35, cy: 0.3 })); }); return s; }
function towelRoll(e, x, y, r, c) { const col = e.tint(c || '#f1ebe1'); let s = e.shadow(x, y + r, r * 1.6, r * 0.2, 0.25) + rect(x - r * 1.5, y - r, r * 3, r * 2, e.lin([[0, lighten(col, 0.1)], [1, darken(col, 0.12)]], { x1: 0, y1: 0, x2: 0, y2: 1 }), { rx: r }) + circ(x + r * 1.5, y, r, darken(col, 0.05)); for (let i = 1; i < 4; i++) s += circ(x + r * 1.5, y, r * i / 4, 'none', { stroke: darken(col, 0.15), 'stroke-width': n1(1 * e.s) }); return s; }
function needles(e, x, y, W) { let s = e.shadow(x, y + W * 0.1, W * 0.55, W * 0.06, 0.25) + rect(x - W / 2, y - W * 0.12, W, W * 0.24, '#eceff1', { rx: W * 0.04, stroke: '#cfd6da', 'stroke-width': n1(1 * e.s) }); for (let i = 0; i < 7; i++) { const nx = x - W * 0.4 + i * W * 0.13; s += line(nx, y - W * 0.06, nx + W * 0.06, y + W * 0.08, '#c9ccd1', 1.2 * e.s) + rect(nx - W * 0.02, y - W * 0.1, W * 0.04, W * 0.06, e.tint('#6cbf9a'), { rx: 2 * e.s }); } return s; }
function scissorsComb(e, x, y, L) { const u = L / 100; const steel = e.lin([[0, '#f1f3f5'], [1, '#7d848b']]); let s = e.shadow(x, y + 20 * u, L * 0.5, L * 0.05, 0.25); s += g(path(`M0 0 L${n1(60 * u)} ${n1(-4 * u)} L${n1(60 * u)} ${n1(2 * u)} Z`, steel) + circ(-14 * u, 6 * u, 9 * u, 'none', { stroke: '#2d2f33', 'stroke-width': n1(3 * u) }), { transform: `translate(${n1(x - 20 * u)} ${n1(y - 8 * u)}) rotate(-8)` }) + g(path(`M0 0 L${n1(60 * u)} ${n1(4 * u)} L${n1(60 * u)} ${n1(-2 * u)} Z`, steel) + circ(-14 * u, -6 * u, 9 * u, 'none', { stroke: '#2d2f33', 'stroke-width': n1(3 * u) }), { transform: `translate(${n1(x - 20 * u)} ${n1(y - 8 * u)}) rotate(8)` }); s += rect(x - 40 * u, y + 10 * u, 80 * u, 8 * u, '#2d2f33', { rx: 2 * u }); for (let i = 0; i < 26; i++) s += line(x - 38 * u + i * 3 * u, y + 18 * u, x - 38 * u + i * 3 * u, y + 30 * u, '#2d2f33', 1.2 * u); return s; }
function nailPolish(e, x, baseY, H, c) { const col = c || '#c2185b'; return e.shadow(x, baseY, H * 0.3, H * 0.04, 0.3) + rect(x - H * 0.24, baseY - H * 0.5, H * 0.48, H * 0.5, e.cyl(col, { edge: 0.4, hi: 0.4 }), { rx: H * 0.08 }) + rect(x - H * 0.1, baseY - H, H * 0.2, H * 0.5, e.cyl('#1f1d1b'), { rx: H * 0.03 }) + rect(x - H * 0.16, baseY - H * 0.34, H * 0.08, H * 0.26, '#fff', { opacity: 0.35, rx: H * 0.04 }); }
function tooth(e, x, y, H) { return e.shadow(x, y + H * 0.55, H * 0.4, H * 0.06, 0.25) + path(`M${n1(x - H * 0.36)} ${n1(y - H * 0.3)} Q${n1(x - H * 0.4)} ${n1(y - H * 0.55)} ${n1(x - H * 0.18)} ${n1(y - H * 0.55)} Q${n1(x)} ${n1(y - H * 0.48)} ${n1(x + H * 0.18)} ${n1(y - H * 0.55)} Q${n1(x + H * 0.4)} ${n1(y - H * 0.55)} ${n1(x + H * 0.36)} ${n1(y - H * 0.3)} Q${n1(x + H * 0.3)} ${n1(y)} ${n1(x + H * 0.24)} ${n1(y + H * 0.45)} Q${n1(x + H * 0.16)} ${n1(y + H * 0.55)} ${n1(x + H * 0.08)} ${n1(y + H * 0.35)} Q${n1(x)} ${n1(y + H * 0.1)} ${n1(x - H * 0.08)} ${n1(y + H * 0.35)} Q${n1(x - H * 0.16)} ${n1(y + H * 0.55)} ${n1(x - H * 0.24)} ${n1(y + H * 0.45)} Q${n1(x - H * 0.3)} ${n1(y)} ${n1(x - H * 0.36)} ${n1(y - H * 0.3)} Z`, e.rad([[0, '#ffffff'], [0.7, '#eef2f4'], [1, '#c9d3d8']], { cx: 0.35, cy: 0.3 })) + A.sprig(e, x + H * 0.4, y - H * 0.5, H * 0.3, -40, e.tint('#7fc8b0')); }
function band(e, x1, y1, x2, y2, c) { return path(`M${n1(x1)} ${n1(y1)} Q${n1((x1 + x2) / 2)} ${n1(Math.max(y1, y2) + 30 * e.s)} ${n1(x2)} ${n1(y2)}`, 'none', { stroke: c || '#e05a47', 'stroke-width': n1(6 * e.s), 'stroke-linecap': 'round' }); }
// ---- desk & paperwork --------------------------------------------------------------------------------------------------
function paper(e, x, y, w, h, ang, o) {
  const k = o || {}; let inner = rect(-w / 2, -h / 2, w, h, '#fdfcf8') + rect(-w / 2, -h / 2, w, h * 0.12, k.band || 'none');
  for (let i = 0; i < (k.lines || 9); i++) inner += rect(-w * 0.4, -h * 0.34 + i * h * 0.07, w * (i % 4 === 3 ? 0.5 : 0.8), 2.4 * e.s, '#c9c4ba', { rx: 1.2 * e.s });
  if (k.signature) inner += line(-w * 0.4, h * 0.36, w * 0.1, h * 0.36, '#7a756c', 1 * e.s) + path(`M${n1(-w * 0.38)} ${n1(h * 0.33)} q${n1(w * 0.06)} ${n1(-h * 0.08)} ${n1(w * 0.1)} 0 t${n1(w * 0.1)} 0 t${n1(w * 0.12)} ${n1(-h * 0.02)}`, 'none', { stroke: '#1f3a6b', 'stroke-width': n1(1.8 * e.s) });
  if (k.chart) inner += path(`M${n1(-w * 0.36)} ${n1(h * 0.34)} L${n1(-w * 0.2)} ${n1(h * 0.2)} L${n1(-w * 0.04)} ${n1(h * 0.26)} L${n1(w * 0.14)} ${n1(h * 0.06)} L${n1(w * 0.34)} ${n1(-h * 0.02)}`, 'none', { stroke: e.accent, 'stroke-width': n1(2.4 * e.s) }) + line(-w * 0.38, h * 0.38, w * 0.38, h * 0.38, '#b9b4aa', 1 * e.s);
  return e.shadow(x + 4 * e.s, y + h * 0.5, w * 0.5, h * 0.06, 0.2) + g(inner, { transform: `translate(${n1(x)} ${n1(y)}) rotate(${ang || 0})` });
}
function pen(e, x, y, L, ang, c) { const u = L / 100; return g(rect(-50 * u, -3.4 * u, 84 * u, 6.8 * u, e.lin([[0, lighten(c || '#1f2d3d', 0.3)], [1, darken(c || '#1f2d3d', 0.2)]], { x1: 0, y1: 0, x2: 0, y2: 1 }), { rx: 3 * u }) + path(P([[34 * u, -3.4 * u], [50 * u, 0], [34 * u, 3.4 * u]]), '#d8b25a') + rect(-40 * u, -4.4 * u, 22 * u, 1.6 * u, '#d8b25a'), { transform: `translate(${n1(x)} ${n1(y)}) rotate(${ang || 0})` }); }
function calculator(e, x, y, W, ang) { let inner = rect(-W / 2, -W * 0.65, W, W * 1.3, e.lin([[0, '#3a3d42'], [1, '#1d1e20']], { x1: 0, y1: 0, x2: 0, y2: 1 }), { rx: W * 0.08 }) + rect(-W * 0.4, -W * 0.55, W * 0.8, W * 0.26, '#b9c8a8', { rx: W * 0.03 }); for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) inner += rect(-W * 0.4 + c * W * 0.21, -W * 0.18 + r * W * 0.2, W * 0.16, W * 0.14, c === 3 ? e.tint('#e07a3a') : '#5a5e64', { rx: W * 0.03 }); return e.shadow(x + 4 * e.s, y + W * 0.66, W * 0.5, W * 0.06, 0.3) + g(inner, { transform: `translate(${n1(x)} ${n1(y)}) rotate(${ang || 0})` }); }
function stickyWall(e, o) {
  const k = o || {}; let s = rect(0, 0, e.w, e.h, '#f7f7f5') + rect(0, 0, e.w, e.h, e.rad([[0, '#ffffff', 0.6], [1, '#e7e8e6', 0.8]], { cx: 0.3, cy: 0.2, r: 0.9 }));
  const cols = ['#ffe07a', '#ffb3a7', '#a8e0c8', '#a7c8ff', '#f7c6ff']; const R = rng(hashStr('stk' + e.uid)); const heads = (k.items || []).slice(0, 3);
  for (let c = 0; c < 3; c++) { const x = e.w * (0.08 + c * 0.31); if (heads[c]) s += A.wordmark(e, heads[c], x + e.w * 0.12, e.h * 0.1, e.h * 0.045, '#3a3a3a', { weight: 700, spacing: '0.02em', maxWidth: e.w * 0.26 }); else s += rect(x + e.w * 0.03, e.h * 0.07, e.w * 0.18, 4 * e.s, '#3a3a3a', { rx: 2 * e.s }); for (let r = 0; r < 4; r++) { if (R() < 0.2) continue; const px = x + (r % 2) * e.w * 0.12 + (R() - 0.5) * 6 * e.s, py = e.h * (0.18 + r * 0.18); s += e.shadow(px + e.w * 0.05, py + e.w * 0.1, e.w * 0.05, e.w * 0.01, 0.2) + rect(px, py, e.w * 0.11, e.w * 0.1, e.tint(cols[(c + r) % cols.length]), { transform: `rotate(${n1((R() - 0.5) * 8)} ${n1(px)} ${n1(py)})` }) + rect(px + e.w * 0.015, py + e.w * 0.03, e.w * 0.07, 2 * e.s, '#555', { opacity: 0.5 }) + rect(px + e.w * 0.015, py + e.w * 0.05, e.w * 0.05, 2 * e.s, '#555', { opacity: 0.5 }); } }
  s += path(`M${n1(e.w * 0.3)} ${n1(e.h * 0.5)} q${n1(e.w * 0.04)} ${n1(-e.h * 0.06)} ${n1(e.w * 0.08)} 0`, 'none', { stroke: '#2d6cdf', 'stroke-width': n1(3 * e.s), 'stroke-linecap': 'round' }) + path(`M${n1(e.w * 0.62)} ${n1(e.h * 0.62)} q${n1(e.w * 0.04)} ${n1(e.h * 0.06)} ${n1(e.w * 0.08)} 0`, 'none', { stroke: '#2d6cdf', 'stroke-width': n1(3 * e.s), 'stroke-linecap': 'round' });
  s += g(rect(0, -5 * e.s, e.w * 0.22, 10 * e.s, e.tint('#2d6cdf'), { rx: 5 * e.s }) + rect(e.w * 0.2, -4 * e.s, e.w * 0.05, 8 * e.s, '#1d1e20', { rx: 2 * e.s }), { transform: `translate(${n1(e.w * 0.62)} ${n1(e.h * 0.92)}) rotate(-12)` });
  return s;
}
function keysOnTag(e, x, y, L) {
  const u = L / 100; const brass = e.lin([[0, '#8a6a22'], [0.3, '#f5d98a'], [0.6, '#c99a36'], [1, '#7a5a1a']]); let s = e.shadow(x, y + 30 * u, L * 0.5, L * 0.06, 0.3);
  s += circ(x - 20 * u, y - 10 * u, 14 * u, 'none', { stroke: '#c9ccd1', 'stroke-width': n1(3 * u) });
  s += g(rect(0, -6 * u, 50 * u, 12 * u, brass, { rx: 2 * u }) + path(`M${n1(40 * u)} ${n1(6 * u)} l0 ${n1(6 * u)} l${n1(5 * u)} 0 l0 ${n1(-3 * u)} l${n1(4 * u)} 0 l0 ${n1(4 * u)}`, 'none', { stroke: '#c99a36', 'stroke-width': n1(3 * u) }) + circ(-6 * u, 0, 12 * u, brass) + circ(-8 * u, 0, 4 * u, '#fbf7ea'), { transform: `translate(${n1(x - 8 * u)} ${n1(y)}) rotate(18)` });
  s += g(path(`M${n1(-18 * u)} ${n1(-12 * u)} L${n1(8 * u)} ${n1(-12 * u)} L${n1(18 * u)} 0 L${n1(8 * u)} ${n1(12 * u)} L${n1(-18 * u)} ${n1(12 * u)} Z`, '#f4efe4', { stroke: '#d9cfbd', 'stroke-width': n1(1 * u) }) + path(`M${n1(-10 * u)} ${n1(4 * u)} L${n1(-10 * u)} ${n1(-2 * u)} L${n1(-4 * u)} ${n1(-7 * u)} L${n1(2 * u)} ${n1(-2 * u)} L${n1(2 * u)} ${n1(4 * u)} Z`, e.accent), { transform: `translate(${n1(x - 42 * u)} ${n1(y + 18 * u)}) rotate(-24)` });
  return s;
}
// ---- vehicles -------------------------------------------------------------------------------------------------------------
function car(e, x, baseY, L, c, o) {
  const k = o || {}; const col = c || e.accent; const u = L / 100; let s = e.shadow(x, baseY + 1 * u, L * 0.55, L * 0.05, 0.45);
  const paint = e.lin([[0, lighten(col, 0.35)], [0.35, col], [0.62, darken(col, 0.25)], [1, darken(col, 0.5)]], { x1: 0, y1: 0, x2: 0, y2: 1 });
  s += path(`M${n1(x - 50 * u)} ${n1(baseY - 10 * u)} Q${n1(x - 52 * u)} ${n1(baseY - 22 * u)} ${n1(x - 42 * u)} ${n1(baseY - 24 * u)} L${n1(x - 26 * u)} ${n1(baseY - 26 * u)} Q${n1(x - 14 * u)} ${n1(baseY - 40 * u)} ${n1(x + 4 * u)} ${n1(baseY - 40 * u)} L${n1(x + 18 * u)} ${n1(baseY - 39 * u)} Q${n1(x + 30 * u)} ${n1(baseY - 28 * u)} ${n1(x + 44 * u)} ${n1(baseY - 24 * u)} Q${n1(x + 52 * u)} ${n1(baseY - 22 * u)} ${n1(x + 51 * u)} ${n1(baseY - 12 * u)} L${n1(x + 50 * u)} ${n1(baseY - 8 * u)} L${n1(x - 50 * u)} ${n1(baseY - 8 * u)} Z`, paint);
  s += path(`M${n1(x - 22 * u)} ${n1(baseY - 27 * u)} Q${n1(x - 12 * u)} ${n1(baseY - 37 * u)} ${n1(x + 2 * u)} ${n1(baseY - 37 * u)} L${n1(x + 16 * u)} ${n1(baseY - 36 * u)} Q${n1(x + 24 * u)} ${n1(baseY - 30 * u)} ${n1(x + 28 * u)} ${n1(baseY - 27 * u)} Z`, e.lin([[0, '#c9dbe6'], [1, '#2f3f4c']], { x1: 0, y1: 0, x2: 0, y2: 1 }));
  s += line(x + 4 * u, baseY - 37 * u, x + 4 * u, baseY - 27 * u, darken(col, 0.3), 1.6 * u) + line(x - 30 * u, baseY - 18 * u, x + 44 * u, baseY - 18 * u, lighten(col, 0.5), 0.8 * u, { opacity: 0.6 });
  // mirror-finish reflections: long light strips across the paint
  if (k.shine) [[-30, 0.5], [0, 0.35], [26, 0.45]].forEach(([dx, op]) => { s += path(P([[x + (dx - 4) * u, baseY - 26 * u], [x + (dx + 6) * u, baseY - 26 * u], [x + (dx + 2) * u, baseY - 12 * u], [x + (dx - 8) * u, baseY - 12 * u]]), '#ffffff', { opacity: op }); });
  s += rect(x + 44 * u, baseY - 21 * u, 6 * u, 3 * u, '#fff6d8', { rx: 1.5 * u }) + rect(x - 50 * u, baseY - 20 * u, 4 * u, 3 * u, '#c0392b', { rx: 1.5 * u });
  const wheel = wx => circ(wx, baseY - 8 * u, 9 * u, '#1b1c1e') + circ(wx, baseY - 8 * u, 5.6 * u, e.lin([[0, '#eceef0'], [1, '#7d848b']], { x1: 0, y1: 0, x2: 1, y2: 1 })) + [0, 1, 2, 3, 4].map(i => { const a = i / 5 * Math.PI * 2; return line(wx, baseY - 8 * u, wx + Math.cos(a) * 5 * u, baseY - 8 * u + Math.sin(a) * 5 * u, '#5a5f66', 1.2 * u); }).join('') + circ(wx, baseY - 8 * u, 1.4 * u, '#2d2f33');
  s += wheel(x - 30 * u) + wheel(x + 32 * u);
  return s;
}
function rim(e, x, y, r) {
  let s = e.shadow(x, y + r * 1.02, r * 1.1, r * 0.12, 0.4) + circ(x, y, r, e.rad([[0, '#2a2b2e'], [1, '#101112']])) + circ(x, y, r * 0.96, 'none', { stroke: '#3a3b3f', 'stroke-width': n1(r * 0.05) });
  for (let i = 0; i < 30; i++) { const a = i / 30 * Math.PI * 2; s += line(x + Math.cos(a) * r * 0.82, y + Math.sin(a) * r * 0.82, x + Math.cos(a) * r * 0.97, y + Math.sin(a) * r * 0.97, '#2f3034', r * 0.05); }
  s += circ(x, y, r * 0.72, e.lin([[0, '#f4f6f8'], [0.5, '#a3a9b0'], [1, '#5f656b']], { x1: 0, y1: 0, x2: 1, y2: 1 })) + circ(x, y, r * 0.66, '#1b1c1e');
  for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2 - Math.PI / 2; s += path(P([[x + Math.cos(a - 0.12) * r * 0.16, y + Math.sin(a - 0.12) * r * 0.16], [x + Math.cos(a - 0.2) * r * 0.66, y + Math.sin(a - 0.2) * r * 0.66], [x + Math.cos(a + 0.2) * r * 0.66, y + Math.sin(a + 0.2) * r * 0.66], [x + Math.cos(a + 0.12) * r * 0.16, y + Math.sin(a + 0.12) * r * 0.16]]), e.lin([[0, '#f4f6f8'], [1, '#8a9097']], { x1: 0, y1: 0, x2: 1, y2: 1 })); }
  s += circ(x, y, r * 0.2, e.lin([[0, '#e9ecef'], [1, '#6a7178']])) + circ(x, y, r * 0.08, e.accent);
  [0, 1, 2, 3, 4].forEach(i => { const a = i / 5 * Math.PI * 2; s += circ(x + Math.cos(a) * r * 0.13, y + Math.sin(a) * r * 0.13, r * 0.02, '#2d2f33'); });
  return s + path(`M${n1(x - r * 0.9)} ${n1(y - r * 0.4)} A${n1(r)} ${n1(r)} 0 0 1 ${n1(x - r * 0.2)} ${n1(y - r * 0.98)}`, 'none', { stroke: '#ffffff', 'stroke-width': n1(r * 0.03), opacity: 0.35 });
}
function polisher(e, x, y, W, ang) {
  const u = W / 100; return g(ell(0, 30 * u, 36 * u, 10 * u, e.tint('#e8793a')) + ell(0, 26 * u, 34 * u, 9 * u, '#f4a261') + rect(-18 * u, -8 * u, 36 * u, 30 * u, e.lin([[0, '#3a3d42'], [1, '#1d1e20']]), { rx: 8 * u }) + rect(-60 * u, -14 * u, 50 * u, 16 * u, e.lin([[0, '#4a4d52'], [1, '#232427']], { x1: 0, y1: 0, x2: 0, y2: 1 }), { rx: 8 * u }) + rect(-16 * u, -20 * u, 32 * u, 10 * u, e.tint('#e2a21a'), { rx: 4 * u }), { transform: `translate(${n1(x)} ${n1(y)}) rotate(${ang || -8})` });
}
function carLift(e, o) {
  let s = rect(0, 0, e.w, e.h, e.lin([[0, e.tint('#3a3d42')], [1, e.tint('#1d1e20')]], { x1: 0, y1: 0, x2: 0, y2: 1 })) + rect(0, e.h * 0.8, e.w, e.h * 0.2, e.tint('#4a4d52'));
  for (let i = 0; i < 6; i++) s += rect(e.w * (0.05 + i * 0.16), e.h * 0.08, e.w * 0.12, e.h * 0.03, '#f6f3e8', { opacity: 0.85 });
  // pegboard of tools
  s += rect(e.w * 0.06, e.h * 0.18, e.w * 0.28, e.h * 0.3, '#6a6f75'); for (let i = 0; i < 5; i++) s += line(e.w * (0.09 + i * 0.05), e.h * 0.22, e.w * (0.09 + i * 0.05), e.h * (0.3 + (i % 2) * 0.06), '#c9ccd1', 3 * e.s);
  [0.3, 0.7].forEach(f => { s += rect(e.w * f - e.w * 0.02, e.h * 0.28, e.w * 0.04, e.h * 0.52, e.lin([[0, '#e2a21a'], [1, '#9a6a0f']])); });
  s += car(e, e.cx, e.h * 0.5, e.w * 0.62, (o && o.colour) || '#b9bec4', {}) + rect(e.w * 0.26, e.h * 0.5, e.w * 0.48, e.h * 0.02, '#e2a21a');
  return s;
}
function engineParts(e, x, y, W) {
  let s = e.shadow(x, y + W * 0.3, W * 0.6, W * 0.06, 0.3);
  const gear = (gx, gy, r, teeth) => { let d = ''; for (let i = 0; i < teeth * 2; i++) { const a = i / (teeth * 2) * Math.PI * 2; const rr = i % 2 ? r : r * 1.18; d += `${i ? 'L' : 'M'}${n1(gx + Math.cos(a) * rr)} ${n1(gy + Math.sin(a) * rr)} `; } return path(d + 'Z', e.lin([[0, '#eceef0'], [1, '#6a7178']], { x1: 0, y1: 0, x2: 1, y2: 1 })) + circ(gx, gy, r * 0.35, '#3a3d42'); };
  s += gear(x - W * 0.2, y, W * 0.16, 14) + gear(x + W * 0.05, y - W * 0.12, W * 0.09, 10);
  s += g(rect(-W * 0.02, -W * 0.14, W * 0.04, W * 0.1, '#c9ccd1') + rect(-W * 0.035, -W * 0.04, W * 0.07, W * 0.08, '#f4f1ec', { rx: 2 * e.s }) + rect(-W * 0.03, W * 0.04, W * 0.06, W * 0.06, e.lin([[0, '#eceef0'], [1, '#7d848b']])) + line(0, W * 0.1, 0, W * 0.16, '#9aa0a6', 2 * e.s), { transform: `translate(${n1(x + W * 0.3)} ${n1(y - W * 0.02)}) rotate(20)` });
  s += g(rect(0, -W * 0.02, W * 0.4, W * 0.04, e.lin([[0, '#e1e4e7'], [1, '#7d848b']], { x1: 0, y1: 0, x2: 0, y2: 1 }), { rx: W * 0.02 }) + circ(W * 0.42, 0, W * 0.05, 'none', { stroke: '#a9aeb3', 'stroke-width': n1(W * 0.02) }), { transform: `translate(${n1(x - W * 0.35)} ${n1(y + W * 0.2)}) rotate(-6)` });
  return s;
}
// ---- everyday subjects for unusual businesses --------------------------------------------------------------------------
function dog(e, x, baseY, H, c) {
  const col = e.tint(c || '#c98a4a'); const fur = e.rad([[0, lighten(col, 0.25)], [1, darken(col, 0.25)]], { cx: 0.4, cy: 0.3 }); const u = H / 100; let s = e.shadow(x, baseY, H * 0.4, H * 0.05, 0.3);
  s += ell(x + 4 * u, baseY - 30 * u, 26 * u, 30 * u, fur) + ell(x - 12 * u, baseY - 6 * u, 12 * u, 7 * u, darken(col, 0.1)) + ell(x + 20 * u, baseY - 6 * u, 12 * u, 7 * u, darken(col, 0.1));
  s += path(`M${n1(x + 26 * u)} ${n1(baseY - 20 * u)} Q${n1(x + 46 * u)} ${n1(baseY - 30 * u)} ${n1(x + 42 * u)} ${n1(baseY - 48 * u)}`, 'none', { stroke: col, 'stroke-width': n1(6 * u), 'stroke-linecap': 'round' });
  s += circ(x - 6 * u, baseY - 66 * u, 20 * u, fur) + ell(x - 20 * u, baseY - 60 * u, 12 * u, 9 * u, lighten(col, 0.15)) + circ(x - 30 * u, baseY - 62 * u, 4 * u, '#2a1d15');
  s += path(`M${n1(x + 4 * u)} ${n1(baseY - 82 * u)} Q${n1(x + 18 * u)} ${n1(baseY - 78 * u)} ${n1(x + 14 * u)} ${n1(baseY - 56 * u)} Q${n1(x + 6 * u)} ${n1(baseY - 66 * u)} ${n1(x + 4 * u)} ${n1(baseY - 82 * u)} Z`, darken(col, 0.3));
  s += circ(x - 12 * u, baseY - 70 * u, 2.4 * u, '#1d1510') + rect(x - 14 * u, baseY - 48 * u, 24 * u, 5 * u, e.accent, { rx: 2 * u }) + circ(x - 2 * u, baseY - 42 * u, 3 * u, '#e0b44a');
  return s;
}
function bouquet(e, x, baseY, H) {
  const R = rng(hashStr(`bq${x}`)); let s = e.shadow(x, baseY, H * 0.2, H * 0.03, 0.25);
  for (let i = 0; i < 9; i++) s += line(x + (R() - 0.5) * H * 0.08, baseY - H * 0.1, x + (R() - 0.5) * H * 0.5, baseY - H * (0.55 + R() * 0.2), e.tint('#5f8a4a'), 1.6 * e.s);
  for (let i = 0; i < 8; i++) s += A.leaf(e, x + (R() - 0.5) * H * 0.3, baseY - H * (0.45 + R() * 0.2), H * 0.16, R() * 360);
  const cols = ['#f4a3b4', '#f8e1c4', '#e76f51', '#fbf7f0', '#c9a7e8'];
  for (let i = 0; i < 9; i++) { const fx = x + (R() - 0.5) * H * 0.5, fy = baseY - H * (0.6 + R() * 0.28), fr = H * (0.05 + R() * 0.03), c = e.tint(cols[i % cols.length]); for (let p = 0; p < 6; p++) { const a = p / 6 * Math.PI * 2; s += circ(fx + Math.cos(a) * fr * 0.6, fy + Math.sin(a) * fr * 0.6, fr * 0.62, c); } s += circ(fx, fy, fr * 0.4, darken(c, 0.25)); }
  s += path(P([[x - H * 0.16, baseY - H * 0.44], [x + H * 0.16, baseY - H * 0.44], [x + H * 0.05, baseY], [x - H * 0.05, baseY]]), e.lin([[0, '#efe6d6'], [1, '#c9b89a']]));
  return s + rect(x - H * 0.1, baseY - H * 0.22, H * 0.2, H * 0.04, e.accent, { rx: H * 0.01 });
}
function stationery(e, x, y, W, o) {
  const k = o || {}; let s = '';
  s += paper(e, x - W * 0.2, y + W * 0.05, W * 0.5, W * 0.36, -8, { lines: 0 }) + g(rect(-W * 0.27, -W * 0.19, W * 0.54, W * 0.38, '#fbf8f1', { stroke: '#e3dac8', 'stroke-width': n1(1 * e.s) }) + path(`M${n1(-W * 0.27)} ${n1(-W * 0.19)} L0 ${n1(W * 0.04)} L${n1(W * 0.27)} ${n1(-W * 0.19)}`, 'none', { stroke: '#e3dac8', 'stroke-width': n1(1.2 * e.s) }) + circ(0, W * 0.04, W * 0.05, e.tint(k.seal || '#9b2c3a')) + circ(0, W * 0.04, W * 0.03, darken(e.tint(k.seal || '#9b2c3a'), 0.2)), { transform: `translate(${n1(x - W * 0.12)} ${n1(y + W * 0.08)}) rotate(-8)` });
  const card = rect(-W * 0.2, -W * 0.28, W * 0.4, W * 0.56, '#fdfbf6', { stroke: '#e8e0cf', 'stroke-width': n1(1 * e.s) }) + A.wordmark(e, k.title || '&', 0, -W * 0.08, W * 0.1, darken(e.accent, 0.25), { serif: true, weight: 500 }) + line(-W * 0.12, W * 0.02, W * 0.12, W * 0.02, '#c8bca6', 1 * e.s) + rect(-W * 0.12, W * 0.07, W * 0.24, 2.4 * e.s, '#cfc6b4') + rect(-W * 0.09, W * 0.12, W * 0.18, 2.4 * e.s, '#cfc6b4') + A.sprig(e, -W * 0.14, W * 0.24, W * 0.14, -20, e.tint('#8aa46a'));
  s += e.shadow(x + W * 0.2, y + W * 0.32, W * 0.2, W * 0.03, 0.25) + g(card, { transform: `translate(${n1(x + W * 0.18)} ${n1(y)}) rotate(6)` });
  return s;
}
function movingBoxes(e, x, baseY, W) {
  const kraft = e.tint('#c9a26f'); const box = (bx, by, w, h) => rect(bx, by - h, w, h, e.lin([[0, lighten(kraft, 0.12)], [1, darken(kraft, 0.18)]], { x1: 0, y1: 0, x2: 0.4, y2: 1 })) + rect(bx + w * 0.44, by - h, w * 0.12, h, '#b89066', { opacity: 0.7 }) + rect(bx + w * 0.1, by - h * 0.4, w * 0.25, h * 0.14, '#f4efe4') + line(bx + w * 0.12, by - h * 0.33, bx + w * 0.3, by - h * 0.33, '#8a7a66', 1 * e.s);
  return e.shadow(x, baseY, W * 0.6, W * 0.05, 0.3) + box(x - W * 0.5, baseY, W * 0.5, W * 0.36) + box(x + W * 0.02, baseY, W * 0.44, W * 0.3) + box(x - W * 0.36, baseY - W * 0.36, W * 0.4, W * 0.3);
}
function stringLights(e, y, n) {
  let s = path(`M0 ${n1(y)} Q${n1(e.w / 2)} ${n1(y + e.h * 0.12)} ${n1(e.w)} ${n1(y)}`, 'none', { stroke: '#2a2724', 'stroke-width': n1(1.4 * e.s) });
  for (let i = 1; i < (n || 12); i++) { const t = i / (n || 12); const px = e.w * t, py = y + e.h * 0.12 * 4 * t * (1 - t) * 0.5 + 4 * e.s; s += circ(px, py, 4 * e.s, '#ffe7a8') + circ(px, py, 14 * e.s, '#ffd98a', { opacity: 0.2 }); }
  return s;
}
function suitcase(e, x, baseY, H, c) { const col = e.tint(c || e.accent); return e.shadow(x, baseY, H * 0.4, H * 0.05, 0.3) + rect(x - H * 0.3, baseY - H * 0.8, H * 0.6, H * 0.76, e.lin([[0, lighten(col, 0.2)], [1, darken(col, 0.25)]]), { rx: H * 0.06 }) + [-0.15, 0, 0.15].map(f => line(x + f * H, baseY - H * 0.76, x + f * H, baseY - H * 0.08, darken(col, 0.2), 2 * e.s)).join('') + path(`M${n1(x - H * 0.1)} ${n1(baseY - H * 0.8)} L${n1(x - H * 0.1)} ${n1(baseY - H)} L${n1(x + H * 0.1)} ${n1(baseY - H)} L${n1(x + H * 0.1)} ${n1(baseY - H * 0.8)}`, 'none', { stroke: '#3a3d42', 'stroke-width': n1(4 * e.s) }) + circ(x - H * 0.2, baseY - 2 * e.s, H * 0.04, '#222') + circ(x + H * 0.2, baseY - 2 * e.s, H * 0.04, '#222'); }
function guitar(e, x, y, H, c) {
  const col = e.tint(c || '#c98a44'); let s = e.shadow(x, y + H * 0.5, H * 0.3, H * 0.05, 0.3);
  s += g(ell(0, H * 0.22, H * 0.2, H * 0.22, e.rad([[0, lighten(col, 0.3)], [1, darken(col, 0.3)]], { cx: 0.4, cy: 0.35 })) + ell(0, -H * 0.04, H * 0.15, H * 0.15, e.rad([[0, lighten(col, 0.3)], [1, darken(col, 0.3)]], { cx: 0.4, cy: 0.35 })) + circ(0, H * 0.08, H * 0.06, '#2a1d15') + rect(-H * 0.03, -H * 0.62, H * 0.06, H * 0.62, '#4a2e1c') + rect(-H * 0.045, -H * 0.72, H * 0.09, H * 0.12, '#3a2418', { rx: 2 * e.s }) + rect(-H * 0.07, H * 0.26, H * 0.14, H * 0.03, '#2a1d15') + [-0.015, 0, 0.015].map(f => line(f * H, -H * 0.7, f * H * 2, H * 0.27, '#e9e4da', 0.8 * e.s)).join(''), { transform: `translate(${n1(x)} ${n1(y)}) rotate(-24)` });
  return s;
}
function sewingMachine(e, x, baseY, W) {
  const body = e.tint('#f1ebe1'); let s = e.shadow(x, baseY, W * 0.55, W * 0.05, 0.3) + rect(x - W / 2, baseY - W * 0.1, W, W * 0.1, e.lin([[0, lighten(body, 0.1)], [1, darken(body, 0.15)]], { x1: 0, y1: 0, x2: 0, y2: 1 }), { rx: W * 0.02 });
  s += rect(x + W * 0.22, baseY - W * 0.52, W * 0.2, W * 0.42, e.lin([[0, lighten(body, 0.12)], [1, darken(body, 0.15)]]), { rx: W * 0.04 }) + rect(x - W * 0.4, baseY - W * 0.52, W * 0.82, W * 0.14, e.lin([[0, lighten(body, 0.15)], [1, darken(body, 0.12)]], { x1: 0, y1: 0, x2: 0, y2: 1 }), { rx: W * 0.05 });
  s += rect(x - W * 0.4, baseY - W * 0.38, W * 0.1, W * 0.16, darken(body, 0.05), { rx: W * 0.02 }) + line(x - W * 0.35, baseY - W * 0.22, x - W * 0.35, baseY - W * 0.12, '#9aa0a6', 1.6 * e.s);
  s += rect(x - W * 0.1, baseY - W * 0.66, W * 0.05, W * 0.14, e.cyl(e.tint('#c0392b'))) + circ(x + W * 0.46, baseY - W * 0.36, W * 0.08, '#b9bec4') + rect(x - W * 0.3, baseY - W * 0.5, W * 0.4, W * 0.04, e.accent, { rx: W * 0.02, opacity: 0.8 });
  return s + path(`M${n1(x - W * 0.5)} ${n1(baseY - W * 0.1)} Q${n1(x - W * 0.2)} ${n1(baseY - W * 0.2)} ${n1(x + W * 0.3)} ${n1(baseY - W * 0.1)}`, e.tint('#b8d4e6'), { opacity: 0.9 });
}
function fishingGear(e, x, y, W) {
  let s = e.shadow(x, y + W * 0.2, W * 0.6, W * 0.05, 0.3);
  s += line(x - W * 0.5, y + W * 0.1, x + W * 0.5, y - W * 0.5, '#2d2a27', 3 * e.s) + line(x + W * 0.5, y - W * 0.5, x + W * 0.52, y + W * 0.2, '#e9e4da', 0.8 * e.s) + circ(x - W * 0.3, y + W * 0.02, W * 0.07, e.lin([[0, '#eceef0'], [1, '#6a7178']])) + circ(x - W * 0.3, y + W * 0.02, W * 0.03, '#2d2a27');
  s += rect(x - W * 0.1, y + W * 0.02, W * 0.5, W * 0.2, e.lin([[0, '#3f7a4a'], [1, '#234a2c']], { x1: 0, y1: 0, x2: 0, y2: 1 }), { rx: 4 * e.s }) + rect(x - W * 0.1, y + W * 0.02, W * 0.5, W * 0.05, '#2d5a36', { rx: 4 * e.s }) + [0, 1, 2].map(i => ell(x + W * (0.02 + i * 0.12), y + W * 0.12, W * 0.04, W * 0.015, ['#e0b44a', '#e05a47', '#6cbf9a'][i])).join('');
  return s;
}

module.exports = {
  hanger, hoodie, tee, jeansStack, sneaker, cap, dressForm, ring, weave, clothingRail,
  latteTop, pourOver, roasterDrum, croissant, loaf, cake, plate, halfEgg, beerTaps,
  camera, softbox, prints, swatchFan, moodboard, sketchbook,
  glove, heavyBag, wraps, kettlebell, dumbbell, barbell,
  stones, towelRoll, needles, scissorsComb, nailPolish, tooth, band,
  paper, pen, calculator, stickyWall, keysOnTag,
  car, rim, polisher, carLift, engineParts,
  dog, bouquet, stationery, movingBoxes, stringLights, suitcase, guitar, sewingMachine, fishingGear,
};
