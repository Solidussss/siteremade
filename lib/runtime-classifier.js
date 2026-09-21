// V8.6: deterministic project-runtime classification (spec §5). Reads
// ACTUAL project state (which functionality module TYPES are enabled,
// anywhere in the selected direction's pages/sections) -- never guesses
// from category, never asks the client. A project is 'server_required' the
// moment it enables even one module type whose honest behavior needs a
// real backend to receive a submission; otherwise it is 'static'.
'use strict';

// Module types that, when enabled, mean *something* has to receive and
// process a real visitor-submitted payload server-side to be honest about
// it (see lib/site-render.js's renderFormModuleWidget / V8.4's
// MODULE_TYPE_KEYS). location/action/product are deliberately absent here:
// per lib/vocabulary.js's MODULE_SECTION_COMPATIBILITY and script.js's own
// renderers (actionModuleTarget/renderProductModuleWidget/
// renderLocationModuleWidget), those three only ever resolve to a plain
// tel:/mailto:/external link, a static address placeholder, or an external
// checkout URL -- never a form POST -- so they stay static-compatible no
// matter how they're configured.
const SERVER_REQUIRED_MODULE_REASONS = {
  contact: 'contact_form_submission',
  quote: 'quote_request',
  booking: 'booking_request',
  newsletter: 'newsletter_submission',
};

// `direction` is one entry of directionsState.directions[] (a full
// WebsiteProject: pages[].sections[].module). Walks every page/section --
// not just the active page -- since an export always ships every page
// (§24), so a server-required module buried on a secondary page must still
// classify the whole project as server_required.
function classifyRuntime(direction) {
  const reasons = new Set();
  (direction.pages || []).forEach(page => {
    (page.sections || []).forEach(section => {
      const m = section.module;
      if (!m || !m.enabled) return;
      const reason = SERVER_REQUIRED_MODULE_REASONS[m.type];
      if (reason) reasons.add(reason);
      // Forward-looking, currently inert in this sandbox: project-store.js's
      // validateModule always forces integration.connected=false server-side
      // (never trusts a client claim of a live integration -- see its own
      // comment), so this branch cannot fire today, but a genuinely wired
      // future integration (§5's "future server-backed integration") should
      // classify as server_required without this file needing to change.
      if (m.integration && m.integration.connected && m.integration.provider) {
        reasons.add('configured_integration_' + m.integration.provider);
      }
    });
  });
  const runtimeReasons = Array.from(reasons).sort();
  return { runtimeType: runtimeReasons.length ? 'server_required' : 'static', runtimeReasons };
}

module.exports = { classifyRuntime, SERVER_REQUIRED_MODULE_REASONS };
