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
// the stand-in library: every search finds five photographs (one of them a drawing-licensed one we must skip)
const searches = [];
const library = async (url) => {
  const u = String(url);
  if (u.startsWith('https://api.openverse.org/')) {
    searches.push(new URL(u).searchParams);
    const results = [1, 2, 3, 4, 5].map((n) => ({ url: `https://photos.example/${n}.jpg`, width: 2400, height: 1600, license: n === 5 ? 'by' : 'cc0', title: `Photo ${n}`, creator: 'Someone', foreign_landing_url: `https://photos.example/p/${n}`, filetype: 'jpg', mature: false }));
    return new Response(JSON.stringify({ results }), { status: 200, headers: { 'content-type': 'application/json' } });
  }
  const m = /photos\.example\/(\d)\.jpg$/.exec(u); if (!m) return new Response('no', { status: 404 });
  return new Response(photo(2400, 1600, Number(m[1]) * 10), { status: 200, headers: { 'content-type': 'image/jpeg' } });
};

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

test('the search asks for real photographs only, free for business use, and skips anything else', async () => {
  const got = await demoPhotos.search('car detailing', { fetchImpl: library });
  const q = searches[searches.length - 1];
  assert.equal(q.get('category'), 'photograph'); assert.equal(q.get('license'), 'cc0,pdm'); assert.equal(q.get('mature'), 'false');
  assert.equal(got.length, 4, 'the one under another licence is skipped');
  const small = demoPhotos.shrink(photo(2400, 1600));
  const img = jpeg.decode(small); assert.equal(Math.max(img.width, img.height), 1600);
  assert.ok(Object.keys(demoPhotos.QUERIES).length >= 36, 'every design has its searches');
});

test('one tap finds photos for the demos; the demo plays them; customer sites never get them', async () => {
  const { srv, session } = await server();
  const seen = [];
  setDesignDeps({ writer: () => { throw new Error('no writer'); }, fetch: library, director: () => async ({ images }) => { seen.push(images.length); return { plan: { use_photos: true, main: 3, before: 1, middle: [2], camera: [], skip: [], note: 'The finished car ends it.' } }; } });
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
    assert.equal(bead.note, 'The finished car ends it.'); assert.equal(bead.credits.length, 3); assert.equal(bead.credits[0].license, 'CC0');
    assert.ok(seen.every((n) => n === 4), 'the director saw the four usable photos');
    // the demo plays them, each subject found
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
    // removed: back to the drawing
    assert.equal((await owner('POST', '/api/demo-photos/beadline/clear', {})).status, 200);
    assert.ok(!(await guest('GET', '/designs/demo/beadline')).text.includes('/designs/demo-photo/'));
    // the library says slow down: what's left waits, and the owner is told
    setDesignDeps({ writer: () => { throw new Error('no writer'); }, fetch: async () => new Response('', { status: 429 }), director: () => async () => ({ plan: { main: 1 } }) });
    await owner('POST', '/api/demo-photos/find', { designs: ['larder', 'ochre'] });
    const slow = await until(async () => { const r = await owner('GET', '/api/demo-photos'); return !r.json.job.running && r.json.job.failed.length === 2 ? r.json : null; });
    assert.match(slow.job.failed[0].why, /slow down/);
  } finally { setDesignDeps({ writer: () => { throw new Error('no writer'); } }); srv.close(); }
});
