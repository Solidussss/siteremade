'use strict';
// THE DRAPE DESIGN (design-packages/design/drape): a clothing boutique's site whose hero lays out an outfit on a linen
// table and boxes it. The outfit, the box, the till, the shop's pieces and sizes, words, hours and styling times go into
// the page scripts; the rules send back what the page could not show. No model calls.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { loadDesign, validate, build } = require('../design-packages/engine/engine');

const D = loadDesign(path.join(__dirname, '..', 'design-packages', 'design', 'drape'));
const mari = () => JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'design-sites', 'marigold-shop.json'), 'utf8'));
const sample = () => JSON.parse(fs.readFileSync(path.join(D.dir, 'default.json'), 'utf8'));

test('the sample shop builds clean; a womenswear shop gets its own outfit, pieces, sizes and hours', () => {
  assert.deepEqual(validate(D, sample()).errors, []);
  assert.deepEqual(build(D, sample()).guards, [], 'the sample needs no layout guard');
  const c = mari(); assert.deepEqual(validate(D, c).errors, []);
  const html = build(D, c).html;
  assert.doesNotMatch(html, /Finch &amp; Fold|Gardner Street/, 'nothing of the sample business');
  assert.match(html, /\{kind:'dress',col:'#C97B5A',pat:'check',n:'Gingham dress',p:168\}/);
  assert.match(html, /\{kind:'shoes',col:'#E8DCC8',pat:'plain',n:'Canvas sneakers',p:95\}/);
  assert.match(html, /const BOX=\{col:'#A3392B',mark:'M'\};/);
  assert.match(html, /sizes:\[\['0',1\],\['2',1\],\['4',0\],\['6',1\],\['8',1\],\['10',1\],\['12',0\]\]/);
  assert.match(html, /const FREE=150;/);
  assert.match(html, /const OPEN=\[\['11:00','18:00'\],null,\['11:00','19:00'\]/);
  assert.match(html, /colour:'Color'/);
});

test('what the page could not show is sent back with the reason', () => {
  const errs = (f) => { const c = mari(); f(c); return validate(D, c).errors; };
  assert.ok(errs((c) => { c.outfit.pieces[0].kind = 'trousers'; }).some((e) => /outfit\.pieces\.0\.kind/.test(e)));
  assert.ok(errs((c) => { c.outfit.pieces.pop(); }).some((e) => /outfit\.pieces/.test(e)));
  assert.ok(errs((c) => { c.shop.items[0].sizes.forEach((z) => { z.ok = false; }); }).some((e) => /at least one size in stock/.test(e)));
  assert.ok(errs((c) => { delete c.visit.hours.mon; }).some((e) => /visit\.hours\.mon/.test(e)));
  assert.ok(errs((c) => { c.visit.styleTimes = ['07:00']; }).some((e) => /inside the opening hours/.test(e)));
  assert.ok(errs((c) => { c.theme.accent = '#E8D9F2'; }).some((e) => /lightness|contrast/.test(e)));
});

test('the editor can add a piece to the shop', () => {
  const editor = require('../lib/design-editor');
  const spec = JSON.parse(fs.readFileSync(path.join(D.dir, 'brief.json'), 'utf8'));
  for (const list of ['shop.items']) {
    const r = editor.apply(D, spec, mari(), { ops: [{ op: 'add', list }] });
    assert.deepEqual(validate(D, r.content).errors, [], list);
  }
});
