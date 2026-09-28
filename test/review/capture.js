'use strict';
// Electron capture worker for test/review/review-sites.js -- NOT part of
// `npm test` (this repo has no browser dependency; point ELECTRON_PATH at any
// Electron binary). One job per run, described by the JSON file in argv[2]:
//
//   { mode: 'preview', url, text, outDir, id }
//       Signs up on the mocked server, generates `text` through the REAL
//       page (runGeneration), waits for every image to settle, saves the
//       resulting project to <outDir>/<id>.project.json and captures the
//       live preview (#builderSite) at desktop and mobile device sizes.
//   { mode: 'export', file, outDir, id }
//       Captures a compiled static export (index.html) full-page at desktop
//       (1440) and mobile (390) width.
//
// Both modes also capture the HERO over time (frames 0 / +2.5s / +5s) with
// normal motion and with prefers-reduced-motion emulated, and report the
// mean pixel change between frames -- the evidence that the hero really
// moves, and really holds still when the visitor asks it to.
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const job = JSON.parse(fs.readFileSync(process.argv[process.argv.length - 1], 'utf8'));
const sleep = ms => new Promise(r => setTimeout(r, ms));
app.disableHardwareAcceleration();

function meanDiff(a, b) {
  const x = a.toBitmap(), y = b.toBitmap();
  if (x.length !== y.length || !x.length) return null;
  let sum = 0; for (let i = 0; i < x.length; i += 4) sum += Math.abs(x[i] - y[i]) + Math.abs(x[i + 1] - y[i + 1]) + Math.abs(x[i + 2] - y[i + 2]);
  return +(sum / (x.length / 4) / 3 / 255 * 100).toFixed(2); // % of full scale
}
async function rectOf(w, selector) {
  return w.webContents.executeJavaScript(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return null; const r = el.getBoundingClientRect(); return { x: Math.max(0, Math.round(r.left)), y: Math.max(0, Math.round(r.top + scrollY)), width: Math.round(r.width), height: Math.round(r.height) }; })()`);
}
async function fullHeight(w, selector) {
  return w.webContents.executeJavaScript(selector
    ? `(() => { const el = document.querySelector(${JSON.stringify(selector)}); const r = el.getBoundingClientRect(); return Math.ceil(r.top + scrollY + r.height + 8); })()`
    : 'Math.ceil(document.documentElement.scrollHeight)');
}
async function shootFull(w, width, file, selector) {
  w.setContentSize(width, 900); await sleep(500);
  await w.webContents.executeJavaScript(`document.querySelectorAll('.sr-reveal').forEach(e => e.classList.add('sr-revealed')); window.scrollTo(0, 0); true`);
  const h = Math.min(12000, await fullHeight(w, selector));
  w.setContentSize(width, h); await sleep(900);
  const rect = selector ? await rectOf(w, selector) : null;
  const img = await w.webContents.capturePage(rect || undefined);
  fs.writeFileSync(file, img.toPNG());
  return { file: path.basename(file), height: h };
}
async function heroFrames(w, width, prefix, heroSelector) {
  const out = {};
  for (const reduced of [false, true]) {
    await w.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: reduced ? 'reduce' : 'no-preference' }] });
    w.setContentSize(width, 900); await sleep(1200);
    // viewport coordinates: capturePage only sees what is on screen
    const rect = await w.webContents.executeJavaScript(`(() => { const el = document.querySelector(${JSON.stringify(heroSelector)}); if (!el) return null; el.scrollIntoView({ block: 'start' }); const r = el.getBoundingClientRect(); return { x: Math.max(0, Math.round(r.left)), y: Math.max(0, Math.round(r.top)), width: Math.round(Math.min(r.width, innerWidth)), height: Math.round(Math.min(r.height, innerHeight - Math.max(0, r.top))) }; })()`);
    if (!rect) return { error: 'no hero found' };
    await sleep(1200);
    // measure again once the resize and scroll have settled
    Object.assign(rect, await w.webContents.executeJavaScript(`(() => { const r = document.querySelector(${JSON.stringify(heroSelector)}).getBoundingClientRect(); return { x: Math.max(0, Math.round(r.left)), y: Math.max(0, Math.round(r.top)), width: Math.round(Math.min(r.width, innerWidth)), height: Math.round(Math.min(r.height, innerHeight - Math.max(0, r.top))) }; })()`));
    const frames = [];
    // capture the whole viewport, then crop: a sub-rect capture fails (UnknownVizError) inside the
    // editor's scrolling preview pane
    for (const t of [0, 2500, 5000]) { if (t) await sleep(2500); let full = await w.webContents.capturePage(); for (let r = 0; r < 5 && full.isEmpty(); r++) { await sleep(400); full = await w.webContents.capturePage(); } const k = full.getSize().width / width; const sz = full.getSize(); const cx = Math.round(rect.x * k), cy = Math.round(rect.y * k); frames.push(full.crop({ x: cx, y: cy, width: Math.max(1, Math.min(Math.round(rect.width * k), sz.width - cx)), height: Math.max(1, Math.min(Math.round(rect.height * k), sz.height - cy)) })); }
    const tag = reduced ? 'reduced' : 'motion';
    frames.forEach((f, i) => fs.writeFileSync(`${prefix}-hero-${tag}-${i}.png`, f.toPNG()));
    out[tag] = { diff01: meanDiff(frames[0], frames[1]), diff02: meanDiff(frames[0], frames[2]), files: frames.map((_, i) => path.basename(`${prefix}-hero-${tag}-${i}.png`)) };
  }
  await w.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] });
  return out;
}

app.whenReady().then(async () => {
  const w = new BrowserWindow({ width: 1440, height: 900, show: true, webPreferences: { backgroundThrottling: false } });
  w.webContents.debugger.attach('1.3');
  const result = { id: job.id, mode: job.mode };
  const prefix = path.join(job.outDir, `${job.id}-${job.mode}`);
  try {
    if (job.mode === 'preview') {
      await w.loadURL(job.url);
      await w.webContents.executeJavaScript(`fetch('/api/auth/signup', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'review-${job.id}@example.com', password: 'correct-horse-battery-staple' }) }).then(r => r.status)`);
      await w.loadURL(job.url);
      await w.webContents.executeJavaScript('authReadyPromise.then(() => true)');
      await w.webContents.executeJavaScript(`runGeneration(${JSON.stringify(job.text)}).then(() => true)`);
      let ready = false;
      for (let i = 0; i < 120 && !ready; i++) {
        await sleep(500);
        ready = await w.webContents.executeJavaScript('!generationInFlight && !!project && !project.meta.isDemoShell && imagePlanIsTerminal(project)');
      }
      result.settled = ready;
      await sleep(1500);
      const proj = await w.webContents.executeJavaScript('JSON.stringify(project)');
      fs.writeFileSync(path.join(job.outDir, `${job.id}.project.json`), proj);
      result.desktop = await shootFull(w, 1440, `${prefix}-desktop.png`, '#builderSite');
      result.heroDesktop = await heroFrames(w, 1440, `${prefix}-desktop`, '#builderSite .site-hero');
      await w.webContents.executeJavaScript(`document.querySelector('[data-device="mobile"]').click(); true`);
      await sleep(800);
      result.mobile = await shootFull(w, 1440, `${prefix}-mobile.png`, '#builderSite');
      result.heroMobile = await heroFrames(w, 1440, `${prefix}-mobile`, '#builderSite .site-hero');
    } else {
      await w.loadURL(pathToFileURL(job.file).href);
      await sleep(600);
      result.desktop = await shootFull(w, 1440, `${prefix}-desktop.png`);
      result.heroDesktop = await heroFrames(w, 1440, `${prefix}-desktop`, '.site-hero');
      result.mobile = await shootFull(w, 390, `${prefix}-mobile.png`);
      result.heroMobile = await heroFrames(w, 390, `${prefix}-mobile`, '.site-hero');
    }
  } catch (e) { result.error = String(e && e.stack || e); }
  fs.writeFileSync(`${prefix}.result.json`, JSON.stringify(result, null, 2));
  app.quit();
});
