'use strict';
// THE PLAIT DESIGN (design-packages/design/plait): a software product's site whose hero untangles one week of work.
// The product's sources, lanes, cards, readouts, integrations, plans and questions go into the page scripts; the
// rules send back what the page could not show. No model calls.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { loadDesign, validate, build } = require('../design-packages/engine/engine');

const D = loadDesign(path.join(__dirname, '..', 'design-packages', 'design', 'plait'));
const ledgerly = () => JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'design-sites', 'ledgerly-saas.json'), 'utf8'));
const sample = () => JSON.parse(fs.readFileSync(path.join(D.dir, 'default.json'), 'utf8'));

test('the sample product builds clean; another product gets its own week, plans and integrations', () => {
  assert.deepEqual(validate(D, sample()).errors, []);
  const s = build(D, sample());
  assert.deepEqual(s.guards, [], 'the sample needs no layout guard');
  assert.match(s.html, /const SHIP=\[0,4,8\];/);
  const c = ledgerly(); assert.deepEqual(validate(D, c).errors, []);
  const html = build(D, c).html;
  assert.doesNotMatch(html, /Northwind|plait\.app|Untangled by Friday/, 'nothing of the sample product');
  assert.match(html, /<title>Ledgerly<\/title>/);
  assert.match(html, /const SOURCES=\[\n \{n:'Bank feeds',g:'\$'\},/);
  assert.match(html, /const LANES=\['To match','In review','Waiting on','Closed'\];/);
  assert.match(html, /const SHIP=\[0,3\];/, 'the cards marked ships move to the last lane');
  assert.match(html, /const READ=\{open:\[212,6\],tools:\[SOURCES\.length,1\],sw:\[84,12\],back:\[0,9\]\};/);
  assert.match(html, /const SAVE=\.4;/); assert.match(html, /const YEARLY_OFF=\.15;/);
  assert.match(html, /\{n:'Firm',for:'[^']+',price:39,max:0,feats:\[/);
  assert.match(html, /const HOST='ledgerly\.app\/';/);
  assert.match(html, /placeholder="harbor-pine"/, 'the address placeholder is the example team, as a slug');
  assert.doesNotMatch(html, /#6E56FF/i, 'the product colour turned to the brand\'s');
});

test('what the page could not show is sent back with the reason', () => {
  const errs = (f) => { const c = ledgerly(); f(c); return validate(D, c).errors; };
  assert.ok(errs((c) => { c.cards.push({ t: 'One more for today', s: 0, l: 0, who: 'RB' }, { t: 'And another one', s: 1, l: 0, who: 'RB' }); }).some((e) => /start in lane 0 .* at most 4/.test(e)));
  assert.ok(errs((c) => { c.cards.forEach((x) => { delete x.ships; }); }).some((e) => /0 cards ship during the week/.test(e)));
  assert.ok(errs((c) => { c.cards[8].ships = true; }).some((e) => /already in the last lane cannot ship/.test(e)));
  assert.ok(errs((c) => { c.demo.open = [5, 9]; }).some((e) => /more open items before than after/.test(e)));
  assert.ok(errs((c) => { c.integrations.items[0].k = 'Telepathy'; }).some((e) => /"Telepathy" is not one of integrations\.kinds/.test(e)));
  assert.ok(errs((c) => { c.start.preset = ['Notion']; }).some((e) => /"Notion" is not one of integrations\.items/.test(e)));
  assert.ok(errs((c) => { c.pricing.tiers[1].max = 50; }).some((e) => /the last plan has no seat limit/.test(e)));
  assert.ok(errs((c) => { c.hero.title = 'Bookkeeping without the chaos'; c.hero.titleEm = 'Month-end without overtime'; }).some((e) => /hero title takes \d lines on a desktop/.test(e)));
  assert.ok(errs((c) => { c.theme.accent = '#7FB8FF'; }).some((e) => /contrast, button text on the accent/.test(e)));
});

test('the editor can add a card, an integration and a plan', () => {
  const editor = require('../lib/design-editor');
  const spec = JSON.parse(fs.readFileSync(path.join(D.dir, 'brief.json'), 'utf8'));
  for (const list of ['integrations.items', 'faq.items', 'cards']) {
    const r = editor.apply(D, spec, ledgerly(), { ops: [{ op: 'add', list, index: list === 'cards' ? 5 : undefined }] });
    assert.deepEqual(validate(D, r.content).errors, [], list);
  }
});
