'use strict';
// THE PURCHASED-WEBSITE HANDOFF: GET /api/app-bridge/website/:projectId/download, end to end on the REAL server.js
// (test/helpers/run-server.js: only Claude / OpenAI / Supabase / Stripe are stubbed at the network edge). A real
// purchase (mocked Stripe checkout + a signed webhook), then the real bridge download, then the ZIP opened and checked
// file by file.
//
// Production failure this pins: the archive step shelled out to the system `zip` binary, which Railway's Node image
// does not have, so every download returned 500. lib/archive.js is now Node-only (zlib + the ZIP format).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');
const { spawnSync } = require('child_process');
const { startServer, client, providerCalls } = require('./helpers/server-process');
const { loadClient, premiumProviderStatus, buildProject } = require('./helpers/load-client');
const { GREENLINE_TEXT } = require('./fixtures/businesses');

const WEBHOOK_SECRET = 'whsec_handoff_test';
const OWNER = 'Bearer test-access-token-owner';
const OTHER = 'Bearer test-access-token-other';

// ---- an independent reader for what the server sends (central directory, CRC-checked, inflated) ------------------------
function readZip(buf) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 65535); i--) if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  assert.ok(eocd >= 0, 'end of central directory record present');
  const count = buf.readUInt16LE(eocd + 10); let p = buf.readUInt32LE(eocd + 16);
  const files = new Map();
  for (let n = 0; n < count; n++) {
    assert.equal(buf.readUInt32LE(p), 0x02014b50, 'central directory entry');
    const method = buf.readUInt16LE(p + 10), crc = buf.readUInt32LE(p + 16), csize = buf.readUInt32LE(p + 20), usize = buf.readUInt32LE(p + 24);
    const nlen = buf.readUInt16LE(p + 28), xlen = buf.readUInt16LE(p + 30), clen = buf.readUInt16LE(p + 32), off = buf.readUInt32LE(p + 42);
    const name = buf.slice(p + 46, p + 46 + nlen).toString('utf8');
    assert.equal(buf.readUInt32LE(off), 0x04034b50, `${name}: local header`);
    const lnlen = buf.readUInt16LE(off + 26), lxlen = buf.readUInt16LE(off + 28);
    const raw = buf.slice(off + 30 + lnlen + lxlen, off + 30 + lnlen + lxlen + csize);
    const data = method === 8 ? zlib.inflateRawSync(raw) : raw;
    assert.equal(data.length, usize, `${name}: size`);
    assert.equal(zlib.crc32(data) >>> 0, crc, `${name}: CRC-32`);
    files.set(name, data);
    p += 46 + nlen + xlen + clen;
  }
  return files;
}
async function raw(port, url, auth) {
  const r = await fetch(`http://127.0.0.1:${port}${url}`, { headers: auth ? { authorization: auth } : {} });
  return { status: r.status, headers: r.headers, body: Buffer.from(await r.arrayBuffer()) };
}

// ---- one server, one purchased Business website -------------------------------------------------------------------
let ctx = null;
async function setup() {
  if (ctx) return ctx;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sr-handoff-'));
  const env = {
    SITEREMADE_BACKEND: 'local', SITEREMADE_DB_PATH: path.join(dir, 'app.db'), SITEREMADE_ASSET_STORE_DIR: path.join(dir, 'assets'),
    SITEREMADE_PREMIUM_LOG_DIR: path.join(dir, 'premium'), SITEREMADE_EXPORTS_DIR: path.join(dir, 'exports'),
    PREMIUM_GENERATION_V1: 'true', ANTHROPIC_API_KEY: 'test-only', OPENAI_API_KEY: 'test-only', SITEREMADE_PAID_IMAGES: 'true',
    SITEREMADE_APP_BRIDGE_ENABLED: 'true', SITEREMADE_IDENTITY_BRIDGE_MODE: 'full', SUPABASE_URL: 'https://supabase.test', SUPABASE_ANON_KEY: 'test-anon-key', SUPABASE_PUBLISHABLE_KEY: '',
    STRIPE_SECRET_KEY: 'sk_test_mock_only', STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET, SITEREMADE_TRIAL_CREDITS: '40',
    MOCK_CALL_LOG: path.join(dir, 'provider-calls.log'), NODE_ENV: 'test',
  };
  const server = await startServer(env);
  const owner = client(server.port);
  assert.equal((await owner('POST', '/api/identity/supabase/session', { supabaseAccessToken: 'test-access-token-owner' })).status, 200);
  const other = client(server.port);
  assert.equal((await other('POST', '/api/identity/supabase/session', { supabaseAccessToken: 'test-access-token-other' })).status, 200);
  // the Business website exactly as the builder produces it: premium starter/mockup visuals, several pages, a contact
  // form (a server-required module)
  const c = loadClient();
  const { proj } = buildProject(c, GREENLINE_TEXT, { providerStatus: premiumProviderStatus() }); // Home, Services, Work, Contact + a quote form
  c.ctx.__p = proj; c.run('project = window.__p; renderProject(project)');
  const direction = JSON.parse(JSON.stringify(proj));
  const created = await owner('POST', '/api/projects', { name: 'Greenline Landscapes', directionsState: { directions: [direction], activeDirectionIndex: 0 } });
  assert.ok(created.status === 201 || created.status === 200, JSON.stringify(created.body).slice(0, 200));
  const unpaid = await owner('POST', '/api/projects', { name: 'Not bought', directionsState: { directions: [JSON.parse(JSON.stringify(proj))], activeDirectionIndex: 0 } });
  const buy = async projectId => {
    await owner('POST', '/api/checkout', { projectId, businessName: 'Greenline Landscapes' });
    const asked = providerCalls(env.MOCK_CALL_LOG).filter(x => x.provider === 'stripe' && x.endpoint === 'checkout' && x.projectId === projectId).pop(); const session = asked.session; // (pays exactly what checkout asked: Business 14999, Creative 49999)
    const body = JSON.stringify({ id: 'evt_' + session, type: 'checkout.session.completed', data: { object: { id: session, payment_status: 'paid', amount_total: asked.amount, currency: 'cad' } } });
    const t = Math.floor(Date.now() / 1000); const sig = crypto.createHmac('sha256', WEBHOOK_SECRET).update(`${t}.${body}`).digest('hex');
    const r = await fetch(`http://127.0.0.1:${server.port}/api/stripe/webhook`, { method: 'POST', headers: { 'content-type': 'application/json', 'stripe-signature': `t=${t},v1=${sig}` }, body });
    assert.equal(r.status, 200);
  };
  await buy(created.body.project.id);
  ctx = { server, env, dir, owner, other, projectId: created.body.project.id, unpaidId: unpaid.body.project.id, direction, buy, headline: direction.copy.headline };
  return ctx;
}
test.after(async () => { if (ctx) { await ctx.server.stop(); fs.rmSync(ctx.dir, { recursive: true, force: true }); } });

test('A/B. a purchased Business website downloads as a real ZIP with every handoff file', async () => {
  const { server, projectId } = await setup();
  const r = await raw(server.port, `/api/app-bridge/website/${projectId}/download`, OWNER);
  assert.equal(r.status, 200, r.body.toString('utf8').slice(0, 300));
  assert.equal(r.headers.get('content-type'), 'application/zip');
  assert.match(r.headers.get('content-disposition'), /^attachment; filename="Greenline-Landscapes\.zip"; filename\*=UTF-8''/);
  assert.equal(r.headers.get('cache-control'), 'no-store');
  assert.equal(Number(r.headers.get('content-length')), r.body.length);
  assert.ok(r.body.length > 1000);
  const files = readZip(r.body);
  for (const f of ['START-HERE.md', 'index.html', 'styles.css', 'site.js', 'README.md', 'HANDOFF.md', 'export-manifest.json']) assert.ok(files.has(f), `${f} in the ZIP`);
  assert.ok(![...files.keys()].some(n => n.startsWith('/') || n.includes('..') || n.includes('\\')), 'relative, forward-slash paths only');
});

test('C. every file the pages reference is in the ZIP, and the starter/mockup visuals are there', async () => {
  const { server, projectId } = await setup();
  const files = readZip((await raw(server.port, `/api/app-bridge/website/${projectId}/download`, OWNER)).body);
  const pages = [...files.keys()].filter(n => n.endsWith('.html'));
  const refs = new Set();
  for (const p of pages) {
    const html = files.get(p).toString('utf8');
    for (const m of html.matchAll(/(?:src|href)="([^"#?]+)"/g)) if (!/^(https?:|mailto:|tel:|data:|\/\/|#)/.test(m[1])) refs.add(m[1].replace(/^\.\//, ''));
  }
  for (const m of files.get('styles.css').toString('utf8').matchAll(/url\(["']?([^"')]+)["']?\)/g)) if (!/^(data:|https?:|#)/.test(m[1])) refs.add(m[1].replace(/^\.\//, ''));
  const missing = [...refs].filter(ref => !files.has(ref) && !files.has(ref.replace(/\/$/, '') + '/index.html'));
  assert.deepEqual(missing, [], 'every local file a page or the stylesheet points at is in the package');
  const home = files.get('index.html').toString('utf8');
  assert.ok(/visual-starter|data-source="art"/.test(home), 'the starter/mockup visuals are drawn into the page');
  assert.ok(!/starter-replace/.test(home), 'no preview-only editor control');
  assert.ok(!/\/api\//.test(home), 'standalone: no SiteRemade API calls from the page');
});

test('D/E. every page of a multi-page site is present; a site with a form ships its server and package.json', async () => {
  const { server, projectId } = await setup();
  const files = readZip((await raw(server.port, `/api/app-bridge/website/${projectId}/download`, OWNER)).body);
  const manifest = JSON.parse(files.get('export-manifest.json').toString('utf8'));
  assert.ok(manifest.pages.length >= 2, 'a multi-page website');
  manifest.pages.forEach(p => assert.ok(files.has(p.route), `${p.route} present`));
  if (manifest.runtimeType === 'server_required') {
    assert.ok(files.has('server.js') && files.has('package.json'), 'a server-required site ships server.js and package.json');
    assert.doesNotThrow(() => JSON.parse(files.get('package.json').toString('utf8')));
  } else {
    assert.ok(!files.has('server.js'), 'a static site ships no server');
  }
  assert.ok(manifest.runtimeType === 'server_required', `this fixture has a contact form, so it needs its server (runtime ${manifest.runtimeType}: ${JSON.stringify(manifest.runtimeReasons)})`);
});

test('F/G. an unpurchased website is refused (403); another account gets 404 and learns nothing', async () => {
  const { server, projectId, unpaidId } = await setup();
  const unpaid = await raw(server.port, `/api/app-bridge/website/${unpaidId}/download`, OWNER);
  assert.equal(unpaid.status, 403); assert.equal(JSON.parse(unpaid.body).error.code, 'not_purchased');
  const stranger = await raw(server.port, `/api/app-bridge/website/${projectId}/download`, OTHER);
  assert.equal(stranger.status, 404); assert.equal(JSON.parse(stranger.body).error.code, 'not_found');
  const guessed = await raw(server.port, `/api/app-bridge/website/proj_doesnotexist000000000/download`, OWNER);
  assert.equal(guessed.status, 404);
  assert.deepEqual(Object.keys(JSON.parse(stranger.body).error).sort(), Object.keys(JSON.parse(guessed.body).error).sort(), 'a stranger\'s project and a missing one look the same');
  assert.equal((await raw(server.port, `/api/app-bridge/website/${projectId}/download`, null)).status, 401);
});

test('H/I. unpublished draft edits never leak into the handoff; an explicitly published revision does -- and the preview always matches the ZIP', async () => {
  const { server, owner, projectId, headline } = await setup();
  const current = (await owner('GET', `/api/projects/${projectId}`)).body.project;
  const draft = JSON.parse(JSON.stringify(current.directionsState));
  draft.directions[0].copy.headline = 'DRAFT HEADLINE NOT PUBLISHED';
  const put = await owner('PUT', `/api/projects/${projectId}`, { name: current.name, expectedRevision: current.revision, directionsState: draft });
  assert.equal(put.body.ok, true);
  const zipText = async () => readZip((await raw(server.port, `/api/app-bridge/website/${projectId}/download`, OWNER)).body).get('index.html').toString('utf8');
  const preview = async () => (await raw(server.port, `/api/app-bridge/website/${projectId}/preview`, OWNER)).body.toString('utf8');
  let home = await zipText();
  assert.ok(!home.includes('DRAFT HEADLINE NOT PUBLISHED'), 'the draft is not in the ZIP');
  assert.ok(home.includes(headline), 'the purchased headline is');
  assert.ok(!(await preview()).includes('DRAFT HEADLINE NOT PUBLISHED'), 'nor in the preview beside the download button');
  // the owner publishes that revision through the app: from now on it IS the handoff
  const pub = await fetch(`http://127.0.0.1:${server.port}/api/app-bridge/website/${projectId}/publish`, { method: 'POST', headers: { authorization: OWNER, 'content-type': 'application/json' }, body: JSON.stringify({ revision: put.body.project.revision }) });
  assert.equal(pub.status, 200, await pub.text());
  home = await zipText();
  assert.ok(home.includes('DRAFT HEADLINE NOT PUBLISHED'), 'the published revision is in the ZIP');
  assert.ok((await preview()).includes('DRAFT HEADLINE NOT PUBLISHED'), 'and in the preview');
});

test('every download is recorded as a ready deployment whose artifact can be downloaded again later', async () => {
  const { server, owner, projectId } = await setup();
  const r = await raw(server.port, `/api/app-bridge/website/${projectId}/download`, OWNER);
  const dep = r.headers.get('x-siteremade-deployment');
  assert.ok(/^dep_/.test(dep));
  const again = await fetch(`http://127.0.0.1:${server.port}/api/deployments/${dep}/download`, { headers: { cookie: '' } });
  assert.equal(again.status, 401, 'the builder re-download link still needs the builder sign-in');
  const listed = await raw(server.port, `/api/app-bridge/website/${projectId}/deployment`, OWNER);
  const deployments = JSON.parse(listed.body).deployments;
  assert.ok(deployments.some(d => d.state === 'ready'), 'recorded in deployment history');
  // the builder's own My Websites export uses the same packaging and succeeds too
  const builderExport = await owner('POST', `/api/projects/${projectId}/export`);
  assert.equal(builderExport.status, 201, JSON.stringify(builderExport.body).slice(0, 300));
  assert.equal(builderExport.body.deployment.state, 'ready');
});

test('a real export failure is recorded with its stage and returned with a specific code, not a generic one', async () => {
  const { server, owner } = await setup();
  // a Creative project bought before it had a page: the compiler refuses it
  const empty = await owner('POST', '/api/projects', { name: 'Empty creative', directionsState: { directions: [{ mode: 'creative', meta: { id: 'c-empty' }, pages: [{ id: 'creative', label: 'Creative page', sections: [] }], creative: { brief: 'x', assets: [], plan: null } }], activeDirectionIndex: 0 } });
  await ctx.buy(empty.body.project.id);
  const r = await raw(server.port, `/api/app-bridge/website/${empty.body.project.id}/download`, OWNER);
  assert.equal(r.status, 500);
  const err = JSON.parse(r.body).error;
  assert.equal(err.code, 'compile_failed'); assert.equal(err.stage, 'compile'); assert.ok(/^dep_/.test(err.deploymentId));
  const history = JSON.parse((await raw(server.port, `/api/app-bridge/website/${empty.body.project.id}/deployment`, OWNER)).body).deployments;
  const failed = history.find(d => d.state === 'failed');
  assert.ok(failed && /compile_failed at compile: .*no page yet/i.test(failed.failureReason), JSON.stringify(history));
});

test('J. the ZIP is built without any operating-system zip tool (no PATH at all)', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'lib', 'archive.js'), 'utf8');
  assert.ok(!/child_process|execFile|spawn\(|exec\(/.test(src), 'lib/archive.js never shells out');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sr-zip-nopath-'));
  fs.mkdirSync(path.join(dir, 'site', 'assets'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'site', 'index.html'), '<!doctype html><title>x</title>'.repeat(50));
  fs.writeFileSync(path.join(dir, 'site', 'assets', 'a.bin'), crypto.randomBytes(3000));
  // a child process with an empty PATH: any attempt to run `zip` would fail with ENOENT
  const r = spawnSync(process.execPath, ['-e', `const a=require(${JSON.stringify(path.join(__dirname, '..', 'lib', 'archive.js'))});console.log(JSON.stringify(a.zipDirectory(${JSON.stringify(path.join(dir, 'site'))}, ${JSON.stringify(path.join(dir, 'out.zip'))})))`], { env: { PATH: '' }, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  const files = readZip(fs.readFileSync(path.join(dir, 'out.zip')));
  assert.deepEqual([...files.keys()], ['assets/a.bin', 'index.html']);
  assert.deepEqual(files.get('assets/a.bin'), fs.readFileSync(path.join(dir, 'site', 'assets', 'a.bin')));
  // deterministic: the same files make the same bytes
  const again = require('../lib/archive').zipDirectory(path.join(dir, 'site'), path.join(dir, 'again.zip'));
  assert.ok(again.zipBytes > 0);
  assert.deepEqual(fs.readFileSync(path.join(dir, 'again.zip')), fs.readFileSync(path.join(dir, 'out.zip')));
  fs.rmSync(dir, { recursive: true, force: true });
});
