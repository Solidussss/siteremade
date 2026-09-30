'use strict';
// Electron worker for test/review/mobile-audit.js -- NOT part of `npm test`. Renders the REAL builder page (served by
// the mocked server) and the REAL compiled exports at phone/tablet/desktop sizes and measures each one
// (test/review/mobile-metrics.js). One job per run, from the JSON file in argv:
//   { baseUrl, outDir, widths: [w...], landscape: [[w,h]...], account: {email,password}, text, creativeProjectId,
//     exports: { business: <index.html path>, creative: <index.html path> } }
// Writes <outDir>/mobile-result.json and PNGs <scenario>-<w>x<h>.png.
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const metrics = require('./mobile-metrics');

const job = JSON.parse(fs.readFileSync(process.argv[process.argv.length - 1], 'utf8'));
const sleep = ms => new Promise(r => setTimeout(r, ms));
app.disableHardwareAcceleration();

const SIZES = job.widths.map(w => [w, w >= 768 ? 1024 : 800]).concat(job.landscape || []);
// phase 'builder' (default) audits the page; phase 'exports' audits compiled websites and adds to the same result
const RESULT = path.join(job.outDir, 'mobile-result.json');
const out = job.phase === 'exports' && fs.existsSync(RESULT) ? JSON.parse(fs.readFileSync(RESULT, 'utf8')) : { scenarios: {} };
const js = (w, code) => w.webContents.executeJavaScript(code);

// A phone is emulated, not just a narrow window: the mobile viewport (meta viewport honoured, overlay scrollbars that
// take no width), touch input, and (hover: none)/(pointer: coarse) -- so a 320px run is really 320px wide.
const dbg = (w, method, params) => w.webContents.debugger.sendCommand(method, params || {});
async function setSize(w, [width, height]) {
  const mobile = width < 1024;
  await dbg(w, 'Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile });
  await dbg(w, 'Emulation.setTouchEmulationEnabled', { enabled: mobile, maxTouchPoints: mobile ? 5 : 1 });
}
async function shoot(w, name, [width, height]) {
  const { data } = await dbg(w, 'Page.captureScreenshot', { format: 'png' });
  const file = `${name}-${width}x${height}.png`;
  fs.writeFileSync(path.join(job.outDir, file), Buffer.from(data, 'base64'));
  return file;
}
// the whole page, one viewport at a time down to `maxScreens`, so a long page's lower sections are seen at the real
// viewport height (a tall window would change every vh-based layout)
async function screens(w, name, size, maxScreens, scrollSel) {
  const files = [];
  await js(w, 'document.documentElement.style.scrollBehavior = "auto"; true'); // the page scrolls smoothly; a capture must not catch it mid-way
  const total = await js(w, scrollSel ? `document.querySelector(${JSON.stringify(scrollSel)}).scrollHeight` : 'document.documentElement.scrollHeight');
  for (let i = 0; i < maxScreens && i * size[1] < total; i++) {
    await js(w, scrollSel ? `document.querySelector(${JSON.stringify(scrollSel)}).scrollTop = ${i * size[1]}; true` : `window.scrollTo({ top: ${i * size[1]}, behavior: "instant" }); true`);
    await sleep(350);
    files.push(await shoot(w, `${name}-p${i}`, size));
  }
  await js(w, scrollSel ? `document.querySelector(${JSON.stringify(scrollSel)}).scrollTop = 0; true` : 'window.scrollTo({ top: 0, behavior: "instant" }); true');
  return files;
}
async function measureAll(w, name, { scope, prepare, maxScreens = 1, scrollSel } = {}) {
  const res = {};
  for (const size of SIZES) {
    await setSize(w, size); await sleep(700);
    if (prepare) await js(w, `{ ${prepare} }`);
    await sleep(300);
    await js(w, 'document.querySelectorAll(".reveal, .sr-reveal").forEach(e => e.classList.add("visible", "is-visible", "sr-revealed")); true');
    const m = await js(w, metrics(scope)).catch(e => ({ error: String(e).slice(0, 200) }));
    m.shots = await screens(w, name, size, maxScreens, scrollSel);
    res[`${size[0]}x${size[1]}`] = m;
  }
  out.scenarios[name] = res;
  fs.writeFileSync(RESULT, JSON.stringify(out, null, 1));
}

app.whenReady().then(async () => {
  const w = new BrowserWindow({ width: 1440, height: 1024, show: true, webPreferences: { backgroundThrottling: false } });
  w.webContents.debugger.attach('1.3');
  try {
    if (job.phase !== 'exports') await builderPhase(w);
    else await exportsPhase(w);
  } catch (e) {
    out.error = String(e && e.stack || e).slice(0, 2000);
  }
  fs.writeFileSync(RESULT, JSON.stringify(out, null, 1));
  app.quit();
});

async function builderPhase(w) {
    // 1. the public page, signed out
    await w.loadURL(job.baseUrl); await sleep(1500);
    await measureAll(w, 'landing-signed-out', { maxScreens: 14 });
    // 2. the auth gate a signed-out visitor meets on Generate
    await js(w, 'showAuthGate(); true'); await sleep(400);
    await measureAll(w, 'auth-gate', { scope: '#generationAuthGate' });
    await js(w, 'hideAuthGate(); true');
    // 3. signed in: the same account the driver filled with saved and owned websites; generate a Business website
    await setSize(w, [1280, 900]);
    await js(w, `fetch('/api/auth/signin', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(${JSON.stringify(job.account)}) }).then(r => r.status)`);
    await w.loadURL(job.baseUrl); await sleep(1200);
    await js(w, 'authReadyPromise.then(() => true)');
    await js(w, `runGeneration(${JSON.stringify(job.text)}).then(() => true)`);
    for (let i = 0; i < 120; i++) { await sleep(500); if (await js(w, '!generationInFlight && !!project && !project.meta.isDemoShell')) break; }
    await sleep(2500);
    out.generated = await js(w, '({ name: project.business.name, pages: project.pages.length, saved: window.__siteremadeAccount.autosaveState, owned: window.__siteremadeAccount.ownedProjects.length })');
    // the website just generated, as saved -- the driver compiles it for the exports phase
    fs.writeFileSync(path.join(job.outDir, 'generated-state.json'), await js(w, 'serializeDirectionsState()'));
    await js(w, 'refreshMyWebsitesPanel(true).then(() => true)'); await sleep(800);
    await measureAll(w, 'builder-signed-in', { maxScreens: 16 });
    // the builder's own phone/tablet preview of the generated site
    await measureAll(w, 'builder-device-phone', { prepare: 'document.querySelector(\'[data-device="mobile"], [data-device="phone"]\') && document.querySelector(\'[data-device="mobile"], [data-device="phone"]\').click(); document.getElementById("build").scrollIntoView(); true', scope: '#build' });
    await js(w, 'document.querySelector(\'[data-device="desktop"]\').click(); true');
    // a sync conflict, as the account panel shows it
    await measureAll(w, 'account-conflict', { prepare: 'document.getElementById("accountConflictBlock").hidden = false; document.getElementById("accountConflictBlock").scrollIntoView(); true', scope: '.account-panel, #accountSignedIn' });
    await js(w, 'document.getElementById("accountConflictBlock").hidden = true; true');
    // 4. the Creative studio: an empty brief, then a saved Creative page
    await js(w, `(() => { const b = document.querySelector('#modeSwitch [data-mode="creative"]'); if (b) b.click(); return true; })()`); await sleep(1500);
    await measureAll(w, 'creative-brief', { scope: '#creativeStudio', maxScreens: 2, scrollSel: '#creativeStudio' });
    if (job.creativeProjectId) {
      await js(w, `fetch('/api/projects/${job.creativeProjectId}').then(r => r.json()).then(d => { window.SiteRemadeCreativeEntry.openProject(d.project); return true; })`);
      await sleep(3500);
      await measureAll(w, 'creative-studio', { scope: '#creativeStudio', maxScreens: 4, scrollSel: '#creativeStudio' });
    }
}

// 5. the compiled websites themselves
async function exportsPhase(w) {
  for (const [kind, file] of Object.entries(job.exports || {})) {
    if (!file || !fs.existsSync(file)) continue;
    await w.loadURL(pathToFileURL(file).href); await sleep(2500);
    await measureAll(w, `export-${kind}`, { maxScreens: 12 });
  }
}
