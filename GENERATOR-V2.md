# SiteRemade landing page V2 — generation-first flow

Audit, architecture, and what's real vs. simulated, for the move from
"customize a form → submit a lead" to "describe your business → see a
generated direction → refine → hand off to SiteRemade."

## 1. Audit: what's actually here today

Repo: `Solidussss/siteremade` (landing page only — separate from
`siteremade-app`, the production customer app, which this work does not
touch).

- **Stack**: a single static page (`index.html`, `styles.css`,
  `script.js`) served by a minimal Express server (`server.js`). No
  database, no build step, no framework.
- **Current flow**: manual form → `POST /api/lead` → two emails via
  Resend (one to `hello@siteremade.com` with the submitted direction,
  one confirmation to the visitor). No AI, no generation, no persistence
  — the only backend logic is validation, HTML-escaping, and sending
  those two emails.
- **The "customizer" is already most of a real generator, just entered
  manually.** `script.js` already has: six fully art-directed style
  systems (`modeData/modeDefaults` — Luminous/Editorial/Precision/
  Studio/Executive/Impact, each with its own palette, type treatment and
  layout quirks), nine industry content templates (`industries` — each
  with a kicker/headline/sub/services), three top-section layouts, and a
  live preview (`.builder-site`) that re-themes instantly from whatever
  mode/industry/colors/layout/sections are picked. This is a real
  template system, not a mockup — it's the thing this task's brief asks
  to reuse "wherever possible instead of building arbitrary code
  generation."
- **What's missing is only the entry point and the framing.** Today the
  visitor manually picks a mode from a dropdown and an industry from
  another dropdown before anything renders. There's no single
  "describe your business" input, no inference from free text, no
  generation/progress moment, and the preview is live from page load
  rather than something that gets "generated" in front of you.
- Two CSS components already exist but are unused in the markup:
  `.tone-toggle` (a 3-button pill switcher) and `.builder-site.tone-light`
  (a light/dark variant, only wired for 2 of 6 modes — incomplete, not
  extended here). `.tone-toggle` is reused below for something that
  actually needs it (copy tone), `.tone-light` is left alone.
- Mobile: already has a real, deliberate performance/UX pass (mobile
  builder reorders preview-before-controls, `content-visibility`,
  reduced motion/backdrop-filter on phones, iOS zoom-prevention on
  inputs, tap-target hardening on Client Login). Anything added here
  follows those same patterns rather than fighting them.

## 2. What must be added for the generator

No AI/LLM backend exists in this repo (no API key, no provider
dependency in `package.json`). Building a real model call was out of
scope for this pass and not required to deliver the brief's actual ask
— a believable, useful generation *experience* on top of a real
template system. So the "understanding" step is **real deterministic
text analysis**, not a simulated AI call:

- `analyzeDescription(text)` (new, `script.js`) scores the free-text
  description against keyword lists for the 9 existing industries and
  the 6 existing style modes (e.g. "luxury/premium/upscale" → Executive,
  "modern/clean/minimal" → Precision, "landscap-/yard/backyard" →
  Landscaping) and extracts a location with a simple `"in <City>"`
  pattern. This runs instantly and synchronously — the 5-step "progress"
  UI paces the *reveal* of an already-computed real result; it does not
  wait on a network call, and its sub-labels report what the analysis
  actually found, not invented commentary.
- It deliberately does **not** try to guess a business name from the
  text — that would risk inventing something wrong. The generated result
  is labeled "Your Business" as an explicit placeholder, with the
  existing Business Name field surfaced as the first thing to fix in
  Refine.
- Backend addition: `server.js`'s `/api/lead` now also accepts and
  relays a `description` field (the visitor's original sentence) into
  the lead email, so the studio sees exactly what was typed. This is the
  only backend change — same endpoint, same emails, same validation
  pattern.

## 3. New flow

1. **Hero is the generator.** One textarea ("Describe your business"),
   one primary action ("Generate my website"). The hero's existing
   browser mockup now live-updates (industry kicker/headline, style
   name, brand-color chip) as the visitor types, debounced — so it
   already feels alive before they submit anything.
2. **Generation state.** On submit, the analysis above runs immediately;
   its result is revealed through the 5 real steps named in the brief
   (Understanding your business → Choosing site structure → Creating
   content direction → Selecting visual style → Building preview), each
   step showing the real value it found. ~2.5s total, skippable by
   reduced-motion.
3. **Generated preview.** Unlocks the existing builder/preview section
   (previously the manual customizer, now framed as "Refine"),
   pre-filled with the inferred mode, industry and location instead of
   the old hardcoded "Northline Electric / Electrical" defaults. Same
   desktop/mobile toggle, same live-themed `.builder-site` preview —
   reused, not rebuilt.
4. **Refinement**, mapped onto real controls (no new freeform IDE):
   - *Change style* → existing style select (6 modes).
   - *Choose another direction* → new "Suggested for your business" row
     showing the 2nd/3rd-highest-scoring modes from the actual analysis
     (real alternates, not random).
   - *Adjust tone* → new 3-way Professional/Bold/Friendly toggle
     (reuses the dormant `.tone-toggle` component) that swaps the
     sub-headline between three real, pre-written copy templates per
     tone — not a live AI rewrite, an honest deterministic swap.
   - *Regenerate a section* → new "Regenerate section order" control
     that re-orders the services strip.
   - *Edit business details* → existing business name / industry /
     logo / color fields.
5. **Handoff.** The existing lead form and `/api/lead` flow, copy
   updated to say plainly that SiteRemade takes this direction into
   production, handles revisions, and delivers the finished site through
   the same Website Projects workflow already live in the SiteRemade
   app — not a claim that the generator itself ships a finished
   production website.

## 4. Explicitly not built (kept for a real V2, not invented here)

- No LLM/AI copywriting call — flagged above as real vs. simulated.
- No freeform section editor/IDE — refinement stays inside the existing
  controls.
- No new backend persistence — the generated direction still only
  reaches SiteRemade via the same lead email as before, now carrying the
  original description too.

## Implementation status

- [x] Hero generator input + live micro-preview. `#generatorForm`
      replaces the old CTA-only hero actions; `#generatorInput`'s `input`
      event (debounced 220ms) live-updates the hero mockup's kicker,
      headline, style chip, brand-color chip and industry chip via
      `analyzeDescription()` -- text-only changes, no theme/color
      recompute per keystroke, so it stays cheap.
- [x] Generation progress sequence. `runGeneration()` computes the real
      analysis synchronously, then reveals it through the 5 named steps
      from the brief at ~500ms/step, each step's sub-label reporting the
      actual computed value (industry+location, section count, mode
      name+tagline). Skips straight to the result under
      `prefers-reduced-motion: reduce`.
- [x] Refine section unlock + prefill from analysis. `.builder-shell`
      starts `.locked` (blurred, `pointer-events:none`, overlay CTA);
      `finishGeneration()` removes the lock and sets the existing
      style/industry/business-name controls from the real analysis
      result -- business name is deliberately left as an editable "Your
      Business" placeholder rather than guessed.
- [x] Tone toggle, alternate-direction suggestions, regenerate control.
      Reused the dormant `.tone-toggle` component for a real
      Professional/Bold/Friendly copy swap (`toneSub()`); added a
      "Suggested for your business" chip row from the analysis's actual
      2nd/3rd-ranked style scores (not random); added "Regenerate section
      order" to rotate the services strip.
- [x] "Use this direction" on the six-mode showcase (replacing the old
      "Customize this direction" link) now also unlocks/populates Refine
      directly, so browsing straight to a style works without typing a
      description first.
- [x] Handoff copy + description passthrough. Handoff section now states
      plainly that the generator produces a direction, not a finished
      site, and that SiteRemade builds/delivers it through the existing
      Website Projects workflow. `formDescription` (hidden field) and
      `server.js`'s `description` field carry the visitor's original
      sentence into the lead email.
- [x] Desktop + mobile visual verification. Playwright script
      (`visual-check-landing.js`, scratchpad-only) drove the real
      textarea → submit → progress → refine → handoff path end to end at
      1500px and 390px, plus the browse-to-"Use this direction" path;
      confirmed correct industry/mode/location inference, tone-swap
      output, section-shuffle, no console/page errors, and no mobile
      horizontal overflow. Screenshots reviewed for both.
