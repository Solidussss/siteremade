'use strict';
// CREATIVE -- the visual director's eyes (server-only): a finished Creative page rendered in a headless Chromium and
// captured scene by scene at 1440 and 390, as the visitor would see it (never the editor). No dependency: the browser is
// driven over the DevTools protocol with Node's own WebSocket, in a throwaway profile, and always closed.
//
// The browser is the one the server is told to use (CREATIVE_VISUAL_BROWSER = a Chromium/Chrome/Edge executable, or
// 'auto' to look in the usual places). None configured, none found, a launch that fails, a page that will not load, a
// capture that runs past its time: capture() rejects, and the visual review is skipped -- the page ships as it was.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { pathToFileURL } = require('url');

const VIEWS = { desktop: { width: 1440, height: 900, mobile: false }, mobile: { width: 390, height: 844, mobile: true } };
const CANDIDATES = process.platform === 'win32'
  ? [['PROGRAMFILES', 'Google/Chrome/Application/chrome.exe'], ['PROGRAMFILES(X86)', 'Google/Chrome/Application/chrome.exe'], ['LOCALAPPDATA', 'Google/Chrome/Application/chrome.exe'], ['PROGRAMFILES(X86)', 'Microsoft/Edge/Application/msedge.exe'], ['PROGRAMFILES', 'Microsoft/Edge/Application/msedge.exe']].map(([v, p]) => (process.env[v] ? path.join(process.env[v], p) : null)).filter(Boolean)
  : ['/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/snap/bin/chromium', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'];

// which browser: the configured executable, or the first usual one when asked to look ('auto'); else none
function findBrowser(env) {
  const v = String((env || process.env).CREATIVE_VISUAL_BROWSER || '').trim();
  if (!v || /^(off|none|0|false)$/i.test(v)) return null;
  if (v.toLowerCase() === 'auto') return CANDIDATES.find(p => { try { return fs.statSync(p).isFile(); } catch (e) { return false; } }) || null;
  try { return fs.statSync(v).isFile() ? v : null; } catch (e) { return null; }
}

const sleep = ms => new Promise(r => setTimeout(r, ms));
function rm(dir) { for (let i = 0; i < 5; i++) { try { fs.rmSync(dir, { recursive: true, force: true }); return; } catch (e) { /* (a closing browser still holds files on Windows) */ } } }

// one DevTools connection: commands answered by id, events waited for by name
class CDP {
  constructor(ws) {
    this.ws = ws; this.id = 0; this.pending = new Map(); this.waiters = [];
    ws.addEventListener('message', ev => { let m; try { m = JSON.parse(typeof ev.data === 'string' ? ev.data : Buffer.from(ev.data).toString()); } catch (e) { return; } this.onMessage(m); });
    ws.addEventListener('close', () => { this.pending.forEach(p => p.rej(new Error('the browser closed'))); this.pending.clear(); });
  }
  send(method, params, sessionId) {
    const id = ++this.id; const msg = { id, method, params: params || {} }; if (sessionId) msg.sessionId = sessionId;
    return new Promise((res, rej) => { this.pending.set(id, { res, rej, method }); try { this.ws.send(JSON.stringify(msg)); } catch (e) { this.pending.delete(id); rej(e); } });
  }
  onMessage(m) {
    if (m.id) { const p = this.pending.get(m.id); if (!p) return; this.pending.delete(m.id); if (m.error) p.rej(new Error(`${p.method}: ${m.error.message}`)); else p.res(m.result || {}); return; }
    this.waiters = this.waiters.filter(w => { if (w.method !== m.method || (w.sessionId && w.sessionId !== m.sessionId)) return true; clearTimeout(w.timer); w.res(m.params || {}); return false; });
  }
  once(method, sessionId, ms) {
    return new Promise((res, rej) => { const w = { method, sessionId, res }; w.timer = setTimeout(() => { this.waiters = this.waiters.filter(x => x !== w); rej(new Error(`timed out waiting for ${method}`)); }, ms); this.waiters.push(w); });
  }
}

// launch(browserPath) -> { cdp, page(view), close() }
async function launch(browserPath, opts) {
  const o = opts || {}; const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'sr-visual-profile-'));
  const args = ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--disable-background-networking', '--disable-sync', '--mute-audio', '--hide-scrollbars',
    '--allow-file-access-from-files', '--disable-features=Translate,MediaRouter', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--force-color-profile=srgb', 'about:blank'];
  const proc = spawn(browserPath, args, { stdio: 'ignore', windowsHide: true });
  let exited = false; proc.on('exit', () => { exited = true; }); proc.on('error', () => { exited = true; });
  const killAll = async () => { try { proc.kill(); } catch (e) { /* gone */ } for (let i = 0; i < 20 && !exited; i++) await sleep(100); rm(profile); };
  let ws = null;
  try {
    const portFile = path.join(profile, 'DevToolsActivePort'); let lines = null;
    for (let i = 0; i < 150 && !lines; i++) { if (exited) throw new Error('the browser exited at launch'); try { const t = fs.readFileSync(portFile, 'utf8').trim().split(/\r?\n/); if (t.length >= 2 && +t[0] > 0) lines = t; } catch (e) { /* not yet */ } if (!lines) await sleep(100); }
    if (!lines) throw new Error('the browser did not start');
    ws = await new Promise((res, rej) => { const w = new WebSocket(`ws://127.0.0.1:${lines[0]}${lines[1]}`); w.addEventListener('open', () => res(w)); w.addEventListener('error', () => rej(new Error('could not connect to the browser'))); });
  } catch (e) { await killAll(); throw e; }
  const cdp = new CDP(ws);
  async function page(view) {
    const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
    const s = (m, p) => cdp.send(m, p, sessionId);
    await s('Page.enable'); await s('Runtime.enable');
    await s('Emulation.setDeviceMetricsOverride', { width: view.width, height: view.height, deviceScaleFactor: 1, mobile: !!view.mobile });
    if (view.mobile) await s('Emulation.setTouchEmulationEnabled', { enabled: true });
    // the page as a visitor sees it (full motion unless asked otherwise); goto() then stills it (below)
    await s('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: o.motion || 'no-preference' }] });
    const evaluate = async expr => { const r = await s('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(`page script: ${(r.exceptionDetails.exception && r.exceptionDetails.exception.description || r.exceptionDetails.text || '').slice(0, 200)}`); return r.result && r.result.value; };
    return {
      view, s, evaluate,
      async goto(url, settleMs) {
        const loaded = cdp.once('Page.loadEventFired', sessionId, o.loadMs || 20000);
        await s('Page.navigate', { url }); await loaded;
        await evaluate(`(async () => { try { await document.fonts.ready; } catch (e) {} await Promise.all([...document.images].map(i => i.complete ? 0 : new Promise(r => { i.onload = i.onerror = r; setTimeout(r, 4000); }))); await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); return 1; })()`);
        // every entrance and transition at its end: each scene is judged where it rests, never caught mid-reveal
        if (o.still !== false) await evaluate(`(() => { const st = document.createElement('style'); st.id = 'sr-vis-still'; st.textContent = '*,*::before,*::after{transition-duration:0s!important;transition-delay:0s!important;animation-duration:0s!important;animation-delay:0s!important;animation-iteration-count:1!important}'; document.head.appendChild(st); return 1; })()`);
        if (settleMs) await sleep(settleMs);
      },
      async scrollTo(y) { await evaluate(`(async () => { document.documentElement.style.scrollBehavior = 'auto'; window.scrollTo(0, ${Math.max(0, Math.round(y))}); window.dispatchEvent(new Event('scroll')); await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); return 1; })()`); await sleep(o.scrollMs || 160); },
      // (the clip is in page coordinates: the screen as it is now is the one at the current scroll)
      async shot(fmt, quality, scale) { const y = await evaluate('scrollY'); const r = await s('Page.captureScreenshot', { format: fmt || 'png', ...(fmt === 'jpeg' ? { quality: quality || 70 } : {}), clip: { x: 0, y, width: view.width, height: view.height, scale: scale || 1 }, captureBeyondViewport: false, fromSurface: true }); return Buffer.from(r.data, 'base64'); },
      close: () => cdp.send('Target.closeTarget', { targetId }).catch(() => {}),
    };
  }
  async function close() { try { await Promise.race([cdp.send('Browser.close'), sleep(1500)]); } catch (e) { /* closing */ } try { ws.close(); } catch (e) { /* closed */ } await killAll(); }
  return { cdp, page, close };
}

// the page written where the browser can read it: its HTML and every file it names (pictures, fonts)
function writeSite(html, files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sr-visual-site-'));
  Object.entries(files || {}).forEach(([name, buf]) => { const f = path.join(dir, name); if (!f.startsWith(dir)) return; fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, buf); });
  const file = path.join(dir, 'index.html'); fs.writeFileSync(file, html);
  return { dir, url: pathToFileURL(file).href };
}

// capture({ html, files, browser, measure(pageCtx) -> script, views, timeoutMs }) ->
//   { ms, views: { desktop: { page, scenes: [{ i, m (the in-page measure), shot (PNG, half size), bare (PNG without words) }] }, mobile: ... } }
// One browser; desktop and mobile side by side; every scene at the place it rests; never longer than timeoutMs.
async function capture(input, live) {
  const t0 = Date.now(); const budget = input.timeoutMs || 45000;
  const site = writeSite(input.html, input.files); let br = null;
  const work = (async () => {
    br = live || await launch(input.browser, { motion: input.motion });
    const out = {};
    await Promise.all(Object.entries(input.views || VIEWS).map(async ([name, view]) => {
      const pg = await br.page(view);
      try {
        await pg.goto(site.url, input.settleMs == null ? 500 : input.settleMs);
        const page = await pg.evaluate(input.pageScript);
        const scenes = [];
        for (const sc of page.scenes) {
          // (a held scene rests in the middle of its hold; any other at its top)
          await pg.scrollTo(sc.rest == null ? sc.at : sc.rest);
          const m = await pg.evaluate(input.measureScript(sc.i));
          const shot = await pg.shot('png', 0, input.scale || 0.5);
          // the same view without its words: what the words stand on (contrast)
          await pg.evaluate(`(() => { const st = document.createElement('style'); st.id = 'sr-vis-bare'; st.textContent = '.sc-text,.sc-count{visibility:hidden!important}'; document.head.appendChild(st); return 1; })()`);
          await new Promise(r => setTimeout(r, 60));
          const bare = await pg.shot('png', 0, input.scale || 0.5);
          await pg.evaluate(`(() => { const st = document.getElementById('sr-vis-bare'); if (st) st.remove(); return 1; })()`);
          scenes.push({ i: sc.i, m, shot, bare });
        }
        out[name] = { page, scenes };
      } finally { await pg.close(); }
    }));
    return out;
  })();
  let timer = null;
  const timeout = new Promise((_, rej) => { timer = setTimeout(() => rej(new Error(`the capture ran past ${Math.round(budget / 1000)}s`)), budget); });
  try { const views = await Promise.race([work, timeout]); return { ms: Date.now() - t0, views }; }
  finally { clearTimeout(timer); if (br && !live) await br.close(); rm(site.dir); }
}

// sheet(browser, tiles: [{ png|jpeg Buffer, label }], { cols, w, h }) -> JPEG: a contact sheet the model can see at once
async function sheet(br, tiles, opt) {
  const o = Object.assign({ cols: 3, w: 360, h: 225, quality: 62 }, opt || {}); const rows = Math.ceil(tiles.length / o.cols);
  const width = o.cols * (o.w + 6) + 6, height = rows * (o.h + 22) + 6;
  const html = `<!doctype html><html><body style="margin:0;background:#202020;font:12px/16px system-ui,sans-serif;color:#ddd"><div style="display:grid;grid-template-columns:repeat(${o.cols},${o.w}px);gap:6px;padding:6px">${tiles.map(t => `<div><img src="data:image/png;base64,${t.png.toString('base64')}" style="display:block;width:${o.w}px;height:${o.h}px;object-fit:cover"><div style="height:16px;overflow:hidden">${String(t.label || '').replace(/[<&>]/g, '')}</div></div>`).join('')}</div></body></html>`;
  const site = writeSite(html, {});
  const pg = await br.page({ width, height, mobile: false });
  try { await pg.goto(site.url, 50); return await pg.shot('jpeg', o.quality, 1); } finally { await pg.close(); rm(site.dir); }
}

module.exports = { VIEWS, findBrowser, launch, capture, sheet, writeSite };
