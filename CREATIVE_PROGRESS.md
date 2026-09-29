# Creative mode — progress log

Read `CREATIVE_MODE.md` first. This file records state and decisions so work can continue across sessions.

## Decisions
- Business is the default; a direction without `mode: 'creative'` is Business everywhere. Creative adds `mode` + `creative`.
- Creative is behind review mode (`?creative=1`) until stage 3; a saved Creative project always opens in the studio.
- Creative pages are one self-contained document (iframe `srcdoc` in the studio, `index.html` on export):
  preview = export, and Creative CSS/JS cannot touch Business pages.
- Facts: Wikipedia (CC BY-SA, attributed, numbered citations). Pictures: Wikimedia Commons, PD / CC0 / CC BY / CC BY-SA
  only, stored in the project's asset store, credited on the page and in `ATTRIBUTION.md`.
- No paid calls, no image generation, no credits in stage 1. Research is rate-limited like generation.
- Pixels are read in the browser (canvas); the cutout step refuses leaks (edge-contrast gate) and busy backgrounds.
- Personal subjects: only supplied words and the owner's own photos; missing essentials are asked for, never invented.
- Mario / Kirby-style trademarked characters have no free-licence pictures on Commons, so the character proof uses
  Sherlock Holmes (public-domain Sidney Paget / W. H. Hyde era illustrations). A trademarked subject still works through
  the same pipeline, but its page will only have the pictures the owner uploads or the free ones that exist.
- Purchase of Creative pages is not offered in the studio yet (pricing is a product decision). The export branch exists
  and is tested; the paid export route itself is unchanged.

## State (2026-09-28)
- [x] lib/creative: understand, research, assets, png (Node codec for tests), director, validate, render, store
- [x] project-store (creative branch, asset internalize/hydrate, "Creative ·" list label) + export branch
- [x] server route `/api/creative/research` + creative ledger
- [x] studio (`creative.js`, `creative-studio.css`), `creative-entry.js` switch, reopen routing in `script.js`
- [x] tests: `test/creative.test.js` (14); Business preservation check `test/review/business-preservation.js`
      (6 real Business projects: save + export byte-identical to eb98bf1)
- [x] review harness: `test/review/creative-review.js` → studio run → export → `creative-capture.js` → `creative-report.js`
- [x] commit / deploy (985da89, deployment 6722651015; follow-up fix for the sign-in gate)

## Fixed during review (found by looking at real output)
- white roll on a white wall: flood fill leaked and shredded the roll → edge-contrast gate; the picture stays framed
- pale cast shadows glowing on dark stages → neutral-shadow removal + defringe; enclosed background pockets removed
- "toilet paper seedlings cup" chosen over the roll → titles naming other things rank lower
- kicker was the raw encyclopedia description; hero intro truncated mid-sentence and repeated in the statement
- facts: "Dr." split sentences; "Most are narrated…" / half quotations kept; "()" left by stripped pronunciations
- licence filter accepted CC BY-NC / BY-ND by prefix (caught by the test) → NC/ND refused
- accent taken from a dark photo tone (invisible kicker/button) → contrast rules in director and validator
- companion picture parked in a corner / over the subject on phones → stricter slots, hidden on phones instead
- connector crossed text and photos diagonally → runs in the margins, crosses only between sections
- source list printed every fetched fact → only the facts the page cites, numbered in reading order
- closing line could repeat the tagline; nav could drop "Sources"
- the same fact appeared in the hero, the statement, the call-outs, the ledger and the timeline → each fact once
- timeline dated an event by a span in brackets ("Ming dynasty (1368–1644) … in 1393"); a sentence cut at "c." kept
- "Unknown author Unknown author" (repeated Commons metadata); photo-site id numbers in captions
- the thread showed a stray stub at rest (round line-cap on a zero-length mask) → nothing drawn until you scroll
- phone: full-bleed photo heroes collapsed to zero width (a desktop `align-items:end` leaking into the phone flex
  layout) — caught by the capture measurements (subject 0% on screen, text clipped)
- phone: 2 px horizontal overflow from the scroll-rotated specimen picture → sections clip horizontal overflow
- desktop reduced-motion capture failed after the long scroll sequence → captures use a fresh window (harness only)
- closing echo had no picture for framed-photo subjects → a small round framed echo
- live check (after deploy 6722651015): signed out, "Create the page" opened the sign-in gate *behind* the full-screen
  studio → the studio steps back beneath the gate while it is open; a pending Business brief is set aside during a
  Creative sign-in so it cannot start a Business generation

## Stage 2 — AI creative direction (2026-09-29)

Decisions
- Two model steps, both structured tool output: understanding (cheap model) BEFORE research; direction (strong model)
  with thumbnails of the real pictures. Nothing the model writes is executed; `validate2.js` gates every plan.
- A new plan format (v2: scenes) and renderer (`render2.js`) rather than more slots in v1; v1 stays for saved v1 pages
  and as the explicit, labelled fallback.
- One repair call at most; then the built-in director, labelled "Built-in layout — not AI direction" with the reason.
- Creative-only limits: $6/day server-wide (estimated), 20 directions per account per day, no credits. Ledger rows per call.
- Real-model validation happens on production (the only place with a model key), in review mode, with one review
  account whose credentials live outside the repo. Mocks (`mock-creative-*`) test plumbing only and are labelled.
- Test set A fixed before tuning (toilet paper + another direction, Zelda, synthetic Bubbles, Tunguska); set B after
  implementation (axolotls, the distracted-boyfriend meme, the Rosetta Stone). No subject-specific prompt or code.

Found by the real-model review and fixed (general fixes only)
- the production studio ran a cached older `creative.js` against a newer server → files load with the build id
- "Bubbles" (a personal goldfish) became a Wikipedia question about Michael Jackson's chimpanzee → a personal subject's
  name is never researched; personal lookups never turn into questions
- an uncited headline invented a false comparison ("Taller than the Eiffel Tower is wide") → headings/kickers may not
  add facts; numbers in "imagined" copy must come from a fact (restated → sourced and cited; invented → repair)
- the model labelled cited paragraphs "imagined", and an embellished line ("endlessly curious") as the owner's words →
  cited lines are sourced; "supplied" lines must mostly be the owner's words
- an everyday object the model called a "general topic" got no pictures at all → only personal subjects skip pictures
- headings broke mid-word in capitals/wide faces; long titles stacked into towers; centred text blocks collapsed to
  zero width; numbered lists printed "01 1"; the thread crossed edge pictures; a dark cutout vanished on a dark stage;
  scrims behind ghost words; warnings shown twice; the studio kept the previous page's uploads between pages
- phone heroes took ~11% of the screen → the focal is grown to fill the phone stage (never shrunk)
- scenes sized to their text squeezed pictures under the words → scenes with layers get a short stage; the validator's
  text boxes now match the rendered columns; built-on layers (a hilt on a blade) move with the focal; secondaries
  step beside the words before being faded; circles stay round; lines in tall boxes draw vertically
- a scene whose only picture was labelled "support" skipped composition (words over it) → the largest picture is the
  main visual; circle masks on wide boxes were cut flat → closest-side
- a photo clear of the words at rest zoomed over them on scroll → zoom/drift are checked at their largest (with the
  camera); a zoom is anchored on the edge facing the words so it grows away from them (else reduced, else parallax)
- scrims used the page colour on inverted scenes (cream words on a cream box) → the scene's own surface
- a focal too wide to sit beside the words went straight to a scrim → it is made smaller to fit the free side first
- words straight on full-bleed or backdrop photos had no scrim; faded photos still fought body text; outline words
  crossed headings; long headings stacked in the narrow column → a legibility pass after composition, every scene
- an accurate summary drawing numbers from three cited facts was refused → numbers may come from up to three facts,
  still never from none

Open / next
- Pictures are the main limit: trademarked characters, memes and abstract subjects have little or no free imagery.
  The director composes honestly with shapes and type and asks for uploads; it does not substitute other subjects.
- Direction takes ~50–90 s (one strong-model call); no streaming or draft preview yet.
- Model self-labelling of copy kinds is imperfect; the validator catches numbers, citations and owner-words, not every
  factual claim phrased without numbers.
