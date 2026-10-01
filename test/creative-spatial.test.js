'use strict';
// CREATIVE'S SPATIAL TIER (lib/creative/spatial.js + spatial-runtime.js): an optional WebGL layer over the complete DOM
// page, chosen by a deterministic decision only when the concept gains from real depth, with the CREATIVE_SPATIAL flag
// on. It reads the same validated timeline; every number is bounded; it ships inside the export (no CDN); and every
// failure -- no WebGL, a throw, a lost context, reduced motion, a phone kept DOM, a model that will not load -- leaves
// the DOM page. These tests pin the decision, the bounds, the fallbacks, the export and the reopening.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const SP = require('../lib/creative/spatial');
const TL = require('../lib/creative/timeline');
const D2 = require('../lib/creative/director2');
const RENDERERS = require('../lib/creative/renderers');
const { RUNTIME } = require('../lib/creative/spatial-runtime');
const { validatePlan2 } = require('../lib/creative/validate2');
const { renderCreative2 } = require('../lib/creative/render2');
const { sanitizeCreative } = require('../lib/creative/store');

const A = (id, w, h, extra) => Object.assign({ id, origin: 'research', title: `File:${id}.jpg`, author: 'A. Photographer', license: 'CC BY 4.0', pageUrl: `https://example.org/${id}`,
  assess: { width: w, height: h, aspect: +(w / h).toFixed(3), orientation: w > h * 1.15 ? 'landscape' : h > w * 1.15 ? 'portrait' : 'square', subject: null, colours: ['#c0502e'], luminance: 120, background: { colour: '#333333', uniformity: 0.2 } },
  caps: { moveFreely: false, frame: true, backdrop: w > h, heroSize: true }, curation: { role: 'subject', identity: 'exact', depicts: id, issues: [] } }, extra || {});
const PLAIN = A('plain', 1400, 1400, { assess: { width: 1400, height: 1400, aspect: 1, orientation: 'square', subject: [0.2, 0.12, 0.8, 0.9], colours: ['#2255cc'], luminance: 150, background: { colour: '#f4f4f4', uniformity: 0.95 } } });
const CUT = A('c-plain', 840, 1090, { origin: 'derived', cutout: true, cutoutOf: 'plain', assess: { width: 840, height: 1090, aspect: 0.771, orientation: 'portrait', transparent: true, subject: [0.02, 0.02, 0.98, 0.98], colours: ['#2255cc'], luminance: 96 }, caps: { moveFreely: true } });
const CUT2 = A('c-two', 800, 1000, { origin: 'upload', cutout: true, assess: { width: 800, height: 1000, aspect: 0.8, orientation: 'portrait', transparent: true, subject: [0.02, 0.02, 0.98, 0.98], colours: ['#cc2255'], luminance: 100 }, caps: { moveFreely: true } });
const ASSETS = [A('wide', 2000, 1200), A('wide2', 1900, 1100), A('tall', 900, 1400), PLAIN, CUT, CUT2, A('more', 1300, 1000), A('setting', 1800, 1000, { curation: { role: 'environment', identity: 'related', depicts: 'a street', issues: [] } })];
const FACTS = ['A doughnut is a fried dough confection.', 'Doughnuts were popular in the Netherlands in the nineteenth century.', 'The ring shape became common in 1847.', 'Doughnuts may be glazed, frosted or filled with jam or custard, and they are sold in bakeries and supermarkets around the world in many varieties.', 'In 1920 an automated doughnut machine was invented.', 'Some doughnuts are made from potato dough.', 'National Doughnut Day is held in June.'].map((text, i) => ({ id: `f${i + 1}`, text, section: 'x' }));
const PAGE = { title: 'Doughnut', url: 'https://en.wikipedia.org/wiki/Doughnut', license: 'CC BY-SA 4.0' };
const MODEL = { id: 'm-dough', format: 'glb', of: '', bytes: 90000, title: 'doughnut' };
const und = (subject, what, tone) => ({ kind: 'recognizable', subject, brief: `a page about ${subject}`, tone: { register: tone || 'playful' }, identity: { name: subject, kind: 'recognizable', what } });
function page(subject, what, opts) {
  const o = opts || {}; const u = und(subject, what, o.tone);
  const { plan, recipe } = D2.direct({ understanding: u, research: { page: PAGE, facts: FACTS }, assets: ASSETS, supplied: { facts: [], memories: [] }, seed: o.seed || '1', prefer: o.prefer });
  return Object.assign(validatePlan2(plan, { assets: ASSETS, facts: FACTS, understanding: u, page: PAGE, art: recipe, spatial: o.flag === undefined ? 'on' : o.flag, models: o.models || [] }), { und: u, raw: plan, recipe });
}
const product = (extra) => page('Doughnut', 'a ring-shaped fried snack product', Object.assign({ prefer: { family: 'object-story', mode: 'immersive' } }, extra || {}));
const html = (plan, extra) => renderCreative2(plan, ASSETS.concat([Object.assign({ mime: 'model/gltf-binary' }, MODEL)]), Object.assign({ mode: 'export', src: a => (a.format === 'glb' ? `assets/${a.id}.glb` : `${a.id}.png`) }, extra || {}));

// a synthetic page for the decision itself (no director in between)
const sc = (layout, layers, extra) => Object.assign({ layout, choreo: 'settle', layers: layers || [], text: { heading: 'x' } }, extra || {});
const img = (asset, role, extra) => Object.assign({ kind: 'image', asset, role: role || 'focal' }, extra || {});
const byId = new Map(ASSETS.map(a => [a.id, a]));
const tlOf = (extra) => Object.assign({ v: 1, renderer: 'dom', actors: [], beats: [], transitions: [], rhythm: ['setup', 'event', 'rest', 'escalation', 'rest'], moments: [] }, extra || {});
const primary = { id: 'primary', role: 'primary', kind: 'image', asset: 'c-plain', from: 0, to: 2, ease: 'smooth', exit: 'shrink', keys: [{ g: 0, x: 10, y: 0, s: 1, r: 0, o: 1 }, { g: 1.5, x: 12, y: -3, s: 1.1, r: -4, o: 1 }, { g: 2.7, x: 10, y: 0, s: 1, r: 0, o: 1 }, { g: 3, x: 10, y: 6, s: 0.4, r: 0, o: 0 }] };
const decideCtx = (extra) => Object.assign({ enabled: 'on', mode: 'immersive', family: 'object-story', personality: 'playful', kind: 'recognizable', name: 'X', title: '', logline: '', what: '', scenes: [sc('stage'), sc('stage'), sc('stage'), sc('text'), sc('text')], timeline: tlOf(), byId, models: [] }, extra || {});

// ---------------------------------------------------------------- 1, 2, 3: the decision
test('1. renderer selection: spatial only for concepts that gain from depth, each reason recorded; the same page always decides the same', () => {
  const turn = decideCtx({ what: 'a fizzy energy drink can product', timeline: tlOf({ actors: [primary], moments: [{ scene: 1, kind: 'actor-turn' }] }) });
  const d1 = SP.decide(turn); assert.equal(d1.renderer, 'spatial'); assert.ok(d1.why.includes('object-turn') && d1.why.includes('particles'), d1.why.join());
  assert.deepEqual(SP.decide(turn), d1, 'deterministic');
  const globe = SP.decide(decideCtx({ mode: 'expressive', family: 'typography-led', what: 'a global logistics and shipping data network' })); assert.equal(globe.renderer, 'spatial'); assert.ok(globe.why.includes('globe'));
  const flight = SP.decide(decideCtx({ mode: 'expressive', family: 'cinematic-chapters', what: 'a hotel tower and its residences', scenes: [sc('cinematic', [img('wide')]), sc('image', [img('wide')]), sc('cinematic', [img('wide2')]), sc('editorial-hero', [img('setting')]), sc('text')], timeline: tlOf({ moments: [{ scene: 1, kind: 'chapter-flight' }] }) }));
  assert.equal(flight.renderer, 'spatial'); assert.ok(flight.why.includes('camera-flight')); assert.deepEqual(flight.found.flight.scenes, [1, 2, 3]);
  const model = SP.decide(decideCtx({ what: 'a doughnut', models: [MODEL], timeline: tlOf({ actors: [primary] }) })); assert.ok(model.why.includes('model'));
});

test('2. DOM remains the default: without the flag every page is DOM; with it, quiet, editorial, fashion, personal and calm pages stay DOM -- and immersive mode alone is never a reason', () => {
  const off = product({ flag: '' }); assert.equal(off.plan.timeline.renderer, 'dom'); assert.ok(off.plan.timeline.why.includes('flag-off'));
  assert.doesNotMatch(html(off.plan), /id="cr-spatial"|sp-canvas|spatialRuntime/);
  const stays = [
    decideCtx({ mode: 'quiet', what: 'a sneaker product' }), decideCtx({ mode: 'editorial', what: 'a sneaker product' }),
    decideCtx({ what: 'a couture fashion house and its runway', timeline: tlOf({ actors: [primary], moments: [{ scene: 1, kind: 'actor-turn' }] }) }),
    decideCtx({ kind: 'personal', what: 'a toy', timeline: tlOf({ actors: [primary], moments: [{ scene: 1, kind: 'actor-turn' }] }) }),
    decideCtx({ personality: 'luxe', what: 'a watch product', timeline: tlOf({ actors: [primary], moments: [{ scene: 1, kind: 'actor-turn' }] }) }),
  ];
  stays.forEach(c => assert.equal(SP.decide(c).renderer, 'dom', JSON.stringify(SP.decide(c).why)));
  const bare = SP.decide(decideCtx({ what: 'an essay about patience' })); assert.equal(bare.renderer, 'dom'); assert.deepEqual(bare.why, ['no-reason'], 'immersive with nothing that needs depth');
  // a page without one sharp picture is not enlarged into depth
  const soft = new Map([['c-plain', A('c-plain', 500, 600, { cutout: true, assess: { width: 500, height: 600, aspect: 0.83, transparent: true } })]]);
  assert.ok(SP.decide(decideCtx({ byId: soft, what: 'a toy product', timeline: tlOf({ actors: [Object.assign({}, primary)], moments: [{ scene: 1, kind: 'actor-turn' }] }) })).why.includes('weak-pictures'));
});

test('3. spatial requires the feature flag: the flag gates the choice when a page is composed; a raw request for spatial without it is DOM, and says so', () => {
  assert.equal(RENDERERS.enabled({ CREATIVE_SPATIAL: 'on' }), true); assert.equal(RENDERERS.enabled({}), false); assert.equal(RENDERERS.enabled({ CREATIVE_SPATIAL: '1' }), false);
  const on = product(); const off = product({ flag: '' });
  assert.equal(on.plan.timeline.renderer, 'spatial', JSON.stringify(on.plan.timeline.why)); assert.equal(off.plan.timeline.renderer, 'dom');
  const asked = JSON.parse(JSON.stringify(off.raw)); asked.timeline = { renderer: 'spatial', actors: [], beats: [], transitions: [], moments: [] };
  const v = validatePlan2(asked, { assets: ASSETS, facts: FACTS, understanding: off.und, page: PAGE, art: off.recipe });
  assert.equal(v.plan.timeline.renderer, 'dom'); assert.ok(v.fixes.some(f => /spatial was asked for but is not justified/.test(f)), v.fixes.join('\n'));
  // the render follows the validated plan, never the environment (the studio preview and the export agree)
  assert.equal(RENDERERS.resolve(on.plan).id, 'spatial'); assert.equal(RENDERERS.resolve(off.plan).id, 'dom');
  assert.equal(RENDERERS.resolve({ timeline: { renderer: 'spatial' } }).id, 'dom', 'a spatial renderer with no spatial block is DOM');
});

// ---------------------------------------------------------------- 4..9: the bounds
test('4. the spatial block is validated: enums, scenes, pictures and counts -- and a block with nothing spatial in it makes the page DOM', () => {
  const v = product(); const tl = v.plan.timeline; const ctx = { scenes: v.plan.scenes, timeline: tl, byId, models: [] };
  const junk = SP.normalise({ quality: 'ultra', phone: 'maybe', depth: 'infinite', fog: 9, camera: 'x', actors: [{ role: 'primary', form: 'hologram', z: [99], ry: [999] }, { role: 'villain' }], pieces: [{ kind: 'portal', scene: 1 }, { kind: 'cards', scene: 1, assets: ['nope'] }, { kind: 'globe', scene: 0 }], particles: { style: 'fireworks', count: 1e9 } }, ctx);
  assert.equal(junk.quality, 'medium'); assert.equal(junk.phone, 'lite'); assert.equal(junk.depth, 'layered'); assert.equal(junk.fog, 0.8);
  assert.equal(junk.actors.length, 1); assert.equal(junk.actors[0].form, 'billboard'); assert.ok(junk.actors[0].z.every(z => z <= SP.ACTOR3D.z[1])); assert.ok(junk.actors[0].ry.every(r => r === 0), 'a billboard never turns');
  assert.deepEqual(junk.pieces, [], 'unknown kinds, missing pictures and the opening scene are refused'); assert.equal(junk.particles.style, 'none');
  assert.equal(SP.normalise({ actors: [], pieces: [], particles: { style: 'none' } }, ctx), null, 'nothing spatial: the page is DOM');
  const t2 = TL.normalise(Object.assign({}, tl, { renderer: 'spatial', spatial: { particles: { style: 'none' } } }), { scenes: v.plan.scenes, mode: v.plan.art.mode, actor: v.plan.actor, byId, art: v.plan.art });
  assert.equal(t2.timeline.renderer, 'dom'); assert.equal(t2.timeline.spatial, undefined);
  // the accepted block re-validates unchanged (what is saved is what reopens)
  assert.deepEqual(SP.normalise(JSON.parse(JSON.stringify(tl.spatial)), ctx), tl.spatial);
});

test('5. camera bounds: every number clamped, at most 24 keys, the camera starts and ends at rest, and it never jumps', () => {
  const n = 5; const scenes = Array.from({ length: n }, () => sc('text'));
  const keys = [{ g: 0.5, dz: 9, dx: -9, dy: 9, yaw: 400, pitch: -90 }, { g: 0.55, dz: -9, yaw: -400 }].concat(Array.from({ length: 40 }, (_, i) => ({ g: 1 + i * 0.08, dz: (i % 2) * 0.5, yaw: (i % 2) * 14 })));
  const out = SP.normalise({ camera: keys, particles: { style: 'ambient', count: 300 } }, { scenes, timeline: tlOf({ rhythm: ['setup', 'rest', 'rest', 'rest', 'rest'] }), byId });
  const K = out.camera; assert.ok(K.length <= SP.CAPS.camKeys);
  assert.deepEqual(K[0], { g: 0, dz: 0, dx: 0, dy: 0, yaw: 0, pitch: 0 }); assert.deepEqual(K[K.length - 1], { g: n, dz: 0, dx: 0, dy: 0, yaw: 0, pitch: 0 });
  K.forEach(k => { Object.keys(SP.CAM).forEach(f => assert.ok(k[f] >= SP.CAM[f][0] && k[f] <= SP.CAM[f][1], `${f} ${k[f]}`)); });
  for (let i = 1; i < K.length - 1; i++) Object.keys(SP.CAM_RATE).forEach(f => assert.ok(Math.abs(K[i][f] - K[i - 1][f]) <= SP.CAM_RATE[f] * (K[i].g - K[i - 1].g) + 1, `${f} jumps between keys ${i - 1} and ${i}`));
  // a composed page: its camera follows the rhythm -- rests hold still, and the last scene holds at rest
  const v = product(); const sp = v.plan.timeline.spatial;
  v.plan.timeline.rhythm.forEach((R, i) => { if (R === 'rest' && i > 0) assert.ok(!sp.moves.some(m => m.scene === i && m.move !== 'hold' && m.move !== 'handoff'), `scene ${i + 1} rests`); });
  assert.equal(sp.moves.find(m => m.scene === v.plan.scenes.length - 1).move, 'hold');
});

test('6. model bounds: one model, for the primary actor only, from the project, under the size cap -- otherwise its picture as a turning plane', () => {
  const v = product({ models: [MODEL] }); const sp = v.plan.timeline.spatial; const prim = sp.actors.find(a => a.role === 'primary');
  assert.equal(prim.form, 'model'); assert.equal(prim.model, 'm-dough'); assert.ok(v.plan.timeline.why.includes('model'));
  assert.ok(sp.actors.filter(a => a.form === 'model').length <= SP.CAPS.models);
  const ctx = { scenes: v.plan.scenes, timeline: v.plan.timeline, byId };
  assert.equal(SP.normalise(sp, Object.assign({}, ctx, { models: [] })).actors.find(a => a.role === 'primary').form, 'plane', 'a model that is not in the project');
  assert.equal(SP.normalise(sp, Object.assign({}, ctx, { models: [Object.assign({}, MODEL, { bytes: SP.CAPS.modelBytes + 1 })] })).actors.find(a => a.role === 'primary').form, 'plane', 'a model over the size cap');
  assert.equal(SP.normalise(sp, ctx).actors.find(a => a.role === 'primary').form, 'model', 'unknown model list (reopening without it): the saved reference is kept as it was');
  const sec = SP.normalise({ actors: [{ role: 'secondary', form: 'model', model: 'm-dough' }] }, Object.assign({}, ctx, { timeline: Object.assign({}, v.plan.timeline, { actors: [{ role: 'secondary', kind: 'image', keys: [{ g: 1 }, { g: 2 }] }] }), models: [MODEL] }));
  assert.equal(sec.actors[0].form, 'plane', 'only the primary actor may be a model');
  // the store: GLB only, owner uploads, at most two, under 8 MB
  const S = require('../lib/creative/store'); const glb = 'data:model/gltf-binary;base64,' + Buffer.from('glTF....').toString('base64');
  assert.ok(S.cleanModel({ id: 'm1', dataUrl: glb })); assert.equal(S.cleanModel({ id: 'm1', dataUrl: 'data:image/png;base64,AAAA' }), null); assert.equal(S.cleanModel({ id: 'x1', dataUrl: glb }), null);
});

test('7. particle bounds: one field, a fixed enum of styles, counts capped per style and again per device tier (no per-particle DOM)', () => {
  const scenes = [sc('text'), sc('text'), sc('text')];
  SP.PARTICLES.filter(s => s !== 'none').forEach(style => { const p = SP.normalise({ particles: { style, count: 1e6, scene: 99 } }, { scenes, timeline: tlOf({ rhythm: ['setup', 'rest', 'rest'] }), byId }).particles; assert.ok(p.count <= SP.PARTICLE_MAX[style] && p.count <= SP.CAPS.particles, style); if (style === 'burst') assert.equal(p.scene, 2); });
  assert.ok(SP.QUALITY.high.particles >= SP.QUALITY.medium.particles && SP.QUALITY.medium.particles > SP.QUALITY.low.particles);
  assert.match(RUNTIME, /Math\.min\(pt\.count, Q\.particles\)/, 'the runtime caps the field by the device tier'); assert.match(RUNTIME, /gl\.POINTS/, 'drawn as GPU points in one call');
  assert.doesNotMatch(RUNTIME, /createElement\('i'\)|createElement\('span'\)|createElement\('div'\)/, 'no element per particle');
});

test('8. texture limits: a cap on pictures per page and per piece, on texture size per tier, and pictures uploaded no larger than they are seen', () => {
  ['high', 'medium', 'low'].forEach(t => { const q = SP.QUALITY[t]; assert.ok(q.textures <= SP.CAPS.textures && q.texSize <= 2048 && q.dpr <= 1.75 && q.drawCalls <= 40); });
  assert.ok(SP.QUALITY.low.texSize < SP.QUALITY.high.texSize && SP.QUALITY.low.dpr === 1 && SP.QUALITY.low.models === 0);
  assert.match(RUNTIME, /texCount >= Q\.textures/); assert.match(RUNTIME, /Math\.min\(max \|\| Q\.texSize, p\)/); assert.match(RUNTIME, /Math\.min\(Q\.texSize, phone \? 512 : 1024\)/);
  const many = Array.from({ length: 14 }, (_, i) => A(`p${i}`, 1600, 1000)); const big = new Map(many.map(a => [a.id, a]));
  const scenes = [sc('text'), sc('gallery', many.map(a => img(a.id, 'support'))), sc('lineup', many.map(a => img(a.id, 'support'))), sc('text')];
  const out = SP.normalise({ pieces: [{ kind: 'cards', scene: 1, assets: many.map(a => a.id) }, { kind: 'lineup', scene: 2, assets: many.map(a => a.id) }] }, { scenes, timeline: tlOf({ rhythm: ['setup', 'rest', 'rest', 'rest'] }), byId: big });
  assert.equal(out.pieces.find(p => p.kind === 'cards').assets.length, SP.CAPS.cards); assert.equal(out.pieces.find(p => p.kind === 'lineup').assets.length, SP.CAPS.lineup);
});

test('9. image-plane fallback: every model actor carries its picture; the page draws the picture until the model has loaded, and for good if it does not', () => {
  const v = product({ models: [MODEL] }); const h = html(v.plan);
  const data = JSON.parse(h.match(/<script type="application\/json" id="cr-spatial">([\s\S]*?)<\/script>/)[1]);
  const prim = data.actors.find(a => a.role === 'primary'); assert.equal(prim.form, 'model'); assert.equal(prim.model, 'assets/m-dough.glb'); assert.equal(prim.url, 'c-plain.png', 'its own picture, always');
  assert.match(RUNTIME, /form: a\.form === 'model' \? 'plane' : a\.form/, 'drawn as a plane until the model is ready');
  assert.match(h, /<div class="ca" data-role="primary"[^>]*data-img/, 'and the DOM actor is still on the page underneath');
});

// ---------------------------------------------------------------- 10..13: the runtime in a browser that cannot, or should not
function run(opts) {
  const o = Object.assign({ motion: 'full', width: 1440, gl: 'ok', spatial: null, fetch: null, scenes: [] }, opts || {});
  // (frames: animation frames are captured so a test can run them; pictures load as soon as they are asked for)
  const rafs = []; const Image = function () { const self = this; Object.defineProperty(this, 'src', { set() { self.naturalWidth = 800; self.naturalHeight = 1000; setTimeout(() => self.onload && self.onload(), 0); } }); };
  const classes = new Set(); const attrs = { 'data-motion': o.motion }; const listeners = {}; const created = [];
  const html = { getAttribute: k => (k in attrs ? attrs[k] : null), setAttribute: (k, v) => { attrs[k] = v; }, classList: { add: c => classes.add(c), remove: c => classes.delete(c), contains: c => classes.has(c) } };
  const glStub = new Proxy({}, { get: (t, k) => (k === 'getShaderParameter' || k === 'getProgramParameter' ? () => true : k === 'getAttribLocation' ? () => 0 : k === 'getExtension' ? () => null : k === 'getActiveUniform' ? () => ({ name: 'u' }) : typeof k === 'string' && /^[A-Z_0-9]+$/.test(k) ? 1 : () => ({})) });
  const canvas = { className: '', setAttribute() {}, addEventListener: (k, f) => { listeners[k] = f; }, parentNode: null, getContext: () => { if (o.gl === 'throw') throw new Error('no'); if (o.gl === 'broken') return new Proxy({}, { get: () => () => { throw new Error('driver'); } }); return o.gl === 'null' ? null : glStub; } };
  const document = { documentElement: html, hidden: false, getElementById: id => (id === 'cr-spatial' ? { textContent: JSON.stringify(o.spatial) } : null), querySelectorAll: sel => (sel === '.sc' ? o.scenes : []), querySelector: () => null, createElement: t => { const el = t === 'canvas' ? canvas : { getContext: () => ({ drawImage() {} }) }; created.push(t); return el; }, body: { insertBefore: el => { el.parentNode = document.body; }, removeChild() {} }, scrollingElement: { scrollHeight: 4000 }, addEventListener() {} };
  const window = { innerWidth: o.width, innerHeight: 900, devicePixelRatio: 2, navigator: { deviceMemory: 8, hardwareConcurrency: 8 }, scrollY: 0, addEventListener() {}, fetch: o.fetch, TextDecoder, performance: { now: () => 1 } };
  const box = { window, document, getComputedStyle: () => ({ getPropertyValue: () => '56px' }), requestAnimationFrame: f => { rafs.push(f); return rafs.length; }, cancelAnimationFrame() {}, Image, Blob: function () {}, URL: { createObjectURL: () => 'blob:x' }, Date, Math, JSON, Float32Array, Uint8Array, Uint16Array, Uint32Array, DataView, setTimeout, clearInterval, setInterval };
  vm.runInNewContext(RUNTIME, box);
  return { ST: window.__crSpatial, classes, created, listeners, window, frames: n => { for (let i = 0; i < n; i++) { const f = rafs.shift(); if (f) f(16 * (i + 1)); } } };
}
const fakeScene = (top, h) => ({ _top: top, _h: h, hasAttribute: () => false, getAttribute: () => '#101418', querySelector: () => null, setAttribute() {}, removeAttribute() {} });
const spatialJson = (extra) => Object.assign({ v: 1, q: 'high', phone: 'lite', depth: 'deep', fog: 0.35, Q: SP.QUALITY, caps: { modelBytes: SP.CAPS.modelBytes }, pal: { accent: [1, 0, 0], glow: [1, 1, 1], ink: [0, 0, 0] }, cam: [[0, 0, 0, 0, 0, 0], [3, 0, 0, 0, 0, 0]], actors: [], pieces: [], particles: { style: 'ambient', count: 300, fill: 'glow' }, seams: [] }, extra || {});

test('10. WebGL failure fallback: no WebGL, a context that throws, a driver error and a lost context all leave the DOM page', () => {
  const ok = run({ spatial: spatialJson() }); assert.equal(ok.ST.state, 'on'); assert.ok(ok.classes.has('sp-on'));
  const none = run({ gl: 'null', spatial: spatialJson() }); assert.equal(none.ST.state, 'dom'); assert.match(none.ST.why, /no hardware WebGL/); assert.ok(!none.classes.has('sp-on'));
  const thrown = run({ gl: 'throw', spatial: spatialJson() }); assert.equal(thrown.ST.state, 'dom'); assert.ok(!thrown.classes.has('sp-on'));
  const broken = run({ gl: 'broken', spatial: spatialJson() }); assert.equal(broken.ST.state, 'dom'); assert.match(broken.ST.why, /start: /); assert.ok(!broken.classes.has('sp-on') && !broken.classes.has('sp-pt'));
  const lost = run({ spatial: spatialJson() }); lost.listeners.webglcontextlost({ preventDefault() {} }); assert.equal(lost.ST.state, 'failed'); assert.ok(!lost.classes.has('sp-on'), 'the DOM page is back');
  const bad = run({ spatial: null }); assert.equal(bad.ST, undefined, 'no spatial data: the runtime does nothing');
  // (it asks for hardware WebGL only: software emulation would be slower than the DOM page)
  assert.match(RUNTIME, /failIfMajorPerformanceCaveat: true/);
});

test('11. missing model fallback: a model that cannot be fetched or read is reported, and the actor stays its picture', async () => {
  const sp = spatialJson({ actors: [{ role: 'primary', form: 'model', url: 'c.png', aa: 0.8, model: 'assets/missing.glb', from: 0, to: 1, K: [[0, 0, 0, 1, 0, 1, 0, 0], [2, 0, 0, 1, 0, 1, 0, 0]] }] });
  const r = run({ spatial: sp, fetch: () => Promise.resolve({ ok: false, status: 404 }) }); await new Promise(res => setTimeout(res, 20));
  assert.equal(r.ST.state, 'on'); assert.match(r.ST.why, /^model: model 404/); assert.equal(r.ST.modelBytes, 0);
  const junk = run({ spatial: sp, fetch: () => Promise.resolve({ ok: true, arrayBuffer: () => Promise.resolve(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]).buffer) }) }); await new Promise(res => setTimeout(res, 20));
  assert.match(junk.ST.why, /model unreadable/);
  // the validator side: a page whose model is gone reopens with the picture as a turning plane (test 6)
});

test('12. reduced motion: the spatial layer never starts -- the DOM page shows its complete still composition (the globe as a still drawing)', () => {
  const r = run({ motion: 'reduced', spatial: spatialJson() }); assert.equal(r.ST.state, 'dom'); assert.equal(r.ST.why, 'reduced motion'); assert.ok(!r.created.includes('canvas'), 'no canvas at all');
  const v = page('Global freight', 'a global logistics data network platform', { prefer: { mode: 'expressive' }, tone: 'editorial' });
  if (v.plan.timeline.renderer === 'spatial' && v.plan.timeline.spatial.pieces.some(p => p.kind === 'globe')) {
    const h = html(v.plan, { motion: 'reduced' }); assert.match(h, /data-motion="reduced"/); assert.match(h, /<svg class="sp-globe-dom"[^>]*>(<circle [^>]+\/>){50,}/, 'the globe is drawn, still, in the DOM');
  }
  assert.match(RUNTIME, /if \(reduced\(\)\) \{ ST\.state = 'dom'; ST\.why = 'reduced motion'; return; \}/);
});

test('13. phones: a lower tier (no models, fewer particles, DPR 1, a simpler camera) -- or the DOM page when the plan says so', () => {
  const phone = run({ width: 390, spatial: spatialJson() }); assert.equal(phone.ST.tier, 'low'); assert.equal(phone.ST.particles, Math.min(300, SP.QUALITY.low.particles));
  const kept = run({ width: 390, spatial: spatialJson({ phone: 'dom' }) }); assert.equal(kept.ST.state, 'dom'); assert.match(kept.ST.why, /phones get the DOM page/);
  const desk = run({ width: 1440, spatial: spatialJson({ q: 'medium' }) }); assert.equal(desk.ST.tier, 'medium', 'the plan sets the ceiling');
  assert.match(RUNTIME, /if \(phone\) \{ dz \*= 0\.5; dy \*= 0\.5; dx = 0; yaw = 0; pitch = 0; \}/, 'no orbit or sideways travel on a phone');
  ['particles', 'globe', 'arcs', 'textures', 'texSize', 'planes', 'drawCalls'].forEach(k => assert.ok(SP.QUALITY.low[k] < SP.QUALITY.high[k], k));
  // decorative-only spatial (particles, card planes) keeps phones on the DOM page
  const deco = SP.compose(decideCtx({ mode: 'immersive', family: 'layered-parallax', what: 'abstract experimental generative art', scenes: [sc('text'), sc('collage', ['wide', 'wide2', 'more', 'setting'].map(id => img(id, 'support'))), sc('text'), sc('text')], timeline: tlOf({ rhythm: ['setup', 'event', 'rest', 'rest'] }) }), SP.decide(decideCtx({ mode: 'immersive', family: 'layered-parallax', what: 'abstract experimental generative art', scenes: [sc('text'), sc('collage', ['wide', 'wide2', 'more', 'setting'].map(id => img(id, 'support'))), sc('text'), sc('text')], timeline: tlOf({ rhythm: ['setup', 'event', 'rest', 'rest'] }) })));
  assert.equal(deco.phone, 'dom');
});

// ---------------------------------------------------------------- 14: transitions keep their meaning
test('14. spatial transitions: every timeline transition has a spatial meaning, derived from the timeline (never chosen apart from it)', () => {
  TL.TRANSITIONS.forEach(f => assert.ok(SP.SEAM_MAP[f], f));
  assert.equal(SP.SEAM_MAP['actor-carry'], 'world-carry'); assert.equal(SP.SEAM_MAP['depth-handoff'], 'camera-dive'); assert.equal(SP.SEAM_MAP['foreground-wipe'], 'object-pass');
  assert.equal(SP.SEAM_MAP['image-expand'], 'plane-approach'); assert.equal(SP.SEAM_MAP['card-expand'], 'card-flight'); assert.equal(SP.SEAM_MAP['type-mask'], 'dom', 'a word as a window stays type');
  const v = product(); const tl = v.plan.timeline;
  assert.deepEqual(tl.spatial.seams, tl.transitions.map(t => ({ at: t.at, family: SP.SEAM_MAP[t.family] })).filter(s => s.family !== 'fog-bleed' && s.family !== 'cut'));
  const forged = SP.normalise(Object.assign({}, tl.spatial, { seams: [{ at: 1, family: 'teleport' }] }), { scenes: v.plan.scenes, timeline: tl, byId }); assert.deepEqual(forged.seams, tl.spatial.seams, 'seams cannot be forged');
  // the DOM transition elements the spatial layer redraws are hidden only once it has drawn them
  assert.match(RUNTIME, /s\.fam === 'object-pass' \|\| s\.fam === 'disc-approach'\)\) own\(el\)/);
});

// ---------------------------------------------------------------- 15, 16: the export
function exportOf(plan, models) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sr-sp-export-'));
  process.env.SITEREMADE_BACKEND = 'local'; process.env.SITEREMADE_ASSET_STORE_DIR = path.join(dir, 'assets');
  const { getDatabaseAdapter } = require('../lib/adapters/database-adapter'); const projectStore = require('../lib/project-store'); const { compileExport } = require('../lib/export-compiler');
  const db = getDatabaseAdapter(':memory:');
  const pix = n => { const b = Buffer.alloc(80); b.write('\x89PNG\r\n\x1a\n', 0, 'latin1'); b.writeUInt32BE(13, 8); b.write('IHDR', 12); b.writeUInt32BE(10, 16); b.writeUInt32BE(10, 20); b.writeUInt32BE(n, 60); return 'data:image/png;base64,' + b.toString('base64'); };
  const assets = ASSETS.map((a, i) => Object.assign({}, a, { dataUrl: pix(i + 1), mime: 'image/png' }));
  const glb = Buffer.concat([Buffer.from('glTF'), Buffer.alloc(60, 7)]);
  const direction = { mode: 'creative', meta: { id: 'c1' }, pages: [{ id: 'creative', label: 'Creative page', sections: [] }], creative: { brief: 'doughnuts', understanding: { kind: 'recognizable', subject: 'Doughnut' }, research: { status: 'ok', page: PAGE, facts: FACTS }, assets, models: (models || []).map(m => Object.assign({}, m, { dataUrl: 'data:model/gltf-binary;base64,' + glb.toString('base64') })), plan } };
  const check = projectStore.validateDirectionsState({ directions: [direction], activeDirectionIndex: 0 }); assert.ok(check.valid, check.error);
  projectStore.internalizeAssets(db, check.normalized);
  const workDir = path.join(dir, 'export'); const res = compileExport(db, { project: { id: 'psp', revision: 1, directionsState: check.normalized }, directionIndex: 0, workDir });
  return { workDir, res, out: fs.readFileSync(path.join(workDir, 'index.html'), 'utf8'), check, assets };
}
test('15. the export carries everything a spatial page needs: its runtime inside index.html, its pictures and its model as files, a note on how to host it', () => {
  const v = product({ models: [MODEL] }); const { workDir, res, out } = exportOf(v.plan, [MODEL]);
  assert.match(out, /<script type="application\/json" id="cr-spatial">/); assert.ok(out.includes('function spatialRuntime'), 'the runtime is inside the page');
  const glbs = fs.readdirSync(path.join(workDir, 'assets')).filter(f => f.endsWith('.glb')); assert.equal(glbs.length, 1, 'the model ships as a file');
  assert.ok(out.includes(`assets/${glbs[0]}`)); assert.ok(res.manifest.assets.some(a => a.contentType === 'model/gltf-binary' && a.path === `assets/${glbs[0]}`));
  assert.match(fs.readFileSync(path.join(workDir, 'README.md'), 'utf8'), /## The 3D layer[\s\S]*nothing is loaded from SiteRemade or any other server/);
  // every picture the spatial layer draws is a file in the export too
  const data = JSON.parse(out.match(/id="cr-spatial">([\s\S]*?)<\/script>/)[1]);
  [].concat(data.actors.map(a => a.url), ...data.pieces.map(p => (p.planes || []).map(x => x.url))).forEach(u => assert.ok(fs.existsSync(path.join(workDir, u)), u));
  // a DOM page's export is unchanged in kind: no runtime, no models, no note
  const dom = exportOf(product({ flag: '' }).plan, []); assert.doesNotMatch(dom.out, /cr-spatial|spatialRuntime/); assert.doesNotMatch(fs.readFileSync(path.join(dom.workDir, 'README.md'), 'utf8'), /3D layer/);
});

test('16. the export depends on no CDN or server: no external script, stylesheet or model -- the runtime makes no network request but the page\'s own files', () => {
  const v = product({ models: [MODEL] }); const { out } = exportOf(v.plan, [MODEL]);
  assert.doesNotMatch(out, /<script[^>]+src=/i, 'no external script'); assert.doesNotMatch(out, /<link[^>]+stylesheet/i);
  const scripts = [...out.matchAll(/<script(?: type="application\/json" id="[\w-]+")?>([\s\S]*?)<\/script>/g)].map(m => m[1]).join('\n');
  assert.doesNotMatch(scripts.split('http://www.w3.org/2000/svg').join(''), /https?:\/\//, 'no URL in any script (the SVG namespace is a name, not a request)');
  assert.doesNotMatch(RUNTIME, /https?:|cdn|unpkg|jsdelivr|three/i);
  assert.ok(RUNTIME.length < SP.QUALITY.high.textures * 4096, `the runtime is small (${RUNTIME.length} bytes)`);
});

// ---------------------------------------------------------------- 17, 18: reopening
test('17. a saved spatial project reopens identically: its plan, its spatial block and its model, byte for byte', () => {
  const v = product({ models: [MODEL] }); assert.equal(v.plan.timeline.renderer, 'spatial');
  const glb = 'data:model/gltf-binary;base64,' + Buffer.from('glTF0000').toString('base64');
  const saved = sanitizeCreative({ brief: 'x', understanding: { kind: 'recognizable', subject: 'Doughnut' }, research: { page: PAGE, facts: FACTS }, assets: ASSETS.map(a => Object.assign({}, a, { assetRef: 'a'.repeat(64) })), models: [Object.assign({}, MODEL, { dataUrl: glb })], plan: v.plan, history: [] });
  assert.equal(JSON.stringify(saved.plan), JSON.stringify(v.plan), 'saved as accepted'); assert.equal(saved.models.length, 1);
  const again = sanitizeCreative(JSON.parse(JSON.stringify(saved))); assert.equal(JSON.stringify(again), JSON.stringify(saved), 'reopened unchanged');
  // and with the flag switched off since: the page keeps its renderer (the flag gates new pages, not saved ones)
  const re = validatePlan2(JSON.parse(JSON.stringify(v.plan)), { mode: 'safety', assets: ASSETS, models: [MODEL], facts: FACTS, understanding: v.und, page: PAGE });
  assert.equal(JSON.stringify(re.plan), JSON.stringify(v.plan));
  // preview and export are the same page
  const strip = h => h.replace(/data-mode="\w+"/, '').replace(/"mode":"\w+"/, '');
  assert.equal(strip(html(v.plan, { mode: 'preview' })).replace(/<script>\n\(function\(\)\{\nvar d=document[\s\S]*<\/script>/, ''), strip(html(v.plan)).replace(/<script>\n\(function\(\)\{\nvar d=document[\s\S]*<\/script>/, ''));
});

test('18. old DOM projects reopen identically: no renderer reasons, no spatial block, and no spatial markup are added to a page saved before this tier', () => {
  const old = require('./fixtures/creative-saved-stage2.json').creative;
  const v = validatePlan2(old.plan, { mode: 'safety', assets: old.assets, facts: old.plan.facts, understanding: old.understanding });
  assert.equal(v.plan.timeline, undefined); assert.doesNotMatch(renderCreative2(v.plan, old.assets, { mode: 'export', src: a => a.id }), /cr-spatial|sp-canvas|data-sp=|spatialRuntime/);
  // a DOM timeline saved before the spatial tier (no why, no spatial block) reopens byte for byte
  const dom = JSON.parse(JSON.stringify(product({ flag: '' }).plan)); delete dom.timeline.why;
  dom.timeline.behavior = TL.behavior(dom.timeline, dom.art); dom.art.behavior = dom.timeline.behavior; dom.art.recipe = dom.art.recipe.split('#')[0] + '#' + dom.timeline.behavior;
  const re = validatePlan2(JSON.parse(JSON.stringify(dom)), { mode: 'safety', assets: ASSETS, facts: FACTS, understanding: und('Doughnut', 'x'), page: PAGE });
  assert.equal(JSON.stringify(re.plan.timeline), JSON.stringify(dom.timeline)); assert.equal(re.plan.timeline.why, undefined); assert.equal(re.plan.timeline.spatial, undefined);
  assert.doesNotMatch(html(re.plan), /cr-spatial|sp-canvas|data-sp=|spatialRuntime|\.sp-on/);
});

// ---------------------------------------------------------------- 19: anti-repetition
test('19. the behavioural fingerprint covers depth: camera, depth pattern, spatial transitions, particles, actor forms, set pieces', () => {
  const v = product({ models: [MODEL] }); const b = v.plan.timeline.behavior; const x = TL.parseBehavior(b).x;
  assert.ok(x, b); const p = SP.parseX('x:' + x);
  assert.ok(p.moves.length && p.depth && p.particles !== 'none' && p.forms.includes('model'), JSON.stringify(p));
  assert.equal(v.plan.art.recipe.split('#')[1], b, 'the stored recipe carries it');
  // two DOM pages compare exactly as before; a spatial page never reads as the same as a DOM one
  const dom = product({ flag: '' }).plan.timeline.behavior; assert.ok(!TL.parseBehavior(dom).x);
  assert.ok(TL.behaviorSimilarity(b, b) === 1); assert.ok(TL.behaviorSimilarity(b, dom) <= 0.8);
  const other = b.replace(/\|x:.*/, '|' + SP.fingerprint(Object.assign({}, v.plan.timeline.spatial, { depth: 'tunnel', particles: { style: 'dust' }, moves: [{ scene: 1, move: 'fly-through' }], actors: [], pieces: [{ kind: 'flight' }] })));
  assert.ok(TL.behaviorSimilarity(b, other) < TL.behaviorSimilarity(b, b) - 0.1, 'a different way of moving in depth reads as different');
  assert.ok(SP.similarity('x:' + x, 'x:' + x) === 1);
});

test('asset planning for depth: a spatial page records what it wanted from its pictures (a transparent cut-out, another angle, an environment, a model) and whether it had them -- never required; discovery may look for another angle within the same single extra search', () => {
  const v = product({ models: [MODEL] }); const needs = v.plan.timeline.needs;
  assert.ok(needs.some(n => n.need === 'transparent' && n.met === v.plan.actor.asset), JSON.stringify(needs));
  assert.ok(needs.some(n => n.need === 'model' && n.met === 'm-dough'));
  const none = product(); assert.ok(none.plan.timeline.needs.some(n => n.need === 'model' && n.met === ''), 'an unmet model need is recorded, and the page is spatial all the same'); assert.equal(none.plan.timeline.renderer, 'spatial');
  assert.ok(product({ flag: '' }).plan.timeline.needs.every(n => !['transparent', 'alternate', 'model'].includes(n.need)), 'a DOM page asks nothing of depth');
  const D = require('../lib/creative/discovery');
  const plan = D.planSearches({ identity: { name: 'Neon Brawl', kind: 'fictional', what: 'a fighting video game' }, visuals: { depiction: 'artwork' } }, { needs: { cutout: true, alternate: true } });
  assert.ok(plan.some(p => p.need === 'alternate' && /side view/.test(p.q)), JSON.stringify(plan.map(p => p.q)));
  assert.ok(plan.findIndex(p => p.need === 'cutout') < plan.findIndex(p => p.need === 'alternate'), 'the cut-out comes first');
});

// ---------------------------------------------------------------- regressions found with real prompts
test('real prompts: the AI director\'s default renderer ("dom") is not a request -- an AI-directed page can still be spatial; and its prompt no longer says spatial is unavailable', () => {
  const v = product(); const raw = JSON.parse(JSON.stringify(v.raw)); raw.timeline = { renderer: 'dom', actors: [], beats: [], transitions: [], moments: [] };
  const again = validatePlan2(raw, { assets: ASSETS, facts: FACTS, understanding: v.und, page: PAGE, art: v.recipe, spatial: 'on' });
  assert.ok(!again.plan.timeline.why.includes('dom-requested'), again.plan.timeline.why.join());
  assert.equal(again.plan.timeline.renderer, v.plan.timeline.renderer, 'the same page decides the same with or without the model\'s default');
  const src = fs.readFileSync(path.join(__dirname, '..', 'lib', 'creative', 'ai.js'), 'utf8'); assert.doesNotMatch(src, /not available in this build/); assert.match(src, /decided afterwards by the system/);
});
test('real prompts: another angle is searched for only for a physical product -- never for a game, a character or a person (a side-view search there returns fan renders)', () => {
  assert.equal(SP.wantsAlternate({ identity: { name: 'Super Smash Bros. Ultimate', what: 'a crossover fighting video game' } }), false);
  assert.equal(SP.wantsAlternate({ identity: { name: 'Neegy', what: 'a golden cartoon character meme' } }), false);
  assert.equal(SP.wantsAlternate({ identity: { name: 'Brian Eno', what: 'an ambient music pioneer' } }), false);
  assert.equal(SP.wantsAlternate({ identity: { name: 'Polaroid Now', what: 'an instant camera product' } }), true);
});

test('real prompts: concept words come from the subject -- a camera\'s "digital-era", ambient music\'s "Internet Age" and "listening space" never make a data globe or a starfield; a page\'s own logline never vetoes it as editorial', () => {
  const polaroid = SP.conceptOf({ name: 'Polaroid Now', what: 'An instant camera by Polaroid, designed for modern digital-era instant photography', logline: 'the whole ritual of instant photography staged as one kinetic unveiling' });
  assert.ok(polaroid.product && !polaroid.data, JSON.stringify(polaroid));
  const ambient = SP.conceptOf({ name: 'Ambient music', title: 'Furniture Music for the Internet Age', what: 'A genre of music', motifs: ['drift', 'listening space'] });
  assert.ok(!ambient.data && !ambient.space && !ambient.tech, JSON.stringify(ambient));
  const starlink = SP.conceptOf({ name: 'Starlink', what: "SpaceX's satellite internet network and mega-constellation" }); assert.ok(starlink.data, JSON.stringify(starlink));
  const opera = SP.conceptOf({ name: 'Sydney Opera House', what: 'An iconic performing arts venue in Sydney', logline: 'told in 5 scenes -- a editorial sticky arc' }); assert.ok(opera.place && !opera.editorial, JSON.stringify(opera));
  assert.ok(SP.conceptOf({ name: 'Comme des Garcons', what: 'the Japanese fashion house' }).editorial);
  // a product with a data word gets no globe
  const d = SP.decide(decideCtx({ mode: 'expressive', family: 'typography-led', what: 'a digital camera product with cloud networks of data' })); assert.ok(!d.why.includes('globe'), d.why.join());
});

test('real prompts: a plan accepted twice (a recompose, a revision) keeps its spatial needs once', () => {
  const v = product({ models: [MODEL] }); const again = validatePlan2(JSON.parse(JSON.stringify(v.plan)), { assets: ASSETS, facts: FACTS, understanding: v.und, page: PAGE, spatial: 'on', models: [MODEL] });
  const kinds = again.plan.timeline.needs.map(n => n.need); assert.equal(new Set(kinds).size, kinds.length, kinds.join());
});

test('real prompts: a flat picture turns only a little -- at most 16 degrees, a wide or group picture at most 8 (a stronger turn reads as a card)', () => {
  assert.deepEqual(SP.ACTOR3D.ry.plane, [-16, 16]);
  const v = product(); const prim = v.plan.timeline.spatial.actors.find(a => a.role === 'primary'); assert.equal(prim.form, 'plane'); assert.ok(prim.ry.every(r => Math.abs(r) <= 16), prim.ry.join());
  const wideCut = Object.assign({}, CUT, { assess: Object.assign({}, CUT.assess, { width: 1600, height: 900, aspect: 1.778 }) });
  const out = SP.normalise({ actors: [{ role: 'primary', form: 'plane', ry: [40, -40, 40, -40] }] }, { scenes: v.plan.scenes, timeline: v.plan.timeline, byId: new Map([[CUT.id, wideCut]]) });
  assert.ok(out.actors[0].ry.every(r => Math.abs(r) <= SP.ACTOR3D.wideTurn), out.actors[0].ry.join());
});

test('real prompts: only the scenes the spatial layer draws behind give up their own surface -- a typography-only actor scene keeps its designed atmosphere, and a spatial transition plays only between such scenes', () => {
  const v = product(); const h = html(v.plan); const sp = v.plan.timeline.spatial;
  assert.match(h, /html\.sp-on \.sc\[data-sp-behind\]\{background:transparent!important\}/); assert.doesNotMatch(h, /html\.sp-on \.sc\{background:transparent/);
  const prim = v.plan.timeline.actors.find(a => a.role === 'primary');
  for (let i = 0; i < v.plan.scenes.length; i++) { const tag = h.match(new RegExp(`<section [^>]*data-scene="${i}"[^>]*>`))[0]; const drawn = (i >= prim.from && i <= prim.to) || sp.pieces.some(p => (p.scenes || [p.scene]).includes(i)); assert.equal(/data-sp-behind/.test(tag), drawn, `scene ${i + 1}`); }
  const data = JSON.parse(h.match(/id="cr-spatial">([\s\S]*?)<\/script>/)[1]); const behind = i => /data-sp-behind/.test(h.match(new RegExp(`<section [^>]*data-scene="${i}"[^>]*>`))[0]);
  data.seams.forEach(s => assert.ok(behind(s.at - 1) && behind(s.at), `the transition into scene ${s.at + 1}`));
});

test('real prompts: a runtime error on a phone with a carried actor hands the page back to the DOM and says why -- and the layer\'s own teardown is never reported as a lost context', async () => {
  const actor = { role: 'primary', form: 'plane', url: 'c.png', aa: 0.8, model: '', from: 0, to: 1, K: [[0, 0, 0, 1, 0, 1, 0, 0], [2, 0, 0, 1, 0, 1, 0, 0]] };
  // the phone path that crashed: an actor drawn on a phone, its words measured, real frames run
  const r = run({ width: 390, spatial: spatialJson({ actors: [actor] }), scenes: [fakeScene(0, 900), fakeScene(900, 900), fakeScene(1800, 900)] });
  await new Promise(res => setTimeout(res, 10)); r.frames(3);
  assert.equal(r.ST.state, 'on', r.ST.why); assert.ok(r.ST.frames >= 2);
  // a failure's teardown releases the context: that is not a second failure, and the true reason stays
  const broken = run({ gl: 'broken', spatial: spatialJson() }); const why = broken.ST.why; broken.listeners.webglcontextlost({ preventDefault() {} });
  assert.equal(broken.ST.state, 'dom'); assert.equal(broken.ST.why, why);
});

// ---------------------------------------------------------------- 20: Business is untouched
test('20. Business preservation: the Business asset path still accepts only images; models exist only in Creative projects', () => {
  const projectStore = require('../lib/project-store');
  const glb = 'data:model/gltf-binary;base64,' + Buffer.from('glTF0000').toString('base64');
  const business = { meta: { id: 'b1' }, pages: [{ id: 'home', label: 'Home', sections: [] }], assets: { items: [{ id: 'x', dataUrl: glb }, { id: 'y', dataUrl: 'data:image/png;base64,AAAA' }] } };
  const check = projectStore.validateDirectionsState({ directions: [business], activeDirectionIndex: 0 });
  assert.ok(check.valid, check.error); const d = check.normalized.directions[0];
  assert.equal(d.mode, undefined); assert.equal(d.creative, undefined);
  assert.deepEqual((d.assets.items || []).map(i => i.id), ['y'], 'a non-image data URL is still refused in a Business project');
});
