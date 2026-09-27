'use strict';
// The generator page is two classic scripts (index.html: icons-data.js, then
// script.js). If either fails to PARSE in a visitor's browser, the whole
// generator is dead -- no error UI, nothing. These checks keep that from
// shipping unnoticed.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const { browserScripts, findLookbehinds, compile } = require('./helpers/browser-scripts');
const { loadClient } = require('./helpers/load-client');

const scripts = browserScripts();

test('index.html loads the expected local scripts, and they exist', () => {
  assert.deepEqual(scripts.map(s => s.src), ['icons-data.js', 'script.js']);
  scripts.forEach(s => assert.ok(fs.existsSync(s.file), `${s.src} is missing`));
});

test('every browser script parses', () => {
  scripts.forEach(s => assert.doesNotThrow(() => compile(fs.readFileSync(s.file, 'utf8'), s.src), `${s.src} has a syntax error`));
});

test('no browser script uses regex lookbehind (a parse error on Safari/iOS before 16.4)', () => {
  scripts.forEach(s => {
    const hits = findLookbehinds(fs.readFileSync(s.file, 'utf8'));
    assert.deepEqual(hits, [], `${s.src} contains lookbehind syntax -- older Safari cannot load this file at all:\n` + hits.map(h => `  line ${h.line}: ${h.text}`).join('\n'));
  });
});

test('the check really catches it: a lookbehind literal is flagged, the replacement form is not', () => {
  assert.equal(findLookbehinds("const s = t.split(/(?<=[.!?])\\s+/);").length, 1);
  assert.equal(findLookbehinds("const s = t.split(/(?<![a-z])x/);").length, 1);
  assert.equal(findLookbehinds("const s = splitSentences(t); const r = /(?=x)(?:y)(?<name>z)/;").length, 0, 'lookahead / non-capturing / named groups are fine');
});

test('the scripts run to completion in page order and define the generator entry points', () => {
  const client = loadClient();
  ['runGeneration', 'renderProject', 'resolveImagePlanAssets', 'splitSentences'].forEach(fn => assert.equal(typeof client.ctx[fn], 'function', `${fn} is not defined`));
  assert.ok(client.ctx.SITEREMADE_ICON_DATA, 'icons-data.js ran before script.js');
});

test('splitSentences keeps the exact sentence boundaries the lookbehind split produced', () => {
  const split = t => JSON.parse(JSON.stringify(loadClient().ctx.splitSentences(t)));
  assert.deepEqual(split('Fern & Flint is a café.  Beans, pour-over bar and pastries.'), ['Fern & Flint is a café.', 'Beans, pour-over bar and pastries.']);
  assert.deepEqual(split('Is it good?! Yes.\nCakes.'), ['Is it good?!', 'Yes.', 'Cakes.']);
  assert.deepEqual(split('St. John\'s bakery'), ['St.', 'John\'s bakery'], 'same as before: abbreviations are not special-cased here');
  assert.deepEqual(split('No punctuation'), ['No punctuation']);
  assert.deepEqual(split(''), ['']);
  assert.deepEqual(split('Ends.  '), ['Ends.', '']);
});
