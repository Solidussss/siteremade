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

// THE PHOTO HERO (design-packages/engine/photo-hero.js): every design with "photoHero" in design.json takes up to four
// photos as the chapters of its scroll hero. Without a main photo the page is byte-for-byte what it was.
const photoHero = require('../design-packages/engine/photo-hero');
const withHero = fs.readdirSync(DIR).filter((d) => { try { return !!JSON.parse(fs.readFileSync(path.join(DIR, d, 'design.json'), 'utf8')).photoHero; } catch (e) { return false; } });

test('the common designs have the photo hero', () => {
  for (const d of ['larder', 'ochre', 'ventricle', 'brisk', 'verge', 'camber']) assert.ok(withHero.includes(d), d);
  assert.ok(!withHero.includes('steadyhand') && !withHero.includes('saltglass'), 'those two have their own photo modes');
});

test('the camera plan: focus, direction and zoom per photo, with safe defaults', () => {
  const s = photoHero.shots({ photos: { main: 'M', before: 'B', third: 'T', camera: '20 30 -1 1.4; bad; 120 50 1 9' } });
  assert.deepEqual(s.map((x) => x.src), ['B', 'T', 'M'], 'before, second, third, main');
  assert.deepEqual(s[0], { src: 'B', mask: null, fx: 20, fy: 30, dir: -1, zoom: 1.4 });
  assert.deepEqual(s[1], { src: 'T', mask: null, fx: 50, fy: 45, dir: -1, zoom: 1.24 }, 'unreadable: the defaults');
  assert.equal(s[2].fx, 50, 'out of range: the default'); assert.equal(s[2].zoom, 1.24);
  assert.deepEqual(photoHero.shots({ photos: { before: 'B' } }), [], 'no main photo, no photo hero');
});

for (const design of withHero) {
  test(`${design}: the photo hero is offered first, builds valid, and leaves the page alone without photos`, () => {
    const { D, c } = load(design);
    const before = build(D, c).html;
    assert.ok(!before.includes('srph-cfg'));
    const f = editor.fields(D, {}, c).fields;
    assert.deepEqual(f.slice(0, 4).map((x) => x.path), ['photos.main', 'photos.before', 'photos.second', 'photos.third']);
    assert.ok(!f.some((x) => x.path === 'photos.camera'), 'the camera plan is not a field the owner types');
    const { content } = editor.apply(D, {}, c, { changes: [{ path: 'photos.main', value: PHOTO }, { path: 'photos.before', value: PHOTO }] });
    assert.deepEqual(validate(D, content).errors, []);
    const html = build(D, content).html;
    assert.equal((html.match(/class="srph-shot"/g) || []).length, 2);
    assert.ok(html.indexOf('srph-cfg') < html.lastIndexOf('</body>'));
    const back = editor.apply(D, {}, content, { changes: [{ path: 'photos.main', value: '' }, { path: 'photos.before', value: '' }] }).content;
    assert.equal(back.photos, undefined, 'cleared: the group goes too');
    assert.equal(build(D, back).html, before);
  });
}

test('photo hero: a link with a quote or a script-looking camera plan cannot break out of the page', () => {
  const { D, c } = load('larder');
  assert.throws(() => editor.apply(D, {}, c, { changes: [{ path: 'photos.main', value: 'https://x.com/a"onerror=alert(1).jpg' }] }));
  const html = build(D, { ...c, photos: { main: PHOTO, camera: '</script><script>alert(1)</script>' } }).html;
  assert.ok(!html.includes('<script>alert(1)'));
});

// THE SUBJECT (lib/photo-analyse.js): a photo's subject as a soft mask, so the hero can light and focus it
test('photo analysis: a subject is found, a scene is left alone, and the mask reaches the page', async () => {
  const jpeg = require('jpeg-js');
  const { analyse } = require('../lib/photo-analyse');
  // a plain grey frame with a bright red block in the middle: a subject; flat grey: no subject
  const W = 160, H = 120, px = Buffer.alloc(W * H * 4), flat = Buffer.alloc(W * H * 4, 128);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = (y * W + x) * 4, inside = x > 50 && x < 110 && y > 30 && y < 90; px[i] = inside ? 220 : 120; px[i + 1] = inside ? 30 : 125; px[i + 2] = inside ? 40 : 130; px[i + 3] = 255; }
  const block = await analyse(Buffer.from(jpeg.encode({ width: W, height: H, data: px }, 90).data));
  assert.equal(block.kind, 'subject'); assert.ok(Math.abs(block.cx - 50) < 12 && Math.abs(block.cy - 50) < 12, `centre ${block.cx},${block.cy}`);
  assert.match(block.mask, /^data:image\/jpeg;base64,/); assert.ok(isPhoto(block.mask), 'the mask is a photo field value');
  assert.equal(await analyse('data:image/png;base64,iVBORw0KGgo='), null, 'only JPEGs are read');
  const { D, c } = load('beadline');
  const html = build(D, { ...c, photos: { main: PHOTO, mainMask: block.mask } }).html;
  assert.ok(html.includes('data-mask="data:image/jpeg'), 'the page has the mask'); assert.ok(html.includes('"motion":"gloss"'));
  assert.ok(!editor.fields(D, {}, c).fields.some((f) => /Mask$/.test(f.path)), 'masks are not fields the owner sees');
});
