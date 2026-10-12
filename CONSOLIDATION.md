# One generator: the consolidation

SiteRemade moves to one primary website generator: the premium-design workflow (`/designs`). The classic Business
and Creative generators stop being separate choices but keep working for every website already made with them.
Branch `consolidation`; recoverable checkpoint: tag `checkpoint-pre-consolidation-2026-10-12` (live main `71b9718`)
in this repo and in siteremade-app; the design-package workspace is archived as
`Documents/siteremade-design-poc-checkpoint-2026-10-12.tgz`.

## What the new generator is, and what it depends on
- A hand-built design package (the original page kept byte for byte, its content tagged, its rules in a schema and
  hooks, its own interactive code) -- `design-packages/design/*`, 12 designs.
- The engine (template, colour families, layout guards, glyph metrics) -- `design-packages/engine`.
- The writer (brief is the source of truth, one round of essential questions) -- `design-packages/prompt.js`,
  `lib/design-sites.js`.
- The realism engine (confirmed / derived / proposed / illustrative facts, confirm before publishing) --
  `lib/reality`.
- Accounts and sessions, the credits ledger (`lib/credits.js`, `reserveCredit/commitCredit/releaseCredit`), the
  Anthropic key and the paid-provider switch. Nothing from the classic planner, image generation, Creative pipeline or
  premium media.

## What the consolidation adds (all on the branch, nothing deployed)
1. **Website editor** (`lib/design-editor.js`, `/api/designs/sites/:id/editor|edit|undo`): every field the design's
   rules allow -- words, prices, numbers, switches, choices, colours, list sizes, opening hours, optional finishes --
   beside the live preview (desktop, phone). Each save goes through the same checker as generation and rebuilds the
   real page; the owner's typed facts count as confirmed; 20 versions kept for undo (migration 0015).
   Engine: `schema.optional` -- fields checked where present (Aldane finishes and strap or bracelet, spec values;
   opening hours in six designs).
2. **Create Website** (`lib/site-router.js`, `POST /api/designs/route`): describe the business; it goes to the design
   that can show it truthfully, with the description carried into the brief ("About the business"). No fitting design
   (a roofer, SaaS, a sushi bar) -> told so, and the classic builder opens with the description filled in.
3. **Projects in one place**: the studio lists its own sites and every classic website of the account (opening where
   it is edited today, untouched); a design site downloads as one file.
4. **Customers and credits** (`SITEREMADE_DESIGNS_OPEN=on`; off by default): any signed-in account may use it, paying
   `design_generation` (4 credits, like a Business website) through the existing ledger -- reserved, charged when built,
   released on failure, refused before any AI when short. The owner is not charged.
5. **The homepage box** (`consolidation.js`, `GET /api/site-config`): with the switch on, "Describe your business"
   starts Create Website, and the Business / Creative switch and the photo button are not shown. `?project=`,
   `?creative=1` and `?describe=` keep the classic tools for what still needs them.

## Retired from the customer's view (when the switch is on) -- not removed
- The homepage's classic generator as the first thing a customer uses.
- The Business / Creative mode switch.
- Creative as a way to start a new website.
Their code stays: existing projects open, render, export, publish and are edited in the customer app through it, and
it is the fallback for businesses no design fits yet. Removing any of it needs its own dependency check once no live
project uses it.

## Validation
- 48 quality benchmarks (every design's original and every sample site, built by the production engine, HTML hash +
  desktop and phone first screens): all rebuild byte for byte after every step (`scratch/benchmarks.js check`).
- First screens: every design paints in under 0.9 s (desktop) / 0.5 s (phone) from local files; eleven of twelve show
  their product at once. Lintel's first screen is the empty lot (the house builds as you scroll) -- see proposals.
- Tests: the new ones (editor, router, projects, credits, site-config) and the full suite; browser runs of the editor,
  Create Website, the homepage with the switch on and off, and the fallback.
- Not measured: a real paid generation (no paid AI in development); the writer's cost from the live trial is about
  $0.10-0.30 a site, ~60-90 s.

## To deploy (needs the owner's approval)
1. Merge `consolidation` into main (deploys with the switch OFF: production looks and behaves as today, plus the
   editor, Create Website and Projects for the owner account, and migration 0015).
2. Try it on production as the owner.
3. Set `SITEREMADE_DESIGNS_OPEN=on` on Railway when ready; unset it to go back instantly.

## Proposals (not built)
- Lintel's opening frame: show the finished house as a faint blueprint over the staked lot, fading as the build
  starts, so the first screen shows what the page is.
- More designs for the industries the router sends to the classic builder most (trades, SaaS, salons, restaurants).
- The customer app (app.siteremade.com) listing design sites beside classic ones.
- Custom domains and hosting for design sites (today: the public /s/<id> link and the download).
