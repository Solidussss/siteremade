'use strict';
// THE LINTEL & KEY DESIGN (design-packages/design/lintel): a property listing whose scroll-built house is the
// listing's own. The sample house keeps the original drawing exactly; any other listing's walls, windows, doors,
// roof and dimensions are drawn from its rooms, which must tile one rectangle. Through the real routes with a
// scripted writer -- never the paid AI.
process.env.SITEREMADE_DB_PATH = ':memory:';
process.env.SITEREMADE_DESIGN_OWNER_CUTOFF = '2999-01-01T00:00:00.000Z';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { loadDesign, validate, build } = require('../design-packages/engine/engine');
const { planFrom } = require('../design-packages/design/lintel/hooks');

const D = loadDesign(path.join(__dirname, '..', 'design-packages', 'design', 'lintel'));
const harbor = () => JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'design-sites', 'harbor-lane.json'), 'utf8'));
const sample = () => JSON.parse(fs.readFileSync(path.join(D.dir, 'default.json'), 'utf8'));

test('the sample listing keeps the original drawing; another listing gets its own house', () => {
  const s = build(D, sample()).html;
  assert.match(s, /\[\[0,9\],\[12,14\.5\],\[17,22\],\[25,35\],\[38,42\]\]\.forEach/, 'the original interior walls, as written');
  const h = harbor(); assert.deepEqual(validate(D, h).errors, []);
  const html = build(D, h).html;
  assert.doesNotMatch(html, /418 Alder Rise|Wren|Fernhollow/, 'nothing of the sample listing');
  assert.match(html, /const rooms=\[\n \{id:'bed2',name:'Bedroom 2',x:0,y:0,w:12,d:10,mat:'oak'\}/);
  assert.match(html, /const intw=\[\{a:\[/); assert.match(html, /const doors=\[/);
  assert.match(html, /S=Math\.min\(availW\/54,availH\/38\)/, 'framed for a 44 x 28 footprint');
  assert.match(html, /'<span>44′-0″ · 13\.41 m<\/span>'/); assert.match(html, /'<span>28′-0″ · 8\.53 m<\/span>'/);
  assert.match(html, /viewBox="-1\.5 -1\.5 47 31"/, 'the room locator');
  assert.match(html, /10 rooms on one floor, 1,232 sq ft \(114\.5 m²\)\. Dimensions are wall to wall\. Room sizes are the listing’s; the layout is drawn to show them\./);
  assert.match(html, /Math\.atan2\(8,16\)/, 'a 6:12 roof over 28 feet (16 out to the eave, 8 up)');
  assert.doesNotMatch(html, /class="creek"/, 'no creek drawn where the area has none');
});

test('the generated plan: windows by room, one front door, a door into every closed room', () => {
  const P = planFrom(harbor().model.rooms);
  assert.equal(P.W, 44); assert.equal(P.D, 28);
  const front = P.ext.flatMap((e) => e.ops.filter((o) => o.door));
  assert.equal(front.length, 1, 'one front door');
  assert.ok(P.ext[0].ops.some((o) => o.door), 'in the living room, on the south wall');
  const big = P.ext[0].ops.filter((o) => !o.door);
  assert.ok(big.some((o) => o.s === .6 && o.h === 7.6), 'the living room gets its tall glass');
  assert.ok(P.ext[2].ops.some((o) => o.s === 5.6 && o.h === 2.2), 'a bath gets a high window on the north wall');
  // a door into each closed room (10 rooms: living and kitchen are open plan, the hall is circulation)
  assert.equal(P.doors.length, 1 + 7);
  // the ensuite and the walk-in open off the primary bedroom (y 14, swinging north into them)
  assert.ok(P.doors.some((d) => d.y === 14 && d.x >= 32 && d.x < 38 && d.sy === -1));
  assert.ok(P.doors.some((d) => d.y === 14 && d.x >= 38 && d.sy === -1));
  // no wall between the open-plan living room and kitchen
  assert.ok(!P.intw.some((w) => w.a[0] === 18 && w.b[0] === 18 && w.a[1] >= 14));
});

test('rooms that do not make one rectangle are sent back with what is wrong', () => {
  const gap = harbor(); gap.model.rooms = gap.model.rooms.filter((r) => r.id !== 'laundry');
  assert.ok(validate(D, gap).errors.some((e) => /cover 1172 sq ft of the 44′ × 28′ footprint/.test(e)), JSON.stringify(validate(D, gap).errors));
  const overlap = harbor(); overlap.model.rooms[1].x = 10;
  assert.ok(validate(D, overlap).errors.some((e) => /Bedroom 2 and Bath overlap/.test(e)));
  const kind = harbor(); kind.model.rooms[0].kind = 'ballroom';
  assert.ok(validate(D, kind).errors.some((e) => /rooms\.0\.kind/.test(e)));
  const tour = harbor(); tour.rooms.tour[0].id = 'conservatory';
  assert.ok(validate(D, tour).errors.some((e) => /"conservatory" is not a room/.test(e)));
  const walk = harbor(); delete walk.area.places[0].dir;
  assert.ok(validate(D, walk).errors.some((e) => /area\.places\.0: give min/.test(e)));
});

test('the realism engine reads a listing as real estate', () => {
  const R = require('../lib/reality');
  const m = R.fromBrief({ kind: 'real', fields: [{ key: 'businessName' }, { key: 'home' }, { key: 'rooms' }], brief: { businessName: 'Tidewater Homes', home: '2 bed, 1 bath bungalow, 1,232 sq ft on a 0.11 acre lot, listed at $412,000.', rooms: 'Living 18 × 14 ft, kitchen 14 × 14 ft.' } });
  assert.equal(m.industry.id, 'realestate');
  const items = R.audit(m, [{ path: 'facts.items.2.dd', text: '1,232 sq ft' }, { path: 'area.title', text: 'Top-rated schools and a Walk Score of 92' }]);
  assert.equal(items.find((i) => i.text === '1,232 sq ft').status, 'confirmed');
  assert.ok(items.some((i) => i.kind === 'schools' && i.status === 'proposed' && i.material), 'school claims are held for the owner');
});
