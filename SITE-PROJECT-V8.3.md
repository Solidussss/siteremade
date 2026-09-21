# SiteRemade V8.3 — direction remixing + a real page/section editor

Branch: `generator-v8`, on top of V8.2 (`d27cb20`). **Not deployed.**

A non-AI editing layer over the exact model V8.2 established. Every edit
is a real mutation of `project.pages[].sections[]` (or the project-level
`design`/`copy` fields for hero remixing), made instantly, through the
existing renderer, with zero Claude calls. V8.2 is treated as frozen and
regression-protected throughout — the editor is a view/controller over the
same model, not a second parallel document.

---

## 1. Editor data-model changes

Every page and section gets a **stable, unique `id`**:

```js
proj.pages[i].id            // e.g. "page_pricing_mub8f6xyz12"
proj.pages[i].sections[j].id // already existed since V8.2 for most paths;
                              // now guaranteed universally
```

`ensureEditorIds(proj)` assigns an id to any page/section that doesn't
already have one, and is called once, unconditionally, as the second line
of `renderProject()` (right after V8.2's own `syncActivePageSections`).
Because it only ever *adds* an id when one is missing and never
regenerates an existing one, it's idempotent and the id it assigns is
permanently stable across reorders, duplications, page moves, direction
switches, and save/restore — it's a real mutation of the live object, so
it round-trips through JSON exactly like every other field. This one call
site is what makes a pre-V8.3 project (including a true legacy V8.2 save
with `pages[]` but no ids at all) get real, usable ids the instant it's
rendered, with zero changes needed anywhere else in the app.

Editable sections are never identified by array index — every operation
below takes a `(pageId, sectionId)` pair and looks the object up by id.

## 2. Section-operation APIs

All pure, synchronous mutations of the model, in the new "V8.3:
editor/remix model" section of `script.js`:

```js
moveSection(proj, pageId, sectionId, targetIndex)
duplicateSection(proj, pageId, sectionId)                 // -> new section or null
removeSection(proj, pageId, sectionId)
moveSectionToPage(proj, sourcePageId, sectionId, targetPageId, targetIndex)
importSectionFromDirection(sourceDirIdx, sourcePageId, sectionId, targetPageId, targetIndex) // -> new section or null
```

`duplicateSection`/`importSectionFromDirection` both go through
`cloneSectionForInsert()`, which assigns a brand-new id via
`newSectionId()` and deep-clones the section's `copy` object (a JSON
round-trip) so the clone never shares a mutable reference with its
source — confirmed by a dedicated test that edits an imported copy on the
destination direction and checks the source direction's own rendered text
is untouched.

`importSectionFromDirection` only ever accepts a section whose `type` is
still in `CLAUDE_SECTION_TYPE_KEYS` (the same controlled vocabulary
`normalizeClaudePlan` enforces on a Claude response) and only ever reads
from the source direction — it never assigns into or mutates it. Hero and
footer remain chrome, exactly as V8.2 established: there is no section
object for either, so neither can be duplicated, moved, or imported as if
it were ordinary content. "Bring the hero from Direction 2" is instead
`importHeroFromDirection(sourceDirIdx)` — a small, honest operation that
copies just `design.dimensions.hero` and the hero copy fields, which is
the real renderable equivalent of importing a hero.

## 3. Page-operation APIs

```js
addPage(proj, label)                        // -> new page or null (capped at MAX_PAGES=6)
renamePage(proj, pageId, newLabel)
changePageSlug(proj, pageId, newSlugRaw)     // refuses on Home (index 0)
reorderPage(proj, pageId, targetIndex)       // refuses to move Home or move anything to index 0
removePage(proj, pageId)                     // refuses on Home; moves activePageIndex to a valid survivor
```

Home's invariants from V8.2 are the enforced source of truth throughout:
index 0, slug `''`, unremovable, unreorderable. The shipped UI doesn't
even render a remove/reorder control while Home is selected (verified by
a DOM-level test), and every operation additionally refuses at the model
level regardless of what the UI does or doesn't offer — the guardrail is
never UI-only. `addPage`'s own slug never collides with Home's reserved
`''` because it seeds `usedSlugs` from every existing page's slug,
including Home's.

## 4. Hero/layout remix behavior

```js
swapHeroLayout(proj, newHeroKey)                                  // any of the 10 real hero layouts
swapSectionVariant(proj, pageId, sectionId, newVariant)            // only a variant that renderer branches on
```

`SECTION_VARIANT_OPTIONS` only offers a variant a renderer actually
branches on (`services`, `gallery`/`caseStudies`, `testimonial`, `about`,
`ctaBanner`) — never a phantom option that would silently no-op. Neither
function makes a Claude call or touches copy/content; both are pure
presentation swaps, and whether a new image is needed is decided entirely
downstream, by the same `buildImagePlan`/`resolveImagePlanAssets` funnel
V8.2 already uses — nothing here special-cases image planning. Confirmed
empirically: switching between two *visual* hero layouts reuses the exact
same cached hero image (the cache key never encodes the hero layout
itself), while swapping an `about` section from `statement` to `split`
(which does introduce a real image slot) fires exactly one new request,
and repeating the identical swap never duplicates it.

## 5. Cross-direction import behavior

`importSectionFromDirection` copies (never moves, never shares
references) one real content section from any other existing direction's
page into the current direction's chosen page. A dedicated test:
generates two directions with distinct content, imports a section from
Direction 1 into Direction 2, edits the imported copy on Direction 2, and
confirms Direction 1's own rendered text is byte-for-byte unchanged.
Image bindings are never a literal field stored on the section — a
section's image slot is always *derived* at render time from
`pageSlotPrefix(page) + role` (V8.2), so an imported `productShowcase`/
`about`/`imageLedEditorial` section automatically gets a correctly-scoped,
non-colliding slot name on its new page the next time the image plan is
built, with no explicit "reference normalization" step needed — this
naturally satisfies "normalize it safely for the destination instead of
creating collisions."

## 6. Undo/redo architecture

Bounded (40 states), whole-project immutable JSON snapshots — not
fragile partial inverse operations, per the task's own guidance. The
history is keyed by the direction **object's own identity** via a
`WeakMap`, not an array index or a stored id:

```js
const editorHistory = new WeakMap(); // direction object -> {undo:[], redo:[]}
```

This single design choice satisfies almost every undo/redo requirement
for free, with no explicit reset code anywhere:

- **Direction switching is never an undo event** — nothing about
  `switchDirection` touches the WeakMap at all.
- **Generation completion establishes a fresh baseline** — a newly
  admitted direction is always a brand-new object the WeakMap has never
  seen, so its history starts empty automatically.
- **Restoring a saved project establishes a fresh baseline** — same
  reasoning; `loadProjectFromStorage` always builds new objects from
  `JSON.parse`.
- **Each direction gets its own independent history** — verified: editing
  Direction 1, switching to a freshly-generated Direction 2 (empty
  history), then switching back to Direction 1 restores both its edited
  content *and* its own undo depth.
- **No memory leak across repeated load/restore cycles** — a `WeakMap`
  (not a `Map`) lets a superseded direction's snapshots be garbage
  collected the moment nothing else references that direction object.

Every editor UI action funnels through one entry point,
`runEditorAction(mutateFn, imagesMayChange)`: push a snapshot, run the
mutation, and — only if it actually succeeded — render, persist, and
optionally call `resolveImagePlanAssets` (whose own cache-key dedupe
check is what makes calling it after every structural edit safe and
free of duplicate requests). A refused edit (an invalid id, a guardrail
like "Home can't be removed") pops its own just-pushed snapshot back off
rather than leaving a no-op entry in history. `editorUndo`/`editorRedo`
themselves never call `renderProject` directly except through the shared
`applyRestoredSnapshot`, which replaces the active direction object's
*contents* in place (never its reference), keeping `directions[]`,
`project`, and this very WeakMap's key all consistent.

## 7. Image/cache implications

- Ordinary edits (reorder, rename a page's title, copy-text edits,
  add/remove a page with no image-bearing section, undo, redo) cause
  **zero** additional `/api/generate-image` calls — verified directly by
  running a whole batch of them and diffing the call count before/after.
- An edit that genuinely introduces a new image-bearing visual (a variant
  swap onto `about`'s `split` layout, or moving an image-bearing section
  onto a page that didn't have one) requests **exactly one** new image,
  and repeating the identical edit never duplicates it.
- **Renaming a page's slug migrates its already-generated images** to
  their new, correctly-prefixed cache keys (`migratePageImageCache`)
  instead of orphaning them — verified end-to-end: swap a variant to
  create an image, move the section to a second page (one new image for
  that page's own slot), then rename that page's slug, and confirm the
  image call count does **not** increase again. A still-in-flight
  request at the moment of a rename is deliberately dropped rather than
  migrated (its own eventual response safely no-ops against the deleted
  old key), so the very next `resolveImagePlanAssets` call starts one
  fresh, correctly-keyed request instead of leaving a permanently-stuck
  `pending` marker — a narrow, explicitly considered trade-off, not an
  oversight.
- Removing a page's own image-bearing sections leaves their cache entries
  simply inert/unreferenced (never looked up again) rather than being
  explicitly purged — the same tolerance V8.2's `cacheMatches` check
  already extends to any stale cache entry, so nothing is left in a state
  that could "break rendering."

## 8. Editor UI

Lives inside the existing "Advanced customization" collapsible drawer
(a new `control-block`), not as an overlay on the live preview — the
generated-site preview stays uncluttered. It offers: page tabs (reusing
`switchPage` itself, so navigating in the editor and navigating in the
live preview are the exact same action), per-page title/slug/reorder/
remove controls, a per-section card (reorder ↑/↓, duplicate, remove, move-
to-page, a layout/variant select where applicable, and text inputs for
whichever copy fields that section's own renderer actually reads), a
project-level hero-style select, an "import from another direction"
panel, and Undo/Redo buttons. All of it is wired through two delegated
listeners (click + change) on the panel's own stable outer container,
matching the exact pattern V8.2's `#siteNav` delegation already
established, since `renderEditorPanel` replaces every sub-panel's
`innerHTML` on each render.

## 9. Save/restore compatibility

Page ids, section ids, section order, page order, duplicated/imported
sections, copy edits, and variant/hero swaps are all plain JSON
properties on the project object already being saved — nothing new was
added to the save/restore mechanism itself, and a dedicated test confirms
a save → reload → restore round-trip reproduces the exact same section
id array, in the exact same order, with an edited copy field still intact.
A true legacy V8.2 project (real `pages[]`, but no `id` fields at all,
predating this pass) still loads and renders correctly, and gets real ids
the instant it's rendered. The undo/redo stack is explicitly **not**
persisted (in-memory only, per-direction, via the WeakMap) — it does not
need to survive a browser session, and doing so would mean serializing
potentially many full-project snapshots (including any embedded image
data) into `localStorage`, which is not "essentially free."

## 10. Direction / generation invariants — preserved

All frozen guarantees hold unchanged: the V8 transaction/admission model,
V8.1's cap/reservation, V8.1.1's concurrency lock, the V8.1.2 rollback
invariant (`directions.length > 0 ⟹ project === directions[activeDirectionIndex]`,
now also verified to preserve an in-progress editor edit *and* its undo
history through a rollback), and V8.2's per-direction page-state
isolation. `runEditorAction`, `editorUndo`, and `editorRedo` all refuse
outright while `generationInFlight` is true, the same guard
`switchDirection`/`switchPage` already use. Editing one direction never
mutates another unless the user explicitly imports a copied section from
it (verified: editing Direction 1 leaves a freshly-generated Direction 2
completely untouched, including its undo history).

---

## Files changed

```
 index.html |  15 ++
 script.js  | 654 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 styles.css |  54 +++++
 3 files changed, 723 insertions(+)
```

`server.js` is **unmodified** this pass — the task's schema-change escape
hatch was not needed; no server-side data was missing.

## New tests

`v8-3-editor-test.js` (new, Playwright against the mock server) —
**77/77 assertions pass**, covering: section reorder; duplicate produces a
unique id; remove; move a section across pages; import a section across
directions; the imported copy shares no reference with its source; the
source direction stays byte-for-byte unchanged after editing the
imported copy; add/rename/remove/reorder a page; slug sanitization and
dedup (including a forced collision); Home's remove/reorder controls
never even render; the 6-page cap enforced both by the UI and by the
model directly; hero layout swap; section variant swap; copy-field
editing; undo; redo; three sequential undo/redo operations restoring and
replaying exactly; zero `/api/plan-website` calls from any editor action;
zero duplicate `/api/generate-image` calls from ordinary edits, exactly
one call from an edit that genuinely introduces a new visual slot (with
no duplicate on repeat), and image-cache migration across a page rename;
save/restore preserving edits; a true legacy V8.2 project (no ids) still
loading and becoming immediately editable; direction switching preserving
each direction's independent edits *and* undo history; the V8.1.2
rollback invariant holding with an in-progress edit and its undo history
intact; and page navigation remaining zero-cost and not itself an undo
event.

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
| `v8-2-pages-test.js` | 61/61 PASS |
| `v8-3-editor-test.js` (new) | 77/77 PASS |

¹ One assertion in `v6-verify.js` — `elapsed < 2000ms` for a full
generation — is intermittently flaky in this specific container: it fails
roughly half the time with `elapsed` around 2100–2200ms. This was
investigated, not just retried: `git stash`-ing every V8.3 change and
running the *exact same, unmodified V8.2 code* through this same
assertion, repeatedly, in the same session, reproduces the identical
intermittent failure (elapsed times around 2000–2200ms on some runs,
300–800ms on others). This proves the flakiness is pre-existing CPU-
scheduling jitter in this sandboxed environment, not a V8.3 regression —
the table above reports a clean run of the unmodified suite.

No `mock-server.js` changes were needed — the new suite reuses the
existing `/__plan_website_calls`, `/__generate_image_calls`, and
`/__test/set-*-configured` endpoints exactly as v8.1.x/V8.2's suites do,
plus `page.route()` interception for deterministic multi-page/multi-
section plans in individual test blocks.

---

## Verification

- `node --check script.js` and `node --check server.js`: clean.
- `git diff --check`: clean (no whitespace errors).
- `git status --short`: only `index.html`, `script.js`, and `styles.css`
  touched this pass (plus this report) — `server.js` unmodified.
- `git fetch origin main`: tip is still `7ccf728` — **origin/main did not
  advance** since V8.1.1; `origin/main` remains an ancestor of this
  branch, so no merge was needed.

**Not deployed.**
