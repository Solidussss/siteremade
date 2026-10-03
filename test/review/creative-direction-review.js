'use strict';
// THE ART-DIRECTION BROWSER REVIEW (lib/creative/direction.js): six very different subjects (test/helpers/creative-subjects.js),
// each as the page the code made BEFORE creative direction (test/fixtures/creative/legacy-pre-direction.json) and as the
// page it makes now, exported and captured in a real browser at 1440 and 390 by creative-art-capture.js.
//   node test/review/creative-direction-review.js <outDir>            build the pages + job.json
//   electron test/review/creative-art-capture.js <outDir>/job.json    capture (desktop + p390)
//   node test/review/creative-direction-review.js <outDir> --report   what the critique and the browser found, side by side
// The pictures are stand-ins drawn from what the studio measured (size, colours, where the subject is): the review is of
// composition, rhythm and fit, not of photography. Nothing here calls a provider.
const fs = require('fs');
const path = require('path');
const D2 = require('../../lib/creative/director2');
const DIR = require('../../lib/creative/direction');
const AI = require('../../lib/creative/ai');
const { validatePlan2 } = require('../../lib/creative/validate2');
const { renderCreative2 } = require('../../lib/creative/render2');
const { SUBJECTS, IDS } = require('../helpers/creative-subjects');

const out = path.resolve(process.argv[2] || 'direction-review'); const report = process.argv.includes('--report');
const LEGACY = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'creative', 'legacy-pre-direction.json'), 'utf8'));
const SEED = '1';

const { svgOf } = require('../helpers/stand-in-pictures');
function now(id) {
  const s = SUBJECTS[id];
  const { plan, recipe } = D2.direct({ understanding: s.understanding, research: { page: null, facts: s.facts }, assets: s.assets, supplied: { facts: [], memories: [] }, seed: SEED, mainAsset: s.mainAsset });
  return validatePlan2(plan, { assets: s.assets, facts: s.facts, understanding: s.understanding, art: recipe, mainAsset: s.mainAsset }).plan;
}
const shape = sc => sc.composition || sc.layout;
function judge(id, plan) {
  const s = SUBJECTS[id]; const ctx = AI.reviewContext(plan, new Map(s.assets.map(a => [a.id, a])), { assets: s.assets });
  const f = DIR.critique(plan.scenes, ctx); const sv = DIR.survey(plan.scenes, ctx);
  return { score: DIR.score(f), findings: f.map(x => `${x.code}@${x.at}`), sequence: plan.scenes.map(sc => `${shape(sc)}${sc.beat ? `{${sc.beat}}` : ''}`).join(' > '), heroArea: sv[0].area, heroFull: sv[0].full, payoff: shape(plan.scenes[plan.scenes.length - 1]), concept: plan.idea ? `${plan.idea.concept.genre}/${plan.idea.concept.intensity}: ${plan.idea.concept.thesis}` : '(none -- made before creative direction)', fixed: plan.review ? plan.review.fixed : [] };
}

if (!report) {
  fs.mkdirSync(out, { recursive: true }); const pages = [];
  IDS.forEach(id => {
    const s = SUBJECTS[id]; s.assets.forEach(a => fs.writeFileSync(path.join(out, `${a.id}.svg`), svgOf(a)));
    [['before', LEGACY[id]], ['after', now(id)]].forEach(([when, plan]) => {
      const file = path.join(out, `${id}-${when}.html`);
      fs.writeFileSync(file, renderCreative2(plan, s.assets, { mode: 'export', src: a => `${a.id}.svg`, fontSrc: f => require('url').pathToFileURL(path.join(__dirname, '..', '..', 'vendor', 'creative-fonts', f)).href }));
      fs.writeFileSync(path.join(out, `${id}-${when}.plan.json`), JSON.stringify(plan));
      pages.push({ id: `${id}-${when}`, file });
    });
  });
  fs.writeFileSync(path.join(out, 'job.json'), JSON.stringify({ outDir: out, views: ['desktop', 'p390'], pages }, null, 1));
  process.stdout.write(`${pages.length} pages in ${out}\n`);
} else {
  const cap = fs.existsSync(path.join(out, 'art-capture.json')) ? JSON.parse(fs.readFileSync(path.join(out, 'art-capture.json'), 'utf8')) : { pages: {} };
  const rows = [];
  IDS.forEach(id => ['before', 'after'].forEach(when => {
    const plan = JSON.parse(fs.readFileSync(path.join(out, `${id}-${when}.plan.json`), 'utf8')); const j = judge(id, plan);
    const views = ((cap.pages[`${id}-${when}`] || {}).views) || {};
    const b = v => { const V = views[v]; if (!V || V.error) return V && V.error ? 'ERROR' : '-'; const ms = V.measures || []; return { overflowX: Math.max(0, ...ms.map(m => m.overflowX)), textOff: ms.reduce((t, m) => t + m.textOff.length, 0), covered: ms.reduce((t, m) => t + (m.covered || []).length, 0), cropsOver: ms.reduce((t, m) => t + m.crops.filter(c => c.over).length, 0), footer: V.footer, screens: V.pageScreens, pins: V.pins, reducedOverflow: V.reduced ? V.reduced.overflowX : null }; };
    rows.push(Object.assign({ page: `${id}-${when}` }, j, { desktop: b('desktop'), phone: b('p390') }));
  }));
  fs.writeFileSync(path.join(out, 'direction-report.json'), JSON.stringify(rows, null, 1));
  rows.forEach(r => process.stdout.write(`${r.page.padEnd(20)} score ${String(r.score).padStart(4)}  hero ${r.heroFull ? 'full' : r.heroArea + '%'}  ${r.sequence}\n    findings: ${r.findings.join(', ') || 'none'}\n    desktop ${JSON.stringify(r.desktop)}\n    phone   ${JSON.stringify(r.phone)}\n`));
}
