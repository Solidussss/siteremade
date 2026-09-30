'use strict';
// Mobile audit -- NOT part of `npm test` (this repo has no browser dependency). Renders the REAL builder and the REAL
// compiled websites in Electron at phone, tablet and desktop sizes and measures what a visitor would hit: sideways
// scrolling, elements past the screen edge, cut-off controls, small tap targets, inputs that make iOS zoom, tiny
// text, fixed bars covering content (test/review/mobile-metrics.js).
//
//   1. starts server.js with every paid provider mocked (test/helpers/run-server.js),
//   2. fills one account with realistic content: several saved drafts (long names included), a Creative page, and
//      purchased Business + Creative websites (mocked Stripe checkout + signed webhook),
//   3. compiles a Business export and a Creative export from saved projects (the real export compiler),
//   4. drives test/review/mobile-capture.js: landing (signed out), auth gate, signed-in builder with a freshly
//      generated website, the builder's phone preview, the account conflict panel, the Creative studio, and both
//      exports -- at every width.
// Writes mobile-result.json, a summary (mobile-summary.txt) and screenshots to outDir.
//
//   ELECTRON_PATH=<electron.exe> node test/review/mobile-audit.js <outDir>
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');
const { startServer, client, providerCalls } = require('../helpers/server-process');
const F = require('../fixtures/businesses');

const outDir = path.resolve(process.argv[2] || path.join(os.tmpdir(), 'siteremade-mobile'));
const ELECTRON = process.env.ELECTRON_PATH;
if (!ELECTRON || !fs.existsSync(ELECTRON)) { console.error('Set ELECTRON_PATH to an Electron binary.'); process.exit(1); }
const WIDTHS = (process.env.MOBILE_WIDTHS || '320,360,375,390,412,430,768,820,1440').split(',').map(Number);
const LANDSCAPE = process.env.MOBILE_LANDSCAPE === '0' ? [] : [[667, 375], [844, 390]];
const WEBHOOK_SECRET = 'whsec_mobile_audit';
const LONG = 'The Extraordinarily Long-Named Harbourside Physiotherapy & Sports Rehabilitation Clinic of North Vancouver';

function creativeDirection() {
  const { mockPng } = require('../helpers/mock-image');
  const { validatePlan2 } = require('../../lib/creative/validate2');
  const saved = JSON.parse(JSON.stringify(require('../fixtures/creative-saved-stage2.json').creative));
  // the fixture keeps only asset references; give each picture real (procedural) pixels
  saved.assets.forEach(a => { const s = a.assess || {}; a.dataUrl = mockPng(a.title || a.id, (s.width || 4) >= (s.height || 3) ? '4:3' : '3:4'); delete a.assetRef; });
  saved.plan = validatePlan2(saved.plan, { assets: saved.assets, facts: saved.plan.facts }).plan; // today's composition rules
  return { mode: 'creative', meta: { id: 'creative_mobile_audit' }, pages: [{ id: 'creative', label: 'Creative page', sections: [] }], creative: saved };
}
function businessDirection(text) {
  const { loadClient, premiumProviderStatus, buildProject } = require('../helpers/load-client');
  return JSON.parse(JSON.stringify(buildProject(loadClient(), text, { providerStatus: premiumProviderStatus() }).proj));
}

async function main() {
  fs.mkdirSync(outDir, { recursive: true });
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'sr-mobile-'));
  const env = {
    SITEREMADE_BACKEND: 'local', SITEREMADE_DB_PATH: path.join(scratch, 'app.db'), SITEREMADE_ASSET_STORE_DIR: path.join(scratch, 'assets'),
    SITEREMADE_PREMIUM_LOG_DIR: path.join(scratch, 'premium'), SITEREMADE_EXPORTS_DIR: path.join(scratch, 'exports'), PREMIUM_GENERATION_V1: 'true',
    ANTHROPIC_API_KEY: 'mock-only', MOCK_PLANNER: 'success', STRIPE_SECRET_KEY: 'sk_test_mock_only', STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET,
    SITEREMADE_TRIAL_CREDITS: '60', MOCK_CALL_LOG: path.join(scratch, 'calls.log'), NODE_ENV: 'test',
  };
  const server = await startServer(env);
  try {
    const call = client(server.port);
    const account = { email: 'mobile-audit@example.com', password: 'correct-horse-battery-staple' };
    await call('POST', '/api/auth/signup', account);
    const create = async (name, direction) => (await call('POST', '/api/projects', { name, directionsState: { directions: [direction], activeDirectionIndex: 0 } })).body.project;
    const buy = async projectId => {
      await call('POST', '/api/checkout', { projectId, businessName: 'Owned' });
      const session = providerCalls(env.MOCK_CALL_LOG).filter(x => x.provider === 'stripe' && x.endpoint === 'checkout' && x.projectId === projectId).pop().session;
      const body = JSON.stringify({ id: 'evt_' + session, type: 'checkout.session.completed', data: { object: { id: session, payment_status: 'paid', amount_total: 14999, currency: 'cad' } } });
      const t = Math.floor(Date.now() / 1000); const sig = crypto.createHmac('sha256', WEBHOOK_SECRET).update(`${t}.${body}`).digest('hex');
      await fetch(`http://127.0.0.1:${server.port}/api/stripe/webhook`, { method: 'POST', headers: { 'content-type': 'application/json', 'stripe-signature': `t=${t},v1=${sig}` }, body });
    };
    // saved drafts (a very long name among them), a Creative page, and two owned websites
    const owned = await create('Greenline Landscapes', businessDirection(F.GREENLINE_TEXT)); await buy(owned.id);
    const creativeOwned = await create('Toilet paper, grandly', creativeDirection()); await buy(creativeOwned.id);
    await create(LONG, businessDirection(F.HARBOUR_TEXT));
    for (const b of F.BUSINESSES.slice(0, 4)) await create(b.id.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()), businessDirection(b.text));
    const creativeDraft = await create('A page about the humble goldfish', creativeDirection());
    // the compiled websites
    process.env.SITEREMADE_BACKEND = 'local'; process.env.SITEREMADE_ASSET_STORE_DIR = env.SITEREMADE_ASSET_STORE_DIR;
    const { getDatabaseAdapter } = require('../../lib/adapters/database-adapter');
    const { compileExport } = require('../../lib/export-compiler');
    const db = getDatabaseAdapter(env.SITEREMADE_DB_PATH);
    const exportsOut = {};
    for (const [kind, id] of [['business-legacy', owned.id], ['creative', creativeOwned.id]]) {
      const raw = (await call('GET', `/api/projects/${id}`)).body.project;
      const workDir = path.join(scratch, 'export-' + kind);
      compileExport(db, { project: { id, revision: raw.revision, directionsState: raw.directionsState }, directionIndex: 0, workDir, hostingChoice: null, purchaseDate: null });
      exportsOut[kind] = path.join(workDir, 'index.html');
    }
    const childEnv = { ...process.env }; delete childEnv.ELECTRON_RUN_AS_NODE; // set inside VS Code terminals; it makes Electron behave as plain Node
    const run = (phase, extra) => {
      const jobFile = path.join(outDir, `mobile-${phase}.job.json`);
      fs.writeFileSync(jobFile, JSON.stringify(Object.assign({ phase, baseUrl: `http://127.0.0.1:${server.port}/`, outDir, widths: WIDTHS, landscape: LANDSCAPE, account, text: F.GREENLINE_TEXT, creativeProjectId: creativeDraft.id }, extra)));
      spawnSync(ELECTRON, [path.join(__dirname, 'mobile-capture.js'), jobFile], { stdio: 'inherit', timeout: 1500000, env: childEnv });
    };
    // the builder itself; it saves the website it generates (premium, as production generates today)
    run('builder');
    const generated = path.join(outDir, 'generated-state.json');
    if (fs.existsSync(generated)) {
      const state = require('../../lib/project-store').validateDirectionsState(JSON.parse(fs.readFileSync(generated, 'utf8'))).normalized;
      require('../../lib/project-store').internalizeAssets(db, state);
      const workDir = path.join(scratch, 'export-business-premium');
      compileExport(db, { project: { id: 'proj_generated_mobile', revision: 1, directionsState: state }, directionIndex: state.activeDirectionIndex || 0, workDir, hostingChoice: null, purchaseDate: null });
      exportsOut['business-premium'] = path.join(workDir, 'index.html');
    }
    run('exports', { exports: exportsOut });
  } finally { await server.stop(); }
  const res = JSON.parse(fs.readFileSync(path.join(outDir, 'mobile-result.json'), 'utf8'));
  fs.writeFileSync(path.join(outDir, 'mobile-summary.txt'), summarize(res));
  console.log(summarize(res));
}

function summarize(res) {
  const lines = [];
  if (res.error) lines.push('ERROR ' + res.error);
  if (res.generated) lines.push('generated: ' + JSON.stringify(res.generated));
  for (const [name, sizes] of Object.entries(res.scenarios || {})) {
    lines.push(`\n== ${name}`);
    for (const [size, m] of Object.entries(sizes)) {
      if (m.error) { lines.push(`  ${size} ERROR ${m.error}`); continue; }
      const flags = [m.overflowX ? `SIDEWAYS(${m.scrollWidth}>${m.clientWidth})` : '', m.wide.length ? `wide:${m.wide.length}` : '', m.clipped.length ? `clipped:${m.clipped.length}` : '', m.zoom.length ? `iosZoom:${m.zoom.length}` : '', m.tapCount ? `smallTaps:${m.tapCount}` : '', m.tiny ? `tinyText:${m.tiny}` : ''].filter(Boolean).join(' ');
      lines.push(`  ${size.padEnd(9)} ${flags || 'ok'}`);
    }
  }
  return lines.join('\n');
}

main().catch(e => { console.error(e); process.exit(1); });
