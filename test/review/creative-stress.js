'use strict';
// THE CREATIVE STRESS RUN: unrelated subjects x seeds made the way the studio makes them (built-in director -> validate2),
// optionally through the visual review (its model a mock that answers with what was measured), then rendered and
// measured with the visual director's own measures. Every quality change is held to it: no category of finding may get
// worse. Nothing here calls a paid provider.
//   node test/review/creative-stress.js <photoDir> <outDir> [subjects,comma] [seeds,comma]      (NOVR=1: no visual review,
//   as production runs without a browser)
// photoDir: real photographs named by the asset ids of test/helpers/creative-subjects.js (<id>.jpg|png, c-<id>.png for a
// cut-out) with measured.json (the studio's own measuring, assets.js) and subjects.json (subject boxes) -- the same set
// creative-asset-review.js reads; a missing photograph is drawn as a stand-in.
// outDir: <subject>-<seed>-desk.jpg / -phone.jpg contact sheets, the final plans, and report.json (each page's findings).
const R = require('path').join(__dirname, '..', '..') + '/';
const fs = require('fs'); const path = require('path');
const D2 = require(R + 'lib/creative/director2');
const AI = require(R + 'lib/creative/ai');
const VC = require(R + 'lib/creative/visual-capture');
const VR = require(R + 'lib/creative/visual-review');
const VIS = require(R + 'lib/creative/visual');
const { validatePlan2 } = require(R + 'lib/creative/validate2');
const { SUBJECTS, IDS } = require(R + 'test/helpers/creative-subjects');
const { svgOf } = require(R + 'test/helpers/stand-in-pictures');

const photoDir = path.resolve(process.argv[2] || 'photos'); const outDir = path.resolve(process.argv[3] || 'creative-stress');
const read = f => JSON.parse(fs.readFileSync(path.join(photoDir, f), 'utf8'));
const measured = read('measured.json'); const boxes = fs.existsSync(path.join(photoDir, 'subjects.json')) ? read('subjects.json') : {};
const fileOf = id => ['jpg', 'png'].map(e => path.join(photoDir, `${id}.${e}`)).find(f => fs.existsSync(f));
const pictures = a => (a.file ? { buf: fs.readFileSync(a.file), mime: a.mime } : { buf: Buffer.from(svgOf(a)), mime: 'image/svg+xml' });
const VISUAL = process.env.NOVR !== '1';

function pool(id) {
  const s = SUBJECTS[id]; const assets = [];
  const real = a => { const f = fileOf(a.id); const m = measured[a.id]; if (!f || !m) return Object.assign({}, a, { stand: true }); const as = Object.assign({}, m.assess); if (boxes[a.id]) as.subject = boxes[a.id]; return Object.assign({}, a, { file: f, mime: f.endsWith('.png') ? 'image/png' : 'image/jpeg', width: m.width || a.width, height: m.height || a.height, assess: as }); };
  s.assets.forEach(a => { if (a.cutout) { const of = a.cutoutOf; const m = measured[of] && measured[of].cut && measured[of].cut.assess; const f = path.join(photoDir, `c-${of}.png`); if (m && fs.existsSync(f)) assets.push(Object.assign({}, a, { file: f, mime: 'image/png', assess: m })); return; } assets.push(real(a)); });
  return { s, assets, mainAsset: s.mainAsset };
}

(async () => {
  fs.mkdirSync(outDir, { recursive: true }); const br = await VC.launch(VC.findBrowser({ CREATIVE_VISUAL_BROWSER: process.env.CREATIVE_VISUAL_BROWSER || 'auto' })); const report = [];
  const ids = process.argv[4] ? process.argv[4].split(',') : IDS; const seeds = (process.argv[5] || '1,2,3').split(',');
  try {
    for (const id of ids) for (const seed of seeds) {
      const { s, assets, mainAsset } = pool(id);
      const base = { understanding: s.understanding, research: { page: null, facts: s.facts }, assets, supplied: { facts: [], memories: [] }, seed, mainAsset };
      const d = D2.direct(base); const v = validatePlan2(d.plan, { assets, facts: s.facts, understanding: s.understanding, art: d.recipe, mainAsset }); if (v.errors.length) throw new Error(`${id}: ${v.errors[0]}`);
      const dec = d.recipe.assetDirector; const out = new Set(dec ? dec.rejected.map(x => x.id) : []);
      const input = { assets: assets.filter(a => !out.has(a.id) && !(a.cutoutOf && out.has(a.cutoutOf))), facts: s.facts, understandingLegacy: s.understanding, mainAsset };
      const call = async q => { const t = q.content.find(c => c.type === 'text' && c.text.startsWith('What was measured')).text; const h = JSON.parse(t.slice(t.indexOf('{')));
        return { model: 'mock-measured', usage: { input_tokens: 3400, output_tokens: 160 }, input: { verdict: 'almost', issues: h.measured.filter(m => m.offered.length && m.severity !== 'low').slice(0, 6).map(m => ({ scene: m.scene, view: m.view, issue: m.issue, severity: m.severity, repair: m.offered[0] })) } }; };
      const fin = VISUAL ? await AI.visualReview(v.plan, input, { limits: Object.assign(AI.limits({}), { visual: true }), call, liveBrowser: br, pictures }) : { plan: v.plan, meta: { kept: [] } };
      const L = await VR.look(fin.plan, input, { pictures }, br);
      const left = VIS.detect(L.views, { concept: fin.plan.idea && fin.plan.idea.concept, genre: fin.plan.idea && fin.plan.idea.genre });
      const tag = `${id}-${seed}`;
      fs.writeFileSync(path.join(outDir, `${tag}.plan.json`), JSON.stringify(fin.plan, null, 1));
      fs.writeFileSync(path.join(outDir, `${tag}.html`), L.html);
      const shape = sc => `${sc.composition || sc.layout}${sc.sceneType ? '/' + sc.sceneType : ''}`;
      const tiles = L.shots.desktop.map((png, i) => ({ png, label: `${tag} ${i} ${fin.plan.scenes[i] ? shape(fin.plan.scenes[i]) : ''}` }));
      fs.writeFileSync(path.join(outDir, `${tag}-desk.jpg`), await VC.sheet(br, tiles, { cols: 3, w: 480, h: 300, quality: 74 }));
      fs.writeFileSync(path.join(outDir, `${tag}-phone.jpg`), await VC.sheet(br, L.shots.mobile.map((png, i) => ({ png, label: `${i}` })), { cols: 6, w: 160, h: 346, quality: 70 }));
      const row = { tag, scenes: fin.plan.scenes.map(shape), kept: fin.meta.kept.map(k => `${k.scene}:${k.repair}`), reverted: (fin.meta.reverted || []).map(k => `${k.scene}:${k.repair}:${k.why}`), left: left.map(f => `${f.view[0]}${f.scene}:${f.issue}:${f.severity}`) };
      report.push(row); process.stdout.write(`${tag}: ${row.scenes.join(' > ')}\n   kept ${row.kept.join(' ')}\n   left ${row.left.join(' ')}\n`);
    }
  } finally {
    await br.close(); fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify(report, null, 1));
    // the totals a change is compared by: every severity, and each kind of finding
    const all = report.flatMap(x => x.left); const by = {}; all.forEach(f => { const k = f.split(':')[1]; by[k] = (by[k] || 0) + 1; });
    const lines = [`${report.length} pages -- high ${all.filter(f => f.endsWith(':high')).length}, medium ${all.filter(f => f.endsWith(':medium')).length}, low ${all.filter(f => f.endsWith(':low')).length}`].concat(Object.entries(by).sort((p, q) => q[1] - p[1]).map(([k, n]) => `  ${k} ${n}`));
    process.stdout.write('\n' + lines.join('\n') + '\n');
  }
})().catch(e => { console.error(e.stack); process.exit(1); });
