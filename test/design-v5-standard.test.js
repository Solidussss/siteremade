'use strict';
// The v5 page standard on every design (design-packages/engine/v5.js): lang, a meta description, a skip link,
// focus outlines, overflow-x:clip and still mode are added when a page is built, and every design's demo passes the
// same code checks as a bespoke page (lib/bespoke/validate.js, kind 'design'). Screenshots of still mode are checked
// by hand with a browser; here, only what can be read from the HTML.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const v5 = require('../design-packages/engine/v5');
const { check } = require('../lib/bespoke/validate');
const ds = require('../lib/design-sites');

test('inject adds lang, description, skip link, focus and still mode, once', () => {
  const page = '<!doctype html><html><head><title>x</title></head><body><nav>n</nav><section class="hero"><p>' + 'A long enough first paragraph that describes the business well. '.repeat(2) + '</p></section></body></html>';
  const out = v5.inject(page, {});
  assert.match(out, /<html lang="en">/);
  assert.match(out, /<meta name="description" content="A long enough first paragraph/);
  assert.match(out, /<body><a class="sr-skip" href="#sr-main">Skip to content<\/a>/);
  assert.match(out, /<section id="sr-main" class="hero">/);
  assert.match(out, /:focus-visible/);
  assert.match(out, /prefers-reduced-motion/);
  assert.equal((out.match(/sr-skip" href/g) || []).length, 1);
});

test('an existing id is reused as the skip target and a lang is kept', () => {
  const out = v5.inject('<!doctype html><html lang="fr"><head></head><body><main id="top">x</main></body></html>', {});
  assert.match(out, /<html lang="fr">/);
  assert.match(out, /href="#top">Skip to content/);
});

test('every design demo meets the v5 page standard', () => {
  const names = ds.designs().map((d) => d.design);
  assert.equal(names.length, 36);
  for (const n of names) {
    const html = ds.demoHtml(n);
    const facts = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'design-packages', 'design', n, 'default.json'), 'utf8'));
    const errors = check(html, { facts, kind: 'design' }).errors.filter((e) => !/fact sheet/.test(e));
    assert.deepEqual(errors, [], n);
    assert.match(html, /sr-pinned/, n);
  }
});
