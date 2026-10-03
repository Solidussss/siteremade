'use strict';
// CREATIVE DIRECTION (lib/creative/direction.js + its use in art.js, validate2.js and ai.js): a page is made from an IDEA
// -- a concept, an asset plan, a sequence of beats -- and then judged as ONE composition by a creative director: the
// rules first (deterministic, always), then one cheap model call that may only choose repairs the rules offer. Old saved
// pages reopen exactly as they were; new pages carry creativeDirectionVersion (plan.idea.v) and creativeDirectorVersion
// (plan.review.v). Nothing here reaches a paid provider: the model is an in-process fake or the mock server.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const DIR = require('../lib/creative/direction');
const D2 = require('../lib/creative/director2');
const AI = require('../lib/creative/ai');
const LOOK = require('../lib/creative/look');
const FONTS = require('../lib/creative/fonts');
const { validatePlan2 } = require('../lib/creative/validate2');
const { renderCreative2 } = require('../lib/creative/render2');
const { sanitizeCreative } = require('../lib/creative/store');
const { SUBJECTS, IDS } = require('./helpers/creative-subjects');
const { startServer, client, providerCalls } = require('./helpers/server-process');
const { mockPng } = require('./helpers/mock-image');

// ---------------------------------------------------------------- pages, made the way the server makes them
function make(id, seed, extra) {
  const s = SUBJECTS[id]; const x = extra || {};
  const { plan, recipe } = D2.direct(Object.assign({ understanding: s.understanding, research: { page: null, facts: s.facts }, assets: s.assets, supplied: { facts: [], memories: [] }, seed, mainAsset: s.mainAsset }, x.direct || {}));
  const v = validatePlan2(plan, Object.assign({ assets: s.assets, facts: s.facts, understanding: s.understanding, art: recipe, mainAsset: s.mainAsset }, x.ctx || {}));
  return Object.assign(v, { recipe, s, id, seed });
}
const reopen = (s, plan) => validatePlan2(JSON.parse(JSON.stringify(plan)), { assets: s.assets, facts: s.facts, understanding: s.understanding, mode: 'safety' });
const SEEDS = ['1', '2', '3', '4'];
const PAGES = IDS.flatMap(id => SEEDS.map(seed => make(id, seed)));
// the same pages, made without the director's judgement (direction: false) -- what the page would have been
const PLAIN = IDS.flatMap(id => SEEDS.map(seed => make(id, seed, { ctx: { direction: false } })));
const pagesOf = id => PAGES.filter(v => v.id === id);
const byIdOf = s => new Map(s.assets.map(a => [a.id, a]));
const inputOf = v => ({ assets: v.s.assets, facts: v.s.facts, understandingLegacy: v.s.understanding, mainAsset: v.s.mainAsset });
const ctxOf = v => AI.reviewContext(v.plan, byIdOf(v.s), inputOf(v));
const scoreOf = v => DIR.score(DIR.critique(v.plan.scenes, ctxOf(v)));
const shape = sc => sc.composition || sc.layout;
// pages saved by the code BEFORE creative direction existed (git 1f40e12, seed 1 of each subject): data, never regenerated
const LEGACY = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'creative', 'legacy-pre-direction.json'), 'utf8'));

// the model, faked in-process (no network, $0): records every call it is asked to make
function model(answer) {
  const log = [];
  const call = async q => {
    log.push(q); if (answer instanceof Error) throw answer;
    const t = q.content[0].text; const head = JSON.parse(t.slice(t.indexOf('{')));
    return { model: 'mock-test', usage: { input_tokens: 2600, output_tokens: 140 }, input: typeof answer === 'function' ? answer(head) : answer };
  };
  return { call, log };
}
const firstOffered = head => { const sc = head.scenes.find(x => x.options.length); return { verdict: 'almost', repairs: sc ? [{ scene: sc.i, to: sc.options[0] }] : [] }; };

// ================================================================ 1. the concept comes before composition
test('1. concept first: the idea is made before any scene, is the one the page was composed from, and steers it by genre', () => {
  const GENRE = { beverage: 'product', sneaker: 'fashion', software: 'tech', automotive: 'automotive', skincare: 'luxury', editorial: 'personal' };
  PAGES.forEach(v => {
    const where = `${v.id}/${v.seed}`;
    assert.ok(v.recipe.idea && v.recipe.idea.concept, `${where}: the art direction carries its idea (made in art.choose, before composition)`);
    assert.deepEqual(v.plan.idea.concept, DIR.normaliseIdea(v.recipe.idea).concept, `${where}: the page keeps the concept it was composed from`);
    const k = v.plan.idea.concept;
    assert.equal(k.genre, GENRE[v.id], `${where}: genre`);
    assert.ok(DIR.INTENSITIES.includes(k.intensity) && DIR.MOTIONS.includes(k.motion) && DIR.TYPES.includes(k.type) && DIR.STYLES.includes(k.style) && DIR.SIGNATURES.includes(k.signature) && DIR.BOOKENDS.includes(k.bookend), `${where}: the concept speaks the fixed vocabulary`);
    assert.ok(k.thesis.length >= 12 && k.memorable.length >= 12, `${where}: a thesis and a memorable moment`);
  });
  // the concept steers composition: quiet and editorial modes for luxury and editorial pages, louder ones for objects
  pagesOf('skincare').concat(pagesOf('editorial')).forEach(v => assert.ok(['quiet', 'editorial'].includes(v.plan.art.mode), `${v.id}/${v.seed}: ${v.plan.art.mode}`));
  pagesOf('beverage').concat(pagesOf('automotive'), pagesOf('sneaker')).forEach(v => assert.ok(['expressive', 'immersive'].includes(v.plan.art.mode), `${v.id}/${v.seed}: ${v.plan.art.mode}`));
  // a subject outside the known genres keeps the art direction's own weighting (no genre pull)
  const w = DIR.weights({ genre: 'other' }); assert.equal(w.personality('luxe'), 1); assert.equal(w.mode('quiet'), 1); assert.equal(w.family('object-story'), 1);
});

// ================================================================ 2. the asset plan comes before layout
test('2. asset plan first: every picture has a role before layout, the main picture leads, and every shown picture was planned', () => {
  PAGES.forEach(v => {
    const where = `${v.id}/${v.seed}`; const byId = byIdOf(v.s); const root = id => LOOK.root(byId.get(id), byId).id;
    const A = v.plan.idea.assets; assert.ok(A.length >= 2, `${where}: planned pictures`);
    A.forEach(e => assert.ok(DIR.ASSET_ROLES.includes(e.role) && DIR.CROPS.includes(e.crop), `${where}: ${e.id} role/crop`));
    const lead = A.find(e => e.role === 'actor' || e.role === 'hero'); assert.ok(lead, `${where}: a hero or an actor`);
    assert.equal(root(lead.id), root(v.s.mainAsset), `${where}: the owner's main picture leads`);
    assert.ok(!A.some(e => byId.get(e.id).ownerRole === 'logo' && e.role !== 'logo'), `${where}: a logo is never cast as a picture`);
    const planned = new Set(A.map(e => root(e.id)));
    v.plan.scenes.forEach(sc => sc.layers.filter(L => L.kind === 'image' && byId.get(L.asset)).forEach(L => assert.ok(planned.has(root(L.asset)), `${where}: ${sc.id} shows ${L.asset}, which the asset plan has`)));
    // the cut-out the plan names is the one the page floats
    A.filter(e => e.cutout).forEach(e => assert.equal(byId.get(e.cutout).cutoutOf, e.id, `${where}: ${e.id} cut-out`));
  });
});

// ================================================================ 3, 4. a persistent hero actor -- only when it suits
test('3. a persistent actor when the subject is an object with a cut-out: it lives across a run of scenes in distinct poses', () => {
  ['beverage', 'sneaker', 'automotive'].forEach(id => {
    pagesOf(id).forEach(v => assert.equal(v.plan.idea.concept.actor.persists, true, `${id}/${v.seed}: the object is the actor`));
    const runs = pagesOf(id).filter(v => v.plan.actor); assert.ok(runs.length >= 1, `${id}: at least one page runs the actor`);
    runs.forEach(v => {
      const a = v.plan.actor; assert.ok(a.to > a.from, `${id}/${v.seed}: a run of scenes`);
      assert.equal(new Set(a.poses.map(p => JSON.stringify(p))).size, a.poses.length, `${id}/${v.seed}: the actor moves -- every pose differs`);
      assert.equal(LOOK.root(byIdOf(v.s).get(a.asset), byIdOf(v.s)).id, v.s.mainAsset, `${id}/${v.seed}: the actor is the main subject`);
    });
  });
});
test('4. no persistent actor when the subject is not one object: software, luxury still life and a personal portfolio', () => {
  ['software', 'skincare', 'editorial'].forEach(id => pagesOf(id).forEach(v => {
    assert.equal(v.plan.idea.concept.actor.persists, false, `${id}/${v.seed}`); assert.equal(v.plan.actor, undefined, `${id}/${v.seed}: no actor run`);
  }));
});

// ================================================================ 5. an intentional arc
test('5. an arc: every page opens on a hook, ends on a payoff or callback, and moves through distinct beats', () => {
  PAGES.forEach(v => {
    const where = `${v.id}/${v.seed}`; const b = v.plan.scenes.map(sc => sc.beat);
    assert.ok(b.every(x => DIR.BEATS.includes(x)), `${where}: ${b}`); assert.deepEqual(v.plan.idea.sequence, b, `${where}: the sequence is the scenes' beats`);
    assert.equal(b[0], 'hook', where); assert.ok(['payoff', 'callback'].includes(b[b.length - 1]), `${where}: ends on ${b[b.length - 1]}`);
    assert.ok(new Set(b).size >= 3, `${where}: ${b.join(' > ')}`);
    assert.ok(b.slice(1, -1).some(x => x !== 'hook' && x !== 'payoff' && x !== 'callback'), `${where}: a middle`);
  });
});

// ================================================================ 6. no template rhythm
test('6. never three identical compositions in a row (the actor\'s run is one continuous shot, not three sections)', () => {
  PAGES.forEach(v => {
    const sc = v.plan.scenes; const run = i => !!(v.plan.actor && i >= v.plan.actor.from && i <= v.plan.actor.to);
    for (let i = 2; i < sc.length; i++) {
      if (run(i) && run(i - 1) && run(i - 2)) continue;
      assert.ok(!(shape(sc[i]) === shape(sc[i - 1]) && shape(sc[i]) === shape(sc[i - 2])), `${v.id}/${v.seed}: ${sc.map(shape).join(' > ')}`);
    }
  });
});

// ================================================================ 7. premium video is never a small card
test('7. a premium hero video owns the screen: never a small card, and a page that shrinks it is caught', () => {
  ['beverage', 'sneaker', 'automotive'].forEach(id => ['1', '2'].forEach(seed => {
    const s = SUBJECTS[id]; const ph = { intent: 'cinematic_hero', source: s.mainAsset };
    const v = make(id, seed, { direct: { premium: { video: true, intent: 'cinematic_hero', source: s.mainAsset } }, ctx: { premiumHero: ph } });
    assert.deepEqual(v.errors, [], `${id}/${seed}`);
    const ctx = Object.assign(ctxOf(v), { heroVideo: true });
    assert.ok(!DIR.critique(v.plan.scenes, ctx).some(f => f.code === 'video-small'), `${id}/${seed}: the hero video is full size`);
    // as the renderer shows it: inside its picture's frame only when that frame is large, else full-bleed behind the scene
    const h = renderCreative2(v.plan, v.s.assets.map(a => (a.id === s.mainAsset ? Object.assign({}, a, { video: { mediaId: 'pm_hero', mime: 'video/mp4' } }) : a)), { mode: 'export', src: a => `${a.id}.png`, videoSrc: a => (a.video ? `${a.id}.mp4` : '') });
    const frame = v.plan.scenes[0].layers.find(L => L.kind === 'image' && L.asset === s.mainAsset);
    if (!(frame && frame.box.d[2] * frame.box.d[3] >= 4500)) assert.match(h, /class="sc-herovid"/, `${id}/${seed}: full-bleed behind the opening`);
    // the same opening squeezed into a card: the renderer moves the video behind the scene -- still never small
    const bad = JSON.parse(JSON.stringify(v.plan)); const f = bad.scenes[0].layers.find(L => L.kind === 'image' && L.role === 'focal');
    if (f) { f.box.d = [60, 30, 26, 30]; assert.ok(!DIR.critique(bad.scenes, ctx).some(x => x.code === 'video-small')); }
  }));
  // a premium clip on a small picture layer IS small: the director names it at its heaviest weight and offers a full screen
  const focalOf = x => x.layers.find(L => L.kind === 'image' && L.role === 'focal');
  const v = PAGES.find(p => DIR.survey(p.plan.scenes, ctxOf(p)).some((x, i) => i > 0 && !x.full && !x.run && focalOf(p.plan.scenes[i]))); assert.ok(v);
  const ctx = ctxOf(v); const sc = DIR.survey(v.plan.scenes, ctx).findIndex((x, i) => i > 0 && !x.full && !x.run && focalOf(v.plan.scenes[i]));
  const bad = JSON.parse(JSON.stringify(v.plan)); const f = bad.scenes[sc].layers.find(L => L.kind === 'image' && L.role === 'focal'); f.box.d = [60, 30, 26, 30];
  const vctx = Object.assign({}, ctx, { video: [ctx.rootOf(f.asset)] });
  assert.equal(DIR.survey(bad.scenes, vctx)[sc].videoBig, false);
  const found = DIR.critique(bad.scenes, vctx).find(x => x.code === 'video-small' && x.at === sc);
  assert.ok(found && found.w === DIR.W['video-small'], `a small clip is caught (${v.id}/${v.seed} scene ${sc})`);
  assert.ok(DIR.candidates(found, bad.scenes, vctx).some(c => ['fullscreen-subject', 'cinematic-chapter'].includes(c.composition) || ['editorial-hero', 'cinematic'].includes(c.layout)), 'and given the screen');
});

// ================================================================ 8. 3D used on purpose
test('8. a planned 3D model is used on purpose: its picture is marked in the asset plan and it gets a scene that shows the subject', () => {
  let placed = 0;
  ['beverage', 'sneaker', 'skincare'].forEach(id => ['1', '2'].forEach(seed => {
    const s = SUBJECTS[id]; const v = make(id, seed, { ctx: { premium3D: { allow: true, mainAsset: s.mainAsset } } });
    assert.deepEqual(v.errors, []); assert.equal(v.plan.premium3D.planned, true, `${id}/${seed}`);
    const m = v.plan.idea.model; assert.ok(m, `${id}/${seed}: the idea places the model`); assert.equal(m.asset, s.mainAsset);
    // (a scene that shows the subject, never the opening -- or none, when only the actor carries it: the server then chooses)
    const byId = byIdOf(s); const sc = v.plan.scenes.find(x => x.id === m.scene); if (m.scene) placed++;
    if (m.scene) assert.ok(sc && v.plan.scenes.indexOf(sc) > 0, `${id}/${seed}: never the opening`);
    if (m.scene) assert.ok(sc.layers.some(L => L.kind === 'image' && byId.get(L.asset) && LOOK.root(byId.get(L.asset), byId).id === s.mainAsset), `${id}/${seed}: its scene shows the subject`);
    assert.ok(['actor', 'reveal', 'payoff'].includes(m.role));
    assert.ok(v.plan.idea.assets.some(e => e.id === s.mainAsset && e.source3d && e.model), `${id}/${seed}: marked in the asset plan`);
    assert.equal(JSON.stringify(reopen(s, v.plan).plan), JSON.stringify(v.plan), `${id}/${seed}: reopens unchanged`);
  }));
  assert.ok(placed >= 4, `${placed} of 6 models placed in a scene of their own`);
  // without 3D, no model is planned
  PAGES.forEach(v => assert.equal(v.plan.idea.model, undefined));
  // and the server makes the model in that scene when nothing else is asked (server.js threeDSource)
  assert.match(fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8'), /const section = asked \|\| planned \|\|/);
});

// ================================================================ 9. continuity survives the director
test('9. continuity: a repaired page is still one experience -- a contract at every seam, a valid timeline, no errors', () => {
  const repaired = PAGES.filter(v => v.plan.review.fixed.length); assert.ok(repaired.length >= 6, `${repaired.length} repaired pages`);
  repaired.forEach(v => {
    const where = `${v.id}/${v.seed}`; assert.deepEqual(v.errors, [], where);
    const tl = v.plan.timeline; assert.ok(tl && tl.continuity, `${where}: contracts`);
    // (seam i is the way into scene i; inside the actor's run the actor itself is the seam)
    const run = i => !!(v.plan.actor && i > v.plan.actor.from && i <= v.plan.actor.to);
    for (let at = 1; at < v.plan.scenes.length; at++) {
      if (run(at)) continue;
      assert.ok(tl.transitions.some(t => t.at === at), `${where}: a transition into scene ${at}`);
      assert.ok(tl.continuity.contracts.some(k => k.at === at), `${where}: a contract at seam ${at}`);
    }
  });
});

// ================================================================ 10. the critique finds what is weak
test('10. the critique names what is weak in pages made before creative direction (luxury and editorial heroes, missing payoffs)', () => {
  const found = {};
  Object.entries(LEGACY).forEach(([id, plan]) => {
    const s = SUBJECTS[id]; const v = { s, plan }; const f = DIR.critique(plan.scenes, ctxOf(v));
    f.forEach(x => { assert.ok(DIR.FINDINGS.includes(x.code)); assert.ok(Number.isInteger(x.at) && x.at >= 0 && x.at < plan.scenes.length); });
    found[id] = f.map(x => x.code);
  });
  assert.ok(found.skincare.includes('weak-hero'), `luxury: ${found.skincare}`);
  assert.ok(found.editorial.includes('weak-hero'), `editorial: ${found.editorial}`);
  assert.ok(Object.values(found).flat().includes('weak-payoff'), 'a missing payoff is found somewhere');
  // a deliberately templated page: every scene a split -- splits, repeats and a weak hero, all named
  const v = pagesOf('editorial')[0]; const tpl = JSON.parse(JSON.stringify(v.plan)); tpl.scenes.forEach(sc => { sc.layout = 'split'; delete sc.composition; });
  const codes = DIR.critique(tpl.scenes, ctxOf({ s: v.s, plan: tpl })).map(x => x.code);
  ['splits', 'repeats'].forEach(c => assert.ok(codes.includes(c), `templated page: ${codes}`));
});

// ================================================================ 11. the critique repairs
test('11. the critique repairs: the reviewed page scores better than the same page unjudged, and records what it changed', () => {
  let better = 0;
  PAGES.forEach((v, i) => {
    const p = PLAIN[i]; assert.equal(`${p.id}/${p.seed}`, `${v.id}/${v.seed}`);
    const r = v.plan.review; assert.equal(r.source, 'rules');
    assert.ok(r.after <= r.before, `${v.id}/${v.seed}: never worse (${r.before} -> ${r.after})`);
    assert.ok(scoreOf(v) <= scoreOf(p) + 1e-9, `${v.id}/${v.seed}: ${scoreOf(p)} unjudged -> ${scoreOf(v)}`);
    if (scoreOf(v) < scoreOf(p)) better++;
    assert.ok(r.fixed.length <= 3, 'at most three scenes recomposed');
    r.fixed.forEach(x => { const sc = v.plan.scenes.find(s => s.id === x.scene); assert.equal(shape(sc), x.to, `${v.id}/${v.seed}: ${x.scene} became ${x.to}`); assert.notEqual(x.from, x.to); });
    if (r.fixed.some(x => x.code === 'weak-hero')) assert.ok(!['split', 'framed', 'text', 'image'].includes(shape(v.plan.scenes[0])), `${v.id}/${v.seed}: the hero became ${shape(v.plan.scenes[0])}`);
  });
  assert.ok(better >= 8, `${better} of ${PAGES.length} pages improved`);
  const total = (list) => list.reduce((t, v) => t + scoreOf(v), 0);
  assert.ok(total(PAGES) < total(PLAIN) * 0.5, `the page set as a whole: ${total(PLAIN)} -> ${total(PAGES)}`);
  // the luxury and editorial heroes: framed and split openings become heroes
  pagesOf('skincare').concat(pagesOf('editorial')).forEach(v => assert.ok(!['split', 'framed'].includes(shape(v.plan.scenes[0])), `${v.id}/${v.seed}: opens on ${shape(v.plan.scenes[0])}`));
});

// ================================================================ 12. a failed critique never breaks a generation
test('12. a failed review never breaks generation: the rules fall back to the page as composed; the model\'s failure keeps the page', async () => {
  // the rules' review throws part-way: the page is exactly the unjudged page
  const real = DIR.candidates; let thrown = 0;
  DIR.candidates = () => { thrown++; throw new Error('boom'); };
  try {
    const v = make('skincare', '1'); const p = make('skincare', '1', { ctx: { direction: false } });
    const unbeat = sc => sc.map(x => Object.assign({}, x, { beat: undefined }));
    assert.ok(thrown > 0); assert.deepEqual(v.errors, []); assert.deepEqual(unbeat(v.plan.scenes), unbeat(p.plan.scenes), 'the page as composed (with its beats named)');
    assert.deepEqual(v.plan.review.fixed, []); assert.ok(v.warnings.some(w => /review could not finish/.test(w)));
  } finally { DIR.candidates = real; }
  // the model's review fails: the reviewed page comes back untouched, never retried
  const v = pagesOf('skincare')[0]; const m = model(new Error('overloaded'));
  const out = await AI.review(v.plan, inputOf(v), { limits: AI.limits({}), call: m.call });
  assert.equal(out.plan, v.plan); assert.equal(out.meta.review, 'fallback'); assert.equal(m.log.length, 1, 'one call, no retry'); assert.equal(out.meta.calls, 0);
  // junk: an unknown verdict, unknown findings and a repair nobody offered -- ignored
  const j = model({ verdict: 'magnificent', findings: [{ code: 'too-pretty', scene: 99 }], repairs: [{ scene: 0, to: 'marquee-of-doom' }, { scene: 1, to: 'c:not-a-composition' }] });
  const pv = PLAIN.find(x => x.id === 'skincare' && x.seed === '1');
  const jo = await AI.review(pv.plan, inputOf(pv), { limits: AI.limits({}), call: j.call });
  assert.deepEqual(jo.plan.scenes, pv.plan.scenes); assert.equal(jo.meta.verdict, null); assert.equal(jo.meta.fixed.length, 0);
  assert.ok(jo.meta.errors.some(e => /not offered/.test(e)));
});

// ================================================================ 13. the model's review: bounded, structured, selective
test('13. the creative director\'s review sees a structured page, may only choose offered repairs, and each is kept only if the page gains', async () => {
  const pv = PLAIN.find(x => x.id === 'skincare' && x.seed === '1');
  const m = model(firstOffered); const out = await AI.review(pv.plan, inputOf(pv), { limits: AI.limits({}), call: m.call });
  assert.equal(m.log.length, 1); const q = m.log[0];
  assert.equal(q.tool.name, 'submit_creative_review'); assert.equal(q.maxTokens, 700); assert.equal(q.temperature, 0.2);
  // what it sees: the concept, each scene as composed (no pixels, no CSS), what the rules found, the repairs on offer
  const head = JSON.parse(q.content[0].text.slice(q.content[0].text.indexOf('{')));
  assert.deepEqual(Object.keys(head), ['concept', 'scenes', 'found']); assert.equal(head.concept.genre, 'luxury');
  head.scenes.forEach(x => { ['i', 'shape', 'beat', 'area', 'framed', 'split', 'full', 'typeLed', 'options'].forEach(k => assert.ok(k in x, k)); assert.equal(typeof x.roots, 'number'); });
  assert.doesNotMatch(q.content[0].text, /data:image|<style|\{\s*color:/);
  // its schema: a fixed vocabulary, never code
  const sch = AI.REVIEW_TOOL.input_schema.properties; assert.deepEqual(sch.findings.items.properties.code.enum, DIR.FINDINGS);
  assert.equal(sch.repairs.maxItems, 3); assert.equal(sch.findings.maxItems, 6); assert.ok(!('css' in sch) && !('plan' in sch) && !('scenes' in sch));
  // what it chose was applied as the recomposition of that one scene, and the page improved
  assert.equal(out.meta.review, 'mock'); assert.equal(out.meta.calls, 1); assert.ok(out.meta.usd > 0);
  assert.equal(out.meta.fixed.length, 1); const fx = out.meta.fixed[0];
  assert.equal(shape(out.plan.scenes.find(s => s.id === fx.scene)), fx.to);
  pv.plan.scenes.forEach((sc, i) => { if (sc.id !== fx.scene) assert.deepEqual(out.plan.scenes[i].layers, sc.layers, `${sc.id}: untouched`); });
  assert.ok(scoreOf({ s: pv.s, plan: out.plan }) < scoreOf(pv)); assert.equal(out.plan.review.source, 'ai+rules');
  assert.equal(JSON.stringify(reopen(pv.s, out.plan).plan), JSON.stringify(out.plan), 'the reviewed page reopens unchanged');
  // a repair that would not make the page better is not kept (the model chose a scene the rules did not flag)
  const worse = model(head2 => { const sc = head2.scenes.filter(x => x.options.length).pop(); return { verdict: 'generic', repairs: sc ? [{ scene: sc.i, to: sc.options[sc.options.length - 1] }] : [] }; });
  const page = pagesOf('beverage').find(v => !v.plan.review.remaining.length);
  const wo = await AI.review(page.plan, inputOf(page), { limits: AI.limits({}), call: worse.call });
  assert.equal(wo.meta.fixed.length, 0); assert.deepEqual(wo.plan.scenes, page.plan.scenes);
  // switched off, or over what the page may still spend: no call
  const off = model(firstOffered); const o1 = await AI.review(pv.plan, inputOf(pv), { limits: AI.limits({ CREATIVE_DIRECTOR_REVIEW: 'off' }), call: off.call });
  assert.equal(off.log.length, 0); assert.equal(o1.meta.review, 'off'); assert.equal(o1.plan, pv.plan);
  const poor = model(firstOffered); const o2 = await AI.review(pv.plan, inputOf(pv), { limits: AI.limits({}), call: poor.call, ceilingUsd: 0 });
  assert.equal(poor.log.length, 0); assert.equal(o2.meta.review, 'skipped');
});

// ================================================================ 14, 15. old pages unchanged; new pages versioned
test('14. a page saved before creative direction reopens exactly as it was: no idea, no review, no beats added', () => {
  Object.entries(LEGACY).forEach(([id, plan]) => {
    const s = SUBJECTS[id]; assert.equal(plan.idea, undefined); assert.equal(plan.review, undefined);
    const v = reopen(s, plan); assert.equal(JSON.stringify(v.plan), JSON.stringify(plan), `${id}: byte-identical`);
    assert.ok(v.plan.scenes.every(sc => sc.beat === undefined), id);
    // ...and through the store, as the editor opens it
    const c = sanitizeCreative({ brief: id, understanding: s.understanding, research: { facts: s.facts }, assets: s.assets.map(a => Object.assign({}, a, { assetRef: 'a'.repeat(64) })), plan });
    assert.equal(JSON.stringify(c.plan), JSON.stringify(plan), `${id}: the store keeps it`);
  });
});
test('15. a new page carries creativeDirectionVersion and creativeDirectorVersion, and reopens byte-identical', () => {
  PAGES.forEach(v => {
    const where = `${v.id}/${v.seed}`;
    assert.equal(v.plan.idea.v, DIR.VERSION, where); assert.equal(v.plan.review.v, DIR.DIRECTOR_VERSION, where);
    assert.equal(JSON.stringify(reopen(v.s, v.plan).plan), JSON.stringify(v.plan), `${where}: reopens unchanged`);
  });
  // a stored idea is data: a version from the future, unknown words and pictures the page does not have are clamped
  const s = SUBJECTS.beverage; const byId = byIdOf(s);
  const n = DIR.normaliseIdea({ v: 99, concept: { genre: 'space-opera', actor: { kind: 'dragon', asset: 'nope' }, thesis: 'x'.repeat(900) }, assets: [{ id: 'nope', role: 'hero' }, { id: s.mainAsset, role: 'boss' }] }, { byId });
  assert.equal(n.v, DIR.VERSION); assert.equal(n.concept.genre, 'other'); assert.equal(n.concept.actor.kind, 'none'); assert.equal(n.concept.actor.asset, null);
  assert.ok(n.concept.thesis.length <= 240); assert.deepEqual(n.assets.map(e => [e.id, e.role]), [[s.mainAsset, 'support']]);
  assert.equal(DIR.normaliseReview({ v: 7, source: 'model', found: ['weak-hero', 'rm -rf'] }).source, 'rules');
});

// ================================================================ 16. export = preview
test('16. the exported page is the page the studio previewed, for a page the director recomposed', () => {
  const v = PAGES.find(x => x.id === 'skincare' && x.plan.review.fixed.length); assert.ok(v);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sr-direction-export-'));
  process.env.SITEREMADE_BACKEND = 'local'; process.env.SITEREMADE_ASSET_STORE_DIR = path.join(dir, 'assets');
  const { getDatabaseAdapter } = require('../lib/adapters/database-adapter'); const projectStore = require('../lib/project-store'); const { compileExport } = require('../lib/export-compiler');
  const db = getDatabaseAdapter(':memory:');
  const pix = n => { const b = Buffer.alloc(80); b.write('\x89PNG\r\n\x1a\n', 0, 'latin1'); b.writeUInt32BE(13, 8); b.write('IHDR', 12); b.writeUInt32BE(10, 16); b.writeUInt32BE(10, 20); b.writeUInt32BE(n, 60); return 'data:image/png;base64,' + b.toString('base64'); };
  const assets = v.s.assets.map((a, i) => Object.assign({}, a, { dataUrl: pix(i + 1), mime: 'image/png' }));
  const direction = { mode: 'creative', meta: { id: 'c1' }, pages: [{ id: 'creative', label: 'Creative page', sections: [] }], creative: { brief: 'serum', understanding: v.s.understanding, research: { status: 'ok', facts: v.s.facts }, assets, plan: v.plan } };
  try {
    const check = projectStore.validateDirectionsState({ directions: [direction], activeDirectionIndex: 0 }); assert.ok(check.valid, check.error);
    assert.equal(JSON.stringify(check.normalized.directions[0].creative.plan), JSON.stringify(v.plan), 'saved as reviewed');
    projectStore.internalizeAssets(db, check.normalized);
    const workDir = path.join(dir, 'export');
    const res = compileExport(db, { project: { id: 'p-dir', revision: 1, directionsState: check.normalized }, directionIndex: 0, workDir });
    const out = fs.readFileSync(path.join(workDir, 'index.html'), 'utf8');
    const srcOf = a => (res.manifest.assets.find(m => m.hash === check.normalized.directions[0].creative.assets.find(x => x.id === a.id).assetRef) || {}).path || '';
    const preview = renderCreative2(v.plan, assets, { mode: 'preview', src: srcOf });
    const strip = h => h.replace(/data-mode="\w+"/, '').replace(/"mode":"\w+"/, '').replace(/<script>\n\(function\(\)\{\nvar d=document[\s\S]*<\/script>/, '');
    assert.equal(strip(out), strip(preview), 'identical page apart from the preview-only script');
    v.plan.review.fixed.forEach(x => { const sc = v.plan.scenes.find(s => s.id === x.scene); assert.ok(out.includes(`data-layout="${sc.layout}"`), `${x.scene} exported as recomposed`); });
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

// ================================================================ 17, 18. mobile and reduced motion
test('17. mobile: every recomposed scene has its own phone layout, the hero picture stays large on a phone, nothing spills sideways', () => {
  PAGES.filter(v => v.plan.review.fixed.length).forEach(v => {
    const byId = byIdOf(v.s);
    v.plan.review.fixed.forEach(x => {
      const sc = v.plan.scenes.find(s => s.id === x.scene); const where = `${v.id}/${v.seed} ${x.scene} (${x.to})`;
      sc.layers.forEach(L => { const m = L.box && L.box.m; assert.ok(Array.isArray(m) && m.length === 4 && m.every(n => Number.isFinite(n)), `${where}: ${L.id} phone box`); });
      const pics = sc.layers.filter(L => L.kind === 'image' && byId.get(L.asset) && !L.hideM);
      if (pics.length) assert.ok(Math.max(...pics.map(L => L.box.m[2])) >= 40, `${where}: the picture is at least 40% of a phone's width`);
      assert.ok(sc.text && Number.isInteger(sc.text.fit), `${where}: words fitted (mobile type scale)`);
    });
    const h = renderCreative2(v.plan, v.s.assets, { mode: 'export', src: a => `${a.id}.png` });
    assert.match(h, /@media \(max-width:\s*\d+px\)/, `${v.id}/${v.seed}: phone rules`);
  });
});
test('18. reduced motion: a directed page honours prefers-reduced-motion -- the runtime stills itself and premium video stays a still', () => {
  const v = make('sneaker', '1', { direct: { premium: { video: true, intent: 'cinematic_hero', source: 'shoe' } }, ctx: { premiumHero: { intent: 'cinematic_hero', source: 'shoe' } } });
  const h = renderCreative2(v.plan, v.s.assets, { mode: 'export', src: a => `${a.id}.png` });
  assert.match(h, /matchMedia\('\(prefers-reduced-motion: reduce\)'\)\.matches\)html\.setAttribute\('data-motion','reduced'\)/);
  assert.match(h, /@media \(prefers-reduced-motion:reduce\)/);
  PAGES.filter(x => x.plan.review.fixed.length).slice(0, 6).forEach(x => assert.match(renderCreative2(x.plan, x.s.assets, { mode: 'export', src: a => `${a.id}.png` }), /data-motion','reduced'/));
});

// ================================================================ 19, 20. fonts and fitted words survive the director
test('19. the owner\'s fonts survive generation, the review, its repairs and reopening', async () => {
  const preset = FONTS.PRESETS.find(p => p.headline !== 'apple-system'); const fonts = { headline: preset.headline, body: preset.body, label: preset.label, preset: preset.id };
  const pv = PLAIN.find(x => x.id === 'skincare' && x.seed === '1'); const withFonts = Object.assign({}, pv.plan, { fonts });
  const saved = reopen(pv.s, withFonts).plan; assert.deepEqual(saved.fonts, fonts);
  const out = await AI.review(saved, inputOf(pv), { limits: AI.limits({}), call: model(firstOffered).call });
  assert.ok(out.meta.fixed.length, 'a repair was made'); assert.deepEqual(out.plan.fonts, fonts, 'kept through the repair');
  assert.deepEqual(reopen(pv.s, out.plan).plan.fonts, fonts);
  const h = renderCreative2(out.plan, pv.s.assets, { mode: 'export', src: a => `${a.id}.png` });
  assert.ok(h.includes(`data-fonts="${fonts.headline}"`), 'the chosen headline face is the page\'s');
  FONTS.facesFor(fonts).forEach(x => assert.ok(h.includes(`assets/${x.file}`), `${x.file} ships with the page`));
});
test('20. text fitting survives: words fitted at the current version, labels that match their pictures, edge labels that fit', async () => {
  PAGES.forEach(v => v.plan.scenes.forEach(sc => assert.equal(sc.text.fit, LOOK.TEXT_FIT, `${v.id}/${v.seed} ${sc.id}`)));
  const pv = PLAIN.find(x => x.id === 'editorial' && x.seed === '1');
  const out = await AI.review(pv.plan, inputOf(pv), { limits: AI.limits({}), call: model(firstOffered).call });
  assert.ok(out.meta.fixed.length); out.plan.scenes.forEach(sc => assert.equal(sc.text.fit, LOOK.TEXT_FIT, sc.id));
  // a recomposed scene never keeps a label written for a picture it no longer shows (the beverage payoff once read
  // "people sharing cola at a summer festival" over the can)
  const v = PAGES.find(x => x.id === 'beverage' && x.seed === '1'); const sc = v.plan.scenes[v.plan.scenes.length - 1];
  assert.ok(v.plan.review.fixed.some(x => x.scene === sc.id), 'the payoff was recomposed'); assert.ok(!/festival/i.test(sc.text.kicker || ''), `label: ${sc.text.kicker}`);
  // a label runs up the edge only beside words tall enough to hold it (a long sideways label is cut off -- measured)
  PAGES.forEach(p => p.plan.scenes.forEach(x => { if (x.text.treatment === 'vertical') assert.ok(x.text.kicker.length <= 10 && (x.text.heading.length >= 16 || ['display', 'large'].includes(x.text.size)), `${p.id}/${p.seed} ${x.id}: "${x.text.kicker}" beside "${x.text.heading}"`); }));
  const lab = { text: { kicker: 'People sharing cola at a summer festival' }, layers: [{ kind: 'image', asset: 'c-can' }] }; const byId = byIdOf(SUBJECTS.beverage);
  const ctx = { byId, rootOf: id => LOOK.root(byId.get(id), byId).id };
  assert.equal(DIR.staleLabel(lab, { asset: 'crowd', subject: 'People sharing cola at a summer festival' }, ctx), true);
  assert.equal(DIR.staleLabel(Object.assign({}, lab, { layers: [{ kind: 'image', asset: 'crowd' }] }), { asset: 'crowd', subject: 'People sharing cola at a summer festival' }, ctx), false);
  assert.equal(DIR.staleLabel({ text: { kicker: 'All about' }, layers: [] }, { asset: 'crowd', subject: 'People sharing cola at a summer festival' }, ctx), false, 'a label of its own is kept');
});

// ================================================================ 21. the server: one review call, never more, mocked only
const HF_KEY = 'hfkeyid_test_0001:hfsecret_test_never_shown';
async function withServer(env, fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sr-direction-'));
  const e = Object.assign({ SITEREMADE_BACKEND: 'local', SITEREMADE_DB_PATH: path.join(dir, 'app.db'), SITEREMADE_ASSET_STORE_DIR: path.join(dir, 'assets'), SITEREMADE_EXPORTS_DIR: path.join(dir, 'exports'), SITEREMADE_PREMIUM_LOG_DIR: path.join(dir, 'p'), ANTHROPIC_API_KEY: 'test-only', OPENAI_API_KEY: '', STRIPE_SECRET_KEY: '', SITEREMADE_TRIAL_CREDITS: '30', MOCK_CALL_LOG: path.join(dir, 'calls.log'), NODE_ENV: 'test', HIGGSFIELD_API_KEY: HF_KEY }, env);
  const s = await startServer(e); const call = client(s.port);
  await call('POST', '/api/auth/signup', { email: `dir-${process.pid}-${Date.now()}@example.com`, password: 'correct-horse-battery-staple' });
  try { await fn({ call, calls: () => providerCalls(e.MOCK_CALL_LOG) }); } finally { await s.stop(); fs.rmSync(dir, { recursive: true, force: true }); }
}
const BRIEF = 'A launch website for an imaginary running sneaker called Zorbo, light and fast';
const measured = { id: 'u1', origin: 'upload', title: 'our sneaker', mime: 'image/png', assess: { width: 1280, height: 720, aspect: 1.778, orientation: 'landscape', subject: null, colours: ['#c0502e'], luminance: 110, background: { colour: '#333333', uniformity: 0.3 } } };
async function generate(call) {
  const ask = await call('POST', '/api/creative/research', { brief: BRIEF }); const r = ask.body.needsConfirmation ? await call('POST', '/api/creative/research', { brief: BRIEF, quoteId: ask.body.quote.id }) : ask;
  return call('POST', '/api/creative/plan', { brief: BRIEF, jobId: r.body.jobId, understanding: r.body.understanding, facts: [], supplied: {}, assets: [measured], thumbnails: [], mainAsset: 'u1' });
}
test('21. server: exactly one creative-director review call per generation (mocked), costed and ledgered; a failure keeps the page; off means none', async () => {
  await withServer({}, async ({ call, calls }) => {
    const before = calls().length; const p = await generate(call);
    assert.equal(p.body.ok, true, JSON.stringify(p.body).slice(0, 300));
    const tools = calls().slice(before).filter(c => c.provider === 'anthropic').map(c => c.tool);
    assert.equal(tools.filter(t => t === 'submit_creative_review').length, 1, `one review: ${tools}`);
    const m = p.body.meta.review; assert.equal(m.review, 'mock'); assert.equal(m.calls, 1); assert.ok(m.usd > 0 && m.usd < 0.05, `${m.usd}`);
    assert.ok(p.body.meta.usdEstimated >= m.usd + ((p.body.meta.continuity && p.body.meta.continuity.usd) || 0) - 1e-9, 'its cost is part of what the direction recorded');
    assert.ok(p.body.plan.idea && p.body.plan.idea.v === DIR.VERSION); assert.ok(p.body.plan.review && p.body.plan.review.v === DIR.DIRECTOR_VERSION);
    assert.equal(p.body.plan.review.source, 'ai+rules');
    // the whole generation's model calls, bounded: no image, video or 3D provider is ever asked for by direction
    calls().slice(before).forEach(c => assert.equal(c.provider, 'anthropic', JSON.stringify(c)));
    assert.ok(tools.length <= 8, `${tools.length} model calls: ${tools}`);
  });
  await withServer({ MOCK_REVIEW: 'error' }, async ({ call, calls }) => {
    const p = await generate(call); assert.equal(p.body.ok, true);
    assert.equal(p.body.meta.review.review, 'fallback'); assert.equal(p.body.plan.review.source, 'rules', 'the rules\' review stands');
    assert.equal(calls().filter(c => c.tool === 'submit_creative_review').length, 1, 'never retried');
  });
  await withServer({ CREATIVE_DIRECTOR_REVIEW: 'off' }, async ({ call, calls }) => {
    const p = await generate(call); assert.equal(p.body.ok, true); assert.equal(p.body.meta.review.review, 'off');
    assert.equal(calls().filter(c => c.tool === 'submit_creative_review').length, 0);
    assert.ok(p.body.plan.review && p.body.plan.review.source === 'rules', 'the rules still judge the page');
  });
});
