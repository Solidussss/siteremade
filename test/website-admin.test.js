'use strict';
// WEBSITE REMOVAL (lib/website-admin.js, migrations/0013_project_removal.sql, server.js /api/app-bridge/admin/websites*):
// exactly one account -- jaydenflynn9@gmail.com, by its Supabase-verified, confirmed email -- may remove websites from
// SiteRemade, any account's, drafts and purchased. A soft delete: the website leaves every account, while its purchase,
// payments, credit ledger and stored files stay. The real server; Supabase and Stripe are the test harness's mocks.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const WA = require('../lib/website-admin');
const { startServer, client, providerCalls } = require('./helpers/server-process');
const { threeDEnv, creativePage } = require('./helpers/three-d-scenario');
const { resetSqliteAdapter } = require('../lib/adapters/sqlite-database-adapter');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'sr-website-admin-'));
const TOKENS = { owner: 'test-access-token-owner', other: 'test-access-token-other', admin: 'test-access-token-admin', unconfirmed: 'test-access-token-admin-unconfirmed', lookalike: 'test-access-token-admin-lookalike' };
const tiny = id => ({ mode: 'creative', meta: { id }, pages: [{ id: 'creative', label: 'Creative page', sections: [] }], creative: { brief: 'a page ' + id, assets: [], plan: null } });

test('WA-1. the rule: the one admin email, Supabase-verified and confirmed -- never a role, never a look-alike, never an unconfirmed address', () => {
  assert.deepEqual([...WA.WEBSITE_ADMIN_EMAILS], ['jaydenflynn9@gmail.com']);
  assert.equal(WA.isWebsiteAdmin({ email: 'jaydenflynn9@gmail.com', emailConfirmed: true }), true);
  assert.equal(WA.isWebsiteAdmin({ email: ' JaydenFlynn9@Gmail.com ', emailConfirmed: true }), true, 'email case does not matter');
  for (const id of [{ email: 'jaydenflynn9@gmail.com', emailConfirmed: false }, { email: 'jaydenflynn9@gmail.com' }, { email: 'jaydenflynn9@gmail.com.example.com', emailConfirmed: true }, { email: 'x+jaydenflynn9@gmail.com', emailConfirmed: true },
    { email: 'admin@siteremade.com', emailConfirmed: true, role: 'owner' }, { role: 'owner', emailConfirmed: true }, null, {}]) assert.equal(WA.isWebsiteAdmin(id), false, JSON.stringify(id));
});

test('WA-2. the admin removes ANY account\'s website, draft or purchased; no one else can, however the request is made; the website leaves its account everywhere while its purchase, payments and ledger stay; a second removal changes nothing', async () => {
  const dir = fs.mkdtempSync(path.join(TMP, 'srv-')); const env = threeDEnv(dir); const srv = await startServer(env);
  const ids = {}; let ownerAccount; let ledgerBefore;
  const bridge = async (who, method, url) => { const r = await fetch(`http://127.0.0.1:${srv.port}${url}`, { method, headers: { authorization: `Bearer ${TOKENS[who]}` } }); return { status: r.status, body: await r.json().catch(() => null), buf: null }; };
  try {
    // everyone signs in once (so their identity is linked to a builder account)
    // (the admin's address on a second, UNCONFIRMED identity cannot even link: the identity bridge refuses a second user
    // claiming an email already linked -- 409 -- so its requests stop at identity_not_linked; it is checked below all the same)
    const call = {}; for (const who of Object.keys(TOKENS)) { call[who] = client(srv.port); const si = await call[who]('POST', '/api/identity/supabase/session', { supabaseAccessToken: TOKENS[who] }); assert.equal(si.status, who === 'unconfirmed' ? 409 : 200, who); }
    // the owner: a PURCHASED page (A) and a draft (B); another account: a draft (C)
    ids.A = (await call.owner('POST', '/api/projects', { name: 'Aurelia (bought)', directionsState: { directions: [creativePage()], activeDirectionIndex: 0 } })).body.project.id;
    ids.B = (await call.owner('POST', '/api/projects', { name: 'Draft B', directionsState: { directions: [tiny('b')], activeDirectionIndex: 0 } })).body.project.id;
    ids.C = (await call.other('POST', '/api/projects', { name: 'Someone else C', directionsState: { directions: [tiny('c')], activeDirectionIndex: 0 } })).body.project.id;
    await call.owner('POST', '/api/checkout', { projectId: ids.A, businessName: 'Aurelia' });
    const asked = providerCalls(env.MOCK_CALL_LOG).filter(x => x.provider === 'stripe' && x.endpoint === 'checkout' && x.projectId === ids.A).pop(); assert.ok(asked);
    const hook = JSON.stringify({ id: 'evt_' + asked.session, type: 'checkout.session.completed', data: { object: { id: asked.session, payment_status: 'paid', amount_total: asked.amount, currency: 'cad' } } });
    const t = Math.floor(Date.now() / 1000); const sig = crypto.createHmac('sha256', env.STRIPE_WEBHOOK_SECRET).update(`${t}.${hook}`).digest('hex');
    assert.equal((await fetch(`http://127.0.0.1:${srv.port}/api/stripe/webhook`, { method: 'POST', headers: { 'content-type': 'application/json', 'stripe-signature': `t=${t},v1=${sig}` }, body: hook })).status, 200);
    const mine = (await bridge('owner', 'GET', '/api/app-bridge/websites')).body.websites; assert.deepEqual(mine.map(w => w.projectId).sort(), [ids.A, ids.B].sort()); assert.equal(mine.find(w => w.projectId === ids.A).isPurchased, true);
    ownerAccount = (await call.owner('GET', '/api/auth/me')).body.account.id;
    { const db = resetSqliteAdapter(env.SITEREMADE_DB_PATH); ledgerBefore = { grants: db.ledger.grantsForAccount(ownerAccount).length, ops: db.ledger.opsForAccount(ownerAccount).length }; }

    // ---- nobody but the admin: not the website's owner, not another account, not the admin's address unconfirmed, not a look-alike
    for (const who of ['owner', 'other', 'unconfirmed', 'lookalike']) {
      const refused = who === 'unconfirmed' ? [404, 'identity_not_linked'] : [403, 'forbidden'];
      const list = await bridge(who, 'GET', '/api/app-bridge/admin/websites'); assert.deepEqual([list.status, list.body.error.code], refused, `${who}: list`);
      for (const id of [ids.A, ids.B, ids.C]) { const r = await bridge(who, 'POST', `/api/app-bridge/admin/websites/${id}/remove`); assert.deepEqual([r.status, r.body.error.code], refused, `${who}: remove ${id}`); }
    }
    // (and no bearer at all, or a made-up one)
    assert.equal((await fetch(`http://127.0.0.1:${srv.port}/api/app-bridge/admin/websites/${ids.A}/remove`, { method: 'POST' })).status, 401);
    assert.deepEqual((await bridge('owner', 'GET', '/api/app-bridge/websites')).body.websites.map(w => w.projectId).sort(), [ids.A, ids.B].sort(), 'nothing was removed by any of that');

    // ---- the admin sees every account's websites
    const all = await bridge('admin', 'GET', '/api/app-bridge/admin/websites'); assert.equal(all.status, 200);
    const byId = Object.fromEntries(all.body.websites.map(w => [w.projectId, w]));
    assert.ok(byId[ids.A] && byId[ids.B] && byId[ids.C]); assert.deepEqual([byId[ids.A].isPurchased, byId[ids.A].ownerEmail, byId[ids.C].ownerEmail], [true, 'bridge-test@example.com', 'other-owner@example.com']);
    // ---- removes the PURCHASED one
    const rm = await bridge('admin', 'POST', `/api/app-bridge/admin/websites/${ids.A}/remove`);
    assert.equal(rm.status, 200); assert.deepEqual([rm.body.removed, rm.body.alreadyRemoved, rm.body.status], [true, false, 'purchased']);
    const again = await bridge('admin', 'POST', `/api/app-bridge/admin/websites/${ids.A}/remove`);
    assert.deepEqual([again.status, again.body.alreadyRemoved, again.body.removedAt], [200, true, rm.body.removedAt], 'a second removal is safe and changes nothing');
    assert.equal((await bridge('admin', 'POST', '/api/app-bridge/admin/websites/proj_doesnotexist00/remove')).status, 404);
    // ...and another account's draft
    assert.equal((await bridge('admin', 'POST', `/api/app-bridge/admin/websites/${ids.C}/remove`)).status, 200);

    // ---- gone from its account everywhere: Saved Websites, the Website view, preview, download, the builder's own list,
    // reopen and save; the owner's OTHER website is untouched
    assert.deepEqual((await bridge('owner', 'GET', '/api/app-bridge/websites')).body.websites.map(w => w.projectId), [ids.B]);
    for (const url of [`/api/app-bridge/website/${ids.A}`, `/api/app-bridge/website/${ids.A}/preview`]) assert.equal((await bridge('owner', 'GET', url)).status, 404, url);
    assert.notEqual((await bridge('owner', 'GET', `/api/app-bridge/website/${ids.A}/download`)).status, 200);
    const canonical = await bridge('owner', 'GET', '/api/app-bridge/website'); assert.notEqual(canonical.body && canonical.body.projectId, ids.A, 'never the removed website as the default');
    const listed = (await call.owner('GET', '/api/projects')).body; assert.ok(!JSON.stringify(listed).includes(ids.A)); assert.ok(JSON.stringify(listed).includes(ids.B));
    assert.equal((await call.owner('GET', `/api/projects/${ids.A}`)).status, 404);
    const p = await call.owner('PUT', `/api/projects/${ids.A}`, { name: 'x', expectedRevision: 1, directionsState: { directions: [tiny('a')], activeDirectionIndex: 0 } }); assert.notEqual(p.status, 200, 'a stale tab cannot save a removed website');
    assert.equal((await call.owner('GET', `/api/projects/${ids.B}`)).status, 200, 'the other website is untouched');
    assert.deepEqual((await bridge('other', 'GET', '/api/app-bridge/websites')).body.websites.map(w => w.projectId), [], 'the other account\'s removed draft is gone too');
    assert.ok(!(await bridge('admin', 'GET', '/api/app-bridge/admin/websites')).body.websites.some(w => w.projectId === ids.A || w.projectId === ids.C));
  } finally { await srv.stop(); }

  // ---- what stays: the project row (still purchased), its purchase snapshot, its payment, the credit ledger
  const db = resetSqliteAdapter(env.SITEREMADE_DB_PATH);
  const row = db.projects.findById(ids.A);
  assert.deepEqual([row.status, !!row.removed_at, row.removed_by], ['purchased', true, '00000000-0000-4000-8000-000000000007'], 'removed, by the admin; still a purchased project in the records');
  assert.ok(db.purchaseSnapshots.findByProject(ids.A), 'the purchase snapshot is kept');
  assert.ok(row.purchase_ref, 'and the purchase reference');
  assert.deepEqual({ grants: db.ledger.grantsForAccount(ownerAccount).length, ops: db.ledger.opsForAccount(ownerAccount).length }, ledgerBefore, 'the credit ledger is untouched');
  assert.equal(db.projects.findById(ids.B).removed_at, null);
});
