# SiteRemade V8.1.2 — restoring `project` after a failed generation

Branch: `generator-v8`, on top of V8.1.1 (`985313c`). **Not deployed.**

Focused code-review fix: one state-integrity gap left by V8.1.1, and
nothing else. No architecture change, no new product surface, no scope
expansion.

---

## The bug — a failed generation could leave `project` pointing at an
## unadmitted transient project

V8.1.1 fixed *what gets admitted* into `directions[]`: `finishGeneration`
checks the transaction's own local `proj` and reserved
`expectedDirectionIndex` against every invariant before pushing, and a
rAF-step exception is caught so it can never admit a half-built project.
Both failure paths correctly leave `directions`/`activeDirectionIndex`
untouched.

Neither path restored the *other* piece of state the progressive/animated
reveal touches: global `project`. For first paint, `runGeneration` does
`project = proj;` before the transaction's outcome is known, so the
in-progress direction shows on screen immediately. If the transaction then
failed — the admission check refused it, or a genuine exception was caught
mid-rAF-step — `project` was simply left pointing at that orphaned,
never-admitted object.

Concrete case: Direction 1 and 2 exist, `activeDirectionIndex === 1`.
Direction 3 begins; `project = proj` points globally at the transient
Direction 3. A pipeline step throws; Direction 3 is correctly not pushed,
`directions.length` stays 2, `activeDirectionIndex` stays 1 — but `project`
still points at the failed Direction 3. This broke the invariant
`directions.length > 0 ⟹ project === directions[activeDirectionIndex]`,
and it left `switchDirection(1)` unable to repair it: its
`if (index === activeDirectionIndex) return;` guard compares only indices,
so a switch back to the (already "active") Direction 2 would silently
no-op instead of re-pointing `project` at the right object.

### Fix: capture pre-generation state, track admission, restore on failure

```js
async function runGeneration(text) {
  ...
  const expectedDirectionIndex = directions.length;
  const variationSeed = expectedDirectionIndex;
  // Captured before `project` is ever reassigned to the transient `proj`.
  // Cannot go stale mid-transaction: switchDirection refuses outright
  // while generationInFlight is true, and nothing else touches `project`.
  const previousProject = project;
  let admitted = false; // set true only by a successful finishGeneration call
  generationInFlight = true;
  ...
  try {
    ...
    if (prefersReducedMotion() || ...) {
      steps.forEach(s => s.run());
      admitted = finishGeneration(proj, expectedDirectionIndex);
      return;
    }
    ...
    project = proj;              // unchanged: first-paint reassignment
    renderProject(proj);
    await new Promise(resolve => {
      function nextStep() {
        try {
          ...
          if (i >= steps.length) { admitted = finishGeneration(proj, expectedDirectionIndex); resolve(); return; }
          ...
        } catch (error) {
          resetGenerationChromeUI();
          updateDirectionControls();
          resolve();            // admitted stays false -- unchanged from V8.1.1
        }
      }
      nextStep();
    });
  } finally {
    generationInFlight = false;
    setGenerationControlsDisabled(false);
    resetGenerationChromeUI();
    updateDirectionControls();
    if (!admitted) {
      project = directions.length ? directions[activeDirectionIndex] : previousProject;
      renderProject(project);
      renderDirectionSwitcher();
    }
  }
}
```

- `finishGeneration(proj, expectedDirectionIndex)` now **returns** whether
  it actually admitted `proj` (`true`) or refused it (`false`); nothing
  about its admission logic changed, this is purely a signal for the
  caller.
- `previousProject` is captured once, synchronously, before `project` is
  ever reassigned — it is exactly the direction that was active (or the
  pre-generation/demo shell, if none existed yet).
- `admitted` starts `false` and is only ever set by the return value of
  `finishGeneration`. A rAF-step exception never reaches that assignment,
  so it correctly stays `false`; the same is true for any other exception
  thrown anywhere else in the transaction before that point (e.g. inside
  `buildGenerationPlan`, or the first-paint `renderProject(proj)` call
  itself), since the check lives in the outer `finally`, which always runs
  regardless of how the `try` block exits.
- The restore, done once, in one place, in `finally`: if this transaction
  did not admit `proj`, `project` becomes `directions[activeDirectionIndex]`
  when directions exist (guaranteed unchanged by a failed transaction — see
  above), or `previousProject` when none do yet. It then re-renders that
  restored project and refreshes the direction switcher.
- This never calls `resolveImagePlanAssets` — restoring an already-built
  project is a pure re-render, never a new image request.
- On a **successful** transaction, `admitted` is `true`, the `if` block is
  skipped entirely, and behavior is byte-for-byte what V8.1.1 already did.

**Result:** after every failed transaction, `directions.length > 0 ⟹
project === directions[activeDirectionIndex]` holds, and when
`directions.length === 0` the original pre-generation/demo project is what
remains on screen. `switchDirection`'s own comparison logic did not need to
change: because `project` is now always correct by the time any switch is
attempted, its existing index-only early-return is no longer a problem for
this bug.

---

## Preserved exactly, unchanged

The `generationInFlight` lock and its synchronous acquisition; the 3
direction cap and `expectedDirectionIndex` reservation; `variationSeed`
0/1/2; the Claude provider and structured planning; the image provider and
its cache/dedup; `finishGeneration`'s admission invariants; the
persistence model (save/restore, silent boot restore); the purchase flow;
successful-generation behavior (identical code path once `admitted` is
`true`). `server.js`, `index.html`, and `styles.css` are untouched this
pass — the whole fix lives in `script.js`. No credits, subscriptions,
durable metering, cross-direction remix, hosting, affiliate systems, DNS
tooling, or multi-page rendering were added. Production Supabase was not
touched.

---

## Testing

New: `v8-1-2-rollback-test.js` (Playwright, against the mock server),
covering the two required scenarios, **18/18 assertions pass**:

**Test A — existing directions (1 + 2) survive a failed Direction 3
attempt**, exercising all 10 required checks: Direction 1 + 2 exist;
Direction 3 begins; the same genuine mid-rAF exception V8.1.1 tests is
injected (a `window.renderProject` monkey-patch that throws once, with
`reducedMotion: 'no-preference'` so the animated/first-paint path is
actually exercised); Direction 3 is not admitted (`directions.length`
stays 2); `activeDirectionIndex` remains 1; global `project` is verified to
be exactly the pre-existing Direction 2 object via the `"Based on: ..."`
source-text note (matches Direction 2's own text, explicitly does **not**
contain Direction 3's "...immigration law..." text) and the business name
on screen; switching to Direction 1 and back, and editing Direction 1's
business name, both work immediately afterward and the edit survives the
switch away and back; and the rollback itself causes zero additional
`/api/generate-image` calls (compared before/after).

**Test B — the very first generation attempt fails before any direction
exists**: `directions.length === 0` and `activeDirectionIndex === -1`
before and after the injected failure; the neutral demo shell's
"Based on: ..." note stays hidden and empty (proving the failed transient
project's own non-empty source text was *not* left on screen); zero
additional image calls from the rollback; and a normal generation attempt
right afterward succeeds and correctly becomes Direction 1.

**Full regression, re-run fresh against this branch, all green:**

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
| `v8-1-1-concurrency-test.js` | 36/36 PASS (unchanged from V8.1.1) |
| `v8-1-2-rollback-test.js` (new) | 18/18 PASS |

Each suite was run against a freshly-restarted `mock-server.js` process, per
the established test-isolation discipline (its config/ledger/delay state is
test-harness-only and intentionally global, and otherwise leaks between
separate test-file runs within the same long-lived process).

No changes were needed in `mock-server.js` for this pass — the new test
reuses the existing `/__test/set-plan-configured`, `/__test/set-provider-
configured`, `/__plan_website_calls`, and `/__generate_image_calls` test
endpoints exactly as V8.1.1's suite does.

---

## Verification

- `node --check script.js`: clean.
- `git diff --check`: clean (no whitespace errors).
- `git status --short`: only `script.js` touched this pass (plus this
  report) — `server.js`, `index.html`, and `styles.css` are unmodified.
- `git diff --stat`: 1 file changed, 34 insertions(+), 3 deletions(-). The
  entire diff is: `finishGeneration` returning `true`/`false`; capturing
  `previousProject` and declaring `admitted` at the top of `runGeneration`;
  two call sites now assigning `admitted = finishGeneration(...)` instead
  of discarding its result; and the new restore block in `runGeneration`'s
  `finally`. Nothing else in either function changed.

**Not deployed.**
