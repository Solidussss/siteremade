# Creative mode — architecture and stages

SiteRemade has two generation modes:

* **Business** — the existing generator (planner, hero storyboard, drawn illustrations, categories, layouts, editor,
  uploads, focus, save, purchase, export). It is the default and is not changed by Creative mode.
* **Creative** — an image-led page about any subject (an object, a character, a person or pet, an invented idea),
  built from researched facts, supplied details and real pictures, and presented as a coordinated moving scene.

## Separation

| Concern | Business | Creative |
|---|---|---|
| Entry | the landing generator form (unchanged) | a Business / Creative switch above the form, shown only in review mode (`?creative=1`, remembered for the tab; `?creative=0` turns it off) or when a saved Creative project is opened |
| Code loaded | `premium-core.js`, `script.js`, `styles.css` (unchanged) + `creative-entry.js` (4 KB, does nothing unless enabled) | `creative-studio.css`, `creative-core.js` (bundle of `lib/creative`), `creative.js` — downloaded only when Creative is chosen |
| Planning | business planner / deterministic engine | **AI direction** (stage 2): `/api/creative/research` (model understanding → research) → pixels + cutouts in the browser (`assets.js`) → `/api/creative/plan` (model direction with thumbnails, `ai.js`) → `validate2.js`. **Fallback**, labelled as such: the built-in `understand.js` / `director.js` / `validate.js` path of stage 1 |
| Rendering | `renderProject` / `lib/site-render.js` into `#builderSite` | `render.js` → one self-contained document (its own CSS and runtime), shown in an `<iframe srcdoc>` in the studio and written as `index.html` on export. Its styles and scripts live inside that document, so nothing can reach the Business page. |
| Project state | a direction without `mode` | a direction with `mode: 'creative'` and a `creative` block: brief, understanding, supplied details, research (page + facts with sources), assets (pixels + provenance + processing), scene plan, motion, cost |
| Save / reopen | `/api/projects` + autosave | the same `/api/projects` routes (explicit Save), pictures stored in the same content-addressed asset store; the project list labels it “Creative ·”; opening it from the account routes it to the studio (`adoptServerProject` / `loadSelectedOwnedProjectById` never pass it to the Business builder, and the Business local restore ignores it) |
| Export | `compileExport` → business renderer | `compileExport` branches on `mode === 'creative'` → the same `render.js` document, pictures written to `assets/`, `ATTRIBUTION.md`, `export-manifest.json` (`mode: 'creative'`, static) |
| Cost | unchanged | its own limits and ledger (`data/premium/creative-ledger.jsonl`: `creative_understand`, `creative_research`, `creative_curate`, `creative_direct`, `creative_claims`, `creative_direct_fallback`), never Business credits or budgets — see "AI direction: limits and cost" |

A direction without `mode: 'creative'` is a Business project wherever it is read. `project-store.validateDirection` adds
`mode`/`creative` only for a Creative direction, so a Business project saves exactly as before (tested: a Business
project with a stray `mode` value saves identically to the same project without it).

## AI creative direction (stages 2 and 3)

The model makes the visual and editorial decisions; fixed code executes them. Nothing the model writes is executed:
its output is structured data (tool use), validated, then rendered by one renderer used for every subject.

1. **Understand before research** (`ai.understand`, cheap model, ~3 s, ~$0.004): identity and exactly *which* thing
   ("the Nintendo franchise, not one game"), kind (recognizable / fictional / personal / invented), tone and whether the
   brief asked for it, audience, motifs, uncertainty, the Wikipedia title(s) for that identity, **what the page must
   show** (`visuals`: the main picture it cannot do without, the setting, up to four supporting objects — or "none"
   for an idea with no likeness). For a fictional character or other fictional, branded or trademarked subject the main
   visual is its **own depiction** (artwork, a render, a sprite, a show or game still) -- never a photographable form
   (cosplay, figures, merchandise), which is not the character. A clarification is asked only when a wrong identity would change the page. A
   personal subject's *name* is never researched (only its general type). If the call fails or the budget is used, the
   built-in reader takes over (recorded).
   **Identity is decided by rules, not sampled** (`identity.js`). The model *reads* the brief at temperature 0 and says
   the subject's `type` (known-entity / meme / fictional-character / real-person / product / place / franchise /
   invented / personal / unknown) and whether it actually `recognized` it. For a named subject that is not the owner's
   own and not a described invention, the server then asks the open web once (`serpapi.googleWeb`: one Google web search
   for the *name* only -- never the brief -- cached with the picture searches for the cache's days, counted against the
   daily SerpApi cap, a `creative_identitysearch` ledger row). `identity.resolve` scores the evidence -- the model's
   reading (full weight only when it knows the thing), the brief's own words ("my dog" -> personal, "an imaginary
   country" -> invented), the search panel's type, Know Your Meme / game / film / travel / shop hosts, result text -- and
   returns `identity.{type, status: resolved | ambiguous | invented, confidence 0..1, candidates, evidence, source}`.
   A bare, unfamiliar name is never made invented or personal by the model's guess; a name nothing explains is
   **ambiguous** and the owner is asked with **fixed** options (evidence-supported kinds first, then every kind in a
   fixed order; never rewritten per run). The owner's pick decides the type (a kind of thing is never sent as a
   Wikipedia title); several real things sharing a name ("Zelda") keep the model's article options. When the web
   resolved what the model did not know (a new meme), the model reads the brief once more WITH the evidence lines (data,
   not instructions) and the settled type, so its visuals and motifs describe the right thing. The identity type sets
   the picture-search intent (`searchIntent`: a meme is searched as a meme on every run) and the art direction's genre.
   (Measured: eight real calls on "Make a website based off of Neegy." returned invented x4, "<UNKNOWN>" x3, fictional
   x1, all low confidence, with differently worded options each time; Google says it is an internet meme.)
**Where things come from:** Wikipedia = facts and identity; Google Images through SerpApi = pictures found on the web;
the owner = uploads and pictures they choose. Wikipedia and Wikimedia Commons are **never** a picture source: no Commons
search, no Commons file record, no Commons licence lookup, no Wikimedia-hosted result -- not as a provider, a fallback,
a candidate, a picture-check input, a permission source or a line in the picture diagnostics.
2. **Research** (`research.js`): facts and identity only -- the resolved article (the titles the understanding step gave,
   else the subject's own title, else a full-text search hit whose title names the subject), its text split into
   sourced facts, and its category. Only en.wikipedia.org is contacted; model-written text never becomes a URL.
3. **Pictures of the subject** (`discovery.js`, `webimages.js`, `webfetch.js`): with `SERPAPI_API_KEY`, Google Images
   (see "Discovery is kept apart from permission" below); without it, when the AI provider is available, one cheap-model
   call with Anthropic's **web search** server tool (≤ 3 searches) finds pages that show the subject -- the model may
   submit only URLs the search itself returned. Either way, a result hosted on Wikimedia or Wikipedia is left out before
   it is looked at. The **picture check** (`ai.curate`, cheap model, one call) judges up to 18 thumbnails before
   anything is downloaded: role (subject / environment / supporting / detail / logo / reference / unrelated), identity
   (exact / **form** = a real-world form such as a cosplayer, figure or merchandise -- recorded, never selected or used /
   related / other), origin (official / fan / unknown), what it depicts, issues, whether it could be cut out. A hardened
   fetcher reads the suitable pictures' pages and originals: https on port 443 only, no credentials, every DNS answer
   checked against private / loopback / link-local / mapped ranges and the connection pinned to the checked address,
   ≤ 3 redirects each re-checked, timeouts, size caps; real JPEG/PNG/WebP signatures and dimensions. **Permission is
   recorded separately from discovery**: a picture is *free* only when its own page states a free licence (Creative
   Commons BY/BY-SA/CC0/public domain) that covers it, with a creator to credit when the licence requires one; "All rights
   reserved" or a NonCommercial/NoDerivatives licence is *restricted*; anything else is *unclear*. Free pictures the check
   selected join the page with their source, creator, licence and evidence; relevant restricted or unclear pictures of
   the subject itself (≤ 6) are shown to the owner to review. Without SerpApi and without the AI provider, no picture is
   found automatically: the owner uploads, or continues with an abstract page -- there is no other fallback.
   **Where the pictures stopped** is recorded (`research.diagnostics`): the searches and their counts, and a stage
   verdict -- none, discovery, identity (only forms or fan-made), permission, selection, provider, or processing (found but
   unreadable in the browser) -- shown at the gate under "What we checked".
4. **Pictures** (browser): size, background, cutouts. A cutout drops separate background patches that touch the frame
   (a wall or window the fill did not reach) and peels pale shadow rims along the subject's base; logos and references
   are never cut out; a doubtful cut stays a framed picture. Original bytes are kept.
   **Missing imagery — the owner decides before any direction is paid for.** If the page should show its subject and no
   usable picture of it exists (nothing the check calls subject/detail, no upload), the studio stops and says what was
   found apart from what may be used ("We found pictures of X, but their reuse rights could not be verified
   automatically", "only fan-made ones", or -- only when true -- "We couldn't find pictures of X"), with the review cards. The owner can upload pictures, use a reviewed picture after affirming they have the
   rights (the server fetches only a URL it just offered; the page credits it as supplied by the owner), search again
   with their own words (≤ 2; the understanding is reused), or continue with an explicitly **abstract** page. The brief
   and research are kept whichever they choose; the gate's buttons lock so a repeated click cannot start two directions.
   **Owner roles for uploads**: main subject / supporting / background / logo / let the page decide. A picture chosen as
   the main subject **must lead the opening scene** (the director is told; validation swaps it in if not); if it cannot
   (removed, unreadable, under 300 px) the studio explains before planning. Replacing it later keeps the concept and
   recomposes only the scenes it appears in.
5. **Direct** (`ai.direct`, strong model, ~50–100 s, ~$0.10–0.15 estimated per call): the whole page as a **v2 scene
   plan** — a named concept; 2–9 scenes with purpose, height, pinning, camera, background; per scene up to 6 layers
   (pictures, drawn shapes, giant words) with masks, treatments, depth, entrances, ambient loops, scroll movement and
   **groups** (layers that are one object: one entrance, loop and scroll, parts kept in place); words with citations.
   The model sees thumbnails of the actual pictures **and the picture check's verdicts**: a "subject" picture leads
   the opening scene when one exists, a logo or reference is supporting material, a "form" is described as exactly what
   it is (never "Link" for a cosplayer). It lists what it wanted but could not have; the studio offers an upload.
6. **Validate** (`validate2.js`) in one of two modes:
   * **accept** — a new plan from the director, or a recompose the owner asks for: bounds, assets that exist and show
     the subject (director's notes and the picture check), owner's photos only on a personal page, framed flat photos,
     reuse limits, honest copy labels, citations read as written ("f2, f3" → f2), numbers only from facts, motion
     budget; then **composition** (the main subject grown to a minimum share of the desktop and phone stage and kept
     clear of the words — moved, else the words move, and only then made smaller; its group moves and scales with it;
     secondaries and small decorations step aside or fade; zoom and drift checked at their largest; a scene sized to
     its text gets a stage) and **legibility** (scrims in the scene's colour, ghosted word layers, no narrow towers).
     The opening subject is never frozen when the tempo calls for movement. **Imagery**: a logo as the hero's main
     picture while a subject picture exists is sent back; a page that should show its subject but cannot is marked
     **degraded** (`plan.imagery`) with the missing picture. The plan is stamped `layout.version`.
   * **safety** — reopening, exporting, studio load, text edits, picture swaps: everything that must always hold
     (bounds, assets, the owner's-photos rule, honest labels, escaping), but **nothing moves**. A page accepted under
     older layout rules keeps its geometry; "Re-apply today's layout rules" is the owner's explicit choice.

   **Errors** (missing focal picture, no title, most sourced lines uncited, unsupported numbers, overlong text, a logo
   hero) trigger **one repair call** with the exact problems; if the plan still fails, the studio uses the built-in
   director and labels the page "Built-in layout — not AI direction" with the reason and the calls it cost.

   **Structure.** Real calls showed the model occasionally (2 of 14 direct calls) passing the whole plan as ONE argument
   -- `{ plan: { identity, concept, scenes, ... } }` -- which the validator read as a page with no logline, no scenes and
   no words; the repair, shown that wrapped output, repeated it, and the page fell back to the built-in director (the
   earlier real-prompt fallbacks). A plan nested under one wrapper key, with none of its fields at the top, is now lifted
   out before validation (`unwrapPlan`; the attempt records `unwrapped`), a repair is shown the plan unwrapped, and the
   tool's description says the fields go at the top level. The validator still checks the plan in full -- nothing is
   loosened. For diagnosis, `CREATIVE_DEBUG_DIR` (local only) keeps every rejected direction attempt and every repair:
   the model's structured output, its stop reason and the validator's errors -- never a key, a header or a request.
7. **Claim check** (`ai.verifyClaims`, cheap model, `CREATIVE_CLAIM_CHECK`, on by default): every kicker, heading,
   paragraph, list line, word layer and the concept of an accepted plan is checked against the given facts and the
   owner's details. **Coverage is accounted for line by line**: each line needs exactly one valid verdict; "supported"
   counts only with evidence ids that exist; unknown references are ignored; conflicting answers resolve to the
   stricter; unanswered lines get one follow-up; a failed or truncated check gets one retry. Unsupported lines go back
   in the one repair; after it, they — and any line that still could not be verified — are taken out, and the section
   is **repaired as a whole** (the hero heading falls back to the subject's name; other headings are cleared rather
   than replaced by new unchecked words; a scene left with only a heading and no picture is dropped; a kicker never
   stands alone). If the check could not run at all, the page is **explicitly degraded** (`claims.status: unchecked`):
   invented paragraphs and list lines are left out and the studio says the words were not checked. `plan.claims`
   records verified / partial / unchecked with counts. Humour and mood ("Behold, the Roll") are "no-claim".
8. **Render** (`render2.js`): scenes as stages with layers; groups as one wrapper carrying the motion; pinned scenes
   hold while scroll scrubs their layers; entrances on arrival; ambient loops (float, sway, swim, breathe, drift, spin,
   pulse, orbit, bob, **kenburns** — a framed picture drifts and zooms inside its frame — and **sheen** — light
   passes across a picture, the one loop a "still" page keeps); camera moves; atmosphere; the thread between scenes;
   sources and credits in the footer; a complete still composition for reduced motion (pins released, loops off).
   **Navigation** is handled inside the page: every `#` link (menu, CTA, citation, Sources, back to top) scrolls to its
   target with the sticky menu's height taken into account, opens Sources when it points there, closes the phone menu,
   and moves focus; it never navigates the parent — the studio preview is a `srcdoc` frame, where a plain `#id` link
   would load the parent site. External links open in a new tab. No navigation calls AI.
9. **Persist**: the accepted plan with its provenance (model, time, estimated cost, attempts), picture verdicts,
   `imagery`, `claims` and `layout.version`; reopening and exporting render it without planning or composing again.

The studio shows the picture check (coverage, calls, cost), each picture's verdict, a **Degraded** notice with the
missing picture and an upload button, the claim-check result, and whether the page predates today's layout rules.

The studio files load with the deployed build id in their URLs (`/api/creative/version`), so a cached studio can never
run against a newer server.

### AI direction: limits and cost

* `CREATIVE_AI_DIRECTION` (on unless "off"), `CREATIVE_MODEL_UNDERSTAND` (default the cheap model; also used for the
  picture check and the claim check), `CREATIVE_MODEL_DIRECTOR` (default the strong model),
  `CREATIVE_DIRECTOR_MAX_TOKENS` 9000, `CREATIVE_MAX_REPAIRS` 1, `CREATIVE_MAX_THUMBNAILS` 10,
  `CREATIVE_AI_TIMEOUT_MS` 100000, `CREATIVE_CURATE` (on unless "off"; `CREATIVE_CURATE_MAX_TOKENS` 3500),
  `CREATIVE_CLAIM_CHECK` (on unless "off"; `CREATIVE_CLAIMS_MAX_TOKENS` 3000; at most two checker calls per attempt),
  `CREATIVE_WEB_DISCOVERY` (on unless "off"), `CREATIVE_WEB_SEARCHES` 3 per discovery, `CREATIVE_WEB_SEARCH_USD` 0.01.
* **Pictures come from Google Images** (SerpApi) and the owner. Wikimedia Commons is not a picture source at all, with or
  without SerpApi (the encyclopedia is read for facts only), so there is one picture check per page.
* **Discovery is kept apart from permission** (`lib/creative/discovery.js`). Finding the subject and being allowed to use
  a picture of it are two questions, answered and reported separately. (One search per page was too narrow: a
  recognizable subject whose first search came back as shopping results, figures and cosplay looked "not found".)
  * **Several distinct searches** (`CREATIVE_SERPAPI_SEARCHES`, default 3, at most 5), each a different INTENT for the
    subject itself, chosen by what the subject is -- a game: official render, key art, gameplay screenshot; a drawn or
    animated character: official render, promotional art, stills; a meme: the meme, the character image, the original
    image; a real thing: a high-resolution photo, an isolated shot, the thing in its setting; a real PRODUCT: a product
    photo, isolated on white, in use, from the side; a real PLACE: a photo, a wide panorama, at night, aerial. Never
    generic mood searches; the name is never doubled from the article title. (A physical product wins over the bare words
    "film" or "show": an "instant film camera, photographed to show its design" was once searched as a film.)
  * **At least two distinct families** run before results count as enough (real prompts: the first family alone
    returned 30+ results counted good, and every candidate then came from one intent).
  * **Near-duplicates** -- one listing at several addresses (the same title stem and shape), one file on another host --
    are skipped before the picture check, so its eighteen looks go to different pictures.
  * **The picture check judges every candidate** (it once returned 8 verdicts for 18, reading the selection limit as
    the number to judge; each call's schema now asks for exactly one verdict per candidate), and a photograph of a real
    product or place is the subject itself -- "form" is only for a fictional or trademarked character made physical
    (all 17 photographs of a Polaroid camera had been judged "form").
  * **A second chance**: when fewer than three usable pictures of the subject survive the check, the next family not yet
    searched runs once (within the budget and its one fallback) and its new pictures get their own look.
  * **The owner's pick**: the studio pre-selects the main picture and up to two that add something different (another
    shape or framing, else another source); the owner still builds only with the pictures they confirm.
  * **Fallback**: each result set is assessed before any picture is judged (shopping results, stock previews,
    art-community hosts, cosplay / figure / merchandise titles, logos, too small, off-topic). A weak set -- fewer than six
    usable results, or mostly repeats -- is followed by the next family; when every search so far was weak, one extra
    fallback family runs beyond the budget. An excellent first set stops after a second family (kept for variety).
  * **Cache**: keyed by the plan's version and the query; a strong answer keeps 30 days (`CREATIVE_SERPAPI_CACHE_DAYS`),
    a weak one two days, an empty one is never kept; a weak cached answer counts as weak, so it never stops a better search.
  * **Outcome**: discovery (the subject itself found / fan-made only / cosplay, figures or merchandise only / logos only /
    related only / nothing) is reported apart from permission (free / restricted / unclear). A picture of the subject whose
    page states no free licence is still a successful discovery: it goes to the owner to review, with "We found pictures
    of X, but their reuse rights could not be verified automatically." Automatic use is unchanged: only a picture whose
    page states a free licence, selected by the picture check.
  * **Diagnostics**: every generation records (ledger row `creative_discovery`, and the studio's "What we checked") the
    count at every stage -- queries, fresh and cached searches, weak searches and why, raw and distinct results, shopping
    skipped, shortlisted, thumbnails loaded, pictures judged, the subject itself, fan-made, forms, logos, free / restricted
    / unclear, download failures, used automatically, offered to review. `node test/review/creative-discovery-diagnose.js
    [subject]` prints the same stage by stage (live with the keys set, otherwise replayed from controlled fixtures).
  * **The encyclopedia lookup** accepts a full-text search hit only when its title names the subject ("Neegy" is never the
    article on a rapper born Neegy Neegyson).
* **The page blends into its pictures** (layout version 4; new or recomposed plans -- a saved page keeps its look until
  "Re-apply today's layout rules"): a picture on a plain background floats as its clean cut-out; a scene whose main picture
  keeps its own background (and does not already fill the scene) takes that background's tone, nudged until text reads at
  7:1, and the picture's frame dissolves into it (soft edges); the page's base colour follows the opening picture; each
  scene eases in from the previous scene's colour; the director builds the palette from the main picture's own colours
  (measured in the browser). Kickers use a per-scene accent that keeps 3.2:1 on the scene's tone.
* **Decoration is light, not clip-art.** Shapes render as light: rings and arcs as thin glowing strokes that fade along
  their length, lines and waves as soft glowing traces, circles as glows, blobs as haze, stars as twinkling sparkles (the
  focal shape of an explicitly abstract page stays solid). Every scene has its own air: far haze in the palette's colours,
  a vignette, and a few near out-of-focus sparkles (none on a "still" page; all motion off for reduced motion); decoration
  far back is softer. New or recomposed plans keep one decorative shape per scene at most (the largest), and a shape that
  passes behind the words fades almost away. (The light rendering applies to saved pages too; their layout is unchanged.)
* **Watermark check on picks.** Before a page is built, the pictures the owner picked are checked for watermarks at up to
  1024 px (one cheap vision call for up to four); a watermarked one is taken back out and marked on the pick screen.
* **The owner picks.** The studio shows the suitable pictures with the best one the studio can fetch pre-selected as the
  main picture; "Build with this picture" fetches the picked ones (up to four) and directs the page. A picked picture is
  credited to its source site and page as "no licence stated; chosen by the page owner" -- never as licensed; whoever
  uses one is responsible for having the right to.
* **Google Images via SerpApi** (`lib/creative/serpapi.js`): when the server has `SERPAPI_API_KEY` (a Railway variable;
  read only on the server, never logged, returned or stored -- error text is scrubbed of it), discovery searches Google
  Images instead of the Anthropic web-search step: up to three distinct searches for the subject itself (above) -- with cosplay, plush, figures, toys, merchandise, fan art, DeviantArt
  and Pinterest excluded in the query. Shopping results (`is_product`) are dropped. Every other result is LOOKED AT first:
  its search thumbnail goes to the picture check, which also judges **origin** (official / fan-made / unknown) from the
  picture and its source site. Only suitable pictures -- the character itself, not fan-made, not a form, logo or interface --
  have their page read (permission evidence) and their original downloaded. Suitability and licence stay separate: up to six
  suitable pictures without an open licence are shown to the owner with their source, the search that found them and their
  licence status; the owner decides. Each keeps its query, position, source site, page and image URL.
  `CREATIVE_SERPAPI_DAILY` 60 searches per day protects the plan's allowance; `CREATIVE_SERPAPI_USD` (default 0) adds a
  per-search amount to the Creative spend if set. 401/403/429 stop further searches (429 = hourly limit or the plan's
  searches used up); 45 s per search. A fan-made depiction never leads the page.
  Without the key, the Anthropic web-search step is used as before.
* **Provider unavailable**: an answer saying the account has no usable balance or the key is refused (401/403) stops
  Creative calling the provider for 10 minutes; every step then says why (research uses the built-in reader and ranking,
  direction the labelled built-in director). Overloads and timeouts are not treated as an outage. Nothing retries
  automatically beyond the one repair and the one claim-check follow-up; the studio's requests are single fetches.
* `CREATIVE_DAILY_USD_CAP` **$6/day** for all Creative AI calls on the server (estimated from tokens × the configured
  per-million prices, reseeded from the ledger after a restart); `CREATIVE_ACCOUNT_DAILY_PLANS` **20** direction calls per
  account per day (repairs count; picture and claim checks are not directions but count toward the $6). When a limit is
  reached the studio falls back to the built-in director (or ranking-only pictures) and says why.
* No credits are charged for Creative (review only); Business pricing is unchanged. Ledger costs are **estimates**
  from token counts; the provider invoice is the real charge.

## Art direction (layout archetypes, scroll choreography, image framing)

Why pages looked alike before: every scene was the same structure (a stage of boxes plus one text block in one of nine
regions), the composition rules pushed every focal picture beside the words, motion was a list of unrelated per-layer
effects, pictures were cover-cropped into masks and enlarged to fill containers, and nothing varied the recipe between
generations (the `seed` was stored, never used). The art-direction layer fixes that at the level of structure:

* **Recipe** (`art.js`, `choose`): one coherent decision per page, made before the scenes are written -- a motion
  **personality** (editorial, cinematic, kinetic, playful, luxe, mechanical, chaotic, still), a **scroll model** (flow,
  sequence, continuous, track, stack, snap), typography, navigation treatment, density, background progression, depth,
  and the **scene architecture** (a layout archetype, a choreography and a handoff per scene, and what each scene
  carries). The subject's genre and register weight the personalities; the pictures that exist decide which archetypes
  are possible (a cinematic band needs a wide, sharp, uncropped photo; a floating composition needs a cut-out; a strip
  needs three pictures; each picture may appear two or three times); the seed picks among good options; and recipes
  this account made recently (read from its saved projects) and this page's previous direction are steered away from.
  The server passes the recipe to the model (`artDirection`) and the validator; the built-in director (`director2.js`)
  uses the same recipe, so a page without the AI is art-directed too.
* **Genre, visual ambition and concept** (`genreOf`, `ambitionOf`, `CONCEPTS`). The genre comes from the settled
  identity type first (a franchise with game words -> game; a product -> its domain genre, tech for futuristic
  technology, else product; a place -> place; a meme -> meme), the words only when there is no type (and "satellite
  dish" is no longer food, "instant film camera" no longer a film). The **ambition** (restrained | expressive | cinematic
  | experimental) is chosen before anything else -- the owner's own words first ("minimal", "bold", "cinematic",
  "experimental"), then the purpose (personal, a tribute, a page to be read -> restrained), then the subject (game,
  film, futuristic tech, iconic place -> cinematic; product, character, food, art -> expressive; meme -> experimental;
  fashion, history, text-led -> restrained; a solemn place -> restrained), then the pictures (no picture to stage ->
  expressive). It bends the personalities and sets the modes (restrained never immersive; the others never quiet). The
  **concept** -- campaign, cinematic, object-led, world-building, kinetic-type, visual-journey, spatial-showcase,
  editorial -- is the page's named idea, built only from the existing families (no new renderer). Account history
  still steers between suitable recipes but no longer out of them (the ambition and concept are part of each
  candidate's score). Why: the director copies the recipe it is given (15/15 measured), and real pages re-derived
  exactly from `choose(seed, history)` showed a game franchise drawn luxe/editorial and an iconic building drawn
  editorial-sticky 98% of the time -- the chooser, not the model, was the source of the editorial bias.
* **The director keeps it**: on a new page the validator keeps the recipe's personality, family, mode, ambition and
  concept whatever the model returns (recorded as an `art:` fix); a revision the owner asked for may change them. The
  renderer is never part of the recipe: spatial stays the system's own decision (`spatial.decide`, unchanged).
* **Archetypes** (`archetypes.js`): 20 real compositions (editorial-hero, cinematic, split, giant-type, shrine,
  offcanvas, framed, floating, collage, poster, magazine, strip, sticky-steps, text, image, luxe, dense, depth,
  brutalist, gallery) plus `free` (the plan's own boxes, as before). Each places the words on a 12-column grid, the
  pictures in slots through the framing engine, its own decoration, height, pin and phone composition (its own stage
  height and whether the words sit above, below or over the picture). A scene whose pictures cannot carry its archetype
  is recomposed as the nearest one that can, and says so.
* **Choreography** (renderer): settle, pin-steps (the picture holds while each line takes its turn, pictures can change
  with them), zoom-away, scale-through, mask-reveal, type-wipe, track (vertical scroll moves a strip sideways), stack,
  depth, travel; **handoffs** between scenes: cut, overlap (the next scene slides over the seam), bleed (the colour
  evolves), carry (a picture leaves one side as the next scene's arrives from the other), stack (the previous scene
  holds while it is covered). The runtime writes two numbers per moving scene (`--p`, and `--pe` eased in the page's
  personality); effects use the individual transform properties, so they never fight entrances and loops. One scroll
  listener; reduced motion and no-script show every choreography in its finished composition; held scenes are bounded
  (≤ 4.2 screens on desktop, ≤ 3 on phones).
* **Framing** (`framing.js`): every picture says what it is for (full, contain, light, editorial, detail, bleed, framed,
  floating, cutout, masked, texture, collage), each with a crop budget (light 14 %, editorial / masked 30 %, bleed 34 %;
  only an explicit `detail` may crop harder). A container that does not suit the picture is reshaped toward it, or the
  picture is shown whole; a picture whose subject already fills it (measured from the pixels, or said by the picture
  check's new `framing` field) is never cropped further. The crop window keeps the measured subject in view (a tall
  subject keeps its top). Zoom ceilings: an ambient zoom ≤ 6 %, a scroll zoom ≤ 15 %, a camera push halved over cropped
  pictures, an entrance ≤ 8 % -- for every page, old ones included. The export carries each picture's budget and subject,
  and a runtime guard re-checks the crop against the real viewport.
* **Stability**: a plan without `art` renders exactly as before (only the zoom ceilings apply); an accepted art plan is
  returned in its stored form, so save, reopen and export never change it (layout rules version 5). "Update My
  Website" offers the page's current art direction to the director as its starting point; a revision that keeps the
  page as it is is never re-art-directed.

## Scroll storytelling (families, intensity modes, the persistent actor)

What still read as a template after art direction (measured against the scroll references in
`references/creative-scroll/`, including an older SiteRemade page): every scene was composed on its own, so the subject
was pasted again into each one; there was no arc across the page (scenes were picked one at a time); every page moved
with the same energy; typography had few moves; and the runtime read the layout of every scene on every scroll frame.
The second layer works at the level of the whole scroll, still only through fixed vocabularies and bounded numbers
(the model never writes CSS, HTML or script):

* **Families** (`art.js` `FAMILY`): a designed arc of beats per page -- object story, cinematic chapters, editorial
  sticky, layered parallax, typography-led, horizontal gallery, mask transition, poster to scene, gallery progression,
  colour progression. Each says which subjects, personalities, pictures and modes it suits; its beats are small pools of
  archetypes. The chooser weighs subject fit against what this account made recently (a family used recently costs more
  than its share of the fingerprint, so consecutive pages change arc). Fingerprint: `family.mode.personality/scroll/layouts`.
* **Intensity modes** (`MODE_LIMITS`): quiet (nothing holds the scroll, at most 2 scenes driven by it, no actor, no tilt),
  editorial (1 held scene, 3 driven, no actor), expressive (2 held, 5 driven, an actor run of up to 3 scenes), immersive
  (3 held, 7 driven, runs of up to 5). Calm registers (tender, reverent, serious, restrained) and personal pages are never
  immersive. The validator enforces the mode whatever a model returns (plans saved before modes keep their own limits).
* **The persistent actor** (object stories): ONE clean cut-out of the subject (the owner's own on a personal page, never a
  tight crop, never a photo with a background) lives on a sticky rail across a run of `stage` scenes and eases from pose
  to pose between them (`{x, y}` offset in vw / vh within 30 / 20, scale 0.5-1.4 and never past what its pixels hold,
  rotation within 18 degrees, scaled by the mode; calm personalities never tilt it). It holds while a scene holds, and at
  the end of the run leaves offstage, shrinks away, or scrolls on to rejoin a lineup. The run's scenes carry only words
  (placed on the side the actor leaves free) and a halo or the subject's name set huge behind it; they meet with cuts or
  colour bleeds, and nothing held straddles the run. On phones the actor stands in the top of the screen, the words
  below, with a third of the movement and at most 8 degrees of turn. Reduced motion or no script: the actor rests in its
  first pose at the top of the run.
* **Second vocabulary of archetypes** (32 in all): stage (actor scene), campaign (the name over the subject on an accent
  flood), splitscreen, fullscreen-object, orbit (lines either side of the subject), index, scrapbook (taped pictures),
  takeover (one statement set huge), chapters (full-bleed pictures crossfading while the scroll holds), lineup,
  cardstream (framed cards passing toward the viewer), edge-crop (an intentional close crop, only of a picture whose
  subject was located with room around it).
* **New choreographies**: actor, word-fill (a statement fills in word by word), chapters, cardstream, expand (a picture
  laid out at full bleed seen first through its own window, which opens -- the picture is never enlarged; a picture
  that cannot fill the scene within its bleed budget is revealed in its frame instead). **Text treatments**: word-fill,
  letter-spread (short giant headings on kinetic pages, by translate only), vertical kicker, outline. **Scene exits**
  (only for scenes the scroll already drives, never held ones): fade, lift, shrink. **Background progressions**:
  dark-to-light, warm-to-cool, muted-to-saturated, accent-takeover, gradient (a campaign or split screen always floods
  in the accent colour). **Scene types** (carry, cinematic, typography, sticky-editorial, gallery, takeover, transition,
  pinned, section) name what a scene is.
* **Budgets**: one actor per page; at most three layers moving with the scroll in a scene; at most two expensive
  effects at once in a scene (a clip-driven reveal, a panel, a duotone or blur) -- a third is simplified.

## The page as one timeline (`lib/creative/timeline.js`)

Scenes with their own choreography still read as section -> section. The timeline makes the page one directed
experience: what lives ACROSS scenes, what happens INSIDE them, how one BECOMES the next, and the page's rhythm. Every
part is structured data from fixed vocabularies with bounded numbers; the model or the built-in director chooses, the
validator bounds, the renderer implements (`plan.timeline`).

* **One scroll axis.** `g` = scene index + progress through that scene (0 when its top reaches the top of the screen, 1
  when its bottom does), computed from cached geometry.
* **Actors** (at most four, by mode: quiet none, editorial one, expressive two, immersive three): `primary` (the
  persistent actor's picture), `secondary` (a second cut-out that joins the end of the run, immersive only),
  `typography` (the subject's name as an object: breaking apart and receding, sitting behind the subject, or becoming
  the mask onto the next picture), `background` (a colour field drifting behind). Each is ONE element with keyframes
  `{ g, x, y, s, r, o, sp }` -- so a scene's end state IS the next scene's start state (`sceneStates` proves it); the
  validator forbids a fade-out-and-back inside a run (a respawn) and a jump between two close keys. The actor holds its
  pose through the middle of a scene and travels between scenes over six tenths of one, eased smoothly.
* **Beats** (at most three per scene): translate, scale, rotate, opacity, clip, crossfade, text-swap (`text.alt`: a
  short second line, no numbers), word-fill, letter-spread, depth-shift, perspective, background (the scene floods its
  new colour), takeover (a circle of the new colour grows across it); on the heading, body, focal picture, stage or
  scene; each on its own window of the scene's progress, `in` (into the scene's rest) or `out`. A beat never drives a
  property the scene's choreography already drives (`CHOREO_OWNS`).
* **Transitions** (per seam): cut, color-bleed, actor-carry, image-expand (the next picture grows from a window into its
  scene -- a clip, never a zoom), card-expand, foreground-wipe (a panel passes across and hides the change),
  type-mask (the name becomes the window onto the next scene's own picture, shown at cover size, then opens),
  shape-takeover (a circle of the next scene's colour takes the screen), depth-handoff (the scene moves toward the
  camera as the next appears behind). Each is checked against the two scenes (a picture to expand, a card to open, a
  word to mask with) and against the mode's budget of signature transitions (editorial one, expressive three,
  immersive four, quiet none); otherwise it becomes a colour bleed.
* **Rhythm and moments.** setup -> event -> rest -> escalation -> payoff, never two events side by side; two or three
  memorable moments on an expressive or immersive page (one on an editorial page, none on a quiet one), each what its
  scene can carry (an actor turning, a word takeover, a chapter flight, a lineup rush, a colour flood...). The big
  moves (perspective, takeover, letter-spread, flood, clip, depth-shift) happen only at events; a resting scene gets at
  most a gentle beat. At most three things move at once in a scene (its choreography, the actors on stage, its beats --
  the beats give way first); phones show at most the primary and typography actors.
* **One surface.** The scenes an actor crosses are transparent over a fixed backdrop whose two colour sheets crossfade
  from each scene's colour to the next as the seam approaches (opacity only); the typography and background actors
  live behind the scenes' content, the picture actors and the transitions' own elements in front.
* **Asset needs follow the motion.** Before any picture is found, `motionIntent` says what the kind of subject will
  probably need (a clean cut-out to carry across scenes, a wide picture to fill the screen); discovery searches for a
  need the results do not meet (one extra search, bounded) and tells the picture check. After direction the timeline
  records `needs` -- what its choreography needed and whether this page's pictures met it -- and a transition whose
  picture is missing falls back.
* **Behavioural anti-repetition.** A page's fingerprint is `layout#behavior`: the actors' lifecycle, the signature
  transitions, the rhythm, the moments, the typography's behaviour, the progression and the scroll model. Similarity
  weighs both halves, so two pages with different layouts but the same choreography count as alike.
* **Renderer tiers** (`lib/creative/renderers.js`): `dom` (this renderer, the default) and `spatial` (the optional
  WebGL layer over the same DOM page -- see "The spatial tier" below).
* **Phones** recompose: every beat moves half as far (`--mk`), the picture actor stands in the top of the screen above
  its scene's words, rotation is clamped to 8 degrees, secondary and background actors are not shown, the wipe loses its
  skew, held scenes are shorter. **Reduced motion and no scripting**: the cast does not play; the actor rests, as a real
  picture with its alternative text, in the scene it opens; every beat and seam shows its finished state (the CSS
  fallbacks of the progress variables are the rest composition).
* **Saved pages** keep exactly their timeline (the accept pass returns the canonical form); pages saved before the
  timeline (or before modes) render as they did -- no timeline is invented on reopening.

### Performance

Only `transform`-family properties (`translate`, `scale`, `rotate`), `opacity` and `clip-path` change while scrolling.
Geometry is measured when the layout changes (load, resize, a picture arriving, a font settling -- a ResizeObserver
on the page) and cached; each animation frame works from the scroll position alone. Measured by
`perf-probe` (Electron, software rendering, 240 scroll steps, 1440x900), eight pages made before this change against
eleven made after it:

| | layout reads per scroll frame | median frame | 95th percentile |
|---|---|---|---|
| before | 13 - 25 (`getBoundingClientRect` per scene, nav target and hold, every frame) | 6 - 24 ms | 6 - 36 ms |
| after | 0 | 6 ms (one page 12 ms) | 6 - 24 ms |

The far ambient haze no longer blurs a 72vmax animated layer (the gradient was already soft). The DOM tier uses no
WebGL, canvas or third-party script; its runtime remains a few kilobytes of fixed code. Depth, particles and camera
flights belong to the optional spatial tier (below); real 3D morphs are not attempted.

## The spatial tier (`lib/creative/spatial.js`, `spatial-runtime.js`)

An optional layer for the few concepts that genuinely gain from real depth. It is **off unless `CREATIVE_SPATIAL=on`**,
and even then most pages stay DOM. The architecture is unchanged -- director -> validated timeline -> renderer selection
-> renderer -- and the spatial layer reads the SAME validated timeline (scenes, actors, moments, rhythm, transitions,
pictures, words, colours) plus a few bounded fields of its own. The model never writes code; it may ask for
`renderer: 'spatial'`, and the decision below has the last word.

* **The decision** (`decide`, deterministic, recorded as `timeline.why` and in the direction's notes). Reasons for
  spatial: `model` (a GLB the owner supplied for the subject), `object-turn` (a clean, sharp cut-out of a product or
  character whose page has an actor-turn/entrance moment), `camera-flight` (2-5 neighbouring wide, sharp pictures -- or
  the steps of one held chapters scene -- on a place/flight/chapters page), `globe` (a technology / data / global
  concept), `lineup` (a lineup scene of 3+ pictures of a product or character), `particles`, `card-planes`. Strong
  reasons count twice; spatial needs a score of 2. Reasons to stay DOM, any one enough: the flag off, a quiet or
  editorial mode or family, a fashion/portfolio/editorial/memorial subject, a personal page, a calm personality (luxe,
  still, editorial), no sharp picture (`weak-pictures`), nothing that needs depth (`no-reason`). **Immersive mode is
  never a reason.** The flag gates the choice when a page is composed; a page accepted as spatial stays spatial on
  reopening and in its export (the render follows the validated plan, never the environment).
* **The block** (`timeline.spatial`, validated by `normalise` on every save, reopen and export): quality ceiling
  (high|medium), phone policy (lite|dom), depth pattern (layered|deep|tunnel), fog; **camera keys** `{g, dz, dx, dy,
  yaw, pitch}` (bounded: dz -0.3..0.5 of the camera distance, dx/dy +-12% of the screen, yaw +-14 deg, pitch +-8 deg; at
  most 24; start and end at rest; a rate limit per unit of scroll so the camera never jumps) with the move each scene
  makes (hold, push-in, pull-back, lateral, rise, fall, orbit, handoff, reveal, fly-through); **actors in depth** (per
  timeline key: z and a Y turn; form billboard | plane | model); **set pieces** (flight, lineup, cards, globe); **one
  particle field** (burst, ambient, dust, stars, points, data -- capped per style); the timeline's transitions mapped to
  their spatial meaning (derived, never chosen apart from it); image morphs (dissolve, cross).
* **The camera follows the rhythm**: an event moves it (orbit for an actor's turn, fly-through for a chapter flight or a
  dive, lateral for a lineup rush, rise for a colour flood or world change, pull-back for a type break), an escalation
  moves it further, a rest holds it still, a depth hand-off dives through its seam, and the last scene holds at rest so
  the page ends on its designed composition.
* **Transitions in depth**: actor-carry -> the actor moving through world space; depth-handoff -> a camera dive;
  foreground-wipe -> a slab passing the camera; image-expand -> the next picture approaching until it fills the screen;
  card-expand -> a card flying forward; shape-takeover -> a disc approaching; colour-bleed -> the fog changing colour;
  type-mask stays a DOM effect (a word as a window is sharpest as type).
* **Morphs**: a dissolve (a picture leaving through fine screen-space grain) and a cross-morph (one picture becoming the
  next in the same place). **No geometry morphs**: they need two models with matching morph targets, which this tier
  does not support (morph targets in a GLB are ignored).
* **Models**: one GLB (binary glTF 2.0), uploaded by the owner in the studio ("+ Add a 3D model (.glb)", at most 8 MB),
  stored like the pictures (content-addressed) and exported as a file under `assets/`. The runtime reads a subset:
  triangle meshes, float positions, optional normals and texture coordinates, node transforms, base colour and an
  embedded base colour texture, at most 8 primitives and 80,000 triangles. Not supported (the model is then not drawn):
  skins, animations, Draco/meshopt compression, sparse accessors, required extensions. **A model is never required**: an
  actor always carries its picture, drawn as a turning plane until the model has loaded, and for good if it does not.
* **The runtime** (`spatial-runtime.js`, ~38 KB, inlined in the page -- no CDN, no library): WebGL 1 with picture
  planes (cover-cropped, never stretched, mipmapped, premultiplied), billboards, a GLB mesh, GPU point fields, globe arcs,
  fog and a perspective camera whose rest view maps the page 1:1 (an actor at rest lands where the DOM actor would: 8-11
  px on desktop, 0 px on phones in the review). It draws BEHIND the DOM words (which stay sharp, selectable, editable and
  accessible) and above the backdrop; while it runs the scenes are transparent over the backdrop, and a DOM picture,
  actor or transition element is hidden only after its replacement has been drawn. Three.js was not used: the page needs
  about six primitives, and three.js plus its GLB loader would add ~800 KB to every spatial page.
* **Budgets** (`QUALITY`, per device tier; the plan sets the ceiling): high -- DPR 1.75, 1,600 particles, 2,400 globe
  points, 12 arcs, 16 textures up to 2,048 px, 1 model, 80k triangles, 40 draw calls; medium -- DPR 1.25, 800, 1,400, 8,
  12 at 1,600 px, 28 draw calls; low -- DPR 1, 260 particles, 600 points, 4 arcs, 8 textures at 1,024 px, no model, 16
  draw calls. Pictures are uploaded no larger than they are seen (actors, lineups and cards at most 1,024 px, 512 px on a
  phone). A device that cannot hold its frame rate steps down a tier, and below the lowest hands the page back to DOM.
* **Phones**: the low tier -- no model, fewer particles, DPR 1, half the depth, no orbit or sideways camera travel,
  smaller textures, at most 5 cards or lineup pictures, the actor in the same top band as the DOM actor; a page whose only
  reasons are decorative (particles, card planes) gives phones the DOM page.
* **Reduced motion**: the spatial layer never starts; the DOM page shows its complete still composition (a globe is
  drawn there as a still SVG of the same points).
* **Failure** (reported as it happened -- the layer's own teardown is never mistaken for a lost context): no hardware
  WebGL (software emulation counts as none), a context that throws, a driver error, a lost context, a picture WebGL may not read (a page opened from disk), a model that will not load, or any error -- the layer
  removes itself (or the one piece) and the DOM page is exactly what it would have been.
* **Export and ownership**: the runtime is part of `index.html`; pictures and models are files in `assets/`; nothing is
  loaded from SiteRemade or any other server; README.md says the 3D layer needs the folder to be served by a web host
  (opened from disk it shows the flat page).
* **What real prompts taught it** (Super Smash Bros. Ultimate, Neegy, a Polaroid camera, Starlink, the Sydney Opera
  House, ambient music, Comme des Garcons -- through the real pipeline, real discovery and real AI direction):
  the director's own `renderer: dom` is its default, never a veto; the concept is read from the SUBJECT (its name,
  what it is, how it looks) -- never from the page's generated title or logline -- and with narrow words (a camera's
  "digital-era" is not a data network, ambient music's "Internet Age" and "listening space" are not a globe or a
  starfield; the globe needs satellites, networks, logistics... and never a product or a character); a flat picture
  turns at most 16 degrees (a wide or group picture 8) -- further, it reads as a card; only the scenes the layer draws
  behind (a picture actor's run, a set piece) give up their surface and atmosphere, and a spatial transition plays
  only between two such scenes (elsewhere the DOM one does) -- a designed opening or a closing card keeps its look; a
  globe is drawn in the page's ink when its accent is too close to the scene; on a phone the actor steps back while a
  scene's words pass through its band, and clears quickly once its run ends; another-angle searches only for physical
  products. Thin real inputs (one picture, no cut-out) make a DOM page, by design.
* **Anti-repetition**: the fingerprint gains `x:<camera moves>/<depth>/<spatial transitions>/<particles>/<actor
  forms>/<set pieces>`; two DOM pages compare exactly as before, and a spatial page never reads as the same as a DOM one.
* **Asset planning**: a spatial page records what it wanted -- a transparent cut-out, another angle of the subject, an
  environment picture, a foreground element, a model -- and whether it had them; discovery may look for another angle
  within the same single extra search (SerpApi, unchanged; no Wikimedia Commons). Never required.

## The asset director (`lib/creative/asset-director.js`)

Before the pool, the visual plan and any composition, the asset director decides which pictures the page is built from:
the smallest strong, coherent set that carries the idea. It measures nothing new and searches nothing new: it reads what
the studio already measured (`assets.assess`: size, subject box, background, colours -- and, for pictures measured from
now on, a 64-bit perceptual signature `sig` and `sharp`), what the picture check already saw (`curation`: role,
identity, issues, framing, separable, quality), where a picture came from (owner upload, host, address) and the existing
gates (`premium-source.js` for video, `three-d.js` for 3D).

- **Profile** per picture: identity (exact / form / related / other / owner -- demoted when it shows the right kind of
  thing in the wrong colour or form: orange soda for lime soda, a sneaker for a loafer, an SUV for a coupe), resolution,
  sharpness, subject dominance, crop flexibility, negative space, background cleanliness, isolation, light, contamination
  (watermark, text, marketplace presentation -- never a plain background as such), generic stock; and a suitability per
  role (hero, full bleed, cutout, actor, 3D source, cinematic source, detail, support, callback). Never one score.
- **Near-duplicates**: the same picture resized, mirrored (the signature and its reflection), re-hosted (one file name on
  two sites), cropped (what it shows and its colours) -- the stronger copy stays.
- **Floor** for pictures the owner did not supply: watermarked, marketplace listings, text or screenshots, other subjects,
  thumbnails, another product, generic stock when anything better exists are left out, with the reason. No picture is
  better than a bad one; with nothing above the floor the page is carried by type and colour.
- **Decisions**: the hero (the owner's main picture always -- a weak one leads, staged around; else the existing choice
  unless it is below the floor, weak, or clearly beaten), the actor (only a picture that really separates), the detail,
  the 3D and cinematic sources among what the gates allow (today's choice unless clearly beaten), the support (at most six
  found pictures; one whose light fights the set's is left out), and scarcity (one strong picture: shown at most twice).
- **Owner and permissions first**: an owner upload is never rejected for quality; the decision only ever narrows what the
  permission rules allowed. A logo is navigation and brand, never a scene picture or a source.
- **Ownership downstream**: `plan.assetDirector` (`v` = creativeAssetDirectorVersion) records it; every later stage may
  scale, crop and stage its pictures but never show one it rejected (validate2.js drops such a layer). Saved pages without
  the record reopen exactly as before and are never rescored.
- **One optional look**: only when the rules are unsure (two heroes too close to call, nothing surely of the subject) ONE
  cheap call (`submit_creative_asset_choice`, the cheap model, at most 300 output tokens) sees the shortlist's thumbnails
  and answers with candidate ids only, validated (known, shortlisted, not rejected, not a logo, able to carry the role).
- **Search by role**: drinks, vehicles, fashion, beauty and software are searched for the roles their pictures play
  (`discovery.js`, query plan q3), within the same bounds and the one fallback as before.
- `CREATIVE_ASSET_DIRECTOR=off`: the pool, the pictures and the pages are exactly as before.

Verification: `test/creative-asset-director.test.js` (fixtures A-P) and `test/review/creative-asset-review.js` (the six
subjects on real photographs, before and after, through the visual review to the final page).

## The visual director (`lib/creative/visual.js`, `visual-capture.js`, `visual-review.js`)

After the structured review, the finished page is rendered in a headless Chromium (driven over the DevTools protocol with
Node's own WebSocket -- no dependency), captured scene by scene at 1440 and 390 in full motion with every entrance stilled
at its end, and measured: how much of the screen the subject commands (through its crop), the contrast of each line of
words against what it actually stands on (the same screen with the words hidden; the worst letter-sized patch counts),
dead space, balance, competing focal points, video and 3D presence, and each scene's visual impact. Genre-aware bars
(`GENRE` in visual.js) decide what is a fault: a luxury page may breathe, a car or a product should command its opening,
editorial type may lead.

ONE cheap vision call (`CREATIVE_MODEL_VISUAL`, default the cheap model; at most `CREATIVE_VISUAL_MAX_TOKENS` = 600 out)
sees two contact sheets and what was measured, and answers `submit_creative_visual_review`: problems from a fixed list,
each with ONE repair chosen from the repairs offered for that scene and view (never CSS, HTML, code, copy or a plan). Each
repair is a bounded change through the existing composition system, validated as a saved page, rendered and measured
again, and kept only when the problem it was for measurably eases and nothing else got worse (overflow, words off screen,
crops, headline contrast, a lost picture, the structured critique, any new serious visual fault). At most three kept,
six tried. A measured problem whose first repair is undone may try the next one offered; a judgement nothing measured
gets only the model's own repair.

Two checks need no model at all. **The ending** (`weak_final_payoff`) is judged as an ending, against the page's recent
visual high point (the last three scenes before it that show a real subject -- a text-only scene in between does not
excuse it): a subject that is a speck (under 2% of the screen), or one short of its genre's ending bar and well below that
high point. Luxury may end quietly but not on a speck; editorial and personal pages, or a page whose bookend is not an
image or actor callback, may end on legible display type. **Type over the heading** (`competing_heading_overlap`): every
large piece of type in the scene (the heading's settled line, a text-swap's other line, word layers -- size and colour read
from the letters themselves) against the heading: both at least 20% opaque, overlapping at least a quarter of the smaller,
at least half the heading's size, and not a clear hierarchy (twice the size and under 35% of its visual weight). A word
behind the product, an edge label, a faint watermark and deliberate layered display type are left alone.

The page records `plan.visualReview` (`v` = creativeVisualDirectorVersion). Saved pages without it render as before; a
reopened page is never reviewed again; a plan cannot bring its own record.

- `CREATIVE_VISUAL_BROWSER` -- the Chromium/Chrome/Edge executable for the capture, or `auto` (the usual places). Unset:
  the visual director is unavailable and makes no call. Production (Railway) needs a Chromium installed and this set.
- `CREATIVE_VISUAL_REVIEW=off` -- the structured result ships exactly as before.
- No browser, a failed capture, a failed or invalid answer, over budget: no repair, the page ships as reviewed.

Verification: `test/creative-visual.test.js` (fixtures A-I in `test/helpers/visual-fixtures.js`, a real browser when one
exists) and `test/review/creative-visual-review.js` (the six subjects on real photographs).

## Built-in pipeline (stage 1; now the labelled fallback)

1. **Understand** (`understand.js`): `recognizable` (a real thing with public facts), `personal` (“my goldfish
   Bubbles” — the owner supplies the facts), `fictional` (an invented idea — never looked up) or `ambiguous` (the
   encyclopedia returns a disambiguation page → the owner picks). Also the tone (absurd, cinematic, playful, lyrical,
   tender, retro, editorial) and the purpose (showcase, fan page, tribute, memorial, joke, story).
2. **Research** (`research.js`, server): Wikipedia summary + plain-text article for facts — sentences that stand on
   their own (no “Most are…”, no half quotations, abbreviations handled, references sections skipped), each kept with
   its section, article URL and licence. **Facts only**: no pictures come from Wikipedia or Wikimedia Commons (pictures
   come from Google Images or the owner; see above). Only https://en.wikipedia.org is contacted; retrieved text is
   stripped to plain text and handled as data. Found pictures are downloaded once, sent to the browser as data, and saved
   into the project's asset store — the page never hotlinks. Personal subjects get general species facts only.
3. **Assets** (`assets.js`, runs in the browser on `<canvas>` pixels): size, aspect, transparency, where the subject
   sits, background uniformity, colours. A **cutout** is made only by a real step: flood-fill from the edges on a
   plain background, soft grey cast shadows removed, enclosed background pockets removed (not for illustrations),
   edges defringed and feathered. The cut is **refused** when its outline does not sit on a real contrast edge (a
   white roll on a white wall leaks and shreds — measured: clean cuts score 3.6–8.5, leaks 1.1–1.2, gate 1.6) or when
   the subject runs off the frame. A refused or busy-background picture stays a framed picture; it is never pretended
   into separate moving parts.
4. **Direct** (`director.js`): a scene plan — concept line; a world chosen from what the subject is (spotlit
   monument, studio, gas-lit fog, underwater, night sky, open sky, warm counter, printed page) with its light and
   particles; the subject and up to two companion layers with roles, depth, entrance, ambient loop and scroll
   parallax; a hero layout from what the pictures support (`stage` for a free-moving cutout, `portrait` for a framed
   photo — window / gilt frame / arch / porthole, `panorama` for a wide sharp photo, `type` when there is no picture of
   the subject); typography; a connector that runs through the page (unrolling ribbon, investigator's thread,
   bubbles, orbit, line); sections chosen for the subject and purpose (character: dossier, record, history, pictures;
   object: statement, specimen “up close” with call-outs, plate, facts, history, pictures, ode; personal: about, photos,
   memories, general species aside; fictional: statement, story). The plan is data only.
5. **Validate** (`validate.js`, every plan, also any future model plan): enums/numbers clamped, strings capped, asset
   and fact references checked; **honesty** — a “sourced” line without a real citation is dropped, a personal subject
   appears only in the owner's own photos, general species facts are labelled as general; **legibility** — text and
   accent colours forced to readable contrast; **composition** on a desktop (16:10) and a phone stage — the drawn
   subject (box × image aspect × subject position in the image) is grown to a minimum size, never shrunk; the desktop
   headline is kept off it (the subject moves, else the headline moves); companions must not touch the headline or
   the subject — they move to a free slot, are left out on phones, or are removed; credits are made complete for
   every picture shown and limited to those.
6. **Render** (`render.js`): one reusable renderer for every plan. Layers nested as parallax › entrance › loop ›
   picture so the motions compose; entrance on the subject's decode (with a 2.5 s fallback); CSS ambient loops (float,
   sway, swim, breathe, drift) scaled by a calm/lively intensity; scroll camera push and depth parallax in the hero;
   sections revealed once as they arrive (never hidden again); plate pictures and the specimen drift with scroll; the
   connector runs down the side margins and crosses only in the empty band between sections, drawn as you scroll;
   particles are ≤ 60 CSS elements; layout is reserved before pictures load; a picture that fails keeps its place and
   shows a quiet stand-in (the subject's initials in the hero). Without JavaScript everything is simply shown. With
   `prefers-reduced-motion` (or the studio's preview toggle) the page is the complete still composition: no loops, no
   parallax, everything revealed, the connector fully drawn. The studio adds one preview-only listener (live text
   edits, motion toggle, replay); otherwise the preview document and the exported `index.html` are the same (tested).

Copy keeps three kinds of words apart: **sourced** (numbered citation to the source list), **supplied** (from the
owner) and **imagined** (headlines, taglines, odes — marked ✦ Imagined, and explained in the sources section). An edit
to a sourced line in the studio turns it into the owner's words and removes its citation.

## Cost and allowance

Business pricing and behaviour are unchanged. No credits are charged for Creative (review only). Per page:

* **research** (no AI): 2–4 requests to Wikipedia (summary, article text; a search when the title is not exact), recorded
  in the ledger (`creative_research`: requests, bytes, ms, `usd: 0`). Pictures: up to three Google Images searches
  (SerpApi plan), ≤ 18 thumbnails, ≤ 8 pages and originals.
* **AI calls** (estimated from token counts × configured prices; the invoice is the real charge): understanding
  ~$0.004; picture check ~$0.01; direction ~$0.10–0.15 per attempt (one repair at most); claim check ~$0.005–0.01
  per attempt (≤ 2 calls); without SerpApi, web discovery ~$0.03–0.08 (≤ 3 searches at $0.01 plus tokens). Typical page: **$0.13–0.45**, 60–180 s. Measured figures for each review run are in
  `CREATIVE_PROGRESS.md`.
* No image generation, no OpenAI. Pictures are stored once per project (content-addressed, deduplicated).

## Verification

* `node --test test/creative.test.js` — separation from Business, honesty and composition rules, cutouts on synthetic
  pictures, renderer escaping / no remote loads / reduced motion / preview = export, save → asset
  store → reopen → export, research route guards (no network).
* `node test/review/creative-review.js <outDir>` — the real studio in Electron against a local `server.js` (every
  provider key blank; the mock call log must stay empty), real Wikipedia, for the four briefs in
  `test/fixtures/creative-briefs.js`; then the real export compiler; then `creative-capture.js` records each exported
  page (entrance, loop, scroll, full page, reduced motion, failed pictures) at 1440×900 and 390×844 with measurements.
* The personal brief is **synthetic fixture data** (“Bubbles” is invented; his “upload” is a CC0 Commons goldfish
  photo) and both the studio and the page carry a visible TEST FIXTURE label.
* AI direction: `node --test test/creative-ai.test.js` — the v2 validator against hostile / careless plans, the v2
  renderer's safety, persistence without re-planning, and the server path with a **mock** provider (understanding →
  direction → one repair → labelled fallback; limits; ledger). Mocks answer as `mock-creative-*` and every plan they
  produce is labelled MOCKED; they test plumbing, not creative quality.
* Real model: `node test/review/creative-review.js <outDir> --remote=https://www.siteremade.com
  --briefs=test/fixtures/creative-briefs-r3.js` with `CREATIVE_REVIEW_EMAIL` / `CREATIVE_REVIEW_PASSWORD` for a review
  account — the deployed studio with the real model, within the deployed limits. Each round's brief file says which
  briefs were fixed before tuning and which were unseen; the supplied-artwork brief is reported apart from automatic
  sourcing. `--provider=mock` runs the same harness locally against the mock (`MOCK_CREATIVE=ok|repair|invalid|error|
  claims|claims-missing|claims-noevidence|claims-conflict|claims-error|claims-junk`).
* Diagnostics: `research(u, { trace: [] })` records every candidate with its score, kind, verdict and why it was kept
  or dropped.
* Web discovery: `node --test test/creative-web.test.js` — refused URLs and addresses (including a public name that
  resolves privately and a redirect into private space), image signatures, permission evidence, bounded deduplicated
  discovery, and that the search step can submit only URLs the search returned (no network).
* Characters: `--briefs=test/fixtures/creative-briefs-characters.js` -- six franchise characters with distinct visual
  directions; the main visual must be the character's own depiction; with none usable automatically the case stops
  at the gate (no paid direction) and the diagnostics say where and why.
* Completion round: `--briefs=test/fixtures/creative-briefs-final.js` (the Pokémon failure, Zelda with the owner's
  main picture, two pages that already worked, two subjects chosen after the fixes). The harness answers the
  missing-imagery gate as each case says, marks an upload as the main subject through its menu, and clicks every menu
  item and CTA inside the studio preview. Run it locally first with `--provider=mock` (`MOCK_CREATIVE=curate-none`
  forces the gate) — it costs nothing and catches studio-flow breaks before a paid run.
* Stability: `test/fixtures/creative-saved-stage2.json` is a page saved by the stage-2 code; it must reopen unchanged.
* Art direction: `node --test test/creative-art.test.js` -- different recipes for different subjects and seeds,
  anti-repetition, every archetype a distinct composition, every choreography rendered with a reduced-motion version,
  personality changing rendered behaviour, framing (whole subject, tight pictures never cropped further, aggressive crops
  only when planned), save / reopen / export / revision round trips, phone compositions. `node
  test/review/creative-art-qa.js <outDir> --run` -- the real studio on eight deliberately different briefs
  (`test/fixtures/creative-briefs-art.js`, no model calls), exported and captured at desktop, tablet and six phone
  widths (320-430) with crop, overflow, off-screen-text and held-scene measurements, and contact sheets to judge
  diversity by eye.
* The timeline: `node --test test/creative-timeline.test.js` -- actor state continuity at every seam, no respawns or
  jumps, transitions validated, every number bounded, at most three moving things a scene, hero moments and rhythm,
  typography as an actor, image expand, type mask, colour bleed and takeovers, phone recomposition, reduced motion,
  behavioural anti-repetition, save / reopen / export byte for byte, old pages untouched, renderer tiers, asset needs.
* The spatial tier: `node --test test/creative-spatial.test.js` -- the renderer decision (and that DOM stays the
  default, that immersive alone is never a reason, that the flag gates it), the validated block, camera / model /
  particle / texture bounds, the picture fallback for a model, the runtime itself run against browsers with no WebGL, a
  throwing context, a driver error, a lost context, reduced motion and a phone, a model that will not load, transitions
  mapped from the timeline, the export (runtime inside, model as a file, no CDN), reopening byte for byte (spatial and
  old DOM pages), the depth fingerprint, asset planning, and the Business asset path unchanged. Visual review:
  controlled pages captured through scroll with the GPU on (desktop 1440x900, phone 390x844 emulated).
* Picture discovery: `node --test test/creative-discovery.test.js` -- several distinct search families by default, a
  weak first search followed by others, shopping results never counting as the subject, fan-made-only reported as found
  but not official, unclear rights reported apart from discovery and reaching the owner's review, free pictures still
  used automatically, a weak cached answer never blocking a better search, everything bounded, and no picture used
  without the permission reading saying free (controlled fixtures for Super Smash Bros. Ultimate and Neegy).
* Scroll storytelling: `node --test test/creative-scroll.test.js` -- families and modes and their limits, the persistent
  actor (one picture, bounded poses, runs joined by cuts, a clean cut-out only), the schema dropping anything outside the
  vocabulary, clamped transforms, effect budgets, phone and reduced-motion compositions, no enlargement (actor, chapters,
  cards, expanding pictures), the edge crop only for a located subject, save / reopen / export round trips with the
  actor shipped and credited, and a runtime that reads no layout while scrolling.

## Stages

1. **Stage 1:** review-mode switch; understanding; Wikipedia/Commons research with provenance (Commons pictures since
   removed: Wikipedia is facts only); pixel assessment and
   background removal; deterministic director; validator; renderer; studio; save / reopen; export; tests.
2. **Stage 2:** AI creative direction — model understanding before research, model-directed v2 scene plans with vision
   on the real pictures, validator v2 with one repair and a labelled fallback, renderer v2 (scenes, pinning, shapes,
   words, masks, camera), "Try another direction", Creative-only limits and ledger, claim check.
3. **Stage 3 (this change):** subject imagery and composition — visual needs and photographable-form queries, query-aware
   scoring with Commons categories (since removed), the picture check before download, picture roles through to the director and the
   studio, degraded-imagery reporting with uploads, cleaner cutouts, grouped layers, collision order that keeps the
   subject large, accept/safety validation with layout versions, complete claim-check accounting, kenburns and sheen.
4. **Completion round:** web discovery with permission kept apart from discovery; the missing-imagery gate (upload,
   reviewed picture with the owner's rights, search again, explicit abstract); owner roles for uploads with an enforced
   main picture; in-page navigation that works in the studio preview and exports; provider-outage handling; ordered
   Creative ledger. Creative remains review-only (`?creative=1`), with no Creative pricing.
5. **Art direction:** recipes with motion personalities and scroll models, 20 layout archetypes, scene choreography and
   handoffs, image framing with crop budgets and zoom ceilings, anti-repetition across an account's pages, an
   art-directed built-in director, and the picture check's framing judgement.

See `CREATIVE_PROGRESS.md` for the running log.
