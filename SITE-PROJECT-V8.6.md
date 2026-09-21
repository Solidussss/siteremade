# SiteRemade generator — V8.6: export, deployment packaging, and hosting/domain handoff

V8.5 closed the "who owns this project" gap. V8.6 closes the next one: a
**purchased** project was still just a row of JSON in a database — there was
no way to turn it into a real, standalone website someone could actually
host. This pass builds the compiler, the deployment record-keeping, and the
minimum honest hosting/domain handoff described in the spec's own closing
principle:

> a SiteRemade export is a compiled artifact of an exact purchased project
> revision. It must be reproducible, ownership-gated, independent of the
> generator/editor, and honest about whether its functionality is actually
> connected to a production backend.

Continues from commit `f8384d5` (V8.5) on `generator-v8`. V8.5 is treated as
frozen and regression-protected throughout — verified at the end (part 11).
As with every version in this series, this stays on the self-contained
sandbox backend; the real `app.siteremade.com` Supabase instance was never
touched.

## 1. Architecture inspection (what was there before this pass)

Before writing any code: `projects.deployment_status` existed only as
V8.5's explicit placeholder column (defaulted `'not_deployed'`, never read
or written). No export/compiler/archive/hosting/domain code existed
anywhere in the repo (confirmed by grep). No affiliate links or hosting
partnerships existed anywhere (also confirmed by grep — relevant to part 8).
`node:sqlite`, the migration runner, and the ownership/session/revision
machinery from V8.5 were all reused as-is, not rebuilt. `zip`/`unzip` are
present in this sandbox (`/usr/bin/zip`, `/usr/bin/unzip`), which is what
makes a real downloadable archive possible without any new npm dependency.

## 2. The core design problem: exporting from state, not from the DOM

The spec is explicit that export must "derive from the same controlled
model the renderer uses" but must **not** depend on the SiteRemade editor
UI being present, and must **not** scrape the live preview DOM. `script.js`'s
renderer functions are pure (data in, HTML string out) but live in a
browser-only file that this repo's own standing instruction treats as
frozen and regression-protected — not a file to refactor mid-pass.

**Resolution:** `lib/site-render.js` is a hand-ported, Node-only copy of
every pure renderer function `script.js` uses to build a page — `categoryFor`,
`paletteVars`, `renderHero`, `renderPageHeader`, every section renderer,
`renderSiteFooter`, `renderNavHtml`, `pageFileName`, and friends. This
follows the exact convention `lib/vocabulary.js` already established in
V8.5 ("deliberate, documented duplication," hand-kept in sync rather than
imported across the browser/Node boundary). **`script.js` itself is
untouched except two additive hook lines** (both guarded by
`typeof x === 'function'`, harmless no-ops until the new UI module loads)
and a new module appended at the end of the file — zero risk to the frozen
V8.1–V8.5 renderer/editor code.

The one deliberate behavior difference: the ported `renderFormModuleWidget`
always renders the export's own honest submission note (part 6) rather than
script.js's live-editor-only "preview mode" wording — the two contexts mean
genuinely different things (see part 6) and were never meant to share a
message.

## 3. Runtime classification (`lib/runtime-classifier.js`)

`classifyRuntime(direction)` walks every page/section of the **actual**
persisted direction (not a guess, not a UI toggle) and checks each
`section.module` for `enabled && type`:

| Module type | Classification |
|---|---|
| `contact`, `quote`, `booking`, `newsletter` (enabled) | `server_required`, with a specific reason (`contact_form_submission`, `quote_request`, `booking_request`, `newsletter_submission`) |
| `location`, `action`, `product` | always `static` — these only ever resolve to `tel:`/`mailto:`/an external link/an external checkout URL, never a server round-trip |
| navigation, content, images | always `static` |

Output: `{runtimeType: 'static'|'server_required', runtimeReasons: [...]}` —
a real machine-readable array, not a boolean. A project with zero
server-backed modules is classified `static` even if it has ten pages;
one enabled contact form anywhere makes the whole project
`server_required`. Verified in the test suite against both a synthetic
static-only project and one with each server-required module type.

## 4. Export manifest (`export-manifest.json`, §6)

```json
{
  "projectId": "...", "exportedRevision": 3, "directionIndex": 0,
  "exportTimestamp": "...", "compilerVersion": "site-export-compiler@1.0.0",
  "artifactHash": "sha256:...",
  "runtimeType": "server_required", "runtimeReasons": ["contact_form_submission"],
  "pages": [{ "id": "home", "label": "Home", "slug": "", "route": "index.html" }, ...],
  "assets": [{ "hash": "...", "contentType": "image/png", "byteLength": 40213, "path": "assets/....png" }],
  "functionalityModules": [{ "pageId": "home", "sectionId": "contact-1", "type": "contact", "provider": "local-accept", "fields": ["name","email"] }],
  "requiredEnvVars": ["PORT (optional, defaults to 8080)"],
  "configuredIntegrations": [],
  "unconfiguredIntegrations": ["contact"],
  "build": { "runtime": "node>=18", "installCommand": null, "buildCommand": null, "startCommand": "node server.js" }
}
```

`configuredIntegrations` is always `[]` in this sandbox — there is no real
email/CRM provider wired up anywhere in this repo, so nothing is ever
falsely listed as configured (part 6). `unconfiguredIntegrations` names
exactly the module types actually present, so the manifest is honest about
what still needs a real provider connected before going live.

## 5. Static export package (§7)

For a `static`-classified project: `index.html` + one file per secondary
page (real slugs, sanitized to `[a-z0-9-]+.html`, falling back to
`page-N.html` on a pathological slug — never a raw, unsanitized path
segment), `styles.css`, `site.js`, `assets/`, `favicon`/OG meta where a
logo asset exists, `robots.txt`, `sitemap.xml`, `export-manifest.json`,
`README.md`. `styles.css` is shipped **wholesale**, unmodified, rather than
hand-filtered — a deliberate tradeoff documented in the compiler's own
comments: every design-dimension rule in it is already scoped through
`.builder-site[data-*]` attribute selectors, so reusing the file exactly is
what guarantees the exported page renders identically to the live preview,
at the cost of shipping some inert editor-chrome selectors that never match
anything in the exported HTML.

**Nothing editor/account/generator-related is ever included**: no
`script.js`, no Claude-planning code, no direction generator, no Stripe UI,
no sandbox-auth code, no `__test` hooks. `site.js` (the export's own small
runtime) only handles CTA click delegation (page/section navigation via an
embedded `window.__SITE_ROUTES` map — `tel:`/`mailto:`/external links need
no JS at all) and, for `server_required` exports, client-side field
validation + the submit fetch call.

## 6. Server-required export package + submission honesty (§8, §9)

For a `server_required`-classified project, the package additionally gets a
real, small, dependency-free `server.js` (embeds the module registry
in-line as JSON) and `package.json`. It serves the static files
(traversal-safe — see part 9) and implements `POST /api/submit/:sectionId`:
server-side validation mirroring the same field-length/email/phone
vocabulary the live app uses, then appends the accepted submission to
`data/submissions.jsonl`.

**The honesty requirement is enforced structurally, not by a comment:**
every exported module form carries a fixed, visible note —
*"Received by your site — no email or CRM notification is connected
yet."* — via a `data-integration-note` attribute, shown alongside the
real success message once a submission is genuinely accepted. This is
deliberately different from script.js's live-editor "preview mode"
wording, which claims nothing real happened at all — in the exported
package, something **does** really happen (server-side validation +
persistence to `submissions.jsonl`), so the copy says so, while still never
claiming an email or CRM was notified when none is connected. If a real
provider were ever wired up, `configuredIntegrations` (part 4) and this
note are exactly where that would become visibly true instead of asserted.
Never exports the entire generator backend — only the narrow submit
endpoint + static serving.

## 7. Asset export (§11)

`hydrateAssetsForExport(db, direction, assetsOutDir)` resolves every
`{assetRef: hash}` marker (V8.5's content-addressed asset store) by reading
`asset_blobs` and copying the real file to `assets/<hash>.<ext>` —
deduplicated for free (identical hashes just resolve to the same existing
file; a second reference never triggers a second copy or a filename
collision). It rewrites the **same** `dataUrl` field name the ported
renderers already read, just pointed at a relative export path instead of
a base64 URI — `<img src="${asset.dataUrl}">` in `lib/site-render.js`
needs zero awareness that it's running against an export rather than the
live app. Export never calls the image-generation provider — only assets
that already exist in the store are ever resolved; a `{assetRef}` with no
matching row is simply dropped, not fabricated or regenerated. Path
traversal, arbitrary file reads, malformed data URLs, and filename
collisions are all structurally prevented by only ever reading from the
sha256-keyed store by its own validated hash, never from a client-supplied
path.

## 8. Provider architecture (§10)

Three clean seams, none hard-coding a single company:

- **`SiteExportCompiler`** (`lib/export-compiler.js`) — project+revision+
  direction → a compiled package on disk. Knows nothing about hosting or
  domains.
- **`DeploymentTarget`** (`lib/hosting.js`) — `{key, supportsRuntime,
  available, domainSupport, sslSupport, handoffUrl, affiliateUrl,
  description}` per provider. Only `local` is `available:true` in this
  sandbox — a fully functional download target, not a stub. `railway`,
  `hostinger`, `bluehost`, `godaddy` are real, structured, `available:false`
  entries with a real reason each (no configured credentials/API token for
  any of them) — never faked as live. `affiliateUrl` is `null` throughout;
  it's a real configuration field for a real deal, not a placeholder
  pretending one exists (confirmed via grep: no affiliate link exists
  anywhere in this repo).
- **`SubmissionProvider`** — the exported `server.js`'s own
  `local-accept` provider (part 6); a real provider would slot in without
  changing the manifest shape (`moduleSummaries[].provider` is already a
  named field).

## 9. Reproducibility (§12)

`computeArtifactHash({projectId, directionIndex, direction, runtimeType,
runtimeReasons})` hashes `stableStringify` (sorted-keys canonical JSON) of
exactly those fields — computed from the **raw**, pre-asset-hydration
direction (still `{assetRef}` markers, not resolved file paths) and
**before** any timestamp is generated, so the hash never depends on the
export's own working directory or the moment it ran. Re-exporting the same
project/revision/direction produces an identical `artifactHash`; editing
the direction (bumping `projects.revision`) or picking a different
direction index changes it. Verified in the test suite both ways: same
revision exported twice → identical hash; edit + re-export → hash changes.

## 10. Deployment records + state machine (§13, §14, §25, §26, §29)

`migrations/0002_deployments.sql` (pure additive — `0001_init.sql` is never
rewritten) adds two real tables:

- **`deployments`** — one row per export/deploy **attempt**, never
  overwritten or deleted. Columns: id, owner, project, exact
  `project_revision` + `direction_index` exported, `compiler_version`,
  `artifact_hash`, `runtime_type` + `runtime_reasons_json`, `target`,
  `state` (`not_deployed | packaging | ready | deploying | live | failed`,
  `CHECK`-constrained), `manifest_json`, `artifact_path` (server-local,
  never exposed directly to the client), `deployed_url` (only ever set on a
  genuine reachable URL — never populated for `local`), `failure_reason`,
  timestamps.
- **`project_domains`** — one row per (project, domain), covered in part 12.

All state transitions are server-owned — no route ever accepts a
client-supplied `state`. For the only real target (`local`), a successful
export goes straight `packaging → ready` (its honest terminal happy state:
a download-only target has no hosted URL to ever call "live"). Every
export call — including re-exporting the same revision, or exporting after
an edit — inserts a **new** row; nothing is ever overwritten in place, so
redeploying a newer revision leaves the previous good deployment's metadata
completely intact (verified: 3 successive `ready` rows after 3 exports
across 2 revisions, all still present). A subsequent failed deploy attempt
(part 12) adds a 4th, `failed` row and does not touch, hide, or delete the
3 earlier good ones — `getLatestGoodDeployment` always finds the most
recent `ready`/`live` row regardless of what's failed since.
`syncProjectDeploymentStatus` keeps `projects.deployment_status` updated as
a convenience summary only, per the V8.5 placeholder's own intent — never
the load-bearing record.

## 11. Hosting recommendation + provider catalog (§16, §17)

`recommend(manifest)` filters `listProviders()` to those whose
`supportsRuntime` includes the manifest's own `runtimeType`, splits into
`recommendedTargets` (technical fit) vs. `availableNow` (fit **and**
actually usable in this environment — today, only `local`), and returns a
`reasoning` string built from the manifest's real `runtimeReasons` — never
a marketing claim, never invented pricing. `GET /api/hosting-providers`
exposes the full catalog (including the unavailable ones and their real
`reason`) so the client can show what a real deployment would use, honestly
labeled as not-yet-connected.

## 12. Domain handoff, DNS, and SSRF-safe live verification (§19–§21)

`validateDomain` rejects a protocol/path/malformed input and requires a
real TLD; `buildDnsInstructions(target, domain)` returns structured
`{type, hostName, valueTarget, ttl, note}` records appropriate to the
chosen target. `POST /api/projects/:id/domain` creates/updates a
`project_domains` row (`not_configured → instructions_generated`, state
server-owned throughout).

**Live verification was implemented, not deferred** — narrowly and
SSRF-safely: `resolveFirstPublicAddress` rejects loopback, RFC1918,
link-local (including `169.254.169.254`, the cloud-metadata address),
CGNAT, TEST-NET, multicast/reserved ranges, and their IPv6 equivalents
(`::1`, `fe80::`, `fc00::`/`fd00::`, IPv4-mapped addresses) before ever
issuing a request. The actual HTTP(S) request is then made with Node's
`lookup` option pinned to that exact already-validated IP — deliberately
**not** letting the HTTP client re-resolve DNS a second time, which is the
classic DNS-rebinding hole a naive "check the IP, then fetch the hostname"
implementation would leave open. Bounded timeout, bounded response size,
and a redirect is re-validated (not blindly followed) rather than trusted.
`verifyDomainReachable` never fabricates a result: on success it reports
whether HTTPS specifically succeeded (`usedHttps`), which is what decides
`verified` vs. `live` domain state; on failure it returns one of
`invalid_domain | blocked_host | dns_failed | blocked_target | unreachable
| too_many_redirects | bad_redirect` — never a silent guess.

## 13. SEO baseline + accessibility (§22, §23)

Each exported page gets a real `<title>`, meta description, canonical-ready
structure, basic OG tags, and a favicon when a logo asset exists — all
grounded in the project's own real business/copy fields, not invented
content. `robots.txt` + `sitemap.xml` are generated for the real page set
(the sitemap uses an explicitly-commented placeholder domain, since no real
domain is known at export time — updated by the owner once one exists,
called out in the generated README). The ported `lib/site-render.js`
carries over V8.4's labels/ARIA/keyboard/semantic-element/alt-text
behavior unchanged (same renderer logic, Node-side) — verified by the
V8.4 regression suite's own accessibility assertions still passing
end-to-end against the live app, and directly inspecting exported markup
for the same attributes.

## 14. Multi-page export + routing (§24)

All pages up to `MAX_PAGES_EXPORT` (6) are exported, each as its own real,
directly-loadable file, sharing one `window.__SITE_ROUTES` map so
cross-page CTA/nav targets resolve correctly whether the page is opened
directly or navigated to from another exported page. Verified in the test
suite: the secondary page is directly reachable at its own URL (not only
reachable by first loading the home page and clicking through), and the
home page's own nav link to it resolves to the real route.

## 15. Security (§28)

- **Ownership boundary**: export/deployment/domain routes are all
  `requireAuth` + ownership-scoped (V8.5's `getOwnedProjectRaw`/
  `getOwnedDeployment`/`getOwnedDomain` — never a client-supplied owner id),
  IDOR-safe (a missing project/deployment/domain and someone else's
  produce the identical 404) — reused directly from V8.5's own boundary,
  not reimplemented.
- **Purchased-status gating**: export requires `project.status ===
  'purchased'`, read from the server-side project row — never
  localStorage, a UI badge, or a query param. There is no separate
  "internal/test export mode" that bypasses this from the client; the only
  way this repo's own test suite exercises an unpurchased export is by
  asserting it's refused.
- **Revision binding**: export requires `expectedRevision`, exact-matched
  against the project's real current `revision` (V8.5's optimistic-
  concurrency column) — a stale client refuses with `409`, forcing a fresh
  autosave flush before it can proceed.
- **Path traversal**: both the generated export's own `server.js` and
  `mock-server.js`'s static serving join + `startsWith(ROOT)`-check every
  requested path, returning `403` on escape. Verified with a **raw** socket
  request bypassing client-side URL normalization (a `curl`/`fetch`-based
  test would give a false pass here — those clients collapse `/../` before
  the request is even sent) — confirmed a real `403` from both servers.
- **Bounded sizes/counts**: `lib/archive.js` refuses more than
  `MAX_ARCHIVE_FILES` (400) or `MAX_ARCHIVE_TOTAL_BYTES` (60MB); `pages`
  capped at 6 in the compiler itself.
- **Safe filenames**: page routes are regex-sanitized to `[a-z0-9-]+.html`
  with a `page-N.html` fallback; archive entries are rejected on any `..`
  segment or absolute path.
- **No shell injection**: `lib/archive.js` calls the real `zip` binary via
  `execFileSync` with a fixed argv array — never a shell string — so
  nothing in project content (a business name, a copy field) can ever
  reach a shell.
- **No secrets/session cookies exported**: the compiled package contains
  only static files, an export-manifest, and (for `server_required`) a
  self-contained `server.js`/`package.json` — no session cookie, no
  `STRIPE_SECRET_KEY`/DB path/account data of any kind is ever written to
  the export directory.

## 16. Failure handling (§29)

| Failure | Behavior |
|---|---|
| Invalid/missing direction index | `compileExport` throws `INVALID_DIRECTION` before touching disk; route returns 400, a `failed` deployment row is still recorded (so the attempt is never silently lost) |
| Project has no pages | `NO_PAGES` — same pattern |
| Stale revision | `409` before compilation even starts, current server revision attached |
| Unpurchased project | `403`, no deployment row created at all (never attempted) |
| Deploy to an unavailable target (e.g. `railway`) | Recorded as a real `failed` deployment row with a real, honest `failure_reason` — never silently pretended to succeed, never destroys the previously-good `ready`/`live` row for that project |
| Archive/zip failure | Caught, recorded as `failed`, previous good deployment untouched |
| Domain verification unreachable/blocked | `verifyDomainReachable`'s structured `{ok:false, reason}` (part 12) drives the domain to `dns_pending`, never fabricated as verified |
| Cross-account access to a deployment/domain | Identical 404 to "doesn't exist" (part 15) |

## 17. UI (§27)

A new `#exportPanel` section on the existing purchase card (hidden until
the project is purchased, matching the existing `#accountBlock`/
`#purchaseOwnershipBadge` "reveal on real server state" pattern from V8.5):
runtime classification + human-readable reasons, export/package status,
download link for the real artifact, deployment history (deployed vs.
current revision), a hosting recommendation with reasoning, and the domain
handoff flow (input → DNS instructions → verify). No new dashboard, no
redesign of the generator or editor — reuses existing `.button.full-width`/
`.purchase-points` styling, no new CSS needed. Verified end-to-end via the
V8.5 regression suite's real Playwright browser run (part 20) — the new
markup did not break any existing browser-driven flow.

## 18. Explicit non-goals (deferred to V8.7+, per spec §30)

Unchanged from the spec: no full dashboard, no lead inbox, no analytics, no
team collaboration, no migration of the real database off this sandbox
engine, no native ecommerce, no production booking calendar, no full SEO
editor, no complete rollback UI, no marketing system. Nothing in this pass
touches any of those.

## 19. Tests and verification (§31–§33)

**New: `v8-6-deployment-test.js`** — 67 assertions, **0 failures**.
Deliberately written without Playwright/browser automation (documented in
its own header comment): every required behavior is provable via plain
`fetch` against `mock-server.js`, direct in-process calls into
`lib/export-compiler.js`, and plain Node HTTP servers (including
child-process-spawned ones) for the artifact-smoke-test requirements —
judged more reliable and faster than driving a browser for what is
fundamentally a backend compiler/API surface. Covers: unpurchased export
refused, owner can export, cross-account IDOR-safe, exact-revision
binding, stale revision refused, static/server_required classification
correctness for every module type, all pages exported with working
navigation and surviving CTA targets, V8.4 modules intact, production
forms never falsely claim delivery, unconfigured integrations honestly
blocked, assets resolve and dedupe with no image-generation triggered,
reproducible hash (stable across a no-op re-export, changed after a real
edit), path traversal rejected (via the raw-socket technique, part 15),
malicious filenames sanitized safely, no secrets/account UI in the export,
deployment records created with valid state transitions, client cannot
self-mark `live`, deployed-vs-current revision tracked, a failed
subsequent deployment preserves the previous live/ready metadata, a
static-only host target rejects a server-required project, hosting
recommendation matches runtime requirements, affiliate metadata never
affects compiler output, domain validation/DNS instructions/no false
verification, the downloadable archive contains only expected files,
cross-device access works, and V8.5's own invariants (ownership, purchase
gating, revision CAS) still hold through the new export path. Two
test-assertion bugs (not product bugs) were found and fixed while first
running this suite: two checks assumed exactly 2 `ready` deployment rows
would exist at a point in the sequence where the test's own call order
legitimately produces 3 (an extra reproducibility re-export) — corrected
the assertions to match the real, intended sequence, not loosened.

**Additional smoke coverage** (§33, throwaway scripts, not part of the
delivered suite): a full HTTP walk of every new route in realistic order
(signup → create → export-before-purchase 403 → real checkout + signed
webhook → export 201 → re-export 201 → stale-revision 409 → real zip
download → deployments list → hosting recommendation → provider catalog →
honest railway-deploy failure → domain instructions → unreachable-domain
verify → invalid-domain 400 → cross-account 404s) — all passed. Direct
`node --check` on every new/modified file. `git diff --check` on the full
staged diff: clean.

**Exported-artifact smoke tests, run for real** (§33): a compiled static
export served over a real local `http.createServer` (index + secondary
page both directly reachable at their own routes, nav between them
working); a compiled `server_required` export's own generated `server.js`
spawned as a real child process — served its own site, accepted and
validated a real submission (rejecting a missing required field / bad
email), returned the project's own real success message, and its static
file serving independently confirmed the same raw-socket path-traversal
403 as `mock-server.js`.

**Migration upgrade test**: `0002_deployments.sql` applied on top of a
database already carrying real V8.5-shaped data (an existing account +
purchased project, not an empty DB) — the new tables appear, the existing
`projects` row and its `deployment_status` default are untouched, and
`schema_migrations` tracks both `0001` and `0002` without re-applying
either.

**Full regression, fresh `mock-server.js`, this pass:**

| Suite | Result |
|---|---|
| v5-lead-test.js | PASS |
| v5-serialize-test.js | PASS |
| v8-1-directions-test.js | 13/13 PASS |
| v8-1-1-concurrency-test.js | 13/13 PASS |
| v8-1-2-rollback-test.js | 13/13 PASS |
| v8-2-pages-test.js | 18/18 PASS |
| v8-3-editor-test.js | 19/19 PASS |
| v8-4-functionality-test.js | 18/18 PASS |
| v8-5-ownership-test.js | ALL PASS (Section A backend + Section B real Playwright browser run) |
| **v8-6-deployment-test.js (new)** | **67/67 PASS**, re-confirmed on a freshly restarted server after the baseline cross-check below |

**Two suites reproduce known, pre-existing, unrelated issues** (both
already documented in the V8.5 report; re-confirmed, not newly
introduced):

- `v5-asset-test.js`: the same pre-existing stale-element-handle crash
  after gallery/asset diagnostics — identical to baseline.
- `v8-claude-plan-test.js`: the same flaky `/api/plan-website` call-count
  assertion. This pass went one step further than re-reading the prior
  report: it was **formally re-run within this session** against the real
  unmodified `f8384d5` baseline (`git stash` on the repo, plus a
  temporarily route-stripped copy of `mock-server.js` — which lives
  outside the repo and isn't itself under git — so the baseline test ran
  against genuinely pre-V8.6 code, not V8.6 code with unrelated new routes
  merely present-but-unused). Result: the **identical assertion passed on
  one baseline run and had already been documented failing on another**,
  on byte-identical code — direct proof it's a timing-sensitive flake
  unrelated to any version in this series, not a V8.6 regression. The
  stashed changes were restored immediately after
  (`git stash pop`, diffed byte-for-byte against a pre-stash backup of the
  one non-repo file touched, `mock-server.js`, to confirm a clean
  restore), and `v8-6-deployment-test.js` was re-run to 67/67 on the
  restored server before proceeding.

Both pre-existing issues are left untouched, per this engagement's
standing discipline of only fixing what a given pass actually caused.

`node --check` passes on every changed/new `.js` file. `git diff --check`
is clean on the full staged diff.

## 20. Database migrations

`migrations/0002_deployments.sql` — purely additive (part 10), applied
automatically by the same `lib/db.js` runner V8.5 established;
`0001_init.sql` is never rewritten. Verified against a database already
shaped like a real V8.5 deployment (part 19), not just an empty one.

## 21. Files changed / added

**New:**
- `lib/site-render.js` — Node-only ported renderer (part 2)
- `lib/runtime-classifier.js` — static/server_required classification (part 3)
- `lib/export-compiler.js` — the core compiler (parts 4–9)
- `lib/archive.js` — safe zip archiving (part 15)
- `lib/deployment-store.js` — deployment/domain record CRUD + state machine (part 10)
- `lib/hosting.js` — deployment-target abstraction + recommendation (parts 8, 11)
- `lib/domain.js` — domain validation, DNS instructions, SSRF-safe verification (part 12)
- `migrations/0002_deployments.sql` (part 20)
- `SITE-PROJECT-V8.6.md` (this file)

**Modified:**
- `lib/project-store.js` — additive only: `getOwnedProjectRaw` (raw
  directionsState access for the compiler), `ASSET_STORE_DIR` exported.
  Zero changes to any existing V8.1–V8.5 function.
- `server.js` — new `lib/` requires; ~10 new ownership-scoped routes for
  export/deployments/hosting/domains (part 17's UI talks to these).
  `node --check` passes (not runtime-tested directly — `express` isn't
  installed in this sandbox, same standing constraint as every prior
  version).
- `mock-server.js` (outside the repo, one directory up — the file every
  Playwright/HTTP test in this session actually runs against) — the real,
  runtime-verified mirror of the same route set, using the exact same
  `lib/` modules.
- `index.html` — new `#exportPanel` section (part 17). All new element ids
  verified unique.
- `script.js` — two additive, guarded hook-line insertions into existing
  V8.5 functions, plus one new module appended at the end of the file
  (part 2, part 17). `node --check` passes.

## Commit / handoff

- Commit hash: **see the accompanying delivery message** (created after
  this report, per the established V8.1.2–V8.5 workflow — this file is
  committed together with it).
- `origin/main` was **not** touched — this work is local to the
  `generator-v8` branch only, matching every prior version in this series.
- Delivered the same way as V8.1.2–V8.5: a verified git bundle of the full
  branch history plus this report, via file delivery.
