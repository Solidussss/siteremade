'use strict';
// THE NORTHLIGHT DESIGN (design-packages/design/northlight): a photographer's site whose hero lights one frame in the
// studio, light by light. The shot (subject, grade, settings), sessions and packages, the timeline and the diary go
// into the page scripts; the rules send back what the page could not show. No model calls.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { loadDesign, validate, build } = require('../design-packages/engine/engine');

const D = loadDesign(path.join(__dirname, '..', 'design-packages', 'design', 'northlight'));
const sable = () => JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'design-sites', 'sable-silver.json'), 'utf8'));
const sample = () => JSON.parse(fs.readFileSync(path.join(D.dir, 'default.json'), 'utf8'));

test('the sample photographer builds clean; a black-and-white wedding photographer gets their grade, collections and diary', () => {
  assert.deepEqual(validate(D, sample()).errors, []);
  assert.deepEqual(build(D, sample()).guards, [], 'the sample needs no layout guard');
  const c = sable(); assert.deepEqual(validate(D, c).errors, []);
  const html = build(D, c).html;
  assert.doesNotMatch(html, /Northlight|Edinburgh|0131/, 'nothing of the sample business');
  assert.match(html, /const LOOK='mono';/);
  assert.match(html, /const SHOT=\{aperture:'f\/2',shutter:'1\/250',iso:'ISO 200',ratio:'4:1',frames:1840,keep:600\};/);
  assert.match(html, /\{n:'The weekend',p:8900,from:true,time:'2 days',photos:'1,100'/);
  assert.match(html, /const LEAD=60;/);
  assert.match(html, /const CLOSED=\[1,2\];/);
  assert.match(html, /<h2 id="sessions-h">Three ways <em>to remember it\.<\/em><\/h2>/);
  assert.match(html, /href="tel:2125550187"/);
});

test('what the page could not show is sent back with the reason', () => {
  const errs = (f) => { const c = sable(); f(c); return validate(D, c).errors; };
  assert.ok(errs((c) => { c.shot.subject = 'landscape'; }).some((e) => /shot\.subject/.test(e)));
  assert.ok(errs((c) => { c.shot.ratio = 'three to one'; }).some((e) => /shot\.ratio/.test(e)));
  assert.ok(errs((c) => { c.shot.keep = 5000; }).some((e) => /no more keepers than frames/.test(e)));
  assert.ok(errs((c) => { c.sessions.start = { kind: 1, tier: 2 }; }).some((e) => /sessions\.start\.tier/.test(e)));
  assert.ok(errs((c) => { c.book.closed = [8]; }).some((e) => /book\.closed/.test(e)));
  assert.ok(errs((c) => { c.theme.accent = '#F2C4C0'; }).some((e) => /lightness|contrast/.test(e)));
});

test('the editor can add a kind of session and a step', () => {
  const editor = require('../lib/design-editor');
  const spec = JSON.parse(fs.readFileSync(path.join(D.dir, 'brief.json'), 'utf8'));
  for (const list of ['sessions.kinds', 'process.steps']) {
    const r = editor.apply(D, spec, sable(), { ops: [{ op: 'add', list }] });
    assert.deepEqual(validate(D, r.content).errors, [], list);
  }
});
