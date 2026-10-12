'use strict';
// THE SCRUFF DESIGN (design-packages/design/scruff): a dog groomer's or vet's site whose hero follows one dog through a
// groom or a check-up. The dog, the tally, sizes and services, the visit and the booking go into the page scripts; the
// rules send back what the page could not show. No model calls.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { loadDesign, validate, build } = require('../design-packages/engine/engine');

const D = loadDesign(path.join(__dirname, '..', 'design-packages', 'design', 'scruff'));
const lonestar = () => JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'design-sites', 'lonestar-vet.json'), 'utf8'));
const sample = () => JSON.parse(fs.readFileSync(path.join(D.dir, 'default.json'), 'utf8'));

test('the sample groomer builds clean; a vet gets the check-up, its own dog, tally and prices', () => {
  assert.deepEqual(validate(D, sample()).errors, []);
  assert.deepEqual(build(D, sample()).guards, [], 'the sample needs no layout guard');
  const c = lonestar(); assert.deepEqual(validate(D, c).errors, []);
  const html = build(D, c).html;
  assert.doesNotMatch(html, /Scruff|Bristol|Biscuit|0117/, 'nothing of the sample business');
  assert.match(html, /const KIND='vet';/);
  assert.match(html, /const DOG=\{name:'Pepper',coat:'#3A3029'\};/);
  assert.match(html, /\{label:'Weight',unit:'lb',from:0,to:38\.4,at:\[1,1\],dec:1\}/);
  assert.match(html, /<dt>Weight<\/dt><dd id="tCoat">0<small>lb<\/small><\/dd>/);
  assert.match(html, /\{n:'Exam and vaccines',time:'About 40 minutes',p:\[125,135,145\]/);
  assert.match(html, /href="tel:5125550177"/);
});

test('what the page could not show is sent back with the reason', () => {
  const errs = (f) => { const c = lonestar(); f(c); return validate(D, c).errors; };
  assert.ok(errs((c) => { c.prices.services[0].p.pop(); }).some((e) => /one price for each size/.test(e)));
  assert.ok(errs((c) => { c.prices.start = 3; }).some((e) => /prices\.start/.test(e)));
  assert.ok(errs((c) => { c.tally[0].at = [3, 1]; }).some((e) => /the first stage, then the last/.test(e)));
  assert.ok(errs((c) => { c.dog.kind = 'boarding'; }).some((e) => /dog\.kind/.test(e)));
  assert.ok(errs((c) => { c.book.times[0] = '9am'; }).some((e) => /book\.times\.0/.test(e)));
  assert.ok(errs((c) => { c.theme.accent = '#CFE6F5'; }).some((e) => /lightness|contrast/.test(e)));
});

test('the editor can add an add-on', () => {
  const editor = require('../lib/design-editor');
  const spec = JSON.parse(fs.readFileSync(path.join(D.dir, 'brief.json'), 'utf8'));
  for (const list of ['prices.addons']) {
    const r = editor.apply(D, spec, lonestar(), { ops: [{ op: 'add', list }] });
    assert.deepEqual(validate(D, r.content).errors, [], list);
  }
});
