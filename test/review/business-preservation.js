'use strict';
// Business preservation check for Creative mode: builds real Business projects with the real
// client (the same path the browser takes), then saves and exports each one with BOTH the code
// before Creative mode (lib/project-store.js + lib/export-compiler.js from git <base>) and the
// current code, and compares the saved state and every exported page byte for byte.
//   node test/review/business-preservation.js [base=eb98bf1]
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');

const base = process.argv[2] || 'eb98bf1';
const ROOT = path.join(__dirname, '..', '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sr-biz-'));
process.env.SITEREMADE_BACKEND = 'local'; process.env.SITEREMADE_ASSET_STORE_DIR = path.join(tmp, 'assets');
const baseline = { store: path.join(ROOT, 'lib', '.baseline-project-store.js'), compiler: path.join(ROOT, 'lib', '.baseline-export-compiler.js') };
fs.writeFileSync(baseline.store, execSync(`git show ${base}:lib/project-store.js`, { cwd: ROOT }));
fs.writeFileSync(baseline.compiler, execSync(`git show ${base}:lib/export-compiler.js`, { cwd: ROOT }));
const TEXTS = [
  'Glow Theory is an online skincare store in Vancouver selling gentle cleansers, serums and moisturizers for sensitive skin.',
  'Summit Roofing repairs and replaces residential roofs in Calgary, with free inspections and 24/7 emergency leak repair.',
  'Fizzwell is a sparkling energy drink brand with natural caffeine and bold citrus flavours.',
  'Petal & Stem is a florist in Portland making wedding flowers, bouquets and same-day delivery.',
  'Ledgerline is a bookkeeping and tax firm for small businesses in Toronto.',
  'Blue Heron Kayak Tours runs guided sea kayaking trips around the San Juan Islands.',
];
(async () => {
try {
  const { loadClient, buildProject } = require('../helpers/load-client');
  const { mockPng } = require('../helpers/mock-image');
  const oldStore = require(baseline.store), newStore = require('../../lib/project-store');
  const oldC = require(baseline.compiler), newC = require('../../lib/export-compiler');
  const { getDatabaseAdapter } = require('../../lib/adapters/database-adapter');
  const db = getDatabaseAdapter(':memory:');
  const norm = s => s.replace(/(page|sec|proj|mod|field)_[\w-]{20,}/g, '$1_*').replace(/"(createdAt|exportTimestamp|importedAt|purchaseDate)":"[^"]*"/g, '"$1":"*"');
  let same = 0, diff = 0;
  for (const [i, text] of TEXTS.entries()) {
    const c = loadClient({ fetchHandler: (url, o) => (url === '/api/generate-image' ? { ok: true, dataUrl: mockPng(JSON.parse(o.body).prompt, JSON.parse(o.body).aspectRatio), creditsCharged: 1 } : new Promise(() => {})) });
    const { proj } = buildProject(c, text, { seed: i });
    c.ctx.__p = proj; await c.run('(project = window.__p, resolveImagePlanAssets(project))'); // real (mock-pixel) images in the project
    const state = { directions: [JSON.parse(JSON.stringify(proj))], activeDirectionIndex: 0 };
    const a = oldStore.validateDirectionsState(JSON.parse(JSON.stringify(state))), b = newStore.validateDirectionsState(JSON.parse(JSON.stringify(state)));
    // the same random ids on both sides, so the exports can be compared byte for byte
    const pinned = JSON.parse(JSON.stringify(b.normalized));
    const saveSame = norm(JSON.stringify(a.normalized)) === norm(JSON.stringify(b.normalized));
    newStore.internalizeAssets(db, pinned);
    const wa = path.join(tmp, `old-${i}`), wb = path.join(tmp, `new-${i}`);
    oldC.compileExport(db, { project: { id: `p${i}`, revision: 1, directionsState: JSON.parse(JSON.stringify(pinned)) }, directionIndex: 0, workDir: wa });
    newC.compileExport(db, { project: { id: `p${i}`, revision: 1, directionsState: JSON.parse(JSON.stringify(pinned)) }, directionIndex: 0, workDir: wb });
    const files = fs.readdirSync(wa).filter(f => /\.(html|css|js|xml|txt|md)$/.test(f));
    const exportDiffs = files.filter(f => norm(fs.readFileSync(path.join(wa, f), 'utf8')) !== norm(fs.readFileSync(path.join(wb, f), 'utf8')));
    const ls = d => (fs.existsSync(path.join(d, 'assets')) ? fs.readdirSync(path.join(d, 'assets')).sort() : []);
    const assetsSame = JSON.stringify(ls(wa)) === JSON.stringify(ls(wb));
    const ok = saveSame && !exportDiffs.length && assetsSame && !('mode' in b.normalized.directions[0]);
    ok ? same++ : diff++;
    console.log(`${ok ? 'SAME' : 'DIFF'}  ${proj.business.name.padEnd(24)} save ${saveSame ? 'identical' : 'DIFFERENT'} · export ${files.length} files ${exportDiffs.length ? 'DIFFERENT: ' + exportDiffs.join(',') : 'identical'} · assets ${assetsSame ? 'identical' : 'DIFFERENT'}`);
  }
  console.log(`${same} identical, ${diff} different (base ${base})`);
  process.exitCode = diff ? 1 : 0;
} finally { fs.rmSync(baseline.store, { force: true }); fs.rmSync(baseline.compiler, { force: true }); }
})();
