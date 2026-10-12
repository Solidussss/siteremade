'use strict';
// PROJECTS IN ONE PLACE (consolidation): the new studio (/designs) lists the account's design sites AND every website
// saved with the classic builders (Business, Creative), each classic one opening where it is edited today; the
// classic projects themselves are untouched -- they still load whole, still open as their own kind in the customer
// app, and a design site downloads as one file. No AI, no paid provider.
process.env.SITEREMADE_DB_PATH = ':memory:';
process.env.SITEREMADE_DESIGN_OWNER_CUTOFF = '2999-01-01T00:00:00.000Z';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { app, setDesignDeps } = require('../server.js');
const S = require('./helpers/three-d-scenario');
const { loadClient, premiumProviderStatus, buildProject } = require('./helpers/load-client');
const projectStore = require('../lib/project-store');

test('classic projects and design sites in one list; classic ones still open whole', async () => {
  const meridian = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'design-sites', 'meridian-38.json'), 'utf8'));
  setDesignDeps({ writer: () => ({ name: 'scripted', usage: { calls: 0, input: 0, output: 0, cacheWrite: 0, cacheRead: 0 }, start() {}, feedback() {}, async next() { return JSON.stringify(meridian); } }) });
  const srv = app.listen(0, '127.0.0.1'); await new Promise((r) => srv.on('listening', r));
  const base = `http://127.0.0.1:${srv.address().port}`; let cookie = '';
  const call = async (m, p, body) => { const r = await fetch(base + p, { method: m, headers: { 'content-type': 'application/json', cookie }, body: body ? JSON.stringify(body) : undefined }); const sc = r.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0]; const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch (e) { /* html */ } return { status: r.status, json: j, text: t, headers: r.headers }; };
  try {
    assert.equal((await call('POST', '/api/auth/signup', { email: 'jaydenflynn9@gmail.com', password: 'correct-horse-battery-staple' })).status, 200);
    // a classic Business website and a Creative one, saved as customers save them
    const c = loadClient(); const { proj } = buildProject(c, 'Petal & Stem is a florist in Portland. Call 503-555-0147.', { providerStatus: premiumProviderStatus() });
    const biz = projectStore.validateDirectionsState({ directions: [JSON.parse(JSON.stringify(proj))], activeDirectionIndex: 0 }).normalized.directions[0];
    const b = await call('POST', '/api/projects', { name: 'Petal & Stem', directionsState: { directions: [biz], activeDirectionIndex: 0 } });
    assert.ok(b.status === 200 || b.status === 201, b.text.slice(0, 200));
    const cr = await call('POST', '/api/projects', { name: 'Aurelia', directionsState: { directions: [S.creativePage()], activeDirectionIndex: 0 } });
    assert.ok(cr.status === 200 || cr.status === 201, cr.text.slice(0, 200));
    const bizBefore = (await call('GET', `/api/projects/${b.json.project.id}`)).json.project;
    // and a site from the new generator
    const id = (await call('POST', '/api/designs/sites', { design: 'aldane', brief: { businessName: 'Meridian 38', brand: 'Meridian', watch: 'Hand-wound, 42-hour reserve.', options: 'Cases $1,850.', reserve: '$300 deposit.' } })).json.site.id;
    for (let i = 0; i < 100 && (await call('GET', `/api/designs/sites/${id}`)).json.site.status === 'writing'; i++) await new Promise((r) => setTimeout(r, 30));

    assert.equal((await call('GET', '/api/site-config')).json.designsOpen, false, 'off by default: the homepage is the classic one');
    const list = (await call('GET', '/api/designs')).json;
    assert.deepEqual(list.sites.map((s) => s.id), [id]);
    const kinds = Object.fromEntries(list.projects.map((p) => [p.name, p.mode]));
    assert.deepEqual(kinds, { 'Petal & Stem': 'business', Aurelia: 'creative' }, JSON.stringify(list.projects));
    assert.ok(list.projects.every((p) => p.open === '/?project=' + p.id), 'each opens in the classic editor, as today');
    assert.ok(list.projects.every((p) => !('directionsState' in p)), 'metadata only');

    // the classic projects are untouched: they load whole, exactly as saved
    const bizAfter = (await call('GET', `/api/projects/${b.json.project.id}`)).json.project;
    assert.deepEqual(bizAfter, bizBefore);
    const crAfter = (await call('GET', `/api/projects/${cr.json.project.id}`)).json.project;
    assert.equal(crAfter.directionsState.directions[0].mode, 'creative');
    // the classic builder page still serves (where "Open" goes)
    const page = await call('GET', `/?project=${encodeURIComponent(b.json.project.id)}`);
    assert.equal(page.status, 200); assert.match(page.text, /generatorInput/);

    // a design site downloads as one self-contained file
    const dl = await call('GET', `/api/designs/sites/${id}/download`);
    assert.equal(dl.status, 200); assert.match(dl.headers.get('content-disposition'), /attachment; filename="meridian-38\.html"/);
    assert.match(dl.text, /^<!doctype html>/); assert.match(dl.text, /Meridian/);
  } finally { srv.close(); }
});
