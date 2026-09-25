# PREMIUM_GROUNDING_V3 — business grounding + whole-site critique

Status: **built, tested offline and through the real client + server with mock providers. Sub-flag OFF by default.**
Enable (staging first): `PREMIUM_GENERATION_V1=true` **and** `PREMIUM_GROUNDING_V3=true` (V2 composition is independent). The flag is ignored unless V1 is on.
Checkpoint (local tag): `v-premium-generation-v3-pre-grounding` = origin/main `a0dfcb4`. Branch `premium-grounding-v3`. Roll back = unset the env var.

## 1. Root causes found in the live skincare/retail generation (traced in code)
| Symptom | Cause |
|---|---|
| Restaurant words (Menu, Reserve, guest, plate) | `scoreKeywords` matched by prefix; `inferArchetype` used substring `includes`; category CTA tables contained hospitality/retail phrases |
| "Verified customer" testimonials | hard-coded fake testimonial pools in `ARCHETYPE_SECTION_VOCAB` |
| Starter / Growth / Enterprise on a store | hard-coded SaaS tiers in `renderPricingSection` |
| Fashion imagery for skincare | image subjects were per-category, not per-business |
| "Remove friction…", "Establish who is behind…" on the site | `renderPageHeader` prints the planner's internal `page.purpose` |
| Thin About/Contact, empty Team media | recipes with one section; team section without any team data |

## 2. What V3 adds
* **ONE shared `BUSINESS_GROUNDING`** (`lib/premium/grounding.js`, pure, no model): family, sub-type (e.g. skincare), primary offer, sales model, location, primary CTA, pricing model, allowed page intents, **forbidden sections/words**, CTA allow/forbid, verified facts vs unsupported facts, testimonial/team availability, imagery subjects and things to avoid. Derived from the customer's own words by strict whole-word matching. Server, browser and Workplace updater share it (bundled into `premium-core.js`).
* **Deterministic guard** (`lib/premium/semantic.js`, free, runs client-side *before the image plan is finalised*, so off-category sections never cost image money): removes invented testimonials, tier pricing, a "Pricing" page with no pricing, team without team data, sections from another kind of business; replaces builder-instruction copy and cross-family CTAs; enriches thin About/Contact pages with grounded sections only; sets a conflicting archetype back.
* **ONE whole-site critique** (strong model, `report_semantic_defects`, ≤8 defects) over all pages with 10 categories: BUSINESS_CONSISTENCY, CROSS_PAGE_CONSISTENCY, FACTUAL_GROUNDING, CTA_CONSISTENCY, IMAGE_SUBJECT_RELEVANCE, SECONDARY_PAGE_DEPTH, COPY_SPECIFICITY, INVENTED_TRUST_SIGNALS, WRONG_BUSINESS_CONCEPTS, PAGE_PURPOSE_CLARITY (PASS / NEEDS_REPAIR / FAIL; NOT_APPLICABLE when off).
* **ONE small repair pass**: at most 5 of the critic's findings that carry a concrete fix. Every fix text is validated (no builder wording, no wrong-business words, no invented proof, button labels must fit this business) before it is applied. Nothing is regenerated.
* **Image subject grounding**: prompts use the sub-vertical subject ("skincare bottles, jars and tubes…") and an "avoid" list; `validateImagePromptSubject` checks a prompt before money is spent.
* **Budget**: `SEMANTIC_REVIEW_TARGET_USD` 0.10, `SEMANTIC_REPAIR_TARGET_USD` 0.10, `SEMANTIC_REVIEW_HARD_CEILING_USD` 0.30, enforced through the existing governor (`subBudget`) inside the existing overall hard budget. Repairs ride on the critic output, so repair spend ≈ $0.
* **Metrics**: `SEMANTIC_REPAIR_RATE`, `AVERAGE_SEMANTIC_DEFECTS`, `SEMANTIC_DEFECTS_BY_KIND`, `AVERAGE_SEMANTIC_COST_USD`; the generation log carries `semantic`.
* Persisted footprint: two flat short strings under `design.premium` (`g`, `gr`). No grounding object is stored.

## 3. Live path (verified, mock providers)
`POST /api/plan-website` → client `buildGenerationPlan` → **`groundProject` (imagery step)** → image plan → image requests → `premiumPreReveal` → **`/api/premium/review-repair`** (deterministic guard → one `semanticCritic` call → ≤5 fixes → V1/V2 review/repair) → patch applied → reveal.
The harness (`premium-fixtures/run-fixtures.js`, mode `v3`) runs the real client in a browser engine against the real server; only OpenAI/Anthropic are mocked. It found one real integration bug (the "avoid" list tripped the interface-word lint and made the server refuse every image) — fixed and covered.

## 4. Evidence (9 fixtures incl. new **skincare**, V2 vs V3)
Raw pattern hits for restaurant-only words, fake proof, SaaS tiers and builder wording in the final customer-visible text: **V2 = 30, V3 = 3** (all 3 are legitimate "menu" on the restaurant fixture; the scanner is naive for hospitality). Skincare: fake testimonials, pricing tiers, Menu/Reserve and builder wording all gone; hero prompts now depict skincare products. A mock critic proposing the retail button "Shop the range" was accepted on the store and **rejected** on roofing, SaaS and restaurant sites.
Cost (estimated, mock token usage): **+$0.011 per site** (critic call), e.g. skincare $1.567 → $1.579. No extra image calls.

## 5. NOT proven
* Real critic quality and real model behaviour (mocked). The critique/fix prompts are untested against the live model.
* Images are synthetic; no photography judgement.
* The deterministic engine's own hero copy remains generic ("Products, made to be noticed."); with the live planner the copy is model-written, but a V3 pass on the live planner output has not been observed.
* Grounding is keyword/rule based; unusual businesses fall back to family `other` with light rules.
* Cost numbers are simulations, not billing.

## 6. Rollout
Keep OFF. Staging: `PREMIUM_GENERATION_V1=true PREMIUM_GROUNDING_V3=true` (+ V2 if desired), generate the skincare, restaurant and SaaS prompts with real keys, read `/api/admin/premium-metrics` semantic aggregates, then a small share of production.
