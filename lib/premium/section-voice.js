'use strict';
// SECTION VOICE -- the archetype-specific wording of the testimonial sections,
// shared by the live preview (script.js sectionVocab overlays it) and the export
// (lib/site-render.js), which used to show three generic quotes on every site
// whatever the business. Illustrative placeholder quotes meant to be replaced
// by the owner's real reviews; never presented as verified proof. Moved here
// verbatim from script.js's ARCHETYPE_SECTION_VOCAB so both sides show the same words.
const TESTIMONIAL_VOICE = {
  "service-business": {
    label: "What Clients Say",
    quotes: [
      "Clear communication from start to finish.",
      "A considered process, from first conversation to final delivery.",
      "Useful expertise without unnecessary complexity."
    ],
    attribution: "Client"
  },
  hospitality: {
    label: "What Guests Say",
    quotes: [
      "A room worth returning to.",
      "Every detail felt considered, right down to the pacing.",
      "The kind of evening you end up telling people about."
    ],
    attribution: "Regular guest"
  },
  "premium-consultancy": {
    label: "What Clients Say",
    quotes: [
      "Exactly the kind of judgment you want on something this important.",
      "Discreet, thorough, and worth every conversation.",
      "A rare level of care for the details that matter."
    ],
    attribution: "Private client"
  },
  portfolio: {
    label: "Client Feedback",
    quotes: [
      "Work that speaks for itself.",
      "Exactly the direction we didn’t know we needed.",
      "Meticulous, from the first sketch to the final file."
    ],
    attribution: "Client"
  },
  "product-led-saas": {
    label: "What Teams Say",
    quotes: [
      "It just works, and support actually answers.",
      "Cut our setup time down to almost nothing.",
      "The one tool the whole team actually uses."
    ],
    attribution: "Product lead"
  },
  "editorial-brand": {
    label: "In Their Words",
    quotes: [
      "Every piece feels considered.",
      "A point of view you can actually see.",
      "Quality that holds up past the first wear."
    ],
    attribution: "Customer"
  },
  "ecommerce-showcase": {
    label: "What Customers Say",
    quotes: [
      "Exactly as described, and it arrived fast.",
      "The quality is obviously a step up.",
      "Already ordered a second time."
    ],
    attribution: "Customer"
  },
  "local-conversion": {
    label: "What Customers Say",
    quotes: [
      "Showed up on time and did it right the first time.",
      "Straightforward pricing, no surprises.",
      "Would call them again without hesitation."
    ],
    attribution: "Local customer"
  },
  "trust-heavy-professional": {
    label: "What Clients Say",
    quotes: [
      "Finally, someone who explains things clearly.",
      "Diligent and always reachable when it mattered.",
      "Handled things I didn’t even know to ask about."
    ],
    attribution: "Client"
  },
  "launch-campaign": {
    label: "Early Feedback",
    quotes: [
      "Exactly the kind of thing I’ve been waiting for.",
      "Already better than what I was using.",
      "Glad I got in early."
    ],
    attribution: "Early user"
  },
  "community-nonprofit": {
    label: "Voices from the Community",
    quotes: [
      "This work made a real difference for us.",
      "Transparent about where the help actually goes.",
      "Easy to get involved, and it mattered."
    ],
    attribution: "Community member"
  }
};
// Care businesses sit in the trades' archetype ('local-conversion'), whose
// quotes ("Straightforward pricing, no surprises.") read wrong for a clinic,
// spa or gym -- they get their own voice.
const CATEGORY_TESTIMONIAL = {
  wellness: { label: 'What Clients Say', quotes: ['They listened first, then explained what they would do.', 'Easy to book, and I always knew what came next.', 'I left feeling better than when I walked in.'], attribution: 'Client' },
  fitness: { label: 'What Members Say', quotes: ['Sessions built around where I actually am.', 'A clear plan, and progress I can see.', 'The coaching keeps me coming back.'], attribution: 'Member' },
};
function testimonialVoice(archetype, categoryKey) { return CATEGORY_TESTIMONIAL[categoryKey] || TESTIMONIAL_VOICE[archetype] || TESTIMONIAL_VOICE['service-business']; }
// Deterministic per-business pick, same rule as script.js renderTestimonial.
function pickQuote(voice, seedHash) { return voice.quotes[Math.abs(seedHash || 0) % voice.quotes.length]; }

// Care businesses share the 'local-conversion' archetype with trades, whose
// process ("A straight quote", "We do the work") reads wrong for a clinic or a
// coach -- they get an appointment-shaped process instead, in both renderers.
const CATEGORY_PROCESS = {
  wellness: { label: 'Your First Visit', steps: ['Book online', 'An assessment first', 'A plan for you', 'Follow-up sessions'] },
  fitness: { label: 'Getting Started', steps: ['Book a first session', 'Talk through your goals', 'Train with a plan', 'Track your progress'] },
  education: { label: 'How It Works', steps: ['Get in touch', 'A first session', 'A plan that fits', 'Steady progress'] },
};
function processVoiceFor(categoryKey) { return CATEGORY_PROCESS[categoryKey] || null; }

module.exports = { TESTIMONIAL_VOICE, CATEGORY_TESTIMONIAL, testimonialVoice, pickQuote, CATEGORY_PROCESS, processVoiceFor };
