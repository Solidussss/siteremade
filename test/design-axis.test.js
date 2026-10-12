'use strict';
// THE AXIS DESIGN (design-packages/design/axis): a physiotherapist's, chiropractor's or massage therapist's site whose
// hero measures one recovery on a goniometer. The joint and its stages, the areas, treatments, practitioners and times
// go into the page scripts; the rules send back what the page could not show. No model calls.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { loadDesign, validate, build } = require('../design-packages/engine/engine');

const D = loadDesign(path.join(__dirname, '..', 'design-packages', 'design', 'axis'));
const keystone = () => JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'design-sites', 'keystone-chiro.json'), 'utf8'));
const sample = () => JSON.parse(fs.readFileSync(path.join(D.dir, 'default.json'), 'utf8'));

test('the sample clinic builds clean; a chiropractor gets a back, its own areas, prices and team', () => {
  assert.deepEqual(validate(D, sample()).errors, []);
  assert.deepEqual(build(D, sample()).guards, [], 'the sample needs no layout guard');
  const c = keystone(); assert.deepEqual(validate(D, c).errors, []);
  const html = build(D, c).html;
  assert.doesNotMatch(html, /Axis|Leeds|0113|Patellar/, 'nothing of the sample business');
  assert.match(html, /const JOB=\{joint:'back',goal:90,finding:'Stiff lower back joints'\};/);
  assert.match(html, /\{n:'First visit',d:'Exam, first adjustment and a written plan',len:'45 min',p:95\}/);
  assert.match(html, /const PAYS=\['Self-pay','HSA and FSA cards'\];/);
  assert.match(html, /\{n:'Dr\. Maya Ortiz',role:'Chiropractor'\}/);
  assert.match(html, /<b>See a doctor first<\/b>/);
  assert.match(html, /href="tel:5125550136"/);
});

test('what the page could not show is sent back with the reason', () => {
  const errs = (f) => { const c = keystone(); f(c); return validate(D, c).errors; };
  assert.ok(errs((c) => { c.job.goal = 150; }).some((e) => /back is drawn up to 120/.test(e)));
  assert.ok(errs((c) => { c.stages[3].angle = 20; }).some((e) => /only grows/.test(e)));
  assert.ok(errs((c) => { c.stages[4].pain = 9; }).some((e) => /only falls/.test(e)));
  assert.ok(errs((c) => { c.book.times[0] = '7am'; }).some((e) => /book\.times\.0/.test(e)));
  assert.ok(errs((c) => { c.job.joint = 'hip'; }).some((e) => /job\.joint/.test(e)));
  assert.ok(errs((c) => { c.theme.accent = '#BFE6EA'; }).some((e) => /lightness|contrast/.test(e)));
});

test('the editor can add an area, a treatment and a practitioner', () => {
  const editor = require('../lib/design-editor');
  const spec = JSON.parse(fs.readFileSync(path.join(D.dir, 'brief.json'), 'utf8'));
  for (const list of ['where.areas', 'treatments.treats', 'book.people']) {
    const r = editor.apply(D, spec, keystone(), { ops: [{ op: 'add', list }] });
    assert.deepEqual(validate(D, r.content).errors, [], list);
  }
});
