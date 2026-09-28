'use strict';
// Hero matrix review -- NOT part of `npm test`. Every business in
// test/fixtures/hero-matrix.js (every supported category, several per common
// category, the Claude-planned fixtures) is generated through the REAL client
// with mocked images (no provider call), saved through the REAL save
// validator, compiled with the REAL export compiler, then opened in Electron
// (test/review/capture-matrix.js) to capture the hero in motion on desktop and
// phone, with and without prefers-reduced-motion. Output in <outDir>:
//   <id>/desktop-t0..t4.png, mobile-t0..t4.png, *-reduced.png, burst.mp4, result.json
//   contact-sheet-N.png  -- the reviewable contact sheets (5 motion frames x desktop/phone + reduced)
//   index.html            -- all of it, with the burst videos and the measured checks
//
//   ELECTRON_PATH=<electron.exe> [FFMPEG_PATH=ffmpeg] node test/review/hero-matrix-review.js <outDir> [ids...]
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { HERO_MATRIX, PLANNED } = require('../fixtures/hero-matrix');
const { buildHeroFixture } = require('../helpers/hero-matrix-build');

const args = process.argv.slice(2);
const outDir = path.resolve(args[0] || path.join(os.tmpdir(), 'siteremade-hero-matrix'));
const only = args.slice(1);
const ELECTRON = process.env.ELECTRON_PATH;
const FFMPEG = process.env.FFMPEG_PATH || 'ffmpeg';
if (!ELECTRON || !fs.existsSync(ELECTRON)) { console.error('Set ELECTRON_PATH to an Electron binary.'); process.exit(1); }
const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

async function main() {
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });
  process.env.SITEREMADE_BACKEND = 'local';
  process.env.SITEREMADE_ASSET_STORE_DIR = path.join(outDir, '.assets');
  const { getDatabaseAdapter } = require('../../lib/adapters/database-adapter');
  const projectStore = require('../../lib/project-store');
  const { compileExport } = require('../../lib/export-compiler');
  const db = getDatabaseAdapter(':memory:');
  const fixtures = HERO_MATRIX.concat(PLANNED).filter(f => !only.length || only.includes(f.id));
  const sites = [], meta = {};
  for (const f of fixtures) {
    const b = await buildHeroFixture(f);
    const saved = projectStore.validateDirectionsState({ directions: [JSON.parse(JSON.stringify(b.proj))], activeDirectionIndex: 0 });
    const workDir = path.join(outDir, f.id, 'site');
    compileExport(db, { project: { id: `hero_${f.id}`, revision: 1, directionsState: saved.normalized }, directionIndex: 0, workDir });
    sites.push({ id: f.id, file: path.join(workDir, 'index.html') });
    const sb = b.proj.heroStoryboard;
    meta[f.id] = {
      category: b.proj.business.categoryKey, name: b.proj.business.name, source: sb.source, conceptId: sb.conceptId, concept: sb.concept, composition: sb.composition,
      loop: sb.loop, fallbackReason: sb.fallbackReason, planned: !!f.plan,
      layers: sb.layers.map(l => ({ slot: l.slot, role: l.role, subject: l.subject, motion: `${l.motion.path} (${l.motion.amount}, phase ${l.motion.offset})`, pan: l.pan })),
      heroImagesRequested: b.requests.filter(r => r.heroLayer).length,
    };
  }
  // contact sheets: 6 businesses per sheet
  const sheets = [];
  for (let i = 0; i < fixtures.length; i += 6) {
    const chunk = fixtures.slice(i, i + 6);
    const n = sheets.length + 1;
    const html = path.join(outDir, `contact-sheet-${n}.html`);
    fs.writeFileSync(html, `<!doctype html><meta charset="utf-8"><style>body{margin:0;padding:24px;font:13px system-ui;background:#101114;color:#e8e8ea}h2{margin:26px 0 6px;font-size:17px}p{margin:2px 0 8px;color:#a9abb2}.row{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:8px}.row img,.m img{width:100%;display:block;border-radius:4px}.m{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:8px;margin-top:8px;max-width:62%}.lab{font-size:10px;color:#7d808a;margin-top:2px}</style>
${chunk.map(f => { const m = meta[f.id]; return `<h2>${esc(f.id)} &middot; ${esc(m.category)} &middot; ${esc(m.source === 'planner' ? 'Claude-planned' : 'fallback')} &middot; ${esc(m.conceptId)} / ${esc(m.composition)}</h2>
<p>${esc(m.concept)}</p><p>${m.layers.map(l => `<b>${esc(l.slot)}</b> ${esc(l.role)}: ${esc(l.subject)} &mdash; ${esc(l.motion)}`).join(' &nbsp;|&nbsp; ')}</p>
<div class="row">${[0, 1, 2, 3, 4].map(t => `<div><img src="${f.id}/desktop-t${t}.png"><div class="lab">desktop +${t * 1.5}s</div></div>`).join('')}<div><img src="${f.id}/desktop-reduced.png"><div class="lab">reduced motion</div></div></div>
<div class="m">${[0, 1, 2, 3, 4].map(t => `<div><img src="${f.id}/mobile-t${t}.png"><div class="lab">phone +${t * 1.5}s</div></div>`).join('')}<div><img src="${f.id}/mobile-reduced.png"><div class="lab">phone, reduced</div></div></div>`; }).join('')}`);
    sheets.push({ html, png: path.join(outDir, `contact-sheet-${n}.png`), width: 2200 });
  }
  const jobFile = path.join(outDir, 'job.json');
  // a 4 s burst (16 frames, encoded to MP4) for one business per composition plus the planned and same-category showcases
  const byComposition = {};
  fixtures.forEach(f => { const c = meta[f.id].composition; (byComposition[c] = byComposition[c] || []).push(f.id); });
  const burstIds = [...new Set(Object.values(byComposition).map(ids => ids[0]).concat(PLANNED.map(p => p.id), ['fern-flint', 'little-fern', 'greenline', 'cutline-lawn', 'harbour-physio', 'stillwater-spa']))].filter(id => sites.some(s => s.id === id));
  fs.writeFileSync(jobFile, JSON.stringify({ outDir, sites, sheets, burst: true, burstIds }));
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
  const run = spawnSync(ELECTRON, [path.join(__dirname, 'capture-matrix.js'), jobFile], { stdio: 'inherit', timeout: 60 * 60 * 1000, env });
  if (run.status !== 0) console.error('electron exited with', run.status);
  // burst -> mp4
  for (const s of sites) {
    const bdir = path.join(outDir, s.id, 'burst');
    if (!fs.existsSync(bdir)) continue;
    const r = spawnSync(FFMPEG, ['-y', '-loglevel', 'error', '-framerate', '4', '-i', path.join(bdir, 'f%03d.png'), '-vf', 'scale=960:-2', '-pix_fmt', 'yuv420p', path.join(outDir, s.id, 'burst.mp4')]);
    if (r.status === 0) fs.rmSync(bdir, { recursive: true, force: true });
  }
  // summary + checks
  const rows = sites.map(s => {
    const rf = path.join(outDir, s.id, 'result.json');
    const r = fs.existsSync(rf) ? JSON.parse(fs.readFileSync(rf, 'utf8')) : { error: 'not captured' };
    const m = meta[s.id];
    const checks = [];
    if (r.error) checks.push(`ERROR ${r.error.split('\n')[0]}`);
    for (const label of ['desktop', 'mobile']) {
      const x = r[label]; if (!x) continue;
      const n = x.layout.layers.length;
      if (n < 3) checks.push(`${label}: only ${n} layers`);
      const collapsed = x.layout.layers.filter(l => l.w < 40 || l.h < 40 || !l.inHero);
      if (collapsed.length) checks.push(`${label}: ${collapsed.map(l => `${l.slot} collapsed or outside the hero (${l.w}x${l.h})`).join(', ')}`);
      if (x.movingLayers < n) checks.push(`${label}: ${n - x.movingLayers} layer(s) not moving`);
      if (x.distinctMotion < n) checks.push(`${label}: layers share a motion`);
      if (x.reduced && x.reduced.visibleLayers < x.reduced.totalLayers) checks.push(`${label} reduced: ${x.reduced.totalLayers - x.reduced.visibleLayers} layer(s) hidden`);
      if (x.reduced && !x.reduced.stillAfter2s) checks.push(`${label} reduced: still moving`);
      if (x.layout.overflowX) checks.push(`${label}: horizontal overflow`);
      const covering = x.layout.layers.filter(l => l.headlineOverlapPx > 0 && !(x.layout.copySafe === 'bottom-left' && l.role === 'lead' && label === 'desktop'));
      if (covering.length) checks.push(`${label}: ${covering.map(l => `${l.slot} overlaps headline by ${l.headlineOverlapPx}px`).join(', ')}`);
    }
    return { id: s.id, meta: m, result: r, checks };
  });
  fs.writeFileSync(path.join(outDir, 'results.json'), JSON.stringify(rows, null, 2));
  fs.writeFileSync(path.join(outDir, 'index.html'), `<!doctype html><meta charset="utf-8"><title>Hero matrix review</title><style>body{font:14px system-ui;margin:24px;background:#f4f4f2}section{background:#fff;padding:14px 16px;margin:0 0 16px;border-radius:8px}video{width:100%;max-width:960px;border-radius:6px}.bad{color:#b00020}.ok{color:#1b7a3a}table{border-collapse:collapse}td{padding:2px 10px 2px 0;vertical-align:top}</style>
<h1>Hero matrix review (mocked images, no provider calls)</h1><p>${rows.length} businesses &middot; categories: ${[...new Set(rows.map(r => r.meta.category))].sort().join(', ')}</p>
<p>Contact sheets: ${sheets.map(s => `<a href="${path.basename(s.png)}">${path.basename(s.png)}</a>`).join(' &middot; ')}</p>
${rows.map(r => `<section><h2>${esc(r.id)} <small>${esc(r.meta.category)} &middot; ${esc(r.meta.source)} &middot; ${esc(r.meta.conceptId)} / ${esc(r.meta.composition)} &middot; loop ${r.meta.loop}s</small></h2>
<p>${esc(r.meta.concept)}</p><table>${r.meta.layers.map(l => `<tr><td><b>${esc(l.slot)}</b></td><td>${esc(l.role)}</td><td>${esc(l.subject)}</td><td>${esc(l.motion)}, pan ${esc(l.pan)}</td></tr>`).join('')}</table>
<p class="${r.checks.length ? 'bad' : 'ok'}">${r.checks.length ? esc(r.checks.join(' · ')) : 'all checks pass: 3+ layers, every layer moving independently, all visible and still under reduced motion, no headline overlap, no phone overflow'}</p>
${fs.existsSync(path.join(outDir, r.id, 'burst.mp4')) ? `<video src="${r.id}/burst.mp4" autoplay loop muted playsinline></video>` : ''}</section>`).join('')}`);
  const bad = rows.filter(r => r.checks.length);
  console.log(`\n${rows.length} businesses reviewed, ${bad.length} with problems`);
  bad.forEach(r => console.log(`  ${r.id}: ${r.checks.join(' · ')}`));
  console.log(`Contact sheets: ${sheets.map(s => s.png).join(', ')}\nIndex: ${path.join(outDir, 'index.html')}`);
}

main().catch(e => { console.error(e && e.stack || e); process.exit(1); });
