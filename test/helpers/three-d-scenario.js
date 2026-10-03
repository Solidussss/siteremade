'use strict';
// A PURCHASED CREATIVE PAGE WITH A 3D MODEL, built on a running test server exactly as the owner builds it: the page is
// saved, a 3D model is quoted, confirmed and made by the durable job (Tripo answered by test/helpers/mock-tripo.js), the
// studio's save attaches it BY REFERENCE (the stored GLB's assetRef -- creative.js tdForSave), the page is purchased
// (mocked Stripe checkout + signed webhook) and published. $0 of real provider spend.
// Used by test/review scripts here and by the Client App's cross-repo preview test (SITEREMADE_BUILDER_DIR).
const crypto = require('crypto');
const path = require('path');
const zlib = require('zlib');
const assert = require('node:assert/strict');
const { client, providerCalls } = require('./server-process');
const D2 = require('../../lib/creative/director2');
const { validatePlan2 } = require('../../lib/creative/validate2');
const TD = require('../../lib/creative/three-d');

const KEY = 'tsk_TESTONLYnotarealkey0123456789abcdef'; // (not a key: nothing answers it but the fake)
// the environment a 3D scenario server needs (merged over the caller's paths). MOCK_TRIPO=large: a real-sized ~6 MB model.
function threeDEnv(dir, extra) {
  return Object.assign({ SITEREMADE_BACKEND: 'local', NODE_ENV: 'test', ANTHROPIC_API_KEY: 'test-only', OPENAI_API_KEY: '', HIGGSFIELD_API_KEY: 'hf-test-key:secret',
    SITEREMADE_DB_PATH: path.join(dir, 'app.db'), SITEREMADE_ASSET_STORE_DIR: path.join(dir, 'assets'), SITEREMADE_EXPORTS_DIR: path.join(dir, 'exports'), SITEREMADE_PREMIUM_LOG_DIR: path.join(dir, 'premium'), MOCK_CALL_LOG: path.join(dir, 'provider-calls.log'),
    SITEREMADE_APP_BRIDGE_ENABLED: 'true', SITEREMADE_IDENTITY_BRIDGE_MODE: 'full', SUPABASE_URL: 'https://supabase.test', SUPABASE_ANON_KEY: 'test-anon-key', SUPABASE_PUBLISHABLE_KEY: '',
    STRIPE_SECRET_KEY: 'sk_test_mock_only', STRIPE_WEBHOOK_SECRET: 'whsec_3d_scenario', SITEREMADE_TRIAL_CREDITS: '60',
    CREATIVE_3D: 'on', THREE_D_PROVIDER: 'tripo', TRIPO_API_KEY: KEY, SITEREMADE_3D_PROVIDER_USD: '0.50', PUBLIC_BASE_URL: 'https://www.siteremade.com', MOCK_TRIPO: 'large', MOCK_TRIPO_MS: '0' }, extra || {});
}

// a photo-sized picture (noise does not compress, as photos mostly do not)
function photo(w, h) {
  const T = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; T[n] = c >>> 0; }
  const crc = b => { let c = 0xffffffff; for (const x of b) c = T[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
  const ih = Buffer.alloc(13); ih.writeUInt32BE(w, 0); ih.writeUInt32BE(h, 4); ih[8] = 8; ih[9] = 2;
  const raw = crypto.randomBytes((w * 3 + 1) * h); for (let y = 0; y < h; y++) raw[y * (w * 3 + 1)] = 0;
  return 'data:image/png;base64,' + Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ih), chunk('IDAT', zlib.deflateSync(raw, { level: 1 })), chunk('IEND', Buffer.alloc(0))]).toString('base64');
}
function creativePage() {
  const W = 900, H = 1125;
  const assess = extra => Object.assign({ width: W, height: H, aspect: 0.8, orientation: 'portrait', subject: [0.15, 0.07, 0.85, 0.93], colours: ['#1a528c', '#d49e38'], luminance: 130, background: { colour: '#f1ece2', uniformity: 0.95, tolerance: 12 }, transparent: false, transparentShare: 0, megapixels: 1.01 }, extra || {});
  const assets = [
    { id: 'u-bottle', origin: 'upload', title: 'Aurelia tonic', alt: 'A bottle of Aurelia tonic', mime: 'image/png', dataUrl: photo(W, H), assess: assess(), caps: { moveFreely: false, frame: true, backdrop: false, heroSize: true, lowRes: false }, curation: { role: 'subject', identity: 'exact', depicts: 'the bottle', issues: [], separable: true, quality: 3, framing: 'whole' } },
    { id: 'c-bottle', origin: 'derived', cutout: true, cutoutOf: 'u-bottle', title: 'Aurelia tonic', alt: 'A bottle of Aurelia tonic', mime: 'image/png', dataUrl: photo(W, H), processing: 'background removed', assess: assess({ transparent: true, transparentShare: 0.5, background: undefined }), caps: { moveFreely: true, frame: false, backdrop: false, heroSize: true, lowRes: false } },
  ];
  // (a poster-to-scene page: the bottle is shown once -- the image ledger, look.js -- as a picture in the opening section)
  const und = { kind: 'invented', subject: 'Aurelia Tonic', brief: 'a launch page for Aurelia, a small-batch tonic in a blue glass bottle', tone: { register: 'cinematic' }, identity: { name: 'Aurelia Tonic', kind: 'invented', what: 'a small-batch tonic drink product in a blue glass bottle' } };
  const d = D2.direct({ understanding: und, research: { page: null, facts: [] }, assets, supplied: { facts: ['Aurelia is bottled in small batches.'], memories: [] }, seed: '1', prefer: { family: 'poster-to-scene', mode: 'expressive' } });
  const plan = validatePlan2(d.plan, { assets, facts: [], understanding: und, page: null, art: d.recipe }).plan;
  return { mode: 'creative', meta: { id: 'c3d-scenario' }, pages: [{ id: 'creative', label: 'Creative page', sections: [] }],
    creative: { v: 1, brief: und.brief, understanding: und, supplied: { facts: ['Aurelia is bottled in small batches.'], memories: [] }, research: { status: 'none', page: null, facts: [] }, assets, plan, motion: { intensity: 'lively' }, cost: {} } };
}

// opts: { port, env, token, publish (default true) } -> { projectId, jobId, assetRef, revision, sectionId, handoffZipBytes }
async function buildThreeDScenario({ port, env, token = 'test-access-token-owner', publish = true }) {
  const call = client(port);
  assert.equal((await call('POST', '/api/identity/supabase/session', { supabaseAccessToken: token })).status, 200);
  const page = creativePage();
  const made = await call('POST', '/api/projects', { name: 'Aurelia Tonic', directionsState: { directions: [page], activeDirectionIndex: 0 } });
  assert.ok(made.status === 201 || made.status === 200, JSON.stringify(made.body).slice(0, 200)); const projectId = made.body.project.id;
  const q = await call('POST', '/api/creative/premium/3d/quote', { projectId, assetId: 'u-bottle' }); assert.equal(q.body && q.body.ok, true, JSON.stringify(q.body).slice(0, 300));
  const jobId = (await call('POST', '/api/creative/premium/3d/start', { quoteId: q.body.quote.id })).body.job.jobId;
  let job = null; for (let i = 0; i < 400; i++) { job = (await call('GET', `/api/creative/premium/status/${jobId}`)).body.job; if (job.terminal) break; await new Promise(r => setTimeout(r, 40)); }
  assert.equal(job.status, 'completed', JSON.stringify(job).slice(0, 300)); const d = job.delivered[0];
  // the studio's save: the model by its stored reference (creative.js tdForSave), one scroll-rotate scene in its section
  const cur = (await call('GET', `/api/projects/${projectId}`)).body.project; const next = JSON.parse(JSON.stringify(cur.directionsState));
  next.directions[0].creative.threeD = TD.normalise({ assets: [d.threeD], scenes: [{ id: 'td-' + d.sectionId, assetId: d.threeD.id, sectionId: d.sectionId, composition: d.composition }] }, { sectionIds: page.creative.plan.scenes.map(s => s.id) });
  assert.equal(next.directions[0].creative.threeD.assets[0].dataUrl, undefined, 'saved by reference');
  const saved = await call('PUT', `/api/projects/${projectId}`, { name: cur.name, expectedRevision: cur.revision, directionsState: next }); assert.equal(saved.status, 200, JSON.stringify(saved.body).slice(0, 300));
  // purchased (mocked Stripe), then published as the studio does after a save
  await call('POST', '/api/checkout', { projectId, businessName: 'Aurelia Tonic' });
  const asked = providerCalls(env.MOCK_CALL_LOG).filter(x => x.provider === 'stripe' && x.endpoint === 'checkout' && x.projectId === projectId).pop(); assert.ok(asked, 'checkout asked the (mocked) Stripe');
  const body = JSON.stringify({ id: 'evt_' + asked.session, type: 'checkout.session.completed', data: { object: { id: asked.session, payment_status: 'paid', amount_total: asked.amount, currency: 'cad' } } });
  const t = Math.floor(Date.now() / 1000); const sig = crypto.createHmac('sha256', env.STRIPE_WEBHOOK_SECRET).update(`${t}.${body}`).digest('hex');
  assert.equal((await fetch(`http://127.0.0.1:${port}/api/stripe/webhook`, { method: 'POST', headers: { 'content-type': 'application/json', 'stripe-signature': `t=${t},v1=${sig}` }, body })).status, 200);
  const revision = saved.body.project.revision;
  if (publish) assert.equal((await call('POST', `/api/projects/${projectId}/publish`, { revision })).status, 200);
  const zip = Buffer.from(await (await fetch(`http://127.0.0.1:${port}/api/app-bridge/website/${projectId}/download`, { headers: { authorization: `Bearer ${token}` } })).arrayBuffer());
  return { projectId, jobId, assetRef: d.threeD.assetRef, revision, sectionId: d.sectionId, handoffZipBytes: zip.length };
}

// every paid-provider call the mocks answered, by provider (nothing reaches a real provider)
function paidCallsByProvider(env) { const out = {}; providerCalls(env.MOCK_CALL_LOG).forEach(c => { out[c.provider] = (out[c.provider] || 0) + 1; }); return out; }
// the page's 3D data (the inline JSON the loader reads)
const pageData = html => { const m = /<script type="application\/json" id="cr-3d">([\s\S]*?)<\/script>/.exec(html); return m ? JSON.parse(m[1]) : null; };

module.exports = { threeDEnv, buildThreeDScenario, creativePage, paidCallsByProvider, pageData, KEY };
