'use strict';
// CREATIVE — renderer tiers (shared: server, studio bundle).
//
// Every page is described once, as validated data (scenes + timeline); a RENDERER turns it into a page. Two tiers:
//   dom      the default and the only one implemented: HTML/CSS with a small fixed runtime (render2.js). Transforms,
//            opacity and clip-path only; cached geometry; phone recomposition; reduced motion. Always available.
//   spatial  a DELIBERATE, optional tier for concepts that genuinely gain from real depth (spatial.js decides, only with
//            CREATIVE_SPATIAL=on): the complete DOM page PLUS a small WebGL layer (spatial-runtime.js, inlined -- no CDN,
//            no library) that draws the actors, set pieces (camera flight, lineup, card planes, point globe), particles
//            and spatial transitions behind the words, and removes itself on any failure (no WebGL, lost context, a slow
//            device, reduced motion), leaving the DOM page.
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
// TRUE 3D MODELS ARE NOT A TIER. A real model of the owner's subject (three-d.js: a GLB normalised by Blender, drawn by the
// three.js engine in vendor/three-d/) is a stage INSIDE a section of either tier: the dependency rule above applies to it
// -- the engine is a file of the page itself, fetched only by a page with a 3D scene, ~627 KB (161 KB gzipped) -- and its
// fallback is the section's own picture. The spatial tier's small GLB reader is unrelated and unchanged.
// A renderer is chosen per page by resolve(plan): the validated plan's own renderer. The flag gates the CHOICE (when a
// page is composed); a page accepted as spatial renders the same in the studio, on reopening and in its export.

const RENDERERS = {
  dom: { id: 'dom', available: true, note: 'HTML/CSS with the fixed Creative runtime' },
  spatial: { id: 'spatial', available: true, note: 'the DOM page plus a bounded WebGL layer (spatial-runtime.js, inlined)', has: ['webgl', 'image planes', 'billboards', 'one GLB model', 'particles', 'point globe + arcs', 'camera keys', 'image dissolve / cross-morph'], lacks: ['geometry morph targets', 'skinned / animated models', 'compressed models (Draco, meshopt)', 'arbitrary shaders'], budgetKb: 60 },
};

function resolve(plan) {
  const tl = plan && plan.timeline; const want = (tl && tl.renderer) || 'dom';
  const r = RENDERERS[want];
  if (r && r.available && (want !== 'spatial' || (tl.spatial && typeof tl.spatial === 'object'))) return r;
  return RENDERERS.dom;
}
// the CREATIVE_SPATIAL flag, read where pages are composed (the server) and passed to the validator as ctx.spatial
function enabled(env) { const e = env || (typeof process !== 'undefined' && process.env) || {}; return String(e.CREATIVE_SPATIAL || '').toLowerCase() === 'on'; }

module.exports = { RENDERERS, resolve, enabled };
