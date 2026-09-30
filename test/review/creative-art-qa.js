'use strict';
// ART-DIRECTION REVIEW -- not part of `npm test` (it needs Electron and the network for real research).
//   node test/review/creative-art-qa.js <outDir> [--run | --reexport] [--cases=a,b]
// --run: first runs the real studio (creative-review.js --skip-capture) on the eight art briefs
//        (test/fixtures/creative-briefs-art.js): real research, the built-in art director, save, reopen, export.
// Then captures every exported page (creative-art-capture.js) at desktop, tablet and six phone widths and writes
// art-report.txt: each page's recipe and scene architecture (so sameness is visible at a glance), how different the
// pages are from one another, and the measured checks -- sideways overflow, words off screen, crops beyond their
// budget, enlargement, subjects cut by a crop, held-scene lengths, a reachable footer.
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const args = process.argv.slice(2);
const outDir = path.resolve(args.find(a => !a.startsWith('--')) || 'art-qa');
const ELECTRON = process.env.ELECTRON_BIN || 'C:/Users/jayde/AppData/Local/Temp/claude/c--Users-jayde-Documents-BeatBlock/f77ec6d4-71d7-4500-b46b-68165439e77a/scratchpad/v3/node_modules/electron/dist/electron.exe';
const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
fs.mkdirSync(outDir, { recursive: true });
if (args.includes('--run')) {
  const r = spawnSync(process.execPath, [path.join(__dirname, 'creative-review.js'), outDir, `--briefs=${path.join(__dirname, '..', 'fixtures', 'creative-briefs-art.js')}`, '--skip-capture', ...args.filter(a => a.startsWith('--cases='))], { stdio: 'inherit', env });
  if (r.status) process.exit(r.status);
}
if (args.includes('--reexport')) { const r = spawnSync(process.execPath, [path.join(__dirname, 'creative-review.js'), outDir, `--briefs=${path.join(__dirname, '..', 'fixtures', 'creative-briefs-art.js')}`, '--skip-studio', '--skip-capture'], { stdio: 'inherit', env }); if (r.status) process.exit(r.status); }
const CASES = require('../fixtures/creative-briefs-art');
const ids = CASES.flatMap(c => [c.id, c.id + '-b']).filter(id => fs.existsSync(path.join(outDir, `${id}-export`, 'index.html')));
const pages = ids.map(id => ({ id, file: path.join(outDir, `${id}-export`, 'index.html') }));
const jobFile = path.join(outDir, 'art-capture-job.json');
fs.writeFileSync(jobFile, JSON.stringify({ outDir, pages }));
spawnSync(ELECTRON, [path.join(__dirname, 'creative-art-capture.js'), jobFile], { stdio: 'inherit', env, timeout: 90 * 60 * 1000 });

// ---- the report
const cap = JSON.parse(fs.readFileSync(path.join(outDir, 'art-capture.json'), 'utf8'));
const ART = require('../../lib/creative/art');
const lines = []; const recipes = {};
for (const id of ids) {
  const proj = JSON.parse(fs.readFileSync(path.join(outDir, `${id}.project.json`), 'utf8'));
  const d = proj.directionsState.directions[proj.directionsState.activeDirectionIndex || 0]; const plan = d.creative.plan;
  recipes[id] = plan.art ? plan.art.recipe : '';
  lines.push(`\n== ${id}   ${plan.art ? `${plan.art.personality} / ${plan.art.scroll} / type ${plan.art.typo} / nav ${plan.art.nav} / ${plan.art.density}` : '(no art direction)'}   display ${plan.type.display}, palette ${plan.palette.bg}/${plan.palette.accent}`);
  lines.push(`   scenes: ${plan.scenes.map(s => `${s.layout || 'free'}${s.pin ? '*' : ''}:${s.choreo || '-'}${s.handoff && s.handoff !== 'cut' ? '/' + s.handoff : ''}`).join('  ')}`);
  const frames = plan.scenes.flatMap(s => s.layers.filter(L => L.kind === 'image').map(L => `${L.frame || '-'}:${L.fit}${L.mfit && L.mfit !== L.fit ? '/' + L.mfit : ''}`));
  lines.push(`   pictures framed: ${frames.join(' ') || 'none'}`);
  const P = cap.pages[id] || { views: {} };
  Object.entries(P.views).forEach(([v, V]) => {
    if (V.error) { lines.push(`   ${v.padEnd(8)} ERROR ${V.error.slice(0, 120)}`); return; }
    const ms = V.measures || [];
    const over = Math.max(0, ...ms.map(m => m.overflowX));
    const textOff = ms.flatMap(m => m.textOff.map(t => `${m.at}:${t.t}`));
    const covered = ms.flatMap(m => (m.covered || []).map(t => `${m.at}:${t}`));
    const crops = ms.flatMap(m => m.crops);
    const overBudget = crops.filter(c => c.over).map(c => `${c.asset}(${c.frame} ${Math.round(c.crop * 100)}%>${Math.round(c.budget * 100)}%)`);
    const scaleMax = Math.max(1, ...ms.map(m => m.scaleMax));
    const subj = crops.filter(c => c.subjIn != null).map(c => c.subjIn); const subjMin = subj.length ? Math.min(...subj) : null;
    const maxCrop = crops.length ? Math.max(...crops.map(c => c.crop)) : 0;
    lines.push(`   ${v.padEnd(8)} overflow ${over}px  textOff ${textOff.length}${textOff.length ? ' [' + textOff.slice(0, 3).join(' | ') + ']' : ''}  wordsUnderPicture ${covered.length}${covered.length ? ' [' + covered.slice(0, 3).join(' | ') + ']' : ''}  maxCrop ${Math.round(maxCrop * 100)}%  overBudget ${overBudget.length}${overBudget.length ? ' [' + overBudget.slice(0, 3).join(' ') + ']' : ''}  scale ${scaleMax.toFixed(2)}  subjectInCrop ${subjMin == null ? '-' : Math.round(subjMin * 100) + '%'}  pins ${JSON.stringify(V.pins || [])}  page ${V.pageScreens}sc  footer ${V.footer ? 'yes' : 'NO'}${V.reduced ? `  reduced: overflow ${V.reduced.overflowX}px textOff ${V.reduced.textOff.length}` : ''}`);
  });
}
// how different the pages are: pairwise similarity of their recipes (0 = nothing shared, 1 = the same recipe)
const keys = Object.keys(recipes).filter(k => recipes[k]);
const sims = []; for (let i = 0; i < keys.length; i++) for (let j = i + 1; j < keys.length; j++) sims.push([keys[i], keys[j], ART.similarity(recipes[keys[i]], recipes[keys[j]])]);
sims.sort((a, b) => b[2] - a[2]);
lines.unshift(`ART-DIRECTION REVIEW  ${new Date().toISOString()}  pages: ${keys.length}\nmost similar pairs: ${sims.slice(0, 5).map(([a, b, s]) => `${a}~${b} ${s.toFixed(2)}`).join(', ')}\nmean pairwise similarity: ${(sims.reduce((t, x) => t + x[2], 0) / Math.max(1, sims.length)).toFixed(2)}  personalities: ${[...new Set(keys.map(k => recipes[k].split('/')[0]))].join(', ')}  hero archetypes: ${[...new Set(keys.map(k => (recipes[k].split('/')[2] || '').split(',')[0]))].join(', ')}`);
fs.writeFileSync(path.join(outDir, 'art-report.txt'), lines.join('\n'));
console.log(lines.join('\n'));
