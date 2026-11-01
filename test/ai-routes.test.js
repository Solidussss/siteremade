'use strict';
// CUSTOMER AI ROUTES (server.js /api/ai/*, lib/ai-jobs.js): the studio's paid AI over HTTP. The paid work is scripted
// (designDeps.aiMakers) -- no provider is ever called. Customers are refused until both switches are on; then a
// confirmed click is one job, charged once, refunded for what didn't deliver.
process.env.SITEREMADE_DB_PATH = ':memory:';
process.env.SITEREMADE_DESIGN_OWNER_CUTOFF = '2999-01-01T00:00:00.000Z';
delete process.env.SITEREMADE_CUSTOMER_AI; delete process.env.SITEREMADE_AI_PRICES_VERIFIED;
const test = require('node:test');
const assert = require('node:assert/strict');
const jpeg = require('jpeg-js');
const { app, setDesignDeps, db } = require('../server.js');
const designSites = require('../lib/design-sites');
const credits = require('../lib/credits');

const photo = () => 'data:image/jpeg;base64,' + jpeg.encode({ data: Buffer.alloc(64 * 48 * 4, 120), width: 64, height: 48 }, 80).data.toString('base64');
const made = [];
const scripted = {
  image: async (part, job) => { made.push(['image', job.id, part.n]); return { result: { url: `/ai-media/${job.id}/image-${part.n}.png` }, usd: 0.06 }; },
  showcase: async (part, job) => { made.push(['showcase', job.id, part.n]); if (part.n === 2 && part.attempt === 1) throw Object.assign(new Error('segment failed'), { usd: 1.4 }); return { result: { url: `/ai-media/${job.id}/segment-${part.n}.mp4` }, usd: 1.4 }; },
};
setDesignDeps({ writer: () => { throw new Error('no AI in tests'); }, cost: designSites.cost, aiMakers: scripted });

async function server() {
  const srv = app.listen(0, '127.0.0.1'); await new Promise((r) => srv.on('listening', r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  const session = async (email) => {
    let cookie = '';
    const call = async (method, p, body) => {
      const r = await fetch(base + p, { method, redirect: 'manual', headers: { 'content-type': 'application/json', origin: base, cookie }, body: body ? JSON.stringify(body) : undefined });
      const sc = r.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
      const text = await r.text(); let json = null; try { json = JSON.parse(text); } catch (e) { /* not json */ }
      return { status: r.status, json, text };
    };
    if (email) await call('POST', '/api/auth/signup', { email, password: 'correct-horse-battery-staple' });
    return call;
  };
  return { srv, session };
}
const accountOf = (email) => db.accounts.findByEmail(email);
const give = (email, n) => credits.grant(db, { id: `admin:test:${email}:${n}:${Math.random()}`, accountId: accountOf(email).id, kind: 'admin', amount: n, source: 'test', reason: 'test' });
const until = async (call, id, done = (j) => !['queued', 'running'].includes(j.status)) => { for (let i = 0; i < 100; i++) { const r = await call('GET', `/api/ai/jobs/${id}`); if (done(r.json.job)) return r.json; await new Promise((ok) => setTimeout(ok, 20)); } throw new Error('job never finished'); };
const key = () => 'k' + Math.random().toString(36).slice(2, 14);

test('customer AI: refused until switched on and verified; then quote -> one job -> charged once', async () => {
  const { srv, session } = await server();
  try {
    assert.equal((await (await session())('POST', '/api/ai/jobs', { kind: 'image', prompt: 'x', idemKey: key() })).status, 401, 'signed in only');
    const c = await session('customer1@example.com'); give('customer1@example.com', 20);
    const bal0 = (await c('GET', '/api/credits')).json.credits;
    assert.ok(bal0, 'the existing balance route is open to the studio again');
    assert.equal((await c('GET', '/api/billing/catalog')).json.catalog.packs.length, 4, 'and the credit packs');
    let q = (await c('POST', '/api/ai/quote', { kind: 'image', prompts: ['a barbershop at dusk'] })).json;
    assert.equal(q.allowed, false); assert.equal(q.code, 'off');
    assert.equal((await c('POST', '/api/ai/jobs', { kind: 'image', prompts: ['a barbershop at dusk'], idemKey: key() })).json.code, 'off');
    process.env.SITEREMADE_CUSTOMER_AI = 'on';
    assert.equal((await c('POST', '/api/ai/quote', { kind: 'image', prompts: ['x'] })).json.code, 'unverified', 'never charged at a guessed price');
    process.env.SITEREMADE_AI_PRICES_VERIFIED = 'on';
    const start = (await c('GET', '/api/ai/config')).json; assert.equal(start.open, true); assert.equal(start.prices.video_12, 21);
    q = (await c('POST', '/api/ai/quote', { kind: 'image', prompts: ['start', 'end'], credits: 0 })).json;
    assert.deepEqual([q.credits, q.after - q.balance, q.allowed], [4, -4, true], 'two images, 2 credits each; a price sent by the browser is ignored');
    const k = key();
    const a = await c('POST', '/api/ai/jobs', { kind: 'image', prompts: ['start', 'end'], idemKey: k });
    const b = await c('POST', '/api/ai/jobs', { kind: 'image', prompts: ['start', 'end'], idemKey: k });
    assert.equal(a.status, 200); assert.equal(b.json.existing, true); assert.equal(b.json.job.id, a.json.job.id, 'a double click is the same job');
    const done = await until(c, a.json.job.id);
    assert.equal(done.job.status, 'succeeded'); assert.equal(done.job.charged, 4); assert.equal(done.balance, q.balance - 4);
    assert.equal(made.filter((m) => m[1] === a.json.job.id).length, 2, 'made once');
  } finally { srv.close(); delete process.env.SITEREMADE_CUSTOMER_AI; delete process.env.SITEREMADE_AI_PRICES_VERIFIED; }
});

test('showcase: photos are the customer’s own; a failed segment is refunded and a retry pays only for it', async () => {
  const { srv, session } = await server();
  process.env.SITEREMADE_CUSTOMER_AI = 'on'; process.env.SITEREMADE_AI_PRICES_VERIFIED = 'on';
  try {
    const c = await session('customer2@example.com'); give('customer2@example.com', 40);
    const other = await session('customer3@example.com');
    const ups = []; for (let i = 0; i < 3; i++) { const u = await c('POST', '/api/ai/uploads', { photo: photo() }); assert.equal(u.status, 200); ups.push(u.json.token); }
    assert.equal((await c('GET', `/ai-media/in/${ups[0]}.jpg`)).status, 200, 'the video provider can fetch it');
    assert.equal((await other('POST', '/api/ai/jobs', { kind: 'showcase', images: ups, idemKey: key() })).json.message, 'Add 2 to 9 photos, in order.', 'someone else’s photos are refused');
    const q = (await c('POST', '/api/ai/quote', { kind: 'showcase', images: ups })).json; assert.equal(q.credits, 18); assert.equal(q.parts.length, 2);
    const j = await c('POST', '/api/ai/jobs', { kind: 'showcase', images: ups, idemKey: key() });
    const done = await until(c, j.json.job.id);
    assert.equal(done.job.status, 'partial'); assert.equal(done.job.charged, 9); assert.equal(done.job.refunded, 9);
    const r = await c('POST', `/api/ai/jobs/${j.json.job.id}/retry`);
    assert.equal(r.status, 200); assert.equal(r.json.credits, 9);
    const again = await until(c, j.json.job.id);
    assert.equal(again.job.status, 'succeeded'); assert.equal(again.job.charged, 18);
    assert.deepEqual(made.filter((m) => m[1] === j.json.job.id).map((m) => m[2]), [1, 2, 2], 'segment 1 was never made again');
    assert.equal((await other('GET', `/api/ai/jobs/${j.json.job.id}`)).status, 404, 'a job is private to its account');
  } finally { srv.close(); delete process.env.SITEREMADE_CUSTOMER_AI; delete process.env.SITEREMADE_AI_PRICES_VERIFIED; }
});

test('the owner can run AI without the switches and without credits', async () => {
  const { srv, session } = await server();
  try {
    const o = await session('jaydenflynn9@gmail.com');
    const cfg = (await o('GET', '/api/ai/config')).json; assert.equal(cfg.owner, true); assert.equal(cfg.open, true);
    const j = await o('POST', '/api/ai/jobs', { kind: 'image', prompts: ['x'], idemKey: key() });
    assert.equal(j.status, 200, j.text); const done = await until(o, j.json.job.id);
    assert.equal(done.job.status, 'succeeded'); assert.equal(done.job.charged, 0);
  } finally { srv.close(); }
});

test('with no scripted makers and no keys (a development machine), every paid action reports itself unavailable', async () => {
  setDesignDeps({ writer: () => { throw new Error('no AI in tests'); }, cost: designSites.cost });
  const { srv, session } = await server();
  process.env.SITEREMADE_CUSTOMER_AI = 'on'; process.env.SITEREMADE_AI_PRICES_VERIFIED = 'on';
  try {
    const c = await session('customer4@example.com'); give('customer4@example.com', 50);
    const cfg = (await c('GET', '/api/ai/config')).json;
    assert.deepEqual(Object.values(cfg.available), [false, false, false, false, false, false]);
    for (const kind of ['assist_update', 'own_plan', 'image', 'video', 'exterior', 'showcase']) {
      const r = await c('POST', '/api/ai/jobs', { kind, idemKey: key(), prompts: ['x'], request: 'x' });
      assert.equal(r.json.code, 'unavailable', kind);
    }
    assert.equal(db.raw.prepare("SELECT COUNT(*) n FROM ai_jobs j JOIN accounts a ON a.id = j.account_id WHERE a.email = 'customer4@example.com'").get().n, 0);
  } finally { srv.close(); delete process.env.SITEREMADE_CUSTOMER_AI; delete process.env.SITEREMADE_AI_PRICES_VERIFIED; setDesignDeps({ writer: () => { throw new Error('no AI in tests'); }, cost: designSites.cost, aiMakers: scripted }); }
});
