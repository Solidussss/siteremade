'use strict';
// THE LACQUER DESIGN (design-packages/design/lacquer): a nail studio's site whose hero does one nail, then shows the set.
// The nail (shape, length, shade, finish, art, skin), the menu, shades, opening hours, technicians and deposit go into
// the page scripts; the rules send back what the page could not show. No model calls.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { loadDesign, validate, build } = require('../design-packages/engine/engine');

const D = loadDesign(path.join(__dirname, '..', 'design-packages', 'design', 'lacquer'));
const gloss = () => JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'design-sites', 'glosstheory-nails.json'), 'utf8'));
const sample = () => JSON.parse(fs.readFileSync(path.join(D.dir, 'default.json'), 'utf8'));

test('the sample studio builds clean; a nail bar gets its own nail, menu, hours and a 12-hour clock', () => {
  assert.deepEqual(validate(D, sample()).errors, []);
  assert.deepEqual(build(D, sample()).guards, [], 'the sample needs no layout guard');
  const c = gloss(); assert.deepEqual(validate(D, c).errors, []);
  const html = build(D, c).html;
  assert.doesNotMatch(html, /Lacquer Room|Bath|960418/, 'nothing of the sample business');
  assert.match(html, /const NAIL=\{shape:'square',length:\.26,col:'#9B1B30',shade:'Cherry Glaze',finish:'chrome',art:'gems',artCol:'#F3E9FF',skin:'#7E5038'\};/);
  assert.match(html, /const OPEN=\[null,null,\['10:00','19:00'\],\['10:00','19:00'\],\['11:00','20:00'\],\['10:00','20:00'\],\['09:00','17:00'\]\];/);
  assert.match(html, /const H12=true;/);
  assert.match(html, /const DEPOSIT=20;/);
  assert.match(html, /\{n:'Structured gel',d:'Builder gel shaped for strength, with color\.',mins:75,p:65\}/);
  assert.match(html, /href="tel:5125550174"/);
});

test('what the page could not show is sent back with the reason', () => {
  const errs = (f) => { const c = gloss(); f(c); return validate(D, c).errors; };
  assert.ok(errs((c) => { c.nail.shape = 'pointy'; }).some((e) => /nail\.shape/.test(e)));
  assert.ok(errs((c) => { delete c.book.hours.mon; }).some((e) => /book\.hours\.mon/.test(e)));
  assert.ok(errs((c) => { for (const k of Object.keys(c.book.hours)) c.book.hours[k] = null; }).some((e) => /open at least one day/.test(e)));
  assert.ok(errs((c) => { c.book.hours.tue = { open: '19:00', close: '10:00' }; }).some((e) => /book\.hours\.tue/.test(e)));
  assert.ok(errs((c) => { c.shades.items = c.shades.items.slice(0, 3); }).some((e) => /shades\.items/.test(e)));
  assert.ok(errs((c) => { c.theme.accent = '#F4C7D8'; }).some((e) => /lightness|contrast/.test(e)));
});

test('the editor can add a treatment, a shade and a technician', () => {
  const editor = require('../lib/design-editor');
  const spec = JSON.parse(fs.readFileSync(path.join(D.dir, 'brief.json'), 'utf8'));
  for (const list of ['menu.tabs.0.items', 'shades.items', 'book.techs']) {
    const r = editor.apply(D, spec, gloss(), { ops: [{ op: 'add', list }] });
    assert.deepEqual(validate(D, r.content).errors, [], list);
  }
});
