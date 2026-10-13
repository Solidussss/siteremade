'use strict';
// DESIGN SITES (lib/design-sites.js, design-packages/): the brief-to-site flow through the REAL route table, with a
// recorded writer (test/fixtures/design-sites: answers recorded earlier) -- never the paid AI. Checks the owner-only
// gate, the writer -> checker -> retry loop, the pinned name question, publishing at /s/<id>, and that both designs'
// default content still builds (every design in the gallery).
process.env.SITEREMADE_DB_PATH = ':memory:';
// (the owner gate trusts an owner account that predates the feature; here every account is new, so the cutoff moves)
process.env.SITEREMADE_DESIGN_OWNER_CUTOFF = '2999-01-01T00:00:00.000Z';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { app, setDesignDeps } = require('../server.js');
const designSites = require('../lib/design-sites');
const { loadDesign, validate, build } = require('../design-packages/engine/engine');

const FIX = path.join(__dirname, 'fixtures', 'design-sites');
function replayWriter() {
  let n = 0; const usage = { calls: 0, input: 0, output: 0, cacheWrite: 0, cacheRead: 0 };
  return { name: 'replay', usage, start() {}, feedback() {}, async next() { n++; usage.calls++; return fs.readFileSync(path.join(FIX, `attempt-${n}.txt`), 'utf8'); } };
}
const OWNER = 'jaydenflynn9@gmail.com';

async function server() {
  const srv = app.listen(0, '127.0.0.1'); await new Promise((r) => srv.on('listening', r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  const session = async (email) => {
    let cookie = '';
    const call = async (method, p, body) => {
      const r = await fetch(base + p, { method, headers: { 'content-type': 'application/json', cookie }, body: body ? JSON.stringify(body) : undefined, redirect: 'manual' });
      const sc = r.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
      const text = await r.text(); let json = null; try { json = JSON.parse(text); } catch (e) { /* html */ }
      return { status: r.status, json, text };
    };
    const up = await call('POST', '/api/auth/signup', { email, password: 'correct-horse-battery-staple' });
    assert.equal(up.status, 200, 'signed up: ' + up.text.slice(0, 200));
    return call;
  };
  return { srv, base, session };
}
const until = async (fn, ms = 10000) => { const t0 = Date.now(); for (;;) { const v = await fn(); if (v) return v; if (Date.now() - t0 > ms) throw new Error('timed out'); await new Promise((r) => setTimeout(r, 50)); } };

test('every design: default content passes its rules and builds', () => {
  for (const d of designSites.designs().map((x) => x.design)) {
    const D = loadDesign(path.join(__dirname, '..', 'design-packages', 'design', d));
    const c = JSON.parse(fs.readFileSync(path.join(D.dir, 'default.json'), 'utf8'));
    assert.deepEqual(validate(D, c).errors, [], d);
    assert.ok(build(D, c).html.length > 30000, d + ' builds');
  }
});

test('brief to site: owner only, retry loop, publish', async () => {
  setDesignDeps({ writer: replayWriter, cost: designSites.cost });
  const { srv, base, session } = await server();
  try {
    const { brief } = JSON.parse(fs.readFileSync(path.join(FIX, 'brief.json'), 'utf8'));
    // the studio is the product: a visitor sees the designs; any signed-in account has its own (empty) list
    assert.equal((await fetch(base + '/api/designs')).status, 401);
    const cat = await (await fetch(base + '/api/designs/catalog')).json();
    assert.equal(cat.designs.length, 33);
    const other = await session('someone-else@example.com');
    const otherList = await other('GET', '/api/designs');
    assert.equal(otherList.status, 200); assert.deepEqual(otherList.json.sites, []); assert.equal(otherList.json.access.free, true);

    const owner = await session(OWNER);
    const list = await owner('GET', '/api/designs');
    assert.equal(list.status, 200);
    assert.deepEqual(list.json.designs.map((d) => d.design), ['beadline', 'halcyra', 'steadyhand', 'nube', 'ventricle', 'forno', 'saltglass', 'kova', 'clutch', 'ondo', 'aldane', 'lintel', 'keel', 'plait', 'ochre', 'larder', 'halden', 'sereine', 'fettle', 'brisk', 'verge', 'camber', 'northlight', 'stillwater', 'axis', 'scruff', 'proof', 'petal', 'inkwell', 'lacquer', 'hearth', 'gather', 'plumb']);
    assert.equal((await owner('GET', '/designs')).status, 200);

    // the recorded writer: draft 1 breaks one rule (headline too long), draft 2 passes
    const started = await owner('POST', '/api/designs/sites', { design: 'beadline', brief });
    assert.equal(started.status, 200, started.text);
    const id = started.json.site.id;
    const done = await until(async () => { const r = await owner('GET', `/api/designs/sites/${id}`); return r.json.site.status !== 'writing' && r.json.site; });
    assert.equal(done.status, 'built', JSON.stringify(done.attempts));
    assert.equal(done.attempts.length, 2);
    assert.match(done.attempts[0].errors[0], /headline/);
    assert.deepEqual(done.attempts[1].errors, []);
    assert.equal(done.businessName, 'Kestrel Car Care');
    assert.ok(done.confirm.some((c) => c.path === 'coatings.items.0.cost'), 'facts not in the brief are listed');
    assert.ok(!done.confirm.some((c) => c.path.startsWith('packages.items')), 'the brief\'s prices are not');

    // private until published; the other account can't see it at all
    assert.equal((await fetch(`${base}/s/${id}`)).status, 404);
    assert.equal((await other('GET', `/api/designs/sites/${id}`)).status, 404, 'another account never sees this site');
    const prev = await owner('GET', `/api/designs/sites/${id}/preview`);
    assert.equal(prev.status, 200); assert.match(prev.text, /Kestrel Car Care/);
    // a real business: the writer's coating costs are proposed, so going live waits for the owner to confirm them
    const held = await owner('POST', `/api/designs/sites/${id}/publish`, { on: true });
    assert.equal(held.status, 409);
    assert.ok(held.json.blocking.some((b) => b.kind === 'price' && b.path.startsWith('coatings.items')), JSON.stringify(held.json.blocking));
    assert.equal((await fetch(`${base}/s/${id}`)).status, 404, 'still private');
    const pub = await owner('POST', `/api/designs/sites/${id}/publish`, { on: true, confirm: true });
    assert.equal(pub.json.site.publicPath, `/s/${id}`);
    assert.ok(pub.json.site.reality.confirmed.length >= 1 && pub.json.site.reality.confirmed.every((c) => c.by.startsWith('account:') && c.at), 'who confirmed and when is recorded');
    assert.deepEqual(pub.json.site.reality.blocking, []);
    const live = await fetch(`${base}/s/${id}`); assert.equal(live.status, 200);
    assert.match(await live.text(), /Rain wrecks paint/);
    await owner('POST', `/api/designs/sites/${id}/publish`, { on: false });
    assert.equal((await fetch(`${base}/s/${id}`)).status, 404, 'unpublished');

    // a name the design can't fit: asked in the writer's one round of questions (test/design-sites-clarify.test.js)
    const long = await owner('POST', '/api/designs/sites', { design: 'beadline', brief: { ...brief, businessName: 'GlossMasters Pro Detailing & Ceramic Coating Specialists LLC' } });
    assert.equal(long.json.site.status, 'writing');
    const asked = await until(async () => { const r = await owner('GET', `/api/designs/sites/${long.json.site.id}`); return r.json.site.status !== 'writing' && r.json.site; });
    assert.equal(asked.status, 'needs_owner');
    assert.match(asked.questions[0], /shorter name/);
    // a missing required answer
    assert.equal((await owner('POST', '/api/designs/sites', { design: 'beadline', brief: { businessName: 'X Car Care' } })).status, 400);
  } finally { srv.close(); }
});
