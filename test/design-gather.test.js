'use strict';
// THE GATHER DESIGN (design-packages/design/gather): a wedding venue's site whose hero is the room from above through
// the day, with the turnaround where every chair moves to a table. The room and how it's dressed, the spaces, seasons,
// prices, the clock and the day go into the page scripts; the rules send back what the page could not show. No model
// calls.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { loadDesign, validate, build } = require('../design-packages/engine/engine');

const D = loadDesign(path.join(__dirname, '..', 'design-packages', 'design', 'gather'));
const willow = () => JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'design-sites', 'willowmere-estate.json'), 'utf8'));
const sample = () => JSON.parse(fs.readFileSync(path.join(D.dir, 'default.json'), 'utf8'));

test('the sample venue builds clean; an estate gets its own tent, tables of eight, prices and a 12-hour clock', () => {
  assert.deepEqual(validate(D, sample()).errors, []);
  assert.deepEqual(build(D, sample()).guards, [], 'the sample needs no layout guard');
  const c = willow(); assert.deepEqual(validate(D, c).errors, []);
  const html = build(D, c).html;
  assert.doesNotMatch(html, /Harrow Barn|Cotswolds|960384/, 'nothing of the sample business');
  assert.match(html, /const VENUE=\{kind:'marquee',guests:140,seats:8,chair:'#E9E4D8',linen:'#F4EEE4',flowers:\['#F6F1E6','#C9D6B4','#E7C9A9'\]\};/);
  assert.match(html, /const H12=true;/);
  assert.match(html, /id="gClock">10:00 am</);
  assert.match(html, /const DAYS=\[\{n:'Saturday',dow:\[6\]\},\{n:'Friday',dow:\[5\]\},\{n:'Sunday',dow:\[0\]\},\{n:'Mon–Thu',dow:\[1,2,3,4\]\}\];/);
  assert.match(html, /const GUESTS=\{min:50,max:200,start:140,perHead:65\};/);
  assert.match(html, /min="50" max="200" step="5" value="140"/);
  assert.match(html, /href="tel:8455550127"/);
});

test('what the page could not show is sent back with the reason', () => {
  const errs = (f) => { const c = willow(); f(c); return validate(D, c).errors; };
  assert.ok(errs((c) => { c.venue.kind = 'castle'; }).some((e) => /venue\.kind/.test(e)));
  assert.ok(errs((c) => { c.venue.seats = 12; }).some((e) => /venue\.seats/.test(e)));
  assert.ok(errs((c) => { c.price.guests.start = 300; }).some((e) => /price\.guests/.test(e)));
  assert.ok(errs((c) => { c.price.seasons[1].months = [5]; }).some((e) => /already in another season/.test(e)));
  assert.ok(errs((c) => { c.price.seasons[0].hire = [1, 2, 3]; }).some((e) => /hire/.test(e)));
  assert.ok(errs((c) => { c.theme.accent = '#D9E3D3'; }).some((e) => /lightness|contrast/.test(e)));
});

test('the editor can add a space and a moment of the day', () => {
  const editor = require('../lib/design-editor');
  const spec = JSON.parse(fs.readFileSync(path.join(D.dir, 'brief.json'), 'utf8'));
  for (const list of ['day.items']) {
    const r = editor.apply(D, spec, willow(), { ops: [{ op: 'add', list }] });
    assert.deepEqual(validate(D, r.content).errors, [], list);
  }
});
