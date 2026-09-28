'use strict';
// Electron worker for test/review/imagery-review.js -- NOT part of `npm test`.
// job: { shots: [{ file (index.html), out (png prefix), labelMocks, times? }], sheets: [{ html, png, width }] }
// For each exported site the hero is frozen at several moments of its motion loop
// (every animation paused at the same timeline time) at desktop (1440x900) and
// phone (390x844) size, and captured. At each moment the page itself measures how
// much of every drawn layer's main subject a visitor can actually see: points
// across the subject's [data-subject] outline are hit-tested, and a point only
// counts when the topmost element there belongs to that same layer -- so a
// subject cropped out by its frame, carried away by the camera move, or covered
// by another frame or the headline is reported, not just "the layer is present".
// Mocked provider images are stamped "MOCK IMAGE" on the page before capture, so a
// reviewer never mistakes a test stand-in for real generated imagery.
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const job = JSON.parse(fs.readFileSync(process.argv[process.argv.length - 1], 'utf8'));
const sleep = ms => new Promise(r => setTimeout(r, ms));
app.disableHardwareAcceleration();
const MOCK_CSS = `.sb-frame:has(img)::after,.cinema-frame:has(img)::after{content:"MOCK IMAGE";position:absolute;inset:0;z-index:9;display:flex;align-items:center;justify-content:center;border:3px dashed rgba(255,214,0,.95);color:#fff;font:800 11px/1.2 system-ui,sans-serif;letter-spacing:.1em;text-shadow:0 0 3px #000,0 0 6px #000;pointer-events:none}`;
// the moments captured (seconds into the loop); names kept compatible with the contact sheets
const DESKTOP_TIMES = [['desktop-a', 2.5], ['desktop-b', 5.5], ['desktop-c', 8.5], ['desktop-d', 11.5]];
const PHONE_TIMES = [['mobile', 2.5], ['mobile-b', 6.5], ['mobile-c', 10.5]];

// capturePage fails transiently (UnknownVizError / empty image) right after a load or resize -- retry patiently
async function grab(w) { let img = null; for (let t = 0; t < 30 && (!img || img.isEmpty()); t++) { try { w.webContents.invalidate(); img = await w.webContents.capturePage(); } catch (e) { img = null; } if (!img || img.isEmpty()) await sleep(250 + t * 50); } return img; }
async function heroCrop(w, width) {
  const r = await w.webContents.executeJavaScript(`(() => { const el = document.querySelector('.site-hero'); if (!el) return null; window.scrollTo(0, Math.round(el.getBoundingClientRect().top + scrollY)); const b = el.getBoundingClientRect(); return { x: Math.max(0, Math.round(b.left)), y: Math.max(0, Math.round(b.top)), width: Math.round(Math.min(b.width, innerWidth)), height: Math.round(Math.min(b.height, innerHeight - Math.max(0, b.top))), left: Math.round(b.left), scrollX }; })()`);
  if (r && (r.left !== 0 || r.scrollX !== 0)) process.stdout.write(`warn hero not at the left edge (left ${r.left}, scrollX ${r.scrollX})\n`);
  const full = await grab(w); if (!full) return null;
  const sz = full.getSize(); const k = sz.width / width;
  if (!r || r.width < 10 || r.height < 10) return full;
  return full.crop({ x: Math.round(r.x * k), y: Math.round(r.y * k), width: Math.min(Math.round(r.width * k), sz.width - Math.round(r.x * k)), height: Math.min(Math.round(r.height * k), sz.height - Math.round(r.y * k)) });
}
async function open(w, file, width, height, labelMocks) {
  w.setContentSize(width, height); await sleep(250);
  await w.loadURL('data:text/html,<p>.</p>');
  try { await w.loadURL(pathToFileURL(file).href); } catch (e) { /* the site's own script may navigate; the page is loaded */ }
  await w.webContents.executeJavaScript(`document.querySelectorAll('.sr-reveal').forEach(e => e.classList.add('sr-revealed')); const h = document.querySelector('.site-hero'); if (h) window.scrollTo(0, Math.round(h.getBoundingClientRect().top + scrollY)); true`).catch(() => {});
  if (labelMocks) await w.webContents.insertCSS(MOCK_CSS);
  await sleep(600);
}
// every animation on the page at the same timeline moment (the layers keep their own phase offsets)
const FREEZE = t => `(() => { document.getAnimations().forEach(a => { try { a.pause(); a.currentTime = ${Math.round(t * 1000)}; } catch (e) {} }); return true; })()`;
const MEASURE = `(() => {
  const out = [];
  document.querySelectorAll('.hero-storyboard .sb-layer').forEach(fig => {
    const slot = fig.getAttribute('data-slot'); const role = (fig.className.match(/sb-role-(\\w+)/) || [])[1];
    const art = [...fig.querySelectorAll('.ha-art')].find(a => getComputedStyle(a).display !== 'none');
    if (!art) { out.push({ slot, role, source: fig.getAttribute('data-source') }); return; }
    const kind = art.getAttribute('data-art'); if (kind === 'interface') { out.push({ slot, role, kind }); return; }
    const parts = [...art.querySelectorAll('[data-subject]')].map(g => g.getBoundingClientRect()).filter(b => b.width > 0 && b.height > 0);
    if (!parts.length) { out.push({ slot, role, kind, subject: false }); return; }
    const r = parts.reduce((u, b) => ({ l: Math.min(u.l, b.left), t: Math.min(u.t, b.top), r: Math.max(u.r, b.right), b: Math.max(u.b, b.bottom) }), { l: Infinity, t: Infinity, r: -Infinity, b: -Infinity });
    let seen = 0, all = 0, coreSeen = 0, coreAll = 0; const N = 16;
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
      const fx = (i + 0.5) / N, fy = (j + 0.5) / N; const x = r.l + (r.r - r.l) * fx, y = r.t + (r.b - r.t) * fy;
      const inCore = fx > 0.2 && fx < 0.8 && fy > 0.2 && fy < 0.8;
      const hit = (x >= 0 && y >= 0 && x < innerWidth && y < innerHeight) ? document.elementFromPoint(x, y) : null;
      // (another layer's bare figure box -- the transparent corners around a round frame -- covers nothing)
      const ok = !!hit && (fig.contains(hit) || (hit !== fig && hit.classList && hit.classList.contains('sb-layer') && !hit.contains(fig)));
      all++; if (ok) seen++; if (inCore) { coreAll++; if (ok) coreSeen++; }
    }
    // every printed label on the subject: the share of its points that are on screen and not covered
    const labels = [...art.querySelectorAll('[data-subject] text')].map(tx => { const b = tx.getBoundingClientRect(); let ok = 0; for (let i = 0; i < 5; i++) for (let j = 0; j < 3; j++) { const x = b.left + b.width * (i + 0.5) / 5, y = b.top + b.height * (j + 0.5) / 3; const hit = (x >= 0 && y >= 0 && x < innerWidth && y < innerHeight) ? document.elementFromPoint(x, y) : null; if (hit && (fig.contains(hit) || (hit.classList && hit.classList.contains('sb-layer')))) ok++; } return { text: tx.textContent, seen: ok / 15 }; }).filter(l => l.text.trim());
    out.push({ slot, role, kind, subject: true, share: +(seen / all).toFixed(2), core: +(coreSeen / coreAll).toFixed(2), labels: labels.length, labelsSeen: labels.length ? +Math.min(...labels.map(l => l.seen)).toFixed(2) : 1, worstLabel: labels.length ? labels.sort((a, b) => a.seen - b.seen)[0].text : null });
  });
  // the words and the button: each wholly inside the viewport's width and not covered by anything (a frame, the light sweep)
  const copy = ['.sb-copy .cinema-kicker', '.sb-copy h3', '.sb-copy .cinema-sub', '.sb-copy .site-actions a, .sb-copy .site-actions button', '.sb-copy .sb-offers li'].flatMap(sel => [...document.querySelectorAll(sel)].map(el => ({ sel, el }))).filter(c => c.el.getBoundingClientRect().width > 0).map(({ sel, el }) => {
    const b = el.getBoundingClientRect(); let ok = 0, n = 0;
    for (let i = 0; i < 6; i++) for (let j = 0; j < 3; j++) { const x = b.left + 1 + (b.width - 2) * i / 5, y = b.top + b.height * (j + 0.5) / 3; if (y < 0 || y >= innerHeight) continue; n++; const hit = x >= 0 && x < innerWidth ? document.elementFromPoint(x, y) : null; if (hit && (el.contains(hit) || hit.contains(el) || hit.closest('.sb-copy'))) ok++; }
    return { sel, left: Math.round(b.left), right: Math.round(b.right), top: Math.round(b.top), inside: b.left >= 0 && b.right <= document.documentElement.clientWidth + 0.5, seen: n ? ok / n : null };
  });
  const se = document.scrollingElement;
  return { layers: out, copy, page: { scrollX, docW: se.scrollWidth, clientW: se.clientWidth } };
})()`;

app.whenReady().then(async () => {
  // offline review: an exported page's web-font request must not stall every load (the site falls back to its system stack)
  require('electron').session.defaultSession.webRequest.onBeforeRequest((d, cb) => cb({ cancel: /^https?:/.test(d.url) }));
  const w = new BrowserWindow({ width: 1440, height: 900, show: true, useContentSize: true, webPreferences: { backgroundThrottling: false } });
  const report = {};
  for (const s of job.shots) {
    try {
      const rec = report[s.out] = {};
      for (const [view, width, height, times] of [['desktop', 1440, 900, DESKTOP_TIMES], ['phone', 390, 844, PHONE_TIMES]]) {
        await open(w, s.file, width, height, s.labelMocks);
        for (const [name, t] of (s.few ? times.slice(0, view === 'desktop' ? 2 : 1) : times)) {
          await w.webContents.executeJavaScript(FREEZE(t)); await sleep(350);
          const img = await heroCrop(w, width); if (img) fs.writeFileSync(`${s.out}-${name}.png`, img.toPNG());
          rec[name] = await w.webContents.executeJavaScript(MEASURE).catch(() => null);
        }
      }
      process.stdout.write(`shot ${path.basename(path.dirname(s.out))}\n`);
    } catch (e) { process.stdout.write(`fail ${path.basename(path.dirname(s.out))} ${String(e).slice(0, 120)}\n`); }
  }
  // a capture that failed transiently (an empty frame from the compositor) gets one more pass
  for (const s of job.shots) {
    const want = (s.few ? ['desktop-a', 'desktop-b', 'mobile'] : DESKTOP_TIMES.concat(PHONE_TIMES).map(x => x[0])).filter(n => !fs.existsSync(`${s.out}-${n}.png`));
    if (!want.length) continue;
    for (const [view, width, height, times] of [['desktop', 1440, 900, DESKTOP_TIMES], ['phone', 390, 844, PHONE_TIMES]]) {
      const todo = times.filter(([n]) => want.includes(n)); if (!todo.length) continue;
      await open(w, s.file, width, height, s.labelMocks);
      for (const [name, t] of todo) { await w.webContents.executeJavaScript(FREEZE(t)); await sleep(500); const img = await heroCrop(w, width); if (img) fs.writeFileSync(`${s.out}-${name}.png`, img.toPNG()); report[s.out] = report[s.out] || {}; report[s.out][name] = await w.webContents.executeJavaScript(MEASURE).catch(() => null); }
    }
    process.stdout.write(`retry ${path.basename(path.dirname(s.out))} ${want.join(',')}
`);
  }
  if (job.report) fs.writeFileSync(job.report, JSON.stringify(report, null, 1));
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
