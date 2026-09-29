'use strict';
// The Business generator's image pipeline, through the REAL client code (script.js in a vm: buildImagePlan /
// resolveImagePlanAssets / renderVisualSlot). Business pictures are the owner's uploads and SiteRemade's
// starter/mockup visuals (lib/premium/visual-mode.js): nothing here may ever reach POST /api/generate-image -- not on
// a fresh build, not when the plan changes, and not for a plan saved before that rule still marking a slot
// 'generated'. Pictures a project already has keep showing wherever they belong to the current plan.
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadClient, fundedProviderStatus, premiumProviderStatus, buildProject, seedSavedImages } = require('./helpers/load-client');
const { mockPng } = require('./helpers/mock-image');

const TEXT = 'Glow Theory is an online skincare store in Vancouver selling gentle cleansers, serums and moisturizers for sensitive skin.';

function setup(providerStatus) {
  const client = loadClient({ fetchHandler: url => (url === '/api/generate-image' ? { __status: 500, ok: false } : new Promise(() => {})) });
  const { proj } = buildProject(client, TEXT, { providerStatus: providerStatus || fundedProviderStatus(), credits: 500 });
  client.ctx.__proj = proj;
  client.run('project = window.__proj; renderProject(project);');
  return { client, proj };
}
const imageRequests = client => client.fetchCalls.filter(c => c.url === '/api/generate-image').length;
const heroHtml = client => client.run(`renderVisualSlot(project, 'hero', project.design.dimensions.imagery, null)`);

for (const [label, status] of [['legacy planner', () => fundedProviderStatus()], ['premium planner', () => premiumProviderStatus()]]) {
  test(`${label}: a funded provider and a large credit balance still plan no generated image, and resolving makes no request`, async () => {
    const { client, proj } = setup(status());
    assert.ok(proj.imagePlan.length > 0);
    assert.equal(proj.imagePlan.filter(e => e.sourceType === 'generated').length, 0);
    assert.ok(proj.imagePlan.every(e => !e.creditCost && !e.model), 'no image credit or model on any slot');
    await client.run('resolveImagePlanAssets(project)');
    assert.equal(imageRequests(client), 0);
  });
}

test('changing the plan (the editor\'s Industry select) and changing it back never requests an image; a picture the project already had comes back with its plan', async () => {
  const { client, proj } = setup();
  seedSavedImages(proj, mockPng, ['hero']);
  const original = proj.assets.generated.hero.dataUrl;
  const category = proj.business.categoryKey;
  client.run('renderProject(project)');
  assert.ok(heroHtml(client).includes(original), 'a saved picture for the current plan is shown');
  client.run(`project.business.categoryKey = 'restaurant'; renderProject(project); window.__p1 = resolveImagePlanAssets(project);`);
  await client.run('window.__p1');
  assert.ok(!heroHtml(client).includes(original), 'never shown for a different plan');
  client.run(`project.business.categoryKey = ${JSON.stringify(category)}; renderProject(project); window.__p2 = resolveImagePlanAssets(project);`);
  await client.run('window.__p2');
  assert.ok(heroHtml(client).includes(original), 'shown again, at no cost, when its plan comes back');
  assert.equal(imageRequests(client), 0);
});

test('a plan saved before the starter-visual rule, still marking slots "generated", is settled without any request', async () => {
  const { client, proj } = setup();
  // what an old saved plan looks like: a slot planned for a paid image that never resolved
  client.run(`project.imagePlan = project.imagePlan.map((e, i) => i === 0 ? Object.assign({}, e, { sourceType: 'generated', model: 'gpt-image-1', quality: 'high', creditCost: 2 }) : e); delete project.assets.generated[project.imagePlan[0].slot];`);
  await client.run('resolveImagePlanAssets(project)');
  const slot = client.run('project.imagePlan[0].slot');
  assert.equal(client.run(`project.assets.generated[${JSON.stringify(slot)}].status`), 'error', 'settled as its designed/starter visual');
  assert.equal(client.run('imagePlanIsTerminal(project)'), true);
  assert.equal(imageRequests(client), 0);
  // and the next render re-plans it as a starter/designed slot
  client.run('renderProject(project)');
  assert.equal(proj.imagePlan.filter(e => e.sourceType === 'generated').length, 0);
});
