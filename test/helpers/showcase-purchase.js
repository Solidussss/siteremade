'use strict';
// THE PRODUCTION INCIDENT, rebuilt on a running test server (test/helpers/server-process.js -- Claude, OpenAI,
// Higgsfield, Supabase and Stripe are all answered by mocks at the network edge; $0 of real provider spend):
//   A. an older Creative project whose generation failed -- saved to the account as a draft with no page
//   B. a second Creative project -- a Creative Showcase, saved and PURCHASED (mocked Stripe checkout + signed webhook)
//   C. its three premium videos (hero, takeover, payoff) made by the mocked Higgsfield premium job, attached to the page
//   D. saved (a new revision) and PUBLISHED, so the handoff is that revision -- not the purchase snapshot, which has
//      no videos
// and finally A is touched again, so the failed draft is the account's MOST RECENTLY UPDATED project: the case where
// "newest first" would surface the wrong website.
// Used by test/app-cold-start.test.js here and by the Client App's cross-repo cold-start test (SITEREMADE_BUILDER_DIR).
const crypto = require('crypto');
const assert = require('node:assert/strict');
const { client, providerCalls } = require('./server-process');
const { mockPng } = require('./mock-image');
const { premiumRun } = require('./premium-job');
const PA = require('../../lib/creative/premium-arc');
const PM = require('../../lib/media/premium-media');
const POOL = require('../../lib/creative/pool');
const FR = require('../../lib/creative/framing');
const D2 = require('../../lib/creative/director2');
const { validatePlan2 } = require('../../lib/creative/validate2');

// the environment a scenario server needs (merged over the caller's paths)
const SCENARIO_ENV = {
  SITEREMADE_BACKEND: 'local', ANTHROPIC_API_KEY: 'test-only', OPENAI_API_KEY: '', NODE_ENV: 'test',
  SITEREMADE_APP_BRIDGE_ENABLED: 'true', SITEREMADE_IDENTITY_BRIDGE_MODE: 'full', SUPABASE_URL: 'https://supabase.test', SUPABASE_ANON_KEY: 'test-anon-key', SUPABASE_PUBLISHABLE_KEY: '',
  STRIPE_SECRET_KEY: 'sk_test_mock_only', STRIPE_WEBHOOK_SECRET: 'whsec_cold_start_test', SITEREMADE_TRIAL_CREDITS: '200',
  HIGGSFIELD_API_KEY: 'hf-test-key:secret', HIGGSFIELD_VIDEO_ENDPOINT: 'https://api.higgsfield.ai/kling-video/v3.0/4k/image-to-video', MOCK_HIGGSFIELD_MS: '200,300,400',
};
// three DIFFERENT fake clips (the mock serves one per request, in order): identical bytes would be stored once
// (content-addressed), and a handoff missing two videos could never be told apart from one that has all three
function scenarioEnv(dir, path) {
  const fs = require('fs');
  const clips = ['hero', 'takeover', 'payoff'].map((role, i) => {
    const file = path.join(dir, `mock-clip-${role}.mp4`);
    fs.writeFileSync(file, Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from(`ftypmp42mock-${role}-clip-${i + 1}`)]));
    return file;
  });
  return Object.assign({}, SCENARIO_ENV, {
    SITEREMADE_DB_PATH: path.join(dir, 'app.db'), SITEREMADE_ASSET_STORE_DIR: path.join(dir, 'assets'), SITEREMADE_EXPORTS_DIR: path.join(dir, 'exports'),
    SITEREMADE_PREMIUM_LOG_DIR: path.join(dir, 'premium'), MOCK_CALL_LOG: path.join(dir, 'provider-calls.log'), MOCK_HIGGSFIELD_VIDEO_FILES: clips.join(','),
  });
}

// ---- the Showcase page: the generator's own planning, in-process (as in test/creative-premium-arc.test.js) -----------
const pic = (id, w, h, colour, extra) => Object.assign({ id, origin: 'upload', title: id, mime: 'image/png', dataUrl: mockPng(id, '16:9-hd'),
  assess: { width: w, height: h, aspect: +(w / h).toFixed(3), orientation: w > h * 1.15 ? 'landscape' : h > w * 1.15 ? 'portrait' : 'square', subject: [0.3, 0.2, 0.7, 0.9], colours: [colour], luminance: 90, background: { colour: '#101018', uniformity: 0.3 } },
  caps: { moveFreely: false, frame: true, backdrop: w > h, heroSize: true }, curation: { role: 'subject', identity: 'exact', depicts: id, issues: [] } }, extra || {});
const ASSETS = [
  pic('main', 2000, 1125, '#3355cc', { title: 'the drifter, surfing a light trail' }),
  pic('world', 1920, 1080, '#7a2f9e', { title: 'deep space', curation: { role: 'environment', identity: 'related', depicts: 'deep space with nebulae', issues: [] } }),
  pic('side', 1800, 1100, '#c0502e', { title: 'the drifter, from the side' }),
];
const FACTS = ['The drifter rides light trails between galaxies.', 'Its board is made of polished chrome.', 'It never speaks.', 'It travels faster than light.', 'Its chrome reflects every star it passes.', 'It guards a cosmic balance.'].map((text, i) => ({ id: `f${i + 1}`, text, section: 'x' }));
const UND = { kind: 'fictional', subject: 'The Drifter', brief: 'a showcase build for a cosmic chrome hero', tone: { register: 'cinematic' } };
const SHOWCASE = 'A showcase build for an imaginary chrome surfer called the Drifter, with three premium videos';
function planShowcase() {
  const inv = ASSETS.map(a => JSON.parse(JSON.stringify(a))); const byId = new Map(inv.map(a => [a.id, a]));
  const pool = POOL.build(inv, { mainAsset: 'main' });
  const eligible = id => PM.sourceEligibility(byId.get(id), { byId, confirmed: [] }).ok;
  const pics = pool.pictures.map(p => ({ id: p.id, colour: p.colour, bleed: FR.canBleed(byId.get(p.id), 1.6), role: (byId.get(p.id).curation || {}).role || '' }));
  const src = PA.pickSources(PA.ROLES, pics, eligible, pool.main && pool.main.id);
  const arc = PA.ROLES.map(r => ({ role: r, intent: PA.ROLE_INTENT[r], asset: src[r] })).filter(e => e.asset);
  const { plan, recipe } = D2.direct({ understanding: UND, research: { page: null, facts: FACTS }, assets: inv, supplied: { facts: [], memories: [] }, seed: 'cold-start', mainAsset: 'main', premium: { video: true, intent: 'cinematic_hero', source: src.hero, arc }, pool });
  const v = validatePlan2(plan, { assets: inv, facts: FACTS, understanding: UND, art: recipe, mainAsset: 'main', premiumHero: { intent: 'cinematic_hero', source: src.hero }, premiumArc: arc });
  assert.equal(v.errors.length, 0, v.errors.join('; '));
  assert.deepEqual(arc.map(e => e.role), ['hero', 'takeover', 'payoff'], 'a showcase plans three premium moments');
  return { plan: v.plan, inv, arc };
}
const creativeDirection = (id, creative) => ({ mode: 'creative', meta: { id }, pages: [{ id: 'creative', label: 'Creative page', sections: [] }], creative });

// opts: { port, env, token } -> the ids, revisions and video asset refs of the scenario
async function buildColdStartScenario({ port, env, token = 'test-access-token-owner' }) {
  const call = client(port);
  assert.equal((await call('POST', '/api/identity/supabase/session', { supabaseAccessToken: token })).status, 200);
  const save = async (name, direction) => {
    const r = await call('POST', '/api/projects', { name, directionsState: { directions: [direction], activeDirectionIndex: 0 } });
    assert.ok(r.status === 201 || r.status === 200, JSON.stringify(r.body).slice(0, 300)); return r.body.project;
  };
  const put = async (id, mutate) => {
    const p = (await call('GET', `/api/projects/${id}`)).body.project; const next = JSON.parse(JSON.stringify(p.directionsState)); if (mutate) mutate(next);
    const r = await call('PUT', `/api/projects/${id}`, { name: p.name, expectedRevision: p.revision, directionsState: next });
    assert.equal(r.status, 200, JSON.stringify(r.body).slice(0, 300)); return r.body.project;
  };
  const tick = () => new Promise(r => setTimeout(r, 25));
  // A. the older Creative project: its generation failed, so it was saved with no page (a draft)
  const failed = await save('The Drifter (generation failed)', creativeDirection('c_failed', { brief: SHOWCASE, assets: [], plan: null }));
  await tick();
  // B. the Creative Showcase: researched and planned (mocked models), saved, then purchased
  const ask = await call('POST', '/api/creative/research', { brief: SHOWCASE, premium: { on: true, moments: 3, eligibleUploads: 2 } });
  const research = ask.body.needsConfirmation ? await call('POST', '/api/creative/research', { brief: SHOWCASE, premium: { on: true, moments: 3, eligibleUploads: 2 }, quoteId: ask.body.quote.id }) : ask;
  assert.ok(research.body.jobId, JSON.stringify(research.body).slice(0, 300));
  const { plan, inv, arc } = planShowcase();
  const showcase = await save('The Drifter — Showcase', creativeDirection('c_showcase', { brief: SHOWCASE, understanding: UND, research: { page: null, facts: FACTS }, assets: inv, plan }));
  await tick();
  await call('POST', '/api/checkout', { projectId: showcase.id, businessName: 'The Drifter' });
  const asked = providerCalls(env.MOCK_CALL_LOG).filter(x => x.provider === 'stripe' && x.endpoint === 'checkout' && x.projectId === showcase.id).pop();
  assert.ok(asked, 'checkout asked the (mocked) Stripe');
  const body = JSON.stringify({ id: 'evt_' + asked.session, type: 'checkout.session.completed', data: { object: { id: asked.session, payment_status: 'paid', amount_total: asked.amount, currency: 'cad' } } });
  const t = Math.floor(Date.now() / 1000); const sig = crypto.createHmac('sha256', env.STRIPE_WEBHOOK_SECRET).update(`${t}.${body}`).digest('hex');
  const hook = await fetch(`http://127.0.0.1:${port}/api/stripe/webhook`, { method: 'POST', headers: { 'content-type': 'application/json', 'stripe-signature': `t=${t},v1=${sig}` }, body });
  assert.equal(hook.status, 200);
  const purchasedRevision = (await call('GET', `/api/projects/${showcase.id}`)).body.project.revision;
  // C. the three premium videos -- the mocked Higgsfield job, one submit per moment
  const sourceIds = [...new Set(arc.map(e => e.asset))];
  const run = await premiumRun(call, { jobId: research.body.jobId, projectId: showcase.id, brief: SHOWCASE, heroAsset: arc[0].asset, premiumArc: arc.map(e => ({ role: e.role, asset: e.asset })), assets: inv.filter(a => sourceIds.includes(a.id)).map(a => ({ id: a.id, origin: 'upload', title: a.title, mime: 'image/png', dataUrl: a.dataUrl })) });
  assert.deepEqual(run.body.premium.deliveredRoles, ['hero', 'takeover', 'payoff'], JSON.stringify(run.body).slice(0, 400));
  const delivered = run.body.assets;
  assert.equal(new Set(delivered.map(m => m.video.assetRef)).size, 3, 'three different clips, stored separately');
  // D. attached to their moments exactly as the studio does (lib/creative/premium-arc.js attach + repoint), saved, published
  const withVideos = await put(showcase.id, ds => {
    const c = ds.directions[0].creative; const A = PA.attach(c.assets, delivered);
    c.assets = A.assets; c.plan = PA.repoint(c.plan, A.byRole);
  });
  const pub = await call('POST', `/api/projects/${showcase.id}/publish`, { revision: withVideos.revision });
  assert.equal(pub.status, 200, JSON.stringify(pub.body)); assert.equal(pub.body.revision, withVideos.revision);
  // ...and the failed draft is touched last: the account's most recently updated project
  await tick();
  await put(failed.id, ds => { ds.directions[0].creative.brief = SHOWCASE + ' (retry later)'; });
  return {
    failedDraftId: failed.id, showcaseId: showcase.id, purchasedRevision, publishedRevision: withVideos.revision,
    videoRefs: delivered.map(m => m.video.assetRef), mediaIds: delivered.map(m => m.video.mediaId),
  };
}

// every paid-provider call the mocks answered (they are the only thing that answers: nothing reaches a real provider)
function paidCalls(env) {
  return providerCalls(env.MOCK_CALL_LOG).filter(c => ['anthropic', 'openai', 'higgsfield', 'serpapi'].includes(c.provider));
}

// an independent reader for a handoff ZIP (central directory, CRC-checked, inflated) -> Map(name -> Buffer)
function readZip(buf) {
  const zlib = require('zlib');
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 65535); i--) if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  assert.ok(eocd >= 0, 'end of central directory record present');
  const count = buf.readUInt16LE(eocd + 10); let p = buf.readUInt32LE(eocd + 16); const files = new Map();
  for (let n = 0; n < count; n++) {
    assert.equal(buf.readUInt32LE(p), 0x02014b50, 'central directory entry');
    const method = buf.readUInt16LE(p + 10), crc = buf.readUInt32LE(p + 16), csize = buf.readUInt32LE(p + 20), usize = buf.readUInt32LE(p + 24);
    const nlen = buf.readUInt16LE(p + 28), xlen = buf.readUInt16LE(p + 30), clen = buf.readUInt16LE(p + 32), off = buf.readUInt32LE(p + 42);
    const name = buf.slice(p + 46, p + 46 + nlen).toString('utf8');
    const lnlen = buf.readUInt16LE(off + 26), lxlen = buf.readUInt16LE(off + 28);
    const raw = buf.slice(off + 30 + lnlen + lxlen, off + 30 + lnlen + lxlen + csize);
    const data = method === 8 ? zlib.inflateRawSync(raw) : raw;
    assert.equal(data.length, usize, `${name}: size`); assert.equal(zlib.crc32(data) >>> 0, crc, `${name}: CRC-32`);
    files.set(name, data); p += 46 + nlen + xlen + clen;
  }
  return files;
}

module.exports = { buildColdStartScenario, scenarioEnv, paidCalls, readZip, SHOWCASE };
