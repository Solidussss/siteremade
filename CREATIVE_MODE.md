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
   for an idea with no likeness) and up to four Commons queries written like Commons file names. For a fictional
   character or other fictional, branded or trademarked subject the main visual is its **own depiction** (artwork, a
   render, a sprite, a show or game still) and the queries look for that and for fitting scenery -- never for
   photographable forms (cosplay, figures, merchandise), which are not the character. A clarification is asked only when a wrong identity would change the page. A
   personal subject's *name* is never researched (only its general type). If the call fails or the budget is used, the
   built-in reader takes over (recorded).
2. **Research** (`research.js`, same sources): the resolved article, the article's files, a Commons search for the
   subject, one for a layer-friendly version, and the directed queries. Candidates are scored on the subject's words —
   and a directed result on **its own query's** words — in the file's name, description and **Commons categories**
   (a flat score for directed results once let unrelated 9504-px festival photos outrank a cosplay photo of the
   subject). Logos, maps, diagrams, timelines and screenshots are recognised from their categories and rank low; batch
   uploads of one shoot count once. Only free licences; only fixed Wikimedia hosts; model-written text never becomes a
   URL (queries are search terms sent to the Commons search API).
3. **Picture check** (`ai.curate`, cheap model, one call, ~10 s, ~$0.01): a shortlist of up to 16 candidates, balanced
   across where they came from, is judged from **330-px thumbnails before anything is downloaded**: role (subject /
   environment / supporting / detail / logo / reference / unrelated), identity (exact / **form** = a real-world form such
   as a cosplayer, figure, merchandise or painted vehicle -- recorded, **never selected, never coverage**, never downloaded
   or used; a page whose subject has only forms stops at the missing-imagery gate / related / other), what it depicts, issues (cropped, watermark, text-heavy, busy, …), whether
   it could be cut out. It selects a coherent set (the main picture first, complementary roles, no near-duplicates),
   states coverage of the main visual (strong / partial / none) and names the pictures that are **missing**. Only the
   selection is downloaded (≤ 7). The verdicts travel with the assets and are saved with the project, so reopening
   never judges again. Without it (off, over budget, failed) the ranking alone picks, and the studio says so.
   **Where the pictures stopped** is recorded with the research (`research.diagnostics`): the Commons queries, licence /
   type / size refusals, low relevance, the candidates ranked below the shortlist (never looked at), every judged
   candidate with its verdict, licence and outcome; the web search's queries, stop reason or refusal, page and image
   errors, and every found picture assessed separately for what it shows, technical usability and stated permission.
   A stage verdict -- none, discovery, identity (only forms), permission, selection, provider, or processing (found but
   unreadable in the browser) -- is shown at the gate under "What we checked".
   **Web discovery** (`webimages.js`, `webfetch.js`, `CREATIVE_WEB_DISCOVERY`): when the page needs a picture of its
   subject and Commons did not cover it, one cheap-model call with Anthropic's **web search** server tool (the existing
   API key; $10 per 1,000 searches plus tokens; ≤ 3 searches) finds pages that show the subject. The model may submit
   only URLs the search itself returned. A hardened fetcher reads ≤ 8 of those pages: https on port 443 only, no
   credentials, every DNS answer checked against private / loopback / link-local / mapped ranges and the connection
   pinned to the checked address, ≤ 3 redirects each re-checked, timeouts, size caps; no cookies, no sign-in, nothing
   behind an access control. From each page it takes the declared images (og:image, JSON-LD, large `<img>`), fetches
   ≤ 10 (≤ 6 MB, ≥ 300 px, real JPEG/PNG/WebP signatures and dimensions — not headers or names), deduplicates by
   content, and records **permission separately from discovery**: a picture is *free* only when its page states a free
   licence (Creative Commons BY/BY-SA/CC0/public domain, via rel=license, licence metadata or a licence link) that covers
   the page's primary image, with a creator to credit when the licence requires one; "All rights reserved" or a
   NonCommercial/NoDerivatives licence is *restricted*; anything else — an official site, a wiki, a fan page, a
   transparent PNG, a code licence — is *unclear*. The same picture check judges what was found. Free pictures that show
   the subject join the page with their source, creator, licence and evidence; relevant restricted or unclear ones (≤ 4)
   are shown to the owner only as **links to review**.
4. **Pictures** (browser): size, background, cutouts. A cutout drops separate background patches that touch the frame
   (a wall or window the fill did not reach) and peels pale shadow rims along the subject's base; logos and references
   are never cut out; a doubtful cut stays a framed picture. Original bytes are kept.
   **Missing imagery — the owner decides before any direction is paid for.** If the page should show its subject and no
   usable picture of it exists (nothing the check calls subject/detail, no upload), the studio stops and says "We
   couldn't find usable artwork of X through Wikimedia Commons and a web search" (never "no artwork exists"), with what
   is missing and the review links. The owner can upload pictures, use a reviewed picture after affirming they have the
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
* **Pictures come from Google Images only** when SerpApi is configured: Wikimedia Commons is no longer searched for pictures
  (the encyclopedia is still read for facts), so there is one picture check per page, not two. One search per page
  (`CREATIVE_SERPAPI_SEARCHES` 1): "<name> official render" (minus cosplay, merchandise and fan-art sites) for a fictional
  character, "<name> high resolution photo" for a real-world subject. Results are kept for 30 days
  (`CREATIVE_SERPAPI_CACHE_DAYS`), so a subject searched once costs no second search.
* **The owner picks.** The studio shows the suitable pictures with the best one the studio can fetch pre-selected as the
  main picture; "Build with this picture" fetches the picked ones (up to four) and directs the page. A picked picture is
  credited to its source site and page as "no licence stated; chosen by the page owner" -- never as licensed; whoever
  uses one is responsible for having the right to.
* **Google Images via SerpApi** (`lib/creative/serpapi.js`): when the server has `SERPAPI_API_KEY` (a Railway variable;
  read only on the server, never logged, returned or stored -- error text is scrubbed of it), discovery searches Google
  Images instead of the Anthropic web-search step: three searches for OFFICIAL material (`CREATIVE_SERPAPI_SEARCHES` 3) --
  renders, promotional art, stills of the game/show -- with cosplay, plush, figures, toys, merchandise, fan art, DeviantArt
  and Pinterest excluded in the query. Shopping results (`is_product`) are dropped. Every other result is LOOKED AT first:
  its search thumbnail goes to the picture check, which also judges **origin** (official / fan-made / unknown) from the
  picture and its source site. Only suitable pictures -- the character itself, not fan-made, not a form, logo or interface --
  have their page read (permission evidence) and their original downloaded. Suitability and licence stay separate: up to six
  suitable pictures without an open licence are shown to the owner with their source, the search that found them and their
  licence status; the owner decides. Each keeps its query, position, source site, page and image URL.
  `CREATIVE_SERPAPI_DAILY` 60 searches per day protects the plan's allowance; `CREATIVE_SERPAPI_USD` (default 0) adds a
  per-search amount to the Creative spend if set. 401/403/429 stop further searches (429 = hourly limit or the plan's
  searches used up); 45 s per search. The same origin rule applies to Commons: a fan-made depiction never leads the page.
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

## Built-in pipeline (stage 1; now the labelled fallback)

1. **Understand** (`understand.js`): `recognizable` (a real thing with public facts), `personal` (“my goldfish
   Bubbles” — the owner supplies the facts), `fictional` (an invented idea — never looked up) or `ambiguous` (the
   encyclopedia returns a disambiguation page → the owner picks). Also the tone (absurd, cinematic, playful, lyrical,
   tender, retro, editorial) and the purpose (showcase, fan page, tribute, memorial, joke, story).
2. **Research** (`research.js`, server): Wikipedia summary + plain-text article for facts — sentences that stand on
   their own (no “Most are…”, no half quotations, abbreviations handled, references sections skipped), each kept with
   its section, article URL and licence. Wikimedia Commons for pictures: the article's own files plus two searches
   (one for pictures a scene can use as a separate layer, e.g. “… white background”), **only** public domain, CC0,
   CC BY and CC BY-SA (never NonCommercial/NoDerivatives), each with author, licence, source page. Titles that name
   something else (“toilet paper seedlings cup”) rank below pictures of the thing itself. Only https Wikimedia hosts
   are contacted; retrieved text is stripped to plain text and handled as data. Pictures are downloaded once, sent to
   the browser as data, and saved into the project's asset store — the page never hotlinks. Personal subjects get
   general species facts only (never pictures of other animals as “theirs”).
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

* **research** (no AI): ≈ 15–35 requests to Wikipedia / Wikimedia Commons (summary, article text, article files,
  Commons searches, licence metadata, ≤ 16 shortlist thumbnails of ≤ 300 KB, ≤ 7 picture downloads of ≤ 4 MB, stopping
  at 16 MB), recorded in the ledger (`creative_research`: requests, bytes, ms, `usd: 0`).
* **AI calls** (estimated from token counts × configured prices; the invoice is the real charge): understanding
  ~$0.004; picture check ~$0.01; direction ~$0.10–0.15 per attempt (one repair at most); claim check ~$0.005–0.01
  per attempt (≤ 2 calls); web discovery, only when Commons does not cover the subject, ~$0.03–0.08 (≤ 3 searches at
  $0.01 plus tokens) and a second picture check. Typical page: **$0.13–0.45**, 60–180 s. Measured figures for each review run are in
  `CREATIVE_PROGRESS.md`.
* No image generation, no OpenAI. Pictures are stored once per project (content-addressed, deduplicated).

## Verification

* `node --test test/creative.test.js` — separation from Business, honesty and composition rules, cutouts on synthetic
  pictures, licence filter, renderer escaping / no remote loads / reduced motion / preview = export, save → asset
  store → reopen → export, research route guards (no network).
* `node test/review/creative-review.js <outDir>` — the real studio in Electron against a local `server.js` (every
  provider key blank; the mock call log must stay empty), real Wikipedia / Commons, for the four briefs in
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

## Stages

1. **Stage 1:** review-mode switch; understanding; Wikipedia/Commons research with provenance; pixel assessment and
   background removal; deterministic director; validator; renderer; studio; save / reopen; export; tests.
2. **Stage 2:** AI creative direction — model understanding before research, model-directed v2 scene plans with vision
   on the real pictures, validator v2 with one repair and a labelled fallback, renderer v2 (scenes, pinning, shapes,
   words, masks, camera), "Try another direction", Creative-only limits and ledger, claim check.
3. **Stage 3 (this change):** subject imagery and composition — visual needs and photographable-form queries, query-aware
   scoring with Commons categories, the picture check before download, picture roles through to the director and the
   studio, degraded-imagery reporting with uploads, cleaner cutouts, grouped layers, collision order that keeps the
   subject large, accept/safety validation with layout versions, complete claim-check accounting, kenburns and sheen.
4. **Completion round:** web discovery with permission kept apart from discovery; the missing-imagery gate (upload,
   reviewed picture with the owner's rights, search again, explicit abstract); owner roles for uploads with an enforced
   main picture; in-page navigation that works in the studio preview and exports; provider-outage handling; ordered
   Creative ledger. Creative remains review-only (`?creative=1`), with no Creative pricing.

See `CREATIVE_PROGRESS.md` for the running log.
