# PREMIUM_GENERATION_V1 — quality-first generation with hard cost control

Status: **built, tested offline, flag OFF by default.** Nothing here has been run against real OpenAI/Anthropic
(no API keys were available), so real image quality and real cost are **unmeasured**. See "What is and is not proven".

Checkpoint: tag `v-premium-generation-pre-v1` (= origin/main `7bbbda4`). Branch: `premium-generation-v1`.

## 1. Pipeline as found (real code, not guessed)

```
description ──► POST /api/plan-website (server.js) ──► ONE Claude call (ANTHROPIC_MODEL, default claude-sonnet-5,
   thinking off, max_tokens 8192, system+tool schema prompt-cached, 35 s timeout, no retry) returns a structured plan
   (strategy, creativeDirection, pages/sections, visualDirection, imagePlan hints)
        └ any failure → the client's DETERMINISTIC engine (script.js, ~10k lines) plans the site instead
plan ──► script.js (browser): buildGenerationPlan → composeSections → renderers (script.js; hand-ported copies in
         lib/site-render.js [export] and lib/apply-refinement-plan.js [Workplace updater])
images ► script.js buildImagePlan → per-slot POST /api/generate-image → OpenAI images API (gpt-image-1-mini / gpt-image-1)
critic ► script.js runQualityCritic: deterministic structural checks, free variant nudges only, no model
edits ─► /api/refine-website (Claude, max_tokens 2500) or local deterministic classifier; Workplace uses
         /api/app-bridge/website/:id/edits (server-side, same image path)
```

AI calls: (1) planner, (2) refine, (3) image generation. Nothing else. No retry on any of them. Credits: flat per action
(base generation 2, image 1/2 by model); `recordOperation` keeps an in-memory tokens/count ledger (no USD).

### Where the system deliberately trades quality for cost (found in code)
| Shortcut | Where | Effect |
|---|---|---|
| Image budget **$0.10 per site** (`SITEREMADE_IMAGE_BUDGET_USD`) | server.js | one premium image ($0.45–0.63) can never fit |
| Client ceiling = archetype units × **$0.015** (local-conversion = 1 unit) | script.js `imageSpendCeilingUsd` | a roofer is funded one mini-model image |
| Hero routed to `gpt-image-1-mini` **low** in practice | `planAffordableImages` | measured: every legacy fixture hero was mini/low or mini/medium |
| Every non-hero image requested **square (1:1)**, 4:3 mapped to 1024², cropped by CSS | server provider `size`, apply-refinement-plan | wrong ratio, generic centre crop |
| Prompt = "`<style word>` for a `<category>` brand … no text" | script.js `buildImagePrompt` | no subject, no composition, no negative space, nothing stopping UI-looking output |
| Planner told "Minimal visual budget: … only consider a single generated image" when credits are low | server.js `VISUAL_BUDGET_PROMPT_HINTS` | economics leaks into the creative plan |
| No image evaluation, no retry, no repair pass, no whole-site critique by a model | — | a bad first output ships or the customer regenerates |
| **Exports never render generated images** (renderer has no generated branch; `imagePlan` is stripped on save) | lib/site-render.js, lib/project-store.js | purchased sites lose generated imagery (fixed here) |
| Deterministic engine emits **invented testimonials** ("A room worth returning to — Regular guest") | script.js | fabricated social proof (now detected and removed) |

## 2. What was built (all in `lib/premium/`, one shared core)

The core is plain CommonJS with injected providers. `scripts/build-premium-core.js` bundles it to `premium-core.js`
for the browser, so **server, browser and the Workplace updater run identical logic** (`--check` fails CI if stale).

| Module | Purpose |
|---|---|
| `config.js` | `PREMIUM_GENERATION_V1` flag, budgets `TARGET_FIRST_DRAFT_USD 1.5 / TARGET_PUBLISHABLE_SITE_USD 3 / SOFT_SITE_BUDGET_USD 4 / HARD_SITE_BUDGET_USD 5`, repair reserve, image tier caps, model tiers, price tables (all env-overridable) |
| `cost-ledger.js` | per-operation record: generation id, phase, provider, model, operation, in/out/cache tokens, text $, image count/quality/size, image $, retryCount, cumulative $; `totals()` → FIRST_DRAFT_COST / REPAIR_COST / TOTAL_SITE_COST |
| `budget-governor.js` | the ONE place a spend decision is made: phase ceilings, repair reserve, optional work stops at the first-draft target, cheaper fallbacks, hard stop → `BUDGET_LIMIT_REACHED` (not an error) |
| `model-routing.js` | strong model only for positioning/art direction/architecture/hierarchy/image roles/critique/hard repair; cheap for extraction/classification/basic rewrites; none for normalisation/metadata/formatting/render decisions |
| `strategy.js` | one strategy object (business type, customer, offer, differentiator [never invented], trust requirements, conversion goal, personality, typography, hierarchy, layout pattern per archetype) |
| `art-direction.js` | one art direction for the site, decided before any image (style, lighting, colour mood from palette, subject treatment, composition, human presence, realism, contrast, consistency rules incl. no-text / no-UI) |
| `image-planning.js` | role per slot, source priority (supplied → generated photo → abstract → none), composition-aware prompts, ratio-correct provider sizes, focal points, tier route ladders, deterministic image evaluation, one-retry policy, prompt lint against UI-mockup output |
| `design-tokens.js` | one token system per site: type pairing (system stacks), scale in container units, line length, spacing rhythm, radius, content width; sanitised on the way back in |
| `section-state.js` | good / needs_repair / regenerated / locked; full-site regeneration must be explicit and opens a new generation with its own budget |
| `quality-review.js` | 8-category rubric (PASS / NEEDS_REPAIR / FAIL / UNVERIFIED) with checkable defects; optional one-call strong-model critique with concrete criteria |
| `repair.js` | top ≤3 defects, flagged targets only, free repairs applied on a clone, paid repairs executed via injected providers, expressible as a normal refinement plan |
| `mobile-check.js` | real-DOM phone-width validation (390 and 360) inside the same `.builder-device.mobile` frame the customer sees |
| `metrics.js` | generation log + FIRST_OUTPUT_ACCEPTANCE_RATE, AVERAGE_GENERATIONS_BEFORE_ACCEPTANCE, IMAGE_RETRY_RATE, AVERAGE_FIRST_DRAFT_COST, AVERAGE_PUBLISHABLE_SITE_COST, COST_AS_PERCENT_OF_REVENUE |

### Integration (all behind the flag unless stated)
* **Always on (flag-independent):** the USD ledger. `recordOperation` is the single funnel for every provider call and now feeds it.
  Admin only (`x-admin-token`): `GET /api/admin/premium-ledger[?generationId=]`, `GET /api/admin/premium-metrics`. Files: `data/premium/*.jsonl` (gitignored).
* **Flag on:** `/api/image-provider-status` exposes `premium:{enabled,cfg}`; the client planner (`buildImagePlan`) uses the shared allocator;
  `/api/generate-image` takes the premium path (governor-gated, guarded prompt, ratio-correct size, deterministic evaluation, ≤1 retry with a different prompt, poor result never charged to the customer);
  after the first render the client measures phone widths and calls `POST /api/premium/review-repair` (one review + ≤1 repair round, platform-paid, no customer credits);
  tokens are stored slim in `design.premiumTokens` and applied by preview **and** export; focal points ride on each image (`assets.*.focal`).
* **Workplace updater:** its image regeneration now uses the same premium image path (route/ratio/tier from the stored plan, own generation session per edit, `deferSettlement` preserved) and the same ledger.
* **Fixes that also apply with the flag off:** export renders generated images (it never did); the 600-char prompt clamp is 1200; focal `object-position` is honoured when present.
* Feature flag `PREMIUM_GENERATION_V1=true` enables it. Default off → legacy behaviour.

## 3. Evidence

Reproduce: `env -u ELECTRON_RUN_AS_NODE <electron> premium-fixtures/run-fixtures.js --user-data-dir=<tmp>` (`FIX_MODES`, `FIX_IDS`, `MOCK_BLANK_ONCE=hero`).
It starts a fresh server per run, signs up a real account and drives the REAL client generation in a real browser engine.
Only the two external providers are test doubles (`premium-fixtures/mock-providers.js`).

### What is and is not proven
* **Proven:** wiring end to end (planner → allocation → prompts → ratio → server governor → ledger → evaluation → retry → fallback → review → repair → render), budget behaviour, prompt lint, focal storage, tokens in preview, real phone-width layout measurements, deterministic rubric, fabricated-testimonial removal.
* **NOT proven:** real image quality (mock images are procedural gradients with a block where the prompt says the subject goes), real model cost (image $ come from the price table; token counts are mock estimates), real planner output (refused by the mock so the deterministic engine planned every site, exactly as with no Anthropic key), real latency (mocks return instantly), whether the customer likes the output.
* Screenshots: `C:\Users\jayde\Documents\siteremade-premium-fixtures\shots\` (desktop 1300px and phone 416px frame, legacy vs premium, 7 fixtures).

### Results (7 fixtures × legacy vs premium; `premium-fixtures/results/`)
`MOCK_BLANK_ONCE=hero` makes the first hero image blank in every premium run, to exercise the retry policy — so the 30% retry rate below is an injected fault, not an observed rate.

| fixture | mode | est. cost $ | images (attempts) | hero route | mobile overflow | hero lines @390 |
|---|---|---|---|---|---|---|
| roofing | legacy | 0.0084 | 1 (1) | mini/low | no | 3 |
| roofing | premium | 1.2665 | 2 (2) | gpt-image-1/high | no | 2 |
| consultant | legacy | 0.0144 | 2 (2) | mini/low | no | 3 |
| consultant | premium | 1.4162 | 3 (3) | gpt-image-1/high | no | 2 |
| restaurant | legacy | 0.0294 | 2 (2) | mini/medium | no | 3 |
| restaurant | premium | 2.1966 | 7 (7) | gpt-image-1/high | no | 3 |
| photographer | legacy | 0.042 | 1 (1) | mini/high | no | 3 |
| photographer | premium | 1.2664 | 2 (2) | gpt-image-1/high | no | 2 |
| saas | legacy | 0.042 | 2 (2) | (no hero image) | no | 2 |
| saas | premium | 0.4265 | 2 (2) | (no hero image; abstract product graphics) | no | 2 |
| renovation | legacy | 0.0084 | 1 (1) | mini/low | no | 2 |
| renovation | premium | 1.2665 | 2 (2) | gpt-image-1/high | no | 3 |
| cleaning | legacy | 0.0084 | 1 (1) | mini/low | no | 4 |
| cleaning | premium | 1.2665 | 2 (2) | gpt-image-1/high | no | 2 |

Averages: legacy **$0.022**/site, 1.4 images; premium **$1.30**/site, 2.9 images (of which one is the injected-fault retry).
Cost is in the briefed range ($1.50 first draft / $3 publishable) — but ~60× the legacy image spend, which is the point of this pass and the number to sanity-check against real invoices before flipping the flag.
Excluded from both: the planner call (~$0.05–0.10 at default price estimates) since the mock refuses it.

Timing: end-to-end wall time is ~5.6 s in both modes and is dominated by the client's staged-reveal pacing. Premium-specific overhead measured in the browser (phone-width measurement + review + repair round trip, mock providers): **13–36 ms**. Real provider latency (a premium hero image is typically several seconds; a retry doubles it) is **not measured**.

## 4. Known remaining issues
* Image quality is unverified against real models; prompts are specific but only a real run can show whether "AI look" improves. Run the fixtures with real keys and review before any rollout.
* Section-level "good/locked" state is applied inside a review/repair session only; it is not persisted across reloads (the save whitelist strips unknown fields) and there is no "Keep this" UI yet.
* Full "regenerate hero / image / section / style" entry points exist as a planning function (`planRegeneration`) but the existing editor buttons were not rewired to it.
* The planner prompt still receives the legacy "visual budget" hints when credits are low.
* Team tiles and project galleries are left to the designed treatment (no invented staff/projects); sites without real media look image-light by design.
* Exported-site phone rendering was not separately measured (measurement is of the in-app mobile preview frame).
* `express.static(__dirname)` serves the whole repo root (source files, `data/`); this is pre-existing and worth a separate look.
* The Workplace updater's premium path is exercised by shared code but was not run through the live bridge route.

## 5. Recommendation
**Do not make premium the default yet.** Ship with the flag off, run `run-fixtures.js` with real keys against a staging deploy, review the screenshots, compare invoices to the ledger, then enable for a small share of generations and watch `/api/admin/premium-metrics` (acceptance, retry rate, cost per accepted site).
