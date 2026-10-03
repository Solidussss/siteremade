'use strict';
// CREATIVE, ASSET-FIRST: one pool of pictures (discovered + uploaded + picked, the logo kept apart), the main picture that
// leads, a visual plan made before any words, words that answer the picture they sit beside, image-driven colour, a
// premium hero video planned before it exists and shown unmistakably when it does, and a weak search that still makes a
// picture-led page. Mock providers only ($0).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const POOL = require('../lib/creative/pool');
const PAL = require('../lib/creative/palette');
const ART = require('../lib/creative/art');
const D2 = require('../lib/creative/director2');
const AI = require('../lib/creative/ai');
const { validatePlan2 } = require('../lib/creative/validate2');
const { renderCreative2 } = require('../lib/creative/render2');
const { cleanAsset } = require('../lib/creative/store');
const { startServer, client, providerCalls } = require('./helpers/server-process');
const { mockPng } = require('./helpers/mock-image');

// ---------------------------------------------------------------- fixtures: pictures as the studio measures them
const A = (id, extra) => Object.assign({ id, origin: 'upload', title: id, relevance: 2, mime: 'image/png', assetRef: 'a'.repeat(64), caps: { moveFreely: false, frame: true, backdrop: true, heroSize: true } }, extra);
const ms = (w, h, bg, cols, subject, more) => Object.assign({ width: w, height: h, aspect: +(w / h).toFixed(3), orientation: w > h * 1.15 ? 'landscape' : h > w * 1.15 ? 'portrait' : 'square', background: { colour: bg, uniformity: 0.7, tolerance: 60 }, colours: cols, subject, luminance: 110, transparent: false }, more || {});
const SUNSET = A('r1', { origin: 'research', title: 'Kart racing at sunset', license: 'CC BY 4.0', pageUrl: 'https://example.org/sunset', author: 'Example', curation: { role: 'subject', identity: 'exact', depicts: 'a kart racing on the track at sunset', issues: [] }, assess: ms(1600, 900, '#7a1f0a', ['#2a0d05', '#c85413', '#e76917'], null, { background: { colour: '#7a1f0a', uniformity: 0.17, tolerance: 70 } }) });
const AIR = A('u1', { title: 'airborne kart', ownerRole: 'main', assess: ms(1600, 1000, '#0b2f8a', ['#e8e8e8', '#101010', '#2ea4fb'], [0.5, 0.2, 0.82, 0.55]) });
const LINEUP = A('u2', { title: 'starting lineup', assess: ms(1600, 900, '#5a0410', ['#c81328', '#ffe14d', '#3dd6ff'], [0.05, 0.4, 0.9, 0.75]) });
const BOX = A('u3', { title: 'item box', assess: ms(1200, 1200, '#f5f5f5', ['#23c35d', '#fed300', '#0a5b29'], [0.32, 0.32, 0.68, 0.68], { background: { colour: '#f5f5f5', uniformity: 1, tolerance: 24 } }) });
const BOXCUT = A('c-u3', { origin: 'derived', cutout: true, cutoutOf: 'u3', title: 'item box', assess: ms(488, 488, '#ffffff', ['#23c35d', '#fed300', '#0a5b29'], [0.05, 0.05, 0.95, 0.95], { transparent: true, background: { colour: '#ffffff', uniformity: 0, tolerance: 24 } }), caps: { moveFreely: true } });
const LOGO = A('lg', { title: 'zoomkart logo', ownerRole: 'logo', relevance: 0, assess: ms(480, 160, '#ffffff', ['#ff3b30', '#ffffff', '#ffd60a'], [0.02, 0.12, 0.94, 0.88], { transparent: true }) });
const ASSETS = [SUNSET, AIR, LINEUP, BOX, BOXCUT, LOGO];
const byId = new Map(ASSETS.map(a => [a.id, a]));
const base = id => (byId.get(id) || {}).cutoutOf || id;
const UND = { kind: 'recognizable', subject: 'ZoomKart', name: 'ZoomKart', brief: 'A playful page about ZoomKart, a kart racing game', tone: { register: 'playful' }, identity: { name: 'ZoomKart', kind: 'recognizable', what: 'a kart racing video game' }, visuals: { main: 'karts racing' } };
const FACTS = [{ id: 'f1', text: 'ZoomKart is a kart racing game.', section: 'x' }, { id: 'f2', text: 'Players race karts and use items.', section: 'x' }];
function page(seed, assets, extra) {
  const as = assets || ASSETS;
  const { plan, recipe } = D2.direct(Object.assign({ understanding: UND, research: { page: null, facts: FACTS }, assets: as, supplied: { facts: [], memories: [] }, seed, mainAsset: 'u1' }, extra || {}));
  const v = validatePlan2(plan, Object.assign({ assets: as, facts: FACTS, understanding: UND, art: recipe, mainAsset: 'u1' }, (extra && extra.ctx) || {}));
  assert.deepEqual(v.errors, []); return Object.assign(v, { recipe });
}
const SEEDS = ['1', '2', '3', '4', '5', '6', '7', '8'];
const shown = (P, i) => P.scenes[i].layers.filter(L => L.kind === 'image').map(L => L.asset).concat(P.actor && i >= P.actor.from && i <= P.actor.to ? [P.actor.asset] : []);
// (what a page shows ONCE: its pictures, without the closing scene's one marked callback -- the image ledger's only
// exception, at most one, in the last scene)
const once = (P, i) => (P.actor && i > P.actor.from && i <= P.actor.to ? [] : P.scenes[i].layers.filter(L => L.kind === 'image' && !L.callback).map(L => L.asset).concat(P.actor && i === P.actor.from ? [P.actor.asset] : []));
const callbacksOk = P => { const cb = P.scenes.flatMap((s, i) => s.layers.filter(L => L.callback).map(() => i)); return cb.length <= 1 && cb.every(i => i === P.scenes.length - 1); };
const html = (P, extra) => renderCreative2(P, (extra && extra.assets) || ASSETS, Object.assign({ mode: 'export', src: a => `${a.id}.png` }, extra || {}));

// ================================================================ 1. one pool
test('1. one pool: discovered and uploaded pictures together -- neither replaces the other; the logo and duplicates are kept apart, with reasons', () => {
  const pool = POOL.build(ASSETS, { mainAsset: 'u1' });
  assert.deepEqual(pool.pictures.map(p => p.id).sort(), ['r1', 'u1', 'u2', 'u3']);
  assert.deepEqual(pool.counts, { discovered: 1, uploaded: 3, picked: 0, premium: 0, total: 4 });
  assert.equal(pool.logo, 'lg'); assert.match(pool.excluded.find(x => x.id === 'lg').reason, /logo/);
  assert.equal(pool.pictures.find(p => p.id === 'u3').cut, 'c-u3', 'a picture and its cut-out are one picture');
  // an upload of a picture discovery also found is one picture (the owner's copy is kept)
  const twin = A('r9', { origin: 'research', curation: { role: 'subject', identity: 'exact', depicts: 'x', issues: [] }, assess: AIR.assess });
  const p2 = POOL.build(ASSETS.concat([twin]), {}); assert.ok(!p2.pictures.some(p => p.id === 'r9')); assert.match(p2.excluded.find(x => x.id === 'r9').reason, /same picture as u1/);
  // a discovered picture the check found unrelated is left out with the reason; an upload never is
  const off = A('r8', { origin: 'research', curation: { role: 'unrelated', identity: 'other', depicts: 'a logo of a bank', issues: [] }, assess: SUNSET.assess });
  const offUp = A('u8', { curation: { role: 'unrelated', identity: 'other', depicts: '?', issues: [] }, assess: LINEUP.assess });
  const p3 = POOL.build([off, offUp, AIR], {}); assert.deepEqual(p3.pictures.map(p => p.id).sort(), ['u1', 'u8']); assert.match(p3.excluded[0].reason, /does not show the subject/);
  // a personal page shows only the owner's own photos
  assert.deepEqual(POOL.build(ASSETS, { personal: true }).pictures.map(p => p.id).sort(), ['u1', 'u2', 'u3']);
});

// ================================================================ 2. every picture on the page, none as filler, the logo never
test('2. with 1 discovered + 3 uploads every picture is used ONCE, the logo never appears in a scene, and a scene past the pictures is carried by its words', () => {
  SEEDS.forEach(seed => {
    const P = page(seed).plan; const all = P.scenes.flatMap((s, i) => once(P, i)).map(base); assert.ok(callbacksOk(P), 'at most one callback, in the closing scene'); const used = new Set(all);
    assert.deepEqual([...used].sort(), ['r1', 'u1', 'u2', 'u3'], `${P.art.recipe}: every picture in the pool is used`);
    assert.equal(all.length, used.size, `${P.art.recipe}: each picture appears once (the image ledger) -- ${all.join(',')}`);
    assert.ok(!used.has('lg'), 'the logo is never a scene picture');
    assert.ok(shown(P, 0).length, `${P.art.recipe}: the opening shows a picture`);
    P.scenes.forEach((s, i) => assert.ok(shown(P, i).length || s.text.heading || s.text.body || s.text.items.length, `${P.art.recipe}: scene ${i + 1} (${s.layout}) has a picture or words`));
  });
  // the director putting the logo in a scene is corrected
  const raw = JSON.parse(JSON.stringify(page('1').plan)); raw.scenes[1].layers.unshift({ kind: 'image', role: 'focal', asset: 'lg', box: { d: [0, 0, 50, 50], m: [0, 0, 50, 50] } });
  const v = validatePlan2(raw, { assets: ASSETS, facts: FACTS, understanding: UND });
  assert.ok(!v.plan.scenes[1].layers.some(L => L.asset === 'lg')); assert.ok(v.fixes.some(f => /is the logo -- shown in the header/.test(f)));
  // and an owner's upload is never removed because a model thought it did not match
  const raw2 = JSON.parse(JSON.stringify(page('2').plan)); raw2.assetNotes = [{ asset: 'u2', depicts: 'not sure', matches: 'no' }];
  const at = raw2.scenes.findIndex(s => s.layers.some(L => L.asset === 'u2'));
  assert.ok(validatePlan2(raw2, { assets: ASSETS, facts: FACTS, understanding: UND }).plan.scenes[at].layers.some(L => L.asset === 'u2'));
});

// ================================================================ 3. the main picture matters
test('3. the chosen main picture leads the opening, anchors the continuity, closes the page -- and an invalid one says why', () => {
  SEEDS.forEach(seed => {
    const P = page(seed).plan;
    assert.ok(shown(P, 0).map(base).includes('u1'), `${P.art.recipe}: the main picture opens the page`);
    assert.equal(base(P.timeline.continuity.hero.asset), 'u1', 'the continuity hero is the main picture');
    assert.ok(!['text', 'takeover', 'dense', 'giant-type', 'brutalist'].includes(P.scenes[0].layout), `a picture-led opening, not ${P.scenes[0].layout}`);
  });
  const pool = POOL.build(ASSETS, { mainAsset: 'u1' }); assert.deepEqual(pool.main, { id: 'u1', cut: null, reason: '', chosen: true });
  const tiny = A('u5', { assess: ms(200, 150, '#123456', ['#ff0000', '#00ff00', '#0000ff'], null) });
  const p2 = POOL.build(ASSETS.concat([tiny]), { mainAsset: 'u5' }); assert.equal(p2.main.chosen, false); assert.match(p2.mainReason, /too small to lead a page \(200x150 px\)/);
  assert.match(POOL.build(ASSETS, { mainAsset: 'lg' }).mainReason, /marked as the logo/);
  assert.match(POOL.build(ASSETS, { mainAsset: 'gone' }).mainReason, /no longer in the project/);
});

// ================================================================ 4. the visual plan comes first
test('4. the visual plan is made before the words: each scene\'s picture, every picture shown before any repeats, the page closing on its main picture', () => {
  const rec = ART.choose({ understanding: UND, assets: ASSETS, facts: FACTS, seed: '3', mainAsset: 'u1' });
  const vis = rec.scenes.map(s => s.visual).filter(Boolean);
  assert.ok(vis.length >= rec.scenes.length - 1);
  assert.equal(vis[0].base, 'u1'); assert.equal(vis[0].relation, 'opens');
  const firstRepeat = vis.findIndex((v, i) => vis.slice(0, i).some(w => w.base === v.base));
  const firstShown = new Set(vis.slice(0, firstRepeat < 0 ? vis.length : firstRepeat).map(v => v.base));
  assert.equal(firstShown.size, firstRepeat < 0 ? new Set(vis.map(v => v.base)).size : 4, 'every picture before any repeat');
  assert.equal(rec.pool.counts.total, 4); assert.equal(rec.pool.logo, 'lg');
  // the director is handed the plan: each scene's picture, the pool, and asked to fill scene.visual before its words
  const content = AI.directContent ? null : null; void content;
  const text = require('../lib/creative/ai').DIRECTOR_SYSTEM;
  assert.match(text, /VISUALS FIRST/); assert.match(text, /FIRST fill scene\.visual/); assert.match(text, /THEN write the scene's words from that picture/);
  assert.ok(AI.DIRECTOR_TOOL.input_schema.properties.scenes.items.properties.visual, 'scene.visual is part of the plan');
});

// ================================================================ 5. words answer the picture
test('5. the words answer the picture beside them: a note for a picture the scene does not show is dropped; a dropped described picture is put back', () => {
  const P = page('4').plan;
  P.scenes.forEach((s, i) => { if (s.visual) { assert.ok(shown(P, i).includes(s.visual.asset), 'the note is about a picture the scene shows'); assert.ok(POOL.INTENTS.includes(s.visual.intent)); assert.match(s.visual.palette, /^#[0-9a-f]{6}$|^$/); } });
  // a director note about a picture the scene does not show: dropped (the colour is always measured, never taken)
  const raw = JSON.parse(JSON.stringify(P)); const k = raw.scenes.findIndex((s, i) => i > 0 && s.visual && !shown(P, i).includes('r1'));
  raw.scenes[k].visual = { asset: 'r1', subject: 'the sunset', moment: 'golden hour', intent: 'celebrate', relation: 'shifts' };
  const v = validatePlan2(raw, { mode: 'safety', assets: ASSETS, facts: FACTS, understanding: UND });
  assert.notEqual(v.plan.scenes[k].visual.subject, 'the sunset');
  // on acceptance, words written for a picture the composition left out bring that picture back
  const raw2 = JSON.parse(JSON.stringify(page('5').plan)); const j = raw2.scenes.findIndex((s, i) => i > 0 && !s.layers.some(L => base(L.asset) === 'u2') && !(raw2.actor && i >= raw2.actor.from && i <= raw2.actor.to));
  raw2.scenes[j].visual = { asset: 'u2', subject: 'starting lineup', moment: 'the grid', intent: 'roster', relation: 'shifts' }; raw2.scenes[j].layers = [];
  const v2 = validatePlan2(raw2, { assets: ASSETS, facts: FACTS, understanding: UND, art: page('5').recipe });
  assert.ok(v2.plan.scenes[j].layers.some(L => base(L.asset) === 'u2'), JSON.stringify(v2.plan.scenes[j].layers.map(L => L.asset)));
  assert.equal(v2.plan.scenes[j].visual.subject, 'starting lineup');
  // a saved page reopens unchanged (the note is kept, never invented on reopening)
  assert.deepEqual(validatePlan2(v2.plan, { mode: 'safety', assets: ASSETS, facts: FACTS, understanding: UND }).plan, v2.plan);
});

// ================================================================ 6. image-driven colour
test('6. colour comes from the pictures: each scene\'s surface is its picture\'s hue, the gaps between them blend, a premium hero\'s colour carries on', () => {
  assert.equal(PAL.identity(AIR).hex, '#0b2f8a', 'a sky fills the frame: its colour, not the kart\'s white');
  assert.equal(PAL.identity(BOX).hex, '#23c35d', 'on a plain studio background: the subject\'s colour');
  assert.equal(PAL.identity(SUNSET).hex, '#c85413', 'a busy picture: its most prominent vivid colour (the sunset orange)');
  const dark = { bg: '#101014' }; const blue = PAL.hsl(PAL.tone('#0b2f8a', dark)), red = PAL.hsl(PAL.tone('#5a0410', dark));
  assert.ok(Math.abs(blue.h - PAL.hsl('#0b2f8a').h) < 0.03 && Math.abs(red.h - PAL.hsl('#5a0410').h) < 0.03, 'each tone keeps its picture\'s hue');
  assert.ok(PAL.lum(PAL.tone('#0b2f8a', dark)) < 0.06, 'deep enough for light words on a dark page');
  const t = PAL.sceneTones(4, dark, ['#0b2f8a', '', '', '#c81328']);
  assert.ok(PAL.distance(t[1], t[0]) > 0 && PAL.distance(t[2], t[3]) < PAL.distance(t[1], t[3]), 'a scene without a picture sits between its neighbours');
  const withHero = PAL.sceneTones(3, dark, ['#c81328', '#c81328', '#c81328'], { hero: '#1a7adf' });
  assert.ok(PAL.hsl(withHero[0]).h > 0.5 && PAL.distance(withHero[1], withHero[2]) > 0, 'the hero\'s cast leads and fades');
  // on the page: the surfaces follow the pictures, scene by scene
  SEEDS.slice(0, 4).forEach(seed => {
    const P = page(seed).plan;
    // (a page with the brand's colour field -- look.js -- stands a free subject, a cut-out, on one of the brand's colours;
    // a photograph keeps its own world)
    const field = P.look && P.look.devices.includes('colour-field') ? [P.look.brand.primary, P.look.brand.light, P.look.brand.deep] : [];
    const byIdP = new Map(ASSETS.map(a => [a.id, a])); const freeOnly = s => s.layers.filter(L => L.kind === 'image').every(L => (byIdP.get(L.asset) || {}).cutout);
    P.scenes.forEach(s => { if (s.background === 'base' && field.includes(s.ink.surface)) { assert.ok(freeOnly(s), `${s.id}: only a free subject stands on a brand field`); return; } if (!s.visual || !s.visual.palette || s.background !== 'base') return; assert.ok(Math.abs(PAL.hsl(s.ink.surface).h - PAL.hsl(s.visual.palette).h) < 0.08 || PAL.describe(s.visual.palette).neutral, `${P.art.recipe}: ${s.id} ${s.ink.surface} follows ${s.visual.palette}`); });
  });
  const h = html(page('1').plan);
  assert.match(h, /<html[^>]* data-flowall/, 'one continuous surface'); assert.match(h, /html\.cr-js\[data-flowall\]:not\(\[data-motion="reduced"\]\) \.sc\{background:transparent!important\}/);
  assert.match(h, /if\(red\|\|\(!castEls\.length&&!seamEls\.length&&!cb\)\)return;/, 'the colour flows even on a page with no cast'); assert.match(h, /setProperty\('--cbc',a\)/);
});

// ================================================================ 7. logo
test('7. the logo: top-left in the header, its own proportions, never a scene picture; kept through save, reopen and export', () => {
  const P = page('2').plan; assert.deepEqual(P.logo, { asset: 'lg' });
  const h = html(P);
  assert.match(h, /<header class="cr-nav"><a class="cr-brand cr-brand-logo" href="#top"><img class="cr-logo" src="lg\.png" alt="ZoomKart" width="480" height="160"/);
  assert.match(h, /\.cr-logo\{display:block;height:34px;width:auto;max-width:min\(220px,42vw\);object-fit:contain\}/); assert.match(h, /@media \(max-width:720px\)\{\.cr-logo\{height:28px/);
  assert.ok(!/<img class="ly-img" data-asset="lg"/.test(h), 'not in any scene');
  // without a logo: the name, as before
  const noLogo = ASSETS.filter(a => a.id !== 'lg'); const P2 = page('2', noLogo).plan; assert.equal(P2.logo, undefined);
  assert.match(html(P2, { assets: noLogo }), /<a class="cr-brand" href="#top">ZoomKart<\/a>/);
  // the logo travels with the saved assets (its role kept) and the plan keeps it on reopening
  assert.equal(cleanAsset(Object.assign({}, LOGO)).ownerRole, 'logo');
  assert.deepEqual(validatePlan2(P, { mode: 'safety', assets: ASSETS, facts: FACTS, understanding: UND }).plan.logo, { asset: 'lg' });
});

// ================================================================ 8. premium hero video
test('8. a premium hero video: planned from the main picture before it exists; shown large in the opening; the colours retuned to it once delivered', () => {
  const P = page('3', null, { premium: { video: true, intent: 'cinematic_hero', source: 'u1' }, ctx: { premiumHero: { intent: 'cinematic_hero', source: 'u1' } } }).plan;
  assert.deepEqual(P.premiumMedia.map(m => [m.intent, m.asset]), [['cinematic_hero', 'u1']], 'pinned to the planned source');
  assert.equal(P.timeline.continuity.hero.video, true);
  assert.ok(['editorial-hero', 'cinematic', 'image', 'splitscreen', 'split'].includes(P.scenes[0].layout), `a composition that shows a moving picture large (${P.scenes[0].layout})`);
  const withVideo = ASSETS.map(a => (a.id === 'u1' ? Object.assign({}, a, { video: { mediaId: 'pm_qa_000001', assetRef: 'b'.repeat(64), mime: 'video/mp4', intent: 'cinematic_hero' } }) : a));
  const h = html(P, { assets: withVideo, videoSrc: a => (a.video ? `${a.id}.mp4` : '') });
  assert.match(h, /<html[^>]* data-premium="video"/); assert.match(h, /<video class="(ly-vid|shv-vid)"[^>]*src="u1\.mp4"/);
  assert.match(h, /<section class="sc cr-hero"[^>]*data-vh="/, 'it hands over to the page as the hero leaves');
  assert.ok(!/class="ca" data-depth="front" data-role="typography"/.test(h), 'nothing crosses in front of the video');
  // a hero shown as a cut-out: the video plays full-bleed behind it (a cut-out frame would hide it)
  const P2 = JSON.parse(JSON.stringify(P)); const f = P2.scenes[0].layers.find(L => L.role === 'focal'); f.asset = 'c-u3';
  P2.timeline.continuity.hero.asset = 'c-u3'; P2.premiumMedia = [{ intent: 'cinematic_hero', asset: 'u3', subject: '', why: '' }];
  const box = ASSETS.map(a => (a.id === 'u3' ? Object.assign({}, a, { video: { mediaId: 'pm_qa_000002', assetRef: 'c'.repeat(64), mime: 'video/mp4' } }) : a));
  assert.match(html(P2, { assets: box, videoSrc: a => (a.video ? `${a.id}.mp4` : '') }), /<div class="sc-herovid" aria-hidden="true"><img class="shv-still" src="u3\.png" alt=""><video class="shv-vid" src="u3\.mp4"/);
  // delivered: its measured cast becomes the opening's colour and carries on; it is saved with the page
  const before = P.scenes.map(s => s.ink.surface);
  const tuned = validatePlan2(PAL.retune(P, '#1a7adf'), { mode: 'safety', assets: withVideo, facts: FACTS, understanding: UND }).plan;
  assert.equal(tuned.timeline.continuity.hero.cast, '#1a7adf'); assert.notEqual(tuned.scenes[0].ink.surface, before[0]);
  assert.ok(Math.abs(PAL.hsl(tuned.scenes[0].ink.surface).h - PAL.hsl('#1a7adf').h) < 0.05, 'the opening takes the video\'s colour');
  assert.equal(cleanAsset(withVideo.find(a => a.id === 'u1')).video.mediaId, 'pm_qa_000001');
  assert.equal(cleanAsset(Object.assign({}, withVideo.find(a => a.id === 'u1'), { video: Object.assign({}, withVideo.find(a => a.id === 'u1').video, { cast: '#1A7ADF' }) })).video.cast, '#1a7adf');
});

// ================================================================ 9. weak discovery
test('9. a weak search (one picture, or one + one upload) still makes a page led by its picture: shown once, never repeated as filler -- the other scenes are carried by words and colour', () => {
  for (const set of [[SUNSET], [SUNSET, BOX, BOXCUT]]) {
    const n = new Set(set.map(a => base(a.id))).size;
    SEEDS.forEach(seed => {
      const P = page(seed, set, { mainAsset: null }).plan; const all = P.scenes.flatMap((s, i) => once(P, i)).map(base); assert.ok(callbacksOk(P), 'at most one callback, in the closing scene');
      assert.ok(shown(P, 0).length, `${P.art.recipe}: the opening shows the picture`);
      assert.equal(all.length, new Set(all).size, `${P.art.recipe}: no picture repeated (${all.join(',')})`); assert.ok(new Set(all).size <= n);
      P.scenes.forEach(s => assert.ok(!P.scenes.some(x => x !== s) || s.text.heading || s.layers.length));
    });
  }
  // (the saved pages made before the ledger keep the old allowance when they are reopened: validate2 safety)
  assert.equal(POOL.photoUses(1), 4); assert.equal(POOL.photoUses(2), 3); assert.equal(POOL.photoUses(5), 2);
});

// ================================================================ 10. the server, asset-first, mocked
test('10. server (mocked providers): pool -> premium source -> recipe + visual plan -> director -> continuity; the studio is told what the page was planned around', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sr-assetfirst-'));
  const env = { SITEREMADE_BACKEND: 'local', SITEREMADE_DB_PATH: path.join(dir, 'app.db'), SITEREMADE_ASSET_STORE_DIR: path.join(dir, 'assets'), SITEREMADE_EXPORTS_DIR: path.join(dir, 'exports'), SITEREMADE_PREMIUM_LOG_DIR: path.join(dir, 'p'), ANTHROPIC_API_KEY: 'test-only', OPENAI_API_KEY: '', STRIPE_SECRET_KEY: '', SITEREMADE_TRIAL_CREDITS: '40', MOCK_CALL_LOG: path.join(dir, 'calls.log'), NODE_ENV: 'test', HIGGSFIELD_API_KEY: 'hfkeyid_t:hfsecret_t', HIGGSFIELD_VIDEO_ENDPOINT: 'https://api.higgsfield.ai/kling-video/v3.0/4k/image-to-video', MOCK_DIRECTOR: 'follow' };
  const s = await startServer(env); const call = client(s.port);
  try {
    await call('POST', '/api/auth/signup', { email: `af-${process.pid}-${Date.now()}@example.com`, password: 'correct-horse-battery-staple' });
    const brief = 'A page about ZoomKart, our kart racing game: high energy, with a cinematic hero video';
    // (the generator's Creative + Cinematic Hero mode)
    const mode = { on: true, moments: 1, eligibleUploads: 2 };
    let r = await call('POST', '/api/creative/research', { brief, hasUploads: 4, premium: mode }); if (r.body.needsConfirmation) r = await call('POST', '/api/creative/research', { brief, hasUploads: 4, premium: mode, quoteId: r.body.quote.id });
    const p = await call('POST', '/api/creative/plan', { brief, jobId: r.body.jobId, understanding: r.body.understanding, facts: [], supplied: {}, assets: ASSETS.map(a => Object.assign({}, a, { assetRef: undefined })), thumbnails: [], mainAsset: 'u1', seed: 'af1' });
    assert.equal(p.body.ok, true, JSON.stringify(p.body).slice(0, 300));
    const vp = p.body.visualPlan;
    assert.deepEqual(vp.counts, { discovered: 1, uploaded: 3, picked: 0, premium: 0, total: 4 });
    assert.deepEqual(vp.used.sort(), ['r1', 'u1', 'u2', 'u3'], 'discovered and uploaded pictures both on the page');
    assert.deepEqual(vp.main, { id: 'u1', chosen: true }); assert.equal(vp.logo, 'lg');
    assert.deepEqual([vp.premiumHero.intent, vp.premiumHero.source], ['cinematic_hero', 'u1'], 'the premium video starts from the main picture');
    const plan = p.body.plan; assert.deepEqual(plan.logo, { asset: 'lg' }); assert.equal(plan.premiumMedia[0].asset, 'u1');
    // the (mock) director wrote each scene's words for its planned picture; they match what the scene shows
    const words = { u1: /Launch|ZoomKart/, u2: /grid/i, u3: /box/i, r1: /sunset/i };
    plan.scenes.forEach(sc => { const a = sc.visual && base(sc.visual.asset); if (a) assert.match(sc.text.heading, words[a], `${sc.id}: "${sc.text.heading}" beside ${a}`); });
    assert.equal(providerCalls(env.MOCK_CALL_LOG).filter(c => c.provider === 'higgsfield').length, 0, 'planning never calls Higgsfield');
    // a main picture that may not be transformed (picked from the web: Higgsfield uses uploads only): the video starts from the next eligible upload, and says why
    const picked = ASSETS.map(a => (a.id === 'u1' ? Object.assign({}, a, { ownerPicked: true, pageUrl: 'https://shop.example/kart' }) : Object.assign({}, a))).map(a => Object.assign(a, { assetRef: undefined }));
    let r2 = await call('POST', '/api/creative/research', { brief: brief + ' again', hasUploads: 4, premium: mode }); if (r2.body.needsConfirmation) r2 = await call('POST', '/api/creative/research', { brief: brief + ' again', hasUploads: 4, premium: mode, quoteId: r2.body.quote.id });
    const p2 = await call('POST', '/api/creative/plan', { brief: brief + ' again', jobId: r2.body.jobId, understanding: r2.body.understanding, facts: [], supplied: {}, assets: picked, thumbnails: [], mainAsset: 'u1', seed: 'af2' });
    assert.equal(p2.body.ok, true); assert.notEqual(p2.body.visualPlan.premiumHero.source, 'u1');
    assert.match(p2.body.visualPlan.premiumHero.note, /the main picture is not used for the video: a web picture you picked -- premium video uses uploaded images only/);
  } finally { await s.stop(); fs.rmSync(dir, { recursive: true, force: true }); }
});
