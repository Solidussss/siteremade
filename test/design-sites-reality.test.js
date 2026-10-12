'use strict';
// DESIGN SITES + THE REALISM ENGINE (lib/reality): every brief says whether the business is real or a concept; the
// writer is told what is confirmed and what it may only propose; a concept page must say it is a demonstration; every
// reviewed item carries its status; a real business's unconfirmed material claims go live only after the owner
// confirms them (recorded). And the Aldane design draws a metal bracelet as links. Scripted writers only.
process.env.SITEREMADE_DB_PATH = ':memory:';
process.env.SITEREMADE_DESIGN_OWNER_CUTOFF = '2999-01-01T00:00:00.000Z';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { app, setDesignDeps } = require('../server.js');
const designSites = require('../lib/design-sites');
const { loadDesign, validate, build } = require('../design-packages/engine/engine');

const FIX = path.join(__dirname, 'fixtures', 'design-sites');
const meridian = () => JSON.parse(fs.readFileSync(path.join(FIX, 'meridian-38.json'), 'utf8'));
const BRIEF = {
  businessName: 'Meridian 38', brand: 'Meridian',
  watch: 'Meridian 38, calibre MW-42: a hand-wound three-hand watch (no date, no second time zone). 38 mm steel case, 11 mm thick, water resistant to 100 m, 42-hour power reserve, 17 jewels, 4 Hz.',
  options: 'Cases: brushed steel $1,850 (6 weeks), black DLC steel $2,150 (8 weeks), bronze $2,400 (10 weeks). Dials: silver and black included, field green and cream +$120. Straps: black rubber included, navy canvas +$60, olive nylon +$40, sand leather +$90.',
  reserve: 'A $300 deposit holds a build slot; deliveries in November, December and January.', currency: '$',
};
function scripted(answers) {
  const log = { prompts: [], feedback: [] }; let i = 0;
  return { log, factory: () => ({ name: 'scripted', usage: { calls: 0, input: 0, output: 0, cacheWrite: 0, cacheRead: 0 }, start(p) { log.prompts.push(p); }, feedback(t) { log.feedback.push(t); }, async next() { if (i >= answers.length) throw new Error('called more often than scripted'); return JSON.stringify(answers[i++]); } }) };
}
let srv, call;
test.before(async () => {
  srv = app.listen(0, '127.0.0.1'); await new Promise((r) => srv.on('listening', r));
  const base = `http://127.0.0.1:${srv.address().port}`; let cookie = '';
  call = async (method, p, body) => { const r = await fetch(base + p, { method, headers: { 'content-type': 'application/json', cookie }, body: body ? JSON.stringify(body) : undefined }); const sc = r.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0]; const text = await r.text(); let json = null; try { json = JSON.parse(text); } catch (e) { /* html */ } return { status: r.status, json, text }; };
  assert.equal((await call('POST', '/api/auth/signup', { email: 'jaydenflynn9@gmail.com', password: 'correct-horse-battery-staple' })).status, 200);
});
test.after(() => srv.close());
const settled = async (id) => { const t0 = Date.now(); for (;;) { const r = await call('GET', `/api/designs/sites/${id}`); if (r.json.site.status !== 'writing') return r.json.site; if (Date.now() - t0 > 10000) throw new Error('timed out'); await new Promise((ok) => setTimeout(ok, 30)); } };

test('every design asks whether the business is real or a concept', () => {
  for (const d of designSites.designs()) {
    const f = d.fields.find((x) => x.key === 'businessKind');
    assert.ok(f && f.type === 'choice' && f.options.map((o) => o[0]).join() === 'real,concept', d.design);
  }
});

test('a real business: proposed claims are reviewed, and go live only once the owner confirms them', async () => {
  const w = scripted([meridian()]);
  setDesignDeps({ writer: w.factory });
  const id = (await call('POST', '/api/designs/sites', { design: 'aldane', brief: { ...BRIEF, businessKind: 'real' } })).json.site.id;
  const site = await settled(id);
  assert.equal(site.status, 'built', JSON.stringify(site.attempts));

  // the writer was told this is a real business, what it may only propose, and what is already established
  const sys = w.log.prompts[0].system;
  assert.match(sys, /THIS BUSINESS/); assert.match(sys, /This is a REAL business/); assert.match(sys, /Industry: Watchmaker/);
  assert.match(sys, /offerings\.specs\.powerReserve = 42 \(confirmed\)/); assert.match(sys, /a metal bracelet is always drawn as links/);
  assert.doesNotMatch(sys, /footer\.fine says the site is a demo/);

  // the review: each item has a status; the material ones are marked
  const turns = site.confirm.find((c) => c.path === 'movement.turns');
  assert.deepEqual([turns.status, turns.material], ['proposed', true]);
  assert.ok(site.confirm.some((c) => c.path === 'specs.rows.1.mm' && c.status === 'proposed'), 'a thickness the brief contradicts is reviewed');
  assert.equal(site.reality.kind, 'real'); assert.equal(site.reality.industry, 'Watchmaker');
  assert.ok(site.reality.counts.confirmed > 10 && site.reality.counts.derived >= 1 && site.reality.counts.proposed >= 3, JSON.stringify(site.reality.counts));

  // publishing waits for the owner
  const held = await call('POST', `/api/designs/sites/${id}/publish`, { on: true });
  assert.equal(held.status, 409);
  assert.ok(held.json.blocking.some((b) => b.path === 'movement.turns'), JSON.stringify(held.json.blocking));
  assert.ok(!held.json.blocking.some((b) => b.path.startsWith('configure.cases')), 'the brief\'s prices are not held');
  const pub = await call('POST', `/api/designs/sites/${id}/publish`, { on: true, confirm: true });
  assert.equal(pub.status, 200, pub.text);
  assert.equal(pub.json.site.reality.confirmed.length, held.json.blocking.length);
  assert.ok(pub.json.site.reality.confirmed.every((c) => c.by.startsWith('account:') && c.at && c.text != null));
  assert.deepEqual(pub.json.site.reality.blocking, []);
  // confirmed once: unpublishing and publishing again needs nothing new
  await call('POST', `/api/designs/sites/${id}/publish`, { on: false });
  assert.equal((await call('POST', `/api/designs/sites/${id}/publish`, { on: true })).status, 200);
});

test('a concept business: must say on the page that it is a demonstration; its inventions are illustrative', async () => {
  const quiet = meridian(); quiet.footer.fine = '© Meridian Watch Co.';
  const w = scripted([quiet, meridian()]);
  setDesignDeps({ writer: w.factory });
  const id = (await call('POST', '/api/designs/sites', { design: 'aldane', brief: { ...BRIEF, businessKind: 'concept' } })).json.site.id;
  const site = await settled(id);
  assert.equal(site.status, 'built');
  assert.equal(site.attempts.length, 2, 'the first draft hid that it is a concept');
  assert.match(site.attempts[0].errors[0], /concept, so the page must say so/);
  assert.match(w.log.feedback[0], /made-up business for a concept site/);
  assert.match(w.log.prompts[0].system, /This is a CONCEPT business/);
  // a concept never shows "proposed": what it invented is illustrative; what follows from the brief stays derived or confirmed
  const st = site.confirm.filter((c) => c.status).map((c) => c.status);
  assert.ok(!st.includes('proposed') && st.filter((s) => s === 'illustrative').length >= 10, JSON.stringify(st));
  assert.ok(site.confirm.some((c) => c.status === 'derived' && /28,800/.test(c.value)), '28,800 vph is worked out from the brief\'s 4 Hz');
  assert.equal(site.reality.kind, 'concept');
  assert.equal((await call('POST', `/api/designs/sites/${id}/publish`, { on: true })).status, 200, 'nothing to confirm for a concept that says so');
});

test('Aldane draws a metal bracelet as links, in the case metal or its own', () => {
  const D = loadDesign(path.join(__dirname, '..', 'design-packages', 'design', 'aldane'));
  const c = meridian();
  c.configure.straps = [{ name: 'Steel bracelet', price: 0, kind: 'bracelet', colour: '#aeb5bd' }, { name: 'Black rubber', price: 0, colour: '#1b1c1f' }, { name: 'Navy canvas', price: 60 }, { name: 'Oyster bracelet', price: 300, kind: 'bracelet' }];
  assert.deepEqual(validate(D, c).errors, []);
  const html = build(D, c).html;
  assert.match(html, /<pattern id="pBracelet"/);
  assert.match(html, /:root:not\(\[data-strap\]\),:root\[data-strap="tan"\]\{--br-hi:#[0-9a-f]{6};--br-mid:#aeb5bd;--br-lo:#[0-9a-f]{6}\}/, 'a steel bracelet keeps its own metal');
  assert.match(html, /:root\[data-strap="oxblood"\]\{--br-hi:var\(--case-hi\);--br-mid:var\(--case-mid\);--br-lo:var\(--case-lo\)\}/, 'a bracelet without a colour follows the case');
  assert.match(html, /:root\[data-strap="tan"\] \.k-strap\{fill:url\(#pBracelet\)\}/); assert.match(html, /:root\[data-strap="tan"\] \.k-stitch\{display:none\}/);
  assert.match(html, /\$\{\/\\b\(bracelet\|strap\)\\b\/i\.test\(s\[1\]\) \? '' : ' strap'\}/, '"steel bracelet", never "bracelet strap"');
  assert.equal(html.split('--suede:').length - 1, 1, 'a strap without a colour (navy canvas, in the suede slot) keeps its drawn finish');
  c.configure.straps[0].kind = 'chain';
  assert.ok(validate(D, c).errors.some((e) => /straps\.0\.kind/.test(e)));
  // and nothing of it on a page without a bracelet
  const plain = build(D, meridian()).html;
  assert.doesNotMatch(plain, /pBracelet|--br-/);
});
