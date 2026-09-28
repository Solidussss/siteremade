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
