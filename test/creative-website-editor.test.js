'use strict';
// THE CREATIVE WEBSITE EDITOR (the Client App's Website view, through the builder bridge): a purchased Creative website is
// edited as the Creative project it is -- creative.plan, its pictures and their provenance, its 3D model, its cinematic
// clips -- never flattened into Business content. Free changes cost nothing and ask no provider; paid ones are quoted by
// the builder, confirmed, reserved and run exactly once through the existing jobs; every change is a DRAFT until the owner
// publishes. And the bug this pass fixes: a Creative page's "Change the headline to X" ran the Business planner against
// Business fields the Creative renderer never reads -- charged, saved, reported done, and the page did not change.
//
// REAL PROVIDER SPEND: $0. The AI director is test/helpers/mock-creative.js, Tripo test/helpers/mock-tripo.js, Higgsfield
// the test server's mock; every other paid provider is refused (test/helpers/run-server.js).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const zlib = require('zlib');
const { startServer, client, providerCalls } = require('./helpers/server-process');
const S = require('./helpers/three-d-scenario');
const { readZip } = require('./helpers/showcase-purchase');
const { loadClient, premiumProviderStatus, buildProject } = require('./helpers/load-client');
const projectStore = require('../lib/project-store');
const cinematicSource = require('../lib/creative/cinematic-source');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'sr-creative-editor-'));
const OWNER = 'test-access-token-owner', OTHER = 'test-access-token-other';
const sleep = ms => new Promise(r => setTimeout(r, ms));
// a photo-sized PNG (noise), as the app's browser sends an upload after converting it to PNG
function png(w, h, rgb) {
  const T = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; T[n] = c >>> 0; }
  const crc = b => { let c = 0xffffffff; for (const x of b) c = T[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
  const ih = Buffer.alloc(13); ih.writeUInt32BE(w, 0); ih.writeUInt32BE(h, 4); ih[8] = 8; ih[9] = 2;
  const raw = rgb ? Buffer.alloc((w * 3 + 1) * h) : crypto.randomBytes((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) { const o = y * (w * 3 + 1); raw[o] = 0; if (rgb) for (let x = 0; x < w; x++) { raw[o + 1 + x * 3] = rgb[0]; raw[o + 2 + x * 3] = rgb[1]; raw[o + 3 + x * 3] = rgb[2]; } }
  return 'data:image/png;base64,' + Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ih), chunk('IDAT', zlib.deflateSync(raw, { level: 1 })), chunk('IEND', Buffer.alloc(0))]).toString('base64');
}
function bridgeFor(port, token) {
  return async (method, url, body) => {
    const r = await fetch(`http://127.0.0.1:${port}${url}`, { method, headers: Object.assign({ authorization: `Bearer ${token}` }, body ? { 'content-type': 'application/json' } : {}), body: body ? JSON.stringify(body) : undefined });
    const type = r.headers.get('content-type') || ''; const buf = Buffer.from(await r.arrayBuffer());
    return { status: r.status, body: /json/.test(type) ? JSON.parse(buf.toString('utf8')) : null, text: /html|text/.test(type) ? buf.toString('utf8') : null, buf, headers: r.headers };
  };
}
const counts = env => { const c = providerCalls(env.MOCK_CALL_LOG); return {
  tripo: c.filter(x => x.provider === 'tripo' && x.endpoint === 'submit').length,
  higgsfield: c.filter(x => x.provider === 'higgsfield' && /image-to-video$/.test(x.endpoint || '')).length,
  anthropic: c.filter(x => x.provider === 'anthropic').length,
  refinement: c.filter(x => x.provider === 'anthropic' && x.tool === 'submit_website_refinement').length,
  openai: c.filter(x => x.provider === 'openai').length,
}; };

let shared = null;
async function world() {
  if (shared) return shared;
  const dir = fs.mkdtempSync(path.join(TMP, 'w-')); const env = S.threeDEnv(dir, { SITEREMADE_TRIAL_CREDITS: '200', MOCK_CREATIVE_REVISE: 'words', MOCK_HIGGSFIELD: 'success', MOCK_TRIPO: 'alternate', HIGGSFIELD_VIDEO_ENDPOINT: 'kling-video/v3.0/4k/image-to-video', SITEREMADE_RATE_LIMIT_APP_BRIDGE_ACCOUNT_MAX: '100000' });
  const srv = await startServer(env);
  const sc = await S.buildThreeDScenario({ port: srv.port, env }); // purchased, published, with its 3D model
  const call = client(srv.port); await call('POST', '/api/identity/supabase/session', { supabaseAccessToken: OWNER });
  shared = { srv, env, dir, sc, call, owner: bridgeFor(srv.port, OWNER), other: bridgeFor(srv.port, OTHER), projectId: sc.projectId };
  return shared;
}
test.after(async () => { if (shared) await shared.srv.stop(); });
const raw = async w => (await w.call('GET', `/api/projects/${w.projectId}`)).body.project;
const creativeOf = p => p.directionsState.directions[0].creative;
const balance = async w => (await w.call('GET', '/api/credits')).body.credits.remaining;
const outline = async w => { const r = await w.owner('GET', `/api/app-bridge/website/${w.projectId}/creative`); assert.equal(r.status, 200, JSON.stringify(r.body)); return r.body; };
// THE MODE A PAGE WAS MADE IN: its generation's premium job, linked from the page the way the studio links it
// (creative.premiumJob) -- the fixture for how many 3D models a page may make (Creative 1, Cinematic 2, Showcase 4)
async function madeAs(w, strategy) {
  const db = require('../lib/adapters/database-adapter.js').getDatabaseAdapter(w.env.SITEREMADE_DB_PATH);
  const me = (await w.call('GET', '/api/auth/me')).body.account.id; const id = 'pj_fixture' + crypto.randomBytes(6).toString('hex'); const at = new Date().toISOString();
  db.premiumJobs.insertIfNew({ id, accountId: me, creativeJobId: 'cj_fixture' + id, projectId: null, quoteId: null, opId: 'op-' + id, mode: strategy === 'showcase' ? 'showcase' : 'hero', strategy, status: 'completed', rolesJson: '[]', total: 0, completed: 0, createdAt: at });
  const p = await raw(w); const ds = p.directionsState; ds.directions[0].creative.premiumJob = { jobId: id };
  const r = await w.call('PUT', `/api/projects/${w.projectId}`, { directionsState: ds, expectedRevision: p.revision }); assert.equal(r.status, 200, JSON.stringify(r.body));
}
async function followJobs(w, until) { for (let i = 0; i < 300; i++) { const r = await w.owner('GET', `/api/app-bridge/website/${w.projectId}/creative/jobs`); if (until(r.body)) return r.body; await sleep(120); } throw new Error('the job did not finish'); }

// ================================================================ kind, outline
test('WE-1. the website reports its kind from the project itself: creative for a Creative page, business for a Business one', async () => {
  const w = await world();
  const one = await w.owner('GET', `/api/app-bridge/website/${w.projectId}`); assert.equal(one.status, 200); assert.equal(one.body.kind, 'creative');
  const c = loadClient(); const { proj } = buildProject(c, 'Petal & Stem is a florist in Portland. Call 503-555-0147.', { providerStatus: premiumProviderStatus() });
  const biz = projectStore.validateDirectionsState({ directions: [JSON.parse(JSON.stringify(proj))], activeDirectionIndex: 0 }).normalized.directions[0];
  const made = await w.call('POST', '/api/projects', { name: 'Petal & Stem', directionsState: { directions: [biz], activeDirectionIndex: 0 } });
  const b = await w.owner('GET', `/api/app-bridge/website/${made.body.project.id}`); assert.equal(b.body.kind, 'business');
  // (the Creative editor refuses a Business website: it is edited by the Business update flow)
  assert.equal((await w.owner('GET', `/api/app-bridge/website/${made.body.project.id}/creative`)).status, 409);
});

test('WE-2. the editable outline: scenes, their words, pictures with where they came from, the 3D model, clips and the page look -- no bytes, no references, no provider data', async () => {
  const w = await world(); const o = await outline(w);
  assert.equal(o.kind, 'creative'); assert.ok(o.outline.scenes.length >= 3);
  const s0 = o.outline.scenes[0]; assert.ok(s0.text.heading); assert.ok(s0.pictures.length);
  const pic = o.outline.scenes.flatMap(s => s.pictures).find(p => p.source.rootId === 'u-bottle');
  assert.deepEqual([pic.source.kind, pic.source.cutout], ['upload', true], 'the cut-out is the owner\'s upload');
  assert.ok(o.outline.models.length === 1 && o.outline.models[0].sourceAssetId === 'u-bottle', 'the 3D model');
  assert.ok(o.outline.scenes.some(s => s.models.length), 'and where it stands');
  assert.ok(o.outline.look && o.outline.look.devices.length >= 2, 'the page look'); assert.ok(o.outline.palette.length >= 2, 'its approved colours');
  const json = JSON.stringify(o);
  assert.doesNotMatch(json, /data:image|data:model|assetRef|[a-f0-9]{64}|sk_test|providerJobId|hf-test|tsk_/, 'nothing private or heavy');
  // another account: the same 404 as a website that does not exist
  assert.equal((await w.other('GET', `/api/app-bridge/website/${w.projectId}/creative`)).status, 404);
});

// ================================================================ free edits
test('WE-3. a manual text edit changes the real creative.plan: 0 credits, 0 provider calls, a new DRAFT (the published site unchanged until Publish), and it survives a reload', async () => {
  const w = await world(); const before = await raw(w); const credits = await balance(w); const calls = counts(w.env);
  const o = await outline(w); const s = o.outline.scenes[1];
  const r = await w.owner('POST', `/api/app-bridge/website/${w.projectId}/creative/edit`, { baseRevision: o.revision, op: { type: 'text', sceneId: s.id, field: 'heading', value: 'Bottled by hand, in small batches' } });
  assert.equal(r.status, 200, JSON.stringify(r.body)); assert.equal(r.body.creditsCharged, 0); assert.equal(r.body.revision, o.revision + 1);
  assert.equal(await balance(w), credits, 'not a credit'); assert.deepEqual(counts(w.env), calls, 'not a provider call');
  const after = await raw(w); const sc = creativeOf(after).plan.scenes.find(x => x.id === s.id);
  assert.equal(sc.text.heading, 'Bottled by hand, in small batches', 'the Creative scene itself');
  assert.deepEqual(after.directionsState.directions[0].copy, before.directionsState.directions[0].copy, 'no Business field written');
  assert.deepEqual(creativeOf(after).threeD, creativeOf(before).threeD, 'the 3D model is untouched by an unrelated edit');
  assert.deepEqual(creativeOf(after).plan.look, creativeOf(before).plan.look, 'plan.look survives');
  // draft vs published
  const draft = await w.owner('GET', `/api/app-bridge/website/${w.projectId}/preview?source=draft`); assert.match(draft.text, /Bottled by hand, in small batches/);
  const live = await w.owner('GET', `/api/app-bridge/website/${w.projectId}/preview`); assert.doesNotMatch(live.text, /Bottled by hand, in small batches/, 'the published site is unchanged');
  // a stale revision is refused, nothing written
  const stale = await w.owner('POST', `/api/app-bridge/website/${w.projectId}/creative/edit`, { baseRevision: o.revision, op: { type: 'text', sceneId: s.id, field: 'heading', value: 'x' } });
  assert.equal(stale.status, 409); assert.equal((await raw(w)).revision, o.revision + 1);
  // reload: the outline reads it back
  assert.equal((await outline(w)).outline.scenes[1].text.heading, 'Bottled by hand, in small batches');
});

test('WE-3b. the owner\'s own words may state a number ("Open since 1998"): the honesty rule is for words SiteRemade writes -- and a problem the page already had never blocks an unrelated free edit', async () => {
  const w = await world(); const o = await outline(w); const s = o.outline.scenes[3];
  const r = await w.owner('POST', `/api/app-bridge/website/${w.projectId}/creative/edit`, { baseRevision: o.revision, op: { type: 'text', sceneId: s.id, field: 'heading', value: 'Bottled since 1998, 40 a day' } });
  assert.equal(r.status, 200, JSON.stringify(r.body)); assert.match(r.body.changeSummary[0], /Updated the heading of /);
  const o2 = await outline(w); assert.equal(o2.outline.scenes[3].text.heading, 'Bottled since 1998, 40 a day');
  const r2 = await w.owner('POST', `/api/app-bridge/website/${w.projectId}/creative/edit`, { baseRevision: o2.revision, op: { type: 'colour', sceneId: o2.outline.scenes[1].id, role: o2.outline.palette[0].role } });
  assert.equal(r2.status, 200, JSON.stringify(r2.body));
});

test('WE-4. scene colour (only the page palette), composition (the existing recompose) and today\'s layout rules: free, validated, the look kept', async () => {
  const w = await world(); const o = await outline(w); const credits = await balance(w); const calls = counts(w.env);
  const s = o.outline.scenes.find(x => x.compositions.length) || o.outline.scenes[1];
  const colour = o.outline.palette[1];
  let r = await w.owner('POST', `/api/app-bridge/website/${w.projectId}/creative/edit`, { baseRevision: o.revision, op: { type: 'colour', sceneId: s.id, role: colour.role } });
  assert.equal(r.status, 200, JSON.stringify(r.body)); assert.equal(creativeOf(await raw(w)).plan.scenes.find(x => x.id === s.id).tone, colour.hex);
  r = await w.owner('POST', `/api/app-bridge/website/${w.projectId}/creative/edit`, { baseRevision: r.body.revision, op: { type: 'colour', sceneId: s.id, role: 'hot-pink' } });
  assert.equal(r.status, 422, 'never a colour outside the page palette');
  const rev = (await raw(w)).revision;
  if (s.compositions.length) {
    const k = s.compositions[0].id; r = await w.owner('POST', `/api/app-bridge/website/${w.projectId}/creative/edit`, { baseRevision: rev, op: { type: 'composition', sceneId: s.id, composition: k } });
    assert.equal(r.status, 200, JSON.stringify(r.body)); assert.equal(creativeOf(await raw(w)).plan.scenes.find(x => x.id === s.id).composition, k);
  }
  r = await w.owner('POST', `/api/app-bridge/website/${w.projectId}/creative/edit`, { baseRevision: (await raw(w)).revision, op: { type: 'reapply-look' } });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const p = creativeOf(await raw(w)).plan; assert.ok(p.look, 'the look is still there'); assert.equal(p.thread.kind, 'none', 'no rail comes back');
  assert.equal(await balance(w), credits); assert.deepEqual(counts(w.env), calls);
});

// ================================================================ the bug
test('WE-5. THE BUG: "Change the headline to X" on a Creative website goes through the Creative path -- never the Business planner -- and changes the real headline; a request that changes nothing is refused and never charged', async () => {
  const w = await world(); const p0 = await raw(w); const credits = await balance(w); const before = counts(w.env);
  const q = await w.owner('POST', '/api/app-bridge/quotes', { operation: 'website_update', request: 'Change the headline to "Hand-bottled tonic"', projectId: w.projectId });
  const r = await w.owner('POST', `/api/app-bridge/website/${w.projectId}/edits`, { baseRevision: p0.revision, request: 'Change the headline to "Hand-bottled tonic"', quoteId: q.body.quote.id });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(counts(w.env).refinement, before.refinement, 'the Business refinement planner was never asked');
  const after = await raw(w); const d = after.directionsState.directions[0];
  assert.equal(d.creative.plan.scenes[0].text.heading, 'Hand-bottled tonic', 'the Creative page\'s own headline changed');
  assert.deepEqual(d.copy, p0.directionsState.directions[0].copy, 'no Business field was written');
  assert.equal(r.body.creditsCharged, q.body.quote.credits); assert.equal(await balance(w), credits - q.body.quote.credits);
  const draft = await w.owner('GET', `/api/app-bridge/website/${w.projectId}/preview?source=draft`); assert.match(draft.text, /Hand-bottled tonic/, 'and the page shows it');
  // a request that does not change the page: refused, no revision, no charge (a server whose director returns the page as it was)
  const dir = fs.mkdtempSync(path.join(TMP, 'same-')); const env = S.threeDEnv(dir, { MOCK_CREATIVE_REVISE: 'same' }); const srv = await startServer(env);
  try {
    const sc = await S.buildThreeDScenario({ port: srv.port, env, publish: false }); const call = client(srv.port); await call('POST', '/api/identity/supabase/session', { supabaseAccessToken: OWNER });
    const b = bridgeFor(srv.port, OWNER); const pr = (await call('GET', `/api/projects/${sc.projectId}`)).body.project; const bal = (await call('GET', '/api/credits')).body.credits.remaining;
    const q2 = await b('POST', '/api/app-bridge/quotes', { operation: 'website_update', request: 'Change the headline to "Hand-bottled tonic"', projectId: sc.projectId });
    const r2 = await b('POST', `/api/app-bridge/website/${sc.projectId}/edits`, { baseRevision: pr.revision, request: 'Change the headline to "Hand-bottled tonic"', quoteId: q2.body.quote.id });
    assert.equal(r2.status, 422, JSON.stringify(r2.body)); assert.equal(r2.body.error.code, 'no_meaningful_change');
    assert.equal((await call('GET', '/api/credits')).body.credits.remaining, bal, 'not charged');
    assert.equal((await call('GET', `/api/projects/${sc.projectId}`)).body.project.revision, pr.revision, 'no fake revision');
    assert.equal(counts(env).refinement, 0, 'the Business planner never ran');
  } finally { await srv.stop(); }
});

// ================================================================ AI changes through the Website editor
test('WE-6. AI rewrite of one line (quoted 1) and a scene redesign (quoted 2): the builder quotes, the start runs the Creative revision, only the chosen scene changes; the 3D model and every other scene stay', async () => {
  const w = await world(); let o = await outline(w); const s = o.outline.scenes[2]; const keep = JSON.stringify(creativeOf(await raw(w)).plan.scenes.filter(x => x.id !== s.id).map(x => [x.id, x.text]));
  const q = await w.owner('POST', `/api/app-bridge/website/${w.projectId}/creative/quote`, { action: 'ai-text', sceneId: s.id, field: 'heading', request: 'make it warmer' });
  assert.equal(q.status, 200, JSON.stringify(q.body)); assert.equal(q.body.quote.credits, 1); assert.equal(q.body.quote.items[0].label, 'AI rewrite');
  assert.equal(q.body.quote.items[0].target, undefined, 'what was quoted stays on the server');
  const credits = await balance(w);
  const r = await w.owner('POST', `/api/app-bridge/website/${w.projectId}/creative/start`, { quoteId: q.body.quote.id, baseRevision: o.revision });
  assert.equal(r.status, 200, JSON.stringify(r.body)); assert.equal(r.body.creditsCharged, 1); assert.equal(await balance(w), credits - 1);
  let p = creativeOf(await raw(w)).plan; assert.match(p.scenes.find(x => x.id === s.id).text.heading, /^Rewritten: /);
  assert.equal(JSON.stringify(p.scenes.filter(x => x.id !== s.id).map(x => [x.id, x.text])), keep, 'only that line');
  // the same confirmation again (a double click / retry): the result back, never a second charge
  const again = await w.owner('POST', `/api/app-bridge/website/${w.projectId}/creative/start`, { quoteId: q.body.quote.id, baseRevision: o.revision });
  assert.equal(again.status, 200); assert.equal(again.body.replayed, true); assert.equal(await balance(w), credits - 1);
  // a scene redesign
  o = await outline(w); const threeBefore = creativeOf(await raw(w)).threeD;
  const q2 = await w.owner('POST', `/api/app-bridge/website/${w.projectId}/creative/quote`, { action: 'ai-scene', sceneId: s.id, request: 'more dramatic' });
  assert.equal(q2.body.quote.credits, 2);
  const r2 = await w.owner('POST', `/api/app-bridge/website/${w.projectId}/creative/start`, { quoteId: q2.body.quote.id, baseRevision: o.revision });
  assert.equal(r2.status, 200, JSON.stringify(r2.body)); assert.equal(r2.body.creditsCharged, 2);
  p = creativeOf(await raw(w)).plan; assert.match(p.scenes.find(x => x.id === s.id).text.heading, /^Redesigned: /);
  assert.deepEqual(creativeOf(await raw(w)).threeD, threeBefore, 'the 3D model is preserved');
  // the other quoted sizes exist: a rebuild of several scenes 3, the whole page 5
  assert.equal((await w.owner('POST', `/api/app-bridge/website/${w.projectId}/creative/quote`, { action: 'ai-rebuild', sceneIds: [o.outline.scenes[1].id, o.outline.scenes[2].id] })).body.quote.credits, 3);
  assert.equal((await w.owner('POST', `/api/app-bridge/website/${w.projectId}/creative/quote`, { action: 'ai-site', request: 'a bolder page' })).body.quote.credits, 5);
});

// ================================================================ pictures
test('WE-7. an owner upload (a PNG the app made): measured by the builder -- never what the app says -- stored as the owner\'s upload, and it replaces a picture; a picture already on the page is never shown twice', async () => {
  const w = await world(); const o = await outline(w); const calls = counts(w.env); const credits = await balance(w);
  const scene = o.outline.scenes.find(s => s.pictures.length); const pic = scene.pictures[0];
  const r = await w.owner('POST', `/api/app-bridge/website/${w.projectId}/creative/upload`, { baseRevision: o.revision, png: png(1600, 1000), title: 'Bottles on the bar', sceneId: scene.id, layerId: pic.layerId, assess: { width: 9999, height: 9999, transparent: true }, origin: 'research' });
  assert.equal(r.status, 200, JSON.stringify(r.body)); assert.deepEqual(r.body.measured, { width: 1600, height: 1000, transparent: false }, 'the builder\'s own measurement');
  const c = creativeOf(await raw(w)); const a = c.assets.find(x => x.id === r.body.assetId);
  assert.deepEqual([a.origin, a.ownerAffirmed, a.assess.width, a.mime, /^[a-f0-9]{64}$/.test(a.assetRef || '')], ['upload', true, 1600, 'image/png', true], 'an owner upload, stored by reference');
  assert.equal(c.plan.scenes.find(s => s.id === scene.id).layers.find(L => L.id === pic.layerId).asset, a.id, 'shown where it was asked for');
  assert.equal(await balance(w), credits); assert.deepEqual(counts(w.env), calls, 'free');
  // the image ledger: the same picture into a second scene is refused (it is already on the page)
  const o2 = await outline(w); const other = o2.outline.scenes.find(s => s.id !== scene.id && s.pictures.length);
  if (other) {
    const dup = await w.owner('POST', `/api/app-bridge/website/${w.projectId}/creative/edit`, { baseRevision: o2.revision, op: { type: 'picture-replace', sceneId: other.id, layerId: other.pictures[0].layerId, assetId: a.id } });
    assert.equal(dup.status, 422); assert.equal(dup.body.error.code, 'already_on_page');
  }
  // not a PNG / too big / another account
  assert.equal((await w.owner('POST', `/api/app-bridge/website/${w.projectId}/creative/upload`, { baseRevision: o2.revision, png: 'data:image/jpeg;base64,/9j/4AAQ' })).status, 422);
  assert.equal((await w.other('POST', `/api/app-bridge/website/${w.projectId}/creative/upload`, { baseRevision: o2.revision, png: png(200, 200) })).status, 404, 'never into another customer\'s project');
  shared.upload = a.id;
});

// ================================================================ 3D
test('WE-8. Make interactive 3D: the builder quotes, the owner confirms, ONE mocked Tripo job, the model attached to the draft, previewed, published and exported; asking again never makes a second model', async () => {
  const w = await world(); const before = counts(w.env);
  // HOW MANY A PAGE MAKES, by the mode it was made in: made as Creative, this page has its one model -- a second is refused
  const one = await w.owner('POST', `/api/app-bridge/website/${w.projectId}/creative/quote`, { action: 'model3d', assetId: shared.upload });
  assert.deepEqual([one.body.ok, one.body.reason], [false, 'mode_limit'], JSON.stringify(one.body)); assert.match(one.body.message, /A Creative page makes one 3D model.*Creative Showcase up to 4/);
  await madeAs(w, 'showcase'); const o = await outline(w); void o; // made as Creative Showcase: up to 4
  const q = await w.owner('POST', `/api/app-bridge/website/${w.projectId}/creative/quote`, { action: 'model3d', assetId: shared.upload });
  assert.equal(q.status, 200, JSON.stringify(q.body)); assert.ok(q.body.quote.credits >= 1, 'the authoritative 3D price'); assert.equal(counts(w.env).tripo, before.tripo, 'a quote calls nothing');
  const credits = await balance(w);
  const st = await w.owner('POST', `/api/app-bridge/website/${w.projectId}/creative/start`, { quoteId: q.body.quote.id });
  assert.equal(st.status, 200, JSON.stringify(st.body)); assert.ok(st.body.job.jobId);
  const dbl = await w.owner('POST', `/api/app-bridge/website/${w.projectId}/creative/start`, { quoteId: q.body.quote.id }); assert.equal(dbl.body.reused, true, 'a double click is the same job');
  await followJobs(w, b => b.jobs.some(j => j.jobId === st.body.job.jobId && j.terminal));
  assert.equal(counts(w.env).tripo, before.tripo + 1, 'exactly one Tripo submission'); assert.equal(await balance(w), credits - q.body.quote.credits);
  const c = creativeOf(await raw(w)); assert.equal(c.threeD.assets.length, 2, 'the new model joined the page (the first one kept)');
  const m = c.threeD.assets.find(x => x.sourceAssetId === shared.upload); assert.ok(m && /^[a-f0-9]{64}$/.test(m.assetRef || ''), 'stored by reference');
  assert.ok(c.threeD.scenes.some(x => x.assetId === m.id), 'placed by the Creative 3D placement');
  // reading again attaches nothing twice; the draft preview carries it; publish; the download ships it
  await outline(w); assert.equal(creativeOf(await raw(w)).threeD.assets.length, 2);
  const draft = await w.owner('GET', `/api/app-bridge/website/${w.projectId}/preview?source=draft`); assert.equal(S.pageData(draft.text).scenes.length, 2);
  const rev = (await raw(w)).revision; const pub = await w.owner('POST', `/api/app-bridge/website/${w.projectId}/publish`, { revision: rev }); assert.equal(pub.status, 200, JSON.stringify(pub.body));
  const zip = readZip((await w.owner('GET', `/api/app-bridge/website/${w.projectId}/download`)).buf);
  assert.ok(zip.get(`assets/${m.assetRef}.glb`), 'the new model is in the export'); assert.ok(zip.get(`assets/${S.KEY ? m.assetRef : ''}.glb`));
  // the same picture again: reuse, free -- never a second model
  const again = await w.owner('POST', `/api/app-bridge/website/${w.projectId}/creative/quote`, { action: 'model3d', assetId: shared.upload });
  assert.deepEqual([again.body.reuse, again.body.credits], [true, 0]); assert.equal(counts(w.env).tripo, before.tripo + 1);
});

test('WE-9. existing 3D reuse and free 3D controls: place, move, resize, restage, remove -- zero Tripo submissions, zero credits', async () => {
  const w = await world(); const calls = counts(w.env); const credits = await balance(w);
  const q = await w.owner('POST', `/api/app-bridge/website/${w.projectId}/creative/quote`, { action: 'model3d', assetId: 'u-bottle' });
  assert.deepEqual([q.body.reuse, q.body.credits], [true, 0], 'the page already has a model of this picture');
  let o = await outline(w); const placed = o.outline.scenes.find(s => s.models.length); const sc = placed.models[0];
  // (the page has made the one model a Creative page makes: no picture offers a paid model it would refuse)
  const acts = o.outline.scenes.flatMap(s => s.pictures).flatMap(p => p.actions || []); assert.ok(!acts.includes('model3d'), 'no paid model offered: ' + acts.join(' '));
  const free = o.outline.scenes.find(s => !s.models.length);
  const ops = [{ type: 'model-resize', modelSceneId: sc.id, distance: 1.4 }, { type: 'model-turn', modelSceneId: sc.id, azimuth: 30 }, { type: 'model-composition', modelSceneId: sc.id, composition: 'orbit-product' }, { type: 'model-move', modelSceneId: sc.id, sectionId: free.id }];
  for (const op of ops) { o = await outline(w); const r = await w.owner('POST', `/api/app-bridge/website/${w.projectId}/creative/edit`, { baseRevision: o.revision, op }); assert.equal(r.status, 200, `${op.type}: ${JSON.stringify(r.body)}`); }
  const td = creativeOf(await raw(w)).threeD.scenes.find(x => x.id === sc.id);
  assert.deepEqual([td.sectionId, td.composition, td.camera.distance], [free.id, 'orbit-product', 1.4]);
  o = await outline(w); let r = await w.owner('POST', `/api/app-bridge/website/${w.projectId}/creative/edit`, { baseRevision: o.revision, op: { type: 'model-remove', modelSceneId: sc.id } }); assert.equal(r.status, 200);
  assert.equal(creativeOf(await raw(w)).threeD.assets.length, 2, 'the model stays in the project');
  o = await outline(w); r = await w.owner('POST', `/api/app-bridge/website/${w.projectId}/creative/edit`, { baseRevision: o.revision, op: { type: 'model-place', modelId: td.assetId, sectionId: placed.id } }); assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.deepEqual(counts(w.env), calls); assert.equal(await balance(w), credits);
});

// ================================================================ cinematic clips (Higgsfield)
test('WE-10. Add cinematic motion to a picture: an authoritative quote, ONE Higgsfield submission however often it is confirmed, the clip on that picture in the draft, published, exported; reuse is free; a new one is a new quote and one new submission', async () => {
  const w = await world(); const o = await outline(w); const before = counts(w.env);
  const scene = o.outline.scenes.find(s => s.pictures.some(p => p.assetId === shared.upload)); const pic = scene.pictures.find(p => p.assetId === shared.upload);
  assert.ok(pic.actions.includes('motion'), 'offered on an eligible owner upload');
  const q = await w.owner('POST', `/api/app-bridge/website/${w.projectId}/creative/quote`, { action: 'motion', assetId: pic.assetId, sceneId: scene.id, layerId: pic.layerId });
  assert.equal(q.status, 200, JSON.stringify(q.body)); assert.equal(q.body.quote.credits, 12, 'one fresh clip, as the builder prices it today');
  assert.equal(counts(w.env).higgsfield, before.higgsfield, 'a quote sends nothing');
  const credits = await balance(w);
  const starts = await Promise.all([1, 2, 3].map(() => w.owner('POST', `/api/app-bridge/website/${w.projectId}/creative/start`, { quoteId: q.body.quote.id })));
  starts.forEach(s => assert.equal(s.status, 200, JSON.stringify(s.body)));
  assert.equal(new Set(starts.map(s => s.body.job.jobId)).size, 1, 'three confirmations, one job');
  const jobId = starts[0].body.job.jobId;
  await followJobs(w, b => b.jobs.some(j => j.jobId === jobId && j.terminal));
  assert.equal(counts(w.env).higgsfield, before.higgsfield + 1, 'exactly one Higgsfield submission'); assert.equal(await balance(w), credits - 12);
  const c = creativeOf(await raw(w)); const a = c.assets.find(x => x.id === shared.upload); assert.ok(a.video && a.video.mediaId, 'the clip is on the picture');
  assert.ok(c.plan.scenes.find(s => s.id === scene.id).layers.some(L => L.asset === shared.upload), 'in the scene it was asked for');
  // reload: the same clip, never attached twice, never made again
  const ol = await outline(w); assert.equal(ol.outline.media.filter(m => m.assetId === shared.upload).length, 1); assert.ok(ol.jobs.some(j => j.jobId === jobId));
  // reuse: free
  const re = await w.owner('POST', `/api/app-bridge/website/${w.projectId}/creative/quote`, { action: 'motion', assetId: shared.upload, sceneId: scene.id, layerId: pic.layerId });
  assert.deepEqual([re.body.reuse, re.body.credits], [true, 0]);
  // remove and put back: free, no provider
  let o2 = await outline(w); let r = await w.owner('POST', `/api/app-bridge/website/${w.projectId}/creative/edit`, { baseRevision: o2.revision, op: { type: 'motion-remove', assetId: shared.upload } }); assert.equal(r.status, 200);
  assert.equal(creativeOf(await raw(w)).assets.find(x => x.id === shared.upload).video, undefined);
  o2 = await outline(w);assert.ok(o2.outline.scenes.flatMap(s => s.pictures).find(p => p.assetId === shared.upload).actions.includes('motion-restore'));
  r = await w.owner('POST', `/api/app-bridge/website/${w.projectId}/creative/edit`, { baseRevision: o2.revision, op: { type: 'motion-restore', assetId: shared.upload } }); assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(creativeOf(await raw(w)).assets.find(x => x.id === shared.upload).video.mediaId, a.video.mediaId, 'the same clip back');
  assert.equal(counts(w.env).higgsfield, before.higgsfield + 1);
  // published and exported with the clip
  const rev = (await raw(w)).revision; assert.equal((await w.owner('POST', `/api/app-bridge/website/${w.projectId}/publish`, { revision: rev })).status, 200);
  const zip = readZip((await w.owner('GET', `/api/app-bridge/website/${w.projectId}/download`)).buf);
  assert.ok([...zip.keys()].some(k => /\.mp4$/.test(k)), 'the clip ships in the website files');
  // a brand-new clip: a new quote, one new submission
  const fresh = await w.owner('POST', `/api/app-bridge/website/${w.projectId}/creative/quote`, { action: 'motion', assetId: shared.upload, sceneId: scene.id, layerId: pic.layerId, fresh: true });
  assert.equal(fresh.body.quote.credits, 12); assert.notEqual(fresh.body.quote.id, q.body.quote.id);
  const st2 = await w.owner('POST', `/api/app-bridge/website/${w.projectId}/creative/start`, { quoteId: fresh.body.quote.id });
  await followJobs(w, b => b.jobs.some(j => j.jobId === st2.body.job.jobId && j.terminal));
  assert.equal(counts(w.env).higgsfield, before.higgsfield + 2, 'one new submission for the new clip');
});

test('WE-11. Make cinematic video from 3D: the existing model\'s still (the 3D engine page), ONE Higgsfield submission, zero new Tripo submissions', async () => {
  const w = await world(); const before = counts(w.env);
  const page = await w.owner('GET', `/api/app-bridge/website/${w.projectId}/creative/still`);
  assert.equal(page.status, 200); assert.match(page.text, /SiteRemade3D/); assert.match(page.text, /data:model\/gltf-binary;base64,/); assert.doesNotMatch(page.text, /https?:\/\/127\.0\.0\.1/);
  const q = await w.owner('POST', `/api/app-bridge/website/${w.projectId}/creative/quote`, { action: 'motion3d' });
  assert.equal(q.status, 200, JSON.stringify(q.body)); assert.equal(q.body.needsRender, true); assert.equal(q.body.quote.credits, 12);
  const bad = await w.owner('POST', `/api/app-bridge/website/${w.projectId}/creative/start`, { quoteId: q.body.quote.id, render: png(64, 64, [200, 200, 200]) });
  assert.equal(bad.body.reason, 'model3d_render', 'a still of the wrong size is refused -- before any reservation'); assert.equal(counts(w.env).higgsfield, before.higgsfield);
  const R = cinematicSource.RENDER;
  const st = await w.owner('POST', `/api/app-bridge/website/${w.projectId}/creative/start`, { quoteId: q.body.quote.id, render: png(R.width, R.height, [238, 240, 242]) });
  assert.equal(st.status, 200, JSON.stringify(st.body));
  await followJobs(w, b => b.jobs.some(j => j.jobId === st.body.job.jobId && j.terminal));
  assert.equal(counts(w.env).higgsfield, before.higgsfield + 1); assert.equal(counts(w.env).tripo, before.tripo, 'the model was never made again');
});

// ================================================================ safety
test('WE-12. not enough credits: the provider is never called; another account can read, change, upload, generate, spend and publish nothing of this website', async () => {
  const w = await world(); const before = counts(w.env); const credits = await balance(w);
  // another customer
  const id = w.projectId; const o = await outline(w);
  for (const [m, u, b] of [['GET', `/api/app-bridge/website/${id}/creative`], ['POST', `/api/app-bridge/website/${id}/creative/edit`, { baseRevision: o.revision, op: { type: 'reapply-look' } }],
    ['POST', `/api/app-bridge/website/${id}/creative/quote`, { action: 'model3d', assetId: shared.upload }], ['POST', `/api/app-bridge/website/${id}/creative/quote`, { action: 'motion', assetId: shared.upload }],
    ['GET', `/api/app-bridge/website/${id}/creative/jobs`], ['GET', `/api/app-bridge/website/${id}/creative/still`], ['POST', `/api/app-bridge/website/${id}/publish`, { revision: o.revision }]]) {
    const r = await w.other(m, u, b); assert.equal(r.status, 404, `${m} ${u}: ${r.status}`);
  }
  // the owner's own quote, used by another account: not found
  const q = await w.owner('POST', `/api/app-bridge/website/${id}/creative/quote`, { action: 'motion', assetId: shared.upload, fresh: true });
  assert.equal((await w.other('POST', `/api/app-bridge/website/${id}/creative/start`, { quoteId: q.body.quote.id })).status, 404);
  // the owner's quote on ANOTHER project of theirs is not this project's
  assert.deepEqual(counts(w.env), before); assert.equal(await balance(w), credits);
  // insufficient credits: a server where the account has 2
  const dir = fs.mkdtempSync(path.join(TMP, 'poor-')); const env = S.threeDEnv(dir, { SITEREMADE_TRIAL_CREDITS: '9', HIGGSFIELD_VIDEO_ENDPOINT: 'kling-video/v3.0/4k/image-to-video', SITEREMADE_RATE_LIMIT_APP_BRIDGE_ACCOUNT_MAX: '100000' }); const srv = await startServer(env);
  try {
    // (a draft of this account: a purchase would add its first-website bonus credits)
    const call = client(srv.port); await call('POST', '/api/identity/supabase/session', { supabaseAccessToken: OWNER });
    const sc = { projectId: (await call('POST', '/api/projects', { name: 'Aurelia', directionsState: { directions: [S.creativePage()], activeDirectionIndex: 0 } })).body.project.id }; const b = bridgeFor(srv.port, OWNER);
    const ol = (await b('GET', `/api/app-bridge/website/${sc.projectId}/creative`)).body;
    const up = await b('POST', `/api/app-bridge/website/${sc.projectId}/creative/upload`, { baseRevision: ol.revision, png: png(1600, 1000) });
    const q2 = await b('POST', `/api/app-bridge/website/${sc.projectId}/creative/quote`, { action: 'motion', assetId: up.body.assetId });
    assert.equal(q2.body.enough, false, 'the quote says so');
    const st = await b('POST', `/api/app-bridge/website/${sc.projectId}/creative/start`, { quoteId: q2.body.quote.id });
    assert.equal(st.status, 402, JSON.stringify(st.body)); await sleep(300);
    assert.equal(counts(env).higgsfield, 0, 'Higgsfield never called');
  } finally { await srv.stop(); }
});

// ================================================================ add a picture
test('WE-13c. The owner\'s own 3D model (.glb): checked as every model, shown in the chosen scene turning with the scroll, its picture the stand-in -- free; a file that is not a model, or is too large, changes nothing', async () => {
  const w = await world(); const o = await outline(w); const calls = counts(w.env); const credits = await balance(w);
  const at = o.outline.scenes.find(x => x.pictures.some(p => p.layerId)) || o.outline.scenes[1];
  const glb = fs.readFileSync(path.join(__dirname, 'fixtures', 'three-d', 'product-normalized.glb'));
  const send = (buf, rev, type) => w.owner('POST', `/api/app-bridge/website/${w.projectId}/creative/model-upload`, { baseRevision: rev, glb: `data:${type || 'model/gltf-binary'};base64,${buf.toString('base64')}`, sceneId: at.id, title: 'My orb' });
  const bad = await send(Buffer.from('<html>not a model</html>'), o.revision); assert.equal(bad.status, 422); assert.equal(bad.body.error.code, 'invalid_file');
  const big = await send(Buffer.concat([glb, Buffer.alloc(9 * 1024 * 1024)]), o.revision); assert.ok([413, 422].includes(big.status), 'too large: ' + big.status);
  const r = await send(glb, o.revision, 'application/octet-stream'); assert.equal(r.status, 200, JSON.stringify(r.body)); assert.match(r.body.changeSummary[0], /3D model/);
  const td = creativeOf(await raw(w)).threeD; const m = td.assets.find(x => x.id === r.body.modelId);
  assert.ok(m && m.assetRef, 'stored by reference ' + JSON.stringify({ id: r.body.modelId, assets: td && td.assets.map(x => [x.id, !!x.assetRef, !!x.dataUrl]) })); assert.equal(m.provenance.provider, 'owner');
  const sc = td.scenes.find(x => x.sectionId === at.id); assert.equal(sc.assetId, m.id); assert.equal(sc.composition, 'scroll-rotate');
  if (at.pictures.some(p => p.layerId)) assert.ok(m.sourceAssetId, 'the scene picture is its stand-in');
  const o2 = await outline(w); assert.ok(o2.outline.scenes.find(x => x.id === at.id).models.length, 'the editor shows the model in that scene');
  assert.equal(await balance(w), credits); assert.deepEqual(counts(w.env), calls, 'free: no provider, no credit');
});

test('WE-13b. Add a picture to THIS scene: an upload goes into the chosen scene beside its words (a page that holds as many scenes as it can still takes it) -- free, its words and every other scene as they were', async () => {
  const w = await world(); const o = await outline(w); const calls = counts(w.env); const credits = await balance(w);
  const before = creativeOf(await raw(w)).plan.scenes; const n = before.length;
  const at = o.outline.scenes.find(x => !x.pictures.length) || o.outline.scenes.find(x => x.actions.includes('picture-add'));
  assert.ok(at && at.actions.includes('picture-add'), 'offered on a scene with room for a picture');
  const r = await w.owner('POST', `/api/app-bridge/website/${w.projectId}/creative/upload`, { baseRevision: o.revision, png: png(1600, 1000), title: 'Behind the counter', into: at.id });
  assert.equal(r.status, 200, JSON.stringify(r.body)); assert.match(r.body.changeSummary[0], /Added your picture to/);
  const after = creativeOf(await raw(w)).plan.scenes; assert.equal(after.length, n, 'no new scene');
  const sc = after.find(x => x.id === at.id); assert.ok(sc.layers.some(L => L.kind === 'image' && L.asset === r.body.assetId), 'the picture is in that scene');
  const words = t => [t.kicker, t.heading, t.body, t.items]; assert.deepEqual(words(sc.text), words(before.find(x => x.id === at.id).text), 'its words as they were (set again around the picture)');
  assert.deepEqual(after.filter(x => x.id !== at.id), before.filter(x => x.id !== at.id), 'every other scene exactly as it was');
  const o2 = await outline(w); assert.ok(o2.outline.scenes.find(x => x.id === at.id).pictures.some(p => p.assetId === r.body.assetId), 'the editor lists it in that scene');
  assert.equal(await balance(w), credits); assert.deepEqual(counts(w.env), calls, 'free: no provider, no credit');
});

test('WE-13. Add a picture: an upload (or a picture the project already has) goes on the page as its own new scene after the chosen one, shown big -- free, and every other scene exactly as it was', async () => {
  const w = await world(); const o = await outline(w); const calls = counts(w.env); const credits = await balance(w);
  const before = creativeOf(await raw(w)).plan.scenes; const n = before.length;
  const at = o.outline.scenes[1]; assert.ok(at.actions.includes('picture-scene'), 'offered while the page has room');
  const r = await w.owner('POST', `/api/app-bridge/website/${w.projectId}/creative/upload`, { baseRevision: o.revision, png: png(1600, 1000), title: 'Behind the counter', after: at.id });
  assert.equal(r.status, 200, JSON.stringify(r.body)); assert.match(r.body.changeSummary[0], /new scene/);
  const after = creativeOf(await raw(w)).plan.scenes; assert.equal(after.length, n + 1);
  const added = after.find(s => !before.some(b => b.id === s.id)); const k = after.indexOf(added);
  assert.ok(k >= 1 && k <= n - 1, 'never after the ending'); assert.ok(added.layers.some(L => L.kind === 'image' && L.asset === r.body.assetId), 'the picture is on the page');
  assert.deepEqual(after.filter(s => s !== added), before, 'every other scene exactly as it was');
  // a picture the project already has but does not show: the same, through the free edit
  const o2 = await outline(w); const spare = o2.outline.pictures.find(p => !p.onPage);
  if (spare) {
    const e = await w.owner('POST', `/api/app-bridge/website/${w.projectId}/creative/edit`, { baseRevision: o2.revision, op: { type: 'picture-scene', sceneId: o2.outline.scenes[0].id, assetId: spare.assetId } });
    assert.equal(e.status, 200, JSON.stringify(e.body)); assert.equal(creativeOf(await raw(w)).plan.scenes.length, n + 2);
    const again = await w.owner('POST', `/api/app-bridge/website/${w.projectId}/creative/edit`, { baseRevision: e.body.revision, op: { type: 'picture-scene', sceneId: o2.outline.scenes[0].id, assetId: spare.assetId } });
    assert.equal(again.status, 422); assert.equal(again.body.error.code, 'already_on_page', 'each picture appears once');
  }
  assert.equal(await balance(w), credits); assert.deepEqual(counts(w.env), calls, 'free: no provider, no credit');
});
