'use strict';
// PAID PROVIDERS ARE PRODUCTION / CUSTOMER RESOURCES ONLY (lib/paid-providers.js). A development or test environment
// cannot fall through into a real Anthropic, SerpApi, Higgsfield or OpenAI call: keys are handed out only in
// production (or with the explicit ALLOW_PAID_PROVIDER_CALLS=true), a request to a paid host is refused at the network
// edge when calls are off, and only the in-process test harness (which answers every provider itself) can run "mock".
const test = require('node:test');
const assert = require('node:assert/strict');
const PP = require('../lib/paid-providers');

const KEYS = { ANTHROPIC_API_KEY: 'sk-ant-x', SERPAPI_API_KEY: 'serp-x', HIGGSFIELD_API_KEY: 'hf-id:hf-secret', OPENAI_API_KEY: 'sk-x' };
const noMock = {};

test('off by default outside production -- whatever keys a machine has', () => {
  for (const env of [Object.assign({}, KEYS), Object.assign({ NODE_ENV: 'development' }, KEYS), Object.assign({ NODE_ENV: 'test' }, KEYS)]) {
    assert.equal(PP.mode(env, noMock), 'off');
    for (const n of ['anthropic', 'serpapi', 'higgsfield', 'openai']) { assert.equal(PP.allowed(n, env, noMock), false); assert.equal(PP.key(n, env, noMock), ''); }
  }
});
test('production (NODE_ENV=production or Railway\'s own variables) is live; an explicit false switches it off; ALLOW_PAID_PROVIDER_CALLS=true is the only override elsewhere', () => {
  assert.equal(PP.mode(Object.assign({ NODE_ENV: 'production' }, KEYS), noMock), 'live');
  assert.equal(PP.mode(Object.assign({ RAILWAY_ENVIRONMENT_NAME: 'production' }, KEYS), noMock), 'live');
  assert.equal(PP.key('higgsfield', Object.assign({ RAILWAY_PROJECT_ID: 'p' }, KEYS), noMock), 'hf-id:hf-secret');
  assert.equal(PP.mode(Object.assign({ NODE_ENV: 'production', ALLOW_PAID_PROVIDER_CALLS: 'false' }, KEYS), noMock), 'off');
  assert.equal(PP.mode(Object.assign({ ALLOW_PAID_PROVIDER_CALLS: 'true' }, KEYS), noMock), 'live');
  assert.equal(PP.mode(Object.assign({ ALLOW_PAID_PROVIDER_CALLS: 'yes' }, KEYS), noMock), 'off', 'only the exact word true');
  // production without a key: unavailable, never a crash, never another provider
  assert.equal(PP.allowed('higgsfield', { NODE_ENV: 'production' }, noMock), false);
  assert.match(PP.status({ NODE_ENV: 'production' }, noMock).providers.higgsfield.reason, /HIGGSFIELD_API_KEY is not set/);
});
test('mock exists only inside the test harness (a process marker, never an environment variable)', () => {
  assert.equal(PP.mode(Object.assign({ SITEREMADE_PROVIDER_MODE: 'mock', MOCK: '1' }, KEYS), noMock), 'off');
  assert.equal(PP.mode(KEYS, { __SITEREMADE_PROVIDER_MOCK: true }), 'mock');
  assert.equal(PP.mode(KEYS, { __SITEREMADE_PROVIDER_MOCK: 'true' }), 'off', 'only the real marker');
});
test('status never contains a key or any part of one', () => {
  const s = JSON.stringify(PP.status(Object.assign({ NODE_ENV: 'production' }, KEYS), noMock));
  for (const v of Object.values(KEYS)) for (const part of v.split(':')) assert.ok(!s.includes(part));
});
test('the network edge: with paid calls off, a request to any paid host is refused before it leaves the process; other hosts pass', async () => {
  const sent = [];
  const g = { fetch: async url => { sent.push(String(url)); return { ok: true }; } };
  PP.installFetchGuard(KEYS, g);
  for (const u of ['https://api.anthropic.com/v1/messages', 'https://serpapi.com/search?q=x', 'https://api.higgsfield.ai/wan/v2.7/image-to-video', 'https://api.openai.com/v1/images/generations']) {
    await assert.rejects(g.fetch(u, { method: 'POST' }), e => e.code === 'PAID_PROVIDER_BLOCKED');
  }
  assert.deepEqual(sent, [], 'not one paid request was sent');
  await g.fetch('https://en.wikipedia.org/api/rest_v1/page/summary/X');
  assert.deepEqual(sent, ['https://en.wikipedia.org/api/rest_v1/page/summary/X']);
  // live: the same guard lets paid calls through (production behaviour is unchanged)
  const g2 = { fetch: async url => { sent.push(String(url)); return { ok: true }; } };
  PP.installFetchGuard(Object.assign({ NODE_ENV: 'production' }, KEYS), g2);
  await g2.fetch('https://api.anthropic.com/v1/messages');
  assert.equal(sent[sent.length - 1], 'https://api.anthropic.com/v1/messages');
});
test('the server reads every paid key through the guard (no direct process.env reads of a provider key)', () => {
  const fs = require('fs'); const path = require('path');
  const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  assert.doesNotMatch(src, /process\.env\.(ANTHROPIC_API_KEY|OPENAI_API_KEY|SERPAPI_API_KEY|HIGGSFIELD_API_KEY)/);
  assert.match(src, /paidProviders\.installFetchGuard\(\)/);
  for (const f of ['lib/media/higgsfield.js', 'lib/media/premium-media.js', 'lib/creative/serpapi.js']) assert.doesNotMatch(fs.readFileSync(path.join(__dirname, '..', f), 'utf8'), /process\.env\.[A-Z_]*API_KEY/, f);
  // and the browser bundles never mention a provider key variable
  for (const f of ['creative-core.js', 'creative.js', 'script.js', 'index.html']) assert.doesNotMatch(fs.readFileSync(path.join(__dirname, '..', f), 'utf8'), /HIGGSFIELD_API_KEY|SERPAPI_API_KEY|ANTHROPIC_API_KEY/, f);
});
