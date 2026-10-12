'use strict';
// The owner check with its real cutoff: a builder account created NOW with the owner's email (a builder sign-up never
// verifies its email) must not be treated as the owner -- it could be anyone claiming the address. It gets the studio
// like any customer: free sites, under the daily cap, never the owner's unlimited ones.
process.env.SITEREMADE_DB_PATH = ':memory:';
delete process.env.SITEREMADE_DESIGN_OWNER_CUTOFF;
const test = require('node:test');
const assert = require('node:assert/strict');
const { app } = require('../server.js');

test('a fresh sign-up with the owner email is a customer, not the owner', async () => {
  const srv = app.listen(0, '127.0.0.1'); await new Promise((r) => srv.on('listening', r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  try {
    const up = await fetch(base + '/api/auth/signup', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'jaydenflynn9@gmail.com', password: 'correct-horse-battery-staple' }) });
    assert.equal(up.status, 200);
    const cookie = up.headers.get('set-cookie').split(';')[0];
    const r = await fetch(base + '/api/designs', { headers: { cookie } });
    assert.equal(r.status, 200);
    const j = await r.json();
    assert.equal(j.access.owner, false, 'an account created after the cutoff, without a verified identity, is not the owner');
    assert.equal(j.access.perDay, 5, 'so the daily cap applies to it');
  } finally { srv.close(); }
});
