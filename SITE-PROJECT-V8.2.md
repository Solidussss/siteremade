# SiteRemade V8.2 — Multi-page rendering + structured Claude copy

Branch: `generator-v8`, on top of V8.1.2 (`3808509`). **Not deployed.**

One architectural pass: `project.pages[]` becomes the real unit of
navigation, and Claude's already-validated per-section copy is threaded
into every applicable renderer instead of being discarded after
`pages[0]`. V8.1/V8.1.1/V8.1.2 behavior is treated as frozen and
regression-protected throughout.

---

## 1. Project/page schema changes

`WebsiteProject` gains:

```js
proj.pages = [
  { id, slug, label, purpose, sections: [ /* content sections only */ ] },
  ...
];
proj.activePageIndex = 0;          // which page is on screen
proj.footerVariant = 'simple';     // moved off the old literal footer section
proj.sections;                     // now a live ALIAS: === proj.pages[proj.activePageIndex].sections
```

Business identity, `design` (dimensions/palette), `assets` (including the
generated-image cache), `intent`, and all other project-level metadata
stay exactly where they were — **not** duplicated per page. Only
navigable content moved under `pages[]`.

`proj.sections` is kept as a real array reference into the active page
(`proj.pages[proj.activePageIndex].sections`), not a copy, so every
existing single-page code path that reads `proj.sections` keeps working
unmodified. The risk with a reference alias is that code which
**reassigns** `proj.sections` wholesale (`toggleSection`'s filter, and
`buildGenerationPlan`'s structure step) would silently desync it from the
page array. This is handled by one new function, `syncActivePageSections(proj)`,
called as the very first line of `renderProject()` — the natural
after-every-mutation choke point — rather than by patching every mutation
site individually.

**Hero and footer are no longer content-section entries.** Previously a
page's `sections[]` literally contained `'hero'` and `'footer'` items;
now they're rendering chrome outside the page-content array:
`renderSections()` renders `renderHero()` (Home) or the new, lightweight
`renderPageHeader()` (secondary pages, no image slot) before the mapped
content sections, and `renderSiteFooter(proj, category, proj.footerVariant)`
after. `proj.footerVariant` carries what used to live on the footer
section object.

## 2. Claude schema / normalization changes

**No `server.js` changes were made or needed.** `WEBSITE_PLAN_TOOL`'s
`input_schema` already declared `pages[]` with per-page `id/label/purpose/sections[]`
and per-section `type/headline/subhead/body/ctaLabel/claims` back in V8 —
confirmed by a full read before writing any code, per the task's own
instruction to change the server schema only if it proved insufficient.
It didn't.

`normalizeClaudePlan()` (client-side, `script.js`) was **already**
validating every page in the array, not just `pages[0]` — already
producing sanitized `{id, label, purpose, sections:[{type, copy:{headline,
subhead, body, ctaLabel, claims}}]}` per page, already filtering unknown
section types against `CLAUDE_SECTION_TYPE_KEYS`, already dropping a page
if it lost all its sections, already rejecting the whole plan only if
zero pages survived. What V8.2 added is `buildClaudePages()`, which turns
that already-validated `pages[]` into the project's real page array:

- `sanitizeSlug()` / `uniqueSlug()` — slugs are lowercased, stripped to a
  safe `[a-z0-9-]` charset, collision-suffixed (`about`, `about-2`, ...).
  An unsafe label (HTML, `<script>` text) sanitizes to a safe slug and is
  still rendered only as escaped text in the nav, never as markup.
- Page 0 is **always** forced to slug `''` / role Home, regardless of
  what Claude called or ordered it, and any other page Claude tags as
  Home is dropped — no duplicate Home pages.
- `MAX_PAGES = 6` caps total page count; section-per-page caps and
  section-type validation were already enforced upstream in
  `normalizeClaudePlan()`.
- Degradation is per-field, not per-page or all-or-nothing: a page with
  one bad section keeps its other valid sections; a section with a valid
  headline but missing body keeps the headline and only backfills the
  body deterministically.
- Deterministic generation remains a complete, independent fallback:
  unconfigured/unusable Claude output still produces a real one-page
  (Home) site through the existing procedural section-composition path,
  untouched by any of this.

## 3. Renderer / navigation changes

`renderSections()` assembles `hero-or-pageHeader + mapped content
sections + footer`. When a direction has more than one page, the nav
becomes real page-link buttons (`.site-nav-link`, `data-page-index`)
instead of the original decorative spans; a single-page direction keeps
the exact original decorative nav, byte-for-byte.

Navigation is handled by one delegated click listener on the stable
`#siteNav` container (its children get replaced via `.innerHTML` on every
render, so a listener on the container, not the links, is what survives):
`.site-nav-link` and `.site-brand-lockup` (logo/business name) call the
new `switchPage(index)`; a CTA button can also target a page via
`findCtaTargetPage()`, and is only wired live when the site has more than
one page — otherwise it stays exactly as decorative as before.

`switchPage(index)` is a deliberate structural mirror of `switchDirection`:
it refuses outright while `generationInFlight` is true, makes **zero**
Claude or image-generation calls, sets `proj.activePageIndex`, re-syncs
`proj.sections`, and re-renders. It never touches `directions[]`,
`activeDirectionIndex`, or the 3-direction meter — changing pages is
explicitly not a new direction anywhere in the code.

Each direction keeps its own `pages[]`/`activePageIndex`, so switching
directions restores that direction's own page structure and the exact
page it was left on (verified: switch away from Direction 1 on its 3rd
page, back to Direction 2, back to Direction 1 — still on page 3 of 3).

**Browser History API — deliberately not wired.** The existing preview
already overloads the URL bar via a `#build` hash anchor and a
`?purchased=1#buy` query-param flow for the post-checkout thank-you
state. Wiring real `pushState`/`popstate` page navigation on top of that
would risk colliding with those two mechanisms (a back-button press
landing on the wrong hash state, or re-triggering the purchase-confirmation
branch) for a feature the task explicitly scoped as "if the preview
architecture supports it without destabilizing the generator." It
doesn't, cleanly, without a larger routing rework that risks the frozen
V8/V8.1/V8.1.2 invariants — so page navigation is in-memory
(`activePageIndex` state) only, and back/forward simply doesn't traverse
in-preview pages this pass. This is a considered omission, not an
oversight; it's a reasonable next slice for the future remix/editor
phase this task explicitly excluded.

## 4. Copy fallback — how it works

`sectionCopyField(section, field, fallback)` is the one primitive every
renderer uses: return `section.copy[field]` if Claude supplied a
non-empty, valid string for it, otherwise return the deterministic
`fallback` value. This is field-level, not section-level or page-level —
the spec's own example (valid heading + missing body → keep the heading,
deterministically supply only the body) is exactly what it does, and it's
now threaded into hero, services/features, product showcase, pricing,
FAQ, about, menu, testimonials, gallery/editorial supporting copy,
process, integrations, contact/service areas, CTA banners, and
newsletter/reservation sections — roughly seventeen renderers in total.

Two categories are **deliberately excluded** from Claude-authored text,
by design, not oversight:

- `renderProof` / `renderMetrics` — fact-gated content (customer counts,
  years in business, ratings). The schema has no fields for Claude to
  ground these in, so they stay fully deterministic/placeholder rather
  than risk fabricated numbers reaching the screen.
- Testimonial **quote text and attribution** — same reasoning; the
  section schema carries no per-quote structured fields, so inventing
  quote content or a named reviewer would be fabrication. Testimonial
  *labels/headings* around the quotes can still take Claude copy; the
  quote body and attribution cannot.

Nothing here ever invents an address, price, credential, or business
fact not present in the intake — the fallback is always the existing
deterministic generator, never a guess.

## 5. Design/rendering engine — preserved

Claude still only plans (JSON), never generates HTML/CSS; every page and
section renders through the same controlled vocabulary and renderer that
existed before this pass. Explicitly unchanged: V8 direction
transaction/admission behavior, V8.1 concurrency guarantees (the
in-flight lock, the 3-direction cap and reservation), the V8.1.2 rollback
invariant (`directions.length > 0 ⟹ project === directions[activeDirectionIndex]`,
now also verified to leave the rolled-back direction's *own* page
structure intact), the OpenAI image funnel/cache/dedup and user-image
priority, deterministic fallback, design dimensions/palette, the existing
refinement controls, and purchase behavior. `server.js`, `index.html`,
Supabase, Stripe, hosting/deployment, and the future remix editor were
not touched.

## 6. Image-generation implications

`buildImagePlan()` now iterates every page in `project.pages`, not just
the active one, so all of a direction's real visual slots are planned and
cached up front — but only slots that actually exist in the normalized
pages, nothing speculative. Slot naming is page-qualified but
**backward-compatible**: `pageSlotPrefix(page)` returns `''` for Home
(slug `''`), so Home's slots keep their exact legacy bare names (`hero`,
`product`, `about`, `gallery-featured`, ...) — verified byte-identical
against `v7-1-image-gen-test.js` and `v7-1-diversity-image-sweep.js`,
meaning pre-V8.2 cached generated images are still found under their
original keys with no wasted regeneration. Only secondary pages get a
`${slug}::` prefix, keeping their slots distinct without touching Home's
cache keys.

`switchPage()` never calls into image resolution — confirmed by the new
suite's explicit before/after `/api/generate-image` call-count check
across a page navigation (2 → 2, unchanged) and the matching
`/api/plan-website` check (1 → 1, unchanged): moving between pages costs
nothing.

## 7. UI

Secondary pages get the minimal navigation needed to feel like one real
site: real nav links, working logo/home click-back, and (when more than
one page exists) CTA buttons that can target a page. No editor UI, no
per-section controls beyond what already existed — that's explicitly
next-phase scope per the task.

---

## Files changed

```
 script.js  | 584 +++++++++++++++++++++++++++++++++++++++++++++++++------------
 styles.css |  24 +++
 2 files changed, 496 insertions(+), 112 deletions(-)
```

`server.js` and `index.html` are **unmodified** this pass (confirmed via
`git status --short` and `git diff --stat`).

## New tests

`v8-2-pages-test.js` (new, Playwright against the mock server) — **61/61
assertions pass**, covering all 16 required scenarios (the 17th,
"all previous suites remain green," is the full regression re-run below):
single-page Claude plan; multi-page Claude plan; a fully-malformed page
dropped while good pages survive; duplicate Home pages and unsafe/colliding
slugs normalized (including an XSS-attempt label sanitized to safe text
and never reaching the DOM as markup); one bad section type on a page not
killing that page's other valid sections; field-level Claude/deterministic
copy fallback (heading kept, missing body backfilled); deterministic
fallback still producing a full one-page site with Claude unconfigured;
a legacy V8.1.2 flat-`sections[]` save migrating into a single Home page
(business identity, content, and the old footer variant all preserved);
real page navigation via nav links and the logo/home control; direction
switching preserving each direction's own distinct page structure and
exact page position; the V8.1.2 rollback invariant holding with a
mid-generation failure on a multi-page direction (including that the
rolled-back direction's own page structure survives intact); zero
Claude/image calls from page navigation; the image plan covering only
real visual slots (2, not one-per-page); save/restore preserving all
pages and slugs; and a purchase summary describing all of a site's pages,
not just the one on screen.

## Full regression suite — re-run fresh, all green

Each suite run against an independently, freshly-restarted `mock-server.js`
process (a rapid back-to-back loop was tried first and produced two false
failures from a port-reuse race between kill and restart; each suite was
then re-run in isolation with a full kill/sleep/restart cycle, and both
"failures" reproduced as clean passes):

| Suite | Result |
|---|---|
| `v6-verify.js` | 22/22 (ALL CHECKS PASSED) |
| `v7-diversity.js` | 8/8 unique structural signatures |
| `v7-mobile-check.js` | 0 overflow / 0 errors, 8 prompts |
| `v7-1-image-gen-test.js` | all assertions true, 0 console/page errors |
| `v7-1-diversity-image-sweep.js` | 8/8 OK |
| `v7-1-container-sizing-audit.js` | 8/8 sane |
| `v8-claude-plan-test.js` | 20/20 PASS |
| `v8-1-directions-test.js` | 24/24 PASS |
| `v8-1-1-concurrency-test.js` | 36/36 PASS |
| `v8-1-2-rollback-test.js` | 18/18 PASS |
| `v8-2-pages-test.js` (new) | 61/61 PASS |

No `mock-server.js` changes were needed — its existing `buildMockPlan()`
already returns genuine multi-page plans for logistics/SaaS and
restaurant-style prompts (reused directly), plus the existing
`/__plan_website_calls`, `/__generate_image_calls`, and
`/__test/set-*-configured` endpoints. Malformed/edge-case plans were
injected in tests via Playwright's `page.route()` on `/api/plan-website`,
bypassing the mock server entirely for those specific cases — no
mock-server.js changes needed there either.

---

## Verification

- `node --check script.js` and `node --check server.js`: clean.
- `git diff --check`: clean (no whitespace errors).
- `git status --short`: only `script.js` and `styles.css` touched this
  pass (plus this report) — `server.js` and `index.html` unmodified.
- `git fetch origin main`: tip is still `7ccf728` (unchanged since
  V8.1.1/V8.1.2 — **origin/main did not advance**); `origin/main` remains
  an ancestor of this branch, so no merge was needed.

**Not deployed.**
