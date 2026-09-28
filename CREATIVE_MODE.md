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
| Planning | business planner / deterministic engine | `understand.js` → `/api/creative/research` (server, `research.js`) → pixel assessment + cutouts in the browser (`assets.js`) → `director.js` → `validate.js` |
| Rendering | `renderProject` / `lib/site-render.js` into `#builderSite` | `render.js` → one self-contained document (its own CSS and runtime), shown in an `<iframe srcdoc>` in the studio and written as `index.html` on export. Its styles and scripts live inside that document, so nothing can reach the Business page. |
| Project state | a direction without `mode` | a direction with `mode: 'creative'` and a `creative` block: brief, understanding, supplied details, research (page + facts with sources), assets (pixels + provenance + processing), scene plan, motion, cost |
| Save / reopen | `/api/projects` + autosave | the same `/api/projects` routes (explicit Save), pictures stored in the same content-addressed asset store; the project list labels it “Creative ·”; opening it from the account routes it to the studio (`adoptServerProject` / `loadSelectedOwnedProjectById` never pass it to the Business builder, and the Business local restore ignores it) |
| Export | `compileExport` → business renderer | `compileExport` branches on `mode === 'creative'` → the same `render.js` document, pictures written to `assets/`, `ATTRIBUTION.md`, `export-manifest.json` (`mode: 'creative'`, static) |
| Cost | unchanged | its own ledger (`data/premium/creative-ledger.jsonl`, rows `creative_research`); no credits, no paid calls in stage 1 |

A direction without `mode: 'creative'` is a Business project wherever it is read. `project-store.validateDirection` adds
`mode`/`creative` only for a Creative direction, so a Business project saves exactly as before (tested: a Business
project with a stray `mode` value saves identically to the same project without it).

## Pipeline (one path for every brief — nothing refers to a particular subject)

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

Business pricing and behaviour are unchanged. Creative stage 1, per page:

* **paid AI calls: 0. Generated images: 0. Credits: 0.** Research is read-only, like `/api/redesign/extract`: it
  charges nothing, creates nothing, and is rate-limited like generation (`generationRateLimit`, per account).
* research: ≈ 10–14 requests to Wikipedia / Wikimedia Commons (summary, article text, article files, two Commons
  searches, licence metadata in batches of 40, ≤ 6 picture downloads of ≤ 4 MB each, stopping at 14 MB) — measured
  in the review run and recorded per page in `creative-ledger.jsonl` (requests, bytes, ms, `paidCalls: 0`, `usd: 0`).
* server cost is bandwidth and storage: the pictures are stored once per project (content-addressed, deduplicated).
* A model-directed plan (stage 2) and any paid image generation are **not** built; they need an explicit budget
  decision first. The validator already accepts any plan source, so a model plan would pass the same checks.

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

## Stages

1. **Stage 1 (this change):** review-mode switch; understanding; Wikipedia/Commons research with provenance; pixel
   assessment and background removal; deterministic director; validator; renderer (entrance / loop / scroll /
   connector / reduced motion / failure fallbacks); studio (brief, supplied details, uploads, clarification, preview
   desktop/phone, live text editing, replace / remove / use-as-main, motion, sources, save / reopen); export; tests.
2. **Stage 2:** model-directed scenes and copy (validated against the same schema) with a measured cost per page and
   a stated allowance; more worlds and section types; generated scenery within an explicit image allowance; purchase
   pricing for Creative pages (not offered in the studio yet).
3. **Stage 3:** Creative in the normal (non-review) flow, hosting parity, analytics.

See `CREATIVE_PROGRESS.md` for the running log.
