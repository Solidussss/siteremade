'use strict';
// BESPOKE (v5): the code checks on a page, the photo preparation filter, and the whole run with a scripted AI (never
// the paid one) and no browser.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { check, claims, fontsOf } = require('../lib/bespoke/validate');
const { filter, prepare } = require('../lib/bespoke/media');
const { run, jsonIn, htmlIn } = require('../lib/bespoke/pipeline');
const { probeHtml } = require('../lib/bespoke/qa');

const FACTS = { name: 'Test Bakery', address: '1 Main St SW, Calgary', hours: 'Wed to Sun 8am to 4pm', menu: [{ item: 'Croissant combo', price: '$9.99' }] };
const GOOD = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Test Bakery · Croissants in Calgary</title>
<meta name="description" content="Test Bakery bakes croissants at 1 Main St SW, Calgary.">
<meta name="robots" content="noindex">
<link href="https://fonts.googleapis.com/css2?family=League+Gothic&family=Gabarito:wght@500&display=swap" rel="stylesheet">
<style>html,body{background:#FAEBD3}:root{--disp:"League Gothic"}html{overflow-x:clip}body{overflow-x:clip}a:focus-visible{outline:3px solid}
.js .rv{opacity:0}@media (prefers-reduced-motion:reduce){.js .rv{opacity:1}}</style></head>
<body><a class="skip" href="#main">Skip to content</a><main id="main"><h1>Croissants, every morning.</h1>
<p>Open Wed to Sun, 8am to 4pm. The croissant combo is $9.99.</p>
<img src="media/choc.jpg" alt="Chocolate croissants">
<a href="https://www.google.com/maps/search/?api=1&amp;query=1+Main+St+SW+Calgary">Get directions</a></main>
<script src="https://cdn.jsdelivr.net/npm/gsap@3.12.5/dist/gsap.min.js"></script>
<script>const still=/[?&]still\\b/.test(location.search);if(!still)document.documentElement.classList.add('js');
setTimeout(()=>document.querySelectorAll('.rv').forEach(e=>e.style.opacity=1),3500);</script></body></html>`;

test('a page that follows the rules passes the code checks', () => {
  const r = check(GOOD, { facts: FACTS, usedFonts: ['Lilita One'], media: ['choc.jpg'] });
  assert.deepEqual(r.errors, []);
  assert.equal(r.fonts.display, 'League Gothic');
});

test('the checks catch what the rules forbid', () => {
  const bad = GOOD.replace('<meta name="robots" content="noindex">', '')
    .replace('$9.99', '$12.50')
    .replace('media/choc.jpg', 'https://images.example.com/stock.jpg')
    .replace('family=League+Gothic', 'family=Poppins')
    .replace('every morning', 'a seamless experience');
  const e = check(bad, { facts: FACTS, usedFonts: [] }).errors.join('\n');
  assert.match(e, /noindex/);
  assert.match(e, /\$12\.50.*not in the fact sheet/);
  assert.match(e, /Not allowed to load https:\/\/images\.example\.com/);
  assert.match(e, /Poppins is not allowed/);
  assert.match(e, /seamless/);
});

test('a display font another site already uses is refused', () => {
  const e = check(GOOD, { facts: FACTS, usedFonts: ['League Gothic'] }).errors.join('\n');
  assert.match(e, /League Gothic is already used/);
});

test('still mode, the fail safe and the skip link are required', () => {
  const e = check(GOOD.replace(/\[\?&\]still/, 'x').replace("classList.add('js')", "classList.add('ready')").replace('href="#main"', 'href="#top"'), { facts: FACTS }).errors.join('\n');
  assert.match(e, /still mode/);
  assert.match(e, /Fail safe/);
  assert.match(e, /skip link/);
});

test('claims finds prices, phones, times and percentages', () => {
  const c = claims('Call (403) 555-0199, open 11am to 6pm, $8.99 or 10% off').map((x) => x.kind);
  assert.deepEqual(c.sort(), ['percent', 'phone', 'price', 'time', 'time']);
  assert.deepEqual(fontsOf('<link href="https://fonts.googleapis.com/css2?family=Rozha+One&family=Mulish:wght@400">').all, ['Rozha One', 'Mulish']);
});

test('photo crops are fractions of the photo, then capped at 1600px wide', () => {
  assert.equal(filter({ x: 0, y: 0.25, w: 1, h: 0.5 }), "crop=trunc(iw*1.0000/2)*2:trunc(ih*0.5000/2)*2:trunc(iw*0.0000):trunc(ih*0.2500),scale='min(1600,iw)':-2");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bespoke-'));
  fs.writeFileSync(path.join(dir, 'a.jpg'), 'x');
  const calls = [];
  const res = prepare([{ file: 'a.jpg', out: 'room.jpg' }, { file: '../etc/passwd', out: 'x.jpg' }], { inDir: dir, outDir: dir, run: (...a) => calls.push(a) });
  assert.equal(res[0].ok, true); assert.equal(res[1].ok, false); assert.equal(calls.length, 1);
});

test('the overflow probe reports into the title', () => {
  assert.match(probeHtml('<html><body>x</body></html>'), /OVERFLOW:/);
});

test('a full run with a scripted AI: spec, media, build, a fix after the code checks', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bespoke-run-'));
  fs.mkdirSync(path.join(dir, 'photos')); fs.writeFileSync(path.join(dir, 'photos', 'choc.jpg'), Buffer.from([0xff, 0xd8, 0xff, 0xd9]));
  const spec = { intake: { primaryAction: 'Get directions' }, photos: [{ file: 'choc.jpg', use: true, out: 'choc.jpg', alt: 'Chocolate croissants' }],
    direction: { signature: 'Dip, bite, repeat', displayFont: 'League Gothic', bodyFont: 'Gabarito', colours: { cream: '#FAEBD3' } }, sections: ['hero'], spec_md: '# Test Bakery' };
  const answers = ['```json\n' + JSON.stringify(spec) + '\n```', '```html\n' + GOOD.replace('$9.99', '$11.00') + '\n```', '```html\n' + GOOD + '\n```'];
  const sent = [];
  const ai = { usage: { calls: 0 }, start(s) { sent.push({ system: s }); }, async say(c) { sent.push(c); this.usage.calls++; return answers.shift(); } };
  const res = await run({ facts: FACTS, photosDir: path.join(dir, 'photos'), photos: ['choc.jpg'], outDir: path.join(dir, 'v5'), usedFonts: ['Lilita One'] }, { ai });
  assert.equal(res.ok, true);
  assert.equal(ai.usage.calls, 3);
  assert.match(JSON.stringify(sent[3]), /\$11\.00/); // the invented price went back to the AI
  assert.equal(fs.readFileSync(path.join(dir, 'v5', 'index.html'), 'utf8'), GOOD);
  assert.equal(fs.readFileSync(path.join(dir, 'v5', 'SPEC.md'), 'utf8'), '# Test Bakery');
  assert.match(sent[0].system, /signature interaction/);
});

test('answers are read from fenced blocks', () => {
  assert.deepEqual(jsonIn('ok\n```json\n{"done":true}\n```'), { done: true });
  assert.equal(htmlIn('fixes\n```html\n<!doctype html><p>x</p>\n```'), '<!doctype html><p>x</p>');
});

test('a hero video made from their own photo is prepared and handed to the build', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bespoke-vid-'));
  const spec = { intake: {}, photos: [], direction: { displayFont: 'League Gothic' }, spec_md: '#' };
  const answers = ['```json\n' + JSON.stringify(spec) + '\n```', '```html\n' + GOOD.replace('media/choc.jpg', 'media/hero-last.jpg') + '\n```'];
  const sent = [];
  const ai = { usage: { calls: 0 }, start() {}, async say(c) { sent.push(c); return answers.shift(); } };
  const prepareVideo = async () => ({ video: 'hero.mp4', poster: 'hero-poster.jpg', last: 'hero-last.jpg', frames: { pattern: 'media/hero/{n}.jpg', count: 120, w: 1280, h: 720, seconds: 15 } });
  const res = await run({ facts: FACTS, photosDir: dir, photos: [], outDir: path.join(dir, 'v5'), video: '/x/hero.mp4' }, { ai, prepareVideo });
  assert.equal(res.ok, true, JSON.stringify(res.report.issues));
  assert.match(String(sent[1]), /HERO VIDEO.*media\/hero\.mp4/s);
  assert.match(String(sent[1]), /120 still frames media\/hero\/\{n\}\.jpg/);
});
