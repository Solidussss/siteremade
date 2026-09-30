'use strict';
// CREATIVE — renderer tiers (shared: server, studio bundle).
//
// Every page is described once, as validated data (scenes + timeline); a RENDERER turns it into a page. Two tiers:
//   dom      the default and the only one implemented: HTML/CSS with a small fixed runtime (render2.js). Transforms,
//            opacity and clip-path only; cached geometry; phone recomposition; reduced motion. Always available.
//   spatial  a DELIBERATE heavier tier for concepts that genuinely need true 3D: WebGL / Three.js scenes, 3D models,
//            particles, shader effects, a real camera, morphs. NOT implemented in this build: a plan that asks for it is
//            rendered by the dom tier, and says so (data-renderer="dom", plan.timeline.renderer kept as the request).
//
// The interface a spatial renderer must meet (so it can be added without touching the planner or the validator):
//   - render(plan, assets, opts) -> the same kind of single, self-contained HTML page, from the SAME timeline (actors,
//     keys, beats, transitions, rhythm, moments) -- the plan never contains renderer-specific code;
//   - its dependencies (e.g. three.js) are loaded only by pages that use it, from the export itself (no CDN), with a size
//     budget stated here;
//   - it embeds the dom rendering as its fallback: phones below its capability floor, reduced motion, no WebGL, no
//     scripting, a failed context -- all get the dom page, never a blank one;
//   - it keeps the dom tier's rules: no layout reads per frame, a bounded frame budget, never enlarging a picture past
//     its pixels, the owner's words and credits unchanged.
// A renderer is chosen per page by resolve(plan, env): the request, if that renderer is available and enabled
// (CREATIVE_SPATIAL=on and implemented), else dom.

const RENDERERS = {
  dom: { id: 'dom', available: true, note: 'HTML/CSS with the fixed Creative runtime' },
  spatial: { id: 'spatial', available: false, note: 'not implemented in this build: rendered as dom', wants: ['webgl', 'three.js (bundled with the export, not a CDN)', '3D models (glTF)', 'particles', 'shaders', 'true camera motion', 'morph targets'], budgetKb: 900 },
};

function resolve(plan, env) {
  const want = (plan && plan.timeline && plan.timeline.renderer) || 'dom';
  const e = env || (typeof process !== 'undefined' && process.env) || {};
  const r = RENDERERS[want];
  if (r && r.available && (want !== 'spatial' || String(e.CREATIVE_SPATIAL || '').toLowerCase() === 'on')) return r;
  return RENDERERS.dom;
}

module.exports = { RENDERERS, resolve };
