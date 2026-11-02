'use strict';
// THE BUSINESS'S OWN LOGO AND TYPEFACE (design-packages/engine/identity.js), on every design: the logo replaces the
// design's top-left brand, sized from its shape; a typeface pair replaces the design's heading and text fonts; with
// neither, the page is exactly what it was.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const E = require('../design-packages/engine/engine');
const identity = require('../design-packages/engine/identity');

function png(w, h) {
  const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); return Buffer.concat([l, Buffer.from(t), d, Buffer.alloc(4)]); };
  const ih = Buffer.alloc(13); ih.writeUInt32BE(w, 0); ih.writeUInt32BE(h, 4); ih[8] = 8; ih[9] = 6;
  return 'data:image/png;base64,' + Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ih), chunk('IDAT', zlib.deflateSync(Buffer.alloc((w * 4 + 1) * h))), chunk('IEND', Buffer.alloc(0))]).toString('base64');
}
const DIR = path.join(__dirname, '..', 'design-packages', 'design');
const designs = fs.readdirSync(DIR).filter((n) => fs.existsSync(path.join(DIR, n, 'design.json')));
const load = (n) => { const d = E.loadDesign(path.join(DIR, n)); return { d, c: JSON.parse(fs.readFileSync(path.join(d.dir, 'default.json'), 'utf8')) }; };

test('every design takes a logo and a typeface, and is unchanged without them', () => {
  assert.ok(designs.length >= 36);
  for (const n of designs) {
    const { d, c } = load(n);
    const plain = E.build(d, c).html;
    assert.ok(!plain.includes('sr-logo') && !plain.includes('sr-type'), `${n}: nothing added without a logo or typeface`);
    c.identity = { logo: png(300, 100), type: 'Editorial', logoColour: 'White' };
    assert.deepEqual(E.validate(d, c).errors, [], n);
    const html = E.build(d, c).html;
    assert.match(html, /class="sr-logo-a [^"]*"[^>]*><img class="sr-logo" src="data:image\/png[^"]*" alt="" width="114" height="38" style="--w:114px;--h:38px;filter:brightness\(0\) invert\(1\)">/, `${n}: the logo in the header`);
    assert.ok(html.includes('family=Playfair+Display') && html.includes('html.sr-type *{--display:"Playfair Display",serif!important'), `${n}: the typeface`);
  }
});

test('a logo is sized from its shape; only listed typefaces and colours are accepted', () => {
  assert.deepEqual(identity.logoSize(png(400, 100)), { w: 131, h: 33 }, 'a wide wordmark');
  assert.deepEqual(identity.logoSize(png(200, 200)), { w: 54, h: 54 }, 'a square badge, capped');
  assert.deepEqual(identity.logoSize(png(1000, 100)), { w: 210, h: 21 }, 'a very long one: held to the widest a header takes');
  const { d, c } = load('steadyhand');
  c.identity = { type: 'Comic Sans' }; assert.match(E.validate(d, c).errors.join(), /identity\.type/);
  c.identity = { logoColour: 'Pink' }; assert.match(E.validate(d, c).errors.join(), /identity\.logoColour/);
  c.identity = { logo: 'javascript:alert(1)' }; assert.match(E.validate(d, c).errors.join(), /identity\.logo/);
  assert.equal(identity.publicTypes().length, Object.keys(identity.TYPES).length);
  assert.ok(identity.publicTypes().every((t) => /^https:\/\/fonts\.googleapis\.com\/css2\?family=/.test(t.url)));
});
