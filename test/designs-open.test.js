'use strict';
// THE STUDIO FOR CUSTOMERS (one product since 741ab51): any signed-in account builds sites free, up to
// SITEREMADE_DESIGNS_PER_DAY new ones a day; the next is refused before any writing starts. Scripted writers, no AI.
process.env.SITEREMADE_DB_PATH = ':memory:';
process.env.SITEREMADE_DESIGNS_PER_DAY = '2';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { app, setDesignDeps } = require('../server.js');

const meridian = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'design-sites', 'meridian-38.json'), 'utf8'));
const BRIEF = { businessName: 'Meridian 38', brand: 'Meridian', watch: 'Hand-wound, 42-hour reserve.', options: 'Cases $1,850.', reserve: '$300 deposit.' };
let calls = 0;
const writer = () => ({ name: 'scripted', usage: { calls: 0, input: 1200, output: 800, cacheWrite: 0, cacheRead: 0 }, start() {}, feedback() {}, async next() { calls++; return JSON.stringify(meridian); } });

test('a customer builds free sites up to the daily limit, then is told to come back tomorrow', async () => {
  const srv = app.listen(0, '127.0.0.1'); await new Promise((r) => srv.on('listening', r));
  const base = `http://127.0.0.1:${srv.address().port}`; let cookie = '';
  const call = async (m, p, body) => { const r = await fetch(base + p, { method: m, headers: { 'content-type': 'application/json', origin: base, cookie }, body: body ? JSON.stringify(body) : undefined }); const sc = r.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0]; const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch (e) { /* html */ } return { status: r.status, json: j, text: t }; };
  const settled = async (id) => { for (let i = 0; i < 200; i++) { const s = (await call('GET', `/api/designs/sites/${id}`)).json.site; if (s.status !== 'writing') return s; await new Promise((r) => setTimeout(r, 25)); } throw new Error('timed out'); };
  try {
    assert.equal((await call('POST', '/api/auth/signup', { email: 'customer@example.com', password: 'correct-horse-battery-staple' })).status, 200);
    const list = (await call('GET', '/api/designs')).json;
    assert.deepEqual(list.access, { owner: false, free: true, perDay: 2 });
    setDesignDeps({ writer });
    for (let i = 0; i < 2; i++) {
      const ok = await call('POST', '/api/designs/sites', { design: 'aldane', brief: BRIEF });
      assert.equal(ok.status, 200, ok.text.slice(0, 200));
      assert.equal((await settled(ok.json.site.id)).status, 'built');
    }
    calls = 0;
    const third = await call('POST', '/api/designs/sites', { design: 'aldane', brief: BRIEF });
    assert.equal(third.status, 429); assert.match(third.json.message, /2 new websites today, the daily limit/);
    assert.equal(calls, 0, 'no writing once the limit is reached');
    assert.equal((await call('GET', '/api/designs')).json.sites.length, 2);
  } finally { srv.close(); }
});
