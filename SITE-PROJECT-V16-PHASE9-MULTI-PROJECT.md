# V16 — Phase 9: Multi-Project SiteRemade (generator-side notes)

Full cross-repo report: `app-real/PHASE9-MULTI-PROJECT-FINAL-REPORT.md`. This
file covers only what changed in this repo (the Generator) and why, for
anyone reading gen-real's own `SITE-PROJECT-V*.md` history in order.

## What this repo does in the two journeys

- **Journey A** (idea → generate → purchase): unchanged in shape.
  `projects.source_type` defaults `'new'`; nothing about a from-scratch
  project's pipeline changed in this phase.
- **Journey B** (existing URL → redesign → purchase): new. `lib/site-import.js`
  fetches the given URL through an SSRF-safe path (resolve DNS first, refuse
  private/reserved/link-local/metadata/CGNAT/multicast ranges, then connect
  to the *resolved* address with the hostname pinned for TLS SNI — so a
  second DNS lookup mid-request can't rebind past the check), then extracts
  business name, services, structure, copy, contact info, service area,
  branding cues, CTAs, testimonials and key facts with a dependency-free HTML
  parse. `POST /api/redesign/extract` exposes that. `POST /api/projects`
  accepts an optional `source` so a redesign project carries real
  `source_type/source_url/source_imported_at/source_metadata_json`
  provenance — and then runs through the *same* strategy/archetype/
  generation pipeline as any other project. The extracted facts are creative
  input, never a template to clone verbatim.

## Bridge changes (what Workplace can now ask this repo)

Previously the app-bridge only answered "give me the canonical (most-
recently-purchased) project for this account" — fine when an account has at
most one purchased project connected to Workplace, wrong once it can have
several. Added `GET /api/app-bridge/website/:projectId` — same
`buildWebsiteSummary()` used by the canonical route, so the two are
byte-identical in shape for the same project, and registered *after*
`/candidates` (registering it first would have shadowed that literal path
under Express's/this router's order-of-registration matching — caught before
it ever shipped, not a shipped bug). Ownership is re-verified from the
caller's own session token on every call; a project id in the URL is never
trusted as authorization by itself.

## Purchase-complete handoff (`index.html` / `styles.css` / `script.js`)

On a confirmed-fulfilled purchase, two buttons appear: "Continue editing"
(no-op navigation-wise — just dismisses the row, since the editor is already
the page you're on) and "Open in Workplace" (`openWorkplace()`), which reuses
the pre-existing V14/V15 identity-bridge machinery unchanged:
- bridge disabled, or already linked → `startSharedIdentityHandoff('session')`
  straight to `SITEREMADE_APP_URL`, same as the app's other existing "Open
  SiteRemade App" entry points.
- not yet linked → the existing dual-proof link flow, with one addition: a
  one-shot `sr_open_workplace_after_link` sessionStorage flag, read and
  cleared *before* the `/api/identity/link` request fires (so a failed
  attempt can't leave a stale flag to misfire on some later, unrelated link
  click), consumed by the existing success handler to continue straight into
  Workplace after a successful link instead of leaving the person on the
  purchase screen for a second click.

No new cross-app auth mechanism was invented — every path here is
composition of already-shipped, already-tested identity-bridge code.

## Testing

`gen-bridge-test.js` (90+7+7, full regression, images on/off, bridge off),
`smoke-project-provenance.js` and `site-import-test.js` (27 assertions,
including a real refused-SSRF-target proof), `redesign-route-test.js`
(12/12), `multi-project-bridge-test.js` (10/10, explicit-id route, IDOR-safe)
all still pass. New in this phase, from the scratchpad harness driving this
repo's real server: `purchase-complete-handoff-test.js` (13/13, real
Playwright, real purchase fulfillment, all three identity-bridge account
states) and shared coverage in `multi-project-analytics-test.js` and
`multi-project-form-routing-test.js` (both real-server, cross-repo).

## Known gap / sandbox limitation

The identity bridge's real cross-origin round trip (this app → the actual
`app.siteremade.com`) cannot be executed from this sandbox — that origin is
hardcoded and network-unreachable here, the same limitation
`primtest/v15-unified-login-test.js` already documents for this feature. Both
halves are tested against real code, separately; only a real staging/
production click-through closes that last gap.
