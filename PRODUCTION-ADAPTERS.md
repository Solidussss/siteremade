# V8.7 — Production adapter reference

This document is the checklist the adapter files themselves (`lib/adapters/*.js`)
point to. It exists so "what would it take to actually run this in
production" has one place to read, instead of being scattered across
source comments.

V8.7's own scope, verbatim from the spec that drove it: *"a clean
infrastructure swap layer so the product logic already built in V8.1–V8.6
can run against local test infrastructure today and real production
infrastructure later without being rewritten."* Nothing below is a
redesign of the product; it's what's needed to flip `SITEREMADE_BACKEND`
from `local` to `production` for real.

## The switch

```
SITEREMADE_BACKEND=local        # default. SQLite + local filesystem assets + local scrypt auth.
SITEREMADE_BACKEND=production   # fails closed if required config below is missing.
```

Read once, independently, by `lib/adapters/database-adapter.js`,
`lib/adapters/asset-store.js`, and `lib/adapters/auth-provider.js`. There is
no partial mode — the three adapters are selected together by the same
variable, so a deployment can't end up with (say) a production database but
local-filesystem assets by accident.

**Fail-closed discipline**: if `SITEREMADE_BACKEND=production` and required
config is missing, every adapter throws immediately at selection time
(before any query runs), naming exactly which variable is missing. None of
the three ever falls back to the local implementation. This was verified by
`v8-7-production-adapter-test.js` (see "Local backend still works exactly
as before" through "no silent fallback from production to local").

## Database (`lib/adapters/production-database-adapter.js`)

| Needed | Status |
|---|---|
| `SUPABASE_URL` | Not configured in this sandbox |
| `SUPABASE_SECRET_KEY` | Not configured in this sandbox |
| `@supabase/supabase-js` installed | Not installed — `npm install` is blocked in this sandbox (see `SITE-PROJECT-V8.5.md` part 1) |

With both env vars present and the package installed, adapter selection
succeeds and returns an object with the full method surface domain code
calls (`accounts.*`, `sessions.*`, `projects.*`, `assetBlobs.*`,
`purchaseIntents.*`, `entitlements.*`, `deployments.*`, `domains.*`, plus
`transaction(fn)`) — every method today throws `notImplemented(name)`. A
real implementation fills in each method with the equivalent
`supabaseModule.createClient(...).from(table)...` call; **no caller
(`lib/auth.js`, `lib/project-store.js`, `lib/purchase.js`,
`lib/entitlement.js`, `lib/deployment-store.js`) needs to change**, since
they only ever call these named methods, never raw SQL.

Env var names deliberately match the real, separate SiteRemade ops app's
own `lib/context.js` naming, so a deployment that shares a Supabase project
with that app doesn't have to reconcile two schemes.

Schema: `migrations/0001_init.sql` and `migrations/0002_deployments.sql`
already document the intended Postgres dialect inline (see each file's own
`PG:` comments). V8.7 added no new migration — this pass is a pure
code-structure refactor (SQL text moved verbatim into
`lib/adapters/sqlite-database-adapter.js`, not rewritten), so the schema a
production implementation needs is exactly what those two files already
describe. If a real Supabase implementation later needs adapter-only
metadata (e.g. a `sync cursor` column), that would be a new, additive
migration at that time — not something this pass invented speculatively.

## Assets (`lib/adapters/production-asset-store.js`)

| Needed | Status |
|---|---|
| `SUPABASE_URL`, `SUPABASE_SECRET_KEY` | Same as above (shared with the database adapter — one service-role key covers Storage too) |
| `SITEREMADE_ASSET_BUCKET` | Not configured |
| `@supabase/supabase-js` installed | Not installed |

Natural real target: Supabase Storage, one bucket, objects addressed by
their own content hash (`put(buffer)` → upload as `${hash}`, `get(hash)` →
download, `exists`/`delete`/`stat` → the matching Storage object-metadata
calls). Content-type is deliberately NOT tracked here — it stays in the
database adapter's `asset_blobs` table, the same single source of truth the
local implementation already uses.

## Auth (`lib/adapters/production-auth-provider.js`)

**Not a credentials gap — an architectural one.** Confirmed by direct
inspection of the real, separate SiteRemade ops app repository: its auth
system is Supabase Auth (its own `sr_access`/`sr_refresh` HttpOnly cookies,
Supabase-issued JWTs, a `profiles` table keyed by the Supabase Auth user
id) — a structurally different identity system from this generator's local
scrypt/session accounts, not an interchangeable one. There is no shared
user table and no existing bridge.

`getProductionAuthProvider()` therefore throws immediately, at selection
time, with no partial/lazy state — setting `SUPABASE_URL`/
`SUPABASE_SECRET_KEY` alone would NOT make local and production accounts
the same identity system, so there is no honest "config-only" fix here.

Unifying them for real needs one explicit product decision this pass does
not make on its own:
- **(a) Account linking** — a generator account and an app account get
  explicitly connected by the person (never assumed identical because the
  email matches), or
- **(b) Migration** — retire local scrypt accounts and have this generator
  authenticate directly against the same Supabase project the app uses.

Either is its own real, separate piece of work.

## Submissions (exported sites — `lib/export-compiler.js`'s `buildServerJs`)

Separate from the three adapters above: this is the SubmissionProvider
inside the standalone package a customer's SITE exports as, not this repo's
own server. It already has a **real**, working production path — no
credentials gap, because it needs none:

- `SUBMISSION_BACKEND=local` (default) — writes to `data/submissions.jsonl`
  in the exported package. Unchanged V8.6 behavior.
- `SUBMISSION_BACKEND=webhook` — a real HTTP(S) POST (Node core `http`/
  `https`, no npm dependency) to `SUBMISSION_WEBHOOK_URL`, optionally
  HMAC-signed with `SUBMISSION_WEBHOOK_SECRET`. Fails closed at startup if
  `SUBMISSION_WEBHOOK_URL` is missing. Reports success to the visitor only
  once the endpoint actually answers 2xx.

This is genuinely usable today by whoever self-hosts an exported site — it
is not a stub. See `README.md` inside any server-required export for the
customer-facing version of this.

## Summary: what's configuration-only vs. what needs a decision

- **Configuration-only** (set the env vars, install the package, done — no
  code/product decision needed): database, assets.
- **Needs an explicit product decision first**: auth (account linking vs.
  migration — see above).
- **Already real and usable today, zero blockers**: exported-site
  submissions (`SUBMISSION_BACKEND=webhook`).
