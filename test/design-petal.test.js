'use strict';
// THE PETAL DESIGN (design-packages/design/petal): a florist's site whose hero builds one bouquet stem by stem. The
// stems in each slot, the wrap and card, sizes, palettes, seasons and delivery zones go into the page scripts; the rules
// send back what the page could not show. No model calls.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { loadDesign, validate, build } = require('../design-packages/engine/engine');

const D = loadDesign(path.join(__dirname, '..', 'design-packages', 'design', 'petal'));
const field = () => JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'design-sites', 'fieldnote-flowers.json'), 'utf8'));
const sample = () => JSON.parse(fs.readFileSync(path.join(D.dir, 'default.json'), 'utf8'));

test('the sample florist builds clean; a farm florist gets its own stems, sizes and ZIP delivery', () => {
  assert.deepEqual(validate(D, sample()).errors, []);
  assert.deepEqual(build(D, sample()).guards, [], 'the sample needs no layout guard');
  const c = field(); assert.deepEqual(validate(D, c).errors, []);
  const html = build(D, c).html;
  assert.doesNotMatch(html, /Petal &amp; Stem|Hackney|0574/, 'nothing of the sample business');
  assert.match(html, /\{kind:'dahlia',col:'#E8A25C',st:1,a:\.22,d:\.78,r:\.3,name:'Café au lait'\}/);
  assert.match(html, /const WRAP=\{paper:'#E9DFCB',ribbon:'#8A6A3E',card:'Happy birthday, Jo'\};/);
  assert.match(html, /\{codes:\['97202','97214','97215','97232'\],fee:12,cut:'11:00'\}/);
  assert.match(html, /return fail\('Add a zip code we deliver to\.'/);
  assert.match(html, /aria-label="ZIP code"/);
  assert.match(html, /href="tel:5035550166"/);
});

test('what the page could not show is sent back with the reason', () => {
  const errs = (f) => { const c = field(); f(c); return validate(D, c).errors; };
  assert.ok(errs((c) => { c.bouquet.stems[0].kind = 'peony'; }).some((e) => /slot 0 holds a green/.test(e)));
  assert.ok(errs((c) => { c.bouquet.stems.pop(); }).some((e) => /bouquet\.stems/.test(e)));
  assert.ok(errs((c) => { c.build.palettes[0].kinds.pop(); }).some((e) => /one flower kind for each colour/.test(e)));
  assert.ok(errs((c) => { c.deliver.zones[0].codes[0] = 'ABC1'; }).some((e) => /the start of a postcode/.test(e)));
  assert.ok(errs((c) => { c.deliver.zones[0].cut = 'noon'; }).some((e) => /a time like 12:00|cut/.test(e)));
  assert.ok(errs((c) => { c.theme.accent = '#F0D9C2'; }).some((e) => /lightness|contrast/.test(e)));
});

test('the editor can add a palette, an extra and a zone', () => {
  const editor = require('../lib/design-editor');
  const spec = JSON.parse(fs.readFileSync(path.join(D.dir, 'brief.json'), 'utf8'));
  for (const list of ['build.palettes', 'build.extras', 'deliver.zones']) {
    const r = editor.apply(D, spec, field(), { ops: [{ op: 'add', list }] });
    assert.deepEqual(validate(D, r.content).errors, [], list);
  }
});
