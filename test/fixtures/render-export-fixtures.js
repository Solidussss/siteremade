'use strict';
// Mocked end-to-end fixture renderer: builds each representative business
// through the REAL client generation code (test/helpers/load-client.js),
// resolves its images through the REAL resolveImagePlanAssets against a
// MOCKED /api/generate-image (test/helpers/mock-image.js -- no provider call
// of any kind), passes the result through the server's real save validator,
// then compiles a real static export with lib/export-compiler.js. The output
// is a folder of ordinary static sites you can open in any browser or
// screenshot -- this repo has no browser dependency, so capturing is left to
// whatever browser is at hand.
//
//   node test/fixtures/render-export-fixtures.js [outDir]
const fs = require('fs');
const os = require('os');
const path = require('path');

const outDir = path.resolve(process.argv[2] || path.join(os.tmpdir(), 'siteremade-export-fixtures'));
// Keep the content-addressed asset store and database out of the repo's own
// data/ folder -- this is a throwaway review run, not app state.
process.env.SITEREMADE_ASSET_STORE_DIR = process.env.SITEREMADE_ASSET_STORE_DIR || path.join(outDir, '.asset-store');
process.env.SITEREMADE_BACKEND = 'local';

const { loadClient, fundedProviderStatus, buildProject } = require('../helpers/load-client');
const { mockPng } = require('../helpers/mock-image');
const { BUSINESSES, FIZZWELL_TEXT, FIZZWELL_PLAN } = require('./businesses');
const { getDatabaseAdapter } = require('../../lib/adapters/database-adapter');
const projectStore = require('../../lib/project-store');
const { compileExport } = require('../../lib/export-compiler');

async function renderOne(db, { id, text, plan }) {
  const client = loadClient({
    fetchHandler(url, options) {
      if (url === '/api/generate-image') {
        const body = JSON.parse(options.body);
        return { ok: true, dataUrl: mockPng(body.prompt, body.aspectRatio), creditsCharged: 1, creditsRemaining: 30 };
      }
      return new Promise(() => {}); // anything else is unexpected in this run -- never resolve
    },
  });
  const { proj, usedClaude } = buildProject(client, text, { claudePlanRaw: plan || null, providerStatus: fundedProviderStatus() });
  client.ctx.__fixtureProj = proj;
  await client.run('(project = window.__fixtureProj, resolveImagePlanAssets(project))');
  client.run('renderProject(project)');
  const imageCalls = client.fetchCalls.filter(c => c.url === '/api/generate-image').map(c => JSON.parse(c.options.body));
  const validated = projectStore.validateDirectionsState({ directions: [JSON.parse(JSON.stringify(proj))], activeDirectionIndex: 0 });
  if (!validated.valid) throw new Error(`${id}: saved shape rejected by validateDirectionsState: ${validated.error || 'invalid'}`);
  const workDir = path.join(outDir, id);
  compileExport(db, { project: { id: `fixture_${id}`, revision: 1, directionsState: validated.normalized }, directionIndex: 0, workDir });
  const saved = validated.normalized.directions[0];
  return {
    id, usedClaude, name: saved.business.name, categoryKey: saved.business.categoryKey, hero: saved.design.dimensions.hero,
    imageRequests: imageCalls.length, distinctPrompts: new Set(imageCalls.map(b => b.prompt)).size,
    generatedReady: Object.values(saved.assets.generated || {}).filter(g => g.status === 'ready').length,
    indexHtml: path.join(workDir, 'index.html'),
  };
}

async function main() {
  fs.mkdirSync(outDir, { recursive: true });
  const db = getDatabaseAdapter(':memory:');
  const cases = BUSINESSES.map(b => ({ id: b.id, text: b.text })).concat([{ id: 'fizzwell-claude', text: FIZZWELL_TEXT, plan: FIZZWELL_PLAN }]);
  const summary = [];
  for (const c of cases) summary.push(await renderOne(db, c));
  fs.writeFileSync(path.join(outDir, 'summary.json'), JSON.stringify(summary, null, 2));
  summary.forEach(s => console.log(`${s.id.padEnd(16)} claude=${String(s.usedClaude).padEnd(5)} name="${s.name}" cat=${s.categoryKey} hero=${s.hero} images: ${s.imageRequests} requested / ${s.distinctPrompts} distinct prompts / ${s.generatedReady} saved ready`));
  console.log(`\nExports written to ${outDir}`);
}

main().catch(e => { console.error(e && e.stack || e); process.exit(1); });
