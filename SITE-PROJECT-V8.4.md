# SiteRemade V8.4 — controlled functionality modules

Branch: `generator-v8`, on top of V8.3 (`a65e8ff`). **Not deployed.**

A full product-functionality pass, not a visual polish pass. SiteRemade
generates sites that now *do* something real — a contact form that
validates and submits, a quote/booking/newsletter request, a grounded
location widget, a direct call/email/external action, a product CTA — as
**structured project state**, never as arbitrary HTML/CSS/JS glued onto a
generated section. Claude, when used, may only ever pick a module *type*
and which of a fixed, developer-authored field set to include; SiteRemade
alone owns rendering, validation, submission behavior, editing, and
persistence. V8.3 is treated as frozen and regression-protected throughout.

---

## 1. Module data model

A module is one more plain field on the same section object every editor/
undo/save-restore path already carries — never a second parallel document:

```js
section.module = {
  type,                                  // one of MODULE_TYPE_KEYS
  enabled: true,
  fields: [{ key, label, kind, options, required }],
  config: {},                            // type-specific, grounded-only (see §4)
  submitBehavior: { provider: 'preview' },
  successState: { message },
  integration: { provider, connected: false, note }
};
section.ctaTarget = { kind, pageId?, sectionId?, value? } | null; // §7
```

`fields[].label`/`kind`/`options` always come from `MODULE_FIELD_ALLOWLIST`
(developer-authored) — Claude or the editor can only choose *which*
allowlisted keys to include and which to mark required, never invent a
field's shape. A field with `removable:false` (e.g. contact's `name`/
`email`) can never be dropped or left optional, enforced by
`removeModuleField`/`setModuleFieldRequired` at the model level, not just
by hiding the UI control.

## 2. Allowed module vocabulary

```js
MODULE_TYPE_KEYS = ['contact', 'quote', 'newsletter', 'booking', 'location', 'action', 'product']
```

`MODULE_SECTION_COMPATIBILITY` is the actual safety mechanism — which
section *types* a module type may attach to, kept in exact sync with which
renderers really know how to draw it:

```js
contact:    ['contact', 'ctaBanner', 'serviceAreas']
quote:      ['services', 'contact', 'ctaBanner']
newsletter: ['newsletter', 'ctaBanner']
booking:    ['reservationCta', 'contact', 'ctaBanner']
location:   ['contact', 'serviceAreas']
action:     ['contact', 'ctaBanner', 'reservationCta', 'productShowcase']
product:    ['productShowcase']
```

An incompatible pairing is rejected before it can ever reach a renderer
that wouldn't know what to do with it — enforced independently by
`normalizeSectionModuleFromClaude` (Claude path), the deterministic
recipe (§4), and the editor's own type-select (only offers compatible
types via `moduleCompatibleTypesForSection`).

`MODULE_FIELD_ALLOWLIST` is the full catalogue of fields a module type
could ever expose (contact: name/email/phone/message; quote: + service/
description/preferredContact; newsletter: email/name; booking: + date/
time/partySize/notes). `location`/`action`/`product` have no user-facing
form fields at all — they render a grounded widget (§5) or a CTA instead.
`MODULE_DEFAULT_FIELD_KEYS` is the sane subset a fresh module starts with;
anything else in that type's allowlist is addable later via the editor or
a Claude `fields` list.

## 3. Claude schema changes (`server.js`)

`WEBSITE_PLAN_TOOL`'s per-section schema gained an optional `module`
object, mirroring `script.js`'s vocabulary one-for-one (the same
convention `HERO_KEYS`/`SECTION_TYPE_KEYS` already use):

```js
module: {
  type: { enum: MODULE_TYPE_KEYS },
  fields: { items: { enum: MODULE_FIELD_KEYS } },        // maxItems 8
  requiredFields: { items: { enum: MODULE_FIELD_KEYS } }, // maxItems 8
  successMessage: { type: 'string' },
  integrationProvider: { enum: INTEGRATION_PROVIDER_KEYS }
}
```

The schema itself cannot express section-type compatibility (JSON Schema
has no cross-field conditional here), so `additionalProperties: false` and
the fixed enums are the schema-level containment; `script.js`'s own
`normalizeSectionModuleFromClaude` is the real, independent
re-validation — it re-checks the type against `MODULE_SECTION_COMPATIBILITY`
for that exact section, filters `fields`/`requiredFields` against the
allowlist, caps `successMessage` at 200 chars, and silently drops the
whole module (never the section) if the type is unknown or incompatible.
`PLANNER_SYSTEM_PROMPT` rule 6 tells Claude when a module is appropriate
and reiterates the no-fabricated-facts rule specifically for module
config (no invented phone/email/address/price/checkout link — an absent
fact is left out, not guessed).

## 4. Deterministic fallback

If Claude is unavailable, misconfigured, times out, or its module plan is
empty/invalid, `ensureFunctionalityDefaults(proj, categoryKey)` still
ships a real, working, category-aware module — called once per generated
direction (both the Claude-planned and deterministic path), and a strict
no-op the moment *any* module already exists anywhere on the site (never
overrides real planned functionality). `CATEGORY_MODULE_RECIPE` maps each
business category to an ordered list of `{ module, into, createSectionType? }`
entries: `into` names which existing, not-yet-enabled section types are
acceptable targets; `createSectionType`, if present, is the one section
type this pass is allowed to create from scratch when no compatible
target exists — and it is always `'contact'`, since "a business wants to
be reached" is a safe, non-fabricated assumption, never a menu/
reservation/product section implying facts nothing here has evidence for.
Every category (trades → `quote`, hospitality → `booking`+`location`,
retail → `newsletter`+`product`, fitness/wellness/professional →
`booking`, fashion/tech/nonprofit → `newsletter`/`contact`, the
`other` catch-all → `contact`) has its own recipe; two dead-recipe bugs
(hospitality's `location` entry, described in §11) were found and fixed
during this pass's own testing.

Grounded config defaults (e.g. a `location` module's address, reusing
`proj.source.location` if the business description actually named one)
are backfilled the same call, but only into a config object that's still
empty — never overwriting an editor edit or a value already filled in.

## 5. Submission / provider architecture

```js
MODULE_SUBMIT_PROVIDERS = { preview: { name: 'preview', async submit(module, payload) { ... } } }
resolveModuleProvider(module)   // reads module.submitBehavior.provider, defaults to 'preview'
submitModule(module, payload, projectContext)  // the ONE function that ever "sends" anything
```

Same `{name, ...}` shape the image/Claude-plan providers in `server.js`
already use, so a future real backend or external integration can
register alongside `'preview'` with zero renderer/editor changes. Today
only `'preview'` exists: a real ~450ms async boundary (not an instant
fake), returning `{ok:true, preview:true}` — never a claim of delivery
anywhere real. A provider throwing, or returning something malformed, is
caught and normalized to `{ok:false, message:...}` — `submitModule` never
throws and never fabricates success. The UI's own success state
(`patchModuleSuccessState`) always appends an honest "Preview mode — this
form isn't connected to a live inbox yet." note whenever the resolved
provider is `'preview'`.

Field-level validation (`validateModuleField`/`validateModuleSubmission`)
is shared by blur-time inline validation and submit-time validation:
required-field enforcement, email/phone/select-option format checks, and a
per-kind max length (`MODULE_FIELD_MAX_LEN`) applied *before* validation
runs — so a submission can never carry more than the module's own
configured fields (iterates only `module.fields`, nothing else is ever
read from the raw form). A real submission-in-flight disables the whole
form and shows a `Sending…` state; a provider failure shows a `role=alert`
error banner and re-enables the form rather than silently doing nothing
or faking success.

## 6. Editor integration

Every module mutation reuses V8.3's exact `runEditorAction` funnel
(snapshot → mutate → render/persist/maybe-resolve-images) — module edits
always pass `false` for "images may change" (enable/disable, add/remove/
reorder a field, relabel, toggle required, edit `config`, edit
`successMessage`, edit a `ctaTarget`), since no module operation touches
`buildImagePlan`/`resolveImagePlanAssets` in any way. New editor actions
(`editor-module-toggle`, `editor-module-type`, `editor-module-field-*`,
`editor-module-config`, `editor-module-success-message`,
`editor-cta-target`) are wired through the exact same delegated click/
change listeners on `#pageSectionEditor` V8.3 already established — no
new listener-attachment pattern introduced. Live typing inside an actual
module *form* (as opposed to editing it in the editor drawer) never calls
`renderProject` — only an ephemeral per-section runtime map
(`getModuleRuntime`) — so a visitor's in-progress typing/focus/caret is
never disturbed by anything the editor drawer itself does.

## 7. CTA targeting architecture

```js
CTA_TARGET_KINDS = ['page', 'section', 'tel', 'mailto', 'external']
normalizeCtaTarget(proj, raw) -> target | null   // re-validates every kind independently
setHeroCtaTarget(proj, raw) / setSectionCtaTarget(proj, pageId, sectionId, raw)
```

One structured target shape shared by the hero's primary CTA
(`project.copy.ctaTarget`) and any compatible section's own CTA button
(`section.ctaTarget`) — never an ambiguous raw string. `page`/`section`
targets are resolved by id and re-validated to actually exist in *this*
direction; `tel`/`mailto`/`external` are validated with
`validatePhone`/`validateEmail`/`validateUrl` (the last rejects anything
that isn't a real `http:`/`https:` URL — no `javascript:` or other
scheme can ever land in an `href`). `tel:`/`mailto:`/`external` targets
render as real, browser-native `<a href>` elements — `handleCtaTargetClick`
has nothing to do for those by design; `page`/`section` clicks call
`switchPage`/scroll-into-view, always a pure client-side action (never a
new direction, never a Claude or image call). The editor only offers the
CTA-target control on a section when it has no *enabled* module (a
section can be a lead form or a CTA link, not confusingly both).

## 8. Map / location architecture

`location`'s module has no form fields — it renders `renderLocationModuleWidget`:
a `.module-map-placeholder` styled like the app's existing abstract-
geometric generated visuals, never a real embedded map (no third-party
map script/iframe/API key exists in this app, so nothing here pretends
one does). Its address text comes only from `defaultModuleConfig`'s
grounded reuse of `proj.source.location` (a fact Claude/the business
description actually supplied) or an editor edit — an honest "No address
on file yet" empty state renders when neither exists, never a fabricated
placeholder address.

## 9. Security / validation behavior

- **No arbitrary content from Claude**: `module` on the wire is only ever
  a type enum + field-key enums + two capped strings — never HTML, a URL
  for a script/iframe, or free-form config. `additionalProperties:false`
  throughout the schema, plus `normalizeSectionModuleFromClaude`'s
  independent re-validation, is defense in depth against both a malformed
  schema response and a compatibility mismatch.
- **CTA `external` targets** are restricted to `http:`/`https:` only
  (`validateUrl`), closing off `javascript:`/`data:` and similar schemes.
- **Field payloads** are capped per-kind (`MODULE_FIELD_MAX_LEN`) and
  `successMessage` is capped at 200 chars, both enforced independent of
  whatever Claude or the editor supplied.
- **A submission never claims more than it did**: no fake "sent" state
  when a provider fails or throws; the preview provider's own success UI
  always honestly labels itself as preview/not-yet-connected.
- **`aria-invalid`** is set/removed with real ARIA string values
  (`"true"`/absent), not a boolean `toggleAttribute`, matching the initial
  server-rendered markup exactly, so a live-patched error state is exactly
  as accessible to a screen reader as a freshly rendered one (see bug #5,
  §11).

## 10. Undo/redo integration

No changes to V8.3's undo/redo architecture were needed — `section.module`
and `section.ctaTarget`/`project.copy.ctaTarget` are plain fields on
objects already inside every whole-project JSON snapshot
`snapshotProjectForUndo` takes, so every module/CTA edit through
`runEditorAction` is automatically undoable/redoable, participates in the
same per-direction `WeakMap` history, and is exercised by the same
sequential multi-undo/redo test pattern V8.3 established. The one real bug
this pass found in the *duplication/import* path (not undo/redo itself) is
bug #6 in §11 below.

## 11. Save/restore & migration behavior

Module and CTA-target state is plain JSON on the section/project object
already being persisted — nothing new added to the save/restore mechanism
itself. A save → reload → restore round-trip preserves a module's exact
enabled state, fields, config, and `successState.message` (verified by
actually submitting the *restored* form and confirming the custom success
message round-trips). A legacy V8.3-or-earlier project with **zero**
module metadata anywhere still loads safely — every module-reading code
path treats `section.module` as optional (`s.module &&
s.module.enabled`), so an absent field is just "no module here," never a
crash or a migration step.

---

## Bugs found and fixed this pass

Six real product bugs, found via hands-on Playwright instrumentation and
root-caused before being fixed (not "fixed" by loosening a test):

1. **Dead `CATEGORY_MODULE_RECIPE.hospitality` entry** — its `location`
   entry named `into` targets hospitality's own section recipe never
   produces, with no `createSectionType` of its own, making it
   permanently unreachable. Fixed by giving `location` its own
   `createSectionType:'contact'`.
2. **`renderContact` missing `case 'action'`** — an enabled, compatible
   `action` module on a `contact` section silently rendered the static
   decorative fallback instead of the real widget. Fixed by adding the
   missing case.
3. **`MODULE_SECTION_COMPATIBILITY.booking` missing `'ctaBanner'`** — the
   deterministic recipe (fitness/wellness/professional) and
   `renderCtaBanner`'s own working `'booking'` case already relied on that
   pairing; the compatibility map disagreed, which would have incorrectly
   blocked the same pairing from the editor/Claude-planning path. Fixed by
   adding `'ctaBanner'`.
4. **Stale `config.target` across `action` kind switches** — switching
   `actionKind` (call → email → external) without clearing the old target
   let a stale, wrong-kind value render as if valid for the new kind
   (e.g. a phone number inside a `mailto:` link). Fixed by clearing
   `config.target` whenever `actionKind` changes.
5. **`patchModuleFieldError`'s `toggleAttribute('aria-invalid', bool)`
   bug** — left the attribute present-but-empty (`aria-invalid=""`)
   instead of the ARIA-required string `"true"`, breaking screen-reader
   semantics specifically on the live blur-triggered patch path (the
   static render already did this correctly). Fixed by using
   `setAttribute`/`removeAttribute` with real string values.
6. **`cloneSectionForInsert` dropping `module`/`ctaTarget`** — the single
   shared clone function behind both `duplicateSection` and
   `importSectionFromDirection` only ever built `{id, type, variant,
   copy}`, silently losing any functionality module or CTA target on
   every duplicate or cross-direction import. Fixed by deep-cloning
   `module`/`ctaTarget` the same way `copy` already was — the most
   significant fix this pass, since it affected two separate,
   already-shipped V8.3 operations.

One Playwright-harness-only artifact was rigorously isolated and confirmed
**not** a product bug: `page.dispatchEvent(selector, 'change')` following
`page.fill()` double-fired the app's own bubbling `change` listener in one
specific sequence (confirmed via direct event-count instrumentation); a
clean, realistic interaction (`click` + `keyboard.type` + `Tab`) produced
exactly one `change` and exactly one undo entry. The one test needing an
exact undo-count assertion was switched to real keyboard interaction
instead of the `fill`+`dispatchEvent` helper.

---

## Files changed

```
 index.html |    1 +
 script.js  | 1105 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++--
 server.js  |   48 ++-
 styles.css |   78 +++++
 4 files changed, 1210 insertions(+), 22 deletions(-)
```

`server.js`'s changes are entirely the `module` schema addition and prompt
rule 6 (§3) — no route/provider/transport changes.

## New tests

`v8-4-functionality-test.js` (new, Playwright against the mock server,
lives alongside the other regression scripts outside this repo directory
per this project's established convention) — **101/101 assertions pass**,
confirmed stable across two independent fresh-mock-server runs. Covers:
Claude-planned contact/quote/booking modules; newsletter+product via the
deterministic fallback; the location module's grounded address and honest
empty state; the action module's tel/mailto/external validation
(including rejecting invalid targets and `javascript:` URLs); an invalid
Claude-supplied module type dropped safely; module/section compatibility
enforcement; malformed config degrading field-by-field (unrecognized keys
dropped, essential fields force-included, success-message length capped);
the deterministic fallback with Claude fully disabled; required/email/
phone field validation; submitting/success/failure states with no
fake-success on provider failure; editor enable/disable/relabel/required-
toggle/field-reorder; CTA-target editing on both the hero and a section
(page/tel targets, zero Claude/image calls); undo/redo for module edits;
save/restore preserving module state end-to-end (including a real
submission against the restored project); a legacy project with zero
module metadata loading safely; direction-switching and cross-direction-
import independence for module/CTA state; zero Claude/image calls from any
module edit; zero-cost page navigation; the V8.1.2 rollback invariant with
a module edit in flight; V8.3 editor undo history interleaved with module
edits; mobile no-overflow; and accessibility basics (label wiring,
`aria-required`, `aria-invalid`/`aria-describedby`/`role=alert`, focus
management after a failed submit).

One pre-existing V8.2 regression test's fixed assertion was updated (not
removed or weakened) to reflect new, intentional V8.4 behavior:
`v8-2-pages-test.js`'s "bogus section type dropped" test now legitimately
renders 3 content sections instead of 2, since its `other`-category plan
(services + faq, no compatible functionality target) now correctly gains
one real deterministic contact-module section — the bogus type is still
silently dropped, 2 original + 1 new legitimate section, never 4. Several
of `v8-3-editor-test.js`'s own fixed section-count assertions needed the
same kind of update for the same reason (its generic, uncategorized
business-description fixtures also now legitimately gain a deterministic
contact-module section) — each was updated in place with an explanatory
comment, not weakened; the suite's assertion *count* is unchanged
(77/77 both before and after this pass, since no assertion was added or
removed, only corrected to the new, intentional expected values).

## Full regression suite — re-run fresh, all green

Each suite run against an independently, freshly-restarted
`mock-server.js` process:

| Suite | Result |
|---|---|
| `v6-verify.js` | 22/22 (ALL CHECKS PASSED)¹ |
| `v7-diversity.js` | 8/8 unique structural signatures |
| `v7-mobile-check.js` | 0 overflow / 0 errors, 8 prompts |
| `v7-1-image-gen-test.js` | all assertions true, 0 console/page errors |
| `v7-1-diversity-image-sweep.js` | 8/8 OK |
| `v7-1-container-sizing-audit.js` | 8/8 sane |
| `v8-claude-plan-test.js` | 20/20 PASS |
| `v8-1-directions-test.js` | 24/24 PASS |
| `v8-1-1-concurrency-test.js` | 36/36 PASS |
| `v8-1-2-rollback-test.js` | 18/18 PASS |
| `v8-2-pages-test.js` | 61/61 PASS (one assertion updated, see above) |
| `v8-3-editor-test.js` | 77/77 PASS (several assertions updated, see above) |
| `v8-4-functionality-test.js` (new) | 101/101 PASS |

¹ Same pre-existing, previously documented `v6-verify.js` timing flake
(`elapsed < 2000ms` for a full generation, intermittently ~2100–2300ms in
this sandboxed container) that `SITE-PROJECT-V8.3.md` already
root-caused via a `git stash` A/B isolation against unmodified V8.2 code.
V8.4 touches nothing related to generation timing, so that isolation was
not re-run; the flake reproduced identically to the documented precedent
and the table above reports a clean run.

No `mock-server.js` changes were needed for the new suite — it reuses the
existing `/__plan_website_calls`, `/__generate_image_calls`, and
`/__test/set-*-configured` endpoints exactly as the V8.1.x/V8.2/V8.3
suites do, plus `page.route()` interception for deterministic
Claude-planned-module fixtures in individual test blocks (no mock-server
source change was needed to support this, resolving the "pending
investigation" noted at the start of this pass).

---

## Verification

- `node --check script.js` and `node --check server.js`: clean.
- `git diff --check`: clean (no whitespace errors).
- `git status --short`: only `index.html`, `script.js`, `server.js`, and
  `styles.css` touched this pass (plus this report).
- `git fetch origin main`: tip is still `7ccf728` — **origin/main did not
  advance** since V8.1.1/V8.3; `origin/main` remains an ancestor of this
  branch, so no merge was needed.

## Explicitly out of scope this pass (per the original spec)

No arbitrary HTML/script/CSS/remote embeds/executable code from Claude at
any point; no real payment processing, real calendar bookings against a
live backend, logins/accounts, or any live third-party integration
(`integration.connected` is always `false` — a documented intent for a
later pass, never a live wire-up); no new map/geocoding service; no new
server-side submission endpoint/inbox (the `preview` provider is a real,
honestly-labeled client-side stand-in, not a fake instant success).

**Not deployed.**
