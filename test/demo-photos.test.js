'use strict';
// DEMO PHOTOS (lib/demo-photos.js): the owner finds real photographs for the designs' demos in one go. Here the photo
// library and the hero director are stand-ins: nothing leaves the machine, and Claude is never called.
process.env.SITEREMADE_DB_PATH = ':memory:';
process.env.SITEREMADE_DESIGN_OWNER_CUTOFF = '2999-01-01T00:00:00.000Z';
delete process.env.ANTHROPIC_API_KEY;
const test = require('node:test');
const assert = require('node:assert/strict');
const jpeg = require('jpeg-js');
const { app, setDesignDeps } = require('../server.js');
const demoPhotos = require('../lib/demo-photos');

const OWNER = 'jaydenflynn9@gmail.com';
// a real JPEG: grey, with a bright block where the subject is
const photo = (W = 1200, H = 800, hue = 0) => { const px = Buffer.alloc(W * H * 4); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = (y * W + x) * 4, inside = x > W * .3 && x < W * .7 && y > H * .25 && y < H * .75; px[i] = inside ? 210 : 110 + hue; px[i + 1] = inside ? 40 : 115; px[i + 2] = inside ? 50 : 120; px[i + 3] = 255; } return Buffer.from(jpeg.encode({ width: W, height: H, data: px }, 85).data); };
// the stand-in libraries: Wikimedia Commons answers with five files (two under licences we must skip); Openverse and
// Pexels answer the same way when asked; the photos themselves are real JPEGs
const asked = [];
const commonsPages = [1, 2, 3, 4, 5].map((n) => ({ title: `File:Photo ${n}.jpg`, imageinfo: [{ url: `https://upload.example/${n}.jpg`, thumburl: `https://upload.example/${n}.jpg`, width: 3000, height: 2000, mime: 'image/jpeg', descriptionurl: `https://commons.example/${n}`,
  extmetadata: { LicenseShortName: { value: n === 4 ? 'CC BY-SA 4.0' : n === 5 ? 'CC BY 2.0' : n === 3 ? 'Public domain' : 'CC0' }, Artist: { value: '<a href="x">Someone</a>' }, ObjectName: { value: `Photo ${n}` } } }] }));
const makeLibrary = ({ commonsDown = false } = {}) => async (url) => {
  const u = String(url);
  if (u.startsWith('https://commons.wikimedia.org/')) { asked.push(['commons', new URL(u).searchParams]); return commonsDown ? new Response('', { status: 503 }) : new Response(JSON.stringify({ query: { pages: commonsPages } }), { status: 200 }); }
  if (u.startsWith('https://api.openverse.org/')) { asked.push(['openverse', new URL(u).searchParams]); return new Response(JSON.stringify({ results: [1, 2, 3].map((n) => ({ url: `https://upload.example/${n}.jpg`, width: 2400, height: 1600, license: 'cc0', title: `OV ${n}`, filetype: 'jpg' })) }), { status: 200 }); }
  if (u.startsWith('https://pixabay.com/api/')) { asked.push(['pixabay', new URL(u).searchParams]); return new Response(JSON.stringify({ hits: [1, 2, 3, 4].map((n) => ({ largeImageURL: `https://upload.example/${n}.jpg`, imageWidth: 4000, imageHeight: 2600, tags: `car, wash ${n}`, user: 'Px', pageURL: 'https://pixabay.example' })) }), { status: 200 }); }
  if (u.startsWith('https://api.pexels.com/')) { asked.push(['pexels', new URL(u).searchParams]); return new Response(JSON.stringify({ photos: [1, 2].map((n) => ({ width: 4000, height: 2600, alt: `Pexels ${n}`, photographer: 'P', url: 'https://pexels.example', src: { original: `https://upload.example/${n}.jpg` } })) }), { status: 200 }); }
  const m = /upload\.example\/(\d)\.jpg/.exec(u); if (!m) return new Response('no', { status: 404 });
  return new Response(photo(2400, 1600, Number(m[1]) * 10), { status: 200, headers: { 'content-type': 'image/jpeg' } });
};
const library = makeLibrary();

async function server() {
  const srv = app.listen(0, '127.0.0.1'); await new Promise((r) => srv.on('listening', r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  const session = async (email) => {
    let cookie = '';
    const call = async (method, p, body) => {
      const r = await fetch(base + p, { method, headers: { 'content-type': 'application/json', origin: base, cookie }, body: body ? JSON.stringify(body) : undefined });
      const sc = r.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
      const buf = Buffer.from(await r.arrayBuffer()); let json = null; try { json = JSON.parse(buf.toString()); } catch (e) { /* not json */ }
      return { status: r.status, json, text: buf.toString(), buf, type: r.headers.get('content-type') || '' };
    };
    if (email) { const up = await call('POST', '/api/auth/signup', { email, password: 'correct-horse-battery-staple' }); if (up.status !== 200) await call('POST', '/api/auth/signin', { email, password: 'correct-horse-battery-staple' }); }
    return call;
  };
  return { srv, session };
}
const until = async (f) => { for (let i = 0; i < 200; i++) { const v = await f(); if (v) return v; await new Promise((r) => setTimeout(r, 100)); } throw new Error('timed out'); };

test('the search: real photographs, free for business use with no credit needed, from the best library that answers', async () => {
  const wait = async () => {};
  const fromCommons = await demoPhotos.search('car detailing', { fetchImpl: library, wait, keys: {} });
  assert.equal(asked[asked.length - 1][0], 'commons', 'no Pexels key: Commons first');
  assert.deepEqual(fromCommons.map((x) => x.license), ['CC0', 'CC0', 'Public domain'], 'files that need a credit are skipped');
  assert.equal(fromCommons[0].creator, 'Someone', 'credits are plain text');
  const off = new Set();
  const fromOpenverse = await demoPhotos.search('car detailing', { fetchImpl: makeLibrary({ commonsDown: true }), wait, keys: {}, off });
  assert.ok(off.has('commons')); assert.equal(fromOpenverse[0].title, 'OV 1');
  const ov = asked.filter((a) => a[0] === 'openverse').pop()[1];
  assert.equal(ov.get('category'), 'photograph'); assert.equal(ov.get('license'), 'cc0,pdm'); assert.equal(ov.get('page_size'), '20');
  const fromPexels = await demoPhotos.search('car detailing', { fetchImpl: library, wait, keys: { pexels: 'k' } });
  assert.equal(fromPexels[0].license, 'Pexels'); assert.match(fromPexels[0].url, /w=1600/);
  // with a Pixabay key: Pixabay, editors' choice first, and never the uneven free libraries
  const before = asked.length;
  const fromPixabay = await demoPhotos.search('car detailing', { fetchImpl: library, wait, keys: { pixabay: 'pk' } });
  assert.equal(fromPixabay[0].license, 'Pixabay'); assert.equal(fromPixabay[0].url, 'https://upload.example/1.jpg');
  const px = asked.slice(before); assert.ok(px.every((a) => a[0] === 'pixabay')); assert.equal(px[0][1].get('editors_choice'), 'true'); assert.equal(px[0][1].get('image_type'), 'photo');
  const none = await demoPhotos.search('car detailing', { fetchImpl: async () => new Response('', { status: 400 }), wait, keys: { pixabay: 'bad' } });
  assert.deepEqual(none, [], 'a bad key: nothing, and no fall back to the uneven libraries');
  const img = jpeg.decode(demoPhotos.shrink(photo(2400, 1600))); assert.equal(Math.max(img.width, img.height), 1600);
  assert.ok(Object.keys(demoPhotos.QUERIES).length >= 36, 'every design has its searches');
});

test('one tap finds photos for the demos; the demo plays them; customer sites never get them', async () => {
  const { srv, session } = await server();
  const seen = [];
  setDesignDeps({ writer: () => { throw new Error('no writer'); }, fetch: library, wait: async () => {}, photoKeys: {}, director: () => async ({ images }) => { seen.push(images.length); return { plan: { use_photos: true, main: 3, before: 1, middle: [2], camera: [], skip: [], note: 'The finished car ends it.' } }; } });
  try {
    const owner = await session(OWNER), guest = await session(null), stranger = await session('someone@example.com');
    assert.equal((await stranger('GET', '/api/demo-photos')).status, 404, 'owner only');
    assert.equal((await stranger('POST', '/api/demo-photos/find', {})).status, 404);
    const before = await guest('GET', '/designs/demo/beadline');
    assert.ok(!before.text.includes('/designs/demo-photo/'), 'no photos yet: the drawing');
    const go = await owner('POST', '/api/demo-photos/find', { designs: ['beadline', 'steadyhand'] });
    assert.equal(go.status, 200, go.text);
    const done = await until(async () => { const r = await owner('GET', '/api/demo-photos'); return !r.json.job.running && r.json.job.done.length + r.json.job.failed.length === 2 ? r.json : null; });
    assert.deepEqual(done.job.failed, []); assert.deepEqual(done.job.done.sort(), ['beadline', 'steadyhand']);
    const bead = done.designs.find((d) => d.design === 'beadline');
    assert.deepEqual(bead.photos.map((p) => p.slot).sort(), ['before', 'main', 'second']);
    assert.equal(bead.note, 'The finished car ends it.'); assert.equal(bead.credits.length, 3); assert.ok(bead.credits.every((c) => /^(CC0|Public domain)$/.test(c.license)));
    assert.ok(seen.every((n) => n === 3), 'the director saw the three usable photos');
    // the demo plays them, each subject found
    // the owner looks first: the site keeps the drawings until the owner switches the photos on
    assert.equal(done.shown, false);
    assert.ok(!(await guest('GET', '/designs/demo/beadline')).text.includes('/designs/demo-photo/'), 'not switched on: the drawing');
    assert.equal((await stranger('POST', '/api/demo-photos/show', { on: true })).status, 404);
    assert.equal((await owner('POST', '/api/demo-photos/show', { on: true })).json.shown, true);
    const demo = await guest('GET', '/designs/demo/beadline');
    assert.ok(demo.text.includes('/designs/demo-photo/beadline/main.jpg'), 'the demo has its photos'); assert.ok(demo.text.includes('data-mask="data:image/jpeg'));
    const img = await guest('GET', bead.photos[0].url);
    assert.equal(img.status, 200); assert.match(img.type, /image\/jpeg/); assert.equal(img.buf[0], 0xff);
    assert.match((await guest('GET', '/designs/poster/beadline.jpg')).type, /image\/jpeg/);
    // the barber design has its own photo mode: the photos go in there
    assert.ok((await guest('GET', '/designs/demo/steadyhand')).text.includes('/designs/demo-photo/steadyhand/main.jpg'));
    // a customer's site starts from the example words, without the demo's photos
    const made = await owner('POST', '/api/designs/sites/from-example', { design: 'beadline', businessName: 'Gloss Bros' });
    assert.equal(made.status, 200, made.text);
    const ed = await owner('GET', `/api/designs/sites/${made.json.site.id}/editor`);
    assert.equal(ed.json.editor.fields.find((f) => f.path === 'photos.main').value, null);
    // switched off: every demo shows its drawing, the photos stay saved
    await owner('POST', '/api/demo-photos/show', { on: false });
    assert.ok(!(await guest('GET', '/designs/demo/beadline')).text.includes('/designs/demo-photo/'), 'off: the drawing');
    assert.notEqual((await guest('GET', '/designs/poster/beadline.jpg')).buf.length, img.buf.length, 'off: the drawn still');
    assert.equal((await owner('GET', '/api/demo-photos')).json.designs.find((d) => d.design === 'beadline').photos.length, 3, 'the owner still sees them');
    await owner('POST', '/api/demo-photos/show', { on: true });
    // removed: back to the drawing
    assert.equal((await owner('POST', '/api/demo-photos/beadline/clear', {})).status, 200);
    assert.ok(!(await guest('GET', '/designs/demo/beadline')).text.includes('/designs/demo-photo/'));
    // every library refuses: the owner is told to try again later
    setDesignDeps({ writer: () => { throw new Error('no writer'); }, fetch: async () => new Response('', { status: 429 }), wait: async () => {}, photoKeys: {}, director: () => async () => ({ plan: { main: 1 } }) });
    await owner('POST', '/api/demo-photos/find', { designs: ['larder', 'ochre'] });
    const slow = await until(async () => { const r = await owner('GET', '/api/demo-photos'); return !r.json.job.running && r.json.job.failed.length === 2 ? r.json : null; });
    assert.match(slow.job.failed[0].why, /try again in an hour/);
  } finally { setDesignDeps({ writer: () => { throw new Error('no writer'); } }); srv.close(); }
});
