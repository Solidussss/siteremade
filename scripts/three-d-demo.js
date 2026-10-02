'use strict';
// TRUE 3D, PHASE 1 -- the demo, end to end, with $0 of provider spend and nothing sent anywhere:
//
//   a fixture GLB (the mock provider's answer to "the owner's upload")
//     -> Blender normalisation (headless: upright, centred, one size, texture within the limit)
//     -> stored in the content-addressed asset store
//     -> a Creative page whose product scene shows the model (composition: scroll-rotate)
//     -> saved as a SiteRemade project -> reopened (its 3D metadata identical)
//     -> exported with the real export compiler -> the customer ZIP (lib/archive.js)
//     -> the ZIP unpacked like a customer would, and served by a bare static server with nothing of SiteRemade in it
//
//   node scripts/three-d-demo.js            build everything under data/three-d-demo/ and print what happened
//   node scripts/three-d-demo.js --serve    ...and keep serving the unpacked website on http://127.0.0.1:4173/
//                                           (scroll the page: the bottle turns)
//   node scripts/three-d-demo.js --port 5000 --serve
//
// It uses its own database and asset store (data/three-d-demo/), never the builder's. Without Blender it says so and uses
// the committed, already-normalised fixture instead, so the rest can still be seen.
const fs = require('fs');
const http = require('http');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'data', 'three-d-demo');
const args = process.argv.slice(2); const SERVE = args.includes('--serve'); const PORT = Number(args[args.indexOf('--port') + 1]) > 0 && args.includes('--port') ? Number(args[args.indexOf('--port') + 1]) : 4173;
fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(OUT, { recursive: true });
process.env.SITEREMADE_BACKEND = 'local'; process.env.SITEREMADE_ASSET_STORE_DIR = path.join(OUT, 'asset-store');

const { resetDatabaseAdapter } = require('../lib/adapters/database-adapter');
const { getAssetStore } = require('../lib/adapters/asset-store');
const projectStore = require('../lib/project-store');
const { compileExport } = require('../lib/export-compiler');
const { zipDirectory } = require('../lib/archive');
const { extractZip, readZip } = require('../test/helpers/unzip');
const threeD = require('../lib/three-d');
const TD = require('../lib/creative/three-d');
const D2 = require('../lib/creative/director2');
const { validatePlan2 } = require('../lib/creative/validate2');
const FX = require('../test/fixtures/three-d/make-fixture');

const kb = n => `${(n / 1024).toFixed(1)} KB`;
const step = (n, text) => console.log(`\n[${n}] ${text}`);
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.glb': 'model/gltf-binary', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.mp4': 'video/mp4', '.json': 'application/json', '.md': 'text/markdown; charset=utf-8', '.txt': 'text/plain; charset=utf-8' };
// a static file server and nothing else: what any web host does with the customer's folder
function serveFolder(dir, port) {
  const root = path.resolve(dir);
  return new Promise(resolve => {
    const srv = http.createServer((req, res) => {
      const rel = decodeURIComponent(String(req.url || '/').split('?')[0]); const file = path.resolve(root, '.' + (rel.endsWith('/') ? rel + 'index.html' : rel));
      if (req.method !== 'GET' || (file !== root && !file.startsWith(root + path.sep)) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); res.end('not found'); return; }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' }); fs.createReadStream(file).pipe(res);
    });
    srv.listen(port, '127.0.0.1', () => resolve(srv));
  });
}

async function main() {
  const db = resetDatabaseAdapter(path.join(OUT, 'demo.db'));
  const store = (bytes, mime) => { const { hash, byteLength } = getAssetStore().put(bytes); db.assetBlobs.insertIfMissing({ hash, contentType: mime, byteLength, createdAt: new Date().toISOString() }); return hash; };
  const summary = { providerSpendUsd: 0, networkRequests: 0 };

  step(1, 'The owner\'s upload: one picture of the product (drawn here; no web picture is ever a 3D source)');
  const photo = FX.productPhoto(1200, 1500, false); const cut = FX.productPhoto(1200, 1500, true);
  const upload = { id: 'u-bottle', origin: 'upload', title: 'Aurelia tonic', alt: 'A bottle of Aurelia tonic', mime: 'image/png', dataUrl: 'data:image/png;base64,' + photo.toString('base64'),
    assess: { width: 1200, height: 1500, aspect: 0.8, orientation: 'portrait', subject: [0.15, 0.07, 0.85, 0.93], colours: ['#1a528c', '#d49e38', '#c43028'], luminance: 130, background: { colour: '#f1ece2', uniformity: 0.95, tolerance: 12 }, transparent: false, transparentShare: 0, megapixels: 1.8 },
    caps: { moveFreely: false, frame: true, backdrop: false, heroSize: true, lowRes: false }, curation: { role: 'subject', identity: 'exact', depicts: 'the bottle', issues: [], separable: true, quality: 3, framing: 'whole' } };
  const cutout = { id: 'c-bottle', origin: 'derived', cutout: true, cutoutOf: 'u-bottle', title: 'Aurelia tonic', alt: 'A bottle of Aurelia tonic', mime: 'image/png', dataUrl: 'data:image/png;base64,' + cut.toString('base64'), processing: 'background removed',
    assess: { width: 1200, height: 1500, aspect: 0.8, orientation: 'portrait', subject: [0.15, 0.07, 0.85, 0.93], colours: ['#1a528c', '#d49e38'], luminance: 110, transparent: true, transparentShare: 0.5, megapixels: 1.8 }, caps: { moveFreely: true, frame: false, backdrop: false, heroSize: true, lowRes: false } };
  console.log(`    u-bottle: 1200x1500 PNG, ${kb(photo.length)}; eligible as a 3D source: ${JSON.stringify(TD.sourceEligible(upload, { byId: new Map([[upload.id, upload]]) }))}`);

  step(2, 'Image -> 3D asset: the MOCK provider (a fixture GLB; no request leaves this machine)');
  const provider = threeD.createMockProvider();
  const raw = threeD.glb.inspect(fs.readFileSync(require('../lib/three-d/mock-provider').DEFAULT_FIXTURE));
  console.log(`    the provider's file: ${kb(raw.info.bytes)}, ${raw.info.triangles} triangles, size ${raw.info.size.join(' x ')}, centre ${raw.info.center.join(', ')}, largest texture ${raw.info.textures.maxSize} px`);
  console.log(`    may it ship as it is? ${JSON.stringify(threeD.glb.check(raw.info, TD.LIMITS))}`);

  step(3, 'Blender, headless: normalise it');
  const found = await threeD.blender.detect(); summary.blender = found;
  console.log(`    Blender: ${found.available ? `${found.version} at ${found.path}` : `NOT AVAILABLE -- ${found.reason}`}`);
  let asset; let report = null; const t0 = Date.now();
  if (found.available) {
    const made = await threeD.pipeline.run({ provider, sourceImage: photo, sourceAssetId: 'u-bottle', prompt: 'a tonic bottle', mode: 'product', requestId: 'demo-1', title: 'Aurelia tonic bottle' }, { store, provider: { pollMs: 10 } });
    if (!made.ok) throw new Error(`the pipeline stopped at ${made.stage}: ${made.code} -- ${made.reason}`);
    asset = made.asset; report = made.report; summary.normalizedBy = `Blender ${found.version}`;
    console.log(`    normalised in ${((Date.now() - t0) / 1000).toFixed(1)} s (provider submissions: ${provider.log.generations}, downloads: ${provider.log.downloads})`);
  } else {
    // (no Blender here: the committed result of the same normalisation, so the page and the export can still be shown)
    const pre = fs.readFileSync(path.join(ROOT, 'test', 'fixtures', 'three-d', 'product-normalized.glb')); const seen = threeD.glb.inspect(pre);
    asset = Object.assign(TD.cleanAsset({ id: 'td-prebuilt-fixture', sourceAssetId: 'u-bottle', title: 'Aurelia tonic bottle', bytes: seen.info.bytes, bounds: seen.info.bounds, center: seen.info.center, scale: 1, triangles: seen.info.triangles, textures: seen.info.textures, parts: seen.info.parts, animations: seen.info.animations, normalized: true, provenance: { provider: 'mock', processor: 'prebuilt fixture (no Blender on this machine)', at: new Date().toISOString() }, assetRef: '0'.repeat(64) }), { assetRef: store(pre, TD.MIME) });
    summary.normalizedBy = 'prebuilt fixture (Blender not available)';
  }
  console.log(`    the stored model: ${asset.id}, ${kb(asset.bytes)}, ${asset.triangles} triangles, bounds ${JSON.stringify(asset.bounds)}, largest texture ${asset.textures.maxSize} px, parts ${asset.parts.join(', ')}`);
  if (report) console.log(`    before -> after: size ${report.before.size.join(' x ')} -> ${report.after.size.join(' x ')}; centre ${report.before.center.join(', ')} -> ${report.after.center.join(', ')}; texture ${report.before.textureMax} -> ${report.after.textureMax} px`);
  console.log(`    stored durably as ${asset.assetRef} (${getAssetStore().exists(asset.assetRef) ? 'in the asset store' : 'MISSING'})`);
  summary.asset = asset;

  step(4, 'A Creative page for it (the built-in director; no model call), with the 3D INTENT decided by the system');
  const understanding = { kind: 'invented', subject: 'Aurelia Tonic', brief: 'a launch page for Aurelia, a small-batch tonic in a blue glass bottle', tone: { register: 'cinematic' }, identity: { name: 'Aurelia Tonic', kind: 'invented', what: 'a small-batch tonic drink product in a blue glass bottle' } };
  const assets = [upload, cutout];
  const directed = D2.direct({ understanding, research: { page: null, facts: [] }, assets, supplied: { facts: ['Aurelia is bottled in small batches.', 'Each bottle holds 500 ml.'], memories: [] }, seed: '1', prefer: { family: 'object-story', mode: 'expressive' } });
  const v = validatePlan2(directed.plan, { assets, facts: [], understanding, page: null, art: directed.recipe, premium3D: { allow: true, mainAsset: 'u-bottle' } });
  if (v.errors.length) throw new Error('the page plan has errors: ' + v.errors.join('; '));
  const plan = v.plan;
  console.log(`    ${plan.scenes.length} scenes; plan.premium3D = ${JSON.stringify(plan.premium3D)}`);
  // the product scene: the first one after the opening that shows the subject's picture -- the model takes its place
  const posters = new Set(assets.filter(a => a.id === 'u-bottle' || a.cutoutOf === 'u-bottle').map(a => a.id));
  const section = plan.scenes.find((s, i) => i > 0 && s.layers.some(L => L.kind === 'image' && posters.has(L.asset))) || plan.scenes[0];
  const block = TD.normalise({ assets: [asset], scenes: [{ id: 'td-product', assetId: asset.id, sectionId: section.id, composition: plan.premium3D.composition, lighting: 'studio', turns: 1.5 }] }, { sectionIds: plan.scenes.map(s => s.id) });
  console.log(`    3D scene: ${JSON.stringify(block.scenes[0])}`);

  step(5, 'Saved as a SiteRemade project, then reopened');
  db.accounts.insert({ id: 'acct_demo', email: 'demo@siteremade.test', passwordHash: 'x', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
  const direction = { mode: 'creative', meta: { id: 'creative_3d_demo', createdAt: new Date().toISOString(), version: 'creative-1' }, pages: [{ id: 'creative', label: 'Creative page', sections: [] }],
    creative: { v: 1, brief: understanding.brief, understanding, supplied: { facts: ['Aurelia is bottled in small batches.', 'Each bottle holds 500 ml.'], memories: [] }, research: { status: 'none', page: null, facts: [] }, assets, plan, threeD: block, motion: { intensity: 'lively' }, cost: {}, updatedAt: new Date().toISOString() } };
  const created = projectStore.createProject(db, 'acct_demo', { name: 'Aurelia Tonic (3D demo)', directionsState: { directions: [direction], activeDirectionIndex: 0 } });
  if (!created.ok) throw new Error('the project could not be saved: ' + created.error);
  const rawProject = projectStore.getOwnedProjectRaw(db, 'acct_demo', created.project.id); const saved3D = rawProject.directionsState.directions[0].creative.threeD;
  const reopened = projectStore.getOwnedProject(db, 'acct_demo', created.project.id); const open3D = reopened.directionsState.directions[0].creative.threeD;
  const strip = b => JSON.stringify(Object.assign({}, b, { assets: b.assets.map(a => { const o = Object.assign({}, a); delete o.dataUrl; delete o.assetRef; return o; }) }));
  console.log(`    project ${created.project.id}: saved with the model as a reference (${saved3D.assets[0].assetRef.slice(0, 12)}..., no bytes in the project row)`);
  console.log(`    reopened: the model's bytes come back (${kb(Buffer.from(open3D.assets[0].dataUrl.split(',')[1], 'base64').length)}); 3D metadata identical: ${strip(saved3D) === strip(block) && strip(open3D) === strip(block)}`);
  const again = projectStore.updateOwnedProject(db, 'acct_demo', created.project.id, { directionsState: reopened.directionsState, expectedRevision: reopened.revision });
  console.log(`    saved again from the reopened state: ${again.ok ? 'ok' : again.reason}; stored model files in the asset store: ${fs.readdirSync(process.env.SITEREMADE_ASSET_STORE_DIR).filter(f => f === asset.assetRef).length}`);
  summary.projectId = created.project.id;

  step(6, 'Exported with the real export compiler, and zipped as the customer\'s download');
  const project = projectStore.getOwnedProjectRaw(db, 'acct_demo', created.project.id);
  const workDir = path.join(OUT, 'export'); const res = compileExport(db, { project: { id: project.id, revision: project.revision, directionsState: project.directionsState }, directionIndex: 0, workDir });
  const zip = zipDirectory(workDir, path.join(OUT, 'aurelia-tonic-website.zip'));
  const entries = readZip(fs.readFileSync(zip.path));
  entries.forEach(e => console.log(`    ${e.name.padEnd(86)} ${kb(e.data.length).padStart(10)}`));
  const html = entries.find(e => e.name === 'index.html').data.toString('utf8'); const glbs = entries.filter(e => e.name.endsWith('.glb'));
  console.log(`    ZIP: ${zip.fileCount} files, ${kb(zip.totalBytes)} unpacked, ${kb(zip.zipBytes)} zipped`);
  console.log(`    the model in the ZIP is the stored model: ${glbs.length === 1 && Buffer.compare(glbs[0].data, getAssetStore().get(asset.assetRef)) === 0}`);
  console.log(`    index.html names the engine as ${JSON.parse(html.match(/id="cr-3d">([\s\S]*?)<\/script>/)[1].replace(/\\u003c/g, '<')).runtime}; absolute addresses in the page's scripts and 3D data: ${(html.match(/<script[^>]*>[\s\S]*?<\/script>/g) || []).join('').replace(/http:\/\/www\.w3\.org\/[\w/]+/g, '').match(/https?:\/\/[^\s"'\\]+/g) || 'none'}`);
  summary.export = { zip: zip.path, files: zip.fileCount, unpackedBytes: zip.totalBytes, zipBytes: zip.zipBytes, manifest3D: res.manifest.threeD };

  step(7, 'The ZIP unpacked like a customer would, and served by a bare static server (nothing of SiteRemade)');
  const site = path.join(OUT, 'site-from-zip'); extractZip(fs.readFileSync(zip.path), site);
  // (the same page WITHOUT 3D, for the size comparison: the identical project, its threeD block removed)
  const flat = JSON.parse(JSON.stringify(project.directionsState)); delete flat.directions[0].creative.threeD;
  const flatDir = path.join(OUT, 'export-without-3d'); compileExport(db, { project: { id: project.id, revision: project.revision, directionsState: flat }, directionIndex: 0, workDir: flatDir });
  const flatZip = zipDirectory(flatDir, path.join(OUT, 'without-3d.zip'));
  summary.exportWithout3D = { files: flatZip.fileCount, unpackedBytes: flatZip.totalBytes, zipBytes: flatZip.zipBytes };
  console.log(`    the same page without 3D: ${flatZip.fileCount} files, ${kb(flatZip.totalBytes)} unpacked, ${kb(flatZip.zipBytes)} zipped -> 3D adds ${kb(zip.totalBytes - flatZip.totalBytes)} unpacked, ${kb(zip.zipBytes - flatZip.zipBytes)} zipped`);
  console.log(`    its index.html mentions 3D: ${/cr-3d|td-stage|sr3d/.test(fs.readFileSync(path.join(flatDir, 'index.html'), 'utf8'))}; it ships an engine file: ${fs.existsSync(path.join(flatDir, 'assets', 'sr3d.min.js'))}`);
  summary.site = site; summary.url = `http://127.0.0.1:${PORT}/`;
  fs.writeFileSync(path.join(OUT, 'summary.json'), JSON.stringify(summary, null, 2));
  console.log(`\nDemo built in ${OUT}\n  website folder (from the ZIP): ${site}\n  customer ZIP:                  ${zip.path}\n  provider spend: $0 -- provider network requests: 0`);
  if (SERVE) {
    await serveFolder(site, PORT);
    console.log(`\nServing the unpacked website at ${summary.url}  (Ctrl+C to stop)\n  Scroll to the product scene: the bottle is a real 3D model, and the scroll turns it.`);
  } else console.log(`\nTo see it: node scripts/three-d-demo.js --serve   then open http://127.0.0.1:${PORT}/`);
}
main().catch(e => { console.error('\nDEMO FAILED: ' + (e && e.stack || e)); process.exit(1); });
module.exports = { serveFolder };
