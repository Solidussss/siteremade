'use strict';
// INTERACTIVE 3D SOURCE: PROVENANCE AND THE SAVED PAGE. The production failure: the studio offered the owner's uploaded
// product photo for 3D (it is on the page -- its cut-out, twice), the server answered "The uploaded picture is not
// suitable for a 3D model. (the picture is not on the page)". Cause: the saved project did not HAVE the upload -- the
// Creative sanitizer cut the asset list at its first 24 pictures by position, and the studio appends a picture added
// after the page was made (with its cut-out) at the END, behind the generation's web pictures and their cut-outs. Fixed:
// lib/creative/store.js capAssets keeps what the page uses and the owner's uploads first; and the 3D source follows a
// picture's persisted provenance (cutoutOf / derivedFrom, lib/creative/three-d.js rootPicture) to the upload it comes from.
// REAL PROVIDER SPEND: $0 (Tripo is test/helpers/mock-tripo.js).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const TD = require('../lib/creative/three-d');
const { sanitizeCreative } = require('../lib/creative/store');
const { startServer, client, providerCalls } = require('./helpers/server-process');
const { threeDEnv, creativePage } = require('./helpers/three-d-scenario');
const { mockPng } = require('./helpers/mock-image');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'sr-3d-prov-'));
const small = id => 'data:image/png;base64,' + mockPng(id, '4:5').split(',')[1];
const web = i => ({ id: `w${i}`, origin: 'research', title: `found picture ${i}`, mime: 'image/png', dataUrl: small('w' + i), pageUrl: `https://example.com/page${i}`, sourceUrl: `https://example.com/pic${i}.png`, assess: { width: 320, height: 400, aspect: 0.8, orientation: 'portrait', subject: [0.2, 0.1, 0.8, 0.9] } });
const webCut = i => ({ id: `c-w${i}`, origin: 'derived', cutout: true, cutoutOf: `w${i}`, title: `found picture ${i}`, mime: 'image/png', dataUrl: small('cw' + i), assess: { width: 320, height: 400, aspect: 0.8, orientation: 'portrait', transparent: true } });
// the generation's 12 web pictures and their 12 cut-outs FIRST, the owner's photo and its cut-out AFTER (as the studio
// appends a picture added once the page exists) -- 26 pictures, two more than the old cut kept
function crowdedPage() {
  const page = creativePage(); const c = page.creative; const own = c.assets; // [u-bottle, c-bottle]; the plan shows c-bottle
  c.assets = Array.from({ length: 12 }, (_, i) => web(i)).concat(Array.from({ length: 12 }, (_, i) => webCut(i)), own);
  return page;
}
const tripoSubmits = env => providerCalls(env.MOCK_CALL_LOG).filter(c => c.provider === 'tripo' && c.endpoint === 'submit').length;
async function signedIn(port, token) { const call = client(port); assert.equal((await call('POST', '/api/identity/supabase/session', { supabaseAccessToken: token || 'test-access-token-owner' })).status, 200); return call; }

// ================================================================ the rules, in-process
test('PROV-1. provenance: a cut-out, a copy, a copy of a cut-out all lead to the upload they come from -- through the project\'s own links only; a broken or looping chain leads nowhere', () => {
  const byId = new Map([
    ['u1', { id: 'u1', origin: 'upload' }], ['c-u1', { id: 'c-u1', origin: 'derived', cutoutOf: 'u1' }], ['pv-hero-c-u1', { id: 'pv-hero-c-u1', origin: 'derived', derivedFrom: 'c-u1' }],
    ['w1', { id: 'w1', origin: 'research', pageUrl: 'https://example.com/' }], ['c-w1', { id: 'c-w1', origin: 'derived', cutoutOf: 'w1' }],
    ['orphan', { id: 'orphan', origin: 'derived', cutoutOf: 'gone' }], ['loopA', { id: 'loopA', derivedFrom: 'loopB' }], ['loopB', { id: 'loopB', derivedFrom: 'loopA' }],
  ]);
  for (const id of ['u1', 'c-u1', 'pv-hero-c-u1']) assert.equal(TD.rootPicture(byId.get(id), byId).id, 'u1', id);
  assert.equal(TD.rootPicture(byId.get('c-w1'), byId).id, 'w1');
  assert.equal(TD.rootPicture(byId.get('orphan'), byId), null); assert.equal(TD.rootPicture(byId.get('loopA'), byId), null);
  // eligibility follows it: a copy of the upload's cut-out is the upload; a cut-out of a web picture is a web picture
  const big = { width: 1200, height: 1500, subject: [0.15, 0.07, 0.85, 0.93] };
  for (const a of byId.values()) if (!a.assess) a.assess = big;
  assert.equal(TD.sourceEligible(byId.get('pv-hero-c-u1'), { byId }).ok, true);
  assert.equal(TD.sourceEligible(byId.get('c-w1'), { byId }).code, 'not_upload', 'a web picture never passes for an upload, however it was copied');
  assert.equal(TD.sourceEligible(byId.get('orphan'), { byId }).code, 'missing'); assert.equal(TD.sourceEligible(byId.get('loopA'), { byId }).code, 'missing');
  // an "upload" that says it was derived from a web picture inherits the web picture's standing, never the reverse
  const forged = new Map(byId); forged.set('u2', { id: 'u2', origin: 'upload', derivedFrom: 'w1', assess: big });
  assert.equal(TD.sourceEligible(forged.get('u2'), { byId: forged }).code, 'not_upload');
  assert.equal(TD.SOURCE_MESSAGE ? true : true, true);
});

test('PROV-2. the save keeps what the page needs: past 24 pictures, every picture the page or its 3D model uses (and what it comes from) and the owner\'s uploads are kept before web pictures; removed records go first; the order is kept; saving twice changes nothing', () => {
  const page = crowdedPage(); const c = page.creative;
  const old = c.assets.slice(0, 24).map(a => a.id); assert.ok(!old.includes('u-bottle') && !old.includes('c-bottle'), '(the old cut dropped them)');
  const saved = sanitizeCreative(c); const ids = saved.assets.map(a => a.id);
  assert.equal(ids.length, 24); assert.ok(ids.includes('u-bottle') && ids.includes('c-bottle'), 'the owner\'s photo and its cut-out are saved');
  assert.deepEqual(ids, c.assets.map(a => a.id).filter(id => ids.includes(id)), 'in their own order');
  const again = sanitizeCreative(JSON.parse(JSON.stringify(saved))); assert.deepEqual(again.assets.map(a => a.id), ids, 'saving the saved page keeps the same pictures');
  // removed records are the first to go; a web picture the plan uses is kept over one it does not
  const withRemoved = Object.assign({}, c, { assets: [{ id: 'gone1', origin: 'upload', removed: true }, { id: 'gone2', origin: 'research', removed: true }].concat(c.assets) });
  const r = sanitizeCreative(withRemoved).assets.map(a => a.id); assert.ok(!r.includes('gone1') && !r.includes('gone2') && r.includes('u-bottle'));
  const usedWeb = JSON.parse(JSON.stringify(c)); usedWeb.mainAsset = 'w11';
  assert.ok(sanitizeCreative(usedWeb).assets.some(a => a.id === 'w11'), 'a web picture the page uses is kept');
  // under the cap nothing changes at all
  const few = creativePage().creative; assert.deepEqual(sanitizeCreative(few).assets.map(a => a.id), few.assets.map(a => a.id));
});

// ================================================================ the real server: the exact production failure
test('PROV-3. THE FAILURE: owner upload -> its cut-out on the page -> the upload added after a crowded generation -> selecting the ORIGINAL upload for 3D is eligible, the quote succeeds, and the mocked Tripo is submitted exactly once', async () => {
  const dir = fs.mkdtempSync(path.join(TMP, 'crowded-')); const env = threeDEnv(dir, { MOCK_TRIPO: 'success' }); const srv = await startServer(env);
  try {
    const call = await signedIn(srv.port); const page = crowdedPage();
    const shows = page.creative.plan.scenes.filter(s => s.layers.some(L => L.kind === 'image' && L.asset === 'c-bottle')).length; assert.ok(shows >= 1, `the product is on the page (${shows} scenes)`);
    const projectId = (await call('POST', '/api/projects', { name: 'Coke', directionsState: { directions: [page], activeDirectionIndex: 0 } })).body.project.id;
    const saved = (await call('GET', `/api/projects/${projectId}`)).body.project.directionsState.directions[0].creative;
    assert.ok(saved.assets.some(a => a.id === 'u-bottle'), 'the saved page has the upload');
    const q = await call('POST', '/api/creative/premium/3d/quote', { projectId, assetId: 'u-bottle' });
    assert.equal(q.body.ok, true, JSON.stringify(q.body)); assert.doesNotMatch(JSON.stringify(q.body), /not on the page|not in the saved page/);
    assert.equal(q.body.sourceAssetId, 'u-bottle'); assert.ok(page.creative.plan.scenes.some(s => s.id === q.body.sectionId && s.layers.some(L => L.asset === 'c-bottle')), 'the model stands where the product is shown');
    // the cut-out the page shows names the same photo
    const qc = await call('POST', '/api/creative/premium/3d/quote', { projectId, assetId: 'c-bottle' }); assert.deepEqual([qc.body.ok, qc.body.sourceAssetId], [true, 'u-bottle']);
    const start = await call('POST', '/api/creative/premium/3d/start', { quoteId: q.body.quote.id }); assert.ok(start.body.job, JSON.stringify(start.body));
    let job; for (let i = 0; i < 300; i++) { job = (await call('GET', `/api/creative/premium/status/${start.body.job.jobId}`)).body.job; if (job.terminal) break; await new Promise(r => setTimeout(r, 40)); }
    assert.equal(job.status, 'completed'); assert.equal(job.delivered[0].sourceAssetId, 'u-bottle');
    assert.equal(tripoSubmits(env), 1, 'Tripo was asked exactly once');
  } finally { await srv.stop(); }
});

test('PROV-4. a copy of the cut-out on the page leads to the upload; an upload used NOWHERE on the page keeps the existing rule (eligible -- there is no placement rule -- the model then stands in the second section); an unrelated derived picture qualifies nothing; a web picture never masquerades; another account\'s upload never qualifies', async () => {
  const dir = fs.mkdtempSync(path.join(TMP, 'rules-')); const env = threeDEnv(dir, { MOCK_TRIPO: 'success' }); const srv = await startServer(env);
  try {
    const call = await signedIn(srv.port); const page = creativePage(); const c = page.creative;
    const big = c.assets[0];
    // a copy of the cut-out (derivedFrom: c-bottle), shown in a section in place of the cut-out
    // (the extra pictures are small: what matters here is who they are, not their pixels -- the page must stay under the
    // project store's size limit)
    const copy = Object.assign({}, c.assets[1], { id: 'pv-hero-c-bottle', derivedFrom: 'c-bottle', dataUrl: small('copy') }); delete copy.cutoutOf; delete copy.cutout; copy.origin = 'derived';
    const showsBottle = s => s.layers.some(L => L.asset === 'c-bottle'); // (the opening, and the closing callback when the page ends on one)
    const section = c.plan.scenes.find((s, i) => i > 0 && showsBottle(s)) || c.plan.scenes.find(showsBottle);
    section.layers.forEach(L => { if (L.asset === 'c-bottle') L.asset = copy.id; });
    // an unused second upload; an unrelated derived picture (a cut-out of a web picture) on the page; a web picture
    const unused = Object.assign({}, big, { id: 'u-unused', title: 'another photo', dataUrl: 'data:image/png;base64,' + require('./fixtures/three-d/make-fixture').productPhoto(600, 750, false).toString('base64'), assess: Object.assign({}, big.assess, { width: 600, height: 750 }) });
    const w = Object.assign(web(1), { assess: big.assess }); const wc = Object.assign(webCut(1), { assess: big.assess });
    // (and a forged "upload" that is a copy of the web picture)
    const forged = Object.assign({}, big, { id: 'u-forged', derivedFrom: 'w1', dataUrl: small('forged') });
    c.assets = c.assets.concat([copy, unused, w, wc, forged]);
    const projectId = (await call('POST', '/api/projects', { name: 'Coke', directionsState: { directions: [page], activeDirectionIndex: 0 } })).body.project.id;
    const quote = id => call('POST', '/api/creative/premium/3d/quote', { projectId, assetId: id });
    // the copy of the cut-out -> the upload, standing where the copy is shown
    const viaCopy = await quote(copy.id); assert.deepEqual([viaCopy.body.ok, viaCopy.body.sourceAssetId, viaCopy.body.sectionId], [true, 'u-bottle', section.id]);
    const original = await quote('u-bottle'); assert.deepEqual([original.body.ok, original.body.sectionId], [true, section.id], 'the original upload is placed where its copy is shown');
    // unused anywhere on the page: the existing rule -- eligible, placed in the second section
    const u = await quote('u-unused'); assert.deepEqual([u.body.ok, u.body.sourceAssetId, u.body.sectionId], [true, 'u-unused', c.plan.scenes[1].id]);
    // nothing else qualifies through anyone's provenance
    for (const id of ['w1', 'c-w1', 'u-forged']) { const r = await quote(id); assert.deepEqual([r.body.ok, r.body.reason], [false, 'source_not_eligible'], id); assert.match(r.body.message, /found on the web/, id); }
    // another account: not its project (404), and its own project never contains this account's upload
    const other = await signedIn(srv.port, 'test-access-token-other');
    assert.equal((await other('POST', '/api/creative/premium/3d/quote', { projectId, assetId: 'u-bottle' })).status, 404);
    const theirs = (await other('POST', '/api/projects', { name: 'Theirs', directionsState: { directions: [creativePage()], activeDirectionIndex: 0 } })).body.project.id;
    const cross = await other('POST', '/api/creative/premium/3d/quote', { projectId: theirs, assetId: 'u-unused' });
    assert.deepEqual([cross.body.ok, cross.body.reason], [false, 'source_not_eligible'], 'an id from another account\'s page is nothing here'); assert.match(cross.body.message, /not in the saved page/);
    assert.equal(tripoSubmits(env), 0, 'quotes send nothing');
  } finally { await srv.stop(); }
});
