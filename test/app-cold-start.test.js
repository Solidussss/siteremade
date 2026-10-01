'use strict';
// THE CLIENT APP'S COLD START, from the builder's side of the bridge: an old failed Creative draft, then a Creative
// Showcase saved, purchased, given its three premium videos, saved and published (test/helpers/showcase-purchase.js).
// Then the session ends. A brand-new caller -- only the person's bearer token, no cookie, nothing remembered -- asks the
// bridge exactly what the Client App asks on a fresh page load, and must get the purchased website back: listed, owned,
// the builder's own default (not the failed draft, even though that was updated last), previewed and downloaded from the
// published revision with all three MP4s. Every paid provider is a mock; $0 of real spend.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { startServer, client } = require('./helpers/server-process');
const { buildColdStartScenario, scenarioEnv, paidCalls, readZip } = require('./helpers/showcase-purchase');

const OWNER = 'Bearer test-access-token-owner';
const OTHER = 'Bearer test-access-token-other';
let ctx = null;
async function setup() {
  if (ctx) return ctx;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sr-cold-start-'));
  const env = scenarioEnv(dir, path);
  const server = await startServer(env);
  const scenario = await buildColdStartScenario({ port: server.port, env });
  // a second, unrelated builder account (signed in once, so the bridge knows it)
  assert.equal((await client(server.port)('POST', '/api/identity/supabase/session', { supabaseAccessToken: 'test-access-token-other' })).status, 200);
  // E. the session ends: everything below is a fresh caller with only the bearer token
  const bridge = async (url, auth = OWNER) => { const r = await fetch(`http://127.0.0.1:${server.port}${url}`, { headers: { authorization: auth } }); return { status: r.status, headers: r.headers, buf: Buffer.from(await r.arrayBuffer()) }; };
  const bridgeJson = async (url, auth) => { const r = await bridge(url, auth); return { status: r.status, body: JSON.parse(r.buf.toString('utf8')) }; };
  ctx = { server, env, dir, scenario, bridge, bridgeJson };
  return ctx;
}
test.after(async () => { if (ctx) { await ctx.server.stop(); fs.rmSync(ctx.dir, { recursive: true, force: true }); } });

test('cold start: both websites are listed; the Showcase is owned; the newer failed draft does not mask it', async () => {
  const { scenario: s, bridgeJson } = await setup();
  const r = await bridgeJson('/api/app-bridge/websites');
  assert.equal(r.status, 200);
  const ids = r.body.websites.map(w => w.projectId);
  assert.ok(ids.includes(s.failedDraftId) && ids.includes(s.showcaseId), 'both saved websites are listed');
  assert.equal(ids[0], s.failedDraftId, 'the failed draft really is the most recently updated (the masking case)');
  const show = r.body.websites.find(w => w.projectId === s.showcaseId), failed = r.body.websites.find(w => w.projectId === s.failedDraftId);
  assert.equal(show.mode, 'creative'); assert.equal(show.status, 'purchased'); assert.equal(show.isPurchased, true); assert.equal(show.hasPurchaseSnapshot, true);
  assert.equal(show.revision, s.publishedRevision); assert.equal(show.hasUnpublishedChanges, false, 'the video revision was published');
  assert.equal(failed.status, 'draft'); assert.equal(failed.isPurchased, false);
  // the builder's default for the app is the purchase, never the newer failed draft
  const canonical = await bridgeJson('/api/app-bridge/website');
  assert.equal(canonical.body.projectId, s.showcaseId); assert.equal(canonical.body.status, 'purchased');
  assert.equal(canonical.body.publishedRevision, s.publishedRevision); assert.equal(canonical.body.purchasedRevision, s.purchasedRevision);
  // what the app may connect: purchases only
  const candidates = await bridgeJson('/api/app-bridge/website/candidates');
  assert.deepEqual(candidates.body.candidates.map(c => c.projectId), [s.showcaseId]);
  assert.equal((await bridgeJson(`/api/app-bridge/website/${s.showcaseId}`)).body.projectId, s.showcaseId);
});

test('cold start: the purchased preview and the download are the PUBLISHED revision, with all three premium MP4s', async () => {
  const { scenario: s, bridge } = await setup();
  assert.ok(s.publishedRevision > s.purchasedRevision, 'the videos arrived after the purchase, in a later revision');
  const preview = await bridge(`/api/app-bridge/website/${s.showcaseId}/preview`);
  assert.equal(preview.status, 200); assert.equal(preview.headers.get('x-siteremade-preview'), 'published');
  const html = preview.buf.toString('utf8');
  // the preview is one self-contained document: each clip inlined as a playable video/mp4 (never octet-stream)
  const srcs = [...html.matchAll(/<video class="ly-vid"[^>]*\ssrc="([^"]+)"/g)].map(m => m[1]);
  assert.ok(srcs.length >= 3, `the premium moments have videos (${srcs.length})`);
  assert.ok(srcs.every(v => v.startsWith('data:video/mp4;base64,')), 'inlined as video/mp4');
  assert.equal(new Set(srcs).size, 3, 'all three different clips play in the preview');
  for (const role of ['hero', 'takeover', 'payoff']) assert.match(html, new RegExp(`<section[^>]*data-pv="${role}"`), `the ${role} moment`);
  const dl = await bridge(`/api/app-bridge/website/${s.showcaseId}/download`);
  assert.equal(dl.status, 200, dl.buf.toString('utf8').slice(0, 300)); assert.equal(dl.headers.get('content-type'), 'application/zip');
  const files = readZip(dl.buf);
  const manifest = JSON.parse(files.get('export-manifest.json').toString('utf8'));
  assert.equal(manifest.projectId, s.showcaseId); assert.equal(manifest.mode, 'creative');
  assert.equal(manifest.exportedRevision, s.publishedRevision, 'the handoff is the published revision, not the purchase snapshot');
  const mp4s = [...files.keys()].filter(n => n.endsWith('.mp4'));
  assert.equal(mp4s.length, 3, `three MP4s in the handoff: ${mp4s}`);
  for (const ref of s.videoRefs) assert.ok(files.has(`assets/${ref}.mp4`), `assets/${ref}.mp4 shipped`);
  const index = files.get('index.html').toString('utf8');
  for (const ref of s.videoRefs) assert.ok(index.includes(`assets/${ref}.mp4`), 'the page plays the shipped file');
  // the failed draft has no purchased handoff
  assert.equal((await bridge(`/api/app-bridge/website/${s.failedDraftId}/download`)).status, 403);
});

test('a project id is never authorization: another account gets nothing for the Showcase', async () => {
  const { scenario: s, bridge, bridgeJson } = await setup();
  assert.equal((await bridgeJson(`/api/app-bridge/website/${s.showcaseId}`, OTHER)).status, 404);
  assert.equal((await bridge(`/api/app-bridge/website/${s.showcaseId}/preview`, OTHER)).status, 404);
  assert.notEqual((await bridge(`/api/app-bridge/website/${s.showcaseId}/download`, OTHER)).status, 200);
  assert.ok(!(await bridgeJson('/api/app-bridge/websites', OTHER)).body.websites.some(w => w.projectId === s.showcaseId));
});

test('$0: every paid call was answered by a mock -- three premium video submits, nothing sent twice', async () => {
  const { env } = await setup();
  const calls = paidCalls(env);
  const submits = calls.filter(c => c.provider === 'higgsfield' && /image-to-video$/.test(c.endpoint || ''));
  assert.equal(submits.length, 3, 'one mocked submit per premium moment');
  assert.ok(submits.every(c => c.auth === true), 'with the test-only key');
  // the server runs with the mock marker (test/helpers/run-server.js); lib/paid-providers.js refuses a real provider otherwise
  assert.ok(calls.every(c => ['anthropic', 'openai', 'higgsfield', 'serpapi'].includes(c.provider)));
});
