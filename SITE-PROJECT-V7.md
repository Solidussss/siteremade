# SiteRemade generator — V7: generation quality & visual differentiation

V7 does not add product surface area — it fixes why the generator kept
producing near-identical websites, and adds the imagery/section/copy depth
needed for a result to actually look built for the business described.
Nothing in this pass touches deployment; see "Verification" at the end.

## 1. Why results were converging (the audit)

The V5/V6 compositional system was real (every dimension really was scored
against the text), but every fallback path led back to the same place:

- **Category detection had gaps a normal sentence falls straight through.**
  `categoryKeywords.tech` was `['software','saas','startup','tech company',
  'platform','api','app']`. The literal phrase **"AI company"** matches none
  of those — no "software", no "saas", no "tech company" (needs the exact
  two-word phrase). `rankedKeys()` then falls back to `'other'`, the single
  most generic category in the file (`headline: 'Built to make a strong
  first impression.'`, `sub: 'A modern website that makes the quality of
  your business obvious...'`). **This is exactly the bootstrap placeholder's
  category too** — so "AI company in Vancouver" and the untouched demo
  preview were, structurally, the same object. This is the single biggest
  cause of the bug in the bug report.
- **Style-seed matching had the same gap**, and even when it matched
  something, **every other dimension that had no explicit keyword hit fell
  back to *that one named seed's* fixed values** — not to anything about
  the detected category. Two businesses in totally different categories
  that both landed on `precision` (the highest-frequency seed, and the
  bootstrap's own seed) got the identical hero layout, type, nav, card,
  imagery and palette.
- **Palette was a straight copy of the seed's 4 fixed hex codes.** Not
  generated, not varied — `composed.palette = seed.palette`, full stop. Any
  two results on the same seed were pixel-identical in color.
- **The hero was one DOM shape wearing 6 different CSS coats.** All hero
  "layouts" rendered the same `.site-hero > .site-copy + .site-visual` grid;
  `data-hero="..."` only nudged `grid-template-columns` and hid/showed the
  visual panel. It could never produce a fundamentally different
  composition (a dashboard, a poster, a collage) because the markup never
  changed.
- **The hero visual, when there was no user upload, was *always* a giant
  initial letter + a fabricated "4.9 / 5 LOCAL RATING" card.** Every
  category, every seed. This is the literal "blank card with a giant
  letter" from the bug report.
- **Section choice had one baseline ("services") plus up to 3 optional
  add-ons from a 4-item pool** (proof/gallery/about/testimonial), so nearly
  every result was hero + services + footer, sometimes +1. A SaaS company
  and a roofer got the same shape with different label text.
- **Copy was one fixed sentence per category**, never touched by anything
  in the actual prompt beyond the category match itself.
- **`renderProof`'s "stats" variant hard-coded `10+ years / 4.9★ / 100%`**
  for literally every business, real or not — the fabricated-proof problem
  called out in the brief.

None of this was "not enough randomization" — it was the opposite: the
generator had almost no real per-category or per-prompt decision points at
all once you got past the surface keyword match.

## 2. What changed — design composition

- **`categoryKeywords` broadened substantially** (AI/ML/fintech/SaaS
  synonyms, cuisine words, fashion/creative/nonprofit phrasing, etc.), and
  **`scoreKeywords` is now left-boundary-aware**: a keyword only counts when
  it isn't glued to a preceding letter/digit. This fixed a second real bug
  found during testing — "fintech startup" was matching tech's "tech
  startup" phrase (hiding inside "fin**TECH STARTup**") as well as
  finance's "fintech", turning a clear fintech prompt into a coin-flip. The
  right side stays open on purpose, because half the category keywords are
  intentional stems relying on normal suffix growth (`roof`→roofing,
  `paint`→painting, `plumb`→plumbing, `auto`→automotive) — a two-sided
  boundary would have silently broken all of those.
- **New `categoryDimensionDefaults`**: this is the actual fix for the
  convergence bug. When a dimension has no explicit keyword signal, it now
  falls back to what suits the *detected category* (20 category-specific
  default combinations covering hero/type/nav/card/imagery/cta/color
  behaviour/motion/spacing/pattern), not to the nearest named seed. Named
  seeds still exist and still win outright when the text's language
  actually matches one — they're now a secondary/internal reference, as the
  brief asked, not the dominant fallback.
- **Independent palette generation** (`composePalette`): a base hue per
  category, a small deterministic hue/tone jitter from a hash of the exact
  input text, and a lightness/saturation "recipe" keyed to the composed
  `colorBehavior`. Same category ≠ same palette anymore; same prompt still
  produces the same palette every time (deterministic, not random).
- **10 structurally distinct hero layouts** (`renderHero` is now a
  dispatcher, not one template): split, centered-oversized, full-bleed
  image+overlay, stacked-image-below, asymmetric-offset, minimal-text-only,
  grid/dashboard, poster, collage, product-screenshot — each its own DOM
  shape with its own CSS, selected from the composed `hero` dimension
  (category default or explicit text signal). Plus a dedicated **demo-shell**
  hero used only for the pre-generation placeholder (see part 7).
- **Section library expanded from 8 to 26 types**: features, product
  showcase, integrations, pricing, FAQ, process, menu, reservation CTA,
  service areas, case studies, team, contact, newsletter, testimonials
  grid, image-led editorial, metrics — alongside the original hero/proof/
  services/gallery/about/testimonial/ctaBanner/footer. Selection is now a
  **per-category recipe** (`categorySectionRecipes`), not a generic 4-item
  scored pool with one shared baseline — an AI company gets
  features/product/integrations/pricing/FAQ; a restaurant gets menu/
  gallery/testimonials/reservation; a roofer gets service areas/case
  studies/testimonial. This is what actually gives results a different
  *silhouette*, not just different words in the same shape.

## 3. What changed — content architecture (copy)

- New `extractBusinessDescriptor(text)`: conservative regexes pull the
  actual descriptive phrase from the prompt — what the business *is* ("AI",
  "luxury fashion", "Japanese", "boutique fitness") and what it *does*
  ("focused on...", "specializing in...", "offering..."). No LLM call —
  same fully-deterministic, keyword/regex approach as the rest of the file.
- New `buildCopy()` builds the headline/kicker/sub from that descriptor
  through small per-category template pools when the prompt supplies one
  (e.g. tech → *"AI, built to move fast."*, fashion → *"Luxury Fashion.
  Made to be seen."*, hospitality → *"Japanese, made to be tasted."*).
  When the prompt genuinely gives nothing to work with, it falls back to
  the existing honest per-category sentence — never invented, just
  genuinely generic input getting genuinely generic (not fake) copy, per
  the brief's own instruction.
- **Fabricated proof removed.** `renderProof`'s stats variant no longer
  ever shows `10+ / 4.9★ / 100%`. New `extractBusinessFacts(text)` only
  ever returns a number the description itself stated (a real "12 years",
  a real "4.8 rating", a real "500 clients"); `composeSections` only
  includes a proof/metrics section at all when at least one such fact
  exists. No fact supplied → no invented one shown; that category simply
  uses its other real trust sections (testimonials, service areas, case
  studies) instead.
- Testimonial copy keeps its illustrative quote (normal marketing-template
  content) but the attribution dropped the word "Verified" — that specific
  word asserted a fact (a confirmed real review) that isn't true, which is
  exactly the kind of invented-proof claim part 6 asks to remove.
- The "integrations" section uses neutral capability labels (Calendar,
  Payments, Analytics, Reservations, POS, …) — never invented company
  names or logos, consistent with "avoid fake logos."

## 4. What changed — imagery

- **`project.imagePlan`**: a real, new first-class array on WebsiteProject.
  Every visual role in the generated site (hero / product / gallery / team
  / editorial) gets an entry with `intent`, a real descriptive `prompt`
  (built from category + composed imagery style + palette + role, e.g.
  *"abstract technical visualization of interconnected data and systems for
  a technology brand, #0b1220 background, #2c85f2 accent colour, premium
  brand aesthetic, hero composition, no text"*), `aspectRatio`,
  `placement`, `sourceType`, and the section it belongs to. Rebuilt on
  every render, so it always reflects the live project.
- **Image-provider audit (done before writing any of this).** Checked what
  is realistically reachable from this environment: no image-generation API
  key is present, and this sandbox's own outbound network is restricted to
  package registries and GitHub — confirmed directly, both
  `api.openai.com` and `source.unsplash.com` were rejected by the egress
  proxy on connection. So `generated` and `sourced` are honestly
  **unavailable here**, not faked.
- **Real provider interface, wired but inactive** (`server.js`): an
  `imageProviders` object with a `{name, configured(), generate()}` shape,
  one real OpenAI Images implementation using `OPENAI_API_KEY` read only
  from the server environment, plus `GET /api/image-provider-status` and
  `POST /api/generate-image`. The key is never sent to or readable by the
  browser. Set the env var on a host where the API is reachable and no
  client code changes — `configured` flips to `true` and
  `buildImagePlan()`'s priority order (`user upload > generated > sourced >
  designed fallback`) automatically starts resolving to `generated`.
- **Designed fallback, substantially upgraded.** The old "big initial
  letter + fake rating card" is gone everywhere (hero, about, gallery,
  editorial, product). In its place: `renderVisualSlot()` funnels every
  role through the same priority order, and the CSS "designed" tier is now
  art-directed **per category imagery style** (`technical-network`,
  `editorial-bold`, `atmospheric-warm`, `trade-proof`, `chart-financial`,
  `nature-cause`, `creative-collage`, `dashboard-ui`, …) — a tech company
  gets an abstract node/grid composition, a fashion brand gets a bold
  diagonal colour-block, a restaurant gets a soft warm atmospheric gradient,
  a roofer gets a documentary-style grid with an accent rail. Still never a
  fabricated photo — an honest, deliberately-designed placeholder, per the
  V3-V6 imagery discipline this pass explicitly preserves.

## 5. UI polish (part 7)

- **Purchase section**: constrained to the same content width as the rest
  of the page (`max-width:1180px`) so the card sits beside the copy instead
  of reading detached; `$350`/`CAD` given real gap and letter-spacing.
- **Generator spacing**: a visible gap + divider now separates the Generate
  button from "Need inspiration?", so the examples read as clearly
  secondary (screenshotted below).
- **Saved-project control**: restyled from a plain inline sentence into a
  quiet pill button reading "Restore saved project." Verified first,
  per the brief's explicit condition — `loadProjectFromStorage()` round-
  trips the *entire* serialized `WebsiteProject` (business, design,
  sections, assets including image data URLs, current refinement state),
  so restoring is reliable; kept visible rather than removed (see
  Verification below for the actual round-trip test).
- **Pre-generation preview**: the bootstrap project now renders through a
  dedicated `hero-demo-shell` template — a distinct dark neutral panel
  reading "Describe your business above" / "Your generated site will
  appear here…", clearly not a finished result — instead of quietly being
  a real (if generic) generated project, which is what made it look
  identical to the "AI company" output in the original bug report.

## 6. Feels intelligent, not preset-driven (part 8)

The pipeline is now: analyze text → detect category & extract descriptor/
facts → **category-driven** design defaults (not seed-driven) → composed
dimensions (explicit text signal wins outright where present) → independent
palette → category-driven section recipe → per-role image plan → copy from
the extracted descriptor. Named seeds remain as an internal palette/variant
anchor for `Regenerate` (cycling the *ambiguous* leftover dimensions) and
nothing else — the earlier "prompt → pick nearest seed → mostly the same
site" path no longer exists.

## 7. Diversity test (part 9)

8 required prompts generated end-to-end and screenshotted
(`v7-shots/site-*.png`, `v7-shots/results.json`):

| Prompt | Hero | Imagery | Color behaviour | Sections (excl. hero/footer) |
|---|---|---|---|---|
| AI company, Vancouver | grid-dashboard | technical-network | high-contrast-mono-accent | features, product, integrations, pricing, FAQ |
| Luxury fashion label, New York | poster | editorial-bold | dark-luxury-metallic | editorial, gallery, about, newsletter |
| Japanese restaurant, Toronto | fullbleed-image | atmospheric-warm | warm-earth-multi-tone | menu, gallery, about, testimonials grid, reservation, CTA |
| Roofing contractor, Calgary | minimal-text-only | trade-proof | high-contrast-mono-accent | service areas, case studies |
| Fintech startup, London | split | chart-financial | high-contrast-mono-accent | services, process, testimonial, FAQ, CTA |
| Creative studio, Los Angeles | collage | creative-collage | high-contrast-mono-accent | gallery, features, about, testimonial |
| Boutique fitness studio, Miami | asymmetric-offset | atmospheric-warm | warm-earth-multi-tone | features, testimonials grid, pricing, process |
| Nonprofit, ocean cleanup | centered-oversized | nature-cause | neutral-single-accent | about, gallery, newsletter, contact, CTA |

**8 of 8 structural signatures are unique** (hero × imagery × color
behaviour × section set). Visually confirmed by opening the screenshots:
the AI company (dark dashboard grid, tech copy), the fashion label
(oversized poster type, diagonal editorial blocks, warm near-black), and
the restaurant (light warm palette, menu, soft atmospheric imagery, warm
earth tones) are obviously different websites side by side, not the same
template with swapped words. Full-page screenshots of the generator/
purchase-flow polish are also included.

**Remaining known similarity**: several categories still default to
`high-contrast-mono-accent` (tech, fintech-as-tech-adjacent, roofing,
creative, fitness) since it's a genuinely common choice for
bold/energetic/technical positioning — but each still gets a different
hero layout, different imagery style, and a different hue family from
`composePalette`, so they render as different designs even sharing that one
dimension. A future pass could widen the colour-behaviour vocabulary
further if more separation is wanted there specifically.

## 8. Regression check (part 11)

The full 22-check V6 verification suite (`v6-verify.js`) passes unchanged
against this branch — generation speed, business-name capture, Generate →
Inspect → Buy, the honest "not configured" checkout path, compact Stripe
metadata, save/load round-trip (including images), and no horizontal
overflow at mobile/tablet/desktop. Additionally re-verified for this pass:
save → generate a different business → **Restore saved project** correctly
reconstructs the original business, design, sections and palette; the Buy
button still reports the same honest not-configured message; no JS console
errors across any of the 8 diversity prompts at desktop or mobile width.
$350 CAD (confirmed as the current live price — see below) is unchanged.

**Pricing note**: `origin/main` had already advanced past the delivered V6
bundle with a follow-up commit ("Set generated website purchase price to
350 CAD") changing $750 → $350 CAD in `index.html` and `server.js`'s Stripe
`unit_amount`, before this V7 pass began. That commit is the base this
branch builds on, so $350 CAD is preserved as the confirmed live price —
nothing here re-raises the pricing question.

## 9. Files changed

- `script.js` — keyword/category/style detection, palette composition,
  hero dispatcher + 10 layout templates, 18 new section renderers +
  rewritten `composeSections`/`pickVariant`, copy generation
  (`buildCopy`/`extractBusinessDescriptor`/`extractBusinessFacts`), image
  plan (`buildImagePlan`/`renderVisualSlot`/`buildImagePrompt`), demo-shell
  bootstrap.
- `server.js` — image-provider interface, `/api/image-provider-status`,
  `/api/generate-image` (both honestly report `configured:false` in this
  environment).
- `styles.css` — new hero-layout CSS, designed-imagery CSS keyed to the
  expanded `imagery` vocabulary, new section-type CSS, UI polish (purchase
  alignment, generator spacing, saved-project pill).
- `index.html` — saved-project control copy/markup only (`Restore saved
  project`).
- `mock-server.js` (test harness only) — added `/api/image-provider-status`
  mock matching the real server's honest response.

## 10. Tests run

- `v7-smoke.js` / `v7-diversity.js` — 8-prompt end-to-end generation,
  structural signature + JS-error check (0 errors, 8/8 unique signatures).
- `v7-mobile-check.js` — same 8 prompts at 390px width, no horizontal
  overflow, no JS errors.
- `v6-verify.js` — full 22-check V5/V6 regression suite, all passing
  unchanged.
- Manual Playwright checks: save → mutate → **Restore saved project**
  round-trip; Buy button honest not-configured message; purchase-section,
  generator-spacing and demo-shell screenshots reviewed directly.
- `node --check` on `script.js` and `server.js` (syntax).

**Not deployed** — this remains a local branch (`generator-v7`) verified in
a sandboxed Playwright environment only, per the explicit instruction not
to deploy this pass.
