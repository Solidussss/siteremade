'use strict';
// THE COMPASS DESIGN (design-packages/design/compass): a coach's site whose hero walks a programme across a map. The
// goals, sessions and weeks, programmes, questions and their scoring, call times and the coach's background go into
// the page scripts; the rules send back what the page could not show. No model calls.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { loadDesign, validate, build } = require('../design-packages/engine/engine');

const D = loadDesign(path.join(__dirname, '..', 'design-packages', 'design', 'compass'));
const clear = () => JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'design-sites', 'clearline-consulting.json'), 'utf8'));
const sample = () => JSON.parse(fs.readFileSync(path.join(D.dir, 'default.json'), 'utf8'));

test('the sample coach builds clean; a consultant gets their own route, services and questions', () => {
  assert.deepEqual(validate(D, sample()).errors, []);
  assert.deepEqual(build(D, sample()).guards, [], 'the sample needs no layout guard');
  const c = clear(); assert.deepEqual(validate(D, c).errors, []);
  const html = build(D, c).html;
  assert.doesNotMatch(html, /Northpoint|Hannah Okafor|0811/, 'nothing of the sample business');
  assert.match(html, /const ROUTEWORDS=\{start:'Today',goals:\['Fix cash flow','Hire a manager','Double revenue'\],sessions:12,weeks:26\};/);
  assert.match(html, /const LAND=\{land:'#EEEADD',route:'#283B6B',flag:'#D9A33A'\};/);
  assert.match(html, /\{q:'How big is your team\?',a:\[\['Under 5',\[2,1,0\]\],\['5 to 20',\[1,3,1\]\],\['Over 20',\[0,1,3\]\]\]\}/);
  assert.match(html, /const BADGE='Most chosen', BADGED=1;/);
  assert.match(html, /const INITIALS='MB';/);
  assert.match(html, /href="tel:2065550193"/);
});

test('what the page could not show is sent back with the reason', () => {
  const errs = (f) => { const c = clear(); f(c); return validate(D, c).errors; };
  assert.ok(errs((c) => { c.fit.qs[0].a[0].s = [1, 2]; }).some((e) => /one score for each programme/.test(e)));
  assert.ok(errs((c) => { c.programmes.badged = 3; }).some((e) => /programmes\.badged/.test(e)));
  assert.ok(errs((c) => { c.call.times[0] = '8:30am'; }).some((e) => /call\.times\.0/.test(e)));
  assert.ok(errs((c) => { c.route.goals = ['One', 'Two']; }).some((e) => /route\.goals/.test(e)));
  assert.ok(errs((c) => { c.theme.accent = '#DCE6F2'; }).some((e) => /lightness|contrast/.test(e)));
});

test('the editor can add a credential and an included item', () => {
  const editor = require('../lib/design-editor');
  const spec = JSON.parse(fs.readFileSync(path.join(D.dir, 'brief.json'), 'utf8'));
  for (const list of ['coach.creds', 'programmes.list.0.inc']) {
    const r = editor.apply(D, spec, clear(), { ops: [{ op: 'add', list }] });
    assert.deepEqual(validate(D, r.content).errors, [], list);
  }
});
