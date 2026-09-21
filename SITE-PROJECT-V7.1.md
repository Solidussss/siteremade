# SiteRemade generator — V7.1: wire real async image generation

V7 built a real, ready-to-activate server-side image-provider abstraction
(`server.js`) but never actually called it from the client. This pass
closes exactly that gap: `renderVisualSlot`/`buildImagePlan` marked a slot
`sourceType: 'generated'` whenever the provider was configured, but nothing
ever issued `POST /api/generate-image`, so a configured `OPENAI_API_KEY`
would still render the same designed CSS fallback as an unconfigured one.
Nothing else about V7 changes; this is a targeted fix plus its tests.
Not deployed.

## 1. The bug, precisely

`buildImagePlan()` computed `sourceType` from provider status alone:

```js
const sourceType = assetId ? 'user' : (providerConfigured ? 'generated' : 'designed');
```

`renderVisualSlot()` never read that field at all — it only ever checked
for a user asset, and otherwise always rendered the `.visual-generated` CSS
div:

```js
function renderVisualSlot(project, role, imageryKey, assetId) {
  const asset = assetId ? project.assets.items.find(a => a.id === assetId) : null;
  if (asset) return `<img ... />`;
  return `<div class="visual-generated" data-imagery="${imageryKey}" ...></div>`;
}
```

So `sourceType: 'generated'` was purely descriptive metadata nothing acted
on. No code path anywhere called `fetch('/api/generate-image', ...)`.
Configuring a real key would change nothing a visitor could see.

While fixing this, two more instances of the same class of bug turned up:
two of the ten hero layouts — **`grid-dashboard`** and
**`product-screenshot`** — never called `renderVisualSlot` at all for their
main visual; they rendered static empty divs (`<div class="dash-panel">`,
`<div class="hero-product-body" data-imagery="...">`) with no CSS rule ever
painting them. So even a **user-uploaded** hero image was invisible on
those two layouts, before this fix or after V7. Both are corrected below —
they now render the same funnelled visual as every other hero layout.

## 2. The real flow, now actually wired

```
WebsiteProject → imagePlan (one entry per real, currently-rendered DOM slot)
             → resolveImagePlanAssets() checks each 'generated' entry's cache
             → cache miss → POST /api/generate-image (async, non-blocking)
             → dataUrl stored in project.assets.generated[slot]
             → renderProject() re-renders that slot as a real <img>
             → cache hit (ordinary refinement) → no request at all
```

`resolveImagePlanAssets()` is the **only** function that calls
`POST /api/generate-image`. It is never called from `renderProject` or
`renderVisualSlot` — those stay pure and synchronous, so a color tweak,
tone toggle, layout preview or device switch can call `renderProject` as
many times as it wants without ever re-requesting an image. It's called
instead from the specific points where the image-relevant identity of the
project can actually change: finishing a Generate, hitting Regenerate,
uploading or removing an asset, toggling a section on, changing industry,
restoring a save, and the provider-status check resolving after load.

**Caching, precisely.** Each `imagePlan` entry carries a `cacheKey` —
`hash(categoryKey :: imagery :: role :: slot :: source text)` — deliberately
excluding palette, tone, hero-layout preview and device, which are the
things ordinary refinement changes. `project.assets.generated[slot]`
stores `{cacheKey, status, dataUrl, prompt}`. Before firing a request,
`resolveImagePlanAssets` skips any slot whose cache already matches and is
`ready` or `pending` — so `renderProject` being called 50 times during one
editing session never produces more than one request per slot per real
change. A full "Generate" submission resets `assets.generated` to `{}` (a
new business's plan doesn't inherit stale entries), but keeps any uploaded
assets, matching the brief.

**Rendering, precisely.** `renderVisualSlot` now checks
`project.assets.generated[slot]` against the *current* `imagePlan` entry's
`cacheKey` before ever showing a cached image — if the business changed
since that image was generated (e.g. a manual industry override), the
stale image is simply never shown; the slot falls back to the designed CSS
treatment until a fresh request resolves. A pending request renders the
same CSS fallback with an honest `"Generating hero image…"` label (a real
status, not decorative chrome — it appears only while a request for that
exact slot is actually in flight, and disappears the moment it resolves or
fails).

**Failure handling.** A non-200/`ok:false`/network-error response marks the
slot `status: 'error'` and the CSS fallback renders — no crash, no stuck
spinner, no fake image.

**Never wasting a request.** Two refinements beyond the minimum fix:
- `about` is only planned when the section will actually render a visual
  (variant `'split'`, or an upload already exists) — the `'statement'`
  variant never shows one.
- The hero slot is not planned at all when the composed hero layout is
  `centered-oversized`, `minimal-text-only` or `poster` — those three are
  deliberately text-only treatments that never call `renderVisualSlot`.
  Before this exclusion, those categories (2 of the 8 diversity prompts:
  roofing → `minimal-text-only`, the nonprofit → `centered-oversized`)
  would have silently paid for a hero image nothing ever displayed.

**Save/restore.** `project.assets.generated` is plain JSON on `project`,
so `serializeProject` (a straight `JSON.stringify`) carries it through
save/restore automatically, the same as uploaded assets — confirmed by
test (part 4).

## 2a. A second latent bug the fix itself exposed

Verifying part 2 with a real (mocked) generated `<img>` — not just checking
`sourceType`, per the request — turned up a second, unrelated CSS bug:
`.product-frame` (the container for the `productShowcase` section's visual)
only ever had `min-height: 220px`, never a real `height`. The old CSS-only
fallback (a plain `<div>`) happened to collapse to that minimum harmlessly.
A real `<img>`, being a replaced element, instead computed its own height
from its intrinsic aspect ratio against the frame's full content-column
width whenever no ancestor had a definite height — ballooning a full-bleed
section to roughly **its own width** (~930px tall on a typical desktop,
confirmed by measuring the live DOM, not by inspection). This means: a
real user-uploaded product image would have hit this exact bug already, in
plain V7, independent of anything in this pass — it just never showed up
because no test had put a real `<img>` into that slot before. Fixed with a
real `height: 340px` + `object-fit: cover`, the same pattern every other
working visual container here already uses (`.site-visual`,
`.editorial-visual`, `.hero-stacked-visual`). A `git log` note: this
landed as its own commit (`V7.1 fix: give .product-frame a real height...`)
rather than folded into the first, so the two are easy to tell apart in
review.

## 3. Files changed this pass

- `script.js` — `renderVisualSlot`, `buildImagePlan` (rebuilt per-slot,
  cache-keyed), new `resolveImagePlanAssets` + `computeImageCacheKey` +
  `imageSlotLabel`, `renderHero`'s `grid-dashboard`/`product-screenshot`
  cases now route through the real visual slot, `assets.generated`
  initialized on project creation, `resolveImagePlanAssets` called from
  the 7 explicit trigger points listed above.
- `styles.css` — `.visual-generating` pulse + `.visual-generating-label`
  progress chip, `.site-visual-generated-img` fade-in, and the CSS needed
  for the two previously-blank hero layouts to actually display a visual
  (`.dash-panel-visual`, `.hero-product-body` sizing).
- `server.js` — **unchanged**. It already correctly implemented
  `OPENAI_API_KEY`, `imageProviders.openai`, `GET /api/image-provider-status`
  and `POST /api/generate-image`; the gap was entirely on the client side.
- `mock-server.js` (test harness only, not shipped) — added
  `POST /__test/set-provider-configured` and a mocked
  `POST /api/generate-image` (150ms simulated latency, returns a real tiny
  PNG data URL) so the configured path can be exercised end-to-end without
  real network access, plus `GET /__generate_image_calls` to inspect
  exactly what was requested and how many times.

## 4. Tests run (this pass)

All run against the mock server on `localhost:8099`, headless Chromium at
`/opt/pw-browsers/chromium`.

1. **`v7-1-image-gen-test.js`** — provider mocked "configured": generates
   an AI/Vancouver site, confirms the honest `"Generating…"` label appears
   before resolution, confirms the hero `<img>` ends up with the **exact
   dataUrl the mock server returned** (not just `sourceType==='generated'`),
   confirms a brand-color change and a tone toggle both cause **zero**
   additional `/api/generate-image` calls, then saves, hard-reloads the
   page, restores, and confirms the same generated image reappears with
   **zero** additional calls. Result: every assertion passed, 0 console
   errors.
2. **`v7-1-diversity-image-sweep.js`** — all 8 diversity prompts, provider
   configured: every `imagePlan` entry marked `'generated'` resolves to
   `'ready'` with a real `<img>` in the DOM; `roofing` (`minimal-text-only`)
   and the `nonprofit` (`centered-oversized`) correctly plan **zero** images
   (nothing to display, nothing requested); `creative studio`'s `collage`
   hero correctly requests both `hero` and `collage-2`. 8/8 pass, 0 errors.
3. **Not-configured path** (`debug-notconfigured.js`) — confirms the
   honest default (matches this sandbox and any deploy without a key) makes
   **zero** `/api/generate-image` calls and renders the plain designed CSS
   fallback, unchanged from V7.
4. **Failure path** (`debug-fail.js`) — provider configured but the route
   intercepted to return a 500: confirms a clean fallback to the designed
   CSS visual, no thrown errors, no stuck "Generating…" state.
5. **Full V6 regression suite** (`v6-verify.js`, 22 checks) — all pass
   unchanged.
6. **V7 diversity/mobile suite** (`v7-mobile-check.js`) — all 8 prompts,
   no mobile overflow, 0 console errors, unchanged from V7.
7. **V7 structural-diversity suite** (`v7-diversity.js`) — still 8/8 unique
   structural signatures after the hero-layout fixes.
8. **Container-sizing audit** (`v7-1-container-sizing-audit.js`) — the test
   that caught part 2a: measures every visual-slot container's real
   rendered height, with a real (mocked) generated `<img>` in place, across
   all 8 diversity prompts. Found `.product-frame` at 932px before the
   fix; confirms every container (`.site-visual`, `.about-visual`,
   `.product-frame`, `.editorial-visual`, `.hero-stacked-visual`,
   `.hero-asym-visual`, `.dash-panel-visual`, `.hero-product-body`,
   `.collage-card`) renders at its intended size afterward.

## 5. Not deployed

This branch (`generator-v7`) still only contains real, honestly-reported
behavior for this environment: no image-generation API is reachable here,
so the provider still reports `configured: false` and every generated site
still renders the designed CSS fallback in this sandbox. The fix makes the
already-built server-side provider actually take effect the moment a real
key is configured wherever this is deployed — nothing further needs to
change on activation.
