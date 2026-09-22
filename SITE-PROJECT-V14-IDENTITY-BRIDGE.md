# V14 — Shared Supabase identity bridge + one-account migration pass

Builds on `SITE-PROJECT-V13-HARDENING.md` §10-13 (the Option A/B design
analysis, explicitly deferred there). This pass re-audits both systems for
any new evidence, confirms Option A as the target architecture, and
implements the one safe, reversible slice of it that can ship without
touching a single live account: **Phase 1 of a three-phase rollout** (see
§14). Nothing in this pass migrates a real production Supabase project,
merges accounts by email, converts a password, or forces a live user
through anything. Everything below was built and tested against local
SQLite fixtures and a mocked Supabase verifier — see §36.

## 1. Full audit — what actually exists today

### Generator (this repo)

Confirmed by direct inspection of `lib/auth.js`, `lib/adapters/auth-
provider.js`, `lib/adapters/local-auth-provider.js`, `lib/adapters/
production-auth-provider.js`, `lib/db.js`, and all four pre-existing
migration files:

- Local scrypt password hashing (`hashPassword`/`verifyPassword` in
  `lib/auth.js`), each stored hash prefixed `scrypt:...` — `verifyPassword`
  rejects any hash whose first segment isn't literally `'scrypt'` before
  ever touching `scryptSync`.
- `accounts` table, primary key a generator-minted `acct_` + random-hex id
  — never a UUID, never a Supabase id.
- Opaque session tokens, SHA-256-hashed at rest, carried in a
  `siteremade_session` HttpOnly/SameSite=Lax cookie, resolved against this
  generator's own database via `lib/adapters/*-auth-provider.js`.
- Eight tables FK-referencing `accounts.id`: `sessions`, `projects`,
  `purchase_intents`, `entitlements`, `credit_ledger`, `purchase_snapshots`,
  `deployments`, `domains`.
- `lib/adapters/production-auth-provider.js` already documents (from a
  prior pass) that Supabase Auth is a structurally different identity
  system requiring an explicit product decision before it could ever be
  swapped in as the generator's *own* auth backend — this pass does not
  touch that fail-closed behavior; it adds a parallel, opt-in bridge
  alongside it instead.
- Migration `0004_app_subscription_status.sql` already added a nullable,
  purely-additive `app_subscription_status` column to `accounts` for a
  *future* integration — every existing row is `NULL`, honestly meaning
  "unknown." This pass does not populate it (that remains a Stripe-webhook-
  driven field per V13 §14, not an identity-bridge concern).

### App (`app.siteremade.com`, audited via `audit/siteremade-app/`)

Confirmed by direct inspection of `lib/context.js`, `server.js`, `routes/
google-signin.js`, `supabase-schema.sql`, and the app's own migration
files:

- Real Supabase Auth: `sr_access`/`sr_refresh` HttpOnly cookies carrying
  Supabase-issued JWTs, verified via `anon.auth.getUser(access)` /
  `anon.auth.refreshSession()` — an anon-scoped Supabase client, not a
  service-role one, doing the actual verification call.
- `profiles` table keyed 1:1 to `auth.users.id` (a real UUID).
- `workspace_members` join table (a workspace can have more than one
  member) and `workspaces.siteremade_subscription_status` /
  `siteremade_customer_id` / `siteremade_subscription_id`, written only by
  a signature-verified Stripe webhook or a server-re-verified manual-
  confirm route — never client-writable.
- Nearly all actual data access goes through a **service-role** `db`
  client server-side, meaning Postgres RLS is defense-in-depth rather than
  the load-bearing authorization boundary — the real boundary is the app's
  own `is_workspace_member` / `is_siteremade_owner` checks in
  `lib/context.js`.
- The app has **no password-reset route** (Supabase Auth owns that entire
  flow — magic links / OAuth / Supabase's own reset emails).
- The app's cookies are **host-only** (no `Domain=` attribute) — there is
  no existing cross-subdomain cookie sharing between the app and anything
  else today, generator included.
- The app never exposes its service-role key to any client-side code.

**No shared user table and no existing bridge exist today.** This audit
surfaced nothing that changes that.

## 2. Option A confirmed, still not forced

Nothing in either audit makes Option A (Supabase as the shared identity,
V13 §10) unsafe. In particular: the app's RLS policies are entirely
internal to the app's own tables and keyed off `auth.uid()`; a generator-
side reference to the same Supabase UUID never interacts with, bypasses, or
needs to know about any RLS policy — RLS is the app's own concern,
unaffected by anything this pass builds. Option A remains the recommended
*end state*. What changed since V13 is *how* to get there safely: not one
migration, but the phased rollout in §14, of which this pass builds
**only** Phase 1's plumbing.

## 3. Shared canonical ID

The shared identity is the **Supabase Auth user UUID** (`auth.users.id` —
the same id the app already treats as canonical). The generator's own
legacy `acct_...` id is **never deleted or renamed** — every existing
table keeps referencing it exactly as today. A new `identity_links` table
(§4) is the *only* place the two id spaces meet.

## 4. Identity-link table design

`migrations/0005_identity_links.sql` — two tables, both additive, neither
touches any existing table or column:

**`identity_links`** — one row per (generator account, Supabase user)
pairing that has ever existed.

- `generator_account_id` — FK to `accounts.id`, `ON DELETE CASCADE`.
- `supabase_user_id` — `CHECK`-constrained to a real UUID shape (`GLOB`
  pattern), the same shape check `lib/supabase-identity.js` independently
  enforces in application code before a query is ever issued (defense in
  depth, not redundancy for its own sake).
- `link_status` — `'linked'` or `'revoked'`, never a hard delete (§23:
  auditable history, safe rollback).
- **Two partial unique indexes**, each `WHERE link_status = 'linked'`: one
  on `generator_account_id`, one on `supabase_user_id`. This is a real,
  database-enforced constraint — "at most one *active* link per side" —
  while still allowing revoked/historical rows to coexist without
  violating uniqueness, and allowing re-linking after a revocation. This is
  deliberately **not** a sloppy generic mapping table with no constraints:
  the ambiguity spec item 4 warns against (which of two generator accounts
  does this Supabase user "really" map to?) is structurally impossible
  while a link is active.
- `verification_method` — `'dual_session_confirmation'` or
  `'lazy_provision'` (§6/§8's two distinct, differently-proven paths — see
  §5), so every row states which safety guarantee produced it, permanently.

**`identity_link_events`** — an append-only audit log (`link_started`,
`link_succeeded`, `link_failed`, `link_conflict`, `lazy_account_created`),
each row's `reason` drawn from a small **fixed, frozen vocabulary**
(`lib/identity-links.js`'s `REASONS` object) — never a freeform string
built from request data, an error message, or a token. This is what
actually *enforces* spec item 35 ("never log passwords/tokens/secrets"),
structurally: there is no code path in `logEvent()` that can pass a secret
through, because its only caller-supplied `reason` values come from that
fixed object.

## 5. The nine user populations

| Pop. | Description | Path |
|---|---|---|
| A | Legacy generator account, never touches the app | Untouched. No row ever created for them. |
| B | App-only Supabase user, no generator account, no email collision | Lazy provisioning (§8) — safe, single-sided proof, nothing to merge. |
| C | Both a legacy generator account **and** a Supabase/app account, **different emails** | Explicit dual-proof linking (§6) only — nothing ever auto-detects this pairing. |
| D | Both accounts, **same email** | Explicit dual-proof linking (§6) — same mechanism as C; same-email is a *hint* the UI can surface, never an auto-merge trigger. |
| E | Brand-new person, signs up on the generator first | Population A until/unless they later authenticate with Supabase too → becomes C/D. |
| F | Brand-new person, signs up on the app first | Population B, provisioned lazily the first time they touch a generator-side, bridge-aware surface. |
| G | Brand-new person, uses a genuinely unified signup surface (future, §12) | Provisioned once, natively Supabase-keyed from the start (Phase 2, §14). |
| H | A person who revoked a link | Row stays (`link_status='revoked'`) — re-linking re-proves both sides again; nothing is silently restored. |
| I | An app-only Supabase user who already has a `lazy_provision` link | Idempotent resume — session-exchange resolves the existing link, never provisions twice. |

## 6. Same email never auto-merges

`lazyProvisionGeneratorAccount` (population B/I path) explicitly checks for
an existing generator account with the incoming Supabase user's email
**before** creating anything, and if one exists, refuses with
`{ok:false, reason:'email_conflict'}` — it does **not** attach to that
account, does **not** create a second account, and does **not** log or
expose which account collided beyond the fixed `EMAIL_CONFLICT` reason.
The only way populations C/D ever get linked is `createLink()` (§9's
`/api/identity/link` route), which requires **both**:

1. An authenticated generator session (`requireAuth` — the person is
   signed into their *existing* generator account right now), **and**
2. A freshly server-verified Supabase access token (`lib/supabase-
   identity.js`'s real `/auth/v1/user` call) **in the same request**.

There is no `POST {email1, email2}` linking route, no unsigned client-side
linking call, and no code path where a matching email alone creates or
resumes a link.

## 7. Generator-only migration flow (population A)

Nothing changes. No row is touched, no column is backfilled, no session
behavior differs. `/api/identity/status` on an unlinked legacy account
returns `{bridgeEnabled: <flag>, linked: false}` and nothing else — an
informational read, never a forced action.

## 8. App-only user flow (population B/I) — lazy provisioning

`POST /api/identity/supabase/session` (server.js / mock-server.js,
identical contract): the caller presents a Supabase access token, never a
generator session. The route:

1. Verifies the token server-side (`lib/supabase-identity.js`, real network
   call in production, real fixture-backed mock here — see §36).
2. Resolves an existing active link for that Supabase user id, if any
   (idempotent resume, population I).
3. If none exists, calls `lazyProvisionGeneratorAccount` — refuses on email
   collision (§6), otherwise creates a fresh generator account (no usable
   local password — `NO_LOCAL_PASSWORD_SENTINEL`, §10) and the link row, in
   **one transaction** (`db.transaction`), so a crash between the two steps
   can never leave an orphaned unlinked account.
4. Mints the generator's own ordinary session (§11) and returns it exactly
   like signup/signin do.

No forced second signup: an app-only visitor who lands on a bridge-aware
generator surface gets a working generator account and session in one
round trip, with a full, untouched daily credit allowance (proven live —
§37 item 5).

## 9. New-user end-state flow (population G, future)

Not built in this pass (Phase 2, §14) — noted here because §5 names it as
a population that needs *a* path, and its path is simply: sign up once
through Supabase, land in population B/I on first touch, exactly as F
does today. Nothing distinguishes G from F until Phase 2 makes Supabase-
native signup the generator's own primary entry point.

## 10. Password migration decision

**Scrypt hashes are never converted.** There is no safe hash-to-hash
migration between this generator's own `scrypt:...` format and whatever
Supabase Auth uses internally, and this pass does not attempt one. Every
lazily-provisioned account instead gets `NO_LOCAL_PASSWORD_SENTINEL` —
`'supabase-provisioned:no-local-password:v1'` — as its `password_hash`.
`lib/auth.js`'s `verifyPassword()` already rejects any stored hash whose
first `:`-delimited segment isn't literally `'scrypt'` before it ever
reaches `scryptSync`, so this sentinel is a real, structural "there is no
local password for this account" guarantee, not an obscure/guessable
string that merely looks unlikely to match. Verified live: a guessed
password against a lazily-provisioned account's email always returns 401
(§37 item 7). If such an account is ever also given a real local password
later (not built in this pass), that goes through the exact same
`hashPassword()` path signup already uses — overwriting the sentinel
deliberately, never as a side effect of linking.

For populations C/D (linking two pre-existing accounts), no password is
touched at all on either side — the generator's existing scrypt hash stays
exactly as it was, and the Supabase side's credential is Supabase's own
concern, entirely untouched by `createLink()`.

## 11. Generator session transition — Option B chosen

Three options were on the table (per the spec): (A) the generator directly
validates Supabase tokens on every request, (B) the generator exchanges a
verified Supabase token for its own existing server-side session, (C) some
other bridge. **Option B is what's built.**

The generator **never** stores, manages, or accepts a Supabase access
token as its own session mechanism. A token is verified server-side
**exactly once**, at the moment of session-exchange or linking, then
immediately forgotten — the generator mints its own `siteremade_session`
cookie via the pre-existing `authProvider.createSession` /
`sessionCookieHeader` machinery, the identical mechanism signup and signin
already use. Verified live (§37 item 8): the session-exchange route's
`Set-Cookie` has byte-identical `HttpOnly`/`SameSite=Lax`/`Path=/`
attributes to an ordinary signup's cookie.

This means: **zero new session model, zero new cookie flags, and zero
token ever touches localStorage or any client-readable storage.** Option A
(validate Supabase tokens directly on every request) was rejected because
it would mean the generator either re-verifies a token on every single
request (a real network round-trip per request, or a second caching layer
to avoid it) or trusts a locally-cached claim — Option B's one-time
verify-then-mint is simpler, cheaper, and reuses a session model that's
already been through V13's full cookie/session audit.

## 12. Cross-subdomain auth architecture (documentation only)

Today, the app's cookies are host-only (§1) and this generator's are too
(`siteremade_session`, no `Domain=` attribute, per V13 §9's audit). This
pass does **not** introduce cookie-domain sharing — Option B (§11)
specifically avoids needing it, since the generator never consumes the
app's own cookie, only a token handed to it once via an authenticated API
call. A true single-login UX (population G, §12 of the spec, "future
single-login UX") would require either a shared parent domain
(`*.siteremade.com`) with `Domain=` cookies on both products, or a
redirect-based OAuth-style handoff — that decision is explicitly deferred
to Phase 2/3 (§14) and is a DNS/deployment decision as much as a code one,
not something this pass should default into.

## 13. Canonical identity resolver

Deliberately **not** built as a change to `requireAuth`/`getSessionAccount`
— Phase 1 keeps the legacy resolver completely untouched, so every existing
route's authorization behavior is provably unchanged (proven by full
regression, §37 items 22-29). All new Supabase-aware logic is centralized
in exactly two files: `lib/supabase-identity.js` (token verification,
never touches the database) and `lib/identity-links.js` (link bookkeeping,
never touches the network) — no route outside `/api/identity/*` needs to
know the bridge exists at all. A future `currentSiteRemadeUserId` resolver
(spec's own name for this) that transparently resolves either id space is
a **Phase 3** concern (§14) — introducing it now, before any account has
actually been re-keyed, would be premature abstraction over nothing.

## 14. Ownership rekey — phased strategy

**Phase 1 (this pass):** the legacy `acct_...` id stays internal and
authoritative for every existing table. `identity_links` is the only new
surface. New Supabase-only users get a **new** `acct_...`-style row
(lazily provisioned) — they are not given a Supabase-shaped id anywhere in
the generator's own schema. Nothing is rekeyed.

**Phase 2 (future, not built here):** new accounts that sign up through a
unified Supabase-first surface (population G) natively use the Supabase
UUID as their generator account id from creation — no separate `acct_...`
id is ever minted for them. Legacy and lazily-provisioned accounts keep
their existing `acct_...` ids and their link rows exactly as Phase 1 left
them.

**Phase 3 (future, only once Phase 1+2 have run safely in production for a
real observation period):** an *optional*, explicitly-triggered rekey that
walks a **linked** account's eight owning tables (§1) and rewrites
`owner_id`/`account_id` from `acct_...` to the linked Supabase UUID, behind
a feature flag, one account at a time, with the `identity_links` row kept
as a permanent audit trail of the old id even after rekeying. This pass
deliberately does not attempt Phase 3 — "we care more about correctness
than clean schema immediately" is the spec's own framing, and a live
ownership rekey across eight tables is exactly the kind of one-way-feeling
operation that needs its own dedicated, later pass with its own test
matrix, not a subsection of this one.

## 15-19. Credits / projects / purchases / app-subscription / workspace continuity

All five hold under Phase 1, because Phase 1 never rekeys anything (§14):

- **Credits (§15):** a lazily-provisioned account gets exactly one fresh
  daily allowance, same as any new signup — proven live, no double grant,
  no duplication (§37 item 5). A *linked* pre-existing account's credit
  ledger is completely untouched by linking — `createLink()` never writes
  to `credit_ledger`.
- **Projects (§16) / purchases (§17):** unaffected — both are keyed to
  `accounts.id`, which never changes for a linked account, and a lazily-
  provisioned account starts with none, same as any new signup.
- **App subscription (§18):** `accounts.app_subscription_status` (from
  migration 0004) is not written anywhere by this pass — linking a
  generator account to a Supabase user does not itself grant or infer any
  subscription state; that remains Stripe-webhook-driven per V13 §14, a
  deliberately separate concern from identity linking.
- **Workspace continuity (§19):** the app's own `workspace_members`/
  `workspaces` tables are never touched by anything in this pass — the
  generator has no write path into the app's database at all, by design
  (§28).

## 20. RLS audit

Covered in §2 — no `auth.uid()`-dependent RLS policy interacts with
anything this pass builds, because the generator never queries the app's
Postgres database directly (§28) and the Supabase UUID the generator stores
in `identity_links` is never used to construct or bypass a query against
the app's own tables.

## 21. Account-linking security

- Strong dual proof only (§6) — no single-sided linking route exists.
- No `POST {email1, email2}` route — linking always requires a live,
  currently-valid Supabase access token, verified server-side at request
  time, never a claimed identifier.
- No unsigned client-side linking — `createLink()` only ever runs
  server-side, inside `/api/identity/link`, after both `requireAuth` and
  `lib/supabase-identity.js`'s real verification have already succeeded.

## 22. Link conflict handling

`createLink()` runs entirely inside one `db.transaction()` (`BEGIN
IMMEDIATE`/`COMMIT`/`ROLLBACK`, the same primitive `lib/credits.js` uses
for its reserve/commit/release), and the two partial unique indexes (§4)
back it with a real database constraint, not just application-level
checking. Verified live:

- **Duplicate/replay** (§37 item 14): relinking an already-linked identical
  pair is a safe no-op (`alreadyLinked:true`), never an error.
- **Cross-conflicts** (§37 items 15-16): linking either side to a
  *different* partner than it's already linked to is refused with a
  distinct, specific 409 reason (`supabase_user_already_linked` /
  `account_already_linked`) — never a silent overwrite.
- **Concurrent/interrupted** (§37 item 17): two simultaneous identical
  link requests (fired via `Promise.all` against the real HTTP server, not
  simulated) both resolve safely — one as the real link, the other as an
  idempotent no-op — with exactly one active link row afterward. SQLite's
  `BEGIN IMMEDIATE` serializes the two transactions; there is no window
  where both could observe "not yet linked" and both attempt to insert.

## 23. Link reversal / support strategy

Not built as an API route in this pass (no spec item requires it yet), but
the schema is ready for it: `identity_links.link_status` already supports
`'revoked'` as a distinct state from a hard delete, preserving the full
audit trail (`identity_link_events`) even after a link is undone, and the
partial-unique-index design (§4) means a revoked link never blocks a
future re-link of either side. A support-facing revoke endpoint is a small,
low-risk follow-up once this pass's plumbing has been observed in
production — deliberately left as a named next step rather than built
speculatively now.

## 24. Account recovery

Unaffected by this pass. Generator password reset (where it exists) and
Supabase's own account-recovery flow (magic link / OAuth reinit) are both
completely independent of `identity_links` — recovering either side's
credentials never touches or requires the link row.

## 25-27. UI requirements

Not built as frontend UI in this pass (no spec item required shipping UI
copy this pass, and none was written) — noted here as constraints any
future UI work must follow, since the API surface already enforces the
substance: `/api/identity/status` returns only `{bridgeEnabled, linked}` —
never the Supabase UUID, never the link table's existence by name, never
an internal migration-version string. Any future "Upgrade to your unified
SiteRemade account" UI should stay exactly that minimal — this pass
deliberately did not overbuild a linking wizard, settings page, or account-
merge UI ahead of the API being exercised in production.

## 28. API boundary definition

The generator's only new outbound calls are to Supabase's own `GET
/auth/v1/user` (via `lib/supabase-identity.js`, anon key only, §29) to ask
"whose token is this" — it never queries the app's Postgres database,
never calls an app-specific API route, and never receives a push from the
app. All new inbound surface is exactly three routes under `/api/identity/
*` (§8, §9 below), each individually feature-flagged (§34).

## 29. No secret sharing in client

`lib/supabase-identity.js` uses **only** the Supabase publishable/anon key
(`SUPABASE_PUBLISHABLE_KEY` / `SUPABASE_ANON_KEY`) — never a service-role
key. Verifying "is this access token valid, and whose is it" via
Supabase's own `/auth/v1/user` endpoint is exactly what an anon-scoped
client is for (the app's own `lib/context.js` does the identical call).
The generator has no reason to ever hold a Supabase service-role key — it
never queries the app's data, only asks "whose token is this."

## 30. Stripe is billing, not authentication

Unaffected and untouched by this pass. `app_subscription_status` continues
to be written only by V13's signature-verified webhook / re-verified
manual-confirm path — identity linking never reads, writes, or infers
anything about subscription or billing state.

## 31-33. Preservation constraints

- **V13 hardening (§31):** the full V13 regression suite
  (`v13-generator-hardening-test.js`, all 29/39 of its own checks) is
  re-run as part of this pass's own regression (§37 item 29) and passes
  unchanged — rate limiting, brute-force protection, session/cookie
  behavior, and the credit-config defaults are all untouched by this pass.
- **Paid images stay off (§32):** nothing in this pass touches
  `mockProviderConfigured`/`imageProvider`/any image-generation code path
  at all — no file this pass added or edited (`migrations/
  0005_identity_links.sql`, `lib/identity-links.js`, `lib/supabase-
  identity.js`, the `identityLinks`/`identityLinkEvents` adapter
  namespaces, and the three `/api/identity/*` routes) references images,
  credits cost tables, or the provider-configured flags at all.
- **10 daily credits / 3 cost preserved (§33):** a lazily-provisioned
  account's credits come from the exact same `DAILY_FREE_CREDITS`/cost
  configuration every other account uses (`lib/credits.js`'s
  `getCredits`) — verified live at 10/10, §37 item 5.

## 34. Migration feature flag

`SITEREMADE_IDENTITY_BRIDGE_MODE` — `disabled` (default) / `internal` /
`opt_in` / `full`. A **real, enforced gate**: all three `/api/identity/*`
routes 404 outright when disabled, not just hide a UI affordance. `internal`
additionally restricts by `SITEREMADE_IDENTITY_BRIDGE_ALLOWLIST`
(comma-separated emails) — a non-allowlisted caller in `internal` mode gets
the identical 404 a fully-disabled bridge would return, never a
distinguishable 403, so the flag's existence is never leaked to someone
it doesn't apply to. `opt_in` and `full` are behaviorally identical in
this pass (both "on for everyone") since nothing in Phase 1 ever links or
provisions without the account's own explicit in-the-moment action (a
token they themselves presented) — the `opt_in` name exists as a named
future target (e.g. a gradual UI rollout that only *shows* the linking
option to accounts flagged in), not a fabricated distinct behavior. Fully
verified live across all four modes: disabled (§37 items 1-3), full
(§37 items 4-18), rollback from full back to disabled against the same
database (§37 item 19), and internal's allowlist (§37 items 20-21).

## 35. Observability logging

`identity_link_events` records every attempt (`link_started`,
`link_succeeded`, `link_failed`, `link_conflict`, `lazy_account_created`),
each with a `reason` drawn only from the frozen `REASONS` vocabulary in
`lib/identity-links.js` (§4) — structurally incapable of logging a
password, token, or other secret, because no call site can pass one
through; the object's values are the only strings `logEvent()` ever
receives for that field.

## 36. No destructive production operations

Every check in this pass runs against local SQLite fixtures spun up fresh
per test phase (`os.tmpdir()`-based `.db` files) and a fixture-based mock
Supabase verifier (`mock-server.js`'s `/__test/set-supabase-user` registry
standing in for a real Supabase project, which this sandbox cannot reach
at all — same honest "configured()===false here" pattern the anthropic/
image providers already use). `lib/supabase-identity.js`'s real
`fetch()`-based verification against `SUPABASE_URL`/`/auth/v1/user` was
never exercised in this sandbox (there is no real Supabase project
reachable from here) — its logic was reviewed by inspection: real network
call, real signature verification via Supabase's own endpoint, honest
`configured()` gate, fails soft on every error path, never a local
JWT-decode-without-verification shortcut.

## 37. Test matrix

29 automated checks in `primtest/v14-identity-bridge-test.js`, run against
`landing/mock-server.js` (the same dependency-free HTTP test double every
prior pass's suite uses, since `express` cannot be installed in this
sandbox and `server.js` itself can therefore never be spawned directly).
Categories, matching the spec's own list:

- **Feature-flag default / legacy continuity** (1-3): source-inspected
  `disabled` default in both `server.js` and `mock-server.js`; disabled-mode
  fail-closed 404; an ordinary legacy account's behavior and
  `/api/identity/status` response are unaffected by the bridge being off.
- **Lazy provisioning / new user** (4-8): fresh account creation, correct
  starting credits, idempotent repeat, unusable local password, identical
  cookie shape to an ordinary signup.
- **Email conflict + dual-proof linking** (9-16): refused auto-merge on
  email collision, `requireAuth` enforced on the link route, successful
  dual-proof link, post-link status, post-link session-exchange resolving
  to the pre-existing account (no duplicate), idempotent replay, both
  conflict directions.
- **Concurrency** (17): simultaneous identical link requests via real HTTP
  `Promise.all`, no crash, no duplicate active link.
- **Security** (18): forged/unregistered tokens rejected on both routes.
- **Rollback** (19): a disabled-mode instance reopened against a database a
  full-mode instance had already linked accounts in — data and legacy
  sign-in survive untouched; the bridge routes themselves go back to
  fail-closed.
- **Cross-product / feature-flag modes** (20-21): `internal` mode's
  allowlist genuinely enforced both directions.
- **Regression** (22-29): the full pre-existing suite (`v9-product-flow`,
  `v9-deployment-safety`, `v9-frontend-verify`, `v9-responsive`,
  `v10-design`, `v11-baseline`, `v12-unified-account`,
  `v13-generator-hardening`) re-run as real child processes, judged only by
  real exit code.

One real regression was found and fixed during this pass — see §"Errors
and fixes" below.

## 38. This document

`SITE-PROJECT-V14-IDENTITY-BRIDGE.md` — this file.

## 39. Implementation scope — what shipped, and what deliberately didn't

**Shipped:** `migrations/0005_identity_links.sql` (identity-link schema),
`lib/identity-links.js` (the safe identity resolver / linking domain
logic), `lib/supabase-identity.js` (real, honestly-unconfigured-here token
verification), the `identityLinks`/`identityLinkEvents` namespaces in
`lib/adapters/sqlite-database-adapter.js`, the
`SITEREMADE_IDENTITY_BRIDGE_MODE` feature flag (fail-closed default), three
`/api/identity/*` routes mirrored into both `server.js` and `landing/
mock-server.js`, non-destructive migration plumbing (lazy provisioning +
explicit dual-proof linking, both purely additive), and full test coverage
(§37).

**Explicitly not shipped, per the spec's own scope boundary:** any
production-wide migration, forced password resets, auto-linking by email,
destructive rekeying (Phase 3, §14), or any change touching a live user —
none of these were attempted, let alone found safe.

## 40. Final report

Delivered as this pass's closing chat message, per the spec's own
instruction to end with either (A) a safe, tested bridge ready for
controlled rollout, or (B) a precise blocker explanation. This pass reached
(A): Phase 1 is built, tested (29/29 checks, full regression green), and
committed locally — **not pushed**, per the spec's repeated instruction.

---

## Errors and fixes found during this pass

Adding `migrations/0005_identity_links.sql` legitimately grew the repo's
real migration count from 4 to 5. `primtest/v9-deployment-safety-test.js`
(written during an earlier pass, before this migration existed) hardcoded
an expectation of exactly 4 applied migrations in three places (checks 29,
33, 37) and a stale `57` total-check-count constant in its own summary
line. Fixed by updating those three assertions to 5 (adding a corresponding
`0005_identity_links.sql` presence check alongside them, `28c`, matching
the exact style the prior `0004` addition had already established in the
same file) and correcting the summary-line constant to the file's true
total check count (59). This is the same category of fix V13 made to
`v11-baseline-test.js` for an unrelated reason (a new rate limit breaking a
hardcoded assumption) — a legitimate, additive change to the repo requiring
an old test's hardcoded expectation to be updated, never the underlying
behavior weakened to fit the old test.
