# PREMIUM_QUALITY_V5 — first-draft quality pass (quality first, cost second)

Branch `premium-quality-v5` (includes V4 `de800b6`). Checkpoint tag `v-premium-generation-v5-pre-quality-pass` = `de800b6`.
**Not pushed. Real-provider quality NOT measured (no API keys on this machine) — see §6.**

## 1. Where quality was actually being lost (found by tracing the live path, not the modules)
1. **Hero headlines rendered at the browser-default h3 (18.7px)** on every hero layout except `site-copy`/`stacked` (asymmetric-offset, full-bleed, collage, editorial-rail, minimal). The V1 token CSS only sized `.site-copy` and `.hero-stacked-copy`. Measured in the real DOM: 18.72px on restaurant/skincare/nonprofit heroes. → all hero layouts now use the display scale (56–62px in fixtures).
2. **Full-bleed hero text was theme-dark over a dark scrim** (unreadable over any photo). → white text + stronger left scrim.
3. **Empty visuals**: `designed` image-plan entries rendered dotted/dashed CSS placeholders (V4 fixed with starter visuals).
4. **Secondary pages were 1–3 sections** (Contact = 1) because enrichment only handled About/Contact when a page had ≤1 section and never added depth. → grounded recipes per page role (About: about+process+CTA, Contact: contact(+process for quote businesses), catalog pages ≥3 sections).
5. **Heroes not tied to the industry**: e.g. a renovation contractor got a browser-frame hero. → industry hero families (`chooseHero`, `hero_family_mismatch`).
6. **Builder-status text on the customer site** ("View product — not connected yet"). → not rendered on premium sites.
7. **Integration bug found by the live-path fixtures:** sections added by the review (secondary-page depth) created image slots that were never resolved, so the client's own quality gate (`imagePlanIsTerminal`) refused to admit the site (generation appeared to hang). → new slots are resolved as first-draft work; unresolved slots fall back to their starter visual instead of blocking the reveal.
8. Artificial cheapness (see §2).

## 2. Cheapness restrictions removed / raised
| was | now |
|---|---|
| TARGET_FIRST_DRAFT $1.50 / publishable $3 / soft $4 | **$1.00 / $2.00 / $2.50** (hard ceiling unchanged $5.00) — per the brief |
| primary image cap $0.30, decorative $0.04 | **$0.45, $0.08** (hero cap $0.75 unchanged) |
| only the first 2 primary images at normal priority | **first 4** |
| generated gallery imagery only for hospitality/editorial/ecommerce | + trades (`local-conversion`), professional, nonprofit, portfolio |
| semantic critic budget $0.10 target / $0.30 ceiling, 1100 output tokens, 5 fixes, 7k chars of site | **$0.30 / $0.60, 3200 tokens (60s timeout), 8 fixes, up to 10 findings, 16k chars, hero/product image thumbnails (vision)** |
| planner 8192 tokens / 35s | **12000 tokens / 60s**, new QUALITY BAR block in the planner system prompt (page depth, per-page composition, industry-native hero, media by role, banned filler, no invented trust); `PREMIUM_MODEL_PLANNER` selects the planner model (default = strong model) |
| V2/V3/V4 sub-flags default OFF | **ON whenever `PREMIUM_GENERATION_V1` is on**; the env vars are only a rollback switch (`=false`) |
Deliberately kept: hard ceiling, repair reserve, one repair round, ledger, hero-first ordering, "no fake proof".

## 3. What was added
* **Industry hero families** per profile (retail/hospitality/trades/consultancy/portfolio/cause/tech) with deterministic fallback and a review defect (`HERO_VISUAL_STRENGTH`/`hero_family_mismatch`).
* **Layered tech hero** (`ui-stack`): dimmed back window + lifted front window carrying the product concept + floating step chips with depth (drop shadow), inside the browser frame.
* **Whole-site critic upgrade**: FIRST_IMPRESSION and GENERIC_TEMPLATE_FEEL categories, banned-filler list, image-quality criterion, up to 10 findings, 8 validated fixes. Sees the hero/product **images** (client-side JPEG thumbnails, ≤2, ≤260KB each) — no screenshot infrastructure exists in production (no headless browser), so image thumbnails are the economical vision input.
* **ONE image replacement repair**: the critic may request `regenerate_image` for hero/product/about/gallery-featured. The prompt is validated (interface-word lint, subject check, no internal wording; composition wording added), falls back to the planner's simplified prompt otherwise, is budget-governed (repair phase), ledgered, deterministically evaluated and only replaces the image when the result is not poor. Max one per site.
* **First-draft acceptance gate**: after the repair pass, severity-3 findings are "blockers"; `acceptance {accepted, blockers}` returns to the client, is stored in `design.premium.review.accepted` and in the metrics (`FIRST_DRAFT_ACCEPTANCE_RATE`).
* Tablet (820px) screenshots + 768px overflow measurement in the fixture harness; `FIX_REAL=1` mode runs the same harness against the real APIs.

## 4. Offline evidence (mock providers; images are synthetic blocks — they say nothing about photo quality)
10 fixtures through the real client + server: no empty/dotted/spinner panels except the contact-page map stand-in (restaurant), zero builder-status leaks, hero headline 56–62px everywhere, accepted by the gate 10/10, no horizontal overflow at 390/360/768. Sections per page (home/…): e.g. roofing 5/6/6/3, consultancy 5/5/4/3, skincare 5/5/4/2, tech 6/4/4/3.
Estimated cost (mock token usage, NOT billing; the planner is refused in the harness so planner cost is not included): tech/SaaS $0.02 (deterministic product UI, 0 images), consultancy $0.68, roofing/renovation/cleaning $1.28, nonprofit $1.31, photographer $1.40, restaurant $1.46, skincare $1.70. 112 unit tests pass.

## 5. Known weaknesses
* The deterministic fallback copy is still generic ("Software for product, from first input to finished result."; "Guidance, handled with expertise."). With the live planner the copy is model-written; this has not been observed.
* Tech/SaaS is still deterministic SVG for hero/product (very cheap). It is more layered now, but I have **not** compared it to a generated visual; whether it feels "expensive" needs your eyes.
* Retail/hospitality quality depends entirely on the real image model; only prompts, routing and layout were verified.
* The contact-page map stand-in is unchanged. Text-only heroes chosen deliberately (poster/minimal) for consultancies remain.
* No screenshot-based critique (only image thumbnails).

## 6. Real-provider evaluation — NOT DONE
No `ANTHROPIC_API_KEY`/`OPENAI_API_KEY` is available on this machine. To run the requested small real test (spends real money):
```
set ANTHROPIC_API_KEY=... & set OPENAI_API_KEY=...
set FIX_REAL=1 & set FIX_MODES=v4 & set FIX_IDS=tech-ai,skincare,restaurant & set FIX_OUT=C:\path\out
node_modules\electron\dist\electron.exe premium-fixtures\run-fixtures.js --user-data-dir=<fresh dir>
```
Screenshots land in `<out>\shots\<id>-v4-{desktop,tablet,mobile}.png`; the ledger JSON reports real token usage for planner/critic/image cost.
