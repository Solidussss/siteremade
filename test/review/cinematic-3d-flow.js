'use strict';
// Electron: A CINEMATIC VIDEO FROM THE 3D MODEL, in the real studio, against the real server with every paid provider
// mocked (test/helpers/run-server.js: Tripo, Higgsfield, Claude, Stripe). Not part of `npm test` (it needs Electron and
// a GPU):
//
//   electron test/review/cinematic-3d-flow.js <out folder>
//   (inside VS Code's terminal, clear ELECTRON_RUN_AS_NODE first -- with it set, Electron runs as plain Node)
//
// The owner's page has one product photo -- 900 x 1125, too small for full-screen video by itself -- and an interactive
// 3D model made from it (mocked Tripo). In the studio they press "Make a cinematic video from it", see Source with 3D
// Model chosen, create the page in Cinematic Hero mode; the studio's 3D engine renders the still of the stored GLB, the
// (mocked) Higgsfield job animates it, the clip joins the page and the page is saved. A fresh page with no model shows
// 3D Model disabled with its reason. Screenshots and flow.json go to the out folder. $0 provider spend.
const { app, BrowserWindow, session } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
const OUT = path.resolve(process.argv.slice(2).filter(a => !/cinematic-3d-flow\.js$/.test(a) && !a.startsWith('--'))[0] || path.join(os.tmpdir(), 'sr-cinematic-3d'));
const sleep = ms => new Promise(r => setTimeout(r, ms));
app.on('window-all-closed', () => {});

function startServer(env) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.env.NODE_BINARY || 'node', [path.join(ROOT, 'test', 'helpers', 'run-server.js')], { env: Object.assign({}, process.env, env), stdio: ['ignore', 'pipe', 'pipe'] });
    let out = ''; const timer = setTimeout(() => { child.kill(); reject(new Error('server did not start:\n' + out)); }, 25000);
    child.stdout.on('data', d => { out += d; const m = /LISTENING (\d+)/.exec(out); if (m) { clearTimeout(timer); resolve({ port: Number(m[1]), stop: () => new Promise(r => { child.once('exit', r); child.kill(); }) }); } });
    child.stderr.on('data', d => { out += d; });
  });
}

app.whenReady().then(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const { threeDEnv, creativePage } = require(path.join(ROOT, 'test', 'helpers', 'three-d-scenario.js'));
  const TD = require(path.join(ROOT, 'lib', 'creative', 'three-d.js')); const CS = require(path.join(ROOT, 'lib', 'creative', 'cinematic-source.js'));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sr-cine-flow-'));
  const env = threeDEnv(dir, { ELECTRON_RUN_AS_NODE: '', SUPABASE_URL: '', HIGGSFIELD_API_KEY: 'hf-test-key:secret', HIGGSFIELD_VIDEO_ENDPOINT: 'https://api.higgsfield.ai/kling-video/v3.0/4k/image-to-video', MOCK_HIGGSFIELD_MS: '1500', MOCK_HIGGSFIELD_FETCH_SOURCE: '1', MOCK_TRIPO: 'success', SITEREMADE_TRIAL_CREDITS: '200' });
  const server = await startServer(env); const base = `http://127.0.0.1:${server.port}`;
  const calls = () => (fs.existsSync(env.MOCK_CALL_LOG) ? fs.readFileSync(env.MOCK_CALL_LOG, 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l)) : []);
  const report = { steps: {}, errors: [] };
  try {
    // ---- the owner's page and its 3D model (made earlier, as the owner would have: the 3D card, the mocked Tripo job)
    const jar = new Map(); const cookie = () => [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
    const api = async (method, url, body) => { const res = await fetch(base + url, { method, headers: Object.assign({ 'content-type': 'application/json' }, jar.size ? { cookie: cookie() } : {}), body: body ? JSON.stringify(body) : undefined }); (res.headers.getSetCookie ? res.headers.getSetCookie() : []).forEach(c => { const [pair] = c.split(';'); const i = pair.indexOf('='); jar.set(pair.slice(0, i).trim(), pair.slice(i + 1)); }); return { status: res.status, body: await res.json().catch(() => null) }; };
    await api('POST', '/api/auth/signup', { email: `cine-${Date.now()}@example.com`, password: 'correct-horse-battery-staple' });
    const page = creativePage(); const projectId = (await api('POST', '/api/projects', { name: 'Aurelia Tonic', directionsState: { directions: [page], activeDirectionIndex: 0 } })).body.project.id;
    const q = await api('POST', '/api/creative/premium/3d/quote', { projectId, assetId: 'u-bottle' });
    const tdJob = (await api('POST', '/api/creative/premium/3d/start', { quoteId: q.body.quote.id })).body.job.jobId;
    let tj; for (let i = 0; i < 300; i++) { tj = (await api('GET', `/api/creative/premium/status/${tdJob}`)).body.job; if (tj.terminal) break; await sleep(50); }
    const d = tj.delivered[0]; const cur = (await api('GET', `/api/projects/${projectId}`)).body.project; const next = JSON.parse(JSON.stringify(cur.directionsState));
    next.directions[0].creative.threeD = TD.normalise({ assets: [d.threeD], scenes: [{ id: 'td-' + d.sectionId, assetId: d.threeD.id, sectionId: d.sectionId, composition: d.composition }] }, { sectionIds: page.creative.plan.scenes.map(s => s.id) });
    await api('PUT', `/api/projects/${projectId}`, { name: cur.name, expectedRevision: cur.revision, directionsState: next });
    report.projectId = projectId; report.accountId = (await api('GET', '/api/auth/me')).body.account.id; report.model = { id: d.threeD.id, assetRef: d.threeD.assetRef };
    const ses = session.fromPartition('cine-flow-' + process.pid);
    for (const [name, value] of jar) await ses.cookies.set({ url: base, name, value, httpOnly: true });
    ses.webRequest.onBeforeRequest((x, cb) => { const ok = x.url.startsWith(base) || /^(data|blob|devtools|about|chrome-extension):/.test(x.url); cb({ cancel: !ok }); });
    const w = new BrowserWindow({ width: 1440, height: 900, useContentSize: true, show: false, webPreferences: { backgroundThrottling: false, session: ses } });
    w.webContents.on('console-message', (e, level, m) => { if (level >= 3) report.errors.push(String(m).slice(0, 200)); });
    await w.loadURL(base + '/');
    const js = code => w.webContents.executeJavaScript(code);
    const until = async (code, ms, what) => { const t0 = Date.now(); for (;;) { const v = await js(code).catch(() => null); if (v) return v; if (Date.now() - t0 > ms) throw new Error('timed out waiting for ' + what); await sleep(150); } };
    const shot = async name => { w.webContents.invalidate(); await sleep(600); const img = await Promise.race([w.webContents.capturePage(), sleep(8000).then(() => null)]); if (img && !img.isEmpty()) fs.writeFileSync(path.join(OUT, name + '.png'), img.toPNG()); };
    const srcState = () => js(`(() => { const b = document.getElementById('csPvSrc'); const btn = v => b.querySelector('[data-src="' + v + '"]'); return { visible: !b.hidden, image: { checked: btn('image').getAttribute('aria-checked'), disabled: btn('image').disabled }, model3d: { checked: btn('model3d').getAttribute('aria-checked'), disabled: btn('model3d').disabled }, note: document.getElementById('csPvSrcNote').textContent, mode: (document.querySelector('#csModes [data-mode][aria-checked="true"]') || {}).getAttribute ? document.querySelector('#csModes [data-mode][aria-checked="true"]').getAttribute('data-mode') : '', state: document.getElementById('csPvState').textContent }; })()`);
    await until('!!window.SiteRemadeCreativeEntry && typeof currentAccount !== "undefined" && !!currentAccount', 30000, 'the builder, signed in');

    // ---- A. a page with NO 3D model: 3D Model is disabled and says why
    await js(`window.SiteRemadeCreativeEntry.openProject ? true : true`); await js(`(window.SiteRemadeCreativeStudio || {}).open ? 0 : 0`);
    await js(`fetch('/api/projects/${projectId}').then(r => r.json()).then(dd => { window.SiteRemadeCreativeEntry.openProject(dd.project); return true; })`);
    await until('!!window.SiteRemadeCreativeStudio && !!document.getElementById("cs3dCine")', 30000, 'the page with its 3D card');
    await js(`(() => { const st = window.SiteRemadeCreativeStudio.state(); window.__keep = st.threeD; st.threeD = null; return true; })()`); // (the same page as if it had no model)
    await js(`(() => { document.getElementById('csEditor').hidden = true; document.getElementById('csBriefStep').hidden = false; document.querySelector('#csModes [data-mode="hero"]').click(); return true; })()`);
    report.steps.noModel = await srcState(); await shot('01-no-model');
    await js(`(() => { window.SiteRemadeCreativeStudio.state().threeD = window.__keep; document.getElementById('csBriefStep').hidden = true; document.getElementById('csEditor').hidden = false; document.querySelector('#csModes [data-mode="creative"]').click(); return true; })()`);

    // ---- B. the page with its model: "Make a cinematic video from it"
    const modeBefore = await js(`window.SiteRemadeCreativeStudio.state().mode`);
    await js(`document.getElementById('cs3dCine').click(); true`); await sleep(400);
    // (the mode stays the owner's: the page was base Creative, so the source is shown inactive -- Creative never uses Higgsfield)
    report.steps.fromModelInCreative = Object.assign(await srcState(), { modeBefore, modeAfter: await js(`window.SiteRemadeCreativeStudio.state().mode`), inactive: await js(`document.getElementById('csPvSrc').getAttribute('data-inactive')`), backToPage: await js(`!document.getElementById('csBackToPage').hidden`) }); await shot('02a-source-inactive-in-creative');
    // the owner chooses Creative + Cinematic Hero themselves: now the 3D source is in force
    await js(`document.querySelector('#csModes [data-mode="hero"]').click(); true`); await sleep(400);
    report.steps.fromModel = Object.assign(await srcState(), { inactive: await js(`document.getElementById('csPvSrc').getAttribute('data-inactive')`) }); await shot('02-source-3d');
    // ---- C. create in Cinematic Hero, 3D Model: confirm the quote as the owner does
    await js(`window.confirm = () => true; document.getElementById('csCreate').click(); true`);
    const modal = await until(`(() => { const m = document.getElementById('csModal'); return m ? { title: m.querySelector('h2').textContent, text: m.innerText.replace(/\\s+/g, ' ').slice(0, 400), go: !!m.querySelector('.cs-go') } : null; })()`, 30000, 'the quote');
    report.steps.quote = modal; await shot('03-quote');
    await js(`document.querySelector('#csModal .cs-go').click(); true`);
    // the generation runs (mocked models), then the premium job: the still is rendered here, the clip is made and attached
    const t0 = Date.now();
    const attached = await until(`(() => { const S = window.SiteRemadeCreativeStudio.state(); const a = (S.assets || []).find(x => x.id === 'u-bottle'); return a && a.video && a.video.mediaId && !S.dirty && !S.saving ? { mediaId: a.video.mediaId, revision: S.revision, premiumSource: S.premiumSource, threeD: !!(S.threeD && S.threeD.assets.length) } : null; })()`, 180000, 'the clip on the page');
    report.steps.attached = Object.assign({ seconds: Math.round((Date.now() - t0) / 1000) }, attached);
    report.steps.progress = await js(`[...document.querySelectorAll('#csProgressList li')].map(li => li.innerText.replace(/\\s+/g, ' ').slice(0, 160))`);
    // the clip is ON the page: the preview has the hero's video, in the scene the plan made for it
    report.steps.preview = await until(`(() => { const f = document.getElementById('csFrame'); const D = f && f.contentDocument; if (!D) return null; const v = [...D.querySelectorAll('video')]; return v.length ? { videos: v.length, inFirstScene: !!(v[0].closest('.sc') && v[0].closest('.sc') === D.querySelector('.sc')), src: (v[0].currentSrc || v[0].src || '').slice(0, 20) } : null; })()`, 30000, 'the clip in the preview').catch(e => ({ error: e.message }));
    report.steps.livePanel = await js(`(document.getElementById('csPvLive') || { innerText: '' }).innerText.replace(/\\s+/g, ' ').slice(0, 200)`);
    await shot('04-clip-on-page');
    // ---- D. what the account has, and what Higgsfield was sent
    const saved = (await api('GET', `/api/projects/${projectId}`)).body.project.directionsState.directions[0].creative;
    report.steps.saved = { premiumSource: saved.premiumSource, heroVideo: (saved.assets.find(a => a.id === 'u-bottle').video || {}).mediaId || null, model: saved.threeD && saved.threeD.assets[0].assetRef };
    const all = calls(); const hf = all.filter(c => c.provider === 'higgsfield');
    report.providers = { tripoSubmits: all.filter(c => c.provider === 'tripo' && c.endpoint === 'submit').length, higgsfieldSubmits: hf.filter(c => c.params).length, prompt: (hf.find(c => c.params) || {}).params ? hf.find(c => c.params).params.prompt : null, sourceFetch: hf.filter(c => c.endpoint === 'source-fetch').map(c => c.status), other: all.filter(c => ['openai', 'serpapi'].includes(c.provider)).length };
    report.ok = true;
  } catch (e) { report.ok = false; report.error = String((e && e.stack) || e); }
  // ---- E. the still the provider was sent: the engine's own render, read from the job's record
  try {
    await server.stop();
    process.env.SITEREMADE_BACKEND = 'local'; process.env.SITEREMADE_ASSET_STORE_DIR = env.SITEREMADE_ASSET_STORE_DIR;
    const db = require(path.join(ROOT, 'lib', 'adapters', 'sqlite-database-adapter.js')).resetSqliteAdapter(env.SITEREMADE_DB_PATH);
    const PJ = require(path.join(ROOT, 'lib', 'premium-jobs.js')); const { getAssetStore } = require(path.join(ROOT, 'lib', 'adapters', 'asset-store.js'));
    const job = db.premiumJobs.latestForProject(report.accountId, report.projectId, 'video');
    const rows = (job ? [job] : []); const r = rows.length ? PJ.rolesOf(rows[0])[0] : null;
    if (r) {
      const png = getAssetStore().get(r.sourceRef); fs.writeFileSync(path.join(OUT, 'the-still-higgsfield-got.png'), png);
      const fixture = fs.readFileSync(path.join(ROOT, 'test', 'fixtures', 'three-d', 'product-still.png'));
      report.still = { source: r.source, bytes: png.length, width: png.readUInt32BE(16), height: png.readUInt32BE(20), sameAsCommittedFixture: crypto.createHash('sha256').update(png).digest('hex') === crypto.createHash('sha256').update(fixture).digest('hex') };
    }
  } catch (e) { report.stillError = String(e && e.message || e); }
  fs.writeFileSync(path.join(OUT, 'flow.json'), JSON.stringify(report, null, 1));
  app.exit(report.ok ? 0 : 1);
}).catch(e => { fs.mkdirSync(OUT, { recursive: true }); fs.writeFileSync(path.join(OUT, 'flow-error.txt'), String((e && e.stack) || e)); app.exit(1); });
