# V5 — architecture audit, WebsiteProject model, assets, compositional sections

This is the required audit (item 7 of the V5 brief) plus the design for
everything built on top of it. Read this before `GENERATOR-V4.md` stops
being the most current description of how the generator works — V5
replaces the DOM-poking renderer underneath V3/V4's visual system with a
real project model, without throwing away any of that visual system
(dimension registry, 20 seeds, composition-from-text) or the V4 broad
positioning work.

## 1. Audit verdict: V4 was a preview renderer, not a project generator

Answering the question directly, from reading the actual V4 code (not
assuming): **V4 (and V3, and V2 before it) only ever rendered a live
preview directly into the landing page's own DOM. It did not produce a
reusable, persistable project object at any point.** Specifically:

- **Where generated content lived:** nowhere but the DOM. `updateBuilder()`
  wrote directly onto live elements — `siteBusiness.textContent = ...`,
  `siteHeadline.textContent = ...`, `siteSections.innerHTML = ...` — every
  time anything changed. There was no intermediate object that *held* the
  generated website; the DOM nodes themselves were the only record of it.
- **Where design configuration lived:** split across module-level `let`
  variables (`currentStyleObject`, `currentSeedKey`, `selectedLayout`,
  `selectedTone`, `uploadedLogoData`, `currentAnalysis`) *and* the live
  values of `<input type="color">` elements in the Advanced panel — colors
  in particular were never stored anywhere except in the DOM inputs
  themselves, read fresh on every `updateBuilder()` call.
- **Serialization:** none. No `JSON.stringify` of the generated result
  anywhere in the codebase, no `localStorage`, no persistence layer of any
  kind.
- **Reusable project object:** no. `currentAnalysis` came closest, but it
  only holds the *parsed intent* (category key, style key, alternates,
  location) from `analyzeDescription()` — not the generated result itself
  (copy, palette, layout, sections, assets). It's an input to generation,
  not an output.
- **Reconstruction from stored data:** impossible, because nothing was
  stored. The only way to get back to a given result was to re-type the
  same description (deterministic generation would reproduce the same
  starting point) — but any subsequent manual refinement (a color drag, a
  business-name edit, a logo upload, a layout switch) lived only in DOM/
  input state and would be lost on reload with no way to recover it.
- **Path to deploy/export:** none. The only server route that touches the
  generated result (`POST /api/lead` in `server.js`) reads it out of a
  flat HTML form (hidden inputs mirroring the DOM state), formats it into
  two transactional emails via Resend, and discards it — `server.js` has
  no database, no file writes, nothing that persists a project. The
  "delivery" mechanism is explicitly a lead-gen handoff to a human
  production team, not a self-service export.

So: **V4 is a lead-generation preview tool that happens to be very good at
rendering a live, on-brand-feeling mockup — not a website generator with a
real output.** That's a reasonable thing for what it was built to be, but
it's the wrong foundation for asset-aware, more compositional generation,
because there's no single place for "what was generated" to live that
uploads, refinements, and a future renderer/exporter could all agree on.
V5's first job is fixing that, before making generation itself smarter.

## 2. The WebsiteProject model

A single JS object, `project`, is now the **source of truth**. Every
control in the UI mutates a field on `project` and then calls
`renderProject(project)` — nothing writes to the preview DOM directly
outside of that one function. This is the concrete fix for "refinement
should modify project state, not be an unrelated collection of DOM
mutations."

```js
{
  meta: { id, createdAt, version: 'v5' },
  source: { text, location },              // the original description + parsed location
  business: { name, categoryKey, tone },   // tone: 'professional' | 'bold' | 'friendly'
  intent: { seedKey, styleAlternates },    // internal only -- never shown to the visitor
  design: {
    palette: { main, background, text, accent2 },
    dimensions: { hero, type, nav, card, imagery, cta, colorBehavior, motion, spacing, pattern },
    heroLayout: 'split' | 'center' | 'poster'
  },
  sections: [ { id, type, variant }, ... ], // ordered; always starts 'hero', ends 'footer'
  assets: {
    items: [ { id, source: 'user', type: 'logo'|'hero'|'gallery'|'team', dataUrl, name, alt, addedAt } ]
  },
  responsive: { device: 'desktop' | 'mobile' }
}
```

`project.intent.seedKey` is the one place a named seed ("ledger",
"atelier", ...) still lives — purely as an internal anchor for
`composeStyleFromAnalysis`. It is never read by anything that produces
user-facing text. That's the concrete version of "seeds stay internal
only."

`renderProject(project)` is the only function that touches the live
preview DOM. It:
1. Sets the `data-*` dimension attributes and CSS custom properties on
   `.builder-site` (unchanged mechanism from V3/V4).
2. Renders the nav (brand/logo + up to 3 links derived from which sections
   are present + CTA label from the category).
3. Renders `#siteSectionsRoot` by mapping `project.sections` through the
   section-type registry (see part 4).
4. Updates the small chrome around the preview (summary chips, handoff
   card, hidden lead-form fields) from `project`, not from scattered
   globals.

Every control's event listener is now a two-liner: mutate a `project`
field, call `renderProject(project)`. `selectedLayout` / `selectedTone` /
`uploadedLogoData` / `currentStyleObject` / `currentSeedKey` as separate
module-level variables are gone — they're fields on `project` now.

## 3. Asset model + placement

```js
// one entry per uploaded (or, in future, generated) image
{ id, source: 'user', type: 'logo'|'hero'|'gallery'|'team', dataUrl, name, alt, addedAt }
```

Four upload slots in the Advanced panel: **logo**, **hero image**,
**gallery/product images** (up to 4), **team/founder photo**. Each pushes
an entry into `project.assets.items`.

`planAssets(project)` reads `project.assets.items` and produces a plan —
not a hard-wired "put upload #1 in slot #1," but role assignment:

```js
{
  logo: assetId | null,       // -> nav brand lockup + footer
  hero: assetId | null,       // -> hero visual (strongest available image if no dedicated hero upload)
  gallery: [assetId, ...],    // -> gallery section tiles (remaining images after hero is chosen)
  about: assetId | null       // -> about section portrait
}
```

Rule: a dedicated hero-image upload wins the hero slot; otherwise the
first gallery/product upload is "borrowed" for the hero and the rest stay
in the gallery plan (matches the brief's own example: logo → nav/footer,
strongest product photo → hero, remaining product photos → gallery,
founder photo → about). **Asset presence can add or remove a section**,
not just fill a slot in a fixed template: uploading gallery images
auto-adds a gallery section if the generated composition didn't already
include one; uploading a team photo auto-adds an about section the same
way. Removing all assets of a type does not remove a section the user (or
the composition) has already put there — an empty gallery slot falls back
to the honest art-directed placeholder treatment, it doesn't disappear
out from under the user.

**Priority order, and how gaps get filled:** user assets always win their
role once assigned. Generated/fallback imagery is the existing V3/V4
art-directed CSS placeholder treatment (gradient + mark, or a
"Photography direction" labelled block — see `styles.css`,
`data-imagery`) — never a fabricated photo. It fills exactly the roles
that have no user asset, using the same `imagery` dimension that already
varies by category and composed style, so an AI-software hero, a finance
hero and a restaurant hero already look distinct even with zero uploads.
This mixing (user / generated-placeholder) happens per-role, so a
restaurant that uploads three real food photos keeps every one of them and
only asks the placeholder system to cover roles it didn't upload for (e.g.
a logo, if they didn't provide one) — nothing generated ever overwrites a
real upload.

**Scope discipline:** asset-driven imagery only ever renders inside
`.builder-site` (the generated preview). Nothing about the surrounding
SiteRemade page — nav, hero-machine animation, pricing, footer — reacts to
uploaded or generated imagery. Verified in testing (see below).

## 4. Compositional section system

The old `.site-sections` was a single fixed 3-box grid — every generated
result was structurally the same page with different labels/colors. V5
replaces it with an ordered list of section *types*, each with its own
markup and (for most types) two render variants, composed per result:

| type | purpose | variant A | variant B | included when |
|---|---|---|---|---|
| `hero` | always first | driven by existing `hero` dimension (unchanged) | — | always |
| `proof` | trust/stat strip | numeric stat strip | one-line trust statement | `pattern==='proof-first'` or trust-heavy category (finance/professional/real estate/tech/education) |
| `services` | what they offer | numbered list (old look) | short-description cards | always (baseline content every result gets) |
| `gallery` | visual proof of work | equal grid | one large + strip | `pattern==='portfolio-first'`, portfolio-ish category (creative/fashion/hospitality/retail/real estate), or gallery assets uploaded |
| `about` | the people behind it | photo + statement | text-only statement | `pattern==='story-first'`, personal-trust category (nonprofit/creative/wellness/professional/education), or a team photo uploaded |
| `testimonial` | social proof | centered quote | quote card | `pattern==='proof-first'` or trust-heavy consumer category (wellness/fitness/professional/hospitality/real estate/education) |
| `ctaBanner` | closing push | centered | accent split | roomier compositions only (`spacing` is `airy`/`generous`) |
| `footer` | always last | simple centered | multi-column | always (the mini-site previously had **no footer at all** — this is new) |

Selection is scored, not random: each optional type gets points from the
composed `pattern` dimension and from the detected category, uploaded
assets add points directly to `gallery`/`about`, and anything scoring
above a threshold is included (with at least one optional section
guaranteed even for a low-signal description, so no result reads as
just "hero + boxes"). **Order** also shifts: a `story-first` pattern moves
`about` immediately after the hero instead of near the end. **Variant**
choice for most types is tied to an existing composed dimension (`card`,
`hero`, `spacing`, `colorBehavior`, `nav`) rather than being independently
random, so a generated result still reads as one coherent design system,
not mismatched parts.

This means two results in the same category can end up with a genuinely
different number and order of sections (a typical result is 5–7 sections
including hero/footer, versus V4's fixed hero+3-boxes), and the Advanced
panel's "Sections to include" control now maps onto these real types —
checking/unchecking one actually adds or removes it from
`project.sections` and re-renders, instead of toggling a cosmetic flag on
a grid that was always the same shape.

**What this deliberately does not yet do:** independently vary things like
per-tile gallery aspect ratio, testimonial count (always exactly one),
or pricing-table style layouts (services doubles as a stand-in for
pricing/product listings rather than a dedicated 9th section type). Adding
either is the same pattern as everything above — a new entry in the
section-type registry — not a rearchitecture. Flagged here rather than
quietly left out.

## 5. Removing the visible style picker

`Luminous`, `Editorial`, `Signal`, etc. no longer appear anywhere a
visitor can see:
- The style-swatch row/scroller is removed from `index.html` entirely
  (along with its wheel/drag/scroll-button JS), and so is the "Try another
  style" suggestion-chip block that used to name alternates.
- The floating "STYLE" card in the hero live preview is replaced with a
  "SECTIONS" card showing the live section count as you type — genuinely
  descriptive of what's about to be generated, and not a seed name.
- The preview-summary chip that used to show the style name (`Precision`,
  `Ledger`, ...) now shows `<n> sections · Composed`.
- The handoff card title drops the style suffix (`Business — Ledger` →
  just the business name).
- The customer-facing confirmation email (`server.js`) no longer includes
  the internal design-mode name in the copy shown to the *customer*; the
  internal lead email to the SiteRemade team keeps it, because that's
  exactly the "tested design reference" use the brief asks to preserve
  for internal/production use.
- `styles` (the 20-entry registry) and `composeStyleFromAnalysis` are
  unchanged in code — they're still exactly as useful as seeds/fallbacks/
  QA references. Only their *visibility* changes.

The primary flow is now: **describe your website → optionally add assets
in Advanced → Generate.** No second picker replaces the style picker.

## 6. Serialization and persistence (this pass)

`serializeProject(project)` → `JSON.stringify(project)` (assets included
as data URLs — fine at demo scale; see note below). Two buttons in the
Advanced panel, "Save project" and "Load saved," call
`localStorage.setItem('siteremade:lastProject', json)` and the reverse.
Loading replaces `project` wholesale and calls `renderProject(project)` —
proving the preview really can be *reconstructed* from serialized state,
not just re-generated from the original text (loading a saved project
after manual refinements — a color drag, an uploaded logo, a toggled
section — reproduces those refinements exactly, which re-typing the
original description alone never could under V4).

This is intentionally **not** a backend/database change. Per the brief:
no casual production migrations this pass; document the proposed model
first. If/when this needs to survive across devices or be handed to a
production/export pipeline, the natural next step is a `WebsiteProjects`
table (or reuse of whatever backs the existing "Website Projects" concept
referenced in the handoff copy) with one row per `project.meta.id` storing
this same JSON shape, and assets moved out of inline data URLs into
object storage with the project row holding references instead of bytes
— data URLs are fine for a client-only demo but would bloat a real table
fast (a handful of photos already pushes a serialized project into the
hundreds of KB).

## 7. What still prevents a generated result from being an independently deployable website

Being direct about the gap, since the brief asks for it explicitly:

1. **No HTML/CSS emission independent of this page.** `renderProject`
   renders into a specific DOM structure that's part of the SiteRemade
   marketing site itself (shares its CSS file, its JS runtime, its
   `.builder-site` scoping). A real export needs a renderer that emits a
   *standalone* document (own `<html>`, its own copy of only the CSS rules
   a given project actually uses, no dependency on `script.js`'s hero/
   nav/lead-form code).
2. **No multi-page concept.** `project.sections` describes one page. A
   real site needs a `pages` array (Home, About, Contact, ...) with
   sections per page, and internal links between them.
3. **No hosting/build step.** There's no static-site build, no server-
   rendering route, nothing that turns a `WebsiteProject` JSON blob into
   files on disk or a deployed URL.
4. **No content-editing surface for the delivered site** (this generator
   is pre-sale; the actual editable production site today is built by
   hand by SiteRemade's team from the emailed brief, not from this JSON).

**Cleanest next step, given the existing architecture:** keep
`WebsiteProject` JSON as the interchange format (already true after this
pass) and add a small **static-site renderer** — a Node script/function
that takes the same JSON and the same section-type registry (shared with
the browser preview, not reimplemented) and emits real files: one
`index.html` per page with only the CSS custom properties/rules that
project's dimensions touch, inlined or as a small generated stylesheet,
plus copies of any uploaded asset data URLs written out as real image
files. That keeps one source of truth for "what a section looks like"
(the registry) instead of maintaining a browser renderer and a separate
export renderer that could drift apart. Server-rendering on request is a
reasonable alternative if projects need to stay live-editable after
"deploy," but static generation is the smaller, more honest first step
given nothing here needs personalization per visitor.

## 8. Verification

See the V5 report (delivered alongside this file) for the full pass:
generation across 8 business types (including one intentionally unusual
fictional concept) with no assets and with logo-only / logo+hero /
multi-image combinations; confirmation the style picker is gone from the
DOM; confirmation composed results include section types/orders that
differ from the old fixed template; confirmation uploaded images are
placed by role and generated placeholders only fill gaps; confirmation
save → reload reconstructs an identical preview from JSON alone;
confirmation refinement controls only ever touch `project` before
re-rendering; desktop/mobile/short-desktop overflow checks; and a
confirmation the lead handoff still submits successfully.
