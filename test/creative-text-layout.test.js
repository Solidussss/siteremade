'use strict';
// FIX TEXT LAYOUT (the Creative Website editor): the words are right, but the scene still sets them the way it set the
// words they replaced. The fix is the Creative typography the page already has -- never a second engine:
//   * a headline set in explicit lines (the staggered opening title of giant and poster typography) breaks where the
//     look's fitted headline breaks (LOOK.lines -- the same measure as LOOK.measure), never by its own word count;
//   * a scene's word decisions (giant type or a label, a word stack, spread letters, the narrow column, a caption, a panel
//     over the picture) are checked against the words it has NOW by the rules that made them (ARCH.fitWords) -- after
//     every manual edit and AI rewrite, and on demand with "Fix text layout" (free, no provider, a draft).
// The regression: "THE WORLD RAISES ONE GLASS" in the opening title stacked THE WORLD / RAISES ONE / GLASS.
// REAL PROVIDER SPEND: $0 (in-process: no provider at all; through the bridge: the test server's mocks).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const LOOK = require('../lib/creative/look');
const D2 = require('../lib/creative/director2');
const { validatePlan2 } = require('../lib/creative/validate2');
const { renderCreative2 } = require('../lib/creative/render2');
const editor = require('../lib/creative-editor');
const { ASSETS, UND, FACTS } = require('./helpers/brand-fixture');
const { startServer, client, providerCalls } = require('./helpers/server-process');
const S = require('./helpers/three-d-scenario');

const GLASS = 'THE WORLD RAISES ONE GLASS';
const LONG = 'Every summer the whole world raises one glass of Kolaro together';
const copy = x => JSON.parse(JSON.stringify(x));
// a cola brand page (test/helpers/brand-fixture.js), every heading first written as `first` (the words its scenes were composed for)
function page(seed, first) {
  const { plan, recipe } = D2.direct({ understanding: UND, research: { page: null, facts: FACTS }, assets: ASSETS, supplied: { facts: [], memories: [] }, seed, mainAsset: 'can' });
  if (first) plan.scenes.forEach(s => { if (s.text.heading) s.text.heading = first; });
  const v = validatePlan2(plan, { assets: ASSETS, facts: FACTS, understanding: UND, art: recipe, mainAsset: 'can' }); assert.deepEqual(v.errors, []); return v.plan;
}
const direction = plan => ({ mode: 'creative', creative: { plan: copy(plan), assets: ASSETS, understanding: UND, research: { facts: FACTS }, supplied: { facts: [], memories: [] } } });
// a page saved the way it was before this pass: new words, the old layout (a safety save, nothing re-fitted)
const staleSave = (plan, si, heading) => { const P = copy(plan); P.scenes[si].text.heading = heading; return validatePlan2(P, { assets: ASSETS, facts: FACTS, understanding: UND, mode: 'safety' }).plan; };
const html = P => renderCreative2(P, ASSETS, { mode: 'export', src: a => `${a.id}.png` });
// the opening title's explicit lines, as rendered
const titleLines = h => { const m = /<h1 class="sc-heading[^"]*"[^>]*data-stagger[^>]*style="--lw:(\d+)[^"]*">([\s\S]*?)<\/h1>/.exec(h); if (!m) return null;
  return { lw: +m[1], lines: [...m[2].matchAll(/<span class="ln">([\s\S]*?)<\/span>(?= |$)/g)].map(x => x[1].replace(/<[^>]+>/g, '').replace(/ /g, ' ').trim()) }; };
// the scene, without its words' layout -- what "Fix text layout" may never change
const editorTextOf = s => editor.textOf(s);
const withoutType = s => { const c = copy(s); delete c.text; return c; };
const STAGGER = ['1', '2', '3', '4', '5', '6'].map(seed => page(seed)).filter(P => P.art && ['giant', 'poster'].includes(P.art.typo));

// ================================================================ the regression
test('TL-1. THE WORLD RAISES ONE GLASS as the opening title: balanced lines from the look\'s own measure -- never THE WORLD / RAISES ONE / GLASS -- the same words, every line inside its column at any width', () => {
  assert.ok(STAGGER.length >= 3, 'pages whose opening title is set in staggered lines');
  // what the renderer used to do: its own word count, three lines for five words -- the last one a lone word
  const old = (() => { const w = GLASS.split(' '); const per = GLASS.length / 3; const lines = [[]]; let len = 0; w.forEach(x => { if (len > per * lines.length && lines.length < 3) lines.push([]); lines[lines.length - 1].push(x); len += x.length + 1; }); return lines.map(l => l.join(' ')); })();
  assert.deepEqual(old, ['THE WORLD', 'RAISES ONE', 'GLASS'], 'the bug, as it was');
  STAGGER.forEach(P0 => {
    const out = editor.applyEdit(direction(P0), { type: 'text', sceneId: P0.scenes[0].id, field: 'heading', value: GLASS });
    assert.equal(out.ok, true, out.message); const P = out.creative.plan;
    assert.equal(P.scenes[0].text.heading, GLASS, 'the exact words');
    const t = titleLines(html(P)); assert.ok(t, `${P.art.typo}: a staggered opening title`);
    assert.deepEqual(t.lines, LOOK.lines(GLASS).map(l => l.replace(/ /g, ' ')), 'broken where the fitted headline breaks');
    assert.deepEqual(t.lines, ['THE WORLD RAISES', 'ONE GLASS']);
    assert.equal(t.lines.join(' '), GLASS, 'every word, once, in order');
    assert.ok(t.lines.every(l => l.split(' ').length > 1), 'no line is one word alone');
    // (the size is fit / lw of the column: every line, with its step, is at most lw - 1 characters of this family wide --
    // inside its column on a desktop and on a phone, whose rule is the same fit capped by the screen width)
    const ty = P.look.type; const adv = ty.adv * (ty.case === 'upper' ? ty.upper : 1); const step = P.scenes[0].text.place && P.scenes[0].text.place.align === 'center' ? [0, 0] : [0, 0.9];
    t.lines.forEach((l, i) => assert.ok(l.length + step[i] / adv <= t.lw - 1, `"${l}" fits a measure of ${t.lw}`));
    assert.match(html(P), /\.sc-text\[data-size="display"\] \.sc-heading\{font-size:min\(14vw,calc\(var\(--fit\) \/ var\(--lw\)\)\)\}/, 'the phone sizes the title by the same fit');
  });
  // other headlines on a page with a look keep their held words (LOOK.keep) -- the same units
  assert.deepEqual(LOOK.lines('Out of the dark.'), ['Out of', 'the dark.']);
  assert.deepEqual(LOOK.lines('Pull up a chair'), ['Pull up', 'a chair'], 'an article holds to its word');
});

test('TL-2. Fix text layout on a scene still set for the words it had: a sentence left as giant type becomes the stage\'s label -- the same words, the same pictures, colour, composition and 3D; twice changes nothing', () => {
  const P0 = page('2', 'Ice cold Kolaro'); const si = P0.scenes.findIndex(s => s.composition === 'type-takeover' && s.text.giant);
  assert.ok(si >= 0, 'a giant type-takeover'); assert.equal(P0.scenes[si].text.act, 'word-stack', 'composed for three words: one a line');
  const stale = staleSave(P0, si, LONG); const st = stale.scenes[si];
  assert.equal(st.text.giant, true, 'the old save left the sentence as giant type'); assert.equal(st.text.act, 'word-stack', '...stacked one word a line');
  const d = direction(stale); d.creative.threeD = { assets: [{ id: 'td-0123456789abcdef', sourceAssetId: 'can' }], scenes: [{ id: 'td-x', assetId: 'td-0123456789abcdef', sectionId: stale.scenes[1].id, composition: 'orbit' }] };
  const out = editor.applyEdit(d, { type: 'text-layout', sceneId: st.id });
  assert.equal(out.ok, true, out.message); assert.ok(!out.unchanged); const s1 = out.creative.plan.scenes[si];
  assert.deepEqual(editor.textOf(s1), editor.textOf(st), 'not a word changed');
  assert.equal(s1.text.giant, undefined); assert.equal(s1.text.role, 'label'); assert.notEqual(s1.text.size, 'display'); assert.notEqual(s1.text.act, 'word-stack');
  assert.deepEqual(s1.text.place, { gc: [1, 5], v: 'bottom', align: 'left' }, 'the label\'s place on this stage');
  assert.ok(out.fitted.some(f => /label/.test(f)), out.fitted.join(' | '));
  // nothing but the words' layout: the scene's pictures, layers, colour, composition, the other scenes, the look, the 3D
  assert.deepEqual(withoutType(s1), withoutType(st));
  out.creative.plan.scenes.forEach((s, i) => { if (i !== si) assert.deepEqual(s, stale.scenes[i]); });
  assert.deepEqual(out.creative.plan.look, stale.look); assert.deepEqual(out.creative.plan.palette, stale.palette);
  assert.deepEqual(out.creative.threeD, d.creative.threeD); assert.deepEqual(out.creative.assets, d.creative.assets);
  // twice: already fits -- nothing to save
  const again = editor.applyEdit({ mode: 'creative', creative: out.creative }, { type: 'text-layout', sceneId: st.id });
  assert.equal(again.ok, true); assert.equal(again.unchanged, true); assert.match(again.summary, /already fit/);
  // and a scene whose words already fit is left exactly as it is, on every page
  ['1', '3', '5'].forEach(seed => { const P = page(seed); P.scenes.forEach(s => { if (!s.text.heading) return; const r = editor.applyEdit(direction(P), { type: 'text-layout', sceneId: s.id }); assert.equal(r.ok, true, r.message); assert.equal(r.unchanged, true, `${seed}/${s.id}: ${(r.fitted || []).join(' | ')}`); }); });
});

test('TL-3. a manual text edit re-fits its scene by itself: the new words never inherit a layout made for the old ones -- and the body copy stays whole and readable', () => {
  const P0 = page('3', 'Ice cold Kolaro'); const si = P0.scenes.findIndex(s => s.composition === 'type-takeover' && s.text.giant);
  assert.ok(si >= 0);
  const out = editor.applyEdit(direction(P0), { type: 'text', sceneId: P0.scenes[si].id, field: 'heading', value: LONG });
  assert.equal(out.ok, true, out.message); const s1 = out.creative.plan.scenes[si];
  assert.equal(s1.text.heading, LONG); assert.equal(s1.text.giant, undefined, 'a sentence is not left as giant type'); assert.notEqual(s1.text.act, 'word-stack');
  assert.ok(out.fitted.length, 'the edit says what it re-set');
  assert.deepEqual(withoutType(s1), withoutType(P0.scenes[si]), 'its pictures and colour untouched');
  // a short heading in the same scene keeps its giant type (nothing is changed that the words still suit)
  const short = editor.applyEdit(direction(P0), { type: 'text', sceneId: P0.scenes[si].id, field: 'heading', value: 'Pure cold' });
  assert.equal(short.creative.plan.scenes[si].text.giant, true);
  // body copy: the owner's paragraph stays whole, in the page's reading size, revealed (never cut, never shrunk)
  const bi = P0.scenes.findIndex(s => s.text.heading && !s.text.giant); const body = 'Kolaro is poured cold in every corner of the world, and every summer people raise a glass of it together.';
  const b = editor.applyEdit(direction(P0), { type: 'text', sceneId: P0.scenes[bi].id, field: 'body', value: body });
  assert.equal(b.ok, true, b.message); assert.equal(b.creative.plan.scenes[bi].text.body, body);
  assert.ok(html(b.creative.plan).includes(body), 'the whole paragraph is on the page');
  assert.ok(['display', 'large', 'medium'].includes(b.creative.plan.scenes[bi].text.size), 'its scene\'s words stay at a reading size');
  // the number rule: only a line with a digit is recorded as an owner's own detail
  const d = direction(P0); const n = editor.applyEdit(d, { type: 'text', sceneId: P0.scenes[bi].id, field: 'heading', value: 'Poured daily' });
  assert.deepEqual(n.creative.supplied.facts, [], 'no digit, no owner fact');
});

// ================================================================ through the bridge
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'sr-text-layout-'));
let shared = null;
async function world() {
  if (shared) return shared;
  const env = S.threeDEnv(fs.mkdtempSync(path.join(TMP, 'w-')), { SITEREMADE_TRIAL_CREDITS: '200', MOCK_CREATIVE_REVISE: 'words', SITEREMADE_RATE_LIMIT_APP_BRIDGE_ACCOUNT_MAX: '100000' });
  const srv = await startServer(env); const sc = await S.buildThreeDScenario({ port: srv.port, env });
  const call = client(srv.port); await call('POST', '/api/identity/supabase/session', { supabaseAccessToken: 'test-access-token-owner' });
  const as = token => async (method, url, body) => { const r = await fetch(`http://127.0.0.1:${srv.port}${url}`, { method, headers: Object.assign({ authorization: `Bearer ${token}` }, body ? { 'content-type': 'application/json' } : {}), body: body ? JSON.stringify(body) : undefined }); const t = r.headers.get('content-type') || ''; const buf = Buffer.from(await r.arrayBuffer()); return { status: r.status, body: /json/.test(t) ? JSON.parse(buf.toString('utf8')) : null, text: buf.toString('utf8') }; };
  shared = { srv, env, sc, call, owner: as('test-access-token-owner'), other: as('test-access-token-other'), projectId: sc.projectId };
  return shared;
}
test.after(async () => { if (shared) await shared.srv.stop(); });
const planOf = async w => (await w.call('GET', `/api/projects/${w.projectId}`)).body.project.directionsState.directions[0].creative.plan;
const credits = async w => (await w.call('GET', '/api/credits')).body.credits.remaining;
// (the paid providers -- the sign-in check of each request is the identity provider, not a paid one)
const paid = w => providerCalls(w.env.MOCK_CALL_LOG).filter(c => c.provider !== 'supabase');

test('TL-4. "Fix text layout" through the bridge: offered on every scene with words, free, no provider, a DRAFT (the published site unchanged), the words exactly as they were -- and nobody else\'s to press', async () => {
  const w = await world(); const P = `/api/app-bridge/website/${w.projectId}`;
  const o = (await w.owner('GET', `${P}/creative`)).body; const s = o.outline.scenes.find(x => x.text.heading);
  assert.ok(o.outline.scenes.filter(x => x.text.heading || x.text.body).every(x => x.actions.includes('text-layout')), 'offered wherever there are words');
  const published0 = (await w.owner('GET', `${P}/preview`)).text; const c0 = await credits(w); const p0 = paid(w).length;
  // the words of the scene set as a sentence first (an edit -- itself re-fitted), then the explicit fix
  const e = await w.owner('POST', `${P}/creative/edit`, { baseRevision: o.revision, op: { type: 'text', sceneId: s.id, field: 'heading', value: GLASS } });
  assert.equal(e.status, 200, JSON.stringify(e.body)); assert.equal(e.body.creditsCharged, 0);
  const before = await planOf(w);
  const r = await w.owner('POST', `${P}/creative/edit`, { baseRevision: e.body.revision, op: { type: 'text-layout', sceneId: s.id } });
  assert.equal(r.status, 200, JSON.stringify(r.body)); assert.equal(r.body.creditsCharged, 0);
  // (already fitted by the edit itself: nothing to save -- no new revision)
  assert.equal(r.body.unchanged, true); assert.equal(r.body.revision, e.body.revision); assert.match(r.body.changeSummary[0], /already fit/);
  const after = await planOf(w); assert.deepEqual(after, before, 'the page as it was');
  assert.equal(after.scenes.find(x => x.id === s.id).text.heading, GLASS);
  assert.equal(await credits(w), c0, '0 credits'); assert.deepEqual(paid(w).slice(p0), [], '0 paid provider calls');
  assert.equal((await w.owner('GET', `${P}/preview`)).text, published0, 'the published site waits for Publish');
  // another customer: nothing
  const x = await w.other('POST', `${P}/creative/edit`, { baseRevision: r.body.revision, op: { type: 'text-layout', sceneId: s.id } });
  assert.equal(x.status, 404); assert.deepEqual(await planOf(w), after);
  // a scene with no words, an unknown scene: refused, nothing saved
  assert.equal((await w.owner('POST', `${P}/creative/edit`, { baseRevision: r.body.revision, op: { type: 'text-layout', sceneId: 'nope' } })).status, 404);
});

test('TL-5. an AI rewrite re-fits the words it wrote: the scene\'s layout follows the new words, charged only its quote, never a provider beyond the mocked director', async () => {
  const w = await world(); const P = `/api/app-bridge/website/${w.projectId}`;
  let o = (await w.owner('GET', `${P}/creative`)).body;
  // a scene set as giant type for a few words (the existing recompose stages it), then rewritten by the AI as a sentence
  const s = o.outline.scenes.find(x => x.compositions.some(k => k.id === 'type-takeover'));
  assert.ok(s, 'a scene whose pictures carry a type takeover');
  let r = await w.owner('POST', `${P}/creative/edit`, { baseRevision: o.revision, op: { type: 'text', sceneId: s.id, field: 'heading', value: 'Pure cold' } }); assert.equal(r.status, 200, JSON.stringify(r.body));
  r = await w.owner('POST', `${P}/creative/edit`, { baseRevision: r.body.revision, op: { type: 'composition', sceneId: s.id, composition: 'type-takeover' } }); assert.equal(r.status, 200, JSON.stringify(r.body));
  let sc = (await planOf(w)).scenes.find(x => x.id === s.id); assert.equal(sc.text.giant, true, 'a few words are the type');
  const layers0 = JSON.stringify(sc.layers);
  const q = await w.owner('POST', `${P}/creative/quote`, { action: 'ai-text', sceneId: s.id, field: 'heading', request: `make it say "${LONG}"` });
  assert.equal(q.status, 200, JSON.stringify(q.body)); assert.equal(q.body.quote.credits, 1);
  const c0 = await credits(w); const p0 = paid(w).length;
  const st = await w.owner('POST', `${P}/creative/start`, { quoteId: q.body.quote.id, baseRevision: r.body.revision });
  assert.equal(st.status, 200, JSON.stringify(st.body)); assert.equal(st.body.creditsCharged, 1);
  sc = (await planOf(w)).scenes.find(x => x.id === s.id);
  assert.equal(sc.text.heading, LONG, 'the rewritten words');
  assert.equal(sc.text.giant, undefined, 'a sentence is set as the stage\'s label, not left as giant type'); assert.equal(sc.text.role, 'label');
  assert.equal(JSON.stringify(sc.layers), layers0, 'its pictures untouched');
  assert.equal(await credits(w), c0 - 1, 'its quote, once');
  // (the rewrite asked the mocked AI director only -- the re-fit itself asks nothing)
  const used = [...new Set(paid(w).slice(p0).map(c => c.provider + ':' + (c.tool || c.endpoint || '')))]; assert.ok(used.length && used.every(x => /^anthropic:/.test(x)), used.join(', '));
});

test('TL-6. a page saved before this fix (the Studio\'s own text save: new words, the old layout): "Fix text layout" re-sets that scene as a new DRAFT -- free, no provider, the words and everything else exactly as they were', async () => {
  const w = await world(); const P = `/api/app-bridge/website/${w.projectId}`;
  let o = (await w.owner('GET', `${P}/creative`)).body;
  const s = o.outline.scenes.find(x => x.compositions.some(k => k.id === 'type-takeover'));
  let r = await w.owner('POST', `${P}/creative/edit`, { baseRevision: o.revision, op: { type: 'text', sceneId: s.id, field: 'heading', value: 'Pure cold' } }); assert.equal(r.status, 200, JSON.stringify(r.body));
  r = await w.owner('POST', `${P}/creative/edit`, { baseRevision: r.body.revision, op: { type: 'composition', sceneId: s.id, composition: 'type-takeover' } }); assert.equal(r.status, 200, JSON.stringify(r.body));
  // the Studio saves the project whole (its store re-checks it, as it always has: no re-fit) -- a sentence left as giant type
  const project = (await w.call('GET', `/api/projects/${w.projectId}`)).body.project; const ds = project.directionsState;
  ds.directions[0].creative.plan.scenes.find(x => x.id === s.id).text.heading = LONG;
  // (the pictures go back as the stored references they are -- GET hands them out with their bytes)
  const cr = ds.directions[0].creative; [].concat(cr.assets || [], (cr.threeD && cr.threeD.assets) || []).forEach(x => { if (x && x.assetRef && x.dataUrl) delete x.dataUrl; });
  const put = await w.call('PUT', `/api/projects/${w.projectId}`, { name: project.name, expectedRevision: project.revision, directionsState: ds });
  assert.equal(put.body.ok, true, JSON.stringify(put.body));
  const stale = await planOf(w); const st = stale.scenes.find(x => x.id === s.id);
  assert.equal(st.text.heading, LONG); assert.equal(st.text.giant, true, 'the old save: the sentence is still giant type');
  const rev = (await w.owner('GET', `${P}/creative`)).body.revision; const c0 = await credits(w); const p0 = paid(w).length;
  const published0 = (await w.owner('GET', `${P}/preview`)).text;
  const fix = await w.owner('POST', `${P}/creative/edit`, { baseRevision: rev, op: { type: 'text-layout', sceneId: s.id } });
  assert.equal(fix.status, 200, JSON.stringify(fix.body)); assert.equal(fix.body.creditsCharged, 0); assert.equal(fix.body.unchanged, undefined);
  assert.equal(fix.body.revision, rev + 1, 'a new draft'); assert.ok(fix.body.fitted.some(f => /label/.test(f)), fix.body.fitted.join(' | '));
  const after = await planOf(w); const s1 = after.scenes.find(x => x.id === s.id);
  assert.equal(s1.text.heading, LONG, 'the same words'); assert.deepEqual(editorTextOf(s1), editorTextOf(st));
  assert.equal(s1.text.giant, undefined); assert.equal(s1.text.role, 'label');
  assert.deepEqual(withoutType(s1), withoutType(st), 'its pictures, layers, colour and composition untouched');
  after.scenes.forEach(x => { if (x.id !== s.id) assert.deepEqual(x, stale.scenes.find(y => y.id === x.id)); });
  assert.equal(await credits(w), c0, '0 credits'); assert.deepEqual(paid(w).slice(p0), [], '0 paid provider calls');
  assert.equal((await w.owner('GET', `${P}/preview`)).text, published0, 'the published site waits for Publish');
  const draft = await w.owner('GET', `${P}/preview?source=draft`); assert.equal(draft.status, 200); assert.ok(draft.text.includes('Every summer the whole world'), 'the draft shows the words');
});
