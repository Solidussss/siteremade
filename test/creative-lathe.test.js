'use strict';
// 3D FROM THE OWNER'S OWN PICTURE, FREE (lib/three-d/lathe.js + the editor's 'model-lathe'): a product round about its upright
// axis -- a can, a bottle, a jar -- becomes a real 3D model from its cut-out alone (its outline turned about its axis, the
// photo wrapped back on as it was printed), stored and shown turning in its scene. Anything else stays a picture.
// REAL PROVIDER SPEND: $0 (nothing leaves the server).
const test = require('node:test');
const assert = require('node:assert/strict');
const LATHE = require('../lib/three-d/lathe');
const GLB = require('../lib/three-d/glb');
const TD = require('../lib/creative/three-d');
const PNG = require('../lib/creative/png');
const editor = require('../lib/creative-editor');
const D2 = require('../lib/creative/director2');
const { validatePlan2 } = require('../lib/creative/validate2');
const { ASSETS, UND, FACTS } = require('./helpers/brand-fixture');

// a can: a rounded rectangle with a striped label and a shoulder at the top, on transparency
function can(w = 240, h = 420, lopsided = false) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const top = 30, bot = h - 30; let half = 70; if (y < top + 30) half = 54 + (y - top) * 0.5; if (y < top || y > bot) continue;
    const cx = w / 2 + (lopsided && y > h / 2 ? 40 : 0); if (Math.abs(x - cx) > half) continue;
    const i = (y * w + x) * 4; const band = Math.floor((y - top) / 40) % 2; data[i] = band ? 210 : 230; data[i + 1] = band ? 30 : 230; data[i + 2] = band ? 40 : 220; data[i + 3] = 255;
  }
  return { width: w, height: h, data };
}

test('L1. a round product becomes a valid, page-sized 3D model: its own outline, its own picture', () => {
  const r = LATHE.fromCutout(can()); assert.equal(r.ok, true, r.reason);
  const seen = GLB.inspect(r.glb); assert.deepEqual(GLB.check(seen.info, TD.LIMITS), { ok: true });
  assert.ok(seen.info.triangles > 5000 && seen.info.triangles < TD.LIMITS.trianglesTarget, String(seen.info.triangles));
  assert.equal(seen.info.textures.count, 1, 'the picture is its texture'); assert.ok(Math.abs(seen.info.bounds.max[1] - 0.5) < 1e-3 && Math.abs(seen.info.bounds.min[1] + 0.5) < 1e-3, 'one unit tall, centred');
  assert.ok(Math.abs(seen.info.bounds.max[0] - 70 / 360) < 0.02, `its radius is its own: ${seen.info.bounds.max[0]}`);
});

test('L2. anything not round about its axis stays a picture', () => {
  const r = LATHE.fromCutout(can(240, 420, true)); assert.equal(r.ok, false); assert.match(r.reason, /round about its axis/);
  const blank = { width: 50, height: 50, data: new Uint8ClampedArray(50 * 50 * 4) }; assert.equal(LATHE.fromCutout(blank).ok, false);
});

test('L3. the editor makes it for a scene, free: stored by reference, shown turning in that scene, offered only on the owner\'s own cut-outs', () => {
  const { plan, recipe } = D2.direct({ understanding: UND, research: { page: null, facts: FACTS }, assets: ASSETS, supplied: { facts: [], memories: [] }, seed: '3', mainAsset: 'can' });
  const p = validatePlan2(plan, { assets: ASSETS, facts: FACTS, understanding: UND, art: recipe, mainAsset: 'can' }).plan;
  const dataUrl = 'data:image/png;base64,' + PNG.encode(can()).toString('base64');
  const assets = ASSETS.map(a => (a.id === 'c-can' ? Object.assign({}, a, { dataUrl, mime: 'image/png' }) : a));
  const direction = { mode: 'creative', creative: { v: 1, plan: p, assets, understanding: UND, research: { page: null, facts: FACTS }, supplied: { facts: [], memories: [] }, mainAsset: 'can' } };
  const o = editor.outline(direction, { can: {} }); const pic = o.scenes.flatMap(s => s.pictures.map(x => Object.assign({ scene: s.id }, x))).find(x => x.actions.includes('model-lathe'));
  assert.ok(pic, 'offered on the owner\'s cut-out picture');
  const stored = []; const r = editor.applyEdit(direction, { type: 'model-lathe', sceneId: pic.scene, assetId: pic.assetId }, { store: (buf, mime) => { stored.push({ buf, mime }); return 'f'.repeat(64); }, read: () => null });
  assert.equal(r.ok, true, r.message); assert.equal(stored.length, 1); assert.equal(stored[0].mime, TD.MIME); assert.match(r.summary, /from your picture.*free/);
  const td = r.creative.threeD; const m = td.assets.find(x => x.id.startsWith('tdl-')); assert.ok(m && m.assetRef === 'f'.repeat(64) && !m.dataUrl, 'stored by reference');
  assert.equal(m.sourceAssetId, 'can'); const sc = td.scenes.find(x => x.assetId === m.id); assert.equal(sc.sectionId, pic.scene);
  assert.deepEqual(r.creative.plan, p, 'the page itself is unchanged: the model stands where the picture stood');
  // a found-online picture is never turned into a model; a lopsided product stays a picture
  const web = o.scenes.flatMap(s => s.pictures).find(x => x.source && x.source.kind === 'web'); if (web) assert.ok(!web.actions.includes('model-lathe'));
  const bad = assets.map(a => (a.id === 'c-can' ? Object.assign({}, a, { dataUrl: 'data:image/png;base64,' + PNG.encode(can(240, 420, true)).toString('base64') }) : a));
  const no = editor.applyEdit(Object.assign({}, direction, { creative: Object.assign({}, direction.creative, { assets: bad }) }), { type: 'model-lathe', sceneId: pic.scene, assetId: pic.assetId }, { store: () => 'x', read: () => null });
  assert.equal(no.ok, false); assert.match(no.message, /stays a picture/);
});

test('L4. the studio\'s route: the cut-out it made (a PNG) becomes a stored model, free -- a lopsided one stays a picture -- and the studio offers it only as a click', async () => {
  const fs = require('fs'); const os = require('os'); const path = require('path');
  const { startServer, client, providerCalls } = require('./helpers/server-process'); const S = require('./helpers/three-d-scenario');
  const env = S.threeDEnv(fs.mkdtempSync(path.join(os.tmpdir(), 'sr-lathe-')), {}); const srv = await startServer(env);
  try {
    const call = client(srv.port); await call('POST', '/api/identity/supabase/session', { supabaseAccessToken: 'test-access-token-owner' });
    const png = img => 'data:image/png;base64,' + PNG.encode(img).toString('base64');
    const r = await call('POST', '/api/creative/3d/lathe', { png: png(can()), sourceAssetId: 'u-can', title: 'Kolaro can' });
    assert.equal(r.status, 200, JSON.stringify(r.body)); assert.equal(r.body.ok, true, r.body.message); assert.equal(r.body.composition, 'label-turn');
    assert.match(r.body.asset.id, /^tdl-u-can/); assert.match(r.body.asset.assetRef, /^[a-f0-9]{64}$/); assert.equal(r.body.asset.sourceAssetId, 'u-can');
    assert.match(r.body.dataUrl, /^data:model\/gltf-binary;base64,/); assert.equal(GLB.check(GLB.inspect(Buffer.from(r.body.dataUrl.split(',')[1], 'base64')).info, TD.LIMITS).ok, true);
    const no = await call('POST', '/api/creative/3d/lathe', { png: png(can(240, 420, true)), sourceAssetId: 'u-x' }); assert.equal(no.body.ok, false); assert.match(no.body.message, /stays a picture/);
    assert.equal((await call('POST', '/api/creative/3d/lathe', { png: 'data:image/jpeg;base64,/9j/' })).status, 400);
    assert.equal(providerCalls(env.MOCK_CALL_LOG).filter(c => c.provider === 'tripo').length, 0, 'no provider is asked: it is made here');
  } finally { await srv.stop(); }
  const studio = require('fs').readFileSync(require('path').join(__dirname, '..', 'creative.js'), 'utf8');
  assert.match(studio, /Make 3D from this picture — free/); assert.match(studio, /on\('cs3dFree', td3Free\)/, 'only on a click');
  assert.doesNotMatch(studio, /autoFree3D|td3Free\(\)\s*;\s*\}\s*\)\s*;?\s*$/m, 'never by itself');
});
