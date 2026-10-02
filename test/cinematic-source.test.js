'use strict';
// THE CINEMATIC SOURCE of a premium clip (lib/creative/cinematic-source.js): Image (the owner's upload -- unchanged) or
// 3D Model (the page's own interactive 3D model). Higgsfield's image-to-video models take a picture and nothing else, so a
// 3D source is ONE controlled still SiteRemade renders from the stored GLB (the 3D engine's still(): lib/three-d/
// runtime-src.js; test/fixtures/three-d/product-still.png is that render of the fixture model, drawn by the engine) --
// then the same durable premium job, the same reservation and settlement, the same attach, save, app preview and export.
//
// REAL PROVIDER SPEND: $0. Higgsfield, Tripo, Claude and Stripe are the test server's mocks (test/helpers/run-server.js).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'sr-cine-src-'));
process.env.SITEREMADE_BACKEND = 'local'; process.env.SITEREMADE_ASSET_STORE_DIR = path.join(TMP, 'asset-store-inproc');

const CS = require('../lib/creative/cinematic-source');
const PM = require('../lib/media/premium-media');
const PJ = require('../lib/premium-jobs');
const PS = require('../lib/creative/premium-source');
const TD = require('../lib/creative/three-d');
const D2 = require('../lib/creative/director2');
const { validatePlan2 } = require('../lib/creative/validate2');
const { sanitizeCreative } = require('../lib/creative/store');
const { resetSqliteAdapter } = require('../lib/adapters/sqlite-database-adapter');
const { startServer, client, providerCalls } = require('./helpers/server-process');
const { threeDEnv, creativePage } = require('./helpers/three-d-scenario');
const { readZip } = require('./helpers/showcase-purchase');

const STILL = fs.readFileSync(path.join(__dirname, 'fixtures', 'three-d', 'product-still.png'));
const STILL_URL = 'data:image/png;base64,' + STILL.toString('base64');
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const SUBJECT = 'Aurelia Tonic';

// ---- a Creative page planned with a cinematic hero on its product photo (as a Cinematic Hero generation plans it).
// (its photo is 900 x 1125, portrait: too small for full-screen video by itself -- the 3D source does not need it to be;
// landscape: a 1280 x 720 photo, which the Image source can use)
const LANDSCAPE = require('./helpers/mock-image').mockPng('u-bottle', '16:9-hd');
function heroPage(opts) {
  const page = creativePage(); const c = page.creative; const assets = c.assets;
  if (opts && opts.landscape) Object.assign(assets[0], { dataUrl: LANDSCAPE, assess: Object.assign({}, assets[0].assess, { width: 1280, height: 720, aspect: 1.778, orientation: 'landscape', megapixels: 0.92 }) });
  const d = D2.direct({ understanding: c.understanding, research: { page: null, facts: [] }, assets, supplied: c.supplied, seed: 'cine', prefer: { family: 'object-story', mode: 'expressive' }, premium: { video: true, intent: 'cinematic_hero', source: 'u-bottle' } });
  c.plan = validatePlan2(d.plan, { assets, facts: [], understanding: c.understanding, page: null, art: d.recipe, premiumHero: { intent: 'cinematic_hero', source: 'u-bottle' } }).plan;
  return page;
}
const envFor = (dir, extra) => threeDEnv(dir, Object.assign({ HIGGSFIELD_API_KEY: 'hf-test-key:secret', HIGGSFIELD_VIDEO_ENDPOINT: 'https://api.higgsfield.ai/kling-video/v3.0/4k/image-to-video', MOCK_HIGGSFIELD_MS: '150', MOCK_HIGGSFIELD_FETCH_SOURCE: '1', MOCK_TRIPO: 'success', SITEREMADE_TRIAL_CREDITS: '200' }, extra || {}));
const higgsfield = env => providerCalls(env.MOCK_CALL_LOG).filter(c => c.provider === 'higgsfield');
const tripoSubmits = env => providerCalls(env.MOCK_CALL_LOG).filter(c => c.provider === 'tripo' && c.endpoint === 'submit').length;
const otherPaid = env => providerCalls(env.MOCK_CALL_LOG).filter(c => ['openai', 'serpapi'].includes(c.provider));
async function signIn(call) { assert.equal((await call('POST', '/api/identity/supabase/session', { supabaseAccessToken: 'test-access-token-owner' })).status, 200); }
async function getCreative(call, id) { const p = (await call('GET', `/api/projects/${id}`)).body.project; return { p, c: p.directionsState.directions[0].creative }; }
async function putCreative(call, id, mutate) {
  const { p } = await getCreative(call, id); const next = JSON.parse(JSON.stringify(p.directionsState)); mutate(next.directions[0].creative);
  const r = await call('PUT', `/api/projects/${id}`, { name: p.name, expectedRevision: p.revision, directionsState: next }); assert.equal(r.status, 200, JSON.stringify(r.body).slice(0, 300)); return r.body.project;
}
// the page's interactive 3D model, made once by its own job (Tripo: the fake), saved by reference as the studio saves it
async function make3D(call, projectId) {
  const q = await call('POST', '/api/creative/premium/3d/quote', { projectId, assetId: 'u-bottle' }); assert.equal(q.body.ok, true, JSON.stringify(q.body).slice(0, 300));
  const jobId = (await call('POST', '/api/creative/premium/3d/start', { quoteId: q.body.quote.id })).body.job.jobId;
  let job; for (let i = 0; i < 300; i++) { job = (await call('GET', `/api/creative/premium/status/${jobId}`)).body.job; if (job.terminal) break; await sleep(40); }
  assert.equal(job.status, 'completed'); const d = job.delivered[0];
  await putCreative(call, projectId, c => { c.threeD = TD.normalise({ assets: [d.threeD], scenes: [{ id: 'td-' + d.sectionId, assetId: d.threeD.id, sectionId: d.sectionId, composition: d.composition }] }, { sectionIds: c.plan.scenes.map(s => s.id) }); });
  return d.threeD;
}
// a Cinematic Hero generation of the page (its one quote: the page and one premium clip), confirmed -> its job id
async function cinematicGeneration(call) {
  const body = { brief: 'a launch page for Aurelia, a small-batch tonic in a blue glass bottle, with a cinematic hero video', premium: { on: true, moments: 1, eligibleUploads: 1 } };
  const ask = await call('POST', '/api/creative/research', body);
  const r = ask.body.needsConfirmation ? await call('POST', '/api/creative/research', Object.assign({}, body, { quoteId: ask.body.quote.id })) : ask;
  assert.ok(r.body.jobId, JSON.stringify(r.body).slice(0, 300)); assert.equal(r.body.premium && r.body.premium.planned, true, JSON.stringify(r.body.premium));
  return r.body.jobId;
}
// what the studio sends to start the premium job (creative.js runPremium) -- with the cinematic source when it is the model
async function startAndFinish(call, { jobId, projectId, page, cinematicSource }) {
  const assets = page.creative.assets.map(a => ({ id: a.id, origin: a.origin, title: a.title, cutoutOf: a.cutoutOf, mime: a.mime, assess: a.assess, curation: a.curation, dataUrl: a.dataUrl }));
  const start = await call('POST', '/api/creative/premium/start', Object.assign({ jobId, projectId, brief: page.creative.brief, premiumMedia: [], premiumArc: [], heroAsset: 'u-bottle', subject: SUBJECT, assets, models: [] }, cinematicSource ? { cinematicSource } : {}));
  assert.equal(start.status, 200, JSON.stringify(start.body).slice(0, 300)); assert.ok(start.body.job, JSON.stringify(start.body).slice(0, 300));
  let job; for (let i = 0; i < 400; i++) { job = (await call('GET', `/api/creative/premium/status/${start.body.job.jobId}`)).body.job; if (job.terminal) break; await sleep(40); }
  return { start, job };
}
const roleOf = (dbPath, premiumJobId) => { const db = resetSqliteAdapter(dbPath); const row = db.premiumJobs.find(premiumJobId); const media = PJ.rolesOf(row).map(r => (r.mediaId ? db.premiumMedia.find(r.mediaId) : null)); return { roles: PJ.rolesOf(row), media }; };

// ================================================================ the rules
test('CS-1. the cinematic source rules: Image unless a finished 3D model exists; the 3D still is a fixed render; the 3D clip asks for the camera move in words -- and every Image clip is asked for exactly as before', () => {
  assert.deepEqual(CS.SOURCES, ['image', 'model3d']); assert.equal(CS.clean('model3d'), 'model3d'); for (const v of ['image', '', null, 'glb', 'MODEL3D']) assert.equal(CS.clean(v), 'image');
  assert.equal(CS.MESSAGES.unavailable, 'Generate an interactive 3D model first.'); assert.equal(CS.MESSAGES.available, 'Use your generated 3D product as the cinematic motion source.');
  const assets = [{ id: 'u-bottle', origin: 'upload' }, { id: 'w-web', origin: 'research' }];
  const model = { id: 'td-a', sourceAssetId: 'u-bottle', assetRef: 'a'.repeat(64) };
  assert.equal(CS.modelFor({ assets: [model] }, assets), model);
  assert.equal(CS.modelFor(null, assets), null); assert.equal(CS.modelFor({ assets: [] }, assets), null);
  assert.equal(CS.modelFor({ assets: [Object.assign({}, model, { sourceAssetId: 'w-web' })] }, assets), null, 'a model of a web picture is never a source');
  assert.equal(CS.modelFor({ assets: [Object.assign({}, model, { assetRef: undefined })] }, assets), null, 'a model with no stored file is not finished');
  assert.equal(CS.modelFor({ assets: [model] }, [{ id: 'u-bottle', origin: 'upload', removed: true }]), null);
  // the still: a PNG of exactly the render size -- the committed fixture IS the engine's render of the fixture model
  assert.deepEqual([CS.RENDER.width, CS.RENDER.height, CS.RENDER.mime], [1920, 1080, 'image/png']);
  const hs = PS.headerSize(STILL); assert.equal(CS.renderProblem({ mime: hs.mime, width: hs.width, height: hs.height, bytes: STILL.length }), '');
  assert.match(CS.renderProblem({ mime: 'image/jpeg', width: 1920, height: 1080, bytes: 10 }), /not a PNG/); assert.match(CS.renderProblem({ mime: 'image/png', width: 1024, height: 1024, bytes: 10 }), /not 1920x1080/);
  assert.match(CS.renderProblem({ mime: 'image/png', width: 1920, height: 1080, bytes: CS.RENDER.maxBytes + 1 }), /too large/);
  // and it passes the same full-screen-video gate an upload must pass (size, 16:9 frame, the subject inside it)
  assert.equal(PS.eligible({ id: 'r', origin: 'upload', assess: { width: 1920, height: 1080, subject: [0.337, 0.223, 0.663, 0.843], transparent: false } }, {}).ok, true);
  // the prompt: an Image clip is asked for in its intent's own words (unchanged); a 3D clip for the controlled camera move
  for (const intent of PM.INTENT_NAMES) {
    assert.equal(PM.promptFor({ intent, subject: SUBJECT }), `${PM.INTENTS[intent].prompt}. Subject: ${SUBJECT}`.slice(0, 400));
    assert.equal(PM.promptFor({ intent, subject: SUBJECT, source: 'image' }), PM.promptFor({ intent, subject: SUBJECT }));
  }
  assert.equal(PM.promptFor({ intent: 'cinematic_hero', subject: SUBJECT, source: 'model3d' }), `${CS.PROMPT_3D}. Subject: ${SUBJECT}`);
  assert.match(CS.PROMPT_3D, /orbit/); assert.match(CS.PROMPT_3D, /push-in/); assert.match(CS.PROMPT_3D, /keeps exactly its shape/);
  // the choice is saved with the page only when it is the 3D model (an existing project saves exactly as before)
  assert.equal(sanitizeCreative({ premiumSource: 'model3d' }).premiumSource, 'model3d');
  assert.ok(!('premiumSource' in JSON.parse(JSON.stringify(sanitizeCreative({ premiumSource: 'image' })))));
});

// ================================================================ Image: unchanged
test('CS-2. Image source is unchanged -- even on a page that HAS a 3D model: the hero clip is made from the owner\'s upload, asked for in the cinematic hero\'s own words, with no new field anywhere', async () => {
  const dir = fs.mkdtempSync(path.join(TMP, 'image-')); const env = envFor(dir); const srv = await startServer(env);
  let premiumJobId;
  try {
    const call = client(srv.port); await signIn(call); const page = heroPage({ landscape: true });
    const projectId = (await call('POST', '/api/projects', { name: 'Aurelia', directionsState: { directions: [page], activeDirectionIndex: 0 } })).body.project.id;
    await make3D(call, projectId);
    const jobId = await cinematicGeneration(call);
    const { start, job } = await startAndFinish(call, { jobId, projectId, page }); premiumJobId = start.body.job.jobId;
    assert.deepEqual([job.status, job.completed, job.delivered[0].sourceAssetId], ['completed', 1, 'u-bottle']);
    const submits = higgsfield(env).filter(c => c.params); assert.equal(submits.length, 1);
    assert.deepEqual(Object.keys(submits[0].params).sort(), ['duration', 'image_url', 'prompt', 'sound'], 'the request Higgsfield gets has exactly the fields it always had');
    assert.equal(submits[0].params.prompt, `${PM.INTENTS.cinematic_hero.prompt}. Subject: ${SUBJECT}`);
    assert.deepEqual(higgsfield(env).filter(c => c.endpoint === 'source-fetch').map(c => c.status), [200]);
    assert.equal(tripoSubmits(env), 1, 'only the one 3D model ever made');
  } finally { await srv.stop(); }
  const { roles, media } = roleOf(env.SITEREMADE_DB_PATH, premiumJobId);
  assert.equal(roles[0].source, undefined, 'an image role carries nothing new');
  const upload = Buffer.from(LANDSCAPE.split(',')[1], 'base64');
  assert.deepEqual([roles[0].sourceRef, roles[0].mime, roles[0].sourceAssetId], [sha(upload), 'image/png', 'u-bottle'], 'Higgsfield was sent the owner\'s upload itself');
  assert.equal(JSON.parse(media[0].provenance_json).cinematicSource, undefined);
});

// ================================================================ 3D Model: the whole road
test('CS-3. 3D Model source: the saved GLB -> the rendered still -> (mocked) Higgsfield -> the premium clip -> attached and saved -> a cold restart and reopen -> the app preview -> purchased and exported; the model is never made again', async () => {
  const dir = fs.mkdtempSync(path.join(TMP, 'model3d-')); const env = envFor(dir);
  let projectId; let premiumJobId; let model; let mediaId; let balanceAfterStart; let reserved;
  let srv = await startServer(env);
  try {
    const call = client(srv.port); await signIn(call); const page = heroPage();
    projectId = (await call('POST', '/api/projects', { name: 'Aurelia', directionsState: { directions: [page], activeDirectionIndex: 0 } })).body.project.id;
    model = await make3D(call, projectId); assert.equal(tripoSubmits(env), 1);
    // the owner chose 3D Model: it is saved with the page
    await putCreative(call, projectId, c => { c.premiumSource = 'model3d'; c.threeD = Object.assign({}, c.threeD, { assets: c.threeD.assets.map(a => { const o = Object.assign({}, a); if (o.assetRef) delete o.dataUrl; return o; }) }); });
    // a Cinematic Hero generation -- the existing mode, quote and price; no new tier
    const jobId = await cinematicGeneration(call);
    const before = (await call('GET', '/api/auth/me')).body; assert.ok(before.authenticated);
    const { start, job } = await startAndFinish(call, { jobId, projectId, page, cinematicSource: { kind: 'model3d', modelId: model.id, render: STILL_URL } });
    premiumJobId = start.body.job.jobId; balanceAfterStart = start.body.creditsRemaining; reserved = start.body.job.credits.reserved;
    assert.deepEqual([job.status, job.completed, job.mode, job.credits.charged, job.credits.returned, job.credits.settled], ['completed', 1, 'hero', reserved, 0, true], JSON.stringify(job).slice(0, 400));
    const d = job.delivered[0]; assert.equal(d.kind, 'video'); assert.equal(d.sourceAssetId, 'u-bottle', 'the clip joins the page on the photo the model was made from'); mediaId = d.video.mediaId;
    // what Higgsfield got: ONE request, a picture by SiteRemade's own link, the controlled camera move in words -- the
    // link served the still (Higgsfield fetched a PNG), never a GLB
    const submits = higgsfield(env).filter(c => c.params); assert.equal(submits.length, 1, 'one submission');
    assert.deepEqual(Object.keys(submits[0].params).sort(), ['duration', 'image_url', 'prompt', 'sound'], 'the same request shape as an image clip: Higgsfield takes a picture');
    assert.match(submits[0].params.image_url, /\/api\/premium-media\/source\/[\w-]{20,}$/);
    assert.equal(submits[0].params.prompt, `${CS.PROMPT_3D}. Subject: ${SUBJECT}`);
    assert.doesNotMatch(JSON.stringify(submits[0].params), /glb|gltf|model\/|td-/i, 'no 3D file and no model reference is ever sent');
    assert.deepEqual(higgsfield(env).filter(c => c.endpoint === 'source-fetch').map(c => c.status), [200]);
    // the clip, attached as the studio attaches it, the page saved (the 3D model still on it)
    const file = await call('GET', `/api/premium-media/${mediaId}/file`); assert.ok(file);
    await putCreative(call, projectId, c => { const a = c.assets.find(x => x.id === 'u-bottle'); a.video = d.video; a.premium = d.premium; c.threeD = Object.assign({}, c.threeD, { assets: c.threeD.assets.map(x => { const o = Object.assign({}, x); if (o.assetRef) delete o.dataUrl; return o; }) }); });
    // asking again (a double click, a reload) returns the same job: nothing is rendered, sent or reserved twice
    const again = await call('POST', '/api/creative/premium/start', { jobId, projectId, assets: [], cinematicSource: { kind: 'model3d', modelId: model.id, render: STILL_URL } });
    assert.deepEqual([again.body.reused, again.body.job.jobId], [true, premiumJobId]);
  } finally { await srv.stop(); }

  // ---------------------------------------------------------- a cold restart: reopen, then the app and the export
  srv = await startServer(env);
  try {
    const call = client(srv.port); await signIn(call);
    const { p, c } = await getCreative(call, projectId);
    assert.equal(c.premiumSource, 'model3d', 'the chosen source survived the reload');
    const hero = c.assets.find(a => a.id === 'u-bottle'); assert.equal(hero.video.mediaId, mediaId, 'the clip is on the page');
    assert.equal(c.threeD.assets[0].assetRef, model.assetRef, 'and the 3D model is the same one');
    // purchased (mocked Stripe), published: the app's preview plays the clip, the ZIP ships it
    await call('POST', '/api/checkout', { projectId, businessName: 'Aurelia' });
    const asked = providerCalls(env.MOCK_CALL_LOG).filter(x => x.provider === 'stripe' && x.endpoint === 'checkout' && x.projectId === projectId).pop();
    const hook = JSON.stringify({ id: 'evt_' + asked.session, type: 'checkout.session.completed', data: { object: { id: asked.session, payment_status: 'paid', amount_total: asked.amount, currency: 'cad' } } });
    const t = Math.floor(Date.now() / 1000); const sig = crypto.createHmac('sha256', env.STRIPE_WEBHOOK_SECRET).update(`${t}.${hook}`).digest('hex');
    assert.equal((await fetch(`http://127.0.0.1:${srv.port}/api/stripe/webhook`, { method: 'POST', headers: { 'content-type': 'application/json', 'stripe-signature': `t=${t},v1=${sig}` }, body: hook })).status, 200);
    assert.equal((await call('POST', `/api/projects/${projectId}/publish`, { revision: p.revision })).status, 200);
    const bridge = async url => { const r = await fetch(`http://127.0.0.1:${srv.port}${url}`, { headers: { authorization: 'Bearer test-access-token-owner' } }); return { status: r.status, buf: Buffer.from(await r.arrayBuffer()) }; };
    const pv = await bridge(`/api/app-bridge/website/${projectId}/preview`); assert.equal(pv.status, 200);
    const html = pv.buf.toString('utf8'); const vids = [...html.matchAll(/<video[^>]*\ssrc="([^"]+)"/g)].map(m => m[1]);
    assert.ok(vids.length >= 1 && vids.every(v => v.startsWith('data:video/mp4;base64,')), 'the app preview plays the clip');
    const zip = readZip((await bridge(`/api/app-bridge/website/${projectId}/download`)).buf);
    const mp4s = [...zip.keys()].filter(n => n.endsWith('.mp4')); assert.equal(mp4s.length, 1, 'the ZIP ships the clip'); assert.ok(zip.get('index.html').toString('utf8').includes(mp4s[0]));
    assert.ok([...zip.keys()].some(n => n.endsWith('.glb')), 'and still the interactive 3D model');
    // nothing was made again: one 3D model, one clip; no other paid provider
    assert.equal(tripoSubmits(env), 1, 'the model was made once, by its own job -- never again'); assert.equal(higgsfield(env).filter(c => c.params).length, 1); assert.deepEqual(otherPaid(env), []);
  } finally { await srv.stop(); }

  // ---------------------------------------------------------- the record: what the clip was made from
  const { roles, media } = roleOf(env.SITEREMADE_DB_PATH, premiumJobId);
  assert.deepEqual([roles[0].sourceRef, roles[0].mime, roles[0].sourceAssetId], [sha(STILL), 'image/png', 'u-bottle'], 'the provider was sent the stored still');
  assert.deepEqual(roles[0].source, { kind: 'model3d', modelAssetId: model.id, modelRef: model.assetRef, renderRef: sha(STILL) });
  assert.deepEqual(JSON.parse(media[0].provenance_json).cinematicSource, roles[0].source, 'the clip\'s provenance says it came from the 3D model');
  assert.ok(balanceAfterStart >= 0 && reserved > 0);
});

test('CS-4. a 3D source that cannot be used makes nothing and charges nothing: no finished model, or a still that is not the render -- the credits come back and Higgsfield is never asked', async () => {
  const dir = fs.mkdtempSync(path.join(TMP, 'unusable-')); const env = envFor(dir); const srv = await startServer(env);
  try {
    const call = client(srv.port); await signIn(call); const page = heroPage();
    const projectId = (await call('POST', '/api/projects', { name: 'Aurelia', directionsState: { directions: [page], activeDirectionIndex: 0 } })).body.project.id;
    // no 3D model on the page
    const j1 = await cinematicGeneration(call);
    const a = await startAndFinish(call, { jobId: j1, projectId, page, cinematicSource: { kind: 'model3d', modelId: 'td-nothing', render: STILL_URL } });
    assert.deepEqual([a.job.status, a.job.failed[0].code, a.job.credits.charged, a.job.credits.returned], ['failed', 'model3d_unavailable', 0, a.job.credits.reserved]);
    assert.match(a.job.failed[0].reason, /Generate an interactive 3D model first/);
    // a model, but a still that is not the render (wrong size; not a PNG)
    const model = await make3D(call, projectId);
    for (const render of ['data:image/png;base64,' + require('./helpers/mock-image').mockPng('x', '1:1').split(',')[1], 'data:image/jpeg;base64,/9j/4AAQ', '']) {
      const j = await cinematicGeneration(call);
      const b = await startAndFinish(call, { jobId: j, projectId, page, cinematicSource: { kind: 'model3d', modelId: model.id, render } });
      assert.deepEqual([b.job.status, b.job.failed[0].code, b.job.credits.charged], ['failed', 'model3d_render', 0], render.slice(0, 30));
    }
    assert.equal(higgsfield(env).filter(c => c.params).length, 0, 'Higgsfield was never asked'); assert.equal(tripoSubmits(env), 1);
  } finally { await srv.stop(); }
});

// ================================================================ the studio
test('CS-5. the studio: Source (Image | 3D Model) in the cinematic controls, 3D Model disabled with its reason until there is a model, the way in from the 3D card, the still rendered once by the engine and sent with the start, the choice saved and restored', () => {
  const js = fs.readFileSync(path.join(ROOT, 'creative.js'), 'utf8');
  assert.match(js, /<p class="cs-pv-head">Source<\/p><div class="cs-src" role="radiogroup" aria-label="Cinematic source"><button type="button" role="radio" data-src="image" aria-checked="true">Image<\/button><button type="button" role="radio" data-src="model3d" aria-checked="false">3D Model<\/button>/);
  assert.match(js, /b\.disabled = off \|\| \(v === 'model3d' && !has\);/, 'base Creative: both choices inactive; a cinematic mode: 3D Model only with a model');
  assert.match(js, /off \? C\.cinematicSource\.MESSAGES\.inactive : has \? C\.cinematicSource\.MESSAGES\.available : C\.cinematicSource\.MESSAGES\.unavailable/);
  assert.match(js, /function cineSource\(\) \{ return currentMode\(\)\.on && S\.premiumSource === 'model3d' && cineModel\(\) \? 'model3d' : 'image'; \}/, 'the 3D source is in force only in a cinematic mode, and only with a model');
  // the way in from the 3D card never changes the mode: base Creative stays base Creative until the owner chooses
  const way = js.slice(js.indexOf('function cinematicFrom3D()'), js.indexOf('function backToPage()'));
  assert.doesNotMatch(way, /S\.mode\s*=|setMode\(/, 'choosing 3D Model never turns Creative into a cinematic generation');
  assert.equal(CS.MESSAGES.inactive, 'Creative never uses Higgsfield. Choose Creative + Cinematic Hero or Creative Showcase to use a cinematic source.');
  assert.match(js, /id="cs3dCine">Make a cinematic video from it/); assert.match(js, /function cinematicFrom3D\(\)/); assert.match(js, /id="csBackToPage"/);
  assert.match(js, /E\.still\(Object\.assign\(\{ model: url, maxBytes: C\.threeD\.LIMITS\.modelBytes \}, C\.cinematicSource\.RENDER\)\)/, 'the still is drawn by the engine, as the render spec says');
  assert.match(js, /cs \? \{ cinematicSource: cs \} : \{\}/, 'the start carries the source only when it is the model');
  assert.match(js, /if \(cine\) return Promise\.resolve\(cine\);/, 'rendered once per start: a retry sends the same still');
  assert.match(js, /premiumSource: S\.premiumSource === 'model3d' \? 'model3d' : undefined/); assert.match(js, /S\.premiumSource = c\.premiumSource === 'model3d' \? 'model3d' : 'image';/);
  // no new price: the quote is the existing mode's
  assert.doesNotMatch(js, /cinematic_3d|premium_3d_cinematic/); assert.doesNotMatch(fs.readFileSync(path.join(ROOT, 'lib', 'pricing.js'), 'utf8'), /model3d|cinematic_3d/);
  // the engine has still(), and the studio bundle carries the rules
  assert.match(fs.readFileSync(path.join(ROOT, 'vendor', 'three-d', 'sr3d.min.js'), 'utf8'), /still/); assert.ok(fs.readFileSync(path.join(ROOT, 'creative-core.js'), 'utf8').includes('cinematicSource: __require(\'cinematic-source\')'));
});

test('CS-6. with 3D Model chosen, the page\'s model counts as a source everywhere a mode checks its sources: the confirmation, the price note and the cheaper-mode offer (a photo too small for video is no longer a blocker)', () => {
  const js = fs.readFileSync(path.join(ROOT, 'creative.js'), 'utf8');
  assert.match(js, /var m = currentMode\(\); var have = m\.on \? sourceCount\(\) : 0;/);
  assert.match(js, /currentMode\(\)\.on && sourceCount\(\) < currentMode\(\)\.needs/);
  assert.match(js, /x\.needs <= sourceCount\(\)/);
  assert.match(js, /eligibleUploads: m\.on \? sourceCount\(\) : 0/);
  // the only remaining upload-only count is the one sourceCount is built from
  assert.deepEqual((js.match(/eligibleCount\(\)/g) || []).length, 2, 'eligibleCount() is defined once and used once, inside sourceCount()');
});

test('CS-7. planning: with 3D Model chosen, the page is planned around a hero video on the photo the model was made from -- even when that photo is too small for video by itself; with Image, the same photo is (still) refused', async () => {
  const dir = fs.mkdtempSync(path.join(TMP, 'plan-')); const env = envFor(dir); const srv = await startServer(env);
  try {
    const call = client(srv.port); await signIn(call); const page = creativePage(); const c = page.creative;
    const inventory = c.assets.map(a => ({ id: a.id, origin: a.origin, title: a.title, alt: a.alt, assess: a.assess, caps: a.caps, curation: a.curation, cutoutOf: a.cutoutOf, cutout: a.cutout, mime: a.mime })); // (as the studio's inventory(): no picture bytes)
    const plan = async cinematic => {
      const jobId = await cinematicGeneration(call);
      const r = await call('POST', '/api/creative/plan', Object.assign({ jobId, brief: c.brief, understanding: c.understanding, page: null, facts: [], supplied: c.supplied, assets: inventory, models: [], seed: '1' }, cinematic ? { cinematicSource: { kind: 'model3d', sourceAssetId: 'u-bottle' } } : {}));
      assert.equal(r.status, 200, JSON.stringify(r.body).slice(0, 300)); return r.body.visualPlan && r.body.visualPlan.premiumHero;
    };
    const image = await plan(false);
    assert.equal(image.source, null, 'Image: the 900 x 1125 photo may not be sent for video'); assert.match(image.note, /no picture may be sent for the video: upload too small/);
    const model = await plan(true);
    assert.equal(model.source, 'u-bottle', '3D Model: the photo the model was made from is the hero video\'s place'); assert.equal(model.note, '');
    assert.equal(higgsfield(env).filter(x => x.params).length, 0, 'planning sends nothing'); assert.equal(tripoSubmits(env), 0);
  } finally { await srv.stop(); }
  // and the studio sends the choice with the plan request, only when it is the model
  assert.match(fs.readFileSync(path.join(ROOT, 'creative.js'), 'utf8'), /cinematicSource: cineSource\(\) === 'model3d' \? \{ kind: 'model3d', sourceAssetId: cineModel\(\)\.sourceAssetId \} : undefined/);
});

// ================================================================ the pricing rule
test('CS-8. base Creative (6 credits) NEVER calls Higgsfield: with 3D Model chosen and every premium field a client could add -- the quote is 6 credits with no premium line, no premium job is made, the still is not even stored, and Higgsfield gets nothing', async () => {
  const dir = fs.mkdtempSync(path.join(TMP, 'base-')); const env = envFor(dir); const srv = await startServer(env);
  let projectId; let accountId;
  try {
    const call = client(srv.port); await signIn(call); accountId = (await call('GET', '/api/auth/me')).body.account.id; const page = heroPage();
    projectId = (await call('POST', '/api/projects', { name: 'Aurelia', directionsState: { directions: [page], activeDirectionIndex: 0 } })).body.project.id;
    const model = await make3D(call, projectId);
    await putCreative(call, projectId, c => { c.premiumSource = 'model3d'; c.threeD = Object.assign({}, c.threeD, { assets: c.threeD.assets.map(a => { const o = Object.assign({}, a); if (o.assetRef) delete o.dataUrl; return o; }) }); });
    // the base Creative generation: premium off -- with a 3D source and premium fields sent anyway, as a manipulated client could
    const body = { brief: page.creative.brief, premium: { on: false, moments: 3, eligibleUploads: 5 }, cinematicSource: { kind: 'model3d', modelId: model.id } };
    const ask = await call('POST', '/api/creative/research', body);
    assert.equal(ask.body.needsConfirmation, true); const q = ask.body.quote;
    assert.equal(q.credits, 6, 'Creative is 6 credits'); assert.equal(q.items.filter(i => /^premium_/.test(i.code)).length, 0, 'and has no premium line');
    const r = await call('POST', '/api/creative/research', Object.assign({}, body, { quoteId: q.id })); const jobId = r.body.jobId; assert.ok(jobId, JSON.stringify(r.body).slice(0, 200));
    assert.notEqual(r.body.premium && r.body.premium.planned, true, 'no premium planned');
    // the page is directed with a 3D source claimed: no hero video is planned
    const plan = await call('POST', '/api/creative/plan', { jobId, brief: page.creative.brief, understanding: page.creative.understanding, page: null, facts: [], supplied: page.creative.supplied, assets: page.creative.assets.map(a => ({ id: a.id, origin: a.origin, title: a.title, assess: a.assess, caps: a.caps, curation: a.curation, cutoutOf: a.cutoutOf, cutout: a.cutout, mime: a.mime })), models: [], seed: '1', cinematicSource: { kind: 'model3d', sourceAssetId: 'u-bottle' } });
    assert.equal(plan.status, 200); assert.equal((plan.body.visualPlan || {}).premiumHero || null, null, 'no hero video in a base Creative page');
    // the premium start, asked every way a client could: a 3D still, premium suggestions, an arc, a hero picture -- on both routes
    for (const route of ['/api/creative/premium/start', '/api/creative/premium']) {
      const s = await call('POST', route, { jobId, projectId, brief: page.creative.brief, heroAsset: 'u-bottle', subject: SUBJECT, assets: page.creative.assets.map(a => ({ id: a.id, origin: a.origin, title: a.title, mime: a.mime, assess: a.assess, dataUrl: a.dataUrl })),
        premiumMedia: [{ intent: 'cinematic_hero', asset: 'u-bottle' }, { intent: 'object_motion', asset: 'u-bottle' }], premiumArc: [{ role: 'hero', asset: 'u-bottle' }, { role: 'takeover', asset: 'u-bottle' }, { role: 'payoff', asset: 'u-bottle' }],
        cinematicSource: { kind: 'model3d', modelId: model.id, render: STILL_URL } });
      assert.equal(s.status, 200, route); assert.equal(s.body.job, null, `${route}: no premium job`);
    }
    await sleep(400); // (a job, had one been made, would have submitted by now)
    assert.equal((await call('GET', `/api/creative/premium/3d/for-project/${projectId}`)).body.job.mode, 'model3d', '(the only job of the page is its 3D model job)');
    assert.equal((await call('GET', `/api/creative/premium/for-project/${projectId}`)).body.job, null, 'no premium video job for the page');
    assert.equal(higgsfield(env).length, 0, 'ZERO Higgsfield requests of any kind'); assert.equal(tripoSubmits(env), 1, '(the 3D model is the one made earlier)');
  } finally { await srv.stop(); }
  const db = resetSqliteAdapter(env.SITEREMADE_DB_PATH);
  assert.equal(db.assetBlobs.find(sha(STILL)) || null, null, 'the 3D still was never even stored');
  assert.equal(db.premiumJobs.latestForProject(accountId, projectId, 'video') || null, null);
});

test('CS-9. Creative Showcase with 3D Model: the hero and the payoff start from the still of the model, the takeover from its own photo -- three clips, one priced job, nothing made again', async () => {
  const dir = fs.mkdtempSync(path.join(TMP, 'showcase-')); const env = envFor(dir); const srv = await startServer(env);
  let premiumJobId; let model; const SIDE = require('./helpers/mock-image').mockPng('u-side', '16:9-hd');
  try {
    const call = client(srv.port); await signIn(call); const page = heroPage();
    page.creative.assets.push({ id: 'u-side', origin: 'upload', title: 'Aurelia on the shelf', alt: 'The bottle on a shelf', mime: 'image/png', dataUrl: SIDE, assess: Object.assign({}, page.creative.assets[0].assess, { width: 1280, height: 720, aspect: 1.778, orientation: 'landscape', megapixels: 0.92 }), caps: { moveFreely: false, frame: true, backdrop: true, heroSize: true, lowRes: false }, curation: { role: 'environment', identity: 'related', depicts: 'a shelf', issues: [] } });
    const projectId = (await call('POST', '/api/projects', { name: 'Aurelia', directionsState: { directions: [page], activeDirectionIndex: 0 } })).body.project.id;
    model = await make3D(call, projectId);
    const body = { brief: page.creative.brief, premium: { on: true, moments: 3, eligibleUploads: 2 } };
    const ask = await call('POST', '/api/creative/research', body); assert.equal(ask.body.quote.items.filter(i => /^premium_/.test(i.code)).length, 3, 'a showcase: three priced moments');
    const jobId = (await call('POST', '/api/creative/research', Object.assign({}, body, { quoteId: ask.body.quote.id }))).body.jobId;
    const assets = page.creative.assets.map(a => ({ id: a.id, origin: a.origin, title: a.title, cutoutOf: a.cutoutOf, mime: a.mime, assess: a.assess, curation: a.curation, dataUrl: a.dataUrl }));
    const start = await call('POST', '/api/creative/premium/start', { jobId, projectId, brief: page.creative.brief, premiumMedia: [], heroAsset: 'u-bottle', subject: SUBJECT, assets, models: [],
      premiumArc: [{ role: 'hero', asset: 'u-bottle' }, { role: 'takeover', asset: 'u-side' }, { role: 'payoff', asset: 'u-bottle' }], cinematicSource: { kind: 'model3d', modelId: model.id, render: STILL_URL } });
    premiumJobId = start.body.job.jobId;
    let job; for (let i = 0; i < 400; i++) { job = (await call('GET', `/api/creative/premium/status/${premiumJobId}`)).body.job; if (job.terminal) break; await sleep(40); }
    assert.deepEqual([job.status, job.completed, job.mode], ['completed', 3, 'showcase'], JSON.stringify(job.failed));
    const prompts = higgsfield(env).filter(c => c.params).map(c => c.params.prompt);
    assert.equal(prompts.length, 3, 'one submission per moment');
    assert.equal(prompts.filter(p => p.startsWith(CS.PROMPT_3D)).length, 2, 'hero and payoff: the 3D camera move'); assert.equal(prompts.filter(p => p.startsWith(PM.INTENTS.premium_transition.prompt)).length, 1, 'the takeover: its own words');
    assert.equal(tripoSubmits(env), 1);
  } finally { await srv.stop(); }
  const { roles } = roleOf(env.SITEREMADE_DB_PATH, premiumJobId); const by = Object.fromEntries(roles.map(r => [r.role, r]));
  assert.deepEqual([by.hero.sourceRef, by.payoff.sourceRef], [sha(STILL), sha(STILL)]); assert.deepEqual([by.hero.source.kind, by.payoff.source.kind, by.hero.source.modelAssetId], ['model3d', 'model3d', model.id]);
  assert.equal(by.takeover.sourceRef, sha(Buffer.from(SIDE.split(',')[1], 'base64'))); assert.equal(by.takeover.source, undefined, 'the takeover is an image clip, as before');
});
