# Credits, the Workspace subscription and website purchases

One account system across the builder (Business and Creative) and the SiteRemade client app.

## Prices (fixed in code)

| Action | Credits |
|---|---|
| Business website (planning, quality review and its automatic repairs) | 2 |
| Creative page: research, picture search and checks, direction, claim checks, automatic repairs | 4 (1 research + 3 direction) |
| Another direction for the same Creative page | 3 |
| AI update (builder refinement or client-app update), whatever the browser calls it | 1 |
| Client-app redesign ("make it feel premium" -- a whole-site deep refinement; nothing charged if it changes too little) | 1 (the same AI update, DEEP_REFINEMENT_CREDIT_COST) |
| Optional generated image | 1 support / 2 premium |
| Manual edits, uploads, saving | 0 |

Allowances: 6 one-time free trial credits per account; 100 credits per Workspace billing month (no rollover); the
owner's tester allowance (`SITEREMADE_TESTER_EMAILS`, 500 per UTC day) is unchanged. Spend order: tester day, then
plan month, then trial.

## One ledger

`lib/credits.js` (tables in `migrations/0009_credit_ledger.sql`) is the only balance. The client app has none of its
own: its AI updates run through the app bridge and spend from this ledger, and it shows this ledger's summary
(`GET /api/app-bridge/credits`, the same numbers as `GET /api/credits`).

- Every paid action is an operation with a unique id, reserved before any provider call. Reusing an id never reserves
  or charges twice; a double click gets 409 while the first is running, and a retry after success gets the saved
  result back (`paidReplays`, in memory, 30 minutes).
- Work that fails is released (not charged). A reservation left by a crash stops holding credits when it expires
  (20 minutes; a Creative job's 24 hours). A late success after expiry is charged only from credits that are free.
- An operation stays charged against the grant it was reserved on, so crossing a day or billing-month boundary never
  touches the next period.
- Provider cost is recorded per operation (`provider_usd`) whether or not the customer is charged.

## Creative page = one job

`lib/creative-jobs.js`. The first research call reserves the whole 4 credits. Clarifying, "search again" and a reload
within 24 hours continue the same job (at most 4 research runs in all). The watermark check runs only inside an open
job (at most 6 per page). Research is charged when a paid research step produced something; the direction when it
produced a page. A failed direction returns its 3; a page abandoned at the picture step keeps only the research credit.
Picking pictures costs nothing more.

The server's own Creative AI budget (`CREATIVE_DAILY_USD_CAP`) reserves each step's worst-case cost before it runs, so
steps in flight cannot overshoot it. Hitting it says "your credits were not used", never "out of credits".

## Workspace subscription

The builder never trusts the browser, account metadata, an email address or a checkout redirect. `lib/billing.js`
asks the app (`POST {SITEREMADE_APP_URL}/api/internal/billing/entitlement`, HMAC-signed with
`SITEREMADE_BILLING_SECRET`), which answers from its workspace records and the subscription's live state at Stripe.
The answer is cached for 5 minutes. A stale answer is used for at most 24 hours if the app cannot be reached, then the
account falls back to its free credits. The builder account linked to the subscription's billing owner gets the
month's grant, whose id `sub:<subscription>:<period start>` can exist only once.

| Subscription state | Credits |
|---|---|
| active / trialing | 100 for the current billing month |
| cancel at period end | the month runs to its end, then nothing more |
| past_due | no new month; paying the invoice grants it, once |
| canceled / unpaid / incomplete_expired | the month's unused plan credits end; trial remainder, projects and purchases stay |

Required configuration: the same `SITEREMADE_BILLING_SECRET` on both services. `SITEREMADE_APP_URL` is optional and
defaults to `https://app.siteremade.com`. Without the secret, every account is on its free trial and tester allowance.

## Website purchase (both kinds)

Business and Creative websites are each a one-time purchase at `SITEREMADE_WEBSITE_PRICE_CENTS`
`SITEREMADE_WEBSITE_PRICE_CURRENCY` (default 14999 CAD, $149.99). A subscription never includes one.

- Checkout freezes the project's state and revision on the purchase intent. Fulfilment snapshots that agreed state,
  not later edits.
- Fulfilment happens only from the signed Stripe event, only when Stripe reports the session `paid` for exactly the
  agreed amount and currency. Asynchronous payments are fulfilled on `checkout.session.async_payment_succeeded`.
- A new checkout for the same website first expires the earlier open Checkout Session. If Stripe refuses because it
  was just paid, no new checkout starts.
- `POST /api/projects/:id/export` requires the owner's purchased project. Another account gets 404. Re-downloading
  needs no new payment, and cancelling the subscription does not affect it.
- A later revision can be published and exported (the Business rule). Turning a purchased website into the other kind
  does not carry the purchase over: publishing refuses, and export keeps the purchased kind.
