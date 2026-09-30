'use strict';
// CREATIVE MODE review run (see CREATIVE_MODE.md "Verification").
//   node test/review/creative-review.js <outDir> [--cases=a,b] [--skip-studio] [--skip-capture]
// 1. starts the REAL server.js locally (paid providers stubbed at the network edge and every
//    provider key blank -- a Creative run must make no paid call; the mock call log proves it),
// 2. drives the real studio in Electron for each brief (creative-studio-run.js): research
//    against the real Wikipedia / Wikimedia Commons, pictures read in the browser, direction,
//    edit, replace, save, reload + reopen,
// 3. compiles each saved project with the real export compiler (lib/export-compiler.js),
// 4. captures every exported page at desktop and phone size -- entrance, loop, scroll, reduced
//    motion, a failed picture -- with measurements and short recordings (creative-capture.js).
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { startServer } = require('../helpers/server-process');
const briefsArg = (process.argv.find(a => a.startsWith('--briefs=')) || '').slice(9);
const CASES = require(briefsArg ? path.resolve(briefsArg) : '../fixtures/creative-briefs');

const ELECTRON = process.env.ELECTRON_BIN || 'C:/Users/jayde/AppData/Local/Temp/claude/c--Users-jayde-Documents-BeatBlock/f77ec6d4-71d7-4500-b46b-68165439e77a/scratchpad/v3/node_modules/electron/dist/electron.exe';
const args = process.argv.slice(2);
const outDir = path.resolve(args.find(a => !a.startsWith('--')) || path.join(os.tmpdir(), 'sr-creative-review'));
const only = (args.find(a => a.startsWith('--cases=')) || '').slice(8).split(',').filter(Boolean);
const cases = CASES.filter(c => !only.length || only.includes(c.id));

function electron(script, jobFile, timeout) {
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
  const r = spawnSync(ELECTRON, [path.join(__dirname, script), jobFile], { stdio: 'inherit', timeout, env });
  return r.status;
}

async function main() {
  fs.mkdirSync(outDir, { recursive: true });
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'sr-creative-'));
  const callLog = path.join(outDir, 'provider-calls.log'); fs.writeFileSync(callLog, '');
  const remote = (args.find(a => a.startsWith('--remote=')) || '').slice(9); // e.g. https://www.siteremade.com (real model, real limits)
  const provider = (args.find(a => a.startsWith('--provider=')) || '--provider=none').slice(11); // local: none | mock
  if (!args.includes('--skip-studio') && remote) {
    const jobFile = path.join(outDir, 'studio-job.json');
    fs.writeFileSync(jobFile, JSON.stringify({ url: remote.replace(/\/$/, ''), outDir, email: process.env.CREATIVE_REVIEW_EMAIL, password: process.env.CREATIVE_REVIEW_PASSWORD, cases }));
    electron('creative-studio-run.js', jobFile, 60 * 60 * 1000);
  } else if (!args.includes('--skip-studio')) {
    const env = {
      SITEREMADE_BACKEND: 'local', SITEREMADE_DB_PATH: path.join(scratch, 'app.db'), SITEREMADE_ASSET_STORE_DIR: path.join(scratch, 'assets'),
      SITEREMADE_PREMIUM_LOG_DIR: path.join(outDir, 'ledger'), OPENAI_API_KEY: '', ANTHROPIC_API_KEY: provider === 'mock' ? 'mock-only' : '', MOCK_CREATIVE: process.env.MOCK_CREATIVE || 'ok', STRIPE_SECRET_KEY: '',
      // a local review account makes several pages: its trial allowance covers them (nothing here is real money)
      SITEREMADE_TRIAL_CREDITS: process.env.SITEREMADE_TRIAL_CREDITS || '400', MOCK_CALL_LOG: callLog, NODE_ENV: 'test',
    };
    const server = await startServer(env);
    const jobFile = path.join(outDir, 'studio-job.json');
    fs.writeFileSync(jobFile, JSON.stringify({ url: `http://127.0.0.1:${server.port}`, outDir, email: `creative-review-${Date.now()}@example.com`, cases }));
    try { electron('creative-studio-run.js', jobFile, 30 * 60 * 1000); } finally { await server.stop(); }
  }
  // export every saved project through the real compiler
  process.env.SITEREMADE_BACKEND = 'local';
  process.env.SITEREMADE_ASSET_STORE_DIR = path.join(scratch, 'export-assets');
  const { getDatabaseAdapter } = require('../../lib/adapters/database-adapter');
  const projectStore = require('../../lib/project-store');
  const { compileExport } = require('../../lib/export-compiler');
  const db = getDatabaseAdapter(':memory:');
  const pages = [];
  for (const id of cases.flatMap(c => [c.id, c.id + '-b'])) {
    const c = { id };
    const f = path.join(outDir, `${c.id}.project.json`); if (!fs.existsSync(f)) { if (!/-b$/.test(id)) console.log(`${c.id}: no saved project`); continue; }
    const proj = JSON.parse(fs.readFileSync(f, 'utf8'));
    const check = projectStore.validateDirectionsState(proj.directionsState);
    if (!check.valid) { console.log(`${c.id}: save validator rejected: ${check.error}`); continue; }
    projectStore.internalizeAssets(db, check.normalized);
    const workDir = path.join(outDir, `${c.id}-export`);
    const res = compileExport(db, { project: { id: proj.id, revision: proj.revision, directionsState: check.normalized }, directionIndex: 0, workDir });
    console.log(`${c.id}: exported ${res.manifest.assets.length} assets, index.html ${fs.statSync(path.join(workDir, 'index.html')).size} bytes`);
    pages.push({ id: c.id, file: path.join(workDir, 'index.html'), dir: workDir });
  }
  if (!args.includes('--skip-capture') && pages.length) {
    const jobFile = path.join(outDir, 'capture-job.json');
    fs.writeFileSync(jobFile, JSON.stringify({ outDir, pages, ffmpeg: process.env.FFMPEG_BIN || 'C:/Users/jayde/AppData/Local/Microsoft/WinGet/Packages/yt-dlp.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe/ffmpeg-N-125365-g9a01c1cb6a-win64-gpl/bin/ffmpeg.exe' }));
    electron('creative-capture.js', jobFile, 120 * 60 * 1000);
  }
  const calls = fs.readFileSync(callLog, 'utf8').trim().split('\n').filter(Boolean);
  console.log(`provider calls during the run: ${calls.length}`);
  fs.writeFileSync(path.join(outDir, 'provider-calls-count.txt'), String(calls.length));
}
main().catch(e => { console.error(e); process.exit(1); });
