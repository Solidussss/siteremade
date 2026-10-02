'use strict';
// TRUE 3D, PHASE 2 (CREATIVE_3D.md): upload -> quote -> credits reserved -> the durable premium job -> Tripo's image-to-3D
// (lib/three-d/providers/tripo.js) -> followed -> downloaded -> verified -> stored -> on the page -> saved, reopened,
// exported, handed off. These tests hold the rules of that road.
//
// REAL PROVIDER SPEND: $0. "Tripo" here is test/helpers/mock-tripo.js -- a fetch that speaks Tripo's documented API from
// this repository's fixture models. In this file the network is OFF for everything but this machine (below): a request to
// any other address is recorded and refused, and the last test fails if one was ever made. The real server (a child
// process, test/helpers/run-server.js) answers Tripo with the same fake and refuses every other paid provider.
const net = [];
const realFetch = globalThis.fetch;
const loopback = a => /^(https?:\/\/)?(127\.0\.0\.1|localhost|\[::1\])/.test(String(typeof a === 'string' ? a : (a && (a.href || a.url || a.hostname || a.host)) || ''));
globalThis.fetch = (url, options) => { if (loopback(url)) return realFetch(url, options); net.push(String((url && url.url) || url)); return Promise.reject(new Error('the network is off in this test')); };
const http = require('http'); const https = require('https');
[http, https].forEach(m => ['request', 'get'].forEach(k => { const real = m[k]; m[k] = function (...a) { if (!loopback(a[0])) net.push(String(typeof a[0] === 'string' ? a[0] : JSON.stringify(a[0]))); return real.apply(this, a); }; }));

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'sr-3d-tripo-'));
process.env.SITEREMADE_BACKEND = 'local'; process.env.SITEREMADE_ASSET_STORE_DIR = path.join(TMP, 'asset-store');
['CREATIVE_3D', 'THREE_D_PROVIDER', 'THREE_D_NORMALIZER', 'TRIPO_API_KEY', 'SITEREMADE_3D_PROVIDER_USD', 'SITEREMADE_3D_BLENDER_USD', 'SITEREMADE_3D_MODEL_VERSION', 'ALLOW_PAID_PROVIDER_CALLS', 'PREMIUM_PROVIDER_ENABLED', 'PUBLIC_BASE_URL'].forEach(k => { delete process.env[k]; });

const TD = require('../lib/creative/three-d');
const threeD = require('../lib/three-d');
const { glb: GLB, pipeline: Pipeline, cost: Cost, provider: Provider } = threeD;
const Tripo = require('../lib/three-d/providers/tripo');
const PP = require('../lib/paid-providers');
const PJ = require('../lib/premium-jobs');
const credits = require('../lib/credits');
const quotes = require('../lib/quotes');
const pricing = require('../lib/pricing');
const D2 = require('../lib/creative/director2');
const { validatePlan2 } = require('../lib/creative/validate2');
const { getAssetStore } = require('../lib/adapters/asset-store');
const { resetSqliteAdapter } = require('../lib/adapters/sqlite-database-adapter');
const { readZip } = require('./helpers/unzip');
const { startServer, providerCalls } = require('./helpers/server-process');
const { createFakeTripo, MODES, API, CDN } = require('./helpers/mock-tripo');
const FX = require('./fixtures/three-d/make-fixture');

const FIX = path.join(__dirname, 'fixtures', 'three-d');
const NORMAL = fs.readFileSync(path.join(FIX, 'product-normalized.glb'));
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const sleep = ms => new Promise(r => setTimeout(r, ms));
// a key that looks like a real one, so a test can prove it is never written anywhere (it is not one: nothing answers it)
const KEY = 'tsk_TESTONLYnotarealkey0123456789abcdef';
const LINK = 'https://www.siteremade.com/api/premium-media/source/tok_3d_source_1';
const PNG = { mime: 'image/png', bytes: 250000 };
let dbn = 0;
const newDb = () => resetSqliteAdapter(path.join(TMP, `db-${process.pid}-${dbn++}.db`));
const storeIn = db => (bytes, mime) => { const { hash, byteLength } = getAssetStore().put(bytes); db.assetBlobs.insertIfMissing({ hash, contentType: mime, byteLength, createdAt: new Date().toISOString() }); return hash; };
const adapterOn = (fake, extra) => Tripo.createTripo(Object.assign({ key: KEY, fetchImpl: fake.fetch, timeoutMs: 400 }, extra || {}));
const rejects = async (p) => { try { await p; } catch (e) { return e; } assert.fail('expected a refusal'); };

// ================================================================ 1. THE ADAPTER
test('P2-1. Tripo is asked for exactly one thing: one image by SiteRemade\'s own link, a pinned V3 model, a GLB with PBR, an explicit face limit, triangles, uncompressed', async () => {
  const fake = createFakeTripo({ key: KEY, queuedMs: 0 }); const t = adapterOn(fake);
  assert.deepEqual([t.name, t.model, t.faceLimit, t.configured()], ['tripo', 'v3.1-20260211', 50000, true]);
  assert.equal(Tripo.BASE, 'https://openapi.tripo3d.ai/v3', 'the V3 API (V2 is retired on 1 November 2026)');
  const sub = await t.submit('image-to-3d', { image_url: LINK, image: PNG, prompt: 'a tonic bottle', mode: 'object', requestId: 'pj_1:model3d' });
  assert.deepEqual(Object.keys(sub).sort(), ['requestId', 'status'], 'a submit answers with an identifier and nothing else'); assert.match(sub.requestId, /^tsk_mock_1_\d+$/);
  const sent = fake.calls.find(c => c.endpoint === 'submit');
  assert.deepEqual(sent.body, { input: LINK, model: 'v3.1-20260211', texture: true, pbr: true, texture_quality: 'standard', face_limit: 50000, quad: false, smart_low_poly: false, generate_parts: false, auto_size: false });
  assert.equal(sent.auth, true, 'authorised with the server\'s key');
  // never: compression (meshopt), quads (FBX), a moving model name, more than one image, the customer's words, a file
  const raw = JSON.stringify(sent.body);
  assert.doesNotMatch(raw, /compress|meshopt|draco|"quad":true|latest|tonic|prompt|base64|data:|images|multiview/i);
  assert.equal(typeof sent.body.input, 'string', 'one image');
  // the model version is configuration, and it must be pinned
  assert.equal(adapterOn(fake, { model: 'v3.0-20250812' }).model, 'v3.0-20250812');
  for (const moving of ['latest', 'v3.1', 'default', 'v3', 'stable', 'v3.1-latest', '<script>']) {
    assert.equal(Tripo.modelVersion(moving), '', moving); const m = adapterOn(fake, { model: moving });
    assert.equal(m.configured(), false, `${moving}: not configured, so 3D is unavailable rather than unpinned`);
    const e = await rejects(m.submit('image-to-3d', { image_url: LINK, image: PNG })); assert.deepEqual([e.status, e.notSent], [400, true]);
  }
  assert.equal(fake.count.submits, 1, 'only the pinned request was ever sent');
});

test('P2-2. an image Tripo would refuse is refused HERE, before anything is sent: JPEG or PNG only, within the size limit, by a real link -- and with no key, nothing is sent at all', async () => {
  const fake = createFakeTripo({ key: KEY }); const t = adapterOn(fake);
  const cases = [
    [{ image_url: LINK, image: { mime: 'image/webp', bytes: 90000 } }, /JPEG or a PNG/], [{ image_url: LINK, image: { mime: 'image/gif', bytes: 90000 } }, /JPEG or a PNG/], [{ image_url: LINK, image: { mime: 'image/svg+xml', bytes: 90000 } }, /JPEG or a PNG/],
    [{ image_url: LINK, image: { mime: 'image/png', bytes: 20 * 1024 * 1024 + 1 } }, /larger than 20 MB/], [{ image_url: LINK, image: { mime: 'image/png', bytes: 0 } }, /could not be measured/], [{ image_url: LINK }, /JPEG or a PNG/],
    [{ image_url: '', image: PNG }, /no source link/], [{ image_url: 'data:image/png;base64,AAAA', image: PNG }, /no source link/], [{ image_url: 'file:///etc/passwd', image: PNG }, /no source link/],
  ];
  for (const [params, why] of cases) { const e = await rejects(t.submit('image-to-3d', params)); assert.match(e.message, why); assert.deepEqual([e.status, e.notSent], [400, true], 'a refusal before sending: no cost, by construction'); }
  assert.equal(Tripo.inputProblem({ mime: 'image/jpeg', bytes: 20 * 1024 * 1024 }), ''); assert.equal(Tripo.inputProblem(PNG), '');
  // no key (every development machine, every test): not configured, and every call stops before the network
  const none = Tripo.createTripo({ key: () => '', fetchImpl: fake.fetch });
  assert.equal(none.configured(), false);
  for (const p of [none.submit('image-to-3d', { image_url: LINK, image: PNG }), none.status('tsk_mock_1_1'), none.download('tripo:task:tsk_mock_1_1')]) assert.match((await rejects(p)).message, /no API key|could not be downloaded|unavailable/);
  assert.deepEqual(fake.calls, [], 'not one request reached the provider');
});

test('P2-3. status is mapped, never passed through: queued and running wait, success is a REFERENCE (never Tripo\'s address), failed / banned / cancelled are outcomes that cost nothing', async () => {
  let now = 1_000_000; const clock = () => now;
  const fake = createFakeTripo({ key: KEY, now: clock, queuedMs: 1000 }); const t = adapterOn(fake);
  const { requestId: id } = await t.submit('image-to-3d', { image_url: LINK, image: PNG });
  assert.deepEqual(await t.status(id), { requestId: id, progress: 0, status: 'queued' });
  now += 600; assert.deepEqual(await t.status(id), { requestId: id, progress: 40, status: 'in_progress' });
  now += 600; const done = await t.status(id);
  assert.deepEqual(done, { requestId: id, progress: 100, status: 'completed', outputUrl: `tripo:task:${id}`, mediaType: 'model3d' });
  assert.doesNotMatch(JSON.stringify(done), /https?:|Signature|Expires|tripo3d/, 'the signed address is never handed on: there is nothing to store');
  const outcome = async mode => { const f = createFakeTripo({ key: KEY, mode, queuedMs: 0 }); const a = adapterOn(f); const s = await a.submit('image-to-3d', { image_url: LINK, image: PNG }); return a.status(s.requestId); };
  assert.deepEqual([(await outcome('failed')).status, (await outcome('failed')).reason], ['failed', 'generation failed']);
  assert.equal((await outcome('banned')).status, 'nsfw', 'Tripo\'s "banned" is the job\'s content refusal: no cost');
  assert.equal((await outcome('slow')).status, 'in_progress');
  // shapes the fake has no mode for: answered by hand
  const answering = data => adapterOn({ fetch: async () => new Response(JSON.stringify({ code: 0, data }), { status: 200, headers: { 'content-type': 'application/json' } }) });
  assert.equal((await answering({ status: 'cancelled' }).status('tsk_x_1')).status, 'canceled');
  assert.equal((await answering({ status: 'expired' }).status('tsk_x_1')).status, 'failed');
  assert.deepEqual((await answering({ status: 'success', output: {} }).status('tsk_x_1')).status, 'failed', 'finished with no model: a failure, not a model');
  assert.equal((await answering({ status: 'some-new-state' }).status('tsk_x_1')).status, 'in_progress', 'an unknown state waits: it is never mistaken for an outcome');
  assert.match((await rejects(t.status('../../etc'))).message, /not a Tripo task id/);
  assert.equal(await t.cancel(id), false, 'V3 documents no cancellation: never claimed');
});

test('P2-4. a download asks Tripo for a FRESH address every attempt, keeps none, and takes nothing but a task reference', async () => {
  const fake = createFakeTripo({ key: KEY, queuedMs: 0 }); const t = adapterOn(fake);
  const { requestId: id } = await t.submit('image-to-3d', { image_url: LINK, image: PNG }); const st = await t.status(id);
  const a = await t.download(st.outputUrl, 'model3d'); const b = await t.download(st.outputUrl, 'model3d');
  assert.ok(a.bytes.equals(NORMAL) && b.bytes.equals(NORMAL));
  assert.deepEqual([a.mime, a.sourceFormat, a.modelFile.name, a.textures.length, a.metadata.generator, a.metadata.model], ['model/gltf-binary', 'glb', 'model.glb', 0, 'tripo', 'v3.1-20260211']);
  assert.deepEqual(Object.keys(a).sort(), ['bytes', 'metadata', 'mime', 'modelFile', 'sourceFormat', 'textures'], 'no address in what a download returns');
  const served = fake.calls.filter(c => c.endpoint === 'download'); assert.equal(served.length, 2);
  assert.equal(fake.count.urls, 3, 'one address when it completed, and a NEW one for each download'); assert.equal(fake.count.submits, 1, 'a download never generates');
  // an address someone kept is refused without a request: the only thing accepted is the reference
  const before = fake.calls.length;
  for (const kept of [`https://${CDN}/output/${id}/1/model.glb?Expires=99999999999999&Signature=sig1`, 'https://evil.example/model.glb', id, `tripo:task:${id}/../x`, '']) assert.match((await rejects(t.download(kept))).message, /not a Tripo task reference/);
  assert.equal(fake.calls.length, before);
  // an address that has expired: that attempt fails, the next one gets a new address and succeeds
  const exp = createFakeTripo({ key: KEY, mode: 'expired-url', queuedMs: 0 }); const te = adapterOn(exp);
  const s2 = await te.submit('image-to-3d', { image_url: LINK, image: PNG }); const ref = `tripo:task:${s2.requestId}`;
  assert.match((await rejects(te.download(ref))).message, /could not be downloaded \(403\)/); assert.ok((await te.download(ref)).bytes.equals(NORMAL));
  // a storage hiccup: the same
  const hic = createFakeTripo({ key: KEY, mode: 'download-retry', downloadFails: 2, queuedMs: 0 }); const th = adapterOn(hic);
  const s3 = await th.submit('image-to-3d', { image_url: LINK, image: PNG }); const ref3 = `tripo:task:${s3.requestId}`;
  await rejects(th.download(ref3)); await rejects(th.download(ref3)); assert.ok((await th.download(ref3)).bytes.equals(NORMAL)); assert.equal(hic.count.submits, 1);
  // a task that is not finished has nothing to download; a file over the cap is not kept
  const slow = createFakeTripo({ key: KEY, mode: 'slow' }); const ts = adapterOn(slow); const s4 = await ts.submit('image-to-3d', { image_url: LINK, image: PNG });
  assert.match((await rejects(ts.download(`tripo:task:${s4.requestId}`))).message, /no download address/);
  const big = createFakeTripo({ key: KEY, mode: 'oversized', queuedMs: 0 }); const tb = adapterOn(big, { maxBytes: 1024 * 1024 }); const s5 = await tb.submit('image-to-3d', { image_url: LINK, image: PNG });
  assert.match((await rejects(tb.download(`tripo:task:${s5.requestId}`))).message, /too large/);
});

test('P2-5. how a submit can go wrong decides what it costs: answered "busy" may be asked again, answered "no" costs nothing, NO answer is uncertain -- and the key is in none of it', async () => {
  // busy: Tripo allows a few tasks at a time
  const busy = createFakeTripo({ key: KEY, mode: 'busy', busy: 1 }); const tb = adapterOn(busy);
  const b = await rejects(tb.submit('image-to-3d', { image_url: LINK, image: PNG })); assert.deepEqual([b.status, b.busy, b.code], [429, true, 2000]); assert.match(b.trace, /^trace_mock_/);
  assert.match((await tb.submit('image-to-3d', { image_url: LINK, image: PNG })).requestId, /^tsk_mock_1_/, 'accepted the next time: one task exists');
  // a wrong key: refused (401), and the key is not in the message
  const wrong = Tripo.createTripo({ key: KEY, fetchImpl: createFakeTripo({ key: 'tsk_someone_elses_key' }).fetch });
  const w = await rejects(wrong.submit('image-to-3d', { image_url: LINK, image: PNG })); assert.deepEqual([w.status, w.busy, w.notSent], [401, undefined, undefined]); assert.match(w.message, /^Tripo returned 401 \(code 1002\): Authentication failed$/);
  // a provider that repeats the key back in its error: scrubbed
  const echo = adapterOn({ fetch: async (u, o) => new Response(JSON.stringify({ code: 1002, message: `invalid key ${o.headers.Authorization}` }), { status: 403 }) });
  const e = await rejects(echo.submit('image-to-3d', { image_url: LINK, image: PNG })); assert.equal(e.status, 403); assert.ok(!e.message.includes(KEY) && /\[key\]/.test(e.message), e.message);
  // an HTTP 200 that carries an error code is a refusal, not a task
  const soft = adapterOn({ fetch: async () => new Response(JSON.stringify({ code: 2010, message: 'You need more credits' }), { status: 200 }) });
  assert.deepEqual([(await rejects(soft.submit('image-to-3d', { image_url: LINK, image: PNG }))).status], [400]);
  // never answered (the adapter's own timeout), answered and lost, answered with no id, a server error: NO status --
  // the job treats each as a submission that may have happened, and never sends it again
  const hang = createFakeTripo({ key: KEY, mode: 'submit-timeout' }); const t1 = adapterOn(hang, { timeoutMs: 60 });
  const u1 = await rejects(t1.submit('image-to-3d', { image_url: LINK, image: PNG })); assert.equal(u1.status, undefined); assert.match(u1.message, /did not answer in time/);
  const gone = createFakeTripo({ key: KEY, mode: 'vanish' }); const u2 = await rejects(adapterOn(gone).submit('image-to-3d', { image_url: LINK, image: PNG }));
  assert.equal(u2.status, undefined); assert.equal(gone.count.accepted, 1, 'the task exists at the provider: it really was uncertain');
  const noId = adapterOn({ fetch: async () => new Response(JSON.stringify({ code: 0, data: {} }), { status: 200 }) }); assert.equal((await rejects(noId.submit('image-to-3d', { image_url: LINK, image: PNG }))).status, undefined);
  const five = adapterOn({ fetch: async () => new Response('bad gateway', { status: 502 }) }); assert.equal((await rejects(five.submit('image-to-3d', { image_url: LINK, image: PNG }))).status, 502, 'a 5xx is not a clean refusal (the job does not treat it as one)');
  for (const x of [b, w, e, u1, u2]) assert.ok(!JSON.stringify({ m: x.message, s: x.stack }).includes(KEY), 'no error carries the key');
  // and the adapter itself never reads the environment or writes a log
  const src = fs.readFileSync(path.join(ROOT, 'lib', 'three-d', 'providers', 'tripo.js'), 'utf8');
  assert.doesNotMatch(src, /process\.env|console\.|require\('fs'\)|writeFile/);
});

// ================================================================ 2. THE PAID-PROVIDER GUARD
test('P2-6. Tripo is a paid provider like the others: off on every machine that is not production, whatever key it has -- its key is not handed out, and a request to it does not leave the process', async () => {
  const noMock = {}; const KEYS = { TRIPO_API_KEY: KEY };
  assert.deepEqual(PP.PROVIDERS.tripo.env, ['TRIPO_API_KEY']);
  for (const env of [KEYS, Object.assign({ NODE_ENV: 'development' }, KEYS), Object.assign({ NODE_ENV: 'test' }, KEYS), Object.assign({ NODE_ENV: 'production', ALLOW_PAID_PROVIDER_CALLS: 'false' }, KEYS), Object.assign({ ALLOW_PAID_PROVIDER_CALLS: 'yes' }, KEYS)]) {
    assert.equal(PP.allowed('tripo', env, noMock), false); assert.equal(PP.key('tripo', env, noMock), '');
    // the adapter as the server builds it: no key -> not configured -> 3D is simply unavailable; a forced call sends nothing
    const sent = []; const t = Tripo.createTripo({ key: () => PP.key('tripo', env, noMock), fetchImpl: async u => { sent.push(String(u)); return new Response('{}'); } });
    assert.equal(t.configured(), false); const e = await rejects(t.submit('image-to-3d', { image_url: LINK, image: PNG })); assert.equal(e.notSent, true);
    await rejects(t.status('tsk_mock_1_1')); await rejects(t.download('tripo:task:tsk_mock_1_1')); assert.deepEqual(sent, []);
  }
  assert.equal(PP.key('tripo', Object.assign({ NODE_ENV: 'production' }, KEYS), noMock), KEY, 'production: live');
  assert.equal(PP.key('tripo', Object.assign({ ALLOW_PAID_PROVIDER_CALLS: 'true' }, KEYS), noMock), KEY, 'the one explicit override');
  assert.equal(PP.allowed('tripo', { NODE_ENV: 'production' }, noMock), false, 'production without a key: unavailable, never a crash');
  assert.ok(!JSON.stringify(PP.status(Object.assign({ NODE_ENV: 'production' }, KEYS), noMock)).includes(KEY), 'the status report never contains the key');
  // the network edge: even code that held a key and called fetch itself gets nowhere
  const hosts = [`https://${API}/v3/generation/image-to-model`, `https://${API}/v3/tasks/abc`, `https://${CDN}/output/x/1/model.glb?Signature=s`, 'https://api.tripo3d.ai/v2/openapi/task', 'https://tripo-data.rg1.data.tripo3d.com/x.glb', 'https://TRIPO3D.AI/'];
  for (const u of hosts) assert.equal(PP.providerForUrl(u), 'tripo', u);
  for (const u of ['https://tripo3d.ai.evil.example/x', 'https://nottripo3d.ai/x', 'https://example.com/?u=tripo3d.ai']) assert.notEqual(PP.providerForUrl(u), 'tripo', u);
  const sent = []; const g = { fetch: async url => { sent.push(String(url)); return { ok: true }; } };
  PP.installFetchGuard(Object.assign({ NODE_ENV: 'development' }, KEYS), g);
  for (const u of hosts) await assert.rejects(g.fetch(u, { method: 'POST', headers: { Authorization: `Bearer ${KEY}` } }), e => e.code === 'PAID_PROVIDER_BLOCKED' && !String(e.message).includes(KEY));
  assert.deepEqual(sent, [], 'not one request to Tripo was sent');
  // the server takes the key through the guard only, and no browser file knows the variable exists
  const server = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
  assert.doesNotMatch(server, /process\.env\.TRIPO_API_KEY/); assert.match(server, /key: \(\) => paidProviders\.key\('tripo'\)/);
  for (const f of ['creative-core.js', 'creative.js', 'script.js', 'index.html', 'creative-studio.css', 'vendor/three-d/sr3d.min.js']) assert.doesNotMatch(fs.readFileSync(path.join(ROOT, f), 'utf8'), /TRIPO_API_KEY|tripo3d|openapi\.tripo/i, f);
});

// ================================================================ 3. THE NORMALISER (no Blender in production)
test('P2-7. THREE_D_NORMALIZER=verify needs nothing installed: the provider\'s own GLB is inspected, kept byte for byte if it is within the limits, refused if it is not', async () => {
  assert.deepEqual(Pipeline.NORMALIZERS, ['verify', 'blender']);
  assert.deepEqual(threeD.normalizer({}), { ok: true, name: 'verify', reason: '' }, 'verify is the server\'s default');
  assert.equal(threeD.normalizer({ THREE_D_NORMALIZER: 'blender' }).name, 'blender', 'the Blender road is still there');
  assert.deepEqual([threeD.normalizer({ THREE_D_NORMALIZER: 'gltf-transform' }).ok, threeD.normalizer({ THREE_D_NORMALIZER: 'gltf-transform' }).reason], [false, 'the gltf-transform normaliser is planned, not built yet']);
  assert.equal(threeD.normalizer({ THREE_D_NORMALIZER: 'rm -rf' }).ok, false);
  const models = createFakeTripo({}).models();
  const run = bytes => Pipeline.normalise({ modelFile: { name: 'model.glb', bytes }, sourceFormat: 'glb', textures: [], provider: 'tripo', providerAssetId: 'tsk_mock_1_1', sourceAssetId: 'u-bottle', requestId: 'pj_1:model3d' }, { normalizer: 'verify' });
  const ok = await run(models.normal);
  assert.equal(ok.ok, true, JSON.stringify(ok).slice(0, 300)); assert.ok(ok.bytes.equals(NORMAL), 'stored as the provider made it');
  assert.deepEqual([ok.asset.normalized, ok.asset.provenance.processor, ok.asset.provenance.provider, ok.asset.provenance.providerAssetId, ok.report.normalizer, ok.report.blender], [false, 'verify-only', 'tripo', 'tsk_mock_1_1', 'verify', null]);
  assert.deepEqual(TD.cleanAsset(Object.assign({}, ok.asset, { assetRef: sha(NORMAL) })).id, ok.asset.id, 'a record the project accepts');
  assert.deepEqual(GLB.check(GLB.inspect(ok.bytes).info, TD.LIMITS), { ok: true });
  // what is not a model a website may show never becomes one (and is never "fixed" by pretending)
  const why = async bytes => { const r = await run(bytes); return [r.ok, r.retry === true, r.stage, r.code]; };
  assert.deepEqual(await why(models.oversized), [false, false, 'limits', 'too_large']);
  assert.deepEqual(await why(models['heavy-texture']), [false, false, 'limits', 'texture_too_large']);
  const bad = await run(models.malformed); assert.deepEqual([bad.ok, bad.retry === true], [false, false]); assert.match(String(bad.code), /glb|malformed|not_glb|invalid/);
  const packed = await run(models.compressed); assert.deepEqual([packed.ok, packed.retry === true], [false, false]); assert.match(JSON.stringify(packed), /meshopt|extension/i);
  // an unknown normaliser is unavailable, not skipped
  const none = await Pipeline.normalise({ modelFile: { name: 'model.glb', bytes: NORMAL }, sourceFormat: 'glb' }, { normalizer: 'gltf-transform' });
  assert.deepEqual([none.ok, none.code], [false, 'normalizer_unavailable']);
  // availability: verify mode does not need Blender; nothing is available without a provider that may be called here
  Provider.register(Tripo.createTripo({ key: () => KEY, fetchImpl: () => Promise.reject(new Error('never')) }));
  try {
    const on = { CREATIVE_3D: 'on', SITEREMADE_3D_PROVIDER_USD: '0.50', THREE_D_PROVIDER: 'tripo' };
    const av = await threeD.availability(on); assert.deepEqual([av.ok, av.provider, av.normalizer, av.estimate.credits], [true, 'tripo', 'verify', 3]);
    assert.deepEqual((await threeD.availability(Object.assign({}, on, { THREE_D_NORMALIZER: 'gltf-transform' }))).reason, 'provider_unavailable');
    assert.equal((await threeD.availability(Object.assign({}, on, { CREATIVE_3D: '' }))).reason, 'mode_off');
    assert.equal((await threeD.availability(Object.assign({}, on, { SITEREMADE_3D_PROVIDER_USD: '' }))).reason, 'not_priced');
    Provider.register(Tripo.createTripo({ key: () => '', fetchImpl: () => Promise.reject(new Error('never')) }));
    assert.equal((await threeD.availability(on)).reason, 'provider_unavailable', 'no key (development): 3D is not offered');
  } finally { Provider.unregister('tripo'); }
});

// ================================================================ 4. THE QUOTE
test('P2-8. a 3D model is quoted by the same quote system, from configuration: nothing is hard-coded, the price covers the cost, and the quote says it is charged only if the model is made', () => {
  const est = Cost.estimate({ SITEREMADE_3D_PROVIDER_USD: '0.50' });
  assert.deepEqual([est.priced, est.providerUsd, est.blenderUsd, est.observedUsd, est.budgetUsd, est.credits], [true, 0.5, 0, 0.5, 0.54, 3]);
  assert.ok(est.credits * pricing.USD_PER_CREDIT_CEILING >= est.budgetUsd, 'never under the cost');
  assert.deepEqual([Cost.estimate({ SITEREMADE_3D_PROVIDER_USD: '0.50', SITEREMADE_3D_BLENDER_USD: '0.05' }).credits, Cost.estimate({ SITEREMADE_3D_PROVIDER_USD: '1.20' }).credits, Cost.estimate({}).priced], [3, 7, false], 'a different cost is a different quote; no cost is no quote');
  assert.equal(Object.prototype.hasOwnProperty.call(pricing.ACTION_CREDITS || {}, 'creative_3d'), false, 'there is no fixed customer price for 3D in the price list');
  const src = { assetId: 'u-bottle', ref: 'a'.repeat(64), mime: 'image/png', bytes: 250000 };
  const db = newDb(); const q = quotes.create(db, { accountId: 'acct_q', projectId: 'proj_1', operation: 'creative_3d', plan: { credits: est.credits, budgetUsd: est.budgetUsd, source: src, sectionId: 's2', composition: 'scroll-rotate' } });
  const pub = quotes.publicView(q);
  assert.deepEqual([pub.operation, pub.credits, pub.status, pub.message], ['creative_3d', 3, 'open', 'This 3D model will use 3 credits -- only if the model is made.']);
  assert.deepEqual(pub.items, [{ code: 'premium_3d', label: 'Interactive 3D model (only if it is made)', credits: 3, optional: true }]);
  assert.doesNotMatch(JSON.stringify(pub), /0\.5|usd|tripo|a{64}|budget/i, 'the owner sees credits: no provider, no provider cost, no stored reference');
  assert.deepEqual(q.items[0].source, src, 'the server keeps what was quoted: this picture, this section');
  // a quote that would not cover the cost, or names no stored picture, is not a quote
  const bad = plan => assert.throws(() => quotes.build('creative_3d', plan));
  bad({ credits: 2, budgetUsd: 0.54, source: src, sectionId: 's2' }); bad({ credits: 0, budgetUsd: 0, source: src, sectionId: 's2' }); bad({ credits: 41, budgetUsd: 0.54, source: src, sectionId: 's2' });
  bad({ credits: 3, budgetUsd: 0.54, source: { assetId: 'u', ref: 'nope', mime: 'image/png', bytes: 1 }, sectionId: 's2' }); bad({ credits: 3, budgetUsd: 0.54, sectionId: 's2' });
});

// ================================================================ 5. THE DURABLE JOB, WITH TRIPO
const QUIET = Object.assign(PJ.policy({}), { firstCheckMs: 1e9, checkMs: 1e9, maxCheckMs: 1e9, lateCheckMs: 1e9, downloadRetryMs: 0, busyRetryMs: 0 }); // (no timer fires: the test ticks)
// one confirmed 3D quote and its job, exactly as the server makes them -- the real adapter, the fake provider
function tripoJob(mode, opts) {
  const o = opts || {}; const db = newDb(); let now = Date.now(); const clock = () => now;
  const est = Cost.estimate({ SITEREMADE_3D_PROVIDER_USD: '0.50' });
  credits.grant(db, { id: 'purchase:3d', accountId: 'acct_t', kind: 'purchase', amount: 100, source: 'test', now: new Date() });
  const source = { assetId: 'u-bottle', ref: 'a'.repeat(64), mime: o.mime || 'image/png', bytes: 250000 };
  const q = quotes.create(db, { accountId: 'acct_t', projectId: 'proj_1', operation: 'creative_3d', plan: { credits: est.credits, budgetUsd: est.budgetUsd, source, sectionId: 's2', composition: 'scroll-rotate' } });
  const before = credits.available(db, 'acct_t').total;
  const acc = quotes.accept(db, { accountId: 'acct_t', quoteId: q.id, ttlMs: 3600 * 1000 }); assert.equal(acc.ok, true);
  const fake = createFakeTripo(Object.assign({ key: KEY, mode, now: clock, queuedMs: 0 }, o.fake)); const adapter = adapterOn(fake, Object.assign({ timeoutMs: 80 }, o.adapter));
  const role = Cost.role(est, { credits: est.credits, provider: 'tripo', sourceAssetId: source.assetId, sourceRef: source.ref, mime: source.mime, sourceBytes: source.bytes, sourceBase: 'https://www.siteremade.com', sectionId: 's2', composition: 'scroll-rotate', subject: 'a tonic bottle' });
  const made = PJ.create(db, { accountId: 'acct_t', creativeJobId: q.id, projectId: 'proj_1', quoteId: q.id, opId: acc.opId, mode: 'model3d', strategy: 'standard', creditsReserved: q.credits, budgetUsd: est.budgetUsd, roles: [role] });
  const logs = []; let stored = 0; const never = () => { throw new Error('the video provider must never be called for a 3D role'); };
  const policy = Object.assign({}, QUIET, o.policy);
  const worker = () => PJ.createWorker({ db, provider: { submit: never, status: never, cancel: never, download: never }, presets: {}, store: (b, m) => { stored++; return storeIn(db)(b, m); }, sourceUrl: async () => LINK, releaseSource: () => {}, now: clock,
    enabled: () => true, provider3D: () => adapter, enabled3D: () => true, policy, log: r => logs.push(r),
    process3D: (file, r, row) => Pipeline.normalise(Object.assign({}, file, { provider: r.provider, providerAssetId: r.providerJobId, sourceAssetId: r.sourceAssetId, requestId: `${row.id}:${r.role}` }), { normalizer: 'verify' }) });
  const w = worker(); const row = () => db.premiumJobs.find(made.job.id);
  return { db, est, fake, adapter, id: made.job.id, quoteId: q.id, row, logs, before, policy,
    tick: () => w.tick(made.job.id), ticks: async n => { for (let i = 0; i < n; i++) await w.tick(made.job.id); }, restart: () => { const w2 = worker(); return { tick: () => w2.tick(made.job.id) }; },
    advance: ms => { now += ms; }, view: () => PJ.view(row()), tel: () => PJ.telemetry(row()), role: () => PJ.rolesOf(row())[0], phase: () => PJ.view(row()).roles[0].phase,
    balance: () => credits.available(db, 'acct_t').total, stored: () => stored, quote: () => quotes.get(db, 'acct_t', q.id) };
}
const money = j => { const c = j.view().credits; return [c.reserved, c.charged, c.returned, c.settled, j.balance() - j.before]; };

test('P2-9. success: quoted, reserved, sent ONCE, followed, downloaded, verified, stored -- charged only then, settled once, and nothing of the provider is kept', async () => {
  const j = tripoJob('success', { fake: { queuedMs: 1000 } });
  assert.equal(j.balance(), j.before - 3, 'reserved when the quote was confirmed, before anything is sent'); assert.equal(j.quote().status, 'accepted');
  assert.deepEqual([j.view().status, j.phase(), j.fake.count.submits], ['queued', 'queued', 0]);
  await j.tick(); assert.deepEqual([j.phase(), j.role().state, j.fake.count.submits, j.role().providerJobId], ['processing', 'processing', 1, 'tsk_mock_1_' + j.role().providerJobId.split('_')[3]]);
  j.advance(600); await j.tick(); assert.deepEqual([j.phase(), j.view().status], ['processing', 'running'], 'running at the provider: waiting is not failing');
  j.advance(600); await j.tick();
  const v = j.view(); assert.deepEqual([v.status, v.terminal, v.completed, v.message, v.roles[0].phase], ['completed', true, 1, '3D model ready', 'ready']);
  assert.deepEqual(money(j), [3, 3, 0, true, -3]); assert.equal(j.quote().status, 'settled', 'the quote is settled with its job');
  const d = v.delivered[0];
  assert.deepEqual([d.kind, d.sourceAssetId, d.sectionId, d.composition, d.premium.provider, d.threeD.normalized, d.threeD.provenance.processor], ['model3d', 'u-bottle', 's2', 'scroll-rotate', 'tripo', false, 'verify-only']);
  assert.equal(d.threeD.assetRef, sha(NORMAL)); assert.ok(getAssetStore().get(d.threeD.assetRef).equals(NORMAL), 'stored durably, byte for byte'); assert.deepEqual(TD.cleanAsset(d.threeD), d.threeD);
  // nothing signed, temporary or secret is durable state: not in the job row, not in the view, not in the telemetry, not in the log
  const durable = JSON.stringify([j.row(), v, j.tel(), j.logs, j.db.premiumMedia.find(j.role().mediaId)]);
  assert.doesNotMatch(durable, /Signature=|Expires=|mock-output\.tripo3d\.com|openapi\.tripo3d\.ai|Bearer/); assert.ok(!durable.includes(KEY));
  assert.equal(j.role().outputUrl, undefined, 'even the task reference is dropped once the model is stored');
  assert.doesNotMatch(JSON.stringify(v), /https?:\/\/|sourceRef|estimatedUsd|observedUsd|tok_3d_source/, 'the studio sees no address, no source link, no provider cost');
  const t = j.tel(); assert.deepEqual([t.providerSubmissions, t.roles[0].providerState, t.roles[0].providerSpend, t.roles[0].observedCostUsd], [1, 'completed', 'incurred', 0.5]);
  // again and again, from this worker and a restarted one: nothing is sent, stored or charged twice
  await j.ticks(3); await j.restart().tick(); assert.equal(PJ.settle(j.db, j.id).settled_at, j.row().settled_at);
  assert.deepEqual([j.fake.count.submits, j.fake.count.accepted, j.fake.count.served, j.stored(), ...money(j)], [1, 1, 1, 1, 3, 3, 0, true, -3]);
  assert.deepEqual(j.fake.calls.find(c => c.endpoint === 'submit').body, Tripo.requestBody(LINK, 'v3.1-20260211', 50000));
});

test('P2-10. queued and slow: the job keeps waiting -- one submission, credits held, nothing charged, and a restart picks the same task up', async () => {
  const q = tripoJob('queued', { fake: { queuedMs: 10000 } }); await q.ticks(4);
  assert.deepEqual([q.view().status, q.phase(), q.fake.count.submits, ...money(q)], ['running', 'processing', 1, 3, 0, 0, false, -3]);
  // the server restarts: the task is found by its id, not sent again
  const again = q.restart(); await again.tick(); q.advance(11000); await again.tick();
  assert.deepEqual([q.view().status, q.fake.count.submits, q.fake.count.accepted, ...money(q)], ['completed', 1, 1, 3, 3, 0, true, -3]);
  const s = tripoJob('slow'); await s.ticks(6);
  assert.deepEqual([s.view().status, s.view().terminal, s.phase(), s.fake.count.submits, ...money(s)], ['running', false, 'processing', 1, 3, 0, 0, false, -3]);
  // past the soft deadline it is "late" (Tripo cannot be cancelled: never claimed); past the hard one it is unresolved --
  // credits returned, and the cost honestly recorded as POSSIBLE
  s.advance(s.policy.softDeadlineMs + 1000); await s.tick(); assert.deepEqual([s.view().roles[0].late, s.role().cancelAnswer, s.view().status], [true, 'not_confirmed', 'running']);
  s.advance(s.policy.hardDeadlineMs); await s.tick();
  assert.deepEqual([s.view().status, s.view().failed[0].code, s.phase(), s.tel().roles[0].providerSpend, s.fake.count.submits, ...money(s)], ['failed', 'provider_unresolved', 'possible-cost', 'possible', 1, 3, 0, 3, true, 0]);
});

test('P2-11. failed and banned: no model, no charge -- every credit comes back, the quote is closed, and nothing is tried again', async () => {
  for (const [mode, why] of [['failed', /the provider reported failed/], ['banned', /the provider declined the content/]]) {
    const j = tripoJob(mode); await j.ticks(3);
    const v = j.view(); assert.deepEqual([v.status, v.terminal, v.completed, v.failed[0].code, v.roles[0].phase], ['failed', true, 0, 'provider_failed', 'failed'], mode);
    assert.match(v.message, why); assert.match(v.message, /^The 3D model could not be made .*; 3 SiteRemade credits returned\.$/);
    assert.deepEqual([j.fake.count.submits, j.stored(), j.tel().roles[0].providerSpend, j.quote().status, ...money(j)], [1, 0, 'none', 'settled', 3, 0, 3, true, 0], mode);
    assert.equal(j.fake.count.downloads, 0);
  }
});

test('P2-12. busy: Tripo refused it outright ("too many at once"), so it is offered again later -- and there is still only ever ONE model', async () => {
  const j = tripoJob('busy', { fake: { busy: 2 } });
  await j.tick(); assert.deepEqual([j.view().status, j.phase(), j.role().state, j.role().providerState, j.role().busyTries, j.fake.count.submits, j.fake.count.accepted], ['running', 'queued', 'pending', 'not_sent', 1, 1, 0]);
  assert.equal(j.role().submittingAt, undefined, 'a refused request is not a submission in flight'); assert.ok(j.role().nextSubmitAt);
  assert.deepEqual(money(j), [3, 0, 0, false, -3], 'credits stay reserved while it waits');
  await j.tick(); await j.tick(); await j.tick();
  assert.deepEqual([j.view().status, j.fake.count.submits, j.fake.count.accepted, j.fake.count.busy, j.stored(), ...money(j)], ['completed', 3, 1, 2, 1, 3, 3, 0, true, -3]);
  assert.deepEqual([j.tel().providerSubmissions, j.tel().roles[0].busyRefusals], [1, 2], 'one submission is on the record; the two refusals are counted as refusals');
  assert.equal(j.logs.filter(l => l.step === 'provider-busy').length, 2);
  // the wait is real: with a retry delay, a tick before it is over sends nothing
  const w = tripoJob('busy', { fake: { busy: 1 }, policy: { busyRetryMs: 15000 } }); await w.tick(); await w.tick(); await w.tick();
  assert.equal(w.fake.count.submits, 1, 'not hammered'); w.advance(15001); await w.tick(); assert.deepEqual([w.view().status, w.fake.count.submits], ['completed', 2]);
  // and it is bounded: a provider that is busy for ever is a refusal -- nothing made, every credit returned
  const never = tripoJob('busy', { fake: { busy: 99 }, policy: { maxBusyTries: 2 } }); await never.ticks(5);
  assert.deepEqual([never.view().status, never.view().failed[0].code, never.fake.count.submits, never.fake.count.accepted, never.tel().roles[0].providerSpend, ...money(never)], ['failed', 'provider_refused', 3, 0, 'none', 3, 0, 3, true, 0]);
});

test('P2-13. an expired address and a failed download are retried as DOWNLOADS: the model is never generated again', async () => {
  // the address Tripo gave when the task completed has expired by the time of the download: it was never kept, so it is
  // never used -- the download asks for its own
  const first = tripoJob('expired-url'); await first.tick();
  assert.deepEqual([first.view().status, first.fake.count.urls, first.fake.calls.filter(c => c.endpoint === 'download').map(c => c.status).join()], ['completed', 2, '200']);
  // ...and when the address a download was given expires too, that attempt fails and the next one asks again
  const e = tripoJob('expired-url', { fake: { expiredUrls: 2 } }); await e.tick();
  assert.deepEqual([e.view().status, e.phase(), e.role().downloadTries, e.fake.count.submits], ['running', 'downloading', 1, 1]); assert.match(e.role().downloadError, /403/);
  assert.equal(e.role().outputUrl, 'tripo:task:' + e.role().providerJobId, 'what is kept between attempts is the task reference -- nothing that expires');
  await e.tick(); assert.deepEqual([e.view().status, e.fake.count.submits, e.fake.count.accepted, e.role().downloadTries, e.stored(), ...money(e)], ['completed', 1, 1, 2, 1, 3, 3, 0, true, -3]);
  const d = tripoJob('download-retry', { fake: { downloadFails: 3 } }); await d.ticks(3); assert.equal(d.view().status, 'running'); await d.tick();
  assert.deepEqual([d.view().status, d.fake.count.submits, d.fake.count.downloads, d.fake.count.served, d.stored(), ...money(d)], ['completed', 1, 4, 1, 1, 3, 3, 0, true, -3]);
  // downloads that never work: bounded, credits returned, the provider's cost kept on the record (it DID make the model)
  const n = tripoJob('download-retry', { fake: { downloadFails: 999 }, policy: { maxDownloadTries: 3 } }); await n.ticks(5);
  assert.deepEqual([n.view().status, n.view().failed[0].code, n.fake.count.submits, n.tel().roles[0].providerSpend, ...money(n)], ['failed', 'download_failed', 1, 'incurred', 3, 0, 3, true, 0]);
  // a restart while the model was being checked: downloaded and checked again, not generated again
  const v = tripoJob('success'); const roles = PJ.rolesOf(v.row());
  await v.tick(); assert.equal(v.view().status, 'completed'); // (reference run: what a clean run stores)
  const r2 = tripoJob('success', { fake: { queuedMs: 1000 } }); await r2.tick(); r2.advance(1500);
  const mid = PJ.rolesOf(r2.row()); Object.assign(mid[0], { state: 'verifying', providerState: 'completed', outputUrl: `tripo:task:${mid[0].providerJobId}`, downloadTries: 1 });
  assert.ok(r2.db.premiumJobs.update(r2.id, r2.row().version, { roles_json: JSON.stringify(mid), status: 'running' }, new Date().toISOString()));
  assert.equal(r2.phase(), 'verifying'); await r2.restart().tick();
  assert.deepEqual([r2.view().status, r2.fake.count.submits, r2.fake.count.served, r2.stored(), ...money(r2)], ['completed', 1, 1, 1, 3, 3, 0, true, -3]); assert.ok(roles.length === 1);
});

test('P2-14. a model a website may not show is refused, not shipped: oversized, malformed, compressed or over-textured -- credits returned, no retry, the cost recorded as incurred', async () => {
  for (const [mode, code] of [['oversized', /too_large/], ['malformed', /./], ['compressed', /./], ['heavy-texture', /texture_too_large/]]) {
    const j = tripoJob(mode); await j.ticks(3);
    const v = j.view(); assert.deepEqual([v.status, v.completed, v.failed[0].code, v.roles[0].phase], ['failed', 0, 'processing_failed', 'failed'], mode);
    assert.match(v.message, /^The 3D model could not be made \(the 3D model could not be prepared for the website/);
    assert.match(String(j.role().failure.detail), code, mode);
    assert.deepEqual([j.fake.count.submits, j.fake.count.served, j.role().downloadTries, j.stored(), j.tel().roles[0].providerSpend, j.quote().status, ...money(j)], [1, 1, 1, 0, 'incurred', 'settled', 3, 0, 3, true, 0], mode);
    assert.ok(j.logs.some(l => l.step === 'processing-failed'), mode);
  }
});

test('P2-15. a submission nobody can vouch for is never sent again: a timeout, or an answer that was lost, is a POSSIBLE cost -- the owner gets every credit back and the record says what happened', async () => {
  for (const [mode, accepted] of [['submit-timeout', 0], ['vanish', 1]]) {
    const j = tripoJob(mode); await j.tick();
    const v = j.view(); assert.deepEqual([v.status, v.failed[0].code, v.roles[0].phase], ['failed', 'submission_uncertain', 'possible-cost'], mode);
    assert.match(v.message, /the media provider did not confirm it; it was not sent again/);
    assert.deepEqual([j.tel().roles[0].providerState, j.tel().roles[0].providerSpend, j.quote().status, ...money(j)], ['unknown', 'possible', 'settled', 3, 0, 3, true, 0], mode);
    await j.ticks(4); await j.restart().tick();
    assert.deepEqual([j.fake.count.submits, j.fake.count.accepted, j.fake.count.status, j.stored()], [1, accepted, 0, 0], `${mode}: one request, ever`);
  }
  // a crash between "about to send" and "sent": found on restart with its mark set, and treated the same way
  const c = tripoJob('success'); const roles = PJ.rolesOf(c.row()); Object.assign(roles[0], { state: 'submitting', submittingAt: new Date(Date.now() - c.policy.submitStaleMs - 1000).toISOString() });
  assert.ok(c.db.premiumJobs.update(c.id, c.row().version, { roles_json: JSON.stringify(roles), status: 'running' }, new Date().toISOString()));
  assert.equal(c.phase(), 'submitting'); await c.restart().tick(); await c.ticks(2);
  assert.deepEqual([c.view().failed[0].code, c.fake.count.submits, ...money(c)], ['submission_uncertain', 0, 3, 0, 3, true, 0]);
  // an image the adapter refuses before sending: plainly not sent, no cost
  const w = tripoJob('success', { mime: 'image/webp' }); await w.tick();
  assert.deepEqual([w.view().failed[0].code, w.tel().roles[0].providerSpend, w.fake.count.submits, ...money(w)], ['provider_refused', 'none', 0, 3, 0, 3, true, 0]);
});

test('P2-16. every way the fake provider can behave is covered above, and a video job is still a video job', () => {
  assert.deepEqual(MODES, ['success', 'queued', 'slow', 'failed', 'banned', 'busy', 'expired-url', 'download-retry', 'large', 'oversized', 'malformed', 'compressed', 'heavy-texture', 'submit-timeout', 'vanish']);
  // ('large' -- a real-sized model -- is exercised by test/three-d-persistence.test.js)
  const me = fs.readFileSync(__filename, 'utf8') + fs.readFileSync(path.join(__dirname, 'three-d-persistence.test.js'), 'utf8'); for (const m of MODES) assert.ok(me.includes(`'${m}'`), `${m} is exercised`);
  assert.ok(PJ.ROLE_STATES.includes('verifying')); assert.equal(PJ.MAX_CLIPS.model3d, 1);
  // a video role never gets a 3D phase, and a 3D job never says "video"
  const db = newDb(); credits.grant(db, { id: 'purchase:v', accountId: 'acct_v', kind: 'purchase', amount: 50, source: 'test', now: new Date() });
  credits.reserve(db, { accountId: 'acct_v', opId: 'cj_video0001:premium', amount: 5, kind: 'creative_premium', now: new Date() });
  const made = PJ.create(db, { accountId: 'acct_v', creativeJobId: 'cj_video0001', projectId: 'proj_v', opId: 'cj_video0001:premium', mode: 'hero', strategy: 'standard', creditsReserved: 5, budgetUsd: 1, roles: [{ role: 'single', preset: 'x', credits: 5, sourceAssetId: 'u1', state: 'pending' }] });
  const v = PJ.view(db.premiumJobs.find(made.job.id)); assert.equal(v.roles[0].phase, undefined); assert.doesNotMatch(JSON.stringify(v), /3D/);
  // the two kinds of job are asked for separately: a page's video job is never answered with its 3D job, or the other way round
  assert.equal(db.premiumJobs.latestForProject('acct_v', 'proj_v', '3d') || null, null); assert.equal(db.premiumJobs.latestForProject('acct_v', 'proj_v', 'video').id, made.job.id); assert.equal(db.premiumJobs.latestForProject('acct_v', 'proj_v').id, made.job.id);
  const j = tripoJob('slow'); assert.equal(j.db.premiumJobs.latestForProject('acct_t', 'proj_1', '3d').id, j.id); assert.equal(j.db.premiumJobs.latestForProject('acct_t', 'proj_1', 'video') || null, null);
});

// ================================================================ 6. THE REAL SERVER (Tripo is the fake; every other paid provider is refused)
const PHOTO_BYTES = FX.productPhoto(640, 800, false);
const PHOTO = 'data:image/png;base64,' + PHOTO_BYTES.toString('base64');
const CUT = 'data:image/png;base64,' + FX.productPhoto(640, 800, true).toString('base64');
const SMALL = 'data:image/png;base64,' + FX.productPhoto(240, 300, false).toString('base64');
const assess = (w, h, extra) => Object.assign({ width: w, height: h, aspect: +(w / h).toFixed(3), orientation: 'portrait', subject: [0.15, 0.07, 0.85, 0.93], colours: ['#1a528c', '#d49e38'], luminance: 130, background: { colour: '#f1ece2', uniformity: 0.95, tolerance: 12 }, transparent: false, transparentShare: 0, megapixels: +(w * h / 1e6).toFixed(2) }, extra || {});
const upload = extra => Object.assign({ id: 'u-bottle', origin: 'upload', title: 'Aurelia tonic', alt: 'A bottle of Aurelia tonic', mime: 'image/png', dataUrl: PHOTO, assess: assess(640, 800),
  caps: { moveFreely: false, frame: true, backdrop: false, heroSize: true, lowRes: false }, curation: { role: 'subject', identity: 'exact', depicts: 'the bottle', issues: [], separable: true, quality: 3, framing: 'whole' } }, extra || {});
const cutout = () => ({ id: 'c-bottle', origin: 'derived', cutout: true, cutoutOf: 'u-bottle', title: 'Aurelia tonic', alt: 'A bottle of Aurelia tonic', mime: 'image/png', dataUrl: CUT, processing: 'background removed',
  assess: assess(640, 800, { transparent: true, transparentShare: 0.5, background: undefined }), caps: { moveFreely: true, frame: false, backdrop: false, heroSize: true, lowRes: false } });
const UND = { kind: 'invented', subject: 'Aurelia Tonic', brief: 'a launch page for Aurelia, a small-batch tonic in a blue glass bottle', tone: { register: 'cinematic' }, identity: { name: 'Aurelia Tonic', kind: 'invented', what: 'a small-batch tonic drink product in a blue glass bottle' } };
const ASSETS = [upload(), cutout()];
const PLAN = (() => { const d = D2.direct({ understanding: UND, research: { page: null, facts: [] }, assets: ASSETS, supplied: { facts: ['Aurelia is bottled in small batches.'], memories: [] }, seed: '1', prefer: { family: 'object-story', mode: 'expressive' } }); return validatePlan2(d.plan, { assets: ASSETS, facts: [], understanding: UND, page: null, art: d.recipe }).plan; })();
const SECTIONS = PLAN.scenes.filter((s, i) => i > 0 && s.layers.some(L => L.kind === 'image' && L.asset === 'c-bottle')).map(s => s.id);
const direction = (assets, extra) => ({ mode: 'creative', meta: { id: 'c3d' }, pages: [{ id: 'creative', label: 'Creative page', sections: [] }],
  creative: Object.assign({ v: 1, brief: UND.brief, understanding: UND, supplied: { facts: ['Aurelia is bottled in small batches.'], memories: [] }, research: { status: 'none', page: null, facts: [] }, assets: assets || ASSETS, plan: PLAN, motion: { intensity: 'lively' }, cost: {} }, extra || {}) });

function serverEnv(dir, extra) {
  return Object.assign({ SITEREMADE_BACKEND: 'local', NODE_ENV: 'test', ANTHROPIC_API_KEY: 'test-only', OPENAI_API_KEY: '', HIGGSFIELD_API_KEY: 'hf-test-key:secret',
    SITEREMADE_DB_PATH: path.join(dir, 'app.db'), SITEREMADE_ASSET_STORE_DIR: path.join(dir, 'assets'), SITEREMADE_EXPORTS_DIR: path.join(dir, 'exports'), SITEREMADE_PREMIUM_LOG_DIR: path.join(dir, 'premium'), MOCK_CALL_LOG: path.join(dir, 'provider-calls.log'),
    SITEREMADE_APP_BRIDGE_ENABLED: 'true', SITEREMADE_IDENTITY_BRIDGE_MODE: 'full', SUPABASE_URL: 'https://supabase.test', SUPABASE_ANON_KEY: 'test-anon-key', SUPABASE_PUBLISHABLE_KEY: '',
    STRIPE_SECRET_KEY: 'sk_test_mock_only', STRIPE_WEBHOOK_SECRET: 'whsec_3d_phase2_test', SITEREMADE_TRIAL_CREDITS: '60',
    CREATIVE_3D: 'on', THREE_D_PROVIDER: 'tripo', TRIPO_API_KEY: KEY, SITEREMADE_3D_PROVIDER_USD: '0.50', PUBLIC_BASE_URL: 'https://www.siteremade.com', MOCK_TRIPO_FETCH_SOURCE: '1' }, extra || {});
}
// a browser session: keeps its cookie, speaks JSON, and can fetch a file
function session(port) {
  const jar = new Map(); const cookie = () => [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
  const keep = res => (res.headers.getSetCookie ? res.headers.getSetCookie() : []).forEach(c => { const [pair] = c.split(';'); const i = pair.indexOf('='); jar.set(pair.slice(0, i).trim(), pair.slice(i + 1)); });
  const call = async (method, url, body) => { const res = await fetch(`http://127.0.0.1:${port}${url}`, { method, headers: Object.assign({ 'content-type': 'application/json' }, jar.size ? { cookie: cookie() } : {}), body: body ? JSON.stringify(body) : undefined }); keep(res); return { status: res.status, body: await res.json().catch(() => null) }; };
  const raw = async (url, anonymous) => { const res = await fetch(`http://127.0.0.1:${port}${url}`, { headers: !anonymous && jar.size ? { cookie: cookie() } : {} }); return { status: res.status, type: String(res.headers.get('content-type') || ''), buf: Buffer.from(await res.arrayBuffer()) }; };
  return { call, raw };
}
const signIn = async (s, token) => assert.equal((await s.call('POST', '/api/identity/supabase/session', { supabaseAccessToken: token || 'test-access-token-owner' })).status, 200);
const saveProject = async (s, name, dir) => { const r = await s.call('POST', '/api/projects', { name, directionsState: { directions: [dir || direction()], activeDirectionIndex: 0 } }); assert.ok(r.status === 201 || r.status === 200, JSON.stringify(r.body).slice(0, 300)); return r.body.project; };
async function follow(s, jobId, seen, ms) {
  const until = Date.now() + (ms || 20000);
  for (;;) {
    const r = await s.call('GET', `/api/creative/premium/status/${jobId}`); assert.equal(r.status, 200);
    if (seen) { const p = r.body.job.roles[0].phase; if (seen[seen.length - 1] !== p) seen.push(p); }
    if (r.body.job.terminal) return r.body; assert.ok(Date.now() < until, `the job did not finish: ${JSON.stringify(r.body.job).slice(0, 300)}`); await sleep(40);
  }
}
const tripoCalls = env => providerCalls(env.MOCK_CALL_LOG).filter(c => c.provider === 'tripo');
const paidCalls = env => providerCalls(env.MOCK_CALL_LOG).filter(c => ['anthropic', 'openai', 'higgsfield', 'serpapi'].includes(c.provider));
// everything the server wrote down: its console, its premium log, its database -- as text
function written(server, env, dir) {
  const files = []; const walk = d => { if (!fs.existsSync(d)) return; for (const f of fs.readdirSync(d)) { const p = path.join(d, f); if (fs.statSync(p).isDirectory()) walk(p); else files.push(p); } };
  walk(env.SITEREMADE_PREMIUM_LOG_DIR); walk(env.SITEREMADE_EXPORTS_DIR); fs.readdirSync(dir).filter(f => /^app\.db/.test(f)).forEach(f => files.push(path.join(dir, f)));
  return { console: server.output(), files: files.map(f => ({ f, text: fs.readFileSync(f).toString('latin1') })) };
}
async function withServer(extra, fn, dirIn) {
  const dir = dirIn || fs.mkdtempSync(path.join(TMP, 'srv-')); const env = serverEnv(dir, extra); const server = await startServer(env);
  try { return await fn({ server, port: server.port, env, dir }); } finally { await server.stop(); }
}

test('P2-17. THE CUSTOMER FLOW on the real server: upload -> cost shown -> credits reserved -> one mocked Tripo job -> model verified and stored -> on the page -> saved -> reopened -> purchased -> exported and handed off as the customer\'s own files', async () => {
  await withServer({}, async ({ server, port, env, dir }) => {
    const s = session(port);
    // whether 3D is offered is the server's answer -- and it names no provider
    const av = await s.call('GET', '/api/creative/premium/3d/availability');
    assert.deepEqual(av.body, { ok: true, available: true, credits: 3, composition: 'scroll-rotate' });
    assert.equal((await s.call('POST', '/api/creative/premium/3d/quote', { projectId: 'x', assetId: 'u-bottle' })).status, 401, 'signed-in owners only');
    await signIn(s);
    assert.equal((await s.call('POST', '/api/creative/premium/3d/quote', { projectId: 'proj_missing', assetId: 'u-bottle' })).status, 404, 'a page must be saved first: the server reads the picture from its own store');
    const project = await saveProject(s, 'Aurelia');
    // QUOTE: nothing reserved, nothing sent
    const q = await s.call('POST', '/api/creative/premium/3d/quote', { projectId: project.id, assetId: 'c-bottle' });
    assert.equal(q.status, 200, JSON.stringify(q.body)); assert.equal(q.body.ok, true, JSON.stringify(q.body));
    const balance = q.body.creditsRemaining;
    assert.deepEqual([q.body.quote.operation, q.body.quote.credits, q.body.quote.status, q.body.sourceAssetId, q.body.sectionId, q.body.composition, q.body.enough], ['creative_3d', 3, 'open', 'u-bottle', SECTIONS[0], 'scroll-rotate', true], 'the cut-out the owner picked means their whole photo; the model stands in the section that shows it');
    assert.equal(q.body.quote.message, 'This 3D model will use 3 credits -- only if the model is made.');
    assert.doesNotMatch(JSON.stringify(q.body), /tripo|usd|0\.5|[a-f0-9]{64}/i); assert.deepEqual(tripoCalls(env), [], 'a quote costs nothing and sends nothing');
    // START: three at once and one more -- one job, one reservation, one submission
    const starts = await Promise.all([1, 2, 3].map(() => s.call('POST', '/api/creative/premium/3d/start', { quoteId: q.body.quote.id, subject: 'Aurelia Tonic' })));
    starts.push(await s.call('POST', '/api/creative/premium/3d/start', { quoteId: q.body.quote.id }));
    for (const r of starts) assert.equal(r.status, 200, JSON.stringify(r.body));
    const jobId = starts[0].body.job.jobId; assert.deepEqual([...new Set(starts.map(r => r.body.job.jobId))], [jobId], 'asking again returns the same job');
    assert.equal(starts.filter(r => r.body.reused === false).length, 1); assert.equal(starts[3].body.creditsRemaining, balance - 3, 'reserved once');
    assert.equal(starts[0].body.job.mode, 'model3d');
    // FOLLOWED on the existing premium status route
    const seen = []; const done = await follow(s, jobId, seen);
    const job = done.job; assert.deepEqual([job.status, job.completed, job.message, job.roles[0].phase], ['completed', 1, '3D model ready', 'ready'], JSON.stringify(job).slice(0, 400));
    assert.ok(seen.every(p => ['queued', 'submitting', 'processing', 'downloading', 'verifying', 'ready'].includes(p)), seen.join(' > '));
    assert.deepEqual([job.credits.reserved, job.credits.charged, job.credits.returned, job.credits.settled, done.creditsRemaining], [3, 3, 0, true, balance - 3]);
    const d = job.delivered[0]; assert.deepEqual([d.kind, d.sourceAssetId, d.sectionId, d.composition, d.threeD.format, d.threeD.assetRef], ['model3d', 'u-bottle', SECTIONS[0], 'scroll-rotate', 'glb', sha(NORMAL)]);
    assert.doesNotMatch(JSON.stringify(done), /https?:\/\/|Signature|tripo3d|premium-media\/source/); assert.ok(!JSON.stringify(done).includes(KEY));
    // WHAT TRIPO WAS ASKED: once, for exactly the pinned request, by a link that served the owner's own stored picture
    const calls = tripoCalls(env); const submits = calls.filter(c => c.endpoint === 'submit');
    assert.equal(submits.length, 1, 'one submission'); const link = submits[0].body.input;
    assert.match(link, /^https:\/\/www\.siteremade\.com\/api\/premium-media\/source\/[\w-]{20,}$/); assert.deepEqual(submits[0].body, Tripo.requestBody(link, 'v3.1-20260211', 50000));
    assert.deepEqual(calls.filter(c => c.endpoint === 'source-fetch').map(c => [c.status, c.type]), [[200, 'image/png']], 'the provider could fetch the picture -- and only it');
    assert.equal(calls.filter(c => c.endpoint === 'download' && c.status === 200).length, 1); assert.ok(!JSON.stringify(calls).includes(KEY));
    assert.equal((await s.raw(link.replace('https://www.siteremade.com', ''))).status, 404, 'the source link is gone once the job is done');
    // THE MODEL FILE: this account's stored copy, by SiteRemade's own path, never anyone else's
    const file = await s.raw(`/api/premium-media/${d.premium.mediaId}/file`);
    assert.deepEqual([file.status, file.type.split(';')[0]], [200, 'model/gltf-binary']); assert.ok(file.buf.equals(NORMAL));
    assert.notEqual((await s.raw(`/api/premium-media/${d.premium.mediaId}/file`, true)).status, 200, 'not without signing in');
    const other = session(port); await signIn(other, 'test-access-token-other');
    assert.notEqual((await other.raw(`/api/premium-media/${d.premium.mediaId}/file`)).status, 200, 'not another account');
    assert.equal((await other.call('GET', `/api/creative/premium/status/${jobId}`)).status, 404);
    assert.equal((await other.call('POST', '/api/creative/premium/3d/start', { quoteId: q.body.quote.id })).status, 404, 'a quote is its owner\'s');
    assert.equal((await other.call('POST', '/api/creative/premium/3d/quote', { projectId: project.id, assetId: 'u-bottle' })).status, 404);
    // DELIVERED TO THE PAGE, as the studio does it: the model, one scroll-rotate scene in its section, saved
    const sectionIds = PLAN.scenes.map(x => x.id);
    const asset = Object.assign({}, d.threeD, { dataUrl: 'data:model/gltf-binary;base64,' + file.buf.toString('base64') }); delete asset.assetRef;
    const block = TD.normalise({ assets: [asset], scenes: [{ id: 'td-' + d.sectionId, assetId: asset.id, sectionId: d.sectionId, composition: d.composition }] }, { sectionIds });
    assert.deepEqual([block.assets.length, block.scenes.length, block.scenes[0].composition, block.scenes[0].interaction], [1, 1, 'scroll-rotate', 'scroll-rotate']);
    const put = async mutate => { const p = (await s.call('GET', `/api/projects/${project.id}`)).body.project; const next = JSON.parse(JSON.stringify(p.directionsState)); mutate(next.directions[0].creative); const r = await s.call('PUT', `/api/projects/${project.id}`, { name: p.name, expectedRevision: p.revision, directionsState: next }); assert.equal(r.status, 200, JSON.stringify(r.body).slice(0, 300)); return r.body.project; };
    await put(c => { c.threeD = block; });
    // CLOSE AND REOPEN: a new session finds the page with its model, and the finished job
    const again = session(port); await signIn(again);
    const reopened = (await again.call('GET', `/api/projects/${project.id}`)).body.project.directionsState.directions[0].creative;
    assert.deepEqual([reopened.threeD.assets.length, reopened.threeD.assets[0].id, reopened.threeD.scenes[0].sectionId, reopened.threeD.scenes[0].composition], [1, asset.id, SECTIONS[0], 'scroll-rotate']);
    assert.ok(Buffer.from(reopened.threeD.assets[0].dataUrl.split(',')[1], 'base64').equals(NORMAL), 'reopened with the same model');
    const fp = await again.call('GET', `/api/creative/premium/3d/for-project/${project.id}`); assert.deepEqual([fp.body.job.jobId, fp.body.job.terminal, fp.body.job.completed], [jobId, true, 1]);
    assert.equal((await again.call('GET', `/api/creative/premium/for-project/${project.id}`)).body.job, null, 'the video job of a page is a different question: a 3D job is never mistaken for one');
    // the same quote again, a new quote for the same place: no second model
    const late = await again.call('POST', '/api/creative/premium/3d/start', { quoteId: q.body.quote.id }); assert.deepEqual([late.body.reused, late.body.job.jobId, late.body.creditsRemaining], [true, jobId, balance - 3]);
    const twice = await again.call('POST', '/api/creative/premium/3d/quote', { projectId: project.id, assetId: 'u-bottle' }); assert.deepEqual([twice.body.ok, twice.body.reason], [false, 'limit']);
    // PURCHASED, PUBLISHED, EXPORTED: the builder's export and the app handoff both carry the model and the engine
    await s.call('POST', '/api/checkout', { projectId: project.id, businessName: 'Aurelia' });
    const asked = providerCalls(env.MOCK_CALL_LOG).filter(x => x.provider === 'stripe' && x.endpoint === 'checkout' && x.projectId === project.id).pop(); assert.ok(asked, 'checkout asked the (mocked) Stripe');
    const hookBody = JSON.stringify({ id: 'evt_' + asked.session, type: 'checkout.session.completed', data: { object: { id: asked.session, payment_status: 'paid', amount_total: asked.amount, currency: 'cad' } } });
    const ts = Math.floor(Date.now() / 1000); const sig = crypto.createHmac('sha256', env.STRIPE_WEBHOOK_SECRET).update(`${ts}.${hookBody}`).digest('hex');
    assert.equal((await fetch(`http://127.0.0.1:${port}/api/stripe/webhook`, { method: 'POST', headers: { 'content-type': 'application/json', 'stripe-signature': `t=${ts},v1=${sig}` }, body: hookBody })).status, 200);
    const cur = (await s.call('GET', `/api/projects/${project.id}`)).body.project;
    const pub = await s.call('POST', `/api/projects/${project.id}/publish`, { revision: cur.revision }); assert.equal(pub.status, 200, JSON.stringify(pub.body));
    const exp = await s.call('POST', `/api/projects/${project.id}/export`, {}); assert.equal(exp.status, 201, JSON.stringify(exp.body).slice(0, 300));
    assert.deepEqual([exp.body.manifest.threeD.shipped, exp.body.manifest.threeD.models.length, exp.body.manifest.threeD.models[0].path, exp.body.manifest.threeD.engine.path], [true, 1, `assets/${sha(NORMAL)}.glb`, 'assets/sr3d.min.js']);
    const dl = await fetch(`http://127.0.0.1:${port}/api/app-bridge/website/${project.id}/download`, { headers: { authorization: 'Bearer test-access-token-owner' } });
    assert.equal(dl.status, 200); assert.equal(dl.headers.get('content-type'), 'application/zip');
    const zip = Buffer.from(await dl.arrayBuffer()); fs.writeFileSync(path.join(TMP, 'customer-flow-site.zip'), zip);
    const entries = readZip(zip); const byName = new Map(entries.map(e => [e.name, e.data]));
    assert.ok(byName.get(`assets/${sha(NORMAL)}.glb`).equals(NORMAL), 'the model is in the handoff, byte for byte');
    assert.ok(byName.get('assets/sr3d.min.js').equals(fs.readFileSync(threeD.engine().path)), 'and the engine'); assert.ok(byName.has('assets/sr3d.LICENSE.txt'));
    const html = byName.get('index.html').toString('utf8'); const data = JSON.parse(html.match(/<script type="application\/json" id="cr-3d">([\s\S]*?)<\/script>/)[1]);
    assert.deepEqual([data.runtime, data.scenes.length, data.scenes[0].model, data.scenes[0].composition], ['assets/sr3d.min.js', 1, `assets/${sha(NORMAL)}.glb`, 'scroll-rotate']);
    assert.match(html, /<html[^>]* data-3d[ >]/); assert.match(html, new RegExp(`<div class="td-stage" data-td="td-${SECTIONS[0]}" data-td-comp="scroll-rotate"`), 'the page has its 3D stage, in the section the picture is in');
    // no provider anywhere in what the customer owns: not a host, not a task id, not a link, not a key
    for (const e of entries.filter(x => /\.(html|js|json|md|txt|css)$/.test(x.name))) { const text = e.data.toString('utf8'); assert.doesNotMatch(text, /tripo3d|openapi\.tripo|tsk_mock_|premium-media|Signature=|api\/creative/i, e.name); assert.ok(!text.includes(KEY), e.name); }
    // ACCOUNTING: three credits, once; no other paid provider was touched; one model was made
    // (the balance was checked above, before the purchase -- which grants credits of its own; the job's own account is final)
    const end = await s.call('GET', `/api/creative/premium/status/${jobId}`); assert.deepEqual([end.body.job.credits.reserved, end.body.job.credits.charged, end.body.job.credits.returned, end.body.job.credits.settled], [3, 3, 0, true]);
    assert.deepEqual(paidCalls(env), [], 'no Claude, OpenAI, Higgsfield or SerpApi call in the whole flow');
    assert.equal(tripoCalls(env).filter(c => c.endpoint === 'submit').length, 1);
    // SECRETS: the key and Tripo's addresses are in nothing the server wrote
    const w = written(server, env, dir);
    assert.ok(!w.console.includes(KEY), 'not in the console'); assert.doesNotMatch(w.console, /Signature=|mock-output\.tripo3d\.com/);
    for (const f of w.files) { assert.ok(!f.text.includes(KEY), f.f); assert.doesNotMatch(f.text, /Signature=sig|mock-output\.tripo3d\.com/, f.f); }
    for (const step of ['quote', 'start']) assert.match(w.console, new RegExp(`\\[premium-media\\] \\{[^\\n]*"kind":"model3d","step":"${step}"`), `the premium log records the 3D ${step}`);
    assert.match(w.console, /"step":"delivered"/); assert.match(w.console, /"step":"settled"/);
  });
});

test('P2-18. a server restart in the middle: the job is found again and finished -- the same task, never a second submission, charged once', async () => {
  const dir = fs.mkdtempSync(path.join(TMP, 'restart-')); let jobId; let balance; let projectId;
  await withServer({ MOCK_TRIPO: 'queued', MOCK_TRIPO_MS: '2500' }, async ({ port, env }) => {
    const s = session(port); await signIn(s); const p = await saveProject(s, 'Aurelia'); projectId = p.id;
    const q = await s.call('POST', '/api/creative/premium/3d/quote', { projectId: p.id, assetId: 'u-bottle' }); balance = q.body.creditsRemaining;
    jobId = (await s.call('POST', '/api/creative/premium/3d/start', { quoteId: q.body.quote.id })).body.job.jobId;
    for (let i = 0; i < 50 && tripoCalls(env).filter(c => c.endpoint === 'submit').length === 0; i++) await sleep(40);
    assert.equal(tripoCalls(env).filter(c => c.endpoint === 'submit').length, 1);
    // while it is being made: a second quote for the page answers with the job in progress -- nothing new is quoted
    const dup = await s.call('POST', '/api/creative/premium/3d/quote', { projectId: p.id, assetId: 'u-bottle' }); assert.deepEqual([dup.body.ok, dup.body.reason, dup.body.job.jobId], [false, 'in_progress', jobId]);
    const st = await s.call('GET', `/api/creative/premium/status/${jobId}`); assert.deepEqual([st.body.job.terminal, st.body.job.message, st.body.creditsRemaining], [false, 'Creating 3D model…', balance - 3]);
  }, dir);
  await withServer({ MOCK_TRIPO: 'queued', MOCK_TRIPO_MS: '2500' }, async ({ port, env }) => {
    const s = session(port); await signIn(s);
    const fp = await s.call('GET', `/api/creative/premium/3d/for-project/${projectId}`); assert.equal(fp.body.job.jobId, jobId, 'the reopened page finds its job');
    const done = await follow(s, jobId, null, 25000);
    assert.deepEqual([done.job.status, done.job.completed, done.job.credits.charged, done.creditsRemaining], ['completed', 1, 3, balance - 3]);
    assert.equal(tripoCalls(env).filter(c => c.endpoint === 'submit').length, 1, 'one submission across both lives of the server');
    assert.equal(tripoCalls(env).filter(c => c.endpoint === 'download' && c.status === 200).length, 1);
  }, dir);
});

test('P2-19. when no model is made, nothing is charged: a provider failure, a content refusal and an unusable model each return every credit -- and the page can ask again', async () => {
  for (const [mode, code, said] of [['failed', 'provider_failed', /the provider reported failed/], ['banned', 'provider_failed', /declined the content/], ['compressed', 'processing_failed', /could not be prepared for the website/], ['vanish', 'submission_uncertain', /did not confirm it; it was not sent again/]]) {
    await withServer({ MOCK_TRIPO: mode, MOCK_TRIPO_MS: '0' }, async ({ port, env }) => {
      const s = session(port); await signIn(s); const p = await saveProject(s, 'Aurelia');
      const q = await s.call('POST', '/api/creative/premium/3d/quote', { projectId: p.id, assetId: 'u-bottle' }); const balance = q.body.creditsRemaining;
      const st = await s.call('POST', '/api/creative/premium/3d/start', { quoteId: q.body.quote.id }); assert.equal(st.body.creditsRemaining, balance - 3);
      const done = await follow(s, st.body.job.jobId);
      assert.deepEqual([done.job.status, done.job.completed, done.job.failed[0].code, done.job.credits.charged, done.job.credits.returned, done.creditsRemaining], ['failed', 0, code, 0, 3, balance], mode);
      assert.match(done.job.message, said); assert.match(done.job.message, /3 SiteRemade credits returned\.$/); assert.equal(done.job.roles[0].phase, mode === 'vanish' ? 'possible-cost' : 'failed');
      assert.equal(tripoCalls(env).filter(c => c.endpoint === 'submit').length, 1, `${mode}: one submission`);
      // the used quote is spent -- it returns its (failed) job, never a new one; a NEW quote is how the owner tries again
      const same = await s.call('POST', '/api/creative/premium/3d/start', { quoteId: q.body.quote.id }); assert.deepEqual([same.body.reused, same.body.job.jobId, same.body.creditsRemaining], [true, st.body.job.jobId, balance]);
      const next = await s.call('POST', '/api/creative/premium/3d/quote', { projectId: p.id, assetId: 'u-bottle' }); assert.equal(next.body.ok, true, 'and may be asked again');
      assert.equal(tripoCalls(env).filter(c => c.endpoint === 'submit').length, 1);
    });
  }
});

test('P2-20. what the routes refuse before any money moves: too few credits, a picture that is not the owner\'s upload, a picture too small, a price that changed, a switched-off server', async () => {
  // too few credits: 402, nothing reserved, no job, nothing sent
  await withServer({ SITEREMADE_TRIAL_CREDITS: '2' }, async ({ port, env }) => {
    const s = session(port); await signIn(s); const p = await saveProject(s, 'Aurelia');
    const q = await s.call('POST', '/api/creative/premium/3d/quote', { projectId: p.id, assetId: 'u-bottle' }); assert.deepEqual([q.body.ok, q.body.enough, q.body.creditsRemaining], [true, false, 2], 'the quote says so before the owner confirms');
    const st = await s.call('POST', '/api/creative/premium/3d/start', { quoteId: q.body.quote.id });
    assert.deepEqual([st.status, st.body.ok, st.body.reason, st.body.creditsExceeded, st.body.creditsRemaining], [402, false, 'insufficient', true, 2]);
    assert.equal((await s.call('GET', `/api/creative/premium/3d/for-project/${p.id}`)).body.job, null); assert.deepEqual(tripoCalls(env), []);
  });
  // the picture: only the owner's own upload of a suitable size, read from the saved project (never from the request)
  await withServer({}, async ({ port, env }) => {
    const s = session(port); await signIn(s);
    const web = upload({ id: 'w-bottle', origin: 'web', sourceUrl: 'https://example.com/bottle.png', pageUrl: 'https://example.com/' });
    const tiny = upload({ id: 'u-tiny', dataUrl: SMALL, assess: assess(240, 300) });
    const p = await saveProject(s, 'Aurelia', direction([upload(), cutout(), web, tiny]));
    for (const [assetId, why] of [['w-bottle', /your own upload|upload/i], ['u-tiny', /too small|small/i], ['nope', /./]]) {
      const r = await s.call('POST', '/api/creative/premium/3d/quote', { projectId: p.id, assetId }); assert.deepEqual([r.body.ok, r.body.reason], [false, 'source_not_eligible'], assetId); assert.match(r.body.message, why, assetId);
    }
    // the browser cannot name a price, a picture address or a provider: only ids are read
    const q = await s.call('POST', '/api/creative/premium/3d/quote', { projectId: p.id, assetId: 'u-bottle', credits: 0, image_url: 'https://evil.example/x.png', provider: 'mock', budgetUsd: 0 });
    assert.deepEqual([q.body.ok, q.body.quote.credits, q.body.sourceAssetId], [true, 3, 'u-bottle']);
    assert.equal((await s.call('POST', '/api/creative/premium/3d/start', { quoteId: 'q_doesnotexist' })).status, 404);
    // a quote of another kind is not a 3D quote
    assert.deepEqual(tripoCalls(env), []);
  });
  // the price rose between the quote and the confirmation (a restart with a new cost): quoted again, never absorbed
  const dir = fs.mkdtempSync(path.join(TMP, 'price-')); let quoteId; let balance;
  await withServer({}, async ({ port }) => { const s = session(port); await signIn(s); const p = await saveProject(s, 'Aurelia'); const q = await s.call('POST', '/api/creative/premium/3d/quote', { projectId: p.id, assetId: 'u-bottle' }); quoteId = q.body.quote.id; balance = q.body.creditsRemaining; }, dir);
  await withServer({ SITEREMADE_3D_PROVIDER_USD: '1.50' }, async ({ port, env }) => {
    const s = session(port); await signIn(s);
    assert.equal((await s.call('GET', '/api/creative/premium/3d/availability')).body.credits, 9);
    const st = await s.call('POST', '/api/creative/premium/3d/start', { quoteId }); assert.deepEqual([st.body.ok, st.body.reason], [false, 'price_changed']); assert.deepEqual(tripoCalls(env), []);
  }, dir);
  // switched off in each of the ways it can be: not offered, not quoted, not started -- and a confirmed quote reserves nothing
  for (const off of [{ CREATIVE_3D: '' }, { SITEREMADE_3D_PROVIDER_USD: '' }, { THREE_D_PROVIDER: '' }, { THREE_D_PROVIDER: 'meshy' }, { TRIPO_API_KEY: '' }, { PREMIUM_PROVIDER_ENABLED: 'false' }, { THREE_D_NORMALIZER: 'gltf-transform' }, { SITEREMADE_3D_MODEL_VERSION: 'latest' }]) {
    await withServer(off, async ({ port, env }) => {
      const s = session(port); await signIn(s); const label = JSON.stringify(off);
      const av = await s.call('GET', '/api/creative/premium/3d/availability'); assert.deepEqual([av.body.ok, av.body.available, typeof av.body.message, av.body.credits], [true, false, 'string', undefined], label);
      const st = await s.call('POST', '/api/creative/premium/3d/start', { quoteId }); assert.equal(st.body.ok, false, label); assert.equal(st.body.job, undefined, label);
      const p = await saveProject(s, 'Aurelia off'); const q = await s.call('POST', '/api/creative/premium/3d/quote', { projectId: p.id, assetId: 'u-bottle' }); assert.deepEqual([q.body.ok, q.body.available], [false, false], label);
      assert.equal(q.body.creditsRemaining, undefined); assert.deepEqual(tripoCalls(env), [], label);
    }, dir);
  }
  assert.ok(balance > 0);
});

test('P2-21. A DEVELOPER MACHINE WITH A REAL KEY: the server runs without the test harness\'s provider mock, the key is in its environment -- and Tripo is neither offered nor reachable', async () => {
  // (SITEREMADE_TEST_NO_PROVIDER_MOCK=1: the server decides exactly as it would on a laptop. The harness still stands at
  // the network edge to RECORD -- and refuse -- anything that tried to leave.)
  for (const extra of [{}, { NODE_ENV: 'development' }, { ALLOW_PAID_PROVIDER_CALLS: 'false', NODE_ENV: 'production' }]) {
    await withServer(Object.assign({ SITEREMADE_TEST_NO_PROVIDER_MOCK: '1', MOCK_TRIPO: 'success' }, extra), async ({ server, port, env }) => {
      const s = session(port); const label = JSON.stringify(extra);
      assert.deepEqual((await s.call('GET', '/api/creative/premium/3d/availability')).body.available, false, label);
      // (sign-in itself is not a paid provider and still works; if it does not on this configuration, the routes are closed anyway)
      const signed = await s.call('POST', '/api/identity/supabase/session', { supabaseAccessToken: 'test-access-token-owner' });
      if (signed.status === 200) {
        const p = await saveProject(s, 'Aurelia dev');
        const q = await s.call('POST', '/api/creative/premium/3d/quote', { projectId: p.id, assetId: 'u-bottle' }); assert.deepEqual([q.body.ok, q.body.available], [false, false], label);
        const st = await s.call('POST', '/api/creative/premium/3d/start', { quoteId: 'q_anything' }); assert.notEqual(st.body && st.body.ok, true, label);
      }
      assert.deepEqual(tripoCalls(env), [], `${label}: not one request was addressed to Tripo`);
      assert.ok(!server.output().includes(KEY), 'and the key is not printed');
    });
  }
});

// ================================================================ 7. NOTHING NEW IS PUBLIC
test('P2-22. nothing new is public: the adapter, the fake, the key, the logs and the stored pictures are not files a browser can fetch', async () => {
  await withServer({}, async ({ port }) => {
    const get = async u => { const r = await fetch(`http://127.0.0.1:${port}${u}`); return { status: r.status, text: await r.text() }; };
    for (const u of ['/lib/three-d/providers/tripo.js', '/lib/three-d/index.js', '/lib/three-d/pipeline.js', '/lib/paid-providers.js', '/lib/premium-jobs.js', '/lib/quotes.js', '/test/helpers/mock-tripo.js', '/test/three-d-tripo.test.js', '/test/fixtures/three-d/product-normalized.glb',
      '/server.js', '/.env', '/package.json', '/CREATIVE_3D.md', '/data/premium/premium.log', '/data/app.db', '/scripts/three-d-demo.js', '/%6cib/three-d/providers/tripo.js', '/vendor/three-d/../../lib/three-d/providers/tripo.js', '/vendor/three-d/sr3d.min.js.map', '/vendor/three-d/manifest.json']) {
      const r = await get(u); assert.equal(r.status, 404, u); assert.doesNotMatch(r.text, /createTripo|TRIPO_API_KEY|openapi\.tripo3d/, u);
    }
    // a folder is not listed: a path that names no file answers with the app's own page, as every unknown path does
    const home = (await get('/')).text;
    for (const u of ['/lib/three-d/providers/', '/lib/', '/test/helpers/', '/data/']) { const r = await get(u); assert.equal(r.text, home, u); assert.doesNotMatch(r.text, /tripo\.js|mock-tripo|Index of/i, u); }
    // the two files the 3D engine needs in a browser are still exactly the two public ones (Phase 1)
    for (const u of ['/vendor/three-d/sr3d.min.js', '/vendor/three-d/LICENSE-three.txt']) assert.equal((await get(u)).status, 200, u);
    const listed = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8').match(/'\/vendor\/[^']+'/g); assert.deepEqual([...new Set(listed)].sort(), ["'/vendor/three-d/LICENSE-three.txt'", "'/vendor/three-d/sr3d.min.js'"], 'Phase 2 adds no public file');
    // the 3D routes that carry anything are closed to a visitor
    for (const [m, u] of [['POST', '/api/creative/premium/3d/quote'], ['POST', '/api/creative/premium/3d/start'], ['GET', '/api/creative/premium/3d/for-project/x'], ['GET', '/api/creative/premium/status/x'], ['GET', '/api/premium-media/x/file']]) {
      const r = await fetch(`http://127.0.0.1:${port}${u}`, { method: m, headers: { 'content-type': 'application/json' }, body: m === 'POST' ? '{}' : undefined }); assert.ok([401, 403].includes(r.status), `${m} ${u}: ${r.status}`);
    }
    // a source link is an unguessable, single-purpose token: a made-up one serves nothing
    assert.equal((await get('/api/premium-media/source/' + 'a'.repeat(43))).status, 404);
    // and no page a visitor loads says anything about the provider
    for (const u of ['/', '/creative.js', '/creative-core.js', '/creative-studio.css']) { const r = await get(u); assert.equal(r.status, 200, u); assert.doesNotMatch(r.text, /tripo|TRIPO_API_KEY/i, u); }
  });
});

// ================================================================ 8. THE STUDIO
test('P2-23. the studio offers 3D plainly and only on request: its own heading, the cost before anything is made, what it unlocks, honest about the result -- and it never converts a picture by itself', () => {
  const js = fs.readFileSync(path.join(ROOT, 'creative.js'), 'utf8'); const start = js.indexOf('// ---------- INTERACTIVE 3D ----------'); assert.ok(start > 0);
  const ui = js.slice(start, js.indexOf('function proceedToDirection()'));
  assert.match(ui, /<h3>Interactive 3D<\/h3>/); assert.match(ui, /Turn one of your uploaded product or object pictures into a real interactive 3D element\./);
  assert.match(ui, /This will use ' \+ n \+ ' credit/); assert.match(ui, /charged only if the model is made/); assert.match(ui, /See what it costs/); assert.match(ui, /Create the 3D model/);
  assert.match(ui, /Visitors turn it by scrolling/); assert.match(ui, /sides the picture does not show are estimated, so it will not be a perfect copy/);
  assert.doesNotMatch(ui, /perfect(?! copy)|exact replica|photoreal|guarantee/i, 'no promise about geometry');
  // shown only on a Creative page, when the server offers it, with a suitable upload
  assert.match(ui, /S\.plan\.v !== 2/); assert.match(ui, /a\.origin === 'upload'/); assert.match(ui, /C\.threeD\.sourceEligible/); assert.match(ui, /\/api\/creative\/premium\/3d\/availability/);
  // nothing starts without two deliberate clicks: the quote, then the confirmation
  const startCalls = ui.match(/\/api\/creative\/premium\/3d\/start/g) || []; assert.equal(startCalls.length, 1);
  assert.match(ui, /on\('cs3dQuote', td3Quote\); on\('cs3dGo', td3Start\)/); assert.doesNotMatch(js.replace(ui, ''), /td3Start|td3Quote|3d\/start|3d\/quote/, 'no other part of the studio asks for a model');
  // the one composition offered, the same routes as premium, the model from this account's stored copy
  assert.match(ui, /'scroll-rotate'/); assert.doesNotMatch(ui, /hero-orbit|explode|turntable|pointer-tilt/); assert.match(ui, /\/api\/creative\/premium\/status\//); assert.match(ui, /\/api\/premium-media\//);
  assert.doesNotMatch(ui, /tripo|meshy|https?:\/\//i, 'the studio knows no provider and no outside address');
  // every phase the job reports has words
  for (const p of ['queued', 'submitting', 'processing', 'downloading', 'verifying', 'ready', 'failed', 'possible-cost']) assert.match(ui, new RegExp(`['"]?${p}['"]?: '`), p);
  assert.match(fs.readFileSync(path.join(ROOT, 'creative-studio.css'), 'utf8'), /\.cs-3d\{/);
});

// ================================================================ 9. $0
test('P2-24. no real network or provider call occurred in this whole file', () => {
  assert.deepEqual(net, [], 'nothing left this machine');
  assert.equal(PP.mode({}, {}), 'off'); assert.equal(PP.key('tripo'), '', 'this process has no Tripo key');
});
