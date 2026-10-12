# SiteRemade Realism Engine

A universal layer that sits beside the three generators and makes what a site states, shows and animates traceable to
the business. It never replaces a generator, a renderer or a motion system; it gives them one shared description of the
business, a confidence class for every fact, and checks at the points where business data becomes a page.

## 1. Audit (2026-10-12)

### The generators

| | Business (landing generator) | Creative (studio, every builder URL) | Designs (premium design packages, `/designs`) |
|---|---|---|---|
| Entry | `POST /api/plan-website` -> `script.js` `buildGenerationPlan` | `/api/creative/research` -> `/api/creative/plan` | `POST /api/designs/sites` |
| Planner / writer | Anthropic planner tool (`WEBSITE_PLAN_TOOL`), else the deterministic engine; `lib/premium/strategy.js`, `hero-storyboard.js`, `hero-copy.js`, `offering-copy.js` | `lib/creative/ai.js` understand -> direct (v2 scene plan); built-in `director2.js` fallback | `design-packages/prompt.js` writer -> `lib/design-sites.js` loop |
| Design system | `lib/premium/composition.js`, `visual-engine.js` (8 hero families), `design-tokens.js`, `STYLE-SYSTEM-V3` | `art.js` recipes, `archetypes.js` (32), `look.js` | hand-built packages (`design-packages/design/*`) with the shared engine |
| Imagery | `image-planning.js` -> OpenAI `gpt-image-1(-mini)` text-to-image per slot; `visual-subjects.js` FACETS; drawn `hero-art-*` | real pictures only: SerpApi Google Images + owner uploads, `asset-director.js`; Higgsfield clips and Tripo / lathe 3D from a picture | code-rendered (SVG, canvas, WebGL) inside each design |
| Motion | `motion-engine.js` (section motion) | `render2.js` timeline, `kinetic.js`, `spatial-runtime.js` | each design's own runtime |
| Validation | `semantic.js` deterministic guard + one critic; `quality-review.js`, `repair.js` | `validate2.js`, claim check (`ai.verifyClaims`), visual director | `engine.validate` + hooks + `factsCheck` |
| Business facts | `grounding.js` `BUSINESS_GROUNDING`: verified facts vs a list of unsupported kinds | copy kinds: sourced / supplied / imagined | brief fields; writer `_assumed`, `_decisions`; pinned names |

### Where business data becomes content
- Business: the planner turns the description into pages and copy; `grounding.js` decides what may be said; `semantic.js` strips invented testimonials, tiers, wrong-business sections; image prompts come from `visual-subjects.js`.
- Creative: facts come from Wikipedia (sourced) and the owner (supplied); the director's words are claim-checked against them; numbers must come from facts.
- Designs: the writer fills the design's content shape from the brief; the checker enforces the design's rules; facts not in the brief are listed for review.

### Where details are invented or consistency is lost
1. **Three provenance systems, none shared.** "Verified / unsupported" (Business), "sourced / supplied / imagined" (Creative), "in the brief / assumed / decided" (Designs). None separates a *derived* fact (42 h / 30 turns = 1.4 h a turn) from a *proposed* one (a lead time the writer chose), and none knows whether the business is real or a concept.
2. **Proposed facts become commitments silently.** A Designs site for a real business can be published with writer-chosen prices, lead times or guarantees: they are listed for review but nothing stops publishing them as fact.
3. **No industry model.** Grounding has families and sub-verticals for vocabulary and imagery, but nothing describes what a watchmaker, a barber or a roofer must state (prices, lead times, booking process, service area) or which claims are material for that industry.
4. **Product identity across generated images.** Business image slots are independent text-to-image prompts tied together by a "shared look" sentence. A product's geometry, finish or markings can change between the hero, a card and a close-up. (Creative uses real pictures and image-to-video / image-to-3D from them; Designs draw one object from one set of variables, so both keep identity by construction.)
5. **Representations the design cannot draw.** A design shows what its drawing can show. Aldane draws a strap; a brand that sells a metal bracelet got a strap in the bracelet's colour.
6. **Demos not tied to facts.** An animation demonstrates something (a winding demo, a booking calendar, a before/after). Until today's Aldane change, nothing linked the demo to the fact it depicts.

### What already works (reused, not rebuilt)
- Service realism in Business imagery: `visual-subjects.js` FACETS already distinguish patio / retaining wall / mowing, shingles / metal roof, skincare containers, etc., with code-drawn fallbacks.
- Creative honesty: claim check, sourced numbers, picture permission and identity checks, asset director.
- Designs: brief-first writer, decisions, assumption list, single round of essential questions.

## 2. Architecture

`lib/reality/` -- pure CommonJS, no I/O, no model calls (bundle-safe like `lib/premium/*`).

- **`model.js` -- the Business Reality Model.** A common foundation (identity, offerings, operations) plus an industry module's own fields. Every fact is `{ value, status, source, from?, confirmedBy? }`:
  - `confirmed` -- supplied by the owner or a trusted source (research);
  - `derived` -- calculated from confirmed facts (records `from`);
  - `proposed` -- a reasonable suggestion; must be confirmed before it is presented as a commitment;
  - `illustrative` -- invented for a clearly identified concept/demo business.
  A fact only becomes `confirmed` through `confirm()` with who confirmed it; `checkTransition(before, after)` reports any silent promotion.
- **`industries.js` -- industry modules** on the common base: product maker (watch, furniture, skincare, apparel, automotive), appointments (barber, salon, clinic, dental), fitness classes, hospitality (restaurant, cafe, hotel), software, trades (roofing, concrete, landscaping...), professional services, retail store, creative studio, nonprofit, other. Each declares its offerings/operations fields, its material claim kinds, derivations, what imagery must and must not show, and which demos are honest with which facts. Industry detection reuses `grounding.js` (`detectSubvertical`, whole-word matching).
- **`extract.js`** -- confirmed facts from the owner's words (prices with currency, durations, capacities, hours, contact details, specifications), and material claims found in generated text (prices, certifications, reviews and ratings, customer counts, guarantees and warranties, legal policies, awards, founding years, addresses, specifications).
- **`claims.js`** -- audits a page's content against the model: each claim gets a status and whether it is material; a publish check says what may not go live as-is (real business: material claims that are proposed or unsupported; concept: no visible demonstration notice).

### Integration (phase 1)
- **Designs:** the brief says whether the business is real or a concept. The model is built from the brief, given to the writer (confirmed facts and what it may only propose), stored with the content, and every reviewed item carries its status. Publishing a real business with unconfirmed material claims needs the owner to confirm them (recorded, never silent); a concept site must say it is a demonstration. Representation and demo checks per design (Aldane: bracelet drawn as links; the winding demo bound to the reserve).
- **Business and Creative:** adapters that read their existing records into the same model (`fromGrounding`, `fromCreative`) so every page can report its facts in one vocabulary. They change nothing those generators emit.

### Phase 1 as built (2026-10-12)
- `lib/reality/` (model, industries, extract, index). 11 industry modules plus `other`; each with its own offerings and operations, material claims, consistency rules, imagery must/avoid, demos bound to facts, derivations (a 42 h reserve from 30 turns -> 1.4 h a turn; 4 Hz -> 28,800 vph; price ranges).
- Designs: the brief asks "Is this a real business?" (unanswered = real). The writer gets a THIS BUSINESS section (real or concept, material claims, consistency rules, established facts). Built pages are audited; each reviewed item says confirmed / derived / proposed / illustrative and whether it is material. A real business cannot publish unconfirmed material claims until the owner confirms them (409 with the list; `confirm: true` records each claim with who and when, keyed by field and exact text, so a changed claim needs confirming again). A concept page that does not say it is a demonstration is sent back to the writer. The review page shows the summary, the status of each item and the confirm step, each claim with its label or sentence.
- Aldane: a strap option with `kind: "bracelet"` is drawn as metal links in the case metal (or its own `colour`), its swatch brushed metal, the summary reads "steel bracelet". The default page still rebuilds the original byte for byte.
- `factsIn` in `lib/design-sites.js` is now the shared `lib/reality/extract.numbersIn`.
- Tests: `test/reality.test.js` (model, industries, extraction, audit, publish check, adapters), `test/design-sites-reality.test.js` (routes end to end, concept retry, publish gate, bracelet).

### Later phases (proposed, not built)
- **Product identity for generated images (Business):** one reference render per product, then the other slots as edits of it (`gpt-image-1` image edits with the reference) instead of independent prompts. Costs about one extra premium image per site; needs a measured trial with the owner's go-ahead (paid).
- **Software realism:** interface mock-ups built from a structured UI spec (screens, navigation, data series with real relationships) shared by the hero, feature cards and walkthrough, rendered in code.
- **Demo binding across generators:** every animated demo declares the facts it depicts; the claims audit treats it like text.
- **Planner exposure:** the model's confirmed facts and material-claim rules in the Business planner prompt and the Creative director, replacing their separate rule lists over time.

## 3. Rules the engine enforces
- Never turn proposed or illustrative facts into confirmed facts without an owner's confirmation.
- Real businesses: no invented prices, certifications, reviews, customer counts, guarantees, legal policies, addresses or specifications.
- Concept businesses: invented details allowed, internally consistent, and the site identifies itself as a demonstration.
- If a visual cannot represent something exactly, use a representation it can draw honestly, or record that it differs.
