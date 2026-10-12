'use strict';
// ONE PRODUCT (741ab51): the studio is the whole of SiteRemade. An account's design sites list and download as one
// self-contained file; the classic builders' project APIs are retired (410) and their pages lead back to the studio.
// No AI, no paid provider.
process.env.SITEREMADE_DB_PATH = ':memory:';
process.env.SITEREMADE_DESIGN_OWNER_CUTOFF = '2999-01-01T00:00:00.000Z';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { app, setDesignDeps } = require('../server.js');

test('design sites list and download; the classic project APIs are retired', async () => {
  const meridian = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'design-sites', 'meridian-38.json'), 'utf8'));
  setDesignDeps({ writer: () => ({ name: 'scripted', usage: { calls: 0, input: 0, output: 0, cacheWrite: 0, cacheRead: 0 }, start() {}, feedback() {}, async next() { return JSON.stringify(meridian); } }) });
  const srv = app.listen(0, '127.0.0.1'); await new Promise((r) => srv.on('listening', r));
  const base = `http://127.0.0.1:${srv.address().port}`; let cookie = '';
  const call = async (m, p, body) => { const r = await fetch(base + p, { method: m, redirect: 'manual', headers: { 'content-type': 'application/json', origin: base, cookie }, body: body ? JSON.stringify(body) : undefined }); const sc = r.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0]; const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch (e) { /* html */ } return { status: r.status, json: j, text: t, headers: r.headers }; };
  try {
    assert.equal((await call('POST', '/api/auth/signup', { email: 'jaydenflynn9@gmail.com', password: 'correct-horse-battery-staple' })).status, 200);
    const id = (await call('POST', '/api/designs/sites', { design: 'aldane', brief: { businessName: 'Meridian 38', brand: 'Meridian', watch: 'Hand-wound, 42-hour reserve.', options: 'Cases $1,850.', reserve: '$300 deposit.' } })).json.site.id;
    for (let i = 0; i < 100 && (await call('GET', `/api/designs/sites/${id}`)).json.site.status === 'writing'; i++) await new Promise((r) => setTimeout(r, 30));
    const list = (await call('GET', '/api/designs')).json;
    assert.deepEqual(list.sites.map((s) => s.id), [id]);
    assert.ok(!('projects' in list), 'no classic projects any more');

    // the classic builders' APIs are gone; their pages lead to the studio
    const p = await call('POST', '/api/projects', { name: 'Petal & Stem', directionsState: { directions: [], activeDirectionIndex: 0 } });
    assert.equal(p.status, 410); assert.match(p.json.message, /retired/);
    assert.equal((await call('GET', '/api/projects')).status, 410);
    const home = await call('GET', '/?project=p_old');
    assert.equal(home.status, 200); assert.doesNotMatch(home.text, /generatorInput/, 'the studio, not the classic builder');

    // a design site downloads as one self-contained file
    const dl = await call('GET', `/api/designs/sites/${id}/download`);
    assert.equal(dl.status, 200); assert.match(dl.headers.get('content-disposition'), /attachment; filename="meridian-38\.html"/);
    assert.match(dl.text, /^<!doctype html>/); assert.match(dl.text, /Meridian/);
  } finally { srv.close(); }
});
