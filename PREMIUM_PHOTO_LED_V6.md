# PREMIUM_PHOTO_LED_V6 — photography by default, editorial layouts, specific content

Branch `premium-quality-v6` (on top of V5 `5749b22`; V4 `de800b6` is below it). Checkpoint tag `v-premium-generation-v6-pre-photo-led` = `5749b22`.
Rollback switch: `PREMIUM_PHOTO_LED_V6=false` (all V6 behaviour off; V1–V5 unchanged). V6 is ON whenever `PREMIUM_GENERATION_V1` is on. **Not pushed.**

## What changed (exactly)

### 1. Image policy — photography is the default for photo-led businesses
* New family `wellness` (yoga, pilates, recovery, mobility, massage, physio, acupuncture, breathwork, meditation, sauna, spa, salons/barbers/nails/lashes…). "Scheduling software for physiotherapy clinics" stays SaaS (`excludeIf`).
* `lib/premium/editorial.js` → `isPhotoLed()`: wellness, retail, hospitality, local service, appointments, creative, nonprofit, and consultants with personal-brand wording ("I help…", coach, independent). Interface-led (tech/SaaS) is never photo-led and keeps deterministic UI/diagram visuals.
* **Shot lists** per business type with the minimum sets you specified (wellness: hero, movement/yoga, recovery/treatment, studio interior, atmosphere + group + detail; retail: hero, 2 product/lifestyle, brand/environment; hospitality: hero, interior, offering, atmosphere, kitchen). Each shot is a specific photograph brief (no faces, no text, no UI). The brief becomes the subject of that slot's image prompt (before, all gallery tiles reused one generic subject).
* `allocateImages`: for photo-led profiles galleries/features are always eligible for generation (previously blocked for many archetypes), up to 10 "normal-priority" primary images (was 4); starter graphics are only the fallback.
* Personal-brand consultants get a photo profile (`consultancy_personal`) instead of diagrams.

### 2. Image failure handling
* Server-side bounded retries default raised 1 → 2 (`PREMIUM_IMAGE_MAX_AUTO_RETRIES`).
* After the review, any generated photo slot that failed (`status: error`/unresolved) on a photo-led site is retried up to 3 slots (simplified prompt, budget-governed, recorded in the ledger). A slot already retried is never paid a third time by the V1 repair; it falls back to its starter visual.
* If a photo-led site still has fewer generated photos than its minimum, or ≥half of its visual slots are starter art, the acceptance gate reports blockers (`photo_set_incomplete`, `photo_led_mostly_starter_art`) — it is not silently accepted.

### 3. Layout — `editorialFeature` section + editorial page plan
* New section type `editorialFeature` (variants `image-left`, `image-right`, `full` full-bleed image with overlay copy, `quote` editorial statement), one image slot per section (`<sectionId>::feature`), rendered by ONE shared function for the live preview and the export (`lib/site-render.js`), replaceable by uploads like any slot.
* `planLayout()` reshapes a fresh photo-led site: Home = approach statement → offerings → image-left → image-right → full-bleed → philosophy → first visit → FAQ → CTA (wellness); other photo-led families keep the planner's sections and get alternating photographic features between them. Secondary pages get 2 features plus offerings/process/FAQ; existing section ids are kept (uploads, edits), and re-planning is idempotent (regression test: no new image slots on a second pass).
* Typography: large editorial statement/quote styles, larger FAQ and first-visit steps, feature headline scale; hero headlines now display-sized on every hero layout (V5) and full-bleed heroes are legible over any image.

### 4. Copy — hard block on leaked / filler text + specific content
* `looksLikeInstruction()`: imperative planner verbs without a first/second-person voice ("Explain each…", "Convey the…", "Remove friction…", "Establish who…") and a filler blocklist ("A regular part of the … on offer", "Real X, presented clearly", "Reach out and we'll walk through…", "Is support included?…", "A considered seasonal selection", …).
* Enforced in four places: (a) the semantic check now flags/clears any such string in hero/page/section copy; (b) `renderPageHeader` (preview AND export) never prints a page purpose that looks like an instruction (falls back to the hero sub); (c) service cards, FAQ, process, menu groups on premium sites no longer render the template filler; (d) `planLayout` overwrites page purposes with real one-line intros.
* **Wellness content pack** (only the customer's own words + neutral definitions of modalities they name — no prices, schedules, teachers, credentials, outcomes): offerings such as "Yoga classes" / "Recovery sessions" / "Guided sessions" (also Pilates, restorative yoga, flow, mobility, massage, breathwork, meditation, sauna, cold plunge… when named), first-visit flow, philosophy, a 4-question FAQ that reads like a real studio, page names "Classes & Recovery" and "The Studio" (only replacing generic template labels), CTA "Begin with a class in <place>" / "Book a class". Cards no longer show the trades icons (wrench / hard hat / truck).
* Other photo-led families use neutral photograph captions ("Up close — a closer look at the products…") that describe the picture and make no claim.

### 4b. Quality gates (repair or report)
`checkPhotoLed` (server review + acceptance gate): photo set incomplete; mostly starter art; hero without a visual anchor; ≥3 card-grid sections on a page; sparse pages (home <6, secondary <3); FAQ still on the template questions; instruction/filler text visible. Sparse page / generic FAQ / incomplete set trigger the deterministic layout repair (`plan_photo_layout`).

### 5. Budget behaviour (raised, still capped)
TARGET first draft $1.00→**$1.50**, publishable $2.00→**$3.00**, soft $2.50→**$3.50** (first-draft image budget = soft − $0.50…$0.75 reserve; hard ceiling unchanged **$5.00**). The old figures made the server refuse later photos ("per-generation image budget already reached") on photo-led sites — visible in the first V6 fixture run (consultant: 4 of 9 photos rendered). Tech/SaaS is unchanged ($0.02, no image calls).

## Evidence (mock providers, real client + server; images are synthetic blocks)
| fixture | pages (sections) | planned/rendered photos | est. cost |
|---|---|---|---|
| wellness (target case) | 10/6/6/2 | 8/8 | $2.16 |
| skincare | 8/5/4/2 | 11/11 | $2.74 |
| restaurant | 10/5/4/2 | 11/11 | $2.74 |
| roofing / renovation / cleaning | 7–9/5/5/3 | 11/11 | $2.60 |
| photographer | 9/3/2/4/2 | 11/11 | $2.60 |
| consultant (personal brand) | 8/5/4/3 | 9/9 | $2.30 |
| nonprofit | 8/5/2 | 7/7 | $2.36 |
| tech-ai / saas | 6/4/4/3 | 0 | $0.02 |
No dotted/empty/“Generating…” panels, no builder/filler text on any page, hero headline 56–62px, no horizontal overflow at 768/390/360, acceptance gate passes on all 11. V5 comparison (mock): photo-led sites cost ~$1.3–1.7 → now ~$2.2–2.7, in exchange for 7–11 real photographs instead of 3–6 photos plus starter art. **Costs are estimates from mock usage, not billing** (planner cost excluded).

## What is NOT proven / needs your eyes
* **Real photography quality.** No API keys here. Whether the 8 wellness prompts produce a premium-looking set (consistent light, no faces, right mood, no artefacts), and whether the hero/features look good over real images (scrim, crops at 4:5, focal points), is unverified. Prompts are hand-written shot briefs, untested against gpt-image-1.
* The wellness pack copy is deliberately safe and plain; it is not brand-voice writing. With the live planner, its own headlines/bodies for Home/Classes/Studio are kept where they pass the filler check, but the pack overwrites the offerings/FAQ/process/CTA sections.
* Restaurants: the "Menu" section still lists template group names (no menu is supplied); its filler sentences are hidden, but a real menu needs the customer's content.
* Real cost per site depends on real token/image pricing and how many extra slots the planner adds; the hard ceiling and per-slot governor still apply.
* Screenshots use mock images — they show layout, typography and pacing only: `C:\Users\jayde\Documents\siteremade-quality-v6-shots\` (desktop/tablet/mobile + secondary pages).
