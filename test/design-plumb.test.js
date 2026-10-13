'use strict';
// THE PLUMB DESIGN (design-packages/design/plumb): a builder's site whose hero builds a rear extension on a house as you
// scroll. The house and its new part, the board's numbers and stage weeks, projects, finishes, the finished job and the
// build plan go into the page scripts; the rules send back what the page could not show. No model calls.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { loadDesign, validate, build } = require('../design-packages/engine/engine');

const D = loadDesign(path.join(__dirname, '..', 'design-packages', 'design', 'plumb'));
const field = () => JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'design-sites', 'fieldstone-build.json'), 'utf8'));
const sample = () => JSON.parse(fs.readFileSync(path.join(D.dir, 'default.json'), 'utf8'));

test('the sample builder builds clean; a design-build firm gets its own house, projects in square feet and dollars', () => {
  assert.deepEqual(validate(D, sample()).errors, []);
  assert.deepEqual(build(D, sample()).guards, [], 'the sample needs no layout guard');
  const c = field(); assert.deepEqual(validate(D, c).errors, []);
  const html = build(D, c).html;
  assert.doesNotMatch(html, /Brick &amp; Beam|Bristol|0522/, 'nothing of the sample business');
  assert.match(html, /const HOUSE=\{house:'#C9A66B',ext:'#E6E0D4',frame:'#1E1F22',kitchen:'#D9D2C3',blue:'#7A2E1F',dims:\['22 ft','14 ft'\]\};/);
  assert.match(html, /const WEEKS=\[0,2,4,7,9,13\];/);
  assert.match(html, /\{n:'Addition',d:'Single story',rate:\[380,520\],weeks:\[8,\.2\],size:\[150,800,300\]\}/);
  assert.match(html, /const DEPOSIT=\.15;/);
  assert.match(html, /min="150" max="800" step="1" value="300"/);
  assert.match(html, /href="tel:3035550186" id="qGo">Book a walkthrough</);
});

test('what the page could not show is sent back with the reason', () => {
  const errs = (f) => { const c = field(); f(c); return validate(D, c).errors; };
  assert.ok(errs((c) => { c.house.brick = 'glass'; }).some((e) => /house\.brick/.test(e)));
  assert.ok(errs((c) => { c.count.starts = [0, 5, 3, 7, 9, 13]; }).some((e) => /count\.starts/.test(e)));
  assert.ok(errs((c) => { c.price.kinds[0].rate = [600, 400]; }).some((e) => /low then high/.test(e)));
  assert.ok(errs((c) => { c.price.kinds[0].size = [150, 800, 900]; }).some((e) => /a start between them/.test(e)));
  assert.ok(errs((c) => { c.how.plan[0].len = 40; }).some((e) => /ends after week/.test(e)));
  assert.ok(errs((c) => { c.theme.accent = '#D9E6F2'; }).some((e) => /lightness|contrast/.test(e)));
});

test('the editor can add a stage to the build plan', () => {
  const editor = require('../lib/design-editor');
  const spec = JSON.parse(fs.readFileSync(path.join(D.dir, 'brief.json'), 'utf8'));
  for (const list of ['how.plan']) {
    const r = editor.apply(D, spec, field(), { ops: [{ op: 'add', list }] });
    assert.deepEqual(validate(D, r.content).errors, [], list);
  }
});
