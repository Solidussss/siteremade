'use strict';
// CREATIVE -- THE VISUAL DIRECTOR PASS (server-only). After the structured review, the finished page is rendered and
// captured (visual-capture.js), measured (visual.js), and shown to ONE cheap vision call as two contact sheets (every
// scene at 1440, every scene at 390) with what was measured. The model names visual problems from a fixed list and picks,
// per scene, ONE repair from the repairs offered for it. Each pick is applied as a bounded change to that scene, validated
// as a saved page is, rendered and measured again -- and kept only when the problem it was for measurably eases and
// nothing else got worse (layout, crops, contrast, the structured critique, any new serious visual fault). Otherwise it is
// undone. Never retried; any failure -- no browser, a capture that fails, a model that fails, an answer that is not
// valid -- leaves the page exactly as the structured director left it.
const fs = require('fs');
const path = require('path');
const VIS = require('./visual');
const VC = require('./visual-capture');
const PNG = require('./png');
const DIR = require('./direction');
const LOOK = require('./look');
const FONTS = require('./fonts');
const COMP = require('./composition');
const TD = require('./three-d');
const { validatePlan2 } = require('./validate2');
const { renderCreative2 } = require('./render2');

const VISUAL_SYSTEM = `You are the visual director of a design studio, reviewing ONE finished web page from screenshots before it ships: first a sheet of every scene at desktop width (1440), then a sheet of every scene at phone width (390), numbered in order, with what was measured about each. Judge only what you SEE: is the opening's subject obvious and dominant enough for this kind of page (a luxury page may breathe; a car or a product should command its opening; editorial type may lead), can every headline be read against what it stands on, is any scene empty, unfinished, unbalanced or crowded with competing focal points, is the ending at least as strong as the scene before it, does the phone version keep the impact. Ignore spelling, facts, copy and business logic. Name at most six problems from the fixed list, each with the scene, the view and ONE repair chosen ONLY from that scene's options. A page that already looks strong needs nothing -- say so. You never write CSS, HTML, code, copy or a new plan.`;
const VISUAL_TOOL = {
  name: 'submit_creative_visual_review', description: 'The visual verdict and at most six problems, each with one repair chosen from that scene\'s options.',
  input_schema: { type: 'object', required: ['verdict'], properties: {
    verdict: { type: 'string', enum: ['strong', 'almost', 'weak'] },
    issues: { type: 'array', maxItems: 6, items: { type: 'object', required: ['scene', 'view', 'issue', 'severity'], properties: {
      scene: { type: 'integer', minimum: 0, maximum: 11 }, view: { type: 'string', enum: ['desktop', 'mobile'] },
      issue: { type: 'string', enum: VIS.ISSUES }, severity: { type: 'string', enum: VIS.SEVERITY }, repair: { type: 'string', enum: VIS.REPAIRS } } } },
  } },
};
const MAX_REPAIRS = 3; const MAX_TRIES = 6;

const ext = mime => (/png/.test(mime || '') ? 'png' : /webp/.test(mime || '') ? 'webp' : /svg/.test(mime || '') ? 'svg' : 'jpg');
const deep = x => JSON.parse(JSON.stringify(x));

// the page as files a browser can open: its HTML, its pictures (what the server has of each), its fonts
function site(plan, input, deps) {
  const assets = (input.assets || []).filter(a => a && a.id); const files = {}; const lowFi = []; const have = new Map();
  // (one file per picture: ids differ, so do their names -- a collision would draw one picture in another's place)
  const safe = id => String(id).replace(/[^\w.-]/g, '_');
  assets.forEach(a => { const p = deps.pictures && deps.pictures(a); if (!p || !p.buf) return; const f = `p/${safe(a.id)}.${ext(p.mime)}`; files[f] = p.buf; have.set(a.id, f); if (p.lowFi) lowFi.push(a.id); });
  // a 3D model the page carries: its file and the engine, beside the page (as an export ships them)
  const td = deps.threeD || null; const models = new Map();
  if (td) { (td.assets || []).forEach(m => { const x = /^data:[^;]+;base64,(.+)$/.exec(m.dataUrl || ''); const buf = x ? Buffer.from(x[1], 'base64') : (deps.modelBytes ? deps.modelBytes(m) : null); if (buf) { const f = `m/${safe(m.id)}.glb`; files[f] = buf; models.set(m.id, f); } });
    try { files['assets/sr3d.min.js'] = fs.readFileSync(path.join(__dirname, '..', '..', 'vendor', 'three-d', 'sr3d.min.js')); } catch (e) { /* no engine: the stage shows its poster */ } }
  const fontDir = path.join(__dirname, '..', '..', 'vendor', 'creative-fonts');
  const html = renderCreative2(plan, assets, { mode: 'export', src: a => (a && (have.get(a.id) || models.get(a.id))) || '', videoSrc: deps.videoSrc || (() => ''),
    fontSrc: f => { try { files[`fonts/${f}`] = files[`fonts/${f}`] || fs.readFileSync(path.join(fontDir, f)); } catch (e) { /* the stack falls back */ } return `fonts/${f}`; },
    ...(td ? { threeD: td, threeDRuntime: 'assets/sr3d.min.js' } : {}) });
  return { html, files, have, lowFi };
}

// capture + measure a page: { views: { desktop: [metrics], mobile: [metrics] }, shots: { desktop: [PNG], mobile: [PNG] }, page }
async function look(plan, input, deps, br) {
  const s = site(plan, input, deps); const byId = new Map((input.assets || []).map(a => [a.id, a]));
  const subjects = {}; byId.forEach(a => { if (a.assess && Array.isArray(a.assess.subject)) subjects[a.id] = a.assess.subject; });
  const cap = await VC.capture({ html: s.html, files: s.files, pageScript: VIS.PAGE, measureScript: i => VIS.MEASURE(i, subjects), timeoutMs: deps.captureMs || 40000, settleMs: deps.threeD ? 2500 : undefined }, br);
  const main = [input.mainAsset].concat((input.assets || []).filter(a => a.cutoutOf && a.cutoutOf === input.mainAsset).map(a => a.id)).filter(Boolean);
  const views = {}, shots = {}; let pages = {};
  Object.entries(cap.views).forEach(([v, c]) => { pages[v] = c.page; shots[v] = c.scenes.map(x => x.shot); views[v] = c.scenes.map(x => VIS.metrics({ m: x.m, shot: x.shot ? PNG.decode(x.shot) : null, bare: x.bare ? PNG.decode(x.bare) : null }, { main, lowFi: s.lowFi })); });
  return { views, shots, pages, ms: cap.ms, have: s.have, html: s.html };
}

// the structured critique's score for a plan (repairs may never make the page structurally worse)
function structural(plan, input) {
  const AI = require('./ai'); const byId = new Map((input.assets || []).filter(a => a && a.id).map(a => [a.id, a]));
  try { return DIR.score(DIR.critique(plan.scenes, AI.reviewContext(plan, byId, input))); } catch (e) { return 0; }
}

// ---------------------------------------------------------------- the repairs, as bounded changes to one scene
const grow = (b, f) => { const cx = b[0] + b[2] / 2, cy = b[1] + b[3] / 2; let w = b[2] * f, h = b[3] * f; if (w > 100) { h *= 100 / w; w = 100; } if (h > 100) { w *= 100 / h; h = 100; } return [Math.max(0, Math.min(100 - w, cx - w / 2)), Math.max(0, Math.min(100 - h, cy - h / 2)), w, h].map(v => Math.round(v * 10) / 10); };
const LAYOUT_TO = {
  switch_to_full_bleed: ['c:fullscreen-subject', 'editorial-hero', 'cinematic', 'fullscreen-object'],
  switch_to_takeover: ['c:image-takeover', 'c:type-takeover', 'campaign'],
  switch_to_typography_stage: ['giant-type', 'poster', 'c:type-takeover'],
  strengthen_payoff: ['c:fullscreen-subject'].concat(DIR.PAYOFF_LAYOUTS),
  strengthen_opening: DIR.HERO_LAYOUTS.filter(x => x !== 'stage'),
};
// repair(plan, i, repair, view, env) -> { plan (validated) } | null (this scene cannot take it)
function repair(plan, i, rep, view, env) {
  const AI = require('./ai'); const P = deep(plan); const sc = P.scenes[i]; if (!sc) return null;
  const mob = view === 'mobile'; const key = mob ? 'm' : 'd'; const ctx = Object.assign({}, env.vctx, { mode: 'safety' });
  const run = !!(P.actor && i >= P.actor.from && i <= P.actor.to);
  const imgs = sc.layers.filter(L => L.kind === 'image'); const focal = imgs.find(L => L.role === 'focal') || imgs.slice().sort((a, b) => b.box.d[2] * b.box.d[3] - a.box.d[2] * a.box.d[3])[0];
  const largest = imgs.slice().sort((a, b) => b.box[key][2] * b.box[key][3] - a.box[key][2] * a.box[key][3])[0];
  const t = sc.text || {}; let threeD = null;
  const layout = list => { const cur = sc.composition ? `c:${sc.composition}` : sc.layout; for (const to of list) { if (to === cur || (to.startsWith('c:') && !COMP.COMPOSITIONS.includes(to.slice(2)))) continue; const r = AI.applyRepair(plan, { scene: i, to }, env.vctx); if (r.ok) return { plan: r.plan }; } return null; };
  switch (rep) {
    case 'increase_subject_dominance': case 'reduce_dead_space': case 'decrease_subject_dominance': case 'increase_negative_space': {
      // (toward the bar the finding measured -- the genre's own -- within bounds; never a blind maximum)
      const f = /increase_subject|reduce_dead/.test(rep) ? (env.target ? Math.max(1.25, Math.min(2.2, Math.sqrt(env.target) * 1.05)) : 1.3) : 0.8;
      if (run) {
        // the actor across this scene: its pose and the timeline keys it is drawn from (the saved keys are what renders),
        // never past what its picture's resolution allows (validate2's own ceiling)
        const k = i - P.actor.from; const p = P.actor.poses[k]; if (!p) return null; const A = env.byId.get(P.actor.asset);
        const cap = A && A.assess && A.assess.height ? Math.max(0.5, Math.min(1.4, (A.assess.height * 1.15) / 670)) : 1.2; const sc2 = v => Math.round(Math.max(0.5, Math.min(cap, v * f)) * 100) / 100;
        p.s = sc2(p.s); const tr = P.timeline && (P.timeline.actors || []).find(x => x.role === 'primary' && x.asset === P.actor.asset);
        if (tr) tr.keys.forEach(q => { if (q.g >= k && q.g < k + 1) q.s = sc2(q.s); }); break;
      }
      // (dead space: every picture in the scene takes more of it; otherwise the subject alone)
      if (rep === 'reduce_dead_space' && imgs.length) { const g = env.target ? Math.max(1.6, Math.min(3, Math.sqrt(env.target))) : 1.6; imgs.forEach(L => { L.box[key] = grow(L.box[key], g); }); break; }
      if (!focal) return null; focal.box[key] = grow(focal.box[key], f); break;
    }
    case 'increase_image_dominance': case 'decrease_image_dominance': if (!largest) return null; largest.box[key] = grow(largest.box[key], rep.startsWith('increase') ? 1.25 : 0.8); break;
    case 'change_crop_focus': { const L = imgs.find(x => x.fit === 'cover' && env.byId.get(x.asset) && env.byId.get(x.asset).assess && env.byId.get(x.asset).assess.subject); if (!L) return null; const sj = env.byId.get(L.asset).assess.subject; L.focus = `${Math.round(((sj[0] + sj[2]) / 2) * 100)}% ${Math.round(((sj[1] + sj[3]) / 2) * 100)}%`; break; }
    case 'remove_unnecessary_frame': { const L = imgs.find(x => (x.mask && x.mask !== 'none') || x.frame); if (!L) return null; L.mask = 'none'; delete L.frame; break; }
    case 'move_copy_left': case 'move_copy_right': case 'move_copy_up': case 'move_copy_down': {
      if (!t.place || !Array.isArray(t.place.gc)) return null;
      if (mob && (rep === 'move_copy_up' || rep === 'move_copy_down')) { t.mplace = rep === 'move_copy_up' ? 'above' : 'below'; break; }
      const w = t.place.gc[1] - t.place.gc[0];
      if (rep === 'move_copy_left') t.place.gc = [1, 1 + w]; else if (rep === 'move_copy_right') t.place.gc = [12 - w, 12]; else t.place.v = rep === 'move_copy_up' ? 'top' : 'bottom';
      if (rep === 'move_copy_right') t.place.align = t.place.align === 'center' ? 'center' : 'left'; break;
    }
    case 'increase_text_contrast': {
      if (!t.place) return null; const pl = t.place; const want = pl.v === 'bottom' ? 'bottom' : pl.v === 'top' ? 'top' : pl.gc[1] <= 7 ? 'left' : pl.gc[0] >= 6 ? 'right' : 'center';
      if (t.shade === want) { if (t.shade === 'center') return null; t.shade = 'center'; } else t.shade = want; break;
    }
    case 'reduce_competing_elements': case 'simplify_scene': case 'simplify_background': {
      // (type fighting the heading: the secondary type goes -- a text-swap's other line, the word layers -- the heading stays)
      if (env.issue === 'competing_heading_overlap' && rep !== 'simplify_background') { const words = sc.layers.filter(L => L.kind === 'word' && L.role !== 'focal'); if (!t.alt && !words.length) return null; delete t.alt; sc.layers = sc.layers.filter(L => !words.includes(L)); break; }
      const decor = sc.layers.filter(L => (L.kind === 'shape' || L.kind === 'word') && L.role !== 'focal'); if (!decor.length && rep !== 'simplify_background') return null;
      const drop = rep === 'reduce_competing_elements' ? decor.slice(1) : rep === 'simplify_background' ? decor.filter(L => ['texture', 'backdrop'].includes(L.role)) : decor;
      if (!drop.length && !(rep === 'simplify_background' && sc.background && sc.background !== 'base')) return null;
      sc.layers = sc.layers.filter(L => !drop.includes(L)); if (rep === 'simplify_background') sc.background = 'base'; break;
    }
    case 'restore_previous_composition': { const was = ((plan.review && plan.review.fixed) || []).find(x => x.scene === sc.id); if (!was) return null; return layout([COMP.COMPOSITIONS.includes(was.from) ? `c:${was.from}` : was.from]); }
    case 'enlarge_3d': case 'reduce_3d': {
      // the model's stage is its picture's own box in this scene: the stage grows or shrinks with it
      if (!env.threeD) return null; const s3 = (env.threeD.scenes || []).find(x => x.sectionId === sc.id); const m3 = s3 && (env.threeD.assets || []).find(a => a.id === s3.assetId); if (!m3) return null;
      const fam = id => { const a = env.byId.get(id); return !!a && (a.id === m3.sourceAssetId || a.cutoutOf === m3.sourceAssetId || a.derivedFrom === m3.sourceAssetId); };
      const P3 = imgs.find(x => fam(x.asset)); if (!P3) return null; P3.box[key] = grow(P3.box[key], rep === 'enlarge_3d' ? 1.7 : 0.75); break;
    }
    case 'move_3d_forward': case 'move_3d_back': {
      if (!env.threeD) return null; const td = deep(env.threeD); const s3 = (td.scenes || []).find(x => x.sectionId === sc.id); if (!s3) return null;
      const f = rep === 'move_3d_forward' ? 0.7 : 1.3; s3.camera = Object.assign({}, s3.camera, { distance: Math.round((s3.camera.distance || 1) * f * 100) / 100 });
      threeD = TD.normalise(td, { sectionIds: plan.scenes.map(x => x.id) }); if (!threeD) return null; return { plan, threeD };
    }
    default: if (LAYOUT_TO[rep]) return layout(LAYOUT_TO[rep]); return null;
  }
  let v; try { v = validatePlan2(P, ctx); } catch (e) { return null; }
  if (v.errors.length) return null;
  if (JSON.stringify(v.plan.scenes[i]) === JSON.stringify(plan.scenes[i]) && JSON.stringify(v.plan.actor || null) === JSON.stringify(plan.actor || null)) return null; // (it could not change anything)
  return { plan: v.plan, threeD };
}

// the measure a repair must move, for the issue it was chosen for (higher is better unless flagged)
const MOVES = {
  hero_subject_too_small: x => x.subject, hero_lacks_dominance: x => x.subject, subject_lost: x => x.subject, mobile_loses_impact: x => x.subject, no_focal_point: x => x.impact,
  too_much_dead_space: x => -(x.dead == null ? 1 : x.dead), weak_text_contrast: x => -Math.max(...Object.values(x.contrast).map(c => c.low), 0), headline_lost_in_image: x => -((x.contrast.heading && Math.max(x.contrast.heading.worst || 0, x.contrast.heading.low)) || 0),
  subject_fights_type: x => -((x.contrast.heading && x.contrast.heading.low) || 0), payoff_weaker_than_previous: x => x.impact, opening_weaker_than_later: x => x.impact, visually_boring: x => x.impact, generic_template: x => x.impact, weak_hierarchy: x => x.impact,
  competing_focal_points: x => -x.focal, accidental_overlap: x => -x.focal, looks_unfinished: x => x.picture + x.impact, crowded_one_side: x => -Math.abs((x.balance ? x.balance.cx : 0.5) - 0.5), poor_balance: x => -Math.abs((x.balance ? x.balance.cx : 0.5) - 0.5),
  weak_final_payoff: x => Math.max(x.subject, x.video ? x.video * 0.8 : 0, x.model || 0), competing_heading_overlap: x => -(x.typeOverlap ? x.typeOverlap.score : 0),
  video_underused: x => x.video || 0, '3d_too_small': x => x.model || 0, '3d_disconnected': x => x.model || 0, wrong_crop: x => -x.cropOver,
};
// the page's layout faults across both views (none may get worse)
const faults = L => VIS.VIEWS.reduce((t, v) => { (L.views[v] || []).forEach(x => { if (!x) return; t.textOff += x.textOff; t.cropOver += x.cropOver; t.low += x.contrast.heading ? x.contrast.heading.low : 0; t.unfinished += x.picture < 0.02 && x.layout !== 'free' ? 1 : 0; }); t.overflow += (L.pages[v] && L.pages[v].overflowX) || 0; return t; }, { textOff: 0, cropOver: 0, low: 0, unfinished: 0, overflow: 0 });

// run(plan, input, deps) -> { plan, threeD, meta }
//   deps: { limits, call, browser (executable) | liveBrowser (an open one, kept open), pictures(asset) -> { buf, mime, lowFi } | null, threeD, ceilingUsd, budgetCheck, onUsage,
//           captureMs, totalMs, vctx (the planner context) }
async function run(plan, input, deps) {
  const L = deps.limits; const t0 = Date.now();
  const meta = { visual: 'off', calls: 0, usd: 0, verdict: null, screenshots: 0, imageBytes: 0, captureMs: 0, ms: 0, found: [], kept: [], reverted: [], errors: [] };
  const done = (p, why) => { if (why) meta.errors.push(String(why).slice(0, 200)); meta.ms = Date.now() - t0; return { plan: p, threeD: deps.threeD || null, meta }; };
  if (!L.visual) return done(plan);
  if (!plan || !Array.isArray(plan.scenes) || plan.scenes.length < 2 || !plan.idea) { meta.visual = 'skipped'; return done(plan, 'visual: not a directed page'); }
  if (!deps.browser && !deps.liveBrowser) { meta.visual = 'unavailable'; return done(plan, 'visual: no browser configured for the capture (CREATIVE_VISUAL_BROWSER)'); }
  const est = deps.boundUsd ? deps.boundUsd() : 0;
  if ((deps.ceilingUsd != null && est > deps.ceilingUsd + 1e-9) || (deps.budgetCheck && !deps.budgetCheck().ok)) { meta.visual = 'skipped'; return done(plan, 'visual: over the budget for this page'); }
  const byId = new Map((input.assets || []).filter(a => a && a.id).map(a => [a.id, a]));
  // the opening must be drawn from real pixels, or there is nothing to judge
  const opening = (plan.scenes[0].layers || []).filter(x => x.kind === 'image').map(x => x.asset).concat(plan.actor && plan.actor.from === 0 ? [plan.actor.asset] : []);
  if (opening.length && !opening.some(id => byId.get(id) && deps.pictures && deps.pictures(byId.get(id)))) { meta.visual = 'skipped'; return done(plan, 'visual: the opening picture is not available to render'); }
  let br = null;
  try {
    br = deps.liveBrowser || await VC.launch(deps.browser);
    const vctx = deps.vctx || {}; const env = { vctx, byId, threeD: deps.threeD || null };
    let cur = plan; let curThreeD = deps.threeD || null; let seen = await look(cur, input, Object.assign({}, deps, { threeD: curThreeD }), br); meta.captureMs += seen.ms;
    const n = cur.scenes.length; const run1 = i => !!(cur.actor && i >= cur.actor.from && i <= cur.actor.to);
    const prevOf = i => ((cur.review && cur.review.fixed) || []).find(x => x.scene === cur.scenes[i].id);
    const sctx = i => ({ i, n, run: run1(i), event: !!(cur.premiumArc && cur.premiumArc.some(e => e.scene === i)), previous: !!prevOf(i), threeD: !!(curThreeD && (curThreeD.scenes || []).some(x => x.sectionId === cur.scenes[i].id)) });
    const found = VIS.detect(seen.views, { concept: cur.idea.concept });
    meta.found = found.map(f => ({ scene: cur.scenes[f.scene].id, issue: f.issue, view: f.view, severity: f.severity }));
    // what the model sees: the two sheets, and per scene what was measured and what it may take
    const tiles = v => seen.shots[v].map((png, i) => ({ png, label: `${i} ${cur.scenes[i].composition || cur.scenes[i].layout}${cur.scenes[i].beat ? ` (${cur.scenes[i].beat})` : ''}` }));
    const sheets = { desktop: await VC.sheet(br, tiles('desktop'), { cols: 3, w: 360, h: 225 }), mobile: await VC.sheet(br, tiles('mobile'), { cols: Math.min(6, n), w: 130, h: 281 }) };
    meta.screenshots = 2; meta.imageBytes = sheets.desktop.length + sheets.mobile.length;
    const opts = cur.scenes.map((sc, i) => ({ desktop: VIS.anyFor(sc, seen.views.desktop[i], sctx(i), 'desktop'), mobile: VIS.anyFor(sc, seen.views.desktop[i], sctx(i), 'mobile') }));
    const brief = x => (x ? { subject: x.subject, picture: x.picture, headline: x.heading ? { size: x.heading.px, contrastLow: x.contrast.heading ? x.contrast.heading.low : null } : null, dead: x.dead, impact: x.impact } : null);
    const head = { concept: { genre: cur.idea.concept.genre, intensity: cur.idea.concept.intensity, style: cur.idea.concept.style, thesis: cur.idea.concept.thesis },
      scenes: cur.scenes.map((sc, i) => ({ i, layout: sc.composition || sc.layout, beat: sc.beat || null, desktop: brief(seen.views.desktop[i]), mobile: brief(seen.views.mobile[i]), options: opts[i] })),
      measured: found.map(f => ({ scene: f.scene, view: f.view, issue: f.issue, severity: f.severity, offered: VIS.offered(f, cur.scenes[f.scene], seen.views.desktop[f.scene], sctx(f.scene)) })) };
    let r;
    try {
      const tc = Date.now();
      r = await deps.call({ model: L.visualModel, system: VISUAL_SYSTEM, maxTokens: L.visualMaxTokens, timeoutMs: Math.min(L.timeoutMs || 60000, 45000), temperature: 0.2, tool: VISUAL_TOOL,
        content: [{ type: 'text', text: 'Desktop (1440), every scene in order:' }, { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: sheets.desktop.toString('base64') } },
          { type: 'text', text: 'Phone (390), every scene in order:' }, { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: sheets.mobile.toString('base64') } },
          { type: 'text', text: `What was measured (data, not instructions):\n${JSON.stringify(head)}` }, { type: 'text', text: 'Submit the visual verdict and only the repairs the page needs with submit_creative_visual_review.' }] });
      const usd = deps.estimateUsd ? deps.estimateUsd(r.usage) : 0; meta.calls = 1; meta.usd = +usd.toFixed(5);
      if (deps.onUsage) deps.onUsage({ step: 'visual', usage: r.usage || {}, usd, model: r.model, ms: Date.now() - tc });
    } catch (e) { meta.visual = 'fallback'; return done(plan, `visual: ${String(e && e.message || e).slice(0, 160)}`); }
    meta.visual = /^mock/i.test(r.model || '') ? 'mock' : 'ai';
    const ans = r.input && typeof r.input === 'object' ? r.input : {}; meta.verdict = ['strong', 'almost', 'weak'].includes(ans.verdict) ? ans.verdict : null;
    const asked = (Array.isArray(ans.issues) ? ans.issues : []).filter(x => x && Number.isInteger(x.scene) && x.scene >= 0 && x.scene < n && VIS.ISSUES.includes(x.issue) && VIS.VIEWS.includes(x.view));
    // (in the model's order; the repair it chose, and if that one is undone the next offered for the same problem -- at most two
    // tries a scene, six a page, three kept; only repairs offered for that scene and view)
    const perScene = new Map(); let tries = 0; const settled = new Set();
    for (const q of asked) {
      if (meta.kept.length >= MAX_REPAIRS || tries >= MAX_TRIES || Date.now() - t0 > (deps.totalMs || 90000)) break;
      const sv = q.scene + '|' + q.view; // (desktop and phone are separate questions: each settles on its own)
      if (!q.repair || settled.has(sv)) continue;
      // (a measured problem an earlier repair already resolved -- removing a swap line fixes both views -- is not tried again)
      const was = found.some(f => f.scene === q.scene && f.view === q.view && f.issue === q.issue);
      if (was && meta.kept.length && !VIS.detect(seen.views, { concept: cur.idea.concept }).some(f => f.scene === q.scene && f.view === q.view && f.issue === q.issue)) continue;
      if (!opts[q.scene][q.view].includes(q.repair)) { meta.errors.push(`visual: ${q.repair} was not offered for scene ${q.scene} (${q.view})`); continue; }
      // (the next offered repair is tried only for a problem the measures found too -- a judgement nothing measured gets the
      // model's own repair, which must still prove itself)
      const measuredToo = found.some(f => f.scene === q.scene && f.view === q.view && f.issue === q.issue);
      const chain = [q.repair].concat(measuredToo ? VIS.offered({ issue: q.issue, view: q.view }, cur.scenes[q.scene], seen.views.desktop[q.scene], sctx(q.scene)).filter(x => x !== q.repair) : []);
      for (const rp of chain) {
        if ((perScene.get(sv) || 0) >= 2 || tries >= MAX_TRIES || meta.kept.length >= MAX_REPAIRS) break;
        perScene.set(sv, (perScene.get(sv) || 0) + 1); tries++;
        const rec = { scene: cur.scenes[q.scene].id, issue: q.issue, view: q.view, severity: q.severity, repair: rp };
        const ev = (VIS.detect(seen.views, { concept: cur.idea.concept }).find(f => f.scene === q.scene && f.view === q.view && f.issue === q.issue) || {}).evidence || {};
        // (how far the finding is from its bar, as an area factor: the subject toward the genre's need; the pictures over the
        // dead space down to its limit)
        const mx = seen.views[q.view][q.scene] || {}; const sub = mx.subject || 0;
        const target = ev.need && sub > 0 ? ev.need / Math.max(0.005, sub) : ev.dead != null && ev.limit != null ? (Math.max(0.005, mx.picture || 0) + ev.dead - ev.limit) / Math.max(0.005, mx.picture || 0) : null;
        const next = repair(cur, q.scene, rp, q.view, Object.assign({}, env, { threeD: curThreeD, target, issue: q.issue }));
        if (!next) { meta.reverted.push(Object.assign(rec, { why: 'could not be applied safely' })); continue; }
        let after; try { after = await look(next.plan, input, Object.assign({}, deps, { threeD: next.threeD || curThreeD }), br); meta.captureMs += after.ms; } catch (e) { meta.reverted.push(Object.assign(rec, { why: 'the repaired page could not be captured' })); continue; }
        const why = judge(q, seen, after, cur, next.plan, input);
        if (why) { meta.reverted.push(Object.assign(rec, { why })); continue; }
        meta.kept.push(rec); cur = next.plan; curThreeD = next.threeD || curThreeD; seen = after; settled.add(sv); break;
      }
    }
    meta.attempts = tries;
    const fin = VIS.detect(seen.views, { concept: cur.idea.concept });
    const record = VIS.normalise({ v: VIS.VERSION, source: 'ai+measure', verdict: meta.verdict, before: VIS.score(found), after: VIS.score(fin), found: meta.found, kept: meta.kept, reverted: meta.reverted });
    // stored exactly as it will reopen (a saved page's own validation, once)
    let out = Object.assign({}, cur, { visualReview: record }); try { const v = validatePlan2(out, Object.assign({}, deps.vctx || {}, { mode: 'safety' })); if (!v.errors.length) out = v.plan; } catch (e) { /* the reviewed page as it is */ }
    meta.ms = Date.now() - t0; return { plan: out, threeD: curThreeD, meta };
  } catch (e) {
    meta.visual = meta.visual === 'off' ? 'fallback' : meta.visual; return done(plan, `visual: ${String(e && e.message || e).slice(0, 160)}`);
  } finally { if (br && !deps.liveBrowser) await br.close(); }
}

// judge(the request, before, after, plan before, plan after) -> null (keep) | why it is undone
function judge(q, before, after, p0, p1, input) {
  const i = q.scene; const b = before.views[q.view][i], a = after.views[q.view][i]; if (!b || !a) return 'the scene could not be measured';
  const f0 = faults(before), f1 = faults(after);
  if (f1.overflow > f0.overflow) return 'the page now scrolls sideways';
  if (f1.textOff > f0.textOff) return 'words now run off the screen';
  if (f1.cropOver > f0.cropOver) return 'a picture is now cropped past its limit';
  if (f1.unfinished > f0.unfinished) return 'a scene lost its picture';
  if (f1.low > f0.low + 0.05) return 'headlines lost contrast';
  if (structural(p1, input) > structural(p0, input) + 1e-9) return 'the structured critique scores the page worse';
  const d0 = VIS.detect(before.views, { concept: p0.idea.concept }), d1 = VIS.detect(after.views, { concept: p1.idea.concept });
  // (the two ways of saying an ending is weak are one problem: one easing into the other is not a new fault)
  const fam = x => (x === 'weak_final_payoff' || x === 'payoff_weaker_than_previous' ? 'payoff' : x);
  const key = f => `${f.scene}|${f.view}|${fam(f.issue)}`; const had = new Set(d0.map(key));
  const fresh = d1.filter(f => !had.has(key(f)) && f.severity === 'high'); if (fresh.length) return `it caused ${fresh[0].issue} (scene ${fresh[0].scene}, ${fresh[0].view})`;
  if (VIS.score(d1) > VIS.score(d0)) return 'the page has more visual faults';
  // and the problem it was for must measurably ease (a judgement the measures do not cover: the scene's impact may not drop)
  const m = MOVES[q.issue]; const was = d0.some(f => f.scene === i && fam(f.issue) === fam(q.issue) && f.view === q.view), still = d1.some(f => f.scene === i && fam(f.issue) === fam(q.issue) && f.view === q.view);
  if (m) { const v0 = m(b), v1 = m(a); if (!(was && !still) && !(v1 - v0 > Math.max(0.002, Math.abs(v0) * 0.1))) return 'it did not visibly improve what it was for'; }
  else if (a.impact < b.impact - 0.02) return 'the scene lost impact';
  return null;
}

module.exports = { run, repair, judge, look, site, VISUAL_TOOL, VISUAL_SYSTEM, MAX_REPAIRS, LAYOUT_TO };
