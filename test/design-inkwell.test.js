'use strict';
// THE INKWELL DESIGN (design-packages/design/inkwell): a tattoo studio's site whose hero tattoos one piece on a forearm.
// The design, its inks, banner word and skin, the sitting's clock, the flash, sizes, places, artists, rates and aftercare
// go into the page scripts; the rules send back what the page could not show. No model calls.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { loadDesign, validate, build } = require('../design-packages/engine/engine');

const D = loadDesign(path.join(__dirname, '..', 'design-packages', 'design', 'inkwell'));
const lantern = () => JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'design-sites', 'blacklantern-tattoo.json'), 'utf8'));
const sample = () => JSON.parse(fs.readFileSync(path.join(D.dir, 'default.json'), 'utf8'));

test('the sample studio builds clean; a fine-line studio gets its own piece, flash, rates and a 12-hour clock', () => {
  assert.deepEqual(validate(D, sample()).errors, []);
  assert.deepEqual(build(D, sample()).guards, [], 'the sample needs no layout guard');
  const c = lantern(); assert.deepEqual(validate(D, c).errors, []);
  const html = build(D, c).html;
  assert.doesNotMatch(html, /Ink &amp; Iron|Leeds|0321/, 'nothing of the sample business');
  assert.match(html, /const PIECE=\{motif:'moth',fine:true,inks:\['#9E4A5A','#D9B26A','#5E7A6E'\],banner:'',skin:'#B47E57',caption:'Healed · 3 weeks'\};/);
  assert.match(html, /const START=\{h:13,m:0,h12:true\};/);
  assert.match(html, /id="gClock">1:00 pm</);
  assert.match(html, /\{n:'Sparrow',motif:'swallow',inks:\['#B5656B','#E3C27A','#4F6D8A'\],word:'',size:'2\.5 in',p:190,gone:true\}/);
  assert.match(html, /const RATE=\{hour:180,min:120,deposit:100,day:5\};/);
  assert.match(html, /href="tel:7185550143"/);
});

test('what the page could not show is sent back with the reason', () => {
  const errs = (f) => { const c = lantern(); f(c); return validate(D, c).errors; };
  assert.ok(errs((c) => { c.session.start = '25:00'; }).some((e) => /session\.start/.test(e)));
  assert.ok(errs((c) => { c.book.sizes[0].h = [3, 1]; }).some((e) => /low then high/.test(e)));
  assert.ok(errs((c) => { c.piece.motif = 'anchor'; }).some((e) => /piece\.motif/.test(e)));
  assert.ok(errs((c) => { c.flash.items = c.flash.items.slice(0, 3); }).some((e) => /flash\.items/.test(e)));
  assert.ok(errs((c) => { c.theme.accent = '#F4C7C0'; }).some((e) => /lightness|contrast/.test(e)));
});

test('the editor can add flash, a place and an aftercare step', () => {
  const editor = require('../lib/design-editor');
  const spec = JSON.parse(fs.readFileSync(path.join(D.dir, 'brief.json'), 'utf8'));
  for (const list of ['flash.items', 'book.places', 'care.steps']) {
    const r = editor.apply(D, spec, lantern(), { ops: [{ op: 'add', list }] });
    assert.deepEqual(validate(D, r.content).errors, [], list);
  }
});
