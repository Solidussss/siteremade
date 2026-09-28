# Hero Direction: art-directed moving hero + section carry-through

Generated sites were landing on the same few page structures with static placeholder art (dotted panels,
skeleton "menu" lines, icon-card rows that repeated the services) and category filler under every card
("Real landscaping work, presented clearly."). This pass directs the hero from the business itself and
carries that direction through the page.

## The hero

`lib/premium/hero-direction.js` (pure, bundled into `premium-core.js`, required by `lib/site-render.js`;
independent of `PREMIUM_GENERATION_V1`) picks one treatment per business from its category, archetype and
wording, and renders it as a short seamless camera move over ONE generated still. The image provider makes
stills, not video.

| Treatment | For | Composition | Camera |
|---|---|---|---|
| `PRODUCT_CLOSEUP` | product brands (retail) | product close and lit on a dark brand-tinted stage, the range as chips | slow push-in, light sweep |
| `FINISHED_WORK` | trades, outdoor, property, nonprofit | the finished result full-bleed, services strip along the bottom | slow pan |
| `ATMOSPHERE` | cafes, restaurants, studios, fashion | tall frame + a detail crop of the same still | layered parallax (frames drift against each other) |
| `CARE` | clinics, wellness, fitness, advice, education | arched portrait frame, what they treat as a checklist | slow breathing zoom |
| `INTERFACE` | software | the product on a floating, tilting screen, capabilities drifting around it | float |
| `STATEMENT` | no hero image (unfunded, failed, generation off) | oversized type over a moving light field, offerings ticker | light field |

* Chosen once at generation time (`buildGenerationPlan`, after every hero-layout decision, before the image
  plan) and saved as `design.heroDirection`. If the owner later picks a different hero layout, the
  direction steps aside (`baseHero` no longer matches).
* The hero image prompt is written for its camera move (margin for a push-in, a scene that continues past the
  edges for a pan). A planner's own hero prompt keeps its subject and only gains the framing sentence.
* No extra image spend: every directed hero uses the single `hero` slot (the layered treatment reuses it as
  its detail crop; the classic collage's second paid slot is not planned).
* Motion is CSS only (styles.css, "HERO DIRECTION"): transform/opacity, `alternate` loops so they reverse
  instead of jumping, a one-shot intro on the wrapper that never fights the loop, headline never moves.
  `prefers-reduced-motion` stops everything. The export runtime pauses the loop while the hero is off screen.
  The live preview (re-rendered on every edit) skips the intro after the first render and resumes the loop at
  its current phase. The site-wide `data-motion="none"` switch still governs section reveals/hovers; the hero
  camera stays on at its gentle strength.

## Carry-through

* `lib/premium/offering-copy.js`: one honest line per offering (lexicon of common offerings, otherwise a line
  anchored to the business name/place; product facts only when the owner stated them), the menu as the real
  offerings, the About statement in the owner's own words, a caption naming the business instead of repeating
  the hero subheading, and a fallback FAQ built from the business (what it offers and where, how to take the
  next step the way this kind of business converts) instead of a category tagline and "Is support included?".
* `lib/premium/section-voice.js`: the testimonial wording (per archetype, with care businesses given their own)
  and the care-business process, shared so the export says what the preview did (the export used to show three
  generic quotes on every site). Illustrative quotes are never attributed to a "Verified customer".
* Galleries never pad a real image with an empty placeholder tile; a photo-less gallery that would only repeat
  the offerings already listed on the page steps aside; an about/image section with no real image renders its
  text-only form in both renderers; the quote form under services gets its own heading.
* Fixes found on the way: archetype keywords were substring-matched ("landscaping" contains "api", so every
  deterministic landscaper was planned as SaaS; "barber" matched "bar"); a physio clinic was "General Business".

## Verifying

`npm test` (test/hero-direction.test.js) and the mocked visual review:

    ELECTRON_PATH=<electron.exe> node test/review/review-sites.js <outDir> [--premium] [ids...]

which runs the real server with every paid provider mocked, generates each business through the real page,
captures preview + export at desktop and mobile, and measures the hero's pixel change over 5 seconds with and
without `prefers-reduced-motion`.
