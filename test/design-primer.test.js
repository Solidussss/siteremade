'use strict';
// THE PRIMER DESIGN (design-packages/design/primer): a tutor's site whose hero writes out a lesson in an exercise book.
// The lesson, the red pen, subjects, levels and rates, lesson lengths, how often, times and tutors go into the page
// scripts; the rules send back what the page could not show. No model calls.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { loadDesign, validate, build } = require('../design-packages/engine/engine');

const D = loadDesign(path.join(__dirname, '..', 'design-packages', 'design', 'primer'));
const vec = () => JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'design-sites', 'vector-tutoring.json'), 'utf8'));
const sample = () => JSON.parse(fs.readFileSync(path.join(D.dir, 'default.json'), 'utf8'));

test('the sample tutor builds clean; a maths tutor gets their own lesson, sketch, rates and term', () => {
  assert.deepEqual(validate(D, sample()).errors, []);
  assert.deepEqual(build(D, sample()).guards, [], 'the sample needs no layout guard');
  const c = vec(); assert.deepEqual(validate(D, c).errors, []);
  const html = build(D, c).html;
  assert.doesNotMatch(html, /Brightwell|Newcastle|960447/, 'nothing of the sample business');
  assert.match(html, /topic:'Pythagoras',question:'a = 3, b = 4\. Find c',idea:'The two short sides squared add up to the long side squared\.',sketch:'triangle'/);
  assert.match(html, /const INK=\{pen:'#2D4FA3',red:'#1D4ED8',pencil:'#6B7180'\};/);
  assert.match(html, /const LEVELS=\[\{n:'Grade 7–9',d:'Middle school',rate:60\}/);
  assert.match(html, /const LENGTHS=\[60,90\];/);
  assert.match(html, /const TERM=10;/);
  assert.match(html, /let lv=1, ln=1, fq=0;/);
  assert.match(html, /href="tel:4165550182"/);
});

test('what the page could not show is sent back with the reason', () => {
  const errs = (f) => { const c = vec(); f(c); return validate(D, c).errors; };
  assert.ok(errs((c) => { c.lesson.score = 7; }).some((e) => /lesson\.score/.test(e)));
  assert.ok(errs((c) => { c.lesson.right = '36 + 64 = 100 so c = 10'; }).some((e) => /too long for a line/.test(e)));
  assert.ok(errs((c) => { c.lesson.sketch = 'cube'; }).some((e) => /lesson\.sketch/.test(e)));
  assert.ok(errs((c) => { c.trial.times[0] = '4pm'; }).some((e) => /trial\.times\.0/.test(e)));
  assert.ok(errs((c) => { c.theme.accent = '#D6E2FA'; }).some((e) => /lightness|contrast/.test(e)));
});

test('the editor can add a subject and a tutor', () => {
  const editor = require('../lib/design-editor');
  const spec = JSON.parse(fs.readFileSync(path.join(D.dir, 'brief.json'), 'utf8'));
  for (const list of ['subjects.list', 'trial.tutors']) {
    const r = editor.apply(D, spec, vec(), { ops: [{ op: 'add', list }] });
    assert.deepEqual(validate(D, r.content).errors, [], list);
  }
});
