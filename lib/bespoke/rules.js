'use strict';
// BESPOKE (v5) -- the rules every bespoke page is written under. This is the process behind the hand-built Calgary
// sites (54 of them): one page designed for one business, from its own facts and photos only, with one signature
// interaction made from that business, checked by screenshots. lib/bespoke/validate.js enforces what can be checked
// in code; the rest is in these instructions and in the visual review (lib/bespoke/pipeline.js).

// display fonts never used (too generic); body text may use anything calm except these too
const BANNED_FONTS = ['Inter', 'Roboto', 'Arial', 'Open Sans', 'Helvetica', 'Poppins'];
// copy that reads as template filler
const BANNED_WORDS = ['elevate', 'elevated experience', 'curated experience', 'unleash', 'seamless', 'world class', 'world-class', 'nestled', 'look no further', 'lorem ipsum'];
// the only things a page may load from outside itself
const ALLOWED_EXTERNAL = [
  /^https:\/\/fonts\.googleapis\.com(?:\/|$)/,
  /^https:\/\/fonts\.gstatic\.com(?:\/|$)/,
  /^https:\/\/cdn\.jsdelivr\.net\/npm\/gsap@3\.12\.5\//,
  /^https:\/\/cdn\.jsdelivr\.net\/npm\/lenis@1\.1\.13\//,
];

const PROCESS = `You design and build ONE website for ONE real business. Every page must feel like it was designed for this
business only: never a template with new words.

Facts
- Use only facts in the FACT SHEET and words printed in the business's own photos. Never invent prices, hours, phone
  numbers, reviews, stats, awards, menu items, staff names, opening dates or offers.
- A fact that is missing is left out, or labelled with where to find it ("Hours on Instagram").
- A business that is not open yet: the primary action is to follow or join a list, and the page says it is coming.

Photos
- Only the business's own photos, from the PHOTOS list, by file name. No stock, no hosted media, no AI images.
- Never use photos of identifiable customers or creator/influencer content as page media. Crop out text overlays,
  app UI and watermarks. Hands are fine.

Direction
- One signature interaction people would screenshot, made from THIS business (their product, their room, their
  slogan, their trade), working by touch, mouse and keyboard, with a still state. Plus 2 to 4 quiet supporting
  techniques. Never stack effects.
- One display font from Google Fonts that is not in the USED FONTS list and not ${BANNED_FONTS.join(', ')}. A calm body
  font (not those six either).
- Colours from the brand itself: sign, logo, packaging, room. Exact hex values.

Page rules (all required)
- One file: inline CSS and JS, Google Fonts, and only if needed gsap@3.12.5 and lenis@1.1.13 from cdn.jsdelivr.net.
  Images from media/<file> only.
- The first CSS rule is html,body{background:<colour>}; html and body use overflow-x:clip.
- Still mode: ?still in the URL (and prefers-reduced-motion) skips entrance animation and autoplay and shows the final
  state, including the signature's resting state.
- Fail safe: content is hidden for animation only after JS adds a "js" class to <html>, and a setTimeout of at most
  3500 ms forces everything visible.
- <html lang>, <title>, meta description, <meta name="robots" content="noindex">, alt text on every image, visible
  focus styles, a skip link to #main, tap targets of at least 44px, every link real (no href="#").
- One primary action (book, order, directions, call, follow, shop) repeated in the nav, the hero and the last section.
  Directions use https://www.google.com/maps/search/?api=1&query=<address>.
- When nav links are hidden on phones, a menu button opens a full-height panel (Escape closes it).
- A tagline section whose words light up in reading order on scroll (all lit in still mode).
- Cap hero height (for example min-height:min(100svh,1000px)). No horizontal overflow at 390px wide.
- Buttons that are inline-flex with gap wrap their label in ONE <span>.

Copy
- Short, specific, warm, in the business's own tone. Headlines 3 to 9 words with a point of view about this place.
- No hyphens inside sentences. Never: ${BANNED_WORDS.join(', ')}.`;

module.exports = { PROCESS, BANNED_FONTS, BANNED_WORDS, ALLOWED_EXTERNAL };
