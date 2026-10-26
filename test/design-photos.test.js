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
    assert.ok(!before.includes('class="hphoto"'), 'no photo: the drawn hero');
    const offered = editor.fields(D, {}, c).fields.filter((f) => f.kind === 'photo').map((f) => f.path);
    assert.deepEqual(offered.sort(), paths.slice().sort());
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
