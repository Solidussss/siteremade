'use strict';
// THE ASSET DIRECTOR (lib/creative/asset-director.js): which pictures a Creative page is built from -- the smallest
// strong, coherent set, its hero, actor, detail and 3D / cinematic sources -- decided before the pool, the visual plan
// and every composition, from what the studio measured and the picture check saw. Fixtures A-P are the benchmark cases;
// the six subjects are the "already right: no change" cases. Nothing here reaches a provider: the one optional look at the
// shortlist is a fake or the mock server.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const AD = require('../lib/creative/asset-director');
const POOL = require('../lib/creative/pool');
const D2 = require('../lib/creative/director2');
const AI = require('../lib/creative/ai');
const A2 = require('../lib/creative/assets');
const DISC = require('../lib/creative/discovery');
const { validatePlan2 } = require('../lib/creative/validate2');
const { SUBJECTS, IDS } = require('./helpers/creative-subjects');
const { startServer, client, providerCalls } = require('./helpers/server-process');

// ---------------------------------------------------------------- a candidate picture, as the studio would hold it
// pic(id, { w, h, origin, host, title, subject, bg, uni, cols, lum, sig, sharp, role, identity, depicts, issues, framing, quality, separable })
const own = id => { let h = 7; for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0; const c = k => '#' + ((h >>> (k * 5)) & 0xffffff).toString(16).padStart(6, '0'); return [c(0), c(1), c(2)]; };
function pic(id, o) {
  const x = o || {}; const w = x.w || 1800, h = x.h || 1200;
  return Object.assign({ id, origin: x.origin || 'research', title: x.title || id, alt: x.alt || '', mime: 'image/jpeg',
    ...(x.host ? { pageUrl: `https://${x.host}/p/${x.file || id}`, sourceUrl: `https://${x.host}/img/${x.file || id}.jpg` } : x.origin === 'upload' ? {} : { pageUrl: `https://brand.example/${id}`, sourceUrl: `https://brand.example/i/${x.file || id}.jpg` }),
    assess: { width: w, height: h, aspect: +(w / h).toFixed(3), orientation: w > h * 1.15 ? 'landscape' : h > w * 1.15 ? 'portrait' : 'square', subject: x.subject === undefined ? [0.25, 0.2, 0.75, 0.85] : x.subject,
      background: { colour: x.bg || '#f2f2f2', uniformity: x.uni == null ? 0.4 : x.uni, tolerance: 30 }, colours: x.cols || own(id), luminance: x.lum || 130, transparent: !!x.transparent, ...(x.sig ? { sig: x.sig } : {}), ...(x.sharp != null ? { sharp: x.sharp } : {}) },
    caps: { moveFreely: !!x.transparent, frame: true, backdrop: w > h, heroSize: true },
    curation: { role: x.role || 'subject', identity: x.identity || 'exact', depicts: x.depicts || `the ${id}`, issues: x.issues || [], framing: x.framing || 'whole', quality: x.quality == null ? 3 : x.quality, separable: !!x.separable } },
  x.extra || {});
}
const ids = list => list.map(x => x.id).sort();
const rej = (d, id) => (d.rejected.find(x => x.id === id) || {}).reason || null;

// ================================================================ A-P: the benchmark cases
test('A. a strong hero among weak alternatives leads; the weak ones never open the page', () => {
  const set = [pic('strong', { w: 2400, h: 1600 }), pic('small', { w: 420, h: 300 }), pic('blurry', { sharp: 0.2 }), pic('cut', { framing: 'cropped', issues: ['cropped'], subject: [0, 0.1, 1, 1] })];
  const d = AD.decide(set, { want: 'the product' }); assert.equal(d.hero, 'strong');
  assert.match(rej(d, 'small'), /too small/); const P = new Map(d.profiles.map(p => [p.id, p]));
  assert.ok(P.get('strong').roles.hero > P.get('blurry').roles.hero && P.get('strong').roles.hero > P.get('cut').roles.hero);
});
test('B. the exact subject in low resolution beats the wrong subject in high resolution (lime soda is not orange soda)', () => {
  const set = [pic('lime', { w: 900, h: 700, depicts: 'a green lime soda can' }), pic('orange', { w: 4000, h: 2600, depicts: 'an orange soda can', identity: 'exact' })];
  const d = AD.decide(set, { want: 'a lime soda in a can' });
  assert.equal(d.hero, 'lime'); assert.match(rej(d, 'orange'), /another product.*orange, not lime/);
  // ...and a white sneaker is not a black leather loafer
  const s = AD.decide([pic('loafer', { w: 900, h: 700, depicts: 'a black leather loafer' }), pic('sneaker', { w: 3000, h: 2000, depicts: 'a white running sneaker' })], { want: 'a black leather loafer' });
  assert.equal(s.hero, 'loafer'); assert.match(rej(s, 'sneaker'), /another product/);
});
test('C. a clean white-background product is excellent; a marketplace listing is not -- presentation is penalised, not plain backgrounds', () => {
  const set = [pic('clean', { bg: '#ffffff', uni: 0.97, separable: true, subject: [0.2, 0.1, 0.8, 0.9] }), pic('listing', { host: 'amazon.com', title: 'Zorbo soda 12-pack - Buy now $19.99', bg: '#ffffff', uni: 0.97 }), pic('grid', { issues: ['collage'] })];
  const d = AD.decide(set, {}); assert.equal(d.hero, 'clean'); assert.ok(!rej(d, 'clean'));
  assert.match(rej(d, 'listing'), /marketplace/); assert.match(rej(d, 'grid'), /marketplace/);
  assert.ok(d.profiles.find(p => p.id === 'clean').roles.cutout >= 0.5, 'a clean isolated product is a cut-out candidate');
});
test('D. near-duplicates -- resized, mirrored, re-hosted, cropped -- collapse to the strongest copy', () => {
  const W = 120, H = 80; const img = { width: W, height: H, data: new Uint8Array(W * H * 4) };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = (y * W + x) * 4; const v = 128 + 100 * Math.sin(x / 13) * Math.cos(y / 9) + (Math.hypot(x - 80, y - 30) < 18 ? 60 : 0); img.data[i] = img.data[i + 1] = img.data[i + 2] = Math.max(0, Math.min(255, Math.round(v))); img.data[i + 3] = 255; }
  const sig = A2.assess(img).sig; assert.match(sig, /^[0-9a-f]{16}$/);
  const half = { width: 60, height: 40, data: new Uint8Array(60 * 40 * 4) }; for (let y = 0; y < 40; y++) for (let x = 0; x < 60; x++) { const s = ((y * 2) * W + x * 2) * 4, t = (y * 60 + x) * 4; for (let k = 0; k < 4; k++) half.data[t + k] = img.data[s + k]; }
  const flip = { width: W, height: H, data: new Uint8Array(W * H * 4) }; for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const s = (y * W + (W - 1 - x)) * 4, t = (y * W + x) * 4; for (let k = 0; k < 4; k++) flip.data[t + k] = img.data[s + k]; }
  assert.ok(AD.hamming(sig, A2.assess(half).sig) <= 10, 'a resized copy has (nearly) the same signature'); assert.ok(AD.hamming(AD.mirror(sig), A2.assess(flip).sig) <= 10, 'a mirrored copy is found');
  const set = [pic('orig', { w: 2400, h: 1600, sig, cols: ['#123456', '#abcdef', '#fedcba'] }), pic('resized', { w: 600, h: 400, sig: A2.assess(half).sig, cols: ['#123457', '#abcdee', '#fedcbb'] }),
    pic('mirror', { w: 2000, h: 1333, sig: A2.assess(flip).sig, cols: ['#223456', '#bbcdef', '#eedcba'] }), pic('rehost', { host: 'other.example', file: 'zorbo-hero', w: 1200, h: 800, cols: ['#111111', '#222222', '#333333'] }),
    pic('elsewhere', { host: 'third.example', file: 'zorbo-hero', w: 1000, h: 667, cols: ['#444444', '#555555', '#666666'] }), pic('crop', { w: 1500, h: 900, depicts: 'the red can on a bar counter', cols: ['#c0502e', '#f2f2f2', '#999999'] }), pic('crop2', { w: 900, h: 900, depicts: 'the red can on a bar counter', cols: ['#c0502e', '#f2f2f2', '#000000'] })];
  const d = AD.decide(set, {});
  assert.match(rej(d, 'resized'), /near-duplicate.*orig/); assert.match(rej(d, 'mirror'), /mirrored/); assert.match(rej(d, 'elsewhere'), /another site/); assert.match(rej(d, 'crop2'), /cropped or re-shot/);
  ['orig', 'rehost', 'crop'].forEach(id => assert.ok(!rej(d, id), `${id} kept as the stronger copy`));
});
test('E. generic stock loses to the exact subject (and to type when nothing exact exists)', () => {
  const set = [pic('exact', { depicts: 'the Orbitly timeline on a screen' }), pic('office', { host: 'unsplash.com', identity: 'related', depicts: 'smiling office team in a meeting' }), pic('laptop', { identity: 'related', depicts: 'a laptop on a desk' })];
  const d = AD.decide(set, {}); assert.equal(d.hero, 'exact'); assert.match(rej(d, 'office'), /generic stock/); assert.match(rej(d, 'laptop'), /generic stock/);
});
test('F. the 3D source is the clearest whole object among the eligible uploads -- never a cropped, busy one', () => {
  const set = [pic('clear', { origin: 'upload', w: 1600, h: 1600, uni: 0.95, separable: true, subject: [0.2, 0.1, 0.8, 0.9], sharp: 1 }), pic('hand', { origin: 'upload', w: 1600, h: 1600, framing: 'cropped', issues: ['cropped', 'busy'], subject: [0, 0, 1, 1], sharp: 0.5 })];
  const d = AD.decide(set, { mainAsset: 'hand' }); assert.equal(d.hero, 'hand', 'the owner\'s main picture still leads'); assert.equal(d.model3d, 'clear');
  // a web picture is never a 3D source, whatever its quality
  assert.equal(AD.decide([pic('web', { uni: 0.95, separable: true })], {}).model3d, null);
});
test('G. the cinematic source has room for the camera: a mid-size subject with headroom, never an edge-to-edge crop', () => {
  const set = [pic('room', { origin: 'upload', w: 2400, h: 1350, subject: [0.3, 0.2, 0.7, 0.85], sharp: 1 }), pic('edge', { origin: 'upload', w: 2400, h: 1350, framing: 'tight', subject: [0.02, 0.02, 0.98, 0.96], sharp: 1 })];
  const d = AD.decide(set, {}); assert.equal(d.cinematic, 'room');
  const P = new Map(d.profiles.map(p => [p.id, p])); assert.ok(P.get('room').roles.cinematic > P.get('edge').roles.cinematic);
});
test('H. the owner\'s pictures outrank found ones; a weak owner main still leads -- staged around, never replaced', () => {
  const d = AD.decide([pic('mine', { origin: 'upload', w: 1400, h: 1000 }), pic('better', { w: 4000, h: 2700 })], {}); assert.equal(d.hero, 'mine');
  const w = AD.decide([pic('weakmain', { origin: 'upload', w: 640, h: 480, framing: 'cropped', issues: ['cropped'] }), pic('strong', { w: 3000, h: 2000 })], { mainAsset: 'weakmain' });
  assert.equal(w.hero, 'weakmain'); assert.ok(w.notes.some(n => /owner's main picture is weak/.test(n))); assert.ok(!rej(w, 'weakmain'));
  // an owner picture is never rejected for quality
  const bad = AD.decide([pic('blur', { origin: 'upload', sharp: 0.1, issues: ['low-quality', 'watermark'] })], {}); assert.ok(!rej(bad, 'blur'));
});
test('I. a logo never competes with the hero: navigation and brand only -- not hero, actor, 3D or cinematic source', () => {
  const set = [pic('logo', { origin: 'upload', w: 3000, h: 3000, extra: { ownerRole: 'logo' }, uni: 1, separable: true }), pic('product', { w: 1600, h: 1100 })];
  const d = AD.decide(set, {}); assert.equal(d.hero, 'product'); ['actor', 'model3d', 'cinematic', 'detail'].forEach(r => assert.notEqual(d[r], 'logo'));
  assert.ok(!d.set.includes('logo')); assert.ok(d.notes.some(n => /logo/.test(n)));
  assert.equal(POOL.build(set, { director: d }).main.id, 'product');
});
test('J. one strong picture: scarcity is reported, and the page shows it at most twice (it opens and returns once)', () => {
  const set = [pic('only', { origin: 'upload', w: 2000, h: 1400 }), pic('junk', { host: 'shutterstock.com', issues: ['watermark'] }), pic('tiny', { w: 300, h: 200 })];
  const d = AD.decide(set, {}); assert.equal(d.hero, 'only'); assert.equal(d.scarce, true); assert.deepEqual(d.set, ['only']);
  assert.equal(POOL.photoUses(1, true), 2); assert.equal(POOL.photoUses(1), 4, '(without the asset director: as before)');
});
test('K. many strong pictures: the smallest set that covers the page, not all of them', () => {
  const set = Array.from({ length: 11 }, (_, i) => pic(`s${i}`, { w: 2000 + i * 10, h: 1300, cols: [`#${(i * 20 + 30).toString(16).padStart(2, '0')}5030`, '#f0f0f0', '#202020'], depicts: `the product, view ${i}` }));
  const d = AD.decide(set, {}); assert.ok(d.set.length <= 6, `set of ${d.set.length}`); assert.ok(d.rejected.filter(x => /not needed/.test(x.reason)).length >= 5);
});
test('L / M. an inconsistent set loses the picture whose light fights the rest; a coherent set keeps everything', () => {
  const warm = i => pic(`w${i}`, { cols: [`#d0${(0x80 + i).toString(16)}40`, '#f0c080', '#603010'], depicts: `the product ${i}` });
  const cold = pic('cold', { role: 'environment', identity: 'related', cols: ['#2050d0', '#80b0ff', '#102060'], depicts: 'a cold blue city street' });
  const L = AD.decide([warm(1), warm(2), warm(3), cold], {}); assert.match(rej(L, 'cold'), /clash/);
  const M = AD.decide([warm(1), warm(2), warm(3), pic('warmenv', { role: 'environment', identity: 'related', cols: ['#c07040', '#e0b080', '#503020'], depicts: 'a warm bar interior at dusk' })], {});
  assert.deepEqual(M.rejected, []);
});
test('N. watermarked pictures are left out -- by the picture check or by a stock library host', () => {
  const d = AD.decide([pic('ok'), pic('wm1', { issues: ['watermark'] }), pic('wm2', { host: 'gettyimages.com' })], {});
  assert.match(rej(d, 'wm1'), /watermarked/); assert.match(rej(d, 'wm2'), /watermarked/);
  // (a brand printed on the product itself is not contamination: nothing flags it)
  assert.ok(!rej(AD.decide([pic('can', { depicts: 'a red can with the Kolaro logo printed on it' })], {}), 'can'));
});
test('O. nothing clears the floor: no picture rather than a bad one -- the page is carried by type and colour', () => {
  const d = AD.decide([pic('wm', { issues: ['watermark'] }), pic('shop', { host: 'ebay.com' }), pic('thumb', { w: 240, h: 180 }), pic('other', { identity: 'other', depicts: 'a cat' })], {});
  assert.equal(d.hero, null); assert.deepEqual(d.set, []); assert.equal(d.scarce, true); assert.ok(d.notes.some(n => /no picture clears the floor/.test(n)));
  const pool = POOL.build([pic('wm', { issues: ['watermark'] }), pic('shop', { host: 'ebay.com' })], { director: d }); assert.equal(pool.pictures.length, 0); assert.equal(pool.main, null);
});
test('P. already right: on the six subjects the asset director changes nothing -- same hero, nothing rejected, same pages', () => {
  IDS.forEach(id => {
    const s = SUBJECTS[id]; const base = { understanding: s.understanding, research: { page: null, facts: s.facts }, assets: s.assets, supplied: { facts: [], memories: [] }, seed: '1', mainAsset: s.mainAsset };
    const on = D2.direct(base), off = D2.direct(Object.assign({}, base, { assetDirector: false }));
    const d = on.recipe.assetDirector; assert.deepEqual(d.rejected, [], id); assert.equal(d.replaced, null, `${id}: the existing hero stands`);
    assert.equal(on.recipe.pool.main && on.recipe.pool.main.id, off.recipe.pool.main && off.recipe.pool.main.id, id);
    // (the same page: only the recorded decision -- in the plan's art direction -- and the clock differ)
    const strip = p => Object.assign({}, p, { art: Object.assign({}, p.art, { assetDirector: undefined }), direction: Object.assign({}, p.direction, { at: undefined }) }); assert.equal(JSON.stringify(strip(on.plan)), JSON.stringify(strip(off.plan)), `${id}: the same page`);
  });
});

// ================================================================ the decision cannot be overridden by later stages
test('later stages never bring back a rejected picture: the director, validation and recomposition all respect the decision', () => {
  const s = SUBJECTS.beverage; const listing = pic('listing', { host: 'amazon.com', title: 'Kolaro cola - buy now $4.99', w: 3000, h: 3000, depicts: 'a red cola can' });
  const assets = s.assets.concat([listing]); const base = { understanding: s.understanding, research: { page: null, facts: s.facts }, assets, supplied: { facts: [], memories: [] }, seed: '2', mainAsset: s.mainAsset };
  const { plan, recipe } = D2.direct(base); assert.match(rej(recipe.assetDirector, 'listing'), /marketplace/);
  // a director that tries to use it anyway (as a model might): validation drops it
  const forced = JSON.parse(JSON.stringify(plan)); forced.scenes[1].layers.unshift({ id: 'sneak', kind: 'image', role: 'focal', asset: 'listing', box: { d: [10, 10, 40, 60], m: [5, 5, 90, 50] }, z: 4, rotate: 0, opacity: 1, mask: 'none', treatment: 'none', entrance: { kind: 'none', delay: 0, dur: 1 }, loop: { kind: 'none', amp: 1, period: 9 }, scroll: { kind: 'none', amount: 0.4 }, hideM: false, fit: 'cover', focus: '50% 50%' });
  const v = validatePlan2(forced, { assets, facts: s.facts, understanding: s.understanding, art: recipe, mainAsset: s.mainAsset });
  assert.deepEqual(v.errors, []); assert.ok(!JSON.stringify(v.plan.scenes).includes('"listing"')); assert.ok(v.fixes.some(f => /left out by the asset director/.test(f)));
  assert.equal(v.plan.assetDirector.v, AD.VERSION); assert.ok(v.plan.assetDirector.rejected.some(x => x.id === 'listing'));
  // a scene recomposed later (the structured and visual directors' repairs) keeps to the decision too
  const saved = validatePlan2(JSON.parse(JSON.stringify(v.plan)), { assets, facts: s.facts, understanding: s.understanding, mode: 'safety' }).plan; assert.equal(JSON.stringify(saved), JSON.stringify(v.plan), 'reopens unchanged');
  const r = AI.applyRepair(saved, { scene: 1, to: 'editorial-hero' }, Object.assign(AI.planContext({ assets, facts: s.facts, understandingLegacy: s.understanding, mainAsset: s.mainAsset }, {}), {}));
  if (r.ok) assert.ok(!JSON.stringify(r.plan.scenes).includes('"listing"'));
});
test('the record is versioned and is the only door: old pages reopen unchanged and are never rescored', () => {
  const LEGACY = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'creative', 'legacy-pre-direction.json'), 'utf8'));
  Object.entries(LEGACY).forEach(([id, plan]) => { const s = SUBJECTS[id]; const v = validatePlan2(JSON.parse(JSON.stringify(plan)), { assets: s.assets, facts: s.facts, understanding: s.understanding, mode: 'safety' }); assert.equal(JSON.stringify(v.plan), JSON.stringify(plan), id); assert.equal(v.plan.assetDirector, undefined); });
  const n = AD.normalise({ v: 9, source: 'magic', hero: 'a b', set: ['ok', '<x>'], rejected: [{ id: 'ok', reason: 'x'.repeat(500) }, { id: 'bad id' }], scarce: 'yes' });
  assert.equal(n.v, AD.VERSION); assert.equal(n.source, 'rules'); assert.equal(n.hero, null); assert.deepEqual(n.set, ['ok']); assert.equal(n.rejected.length, 1); assert.ok(n.rejected[0].reason.length <= 120); assert.equal(n.scarce, false);
  // a director's own plan cannot bring a record: only the art direction (the decision) writes one
  const s = SUBJECTS.software; const { plan, recipe } = D2.direct({ understanding: s.understanding, research: { page: null, facts: s.facts }, assets: s.assets, supplied: { facts: [], memories: [] }, seed: '1', mainAsset: s.mainAsset });
  const forged = Object.assign({}, plan, { assetDirector: { v: 1, hero: 'tablet', rejected: [{ id: 'app', reason: 'forged' }] } });
  const v = validatePlan2(forged, { assets: s.assets, facts: s.facts, understanding: s.understanding, art: Object.assign({}, recipe, { assetDirector: undefined }), mainAsset: s.mainAsset });
  assert.equal(v.plan.assetDirector, undefined);
});

// ================================================================ the one optional look, validated
test('the one optional model look: only when the rules are unsure, ids only, validated -- anything invalid leaves the rules standing', async () => {
  const set = [pic('a1', { w: 2000, h: 1300 }), pic('a2', { w: 2000, h: 1300, cols: ['#2050d0', '#80b0ff', '#102060'] }), pic('a3', { w: 900, h: 600, cols: ['#20a050', '#80ffb0', '#106020'] })];
  const d = AD.decide(set, {}); assert.ok(d.uncertain.includes('hero'), JSON.stringify(d.uncertain));
  const thumbs = set.map(a => ({ id: a.id, dataUrl: 'data:image/jpeg;base64,' + Buffer.from('x').toString('base64') }));
  const log = []; const call = ans => async q => { log.push(q); if (ans instanceof Error) throw ans; return { model: 'mock-test', usage: { input_tokens: 1800, output_tokens: 30 }, input: ans }; };
  const L = AI.limits({});
  const ok = await AI.assetChoice(d, { thumbnails: thumbs, understanding: { identity: { name: 'Zorbo', what: 'a soda' } } }, { limits: L, call: call({ hero: 'a2', actor: 'logo', reject: ['nope'] }) });
  assert.equal(log.length, 1); assert.equal(log[0].tool.name, 'submit_creative_asset_choice'); assert.equal(log[0].maxTokens, 300); assert.equal(log[0].content.filter(c => c.type === 'image').length, 3);
  assert.deepEqual(Object.keys(AI.ASSET_TOOL.input_schema.properties).sort(), ['actor', 'cinematic', 'detail', 'hero', 'model3d', 'reject']);
  assert.equal(ok.choice.hero, 'a2'); assert.equal(ok.choice.actor, undefined, 'an unknown id is ignored'); assert.deepEqual(ok.choice.reject, []);
  assert.equal(AD.decide(set, { choice: ok.choice }).hero, 'a2'); assert.equal(AD.decide(set, { choice: ok.choice }).source, 'rules+ai');
  // never a rejected or off-shortlist picture; never when the rules are sure; failure: the rules stand
  assert.equal(AD.validChoice({ hero: 'a3' }, Object.assign({}, d, { rejected: [{ id: 'a3', reason: 'x' }] })), null);
  log.length = 0; const sure = AD.decide([pic('only', { origin: 'upload' })], {}); const r0 = await AI.assetChoice(sure, { thumbnails: thumbs }, { limits: L, call: call({}) }); assert.equal(log.length, 0); assert.equal(r0.choice, null);
  const er = await AI.assetChoice(d, { thumbnails: thumbs }, { limits: L, call: call(new Error('down')) }); assert.equal(er.choice, null); assert.equal(er.meta.asset, 'fallback');
  const off = await AI.assetChoice(d, { thumbnails: thumbs }, { limits: AI.limits({ CREATIVE_ASSET_DIRECTOR: 'off' }), call: call({ hero: 'a2' }) }); assert.equal(off.choice, null);
});

// ================================================================ role-aware search, bounded
test('search intent by role: each kind of subject is searched for the roles its pictures play -- bounded as before', () => {
  const kinds = [['a lime soda in a can', 'beverage', /campaign/], ['a black leather loafer', 'fashion', /campaign/], ['dental scheduling software', 'software', /interface/], ['an electric coupe', 'vehicle', /three quarter/], ['a rosehip face serum', 'beauty', /still life/], ['A modern instant film camera by Polaroid', 'product', /product photo/]];
  kinds.forEach(([what, type, q]) => { const u = { identity: { what, name: 'Zorbo' } }; assert.equal(DISC.subjectType(u), type, what); const plan = DISC.planSearches(u); assert.ok(plan.length >= 2 && plan.length <= 6); assert.ok(plan.some(p => q.test(p.q)), `${what}: ${plan.map(p => p.q.split(' -')[0]).join(' | ')}`); assert.ok(plan.every(p => !/cosplay|fanart/.test(p.q)), 'photographic subjects keep the stock exclusions'); });
  assert.equal(DISC.PLAN_VERSION, 'q3', 'a new query plan never answers from the old one\'s cache');
});

// ================================================================ the server: deterministic first, one look only when unsure
const HF_KEY = 'hfkeyid_test_0001:hfsecret_test_never_shown';
async function withServer(env, fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sr-assets-'));
  const e = Object.assign({ SITEREMADE_BACKEND: 'local', SITEREMADE_DB_PATH: path.join(dir, 'app.db'), SITEREMADE_ASSET_STORE_DIR: path.join(dir, 'assets'), SITEREMADE_EXPORTS_DIR: path.join(dir, 'exports'), SITEREMADE_PREMIUM_LOG_DIR: path.join(dir, 'p'), ANTHROPIC_API_KEY: 'test-only', OPENAI_API_KEY: '', STRIPE_SECRET_KEY: '', SITEREMADE_TRIAL_CREDITS: '30', MOCK_CALL_LOG: path.join(dir, 'calls.log'), NODE_ENV: 'test', HIGGSFIELD_API_KEY: HF_KEY }, env);
  const s = await startServer(e); const call = client(s.port);
  await call('POST', '/api/auth/signup', { email: `ad-${process.pid}-${Date.now()}@example.com`, password: 'correct-horse-battery-staple' });
  try { await fn({ call, calls: () => providerCalls(e.MOCK_CALL_LOG) }); } finally { await s.stop(); fs.rmSync(dir, { recursive: true, force: true }); }
}
const BRIEF = 'A launch website for an imaginary running sneaker called Zorbo, light and fast';
const meas = (id, o) => Object.assign({ id, origin: 'upload', title: id, mime: 'image/png', assess: { width: 1600, height: 1000, aspect: 1.6, orientation: 'landscape', subject: [0.2, 0.2, 0.8, 0.8], colours: ['#c0502e', '#f2f2f2', '#333333'], luminance: 110, background: { colour: '#333333', uniformity: 0.3 } } }, o || {});
// (the studio sends small thumbnails, never the pictures themselves)
const thumb = id => { const W = 32, H = 18, d = Buffer.alloc(W * H * 4); for (let i = 0; i < W * H; i++) { d[i * 4] = (id.charCodeAt(0) * 7 + i) % 256; d[i * 4 + 1] = 120; d[i * 4 + 2] = 80; d[i * 4 + 3] = 255; } return 'data:image/png;base64,' + require('../lib/creative/png').encode({ width: W, height: H, data: d }).toString('base64'); };
async function generate(call, assets, extra) {
  const ask = await call('POST', '/api/creative/research', { brief: BRIEF }); const r = ask.body.needsConfirmation ? await call('POST', '/api/creative/research', { brief: BRIEF, quoteId: ask.body.quote.id }) : ask;
  return call('POST', '/api/creative/plan', Object.assign({ brief: BRIEF, jobId: r.body.jobId, understanding: r.body.understanding, facts: [], supplied: {}, assets, thumbnails: assets.map(a => ({ id: a.id, dataUrl: thumb(a.id) })) }, extra || {}));
}
const assetCalls = calls => calls().filter(c => c.tool === 'submit_creative_asset_choice');
test('server: confident -> no extra call; unsure -> exactly one look (mocked), ledgered; failing or off -> the rules / the old behaviour', async () => {
  // one owner upload: the rules are sure -- no call; the decision is recorded
  await withServer({}, async ({ call, calls }) => {
    const p = await generate(call, [meas('u1')], { mainAsset: 'u1' }); assert.equal(p.body.ok, true, JSON.stringify(p.body).slice(0, 300));
    assert.equal(assetCalls(calls).length, 0); assert.equal(p.body.meta.assetDirector.asset, 'rules'); assert.equal(p.body.plan.assetDirector.hero, 'u1');
  });
  // two found pictures too close to call (no owner main): one look at the shortlist, labelled mock
  const twins = [meas('w1', { origin: 'research', pageUrl: 'https://a.example/1', sourceUrl: 'https://a.example/1.jpg', curation: { role: 'subject', identity: 'exact', depicts: 'the sneaker from the side', issues: [], quality: 3 } }),
    meas('w2', { origin: 'research', pageUrl: 'https://b.example/2', sourceUrl: 'https://b.example/2.jpg', assess: Object.assign({}, meas('x').assess, { colours: ['#2050d0', '#80b0ff', '#102060'] }), curation: { role: 'subject', identity: 'exact', depicts: 'the sneaker from above', issues: [], quality: 3 } })];
  await withServer({}, async ({ call, calls }) => {
    const p = await generate(call, twins); assert.equal(p.body.ok, true);
    assert.equal(assetCalls(calls).length, 1, 'one look'); assert.equal(p.body.meta.assetDirector.asset, 'mock'); assert.ok(p.body.meta.assetDirector.usd > 0 && p.body.meta.assetDirector.usd < 0.01);
    assert.equal(p.body.plan.assetDirector.source, 'rules+ai');
  });
  await withServer({ MOCK_ASSET: 'error' }, async ({ call, calls }) => {
    const p = await generate(call, twins); assert.equal(p.body.ok, true); assert.equal(assetCalls(calls).length, 1, 'never retried'); assert.equal(p.body.meta.assetDirector.asset, 'fallback'); assert.equal(p.body.plan.assetDirector.source, 'rules');
  });
  await withServer({ CREATIVE_ASSET_DIRECTOR: 'off' }, async ({ call, calls }) => {
    const p = await generate(call, twins); assert.equal(p.body.ok, true); assert.equal(assetCalls(calls).length, 0); assert.equal(p.body.meta.assetDirector, undefined); assert.equal(p.body.plan.assetDirector, undefined);
  });
});
