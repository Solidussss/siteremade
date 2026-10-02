'use strict';
// TRUE 3D, PHASE 1 (lib/three-d, lib/creative/three-d.js, CREATIVE_3D.md): image -> real 3D asset -> Blender -> stored ->
// shown by one fixed engine -> shipped inside the customer's own files. These tests hold its rules.
//
// REAL PROVIDER SPEND: $0. The only "provider" is the mock (a fixture file, no network); the whole file runs with the
// network switched OFF (below) and fails if anything tries to use it. Blender itself is free software: where it is
// installed the real program is tested; where it is not, those tests say so and skip, and a stand-in program
// (test/helpers/fake-blender.js) tests everything around it.
const net = [];
globalThis.fetch = (url) => { net.push(String((url && url.url) || url)); return Promise.reject(new Error('the network is off in this test')); };
const http = require('http'); const https = require('https');
const loopback = a => /^(https?:\/\/)?(127\.0\.0\.1|localhost|\[::1\])/.test(String(typeof a === 'string' ? a : (a && (a.href || a.hostname || a.host)) || ''));
[http, https].forEach(m => ['request', 'get'].forEach(k => { const real = m[k]; m[k] = function (...a) { if (!loopback(a[0])) net.push(String(typeof a[0] === 'string' ? a[0] : JSON.stringify(a[0]))); return real.apply(this, a); }; }));

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'sr-3d-test-'));
process.env.SITEREMADE_BACKEND = 'local'; process.env.SITEREMADE_ASSET_STORE_DIR = path.join(TMP, 'asset-store');
['CREATIVE_3D', 'THREE_D_PROVIDER', 'SITEREMADE_3D_PROVIDER_USD', 'SITEREMADE_3D_BLENDER_USD'].forEach(k => { delete process.env[k]; });

const TD = require('../lib/creative/three-d');
const POSE = require('../lib/creative/three-d-pose');
const threeD = require('../lib/three-d');
const { glb: GLB, blender: Blender, pipeline: Pipeline, provider: Provider, cost: Cost, createMockProvider } = threeD;
const PJ = require('../lib/premium-jobs');
const credits = require('../lib/credits');
const D2 = require('../lib/creative/director2');
const { validatePlan2 } = require('../lib/creative/validate2');
const { renderCreative2 } = require('../lib/creative/render2');
const { sanitizeCreative } = require('../lib/creative/store');
const projectStore = require('../lib/project-store');
const { compileExport } = require('../lib/export-compiler');
const { zipDirectory } = require('../lib/archive');
const { getAssetStore } = require('../lib/adapters/asset-store');
const { createLocalAssetStore } = require('../lib/adapters/local-asset-store');
const { resetSqliteAdapter } = require('../lib/adapters/sqlite-database-adapter');
const { readZip, extractZip } = require('./helpers/unzip');
const FX = require('./fixtures/three-d/make-fixture');

const FIX = path.join(__dirname, 'fixtures', 'three-d');
const RAW = fs.readFileSync(path.join(FIX, 'product-raw.glb'));
const NORMAL = fs.readFileSync(path.join(FIX, 'product-normalized.glb'));
const FAKE = path.join(__dirname, 'helpers', 'fake-blender.js');
// a stand-in program in Blender's place (it gets Blender's exact arguments): mode, and a log of how it was started
const standIn = (mode, log) => ({ command: { file: process.execPath, args: [FAKE, mode, log || ''] } });
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const near = (a, b, eps) => Math.abs(a - b) <= (eps || 1e-3);
let dbn = 0;
const newDb = () => resetSqliteAdapter(path.join(TMP, `db-${process.pid}-${dbn++}.db`));
const storeIn = db => (bytes, mime) => { const { hash, byteLength } = getAssetStore().put(bytes); db.assetBlobs.insertIfMissing({ hash, contentType: mime, byteLength, createdAt: new Date().toISOString() }); return hash; };
let realBlender = null;
const blender = async () => (realBlender || (realBlender = await Blender.detect()));

// ---------------------------------------------------------------- a Creative page with an uploaded product picture
const PHOTO = 'data:image/png;base64,' + FX.productPhoto(240, 300, false).toString('base64');
const CUT = 'data:image/png;base64,' + FX.productPhoto(240, 300, true).toString('base64');
const upload = extra => Object.assign({ id: 'u-bottle', origin: 'upload', title: 'Aurelia tonic', alt: 'A bottle of Aurelia tonic', mime: 'image/png', dataUrl: PHOTO,
  assess: { width: 1200, height: 1500, aspect: 0.8, orientation: 'portrait', subject: [0.15, 0.07, 0.85, 0.93], colours: ['#1a528c', '#d49e38'], luminance: 130, background: { colour: '#f1ece2', uniformity: 0.95, tolerance: 12 }, transparent: false, transparentShare: 0, megapixels: 1.8 },
  caps: { moveFreely: false, frame: true, backdrop: false, heroSize: true, lowRes: false }, curation: { role: 'subject', identity: 'exact', depicts: 'the bottle', issues: [], separable: true, quality: 3, framing: 'whole' } }, extra || {});
const cutout = () => ({ id: 'c-bottle', origin: 'derived', cutout: true, cutoutOf: 'u-bottle', title: 'Aurelia tonic', alt: 'A bottle of Aurelia tonic', mime: 'image/png', dataUrl: CUT, processing: 'background removed',
  assess: { width: 1200, height: 1500, aspect: 0.8, orientation: 'portrait', subject: [0.15, 0.07, 0.85, 0.93], colours: ['#1a528c'], luminance: 110, transparent: true, transparentShare: 0.5, megapixels: 1.8 }, caps: { moveFreely: true, frame: false, backdrop: false, heroSize: true, lowRes: false } });
const UND = { kind: 'invented', subject: 'Aurelia Tonic', brief: 'a launch page for Aurelia, a small-batch tonic in a blue glass bottle', tone: { register: 'cinematic' }, identity: { name: 'Aurelia Tonic', kind: 'invented', what: 'a small-batch tonic drink product in a blue glass bottle' } };
const ASSETS = [upload(), cutout()];
function pageFor(ctx) {
  const d = D2.direct({ understanding: UND, research: { page: null, facts: [] }, assets: ASSETS, supplied: { facts: ['Aurelia is bottled in small batches.'], memories: [] }, seed: '1', prefer: { family: 'object-story', mode: 'expressive' } });
  return Object.assign(validatePlan2(d.plan, Object.assign({ assets: ASSETS, facts: [], understanding: UND, page: null, art: d.recipe }, ctx || {})), { raw: d.plan, recipe: d.recipe });
}
const PLAN = pageFor().plan;
// the sections of this page that show the subject's picture (where a model may stand)
const SECTIONS = PLAN.scenes.filter((s, i) => i > 0 && s.layers.some(L => L.kind === 'image' && L.asset === 'c-bottle')).map(s => s.id);
// the stored model as the pipeline records it (from the committed, already-normalised fixture)
function modelRecord(extra) {
  const i = GLB.inspect(NORMAL).info;
  return Object.assign({ id: 'td-fixture', sourceAssetId: 'u-bottle', title: 'Aurelia tonic bottle', bytes: i.bytes, bounds: i.bounds, center: i.center, scale: 0.02451, triangles: i.triangles, textures: { count: i.textures.count, maxSize: i.textures.maxSize }, parts: i.parts, animations: [], normalized: true,
    provenance: { provider: 'mock', providerAssetId: 'mock3d_1', processor: 'blender 4.5.9', requestId: 'r1', at: '2026-10-01T00:00:00.000Z' }, dataUrl: 'data:model/gltf-binary;base64,' + NORMAL.toString('base64') }, extra || {});
}
const blockFor = scenes => ({ assets: [modelRecord()], scenes: scenes || [{ id: 'td-product', assetId: 'td-fixture', sectionId: SECTIONS[0], composition: 'scroll-rotate', turns: 1.5 }] });
function projectWith(threeDBlock, plan) {
  const direction = { mode: 'creative', meta: { id: 'c3d' }, pages: [{ id: 'creative', label: 'Creative page', sections: [] }],
    creative: Object.assign({ v: 1, brief: UND.brief, understanding: UND, supplied: { facts: ['Aurelia is bottled in small batches.'], memories: [] }, research: { status: 'none', page: null, facts: [] }, assets: ASSETS, plan: plan || PLAN, motion: { intensity: 'lively' }, cost: {} }, threeDBlock ? { threeD: threeDBlock } : {}) };
  return { directions: [direction], activeDirectionIndex: 0 };
}
function exported(db, state, name) {
  const check = projectStore.validateDirectionsState(state); assert.ok(check.valid, check.error);
  projectStore.internalizeAssets(db, check.normalized);
  const workDir = path.join(TMP, `export-${name}-${dbn++}`);
  const res = compileExport(db, { project: { id: `p-${name}`, revision: 1, directionsState: check.normalized }, directionIndex: 0, workDir });
  return { workDir, res, html: fs.readFileSync(path.join(workDir, 'index.html'), 'utf8'), state: check.normalized, files: fs.existsSync(path.join(workDir, 'assets')) ? fs.readdirSync(path.join(workDir, 'assets')) : [] };
}
const pageData = html => JSON.parse(html.match(/<script type="application\/json" id="cr-3d">([\s\S]*?)<\/script>/)[1]);

// ================================================================ B. BLENDER
test('1. the fixture GLB passes through the Blender processor: upright, centred, one size, textures within the limit, parts and materials kept -- and its temporary folder is gone', async (t) => {
  const b = await blender(); if (!b.available) return t.skip(`Blender is not installed here (${b.reason})`);
  const before = GLB.inspect(RAW).info;
  assert.equal(GLB.check(before, TD.LIMITS).code, 'texture_too_large', 'the provider\'s file may not ship as it is');
  assert.ok(before.size[2] > before.size[1] * 1.4 && Math.abs(before.center[0]) > 1 && before.size[2] > 30, 'it starts on its side, off centre and far too large');
  const tmpRoot = fs.mkdtempSync(path.join(TMP, 'blender-'));
  const out = await Blender.prepareAsset({ bytes: RAW, ext: '.glb', options: { upAxis: 'Z' } }, { tmpRoot });
  assert.equal(out.ok, true, JSON.stringify(out));
  const i = GLB.inspect(out.glb).info;
  assert.deepEqual(i.center.map(v => +v.toFixed(3)), [0, 0, 0], 'centred on the origin');
  assert.ok(near(Math.max(...i.size), 1, 2e-3), `its longest side is 1 unit (${i.size})`);
  assert.ok(i.size[1] > i.size[0] * 1.4 && i.size[1] > i.size[2] * 1.4, `upright: the bottle's height is on +Y (${i.size})`);
  assert.equal(i.textures.maxSize, TD.LIMITS.textureSize, 'the 4096 px texture was scaled to the limit'); assert.equal(i.textures.count, 1);
  assert.deepEqual(i.parts, ['Body', 'Cap', 'Label']); assert.equal(i.materials, 3); assert.equal(i.triangles, before.triangles, 'under the triangle target: geometry untouched');
  assert.deepEqual(i.external, []); assert.deepEqual(GLB.check(i, TD.LIMITS), { ok: true });
  assert.equal(out.report.static, true); assert.equal(out.report.applied_transforms, true); assert.ok(near(out.report.scale, 1 / before.size[2], 1e-4));
  assert.deepEqual(fs.readdirSync(tmpRoot), [], 'nothing is left behind');
  // the committed fixture IS this output (what the rest of this file -- and machines without Blender -- use)
  const committed = GLB.inspect(NORMAL).info; assert.deepEqual([committed.triangles, committed.parts, committed.size.map(v => +v.toFixed(3)), committed.textures.maxSize], [i.triangles, i.parts, i.size.map(v => +v.toFixed(3)), i.textures.maxSize]);
});

test('1b. geometry is reduced only where it is safe: a still model over the triangle target is decimated, part by part, and keeps its parts and texture coordinates', async (t) => {
  const b = await blender(); if (!b.available) return t.skip(`Blender is not installed here (${b.reason})`);
  const out = await Blender.prepareAsset({ bytes: RAW, ext: '.glb', options: { upAxis: 'Z', maxTriangles: 1200 } });
  assert.equal(out.ok, true, JSON.stringify(out)); assert.equal(out.report.decimated, true);
  const i = GLB.inspect(out.glb).info; assert.ok(i.triangles <= 1200 * 1.15 && i.triangles > 300, `${i.triangles} triangles`);
  assert.deepEqual(i.parts, ['Body', 'Cap', 'Label']); assert.equal(i.textures.count, 1); assert.ok(near(Math.max(...i.size), 1, 0.02));
});

test('2. a malformed asset fails safely: refused from its own bytes before Blender is ever started -- and what Blender itself cannot read comes back as a reason, not a crash', async (t) => {
  const log = path.join(TMP, 'malformed.log'); const deps = { blender: standIn('ok', log) };
  const give = (bytes, name) => Pipeline.normalise({ modelFile: { name: name || 'model.glb', bytes }, metadata: {} }, deps);
  const junk = await give(Buffer.from('<html>not a model</html>'.repeat(40))); assert.deepEqual([junk.ok, junk.stage, junk.code], [false, 'intake', 'not_glb']);
  const cut = await give(RAW.subarray(0, 4000)); assert.deepEqual([cut.ok, cut.stage, cut.code], [false, 'intake', 'truncated']);
  const empty = await give(Buffer.alloc(0)); assert.deepEqual([empty.ok, empty.stage], [false, 'intake']);
  const blend = await give(RAW, 'scene.blend'); assert.deepEqual([blend.stage, blend.code], ['intake', 'unsupported_format'], 'a file that could carry scripts is never handed to Blender');
  const gltf = await give(RAW, 'scene.gltf'); assert.equal(gltf.code, 'unsupported_format', 'nor one that can point at other files on the disk');
  // a model that points outside itself (a texture by address) is refused: a shipped model is one self-contained file
  const p = GLB.parts(RAW); p.json.images[0] = { uri: 'https://provider.example/tex.png' };
  let j = Buffer.from(JSON.stringify(p.json)); if (j.length % 4) j = Buffer.concat([j, Buffer.alloc(4 - (j.length % 4), 0x20)]);
  const head = Buffer.alloc(20); head.writeUInt32LE(0x46546c67, 0); head.writeUInt32LE(2, 4); head.writeUInt32LE(28 + j.length + p.bin.length, 8); head.writeUInt32LE(j.length, 12); head.writeUInt32LE(0x4e4f534a, 16);
  const bh = Buffer.alloc(8); bh.writeUInt32LE(p.bin.length, 0); bh.writeUInt32LE(0x004e4942, 4);
  const pointing = await give(Buffer.concat([head, j, bh, p.bin])); assert.deepEqual([pointing.stage, pointing.code], ['intake', 'external_resources']);
  assert.equal(fs.existsSync(log), false, 'Blender was not started for any of them');
  // a header that claims a size no file should be: bounded before it is written anywhere
  const big = await Blender.prepareAsset({ bytes: { length: TD.LIMITS.inputBytes + 1 }, ext: '.glb' }, standIn('ok', log)); assert.equal(big.ok, false);
  // what the processor refuses, or writes wrongly, is a structured answer too
  const refused = await give(RAW.subarray(0, RAW.length), 'model.glb').then(() => Pipeline.normalise({ modelFile: { name: 'model.glb', bytes: RAW } }, { blender: standIn('refuse') }));
  assert.deepEqual([refused.ok, refused.stage, refused.code, refused.retry], [false, 'blender', 'malformed', false]);
  const crashed = await Pipeline.normalise({ modelFile: { name: 'model.glb', bytes: RAW } }, { blender: standIn('crash') }); assert.deepEqual([crashed.stage, crashed.code], ['blender', 'blender_failed']);
  const garbage = await Pipeline.normalise({ modelFile: { name: 'model.glb', bytes: RAW } }, { blender: standIn('garbage') }); assert.deepEqual([garbage.stage, garbage.code], ['limits', 'not_glb'], 'what Blender wrote is measured from the file itself');
  // and the real Blender, given a model whose header is fine and whose content is not
  const b = await blender();
  if (b.available) {
    const broken = Buffer.from(RAW); broken.fill(0xff, RAW.length - 60000, RAW.length - 30000);
    const q = GLB.parts(RAW); q.json.accessors[0].bufferView = 999; let jj = Buffer.from(JSON.stringify(q.json)); if (jj.length % 4) jj = Buffer.concat([jj, Buffer.alloc(4 - (jj.length % 4), 0x20)]);
    const h2 = Buffer.alloc(20); h2.writeUInt32LE(0x46546c67, 0); h2.writeUInt32LE(2, 4); h2.writeUInt32LE(28 + jj.length + q.bin.length, 8); h2.writeUInt32LE(jj.length, 12); h2.writeUInt32LE(0x4e4f534a, 16);
    const real = await Blender.prepareAsset({ bytes: Buffer.concat([h2, jj, bh, q.bin]), ext: '.glb' });
    assert.equal(real.ok, false); assert.match(real.code, /^(malformed|blender_failed|blender_error|empty)$/); assert.ok(real.reason.length > 0 && real.reason.length <= 240);
  }
});

test('3. a timeout fails safely: a run past its time is killed, answered with one word, and its folder removed', async () => {
  const tmpRoot = fs.mkdtempSync(path.join(TMP, 'timeout-')); const t0 = Date.now();
  const out = await Blender.prepareAsset({ bytes: RAW, ext: '.glb' }, Object.assign({ timeoutMs: 1200, tmpRoot }, standIn('hang')));
  assert.deepEqual([out.ok, out.code], [false, 'timeout']); assert.match(out.reason, /did not finish within 1 seconds/);
  assert.ok(Date.now() - t0 < 12000, 'it came back promptly');
  await new Promise(r => setTimeout(r, 400)); assert.deepEqual(fs.readdirSync(tmpRoot), [], 'the job folder is gone');
  const piped = await Pipeline.normalise({ modelFile: { name: 'model.glb', bytes: RAW } }, { blender: Object.assign({ timeoutMs: 1000 }, standIn('hang')) });
  assert.deepEqual([piped.stage, piped.code, piped.retry], ['blender', 'timeout', true], 'worth another try later: the model still exists at the provider');
});

test('4. no Blender installed: a clear, structured "unavailable" with its reason -- never a crash, never a silent skip', async () => {
  const none = await Blender.detect({ paths: [] });
  assert.deepEqual([none.available, none.path, none.version], [false, '', '']); assert.match(none.reason, /Blender is not installed on this server \(set BLENDER_PATH/);
  const wrong = await Blender.detect({ paths: [path.join(TMP, 'no-such', 'blender.exe')] }); assert.equal(wrong.available, false);
  // (something at that path that is not Blender: it starts, says nothing useful, and is not believed)
  const notBlender = await Blender.detect({ paths: [process.execPath] }); assert.equal(notBlender.available, false); assert.match(notBlender.reason, /did not start/);
  const out = await Blender.prepareAsset({ bytes: RAW, ext: '.glb' }, { paths: [] });
  assert.deepEqual([out.ok, out.code], [false, 'blender_unavailable']); assert.match(out.reason, /not installed/);
  const piped = await Pipeline.normalise({ modelFile: { name: 'model.glb', bytes: RAW } }, { blender: { paths: [] } });
  assert.deepEqual([piped.ok, piped.stage, piped.code, piped.retry], [false, 'blender', 'blender_unavailable', true]);
  // the operator's setting is an absolute path to the program; BLENDER_PATH is looked at first
  assert.equal(Blender.candidates({ BLENDER_PATH: '/opt/b/blender', PATH: '' })[0].from, 'BLENDER_PATH');
});

test('G. Blender is started with a FIXED command: no provider or customer text in it, a private folder, and an environment with no SiteRemade secret', async () => {
  const log = path.join(TMP, 'command.log');
  process.env.HIGGSFIELD_API_KEY = 'kid:secret-should-never-reach-blender'; process.env.ANTHROPIC_API_KEY = 'sk-ant-nope'; process.env.SITEREMADE_BILLING_SECRET = 'nope';
  try {
    const out = await Pipeline.normalise({ modelFile: { name: 'model.glb', bytes: RAW }, metadata: { upAxis: 'Z; rm -rf /', yawDeg: 9e9, evil: '$(curl x)' }, provider: 'mock', providerAssetId: 'a"; --python evil.py' }, { blender: standIn('ok', log) });
    assert.equal(out.ok, true, JSON.stringify(out));
    const run = JSON.parse(fs.readFileSync(log, 'utf8').trim().split('\n').pop());
    assert.deepEqual(run.args.slice(0, 6), ['--background', '--factory-startup', '--disable-autoexec', '-noaudio', '--python-exit-code', '1']);
    assert.deepEqual(run.args.slice(-4, -1), ['--python', Blender.SCRIPT, '--']); assert.equal(run.args.length, 10, 'nothing else');
    assert.match(path.basename(run.jobFile), /^job\.json$/); assert.match(path.basename(path.dirname(run.jobFile)), /^sr-3d-/); assert.equal(path.resolve(run.cwd), path.dirname(run.jobFile));
    assert.ok(!run.env.some(k => /KEY|SECRET|TOKEN|PASSWORD|STRIPE|SUPABASE|ANTHROPIC|HIGGSFIELD|OPENAI|SERPAPI/i.test(k)), run.env.join());
    assert.equal(fs.existsSync(path.dirname(run.jobFile)), false, 'the folder is gone');
    // the options Blender is given are enums and clamped numbers, whatever a provider said about its file
    assert.deepEqual(Pipeline.hints({ upAxis: 'Z; rm -rf /', yawDeg: 9e9 }), { upAxis: 'Y', yawDeg: 360 });
    assert.deepEqual(Blender.cleanOptions({ upAxis: '../../x', origin: 'anywhere', targetSize: -5, maxTriangles: 'lots', yawDeg: NaN, extra: 'x' }), { target_size: 0.05, max_triangles: TD.LIMITS.trianglesTarget, max_texture: TD.LIMITS.textureSize, origin: 'center', up_axis: 'Y', yaw_deg: 0, apply_transforms: true });
    assert.equal(out.asset.provenance.providerAssetId, 'a--pythonevil.py', 'provenance is words, cleaned');
  } finally { delete process.env.HIGGSFIELD_API_KEY; delete process.env.ANTHROPIC_API_KEY; delete process.env.SITEREMADE_BILLING_SECRET; }
  const src = fs.readFileSync(path.join(ROOT, 'lib', 'three-d', 'blender.js'), 'utf8');
  assert.match(src, /const \{ spawn \} = require\('child_process'\);/, 'spawn is the only way it starts a program'); assert.doesNotMatch(src, /shell:\s*true|execSync|execFile|spawnSync/, 'never through a shell'); assert.equal((src.match(/spawn\(/g) || []).length, (src.match(/shell: false/g) || []).length, 'every spawn says shell: false');
  const py = fs.readFileSync(Blender.SCRIPT, 'utf8'); assert.match(py, /use_scripts_auto_execute = False/); assert.doesNotMatch(py, /\beval\(|\bexec\(|os\.system|subprocess|urllib|requests|socket/, 'the script runs nothing and talks to no one');
});

test('13. unsafe provider paths cannot escape the temporary directory', async (t) => {
  const dir = fs.mkdtempSync(path.join(TMP, 'stage-')); const inner = path.join(dir, 'job'); fs.mkdirSync(inner);
  const bad = ['../evil.png', '..\\evil.png', '/etc/passwd', 'C:\\Windows\\win.ini', 'sub/tex.png', 'sub\\tex.png', 'tex.png\u0000.exe', '.hidden.png', '..', 'tex..png', 'con:tex.png', 'scene.blend', 'run.py', 'tex.png/', ''];
  bad.forEach(name => { const r = Blender.stageFiles(inner, [{ name: 'ok.png', bytes: Buffer.from('a') }, { name, bytes: Buffer.from('b') }]); assert.deepEqual([r.ok, r.code], [false, name === 'scene.blend' || name === 'run.py' || name === '' ? 'unsafe_path' : 'unsafe_path'], JSON.stringify(name)); });
  assert.deepEqual(fs.readdirSync(inner), [], 'a refused set writes nothing at all -- not even its acceptable files'); assert.deepEqual(fs.readdirSync(dir), ['job'], 'and nothing beside the folder');
  const ok = Blender.stageFiles(inner, [{ name: 'base colour.png', bytes: Buffer.from('a') }, { name: 'normal_map.jpg', bytes: Buffer.from('b') }]);
  assert.equal(ok.ok, true); ok.paths.forEach(p => assert.equal(path.dirname(p), path.resolve(inner)));
  assert.equal(Blender.stageFiles(inner, [{ name: 'BASE COLOUR.PNG', bytes: Buffer.from('c') }, { name: 'base colour.png', bytes: Buffer.from('d') }]).ok, false, 'one name, once');
  // the pipeline: a provider's own file name that reaches outside refuses the delivery before anything is written or run
  const log = path.join(TMP, 'unsafe.log');
  for (const name of ['../../model.glb', 'C:\\Users\\x\\model.glb', '/tmp/model.glb', '.model.glb']) {
    const r = await Pipeline.normalise({ modelFile: { name, bytes: RAW } }, { blender: standIn('ok', log) }); assert.deepEqual([r.ok, r.stage, r.code], [false, 'intake', 'unsafe_path'], name);
  }
  const side = await Pipeline.normalise({ modelFile: { name: 'model.glb', bytes: RAW }, textures: [{ name: '../../../tex.png', bytes: Buffer.from('x') }] }, { blender: standIn('ok', log) }); assert.equal(side.code, 'unsafe_path');
  assert.equal(fs.existsSync(log), false, 'Blender was not started');
  // a processor that tries to write outside its folder gains nothing: only the fixed output file inside the folder is read
  const parent = fs.mkdtempSync(path.join(TMP, 'escape-'));
  const esc = await Blender.prepareAsset({ bytes: RAW, ext: '.glb' }, Object.assign({ tmpRoot: parent }, standIn('escape'))); assert.deepEqual([esc.ok, esc.code], [false, 'blender_failed']);
  // and the real script refuses a job that points outside its own folder
  const b = await blender(); if (!b.available) return t.diagnostic(`(the script's own path check was not run: ${b.reason})`);
  const job = fs.mkdtempSync(path.join(TMP, 'job-')); fs.writeFileSync(path.join(job, 'input.glb'), RAW); const outside = path.join(TMP, 'outside.glb');
  fs.writeFileSync(path.join(job, 'job.json'), JSON.stringify({ input: path.join(job, 'input.glb'), output: outside, options: {} }));
  await new Promise(res => require('child_process').spawn(b.path, ['--background', '--factory-startup', '--disable-autoexec', '--python-exit-code', '1', '--python', Blender.SCRIPT, '--', path.join(job, 'job.json')], { shell: false, windowsHide: true, stdio: 'ignore' }).on('close', res));
  assert.equal(JSON.parse(fs.readFileSync(path.join(job, 'report.json'), 'utf8')).code, 'unsafe_path'); assert.equal(fs.existsSync(outside), false);
});

// ================================================================ A. SOURCE + the pipeline + storage
test('5. the normalised GLB is stored durably: content-addressed, with its type, readable again by a fresh store -- and the same model twice is one stored file', async () => {
  const db = newDb(); const provider = createMockProvider({ polls: 1 });
  const run = () => Pipeline.run({ provider, sourceImage: Buffer.from('the owner\'s upload'), sourceAssetId: 'u-bottle', prompt: 'a tonic bottle', mode: 'product', requestId: 'gen-1', title: 'Aurelia tonic bottle' }, { store: storeIn(db), blender: standIn('ok'), provider: { pollMs: 5 } });
  const a = await run(); assert.equal(a.ok, true, JSON.stringify(a));
  assert.match(a.asset.assetRef, /^[a-f0-9]{64}$/); assert.equal(a.asset.assetRef, sha(NORMAL), 'the reference IS the hash of the bytes');
  const fresh = createLocalAssetStore(process.env.SITEREMADE_ASSET_STORE_DIR); assert.ok(fresh.get(a.asset.assetRef).equals(NORMAL), 'a restarted server reads the same bytes');
  assert.deepEqual([db.assetBlobs.find(a.asset.assetRef).content_type, db.assetBlobs.find(a.asset.assetRef).byte_length], ['model/gltf-binary', NORMAL.length]);
  // the record: what the page needs, measured from the file -- and it passes the project's own validator unchanged
  assert.deepEqual([a.asset.format, a.asset.sourceAssetId, a.asset.normalized, a.asset.triangles, a.asset.parts, a.asset.textures.maxSize], ['glb', 'u-bottle', true, 4224, ['Body', 'Cap', 'Label'], 2048]);
  assert.deepEqual(a.asset.center, [0, 0, 0]); assert.ok(near(a.asset.bounds.max[1] - a.asset.bounds.min[1], 1, 2e-3));
  assert.deepEqual([a.asset.provenance.provider, a.asset.provenance.providerAssetId, a.asset.provenance.requestId], ['mock', 'mock3d_1', 'gen-1']); assert.match(a.asset.provenance.processor, /^blender /);
  assert.deepEqual(TD.cleanAsset(a.asset), a.asset);
  assert.doesNotMatch(JSON.stringify(a.asset), /https?:|mock3d:\/\/|\\\\|[A-Z]:\\|\/tmp|secret|key/i, 'no provider address, no path, no credential in the record');
  // idempotent: the same request again is the same provider request and the same stored file
  const b = await run(); assert.equal(b.asset.id, a.asset.id); assert.equal(b.asset.assetRef, a.asset.assetRef);
  assert.deepEqual([provider.log.submits, provider.log.generations], [2, 1], 'a retry with the same request id is not a second generation');
  assert.equal(fs.readdirSync(process.env.SITEREMADE_ASSET_STORE_DIR).filter(f => f === a.asset.assetRef).length, 1);
  // a failed pipeline stores nothing
  const before = fs.readdirSync(process.env.SITEREMADE_ASSET_STORE_DIR).length;
  const over = await Pipeline.run({ provider: createMockProvider({ polls: 0 }), sourceAssetId: 'u-bottle', requestId: 'gen-2' }, { store: storeIn(db), blender: standIn('oversize'), provider: { pollMs: 5 } });
  assert.deepEqual([over.ok, over.stage, over.code], [false, 'limits', 'texture_too_large'], 'a model over the budget is never stored');
  const failed = await Pipeline.run({ provider: createMockProvider({ outcome: 'failed', polls: 0 }), requestId: 'gen-3' }, { store: storeIn(db), blender: standIn('ok'), provider: { pollMs: 5 } }); assert.deepEqual([failed.stage, failed.code], ['provider', 'provider_failed']);
  assert.equal(fs.readdirSync(process.env.SITEREMADE_ASSET_STORE_DIR).length, before);
});

test('A. the provider is an adapter behind one interface -- and phase 1 has no real one: nothing is configured by default, and the mock is the only adapter', () => {
  assert.deepEqual(Provider.names(), [], 'no adapter is registered on its own');
  assert.deepEqual([Provider.selected({}).ok, Provider.selected({}).reason], [false, 'provider_unavailable']); assert.equal(Provider.selected({ THREE_D_PROVIDER: 'meshy' }).ok, false);
  assert.throws(() => Provider.register({ name: 'half', submit() {} }), /missing status/); assert.throws(() => Provider.register({ name: 'Bad Name!' }), /plain name/);
  const mock = Provider.register(createMockProvider());
  try { assert.equal(Provider.selected({ THREE_D_PROVIDER: 'mock' }).adapter, mock); } finally { Provider.unregister('mock'); }
  // no file in lib/three-d names a provider address or reads a provider key
  fs.readdirSync(path.join(ROOT, 'lib', 'three-d')).filter(f => f.endsWith('.js')).forEach(f => { const s = fs.readFileSync(path.join(ROOT, 'lib', 'three-d', f), 'utf8'); assert.doesNotMatch(s, /https?:\/\/(?!threejs\.org)[a-z0-9.-]+\.[a-z]{2,}/i, f); assert.doesNotMatch(s, /_API_KEY|Authorization|Bearer /, f); });
});

// ================================================================ C. DATA MODEL
test('C. the 3D block is bounded data: a strict vocabulary, clamped numbers, known ids -- and nothing executable survives it', () => {
  const b = TD.normalise({ assets: [modelRecord(), modelRecord({ id: 'td-fixture' }), modelRecord({ id: 'evil<script>' }), { id: 'td-nobytes' }, modelRecord({ id: 'td-fat', triangles: TD.LIMITS.triangles + 1 }), modelRecord({ id: 'td-obj', format: 'obj' })],
    scenes: [
      { id: 'a', assetId: 'td-fixture', sectionId: SECTIONS[0], composition: 'hologram-explosion', interaction: 'eval(alert(1))', camera: { fov: 999, azimuth: -9999, elevation: 'up', distance: 0, script: 'x' }, lighting: 'lasers', background: 'url(javascript:1)', turns: 99, phone: 'always', code: 'while(1){}', onload: 'steal()' },
      { id: 'b', assetId: 'td-fixture', sectionId: SECTIONS[0] }, { id: 'c', assetId: 'td-missing', sectionId: SECTIONS[1] }, { id: 'd', assetId: 'td-fixture', sectionId: 'not-a-section' }, { id: 'e', assetId: 'td-fixture', sectionId: SECTIONS[1], composition: 'orbit-product' },
    ] }, { sectionIds: PLAN.scenes.map(s => s.id) });
  assert.deepEqual(b.assets.map(a => a.id), ['td-fixture'], 'one of each id; no bytes, over budget or another format: not kept');
  assert.deepEqual(b.scenes.map(s => s.id), ['a', 'e'], 'one stage per section; unknown models and sections dropped');
  const s = b.scenes[0];
  assert.deepEqual(Object.keys(s).sort(), ['assetId', 'background', 'camera', 'composition', 'id', 'interaction', 'lighting', 'phone', 'sectionId', 'turns'], 'only the known fields');
  assert.deepEqual([s.composition, s.interaction, s.lighting, s.background, s.phone, s.turns], ['scroll-rotate', 'scroll-rotate', 'studio', 'transparent', 'lite', 4]);
  assert.deepEqual(s.camera, { fov: 60, azimuth: -180, elevation: 8, distance: 0.6 });
  assert.deepEqual([b.scenes[1].composition, b.scenes[1].interaction], ['orbit-product', 'scroll-orbit'], 'a composition brings its own interaction');
  assert.doesNotMatch(JSON.stringify(b.scenes), /eval|alert|javascript|while|steal|script/);
  // the vocabulary the brief asks for, exactly
  assert.deepEqual(TD.COMPOSITION_NAMES, ['scroll-rotate', 'orbit-product', 'floating-object', 'camera-pass', 'hero-sculpture', 'object-reveal']);
  assert.deepEqual(TD.INTERACTIONS, ['none', 'scroll-rotate', 'scroll-orbit', 'pointer-tilt', 'click-rotate']);
  // nothing 3D in it: no block at all (the project saves as it did before 3D existed)
  assert.equal(TD.normalise({ assets: [], scenes: [{ id: 'a' }] }), null); assert.equal(TD.normalise(null), null); assert.equal(TD.normalise('x'), null);
  assert.equal(TD.normalise({ assets: Array.from({ length: 9 }, (_, i) => modelRecord({ id: `td-${i}` })) }).assets.length, TD.LIMITS.assets);
  // a model's bytes: a GLB data URL within the budget, or a stored reference -- nothing else
  assert.equal(TD.cleanAsset(modelRecord({ dataUrl: 'data:text/html;base64,AAAA' })), null); assert.equal(TD.cleanAsset(modelRecord({ dataUrl: undefined, assetRef: '../../etc/passwd' })), null);
  assert.ok(TD.cleanAsset(modelRecord({ dataUrl: undefined, assetRef: 'a'.repeat(64) })));
});

test('D. the motion is one pure function of scroll, pointer and clicks: scroll turns the model, the camera stays in bounds, nothing moves without input', () => {
  const s = TD.normalise(blockFor([{ assetId: 'td-fixture', sectionId: SECTIONS[0], composition: 'scroll-rotate', turns: 1 }]), { sectionIds: PLAN.scenes.map(x => x.id) }).scenes[0];
  const at = (p, anchor) => POSE.pose(s, { p, anchor });
  assert.ok(near(at(0, 0).rotY, 0) && near(at(0.5, 0).rotY, Math.PI) && near(at(1, 0).rotY, Math.PI * 2), 'a pinned scene turns once through its hold');
  assert.ok(near(at(0.5, 0.5).rotY, 0) && near(at(0, 0.5).rotY, -Math.PI) && near(at(1, 0.5).rotY, Math.PI), 'a scene that scrolls by faces front when it is centred');
  assert.ok(at(0.3, 0).rotY > at(0.2, 0).rotY && near(at(7, 0).rotY, at(1, 0).rotY) && near(at(-3, 0).rotY, 0), 'monotonic, and clamped to the scene');
  assert.deepEqual(POSE.pose(s, { p: 0.4, anchor: 0, px: 1, py: 1, clicks: 5 }).azimuth, 0, 'scroll-rotate leaves the camera where it is');
  const orbit = POSE.pose({ composition: 'orbit-product' }, { p: 1, anchor: 0 }); assert.ok(near(orbit.azimuth, -25 + 0.75 * 360) && orbit.rotY === 0, 'scroll-orbit moves the camera instead');
  const tilt = POSE.pose({ composition: 'hero-sculpture' }, { px: 9, py: -9 }); assert.ok(near(tilt.rotY, POSE.TILT.y) && near(tilt.rotX, -POSE.TILT.x), 'pointer tilt is small and clamped');
  assert.ok(near(POSE.pose({ composition: 'scroll-rotate', interaction: 'click-rotate' }, { clicks: 3 }).rotY, 3 * Math.PI / 2));
  assert.deepEqual(POSE.pose({ composition: 'scroll-rotate', interaction: 'none' }, { p: 0.7, px: 1, clicks: 4 }).rotY, 0);
  const reveal = c => POSE.pose({ composition: 'object-reveal' }, { p: c, anchor: 0 }); assert.ok(reveal(0).opacity === 0 && reveal(0.35).opacity === 1 && reveal(0).scale < reveal(1).scale);
  // an unknown composition or interaction is the demo composition, never an error
  assert.deepEqual(POSE.pose({ composition: 'nope', interaction: 'nope' }, { p: 0.5 }), POSE.pose({ composition: 'scroll-rotate' }, { p: 0.5 }));
});

test('6. project save / reopen preserves the 3D metadata: the model is stored once as a reference, comes back with its bytes, and saves again unchanged', () => {
  const db = newDb(); db.accounts.insert({ id: 'acct_3d', email: 't@example.com', passwordHash: 'x', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
  const want = TD.normalise(blockFor(), { sectionIds: PLAN.scenes.map(s => s.id) });
  const made = projectStore.createProject(db, 'acct_3d', { name: '3D page', directionsState: projectWith(blockFor()) }); assert.equal(made.ok, true, made.error);
  const raw = projectStore.getOwnedProjectRaw(db, 'acct_3d', made.project.id).directionsState.directions[0].creative;
  const meta = b => Object.assign({}, b, { assets: b.assets.map(a => { const o = Object.assign({}, a); delete o.dataUrl; delete o.assetRef; return o; }) });
  assert.equal(raw.threeD.assets[0].dataUrl, undefined, 'the project row holds no model bytes'); assert.equal(raw.threeD.assets[0].assetRef, sha(NORMAL));
  assert.deepEqual(meta(raw.threeD), meta(want), 'saved as validated');
  const open = projectStore.getOwnedProject(db, 'acct_3d', made.project.id); const c = open.directionsState.directions[0].creative;
  assert.ok(Buffer.from(c.threeD.assets[0].dataUrl.split(',')[1], 'base64').equals(NORMAL), 'reopened with the same bytes'); assert.deepEqual(meta(c.threeD), meta(want));
  assert.deepEqual(c.threeD.scenes[0], { id: 'td-product', assetId: 'td-fixture', sectionId: SECTIONS[0], composition: 'scroll-rotate', interaction: 'scroll-rotate', camera: { fov: 32, azimuth: 0, elevation: 8, distance: 1 }, lighting: 'studio', background: 'transparent', turns: 1.5, phone: 'lite' });
  const again = projectStore.updateOwnedProject(db, 'acct_3d', made.project.id, { directionsState: open.directionsState, expectedRevision: open.revision }); assert.equal(again.ok, true, again.reason);
  assert.equal(JSON.stringify(projectStore.getOwnedProjectRaw(db, 'acct_3d', made.project.id).directionsState.directions[0].creative.threeD), JSON.stringify(raw.threeD), 'a second save changes nothing');
  assert.equal(fs.readdirSync(process.env.SITEREMADE_ASSET_STORE_DIR).filter(f => f === sha(NORMAL)).length, 1);
  // sanitising twice is the identity (what is saved is what reopens), and the plan's intent survives too
  const planned = pageFor({ premium3D: { allow: true, mainAsset: 'u-bottle' } }).plan;
  const once = sanitizeCreative({ understanding: UND, assets: ASSETS.map(a => Object.assign({}, a, { dataUrl: undefined, assetRef: 'a'.repeat(64) })), plan: planned, threeD: { assets: [modelRecord({ dataUrl: undefined, assetRef: 'b'.repeat(64) })], scenes: blockFor().scenes } });
  assert.equal(JSON.stringify(sanitizeCreative(JSON.parse(JSON.stringify(once)))), JSON.stringify(once)); assert.deepEqual(once.plan.premium3D, { planned: true, reason: 'planned', sourceAssetId: 'u-bottle', composition: 'scroll-rotate' });
  // a section that is no longer on the page takes its scene with it -- the model stays in the project
  const moved = sanitizeCreative({ understanding: UND, assets: ASSETS, plan: PLAN, threeD: blockFor([{ assetId: 'td-fixture', sectionId: 'gone' }]) }); assert.deepEqual([moved.threeD.assets.length, moved.threeD.scenes.length], [1, 0]);
});

// ================================================================ E. EXPORT
test('7. the exported ZIP includes the 3D asset: the stored GLB itself, the engine, its licence -- read back from the ZIP', () => {
  const db = newDb(); const x = exported(db, projectWith(blockFor()), 'zip');
  const zip = zipDirectory(x.workDir, path.join(TMP, 'site.zip')); const entries = readZip(fs.readFileSync(zip.path)); const names = entries.map(e => e.name);
  const glbs = entries.filter(e => e.name.endsWith('.glb')); assert.equal(glbs.length, 1); assert.equal(glbs[0].name, `assets/${sha(NORMAL)}.glb`);
  assert.ok(glbs[0].data.equals(NORMAL), 'the model in the ZIP is the stored, normalised model, byte for byte'); assert.deepEqual(GLB.check(GLB.inspect(glbs[0].data).info, TD.LIMITS), { ok: true });
  const eng = threeD.engine(); assert.ok(eng, 'the engine is built');
  assert.ok(entries.find(e => e.name === 'assets/sr3d.min.js').data.equals(fs.readFileSync(eng.path))); assert.ok(names.includes('assets/sr3d.LICENSE.txt')); assert.match(entries.find(e => e.name === 'assets/sr3d.LICENSE.txt').data.toString(), /MIT License[\s\S]*three\.js authors/);
  // textures travel inside the GLB (one self-contained file): nothing else to ship, nothing to fetch
  assert.deepEqual(GLB.inspect(glbs[0].data).info.external, []); assert.equal(GLB.inspect(glbs[0].data).info.textures.count, 1);
  assert.ok(names.includes('index.html') && names.includes('README.md') && names.includes('export-manifest.json'));
  const m = x.res.manifest; assert.deepEqual([m.threeD.shipped, m.threeD.engine.path, m.threeD.engine.three, m.threeD.models.length, m.threeD.models[0].path, m.threeD.leftOut], [true, 'assets/sr3d.min.js', eng.three, 1, glbs[0].name, []]);
  assert.ok(m.assets.some(a => a.contentType === 'model/gltf-binary' && a.path === glbs[0].name) && m.assets.some(a => a.path === 'assets/sr3d.min.js' && a.hash === eng.sha256));
  assert.match(fs.readFileSync(path.join(x.workDir, 'README.md'), 'utf8'), /## The 3D model[\s\S]*nothing is loaded from SiteRemade or any other server/);
  assert.ok(zip.zipBytes < 2 * 1024 * 1024, `the whole website with its 3D is ${zip.zipBytes} bytes zipped`);
});

test('8. the exported website works without SiteRemade: served by a bare static server, every file it names is its own, and its scripts name no other address', async () => {
  const db = newDb(); const x = exported(db, projectWith(blockFor()), 'standalone');
  const zip = zipDirectory(x.workDir, path.join(TMP, 'standalone.zip')); const site = path.join(TMP, 'standalone-site'); extractZip(fs.readFileSync(zip.path), site);
  const srv = http.createServer((req, res) => { const f = path.resolve(site, '.' + (req.url === '/' ? '/index.html' : decodeURIComponent(req.url.split('?')[0]))); if (!f.startsWith(site) || !fs.existsSync(f)) { res.writeHead(404); res.end(); return; } res.writeHead(200); fs.createReadStream(f).pipe(res); });
  await new Promise(r => srv.listen(0, '127.0.0.1', r)); const base = `http://127.0.0.1:${srv.address().port}/`;
  const get = u => new Promise((resolve, reject) => http.get(base + u, r => { const c = []; r.on('data', d => c.push(d)); r.on('end', () => resolve({ status: r.statusCode, body: Buffer.concat(c) })); }).on('error', reject));
  try {
    const page = await get(''); assert.equal(page.status, 200); const html = page.body.toString('utf8'); const data = pageData(html);
    assert.equal(data.runtime, 'assets/sr3d.min.js'); assert.equal(data.scenes.length, 1); assert.match(data.scenes[0].model, /^assets\/[a-f0-9]{64}\.glb$/);
    const eng = await get(data.runtime); assert.equal(eng.status, 200); assert.equal(sha(eng.body), threeD.engine().sha256);
    const model = await get(data.scenes[0].model); assert.equal(model.status, 200); assert.ok(model.body.equals(NORMAL));
    // every src / href / url the page names is a file of this folder
    const refs = [...html.matchAll(/(?:src|href|poster)="([^"#]+)"/g)].map(m => m[1]).filter(u => !/^(https?:)?\/\/|^mailto:/.test(u));
    assert.ok(refs.length > 0); for (const u of refs) assert.equal((await get(u)).status, 200, u);
    // no address of SiteRemade, a provider, a CDN, a temporary or signed link -- anywhere in the page's scripts and 3D data
    const scripts = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]).join('\n');
    assert.doesNotMatch(scripts.split('http://www.w3.org/2000/svg').join(''), /https?:\/\//, 'no absolute address in any script');
    assert.doesNotMatch(html, /siteremade\.com|railway\.app|\/api\/|\/vendor\/|mock3d:|X-Amz-|[?&](token|signature|expires)=|blob:/i);
    assert.doesNotMatch(html, /<script[^>]+src=/i, 'the engine is not a script tag: the page works before (and without) it');
    // the engine itself asks for nothing but the model it is given
    const engine = eng.body.toString('utf8'); assert.doesNotMatch(engine, /siteremade\.com|unpkg|jsdelivr|cdnjs|googleapis|gstatic|railway/i);
    assert.deepEqual([...new Set(engine.match(/https?:\/\/[^"'`\s)\\]*/g) || [])].sort(), ['http://www.w3.org/1999/xhtml', 'https://jcgt.org/published/0007/04/01/'], 'the only addresses in it: an XML namespace and a paper cited in a shader comment -- neither is ever requested'); assert.match(engine, /^\/\*! SiteRemade 3D engine\. Includes three\.js r\d+ -- MIT License/);
    // and the loader, run as a browser would run it, fetches exactly the site's own engine and hands it the site's own model
    const p = browser({ data }); p.near(0); assert.deepEqual(p.scripts.map(s => s.src), ['assets/sr3d.min.js']); p.engineLoaded(); assert.equal(p.mounts[0].cfg.model, data.scenes[0].model);
  } finally { srv.close(); }
});

test('9. a page with no 3D ships no 3D runtime: not a byte of it in the page, no engine file, no model -- and it renders exactly as it did before 3D existed', () => {
  const db = newDb(); const flat = exported(db, projectWith(null), 'flat');
  assert.doesNotMatch(flat.html, /cr-3d|td-stage|td-canvas|td-poster|sr3d|SiteRemade3D|__sr3d|data-3d/); assert.ok(!flat.files.some(f => /sr3d|\.glb$/.test(f)), flat.files.join());
  assert.equal(flat.res.manifest.threeD, undefined); assert.doesNotMatch(fs.readFileSync(path.join(flat.workDir, 'README.md'), 'utf8'), /3D/);
  // the renderer: without a 3D block its output is byte for byte what it is with no mention of 3D at all
  const src = a => `${a.id}.png`; const plain = renderCreative2(PLAN, ASSETS, { mode: 'export', src });
  assert.equal(renderCreative2(PLAN, ASSETS, { mode: 'export', src, threeD: undefined }), plain); assert.equal(renderCreative2(PLAN, ASSETS, { mode: 'export', src, threeD: null }), plain);
  assert.equal(renderCreative2(PLAN, ASSETS, { mode: 'export', src, threeD: { v: 1, assets: [], scenes: [] } }), plain, 'an empty block adds nothing');
  assert.equal(renderCreative2(PLAN, ASSETS, { mode: 'export', src, threeD: TD.normalise(blockFor([]), {}) }), plain, 'a model with no scene adds nothing');
  // and the same project WITH 3D differs only by what 3D adds
  const with3d = exported(db, projectWith(blockFor()), 'with'); assert.ok(with3d.html.length - flat.html.length < 12000, `3D adds ${with3d.html.length - flat.html.length} bytes to the page itself`);
  assert.deepEqual(with3d.files.filter(f => !flat.files.includes(f)).sort(), [`${sha(NORMAL)}.glb`, 'sr3d.LICENSE.txt', 'sr3d.min.js']);
  // a 3D project exported on a server whose engine was never built ships the flat page, and says so -- never a page waiting for a missing file
  const vendor = path.join(ROOT, 'vendor', 'three-d', 'manifest.json'); const hidden = vendor + '.hidden'; fs.renameSync(vendor, hidden);
  try { const none = exported(db, projectWith(blockFor()), 'noengine'); assert.doesNotMatch(none.html, /cr-3d|td-stage/); assert.deepEqual([none.res.manifest.threeD.shipped, none.res.manifest.threeD.leftOut[0].reason], [false, 'the 3D engine is not built on this server']); }
  finally { fs.renameSync(hidden, vendor); }
});

test('12. several 3D scenes reference one asset without duplicating the file: one GLB in the export, one in the store, one fetch in the browser', () => {
  assert.ok(SECTIONS.length >= 2, 'the page has two sections that show the subject');
  const db = newDb(); const two = [{ id: 'td-a', assetId: 'td-fixture', sectionId: SECTIONS[0], composition: 'scroll-rotate' }, { id: 'td-b', assetId: 'td-fixture', sectionId: SECTIONS[1], composition: 'orbit-product' }];
  const x = exported(db, projectWith(blockFor(two)), 'two'); const data = pageData(x.html);
  assert.equal(data.scenes.length, 2); assert.equal(data.scenes[0].model, data.scenes[1].model); assert.deepEqual(data.scenes.map(s => s.composition), ['scroll-rotate', 'orbit-product']);
  assert.equal((x.html.match(/class="td-stage"/g) || []).length, 2);
  assert.deepEqual(x.files.filter(f => f.endsWith('.glb')), [`${sha(NORMAL)}.glb`]); assert.equal(x.res.manifest.assets.filter(a => a.contentType === 'model/gltf-binary').length, 1); assert.equal(x.res.manifest.threeD.models.length, 1);
  assert.equal(fs.readdirSync(process.env.SITEREMADE_ASSET_STORE_DIR).filter(f => f === sha(NORMAL)).length, 1); assert.equal(x.state.directions[0].creative.threeD.assets.length, 1);
  // two model records with the same bytes are still one file
  const twin = exported(db, projectWith({ assets: [modelRecord(), modelRecord({ id: 'td-twin' })], scenes: [two[0], Object.assign({}, two[1], { assetId: 'td-twin' })] }), 'twin'); assert.deepEqual(twin.files.filter(f => f.endsWith('.glb')), [`${sha(NORMAL)}.glb`]);
  // in the browser: one engine request for both stages (and the engine fetches a model once per address: runtime-src.js file())
  const p = browser({ data }); p.near(0); p.near(1); assert.equal(p.scripts.length, 1); p.engineLoaded(); assert.equal(p.mounts.length, 2);
  assert.match(fs.readFileSync(path.join(ROOT, 'lib', 'three-d', 'runtime-src.js'), 'utf8'), /const files = new Map\(\);[\s\S]*if \(!files\.has\(url\)\)/);
});

test('F. the budget is enforced on the file itself: an oversized or foreign model is never stored, never exported, never silently shipped', () => {
  const L = TD.LIMITS; assert.ok(L.modelBytes <= 8 * 1024 * 1024 && L.triangles <= 200000 && L.textureSize <= 2048 && L.phone.modelBytes <= L.modelBytes && L.trianglesTarget < L.triangles);
  const i = GLB.inspect(NORMAL).info; const not = (over, code) => assert.equal(GLB.check(Object.assign({}, i, over), L).code, code);
  not({ bytes: L.modelBytes + 1 }, 'too_large'); not({ triangles: L.triangles + 1 }, 'too_many_triangles'); not({ textures: { count: 1, maxSize: 4096 } }, 'texture_too_large'); not({ external: ['x.png'] }, 'external_resources');
  not({ extensionsRequired: ['KHR_draco_mesh_compression'] }, 'unsupported_extension'); not({ bounds: null }, 'no_bounds');
  // the record cannot claim its way past the budget, and the export checks the stored file again
  assert.equal(TD.cleanAsset(modelRecord({ bytes: L.modelBytes + 1 })), null); assert.equal(TD.cleanAsset(modelRecord({ textures: { count: 1, maxSize: 4096 } })), null);
  const db = newDb(); const big = Buffer.concat([NORMAL, Buffer.alloc(L.modelBytes)]); const ref = storeIn(db)(big, 'model/gltf-binary'); const png = storeIn(db)(Buffer.from('not a model'), 'image/png');
  const lie = projectWith({ assets: [modelRecord({ dataUrl: undefined, assetRef: ref, bytes: 1000 })], scenes: blockFor().scenes });
  const x = exported(db, lie, 'big'); assert.doesNotMatch(x.html, /cr-3d|td-stage/); assert.ok(!x.files.some(f => f.endsWith('.glb')), 'a 100 MB model is not what the customer downloads');
  assert.match(x.res.manifest.threeD.leftOut[0].reason, /over the size a website may ship/); assert.equal(x.res.manifest.threeD.shipped, false);
  const wrong = exported(db, projectWith({ assets: [modelRecord({ dataUrl: undefined, assetRef: png })], scenes: blockFor().scenes }), 'wrongtype'); assert.doesNotMatch(wrong.html, /cr-3d/); assert.match(wrong.res.manifest.threeD.leftOut[0].reason, /missing/);
});

// ================================================================ D. THE PAGE: the loader, in a browser that can, cannot or should not
// a page as the loader sees it. opts: { data (the page's cr-3d), width, motion, prefersReduced, gl, protocol, saveData,
// memory, io (IntersectionObserver present), pin, hidden } -> what happened, and levers to make things happen
function browser(opts) {
  const o = Object.assign({ width: 1440, motion: 'full', prefersReduced: false, gl: true, protocol: 'http:', saveData: false, memory: 8, io: true, pin: false, hidden: false }, opts);
  const cls = () => { const s = new Set(); return { add: c => s.add(c), remove: c => s.delete(c), contains: c => s.has(c), set: s }; };
  const attrs = { 'data-motion': o.motion }; const html = { getAttribute: k => (k in attrs ? attrs[k] : null), setAttribute: (k, v) => { attrs[k] = v; } };
  const listeners = {}; const scripts = []; const mounts = []; const timers = []; let ioCb = null; let moCb = null; let scrollY = 0;
  const stages = ((o.data && o.data.scenes) || []).map((sc, i) => {
    const ly = { classList: cls() }; const sec = { classList: cls(), hasAttribute: k => k === 'data-pin' && o.pin, querySelectorAll: () => [{ getAttribute: () => (sc.posters || [])[0] || 'c-bottle', closest: () => ly }, { getAttribute: () => 'another-picture', closest: () => ({ classList: cls() }) }], getBoundingClientRect: () => ({ top: 2000 + i * 1500 - scrollY, height: 900 }) };
    const a = { 'data-td': sc.id }; const el = { classList: cls(), getAttribute: k => a[k], setAttribute: (k, v) => { a[k] = v; }, removeAttribute: k => { delete a[k]; }, hasAttribute: k => k in a, offsetWidth: o.hidden ? 0 : 520, offsetHeight: o.hidden ? 0 : 640, closest: () => sec, getBoundingClientRect: () => sec.getBoundingClientRect() };
    return { el, sec, ly };
  });
  const canvas = { getContext: () => (o.gl === 'throw' ? (() => { throw new Error('no'); })() : o.gl ? { getExtension: () => ({ loseContext() {} }) } : null) };
  const document = { documentElement: html, getElementById: id => (id === 'cr-3d' ? { textContent: JSON.stringify(o.data) } : null), querySelectorAll: s => (s === '.td-stage' ? stages.map(x => x.el) : []), createElement: t => (t === 'canvas' ? canvas : { tag: t }), head: { appendChild: el => scripts.push(el) }, body: {} };
  const window = { innerWidth: o.width, innerHeight: 900, get scrollY() { return scrollY; }, location: { protocol: o.protocol }, navigator: { deviceMemory: o.memory, connection: o.saveData ? { saveData: true } : undefined }, matchMedia: () => ({ matches: o.prefersReduced }),
    addEventListener: (k, f) => { (listeners[k] = listeners[k] || []).push(f); }, requestAnimationFrame: f => { f(); return 1; }, MutationObserver: function (cb) { moCb = cb; this.observe = () => {}; } };
  if (o.io) window.IntersectionObserver = function (cb) { ioCb = cb; this.observe = () => {}; };
  vm.runInNewContext(TD.LOADER, { window, document, setTimeout: (f, ms) => { timers.push({ f, ms }); return timers.length; }, clearTimeout: n => { if (timers[n - 1]) timers[n - 1].f = null; } });
  const handle = () => ({ progress: [], visible: [], destroyed: 0, setProgress(p) { this.progress.push(p); }, setVisible(v) { this.visible.push(v); }, destroy() { this.destroyed++; } });
  return {
    ST: window.__sr3d, scripts, mounts, stages, timers, window,
    near: (i, on) => ioCb && ioCb([{ target: stages[i].el, isIntersecting: on !== false }]),
    engineLoaded() { window.SiteRemade3D = { mount: (el, cfg, cb) => { const h = handle(); mounts.push({ el, cfg, cb, handle: h }); return h; } }; scripts.forEach(s => s.onload && s.onload()); },
    engineFailed() { scripts.forEach(s => s.onerror && s.onerror()); },
    setMotion(v) { attrs['data-motion'] = v; if (moCb) moCb(); },
    scrollTo(y) { scrollY = y; (listeners.scroll || []).forEach(f => f()); },
    fire(k, e) { (listeners[k] || []).forEach(f => f(e)); },
  };
}
const DATA = () => pageData(renderCreative2(PLAN, ASSETS, { mode: 'export', src: a => (a.format === 'glb' ? 'assets/model.glb' : `${a.id}.png`), threeD: TD.normalise(blockFor(), { sectionIds: PLAN.scenes.map(s => s.id) }) }));

test('D. the 3D engine is fetched lazily, after the page and only when a stage comes near: nothing is requested at load, one script when it does, and the picture is hidden only once the model has been drawn', () => {
  const p = browser({ data: DATA() });
  assert.deepEqual([p.ST.state, p.ST.engine, p.scripts.length, p.mounts.length], ['waiting', 'none', 0, 0], 'at load: nothing 3D has been asked for');
  assert.ok(p.stages[0].ly.classList.contains('td-src'), 'the picture the stage stands in for is found...'); assert.ok(!p.stages[0].sec.classList.contains('td-live'), '...and still shown');
  p.near(0); assert.equal(p.scripts.length, 1); assert.deepEqual([p.scripts[0].src, p.scripts[0].async], ['assets/sr3d.min.js', true]); assert.equal(p.ST.stages[0].state, 'loading');
  p.near(0); assert.equal(p.scripts.length, 1, 'asked for once');
  p.engineLoaded(); assert.equal(p.mounts.length, 1); const m = p.mounts[0];
  assert.deepEqual([m.cfg.model, m.cfg.composition, m.cfg.interaction, m.cfg.tier, m.cfg.dpr, m.cfg.maxBytes, m.cfg.maxTriangles, m.cfg.anchor], ['assets/model.glb', 'scroll-rotate', 'scroll-rotate', 'full', TD.LIMITS.dpr, TD.LIMITS.modelBytes, TD.LIMITS.triangles, 0.5]);
  assert.ok(!p.stages[0].el.classList.contains('td-on') && !p.stages[0].sec.classList.contains('td-live'), 'loading: the picture is still the picture');
  m.cb.ready({ triangles: 4224 }); assert.deepEqual([p.ST.stages[0].state, p.stages[0].el.classList.contains('td-on'), p.stages[0].sec.classList.contains('td-live')], ['on', true, true]);
  // scroll drives it: the scene's progress, 0 as it arrives .. 1 as it leaves, from cached geometry
  p.scrollTo(2000 - 900); p.scrollTo(2000); p.scrollTo(2000 + 900); const pr = m.handle.progress;
  assert.ok(near(pr[pr.length - 3], 0) && near(pr[pr.length - 2], 0.5) && near(pr[pr.length - 1], 1), pr.join());
  p.near(0, false); assert.deepEqual(m.handle.visible.slice(-1), [false], 'off screen: it rests');
  // a pinned scene turns through its hold (anchor 0)
  const pin = browser({ data: DATA(), pin: true }); pin.near(0); pin.engineLoaded(); assert.equal(pin.mounts[0].cfg.anchor, 0);
  // the page's own markup: the stage sits in the picture's own box, per breakpoint, and never takes a touch
  const html = renderCreative2(PLAN, ASSETS, { mode: 'export', src: a => `${a.id}.x`, threeD: TD.normalise(blockFor(), { sectionIds: PLAN.scenes.map(s => s.id) }) });
  const L = PLAN.scenes.find(s => s.id === SECTIONS[0]).layers.find(x => x.asset === 'c-bottle'); const st = html.match(/<div class="td-stage"[^>]*>/)[0];
  assert.ok(st.includes(`--x:${L.box.d[0]};--y:${L.box.d[1]};--w:${L.box.d[2]};--h:${L.box.d[3]};--mx:${L.box.m[0]};--my:${L.box.m[1]};--mw:${L.box.m[2]};--mh:${L.box.m[3]}`), st); assert.match(st, /aria-hidden="true"/);
  assert.match(TD.CSS, /\.td-stage\{[^}]*max-width:100%;overflow:hidden;pointer-events:none/); assert.match(TD.CSS, /\.td-canvas\{[^}]*touch-action:pan-y;pointer-events:none/);
  assert.ok(TD.LOADER.length < 9000, `the inline loader is small (${TD.LOADER.length} bytes)`); assert.doesNotMatch(TD.LOADER, /https?:|eval\(|new Function|innerHTML|document\.write/);
});

test('10. mobile fallback: a phone gets the lighter draw -- or the picture, when the plan keeps phones flat, the model is too heavy for one, or the device is too small', () => {
  const lite = browser({ data: DATA(), width: 390 }); lite.near(0); lite.engineLoaded(); assert.deepEqual([lite.mounts[0].cfg.tier, lite.mounts[0].cfg.dpr], ['lite', TD.LIMITS.phone.dpr]);
  const flat = d => { const p = browser(d); p.near(0); return p; };
  const poster = DATA(); poster.scenes[0].phone = 'poster'; const a = flat({ data: poster, width: 390 }); assert.deepEqual([a.ST.stages[0].state, a.ST.stages[0].why, a.scripts.length], ['poster', 'phones get the picture', 0], 'no engine is even downloaded');
  const heavy = DATA(); heavy.scenes[0].bytes = TD.LIMITS.phone.modelBytes + 1; const b = flat({ data: heavy, width: 390 }); assert.deepEqual([b.ST.stages[0].why, b.scripts.length], ['too heavy for a phone', 0]);
  const dense = DATA(); dense.scenes[0].triangles = TD.LIMITS.phone.triangles + 1; assert.equal(flat({ data: dense, width: 390 }).ST.stages[0].why, 'too heavy for a phone');
  assert.equal(flat({ data: DATA(), width: 390, memory: 1 }).ST.stages[0].why, 'low memory');
  // the same heavy model on a desktop is drawn
  const desk = browser({ data: heavy }); desk.near(0); assert.equal(desk.scripts.length, 1);
  // a stage the phone layout hides is never mounted
  const gone = browser({ data: DATA(), width: 390, hidden: true }); gone.near(0); assert.deepEqual([gone.ST.stages[0].why, gone.scripts.length], ['stage hidden', 0]);
  // the phone box is the picture's own phone box, and the stage can never be wider than its scene
  assert.match(TD.CSS, /@media \(max-width:720px\)\{\.td-stage\{left:calc\(var\(--mx\)\*1%\);top:calc\(var\(--my\)\*1%\);width:calc\(var\(--mw\)\*1%\);height:calc\(var\(--mh\)\*1%\)\}\}/);
  assert.equal(TD.LIMITS.phone.width, 720, 'the same breakpoint as the page');
});

test('11. reduced-motion fallback: 3D never starts -- no engine, no model, no canvas -- and the page shows the picture; switching motion off later takes the model down', () => {
  for (const o of [{ motion: 'reduced' }, { prefersReduced: true }]) {
    const p = browser(Object.assign({ data: DATA() }, o)); p.near(0);
    assert.deepEqual([p.ST.state, p.ST.why, p.ST.stages[0].state, p.scripts.length, p.mounts.length], ['poster', 'reduced motion', 'poster', 0, 0], JSON.stringify(o));
    assert.ok(!p.stages[0].sec.classList.contains('td-live') && !p.stages[0].el.classList.contains('td-on'));
  }
  // the studio's motion switch, on a running page: off -> the model is destroyed and the picture is back; on again -> it returns
  const p = browser({ data: DATA() }); p.near(0); p.engineLoaded(); p.mounts[0].cb.ready({}); assert.ok(p.stages[0].sec.classList.contains('td-live'));
  p.setMotion('reduced'); assert.deepEqual([p.mounts[0].handle.destroyed, p.ST.stages[0].state, p.stages[0].sec.classList.contains('td-live'), p.stages[0].el.classList.contains('td-on')], [1, 'poster', false, false]);
  p.setMotion('full'); assert.equal(p.mounts.length, 2, 'mounted again');
  // the page's own reduced-motion rule and the engine agree: the page's still composition is complete without it
  const html = renderCreative2(PLAN, ASSETS, { mode: 'export', motion: 'reduced', src: a => `${a.id}.x`, threeD: TD.normalise(blockFor(), { sectionIds: PLAN.scenes.map(s => s.id) }) });
  assert.match(html, /data-motion="reduced"/); assert.match(html, /<img class="ly-img" data-asset="c-bottle"/, 'the picture is on the page, in the HTML, whatever happens to 3D');
});

test('D. every other way 3D can fail leaves the picture: no WebGL, a page opened from disk, a data-saving connection, an engine that will not load, a model that will not load, a slow start, a lost context', () => {
  const stay = (o, why) => { const p = browser(Object.assign({ data: DATA() }, o)); p.near(0); assert.deepEqual([p.ST.state, p.ST.why, p.scripts.length], ['poster', why, 0], why); assert.ok(!p.stages[0].sec.classList.contains('td-live')); };
  stay({ gl: false }, 'no hardware WebGL'); stay({ gl: 'throw' }, 'no hardware WebGL'); stay({ protocol: 'file:' }, 'opened from disk'); stay({ saveData: true }, 'data saver');
  assert.match(TD.LOADER, /failIfMajorPerformanceCaveat: true/, 'software emulation counts as none');
  const e = browser({ data: DATA() }); e.near(0); e.engineFailed(); assert.deepEqual([e.ST.state, e.ST.why, e.ST.engine, e.mounts.length], ['poster', 'engine failed to load', 'failed', 0]);
  const m = browser({ data: DATA() }); m.near(0); m.engineLoaded(); m.mounts[0].cb.error('model 404'); assert.deepEqual([m.ST.stages[0].state, m.ST.stages[0].why, m.mounts[0].handle.destroyed], ['poster', 'model: model 404', 1]);
  const lost = browser({ data: DATA() }); lost.near(0); lost.engineLoaded(); lost.mounts[0].cb.ready({}); lost.mounts[0].cb.error('context lost'); assert.deepEqual([lost.ST.stages[0].state, lost.stages[0].sec.classList.contains('td-live'), lost.stages[0].el.classList.contains('td-on')], ['poster', false, false], 'the picture is back');
  // a model that has not drawn within the time limit is abandoned
  const slow = browser({ data: DATA() }); slow.near(0); slow.engineLoaded(); const t = slow.timers.find(x => x.ms === TD.LIMITS.loadTimeoutMs); assert.ok(t && t.f); t.f(); assert.deepEqual([slow.ST.stages[0].state, slow.ST.stages[0].why, slow.mounts[0].handle.destroyed], ['poster', 'timeout', 1]);
  // without IntersectionObserver the stages are simply mounted; and leaving the page releases them
  const old = browser({ data: DATA(), io: false }); assert.equal(old.scripts.length, 1);
  const bye = browser({ data: DATA() }); bye.near(0); bye.engineLoaded(); bye.mounts[0].cb.ready({}); bye.fire('pagehide'); assert.equal(bye.mounts[0].handle.destroyed, 1);
  // no data, or junk: the loader does nothing at all
  assert.equal(browser({ data: { scenes: [] } }).ST, undefined); assert.equal(browser({ data: 'junk' }).ST, undefined);
});

test('D. the engine build is the committed one: one file, three.js inside it, built from the sources as they are now', () => {
  const eng = threeD.engine(); assert.ok(eng, 'vendor/three-d is present');
  const built = fs.readFileSync(eng.path); assert.equal(sha(built), eng.sha256); assert.equal(built.length, eng.bytes);
  const sources = eng.sources.map(f => fs.readFileSync(path.join(ROOT, f), 'utf8').replace(/\r\n/g, '\n')).join('\n--\n');
  assert.equal(sha(sources), eng.sourceSha256, 'stale: run node scripts/build-three-d-runtime.js');
  assert.ok(eng.bytes < 800 * 1024 && eng.gzipBytes < 200 * 1024, `the engine is ${eng.bytes} bytes (${eng.gzipBytes} gzipped)`);
  assert.match(built.toString('utf8', 0, 200), /var SiteRemade3D=/);
  // the server never needs three.js: it is a development dependency, and nothing in lib/ or server.js requires it
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')); assert.equal(pkg.dependencies.three, undefined); assert.ok(pkg.devDependencies.three && pkg.devDependencies.esbuild);
  assert.doesNotMatch(fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8'), /require\(['"]three['"]\)/);
  // the studio bundle carries the schema and the loader -- not the engine
  const core = fs.readFileSync(path.join(ROOT, 'creative-core.js'), 'utf8'); assert.ok(core.includes('function threeDLoader')); assert.doesNotMatch(core, /WebGLRenderer|GLTFLoader/);
});

// ================================================================ I. PLANNING
test('I. the planner never adds 3D on its own: only when the mode allows it, from the owner\'s own upload of an object -- and never from a picture found on the web', () => {
  const by = list => new Map(list.filter(Boolean).map(a => [a.id, a]));
  // the source: uploads only
  assert.equal(TD.sourceEligible(upload(), { byId: by([upload()]) }).ok, true);
  const no = (a, code) => assert.equal(TD.sourceEligible(a, { byId: by([a, upload()]) }).code, code, code);
  no(upload({ origin: 'research', pageUrl: 'https://example.org/p' }), 'not_upload'); no(upload({ pageUrl: 'https://example.org/p' }), 'not_upload'); no(upload({ sourceUrl: 'https://example.org/x.jpg' }), 'not_upload');
  no(upload({ ownerPicked: true }), 'picked_web'); no(upload({ ownerRole: 'logo' }), 'logo'); no(upload({ removed: true }), 'missing'); no(null, 'missing');
  no(upload({ assess: Object.assign({}, upload().assess, { width: 400, height: 500 }) }), 'too_small'); no(upload({ curation: { role: 'environment', framing: 'scene' } }), 'not_an_object'); no(upload({ ownerRole: 'background' }), 'not_an_object');
  assert.equal(TD.sourceEligible(cutout(), { byId: by(ASSETS) }).ok, true, 'a cut-out of the owner\'s upload is the owner\'s picture');
  assert.equal(TD.sourceEligible(Object.assign(cutout(), { cutoutOf: 'web' }), { byId: by([upload({ id: 'web', origin: 'research', pageUrl: 'https://example.org' })]) }).code, 'not_upload', 'a cut-out of a web picture is a web picture');
  // the intent
  const ctx = extra => Object.assign({ allow: true, assets: ASSETS, mainAsset: 'u-bottle', concept: { product: true }, kind: 'invented' }, extra || {});
  assert.deepEqual(TD.intent(ctx()), { planned: true, reason: 'planned', sourceAssetId: 'u-bottle', composition: 'scroll-rotate' });
  assert.deepEqual(TD.intent(ctx({ allow: false })), { planned: false, reason: 'mode_off' }); assert.deepEqual(TD.intent(ctx({ allow: false, blocked: 'insufficient_credits' })), { planned: false, reason: 'insufficient_credits' });
  assert.deepEqual(TD.intent(ctx({ allow: 'yes' === true })), { planned: false, reason: 'mode_off' });
  const web = [upload({ id: 'w1', origin: 'research', pageUrl: 'https://example.org/a', license: 'CC0' }), upload({ id: 'w2', ownerPicked: true })];
  assert.deepEqual(TD.intent(ctx({ assets: web, mainAsset: 'w1', request: { sourceAssetId: 'w1' } })), { planned: false, reason: 'needs_upload' }, 'web research images are never a 3D source, whatever their licence');
  assert.deepEqual(TD.intent(ctx({ assets: [upload({ ownerRole: 'logo' })] })), { planned: false, reason: 'source_not_eligible' });
  assert.equal(TD.intent(ctx({ kind: 'personal' })).reason, 'subject_not_suitable'); assert.equal(TD.intent(ctx({ concept: { place: true } })).reason, 'subject_not_suitable'); assert.equal(TD.intent(ctx({ concept: { editorial: true, product: true } })).reason, 'subject_not_suitable');
  assert.equal(TD.intent(ctx({ request: { composition: 'orbit-product' } })).composition, 'orbit-product'); assert.equal(TD.intent(ctx({ request: { composition: 'do-anything' } })).composition, 'scroll-rotate');
  assert.equal(TD.intent(ctx({ mainAsset: 'c-bottle' })).sourceAssetId, 'u-bottle', 'the model is made from the whole photo, not its cut-out');
  // in the validator: a director's own "premium3D" is DROPPED unless the server allowed 3D for this generation
  const wish = JSON.parse(JSON.stringify(pageFor().raw)); wish.premium3D = { planned: true, reason: 'planned', sourceAssetId: 'u-bottle', composition: 'orbit-product' }; wish.threeD = { scenes: [{ code: 'x' }] };
  const d = D2.direct({ understanding: UND, research: { page: null, facts: [] }, assets: ASSETS, supplied: { facts: [], memories: [] }, seed: '1', prefer: { family: 'object-story', mode: 'expressive' } });
  const v = o => validatePlan2(JSON.parse(JSON.stringify(wish)), Object.assign({ assets: ASSETS, facts: [], understanding: UND, page: null, art: d.recipe }, o)).plan;
  assert.equal(v({}).premium3D, undefined, 'not allowed: not in the plan'); assert.equal(v({}).threeD, undefined, 'and a plan never carries 3D scenes or code of its own');
  assert.deepEqual(v({ premium3D: { allow: true, mainAsset: 'u-bottle' } }).premium3D, { planned: true, reason: 'planned', sourceAssetId: 'u-bottle', composition: 'orbit-product' });
  assert.deepEqual(v({ premium3D: { allow: false, blocked: 'not_priced' } }).premium3D, { planned: false, reason: 'not_priced' });
  // server-side availability: every condition is the server's own, and by default 3D is simply off
  assert.equal(TD.enabled({}), false); assert.equal(TD.enabled({ CREATIVE_3D: 'on' }), true); assert.equal(TD.enabled({ CREATIVE_3D: '1' }), false);
  return threeD.availability({}).then(a => assert.deepEqual(a, { ok: false, reason: 'mode_off' })).then(() => threeD.availability({ CREATIVE_3D: 'on' })).then(a => assert.deepEqual(a, { ok: false, reason: 'not_priced' }))
    .then(() => threeD.availability({ CREATIVE_3D: 'on', SITEREMADE_3D_PROVIDER_USD: '0.4' })).then(a => assert.deepEqual([a.ok, a.reason], [false, 'provider_unavailable']));
});

// ================================================================ H. MONEY: a 3D model is one more premium asset type of the SAME durable job
const QUIET = Object.assign(PJ.policy({}), { firstCheckMs: 1e9, checkMs: 1e9, maxCheckMs: 1e9, lateCheckMs: 1e9, downloadRetryMs: 0 }); // (no timer fires: the test ticks)
function job3D(opts) {
  const o = opts || {}; const db = newDb(); const at = new Date();
  const est = Cost.estimate({ SITEREMADE_3D_PROVIDER_USD: '0.40', SITEREMADE_3D_BLENDER_USD: '0.02' });
  credits.grant(db, { id: 'purchase:3d', accountId: 'acct_t', kind: 'purchase', amount: 100, source: 'test', now: at });
  assert.equal(credits.reserve(db, { accountId: 'acct_t', opId: 'cj_3dtestjob01:premium', amount: est.credits, kind: 'creative_premium', now: at }).ok, true);
  const provider = createMockProvider(Object.assign({ polls: 0 }, o.provider)); const logs = []; let stored = 0;
  const role = Cost.role(est, { sourceAssetId: 'u-bottle', sourceRef: 'a'.repeat(64), mime: 'image/png', sourceBase: 'https://siteremade.test', subject: 'a tonic bottle' });
  const made = PJ.create(db, { accountId: 'acct_t', creativeJobId: 'cj_3dtestjob01', opId: 'cj_3dtestjob01:premium', mode: 'model3d', strategy: 'standard', creditsReserved: est.credits, budgetUsd: est.budgetUsd, roles: [role] });
  const process3D = o.process3D || ((file, r, row) => Pipeline.normalise(Object.assign({}, file, { provider: r.provider, providerAssetId: r.providerJobId, sourceAssetId: r.sourceAssetId, requestId: `${row.id}:${r.role}` }), { blender: standIn(o.blender || 'ok') }));
  const never = () => { throw new Error('the video provider must never be called for a 3D role'); };
  const worker = PJ.createWorker({ db, provider: { submit: never, status: never, cancel: never, download: never }, presets: {}, store: (b, m) => { stored++; return storeIn(db)(b, m); }, sourceUrl: async () => 'https://siteremade.test/api/premium-media/source/tok', releaseSource: () => {},
    enabled: () => true, provider3D: o.noProvider ? () => null : () => provider, enabled3D: () => o.enabled3D !== false, process3D, policy: QUIET, log: r => logs.push(r) });
  const row = () => db.premiumJobs.find(made.job.id); const balance = () => credits.available(db, 'acct_t').total;
  return { db, est, provider, worker, id: made.job.id, row, view: () => PJ.view(row()), tel: () => PJ.telemetry(row()), balance, logs, stored: () => stored };
}

test('H. a 3D model runs under the SAME durable premium job: quoted, reserved, sent once, normalised, stored, charged only when delivered, settled once', async () => {
  const j = job3D(); assert.equal(j.balance(), 100 - j.est.credits, 'reserved before anything is sent');
  assert.deepEqual([j.view().status, j.view().message, j.view().mode], ['queued', 'Creating 3D model…', 'model3d']);
  await j.worker.tick(j.id);
  const v = j.view(); assert.deepEqual([v.status, v.terminal, v.message, v.completed], ['completed', true, '3D model ready', 1]);
  assert.deepEqual([j.provider.log.generations, j.provider.log.downloads, j.stored()], [1, 1, 1]);
  assert.deepEqual(j.provider.log.params[0].requestId, `${j.id}:model3d`, 'the provider is given an idempotency key: this job, this role');
  const d = v.delivered[0]; assert.equal(d.kind, 'model3d'); assert.equal(d.sourceAssetId, 'u-bottle'); assert.equal(d.premium.provider, 'mock');
  assert.deepEqual(TD.cleanAsset(d.threeD), d.threeD, 'what the studio gets is a valid project asset'); assert.equal(d.threeD.assetRef, sha(NORMAL)); assert.ok(getAssetStore().get(d.threeD.assetRef).equals(NORMAL));
  assert.doesNotMatch(JSON.stringify(v), /mock3d:\/\/|https?:\/\/|sourceRef|estimatedUsd|observedUsd/, 'no provider address, source link or provider cost reaches the studio');
  assert.deepEqual([v.credits.reserved, v.credits.charged, v.credits.returned, v.credits.settled], [j.est.credits, j.est.credits, 0, true]); assert.equal(j.balance(), 100 - j.est.credits);
  // the telemetry keeps the cost: what it was budgeted at and what it is observed to cost (provider + Blender)
  const t = j.tel(); assert.deepEqual([t.providerSubmissions, t.roles[0].providerState, t.roles[0].providerSpend, t.roles[0].estimatedUsd, t.roles[0].observedCostUsd, t.providerSpend.incurredUsd], [1, 'completed', 'incurred', j.est.budgetUsd, 0.42, 0.42]);
  const media = j.db.premiumMedia.find(j.row().roles_json && PJ.rolesOf(j.row())[0].mediaId); assert.deepEqual([media.provider, media.media_type, media.status, media.mime, media.asset_ref], ['mock', 'model3d', 'completed', 'model/gltf-binary', sha(NORMAL)]);
  // repeated ticks, a second worker, a restart: nothing is sent, stored or charged again
  await j.worker.tick(j.id); await j.worker.tick(j.id); assert.equal(PJ.settle(j.db, j.id).settled_at, j.row().settled_at);
  assert.deepEqual([j.provider.log.generations, j.provider.log.submits, j.stored(), j.balance()], [1, 1, 1, 100 - j.est.credits]);
  // one model per 3D job, whatever is asked
  assert.equal(PJ.MAX_CLIPS.model3d, 1);
});

test('H. money rules hold for 3D: a failed, refused, unprocessable or switched-off model costs the owner nothing -- and a generation is never repeated', async () => {
  // the provider failed: no cost, credits returned, said in the owner's words
  const f = job3D({ provider: { outcome: 'failed' } }); await f.worker.tick(f.id);
  assert.deepEqual([f.view().status, f.view().credits.charged, f.view().credits.returned, f.balance()], ['failed', 0, f.est.credits, 100]); assert.match(f.view().message, /^The 3D model could not be made \(the provider reported failed\); \d+ SiteRemade credits returned\.$/);
  // Blender is not there yet: the step is retried like a download -- the model is NOT generated again -- then it gives up honestly
  let tries = 0; const flaky = job3D({ process3D: async (file) => (++tries < 3 ? { ok: false, stage: 'blender', code: 'blender_unavailable', reason: 'Blender is not installed on this server', retry: true } : Pipeline.normalise(file, { blender: standIn('ok') })) });
  await flaky.worker.tick(flaky.id); assert.equal(flaky.view().status, 'running'); await flaky.worker.tick(flaky.id); await flaky.worker.tick(flaky.id);
  assert.deepEqual([flaky.view().status, tries, flaky.provider.log.generations, flaky.provider.log.downloads, flaky.balance()], ['completed', 3, 1, 3, 100 - flaky.est.credits]);
  const never = job3D({ blender: 'hang', process3D: async () => ({ ok: false, stage: 'blender', code: 'blender_unavailable', reason: 'Blender is not installed on this server', retry: true }) });
  for (let i = 0; i < QUIET.maxDownloadTries + 1; i++) await never.worker.tick(never.id);
  assert.deepEqual([never.view().status, never.view().failed[0].code, never.provider.log.generations, never.balance()], ['failed', 'download_failed', 1, 100]); assert.equal(never.tel().roles[0].providerSpend, 'incurred', 'the provider cost is never pretended away');
  // a model that can never ship: failed at once (no retry), credits returned, the provider cost on the record
  const bad = job3D({ blender: 'oversize' }); await bad.worker.tick(bad.id);
  assert.deepEqual([bad.view().status, bad.view().failed[0].code, bad.stored(), bad.balance(), bad.tel().roles[0].providerSpend, bad.tel().roles[0].downloadTries], ['failed', 'processing_failed', 0, 100, 'incurred', 1]);
  assert.ok(bad.logs.some(l => l.step === 'processing-failed' && l.stage === 'limits' && l.code === 'texture_too_large'));
  // switched off, or no adapter: nothing is sent
  const off = job3D({ enabled3D: false }); await off.worker.tick(off.id); assert.deepEqual([off.view().status, off.view().failed[0].code, off.provider.log.submits, off.balance()], ['failed', 'premium_disabled', 0, 100]); assert.match(off.view().message, /^The 3D model was not made \(3D models are switched off on this server\)/);
  const none = job3D({ noProvider: true }); await none.worker.tick(none.id); assert.deepEqual([none.view().failed[0].code, none.balance()], ['provider_unavailable', 100]);
  // a refusal the provider answered: no cost; a submit whose answer never arrived: never sent again
  const refused = job3D({ provider: { submitError: { status: 422, message: 'bad image' } } }); await refused.worker.tick(refused.id); await refused.worker.tick(refused.id);
  assert.deepEqual([refused.view().failed[0].code, refused.tel().roles[0].providerState, refused.provider.log.submits, refused.balance()], ['provider_refused', 'rejected', 1, 100]);
  const lost = job3D({ provider: { submitError: { message: 'socket hang up' } } }); await lost.worker.tick(lost.id); await lost.worker.tick(lost.id);
  assert.deepEqual([lost.view().failed[0].code, lost.tel().roles[0].providerSpend, lost.provider.log.submits, lost.balance()], ['submission_uncertain', 'possible', 1, 100]);
});

test('H. the price is a structure, not a number yet: unpriced by default (and then never planned); priced, it is quoted from provider + Blender cost with the same per-credit ceiling as every premium asset', () => {
  assert.deepEqual(Cost.estimate({}), { priced: false, providerUsd: null, blenderUsd: 0, observedUsd: null, budgetUsd: null, credits: null, reason: 'not_priced' });
  const e = Cost.estimate({ SITEREMADE_3D_PROVIDER_USD: '0.40', SITEREMADE_3D_BLENDER_USD: '0.02' });
  assert.deepEqual(e, { priced: true, providerUsd: 0.4, blenderUsd: 0.02, observedUsd: 0.42, budgetUsd: 0.45, credits: 3, reason: '' });
  const pricing = require('../lib/pricing'); assert.ok(pricing.providerCeilingUsd(e.credits) >= e.budgetUsd, 'never under the cost');
  assert.equal(Cost.estimate({ SITEREMADE_3D_PROVIDER_USD: '99' }).priced, false, 'past the ceiling of a single premium asset: not offered');
  assert.deepEqual(Cost.role(e, { sourceAssetId: 'u' }), { role: 'model3d', mediaType: 'model3d', intent: 'image_to_3d', preset: 'model3d', credits: 3, estimatedUsd: 0.45, observedUsd: 0.42, state: 'pending', sourceAssetId: 'u' });
  // nothing customers see has changed: no 3D price in the catalogue, no 3D line in any quote
  assert.ok(!Object.keys(pricing.publicCatalog().actionCredits).some(k => /3d|model/i.test(k))); const quotes = require('../lib/quotes');
  assert.deepEqual(quotes.build('creative_generation', { premium: [{ intent: 'image_to_3d' }, { intent: 'cinematic_hero' }] }).items.map(i => i.code), ['creative_dom', 'premium_video_4k'], 'a 3D intent is not something a quote knows how to sell yet');
});

// ================================================================ 15, 16: what must not have changed
test('15. Business generation is unchanged: a Business project never carries 3D, and its export never ships it', () => {
  // a real Business project, built by the real Business client (script.js) -- no picture, no model call, no network
  const { loadClient, buildProject, fundedProviderStatus } = require('./helpers/load-client');
  const c = loadClient({ fetchHandler: () => new Promise(() => {}) });
  const { proj } = buildProject(c, 'Glow Theory is an online skincare store in Vancouver selling gentle cleansers, serums and moisturizers for sensitive skin.', { providerStatus: fundedProviderStatus() });
  // (saved once first: the validator names unnamed pages on a first save, so the comparison below starts from a project
  // exactly as the server stores it)
  const saved = projectStore.validateDirectionsState({ directions: [JSON.parse(JSON.stringify(proj))], activeDirectionIndex: 0 }); assert.ok(saved.valid, saved.error);
  const stored = () => JSON.parse(JSON.stringify(saved.normalized.directions[0]));
  const clean = projectStore.validateDirectionsState({ directions: [stored()], activeDirectionIndex: 0 });
  // the same project with every 3D key someone might try to attach to it: it saves as exactly the same project
  const dirty = Object.assign(stored(), { threeD: blockFor(), premium3D: { planned: true }, creative: { threeD: blockFor(), plan: PLAN } });
  dirty.assets = Object.assign({}, dirty.assets, { items: (dirty.assets.items || []).concat([{ id: 'm3d', dataUrl: 'data:model/gltf-binary;base64,' + NORMAL.subarray(0, 300).toString('base64') }]) });
  const check = projectStore.validateDirectionsState({ directions: [dirty], activeDirectionIndex: 0 }); assert.ok(check.valid, check.error); const d = check.normalized.directions[0];
  assert.deepEqual([d.mode, d.creative, d.threeD, d.premium3D], [undefined, undefined, undefined, undefined], 'no Creative key, no 3D key');
  assert.ok(!(d.assets.items || []).some(i => i.id === 'm3d'), 'a model is still refused in a Business project');
  assert.equal(JSON.stringify(check.normalized), JSON.stringify(clean.normalized), 'byte for byte the project it was');
  const db = newDb(); projectStore.internalizeAssets(db, check.normalized); const workDir = path.join(TMP, 'business-export');
  const res = compileExport(db, { project: { id: 'pb', revision: 1, directionsState: check.normalized }, directionIndex: 0, workDir });
  const all = []; const walk = dir => fs.readdirSync(dir, { withFileTypes: true }).forEach(e => (e.isDirectory() ? walk(path.join(dir, e.name)) : all.push(path.relative(workDir, path.join(dir, e.name)).replace(/\\/g, '/')))); walk(workDir);
  assert.ok(all.includes('index.html') && all.includes('styles.css') && all.includes('site.js')); assert.ok(!all.some(f => /sr3d|\.glb$/.test(f)), all.join()); assert.equal(res.manifest.threeD, undefined);
  all.filter(f => /\.(html|js|css)$/.test(f)).forEach(f => assert.doesNotMatch(fs.readFileSync(path.join(workDir, f), 'utf8'), /cr-3d|td-stage|SiteRemade3D|sr3d/, f));
  // (the client's own start-up calls go to the harness's stub, never the network; none of them asks for media or 3D)
  assert.ok(!c.fetchCalls.some(x => /generate-image|premium|three|3d/i.test(String(x.url))), c.fetchCalls.map(x => x.url).join());
  // the Business builder's own files do not mention it
  ['script.js', 'styles.css', 'premium-core.js', 'lib/site-render.js', 'index.html'].forEach(f => assert.doesNotMatch(fs.readFileSync(path.join(ROOT, f), 'utf8'), /three-d|threeD|SiteRemade3D|sr3d|premium3D/, f));
  assert.equal(require('../lib/media/premium-media').validateRequests([{ intent: 'image_to_3d', asset: 'x' }], { kind: 'business' }).requests.length, 0);
});

test('16. existing Creative and Higgsfield generation is unchanged: no 3D key, markup or price appears without 3D; saved pages reopen as they were; a video job is still a video job', async () => {
  // a Creative page planned as before has no 3D in its plan, and a project without 3D saves without a threeD key
  assert.equal(PLAN.premium3D, undefined); assert.ok(!('threeD' in sanitizeCreative({ understanding: UND, assets: ASSETS, plan: PLAN })));
  const old = require('./fixtures/creative-saved-stage2.json').creative; const again = sanitizeCreative(JSON.parse(JSON.stringify(old)));
  assert.ok(!('threeD' in again)); assert.equal(again.plan.premium3D, undefined);
  assert.doesNotMatch(renderCreative2(again.plan, again.assets, { mode: 'export', src: a => a.id }), /cr-3d|td-stage|sr3d|__sr3d/);
  // the spatial tier is untouched: its models are its own, and a 3D model is never offered to it
  const SP = require('../lib/creative/spatial'); assert.equal(SP.CAPS.modelBytes, 8 * 1024 * 1024); assert.ok(!('threeD' in SP));
  const withModel = sanitizeCreative({ understanding: UND, assets: ASSETS, plan: PLAN, threeD: blockFor() }); assert.equal(withModel.models, undefined, 'a 3D model does not become a spatial model');
  // the premium media vocabulary and the video quote are exactly what they were
  const PM = require('../lib/media/premium-media'); assert.deepEqual(PM.INTENT_NAMES, ['cinematic_hero', 'object_motion', 'image_to_video', 'environment_motion', 'premium_transition', 'alternate_angle', 'image_enhance', 'stylized_treatment']);
  assert.deepEqual([PJ.MAX_CLIPS.creative, PJ.MAX_CLIPS.hero, PJ.MAX_CLIPS.showcase], [0, 1, 3]);
  // a video job, through the same worker that now also knows 3D: Higgsfield's provider, its wording, its delivery shape
  const db = newDb(); const at = new Date(); credits.grant(db, { id: 'purchase:v', accountId: 'acct_v', kind: 'purchase', amount: 50, source: 'test', now: at });
  credits.reserve(db, { accountId: 'acct_v', opId: 'cj_videotest001:premium', amount: 12, kind: 'creative_premium', now: at });
  const calls = { submit: 0, three: 0 }; const video = { async submit(endpoint, params) { calls.submit++; calls.params = params; calls.endpoint = endpoint; return { requestId: 'hf_1', status: 'queued' }; }, async status() { return { status: 'completed', requestId: 'hf_1', outputUrl: 'https://fake-output.test/hf_1.mp4', mediaType: 'video' }; }, async cancel() { return true; }, async download() { return { bytes: Buffer.from('mp4'), mime: 'video/mp4' }; } };
  const made = PJ.create(db, { accountId: 'acct_v', creativeJobId: 'cj_videotest001', opId: 'cj_videotest001:premium', mode: 'hero', strategy: 'standard', creditsReserved: 12, budgetUsd: 2.25, roles: [{ role: 'single', intent: 'cinematic_hero', sourceAssetId: 'u1', sourceRef: 'a'.repeat(64), mime: 'image/png', sourceBase: 'https://siteremade.test', preset: 'video_clip', mediaType: 'video', subject: 'Zorbo', credits: 12, estimatedUsd: 2.25, observedUsd: 2.1, state: 'pending' }] });
  assert.equal(PJ.view(made.job).message, 'Creating cinematic hero…');
  const worker = PJ.createWorker({ db, provider: video, presets: { video_clip: { endpoint: 'kling-video/v3.0/4k/image-to-video', mediaType: 'video', params: { duration: 5, sound: 'off' }, costKey: 'video_clip', resolution: '4k', durationS: 5 } }, store: storeIn(db), sourceUrl: async () => 'https://siteremade.test/src', releaseSource: () => {},
    enabled: () => true, provider3D: () => { calls.three++; return createMockProvider(); }, enabled3D: () => true, process3D: () => { calls.three++; return { ok: false }; }, policy: QUIET, log: () => {} });
  await worker.tick(made.job.id); const v = PJ.view(db.premiumJobs.find(made.job.id));
  assert.deepEqual([v.status, v.message, calls.submit, calls.three, calls.endpoint], ['completed', 'Cinematic hero ready', 1, 0, 'kling-video/v3.0/4k/image-to-video']);
  assert.deepEqual(Object.keys(calls.params).sort(), ['duration', 'image_url', 'prompt', 'sound'], 'the video request carries exactly what it did');
  assert.deepEqual(Object.keys(v.delivered[0]).sort(), ['kind', 'premium', 'role', 'sourceAssetId', 'video']); assert.deepEqual([v.delivered[0].kind, v.delivered[0].premium.provider, v.delivered[0].video.mime], ['video', 'higgsfield', 'video/mp4']);
  assert.equal(db.premiumMedia.find(v.delivered[0].video.mediaId).provider, 'higgsfield');
});

// ================================================================ 14: nothing left this machine
test('14. no real network or provider call occurred in this whole file: the provider is a fixture, the page and the engine name no outside address, and paid providers are off', () => {
  assert.deepEqual(net, [], 'no fetch, no http(s) request to anything but this machine');
  const PAID = require('../lib/paid-providers'); assert.equal(PAID.mode({}, {}), 'off'); assert.equal(PAID.key('higgsfield'), '');
  // the mock provider makes no request by construction, and says so with what it returns
  const src = fs.readFileSync(path.join(ROOT, 'lib', 'three-d', 'mock-provider.js'), 'utf8'); assert.doesNotMatch(src, /fetch\(|require\('https?'\)|net\.|dgram/);
  // Blender is started offline
  assert.match(fs.readFileSync(path.join(ROOT, 'lib', 'three-d', 'blender.js'), 'utf8'), /base\.push\('--offline-mode'\)/);
});

test.after(() => { try { fs.rmSync(TMP, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } catch (e) { /* the OS clears its temp folder */ } });
