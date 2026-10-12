'use strict';
// THE CAMBER DESIGN (design-packages/design/camber): a garage's site whose hero follows one vehicle through the
// workshop. The car and its checks, the fix, sizes and prices, promises, the sample message and the booking go into the
// page scripts; the rules send back what the page could not show. No model calls.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { loadDesign, validate, build } = require('../design-packages/engine/engine');

const D = loadDesign(path.join(__dirname, '..', 'design-packages', 'design', 'camber'));
const redline = () => JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'design-sites', 'redline-auto.json'), 'utf8'));
const sample = () => JSON.parse(fs.readFileSync(path.join(D.dir, 'default.json'), 'utf8'));

test('the sample garage builds clean; a US shop gets its SUV, its own checks, prices and a plain plate', () => {
  assert.deepEqual(validate(D, sample()).errors, []);
  assert.deepEqual(build(D, sample()).guards, [], 'the sample needs no layout guard');
  const c = redline(); assert.deepEqual(validate(D, c).errors, []);
  const html = build(D, c).html;
  assert.doesNotMatch(html, /Camber|Manchester|MA19 KRT|0161/, 'nothing of the sample business');
  assert.match(html, /const CAR=\{reg:'8KTR219',body:'suv',paint:'#9A2B2B'\};/);
  assert.match(html, /\{n:'Battery',key:'battery',v:'9\.8 V',s:'bad'\}/);
  assert.match(html, /const FIX=\{what:'New battery, terminals cleaned',price:'\$189'\};/);
  assert.match(html, /\{n:'A\/C recharge',d:'Leak check and refill',p:\[149,149,179\]\}/);
  assert.match(html, /const START=\{size:2,jobs:\[0,1\]\};/);
  assert.match(html, /const PLATE='plain';/);
  assert.match(html, /return fail\('Add your license plate so we can look the car up\.'/);
  assert.match(html, /href="tel:6025550148"/);
});

test('what the page could not show is sent back with the reason', () => {
  const errs = (f) => { const c = redline(); f(c); return validate(D, c).errors; };
  assert.ok(errs((c) => { c.checks[0].s = 'ok'; }).some((e) => /exactly one check is bad/.test(e)));
  assert.ok(errs((c) => { c.checks[1].key = 'battery'; }).some((e) => /each place on the car/.test(e)));
  assert.ok(errs((c) => { c.prices.jobs[0].p.pop(); }).some((e) => /one price for each size/.test(e)));
  assert.ok(errs((c) => { c.prices.start.jobs = [0, 9]; }).some((e) => /prices\.start\.jobs/.test(e)));
  assert.ok(errs((c) => { c.car.body = 'truck'; }).some((e) => /car\.body/.test(e)));
  assert.ok(errs((c) => { c.theme.accent = '#2A1A10'; }).some((e) => /lightness|contrast/.test(e)));
});

test('the editor can add a job, an option and a drop-off time', () => {
  const editor = require('../lib/design-editor');
  const spec = JSON.parse(fs.readFileSync(path.join(D.dir, 'brief.json'), 'utf8'));
  for (const list of ['prices.jobs', 'book.opts', 'book.drops']) {
    const r = editor.apply(D, spec, redline(), { ops: [{ op: 'add', list }] });
    assert.deepEqual(validate(D, r.content).errors, [], list);
  }
});
