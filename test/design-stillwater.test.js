'use strict';
// THE STILLWATER DESIGN (design-packages/design/stillwater): a yoga, pilates or fitness studio whose hero runs one class
// as a clock. The class and its phases, the timetable, passes and calculator and the first-class guide go into the page
// scripts; the rules send back what the page could not show. No model calls.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { loadDesign, validate, build } = require('../design-packages/engine/engine');

const D = loadDesign(path.join(__dirname, '..', 'design-packages', 'design', 'stillwater'));
const ironside = () => JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'design-sites', 'ironside-strength.json'), 'utf8'));
const sample = () => JSON.parse(fs.readFileSync(path.join(D.dir, 'default.json'), 'utf8'));

test('the sample studio builds clean; a strength gym gets intervals, spots and its own pricing', () => {
  assert.deepEqual(validate(D, sample()).errors, []);
  assert.deepEqual(build(D, sample()).guards, [], 'the sample needs no layout guard');
  const c = ironside(); assert.deepEqual(validate(D, c).errors, []);
  const html = build(D, c).html;
  assert.doesNotMatch(html, /Stillwater|Brighton|01273|Namaste/, 'nothing of the sample business');
  assert.match(html, /const CLASS=\{length:50,size:10,shape:'intervals',done:'Done'\};/);
  assert.match(html, /const EFFORT=\['','Easy','Moderate','Hard','Very hard','Max'\];/);
  assert.match(html, /const SPACE=\{one:'spot',many:'spots'\};/);
  assert.match(html, /const CALC=\{dropIn:28,pack:\{n:10,p:220\},member:189\};/);
  assert.match(html, /\[\['Drop in',CALC\.dropIn\*n\],\['Class card',/);
  assert.match(html, /href="tel:3035550161"/);
});

test('what the page could not show is sent back with the reason', () => {
  const errs = (f) => { const c = ironside(); f(c); return validate(D, c).errors; };
  assert.ok(errs((c) => { c.stages[2].from = 13; }).some((e) => /starts where the last ended/.test(e)));
  assert.ok(errs((c) => { c.stages[5].to = 55; }).some((e) => /class length/.test(e)));
  assert.ok(errs((c) => { c.timetable.week[0].k = 9; }).some((e) => /timetable\.week\.0\.k/.test(e)));
  assert.ok(errs((c) => { c.timetable.week[0].taken = 30; }).some((e) => /no more taken than places/.test(e)));
  assert.ok(errs((c) => { c.timetable.week[0].t = '6am'; }).some((e) => /a time like 07:00|timetable\.week\.0\.t/.test(e)));
  assert.ok(errs((c) => { c.class.shape = 'tabata'; }).some((e) => /class\.shape/.test(e)));
  assert.ok(errs((c) => { c.theme.accent = '#F4D0C0'; }).some((e) => /lightness|contrast/.test(e)));
});

test('the editor can add a class to the week and a question', () => {
  const editor = require('../lib/design-editor');
  const spec = JSON.parse(fs.readFileSync(path.join(D.dir, 'brief.json'), 'utf8'));
  for (const list of ['timetable.week', 'first.faq']) {
    const r = editor.apply(D, spec, ironside(), { ops: [{ op: 'add', list }] });
    assert.deepEqual(validate(D, r.content).errors, [], list);
  }
});
