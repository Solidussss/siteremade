'use strict';
// PREMIUM MEDIA (lib/media/premium-media.js, lib/media/higgsfield.js): optional, Creative only, quoted and confirmed,
// bounded (two per generation, one submit each, a provider-spend ceiling), sourced only from pictures the owner may have
// transformed, stored as the project's own assets with provenance -- never a provider URL. Higgsfield is mocked at the
// network edge (test/helpers/run-server.js): $0 of real provider spend.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const PM = require('../lib/media/premium-media');
const { createHiggsfield, scrub } = require('../lib/media/higgsfield');
const { createBudget, costs } = require('../lib/provider-budget');
const { startServer, client, providerCalls } = require('./helpers/server-process');
const { mockPng } = require('./helpers/mock-image');
const { premiumRun } = require('./helpers/premium-job');

// (an upload as the studio measures it: large enough for full-screen premium video unless a test says otherwise)
const up = (id, extra) => Object.assign({ id, origin: 'upload', title: id, mime: 'image/png', assess: { width: 1600, height: 900, aspect: 1.778, orientation: 'landscape', subject: null, colours: ['#c0502e'], luminance: 120, background: { colour: '#333333', uniformity: 0.2 } } }, extra || {});
const found = (id, license, extra) => Object.assign({ id, origin: 'research', title: id, license, pageUrl: `https://example.org/${id}` }, extra || {});

test('sources: Higgsfield transforms the owner\'s own UPLOADS only -- never a picture found on the web, whatever its licence, and never a web picture the owner picked', () => {
  const assets = [up('u1'), up('p1', { ownerPicked: true, pageUrl: 'https://shop.example/p1' }), found('r1', 'CC BY 4.0'), found('r2', ''), found('r3', 'CC0'), up('c1', { origin: 'derived', cutoutOf: 'u1' }), up('x1', { pageUrl: 'https://example.org/x1' }), up('lg', { ownerRole: 'logo' })];
  const ask = id => PM.validateRequests([{ intent: 'image_enhance', asset: id }], { assets });
  assert.equal(ask('u1').requests.length, 1, 'the owner\'s upload');
  assert.equal(ask('c1').requests.length, 1, 'a cut-out of the owner\'s upload');
  for (const id of ['r1', 'r2', 'r3']) assert.match(ask(id).dropped[0].reason, /uploaded images only/, `${id}: web pictures never, even openly licensed`);
  assert.match(ask('p1').dropped[0].reason, /a web picture you picked/);
  assert.match(ask('x1').dropped[0].reason, /uploaded images only/, 'a picture with a web address is not an upload, whatever it is labelled');
  assert.match(ask('lg').dropped[0].reason, /logo/);
  // (the old per-picture "confirm you may transform it" route is gone: there is nothing to confirm)
  assert.equal(PM.validateRequests([{ intent: 'image_enhance', asset: 'p1' }], { assets, confirmed: ['p1'] }).requests.length, 0);
});

test('the hierarchy and the bounds: never for Business, never what the spatial renderer already does, never motion on a restrained page, at most two, intents only', () => {
  const assets = [up('u1'), up('u2'), up('u3')];
  assert.equal(PM.validateRequests([{ intent: 'cinematic_hero', asset: 'u1' }], { assets, kind: 'business' }).requests.length, 0);
  const withModel = PM.validateRequests([{ intent: 'object_motion', asset: 'u1' }, { intent: 'alternate_angle', asset: 'u2' }], { assets, models: [{ id: 'm1' }] });
  assert.equal(withModel.requests.length, 0); assert.match(withModel.dropped[0].reason, /spatial renderer/);
  assert.equal(PM.validateRequests([{ intent: 'cinematic_hero', asset: 'u1' }], { assets, mode: 'quiet' }).requests.length, 0);
  const many = PM.validateRequests([{ intent: 'cinematic_hero', asset: 'u1' }, { intent: 'image_enhance', asset: 'u2' }, { intent: 'alternate_angle', asset: 'u3' }], { assets });
  assert.equal(many.requests.length, 2); assert.match(many.dropped[0].reason, /at most 2/);
  const raw = PM.validateRequests([{ intent: 'cinematic_hero', asset: 'u1', duration: 60, resolution: '4k', model: 'anything', subject: 'a <script> red sneaker' }], { assets }).requests[0];
  assert.deepEqual(Object.keys(raw).sort(), ['intent', 'mediaType', 'preset', 'sourceAssetId', 'subject', 'why'].sort(), 'no provider parameter passes');
  assert.equal(raw.preset, 'video_5s_720p'); assert.doesNotMatch(raw.subject, /[<>]/);
  assert.equal(PM.validateRequests([{ intent: 'make_it_pop', asset: 'u1' }], { assets }).requests.length, 0);
});

function fakeDb() {
  const rows = new Map();
  return { rows, premiumMedia: { insert: m => rows.set(m.id, Object.assign({}, m)), update: (id, f) => Object.assign(rows.get(id), f) }, usage: { add() {} }, ledger: { findOp: () => null } };
}
function fakeProvider(outcome) {
  const log = [];
  return { log, submit: async (endpoint, params) => { log.push({ endpoint, params }); return { requestId: 'req_1' }; }, waitFor: async () => (outcome === 'completed' ? { status: 'completed', outputUrl: 'https://out.example/x.mp4', mediaType: 'video' } : { status: outcome }), download: async () => ({ bytes: Buffer.from('mp4-bytes'), mime: 'video/mp4' }) };
}
const req = { intent: 'cinematic_hero', mediaType: 'video', preset: 'video_5s_720p', sourceAssetId: 'u1', subject: 'a red sneaker' };
const deps = (provider, budget, extra) => Object.assign({ db: fakeDb(), provider, budget, costs: costs({}), presets: PM.presets({ HIGGSFIELD_VIDEO_ENDPOINT: 'wan/v2.7/image-to-video' }), store: () => 'a'.repeat(64), sourceUrl: async () => 'https://siteremade.test/api/premium-media/source/tok', accountId: 'acct', projectId: 'p', opId: 'quote:q1' }, extra || {});

test('budget ceiling: a premium job is submitted only if its estimated cost fits the operation\'s provider budget; an extended preset steps down; nothing is silently exceeded', async () => {
  const tight = createBudget({ ceilingUsd: 0.1 });
  const p = fakeProvider('completed');
  const out = await PM.run([req], deps(p, tight));
  assert.equal(p.log.length, 0, 'not submitted'); assert.match(out.failed[0].reason, /budget/); assert.equal(tight.spentUsd(), 0);
  const ok = createBudget({ ceilingUsd: 0.6 });
  const p2 = fakeProvider('completed');
  const ext = await PM.run([Object.assign({}, req, { preset: 'video_5s_1080p' })], deps(p2, ok));
  assert.equal(ext.delivered.length, 1); assert.equal(p2.log[0].params.resolution, '720p', '1080p did not fit: stepped down to 720p');
  assert.ok(ok.spentUsd() <= ok.ceilingUsd);
});

test('failed, declined and timed-out jobs: never retried in a loop, never charged to the customer; Higgsfield\'s own failures cost nothing', async () => {
  for (const outcome of ['failed', 'nsfw', 'canceled']) {
    const b = createBudget({ ceilingUsd: 1 }); const p = fakeProvider(outcome); const d = deps(p, b);
    const out = await PM.run([req], d);
    assert.equal(p.log.length, 1, 'one submit, no retry'); assert.equal(out.delivered.length, 0); assert.equal(b.spentUsd(), 0, `${outcome} is not charged by the provider`);
    assert.equal([...d.db.rows.values()][0].status, 'failed');
  }
  const b = createBudget({ ceilingUsd: 1 }); const d = deps(fakeProvider('completed'), b);
  const out = await PM.run([req], d);
  const rec = [...d.db.rows.values()][0];
  assert.equal(rec.status, 'completed'); assert.equal(rec.asset_ref, 'a'.repeat(64));
  const prov = JSON.parse(rec.provenance_json);
  assert.equal(prov.provider, 'higgsfield'); assert.equal(prov.providerJobId, 'req_1'); assert.equal(prov.sourceAssetId, 'u1'); assert.equal(prov.storedAs, 'a'.repeat(64));
  assert.equal(out.media[0].assetRef, 'a'.repeat(64), 'the record points at the stored copy, never the provider URL');
  assert.ok(!JSON.stringify(out).includes('out.example'), 'the provider output URL is not kept');
});

test('the Higgsfield adapter: server-side Key auth, bounded polling with cancel, errors scrubbed of the key', async () => {
  const key = 'hfid_123456:hfsecret_abcdefg';
  const seen = [];
  const fetchImpl = async (url, o) => {
    seen.push({ url, auth: o && o.headers && o.headers.Authorization, method: o && o.method });
    if (/\/status$/.test(url)) return new Response(JSON.stringify({ status: 'in_progress', request_id: 'req_0001' }), { status: 200 });
    if (/\/cancel$/.test(url)) return new Response('{}', { status: 202 });
    if (/fail-me/.test(url)) return new Response(JSON.stringify({ detail: `bad key ${key}` }), { status: 401 });
    return new Response(JSON.stringify({ status: 'queued', request_id: 'req_0001', status_url: 'x' }), { status: 200 });
  };
  const hf = createHiggsfield({ key, fetchImpl, pollMs: 0, maxPolls: 3 });
  const sub = await hf.submit('wan/v2.7/image-to-video', { image_url: 'https://x', duration: 5 });
  assert.equal(sub.requestId, 'req_0001'); assert.equal(seen[0].auth, `Key ${key}`); assert.equal(seen[0].url, 'https://api.higgsfield.ai/wan/v2.7/image-to-video');
  const w = await hf.waitFor('req_0001');
  assert.equal(w.status, 'timeout'); assert.equal(seen.filter(s => /status$/.test(s.url)).length, 3, 'bounded polls'); assert.ok(seen.some(s => /cancel$/.test(s.url)));
  await assert.rejects(hf.submit('fail-me/x', {}), e => !e.message.includes('hfsecret_abcdefg') && !e.message.includes('hfid_123456'));
  await assert.rejects(hf.submit('../etc', {}), /invalid/);
  await assert.rejects(createHiggsfield({ key: '' }).submit('wan/v2.7/image-to-video', {}), /HIGGSFIELD_API_KEY is not set/);
  assert.equal(scrub(`x ${key} y`, key), 'x [key] y');
});

// ---------------------------------------------------------------- the real server
const HF_KEY = 'hfkeyid_test_0001:hfsecret_test_never_shown';
async function withServer(env, fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sr-premium-media-'));
  const e = Object.assign({ SITEREMADE_BACKEND: 'local', SITEREMADE_DB_PATH: path.join(dir, 'app.db'), SITEREMADE_ASSET_STORE_DIR: path.join(dir, 'assets'), SITEREMADE_EXPORTS_DIR: path.join(dir, 'exports'), SITEREMADE_PREMIUM_LOG_DIR: path.join(dir, 'p'), ANTHROPIC_API_KEY: '', OPENAI_API_KEY: '', STRIPE_SECRET_KEY: '', SITEREMADE_TRIAL_CREDITS: '10', MOCK_CALL_LOG: path.join(dir, 'calls.log'), NODE_ENV: 'test', HIGGSFIELD_API_KEY: HF_KEY, HIGGSFIELD_VIDEO_ENDPOINT: 'wan/v2.7/image-to-video' }, env);
  const s = await startServer(e);
  const call = client(s.port);
  await call('POST', '/api/auth/signup', { email: `pm-${process.pid}-${Date.now()}@example.com`, password: 'correct-horse-battery-staple' });
  try { await fn({ call, calls: () => providerCalls(e.MOCK_CALL_LOG), port: s.port, dir }); } finally { await s.stop(); fs.rmSync(dir, { recursive: true, force: true }); }
}
// a saved Creative page whose opening picture is the owner's own upload
function creativeProject() {
  const D2 = require('../lib/creative/director2'); const { validatePlan2 } = require('../lib/creative/validate2');
  const pic = (id, w, h) => ({ id, origin: 'upload', title: id, alt: '', mime: 'image/png', dataUrl: mockPng(id, '16:9-hd'), relevance: 2, assess: { width: w, height: h, aspect: +(w / h).toFixed(3), orientation: 'landscape', subject: [0.2, 0.2, 0.8, 0.8], colours: ['#c0502e', '#223344', '#ddeeff'], luminance: 110, background: { colour: '#333333', uniformity: 0.3 } }, caps: { moveFreely: false, frame: true, backdrop: true, heroSize: true } });
  const assets = [pic('u1', 1800, 1000), pic('u2', 1600, 1000)];
  const und = { kind: 'recognizable', subject: 'Red Sneaker', brief: 'a cinematic page for my red sneaker', tone: { register: 'cinematic' } };
  const { plan, recipe } = D2.direct({ understanding: und, research: { page: null, facts: [] }, assets, supplied: { facts: [], memories: [] }, seed: '1' });
  const v = validatePlan2(plan, { assets, facts: [], understanding: und, art: recipe });
  return { mode: 'creative', meta: { id: 'pm_test' }, pages: [{ id: 'creative', label: 'Creative page', sections: [] }], creative: { brief: und.brief, understanding: und, assets, plan: v.plan } };
}

test('server: Creative premium media is quoted, confirmed, made through the mocked provider with fixed parameters, stored locally, charged only when delivered -- and the key never leaves the server', async () => {
  await withServer({}, async ({ call, calls, port }) => {
    const saved = (await call('POST', '/api/projects', { name: 'Sneaker', directionsState: { directions: [creativeProject()], activeDirectionIndex: 0 } })).body.project;
    const proj = (await call('GET', `/api/projects/${saved.id}`)).body.project;
    const assets = proj.directionsState.directions[0].creative.assets;
    const q = await call('POST', '/api/premium-media/quote', { projectId: saved.id, requests: [{ intent: 'cinematic_hero', asset: 'u1', subject: 'a red sneaker' }], assets });
    assert.ok(q.body, `quote status ${q.status}`); assert.equal(q.body.ok, true, JSON.stringify(q.body)); assert.equal(q.body.quote.credits, 3);
    assert.match(q.body.quote.message, /up to 3 credits -- only for media that is delivered/);
    assert.equal(calls().filter(c => c.provider === 'higgsfield').length, 0, 'nothing is submitted by a quote');
    assert.ok(!JSON.stringify(q.body).includes('ref'), 'the stored source reference stays on the server');
    const x = await call('POST', '/api/premium-media/execute', { quoteId: q.body.quote.id });
    assert.equal(x.body.ok, true, JSON.stringify(x.body)); assert.deepEqual(x.body.delivered, ['cinematic_hero']);
    assert.equal(x.body.creditsCharged, 3); assert.equal(x.body.creditsRemaining, 7);
    const submit = calls().find(c => c.provider === 'higgsfield' && c.endpoint !== 'status' && c.endpoint !== 'download');
    assert.equal(submit.endpoint, '/wan/v2.7/image-to-video'); assert.equal(submit.auth, true, 'server-side Key auth');
    assert.deepEqual([submit.params.duration, submit.params.resolution], [5, '720p'], 'fixed preset parameters');
    assert.match(submit.params.image_url, /\/api\/premium-media\/source\/[\w-]{20,}$/);
    // the source link serves exactly that picture (to the provider), and only for a while
    const src = await fetch(submit.params.image_url.replace(/^https?:\/\/[^/]+/, `http://127.0.0.1:${port}`));
    assert.equal(src.status, 200); assert.equal(src.headers.get('content-type'), 'image/png');
    assert.equal((await fetch(`http://127.0.0.1:${port}/api/premium-media/source/not-a-token`)).status, 404);
    const media = x.body.assets[0];
    assert.equal(media.kind, 'video'); assert.equal(media.sourceAssetId, 'u1'); assert.match(media.video.assetRef, /^[a-f0-9]{64}$/); assert.equal(media.premium.provider, 'higgsfield');
    const file = await call('GET', `/api/premium-media/${media.video.mediaId}/file`);
    assert.equal(file.status, 200);
    assert.ok(!JSON.stringify(x.body).includes('higgsfield-output.test'), 'no provider URL reaches the page');
    for (const part of HF_KEY.split(':')) assert.ok(!JSON.stringify([q.body, x.body]).includes(part), 'the key never reaches a response');
    assert.equal((await call('POST', '/api/premium-media/execute', { quoteId: q.body.quote.id })).status, 409, 'a quote is made once');
    // the owner keeps the video on the page; bought, the export ships the stored file -- not a provider hotlink
    const st = proj.directionsState; st.directions[0].creative.assets = assets.map(a => (a.id === 'u1' ? Object.assign({}, a, { video: media.video, premium: media.premium }) : a));
    const put = await call('PUT', `/api/projects/${saved.id}`, { name: 'Sneaker', expectedRevision: proj.revision, directionsState: st });
    assert.equal(put.body.ok, true, JSON.stringify(put.body));
    assert.equal((await call('GET', `/api/projects/${saved.id}`)).body.project.directionsState.directions[0].creative.assets.find(a => a.id === 'u1').video.assetRef, media.video.assetRef, 'the video survives saving');
  });
});

test('server: Business never uses premium media; no key = clearly unavailable; a failed job and a job over budget cost nothing', async () => {
  await withServer({}, async ({ call, calls }) => {
    const r = await call('POST', '/api/premium-media/quote', { kind: 'business', requests: [{ intent: 'cinematic_hero', asset: 'u1' }], assets: [] });
    assert.equal(r.status, 409); assert.match(r.body.message, /only for Creative/);
    assert.equal(calls().filter(c => c.provider === 'higgsfield').length, 0);
  });
  await withServer({ HIGGSFIELD_API_KEY: '' }, async ({ call }) => {
    const r = await call('POST', '/api/premium-media/quote', { kind: 'creative', requests: [{ intent: 'cinematic_hero', asset: 'u1' }], assets: [] });
    assert.equal(r.body.available, false); assert.match(r.body.message, /HIGGSFIELD_API_KEY is not set/);
  });
  const upload = { id: 'u1', origin: 'upload', title: 'u1', mime: 'image/png', dataUrl: mockPng('u1', '16:9-hd') };
  await withServer({ MOCK_HIGGSFIELD: 'failed' }, async ({ call }) => {
    const q = await call('POST', '/api/premium-media/quote', { kind: 'creative', requests: [{ intent: 'cinematic_hero', asset: 'u1' }], assets: [upload] });
    const x = await call('POST', '/api/premium-media/execute', { quoteId: q.body.quote.id });
    assert.equal(x.body.ok, true); assert.deepEqual(x.body.delivered, []); assert.equal(x.body.creditsCharged, 0); assert.equal(x.body.creditsRemaining, 10);
  });
  // an expensive configured model is QUOTED at its cost (never as a cheap asset that would then be blocked or under-paid);
  // past any sane price it is not offered at all -- nothing submitted, nothing charged
  await withServer({ SITEREMADE_HIGGSFIELD_USD_VIDEO_5S_720P: '1.5', SITEREMADE_TRIAL_CREDITS: '20' }, async ({ call }) => {
    const q = await call('POST', '/api/premium-media/quote', { kind: 'creative', requests: [{ intent: 'cinematic_hero', asset: 'u1' }], assets: [upload] });
    assert.equal(q.body.quote.credits, 11, '1.5 USD (1.61 buffered) -> the video tier above the cheap ones, at its floor');
  });
  await withServer({ SITEREMADE_HIGGSFIELD_USD_VIDEO_5S_720P: '50' }, async ({ call, calls }) => {
    const q = await call('POST', '/api/premium-media/quote', { kind: 'creative', requests: [{ intent: 'cinematic_hero', asset: 'u1' }], assets: [upload] });
    assert.equal(q.body.ok, false); assert.match(q.body.message, /would exceed this generation's budget/); assert.equal(calls().filter(c => c.provider === 'higgsfield').length, 0, 'never submitted');
  });
});

test('export: a bought Creative website ships its premium video as a file of the site -- never a provider URL', () => {
  const { renderCreative2 } = require('../lib/creative/render2');
  const direction = creativeProject(); const plan = direction.creative.plan;
  const ref = 'b'.repeat(64);
  const assets = direction.creative.assets.map(a => (a.id === 'u1' ? Object.assign({}, a, { video: { mediaId: 'pm_abcdef123', assetRef: ref, mime: 'video/mp4', exportPath: `assets/${ref}.mp4` }, exportPath: 'assets/u1.png' }) : Object.assign({}, a, { exportPath: `assets/${a.id}.png` })));
  const used = plan.scenes.some(s => s.layers.some(L => L.asset === 'u1'));
  assert.ok(used, 'the page shows u1');
  const html = renderCreative2(plan, assets, { mode: 'export', src: a => a.exportPath || '', videoSrc: a => (a.video && a.video.exportPath) || '' });
  assert.match(html, new RegExp(`<video class="ly-vid"[^>]*src="assets/${ref}\\.mp4"[^>]*poster="assets/u1\\.png"`));
  assert.doesNotMatch(html, /higgsfield|\/api\/premium-media/);
  // the studio preview reads the owner's own file route, the export the bundled file; reduced motion shows the picture
  assert.match(renderCreative2(plan, assets, { mode: 'preview', src: a => a.exportPath }), /\/api\/premium-media\/pm_abcdef123\/file/);
  assert.match(html, /prefers-reduced-motion:reduce\)\{\.ly-vid\{display:none\}/);
  // and the export compiler writes that file under assets/ (by its content hash), like every other picture
  const src = fs.readFileSync(path.join(__dirname, '..', 'lib', 'export-compiler.js'), 'utf8');
  assert.match(src, /'video\/mp4': 'mp4'/); assert.match(src, /videoSrc: a => \(a\.video && a\.video\.exportPath\) \|\| ''/);
});

// ================================================================ premium media INSIDE the Creative generation
// (production bug: a brief asking for a cinematic hero video never reached Higgsfield -- premium media was never in the
// main quote, depended on the director volunteering it, and then waited behind a hidden "Price it" button)
const Q = require('../lib/quotes');
const live = (env) => ({ hasKey: true, mode: 'live', env: Object.assign({ HIGGSFIELD_VIDEO_ENDPOINT: 'kling-video/v3.0/4k/image-to-video' }, env || {}) });
const plan = (brief, provider) => PM.planForBrief({ brief, provider: provider || live(), costs: costs({}), tierFor: (intent, est) => Q.premiumTier(PM.INTENTS[intent].mediaType, est) });

test('an explicit cinematic / premium-media brief is planned into the generation; a brief without one is not -- and says so', () => {
  for (const [brief, intent] of [['A Creative site for my sneaker brand with a cinematic hero video', 'cinematic_hero'], ['Use image-to-video on the product photo', 'image_to_video'], ['Premium hero media with strong camera movement', 'cinematic_hero'], ['Show a product turn of the watch', 'object_motion'], ['Add an alternate angle of the chair', 'alternate_angle'], ['ambient environment motion behind the text', 'environment_motion'], ['cinematic transitions between scenes', 'premium_transition']]) {
    const p = plan(brief);
    assert.equal(p.requested, true, brief); assert.ok(p.intents.includes(intent), `${brief}: ${p.intents}`);
  }
  const p = plan('A Creative site for my sneaker brand with a cinematic hero video');
  assert.deepEqual(p.planned.map(x => x.intent), ['cinematic_hero']); assert.equal(p.status.planned, true);
  assert.match(p.status.message, /^Premium media planned: cinematic hero/);
  const none = plan('A bold page about the history of the bicycle');
  assert.equal(none.requested, false); assert.equal(none.status.planned, false); assert.equal(none.status.reason, 'not_requested'); assert.match(none.status.message, /^Not requested/);
});

test('Higgsfield unavailable is never silent: missing key, missing / invalid video endpoint, missing image endpoint, paid calls off -- each with its reason', () => {
  const reason = (provider, brief) => plan(brief || 'a cinematic hero video', provider).status;
  assert.equal(reason({ hasKey: false, mode: 'live', env: { HIGGSFIELD_VIDEO_ENDPOINT: 'kling-video/v3.0/4k/image-to-video' } }).reason, 'missing_api_key');
  assert.match(reason({ hasKey: false, mode: 'live', env: {} }).message, /missing API key/);
  assert.equal(reason({ hasKey: true, mode: 'live', env: {} }).reason, 'missing_video_endpoint');
  assert.match(reason({ hasKey: true, mode: 'live', env: {} }).message, /missing video endpoint/);
  assert.equal(reason({ hasKey: true, mode: 'live', env: { HIGGSFIELD_VIDEO_ENDPOINT: 'https://evil.example/kling/x' } }).reason, 'invalid_endpoint');
  assert.equal(reason({ hasKey: true, mode: 'live', env: { HIGGSFIELD_VIDEO_ENDPOINT: 'not an endpoint' } }).reason, 'invalid_endpoint');
  assert.equal(reason(live(), 'an alternate angle of the lamp').reason, 'missing_image_endpoint');
  assert.equal(reason({ hasKey: true, mode: 'off', env: { HIGGSFIELD_VIDEO_ENDPOINT: 'wan/v2.7/image-to-video' } }).reason, 'paid_providers_off');
});

test('endpoint configuration: a model id or a pasted full URL (API or docs page) normalise to the model id; anything else is a clear error; Kling gets its own parameters', () => {
  for (const v of ['kling-video/v3.0/4k/image-to-video', 'https://api.higgsfield.ai/kling-video/v3.0/4k/image-to-video', ' https://api.higgsfield.ai/kling-video/v3.0/4k/image-to-video/ ', 'https://open.higgsfield.ai/models/kling-video/v3.0/4k/image-to-video/api-reference']) {
    assert.deepEqual(PM.normalizeEndpoint(v), { ok: true, endpoint: 'kling-video/v3.0/4k/image-to-video', reason: '' }, v);
  }
  assert.equal(PM.normalizeEndpoint('').reason, 'missing'); assert.equal(PM.normalizeEndpoint('https://evil.example/a/b').reason, 'wrong_host');
  assert.equal(PM.normalizeEndpoint('kling').reason, 'invalid_format'); assert.equal(PM.normalizeEndpoint('../../etc/passwd').reason, 'invalid_format');
  assert.deepEqual(PM.paramsFor('kling-video/v3.0/4k/image-to-video', 'video'), { duration: 5, sound: 'off' }, 'Kling 3.0 documents no resolution and has sound on by default');
  assert.deepEqual(PM.paramsFor('wan/v2.7/image-to-video', 'video'), { duration: 5, resolution: '720p' });
});

test('the one main quote includes the premium media: Creative 6 + spatial 2 + cinematic hero 3 = up to 11; a costlier model is priced in its own tier', () => {
  const q = Q.build('creative_generation', { spatialPossible: true, premium: [{ intent: 'cinematic_hero', tier: Q.premiumTier('video', 0.35).code }] });
  assert.equal(q.credits, 11); assert.equal(q.minCredits, 6);
  assert.deepEqual(q.items.map(i => [i.code, i.credits, !!i.optional]), [['creative_dom', 6, false], ['spatial_surcharge', 2, true], ['premium_cinematic', 3, true]]);
  assert.match(q.items[2].label, /Cinematic hero video \(premium media, only if it is made\)/);
  // a 4K model costs more than a 3-credit asset may spend: it is quoted in the 5-credit tier, never run over budget
  // the configured 4K model costs 2.10 USD a video (confirmed): its own tier, 12 credits
  assert.deepEqual(plan('a cinematic hero video').planned.map(p => [p.tier, p.credits]), [['premium_video_4k', 12]]);
  assert.equal(Q.premiumTier('video', 9), null, 'an asset beyond any sane price is not offered at all');
});

// ---------------------------------------------------------------- the real server, end to end (Higgsfield mocked)
const SNEAKER = 'A cinematic hero video for an imaginary sneaker brand called Zorbo, with premium motion';
// (the generator's mode: Creative + Cinematic Hero -- one premium video from one suitable upload)
const HERO_MODE = { on: true, moments: 1, eligibleUploads: 1 };
async function start(call, brief, premium) {
  const p = premium === undefined ? HERO_MODE : premium;
  const ask = await call('POST', '/api/creative/research', { brief, premium: p });
  if (!ask.body.needsConfirmation) return { ask, r: ask };
  const r = await call('POST', '/api/creative/research', { brief, premium: p, quoteId: ask.body.quote.id });
  return { ask, r };
}
const direct = (call, brief, r) => call('POST', '/api/creative/plan', { brief, jobId: r.body.jobId, understanding: r.body.understanding, facts: [], supplied: {}, assets: [], thumbnails: [] });
const upload = { id: 'u1', origin: 'upload', title: 'our sneaker', mime: 'image/png', dataUrl: mockPng('sneaker', '16:9-hd') };
const unclear = { id: 'r1', origin: 'research', title: 'sneaker on a website', license: '', pageUrl: 'https://shop.example/sneaker', mime: 'image/png', dataUrl: mockPng('found', '16:9') };
const AI = { ANTHROPIC_API_KEY: 'test-only', SITEREMADE_TRIAL_CREDITS: '20', HIGGSFIELD_VIDEO_ENDPOINT: 'https://api.higgsfield.ai/kling-video/v3.0/4k/image-to-video' };

test('server: an explicit cinematic brief -> one quote with the premium media -> one confirmation -> direction -> Higgsfield runs on its own, with Kling\'s parameters, and the page knows it was made', async () => {
  await withServer(AI, async ({ call, calls }) => {
    const { ask, r } = await start(call, SNEAKER);
    assert.equal(ask.body.premium.planned, true, JSON.stringify(ask.body.premium)); assert.deepEqual(ask.body.premium.intents, ['cinematic_hero']);
    assert.equal(ask.body.quote.credits, 18, '6 + the 4K cinematic hero (12)'); assert.ok(ask.body.quote.items.some(i => /Cinematic hero video/.test(i.label)));
    assert.equal(r.body.ok, true, JSON.stringify(r.body)); assert.equal(r.body.premium.planned, true);
    assert.equal(r.body.creditsRemaining, 2, 'the whole quote (18) is reserved before anything paid runs');
    const d = await direct(call, SNEAKER, r); assert.equal(d.body.ok, true, JSON.stringify(d.body).slice(0, 300));
    assert.equal(calls().filter(c => c.provider === 'higgsfield').length, 0, 'nothing before the premium step');
    const p = await premiumRun(call, { jobId: r.body.jobId, brief: SNEAKER, heroAsset: 'u1', assets: [upload], premiumMedia: [] });
    assert.equal(p.body.ok, true, JSON.stringify(p.body)); const st = p.body.premium.status;
    assert.equal(p.body.premium.executionStarted, true); assert.deepEqual(p.body.premium.delivered, ['cinematic_hero']);
    assert.deepEqual(st.made, ['cinematic_hero']); assert.equal(st.message, 'Cinematic hero ready');
    const submit = calls().find(c => c.provider === 'higgsfield' && /image-to-video$/.test(c.endpoint));
    assert.equal(submit.endpoint, '/kling-video/v3.0/4k/image-to-video', 'the pasted full URL became the model id');
    assert.equal(submit.auth, true); assert.equal(submit.params.sound, 'off'); assert.equal(submit.params.duration, 5); assert.ok(!('resolution' in submit.params));
    assert.match(submit.params.image_url, /\/api\/premium-media\/source\//);
    assert.equal(p.body.assets[0].kind, 'video'); assert.equal(p.body.assets[0].sourceAssetId, 'u1');
    assert.equal(p.body.creditsCharged, 12); assert.equal(p.body.creditsRemaining, 2, 'the premium part was charged once (it was already reserved)');
    const again = await premiumRun(call, { jobId: r.body.jobId, brief: SNEAKER, heroAsset: 'u1', assets: [upload] });
    assert.equal(again.body.replayed, true); assert.equal(calls().filter(c => c.provider === 'higgsfield' && /image-to-video$/.test(c.endpoint)).length, 1, 'made once');
  });
});

test('server: the Creative mode (no Higgsfield) -> not planned, said plainly; Higgsfield is never called -- even when the brief mentions video', async () => {
  await withServer(AI, async ({ call, calls }) => {
    const brief = 'An imaginary kingdom run entirely by cats';
    const { ask, r } = await start(call, brief, { on: false });
    assert.equal(ask.body.quote.credits, 6); assert.equal(ask.body.premium.planned, false); assert.equal(ask.body.premium.reason, 'off');
    const v = await call('POST', '/api/quotes', { operation: 'creative_generation', request: SNEAKER, premium: { on: false } });
    assert.equal(v.body.quote.credits, 6, 'the brief asks for video, but the owner chose Creative: no premium line'); assert.equal(v.body.premium.briefAsks, true);
    await direct(call, brief, r);
    const p = await premiumRun(call, { jobId: r.body.jobId, brief, assets: [upload] });
    assert.equal(p.body.premium.status.planned, false); assert.equal(p.body.premium.status.reason, 'off'); assert.equal(p.body.premium.executionStarted, false);
    assert.equal(calls().filter(c => c.provider === 'higgsfield').length, 0);
  });
});

test('server: blocked premium media says exactly why and costs nothing -- a rights-unclear picture, no picture at all', async () => {
  await withServer(AI, async ({ call, calls }) => {
    const { r } = await start(call, SNEAKER); await direct(call, SNEAKER, r);
    const p = await premiumRun(call, { jobId: r.body.jobId, brief: SNEAKER, heroAsset: 'r1', assets: [unclear] });
    const st = p.body.premium.status;
    assert.equal(st.planned, true); assert.equal(st.reason, 'source_not_eligible');
    assert.match(st.message, /premium video uses uploaded images only/);
    assert.equal(p.body.premium.executionStarted, false); assert.equal(p.body.creditsCharged, 0); assert.equal(p.body.creditsRefunded, 12);
    assert.equal(calls().filter(c => c.provider === 'higgsfield').length, 0);
  });
  await withServer(AI, async ({ call }) => {
    const { r } = await start(call, SNEAKER); await direct(call, SNEAKER, r);
    const p = await premiumRun(call, { jobId: r.body.jobId, brief: SNEAKER, assets: [] });
    assert.equal(p.body.premium.status.reason, 'no_source'); assert.match(p.body.premium.status.message, /No picture to start from/); assert.equal(p.body.creditsRefunded, 12);
  });
});

test('server: Higgsfield not configured -> the quote does not include it and the owner is told why (missing key, missing endpoint)', async () => {
  await withServer(Object.assign({}, AI, { HIGGSFIELD_API_KEY: '' }), async ({ call }) => {
    const { ask } = await start(call, SNEAKER);
    assert.equal(ask.body.quote.credits, 6); assert.equal(ask.body.premium.planned, false); assert.equal(ask.body.premium.reason, 'missing_api_key');
    assert.match(ask.body.premium.message, /missing API key/);
  });
  await withServer(Object.assign({}, AI, { HIGGSFIELD_VIDEO_ENDPOINT: '' }), async ({ call }) => {
    const q = await call('POST', '/api/quotes', { operation: 'creative_generation', request: SNEAKER, premium: HERO_MODE });
    assert.equal(q.body.quote.credits, 6); assert.equal(q.body.premium.reason, 'missing_video_endpoint'); assert.match(q.body.premium.message, /missing video endpoint/);
  });
});

test('the studio says it every time: "Premium media planned: Yes/No" with the reason, a progress step, the automatic step after direction', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'creative.js'), 'utf8');
  const fnSrc = /function premiumHeadline\(st\) \{[^\n]*\}/.exec(src)[0];
  const premiumHeadline = new Function(`${fnSrc}; return premiumHeadline;`)();
  assert.equal(premiumHeadline({ planned: false, reason: 'not_requested', message: PM.REASONS.not_requested }), `Premium media planned: No — ${PM.REASONS.not_requested}`);
  assert.equal(premiumHeadline({ planned: false, reason: 'missing_api_key', message: PM.REASONS.missing_api_key }), `Premium media planned: No — ${PM.REASONS.missing_api_key}`);
  assert.match(premiumHeadline({ planned: true, message: 'Premium media planned: cinematic hero (made with Higgsfield after ...)' }), /^Premium media planned: Yes — cinematic hero/);
  assert.match(premiumHeadline({ planned: true, made: ['cinematic_hero'], message: 'Premium media made with Higgsfield: cinematic hero.' }), /^Premium media made with Higgsfield/);
  assert.match(premiumHeadline({ planned: true, reason: 'source_not_eligible', message: 'Premium media was planned but not made: Premium media blocked: source image not eligible for transformation.' }), /source image not eligible/);
  assert.match(src, /\['premium', 'Premium media \(Higgsfield\)'\]/, 'a progress step on every Creative generation');
  assert.match(src, /class=\\"cs-premium-status\\"|class="cs-premium-status"/, 'the direction panel shows the status');
  assert.match(src, /return runPremium\(\)\.then/, 'the premium step runs after the direction, on its own');
  assert.match(src, /request: operation === 'creative_generation' \? S\.brief : ''/, 'the quote is priced from the brief');
});

// ================================================================ the confirmed 4K cost (production: 2.10 USD per video)
test('cost model: a 5-second 4K video costs 2.10 USD (confirmed), budgeted at 2.25 with the safety buffer; both configurable, the buffer never below 1', () => {
  const c = costs({});
  assert.equal(c.higgsfield.video_4k, 2.1); assert.equal(c.higgsfieldBudget.video_4k, 2.25);
  assert.equal(costs({ SITEREMADE_HIGGSFIELD_USD_VIDEO_4K: '2.40' }).higgsfieldBudget.video_4k, 2.57);
  assert.equal(costs({ SITEREMADE_HIGGSFIELD_SAFETY_BUFFER: '1.2' }).higgsfieldBudget.video_4k, 2.52);
  assert.equal(costs({ SITEREMADE_HIGGSFIELD_SAFETY_BUFFER: '0.5' }).higgsfieldBudget.video_4k, 2.1, 'a buffer below 1 would under-budget: ignored');
  assert.notEqual(c.higgsfield.video_4k, 0.9, 'the old guess is gone');
});

test('quote math: a 4K cinematic hero is 12 credits (never below 11, never under its cost at 0.20 USD per credit); the Creative quote is 6 + 2 + 12 = up to 20', () => {
  const pricing = require('../lib/pricing');
  const t = Q.premiumTier('video', costs({}).higgsfieldBudget.video_4k);
  assert.deepEqual(t, { code: 'premium_video_4k', credits: 12 });
  assert.ok(t.credits >= 11, 'the 11-credit floor');
  assert.ok(pricing.providerCeilingUsd(t.credits) >= costs({}).higgsfieldBudget.video_4k, 'its provider ceiling covers the buffered cost: never under-quoted');
  // a cheaper confirmed cost never drops the 4K price under its floor
  assert.equal(Q.premiumTier('video', costs({ SITEREMADE_HIGGSFIELD_USD_VIDEO_4K: '1.2' }).higgsfieldBudget.video_4k).credits, 11);
  // a dearer one raises it
  assert.equal(Q.premiumTier('video', costs({ SITEREMADE_HIGGSFIELD_USD_VIDEO_4K: '3' }).higgsfieldBudget.video_4k).credits, 17);
  const p = plan('A Creative site for my sneaker brand with a cinematic hero video');
  const q = Q.build('creative_generation', { spatialPossible: true, premium: p.planned });
  assert.deepEqual(q.items.map(i => [i.code, i.credits, !!i.optional]), [['creative_dom', 6, false], ['spatial_surcharge', 2, true], ['premium_video_4k', 12, true]]);
  assert.equal(q.credits, 20); assert.equal(q.minCredits, 6, 'the premium video is charged only if it is delivered');
  assert.match(p.status.message, /cinematic hero \(12 credits\)/);
});

test('one premium hero video per generation: a second video is never started automatically; a second asset only when explicitly asked for and not another video', () => {
  const both = plan('a cinematic hero video and a product turn of the sneaker');
  assert.deepEqual(both.planned.map(x => x.intent), ['cinematic_hero'], 'the hero leads');
  assert.deepEqual(both.notPlanned, [{ intent: 'object_motion', reason: 'one_video_per_generation' }]);
  assert.match(both.status.message, /One premium video per generation/);
  const withImage = plan('a cinematic hero video and an alternate angle of the chair', live({ HIGGSFIELD_IMAGE_ENDPOINT: 'some-image-model/v1/edit' }));
  assert.deepEqual(withImage.planned.map(x => x.intent), ['cinematic_hero', 'alternate_angle'], 'an explicitly requested image may join the hero');
  assert.equal(plan('animate the photo with image-to-video and add cinematic transitions').planned.length, 1);
});

test('server: a delivered 4K hero is charged its 12 credits and records the 2.10 USD it costs; a failed or declined one returns all 12', async () => {
  await withServer(AI, async ({ call, calls }) => {
    const { r } = await start(call, SNEAKER); await direct(call, SNEAKER, r);
    const p = await premiumRun(call, { jobId: r.body.jobId, brief: SNEAKER, heroAsset: 'u1', assets: [upload] });
    assert.deepEqual(p.body.premium.delivered, ['cinematic_hero']); assert.equal(p.body.creditsCharged, 12); assert.equal(p.body.creditsRefunded, 0);
    assert.equal(calls().filter(c => c.provider === 'higgsfield' && /image-to-video$/.test(c.endpoint)).length, 1, 'one video, never more');
  });
  for (const outcome of ['failed', 'nsfw']) {
    await withServer(Object.assign({ MOCK_HIGGSFIELD: outcome }, AI), async ({ call }) => {
      const { r } = await start(call, SNEAKER); await direct(call, SNEAKER, r);
      const p = await premiumRun(call, { jobId: r.body.jobId, brief: SNEAKER, heroAsset: 'u1', assets: [upload] });
      assert.equal(p.body.premium.executionStarted, true); assert.deepEqual(p.body.premium.delivered, []);
      assert.equal(p.body.creditsCharged, 0); assert.equal(p.body.creditsRefunded, 12, `${outcome}: Higgsfield did not charge, the owner gets the 12 back`);
      assert.equal(p.body.creditsRemaining, 14, 'only the page itself (6) was charged');
      assert.match(p.body.premium.status.message, /12 credits returned/);
    });
  }
});

test('the run budgets against the buffered cost and records the actual one', async () => {
  const b = createBudget({ ceilingUsd: require('../lib/pricing').providerCeilingUsd(12) });
  const d = deps(fakeProvider('completed'), b, { presets: PM.presets({ HIGGSFIELD_VIDEO_ENDPOINT: 'kling-video/v3.0/4k/image-to-video' }) });
  const out = await PM.run([req], d);
  assert.deepEqual(out.delivered, ['cinematic_hero']); assert.equal(b.spentUsd(), 2.1, 'the actual cost is what was spent');
  assert.equal([...d.db.rows.values()][0].cost_usd, 2.1);
  const tooSmall = createBudget({ ceilingUsd: require('../lib/pricing').providerCeilingUsd(11) });
  const p2 = fakeProvider('completed');
  const out2 = await PM.run([req], deps(p2, tooSmall, { presets: PM.presets({ HIGGSFIELD_VIDEO_ENDPOINT: 'kling-video/v3.0/4k/image-to-video' }) }));
  assert.equal(p2.log.length, 0, '11 credits (2.20 USD) do not cover the buffered 2.25: nothing is submitted'); assert.equal(out2.failed[0].code, 'budget_blocked');
});
