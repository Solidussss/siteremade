'use strict';
// CREATIVE CARRY ROUTING: a subject carried across a seam never covers the words. The planner (carry-route.js) is the
// same source the published page runs; these are synthetic layouts, deterministic, no browser and no providers ($0).
const test = require('node:test');
const assert = require('node:assert/strict');
const CR = require('../lib/creative/carry-route');

const DESK = { vw: 1440, vh: 900, y0: 300, y1: 1200, level: 'strong' };
const PHONE = { vw: 390, vh: 844, y0: 300, y1: 1100, level: 'strong', phone: true };
const shift = (r, Y) => Object.assign({}, r, { y: r.y - Y });
// the plan replayed finely (240 steps): the share of the window during which a visible carry hides a heading
function covered(P, o) {
  let bad = 0, run = 0, longest = 0; const N = 240;
  for (let i = 0; i <= N; i++) {
    const w = i / N, Y = o.y0 + (o.y1 - o.y0) * w, R = CR.carryAt(P, shift(o.a, Y), shift(o.b, Y), w, o.vw, o.vh);
    const hit = R.o > 0.05 && CR.cover(R, o.texts.filter(t => t.k === 'h').map(t => shift(t, Y)), o.vw, o.vh) >= 1;
    if (hit) { bad++; run++; longest = Math.max(longest, run); } else run = 0;
  }
  return { share: bad / (N + 1), longest: longest / N };
}

test('1. a clear path: the subject travels straight, full size, the whole window', () => {
  const o = Object.assign({}, DESK, { a: { x: 100, y: 200, w: 500, h: 400 }, b: { x: 840, y: 1150, w: 500, h: 400 }, texts: [{ x: 900, y: 300, w: 400, h: 90, k: 'h' }, { x: 120, y: 1250, w: 500, h: 90, k: 'h' }] });
  const P = CR.carryPlan(o);
  assert.deepEqual([P.level, P.lane, P.scale, P.lift, P.land], ['strong', 'direct', 1, 0, 1]);
  assert.equal(covered(P, o).share, 0);
});

test('2. a safe route exists: the heading sits on the straight path, so the subject takes the lower edge lane, still full size', () => {
  const o = Object.assign({}, DESK, { a: { x: 0, y: 150, w: 440, h: 360 }, b: { x: 1000, y: 1250, w: 440, h: 360 }, texts: [{ x: 470, y: 500, w: 500, h: 100, k: 'h' }] });
  const direct = { level: 'strong', lane: 'direct', scale: 1, lift: 0, land: 1 };
  assert.ok(covered(direct, o).longest > 0.1, 'the straight path would sit on the heading');
  const P = CR.carryPlan(o);
  assert.equal(P.level, 'strong'); assert.ok(['top', 'bottom'].includes(P.lane), `an edge lane (${P.lane})`); assert.equal(P.scale, 1);
  assert.ok(P.lift <= 0.35 && P.land >= 0.65, 'it still leaves the first picture and reaches the second');
  assert.equal(covered(P, o).share, 0, 'and never touches the heading');
});

test('3. the route must shrink: no full-size path clears the words, a smaller carry slips through (strong -> light)', () => {
  const o = Object.assign({}, DESK, { a: { x: 470, y: 250, w: 500, h: 400 }, b: { x: 470, y: 1150, w: 500, h: 400 }, texts: [{ x: 0, y: 730, w: 1440, h: 60, k: 'h' }, { x: 0, y: 940, w: 1440, h: 60, k: 'h' }, { x: 0, y: 820, w: 400, h: 90, k: 'h' }, { x: 1040, y: 820, w: 400, h: 90, k: 'h' }] });
  const P = CR.carryPlan(o);
  assert.equal(P.level, 'light'); assert.ok(P.scale < 1, `smaller (${P.scale})`); assert.match(P.why, /smaller/);
  assert.ok(covered(P, o).longest <= 0.05);
  // a carry the contract already made light never grows back to strong
  assert.equal(CR.carryPlan(Object.assign({}, o, { level: 'light' })).level, 'light');
  const open = Object.assign({}, o, { texts: [], level: 'light' }); assert.equal(CR.carryPlan(open).scale, 0.62);
});

test('4. the route must downgrade: words everywhere -> no carry at all (the scenes keep their own pictures)', () => {
  const o = Object.assign({}, DESK, { a: { x: 100, y: 200, w: 600, h: 500 }, b: { x: 740, y: 1150, w: 600, h: 500 }, texts: Array.from({ length: 30 }, (_, i) => ({ x: 0, y: i * 70, w: 1440, h: 56, k: 'h' })) });
  const P = CR.carryPlan(o);
  assert.equal(P.level, 'none'); assert.equal(P.why, 'no text-safe path');
  assert.equal(CR.carryAt(P, o.a, o.b, 0.5, o.vw, o.vh).o, 0, 'nothing is drawn');
  // a heading under the arrival point: the carry hands over to the scene's own copy (which sits under its words) early
  const land = CR.carryPlan(Object.assign({}, PHONE, { a: { x: 0, y: 70, w: 390, h: 300 }, b: { x: 0, y: 920, w: 390, h: 280 }, texts: [{ x: 24, y: 1030, w: 340, h: 70, k: 'h' }] }));
  assert.ok(land.level !== 'none' && land.land < 1, `lets go before the heading (${land.land})`);
  assert.equal(CR.carryAt(land, { x: 0, y: 0, w: 390, h: 300 }, { x: 0, y: 0, w: 390, h: 280 }, 0.99, 390, 844).o, 0);
});

test('5. phone: a smaller subject, no side lanes, the same promise about the words', () => {
  const base = { a: { x: 0, y: 150, w: 440, h: 360 }, b: { x: 1000, y: 1250, w: 440, h: 360 }, texts: [{ x: 380, y: 900, w: 700, h: 110, k: 'h' }] };
  const desk = CR.carryPlan(Object.assign({}, DESK, base));
  const P = CR.carryPlan(Object.assign({}, PHONE, { a: { x: 0, y: 70, w: 390, h: 300 }, b: { x: 0, y: 920, w: 390, h: 280 }, texts: [{ x: 24, y: 1240, w: 340, h: 70, k: 'h' }, { x: 24, y: 420, w: 340, h: 70, k: 'h' }] }));
  assert.equal(P.level, 'strong'); assert.ok(P.scale <= 0.78, 'a strong carry is already smaller on a phone');
  // the same desktop layout planned for a phone-width screen: smaller, and only straight or upper/lower lanes
  const asPhone = CR.carryPlan(Object.assign({}, DESK, base, { phone: true }));
  assert.ok(asPhone.scale <= 0.78 && ['direct', 'top', 'bottom'].includes(asPhone.lane), JSON.stringify(asPhone));
  assert.ok(desk.level !== 'none');
  // a light carry on a phone is smaller still
  assert.equal(CR.carryPlan(Object.assign({}, PHONE, { level: 'light', a: { x: 0, y: 70, w: 390, h: 300 }, b: { x: 0, y: 920, w: 390, h: 280 }, texts: [] })).scale, 0.5);
  // the lane leaves room for the phone's top bar
  const top = CR.carryAt({ level: 'strong', lane: 'top', scale: 0.78, lift: 0, land: 1 }, { x: 0, y: 500, w: 390, h: 300 }, { x: 0, y: 500, w: 390, h: 300 }, 0.5, 390, 844);
  assert.ok(top.y >= 56, `below the bar (${top.y})`);
});

test('6. across 2000 random layouts (desktop and phone) a heading is never covered for more than a trivial instant', () => {
  let seed = 42; const r = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const seen = { none: 0, strong: 0, light: 0 }; let worst = 0;
  for (let t = 0; t < 2000; t++) {
    const phone = r() < 0.4, vw = phone ? 390 : 1440, vh = phone ? 844 : 900, iw = () => vw * (0.3 + r() * 0.6), ih = () => vh * (0.2 + r() * 0.4), aw = iw(), bw = iw();
    const o = { vw, vh, phone, level: r() < 0.7 ? 'strong' : 'light', y0: 200 + r() * 300, y1: 0, a: { x: r() * (vw - aw), y: 50 + r() * 500, w: aw, h: ih() }, b: { x: r() * (vw - bw), y: vh + r() * 600, w: bw, h: ih() }, texts: [] };
    o.y1 = o.y0 + vh * (0.7 + r() * 0.5);
    for (let i = 0, n = 1 + Math.floor(r() * 4); i < n; i++) { const w = vw * (0.2 + r() * 0.6); o.texts.push({ x: r() * (vw - w), y: r() * vh * 2.2, w, h: 40 + r() * 100, k: r() < 0.7 ? 'h' : 'p' }); }
    const P = CR.carryPlan(o); seen[P.level]++;
    if (P.level !== 'none') worst = Math.max(worst, covered(P, o).longest);
  }
  assert.ok(worst <= 0.04, `the longest touch is ${(worst * 100).toFixed(1)}% of the carry's window`);
  assert.ok(seen.strong > 0 && seen.light > 0 && seen.none > 0, JSON.stringify(seen));
});

test('7. the planner is written in the page runtime\'s dialect, so the published page runs this exact source', () => {
  const src = CR.SOURCE; assert.match(src, /function carryPlan\(o\)/); assert.match(src, /function carryAt\(P, ra, rb, w, vw, vh\)/); assert.match(src, /function cover\(R, T, vw, vh\)/);
  assert.ok(!/=>|\blet\b|\bconst\b|`/.test(src), 'no arrows, no let/const, no template strings');
  // and it runs on its own (no outside names): evaluated in a bare scope it plans the same as the module
  const fresh = new Function(`${src}; return carryPlan;`)();
  const o = Object.assign({}, DESK, { a: { x: 0, y: 150, w: 440, h: 360 }, b: { x: 1000, y: 1250, w: 440, h: 360 }, texts: [{ x: 470, y: 500, w: 500, h: 100, k: 'h' }] });
  assert.deepEqual(fresh(o), CR.carryPlan(o));
});
