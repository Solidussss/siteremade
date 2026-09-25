'use strict';
// Which operations deserve the strong model, which a cheap model, and which
// need no model at all. Strong models are reserved for work where stronger
// reasoning materially changes the site.

const OPERATIONS = Object.freeze({
  // STRONG: positioning, art direction, architecture, hierarchy, image roles, critique, hard repair
  understand_business: 'strong', art_direction: 'strong', page_architecture: 'strong', section_hierarchy: 'strong',
  image_role_planning: 'strong', whole_site_critique: 'strong', repair_decision: 'strong',
  // CHEAP: extraction, classification, repetitive fields, basic rewrites
  extraction: 'cheap', classification: 'cheap', field_generation: 'cheap', copy_rewrite_basic: 'cheap',
  // DETERMINISTIC: no model
  normalization: 'deterministic', metadata: 'deterministic', formatting: 'deterministic', render_decision: 'deterministic',
  image_generation: 'image', image_evaluation: 'deterministic',
});

function routeOperation(operation, cfg) {
  const tier = OPERATIONS[operation];
  if (!tier) throw new Error('unknown premium operation: ' + operation);
  if (tier === 'deterministic') return { operation, tier, model: null };
  if (tier === 'image') return { operation, tier, model: cfg.models.imageSupport };
  return { operation, tier, model: cfg.models[tier] };
}

module.exports = { OPERATIONS, routeOperation };
