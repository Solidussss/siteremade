'use strict';
// THE ASSET DIRECTOR, ON REAL PHOTOGRAPHS: the six subjects of test/helpers/creative-subjects.js, each with a candidate pool
// of real, freely licensed photos (kept outside the repository) -- the subject's own pictures plus the kinds of candidates
// discovery really returns: a marketplace listing, a stock-library preview, near-copies of a picture, generic stock, the
// wrong product. Each page is made twice, with the asset director off (today's selection) and on, then taken through the
// structured review and the visual review; nothing it rejected may appear on the final page.
//   node test/review/creative-asset-review.js <photoDir> <outDir>
// photoDir: <id>.jpg|png, measured.json (the studio's own measuring of each photo, assets.js), subjects.json (subject boxes
// for busy photos), benchmark.json ({ subject: [{ id, file?, origin, ownerRole?, host?, title?, curation }] } -- extra
// candidates; the labels are what the picture check would say, written by hand: no vision call is made here).
// Nothing here calls a paid provider: the visual review's model is a mock that answers with what was measured.
const fs = require('fs');
const path = require('path');
const D2 = require('../../lib/creative/director2');
const AI = require('../../lib/creative/ai');
const DIR = require('../../lib/creative/direction');
const POOL = require('../../lib/creative/pool');
const PS = require('../../lib/creative/premium-source');
const TD = require('../../lib/creative/three-d');
const VC = require('../../lib/creative/visual-capture');
const VR = require('../../lib/creative/visual-review');
const { validatePlan2 } = require('../../lib/creative/validate2');
const { SUBJECTS, IDS } = require('../helpers/creative-subjects');
const { svgOf } = require('../helpers/stand-in-pictures');

const [photoDir, outDir] = [path.resolve(process.argv[2] || 'photos'), path.resolve(process.argv[3] || 'asset-review')];
const read = f => JSON.parse(fs.readFileSync(path.join(photoDir, f), 'utf8'));
const measured = read('measured.json'); const boxes = fs.existsSync(path.join(photoDir, 'subjects.json')) ? read('subjects.json') : {}; const extra = read('benchmark.json');
const fileOf = id => ['jpg', 'png'].map(e => path.join(photoDir, `${id}.${e}`)).find(f => fs.existsSync(f));
const pictures = a => (a.file ? { buf: fs.readFileSync(a.file), mime: a.mime } : { buf: Buffer.from(svgOf(a)), mime: 'image/svg+xml' });

// a subject's candidate pool as the studio would hold it: its own pictures (real photos, measured), plus the extra candidates
function pool(id) {
  const s = SUBJECTS[id]; const assets = []; const ov = (extra[id] && extra[id].override) || {};
  const real = (a, o) => { const f = fileOf(o.file || a.id); const m = measured[o.file || a.id]; if (!f || !m) return Object.assign({}, a, { stand: true }); const as = Object.assign({}, m.assess); if (boxes[a.id]) as.subject = boxes[a.id]; return Object.assign({}, a, { mime: /png$/.test(f) ? 'image/png' : 'image/jpeg', assess: as, file: f }); };
  s.assets.forEach(a => {
    if (a.cutout) { const of = a.cutoutOf; const m = measured[of] && measured[of].cut && measured[of].cut.assess; if (m && fs.existsSync(path.join(photoDir, `c-${of}.png`))) assets.push(Object.assign({}, a, { mime: 'image/png', assess: m, file: path.join(photoDir, `c-${of}.png`) })); return; }
    assets.push(real(Object.assign({}, a, ov[a.id] || {}), {}));
  });
  ((extra[id] && extra[id].add) || []).forEach(x => { const host = x.host ? { pageUrl: `https://${x.host}/p/${x.id}`, sourceUrl: `https://${x.host}/img/${x.urlFile || x.id}.jpg` } : {};
    assets.push(real(Object.assign({ id: x.id, origin: x.origin || 'research', title: x.title || x.id, alt: x.alt || '', ownerRole: x.ownerRole, curation: x.curation, caps: { moveFreely: false, frame: true, backdrop: true, heroSize: true } }, host), { file: x.file || x.id }));
    const m = measured[x.file || x.id]; if (m && m.cut && m.cut.assess && fs.existsSync(path.join(photoDir, `c-${x.file || x.id}.png`))) assets.push({ id: `c-${x.id}`, origin: 'derived', cutout: true, cutoutOf: x.id, title: x.title || x.id, mime: 'image/png', assess: m.cut.assess, file: path.join(photoDir, `c-${x.file || x.id}.png`), caps: { moveFreely: true, frame: false, backdrop: false, heroSize: true } });
  });
  return { s, assets, mainAsset: (extra[id] && extra[id].mainAsset) || s.mainAsset };
}
const shape = sc => sc.composition || sc.layout;
const rootOf = (assets, id) => { const a = assets.find(x => x.id === id); return a && a.cutoutOf ? a.cutoutOf : id; };
const used = (plan, assets) => { const u = new Set(); plan.scenes.forEach(sc => sc.layers.forEach(L => { if (L.kind === 'image' && L.asset) u.add(rootOf(assets, L.asset)); })); if (plan.actor) u.add(rootOf(assets, plan.actor.asset)); return [...u]; };
// today's sources, as the server picks them: video -- the first picture in pool order the premium gate allows; 3D -- the owner's main
const sources = (assets, poolX, mainAsset) => { const byId = new Map(assets.map(a => [a.id, a])); const c = poolX.pictures.find(p => PS.eligible(byId.get(p.id), { byId }).ok); const t = TD.intent({ allow: true, assets, mainAsset, kind: 'recognizable' }); return { cinematic: c ? c.id : null, model3d: t.planned ? t.sourceAssetId : null }; };

(async () => {
  fs.mkdirSync(outDir, { recursive: true }); const br = await VC.launch(VC.findBrowser({ CREATIVE_VISUAL_BROWSER: process.env.CREATIVE_VISUAL_BROWSER || 'auto' })); const report = [];
  try {
    for (const id of (process.argv[4] ? process.argv[4].split(',') : IDS)) {
      const { s, assets, mainAsset } = pool(id); const seed = '1';
      const base = { understanding: s.understanding, research: { page: null, facts: s.facts }, assets, supplied: { facts: [], memories: [] }, seed, mainAsset };
      const make = on => { const d = D2.direct(on ? base : Object.assign({}, base, { assetDirector: false })); const v = validatePlan2(d.plan, { assets, facts: s.facts, understanding: s.understanding, art: d.recipe, mainAsset }); if (v.errors.length) throw new Error(`${id}: ${v.errors[0]}`); return { plan: v.plan, recipe: d.recipe }; };
      const before = make(false), after = make(true); const dec = after.recipe.assetDirector; const out = new Set(dec.rejected.map(x => x.id));
      const input = { assets: assets.filter(a => !out.has(a.id) && !(a.cutoutOf && out.has(a.cutoutOf))), facts: s.facts, understandingLegacy: s.understanding, mainAsset };
      // ...through the visual review (its mock answers with what was measured) to the final page
      const call = async q => { const t = q.content.find(c => c.type === 'text' && c.text.startsWith('What was measured')).text; const h = JSON.parse(t.slice(t.indexOf('{')));
        return { model: 'mock-measured', usage: { input_tokens: 3400, output_tokens: 160 }, input: { verdict: 'almost', issues: h.measured.filter(m => m.offered.length && m.severity !== 'low').slice(0, 6).map(m => ({ scene: m.scene, view: m.view, issue: m.issue, severity: m.severity, repair: m.offered[0] })) } }; };
      const fin = await AI.visualReview(after.plan, input, { limits: Object.assign(AI.limits({}), { visual: true }), call, liveBrowser: br, pictures });
      const finalUsed = used(fin.plan, assets); const leaked = finalUsed.filter(x => out.has(x));
      const poolOff = POOL.build(assets, { mainAsset }); const poolOn = POOL.build(assets, { mainAsset, director: dec });
      const was = sources(assets, poolOff, mainAsset);
      const row = { id, candidates: assets.filter(a => !a.cutoutOf).map(a => ({ id: a.id, origin: a.origin, host: a.sourceUrl ? a.sourceUrl.split('/')[2] : '', depicts: a.curation && a.curation.depicts })),
        current: { hero: poolOff.main && poolOff.main.id, actor: before.plan.actor ? rootOf(assets, before.plan.actor.asset) : null, used: used(before.plan, assets), cinematic: was.cinematic, model3d: was.model3d, sequence: before.plan.scenes.map(shape).join(' > ') },
        director: { hero: dec.hero, replaced: dec.replaced, actor: dec.actor, detail: dec.detail, model3d: dec.model3d, cinematic: dec.cinematic, set: dec.set, rejected: dec.rejected, scarce: dec.scarce, used: used(after.plan, assets), sequence: after.plan.scenes.map(shape).join(' > ') },
        final: { used: finalUsed, leaked, visualKept: fin.meta.kept.map(k => `${k.scene}:${k.repair}`) },
        change: dec.rejected.length || dec.replaced || (dec.model3d && dec.model3d !== was.model3d) || (dec.cinematic && dec.cinematic !== was.cinematic) ? 'changed' : 'NO CHANGE NEEDED' };
      report.push(row);
      // the candidates, labelled with the decision; the pages before and after
      const lab = a => (dec.rejected.find(x => x.id === a.id) ? `REJECTED: ${dec.rejected.find(x => x.id === a.id).reason}` : [dec.hero === a.id ? 'HERO' : '', dec.actor && rootOf(assets, dec.actor) === a.id ? 'ACTOR' : '', dec.detail === a.id ? 'DETAIL' : '', dec.model3d === a.id ? '3D' : '', dec.cinematic === a.id ? 'VIDEO' : '', dec.set.includes(a.id) ? 'kept' : ''].filter(Boolean).join(' '));
      const thumbs = assets.filter(a => !a.cutoutOf && a.file).map(a => ({ png: null, a }));
      const pg = await br.page({ width: 1500, height: 800 });
      const html = `<!doctype html><body style="margin:0;background:#1d1d1d;color:#eee;font:13px system-ui"><h3 style="margin:8px">${id}: candidates and the asset director's decision</h3><div style="display:flex;flex-wrap:wrap;gap:8px;padding:8px">${thumbs.map(({ a }) => `<div style="width:230px"><img src="${require('url').pathToFileURL(a.file).href}" style="width:230px;height:160px;object-fit:contain;background:#333;${dec.rejected.some(x => x.id === a.id) ? 'opacity:.45;outline:3px solid #c33' : 'outline:3px solid #3a3'}"><div><b>${a.id}</b> ${a.origin === 'upload' ? '(owner)' : ''}</div><div style="color:${dec.rejected.some(x => x.id === a.id) ? '#f88' : '#8f8'}">${lab(a).replace(/[<&>]/g, '')}</div></div>`).join('')}</div></body>`;
      const site = VC.writeSite(html, {}); await pg.goto(site.url, 300); const h = await pg.evaluate('document.body.scrollHeight'); await pg.s('Emulation.setDeviceMetricsOverride', { width: 1500, height: Math.min(1600, h), deviceScaleFactor: 1, mobile: false }); fs.writeFileSync(path.join(outDir, `${id}-candidates.png`), await pg.shot('png')); await pg.close();
      const L0 = await VR.look(before.plan, { assets, mainAsset }, { pictures }, br); const L1 = await VR.look(fin.plan, input, { pictures }, br);
      const tiles = []; const n = Math.max(before.plan.scenes.length, fin.plan.scenes.length); for (let i = 0; i < n; i++) { if (L0.shots.desktop[i]) tiles.push({ png: L0.shots.desktop[i], label: `${id} BEFORE ${i} ${before.plan.scenes[i] ? shape(before.plan.scenes[i]) : ''}` }); else tiles.push({ png: L1.shots.desktop[0], label: '' }); if (L1.shots.desktop[i]) tiles.push({ png: L1.shots.desktop[i], label: `${id} AFTER ${i} ${fin.plan.scenes[i] ? shape(fin.plan.scenes[i]) : ''}` }); }
      fs.writeFileSync(path.join(outDir, `${id}-pages.jpg`), await VC.sheet(br, tiles, { cols: 2, w: 560, h: 350, quality: 76 }));
      fs.writeFileSync(path.join(outDir, `${id}-phone.jpg`), await VC.sheet(br, [{ png: L0.shots.mobile[0], label: 'BEFORE' }, { png: L1.shots.mobile[0], label: 'AFTER' }], { cols: 2, w: 195, h: 422, quality: 76 }));
      process.stdout.write(`${id}: ${row.change}\n   current  hero ${row.current.hero}  actor ${row.current.actor}  3D ${row.current.model3d}  video ${row.current.cinematic}  shows ${row.current.used.join(',')}\n   director hero ${dec.hero}${dec.replaced ? ` (was ${dec.replaced})` : ''}  actor ${dec.actor}  detail ${dec.detail}  3D ${dec.model3d}  video ${dec.cinematic}${dec.scarce ? '  SCARCE' : ''}  shows ${row.director.used.join(',')}\n`);
      dec.rejected.forEach(x => process.stdout.write(`   rejected ${x.id}: ${x.reason}\n`)); process.stdout.write(`   final page shows ${finalUsed.join(',')}${leaked.length ? `  LEAKED ${leaked.join(',')}` : '  (no rejected picture)'}\n`);
    }
  } finally { await br.close(); fs.writeFileSync(path.join(outDir, 'asset-report.json'), JSON.stringify(report, null, 1)); }
})().catch(e => { console.error(e.stack); process.exit(1); });
