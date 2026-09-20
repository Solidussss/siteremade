# SiteRemade landing page V3 — single generator, scalable style system, broad-audience copy

Pre-implementation audit + architecture proposal, per the correction to the V2
direction. Nothing in this document has been implemented yet — no code has
changed since commit `aa35dd4`. This supersedes `GENERATOR-V2.md`'s framing
of "six modes as browsable outputs."

## 1. Copy audit — trade/service-specific language to generalize

The public-facing copy currently assumes a trades/contractor audience
throughout. Internal data (the `industries` dictionary, keyword scoring) can
stay category-specific — this audit is only about what the visitor reads.

| Location | Current | Problem | Replacement direction |
|---|---|---|---|
| `<meta name="description">` | "Describe your **service business**..." | narrows audience up front | "Describe your business..." |
| Hero description | "...matched to a website direction **built for service businesses**..." | explicit trade-only claim | "...matched to a website direction built around what you do..." |
| Hero demo CTA | "Request a quote ↗" | "quote" is contractor language | "Get started ↗" (generic; trade-flavored copy can still appear *inside* a generated trade site, just not in the product chrome) |
| Floating card label | "INDUSTRY" / default "Service" | frames everything as an industry vertical | relabel "CATEGORY", default "Business" |
| Modes-section eyebrow/heading | "WHAT THE GENERATOR CAN PRODUCE" / "**Six** directions, before you write a word." | hardcodes a count that's about to grow, and frames styles as finished outputs | see §5 — this section is reframed entirely, not just reworded |
| Modes-section body copy | "...built **for service businesses**..." (implied by industry defaults) | — | drop industry framing, talk about "your business" generically |
| Per-style showcase sample (`modeData`) | kickers like "ELECTRICAL SERVICES", "LANDSCAPING SERVICES", "ROOFING & EXTERIORS"; brand "NORTHLINE"; domain "northlineelectric.ca" | every style's *sample* is a trade business, so the showcase itself reads as trade-only even before generation | give each style a neutral or rotating sample (a studio, a café, a consultancy, a boutique) so the showcase demonstrates the *style*, not "this tool is for contractors" |
| Preview strip tags | "Residential / Commercial / Service / Renovation" | trade-specific tags | generic tags ("Overview / Work / Process / Contact") or category-rotated per sample |
| `industries` dict | 8 trade categories + fallback labeled "**Service Business**" | taxonomy itself is trade-only, not just the labels | broaden the taxonomy (§2/§3) — add retail, professional services, food & hospitality, creative/studio, health & wellness, software/tech, real estate, fitness, education, nonprofit — trades remain a subset, not the whole set; fallback label becomes "Business" |
| `runGeneration()` step copy | "`N` sections selected for a **service-business layout**" | trade-specific phrase baked into a generic progress step | "`N` sections selected for your site" |
| `toneSub()` templates | "Just `${label.toLowerCase()}` **work** that gets noticed" | "work" reads oddly for a café or software company | reword templates to use "results" / neutral verbs that hold up across trades and non-trades |
| "Get a Quote" buttons (preview + live builder site) | contractor-specific CTA | — | generic default "Get Started" / "Contact Us"; a quote-style CTA can still be *generated* for a business whose internal category is trade-like, but it's no longer the hardcoded default in the product chrome |
| Why-section | "Pick from **six** strong directions instead of buying blind." | hardcodes count | "Pick a direction instead of buying blind." |
| Nav, footer, handoff, pricing sections | already generic ("Build the direction," "Your direction. Our production build," "$750 CAD," "No lock-in") | none | leave as-is |

Net effect: nothing about *what the generator can do* changes — it can still
produce an excellent electrician or landscaper site. What changes is that the
product no longer *announces itself* as trade-only, and the six style
showcases stop using trade samples as their demo content.

## 2. Scalable style-system architecture

**Problem with the current approach**: each of the 6 styles is one large,
hand-written CSS override block (`.mode-stage[data-mode="editorial"]{...}`,
`.builder-site[data-mode="executive"]{...}`) that redeclares color,
typography, and shape together. Style 7 means writing another whole block
from scratch. That doesn't reach 15–25.

**Fix: separate "what varies" from "how many styles exist."** A style stops
being one big CSS block and becomes a short list of choices along a fixed
set of dimensions, each dimension backed by a small, shared, reusable set of
variant implementations. New styles are assembled by combining existing
variants plus a new palette/type pairing — new CSS is only needed when a
genuinely new variant is wanted, which is rare next to the number of styles.

**The dimensions** (matches the list in the brief) and a realistic-size
vocabulary for each:

| Dimension | Attribute | Variant vocabulary (shared, reused across styles) |
|---|---|---|
| Hero treatment / layout composition | `data-hero` | `split` (current default), `centered`, `stacked-image-below`, `asymmetric-offset`, `fullbleed-image`, `minimal-text-only` |
| Typography | `data-type` | `geo-sans`, `serif-editorial`, `display-condensed`, `humanist`, `classic-serif-mix`, `mono-technical` |
| Navigation | `data-nav` | `inline` (current), `boxed-pill`, `minimal-until-scroll`, `sidebar`, `centered-logo` |
| Cards / section blocks | `data-card` | `flat`, `bordered`, `elevated-shadow`, `image-led`, `numbered-editorial`, `outline-ghost` |
| Imagery direction | `data-imagery` | `abstract-geometric` (current), `photo-led-placeholder`, `illustration`, `texture-organic`, `grid-mosaic` — since there's no image-generation backend, "imagery direction" stays honest as an art-directed placeholder treatment, never a fabricated real photo |
| Section pattern | `data-pattern` | `standard`, `portfolio-first`, `proof-first` (reviews/metrics before services), `story-first` (about before services) |
| CTA treatment | `data-cta` | `solid-pill` (current default), `sharp-block`, `outline-ghost`, `underline-link`, `floating-badge` |
| Color behavior | `data-color-behavior` | `high-contrast-mono-accent`, `neutral-single-accent`, `warm-earth-multi-tone`, `dark-luxury-metallic` |
| Motion | `data-motion` | `none`, `subtle` (current baseline — fades/reveals), `expressive` (hover-tilt/parallax) — `expressive` and `subtle` both collapse to `none` under `prefers-reduced-motion` |
| Spacing | `data-spacing` | `compact`, `standard`, `airy`, `editorial-generous` — implemented as one `--space-unit` multiplier consumed by existing padding/gap rules, not per-style paddings |
| Palette | CSS custom properties (existing mechanism) | `--site-accent/-dark/-light`, `--site-bg/-dark/-light`, `--site-text/-muted` (kept), plus two new tokens — `--site-accent-2` and `--site-border` — needed for the richer palettes below |
| Mobile layout | (inherited) | each variant above defines its own mobile collapse once (e.g. `sidebar` nav becomes a drawer, `asymmetric-offset` hero re-stacks in a specific order) — not redefined per style |

**How a style is defined** — a style becomes a small registry entry, not a
CSS block:

```js
const styles = {
  luminous: {
    name: 'Luminous', tagline: 'Modern UI with controlled glow and depth.',
    palette: { main: '#315cff', accent2: '#6c8dff', background: '#0c1120', text: '#ffffff' },
    hero: 'split', type: 'geo-sans', nav: 'inline', card: 'elevated-shadow',
    imagery: 'abstract-geometric', pattern: 'standard', cta: 'solid-pill',
    colorBehavior: 'high-contrast-mono-accent', motion: 'subtle', spacing: 'standard'
  },
  // ...20 more entries, ~10 lines each
};
```

`applyStyle(key)` sets the `data-*` attributes on `.builder-site` /
`.mode-stage` from the entry and calls the existing `updatePalette()` for the
color tokens. CSS is reorganized into two layers:

1. **~12 shared variant rule-sets** — one for each value above
   (`[data-hero="asymmetric-offset"]`, `[data-nav="sidebar"]`,
   `[data-cta="floating-badge"]`, etc.), written once, used by many styles.
2. **A short per-style block** containing only palette custom-property
   values and the dimension-key assignments — a few lines, not a full
   component override.

This is the whole fix for scale: adding style #19 means adding one ~10-line
registry entry that references existing variants (plus, occasionally, one
new variant when a style genuinely needs new shape language) — not writing
a new 40-line CSS block per style. Styles stay genuinely distinct because
each is a *curated combination* across real dimensions, not a recolor of
one template.

## 3. Proposed expanded style library (6 existing → 20)

Existing six carry over as registry entries under this system unchanged in
spirit (Luminous, Editorial, Precision, Studio, Executive, Impact). Proposed
additions:

| Style | Feel | Distinguishing combination |
|---|---|---|
| **Atelier** | warm, tactile, craft/gallery | serif display type, `outline-ghost` cards, `texture-organic` imagery, `airy` spacing |
| **Foundry** | industrial, structural | `mono-technical` type accents, `sidebar` nav, `bordered` cards, steel-neutral palette |
| **Signal** | tech/startup, high-contrast | `minimal-until-scroll` nav, `floating-badge` CTA, `expressive` motion |
| **Meridian** | calm, spacious, wellness | `stacked-image-below` hero, `airy` spacing, muted pastel palette |
| **Nightshade** | moody, after-hours | dark palette, cool-toned `dark-luxury-metallic` behavior, subtle glow motion |
| **Paper** | starkly minimal, near-monochrome | huge type, `flat` cards, almost no accent color, `minimal-text-only` hero |
| **Terra** | earthy, natural | warm clay/green palette, `humanist` type, `texture-organic` imagery |
| **Aperture** | portfolio/photography-first | `fullbleed-image` hero, `portfolio-first` pattern, `image-led` cards |
| **Civic** | institutional, trustworthy | `boxed-pill` nav, `bordered` cards, conservative navy/gold, `proof-first` pattern |
| **Kinetic** | energetic, sport/fitness | `asymmetric-offset` hero, `expressive` motion, `sharp-block` CTA |
| **Ledger** | data/product-led, software feel | `mono-technical` type, `elevated-shadow` cards, `proof-first` pattern, dense spacing |
| **Bloom** | boutique, playful, retail | rounded shapes, warm pink/cream palette, `humanist` type, `solid-pill` CTA |
| **Monolith** | brutalist, architecture/studio | oversized type, `asymmetric-offset` hero, `motion-none`, stark two-tone palette |
| **Aviator** | heritage, premium legacy brand | `centered-logo` nav, leather/brass tones, `classic-serif-mix` type |

That's 20 total, with headroom to add a few more later (e.g. "Harbor,"
"Lattice," "Ember") purely by adding registry entries — no architecture
change required to reach 25.

## 4. Controls to demote out of the primary flow

**Stay in the primary, immediately-visible flow** (light refine, matches
"generated result is the product"):
- Try another style (2–3 real alternates from the analysis, as chips)
- Regenerate
- Tone: Professional / Bold / Friendly
- Business name + category — as compact inline edit fields, not a form block, since a wrong name/category is the most likely "this isn't right yet" moment

**Move into a collapsed "Advanced" panel** (secondary, closed by default):
- Logo upload
- Individual color pickers (main/background/text)
- Top-section layout choice (Layout 1/2/3) — this is now largely subsumed by the hero-treatment dimension per style; manual override becomes a power-user action
- Section include/exclude toggles + "regenerate section order"

Rationale: what greets the visitor right after generating should be the site
plus three or four light actions — not a settings sidebar. That's the
concrete fix for the "Generate → old manual customizer" feeling.

## 5. The generator stays the central experience

Reworked flow:

1. **Hero** — describe your business (unchanged), plus a small, clearly
   optional "Prefer a specific look? Choose a style" affordance next to the
   generator input — not a mid-page gallery of six "finished products" to
   browse first. Skipping it is the default path; picking a style just
   pre-fills that choice into the same Generate action.
2. **Generate → progress** — unchanged mechanism (real deterministic
   analysis, paced 5-step reveal), copy generalized per §1.
3. **Result** — the generated site preview is the visual center of the
   page, full width, with a slim action row above it (try another style /
   regenerate / tone / business name+category) — not a two-column
   form-next-to-preview layout.
4. **Advanced customization** — a collapsed disclosure beside or below the
   result, holding logo/colors/layout/sections from §4. Closed by default,
   doesn't compete with the generated result.
5. **Handoff** — unchanged in substance, copy already generalized.

The current `#modes` section (six tabs + one big stage, presented as a
mid-page destination with its own "Use this direction" button) goes away in
its current form. Style selection becomes an input to the one generator, not
a second, parallel set of outputs to browse.

## Status

Analysis only — nothing above is implemented. Next pass: rebuild
`script.js`'s style data as the registry described in §2, extend it to the
20 entries in §3, reorganize `styles.css` into shared-variant rules plus
per-style token blocks, rewrite the copy per §1, restructure `index.html`'s
modes/builder sections per §4–§5, then re-verify with Playwright at desktop
and mobile widths before anything is committed.
