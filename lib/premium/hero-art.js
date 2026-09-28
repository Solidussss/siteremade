'use strict';
// HERO ART -- code-drawn illustrations for the moving hero.
//
// Every hero layer names WHAT it shows (lib/premium/visual-subjects.js turns the
// owner's own words into a subject and an art spec: a can in the stated
// flavours, a serum dropper, a striped lawn with a mower, a scheduling screen).
// When no paid image is available for that layer -- image generation is off or
// unfunded, the request failed, or it is still in flight -- the layer draws this
// illustration instead of disappearing. Software leads always use a drawn
// interface (readable labels; an image model cannot draw legible UI).
//
// Pure and deterministic (no I/O, no randomness): the same spec, palette and
// seed give byte-identical SVG in the live preview (premium-core.js bundle) and
// the export (lib/site-render.js). One visual language across a hero's layers:
// the site's own accent tints every surface, light always comes from the upper
// left, one soft shadow style, one grain.
//
// HONESTY: interface drawings carry only the owner's own words and generic UI
// labels -- no invented numbers, customer names, ratings or metrics.

// ---- colour ---------------------------------------------------------------------------------------------------
function rgb(c) {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(c || '').trim());
  if (!m) return [128, 128, 128];
  let h = m[1]; if (h.length === 3) h = h.split('').map(x => x + x).join('');
  return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16));
}
const hex = a => '#' + a.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
function mix(a, b, t) { const A = rgb(a), B = rgb(b); return hex(A.map((v, i) => v + (B[i] - v) * t)); }
const lighten = (c, t) => mix(c, '#ffffff', t);
const darken = (c, t) => mix(c, '#000000', t);
function lum(c) { const [r, g, b] = rgb(c).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; }
const inkOn = c => (lum(c) > 0.42 ? '#1c1a19' : '#ffffff');
const n1 = v => Math.round(v * 10) / 10;

// Named materials and flavours. Colours only -- the subject module decides WHICH apply.
const FLAVOUR_COLOURS = {
  grapefruit: '#f0705f', yuzu: '#f2d13a', ginger: '#d8a44a', peach: '#f6a178', cherry: '#b5122f', lemon: '#f4dc3f', lime: '#8cc63f',
  orange: '#f58a1f', 'blood orange': '#c7432b', mango: '#ffb13b', berry: '#b8205a', berries: '#b8205a', raspberry: '#c7215d', strawberry: '#e33b45',
  blueberry: '#4a4f9e', blackberry: '#3e1f48', watermelon: '#f25c6e', mint: '#72cf9c', vanilla: '#f0dfa4', chocolate: '#5b3a1e', apple: '#8cbf45',
  coconut: '#efe8da', pineapple: '#f5c63c', passionfruit: '#8f3a6c', cucumber: '#9bc865', elderflower: '#ece4c0', hibiscus: '#c01f5d', lavender: '#9a86c8',
  pomegranate: '#a3163d', cranberry: '#9a1b30', pear: '#c7d16a', grape: '#6b3c99', matcha: '#7ca552', tea: '#b36a26', coffee: '#6e4b33', citrus: '#f5b82e',
  cola: '#5a2e1b', cinnamon: '#a0522d', honey: '#e0a21a', chili: '#c9291d', habanero: '#ef6a1a', jalapeno: '#4f8f2f', garlic: '#efe6d2', smoky: '#7a4a2a',
};
const FLAVOUR_KEYS = Object.keys(FLAVOUR_COLOURS);
const flavourColour = f => FLAVOUR_COLOURS[String(f || '').toLowerCase()] || null;

// ---- svg helpers ----------------------------------------------------------------------------------------------
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function attrs(o) { return Object.keys(o).filter(k => o[k] != null && o[k] !== false).map(k => `${k}="${typeof o[k] === 'number' ? n1(o[k]) : esc(o[k])}"`).join(' '); }
const el = (tag, o, inner) => (inner == null ? `<${tag} ${attrs(o)}/>` : `<${tag} ${attrs(o)}>${inner}</${tag}>`);
const rect = (x, y, w, h, fill, o) => el('rect', Object.assign({ x, y, width: Math.max(0, w), height: Math.max(0, h), fill }, o || {}));
const circ = (cx, cy, r, fill, o) => el('circle', Object.assign({ cx, cy, r: Math.max(0, r), fill }, o || {}));
const ell = (cx, cy, rx, ry, fill, o) => el('ellipse', Object.assign({ cx, cy, rx: Math.max(0, rx), ry: Math.max(0, ry), fill }, o || {}));
const path = (d, fill, o) => el('path', Object.assign({ d, fill }, o || {}));
const line = (x1, y1, x2, y2, stroke, w, o) => el('line', Object.assign({ x1, y1, x2, y2, stroke, 'stroke-width': w || 1, 'stroke-linecap': 'round' }, o || {}));
const g = (inner, o) => el('g', o || {}, inner);
const P = pts => pts.map((p, i) => `${i ? 'L' : 'M'}${n1(p[0])} ${n1(p[1])}`).join(' ') + ' Z';

// deterministic pseudo-random from a seed
function rng(seed) { let s = (seed >>> 0) || 1; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; }
function hashStr(s) { let h = 2166136261; const t = String(s || ''); for (let i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

// A drawing context: viewBox, palette, one gradient registry, one shadow filter.
function makeEnv(o) {
  const w = o.w, h = o.h;
  const accent = o.accent || '#6b5b95';
  const dark = o.tone === 'dark';
  const uid = 'ha' + (o.uid || hashStr(`${o.kind}|${o.seed}|${w}x${h}`).toString(36));
  const defs = [];
  let n = 0;
  const env = {
    w, h, cx: w / 2, cy: h / 2, s: Math.min(w, h) / 480, accent, dark, uid, rand: rng(o.seed || 7), detail: o.detail || 'full', defs,
    // surfaces tinted by the site accent: one family of colours across every layer of a hero
    wall: dark ? mix(accent, '#0e0e13', 0.8) : mix(accent, '#f5f1eb', 0.9),
    wall2: dark ? mix(accent, '#1a1a22', 0.72) : mix(accent, '#ebe4da', 0.86),
    floor: dark ? mix(accent, '#17161b', 0.78) : mix(accent, '#e3dacd', 0.84),
    ink: dark ? '#f4f1ec' : '#23201d',
    tint: c => mix(c, accent, 0.08),
    id(p) { n += 1; return `${uid}-${p || 'g'}${n}`; },
    lin(stops, o2) { const id = env.id('l'); const d = o2 || {}; defs.push(`<linearGradient id="${id}" x1="${d.x1 == null ? 0 : d.x1}" y1="${d.y1 == null ? 0 : d.y1}" x2="${d.x2 == null ? 1 : d.x2}" y2="${d.y2 == null ? 0 : d.y2}">${stops.map(s => `<stop offset="${s[0]}" stop-color="${s[1]}"${s[2] != null ? ` stop-opacity="${s[2]}"` : ''}/>`).join('')}</linearGradient>`); return `url(#${id})`; },
    rad(stops, o2) { const id = env.id('r'); const d = o2 || {}; defs.push(`<radialGradient id="${id}" cx="${d.cx == null ? 0.5 : d.cx}" cy="${d.cy == null ? 0.5 : d.cy}" r="${d.r == null ? 0.5 : d.r}"${d.fx != null ? ` fx="${d.fx}" fy="${d.fy}"` : ''}>${stops.map(s => `<stop offset="${s[0]}" stop-color="${s[1]}"${s[2] != null ? ` stop-opacity="${s[2]}"` : ''}/>`).join('')}</radialGradient>`); return `url(#${id})`; },
    // a lit cylinder: shade at both edges, a bright band left of centre (light from the upper left)
    cyl(c, o3) { const k = o3 || {}; return env.lin([[0, darken(c, k.edge == null ? 0.38 : k.edge)], [0.16, lighten(c, k.hi == null ? 0.28 : k.hi)], [0.3, c], [0.72, darken(c, 0.12)], [1, darken(c, (k.edge == null ? 0.38 : k.edge) + 0.08)]]); },
    // a lit flat face: lighter at the top left
    face(c, t) { return env.lin([[0, lighten(c, t || 0.12)], [1, darken(c, t || 0.12)]], { x1: 0, y1: 0, x2: 0.7, y2: 1 }); },
    blur: null,
  };
  env.blurId = `${uid}-blur`;
  defs.push(`<filter id="${env.blurId}" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="${n1(8 * env.s)}"/></filter>`);
  env.shadow = (cx, cy, rx, ry, op) => ell(cx, cy, rx, ry, dark ? '#000' : darken(env.floor, 0.55), { opacity: op == null ? (dark ? 0.55 : 0.32) : op, filter: `url(#${env.blurId})` });
  env.hi = (x, y, w2, h2, op, rx) => rect(x, y, w2, h2, '#fff', { opacity: op == null ? 0.32 : op, rx: rx == null ? w2 / 2 : rx });
  return env;
}

// ---- backdrops ------------------------------------------------------------------------------------------------
// studio: a softly lit wall meeting a surface at `horizon` (0-1 of the height)
function studio(e, o) {
  const k = o || {};
  const hz = e.h * (k.horizon == null ? 0.72 : k.horizon);
  const wall = k.wall || e.wall, floor = k.floor || e.floor;
  return rect(0, 0, e.w, e.h, e.lin([[0, lighten(wall, e.dark ? 0.06 : 0.25)], [1, wall]], { x1: 0, y1: 0, x2: 0, y2: 1 })) +
    rect(0, 0, e.w, hz, e.rad([[0, lighten(wall, e.dark ? 0.16 : 0.35), 0.9], [1, wall, 0]], { cx: 0.3, cy: 0.2, r: 0.8 })) +
    rect(0, hz, e.w, e.h - hz, e.lin([[0, floor], [1, darken(floor, e.dark ? 0.35 : 0.12)]], { x1: 0, y1: 0, x2: 0, y2: 1 })) +
    rect(0, hz - 1, e.w, 2, lighten(floor, 0.18), { opacity: 0.55 });
}
// sky + ground for exteriors; time: day | golden | dusk | night
function outdoors(e, o) {
  const k = o || {};
  const hz = e.h * (k.horizon == null ? 0.5 : k.horizon);
  const skies = { day: ['#9ccbe8', '#dcecf4'], golden: ['#f2b56b', '#fde6c3'], dusk: ['#2b3a67', '#e7a58c'], night: ['#0f1730', '#2c3b63'] };
  const [top, bottom] = skies[k.time || 'day'];
  let s = rect(0, 0, e.w, hz + 2, e.lin([[0, e.tint(top)], [1, e.tint(bottom)]], { x1: 0, y1: 0, x2: 0, y2: 1 }));
  if (k.time === 'golden' || k.time === 'day') s += circ(e.w * 0.78, hz * 0.34, 36 * e.s, k.time === 'golden' ? '#fff3d6' : '#fffdf2', { opacity: 0.9 }) + circ(e.w * 0.78, hz * 0.34, 80 * e.s, '#fff6dd', { opacity: 0.25 });
  if (k.time === 'dusk' || k.time === 'night') { const R = e.rand; for (let i = 0; i < 14; i++) s += circ(R() * e.w, R() * hz * 0.6, (0.8 + R()) * e.s, '#fff', { opacity: 0.5 + R() * 0.4 }); }
  // distant tree line
  if (k.treeline !== false) {
    const R = e.rand; let d = `M0 ${hz}`; for (let x = 0; x <= e.w + 20; x += 18 * e.s) d += ` Q${n1(x + 9 * e.s)} ${n1(hz - (14 + R() * 26) * e.s)} ${n1(x + 18 * e.s)} ${n1(hz - (4 + R() * 6) * e.s)}`;
    s += path(d + ` L${e.w} ${hz + 4} L0 ${hz + 4} Z`, e.tint(k.time === 'dusk' || k.time === 'night' ? '#1d2b2a' : '#5f8a4f'), { opacity: k.time === 'dusk' ? 0.9 : 0.75 });
  }
  return s;
}
// an interior: back wall, floor with boards, optional window; returns the wall/floor line
function room(e, o) {
  const k = o || {};
  const hz = e.h * (k.horizon == null ? 0.66 : k.horizon);
  const wall = k.wall || e.tint(e.dark ? '#3b3530' : '#efe7dc');
  const floor = k.floor || e.tint(e.dark ? '#2a211b' : '#c9a57e');
  let s = rect(0, 0, e.w, hz, e.lin([[0, lighten(wall, 0.08)], [1, darken(wall, 0.06)]], { x1: 0, y1: 0, x2: 0.4, y2: 1 }));
  s += rect(0, hz, e.w, e.h - hz, e.lin([[0, floor], [1, darken(floor, 0.22)]], { x1: 0, y1: 0, x2: 0, y2: 1 }));
  if (k.boards !== false) for (let i = 1; i < 9; i++) { const x = e.w * i / 9; s += line(e.cx + (x - e.cx) * 0.55, hz, e.cx + (x - e.cx) * 2.2, e.h, darken(floor, 0.18), 1.2 * e.s, { opacity: 0.6 }); }
  s += rect(0, hz - 6 * e.s, e.w, 6 * e.s, lighten(wall, 0.35));
  if (k.window) {
    const [wx, wy, ww, wh] = k.window.map((v, i) => (i % 2 ? v * e.h : v * e.w));
    const glass = k.night ? e.lin([[0, '#23355c'], [1, '#101a31']], { x1: 0, y1: 0, x2: 0, y2: 1 }) : e.lin([[0, '#cfe6f3'], [1, '#f5efe1']], { x1: 0, y1: 0, x2: 0, y2: 1 });
    s += rect(wx - 6 * e.s, wy - 6 * e.s, ww + 12 * e.s, wh + 12 * e.s, lighten(wall, 0.5), { rx: 3 * e.s }) + rect(wx, wy, ww, wh, glass);
    if (k.city) s += cityline(e, wx, wy + wh, ww, wh * 0.55, k.night);
    s += line(wx + ww / 2, wy, wx + ww / 2, wy + wh, lighten(wall, 0.5), 5 * e.s) + line(wx, wy + wh * 0.45, wx + ww, wy + wh * 0.45, lighten(wall, 0.5), 5 * e.s);
    // daylight falling on the floor
    if (!k.night) s += path(P([[wx, hz], [wx + ww, hz], [wx + ww * 1.5, e.h], [wx - ww * 0.2, e.h]]), '#fff7e3', { opacity: 0.18 });
  }
  return s;
}
function cityline(e, x, base, w, hmax, night) {
  const R = rng(hashStr(e.uid + 'city'));
  let s = '', cx = x;
  while (cx < x + w) {
    const bw = (16 + R() * 28) * e.s, bh = hmax * (0.35 + R() * 0.65);
    const bx = Math.min(cx, x + w - 4);
    s += rect(bx, base - bh, Math.min(bw, x + w - bx), bh, night ? '#0b1224' : e.tint('#8fa3b5'), { opacity: night ? 0.95 : 0.8 });
    if (night) for (let yy = base - bh + 6 * e.s; yy < base - 4 * e.s; yy += 8 * e.s) for (let xx = bx + 4 * e.s; xx < bx + Math.min(bw, x + w - bx) - 4 * e.s; xx += 7 * e.s) if (R() > 0.55) s += rect(xx, yy, 3 * e.s, 3 * e.s, '#ffd98a', { opacity: 0.8 });
    cx += bw + 3 * e.s;
  }
  return s;
}
function grain(e, op) {
  const id = e.id('grain');
  e.defs.push(`<filter id="${id}"><feTurbulence type="fractalNoise" baseFrequency="${n1(0.9 / e.s * 10) / 10}" numOctaves="2" seed="${Math.floor(e.rand() * 99)}" stitchTiles="stitch"/><feColorMatrix type="saturate" values="0"/><feComponentTransfer><feFuncA type="table" tableValues="0 ${op || 0.08}"/></feComponentTransfer></filter>`);
  return rect(0, 0, e.w, e.h, '#808080', { filter: `url(#${id})`, style: 'mix-blend-mode:overlay' });
}

// ---- botanicals & produce ---------------------------------------------------------------------------------------
function leaf(e, x, y, len, ang, colour, o) {
  const k = o || {}; const wd = len * (k.width || 0.32);
  const c = colour || e.tint('#5f8f4e');
  return g(path(`M0 0 Q${n1(len * 0.45)} ${n1(-wd)} ${n1(len)} 0 Q${n1(len * 0.45)} ${n1(wd)} 0 0 Z`, e.lin([[0, lighten(c, 0.18)], [1, darken(c, 0.2)]], { x1: 0, y1: 0, x2: 0, y2: 1 })) +
    line(len * 0.05, 0, len * 0.9, 0, darken(c, 0.3), Math.max(0.6, len * 0.025), { opacity: 0.55 }), { transform: `translate(${n1(x)} ${n1(y)}) rotate(${n1(ang)})` });
}
function sprig(e, x, y, len, ang, colour) {
  let s = ''; const c = colour || e.tint('#6e9a58');
  const rad = ang * Math.PI / 180;
  s += line(x, y, x + Math.cos(rad) * len, y + Math.sin(rad) * len, darken(c, 0.25), 1.6 * e.s);
  for (let i = 1; i <= 5; i++) { const t = i / 6; const px = x + Math.cos(rad) * len * t, py = y + Math.sin(rad) * len * t; s += leaf(e, px, py, len * 0.28 * (1.1 - t * 0.4), ang - 50, c) + leaf(e, px, py, len * 0.26 * (1.1 - t * 0.4), ang + 50, c); }
  return s;
}
// a slice of citrus (wheel) seen face-on
function citrusWheel(e, x, y, r, c) {
  const pith = lighten(c, 0.72); let s = circ(x, y, r, darken(c, 0.12)) + circ(x, y, r * 0.9, pith) + circ(x, y, r * 0.82, c);
  for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2; s += line(x, y, x + Math.cos(a) * r * 0.8, y + Math.sin(a) * r * 0.8, pith, 1.6 * e.s); }
  s += circ(x, y, r * 0.12, pith) + ell(x - r * 0.35, y - r * 0.4, r * 0.3, r * 0.14, '#fff', { opacity: 0.35, transform: `rotate(-30 ${n1(x)} ${n1(y)})` });
  return s;
}
function roundFruit(e, x, y, r, c, o) {
  const k = o || {};
  let s = circ(x, y, r, e.rad([[0, lighten(c, 0.35)], [0.55, c], [1, darken(c, 0.35)]], { cx: 0.35, cy: 0.3, r: 0.75 }));
  if (k.stem) s += path(`M${n1(x)} ${n1(y - r * 0.85)} q${n1(r * 0.1)} ${n1(-r * 0.6)} ${n1(r * 0.5)} ${n1(-r * 0.9)}`, 'none', { stroke: '#5a3b1d', 'stroke-width': n1(Math.max(1.2, r * 0.08)), 'stroke-linecap': 'round' });
  if (k.leaf) s += leaf(e, x + r * 0.1, y - r * 0.9, r * 0.9, -25);
  if (k.crease) s += path(`M${n1(x)} ${n1(y - r)} Q${n1(x - r * 0.25)} ${n1(y)} ${n1(x)} ${n1(y + r)}`, 'none', { stroke: darken(c, 0.25), 'stroke-width': n1(1.4 * e.s), opacity: 0.5 });
  if (k.seeds) { const R = rng(hashStr(`${x}${y}`)); for (let i = 0; i < 14; i++) { const a = R() * Math.PI * 2, d = R() * r * 0.75; s += ell(x + Math.cos(a) * d, y + Math.sin(a) * d, 1.2 * e.s, 2 * e.s, k.seeds, { opacity: 0.85 }); } }
  return s + ell(x - r * 0.35, y - r * 0.38, r * 0.28, r * 0.16, '#fff', { opacity: 0.45, transform: `rotate(-35 ${n1(x)} ${n1(y)})` });
}
function halfFruit(e, x, y, r, skin, flesh, o) {
  const k = o || {};
  let s = ell(x, y, r, r * 0.92, darken(skin, 0.1)) + ell(x, y, r * 0.9, r * 0.82, flesh);
  if (k.stone) s += ell(x + r * 0.05, y, r * 0.3, r * 0.36, e.rad([[0, lighten(k.stone, 0.2)], [1, darken(k.stone, 0.3)]]));
  if (k.core) s += ell(x, y, r * 0.22, r * 0.3, lighten(flesh, 0.3)) + ell(x - r * 0.08, y, 2.2 * e.s, 4 * e.s, '#3b2412') + ell(x + r * 0.08, y, 2.2 * e.s, 4 * e.s, '#3b2412');
  if (k.seeds) { const R = rng(hashStr(`h${x}${y}`)); for (let i = 0; i < 18; i++) { const a = R() * Math.PI * 2, d = (0.2 + R() * 0.6) * r; s += ell(x + Math.cos(a) * d, y + Math.sin(a) * d * 0.9, 1.3 * e.s, 2.2 * e.s, k.seeds); } }
  return s + ell(x - r * 0.3, y - r * 0.35, r * 0.35, r * 0.16, '#fff', { opacity: 0.3, transform: `rotate(-25 ${n1(x)} ${n1(y)})` });
}
function gingerRoot(e, x, y, s0) {
  const c = '#d7a861'; const s = s0 * e.s; let o = '';
  const knobs = [[0, 0, 22], [26, -8, 16], [-22, 6, 15], [12, 16, 13], [40, 4, 11]];
  knobs.forEach(([dx, dy, r]) => { o += ell(x + dx * s, y + dy * s, r * s, r * 0.72 * s, e.rad([[0, lighten(c, 0.25)], [1, darken(c, 0.25)]], { cx: 0.35, cy: 0.3 })); });
  knobs.forEach(([dx, dy, r]) => { o += path(`M${n1(x + (dx - r * 0.6) * s)} ${n1(y + dy * s)} q${n1(r * 0.6 * s)} ${n1(-r * 0.25 * s)} ${n1(r * 1.2 * s)} 0`, 'none', { stroke: darken(c, 0.35), 'stroke-width': n1(0.9 * e.s), opacity: 0.6 }); });
  return o;
}
function cherries(e, x, y, r) {
  const c = FLAVOUR_COLOURS.cherry;
  return path(`M${n1(x - r * 0.9)} ${n1(y - r * 0.7)} Q${n1(x - r * 0.4)} ${n1(y - r * 3)} ${n1(x + r * 0.6)} ${n1(y - r * 3.2)} M${n1(x + r * 1.1)} ${n1(y - r * 0.6)} Q${n1(x + r * 1.2)} ${n1(y - r * 2.2)} ${n1(x + r * 0.6)} ${n1(y - r * 3.2)}`, 'none', { stroke: '#4d6b2a', 'stroke-width': n1(Math.max(1.4, r * 0.12)), 'stroke-linecap': 'round' }) +
    leaf(e, x + r * 0.6, y - r * 3.2, r * 1.8, -20) + roundFruit(e, x - r * 0.9, y, r, c) + roundFruit(e, x + r * 1.1, y + r * 0.2, r, c);
}
function berry(e, x, y, r, c) {
  let s = circ(x, y, r, darken(c, 0.15));
  for (let i = 0; i < 7; i++) { const a = i / 7 * Math.PI * 2; s += circ(x + Math.cos(a) * r * 0.55, y + Math.sin(a) * r * 0.55, r * 0.42, e.rad([[0, lighten(c, 0.3)], [1, darken(c, 0.2)]], { cx: 0.35, cy: 0.3 })); }
  return s + circ(x, y, r * 0.42, e.rad([[0, lighten(c, 0.3)], [1, darken(c, 0.2)]], { cx: 0.35, cy: 0.3 }));
}
// one piece of fruit/produce standing for a named flavour
function flavourPiece(e, flavour, x, y, r) {
  const f = String(flavour || '').toLowerCase(); const c = flavourColour(f) || e.accent;
  if (/grapefruit|orange|lemon|lime|yuzu|citrus|blood orange/.test(f)) return citrusWheel(e, x, y, r, c);
  if (f === 'ginger') return gingerRoot(e, x, y, r / 22);
  if (f === 'cherry') return cherries(e, x, y + r * 0.6, r * 0.55);
  if (f === 'blueberry') return [[-0.5, 0], [0.4, 0.1], [0, -0.5], [0.1, 0.5]].map(([dx, dy]) => roundFruit(e, x + dx * r, y + dy * r, r * 0.4, c) + circ(x + dx * r, y + dy * r - r * 0.32, r * 0.08, darken(c, 0.4))).join('');
  if (f === 'strawberry') return path(`M${n1(x)} ${n1(y + r)} Q${n1(x - r * 1.05)} ${n1(y - r * 0.1)} ${n1(x - r * 0.6)} ${n1(y - r * 0.7)} Q${n1(x)} ${n1(y - r * 0.95)} ${n1(x + r * 0.6)} ${n1(y - r * 0.7)} Q${n1(x + r * 1.05)} ${n1(y - r * 0.1)} ${n1(x)} ${n1(y + r)} Z`, e.rad([[0, lighten(c, 0.3)], [1, darken(c, 0.25)]], { cx: 0.35, cy: 0.3 })) + [0, 1, 2, 3, 4, 5, 6, 7].map(i => ell(x + ((i % 3) - 1) * r * 0.35, y - r * 0.3 + Math.floor(i / 3) * r * 0.38, 1.3 * e.s, 2 * e.s, '#f7e27a')).join('') + leaf(e, x - r * 0.1, y - r * 0.78, r * 0.7, -160) + leaf(e, x + r * 0.1, y - r * 0.78, r * 0.7, -20);
  if (/raspberry|blackberry|berry|berries/.test(f)) return berry(e, x - r * 0.5, y, r * 0.5, c) + berry(e, x + r * 0.45, y + r * 0.2, r * 0.46, c);
  if (/peach|apricot/.test(f)) return halfFruit(e, x, y, r, '#e4705a', '#f8b777', { stone: '#8a3b27' });
  if (/mango/.test(f)) return ell(x, y, r * 1.15, r * 0.82, e.rad([[0, '#ffd166'], [0.6, '#f59e3b'], [1, '#d9573c']], { cx: 0.35, cy: 0.3 }), { transform: `rotate(-20 ${n1(x)} ${n1(y)})` });
  if (/watermelon/.test(f)) return path(`M${n1(x - r * 1.2)} ${n1(y - r * 0.2)} A${n1(r * 1.2)} ${n1(r * 1.2)} 0 0 0 ${n1(x + r * 1.2)} ${n1(y - r * 0.2)} Z`, '#3f8a3a') + path(`M${n1(x - r * 1.08)} ${n1(y - r * 0.2)} A${n1(r * 1.08)} ${n1(r * 1.08)} 0 0 0 ${n1(x + r * 1.08)} ${n1(y - r * 0.2)} Z`, '#eaf2c8') + path(`M${n1(x - r)} ${n1(y - r * 0.2)} A${n1(r)} ${n1(r)} 0 0 0 ${n1(x + r)} ${n1(y - r * 0.2)} Z`, c) + [-0.5, 0, 0.5, -0.25, 0.25].map((dx, i) => ell(x + dx * r, y + (i < 3 ? 0.25 : 0.5) * r, 1.6 * e.s, 2.6 * e.s, '#2a1a14')).join('');
  if (/apple|pear/.test(f)) return roundFruit(e, x, y, r, c, { stem: true, leaf: true });
  if (/mint|basil|matcha|tea|elderflower|lavender|hibiscus|cucumber/.test(f)) return sprig(e, x - r, y + r * 0.6, r * 2.2, -55, f === 'lavender' ? '#8f7cc0' : f === 'hibiscus' ? '#c01f5d' : undefined);
  if (/vanilla/.test(f)) return path(`M${n1(x - r)} ${n1(y + r * 0.6)} Q${n1(x)} ${n1(y - r * 0.2)} ${n1(x + r)} ${n1(y - r * 0.8)}`, 'none', { stroke: '#3a2615', 'stroke-width': n1(r * 0.16), 'stroke-linecap': 'round' }) + circ(x - r * 0.2, y + r * 0.35, r * 0.45, '#f4ecd2') + circ(x + r * 0.35, y + r * 0.25, r * 0.36, '#f0e3bd');
  if (/chocolate|cocoa|coffee|cola/.test(f)) return beanPile(e, x, y, r, f === 'coffee' ? '#4b2e1c' : '#3a2213');
  if (/pineapple/.test(f)) return ell(x, y + r * 0.2, r * 0.75, r * 0.95, e.rad([[0, '#f8d35b'], [1, '#c78a1c']], { cx: 0.35, cy: 0.3 })) + [0, 1, 2, 3, 4].map(i => leaf(e, x, y - r * 0.65, r * 0.9, -90 + (i - 2) * 22, '#4f8a3b')).join('');
  if (/coconut/.test(f)) return halfFruit(e, x, y, r, '#6b4428', '#f6f1e6');
  if (/chili|habanero|jalapeno/.test(f)) return chili(e, x - r * 0.5, y, r, c) + chili(e, x + r * 0.3, y + r * 0.3, r * 0.9, darken(c, 0.1));
  if (/garlic/.test(f)) return path(`M${n1(x)} ${n1(y - r)} Q${n1(x + r)} ${n1(y - r * 0.2)} ${n1(x + r * 0.7)} ${n1(y + r * 0.6)} Q${n1(x)} ${n1(y + r)} ${n1(x - r * 0.7)} ${n1(y + r * 0.6)} Q${n1(x - r)} ${n1(y - r * 0.2)} ${n1(x)} ${n1(y - r)} Z`, e.rad([[0, '#fffaf0'], [1, '#d9ccb2']], { cx: 0.35, cy: 0.3 }));
  if (/honey/.test(f)) return honeyDipper(e, x, y, r);
  if (/cinnamon/.test(f)) return [0, 1, 2].map(i => rect(x - r + i * 5 * e.s, y - r * 0.2 + i * 4 * e.s, r * 2, r * 0.32, darken(c, i * 0.08), { rx: r * 0.16, transform: `rotate(-18 ${n1(x)} ${n1(y)})` })).join('');
  return roundFruit(e, x, y, r, c);
}
function chili(e, x, y, r, c) {
  return path(`M${n1(x - r * 0.9)} ${n1(y - r * 0.5)} Q${n1(x + r * 0.2)} ${n1(y - r * 0.7)} ${n1(x + r * 1.1)} ${n1(y + r * 0.6)} Q${n1(x + r * 0.1)} ${n1(y - r * 0.05)} ${n1(x - r * 0.9)} ${n1(y - r * 0.1)} Z`, e.lin([[0, lighten(c, 0.3)], [1, darken(c, 0.25)]], { x1: 0, y1: 0, x2: 0, y2: 1 })) +
    path(`M${n1(x - r * 0.9)} ${n1(y - r * 0.3)} q${n1(-r * 0.3)} ${n1(-r * 0.2)} ${n1(-r * 0.35)} ${n1(-r * 0.6)}`, 'none', { stroke: '#4d6b2a', 'stroke-width': n1(r * 0.14), 'stroke-linecap': 'round' });
}
function beanPile(e, x, y, r, c) {
  const R = rng(hashStr(`beans${x}${y}`)); let s = '';
  for (let i = 0; i < 16; i++) { const a = R() * Math.PI * 2, d = Math.sqrt(R()) * r; s += bean(e, x + Math.cos(a) * d, y + Math.sin(a) * d * 0.6, r * 0.2, R() * 180, c); }
  return s;
}
function bean(e, x, y, r, ang, c) {
  return g(ell(0, 0, r, r * 0.7, e.rad([[0, lighten(c, 0.3)], [1, darken(c, 0.25)]], { cx: 0.35, cy: 0.3 })) + path(`M${n1(-r * 0.8)} 0 Q0 ${n1(r * 0.25)} ${n1(r * 0.8)} 0`, 'none', { stroke: darken(c, 0.5), 'stroke-width': n1(Math.max(0.8, r * 0.14)) }), { transform: `translate(${n1(x)} ${n1(y)}) rotate(${n1(ang)})` });
}
function honeyDipper(e, x, y, r) {
  return line(x - r * 1.2, y - r * 1.2, x + r * 0.2, y + r * 0.2, '#b98a55', r * 0.16) + [0, 1, 2, 3].map(i => ell(x + r * 0.35 + i * r * 0.12, y + r * 0.35 + i * r * 0.12, r * 0.42, r * 0.2, darken('#c99a5c', i * 0.05), { transform: `rotate(45 ${n1(x + r * 0.35 + i * r * 0.12)} ${n1(y + r * 0.35 + i * r * 0.12)})` })).join('') + path(`M${n1(x + r * 0.7)} ${n1(y + r * 0.8)} q${n1(r * 0.1)} ${n1(r * 0.5)} 0 ${n1(r * 0.9)}`, 'none', { stroke: FLAVOUR_COLOURS.honey, 'stroke-width': n1(r * 0.14), 'stroke-linecap': 'round' });
}
function bubbles(e, x, y, w, h, n, op) {
  const R = rng(hashStr(`bub${x}${y}${w}`)); let s = '';
  for (let i = 0; i < n; i++) { const r = (1.5 + R() * 5) * e.s; s += circ(x + R() * w, y + R() * h, r, 'none', { stroke: '#fff', 'stroke-width': n1(0.9 * e.s), opacity: (op || 0.6) * (0.5 + R() * 0.5) }); }
  return s;
}
function droplets(e, x, y, w, h, n) {
  const R = rng(hashStr(`drop${x}${y}${w}`)); let s = '';
  for (let i = 0; i < n; i++) { const r = (1 + R() * 2.6) * e.s, px = x + R() * w, py = y + R() * h; s += ell(px, py, r * 0.8, r, '#ffffff', { opacity: 0.35 }) + circ(px - r * 0.3, py - r * 0.35, r * 0.3, '#fff', { opacity: 0.8 }); }
  return s;
}

// ---- containers ---------------------------------------------------------------------------------------------------
// All drawn centred on (x, baseY) with a given height; `c` is the body colour, `label` optional text.
function wordmark(e, text, x, y, size, colour, o) {
  const k = o || {}; const t = String(text || '').trim(); if (!t) return '';
  const fs = n1(size);
  const style = `font-family:${k.serif ? 'Georgia,\'Times New Roman\',serif' : 'Inter,\'Helvetica Neue\',Arial,sans-serif'};font-weight:${k.weight || 800};letter-spacing:${k.spacing == null ? '-0.02em' : k.spacing}`;
  const fit = k.maxWidth ? { textLength: n1(Math.min(k.maxWidth, t.length * size * (k.upper ? 0.68 : 0.58))), lengthAdjust: 'spacingAndGlyphs' } : {};
  return el('text', Object.assign({ x, y, fill: colour, 'font-size': fs, 'text-anchor': k.anchor || 'middle', style, transform: k.rotate ? `rotate(${k.rotate} ${n1(x)} ${n1(y)})` : null, opacity: k.opacity }, fit), esc(k.upper ? t.toUpperCase() : t));
}
function can(e, x, baseY, H, c, o) {
  const k = o || {}; const W = H * 0.5, r = W / 2, top = baseY - H;
  const body = e.cyl(c);
  const metal = e.lin([[0, '#7d8288'], [0.2, '#f1f3f5'], [0.45, '#b9bec4'], [0.8, '#8a9096'], [1, '#5f656b']]);
  let s = e.shadow(x + W * 0.18, baseY + 2, W * 0.75, W * 0.12);
  // body with a slight neck taper at the top
  s += path(`M${n1(x - r)} ${n1(top + H * 0.09)} L${n1(x - r * 0.86)} ${n1(top + H * 0.035)} L${n1(x + r * 0.86)} ${n1(top + H * 0.035)} L${n1(x + r)} ${n1(top + H * 0.09)} L${n1(x + r)} ${n1(baseY - H * 0.04)} Q${n1(x + r)} ${n1(baseY)} ${n1(x + r * 0.8)} ${n1(baseY)} L${n1(x - r * 0.8)} ${n1(baseY)} Q${n1(x - r)} ${n1(baseY)} ${n1(x - r)} ${n1(baseY - H * 0.04)} Z`, body);
  // label band + wordmark (the business's own name, rotated up the can)
  const bandC = k.band || lighten(c, 0.85);
  s += rect(x - r, top + H * 0.3, W, H * 0.34, e.cyl(bandC, { edge: 0.25, hi: 0.2 }));
  if (k.stripe) s += rect(x - r, top + H * 0.64, W, H * 0.05, e.cyl(k.stripe, { edge: 0.3 }));
  if (k.label) s += wordmark(e, k.label, x, top + H * 0.5, Math.min(W * 0.36, H * 0.07), inkOn(bandC), { maxWidth: W * 0.84, upper: true, spacing: '0.04em' });
  if (k.sub) s += wordmark(e, k.sub, x, top + H * 0.58, Math.min(W * 0.14, H * 0.03), inkOn(bandC), { maxWidth: W * 0.7, weight: 600, spacing: '0.12em', upper: true, opacity: 0.75 });
  if (k.fruit) s += flavourPiece(e, k.fruit, x, top + H * 0.77, W * 0.16);
  // rim, lid, tab
  s += ell(x, top + H * 0.035, r * 0.86, W * 0.07, metal) + ell(x, top + H * 0.035, r * 0.74, W * 0.055, e.lin([[0, '#aab0b6'], [1, '#e7eaee']], { x1: 0, y1: 0, x2: 0, y2: 1 }));
  s += ell(x + r * 0.12, top + H * 0.033, r * 0.3, W * 0.03, '#9ba1a7') + ell(x + r * 0.12, top + H * 0.033, r * 0.14, W * 0.014, '#6a7076');
  s += ell(x, baseY - 1, r * 0.8, W * 0.035, darken(c, 0.45), { opacity: 0.6 });
  // highlight + condensation
  s += e.hi(x - r * 0.55, top + H * 0.12, W * 0.08, H * 0.8, 0.35);
  if (k.cold) s += droplets(e, x - r * 0.9, top + H * 0.14, W * 0.85, H * 0.8, Math.round(26 * (k.detail === 'simple' ? 0.5 : 1)));
  return s;
}
// bottle silhouettes: shoulder/neck proportions per style
const BOTTLE = {
  wine: { neck: 0.33, neckW: 0.26, shoulder: 0.1, capH: 0.1, cap: '#6b1e24' },
  beer: { neck: 0.3, neckW: 0.28, shoulder: 0.14, capH: 0.04, cap: '#c9a646' },
  kombucha: { neck: 0.16, neckW: 0.42, shoulder: 0.12, capH: 0.06, cap: '#2d2d2d' },
  juice: { neck: 0.12, neckW: 0.5, shoulder: 0.1, capH: 0.07, cap: '#f4f1ea' },
  spirit: { neck: 0.18, neckW: 0.3, shoulder: 0.06, capH: 0.1, cap: '#2a2622', square: true },
  woozy: { neck: 0.42, neckW: 0.22, shoulder: 0.2, capH: 0.08, cap: '#1d1d1d' },
  oil: { neck: 0.3, neckW: 0.24, shoulder: 0.16, capH: 0.06, cap: '#b89a3c' },
  toner: { neck: 0.1, neckW: 0.36, shoulder: 0.08, capH: 0.12, cap: '#e8e1d7' },
};
function bottle(e, x, baseY, H, c, o) {
  const k = o || {}; const st = BOTTLE[k.style] || BOTTLE.kombucha;
  const W = H * (k.style === 'wine' || k.style === 'woozy' || k.style === 'oil' ? 0.3 : k.style === 'spirit' ? 0.42 : 0.36), r = W / 2, top = baseY - H;
  const neckTop = top + H * st.capH, neckBot = top + H * (st.capH + st.neck), shoulderBot = neckBot + H * st.shoulder, nr = r * st.neckW / 0.5 * 0.5;
  const glass = k.glass || c;
  let s = e.shadow(x + W * 0.2, baseY + 2, W * 0.8, W * 0.14);
  const outline = st.square
    ? `M${n1(x - nr)} ${n1(neckTop)} L${n1(x + nr)} ${n1(neckTop)} L${n1(x + nr)} ${n1(neckBot)} L${n1(x + r)} ${n1(shoulderBot)} L${n1(x + r)} ${n1(baseY)} L${n1(x - r)} ${n1(baseY)} L${n1(x - r)} ${n1(shoulderBot)} L${n1(x - nr)} ${n1(neckBot)} Z`
    : `M${n1(x - nr)} ${n1(neckTop)} L${n1(x + nr)} ${n1(neckTop)} L${n1(x + nr)} ${n1(neckBot)} C${n1(x + nr)} ${n1(neckBot + H * st.shoulder * 0.5)} ${n1(x + r)} ${n1(neckBot + H * st.shoulder * 0.4)} ${n1(x + r)} ${n1(shoulderBot)} L${n1(x + r)} ${n1(baseY - W * 0.08)} Q${n1(x + r)} ${n1(baseY)} ${n1(x + r - W * 0.1)} ${n1(baseY)} L${n1(x - r + W * 0.1)} ${n1(baseY)} Q${n1(x - r)} ${n1(baseY)} ${n1(x - r)} ${n1(baseY - W * 0.08)} L${n1(x - r)} ${n1(shoulderBot)} C${n1(x - r)} ${n1(neckBot + H * st.shoulder * 0.4)} ${n1(x - nr)} ${n1(neckBot + H * st.shoulder * 0.5)} ${n1(x - nr)} ${n1(neckBot)} Z`;
  s += path(outline, e.cyl(glass, { edge: 0.45, hi: 0.35 }));
  // the liquid line inside clear glass
  if (k.liquid) s += rect(x - r + 2 * e.s, shoulderBot + H * 0.04, W - 4 * e.s, baseY - shoulderBot - H * 0.06, e.cyl(k.liquid, { edge: 0.3, hi: 0.2 }), { opacity: 0.9, rx: 3 * e.s });
  // cap / cork
  s += rect(x - nr * 1.12, top, nr * 2.24, H * st.capH + 2, e.cyl(k.cap || st.cap, { edge: 0.35 }), { rx: 2 * e.s });
  if (k.style === 'beer') for (let i = 0; i < 7; i++) s += line(x - nr * 1.12 + i * nr * 0.37, top + H * st.capH, x - nr * 1.12 + i * nr * 0.37, top + H * st.capH + 3 * e.s, darken(st.cap, 0.3), 1);
  // label
  const lt = shoulderBot + (baseY - shoulderBot) * 0.16, lh = (baseY - shoulderBot) * (k.tallLabel ? 0.62 : 0.46);
  const lc = k.labelColour || '#f3eee6';
  s += rect(x - r, lt, W, lh, e.cyl(lc, { edge: 0.22, hi: 0.15 }));
  if (k.labelBand) s += rect(x - r, lt + lh * 0.72, W, lh * 0.12, e.cyl(k.labelBand, { edge: 0.25 }));
  if (k.label) s += wordmark(e, k.label, x, lt + lh * 0.5, Math.min(W * 0.2, lh * 0.22), inkOn(lc), { maxWidth: W * 0.8, upper: true, spacing: '0.06em', serif: k.serif });
  if (k.fruit) s += flavourPiece(e, k.fruit, x, lt + lh * 0.8, W * 0.1);
  s += e.hi(x - r * 0.62, shoulderBot + 4 * e.s, W * 0.08, (baseY - shoulderBot) * 0.8, 0.3) + e.hi(x - nr * 0.5, neckTop + 4 * e.s, W * 0.05, neckBot - neckTop, 0.25);
  if (k.cold) s += droplets(e, x - r * 0.9, shoulderBot, W * 0.85, (baseY - shoulderBot) * 0.9, 18);
  return s;
}
// skincare: dropper bottle (serum, face oil)
function dropper(e, x, baseY, H, c, o) {
  const k = o || {}; const W = H * 0.42, r = W / 2;
  const bodyTop = baseY - H * 0.56, collarTop = bodyTop - H * 0.1, bulbTop = baseY - H;
  const glass = c || '#b8742f';
  let s = e.shadow(x + W * 0.2, baseY + 2, W * 0.85, W * 0.14);
  s += path(`M${n1(x - r * 0.46)} ${n1(bodyTop - H * 0.02)} L${n1(x + r * 0.46)} ${n1(bodyTop - H * 0.02)} C${n1(x + r * 0.5)} ${n1(bodyTop + H * 0.04)} ${n1(x + r)} ${n1(bodyTop + H * 0.03)} ${n1(x + r)} ${n1(bodyTop + H * 0.11)} L${n1(x + r)} ${n1(baseY - W * 0.1)} Q${n1(x + r)} ${n1(baseY)} ${n1(x + r - W * 0.12)} ${n1(baseY)} L${n1(x - r + W * 0.12)} ${n1(baseY)} Q${n1(x - r)} ${n1(baseY)} ${n1(x - r)} ${n1(baseY - W * 0.1)} L${n1(x - r)} ${n1(bodyTop + H * 0.11)} C${n1(x - r)} ${n1(bodyTop + H * 0.03)} ${n1(x - r * 0.5)} ${n1(bodyTop + H * 0.04)} ${n1(x - r * 0.46)} ${n1(bodyTop - H * 0.02)} Z`, e.cyl(glass, { edge: 0.5, hi: 0.35 }), { opacity: 0.96 });
  // the serum inside + the glass pipette
  s += rect(x - r + 3 * e.s, bodyTop + H * 0.2, W - 6 * e.s, baseY - bodyTop - H * 0.23, e.cyl(lighten(glass, 0.25), { edge: 0.3 }), { opacity: 0.5, rx: 3 * e.s });
  s += rect(x - W * 0.045, collarTop + H * 0.08, W * 0.09, H * 0.44, '#f4efe7', { opacity: 0.55, rx: W * 0.045 });
  // collar and rubber bulb
  const cap = k.cap || '#1f1d1b';
  s += rect(x - r * 0.52, collarTop, r * 1.04, H * 0.11, e.cyl(cap, { edge: 0.4, hi: 0.3 }), { rx: 2 * e.s });
  for (let i = 1; i < 6; i++) s += line(x - r * 0.52 + i * r * 0.173, collarTop + 2 * e.s, x - r * 0.52 + i * r * 0.173, collarTop + H * 0.1, darken(cap, 0.4), 0.8 * e.s, { opacity: 0.6 });
  s += path(`M${n1(x - r * 0.34)} ${n1(collarTop)} L${n1(x - r * 0.36)} ${n1(bulbTop + H * 0.12)} Q${n1(x - r * 0.38)} ${n1(bulbTop)} ${n1(x)} ${n1(bulbTop)} Q${n1(x + r * 0.38)} ${n1(bulbTop)} ${n1(x + r * 0.36)} ${n1(bulbTop + H * 0.12)} L${n1(x + r * 0.34)} ${n1(collarTop)} Z`, e.cyl(k.bulb || cap, { edge: 0.35, hi: 0.3 }));
  // label
  const lc = k.labelColour || '#f5f0e8';
  const lt = bodyTop + H * 0.18, lh = H * 0.2;
  s += rect(x - r, lt, W, lh, e.cyl(lc, { edge: 0.2, hi: 0.12 }));
  if (k.label) s += wordmark(e, k.label, x, lt + lh * 0.45, Math.min(W * 0.14, lh * 0.3), inkOn(lc), { maxWidth: W * 0.8, upper: true, spacing: '0.12em', weight: 700 });
  if (k.sub) s += wordmark(e, k.sub, x, lt + lh * 0.78, Math.min(W * 0.09, lh * 0.18), inkOn(lc), { maxWidth: W * 0.7, weight: 500, spacing: '0.1em', upper: true, opacity: 0.7 });
  s += e.hi(x - r * 0.64, bodyTop + H * 0.12, W * 0.07, H * 0.36, 0.35);
  return s;
}
// skincare: pump bottle (cleanser, lotion, body wash)
function pump(e, x, baseY, H, c, o) {
  const k = o || {}; const W = H * 0.34, r = W / 2;
  const bodyTop = baseY - H * 0.72, collarTop = bodyTop - H * 0.06, stemTop = collarTop - H * 0.1, headTop = stemTop - H * 0.07;
  let s = e.shadow(x + W * 0.2, baseY + 2, W * 0.8, W * 0.14);
  s += path(`M${n1(x - r)} ${n1(bodyTop + W * 0.16)} Q${n1(x - r)} ${n1(bodyTop)} ${n1(x - r + W * 0.18)} ${n1(bodyTop)} L${n1(x + r - W * 0.18)} ${n1(bodyTop)} Q${n1(x + r)} ${n1(bodyTop)} ${n1(x + r)} ${n1(bodyTop + W * 0.16)} L${n1(x + r)} ${n1(baseY - W * 0.08)} Q${n1(x + r)} ${n1(baseY)} ${n1(x + r - W * 0.1)} ${n1(baseY)} L${n1(x - r + W * 0.1)} ${n1(baseY)} Q${n1(x - r)} ${n1(baseY)} ${n1(x - r)} ${n1(baseY - W * 0.08)} Z`, e.cyl(c, { edge: 0.3, hi: 0.3 }));
  const cap = k.cap || '#2a2724';
  s += rect(x - r * 0.42, collarTop, r * 0.84, H * 0.065, e.cyl(cap), { rx: 2 * e.s }) + rect(x - r * 0.12, stemTop, r * 0.24, H * 0.1, e.cyl(lighten(cap, 0.1)));
  s += path(`M${n1(x - r * 0.4)} ${n1(stemTop)} L${n1(x - r * 0.4)} ${n1(headTop + 3 * e.s)} Q${n1(x - r * 0.4)} ${n1(headTop)} ${n1(x - r * 0.3)} ${n1(headTop)} L${n1(x + r * 1.05)} ${n1(headTop)} Q${n1(x + r * 1.15)} ${n1(headTop)} ${n1(x + r * 1.15)} ${n1(headTop + H * 0.025)} L${n1(x + r * 1.15)} ${n1(headTop + H * 0.04)} L${n1(x + r * 0.35)} ${n1(headTop + H * 0.045)} L${n1(x + r * 0.4)} ${n1(stemTop)} Z`, e.cyl(cap, { edge: 0.3 }));
  const lc = k.labelColour || lighten(c, 0.8);
  const lt = bodyTop + H * 0.2, lh = H * 0.3;
  s += rect(x - r, lt, W, lh, e.cyl(lc, { edge: 0.18, hi: 0.1 }));
  if (k.label) s += wordmark(e, k.label, x, lt + lh * 0.42, Math.min(W * 0.16, lh * 0.2), inkOn(lc), { maxWidth: W * 0.8, upper: true, spacing: '0.1em', weight: 700 });
  if (k.sub) s += wordmark(e, k.sub, x, lt + lh * 0.66, Math.min(W * 0.1, lh * 0.12), inkOn(lc), { maxWidth: W * 0.72, weight: 500, spacing: '0.1em', upper: true, opacity: 0.7 });
  s += e.hi(x - r * 0.62, bodyTop + H * 0.05, W * 0.08, H * 0.6, 0.3);
  return s;
}
// jar: cream, balm, honey, jam, sauce; `open` shows the contents from above
function jar(e, x, baseY, H, c, o) {
  const k = o || {}; const W = H * (k.wide || 1.25), r = W / 2, top = baseY - H;
  const lidH = H * (k.open ? 0 : 0.26), er = W * 0.12;
  let s = e.shadow(x + W * 0.15, baseY + 2, W * 0.66, W * 0.1);
  s += path(`M${n1(x - r)} ${n1(top + lidH)} L${n1(x + r)} ${n1(top + lidH)} L${n1(x + r)} ${n1(baseY - er * 0.5)} Q${n1(x + r)} ${n1(baseY)} ${n1(x + r - er)} ${n1(baseY)} L${n1(x - r + er)} ${n1(baseY)} Q${n1(x - r)} ${n1(baseY)} ${n1(x - r)} ${n1(baseY - er * 0.5)} Z`, e.cyl(c, { edge: 0.3, hi: 0.3 }));
  if (k.contents) s += rect(x - r + 3 * e.s, top + lidH + H * 0.12, W - 6 * e.s, H * 0.8 - lidH, e.cyl(k.contents, { edge: 0.25, hi: 0.15 }), { opacity: 0.85, rx: 3 * e.s });
  if (!k.open) {
    const lid = k.lid || '#e8e2d8';
    s += rect(x - r * 1.03, top, W * 1.03, lidH, e.cyl(lid, { edge: 0.3, hi: 0.35 }), { rx: 3 * e.s }) + ell(x, top, r * 1.03, er * 0.55, lighten(lid, 0.2));
    if (k.ribs) for (let i = 1; i < 14; i++) s += line(x - r * 1.03 + i * W * 1.03 / 14, top + 2, x - r * 1.03 + i * W * 1.03 / 14, top + lidH - 2, darken(lid, 0.2), 0.8 * e.s, { opacity: 0.5 });
  } else {
    s += ell(x, top, r, er, darken(c, 0.2)) + ell(x, top + 1, r * 0.9, er * 0.82, k.fill || '#f6f0e6');
    // a swirl in the cream
    s += path(`M${n1(x - r * 0.5)} ${n1(top)} Q${n1(x - r * 0.1)} ${n1(top - er * 0.9)} ${n1(x + r * 0.35)} ${n1(top - er * 0.2)} Q${n1(x + r * 0.1)} ${n1(top + er * 0.4)} ${n1(x - r * 0.15)} ${n1(top)}`, 'none', { stroke: darken(k.fill || '#f6f0e6', 0.12), 'stroke-width': n1(2 * e.s), opacity: 0.8 });
  }
  const lc = k.labelColour || lighten(c, 0.82);
  if (!k.noLabel) {
    const lt = top + lidH + (H - lidH) * 0.22, lh = (H - lidH) * 0.5;
    s += rect(x - r, lt, W, lh, e.cyl(lc, { edge: 0.18, hi: 0.1 }));
    if (k.label) s += wordmark(e, k.label, x, lt + lh * 0.48, Math.min(W * 0.1, lh * 0.28), inkOn(lc), { maxWidth: W * 0.8, upper: true, spacing: '0.12em', weight: 700, serif: k.serif });
    if (k.sub) s += wordmark(e, k.sub, x, lt + lh * 0.78, Math.min(W * 0.06, lh * 0.16), inkOn(lc), { maxWidth: W * 0.7, weight: 500, spacing: '0.12em', upper: true, opacity: 0.7 });
  }
  s += e.hi(x - r * 0.7, top + lidH + 4 * e.s, W * 0.05, (H - lidH) * 0.75, 0.3);
  return s;
}
// tube: sunscreen, hand cream, gel -- lying at an angle, cap to the lower left
function tube(e, x, y, L, c, o) {
  const k = o || {}; const W = L * 0.26;
  let s = e.shadow(x + L * 0.05, y + W * 0.62, L * 0.55, W * 0.14);
  const body = `M${n1(-L * 0.36)} ${n1(-W * 0.4)} L${n1(L * 0.44)} ${n1(-W * 0.52)} L${n1(L * 0.5)} ${n1(-W * 0.52)} L${n1(L * 0.5)} ${n1(W * 0.52)} L${n1(L * 0.44)} ${n1(W * 0.52)} L${n1(-L * 0.36)} ${n1(W * 0.4)} Z`;
  let inner = path(body, e.lin([[0, lighten(c, 0.3)], [0.35, c], [1, darken(c, 0.3)]], { x1: 0, y1: 0, x2: 0, y2: 1 }));
  inner += rect(L * 0.44, -W * 0.54, L * 0.07, W * 1.08, darken(c, 0.1));
  for (let i = 0; i < 6; i++) inner += line(L * 0.45 + i * L * 0.01, -W * 0.52, L * 0.45 + i * L * 0.01, W * 0.52, darken(c, 0.25), 0.7 * e.s, { opacity: 0.5 });
  const cap = k.cap || '#f2eee8';
  inner += rect(-L * 0.52, -W * 0.36, L * 0.17, W * 0.72, e.lin([[0, lighten(cap, 0.2)], [1, darken(cap, 0.25)]], { x1: 0, y1: 0, x2: 0, y2: 1 }), { rx: W * 0.1 });
  const lc = k.labelColour || lighten(c, 0.85);
  inner += rect(-L * 0.24, -W * 0.3, L * 0.5, W * 0.6, lc, { rx: 3 * e.s, opacity: 0.95 });
  if (k.label) inner += wordmark(e, k.label, L * 0.01, W * 0.02, Math.min(W * 0.26, L * 0.06), inkOn(lc), { maxWidth: L * 0.44, upper: true, spacing: '0.1em', weight: 700 });
  if (k.sub) inner += wordmark(e, k.sub, L * 0.01, W * 0.2, Math.min(W * 0.14, L * 0.035), inkOn(lc), { maxWidth: L * 0.36, weight: 500, upper: true, spacing: '0.1em', opacity: 0.7 });
  inner += rect(-L * 0.3, -W * 0.34, L * 0.7, W * 0.07, '#fff', { opacity: 0.3, rx: W * 0.03 });
  return s + g(inner, { transform: `translate(${n1(x)} ${n1(y)}) rotate(${k.angle == null ? -14 : k.angle})` });
}
// tin: balm, salve, pomade -- a short wide cylinder seen from above-front
function tin(e, x, baseY, W, c, o) {
  const k = o || {}; const H = W * 0.34, r = W / 2, top = baseY - H, er = W * 0.2;
  let s = e.shadow(x + W * 0.1, baseY + 3, W * 0.6, er * 0.5);
  s += path(`M${n1(x - r)} ${n1(top)} L${n1(x - r)} ${n1(baseY)} A${n1(r)} ${n1(er)} 0 0 0 ${n1(x + r)} ${n1(baseY)} L${n1(x + r)} ${n1(top)} Z`, e.cyl(c, { edge: 0.35, hi: 0.4 }));
  s += ell(x, top, r, er, e.rad([[0, lighten(c, 0.45)], [0.7, lighten(c, 0.1)], [1, darken(c, 0.15)]], { cx: 0.4, cy: 0.35, r: 0.7 }));
  s += ell(x, top, r * 0.8, er * 0.8, 'none', { stroke: darken(c, 0.15), 'stroke-width': n1(1.5 * e.s), opacity: 0.6 });
  if (k.label) s += wordmark(e, k.label, x, top + er * 0.15, Math.min(W * 0.12, er * 0.5), darken(c, 0.55), { maxWidth: W * 0.62, upper: true, spacing: '0.14em', weight: 700, opacity: 0.85 });
  return s;
}
// stand-up pouch: coffee, granola, tea, snacks
function pouch(e, x, baseY, H, c, o) {
  const k = o || {}; const W = H * 0.7, r = W / 2, top = baseY - H;
  let s = e.shadow(x + W * 0.15, baseY + 2, W * 0.62, W * 0.08);
  s += path(`M${n1(x - r * 0.96)} ${n1(top)} L${n1(x + r * 0.96)} ${n1(top)} L${n1(x + r)} ${n1(baseY - H * 0.1)} Q${n1(x + r * 0.98)} ${n1(baseY)} ${n1(x + r * 0.8)} ${n1(baseY)} L${n1(x - r * 0.8)} ${n1(baseY)} Q${n1(x - r * 0.98)} ${n1(baseY)} ${n1(x - r)} ${n1(baseY - H * 0.1)} Z`, e.lin([[0, darken(c, 0.2)], [0.25, lighten(c, 0.18)], [0.55, c], [1, darken(c, 0.3)]]));
  s += rect(x - r * 0.96, top, W * 0.96, H * 0.06, darken(c, 0.12)) + line(x - r * 0.9, top + H * 0.1, x + r * 0.9, top + H * 0.1, darken(c, 0.3), 1.2 * e.s, { opacity: 0.6 });
  for (let i = 0; i < 16; i++) s += line(x - r * 0.94 + i * W * 0.12, top + 1, x - r * 0.94 + i * W * 0.12 + 3 * e.s, top + H * 0.05, darken(c, 0.25), 0.8 * e.s, { opacity: 0.35 });
  if (k.valve) s += circ(x + r * 0.5, top + H * 0.2, W * 0.05, darken(c, 0.25)) + circ(x + r * 0.5, top + H * 0.2, W * 0.025, darken(c, 0.4));
  const lc = k.labelColour || '#f3ede3';
  const lt = top + H * 0.34, lh = H * 0.36;
  s += rect(x - r * 0.72, lt, W * 0.72, lh, lc, { rx: 4 * e.s });
  if (k.label) s += wordmark(e, k.label, x, lt + lh * 0.42, Math.min(W * 0.1, lh * 0.2), inkOn(lc), { maxWidth: W * 0.6, upper: true, spacing: '0.12em', weight: 800 });
  if (k.sub) s += wordmark(e, k.sub, x, lt + lh * 0.7, Math.min(W * 0.06, lh * 0.12), inkOn(lc), { maxWidth: W * 0.58, weight: 500, spacing: '0.12em', upper: true, opacity: 0.7 });
  s += path(`M${n1(x - r * 0.8)} ${n1(baseY - H * 0.05)} Q${n1(x)} ${n1(baseY - H * 0.14)} ${n1(x + r * 0.8)} ${n1(baseY - H * 0.05)}`, 'none', { stroke: darken(c, 0.3), 'stroke-width': n1(1.2 * e.s), opacity: 0.5 });
  s += e.hi(x - r * 0.78, top + H * 0.14, W * 0.05, H * 0.7, 0.25);
  return s;
}
// candle in a glass/ceramic vessel, lit
function candle(e, x, baseY, H, c, o) {
  const k = o || {}; const W = H * 1.02, r = W / 2, top = baseY - H, er = W * 0.14;
  let s = circ(x, top - H * 0.28, H * 0.55, e.rad([[0, '#ffd88a', 0.55], [1, '#ffd88a', 0]])) + e.shadow(x + W * 0.1, baseY + 2, W * 0.62, er * 0.6);
  s += path(`M${n1(x - r)} ${n1(top)} L${n1(x - r)} ${n1(baseY - er * 0.5)} Q${n1(x - r)} ${n1(baseY)} ${n1(x - r + er)} ${n1(baseY)} L${n1(x + r - er)} ${n1(baseY)} Q${n1(x + r)} ${n1(baseY)} ${n1(x + r)} ${n1(baseY - er * 0.5)} L${n1(x + r)} ${n1(top)} Z`, e.cyl(c, { edge: 0.35, hi: 0.3 }));
  s += ell(x, top, r, er, darken(c, 0.15)) + ell(x, top + er * 0.35, r * 0.9, er * 0.75, e.rad([[0, '#fff8e8'], [1, '#eadbc0']], { cx: 0.5, cy: 0.4 }));
  s += line(x, top + er * 0.3, x, top - H * 0.05, '#2a2420', 1.6 * e.s);
  s += path(`M${n1(x)} ${n1(top - H * 0.28)} Q${n1(x + H * 0.07)} ${n1(top - H * 0.14)} ${n1(x)} ${n1(top - H * 0.04)} Q${n1(x - H * 0.07)} ${n1(top - H * 0.14)} ${n1(x)} ${n1(top - H * 0.28)} Z`, e.lin([[0, '#fff5c2'], [0.6, '#ffb341'], [1, '#e8642a']], { x1: 0, y1: 0, x2: 0, y2: 1 }));
  const lc = k.labelColour || '#f4efe6';
  if (!k.noLabel) {
    s += rect(x - r * 0.62, top + H * 0.34, W * 0.62, H * 0.36, lc, { rx: 3 * e.s });
    if (k.label) s += wordmark(e, k.label, x, top + H * 0.5, Math.min(W * 0.08, H * 0.1), inkOn(lc), { maxWidth: W * 0.52, upper: true, spacing: '0.12em', weight: 700, serif: true });
    if (k.sub) s += wordmark(e, k.sub, x, top + H * 0.62, Math.min(W * 0.05, H * 0.06), inkOn(lc), { maxWidth: W * 0.5, weight: 500, spacing: '0.14em', upper: true, opacity: 0.7 });
  }
  s += e.hi(x - r * 0.75, top + H * 0.08, W * 0.05, H * 0.7, 0.3);
  return s;
}
// thrown ceramic: vase / mug / bowl, speckled glaze
function ceramic(e, x, baseY, H, c, o) {
  const k = o || {}; const kind = k.form || 'vase'; let s = '';
  const glaze = e.cyl(c, { edge: 0.35, hi: 0.25 });
  if (kind === 'mug') {
    const W = H * 0.9, r = W / 2, top = baseY - H;
    s += e.shadow(x + W * 0.1, baseY + 2, W * 0.7, W * 0.1);
    s += path(`M${n1(x + r * 0.9)} ${n1(top + H * 0.25)} Q${n1(x + r * 1.55)} ${n1(top + H * 0.28)} ${n1(x + r * 1.5)} ${n1(top + H * 0.55)} Q${n1(x + r * 1.45)} ${n1(top + H * 0.8)} ${n1(x + r * 0.9)} ${n1(top + H * 0.75)}`, 'none', { stroke: darken(c, 0.1), 'stroke-width': n1(H * 0.1), 'stroke-linecap': 'round' });
    s += path(`M${n1(x - r)} ${n1(top)} L${n1(x - r * 0.94)} ${n1(baseY - H * 0.06)} Q${n1(x - r * 0.92)} ${n1(baseY)} ${n1(x - r * 0.8)} ${n1(baseY)} L${n1(x + r * 0.8)} ${n1(baseY)} Q${n1(x + r * 0.92)} ${n1(baseY)} ${n1(x + r * 0.94)} ${n1(baseY - H * 0.06)} L${n1(x + r)} ${n1(top)} Z`, glaze);
    s += ell(x, top, r, W * 0.1, darken(c, 0.25)) + ell(x, top + 2, r * 0.9, W * 0.08, k.drink || '#6b4a33');
  } else if (kind === 'bowl') {
    const W = H * 2, r = W / 2, top = baseY - H;
    s += e.shadow(x + W * 0.08, baseY + 2, W * 0.5, H * 0.14);
    s += path(`M${n1(x - r)} ${n1(top)} Q${n1(x - r)} ${n1(baseY)} ${n1(x)} ${n1(baseY)} Q${n1(x + r)} ${n1(baseY)} ${n1(x + r)} ${n1(top)} Z`, glaze) + ell(x, top, r, H * 0.2, darken(c, 0.2)) + ell(x, top + 2, r * 0.92, H * 0.15, lighten(c, 0.15));
  } else {
    const W = H * 0.62, r = W / 2, top = baseY - H;
    s += e.shadow(x + W * 0.15, baseY + 2, W * 0.7, W * 0.12);
    s += path(`M${n1(x - r * 0.34)} ${n1(top)} L${n1(x + r * 0.34)} ${n1(top)} Q${n1(x + r * 0.3)} ${n1(top + H * 0.2)} ${n1(x + r * 0.62)} ${n1(top + H * 0.34)} Q${n1(x + r * 1.1)} ${n1(top + H * 0.55)} ${n1(x + r * 0.9)} ${n1(baseY - H * 0.08)} Q${n1(x + r * 0.8)} ${n1(baseY)} ${n1(x + r * 0.5)} ${n1(baseY)} L${n1(x - r * 0.5)} ${n1(baseY)} Q${n1(x - r * 0.8)} ${n1(baseY)} ${n1(x - r * 0.9)} ${n1(baseY - H * 0.08)} Q${n1(x - r * 1.1)} ${n1(top + H * 0.55)} ${n1(x - r * 0.62)} ${n1(top + H * 0.34)} Q${n1(x - r * 0.3)} ${n1(top + H * 0.2)} ${n1(x - r * 0.34)} ${n1(top)} Z`, glaze);
    s += ell(x, top, r * 0.34, W * 0.05, darken(c, 0.35));
    if (k.stems) s += sprig(e, x - 2, top + 2, H * 0.55, -100) + sprig(e, x + 2, top + 2, H * 0.45, -70, e.tint('#8aa46a'));
  }
  // speckles in the glaze
  const R = rng(hashStr(`sp${x}${baseY}`)); for (let i = 0; i < 26; i++) s += circ(x + (R() - 0.5) * H * 0.55, baseY - R() * H * 0.9, (0.6 + R()) * e.s, darken(c, 0.4), { opacity: 0.35 });
  return s;
}

module.exports = {
  FLAVOUR_COLOURS, FLAVOUR_KEYS, flavourColour, mix, lighten, darken, inkOn, lum, hashStr, rng, esc,
  makeEnv, studio, outdoors, room, cityline, grain, leaf, sprig, citrusWheel, roundFruit, halfFruit, flavourPiece, beanPile, bean, bubbles, droplets,
  wordmark, can, bottle, dropper, pump, jar, tube, tin, pouch, candle, ceramic, chili,
  _svg: { el, rect, circ, ell, path, line, g, P, n1 },
};
