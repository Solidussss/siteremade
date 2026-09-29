'use strict';
// THE ONE RULE for where a website's pictures come from -- shared by the browser (premium-core.js) and the server.
//
// The Business generator never uses externally generated (OpenAI) imagery. Every visual slot resolves as:
//   1. the customer's own uploaded picture
//   2. otherwise SiteRemade's deterministic starter / mockup visual (lib/premium/visuals.js: product UI, diagrams,
//      industry scenes, hero storyboard art -- inline SVG, identical in the preview and the export)
//   3. otherwise the designed CSS/SVG treatment
// It is never a reason to call /api/generate-image, to reserve image credits, to retry or regenerate a picture during
// the quality review, or to reject a finished website because no generated photo exists.
//
// Everything else the premium generator does -- planning, strategy, typography, composition, copy, starter visual
// profile selection, deterministic and responsive checks -- is unaffected by this rule.
//
// A future mode that legitimately uses generated imagery gets its own entry here with generatedImages: true; nothing
// else in the code decides this.
const MODES = {
  business: { generatedImages: false, visuals: 'upload > starter/mockup > designed' },
  creative: { generatedImages: false, visuals: 'upload > researched picture > designed' }, // Creative mode has its own pipeline
};

// A saved direction is Creative only when it says so (lib/project-store.js writes mode:'creative'); everything else,
// including every existing project and any direction with no mode at all, is the Business generator.
function generatorModeOf(project) {
  return project && project.mode === 'creative' ? 'creative' : 'business';
}
function businessUsesStarterVisualsOnly(project) {
  return generatorModeOf(project) === 'business' && !MODES.business.generatedImages;
}
function allowsGeneratedImages(project) {
  const m = MODES[generatorModeOf(project)];
  return !!(m && m.generatedImages);
}

module.exports = { MODES, generatorModeOf, businessUsesStarterVisualsOnly, allowsGeneratedImages };
