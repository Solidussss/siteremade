'use strict';
// The premium-designs owner gate with its real cutoff: a builder account created NOW with the owner's email (a builder
// sign-up never verifies its email) must not get in -- it could be anyone claiming the address.
process.env.SITEREMADE_DB_PATH = ':memory:';
delete process.env.SITEREMADE_DESIGN_OWNER_CUTOFF;
const test = require('node:test');
const assert = require('node:assert/strict');
const { app } = require('../server.js');

test('a fresh sign-up with the owner email is refused', async () => {
  const srv = app.listen(0, '127.0.0.1'); await new Promise((r) => srv.on('listening', r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  try {
    const up = await fetch(base + '/api/auth/signup', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'jaydenflynn9@gmail.com', password: 'correct-horse-battery-staple' }) });
    assert.equal(up.status, 200);
    const cookie = up.headers.get('set-cookie').split(';')[0];
    const r = await fetch(base + '/api/designs', { headers: { cookie } });
    assert.equal(r.status, 403, 'an account created after the cutoff, without a verified identity, is not the owner');
    const s = await fetch(base + '/api/designs/sites', { method: 'POST', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify({ design: 'beadline', brief: {} }) });
    assert.equal(s.status, 403, 'and cannot spend AI money');
  } finally { srv.close(); }
});
