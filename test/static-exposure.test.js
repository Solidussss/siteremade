'use strict';
// THE WEB SERVER HANDS OUT ONLY ITS PUBLIC FILES (server.js PUBLIC_FILES).
//
// This repository's root is where the server's own code, its libraries, migrations, tests, internal documents and (by
// default) its data live. The server used to serve that root as a static folder: /server.js, /lib/credits.js,
// /data/siteremade.db, /.git/config and every other file were one GET away for anyone. Now nothing is public unless it
// is on an exact allow-list. These tests hold that against the REAL server (test/helpers/run-server.js: the real route
// table, paid providers stubbed), over real HTTP, with request paths sent exactly as written (no client-side tidying):
//   - every public file is still served, whole, with its type and caching -- and the list is exactly what the pages load
//   - EVERY other file in the repository is asked for by name, and none comes back
//   - dot-entries, data files (even ones that exist under the tree), encodings and traversal get nothing
//   - the Creative studio's own files still load, and still render a page
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const vm = require('vm');
const crypto = require('crypto');
const { startServer } = require('./helpers/server-process');

const ROOT = path.join(__dirname, '..');
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const INDEX = fs.readFileSync(path.join(ROOT, 'index.html'));
const SERVER_SRC = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
// the allow-list, read from the server's own source (requiring server.js would start a second server's worth of state)
const PUBLIC = (() => { const m = /const PUBLIC_FILES = new Set\(\[([\s\S]*?)\]\);/.exec(SERVER_SRC); assert.ok(m, 'server.js declares PUBLIC_FILES'); return [...m[1].replace(/\/\/[^\n]*/g, '').matchAll(/'([^']+)'/g)].map(x => x[1]); })();

let server = null; let tmp = '';
// the path goes on the wire exactly as given: "..", "%2e" and "\\" are not normalised by the client
function get(rawPath, method) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: server.port, method: method || 'GET', path: rawPath, headers: { Host: 'www.siteremade.com' } }, res => { const c = []; res.on('data', d => c.push(d)); res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(c) })); });
    req.on('error', reject); req.end();
  });
}
const isShell = r => r.status === 200 && r.body.length === INDEX.length && r.body.equals(INDEX);
// what a refused request may be: a 404, or the app's own page -- never the bytes that were asked for
function refused(r, bytes, what) {
  assert.ok(r.status === 404 || isShell(r), `${what}: answered ${r.status} (${r.headers['content-type']}, ${r.body.length} bytes)`);
  if (bytes && bytes.length) assert.ok(!(r.body.length === bytes.length && r.body.equals(bytes)), `${what}: the file itself came back`);
}
async function each(list, n, fn) { for (let i = 0; i < list.length; i += n) await Promise.all(list.slice(i, i + n).map(fn)); }

test.before(async () => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sr-static-'));
  server = await startServer({ SITEREMADE_BACKEND: 'local', SITEREMADE_DB_PATH: path.join(tmp, 'app.db'), SITEREMADE_ASSET_STORE_DIR: path.join(tmp, 'assets'), SITEREMADE_PREMIUM_LOG_DIR: path.join(tmp, 'premium'), SITEREMADE_EXPORTS_DIR: path.join(tmp, 'exports') });
});
test.after(async () => { if (server) await server.stop(); try { fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } catch (e) { /* the OS clears its temp folder */ } });

test('the static mount is an exact allow-list: the repository root is never served as a folder', () => {
  assert.doesNotMatch(SERVER_SRC, /app\.use\(\s*express\.static\(/, 'no folder is mounted on the app directly');
  assert.equal((SERVER_SRC.match(/express\.static\(/g) || []).length, 1, 'one static handler, behind the allow-list');
  assert.match(SERVER_SRC, /app\.use\(\(req, res, next\) => \(PUBLIC_FILES\.has\(req\.path\) \? servePublicFile\(req, res, next\) : next\(\)\)\);/);
  // the list: a handful of browser files, each one a real file, none of them a folder, a dot-entry or server-side code
  assert.ok(PUBLIC.length >= 10 && PUBLIC.length <= 24, `${PUBLIC.length} public files`); assert.equal(new Set(PUBLIC).size, PUBLIC.length);
  PUBLIC.filter(p => p !== '/').forEach(p => {
    assert.match(p, /^\/[A-Za-z0-9][A-Za-z0-9/_-]*(\.[A-Za-z0-9-]+)*\.(html|css|js|png)$/, p); assert.ok(!p.includes('..') && !/\/\./.test(p), p);
    assert.ok(fs.statSync(path.join(ROOT, p)).isFile(), `${p} exists`);
    assert.doesNotMatch(p, /^\/(server\.js|lib\/|test\/|scripts\/|migrations\/|data\/|node_modules\/|premium-fixtures\/|references\/)|package|\.md$|\.json$|\.sql$|\.py$|\.db$/, p);
  });
});

test('the public list is exactly what the pages load: nothing a page needs is missing from it', () => {
  const need = new Set(['/']);
  ['index.html', 'privacy.html', 'terms.html'].forEach(f => { need.add('/' + f); [...fs.readFileSync(path.join(ROOT, f), 'utf8').matchAll(/(?:src|href)="([^"#?]+)(?:\?[^"]*)?"/g)].map(m => m[1]).filter(u => !/^(https?:|mailto:|tel:|data:|\/\/)/.test(u) && /\.[a-z0-9]+$/i.test(u)).forEach(u => need.add('/' + u.replace(/^\//, ''))); });
  // the Creative studio's own set (creative-entry.js loads them when Creative is chosen)
  [...fs.readFileSync(path.join(ROOT, 'creative-entry.js'), 'utf8').matchAll(/'([a-z0-9-]+\.(?:js|css))'/g)].forEach(m => need.add('/' + m[1]));
  [...need].forEach(u => assert.ok(PUBLIC.includes(u), `${u} is loaded by a page but is not public`));
  // and nothing is public that no page loads
  PUBLIC.forEach(u => assert.ok(need.has(u), `${u} is public but nothing loads it`));
});

test('normal website assets still work: every public file is served whole, with its type and its caching, by GET and HEAD', async () => {
  const TYPE = { html: 'text/html', css: 'text/css', js: /^(application|text)\/javascript$/, png: 'image/png' };
  for (const p of PUBLIC) {
    const file = fs.readFileSync(path.join(ROOT, p === '/' ? 'index.html' : p)); const ext = p === '/' ? 'html' : p.split('.').pop();
    const r = await get(p); assert.equal(r.status, 200, p); assert.ok(r.body.equals(file), `${p}: the whole file, byte for byte`);
    const type = String(r.headers['content-type']).split(';')[0]; if (TYPE[ext] instanceof RegExp) assert.match(type, TYPE[ext], p); else assert.equal(type, TYPE[ext], p);
    if (ext === 'js' || ext === 'css') assert.equal(r.headers['cache-control'], 'public, max-age=3600, stale-while-revalidate=86400', p);
    if (ext === 'png') assert.equal(r.headers['cache-control'], 'public, max-age=604800, stale-while-revalidate=86400', p);
    assert.ok(r.headers.etag && r.headers['last-modified'], `${p}: revalidation headers`);
    const h = await get(p, 'HEAD'); assert.deepEqual([h.status, Number(h.headers['content-length']), h.body.length], [200, file.length, 0], `HEAD ${p}`);
    const again = await new Promise(res => http.request({ host: '127.0.0.1', port: server.port, path: p, headers: { 'If-None-Match': r.headers.etag } }, x => { x.resume(); x.on('end', () => res(x.statusCode)); }).end()); assert.equal(again, 304, `${p}: a cached copy revalidates`);
  }
  // a cache-busting query (how the studio loads its files) changes nothing
  const q = await get('/creative-core.js?v=abc123'); assert.equal(q.status, 200); assert.ok(q.body.equals(fs.readFileSync(path.join(ROOT, 'creative-core.js'))));
  // the app's own routes are what they were: the page for the site and for any app route, the two legal pages, the API
  assert.ok(isShell(await get('/'))); assert.ok(isShell(await get('/?purchased=1&intent=abc')), 'the payment return'); assert.ok(isShell(await get('/?studio=creative'))); assert.ok(isShell(await get('/some/app/route')));
  const privacy = await get('/privacy'); assert.ok(privacy.status === 200 && privacy.body.equals(fs.readFileSync(path.join(ROOT, 'privacy.html'))));
  const terms = await get('/terms'); assert.ok(terms.status === 200 && terms.body.equals(fs.readFileSync(path.join(ROOT, 'terms.html'))));
  const api = await get('/api/creative/version'); assert.equal(api.status, 200); assert.match(String(api.headers['content-type']), /application\/json/); assert.ok(JSON.parse(api.body.toString()).v);
  const pricing = await get('/api/pricing'); assert.ok(pricing.status === 200 || pricing.status === 404, 'API routes are answered by the API, not by the file gate');
});

test('no other file of the repository can be fetched: every one of them is asked for by name, and none comes back', async (t) => {
  // every file under the root -- all of the code, tests, documents, fixtures and migrations; a sample of the very large
  // folders (dependencies, git's objects)
  const SAMPLE = { node_modules: 60, '.git': 25 }; const files = [];
  const walk = (dir, budget) => { for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) { if (budget.n <= 0) return; const rel = dir ? `${dir}/${e.name}` : e.name; if (e.isDirectory()) walk(rel, budget); else if (e.isFile()) { files.push(rel); budget.n--; } } };
  for (const e of fs.readdirSync(ROOT, { withFileTypes: true })) { if (e.isFile()) files.push(e.name); else if (e.isDirectory()) walk(e.name, { n: SAMPLE[e.name] || 5000 }); }
  // (and, from the sampled folders, the files most worth asking for by name)
  ['node_modules/express/package.json', 'node_modules/express/lib/express.js', '.git/config', '.git/HEAD'].forEach(f => { if (!files.includes(f) && fs.existsSync(path.join(ROOT, f))) files.push(f); });
  const priv = files.filter(f => !PUBLIC.includes('/' + f));
  assert.ok(priv.length > 300, `asked for ${priv.length} files`);
  ['server.js', 'package.json', 'lib/credits.js', 'lib/auth.js', 'lib/paid-providers.js', 'lib/media/higgsfield.js', 'lib/creative/ai.js', 'lib/adapters/sqlite-database-adapter.js', 'scripts/build-creative-core.js', 'scripts/build-premium-core.js', 'migrations/0001_init.sql', 'test/static-exposure.test.js', 'test/helpers/run-server.js', 'BILLING.md', 'PRODUCTION-ADAPTERS.md', 'premium-fixtures/mock-providers.js', 'test-premium-generation.js', 'node_modules/express/package.json']
    .forEach(f => assert.ok(priv.includes(f), `${f} is among them`));
  let served = 0; const leaked = [];
  await each(priv, 24, async rel => {
    const r = await get('/' + rel.split('/').map(encodeURIComponent).join('/')); const st = fs.statSync(path.join(ROOT, rel));
    // (compared by size first: only a response as long as the file is read against it)
    const same = r.status === 200 && r.body.length === st.size && st.size > 0 && r.body.equals(fs.readFileSync(path.join(ROOT, rel)));
    if (same && !(st.size === INDEX.length && r.body.equals(INDEX))) leaked.push(rel);
    if (!(r.status === 404 || isShell(r))) leaked.push(`${rel} -> ${r.status}`);
    served++;
  });
  assert.deepEqual(leaked, [], 'files handed out that are not public');
  assert.equal(served, priv.length); t.diagnostic(`asked for ${priv.length} non-public files by name: none was served`);
  // a file-shaped request gets a 404 (not the app's page with a 200): the source, a config file, a document, a schema
  for (const u of ['/server.js', '/package.json', '/package-lock.json', '/lib/credits.js', '/BILLING.md', '/migrations/0001_init.sql', '/scripts/build-creative-core.js', '/scripts/build-premium-core.js', '/test/creative.test.js', '/test/helpers/run-server.js', '/node_modules/express/package.json', '/favicon.ico', '/robots.txt'])
    assert.equal((await get(u)).status, 404, u);
  // folders are not listed, not redirected to, and say nothing about whether they exist
  for (const u of ['/lib', '/lib/', '/data/', '/scripts/', '/test/', '/migrations/', '/node_modules/', '/premium-fixtures/', '/no-such-folder/']) { const r = await get(u); assert.ok(isShell(r), `${u}: ${r.status}`); assert.equal(r.headers.location, undefined, u); }
});

test('dot-entries are not exposed: not a dotfile, not a file inside a dot-folder (the old mount served those)', async () => {
  const want = ['/.git/config', '/.git/HEAD', '/.git/index', '/.gitignore', '/.env', '/.env.example', '/.env.local', '/.npmrc', '/.config/secret.json', '/.vscode/settings.json', '/node_modules/.package-lock.json', '/lib/.env', '/lib/creative/.env'];
  for (const u of want) { const r = await get(u); assert.equal(r.status, 404, u); const f = path.join(ROOT, u); if (fs.existsSync(f) && fs.statSync(f).isFile() && fs.statSync(f).size < 4e6) assert.ok(!r.body.equals(fs.readFileSync(f)), u); }
  // (the ones that really exist here were really asked for)
  assert.ok(fs.existsSync(path.join(ROOT, '.gitignore')), 'a real dotfile was among them');
});

test('data is not exposed, even when it lives under the app folder: a database, a ledger, a stored asset, a customer ZIP', async () => {
  // real files, with a recognisable content, where the server keeps its data by default (data/ -- ignored by git)
  const dir = path.join(ROOT, 'data', `static-exposure-test-${process.pid}`); const mark = `PRIVATE-${crypto.randomBytes(8).toString('hex')}`;
  const made = { 'siteremade.db': `SQLite format 3\u0000${mark}`, 'siteremade.db-wal': mark, 'premium/creative-ledger.jsonl': `{"accountId":"acct_x","mark":"${mark}"}\n`, 'premium/generation-log.jsonl': mark, 'premium/cost-ledger.jsonl': mark,
    [`asset-store/${'ab'.repeat(32)}`]: mark, 'exports/dep_customer.zip': `PK\u0003\u0004${mark}`, '.env': `SECRET=${mark}`, 'notes': mark };
  try {
    Object.entries(made).forEach(([rel, body]) => { fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true }); fs.writeFileSync(path.join(dir, rel), body); });
    const base = `/data/${path.basename(dir)}`;
    for (const rel of Object.keys(made)) { const r = await get(`${base}/${rel}`); refused(r, Buffer.from(made[rel]), rel); assert.ok(!r.body.includes(mark), `${rel}: its content came back`); }
    // and the real ones, where a developer's machine has them
    for (const u of ['/data/siteremade.db', '/data/siteremade.db-wal', '/data/siteremade.db-shm', '/data/premium/creative-ledger.jsonl', '/data/premium/generation-log.jsonl', '/data/premium/cost-ledger.jsonl', '/data/premium/creative-serp-cache.json', '/data/exports/dep_x.zip']) {
      const r = await get(u); assert.equal(r.status, 404, u); const f = path.join(ROOT, u); if (fs.existsSync(f)) assert.ok(r.body.length < 100, u);
    }
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  // (what an owner may download -- their purchased ZIP, their media -- is an API route that checks who is asking)
  assert.equal((await get('/api/deployments/dep_x/download')).status, 401); assert.equal((await get('/api/premium-media/pm_abcdefgh/file')).status, 401);
});

test('no directory traversal and no encoding trick: a path that is not exactly on the list gets nothing', async () => {
  const outside = (() => { for (const f of ['C:/Windows/win.ini', '/etc/passwd', '/etc/hosts']) { try { return fs.readFileSync(f); } catch (e) { /* not this OS */ } } return null; })();
  const SERVER = fs.readFileSync(path.join(ROOT, 'server.js')); const CREDITS = fs.readFileSync(path.join(ROOT, 'lib', 'credits.js'));
  const tries = [
    '/../server.js', '/..%2fserver.js', '/%2e%2e/server.js', '/lib/../server.js', '/lib/%2e%2e/server.js', '/lib%2fcredits.js', '/lib%5ccredits.js', '/lib\\credits.js', '/./server.js', '//server.js', '/index.html/../server.js', '/lib/creative/../../server.js', '/lib/creative/%2e%2e/%2e%2e/server.js', '/lib/..%2fserver.js',
    '/%2e%2e/%2e%2e/%2e%2e/Windows/win.ini', '/..%2f..%2f..%2f..%2fetc%2fpasswd', '/..%5c..%5c..%5cWindows%5cwin.ini', '/lib/../../../../Windows/win.ini', '/lib/../../../../etc/passwd', '/%252e%252e/%252e%252e/etc/passwd', '/C:/Windows/win.ini', '//C:/Windows/win.ini', '/C:%5cWindows%5cwin.ini', '/....//....//etc/passwd',
    '/server.js%00', '/server.js%00.png', '/index.html%00/../server.js', '/server.js/', '/server.js.', '/SERVER.JS', '/Server.Js', '/server.js%20', '/server%2ejs', '/%73erver.js', '/styles.css/../server.js', '/STYLES.CSS', '/index.html/', '/%', '/%ff', '/%c0%ae%c0%ae/server.js',
  ];
  for (const u of tries) {
    const r = await get(u);
    assert.ok(r.status === 404 || r.status === 400 || isShell(r), `${JSON.stringify(u)}: ${r.status}`);
    assert.ok(!r.body.equals(SERVER) && !r.body.equals(CREDITS), `${JSON.stringify(u)}: source came back`);
    if (outside) assert.ok(!r.body.equals(outside), `${JSON.stringify(u)}: a file from outside the app came back`);
    assert.doesNotMatch(r.body.toString('utf8', 0, 300), /\[extensions\]|root:.*:0:0|const express = require/, JSON.stringify(u));
  }
  // an exact public path is the only thing that opens the static handler: a near miss of one does not
  for (const u of ['/styles.css%00', '/styles.css/', '/styles%2ecss', '/script.js/', '/creative-core.js%00', '/creative%2dcore.js', '/favicon.png/']) { const r = await get(u); assert.ok(r.status === 404 || isShell(r), `${u}: ${r.status}`); assert.ok(r.body.length < 100 || isShell(r), u); }
});

test('Creative preview still works: the studio\'s files load from the server, evaluate, and render the same page the server\'s own code renders', async () => {
  // what creative-entry.js does when Creative is chosen: the build id, then the studio's three files, with that id
  const v = JSON.parse((await get('/api/creative/version')).body.toString()).v; assert.ok(v);
  const q = '?v=' + encodeURIComponent(v);
  const css = await get('/creative-studio.css' + q); const core = await get('/creative-core.js' + q); const studio = await get('/creative.js' + q); const entry = await get('/creative-entry.js?v=public-modes-1');
  [css, core, studio, entry].forEach(r => assert.equal(r.status, 200));
  // the served bundle IS the Creative core: evaluated as the browser evaluates it, it renders a preview page
  const win = {}; vm.runInNewContext(core.body.toString('utf8'), { window: win, console });
  const C = win.SiteRemadeCreative; assert.ok(C && C.render2 && C.validate2 && C.director2, 'the studio core loaded');
  const old = require('./fixtures/creative-saved-stage2.json').creative;
  const plan = C.validate2.validatePlan2(old.plan, { mode: 'safety', assets: old.assets, facts: old.plan.facts, understanding: old.understanding }).plan;
  const src = a => `blob:${a.id}`; const page = C.render2.renderCreative2(plan, old.assets, { mode: 'preview', src });
  assert.match(page, /^<!doctype html>/); assert.match(page, /data-mode="preview"/); assert.ok(page.length > 20000);
  // (the bundle's copy of the renderer is indented, so its page's lines are too: the page is the same, line for line)
  const lines = s => s.replace(/\r?\n[ \t]+/g, '\n');
  assert.equal(lines(page), lines(require('../lib/creative/render2').renderCreative2(require('../lib/creative/validate2').validatePlan2(old.plan, { mode: 'safety', assets: old.assets, facts: old.plan.facts, understanding: old.understanding }).plan, old.assets, { mode: 'preview', src })), 'the studio preview and the server render are the same page');
  // ...while the studio's own sources, and the script that builds its bundle, are not handed out
  for (const u of ['/lib/creative/render2.js', '/lib/creative/validate2.js', '/lib/creative/ai.js', '/scripts/build-creative-core.js']) assert.equal((await get(u)).status, 404, u);
});

test('Creative export still works, and does not depend on the web server\'s static files: the customer\'s folder is built from disk, with its own copies', () => {
  const dir = fs.mkdtempSync(path.join(tmp, 'export-')); process.env.SITEREMADE_BACKEND = 'local'; process.env.SITEREMADE_ASSET_STORE_DIR = path.join(dir, 'assets');
  const { getDatabaseAdapter } = require('../lib/adapters/database-adapter'); const projectStore = require('../lib/project-store'); const { compileExport } = require('../lib/export-compiler'); const { zipDirectory } = require('../lib/archive');
  const old = require('./fixtures/creative-saved-stage2.json').creative; const db = getDatabaseAdapter(':memory:');
  const pix = n => { const b = Buffer.alloc(80); b.write('\x89PNG\r\n\x1a\n', 0, 'latin1'); b.writeUInt32BE(13, 8); b.write('IHDR', 12); b.writeUInt32BE(10, 16); b.writeUInt32BE(10, 20); b.writeUInt32BE(n, 60); return 'data:image/png;base64,' + b.toString('base64'); };
  const creative = Object.assign({}, old, { assets: old.assets.map((a, i) => { const o = Object.assign({}, a, { dataUrl: pix(i + 1), mime: 'image/png' }); delete o.assetRef; return o; }) });
  const check = projectStore.validateDirectionsState({ directions: [{ mode: 'creative', meta: { id: 'c1' }, pages: [{ id: 'creative', label: 'Creative page', sections: [] }], creative }], activeDirectionIndex: 0 }); assert.ok(check.valid, check.error);
  projectStore.internalizeAssets(db, check.normalized);
  const workDir = path.join(dir, 'out'); const res = compileExport(db, { project: { id: 'p-static', revision: 1, directionsState: check.normalized }, directionIndex: 0, workDir });
  const html = fs.readFileSync(path.join(workDir, 'index.html'), 'utf8'); assert.match(html, /^<!doctype html>/); assert.equal(res.manifest.mode, 'creative');
  ['index.html', 'README.md', 'START-HERE.md', 'ATTRIBUTION.md', 'export-manifest.json'].forEach(f => assert.ok(fs.existsSync(path.join(workDir, f)), f));
  // every file the exported page names is in the customer's own folder; it names nothing of this server
  [...html.matchAll(/(?:src|href|poster)="([^"#]+)"/g)].map(m => m[1]).filter(u => !/^(https?:|mailto:)/.test(u)).forEach(u => assert.ok(fs.existsSync(path.join(workDir, u)), u));
  assert.doesNotMatch(html, /\/api\/|creative-core\.js|siteremade\.com/);
  const zip = zipDirectory(workDir, path.join(dir, 'site.zip')); assert.ok(zip.fileCount >= 5 && zip.zipBytes > 1000);
});
