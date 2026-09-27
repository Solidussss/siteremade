'use strict';
// Regression: persisting the browser's image plan must not change what a
// Workplace (app-bridge) image edit costs. Before the plan was persisted the
// edit route always generated on the support model at medium quality; the
// stored plan can name the premium model / high quality for a slot, and the
// edit route must keep ignoring that for pricing.
//
// Runs the REAL server.js and the real bridge route end to end: Supabase
// token check, Claude's refinement plan and OpenAI are the only things
// stubbed (test/helpers/run-server.js).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { startServer, client, providerCalls } = require('./helpers/server-process');
const { loadClient, fundedProviderStatus, buildProject } = require('./helpers/load-client');
const { mockPng } = require('./helpers/mock-image');

const SUPPORT = 'gpt-image-1-mini';
const PREMIUM = 'gpt-image-1';
const TEXT = 'Glow Theory is an online skincare store in Vancouver selling gentle cleansers, serums and moisturizers for sensitive skin.';

// A real generated project whose saved hero plan entry names the PREMIUM
// route at high quality -- what a premium-funded hero looks like once saved.
async function premiumRoutedDirection() {
  const c = loadClient({ fetchHandler: (url, options) => url === '/api/generate-image'
    ? { ok: true, dataUrl: mockPng(JSON.parse(options.body).prompt, JSON.parse(options.body).aspectRatio), creditsCharged: 1 }
    : new Promise(() => {}) });
  const { proj } = buildProject(c, TEXT, { providerStatus: fundedProviderStatus() });
  c.ctx.__p = proj;
  await c.run('(project = window.__p, resolveImagePlanAssets(project))');
  const direction = JSON.parse(JSON.stringify(proj));
  const hero = direction.imagePlan.find(e => e.slot === 'hero');
  assert.ok(hero, 'the fixture project has a hero image slot');
  hero.model = PREMIUM; hero.quality = 'high'; hero.aspectRatio = '16:9';
  assert.equal(direction.assets.generated.hero.status, 'ready');
  assert.ok(direction.assets.generated.hero.prompt, 'the hero has a stored prompt the edit can regenerate from');
  return direction;
}

for (const premiumFlag of ['true', 'false']) {
  test(`Workplace image edit stays on the support model at medium quality even when the saved plan names the premium route (PREMIUM_GENERATION_V1=${premiumFlag})`, async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sr-bridge-'));
    const env = {
      SITEREMADE_BACKEND: 'local', SITEREMADE_DB_PATH: path.join(dir, 'app.db'), SITEREMADE_ASSET_STORE_DIR: path.join(dir, 'assets'),
      SITEREMADE_PREMIUM_LOG_DIR: path.join(dir, 'premium'), PREMIUM_GENERATION_V1: premiumFlag,
      ANTHROPIC_API_KEY: 'test-only', OPENAI_API_KEY: 'test-only', SITEREMADE_PAID_IMAGES: 'true', SITEREMADE_IMAGE_BUDGET_USD: '5',
      SITEREMADE_IMAGE_MODEL_SUPPORT: SUPPORT, SITEREMADE_IMAGE_MODEL_PREMIUM: PREMIUM,
      SITEREMADE_APP_BRIDGE_ENABLED: 'true', SITEREMADE_IDENTITY_BRIDGE_MODE: 'full',
      SUPABASE_URL: 'https://supabase.test', SUPABASE_ANON_KEY: 'test-anon-key', SUPABASE_PUBLISHABLE_KEY: '',
      MOCK_CALL_LOG: path.join(dir, 'provider-calls.log'), STRIPE_SECRET_KEY: '', NODE_ENV: 'test',
    };
    const direction = await premiumRoutedDirection();
    const server = await startServer(env);
    try {
      const call = client(server.port);
      const session = await call('POST', '/api/identity/supabase/session', { supabaseAccessToken: 'test-access-token-1' });
      assert.equal(session.status, 200, JSON.stringify(session.body));

      const created = await call('POST', '/api/projects', { name: 'Glow Theory', directionsState: { directions: [direction], activeDirectionIndex: 0 } });
      assert.ok(created.status === 201 || created.status === 200, JSON.stringify(created.body));
      const projectId = created.body.project.id;
      const stored = await call('GET', `/api/projects/${projectId}`);
      const storedHero = stored.body.project.directionsState.directions[0].imagePlan.find(e => e.slot === 'hero');
      assert.equal(storedHero.model, PREMIUM, 'precondition: the saved plan really does name the premium route');
      assert.equal(storedHero.quality, 'high');

      const before = providerCalls(env.MOCK_CALL_LOG).filter(c => c.provider === 'openai').length;
      const edit = await call('POST', `/api/app-bridge/website/${projectId}/edits`,
        { baseRevision: stored.body.project.revision, request: 'Give the homepage a fresh hero photo.' },
        { authorization: 'Bearer test-access-token-1' });
      assert.equal(edit.status, 200, JSON.stringify(edit.body));
      assert.equal(edit.body.ok, true);

      const editCalls = providerCalls(env.MOCK_CALL_LOG).filter(c => c.provider === 'openai').slice(before);
      assert.ok(editCalls.length >= 1, 'the edit really generated a new image');
      editCalls.forEach(c => {
        assert.equal(c.model, SUPPORT, 'Workplace edits never move onto the premium model');
        assert.equal(c.quality, 'medium', 'Workplace edits never move onto high quality');
      });
      const imageOps = edit.body.appliedOperations.filter(o => o.action === 'regenerate-image');
      assert.equal(imageOps.length, 1);
      assert.equal(imageOps[0].model, SUPPORT);
      assert.equal(imageOps[0].creditsCharged, 1, 'charged the support image price, not the premium one');
    } finally { await server.stop(); }
    fs.rmSync(dir, { recursive: true, force: true });
  });
}
