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

## Imagery: specific subjects, a drawn fallback, the owner's photos

**What each image shows** comes from the owner's own words (`lib/premium/visual-subjects.js`), not a category
keyword: the product types and the containers they really come in (serum -> dropper bottle, cleanser -> pump,
sparkling soda -> can, kombucha -> glass bottle), the flavours they name, their menu items, and the services they
list (a lawn-maintenance company gets mowing / edging / aeration; a landscape builder patios / retaining walls /
planting). A library of ~90 named subjects ("facets"), each with a label, a photographic prompt (subject, setting,
framing, material, light) and a matching drawing, fills the concept's roles in the order the owner names them;
venues keep their own lead (a café leads with the café). Businesses the classifier cannot place (`other`) draw on the
whole library (boats, tackle, bouquets, stationery, moving boxes...). Prompts also carry framing for the layer's own
camera move and one shared look line, so the set reads as one composition.

**Planner checks for sense, not just keywords** (`validatePlanned` -> `planProblems`): a container that contradicts
the product (a dropper for a drinks brand) or a set of images that ignores everything the owner said they offer is
rejected and replaced by the fallback. The planner call is unchanged (same single call); its schema gained optional
`treatment`, `look` and a software `interface` brief.

**Drawn illustrations** (`lib/premium/hero-art*.js`): every layer carries an art spec, and whenever no image exists for
it -- generation off, unfunded, failed, or still in flight -- it draws that illustration instead of dropping out: ~120
detailed, shaded SVG pictures (products with the business name on the label, lawns and patios, rooms, tools, garments,
food, vehicles...), all tinted from the site accent with one light direction, shadow style and grain. A software lead is
always a drawn interface (scheduling, monitoring, pipeline, invoices, inbox, editor, storefront, analytics, courses,
documents, workflow) with readable labels from the owner's words, in a wide desktop layout and a compact phone layout;
it is never bought as an image. Interfaces carry no invented numbers, prices, ratings or customer names.

**Replacing an image** (editor, "Your images"): one row per hero image, labelled by role and subject, showing where its
picture comes from (your photo / generated image / illustration / drawn interface), with "Use my photo" / "Replace",
"Remove photo" and a Focus point. The photo is bound to that layer's slot (`asset.slot`), keeps its placement and motion,
outranks any generated image or drawing, is never regenerated over, and survives save, reopen and export.

**Cost.** Same provider, models, qualities, budgets and one planning call. Software heroes buy one image fewer (the
drawn interface replaces the premium lead). Checked with `test/hero-imagery.test.js`, `test/review/review-sites.js
--replace` (the real editor) and `test/review/imagery-review.js` (before/after contact sheets).

## Keeping the subject in view (`lib/premium/hero-framing.js`)

A layer is a frame that moves on its own track, with a picture inside it oversized 7% each side and panned or zoomed.
The same wide drawing cropped into a narrow phone frame, or sitting behind the headline, used to lose its subject (the
roofing lead once showed grass and a tree while the house was cut away). Now:

* **Every drawing marks its subject.** Parts a kind draws through the shared kit (a house, a boat, a can, a treatment
  table) are wrapped in `<g data-subject="1">` unless they are scenery (sky, lawn, trees, studio wall); rooms mark
  their key object themselves; `SUBJECT_PARTS` narrows a kind whose props would otherwise count (a lawn-mowing scene's
  house is scenery, its mower the subject). Whole-frame textures and rooms are listed as scenes.
* **Each drawn layer is composed twice** -- for its desktop frame and for its phone frame (`.ha-desk` / `.ha-phone`,
  switched by the phone container query), at that frame's real proportions.
* **Subject-aware framing.** For each view, what covers the frame is worked out from the composition: the layers
  stacked above it (at every point of both frames' motion) and, for a full-bleed lead behind bottom-left copy, the copy
  block. The crop (the SVG viewBox) is chosen so the subject stays inside the part of the picture that is visible
  through the whole pan/zoom loop, inside the frame's shape (circle, arch) and clear of those covers; when the crop alone
  cannot, a slightly wider or taller canvas is drawn, and as a last resort the subject slides along its ground line or
  shrinks a little about its base. The fan layout's centre card now lies on top of its tilted neighbours (which move
  gently), and the panorama insets hug the right edge, leaving the lead's subject an open window.
* **Photos** (uploaded or generated) have no known outline: each view gets an object-position (`--op` / `--op-m`)
  that keeps the photo's middle clear of what covers the frame; the owner's chosen focus wins on both. Lead prompts ask
  for the subject whole in the middle half, the scene continuing to both sides, so a phone crop keeps it.
* **Checked** by `test/helpers/hero-framing-check.js` (re-derives every layer's visible subject from the rendered
  markup: placement and motion properties, viewBox, `data-subject-box`) and in a real browser by
  `test/review/imagery-review.js`, which freezes the loop at several moments on desktop and phone and hit-tests points
  across each subject's outline -- a point counts only when the topmost element there belongs to that layer.

## Saying the right thing

* **Heat levels, ingredients and flavours are different facts** (`visual-subjects.js`): "Three heat levels: mild,
  smoky and ghost pepper" labels the bottles; "made with fermented chilies" is the ingredient; "habanero mango" is one
  flavour. "Smoky" is a taste, never drawn as a thing. A sauce is a woozy bottle full of sauce (clear glass, sauce up
  into the neck, ribbed cap), labelled with the brand and what is inside; a range of heats is a row of bottles, each
  labelled with the owner's name for it; the ingredients are whole chilli pods and a split one showing its seeds. Only
  stated ingredients are drawn (a hot sauce is chillies by definition); nothing is invented.
* **Everyday subjects follow the owner's list**: a business filed under another category that lists sailboats, bikes
  or flowers among what it offers shows those (a yacht broker filed as real estate no longer leads with a house).

## Names and opening words (`lib/premium/hero-copy.js`)

* **The name the owner wrote** is found in natural openings ("Harbour Knots teaches...", "We are Stem Studio, a...",
  "Citrine Soda Co. makes...", "...called X", "At X, we...") and never taken from a service, a place or a fragment
  ("Residential Cleaning offers...", "Toronto is where..."). It wins over the planner's; a name the owner types in the
  editor survives regenerating the same description, saving, reopening and export, and the drawings' labels always
  carry the current name. With no name the site uses a clear "Your Business" placeholder (flagged, kept through saves,
  never printed on packaging) -- never an invented "<Category> Studio". The planner is told the name and asked to use
  it exactly.
* **Headlines from what the business does**: the owner's first sentence is read into what it is (a florist) and what it
  does (verb, objects, where/how), and the headline is built only from those words in one of several shapes chosen per
  business -- "Sailing lessons and sunset cruises from the marina.", "Delivered across Bristol: bouquets and wedding
  flowers.", "Exercise rehab, dry needling and manual therapy for running injuries.", "Rent kayaks and paddleboards by
  the hour on Lake Muskoka.", "Wedding and portrait photography in Toronto." The kicker is what the business is; the sub
  is the owner's next sentence. Nothing is added: no results, guarantees, credentials or superlatives.
* **Planner headlines** ship as written when specific; one that is a category word plus a stock phrase, says nothing
  about this business, or makes a claim the owner never made (awards, rankings, numbers) is replaced by the grounded
  fallback (`meta.plannerHeadlineReplaced` records why). The planner prompt gained the same rule -- same single call.

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
* `npm test` -- `test/hero-polish.test.js`: the roofing house on phones through the loop (and proof the check catches
  the old crop), every fixture's subjects on both views, vulnerable subjects in every frame shape, photo framing, the
  hot-sauce facts and drawings, names (natural openings, rejections, placeholder, owner-typed name through regenerate /
  save / export), grounded and varied headlines, planner-headline acceptance and replacement.
* `ELECTRON_PATH=<electron.exe> node test/review/imagery-review.js <outDir> --before <old checkout>` -- before/after
  contact sheets with the headline and name, desktop and phone at several points of the loop, and the browser-measured
  visibility of every drawn subject (`visibility.json`).
