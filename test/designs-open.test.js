'use strict';
// THE NEW GENERATOR FOR CUSTOMERS (SITEREMADE_DESIGNS_OPEN=on; off in production until the owner switches it): any
// signed-in account may use it, paying pricing.ACTION_CREDITS.design_generation credits through the existing ledger --
// reserved before the writer starts, charged when the site is built, returned when it fails, refused (before any AI)
// when the account is short. The owner account is not charged. Scripted writers, no AI.
process.env.SITEREMADE_DB_PATH = ':memory:';
process.env.SITEREMADE_DESIGNS_OPEN = 'on';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { app, setDesignDeps, db } = require('../server.js');
const credits = require('../lib/credits');
const pricing = require('../lib/pricing');

const meridian = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'design-sites', 'meridian-38.json'), 'utf8'));
const BRIEF = { businessName: 'Meridian 38', brand: 'Meridian', watch: 'Hand-wound, 42-hour reserve.', options: 'Cases $1,850.', reserve: '$300 deposit.' };
let calls = 0;
function writer(fail) { return () => ({ name: 'scripted', usage: { calls: 0, input: 1200, output: 800, cacheWrite: 0, cacheRead: 0 }, start() {}, feedback() {}, async next() { calls++; if (fail) throw new Error('provider down'); return JSON.stringify(meridian); } }); }

test('a customer pays in credits: refused when short, charged when built, refunded when it fails', async () => {
  const srv = app.listen(0, '127.0.0.1'); await new Promise((r) => srv.on('listening', r));
  const base = `http://127.0.0.1:${srv.address().port}`; let cookie = '';
  const call = async (m, p, body) => { const r = await fetch(base + p, { method: m, headers: { 'content-type': 'application/json', cookie }, body: body ? JSON.stringify(body) : undefined }); const sc = r.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0]; const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch (e) { /* html */ } return { status: r.status, json: j, text: t }; };
  const settled = async (id) => { for (let i = 0; i < 200; i++) { const s = (await call('GET', `/api/designs/sites/${id}`)).json.site; if (s.status !== 'writing') return s; await new Promise((r) => setTimeout(r, 25)); } throw new Error('timed out'); };
  try {
    assert.equal((await call('POST', '/api/auth/signup', { email: 'customer@example.com', password: 'correct-horse-battery-staple' })).status, 200);
    const acct = db.accounts.findByEmail('customer@example.com').id;
    const list = (await call('GET', '/api/designs')).json;
    assert.equal(list.access.owner, false); assert.equal(list.access.cost, pricing.ACTION_CREDITS.design_generation);
    const have = () => credits.available(db, acct).total;

    // short of credits: refused before any writing
    await call('GET', '/api/credits'); // (the account's grants are applied on first use, as for any generation)
    const start = have();
    for (let i = 0; i < start; i++) credits.reserve(db, { accountId: acct, opId: 'drain:' + i, amount: 1, kind: 'test' });
    setDesignDeps({ writer: writer(false) }); calls = 0;
    const short = await call('POST', '/api/designs/sites', { design: 'aldane', brief: BRIEF });
    assert.equal(short.status, 402); assert.match(short.json.message, /uses 4 credits; you have 0/); assert.equal(calls, 0, 'no AI before the credits are there');
    for (let i = 0; i < start; i++) credits.release(db, 'drain:' + i, {});

    // enough: charged once the site is built
    credits.grant(db, { id: 'g_' + crypto.randomUUID(), accountId: acct, kind: 'admin', amount: 10, source: 'test' });
    const before = have();
    const ok = await call('POST', '/api/designs/sites', { design: 'aldane', brief: BRIEF });
    assert.equal(ok.status, 200);
    assert.equal((await settled(ok.json.site.id)).status, 'built');
    assert.equal(have(), before - 4, 'four credits for the website');

    // a failed generation gives them back
    setDesignDeps({ writer: writer(true) });
    const before2 = have();
    const bad = await call('POST', '/api/designs/sites', { design: 'aldane', brief: BRIEF });
    assert.equal((await settled(bad.json.site.id)).status, 'failed');
    assert.equal(have(), before2, 'refunded');
    // and the usage ledger has the generations
    const ops = db.usage.listForAccount ? db.usage.listForAccount(acct) : null;
    if (ops) assert.ok(ops.some((o) => o.operation === 'design_generation'));
  } finally { srv.close(); }
});
