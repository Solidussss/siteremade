'use strict';
// Text-safe routing for a subject carried across a seam (render2's .cs-carry). Pure functions, written in the page
// runtime's own dialect (ES5) so the SAME source runs in the published page (render2 inlines SOURCE) and in the tests.
//
//   carryPlan(o) -> { level, lane, scale, lift, land, blocked, why }
//     o: { a, b: the two pictures, texts: [{ x, y, w, h, k }] (k 'h' a heading, 'p' other words), all in PAGE
//          coordinates (CSS px); y0, y1: the scroll offsets where the carry's window opens and closes; vw, vh: the
//          screen; level: the contract's 'strong' | 'light'; phone }
//     Tries, in order: the straight path at full size, then an upper or lower edge lane (the side lanes too, on a wide
//     screen), then the same at a smaller size (strong -> light); when nothing keeps the headings clear, 'none' -- the
//     two scenes keep their own copies and the seam's other handoffs (colour, depth, direction) still tell the story.
//     A heading may be touched for at most one sample of the window (a trivial instant), never longer.
//   carryAt(plan, ra, rb, w, vw, vh) -> { x, y, w, h, o }: where the carried subject is at window position w (0..1),
//     from the two pictures' rects in SCREEN coordinates (live, as measured while the page scrolls); o: its opacity
//     (it fades in after lift, out before land -- the scene's own copy shows outside that span).
//   cover(R, texts, vw, vh) -> the worst share of any heading (or, at a higher bar, other words) that R hides.

/* eslint-disable no-var */
function carryAt(P, ra, rb, w, vw, vh) {
  var e = w * w * (3 - 2 * w), bump = Math.sin(Math.PI * w), k = 1 - (1 - P.scale) * bump;
  var cw = (ra.w + (rb.w - ra.w) * e) * k, ch = (ra.h + (rb.h - ra.h) * e) * k;
  var cx = ra.x + ra.w / 2 + (rb.x + rb.w / 2 - ra.x - ra.w / 2) * e, cy = ra.y + ra.h / 2 + (rb.y + rb.h / 2 - ra.y - ra.h / 2) * e;
  var m = Math.max(12, Math.min(vw, vh) * 0.04), top = m + (vw <= 720 ? 56 : 64);
  if (P.lane === 'top') cy += (top + ch / 2 - cy) * bump;
  else if (P.lane === 'bottom') cy += (vh - m - ch / 2 - cy) * bump;
  else if (P.lane === 'left') cx += (m + cw / 2 - cx) * bump;
  else if (P.lane === 'right') cx += (vw - m - cw / 2 - cx) * bump;
  var f = 0.06, o = P.level === 'none' ? 0 : Math.min(P.lift > 0 ? Math.max(0, Math.min(1, (w - P.lift) / f)) : 1, P.land < 1 ? Math.max(0, Math.min(1, (P.land - w) / f)) : 1);
  return { x: cx - cw / 2, y: cy - ch / 2, w: cw, h: ch, o: o };
}
function cover(R, T, vw, vh) {
  var worst = 0, i, t, x0, y0, x1, y1, a, s;
  for (i = 0; i < T.length; i++) {
    t = T[i]; a = t.w * t.h; if (a <= 0) continue;
    x0 = Math.max(R.x, t.x, 0); y0 = Math.max(R.y, t.y, 0); x1 = Math.min(R.x + R.w, t.x + t.w, vw); y1 = Math.min(R.y + R.h, t.y + t.h, vh);
    if (x1 <= x0 || y1 <= y0) continue;
    // (a heading counts from 4% of it hidden; other words from 25%)
    s = (x1 - x0) * (y1 - y0) / a / (t.k === 'h' ? 0.04 : 0.25); if (s > worst) worst = s;
  }
  return worst;
}
function carryPlan(o) {
  var N = 48, phone = !!o.phone, levels = o.level === 'light' ? ['light'] : ['strong', 'light'];
  var SCALE = phone ? { strong: 0.78, light: 0.5 } : { strong: 1, light: 0.62 };
  var lanes = phone ? ['direct', 'top', 'bottom'] : ['direct', 'top', 'bottom', 'left', 'right'];
  var li, ln, P, i, w, Y, R, T, j, hit, best = null, run, r0, bad, b0, k;
  for (li = 0; li < levels.length; li++) {
    for (ln = 0; ln < lanes.length; ln++) {
      P = { level: levels[li], lane: lanes[ln], scale: SCALE[levels[li]], lift: 0, land: 1 };
      hit = [];
      for (i = 0; i <= N; i++) {
        w = i / N; Y = o.y0 + (o.y1 - o.y0) * w;
        R = carryAt(P, { x: o.a.x, y: o.a.y - Y, w: o.a.w, h: o.a.h }, { x: o.b.x, y: o.b.y - Y, w: o.b.w, h: o.b.h }, w, o.vw, o.vh);
        T = []; for (j = 0; j < o.texts.length; j++) T.push({ x: o.texts[j].x, y: o.texts[j].y - Y, w: o.texts[j].w, h: o.texts[j].h, k: o.texts[j].k });
        hit.push(cover(R, T, o.vw, o.vh) >= 1);
      }
      // the longest stretch of the window that starts near the first picture, with at most one touched sample, and that
      // sample never at its edges
      run = null;
      for (r0 = 0; r0 <= N * 0.35; r0++) {
        if (hit[r0]) continue; bad = 0;
        for (k = r0; k <= N; k++) { if (hit[k]) { bad++; if (bad > 1 || k === N || hit[k + 1]) break; } if (!run || k - r0 > run[1] - run[0]) run = [r0, k, bad]; }
      }
      if (!run) continue;
      P.lift = run[0] ? Math.round(run[0] / N * 1000) / 1000 : 0; P.land = run[1] < N ? Math.round(run[1] / N * 1000) / 1000 : 1;
      // a carry worth showing leaves near the first picture and travels at least half way; when the arrival sits under
      // the next scene's own words (type laid over the picture by design) it hands over to that scene's copy -- drawn
      // beneath its words -- before it gets there
      if (P.lift > 0.35 || P.land < 0.5 || P.land - P.lift < 0.45) continue;
      P.blocked = run[2]; b0 = (P.land - P.lift) - ln * 0.02;
      if (!best || b0 > best.s) best = { s: b0, P: P };
    }
    if (best) { best.P.why = (best.P.lane === 'direct' ? 'clear' : best.P.lane + ' lane') + (best.P.level !== levels[0] ? ', smaller' : ''); return best.P; }
  }
  return { level: 'none', lane: 'direct', scale: 1, lift: 0, land: 1, blocked: 0, why: 'no text-safe path' };
}

// the page runtime's copy (one source of truth for the page and the tests)
const SOURCE = [carryAt, cover, carryPlan].map(f => f.toString()).join('\n');

module.exports = { carryPlan, carryAt, cover, SOURCE };
