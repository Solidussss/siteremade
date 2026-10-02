# Creative — true 3D (phase 1)

An image of the owner's own subject becomes a **real 3D asset**, is normalised by **Blender**, stored like every other
asset, shown by **one fixed browser engine** (three.js), moved by scroll / pointer / click, and shipped **inside the
customer's own files**. It is not video and never pretends to be. Higgsfield stays the cinematic video layer; this is a
second premium asset type next to it.

**Phase 1 is the architecture, proven end to end on fixtures.** There is no real image-to-3D provider yet, no price, and
no button in the studio. Nothing here spends money, and nothing 3D is planned or sent unless the server is told to
(`CREATIVE_3D=on`, a price, a provider, Blender).

```
owner's upload ─▶ provider adapter ─▶ intake ─▶ Blender (headless) ─▶ limits ─▶ asset store
                  (mock: a fixture)   (is it a model? self-contained?)        (measured from the file)
                                                                                    │
      creative.threeD = { assets, scenes } ◀───────────────────────────────────────┘
                 │
   studio preview ─ export ─ customer ZIP ──▶ page: inline loader ─(lazy)─▶ assets/sr3d.min.js ─▶ assets/<hash>.glb
```

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
* `server.js` — the worker is given `provider3D` / `enabled3D` / `process3D`. **No route starts a 3D job yet.** The
  web server hands out only an exact allow-list of files (`PUBLIC_FILES`); the studio preview's engine is on it —
  `/vendor/three-d/sr3d.min.js` and its licence text — and nothing else of the 3D work is (not `manifest.json`, not
  `lib/three-d/`, not the fixtures). `test/static-exposure.test.js` holds that.
* `creative.js` — the studio carries `threeD` through open → preview → save. No UI for it yet.
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
* `sectionId` is a plan scene's id. The stage takes the box of that section's picture of the same subject (the upload,
  its cut-out or a copy) per breakpoint; that picture is the fallback and is hidden only while the model is drawn.

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

Not priced. `lib/three-d/cost.js` gives the structure — provider cost + Blender compute cost → budget (same safety margin
as video) → credits (same per-credit ceiling) — and reports `priced: false` until `SITEREMADE_3D_PROVIDER_USD` is set.
Unpriced 3D is never planned. Customers see nothing new: no catalogue entry, no quote line.

A 3D model is made by **the same durable premium job as a video** (`lib/premium-jobs.js`): reserved before anything is
sent, submitted once (with an idempotency key `<job>:<role>`), never resubmitted, followed across restarts, charged only
if delivered, settled once. The one new step is normalisation between download and storage: if Blender is busy or
missing it is retried like a download (the model exists at the provider); if the model can never ship, the role fails,
the credits go back and the provider cost stays on the record as incurred.

Still to do when pricing lands: a quote line (`lib/quotes.js`), a credit tier (`lib/pricing.js`), and usage-ledger
columns for 3D (the job records provider USD on the credit operation today; `usage_ledger` has Higgsfield columns only).

## Planning

3D is never the default. `intent()` plans it only when **all** hold: the server allowed it for this generation (flag,
price, provider, Blender, credits — `threeD.availability()`), the source is the owner's own **upload** (never a picture
found on the web, whatever its licence; a cut-out counts as its original), at least 512 px, showing one distinguishable
subject, and the subject is an object — not a place, an editorial subject, a personal page, a scene, a texture or a logo.
Otherwise the plan carries `{ planned: false, reason }` and nothing is bought. The AI director's prompt is unchanged.

## Running it

```bash
npm test                                  # 553 tests; test/three-d.test.js is the 3D suite ($0 provider spend, network off)
node scripts/three-d-demo.js --serve      # the whole chain on a fixture, then http://127.0.0.1:4173/  (npm run demo:3d)
node scripts/build-three-d-runtime.js     # rebuild vendor/three-d/ after editing runtime-src.js or three-d-pose.js
node scripts/build-creative-core.js       # rebuild the studio bundle after editing lib/creative/three-d*.js
electron test/review/three-d-probe.js data/three-d-demo/site-from-zip <out> data/three-d-demo/export-without-3d
electron test/review/three-d-probe.js data/three-d-demo/site-from-zip <out> --reduced
```

**Blender.** Looked for in this order: `BLENDER_PATH` (absolute path to the program), `PATH`, the installers' usual
locations, then `.tools/blender/` beside the repo (ignored by git — a portable copy for development). 3.6 or newer.
Without it everything except normalisation works, the two real-Blender tests skip with their reason, and the demo uses
the committed, already-normalised fixture. **Production has no Blender today** (the Railway image does not include it):
3D processing there answers `blender_unavailable` until the image installs Blender and sets `BLENDER_PATH`.

**Flags** (all off by default): `CREATIVE_3D=on`, `THREE_D_PROVIDER=<adapter>` (`mock` is registered only where paid
providers are not live), `SITEREMADE_3D_PROVIDER_USD`, `SITEREMADE_3D_BLENDER_USD`, `SITEREMADE_3D_SAFETY_BUFFER`.

## Known limitations

* No real provider, no price, no start route, no studio UI: a 3D scene exists today only in a project that carries a
  `threeD` block (the demo, the tests).
* Only `scroll-rotate` has been verified in a browser. Model animations are recorded (names) but not played; parts are
  recorded but nothing explodes or separates them yet.
* A page opened straight from disk shows the picture, not the model (as the spatial tier does). Shipping the model in a
  form `file:` pages can read would cost about a third more download; not done.
* The stage sits at its picture's resting box: it does not follow that picture's own scroll choreography, and the
  section's dim background echo of the picture stays visible behind the model.
* No geometry or texture compression beyond decimation and scaling (see the budget).
* Blender is single-run per job with no queue: a burst of 3D jobs would run that many Blender processes.
* The engine is ~627 KB (161 KB gzipped) for every page that uses 3D — and zero for every page that does not.

## Plugging in a real image-to-3D provider

1. Write the adapter (`submit` / `status` / `cancel` / `download`, as in `provider.js`), honouring `requestId` as an
   idempotency key, and `Provider.register()` it at server start.
2. Add its key and hosts to `lib/paid-providers.js` (`PROVIDERS`) so it is unreachable outside production and its key
   never leaves the server; add its fetch mock to `test/helpers/run-server.js`.
3. Observe its real cost and set `SITEREMADE_3D_PROVIDER_USD`; add the quote line and credit tier.
4. Add the start route (reuse `startPremium`'s shape: eligibility → source link → `premiumJobs.create` with
   `cost.role()`), pass `ctx.premium3D` to `validatePlan2` from `threeD.availability()`, and the studio's choice + status.
5. On delivery, the studio adds `job.delivered[].threeD` to `creative.threeD.assets` and a scene for the planned section.
6. Install Blender in the production image; consider a small queue so jobs normalise one at a time.
