# SITEREMADE VISUAL ENGINE V1.1 — activation + visual director foundation

Branch `siteremade-visual-engine-v1-1` (on top of Visual Engine V1 `1140b32`, which is also `origin/main`).
Checkpoint tag `v-siteremade-visual-engine-v1-1-pre-activation` = `1140b32`. **Not pushed** (see §30).

V1 built the vocabulary (8 hero families, 6 media compositions, depth/surface/typography primitives) but left most
of it either statically-mapped-per-industry or defined-but-unused. This pass's only job was to make the generator
**actually use** what V1 built — no new visual primitives were added.

## 1. Trace: the exact planner → render decision path (Part 2, before any change)

Confirmed by reading, not guessing:
1. `server.js`'s `submit_website_plan` tool schema exposes a `hero` enum per section — Claude can already choose
   any hero *variant* (not family) if it wants to.
2. If Claude's plan is missing/refused/invalid, the client's deterministic engine (`script.js`) builds the plan
   instead — this is the path every fixture in this repo's harness exercises, because `mock-providers.js`
   deliberately 529s `submit_website_plan` so the *client's* real code gets exercised end to end.
3. Inside that deterministic path, `applyVisualProfile()` (script.js) was the single choke point that decided the
   final hero: it read the industry `PROFILES` entry from `lib/premium/visuals.js` and called `chooseHero()`,
   which returned **the same static `heroVariant`** for every business in a given profile, gated only by whether
   the profile allowed that variant at all (`heroVariants` allowlist, itself only ever consulted by the *server's*
   `hero_family_mismatch` repair, not by the client's initial choice).
4. Depth, media composition and surface texture were never read from anywhere at render time — `depthForFamily`/
   `surfaceTextureFor` existed in `visual-engine.js` but no call site in `script.js`, `lib/site-render.js` or
   `editorial.js` ever invoked them outside of unit tests.

This confirmed the user's own diagnosis: the vocabulary was real but inert. Every fix in this pass targets one of
these exact points, and only these points.

## 2/3. Vocabulary exposed to the planner (Part 3)

No new schema field was added. `HERO_FAMILIES` and the existing `hero` variant enum are a strict 1:1 bijection
(`heroVariantFor`/`familyForVariant`), so widening the already-integrated, already-round-tripping `hero` enum by
the 3 new V1 variants (`product-stage`, `floating-media`, `quiet-luxury`) in both `server.js`'s `HERO_KEYS` and
`script.js`'s `CLAUDE_HERO_KEYS` gives Claude full access to all 8 families through infrastructure that was already
validated, tested and safely-falling-back — a new, parallel `heroFamily` field would have duplicated that risk for
no new capability. `server.js`'s `visualDirection.hero` schema description was extended to actively steer Claude
toward the new variants when the business concept supports them. Media composition and surface texture were not
planner-facing in V1 either; they stay deterministic-engine-decided in V1.1 too (Part 6/7) — this was a scope
decision, not an oversight: the brief's actual complaint (per the user's own list of V1 weaknesses) was that the
*deterministic* engine's choices were static, not that Claude couldn't request them.

## 4/5. Dynamic, compatibility-gated hero selection (Parts 4, 5) — `lib/premium/visual-engine.js`

New: `HERO_REQUIREMENTS` (a predicate per family: COLLAGE needs `galleryCount >= 2`, FLOATING_MEDIA needs
`interfaceLed` or 2+ real surfaces, PRODUCT_STAGE/others need a funded photo, QUIET_LUXURY/TYPOGRAPHIC_STATEMENT
never require one), `heroCompatible(family, mediaCtx)`, and `selectHeroFamily(ctx)` — the new single entry point,
called from `applyVisualProfile` (client) and from `checkVisuals`'s `hero_family_mismatch` repair (server), so the
two can never disagree about what's "correct" for a given business.

Real, per-business signal sources feed it — never a fixed mapping:
* **Retail**: `RETAIL_SUBTYPE_HERO` — `skincare/jewelry/pets → PRODUCT_STAGE`, `apparel → COLLAGE`,
  `home/coffee_tea → FULL_BLEED_CINEMATIC`.
* **SaaS**: `SAAS_CONCEPT_HERO`, keyed on the existing deterministic product-concept classifier —
  `ui-dashboard/ui-workflow → FLOATING_MEDIA` (multi-panel), `ui-document/ui-canvas/ui-command → FRAME_WITHIN_FRAME`
  (single surface), `diagram-system → TYPOGRAPHIC_STATEMENT` (nothing literal to screenshot).
* **Wellness / real estate**: `textSignalFamily` — restrained wording (`retreat/private/spa/quiet`) → QUIET_LUXURY,
  energetic/group wording (`class/group/training`) → FULL_BLEED_CINEMATIC, otherwise the industry's own default.

Selection order inside `selectHeroFamily`: **the business-specific signal always wins first** (if compatible);
only with *no* signal for this business is an already-good current choice kept; only then does the code fall
through to the industry preference order. This ordering is itself the fix for a real bug found mid-build (§12) —
an earlier draft checked "keep current if compatible" before the signal, which let a stale, unrelated legacy guess
silently defeat the entire signal mechanism.

## 6. Media compositions — audit and full wiring (Part 6)

All 6 defined compositions (`DEFAULT`, `OVERSIZED_IMAGE`, `OFFSET_IMAGE`, `OVERLAPPING_PAIR`, `FULL_WIDTH_BAND`,
`VERTICAL_EDITORIAL`, `VISUAL_QUOTE`) are now genuinely reachable. V1 had wired 4 of 6 into `editorial.js`'s
`FEATURE_MEDIA_CYCLE`; this pass added the remaining two real cases to `renderFeature`: `FULL_WIDTH_BAND` (a 21:9
full-bleed band with a text overlay, `.media-full-band`) and `OVERLAPPING_PAIR` (a second, smaller "echo" card
offset behind the primary image — `.feature-visual-echo`). `OVERLAPPING_PAIR` deliberately reuses the *same*
already-resolved image rather than requesting a second one — a genuinely different composition at zero additional
image-model spend, matching the cost-discipline constraint (Part 27). No composition was left defined-but-dead;
none needed removing.

## 7. Surfaces — activated on live rendering (Part 7)

`editorial.js`'s `planLayout` now calls `pickTexturedSection([page], g.family)` once per Home page and stamps
`surfaceTexture` on **at most one** section — never more, and only after `safeToTexture` (a real WCAG contrast
check reusing `composition.js`'s existing `contrast()` helper, not a new implementation) confirms the industry's
texture won't fight the page's actual text/background colours. Both `renderFeature` and `comp-stamp.js` read and
render it (`data-surface-texture`, CSS in `styles.css`). Restrained by design, per the brief's own "never random
gradient spam" instruction — one deliberate accent per page, not a redecoration.

## 8. Depth — a real per-section property (Part 8)

`depthForSection(section, intensity)` derives a level from the section's own type and the **existing** V2
composition-pacing intensity (HEROIC→DRAMATIC, FEATURE→LAYERED, QUIET→FLAT) — never a second, parallel pacing
system. It returns `null` (no depth attribute at all) for any non-media section (FAQ, process, plain text), so a
page of mixed section types genuinely varies rather than every section floating. Wired into `comp-stamp.js`'s
existing dual DOM/HTML-string stamping (`data-depth`), so both the live preview and the exported static page carry
it identically.

## 9/10/12. Page-level art direction, pacing, and same-industry variation (Parts 9, 10, 12, 19)

Home's hero family, chosen per-business as above, sets the page's dominant visual tendency; secondary pages
inherit the same industry profile, palette and typography tokens (unchanged infrastructure) so they read as
related, not cloned in *visual* language — see §11 for the one place this pass found real content-level cloning
(a pre-existing, out-of-scope limitation, disclosed honestly rather than silently accepted). Pacing itself is
untouched from V1 (composition.js's existing weight/moment engine); this pass's actual, verified contribution to
"pacing" is that intensity now also drives a real visual consequence (depth) instead of only a CSS-class name.

**Same-industry variation was run for real, not just unit-tested** — see §16.

## 11. Asset-context-aware selection (Part 11)

`selectHeroFamily`'s `mediaCtx` (`funded`, `galleryCount`, `interfaceLed`) is the same real signal already computed
by the caller for image-planning purposes — never a second asset-counting mechanism. COLLAGE is refused below 2
gallery images; FLOATING_MEDIA is refused without a funded photo or an interface-led business; PRODUCT_STAGE is
refused entirely unfunded. This is exactly what caught and prevented the "COLLAGE with one image" / "PRODUCT_STAGE
with no product concept" failure modes the brief named.

## 13. Structured placeholders preserved (Part 13)

`product-bottle-stage` (V1's structured retail placeholder) is untouched and still used ahead of a generic scene
whenever PRODUCT_STAGE is chosen for an unfunded/placeholder-only business — verified in the skincare fixture's
"Shop" section screenshot (§16), which shows the deterministic SVG placeholder rendering correctly beside a real
generated image, never a fabricated product fact.

## 14. Deterministic contrast validation (Part 14)

`contrastOk(a, b)` and `safeToTexture(text, background)` reuse `composition.js`'s existing relative-luminance
`contrast()` — no parallel implementation. Unit-tested directly against the exact regression class the brief
named ("pale text on a pale surface"): `contrastOk('#eeeeee', '#f4f2ee')` is `false`. Surface texture activation
(§7) is gated behind this check, not behind hoping Claude notices.

## 15. Asset-quality routing

Not built as a new named system this pass — `mediaCtx.funded`/`galleryCount`/`interfaceLed`, already computed from
the real image plan/asset state, *is* the quality signal `heroCompatible` gates on (an unfunded business cannot get
PRODUCT_STAGE; a business with no gallery cannot get COLLAGE). A fully separate `HIGH_QUALITY_MEDIA` /
`WEAK_FALLBACK` taxonomy was considered and deliberately not added: it would have been new vocabulary duplicating
a distinction the compatibility gate already makes correctly, which the brief's own Part 26 (no unnecessary new
tools) argues against.

## 16. No semantic regression (Part 16)

All V7 grounding/truthfulness checks are untouched; `checkVisuals`'s `hero_family_mismatch` repair still runs, now
computing its target via the same `selectHeroFamily` instead of a static default, so a server-side repair can never
undo a correct client-side choice. Full suite: **159/159 passing** (up from 148 before this pass's 11 new tests).

## 17. Dev-only instrumentation (Part 17)

`applyVisualProfile` stamps `proj.design.premium.hf` (the chosen family) onto the project object — cheap,
persisted, never rendered as customer-facing copy. A second, explicitly-gated line
(`if (window.__vedbg) window.__vedbg.push({...})`) records the full decision (`family`, `subtype`, `funded`,
`galleryCount`, `cur`, `chosen`, `heroPickBefore`) but costs nothing unless a harness or future debugging session
opts in by setting `window.__vedbg = []` first — this is what the fixture harness (`run-fixtures.js`) now does by
default, capturing real per-generation selection data (`result.veDebug`) alongside every fixture run. This is the
exact mechanism that found and diagnosed the Part-4 bug in §12 below — kept permanently, not a one-off.

## 18. Fixture matrix (Part 18)

13 businesses, run through the real Electron harness end to end (not just constructed in-memory): roofing,
premium consultant (personal-brand), restaurant, photographer, real estate, renovation/cleaning (existing, not
re-run this pass), nonprofit, skincare, apparel, coffee/tea retail, SaaS analytics dashboard, technology/AI
(legacy), wellness, **plus the new `consultancy-firm` (plain, non-personal professional-services) fixture added
specifically to close the QUIET_LUXURY gap V1 disclosed**. Final full-matrix run: **13/13 accepted, 0 blockers**
(`/tmp/finalmatrix`).

## 19. Same-industry variation — verified in real rendered output, not just unit tests

Retail (3 sub-verticals, matching the brief's own example almost exactly):

| Fixture | Subtype detected | Final hero |
|---|---|---|
| skincare | `skincare` | **product-stage** |
| apparel (streetwear) | `apparel` | **collage** |
| coffee/tea retail | `coffee_tea` | **fullbleed-image** |

Three distinct hero families, correctly grounded in each business's real sub-vertical — not the same hero with
different colours. SaaS (`saas-dash`, analytics dashboard) independently landed on **floating-media** per its
dashboard concept, and the plain professional-services fixture landed on **quiet-luxury**, distinct from both.

## 20/21/22. QUIET_LUXURY, PRODUCT_STAGE, FLOATING_MEDIA — screenshot-verified, not just unit-tested

* **QUIET_LUXURY**: new fixture `consultancy-firm` ("A management consulting firm... advising mid-market
  manufacturers", no personal-brand wording) — this is the fixture V1 explicitly lacked (V1's only "consultant"
  fixture used first-person wording and routed to the separate `consultancy_personal` profile). Screenshot
  (desktop + mobile): restrained 2-column split, small eyebrow, capped-width headline, generous whitespace, single
  muted image, small pill CTA. Reads as genuinely restrained, not merely "a smaller version of another hero".
* **PRODUCT_STAGE**: `skincare` fixture. Screenshot (desktop + mobile): centred staged object, two concentric
  rings, soft glow, layered box-shadow depth, headline below, no clipping or overlap at 360px width.
* **FLOATING_MEDIA**: `saas-dash` fixture. Screenshot (desktop + mobile): 2-3 dashboard-card mockups in a genuine
  depth stack (back card scaled down/faded, front card sharp/highest shadow), correct mobile stacking, no overlap
  defects.

All three were inspected as rendered images, not inferred from JSON or test output.

## 23/24. Secondary pages and Contact (Parts 23, 24)

Secondary pages (Product/About/Contact) inherit the chosen family's typography and palette tokens and render
without layout defects at desktop/tablet/mobile widths, across every fixture in the matrix. Contact specifically:
where a form module is configured (the common case — `saas-dash`), Contact is already a real, functional,
well-composed page (labelled fields, brand-coloured surface, a supporting process section) with no changes needed.
Where no module is configured, the plain fallback (`renderContact`'s static branch) is a real contrast band with
location, CTA and — for any business whose source text actually stated one — a fact chip row (years/rating/count);
it does not stand empty. **One real, disclosed limitation found by this review**: with the mock harness's planner
permanently refused (by design — see §1), the deterministic engine's generic "process" section produces
byte-identical copy on every page it appears on (Home, About and Contact all showed the same "01 A private
consultation / 02 A plan built around you..." block in the `consultancy-firm` fixture). This is a property of the
no-API-key deterministic fallback path specifically — the real Claude planner (which this harness always bypasses
by construction) writes distinct per-page copy — and is unrelated to any of this pass's hero/media/depth/surface
code. Recorded here rather than silently accepted; fixing it would mean giving the deterministic secondary-page
copy generator per-page context, which is out of this phase's scope (not a visual-engine concern) and was not
attempted.

## 25. No motion engine (Part 25)

Untouched. No scroll timelines, no GSAP, no sticky/parallax. `data-hero-family`/`data-depth`/`data-media-comp`/
`data-surface-texture` attributes are exactly the kind of clean hook a future Motion Engine V1 could select against
— they exist because the visual system needed them for its own logic, not as a pre-built motion API.

## 26/27. Dependencies and spend (Parts 26, 27)

No new dependencies. `electron` had to be reinstalled locally to re-run the fixture harness this session (it was
present in an earlier session but not persisted in this worktree's `node_modules`) — a one-time environment fix,
not a project dependency change; `package.json` is untouched. No new Claude or OpenAI calls were added — every new
decision (hero family, media composition, depth, surface) reuses data the deterministic engine already computes
for other reasons (image plan, gallery count, composition intensity). Per-fixture generation cost across the full
matrix ranged $0.02 (SaaS fixtures with mocked-refused planner and starter-only visuals) to ~$2.75 (fully photo-led
retail/hospitality fixtures) — consistent with, not inflated beyond, the $0.62 image-heavy benchmark the brief
quoted (that benchmark itself assumed a real, non-mocked planner call; the mocked harness's own cost floor differs
for reasons unrelated to this pass).

## 28/29. Tests, then real rendering (Parts 28, 29)

11 new tests added (`SITEREMADE_VISUAL_ENGINE_V1_1` block in `test-premium-generation.js`): hero compatibility,
dynamic selection (keep-vs-replace), same-industry retail/SaaS/wellness variation, per-section depth
(media-only), contrast validation, media-composition rotation, surface activation (≤1/page), preview/export
parity for the new render attributes, hero-gate cross-consistency (client selector vs. server repair allowlist),
and planner-vocabulary exposure. **159/159 passing.** Beyond tests: the full 13-fixture matrix was rendered through
the real Electron harness and inspected as images (§19–24), which is how the one real bug this pass found (§12)
was actually caught — the JSON/acceptance gate alone said only "duplicate_section_id", not why.

## 30. Definition of done

| # | Item | Status |
|---|---|---|
| 1 | Vocabulary reachable by planner | ✅ via widened `hero` enum, both directions |
| 2 | Multiple hero families in realistic generation | ✅ product-stage, collage, fullbleed-image, floating-media, quiet-luxury, product-screenshot, split, collage all appeared across the 13-fixture matrix |
| 3 | Dynamic, compatibility-gated selection | ✅ `selectHeroFamily`/`heroCompatible`, unit-tested + fixture-verified |
| 4 | Media compositions visibly active | ✅ all 6, `FEATURE_MEDIA_CYCLE` |
| 5 | Surfaces active | ✅ ≤1/page, contrast-gated |
| 6 | Depth active | ✅ per-section, media-only |
| 7 | Same-industry sites visibly differ | ✅ §19 |
| 8 | Secondary pages participate | ✅ with one disclosed, out-of-scope copy-repetition limitation (§24) |
| 9 | QUIET_LUXURY verified | ✅ new fixture, screenshots §20 |
| 10 | PRODUCT_STAGE verified | ✅ screenshots §20 |
| 11 | FLOATING_MEDIA verified | ✅ screenshots §20 |
| 12 | No contrast regression | ✅ `contrastOk`/`safeToTexture` gate |
| 13 | No semantic regression | ✅ V7 checks untouched, full suite green |
| 14 | All tests pass | ✅ 159/159 |
| 15 | Screenshot review confirms real usage | ✅ §19–24 |

## A real bug found and fixed this pass (not in the original plan)

Two issues were found only by actually running the fixture harness, not by unit tests:

1. **The Part-4 selection-order bug**: an early draft of `selectHeroFamily` checked "keep the current hero if it's
   still compatible" *before* checking the business's own signal. Since a stale legacy heuristic (`grid-dashboard`,
   `poster`, etc.) had already set a hero before `applyVisualProfile` ran, and `TYPOGRAPHIC_STATEMENT`/others are
   unconditionally compatible, this silently preserved the wrong, unrelated guess for every business — apparel and
   skincare both would have kept whatever the legacy code happened to pick first. Root-caused with the `__vedbg`
   instrumentation (§17) across real fixture runs, not by reasoning about the code in the abstract. Fixed by
   checking the real signal first (§4/5).
2. **Two fixture-wording collisions in the pre-existing deterministic classifier** (not code this pass wrote): the
   new `saas-dash` fixture's text ("...for e-commerce teams") tripped an existing, literal `archetypeKeywordOverrides`
   substring match for `ecommerce-showcase`, and the original `coffeegear` fixture's text ("coffee equipment shop")
   tripped the existing `categoryKeywords.hospitality` list via the bare word "coffee" — both sent the fixture down
   an entirely wrong, unrelated business classification (a SaaS product built as an e-commerce storefront; a coffee
   *equipment* retailer classified as a *café*). The first produced the `duplicate_section_id` acceptance blocker
   this pass spent real time root-causing before finding it was a fixture-wording problem, not a Visual-Engine
   regression. Both fixtures were reworded to describe the same businesses without tripping the unrelated keyword
   lists; the classifier itself was left untouched (out of scope — a pre-existing, general keyword-classifier
   limitation, not something this pass's vocabulary touches).

## Remaining weaknesses (disclosed, not fixed this pass)

* The deterministic secondary-page copy generator repeats identical section copy across pages when the same
  section type recurs (§24) — masked in real production use by the real Claude planner, visible only in this
  mocked-planner test harness, and out of scope for a visual-engine pass.
* `archetypeKeywordOverrides`/`categoryKeywords` are literal, context-free substring matchers (no word-sense
  awareness) — found twice this pass via fixture wording, not this pass's code, and not touched.
* Media-composition and surface-texture vocabulary are still deterministic-engine-only, not planner-facing (§3) —
  a deliberate scope decision, not a gap the brief asked this pass to close (only hero family was named as needing
  planner exposure).
* Motion engine remains entirely unbuilt, as instructed (§25) — next phase.

## Commits and push status

Branch `siteremade-visual-engine-v1-1`, checkpoint tag `v-siteremade-visual-engine-v1-1-pre-activation` = `1140b32`.
All changes committed on this branch; **not pushed** — per the standing instruction not to push until
implementation and screenshots are verified. Screenshots have now been reviewed (§19–24) and the full suite plus
fixture matrix are green; push is ready pending explicit go-ahead.
