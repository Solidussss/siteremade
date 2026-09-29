'use strict';
// A purchased/exported site must show the images its owner paid for -- and
// only the ones that belong to the current plan. Both used to be broken:
// lib/site-render.js never rendered generated images at all, and the server's
// save whitelist dropped the image plan it needed to match them.
// The Business generator no longer generates pictures (lib/premium/visual-mode.js), so these images are the ones a
// project saved before that rule already has: they must still render in the preview and the export.
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadClient, fundedProviderStatus, buildProject, seedSavedImages } = require('./helpers/load-client');
const { mockPng } = require('./helpers/mock-image');
const projectStore = require('../lib/project-store');
const siteRender = require('../lib/site-render');

const TEXT = 'Glow Theory is an online skincare store in Vancouver selling gentle cleansers, serums and moisturizers for sensitive skin.';

// A project exactly as the server stores it: built by the real client, with the images a project saved before the
// starter-visual rule carries, then passed through the real save validator.
async function savedProject({ breakHero } = {}) {
  const c = loadClient({ fetchHandler: () => new Promise(() => {}) });
  const { proj } = buildProject(c, TEXT, { providerStatus: fundedProviderStatus() });
  seedSavedImages(proj, mockPng);
  c.ctx.__p = proj;
  await c.run('(project = window.__p, resolveImagePlanAssets(project))');
  assert.equal(c.fetchCalls.filter(x => x.url === '/api/generate-image').length, 0, 'no picture is ever requested for a Business site');
  c.run('renderProject(project)');
  if (breakHero) proj.assets.generated.hero = { ...proj.assets.generated.hero, status: 'error', dataUrl: undefined };
  const saved = projectStore.validateDirectionsState({ directions: [JSON.parse(JSON.stringify(proj))], activeDirectionIndex: 0 }).normalized.directions[0];
  const category = siteRender.categoryFor(saved);
  return { client: c, proj, saved, category };
}

test('the image plan survives a save (it was silently stripped by the whitelist)', async () => {
  const { proj, saved } = await savedProject();
  assert.ok(saved.imagePlan.length > 0);
  assert.equal(saved.imagePlan.length, proj.imagePlan.length);
  saved.imagePlan.forEach(e => {
    assert.ok(e.slot && e.cacheKey && e.sourceType);
    assert.equal(e.prompt, undefined, 'prompts are not duplicated into the stored plan');
  });
});

test('exported pages render every paid image that belongs to the current plan', async () => {
  const { saved, category } = await savedProject();
  const ready = Object.entries(saved.assets.generated).filter(([, g]) => g.status === 'ready');
  assert.ok(ready.length >= 2);
  const hero = siteRender.renderHero(saved, category);
  assert.ok(hero.includes(`src="${saved.assets.generated.hero.dataUrl}"`), 'the paid hero image is on the exported page');
});

test('an image generated for a DIFFERENT plan is never shown on the exported page', async () => {
  const { saved, category } = await savedProject();
  const stale = saved.assets.generated.hero.dataUrl;
  saved.imagePlan.find(e => e.slot === 'hero').cacheKey = 'a-newer-plan';
  const hero = siteRender.renderHero(saved, category);
  assert.ok(!hero.includes(stale), 'a stale image leaked onto the exported site');
});

test('a failed generation renders the honest no-image treatment, not a photo-sized empty box', async () => {
  const { saved, category } = await savedProject();
  const productSlot = saved.imagePlan.find(e => e.role === 'product');
  saved.assets.generated[productSlot.slot] = { cacheKey: productSlot.cacheKey, status: 'error' };
  const html = siteRender.renderSectionHTML(saved, { id: 'p', type: 'productShowcase', copy: {} }, category);
  assert.ok(html.includes('product-panel-wordmark'), 'no-image product composition');
  assert.ok(!html.includes('data-funded="true"'));
});

test('preview/export parity: the live renderer and the export renderer agree on which image a slot shows', async () => {
  const { client, proj, saved } = await savedProject();
  const exportedHero = siteRender.renderHero(saved, siteRender.categoryFor(saved));
  const previewHero = client.run(`renderVisualSlot(project, 'hero', project.design.dimensions.imagery, null)`);
  const src = proj.assets.generated.hero.dataUrl;
  assert.ok(previewHero.includes(src) && exportedHero.includes(src));
});
