'use strict';
// ONE-PROMPT ONBOARDING (2026-10-22): pick a design, describe the business in one sentence, get the site. The design's
// other brief questions are optional; the business name comes from the sentence when its own field is empty; compass
// (whose brief already has an "about" field) no longer gets a second one. A scripted writer -- never the paid AI.
process.env.SITEREMADE_DB_PATH = ':memory:';
process.env.SITEREMADE_DESIGN_OWNER_CUTOFF = '2999-01-01T00:00:00.000Z';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { app, setDesignDeps } = require('../server.js');
const designSites = require('../lib/design-sites');
const prompt = require('../design-packages/prompt');
const { loadDesign } = require('../design-packages/engine/engine');

const DIR = path.join(__dirname, '..', 'design-packages', 'design');
// the design's own example content, renamed as the writer would from the sentence
function namingWriter(design, name, seen) {
  const usage = { calls: 0, input: 0, output: 0, cacheWrite: 0, cacheRead: 0 };
  return { name: 'scripted', usage, start(p) { seen.push(p); }, feedback() {}, async next() {
    usage.calls++;
    const c = JSON.parse(fs.readFileSync(path.join(DIR, design, 'default.json'), 'utf8'));
    c.business.name = name; c.footer.fine = name + ', Calgary.'; c._assumed = ['footer.columns.2.lines.0']; c._questions = [];
    return JSON.stringify(c);
  } };
}
const until = async (fn, ms = 10000) => { const t0 = Date.now(); for (;;) { const v = await fn(); if (v) return v; if (Date.now() - t0 > ms) throw new Error('timed out'); await new Promise((r) => setTimeout(r, 50)); } };

test('one sentence is enough: the site is written and named from it', async () => {
  const seen = [];
  setDesignDeps({ writer: () => namingWriter('steadyhand', 'Fade Society', seen) });
  const srv = app.listen(0, '127.0.0.1'); await new Promise((r) => srv.on('listening', r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  let cookie = '';
  const call = async (method, p, body) => {
    const r = await fetch(base + p, { method, headers: { 'content-type': 'application/json', cookie }, body: body ? JSON.stringify(body) : undefined, redirect: 'manual' });
    const sc = r.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
    const text = await r.text(); let json = null; try { json = JSON.parse(text); } catch (e) { /* html */ }
    return { status: r.status, json, text };
  };
  try {
    assert.equal((await call('POST', '/api/auth/signup', { email: 'barber@example.com', password: 'correct-horse-battery-staple' })).status, 200);
    const about = 'Make this website for my Calgary barbershop called Fade Society. Use black and gold, include our services, and make it feel luxurious.';
    const r = await call('POST', '/api/designs/sites', { design: 'steadyhand', brief: { about } });
    assert.equal(r.status, 200, r.text.slice(0, 200));
    const site = await until(async () => { const x = await call('GET', `/api/designs/sites/${r.json.site.id}`); return x.json.site.status !== 'writing' && x.json.site; });
    assert.equal(site.status, 'built', site.message || '');
    assert.equal(site.businessName, 'Fade Society', 'the project takes the name the page was written with');
    // the writer was told to read the sentence first, and every other question was "(not given)"
    assert.match(seen[0].system, /Owners often put everything in one sentence/);
    assert.match(seen[0].user, /Make this website for my Calgary barbershop/);
    assert.match(seen[0].user, /: \(not given\)/);
    // nothing the owner didn't give goes live unconfirmed: the assumed phone is on the review list
    assert.ok(site.confirm.some((c) => c.path === 'footer.columns.2.lines.0'), 'the assumed phone is listed for the owner');
    // the studio page offers one prompt box and puts the other questions behind "Add details now (optional)"
    const page = await (await fetch(base + '/designs')).text();
    assert.match(page, /Add details now \(optional\)/);
    assert.match(page, /Describe your business, or what you want changed/);
  } finally { srv.close(); setDesignDeps({}); }
});

test('compass keeps a single "about" field (two made every brief for it fail)', () => {
  const compass = designSites.designs().find((x) => x.design === 'compass');
  assert.equal(compass.fields.filter((f) => f.key === 'about').length, 1);
  for (const d of designSites.designs()) assert.equal(d.fields.filter((f) => f.key === 'about').length, 1, d.design + ' has one about field');
});

test('the writer is told where to find the name when its field is empty', () => {
  const d = loadDesign(path.join(DIR, 'saltglass'));
  const spec = JSON.parse(fs.readFileSync(path.join(DIR, 'saltglass', 'brief.json'), 'utf8'));
  const p = prompt.build(d, { about: 'Bright Smile Dental in Leeds' }, spec);
  assert.match(p.system, /the name the description gives/);
});
