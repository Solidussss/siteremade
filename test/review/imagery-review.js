'use strict';
// Before/after review of the hero imagery -- NOT part of `npm test`.
//
//   ELECTRON_PATH=<electron.exe> node test/review/imagery-review.js <outDir> --before <path to a checkout of the old code> [ids...]
//
// Builds the same businesses with BOTH code trees (the "before" checkout and this
// one) through the REAL client (script.js + premium-core.js in a vm), the REAL save
// validator and the REAL export compiler, in two situations:
//   no-images  paid image generation unavailable (the customer's fallback)
//   mock       paid images "generated" -- by the procedural stand-ins in
//              test/helpers/mock-image.js, stamped MOCK IMAGE in every capture:
//              no image provider is ever called, so this shows WHICH subjects
//              and prompts were chosen and how the composition holds, not what a
//              real provider would draw
// then captures every hero (desktop at two moments of the loop, and phone) and
// writes side-by-side contact sheets plus the subject lists and prompts.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const args = process.argv.slice(2);
const outDir = path.resolve(args[0] || path.join(os.tmpdir(), 'siteremade-imagery'));
const beforeRoot = args.includes('--before') ? path.resolve(args[args.indexOf('--before') + 1]) : null;
const only = args.slice(1).filter((a, i, all) => !a.startsWith('--') && all[i - 1] !== '--before');
const ELECTRON = process.env.ELECTRON_PATH;
if (!ELECTRON || !fs.existsSync(ELECTRON)) { console.error('Set ELECTRON_PATH to an Electron binary.'); process.exit(1); }
const AFTER_ROOT = path.join(__dirname, '..', '..');
const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const { HERO_MATRIX } = require('../fixtures/hero-matrix');
const pickFx = id => HERO_MATRIX.find(f => f.id === id).text;
// representative matrix businesses plus descriptions the library was never tuned on
const BUSINESSES = [
  { id: 'fizzwell', text: pickFx('fizzwell') }, { id: 'citrine-soda', text: 'Citrine Soda Co. makes sparkling soda in cans in blood orange, lime and ginger.' },
  { id: 'wild-ferment', text: 'Wild Ferment brews raw kombucha in glass bottles in ginger, hibiscus and lemon.' }, { id: 'glow-theory', text: pickFx('glow-theory') },
  { id: 'dew-lab', text: 'Dew Lab is a skincare brand making a vitamin C serum, a gel cleanser and a barrier cream.' }, { id: 'ember-salt', text: pickFx('ember-salt') },
  { id: 'cutline-lawn', text: pickFx('cutline-lawn') }, { id: 'cutting-edge', text: 'Cutting Edge Lawn Co. keeps suburban lawns sharp with weekly mowing, crisp edging and spring aeration in Oakville.' },
  { id: 'stonecraft', text: 'Stonecraft Outdoor builds natural stone patios, retaining walls and planting beds for homeowners in Guelph.' }, { id: 'greenline', text: pickFx('greenline') },
  { id: 'harbour-physio', text: pickFx('harbour-physio') }, { id: 'motion-physio', text: 'Motion Physio is a physiotherapy clinic treating running injuries with exercise rehab, dry needling and manual therapy.' },
  { id: 'ledgerly', text: pickFx('ledgerly') }, { id: 'bookwise', text: 'Bookwise is scheduling software for dental practices with online booking and automatic reminders.' },
  { id: 'tracepoint', text: 'Tracepoint is software for engineering teams: uptime monitoring, alerting and logs for APIs.' }, { id: 'fern-flint', text: pickFx('fern-flint') },
  { id: 'northside-auto', text: pickFx('northside-auto') }, { id: 'summit-roofing', text: pickFx('summit-roofing') },
  { id: 'tidewater-charters', text: pickFx('tidewater-charters') }, { id: 'harbour-knots', text: 'Harbour Knots teaches sailing lessons and runs sunset cruises from the marina.' },
  { id: 'petal-post', text: 'Petal & Post is a florist delivering bouquets and wedding flowers across Bristol.' }, { id: 'paperbark', text: pickFx('paperbark') },
  // unfamiliar descriptions, including close relatives with different offerings (water, flowers, heat, paper)
  { id: 'keel-compass', text: 'Keel & Compass sells used sailboats and handles yacht brokerage in Halifax.' },
  { id: 'blue-mooring', text: 'Blue Mooring rents kayaks and paddleboards by the hour on Lake Muskoka.' },
  { id: 'bloom-room', text: 'The Bloom Room runs flower-arranging workshops and sells dried flower wreaths.' },
  { id: 'stem-studio', text: 'We are Stem Studio, a wedding florist designing bridal bouquets and ceremony arches in Kent.' },
  { id: 'red-door', text: 'Red Door Hot Sauce makes habanero mango and garlic jalapeno hot sauces in Austin.' },
  { id: 'sweet-heat', text: 'Sweet Heat Honey makes hot honey infused with habanero, sold at farmers markets.' },
  { id: 'ink-quill', text: 'Ink & Quill prints custom business cards, letterhead and rubber stamps in Leeds.' },
  { id: 'gravel-grind', text: 'Gravel & Grind repairs mountain bikes and sells refurbished road bikes in Squamish.' },
  { id: 'mend-well', text: 'Mend Well Tailoring does alterations, hemming and suit repairs in Toronto.' },
  { id: 'northfield', text: 'My business is called Northfield Tutors and we help kids with math and science homework.' },
  { id: 'dog-walk', text: 'I walk dogs and do pet sitting around Hamilton.' },
].filter(b => !only.length || only.includes(b.id));

async function buildWith(root, label, workBase) {
  // each tree's own client, save validator and export compiler
  const { buildHeroFixture } = require(path.join(root, 'test/helpers/hero-matrix-build'));
  const projectStore = require(path.join(root, 'lib/project-store'));
  const { compileExport } = require(path.join(root, 'lib/export-compiler'));
  const { getDatabaseAdapter } = require(path.join(root, 'lib/adapters/database-adapter'));
  const db = getDatabaseAdapter(':memory:');
  const out = {};
  for (const b of BUSINESSES) {
    out[b.id] = {};
    for (const mode of ['no-images', 'mock']) {
      const built = await buildHeroFixture({ text: b.text }, mode === 'no-images' ? { providerStatus: null } : {});
      const saved = projectStore.validateDirectionsState({ directions: [JSON.parse(JSON.stringify(built.proj))], activeDirectionIndex: 0 });
      const workDir = path.join(workBase, label, mode, b.id);
      compileExport(db, { project: { id: `img_${label}_${b.id}`, revision: 1, directionsState: saved.normalized }, directionIndex: 0, workDir });
      const sb = built.proj.heroStoryboard;
      out[b.id][mode] = { site: path.join(workDir, 'index.html'), category: built.proj.business.categoryKey, name: built.proj.business.name, copy: built.proj.copy ? { kicker: built.proj.copy.kicker, headline: built.proj.copy.headline, sub: built.proj.copy.sub } : null, placeholderName: !!(built.proj.meta && built.proj.meta.previewBrandName),
        layers: sb ? sb.layers.map(l => ({ slot: l.slot, role: l.role, subject: l.subject, art: l.art ? l.art.kind + (l.art.params && l.art.params.variant ? ':' + l.art.params.variant : '') : null, render: l.render || 'image', prompt: l.prompt })) : [],
        requested: built.requests.filter(r => r.heroLayer).length };
    }
  }
  return out;
}

async function main() {
  fs.rmSync(outDir, { recursive: true, force: true }); fs.mkdirSync(outDir, { recursive: true });
  process.env.SITEREMADE_BACKEND = 'local'; process.env.SITEREMADE_ASSET_STORE_DIR = path.join(outDir, '.assets');
  // the old checkout has no node_modules of its own: resolve its packages from this one
  process.env.NODE_PATH = path.join(AFTER_ROOT, 'node_modules'); require('module').Module._initPaths();
  const after = await buildWith(AFTER_ROOT, 'after', outDir);
  const before = beforeRoot ? await buildWith(beforeRoot, 'before', outDir) : null;
  const shots = [];
  for (const [label, set] of [['after', after], ['before', before]]) if (set) for (const id of Object.keys(set)) for (const mode of ['no-images', 'mock']) {
    const out = path.join(outDir, label, mode, id, 'hero'); shots.push({ file: set[id][mode].site, out, labelMocks: mode === 'mock', few: label === 'before' });
  }
  // contact sheets: 4 businesses per sheet, before | after for each situation
  const rel = p => path.relative(outDir, p).replace(/\\/g, '/');
  const ids = BUSINESSES.map(b => b.id); const sheets = [];
  const subj = x => x.layers.map(l => `<li><b>${esc(l.role)}</b> ${esc(l.subject)} <i>${esc(l.art || '')}${l.render === 'art' ? ' · drawn' : ''}</i></li>`).join('');
  for (let i = 0; i < ids.length; i += 4) {
    const n = sheets.length + 1; const html = path.join(outDir, `imagery-sheet-${n}.html`);
    const rows = ids.slice(i, i + 4).map(id => {
      const A = after[id], Bf = before && before[id];
      const cell = (label, mode, which, cap) => `<figure><img src="${rel(path.join(outDir, label, mode, id, `hero-${which}.png`))}"><figcaption>${cap}</figcaption></figure>`;
      const copyLine = (x, tag) => x && x.copy ? `<p class="copy"><b>${tag}</b> <span class="k">${esc(x.copy.kicker || '')}</span> “${esc(x.copy.headline)}” <span class="s">${esc(x.copy.sub || '')}</span> <span class="nm">· name: ${esc(x.name)}${x.placeholderName ? ' (placeholder)' : ''}</span></p>` : '';
      return `<section><h2>${esc(A['no-images'].name)} <small>${esc(id)} · category ${esc(A['no-images'].category)}</small></h2>
${Bf ? copyLine(Bf['no-images'], 'BEFORE') : ''}${copyLine(A['no-images'], 'AFTER')}
<div class="subjects">${Bf ? `<div><h4>Before · subjects</h4><ul>${subj(Bf.mock)}</ul></div>` : ''}<div><h4>After · subjects</h4><ul>${subj(A.mock)}</ul><p class="n">hero images requested: ${A.mock.requested}${Bf ? ` (before: ${Bf.mock.requested})` : ''}</p></div></div>
<h3>No paid imagery available (what the customer sees if image generation is off, unfunded or failed)</h3>
<div class="row">${Bf ? cell('before', 'no-images', 'desktop-a', 'BEFORE · 2.5 s') : ''}${cell('after', 'no-images', 'desktop-a', 'AFTER · 2.5 s')}${cell('after', 'no-images', 'desktop-c', 'AFTER · 8.5 s into the loop')}</div>
<div class="row m">${Bf ? cell('before', 'no-images', 'mobile', 'BEFORE · phone 2.5 s') : ''}${cell('after', 'no-images', 'mobile', 'AFTER · phone 2.5 s')}${cell('after', 'no-images', 'mobile-b', 'AFTER · phone 6.5 s')}${cell('after', 'no-images', 'mobile-c', 'AFTER · phone 10.5 s')}${cell('after', 'mock', 'mobile', 'AFTER · phone, MOCK images')}</div>
<h3>Paid imagery (MOCK stand-ins -- the composition and subject choice, not real provider output)</h3>
<div class="row">${Bf ? cell('before', 'mock', 'desktop-a', 'BEFORE (mock)') : ''}${cell('after', 'mock', 'desktop-a', 'AFTER (mock)')}</div></section>`;
    }).join('');
    fs.writeFileSync(html, `<!doctype html><meta charset="utf-8"><style>body{margin:0;padding:24px;background:#101114;color:#e8e8ea;font:13px system-ui}section{margin:0 0 34px;padding-bottom:18px;border-bottom:1px solid #2a2c33}h2{margin:0 0 6px;font-size:19px}h2 small{color:#8d909a;font-weight:500;font-size:12px}h3{font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:#aab0bd;margin:14px 0 6px}h4{margin:0 0 4px;font-size:12px;color:#c9ccd4}.subjects{display:grid;grid-template-columns:1fr 1fr;gap:18px}.subjects ul{margin:0;padding-left:16px;color:#c5c8d0}.subjects i{color:#7f8594;font-style:normal}.n{color:#8d909a;margin:4px 0 0}.row{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.row.m{grid-template-columns:repeat(5,minmax(0,200px))}.copy{margin:2px 0;color:#d8dae0}.copy .k{color:#8d909a;font-size:11px;letter-spacing:.06em}.copy .s{color:#9aa0ab}.copy .nm{color:#7f8594}figure{margin:0}figure img{width:100%;display:block;border-radius:6px;background:#222}figcaption{font-size:11px;color:#9aa0ab;margin-top:3px}</style>${rows}`);
    sheets.push({ html, png: path.join(outDir, `imagery-sheet-${n}.png`), width: 1500 });
  }
  const reportFile = path.join(outDir, 'visibility.json');
  // captured in small batches, each in a fresh Electron process: one process capturing well over a hundred heavy
  // pages in a row starts returning empty frames; the report of every batch is merged
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
  const merged = {}; const BATCH = 6;
  for (let i = 0, n = 0; i < shots.length + (sheets.length ? 1 : 0); i += BATCH, n++) {
    const part = shots.slice(i, i + BATCH); const last = i + BATCH >= shots.length;
    if (!part.length && !last) continue;
    const partReport = path.join(outDir, `visibility-${n}.json`);
    const jobFile = path.join(outDir, `job-${n}.json`); fs.writeFileSync(jobFile, JSON.stringify({ shots: part, sheets: last ? sheets : [], report: partReport }));
    const run = spawnSync(ELECTRON, [path.join(__dirname, 'capture-heroes.js'), jobFile], { stdio: 'inherit', timeout: 30 * 60 * 1000, env });
    if (run.status !== 0) console.error('electron exited with', run.status);
    if (fs.existsSync(partReport)) Object.assign(merged, JSON.parse(fs.readFileSync(partReport, 'utf8')));
    if (last) break;
  }
  // a capture that failed twice inside a long-running process gets one more chance in a fresh one
  const missing = shots.filter(s => (s.few ? ['desktop-a', 'desktop-b', 'mobile'] : ['desktop-a', 'desktop-b', 'desktop-c', 'desktop-d', 'mobile', 'mobile-b', 'mobile-c']).some(n => !fs.existsSync(`${s.out}-${n}.png`)));
  if (missing.length) {
    const jobFile = path.join(outDir, 'job-missing.json'); const partReport = path.join(outDir, 'visibility-missing.json');
    fs.writeFileSync(jobFile, JSON.stringify({ shots: missing, sheets: [], report: partReport }));
    spawnSync(ELECTRON, [path.join(__dirname, 'capture-heroes.js'), jobFile], { stdio: 'inherit', timeout: 30 * 60 * 1000, env });
    if (fs.existsSync(partReport)) for (const [k, v] of Object.entries(JSON.parse(fs.readFileSync(partReport, 'utf8')))) merged[k] = Object.assign(merged[k] || {}, v);
    // the contact sheets were drawn before this pass: draw them again with the recovered captures
    const sheetJob = path.join(outDir, 'job-sheets.json'); fs.writeFileSync(sheetJob, JSON.stringify({ shots: [], sheets }));
    spawnSync(ELECTRON, [path.join(__dirname, 'capture-heroes.js'), sheetJob], { stdio: 'inherit', timeout: 10 * 60 * 1000, env });
  }
  const still = shots.filter(s => (s.few ? ['desktop-a', 'desktop-b', 'mobile'] : ['desktop-a', 'desktop-b', 'desktop-c', 'desktop-d', 'mobile', 'mobile-b', 'mobile-c']).some(n => !fs.existsSync(`${s.out}-${n}.png`)));
  console.log(`captures still missing after a fresh-process retry: ${still.length ? still.map(s => path.relative(outDir, s.out)).join(', ') : 'none'}`);
  fs.writeFileSync(reportFile, JSON.stringify(merged, null, 1));
  fs.writeFileSync(path.join(outDir, 'subjects.json'), JSON.stringify({ after, before }, null, 2));
  // what the browser measured: the least-visible drawn subject per business, across every captured moment and view
  if (fs.existsSync(reportFile)) {
    const rep = JSON.parse(fs.readFileSync(reportFile, 'utf8')); const rows = []; const copyIssues = [];
    for (const [prefix, moments] of Object.entries(rep)) {
      if (!/[\\/]after[\\/]no-images[\\/]/.test(prefix)) continue;
      const id = path.basename(path.dirname(prefix));
      for (const [moment, m] of Object.entries(moments)) {
        if (!m) continue;
        for (const l of (m.layers || [])) if (l.subject) rows.push({ id, moment, slot: l.slot, role: l.role, kind: l.kind, share: l.share, core: l.core, labels: l.labels, labelsSeen: l.labelsSeen, worstLabel: l.worstLabel });
        for (const c of (m.copy || [])) if (!c.inside || (c.seen != null && c.seen < 1)) copyIssues.push(`${id} ${moment} ${c.sel} left ${c.left} right ${c.right} seen ${c.seen}`);
        if (m.page && (m.page.scrollX || m.page.docW > m.page.clientW)) copyIssues.push(`${id} ${moment} page scrollX ${m.page.scrollX} width ${m.page.docW}/${m.page.clientW}`);
      }
    }
    rows.sort((a, b) => a.core - b.core || a.share - b.share);
    console.log('\nleast visible drawn subjects (after, no paid imagery, measured in the browser):');
    rows.slice(0, 25).forEach(r => console.log(`  ${r.id.padEnd(20)} ${r.moment.padEnd(10)} ${r.slot.padEnd(7)} ${r.role.padEnd(8)} ${String(r.kind).padEnd(16)} core ${r.core} whole ${r.share}`));
    const leads = rows.filter(r => r.role === 'lead');
    console.log(`leads measured: ${leads.length}, core below 0.8: ${leads.filter(r => r.core < 0.8).length}`);
    const labelled = rows.filter(r => r.labels);
    console.log(`drawn layers with printed labels, measured: ${labelled.length}; any label less than fully visible: ${labelled.filter(r => r.labelsSeen < 1).length}`);
    labelled.filter(r => r.labelsSeen < 1).sort((a, b) => a.labelsSeen - b.labelsSeen).slice(0, 12).forEach(r => console.log(`  ${r.id.padEnd(20)} ${r.moment.padEnd(10)} ${r.slot.padEnd(7)} ${String(r.kind).padEnd(16)} worst label "${r.worstLabel}" ${r.labelsSeen}`));
    console.log(`copy (kicker, headline, paragraph, button, chips) clipped, off the page's width or covered: ${copyIssues.length ? copyIssues.length + ' cases' : 'none'}`);
    copyIssues.slice(0, 20).forEach(x => console.log('  ' + x));
  }
  console.log(`\n${BUSINESSES.length} businesses · sheets: ${sheets.map(s => s.png).join(', ')}`);
}
main().catch(e => { console.error(e && e.stack || e); process.exit(1); });
