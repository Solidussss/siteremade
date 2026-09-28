'use strict';
// HERO FRAMING -- keeps each layer's main subject in view.
//
// A hero layer is a frame (placed on the stage, moving on its own track) with a
// picture inside it (oversized by 7% each side and panned/zoomed on its own
// camera move). The same wide drawing cropped into a narrow phone frame, or
// sitting behind the headline, can lose its subject entirely -- the roofing
// lead once showed grass and a tree while the house was cut away. So every
// drawn layer is framed on purpose:
//
//   subjectBox(svg)       where the subject is: the union of the drawing's
//                         [data-subject] groups (see hero-art-kinds.js).
//   stableWindow(pan)     the part of the picture that stays visible through the
//                         whole pan/zoom loop (fractions of the picture).
//   occludersFor(...)     what covers this frame: layers above it (across their
//                         own motion) and, behind bottom-left copy, the words.
//   visibleShare(...)     how much of the subject a viewer actually sees:
//                         inside the stable window, inside the frame's shape
//                         (circle / arch), not under another frame or the copy.
//
// Pure functions: the live preview and the export compute identical framing.

const OVERSIZE = 0.07; // .sb-media inset:-7%
// the motion of the picture inside its frame (mirrors PANS in hero-storyboard.js)
const PAN_MOTION = {
  none: [[0, 0, 1], [0, 0, 1]],
  'pan-left': [[4, 0, 1.06], [-4, 0, 1.06]],
  'pan-right': [[-4, 0, 1.06], [4, 0, 1.06]],
  'pan-up': [[0, 4, 1.06], [0, -4, 1.06]],
  'zoom-in': [[0, 0, 1], [0, 0, 1.14]],
  'zoom-out': [[0, 0, 1.14], [0, 0, 1]],
};

// ---- the subject's bounds in an SVG fragment ------------------------------------------------------------------------
const mul = (a, b) => [a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1], a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3], a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5]];
const ID = [1, 0, 0, 1, 0, 0];
function parseTransform(t) {
  let m = ID; const re = /(matrix|translate|scale|rotate)\s*\(([^)]*)\)/g; let r;
  while ((r = re.exec(String(t || '')))) {
    const v = r[2].trim().split(/[\s,]+/).map(Number).filter(Number.isFinite);
    let k = ID;
    if (r[1] === 'translate') k = [1, 0, 0, 1, v[0] || 0, v[1] || 0];
    else if (r[1] === 'scale') k = [v[0] == null ? 1 : v[0], 0, 0, v[1] == null ? (v[0] == null ? 1 : v[0]) : v[1], 0, 0];
    else if (r[1] === 'matrix' && v.length === 6) k = v;
    else if (r[1] === 'rotate') {
      const a = (v[0] || 0) * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
      k = [c, s, -s, c, 0, 0];
      if (v.length >= 3) k = mul(mul([1, 0, 0, 1, v[1], v[2]], k), [1, 0, 0, 1, -v[1], -v[2]]);
    }
    m = mul(m, k);
  }
  return m;
}
const attr = (s, name) => { const r = new RegExp(`(?:^|\\s)${name}="([^"]*)"`).exec(s); return r ? r[1] : null; };
const num = (s, name, d) => { const v = parseFloat(attr(s, name)); return Number.isFinite(v) ? v : d; };
// every point a path passes through or pulls toward (control points slightly over-state the bounds -- fine)
function pathPoints(d) {
  const toks = String(d || '').match(/[a-zA-Z]|-?(?:\d+\.?\d*|\.\d+)(?:e-?\d+)?/g) || [];
  const pts = []; let i = 0, cmd = 'M', x = 0, y = 0, sx = 0, sy = 0;
  const n = () => parseFloat(toks[i++]);
  while (i < toks.length) {
    if (/[a-zA-Z]/.test(toks[i])) cmd = toks[i++];
    const rel = cmd === cmd.toLowerCase(); const C = cmd.toUpperCase();
    if (C === 'Z') { x = sx; y = sy; if (i < toks.length && !/[a-zA-Z]/.test(toks[i])) i++; continue; }
    const take = k => { const out = []; for (let q = 0; q < k; q++) out.push(n()); return out; };
    const pt = (px, py) => { const X = rel ? x + px : px, Y = rel ? y + py : py; pts.push([X, Y]); return [X, Y]; };
    if (C === 'M' || C === 'L' || C === 'T') { const [a, b] = take(2); [x, y] = pt(a, b); if (C === 'M') { sx = x; sy = y; cmd = rel ? 'l' : 'L'; } }
    else if (C === 'H') { const [a] = take(1); x = rel ? x + a : a; pts.push([x, y]); }
    else if (C === 'V') { const [a] = take(1); y = rel ? y + a : a; pts.push([x, y]); }
    else if (C === 'Q' || C === 'S') { const v = take(4); pt(v[0], v[1]); [x, y] = pt(v[2], v[3]); }
    else if (C === 'C') { const v = take(6); pt(v[0], v[1]); pt(v[2], v[3]); [x, y] = pt(v[4], v[5]); }
    else if (C === 'A') { const v = take(7); const r = Math.max(Math.abs(v[0]), Math.abs(v[1])); const [ex, ey] = [rel ? x + v[5] : v[5], rel ? y + v[6] : v[6]]; pts.push([x, y], [ex, ey], [(x + ex) / 2, (y + ey) / 2 - r], [(x + ex) / 2, (y + ey) / 2 + r]); x = ex; y = ey; }
    else i++;
    if ([x, y].some(v => !Number.isFinite(v))) return pts.filter(p => p.every(Number.isFinite));
  }
  return pts;
}
// the points of one drawable element, in its own coordinates
function shapePoints(tag, a, inner) {
  if (tag === 'rect') { const x = num(a, 'x', 0), y = num(a, 'y', 0), w = num(a, 'width', 0), h = num(a, 'height', 0); return [[x, y], [x + w, y], [x, y + h], [x + w, y + h]]; }
  if (tag === 'circle') { const cx = num(a, 'cx', 0), cy = num(a, 'cy', 0), r = num(a, 'r', 0); return [[cx - r, cy - r], [cx + r, cy - r], [cx - r, cy + r], [cx + r, cy + r]]; }
  if (tag === 'ellipse') { const cx = num(a, 'cx', 0), cy = num(a, 'cy', 0), rx = num(a, 'rx', 0), ry = num(a, 'ry', 0); return [[cx - rx, cy - ry], [cx + rx, cy - ry], [cx - rx, cy + ry], [cx + rx, cy + ry]]; }
  if (tag === 'line') { const w = num(a, 'stroke-width', 1) / 2; const x1 = num(a, 'x1', 0), y1 = num(a, 'y1', 0), x2 = num(a, 'x2', 0), y2 = num(a, 'y2', 0); return [[x1 - w, y1 - w], [x2 + w, y2 + w], [x1 + w, y1 + w], [x2 - w, y2 - w]]; }
  if (tag === 'path') return pathPoints(attr(a, 'd'));
  if (tag === 'polygon' || tag === 'polyline') { const v = String(attr(a, 'points') || '').trim().split(/[\s,]+/).map(Number); const out = []; for (let i = 0; i + 1 < v.length; i += 2) out.push([v[i], v[i + 1]]); return out; }
  if (tag === 'text') {
    const fs = num(a, 'font-size', 12); const x = num(a, 'x', 0), y = num(a, 'y', 0); const len = String(inner || '').replace(/&[a-z#0-9]+;/g, 'x').length;
    // a declared textLength is the width the text is drawn at (lengthAdjust); otherwise an estimate. A little margin
    // either side: a label is only readable when its first and last letters are
    const tl = num(a, 'textLength', NaN); const w = (Number.isFinite(tl) ? tl : len * fs * 0.62) * 1.08; const anchor = attr(a, 'text-anchor') || 'start';
    const x0 = anchor === 'middle' ? x - w / 2 : anchor === 'end' ? x - w : x; return [[x0, y - fs * 0.85], [x0 + w, y + fs * 0.25]];
  }
  return [];
}
const DRAWN = new Set(['rect', 'circle', 'ellipse', 'line', 'path', 'polygon', 'polyline', 'text']);
// bounds of the drawn geometry; { subjectOnly } limits it to [data-subject] groups.
// Blurred shadows and faint glows are not the subject's outline and are skipped.
function svgBox(svg, o) {
  const k = o || {}; const s = String(svg || '');
  const re = /<(\/?)([a-zA-Z]+)((?:\s+[^\s=>\/]+="[^"]*")*)\s*(\/?)>/g; let r;
  const stack = [{ m: ID, subj: false, defs: false }]; let box = null; const texts = [];
  while ((r = re.exec(s))) {
    const [, close, tag, a, self] = r; const top = stack[stack.length - 1];
    if (close) { if (tag === 'g' || tag === 'svg' || tag === 'defs' || tag === 'clipPath' || tag === 'mask' || tag === 'symbol') stack.length > 1 && stack.pop(); continue; }
    if (tag === 'g' || tag === 'svg' || tag === 'defs' || tag === 'clipPath' || tag === 'mask' || tag === 'symbol') {
      const frame = { m: tag === 'g' ? mul(top.m, parseTransform(attr(a, 'transform'))) : top.m, subj: top.subj || /\sdata-subject="1"/.test(a), defs: top.defs || tag !== 'g' && tag !== 'svg', faint: top.faint || (tag === 'g' && num(a, 'opacity', 1) < 0.2) };
      if (!self) stack.push(frame); continue;
    }
    if (!DRAWN.has(tag) || top.defs || top.faint) continue;
    if (k.subjectOnly && !top.subj) continue;
    if (k.texts && tag !== 'text') continue;
    if (/\sfilter="/.test(a) || num(a, 'opacity', 1) < 0.2 || num(a, 'fill-opacity', 1) < 0.2) continue;
    if (attr(a, 'fill') === 'none' && !attr(a, 'stroke')) continue;
    const inner = tag === 'text' && !self ? s.slice(re.lastIndex, s.indexOf('<', re.lastIndex)) : '';
    const m = mul(top.m, parseTransform(attr(a, 'transform')));
    if (k.texts) box = null;
    for (const [px, py] of shapePoints(tag, a, inner)) {
      const X = m[0] * px + m[2] * py + m[4], Y = m[1] * px + m[3] * py + m[5];
      if (!Number.isFinite(X) || !Number.isFinite(Y)) continue;
      if (!box) box = [X, Y, X, Y]; else { if (X < box[0]) box[0] = X; if (Y < box[1]) box[1] = Y; if (X > box[2]) box[2] = X; if (Y > box[3]) box[3] = Y; }
    }
    if (k.texts && box) texts.push(box);
  }
  return k.texts ? texts : box;
}
const subjectBox = svg => svgBox(svg, { subjectOnly: true });
// The subject's printed details -- every wordmark on it (the brand on a bottle, its heat level or flavour, a
// board's lesson): one box each. A product is only as recognisable as its label, so these must stay fully in view,
// not just the middle of the subject.
const detailBoxes = svg => svgBox(svg, { subjectOnly: true, texts: true });
// how much of the most-covered detail is seen (1 when there are none)
// (sampled out to the label's very edges: the grid is stretched so its outer points sit on the first and last letter)
function detailShare(boxes, crop, win, occ, shape, n) {
  const N = n || 8; const k = N / (N - 1);
  return (boxes || []).reduce((m, b) => { const cx = (b[0] + b[2]) / 2, cy = (b[1] + b[3]) / 2, hw = (b[2] - b[0]) / 2 * k, hh = (b[3] - b[1]) / 2 * k; return Math.min(m, visibleShare([cx - hw, cy - hh, cx + hw, cy + hh], crop, win, occ, shape, N)); }, 1);
}

// ---- motion ----------------------------------------------------------------------------------------------------
// The region of the picture (0-1 of the picture's width/height) visible at every
// moment of the loop, for a given camera move. Sampled across the keyframes.
function stableWindow(pan) { return stableWindowFor(PAN_MOTION[pan] || PAN_MOTION.none); }
// mv: [[x%, y%, scale] at the start, [...] at mid-loop]
function stableWindowFor(mv) {
  let w = [0, 0, 1, 1];
  const lo = OVERSIZE / (1 + 2 * OVERSIZE), hi = (1 + OVERSIZE) / (1 + 2 * OVERSIZE);
  for (let t = 0; t <= 1.0001; t += 0.125) {
    const tx = (mv[0][0] + (mv[1][0] - mv[0][0]) * t) / 100, ty = (mv[0][1] + (mv[1][1] - mv[0][1]) * t) / 100, sc = mv[0][2] + (mv[1][2] - mv[0][2]) * t;
    const u0 = 0.5 + (lo - 0.5 - tx) / sc, u1 = 0.5 + (hi - 0.5 - tx) / sc, v0 = 0.5 + (lo - 0.5 - ty) / sc, v1 = 0.5 + (hi - 0.5 - ty) / sc;
    w = [Math.max(w[0], u0), Math.max(w[1], v0), Math.min(w[2], u1), Math.min(w[3], v1)];
  }
  return w;
}
// a point in the frame (0-1) -> the same point as a fraction of the (oversized) picture, at rest
const frameToPicture = X => (X + OVERSIZE) / (1 + 2 * OVERSIZE);

// ---- what covers a frame -----------------------------------------------------------------------------------------
// Where a layer can be on the stage across its own track: its rect at both ends of
// the move (translate is a share of its own size, scale about its centre).
// the rect [x0, y0, x1, y1] at each end of the track
// (a frame that tilts as it moves sweeps its corners further out: the rotated box's bounds, the stage's own
// proportions -- sr, width / height -- turning percentages into real lengths)
function trackEnds(rect, track, sr) {
  const [x, y, w, h] = rect; const ends = track ? [track.from, track.to] : [{ x: 0, y: 0, s: 1 }]; const k = sr || 1;
  return ends.map(p => {
    const s = p.s || 1; const cx = x + w / 2 + (p.x || 0) / 100 * w, cy = y + h / 2 + (p.y || 0) / 100 * h;
    const a = Math.abs((p.r || 0) * Math.PI / 180); const hw = h / k; // height in width-units
    const ex = (w / 2 * Math.cos(a) + hw / 2 * Math.sin(a)) * s, ey = (w / 2 * Math.sin(a) + hw / 2 * Math.cos(a)) * k * s;
    return [cx - ex, cy - ey, cx + ex, cy + ey];
  });
}
function sweptRect(rect, track, sr) {
  return trackEnds(rect, track, sr).reduce((out, r) => (out ? [Math.min(out[0], r[0]), Math.min(out[1], r[1]), Math.max(out[2], r[2]), Math.max(out[3], r[3])] : r), null);
}
// the share of the copy block that sits over a full-bleed lead (desktop, copy bottom-left; see styles.css)
const COPY_OVER = { 'bottom-left': { desktop: [0, 36, 48, 100] } };
// stage proportions (width / height) per copy side -- see styles.css .sb-stage (desktop ~1440px, phone ~390px)
const STAGE_RATIO = { desktop: { left: 1.11, right: 1.11, top: 2.2, 'bottom-left': 1.72 }, phone: { left: 0.81, right: 0.81, top: 0.95, 'bottom-left': 0.83 } };
const stageRatio = (view, copySafe) => STAGE_RATIO[view === 'phone' ? 'phone' : 'desktop'][copySafe] || (view === 'phone' ? 0.81 : 1.11);
// a layer's rect on the stage [x, y, w, h] (% of the stage): a circle keeps a square box (aspect-ratio:1)
function placedRect(l, view, sr) { const r = (view === 'phone' ? l.mobile : l.desktop).slice(); if (l.shape === 'circle') r[3] = r[2] * sr; return r; }
// the frame's own proportions (width / height) for a view
function frameRatioOf(l, view, copySafe) { const sr = stageRatio(view, copySafe); const r = placedRect(l, view, sr); return (r[2] / r[3]) * sr; }
// resolved: resolveLayers(sb) entries ({ slot, z, desktop:[x,y,w,h], mobile:[...], track, shape }).
// -> rects (fractions of THIS layer's frame, at rest) that hide part of it.
function occludersFor(resolved, slot, view, copySafe) {
  const me = resolved.find(l => l.slot === slot); if (!me) return [];
  const sr = stageRatio(view, copySafe);
  const mine = placedRect(me, view, sr); const myEnds = trackEnds(mine, me.track, sr);
  // both frames move (each on its own phase): the cover is every place the other can be,
  // seen from every place this frame can be -- in this frame's own fractions
  const relative = ends => { let u = null; for (const m of myEnds) for (const r of ends) { const W = m[2] - m[0], H = m[3] - m[1]; const f = [(r[0] - m[0]) / W, (r[1] - m[1]) / H, (r[2] - m[0]) / W, (r[3] - m[1]) / H]; u = u ? [Math.min(u[0], f[0]), Math.min(u[1], f[1]), Math.max(u[2], f[2]), Math.max(u[3], f[3])] : f; } return u; };
  const out = [];
  for (const l of resolved) {
    if (l.slot === slot || l.z <= me.z) continue;
    const f = relative(trackEnds(placedRect(l, view, sr), l.track, sr));
    if (f[2] > 0 && f[0] < 1 && f[3] > 0 && f[1] < 1) out.push(f);
  }
  const copy = COPY_OVER[copySafe] && COPY_OVER[copySafe][view];
  if (copy) { const f = relative([[copy[0], copy[1], copy[2], copy[3]]]); if (f[2] > 0 && f[0] < 1 && f[3] > 0 && f[1] < 1) out.push(f); }
  return out;
}

// ---- how much of the subject is seen -------------------------------------------------------------------------------
// box: subject [x0,y0,x1,y1] in the picture's own units; crop: [x, y, w, h] the part
// of the picture that fills the frame; win: stableWindow(); occ: occludersFor()
// (frame fractions); shape: the frame's shape. Sampled on a grid.
function inShape(shape, X, Y) {
  if (shape === 'circle') return (X - 0.5) ** 2 + (Y - 0.5) ** 2 <= 0.25;
  if (shape === 'arch') return Y >= 0.5 || (X - 0.5) ** 2 + (Y - 0.5) ** 2 <= 0.25;
  return true;
}
function visibleShare(box, crop, win, occ, shape, n) {
  if (!box) return 1;
  const [cx, cy, cw, ch] = crop; const N = n || 24; let seen = 0, all = 0;
  const pic2frame = u => u * (1 + 2 * OVERSIZE) - OVERSIZE; // picture fraction -> frame fraction, at rest
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
    const px = box[0] + (box[2] - box[0]) * (i + 0.5) / N, py = box[1] + (box[3] - box[1]) * (j + 0.5) / N;
    all++;
    const u = (px - cx) / cw, v = (py - cy) / ch;
    if (u < win[0] || u > win[2] || v < win[1] || v > win[3]) continue;
    const X = pic2frame(u), Y = pic2frame(v);
    if (!inShape(shape, X, Y)) continue;
    if ((occ || []).some(o => X >= o[0] && X <= o[2] && Y >= o[1] && Y <= o[3])) continue;
    seen++;
  }
  return all ? seen / all : 1;
}

// the middle of the subject (its central 60%): the part that makes it recognisable
function core(box, k) { if (!box) return null; const f = (1 - (k || 0.6)) / 2; const w = box[2] - box[0], h = box[3] - box[1]; return [box[0] + w * f, box[1] + h * f, box[2] - w * f, box[3] - h * f]; }
// A photo (uploaded or generated) has no known outline: assume what photos of a
// subject are asked for -- the subject in the middle, a little low -- and pick the
// object-position (on the axis the frame crops) that keeps that middle clearest.
// imageRatio: the picture's width/height; returns "X% Y%".
const PHOTO_SUBJECT = [0.25, 0.2, 0.75, 0.86];
function photoPosition(imageRatio, fr) {
  const R = fr.ratio; const win = stableWindow(fr.pan); let best = null;
  const W = imageRatio >= 1 ? imageRatio : 1, H = imageRatio >= 1 ? 1 : 1 / imageRatio; // picture in units of its short side
  const box = [PHOTO_SUBJECT[0] * W, PHOTO_SUBJECT[1] * H, PHOTO_SUBJECT[2] * W, PHOTO_SUBJECT[3] * H];
  const cw = W / H > R ? H * R : W, ch = W / H > R ? H : W / R;
  for (const px of (W - cw > 1e-6 ? [0.5, 0.4, 0.6, 0.3, 0.7, 0.2, 0.8] : [0.5])) for (const py of (H - ch > 1e-6 ? [0.5, 0.4, 0.6, 0.3, 0.7] : [0.5])) {
    const crop = [(W - cw) * px, (H - ch) * py, cw, ch];
    const score = visibleShare(core(box), crop, win, fr.avoid, fr.shape, 12) * 0.6 + visibleShare(box, crop, win, fr.avoid, fr.shape, 12) * 0.4 - 0.03 * (Math.abs(px - 0.5) + Math.abs(py - 0.5));
    if (!best || score > best.score + 1e-9) best = { score, px, py };
  }
  return `${Math.round(best.px * 100)}% ${Math.round(best.py * 100)}%`;
}
module.exports = { detailBoxes, detailShare, photoPosition, stableWindowFor, core, STAGE_RATIO, stageRatio, placedRect, frameRatioOf, OVERSIZE, PAN_MOTION, parseTransform, pathPoints, svgBox, subjectBox, stableWindow, frameToPicture, sweptRect, occludersFor, inShape, visibleShare, COPY_OVER };
