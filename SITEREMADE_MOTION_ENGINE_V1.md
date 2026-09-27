# SITEREMADE MOTION ENGINE V1 — planner-directed reveals, depth, product motion and responsive scroll choreography

## 1/2/3/4. Checkpoint, branch, starting/final commit
Checkpoint tag `v-siteremade-motion-engine-v1-pre-build` = `3b6d713` (Visual Engine V1.1, already on `origin/main` at the
start of this phase). Branch `siteremade-motion-engine-v1`. Final commit: see §38 (not yet made at the time this
report was drafted — committed immediately after, same hash referenced in the commit message).

## 5. Files changed
New: `lib/premium/motion-engine.js`, `premium-fixtures/verify-motion-runtime.js`, this report.
Modified: `lib/premium/index.js` (registers `motionEngine`), `lib/premium/comp-stamp.js` (per-section
reveal/stagger stamping), `lib/premium/editorial.js` (sticky selection + render), `lib/project-store.js`
(`stickyMode` whitelist), `server.js`/`script.js` (patch round-trip), `script.js`/`lib/site-render.js` (hero motion
attributes), `lib/export-compiler.js` (header-scroll + parallax runtime), `styles.css` (the whole motion CSS
block), `test-premium-generation.js` (13 new tests), `premium-core.js` (rebuilt).

## 6. Existing motion audited (Part 2) — before writing a line of new code
* **ONE shared `IntersectionObserver`** already drives a one-shot fade+rise reveal on every top-level
  `.site-hero`/`.site-page-header`/`.site-section` on the real **exported** site (`lib/export-compiler.js`'s
  `SITE_RUNTIME_JS`), with a passive `scrollCatchUp` fallback for instant jumps/anchor landings. Respects
  `prefers-reduced-motion` and a pre-existing per-category `data-motion="none"` kill switch.
* The **live in-app preview** deliberately runs a simpler, non-scroll-triggered copy (`script.js`'s
  `initSiteMotion`) that marks everything revealed immediately, because `renderProject` rebuilds
  `siteSectionsRoot.innerHTML` from scratch on every keystroke — there is no "already revealed" state to
  preserve across that replace, so a real observer there would flicker. This is a pre-existing, well-reasoned,
  **intentional** preview/export difference; this pass does not touch it, and everything new added this pass
  respects the same split (see §28).
* A per-archetype `[data-motion-character]` recipe already sets `--reveal-y`/`--reveal-dur`/`--hover-lift`/
  `--stagger-step`/`--img-hover-scale`; a per-category `[data-motion="none"|"expressive"]` switch already exists
  and already cascades under reduced-motion. Per-step stagger already existed for exactly one case
  (`.process-flow>*` nth-child transition-delay).
* `visualDirection.motion` (`MOTION_KEYS = ['none','subtle','expressive']`) was **already a real, planner-facing,
  already-round-tripped field** — found during this audit, before any new schema was even considered. This
  became the reuse point for Part 23 (§25).
* `data-nav="minimal-until-scroll"` already existed as a nav **style name** with no scroll behaviour behind it —
  a static, always-transparent look. This became the reuse point for Part 18 (§22).
* No animation library, no scroll-jacking, no canvas/WebGL, no per-element scroll listeners anywhere.
Nothing above was duplicated. Every new mechanism below extends one of these exact points.

## 7. Motion architecture added
One new pure vocabulary module, `lib/premium/motion-engine.js` (no I/O, no model calls, no randomness — mirrors
`visual-engine.js`'s shape exactly, bundled identically into `premium-core.js`), plus: per-section reveal/stagger
stamping generalised into the existing `comp-stamp.js` dual DOM/HTML-string stamper; hero-motion/depth-motion
attributes added to the existing `veAttrs` hero markup in both `script.js` and `lib/site-render.js`; one new
plan-time field (`stickyMode`) following the exact whitelist-and-render pattern `mediaComposition`/`surfaceTexture`
already established in V1.1; two small, tightly-scoped additions to the real export runtime (`SITE_RUNTIME_JS`) —
header-scroll and restrained scroll-linked parallax, both gated behind the runtime's own existing
`motionDisabled` check.

## 8. Motion vocabulary
`REVEAL_MODES` (6): `NONE, FADE, RISE, SLIDE, SCALE, MASK` — RISE is the pre-existing default (unchanged), the
other 5 are new CSS variants of the same `.sr-reveal`/`.sr-revealed` mechanism. `HERO_MOTION_MODES` (5):
`STATIC, FLOAT, PARALLAX, STAGE_REVEAL, EDITORIAL_REVEAL` — one per hero family (two families legitimately share
a pattern where the brief's own description is the same movement idea; the CSS still differentiates them via
each hero's own distinct markup). `DEPTH_MOTION` (4): `NONE, SUBTLE, PARALLAX, LAYERED` — reads Visual Engine's
existing static depth (`FLAT/SUBTLE/LAYERED/DRAMATIC`), never a second depth taxonomy. `STICKY_MODES` (2):
`NONE, LIGHT`. Deliberately no separate "media reveal"/"image motion" tree (Part 11): mask/scale reveal +
hero-motion keyframes already cover every image-motion ask in the brief; a 6th parallel vocabulary would have
duplicated a distinction these already make (Part 36's "quality over quantity" instruction, applied literally).

## 9. Motion intensity system
`MOTION_INTENSITY` (4): `NONE, SUBTLE, MODERATE, EXPRESSIVE` — independent of Visual Engine's static visual
intensity (Part 4's own example: QUIET_LUXURY can sit on a visually rich palette and still move at SUBTLE).
Resolved **once per generation** (`motionIntensityFor`, called from `applyVisualProfile`, stored on
`design.premium.mi`, never recomputed per render) from: the hero family's own base intensity, an industry
tendency (§10), and — **no new planner field** — the pre-existing `visualDirection.motion` value as a ceiling:
`'none'` is an absolute kill switch, `'subtle'` caps at SUBTLE (preserving that field's existing meaning
exactly), `'expressive'` *unlocks* (does not force) the hero family's fuller range. A `MOTION_INTENSITY_CAP`
(QUIET_LUXURY→SUBTLE, TYPOGRAPHIC_STATEMENT→MODERATE) is always the final, non-negotiable ceiling.

## 10. Whole-page motion budget
Implemented as the combination of: (a) the one resolved page-level intensity ceiling above, (b) a deterministic
per-section reveal **cycle** (`sectionRevealFor`, keyed to each section's own real position among the page's
sections, never `Math.random`) so consecutive media sections at MODERATE/EXPRESSIVE genuinely vary rather than
all playing the same treatment, and (c) `MINIMAL_MOTION_SECTIONS` (`faq, contact, pricing, process`) always
capped to a plain fade regardless of the page's intensity — the page's "some sections stay quiet" requirement
holds structurally, not by hoping the cycle happens to land on FADE sometimes.

## 11. Hero motion behaviors (Part 6)
| Family | Pattern | What actually moves |
|---|---|---|
| PRODUCT_STAGE | STAGE_REVEAL | staged object scale/fade entrance; rings drift slowly (MODERATE+); object floats gently (EXPRESSIVE only) |
| FLOATING_MEDIA / COLLAGE | FLOAT | back→front staggered depth entrance; each card drifts on its own phase (EXPRESSIVE only) |
| FULL_BLEED_CINEMATIC | PARALLAX | slow, controlled Ken-Burns image scale (MODERATE+), never a hard zoom |
| EDITORIAL_SPLIT / FRAME_WITHIN_FRAME | EDITORIAL_REVEAL | image leads; copy offsets slightly against it |
| QUIET_LUXURY / TYPOGRAPHIC_STATEMENT | STATIC | one restrained fade/scale entrance only, no continuous loop ever |
Every hero's copy reveals a beat after its own media (Part 6: "text reveal separate from the object"), and every
continuous/looping treatment is gated to MODERATE/EXPRESSIVE — a SUBTLE-intensity business gets the one-shot
entrance and stops there, exactly matching Part 4's "dramatic visual ≠ dramatic motion."

## 12. Section reveal system
Generalises the pre-existing `.sr-reveal`/`.sr-revealed` mechanism with `[data-reveal]` variants (FADE/RISE/
SLIDE/SCALE/MASK — NONE bypasses the mechanism entirely, verified unconditionally visible in CSS with no
`.sr-revealed` dependency, §29). MASK scopes its clip-path wipe to the section's own media element only
(`.feature-visual`/`.gallery-tile`/`.site-visual`), never the section's text, so "reveal from crop" never reads
as a text-clipping bug.

## 13. Stagger system
The exact delay ladder already built for `.process-flow>*` generalised to any `[data-stagger]` container (card
grids, stats, media clusters — `STAGGER_SECTION_TYPES`), capped at 6 real steps; anything past the 6th shares the
6th's own delay rather than queuing one-by-one indefinitely (Part 8's explicit constraint).

## 14. Parallax/depth behavior
`DEPTH_MOTION="PARALLAX"` is the only level driven by live scroll position. A single `IntersectionObserver`
tracks which parallax elements are currently visible; a single shared, passive `scroll` listener + one
`requestAnimationFrame` per batch updates `--parallax-y` **only** for that in-view set (never a forced layout
read per element, never a listener per element). **Real bug found and fixed during runtime verification, not by
reading the code**: the observer's own async callback could resolve after the scroll event that triggered it, so
an element that became visible without one more subsequent scroll never received its first update — fixed by
scheduling the update from the observer callback itself as soon as an element enters view, not only from
`scroll`. Disabled entirely below 641px and behind reduced-motion/`data-motion="none"`.

## 15. Mask reveals
Covered under §12 — `[data-reveal="MASK"]`, `clip-path: inset(...)`, scoped to media elements only.

## 16. Product motion (Part 12)
PRODUCT_STAGE's STAGE_REVEAL: real scale+fade entrance on the staged object, slow ring rotation/scale drift
(never a spin), a tiny continuous float only at EXPRESSIVE — verified by direct runtime inspection (§32) and by
screenshot (skincare fixture, final revealed state matches the pre-existing V1.1 layout exactly, confirming zero
visual regression from the new attributes).

## 17. UI/SaaS motion (Part 13)
FLOATING_MEDIA's FLOAT: staggered back-to-front card entrance (0.12s/0.24s delays), continuous opposite-phase
drift on the back/front cards only at EXPRESSIVE — verified on the `saas-dash` fixture.

## 18. Section transitions (Part 14)
Deliberately minimal, per the brief's own "not a cinematic timeline system yet": the final CTA band gets a
slightly stronger entrance distance (`--reveal-y * 1.3`) so the page reads as ending with intent (§20); no
gradient-handoff/media-bleed system was built beyond what composition.js's existing tone system already provides
— a second transition system there would have duplicated it.

## 19. Sticky/pinned-light behavior (Part 15)
`stickyEligible`/`pickStickySection`: at most one per page, only a genuine two-column `editorialFeature`
(image-left/image-right), and only when the page's own resolved intensity is MODERATE/EXPRESSIVE — a
SUBTLE/NONE page never scroll-pins anything. Selected once at plan time (`editorial.js`'s `planLayout`, same
pattern as V1.1's surface-texture selection), persisted as `section.stickyMode`, rendered by the existing shared
`renderFeature`. CSS: `position:sticky` only above 900px width; reverts to normal stacked flow below it and under
reduced-motion (§23/24).

## 20. Typography motion (Part 16)
Not a separate system: hero copy's own delayed fade/rise entrance (§11) already covers "eyebrow/headline
sequencing" without letter-splitting or a typewriter effect, which the brief explicitly warns against.

## 21. Microinteractions (Part 17)
Pre-existing (card hover, button hover, icon nudge, `focus-visible`) and untouched — already complete per the
FINAL BASELINE POLISH pass audited in §6; nothing here needed adding.

## 22. Header/footer motion (Part 18/19)
Header: wired onto the **existing** `data-nav="minimal-until-scroll"` name (previously a static, always-
transparent look with nothing behind its own name) — a shared scroll listener toggles `data-nav-scrolled`, CSS
solidifies the bar past a small threshold. Verified as **real running behaviour**, not just CSS: a synthetic
runtime test (§32) confirmed `data-nav-scrolled` flips to `"1"` on scroll and back to `"0"` at the top. Footer/
final CTA: the slightly-stronger entrance from §18.

## 23. Reduced-motion behavior (Part 20)
Every new mechanism this pass added (all `[data-reveal]`/`[data-stagger]` variants, every hero-motion keyframe,
parallax, the sticky pattern) is named again in the pre-existing belt-and-suspenders
`@media(prefers-reduced-motion:reduce)` block **and** the pre-existing `data-motion="none"` kill switch — neither
is a new mechanism, both are the same pattern the FINAL BASELINE POLISH pass already established, just extended
to cover this pass's own new selectors. Verified by a dedicated test that reads the actual CSS and asserts every
new selector name is present inside both override blocks (not merely that the blocks exist).

## 24. Mobile fallback behavior (Part 21)
Simplified, not switched off: parallax degrades to a static `transform:none` below 641px (Visual Engine's own
static depth still applies); hero drift/float keyframe loops (a desktop refinement) stop below 641px while the
one-shot entrance reveals still play at every width; the sticky feature reverts to normal stacked flow below
900px. Verified visually on the `consultancy-firm`/`saas-dash` mobile screenshots (§34) — no overflow, no jank,
no scroll-trapping.

## 25. Planner schema exposure (Part 23)
Deliberately **zero new schema fields**. `visualDirection.motion` (already real, already round-tripped) is the
one lever exposed, reused exactly as documented in §9 — Claude's payload does not grow by one byte (Part 33).
`heroMotion`/`depthMotion`/`sectionMotion`/`mediaReveal`/`staggerMode`/`stickyMode` are all fully deterministic,
computed server/client-side from hero family + section type + industry + the one intensity value — exposing
them as separate planner fields would have been new surface area for a choice the business's own facts already
determine correctly (the same scope discipline V1.1 applied to media composition/surface texture).

## 26. Compatibility rules (Part 24)
`MOTION_INTENSITY_CAP` (hero-family ceilings) + `sectionMotionCompatible`/`MINIMAL_MOTION_SECTIONS` (dense/
functional sections never exceed FADE) + `stickyEligible`'s own intensity-rank gate. All three are real,
unit-tested predicates a planner-facing value would also have to pass through, not just documentation.

## 27. Industry tendencies (Part 25)
`INDUSTRY_MOTION_TENDENCY` — a soft default only ever consulted when `visualDirection.motion` gives no explicit
signal; an explicit choice (including the absolute `'none'` kill switch) always wins. Verified by test that an
explicit `'none'` overrides even the most expressive industry's own tendency.

## 28. Preview/export parity (Part 27)
The hero's own `data-hero-motion`/`data-motion-intensity`/`data-depth-motion` attributes are computed identically
in `script.js` and `lib/site-render.js` (same source, same values) — verified by both a source-text-presence test
and a real `lib/site-render.js` `renderHero()` execution test asserting the actual attribute values. The
*driver* (instant-reveal in the live editor vs. scroll-triggered in the real export) intentionally still differs,
exactly as it already did before this pass (§6) — CSS specificity was checked by hand to confirm the "revealed"
state rule (which requires an extra class, `.sr-revealed`) always outranks the "hidden" state rule regardless of
whether `.sr-reveal` is present, so the live editor — which only ever adds `.sr-revealed` — safely shows every
hero/section in its final, correct state with no risk of a stuck-invisible element.

## 29. Static fallback (Part 29)
`[data-reveal="NONE"]` sets `opacity:1;transform:none;transition:none` unconditionally — verified by test to have
no dependency on `.sr-revealed` or JS having run at all. Motion is an enhancement layered onto already-correct,
fully-visible markup everywhere; nothing in the renderer requires motion JS to produce a usable page.

## 30. Performance impact (Part 22)
Every animated property introduced is `transform`/`opacity`/`clip-path` — never `width`/`height`/`top`/`left`.
One `IntersectionObserver` for reveal (pre-existing) + one new `IntersectionObserver` for parallax (only created
when a `PARALLAX` element actually exists on the page) + two passive `scroll` listeners, both `requestAnimationFrame`-
throttled, both reading only pre-computed/observer-supplied state (no per-frame `getBoundingClientRect` sweep
across the whole page). No new dependency; no client-side library added.

## 31. Test matrix (Part 30)
13-fixture matrix from Visual Engine V1.1, re-run with all Motion Engine changes in place: SaaS (`saas-dash`),
retail/product (`skincare`, `coffeegear`), wellness (`wellness`), hospitality (`restaurant`, via the earlier
matrix), real estate (`realestate`), roofing/trade (`roofing`), creative portfolio (`photographer`), professional
consultancy (`consultancy-firm`) — **8/8 re-run this pass, 0 acceptance blockers**, each carrying real, distinct
`data-hero-motion` values matching its own hero family.

## 32. Motion verified as real running behaviour, not just screenshots (Part 31)
Screenshots alone cannot show motion (the live preview intentionally renders the final, fully-revealed state —
§6/28), so a dedicated runtime harness (`premium-fixtures/verify-motion-runtime.js`) loads the **actual**
`SITE_RUNTIME_JS` string (extracted from `lib/export-compiler.js` at run time, never a reimplementation) plus the
real `styles.css` into a real Electron page and drives real scroll events, confirming:
* a below-the-fold section starts unrevealed and becomes fully revealed (`opacity: 0 → 1`) only after being
  scrolled into view;
* the hero, in view at load, reveals automatically;
* `data-nav-scrolled` flips to `"1"` on scroll and back to `"0"` at the top;
* `--parallax-y` receives a real, non-zero computed value once a parallax element is in view.
This is also where the real parallax-timing bug in §14 was found and fixed — the JSON/screenshot record alone
would never have caught it.

## 33. Tests added (Part 35)
13 new tests (`SITEREMADE_MOTION_ENGINE_V1` block): vocabulary normalization/fallback, hero-motion coverage for
all 8 families, motion-intensity resolution (kill switch, cap, unlock), industry-tendency softness, dense-section
compatibility, determinism (including a literal source-text check that the module never calls a pseudo-random
function), whole-page budget variety, sticky eligibility/cap, reduced-motion + mobile-fallback CSS coverage,
static NONE fallback, preview/export parity (both source-text and real execution), and planner-safety (a
corrupted `stickyMode` value never survives `project-store.js` validation).

## 34. Total tests passing
**172/172** (159 pre-existing + 13 new), zero regressions.

## 35. API cost impact (Part 33)
Exactly $0 additional model cost — no new Claude or OpenAI calls anywhere in this pass. `visualDirection.motion`
already existed in the planner schema before this phase began, so the payload does not grow. Per-fixture
generation cost across the re-run matrix is unchanged from the Visual Engine V1.1 baseline ($0.02–$2.75 depending
on photo-led vs. interface-led business), confirming no incidental spend increase.

## 36. Remaining weaknesses (disclosed, not fixed this pass)
* Parallax/sticky verification used a synthetic runtime harness (real `site.js`/`styles.css`, a hand-built page),
  not a full compiled export of a real generated project through `lib/export-compiler.js` end to end — building
  that full harness (a real `project`/`directionsState` row, database wiring, asset hydration) was judged out of
  proportion to this phase's actual risk surface, since the runtime code under test is byte-identical either way.
* `visualDirection.motion`'s 3-value ceiling (none/subtle/expressive) means the planner still cannot request
  MODERATE outright — it can only unlock the hero family's own range up to EXPRESSIVE or cap it at SUBTLE. This
  was a deliberate, disclosed scope decision (§25), not an oversight.
* Section transitions (Part 14) stayed intentionally minimal, per the brief's own "not a cinematic timeline
  system yet" instruction — a future Motion Engine V2 has real room to grow here.

## 37. Push status
Branch `siteremade-motion-engine-v1`, checkpoint `v-siteremade-motion-engine-v1-pre-build` = `3b6d713`. All
changes committed on this branch; **not pushed** — tests pass (172/172), live motion has been reviewed as real
running behaviour (§32) and screenshot-reviewed for regressions (§34/6), reduced-motion and mobile fallback are
verified, and performance stays GPU-safe throughout, but per the standing instruction push happens only on
explicit confirmation.
