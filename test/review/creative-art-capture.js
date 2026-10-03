'use strict';
// Electron: captures EXPORTED Creative pages for the art-direction review (creative-art-qa.js) and measures what the
// eye would judge -- at desktop (1440x900), tablet (768) and six phone widths (320-430, true mobile emulation):
//   frames     the hero and the first scenes, including the middle of each held (pinned) scene, so a scene's
//              choreography is seen mid-flight, not only at rest
//   crops      every visible picture: how much of it its frame cuts away (against its framing budget), how far it is
//              enlarged on screen (transform scale), and how much of its measured subject stays in view
//   layout     sideways overflow of the page, words running off the screen, how long the held scenes are, whether the
//              footer can be reached (nothing traps the reader)
//   reduced    prefers-reduced-motion: the still composition
//   electron creative-art-capture.js job.json   job: { outDir, pages: [{ id, file }] }
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const job = JSON.parse(fs.readFileSync(process.argv[process.argv.length - 1], 'utf8'));
const sleep = ms => new Promise(r => setTimeout(r, ms));
app.disableHardwareAcceleration();
const VIEWS_ALL = [['desktop', 1440, 900, false], ['tablet', 768, 1024, true], ['p320', 320, 640, true], ['p360', 360, 760, true], ['p375', 375, 812, true], ['p390', 390, 844, true], ['p412', 412, 900, true], ['p430', 430, 932, true]];
// (job.views: only these views -- e.g. ['desktop', 'p390'] for a quick review)
const VIEWS = Array.isArray(job.views) ? VIEWS_ALL.filter(v => job.views.includes(v[0])) : VIEWS_ALL;

const MEASURE = `(() => {
  const vw = document.documentElement.clientWidth, vh = innerHeight; const out = { overflowX: document.scrollingElement.scrollWidth - vw, textOff: [], crops: [], scaleMax: 1 };
  const vis = el => { const cs = getComputedStyle(el); if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0) return false; let p = el; while (p && p !== document.body) { const c = getComputedStyle(p); if (c.display === 'none' || +c.opacity < 0.05) return false; p = p.parentElement; } return true; };
  // words: headings, paragraphs and list lines that run off the side of the screen (decorative giant words are exempt)
  document.querySelectorAll('.sc-text h1, .sc-text h2, .sc-text p, .sc-text li, .cr-nav a').forEach(el => { const r = el.getBoundingClientRect(); if (!r.width || r.bottom < 0 || r.top > vh || !vis(el)) return; if (r.right > vw + 2 || r.left < -2) out.textOff.push({ t: el.textContent.trim().slice(0, 40), l: Math.round(r.left), r: Math.round(r.right) }); });
  // words covered by a picture drawn over them (sampled: what is on top at points inside each line of text)
  out.covered = [];
  document.querySelectorAll('.sc-text h1, .sc-text h2, .sc-text p, .sc-text li, .sc-text .sc-cta').forEach(el => { const r = el.getBoundingClientRect(); if (!r.width || r.bottom < 0 || r.top > vh || !vis(el)) return;
    let hit = 0, n = 0; for (const fx of [0.15, 0.5, 0.85]) for (const fy of [0.3, 0.7]) { const x = r.left + r.width * fx, y = r.top + r.height * fy; if (x < 0 || y < 0 || x >= vw || y >= vh) continue; n++; const top = document.elementFromPoint(x, y); if (top && !el.contains(top) && top.closest('.ly[data-img], .ly[data-kind="image"]') && top.closest('.sc') === el.closest('.sc')) hit++; }
    if (n && hit / n > 0.34) out.covered.push(el.textContent.trim().slice(0, 40)); });
  document.querySelectorAll('.ly-img').forEach(img => {
    const r = img.getBoundingClientRect(); if (!img.naturalWidth || !r.width || r.bottom < 0 || r.top > vh || !vis(img)) return;
    const w = img.offsetWidth, h = img.offsetHeight; if (!w || !h) return;
    const cs = getComputedStyle(img); const ai = img.naturalWidth / img.naturalHeight, ab = w / h;
    let crop = 0, axis = ''; if (cs.objectFit === 'cover') { crop = ai > ab ? 1 - ab / ai : 1 - ai / ab; axis = ai > ab ? 'x' : 'y'; }
    // true enlargement: every transform and scale between the picture and its scene, multiplied (a rotation is not a zoom)
    let scale = 1; for (let p = img; p && !p.classList.contains('sc'); p = p.parentElement) { const c = getComputedStyle(p); if (c.transform && c.transform !== 'none') { const m = new DOMMatrix(c.transform); scale *= Math.hypot(m.a, m.b); } if (c.scale && c.scale !== 'none') scale *= parseFloat(c.scale) || 1; }
    out.scaleMax = Math.max(out.scaleMax, scale);
    // how much of the measured subject is inside the crop window
    let subjIn = null; const sj = (img.getAttribute('data-subj') || '').split(' ').map(Number);
    if (sj.length === 4 && !isNaN(sj[0]) && crop > 0.001) { const pos = cs.objectPosition.split(' ').map(v => parseFloat(v) / 100); const v = 1 - crop; if (axis === 'x') { const st = pos[0] * (1 - v); subjIn = Math.max(0, Math.min(st + v, sj[2]) - Math.max(st, sj[0])) / (sj[2] - sj[0]); } else { const st = pos[1] * (1 - v); subjIn = Math.max(0, Math.min(st + v, sj[3]) - Math.max(st, sj[1])) / (sj[3] - sj[1]); } }
    const ly = img.closest('.ly'); const budget = img.hasAttribute('data-crop') ? +img.getAttribute('data-crop') : null;
    out.crops.push({ asset: img.getAttribute('data-asset'), frame: ly && ly.getAttribute('data-frame'), fit: cs.objectFit, crop: +crop.toFixed(3), budget, over: budget != null && crop > budget + 0.1, scale: +scale.toFixed(3), subjIn: subjIn == null ? null : +subjIn.toFixed(2) });
  });
  return out; })()`;
const PAGE = `(() => { const vh = innerHeight; const sc = [...document.querySelectorAll('.sc')]; return { height: document.scrollingElement.scrollHeight, vh, art: document.documentElement.dataset.personality || null, scroll: document.documentElement.dataset.scroll || null, nav: document.documentElement.dataset.nav || null, typo: document.documentElement.dataset.typo || null,
  scenes: sc.map(s => { const r = s.getBoundingClientRect(); return { id: s.id, layout: s.dataset.layout || 'free', choreo: s.dataset.choreo || '', handoff: s.dataset.handoff || '', pin: s.hasAttribute('data-pin'), top: Math.round(r.top + scrollY), h: Math.round(r.height) }; }) }; })()`;

async function grab(w) { let img = null; for (let t = 0; t < 30 && (!img || img.isEmpty()); t++) { try { w.webContents.invalidate(); img = await w.webContents.capturePage(); } catch (e) { img = null; } if (!img || img.isEmpty()) await sleep(120 + t * 40); } return img; }
const js = (w, c) => w.webContents.executeJavaScript(c);
async function scrollTo(w, y) { await js(w, `(() => { document.documentElement.style.scrollBehavior = 'auto'; window.scrollTo({ top: ${Math.round(y)}, behavior: 'instant' }); window.dispatchEvent(new Event('scroll')); return true; })()`); await sleep(260); await js(w, 'new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))'); await sleep(900); }

app.whenReady().then(async () => {
  const result = { pages: {} };
  const w = new BrowserWindow({ width: 1440, height: 900, show: true, useContentSize: true, webPreferences: { backgroundThrottling: false } });
  await w.loadURL('about:blank');
  const dbg = w.webContents.debugger; dbg.attach('1.3'); const d = (m, p) => dbg.sendCommand(m, p || {});
  process.stdout.write(`capturing ${job.pages.length} page(s)\n`);
  for (const pg of job.pages) {
    const R = result.pages[pg.id] = { views: {} };
    for (const [name, vw, vh, mobile] of VIEWS) {
      const V = R.views[name] = { frames: [], measures: [] };
      try {
        await d('Emulation.setDeviceMetricsOverride', { width: vw, height: vh, deviceScaleFactor: 1, mobile });
        await d('Emulation.setTouchEmulationEnabled', { enabled: mobile });
        await d('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] });
        await w.loadURL(pathToFileURL(pg.file).href); await sleep(2600);
        const info = await js(w, PAGE); V.page = info;
        // where to look: the hero, then each of the first scenes -- at its start and, when held, in the middle of its hold
        const stops = [['hero', 0]];
        info.scenes.slice(1, name === 'desktop' ? 6 : 4).forEach((s, i) => { stops.push([`s${i + 2}`, s.top]); if (s.pin && name === 'desktop') stops.push([`s${i + 2}-mid`, s.top + (s.h - info.vh) * 0.55]); });
        for (const [label, y] of stops) {
          await scrollTo(w, y);
          const m = await js(w, MEASURE); m.at = label; V.measures.push(m);
          if (name === 'desktop' || name === 'p390' || (name === 'p320' && label === 'hero') || name === 'tablet' && label === 'hero') { const img = await grab(w); if (img) { const f = `${pg.id}-${name}-${label}.png`; fs.writeFileSync(path.join(job.outDir, f), img.toPNG()); V.frames.push(f); } }
        }
        // nothing traps the reader: the footer is reachable at the bottom
        await scrollTo(w, 1e7); V.footer = await js(w, `(() => { const f = document.querySelector('.cr-foot'); const r = f.getBoundingClientRect(); return r.top < innerHeight && r.bottom > 0; })()`);
        V.pins = info.scenes.filter(s => s.pin).map(s => +(s.h / info.vh).toFixed(2));
        V.pageScreens = +(info.height / info.vh).toFixed(1);
        if (name === 'desktop' || name === 'p390') {
          // reduced motion: the still composition
          await d('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
          await w.loadURL(pathToFileURL(pg.file).href); await sleep(1800);
          const pin = (await js(w, PAGE)).scenes.find(s => s.choreo && s.choreo !== 'settle');
          await scrollTo(w, pin ? pin.top : 0);
          V.reduced = await js(w, MEASURE);
          const img = await grab(w); if (img) { const f = `${pg.id}-${name}-reduced.png`; fs.writeFileSync(path.join(job.outDir, f), img.toPNG()); V.frames.push(f); }
        }
      } catch (e) { V.error = String(e && e.stack || e).slice(0, 400); }
      process.stdout.write(`${pg.id} ${name} ${V.error ? 'ERROR ' + V.error.slice(0, 120) : 'ok'}\n`);
    }
    fs.writeFileSync(path.join(job.outDir, 'art-capture.json'), JSON.stringify(result, null, 1));
  }
  fs.writeFileSync(path.join(job.outDir, 'art-capture.json'), JSON.stringify(result, null, 1));
  // contact sheets: the heroes side by side, then the scenes, then the phones -- diversity is judged by eye
  const sheet = async (file, cells, cols, cw) => {
    const html = `<html><body style="margin:0;background:#111;color:#ddd;font:12px system-ui"><div style="display:grid;grid-template-columns:repeat(${cols},${cw}px);gap:8px;padding:8px">${cells.map(c => `<figure style="margin:0"><img src="${pathToFileURL(path.join(job.outDir, c.f)).href}" style="width:${cw}px;display:block"><figcaption style="padding:3px 0">${c.t}</figcaption></figure>`).join('')}</div></body></html>`;
    const f = path.join(job.outDir, file.replace(/\.png$/, '.html')); fs.writeFileSync(f, html);
    const rows = Math.ceil(cells.length / cols); const hh = Math.round(cw * cells[0].ratio) + 24;
    await d('Emulation.setDeviceMetricsOverride', { width: cols * (cw + 8) + 8, height: rows * (hh + 8) + 8, deviceScaleFactor: 1, mobile: false });
    await w.loadURL(pathToFileURL(f).href); await sleep(1500);
    const img = await grab(w); if (img) fs.writeFileSync(path.join(job.outDir, file), img.toPNG());
  };
  try {
    const ids = job.pages.map(p => p.id);
    await sheet('sheet-heroes-desktop.png', ids.map(id => ({ f: `${id}-desktop-hero.png`, t: `${id} -- ${(result.pages[id].views.desktop.page || {}).art || ''} / ${(result.pages[id].views.desktop.page || {}).scroll || ''}`, ratio: 900 / 1440 })).filter(c => fs.existsSync(path.join(job.outDir, c.f))), 4, 460);
    for (const k of [2, 3, 4]) await sheet(`sheet-scene${k}-desktop.png`, ids.map(id => ({ f: fs.existsSync(path.join(job.outDir, `${id}-desktop-s${k}-mid.png`)) ? `${id}-desktop-s${k}-mid.png` : `${id}-desktop-s${k}.png`, t: `${id} scene ${k} -- ${((result.pages[id].views.desktop.page || {}).scenes || [])[k - 1] ? result.pages[id].views.desktop.page.scenes[k - 1].layout + ' / ' + result.pages[id].views.desktop.page.scenes[k - 1].choreo : ''}`, ratio: 900 / 1440 })).filter(c => fs.existsSync(path.join(job.outDir, c.f))), 4, 460);
    await sheet('sheet-heroes-phone.png', ids.map(id => ({ f: `${id}-p390-hero.png`, t: id, ratio: 844 / 390 })).filter(c => fs.existsSync(path.join(job.outDir, c.f))), 8, 220);
    await sheet('sheet-scene2-phone.png', ids.map(id => ({ f: `${id}-p390-s2.png`, t: id, ratio: 844 / 390 })).filter(c => fs.existsSync(path.join(job.outDir, c.f))), 8, 220);
    await sheet('sheet-scene3-phone.png', ids.map(id => ({ f: `${id}-p390-s3.png`, t: id, ratio: 844 / 390 })).filter(c => fs.existsSync(path.join(job.outDir, c.f))), 8, 220);
  } catch (e) { process.stdout.write('sheet error ' + e.message + '\n'); }
  app.quit();
});
