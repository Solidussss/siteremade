'use strict';
// Electron: THE CUSTOMER'S 3D FLOW IN A REAL BROWSER, against the real server with a MOCKED Tripo (test/helpers/
// run-server.js + test/helpers/mock-tripo.js). Not part of `npm test` (it needs Electron and a GPU):
//
//   electron test/review/three-d-studio-flow.js <out folder>
//   electron test/review/three-d-studio-flow.js <out folder> --realistic   (photo-sized pictures, a ~6 MB model: the size
//                                                                             of a real textured model, not the 0.14 MB fixture)
//   (inside VS Code's terminal, clear ELECTRON_RUN_AS_NODE first -- with it set, Electron runs as plain Node)
//
// REAL PROVIDER SPEND: $0. The server is the test harness's: Tripo is the fake, every other paid provider is refused, and
// this window is allowed to talk to that server and nothing else (anything else it tries is blocked and listed).
//
// What it does, as an owner would: opens a saved Creative page that has an uploaded product picture -> the studio offers
// "Interactive 3D" -> "See what it costs" -> the cost is shown -> "Create the 3D model" (clicked TWICE) -> the status is
// followed -> the model appears on the page (real WebGL, in the studio's preview) -> it is saved -> the window is closed
// and the page reopened -> then the page is purchased (mocked Stripe), exported, and the ZIP unpacked into
// <out>/site for test/review/three-d-probe.js to open as a standalone website.
// Screenshots of each step and the whole report (flow.json) go to the out folder.
const { app, BrowserWindow, session } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
const OUT = path.resolve(process.argv.slice(2).filter(a => !/three-d-studio-flow\.js$/.test(a) && !a.startsWith('--'))[0] || path.join(os.tmpdir(), 'sr-3d-studio-flow'));
const KEY = 'tsk_TESTONLYnotarealkey0123456789abcdef'; // (not a key: nothing answers it but the fake)
const sleep = ms => new Promise(r => setTimeout(r, ms));
const REALISTIC = process.argv.includes('--realistic');
app.on('window-all-closed', () => {});

// ---- the page the owner already has: a Creative page with their own product photo (planned in-process, no provider)
function page() {
  const D2 = require(path.join(ROOT, 'lib/creative/director2')); const { validatePlan2 } = require(path.join(ROOT, 'lib/creative/validate2')); const FX = require(path.join(ROOT, 'test/fixtures/three-d/make-fixture'));
  // (--realistic: photo-sized pictures -- noise does not compress, as photos mostly do not; ~3 MB each, as the studio keeps them)
  const noise = (w, h) => { const zlib = require('zlib'); const T = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; T[n] = c >>> 0; } const crc = b => { let c = 0xffffffff; for (const x of b) c = T[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
    const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
    const ih = Buffer.alloc(13); ih.writeUInt32BE(w, 0); ih.writeUInt32BE(h, 4); ih[8] = 8; ih[9] = 2; const raw = crypto.randomBytes((w * 3 + 1) * h); for (let y = 0; y < h; y++) raw[y * (w * 3 + 1)] = 0;
    return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ih), chunk('IDAT', zlib.deflateSync(raw, { level: 1 })), chunk('IEND', Buffer.alloc(0))]); };
  const png = cut => 'data:image/png;base64,' + (REALISTIC ? noise(900, 1125) : FX.productPhoto(640, 800, cut)).toString('base64');
  const assess = extra => Object.assign({ width: 640, height: 800, aspect: 0.8, orientation: 'portrait', subject: [0.15, 0.07, 0.85, 0.93], colours: ['#1a528c', '#d49e38'], luminance: 130, background: { colour: '#f1ece2', uniformity: 0.95, tolerance: 12 }, transparent: false, transparentShare: 0, megapixels: 0.51 }, extra || {});
  const assets = [
    { id: 'u-bottle', origin: 'upload', title: 'Aurelia tonic', alt: 'A bottle of Aurelia tonic', mime: 'image/png', dataUrl: png(false), assess: assess(), caps: { moveFreely: false, frame: true, backdrop: false, heroSize: true, lowRes: false }, curation: { role: 'subject', identity: 'exact', depicts: 'the bottle', issues: [], separable: true, quality: 3, framing: 'whole' } },
    { id: 'c-bottle', origin: 'derived', cutout: true, cutoutOf: 'u-bottle', title: 'Aurelia tonic', alt: 'A bottle of Aurelia tonic', mime: 'image/png', dataUrl: png(true), processing: 'background removed', assess: assess({ transparent: true, transparentShare: 0.5, background: undefined }), caps: { moveFreely: true, frame: false, backdrop: false, heroSize: true, lowRes: false } },
  ];
  const und = { kind: 'invented', subject: 'Aurelia Tonic', brief: 'a launch page for Aurelia, a small-batch tonic in a blue glass bottle', tone: { register: 'cinematic' }, identity: { name: 'Aurelia Tonic', kind: 'invented', what: 'a small-batch tonic drink product in a blue glass bottle' } };
  const d = D2.direct({ understanding: und, research: { page: null, facts: [] }, assets, supplied: { facts: ['Aurelia is bottled in small batches.'], memories: [] }, seed: '1', prefer: { family: 'object-story', mode: 'expressive' } });
  const plan = validatePlan2(d.plan, { assets, facts: [], understanding: und, page: null, art: d.recipe }).plan;
  return { mode: 'creative', meta: { id: 'c3d-flow' }, pages: [{ id: 'creative', label: 'Creative page', sections: [] }], creative: { v: 1, brief: und.brief, understanding: und, supplied: { facts: ['Aurelia is bottled in small batches.'], memories: [] }, research: { status: 'none', page: null, facts: [] }, assets, plan, motion: { intensity: 'lively' }, cost: {} } };
}

function startServer(env) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.env.NODE_BINARY || 'node', [path.join(ROOT, 'test', 'helpers', 'run-server.js')], { env: Object.assign({}, process.env, env), stdio: ['ignore', 'pipe', 'pipe'] });
    let out = ''; const timer = setTimeout(() => { child.kill(); reject(new Error('server did not start:\n' + out)); }, 25000);
    child.stdout.on('data', d => { out += d; const m = /LISTENING (\d+)/.exec(out); if (m) { clearTimeout(timer); resolve({ port: Number(m[1]), output: () => out, stop: () => new Promise(r => { child.once('exit', r); child.kill(); }) }); } });
    child.stderr.on('data', d => { out += d; });
  });
}

app.whenReady().then(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sr-3d-flow-'));
  const env = { SITEREMADE_BACKEND: 'local', NODE_ENV: 'test', ANTHROPIC_API_KEY: 'test-only', OPENAI_API_KEY: '', HIGGSFIELD_API_KEY: 'hf-test-key:secret', SUPABASE_URL: '', ELECTRON_RUN_AS_NODE: '',
    SITEREMADE_DB_PATH: path.join(dir, 'app.db'), SITEREMADE_ASSET_STORE_DIR: path.join(dir, 'assets'), SITEREMADE_EXPORTS_DIR: path.join(dir, 'exports'), SITEREMADE_PREMIUM_LOG_DIR: path.join(dir, 'premium'), MOCK_CALL_LOG: path.join(dir, 'provider-calls.log'),
    STRIPE_SECRET_KEY: 'sk_test_mock_only', STRIPE_WEBHOOK_SECRET: 'whsec_3d_flow', SITEREMADE_TRIAL_CREDITS: '60',
    CREATIVE_3D: 'on', THREE_D_PROVIDER: 'tripo', TRIPO_API_KEY: KEY, SITEREMADE_3D_PROVIDER_USD: '0.50', MOCK_TRIPO: REALISTIC ? 'large' : 'success', MOCK_TRIPO_MS: '6000', MOCK_TRIPO_FETCH_SOURCE: '1' };
  const server = await startServer(env); const base = `http://127.0.0.1:${server.port}`;
  const calls = () => (fs.existsSync(env.MOCK_CALL_LOG) ? fs.readFileSync(env.MOCK_CALL_LOG, 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l)) : []);
  const tripo = () => calls().filter(c => c.provider === 'tripo'); const submits = () => tripo().filter(c => c.endpoint === 'submit').length;
  const report = { base, steps: {}, phases: [], errors: [], blockedOutside: [] };
  try {
    // ---- the owner's account and saved page (plain HTTP, as their browser would have done earlier)
    const jar = new Map(); const cookie = () => [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
    const api = async (method, url, body) => { const res = await fetch(base + url, { method, headers: Object.assign({ 'content-type': 'application/json' }, jar.size ? { cookie: cookie() } : {}), body: body ? JSON.stringify(body) : undefined }); (res.headers.getSetCookie ? res.headers.getSetCookie() : []).forEach(c => { const [pair] = c.split(';'); const i = pair.indexOf('='); jar.set(pair.slice(0, i).trim(), pair.slice(i + 1)); }); return { status: res.status, body: await res.json().catch(() => null) }; };
    const who = { email: `flow-${Date.now()}@example.com`, password: 'correct-horse-battery-staple' };
    const up = await api('POST', '/api/auth/signup', who); if (up.status >= 300) throw new Error('signup failed: ' + JSON.stringify(up.body));
    const first = { name: 'Aurelia Tonic', directionsState: { directions: [page()], activeDirectionIndex: 0 } }; const saved = await api('POST', '/api/projects', first); if (!saved.body || !saved.body.project) throw new Error('save failed: ' + JSON.stringify(saved.body).slice(0, 300));
    const projectId = saved.body.project.id; report.projectId = projectId;
    const savedNow = async () => { const p = (await api('GET', `/api/projects/${projectId}`)).body.project; const c = p.directionsState.directions[0].creative; const t = c.threeD; return { revision: p.revision, models: t ? t.assets.map(a => ({ id: a.id, bytes: a.bytes, assetRef: a.assetRef || null })) : [], scenes: t ? t.scenes.map(s => s.sectionId + ':' + s.composition) : [] }; };
    report.pageBytes = Buffer.byteLength(JSON.stringify(first));
    // (a session of its own, in memory: nothing from an earlier run, nothing left behind)
    const ses = session.fromPartition('sr3d-flow-' + process.pid);
    for (const [name, value] of jar) await ses.cookies.set({ url: base, name, value, httpOnly: true });
    // (what the studio fetched for 3D: the engine from the builder's own path, the model from this account's stored copy)
    report.requests3D = []; ses.webRequest.onCompleted(d => { if (d.url.includes('/vendor/three-d/') || d.url.includes('premium-media')) report.requests3D.push(`${d.statusCode} ${d.url.slice(base.length).replace(/pm_[\w-]+/, 'pm_(id)')}`); });
    ses.webRequest.onBeforeRequest((d, cb) => { const ok = d.url.startsWith(base) || /^(data|blob|devtools|chrome-extension|about):/.test(d.url); if (!ok) report.blockedOutside.push(d.url.slice(0, 120)); cb({ cancel: !ok }); });

    const openStudio = async () => {
      const w = new BrowserWindow({ width: 1440, height: 900, useContentSize: true, show: false, webPreferences: { backgroundThrottling: false, session: ses } });
      w.webContents.on('console-message', (e, level, message) => { if (level >= 3) report.errors.push(String(message).slice(0, 240)); });
      await w.loadURL(base + '/');
      const js = code => w.webContents.executeJavaScript(code);
      const until = async (code, ms, what) => { const t0 = Date.now(); for (;;) { const v = await js(code).catch(() => null); if (v) return v; if (Date.now() - t0 > (ms || 20000)) throw new Error('timed out waiting for ' + (what || code)); await sleep(100); } };
      await until('!!window.SiteRemadeCreativeEntry && typeof currentAccount !== "undefined" && !!currentAccount', 30000, 'the builder, signed in');
      // (the way a saved Creative page is opened from "my projects": the builder hands it to the Creative studio)
      await js(`fetch('/api/projects/${projectId}', { credentials: 'same-origin' }).then(r => r.json()).then(d => { window.SiteRemadeCreativeEntry.openProject(d.project); return true; })`);
      await until('!!window.SiteRemadeCreativeStudio', 20000, 'the Creative studio');
      await until('!!document.getElementById("csEditor") && !document.getElementById("csEditor").hidden', 20000, 'the editor');
      // (a hidden window paints lazily: ask for a fresh frame first; a capture that never answers must not hold the run)
      const shot = async name => { w.webContents.invalidate(); await sleep(700); const img = await Promise.race([w.webContents.capturePage(), sleep(8000).then(() => null)]); if (img && !img.isEmpty()) fs.writeFileSync(path.join(OUT, name + '.png'), img.toPNG()); else report.errors.push('no screenshot: ' + name); };
      const panel = () => js(`(() => { const b = document.getElementById('cs3d'); return b ? { text: b.innerText.replace(/\\s+/g, ' ').trim(), buttons: [...b.querySelectorAll('button')].map(x => x.id || x.getAttribute('data-td-src')), phase: (b.querySelector('.cs-3d-phase') || { getAttribute() { return null; } }).getAttribute('data-phase'), pictures: b.querySelectorAll('img').length } : null; })()`);
      const state = () => js(`(() => { const S = window.SiteRemadeCreativeStudio.state(); const t = S.threeD; return { projectId: S.projectId, revision: S.revision, dirty: !!S.dirty, credits: S.creditsRemaining, models: t ? t.assets.map(a => ({ id: a.id, bytes: a.bytes, triangles: a.triangles, hasData: /^data:model\\/gltf-binary;base64,/.test(a.dataUrl || ''), provider: a.provenance && a.provenance.provider, processor: a.provenance && a.provenance.processor })) : [], scenes: t ? t.scenes.map(s => ({ sectionId: s.sectionId, composition: s.composition })) : [], save: document.getElementById('csSaveState').textContent }; })()`);
      // the studio's preview frame: the page as it will ship, with the real engine
      const frame = () => js(`(() => { const f = document.getElementById('csFrame'); const W = f && f.contentWindow; if (!W || !W.document.querySelector('.td-stage')) return { stage: false }; const s = W.__sr3d || {}; const el = W.document.querySelector('.td-stage'); const st = (s.stages || [])[0] || null; return { stage: true, state: s.state, why: s.why, engine: s.engine, stageState: st && st.state, p: st && st.p, rotYdeg: st && st.pose ? Math.round(st.pose.rotY * 1800 / Math.PI) / 10 : null, frames: st && st.frames, canvas: !!el.querySelector('canvas'), sectionLive: el.closest('.sc').classList.contains('td-live'), pictureHidden: [...el.closest('.sc').querySelectorAll('.td-src')].length > 0 && [...el.closest('.sc').querySelectorAll('.td-src')].every(i => W.getComputedStyle(i).visibility === 'hidden'), top: Math.round(el.closest('.sc').getBoundingClientRect().top + W.scrollY), height: Math.round(el.closest('.sc').getBoundingClientRect().height), runtime: JSON.parse(W.document.getElementById('cr-3d').textContent).runtime, model: JSON.parse(W.document.getElementById('cr-3d').textContent).scenes[0].model.slice(0, 5) }; })()`);
      const scrollFrame = y => js(`document.getElementById('csFrame').contentWindow.scrollTo(0, ${Math.round(y)})`);
      return { w, js, until, shot, panel, state, frame, scrollFrame };
    };

    // ---- 1. the offer
    let b = await openStudio();
    await b.until('!!document.getElementById("cs3dQuote")', 15000, 'the Interactive 3D offer');
    report.steps.offer = { panel: await b.panel(), state: await b.state(), tripoRequests: tripo().length, previewHas3D: (await b.frame()).stage }; await b.shot('01-offer');
    // ---- 2. the cost, before anything is made
    await b.js('document.getElementById("cs3dQuote").click()');
    await b.until('!!document.getElementById("cs3dGo")', 15000, 'the quote');
    report.steps.quote = { panel: await b.panel(), state: await b.state(), tripoRequests: tripo().length }; await b.shot('02-quote');
    // ---- 3. confirmed -- twice, as an impatient owner would
    await b.js('document.getElementById("cs3dGo").click(); var again = document.getElementById("cs3dGo"); if (again) again.click(); true');
    const t0 = Date.now(); let shotMaking = false;
    for (;;) {
      const p = await b.panel(); const ph = p && p.phase;
      if (ph && report.phases[report.phases.length - 1] !== ph) report.phases.push(ph);
      if (ph === 'processing' && !shotMaking) { shotMaking = true; report.steps.making = { panel: p, state: await b.state(), submits: submits() }; await b.shot('03-making'); }
      if (p && p.buttons.includes('cs3dRemove')) break;
      if (p && p.buttons.includes('cs3dAgain')) throw new Error('the model was not made: ' + p.text);
      if (Date.now() - t0 > 60000) throw new Error('the model did not arrive: ' + JSON.stringify(p));
      await sleep(120);
    }
    // ---- 4. on the page, saved
    // (a save that fails is a finding, not a crash of this run: it is recorded, and the account is checked below)
    report.savedInStudio = await b.until('!window.SiteRemadeCreativeStudio.state().dirty && !window.SiteRemadeCreativeStudio.state().saving', 15000, 'the save').then(() => true, () => false);
    report.steps.delivered = { panel: await b.panel(), state: await b.state(), submits: submits(), seconds: +((Date.now() - t0) / 1000).toFixed(1), saved: await savedNow() }; await b.shot('04-on-page');
    // the preview: scroll to the model's section, wait for it to be drawn, then scroll through it
    const f0 = await b.frame(); await b.scrollFrame(f0.top - 200);
    let f1 = null; for (let i = 0; i < 150; i++) { f1 = await b.frame(); if (f1.stageState === 'on' || f1.stageState === 'poster') break; await sleep(150); }
    await sleep(900); const fa = await b.frame(); await b.shot('05-preview-3d');
    await b.scrollFrame(f0.top + Math.round(f0.height * 0.45)); await sleep(900); const fb = await b.frame(); await b.shot('06-preview-3d-scrolled');
    report.steps.preview = { atLoad: f0, drawn: fa, afterScroll: fb, turnedDeg: fa.rotYdeg != null && fb.rotYdeg != null ? +(fb.rotYdeg - fa.rotYdeg).toFixed(1) : null };
    report.steps.preview.requests3D = report.requests3D.slice();
    b.w.destroy();

    // ---- 5. closed and reopened: the model is there; nothing is made again. First: what the account has saved, as a
    // brand-new reader sees it (before the studio could re-attach anything)
    report.steps.savedBeforeReopen = await savedNow();
    b = await openStudio();
    await b.until('!!document.getElementById("cs3dRemove")', 15000, 'the reopened page with its model'); await sleep(2500);
    const r0 = await b.frame(); await b.scrollFrame(r0.top - 200); let r1 = null; for (let i = 0; i < 150; i++) { r1 = await b.frame(); if (r1.stageState === 'on' || r1.stageState === 'poster') break; await sleep(150); }
    await sleep(700);
    report.steps.reopened = { panel: await b.panel(), state: await b.state(), preview: await b.frame(), submits: submits(), saved: await savedNow() }; await b.shot('07-reopened');
    b.w.destroy();

    // ---- 6. purchased (mocked Stripe), published, exported -> the customer's own ZIP, unpacked for the standalone probe
    await api('POST', '/api/checkout', { projectId, businessName: 'Aurelia' });
    const asked = calls().filter(x => x.provider === 'stripe' && x.endpoint === 'checkout' && x.projectId === projectId).pop();
    const hook = JSON.stringify({ id: 'evt_' + asked.session, type: 'checkout.session.completed', data: { object: { id: asked.session, payment_status: 'paid', amount_total: asked.amount, currency: 'cad' } } });
    const ts = Math.floor(Date.now() / 1000); const sig = crypto.createHmac('sha256', env.STRIPE_WEBHOOK_SECRET).update(`${ts}.${hook}`).digest('hex');
    await fetch(base + '/api/stripe/webhook', { method: 'POST', headers: { 'content-type': 'application/json', 'stripe-signature': `t=${ts},v1=${sig}` }, body: hook });
    const cur = (await api('GET', `/api/projects/${projectId}`)).body.project;
    const pub = await api('POST', `/api/projects/${projectId}/publish`, { revision: cur.revision });
    const exp = await api('POST', `/api/projects/${projectId}/export`, {});
    const zips = []; const walk = d => { if (!fs.existsSync(d)) return; for (const f of fs.readdirSync(d)) { const p = path.join(d, f); if (fs.statSync(p).isDirectory()) walk(p); else if (/\.zip$/i.test(f)) zips.push(p); } }; walk(env.SITEREMADE_EXPORTS_DIR);
    zips.sort((a, c) => fs.statSync(c).mtimeMs - fs.statSync(a).mtimeMs);
    const site = path.join(OUT, 'site'); fs.rmSync(site, { recursive: true, force: true });
    if (zips[0]) { fs.copyFileSync(zips[0], path.join(OUT, 'site.zip')); require(path.join(ROOT, 'test/helpers/unzip')).extractZip(fs.readFileSync(zips[0]), site); }
    const list = []; const ls = (d, rel) => { if (!fs.existsSync(d)) return; for (const f of fs.readdirSync(d)) { const p = path.join(d, f); if (fs.statSync(p).isDirectory()) ls(p, rel + f + '/'); else list.push({ file: rel + f, bytes: fs.statSync(p).size }); } }; ls(site, '');
    const text = list.filter(x => /\.(html|js|json|md|txt|css)$/.test(x.file)).map(x => fs.readFileSync(path.join(site, x.file), 'utf8')).join('\n');
    report.steps.exported = { publish: pub.status, export: exp.status, threeD: exp.body && exp.body.manifest && exp.body.manifest.threeD, zipBytes: zips[0] ? fs.statSync(zips[0]).size : 0, files: list, namesAProvider: /tripo3d|openapi\.tripo|tsk_mock_|premium-media/i.test(text), containsKey: text.includes(KEY) };

    // ---- what was "paid": everything the harness answered
    const all = calls(); const by = {}; all.forEach(c => { const k = c.provider + (c.endpoint ? ':' + String(c.endpoint).replace(/^\/.*/, 'submit') : ''); by[k] = (by[k] || 0) + 1; });
    report.providers = { answeredByMocks: by, tripoSubmits: submits(), tripoSubmitBody: (tripo().find(c => c.endpoint === 'submit') || {}).body && Object.assign({}, tripo().find(c => c.endpoint === 'submit').body, { input: '(SiteRemade source link)' }), otherPaid: all.filter(c => ['anthropic', 'openai', 'higgsfield', 'serpapi'].includes(c.provider)).length, keyInServerOutput: server.output().includes(KEY) };
    report.blockedOutside = [...new Set(report.blockedOutside)];
    report.ok = true;
  } catch (e) { report.ok = false; report.error = String((e && e.stack) || e); }
  fs.writeFileSync(path.join(OUT, 'flow.json'), JSON.stringify(report, null, 1));
  await server.stop(); app.exit(report.ok ? 0 : 1);
}).catch(e => { fs.mkdirSync(OUT, { recursive: true }); fs.writeFileSync(path.join(OUT, 'flow-error.txt'), String((e && e.stack) || e)); app.exit(1); });
