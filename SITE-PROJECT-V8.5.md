# SiteRemade generator — V8.5: durable project ownership + purchase persistence + server-side direction entitlement

V8.5 is a full commercial-infrastructure pass, not a UI polish pass. Before
this version, every meaningful piece of state that made a website "yours" —
who built it, whether it was paid for, how many free directions you'd used —
lived only in the visitor's own browser (localStorage, an HttpOnly cookie,
a query-string flag after a Stripe redirect). That was honestly disclosed as
a limitation in every prior report (V6, V8, V8.1). V8.5 closes it: **after
this pass, localStorage is a cache/recovery mechanism, but it is no longer
the authority for who owns a purchased project. Authentication identifies
the user, the server/database identifies the project, and verified payment
binds that exact project to that exact owner.**

Everything below is built as a fully self-contained sandbox backend (real
auth, a real embedded database, real Stripe-webhook verification logic) —
**not** wired to SiteRemade's actual production Supabase app at
`app.siteremade.com` (the existing "Client Login" link, deliberately left
untouched), per this repo's own standing instruction not to touch that
production system casually (SITE-PROJECT-V8.md part 7/8). It's architected
so a real deployment can point it at real Postgres/Supabase + real Stripe
without a reshape — not as a promise that it already is that.

## 1. Architecture inspection (what was there before this pass)

Before writing any code, the existing repo was audited for auth/persistence/
payment infrastructure:

- **No auth system existed anywhere in this repo.** No Supabase Auth
  wiring, no session cookie, no account table. The only identity-like
  mechanism was V8's anonymous `siteremade_anon` HttpOnly cookie, used
  solely to meter Claude calls.
- **No database existed.** All prior state was either in-memory
  (`directionsLedger` Map in server.js, reset on every restart/deploy) or
  in the visitor's own browser (`localStorage`).
- **Stripe usage was already real, hand-rolled, and worth preserving.**
  `/api/checkout` already called `api.stripe.com` directly via raw `fetch`
  (no `stripe` npm package — matches this sandbox's standing "npm install
  is blocked" constraint), created a real Checkout Session, and redirected.
  What it did **not** do: create any server-side record before redirecting,
  verify anything on return, or run a webhook. The return handler trusted
  `?purchased=1` and a localStorage-cached copy of the project, exactly as
  V6's own report disclosed.
- **`npm install` is confirmed blocked** in this sandbox
  (`npm view express version` → 403 from the registry). This rules out
  `pg`, `better-sqlite3`, `@supabase/supabase-js`, and `stripe` as real
  options here, same constraint this repo's existing code already works
  around for Stripe/OpenAI.
- **A real (stopped) local Postgres 16 cluster exists** on this machine,
  but scripting against it via a `psql` subprocess was judged less robust
  than an in-process, synchronous, transactional engine for this sandbox.

Given all of that, three shapes were possible: (a) wire into the real
production Supabase app, (b) stand up a new real Supabase/Stripe test
project, or (c) build a fully self-contained, honestly-scoped sandbox
backend. This was surfaced to you directly as a genuinely consequential,
hard-to-undo decision; you chose **(c)** — matching how V8/V8.1 handled the
analogous "how do we enforce a durable limit without npm and without
touching production" question.

## 2. Durable account-backed project model

`node:sqlite` (Node ≥22.5, built in, no install needed) is the local
stand-in for a real Postgres/Supabase database: a real, synchronous,
transactional SQL engine. `migrations/0001_init.sql` is a real, explicit
migration file (not code that mutates a schema implicitly), written in a
Postgres-flavored dialect with inline `-- PG:` notes on every deliberate
sandbox divergence, so it documents the intended production shape as much
as the sandbox one.

Tables: `accounts`, `sessions`, `projects`, `purchase_intents`,
`direction_entitlements`, `asset_blobs`, `schema_migrations`.

`projects.state_json` holds the **entire** `{directions,
activeDirectionIndex}` blob as one JSON column — the exact same shape
`script.js`'s own `serializeDirectionsState()`/`loadProjectFromStorage()`
already produce and consume for localStorage — rather than split into a
table per page/section/module. This was a deliberate choice: the
WebsiteProject is already a coherent structured document, and splitting it
relationally would buy nothing except drift risk between the client's shape
and the server's. `lib/project-store.js` still validates and normalizes
every field going in (see part 14) — "one JSON column" is not "no schema."

Deliberately **never persisted**: undo/redo history (a `WeakMap` keyed by
live object identity — meaningless once serialized), which input has
keyboard focus, in-flight image-generation request objects, or
`moduleRuntimeState` (per-form-field ephemeral submission state). All of
these are already excluded from `serializeDirectionsState()`'s own shape and
required no new stripping logic.

`projects.deployment_status` exists as the V8.6 placeholder the spec asked
for — column present, defaulted to `'not_deployed'`, never read or written
anywhere else this pass.

## 3. Ownership invariant

Every read/write in `lib/project-store.js` and `lib/purchase.js` takes an
explicit `ownerId` the caller (server.js/mock-server.js) has already
authenticated from a signed session cookie — **never** a client-supplied
user id, project id alone, `localStorage`, or purchase-success query param.
A project belonging to a different account and a project that doesn't exist
at all are **indistinguishable** (`404` in both cases, never a `403` that
would confirm existence) — verified empirically with two real accounts
across every ownership-scoped route (read, update, delete, purchase-status,
checkout), not just by code inspection (see part 23).

Project ids are unguessable and non-sequential:
`crypto.randomBytes(18).toString('base64url')`, never an autoincrement
integer.

## 4. Authentication

No existing auth system was found to extend, so V8.5 builds the minimum
production-sensible layer per the spec's own instruction: sign up, sign in,
sign out, identify the current user, restore owned projects. **No**
teams/orgs/roles/invitations/social login — explicitly out of scope.

- Passwords: `crypto.scryptSync` (Node core, real salted slow KDF), stored
  as `scrypt:<saltHex>:<hashHex>`.
- Sessions: a random `crypto.randomBytes(32)` token handed to the browser
  as an **HttpOnly, SameSite=Lax** cookie; only the token's **SHA-256** is
  stored server-side, so a raw database read is never itself a replayable
  session.
- `resolveSession` treats an expired session as invalid and opportunistically
  deletes it — never silently "valid".

Anonymous generation (V8's own ledger, the whole 3-direction cap mechanism,
image planning) is **completely unchanged** — every V8.5 code path is a
no-op until a visitor signs in.

## 5. Anonymous → account migration

The exact in-browser `{directions, activeDirectionIndex}` bundle a visitor
already built is what gets migrated — never regenerated. `directions[0]`'s
own stable `meta.id` (set once at generation, never reassigned by edits) is
used as `sourceLocalId`. `POST /api/projects` is idempotent on
`(owner_id, source_local_id)` via a partial unique index
(`idx_projects_owner_source_local`): a second migration attempt with the
same `sourceLocalId` returns the **existing** row (`alreadyExisted: true`),
never a duplicate — verified both directly against `lib/project-store.js`
and via the real client flow (sign up → reload → `GET /api/projects` still
shows exactly one project).

The client keeps a small `localStorage` migration map
(`siteremade:migrationMap`, `localId → serverProjectId`) as a fast-path
optimization so it doesn't even attempt a redundant create call — the
server's own unique index is the real guarantee, the client map is just
politeness.

## 6. Purchase → exact project ownership (the core commercial invariant)

This is the part the spec called out as the single most important
guarantee, and it's enforced structurally, not by convention:

1. `POST /api/checkout` (now `requireAuth` + `requireSameOrigin`) takes a
   `projectId`, confirms the caller **owns** it (404 otherwise — same
   IDOR-safe non-disclosure as everywhere else), then calls
   `purchase.createPurchaseIntent()`, which inserts a real
   `purchase_intents` row **before any Stripe interaction happens at all**,
   binding `(owner_id, project_id, pending)`.
2. Only then, if `STRIPE_SECRET_KEY` is configured, a real Checkout Session
   is created. Its `success_url`/`cancel_url` carry the **intent id**,
   never the raw project id:
   `/?purchased=1&intent=<intentId>#buy`.
3. The browser's return is treated as a **UX trigger only** — the client
   calls `GET /api/purchase-intents/:id` (ownership-checked) and displays
   whatever the server says, never trusting the query string. Verified: a
   project is still `checkout_pending`, never `purchased`, purely from
   `?purchased=1` being present with no webhook having landed.
4. Fulfillment (part 7) is the **only** thing that can ever flip a project
   to `purchased`, and it's looked up by Stripe session id — never by a
   client-supplied project id — so a checkout started for Project A can
   never purchase Project B (verified: start checkout for Project A, fire
   its real webhook, confirm Project B — same account, never checked out —
   is completely unaffected).

## 7. Stripe / webhook correctness

The existing raw-`fetch`-to-`api.stripe.com` Checkout Session creation is
preserved unchanged in shape (no `stripe` npm package, matching this repo's
existing convention). New: `POST /api/stripe/webhook`, mounted with
`express.raw()` **before** the global `express.json()` so signature
verification runs against the exact bytes Stripe signed (a
`JSON.stringify(JSON.parse(raw))` round-trip is not guaranteed
byte-identical).

Signature verification (`lib/purchase.js`) is hand-rolled from Node core
`crypto`, following Stripe's own documented scheme exactly: header
`t=<ts>,v1=<hex>[,v1=<hex>...]`, signed payload `${t}.${rawBody}`, HMAC-
SHA256, `crypto.timingSafeEqual` comparison, plus a 300s replay-window
tolerance check on the timestamp. Verified against a real Python-computed
reference signature via curl, not just unit-tested against itself.

`fulfillBySessionId` is idempotent by construction: an already-`fulfilled`
intent is a safe no-op; a `cancelled`/`failed` intent refuses resurrection
by a late "completed" event. Verified live: duplicate delivery of the
identical signed webhook event still returns `{ok:true}` with the project
left at exactly one `purchased` transition, not double-applied.
`checkout.session.expired` releases an abandoned project back to `draft`
(`markIntentTerminal`) rather than leaving it stuck at `checkout_pending`
forever — also verified live.

The browser never sees `STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET`; only
Stripe identifiers needed for reconciliation (`stripe_session_id`) are
stored — never raw payment method details (this app never collects them;
Stripe Checkout is hosted).

## 8. Draft / checkout_pending / purchased

`projects.status` is a `CHECK`-constrained enum:
`draft | checkout_pending | purchased | archived`. Transitions are all
server-driven: `createPurchaseIntent` flips `draft → checkout_pending`;
`fulfillBySessionId` flips `checkout_pending → purchased`;
`markIntentTerminal` flips an abandoned `checkout_pending → draft`. A
client can never set `status`/`purchaseRef` directly — `updateOwnedProject`
only accepts `name`/`directionsState`/`expectedRevision`; any other field in
the request body (verified with a literal `status: 'purchased'` in the
payload) is silently ignored.

## 9. Cross-device restore + conflict strategy

`GET /api/projects`/`GET /api/projects/:id` let a signed-in owner retrieve
the same project from any device — verified with two separate Playwright
browser contexts signed into the same account.

Conflict strategy is **optimistic concurrency with an explicit `revision`
integer**, not last-write-wins: every `projects` row carries a `revision`
that increments on every accepted update; `PUT /api/projects/:id` accepts
an `expectedRevision` and refuses (`409`, with the server's real current
state attached) if it doesn't match the row's current revision — enforced
by a compare-and-swap `UPDATE ... WHERE revision = ?` (`result.changes===0`
detects the lost race), not merely a `SELECT`-then-`UPDATE` that a
different request could interleave. Verified live with a real stale-write
attempt.

Client-side, the same idea shows up as an explicit **conflict UI**: loading
a different device's saved project over local unsaved content surfaces a
"Keep my version" / "Load their version" choice rather than silently
picking one — verified with two real signed-in browser contexts diverging
and then reconciling.

## 10. Autosave

Every relevant mutation path (`runEditorAction`, generation completion,
direction switching — V8.3's own established chokepoint) already funnels
through `persistDirectionsSilently()`; V8.5 adds exactly one new call at
its end: `scheduleServerAutosave()` (1.5s debounce). A no-op with no signed-
in account or no synced server project yet.

Race safety, in order of what actually prevents what:

- **No two concurrent PUTs.** `flushServerAutosave()` tracks the one
  in-flight save as a promise (`currentFlushPromise`); a flush requested
  while one is in flight sets `autosavePendingWhileInFlight` and is
  coalesced into exactly one follow-up flush after the current one
  resolves, rather than firing a second overlapping request.
- **A stale response can never win.** A monotonic `autosaveRequestSeq`
  counter plus `autosaveHighestAppliedSeq` means a response is only ever
  applied if no newer request's response has already landed — defense in
  depth on top of the in-flight guard, not the only thing preventing it.
- **The coalesced follow-up always sends current state, not a stale
  snapshot** — `doAutosaveSave()` reads `directions`/`activeDirectionIndex`
  at send time, not at schedule time.
- **A conflict pauses further autosaves** (`autosaveState === 'conflict'`)
  until the visitor explicitly resolves it, so repeated edits don't spam
  repeat conflicts against a revision nobody has agreed to yet.
- **Failure retries** (5s) rather than silently giving up, and is honestly
  surfaced as a `failed` state — never shown as `saved` when it wasn't.

One real bug this discipline caught during testing (see part 20): the
project-name field originally PUT independently of the content autosave
path, with its own `expectedRevision` read at a different moment — two
rapid edits (a content edit + a rename) could race each other into a
spurious conflict. Fixed by folding the name into the **same** sequenced
save (`doAutosaveSave` now includes `accountProjectNameInput`'s current
value), so there is exactly one save chokepoint, not two.

`forceSyncBeforeCheckout()` is the one place that needs a *stronger*
guarantee than "eventually saved" — buying must bind the **exact** on-
screen state, so it waits out any in-flight/coalesced save (bounded retry
loop) before checkout proceeds, and refuses to check out at all while a
conflict is unresolved.

## 11. Generated image persistence

Rather than a full Supabase Storage migration (judged too large for this
pass, per the spec's own explicit allowance), V8.5 ships the smallest
robust, ownership-safe strategy: a **content-addressed local asset store**
(`data/asset-store/`, sha256-keyed files, `asset_blobs` table for
metadata/dedup). At persist time, every embedded `data:image/...;base64,...`
dataUrl in a direction's assets is swapped for a stable
`{"assetRef":"<sha256>"}` marker (`internalizeAssets`); at read time it's
rehydrated back into a real dataUrl (`hydrateAssets`) — fully transparent
to the existing client renderer, which never sees anything but a real
dataUrl. Identical bytes across saves/projects are deduped automatically
(verified: uploading the same test image twice writes exactly one file on
disk). An owned project restores its real images without regenerating (and
without re-paying for) them.

**Remaining V8.6 work, stated honestly**: this is local disk, not a real
object-storage service — no CDN, no multi-instance/horizontally-scaled
sharing, no lifecycle/retention policy. A real deployment should migrate
`internalizeAssets`/`hydrateAssets` to Supabase Storage (swap the two
functions' bodies for `upload`/`createSignedUrl` calls, keep the same
`{assetRef}` marker shape) without touching anything upstream of them.

## 12. Server-side 3-direction entitlement (authenticated)

`lib/entitlement.js` is the durable counterpart to V8/V8.1's anonymous
in-memory ledger, applying **only** to authenticated `/api/plan-website`
calls — the two mechanisms are explicitly separate and never merge or
double-count (verified: exhausting one account's allowance has zero effect
on a different account, and has no relationship to the anonymous cookie
path at all).

Same reserve-before-call / commit-on-success / release-on-failure
discipline V8.1.1's client-side concurrency lock established, now durable
per `account_id`:

- `reserveDirection` — refuses (no mutation at all) if
  `used + reserved >= max`.
- `commitDirection` — reserved → used, on a real successful generation.
- `releaseDirection` — reserved → nothing, on a failed attempt (verified:
  a request with no `text` is rejected with the reservation released, and
  the very next successful call still shows the full remaining count minus
  one, not minus two).

Concurrency correctness: every function here runs fully synchronously
(`node:sqlite` has no async I/O), so Node's single-threaded event loop
cannot interleave a second request's JavaScript mid-reservation — the
reservation itself is the atomicity boundary. The SQL `BEGIN IMMEDIATE` /
compare-and-swap is real defense in depth (correct even if this were ever
split across connections/processes), not the only thing preventing the
race. Proven, not just argued: 5 concurrent requests against an account
with exactly 2 slots remaining resolved to **exactly 2** successes and 3
clean refusals, both via a direct `lib/` call and via live HTTP concurrency
against the running server.

Durable and per-account, not per-cookie/session: signing out and back in
("switching devices") leaves the allowance exactly where it was — verified
live.

## 13. Project API

`POST/GET /api/projects`, `GET/PUT/DELETE /api/projects/:id`,
`GET /api/projects/:id/purchase-status` — all `requireAuth`,
all ownership-checked server-side (part 3), all payload-validated (part 14).
`DELETE` only archives a `draft` (a `checkout_pending`/`purchased` project
refuses with `409`). No route accepts or trusts a client-supplied
`ownerId`, `status`, or purchase field (part 8) — the server alone owns
those.

`POST/PUT /api/projects*` use a dedicated, raised-limit JSON body parser
(35MB) separate from every other route's 900KB default, since a project
with a few generated images can legitimately be several MB before
internalization strips embedded images down to refs.

## 14. Schema validation

`lib/project-store.js`'s `validateDirectionsState`/`validateDirection`/
`validatePage`/`validateSection`/`validateModule`/`validateCtaTarget`
enforce: real array-of-pages structure; bounded counts (≤3 directions, ≤6
pages/direction, ≤14 sections/page — headroom above Claude's own
`maxItems:10`, not equal to it); known section types only
(`lib/vocabulary.js`'s `SECTION_TYPE_KEYS`, hand-kept in sync with
script.js's own constant, matching this repo's established
vocabulary-mirroring convention); known, section-compatible module types
only (`MODULE_TYPE_KEYS` + `MODULE_SECTION_COMPATIBILITY`); a real,
re-validated CTA target (`page`/`section`/`tel`/`mailto`/`external`, with
`page`/`section` targets checked against the surviving id sets of *this*
direction, never left dangling); no arbitrary executable content (nothing
here ever evaluates a string). An unknown section type is **dropped, not
fatal** — the rest of the direction still saves (verified: a payload with
one bogus section type alongside a real one saves successfully with only
the real one surviving).

Fields this validator deliberately does **not** re-implement
renderer-by-renderer (design dimensions, palette, business copy, intent,
etc. — the spec's own explicit allowance) go through `capStringsDeep`, a
generic recursive bounding walker: caps string length/array length/object
key count, drops functions/symbols, never fabricates content.

A hard **32MB total-payload ceiling** (`MAX_TOTAL_PAYLOAD_BYTES`) is
checked against the raw, pre-normalization JSON size — verified live with a
33MB payload rejected `400` ("Project state is too large"), distinct from
(and checked before) the 35MB raw-body transport limit, so an oversized
project is a clean validation rejection, not a transport-level cutoff or a
crash. The project JSON field can never be used as unlimited arbitrary
storage.

## 15. V8.4 functionality preservation

`section.module` (type, `enabled`, `fields`, `config`, forced-real
`submissionProvider`), `section.ctaTarget`, hero `copy.ctaTarget`, and
location edits all round-trip through `validateDirection`/`validateModule`
unchanged — this was largely "for free" (the persisted shape **is** the
same JSON `serializeDirectionsState()` already produces), and is now
explicitly verified: a real V8.4 contact module (with real fields, a real
`enabled:true`) saved via `POST /api/projects` and read back via
`GET /api/projects/:id` is byte-identical in the fields that matter.

## 16. LocalStorage migration / fallback

Nothing about the anonymous localStorage save/restore path
(`siteremade:lastProject`) changed. `applyDirectionsState()` — the exact,
already-tested restore/migrate/render sequence `loadProjectFromStorage()`
used — was extracted as a shared function and is now reused by bootstrap's
own restore-on-load path too, so there is exactly one "become a loaded
project" code path regardless of whether the state came from localStorage
or the server. V8.2/V8.3/V8.4 saves remain loadable — no format changed.

An authenticated visitor's existing local project gets the one-time,
idempotent migration described in part 5, guarded against duplication both
client-side (a small migration map) and server-side (the real, load-bearing
unique index).

## 17. Minimal account/project UI

A new `#accountBlock` control-block (inside the existing "Advanced
customization" drawer, next to Project data) — sign in/out, save status
(idle/dirty/saving/saved/failed/conflict, shown via `data-state` +
matching color), current project name, an owned-project picker + load
button, and the conflict resolution pair. A `#purchaseOwnershipBadge` shows
`draft`/`checkout_pending`/`purchased` next to the Buy button, driven by
real server status, never a UI label alone. No redesign of the generator,
no full dashboard — matches the spec's explicit "minimal" instruction.

## 18. Security

- Authorization: every project/purchase-intent read or write is
  ownership-checked server-side, from a session-derived `req.accountId` —
  never a client-supplied id, anywhere (part 3).
- CSRF: SameSite=Lax session cookie (blocks the classic cross-site
  form-POST case) **plus** an independent same-origin check
  (`requireSameOrigin`) on every state-changing authenticated route,
  comparing `Origin` (falling back to `Referer`) against the request's own
  host. Documented as a pragmatic, non-bank-grade posture appropriate to
  this session model — not a claim of completeness beyond that.
- Input/payload limits: part 14 (schema), 35MB project-route ceiling, 900KB
  everywhere else, all enforced by real byte-counting body readers in
  mock-server.js (`readJsonBody`/`readRawBody`, both reject over the limit
  rather than buffering unbounded).
- Webhook signature verification: real, part 7 — never trusts an
  unsigned/mis-signed event.
- Secrets: `STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET` are read from
  `process.env` server-side only; nothing resembling a Supabase
  service-role key or Stripe secret exists in `script.js` or any file
  shipped to the browser.
- IDOR: verified empirically (part 3), not just by inspection — including
  that a missing project and someone else's project produce the identical
  `404`.
- Error messages never distinguish "doesn't exist" from "exists but isn't
  yours."

## 19. Failure modes handled

| Failure | Behavior |
|---|---|
| DB unavailable | (Sandbox: `node:sqlite` is in-process, so this specific failure mode isn't independently reproducible here; a real Postgres/Supabase deployment would see this surface as an ordinary query error, caught the same way any other thrown error in these routes already is — a 500, never a silent wrong answer.) |
| Auth expired mid-save | `requireAuth` returns 401; the client's autosave surfaces `failed` and retries — it does not destroy the local edit (verified). |
| Stale project version | 409 with real current state attached (part 9), never silently overwritten. |
| Duplicate checkout completion (webhook) | Idempotent no-op (part 7), verified live. |
| Webhook-before-return | Handled — the return flow only ever *polls* verified status; if it's already fulfilled by the time the browser returns, the very first poll reflects that. |
| Return-before-webhook | Handled — the return flow polls (up to 8 attempts, 1.2s apart) rather than treating "not yet fulfilled" on the first check as failure. |
| Abandoned checkout | `checkout.session.expired` releases the project back to `draft` (part 7), verified live. |
| Failed payment | Same terminal-state path as abandoned; a purchase is never partially applied. |
| Project deleted/missing | Ownership-scoped reads return the same indistinguishable 404 as "not yours." |
| Local newer than server | Caught by revision mismatch on PUT → conflict UI, never silently overwritten. |
| Server newer than local | Same conflict path, surfaced on load (part 9), verified with two real diverging browser contexts. |
| Image/storage upload failure | `internalizeAssets` only swaps a dataUrl for a ref when it can; a malformed/oversized embedded image is dropped by validation rather than corrupting the save. |
| Server save fails generally | Verified live: the UI never reverts or discards the visitor's local edit just because a PUT failed — `failed` state, local content untouched, automatic retry. |

## 20. Explicit non-goals (deferred to V8.6+)

Unchanged from the spec: production site export, Railway/Hostinger/
GoDaddy/Bluehost deployment, DNS automation/custom domain verification,
live deployment rollback, full app/dashboard integration, lead inbox,
analytics dashboard, native ecommerce, production booking engine, team
collaboration, project sharing. Nothing in this pass touches any of those.

## 21–23. Tests, verification, and a real bug this testing process found

**New: `v8-5-ownership-test.js`** — 87 assertions, **0 failures**, two
sections:

- **Section A (backend, direct HTTP, no browser — 66 assertions):** signup/
  signin validation, ownership isolation between two real distinct accounts
  (IDOR across read/update/delete/purchase-status/checkout), owner-identity
  and purchase-field spoofing resistance, schema validation (malformed
  input, an oversized 33MB payload, unknown-type tolerance, a real V8.4
  module round-tripping unchanged), the full draft → checkout_pending →
  purchased state machine, real signed-webhook verification + idempotent
  fulfillment + tampered-signature rejection, abandoned/expired-checkout
  release back to draft, "checkout for Project A cannot purchase Project
  B", anonymous→account migration idempotency, optimistic-concurrency
  stale-write rejection, and server-side entitlement (real 5-way
  concurrency proving exactly the cap succeeds, failed-attempt release,
  durability across sign-out/sign-in, per-account independence).
- **Section B (browser/client integration, Playwright — 21 assertions):**
  anonymous generation completely unaffected; signing in mid-session
  migrates the *exact* in-browser project (proven by comparing the real
  business name, not just a count) and doesn't duplicate on reload;
  autosave reaches `saved` without an explicit click and survives a
  cross-device restore (two real browser contexts, same account); two
  rapid edits resolve to the last one, never an earlier stale response
  winning; a simulated server outage during a save never destroys the
  visitor's local edit; two diverging browser contexts surface a real
  conflict UI and resolve it correctly; the real end-to-end purchase
  flow (signed webhook → `?purchased=1&intent=...` return → verified poll)
  drives the on-screen purchase-ownership badge to `purchased`.

**A real bug this testing process found and fixed** (not a loosened
assertion): while writing the rapid-double-edit test, tracing through the
project-name field's original change handler showed it issued its **own**
independent PUT with its own `expectedRevision`, outside the coalesced
autosave path — two rapid edits (a content change + a rename) could race
into a spurious, silently-unhandled 409. Fixed in `script.js` by folding
the name field into the **same** sequenced `doAutosaveSave()` call, so
there is exactly one save chokepoint for a signed-in project, not two (part
10).

**A real bug in the test harness (`mock-server.js`), also found and
fixed:** its static-file fallback computed `path.join(REPO, req.url)`
*before* stripping the query string in the one case where the path itself
was bare `/` — `/?purchased=1&intent=...` (the real post-checkout return
URL) resolved to the repo directory itself (`EISDIR`) instead of
`index.html`, breaking any test that actually followed a purchase redirect
back to the root. This is a test-harness-only gap — real `server.js` is
unaffected (Express's `app.get('*')` matches path, not the full URL). Fixed
by stripping the query string first.

**One legitimate, pre-existing test-fixture issue was left alone**, per
this repo's own established discipline of only touching what actually
changed: `v8-2-pages-test.js`'s purchase-summary test (#16) previously
clicked Buy anonymously — that's the now-obsolete anonymous-checkout
assumption, an intentional, documented V8.5 architecture change (purchasing
is now account-gated, part 6), not a bug. Fixed by having the test sign a
real account in first (via the actual sign-up form, not a bypassing fetch)
before buying — root-caused and updated exactly the one expectation that
legitimately changed, per the standard V8.4 already set.

**Full regression, fresh mock-server, this pass:**

| Suite | Result |
|---|---|
| v5-lead-test.js | PASS (no regressions) |
| v5-serialize-test.js / v5-serialize-test2.js | PASS |
| v5-asset-test2.js | PASS |
| v7-1-image-gen-test.js | PASS |
| v8-1-directions-test.js | 24/24 PASS |
| v8-1-1-concurrency-test.js | 36/36 PASS |
| v8-1-2-rollback-test.js | 19/19 PASS |
| v8-2-pages-test.js | 63/63 PASS (test #16 updated, see above) |
| v8-3-editor-test.js | 77/77 PASS |
| v8-4-functionality-test.js | 101/101 PASS |
| **v8-5-ownership-test.js (new)** | **87/87 PASS** |

**Two suites have known, pre-existing issues unrelated to V8.5** — verified
by running them against the unmodified V8.4 commit (`9d93e8f`) via
`git stash`, where they fail **identically**:

- `v5-asset-test.js`: a stale-element-handle crash when iterating
  `asset-thumb-remove` buttons after a DOM re-render (a test-script bug
  predating this pass, reproducible on baseline).
- `v8-claude-plan-test.js`: one flaky call-count assertion
  ("exactly 2 /api/plan-website calls made") that's timing-sensitive and
  fails with a different actual count on baseline too.

Both are left untouched, per the instruction to update only what
legitimately changed — neither is a V8.5 regression, and fixing pre-
existing, unrelated test flakiness was out of this pass's scope.

`node --check` passes on every changed/new `.js` file. `git diff --check`
is clean (no whitespace errors) on the full staged diff.

## 24. Database migrations

`migrations/0001_init.sql` — one file, applied automatically and
idempotently by `lib/db.js`'s `runMigrations` (a `schema_migrations` table
tracks what's already applied; re-running is a safe no-op). Never manually
mutates a running database. `getDb(':memory:')` gives every test run a
fully clean, deterministic database with zero setup/teardown code needed —
used throughout `v8-5-ownership-test.js` (via `mock-server.js`, which
requires the exact same `lib/` modules `server.js` does, so a test run
exercises the real backend logic, not a parallel fake of it). Indexes,
constraints, and the intended RLS shape are documented inline (part 2/24
above); RLS itself is explicitly called out as defense-in-depth for a real
Postgres/Supabase deployment, never a substitute for the server-side
authorization in `lib/project-store.js`/`lib/purchase.js`, which is the
real, load-bearing boundary in both the sandbox and a real deployment.

## 25. Files changed / added

**New:**
- `migrations/0001_init.sql`
- `lib/db.js`, `lib/auth.js`, `lib/entitlement.js`, `lib/project-store.js`,
  `lib/purchase.js`, `lib/vocabulary.js`
- `.gitignore` (excludes the runtime-only `data/` directory — the file-
  backed SQLite database and local asset store are generated at runtime,
  never committed, same category as a real database/object-storage bucket)
- `SITE-PROJECT-V8.5.md` (this file)

**Modified:**
- `server.js` — the 5 new `lib/` requires; `getSessionAccount`/
  `withOptionalAuth`/`requireAuth`/`requireSameOrigin`; `/api/plan-website`
  gains the authenticated-entitlement branch (anonymous path unchanged);
  `/api/checkout` fully reworked (auth + ownership + purchase-intent
  binding); new `/api/stripe/webhook`; new auth + project route block.
  `node --check` passes (not runtime-tested here — `express` isn't
  installed in this sandbox, same standing constraint as every prior
  version's server.js changes).
- `mock-server.js` — the actual server every Playwright suite in this
  session runs against; mirrors server.js's real routes using the exact
  same `lib/` modules (not a second fake implementation); this is the file
  that's been runtime-verified end-to-end. Also fixed the static-file
  query-string bug (part 23).
- `index.html` — new `#accountBlock` control-block, `#purchaseOwnershipBadge`.
- `styles.css` — matching styles for both, following this file's existing
  `.control-block`/`.reset-colors`/status-color conventions.
- `script.js` — the full V8.5 client module (auth state, `apiFetch`,
  autosave with the coalescing/sequencing described in part 10, migration,
  conflict resolution, the reworked `buyButton`/`handlePurchaseReturn`
  flow, the `applyDirectionsState` extraction, the `window.__siteremadeAccount`
  test hook). `node --check` passes.

## Commit / handoff

- Commit hash: **see the accompanying delivery message** (created after
  this report, per the established V8.1.2–V8.4 workflow — this file is
  committed together with it).
- `origin/main` was **not** touched — this work is local to the
  `generator-v8` branch only, matching every prior version in this series.
- Delivered the same way as V8.1.2/V8.2/V8.3/V8.4: a verified git bundle of
  the full branch history plus this report, via file delivery.
