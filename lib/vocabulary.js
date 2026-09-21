// V8.5: the small slice of script.js's own controlled vocabulary the
// server needs to validate a persisted project against. Kept in exact
// sync with script.js by hand, the same one-for-one mirroring convention
// server.js's own WEBSITE_PLAN_TOOL schema already uses for the Claude
// tool schema (see server.js's SECTION_TYPE_KEYS/MODULE_TYPE_KEYS
// comments) -- script.js itself cannot be `require()`d here since it's
// written as a browser global-scope script, not a CommonJS module, so
// this is a deliberate, documented duplication, not an oversight.
'use strict';
const SECTION_TYPE_KEYS = ['proof', 'metrics', 'services', 'features', 'productShowcase', 'integrations', 'pricing', 'faq', 'process', 'gallery', 'caseStudies', 'imageLedEditorial', 'about', 'team', 'testimonial', 'testimonialsGrid', 'menu', 'reservationCta', 'serviceAreas', 'contact', 'newsletter', 'ctaBanner'];
const MODULE_TYPE_KEYS = ['contact', 'quote', 'newsletter', 'booking', 'location', 'action', 'product'];
const MODULE_SECTION_COMPATIBILITY = {
  contact: ['contact', 'ctaBanner', 'serviceAreas'],
  quote: ['services', 'contact', 'ctaBanner'],
  newsletter: ['newsletter', 'ctaBanner'],
  booking: ['reservationCta', 'contact', 'ctaBanner'],
  location: ['contact', 'serviceAreas'],
  action: ['contact', 'ctaBanner', 'reservationCta', 'productShowcase'],
  product: ['productShowcase']
};
const MODULE_FIELD_KEYS = ['name', 'email', 'phone', 'message', 'service', 'description', 'preferredContact', 'date', 'time', 'partySize', 'notes'];
const CTA_TARGET_KINDS = ['page', 'section', 'tel', 'mailto', 'external'];
const INTEGRATION_PROVIDER_KEYS = ['calendly', 'shopify', 'square', 'stripe', 'mailchimp', 'google-maps'];
const ACTION_KIND_KEYS = ['call', 'email', 'directions', 'external-booking', 'external-store'];

module.exports = {
  SECTION_TYPE_KEYS, MODULE_TYPE_KEYS, MODULE_SECTION_COMPATIBILITY,
  MODULE_FIELD_KEYS, CTA_TARGET_KINDS, INTEGRATION_PROVIDER_KEYS, ACTION_KIND_KEYS,
};
