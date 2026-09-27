# SITEREMADE VISUAL ENGINE V1 — premium hero, media composition, depth, typography and pacing systems

Branch `siteremade-visual-engine-v1` (on top of V7 `9c89a27`, which is itself one commit ahead of `origin/main` at `2d110b3`).
Checkpoint tag `v-siteremade-visual-engine-v1-pre-build` = `2d110b3`. **Not pushed.**

This is scoped as a genuine first slice of a large ask, not the whole 32-part brief finished end to end — §14 says exactly what is deferred and why.

## 1. Audit (before building)
Reused rather than duplicated:
* **Page-level pacing/anti-repetition/surfaces already existed**: `lib/premium/composition.js` (V2) already computes per-section `weight` (quiet/medium/strong), `tone` (base/alt/contrast/brand), `moment` kind, and already checks "3 equal weights in a row" and "adjacent sections too similar". This pass **names** those rungs (QUIET/NORMAL/FEATURE/HEROIC) and **adds** the specific repetition class the brief called out that it didn't check yet (identical media *position* 3+ in a row) — it does not re-implement pacing.
* **Hero variants**: 12 already existed (`split, fullbleed-image, stacked-image-below, asymmetric-offset, minimal-text-only, grid-dashboard, poster, collage, product-screenshot, editorial-rail, centered-oversized, demo`), each already rendered in both `script.js` (preview) and `lib/site-render.js` (export) with real copy/CTA/visual-slot wiring, and industry defaults already existed (`lib/premium/visuals.js` `PROFILES`, `chooseHero`).
* **Starter visuals, media compositions, depth-ish treatment, decorative SVG primitives**: `lib/premium/visuals.js` already had 13 deterministic starter kinds and per-slot media typing (V4-V6).
* **Found while auditing**: `editorial-rail` had NO export-side case in `lib/site-render.js` at all — a genuine pre-existing preview/export parity gap (fixed, §5).

## 2. Visual primitive vocabulary (Part 2) — `lib/premium/visual-engine.js` (new)
A pure, validated vocabulary module (no I/O, no model calls), bundled and shared like every other `lib/premium/*` file:
* `HERO_FAMILIES` (8, closed set) → concrete variant key, `normalizeHeroFamily()` (safe fallback for any invalid/invented value)
* `MEDIA_COMPOSITIONS` (`DEFAULT` + 6: `OVERSIZED_IMAGE, OFFSET_IMAGE, OVERLAPPING_PAIR, FULL_WIDTH_BAND, VERTICAL_EDITORIAL, VISUAL_QUOTE`), `normalizeMediaComposition()`
* `DEPTH_LEVELS` (`FLAT/SUBTLE/LAYERED/DRAMATIC`), `normalizeDepth()`, `depthForFamily()` — **V1 scope**: depth is currently a fixed property of each hero family, not yet an independent axis a planner can tune per-generation (see §14)
* `SURFACE_TEXTURES` (`clean/radial-field/grid-technical/editorial-paper`), `normalizeSurfaceTexture()`, `surfaceTextureFor(profileId)`
* `intensityFor(section)` — names composition.js's existing weight/moment as QUIET/NORMAL/FEATURE/HEROIC
* `checkVisualMoments(plan)` — Part 14's exact rule ("hero + 2-3 moments + 1 quiet + 1 strong CTA") as a deterministic check over composition.js's own output
* `checkLayoutRepetition(sections)` — Part 10's "3+ in a row with the same media position" check
* `pickHeroFamily(industryKey, hasStrongMedia, currentFamily)` — the industry-preference-order selector (Part 4/22), keyed by `BUSINESS_GROUNDING`'s own family names, not a new taxonomy

## 3/4. Hero system (Parts 3, 4) — 8 families, industry preference, real selection logic
| Family | Variant | New markup? |
|---|---|---|
| EDITORIAL_SPLIT | `split` | existing |
| FULL_BLEED_CINEMATIC | `fullbleed-image` | existing |
| **PRODUCT_STAGE** | `product-stage` | **new** |
| **FLOATING_MEDIA** | `floating-media` | **new** |
| TYPOGRAPHIC_STATEMENT | `poster` | existing |
| FRAME_WITHIN_FRAME | `product-screenshot` | existing |
| COLLAGE | `collage` | existing |
| **QUIET_LUXURY** | `quiet-luxury` | **new** |

* **PRODUCT_STAGE**: a centred staged object — two concentric rings, a soft glow, a single framed image with real elevation (`box-shadow` at two depths), oversized headline below. Retail's new default.
* **FLOATING_MEDIA**: 2-3 images in a genuine overlapping depth stack (back layer scaled down/desaturated/soft shadow → front layer full scale/strongest shadow/highest z-index), not a flat grid.
* **QUIET_LUXURY**: restrained split — small eyebrow, capped headline width, generous padding, muted single image; the professional/consultancy default (was `editorial-rail`).
* Every hero (new and old) now carries `data-hero-family`/`data-depth` attributes in **both** renderers.
* Industry defaults wired through the *existing* `PROFILES.heroVariants`/`heroVariant` allowlist (`chooseHero`), not a parallel mechanism: retail narrowed to `[product-stage, fullbleed-image, collage]` (was keeping a stale `asymmetric-offset` alive — found and fixed mid-build, see §14), professional/consultancy narrowed to `[quiet-luxury]` (was keeping `editorial-rail`/`poster` alive). Photo-led personal-brand consultants keep their own already-good `consultancy_personal` profile (`editorial-rail`), unaffected.
* `pickHeroFamily()` exists and is unit-tested as the forward-looking selection function for Part 21's planner integration; the **static per-profile default** is what actually drives generation this pass (see §14 — dynamic per-generation family choice among multiple valid options is deferred).

## 5. Media compositions (Part 5)
6 named treatments (of the 10 asked for; `PRODUCT_CLUSTER/UI_STAGE/COLLAGE_GRID` already exist as distinct section types — gallery/product-showcase/collage-hero — rather than needing a parallel "composition" wrapper). Wired onto `editorialFeature` (the V6 photo-led feature section): each feature in a photo-led page plan now gets a **different** treatment from its predecessor of the same side (`FEATURE_MEDIA_CYCLE`), not a plain rectangle every time. Persisted (`lib/project-store.js` whitelist, validated against the fixed vocabulary) and forwarded through the review-repair patch (`server.js`/`script.js`) — survives save/reload/export.
**Fixed while here (Part 17)**: `editorial-rail` had no export case at all.

## 6. Depth (Part 6)
4 named levels exist and are exposed (`data-depth`); applied concretely per hero family (PRODUCT_STAGE/FLOATING_MEDIA = DRAMATIC via real rings+shadows+scale, FULL_BLEED_CINEMATIC/FRAME_WITHIN_FRAME/COLLAGE = LAYERED, EDITORIAL_SPLIT = SUBTLE, TYPOGRAPHIC_STATEMENT/QUIET_LUXURY = FLAT). Not yet an independently-tunable axis per generation (§14).

## 7. Surfaces (Part 7)
3 new texture classes (`radial-field`, `grid-technical`, `editorial-paper`) layered on top of composition.js's existing 4-tone system, deterministic per industry profile (`surfaceTextureFor`). Wired and unit-tested; not yet applied to live section rendering broadly (§14) — kept deliberately rare per the brief's own "do not add random gradients everywhere".

## 8. Typography (Part 8)
QUIET_LUXURY introduces a genuinely smaller, capped-width, more restrained headline treatment (`clamp(28px,3.2vw,44px)`, `max-width:16ch`) distinct from every other hero's display scale; PRODUCT_STAGE keeps the display scale but centres and caps it. Eyebrow+giant-headline was already the shared pattern; not otherwise touched this pass beyond a contrast fix (§14).

## 9/10/14. Rhythm, anti-repetition, visual moments (Parts 9, 10, 14)
Extended `composition.js`'s existing pacing (not replaced): `heroStrong` now recognises the 2 new heroic families; `checkVisualMoments`/`checkLayoutRepetition` (visual-engine.js) are wired into `lib/premium/visuals.js`'s `checkVisuals`, feeding the **existing** `PAGE_VISUAL_VARIETY`/`COMPOSITION_VARIETY` categories (no new categories needed — reuse per Part 1).

## 11. Retail/product staging (Part 11)
New starter kind `product-bottle-stage` (a single staged, clearly-generic/replaceable container — soft glow, cap, label block, floor shadow — composed to survive the PRODUCT_STAGE hero's centre-crop), used for retail's hero **and** product slots specifically instead of the wider shelf-arrangement scene. Verified in a real fixture render (screenshot) sitting inside the product showcase section, looking like a designed graphic rather than a broken box.

## 12/13. Image integration & decorative primitives (Parts 12, 13)
Handled inline within the 3 new hero renderers rather than as a separate abstraction layer (rings, glow, floor shadow, scaled/blurred back-layer) — deliberately not over-engineered into a generic "decorative primitive system" this pass (§14).

## 15/16/17/18. Secondary pages, responsive, parity, editability
* Secondary-page composition variety was already substantially built in V6 (page-role-specific section sequences); this pass adds the media-composition cycling on top so consecutive features differ, verified in the skincare/wellness/real-estate secondary-page screenshots.
* **Responsive**: all 3 new heroes have explicit `@media`/`.builder-device.mobile` rules; verified with a real phone-width screenshot (skincare) — no overflow, sensible single-column stacking, rings still visible.
* **Parity**: unit-tested byte-for-byte identical markup for all 3 new heroes between `script.js` and `lib/site-render.js`, plus the `editorial-rail` gap fix.
* **Editability**: no new hardcoded copy; headline/sub/cta/visual slot are the same fields the customizer already edits; `mediaComposition` is a normal whitelisted, validated section field like `imageDisplayVariant`.

## 19/20. Performance, no motion
CSS + inline SVG only; no new libraries; no scroll/parallax/motion added.

## 21/22. Planner vocabulary + industry defaults
`normalizeHeroFamily`/`normalizeMediaComposition`/`normalizeDepth`/`normalizeSurfaceTexture` all fall back safely for any unrecognised value (unit-tested with garbage input including `null`, `42`, SQL-injection-shaped strings). **Not yet wired into the live Anthropic planner tool schema** (`server.js`'s `WEBSITE_PLAN_TOOL`) — the vocabulary and its validation exist and are ready, but the actual schema field + `normalizePlannerPlan` wiring is deferred (§14) rather than risking the live planner integration in the same pass as the rendering changes.

## 23/24. Deterministic quality checks / known-weakness fixes
Reused existing categories (no rubric sprawl). Fixed opportunistically while this layer touched them: the missing `editorial-rail` export case; low-contrast centred kicker text (`60%→72%` opacity) now used by the new PRODUCT_STAGE/TYPOGRAPHIC_STATEMENT/CENTERED heroes; the retail/consultancy "stale allowlist" bug found mid-build (below).

## 25/26. Test matrix + screenshots (real inspection, not just green tests)
12 fixtures run through the real client + server (mock providers): roofing, consultant, restaurant, photographer, saas, renovation, cleaning, nonprofit, **skincare (retail)**, tech-ai, wellness, real estate. All accepted, zero blockers, no regressions. Screenshots actually reviewed (not just captured): `C:\Users\jayde\Documents\siteremade-visual-engine-v1-shots\` (62 files — desktop/tablet/mobile + secondary pages).
**A real bug was found by looking, not by tests passing**: the first retail screenshot still showed the *old* flat hero — `chooseHero` was keeping `asymmetric-offset`/`editorial-rail` alive because I'd left them in the allowed list alongside the new default. Narrowed both retail's and consultancy's allowlists and re-verified with a second screenshot showing the actual PRODUCT_STAGE hero (rings, glow, staged frame, centred oversized headline). This is exactly the class of thing Part 26 warned tests alone would miss.
**Consultancy's QUIET_LUXURY hero is unit-tested (`SR.renderHero`) but not screenshot-verified** — the one "professional services" fixture available (`consultant`) uses personal-brand wording ("I work with...", "Independent...") and correctly routes to the separate, already-tested `consultancy_personal` profile instead, so no fixture in the current set exercises plain `consultancy`. Disclosed rather than papered over.

## 27. Cost
No new API calls added anywhere in this pass. Mock-estimated per-site cost is unchanged from V7 (photo-led ≈ $2.15–2.75, tech/SaaS ≈ $0.02 — these are the *existing* V6/V7 mock estimates, not new spend from this pass; §14 notes real per-generation Claude/OpenAI cost is still unmeasured on this machine).

## 28. Do-not-touch
Confirmed untouched: Stripe, billing, pricing, entitlement, auth, Ads, Analytics, tester credits, domains, Railway.

## 29. Tests
17 new unit tests (hero-family normalization + invalid fallback, media-composition normalization, industry hero selection incl. "kept if still viable", anti-repetition, intensity mapping, visual-moments quota, retail structured placeholder, media-composition assignment + variety, preview/export byte-parity for all 3 new heroes, export-renderer smoke test, planner-input-validation fuzzing). **147 passed, 0 failed** (130 pre-existing + 17 new), no existing test weakened (2 pre-existing assertions were *updated*, not deleted, to reflect the intended retail/consultancy default change, with the reasoning left in a comment).

## 30. Real-provider run
**Not performed** — no `ANTHROPIC_API_KEY`/`OPENAI_API_KEY` on this machine, same constraint as V4-V7. Part 31 treats this as optional ("one run maximum if necessary"); given that constraint I could not do even one. Everything above is mock-provider + real-client/server verification.

## What is genuinely deferred (Part 30: quality over quantity — better to finish 8 heroes well than half-build 20 things)
* Dynamic per-generation selection among a profile's *multiple* valid hero families (today: one static default + a narrow allowlist per profile, not yet `pickHeroFamily` chosen live from real media availability at generation time).
* Planner-facing schema exposure (Part 21) — the vocabulary/normalization exists and is tested; wiring it into the live Anthropic tool schema is a separate, following change.
* Surface textures are implemented and tested but not yet applied to live section rendering.
* A generalized decorative-primitive library (rings/orbs/lines as a reusable component) — built inline per hero instead.
* OVERLAPPING_PAIR / FULL_WIDTH_BAND / VISUAL_QUOTE media compositions are defined and normalized but not yet assigned by the feature-cycle logic (only 3 of the 6 are in active rotation).
* Deterministic checks for "text width too wide" / "tiny media in a huge section" / "element outside bounds" (Part 23) beyond what MOBILE_READINESS and the new layout-repetition check already cover.
* Real photography/real model cost and quality — unverified without API keys, same as every prior pass this phase.
