# SITE-PROJECT V9: Product-Flow Pass

Connects the full customer journey — create account / sign in → limited
daily credits → generate website directions → choose and customize one →
purchase → optional post-purchase hosting choice → complete ownership/
handoff package → retained access to purchased sites in account — on top
of the real V8.1–V8.7 account/ownership/Stripe/export infrastructure this
repo already had. Per the brief: audited first, coded second; no code
changes were made until the audit and architecture were reported and the
staged plan (Phases A–G below) was agreed.

## 1. Audit summary (what already existed before this pass)

Before writing any code, three parallel research passes plus direct file
reads confirmed this codebase already had, from prior V5–V8.7 passes:
real scrypt+session auth (`lib/auth.js`); ownership-scoped SQLite
persistence via a `DatabaseAdapter`/`AuthProvider`/`AssetStore` selector
(`lib/adapters/*.js`, `SITEREMADE_BACKEND=local|production`, fail-closed
on missing production config); a lifetime 3-direction entitlement cap
(`lib/entitlement.js`); real hand-rolled Stripe checkout + webhook
verification (`lib/purchase.js`, raw `fetch`, hand-rolled HMAC, no
`stripe` npm package); a genuine standalone-export compiler
(`lib/export-compiler.js` + `lib/archive.js`); durable deployment records
(`lib/deployment-store.js`); an honest hosting-provider catalog with
unconfigured (`null`) affiliate links (`lib/hosting.js`); SSRF-safe domain
verification (`lib/domain.js`); and a working Resend email integration
wired only to the pre-purchase lead form. What was genuinely missing: a
renewing daily credit ledger (only the lifetime cap existed); any
snapshot of what was actually purchased (export read the live, still-
editable draft); a post-purchase hosting-choice UI; an owner-facing
handoff document; a purchase-confirmation email; and any "My Websites"
account-wide surface.

## 2. Architecture

Two new concepts, both additive: a **daily credit ledger** (renewing,
UTC-date-keyed) that sits *alongside* — never replacing — the existing
lifetime-3-direction cap; and an **immutable purchase snapshot**, frozen
atomically at fulfillment, that becomes the one and only source export
compiles from, while the live project stays editable afterward. Every new
DB access goes through the same `DatabaseAdapter` namespace pattern
(`credits`, `purchaseSnapshots`) the codebase already used, so domain
modules never touch raw SQL and the fail-closed production-adapter
contract stays complete and honest.

## 3. Modified / new files

Modified: `server.js`, `script.js`, `index.html`, `styles.css`,
`lib/purchase.js`, `lib/export-compiler.js`,
`lib/adapters/sqlite-database-adapter.js`,
`lib/adapters/production-database-adapter.js`.
New: `lib/credits.js`, `lib/handoff-resources.js`, `lib/github-export.js`,
`migrations/0003_credits_and_snapshots.sql`.
Test files (outside the repo, in the scratchpad's `landing/`/`primtest/`
harness dirs, alongside every prior V8.x suite): `v9-product-flow-test.js`
(42 checks), `v9-frontend-verify.js` (21 checks); `mock-server.js` and
`v8-6-deployment-test.js` were extended/updated to match.

## 4. Database / schema changes

`migrations/0003_credits_and_snapshots.sql` adds two tables, applied
automatically by the existing `lib/db.js` migration runner:
`credit_ledger` (one row per account: `used`, `reserved`, `lifetime_used`,
`last_grant_date`) and `purchase_snapshots` (one row per project, enforced
by a `UNIQUE` index on `project_id`: `direction_index`, `state_json`,
`project_revision`, `hosting_choice_json`, `created_at`). No existing
table or column was touched.

## 5. Auth changes

None. `lib/auth.js` is untouched; every new route reuses the existing
`requireAuth`/`requireSameOrigin` middleware and the same
ownership-scoped-lookup discipline (`getOwned...` — a missing row and a
row owned by someone else are indistinguishable) as every pre-existing
route.

## 6. Credit system behavior

A daily allowance (`SITEREMADE_DAILY_FREE_CREDITS`, default 10;
`mock-server.js`'s test harness uses 5) that resets — not accumulates — on
every UTC date change. Costs reuse the existing `OPERATION_COST_CLASS`
taxonomy (`free:0, cheap:1, standard:3`, each env-overridable). Reserve →
commit/release discipline, identical in spirit to the existing entitlement
reservation: a reservation is checked-and-incremented synchronously, moved
to "used" on real success, released (not consumed) on any failure. Wired
into `/api/plan-website`, `/api/generate-image`, `/api/refine-website`,
additive to (never replacing) the pre-existing lifetime-3-direction cap —
both gates must independently pass; if one succeeds and the other then
fails, the first is released. `GET /api/credits` exposes the current
balance to a signed-in account.

## 7. Purchase snapshot behavior

`lib/purchase.js`'s `fulfillBySessionId` now creates a
`purchase_snapshots` row inside the *same* DB transaction as
`markPurchased`, capturing the exact `state_json` / `direction_index` /
`project_revision` as they stood at that instant. The live project
remains fully editable afterward (the brief: "if the project continues to
be edited later, preserve the purchased version separately") — only the
snapshot's `hosting_choice_json` is ever rewritten post-creation, and
nothing else about a snapshot ever changes. A legacy purchased project
predating this feature gets its snapshot lazily backfilled on first
access (`ensureSnapshotForOwnedProject`), never erroring.

## 8. Export architecture

`POST /api/projects/:id/export` was rewritten to compile *exclusively*
from the purchase snapshot (via `getOwnedPurchaseSnapshotRaw`), never the
live draft. This is a deliberate, documented API contract change: the
old `expectedRevision`/staleness check is gone because there is no longer
a live revision for export to be stale against — sending it, or omitting
the request body entirely, now both simply work. Re-exporting always
reproduces the exact purchased artifact (same hash), even after further
live edits; the deployment record binds to the snapshot's revision, not
whatever the live draft's revision has since become. `lib/export-
compiler.js`'s `compileExport` signature gained `hostingChoice` and
`purchaseDate` parameters, threaded through from the snapshot.

## 9. Exact ZIP contents

Unchanged from V8.6 except one addition: `README.md` (developer-facing,
pre-existing), `HANDOFF.md` (new, owner-facing), `export-manifest.json`
(gained `hostingChoice` and `handoffResources` fields), `index.html` +
one file per additional page, `styles.css`, `robots.txt`, `sitemap.xml`,
`assets/*` (deduplicated by content hash), and — for a `server_required`
site — `server.js`, `site.js`, `package.json`. No secrets, session cookie
names, or editor/account/generator UI ship in the package (regression-
tested).

## 10. Handoff flow

`lib/handoff-resources.js` exports five resource slots (upload/domain/
edit/publish/files), each an env-configured URL
(`SITEREMADE_GUIDE_*_URL`) or honestly `null` if unset — mirroring
`lib/hosting.js`'s existing `affiliateUrl: null` pattern exactly, per the
brief's "never fabricate" instruction. `HANDOFF.md` (built by
`lib/export-compiler.js`'s `buildHandoff`) covers what was bought, making
simple changes, publishing changes, the actual hosting choice made (or
self-host), domain, and those five resource links.

## 11. Hosting / affiliate config structure

Untouched: `lib/hosting.js`'s existing provider catalog (`local`,
`railway`, `hostinger`, `bluehost`, `godaddy`), all with `affiliateUrl:
null` (no real affiliate program is configured anywhere in this repo).
New on top of it: `POST /api/projects/:id/hosting-choice` lets an owner
record a real listed provider key, explicit `'self'`-host, or
`skipped:true` (decide later) — all three first-class, none required to
keep the download — validated against `hosting.listProviders()`'s real
keys server-side, never trusted blindly from the client. Stored on the
purchase snapshot, the one field on it that's allowed to change after
creation.

## 12. Email flow

New `sendPurchaseConfirmationEmail` reuses the exact pre-existing
`sendEmail({from,to,reply_to,subject,html})` Resend integration the lead
form already used (honest no-op if `RESEND_API_KEY`/recipient is
missing). Fired fire-and-forget from the Stripe webhook handler only on a
genuine first-time fulfillment (`fulfillment.ok && !alreadyFulfilled`),
pointing the owner at My Websites.

## 13. My Websites behavior

`GET /api/my-websites` aggregates every purchase snapshot this account
owns, each project's name, latest good deployment (with a real
per-deployment download URL), and hosting choice — the purchased build
stays listed here even as the editable draft keeps changing. Built as a
real panel in the existing single-page app (inside the account block,
`index.html`/`script.js`/`styles.css`): lists every purchased site,
"Open in editor," and an inline "Export .zip" that works without first
opening the project. Ownership-isolated (verified: a stranger's list is
always empty, and direct snapshot/export/hosting-choice access to another
account's purchase is a 404).

## 14. Tests and results

**`v9-product-flow-test.js`** (42/42 pass) — HTTP against `mock-server.js`
(the pre-existing zero-npm-dependency test harness that calls the same
real `lib/` modules `server.js` does; `server.js` itself cannot be spawned
in this sandbox — see §17): lib-level credit reserve/commit/release/
day-rollover (8); HTTP-level credits + the independent-gates interaction
with the lifetime cap (5); purchase-snapshot immutability under live
edits (5); snapshot-sourced export/handoff/manifest correctness (9);
hosting-choice validation and persistence (4); My Websites + ownership
isolation (9); legacy-data snapshot backfill (2).

**`v9-frontend-verify.js`** (21/21 pass) — real Chromium (Playwright)
against the real static files (`index.html`/`script.js`/`styles.css`)
served by `mock-server.js`'s own static route: real sign-up through the
UI, My Websites panel appearing/listing/exporting, hosting-choice
dropdown populated from the real provider catalog, a saved choice
persisting across a reload, the pre-existing V8.5 conflict-resolution UI
still working correctly when exercised, and cross-account isolation in
the rendered DOM.

**Full existing regression suite**, each file run against a *freshly
restarted* `mock-server.js` process (an early pass of mine reused one
long-lived process across files and produced a false-positive "doubled
/api/plan-website calls" reading purely from that shared in-memory test
ledger — not a real bug; caught and corrected before this final tally):

| Suite | Result |
|---|---|
| `v5-lead-test.js` | PASS |
| `v8-1-directions-test.js` | 1 pre-existing failure |
| `v8-1-1-concurrency-test.js` | 2 pre-existing failures |
| `v8-1-2-rollback-test.js` | ALL PASS |
| `v8-2-pages-test.js` | pre-existing timeout/crash |
| `v8-3-editor-test.js` | pre-existing timeout/crash |
| `v8-4-functionality-test.js` | 8 pre-existing failures |
| `v8-5-ownership-test.js` | ALL PASS (2 failures found and fixed — see §15) |
| `v8-6-deployment-test.js` | ALL PASS (5 assertions updated — see §15) |
| `v8-7-production-adapter-test.js` | ALL PASS |
| `v8-claude-plan-test.js` | 1 pre-existing failure (hero-diversity flake) |

Every "pre-existing" row above was independently re-run against a
`git stash` of this pass's changes (the exact pre-Phase-I `main` tip) and
fails identically byte-for-byte there too — confirmed not caused by this
pass, not fixed by this pass, out of this pass's scope.

## 15. Real bugs/interactions found and fixed during regression

Two, both from the new credit gate interacting with pre-existing tests
that assumed no such gate existed — not bugs in the credit logic itself:

- `v8-5-ownership-test.js`'s direction-cap concurrency test exhausted the
  mock's small (5-credit) daily allowance before reaching the lifetime cap
  it meant to isolate. Fixed by adding a `creditsLimit` override to
  `mock-server.js`'s existing `/__test/set-plan-configured` test hook
  (same convention as its pre-existing `limit`/`delayMs` overrides) and
  setting it generously high in that one test section — the credit gate
  stays real and independently reserved/committed/released, just not the
  binding constraint for a test about the *other* gate.
- `v8-6-deployment-test.js` had 5 assertions that encoded the OLD
  (pre-immutable-snapshot) export contract: a stale/missing
  `expectedRevision` refusing export, an exact export-file allowlist
  missing the new `HANDOFF.md`, and a "re-export after a live edit
  produces a different artifact/revision" expectation. All five were
  rewritten to assert the new, correct, deliberate contract (export
  always reflects the frozen snapshot) rather than left failing or
  silently skipped.

## 16. Provider-call changes

None to the three genuinely-external integrations (Claude planning,
OpenAI image generation, Stripe). `/api/plan-website` and
`/api/generate-image` gained an additional credit-reservation step before
their existing provider call, but the calls themselves, their payloads,
and their mocked test-double behavior are unchanged.

## 17. Security considerations

Every new route follows the pre-existing pattern exactly: `requireAuth`
on every route, `requireSameOrigin` on every state-changing one,
ownership-scoped lookups where a missing row and someone else's row are
indistinguishable (verified via dedicated IDOR tests: snapshot, export,
hosting-choice, My Websites). The hosting-choice provider is validated
server-side against the real catalog, never trusted from the client. No
secret or session-cookie name is ever embedded in an exported package
(regression-tested). `lib/github-export.js` is a documented interface
only — never `require()`'d by any route — so it cannot be a live attack
surface. Known, disclosed, unchanged limitation carried over from V8.x:
this pass runs in a single Node process, so the credit/entitlement
reservation's synchronous-block atomicity (real here) would need a real
transactional/locking layer for a multi-replica production deployment —
already documented in prior passes, not something this pass changes or
hides.

## 18. What's fully working vs. intentionally staged for later

**Fully working, tested, real:** daily credits (additive to the lifetime
cap); immutable purchase snapshots; snapshot-sourced export with
HANDOFF.md; post-purchase hosting choice (real provider, self-host, or
decide-later); purchase-confirmation email; My Websites (backend +
real UI) with full ownership isolation.

**Intentionally staged, not faked:** real GitHub push/deploy (Phase G) —
`lib/github-export.js` documents the exact contract a real implementation
must satisfy (fail-closed, same ownership-scoped shape as every other
domain module here) but is not wired anywhere, because no GitHub
credential, API client, or the underlying product decision (what
"deploy" means once pushed) exists yet, and this sandbox's blocked
`npm install` (§ below) rules out even installing a client to try.
Cross-replica credit/entitlement enforcement (see §17). Real affiliate
URLs / handoff-resource URLs stay honestly `null` until the business
actually has them — nothing here invents a percentage or a URL.

## 19. Environment note + commit

`server.js` (real Express) cannot be spawned in this sandbox — `express`
is not installed anywhere in this repo, and `npm install` returns a real
`403 Forbidden` from the registry (confirmed via direct `curl`, and the
domain IS in the proxy's allowlist, so this is a genuine registry-level
policy block, matching this exact repo's own long-documented history of
the same constraint for other packages). All HTTP-level testing in this
pass therefore runs against `mock-server.js`, the pre-existing test
harness this repo's own V8.5/V8.6/V8.7 suites already use, which requires
zero npm dependencies and calls the exact same real `lib/*.js` modules
`server.js` does — only the thin HTTP dispatch layer and the three
genuinely-external network calls are reimplemented there.

**Local commit:** `3a1a1e1` — *not pushed*, per the brief's explicit
instruction.
