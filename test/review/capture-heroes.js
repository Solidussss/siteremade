'use strict';
// Electron worker for test/review/imagery-review.js -- NOT part of `npm test`.
// job: { shots: [{ file (index.html), out (png prefix), labelMocks }], sheets: [{ html, png, width }] }
// For each exported site: the hero at desktop (1440x900) at two moments of the
// loop, and at phone size (390x844). Mocked provider images are stamped
// "MOCK IMAGE" on the page before capture, so a reviewer never mistakes a test
// stand-in for real generated imagery.
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const job = JSON.parse(fs.readFileSync(process.argv[process.argv.length - 1], 'utf8'));
const sleep = ms => new Promise(r => setTimeout(r, ms));
app.disableHardwareAcceleration();
const MOCK_CSS = `.sb-frame:has(img)::after,.cinema-frame:has(img)::after{content:"MOCK IMAGE";position:absolute;left:8px;top:8px;z-index:9;padding:3px 7px;border-radius:4px;background:rgba(0,0,0,.74);color:#fff;font:700 10px/1.2 system-ui,sans-serif;letter-spacing:.08em}`;

// capturePage fails transiently (UnknownVizError / empty image) right after a load or resize -- retry patiently
async function grab(w) { let img = null; for (let t = 0; t < 30 && (!img || img.isEmpty()); t++) { try { w.webContents.invalidate(); img = await w.webContents.capturePage(); } catch (e) { img = null; } if (!img || img.isEmpty()) await sleep(250 + t * 50); } return img; }
async function heroCrop(w, width) {
  const r = await w.webContents.executeJavaScript(`(() => { const el = document.querySelector('.site-hero'); if (!el) return null; el.scrollIntoView({ block: 'start' }); const b = el.getBoundingClientRect(); return { x: Math.max(0, Math.round(b.left)), y: Math.max(0, Math.round(b.top)), width: Math.round(Math.min(b.width, innerWidth)), height: Math.round(Math.min(b.height, innerHeight - Math.max(0, b.top))) }; })()`);
  const full = await grab(w); if (!full) return null;
  const sz = full.getSize(); const k = sz.width / width;
  if (!r || r.width < 10 || r.height < 10) return full;
  return full.crop({ x: Math.round(r.x * k), y: Math.round(r.y * k), width: Math.min(Math.round(r.width * k), sz.width - Math.round(r.x * k)), height: Math.min(Math.round(r.height * k), sz.height - Math.round(r.y * k)) });
}
async function open(w, file, width, height, labelMocks) {
  w.setContentSize(width, height); await sleep(250);
  await w.loadURL('data:text/html,<p>.</p>');
  try { await w.loadURL(pathToFileURL(file).href); } catch (e) { /* the site's own script may navigate; the page is loaded */ }
  await w.webContents.executeJavaScript(`document.querySelectorAll('.sr-reveal').forEach(e => e.classList.add('sr-revealed')); true`).catch(() => {});
  if (labelMocks) await w.webContents.insertCSS(MOCK_CSS);
}

app.whenReady().then(async () => {
  // offline review: an exported page's web-font request must not stall every load (the site falls back to its system stack)
  require('electron').session.defaultSession.webRequest.onBeforeRequest((d, cb) => cb({ cancel: /^https?:/.test(d.url) }));
  const w = new BrowserWindow({ width: 1440, height: 900, show: true, useContentSize: true, webPreferences: { backgroundThrottling: false } });
  for (const s of job.shots) {
    try {
      await open(w, s.file, 1440, 900, s.labelMocks);
      await sleep(2200); let img = await heroCrop(w, 1440); if (img) fs.writeFileSync(`${s.out}-desktop-a.png`, img.toPNG());
      await sleep(3000); img = await heroCrop(w, 1440); if (img) fs.writeFileSync(`${s.out}-desktop-b.png`, img.toPNG());
      await open(w, s.file, 390, 844, s.labelMocks);
      await sleep(2400); img = await heroCrop(w, 390); if (img) fs.writeFileSync(`${s.out}-mobile.png`, img.toPNG());
      process.stdout.write(`shot ${path.basename(s.out)}\n`);
    } catch (e) { process.stdout.write(`fail ${path.basename(s.out)} ${String(e).slice(0, 120)}\n`); }
  }
  for (const sheet of job.sheets || []) {
    w.setContentSize(sheet.width, 900); await sleep(300);
    await w.loadURL(pathToFileURL(sheet.html).href); await sleep(1200);
    const h = await w.webContents.executeJavaScript('Math.ceil(document.documentElement.scrollHeight)');
    w.setContentSize(sheet.width, Math.min(16000, h)); await sleep(1500);
    const img = await grab(w); if (img) fs.writeFileSync(sheet.png, img.toPNG());
    process.stdout.write(`sheet ${path.basename(sheet.png)}\n`);
  }
  app.quit();
});
