'use strict';
// Section variants the renderer actually has (mirrors lib/refinement-normalizer.js SECTION_VARIANTS and script.js pickVariant).
// A "swap variant" repair is only possible for types listed here; every other type renders one layout.
const SECTION_VARIANTS = { services: ['described', 'numbered'], gallery: ['featured', 'grid'], testimonial: ['centered', 'card'], about: ['split', 'statement'], features: ['list', 'grid'], ctaBanner: ['accent', 'plain'], proof: ['statement', 'facts'] };
module.exports = { SECTION_VARIANTS };
