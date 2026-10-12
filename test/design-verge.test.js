'use strict';
// THE VERGE DESIGN (design-packages/design/verge): a landscape gardener's site whose hero runs one back-garden
// makeover from above. The job and its style, units, features and prices, the care calendar and the visit go into the
// page scripts; the rules send back what the page could not show. No model calls.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { loadDesign, validate, build } = require('../design-packages/engine/engine');

const D = loadDesign(path.join(__dirname, '..', 'design-packages', 'design', 'verge'));
const juniper = () => JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'design-sites', 'juniper-landscapes.json'), 'utf8'));
const sample = () => JSON.parse(fs.readFileSync(path.join(D.dir, 'default.json'), 'utf8'));

test('the sample gardener builds clean; a modern US designer gets square feet, its own prices and seasons', () => {
  assert.deepEqual(validate(D, sample()).errors, []);
  assert.deepEqual(build(D, sample()).guards, [], 'the sample needs no layout guard');
  const c = juniper(); assert.deepEqual(validate(D, c).errors, []);
  const html = build(D, c).html;
  assert.doesNotMatch(html, /Verge|Surrey|Guildford|01483/, 'nothing of the sample business');
  assert.match(html, /const STYLE='modern';/);
  assert.match(html, /const UNIT=\{area:'sq ft',length:'ft'\};/);
  assert.match(html, /const JOB=\{area:2200,tonnes:6\.5,plants:64,days:15\};/);
  assert.match(html, /\{n:'Patio',d:'Porcelain or flagstone',icon:'patio',from:4000,rate:3,days:3,per100:\.1\}/);
  assert.match(html, /min="200" max="5000" step="50" value="1000"/);
  assert.match(html, /<label>ZIP code<input id="fCode"/);
  assert.match(html, /return fail\('Add your ZIP code so we know where the garden is\.'/);
  assert.match(html, /href="tel:5125550193"/);
});

test('what the page could not show is sent back with the reason', () => {
  const errs = (f) => { const c = juniper(); f(c); return validate(D, c).errors; };
  assert.ok(errs((c) => { c.job.style = 'japanese'; }).some((e) => /job\.style/.test(e)));
  assert.ok(errs((c) => { c.quote.size.start = 1010; }).some((e) => /steps of 50/.test(e)));
  assert.ok(errs((c) => { c.quote.spread = [1.1, 1.3]; }).some((e) => /quote\.spread/.test(e)));
  assert.ok(errs((c) => { c.care.months.pop(); }).some((e) => /care\.months/.test(e)));
  assert.ok(errs((c) => { c.quote.features[0].icon = 'pool'; }).some((e) => /icon/.test(e)));
  assert.ok(errs((c) => { c.theme.accent = '#B8E0B0'; }).some((e) => /lightness|contrast/.test(e)));
});

test('the editor can add a feature, a care plan and a visit time', () => {
  const editor = require('../lib/design-editor');
  const spec = JSON.parse(fs.readFileSync(path.join(D.dir, 'brief.json'), 'utf8'));
  for (const list of ['quote.features', 'care.plans', 'book.times']) {
    const r = editor.apply(D, spec, juniper(), { ops: [{ op: 'add', list }] });
    assert.deepEqual(validate(D, r.content).errors, [], list);
  }
});
