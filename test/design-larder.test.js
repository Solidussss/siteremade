'use strict';
// THE LARDER & LAMP DESIGN (design-packages/design/larder): a restaurant's site whose hero serves a dinner for two on a
// table seen from above. The restaurant's menu, the plates served, its tables, hours and streets go into the page
// scripts; the rules send back what the page could not show. No model calls.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { loadDesign, validate, build } = require('../design-packages/engine/engine');

const D = loadDesign(path.join(__dirname, '..', 'design-packages', 'design', 'larder'));
const saffron = () => JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'design-sites', 'saffronlane-restaurant.json'), 'utf8'));
const sample = () => JSON.parse(fs.readFileSync(path.join(D.dir, 'default.json'), 'utf8'));

test('the sample restaurant builds clean; another gets its own menu, plates, tables and map', () => {
  assert.deepEqual(validate(D, sample()).errors, []);
  assert.deepEqual(build(D, sample()).guards, [], 'the sample needs no layout guard');
  const c = saffron(); assert.deepEqual(validate(D, c).errors, []);
  const html = build(D, c).html;
  assert.doesNotMatch(html, /Larder|Jericho|Walton|Celeriac/, 'nothing of the sample restaurant');
  assert.match(html, /const TABLE=12, MINUTES=95, WINE=0, COVERS=\[20,64\];/);
  assert.match(html, /\[\{kind:'bowl',col:'#E0A52E'\},\{kind:'meat',col:'#C8523A'\}\]/);
  assert.match(html, /\{n:'Goan fish curry',d:'Coconut, kokum, rice',p:24,t:\['GF'\]\}/);
  assert.match(html, /const PAIRING=0;/); assert.match(html, /const SEATS=\[2,2,4,4,4,8,2,4,8\];/);
  assert.match(html, /const HOURS=\[\[12,21\],null,\[17,22\],\[17,22\],\[17,22\],\[17,23\],\[12,23\]\];/);
  assert.match(html, /water:null/, 'no water near this one');
  assert.match(html, /const CANDLE='#D9A23A';/, 'the candle keeps its own colour');
  assert.doesNotMatch(html, /--accent:#D9A23A/i, 'the brand colour turned');
});

test('what the page could not show is sent back with the reason', () => {
  const errs = (f) => { const c = saffron(); f(c); return validate(D, c).errors; };
  assert.ok(errs((c) => { c.room.seats[0] = 6; }).some((e) => /table 1 is round \(2-4 seats\)/.test(e)));
  assert.ok(errs((c) => { c.room.seats[5] = 2; }).some((e) => /table 6 is long \(4-8 seats\)/.test(e)));
  assert.ok(errs((c) => { c.dishes[0][0].kind = 'pizza'; }).some((e) => /"pizza" is not one of/.test(e)));
  assert.ok(errs((c) => { c.menu.courses[0].items[0].p = 9.999; }).some((e) => /to the penny/.test(e)));
  assert.ok(errs((c) => { c.visit.hours.tue = { open: '17:10', close: '22:00' }; }).some((e) => /in quarter hours/.test(e)));
  assert.ok(errs((c) => { c.visit.hours.tue = { open: '21:00', close: '22:00' }; }).some((e) => /at least an hour and a half/.test(e)));
  assert.ok(errs((c) => { c.dinner.covers = [64, 20]; }).some((e) => /no fewer/.test(e)));
  assert.ok(errs((c) => { c.theme.accent = '#3A2A80'; }).some((e) => /lightness|contrast/.test(e)));
});

test('the editor can add a dish and a section', () => {
  const editor = require('../lib/design-editor');
  const spec = JSON.parse(fs.readFileSync(path.join(D.dir, 'brief.json'), 'utf8'));
  for (const list of ['menu.courses', 'menu.courses.0.items']) {
    const r = editor.apply(D, spec, saffron(), { ops: [{ op: 'add', list }] });
    assert.deepEqual(validate(D, r.content).errors, [], list);
  }
});
