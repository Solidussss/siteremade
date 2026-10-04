'use strict';
// CREATIVE QUALITY FLOOR -- the faults a stress run across unrelated subjects kept finding on finished pages, closed where
// they are made: a scene built to show a picture left with none (the image ledger took them all), an ending that is a
// photograph set small in an empty field, a picture's caption cut off mid-word as a label, an empty accent block standing
// where a picture should be, a colour wash still over a scene that has come to rest, the words of a mask stage half-way to
// the camera (and a hidden heading showing through the same window), an owner's upload dropped by a later recomposition,
// and the credits sharing the closing scene's screen.
const test = require('node:test');
const assert = require('node:assert/strict');
const DIR = require('../lib/creative/direction');
const D2 = require('../lib/creative/director2');
const AI = require('../lib/creative/ai');
const VC = require('../lib/creative/visual-capture');
const VR = require('../lib/creative/visual-review');
const { validatePlan2 } = require('../lib/creative/validate2');
const { renderCreative2 } = require('../lib/creative/render2');
const { SUBJECTS, IDS } = require('./helpers/creative-subjects');
const FX = require('./helpers/visual-fixtures');

function make(id, seed) {
  const s = SUBJECTS[id];
  const { plan, recipe } = D2.direct({ understanding: s.understanding, research: { page: null, facts: s.facts }, assets: s.assets, supplied: { facts: [], memories: [] }, seed, mainAsset: s.mainAsset });
  const v = validatePlan2(plan, { assets: s.assets, facts: s.facts, understanding: s.understanding, art: recipe, mainAsset: s.mainAsset });
  return Object.assign(v, { s, id, seed });
}
const PAGES = IDS.flatMap(id => ['1', '2', '3', '4'].map(seed => make(id, seed)));
const byIdOf = s => new Map(s.assets.map(a => [a.id, a]));
const inputOf = v => ({ assets: v.s.assets, facts: v.s.facts, understandingLegacy: v.s.understanding, mainAsset: v.s.mainAsset });
const img = (id, asset, box, extra) => Object.assign({ id, kind: 'image', role: 'focal', asset, box: { d: box, m: box } }, extra || {});

// ================================================================ 1. the page critique sees the faults
test('Q1. the critique finds a scene left without its picture and a photograph set small as the ending -- and repairs each the right way', () => {
  const byId = new Map([['a', { id: 'a', caps: { moveFreely: false } }], ['b', { id: 'b', caps: { moveFreely: false } }], ['cut', { id: 'cut', cutout: true, caps: { moveFreely: true } }]]);
  const ctx = { byId, ledger: true, concept: { genre: 'product', intensity: 'expressive' }, mode: 'expressive' };
  const scenes = [
    { id: 'opening', layout: 'editorial-hero', layers: [img('h', 'a', [0, 0, 100, 100])], text: {} },
    { id: 's2', layout: 'image', layers: [img('x', 'b', [4, 4, 92, 74])], text: {} },
    // (a floating canvas whose pictures are all shown earlier: the ledger takes them away)
    { id: 's3', layout: 'canvas', composition: 'floating-canvas', layers: [img('y', 'a', [10, 10, 30, 30]), img('z', 'b', [60, 50, 30, 30], { role: 'support' })], text: {} },
    { id: 's4', layout: 'text', layers: [], text: {} },
    { id: 's5', layout: 'shrine', layers: [img('w', 'b', [35, 42, 30, 56], { callback: true })], text: {} },
  ];
  const sv = DIR.survey(scenes, ctx);
  assert.equal(sv[2].bare, true, 'the emptied canvas is bare'); assert.equal(sv[2].full, false, 'an empty field is never a full-screen event');
  assert.equal(sv[3].bare, false, 'a scene of words is not bare: it was made of words');
  const found = DIR.critique(scenes, ctx);
  assert.ok(found.some(f => f.code === 'bare' && f.at === 2), JSON.stringify(found));
  assert.ok(found.some(f => f.code === 'weak-payoff' && f.at === 4), 'a framed photograph set small as the ending is weak');
  // (a middle scene left bare becomes words set large; an empty ending becomes the return of the hero first)
  assert.ok(DIR.candidates({ code: 'bare', at: 2 }, scenes, ctx).every(c => ['type-takeover', 'giant-type', 'poster', 'campaign', 'text'].includes(c.composition || c.layout)));
  const end = DIR.candidates({ code: 'bare', at: 4 }, scenes, ctx); assert.ok(end[0].callback, 'the closing returns to the hero first');
  // the same shrine with the subject standing free (a cut-out) is an ending
  const free = scenes.slice(0, 4).concat([Object.assign({}, scenes[4], { layers: [img('w', 'cut', [35, 42, 30, 56], { callback: true })] })]);
  assert.ok(!DIR.critique(free, ctx).some(f => f.code === 'weak-payoff'));
  assert.ok(DIR.FINDINGS.includes('bare'), 'a saved review keeps the finding');
});

// ================================================================ 2. finished pages, many subjects
test('Q2. finished pages: no picture-led scene without a picture, no empty accent block, no caption cut off as a label, words alone set giant', () => {
  PAGES.forEach(v => {
    const tag = `${v.id}/${v.seed}`; const byId = byIdOf(v.s); assert.deepEqual(v.errors, [], tag);
    const sv = DIR.survey(v.plan.scenes, AI.reviewContext(v.plan, byId, inputOf(v)));
    assert.deepEqual(sv.filter(x => x.bare).map(x => x.id), [], `${tag}: ${v.plan.scenes.map(s => s.composition || s.layout).join(' > ')}`);
    v.plan.scenes.forEach(s => {
      const block = s.layers.some(L => L.kind === 'shape' && L.shape && L.shape.form === 'block');
      if (block) assert.ok(s.layers.some(L => L.kind === 'image' && L.role === 'focal'), `${tag} ${s.id}: an accent block only behind a picture`);
      // (words alone are a statement across the screen: giant, a whole screen tall -- never a small line in an empty field)
      const t = s.text || {};
      if (v.plan.look && s.layout === 'text' && !s.layers.some(L => L.kind === 'image') && t.heading && t.heading.length <= 64 && !(t.items || []).length && (t.body || '').length <= 220) { assert.equal(t.giant, true, `${tag} ${s.id}: words alone set giant`); assert.equal(s.height, 'screen'); }
      const k = s.text && s.text.kicker;
      if (k) v.s.assets.forEach(a => { const d = a.curation && a.curation.depicts; if (d && d.length > k.length) assert.ok(!d.toLowerCase().startsWith(k.toLowerCase()), `${tag} ${s.id}: "${k}" is "${d}" cut short`); });
    });
  });
  // (a label cut to the limit ends on a whole word)
  const v = PAGES[0]; const p = JSON.parse(JSON.stringify(v.plan)); p.scenes[1].text.kicker = 'A classic glass cola bottle standing on a wet marble counter beside a bucket of ice';
  const k = validatePlan2(p, { assets: v.s.assets, facts: v.s.facts, understanding: v.s.understanding, mode: 'safety' }).plan.scenes[1].text.kicker;
  assert.ok(k.length <= 70 && 'A classic glass cola bottle standing on a wet marble counter beside a bucket of ice'.split(' ').includes(k.split(' ').pop()), k);
});

// ================================================================ 3. a recomposition never drops an owner's upload
test('Q3. a page-level recomposition that would take an uploaded picture off the page is refused -- the same one on found pictures is not', () => {
  // (beverage, seed 2: a scene of two found pictures; a split transform shows one of them)
  const v = PAGES.find(x => x.id === 'beverage' && x.seed === '2'); const i = 2;
  assert.ok(v.plan.scenes[i].layers.filter(L => L.kind === 'image').length >= 2);
  const run = up => { const assets = v.s.assets.map(a => Object.assign({}, a, up ? { origin: 'upload' } : {})); const vctx = Object.assign(AI.planContext(Object.assign(inputOf(v), { assets }), {}), { mode: 'safety' }); return AI.recompose(v.plan, [{ scene: i, composition: 'split-transform' }], vctx); };
  assert.equal(run(false).ok, true, 'found pictures: the recomposition may let one go');
  assert.equal(run(true).ok, false, 'the uploads of the owner: never taken off the page');
});

// ================================================================ 3b. one page, one shoot
test('Q3b. the pictures of a new page are graded as one shoot: bounded, never muting a picture, saved and reopened exactly', () => {
  const LOOK = require('../lib/creative/look');
  // (real measures: a dark road, a bright can -- each pulled part of the way, within bounds; colour strength only lifted)
  const pics = [{ id: 'dark', assess: { luminance: 40, colours: ['#2a2018', '#3b2a1c', '#55402a'] } }, { id: 'bright', assess: { luminance: 200, colours: ['#e8a020', '#f0c040', '#ffffff'] } }, { id: 'mid', assess: { luminance: 120, colours: ['#8090a0', '#506070', '#203040'] } }];
  const g = LOOK.grade(pics); assert.ok(g && /^#[0-9a-f]{6}$/.test(g.tint));
  assert.ok(g.per.dark[0] > 1 && g.per.bright[0] < 1, 'brightness pulled toward the middle');
  Object.values(g.per).forEach(([b, s]) => { assert.ok(b >= LOOK.GRADE.b[0] && b <= LOOK.GRADE.b[1]); assert.ok(s >= LOOK.GRADE.s[0] && s <= LOOK.GRADE.s[1] && LOOK.GRADE.s[0] >= 0.95, 'never muted'); });
  assert.equal(LOOK.grade(pics.slice(0, 1)), null, 'one picture: nothing to make one');
  PAGES.forEach(v => {
    const tag = `${v.id}/${v.seed}`; if (!v.plan.look) return;
    const shown = new Set(v.plan.scenes.flatMap(s => s.layers.filter(L => L.kind === 'image').map(L => L.asset)));
    if (v.plan.look.grade) assert.ok(Object.keys(v.plan.look.grade.per).every(id => shown.has(id) || (v.plan.actor && v.plan.actor.asset === id)), `${tag}: only pictures the page shows`);
    const r = validatePlan2(JSON.parse(JSON.stringify(v.plan)), { assets: v.s.assets, facts: v.s.facts, understanding: v.s.understanding, mode: 'safety' });
    assert.equal(JSON.stringify(r.plan.look), JSON.stringify(v.plan.look), `${tag}: the grade reopens exactly`);
    // (a type takeover with nothing behind it is the giant statement itself, never a label beside an echo)
    v.plan.scenes.forEach(s => { if (s.composition === 'type-takeover' && !s.layers.some(L => L.kind === 'image') && (s.text.heading || '').length <= 64 && !(s.text.items || []).length && (s.text.body || '').length <= 220) { assert.equal(s.text.giant, true, `${tag} ${s.id}`); assert.equal(s.text.role, 'giant'); } });
  });
  const v = PAGES.find(x => x.plan.look && x.plan.look.grade); assert.ok(v, 'pages are graded');
  const h = renderCreative2(v.plan, v.s.assets, { mode: 'export', src: a => `${a.id}.png` });
  assert.match(h, /data-grade="(tint|tone)" style="--gf:brightness\([\d.]+\) saturate\([\d.]+\) contrast\([\d.]+\)"/);
  assert.match(h, /html\[data-look\] \.ly-art\[data-grade="tint"\]::after\{content:"";position:absolute;inset:0;background:var\(--gtint\);mix-blend-mode:soft-light/);
  // (a look saved before the grade renders exactly as it did: no grade, no grading rules)
  const old = JSON.parse(JSON.stringify(v.plan)); delete old.look.grade; const ho = renderCreative2(old, v.s.assets, { mode: 'export', src: a => `${a.id}.png` });
  assert.doesNotMatch(ho, /data-grade=|--gtint/);
});

// ================================================================ 4. the renderer
test('Q4. the renderer: a wash ends by the arrival, a mask stage rests where it reads, each swapped heading its own window, the ending owns its screen', () => {
  const v = PAGES[0]; const html = (plan, extra) => renderCreative2(plan, v.s.assets, Object.assign({ mode: 'export', src: a => `${a.id}.png` }, extra || {}));
  const h = html(v.plan);
  assert.match(h, /e0=sc\._top\+\(S\.carry\?S\.end:Math\.min\(0,S\.end\)\)\*vh/, 'a wash or a panel never past the arrival');
  assert.match(h, /if\(s\._ct\)compFrame\(s,s\.hasAttribute\('data-pin'\)\?p:unheld\(s,p,vh\),vw\)/, 'a composition that is not held rests where the scene fills the screen');
  assert.match(h, /\.sc\[data-comp="mask-stage"\] \.sc-text\[data-giant\] \.sc-heading \.hs>span\{background:var\(--mimg\)/);
  // (above the look's giant-statement size: a mask stage's words fit the screen at the size they rest at, on a phone too)
  assert.match(h, /html \.sc\[data-comp="mask-stage"\] \.sc-text\[data-giant\] \.sc-heading\[data-len\]\{font-size:min\(13vw,calc\(var\(--fit\) \* \.86 \/ var\(--lw\)\)\)\}/);
  assert.match(h, /@media \(max-width:720px\)\{html \.sc\[data-comp="mask-stage"\] \.sc-text\[data-giant\] \.sc-heading\[data-len\]\{font-size:min\(13vw,calc\(var\(--fit\) \* \.78 \/ var\(--lwm,var\(--lw\)\)\)\)/);
  // (held compositions stay held through the page's final check: their camera is their movement)
  const held = PAGES.flatMap(v => v.plan.scenes.filter(s => s.choreo === 'compose' && s.composition && require('../lib/creative/composition').SPEC[s.composition].hold));
  assert.ok(held.length && held.some(s => s.pin), 'held compositions keep their hold');
  assert.match(h, /html\[data-look\] \.sc-text\[data-giant\] \.sc-heading\[data-len\]\{font-size:min\(clamp\(4rem,15vw,17rem\)/, 'a giant statement is never capped as a long heading');
  assert.ok(v.plan.look); assert.match(h, /html\[data-look\] main>\.sc:last-of-type:not\(\[data-pin\]\) \.sc-pin\{min-height:100vh;min-height:100svh;justify-content:center\}/);
  const old = JSON.parse(JSON.stringify(v.plan)); delete old.look; assert.doesNotMatch(html(old), /main>\.sc:last-of-type/, 'a page saved before looks keeps its own ending');
});

// ================================================================ 5. in a real browser
const BROWSER = VC.findBrowser({ CREATIVE_VISUAL_BROWSER: process.env.CREATIVE_VISUAL_BROWSER || 'auto' });
test('Q5. in a browser: no colour wash over a scene at rest; a mask stage that is not held fits its words on the screen', { skip: !BROWSER && 'no browser' }, async () => {
  const br = await VC.launch(BROWSER);
  try {
    const at = async (plan, input, si, expr, view) => {
      const st = VR.site(plan, input, { pictures: FX.pictures }); const site = VC.writeSite(st.html, st.files);
      const pg = await br.page(view || { width: 1440, height: 900 });
      try { await pg.goto(site.url, 300); const top = await pg.evaluate(`(() => { const s = document.querySelectorAll('.sc')[${si}]; return s.getBoundingClientRect().top + scrollY; })()`); await pg.scrollTo(top); return await pg.evaluate(expr); } finally { await pg.close(); }
    };
    // a page saved before looks, with a colour takeover into scene 2: when scene 2 arrives the colour is gone
    const { plan, input } = FX.page('software', '1'); const old = JSON.parse(JSON.stringify(plan)); delete old.look; old.timeline.transitions[0].family = 'shape-takeover';
    const op = await at(old, input, old.timeline.transitions[0].at, `(() => { const e = document.querySelector('.cs-take'); return e ? +getComputedStyle(e).opacity : -1; })()`);
    assert.ok(op >= 0 && op < 0.05, `the wash is ${op} over a scene that has arrived`);
    // a mask stage that lost its hold: at rest its words are inside the screen
    const p2 = FX.page('automotive', '2'); const vctx = Object.assign(AI.planContext(p2.input, {}), { mode: 'safety' });
    const r = AI.applyRepair(p2.plan, { scene: 3, to: 'c:mask-stage' }, vctx); assert.ok(r.ok, 'a mask stage');
    const m = JSON.parse(JSON.stringify(r.plan)); Object.assign(m.scenes[3], { pin: false, height: 'screen' });
    const saved = validatePlan2(m, Object.assign({}, vctx, { mode: 'safety' })).plan; assert.equal(saved.scenes[3].composition, 'mask-stage'); assert.ok(!saved.scenes[3].pin);
    const box = await at(saved, p2.input, 3, `(() => { const h = document.querySelectorAll('.sc')[3].querySelector('.sc-heading .hs-main') || document.querySelectorAll('.sc')[3].querySelector('.sc-heading'); const g = document.createRange(); g.selectNodeContents(h); const q = [...g.getClientRects()].filter(x => x.width > 1); return { l: Math.min(...q.map(x => x.left)), r: Math.max(...q.map(x => x.right)), w: innerWidth }; })()`);
    assert.ok(box.l >= -2 && box.r <= box.w + 2, `the letters run from ${Math.round(box.l)} to ${Math.round(box.r)} on a ${box.w} screen`);
  } finally { await br.close(); }
});
