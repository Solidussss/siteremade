'use strict';
// Workplace (app-bridge) AI updates on a Business website never generate a picture (lib/premium/visual-mode.js),
// even when the owner asks for "a fresh hero photo" and the saved project still carries pictures and prompts from
// before that rule. Runs the REAL server.js and the real bridge route end to end: Supabase token check, Claude's
// refinement plan and OpenAI are the only things stubbed (test/helpers/run-server.js).
//   - an update that is ONLY about a picture changes nothing and is not charged, with a clear reason;
//   - an update that also changes words applies the words, leaves the pictures as they are, and costs one AI update.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { startServer, client, providerCalls } = require('./helpers/server-process');
const { loadClient, fundedProviderStatus, buildProject, seedSavedImages } = require('./helpers/load-client');
const { mockPng } = require('./helpers/mock-image');

const TEXT = 'Glow Theory is an online skincare store in Vancouver selling gentle cleansers, serums and moisturizers for sensitive skin.';

// a Business direction saved with pictures (and their prompts) from before the starter-visual rule
function savedDirection() {
  const c = loadClient({ fetchHandler: () => new Promise(() => {}) });
  const { proj } = buildProject(c, TEXT, { providerStatus: fundedProviderStatus() });
  seedSavedImages(proj, mockPng);
  assert.ok(proj.assets.generated.hero && proj.assets.generated.hero.prompt, 'the saved hero has a prompt an update could ask to regenerate');
  return JSON.parse(JSON.stringify(proj));
}

async function withBridge(extraEnv, fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sr-bridge-'));
  const env = Object.assign({
    SITEREMADE_BACKEND: 'local', SITEREMADE_DB_PATH: path.join(dir, 'app.db'), SITEREMADE_ASSET_STORE_DIR: path.join(dir, 'assets'),
    SITEREMADE_PREMIUM_LOG_DIR: path.join(dir, 'premium'),
    ANTHROPIC_API_KEY: 'test-only', OPENAI_API_KEY: 'test-only', SITEREMADE_PAID_IMAGES: 'true', SITEREMADE_IMAGE_BUDGET_USD: '5',
    SITEREMADE_APP_BRIDGE_ENABLED: 'true', SITEREMADE_IDENTITY_BRIDGE_MODE: 'full',
    SUPABASE_URL: 'https://supabase.test', SUPABASE_ANON_KEY: 'test-anon-key', SUPABASE_PUBLISHABLE_KEY: '',
    MOCK_CALL_LOG: path.join(dir, 'provider-calls.log'), STRIPE_SECRET_KEY: '', NODE_ENV: 'test', SITEREMADE_TRIAL_CREDITS: '20',
  }, extraEnv);
  const server = await startServer(env);
  try {
    const call = client(server.port);
    const session = await call('POST', '/api/identity/supabase/session', { supabaseAccessToken: 'test-access-token-1' });
    assert.equal(session.status, 200, JSON.stringify(session.body));
    const created = await call('POST', '/api/projects', { name: 'Glow Theory', directionsState: { directions: [savedDirection()], activeDirectionIndex: 0 } });
    assert.ok(created.status === 201 || created.status === 200, JSON.stringify(created.body));
    await fn({ call, project: created.body.project, openaiCalls: () => providerCalls(env.MOCK_CALL_LOG).filter(c => c.provider === 'openai').length });
  } finally { await server.stop(); }
  fs.rmSync(dir, { recursive: true, force: true });
}
const edit = (call, project) => call('POST', `/api/app-bridge/website/${project.id}/edits`, { baseRevision: project.revision, request: 'Give the homepage a fresh hero photo.' }, { authorization: 'Bearer test-access-token-1' });
const balance = async call => (await call('GET', '/api/credits')).body.credits.remaining;

for (const premiumFlag of ['true', 'false']) {
  test(`Workplace: an update that is only "a fresh hero photo" changes nothing, generates nothing and is not charged (PREMIUM_GENERATION_V1=${premiumFlag})`, async () => {
    await withBridge({ PREMIUM_GENERATION_V1: premiumFlag }, async ({ call, project, openaiCalls }) => {
      const before = await balance(call);
      const r = await edit(call, project);
      assert.equal(r.status, 422, JSON.stringify(r.body));
      assert.equal(r.body.error.reason, 'starter_visuals_only');
      assert.match(r.body.error.message, /Upload your own photo/);
      assert.equal(openaiCalls(), 0, 'no picture generated');
      assert.equal(await balance(call), before, 'not charged');
      assert.equal((await call('GET', `/api/projects/${project.id}`)).body.project.revision, project.revision, 'nothing saved');
    });
  });

  test(`Workplace: an update that also changes words applies them, keeps the pictures, and costs one AI update (PREMIUM_GENERATION_V1=${premiumFlag})`, async () => {
    await withBridge({ PREMIUM_GENERATION_V1: premiumFlag, MOCK_REFINEMENT_COPY: 'Gentle skincare, made in Vancouver' }, async ({ call, project, openaiCalls }) => {
      const before = await balance(call);
      const savedHero = (await call('GET', `/api/projects/${project.id}`)).body.project.directionsState.directions[0].assets.generated.hero;
      const r = await edit(call, project);
      assert.equal(r.status, 200, JSON.stringify(r.body));
      assert.equal(r.body.creditsCharged, 1, 'one AI update, no picture');
      assert.ok(r.body.changeSummary.some(s => /Pictures were left as they are/.test(s)));
      assert.ok(!r.body.appliedOperations.some(o => o.action === 'regenerate-image'));
      assert.equal(openaiCalls(), 0, 'no picture generated');
      assert.equal(await balance(call), before - 1);
      const after = (await call('GET', `/api/projects/${project.id}`)).body.project.directionsState.directions[0];
      assert.equal(after.copy.headline, 'Gentle skincare, made in Vancouver');
      assert.equal(after.assets.generated.hero.cacheKey, savedHero.cacheKey, 'the saved picture is untouched');
    });
  });
}
