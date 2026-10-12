'use strict';
// THE HALDEN & VALE DESIGN (design-packages/design/halden): a law firm's or accountants' site whose hero works one
// example matter on a desk. The firm's areas and situations, fees, people, promises, regulator line and the example
// matter go into the page scripts; the rules send back what the page could not show. No model calls.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { loadDesign, validate, build } = require('../design-packages/engine/engine');

const D = loadDesign(path.join(__dirname, '..', 'design-packages', 'design', 'halden'));
const ledger = () => JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'design-sites', 'ledgeroak-accountants.json'), 'utf8'));
const sample = () => JSON.parse(fs.readFileSync(path.join(D.dir, 'default.json'), 'utf8'));

test('the sample firm builds clean; an accountancy practice gets its own matter, services and fees', () => {
  assert.deepEqual(validate(D, sample()).errors, []);
  assert.deepEqual(build(D, sample()).guards, [], 'the sample needs no layout guard');
  const c = ledger(); assert.deepEqual(validate(D, c).errors, []);
  const html = build(D, c).html;
  assert.doesNotMatch(html, /Solicitors Regulation|Bath|Priya Nair|HV-2481/, 'nothing of the sample firm');
  assert.match(html, /const FOLDERS=\['Income','Expenses','Bank','Receipts'\];/);
  assert.match(html, /const STAMP='Filed';/); assert.match(html, /const REF='LO-0731', FLAGS=2;/);
  assert.match(html, /\{n:'A tax return',fee:\[295,295\],time:'1–2 weeks',who:'Hannah Oakes',/);
  assert.match(html, /const HOW=\['Phone','Video'\];/);
  assert.match(html, /member firm of the Institute of Chartered Accountants in England and Wales/);
  assert.match(html, /<dd id="lFee">£295<\/dd>/);
  assert.doesNotMatch(html, /--accent:#1F6B5E/i, 'the firm colour turned');
});

test('what the page could not show is sent back with the reason', () => {
  const errs = (f) => { const c = ledger(); f(c); return validate(D, c).errors; };
  assert.ok(errs((c) => { c.guide.areas[0].sits[0].who = 'Jo Bloggs'; }).some((e) => /"Jo Bloggs" is not in people\.list/.test(e)));
  assert.ok(errs((c) => { c.stages[3].day = 2; }).some((e) => /the days only go forward/.test(e)));
  assert.ok(errs((c) => { c.guide.areas[0].sits[1].fee = [120, 60]; }).some((e) => /fee: low, then high/.test(e)));
  assert.ok(errs((c) => { c.consult.slots[0] = '9.30'; }).some((e) => /H:MM, 24-hour/.test(e)));
  assert.ok(errs((c) => { c.matter.flags = 4; }).some((e) => /matter\.flags/.test(e)));
  assert.ok(errs((c) => { c.theme.accent = '#9FD3C6'; }).some((e) => /lightness|contrast/.test(e)));
});

test('the editor can add a situation, a fee and a person', () => {
  const editor = require('../lib/design-editor');
  const spec = JSON.parse(fs.readFileSync(path.join(D.dir, 'brief.json'), 'utf8'));
  for (const list of ['guide.areas.0.sits', 'fees.items', 'consult.promises']) {
    const r = editor.apply(D, spec, ledger(), { ops: [{ op: 'add', list }] });
    assert.deepEqual(validate(D, r.content).errors, [], list);
  }
});
