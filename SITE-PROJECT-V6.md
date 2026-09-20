# SITE-PROJECT V6 — Generate → Inspect → Buy

V6 turns SiteRemade's landing generator from a lead-generation demo into a
product flow: describe a business, generate a real `WebsiteProject` (the
V5 architecture, unchanged as a data model), inspect and refine it, then
buy the exact project state. This document covers what changed, what is
real vs. scaffolded in the purchase flow, and the backend work still
required for a fully self-serve paid checkout.

## 1. Generation UX: real steps, no artificial stall

**Audit of the V5 behaviour**: `runGeneration()` pre-computed the entire
result (`composeStyleFromAnalysis`, `composeSections`, etc.) *before* the
step-list animation even started, then ran a `setTimeout(nextStep, 500)`
loop that only updated label text for an already-finished computation. The
"progress" was decorative — a fixed 2.5s hold regardless of how fast the
real work actually was, and the panel underneath it was a large, static
"Generate a direction first." overlay with blur + `pointer-events:none`
covering the whole builder shell.

**V6 fix** (`script.js`, `buildGenerationPlan()` / `runGeneration()`):
- The 6 progress-step labels (`Understanding your business`, `Planning
  site structure`, `Choosing typography and visual direction`, `Composing
  sections`, `Planning/placing imagery`, `Building your website`) each map
  to one real function call that mutates the in-progress project:
  `analyzeDescription`/shell build → `composeSections` → applying
  `composeStyleFromAnalysis`'s palette/dimensions → `pickVariant` per
  section → `planAssets` + `ensureAssetDrivenSections` → final chrome
  render. Verified in testing that each step's displayed note is genuine,
  distinct, content-driven text (e.g. `"Retail business detected in
  Victoria"`, `"5 sections planned"`, `"Warm, spacious composition"`), not
  static placeholder copy.
- Pacing between steps is a single `requestAnimationFrame`, never a fixed
  `setTimeout`. Since the underlying computation is genuinely
  synchronous/deterministic (no AI/LLM call anywhere), the whole 6-step
  pipeline completes in ~150–350ms measured in-browser — fast, not held
  artificially, while still visibly stepping through real state. With
  `prefers-reduced-motion` the steps run with no animation at all (still
  doing the same real work, just not staged for reveal).
- **Progressive rendering**: the very first thing built (before step 1
  even "announces" itself) is a real, renderable shell — business identity,
  category, a seed palette/typography, and a hero section — and
  `renderProject()` is called immediately so the hero appears before the
  rest of the pipeline runs, exactly matching "begin appearing as soon as
  enough project state exists."
- The old full-panel `.refine-lock` overlay ("Generate a direction first.")
  is removed entirely from `index.html`. The builder panel is no longer
  blurred/non-interactive pre-generation — it shows the same generic
  bootstrap project it always rendered, just without a dead modal on top of
  it. A small, always-visible "Have a project saved from before? Load it"
  link replaces the old lock overlay's buried "Load my last saved project"
  button, so a returning visitor can still reach it without scrolling into
  the Advanced panel.
- `renderProject()` was split into three composable phases —
  `applyDesignDataset()` (palette/typography-level CSS), `renderSections()`
  (section HTML/content/imagery), `renderChrome()` (nav, summary chips,
  handoff + purchase cards, form/control mirrors) — so the generation
  pipeline can call the real phase that corresponds to each labelled step,
  and every other refinement control can keep calling the single
  `renderProject()` composition exactly as in V5.

## 2. Business/site title always visible

Two real gaps existed: `project.business.name` had no way to be populated
*from the description itself* (it only ever came from the manual "Business
name" field or a previous project), and a fresh Generate on a new
description always kept whatever name was already there — so describing a
second, differently-named business would silently keep showing the first
one's name.

**Fix**: `extractBusinessName(text)` (mirrors the existing
`extractLocation` pattern) matches `"...called X"` / `"...named X"` and is
deliberately conservative — it only fires on an explicit naming phrase, so
it never guesses wrong. Precedence in both `createProject()` and the new
`buildGenerationPlan()`: a name captured from *this* description wins
(so a new business description is reflected immediately) → otherwise
whatever name already existed (manual edits and prior state survive) →
otherwise the neutral fallback `"Your Business"`. The fallback path already
existed and was verified robust (clearing the name field renders
`"Your Business"`, never blank) — nav, hero, footer, purchase card and the
handoff card all read from the same `project.business.name`, so there is
one source of truth, not several that can drift out of sync.

## 3 & 4. "Try:" row demoted, Generate button promoted

`index.html`'s `#generatorForm` is now: label → textarea → **Generate
website** button, immediately followed by a small, muted
`.generator-examples-secondary` row (`"Need inspiration?"` + 3 small
chips) — reusing the existing `pickExamples()`/chip-click logic, just
visually and structurally demoted rather than sharing the primary row with
the submit button. Verified via DOM order (`LABEL → TEXTAREA → BUTTON →
DIV.generator-examples-secondary`) and that no `.generator-row` element
exists in the primary UI anymore.

## 5, 6, 7 & 8. Generate → Inspect → Buy replaces the lead-first ending

The old `#send` section (eyebrow "SITEREMADE TAKES IT FROM HERE", button
"Send My Design") is no longer the page's primary ending. A new
`<section id="buy" class="purchase-section">` sits right after the
generator/refine panel:

- Shows the actual generated project (business name, palette/layout/
  category summary, the original description) in a card, alongside a
  **Buy this website** button and the $350 CAD price.
- The button is disabled with the caption "Generate a direction above to
  enable checkout" until a real generation has happened (`markGenerated()`
  enables it) — a small, honest affordance rather than the old giant lock
  overlay, and not gating anything else on the page.
- Buying always POSTs the **current** `project` state (whatever refinement
  — regenerate, colour change, asset upload, tone — was last applied), per
  the requirement that purchase uses the latest version, not a stale
  snapshot from first generation.
- No email/name form gates the Buy button. The old lead form still exists
  (see below) but purely as an optional, clearly secondary path.
- The old `#send` section is kept (its backend endpoint, `/api/lead`, is
  still real and still useful for the team operationally) but retitled
  ("Prefer to talk first?" / "Talk to us before you buy." / button "Get in
  Touch"), moved to *after* the purchase section, and visually shrunk
  (`.secondary-contact` modifier). This satisfies "internal lead/admin
  notifications can remain if operationally useful" without them defining
  the primary experience.
- Old funnel language audited and removed sitewide: `"Send My Design"`,
  `"SiteRemade takes it from here"`, `"Submit design"`, `"Email us this
  result"`, `"Send this direction"` — none remain (verified by scanning
  the rendered page's full text content). The footer tagline changed from
  "Build the direction. We'll build the website." (passive, "we'll build it
  later") to "Generate it. Inspect it. Buy it." The "why it works" section's
  third point changed from "Send the exact brief" to "Buy the exact
  version."

## 9. Refinement still mutates `WebsiteProject`, unchanged

No refinement control's underlying logic changed. Business name, industry,
colours, layout, section toggles, tone, "Try another direction", logo/
asset uploads — every one of them still follows the V5 rule: mutate a field
on `project`, then call `renderProject(project)`. Verified regeneration
keeps the business name, genuinely changes the palette (cycles seeds), and
that a manual business-name edit still overrides and is reflected in both
the generated site and the (now demoted) lead form's hidden mirror field.

## 10. Audit: what already exists for payments (siteremade-app)

Before writing any purchase code, the main production app
(`siteremade-app`, a separate repo/deployment from this landing page) was
read directly (not assumed) for existing Stripe/billing infrastructure:

- **Stripe today is used for two unrelated things**, neither of which is
  "a customer buys a generated website": Stripe Connect (Express) so a
  SiteRemade *client's own customers* can pay them (`routes/twilio-
  stripe.js`), and SiteRemade's own SaaS subscription billing / ad-fund
  top-ups / per-invoice payment links (`server.js`, using a hand-rolled
  `stripeRequest()` helper that POSTs form-encoded requests directly to
  `api.stripe.com` — no `stripe` npm package). A real webhook exists
  (`POST /api/webhooks/stripe`) that dispatches on `metadata.kind`
  (`'ad_fund'`, `'subscription'`, or falls back to an invoice-paid path).
  There is no existing `metadata.kind` for "a website was purchased" and
  no fixed Stripe Price IDs anywhere (every session builds `price_data`
  inline) — so a new website-purchase kind doesn't collide with anything.
- **`invoices` table** already has a `stripe_session_id` and a nullable
  `project_id` FK into `website_projects` (added specifically for this
  purpose in an earlier migration) — the schema already anticipated tying
  a payment to a project, it's just never been wired to an *unauthenticated
  purchase* path.
- **`website_projects` table** uses ordinary UUIDs (safe to reference from
  external metadata) but every creation/read path requires an existing
  `workspace_id` and authenticated session (`ctx(req,res,u)` in
  `server.js`) — there is no public/webhook-style endpoint that can create
  one from outside the app today.
- **`.env.example`** only declares `STRIPE_SECRET_KEY` and
  `STRIPE_WEBHOOK_SECRET` — no publishable key, consistent with the
  inline-`price_data` pattern above.
- **This landing repo had zero payment code** before V6 — no Stripe
  references anywhere in `server.js`.

## 11. What V6 actually built for purchasing (real, not faked)

`server.js` gained `POST /api/checkout`, using the **same** raw-fetch-to-
`api.stripe.com` convention as the main app (no dependency install
required, which also can't happen in every environment this repo runs in
— `npm install stripe` is blocked by this sandbox's registry policy). It:

- Returns `{ok:false, configured:false, message:...}` immediately if
  `STRIPE_SECRET_KEY` isn't set — **verified end-to-end**: clicking Buy in
  this environment (no key configured) shows an honest message
  ("Checkout isn't live in this environment yet...") and points to the
  "Get in Touch" fallback. It does not pretend to succeed.
- When a key *is* configured, creates a real `mode: 'payment'` Checkout
  Session with `metadata.kind = 'website_purchase'` (a new kind, additive
  to the existing webhook's dispatch, not colliding with `'ad_fund'` /
  `'subscription'`), `metadata.projectId` = the generated project's id, and
  a handful of other short strings (business name, industry, brand
  colour). The request-body flattening (nested `line_items[0][price_data]
  [...]` bracket notation) was unit-tested directly against Node with no
  network call, confirming the encoding Stripe's API expects is correct —
  this path is untested against real Stripe network calls (no key/egress
  available here) but the request shape is verified correct.
- **Deliberately does not** receive or store the full `WebsiteProject`
  (copy, section list, uploaded image data URLs) as checkout metadata:
  Stripe caps metadata at 500 characters per value / 50 keys, and a project
  with embedded images would badly exceed that even before hitting the key
  limit. Only a small, safe summary travels to Stripe.
- The full project stays in the browser: right before redirecting to
  Stripe, the client saves the serialized project to `localStorage` keyed
  by its id (`siteremade:purchase:<projectId>`). On return
  (`?purchased=1&project=<id>`), the page checks for that key and shows an
  honest confirmation — "this exact project is on file" if found, a
  generic confirmation if not (e.g. different browser/device, or storage
  was cleared). This is real, working, and honestly limited — it is not a
  substitute for server-side persistence.

## What still blocks a fully self-serve, reliably-recoverable paid purchase

None of this is invented or guessed — it follows directly from the audit
in part 10, and none of it was built in this pass (no production
migrations, no new tables, per the standing instruction):

1. **No public endpoint to persist a `WebsiteProject` server-side before
   an account exists.** Every `website_projects` write in the main app
   requires an authenticated session and an existing `workspace_id`. A
   purchase happens before either exists.
2. **No `metadata.kind === 'website_purchase'` branch in the real webhook**
   (`server.js` in `siteremade-app`). Today a completed payment with that
   kind would fall through to the generic invoice-paid branch and do
   nothing useful with `projectId`.
3. **No account-provisioning-from-purchase flow.** Nothing today creates a
   `workspace` (and therefore nowhere to put the `website_projects` row)
   outside of `/api/auth/signup`. A buyer who has never signed up needs one
   created for them, plus a way to claim it (e.g. a password-setup link
   extending the existing signup flow).
4. **Cross-device/cleared-storage recovery is unsolved.** The
   `localStorage`-based reunification this pass built is real but
   browser-local by construction; a reliable "email + a link, works from
   any device" recovery needs the server-side persistence in (1).

**Recommended next step** (unchanged in spirit from the V5 report, now
sharpened by the audit): extend the real webhook with a
`'website_purchase'` branch that (a) provisions a `workspace` + `lead` +
`website_projects` row keyed by the checkout's `projectId` metadata, (b)
stores the actual project JSON — POSTed from the landing page to a new
public endpoint *before* redirecting to Stripe (not after, so it survives
even if the buyer never returns) — into the existing `website_projects.
intake`/`brief` jsonb column, which already has the right shape for this,
and (c) emails the buyer a claim link extending `/api/auth/signup`. This
reuses three things that already exist (the webhook dispatch convention,
the `invoices.project_id` FK, the `intake` jsonb column) instead of
inventing a parallel model.

## Verification summary

Automated Playwright checks (headless Chromium) against a hand-rolled
Node-core mock of `server.js`'s contract (`npm install` is blocked in this
sandbox, so `express` isn't available — the mock replicates `/api/lead`
and `/api/checkout`'s exact request/response shape):

- Generate button sits directly under the textarea; "Try:" row is gone
  from the primary row and exists only as a small secondary line.
- Generation has no artificial stall (~150–350ms measured in-browser) and
  each step's displayed note is real, distinct, content-driven text.
- Business/site title never disappears — verified with a prompt containing
  an explicit name, a prompt without one, and manually clearing the name
  field.
- Buy button disabled pre-generation, enabled post-generation, styled
  visibly disabled (a real small bug — no `:disabled` style existed for
  this button — found and fixed during this pass).
- Buy click with no Stripe key configured shows an honest message and
  never fakes success; the compact payload sent contains no image/full
  project data.
- `?purchased=1` return flow shows a confirmation state.
- Regenerate ("Try another direction") is instant, preserves the business
  name, and genuinely changes the palette.
- Manual business-name edits still override and propagate to the
  (demoted) lead form's hidden mirror field.
- The demoted "Get in Touch" form still submits successfully end-to-end.
- V5 behaviour intact: asset upload still places a real image in the hero,
  save/load-project round-trip still works (now reachable via the small
  link instead of the removed lock overlay).
- No horizontal overflow and no JS console errors at 390px / 834px /
  1440px viewports.
- Sitewide copy audit: none of "Send My Design" / "SiteRemade takes it
  from here" / "Submit design" / "Email us this result" / "Send this
  direction" remain.

Not deployed, per instruction.
