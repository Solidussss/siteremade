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
- real direction on the final deployment fell back: "5 of 10 sourced lines had no valid fact id" twice → citations are
  read as written ("f2, f3", "F3", "[f3]" → the first given id); the repair message names the bad values and valid ids
- the next real run put "Eighty million trees" in a heading, the logline and the page description -- true, but in no
  given fact → numbers above twelve in kickers, headings, labels and the concept must come from a fact or the owner
- the third real run (repaired once, no number errors) still claimed "a shockwave that circled the planet" and "the
  width of a stadium", and added "Washington, D.C." to a cited paragraph -- claims without numbers, which the validator
  cannot see → a claim check by the cheap model on every accepted plan (repair, then removal)
- research dropped the start of sentences with a stop that is not a boundary ("30 June [O.S. 17 June] 1908" became
  "S. 17 June] 1908 …") → such stops stay inside the sentence
- an accurate summary drawing numbers from three cited facts was refused → numbers may come from up to three facts,
  still never from none

## Stage 3 — subject imagery and composition (2026-09-29)

Diagnosis first (traced with `research(u, { trace })` and the saved stage-2 projects, not assumed)
- Zelda had real imagery on Commons ("Link ... cosplay at Anime Boston 2025"); it was a candidate and was ranked out:
  every directed-query result got a flat 0.5, and ties broke on resolution, so fourteen 9504-px photos of a German
  street festival won. Logos ranked high because only the file NAME was checked for "logo" ("The Legend of Zelda
  Skyward Sword.png" is a wordmark). Six downloads were chosen blind; vision only saw what was already downloaded.
- Pikachu (unseen) had figures, plush, cosplay and parade balloons on Commons, also chosen by keyword alone; batch
  uploads of one shoot crowded the list; the page was even classified an "animal".
- The seedling cutout kept a background patch (a separate piece touching two frame edges; the crop rule only refused
  three) and pale shadow rims (one-ring-per-pass peeling stopped at JPEG-noise pixels).
- Zelda's blade and hilt: moving the focal clear of the words left attached layers behind; nothing grouped them.
- Distracted-boyfriend's hero never moved: the director gave it no loop, and a flat painting cannot do its intended
  "head turn". Rosetta's stillness was intended (restrained, tempo still), but its "light passes across the stone"
  had no mechanic.
- Claim check: missing verdicts passed silently; a checker error let the page through; removal left a heading with no
  paragraph; a replacement heading (the scene label) was never checked.
- Reopening re-ran today's composition, so saved pages moved when the rules changed.

What changed (all general; nothing refers to a review subject) — see CREATIVE_MODE.md
- understanding states the visuals the page must show and queries photographable forms; research scores directed
  results on their own query, reads Commons categories, collapses series; one cheap vision call judges the shortlist
  before download (roles, identity, issues, coherent set, what is missing); verdicts persist with the assets
- director and validator use the verdicts: a subject picture (or the owner's upload) leads; a logo never does; a
  supporting picture may not lead instead of a subject; a page that cannot show its subject is marked degraded with the
  missing picture and an upload button; whether imagery is needed follows the stated visuals, not the kind label
- cutouts drop frame-touching background pieces and peel shadow rims; logos are never cut out
- groups (one wrapper, one motion; parts keep their places); collision order moves before it shrinks; small decorations
  keep off words and buttons
- accept/safety validation with layout.version: reopen, export, edits and picture swaps never move anything
- claim check with complete accounting (see CREATIVE_MODE.md); plan.claims records the result
- kenburns and sheen loops; an opening subject is never frozen when the tempo calls for movement
- an 'invented' page that cites real facts no longer claims to describe no real events

Real-model review (production, claude-sonnet-5 director, claude-haiku-4-5 checks; estimated from tokens)
| brief | set | result | calls | est. $ | time* |
|---|---|---|---|---|---|
| Zelda (automatic) | R | AI, 1st attempt; Link cosplay photos, Master Sword replica, Triforce detail; imagery "form"; claims 18/18 | 2 + check | 0.117 + 0.012 | 96 s |
| toilet paper | R | AI, 1st attempt; six real roll photos; claims 30/30 | 2 + check | 0.108 + 0.012 | 82 s |
| distracted boyfriend | R | AI, repaired; Reynolds painting, Chaplin, High Noon still; claims 31/31 | 4 + check | 0.208 + 0.007 | 120 s |
| Bubbles (synthetic) | R | AI, repaired; owner's photo only; claims 31/31 | 3 | 0.216 | 104 s |
| Antikythera mechanism | U | AI, repaired; real fragments, museum case, labelled reconstruction; claims 25/25 | 3 + check | 0.212 + 0.007 | 107 s |
| The Backrooms | U | AI, 1st attempt; real hallways toned yellow, fan art withheld; claims 28/28 | 2 + check | 0.086 + 0.010 | 76 s |
| Zelda + supplied artwork | S | AI, but the upload was NOT used (ocarina hero) -- page marked degraded; fixed in 75c675e | 2 + check | 0.118 + 0.014 | 108 s |
| Zelda + supplied artwork, re-run | S | **not run by the model**: the Anthropic account ran out of credit; labelled fallback, $0 | 1 failed | 0 | 4 s |
(* create to plan, including understanding, research, picture check and direction; understanding ~$0.004 each)
Total this round ~$1.16 estimated (~$2.1 for the day with the stage-2 checks), within the $6 cap. The prepaid provider
balance ran out during the last run -- a separate limit from the Creative cap, shared with anything else on that key.

Found by the real review and fixed (75c675e): the owner's upload avoided as "unlicensed"; memes/concepts escaping the
degraded check; a painting called a "reference"; real hallways called "exact" for an invented place; the false
"nothing here describes real events" footer.

Unverified (no model credit left): whether the director, sent back once with "... lead with the upload", uses the
owner's picture; the picture check's corrected role wording. Both are covered by tests and by re-validating the real
failed plan offline (it is sent back, and marked degraded until it complies).

Known limits after stage 3 (superseded by the completion record below)
- A page takes ~75–150 s end to end (research + picture check + direction + claim check); no streaming.
- The claim check is a model verdict with evidence ids, not proof.

## Release completion (2026-09-28/29, 55296cd → 665f532)
Decisions: broader discovery = Anthropic web search (server tool, existing key; $10/1k searches + tokens) to find
pages that show the exact subject; our hardened fetcher reads each page's declared image and its permission evidence;
the picture check judges them. Not chosen: Google CSE (closed to new customers, ends 2027-01-01), Bing (retired), Brave
image API (new paid credential; storing results needs a special plan). No Pexels/Unsplash/Openverse; no image generation.

Done (each verified as noted)
- Navigation: every `#` link was loading the parent site inside the studio's srcdoc preview; now handled in-page
  (sticky offset, Sources opens, phone menu closes, focus). Real studio on production: 52/52 (completion set) and
  38/38 (characters) menu items and CTAs landed; exports: clicked as plain page, in a srcdoc frame and via the phone menu.
- Web discovery + permission kept apart: free only when stated FOR the picture (image structured data, the picture's own
  page, or a Commons file's own record); an article's text licence does not cover its images (a real Triforce case was
  credited with Wikipedia's text licence before the fix). Unclear/restricted -> review links only.
- Missing-imagery gate before any paid direction: upload / adopt a reviewed picture with the owner's rights / search
  again / explicit abstract; buttons lock; "What we checked" shows the evidence and where it stopped.
- Owner roles for uploads; the owner's main picture leads (real model: Zelda upload became the hero focal).
  "Use as main" on a cutout floats it (toilet paper, production, no AI call, survives save + reopen).
- Characters: a real-world form (cosplay, figure, merchandise, product photo, painted vehicle) is never the subject;
  not downloaded, used or offered. Director: shapes never impersonate the subject (prompt; not yet exercised by a paid run).
- Diagnostics per stage with every candidate's visual verdict, technical result and permission evidence.
- Licence delivery: every v2 page had cited Wikipedia facts with NO source credited (director never wrote sources);
  now the research article is credited in every path, including pages saved earlier. Exports ship only the pictures
  the page shows (an abstract page had shipped 5 uncredited Commons files).
- Failure states: provider balance/key refusal trips a 10-minute circuit with a stated reason; no automatic retries
  beyond the one repair and one claim follow-up; a repeated gate click cannot start a second direction (one plan call
  measured). Regression found and fixed in the real run: the first repeated-click guard stopped every direction.
- Intermittent server test: the Creative ledger's parallel appends landed out of order; now one ordered queue.
- Business: minimal planning request on production after the top-up returned a plan (claude-sonnet-5, 49 s).
  business-preservation 6/6 identical to f8550a3 at every commit; premium 172/172; no Business file changed.

Real runs (estimated from tokens; the provider invoice is the real charge)
| set | cases | outcome | est. cost |
|---|---|---|---|
| completion | Pokémon Gen I, Zelda + owner main upload, toilet paper, Bubbles, Tamagotchi, Voynich | Pokémon: gate, then owner chose abstract; others automatic or supplied; all saved, reopened identical, exported | ~$1.46 |
| aborted | first Pokémon run (stalled by the guard regression), one killed launch | no direction | ~$0.10 |
| characters | Link, Kirby, Pikachu, BMO, SpongeBob, Silver Surfer | 3 gates (no direction), 3 generated pages | ~$0.92 |
| re-check | Pikachu, discovery only after the product-photo fix | gate (permission); direction blocked by the harness | ~$0.08 |
| Business | one planning request | plan returned | not reported by the route |
Total ~$2.6 estimated over two days, within the unchanged $6/day Creative cap.

Characters (same pipeline; main visual must be the character's own depiction)
| character | where it stopped | best depiction found | permission |
|---|---|---|---|
| Link | gate: Commons only forms (6 cosplay/figure); web 5 of 7 pages refused (HTTP 403), official art 264x377 local non-free | Wikipedia art (too small) | non-free local file |
| Kirby | generated; one small CC BY-SA gameplay graphic (414x396); director first left it out (repaired); later scenes used discs | Commons gameplay graphic | CC BY-SA 3.0 per its Commons record |
| Pikachu | generated on a merchandise photo (virtual-pet toy) misjudged as the character; fixed; re-check stops at the gate | pokemon.com official art 475x475; wallpapers to 7100x4440 | unclear (no licence stated) |
| BMO | gate: permission | PNG Mart full-body 3156x4544 | unclear |
| SpongeBob | generated; strong | Commons, Nickelodeon (NickRewind) character + Bikini Bottom + Krusty Krab | CC BY 3.0 per Commons |
| Silver Surfer | gate: permission | Printler poster 571x800 | unclear |
Main constraint for franchise characters: permission (depictions exist and are found, but their pages state no free
licence), then access (wikis and publishers refuse automated fetching; not bypassed). Discovery, processing and
rendering were not the limiting stage for these six; planning had two defects (subject left out of the first plan,
stand-in shapes), one caught by validation, one now in the prompt.
