'use strict';
// THE KEEL & RIDGE DESIGN (design-packages/design/keel): a roofer's site whose hero runs a full re-roof on scroll.
// The roofer's stages, materials (by kind, with their colour tones), prices, damage-check signs, towns and booking
// windows go into the page script; the rules send back what the page could not show. No model calls.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { loadDesign, validate, build } = require('../design-packages/engine/engine');

const D = loadDesign(path.join(__dirname, '..', 'design-packages', 'design', 'keel'));
const summit = () => JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'design-sites', 'summitline-roofing.json'), 'utf8'));
const sample = () => JSON.parse(fs.readFileSync(path.join(D.dir, 'default.json'), 'utf8'));

test('the sample roofer builds clean; another roofer gets its own job, materials and map', () => {
  assert.deepEqual(validate(D, sample()).errors, []);
  const s = build(D, sample());
  assert.deepEqual(s.guards, [], 'the sample needs no layout guard');
  assert.match(s.html, /const TEAR=\[95,115\];/);
  const c = summit(); assert.deepEqual(validate(D, c).errors, []);
  const html = build(D, c).html;
  assert.doesNotMatch(html, /Keel|Portland|Falmouth|Forest Ave|KR-2611/, 'nothing of the sample roofer');
  assert.match(html, /<title>Summit Line Roofing<\/title>/);
  assert.match(html, /const MATERIALS=window\.KR_MATERIALS=\[\n \{id:'metal',name:'Standing-seam steel',short:'Metal',blurb:/, 'metal first, with no lay line of its own');
  assert.match(html, /per:1\.65,fasten:'Clips',perSq:48,lbSq:110,/, 'the per-kind constants come from the kind');
  assert.match(html, /\{id:'asphalt',name:'Impact-rated shingles',short:'Shingles',lay:'Class 4 shingles/);
  assert.match(html, /const SQUARES=32;/); assert.match(html, /const BRAND='SUMMIT LINE';/);
  assert.match(html, /\{id:'hail',label:'Dents on the vents or car',hint:'[^']+',w:2,check:/, 'the design keeps the scoring');
  assert.match(html, /const COAST='';/, 'inland: no water drawn'); assert.match(html, /HOME\.x=200;HOME\.y=150;/);
  assert.match(html, /\{n:'Castle Rock',m:45,dir:'S'\}\n\];/);
  assert.match(html, /const SLOTS=\['7–9 AM','9–11 AM','1–3 PM'\];\nconst SAT=2;/);
  assert.match(html, /<a class="call" href="tel:\+13035550172">\(303\) 555-0172<\/a>/);
  assert.match(html, /<dt>Clips<\/dt><dd id="rNails">0<\/dd><\/div>\n      <div><dt>Panels left<\/dt><dd id="rBundles">53<\/dd>/, '32 squares of panels');
  assert.doesNotMatch(html, /#F26A1B/i, 'the hi-vis orange turned to the roofer\'s colour');
});

test('what the page could not show is sent back with the reason', () => {
  const errs = (f) => { const c = summit(); f(c); return validate(D, c).errors; };
  assert.ok(errs((c) => { c.materials[0].colours[0].c = ['#333333', '#444444', '#555555', '#666666']; }).some((e) => /metal colours take 1 tone \(4 given\)/.test(e)));
  assert.ok(errs((c) => { c.materials[1].colours[0].c = ['#5a5d61']; }).some((e) => /asphalt colours take 4 tones \(1 given\)/.test(e)));
  assert.ok(errs((c) => { c.materials[0].price = [1350, 1050]; }).some((e) => /materials\.0\.price: low, then high/.test(e)));
  assert.ok(errs((c) => { c.book.towns[0].m = 10; }).some((e) => /book\.towns\.0: the yard's own town/.test(e)));
  assert.ok(errs((c) => { delete c.book.towns[3].dir; }).some((e) => /book\.towns\.3\.dir: the compass direction/.test(e)));
  assert.ok(errs((c) => { c.book.townExample = 'Boston'; }).some((e) => /book\.townExample: one of the towns/.test(e)));
  assert.ok(errs((c) => { c.book.saturday = 4; }).some((e) => /more Saturday windows than weekday windows/.test(e)));
  assert.ok(errs((c) => { c.check.symptoms[1].id = 'missing'; }).some((e) => /each of the eight signs exactly once/.test(e)));
  assert.ok(errs((c) => { c.hero.title = 'Built for hail, wind and snow.'; c.hero.titleEm = 'Rated for the next hailstorm season too.'; }).some((e) => /hero title takes \d lines on a desktop/.test(e)));
  assert.ok(errs((c) => { c.brand.name = 'Summit Line Roofers'; }).some((e) => /phone nav row needs/.test(e)));
  assert.ok(errs((c) => { c.theme.accent = '#F2B705'; }).some((e) => /contrast, small accent text on the paper/.test(e)));
  assert.ok(errs((c) => { c.job.ref = 'sl4107'; }).some((e) => /job\.ref: capitals, a dash and digits/.test(e)));
});

test('the editor can add a town, a booking window and a second line of a material', () => {
  const editor = require('../lib/design-editor');
  const spec = JSON.parse(fs.readFileSync(path.join(D.dir, 'brief.json'), 'utf8'));
  for (const list of ['book.towns', 'book.slots', 'materials']) {
    const r = editor.apply(D, spec, summit(), { ops: [{ op: 'add', list }] });
    assert.deepEqual(validate(D, r.content).errors, [], list);
  }
});
