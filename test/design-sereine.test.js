'use strict';
// THE SEREINE DESIGN (design-packages/design/sereine): a skincare brand's shop whose hero makes the hero product and
// puts a drop into skin. The brand's actives, products, skin types, concerns, ingredients and prices go into the page
// scripts; the rules send back what the page could not show. No model calls.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { loadDesign, validate, build } = require('../design-packages/engine/engine');

const D = loadDesign(path.join(__dirname, '..', 'design-packages', 'design', 'sereine'));
const tide = () => JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'design-sites', 'tidebloom-skincare.json'), 'utf8'));
const sample = () => JSON.parse(fs.readFileSync(path.join(D.dir, 'default.json'), 'utf8'));

test('the sample brand builds clean; another brand gets its own bottle, actives, range and shop', () => {
  assert.deepEqual(validate(D, sample()).errors, []);
  assert.deepEqual(build(D, sample()).guards, [], 'the sample needs no layout guard');
  const c = tide(); assert.deepEqual(validate(D, c).errors, []);
  const html = build(D, c).html;
  assert.doesNotMatch(html, /Barrier Serum|Niacinamide|S-014/, 'nothing of the sample brand');
  assert.match(html, /const NAME='Tidebloom';/, 'the brand on the hero bottle');
  assert.match(html, /const BATCH='TB-221', ML=30, PH=3\.5, DAYS=42;/);
  assert.match(html, /\{n:'Ferulic acid',pct:\.5,col:'#E8D9A8'\}/, 'decimals as the page writes them');
  assert.match(html, /\{id:'vitc',n:'Vitamin C Serum',[^}]*kind:'dropper',[^}]*sizes:\[\[15,26\],\[30,42\]\],when:'am'/);
  assert.match(html, /const SUB_OFF=10, FREE_SHIP=35, REFILL='6 weeks';/);
  assert.match(html, /Subscribe and save 10%, refills every 6 weeks/);
  assert.doesNotMatch(html, /--accent:#A9506A/i, 'the brand colour turned');
});

test('what the page could not show is sent back with the reason', () => {
  const errs = (f) => { const c = tide(); f(c); return validate(D, c).errors; };
  assert.ok(errs((c) => { c.shop.products[1].skins = ['Oily skin']; }).some((e) => /"Oily skin" is not one of routine\.skins/.test(e)));
  assert.ok(errs((c) => { c.shop.products[1].for = ['Wrinkles']; }).some((e) => /"Wrinkles" is not one of routine\.concerns/.test(e)));
  assert.ok(errs((c) => { c.shop.products.forEach((p) => { p.when = 'am'; }); }).some((e) => /no evening product/.test(e)));
  assert.ok(errs((c) => { c.ingredients.list[0].in = ['toner']; }).some((e) => /"toner" is not a product id/.test(e)));
  assert.ok(errs((c) => { c.shop.products[2].id = 'vitc'; }).some((e) => /two products with the same id/.test(e)));
  assert.ok(errs((c) => { c.actives.forEach((a) => { a.pct = 20; }); }).some((e) => /at most 40%/.test(e)));
  assert.ok(errs((c) => { c.theme.accent = '#F2C46B'; }).some((e) => /lightness|contrast/.test(e)));
});

test('the editor can add a product, an ingredient and a concern', () => {
  const editor = require('../lib/design-editor');
  const spec = JSON.parse(fs.readFileSync(path.join(D.dir, 'brief.json'), 'utf8'));
  for (const list of ['ingredients.list', 'routine.skins']) {
    const r = editor.apply(D, spec, tide(), { ops: [{ op: 'add', list }] });
    assert.deepEqual(validate(D, r.content).errors, [], list);
  }
});
