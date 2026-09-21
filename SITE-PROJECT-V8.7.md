# SiteRemade generator — V8.7: production adapter integration only

V8.7 is not another feature version. It is a clean infrastructure swap
layer so the product logic already built in V8.1–V8.6 can run against
local test infrastructure today and real production infrastructure later
without being rewritten. Per the spec that drove this pass: no redesign,
no new product features, no dashboard, no unrelated UI — exactly five
things adapterized (SQLite persistence, local asset storage, sandbox
auth/session, local submission persistence, local deployment/domain
persistence), nothing else.

Continues from commit `a85ffdf` (V8.6) on `generator-v8`. V8.5 and V8.6 are
treated as frozen and regression-protected throughout — both re-verified
green at the end (part 6), including inside the new suite itself (part 5).

## 1. Inspection (before writing any code)

Read `lib/db.js`, `lib/auth.js`, `lib/project-store.js`, `lib/purchase.js`,
`lib/entitlement.js`, `lib/deployment-store.js`, `lib/export-compiler.js`,
and both `server.js`/`mock-server.js` in full. Findings:

- Every domain file called `db.prepare(...)`/`db.exec(...)` directly
  against a raw `node:sqlite` `DatabaseSync` handle obtained from
  `lib/db.js`'s `getDb(dbPath)`. SQL was scattered across five files, not
  centralized.
- Asset bytes lived at a hard-coded `path.join(__dirname, '..', 'data',
  'asset-store')` constant (`lib/project-store.js`'s `ASSET_STORE_DIR`),
  read/written directly with `fs`.
- Auth (scrypt hashing, session cookies) lived entirely in `lib/auth.js`,
  called directly by `server.js`/`mock-server.js`'s auth routes, with an
  identical 4-line `getSessionAccount` helper hand-copied in both files.
- No production credentials, no `SUPABASE_*` env vars, and no
  `@supabase/supabase-js` anywhere in this repo or sandbox — confirmed by
  grep and by attempting `npm install @supabase/supabase-js` (blocked, same
  standing constraint documented since V8.5 part 1).
- The real, separate SiteRemade ops app (a different repository this
  engagement has previously inspected under an earlier, since-superseded
  task) already runs on Supabase, with `SUPABASE_URL`/
  `SUPABASE_PUBLISHABLE_KEY`/`SUPABASE_SECRET_KEY` naming and its own
  Supabase Auth-based identity system — structurally different from this
  generator's local scrypt/session accounts, not an interchangeable one.

## 2. Design: thread `db`, don't touch call sites

The central risk in this pass was behavioral drift in frozen V8.1–V8.6
logic. The resolution: `db` stays an explicit parameter threaded through
every domain function exactly as before (`fn(db, ...args)`) — only what it
unlocks internally changed, from a raw SQLite handle to a namespaced
adapter object (`db.accounts.*`, `db.sessions.*`, `db.projects.*`,
`db.assetBlobs.*`, `db.purchaseIntents.*`, `db.entitlements.*`,
`db.deployments.*`, `db.domains.*`, plus `db.transaction(fn)`). Every SQL
statement moved **verbatim** — same text, same semantics — into
`lib/adapters/sqlite-database-adapter.js`. This meant a single call-site
change per server file (`getDb(...)` → `getDatabaseAdapter(...)`), zero
changes to the ~20 call sites that already pass `db` into domain functions.

The AssetStore is deliberately **not** threaded the same way — it's a
lazily-initialized singleton (`getAssetStore()`), imported directly by
`lib/project-store.js` and `lib/export-compiler.js`, mirroring how
`lib/db.js`'s own `nowIso` is already imported directly everywhere rather
than passed as a parameter. That kept `server.js`/`mock-server.js`
completely untouched for the asset store.

Content-type metadata is deliberately **not** duplicated into the
AssetStore — asset bytes live there (content-addressed by sha256); the
content type stays in the DatabaseAdapter's `asset_blobs` table, the one
place it already lived. One source of truth, not two.

## 3. What was built

```
lib/adapters/
  sqlite-database-adapter.js      the 'local' DatabaseAdapter -- every V8.1-V8.6 SQL
                                   statement, moved verbatim, grouped by namespace
  production-database-adapter.js  the 'production' contract -- fails closed (part 4)
  database-adapter.js             selector: SITEREMADE_BACKEND local|production
  local-asset-store.js            the 'local' AssetStore -- content-addressed fs storage,
                                   extracted unchanged from lib/project-store.js
  production-asset-store.js       the 'production' AssetStore contract -- fails closed
  asset-store.js                  selector (singleton, not threaded -- see part 2)
  local-auth-provider.js          thin wrapper around lib/auth.js (unchanged scrypt/session)
  production-auth-provider.js     fails closed immediately -- architectural gap, not a
                                   credentials gap (see part 4)
  auth-provider.js                selector
```

Modified (extraction only — no SQL text or business-logic semantics
changed): `lib/auth.js`, `lib/project-store.js`, `lib/purchase.js`,
`lib/entitlement.js`, `lib/deployment-store.js`, `lib/export-compiler.js`,
`server.js`, `mock-server.js`.

**Ownership, optimistic-revision checks, purchase states, deployment
records, domain records, and entitlement reservations are logically
unchanged** — every one of those behaviors is re-verified in part 5/6
running through the new adapter, not merely asserted.

Backward compatibility: `lib/project-store.js` still exports
`ASSET_STORE_DIR` (the already-shipped `v8-6-deployment-test.js` references
it directly in two places), now as a live `Object.defineProperty` getter
forwarding to `getAssetStore().dir` instead of a static constant.

### SubmissionProvider (exported sites)

Out of the five things in scope, submission persistence is the one that
lives inside a **generated artifact**, not this repo's own server —
`lib/export-compiler.js`'s `buildServerJs()` produces the standalone
`server.js` shipped inside a server-required export. That generated file
now has its own `SubmissionProvider` selection, chosen at **runtime by
whoever self-hosts the export** (`SUBMISSION_BACKEND` env var), not baked
in at export/compile time:

- `local` (default) — unchanged V8.6 behavior: validate, write to
  `data/submissions.jsonl`.
- `webhook` — a **real, working** production path, not a stub: a genuine
  HTTP(S) POST using only Node's core `http`/`https` (the export has zero
  npm dependencies), to `SUBMISSION_WEBHOOK_URL`, optionally HMAC-signed
  with `SUBMISSION_WEBHOOK_SECRET`. Reports success to the visitor only
  once the endpoint actually answers 2xx; a network failure or non-2xx
  response is a real, reported failure (502), never a fabricated "Thanks".
  Fails closed at startup if `SUBMISSION_BACKEND=webhook` is set without
  `SUBMISSION_WEBHOOK_URL` — refuses to listen at all rather than silently
  falling back to local file storage.

The export manifest (`export-manifest.json`) documents this as a runtime
choice (`manifest.submissionBackend`), not a fixed compile-time claim.

## 4. Fail-closed discipline (never silently falls back to local)

`SITEREMADE_BACKEND` is read independently by all three adapters
(database, assets, auth) and defaults to `local`. In `production` mode:

- **Database / assets**: missing `SUPABASE_URL`/`SUPABASE_SECRET_KEY`
  (plus `SITEREMADE_ASSET_BUCKET` for assets) throws immediately, naming
  exactly which variables are missing. If config is present but
  `@supabase/supabase-js` isn't installed (true in this sandbox — npm
  install is blocked), it still fails closed rather than faking a
  connection. If both are present, adapter selection succeeds and returns
  an object with the full documented method surface — every method
  currently a `notImplemented(name)` stub, not a working query. This is a
  real, checkable contract: domain code needs zero changes to run against
  a real implementation later, because it only ever calls named methods,
  never raw SQL.
- **Auth**: fails closed **immediately at selection time**, before
  checking any env var, because the gap here isn't "credentials present
  but queries unimplemented" — it's architectural. The real SiteRemade
  app's auth system (Supabase Auth) is a genuinely different identity
  system from this generator's local scrypt accounts. Setting
  `SUPABASE_URL`/`SUPABASE_SECRET_KEY` would not make them the same
  system. Unifying them needs one explicit product decision this pass
  does not make on its own (account linking, or migrating this generator
  onto the app's Supabase project) — see `PRODUCTION-ADAPTERS.md`.

No adapter ever falls back to `local` when `production` is selected and
its config is incomplete — verified directly in
`v8-7-production-adapter-test.js` (checks A5–A10, C4–C5b).

## 5. New test coverage — `v8-7-production-adapter-test.js`

48 checks, 4 sections:

- **A1–A10** — adapter selection: local is the honest default (kind
  `'sqlite'`, full method surface present); an unrecognized
  `SITEREMADE_BACKEND` value throws rather than defaulting to anything;
  production mode fails closed on missing config for both database and
  assets, naming the exact missing variables; auth fails closed
  immediately regardless of config; credentials-present-but-package-
  missing still fails closed rather than faking a connection.
- **B1–B12** — V8.1–V8.6 behavior unchanged through the new adapter:
  entitlement reserve/commit/release at the lib level (including the
  adapter's shared `transaction()` primitive replacing the old hand-rolled
  `BEGIN IMMEDIATE`); ownership scoping, purchase-state gating, and
  optimistic-revision-conflict detection over real HTTP against
  `mock-server.js`; export producing a real sha256 artifact hash;
  deployment and domain records read back correctly; AssetStore
  put/get/exists/dedup byte-identical and correctly content-addressed.
- **C1–C11b** — the exported-site SubmissionProvider: manifest honesty,
  local-backend behavior unchanged and correctly bound to
  project/artifactHash/revision, webhook-missing-config fails closed with
  no local fallback, a **real** webhook delivery received and HMAC-verified
  by an actual receiver process, a failing webhook honestly reported as a
  502 (never a fake success), and no secret value ever embedded in
  generated source.
- **D1–D2** — the full V8.6 (67 checks) and V8.5 (87 checks, including its
  real Playwright browser section) suites re-run as literal subprocesses
  from inside this file and asserted `ALL PASS` — not just re-run
  separately, but gated by this suite's own pass/fail count.

Result: **ALL PASS** (48/48), with V8.6 and V8.5 both reporting their own
internal `ALL PASS` inside D1/D2.

## 6. Full verification

- `node --check` on every changed/new file (`lib/adapters/*.js`,
  `lib/auth.js`, `lib/project-store.js`, `lib/purchase.js`,
  `lib/entitlement.js`, `lib/deployment-store.js`,
  `lib/export-compiler.js`, `server.js`, plus `mock-server.js` and both new
  test files) — all clean.
- `git diff --check` — clean, no whitespace errors.
- `v8-7-production-adapter-test.js` — **ALL PASS** (48/48).
- `v8-6-deployment-test.js` — **ALL PASS** (67/67), run both standalone and
  again inside the new suite (D1).
- `v8-5-ownership-test.js` — **ALL PASS** (87/87, real Playwright), run
  both standalone and again inside the new suite (D2).
- Full prior regression, run standalone: `v5-lead-test.js`,
  `v5-serialize-test.js`, `v5-serialize-test2.js`, `v5-asset-test2.js`,
  `v8-1-directions-test.js`, `v8-1-1-concurrency-test.js`,
  `v8-1-2-rollback-test.js`, `v8-2-pages-test.js`, `v8-3-editor-test.js`,
  `v8-4-functionality-test.js`, `v7-1-image-gen-test.js` — all green.
  `v5-asset-test.js` and `v8-claude-plan-test.js` reproduce their
  already-documented, already-formally-confirmed pre-existing flakes
  identically (a Playwright element-detachment race in the former, a
  `/api/plan-website` call-count race in the latter) — neither test touches
  anything this pass changed.

## 7. Migrations

**None added.** This pass is a pure code-structure refactor — SQL text
moved verbatim, not rewritten — so no schema change was needed. Confirmed
directly: `migrations/0001_init.sql` and `migrations/0002_deployments.sql`
already fully describe the schema `lib/adapters/sqlite-database-adapter.js`
runs against, and the same two files are what a real production
implementation would map onto (see `PRODUCTION-ADAPTERS.md`). If a real
Supabase implementation later needs adapter-only metadata, that's an
additive migration at that time, not something to add speculatively here.

## 8. What real production integration was actually available

**None** — confirmed by inspection, not assumed. No `SUPABASE_URL`/
`SUPABASE_SECRET_KEY`/`SITEREMADE_ASSET_BUCKET` configured anywhere in this
repo or sandbox; `@supabase/supabase-js` not installed; `npm install`
confirmed blocked. Per this pass's own stop condition, that means: build
the adapter contract/config path cleanly, keep local fully functional,
document exactly what's needed — not fake a connection or attempt a real
Postgres/Supabase integration this sandbox can't verify. See
`PRODUCTION-ADAPTERS.md` for the full, itemized checklist (what's
configuration-only vs. what needs an explicit product decision), which
every adapter file also points to directly.

**One piece is genuinely live today, not just contracted**: the
exported-site `SUBMISSION_BACKEND=webhook` provider. It needs no
credentials this repo doesn't already have — it's a real HTTP(S) POST — so
it's usable by any customer who self-hosts an export right now.

## 9. Delivery

- Files changed: 7 modified (`lib/auth.js`, `lib/project-store.js`,
  `lib/purchase.js`, `lib/entitlement.js`, `lib/deployment-store.js`,
  `lib/export-compiler.js`, `server.js`), 9 new
  (`lib/adapters/{sqlite-database-adapter,production-database-adapter,
  database-adapter,local-asset-store,production-asset-store,asset-store,
  local-auth-provider,production-auth-provider,auth-provider}.js`), plus
  `PRODUCTION-ADAPTERS.md` and this file. (`mock-server.js` and the new
  `v8-7-production-adapter-test.js` live outside this git repo, in the
  shared scratchpad `landing/` directory alongside every other version's
  test harness — same convention as V8.5/V8.6.)
- Migrations: none (part 7).
- Tests: `v8-7-production-adapter-test.js` — 48/48 PASS. V8.6 — 67/67. V8.5
  — 87/87. Full prior regression green (part 6).
- No production deploy performed. `origin/main` unchanged by this pass.
- Commit: see below, on `generator-v8`, one commit ahead of `a85ffdf`.
- A verified git bundle (`git bundle verify`, plus a real clone + checkout
  dry run) is included with delivery, same workflow as V8.5/V8.6.
