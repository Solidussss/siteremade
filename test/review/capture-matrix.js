'use strict';
// Electron worker for test/review/hero-matrix-review.js -- NOT part of `npm
// test`. For every exported site in the job file it captures the HERO:
//   * desktop (1440x900) and phone (390x844) frames at five points in the
//     motion loop (0, 1.5, 3, 4.5, 6 s after the entrance settles);
//   * a 4 s burst at ~6 fps on desktop (encoded to MP4 by the orchestrator);
//   * the same hero with prefers-reduced-motion emulated;
// and measures, in the page itself: whether every image layer is visible,
// whether each layer's transform actually changes over time (independent
// motion), whether any layer covers the headline, and horizontal overflow on
// the phone. Writes <outDir>/<id>/... and <outDir>/<id>/result.json.
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const job = JSON.parse(fs.readFileSync(process.argv[process.argv.length - 1], 'utf8'));
const sleep = ms => new Promise(r => setTimeout(r, ms));
app.disableHardwareAcceleration();

const MEASURE = `(() => {
  const hero = document.querySelector('.site-hero');
  if (!hero) return { error: 'no hero' };
  const hr = hero.getBoundingClientRect();
  const h3 = hero.querySelector('h3');
  const t = h3 ? h3.getBoundingClientRect() : null;
  const copySafe = hero.getAttribute('data-copy');
  const layers = [...hero.querySelectorAll('.sb-layer')].map(el => {
    const r = el.getBoundingClientRect();
    const frame = el.querySelector('.sb-frame');
    const img = el.querySelector('img');
    const overlap = t ? Math.max(0, Math.min(r.right, t.right) - Math.max(r.left, t.left)) * Math.max(0, Math.min(r.bottom, t.bottom) - Math.max(r.top, t.top)) : 0;
    return {
      slot: el.getAttribute('data-slot'), role: (el.className.match(/sb-role-(\\w+)/) || [])[1], transform: getComputedStyle(el).transform, media: el.querySelector('.sb-media') ? getComputedStyle(el.querySelector('.sb-media')).transform : '',
      visible: r.width > 20 && r.height > 20 && getComputedStyle(frame).opacity === '1' && !!(img && img.complete && img.naturalWidth > 0),
      inHero: r.bottom > hr.top && r.top < hr.bottom && r.right > hr.left && r.left < hr.right,
      headlineOverlapPx: Math.round(overlap), w: Math.round(r.width), h: Math.round(r.height),
    };
  });
  return { copySafe, composition: hero.getAttribute('data-composition'), concept: hero.getAttribute('data-concept'), heroHeight: Math.round(hr.height), layers,
    overflowX: document.documentElement.scrollWidth > window.innerWidth + 1, headline: t ? { w: Math.round(t.width), h: Math.round(t.height) } : null };
})()`;

async function capHero(w, width, height, file) {
  if (process.env.CAPTURE_DEBUG) process.stdout.write(`cap ${path.basename(path.dirname(file))}/${path.basename(file)}\n`);
  // capturePage can fail transiently (UnknownVizError) when frames are requested back to back -- retry briefly
  let full = null;
  for (let r = 0; r < 6 && (!full || full.isEmpty()); r++) { try { full = await w.webContents.capturePage(); } catch (e) { full = null; } if (!full || full.isEmpty()) await sleep(250); }
  if (!full || full.isEmpty()) throw new Error("capture failed after retries: " + file);
  const rect = await w.webContents.executeJavaScript(`(() => { const r = document.querySelector('.site-hero').getBoundingClientRect(); return { y: Math.max(0, Math.round(r.top)), h: Math.round(Math.min(r.bottom, innerHeight) - Math.max(0, r.top)) }; })()`);
  const k = full.getSize().width / width;
  const img = full.crop({ x: 0, y: Math.round(rect.y * k), width: full.getSize().width, height: Math.max(1, Math.min(full.getSize().height - Math.round(rect.y * k), Math.round(rect.h * k))) });
  fs.writeFileSync(file, img.toPNG());
}

app.whenReady().then(async () => {
  const w = new BrowserWindow({ width: 1440, height: 900, show: true, webPreferences: { backgroundThrottling: false } });
  await w.loadURL('data:text/html,<p>starting</p>'); // the DevTools media emulation needs a loaded page before its first command
  w.webContents.debugger.attach('1.3');
  const setReduced = on => w.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: on ? 'reduce' : 'no-preference' }] });
  for (const site of job.sites) {
    const dir = path.join(job.outDir, site.id);
    fs.mkdirSync(dir, { recursive: true });
    const result = { id: site.id };
    try {
      for (const [label, width, height] of [['desktop', 1440, 900], ['mobile', 390, 844]]) {
        await setReduced(false);
        w.setContentSize(width, height);
        await w.loadURL(pathToFileURL(site.file).href);
        await sleep(1900); // entrance reveals settle
        const measures = [];
        for (let i = 0; i < 5; i++) {
          if (i) await sleep(1500);
          await capHero(w, width, height, path.join(dir, `${label}-t${i}.png`));
          measures.push(await w.webContents.executeJavaScript(MEASURE));
        }
        const first = measures[0], mid = measures[2];
        result[label] = {
          layout: first,
          movingLayers: first.layers.filter((l, i) => mid.layers[i] && (l.transform !== mid.layers[i].transform || l.media !== mid.layers[i].media)).length,
          distinctMotion: new Set(first.layers.map((l, i) => `${l.transform}->${mid.layers[i] && mid.layers[i].transform}`)).size,
        };
        if (label === 'desktop' && job.burst && (!job.burstIds || job.burstIds.includes(site.id))) {
          const bdir = path.join(dir, 'burst'); fs.mkdirSync(bdir, { recursive: true });
          for (let f = 0; f < 16; f++) { const t0 = Date.now(); await capHero(w, width, height, path.join(bdir, `f${String(f).padStart(3, '0')}.png`)); await sleep(Math.max(0, 250 - (Date.now() - t0))); }
        }
        await setReduced(true);
        await w.loadURL(pathToFileURL(site.file).href);
        await sleep(900);
        await capHero(w, width, height, path.join(dir, `${label}-reduced.png`));
        const r1 = await w.webContents.executeJavaScript(MEASURE);
        await sleep(2000);
        const r2 = await w.webContents.executeJavaScript(MEASURE);
        result[label].reduced = { visibleLayers: r1.layers.filter(l => l.visible).length, totalLayers: r1.layers.length, stillAfter2s: r1.layers.every((l, i) => r2.layers[i] && l.transform === r2.layers[i].transform), overflowX: r1.overflowX };
      }
    } catch (e) { result.error = String(e && e.stack || e); }
    fs.writeFileSync(path.join(dir, 'result.json'), JSON.stringify(result, null, 2));
    process.stdout.write(`captured ${site.id}\n`);
  }
  await setReduced(false);
  // contact sheets: the orchestrator writes sheet-N.html pages; capture each full-page
  for (const sheet of job.sheets || []) {
    w.setContentSize(sheet.width, 900);
    await w.loadURL(pathToFileURL(sheet.html).href);
    await sleep(1200);
    const h = await w.webContents.executeJavaScript('Math.ceil(document.documentElement.scrollHeight)');
    w.setContentSize(sheet.width, Math.min(16000, h));
    await sleep(1500);
    let img = await w.webContents.capturePage();
    for (let r = 0; r < 5 && img.isEmpty(); r++) { await sleep(500); img = await w.webContents.capturePage(); }
    fs.writeFileSync(sheet.png, img.toPNG());
    process.stdout.write(`sheet ${path.basename(sheet.png)}\n`);
  }
  app.quit();
});
