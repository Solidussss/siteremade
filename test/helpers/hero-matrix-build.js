'use strict';
// Builds one fixture business through the REAL client code (script.js in a
// vm, premium-core.js loaded as on the page), resolves every planned image
// against a MOCKED /api/generate-image (test/helpers/mock-image.js -- no
// provider call of any kind; every request is recorded), and returns the
// project plus what was requested. Shared by the hero tests and the browser
// review so both look at exactly the same generations.
const { loadClient, fundedProviderStatus, buildProject } = require('./load-client');
const { mockPng } = require('./mock-image');

async function buildHeroFixture(fixture, opts = {}) {
  const requests = [];
  const client = loadClient({
    fetchHandler(url, options) {
      if (url === '/api/generate-image') {
        const body = JSON.parse(options.body);
        requests.push(body);
        return { ok: true, dataUrl: mockPng(body.prompt, body.aspectRatio), creditsCharged: 1, creditsRemaining: 30 };
      }
      return new Promise(() => {}); // nothing else may be called
    },
  });
  const providerStatus = opts.providerStatus === undefined ? fundedProviderStatus() : opts.providerStatus;
  const { proj, usedClaude } = buildProject(client, fixture.text, { claudePlanRaw: fixture.plan || null, providerStatus, credits: opts.credits == null ? 40 : opts.credits, seed: opts.seed || 0 });
  client.ctx.__fixtureProj = proj;
  if (providerStatus && providerStatus.configured) await client.run('(project = window.__fixtureProj, resolveImagePlanAssets(project))');
  else client.run('project = window.__fixtureProj');
  const category = client.run(`categories[${JSON.stringify(proj.business.categoryKey)}]`);
  return { client, proj, category, usedClaude, requests, heroHtml: () => client.ctx.renderHero(proj, category) };
}

module.exports = { buildHeroFixture };
