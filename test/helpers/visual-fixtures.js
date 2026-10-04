'use strict';
// THE VISUAL DIRECTOR'S FIXTURES (test/creative-visual.test.js): pages that are structurally valid but LOOK wrong in one
// deliberate way each -- built from real generated pages (the six subjects, stand-in pictures drawn from what the studio
// measured), then changed in the one place the fixture is about:
//   A subject too small        the opening's picture shrunk to a corner
//   B weak text contrast       giant dark type crossing a dark portrait (the page as generated: editorial, seed 1)
//   C dead space               a scene's pictures shrunk to specks on an empty field
//   D poor balance             everything in a scene pushed to its left edge
//   E weak payoff              the ending's picture shrunk, after a strong scene (editorial, seed 2)
//   F strong page              a page that needs nothing (editorial, seed 2, as generated)
//   G 3D too small             a real model (the committed GLB) staged far from its camera in a small box
//   H video under-dominant     a delivered clip on a small picture layer
//   I mobile-only failure      the opening fine at 1440, its picture a speck at 390
// fixture(name) -> { name, expect: { issue, scene, view } | null, plan, input, pictures(asset), threeD?, videoSrc? }
const fs = require('fs');
const path = require('path');
const D2 = require('../../lib/creative/director2');
const { validatePlan2 } = require('../../lib/creative/validate2');
const { SUBJECTS } = require('./creative-subjects');
const { svgOf } = require('./stand-in-pictures');

const deep = x => JSON.parse(JSON.stringify(x));
const pictures = a => ({ buf: Buffer.from(svgOf(a)), mime: 'image/svg+xml' });
function page(id, seed) {
  const s = SUBJECTS[id];
  const { plan, recipe } = D2.direct({ understanding: s.understanding, research: { page: null, facts: s.facts }, assets: s.assets, supplied: { facts: [], memories: [] }, seed, mainAsset: s.mainAsset });
  const v = validatePlan2(plan, { assets: s.assets, facts: s.facts, understanding: s.understanding, art: recipe, mainAsset: s.mainAsset });
  if (v.errors.length) throw new Error(`${id}/${seed}: ${v.errors[0]}`);
  return { plan: v.plan, input: { assets: s.assets, facts: s.facts, understandingLegacy: s.understanding, mainAsset: s.mainAsset } };
}
// a changed page, validated as a saved page is (the fixture is a page the system could hold)
function saved(p, input) { const v = validatePlan2(p, { assets: input.assets, facts: input.facts, understanding: input.understandingLegacy, mode: 'safety' }); if (v.errors.length) throw new Error(v.errors[0]); return v.plan; }
const focal = sc => sc.layers.find(L => L.kind === 'image' && L.role === 'focal') || sc.layers.find(L => L.kind === 'image');

const BUILD = {
  A() { const { plan, input } = page('software', '1'); const p = deep(plan); focal(p.scenes[0]).box.d = [78, 70, 12, 12]; return { plan: saved(p, input), input, expect: { issue: ['hero_subject_too_small', 'hero_lacks_dominance'], scene: 0, view: 'desktop' } }; },
  B() { const { plan, input } = page('editorial', '1'); return { plan, input, expect: { issue: ['headline_lost_in_image'], scene: 0, view: 'desktop' } }; },
  C() { const { plan, input } = page('software', '1'); const p = deep(plan); p.scenes[2].layers.filter(L => L.kind === 'image').forEach(L => { L.box.d = [L.box.d[0] + L.box.d[2] * 0.4, L.box.d[1] + L.box.d[3] * 0.4, L.box.d[2] * 0.2, L.box.d[3] * 0.2]; }); return { plan: saved(p, input), input, expect: { issue: ['too_much_dead_space'], scene: 2, view: 'desktop' } }; },
  D() { const { plan, input } = page('software', '1'); const p = deep(plan); const sc = p.scenes[2]; sc.layers.filter(L => L.kind === 'image').forEach((L, k) => { L.box.d = [2, 8 + k * 30, 16, 22]; }); if (sc.text.place) sc.text.place = Object.assign({}, sc.text.place, { gc: [1, 3] }); return { plan: saved(p, input), input, expect: { issue: ['crowded_one_side', 'poor_balance'], scene: 2, view: 'desktop' } }; },
  E() { const { plan, input } = page('editorial', '2'); const p = deep(plan); const n = p.scenes.length; const L = focal(p.scenes[n - 1]); L.box.d = [42, 38, 16, 22]; L.box.m = [30, 30, 40, 24]; return { plan: saved(p, input), input, expect: { issue: ['payoff_weaker_than_previous', 'weak_final_payoff'], scene: n - 1, view: 'desktop' } }; },
  F() { const { plan, input } = page('editorial', '2'); return { plan, input, expect: null }; },
  G() {
    // the 3D test page (an uploaded bottle, its cut-out) with the committed, normalised model staged in its opening
    const FIX = path.join(__dirname, '..', 'fixtures', 'three-d'); const GLB = require('../../lib/three-d').glb; const FX = require('../fixtures/three-d/make-fixture');
    const NORMAL = fs.readFileSync(path.join(FIX, 'product-normalized.glb')); const info = GLB.inspect(NORMAL).info;
    const PHOTO = FX.productPhoto(240, 300, false), CUT = FX.productPhoto(240, 300, true);
    const assets = [
      { id: 'u-bottle', origin: 'upload', ownerRole: 'main', title: 'Aurelia tonic', alt: 'A bottle of Aurelia tonic', mime: 'image/png', assetRef: 'a'.repeat(64), assess: { width: 1200, height: 1500, aspect: 0.8, orientation: 'portrait', subject: [0.15, 0.07, 0.85, 0.93], colours: ['#1a528c', '#d49e38'], luminance: 130, background: { colour: '#f1ece2', uniformity: 0.95, tolerance: 12 }, transparent: false }, caps: { moveFreely: false, frame: true, backdrop: false, heroSize: true }, curation: { role: 'subject', identity: 'exact', depicts: 'the bottle', issues: [], separable: true, framing: 'whole' } },
      { id: 'c-bottle', origin: 'derived', cutout: true, cutoutOf: 'u-bottle', title: 'Aurelia tonic', alt: 'A bottle of Aurelia tonic', mime: 'image/png', assetRef: 'b'.repeat(64), assess: { width: 1200, height: 1500, aspect: 0.8, orientation: 'portrait', subject: [0.15, 0.07, 0.85, 0.93], colours: ['#1a528c'], luminance: 110, transparent: true, transparentShare: 0.5 }, caps: { moveFreely: true, frame: false, backdrop: false, heroSize: true } },
    ];
    const UND = { kind: 'invented', subject: 'Aurelia Tonic', brief: 'a launch page for Aurelia, a small-batch tonic in a blue glass bottle', tone: { register: 'cinematic' }, identity: { name: 'Aurelia Tonic', kind: 'invented', what: 'a small-batch tonic drink product', type: 'product' } };
    const d = D2.direct({ understanding: UND, research: { page: null, facts: [] }, assets, supplied: { facts: ['Aurelia is bottled in small batches.'], memories: [] }, seed: '1', prefer: { family: 'poster-to-scene', mode: 'expressive' }, mainAsset: 'u-bottle' });
    const v = validatePlan2(d.plan, { assets, facts: [], understanding: UND, art: d.recipe, mainAsset: 'u-bottle' }); if (v.errors.length) throw new Error(v.errors[0]);
    const plan = v.plan; const at = plan.scenes.findIndex(s => s.layers.some(L => L.kind === 'image' && ['u-bottle', 'c-bottle'].includes(L.asset)));
    const p = deep(plan); const L = p.scenes[at].layers.find(x => x.kind === 'image' && ['u-bottle', 'c-bottle'].includes(x.asset)); L.box.d = [64, 52, 16, 22];
    const input = { assets, facts: [], understandingLegacy: UND, mainAsset: 'u-bottle' };
    const threeD = { assets: [{ id: 'td-fixture', sourceAssetId: 'u-bottle', title: 'Aurelia tonic bottle', bytes: info.bytes, bounds: info.bounds, center: info.center, scale: 0.02451, triangles: info.triangles, textures: { count: info.textures.count, maxSize: info.textures.maxSize }, provenance: { provider: 'mock', providerAssetId: 'mock3d_1', processor: 'blender 4.5.9', requestId: 'r1', at: '2026-10-01T00:00:00.000Z' }, dataUrl: 'data:model/gltf-binary;base64,' + NORMAL.toString('base64') }],
      scenes: [{ id: 'td-product', assetId: 'td-fixture', sectionId: plan.scenes[at].id, composition: 'scroll-rotate', turns: 1, camera: { fov: 32, azimuth: 0, elevation: 8, distance: 2.2 } }] };
    const pics = a => ({ buf: a.id === 'c-bottle' ? CUT : PHOTO, mime: 'image/png' });
    return { plan: saved(p, input), input, pictures: pics, threeD, model: NORMAL, expect: { issue: ['3d_too_small'], scene: at, view: 'desktop' } };
  },
  H() { const { plan, input } = page('software', '1'); const p = deep(plan); const L = focal(p.scenes[1]); L.box.d = [44, 30, 50, 55]; const clip = L.asset;
    const assets = input.assets.map(a => (a.id === clip ? Object.assign({}, a, { video: { mediaId: 'pm_fixture', assetRef: 'c'.repeat(64), mime: 'video/mp4', intent: 'cinematic_hero' } }) : a));
    const inp = Object.assign({}, input, { assets }); return { plan: saved(p, inp), input: inp, videoSrc: a => (a.video ? 'clip.mp4' : ''), expect: { issue: ['video_underused'], scene: 1, view: 'desktop' } }; },
  I() { const { plan, input } = page('software', '1'); const p = deep(plan); focal(p.scenes[0]).box.m = [56, 58, 30, 18]; return { plan: saved(p, input), input, expect: { issue: ['mobile_loses_impact'], scene: 0, view: 'mobile' } }; },
};
const NAMES = Object.keys(BUILD);

// THE ENDING AND THE TYPE (the two blind spots of the first real-photo review): endings judged as endings, and a second
// piece of large type over the heading -- with the intentional layering that must stay untouched
//   PA  the final product a speck, after a text-only scene               -> weak_final_payoff
//   PB  a restrained luxury ending (a small, deliberate subject)           -> nothing
//   PC  an editorial page ending on typography (editorial, seed 3)         -> nothing
//   TD  a solid copy of the heading lying over it                         -> competing_heading_overlap
//   TE  a giant word behind the product, clear of the heading             -> nothing
//   TF  a faint display word behind a readable heading                    -> nothing
//   TG  an edge label beside the heading                                  -> nothing
const word = (id, text, d, m, z, opacity, style) => ({ id, kind: 'word', role: 'echo', word: { text, style: style || 'solid' }, box: { d, m }, z, rotate: 0, opacity, mask: 'none', treatment: 'none', entrance: { kind: 'none', delay: 0, dur: 1 }, loop: { kind: 'none', amp: 1, period: 9 }, scroll: { kind: 'none', amount: 0.4 }, hideM: false });
const BUILD2 = {
  PA() { const { plan, input } = page('skincare', '1'); const p = deep(plan); const n = p.scenes.length; const L = focal(p.scenes[n - 1]); L.box.d = [48, 44, 3.5, 5]; L.box.m = [46, 44, 8, 6]; return { plan: saved(p, input), input, expect: { issue: ['weak_final_payoff'], scene: n - 1, view: 'desktop' } }; },
  PB() { const { plan, input } = page('skincare', '1'); return { plan, input, expect: null, absent: ['weak_final_payoff'] }; },
  PC() { const { plan, input } = page('editorial', '3'); if (plan.scenes[plan.scenes.length - 1].layout !== 'giant-type') throw new Error('PC: editorial seed 3 no longer ends on giant type'); return { plan, input, expect: null, absent: ['weak_final_payoff', 'payoff_weaker_than_previous'] }; },
  TD() { const { plan, input } = page('software', '1'); const p = deep(plan); const sc = p.scenes[1]; sc.layers.push(word('ghost', sc.text.heading.slice(0, 24), [4, 46, 32, 16], [6, 60, 88, 10], 4, 0.85)); return { plan: saved(p, input), input, expect: { issue: ['competing_heading_overlap'], scene: 1, view: 'desktop' } }; },
  TE() { const { plan, input } = page('software', '1'); const p = deep(plan); const sc = p.scenes[1]; sc.layers.unshift(word('behind', 'ORBITLY', [46, 10, 52, 70], [0, 4, 100, 40], 1, 1)); return { plan: saved(p, input), input, expect: null, absent: ['competing_heading_overlap'] }; },
  TF() { const { plan, input } = page('software', '1'); const p = deep(plan); const sc = p.scenes[1]; sc.layers.unshift(word('watermark', 'LOOKS', [0, 30, 100, 44], [0, 40, 100, 30], 1, 0.12)); return { plan: saved(p, input), input, expect: null, absent: ['competing_heading_overlap'] }; },
  TG() { const { plan, input } = page('software', '1'); const p = deep(plan); const t = p.scenes[1].text; t.kicker = 'Detail'; t.treatment = 'vertical'; return { plan: saved(p, input), input, expect: null, absent: ['competing_heading_overlap'] }; },
};
const NAMES2 = Object.keys(BUILD2);
function fixture(name) { const f = (BUILD[name] || BUILD2[name])(); return Object.assign({ name, pictures }, f); }
module.exports = { NAMES, NAMES2, fixture, pictures, page };
