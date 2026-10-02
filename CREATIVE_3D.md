# Creative — true 3D (phases 1 and 2)

An image of the owner's own subject becomes a **real 3D asset**, is normalised by **Blender**, stored like every other
asset, shown by **one fixed browser engine** (three.js), moved by scroll / pointer / click, and shipped **inside the
customer's own files**. It is not video and never pretends to be. Higgsfield stays the cinematic video layer; this is a
second premium asset type next to it.

**Phase 1 is the architecture, proven end to end on fixtures. Phase 2 is the production road** — upload → quote → credits
reserved → durable job → Tripo → verified → on the page → saved → exported — **with every provider call mocked**. No real
Tripo request has been made, and none can be made outside production. Nothing 3D is offered, quoted or sent unless the
server is told to (`CREATIVE_3D=on`, a price, a provider whose key may be used here).

```
owner's upload ─▶ provider adapter ─▶ intake ─▶ Blender (headless) ─▶ limits ─▶ asset store
                  (mock: a fixture)   (is it a model? self-contained?)        (measured from the file)
                                                                                    │
      creative.threeD = { assets, scenes } ◀───────────────────────────────────────┘
                 │
   studio preview ─ export ─ customer ZIP ──▶ page: inline loader ─(lazy)─▶ assets/sr3d.min.js ─▶ assets/<hash>.glb
```

## Phase 2 — the production road, with Tripo (mocked everywhere but production)

```
studio: "Interactive 3D" ─▶ QUOTE ─▶ START ─────────────▶ the durable premium job ─────────────────────────────▶ studio
 (the owner picks one      credits    quote accepted:      queued ▸ submitting ▸ processing ▸ downloading ▸       adds the model + one
  of their uploads)        shown,     credits reserved,    verifying ▸ ready | failed | possible-cost             scroll-rotate scene,
                           nothing    job created ONCE     (Tripo: one submit, polled, fresh link per download)    previews, saves
                           spent      per quote            verify-only: glb.js limits, stored byte for byte
```

| | What | Files |
|---|---|---|
| Provider | **Tripo, official V3 API** (`https://openapi.tripo3d.ai/v3`): one image by SiteRemade's scoped source link, a **pinned** model version, GLB + PBR, explicit `face_limit`, triangles, no `compress`. A completed task is kept as the reference `tripo:task:<id>` — Tripo's signed address (it expires in minutes) is asked for again at **every** download attempt and never stored | `lib/three-d/providers/tripo.js` |
| Guard | Tripo is a paid provider like the other four: its key is read only through `lib/paid-providers.js`, which hands it out in production (or with `ALLOW_PAID_PROVIDER_CALLS=true`) and nowhere else; requests to `*.tripo3d.ai` / `*.tripo3d.com` are refused at the network edge when paid calls are off | `lib/paid-providers.js` |
| Normaliser | `THREE_D_NORMALIZER=verify` (the server's default): no Blender. The provider's GLB is inspected by `glb.js`, refused if it is malformed, compressed (meshopt / Draco), not self-contained or over a limit, otherwise stored **unchanged** (`normalized: false`, `processor: 'verify-only'`). `blender` is the Phase-1 road, untouched; `gltf-transform` is a reserved name (answers "unavailable") | `lib/three-d/pipeline.js`, `lib/three-d/index.js` |
| Quote | Operation `creative_3d` in the same quote system: one optional line, credits from `cost.estimate()` (provider cost × safety margin ÷ the per-credit ceiling). No customer price is written in code | `lib/quotes.js`, `lib/three-d/cost.js` |
| Job | The same `premium_jobs` row and worker as video. New: the `verifying` role state, `roles[].phase` for the studio, a bounded wait-and-ask-again when the provider says "too many at once" (HTTP 429 — refused outright, so never a second generation), and the job's own quote is settled with it | `lib/premium-jobs.js` |
| Routes | see below | `server.js` |
| Studio | The "Interactive 3D" card in the editor (Creative pages only, only when the server offers 3D and there is a suitable upload) | `creative.js`, `creative-studio.css` |
| Fake provider | A `fetch` that speaks Tripo's API from the fixture models — every behaviour a test needs, no network | `test/helpers/mock-tripo.js`, wired into `test/helpers/run-server.js` |

### Routes (all under the existing premium family)

| | |
|---|---|
| `GET /api/creative/premium/3d/availability` | `{ available, credits, composition }` — or `{ available: false, message }`. Names no provider |
| `POST /api/creative/premium/3d/quote` `{ projectId, assetId, sectionId? }` | Reads the **saved** project and the **stored** picture (the browser sends ids only): the owner's own upload, JPEG/PNG, ≥ 512 px, within Tripo's size. Creates the quote; reserves nothing, sends nothing |
| `POST /api/creative/premium/3d/start` `{ quoteId }` | Accepts the quote (credits reserved) and creates the job — **once per quote**: asking again returns the same job. One 3D job at a time per page. `402` when the balance does not cover it |
| `GET /api/creative/premium/3d/for-project/:projectId` | The page's latest 3D job (the studio resumes it, or attaches a model that finished while the tab was closed) |
| `GET /api/creative/premium/status/:id` (existing) | The job as it is now; `roles[0].phase` is what the studio shows |
| `GET /api/premium-media/:id/file` (existing) | The stored GLB, to its owner only |

`GET /api/creative/premium/for-project/:id` (video) no longer answers with a 3D job: the two kinds are asked for separately.

### Money

* Quote → `quotes.accept` (reserve under `quote:<id>`) → job → `settle` exactly once (which also closes the quote).
* Delivered: charged. Provider failed / refused the content / refused the request / could not be reached before sending:
  nothing charged, every credit returned. A model that cannot ship (oversized, malformed, compressed, over-textured) or
  cannot be downloaded: credits returned, the provider's cost kept on the record as **incurred**.
* A submission nobody can vouch for (a timeout, a lost answer, a crash mid-submit, a 5xx): **never sent again**, credits
  returned, recorded as a **possible** cost (`phase: 'possible-cost'`).
* `SITEREMADE_3D_PROVIDER_USD=0.50` → budget $0.54 → **3 credits**. Change the variable and the quote changes.

### Environment

`CREATIVE_3D=on` · `THREE_D_PROVIDER=tripo` · `TRIPO_API_KEY` · `SITEREMADE_3D_PROVIDER_USD` (required: unpriced 3D is
never offered) · `SITEREMADE_3D_BLENDER_USD` (0 with the verify normaliser) · `SITEREMADE_3D_MODEL_VERSION` (default
`v3.1-20260211`; must be a dated version — `latest` makes 3D unavailable) · `THREE_D_NORMALIZER` (`verify` | `blender`) ·
`SITEREMADE_3D_PROVIDER_TIMEOUT_MS` · `PREMIUM_JOB_MAX_BUSY_TRIES` / `PREMIUM_JOB_BUSY_RETRY_MS`. Still in force:
`PREMIUM_PROVIDER_ENABLED` (false switches every premium provider off), `ALLOW_PAID_PROVIDER_CALLS`, `PUBLIC_BASE_URL`
(the address Tripo fetches the source picture from — it must be the public one).

### Before the first REAL Tripo generation

Nothing in this repository has ever called Tripo: the adapter is written from its documentation and proven against the
fake. The first real call is the check of that reading — error codes, the names inside `output`, how large "standard"
textures are, and which way up the model arrives. Set the variables above on production, make one model, and compare
what comes back with `test/helpers/mock-tripo.js`. If Tripo's GLBs are over the 8 MB / 2,048 px limits, verify-only
refuses them (credits returned, cost incurred) and a real normaliser — Blender in the image, or gltf-transform — is the
next step.

## The cinematic source: a premium clip from the 3D model

The premium cinematic controls (the generation mode box) offer **Source: Image | 3D Model**
(`lib/creative/cinematic-source.js`, shared by the studio and the server).

* **Higgsfield takes a picture and nothing else.** Its image-to-video models take `image_url` (+ prompt, duration);
  its published OpenAPI documents no video input for them and no 3D input anywhere. So a 3D source is ONE still:
  `SiteRemade3D.still()` (the same engine, `lib/three-d/runtime-src.js`) draws the page's stored GLB at a fixed
  three-quarter view, centred, 62 % of the frame, studio light, plain neutral background, 1920×1080 opaque PNG — the same
  model and spec give the same bytes (`test/fixtures/three-d/product-still.png` is that render of the fixture model, and
  the studio's live render of it is byte-identical). The camera move (a slow orbit, a slight push-in) is asked for in
  words (`PROMPT_3D`). The model is never made again; nothing calls Tripo.
* It is drawn **in the studio**, by our engine: production has no Blender and no server-side WebGL, and no dependency
  was added. The server checks the still's own header (a PNG of exactly the render size) and that the SAVED project has
  a finished model made from the owner's upload, stores it, and records it (`role.source`, the clip's provenance:
  `{ kind: 'model3d', modelAssetId, modelRef, renderRef }`). It trusts the pixels as it trusts an upload.
* The moments that show the product (the hero, a showcase's payoff) start from the still; a showcase's takeover keeps its
  own photo. The clip joins the page on the photo the model was made from — attach, save, publish, app preview and
  export are the image path, unchanged. The planner (`/api/creative/plan`) treats that photo as the video's source, so
  a photo too small for video by itself still gets its hero clip.
* The same mode, quote, price, reservation, one-submission rule and settlement as an Image clip: no new tier. A 3D
  source that cannot be used (no finished model, a bad still) makes nothing; its credits come back.
* The choice is saved with the page (`creative.premiumSource: 'model3d'`; Image adds nothing). On a page that already
  exists, the 3D card's **Make a cinematic video from it** opens the generation setup for the same page (its pictures
  and model kept) with 3D Model chosen. The MODE stays the owner's; nothing runs until they create.
* **The pricing rule: base Creative (6 credits) never calls Higgsfield.** The source belongs to the cinematic modes
  (Creative + Cinematic Hero, Creative Showcase). In base Creative the Source control is shown inactive, and choosing 3D
  Model never changes the mode. The server enforces it, whatever a request says: `startPremium` makes a Higgsfield job
  only from the premium lines of the generation's CONFIRMED `creative_generation` quote, and base Creative is quoted with
  none. A 3D source, premium suggestions or an arc sent with a base Creative generation are refused and logged
  (`start-refused`), and the still is not even stored.
* Tests: `test/cinematic-source.test.js` (CS-8: base Creative + 3D Model -> 6 credits, no premium job, zero Higgsfield
  requests; CS-2/CS-3: Cinematic Hero with Image / 3D Model; CS-9: Showcase with 3D Model -- Showcase with Image is the
  existing showcase tests); in a real browser: `electron test/review/cinematic-3d-flow.js <out>`.

## The layers, and where each one lives

| | What | Files |
|---|---|---|
| A | **Source** — the provider adapter interface (the same four calls as the video provider, so the same job can run it) and the only adapter there is: a mock that answers with a fixture GLB and makes no network request | `lib/three-d/provider.js`, `lib/three-d/mock-provider.js` |
| B | **Blender** — the headless wrapper (detect, fixed command, private folder, time limit, structured errors) and the normalisation itself | `lib/three-d/blender.js`, `scripts/blender/prepare_asset.py` |
| C | **Data model** — `creative.threeD` (stored models + the scenes that show them) and `plan.premium3D` (the planner's intent). Enums, ids and clamped numbers only | `lib/creative/three-d.js`, `lib/creative/three-d-pose.js` |
| D | **Renderer** — one engine for every site (three.js + its glTF loader, built once and committed) and the few lines a page carries inline to decide whether and when to load it | `lib/three-d/runtime-src.js` → `vendor/three-d/sr3d.min.js`; the loader is `LOADER` in `lib/creative/three-d.js` |
| E | **Export** — the model and the engine become files of the customer's own website | `lib/export-compiler.js` (`compileCreativeExport`) |
| F | **Budget** — the limits, and their enforcement on the file itself | `LIMITS` in `lib/creative/three-d.js`; `lib/three-d/glb.js` |
| G | **Security** — see below | `blender.js`, `glb.js`, `pipeline.js` |
| H | **Money** — the shape of the price; a 3D model as one more role of the durable premium job | `lib/three-d/cost.js`, `lib/premium-jobs.js` |
| I | **Planning** — when a page may be planned with 3D at all | `intent()` / `sourceEligible()` in `lib/creative/three-d.js`, called from `validate2.js` |

`lib/three-d/pipeline.js` ties A → B → F → storage together; `lib/three-d/index.js` is the entry point.

### Where it attaches to the existing code (every insertion point)

* `lib/creative/validate2.js` — `plan.premium3D` is set **only** when the caller passes `ctx.premium3D` (the server's
  decision for this generation) or when re-checking a saved plan. A director's own `premium3D` is dropped.
* `lib/creative/store.js` — `sanitizeCreative` keeps `creative.threeD` through `TD.normalise` (only when there is one).
* `lib/project-store.js` — the models' bytes are internalised / hydrated exactly like pictures and spatial models
  (content-addressed asset store + `asset_blobs`).
* `lib/creative/render2.js` — with `opts.threeD`, a `.td-stage` is written into the section's `.sc-stage`, the page gets
  `<script type="application/json" id="cr-3d">`, the stage CSS and the inline loader. Without it the output is byte for
  byte what it was.
* `lib/export-compiler.js` — models → `assets/<sha256>.glb` (one file per distinct model); engine → `assets/sr3d.min.js`
  (+ `assets/sr3d.LICENSE.txt`), only when the page has a 3D scene; `manifest.threeD`; a README section.
* `lib/premium-jobs.js` — a role with `mediaType: 'model3d'` uses `deps.provider3D`, and is normalised (`deps.process3D`)
  between download and storage. Everything else — reservation, one submission, deadlines, settle-once — is the video path.
* `server.js` — the worker is given `provider3D` / `enabled3D` / `process3D`; the 3D routes are listed under Phase 2. The
  web server hands out only an exact allow-list of files (`PUBLIC_FILES`); the studio preview's engine is on it —
  `/vendor/three-d/sr3d.min.js` and its licence text — and nothing else of the 3D work is (not `manifest.json`, not
  `lib/three-d/`, not the fixtures). `test/static-exposure.test.js` holds that.
* `creative.js` — the studio carries `threeD` through open → preview → save, and (Phase 2) offers the "Interactive 3D" card.
* `scripts/build-creative-core.js` — `three-d-pose` and `three-d` join the studio bundle (schema + loader, not the engine).

### How it relates to the spatial tier

The spatial tier (`spatial.js`, `spatial-runtime.js`) is a depth layer for the page's *pictures*, with a small GLB reader
of its own (no PBR, 80k triangles, no three.js — by design, to stay ~40 KB). It is unchanged. True 3D is a different
thing: a product-grade model with real materials, in a stage inside one section. The two do not share models
(`creative.models` vs `creative.threeD.assets`), and a page may have either, both or neither. Folding the spatial tier's
`form: 'model'` onto this engine is a possible later step; it was left alone here (no refactor of a working tier).

## The data model

```js
creative.threeD = {
  v: 1,
  assets: [{ id: 'td-…', sourceAssetId, format: 'glb', assetRef /* sha256; dataUrl when hydrated */, bytes,
             bounds: { min, max }, center, scale, triangles, textures: { count, maxSize },
             animations: [names], parts: [names], normalized, provenance: { provider, providerAssetId, processor, requestId, at } }],
  scenes: [{ id, assetId, sectionId, composition, interaction,
             camera: { fov, azimuth, elevation, distance }, lighting, background, turns, phone }],
}
plan.premium3D = { planned, reason, sourceAssetId, composition }   // intent only
```

* **Compositions**: `scroll-rotate`, `orbit-product`, `floating-object`, `camera-pass`, `hero-sculpture`,
  `object-reveal` — each a preset of the scene fields. **Interactions**: `none`, `scroll-rotate`, `scroll-orbit`,
  `pointer-tilt`, `click-rotate`. `scroll-rotate` is the one proven in a browser; the others are presets of the same
  engine and the same `pose()` function, unit-tested but not yet reviewed visually.
* Nothing is code. An unknown enum becomes the default, a number is clamped, an unknown key is dropped, a scene whose
  section or model is not there is dropped. A model record that claims to be over the budget is rejected, not clamped.
* **A saved model is a reference, never bytes.** The 3D job stores the GLB (`assetRef`, content-addressed); the studio keeps
  that reference on the record next to the bytes it previews, and saves the reference alone (`tdForSave` in
  `creative.js`). Inline, a model of up to 8 MB plus the page's pictures passes the project store's 14 MB per-direction
  limit and the whole save is refused (the bug `test/three-d-persistence.test.js` holds). Bytes that do arrive in a save
  are stored under their own hash, whatever reference came with them.
* `sectionId` is a plan scene's id. The stage takes the box of that section's picture of the same subject (the upload,
  its cut-out or a copy) per breakpoint; that picture is the fallback and is hidden only while the model is drawn.
* One subject on screen, never two: where the page carries that same picture between scenes (a `.ca` actor, a seam's
  `.cs-carry`), those copies rest (`.td-away`) while the model's scene fills more than a fifth of the screen, and are back
  the moment it does not — or the moment the model goes down for any reason.

## The budget (`LIMITS`)

| | |
|---|---|
| Provider file handed to Blender | ≤ 64 MB |
| Model that may be stored and shipped | ≤ 8 MB (target 4 MB) |
| Triangles | ≤ 200,000; Blender decimates a still model above 100,000 |
| Texture edge | ≤ 2,048 px (Blender scales larger ones down) |
| Phones (≤ 720 px) | lighter draw (DPR ≤ 1.5, no antialias); the picture instead when the model is > 4 MB or > 100,000 triangles, the device has < 2 GB, or the scene says `phone: 'poster'` |
| First draw | abandoned after 20 s — the picture stays |

Enforced by `glb.js` on the file itself (never on a number someone reported): before Blender, after Blender, and again
at export against the stored blob. An over-budget model is not stored; one that somehow is stored is left out of the
export and the manifest says why. **Compression**: none beyond decimation and texture scaling yet — Draco / meshopt /
KTX2 need decoders in the engine, so a model that *requires* them is refused rather than shipped broken.

The page: nothing 3D is requested at load. The engine is fetched when a stage comes within a screen of the viewport,
drawn only while something changes, rested off-screen, and destroyed on reduced motion, a lost context or leaving the page.

**Fallbacks — each leaves the section's own picture, never a blank:** reduced motion · no hardware WebGL · a page
opened from disk (`file:` — browsers will not fetch the model) · a data-saving connection · the phone rules above · an
engine or model that will not load · a slow first draw · a stage the layout hides.

## Security (the model file is untrusted, and so is its name)

* Blender is started directly, never through a shell, with a **fixed argument list**. The only variable is the path of a
  job file the server wrote, inside a temporary folder the server made. No provider or customer text becomes an argument.
* One private temporary folder per job, the model written under a fixed name, removed afterwards whatever happened.
* Only self-contained formats reach Blender: `.glb`, `.stl`, `.ply`. Not `.blend` (can carry scripts), and not `.gltf` /
  `.obj` / `.fbx` (can point at other files on the server's disk — to be enabled only with a URI guard). A GLB that points
  outside itself is refused before Blender sees it.
* Size is bounded before anything is written; the run is bounded in time and killed with everything it started.
* Factory settings (no user add-ons or start-up scripts), auto-execution off, `--offline-mode`, and an environment that
  is an allow-list: no SiteRemade key or secret is visible to the Blender process.
* Options are enums and clamped numbers. The Python script re-checks that its paths are inside the job folder.
* Provider file names are checked (`stageFiles`): no folders, drives, `..`, leading dots or unknown types — one bad name
  refuses the whole delivery, and nothing is written.
* The browser never sees a provider address, signed link or credential: only SiteRemade's stored copy, by its own path.
  The engine refuses any address inside a model (only the model's own bytes are read).

## Money

Priced by configuration only. `lib/three-d/cost.js` gives the structure — provider cost + Blender compute cost → budget (same safety margin
as video) → credits (same per-credit ceiling) — and reports `priced: false` until `SITEREMADE_3D_PROVIDER_USD` is set.
Unpriced 3D is never planned, offered or quoted. There is no catalogue entry: the price is the quote (Phase 2).

A 3D model is made by **the same durable premium job as a video** (`lib/premium-jobs.js`): reserved before anything is
sent, submitted once (with an idempotency key `<job>:<role>`), never resubmitted, followed across restarts, charged only
if delivered, settled once. The one new step is normalisation between download and storage: if Blender is busy or
missing it is retried like a download (the model exists at the provider); if the model can never ship, the role fails,
the credits go back and the provider cost stays on the record as incurred.

Still to do: usage-ledger columns for 3D (the job records provider USD on the credit operation today; `usage_ledger` has
Higgsfield columns only), and a final customer price once the real cost has been observed.

## Planning

3D is never the default. `intent()` plans it only when **all** hold: the server allowed it for this generation (flag,
price, provider, Blender, credits — `threeD.availability()`), the source is the owner's own **upload** (never a picture
found on the web, whatever its licence; a cut-out counts as its original), at least 512 px, showing one distinguishable
subject, and the subject is an object — not a place, an editorial subject, a personal page, a scene, a texture or a logo.
Otherwise the plan carries `{ planned: false, reason }` and nothing is bought. The AI director's prompt is unchanged.

## Running it

```bash
npm test                                  # 578 tests; test/three-d.test.js + test/three-d-tripo.test.js are the 3D suites ($0 provider spend, network off)
node scripts/three-d-demo.js --serve      # the whole chain on a fixture, then http://127.0.0.1:4173/  (npm run demo:3d)
node scripts/build-three-d-runtime.js     # rebuild vendor/three-d/ after editing runtime-src.js or three-d-pose.js
node scripts/build-creative-core.js       # rebuild the studio bundle after editing lib/creative/three-d*.js
electron test/review/three-d-probe.js data/three-d-demo/site-from-zip <out> data/three-d-demo/export-without-3d
electron test/review/three-d-probe.js data/three-d-demo/site-from-zip <out> --reduced
electron test/review/three-d-studio-flow.js <out>   # the owner's whole flow in a real browser, Tripo mocked; unpacks the exported ZIP to <out>/site
```

**Blender.** Looked for in this order: `BLENDER_PATH` (absolute path to the program), `PATH`, the installers' usual
locations, then `.tools/blender/` beside the repo (ignored by git — a portable copy for development). 3.6 or newer.
Without it everything except normalisation works, the two real-Blender tests skip with their reason, and the demo uses
the committed, already-normalised fixture. **Production has no Blender today** (the Railway image does not include it):
with `THREE_D_NORMALIZER=blender`, 3D processing there answers `blender_unavailable` until the image installs Blender and
sets `BLENDER_PATH`. The default, `verify`, needs nothing installed.

**Flags** (all off by default): `CREATIVE_3D=on`, `THREE_D_PROVIDER=<adapter>` (`mock` is registered only where paid
providers are not live), `SITEREMADE_3D_PROVIDER_USD`, `SITEREMADE_3D_BLENDER_USD`, `SITEREMADE_3D_SAFETY_BUFFER`; the
rest are listed under Phase 2.

## Known limitations

* Tripo has never been called for real: its wire format here is the documentation's (see "Before the first REAL Tripo
  generation"). Tripo documents no cancellation and no idempotency key, so a late task cannot be stopped and an uncertain
  submit cannot be looked up — it is recorded as a possible cost and never resent.
* Verify-only cannot make a model smaller, upright or centred: one over the limits is refused (the owner is not charged;
  SiteRemade has paid the provider). The engine frames a model by its own bounds, so an off-centre one still shows.
* The studio offers one composition (`scroll-rotate`) and one model per section; the planner does not plan 3D on its own.
* Only `scroll-rotate` has been verified in a browser. Model animations are recorded (names) but not played; parts are
  recorded but nothing explodes or separates them yet.
* A page opened straight from disk shows the picture, not the model (as the spatial tier does). Shipping the model in a
  form `file:` pages can read would cost about a third more download; not done.
* The stage sits at its picture's resting box: it does not follow that picture's own scroll choreography, and the
  section's dim background echo of the picture stays visible behind the model.
* No geometry or texture compression beyond decimation and scaling (see the budget).
* Blender is single-run per job with no queue: a burst of 3D jobs would run that many Blender processes.
* The engine is ~627 KB (161 KB gzipped) for every page that uses 3D — and zero for every page that does not.

## Plugging in another image-to-3D provider (Meshy is the planned fallback)

1. Write the adapter (`submit` / `status` / `cancel` / `download`, as in `provider.js`), honouring `requestId` as an
   idempotency key, and `Provider.register()` it at server start.
2. Add its key and hosts to `lib/paid-providers.js` (`PROVIDERS`) so it is unreachable outside production and its key
   never leaves the server; add its fetch mock to `test/helpers/run-server.js`.
3. Observe its real cost and set `SITEREMADE_3D_PROVIDER_USD`. The quote, the routes, the job and the studio are
   provider-agnostic: `THREE_D_PROVIDER` picks the adapter, and nothing else changes.
4. Give it a fake like `test/helpers/mock-tripo.js` and run the same job tests against it.
