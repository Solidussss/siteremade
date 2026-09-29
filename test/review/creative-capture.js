'use strict';
// Electron: captures EXPORTED Creative pages (index.html + assets/, opened from disk) at desktop
// (1440x900) and phone (390x844) size and measures them while they run:
//   entrance   frames from the first moment of loading (recorded to entrance.mp4)
//   loop       two stills a few seconds apart + how much of the hero changed between them
//   scroll     the page scrolled top to bottom in small steps (recorded to scroll.mp4); at each
//              step: horizontal overflow, blank frames; afterwards: sections never revealed,
//              connector drawn, pictures missing
//   full page  viewport captures stacked into one tall image (fixed nav unpinned for this)
//   reduced    prefers-reduced-motion: the complete still composition at once
//   failure    the same export with its main picture and one section picture deleted
// Every http(s) request the page attempts is blocked and counted (an export must need none).
//   electron creative-capture.js job.json    job: { outDir, ffmpeg, pages: [{ id, file, dir }] }
const { app, BrowserWindow, session } = require('electron');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const { spawnSync } = require('child_process');

const job = JSON.parse(fs.readFileSync(process.argv[process.argv.length - 1], 'utf8'));
const sleep = ms => new Promise(r => setTimeout(r, ms));
app.disableHardwareAcceleration();
const VIEWS = [['desktop', 1440, 900], ['phone', 390, 844]];
let blocked = [];

async function grab(w) { let img = null; for (let t = 0; t < 40 && (!img || img.isEmpty()); t++) { try { if (t) w.webContents.invalidate(); img = await w.webContents.capturePage(); } catch (e) { img = null; } if (!img || img.isEmpty()) await sleep(120 + t * 60); } return img; }
const js = (w, code) => w.webContents.executeJavaScript(code);
function ffmpeg(argv) { const r = spawnSync(job.ffmpeg, ['-loglevel', 'error', '-y', ...argv]); return r.status === 0 ? null : String(r.stderr).slice(0, 300); }
function lumaStats(img) { const bmp = img.toBitmap(); const { width, height } = img.getSize(); let n = 0, s = 0, s2 = 0; for (let y = 0; y < height; y += 7) for (let x = 0; x < width; x += 7) { const i = (y * width + x) * 4; const l = 0.0722 * bmp[i] + 0.7152 * bmp[i + 1] + 0.2126 * bmp[i + 2]; n++; s += l; s2 += l * l; } const m = s / n; return { mean: +m.toFixed(1), sd: +Math.sqrt(Math.max(0, s2 / n - m * m)).toFixed(1) }; }
function diffShare(a, b) { const A = a.toBitmap(), B = b.toBitmap(); const { width, height } = a.getSize(); const s2 = b.getSize(); if (s2.width !== width || s2.height !== height) return null; let n = 0, d = 0; for (let y = 0; y < height; y += 4) for (let x = 0; x < width; x += 4) { const i = (y * width + x) * 4; n++; if (Math.abs(A[i] - B[i]) + Math.abs(A[i + 1] - B[i + 1]) + Math.abs(A[i + 2] - B[i + 2]) > 24) d++; } return +(100 * d / n).toFixed(2); }

const MEASURE_HERO = `(() => {
  const vw = document.documentElement.clientWidth; const f = document.querySelector('.cr-hero [data-role="subject"]'); let s = null;
  if (f && getComputedStyle(f).display !== 'none') { const r = f.getBoundingClientRect(); const img = f.querySelector('img'); let x = r.left, y = r.top, w = r.width, h = r.height;
    if ((f.dataset.fit || (img && img.style.objectFit) || 'cover') === 'contain' && img && img.naturalWidth) { const a = img.naturalWidth / img.naturalHeight; if (w / h > a) { const nw = h * a; x += (w - nw) / 2; w = nw; } else { const nh = w / a; y += h - nh; h = nh; } }
    const cx0 = Math.max(0, x), cy0 = Math.max(0, y), cx1 = Math.min(innerWidth, x + w), cy1 = Math.min(innerHeight, y + h);
    let ok = 0, n = 0; for (let i = 0; i < 12; i++) for (let j = 0; j < 12; j++) { const px = x + w * (i + .5) / 12, py = y + h * (j + .5) / 12; if (px < 0 || py < 0 || px >= innerWidth || py >= innerHeight) continue; n++; const hit = document.elementFromPoint(px, py); if (hit && (f.contains(hit) || hit === f)) ok++; }
    s = { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h), viewportShare: +(Math.max(0, cx1 - cx0) * Math.max(0, cy1 - cy0) / (innerWidth * innerHeight)).toFixed(3), onScreen: +((Math.max(0, cx1 - cx0) * Math.max(0, cy1 - cy0)) / Math.max(1, w * h)).toFixed(2), uncovered: n ? +(ok / n).toFixed(2) : null }; }
  const texts = [...document.querySelectorAll('.cr-hero .cr-kicker, .cr-hero .cr-h1, .cr-hero .cr-tagline, .cr-hero .cr-lede, .cr-hero .cr-cta')].map(el => { const b = el.getBoundingClientRect();
    const ov = s ? Math.max(0, Math.min(b.right, s.x + s.w) - Math.max(b.left, s.x)) * Math.max(0, Math.min(b.bottom, s.y + s.h) - Math.max(b.top, s.y)) : 0;
    let ok = 0, n = 0; for (let i = 0; i < 6; i++) for (let j = 0; j < 3; j++) { const x = b.left + 1 + (b.width - 2) * i / 5, y = b.top + b.height * (j + .5) / 3; if (y < 0 || y >= innerHeight || x < 0 || x >= innerWidth) continue; n++; const hit = document.elementFromPoint(x, y); if (hit && (el.contains(hit) || hit.contains(el))) ok++; }
    return { el: el.className.split(' ')[0], text: el.textContent.trim().slice(0, 50), left: Math.round(b.left), right: Math.round(b.right), top: Math.round(b.top), bottom: Math.round(b.bottom), inside: b.left >= 0 && b.right <= vw + .5, clipped: el.scrollWidth > el.clientWidth + 1, overSubject: +(ov / Math.max(1, b.width * b.height)).toFixed(3), readable: n ? +(ok / n).toFixed(2) : null }; });
  const se = document.scrollingElement; const hero = document.querySelector('.cr-hero');
  return { subject: s, texts, horizontalOverflow: se.scrollWidth > se.clientWidth + 1, missing: window.__crMissing || 0, entered: hero.classList.contains('is-in'), heroHeight: Math.round(hero.getBoundingClientRect().height), layers: document.querySelectorAll('.cr-layer, .ly').length };
})()`;
const AFTER_SCROLL = `(() => { const m = document.querySelector('.cr-connector mask path'); const len = m ? m.getTotalLength() : 0; const off = m ? +m.getAttribute('stroke-dashoffset') : 0;
  const imgs = [...document.querySelectorAll('img[data-asset]')]; const se = document.scrollingElement;
  return { unrevealed: [...document.querySelectorAll('.cr-reveal:not(.is-seen)')].map(e => e.id || e.className).slice(0, 8), unrevealedCount: document.querySelectorAll('.cr-reveal:not(.is-seen)').length, connectorLength: Math.round(len), connectorDrawnShare: len ? +((len - off) / len).toFixed(2) : null,
    images: imgs.length, imagesLoaded: imgs.filter(i => i.complete && i.naturalWidth > 0).length, missing: window.__crMissing || 0, docHeight: se.scrollHeight, horizontalOverflow: se.scrollWidth > se.clientWidth + 1,
    clippedHeadings: [...document.querySelectorAll('h1, h2, .cr-statement, .cr-closing-line')].filter(e => e.scrollWidth > e.clientWidth + 1).map(e => e.textContent.slice(0, 40)),
    sections: [...document.querySelectorAll('.cr-section')].map(s => s.dataset.type) }; })()`;

async function load(w, file, width, height, reduced) {
  w.setContentSize(width, height); await sleep(200);
  await w.loadURL('data:text/html,<body style="background:#000">'); // (a DevTools command before any page has loaded never answers)
  await Promise.race([w.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: reduced ? 'reduce' : 'no-preference' }] }), sleep(5000).then(() => { throw new Error('setEmulatedMedia timed out'); })]);
}
async function recordEntrance(w, file, dir, ms) {
  fs.mkdirSync(dir, { recursive: true }); const t0 = Date.now(); const times = [];
  const p = w.loadURL(pathToFileURL(file).href).catch(() => {});
  let k = 0; while (Date.now() - t0 < ms) { const img = await grab(w); if (img) { fs.writeFileSync(path.join(dir, String(k++).padStart(4, '0') + '.png'), img.toPNG()); times.push(Date.now() - t0); } }
  await p; return { frames: k, ms: Date.now() - t0, times };
}
function toVideo(dir, frames, ms, out) { if (!frames) return 'no frames'; const fps = Math.max(1, Math.round(frames / (ms / 1000))); return ffmpeg(['-framerate', String(fps), '-i', path.join(dir, '%04d.png'), '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '26', out]) || `${frames} frames @${fps}fps`; }

async function capturePage(w, pg, view, width, height) {
  const out = path.join(job.outDir, 'pages', pg.id, view); fs.mkdirSync(out, { recursive: true });
  const rec = {};
  // entrance + loop
  await load(w, pg.file, width, height, false);
  const ent = await recordEntrance(w, pg.file, path.join(out, 'entrance-frames'), 4200);
  rec.entranceVideo = toVideo(path.join(out, 'entrance-frames'), ent.frames, ent.ms, path.join(out, 'entrance.mp4'));
  rec.entranceFrames = ent.frames; rec.firstFrameMs = ent.times[0];
  // stills from the entrance for the report
  [[0.15, 'entrance-a'], [0.45, 'entrance-b'], [0.99, 'entrance-c']].forEach(([f, name]) => { const i = Math.min(ent.frames - 1, Math.floor(ent.frames * f)); if (i >= 0) fs.copyFileSync(path.join(out, 'entrance-frames', String(i).padStart(4, '0') + '.png'), path.join(out, name + '.png')); });
  await sleep(800);
  rec.hero = await js(w, MEASURE_HERO);
  const a = await grab(w); fs.writeFileSync(path.join(out, 'loop-a.png'), a.toPNG()); await sleep(3500);
  const b = await grab(w); fs.writeFileSync(path.join(out, 'loop-b.png'), b.toPNG());
  rec.loopChangedPct = diffShare(a, b); rec.heroLuma = lumaStats(b);
  rec.heroLater = await js(w, MEASURE_HERO);
  // scroll
  const sdir = path.join(out, 'scroll-frames'); fs.mkdirSync(sdir, { recursive: true });
  const docH = await js(w, 'document.scrollingElement.scrollHeight'); const steps = []; let k = 0; const t0 = Date.now();
  for (let y = 0; y <= docH - height + height * 0.2; y += Math.round(height * 0.2)) {
    await js(w, `window.scrollTo({ top: ${y}, behavior: 'instant' }); true`); await sleep(110);
    const img = await grab(w); if (!img) continue; fs.writeFileSync(path.join(sdir, String(k++).padStart(4, '0') + '.png'), img.toPNG());
    const st = lumaStats(img); const ov = await js(w, `document.scrollingElement.scrollWidth > document.scrollingElement.clientWidth + 1`);
    steps.push({ y, sd: st.sd, blank: st.sd < 2.5, overflow: ov });
  }
  rec.scrollVideo = toVideo(sdir, k, Math.max(1, (Date.now() - t0)), path.join(out, 'scroll.mp4'));
  rec.scroll = { steps: steps.length, blankFrames: steps.filter(s => s.blank).map(s => s.y), overflowAt: steps.filter(s => s.overflow).map(s => s.y) };
  await sleep(600); rec.after = await js(w, AFTER_SCROLL);
  // stitched full page (nav unpinned so it appears once)
  rec.fullPage = await fullPage(w, out, 'full', height);
  // reduced motion -- in a fresh window (after the long scroll sequence the desktop window can stop painting)
  const wr = newWindow();
  try {
    await load(wr, pg.file, width, height, true);
    await wr.loadURL(pathToFileURL(pg.file).href).catch(() => {}); await sleep(400);
    const r1 = await grab(wr); if (r1) fs.writeFileSync(path.join(out, 'reduced-a.png'), r1.toPNG()); rec.reducedHeroA = await js(wr, MEASURE_HERO);
    await sleep(3000); const r2 = await grab(wr); if (r2) fs.writeFileSync(path.join(out, 'reduced-b.png'), r2.toPNG());
    rec.reducedChangedPct = r1 && r2 ? diffShare(r1, r2) : null;
    await js(wr, `window.scrollTo(0, document.scrollingElement.scrollHeight); true`); await sleep(500);
    rec.reducedAfter = await js(wr, AFTER_SCROLL);
    if (view === 'desktop') rec.reducedFullPage = await fullPage(wr, out, 'reduced-full', height);
  } finally { wr.destroy(); }
  return rec;
}
async function fullPage(w, out, name, height) {
  await js(w, `(() => { const s = document.createElement('style'); s.id = '__unpin'; s.textContent = '.cr-nav{position:absolute!important}.cr-fixture{position:absolute!important}'; document.head.appendChild(s); document.querySelectorAll('.cr-reveal, .sc').forEach(e => e.classList.add('is-seen', 'is-in')); return true; })()`);
  const docH = await js(w, 'document.scrollingElement.scrollHeight'); const n = Math.min(24, Math.ceil(docH / height)); const files = [];
  const dir = path.join(out, name + '-parts'); fs.mkdirSync(dir, { recursive: true });
  for (let i = 0; i < n; i++) { const y = Math.min(i * height, docH - height); await js(w, `window.scrollTo({ top: ${y}, behavior: 'instant' }); true`); await sleep(260); const img = await grab(w); if (!img) continue; let im = img; if (i === n - 1 && i * height > docH - height) { const cut = Math.round((i * height - (docH - height)) * (img.getSize().height / height)); im = img.crop({ x: 0, y: cut, width: img.getSize().width, height: img.getSize().height - cut }); } const f = path.join(dir, `${String(i).padStart(2, '0')}.png`); fs.writeFileSync(f, im.toPNG()); files.push(f); }
  await js(w, `(() => { const s = document.getElementById('__unpin'); if (s) s.remove(); return true; })()`);
  const outFile = path.join(out, name + '.png');
  const err = files.length > 1 ? ffmpeg([...files.flatMap(f => ['-i', f]), '-filter_complex', `${files.map((_, i) => `[${i}]`).join('')}vstack=inputs=${files.length}`, outFile]) : (files[0] && fs.copyFileSync(files[0], outFile), null);
  return err || `${files.length} parts, ${docH}px`;
}

function newWindow() {
  // visible (so it paints) but deaf to real mouse/keyboard input -- a stray wheel over it must not scroll a recording
  const w = new BrowserWindow({ width: 1440, height: 900, show: true, focusable: false, useContentSize: true, webPreferences: { backgroundThrottling: false } });
  w.setIgnoreMouseEvents(true);
  w.webContents.debugger.attach('1.3');
  return w;
}
app.on('window-all-closed', () => {}); // windows are replaced one at a time; quit only when done
app.whenReady().then(async () => {
  session.defaultSession.webRequest.onBeforeRequest((d, cb) => { if (/^https?:/.test(d.url)) { blocked.push(d.url); return cb({ cancel: true }); } cb({}); });
  const report = {};
  for (const pg of job.pages) {
    const r = report[pg.id] = {}; blocked = [];
    for (const [view, width, height] of VIEWS) {
      const wv = newWindow(); // a fresh window per page and size
      try { r[view] = await capturePage(wv, pg, view, width, height); process.stdout.write(`captured ${pg.id} ${view}\n`); }
      catch (e) { r[view] = { error: String(e && e.stack || e).slice(0, 400) }; process.stdout.write(`FAIL ${pg.id} ${view} ${String(e).slice(0, 200)}\n`); }
      finally { wv.destroy(); }
    }
    const w = newWindow();
    r.blockedRequests = blocked.slice(0, 20); r.blockedCount = blocked.length;
    // a failed picture: copy the export, delete its main picture and one section picture
    try {
      const html = fs.readFileSync(pg.file, 'utf8');
      const subj = (/data-role="subject"[\s\S]*?src="(assets\/[^"]+)"/.exec(html) || [])[1];
      const other = [...html.matchAll(/<img[^>]*src="(assets\/[^"]+)"/g)].map(m => m[1]).find(s => s !== subj);
      const fdir = path.join(job.outDir, 'pages', pg.id, 'failed-export'); fs.rmSync(fdir, { recursive: true, force: true }); fs.cpSync(pg.dir, fdir, { recursive: true });
      [subj, other].filter(Boolean).forEach(f => fs.rmSync(path.join(fdir, f), { force: true }));
      r.failure = { removed: [subj, other].filter(Boolean) };
      for (const [view, width, height] of VIEWS) {
        await load(w, null, width, height, false); await w.loadURL(pathToFileURL(path.join(fdir, 'index.html')).href).catch(() => {}); await sleep(3500);
        const img = await grab(w); if (img) fs.writeFileSync(path.join(job.outDir, 'pages', pg.id, view, 'failed-hero.png'), img.toPNG());
        r.failure[view] = await js(w, MEASURE_HERO);
        r.failure[view + 'After'] = await js(w, `(() => { document.querySelectorAll('.cr-reveal, .sc').forEach(e => e.classList.add('is-seen', 'is-in')); const m = document.querySelectorAll('[data-img].is-missing'); const el = m[m.length - 1]; if (el) el.scrollIntoView({ block: 'center' }); return { missingFigures: m.length }; })()`);
        await sleep(600); const img2 = await grab(w); if (img2) fs.writeFileSync(path.join(job.outDir, 'pages', pg.id, view, 'failed-section.png'), img2.toPNG());
      }
    } catch (e) { r.failure = { error: String(e).slice(0, 300) }; }
    w.destroy();
    fs.writeFileSync(path.join(job.outDir, 'capture-report.json'), JSON.stringify(report, null, 1));
  }
  fs.writeFileSync(path.join(job.outDir, 'capture-report.json'), JSON.stringify(report, null, 1));
  app.quit();
});
