# V13 — Final generator hardening + credit config verification + app identity bridge design

This pass builds on `eb01617d` (unified account / auth-gated generation /
daily credits). Per its own brief: **do not redesign the generator, do not
touch the visual generation system, do not enable paid images, do not
invent a fake cross-app identity bridge, do not silently migrate the app to
a new auth system.** Everything below either hardens what already exists or
documents a decision without implementing it.

## 1. Credit config verification

Production was already correct. `server.js`'s `SITEREMADE_DAILY_FREE_CREDITS`
defaulted to `10` and `CREDIT_COST_BY_CLASS.standard` to `3` before this
pass touched anything — confirmed by direct read of the literal default
expressions (`Number(process.env.SITEREMADE_DAILY_FREE_CREDITS) || 10`,
`Number(process.env.SITEREMADE_CREDIT_COST_STANDARD) || 3`), and re-proven
by `primtest/v13-generator-hardening-test.js`'s source-inspection tests
1/1b/2/2b (`server.js` cannot be spawned in this sandbox — no `express` —
so those tests `eval()` the exact literal expression out of the file
itself, the same technique `v11-baseline-test.js` established for its own
cost invariant).

**Why a previous pass's own test showed `5 -> 2` instead of `10 -> 7`:**
`landing/mock-server.js` (the dependency-free raw-http test double every
suite in this repo runs HTTP-level checks against, since `server.js` itself
can never be spawned) had its own separate, undocumented ambient default —
`let DAILY_FREE_CREDITS = 5;` — left over from before the credit system's
daily-allowance size was finalized at 10. That was never a production bug;
it was an unlabeled test-only number in the mock that happened to look load-
bearing. Fixed by raising the mock's default to `10` (matching production
exactly) and updating the one test (`v9-product-flow-test.js`'s test 9) that
implicitly depended on the old value, with a comment on both sides
explaining why. Every other test that needs a *smaller* pool (to reach
exhaustion in fewer calls, e.g. to test reservation/concurrency mechanics
rather than the real number) already did, and still does, set `creditsLimit`
explicitly via `/__test/set-plan-configured` at its own call site — see
`v9-product-flow-test.js` (5, then 3), `v8-5-ownership-test.js` (9), and
this pass's own `v13-generator-hardening-test.js` (6, for its concurrency
check) for real examples of that deliberate, visible override. That is now
the one documented pattern for "a test wants a different number than
production" — never a second silently-different ambient default.

**Single authoritative source:** `server.js`'s own `SITEREMADE_DAILY_FREE_CREDITS`
and `CREDIT_COST_BY_CLASS` constants (lines ~724-729) are the only place a
credit number is computed from environment/config. `creditsSummaryFor()`,
`/api/credits`, `/api/plan-website`, and `/api/refine-website` all read
through them — none holds a second copy. `script.js` never independently
assumes 10 or 3: `updateGeneratorSubmitAvailability` reads
`latestCredits.generationCost`, and `renderCreditsUI` destructures
`{ remaining, dailyFreeCredits, resetsAt, generationCost }` from the same
backend object every time — see `v13-generator-hardening-test.js` tests 3/3b
(reads the field off the backend object at every display site; no
hardcoded "10 credits"/"3 credits" string literal anywhere in `script.js`).

## 2. Config discoverability

`GET /api/credits` (requires auth) returns
`{ ok, credits: { used, reserved, remaining, dailyFreeCredits, generationCost, resetsAt } }`
— every field the brief asked for. `resetsAt` is the real next UTC-midnight
instant as an ISO timestamp (never a claimed "local" reset time the backend
can't actually back up, since credits reset on UTC-day rollover only).

## 3-5. Server-side rate limiting, signup abuse, login brute-force

New module: `lib/rate-limit.js` — a real, in-memory, bounded rate limiter
(same honesty posture as this file's own pre-existing `directionsLedger`/
`operationLedger`: not durable across a restart, not shared across
horizontally-scaled instances, but a genuine, immediately-enforced
window count, never a decorative stub). Two primitives on one bucket store:

- `checkAndRecord(key, max, windowMs)` — increments and checks in one step.
  Used for plain request-rate limiting.
- `peek(key, windowMs)` / `recordFailure(key, windowMs)` — a read-then-
  conditionally-write pair, used *only* for login brute-force: `peek`
  happens **before** the real auth attempt (so a check itself is never
  indistinguishable from a failure), and `recordFailure` is called **only**
  after a real failed `authProvider.signIn` result — never on success. A
  legitimate user who mistypes their password once and then succeeds never
  nudges their own counter closer to a lockout.

A hard `MAX_TRACKED_KEYS = 20000` ceiling with oldest-first eviction bounds
memory against a flood of spoofed/rotating keys — a defensive ceiling, not a
precise LRU, but sufficient for its actual job.

Wired into both `server.js` (real) and `landing/mock-server.js` (the test
double every suite actually exercises over HTTP), keyed correctly:

| Route | Key | Default limit |
|---|---|---|
| `POST /api/auth/signup` | `req.ip` | 8 / hour |
| `POST /api/auth/signin` (request-rate) | `req.ip` | 15 / 15 min |
| `POST /api/auth/signin` (brute-force) | normalized email | 8 failures / 15 min |
| `POST /api/plan-website` | account id | 20 / minute |
| `POST /api/refine-website` | account id | 20 / minute |
| `POST /api/generate-image` | account id | 20 / minute |

Every threshold is env-overridable
(`SITEREMADE_RATE_LIMIT_SIGNUP_MAX`, `..._SIGNIN_MAX`,
`..._SIGNIN_FAILURE_MAX`, `..._GENERATION_MAX`, and matching `..._WINDOW_MS`
variants) but the literal default **is** the real production value — the
same "no magic number buried only in a test" convention the credit config
already established.

**IP handling:** `app.set('trust proxy', 1)` was already present and
unchanged — `req.ip` in Express correctly resolves through exactly one
trusted reverse-proxy hop (Railway's edge), so the new limiter's per-IP keys
read the real client address, not the proxy's own. `landing/mock-server.js`
is raw `http`, so there is no proxy in front of it at all in a test —
`req.socket.remoteAddress` there already *is* the real, direct connection
address, the same value `req.ip` resolves to with `trust proxy` correctly
configured and no proxy hop actually present. No new trust decision was
introduced on either side.

**Anti-enumeration preserved:** `lib/auth.js`'s `signIn()` already returned
the exact same `{ok:false, error:'Invalid email or password.'}` shape
whether the email exists or the password is wrong. The new brute-force
counter increments identically on either branch (both return `ok:false`
from the same code path), so this pass adds zero new information leak about
account existence — the only new signal a caller gets is "you've made 8
failed attempts against this email," never "this email doesn't exist."

**Never a permanent lock:** the failure window is 15 minutes and resets
automatically; there is no persistent ban table. The real account owner can
always sign in again once the window rolls over, proven directly by
`v13-generator-hardening-test.js` test 6c.

**Scope discipline:** per the brief ("do not build a huge anti-fraud
platform"), this is four buckets and nothing more — no CAPTCHA, no email
verification, no IP reputation service, no persistent ban list. See
sections 6/7 below for why those weren't added either.

## 6. Frontend 429 UX

`script.js`'s `runGeneration()` (the one chokepoint every generation entry
point already funnels through) now handles `result.status === 429` the same
way it already handled `401` (session-expired) and `creditsExceeded`: a
specific, honest message — `"<server reason>. Try again in Ns. Your credits
were not charged."` — shown through the existing failure/retry gate, and an
early `return` **before** `buildGenerationPlan` is ever reached. That early
return is what makes "no duplicate project" and "pending input preserved"
free: the generator input field is never cleared on any failure path in
this function (it only ever gets cleared by a *successful* generation
moving on), so the visitor's exact text is still sitting in the box, ready
to submit again, with zero code needed to explicitly "restore" it. Credits
were never burned because the rate limiter runs **before** credit
reservation on the server, in both `server.js` and `mock-server.js` — proven
by `v13-generator-hardening-test.js` test 11b (`credits.remaining` identical
immediately before/after a 429) and confirmed live in a real browser
(Playwright: gate shows the specific retry message, the input value is
byte-identical before and after the failed submit, and `/api/credits`
reports the same `remaining`/`used` before and after).

`/api/generate-image` and `/api/refine-website` were deliberately **not**
given a new, distinct 429-specific UI. Both already fail soft to their
existing, pre-existing fallback behavior for *any* non-`ok` response
(image: falls back to the designed CSS visual for that slot; refinement:
falls back to the local, non-AI classifier plan) — a 429 is just one more
member of that same "non-ok" set they already handle honestly, without
showing an error at all. Adding a second, inconsistent error-surfacing path
for only this one failure mode would be new UI complexity the brief doesn't
ask for and the "do not touch the visual generation system" constraint
argues against. Credits aren't burned there either, for the identical
reason (rate limiter before reservation).

## 7. Direct-endpoint abuse audit (route-by-route)

Every route in `server.js`, and what actually guards it:

| Route | Guard |
|---|---|
| `POST /api/plan-website` | `requireAuth` + `generationRateLimit` |
| `POST /api/generate-image` | `requireAuth` + `generationRateLimit` |
| `POST /api/refine-website` | `requireAuth` + `generationRateLimit` |
| `POST /api/checkout` | `requireAuth` + `requireSameOrigin` |
| `POST /api/auth/signup` | `requireSameOrigin` + `signupRateLimit` |
| `POST /api/auth/signin` | `requireSameOrigin` + `signinRateLimit` + per-email brute-force check |
| `POST /api/auth/signout` | `requireSameOrigin` |
| `GET /api/auth/me` | `withOptionalAuth` (intentionally — this route's whole job is to answer "am I signed in") |
| `GET /api/credits` | `requireAuth` |
| all `/api/projects*`, `/api/purchase-intents/:id`, `/api/deployments*`, `/api/domains*` | `requireAuth`, every lookup ownership-scoped (see §8) |
| `POST /api/stripe/webhook` | HMAC signature verification (not session auth — correct: Stripe is not a signed-in user) |
| `GET /api/admin/operation-ledger` | a server-only shared-secret header (`SITEREMADE_ADMIN_TOKEN`); 404s (not 401/403) if the token is missing/wrong or unconfigured — deliberately not the customer session mechanism, since this is operational/debug visibility with no roles system behind it |
| `GET /api/image-provider-status`, `/api/generation-status`, `/api/planner-status`, `/api/hosting-providers` | unguarded — correct: these expose only capability/config flags (booleans), never user data |
| `POST /api/lead` | unguarded — the pre-existing public lead-capture form, unrelated to accounts |
| `GET /privacy`, `/terms`, `/*` | unguarded static pages |

Nothing found trusting a client-supplied identity/ownership field on any
route. `requireAuth` always derives `req.accountId` from the server-resolved
session, never from the request body.

## 8. Project ownership / IDOR audit

Every project/purchase/deployment/domain route resolves through a
`getOwned*`/`listOwned*` function scoped to `req.accountId` — never a bare
`getProject(id)`. Confirmed by direct grep of every route body (all 15
project-shaped routes) and re-proven live by
`v13-generator-hardening-test.js` tests 17-19 (User B gets a clean 404
reading User A's project by its real id; User B gets 404 exporting User A's
now-*purchased* project; a plausible-but-wrong purchase-intent id gets the
same 404, not a 500 or a differently-shaped response that would hint at
whether the id is real) plus the pre-existing `v9-product-flow-test.js`
tests 48-51 (My Websites list isolation, purchase-snapshot IDOR, export
IDOR, hosting-choice IDOR).

## 9. Session/cookie audit

Unweakened, confirmed by direct read of `lib/auth.js`'s
`sessionCookieHeader()`: `HttpOnly`, `SameSite=Lax`, `Path=/`, `Secure`
conditional on `cookieShouldBeSecure(req)` (real HTTPS or
`NODE_ENV=production`), 30-day `Max-Age`. Session tokens are stored hashed
(SHA-256) — the raw token never sits in the database. `resolveSession`
opportunistically deletes an expired row and returns `null` for
missing/malformed/unknown/expired, which `requireAuth` turns into a clean
401. `deleteSession` (signout) deletes the actual database row — real
server-side invalidation, not just clearing the browser's cookie. All of
this reconfirmed live by `v13-generator-hardening-test.js` tests 20-22: the
real `Set-Cookie` header has the right flags; the same cookie value stops
authenticating immediately after signout; a garbage/stale cookie gets a
clean 401, never a crash.

**Not done, deliberately:** no cookie-domain change. A future shared-
subdomain identity architecture (§10 below) would need one, but that is a
consequence of *which* identity architecture gets chosen, not something to
pre-guess now — implementing it early would be exactly the "silent auth
migration" the brief forbids.

## 10. App identity bridge — architecture options

**Today's actual state** (confirmed by direct inspection of both
codebases, not assumed): the separate SiteRemade ops app
(`app.siteremade.com`, source at `audit/siteremade-app/`) authenticates
through **Supabase Auth** — `sr_access`/`sr_refresh` HttpOnly cookies
carrying real Supabase-issued JWTs (`lib/context.js`), a `profiles` table
keyed 1:1 to Supabase's own `auth.users.id` (a UUID), and a
`workspace_members` join table mapping users to workspaces (a business can
have more than one member). The app's `workspaces` table already carries
`siteremade_subscription_status` / `siteremade_customer_id` /
`siteremade_subscription_id` columns — the app already has a notion of "is
this workspace a SiteRemade-product subscriber," which matters for §12
below.

This generator authenticates through a completely different, local system:
`lib/auth.js`'s scrypt password hashing, an `accounts` table with a
generator-minted id (`acct_` + random hex, not a UUID, not a Supabase id),
and opaque session tokens (SHA-256-hashed at rest, `siteremade_session`
cookie) resolved against this generator's own SQLite/production-adapter
database. **There is no shared user table and no existing bridge today.**
Migration 0004 (`app_subscription_status` on `accounts`) is a nullable,
purely-additive hook for a *future* integration — it does not itself
connect anything, and every existing row is `NULL` today, honestly meaning
"unknown."

Two real options, matching what a prior pass's own `PRODUCTION-ADAPTERS.md`
already scoped out after inspecting the app's repo (there labeled (b) and
(a) respectively):

### Option A — Supabase as the shared central identity

The generator stops being its own identity system. It authenticates
against the *same* Supabase project the app uses (via `@supabase/supabase-
js` — a real npm dependency this sandbox cannot install, but that's a
sandbox constraint, not an architectural one; the target *production*
Railway deployment can install it fine). Generator-side data (projects,
credits, purchases) gets re-keyed to the Supabase user id instead of the
locally-minted `acct_...` id.

- **Migration complexity — high.** Every existing generator account needs
  either (i) a fresh Supabase Auth user created and a one-time password-
  reset flow forced (scrypt hashes cannot be converted to whatever Supabase
  Auth uses internally — there is no safe hash-to-hash migration), or (ii)
  an explicit account-linking step the person completes themselves. Every
  row in `projects`, `purchase_intents`, `purchase_snapshots`,
  `deployments`, `domains`, and the credits ledger needs its owner column
  re-pointed from the old `acct_...` id to the new Supabase UUID — a real,
  auditable backfill migration, not a schema tweak.
- **Security risk — real, but bounded and well-understood.** JWT
  verification (signature + expiry + issuer) is a mature, well-trodden
  path; the risk is almost entirely in the migration step itself (re-
  pointing ownership rows correctly, never accidentally attaching one
  person's projects to a different Supabase user).
- **Session/cookie implications — a real change.** The generator would need
  to either adopt the app's own `sr_access`/`sr_refresh` cookie pair (which
  in turn means the generator and the app would need to share a cookie
  domain — e.g. both under `*.siteremade.com` — a DNS/deployment decision,
  not just a code change), or independently verify the same JWT and issue
  its own separate session artifact. Either way, `lib/auth.js`'s entire
  session model (hashed opaque tokens in this generator's own database)
  goes away.
- **UX — the best possible end state.** One set of credentials works on
  both products immediately, no separate "link your accounts" step for a
  brand-new user who signs up after the bridge ships.
- **Existing-account migration — the hard part**, covered in full in §11.
- **Project ownership migration — a real backfill**, one row-owner-id
  rewrite per table, done once, with a rollback plan (keep the old
  `acct_...` id column around, unused, for one release cycle, in case a
  re-point needs to be undone).
- **Purchase ownership continuity — preserved**, provided the backfill is
  correct; purchases are keyed by owner id, and that id changes exactly
  once during migration, not per-request.
- **Credit continuity — preserved** the same way; the credits ledger is
  keyed by account id, re-pointed in the same backfill.
- **Rollback difficulty — high once live.** Once accounts are re-pointed to
  Supabase ids and local password auth is retired, rolling back means
  restoring both the old auth path *and* the old id mapping — this is a
  one-way door in practice, not something to flip back casually.
- **Future maintenance burden — lowest of the two options long-term.** One
  identity system, one place session/auth bugs can hide, no ongoing
  reconciliation logic to maintain.

### Option B — keep both auth systems, add an explicit identity-link table

The generator keeps its own local accounts and sessions exactly as they are
today. A new, small `identity_links` table (in the generator's own
database) maps `generator_account_id <-> app_supabase_user_id`, populated
**only** by an explicit action the person takes (e.g. signing into the app
from inside the generator, or vice versa, and confirming) — never inferred
from a matching email address.

- **Migration complexity — low.** No existing account needs anything done
  to it. The link table starts empty and fills in only as people actively
  opt in.
- **Security risk — low, and narrowly scoped.** The only new attack surface
  is the linking flow itself (must prove control of *both* identities
  before creating a link row — e.g. the person must be signed into the
  generator AND complete a real Supabase sign-in/OAuth confirmation in the
  same flow, not just type an email that happens to match).
- **Session/cookie implications — none.** Both products keep their own
  cookies, own session models, own domains if they have separate ones
  today. No forced cookie-domain unification.
- **UX — a real linking step is required.** A new user signing up for both
  products still has two separate credential sets until they explicitly
  link them; "one login" is not the out-of-the-box experience, only the
  linked experience.
- **Existing-account migration — trivial**, because nothing is migrated;
  see §11 for what "trivial" still requires (mainly: never assume same-
  email means same-person).
- **Project ownership / purchase / credit continuity — unaffected**,
  because the generator's own id never changes. A linked app account just
  gains the *ability* to see/reference generator-side data through the
  link table; ownership itself never moves.
- **Rollback difficulty — trivial.** Deleting a row from `identity_links`
  fully and safely un-links two accounts with zero blast radius on either
  side's own data.
- **Future maintenance burden — higher than Option A long-term**: two
  auth systems to keep secure and in sync indefinitely, and every feature
  that wants to span both products (e.g. "show my generator credits inside
  the app") needs to explicitly join through the link table rather than
  relying on a single shared user id.

### Recommendation

**Option A (Supabase as the shared identity) is the technically cleaner
long-term architecture**, and is the one recommended — but explicitly
**not implemented in this pass**. It removes an entire parallel auth system
rather than adding a permanent reconciliation layer on top of two, and the
app already treats Supabase as its own identity source of truth (nothing
about Option A asks the *app* to change). The brief's own instruction —
*"Do NOT implement the full bridge unless the safest path is trivially
obvious and low-risk"* — is decisive here: it is not trivially low-risk.
Migrating live accounts' auth mechanism, re-pointing every ownership row
across five tables, and forcing a password-reset flow on every existing
generator user is real, deployment-sequenced work with a genuine rollback
cost, not a same-pass addition. What follows (§11-13) is the precise plan
for *that* migration, written so it can be executed as its own, later,
deliberate pass — never assumed or half-built here.

## 11. Existing account migration plan (for Option A, if/when chosen)

Five populations, each needs different handling — **same email in both
systems is never treated as proof of the same person** (the brief's own
explicit instruction), so every case below requires a real confirmation
step, not an automatic merge:

1. **Generator-only accounts (no matching app user at all).** On first
   sign-in after the cutover, offer "create your app account with this
   generator login" (creates a fresh Supabase user, links immediately,
   zero ambiguity — there is no existing app identity to conflict with) or
   "keep using the generator standalone" if app access was never wanted.
   Their generator-side data (projects, purchases, credits) re-points to
   the new Supabase user id created for them.
2. **App-only Supabase users (never touched the generator).** Nothing to
   migrate — they gain the *ability* to sign into the generator with their
   existing app credentials the moment the generator starts accepting
   Supabase auth. No generator-side data exists for them yet.
3. **Same email registered independently in both systems.** The highest-
   risk case, and exactly where "do not assume matching email automatically
   proves account ownership" applies. Cannot auto-merge. On first post-
   cutover sign-in, require the person to *prove* control of both: sign
   into the generator with their existing generator password, **and**
   complete a real Supabase sign-in (or an email-verification confirmation
   sent to the shared address) before the two are linked. Until they do,
   the two stay separate — a same-email collision is treated as "these
   might be two different people," never merged silently.
4. **Purchased-site owners specifically.** Because a purchase is a real
   money transaction, their migration gets an explicit, logged
   confirmation step (not just an implicit "next sign-in" flow) —
   ownership of a paid asset should never move without a clear,
   attributable action, and the migration event itself should be recorded
   (who, when, old id, new id) for support/audit purposes.
5. **Project ownership / purchase ownership / credit-ledger ownership.**
   All keyed by the generator's internal account id today; migration is a
   single backfill statement per table re-pointing `owner_id`/`account_id`
   from the old `acct_...` value to the new Supabase UUID, run inside one
   transaction per account so a partial migration (projects re-pointed but
   credits not) can never happen. The old `acct_...` id stays recorded
   (e.g. a `legacy_account_id` column) for one release cycle as an audit
   trail and rollback aid, even though nothing reads it for auth purposes
   after the cutover.

**Password migration limitation, stated plainly:** a generator account's
scrypt password hash cannot be converted into whatever Supabase Auth uses
internally. A generator-only account being migrated must set a *new*
password (or use passwordless/OAuth if the app supports it) — there is no
way to preserve "the same password keeps working" across this specific
transition, and no migration plan can promise otherwise honestly.

**Safe conflict resolution, as a rule stated once:** any time this
migration cannot prove two identities are the same person with an
explicit, both-sides-confirmed action, it leaves them separate rather than
guessing. A wrongly-*separated* pair of accounts is an inconvenience the
person can fix by linking manually later; a wrongly-*merged* pair is a
security incident (one person gaining another's purchased site, credits,
or project data). The plan is deliberately asymmetric in which mistake it
tolerates.

## 12. Future single-login UX (end state, once Option A ships)

One account, one set of credentials, usable on both `siteremade.com`
(generator) and `app.siteremade.com`. Signing in on either product signs
you in on both (shared Supabase session, shared cookie domain). Generator
projects become visible inside the app **where the app chooses to surface
them** — that's an app-side UI decision, not something the generator
dictates; the generator's job is only to make ownership queryable by the
shared user id. Purchases and app subscription status become mutually
recognizable: the app already has `workspaces.siteremade_subscription_status`
and the generator already has `accounts.app_subscription_status` (migration
0004) — once both key off the same Supabase user id, a real webhook or a
shared-read query can keep them in sync, still two separately-owned fields
per §13, never one merged column.

**Shared vs. merely linked, stated precisely:** identity (the fact of who
you are) becomes fully shared under Option A. Data does **not** become one
giant shared table — see §13. "Same login, same identity" is not the same
claim as "same data lives in one place," and the UX description above only
promises the former.

**Credits stay a generator-side entitlement**, not a shared/app-level
concept — cleaner, because credits are specifically an anti-abuse metering
mechanism for *this generator's* expensive AI/image calls; the app has its
own, separate subscription-billing relationship with the person entirely.
Conflating the two would make neither concept clean.

## 13. Database responsibility boundaries (for Option A)

- **Supabase Auth** owns identity and session: who the user is, their
  verified email, password/OAuth credential, and the JWT session mechanism
  itself. Neither the app's database nor the generator's database stores a
  password after the cutover.
- **The generator's own database** (SQLite locally / the production
  adapter in deployment) keeps owning everything it already owns today —
  projects, directions/generation history, the credits ledger, purchase
  intents/snapshots, deployments, domains — just keyed by the shared
  Supabase user id instead of a generator-minted one. This is the same
  boundary that already exists today (the generator has never stored app
  CRM data), only the *id* changes, not what table owns what.
- **The app's own database** keeps owning workspaces, leads, conversations,
  appointments, invoices, CRM automations, ad spend, and its own
  `siteremade_subscription_status` — none of that moves into or gets
  duplicated inside the generator's database, and the generator never
  gains write access to it.
- **Explicitly avoided:** one giant shared database "because auth is
  shared now." Sharing an identity provider is not a reason to also share
  a data store — the two products have genuinely different data shapes and
  different operational/scaling needs (the generator's SQLite-by-default
  posture is deliberately simple; the app's Supabase Postgres is a real
  multi-tenant CRM). A future cross-product feature (e.g. "app dashboard
  shows generator credit balance") reads across the boundary via a small,
  explicit query or webhook — never by merging schemas.

## 14. Stripe webhook readiness

`POST /api/stripe/webhook` fails closed with a `503` if `STRIPE_WEBHOOK_SECRET`
is unset — confirmed by direct read of `server.js` (`if (!STRIPE_WEBHOOK_SECRET)
return res.status(503)...`), never a fabricated/default secret. Signature
verification (`lib/purchase.js`'s `verifyStripeWebhookSignature`) follows
Stripe's documented manual-verification scheme exactly: parses `t=`/`v1=`
pairs, rejects a timestamp more than 300 seconds old (replay-window
defense), accepts if *any* `v1` signature matches (correct — Stripe sends
multiple during secret rotation), and compares with `crypto.timingSafeEqual`
(not `===`, which would leak timing information). Idempotency is real, not
assumed: `v9-deployment-safety-test.js` tests 40-49 send the identical
signed event three times and confirm exactly one purchase snapshot is ever
created. Fulfillment cannot be spoofed without possessing the real webhook
secret, which this sandbox never fabricates and never has access to. **This
sandbox cannot inspect the actual Railway production environment** — whether
a real `STRIPE_WEBHOOK_SECRET` is currently set there is unknown from here;
that is a deployment-time configuration check, not something a code audit
can confirm from inside this container.

## 15. Email verification — recommendation: not yet, current exposure is bounded

Current cost exposure per account, per day, unverified: 10 free credits ×
3-credit generation cost ≈ 3 generations/day, paid images off
(`SITEREMADE_PAID_IMAGES=false`, unchanged by this pass — see §16 below),
so each of those generations costs only planner/provider tokens, not image
spend. Combined with the new signup rate limit (8 accounts/hour/IP) and
login brute-force protection, a single unverified-email abuser is bounded
to roughly 8 accounts × 3 generations = 24 free generations/hour/IP before
hitting a wall, all at text-generation cost only. That is a real but small,
non-catastrophic exposure — not the kind of open-ended cost risk (e.g.
uncapped paid image generation, or no rate limit at all) that would justify
adding a verification-before-first-use gate and its associated UX friction
(a real cost: it loses some fraction of legitimate signups who never click
the confirmation email). **Benefit if added later:** meaningfully raises
the cost of automated mass-account creation beyond what an IP-based rate
limit alone can (an attacker would need real, distinct email addresses, not
just distinct requests) — worth revisiting if paid images are ever turned
on (§16 explicitly keeps them off in this pass) or if real abuse is observed
in production logs. **Not necessary before launch** under today's
constraints (credits capped, images off, rate limiting now in place).

## 16. CAPTCHA — recommendation: not yet, same reasoning

Rate limiting + required auth + the 10-credit/3-cost daily cap + the new
concurrency-safe reservation system together already stop the three things
CAPTCHA would otherwise be the first line of defense against: unlimited
free-tier scripted signup, unlimited scripted generation requests, and
credit overspend under concurrent abuse. None of those are open today.
CAPTCHA becomes worth its real cost (added friction for every legitimate
signer-upper, plus a new third-party dependency this brief explicitly
warns against adding without genuine need) once **traffic-scale** abuse is
actually observed that the current IP/account-keyed limits don't catch —
for example, a distributed botnet rotating both IPs and disposable emails
faster than the rate limiter's windows can track. That is a "watch
production logs after launch" trigger, not a "build before launch"
requirement.

## 17-19. Frontend UX / paid images / product-flow preservation

Covered inline: §6 above for frontend 429 UX. `SITEREMADE_PAID_IMAGES`,
the image router, model mapping, spend budget, quality routing, and
fallback logic were not touched anywhere in this pass — no file under
`lib/` related to image generation/routing was edited; only `lib/rate-
limit.js` (new) and the route *wrappers* in `server.js`/`mock-server.js`
around `/api/generate-image` changed, never its internal provider-call
logic. Every full regression suite (v9 product-flow, v9 deployment-safety,
v9 frontend-verify, v9 responsive, v10 design, v11 baseline, v12 unified-
account) re-ran clean after this pass's changes — see the final report for
the complete list and one real regression this pass caused-and-fixed along
the way (a design-QA test that legitimately creates many accounts rapidly
needed an explicit, test-only signup-rate-limit override, exactly the same
kind of deliberate override already established for credits — never a
weakened production default).

## 20. Tests

`primtest/v13-generator-hardening-test.js` — 29 named checks (39 assertions
counting sub-checks) across CREDIT CONFIG (1-4), RATE LIMITING (5-11),
CONCURRENCY (12-14, including a real simultaneous-`Promise.all` HTTP-level
overspend check, not just a sequential loop), AUTHORIZATION (15-19), SESSION
(20-22), and REGRESSION (23-29, each of the seven existing suites re-run as
a real child process, judged by real exit code). All 39/39 pass.
