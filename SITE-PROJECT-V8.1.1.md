# SiteRemade V8.1.1 — closing the concurrent-generation race

Branch: `generator-v8`, on top of V8.1 (`9b923e3`). **Not deployed.**

Focused code-review fix: two concurrency/state-integrity bugs in V8.1's
direction-cap logic, and nothing else. No architecture change, no new
product surface, no scope expansion.

---

## Problem 1 — concurrent generation could bypass `MAX_DIRECTIONS`

`runGeneration()` checked `directions.length >= MAX_DIRECTIONS`, but
`directions.length` is only incremented inside `finishGeneration()`, once a
generation has fully finished. Two overlapping calls — a rapid double-click
on "Try another direction," or two independent `runGeneration()`
invocations — could both read the same pre-increment length, both pass the
gate, and both eventually push, letting `directions.length` reach 4 or
more. This defeated the exact cost/cap protection V8.1 exists to provide.

### Fix: a synchronous transaction lock

```js
let generationInFlight = false;

async function runGeneration(text) {
  if (!text || !text.trim()) return;
  if (generationInFlight) return;                    // 1. reject if already running
  if (directions.length >= MAX_DIRECTIONS) {          // 2. reject if at the cap
    announceDirectionLimitReached();
    return;
  }
  const expectedDirectionIndex = directions.length;   // 3. reserve this transaction's slot
  const variationSeed = expectedDirectionIndex;
  generationInFlight = true;                          // 4. lock, before any await
  setGenerationControlsDisabled(true);
  try {
    /* ... Claude attempt, deterministic fallback, animated or
           synchronous build -- all unchanged in spirit from V8.1 ... */
  } finally {
    generationInFlight = false;
    setGenerationControlsDisabled(false);
    resetGenerationChromeUI();
    updateDirectionControls();
  }
}
```

Both checks and the lock's acquisition happen synchronously, before the
function's first `await` — there is no window in which a second call can
observe `generationInFlight === false` while a first call is genuinely in
progress, because JS runs that whole prefix to completion before yielding
control back to the event loop. This is what makes concurrent calls
impossible rather than merely unlikely, and it holds whether the second
call comes from a real double-click, a second UI control, or a direct
programmatic `runGeneration()` invocation that never touches a button at
all (proven by test — see below).

**The lock is never released and reacquired between a Claude attempt and
its deterministic fallback.** They're both inside the same `try`, so a
failed/limited Claude call falling through to the deterministic engine is
still the one reserved transaction — never counted as two attempts, never
a chance for a second call to slip in between.

**UX disabling is explicitly not the enforcement mechanism.** While a
transaction is in flight, `setGenerationControlsDisabled(true)` disables
the main Generate button, "Try another direction"/"Switch direction", and
(via a CSS class with `pointer-events:none`) the direction pills — purely
so a visitor doesn't see a button appear to do nothing when double-clicked.
The lock inside `runGeneration()`/`switchDirection()` is what actually
makes a concurrent call impossible; Test 2 (below) proves this directly by
calling `runGeneration()` twice with no button involved at all.

**A genuine exception must still release the lock.** `try/finally`
guarantees this for anything thrown synchronously inside `runGeneration`'s
own call stack. It does **not**, by itself, cover the animated reveal: each
step there runs inside a `requestAnimationFrame` callback, which executes
*outside* `runGeneration`'s own synchronous call stack — an exception
thrown there would never reach the `try/finally` at all, and the `await`ed
Promise would simply hang forever with `generationInFlight` stuck `true`
permanently. Fixed by wrapping each animated step in its own `try/catch`
that resolves (never admits the half-built project) and cleans up on
failure, and by adding the same `resetGenerationChromeUI()` call to the
outer `finally` as a backstop for any other, unforeseen exit path — safe
because it's idempotent on the success path (proven by Test 4).

---

## Problem 2 — the animated path could finalize the wrong project

The progressive/animated reveal assigned the in-progress project into the
mutable global: `project = proj`, and the step loop's completion called
`finishGeneration(project)` — reading the *global*, not the local `proj`
this transaction created. `switchDirection()` also reassigns `project`. If
a switch had landed while a generation was mid-flight, the closure could
finalize whichever object global `project` happened to point to by then,
not the one this transaction actually built — risking a duplicated
existing direction, or the wrong object admitted into the reserved slot.

### Fix: `proj` and `expectedDirectionIndex` are the transaction's only identity

- The animated step loop closes over the local `proj` reference directly
  and calls `finishGeneration(proj, expectedDirectionIndex)` — never
  `finishGeneration(project, ...)`. Global `project` is still reassigned
  for the progressive "first paint" (so refinement controls and the visual
  preview show something immediately), but nothing downstream ever reads
  it back to decide what gets admitted.
- `switchDirection()` now refuses outright while `generationInFlight` is
  `true` — so `project` cannot be reassigned out from under an in-progress
  transaction in the first place. This is checked unconditionally at the
  top of the function, so it holds even if `switchDirection` is invoked
  programmatically, not just from the (also disabled, for UX) pills.
- `finishGeneration(proj, expectedDirectionIndex)` no longer blindly
  pushes. Before admitting anything, it verifies:
  ```js
  const admissible = generationInFlight
    && directions.length < MAX_DIRECTIONS
    && directions.length === expectedDirectionIndex
    && !directions.includes(proj);
  ```
  If any invariant fails, it does not push, does not call
  `resolveImagePlanAssets`, does not create a direction — it only resets
  the UI (`resetGenerationChromeUI()` + `updateDirectionControls()`) and
  returns. This is stated as a deliberate defense-in-depth backstop: given
  the lock above, it should be unreachable in practice, but it is the
  function — not the lock — that has the final say over what actually gets
  admitted into `directions`.
- On success: `directions.push(proj); activeDirectionIndex =
  expectedDirectionIndex; project = directions[activeDirectionIndex];` —
  then render/persist/update controls, and `resolveImagePlanAssets` fires
  exactly once, for exactly the newly-admitted direction. V7.1's image
  cache/dedup is untouched.

---

## Preserved exactly, unchanged

Maximum 3 complete directions; the Direction 1/2/3 model and switcher;
zero Claude/image calls on a mere switch; deterministic fallback;
`variationSeed` 0/1/2; no shared `categories[].services` mutation;
independent per-direction edits; save/restore of all directions; boot
restore; V8's structured Claude planning, `normalizeClaudePlan`, and
server-side Anthropic provider; the V7/V7.1 renderer and image cache/dedup;
fact-safety rules; the existing motion/design vocabulary; the $350 CAD
price; Generate → Inspect → Buy. `server.js` and `index.html` are
untouched this pass — the whole fix lives in `script.js` (the lock,
transaction identity, and UI-disable helper) plus 3 lines of CSS (a
`.direction-switcher-locked` visual state). No credits, subscriptions,
durable metering, cross-direction remix, hosting, affiliate systems, DNS
tooling, or multi-page rendering were added. Production Supabase was not
touched.

---

## Testing

New: `v8-1-1-concurrency-test.js` (Playwright, against the mock server),
covering the 6 required scenarios, **36/36 assertions pass**:

1. **Rapid double/triple-click at Direction 2** (mock Claude given a 700ms
   delay, three real, synchronous DOM `.click()`s fired on "Try another
   direction" in one tick before the first request resolves): exactly one
   additional `/api/plan-website` call, exactly one Direction 3 admitted,
   `directions.length` never exceeds 3, the lock clears afterward, and
   image-call counts settle once and don't keep climbing (no second wave
   from a duplicate transaction).
2. **Programmatic concurrency**: `runGeneration()` invoked twice back to
   back with no `await` between them and no button involved — the internal
   lock alone permits exactly one transaction (`directions.length` becomes
   exactly one more, not two), proving the lock is the enforcement, not
   button disabling.
3. **Switching while generating**: with Direction 3's Claude call held for
   700ms, `switchDirection(0)` is invoked mid-flight — refused
   (`activeIndex` unchanged, direction count unchanged, no duplicate of
   Direction 1 or 2); once the transaction completes, the project admitted
   into slot 2 is verified (via the rendered "Based on: ..." source-text
   note) to be exactly the newly generated one, not a stale duplicate; and
   switching works normally again immediately afterward.
4. **Failure releases the lock**: (a) a real network-level failure (the
   `/api/plan-website` request itself aborted, not a clean `{ok:false}`
   response) — deterministic fallback still succeeds, the lock clears, and
   a subsequent generation proceeds normally; (b) a genuine exception
   injected mid-pipeline (a temporarily monkey-patched `renderProject`
   throwing once, with reduced-motion off so the animated/rAF path is
   actually exercised) — the lock still clears through `finally`, and
   generation works normally again right after.
5. **Hard maximum**: after 3 admitted directions, the main Generate
   button, "Try another direction" (now "Switch direction"), and a direct
   programmatic `runGeneration()` call are all tried — `directions.length`
   stays exactly 3, and none of the three attempts makes any
   `/api/plan-website` or `/api/generate-image` request.
6. **Existing state integrity**: independent edits to Direction 1 and
   Direction 2 (made via `switchDirection` + editing `#businessName`)
   survive Direction 3's generation, switching back and forth, an explicit
   Save, a page reload, and silent restore.

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
| `v8-1-1-concurrency-test.js` (new) | 36/36 PASS |

Each suite was run against a freshly-restarted `mock-server.js` process —
its `mockPlanConfigured`/ledger/delay state is intentionally global (test
harness only, standing in for what would be per-request config in a real
deployment) and otherwise leaks between separate test-file runs, the same
test-isolation note already on record from V8.1.

`mock-server.js` (test harness, not a deliverable file) gained one
addition to support Test 1/3: `/__test/set-plan-configured` now accepts an
optional `delayMs` to widen the response-latency window a race needs to
land in reliably; it defaults to 80ms (unchanged from V8/V8.1).

---

## Verification

- `node --check script.js` / `node --check server.js`: clean.
- `git diff --check`: clean (no whitespace errors).
- `git status --short`: only `script.js` and `styles.css` touched this
  pass — `server.js` and `index.html` are unmodified.
- `git diff --stat`: 2 files changed. Most of `script.js`'s changed-line
  count is `runGeneration`'s body being re-indented one level for the new
  `try { ... } finally { ... }` wrapper, not new logic — the actual new
  code is the lock, the `expectedDirectionIndex`/`proj`-only identity
  threading, `finishGeneration`'s admission check, `switchDirection`'s
  guard, and the `setGenerationControlsDisabled`/`resetGenerationChromeUI`
  helpers.

**Not deployed.**
