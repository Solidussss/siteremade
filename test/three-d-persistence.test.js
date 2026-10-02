'use strict';
// TRUE 3D PERSISTENCE: generate -> see it -> save -> close -> reopen -> still there -> app preview -> purchased version ->
// ZIP. The bug this holds: a delivered model was saved INLINE (base64) inside the project, so a real-sized model (up to
// 8 MB is allowed) plus the page's pictures pushed the save past the 14 MB per-direction limit of the project store
// (MAX_DIRECTION_JSON_BYTES, measured before files are moved to the asset store) and the WHOLE save was refused. The
// account kept the revision from before the model existed, so reopen, the app, the purchase and the export had no 3D --
// while the studio's live preview, drawn from memory, still showed it.
// The fix: the saved project references the GLB the 3D job already stored (assetRef), never its bytes.
//
// REAL PROVIDER SPEND: $0. Tripo is test/helpers/mock-tripo.js (mode "large": a valid ~6 MB model); every other paid
// provider is refused by the test server (test/helpers/run-server.js).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'sr-3d-persist-'));
process.env.SITEREMADE_BACKEND = 'local'; process.env.SITEREMADE_ASSET_STORE_DIR = path.join(TMP, 'asset-store-inproc');

const TD = require('../lib/creative/three-d');
const GLB = require('../lib/three-d/glb');
const projectStore = require('../lib/project-store');
const purchase = require('../lib/purchase');
const D2 = require('../lib/creative/director2');
const { validatePlan2 } = require('../lib/creative/validate2');
const { getAssetStore } = require('../lib/adapters/asset-store');
const { resetSqliteAdapter } = require('../lib/adapters/sqlite-database-adapter');
const { startServer, providerCalls } = require('./helpers/server-process');
const { createFakeTripo } = require('./helpers/mock-tripo');
const { readZip } = require('./helpers/showcase-purchase');

const KEY = 'tsk_TESTONLYnotarealkey0123456789abcdef'; // (not a key: nothing answers it but the fake)
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const LARGE = createFakeTripo({}).models().large; // the model the fake delivers in mode "large"

// ---- a Creative page with photo-sized pictures (noise does not compress, as photos mostly do not; ~3 MB each)
function photo(w, h) {
  const T = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; T[n] = c >>> 0; }
  const crc = b => { let c = 0xffffffff; for (const x of b) c = T[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
  const ih = Buffer.alloc(13); ih.writeUInt32BE(w, 0); ih.writeUInt32BE(h, 4); ih[8] = 8; ih[9] = 2;
  const raw = crypto.randomBytes((w * 3 + 1) * h); for (let y = 0; y < h; y++) raw[y * (w * 3 + 1)] = 0;
  return 'data:image/png;base64,' + Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ih), chunk('IDAT', zlib.deflateSync(raw, { level: 1 })), chunk('IEND', Buffer.alloc(0))]).toString('base64');
}
const W = 900, H = 1125;
const assess = extra => Object.assign({ width: W, height: H, aspect: 0.8, orientation: 'portrait', subject: [0.15, 0.07, 0.85, 0.93], colours: ['#1a528c', '#d49e38'], luminance: 130, background: { colour: '#f1ece2', uniformity: 0.95, tolerance: 12 }, transparent: false, transparentShare: 0, megapixels: 1.01 }, extra || {});
const ASSETS = [
  { id: 'u-bottle', origin: 'upload', title: 'Aurelia tonic', alt: 'A bottle of Aurelia tonic', mime: 'image/png', dataUrl: photo(W, H), assess: assess(), caps: { moveFreely: false, frame: true, backdrop: false, heroSize: true, lowRes: false }, curation: { role: 'subject', identity: 'exact', depicts: 'the bottle', issues: [], separable: true, quality: 3, framing: 'whole' } },
  { id: 'c-bottle', origin: 'derived', cutout: true, cutoutOf: 'u-bottle', title: 'Aurelia tonic', alt: 'A bottle of Aurelia tonic', mime: 'image/png', dataUrl: photo(W, H), processing: 'background removed', assess: assess({ transparent: true, transparentShare: 0.5, background: undefined }), caps: { moveFreely: true, frame: false, backdrop: false, heroSize: true, lowRes: false } },
];
const UND = { kind: 'invented', subject: 'Aurelia Tonic', brief: 'a launch page for Aurelia, a small-batch tonic in a blue glass bottle', tone: { register: 'cinematic' }, identity: { name: 'Aurelia Tonic', kind: 'invented', what: 'a small-batch tonic drink product in a blue glass bottle' } };
const PLAN = (() => { const d = D2.direct({ understanding: UND, research: { page: null, facts: [] }, assets: ASSETS, supplied: { facts: ['Aurelia is bottled in small batches.'], memories: [] }, seed: '1', prefer: { family: 'object-story', mode: 'expressive' } }); return validatePlan2(d.plan, { assets: ASSETS, facts: [], understanding: UND, page: null, art: d.recipe }).plan; })();
const creativeDirection = threeD => ({ mode: 'creative', meta: { id: 'c3d-persist' }, pages: [{ id: 'creative', label: 'Creative page', sections: [] }],
  creative: Object.assign({ v: 1, brief: UND.brief, understanding: UND, supplied: { facts: ['Aurelia is bottled in small batches.'], memories: [] }, research: { status: 'none', page: null, facts: [] }, assets: ASSETS, plan: PLAN, motion: { intensity: 'lively' }, cost: {} }, threeD ? { threeD } : {}) });
// what the studio saves (creative.js tdForSave): a model the server stores goes by its reference, never as bytes
const studioSave = block => Object.assign({}, block, { assets: block.assets.map(a => { if (!a.assetRef || !a.dataUrl) return a; const o = Object.assign({}, a); delete o.dataUrl; return o; }) });

// ---- the server (Tripo mocked), a browser-like session, the bridge (the Client App's bearer token)
function envFor(dir, extra) {
  return Object.assign({ SITEREMADE_BACKEND: 'local', NODE_ENV: 'test', ANTHROPIC_API_KEY: 'test-only', OPENAI_API_KEY: '', HIGGSFIELD_API_KEY: 'hf-test-key:secret',
    SITEREMADE_DB_PATH: path.join(dir, 'app.db'), SITEREMADE_ASSET_STORE_DIR: path.join(dir, 'assets'), SITEREMADE_EXPORTS_DIR: path.join(dir, 'exports'), SITEREMADE_PREMIUM_LOG_DIR: path.join(dir, 'premium'), MOCK_CALL_LOG: path.join(dir, 'provider-calls.log'),
    SITEREMADE_APP_BRIDGE_ENABLED: 'true', SITEREMADE_IDENTITY_BRIDGE_MODE: 'full', SUPABASE_URL: 'https://supabase.test', SUPABASE_ANON_KEY: 'test-anon-key', SUPABASE_PUBLISHABLE_KEY: '',
    STRIPE_SECRET_KEY: 'sk_test_mock_only', STRIPE_WEBHOOK_SECRET: 'whsec_3d_persist_test', SITEREMADE_TRIAL_CREDITS: '60',
    CREATIVE_3D: 'on', THREE_D_PROVIDER: 'tripo', TRIPO_API_KEY: KEY, SITEREMADE_3D_PROVIDER_USD: '0.50', PUBLIC_BASE_URL: 'https://www.siteremade.com', MOCK_TRIPO: 'large', MOCK_TRIPO_MS: '0' }, extra || {});
}
function session(port) {
  const jar = new Map(); const cookie = () => [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
  const call = async (method, url, body) => {
    const res = await fetch(`http://127.0.0.1:${port}${url}`, { method, headers: Object.assign({ 'content-type': 'application/json' }, jar.size ? { cookie: cookie() } : {}), body: body ? JSON.stringify(body) : undefined });
    (res.headers.getSetCookie ? res.headers.getSetCookie() : []).forEach(c => { const [pair] = c.split(';'); const i = pair.indexOf('='); jar.set(pair.slice(0, i).trim(), pair.slice(i + 1)); });
    return { status: res.status, body: await res.json().catch(() => null) };
  };
  const raw = async url => { const res = await fetch(`http://127.0.0.1:${port}${url}`, { headers: jar.size ? { cookie: cookie() } : {} }); return { status: res.status, buf: Buffer.from(await res.arrayBuffer()) }; };
  return { call, raw };
}
const signIn = async s => assert.equal((await s.call('POST', '/api/identity/supabase/session', { supabaseAccessToken: 'test-access-token-owner' })).status, 200);
const bridge = async (port, url) => { const r = await fetch(`http://127.0.0.1:${port}${url}`, { headers: { authorization: 'Bearer test-access-token-owner' } }); return { status: r.status, headers: r.headers, buf: Buffer.from(await r.arrayBuffer()) }; };
async function follow(s, jobId) { for (let i = 0; i < 400; i++) { const r = await s.call('GET', `/api/creative/premium/status/${jobId}`); if (r.body.job.terminal) return r.body; await sleep(40); } throw new Error('the 3D job did not finish'); }
async function put(s, id, mutate) {
  const p = (await s.call('GET', `/api/projects/${id}`)).body.project; const next = JSON.parse(JSON.stringify(p.directionsState)); mutate(next.directions[0].creative);
  const body = { name: p.name, expectedRevision: p.revision, directionsState: next };
  const r = await s.call('PUT', `/api/projects/${id}`, body); return Object.assign(r, { bytes: Buffer.byteLength(JSON.stringify(body)) });
}
async function purchased(s, port, env, projectId) {
  await s.call('POST', '/api/checkout', { projectId, businessName: 'Aurelia' });
  const asked = providerCalls(env.MOCK_CALL_LOG).filter(x => x.provider === 'stripe' && x.endpoint === 'checkout' && x.projectId === projectId).pop(); assert.ok(asked, 'checkout asked the (mocked) Stripe');
  const body = JSON.stringify({ id: 'evt_' + asked.session, type: 'checkout.session.completed', data: { object: { id: asked.session, payment_status: 'paid', amount_total: asked.amount, currency: 'cad' } } });
  const t = Math.floor(Date.now() / 1000); const sig = crypto.createHmac('sha256', env.STRIPE_WEBHOOK_SECRET).update(`${t}.${body}`).digest('hex');
  assert.equal((await fetch(`http://127.0.0.1:${port}/api/stripe/webhook`, { method: 'POST', headers: { 'content-type': 'application/json', 'stripe-signature': `t=${t},v1=${sig}` }, body })).status, 200);
}
const pageData = html => JSON.parse(html.match(/<script type="application\/json" id="cr-3d">([\s\S]*?)<\/script>/)[1]);
const tripoSubmits = env => providerCalls(env.MOCK_CALL_LOG).filter(c => c.provider === 'tripo' && c.endpoint === 'submit').length;
const otherPaid = env => providerCalls(env.MOCK_CALL_LOG).filter(c => ['anthropic', 'openai', 'higgsfield', 'serpapi'].includes(c.provider));
// a model in a handed-off website: the GLB itself, the engine, and a page that names both
function assertShips3D(files, ref, label) {
  assert.ok(files.get(`assets/${ref}.glb`), `${label}: the GLB is in it`); assert.ok(files.get(`assets/${ref}.glb`).equals(LARGE), `${label}: byte for byte the model the job made`);
  assert.ok(files.get('assets/sr3d.min.js') && files.get('assets/sr3d.min.js').length > 500000, `${label}: the 3D engine is in it`); assert.ok(files.get('assets/sr3d.LICENSE.txt'), `${label}: and its licence`);
  const html = files.get('index.html').toString('utf8'); const data = pageData(html);
  assert.deepEqual([data.runtime, data.scenes.length, data.scenes[0].model, data.scenes[0].composition], ['assets/sr3d.min.js', 1, `assets/${ref}.glb`, 'scroll-rotate'], label);
  assert.match(html, /<div class="td-stage" data-td="[^"]+" data-td-comp="scroll-rotate"/, `${label}: the page has its 3D stage`);
  assert.match(html, /<img class="[^"]*"[^>]*data-asset="c-bottle"|data-asset="c-bottle"/, `${label}: and the picture it falls back to`);
}

// ================================================================ 1. the exact failure, and the fix
test('3D-P1. a real-sized model is saved by REFERENCE: the old inline save is refused whole (the bug), the reference save is accepted -- and a cold restart, reopen, app preview, purchased snapshot and ZIP all carry the same stored model; nothing is generated again', async () => {
  const dir = fs.mkdtempSync(path.join(TMP, 'flow-')); const env = envFor(dir);
  let projectId; let jobId; let ref; let sectionId; let threeDId; let accountId;
  // ---------------------------------------------------------- server A: create, generate, attach, save
  let srv = await startServer(env);
  try {
    const s = session(srv.port); await signIn(s);
    accountId = (await s.call('GET', '/api/auth/me')).body.account.id;
    // 1. a Creative project (photo-sized pictures: this page alone is ~8 MB as the studio saves it)
    const made = await s.call('POST', '/api/projects', { name: 'Aurelia', directionsState: { directions: [creativeDirection()], activeDirectionIndex: 0 } });
    assert.ok(made.status === 201 || made.status === 200, JSON.stringify(made.body).slice(0, 200)); projectId = made.body.project.id;
    // 2. a completed (mocked) 3D job for it: quote, confirm, follow
    const q = await s.call('POST', '/api/creative/premium/3d/quote', { projectId, assetId: 'u-bottle' }); assert.equal(q.body.ok, true, JSON.stringify(q.body));
    jobId = (await s.call('POST', '/api/creative/premium/3d/start', { quoteId: q.body.quote.id })).body.job.jobId;
    const done = await follow(s, jobId); assert.deepEqual([done.job.status, done.job.completed], ['completed', 1], JSON.stringify(done.job).slice(0, 300));
    const d = done.job.delivered[0]; ref = d.threeD.assetRef; sectionId = d.sectionId; threeDId = d.threeD.id;
    assert.equal(ref, sha(LARGE)); assert.ok(LARGE.length > 6e6 && LARGE.length < TD.LIMITS.modelBytes, `a real-sized model, inside the limit (${LARGE.length} B)`);
    assert.deepEqual(GLB.check(GLB.inspect(LARGE).info, TD.LIMITS), { ok: true });
    const file = await s.raw(`/api/premium-media/${d.premium.mediaId}/file`); assert.ok(file.buf.equals(LARGE));
    const inline = Object.assign({}, d.threeD, { dataUrl: 'data:model/gltf-binary;base64,' + file.buf.toString('base64') });
    const scene = { id: 'td-' + sectionId, assetId: threeDId, sectionId, composition: d.composition };
    // THE BUG, reproduced: the studio used to drop the reference and save the bytes -- with this page, the save is refused
    // whole, and the account stays at the revision without the model
    const before = await put(s, projectId, c => { const a = Object.assign({}, inline); delete a.assetRef; c.threeD = { assets: [a], scenes: [scene] }; });
    assert.equal(before.status, 400, 'the inline save is refused'); assert.match(before.body.message, /No valid direction in project state/); assert.ok(before.bytes > 14 * 1048576, `it is ${(before.bytes / 1048576).toFixed(1)} MB`);
    assert.equal((await s.call('GET', `/api/projects/${projectId}`)).body.project.directionsState.directions[0].creative.threeD, undefined, 'and nothing of the model was kept');
    // 3. THE FIX: the studio saves what it holds (bytes for its preview AND the reference) as the reference alone
    const block = TD.normalise({ assets: [inline], scenes: [scene] }, { sectionIds: PLAN.scenes.map(x => x.id) });
    assert.deepEqual([block.assets[0].assetRef, !!block.assets[0].dataUrl], [ref, true], 'the studio\'s copy keeps the reference next to the preview bytes');
    const fixed = await put(s, projectId, c => { c.threeD = studioSave(block); });
    assert.equal(fixed.status, 200, JSON.stringify(fixed.body).slice(0, 300)); assert.ok(fixed.bytes < before.bytes - 8e6, 'the model adds a reference to the save, not 8 MB');
    assert.equal(fixed.body.project.revision, 2);
  } finally { await srv.stop(); }

  // ---------------------------------------------------------- 4. a cold reload: a new server process, a new session
  srv = await startServer(env);
  try {
    const s = session(srv.port); await signIn(s);
    // 5-6. reopened: the model, its scene and its stored file are all there
    const p = (await s.call('GET', `/api/projects/${projectId}`)).body.project; const c = p.directionsState.directions[0].creative;
    assert.equal(p.revision, 2); assert.ok(c.threeD, 'the reopened page has its 3D block');
    assert.deepEqual([c.threeD.assets.length, c.threeD.assets[0].id, c.threeD.assets[0].assetRef, c.threeD.assets[0].bytes, c.threeD.assets[0].sourceAssetId], [1, threeDId, ref, LARGE.length, 'u-bottle']);
    assert.ok(Buffer.from(c.threeD.assets[0].dataUrl.split(',')[1], 'base64').equals(LARGE), 'the model comes back with its bytes, for the studio\'s preview');
    assert.deepEqual(c.threeD.scenes.map(x => [x.sectionId, x.composition, x.assetId]), [[sectionId, 'scroll-rotate', threeDId]]);
    // the studio saves the reopened page again (an edit): still the reference, still the model
    const again = await put(s, projectId, cc => { cc.brief = UND.brief + ' '; cc.threeD = studioSave(cc.threeD); }); assert.equal(again.status, 200); assert.equal(again.body.project.revision, 3);
    // reopening asks for the page's 3D job: the same, finished one -- never a new one
    const fp = await s.call('GET', `/api/creative/premium/3d/for-project/${projectId}`); assert.deepEqual([fp.body.job.jobId, fp.body.job.terminal, fp.body.job.completed], [jobId, true, 1]);
    // 7. purchased: the snapshot is this revision -- the app's preview and download compile from it
    await purchased(s, srv.port, env, projectId);
    const snap = (await s.call('GET', `/api/projects/${projectId}/purchase-snapshot`)).body.snapshot; assert.equal(snap.projectRevision, 3);
    const preview = await bridge(srv.port, `/api/app-bridge/website/${projectId}/preview`); assert.equal(preview.status, 200, preview.buf.toString().slice(0, 200));
    const ph = preview.buf.toString('utf8'); const pd = pageData(ph);
    assert.match(pd.scenes[0].model, /^data:[\w/.+-]+;base64,/, 'the app preview carries the model itself'); assert.ok(Buffer.from(pd.scenes[0].model.split(',')[1], 'base64').equals(LARGE), 'the same model');
    assert.match(pd.runtime, /^data:[\w/.+-]+;base64,/, 'and the engine, inlined (that it runs is checked in a real browser)'); assert.match(ph, /class="td-stage"/);
    fs.writeFileSync(path.join(TMP, 'app-preview.html'), ph); // (kept for that browser check)
    // 8. the ZIP the Client App downloads (the purchased snapshot) -- and the builder's export
    const dl = await bridge(srv.port, `/api/app-bridge/website/${projectId}/download`); assert.equal(dl.status, 200); assert.equal(dl.headers.get('content-type'), 'application/zip');
    assertShips3D(readZip(dl.buf), ref, 'the purchased handoff');
    // published (as the studio does after a save on a purchased page): the same
    const pub = await s.call('POST', `/api/projects/${projectId}/publish`, { revision: 3 }); assert.equal(pub.status, 200, JSON.stringify(pub.body));
    assertShips3D(readZip((await bridge(srv.port, `/api/app-bridge/website/${projectId}/download`)).buf), ref, 'the published handoff');
    assert.equal(pageData((await bridge(srv.port, `/api/app-bridge/website/${projectId}/preview`)).buf.toString('utf8')).scenes.length, 1);
    const exp = await s.call('POST', `/api/projects/${projectId}/export`, {}); assert.equal(exp.status, 201, JSON.stringify(exp.body).slice(0, 300));
    assert.deepEqual([exp.body.manifest.threeD.shipped, exp.body.manifest.threeD.models.map(m => m.path), exp.body.manifest.threeD.leftOut], [true, [`assets/${ref}.glb`], []]);
    // reopening, previewing, purchasing and exporting made nothing new
    assert.equal(tripoSubmits(env), 1, 'one Tripo submission in the whole life of the page'); assert.deepEqual(otherPaid(env), []);
    assert.equal((await s.call('GET', `/api/creative/premium/3d/for-project/${projectId}`)).body.job.jobId, jobId);
  } finally { await srv.stop(); }

  // ---------------------------------------------------------- what is on disk: the source of truth itself
  const db = resetSqliteAdapter(env.SITEREMADE_DB_PATH);
  process.env.SITEREMADE_ASSET_STORE_DIR = env.SITEREMADE_ASSET_STORE_DIR;
  try {
    const rawProject = projectStore.getOwnedProjectRaw(db, accountId, projectId).directionsState.directions[0].creative;
    assert.deepEqual(rawProject.threeD.assets.map(a => [a.id, a.assetRef, a.dataUrl]), [[threeDId, ref, undefined]], 'the project row holds the reference, never the bytes');
    const snapState = purchase.getOwnedPurchaseSnapshotRaw(db, accountId, projectId).directionsState.directions[0].creative;
    assert.deepEqual([snapState.threeD.assets[0].assetRef, snapState.threeD.scenes[0].sectionId], [ref, sectionId], 'the purchased snapshot holds it too');
    const blob = db.assetBlobs.find(ref); assert.deepEqual([blob.content_type, blob.byte_length], ['model/gltf-binary', LARGE.length], 'and the file it names is stored, as a model');
    assert.equal(db.premiumJobs.latestForProject(accountId, projectId, '3d').id, jobId);
  } finally { process.env.SITEREMADE_ASSET_STORE_DIR = path.join(TMP, 'asset-store-inproc'); }
});

test('3D-P2. a page bought BEFORE its 3D model: the purchase stays what was bought until the page is saved and published -- then the app\'s preview and download have the model (draft vs published)', async () => {
  const dir = fs.mkdtempSync(path.join(TMP, 'bought-')); const env = envFor(dir); const srv = await startServer(env);
  try {
    const s = session(srv.port); await signIn(s);
    const projectId = (await s.call('POST', '/api/projects', { name: 'Aurelia', directionsState: { directions: [creativeDirection()], activeDirectionIndex: 0 } })).body.project.id;
    await purchased(s, srv.port, env, projectId);
    const q = await s.call('POST', '/api/creative/premium/3d/quote', { projectId, assetId: 'u-bottle' });
    const jobId = (await s.call('POST', '/api/creative/premium/3d/start', { quoteId: q.body.quote.id })).body.job.jobId; const d = (await follow(s, jobId)).job.delivered[0];
    const file = await s.raw(`/api/premium-media/${d.premium.mediaId}/file`);
    const block = TD.normalise({ assets: [Object.assign({}, d.threeD, { dataUrl: 'data:model/gltf-binary;base64,' + file.buf.toString('base64') })], scenes: [{ id: 'td-' + d.sectionId, assetId: d.threeD.id, sectionId: d.sectionId, composition: d.composition }] }, { sectionIds: PLAN.scenes.map(x => x.id) });
    const saved = await put(s, projectId, c => { c.threeD = studioSave(block); }); assert.equal(saved.status, 200);
    // saved but not yet published: the app still shows what was bought (an immutable purchase)
    assert.equal(readZip((await bridge(srv.port, `/api/app-bridge/website/${projectId}/download`)).buf).has(`assets/${d.threeD.assetRef}.glb`), false);
    // the studio publishes a saved page that was bought: from then on the app has the model
    assert.equal((await s.call('POST', `/api/projects/${projectId}/publish`, { revision: saved.body.project.revision })).status, 200);
    assertShips3D(readZip((await bridge(srv.port, `/api/app-bridge/website/${projectId}/download`)).buf), d.threeD.assetRef, 'the published handoff');
    assert.equal(pageData((await bridge(srv.port, `/api/app-bridge/website/${projectId}/preview`)).buf.toString('utf8')).scenes.length, 1);
    assert.equal(tripoSubmits(env), 1); assert.deepEqual(otherPaid(env), []);
  } finally { await srv.stop(); }
});

// ================================================================ 2. the rules the fix stands on
test('3D-P3. the model record keeps its stored reference next to the preview bytes, and a save of bytes always stores them under THEIR OWN hash (a reference sent with them cannot point elsewhere)', () => {
  const NORMAL = fs.readFileSync(path.join(__dirname, 'fixtures', 'three-d', 'product-normalized.glb'));
  const info = GLB.inspect(NORMAL).info;
  const rec = extra => Object.assign({ id: 'td-fixture', sourceAssetId: 'u-bottle', bytes: NORMAL.length, bounds: info.bounds, center: info.center, scale: 1, triangles: info.triangles, textures: { count: 1, maxSize: info.textures.maxSize }, provenance: { provider: 'tripo' } }, extra);
  const both = TD.cleanAsset(rec({ assetRef: sha(NORMAL), dataUrl: 'data:model/gltf-binary;base64,' + NORMAL.toString('base64') }));
  assert.deepEqual([both.assetRef, !!both.dataUrl], [sha(NORMAL), true]);
  assert.deepEqual([TD.cleanAsset(rec({ assetRef: sha(NORMAL) })).assetRef, TD.cleanAsset(rec({ assetRef: sha(NORMAL) })).dataUrl], [sha(NORMAL), undefined]);
  assert.equal(TD.cleanAsset(rec({})), null, 'no file at all: not a model'); assert.equal(TD.cleanAsset(rec({ assetRef: sha(NORMAL), dataUrl: 'data:text/html;base64,AAAA' })), null, 'bad bytes are not rescued by a reference');
  assert.equal(TD.cleanAsset(rec({ assetRef: '../../x', dataUrl: 'data:model/gltf-binary;base64,' + NORMAL.toString('base64') })).assetRef, undefined);
  // the server: bytes + a reference that names something else -> stored under the bytes' own hash
  const db = resetSqliteAdapter(path.join(TMP, 'p3.db'));
  const state = { directions: [creativeDirection({ assets: [rec({ assetRef: 'f'.repeat(64), dataUrl: 'data:model/gltf-binary;base64,' + NORMAL.toString('base64') })], scenes: [{ id: 'td-s', assetId: 'td-fixture', sectionId: PLAN.scenes[1].id, composition: 'scroll-rotate' }] })], activeDirectionIndex: 0 };
  const v = projectStore.validateDirectionsState(state); assert.equal(v.valid, true, v.error);
  const stored = projectStore.internalizeAssets(db, v.normalized).directions[0].creative.threeD.assets[0];
  assert.deepEqual([stored.assetRef, stored.dataUrl], [sha(NORMAL), undefined]); assert.ok(getAssetStore().get(sha(NORMAL)).equals(NORMAL));
});

test('3D-P4. the studio saves the model by reference, keeps the job\'s reference when it attaches the model, and publishes to the app only a page that actually saved', () => {
  const js = fs.readFileSync(path.join(ROOT, 'creative.js'), 'utf8');
  const attach = js.slice(js.indexOf('function attach3D('), js.indexOf('function td3Save('));
  assert.doesNotMatch(attach, /delete asset\.assetRef/, 'the reference to the job\'s stored model is kept');
  assert.match(attach, /td3Save\(\)\.then\(function \(r\) \{[\s\S]*if \(r && r\.ok && r\.data && r\.data\.ok\) return publishPremiumRevision\(\);/, 'published only after a save that succeeded');
  assert.match(js, /threeD: tdForSave\(\)/, 'the save sends the 3D block through tdForSave');
  // and tdForSave itself, run as the studio runs it: bytes dropped where a reference exists, kept where none does
  const src = js.slice(js.indexOf('function tdForSave()'), js.indexOf('function save()'));
  const tdForSave = new Function('S', src + '\nreturn tdForSave();');
  const out = tdForSave({ threeD: { v: 1, assets: [{ id: 'td-a', assetRef: 'a'.repeat(64), dataUrl: 'data:model/gltf-binary;base64,AAAA' }, { id: 'td-b', dataUrl: 'data:model/gltf-binary;base64,BBBB' }], scenes: [{ id: 's' }] } });
  assert.deepEqual(out.assets, [{ id: 'td-a', assetRef: 'a'.repeat(64) }, { id: 'td-b', dataUrl: 'data:model/gltf-binary;base64,BBBB' }]); assert.deepEqual(out.scenes, [{ id: 's' }]);
  assert.equal(tdForSave({ threeD: null }), undefined);
  // the studio bundle carries the same model rules as the server
  assert.ok(fs.readFileSync(path.join(ROOT, 'creative-core.js'), 'utf8').includes('else if (!ref) return null;'), 'creative-core.js is rebuilt from lib/creative/three-d.js');
});
