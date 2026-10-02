'use strict';
// Electron: opens an EXPORTED website that has a 3D scene, in a real browser with real WebGL, and reports what happened --
// the one thing the Node tests cannot see. Not part of `npm test` (it needs Electron and a GPU); run it after
// scripts/three-d-demo.js:
//
//   electron test/review/three-d-probe.js <site folder> <out folder> [<the same site without 3D>]
//   electron test/review/three-d-probe.js <site folder> <out folder> --reduced     (the reduced-motion check: its own run)
//   (inside VS Code's terminal, clear ELECTRON_RUN_AS_NODE first -- with it set, Electron runs as plain Node)
//
// It serves the folder with a bare static server (as a web host would), BLOCKS every request that is not to that server
// (and lists any that were attempted: an export must need none), and checks, each in a fresh window:
//   desktop     the model loads and is drawn; scrolling through its scene turns it (the drawn angle follows the scroll);
//               no horizontal overflow; the engine and the model were fetched from the site's own folder, once each
//   reduced     prefers-reduced-motion: 3D never starts, nothing 3D is downloaded, the picture is shown
//   phone       390 px wide: the lighter draw (or the picture, if the plan says so); no horizontal overflow
//   disk        the page opened straight from disk: the picture, no engine request
//   flat        the same page exported without 3D: no 3D state, no engine request
// Screenshots of each go to the out folder, and the whole report to probe.json.
const { app, BrowserWindow, session } = require('electron');
const fs = require('fs');
const http = require('http');
const path = require('path');
const { pathToFileURL } = require('url');

const [siteDir, outDir, flatDir] = process.argv.slice(2).filter(a => !/three-d-probe\.js$/.test(a) && !a.startsWith('--'));
const REDUCED = process.argv.includes('--reduced');
// (each check opens and closes its own window: closing the last one must not end the run)
app.on('window-all-closed', () => {});
if (REDUCED) app.commandLine.appendSwitch('force-prefers-reduced-motion');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.glb': 'model/gltf-binary', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.mp4': 'video/mp4', '.json': 'application/json', '.txt': 'text/plain' };
function serve(dir) {
  const root = path.resolve(dir); const hits = [];
  return new Promise(resolve => {
    const srv = http.createServer((req, res) => {
      const rel = decodeURIComponent(String(req.url).split('?')[0]); const file = path.resolve(root, '.' + (rel.endsWith('/') ? rel + 'index.html' : rel)); hits.push(rel);
      if (!file.startsWith(root) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' }); fs.createReadStream(file).pipe(res);
    });
    srv.listen(0, '127.0.0.1', () => resolve({ srv, hits, url: `http://127.0.0.1:${srv.address().port}/` }));
  });
}
const js = (w, code) => w.webContents.executeJavaScript(code);
async function shot(w, file) {
  let img = null;
  for (let t = 0; t < 30 && (!img || img.isEmpty()); t++) { try { img = await w.webContents.capturePage(); } catch (e) { img = null; } if (!img || img.isEmpty()) await sleep(100); }
  if (img && !img.isEmpty()) fs.writeFileSync(file, img.toPNG());
  return !!(img && !img.isEmpty());
}
const STATE = `(() => { const s = window.__sr3d; const el = document.querySelector('.td-stage'); const cv = el && el.querySelector('canvas'); const r = el ? el.getBoundingClientRect() : null; const sec = el ? el.closest('.sc') : null;
  return { has: !!s, state: s ? s.state : null, why: s ? s.why : null, engine: s ? s.engine : null, stages: s ? s.stages.map(x => ({ id: x.id, state: x.state, why: x.why, p: x.p, frames: x.frames, pose: x.pose || null, info: x.info || null })) : [],
    stageOnPage: !!el, canvas: !!cv, stageBox: r ? [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)] : null, live: !!document.querySelector('.sc.td-live'),
    overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth, motion: document.documentElement.getAttribute('data-motion'), sectionTop: sec ? Math.round(sec.getBoundingClientRect().top + scrollY) : null, sectionH: sec ? sec.offsetHeight : null, pinned: sec ? sec.hasAttribute('data-pin') : null, vh: innerHeight, pageH: document.documentElement.scrollHeight }; })()`;
async function stagePixels(w) {
  const b = await js(w, `(() => { const el = document.querySelector('.td-stage'); if (!el) return null; const r = el.getBoundingClientRect(); const x = Math.max(0, r.left), y = Math.max(0, r.top); return { x: Math.round(x), y: Math.round(y), width: Math.round(Math.min(innerWidth, r.right) - x), height: Math.round(Math.min(innerHeight, r.bottom) - y) }; })()`);
  if (!b || b.width < 8 || b.height < 8) return null;
  const img = await w.webContents.capturePage(b); if (!img || img.isEmpty()) return null;
  const d = img.toBitmap(); let sig = 0; for (let i = 0; i < d.length; i += 16) sig = (sig * 31 + d[i] + d[i + 1] * 3 + d[i + 2] * 7) % 1000000007;
  return { box: [b.x, b.y, b.width, b.height], signature: sig };
}
const is3D = u => /sr3d\.min\.js$/.test(u) || /\.glb$/.test(u);

function open(opts) {
  const o = Object.assign({ width: 1440, height: 900 }, opts);
  return new BrowserWindow({ width: o.width, height: o.height, useContentSize: true, show: false, webPreferences: { backgroundThrottling: false, contextIsolation: true } });
}
async function waitFor(w, test, ms) { const t0 = Date.now(); for (;;) { const s = await js(w, STATE); if (test(s) || Date.now() - t0 > ms) return s; await sleep(150); } }
const settled = s => s.stages.length > 0 && s.stages.every(x => x.state === 'on' || x.state === 'poster');

async function main() {
  fs.mkdirSync(outDir, { recursive: true });
  const site = await serve(siteDir); const flat = flatDir && fs.existsSync(flatDir) ? await serve(flatDir) : null; const blocked = [];
  const local = u => u.startsWith(site.url) || (flat && u.startsWith(flat.url)) || /^(file|data|blob|devtools|chrome-extension):/.test(u);
  session.defaultSession.webRequest.onBeforeRequest((d, cb) => { const ok = local(d.url); if (!ok) blocked.push(d.url); cb({ cancel: !ok }); });
  const file = path.join(outDir, 'probe.json');
  const out = REDUCED && fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : { site: siteDir, electron: process.versions.electron, chrome: process.versions.chrome, gpu: null, blockedRequests: blocked };
  try { const g = await app.getGPUInfo('basic'); out.gpu = (g.gpuDevice || []).filter(x => x.active).map(x => `vendor ${x.vendorId} device ${x.deviceId}`).join('; ') || 'none active'; } catch (e) { out.gpu = 'unknown'; }
  const only = REDUCED ? ['reduced'] : ['desktop', 'phone', 'disk', 'flat'];
  const scenario = async (name, fn) => { if (!only.includes(name)) return; let w = null; try { out[name] = await fn(x => { w = x; return x; }); } catch (e) { out[name] = { error: String((e && e.message) || e) }; } try { if (w && !w.isDestroyed()) w.destroy(); } catch (e) { /* closing */ } fs.writeFileSync(file, JSON.stringify(out, null, 2)); };

  // ---- desktop: the model loads, and the scroll turns it
  await scenario('desktop', async keep => {
    site.hits.length = 0; const w = keep(open()); await w.loadURL(site.url);
    await sleep(1500); const first = await js(w, STATE); const lazy = { state: first.state, engine: first.engine, fetched3D: site.hits.filter(is3D) };
    await js(w, `window.scrollTo(0, ${Math.max(0, first.sectionTop - first.vh)})`); const ready = await waitFor(w, settled, 25000);
    const d = { atLoadBeforeScrolling: lazy, ready, steps: [] };
    if (ready.stages[0] && ready.stages[0].state === 'on') {
      const top = ready.sectionTop, h = ready.sectionH, vh = ready.vh;
      for (const f of [0, 0.25, 0.5, 0.75, 1]) {
        const y = Math.max(0, Math.round(ready.pinned ? top + f * (h - vh) : top - vh + f * (h + vh))); await js(w, `window.scrollTo(0, ${y})`); await sleep(900);
        const s = await js(w, STATE); const px = await stagePixels(w); const name = `desktop-${Math.round(f * 100)}.png`; await shot(w, path.join(outDir, name));
        d.steps.push({ at: f, scrollY: y, p: +s.stages[0].p.toFixed(3), rotYdeg: s.stages[0].pose ? +(s.stages[0].pose.rotY * 180 / Math.PI).toFixed(1) : null, frames: s.stages[0].frames, pixels: px, pictureHidden: s.live, overflowX: s.overflowX, screenshot: name });
      }
      // (resting: no frames are drawn while nothing changes)
      const f0 = (await js(w, STATE)).stages[0].frames; await sleep(1200); d.framesWhileResting = (await js(w, STATE)).stages[0].frames - f0;
    }
    d.fetched = { engine: site.hits.filter(u => /sr3d\.min\.js$/.test(u)).length, model: site.hits.filter(u => /\.glb$/.test(u)).length, all: site.hits.slice() };
    return d;
  });
  // ---- reduced motion: nothing 3D starts or is downloaded
  await scenario('reduced', async keep => {
    site.hits.length = 0; const w = keep(open()); await w.loadURL(site.url); await sleep(2500);
    const s = await js(w, STATE); await js(w, `window.scrollTo(0, ${Math.max(0, (s.sectionTop || 0) - 100)})`); await sleep(700); await shot(w, path.join(outDir, 'reduced.png'));
    const media = await js(w, 'matchMedia("(prefers-reduced-motion: reduce)").matches');
    return { mediaQueryMatches: media, state: s.state, why: s.why, stage: s.stages[0] || null, canvas: s.canvas, motion: s.motion, fetched3D: site.hits.filter(is3D) };
  });
  // ---- phone
  await scenario('phone', async keep => {
    site.hits.length = 0; const w = keep(open({ width: 390, height: 844 })); await w.loadURL(site.url);
    await sleep(800); const s0 = await js(w, STATE); await js(w, `window.scrollTo(0, ${Math.max(0, (s0.sectionTop || 0) - 60)})`); await waitFor(w, settled, 25000); await sleep(1200);
    const t = await js(w, STATE); const px = await stagePixels(w); await shot(w, path.join(outDir, 'phone.png'));
    return { viewport: await js(w, '[innerWidth, innerHeight]'), state: t.state, why: t.why, stage: t.stages[0] || null, stageBox: t.stageBox, overflowX: t.overflowX, pixels: px, fetched3D: site.hits.filter(is3D) };
  });
  // ---- opened from disk
  await scenario('disk', async keep => {
    site.hits.length = 0; const w = keep(open()); await w.loadURL(pathToFileURL(path.join(siteDir, 'index.html')).href); await sleep(2500);
    const s = await js(w, STATE); await js(w, `window.scrollTo(0, ${Math.max(0, (s.sectionTop || 0) - 100)})`); await sleep(700); await shot(w, path.join(outDir, 'disk.png'));
    return { state: s.state, why: s.why, canvas: s.canvas, engineScripts: await js(w, '[...document.scripts].filter(x => /sr3d/.test(x.src)).length'), serverHits: site.hits.length };
  });
  // ---- the same page exported without 3D
  if (flat) await scenario('flat', async keep => {
    const w = keep(open()); await w.loadURL(flat.url); await sleep(2000);
    const s = await js(w, STATE); await js(w, 'window.scrollTo(0, document.documentElement.scrollHeight)'); await sleep(800);
    return { has3DState: s.has, stageOnPage: s.stageOnPage, requests: flat.hits.slice(), engineRequested: flat.hits.some(u => /sr3d/.test(u)), modelRequested: flat.hits.some(u => /\.glb$/.test(u)) };
  });
  fs.writeFileSync(file, JSON.stringify(out, null, 2));
  site.srv.close(); if (flat) flat.srv.close();
}
app.whenReady().then(main).then(() => app.quit()).catch(e => { try { fs.mkdirSync(outDir, { recursive: true }); fs.writeFileSync(path.join(outDir, 'probe-error.txt'), String((e && e.stack) || e)); } catch (x) { /* nowhere to write */ } app.exit(1); });
