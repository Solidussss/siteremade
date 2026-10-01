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

const up = (id, extra) => Object.assign({ id, origin: 'upload', title: id, mime: 'image/png' }, extra || {});
const found = (id, license, extra) => Object.assign({ id, origin: 'research', title: id, license, pageUrl: `https://example.org/${id}` }, extra || {});

test('sources: the owner\'s own pictures and openly licensed ones may be transformed; rights-unclear, NoDerivatives and Wikimedia pictures never are; a picked web picture needs the owner\'s explicit confirmation', () => {
  const assets = [up('u1'), up('p1', { ownerPicked: true }), found('r1', 'CC BY 4.0'), found('r2', ''), found('r3', 'CC BY-ND 4.0'), found('r4', 'CC0', { pageUrl: 'https://commons.wikimedia.org/wiki/File:x.jpg' }), up('c1', { origin: 'derived', cutoutOf: 'u1' })];
  const ask = (asset, confirmed) => PM.validateRequests([{ intent: 'image_enhance', asset }], { assets, confirmed });
  assert.equal(ask('u1').requests.length, 1);
  assert.equal(ask('c1').requests.length, 1, 'a cut-out of the owner\'s picture');
  assert.equal(ask('r1').requests.length, 1, 'CC BY permits a modified version');
  assert.match(ask('r2').dropped[0].reason, /rights are unclear/);
  assert.match(ask('r3').dropped[0].reason, /unclear/, 'NoDerivatives is not a licence to transform');
  assert.match(ask('r4').dropped[0].reason, /Wikimedia/);
  assert.match(ask('p1').dropped[0].reason, /must confirm/);
  assert.equal(ask('p1', ['p1']).requests.length, 1);
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
const deps = (provider, budget, extra) => Object.assign({ db: fakeDb(), provider, budget, costs: costs({}), presets: PM.presets({}), store: () => 'a'.repeat(64), sourceUrl: async () => 'https://siteremade.test/api/premium-media/source/tok', accountId: 'acct', projectId: 'p', opId: 'quote:q1' }, extra || {});

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
  const e = Object.assign({ SITEREMADE_BACKEND: 'local', SITEREMADE_DB_PATH: path.join(dir, 'app.db'), SITEREMADE_ASSET_STORE_DIR: path.join(dir, 'assets'), SITEREMADE_EXPORTS_DIR: path.join(dir, 'exports'), SITEREMADE_PREMIUM_LOG_DIR: path.join(dir, 'p'), ANTHROPIC_API_KEY: '', OPENAI_API_KEY: '', STRIPE_SECRET_KEY: '', SITEREMADE_TRIAL_CREDITS: '10', MOCK_CALL_LOG: path.join(dir, 'calls.log'), NODE_ENV: 'test', HIGGSFIELD_API_KEY: HF_KEY }, env);
  const s = await startServer(e);
  const call = client(s.port);
  await call('POST', '/api/auth/signup', { email: `pm-${process.pid}-${Date.now()}@example.com`, password: 'correct-horse-battery-staple' });
  try { await fn({ call, calls: () => providerCalls(e.MOCK_CALL_LOG), port: s.port, dir }); } finally { await s.stop(); fs.rmSync(dir, { recursive: true, force: true }); }
}
// a saved Creative page whose opening picture is the owner's own upload
function creativeProject() {
  const D2 = require('../lib/creative/director2'); const { validatePlan2 } = require('../lib/creative/validate2');
  const pic = (id, w, h) => ({ id, origin: 'upload', title: id, alt: '', mime: 'image/png', dataUrl: mockPng(id, '16:9'), relevance: 2, assess: { width: w, height: h, aspect: +(w / h).toFixed(3), orientation: 'landscape', subject: [0.2, 0.2, 0.8, 0.8], colours: ['#c0502e', '#223344', '#ddeeff'], luminance: 110, background: { colour: '#333333', uniformity: 0.3 } }, caps: { moveFreely: false, frame: true, backdrop: true, heroSize: true } });
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
  const upload = { id: 'u1', origin: 'upload', title: 'u1', mime: 'image/png', dataUrl: mockPng('u1', '16:9') };
  await withServer({ MOCK_HIGGSFIELD: 'failed' }, async ({ call }) => {
    const q = await call('POST', '/api/premium-media/quote', { kind: 'creative', requests: [{ intent: 'cinematic_hero', asset: 'u1' }], assets: [upload] });
    const x = await call('POST', '/api/premium-media/execute', { quoteId: q.body.quote.id });
    assert.equal(x.body.ok, true); assert.deepEqual(x.body.delivered, []); assert.equal(x.body.creditsCharged, 0); assert.equal(x.body.creditsRemaining, 10);
  });
  await withServer({ SITEREMADE_HIGGSFIELD_USD_VIDEO_5S_720P: '5' }, async ({ call, calls }) => {
    const q = await call('POST', '/api/premium-media/quote', { kind: 'creative', requests: [{ intent: 'cinematic_hero', asset: 'u1' }], assets: [upload] });
    const x = await call('POST', '/api/premium-media/execute', { quoteId: q.body.quote.id });
    assert.match(x.body.failed[0].reason, /budget/); assert.equal(x.body.creditsCharged, 0);
    assert.equal(calls().filter(c => c.provider === 'higgsfield').length, 0, 'an over-budget job is never submitted');
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
