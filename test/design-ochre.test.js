'use strict';
// THE OCHRE & ASH DESIGN (design-packages/design/ochre): a hair salon's site whose hero runs a colour appointment on a
// head of hair, strand by strand. The salon's services and levels, looks, team, hours and the example client's colour
// go into the page scripts; the rules send back what the page could not show. No model calls.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { loadDesign, validate, build } = require('../design-packages/engine/engine');

const D = loadDesign(path.join(__dirname, '..', 'design-packages', 'design', 'ochre'));
const halo = () => JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'design-sites', 'halohue-salon.json'), 'utf8'));
const sample = () => JSON.parse(fs.readFileSync(path.join(D.dir, 'default.json'), 'utf8'));

test('the sample salon builds clean; another salon gets its own menu, levels, team and hours', () => {
  assert.deepEqual(validate(D, sample()).errors, []);
  assert.deepEqual(build(D, sample()).guards, [], 'the sample needs no layout guard');
  const c = halo(); assert.deepEqual(validate(D, c).errors, []);
  const html = build(D, c).html;
  assert.doesNotMatch(html, /Ochre|Brighton|Rosa Delgado|9\.13 beige/, 'nothing of the sample salon');
  assert.match(html, /const TIERS=\['Stylist','Master'\];/);
  assert.match(html, /\{id:'foilayage',n:'Foilayage',d:'[^']+',min:210,p:\[240,300\]\}/);
  assert.match(html, /const NATURAL=6;/); assert.match(html, /const TARGET=9;/);
  assert.match(html, /const TONER=\{name:'10NV pearl',hex:'#E6DCC8'\};/);
  assert.match(html, /const HOURS=\[null,null,\[10,19\],\[10,19\],\[10,20\],\[9,18\],\[9,16\]\];/);
  assert.match(html, /const FIRST='foilayage';/); assert.match(html, /const CUR='\$';/);
  assert.match(html, /href="tel:5125550193"/);
  assert.doesNotMatch(html, /#B24A2E/i, 'the salon colour turned to the brand\'s');
});

test('what the page could not show is sent back with the reason', () => {
  const errs = (f) => { const c = halo(); f(c); return validate(D, c).errors; };
  assert.ok(errs((c) => { c.menu.groups[0].items[0].p = [65]; }).some((e) => /one price per stylist level \(2\)/.test(e)));
  assert.ok(errs((c) => { c.shade.looks[0].svc = 'perm'; }).some((e) => /"perm" is not a menu id/.test(e)));
  assert.ok(errs((c) => { c.book.first = 'perm'; }).some((e) => /book\.first: "perm" is not a menu id/.test(e)));
  assert.ok(errs((c) => { c.menu.groups[1].items[0].id = 'gloss'; }).some((e) => /two services with the same id/.test(e)));
  assert.ok(errs((c) => { c.client.target = 5; }).some((e) => /client\.target: lighter than the natural level/.test(e)));
  assert.ok(errs((c) => { c.team.people[0].lv = 2; }).some((e) => /only 2 stylist levels/.test(e)));
  assert.ok(errs((c) => { c.book.hours.tue = { open: '10:15', close: '19:00' }; }).some((e) => /on the hour or half hour/.test(e)));
  assert.ok(errs((c) => { c.menu.groups[0].items[0].min = 50; }).some((e) => /in quarter hours/.test(e)));
  assert.ok(errs((c) => { c.theme.accent = '#E8A0C0'; }).some((e) => /lightness|contrast/.test(e)));
});

test('the editor can add a service, a look and a colourist', () => {
  const editor = require('../lib/design-editor');
  const spec = JSON.parse(fs.readFileSync(path.join(D.dir, 'brief.json'), 'utf8'));
  for (const list of ['shade.looks', 'team.people']) {
    const r = editor.apply(D, spec, halo(), { ops: [{ op: 'add', list }] });
    assert.deepEqual(validate(D, r.content).errors, [], list);
  }
});
