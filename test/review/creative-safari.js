'use strict';
// THE CREATIVE PAGES IN SAFARI'S ENGINE, AS AN iPHONE -- NOT part of `npm test` (it needs Playwright's WebKit). Every check
// before this one ran in Chromium, and the bugs owners met on their iPhones were Safari's: a policy Safari read differently,
// clips Safari would not start, a page Safari closed. This builds real-photo pages (the stress harness's subjects, written
// out with their files) and opens each one in WebKit as an iPhone 13, scrolling through it. A page fails on: a script
// error, a refused resource (Content Security Policy), the page scrolling sideways, a heading wider than the screen, or the
// page closing. $0: nothing is generated, no provider is asked.
//
//   PLAYWRIGHT_DIR=<a folder with playwright installed> [VIEW=desktop] node test/review/creative-safari.js <photoDir> <outDir> [subjects] [seeds]
//   (VIEW=desktop: Safari on a Mac -- WebKit in a 1440x900 window; otherwise an iPhone 13)
//   (photoDir: the stress harness's photo folder -- measured.json, subjects.json and the photos)
const fs = require('fs'); const path = require('path'); const http = require('http');
const R = path.join(__dirname, '..', '..');
const D2 = require(path.join(R, 'lib/creative/director2')); const { validatePlan2 } = require(path.join(R, 'lib/creative/validate2')); const { renderCreative2 } = require(path.join(R, 'lib/creative/render2'));
const { SUBJECTS } = require(path.join(R, 'test/helpers/creative-subjects'));
const PW = process.env.PLAYWRIGHT_DIR ? require(path.join(process.env.PLAYWRIGHT_DIR, 'node_modules', 'playwright')) : require('playwright');
const [photoDir, OUT] = process.argv.slice(2, 4); if (!photoDir || !OUT) { console.error('usage: node test/review/creative-safari.js <photoDir> <outDir> [subjects] [seeds]'); process.exit(2); }
const subjects = (process.argv[4] || Object.keys(SUBJECTS).join(',')).split(','); const seeds = (process.argv[5] || '1,2').split(',');
const read = f => JSON.parse(fs.readFileSync(path.join(photoDir, f), 'utf8')); const measured = read('measured.json'); const boxes = read('subjects.json');
const fileOf = id => ['jpg', 'png'].map(e => path.join(photoDir, `${id}.${e}`)).find(f => fs.existsSync(f));
const TYPES = { '.html': 'text/html', '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml', '.mp4': 'video/mp4' };

function build(id, seed) {
  const s = SUBJECTS[id]; const assets = [];
  s.assets.forEach(a => {
    if (a.cutout) { const of = a.cutoutOf; const m = measured[of] && measured[of].cut && measured[of].cut.assess; const f = path.join(photoDir, `c-${of}.png`); if (m && fs.existsSync(f)) assets.push(Object.assign({}, a, { file: f, assess: m })); }
    else { const f = fileOf(a.id); const m = measured[a.id]; if (f && m) { const as = Object.assign({}, m.assess); if (boxes[a.id]) as.subject = boxes[a.id]; assets.push(Object.assign({}, a, { file: f, assess: as })); } }
  });
  if (!assets.length) return null;
  const main = s.mainAsset && assets.some(a => a.id === s.mainAsset) ? s.mainAsset : assets.find(a => !a.cutout).id;
  const d = D2.direct({ understanding: s.understanding, research: { page: null, facts: s.facts }, assets, supplied: { facts: [], memories: [] }, seed, mainAsset: main });
  const plan = validatePlan2(d.plan, { assets, facts: s.facts, understanding: s.understanding, art: d.recipe, mainAsset: main }).plan;
  const dir = path.join(OUT, `${id}-${seed}`); fs.mkdirSync(dir, { recursive: true });
  assets.forEach(a => fs.copyFileSync(a.file, path.join(dir, a.id + path.extname(a.file))));
  fs.writeFileSync(path.join(dir, 'index.html'), renderCreative2(plan, assets, { mode: 'export', src: a => a.id + path.extname(a.file || '.png') }));
  return dir;
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  let root = OUT; const srv = http.createServer((q, r) => { const f = path.join(root, decodeURIComponent(q.url.split('?')[0]).replace(/\/$/, '/index.html')); if (!fs.existsSync(f)) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r); }).listen(0);
  const browser = await PW.webkit.launch(); const report = []; let failed = 0;
  for (const id of subjects) for (const seed of seeds) {
    const dir = build(id, seed); if (!dir) continue; const tag = path.basename(dir);
    const ctx = await browser.newContext(process.env.VIEW === 'desktop' ? { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 } : { ...PW.devices['iPhone 13'] }); const pg = await ctx.newPage(); const problems = []; let closed = false;
    pg.on('pageerror', e => problems.push('script error: ' + String(e.message).slice(0, 160)));
    pg.on('console', m => { const t = m.text(); if (m.type() === 'error' && !/Failed to load resource: the server responded with a status of 404/.test(t)) problems.push((/Content Security Policy|Refused/.test(t) ? 'refused: ' : 'console: ') + t.slice(0, 160)); });
    pg.on('crash', () => { closed = true; problems.push('the page crashed'); });
    try {
      await pg.goto(`http://127.0.0.1:${srv.address().port}/${tag}/`); await pg.waitForTimeout(2600);
      const H = await pg.evaluate(() => document.documentElement.scrollHeight - innerHeight);
      for (let k = 0; k <= 8 && !closed; k++) {
        await pg.evaluate(y => scrollTo({ top: y, behavior: 'instant' }), Math.round(H * k / 8)); await pg.waitForTimeout(650);
        const v = await pg.evaluate(() => {
          const out = []; const W = innerWidth;
          if (document.documentElement.scrollWidth > W + 1) out.push(`the page scrolls sideways (${document.documentElement.scrollWidth}px on a ${W}px screen)`);
          // (a picture on the screen has arrived -- a lazily loaded one included)
          document.querySelectorAll('.ly-img').forEach(img => { const r = img.getBoundingClientRect(); if (r.width > 20 && r.height > 20 && r.bottom > 40 && r.top < innerHeight - 40 && getComputedStyle(img).visibility !== 'hidden' && !(img.complete && img.naturalWidth)) out.push(`a picture on the screen has not loaded (${img.getAttribute('data-asset')}${img.loading === 'lazy' ? ', lazy' : ''})`); });
          // (measured where it rests: a word sliding in from the side is not a heading running off the screen)
          const still = document.createElement('style'); still.textContent = '*,*::before,*::after{transform:none!important;translate:none!important;rotate:none!important;scale:none!important;transition:none!important;animation:none!important}'; document.head.appendChild(still);
          document.querySelectorAll('.sc-heading').forEach(h => { const r = h.getBoundingClientRect(); if (r.height && r.bottom > 0 && r.top < innerHeight && (r.right > W + 2 || r.left < -2) && getComputedStyle(h).visibility !== 'hidden') out.push(`a heading runs off the screen: "${h.textContent.trim().slice(0, 40)}" (${Math.round(r.left)}..${Math.round(r.right)} on ${W})`); });
          still.remove();
          return out;
        });
        v.forEach(x => { if (!problems.includes(x)) problems.push(x); });
        if (k === 0 || k === 4) await pg.screenshot({ path: path.join(OUT, `${tag}-${k}.png`) });
      }
    } catch (e) { problems.push('the page could not be checked: ' + String(e.message).slice(0, 120)); }
    await ctx.close().catch(() => {});
    report.push({ page: tag, ok: !problems.length, problems }); if (problems.length) failed++;
    process.stdout.write(`${problems.length ? 'FAIL' : 'ok  '} ${tag}${problems.length ? '\n   ' + problems.join('\n   ') : ''}\n`);
  }
  await browser.close(); srv.close();
  fs.writeFileSync(path.join(OUT, 'safari-report.json'), JSON.stringify(report, null, 1));
  console.log(`\n${report.length} pages in WebKit ${process.env.VIEW === 'desktop' ? 'as Safari on a Mac (1440x900)' : 'as an iPhone 13'} -- ${failed} with problems`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
