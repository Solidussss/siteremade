'use strict';
// THE HEARTH DESIGN (design-packages/design/hearth): a bed and breakfast's site whose hero is the house cut open like a
// doll's house through one night. The brick and door, the rooms and their colours, the room you're shown to, the
// numbers, the sign, weekend prices, places nearby and the clock go into the page scripts; the rules send back what the
// page could not show. No model calls.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { loadDesign, validate, build } = require('../design-packages/engine/engine');

const D = loadDesign(path.join(__dirname, '..', 'design-packages', 'design', 'hearth'));
const saltbox = () => JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'design-sites', 'saltbox-inn.json'), 'utf8'));
const sample = () => JSON.parse(fs.readFileSync(path.join(D.dir, 'default.json'), 'utf8'));

test('the sample house builds clean; a coastal inn gets its own house, rooms, rates and a 12-hour clock', () => {
  assert.deepEqual(validate(D, sample()).errors, []);
  assert.deepEqual(build(D, sample()).guards, [], 'the sample needs no layout guard');
  const c = saltbox(); assert.deepEqual(validate(D, c).errors, []);
  const html = build(D, c).html;
  assert.doesNotMatch(html, /Linden House|York|960275/, 'nothing of the sample business');
  assert.match(html, /const HOUSE=\{brick:'#E6DFD3',door:'#2F5E7A',yours:2,rooms:\[\{wall:'#D6E2E6',throw:'#2F5E7A'\},\{wall:'#DDE5D3',throw:'#5E7F4E'\},\{wall:'#E9E1D2',throw:'#8E3B32'\},\{wall:'#EFE6DA',throw:'#B07A2E'\},\{wall:'#D6E2E6',throw:'#2F5E7A'\}\]\};/);
  assert.match(html, /const H12=true;/);
  assert.match(html, /id="gClock">6:00 pm</);
  assert.match(html, /const WEEKEND=40, MIN_WEEKEND=2;/);
  assert.match(html, /let rm=2;/);
  assert.match(html, /<h3 id="sRoom">The Captain&#39;s Room<\/h3>|<h3 id="sRoom">The Captain's Room<\/h3>/);
  assert.match(html, /const RING=\[5,15\];/);
  assert.match(html, /href="tel:2075550168"/);
});

test('what the page could not show is sent back with the reason', () => {
  const errs = (f) => { const c = saltbox(); f(c); return validate(D, c).errors; };
  assert.ok(errs((c) => { c.stay.room = 5; }).some((e) => /stay\.room/.test(e)));
  assert.ok(errs((c) => { c.house.brick = 'glass'; }).some((e) => /house\.brick/.test(e)));
  assert.ok(errs((c) => { c.nearby.rings = [15, 5]; }).some((e) => /inner ring first/.test(e)));
  assert.ok(errs((c) => { c.rooms.list = c.rooms.list.slice(0, 1); }).some((e) => /rooms\.list/.test(e)));
  assert.ok(errs((c) => { c.theme.accent = '#F2D3C2'; }).some((e) => /lightness|contrast/.test(e)));
});

test('the editor can add a room and a place nearby', () => {
  const editor = require('../lib/design-editor');
  const spec = JSON.parse(fs.readFileSync(path.join(D.dir, 'brief.json'), 'utf8'));
  for (const list of ['rooms.list', 'nearby.places']) {
    const r = editor.apply(D, spec, saltbox(), { ops: [{ op: 'add', list }] });
    assert.deepEqual(validate(D, r.content).errors, [], list);
  }
});
