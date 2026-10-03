'use strict';
// THE VISUAL DIRECTOR (lib/creative/visual.js, visual-capture.js, visual-review.js): the finished page rendered in a real
// headless browser, measured, judged in ONE cheap vision call, and repaired only where the repair measurably helps. The
// browser tests use this machine's Chromium/Chrome/Edge (CREATIVE_VISUAL_BROWSER, else the usual places) and are skipped,
// saying so, where none exists. The model is always a fake or the mock server: nothing here reaches a paid provider.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const VIS = require('../lib/creative/visual');
const VC = require('../lib/creative/visual-capture');
const VR = require('../lib/creative/visual-review');
const AI = require('../lib/creative/ai');
const { validatePlan2 } = require('../lib/creative/validate2');
const FX = require('./helpers/visual-fixtures');
const { SUBJECTS } = require('./helpers/creative-subjects');
const { startServer, client, providerCalls } = require('./helpers/server-process');
const { mockPng } = require('./helpers/mock-image');

const BROWSER = VC.findBrowser({ CREATIVE_VISUAL_BROWSER: process.env.CREATIVE_VISUAL_BROWSER || 'auto' });
const NO_BROWSER = BROWSER ? false : 'no Chromium/Chrome/Edge on this machine (set CREATIVE_VISUAL_BROWSER) -- the visual director is then skipped, as in production';
let shared = null; const browser = async () => shared || (shared = await VC.launch(BROWSER));
test.after(async () => { if (shared) await shared.close(); });

const LIMITS = Object.assign(AI.limits({}), { visual: true });
const reopen = (plan, input) => validatePlan2(JSON.parse(JSON.stringify(plan)), { assets: input.assets, facts: input.facts, understanding: input.understandingLegacy, mode: 'safety' });
// the model, faked: it answers with what was measured -- the fixture's own problem first, each with the first repair offered
function model(pick) {
  const log = [];
  const call = async q => {
    log.push(q); if (pick instanceof Error) throw pick;
    const t = q.content.find(c => c.type === 'text' && c.text.startsWith('What was measured')).text; const head = JSON.parse(t.slice(t.indexOf('{')));
    return { model: 'mock-test', usage: { input_tokens: 3400, output_tokens: 160 }, input: typeof pick === 'function' ? pick(head) : pick };
  };
  return { call, log };
}
const measuredFirst = expect => head => {
  const want = expect ? head.measured.filter(m => expect.issue.includes(m.issue) && m.scene === expect.scene && m.view === expect.view) : [];
  return { verdict: head.measured.length ? 'almost' : 'strong', issues: want.concat(head.measured.filter(m => !want.includes(m))).filter(m => m.offered.length).slice(0, 6).map(m => ({ scene: m.scene, view: m.view, issue: m.issue, severity: m.severity, repair: m.offered[0] })) };
};
const runOn = async (f, m, extra) => AI.visualReview(f.plan, f.input, Object.assign({ limits: LIMITS, call: m.call, liveBrowser: await browser(), pictures: f.pictures, threeD: f.threeD, videoSrc: f.videoSrc }, extra || {}));

// ================================================================ 1. bounded vocabulary
test('1. the visual director answers in a fixed vocabulary: issues and repairs from closed lists, never CSS, HTML, code, copy or a plan', () => {
  const sch = VR.VISUAL_TOOL.input_schema.properties; const it = sch.issues.items.properties;
  assert.deepEqual(it.issue.enum, VIS.ISSUES); assert.deepEqual(it.repair.enum, VIS.REPAIRS); assert.deepEqual(it.view.enum, ['desktop', 'mobile']); assert.equal(sch.issues.maxItems, 6);
  assert.deepEqual(Object.keys(sch).sort(), ['issues', 'verdict']); assert.deepEqual(Object.keys(it).sort(), ['issue', 'repair', 'scene', 'severity', 'view']);
  assert.ok(!VIS.REPAIRS.includes('switch_to_actor_stage'), 'an actor is planned with the page, never bolted on');
  // every repair offered for an issue is one the system implements; type too large and abrupt seams are named, not repaired here
  Object.entries(VIS.FOR).forEach(([k, list]) => { assert.ok(VIS.ISSUES.includes(k)); list.forEach(r => assert.ok(VIS.REPAIRS.includes(r), r)); });
  assert.deepEqual(VIS.FOR.type_unreadable_oversized, []); assert.deepEqual(VIS.FOR.abrupt_transition, []);
  // phone problems take only repairs that act on the phone's own layout
  assert.ok(!VIS.PHONE.includes('move_copy_left') && !VIS.PHONE.includes('switch_to_full_bleed'));
  // one call, priced as a cheap vision model, bounded
  const b = AI.limits({}); assert.match(b.visualModel, /haiku/); assert.equal(b.visualMaxTokens, 600);
  assert.equal(AI.limits({ CREATIVE_VISUAL_REVIEW: 'off' }).visual, false);
});

// ================================================================ 2. what is measured, from pixels
test('2. contrast is read against what the words stand on: a giant word crossing a dark picture is lost there, however clear the rest', () => {
  // a 200x100 "screen without its words": light on the right, dark on the left
  const W = 200, H = 100; const data = new Uint8Array(W * H * 4); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const o = (y * W + x) * 4; const v = x < 60 ? 30 : 235; data[o] = data[o + 1] = data[o + 2] = v; data[o + 3] = 255; }
  const bare = { width: W, height: H, data };
  const dark = { k: 'heading', color: 'rgb(26, 22, 18)', px: 60, rect: [10, 20, 190, 80], lines: [[10, 20, 190, 80]] };
  const c = VIS.contrastOf(dark, bare, 1); assert.ok(c.low > 0.1 && c.low < 0.5, `low ${c.low}`); assert.equal(c.worst, 1, 'the letters over the dark part are lost');
  const light = VIS.contrastOf(Object.assign({}, dark, { rect: [80, 20, 190, 80], lines: [[80, 20, 190, 80]] }), bare, 1); assert.equal(light.low, 0); assert.equal(light.worst, 0);
  // dead space: a flat field with nothing on it, against one with a picture across it
  const m = { vw: 200, vh: 100, pics: [], words: [], video: [], model: [] };
  assert.ok(VIS.fieldOf({ width: W, height: H, data: new Uint8Array(W * H * 4).fill(200) }, m, 1).dead > 0.9);
  assert.ok(VIS.fieldOf(bare, Object.assign({}, m, { pics: [{ rect: [0, 0, 200, 100] }] }), 1).dead < 0.05);
});

// ================================================================ 3. genre-aware judgement
test('3. the opening is judged for its genre: a luxury page may breathe, a car must command its opening, editorial type may lead', () => {
  const scene = (subject, extra) => Object.assign({ i: 0, layout: 'image', subject, picture: subject * 1.5, pictures: 1, heading: { px: 0.06, share: 0.05, over: 0, off: false }, contrast: {}, dead: 0.3, balance: { cx: 0.5, side: 0.4 }, focal: 1, focalTop: [subject], video: null, model: null, textOff: 0, cropOver: 0, impact: 0.6, actor: false }, extra || {});
  const page = (s0, k) => VIS.detect({ desktop: [scene(s0), scene(0.4), scene(0.4)], mobile: [scene(s0), scene(0.4), scene(0.4)] }, { concept: k });
  const has = (f, issue) => f.some(x => x.scene === 0 && x.issue === issue);
  assert.ok(!has(page(0.09, { genre: 'luxury', intensity: 'restrained' }), 'hero_subject_too_small') && !has(page(0.09, { genre: 'luxury', intensity: 'restrained' }), 'hero_lacks_dominance'), 'luxury at 9%: intentional space');
  assert.ok(page(0.09, { genre: 'automotive', intensity: 'aggressive' }).some(x => x.scene === 0 && /hero_/.test(x.issue)), 'a car at 9% is lost');
  const ed = VIS.detect({ desktop: [scene(0.03, { heading: { px: 0.2, share: 0.2, over: 0, off: false } }), scene(0.4), scene(0.4)], mobile: [] }, { concept: { genre: 'editorial', intensity: 'restrained' } });
  assert.ok(!ed.some(x => /hero_|no_focal/.test(x.issue)), 'editorial: the type leads');
  // desktop and mobile are separate questions
  const mob = VIS.detect({ desktop: [scene(0.4), scene(0.4), scene(0.4)], mobile: [scene(0.01), scene(0.4), scene(0.4)] }, { concept: { genre: 'product', intensity: 'expressive' } });
  assert.ok(mob.some(x => x.view === 'mobile' && x.issue === 'mobile_loses_impact')); assert.ok(!mob.some(x => x.view === 'desktop' && /hero_/.test(x.issue)));
  // an ending quieter than the scene before it
  const end = VIS.detect({ desktop: [scene(0.4), scene(0.4, { impact: 0.9 }), scene(0.05, { impact: 0.3 })], mobile: [] }, { concept: { genre: 'product' } });
  assert.ok(end.some(x => x.scene === 2 && ['payoff_weaker_than_previous', 'weak_final_payoff'].includes(x.issue)));
});

// ================================================================ 4. versioning: old pages untouched
test('4. versioning: pages saved before the visual director reopen exactly as they were; a plan never brings its own visual record', () => {
  const LEGACY = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'creative', 'legacy-pre-direction.json'), 'utf8'));
  Object.entries(LEGACY).forEach(([id, plan]) => { const s = SUBJECTS[id]; const v = reopen(plan, { assets: s.assets, facts: s.facts, understandingLegacy: s.understanding }); assert.equal(JSON.stringify(v.plan), JSON.stringify(plan), id); assert.equal(v.plan.visualReview, undefined); });
  // a new plan (the director's own output) cannot carry a visual review: only the visual stage writes one
  const { plan, input } = FX.page('editorial', '2'); assert.equal(plan.visualReview, undefined);
  const forged = validatePlan2(Object.assign(JSON.parse(JSON.stringify(plan)), { visualReview: { v: 1, kept: [{ scene: 'opening', issue: 'weak_hierarchy', repair: 'simplify_scene' }] } }), { assets: input.assets, facts: input.facts, understanding: input.understandingLegacy, mainAsset: input.mainAsset });
  assert.equal(forged.plan.visualReview, undefined);
  // a stored record is data: clamped to the vocabulary and the version
  const n = VIS.normalise({ v: 9, source: 'magic', verdict: 'gorgeous', found: [{ scene: 'opening', issue: 'too_purple' }, { scene: 'opening', issue: 'weak_text_contrast', view: 'phone', severity: 'extreme', repair: 'add_sparkles' }] });
  assert.equal(n.v, VIS.VERSION); assert.equal(n.source, 'measure'); assert.equal(n.verdict, null); assert.deepEqual(n.found, [{ scene: 'opening', issue: 'weak_text_contrast', view: 'desktop', severity: 'medium' }]);
});

// ================================================================ 5. it never makes generation fragile
test('5. off, no browser, over budget, a browser that will not start: no call, and the page is returned untouched', async () => {
  const { plan, input } = FX.page('editorial', '2');
  for (const [deps, state] of [[{ limits: Object.assign({}, LIMITS, { visual: false }) }, 'off'], [{ limits: LIMITS, browser: null }, 'unavailable'], [{ limits: LIMITS, browser: 'x', ceilingUsd: 0 }, 'skipped'], [{ limits: LIMITS, browser: path.join(os.tmpdir(), 'no-such-browser.exe') }, 'fallback']]) {
    const m = model({ verdict: 'weak', issues: [] });
    const out = await AI.visualReview(plan, input, Object.assign({ call: m.call, pictures: FX.pictures }, deps));
    assert.equal(out.plan, plan, state); assert.equal(out.meta.visual, state); assert.equal(m.log.length, 0, `${state}: no model call`); assert.equal(out.meta.usd, 0);
  }
  // the page as the browser sees it: every picture its own file (a collision would draw one picture in another's place)
  const st = VR.site(plan, input, { pictures: FX.pictures }); const imgs = [...st.html.matchAll(/class="ly-img" data-asset="([^"]+)" src="([^"]+)"/g)];
  assert.ok(imgs.length >= 3); const byFile = new Map(); imgs.forEach(([, a, f]) => { assert.ok(st.files[f], f); assert.ok(!byFile.has(f) || byFile.get(f) === a, `${f} is both ${byFile.get(f)} and ${a}`); byFile.set(f, a); });
  // (the bound: one call of at most ~8k input -- two sheets and the measures of up to twelve scenes -- and 600 output tokens on the cheap model)
  assert.ok((8000 * LIMITS.prices.cheap.input + 600 * LIMITS.prices.cheap.output) / 1e6 <= 0.012);
});

// ================================================================ 6..14. the fixtures, in a real browser
const fixtures = {}; const fx = name => fixtures[name] || (fixtures[name] = FX.fixture(name));
FX.NAMES.forEach((name, k) => {
  test(`${6 + k}. fixture ${name}: the rendered page's failure is seen, a repair is chosen, and only a measured improvement is kept`, { skip: NO_BROWSER }, async () => {
    const f = fx(name); const m = model(measuredFirst(f.expect)); const out = await runOn(f, m);
    assert.equal(m.log.length, 1, 'one call'); const q = m.log[0];
    assert.equal(q.content.filter(c => c.type === 'image').length, 2, 'two contact sheets: desktop and phone'); assert.equal(q.tool.name, 'submit_creative_visual_review');
    const head = JSON.parse(q.content.find(c => c.type === 'text' && c.text.startsWith('What was measured')).text.replace(/^[^{]*/, ''));
    assert.ok(head.scenes.every(x => x.options && Array.isArray(x.options.desktop) && Array.isArray(x.options.mobile)));
    assert.equal(out.meta.visual, 'mock'); assert.equal(out.plan.visualReview.v, VIS.VERSION); assert.equal(out.plan.visualReview.source, 'ai+measure');
    if (!f.expect) {
      // the strong page: nothing serious is found, nothing is changed
      assert.ok(!out.meta.found.some(x => x.severity !== 'low'), JSON.stringify(out.meta.found)); assert.deepEqual(out.meta.kept, []);
      assert.deepEqual(out.plan.scenes, f.plan.scenes, 'untouched');
    } else {
      const sid = f.plan.scenes[f.expect.scene].id;
      assert.ok(out.meta.found.some(x => x.scene === sid && f.expect.issue.includes(x.issue) && x.view === f.expect.view), `seen: ${JSON.stringify(out.meta.found)}`);
      const kept = out.meta.kept.find(x => x.scene === sid && f.expect.issue.includes(x.issue));
      assert.ok(kept, `a repair for it was kept -- kept ${JSON.stringify(out.meta.kept)}, undone ${JSON.stringify(out.meta.reverted)}`);
      assert.ok(VIS.REPAIRS.includes(kept.repair)); assert.ok(out.plan.visualReview.after < out.plan.visualReview.before, 'the page has fewer visual faults');
      assert.ok(out.meta.kept.length <= VR.MAX_REPAIRS); assert.ok(out.meta.attempts <= 6);
    }
    // the reviewed page is a valid saved page that reopens exactly as stored
    const v = reopen(out.plan, f.input); assert.deepEqual(v.errors, []); assert.equal(JSON.stringify(v.plan), JSON.stringify(out.plan));
  });
});

// ================================================================ 15. the model is never trusted blindly
test('15. failures and bad answers leave the page as it was; a repair that does not help is undone', { skip: NO_BROWSER }, async () => {
  const f = fx('A');
  const err = model(new Error('overloaded')); const e = await runOn(f, err);
  assert.equal(e.plan, f.plan); assert.equal(e.meta.visual, 'fallback'); assert.equal(err.log.length, 1, 'never retried');
  // junk: unknown issues and repairs, a repair not offered for the scene -- ignored
  const junk = model({ verdict: 'gorgeous', issues: [{ scene: 0, view: 'desktop', issue: 'too_purple', severity: 'high', repair: 'add_sparkles' }, { scene: 0, view: 'desktop', issue: 'hero_subject_too_small', severity: 'high', repair: 'move_3d_back' }, { scene: 0, view: 'mobile', issue: 'mobile_loses_impact', severity: 'high', repair: 'switch_to_full_bleed' }] });
  const j = await runOn(f, junk); assert.deepEqual(j.plan.scenes, f.plan.scenes); assert.deepEqual(j.meta.kept, []); assert.ok(j.meta.errors.filter(x => /not offered/.test(x)).length >= 2, j.meta.errors.join('; '));
  // a repair that would make it worse: shrinking the subject the opening already lacks -- undone, the page as it was
  const worse = model({ verdict: 'weak', issues: [{ scene: 0, view: 'desktop', issue: 'hero_lacks_dominance', severity: 'medium', repair: 'decrease_subject_dominance' }] });
  const w = await runOn(fx('F'), worse);
  assert.ok(w.meta.reverted.some(x => x.repair === 'decrease_subject_dominance'), JSON.stringify(w.meta)); assert.deepEqual(w.plan.scenes, fx('F').plan.scenes);
});

// ================================================================ 16. the server: one call, mocked, ledgered; never fragile
const HF_KEY = 'hfkeyid_test_0001:hfsecret_test_never_shown';
async function withServer(env, fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sr-visual-'));
  const e = Object.assign({ SITEREMADE_BACKEND: 'local', SITEREMADE_DB_PATH: path.join(dir, 'app.db'), SITEREMADE_ASSET_STORE_DIR: path.join(dir, 'assets'), SITEREMADE_EXPORTS_DIR: path.join(dir, 'exports'), SITEREMADE_PREMIUM_LOG_DIR: path.join(dir, 'p'), ANTHROPIC_API_KEY: 'test-only', OPENAI_API_KEY: '', STRIPE_SECRET_KEY: '', SITEREMADE_TRIAL_CREDITS: '30', MOCK_CALL_LOG: path.join(dir, 'calls.log'), NODE_ENV: 'test', HIGGSFIELD_API_KEY: HF_KEY }, env);
  const s = await startServer(e); const call = client(s.port);
  await call('POST', '/api/auth/signup', { email: `vis-${process.pid}-${Date.now()}@example.com`, password: 'correct-horse-battery-staple' });
  try { await fn({ call, calls: () => providerCalls(e.MOCK_CALL_LOG) }); } finally { await s.stop(); fs.rmSync(dir, { recursive: true, force: true }); }
}
const BRIEF = 'A launch website for an imaginary running sneaker called Zorbo, light and fast';
const measured = { id: 'u1', origin: 'upload', title: 'our sneaker', mime: 'image/png', assess: { width: 1280, height: 720, aspect: 1.778, orientation: 'landscape', subject: [0.2, 0.2, 0.8, 0.8], colours: ['#c0502e'], luminance: 110, background: { colour: '#333333', uniformity: 0.3 } } };
async function generate(call) {
  const ask = await call('POST', '/api/creative/research', { brief: BRIEF }); const r = ask.body.needsConfirmation ? await call('POST', '/api/creative/research', { brief: BRIEF, quoteId: ask.body.quote.id }) : ask;
  return call('POST', '/api/creative/plan', { brief: BRIEF, jobId: r.body.jobId, understanding: r.body.understanding, facts: [], supplied: {}, assets: [measured], thumbnails: [{ id: 'u1', dataUrl: mockPng('sneaker', '16:9') }], mainAsset: 'u1' });
}
const visualCalls = calls => calls().filter(c => c.tool === 'submit_creative_visual_review');
test('16. server without a browser: the visual director is unavailable, no call is made, the page ships as reviewed', async () => {
  await withServer({ CREATIVE_VISUAL_BROWSER: '' }, async ({ call, calls }) => {
    const p = await generate(call); assert.equal(p.body.ok, true, JSON.stringify(p.body).slice(0, 300));
    assert.equal(p.body.meta.visual.visual, 'unavailable'); assert.equal(visualCalls(calls).length, 0); assert.equal(p.body.plan.visualReview, undefined);
  });
});
test('17. server with a browser: exactly one visual review call (mocked) with two sheets, costed and ledgered; off or failing: the page ships', { skip: NO_BROWSER }, async () => {
  await withServer({ CREATIVE_VISUAL_BROWSER: BROWSER }, async ({ call, calls }) => {
    const p = await generate(call); assert.equal(p.body.ok, true, JSON.stringify(p.body).slice(0, 300));
    const vc = visualCalls(calls); assert.equal(vc.length, 1, 'one call');
    const m = p.body.meta.visual; assert.equal(m.visual, 'mock'); assert.equal(m.calls, 1); assert.equal(m.screenshots, 2); assert.ok(m.usd > 0 && m.usd < 0.01, String(m.usd));
    assert.ok(p.body.meta.usdEstimated >= m.usd); assert.equal(p.body.plan.visualReview.v, VIS.VERSION);
    calls().forEach(c => assert.ok(['anthropic', 'higgsfield'].includes(c.provider), JSON.stringify(c)));
  });
  await withServer({ CREATIVE_VISUAL_BROWSER: BROWSER, MOCK_VISUAL: 'error' }, async ({ call, calls }) => {
    const p = await generate(call); assert.equal(p.body.ok, true); assert.equal(p.body.meta.visual.visual, 'fallback'); assert.equal(p.body.plan.visualReview, undefined); assert.equal(visualCalls(calls).length, 1, 'never retried');
  });
  await withServer({ CREATIVE_VISUAL_BROWSER: BROWSER, CREATIVE_VISUAL_REVIEW: 'off' }, async ({ call, calls }) => {
    const p = await generate(call); assert.equal(p.body.ok, true); assert.equal(p.body.meta.visual.visual, 'off'); assert.equal(visualCalls(calls).length, 0); assert.equal(p.body.plan.visualReview, undefined);
  });
});

// ================================================================ 18..24. the ending, and type over the heading (deterministic)
const ofIssue = (out, sid, issue) => out.meta.found.some(x => x.scene === sid && x.issue === issue);
test('18. a final product that is a speck after a text-only scene is caught as a weak ending (the old comparison stays silent), and repaired', { skip: NO_BROWSER }, async () => {
  const f = fx('PA'); const n = f.plan.scenes.length; const sid = f.plan.scenes[n - 1].id;
  assert.equal(f.plan.scenes[n - 2].layers.filter(L => L.kind === 'image').length, 0, 'the scene before the ending shows no picture');
  const out = await runOn(f, model(measuredFirst(f.expect)));
  assert.ok(ofIssue(out, sid, 'weak_final_payoff'), JSON.stringify(out.meta.found)); assert.ok(!ofIssue(out, sid, 'payoff_weaker_than_previous'), 'the previous-scene comparison alone would have missed it');
  const kept = out.meta.kept.find(x => x.scene === sid && x.issue === 'weak_final_payoff'); assert.ok(kept, JSON.stringify(out.meta));
  assert.ok(['increase_subject_dominance', 'strengthen_payoff', 'switch_to_full_bleed', 'simplify_scene'].includes(kept.repair));
  assert.equal(JSON.stringify(reopen(out.plan, f.input).plan), JSON.stringify(out.plan));
});
test('19. endings that are quiet on purpose are accepted: a restrained luxury close, an editorial page ending on its type', { skip: NO_BROWSER }, async () => {
  for (const name of ['PB', 'PC']) {
    const f = fx(name); const out = await runOn(f, model({ verdict: 'strong', issues: [] })); const sid = f.plan.scenes[f.plan.scenes.length - 1].id;
    f.absent.forEach(issue => assert.ok(!ofIssue(out, sid, issue), `${name}: ${issue} -- ${JSON.stringify(out.meta.found)}`));
  }
});
test('20. a ghost copy of the heading lying over it is caught and the secondary type removed; the heading stays', { skip: NO_BROWSER }, async () => {
  const f = fx('TD'); const sid = f.plan.scenes[1].id; const out = await runOn(f, model(measuredFirst(f.expect)));
  assert.ok(ofIssue(out, sid, 'competing_heading_overlap'), JSON.stringify(out.meta.found));
  const kept = out.meta.kept.find(x => x.scene === sid && x.issue === 'competing_heading_overlap'); assert.ok(kept, JSON.stringify(out.meta));
  const sc = out.plan.scenes[1]; assert.equal(sc.text.heading, f.plan.scenes[1].text.heading); assert.ok(!sc.layers.some(L => L.kind === 'word' && L.id === 'ghost'), 'the ghost is gone');
  assert.equal(JSON.stringify(reopen(out.plan, f.input).plan), JSON.stringify(out.plan));
});
test('21. intentional layered type is left alone: a word behind the product, a faint display word, an edge label, editorial display type', { skip: NO_BROWSER }, async () => {
  for (const name of ['TE', 'TF', 'TG', 'F']) {
    const f = fx(name); const out = await runOn(f, model({ verdict: 'strong', issues: [] }));
    assert.ok(!out.meta.found.some(x => x.issue === 'competing_heading_overlap'), `${name}: ${JSON.stringify(out.meta.found)}`); assert.deepEqual(out.plan.scenes, f.plan.scenes, `${name}: untouched`);
  }
});
test('22. a harmful repair for the ending is undone: shrinking a speck of a final product -- the page as it was', { skip: NO_BROWSER }, async () => {
  const f = fx('PA'); const n = f.plan.scenes.length;
  const out = await runOn(f, model({ verdict: 'weak', issues: [{ scene: n - 1, view: 'desktop', issue: 'weak_final_payoff', severity: 'high', repair: 'decrease_subject_dominance' }] }));
  assert.ok(out.meta.reverted.some(x => x.repair === 'decrease_subject_dominance'), JSON.stringify(out.meta)); assert.ok(!out.meta.kept.some(x => x.repair === 'decrease_subject_dominance'));
  assert.deepEqual(out.plan.scenes[n - 1], f.plan.scenes[n - 1]);
});
test('23. both new findings are in the closed vocabulary with bounded repairs, and stored records from before them still reopen', () => {
  ['weak_final_payoff', 'competing_heading_overlap'].forEach(k => { assert.ok(VIS.ISSUES.includes(k)); assert.ok(VIS.FOR[k].length >= 2); VIS.FOR[k].forEach(r => assert.ok(VIS.REPAIRS.includes(r))); });
  assert.deepEqual(VR.VISUAL_TOOL.input_schema.properties.issues.items.properties.issue.enum, VIS.ISSUES);
  // a record written before these codes existed is still a valid record, unchanged
  const old = { v: 1, source: 'ai+measure', verdict: 'almost', before: 6, after: 3, found: [{ scene: 'opening', issue: 'hero_lacks_dominance', view: 'desktop', severity: 'medium' }], kept: [{ scene: 'opening', issue: 'hero_lacks_dominance', view: 'desktop', severity: 'medium', repair: 'increase_subject_dominance' }], reverted: [] };
  assert.deepEqual(VIS.normalise(old), old);
  const LEGACY = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'creative', 'legacy-pre-direction.json'), 'utf8'));
  Object.entries(LEGACY).forEach(([id, plan]) => { const s = SUBJECTS[id]; assert.equal(JSON.stringify(reopen(plan, { assets: s.assets, facts: s.facts, understandingLegacy: s.understanding }).plan), JSON.stringify(plan), id); });
});
