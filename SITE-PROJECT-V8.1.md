# SiteRemade V8.1 — closing the unlimited-generation loophole

Branch: `generator-v8`, on top of V8 (`ca4a18f`), then merged with the one
`origin/main` commit that landed after V8 (`7ccf728`, "Fix Sonnet 5 planner
tool compatibility" — a one-line, unrelated change to the real Anthropic
request body; see "Base branch" below). **Not deployed.**

This is a bug-fix pass, not a new feature. It responds to one report: V8's
3-generation limit only ever capped *Claude-planned* calls — the
deterministic generator was never gated at all, so a visitor could produce
unlimited complete websites after the nominal "3," each one still capable of
triggering a real, paid OpenAI image-generation call. This document states
the bug precisely, the fix precisely, and proves it with tests.

---

## The bug

V8's `runGeneration()` checked the Claude-specific server ledger
(`remaining === 0`) *only* to decide whether to attempt a Claude call at
all. Whether that check passed, failed, or was skipped entirely (Claude
unconfigured), execution always fell through to the deterministic builder
and always produced and rendered one more complete `WebsiteProject` —
including running `resolveImagePlanAssets()`, which fires real
(billable, when a real OpenAI key is configured) image-generation requests
for a freshly built plan. The "3 generations" meter was cosmetic. There was
no code path, anywhere, that actually stopped a 4th, 5th, or Nth full
website from being created and rendered. `regenerateButton` ("Try another
direction") had the identical property: it called the same unmetered,
ungated deterministic remix logic on every click, forever.

## The real product rule (what V8.1 enforces)

**A visitor gets exactly 3 complete website directions total — through
Claude or the deterministic engine, it doesn't matter which. After 3
directions exist, editing and remixing continue freely; no action may ever
create a Direction 4.**

---

## The fix

### 1. Data model: `directions[]` + `activeDirectionIndex`

```js
const MAX_DIRECTIONS = 3;
let directions = [];          // up to 3 full WebsiteProject objects
let activeDirectionIndex = -1;
let project = null;           // unchanged variable; always === directions[activeDirectionIndex]
```

`project` stays the single object every existing refinement control
(color pickers, tone toggle, industry select, asset uploads, section
toggles, layout choice, device toggle) already reads and writes. Because
JS objects are references, once at least one direction exists,
`project === directions[activeDirectionIndex]` always holds — so **every
one of those existing controls needed zero changes** to correctly scope
edits to only the active direction. `directions` is purely additive
bookkeeping around the same objects, not a parallel data model to keep in
sync by hand.

### 2. The gate is absolute, and it's the only door in

```js
async function runGeneration(text) {
  if (!text || !text.trim()) return;
  if (directions.length >= MAX_DIRECTIONS) {
    announceDirectionLimitReached();
    return;                                    // <-- before ANY work
  }
  const variationSeed = directions.length;
  let claudePlan = null;
  /* ... optional Claude attempt, unchanged in spirit from V8 ... */
  const { proj, steps } = buildGenerationPlan(text, project, claudePlan, variationSeed);
  /* ... runs the steps (animated or not) ... */
  finishGeneration(proj);   // the ONLY place a project is admitted into `directions`
}
```

The `directions.length >= MAX_DIRECTIONS` check runs **before any Claude
attempt, before any deterministic build, before any image plan** — directly
against the bug, which was the deterministic fallback running *after* a
Claude-only check had already passed or failed. `finishGeneration()` is
the single function that ever calls `directions.push(...)`, so a call that
returns early at the top of `runGeneration` has, provably, created nothing:
no image request, no wasted Claude call, no new project object at all.

Claude failing, being unconfigured, or hitting its own separate per-visitor
Claude quota **never re-opens the door** to unlimited deterministic
generation — it only ever means *this* attempt (already counted against
the 3-direction budget by having passed the gate) uses the deterministic
engine instead of Claude. That is the one-sentence fix for the reported bug.

### 3. Deterministic Direction 2/3 still look genuinely different

V7's old "remix" trick for `regenerateButton` (`category.services.push(
category.services.shift())`) mutated a **shared, module-level** array —
harmless when only one project ever existed, but it would have silently
corrupted a *different, already-created, currently-inactive* direction's
rendered copy the moment multiple directions can coexist and be switched
between (since every render reads `category.services` live off the shared
`categories` table, not a private per-project copy). This trick is removed
entirely.

In its place, a `variationSeed` (0/1/2 — which direction this attempt will
become) threads through `buildGenerationPlan`, and only affects the
deterministic branch (Claude, when used, already gets real diversity
instructions from V8's own `planSignature()` mechanism — untouched):

```js
const stylePool = [analysis.styleKey, ...(analysis.styleAlternates || [])].filter(Boolean);
const variationStyleKey = stylePool.length ? stylePool[variationSeed % stylePool.length] : analysis.styleKey;
const variationText = variationSeed ? `${analysis.text}::v${variationSeed}` : analysis.text;
composed = composeStyleFromAnalysis(variationText, analysis.categoryKey, variationStyleKey);
```

Palette-hash jitter (via the suffixed `variationText`) and cycling to the
next real style alternate are both per-project-safe — no shared state is
ever mutated — and were sufficient to keep deterministic directions
visibly distinct (confirmed by test).

### 4. The Direction switcher

A minimal pill row, hidden until a 2nd direction exists:

```html
<div class="direction-switcher" id="directionSwitcher" role="tablist" aria-label="Website directions" hidden></div>
```

```js
function switchDirection(index) {
  if (!directions.length) return;
  index = Math.max(0, Math.min(directions.length - 1, index));
  if (index === activeDirectionIndex) return;
  activeDirectionIndex = index;
  project = directions[activeDirectionIndex];
  renderProject(project);          // pure re-render of already-built data
  renderDirectionSwitcher();
  markGenerated();
  persistDirectionsSilently();
}
```

`switchDirection` never calls `resolveImagePlanAssets()` and never touches
the network — switching directions costs nothing, by construction, not by
convention (proven by test: zero `/api/plan-website` and zero
`/api/generate-image` calls across repeated switches).

### 5. "Try another direction" — one button, two honest behaviors

Pre-limit, `regenerateButton` now calls the *exact same* `runGeneration()`
used by the main Generate form — it creates the next real direction
(using Claude when configured, same as Generate) and counts toward the
3-direction allowance, same as Generate. This is a deliberate behavior
change from V8, where this button never called Claude and never counted
toward anything — that gap was the other half of the unlimited-generation
bug. Post-limit, it becomes "Switch direction" and calls the same
`switchDirection()` the pills use:

```js
regenerateButton.addEventListener('click', () => {
  if (!project) return;
  if (directions.length >= MAX_DIRECTIONS) {
    switchDirection((activeDirectionIndex + 1) % directions.length);
    return;
  }
  runGeneration(project.source.text);
});
```

There is no separate "unlimited remix" code path left anywhere for this
button to fall into.

### 6. AI image cost protection

V7.1's per-slot image cache/dedup (`entry.cacheKey`, `imageRequestsInFlight`)
is completely untouched. What V8.1 adds on top:

- Each direction owns its own `assets.generated` cache (it's a normal
  field on that direction's `WebsiteProject`, so it's automatically
  per-direction — no new cache-keying scheme needed).
- Switching directions never calls `resolveImagePlanAssets` (previous
  section).
- Color, tone, layout, spacing, section-order and device edits already
  never re-triggered image generation before V8.1 (V7.1's cache-key
  design) and still don't — confirmed by regression.
- Moving a section (and its image) from one direction to another is
  explicitly **not** built this pass — deferred, as requested.
- Once 3 directions exist, no path can create a new full-site image plan
  "for free" — the only way to get a new image plan is `finishGeneration`,
  which is gated. A future "regenerate this one image" credit-consuming
  action is explicitly **not** built here.

### 7. Server meter: renamed, not rebuilt

The server-side anonymous ledger (cookie + in-memory `Map`, same
documented non-durability limitation as V8's Q7) is kept as-is
structurally, but renamed to say what it actually measures:

| Before (V8) | After (V8.1) | Meaning |
|---|---|---|
| `FULL_GENERATION_LIMIT` | `MAX_DIRECTIONS` | unchanged value (3) |
| `generationLedger` | `directionsLedger` | — |
| `entry.count` | `entry.claudeDirectionsUsed` | **only** Claude-attempted directions |
| `remaining` | `claudeDirectionsRemaining` | — |

**Honest, deliberate scope limit, documented in `server.js`:** this ledger
can only ever observe Claude-*attempted* directions, because a fully
deterministic direction (Claude unconfigured, or the visitor already
exhausted their Claude quota) never makes a network request to this server
at all — there is nothing for it to count. The true 3-direction cap is
authoritative and enforced entirely client-side, via `directions.length`.
Building a second server endpoint so the client could report "I also made
a deterministic-only direction" would be new server-side state and a new
contract for a number the client already has authoritatively and for
free — overbuilding relative to what's actually required, so it wasn't
done. This is written directly into `server.js` as a comment, not left
implicit.

The user-facing hint text was the actual bug-relevant part, and **is**
now honest:

```js
// V8 (removed): "N of 3 AI-planned directions left" -- implied a
// deterministic Direction 4 was fine, which was exactly the bug.
// V8.1:
function updateGeneratorAiHint() {
  const used = directions.length;              // never the Claude-only counter
  if (used === 0) { /* hidden */ return; }
  // "N of 3 website directions used" (+ "(AI-planned when available)" only
  // as a note, never as the number the visitor is counting against)
}
```

The hint is now driven by `directions.length` (the real, always-accurate
number, incremented in exactly one place) and is shown as soon as any
direction exists — including when Claude was never configured at all,
because a purely-deterministic visitor has, and needs to be told about,
the exact same real cap.

### 8. Closing the reload loophole

A plain page refresh used to reset `directions` (well, `project`/
`hasGenerated`) to empty, silently resetting the 3-direction cap to zero
since the cap is authoritative client-side. `finishGeneration` and
`switchDirection` now silently persist `{ directions, activeDirectionIndex }`
to the same `localStorage` key the explicit Save button uses, and boot
restores from it before falling back to the neutral demo shell:

```js
// on load, before anything else:
const parsed = JSON.parse(localStorage.getItem('siteremade:lastProject') || 'null');
if (parsed && Array.isArray(parsed.directions) && parsed.directions.length) {
  directions = parsed.directions.slice(0, MAX_DIRECTIONS);
  activeDirectionIndex = /* clamped restored index */;
  project = directions[activeDirectionIndex];
}
```

**Scope of this fix, stated honestly:** this closes the casual "hit
refresh" case only. A visitor who deliberately clears site data (or opens
a private window) still resets the count — the same disclosed limitation
class as the anonymous cookie itself (V8 Q7/Q8). A durable account- or
IP-backed store is the real fix for an adversarial visitor, and remains
explicitly out of scope — **production Supabase was not touched in this
pass**, per the instruction.

Save/Restore (`saveProjectToStorage`/`loadProjectFromStorage`) now
serialize/restore the whole `{ directions, activeDirectionIndex }` object
instead of one `WebsiteProject`, with a backward-compatible format check so
a save from V8-or-earlier (a bare single project with a `.meta` field)
still loads correctly, migrated into `directions: [thatProject],
activeDirectionIndex: 0`.

---

## A latent bug found (and fixed) while designing this, not reported

V7's old `regenerateButton` remix trick mutated the shared
`categories[key].services` array in place. This was invisible in V7/V8
because only one `WebsiteProject` ever existed at a time. It is fixed here
(removed, replaced by the per-project-safe `variationSeed` approach in
part 3 above) because it would have silently corrupted a coexisting,
inactive direction's rendered copy the first time two directions of the
same category existed side by side — exactly the scenario V8.1 introduces.

---

## Testing

New: `v8-1-directions-test.js` (Playwright, against the mock server),
covering the user's own 11 required tests exactly, 24 assertions, **all
passing**:

1. First Generate creates Direction 1.
2. Second Generate creates Direction 2.
3. Third Generate creates Direction 3.
4. A fourth full generation is impossible — `directions.length` stays 3,
   and (Claude-configured case) zero additional `/api/plan-website` calls
   are made for the blocked attempt.
5. Deterministic fallback does not bypass the limit — proven with Claude
   *never* configured for the whole run (the exact scenario the reported
   bug lived in): 3 purely-deterministic directions are created, a 4th is
   refused, and the blocked attempt doesn't even replace the currently
   active direction on screen.
6. "Try another direction" creates Directions 2 and 3 pre-limit (using
   Claude when configured — see part 5 of the fix), then post-limit makes
   **zero** additional `/api/plan-website` calls, switches to the next
   existing direction instead, and relabels itself to "Switch direction."
7. Switching among all 3 directions (via the pills) makes zero
   `/api/plan-website` calls.
8. The same switching makes zero `/api/generate-image` calls.
9. An edit to Direction 1 (`#businessName`) and a different edit to
   Direction 2 both survive switching away and back to each — proven
   independent, not shared state.
10. Save → `page.reload()` → silent restore reconstructs all 3 directions,
    including an edit made to Direction 2 before saving, and the restored
    session still enforces the 3-direction cap (a blocked 4th-generation
    attempt makes zero additional `/api/plan-website` calls) — proving
    this isn't a fresh, uncapped session.
11. V6/V7/V7.1/V8 regression suites re-run and still fully green (below).

### An unrelated timing fragility found and hardened while writing #6/#10

script.js's animated (non-reduced-motion) generation reveal only starts
building its progress UI *after* an in-flight Claude call resolves —
`generationProgress.hidden` (the flag this suite and V8's own test file
both originally polled to detect "generation finished") stays at its
pre-generation default value for the entire Claude round-trip. Combined
with headless Chromium throttling `requestAnimationFrame` on a
backgrounded page (every Playwright page, technically), a test that polls
that flag without emulating `prefers-reduced-motion` can resolve before a
generation has actually finished, intermittently reading stale or
partially-built state. This is pre-existing V8 behavior (unchanged by
V8.1, and out of scope to change here — "preserve V8" applies to the
animation pipeline too), not a functional bug: a real visitor with a
visible tab is never subject to it. Both `v8-1-directions-test.js` (new)
and `v8-claude-plan-test.js` (existing, updated) now call
`page.emulateMedia({ reducedMotion: 'reduce' })` on every page, which
routes script.js through its already-existing synchronous, non-animated
finish path — a test-harness hardening, not a product change. This is also
why running these suites back-to-back against one long-lived
`mock-server.js` process needs a restart between files: the mock server's
`mockPlanConfigured`/ledger state is intentionally global (it stands in
for what would be per-request config in a real deployment) and otherwise
leaks between separate test-file runs, which is what actually caused the
one non-flaky-looking "regression" surfaced while re-running `v6-verify.js`
here — not a code defect (see commit history / working notes for the full
trace; `v6-verify.js` itself needed no changes).

### `v8-claude-plan-test.js` — 3 assertions updated, all for reasons stated in this document

- The renamed server field (`entry.count` → `claudeDirectionsUsed`, part 7).
- The hint's new wording/visibility rule (part 7) — it now asserts
  `"2 of 3 website directions used"` / `"1 of 3 website directions used"`
  rather than the old "N AI-planned directions left" phrasing, and asserts
  the hint **is shown** even with Claude unconfigured (previously asserted
  the opposite, which was the exact bug this pass fixes).
- "Try another direction" pre-limit now correctly asserts it **does** call
  `/api/plan-website` when Claude is configured (part 5) — the old
  assertion (`zero additional calls`) was testing the original bug's
  behavior directly.

**`v8-1-directions-test.js`: 24/24 pass. `v8-claude-plan-test.js`: 20/20
pass** (after the above updates — all failures traced to test expectations
of now-deliberately-changed V8 behavior, or to the timing fragility above;
none traced to incorrect application logic, confirmed with a standalone
reduced-motion repro before touching any test file).

**Full regression, re-run fresh against this branch, all green:**
`v6-verify.js` (22/22), `v7-diversity.js` (8/8 unique structural
signatures), `v7-mobile-check.js` (0 overflow / 0 errors, 8 prompts),
`v7-1-image-gen-test.js`, `v7-1-diversity-image-sweep.js` (8/8),
`v7-1-container-sizing-audit.js` (8/8) — image caching/dedup, container
sizing, and mobile layout all intact, byte-for-byte the same behavior as
before this pass.

---

## Files changed

- `script.js` — `directions[]`/`activeDirectionIndex` state,
  `finishGeneration`/`runGeneration` gating rewrite, `variationSeed`
  threading, direction switcher (`renderDirectionSwitcher`/
  `switchDirection`/`updateDirectionControls`), `regenerateButton` handler
  rewrite, `updateGeneratorAiHint` rewrite, Save/Restore and boot-restore
  rewritten around the multi-direction format (with old-format migration).
- `server.js` — ledger/limit renamed (`MAX_DIRECTIONS`,
  `directionsLedger`, `claudeDirectionsUsed`/`claudeDirectionsRemaining`),
  scope-of-ledger comment added, response messages reworded to not imply
  a Claude-only meaning.
- `index.html` — added `#directionSwitcher` container.
- `styles.css` — added `.direction-switcher`/`.direction-pill` styles.
- `mock-server.js` (test harness only, not a deliverable file) — same
  field renames as `server.js`, so the mock stays a faithful stand-in.
- `v8-1-directions-test.js` (new) / `v8-claude-plan-test.js` (updated) —
  see Testing.

## Base branch

Built on `generator-v8` at `ca4a18f` (V8), then merged forward to pick up
`origin/main`'s one subsequent commit, `7ccf728` ("Fix Sonnet 5 planner
tool compatibility" — adds `thinking: { type: 'disabled' }` to the real
Anthropic request body in `anthropicProvider.plan`, a one-line change in a
part of `server.js` this pass doesn't otherwise touch), so this delivery
applies cleanly on top of the actual current `main`.

**Not deployed.**
