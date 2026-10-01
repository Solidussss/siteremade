'use strict';
// GET /api/app-bridge/websites -- every website saved to the account (drafts AND purchased, Business AND Creative) for
// the Client App, on the REAL server.js (test/helpers/run-server.js stubs only Claude, OpenAI, Supabase and Stripe).
// Before this route the app only ever saw purchased websites (GET /api/my-websites and the candidates route are built
// from purchase snapshots), so a project saved to the account as a draft never appeared there.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { startServer, client, providerCalls } = require('./helpers/server-process');
const { loadClient, premiumProviderStatus, buildProject } = require('./helpers/load-client');

const WEBHOOK_SECRET = 'whsec_saved_websites_test';
const OWNER = { authorization: 'Bearer test-access-token-owner' };
const OTHER = { authorization: 'Bearer test-access-token-other' };

function business(text) {
  const c = loadClient();
  return JSON.parse(JSON.stringify(buildProject(c, text, { providerStatus: premiumProviderStatus() }).proj));
}
function creative() {
  const { understandBrief } = require('../lib/creative/understand');
  const { direct } = require('../lib/creative/director');
  const u = understandBrief('A website about toilet paper');
  const plan = direct({ understanding: u, research: { page: { title: 'Toilet paper', url: 'https://en.wikipedia.org/wiki/Toilet_paper', description: 'x', extract: 'Toilet paper is a tissue paper product.', category: 'object', retrieved: '2026-09-28' }, facts: [{ id: 'f1', text: 'Toilet paper is a tissue paper product used for cleaning.', section: 'Overview' }] }, assets: [] });
  return { mode: 'creative', meta: { id: 'c_' + crypto.randomBytes(4).toString('hex') }, pages: [{ id: 'creative', label: 'Creative page', sections: [] }], creative: { brief: 'A website about toilet paper', understanding: u, assets: [], plan } };
}

let ctx = null;
async function setup() {
  if (ctx) return ctx;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sr-saved-websites-'));
  const env = {
    SITEREMADE_BACKEND: 'local', SITEREMADE_DB_PATH: path.join(dir, 'app.db'), SITEREMADE_ASSET_STORE_DIR: path.join(dir, 'assets'),
    SITEREMADE_PREMIUM_LOG_DIR: path.join(dir, 'premium'), SITEREMADE_EXPORTS_DIR: path.join(dir, 'exports'),
    ANTHROPIC_API_KEY: 'test-only', SITEREMADE_APP_BRIDGE_ENABLED: 'true', SITEREMADE_IDENTITY_BRIDGE_MODE: 'full',
    SUPABASE_URL: 'https://supabase.test', SUPABASE_ANON_KEY: 'test-anon-key', SUPABASE_PUBLISHABLE_KEY: '',
    STRIPE_SECRET_KEY: 'sk_test_mock_only', STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET, SITEREMADE_TRIAL_CREDITS: '20',
    MOCK_CALL_LOG: path.join(dir, 'provider-calls.log'), NODE_ENV: 'test',
  };
  const server = await startServer(env);
  const owner = client(server.port), other = client(server.port);
  assert.equal((await owner('POST', '/api/identity/supabase/session', { supabaseAccessToken: 'test-access-token-owner' })).status, 200);
  assert.equal((await other('POST', '/api/identity/supabase/session', { supabaseAccessToken: 'test-access-token-other' })).status, 200);
  const create = async (call, name, direction) => {
    const r = await call('POST', '/api/projects', { name, directionsState: { directions: [direction], activeDirectionIndex: 0 } });
    assert.ok(r.status === 201 || r.status === 200, JSON.stringify(r.body).slice(0, 200));
    return r.body.project;
  };
  const buy = async projectId => {
    await owner('POST', '/api/checkout', { projectId, businessName: 'Owned' });
    const asked = providerCalls(env.MOCK_CALL_LOG).filter(x => x.provider === 'stripe' && x.endpoint === 'checkout' && x.projectId === projectId).pop(); const session = asked.session; // (pays exactly what checkout asked: Business 14999, Creative 49999)
    const body = JSON.stringify({ id: 'evt_' + session, type: 'checkout.session.completed', data: { object: { id: session, payment_status: 'paid', amount_total: asked.amount, currency: 'cad' } } });
    const t = Math.floor(Date.now() / 1000); const sig = crypto.createHmac('sha256', WEBHOOK_SECRET).update(`${t}.${body}`).digest('hex');
    const r = await fetch(`http://127.0.0.1:${server.port}/api/stripe/webhook`, { method: 'POST', headers: { 'content-type': 'application/json', 'stripe-signature': `t=${t},v1=${sig}` }, body });
    assert.equal(r.status, 200);
  };
  const tick = () => new Promise(r => setTimeout(r, 15)); // distinct updated_at timestamps
  // four websites, oldest first: a purchased Business, a purchased Creative, a Business draft, a Creative draft
  const ownedBiz = await create(owner, 'Summit Roofing', business('Summit Roofing repairs and replaces residential roofs in Calgary, with free inspections.')); await buy(ownedBiz.id); await tick();
  const ownedCreative = await create(owner, 'Toilet paper page', creative()); await buy(ownedCreative.id); await tick();
  const draftBiz = await create(owner, 'Petal & Stem', business('Petal & Stem is a florist in Portland making wedding flowers, bouquets and same-day delivery.')); await tick();
  const draftCreative = await create(owner, 'A page about kayaks', creative()); await tick();
  const archived = await create(owner, 'Thrown away', business('Ledgerline is a bookkeeping and tax firm for small businesses in Toronto.'));
  assert.equal((await owner('DELETE', `/api/projects/${archived.id}`)).status, 200);
  const stranger = await create(other, 'Someone else\'s site', business('Blue Heron Kayak Tours runs guided sea kayaking trips around the San Juan Islands.'));
  const list = async (headers = OWNER) => owner('GET', '/api/app-bridge/websites', undefined, headers);
  ctx = { server, env, dir, owner, other, list, ids: { ownedBiz: ownedBiz.id, ownedCreative: ownedCreative.id, draftBiz: draftBiz.id, draftCreative: draftCreative.id, archived: archived.id, stranger: stranger.id } };
  return ctx;
}
test.after(async () => { if (ctx) { await ctx.server.stop(); fs.rmSync(ctx.dir, { recursive: true, force: true }); } });
const byId = (websites, id) => websites.find(w => w.projectId === id);

test('1/2/7. every saved website appears -- Business and Creative drafts included -- but not archived ones', async () => {
  const { list, ids } = await setup();
  const r = await list();
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const ws = r.body.websites;
  for (const k of ['ownedBiz', 'ownedCreative', 'draftBiz', 'draftCreative']) assert.ok(byId(ws, ids[k]), `${k} listed`);
  assert.ok(!byId(ws, ids.archived), 'an archived draft is not listed');
  const draft = byId(ws, ids.draftBiz);
  assert.equal(draft.mode, 'business'); assert.equal(draft.status, 'draft'); assert.equal(draft.name, 'Petal & Stem'); assert.equal(draft.businessName, 'Petal & Stem');
  assert.equal(byId(ws, ids.draftCreative).mode, 'creative', 'from the stored schema, not the name');
  assert.equal(byId(ws, ids.draftCreative).status, 'draft');
});

test('3/4/5. purchased websites carry their ownership; drafts carry none and have no purchase snapshot', async () => {
  const { list, ids, owner } = await setup();
  const ws = (await list()).body.websites;
  for (const [k, mode] of [['ownedBiz', 'business'], ['ownedCreative', 'creative']]) {
    const w = byId(ws, ids[k]);
    assert.equal(w.mode, mode); assert.equal(w.status, 'purchased'); assert.equal(w.isPurchased, true); assert.equal(w.hasPurchaseSnapshot, true);
    assert.ok(w.purchaseRef, 'purchase reference'); assert.ok(w.purchasedAt); assert.equal(w.purchasedRevision, w.revision);
    assert.equal(w.canPublish, true); assert.equal(w.hasUnpublishedChanges, false);
  }
  for (const k of ['draftBiz', 'draftCreative']) {
    const w = byId(ws, ids[k]);
    assert.equal(w.isPurchased, false); assert.equal(w.hasPurchaseSnapshot, false); assert.equal(w.purchaseRef, null); assert.equal(w.purchasedAt, null);
    assert.equal(w.purchasedRevision, null); assert.equal(w.canPublish, false); assert.equal(w.hasUnpublishedChanges, false);
    const snap = await owner('GET', `/api/projects/${ids[k]}/purchase-snapshot`);
    assert.equal(snap.status, 404, 'no purchase snapshot for a draft'); assert.match(snap.body.message, /not been purchased/);
  }
  // GET /api/my-websites (the builder's Owned websites) is still purchases only
  const mine = (await owner('GET', '/api/my-websites')).body.websites.map(w => w.projectId).sort();
  assert.deepEqual(mine, [ids.ownedBiz, ids.ownedCreative].sort());
});

test('6. a draft cannot use the purchased-only download (or the purchased preview); its own draft preview works', async () => {
  const { server, ids } = await setup();
  const get = url => fetch(`http://127.0.0.1:${server.port}${url}`, { headers: OWNER });
  const dl = await get(`/api/app-bridge/website/${ids.draftBiz}/download`);
  assert.equal(dl.status, 403); assert.equal((await dl.json()).error.code, 'not_purchased');
  assert.equal((await get(`/api/app-bridge/website/${ids.draftBiz}/preview`)).status, 404, 'the purchased preview is only for purchased websites');
  const draftPreview = await get(`/api/app-bridge/website/${ids.draftBiz}/preview?source=draft`);
  assert.equal(draftPreview.status, 200); assert.equal(draftPreview.headers.get('x-siteremade-preview'), 'draft');
  assert.match(await draftPreview.text(), /Petal &amp; Stem|PETAL &amp; STEM/);
  assert.equal((await get(`/api/app-bridge/website/${ids.ownedBiz}/download`)).status, 200, 'a purchased website still downloads');
});

test('8. most recently updated first -- an edit moves a website to the top', async () => {
  const { list, ids, owner } = await setup();
  let ws = (await list()).body.websites;
  const times = ws.map(w => w.updatedAt);
  assert.deepEqual(times, times.slice().sort().reverse(), 'sorted newest first');
  assert.equal(ws[0].projectId, ids.draftCreative);
  const p = (await owner('GET', `/api/projects/${ids.ownedBiz}`)).body.project;
  await new Promise(r => setTimeout(r, 15));
  assert.equal((await owner('PUT', `/api/projects/${ids.ownedBiz}`, { directionsState: p.directionsState, expectedRevision: p.revision })).status, 200);
  ws = (await list()).body.websites;
  assert.equal(ws[0].projectId, ids.ownedBiz);
  assert.equal(ws[0].hasUnpublishedChanges, true, 'an edited purchased website has unpublished changes');
  assert.equal(ws[0].purchasedRevision, p.revision, 'the purchase snapshot still says what was bought');
});

test('9. an account never sees another account\'s websites', async () => {
  const { list, ids } = await setup();
  const mine = (await list()).body.websites.map(w => w.projectId);
  const theirs = (await list(OTHER)).body.websites.map(w => w.projectId);
  assert.ok(!mine.includes(ids.stranger));
  assert.deepEqual(theirs, [ids.stranger]);
  const unauth = await fetch(`http://127.0.0.1:${ctx.server.port}/api/app-bridge/websites`);
  assert.equal(unauth.status, 401);
});

test('metadata only: no saved state, no pictures, only the fields the app uses', async () => {
  const { list } = await setup();
  const r = await list();
  const json = JSON.stringify(r.body);
  assert.ok(!/directionsState|state_json|dataUrl|assetRef|data:image/.test(json));
  const keys = Object.keys(r.body.websites[0]).sort();
  assert.deepEqual(keys, ['businessName', 'canEdit', 'canPublish', 'createdAt', 'hasPurchaseSnapshot', 'hasUnpublishedChanges', 'isPurchased', 'mode', 'name', 'projectId', 'purchaseRef', 'purchasedAt', 'purchasedRevision', 'revision', 'status', 'updatedAt'].sort());
});
