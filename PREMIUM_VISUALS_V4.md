# PREMIUM_VISUALS_V4 — fully-dressed first output + industry-native visuals

Status: **built, tested offline and through the real client + server with mock providers. Sub-flag OFF by default.**
Enable: `PREMIUM_GENERATION_V1=true` **and** `PREMIUM_GROUNDING_V3=true` **and** `PREMIUM_VISUALS_V4=true` (V2 composition is independent). V4 is ignored unless V1 and V3 are on: the industry visual profile is derived from the V3 business grounding.
Checkpoint (local tag): `v-premium-generation-v4-pre-visual-fill` = `b630adc`. Branch `premium-visuals-v4`. Rollback = unset `PREMIUM_VISUALS_V4`.

## 1. Root cause of the empty visuals (traced)
Media priority in `renderVisualSlot` was: upload → generated image (only once resolved) → **a CSS "designed" fallback**. That fallback is what customers saw:
* `.visual-generated-unfunded` = a dotted radial-gradient pattern (`styles.css`), `data-imagery="demo-shell"` = dashed border, `.team-card-placeholder`, `.visual-generating-label` ("Generating hero image…").
* Whenever the image plan said `sourceType: 'designed'` (tier cap, budget, `GALLERY_GENERATION_OK` says no gallery images for that archetype, roles `team`/`testimonial` are never generated, image provider off, request failed) the slot rendered that placeholder.
* `reconcileImageSupplyWithSections` then treated "designed" as "no media": it shrank frames, swapped galleries for an icon composition and downgraded the hero to a text-only variant — or, when the hero variant was `grid-dashboard`, left a 2×2 mosaic with one filled tile and three dead ones.
* `lib/site-render.js` (the export) had a parallel copy of the same fallback.
* Customers "filled" slots through the hero/gallery/team upload panels (`planAssets`); an upload already outranked everything, so the mechanism for replacement existed — there was just nothing finished underneath it.

## 2. Starter media architecture
Priority ladder (both preview and export): **customer upload → verified business asset (same store) → generated image → starter visual → (nothing)**.
`lib/premium/visuals.js` (pure, bundled into `premium-core.js`, required by `lib/site-render.js`):
* **INDUSTRY_VISUAL_PROFILE** from the grounding family: tech, retail, hospitality, trades, consultancy, portfolio, cause, general — each with a media type per role (PHOTO, PRODUCT_UI, DIAGRAM, DATA_VISUAL, ABSTRACT_GRAPHIC …), a hero variant and a density.
* **Starter kinds** (deterministic inline SVG, themed from the site's own tokens, light and dark): `ui-dashboard`, `ui-workflow`, `ui-command`, `ui-canvas`, `ui-document`, `diagram-system`, `data-chart`, `retail-arrangement`, `hospitality-scene`, `trades-blueprint`, `consult-matrix`, `portfolio-frames`, `brand-mark`.
* Persisted marker: `design.premium.vs = 1` (+ `vp` profile id, optional `vb` brief string ≤200 chars). Data-driven, so stored projects keep their look regardless of the flag.
* Photography families keep generated photos; the starter is the *fallback under them* (no spinner/dotted panels while an image is pending, on failure, or when unfunded). Interface-led (tech) businesses get **$0 deterministic** hero/product/diagram visuals instead of stock-style photography.

## 3. Customer replacement
Starter visuals expose a **Replace** button in the customizer (preview only, never exported). It opens the existing hero / gallery / team upload input for that slot. An upload outranks the starter, keeps the frame and focal behaviour, and removing it restores the starter. Verified live (see §6). Generated starters are never locked.

## 4. Tech visual system
* Concept detection from the customer's words: dashboard / document / canvas / workflow / system. Optional ONE strong-model call (`visual_brief`, governed by the budget governor, ledgered) refines the four workflow labels; output is validated (no digits, no brand-like names) and stored as one flat string.
* **HONESTY**: conceptual UI only. No invented numbers, customer names, logos, ratings or metrics; charts are unlabeled shapes.
* Hero for interface-led sites is forced to `product-screenshot` (browser frame around the starter UI) — never the empty 4-tile mosaic.
* "What it does" cards explain the **workflow** (Brief → Generate → Review → Publish style) instead of category filler "Product / Pricing / Docs" (which also implied pricing). Neutral how-it-works statements only.
* Product section shows a UI/diagram scene; V3 already drops invented pricing tiers and unsupported Pricing pages.
* Generic tech copy patterns ("done right", "everything … in one place", "feel effortless", "built to move fast") are flagged and their deterministic templates were replaced.

## 5. Review + repair
* New categories: `FIRST_DRAFT_COMPLETENESS`, `HERO_VISUAL_STRENGTH`, `INDUSTRY_VISUAL_FIT`, `MEDIA_COMPLETENESS`, `PRODUCT_VISUAL_EXPLANATION`, `PLACEHOLDER_LEAKAGE`, `VISUAL_DEPTH`, `PAGE_VISUAL_VARIETY` (NOT_APPLICABLE unless V4 is on). The same critic call also gets the visual criteria and a per-slot media summary — no extra critic call.
* Targeted, free repairs (still no full-site reroll, still ≤5 critic fixes): `set_hero_variant`, `enable_starter`, `add_product_visual`, `remove_section`, `apply_fix_text`.
* Team: V3 already omits Team without team data; V4 renders a brand-mark graphic (never an empty box) where a team/about image slot exists.

## 6. Evidence (10 fixtures incl. new `tech-ai`, real client + server, mock providers)
Rendered-DOM scan of every page (independent of the planner): dotted placeholders V3 **2 → V4 0**, team placeholders 0, "Generating…" labels 0. Tech: hero `product-screenshot` with starter UI, 3 starter visuals, 0 image calls.
| | V3 | V4 |
|---|---|---|
| tech-ai estimated site cost | $1.068 (3 images) | $0.021 (0 images, 1 brief call) |
| saas | $0.438 (2 images) | $0.021 |
| consultant | $0.798 (2 images) | $0.649 (1 image, diagram) |
| skincare / restaurant / roofing / nonprofit … | unchanged (±$0.001 for the same critic call) |
Live replacement check on tech-ai: Replace routed to the hero upload input; uploaded hero replaced the starter; removing it restored the starter (starters 2 → 1 → 2).
Costs are **estimates from mock token usage**, not billing. The reported spend went **down** for interface-led sites because deterministic visuals beat stock-style photography there; the permission to spend more was not needed.

## 7. Known weaknesses / NOT proven
* Real critic and brief behaviour (mocked); real image quality (synthetic); visual taste needs your eyes on real generations.
* The deterministic hero headline for tech can still be weak ("Software for product, …") when descriptor extraction fails; with the live planner the copy is model-written, but V4 does not rewrite it beyond the critic's fix text.
* Starter graphics are tasteful but generic per kind; two similar businesses can get the same composition with different labels.
* Photography families still show a starter graphic (not a photo) if the image provider is off or unfunded — complete-looking, not photographic.
* Contact page map stand-in (`module-map-placeholder`) is unchanged.
* Consultancy/portfolio profiles were tuned lightly (diagram for product/gallery roles).
