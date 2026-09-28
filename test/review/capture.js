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
// The hero's words and button at one moment: each wholly inside the hero's width, not covered, and where it was
// (the copy never moves with the loop). Also the page's (or preview pane's) sideways scroll.
const COPY_CHECK = heroSel => `(() => { const hero = document.querySelector(${JSON.stringify(heroSel)}); if (!hero) return null; const hb = hero.getBoundingClientRect();
  const els = [...hero.querySelectorAll('.sb-copy h3, .sb-copy .cinema-sub, .sb-copy .site-actions a, .sb-copy .site-actions button, .sb-copy .sb-offers li')];
  const items = els.map(el => { const b = el.getBoundingClientRect(); let ok = 0, n = 0; for (let i = 0; i < 6; i++) { const x = b.left + 1 + (b.width - 2) * i / 5, y = b.top + b.height / 2; if (y < 0 || y >= innerHeight) continue; n++; const hit = document.elementFromPoint(x, y); if (hit && (el.contains(hit) || hit.contains(el) || hit.closest('.sb-copy'))) ok++; } return { tag: el.tagName, left: Math.round(b.left - hb.left), right: Math.round(b.right - hb.left), inside: b.left >= hb.left - 0.5 && b.right <= hb.right + 0.5, seen: n ? ok / n : null }; });
  const scrollers = [document.scrollingElement, ...document.querySelectorAll('#builderSite, #builderSite *')].filter(e => e && e.scrollLeft > 0).length;
  return { heroWidth: Math.round(hb.width), items, sideways: scrollers + (scrollX ? 1 : 0) }; })()`;
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
    const copyChecks = [];
    for (const t of [0, 2500, 5000]) { if (t) await sleep(2500); copyChecks.push(await w.webContents.executeJavaScript(COPY_CHECK(heroSelector)).catch(e => ({ error: String(e).slice(0, 80) }))); let full = await w.webContents.capturePage(); for (let r = 0; r < 5 && full.isEmpty(); r++) { await sleep(400); full = await w.webContents.capturePage(); } const k = full.getSize().width / width; const sz = full.getSize(); const cx = Math.round(rect.x * k), cy = Math.round(rect.y * k); frames.push(full.crop({ x: cx, y: cy, width: Math.max(1, Math.min(Math.round(rect.width * k), sz.width - cx)), height: Math.max(1, Math.min(Math.round(rect.height * k), sz.height - cy)) })); }
    const tag = reduced ? 'reduced' : 'motion';
    frames.forEach((f, i) => fs.writeFileSync(`${prefix}-hero-${tag}-${i}.png`, f.toPNG()));
    out[tag] = { diff01: meanDiff(frames[0], frames[1]), diff02: meanDiff(frames[0], frames[2]), files: frames.map((_, i) => path.basename(`${prefix}-hero-${tag}-${i}.png`)), copy: copyChecks };
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
      if (job.replace) {
        // HERO STORYBOARD: replace ONE hero image through the real editor control (the per-image file input),
        // move its focus point, save through the page's own autosave, then reload and reopen the project from
        // the server -- the same path an owner takes.
        // is a layer showing the photo the owner uploaded for it? (the upload is re-encoded in the browser, so compare to the stored asset)
        const layerState = () => w.webContents.executeJavaScript(`({ layers: [...document.querySelectorAll('#builderSite .sb-layer')].map(f => { const own = (project.assets.items || []).find(a => a.type === 'hero' && a.slot === f.dataset.slot); const img = f.querySelector('img'); return { slot: f.dataset.slot, source: f.dataset.source, style: f.getAttribute('style'), ownerPhoto: !!(own && img && img.getAttribute('src') === own.dataUrl), focal: img ? getComputedStyle(img).objectPosition : null }; }), uploads: (project.assets.items || []).filter(a => a.slot).map(a => a.slot), focal: (project.heroStoryboard && project.heroStoryboard.layers || []).map(l => l.focal || null), projectId: typeof serverProjectId !== 'undefined' ? serverProjectId : null })`);
        result.replace = { before: await layerState() };
        const heroShot = async name => {
          const measure = () => w.webContents.executeJavaScript(`(() => { const el = document.querySelector('#builderSite .site-hero'); if (!el) return null; el.scrollIntoView({ block: 'start' }); const b = el.getBoundingClientRect(); return { x: Math.max(0, Math.round(b.left)), y: Math.max(0, Math.round(b.top)), width: Math.round(Math.min(b.width, innerWidth)), height: Math.round(Math.min(b.height, innerHeight - Math.max(0, b.top))) }; })()`);
          await measure(); await sleep(1200); const r = await measure();
          let full = await w.webContents.capturePage(); for (let t = 0; t < 8 && full.isEmpty(); t++) { await sleep(400); full = await w.webContents.capturePage(); }
          const sz = full.getSize(); const k = sz.width / 1440;
          const box = r && r.width > 10 && r.height > 10 ? { x: Math.round(r.x * k), y: Math.round(r.y * k), width: Math.min(Math.round(r.width * k), sz.width - Math.round(r.x * k)), height: Math.min(Math.round(r.height * k), sz.height - Math.round(r.y * k)) } : null;
          const img = box && box.width > 10 && box.height > 10 ? full.crop(box) : full;
          fs.writeFileSync(`${prefix}-${name}.png`, img.toPNG());
          return { file: path.basename(`${prefix}-${name}.png`), rect: r, bytes: img.toPNG().length };
        };
        result.replace.beforeShot = await heroShot('replace-before');
        await w.webContents.executeJavaScript(`document.getElementById('heroLayerInput').dataset.slot = ${JSON.stringify(job.replace.slot)}; true`);
        const { root } = await w.webContents.debugger.sendCommand('DOM.getDocument', { depth: 0 });
        const { nodeId } = await w.webContents.debugger.sendCommand('DOM.querySelector', { nodeId: root.nodeId, selector: '#heroLayerInput' });
        await w.webContents.debugger.sendCommand('DOM.setFileInputFiles', { nodeId, files: [job.replace.file] });
        await sleep(2500);
        await w.webContents.executeJavaScript(`(() => { const s = document.querySelector('.hero-layer-focal[data-slot=${JSON.stringify(job.replace.slot)}]'); s.value = ${JSON.stringify(job.replace.focal)}; s.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`);
        await sleep(1200);
        result.replace.editorRows = await w.webContents.executeJavaScript(`[...document.querySelectorAll('.hero-layer-row')].map(r => [...r.querySelector('.hero-layer-meta').children].map(c => c.textContent.trim()).join(' / '))`);
        result.replace.after = await layerState();
        result.replace.afterShot = await heroShot('replace-after');
        result.replace.saved = await w.webContents.executeJavaScript('migrateLocalProjectToAccount().then(() => flushServerAutosave()).then(() => ({ id: serverProjectId, revision: serverProjectRevision }))');
        const id = result.replace.saved && result.replace.saved.id;
        // reopen as a new session would: from the account, not from this browser's local draft
        await w.webContents.executeJavaScript(`localStorage.removeItem('siteremade:lastProject'); true`);
        await w.loadURL(job.url);
        await w.webContents.executeJavaScript('authReadyPromise.then(() => true)');
        await w.webContents.executeJavaScript(`loadSelectedOwnedProjectById(${JSON.stringify(id)}).then(() => true)`);
        await sleep(2500);
        result.replace.conflictShown = await w.webContents.executeJavaScript(`!!(document.querySelector('#conflictBlock') && !document.querySelector('#conflictBlock').hidden)`);
        result.replace.reopened = await layerState();
        result.replace.reopenedShot = await heroShot('replace-reopened');
      }
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
