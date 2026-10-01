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
| Premium video clip (Higgsfield), only in a video mode, only if delivered | **+12** per clip (Cinematic Hero: 1 clip, up to 18 in all; Showcase: 3 clips, up to 42) |
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

Every operation has a provider-spend ceiling of credits x `USD_PER_CREDIT_CEILING` (0.20 USD of provider spend per credit,
internal, never shown). It is a **ceiling, not the price of anything**: a premium clip is not 0.20 USD -- see below.
`lib/provider-budget.js` holds the cost estimates and checks each planned call against what is left; nothing silently
exceeds it.

## Premium video (Higgsfield) -- Creative only, uploads only, only in a chosen video mode

**What it costs (observed, not guaranteed).** One 5-second premium clip (Higgsfield, kling-video/v3.0/4k/image-to-video)
has repeatedly taken about **2.10 USD** from the Higgsfield balance. It is budgeted at **2.25 USD** (2.10 x the 1.07
safety buffer) -- one figure for every video model (`lib/provider-budget.js` `video_clip`, `clipCost()`): a cheaper
per-model guess is never assumed. One clip: ~2.10 observed / 2.25 budgeted. A Showcase's three: ~6.30 / 6.75. A clip is
priced at **12 credits** (2.25 USD needs ceil(2.25 / 0.20) = 12 credits of provider ceiling; never below the 11-credit floor).

**Only the owner's choice spends it.** The generator offers Creative (6 credits, no Higgsfield), Creative + Cinematic
Hero (one clip, up to 18) and Creative Showcase (hero, takeover and payoff, up to 42). Nothing else -- the brief's
wording, the director's suggestions, the critic, anything after the page -- ever starts provider work: the old
post-generation `/api/premium-media/quote` / `execute` answer 410. Sources are the owner's own uploads only, good
enough for full-screen video (`lib/creative/premium-source.js`).

**One execution system: the durable premium job** (`lib/premium-jobs.js`, migrations 0011 + 0012). After the page is
directed the studio starts it (`POST /api/creative/premium/start` returns at once) and polls it
(`GET /api/creative/premium/status/:id`); the server owns its life. Its money rules:
- at most one provider submission per role, written as "submitting" before the call; one whose outcome is uncertain (no
  answer, a timeout, a provider 5xx, a crash mid-submit) is NEVER sent again -- recorded internally as a possible
  provider cost, its SiteRemade credits returned
- never more clips than the mode (Hero 1, Showcase 3: `max_clips`), never past `budget_usd` (clips x 2.25 USD)
- no automatic retry of a generation; only the download of a finished clip is retried (bounded: 8 tries)
- the soft deadline (60 minutes) asks Higgsfield to cancel; only a cancellation Higgsfield confirms ends the role with no
  provider cost -- otherwise it keeps being checked and a late clip is still delivered and charged; at the hard deadline
  (6 hours) it is recorded as unresolved (possible provider cost) and its SiteRemade credits returned
- settled exactly once: delivered clips charged, everything else returned -- the owner reads "12 SiteRemade credits
  returned", never a word suggesting the provider's money came back
- the source a provider fetches is a durable, unguessable link (only its hash is stored) to that one upload, removed when
  the role has an outcome or at its expiry -- a restart never loses it
- the kill switch `PREMIUM_PROVIDER_ENABLED=false` (server-side only) stops every submission not yet made: video modes
  say they are unavailable, Creative works as usual, a clip already sent is still collected

**Telemetry.** Per role, without secrets, source links or provider URLs: model, resolution, duration, estimated (2.25)
and observed (2.10) cost, provider job id, provider state (not_sent / rejected / accepted / completed / failed / cancelled
/ unknown), outcome, SiteRemade credits charged, times -- in `premium_jobs.roles_json`, `premium_media`, the usage
ledger, one `[premium-media]` log line per step and `GET /api/admin/premium-jobs/:id` (admin token).

Finished outputs are stored as the project's own assets with provenance (Higgsfield keeps outputs for at least 7 days
only); a website and its export never hotlink a provider URL. Business websites never use premium video. Higgsfield's
commercial-use terms for outputs must be checked separately before promising customers anything about them.

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
| `HIGGSFIELD_IMAGE_ENDPOINT` | builder | optional; no premium image is offered by the generator today |
| `PREMIUM_PROVIDER_ENABLED` | builder | the kill switch for paid premium video: `false` stops every submission not yet made (default on) |
| `SITEREMADE_HIGGSFIELD_USD_VIDEO_CLIP` | builder | what one 5-second premium clip is OBSERVED to cost at Higgsfield (default **2.10 USD**; the older name `_VIDEO_4K` still counts) |
| `SITEREMADE_HIGGSFIELD_SAFETY_BUFFER` | builder | multiplier for budgeting (default 1.07: 2.10 -> 2.25 per clip; never below 1) |
| `PREMIUM_JOB_ROLE_DEADLINE_MS`, `PREMIUM_JOB_HARD_DEADLINE_MS` | builder | the soft (60 min: ask to cancel) and hard (6 h: unresolved) deadlines of a premium clip |
| `SITEREMADE_HIGGSFIELD_USD_IMAGE_STANDARD`, `SITEREMADE_SERPAPI_USD_PER_SEARCH` | builder | budgeting estimates, once verified on the providers' consoles |
| `PUBLIC_BASE_URL` | builder | the public origin Higgsfield fetches a source picture from (defaults to the request's host) |
| `ALLOW_PAID_PROVIDER_CALLS` | never in production | leave unset; `false` switches paid providers off |

`SITEREMADE_WEBSITE_PRICE_CENTS` (one price for every kind) is no longer read; `SITEREMADE_BUSINESS_WEBSITE_PRICE_CENTS`
/ `SITEREMADE_CREATIVE_WEBSITE_PRICE_CENTS` override a kind's price if ever needed.
