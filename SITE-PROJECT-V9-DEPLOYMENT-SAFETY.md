# V9 — Production readiness / deployment safety pass

Scope, verbatim from the brief that drove this: make the current system
*safe to deploy to Railway*. No new product features. Everything below is
deployment hardening on top of the already-complete V9 product flow and the
signed-in daily-credit fix (`51f949d`).

## 1. Production persistence audit

**Where SQLite actually lives today, and why it's a real risk on Railway
without more config.**

`SITEREMADE_BACKEND` (default `local`) selects between two completely
different adapter stacks, read once at startup by
`lib/adapters/database-adapter.js`, `lib/adapters/auth-provider.js`, and
`lib/adapters/asset-store.js` together — never partially:

- **`local`** (the default, and the only one that actually runs today): a
  real `node:sqlite` file, local-scrypt accounts/sessions, and local
  filesystem storage for image bytes and compiled export .zips.
- **`production`**: a Supabase-backed contract. **Not usable today** —
  confirmed by direct inspection, not assumption:
  - `lib/adapters/production-auth-provider.js` throws immediately and
    unconditionally at selection time. This isn't a missing-credential
    gap; it's architectural — the real SiteRemade auth system is Supabase
    Auth in a *separate* app, a structurally different identity system
    from this generator's local scrypt/session accounts, and unifying
    them needs an explicit product decision (account linking, or a full
    migration) that this pass does not make on its own. See
    `PRODUCTION-ADAPTERS.md`.
  - `lib/adapters/production-database-adapter.js` fails closed if
    `SUPABASE_URL`/`SUPABASE_SECRET_KEY` are missing, and even with them
    present, every method is a `notImplemented()` stub — `@supabase/
    supabase-js` was never installed (this sandbox blocks `npm install`)
    and no real Postgres queries were ever written.

  **This means `SITEREMADE_BACKEND=production` cannot serve a single real
  request today.** Setting it on Railway would not "switch to a more
  durable backend" — it would make the app refuse to start at all
  (auth throws at selection, before any route is reachable). The only
  backend that can actually run in production right now is `local`.

**So the real question is: is `local`'s SQLite file durable on Railway?**
Not by default. Three separate on-disk locations hold real customer data,
and **all three defaulted to a path inside this app's own container
filesystem** before this pass:

| What | Env var | Pre-V9 default | Holds |
|---|---|---|---|
| SQLite database | `SITEREMADE_DB_PATH` | `<repo>/data/siteremade.db` | accounts, sessions, projects, daily credits, purchase snapshots, purchase intents, deployment records, entitlements |
| Image bytes | `SITEREMADE_ASSET_STORE_DIR` | `<repo>/data/asset-store` | uploaded/generated image blobs (`asset_blobs`), content-addressed by sha256 |
| Export artifacts | `SITEREMADE_EXPORTS_DIR` | `<repo>/data/exports` *(was hardcoded — not configurable at all until this pass)* | compiled `.zip` files behind every My Websites re-download link |

Railway (like most container PaaS) gives a service **ephemeral**
filesystem storage: it survives a plain in-place restart, but is wiped and
replaced on every redeploy (new build/image), and isn't guaranteed to
survive the underlying host moving the container either. Without a
persistent Volume, a customer's account, their purchase, and their
purchased download would all disappear on the next `git push` deploy.

**The fix in this pass:**

1. `SITEREMADE_DB_PATH` and `SITEREMADE_ASSET_STORE_DIR` were already
   env-configurable (V8.5/V8.7) — confirmed, unchanged.
2. `SITEREMADE_EXPORTS_DIR` was **not** configurable at all — hardcoded in
   `server.js`. It now reads `process.env.SITEREMADE_EXPORTS_DIR`, falling
   back to the old in-repo path only when unset (so local dev / the test
   harness are unaffected).
3. **A new fail-loud startup guard** (`lib/deployment-safety.js`, wired
   into `server.js` before the database is even opened): if this process
   looks like a real production deployment (`NODE_ENV=production`, or any
   of Railway's own auto-injected `RAILWAY_ENVIRONMENT`/
   `RAILWAY_ENVIRONMENT_NAME`/`RAILWAY_PROJECT_ID` variables) **and** the
   `local` backend is in use (the default), it requires **all three** of
   the paths above to be explicitly set. If any are missing, it prints
   exactly which ones and calls `process.exit(1)` — it never falls back to
   the in-container default and continues anyway. There is no way for this
   process to verify from the inside that a configured path is really
   backed by a mounted Volume, so instead of guessing, it requires the
   operator to have made that decision explicitly for every path that
   holds real data.

   `SITEREMADE_BACKEND=production` is deliberately **not** re-checked by
   this guard — it already fails closed entirely on its own (see above),
   independent of and before this check would ever matter.

**No new database product was introduced.** SQLite-on-a-persistent-volume
is the smallest change that makes what's already shipped durable; standing
up real Supabase infrastructure is a separate, larger piece of work this
pass didn't need and wasn't asked to do.

## 2. Exact DB path / backend behavior

- Default (no env set): `SITEREMADE_BACKEND` is `local`; `SITEREMADE_DB_PATH`
  resolves to `<repo>/data/siteremade.db` (a real file, migrations run
  automatically on open — see §3). This is fine for local development and
  the test harness; the new guard refuses to let it happen in what looks
  like a production deployment.
- To deploy: set `SITEREMADE_DB_PATH`, `SITEREMADE_ASSET_STORE_DIR`, and
  `SITEREMADE_EXPORTS_DIR` to paths inside a mounted Railway Volume (see
  §3 below for the exact steps). `SITEREMADE_BACKEND` should stay unset
  (or explicitly `local`) — `production` cannot run at all right now (§1).
- On every redeploy, `lib/db.js`'s `runMigrations` re-scans
  `migrations/*.sql` against the `schema_migrations` table already in the
  (now-durable) database file and applies only what's new — see §5 for the
  smoke test proving this is a true no-op against an already-migrated
  database, and proving a failed migration rolls back cleanly rather than
  corrupting anything.

## 3. Railway configuration requirements

**Step 1 — attach a Volume.** In the Railway service's Settings →
Volumes, add a volume and mount it at `/data`. This is the only step that
makes anything durable; every env var below just tells the app where that
volume is.

**Step 2 — environment variables.** Never printing secret *values* below,
only names and what they gate.

### REQUIRED — the app will not start, or core product features will not
work, without these

| Variable | Purpose |
|---|---|
| `SITEREMADE_DB_PATH` | e.g. `/data/siteremade.db`. Durable SQLite file. **Required by the new startup guard** once `NODE_ENV=production` is set. |
| `SITEREMADE_ASSET_STORE_DIR` | e.g. `/data/asset-store`. Durable image storage. **Required by the startup guard.** |
| `SITEREMADE_EXPORTS_DIR` | e.g. `/data/exports`. Durable export .zip storage. **Required by the startup guard.** |
| `NODE_ENV` | Set to `production`. Enables the startup guard above and Secure cookies (see §4). Railway does not set this for you. |
| `STRIPE_SECRET_KEY` | Server-side Stripe API key. Without it, `/api/checkout` returns a real error and no purchase can ever start. |
| `STRIPE_WEBHOOK_SECRET` | Verifies Stripe's webhook signature. Without it, `/api/stripe/webhook` returns 503 and **no purchase ever gets fulfilled**, even if checkout itself succeeded. |
| `ANTHROPIC_API_KEY` | Enables AI-planned generation (the core product experience). Without it, `/api/plan-website` honestly reports `configured:false` and the app falls back to the deterministic engine — the app still runs, but this is not the intended product experience for a real launch. |
| `PORT` | Railway sets this automatically; the app already reads it (`process.env.PORT`). No action needed, listed for completeness. |

### OPTIONAL — real features degrade honestly (never fake data) if absent

| Variable | Purpose | Behavior if unset |
|---|---|---|
| `RESEND_API_KEY` | Sends lead-form and purchase-confirmation emails. | Emails silently don't send (`reason: 'not_configured'`); nothing else breaks. |
| `OPENAI_API_KEY` + `SITEREMADE_PAID_IMAGES=true` | Paid AI image generation. Both must be set together — `SITEREMADE_PAID_IMAGES` is a deliberate double opt-in, never inferred from the key alone. | Image generation reports itself unconfigured; sites still render with the existing deterministic imagery. |
| `SITEREMADE_IMAGE_MODEL_SUPPORT`, `SITEREMADE_IMAGE_MODEL_PREMIUM` | Which OpenAI image models to call. | Sensible defaults already in code. |
| `SITEREMADE_IMAGE_COST_SUPPORT_{LOW,MEDIUM,HIGH}_USD`, `SITEREMADE_IMAGE_COST_PREMIUM_{LOW,MEDIUM,HIGH}_USD`, `SITEREMADE_IMAGE_LANDSCAPE_COST_MULTIPLIER`, `SITEREMADE_IMAGE_BUDGET_USD` | Tuning knobs for the image cost/budget engine. | Defaults already in code, documented inline in `server.js`. |
| `SITEREMADE_DAILY_FREE_CREDITS` | Daily credit allowance per signed-in account (default 10 = 3 full generations/day, see `51f949d`'s own math comment in `server.js`). | Default of 10 applies. |
| `SITEREMADE_CREDIT_COST_CHEAP`, `SITEREMADE_CREDIT_COST_STANDARD` | Per-action-class credit cost. | Defaults (1 and 3) apply. |
| `SITEREMADE_ADMIN_TOKEN` | Gates the admin/observability routes (`x-admin-token` header). | Those routes are **fully inaccessible** (fail-closed, not open) until this is set — set it for a real deployment if the admin routes are used. |
| `SITEREMADE_GUIDE_UPLOAD_URL`, `SITEREMADE_GUIDE_DOMAIN_URL`, `SITEREMADE_GUIDE_EDIT_URL`, `SITEREMADE_GUIDE_PUBLISH_URL`, `SITEREMADE_GUIDE_FILES_URL` | Post-purchase handoff walkthrough video links (`lib/handoff-resources.js`). | Each stays honestly `null` (never fabricated) until configured. |
| `ANTHROPIC_MODEL` | Which Claude model to call for planning. | Defaults to `claude-sonnet-5`. |

**Not applicable to this app's own Railway service:** `SUBMISSION_BACKEND`,
`SUBMISSION_WEBHOOK_URL`, `SUBMISSION_WEBHOOK_SECRET` — these configure
the *exported customer site's own generated server* (a separate,
independently-deployed package), not this generator. See
`PRODUCTION-ADAPTERS.md`'s "Submissions" section.

**Hosting affiliate URLs** (`lib/hosting.js`'s `affiliateUrl` field) are
not env-configurable at all yet — they're hardcoded `null` in source,
deliberately never fabricated. Wiring them to real affiliate links is a
product decision out of scope for this hardening pass.

## 4. Cookie-security changes

`lib/auth.js`'s `sessionCookieHeader` previously never set `Secure` —
every session cookie was sendable over plain HTTP even in a deployment
that only ever serves HTTPS.

- `sessionCookieHeader(token, { clear, secure })` now accepts a `secure`
  option; when true, `Secure` is appended alongside the unchanged
  `HttpOnly`/`SameSite=Lax` attributes. Default is `false` — every
  pre-existing caller that doesn't pass it (including `mock-server.js`'s
  test harness, which always runs over plain `http://localhost`) is
  unaffected.
- `server.js` now computes `cookieShouldBeSecure(req)` per request —
  `req.secure` (accurate because of `trust proxy`, see below) **or**
  `NODE_ENV === 'production'` as a second, request-independent signal —
  and passes it into every `Set-Cookie` call site: the anonymous
  trial-tracking cookie, and sign-up/sign-in/sign-out's session cookie.
  Never secure on a plain local dev server, so `npm start` locally is
  unaffected.
- `app.set('trust proxy', 1)` was added. Railway (like most PaaS)
  terminates TLS at its own edge and proxies to this container over plain
  HTTP — without `trust proxy`, Express would see only that internal
  plain-HTTP hop. This one line fixes **two** things at once:
  1. `req.secure` now correctly reflects the real external HTTPS scheme
     (needed for Secure cookies above).
  2. **A real bug this pass found and fixed as a side effect**:
     `requireSameOrigin` (the CSRF/same-origin check on every
     state-changing authenticated route) computes
     `` `${req.protocol}://${req.get('host')}` `` as the expected origin.
     Without `trust proxy`, `req.protocol` would read `http` even though
     the browser's real `Origin` header says `https://...` — every
     legitimate same-origin request would have been refused (403) the
     moment this app was ever deployed behind Railway's proxy. `trust
     proxy` fixes `req.protocol` too, so this is a correctness fix, not a
     security loosening.
- **Nothing about CSRF/same-origin protection was weakened.**
  `requireSameOrigin`'s own check is untouched; the trust-proxy change
  makes it work correctly in production rather than refusing everything.
- Session expiration (`SESSION_TTL_MS`, 30 days) and the token/hashing
  scheme are completely unchanged.

## 5. Migration validation

Verified against the **real** migration runner (`lib/db.js`'s
`runMigrations`, via `getDatabaseAdapter`/`resetDatabaseAdapter`), not a
reimplementation:

- **Idempotent through the runner**: `schema_migrations` tracks applied
  filenames; re-opening an already-fully-migrated database (simulating a
  redeploy) applies nothing and errors on nothing.
- **Existing V8 data remains valid**: a hand-built fixture with *only*
  `0001_init.sql` + `0002_deployments.sql` applied (never touching the
  real `migrations/` directory), carrying a genuinely legacy account and a
  project already marked `'purchased'` the old way, was handed to the real
  runner. `0003_credits_and_snapshots.sql` applied cleanly on top; every
  pre-existing row (account, purchased project) is intact and readable
  afterward.
- **Legacy purchased projects still backfill snapshots correctly**: on
  that same migrated-from-legacy fixture, `purchase.js`'s real
  `ensureSnapshotForOwnedProject` was called directly — it creates a real
  snapshot for the legacy purchased project on first access, and a second
  call is a true no-op (same snapshot, not a duplicate).
- **Redeploying does not rerun destructively**: proven directly (see
  above) — re-running the migration runner against an already-migrated
  file is a no-op.
- **Rollback/failure behavior does not corrupt the DB**: a deliberately
  broken extra migration file (sorted to run *after* 0001-0003, always
  cleaned up in a `finally` block, never left in the repo) was handed to
  the real runner against a throwaway database. It threw, naming exactly
  which file failed; `schema_migrations` recorded the three real
  migrations that succeeded before it and **not** the broken one; the
  broken migration's own partial `CREATE TABLE` (which ran before its
  invalid statement, in the same transaction) was rolled back too — proof
  that `BEGIN`/`COMMIT`/`ROLLBACK` wraps each file as a whole, never
  commits half a migration; and the earlier, already-committed schema
  (`accounts`, etc.) stayed intact and queryable.
- A migration smoke test now exists as an automated regression:
  `primtest/v9-deployment-safety-test.js` sections 1-2 (checks 25-39).

## 6. Purchase/credit durability validation

**Purchase / webhook idempotency** (`primtest/v9-deployment-safety-test.js`
section 3, checks 40-49), over real HTTP against `mock-server.js`, which
calls the exact same real `lib/purchase.js`:

- The identical signed Stripe webhook event, delivered three times in a
  row (simulating Stripe's own documented at-least-once redelivery),
  returns 200 every time and produces **exactly one** purchase snapshot —
  proven both by snapshot-id equality across retries and by a single My
  Websites entry. This holds because `fulfillBySessionId` checks
  `intent.status === 'fulfilled'` up front (an already-fulfilled intent is
  a pure no-op with no transaction even started), backed by a real unique
  index on `purchase_snapshots(project_id)` as defense in depth, and
  because the whole webhook handler runs synchronously up to and including
  the fulfillment call — Node's single-threaded event loop serializes
  concurrent deliveries the same way `lib/credits.js`/`lib/entitlement.js`
  already rely on elsewhere in this codebase.
- The purchase snapshot survives a live-draft edit made after purchase
  (bound revision unchanged), and export still compiles only from that
  bound revision, never the edited draft — reconfirming
  `v9-product-flow-test.js`'s own coverage as part of this pass's sign-off.

**Credits durability** (`primtest/v9-deployment-safety-test.js` section 4,
checks 50-57), against a real file-backed adapter:

- **Restart/reopen does not restore used credits**: reserve+commit 3
  credits, force-close and reopen the adapter against the *same* durable
  file (`resetDatabaseAdapter`, which more faithfully simulates a process
  restart than reusing the same in-process object would), and the spend
  is unchanged after reopening.
- **UTC rollover renews correctly**: already covered end-to-end through a
  real HTTP round trip in `v9-product-flow-test.js` (checks 16-20, added
  alongside the `51f949d` credit-architecture fix); this pass's own
  restart test additionally confirms the *same* durable row behaves
  identically pre/post a simulated restart.
- **Reserved credits cannot remain permanently stranded** after
  failed/crashed provider work: every route's own try/catch already
  releases on a caught failure, but a genuine process crash *between*
  reserve and commit/release was the one gap not otherwise provable. A
  reservation left open with no commit or release ever following it is
  bounded to **at most the rest of that one UTC day** — the next day's
  rollover (`ensureRow`'s existing `last_grant_date` check) always resets
  `reserved` to 0 regardless, so a crash can never cost an account more
  than one day's worth of that reservation, and never permanently.
- **Concurrent reservations cannot overspend in the current single-replica
  deployment**: proven directly at the `lib/credits.js` level (every
  exported function runs fully synchronously — see that file's own header
  comment) and already proven at the HTTP level in
  `v8-5-ownership-test.js`'s section 11. This guarantee is specifically
  scoped to a single replica — see "known remaining risks" below.

The anonymous abuse-protection ledger stays exactly where it already was:
unrelated to credits, in-memory, and out of scope for durable-data
concerns (it was never meant to be durable — see `server.js`'s own
comment on `directionsLedger`).

## 7. Files changed this pass

- `server.js` — deployment-safety guard wired in before the database
  opens; `trust proxy`; `cookieShouldBeSecure`; `Secure` on the anon
  cookie and all three session-cookie call sites; `SITEREMADE_EXPORTS_DIR`
  made env-configurable.
- `lib/auth.js` — `sessionCookieHeader` accepts `secure`.
- `lib/deployment-safety.js` — **new**. Pure, testable persistence-safety
  assessment (`assessPersistenceSafety`/`isProductionRuntime`/
  `backendKind`) and the fatal-startup message formatter.
- `primtest/v9-deployment-safety-test.js` — **new**. 57 checks: guard unit
  tests, cookie unit tests, server.js source-wiring checks, migration
  smoke test against a pre-V9 fixture, redeploy/rollback safety, purchase/
  webhook idempotency, credits restart/stranding/concurrency durability.

No generator/provider/image-routing/UI-redesign code was touched. No new
product features were added.

## 8. Known remaining deployment risks (not fixed by this pass — scoped out)

- **Single-replica assumption.** Every concurrency guarantee here (credits,
  entitlement, purchase fulfillment) relies on Node's single-threaded
  event loop serializing synchronous `node:sqlite` calls *within one
  process*. Running more than one Railway replica of this service against
  the same SQLite file is a real, un-tested risk (SQLite's own file
  locking would serialize writes at the OS level, but the application-level
  "check then act" reasoning this pass validated was specifically scoped
  to one process). Do not scale this service horizontally without
  revisiting this.
- **`SITEREMADE_BACKEND=production` is not a working fallback.** As
  documented in §1, it cannot serve a single request today. If Railway's
  volume-backed SQLite ever becomes insufficient, that's a real, separate
  migration (implementing the Supabase adapters for real, and making the
  auth account-linking/migration decision) — not a same-day flip. This
  pass didn't build that, on purpose ("do not migrate to a whole new
  database product unless genuinely necessary").
- **The anonymous abuse-protection ledger is still in-memory**, resetting
  on every restart/redeploy — this was already true before this pass and
  is an accepted, documented limitation (it protects against casual
  trial-limit abuse, not a durability guarantee — see `server.js`'s own
  comment on `directionsLedger`). Not customer data, out of this pass's
  "purchased-site/account data" scope.
- **This guard cannot verify a configured path is REALLY on a mounted
  Volume** — only that an operator explicitly set it to something. A
  misconfigured `SITEREMADE_DB_PATH` that still happens to point inside
  the ephemeral container (e.g. a typo, or a Volume that failed to mount)
  would pass this check and still lose data on redeploy. There is no way
  to detect that from inside the process; verify the Volume is actually
  mounted and writable as a manual deployment step.
- **Hosting affiliate URLs remain unconfigured** (hardcoded `null`) —
  wiring them to real env vars is a product decision, intentionally out of
  scope here.
