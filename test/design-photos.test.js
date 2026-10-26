'use strict';
// PHOTOS IN DESIGNS (engine 'photo' fields, lib/design-editor.js): the barber and dentist designs take the business's own
// photo in place of the drawn hero. A photo is a JPEG/PNG/WebP data URL (the editor shrinks it first) or an https link;
// anything else is refused, and without one the design's drawing shows exactly as before.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { loadDesign, validate, build, isPhoto } = require('../design-packages/engine/engine');
const editor = require('../lib/design-editor');

const DIR = path.join(__dirname, '..', 'design-packages', 'design');
const PHOTO = 'data:image/jpeg;base64,' + Buffer.from('a small stand-in for a real photo').toString('base64');
const load = (d) => ({ D: loadDesign(path.join(DIR, d)), c: JSON.parse(fs.readFileSync(path.join(DIR, d, 'default.json'), 'utf8')) });

test('a photo is a JPEG/PNG/WebP data URL or an https link, nothing else', () => {
  assert.equal(isPhoto(PHOTO), true);
  assert.equal(isPhoto('https://cdn.example.com/shop.jpg'), true);
  for (const bad of ['javascript:alert(1)', 'http://x.com/a.jpg', 'https://x.com/a".jpg', 'https://x.com/a).jpg', 'data:image/svg+xml;base64,PHN2Zz4=', 'data:image/jpeg;base64,ab"c', 'data:image/jpeg;base64,' + 'A'.repeat(1024 * 1024)]) assert.equal(isPhoto(bad), false, bad);
});

for (const [design, paths, hero] of [['steadyhand', ['hero.photo', 'cut.photo'], 'id="hero" class="photo"'], ['saltglass', ['hero.photo'], 'class="hero photo"']]) {
  test(`${design}: the editor offers the photo, the page shows it, and without it the drawing is unchanged`, () => {
    const { D, c } = load(design);
    const before = build(D, c).html;
    assert.ok(!before.includes('class="shot"'), 'no photo: the drawn hero');
    const offered = editor.fields(D, {}, c).fields.filter((f) => f.kind === 'photo').map((f) => f.path);
    assert.deepEqual(offered.sort(), [...paths, 'hero.before', 'hero.photo2', 'hero.photo3'].sort());
    const { content } = editor.apply(D, {}, c, { changes: paths.map((p) => ({ path: p, value: PHOTO })) });
    assert.deepEqual(validate(D, content).errors, []);
    const html = build(D, content).html;
    assert.ok(html.includes(hero), 'photo mode on the hero');
    assert.ok(html.includes(`src="${PHOTO}"`), 'the photo itself');
    assert.throws(() => editor.apply(D, {}, c, { changes: [{ path: paths[0], value: 'javascript:alert(1)' }] }), (e) => /JPEG, PNG or WebP/.test(e.errors.join(' ')));
    // cleared: back to the drawing
    const back = editor.apply(D, {}, content, { changes: paths.map((p) => ({ path: p, value: '' })) }).content;
    assert.equal(build(D, back).html, before);
  });
}

test('up to four photos are the chapters of the scroll scene, in order, and the design keeps its steps', () => {
  const ph = (t) => 'data:image/jpeg;base64,' + Buffer.from(t).toString('base64');
  for (const [design, step] of [['steadyhand', 'id="hudS"'], ['saltglass', 'id="hudCode"']]) {
    const { D, c } = load(design);
    const { content } = editor.apply(D, {}, c, { changes: [['hero.photo', 'last'], ['hero.before', 'first'], ['hero.photo2', 'second'], ['hero.photo3', 'third']].map(([path, t]) => ({ path, value: ph(t) })) });
    assert.deepEqual(validate(D, content).errors, []);
    const html = build(D, content).html;
    const order = ['first', 'second', 'third', 'last'].map((t) => html.indexOf(ph(t)));
    assert.ok(order.every((x, i) => x > 0 && (i === 0 || x > order[i - 1])), `${design}: before, middle, middle, main`);
    assert.equal((html.match(/class="shot"/g) || []).length, 4);
    assert.ok(html.includes(step), `${design}: the steps are still on the page`);
    assert.ok(!/hzoom|animation:\s*hzoom/.test(html), `${design}: no timed zoom, the motion follows the scroll`);
  }
  const { D, c } = load('saltglass');
  assert.ok(build(D, c).html.includes('Illustration. Shades'), 'the drawn teeth still say they are an illustration');
  const real = editor.apply(D, {}, c, { changes: [{ path: 'hero.photo', value: PHOTO }, { path: 'hero.before', value: PHOTO }] }).content;
  assert.ok(!build(D, real).html.includes('Illustration. Shades'), 'real photos do not');
});
