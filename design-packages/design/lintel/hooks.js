// Lintel & Key's build logic. The scroll-built house is the LISTING's house: its rooms (each with its real size, placed
// on the plan) come from the content; everything the original drew around a 60' x 36' footprint -- slab, site, roof,
// camera framing, plan dimensions, the room locator -- is derived from the rooms, and so are the walls, windows, doors
// and door swings (planFrom). With the sample house's rooms the original's own drawing data is used unchanged.
// Also: the payment calculator's starting numbers, the room tour, the neighbourhood places and the showing times.
// Runs at build time only.
'use strict';
const fs = require('fs');
const path = require('path');
const { FILTERS } = require('../../engine/template');

const SAMPLE = JSON.parse(fs.readFileSync(path.join(__dirname, 'default.json'), 'utf8')).model.rooms;
const sameRoom = (a, b) => a.id === b.id && a.name === b.name && a.x === b.x && a.y === b.y && a.w === b.w && a.d === b.d && a.mat === b.mat;
const isSample = (rooms) => rooms.length === SAMPLE.length && rooms.every((r, i) => sameRoom(r, SAMPLE[i]));

// numbers as the original writes them: no leading zero (.5, -.25), no trailing zeros
const n = (v) => String(+(+v).toFixed(3)).replace(/^0\./, '.').replace(/^-0\./, '-.');
const dec = (v) => String(+(+v).toFixed(6)).replace(/^0\./, '.');
const n2 = (v) => (+v).toFixed(2).replace(/^(-?)0\./, '$1.');
const js = FILTERS.js;
const hx = (s) => FILTERS.esc(s).replace(/&amp; /g, '& ');
const fmt = (v) => Math.round(v).toLocaleString('en-US');
const feetIn = (f) => { const ft = Math.floor(f), inch = Math.round((f - ft) * 12); return `${ft}′-${inch}″`; };

const OPEN = new Set(['living', 'kitchen', 'dining', 'family']);
const WET = new Set(['bath', 'ensuite', 'laundry', 'closet']);
const KINDS = ['living', 'kitchen', 'dining', 'family', 'primary', 'bed', 'office', 'bath', 'ensuite', 'laundry', 'closet', 'hall', 'entry', 'other'];
// windows by what the room is: [width cap, sill, height] (the original's own sizes: living glass, kitchen, bedroom, high bath window)
const WIN = { living: [12, .6, 7.6], family: [12, .6, 7.6], kitchen: [7, 3.4, 4.2], dining: [7, 3.4, 4.2], primary: [10, 2.2, 5.4], bed: [7, 2.6, 4.8], office: [7, 2.6, 4.8], bath: [4, 5.6, 2.2], ensuite: [4, 5.6, 2.2], laundry: [4, 3.6, 3.4], closet: [3, 5.6, 2.2] };

// The walls, windows, doors and swings of a plan whose rooms tile [0,W] x [0,D]. Exterior walls go round the house in
// the original's order (south, east, north, west); each room on a wall gets a window sized for what it is; the front
// door goes in the entry or hall if one reaches the outside, else in the living room. Every closed room gets one door,
// to the hall first (an ensuite or closet to the primary bedroom); open-plan rooms meet without a wall; a hall opens
// wide onto them.
function planFrom(rooms) {
  const W = Math.max(...rooms.map((r) => r.x + r.w)), D = Math.max(...rooms.map((r) => r.y + r.d));
  const EDGES = [
    { a: [0, D], b: [W, D], on: (r) => r.y + r.d === D, t: (r) => [r.x, r.x + r.w], v: false, inward: -1 },
    { a: [W, D], b: [W, 0], on: (r) => r.x + r.w === W, t: (r) => [D - r.y - r.d, D - r.y], v: true, inward: 1 },
    { a: [W, 0], b: [0, 0], on: (r) => r.y === 0, t: (r) => [W - r.x - r.w, W - r.x], v: false, inward: 1 },
    { a: [0, 0], b: [0, D], on: (r) => r.x === 0, t: (r) => [r.y, r.y + r.d], v: true, inward: -1 },
  ];
  const kind = (r) => (KINDS.includes(r.kind) ? r.kind : 'other');
  // the front door: an entry that reaches the outside, else the main living space (as the original), else a hall
  const outside = (r) => EDGES.some((e) => e.on(r) && e.t(r)[1] - e.t(r)[0] >= 4);
  const doorRoom = rooms.find((r) => kind(r) === 'entry' && outside(r))
    || rooms.filter((r) => (kind(r) === 'living' || kind(r) === 'family') && outside(r)).sort((a, b) => b.w * b.d - a.w * a.d)[0]
    || rooms.find((r) => kind(r) === 'hall' && outside(r)) || rooms.find(outside) || rooms[0];
  const ext = [], doors = [], winByRoom = {};
  let frontDone = false;
  for (const e of EDGES) {
    const ops = [];
    for (const r of rooms.filter(e.on).sort((p, q) => e.t(p)[0] - e.t(q)[0])) {
      let [t0, t1] = e.t(r); const len = t1 - t0;
      if (!frontDone && r === doorRoom && len >= 4) {
        const o = t0 + (len >= 10 ? 2 : (len - 3.5) / 2);
        ops.push({ o, w: 3.5, s: 0, h: 7.6, door: 1 });
        // the swing, hinged at the gap's start, into the house
        const p = [e.a[0] + (e.b[0] - e.a[0]) / (e.v ? D : W) * o, e.a[1] + (e.b[1] - e.a[1]) / (e.v ? D : W) * o];
        const dir = e.v ? Math.sign(e.b[1] - e.a[1]) : Math.sign(e.b[0] - e.a[0]);
        // (inward: the side the house is on -- a rotated swing's sy=-1 opens toward +x, an upright one's toward -y)
        doors.push(e.v ? { x: p[0], y: dir > 0 ? p[1] : p[1] - 3.5, r: 3.5, rot: 90, sx: 1, sy: e.inward } : { x: dir > 0 ? p[0] : p[0] - 3.5, y: p[1], r: 3.5, rot: 0, sx: 1, sy: e.inward });
        frontDone = true; t0 = o + 3.5 + 1;
      }
      const spec = WIN[kind(r)]; const room = t1 - t0;
      if (!spec || room < 3) continue;
      const w = Math.min(spec[0], Math.max(2, room - (WET.has(kind(r)) ? 2 : 4)));
      if (w < 2) continue;
      const o = t0 + (room - w) / 2;
      ops.push({ o: +o.toFixed(2), w: +w.toFixed(2), s: spec[1], h: spec[2] });
      (winByRoom[r.id] = winByRoom[r.id] || []).push([+(o - e.t(r)[0]).toFixed(2), +w.toFixed(2), spec[1], spec[2], len]);
    }
    ext.push({ a: e.a, b: e.b, ops });
  }
  // shared edges between rooms
  const shared = [];
  for (let i = 0; i < rooms.length; i++) for (let j = i + 1; j < rooms.length; j++) {
    const A = rooms[i], B = rooms[j];
    for (const [P, Q] of [[A, B], [B, A]]) {
      if (P.x + P.w === Q.x) { const y0 = Math.max(P.y, Q.y), y1 = Math.min(P.y + P.d, Q.y + Q.d); if (y1 - y0 > .01) shared.push({ v: true, at: Q.x, s0: y0, s1: y1, lo: P, hi: Q }); }
      if (P.y + P.d === Q.y) { const x0 = Math.max(P.x, Q.x), x1 = Math.min(P.x + P.w, Q.x + Q.w); if (x1 - x0 > .01) shared.push({ v: false, at: Q.y, s0: x0, s1: x1, lo: P, hi: Q }); }
    }
  }
  const gaps = new Map(); // shared edge -> [g0, g1, room entered or null]
  const circ = (r) => kind(r) === 'hall' || kind(r) === 'entry';
  // halls open wide onto open-plan rooms
  for (const s of shared) { const pair = [s.lo, s.hi]; if (pair.some(circ) && pair.some((r) => OPEN.has(kind(r)))) { const len = s.s1 - s.s0, g = Math.min(len - 1, 10); if (g >= 3) gaps.set(s, [s.s0 + (len - g) / 2, s.s0 + (len + g) / 2, null]); } }
  const rank = (r, other) => {
    const k = kind(r), o = kind(other);
    if (k === 'ensuite' || k === 'closet') return o === 'primary' ? 0 : o === 'bed' ? 1 : circ(other) ? 2 : OPEN.has(o) ? 3 : 9;
    return circ(other) ? 0 : OPEN.has(o) ? 1 : (o === 'primary' || o === 'bed') && k !== 'bath' ? 5 : 9;
  };
  for (const r of rooms) {
    if (OPEN.has(kind(r)) || circ(r)) continue;
    const opts = shared.filter((s) => (s.lo === r || s.hi === r) && !gaps.has(s)).map((s) => ({ s, other: s.lo === r ? s.hi : s.lo }))
      .filter((x) => x.s.s1 - x.s.s0 >= 3.2 && rank(r, x.other) < 9).sort((a, b) => rank(r, a.other) - rank(r, b.other) || (b.s.s1 - b.s.s0) - (a.s.s1 - a.s.s0));
    if (!opts.length) continue;
    const { s } = opts[0], gw = WET.has(kind(r)) ? 2.5 : 3, g0 = s.s0 + Math.min(1, (s.s1 - s.s0 - gw) / 2);
    gaps.set(s, [g0, g0 + gw, r]);
    // the swing: hinged at the gap's start, opening into the room
    const into = r === s.hi ? 1 : -1; // the room is on the far (+) side of the wall, or the near side
    doors.push(s.v ? { x: s.at, y: g0, r: gw, rot: 90, sx: 1, sy: -into } : { x: g0, y: s.at, r: gw, rot: 0, sx: 1, sy: into });
  }
  const intw = [];
  for (const s of shared) {
    if (OPEN.has(kind(s.lo)) && OPEN.has(kind(s.hi))) continue;
    const g = gaps.get(s), parts = g ? [[s.s0, g[0]], [g[1], s.s1]] : [[s.s0, s.s1]];
    for (const [p0, p1] of parts) if (p1 - p0 > .2) intw.push(s.v ? { a: [s.at, p0], b: [s.at, p1] } : { a: [p0, s.at], b: [p1, s.at] });
  }
  return { W, D, ext, intw, doors, winByRoom };
}

function planJs(rooms, P) {
  const roomJs = rooms.map((r) => ` {id:${js(r.id)},name:${js(r.name)},x:${n(r.x)},y:${n(r.y)},w:${n(r.w)},d:${n(r.d)},mat:${js(r.mat)}}`).join(',\n');
  const ops = (o) => `{o:${n(o.o)},w:${n(o.w)},s:${n(o.s)},h:${n(o.h)}${o.door ? ',door:1' : ''}}`;
  const extJs = P.ext.map((e) => ` {a:[${n(e.a[0])},${n(e.a[1])}],b:[${n(e.b[0])},${n(e.b[1])}],ops:[${e.ops.map(ops).join(',')}]}`).join(',\n');
  const intJs = P.intw.map((w) => `{a:[${n(w.a[0])},${n(w.a[1])}],b:[${n(w.b[0])},${n(w.b[1])}]}`).join(',');
  const doorJs = P.doors.map((d) => `{x:${n(d.x)},y:${n(d.y)},r:${n(d.r)},rot:${d.rot},sx:${d.sx},sy:${d.sy}}`).join(',');
  return `const rooms=[\n${roomJs}\n];\nconst ext=[\n${extJs}\n];\nconst intw=[${intJs}];\nconst doors=[ // hinge x,y, radius, rotation, sx, sy\n ${doorJs}\n];`;
}

const STAGE_T = ['0', '.02', '.08', '.30', '.46', '.56', '.66', '.76', '.88'];

// the monthly payment as the page computes it at load (the same schedule maths)
function monthly(c) {
  const p = c.payments, price = c.listing.price, P = price - price * p.downPct / 100, r = p.rate / 100 / 12, k = p.years * 12;
  const M = r ? P * r * Math.pow(1 + r, k) / (Math.pow(1 + r, k) - 1) : P / k;
  return M + price * (p.taxRate / 100) / 12 + p.insuranceMonthly;
}

function derive(c) {
  const rooms = c.model.rooms, sample = isSample(rooms);
  const P = planFrom(rooms), W = P.W, D = P.D, H = c.model.ceiling, pitch = c.model.pitch;
  const cur = c.locale.currency, money = (v) => cur + fmt(v);
  const sqft = rooms.reduce((a, r) => a + r.w * r.d, 0);
  const tourRooms = c.rooms.tour.map((t) => Object.assign({}, t, { room: rooms.find((r) => r.id === t.id) }));
  const tourJs = tourRooms.map((t) => {
    const win = t.win || (P.winByRoom[t.id] || []).map(([o, w, s, h]) => [Math.max(.5, Math.min(o, t.room.w - w - .5)), Math.min(w, t.room.w - 1), s, h]).slice(0, 2);
    return ` {id:${js(t.id)},name:${js(t.room.name)},view:${js(t.view)},w:${n(t.room.w)},d:${n(t.room.d)},floor:${js(t.floor)},light:${js(t.light)},win:[${win.map((x) => `[${x.map(n).join(',')}]`).join(',')}],furn:${js(t.furn)},\n  feat:[${t.feat.map(js).join(',')}]}`;
  }).join(',\n');
  const half = D / 2 + 2, rise = +(half * pitch / 12).toFixed(3), gable = +(D / 2 * pitch / 12).toFixed(3);
  const S = c.showing.slots, q = (list) => list.map(js).join(',');
  const agentFirst = String(c.agent.name).split(/\s+/)[0];
  const initials = String(c.agent.name).split(/\s+/).filter(Boolean).map((w) => w[0].toUpperCase()).slice(0, 2).join('');
  const sqm = (sqft * .092903).toFixed(1);
  return {
    priceText: money(c.listing.price),
    downText: money(c.listing.price * c.payments.downPct / 100), loanText: money(c.listing.price - c.listing.price * c.payments.downPct / 100),
    rateText: (+c.payments.rate).toFixed(2), payText: money(monthly(c)),
    amortHtml: [20, 25, 30].map((y) => `<button type="button" data-y="${y}" aria-pressed="${y === c.payments.years}">${y} yr</button>`).join(''),
    taxYear: String(Math.round(c.listing.price * c.payments.taxRate / 100)), taxRateJs: dec(c.payments.taxRate / 100), closingJs: dec(c.payments.closingPct / 100),
    cur0: js(cur + '0'),
    firstSketchCap: `${tourRooms[0].room.name}, seen ${tourRooms[0].view}`, firstRoomName: tourRooms[0].room.name,
    samplePlan: sample, planJs: sample ? '' : planJs(rooms, P),
    stagesJs: c.model.stages.map((s, i) => ` {t:${STAGE_T[i]},n:${js(s.n)},c:${js(s.c)}}`).join(',\n'),
    planCaption: `${rooms.length} rooms on one floor, ${fmt(sqft)} sq ft (${sqm} m²). Dimensions are wall to wall.` + (c.model.layout === 'illustrative' ? ' Room sizes are the listing’s; the layout is drawn to show them.' : ''),
    // (a room under 8' wide also sets its size lines smaller, so "60 sf · 5.6 m²" stays on one line)
    smallRoom: sample ? "r.w*r.d<130||r.id==='closet'||r.id==='pbath'" : "(Math.min(r.w,r.d)<8&&el.querySelectorAll('span').forEach(x=>x.style.fontSize=(fs*.76).toFixed(1)+'px'),r.w*r.d<130||Math.min(r.w,r.d)<=9)",
    W: n(W), D: n(D), W2: n(W + 2), D2: n(D + 2), Wh: n(W / 2), Dh: n(D / 2), W8: n(W + 8), D8: n(D + 8), W10: n(W + 10), D10: n(D + 10), W16: n(W + 16), D16: n(D + 16), D18: n(D + 18),
    W1: n(W + 1), D1: n(D + 1), Wp5: n(W + .5), Dp5: n(D + .5), Wq: n(W + .5), Dq: n(D + .5), Dm: n(D - .25), Wm: n(W - .25), D32: n(D + 3.2), W4: n(W + 4),
    dimW: `${feetIn(W)} · ${(W * .3048).toFixed(2)} m`, dimD: `${feetIn(D)} · ${(D * .3048).toFixed(2)} m`,
    ridgeZ: n(H + gable), roofHalf: n(half), roofRise: n(rise), gableH: n(gable),
    miniW: n(W + 3), miniH: n(D + 3), miniTextY: n(D + 2.6), miniCaption: FILTERS.esc(c.rooms.miniCaption),
    tourJs,
    scoresJs: c.area.scores.map((s) => `{n:${s.n},t:${js(s.t)},d:${js(s.d)}}`).join(','),
    spotsJs: c.area.places.map((p) => { const [x, y] = placeXY(p); return ` {n:${js(p.n)},k:${js(p.k)},x:${n2(x)},y:${n2(y)},note:${js(p.note)}}`; }).join(',\n'),
    catsJs: ['All'].concat(c.area.categories).map(js).join(','),
    addressTl: FILTERS.tl(FILTERS.esc(c.listing.address)),
    slotsWeek: q(S.weekday), slotsSat: q(S.saturday), slotsSun: q(S.sunday),
    nameErr: `Add your name so ${agentFirst} knows who to meet.`,
    initials,
    // a brand name longer than the original's ("Lintel & Key", 12 characters) wraps to two lines on phones, so the
    // nav's button stays on screen
    navCss: [...c.brand.name].length > 12 ? '@media (max-width:520px){.brand{white-space:normal;line-height:1.05;font-size:12px;max-width:min(44vw,170px)}}\n' : '',
    // a screen reader says "and" for the ampersand
    brandSaid: c.brand.name.replace(/\s*&\s*/g, ' and '),
    // (an ampersand before a space needs no escaping; the original writes it bare)
    factsHtml: c.facts.items.map((f) => `      <div class="fact"><dt>${hx(f.dt)}</dt><dd>${hx(f.dd)}<small>${hx(f.small)}</small></dd></div>`).join('\n'),
  };
}
// A place on the schematic map: its own x,y, or (for a real listing, where only the walk is known) its walking minutes
// and compass direction -- placed so the page's own distance maths gives back the same minutes.
const DIRS = { N: [0, -1], NE: [.5, -.5], E: [1, 0], SE: [.5, .5], S: [0, 1], SW: [-.5, .5], W: [-1, 0], NW: [-.5, -.5] };
function placeXY(p) {
  if (typeof p.x === 'number' && typeof p.y === 'number') return [p.x, p.y];
  const d = DIRS[p.dir] || DIRS.N, m = p.min / 15; // the page: minutes = (|x| + |y|) * 1200 / 80
  return [d[0] * m, d[1] * m];
}

function validate(c) {
  const e = [], rooms = c.model.rooms;
  const ids = new Set();
  rooms.forEach((r, i) => {
    for (const k of ['x', 'y', 'w', 'd']) if (typeof r[k] !== 'number' || r[k] < 0 || Math.round(r[k] * 2) !== r[k] * 2) e.push(`model.rooms.${i}.${k}: a number of feet in half-foot steps`);
    if (r.w < 3 || r.d < 3) e.push(`model.rooms.${i}: at least 3′ each way`);
    if (!KINDS.includes(r.kind) && !isSample(rooms)) e.push(`model.rooms.${i}.kind: one of ${KINDS.join(', ')}`);
    if (!['oak', 'tile'].includes(r.mat)) e.push(`model.rooms.${i}.mat: "oak" (wood or carpet) or "tile" (stone or tile)`);
    if (ids.has(r.id)) e.push(`model.rooms.${i}.id: "${r.id}" is used twice`); ids.add(r.id);
  });
  if (e.length) return e;
  // the rooms tile the footprint: no gap, no overlap
  const W = Math.max(...rooms.map((r) => r.x + r.w)), D = Math.max(...rooms.map((r) => r.y + r.d));
  if (Math.min(...rooms.map((r) => r.x)) !== 0 || Math.min(...rooms.map((r) => r.y)) !== 0) e.push('model.rooms: the plan starts at x 0, y 0');
  for (let i = 0; i < rooms.length; i++) for (let j = i + 1; j < rooms.length; j++) {
    const a = rooms[i], b = rooms[j], ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x), oy = Math.min(a.y + a.d, b.y + b.d) - Math.max(a.y, b.y);
    if (ox > 0 && oy > 0) e.push(`model.rooms: ${a.name} and ${b.name} overlap (x ${Math.max(a.x, b.x)}-${Math.min(a.x + a.w, b.x + b.w)}, y ${Math.max(a.y, b.y)}-${Math.min(a.y + a.d, b.y + b.d)})`);
  }
  const area = rooms.reduce((s, r) => s + r.w * r.d, 0);
  if (!e.length && Math.abs(area - W * D) > .01) e.push(`model.rooms: the rooms cover ${area} sq ft of the ${W}′ × ${D}′ footprint (${W * D} sq ft): fill the gaps (a hall, a closet) so the rooms make one rectangle`);
  if (W > 110 || D > 70 || W < 16 || D < 16) e.push(`model.rooms: the footprint is ${W}′ × ${D}′ (allowed 16-110′ wide, 16-70′ deep)`);
  if (W < D) e.push(`model.rooms: draw the plan wider than deep (x along the long side): ${W}′ × ${D}′`);
  c.rooms.tour.forEach((t, i) => { if (!rooms.some((r) => r.id === t.id)) e.push(`rooms.tour.${i}.id: "${t.id}" is not a room in model.rooms`); });
  const p = c.payments;
  if (!(p.priceMin <= c.listing.price && c.listing.price <= p.priceMax)) e.push('payments: the list price must sit between priceMin and priceMax');
  if ((p.priceMax - p.priceMin) / p.priceStep > 400) e.push('payments.priceStep: at most 400 steps between priceMin and priceMax');
  if (![20, 25, 30].includes(p.years)) e.push('payments.years: 20, 25 or 30');
  c.area.places.forEach((pl, i) => {
    const hasXY = typeof pl.x === 'number' && typeof pl.y === 'number', hasWalk = typeof pl.min === 'number' && DIRS[pl.dir];
    if (!hasXY && !hasWalk) e.push(`area.places.${i}: give min (walking minutes) and dir (N, NE, E, SE, S, SW, W or NW)`);
    if (hasWalk && (pl.min < 1 || pl.min > 18)) e.push(`area.places.${i}.min: 1-18 minutes (the map shows up to a 15-minute walk)`);
    if (!c.area.categories.includes(pl.k)) e.push(`area.places.${i}.k: "${pl.k}" is not one of area.categories`);
  });
  for (const k of ['weekday', 'saturday', 'sunday']) (c.showing.slots[k] || []).forEach((t, i) => { if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(t)) e.push(`showing.slots.${k}.${i}: a time like 09:30`); });
  return e;
}

module.exports = { derive, validate, planFrom };
