'use strict';
// Image delivery regressions, exercised through the REAL client code
// (script.js in a vm: buildImagePlan / resolveImagePlanAssets /
// renderVisualSlot) talking to the REAL lib/image-delivery.js. Only the paid
// provider call is mocked -- and held open on purpose, so the plan can change
// while a request is in flight. No real API call is possible here.
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadClient, fundedProviderStatus, buildProject } = require('./helpers/load-client');
const { createMockImageServer, flush } = require('./helpers/mock-image-server');

const TEXT = 'Glow Theory is an online skincare store in Vancouver selling gentle cleansers, serums and moisturizers for sensitive skin.';

function setup(handlerOverride) {
  const server = createMockImageServer();
  const client = loadClient({ fetchHandler: (url, options) => (handlerOverride ? handlerOverride(server, url, options) : server.handle(url, options)) });
  const { proj } = buildProject(client, TEXT, { providerStatus: fundedProviderStatus() });
  client.ctx.__proj = proj;
  client.run('project = window.__proj; renderProject(project);');
  const funded = proj.imagePlan.filter(e => e.sourceType === 'generated');
  return { server, client, proj, funded };
}
const heroHtml = client => client.run(`renderVisualSlot(project, 'hero', project.design.dimensions.imagery, null)`);
const generated = (client, slot) => client.run(`project.assets.generated[${JSON.stringify(slot)}]`);
const planEntry = (client, slot) => client.run(`project.imagePlan.find(e => e.slot === ${JSON.stringify(slot)})`);
function changePlan(client, categoryKey) {
  // Exactly what the editor's Industry select does (script.js industrySelect
  // listener): new categoryKey -> new cacheKeys for every slot.
  client.run(`project.business.categoryKey = ${JSON.stringify(categoryKey)}; renderProject(project); window.__pending = resolveImagePlanAssets(project);`);
}
async function finish(server, client) { server.releaseAll(); await flush(10); }

test('the client sends a stable requestKey (project :: slot :: plan cacheKey) with every paid image request', async () => {
  const { server, client, proj, funded } = setup();
  assert.ok(funded.length >= 2, 'fixture should fund several slots');
  client.run('window.__pending = resolveImagePlanAssets(project)');
  await flush();
  const sent = client.fetchCalls.filter(c => c.url === '/api/generate-image').map(c => JSON.parse(c.options.body));
  assert.equal(sent.length, funded.length);
  sent.forEach(body => {
    const entry = funded.find(e => body.requestKey === `${proj.meta.id}::${e.slot}::${e.cacheKey}`);
    assert.ok(entry, `requestKey ${body.requestKey} should identify one funded slot of the current plan`);
  });
  await finish(server, client);
});

test('an image that arrives after the plan changed is never shown for the new plan (and the discard is reported)', async () => {
  const { server, client, proj } = setup();
  const originalCategory = proj.business.categoryKey;
  client.run('window.__pending = resolveImagePlanAssets(project)');
  await flush();
  const originalHeroKey = planEntry(client, 'hero').cacheKey;
  const firstWave = server.paidCalls.length;

  changePlan(client, originalCategory === 'fashion' ? 'retail' : 'fashion');
  await flush();
  const newHeroKey = planEntry(client, 'hero').cacheKey;
  assert.notEqual(newHeroKey, originalHeroKey, 'changing the industry must produce a new plan identity');

  // Release ONLY the original (now stale) paid calls.
  for (let i = 0; i < firstWave; i++) server.release(i, `data:image/png;base64,U1RBTEUt${i}`);
  await flush(10);

  assert.equal(generated(client, 'hero').cacheKey, newHeroKey, 'the slot belongs to the new plan');
  assert.equal(generated(client, 'hero').status, 'pending', 'still waiting for the NEW plan\'s image');
  assert.ok(!heroHtml(client).includes('U1RBTEUt'), 'the stale image must never be rendered for the new plan');
  const superseded = server.events.filter(e => e.kind === 'client_outcome' && e.outcome === 'image_superseded');
  assert.equal(superseded.length, firstWave, 'every discarded paid result is reported to diagnostics');
  await finish(server, client);
});

test('a paid image discarded because the plan changed is recovered at no cost when the plan comes back', async () => {
  const { server, client, proj } = setup();
  const originalCategory = proj.business.categoryKey;
  client.run('window.__pending = resolveImagePlanAssets(project)');
  await flush();
  const firstWave = server.paidCalls.length;
  changePlan(client, originalCategory === 'fashion' ? 'retail' : 'fashion');
  await flush();
  for (let i = 0; i < firstWave; i++) server.release(i, `data:image/png;base64,T1JJR0lOQUwt${i}`);
  await flush(10);
  const paidBeforeRevert = server.paidCalls.length;

  changePlan(client, originalCategory); // back to the original plan
  await flush(10);

  assert.equal(server.paidCalls.length, paidBeforeRevert, 'returning to a plan whose images were already paid for makes NO new paid call');
  assert.equal(generated(client, 'hero').status, 'ready');
  assert.ok(heroHtml(client).includes('T1JJR0lOQUwt'), 'the original paid hero image is shown again');
  assert.ok(server.events.some(e => e.kind === 'image' && e.outcome === 'replayed'), 'served by replay');
  await finish(server, client);
});

test('plan changes and changes back while the original request is still in flight: the original result is applied, not dropped', async () => {
  const { server, client, proj } = setup();
  const originalCategory = proj.business.categoryKey;
  client.run('window.__pending = resolveImagePlanAssets(project)');
  await flush();
  const firstWave = server.paidCalls.length;
  changePlan(client, originalCategory === 'fashion' ? 'retail' : 'fashion');
  await flush();
  changePlan(client, originalCategory); // revert BEFORE anything returns
  await flush();
  const originalHeroKey = planEntry(client, 'hero').cacheKey;

  for (let i = 0; i < firstWave; i++) server.release(i, `data:image/png;base64,Rk9SRVZFUi0${i}`);
  await flush(10);

  assert.equal(generated(client, 'hero').cacheKey, originalHeroKey);
  assert.equal(generated(client, 'hero').status, 'ready', 'before this fix the arriving image was thrown away as "superseded"');
  assert.ok(heroHtml(client).includes('Rk9SRVZFUi0'));
  await finish(server, client);
});

test('a dropped connection is retried once and recovered from the SAME paid call -- never paid twice', async () => {
  const attempts = new Map();
  const { server, client, funded } = setup((srv, url, options) => {
    if (url !== '/api/generate-image') return srv.handle(url, options);
    const key = JSON.parse(options.body).requestKey;
    const n = (attempts.get(key) || 0) + 1;
    attempts.set(key, n);
    if (n === 1) {
      // The server keeps working (and paying) after the browser's connection
      // drops -- the exact shape of the original lost-image bug.
      srv.handle(url, options);
      return Promise.reject(Object.assign(new Error('connection dropped'), { name: 'AbortError' }));
    }
    return srv.handle(url, options);
  });
  client.run('window.__pending = resolveImagePlanAssets(project)');
  await flush(10);
  assert.equal(server.paidCalls.length, funded.length, 'one paid call per slot so far');
  server.releaseAll();
  await flush(10);

  assert.equal(server.paidCalls.length, funded.length, 'the retry joined/replayed the original call -- no second charge');
  funded.forEach(e => assert.equal(generated(client, e.slot).status, 'ready', `${e.slot} recovered`));
  assert.ok([...attempts.values()].every(n => n === 2), 'exactly one retry per slot');
});

test('a genuine provider failure is shown honestly and is NOT retried into a second charge', async () => {
  const { server, client } = setup();
  client.run('window.__pending = resolveImagePlanAssets(project)');
  await flush();
  const heroCall = server.paidCalls.findIndex(c => c.args.requestKey && c.args.requestKey.includes('::hero::'));
  server.fail(heroCall);
  await flush(10);
  assert.equal(generated(client, 'hero').status, 'error');
  const heroRequests = client.fetchCalls.filter(c => c.url === '/api/generate-image' && JSON.parse(c.options.body).requestKey.includes('::hero::'));
  assert.equal(heroRequests.length, 1);
  await finish(server, client);
});
