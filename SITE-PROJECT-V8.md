# SiteRemade V8 — Claude website-planning integration

Branch: `generator-v8`, built on top of `generator-v7` at `21d8564` (V7.1).
**Not deployed.** V7/V7.1 are untouched in spirit and behavior — every V7/V7.1
regression, diversity, mobile and image-generation test still passes (see
"Testing" below). This document answers the 8 questions asked before coding,
then describes exactly what was built.

---

## Before coding: the 8 questions

### 1. How should WebsiteProject evolve to support Claude-generated multi-page projects?

`WebsiteProject` gained three additive fields — nothing existing was
renamed or restructured:

- `pages: [{ id, label, purpose, sections: [{ type, copy }] }] | null` — the
  full multi-page plan Claude returned (or `null` on the deterministic
  path). **Only `pages[0]` is rendered this pass** — see Q8 for why
  multi-page rendering itself is deferred.
- `functionalityPlan: [{ feature, status, note }] | null` — what the
  business would need the site to *do*, honestly marked
  `supportedNow | plannedIntegration | requiresCustomBuild`. Not yet
  surfaced in the UI this pass (captured for a follow-up "what this site can
  and can't do yet" panel).
- `intent.claudeImagePrompts: { hero?, product?, team?, gallery? } | null`
  and `intent.brief: { understanding, rationale } | null`.
- `meta.planSource: 'anthropic' | 'deterministic'` — which engine actually
  produced this project (for the report/metadata; not shown to the
  visitor).

Each section object in the flat, rendered `project.sections` array also
gained an optional `copy: { headline, subhead, body, ctaLabel, claims }`
field when it came from a Claude plan. `project.copy` (the hero's own
kicker/headline/sub/cta) is unchanged in shape.

Every one of these is plain JSON on the existing object, so Save/Restore
(`serializeProject`/`loadProjectFromStorage`) needed **zero changes** — it
already round-trips the whole object.

### 2. Which existing deterministic functions become fallback/normalizers vs. primary decision makers?

| Function | Deterministic path | Claude path |
|---|---|---|
| `analyzeDescription` (categoryKey detection) | primary | **still primary** — Claude never picks an arbitrary `categoryKey`; it can only reason freely inside its own `business.category` free-text field. `categoryKey` is what the fixed `categories`/`categoryBaseHue`/image-role-label tables key off, so it stays a closed, renderer-known set regardless of who planned the site. |
| `categoryDimensionDefaults` | primary source for dimensions | **fallback only** — one default per dimension, used only where Claude's `visualDirection` field for that dimension was missing or failed enum validation |
| `composeStyleFromAnalysis` / `dimensionKeywords` | primary (keyword scoring) | not used — Claude's `visualDirection` replaces this entire step |
| `composeSections` / `categorySectionRecipes` | primary (recipe selection) | not used — Claude's `pages[0].sections` replaces this entirely |
| `composePalette` | **primary either way** | same — Claude influences it only through `colorBehavior`; hue/jitter/text-contrast math is untouched (V7's "preserve the deterministic palette system" requirement) |
| `buildCopy` | primary | **normalizer/fallback** — always computed first so every hero-copy field has a safe value, then Claude's `heroCopy` overwrites only the fields it actually supplied |
| `buildImagePrompt` | primary (category+palette template) | **fallback per-role** — returns Claude's prompt for a role if one exists, else the same deterministic template as always |
| `pickVariant`, `ensureAssetDrivenSections`, `buildImagePlan`, `resolveImagePlanAssets`, `renderVisualSlot`, every `render*` section function, `renderChrome` | **primary, unchanged, for both paths** | Claude never touches rendering. This is the core architectural guarantee: a WebsiteProject from either path is rendered by exactly the same code. |
| `normalizeClaudePlan` (new) | — | the single gate between "whatever Claude returned" and "a `WebsiteProject`-shaped, enum-validated object the renderer can trust," independent of and *in addition to* the server-side JSON-Schema tool constraint |

### 3. How are three independent directions represented?

Each of a visitor's (up to) 3 full `runGeneration()` calls produces one
complete `WebsiteProject`, exactly as a deterministic Generate always has —
no new "direction" wrapper object exists yet. What's new is that a second
and third call sends the server a **diversity signature** of the prior
plan(s) (`planSignature()` in `server.js`: hero/type/imagery/color/motion/
pattern + a compact per-page section-type fingerprint) and an explicit
instruction to diverge meaningfully rather than repeat. This is deliberately
the smallest thing that satisfies "three visibly different, still valid
directions" without inventing a second in-memory project store this pass —
see Q8.

### 4. How can remixing between directions work without generating again?

Not built this pass (see Q8) — but the architecture doesn't block it. Since
every direction is a plain `WebsiteProject`, and every one of its parts
(sections, dimensions, imagePlan, copy) is already independently mutable
through the existing refinement controls, the natural next step is: keep
the last 1–3 generated `WebsiteProject`s in memory (not just the current
one), add a lightweight "Direction 1/2/3" switcher that swaps which one is
`project`, and let a "bring this section from Direction 2" action literally
copy one `section` object (and its matching `imagePlan` entry) from one
project's `sections` array into another's. No Claude call and no renderer
change would be required for that — it's array surgery on data the app
already fully owns.

### 5. Where does the Anthropic API call belong?

Server-side only, in `server.js`, as `anthropicProvider` — the same shape
(`{ name, configured(), async plan(brief) }`) as the existing
`imageProviders.openai` object, so the pattern is now used twice and is
clearly the house style for "a paid external AI capability." `ANTHROPIC_API_KEY`
is read once from `process.env` and never sent to, or readable by, the
browser. The call itself forces a single tool call
(`tool_choice:{type:'tool',name:'submit_website_plan'}`) against a JSON
Schema that enum-constrains every design field to the renderer's real
vocabulary — this is what makes "Claude returns a plan, never code"
structurally true rather than a prompt-only promise.

### 6. How are model responses validated?

Twice, independently:

1. **Server-side, structurally**: the Anthropic tool-use JSON Schema itself
   rejects (at the API level) any enum value outside the renderer's known
   vocabulary, any extra property (`additionalProperties:false` throughout),
   and any missing required field.
2. **Client-side, defensively**: `normalizeClaudePlan()` in `script.js`
   re-checks every single enum against its own copy of the same vocabulary
   list (never trusts the network, even from our own server) and:
   - substitutes this category's own deterministic default for any
     individual field that's missing/invalid, rather than failing the
     whole plan over one bad field;
   - drops any section whose `type` isn't a real renderer-supported type;
   - drops any page left with zero valid sections after that filtering;
   - **returns `null`** (never throws) if literally nothing usable
     survives, which is the signal `runGeneration` uses to fall back to the
     deterministic engine.

A plan can therefore be "partially wrong" and still produce a fully valid,
just-slightly-less-AI-influenced site, instead of an all-or-nothing failure.

### 7. How can the 3-generation limit eventually be enforced server-side without recklessly touching the production app/database?

**What's built now (this pass, in this sandbox app only):** a first-party,
`HttpOnly`, `SameSite=Lax` cookie (`siteremade_anon`, one year, set with
plain `Set-Cookie` header parsing — no `cookie-parser` dependency, matching
this app's existing no-npm-package convention) naming an id the browser can
neither read nor forge, checked against an **in-memory server-side Map**
(`generationLedger`) before any Claude call happens. This is real
enforcement — clearing `localStorage` or lying in a request body cannot buy
more generations — but it is honestly **not durable**: it resets on every
process restart/deploy and doesn't share state across horizontally-scaled
instances. That's a correct, stated limitation for a sandbox pass, not a
production plan.

**The durable path (not implemented, deliberately, per the explicit
instruction not to touch the production Supabase app/database casually):**
a small table — `(anon_id or account_id, count, signatures, updated_at)` —
in that production schema, keyed the same way the cookie already is,
checked from the same pre-call gate. For a logged-in visitor, the same
table keys on `account_id` instead of the anonymous cookie, and the limit
(or a future credit system) can be tied to their existing account, no
architecture change needed here — only a real migration in the actual
production database, which is exactly the kind of change this pass
correctly declines to make unasked.

### 8. What's implemented this pass vs. deferred?

**Implemented, real, tested:**
- Server-side Claude provider + `/api/plan-website` + `/api/generation-status`,
  with honest `configured()`, pre-call limit gating, and failures never
  consuming a credit.
- Full `visualDirection` (hero/typography/nav/card/imagery/cta/colorBehavior/
  motion/spacing/pattern) — genuinely drives the renderer's actual CSS
  data-attributes, not just copy.
- Page/section **structure** — Claude picks how many pages, what they're
  for, and which real section types appear on `pages[0]`, in what order —
  proven materially different across different businesses (see Testing).
- Hero copy (kicker/headline/sub/CTA) — real, business-specific, rendered.
- Image intent — Claude supplies the prompt per role; the existing OpenAI
  provider, cache, dedup and no-waste-on-refinement funnel is 100%
  unchanged.
- `functionalityPlan` — honest, captured on the project.
- Fact-safety: the schema forces every section's factual `claims` to be
  marked `sourced` only when it truly came from the input; the system
  prompt states the no-invention rule explicitly (customer counts, ratings,
  years, awards, clients, testimonials, locations, staff, guarantees).
- Anonymous metering via `HttpOnly` cookie + server ledger (Q7).
- Graceful fallback at every failure point (unconfigured, timeout,
  malformed JSON, limit reached) — proven by test, not assumed.
- "Try another direction" (`regenerateButton`) stays 100% deterministic and
  unmetered, exactly as today — proven by test (zero `/api/plan-website`
  calls on click).

**Explicitly deferred (correctly, per the brief's own "don't overbuild"
instruction):**
- Rendering/navigating `pages[1..n]` — only `pages[0]` renders; the rest is
  captured and persisted so a follow-up pass can add page navigation
  without another Claude call or schema change.
- Threading Claude's per-section `headline/subhead/body/claims` into the
  ~20 individual section renderers (`renderServices`, `renderFaq`, etc.).
  This is captured on `section.copy` and round-trips through save/restore,
  but the renderers still generate their own deterministic copy per
  category, same as V7. Wiring all ~20 renderers to prefer `section.copy`
  when present is real, valuable work — but it's a much larger, more
  regression-prone surface than "the smallest strong architectural step,"
  and the brief's own acceptance bar (structure, not just copy) is already
  met without it.
- Direction 1/2/3 switching and cross-direction remixing (Q3/Q4) — no
  in-memory multi-project store yet; each `runGeneration()` still just
  replaces `project`, same as before.
- A durable, production-grade generation limit (Q7) — architecture and
  exact schema shape documented, not built against the real Supabase app.
- A per-image "regenerate this specific image" UI action, and any
  visible credit-system UI.

---

## What was actually built

### 1. `server.js` — Anthropic provider

- `ANTHROPIC_API_KEY` / `ANTHROPIC_MODEL` (defaults to `claude-sonnet-5`,
  per the brief's own wording), read server-side only.
- `WEBSITE_PLAN_TOOL` — the JSON-Schema tool definition. Every enum field
  (`HERO_KEYS`, `TYPE_KEYS`, `NAV_KEYS`, `CARD_KEYS`, `IMAGERY_KEYS`,
  `CTA_KEYS`, `COLOR_BEHAVIOR_KEYS`, `MOTION_KEYS`, `SPACING_KEYS`,
  `PATTERN_KEYS`, `SECTION_TYPE_KEYS`) is copied **verbatim** from
  `script.js`'s own `dimensionKeywords`/`categoryDimensionDefaults`
  vocabulary — this is the single source of truth the tool schema, the
  system prompt, and the client-side `normalizeClaudePlan` all agree on.
- `PLANNER_SYSTEM_PROMPT` — the 5 rules: no fabricated facts (with a
  `claims[{text,sourced}]` mechanism), reason about the real business (no
  fixed template/page count), every enum choice needs a `rationale`,
  `functionalityPlan` honesty, concise real copy.
- `anthropicProvider.plan(brief)` — 25s timeout via `AbortController`,
  POSTs to `https://api.anthropic.com/v1/messages` with
  `tool_choice` forcing `submit_website_plan`, extracts and returns the
  tool-use `input`.
- `planSignature(plan)` — compact fingerprint sent back to Claude on
  direction 2/3 so it actually diverges.
- Anonymous cookie + in-memory ledger (Q7), `GET /api/generation-status`,
  `POST /api/plan-website` (pre-call gate, 200-not-500 on every "not your
  fault" failure, credit only consumed on real success).

**Audited before writing any of this:** unlike `api.openai.com` (blocked by
this sandbox's egress policy, per the V7 audit), `api.anthropic.com` **is**
network-reachable from this container — confirmed via a direct `curl`
(got a real `authentication_error` HTTP response, not `connect_rejected`).
But no `ANTHROPIC_API_KEY` is set for this app to use, and this container's
own Claude access uses different internal harness credentials that are
explicitly not a usable substitute API key for a separate deployed app —
so `configured()` is honestly `false` here too, exactly like the image
provider, and the client falls back to the real deterministic engine.
Testing therefore uses a mocked `/api/plan-website` (same convention as
V7.1's mocked image provider) to prove the pipeline end-to-end.

### 2. `script.js` — client-side normalization + generation flow

- `normalizeClaudePlan(raw, catDefaults)` — validates/clamps everything
  (Q6), returns `null` on an unusable plan.
- `buildImagePrompt` — one added line: prefer
  `project.intent.claudeImagePrompts[role]` if present, else the original
  deterministic template. Everything downstream (`buildImagePlan`, caching,
  dedup, `resolveImagePlanAssets`) is untouched.
- `buildGenerationPlan(text, preserved, claudePlan)` — now takes an
  optional normalized Claude plan. When present, builds the exact same
  `WebsiteProject` shape from Claude's dimensions/sections/heroCopy instead
  of the keyword-composed/recipe-composed deterministic values, and the
  same 6-step progress pipeline announces real Claude-authored results
  instead of recomputing them.
- `runGeneration(text)` — now `async`. Attempts `POST /api/plan-website`
  **only** when the bootstrapped meter says AI planning is configured and
  the visitor has directions remaining (zero wasted calls otherwise);
  updates the visible meter hint from the real response; on any failure/
  limit/unusable plan, falls straight through to the unchanged
  deterministic pipeline. `regenerateButton` ("Try another direction") was
  not touched at all.
- A small `#generatorAiHint` line under the Generate button, hidden
  entirely when AI planning isn't configured, otherwise showing
  "N of 3 AI-planned directions left…" honestly.

### 3. `mock-server.js` / testing harness (not part of the git deliverable)

Extended with `/api/generation-status`, `/api/plan-website`, and
`/__test/set-plan-configured`, returning **materially different** mock
plans keyed off the business description (a logistics/SaaS plan, a
restaurant plan, a general-services plan), each with its own real
hero/typography/imagery/section set — specifically so a test can prove
Claude output is influencing *structure*, not just filling in a copy
template.

---

## Testing

New, in `v8-claude-plan-test.js` (Playwright, against the mock):

- Two materially different businesses → different hero layout, typography,
  imagery, colorBehavior, **and** a different rendered section list
  (type + order) — the logistics business gets
  `features/productShowcase/integrations/pricing/faq`, the restaurant gets
  `menu/gallery/about/testimonialsGrid/reservationCta`. Hero headline text
  on screen is the AI-authored copy in both cases, not the category
  fallback.
- Exactly one `/api/plan-website` call per full generation — never
  duplicated.
- Hitting the AI-plan limit falls back to a fully working deterministic
  site (never "AI unavailable, nothing works"), and the meter hint
  communicates it honestly.
- When AI planning isn't configured (this sandbox's real, honest state):
  **zero** `/api/plan-website` calls are ever made, and the deterministic
  engine renders a complete site as always.
- "Try another direction" makes **zero** additional `/api/plan-website`
  calls — confirmed unmetered/deterministic, per the brief's own rule.

**Result: 17/17 pass.**

Re-run and still fully green on this branch: `v6-verify.js` (22/22 — full
V5/V6 regression), `v7-diversity.js` (8/8 unique structural signatures),
`v7-mobile-check.js` (0 overflow / 0 errors across 8 prompts),
`v7-1-image-gen-test.js`, `v7-1-diversity-image-sweep.js`,
`v7-1-container-sizing-audit.js` (all real-image-in-DOM, caching, dedup,
save/restore, and container-sizing guarantees intact).

**Not deployed.**
