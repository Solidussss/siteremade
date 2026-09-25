# PREMIUM_COMPOSITION_V2 — page-level visual composition

Status: **built and tested offline, sub-flag OFF by default.** V1 (`PREMIUM_GENERATION_V1`) is unchanged and remains the base.
Checkpoint tag `v-premium-generation-v2-pre-composition` (= `45d7d81`). Branch `premium-composition-v2`.

Enable (staging first): `PREMIUM_GENERATION_V1=true` **and** `PREMIUM_COMPOSITION_V2=true`. The sub-flag is ignored unless V1 is on.

## 1. How composition worked before (traced in code)

* Sections come from a **per-category recipe** (`categorySectionRecipes` in script.js, e.g. roofing = serviceAreas, proof, caseStudies) or a planner page plan. Each section is chosen and rendered **independently**; nothing reasons about the page as a sequence.
* The only pacing concept is `pageRhythm` (4 values) → per-section `rhythmPosition` (open / proof / build / close) from the section's intent. It changes **only** section **width** and whether statement sections are **centred** (`applySectionRhythmPositions`). It has no notion of background, contrast with a neighbour, focal moments, CTA or footer.
* Every section shares one surface (`--site-bg`) separated by a structural `border-top` divider — the "box / divider / box" look. Measured across the 8 fixtures: **1 distinct background, 0 adjacent background changes, 4.3 divider lines per page.**
* The closing CTA is `<p>message</p><button>` with a builder-sounding default headline ("Ready to see this as your real website?" in the preview, "Ready to get started?" in exports). The footer is brand + location + copyright.
* Exports did **not** apply even the rhythm stamping (no port in `lib/site-render.js`), so the preview and the purchased site already differed.

### Causes of the repetitive output
1. Independent per-section decisions, no page-level plan. 2. One surface + structural dividers. 3. Width/alignment were the only levers. 4. Cards by default for most content. 5. Final CTA and footer with no composition of their own. 6. Generic default CTA copy. 7. Forms rendered as one giant pale panel.

## 2. What V2 adds (all deterministic, no model call, no image call)

`lib/premium/composition.js` plans the homepage as one visual sequence from the ordered sections, the archetype and the palette:

* **Roles** per section (ORIENT / TRUST / EDUCATE / SHOW / PROVE / STORY / CONVERT) and a **weight** (strong / medium / quiet).
* **Visual pacing**: weights are assigned so there are never three equal weights in a row, and every page reaches strong moments.
* **Visual moments** (2–3 per page, never adjacent, chosen by role and archetype): full-bleed media (only if the section really has an image, otherwise a contrast band), contrast band, typographic statement (only for short copy), offset composition, oversized process numerals, and the closing CTA band.
* **Neighbour contrast**: an explicit distance function (tone + weight + layout); every adjacent pair must score ≥ 1 or the planner adjusts it.
* **Surface system**: base / alt / contrast / brand, derived from the site's own palette. On a light site the contrast surface is a dark band; on a dark site it is a **deep brand tone** (a first attempt used a pale inversion and looked wrong on a dark roofing site — caught in review and changed). Tones work by overriding the site's own `--site-text/--site-bg/--site-accent` on the section, so existing rules adapt.
* **Dividers removed**; boundaries are tonal shifts, spacing and full-bleed media.
* **Cards only for repeated units** (services, features, pricing, team, integrations, product); prose sections (about, faq, process, areas, CTA) render open.
* **Closing CTA**: a composed band (large heading, action beside it) with a **business-specific headline from the conversion goal** ("Reserve a table in Vancouver", "Request a quote for your roof in Calgary", "Get involved in Winnipeg") instead of generic filler. If a site has no closing conversion section, the review inserts one (free).
* **Forms**: tighter width, on a contrasting surface, two short fields per row.
* **Footer**: "resolved" footer — wordmark, category, the place (only if supplied), the site's own primary CTA, copyright; tone by archetype (quiet for restrained brands). No invented contact data or social links.
* **Archetype grammar**: `assertive` (local trades/professional), `restrained` (consultancy: 2 moments, quiet footer, statements), `immersive` (hospitality/portfolio/editorial: media-forward), `structured` (SaaS/launch/ecommerce), `story` (nonprofit).
* **Rubric** (extends V1): `VISUAL_PACING`, `SECTION_CONTRAST`, `COMPOSITION_VARIETY` (incl. `REPETITIVE_COMPOSITION`, `card_overuse`), `CTA_STRENGTH`, `FOOTER_COMPLETION`. Reported `NOT_APPLICABLE` when the flag is off. Evaluated on the home page only.
* **Surgical repair**: missing final CTA → insert one; unsupported testimonial sections → removed as **one** repair action (previously three removals used up the 3-action limit and starved the CTA repair — found by the fixtures). Composition repairs cost $0.
* **Preview + export parity**: the same plan is stamped as `data-comp-*` attributes by `comp-stamp.js` (DOM for the preview, HTML strings for the export), and the same tokens/CSS apply. Data-driven from `design.premiumTokens`, so stored projects keep their look regardless of the flag.

Cost control: composition adds **no** model or image calls. Measured: identical cost in V1 and V2 for all 8 fixtures.

## 3. Evidence (8 fixtures, real client + real server, mock providers)

Re-run: `FIX_MODES=legacy,premium,v2 node …electron premium-fixtures/run-fixtures.js` (see `premium-fixtures/`). Raw results: `premium-fixtures/results-v2/`. Screenshots (desktop 1300px, phone 416px frame, legacy / V1 / V2): `C:\Users\jayde\Documents\siteremade-premium-fixtures-v2\shots\`.

Objective layout measurements from the laid-out DOM (independent of the planner), averages over 8 fixtures:

| metric | V1 | V2 |
|---|---|---|
| distinct section backgrounds | 1.0 | 3.4 |
| adjacent background changes | 0 | 4.3 |
| full-width bands | 1.1 | 3.3 |
| structural top dividers | 4.3 | 0 |
| card-framed elements | 2.3 | 2.3 (not reduced: the fixtures use few cards and the ones present are in card-appropriate sections) |
| estimated cost / site | $1.38 | $1.38 |
| wall time (mock providers) | 5.72 s | 5.73 s |

Mobile (390 and 360 px, measured in the app's mobile preview frame, 16 runs): **no horizontal overflow in any run**; compositions collapse to one column (CTA band stacks, offset layouts stack, full-bleed gets side padding).

## 4. What is NOT proven
* Real image quality and real model output (mock providers; images are synthetic). Screenshots show composition, hierarchy, pacing and crops — not photography.
* Whether the result feels worth CAD $149.99 to a customer. The composition rubric is graded by the same rules that plan the page, so its all-PASS result is a consistency check, not independent proof; the DOM measurements above are the independent evidence. **The screenshots need your eyes.**
* Exported-site rendering was verified through shared code and unit tests, not screenshotted separately.

## 5. Known remaining weaknesses
* The hero is unchanged by V2 (it still comes from the legacy hero variants); composition starts below it.
* Process "large steps" only affects variants whose markup exposes numbered/node elements; the dot-timeline variant still reads generic on some archetypes.
* Sections with no funded imagery can't be full-bleed (by design); sites without real media stay image-light.
* Pre-existing: the location extractor yields fragments like "Winnipeg. We" (shown in the footer location line); V2 sanitises it in the CTA headline only.
* Forms that are not `.module-form` markup don't get the two-column layout.
* Section text colours hard-coded in legacy CSS inside contrast/brand bands may need tuning per component; checked on the 8 fixtures only.
* One-off flake in the harness (server start race) — re-run passed.

## 6. Rollout
Keep OFF. Suggested order: run the fixtures with real keys on staging → review screenshots → enable `PREMIUM_COMPOSITION_V2` on staging only → small share of production.
