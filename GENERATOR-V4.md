# Generator V4 — broad positioning, compositional layer, picker scroll fix

This builds on `STYLE-SYSTEM-V3.md` (dimension-based style architecture, 20
named seeds, generator-first UX). V4 does not change that architecture's
shape; it does three things on top of it:

1. Makes the generator's own demo content (placeholder, example prompts,
   default category) broad by default instead of trade-default.
2. Turns the 20 named styles into **fallback seeds** for a real
   **compositional** layer: a generated result is assembled dimension by
   dimension from the description, and can diverge from every named preset.
3. Fixes a real usability bug in the style picker's horizontal scroll on
   desktop (especially short-height windows) and confirms it still works on
   mobile.

No AI/LLM call is introduced anywhere. Category detection, style-seed
ranking, and dimension composition are all deterministic keyword scoring —
same honest framing as V2/V3.

## 1. Broad demo content

**Categories (`categories` in script.js).** Renamed from `industries` and
reordered broad-first: `tech, finance, fashion, hospitality, creative,
fitness, realestate, wellness, retail, nonprofit, professional, education`,
then trades (`electrical, plumbing, landscaping, painting, roofing,
automotive, cleaning, renovation`), then `other` as the generic fallback.
Each entry carries category-specific kicker/headline/sub/services/CTA copy;
public product chrome (nav, footer, pricing, handoff) never assumes any one
of these.

**Category `<select>` bug fix.** The `<select id="industrySelect">` options
in `index.html` had never been updated when `finance` and `fashion` were
added to the `categories` object — the `<option>` elements for them simply
didn't exist, so a description that correctly detected `finance` or
`fashion` internally would fail to reflect it in the select (silently kept
whatever the browser's default was). Fixed by rebuilding the option list
to match `categories`' order exactly, with `other` ("General Business")
now explicitly `selected` as the pre-generation default — previously
nothing was marked `selected`, so the browser defaulted to the first listed
option ("Electrical"), meaning the un-generated initial state incorrectly
looked trade-flavored.

**Placeholder.** Hero textarea placeholder changed from a landscaping
example to `"A modern AI software company in Los Angeles building tools
for creative teams"`.

**Example chips.** Replaced two static trade chips with a dynamic
`#exampleChipRow`, populated at load from `EXAMPLE_PROMPTS`:

- 16 example descriptions, each tagged `weight: 'broad'` (12 entries —
  tech, finance, fashion, restaurant/hospitality, creative studio,
  fitness, real estate, SaaS, wellness, retail, nonprofit, professional
  services) or `weight: 'trade'` (4 entries).
- `pickExamples(n)` builds a pool where `broad` entries are repeated 4x and
  `trade` entries appear once, then samples `n` without replacement. Trades
  surface rarely, never as the default, while the pool still varies across
  page loads.
- Cities used across examples: Los Angeles, New York, San Francisco,
  Chicago, Miami, Toronto — all explicitly fictional/demo businesses, never
  implying SiteRemade is headquartered there or that they're real
  customers.
- Each rendered chip auto-fills the textarea, fires the live hero preview,
  and submits — same behavior as the old static chips.

## 2. Compositional layer — seeds, not a ceiling

The 20 named `styles` entries remain fully intact as a registry (nothing
removed), but they're now documented and used as **fallback anchors**, not
the exhaustive set of reachable outputs.

**`dimensionKeywords`** — one keyword map per dimension (hero, type, nav,
card, imagery, cta, colorBehavior, motion, spacing; pattern is derived
separately from category, unchanged from V3), independent of the
style-seed keyword map. E.g. `type['mono-technical'] = ['technical','data',
'software','engineering','analytics']` — a description can pull the
typography dimension toward "technical" even if its overall seed match is
something else entirely.

**`composeStyleFromAnalysis(text, seedKey)`** — for each dimension:
1. Score the text against that dimension's keyword map.
2. If any keyword hit at all, use the highest-scoring value for that
   dimension.
3. If no keyword hit, fall back to the seed's own value for that dimension.

Palette stays tied to the seed for now (coherent color relationships —
independent color generation is future work, not built this pass). Every
other dimension can diverge freely. `name`/`tagline` on the composed object
are inherited from the seed for display purposes (e.g. "Ledger" in the UI
copy) even when several dimensions have moved away from Ledger's own
preset — the seed is best understood as "nearest named neighbor," not "the
literal output."

**Verified divergence** (see verification section): a description that
pulls its category/seed toward `atelier` (via "handmade", "artisan") but
also carries "bold, technical, data-driven" language produces a composed
result where `type`, `nav`, `imagery`, `cta`, `colorBehavior`, and `motion`
all diverge from atelier's own preset values — a genuinely new combination,
not one of the 20 named looks.

**Wiring** — every path that used to apply a pure named preset now goes
through `applyComposed(seedKey, text)` instead:
- Explicit style-swatch clicks (recompose against the current description).
- Suggestion-chip clicks (the "try another style" alternates).
- Regenerate (cycles to the next ranked seed, recomposes against the same
  description).
- `finishGeneration` (the initial result).
- The hero live micro-preview (updates the style name shown as you type,
  before you've even generated).

This was a deliberate design choice: style is now an input the generator
folds into the result, not a static, disconnected output you pick from a
shelf.

**What's next (explicitly out of scope for this pass, called out for
transparency):** independent palette generation (currently still
seed-tied), and pattern-level (portfolio/proof/story-first) composition
from text signal rather than category alone. Both are natural extensions
of the same architecture — adding a dimension is a keyword-map entry, not
a new CSS block or a rewrite.

## 3. Style-picker scroll fix

**Root cause:** `.style-swatch-row` used `overflow-x:auto` with
`scrollbar-width:none` (hiding the native scrollbar for a cleaner look).
That gave touch and trackpad users native horizontal scroll, but a desktop
mouse user had no visible affordance and no way to scroll the row at all —
worse on short-height desktop windows, where the picker takes up a larger
share of the visible viewport and there's no room to just see more of the
page instead.

**Fix, three parts, all in addition to the working touch/trackpad
behavior:**

1. **Wheel-to-horizontal with edge handoff.** A `wheel` listener on the row
   redirects vertical wheel input into `scrollLeft` changes, but only while
   the row still has room to scroll in that direction — at either edge, the
   event is left alone so the page scrolls normally instead of trapping the
   user inside the picker.
2. **Click-and-drag for desktop mouse.** `pointerdown`/`pointermove`/
   `pointerup` on the row translate horizontal mouse movement into
   scrolling, skipped for touch (which already scrolls natively). A
   `dragging` class (which disables pointer-events on the swatches, so mid-
   drag movement doesn't also fire a swatch click) is added **only once
   real movement past a small threshold is detected** — not on
   `pointerdown` itself. This was caught in testing: an earlier version set
   the class immediately on `pointerdown`, which made every ordinary single
   click get swallowed by its own mousedown before the click event could
   ever reach the button. Fixed and re-verified (see below).
3. **Prev/next arrow buttons.** `#swatchScrollPrev` / `#swatchScrollNext`,
   wrapped around the row in a new `.style-swatch-scroller` flex container,
   scroll by a fixed amount and disable themselves at either end via
   `updateScrollButtons()` (bound to the row's `scroll` event and window
   `resize`).

**CSS added** (`styles.css`): `.style-swatch-scroller`,
`.swatch-scroll-btn` (with a `:disabled` dimmed state), `.style-swatch-
row.dragging`, `.example-chip-row` (the example chips are now one level
deeper in the DOM to make room for the dynamic mount point), plus a small
short-height-desktop tweak (`@media(max-width:1120px) and
(max-height:760px)`) that trims the picker's own top margin so it doesn't
compete for vertical space with the generator and preview on short
windows.

## Verification

All checks below run against the real file via Playwright + a headless
Chromium (`file://` URL, no server needed), same pattern as V3's
verification.

- **Category select default fix:** confirmed `#industrySelect` reads
  `other` ("General Business") before any generation, not the previous
  silent default of "Electrical".
- **Broad category detection, end to end:** generated from the user's own
  four example prompts (AI software company / private finance firm /
  fashion label / Japanese restaurant) and confirmed each one lands on the
  correct category (`tech`, `finance`, `fashion`, `hospitality`) with
  category-appropriate headline copy. This is what caught and proved the
  select-options bug above — `finance` and `fashion` scored correctly
  internally the whole time; only the UI reflection was broken.
- **Example chips:** confirmed 3 chips render on load from
  `EXAMPLE_PROMPTS`, each with a real business description and correct
  click-to-fill-and-submit behavior.
- **No horizontal overflow:** checked before generation and after, on
  desktop (1400×900), short desktop (1400×700), and mobile (390×844) — no
  failures.
- **Full 20-seed regression sweep** (desktop 1400×900 and mobile
  390×844): clicked every style swatch, confirmed each produces a distinct,
  correct `data-nav`/nav height (the V3 nav-height fix still holds — e.g.
  Foundry 177px, Monolith 179px, Editorial/Meridian/Atelier/Aviator ~122–
  124px, inline-nav styles 64–92px), no horizontal overflow anywhere, zero
  JS errors.
- **Compositional divergence:** proved programmatically (not just by
  reading the code) that a real description can produce a result whose
  dimensions differ from its own nearest seed's pure preset — see the
  atelier example above, with 6 of 9 dimensions diverging.
- **Scroll fix — desktop:** confirmed the row overflows as expected when
  there are more swatches than fit, prev/next buttons enable/disable
  correctly at each end, wheel input on the row moves `scrollLeft`, and
  click-and-drag scrolls the row.
- **Scroll fix — regression catch:** the first version of the drag-to-
  scroll code broke ordinary single clicks on swatches entirely (see part
  3 above). Caught by a full sweep that clicked every swatch and checked
  the resulting `data-style`/nav height actually changed — all 20 came
  back stuck on "precision" before the fix, and correctly distinct after.
  Re-verified that a real drag still scrolls, still suppresses the
  trailing click, and that an ordinary click still works immediately after
  a drag.
- **Scroll fix — short desktop window (1400×700):** no horizontal overflow,
  picker/row still lay out correctly with the trimmed top margin.
- **Scroll fix — mobile (390×844):** native touch scrolling unaffected, no
  overflow.
