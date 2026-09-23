# V15 — Shared identity Phase 2: unified login + account linking UX + cross-product app integration

Builds directly on `SITE-PROJECT-V14-IDENTITY-BRIDGE.md`, commit `cd71cc4`
(this repo, `landing/siteremade`). V14 built the backend bridge — an
`identity_links` table, a fail-closed `SITEREMADE_IDENTITY_BRIDGE_MODE`
flag, and the raw link/status/lazy-provision API — and explicitly deferred
**making it usable by real customers** to a later pass. This is that pass.
V14 was generator-only. This one touches both repos: the generator
(`landing/siteremade`, this repo) and the real SiteRemade app
(`audit/siteremade-app`, a separate git repository with its own remote).

Explicit constraints carried over unchanged from the spec, all still true
after this pass: no Phase 3 ownership rekeying, no deleting legacy
accounts, no merging by email alone, no moving generator data into
Supabase or app CRM data into the generator DB, no exposing UUIDs/link-
table ids/migration terms to customers, no weakening session/cookie
security, no paid images (`SITEREMADE_PAID_IMAGES=false`, untouched), and
no changes to the creative director, archetypes, icon system, motion
system, zero-image fallbacks, responsive renderer, image router, or image
budget — this pass is account integration only.

## 1. What "usable by real customers" meant

V14 gave the two products a way to say "these are the same account" to
each other. It gave nobody a way to actually establish that relationship
without hand-editing a database. This pass adds:

- A visible, customer-facing way for a **new visitor** to start on either
  product and land on one shared account (`SITE-PROJECT-V14-IDENTITY-
  BRIDGE.md`'s "population B/I").
- A visible, customer-facing way for an **existing legacy generator user**
  to prove they also own a SiteRemade app account and connect the two,
  with a real confirmation step — never silently, never from email match
  alone ("population C/D").
- Navigation each direction, so once connected, moving between the two
  feels like one product with two surfaces, not two separate logins.
- Every backend failure mode from V14 (email conflict, double-link,
  expired token, expired session) translated into a specific, friendly,
  recovery-oriented sentence — never a raw server message, never Supabase/
  UUID/migration terminology.

The generator's own `lib/supabase-identity.js` verification call and
`lib/identity-links.js` link/resolve/create functions are **unchanged**
from V14. This pass is entirely UI, routing, and session-handoff plumbing
on top of that existing backend contract.

## 2. Session handoff architecture

The two products live on different origins (the generator's own domain
and `app.siteremade.com`), so "the same account" can only ever mean two
independently-authenticated sessions that both resolve to the same
`identity_links` row — never a shared cookie, and never one product
reading the other's session store directly.

The handoff is a plain browser redirect carrying a short-lived Supabase
access token in a **URL fragment**, deliberately mirroring the app's own
pre-existing Google OAuth implicit-grant pattern (`routes/google-
signin.js` + `v18-client.js`, confirmed already shipping in
`audit/siteremade-app` before this pass touched anything): Supabase's own
`/auth/v1/authorize` redirect already returns tokens in a fragment, so
this pass reuses that exact transport and the exact
fragment-parse-then-scrub-then-POST client-side pattern that already
existed, rather than inventing a second one.

**Generator → app** (`startSharedIdentityHandoff(mode)`, `script.js`): a
plain navigation to `https://app.siteremade.com/?handoff_return=<this
page's own origin+path>&handoff_mode=session|link`. Never a query
parameter carrying a secret — `handoff_return`/`handoff_mode` are routing
hints only.

**App → generator** (`GET /handoff/website-builder`, `routes/website-
builder-handoff.js`, new this pass): requires an authenticated app session
(`{ auth: 'session' }`, reusing `lib/context.js`'s existing `getAuthUser`
— no second, parallel token-verification path). Redirects to
`<validated return origin>#bridge=<mode>&access_token=<this session's own
already-verified token>&expires_in=3600`. No new token is minted — the
value that travels is the exact same access token `getAuthUser()` already
verified (and silently refreshed, if it had expired) for this one request,
the same value every other authenticated app API call already trusts.
`return` is validated against one configured origin
(`WEBSITE_BUILDER_URL`, default `https://siteremade.com`) before use, with
a safe fallback to that origin's root — never an open redirect.

**Generator consumption** (`handleIdentityBridgeFragment()`, `script.js`):
runs once at bootstrap, before `refreshAuthState()`. Scrubs the fragment
from the address bar via `history.replaceState` **immediately**, before
even awaiting the token exchange, so it lingers in the visible URL/browser
history for as little time as possible. `mode=session` exchanges the token
for a normal generator session via the existing V14 `POST
/api/identity/supabase/session` route. `mode=link` calls the new,
non-mutating `POST /api/identity/preview` and shows the confirm dialog;
the actual mutating `POST /api/identity/link` only ever fires from an
explicit click.

**Honest security tradeoff, stated plainly**: this is not a literally
single-use token — replaying the same `#bridge=session&access_token=...`
fragment twice is a safe no-op (proven idempotent, test item 36), not
rejected outright, because the underlying Supabase token itself is
reusable until it naturally expires. What this design actually buys is a
**short-lived, immediately-scrubbed** token whose exposure window is one
redirect, never written to `localStorage`, never sent in a query string or
Referer header, and functionally equivalent to the app's own pre-existing
OAuth handoff, which the same person already went through to reach the
app's login in the first place.

## 3. The four user-facing flows

1. **New visitor, starts at the generator.** Sees "Continue with
   SiteRemade" (two entry points: the account panel, and the pre-
   generation auth gate). Clicking it is a full redirect to the app's
   sign-in; the app either already has a session (rare, cross-domain) or
   the visitor signs in/up there, then bounces straight back, already
   signed in on the generator with a lazily-provisioned generator account
   tied 1:1 to that Supabase identity.
2. **Existing app user, arrives at the generator for the first time.**
   Identical mechanism to #1 — `lazyProvisionGeneratorAccount` is
   idempotent, so a repeat visit resolves to the same generator account,
   never a duplicate (test item 8).
3. **Legacy generator user, wants to connect an existing SiteRemade
   account.** Signs into the generator normally (unaffected, untouched
   code path). Sees "Connect your SiteRemade account" once signed in and
   not yet linked. Clicking it is a full redirect to the app's sign-in
   (dual-proof: the generator session already established is proof one);
   returning with a verified Supabase token is proof two. Lands back on a
   real confirmation screen — both account emails shown, a warning if the
   Supabase identity is already linked elsewhere — and only links on an
   explicit click.
4. **Signed-in, connected user, moving between products.** The generator's
   pre-existing "Client Login" link relabels to "Open SiteRemade App" once
   connected (behavior/href unchanged — still a plain link). The app's new
   "Website Builder" nav entry (sidebar + mobile) is a plain link to
   `/handoff/website-builder`, so arriving at the generator that way is
   already recognized, never a second sign-in.

## 4. Confirmation and conflict UX

The dual-proof link flow always shows a real confirm screen before
anything is written (`#identityConfirmPanel`, populated from the
non-mutating `POST /api/identity/preview`) — never silent, never from
email match alone. Same-email-only collisions are refused with a specific
recovery message pointing at signing in with the existing password
(test item 19). Linking a second legacy account to an already-linked
Supabase identity is refused, not silently re-pointed (item 21). Replaying
an already-successful link confirmation is a safe, friendly no-op (item
22) — the person sees "Your SiteRemade account is connected," not an
error, since from their point of view nothing went wrong.

Every backend failure case is mapped, in one place
(`identityErrorMessage(status, data)` in `script.js`), to a specific
sentence: email conflict, account-already-linked, Supabase-user-already-
linked, expired generator session (distinguished by message text from an
invalid Supabase token, which gets a different sentence), bridge
unavailable, and a generic fallback. None of these ever surface a raw
server message, a reason code, or the words Supabase/UUID/identity_links/
migration.

## 5. Logout and session-expiry semantics (explicit decision)

**Decision: independent, per-surface logout.** Signing out of the
generator ends only the generator's own `siteremade_session` cookie
(`POST /api/auth/signout`, unchanged). Signing out of the app ends only
the app's own `sr_access`/`sr_refresh` cookies (`POST /api/auth/logout`,
unchanged). Neither sign-out path touches the other product, and neither
touches the `identity_links` row — the connection itself survives either
sign-out; only that one surface's session ends.

This was a real choice, not an oversight, and the codebase already
enforces it structurally rather than by convention: both cookies are
**host-only** (no `Domain=` attribute set on either side, confirmed by
direct inspection of `lib/auth.js`'s cookie header on the generator and
`lib/context.js`'s `authCookies()` on the app), and the two products are
different origins. A browser cannot share a host-only cookie across
different origins regardless of intent, so "sign out of both at once"
would require either widening both cookies' scope to a shared parent
domain (a real cookie-security change — explicitly forbidden by this
pass's own "do not weaken session/cookie security" constraint) or adding a
new server-to-server "also kill the other session" call (new cross-service
trust plumbing, out of scope for an account-integration-only pass). Per-
surface logout is therefore the only answer consistent with both existing
architectures, and it matches ordinary user expectation: linking two
accounts does not usually mean one logout ends both sessions everywhere.

Session-expiry recovery was already built as part of the flows themselves,
not as a separate mechanism: an expired/invalid Supabase token produces
"Your SiteRemade sign-in expired before we could verify it. Please try
connecting again." (test item 25); attempting to connect with no valid
generator session produces "You've been signed out of your generator
account. Please sign in again, then try connecting." (item 26) — both
distinguished by `identityErrorMessage`'s own status/message-text
disambiguation, not two separate copies of similar logic.

## 6. Data continuity (unchanged, re-verified)

Nothing in this pass moves data. Linking never rewrites the generator
account's id, email, projects, credits, or purchases (test items 16-18) —
`createLink`/`lazyProvisionGeneratorAccount` (V14, unchanged) only ever
write to `identity_links`. Re-entering via the shared identity a second
time does not re-grant or reset the daily credit allowance (item 10). RLS/
authorization on the app side is untouched — the new route adds no new
data access, only a redirect built from an already-authorized request.

## 7. Feature flag / rollback

`SITEREMADE_IDENTITY_BRIDGE_MODE` (`disabled`/`internal`/`opt_in`/`full`,
V14, unchanged) continues to gate every `/api/identity/*` route fail-
closed. This pass adds no new flag: the generator-side UI reads the
existing flag via the new, unauthenticated `GET /api/identity/public-
status` (so a signed-out visitor knows whether to show "Continue with
SiteRemade" at all — V14's own `/api/identity/status` requires
`requireAuth` and can't answer that). With the bridge disabled, the
"Continue with SiteRemade" UI disappears entirely (not a disabled button,
not an error state — test item 32) and legacy signup/sign-in is completely
unaffected (item 33). The app's new route has no flag of its own; it is
reachable whenever the app itself is deployed, matching the app's existing
Google sign-in route, which is likewise unconditional. If this needs to be
turned off app-side independently of the generator's own flag in a future
rollout, the natural next step is an app-side env var gating
`/handoff/website-builder` — not built here, since nothing in the spec
asked for independent app-side rollback and the generator's own flag
already gates the flow's generator half fail-closed.

## 8. Testing

Two-repo split, mirroring the honest split V14 itself used for its own
mock-vs-real distinction:

- `primtest/v15-unified-login-test.js` (this repo) — 41 required checks
  (spec §32's own matrix: NEW USER 1-6, APP USER 7-10, LEGACY GENERATOR
  USER 11-18, DUAL ACCOUNT 19-22, SESSION 23-27, CROSS PRODUCT 28-31,
  ROLLBACK 32-34, SECURITY 35-38, RESPONSIVE 39-41) plus 2 bonus
  accessibility checks, all against a real Chromium browser driving the
  real `landing/mock-server.js` (mirrors `server.js`'s two new routes
  exactly, reusing the real `lib/identity-links.js`). **43/43 passing.**
- `primtest/v15-app-handoff-test.js` (this repo, testing the other repo) —
  17 checks against `audit/siteremade-app`'s own real server, spawned via
  its real production entrypoint (`v17-server.js`, the full monkeypatch
  chain, not `server.js` in isolation). Covers the route's auth gate, the
  static surface (nav link, shipped JS functions), the full client-side
  capture/redirect logic in a real browser, and source-verified security
  invariants (open-redirect guard, no client-suppliable token, GET-not-
  POST, session-not-workspace auth) that can't be driven end-to-end
  without a live Supabase project this sandbox has no path to — same
  documented limitation V14's own suite already carries for the generator
  side. **17/17 passing.**

Both suites re-run clean (twice, back to back) with zero flakes. Full
regression V9 through V14 (8 suites, this repo) re-run clean after every
V15 change — zero regressions.

## 9. A real bug this pass's own testing found and fixed

Writing the accessibility checks (focus moves into the confirm dialog on
open) surfaced a genuine, pre-existing-shaped defect, not a test artifact:
`#identityConfirmPanel` lives inside `#accountSignedIn`, which starts
`hidden` in the HTML and is only unhidden by `updateAccountUI()` — called
from `refreshAuthState()`, which runs **after** `handleIdentityBridgeFragment()`
returns in the bootstrap sequence. So the confirm dialog was being shown
and focused at a moment its own ancestor container was still hidden — the
`.focus()` call silently failed, and the dialog was genuinely invisible to
a real user until `refreshAuthState()` caught up a beat later. Fixed by
having `showIdentityLinkConfirmation()` unhide the signed-in shell itself
(using the generator email the same `/api/identity/preview` response
already carries) the moment a successful, authenticated preview call
proves the session valid — no need to wait for the separate `/api/auth/me`
round trip just to know something the preview call already confirmed.
Idempotent: `refreshAuthState()` re-sets the same state moments later from
the real source of truth, harmlessly.

A related, lower-severity issue in the same area: the entire account panel
(this pass's new elements included) lives inside the pre-existing
`<details id="advancedPanel">` "Advanced customization" drawer, closed by
default and — critically — never left open across a real navigation. A
person completing the "Connect your SiteRemade account" round trip would
otherwise land back on a page where their result (the confirm dialog, a
connected badge, or an error) is real but invisible unless they think to
expand an unrelated-looking accordion. Fixed by having
`handleIdentityBridgeFragment()` force the drawer open the moment it
recognizes a genuine `#bridge=...` arrival, before rendering any outcome.

## 10. Deferred to Phase 3 (explicitly out of scope here)

- Ownership rekeying (making the Supabase identity the canonical account
  id instead of the generator's own `acct_` id) — V13/V14's own Phase 3,
  untouched.
- Merging by email alone, or any automatic migration of existing legacy
  accounts — still requires the explicit dual-proof confirm flow this pass
  built, every time.
- A unified cross-product dashboard, or website-builder content inside the
  app's CRM pages — spec explicitly asked this not be built; the two
  products remain two surfaces linked by identity, not one merged product.
- App-side independent feature flag for `/handoff/website-builder` (see
  §7) — not requested, not built.
- Cross-surface single-logout — see §5; would require a real cookie-scope
  or cross-service-trust change, out of scope for an account-integration
  pass.

## 11. Readiness for controlled rollout

Generator half: fully implemented, tested (43/43), regression-clean
against V9-V14 (zero regressions), and gated fail-closed behind the
existing `SITEREMADE_IDENTITY_BRIDGE_MODE` flag — safe to enable for an
internal or opt-in cohort today the same way V14's own flag already
supported.

App half: fully implemented and tested against the app's own real server
(17/17) to the extent this sandbox's lack of a live Supabase project
allows — the route's auth gate, static surface, and full client-side logic
are proven; the actual authenticated 302 redirect's fragment contents are
verified by direct source inspection rather than a live end-to-end run.
Before a controlled production rollout, the one remaining verification
step is a real end-to-end pass against a live (likely staging) Supabase
project, confirming the actual redirect round-trip between the two real
deployments — something no sandbox in this engagement has ever been able
to do for either repo, and not a defect specific to this pass.

Recommendation: safe to enable for an internal/opt-in cohort once that one
live-environment smoke test passes, same rollout shape V14 already
established.
