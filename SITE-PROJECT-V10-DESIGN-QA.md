# SiteRemade V10 — Design Intelligence + Local Visual Asset System Pass

Scope: make generated websites look intentionally designed, polished and
differentiated even with zero/low real photography, without adding any
paid API, provider call, or per-generation cost. No architecture redesign,
no changes to credits/Stripe/auth/persistence, paid image generation stays
off (`SITEREMADE_PAID_IMAGES=false`).

## 1. Phosphor icon system (parts 1–3)

`icons-data.js` (new file, repo root) holds a curated **212-key** semantic
vocabulary, each key mapped to a real, verified Phosphor Icons slug
(`github.com/phosphor-icons/core`, MIT license), with SVG markup for 5
weights (thin/light/regular/bold/duotone — `fill` omitted as unnecessary
for this vocabulary's use). Every slug was checked against the actual
1512-file `assets/<weight>/` listing before being added; two initial guesses
(`package-check`, `layers`) didn't exist and were corrected
(`package`, `stack-simple`).

UMD wrapper: `window.SITEREMADE_ICON_DATA` in the browser,
`require('../icons-data.js')` in Node — one data file, no duplication.
`renderIcon(key, {weight, size, className})` (hand-ported to `script.js`
and `lib/site-render.js`, same convention as the rest of this codebase's
dual renderers) looks a key up and returns an **already-inlined**
`<svg>…</svg>` string. `icons-data.js` itself is loaded only by the
SiteRemade app (`index.html` now loads it via `<script src="icons-data.js"
defer>` before `script.js`); an exported/purchased site never references
it — icons arrive pre-inlined in the generated HTML, verified by
`v10-design-test.js`'s check that no exported file tree or HTML contains
the string `icons-data`.

Icon weight/density/presentation (part 2/19/20) is derived once, at
generation time, from the same `strategy.archetype` every other creative
decision already uses (`archetypeIconDefaults` in `script.js`, merged into
`design.dimensions` by `buildGenerationPlan`, alongside the existing
`archetypeExtendedDimensionDefaults` table) — not a new independent
randomizer. Result: a plumbing site defaults to bold/high-density
icon-led-rows; a premium consultancy defaults to thin/minimal-density
icons that mostly stay hidden in favour of restraint; a nonprofit defaults
to duotone/rounded tiles; a SaaS site to light/tinted-tile; editorial to
thin/near-none. Verified distinct across archetypes by
`v10-design-test.js` (5 distinct weights, 6 distinct motifs across 8
export fixtures).

Presentation variants (part 3): `renderIconTile()` supports
bare/tinted-tile/outlined-square/rounded-square/badge/oversized/
above-heading; service rows use a dedicated `icon-led-row` composition
(icon block beside heading+body) rather than forcing every context through
one generic wrapper.

## 2. Decorative primitive library (part 4)

Pure CSS/pseudo-element primitives keyed off a new `[data-decorative-motif]`
attribute on `.builder-site` (same pattern as the pre-existing `data-cta`/
`data-card`/etc.) — `lines`, `dots`, `divider`, `corners`, `grid`, `waves`,
`rule`, `none`. Zero new markup (they attach to elements every renderer
already emits — `.site-section-label`, `.service-card`, `.site-footer`),
inherit brand color via `var(--site-accent)`/`color-mix()`, and are
intentionally restrained (a rule line, a few dots, a corner bracket — never
a busy pattern). This is the mechanism behind "a page that was deliberately
designed without photography" rather than a second icon system.

## 3. Image-supply-aware design + the gallery fix (parts 5–7)

**Two real, previously-undiscovered bugs found and fixed while auditing
this area** (same category as the hero bug the prior responsive pass
found — a gap between what the live preview computes and what a purchased
export actually ships):

- `lib/site-render.js`'s `renderGallery` (the **export** renderer) was a
  separate, older implementation that ignored `imageTileCount`/
  `imageDisplayVariant` entirely and never called `renderVisualSlot` —
  every export always rendered 3–4 full-size placeholder tiles regardless
  of real image supply, even when the live preview had already reconciled
  down to 1 tile. Rewritten to mirror `script.js`'s reconciled version
  exactly.
- `lib/site-render.js`'s `renderVisualSlot` (used by every OTHER unfunded
  visual slot — hero, about, product, editorial) never applied the
  smaller `visual-generated-unfunded` treatment at all; every unfunded
  slot in every export rendered the full-strength gradient, bigger and
  heavier than what the buyer's own preview showed. Fixed to read
  `project.imagePlan` (already persisted) the same way the live preview
  does.

**The gallery problem itself (part 7):** a gallery/case-studies section
with zero real images no longer renders as an image section at all.
`reconcileImageSupplyWithSections` now also stamps
`section.zeroSupplyTreatment = 'icon-composition'` when real image count is
0; both renderers check this before doing anything image-shaped, and
render a compact icon/proof card grid instead — icon + real category
service label per card (from the archetype's own proof-icon table, never
invented text), reverting automatically the moment a real image is
uploaded or generated. This directly replaces "an enormous dotted/patterned
gallery rectangle" with a composed, non-image section.

Zero/one/two-image behavior generally: zero real images was the part
addressed structurally above (hero/about downgrade already existed from
the prior pass; gallery is the new fix here). One and two real images
already had dedicated tile-count/featured-variant handling from the
pre-existing "IMAGE COHERENCE PASS" — this pass's contribution there is
making sure that handling actually **survives persistence** (see §5).

## 4. CTA / button system (parts 10–11)

A real, working 5-variant CTA treatment system
(`sharp-block`/`outline-ghost`/`underline-link`/`floating-badge`/default
solid-pill, driven by the existing `cta` dimension) already existed in
`styles.css` — but its selectors only ever targeted the hero/nav buttons.
**Every other button on a generated site** (`.module-cta-btn`: banner/
contact/newsletter/action CTAs; `.module-submit-btn`: every form submit)
always rendered as the same flat solid pill regardless of the project's own
`cta` dimension — the literal, concrete cause of "one universal turquoise-
pill feeling across unrelated businesses." Fixed by extending the existing
selectors to those buttons too, so the treatment now reaches every button
on the page.

`renderCtaButton()` now also appends a small trailing icon
(phone/envelope/arrow-up-right/arrow-right, matched to the CTA's real
`kind`), suppressed automatically for the `underline-link` treatment (an
arrow fights a deliberately link-like, restrained style).

## 5. Two persistence bugs found and fixed (critical to this pass, and pre-existing)

Both found by this pass's own new export-based test
(`v10-design-test.js`), neither previously caught by any test:

- `lib/project-store.js`'s `validateSection()` (the server-side save
  whitelist every `/api/projects` POST/PUT goes through) never preserved
  `headlineRole`, `imageTileCount`, or `imageDisplayVariant` — **all
  pre-existing fields** the "IMAGE COHERENCE PASS"/brand-experience work
  already relies on. Reconciled gallery tile counts and headline-role
  styling were silently dropped on every save, meaning they never actually
  survived a reload or a purchase+export in production, independent of
  anything in this pass. Fixed, and this pass's own new
  `zeroSupplyTreatment` field added to the same whitelist.
- `validateDirection()` never preserved `project.strategy` (archetype,
  visitor intent, conversion goals) **at all** — every saved/purchased/
  exported project would have silently fallen back to the
  `'service-business'` archetype default, which is exactly the
  homogenization part 20 explicitly warns against. Fixed.
- A third, related bug: `capStringsDeep(raw.design, {maxKeys: 20, …})` —
  `design.dimensions` already had exactly 20 fields before this pass;
  adding this pass's 4 new icon/decorative fields pushed a real project's
  dimensions object to 24, and the per-object `maxKeys` cap silently
  dropped whichever 4 landed past the limit on every save (verified:
  `headingWidth`/`cardDensity`/`cardShape`/`splitRatio` — pre-existing
  fields, not even the new ones). Raised to 40 for real headroom.

These three are genuine regressions this pass would otherwise have
shipped silently (icon/decorative differentiation would have been
completely inert in production; the pre-existing tile-count system was
already silently broken). All three verified fixed by direct
`validateDirectionsState()` unit checks and by the full `v10-design-test.js`
export suite.

## 6. Forms, newsletter, footer (parts 12–13)

- **Newsletter:** the fallback "Subscribe" button had **no CSS class at
  all** — an unstyled native browser button in every generated site. Now
  shares the same CTA button system as everything else, plus a contained
  surface (padding + tinted background) and a paper-plane icon, instead of
  a bare paragraph + input floating in section whitespace.
- **Forms:** `.module-form` now sits inside a real surface (padding,
  border-radius, tinted background) instead of labels/inputs/button
  resting directly on the page background.
- **Footer:** added a real location line (icon + `project.source.location`,
  only when that data actually exists — nothing invented), a subtle top
  accent divider, and more deliberate padding, replacing what was
  brand-name + one copyright line.
- Fixed a latent theme bug found in the same area: `.newsletter-row input`
  had a hardcoded white-ish border (`rgba(255,255,255,.16)`) that would
  have been nearly invisible on a light-themed site; now uses
  `color-mix(in srgb, var(--site-text) …)` like the rest of the form CSS.

## 7. Services / proof sections (part 8, partial)

Services (both "numbered" and "described" variants) and the proof/metrics
stat grid now carry a real icon per item, selected positionally from the
archetype's own 4-icon proof table (never a per-word text guess at
semantics). `[data-icon-density="minimal"]` archetypes (premium
consultancy, editorial, portfolio) suppress these again via CSS, so
restraint stays a real, intentional choice rather than a missing feature.

**Not reached this pass, honestly:** the full section-by-section audit
(features/process/pricing/team/FAQ/case-studies visual hierarchy),
page-rhythm strengthening beyond what the existing `sectionRhythm`
dimension already does, and a dedicated typography/color audit (parts
9/14/15) — see §9.

## 8. Responsive + export verification (parts 16–17)

The V9 container-query responsive system is unchanged and unbroken — the
full V9 `v9-responsive-test.js` suite (11 checks, real device-toggle
clicks + real exported ZIPs at 1440×900/768×1024/390×844 across 6
archetypes) still passes byte-for-byte after this pass. New markup
(gallery icon grid, icon-led rows, newsletter surface, footer divider) got
explicit mobile-tier rules added to the existing `@container site
(max-width:480px)` block (single-column collapse, smaller oversized icons,
decorative corner/grid motifs hidden at the smallest width) rather than
relying on generic wrapping.

Export portability (part 17) verified directly: every icon in a real
purchased export ZIP is a plain inlined `<svg>`; `icons-data.js` never
appears anywhere in an exported file tree or its HTML.

## 9. Known remaining gaps (honest accounting)

Given the size of the 25-part brief, this pass prioritized: the icon
system end-to-end (including export portability), the two real image/
gallery preview-export parity bugs, the CTA/button unification bug, the
newsletter's unstyled-button bug, and — critically — the three persistence
bugs that would have made the whole icon/decorative differentiation system
inert in production. **Not done in this pass:**

- Parts 9/14/15 (page rhythm strengthening, typography scale/pairing audit,
  color-usage audit) were not addressed as dedicated passes.
- Part 8's full per-section-type audit (pricing/FAQ/team/process/
  case-studies specifically) was not done beyond services/proof/gallery/
  CTA/forms/newsletter/footer.
- Team section only got the minimal unfunded-placeholder improvement (a
  centered ring mark instead of a blank tinted square), not a full
  redesign.
- The one-image and two-image gallery compositions reuse the pre-existing
  featured/grid tile logic unchanged (parity-fixed, not redesigned).

## 10. Cost / regression guarantees

- Zero new provider/network calls: `renderIcon`/`renderIconTile`/
  `resolveIconDirection`/`renderGalleryIconComposition` contain no
  `fetch`/`XMLHttpRequest`/`/api/` call in either file — verified by
  source-inspection in `v10-design-test.js` (the same technique
  `test-architectural-invariants.js` already uses), not sampling.
- `SITEREMADE_PAID_IMAGES=false` behavior is untouched — nothing in this
  pass reads or changes that flag.
- Full pre-existing regression suite (13 pure-Node test files, 400+
  assertions; `v9-frontend-verify`/`v9-deployment-safety-test`/
  `v9-product-flow-test`/`v9-responsive-test`, 142 Playwright checks) —
  all green after every change in this pass, including after the
  `lib/project-store.js` whitelist fixes.
