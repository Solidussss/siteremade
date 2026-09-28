'use strict';
// HERO ART -- exteriors: lawns and gardens, hardscape, houses and roofs, streets,
// water. Built on the kit in ./hero-art (same palette, light and shadow).
const A = require('./hero-art');
const { mix, lighten, darken, rng, hashStr } = A;
const { rect, circ, ell, path, line, g, P, n1 } = A._svg;

const GRASS = '#5d8f3e';
// ---- planting -----------------------------------------------------------------------------------------------------
function shrub(e, x, y, r, c, o) {
  const k = o || {}; const col = e.tint(c || '#4f7d3a'); const R = rng(hashStr(`sh${x}${y}${r}`));
  let s = e.shadow(x + r * 0.2, y + r * 0.1, r * 1.1, r * 0.25, 0.25);
  const blobs = k.clipped ? [[0, -0.45, 0.95]] : [[-0.45, -0.3, 0.6], [0.4, -0.35, 0.62], [0, -0.7, 0.66], [-0.1, -0.2, 0.7], [0.55, -0.1, 0.45], [-0.6, -0.05, 0.45]];
  blobs.forEach(([dx, dy, rr]) => { s += circ(x + dx * r, y + dy * r, rr * r, e.rad([[0, lighten(col, 0.25)], [0.6, col], [1, darken(col, 0.3)]], { cx: 0.35, cy: 0.3, r: 0.7 })); });
  if (k.clipped) s = e.shadow(x + r * 0.2, y + r * 0.1, r * 1.1, r * 0.25, 0.25) + rect(x - r, y - r * 1.2, r * 2, r * 1.2, e.lin([[0, lighten(col, 0.2)], [1, darken(col, 0.25)]], { x1: 0, y1: 0, x2: 0.3, y2: 1 }), { rx: r * 0.25 });
  for (let i = 0; i < (k.clipped ? 30 : 18); i++) s += circ(x + (R() - 0.5) * r * 1.8, y - R() * r * (k.clipped ? 1.1 : 1.2), (1 + R() * 1.6) * e.s, lighten(col, 0.35), { opacity: 0.55 });
  if (k.flowers) for (let i = 0; i < 12; i++) s += circ(x + (R() - 0.5) * r * 1.5, y - (0.3 + R() * 0.8) * r, (2 + R() * 2) * e.s, k.flowers, { opacity: 0.95 });
  return s;
}
function grasses(e, x, y, h, c) {
  const col = e.tint(c || '#a9a36a'); const R = rng(hashStr(`gr${x}${y}`)); let s = '';
  for (let i = 0; i < 16; i++) { const a = -1.1 + R() * 2.2; const tx = x + Math.sin(a) * h * 0.7, ty = y - Math.cos(a) * h * (0.7 + R() * 0.3); s += path(`M${n1(x + (R() - 0.5) * 6 * e.s)} ${n1(y)} Q${n1(x + Math.sin(a) * h * 0.2)} ${n1(y - h * 0.5)} ${n1(tx)} ${n1(ty)}`, 'none', { stroke: i % 3 ? col : lighten(col, 0.25), 'stroke-width': n1(1.8 * e.s), 'stroke-linecap': 'round' }); if (i % 3 === 0) s += ell(tx, ty, 2.5 * e.s, 6 * e.s, lighten(col, 0.4), { transform: `rotate(${n1(a * 57)} ${n1(tx)} ${n1(ty)})` }); }
  return s;
}
function perennial(e, x, y, h, flower) {
  const R = rng(hashStr(`pe${x}${y}`)); let s = '';
  for (let i = 0; i < 7; i++) { const a = (R() - 0.5) * 0.9; const tx = x + Math.sin(a) * h * 0.6, ty = y - h * (0.6 + R() * 0.4); s += line(x, y, tx, ty, e.tint('#4f7a3a'), 1.4 * e.s); s += circ(tx, ty, (3 + R() * 2.5) * e.s, flower); }
  for (let i = 0; i < 4; i++) s += A.leaf(e, x, y - 2 * e.s, h * 0.35, -150 + i * 40);
  return s;
}
function tree(e, x, y, h, o) {
  const k = o || {}; const c = e.tint(k.colour || '#4c7a3c');
  let s = e.shadow(x + h * 0.15, y, h * 0.35, h * 0.06, 0.3) + rect(x - h * 0.03, y - h * 0.42, h * 0.06, h * 0.42, e.cyl('#6b4a33'));
  [[0, -0.62, 0.3], [-0.2, -0.5, 0.22], [0.2, -0.52, 0.22], [0, -0.82, 0.22], [-0.12, -0.72, 0.2], [0.14, -0.72, 0.2]].forEach(([dx, dy, rr]) => { s += circ(x + dx * h, y + dy * h, rr * h, e.rad([[0, lighten(c, 0.22)], [0.7, c], [1, darken(c, 0.28)]], { cx: 0.35, cy: 0.3, r: 0.75 })); });
  return s;
}
// ---- ground ------------------------------------------------------------------------------------------------------
// perspective lawn stripes from the horizon to the bottom edge
function lawn(e, hz, o) {
  const k = o || {}; const base = e.tint(k.colour || GRASS); let s = rect(0, hz, e.w, e.h - hz, e.lin([[0, darken(base, 0.08)], [1, darken(base, 0.18)]], { x1: 0, y1: 0, x2: 0, y2: 1 }));
  if (k.stripes !== false) {
    const n = 9; const vx = k.vx == null ? e.cx : k.vx;
    for (let i = 0; i < n; i++) {
      if (i % 2) continue;
      const x0 = -e.w * 0.6 + i * (e.w * 2.2 / n), x1 = x0 + e.w * 2.2 / n;
      const top = t => vx + (t - vx) * 0.18;
      s += path(P([[top(x0), hz], [top(x1), hz], [x1, e.h], [x0, e.h]]), lighten(base, 0.12), { opacity: 0.55 });
    }
  }
  const R = rng(hashStr(`lawn${hz}`));
  for (let i = 0; i < (e.detail === 'simple' ? 30 : 90); i++) { const y = hz + Math.pow(R(), 0.7) * (e.h - hz); const x = R() * e.w; const len = (2 + (y - hz) / (e.h - hz) * 7) * e.s; s += line(x, y, x + (R() - 0.5) * 2 * e.s, y - len, lighten(base, 0.2 + R() * 0.15), 1 * e.s, { opacity: 0.6 }); }
  return s;
}
// a paved area as a perspective trapezoid [[x,y] bottom-left, bottom-right, top-right, top-left]
function pavers(e, quad, colour, o) {
  const k = o || {}; const c = e.tint(colour || '#c9b8a0'); const [bl, br, tr, tl] = quad; const R = rng(hashStr(`pv${bl}${tr}`));
  let s = path(P(quad), darken(c, 0.28));
  const rows = k.rows || 8, cols = k.cols || 7;
  const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  for (let r = 0; r < rows; r++) {
    const t0 = Math.pow(r / rows, 1.35), t1 = Math.pow((r + 1) / rows, 1.35);
    const L0 = lerp(tl, bl, t0), R0 = lerp(tr, br, t0), L1 = lerp(tl, bl, t1), R1 = lerp(tr, br, t1);
    const off = k.flag ? 0 : (r % 2) * 0.5;
    for (let q = -1; q < cols; q++) {
      const a0 = (q + off) / cols, a1 = (q + 1 + off) / cols; if (a1 <= 0 || a0 >= 1) continue;
      const u0 = Math.max(0, a0), u1 = Math.min(1, a1); const gap = 0.012;
      const p1 = lerp(L0, R0, u0 + gap), p2 = lerp(L0, R0, u1 - gap), p3 = lerp(L1, R1, u1 - gap), p4 = lerp(L1, R1, u0 + gap);
      const inset = (p, q2, t) => lerp(p, q2, t);
      const tone = k.flag ? mix(c, R() > 0.5 ? '#8f8a80' : '#d8cdb8', R() * 0.5) : mix(c, darken(c, 0.2), R() * 0.6);
      s += path(P([inset(p1, p4, 0.06), inset(p2, p3, 0.06), inset(p3, p2, 0.06), inset(p4, p1, 0.06)]), e.lin([[0, lighten(tone, 0.12)], [1, darken(tone, 0.06)]], { x1: 0, y1: 0, x2: 0.3, y2: 1 }));
    }
  }
  return s;
}
// a dry-stacked block wall: rows of stones from (x,y) width w height h
function stoneWall(e, x, y, w, h, colour, o) {
  const k = o || {}; const c = e.tint(colour || '#b3a590'); const R = rng(hashStr(`sw${x}${y}${w}`)); let s = rect(x, y, w, h, darken(c, 0.35));
  const rows = k.rows || 4, rh = h / rows;
  for (let r = 0; r < rows; r++) {
    let cx = x - (r % 2) * rh * 0.8;
    while (cx < x + w) {
      const bw = rh * (1.4 + R() * 1.2); const x0 = Math.max(x, cx), x1 = Math.min(x + w, cx + bw);
      if (x1 - x0 > 4) { const tone = mix(c, R() > 0.5 ? lighten(c, 0.2) : darken(c, 0.18), R() * 0.7); s += rect(x0 + 1.5 * e.s, y + r * rh + 1.5 * e.s, x1 - x0 - 3 * e.s, rh - 3 * e.s, e.lin([[0, lighten(tone, 0.15)], [1, darken(tone, 0.12)]], { x1: 0, y1: 0, x2: 0, y2: 1 }), { rx: 3 * e.s }); s += line(x0 + 3 * e.s, y + r * rh + 3 * e.s, x1 - 4 * e.s, y + r * rh + 3 * e.s, '#fff', 1.1 * e.s, { opacity: 0.25 }); }
      cx += bw;
    }
  }
  if (k.cap) s += rect(x - 4 * e.s, y - rh * 0.4, w + 8 * e.s, rh * 0.45, e.lin([[0, lighten(c, 0.2)], [1, darken(c, 0.1)]], { x1: 0, y1: 0, x2: 0, y2: 1 }), { rx: 2 * e.s });
  return s;
}
function mulchBed(e, x, y, w, h) {
  const c = e.tint('#5a3a24'); const R = rng(hashStr(`mu${x}${y}`)); let s = ell(x + w / 2, y + h / 2, w / 2, h / 2, c);
  for (let i = 0; i < 70; i++) { const a = R() * Math.PI * 2, d = Math.sqrt(R()); s += ell(x + w / 2 + Math.cos(a) * d * w * 0.46, y + h / 2 + Math.sin(a) * d * h * 0.44, (2 + R() * 3) * e.s, (1 + R()) * e.s, R() > 0.5 ? darken(c, 0.25) : lighten(c, 0.15), { transform: `rotate(${n1(R() * 180)} ${n1(x + w / 2)} ${n1(y + h / 2)})` }); }
  return s;
}
// ---- buildings -------------------------------------------------------------------------------------------------
// a house front: gable roof with shingles, siding, windows, door, porch light
function house(e, x, baseY, W0, o) {
  // never taller than the space above its ground line: the roof is the subject, it must stay in frame
  const k = o || {}; const W = Math.min(W0, Math.max(40, (baseY - e.h * 0.05) / ((k.tall ? 0.6 : 0.46) + 0.32))); const H = W * (k.tall ? 0.6 : 0.46); const top = baseY - H; const roofH = W * 0.3;
  const siding = e.tint(k.siding || '#e8e1d4'), roofC = e.tint(k.roof || '#4a4a52'), trim = '#f7f4ee';
  const lit = k.time === 'dusk' || k.time === 'night';
  let s = e.shadow(x + W * 0.1, baseY + 4 * e.s, W * 0.62, W * 0.05, 0.35);
  s += rect(x - W / 2, top, W, H, e.lin([[0, lighten(siding, 0.05)], [1, darken(siding, lit ? 0.35 : 0.12)]], { x1: 0, y1: 0, x2: 0.8, y2: 1 }));
  for (let yy = top + 7 * e.s; yy < baseY; yy += 7 * e.s) s += line(x - W / 2, yy, x + W / 2, yy, darken(siding, 0.14), 0.8 * e.s, { opacity: 0.6 });
  if (k.chimney) s += rect(x + W * 0.22, top - roofH * 0.9, W * 0.07, roofH * 0.7, e.cyl('#8a4c3a'));
  // roof with shingle rows
  const eave = W * 0.06; const roof = [[x - W / 2 - eave, top + 2 * e.s], [x + W / 2 + eave, top + 2 * e.s], [x + W * 0.1, top - roofH], [x - W * 0.1, top - roofH]];
  s += path(P(roof), e.lin([[0, lighten(roofC, 0.15)], [1, darken(roofC, 0.2)]], { x1: 0, y1: 0, x2: 0, y2: 1 }));
  const rows = 9; for (let i = 1; i < rows; i++) { const t = i / rows; const yy = top - roofH + roofH * t; const half = (W * 0.1) + (W / 2 + eave - W * 0.1) * t; s += line(x - half, yy, x + half, yy, darken(roofC, 0.35), 1 * e.s, { opacity: 0.7 }); for (let q = -half + ((i % 2) * 6 * e.s); q < half; q += 12 * e.s) s += line(x + q, yy - roofH / rows, x + q, yy, darken(roofC, 0.3), 0.6 * e.s, { opacity: 0.45 }); }
  s += rect(x - W / 2 - eave, top, W + eave * 2, 4 * e.s, trim);
  // gable window
  s += rect(x - W * 0.05, top - roofH * 0.55, W * 0.1, roofH * 0.34, lit ? '#ffcf7a' : e.tint('#9fb7c7'), { rx: 1.5 * e.s, stroke: trim, 'stroke-width': n1(2.5 * e.s) });
  // windows + door
  const win = (wx, wy, ww, wh) => rect(wx, wy, ww, wh, lit ? e.lin([[0, '#ffe2a3'], [1, '#f2a948']], { x1: 0, y1: 0, x2: 0, y2: 1 }) : e.lin([[0, '#b9d2e2'], [1, '#e9f1f4']], { x1: 0, y1: 0, x2: 0.3, y2: 1 }), { stroke: trim, 'stroke-width': n1(3 * e.s) }) + line(wx + ww / 2, wy, wx + ww / 2, wy + wh, trim, 2 * e.s) + line(wx, wy + wh / 2, wx + ww, wy + wh / 2, trim, 2 * e.s) + (lit ? path(P([[wx, wy + wh], [wx + ww, wy + wh], [wx + ww * 1.3, baseY + H * 0.3], [wx - ww * 0.3, baseY + H * 0.3]]), '#ffd98a', { opacity: 0.12 }) : '');
  s += win(x - W * 0.4, top + H * 0.22, W * 0.16, H * 0.36) + win(x + W * 0.24, top + H * 0.22, W * 0.16, H * 0.36);
  s += rect(x - W * 0.06, top + H * 0.32, W * 0.12, H * 0.68, e.lin([[0, darken(k.door || e.accent, 0.05)], [1, darken(k.door || e.accent, 0.35)]], { x1: 0, y1: 0, x2: 0, y2: 1 }), { stroke: trim, 'stroke-width': n1(2.5 * e.s) }) + circ(x + W * 0.035, top + H * 0.68, 1.8 * e.s, '#d8c28a');
  if (lit) s += circ(x + W * 0.09, top + H * 0.45, 3 * e.s, '#ffe7a8') + circ(x + W * 0.09, top + H * 0.45, 14 * e.s, '#ffd98a', { opacity: 0.25 });
  s += rect(x - W * 0.12, baseY - 3 * e.s, W * 0.24, 6 * e.s, lighten(siding, 0.2));
  return s;
}
// a close view of new architectural shingles with a line of flashing
function shingleField(e, x, y, w, h, colour, o) {
  const k = o || {}; const c = e.tint(colour || '#55565e'); const R = rng(hashStr(`shf${x}${y}`)); const rh = (k.rowH || 26) * e.s; let s = rect(x, y, w, h, darken(c, 0.3));
  for (let r = 0; r * rh < h + rh; r++) {
    const yy = y + r * rh; let cx = x - ((r * 17) % 40) * e.s;
    while (cx < x + w) { const tw = (26 + R() * 22) * e.s; const tone = mix(c, R() > 0.5 ? lighten(c, 0.18) : darken(c, 0.2), R()); s += rect(cx + 1, yy, tw - 2, rh * 1.05, e.lin([[0, lighten(tone, 0.1)], [1, darken(tone, 0.15)]], { x1: 0, y1: 0, x2: 0, y2: 1 })); for (let q = 0; q < 6; q++) s += circ(cx + R() * tw, yy + R() * rh, 0.8 * e.s, lighten(tone, 0.3), { opacity: 0.5 }); cx += tw; }
    s += rect(x, yy + rh - 2 * e.s, w, 3 * e.s, darken(c, 0.4), { opacity: 0.5 });
  }
  return s;
}
function ladder(e, x1, y1, x2, y2, w) {
  const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy), nx = -dy / len * w / 2, ny = dx / len * w / 2; const c = '#c9ccd1'; let s = '';
  s += line(x1 + nx, y1 + ny, x2 + nx, y2 + ny, c, 4 * e.s) + line(x1 - nx, y1 - ny, x2 - nx, y2 - ny, darken(c, 0.15), 4 * e.s);
  for (let t = 0.08; t < 1; t += 0.1) s += line(x1 + dx * t + nx, y1 + dy * t + ny, x1 + dx * t - nx, y1 + dy * t - ny, darken(c, 0.1), 2.6 * e.s);
  return s;
}
// ---- equipment -------------------------------------------------------------------------------------------------
// a walk-behind mower in 3/4 side view facing left, `c` body colour
function mower(e, x, baseY, L, c) {
  const col = c || '#c8402f'; const u = L / 100; let s = e.shadow(x, baseY + 2 * u, L * 0.55, L * 0.07, 0.35);
  const wheel = (wx, r) => circ(wx, baseY - r, r, '#232323') + circ(wx, baseY - r, r * 0.55, '#7d7f84') + circ(wx, baseY - r, r * 0.2, '#c9ccd1');
  // grass bag at the back
  s += path(`M${n1(x + 22 * u)} ${n1(baseY - 30 * u)} L${n1(x + 58 * u)} ${n1(baseY - 38 * u)} Q${n1(x + 66 * u)} ${n1(baseY - 20 * u)} ${n1(x + 56 * u)} ${n1(baseY - 10 * u)} L${n1(x + 24 * u)} ${n1(baseY - 12 * u)} Z`, e.lin([[0, '#5d6066'], [1, '#2e3034']], { x1: 0, y1: 0, x2: 0, y2: 1 }));
  for (let i = 0; i < 5; i++) s += line(x + (28 + i * 6) * u, baseY - 33 * u, x + (27 + i * 6) * u, baseY - 13 * u, '#1f2023', 0.8 * e.s, { opacity: 0.6 });
  // deck
  s += path(`M${n1(x - 46 * u)} ${n1(baseY - 12 * u)} Q${n1(x - 48 * u)} ${n1(baseY - 30 * u)} ${n1(x - 26 * u)} ${n1(baseY - 32 * u)} L${n1(x + 24 * u)} ${n1(baseY - 32 * u)} Q${n1(x + 30 * u)} ${n1(baseY - 30 * u)} ${n1(x + 30 * u)} ${n1(baseY - 20 * u)} L${n1(x + 30 * u)} ${n1(baseY - 10 * u)} Z`, e.lin([[0, lighten(col, 0.25)], [0.4, col], [1, darken(col, 0.35)]], { x1: 0, y1: 0, x2: 0, y2: 1 }));
  s += rect(x - 44 * u, baseY - 14 * u, 72 * u, 4 * u, darken(col, 0.45), { rx: 2 * u });
  // engine
  s += rect(x - 18 * u, baseY - 46 * u, 26 * u, 16 * u, e.lin([[0, '#4a4d52'], [1, '#1f2023']], { x1: 0, y1: 0, x2: 0, y2: 1 }), { rx: 5 * u }) + rect(x - 14 * u, baseY - 52 * u, 18 * u, 8 * u, e.lin([[0, lighten(col, 0.2)], [1, darken(col, 0.2)]], { x1: 0, y1: 0, x2: 0, y2: 1 }), { rx: 3 * u }) + circ(x - 20 * u, baseY - 40 * u, 3 * u, '#d8a33a');
  // handle
  s += path(`M${n1(x + 26 * u)} ${n1(baseY - 26 * u)} L${n1(x + 62 * u)} ${n1(baseY - 84 * u)} L${n1(x + 70 * u)} ${n1(baseY - 84 * u)}`, 'none', { stroke: '#2a2b2e', 'stroke-width': n1(3.2 * u), 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }) + line(x + 58 * u, baseY - 78 * u, x + 64 * u, baseY - 82 * u, '#d0d2d6', 5 * u);
  s += wheel(x - 34 * u, 10 * u) + wheel(x + 20 * u, 12 * u);
  return s;
}
// string trimmer head at an edge, clippings flying
function trimmer(e, x, y, L, ang) {
  const u = L / 100; const a = (ang == null ? -58 : ang) * Math.PI / 180; const ex = x + Math.cos(a) * L, ey = y + Math.sin(a) * L; let s = '';
  s += line(x, y, ex, ey, '#c9ccd1', 3.4 * u) + line(x, y, ex, ey, '#8b8f95', 1.2 * u, { opacity: 0.6 });
  s += rect(ex - 8 * u, ey - 8 * u, 16 * u, 22 * u, e.lin([[0, '#f07a2b'], [1, '#b8501a']], { x1: 0, y1: 0, x2: 1, y2: 1 }), { rx: 5 * u, transform: `rotate(${n1(ang == null ? 32 : ang + 90)} ${n1(ex)} ${n1(ey)})` });
  s += path(`M${n1(x + Math.cos(a) * L * 0.55 - 6 * u)} ${n1(y + Math.sin(a) * L * 0.55)} l${n1(12 * u)} ${n1(-4 * u)}`, 'none', { stroke: '#1f2023', 'stroke-width': n1(6 * u), 'stroke-linecap': 'round' });
  s += ell(x, y, 16 * u, 5 * u, '#2d2f33', { opacity: 0.85 }) + ell(x, y, 22 * u, 7 * u, 'none', { stroke: '#fff', 'stroke-width': n1(0.8 * u), opacity: 0.35, 'stroke-dasharray': `${n1(3 * u)} ${n1(4 * u)}` });
  const R = rng(hashStr(`clip${x}${y}`)); for (let i = 0; i < 24; i++) { const cx = x + (R() - 0.3) * 60 * u, cy = y - R() * 30 * u; s += line(cx, cy, cx + (R() - 0.5) * 5 * u, cy - 3 * u, e.tint('#7fb35a'), 1.2 * u, { opacity: 0.8 }); }
  return s;
}
// a walk-behind core aerator: spiked drum, weight box, handle -- facing left, like the mower
function aerator(e, x, baseY, L, c) {
  const col = c || '#2f7a4a'; const u = L / 100; let s = e.shadow(x, baseY + 2 * u, L * 0.5, L * 0.06, 0.35);
  s += rect(x - 30 * u, baseY - 44 * u, 56 * u, 22 * u, e.lin([[0, lighten(col, 0.25)], [1, darken(col, 0.3)]], { x1: 0, y1: 0, x2: 0, y2: 1 }), { rx: 5 * u });
  s += rect(x - 26 * u, baseY - 54 * u, 30 * u, 12 * u, e.lin([[0, '#4a4d52'], [1, '#1f2023']], { x1: 0, y1: 0, x2: 0, y2: 1 }), { rx: 3 * u });
  // the tine drum
  s += circ(x - 14 * u, baseY - 14 * u, 14 * u, e.lin([[0, '#b9bec4'], [1, '#6a7076']], { x1: 0, y1: 0, x2: 1, y2: 1 }));
  for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2; s += line(x - 14 * u + Math.cos(a) * 14 * u, baseY - 14 * u + Math.sin(a) * 14 * u, x - 14 * u + Math.cos(a) * 20 * u, baseY - 14 * u + Math.sin(a) * 20 * u, '#8b9096', 2.4 * u); }
  s += circ(x - 14 * u, baseY - 14 * u, 4 * u, '#3a3d42') + circ(x + 20 * u, baseY - 9 * u, 9 * u, '#232323') + circ(x + 20 * u, baseY - 9 * u, 4 * u, '#9aa0a6');
  s += path(`M${n1(x + 22 * u)} ${n1(baseY - 40 * u)} L${n1(x + 56 * u)} ${n1(baseY - 88 * u)} L${n1(x + 64 * u)} ${n1(baseY - 88 * u)}`, 'none', { stroke: '#2a2b2e', 'stroke-width': n1(3.2 * u), 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
  return s;
}
// soil cores pulled from the lawn: a dark hole and the plug lying beside it
function soilCores(e, x0, y0, w, h, n) {
  const R = rng(hashStr(`cores${x0}${y0}`)); let s = '';
  for (let i = 0; i < n; i++) { const t = R(); const x = x0 + R() * w, y = y0 + Math.pow(t, 0.8) * h; const k = (0.5 + (y - y0) / h * 0.8) * e.s; const a = R() * 60 - 30;
    s += ell(x, y, 6 * k, 3 * k, '#2a1a10') + g(rect(-10 * k, -4 * k, 20 * k, 8 * k, e.lin([[0, '#8a5d3b'], [1, '#5a3a24']], { x1: 0, y1: 0, x2: 0, y2: 1 }), { rx: 4 * k }) + ell(-9 * k, 0, 2.5 * k, 3.6 * k, '#3a2616'), { transform: `translate(${n1(x + 12 * k)} ${n1(y - 2 * k)}) rotate(${n1(a)})` }); }
  return s;
}
function rake(e, x, y, L, ang) {
  const u = L / 100; const a = (ang == null ? -62 : ang) * Math.PI / 180; const hx = x + Math.cos(a) * L, hy = y + Math.sin(a) * L; let s = line(x, y, hx, hy, '#b98a55', 2.6 * u);
  for (let i = -6; i <= 6; i++) { const t = i / 6; s += line(x, y, x + t * 18 * u - 2 * u, y + 12 * u, '#6f7479', 1.1 * u); }
  return s + ell(x, y + 2 * u, 18 * u, 3 * u, '#6f7479', { opacity: 0.5 });
}
function leafPile(e, x, y, r) {
  const R = rng(hashStr(`lp${x}${y}`)); const cols = ['#d9822b', '#c4471d', '#e6b43c', '#9c3b1a', '#b8652a']; let s = e.shadow(x, y + r * 0.1, r * 1.2, r * 0.18, 0.3);
  for (let i = 0; i < 120; i++) { const a = R() * Math.PI, d = Math.sqrt(R()); const lx = x + Math.cos(a) * d * r * 1.1 * (R() > 0.5 ? 1 : -1), ly = y - Math.sin(a) * d * r * 0.6; s += A.leaf(e, lx, ly, r * (0.1 + R() * 0.09), R() * 360, cols[Math.floor(R() * cols.length)], { width: 0.5 }); }
  return s;
}
function sprinkler(e, x, y, r) {
  let s = rect(x - 4 * e.s, y - 10 * e.s, 8 * e.s, 12 * e.s, '#2c2e33', { rx: 2 * e.s }) + ell(x, y + 1 * e.s, 10 * e.s, 3 * e.s, '#1c1d20');
  for (let i = -3; i <= 3; i++) { const a = -Math.PI / 2 + i * 0.32; s += path(`M${n1(x)} ${n1(y - 10 * e.s)} Q${n1(x + Math.cos(a) * r * 0.6)} ${n1(y - r * 0.9)} ${n1(x + Math.cos(a) * r * 1.2)} ${n1(y - 10 * e.s + r * 0.2)}`, 'none', { stroke: '#dff1ff', 'stroke-width': n1(1.4 * e.s), opacity: 0.75, 'stroke-dasharray': `${n1(3 * e.s)} ${n1(3 * e.s)}` }); }
  return s;
}
function firePit(e, x, y, r) {
  let s = e.shadow(x, y + r * 0.1, r * 1.3, r * 0.3, 0.3) + ell(x, y, r, r * 0.34, e.tint('#6f675e')) + ell(x, y - r * 0.06, r * 0.82, r * 0.26, '#2a1c14');
  for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; s += ell(x + Math.cos(a) * r * 0.92, y + Math.sin(a) * r * 0.3, r * 0.16, r * 0.1, e.tint(i % 2 ? '#8d857a' : '#a69d91')); }
  s += path(`M${n1(x - r * 0.4)} ${n1(y - r * 0.05)} Q${n1(x - r * 0.35)} ${n1(y - r * 0.8)} ${n1(x - r * 0.05)} ${n1(y - r * 1.05)} Q${n1(x + r * 0.05)} ${n1(y - r * 0.6)} ${n1(x + r * 0.2)} ${n1(y - r * 0.9)} Q${n1(x + r * 0.5)} ${n1(y - r * 0.5)} ${n1(x + r * 0.4)} ${n1(y - r * 0.05)} Z`, e.lin([[0, '#ffe08a'], [0.5, '#ff9a3c'], [1, '#e2531d']], { x1: 0, y1: 0, x2: 0, y2: 1 }));
  return s + circ(x, y - r * 0.5, r * 1.3, '#ffb35a', { opacity: 0.18 });
}
function pergola(e, x, baseY, W, H) {
  const wood = e.tint('#9a7250'); let s = '';
  [-0.46, 0.46].forEach(f => { s += rect(x + f * W - 5 * e.s, baseY - H, 10 * e.s, H, e.cyl(wood)); });
  [-0.3, -0.1, 0.1, 0.3].forEach(f => { s += rect(x + f * W - 4 * e.s, baseY - H * 0.8, 8 * e.s, H * 0.8, e.cyl(wood), { opacity: 0.85 }); });
  s += rect(x - W * 0.56, baseY - H - 12 * e.s, W * 1.12, 12 * e.s, e.lin([[0, lighten(wood, 0.15)], [1, darken(wood, 0.2)]], { x1: 0, y1: 0, x2: 0, y2: 1 }));
  for (let i = 0; i < 9; i++) s += rect(x - W * 0.5 + i * W / 8 - 3 * e.s, baseY - H - 22 * e.s, 6 * e.s, 12 * e.s, darken(wood, 0.1));
  return s;
}
function chair(e, x, baseY, h, c) {
  const col = e.tint(c || '#e9e2d6');
  return e.shadow(x, baseY, h * 0.5, h * 0.08, 0.25) + path(P([[x - h * 0.35, baseY - h * 0.45], [x + h * 0.3, baseY - h * 0.45], [x + h * 0.25, baseY - h * 0.35], [x - h * 0.3, baseY - h * 0.35]]), col) + path(P([[x - h * 0.34, baseY - h * 0.45], [x - h * 0.2, baseY - h], [x + h * 0.02, baseY - h], [x - h * 0.1, baseY - h * 0.45]]), darken(col, 0.08)) + line(x - h * 0.3, baseY - h * 0.36, x - h * 0.34, baseY, darken(col, 0.3), 3 * e.s) + line(x + h * 0.25, baseY - h * 0.36, x + h * 0.3, baseY, darken(col, 0.3), 3 * e.s);
}
// water with a few reflected light lines
function water(e, y, colour, o) {
  const k = o || {}; const c = e.tint(colour || '#2f6d8f'); const R = rng(hashStr(`wa${y}`)); let s = rect(0, y, e.w, e.h - y, e.lin([[0, lighten(c, 0.15)], [1, darken(c, 0.3)]], { x1: 0, y1: 0, x2: 0, y2: 1 }));
  for (let i = 0; i < 40; i++) { const yy = y + Math.pow(R(), 1.3) * (e.h - y); const xx = R() * e.w; s += line(xx, yy, xx + (10 + R() * 30) * e.s, yy, k.glint || '#ffffff', 1.2 * e.s, { opacity: 0.15 + R() * 0.3 }); }
  return s;
}
function boat(e, x, y, L, c) {
  const u = L / 100; const hull = e.tint(c || '#f4f1ea'); let s = '';
  s += path(`M${n1(x - 50 * u)} ${n1(y - 12 * u)} L${n1(x + 46 * u)} ${n1(y - 12 * u)} Q${n1(x + 52 * u)} ${n1(y - 12 * u)} ${n1(x + 48 * u)} ${n1(y - 4 * u)} L${n1(x + 38 * u)} ${n1(y + 8 * u)} L${n1(x - 44 * u)} ${n1(y + 8 * u)} Z`, e.lin([[0, lighten(hull, 0.1)], [1, darken(hull, 0.18)]], { x1: 0, y1: 0, x2: 0, y2: 1 }));
  s += rect(x - 46 * u, y - 4 * u, 88 * u, 3 * u, e.accent);
  s += path(P([[x - 26 * u, y - 12 * u], [x + 14 * u, y - 12 * u], [x + 8 * u, y - 30 * u], [x - 20 * u, y - 30 * u]]), lighten(hull, 0.05)) + rect(x - 16 * u, y - 27 * u, 20 * u, 8 * u, '#2d4a5e', { rx: 1.5 * u });
  s += line(x - 6 * u, y - 30 * u, x - 6 * u, y - 44 * u, '#9ea3a8', 1.4 * u) + line(x - 30 * u, y - 12 * u, x - 44 * u, y - 44 * u, '#6b5a45', 1.2 * u) + path(`M${n1(x - 44 * u)} ${n1(y - 44 * u)} Q${n1(x - 58 * u)} ${n1(y - 20 * u)} ${n1(x - 62 * u)} ${n1(y + 6 * u)}`, 'none', { stroke: '#dfe6ea', 'stroke-width': n1(0.6 * u), opacity: 0.8 });
  s += ell(x, y + 10 * u, 60 * u, 4 * u, '#fff', { opacity: 0.25 });
  return s;
}
// a small sailboat heeling slightly: hull, mast, mainsail and jib
function sailboat(e, x, y, L, c) {
  const u = L / 100; const hull = e.tint(c || '#f4f1ea'); let s = '';
  s += path(`M${n1(x - 40 * u)} ${n1(y - 6 * u)} L${n1(x + 44 * u)} ${n1(y - 6 * u)} Q${n1(x + 36 * u)} ${n1(y + 8 * u)} ${n1(x + 24 * u)} ${n1(y + 8 * u)} L${n1(x - 30 * u)} ${n1(y + 8 * u)} Z`, e.lin([[0, lighten(hull, 0.1)], [1, darken(hull, 0.2)]], { x1: 0, y1: 0, x2: 0, y2: 1 })) + rect(x - 38 * u, y - 3 * u, 80 * u, 2.4 * u, e.accent);
  s += line(x, y - 6 * u, x + 2 * u, y - 92 * u, '#6b5a45', 1.8 * u);
  s += path(`M${n1(x + 3 * u)} ${n1(y - 90 * u)} Q${n1(x + 34 * u)} ${n1(y - 50 * u)} ${n1(x + 38 * u)} ${n1(y - 12 * u)} L${n1(x + 3 * u)} ${n1(y - 12 * u)} Z`, e.lin([[0, '#ffffff'], [1, '#e3e1da']], { x1: 0, y1: 0, x2: 1, y2: 1 }));
  s += path(`M${n1(x - 2 * u)} ${n1(y - 84 * u)} Q${n1(x - 26 * u)} ${n1(y - 48 * u)} ${n1(x - 34 * u)} ${n1(y - 10 * u)} L${n1(x - 2 * u)} ${n1(y - 12 * u)} Z`, e.lin([[0, '#fbfaf6'], [1, '#d9d6cc']], { x1: 1, y1: 0, x2: 0, y2: 1 }));
  s += line(x + 3 * u, y - 12 * u, x + 38 * u, y - 12 * u, '#6b5a45', 1.4 * u) + ell(x, y + 10 * u, 56 * u, 3.5 * u, '#fff', { opacity: 0.25 });
  return s;
}
function bicycle(e, x, y, L, c) {
  const u = L / 100; const col = c || e.accent; const wheel = (wx) => circ(wx, y, 22 * u, 'none', { stroke: '#222', 'stroke-width': n1(3.5 * u) }) + circ(wx, y, 19 * u, 'none', { stroke: '#9aa0a6', 'stroke-width': n1(0.7 * u) }) + circ(wx, y, 3 * u, '#9aa0a6');
  let s = e.shadow(x, y + 22 * u, 60 * u, 5 * u, 0.3) + wheel(x - 34 * u) + wheel(x + 34 * u);
  s += path(`M${n1(x - 34 * u)} ${n1(y)} L${n1(x - 6 * u)} ${n1(y)} L${n1(x + 18 * u)} ${n1(y - 30 * u)} L${n1(x - 14 * u)} ${n1(y - 30 * u)} Z M${n1(x - 6 * u)} ${n1(y)} L${n1(x - 18 * u)} ${n1(y - 38 * u)} M${n1(x + 18 * u)} ${n1(y - 30 * u)} L${n1(x + 34 * u)} ${n1(y)} M${n1(x + 18 * u)} ${n1(y - 30 * u)} L${n1(x + 16 * u)} ${n1(y - 40 * u)}`, 'none', { stroke: col, 'stroke-width': n1(3.4 * u), 'stroke-linejoin': 'round', 'stroke-linecap': 'round' });
  s += rect(x - 26 * u, y - 42 * u, 16 * u, 4 * u, '#222', { rx: 2 * u }) + path(`M${n1(x + 10 * u)} ${n1(y - 42 * u)} Q${n1(x + 16 * u)} ${n1(y - 44 * u)} ${n1(x + 24 * u)} ${n1(y - 40 * u)}`, 'none', { stroke: '#222', 'stroke-width': n1(3 * u), 'stroke-linecap': 'round' }) + circ(x - 6 * u, y, 5 * u, '#555');
  return s;
}
function solarPanels(e, x, y, w, h) {
  let s = ''; const cols = 4, rows = 2; const pw = w / cols, ph = h / rows;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) { const px = x + c * pw, py = y + r * ph; s += rect(px + 2 * e.s, py + 2 * e.s, pw - 4 * e.s, ph - 4 * e.s, e.lin([[0, '#2e4c8f'], [1, '#162a55']], { x1: 0, y1: 0, x2: 1, y2: 1 }), { stroke: '#c9d2e0', 'stroke-width': n1(1.5 * e.s) }); for (let i = 1; i < 4; i++) s += line(px + i * pw / 4, py + 3 * e.s, px + i * pw / 4, py + ph - 3 * e.s, '#6f8cc7', 0.6 * e.s, { opacity: 0.6 }); s += path(P([[px + pw * 0.1, py + 3 * e.s], [px + pw * 0.35, py + 3 * e.s], [px + pw * 0.15, py + ph - 3 * e.s], [px + 3 * e.s, py + ph - 3 * e.s]]), '#fff', { opacity: 0.12 }); }
  return s;
}

module.exports = { shrub, grasses, perennial, tree, lawn, pavers, stoneWall, mulchBed, house, shingleField, ladder, mower, aerator, soilCores, trimmer, rake, leafPile, sprinkler, firePit, pergola, chair, water, boat, sailboat, bicycle, solarPanels };
