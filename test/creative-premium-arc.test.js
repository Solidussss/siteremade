'use strict';
// THE PREMIUM ARC (lib/creative/premium-arc.js; showcase mode): up to three premium videos -- the hero (the hook), a
// mid-page takeover (escalates), the payoff (returns and concludes) -- each one IS the page's visual surface: full-screen,
// edge to edge, never a card, a column or a split; each one carries into the scene after it; each is its own credit line,
// charged only when delivered. Standard pages keep their single hero, unchanged. Higgsfield and the models are mocked
// (in-process fakes and test/helpers/run-server.js): $0 of real provider spend.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const PA = require('../lib/creative/premium-arc');
const PM = require('../lib/media/premium-media');
const Q = require('../lib/quotes');
const POOL = require('../lib/creative/pool');
const FR = require('../lib/creative/framing');
const CT = require('../lib/creative/continuity');
const COMP = require('../lib/creative/composition');
const AI = require('../lib/creative/ai');
const D2 = require('../lib/creative/director2');
const { validatePlan2 } = require('../lib/creative/validate2');
const { renderCreative2 } = require('../lib/creative/render2');
const { createBudget, costs } = require('../lib/provider-budget');
const { startServer, client, providerCalls } = require('./helpers/server-process');
const { mockPng } = require('./helpers/mock-image');
const { premiumRun } = require('./helpers/premium-job');

// ---------------------------------------------------------------- the fixture: a strong subject, five sources, a logo
const pic = (id, w, h, colour, extra) => Object.assign({ id, origin: 'upload', title: id, mime: 'image/png',
  assess: { width: w, height: h, aspect: +(w / h).toFixed(3), orientation: w > h * 1.15 ? 'landscape' : h > w * 1.15 ? 'portrait' : 'square', subject: [0.3, 0.2, 0.7, 0.9], colours: [colour], luminance: 90, background: { colour: '#101018', uniformity: 0.3 } },
  caps: { moveFreely: false, frame: true, backdrop: w > h, heroSize: true }, curation: { role: 'subject', identity: 'exact', depicts: id, issues: [] } }, extra || {});
const MAIN = pic('main', 2000, 1125, '#3355cc', { title: 'the drifter, surfing a light trail' });
const WORLD = pic('world', 1920, 1080, '#7a2f9e', { origin: 'research', license: 'CC BY 4.0', pageUrl: 'https://example.org/world', author: 'Example', curation: { role: 'environment', identity: 'related', depicts: 'deep space with nebulae', issues: [] } });
const PORTRAIT = pic('portrait', 1400, 1600, '#1c3a8a');
const SIDE = pic('side', 1800, 1100, '#c0502e', { title: 'the drifter, from the side' });
const CUT = pic('c-portrait', 840, 1090, '#1c3a8a', { origin: 'derived', cutout: true, cutoutOf: 'portrait', assess: { width: 840, height: 1090, aspect: 0.771, orientation: 'portrait', transparent: true, subject: [0.02, 0.02, 0.98, 0.98], colours: ['#1c3a8a'], luminance: 96 }, caps: { moveFreely: true } });
const LOGO = pic('logo', 480, 140, '#96b4ff', { ownerRole: 'logo', assess: { width: 480, height: 140, aspect: 3.43, orientation: 'landscape', transparent: true, colours: ['#96b4ff'], luminance: 160 } });
const ASSETS = [MAIN, WORLD, PORTRAIT, SIDE, CUT, LOGO];
const FACTS = ['The drifter rides light trails between galaxies.', 'Its board is made of polished chrome.', 'It first appeared in a 1990s comic.', 'It never speaks.', 'Its home planet was lost long ago.', 'It travels faster than light.', 'Its chrome reflects every star it passes.', 'It guards a cosmic balance.'].map((text, i) => ({ id: `f${i + 1}`, text, section: 'x' }));
const UND = { kind: 'fictional', subject: 'The Drifter', brief: 'a showcase build for a cosmic chrome hero', tone: { register: 'cinematic' } };

// the server's planning, in-process: the pool -> each moment's source through the permission gate -> art direction
// around the arc -> the built-in director -> the one door (validatePlan2)
function showcase(seed, roles) {
  const inv = ASSETS.map(a => JSON.parse(JSON.stringify(a))); const byId = new Map(inv.map(a => [a.id, a]));
  const pool = POOL.build(inv, { mainAsset: 'main' });
  const eligible = id => PM.sourceEligibility(byId.get(id), { byId, confirmed: [] }).ok;
  const pics = pool.pictures.map(p => ({ id: p.id, colour: p.colour, bleed: FR.canBleed(byId.get(p.id), 1.6), role: (byId.get(p.id).curation || {}).role || '' }));
  const R = roles || PA.ROLES; const src = PA.pickSources(R, pics, eligible, pool.main && pool.main.id);
  const arc = R.map(r => ({ role: r, intent: PA.ROLE_INTENT[r], asset: src[r] })).filter(e => e.asset);
  const { plan, recipe } = D2.direct({ understanding: UND, research: { page: null, facts: FACTS }, assets: inv, supplied: { facts: [], memories: [] }, seed, mainAsset: 'main', premium: { video: true, intent: 'cinematic_hero', source: src.hero, arc }, pool });
  const v = validatePlan2(plan, { assets: inv, facts: FACTS, understanding: UND, art: recipe, mainAsset: 'main', premiumHero: { intent: 'cinematic_hero', source: src.hero }, premiumArc: arc });
  return Object.assign(v, { inv, arc, byId: new Map(inv.map(a => [a.id, a])) });
}
const SEEDS = ['s1', 's2', 's3', 's4'];
const PAGES = SEEDS.map(s => showcase(s));
const evAt = (plan, role) => plan.premiumArc.find(e => e.role === role);
const focal = s => s.layers.find(L => L.kind === 'image' && L.role === 'focal');
const contractAt = (plan, at) => plan.timeline.continuity.contracts.find(k => k.at === at);
// a delivered clip, as the server returns it
const clip = (role, source, n) => ({ kind: 'video', role, sourceAssetId: source, video: { mediaId: `pm_${role}_${n || 1}`, assetRef: 'x'.repeat(64), mime: 'video/mp4', intent: PA.ROLE_INTENT[role] }, premium: { mediaId: `pm_${role}_${n || 1}`, provider: 'higgsfield', intent: PA.ROLE_INTENT[role], sourceAssetId: source } });
const html = (plan, assets, extra) => renderCreative2(plan, assets, Object.assign({ mode: 'preview', src: a => `${a.id}.png`, videoSrc: a => (a.video ? `${a.id}.mp4` : '') }, extra || {}));

// ================================================================ 1. three strategies; showcase is never the default
test('1. strategies: standard by default (one moment), cinematic (two) and showcase (three) only when asked for', () => {
  assert.equal(PA.strategyFor('A Creative site for my sneaker brand with a cinematic hero video').strategy, 'standard');
  assert.equal(PA.strategyFor('A bold page about the history of the bicycle').strategy, 'standard');
  for (const b of ['A showcase build for our launch', 'a social demo of the drifter', 'three premium videos across the page', 'Full premium: 3 cinematic clips']) assert.equal(PA.strategyFor(b).strategy, 'showcase', b);
  for (const b of ['two premium videos', 'a cinematic takeover in the middle', 'multiple premium videos']) assert.equal(PA.strategyFor(b).strategy, 'cinematic', b);
  assert.equal(PA.strategyFor('a plain page', 'showcase').strategy, 'showcase', 'an explicit strategy from the request');
  assert.equal(PA.strategyFor('a plain page', 'everything').strategy, 'standard', 'never a made-up strategy');
  assert.deepEqual(PA.eventsFor('standard'), ['hero']); assert.deepEqual(PA.eventsFor('cinematic'), ['hero', 'takeover']); assert.deepEqual(PA.eventsFor('showcase'), ['hero', 'takeover', 'payoff']);
});

// ================================================================ 2. one credit line per moment
const live = () => ({ hasKey: true, mode: 'live', env: { HIGGSFIELD_VIDEO_ENDPOINT: 'kling-video/v3.0/4k/image-to-video' } });
const plan = (brief, strategy) => PM.planForBrief({ brief, provider: live(), costs: costs({}), tierFor: (intent, est) => Q.premiumTier(PM.INTENTS[intent].mediaType, est), strategy });
test('2. the quote: one priced, optional line per moment (12 credits each at 4K), at most three; a standard quote is unchanged', () => {
  const p = plan('A showcase build for the drifter', 'showcase');
  assert.deepEqual(p.planned.map(x => [x.role, x.intent, x.credits]), [['hero', 'cinematic_hero', 12], ['takeover', 'premium_transition', 12], ['payoff', 'cinematic_hero', 12]]);
  const q = Q.build('creative_generation', { premium: p.planned });
  assert.deepEqual(q.items.filter(i => /^premium_/.test(i.code)).map(i => [i.role, i.credits, !!i.optional]), [['hero', 12, true], ['takeover', 12, true], ['payoff', 12, true]]);
  assert.equal(q.credits, 42); assert.equal(q.minCredits, 6, 'every clip is charged only if it is delivered');
  assert.ok(q.items.some(i => /Premium takeover video/.test(i.label)));
  assert.equal(plan('two premium videos', 'cinematic').planned.length, 2);
  // never more than three, whatever a request lists
  assert.equal(Q.build('creative_generation', { premium: p.planned.concat(p.planned) }).items.filter(i => /^premium_/.test(i.code)).length, Q.MAX_PREMIUM_EVENTS);
  // standard: the single hero, no role, exactly as before
  const s = plan('A Creative site for my sneaker brand with a cinematic hero video');
  assert.deepEqual(s.planned.map(x => [x.intent, x.credits, x.role]), [['cinematic_hero', 12, undefined]]); assert.equal(s.strategy, 'standard');
  assert.equal(Q.build('creative_generation', { premium: s.planned }).credits, 18);
});

// ================================================================ 3. reserve first, run within it, charge per moment
// (the premium job -- lib/premium-jobs.js -- is the only executor: a fake provider on a fake clock, an in-memory ledger)
const PJ = require('../lib/premium-jobs'); const credits = require('../lib/credits'); const { resetSqliteAdapter } = require('../lib/adapters/sqlite-database-adapter');
function arcJob(budgetClips, failAt) {
  const db = resetSqliteAdapter(require('path').join(require('os').tmpdir(), `sr-arc3-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}.db`)); let t = Date.parse('2026-10-01T12:00:00Z');
  credits.grant(db, { id: 'purchase:arc', accountId: 'acct', kind: 'purchase', amount: 100, source: 'test', now: new Date(t) });
  credits.reserve(db, { accountId: 'acct', opId: 'cj_arcjob00001:premium', amount: 36, kind: 'creative_premium', now: new Date(t) });
  let n = 0; const log = []; const provider = { submit: async () => { n++; log.push(n); return { requestId: `r${n}` }; }, status: async id => (id === `r${failAt}` ? { status: 'failed' } : { status: 'completed', outputUrl: `https://o.test/${id}.mp4` }), cancel: async () => true, download: async () => ({ bytes: Buffer.from('mp4'), mime: 'video/mp4' }) };
  const roles = ['hero', 'takeover', 'payoff'].map(role => ({ role, intent: PA.ROLE_INTENT[role], sourceAssetId: role === 'takeover' ? 'world' : 'main', sourceRef: 'a'.repeat(64), mime: 'image/png', sourceBase: 'https://x.test', preset: 'video_clip', mediaType: 'video', credits: 12, estimatedUsd: 2.25, observedUsd: 2.1 }));
  const job = PJ.create(db, { accountId: 'acct', creativeJobId: 'cj_arcjob00001', opId: 'cj_arcjob00001:premium', mode: 'showcase', strategy: 'showcase', creditsReserved: 36, budgetUsd: budgetClips * 2.25, roles }, t).job;
  const w = PJ.createWorker({ db, provider, presets: PM.presets({ HIGGSFIELD_VIDEO_ENDPOINT: 'kling-video/v3.0/4k/image-to-video' }), costs: costs({}), store: () => 'b'.repeat(64), sourceUrl: async () => 'https://x.test/s', policy: Object.assign(PJ.policy({}), { firstCheckMs: 1e9, checkMs: 1e9, maxCheckMs: 1e9 }), now: () => t });
  return { run: async () => { await w.tick(job.id); t += 60000; await w.tick(job.id); t += 60000; await w.tick(job.id); w.stop(); return PJ.view(db.premiumJobs.find(job.id)); }, log };
}
test('3. cost: the job never submits past its provider budget (the payoff, then the takeover, are not sent), never more than its mode\'s three, never retries; each moment delivered or failed on its own', async () => {
  const full = arcJob(3); const v = await full.run(); assert.equal(full.log.length, 3, 'three clips, one submit each'); assert.equal(v.status, 'completed');
  const two = arcJob(2); const v2 = await two.run(); assert.equal(two.log.length, 2, 'the payoff never reached the provider'); assert.deepEqual(v2.failed.map(f => [f.role, f.code]), [['payoff', 'budget_blocked']]);
  const one = arcJob(1); const v3 = await one.run(); assert.equal(one.log.length, 1); assert.deepEqual(v3.delivered.map(m => m.role), ['hero'], 'the hero is kept first');
  const bad = arcJob(3, 2); const v4 = await bad.run(); assert.equal(bad.log.length, 3, 'no retry'); assert.deepEqual(v4.delivered.map(m => m.role), ['hero', 'payoff']); assert.equal(v4.failed[0].role, 'takeover');
  assert.deepEqual(v4.credits.charged, 24); assert.deepEqual(v4.credits.returned, 12);
});

// ================================================================ 4. the arc: hero, takeover, payoff -- one visual story
test('4. the plan is built around the moments: hero opens, the takeover sits mid-page from a different picture, the payoff closes on the hero\'s picture', () => {
  PAGES.forEach(v => {
    const P = v.plan; const n = P.scenes.length; const tag = P.art.recipe;
    assert.equal(v.errors.length, 0, `${tag}: ${v.errors}`);
    assert.ok(n >= 6, `${tag}: ${n} scenes`);
    assert.deepEqual(P.premiumArc.map(e => e.role), ['hero', 'takeover', 'payoff'], tag);
    const [h, t, p] = P.premiumArc;
    assert.equal(h.scene, 0); assert.equal(p.scene, n - 1); assert.ok(t.scene >= 2 && t.scene <= n - 2, `${tag}: takeover at ${t.scene}`);
    assert.equal(h.asset, 'main', 'the hero starts from the main picture');
    assert.notEqual(t.asset, h.asset, 'the takeover changes the world: another strong picture');
    assert.equal(p.asset, h.asset, 'the payoff returns to the opening picture'); assert.equal(p.callback, true);
    assert.notEqual(t.purpose, h.purpose, 'different jobs'); assert.ok(['return', 'resolve'].includes(p.purpose));
    // one premium media request per moment (no more single-hero cap)
    assert.deepEqual(P.premiumMedia.map(m => m.asset), [h.asset, t.asset, p.asset]);
    assert.deepEqual(PA.audit(P, v.byId), [], `${tag}: ${JSON.stringify(PA.audit(P, v.byId))}`);
  });
  // only the hero when the strategy is standard: no arc on the page
  const std = showcase('s1', ['hero']); assert.ok(!std.plan.premiumArc, 'a single moment is the standard premium hero');
});

// ================================================================ 5. full screen is a hard rule
test('5. every premium moment covers the viewport on desktop AND phone: cover, bleed, no mask, no card, no split -- words over it, short', () => {
  PAGES.forEach(v => v.plan.premiumArc.forEach(e => {
    const s = v.plan.scenes[e.scene]; const f = focal(s); const tag = `${v.plan.art.recipe} ${e.role}`;
    assert.ok(PA.COMPOSITIONS_FOR[e.role].includes(s.composition), `${tag}: ${s.composition}`);
    assert.deepEqual(f.box.d, [0, 0, 100, 100], tag); assert.deepEqual(f.box.m, [0, 0, 100, 100], tag);
    assert.equal(f.fit, 'cover'); assert.equal(f.mfit, 'cover'); assert.equal(f.frame, 'bleed'); assert.equal(f.mask, 'none');
    assert.equal(PA.coverage(s), 100);
    assert.ok(!['split', 'framed', 'magazine', 'splitscreen', 'window', 'polaroid'].includes(s.layout), `${tag}: ${s.layout}`);
    assert.ok((s.text.body || '').length <= 140, `${tag}: copy over a clip stays short`);
  }));
  // a model asking to stage a moment in a split is overruled -- and told so
  const v = PAGES[0]; const raw = JSON.parse(JSON.stringify(v.plan)); const t = evAt(raw, 'takeover');
  raw.scenes[t.scene].composition = 'gallery-collapse'; focal(raw.scenes[t.scene]).box = { d: [55, 10, 40, 60], m: [5, 50, 90, 40] };
  const again = validatePlan2(raw, { assets: v.inv, facts: FACTS, understanding: UND, mode: 'safety' });
  const s2 = again.plan.scenes[t.scene];
  assert.ok(PA.COMPOSITIONS_FOR.takeover.includes(s2.composition)); assert.deepEqual(focal(s2).box.d, [0, 0, 100, 100]);
});

// ================================================================ 6. composition decides the seam
test('6. the composition and the seam after it are one decision: what a composition becomes is the seam it makes (BECOMES)', () => {
  // every composition records what it can become, from the transition vocabulary
  COMP.COMPOSITIONS.forEach(k => { assert.ok(Array.isArray(COMP.BECOMES[k]) && COMP.BECOMES[k].length >= 1, k); COMP.BECOMES[k].forEach(f => assert.ok(require('../lib/creative/timeline').TRANSITIONS.includes(f), `${k}: ${f}`)); });
  assert.ok(COMP.BECOMES['image-takeover'].includes('image-expand')); assert.ok(COMP.BECOMES['gallery-collapse'].includes('card-expand'));
  assert.ok(COMP.BECOMES['type-takeover'].includes('type-mask')); assert.ok(COMP.BECOMES['object-stage'].includes('depth-handoff'));
  assert.ok(COMP.BECOMES['cinematic-chapter'].includes('image-expand'));
  // on the pages: a signature seam after a composition is one that composition becomes (a bleed is always allowed)
  let linked = 0, total = 0;
  PAGES.forEach(v => v.plan.timeline.transitions.forEach(tr => {
    const prev = v.plan.scenes[tr.at - 1]; if (!prev || !prev.composition || ['color-bleed', 'actor-carry'].includes(tr.family)) return;
    total++; if (COMP.BECOMES[prev.composition].includes(tr.family)) linked++;
  }));
  assert.ok(total > 0); assert.equal(linked, total, `${linked} of ${total} signature seams follow their composition`);
  // the critic names a seam that breaks it, and its fix is one the composition becomes
  const v = PAGES[0]; const P = JSON.parse(JSON.stringify(v.plan)); const at = P.scenes.findIndex((s, i) => i > 0 && P.scenes[i - 1].composition === 'fullscreen-subject' && !P.premiumArc.some(e => e.scene === i || e.scene === i - 1));
  if (at > 0) {
    P.timeline.transitions.find(x => x.at === at).family = 'card-expand';
    const issues = CT.critique(P, v.byId); assert.ok(issues.some(x => x.code === 'composition-seam-mismatch' && x.at === at), JSON.stringify(issues));
  }
});

// ================================================================ 7. each clip becomes the next scene
test('7. transformations: the hero\'s subject carries into scene 2, the takeover is entered from the scene before and pushes through, the payoff calls back; the colour holds after every clip', () => {
  PAGES.forEach(v => {
    const P = v.plan; const tag = P.art.recipe; const [h, t, p] = P.premiumArc;
    assert.equal(h.continuation, 'freeze-subject'); assert.equal(t.continuation, 'push-through'); assert.equal(p.continuation, 'settle');
    // out of the hero and the takeover: a seam that continues the clip (depth hand-off or the picture expanding), never a cut
    [h, t].forEach(e => { const k = contractAt(P, e.scene + 1); assert.ok(['depth-handoff', 'image-expand', 'color-bleed'].includes(k.family), `${tag} after ${e.role}: ${k.family}`); assert.notEqual(k.intent, 'reset', tag); });
    // the colour of a non-hero clip holds across the seam after it (no hard reset after premium media)
    assert.equal(contractAt(P, t.scene + 1).paletteHandoff, 'hold', `${tag}: ${contractAt(P, t.scene + 1).paletteHandoff}`);
    // into the takeover and into the payoff: the media arrives by transformation
    [t, p].forEach(e => assert.ok(['image-expand', 'card-expand', 'depth-handoff', 'color-bleed', 'foreground-wipe', 'shape-takeover', 'type-mask'].includes(contractAt(P, e.scene).family), `${tag} into ${e.role}`));
    const m = PA.metrics(P);
    assert.equal(m.inCards, 0); assert.equal(m.hardResetsAfter, 0); assert.equal(m.payoffReferencesOpening, true); assert.deepEqual(m.coverage, [100, 100, 100]);
  });
});

// ================================================================ 8. the clips on the page
test('8. render: each moment\'s clip is the full-screen surface (its picture\'s own frame, crop allowed), the takeover pushes through, the payoff plays once; phones keep it full height; reduced motion shows the stills in the same composition', () => {
  const v = PAGES[0]; const A = PA.attach(v.inv, [clip('hero', 'main', 1), clip('takeover', evAt(v.plan, 'takeover').asset, 2), clip('payoff', 'main', 3)]);
  const P = PA.repoint(v.plan, A.byRole); const out = html(P, A.assets);
  const sec = role => { const m = new RegExp(`<section[^>]*data-pv="${role}"[\\s\\S]*?</section>`).exec(out); return m ? m[0] : ''; };
  ['hero', 'takeover', 'payoff'].forEach(role => {
    const s = sec(role); assert.ok(s, role); assert.match(s, /<video class="ly-vid"/, role);
    assert.match(s, /--x:0;--y:0;--w:100;--h:100;--mx:0;--my:0;--mw:100;--mh:100/, `${role}: the clip's layer is the whole screen`);
    assert.match(s, /data-crop="1"/, `${role}: the moment may crop as far as covering needs`);
  });
  assert.match(sec('takeover'), /data-pvend="push-through"/); assert.match(sec('hero'), /data-pvend="freeze-subject"/); assert.match(sec('payoff'), /data-pvend="settle"/);
  assert.doesNotMatch(/<video class="ly-vid"[^>]*>/.exec(sec('payoff'))[0], / loop /, 'the payoff concludes: it does not loop');
  assert.match(/<video class="ly-vid"[^>]*>/.exec(sec('payoff'))[0], / data-once /, 'and it starts when it is on screen, not at page load');
  assert.match(out, /querySelectorAll\('video\[data-once\]'\)/);
  assert.match(/<video class="ly-vid"[^>]*>/.exec(sec('takeover'))[0], / loop /);
  // the payoff plays its own clip (a copy of the hero's picture carries it), not the hero's again
  assert.match(sec('payoff'), /src="pv-payoff-main\.mp4"/); assert.match(sec('hero'), /src="main\.mp4"/);
  // CSS: the moments fill the viewport on phones too; the runtime measures their seams; reduced motion: the still
  assert.match(out, /\.sc\[data-pv\]\{min-height:100vh;min-height:100svh\}/);
  assert.match(out, /@media \(max-width:720px\)\{\n {2}\.sc\[data-pv\] \.sc-pin\{min-height:100svh/);
  assert.match(out, /s\.hasAttribute\('data-vout'\)\|\|s\.hasAttribute\('data-pv'\);/);
  assert.match(out, /html\[data-motion="reduced"\] \.ly-vid\{display:none\}/);
  assert.match(out, /data-pvarc="3"/);
  // a composition's window (its planes' clip) never keeps a premium clip small once it has arrived
  assert.match(out, /html \.sc\[data-pv\]\[data-pv\] \.ly:is\(\[data-role="focal"\],\[data-role="subject"\]\)\{clip-path:none!important\}/);
  // the scene after the takeover keeps an echo of its world
  const after = new RegExp(`<section[^>]*data-pvafter="takeover"`).test(out); assert.ok(after);
});

// ================================================================ 9. the delivered clips retune the page
test('9. delivered clips: attached to their own sources (the payoff\'s on a copy of the hero\'s picture), the plan re-pointed, each clip\'s colour, side and brightness retune its scene and the next; a saved page reopens the same', () => {
  const v = PAGES[1]; const t = evAt(v.plan, 'takeover');
  const A = PA.attach(v.inv, [clip('hero', 'main'), clip('takeover', t.asset), clip('payoff', 'main')]);
  assert.deepEqual(Object.keys(A.byRole), ['hero', 'takeover', 'payoff']); assert.equal(A.byRole.hero, 'main'); assert.equal(A.byRole.payoff, 'pv-payoff-main');
  const copy = A.assets.find(a => a.id === 'pv-payoff-main'); assert.equal(copy.derivedFrom, 'main'); assert.equal(copy.video.role, 'payoff'); assert.equal(copy.origin, 'derived');
  assert.equal(A.assets.find(a => a.id === 'main').video.role, 'hero', 'the hero keeps its own clip');
  let P = PA.repoint(v.plan, A.byRole); assert.equal(focal(P.scenes[evAt(P, 'payoff').scene]).asset, 'pv-payoff-main');
  // the takeover clip came back red, bright, its subject on the words' side, moving left to right
  const tx = P.scenes[t.scene].text; const wordsSide = tx.place && (tx.place.gc[0] + tx.place.gc[1]) / 2 < 6.5 ? 'left' : 'right';
  P = PA.retune(P, 'takeover', { cast: '#d02020', accent: '#ffd000', brightness: 0.74, side: wordsSide, motion: 'lr' });
  const e = evAt(P, 'takeover'); assert.deepEqual(e.measured, { cast: '#d02020', accent: '#ffd000', brightness: 0.74, motion: 'lr', side: wordsSide });
  assert.notEqual(P.scenes[t.scene].tone, v.plan.scenes[t.scene].tone, 'its scene takes the clip\'s colour');
  if (tx.place && tx.place.gc[1] - tx.place.gc[0] < 9) { const now = P.scenes[t.scene].text.place; assert.notEqual((now.gc[0] + now.gc[1]) / 2 < 6.5 ? 'left' : 'right', wordsSide, 'the words move off the subject'); }
  assert.ok(P.scenes[t.scene].text.shade, 'a bright clip gets a shade under its words');
  // a reopened page (safety re-validation) keeps the arc, the copy and what was measured
  const assets = A.assets; const re = validatePlan2(P, { assets, facts: FACTS, understanding: UND, mode: 'safety' });
  assert.equal(re.errors.length, 0, re.errors.join('; ')); assert.deepEqual(re.plan.premiumArc.map(x => x.role), ['hero', 'takeover', 'payoff']);
  assert.equal(evAt(re.plan, 'payoff').asset, 'pv-payoff-main'); assert.equal(evAt(re.plan, 'takeover').measured.motion, 'lr');
  const twice = validatePlan2(re.plan, { assets, facts: FACTS, understanding: UND, mode: 'safety' }); assert.deepEqual(twice.plan, re.plan, 'idempotent');
  // the measured motion leads the next scenes' seams
  const k = contractAt(re.plan, t.scene + 1); assert.ok(['lr', 'none'].includes(k.motionVector), k.motionVector);
  // the renderer continues it in the next cameras
  assert.match(html(re.plan, assets), /data-pvafter="takeover"/);
});

// ================================================================ 10. the showcase rules: audit + critic
test('10. the critic sees what breaks a showcase -- a clip in a card or a split, a takeover that does not take over, no payoff, a hard reset, the same job twice -- and its fixes restage the moment', () => {
  const v = PAGES[2]; const base = v.plan; const t = evAt(base, 'takeover'); const p = evAt(base, 'payoff');
  const broken = JSON.parse(JSON.stringify(base));
  focal(broken.scenes[t.scene]).box = { d: [60, 20, 30, 40], m: [10, 50, 80, 30] }; broken.scenes[t.scene].layout = 'split';
  focal(broken.scenes[p.scene]).box = { d: [5, 5, 40, 50], m: [5, 5, 90, 40] }; broken.scenes[p.scene].layout = 'polaroid';
  broken.timeline.continuity.contracts.find(k => k.at === t.scene + 1).intent = 'reset';
  broken.premiumArc.find(e => e.role === 'payoff').callback = false; broken.premiumArc.find(e => e.role === 'payoff').asset = 'side';
  broken.premiumArc.find(e => e.role === 'takeover').purpose = 'hook';
  const codes = PA.audit(broken, v.byId).map(x => x.code);
  for (const c of ['premium-takeover-not-dominant', 'premium-in-split', 'premium-payoff-not-dominant', 'premium-in-card', 'premium-hard-reset', 'premium-no-payoff', 'premium-same-job']) assert.ok(codes.includes(c), `${c}: ${codes}`);
  assert.deepEqual(PA.audit(base, v.byId), [], 'the planned page passes');
  // the critic's vocabulary includes them, and its fixes are bounded: a composition from the role's list, a continuing seam
  PA.AUDIT.forEach(c => assert.ok(CT.CRITIC.includes(c), c));
  const issues = CT.critique(broken, v.byId); assert.ok(issues.some(x => x.code === 'premium-takeover-not-dominant'));
  const fixes = CT.fixesFor(issues, broken);
  const stage = fixes.find(f => f.code === 'premium-takeover-not-dominant'); assert.ok(stage && PA.COMPOSITIONS_FOR.takeover.includes(stage.composition), JSON.stringify(fixes));
  const reset = fixes.find(f => f.code === 'premium-hard-reset'); assert.ok(reset && ['depth-handoff', 'color-bleed'].includes(reset.family) && reset.paletteHandoff === 'hold');
});

// ================================================================ 11. the director: more room, the same fixed schema
test('11. the director: a showcase gets one larger answer (never a repair), a bounded premiumArc schema (roles, compositions, purposes -- no provider parameter, no code), and the critic prompt names the showcase checks', async () => {
  const L = AI.limits({}); assert.ok(L.showcaseDirectorMaxTokens > L.directorMaxTokens);
  const sch = AI.DIRECTOR_TOOL.input_schema.properties.premiumArc;
  assert.equal(sch.maxItems, 3); assert.deepEqual(sch.items.properties.role.enum, PA.ROLES);
  Object.values(sch.items.properties).forEach(pr => assert.ok(pr.enum || pr.type === 'integer', JSON.stringify(pr)));
  assert.ok(!('endpoint' in sch.items.properties) && !('model' in sch.items.properties) && !('duration' in sch.items.properties));
  assert.match(AI.CRITIC_SYSTEM, /on a showcase/);
  assert.ok(AI.PLAN_FIELDS.includes('premiumArc'));
  const seen = []; const call = async q => { seen.push(q.maxTokens); return { model: 'mock', usage: { input_tokens: 10, output_tokens: 10 }, input: { identity: {} } }; };
  const v = PAGES[0]; const input = { understanding: UND, assets: v.inv, facts: FACTS, premiumArc: v.arc, art: null };
  await AI.direct(input, { limits: Object.assign({}, L, { repairs: 1 }), call });
  assert.deepEqual(seen, [L.showcaseDirectorMaxTokens], 'one call, the showcase allowance, no repair');
  seen.length = 0; await AI.direct(Object.assign({}, input, { premiumArc: null }), { limits: Object.assign({}, L, { repairs: 1 }), call });
  assert.equal(seen[0], L.directorMaxTokens); assert.equal(seen.length, 2, 'a standard direction keeps its bounded repair');
});

// ================================================================ 12. the real server (Higgsfield and the models mocked)
async function withServer(env, fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sr-premium-arc-'));
  const e = Object.assign({ SITEREMADE_BACKEND: 'local', SITEREMADE_DB_PATH: path.join(dir, 'app.db'), SITEREMADE_ASSET_STORE_DIR: path.join(dir, 'assets'), SITEREMADE_EXPORTS_DIR: path.join(dir, 'exports'), SITEREMADE_PREMIUM_LOG_DIR: path.join(dir, 'p'), ANTHROPIC_API_KEY: 'test-only', OPENAI_API_KEY: '', STRIPE_SECRET_KEY: '', SITEREMADE_TRIAL_CREDITS: '50', MOCK_CALL_LOG: path.join(dir, 'calls.log'), NODE_ENV: 'test', HIGGSFIELD_API_KEY: 'hf-test-key:secret', HIGGSFIELD_VIDEO_ENDPOINT: 'https://api.higgsfield.ai/kling-video/v3.0/4k/image-to-video' }, env);
  const s = await startServer(e); const call = client(s.port);
  await call('POST', '/api/auth/signup', { email: `pa-${process.pid}-${Date.now()}@example.com`, password: 'correct-horse-battery-staple' });
  try { await fn({ call, calls: () => providerCalls(e.MOCK_CALL_LOG) }); } finally { await s.stop(); fs.rmSync(dir, { recursive: true, force: true }); }
}
const SHOWCASE = 'A showcase build for an imaginary chrome surfer called the Drifter, with three premium videos';
const up = (id, title) => ({ id, origin: 'upload', title, mime: 'image/png', dataUrl: mockPng(id, '16:9-hd') });
const sources = [up('main', 'the drifter'), up('world', 'deep space')];
// (the generator's Creative Showcase mode: three premium videos from two suitable uploads)
const SHOWCASE_MODE = { on: true, moments: 3, eligibleUploads: 2 };
async function begin(call) {
  const ask = await call('POST', '/api/creative/research', { brief: SHOWCASE, premium: SHOWCASE_MODE });
  const r = ask.body.needsConfirmation ? await call('POST', '/api/creative/research', { brief: SHOWCASE, premium: SHOWCASE_MODE, quoteId: ask.body.quote.id }) : ask;
  await call('POST', '/api/creative/plan', { brief: SHOWCASE, jobId: r.body.jobId, understanding: r.body.understanding, facts: [], supplied: {}, assets: [], thumbnails: [] });
  return { ask, r };
}
const arcBody = [{ role: 'hero', asset: 'main' }, { role: 'takeover', asset: 'world' }, { role: 'payoff', asset: 'main' }];
test('12. server: a showcase brief -> one quote with three premium lines -> all reserved -> three clips, one submit each, each charged only because it was delivered; a failed one is returned', async () => {
  await withServer({}, async ({ call, calls }) => {
    const { ask, r } = await begin(call);
    assert.deepEqual(ask.body.quote.items.filter(i => /^premium_/.test(i.code)).map(i => i.role), ['hero', 'takeover', 'payoff']);
    assert.equal(ask.body.quote.credits, 42); assert.equal(r.body.creditsRemaining, 8, 'the whole quote is reserved first');
    const p = await premiumRun(call, { jobId: r.body.jobId, brief: SHOWCASE, heroAsset: 'main', premiumArc: arcBody, assets: sources });
    assert.equal(p.body.ok, true, JSON.stringify(p.body).slice(0, 400));
    assert.deepEqual(p.body.premium.deliveredRoles, ['hero', 'takeover', 'payoff']); assert.equal(p.body.creditsCharged, 36); assert.equal(p.body.creditsRefunded, 0);
    assert.deepEqual(p.body.assets.map(a => [a.role, a.sourceAssetId]), [['hero', 'main'], ['takeover', 'world'], ['payoff', 'main']]);
    assert.equal(calls().filter(c => c.provider === 'higgsfield' && /image-to-video$/.test(c.endpoint)).length, 3, 'three, never more, never retried');
    assert.equal(p.body.premium.status.message, 'Premium videos ready');
  });
  await withServer({ MOCK_HIGGSFIELD: 'fail-2' }, async ({ call, calls }) => {
    const { r } = await begin(call);
    const p = await premiumRun(call, { jobId: r.body.jobId, brief: SHOWCASE, heroAsset: 'main', premiumArc: arcBody, assets: sources });
    assert.deepEqual(p.body.premium.deliveredRoles, ['hero', 'payoff']); assert.equal(p.body.creditsCharged, 24); assert.equal(p.body.creditsRefunded, 12, 'the failed takeover\'s 12 come back');
    assert.equal(calls().filter(c => c.provider === 'higgsfield' && /image-to-video$/.test(c.endpoint)).length, 3, 'no retry of the failed one');
    assert.ok(p.body.premium.skipped.some(s => s.role === 'takeover'));
  });
});
