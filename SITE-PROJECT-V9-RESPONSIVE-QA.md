# SiteRemade V9.1 — Responsive Reliability + Final Product QA Pass

Scope: make the builder preview and every generated/exported website behave
correctly at desktop, tablet, and mobile widths — no new product features,
no architecture redesign, no changes to generator/provider economics, no
changes to the separate SiteRemade app.

## 1. Root cause

The generated website (`#builderSite`) renders directly inside SiteRemade's
own DOM — there is no iframe, no sandboxed document, and no scaled canvas.
It shares `styles.css` with the rest of the page. Before this pass, its
"mobile" treatment was split across two mechanisms, and BOTH were blind to
`.builder-site`'s own actual rendered width:

- A handful of selectors (~9) were gated on an ancestor **class**
  (`.builder-device.mobile`) — this worked at any real browser width, but
  covered only the nav, the base hero variant, and the default 3-column
  `.site-sections` grid.
- Everything else (services/pricing/feature/gallery/proof-stats/footer
  grids, 7 of 9 hero variants, most typography) was gated behind a real
  `@media (max-width: 720px)` **page-viewport** query. A page-viewport query
  can only ever see the real browser window's width — never an artificially
  narrowed preview container — so switching the in-app Desktop/Mobile
  toggle (which only ever changed `.builder-site`'s own pixel width) never
  made these rules fire while the real browser stayed desktop-sized. The
  desktop-sized CSS just got squeezed into a 390px box: multi-column grids
  stayed multi-column, `vw`-relative typography kept measuring the real
  window instead of the box — this is exactly the reported "heavily
  zoomed-in desktop layout inside the mobile frame."
- Separately, `lib/site-render.js` (the server-side export renderer) never
  applied the "no funded hero image → text-only hero" downgrade at all — it
  read `dims.hero` directly. A purchased/exported site with an unfunded
  hero could render an image-bearing hero layout with nothing real in the
  image slot, even though the live preview correctly showed a clean
  text-only hero for the exact same project.

## 2. The fix: CSS container queries

`.builder-site` now declares `container-type: inline-size`. Every
responsive rule for generated-site content is declared (or re-declared) as
a CSS `@container` query against that container, instead of a page-level
`@media` query or an ancestor class. A container query measures the
element's own real layout box — never the page viewport, and never any
`transform` applied to an ancestor — so the same rules now correctly fire:

- inside the builder preview, at whatever width the Desktop/Tablet/Mobile
  toggle sets on `.builder-site` (1440-ish/768px/390px), regardless of the
  real browser window's own size;
- in a real exported/purchased site (`lib/export-compiler.js` copies this
  exact same `styles.css` into every export), where `.builder-site` simply
  fills the real page, making its container width equal to the real
  viewport width there too.

One responsive system now drives both the live preview and every export.
Nothing pre-existing was removed — the old class/`@media`-based rules stay
in place (harmless, identical-value duplication where they already
overlapped) and still correctly handle SiteRemade's own builder chrome at a
genuinely small real browser width.

A Tablet mode (`~768px`) was added alongside the existing Desktop/Mobile
toggle (`script.js`'s `applyDeviceMode`, a single source of truth for the
`data-device` attribute + `.tablet`/`.mobile` classes, used by both the
click handler and project-restore). The narrow-real-browser "shrink desktop
preview to fit" `transform: scale()` hack is now explicitly guarded off
while Tablet or Mobile mode is active (`:not(.mobile):not(.tablet)`), so it
never compounds with a deliberately-set device width — confirmed by
Playwright: `.builder-site` renders at a single, non-drifting width across
repeated Desktop→Mobile→Tablet→Desktop→Mobile switching, and Mobile mode
stays a sane phone-width box even when the real browser window is itself
narrow.

## 3. Hero text-only fallback

`script.js`'s downgrade (`reconcileImageSupplyWithSections`) previously
collapsed every unfunded, image-bearing hero to the same flat
`'minimal-text-only'` layout, which is what made two materially different
businesses render an identical hero (the known `v8-claude-plan-test.js`
regression). It's replaced with `mapHeroToTextOnlyVariant`, a lookup table
that groups each image-bearing hero variant by visual family (bold/
immersive → `poster`, editorial/offset → `centered-oversized`, calm/
utility → `minimal-text-only`) — still deterministic, still always one of
the 3 deliberately text-only layouts, still never an empty image slot, but
no longer flattening every business to the same look. `lib/site-render.js`
gained the same mapping (`effectiveHeroLayout`, exported for
`lib/export-compiler.js`'s `data-hero` attribute too) so a purchased export
now makes the identical hero-layout decision the live preview already
made — previously a real, silent gap between preview and export.

## 4. Bug found and fixed by this pass's own test harness

While building the automated test harness, a real (pre-existing) bug
surfaced: `.site-nav div{display:none}` at mobile width matches **every**
direct `<div>` child of the nav — including `.site-brand-lockup` (the
business name/logo), not just `#siteNavLinks`. This silently hid the
business name at mobile width, in both the original class-based rule and
the equivalent new container-query rule. Both are now scoped to
`#siteNavLinks` specifically.

## 5. Production smoke-test checklist (manual, before a real deploy)

Paid image generation must stay OFF for all of these; no step below should
ever require a live Claude/OpenAI/image-provider credential.

1. Create an account (sign up) — confirm the signed-in panel appears and a
   session cookie is set.
2. Confirm daily credits are visible and correct for a fresh account.
3. Generate a website with providers mocked/unconfigured — confirm a real
   direction renders (deterministic engine path), and that switching to a
   configured-but-mocked Claude provider also works and decrements the
   Claude-direction/credit counters honestly.
4. Desktop → Tablet → Mobile → Desktop, repeatedly — confirm the preview
   visibly changes proportions each time (not just the outer frame), with
   no stale layout, no zoom drift, and no need to regenerate.
5. Save/reload the project (sign out, sign back in, or open a second
   browser) — confirm the saved direction and device mode restore exactly.
6. Purchase (checkout + webhook) — confirm the purchase snapshot appears,
   is immutable, and the live draft stays editable afterward.
7. My Websites — confirm the purchased project is listed, with correct
   name, snapshot badge, and hosting status.
8. Export ZIP — download, extract, and open `index.html` directly
   (`file://`) at 1440×900, 768×1024, and 390×844: confirm no horizontal
   scroll, a readable/responsive hero, a visible business name, and a
   footer/nav that fit at every size.
9. If the export is `server_required` (has a real form), run
   `node server.js` from the extracted export and submit the form —
   confirm a real validated submission is recorded (or delivered, if
   `SUBMISSION_BACKEND=webhook` is configured).
10. Redeploy/restart the SiteRemade server itself against the same
    database/exports/asset-store paths — confirm credits, purchases, and
    My Websites all persist unchanged (this is the durable-persistence
    guarantee from the prior deployment-safety pass, still intact).
11. Throughout all of the above, confirm zero real calls to a paid image
    provider were made (check `/api/image-provider-status` / the paid-image
    kill switch state, and that no `data/asset-store` files were written
    beyond whatever the test's own mocked/user-uploaded assets produced).

## 6. Known remaining responsive limitations

- Container queries require a modern browser (all evergreen browsers since
  2023); there is no fallback rendering path for an ancient browser without
  container-query support — acceptable given this is also true of the rest
  of the app's CSS (`color-mix()`, `clamp()`, CSS grid).
- The in-app "Desktop" preview width is never literally 1440px — it's
  whatever the preview panel naturally measures (roughly 900–1400px
  depending on the real browser window), matching how it already behaved
  before this pass. Shrinking the real browser window while in Desktop mode
  will legitimately narrow `.builder-site` and can cross into the
  "compact"/tablet-tier container-query breakpoint — this is correct,
  real responsive behavior (the same thing a genuinely narrow desktop
  browser visiting a real site would do), not a bug, but it does mean
  "Desktop mode" is not a hard guarantee of desktop-tier layout on a very
  small physical laptop screen.
- The container-query responsive layer covers every section type
  `lib/site-render.js` currently emits, exercised by the 6 archetype
  fixtures in `primtest/v9-responsive-fixtures.js` — a future new section
  type would need its own container-query rules added the same way.
