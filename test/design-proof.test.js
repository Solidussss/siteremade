'use strict';
// THE PROOF DESIGN (design-packages/design/proof): a bakery's or cake maker's site whose hero runs one bake from the side.
// The bake (loaf or cake), the board, today's bakes, the cake builder and the opening hours go into the page scripts;
// the rules send back what the page could not show. No model calls.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { loadDesign, validate, build } = require('../design-packages/engine/engine');

const D = loadDesign(path.join(__dirname, '..', 'design-packages', 'design', 'proof'));
const sugar = () => JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'design-sites', 'sugarlayer-cakes.json'), 'utf8'));
const sample = () => JSON.parse(fs.readFileSync(path.join(D.dir, 'default.json'), 'utf8'));

test('the sample bakery builds clean; a cake studio gets the cake bake, its own board, cakes and hours', () => {
  assert.deepEqual(validate(D, sample()).errors, []);
  assert.deepEqual(build(D, sample()).guards, [], 'the sample needs no layout guard');
  const c = sugar(); assert.deepEqual(validate(D, c).errors, []);
  const html = build(D, c).html;
  assert.doesNotMatch(html, /Proof Bakehouse|Oxford|Cowley|01865/, 'nothing of the sample business');
  assert.match(html, /const MAKE='cake';/);
  assert.match(html, /\{label:'Oven',unit:'°F',from:70,to:340,at:\[1,1\],dec:0\}/);
  assert.match(html, /\{n:'Two tier',serves:'50',p:260,tiers:2,notice:10\}/);
  assert.match(html, /\{n:'Berry drip',p:20,ice:'drip'\}/);
  assert.match(html, /\{d:'Tuesday',h:'Closed'\}/);
  assert.match(html, /<dt>Layers<\/dt><dd id="bProve">0<\/dd>/);
  assert.match(html, /href="tel:3125550129"/);
});

test('what the page could not show is sent back with the reason', () => {
  const errs = (f) => { const c = sugar(); f(c); return validate(D, c).errors; };
  assert.ok(errs((c) => { c.bake.make = 'pie'; }).some((e) => /bake\.make/.test(e)));
  assert.ok(errs((c) => { c.board[0].at = [4, 2]; }).some((e) => /the first stage, then the last/.test(e)));
  assert.ok(errs((c) => { c.order.hours.pop(); }).some((e) => /order\.hours/.test(e)));
  assert.ok(errs((c) => { c.order.hours.forEach((h) => { h.h = 'Closed'; }); }).some((e) => /open at least one day/.test(e)));
  assert.ok(errs((c) => { c.cakes.finishes[0].ice = 'fondant'; }).some((e) => /ice/.test(e)));
  assert.ok(errs((c) => { c.theme.accent = '#E8C7DA'; }).some((e) => /lightness|contrast/.test(e)));
});

test('the editor can add a bake, a sponge and a filling', () => {
  const editor = require('../lib/design-editor');
  const spec = JSON.parse(fs.readFileSync(path.join(D.dir, 'brief.json'), 'utf8'));
  for (const list of ['today.bakes', 'cakes.sponges', 'cakes.fills']) {
    const r = editor.apply(D, spec, sugar(), { ops: [{ op: 'add', list }] });
    assert.deepEqual(validate(D, r.content).errors, [], list);
  }
});
