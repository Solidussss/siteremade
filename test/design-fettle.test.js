'use strict';
// THE FETTLE DESIGN (design-packages/design/fettle): a plumber's, electrician's or heating engineer's site whose hero
// runs one call-out in a house cutaway. The trade (what runs through the walls), problems, prices, areas and
// credentials go into the page scripts; the rules send back what the page could not show. No model calls.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { loadDesign, validate, build } = require('../design-packages/engine/engine');

const D = loadDesign(path.join(__dirname, '..', 'design-packages', 'design', 'fettle'));
const spark = () => JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'design-sites', 'sparkspur-electrician.json'), 'utf8'));
const sample = () => JSON.parse(fs.readFileSync(path.join(D.dir, 'default.json'), 'utf8'));

test('the sample plumber builds clean; an electrician gets wiring, its own prices and area', () => {
  assert.deepEqual(validate(D, sample()).errors, []);
  assert.deepEqual(build(D, sample()).guards, [], 'the sample needs no layout guard');
  const c = spark(); assert.deepEqual(validate(D, c).errors, []);
  const html = build(D, c).html;
  assert.doesNotMatch(html, /Fettle|Bristol|Split waste seal|Gas Safe/, 'nothing of the sample business');
  assert.match(html, /const TRADE='electrical';/);
  assert.match(html, /const TEST=\{label:'Insulation',value:'200 MΩ'\};/);
  assert.match(html, /const CALLOUT=129, OOH=1\.5;/);
  assert.match(html, /\{t:'Each extra 30 minutes',p:55\}/);
  assert.match(html, /\{n:'Round Rock',codes:\['78664','78665'\],m:35\}/);
  assert.match(html, /const BRAND='SPARK & SPUR';/);
  assert.match(html, /href="tel:5125550174"/);
});

test('what the page could not show is sent back with the reason', () => {
  const errs = (f) => { const c = spark(); f(c); return validate(D, c).errors; };
  assert.ok(errs((c) => { c.job.trade = 'roofing'; }).some((e) => /job\.trade/.test(e)));
  assert.ok(errs((c) => { c.fix.problems[0].price = [300, 150]; }).some((e) => /low, then high/.test(e)));
  assert.ok(errs((c) => { delete c.prices.rates[1].v; }).some((e) => /either a price \(p\) or a plain answer \(v\)/.test(e)));
  assert.ok(errs((c) => { c.area.areas[0].codes = ['XYZ']; }).some((e) => /a postcode area like BS8/.test(e)));
  assert.ok(errs((c) => { c.theme.accent = '#9FC4FF'; }).some((e) => /lightness|contrast/.test(e)));
});

test('the editor can add a problem, a job and a town', () => {
  const editor = require('../lib/design-editor');
  const spec = JSON.parse(fs.readFileSync(path.join(D.dir, 'brief.json'), 'utf8'));
  for (const list of ['fix.problems', 'prices.jobs', 'area.areas']) {
    const r = editor.apply(D, spec, spark(), { ops: [{ op: 'add', list }] });
    assert.deepEqual(validate(D, r.content).errors, [], list);
  }
});
