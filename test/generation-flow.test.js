'use strict';
// The real top-level orchestration (script.js runGeneration: planner call ->
// use-or-fall-back decision -> build -> paid images -> admit the direction),
// with only the network mocked. Pins that every path produces a real,
// correctly-named direction with its images, and that WHICH engine built it
// (and why) is reported to private diagnostics.
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadClient, fundedProviderStatus } = require('./helpers/load-client');
const { createMockImageServer, flush } = require('./helpers/mock-image-server');
const { FIZZWELL_TEXT, FIZZWELL_PLAN } = require('./fixtures/businesses');

async function generate(planResponse) {
  const server = createMockImageServer();
  const client = loadClient({
    fetchHandler(url, options) {
      if (url === '/api/plan-website') return planResponse;
      const response = server.handle(url, options);
      setTimeout(() => server.releaseAll(), 5); // images "take a moment", then arrive
      return response;
    },
  });
  client.ctx.__siteremadeImageProvider = fundedProviderStatus();
  client.run(`currentAccount = { id: 'acct_test', email: 'x@example.com' }; latestCredits = { remaining: 40 };
    if (resolveAuthReady) { resolveAuthReady(); resolveAuthReady = null; }`);
  await client.run(`runGeneration(${JSON.stringify(FIZZWELL_TEXT)})`);
  await flush(20);
  const direction = JSON.parse(JSON.stringify(client.run('directions[0]') || null));
  const outcomes = server.events.filter(e => e.kind === 'client_outcome');
  const planRequest = JSON.parse(client.fetchCalls.find(c => c.url === '/api/plan-website').options.body);
  return { direction, outcomes, planRequest, server };
}

test('AI plan used: the direction is built from it and "plan_used" is reported with the same generationId the plan request carried', async () => {
  const { direction, outcomes, planRequest } = await generate({ ok: true, plan: FIZZWELL_PLAN, creditsRemaining: 8 });
  assert.equal(direction.meta.planSource, 'anthropic');
  assert.equal(direction.business.name, 'Fizzwell');
  assert.ok(Object.values(direction.assets.generated).filter(g => g.status === 'ready').length >= 2, 'paid images are on the admitted direction');
  assert.equal(outcomes.length, 1);
  assert.equal(outcomes[0].outcome, 'plan_used');
  assert.ok(planRequest.generationId && outcomes[0].generationId === planRequest.generationId);
});

test('planner unusable: deterministic fallback still produces a correctly named site, and the fallback + reason is reported', async () => {
  const { direction, outcomes } = await generate({ ok: false, message: 'The AI planner returned something unusable this time.', creditsRemaining: 10 });
  assert.equal(direction.meta.planSource, 'deterministic');
  assert.equal(direction.business.name, 'Fizzwell', 'not "Health & Wellness Studio"');
  assert.equal(direction.business.categoryKey, 'retail');
  assert.deepEqual(direction.business.offerings, ['Peach', 'Cherry', 'Citrus']);
  assert.equal(outcomes[0].outcome, 'plan_fallback');
  assert.equal(outcomes[0].reason, 'server_not_ok');
});

test('server said ok but the client rejected the plan: reported as plan_rejected_by_client (the server alone can never see this)', async () => {
  const { direction, outcomes } = await generate({ ok: true, plan: { ...FIZZWELL_PLAN, pages: [] }, creditsRemaining: 8 });
  assert.equal(direction.meta.planSource, 'deterministic');
  assert.equal(outcomes[0].outcome, 'plan_fallback');
  assert.equal(outcomes[0].reason, 'plan_rejected_by_client');
});
