'use strict';
// Visual review run -- NOT part of `npm test`. For each business below:
//   1. starts the REAL server.js with every paid provider mocked at the
//      network edge (test/helpers/run-server.js: no OpenAI/Claude call of any
//      kind -- images are procedural stand-ins, test/helpers/mock-image.js),
//   2. generates the site through the REAL page in Electron and captures the
//      live preview at desktop + mobile (test/review/capture.js),
//   3. compiles the static export from that SAME saved project (the real save
//      validator + lib/export-compiler.js) and captures it at desktop + mobile,
//   4. captures the hero over time, with and without prefers-reduced-motion.
// Writes PNGs, per-job result JSON and an index.html contact sheet to outDir.
//
//   ELECTRON_PATH=<electron.exe> node test/review/review-sites.js <outDir> [--premium] [ids...]
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { startServer } = require('../helpers/server-process');
const F = require('../fixtures/businesses');

const args = process.argv.slice(2);
const outDir = path.resolve(args.find(a => !a.startsWith('--')) || path.join(os.tmpdir(), 'siteremade-review'));
const premium = args.includes('--premium');
const only = args.filter(a => !a.startsWith('--')).slice(1);
const ELECTRON = process.env.ELECTRON_PATH;
if (!ELECTRON || !fs.existsSync(ELECTRON)) { console.error('Set ELECTRON_PATH to an Electron binary.'); process.exit(1); }

// planner: 'success' = a realistic mocked Claude plan (fixtures), 'error' = Claude
// unavailable, so the deterministic engine builds the site on its own.
const CASES = [
  { id: 'fizzwell', text: F.FIZZWELL_TEXT, planner: 'success' },
  { id: 'greenline', text: F.GREENLINE_TEXT, planner: 'success' },
  { id: 'harbour-physio', text: F.HARBOUR_TEXT, planner: 'error' },
  { id: 'fern-flint', text: F.BUSINESSES.find(b => b.id === 'fern-flint').text, planner: 'error' },
  { id: 'greenline-deterministic', text: F.GREENLINE_TEXT, planner: 'error' },
  { id: 'ledgerly', text: F.BUSINESSES.find(b => b.id === 'ledgerly').text, planner: 'error' },
].filter(c => !only.length || only.includes(c.id));

function runCapture(jobSpec) {
  const jobFile = path.join(outDir, `${jobSpec.id}-${jobSpec.mode}.job.json`);
  fs.writeFileSync(jobFile, JSON.stringify(jobSpec));
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE; // set inside VS Code terminals; it makes Electron behave as plain Node
  spawnSync(ELECTRON, [path.join(__dirname, 'capture.js'), jobFile], { stdio: 'ignore', timeout: 240000, env });
  const resFile = path.join(outDir, `${jobSpec.id}-${jobSpec.mode}.result.json`);
  return fs.existsSync(resFile) ? JSON.parse(fs.readFileSync(resFile, 'utf8')) : { id: jobSpec.id, mode: jobSpec.mode, error: 'no result written' };
}

async function main() {
  fs.mkdirSync(outDir, { recursive: true });
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'sr-review-'));
  process.env.SITEREMADE_BACKEND = 'local';
  process.env.SITEREMADE_ASSET_STORE_DIR = path.join(scratch, 'export-assets');
  const { getDatabaseAdapter } = require('../../lib/adapters/database-adapter');
  const projectStore = require('../../lib/project-store');
  const { compileExport } = require('../../lib/export-compiler');
  const db = getDatabaseAdapter(':memory:');
  const results = [];
  for (const c of CASES) {
    const dir = path.join(scratch, c.id);
    const env = {
      SITEREMADE_BACKEND: 'local', SITEREMADE_DB_PATH: path.join(dir, 'app.db'), SITEREMADE_ASSET_STORE_DIR: path.join(dir, 'assets'),
      SITEREMADE_PREMIUM_LOG_DIR: path.join(dir, 'premium'), PREMIUM_GENERATION_V1: premium ? 'true' : 'false',
      OPENAI_API_KEY: 'mock-only', SITEREMADE_PAID_IMAGES: 'true', SITEREMADE_IMAGE_BUDGET_USD: '3',
      ANTHROPIC_API_KEY: 'mock-only', MOCK_PLANNER: c.planner, MOCK_CALL_LOG: path.join(dir, 'provider-calls.log'),
      STRIPE_SECRET_KEY: '', NODE_ENV: 'test',
    };
    const server = await startServer(env);
    let preview;
    try { preview = runCapture({ mode: 'preview', id: c.id, url: `http://127.0.0.1:${server.port}/`, text: c.text, outDir }); }
    finally { await server.stop(); }
    let exported = { id: c.id, mode: 'export', error: 'no project saved' };
    const projFile = path.join(outDir, `${c.id}.project.json`);
    if (fs.existsSync(projFile)) {
      const proj = JSON.parse(fs.readFileSync(projFile, 'utf8'));
      const validated = projectStore.validateDirectionsState({ directions: [proj], activeDirectionIndex: 0 });
      if (!validated.valid) exported.error = 'save validator rejected the project: ' + validated.error;
      else {
        const workDir = path.join(outDir, `${c.id}-site`);
        compileExport(db, { project: { id: `review_${c.id}`, revision: 1, directionsState: validated.normalized }, directionIndex: 0, workDir });
        exported = runCapture({ mode: 'export', id: c.id, file: path.join(workDir, 'index.html'), outDir });
        const d = validated.normalized.directions[0];
        exported.summary = { name: d.business.name, category: d.business.categoryKey, hero: d.design.dimensions.hero, heroDisplay: d.design.dimensions.heroDisplayVariant || null, heroDirection: d.design.heroDirection || null, sections: (d.pages[0].sections || []).map(s => `${s.type}${s.variant ? ':' + s.variant : ''}`) };
      }
    }
    const calls = fs.existsSync(env.MOCK_CALL_LOG) ? fs.readFileSync(env.MOCK_CALL_LOG, 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l)) : [];
    results.push({ case: c, preview, exported, mockedProviderCalls: { openai: calls.filter(x => x.provider === 'openai').length, anthropic: calls.filter(x => x.provider === 'anthropic').length } });
    const hm = r => r && r.heroDesktop && r.heroDesktop.motion ? `motion ${r.heroDesktop.motion.diff02}% / reduced ${r.heroDesktop.reduced && r.heroDesktop.reduced.diff02}%` : (r && r.error ? 'ERROR ' + r.error.split('\n')[0] : '?');
    console.log(`${c.id.padEnd(24)} preview: ${hm(preview)} | export: ${hm(exported)} | ${exported.summary ? exported.summary.heroDirection && exported.summary.heroDirection.treatment || exported.summary.hero : ''}`);
  }
  fs.writeFileSync(path.join(outDir, 'results.json'), JSON.stringify(results, null, 2));
  const img = f => f ? `<a href="${f}"><img src="${f}" loading="lazy"></a>` : '';
  const heroRow = r => r && r.heroDesktop && r.heroDesktop.motion ? `<div class="frames">${r.heroDesktop.motion.files.map(img).join('')}</div><p>hero change over 5s: <b>${r.heroDesktop.motion.diff02}%</b> (reduced motion: ${r.heroDesktop.reduced.diff02}%)</p>` : '';
  fs.writeFileSync(path.join(outDir, 'index.html'), `<!doctype html><meta charset="utf-8"><title>SiteRemade review</title>
<style>body{font:14px system-ui;margin:24px;background:#f4f4f2}section{background:#fff;padding:16px;margin:0 0 24px;border-radius:8px}.row{display:flex;gap:12px;align-items:flex-start}.row img{max-width:100%;border:1px solid #ddd}.frames{display:flex;gap:6px}.frames img{width:32%;border:1px solid #ddd}.col{flex:1}.m{flex:0 0 220px}</style>
<h1>SiteRemade mocked review (${premium ? 'PREMIUM_GENERATION_V1 on' : 'premium off'})</h1>
${results.map(r => `<section><h2>${r.case.id} <small>(${r.case.planner === 'success' ? 'mocked Claude plan' : 'deterministic engine'})</small></h2>
<pre>${JSON.stringify(r.exported.summary || r.exported.error || {}, null, 1)}</pre><p>mocked provider calls: ${JSON.stringify(r.mockedProviderCalls)}</p>
<h3>Preview</h3>${heroRow(r.preview)}<div class="row"><div class="col">${img(r.preview.desktop && r.preview.desktop.file)}</div><div class="m">${img(r.preview.mobile && r.preview.mobile.file)}</div></div>
<h3>Export</h3>${heroRow(r.exported)}<div class="row"><div class="col">${img(r.exported.desktop && r.exported.desktop.file)}</div><div class="m">${img(r.exported.mobile && r.exported.mobile.file)}</div></div></section>`).join('')}`);
  fs.rmSync(scratch, { recursive: true, force: true });
  console.log(`\nReview written to ${path.join(outDir, 'index.html')}`);
}

main().catch(e => { console.error(e && e.stack || e); process.exit(1); });
