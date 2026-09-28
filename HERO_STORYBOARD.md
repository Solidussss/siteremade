# Hero Storyboard: a multi-image, motion-designed hero

Every generated site opens on a **hero built from several separately generated images** (a lead image plus at least
two supporting images) that move independently on one shared loop -- a short choreographed motion sequence, art
directed for the business. It supersedes the single-image moving hero (`HERO_DIRECTION.md`), which remains only for
projects saved before this change and as the no-image "statement" fallback.

This is CSS motion over separate generated **stills**. The image provider makes stills, not video, and nothing here
claims otherwise.

## The storyboard

`lib/premium/hero-storyboard.js` (pure; bundled into `premium-core.js`, required by `lib/site-render.js` and the save
validator; independent of `PREMIUM_GENERATION_V1`). Stored on the project as `heroStoryboard`:

| Field | Meaning |
|---|---|
| `concept` | the visual idea tying the images together, for this business |
| `composition` | one of 11 layouts -- `hero-stage`, `panorama`, `venue-stack`, `columns`, `arch-cluster`, `device-float`, `orbit`, `filmstrip`, `diagonal`, `fan`, `split-duo` -- each with desktop and phone placements per anchor (optionally a resting tilt) and a copy-safe side (`left`/`right`/`bottom-left`/`top`) the images never cover |
| `tone`, `light`, `loop` | dark/light stage, light sweep or glow, the shared loop length (8-18 s) |
| `layers[]` (3-4) | `slot` (`hero`, `hero-2`, ... -- each its own image), `role` (lead/detail/context/accent), `anchor` (placement), `subject`, `prompt`, `aspect`, `shape`, `depth` (z order), `motion {path, amount, offset}` (frame track + phase), `pan` (content track), `reveal` (entrance transition) |

**Where it comes from.** The existing Claude planning call (`submit_website_plan`) returns `heroStoryboard` -- no extra
model call. `validatePlanned()` checks it against THIS business: at least 3 layers, exactly one lead, unique
placements, every image a different subject (prompt similarity), prompts specific enough to generate, a known
composition, and every layer recognisably this industry (category vocabulary or the business's own words) with no
other industry's signature subject (laptops/dashboards on a landscaper's site...). Anything else is rejected and the
reason recorded (`fallbackReason`).

**Fallback.** `fallbackStoryboard()` art-directs from a concept library covering every category the generator
supports, with sub-types where categories repeat (drinks / skincare / packaged food / home goods; coffee roaster /
cafe / restaurant / bakery / bar; photographer / design studio; vertical SaaS / developer platform; physio / spa;
boxing / pilates / gym; homes / condos; design-build / lawn care; detailing / repair; law / consulting; ...). The
sub-type the description matches most strongly wins; within it, the concept, motion amounts, phases and loop length
are varied deterministically from the business's own words, so same-category businesses get different concepts,
images, compositions and motion. Prompts are filled from the business name, its own offerings, what it says it does,
its place and colour. A business the classifier cannot place (`other`) still reaches the matching sub-type (a tonic
maker gets a drinks hero).

## Images: separate assets through the existing pipeline

`buildImagePlan` plans one slot per layer; each is requested through `/api/generate-image` (same provider, same
routes, same replay/storage in `lib/image-delivery.js`), stored in `assets.generated[slot]`, saved, and exported like
any other image.

**Budget.** The hero's images are funded first, from their own allowance, never cut back to one image by a small site
budget:
* client: `planHeroImages` funds the layers in order, guaranteeing every layer at least its cheapest route before any is
  upgraded; the rest of the site keeps exactly the budget it had before (site ceiling minus what the single hero image
  used to cost there);
* server: hero-layer requests (`heroLayer: true`) reserve from `SITEREMADE_HERO_IMAGE_BUDGET_USD` (default: this
  deployment's own price for a premium lead at medium + three support images at medium, so it scales with
  `SITEREMADE_IMAGE_COST_*`), separately from `SITEREMADE_IMAGE_BUDGET_USD`; `/api/image-provider-status` reports
  `heroBudgetUsd` and `heroMinImages`.

Expected hero cost on the current route (lead = premium model at medium, supporting = support model at medium):

| Price table | Lead | 2 supporting | Hero total | Credits |
|---|---|---|---|---|
| repo defaults | $0.2100 | $0.0210 each | **$0.2520** | 4 |
| 12c per image | $0.12 | $0.12 each | **$0.36** | 4 |

Premium mode (`PREMIUM_GENERATION_V1`) funds the layers through its own allocator (lead on the hero tier, supporting
layers on the primary tier; never replaced by a starter graphic).

## Motion

`styles.css` "HERO STORYBOARD". Every layer carries its own placement and motion as custom properties and runs the
same two keyframes (`sb-track` for the frame, `sb-pan` for the picture inside it) on the shared `--sb-loop` from its
own phase, so layers move independently yet the composition repeats exactly once per loop. Transform/opacity/
clip-path only; one-shot staggered reveals (wipe, iris, rise, scale); a light sweep or glow across the stage; the
headline never moves on a loop. Phones use each layer's phone placement (`--mx/--my/--mw/--mh`), images first.
`prefers-reduced-motion`: every image stays visible at rest in its composed position. The export pauses the loop off
screen; the live preview keeps the loop's phase across edits.

## Also fixed on the way

* The generic 900kb JSON body parser ran before the project routes' own 35mb parser, so saving any project with more
  than ~900kb of generated images failed with a 413. It now steps aside for exactly those routes.
* Category keywords ignore accents ("café" matched no category).
* Legacy-route portrait layers (4:5/3:4) are generated portrait instead of square-then-cropped.
* Found by the browser review: the generic `.site-actions button` rule inked the hero CTA with body text (dark on
  the accent fill and on dark stages) -- the storyboard CTA now takes the stage's ink; on phones the copy-on-top
  layout's centred stage collapsed to zero width (every image gone); Chromium left a 1px column of the panning
  picture outside a frame's rounded clip; the reveal clip trimmed the frames' drop shadows; a trailing "made in
  Victoria" became an offering called "Made".

## Verifying

* `npm test` -- `test/hero-storyboard.test.js`: category coverage, 3+ distinct images each with its own motion,
  on-industry subjects, planner rejection + fallback, planned and fallback paths, same-category differences,
  preview/export parity, save round-trip, phone placement / copy-safe space, reduced motion, budget at repo prices and
  at 12c, server hero allowance, large saves, no real provider calls.
* `ELECTRON_PATH=<electron.exe> node test/review/hero-matrix-review.js <outDir>` -- every fixture in
  `test/fixtures/hero-matrix.js` exported and captured in motion (desktop + phone, 5 points in the loop, reduced
  motion, a 4 s MP4 burst), with contact sheets and per-business checks.
* `ELECTRON_PATH=<electron.exe> node test/review/review-sites.js <outDir>` -- the live preview through the real page
  and server for a subset, preview + export.
