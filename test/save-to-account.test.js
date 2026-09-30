'use strict';
// "Save to account" in the REAL builder client (script.js, loaded in a VM by test/helpers/load-client.js) against a
// small stand-in for the server's project routes (POST/PUT/GET /api/projects -- same contract: sourceLocalId makes a
// create idempotent, expectedRevision guards every update). Pins the save lifecycle:
//   - a website generated while signed in is saved to the account once, and "Saved to your account." only appears
//     after the server has stored it;
//   - edits update that same project;
//   - "Try another direction" stays in the same project;
//   - a FRESH website (a different description) becomes a NEW project -- it never overwrites the open one;
//   - after a refresh, the saved list and the last-project pointer lead to the right project.
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadClient } = require('./helpers/load-client');
const { flush } = require('./helpers/mock-image-server');

const A = 'Petal & Stem is a florist in Portland making wedding flowers, bouquets and same-day delivery.';
const B = 'Summit Roofing repairs and replaces residential roofs in Calgary, with free inspections.';

function fakeProjectServer() {
  const projects = new Map(); const calls = []; let n = 0; let holdCreate = null;
  const summary = p => ({ id: p.id, name: p.name, status: p.status, revision: p.revision, updatedAt: p.updatedAt });
  function handle(url, options) {
    const method = (options.method || 'GET').toUpperCase();
    const body = options.body ? JSON.parse(options.body) : null;
    if (url === '/api/plan-website') return { ok: false, message: 'planner off in this test', creditsRemaining: 30 }; // the deterministic engine builds it
    if (url === '/api/generation-diagnostics' || url === '/api/credits') return { ok: true };
    if (!url.startsWith('/api/projects')) return new Promise(() => {});
    calls.push({ method, url, body });
    if (url === '/api/projects' && method === 'POST') {
      const create = () => {
        const existing = [...projects.values()].find(p => body.sourceLocalId && p.sourceLocalId === body.sourceLocalId);
        if (existing) return { ok: true, project: summary(existing), migrated: true, alreadyExisted: true };
        const p = { id: `proj_${++n}`, name: body.name, status: 'draft', revision: 1, directionsState: body.directionsState, sourceLocalId: body.sourceLocalId, updatedAt: new Date(Date.now() + n).toISOString() };
        projects.set(p.id, p);
        return { ok: true, project: summary(p), migrated: true, alreadyExisted: false };
      };
      return holdCreate ? holdCreate.then(create) : create();
    }
    if (url === '/api/projects' && method === 'GET') return { ok: true, projects: [...projects.values()].map(summary) };
    const id = decodeURIComponent(url.split('/')[3] || '');
    const p = projects.get(id);
    if (!p) return { ok: false, __status: 404 };
    if (method === 'GET') return { ok: true, project: { ...summary(p), directionsState: p.directionsState } };
    if (method === 'PUT') {
      if (Number.isInteger(body.expectedRevision) && body.expectedRevision !== p.revision) return { ok: false, reason: 'conflict', current: { ...summary(p), directionsState: p.directionsState } };
      Object.assign(p, { directionsState: body.directionsState, name: body.name || p.name, revision: p.revision + 1, updatedAt: new Date().toISOString() });
      return { ok: true, project: summary(p) };
    }
    return { ok: false };
  }
  return { handle, projects, calls, hold() { let release; holdCreate = new Promise(r => { release = r; }); return () => { holdCreate = null; release(); }; } };
}

function signedInClient(server, seed) {
  const client = loadClient({ fetchHandler: (url, options) => server.handle(url, options) });
  if (seed) Object.keys(seed).forEach(k => client.ctx.localStorage.setItem(k, seed[k]));
  client.run(`currentAccount = { id: 'acct_owner', email: 'owner@example.com' }; latestCredits = { remaining: 30 };
    if (resolveAuthReady) { resolveAuthReady(); resolveAuthReady = null; }`);
  return client;
}
const account = client => JSON.parse(JSON.stringify(client.run('window.__siteremadeAccount')));
const businessesIn = state => state.directions.map(d => d.source && d.source.text);
async function generate(client, text) { await client.run(`runGeneration(${JSON.stringify(text)})`); await flush(10); }

test('10/11. a website generated while signed in is saved once, "Saved" only after the server stored it, and edits update that same project', async () => {
  const server = fakeProjectServer();
  const client = signedInClient(server);
  const release = server.hold(); // the server takes its time storing it
  await generate(client, A);
  assert.equal(client.run('directions.length'), 1);
  assert.equal(account(client).autosaveState, 'saving', 'not "saved" before the server answered');
  assert.equal(client.run('accountSaveStatus.textContent === "Saved to your account."'), false);
  release(); await flush(10);
  const posts = server.calls.filter(c => c.method === 'POST');
  assert.equal(posts.length, 1, 'created once');
  const id = account(client).serverProjectId;
  assert.equal(id, 'proj_1'); assert.equal(account(client).autosaveState, 'saved');
  // an edit, then another: the same project, never a second create
  client.run('project.copy.headline = "Flowers for every wedding"; persistDirectionsSilently();');
  await client.run('flushServerAutosave()'); await flush(5);
  client.run('project.copy.sub = "Same-day delivery in Portland."; persistDirectionsSilently();');
  await client.run('flushServerAutosave()'); await flush(5);
  assert.equal(server.calls.filter(c => c.method === 'POST').length, 1, 'still one project');
  const puts = server.calls.filter(c => c.method === 'PUT');
  assert.ok(puts.length >= 2 && puts.every(c => c.url === `/api/projects/${id}`), 'every save updates the same project');
  const saved = server.projects.get(id);
  assert.equal(saved.revision, 1 + puts.length);
  assert.equal(saved.directionsState.directions[0].copy.headline, 'Flowers for every wedding');
});

test('13. "Try another direction" stays within the same project', async () => {
  const server = fakeProjectServer();
  const client = signedInClient(server);
  await generate(client, A);
  const id = account(client).serverProjectId;
  await generate(client, client.run('project.source.text'));
  await client.run('flushServerAutosave()'); await flush(5);
  assert.equal(client.run('directions.length'), 2, 'a second direction of the same website');
  assert.equal(account(client).serverProjectId, id);
  assert.equal(server.calls.filter(c => c.method === 'POST').length, 1, 'no new project');
  assert.equal(server.projects.get(id).directionsState.directions.length, 2);
  // typing the same description again is also "the same website"
  await generate(client, A);
  assert.equal(client.run('directions.length'), 3); assert.equal(account(client).serverProjectId, id);
});

test('12. a fresh website (a different description) becomes a NEW project and never overwrites the open one -- whose last edit is kept', async () => {
  const server = fakeProjectServer();
  const client = signedInClient(server);
  await generate(client, A);
  const first = account(client).serverProjectId;
  // an edit still waiting in the autosave debounce when the owner starts a different website
  client.run('project.copy.headline = "Our last word on weddings"; persistDirectionsSilently();');
  await generate(client, B);
  await client.run('flushServerAutosave()'); await flush(10);
  const second = account(client).serverProjectId;
  assert.ok(second && second !== first, 'synced to a new project');
  assert.equal(server.calls.filter(c => c.method === 'POST').length, 2);
  assert.notEqual(server.calls.filter(c => c.method === 'POST')[1].body.sourceLocalId, server.calls.filter(c => c.method === 'POST')[0].body.sourceLocalId);
  assert.equal(client.run('directions.length'), 1, 'the new website starts with its own first direction');
  // the first project: only ever the florist, with the edit that was pending
  const firstState = server.projects.get(first).directionsState;
  assert.deepEqual(businessesIn(firstState), [A], 'the roofer never landed in the florist\'s project');
  assert.equal(firstState.directions[0].copy.headline, 'Our last word on weddings', 'the pending edit reached its own project first');
  assert.ok(server.calls.filter(c => c.method === 'PUT' && c.url === `/api/projects/${first}`).every(c => businessesIn(c.body.directionsState).every(t => t === A)));
  assert.deepEqual(businessesIn(server.projects.get(second).directionsState), [B]);
  // the 3-direction limit is per website: a new website can always be started
  await generate(client, client.run('project.source.text')); await generate(client, client.run('project.source.text'));
  assert.equal(client.run('directions.length'), 3);
  await generate(client, A + ' Now also selling dried flowers.');
  assert.equal(client.run('directions.length'), 1); assert.equal(server.calls.filter(c => c.method === 'POST').length, 3);
});

test('refresh: the saved list and the last-project pointer lead to the NEW website\'s project, not the old one', async () => {
  const server = fakeProjectServer();
  const client = signedInClient(server);
  await generate(client, A); await generate(client, B); await flush(10);
  const second = account(client).serverProjectId;
  const seed = { 'siteremade:lastProject': client.ctx.localStorage.getItem('siteremade:lastProject'), 'siteremade:migrationMap': client.ctx.localStorage.getItem('siteremade:migrationMap') };
  // a page refresh: a new client, the same browser storage, the same account
  const again = signedInClient(server, seed);
  await again.run('onSignedIn()'); await flush(5);
  assert.deepEqual(account(again).ownedProjects.map(p => p.id).sort(), ['proj_1', 'proj_2'], 'both websites are in Saved projects');
  again.run('loadProjectFromStorage()');
  await again.run('migrateLocalProjectToAccount()'); await flush(5);
  assert.equal(account(again).serverProjectId, second);
  assert.deepEqual(businessesIn(JSON.parse(again.run('serializeDirectionsState()'))), [B]);
  assert.equal(server.calls.filter(c => c.method === 'POST').length, 2, 'no duplicate created on refresh');
  // loading the first website explicitly gives the first website
  again.run('directions = []; activeDirectionIndex = -1; serverProjectId = null;');
  await again.run('loadSelectedOwnedProjectById("proj_1")'); await flush(5);
  assert.equal(account(again).serverProjectId, 'proj_1');
  assert.deepEqual(businessesIn(JSON.parse(again.run('serializeDirectionsState()'))), [A]);
});

test('a website only this browser had (from before this fix) is saved to the account once when restored while signed in -- and never into the open project', async () => {
  const server = fakeProjectServer();
  // yesterday: generated while signed in, but never reached the account (the old gap) -- only this browser has it
  const old = signedInClient(server);
  await generate(old, B);
  const localOnly = old.ctx.localStorage.getItem('siteremade:lastProject');
  server.projects.clear(); server.calls.length = 0; // the account never got it (and this browser's new session has no migration record)
  // today: the owner is working on another website, synced to its own project
  const client = signedInClient(server, { 'siteremade:lastProject': localOnly });
  await generate(client, A); await flush(10);
  const open = account(client).serverProjectId;
  assert.ok(open);
  client.ctx.localStorage.setItem('siteremade:lastProject', localOnly); // "Load saved project" restores yesterday's roofer
  client.run('loadProjectFromStorage()'); await flush(15);
  const now = account(client).serverProjectId;
  assert.ok(now && now !== open, 'the restored website is saved as its own project');
  assert.deepEqual(businessesIn(server.projects.get(now).directionsState), [B]);
  assert.deepEqual(businessesIn(server.projects.get(open).directionsState), [A], 'the open project was not overwritten');
  assert.equal(server.calls.filter(c => c.method === 'POST').length, 2);
});

test('a fresh website that fails to generate gives the open website back, still synced to its project', async () => {
  const server = fakeProjectServer();
  const client = signedInClient(server);
  await generate(client, A);
  const first = account(client).serverProjectId;
  const parked = client.run('(window.__parked = parkCurrentWebsite(), directions.length)');
  assert.equal(parked, 0); assert.equal(account(client).serverProjectId, null);
  client.run('restoreParkedWebsite(window.__parked)');
  assert.equal(account(client).serverProjectId, first); assert.equal(client.run('directions.length'), 1);
  assert.equal(account(client).autosaveState, 'saved');
});
