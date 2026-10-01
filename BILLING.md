# Ownership, credits and paid providers

**Buy the website once. Own it permanently. Credits power whatever SiteRemade does for you afterwards.**
There is no subscription. One account system and one credit ledger serve the builder (Business, Creative) and the
client app.

## What customers pay for

| | Price (CAD) | What it is |
|---|---|---|
| Business Website | $149.99, one time | Ownership of one finished Business website: download, host anywhere, forever |
| Creative Website | $499.99, one time | Ownership of one finished Creative website (same terms) |
| 10 / 30 / 75 / 200 credits | $9.99 / $24.99 / $49.99 / $99.99, one time | Credits for SiteRemade's AI and media work. Never expire |
| First website bonus | 30 credits | Granted once per account, when its first website purchase is **paid** |

Credits pay for work; a website purchase pays for ownership. A customer may spend credits generating and refining and
never buy. A bought website stays downloadable with zero credits and without any plan. All prices, packs, the bonus and
the action credits live in `lib/pricing.js` (one place); Stripe price ids are environment configuration.

### Action credits (initial rules, `lib/pricing.js` ACTION_CREDITS)

| Work | Credits |
|---|---|
| Simple text / content update | 1 |
| Section update / redesign | 2 |
| Rework a page / add a page | 2 / 3 |
| Business website generation | 4 |
| Deep whole-site redesign | 5 |
| Creative website (DOM) | 6 (1 research + 5 direction) |
| + spatial (WebGL depth) rendering | +2 -- reserved, kept only if the system renders the page spatial |
| Another Creative direction | 5 (+2 spatial) |
| Premium media: image enhancement / short cinematic asset / extended | +1 / +3 / +5 |
| Optional generated picture (support / premium) | 1 / 2 |
| Manual edits, uploads, saving, downloading an owned website | 0 |

## Quote -> reserve -> execute -> settle (`lib/quotes.js`, `lib/credits.js`)

1. The work is planned and priced from what it actually involves (`quotes.build`): "This generation will use up to 8
   credits (6 if the optional parts are not used)." Updates are priced from the request itself by the deterministic edit
   classifier -- no model call happens before the owner confirms.
2. Dynamic work runs only with the owner's confirmed quote: a new Creative page and another direction
   (`/api/creative/research`, `/api/creative/plan` answer `needsConfirmation` with the quote), app updates
   (`confirmation_required`), larger builder updates, premium media. Fixed-price work (Business generation, a 1-credit
   text update) shows its price on the button.
3. Credits are reserved atomically (one SQLite transaction; a reservation id can only reserve once -- a double click,
   retry or replayed request gets the same reservation, never a second one).
4. The work runs inside the operation's provider budget (below).
5. Settlement charges what was delivered and returns the rest (`credits.settle`: e.g. the spatial surcharge of a page
   that stayed DOM, premium media that failed); a failed operation releases everything (`credits.release`). A
   reservation nobody settles (a crash) stops holding credits when it expires.

## The ledger (migrations 0009 + 0010)

* `credit_grants` -- what an account may spend: `purchase:<id>` (a pack), `bonus:first_website:<account>`, `trial:<account>`,
  `tester:<account>:<day>`, legacy `sub:<subscription>:<start>`, `admin:<id>`. Ids are deterministic: a duplicated webhook
  cannot grant twice.
* `credit_operations` + `credit_allocations` -- each paid operation and which grants it draws from (spend order: what
  expires first, the bonus, the trial, then bought credits last).
* `credit_events` -- **append-only** (triggers refuse UPDATE and DELETE): purchased, first_website_bonus, trial, tester,
  legacy_subscription, admin_adjustment, reserved, charged, released, refunded, revoked. Written in the same transaction as
  the change it records. The customer sees it at `GET /api/credits/history` (and the app's Credits view).
* `credit_purchases` -- credit-pack checkouts (pending -> fulfilled exactly once -> refunded).
* `credit_quotes` -- every quote shown, accepted, settled, expired.
* `usage_ledger` -- per operation: quoted / reserved / settled / refunded credits, Anthropic cost and tokens, SerpApi
  searches and allocated cost, Higgsfield jobs and cost, OpenAI cost, renderer, premium media, provider job ids, outcome.
  `GET /api/admin/usage-summary` (header `x-admin-token`) answers "what does an average Business / Creative generation
  actually cost us?". No key is ever recorded.
* `premium_media` -- provider-neutral records (provider, provider job id, media type, intent, source asset, preset, cost,
  provenance, the stored asset hash).

## Stripe (`/api/checkout`, `/api/credits/checkout`, `/api/stripe/webhook`)

* Website: one-time `payment` Checkout by kind; the agreed project state and revision are frozen on the intent; only
  the signed `checkout.session.completed` / `async_payment_succeeded` event for a **paid** session with exactly the
  configured amount and currency fulfils it (a Business amount never buys a Creative website). Duplicate events change
  nothing. On the account's first paid website, the 30-credit bonus is granted in the same transaction (never for a
  tester's free purchase; never twice).
* Credit pack: a `credit_purchases` row is created before checkout; the same verified, paid, matching event grants the
  pack once.
* `charge.refunded` (full refund): a refunded pack, or the bonus of a refunded website, loses its **unused** credits
  (credits already spent paid for work done) -- recorded as `revoked`. A partial refund changes nothing automatically
  (it is logged for a person). A refunded website's ownership is not removed automatically: whether it stays
  downloadable is a support decision (the intent records `refunded_at`).
* With `STRIPE_PRICE_*` set, Checkout uses those Stripe Prices; without, it sends the same amount inline. Either way the
  webhook checks the paid amount against `lib/pricing.js`.

## Paid providers are production resources only (`lib/paid-providers.js`)

Anthropic, SerpApi, Higgsfield and OpenAI images are called only when paid calls are **live**: a production runtime
(`NODE_ENV=production` or Railway's own variables), unless `ALLOW_PAID_PROVIDER_CALLS=false`; anywhere else only with an
explicit `ALLOW_PAID_PROVIDER_CALLS=true`. Otherwise every provider reports itself unavailable (the no-AI paths run),
keys are never handed out, and a fetch guard refuses any request to a paid host before it leaves the process. Tests run
in the harness's own "mock" mode (`test/helpers/run-server.js` answers every provider; no environment variable can
select it). Provider keys are read here only; never logged, serialised, exported or returned.

Every operation has a provider-spend ceiling of credits x `USD_PER_CREDIT_CEILING` (0.20 USD, internal, never shown).
`lib/provider-budget.js` holds the cost estimates and checks each planned call against what is left; nothing silently
exceeds it.

## Premium media (Higgsfield) -- optional, Creative only (`lib/media/`)

SiteRemade remains the foundation (direction, timeline, DOM and spatial renderers, storage, export). Premium media is
only for a meaningful improvement the rest cannot give.

**In the generation itself.** When the brief explicitly asks for it (cinematic hero video, image-to-video, premium hero
media, strong camera movement, product turn, alternate angle, environment motion, premium transition --
`premium-media.requestedIntents`), the ONE Creative quote includes it (e.g. 6 + spatial 2 + cinematic hero 3 = up to 11;
a 4K model is priced in the 5-credit tier from its estimated cost), the owner confirms once, the job reserves it with the
page, and right after the direction the studio runs `/api/creative/premium` on its own: it picks the source picture (the
director's pick, else the page's opening picture, else the owner's uploads), checks permission, calls Higgsfield and
settles at what was delivered. Every generation shows **"Premium media planned: Yes / No"** with the reason (not
requested, no source picture, source image not eligible for transformation, missing API key, missing / invalid video or
image endpoint, budget, renderer handled it, provider failed), as a progress step and in the direction panel, and the
server logs one `[premium-media]` line per quote and per execution (never a key). A suggestion the director makes on its
own, without a request, stays an explicitly labelled optional extra ("not in your quote").

The server submits fixed presets (the model in `HIGGSFIELD_VIDEO_ENDPOINT`, required -- a model id or a pasted full
Higgsfield URL, normalised; parameters by model family, e.g. Kling 3.0: duration 5, sound off; an image endpoint only if
configured), at most one submit per asset,
inside the budget (a 1080p preset steps down; anything else that does not fit is not submitted). Sources: the owner's
own upload, a cut-out of it, a discovered picture whose stated licence allows modification (never NoDerivatives), or a
picture the owner picked AND confirmed for transformation -- rights-unclear discovered imagery and Wikimedia never.
Finished outputs are downloaded and stored as the project's own assets with provenance; a website and its export never
hotlink a provider URL (Higgsfield keeps outputs for at least 7 days only). Failed and NSFW-flagged requests are not
charged by Higgsfield and cost the customer nothing; only delivered media is charged. Business websites never use it.
Higgsfield's commercial-use terms for outputs must be checked separately before promising customers anything about them.

## Legacy Workspace subscriptions (retired)

No subscription is sold any more (the app's start route answers 410). Existing subscribers are not cut off: while their
subscription is still billing at Stripe, the builder still grants the monthly credits they paid for (verified with the
app as before, `lib/billing.js`), and the app shows them a "Manage or cancel" link to Stripe's portal. Nothing --
ownership, downloads, editing, the app itself -- depends on a subscription. Cancel the remaining subscriptions at Stripe
(at period end) when ready; their unused month ends with them, all purchases and projects stay.

## Railway variables

| Variable | Where | |
|---|---|---|
| `HIGGSFIELD_API_KEY` | builder | `<key id>:<key secret>` from Higgsfield. Without it premium media reports itself unavailable |
| `STRIPE_PRICE_BUSINESS_WEBSITE`, `STRIPE_PRICE_CREATIVE_WEBSITE` | builder | optional Stripe Price ids (amounts must match) |
| `STRIPE_PRICE_CREDITS_10`, `_30`, `_75`, `_200` | builder | optional Stripe Price ids for the packs |
| `HIGGSFIELD_VIDEO_ENDPOINT` | builder | **required** for video intents: a model id (`kling-video/v3.0/4k/image-to-video`) or the full Higgsfield URL |
| `HIGGSFIELD_IMAGE_ENDPOINT` | builder | optional: image intents (alternate angle, enhancement) run only with it |
| `SITEREMADE_HIGGSFIELD_USD_VIDEO_4K` | builder | the estimated cost of one 4K video (default 0.90 USD, unverified) -- decides its credit tier |
| `SITEREMADE_HIGGSFIELD_USD_VIDEO_5S_720P` (and `_1080P`, `_IMAGE_STANDARD`), `SITEREMADE_SERPAPI_USD_PER_SEARCH` | builder | budgeting estimates, once verified on the providers' consoles |
| `PUBLIC_BASE_URL` | builder | the public origin Higgsfield fetches a source picture from (defaults to the request's host) |
| `ALLOW_PAID_PROVIDER_CALLS` | never in production | leave unset; `false` switches paid providers off |

`SITEREMADE_WEBSITE_PRICE_CENTS` (one price for every kind) is no longer read; `SITEREMADE_BUSINESS_WEBSITE_PRICE_CENTS`
/ `SITEREMADE_CREATIVE_WEBSITE_PRICE_CENTS` override a kind's price if ever needed.
