'use strict';
// THE BRISK DESIGN (design-packages/design/brisk): a cleaning company's site whose hero runs one visit through a flat's
// floor plan, room by room. The visit, types of clean and prices, extras, checklists and start times go into the page
// scripts; the rules send back what the page could not show. No model calls.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { loadDesign, validate, build } = require('../design-packages/engine/engine');

const D = loadDesign(path.join(__dirname, '..', 'design-packages', 'design', 'brisk'));
const spruce = () => JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'design-sites', 'spruce-cleaning.json'), 'utf8'));
const sample = () => JSON.parse(fs.readFileSync(path.join(D.dir, 'default.json'), 'utf8'));

test('the sample cleaner builds clean; another company gets its own visit, prices and checklist', () => {
  assert.deepEqual(validate(D, sample()).errors, []);
  assert.deepEqual(build(D, sample()).guards, [], 'the sample needs no layout guard');
  const c = spruce(); assert.deepEqual(validate(D, c).errors, []);
  const html = build(D, c).html;
  assert.doesNotMatch(html, /Brisk|North London|Maria|020 7946/, 'nothing of the sample business');
  assert.match(html, /const MINUTES=165;/);
  assert.match(html, /\{n:'Kitchen',tasks:\['Stovetop','Sink','Counters','Floor'\]\}/);
  assert.match(html, /\{n:'Move-out',base:180,bed:55,bath:55,mins:\[180,75,90\],repeat:false\}/);
  assert.match(html, /const OFTEN=\[\{n:'Weekly',off:20\},\{n:'Every 2 weeks',off:15\},\{n:'Every 4 weeks',off:10\},\{n:'One time',off:0\}\];/);
  assert.match(html, /\{n:'Inside cabinets',p:35,m:45,in:\[1,2\]\}/);
  assert.match(html, /const CLOSED=\[0,6\];/);
  assert.match(html, /<dd id="sPrice">\$145<\/dd>/);
  assert.match(html, /href="tel:5035550142"/);
});

test('what the page could not show is sent back with the reason', () => {
  const errs = (f) => { const c = spruce(); f(c); return validate(D, c).errors; };
  assert.ok(errs((c) => { c.quote.extras[0].in = [7]; }).some((e) => /quote\.extras\.0\.in/.test(e)));
  assert.ok(errs((c) => { c.quote.often[c.quote.often.length - 1].off = 5; }).some((e) => /one-off/.test(e)));
  assert.ok(errs((c) => { c.quote.limits.bed = [3, 5]; }).some((e) => /starts on 2 bedrooms/.test(e)));
  assert.ok(errs((c) => { c.book.closed = [0, 9]; }).some((e) => /book\.closed/.test(e)));
  assert.ok(errs((c) => { c.clean.rooms.pop(); }).some((e) => /clean\.rooms/.test(e)));
  assert.ok(errs((c) => { c.theme.accent = '#9FE0CF'; }).some((e) => /lightness|contrast/.test(e)));
});

test('the editor can add an extra, a type of clean and a start time', () => {
  const editor = require('../lib/design-editor');
  const spec = JSON.parse(fs.readFileSync(path.join(D.dir, 'brief.json'), 'utf8'));
  for (const list of ['quote.extras', 'quote.kinds', 'book.times']) {
    const r = editor.apply(D, spec, spruce(), { ops: [{ op: 'add', list }] });
    assert.deepEqual(validate(D, r.content).errors, [], list);
  }
});
