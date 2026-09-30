# Update My Website: update intelligence

The Client App's "Update My Website" box (`app.js submitWebsiteEdit` -> `POST /api/app/website/edits` -> this builder's
`POST /api/app-bridge/website/:projectId/edits`) now has two levels of intelligence.

| | Surgical edit | Deep refinement (redesign) |
|---|---|---|
| For | a specific field, value or move: "change the headline to X", "move testimonials above services", "remove the FAQ", "change the spacing" | a result: "make it feel premium", "this feels generic, make it more creative", "redesign the hero", "make the homepage more editorial" |
| Decided by | `lib/edit-classifier.js` -- deterministic, free, before anything is spent | same |
| Planner | `submit_website_refinement` (unchanged): up to 8 operations on the active page | `submit_website_redesign`: the whole site in context, a revised structured direction back |
| Code | `lib/refinement-normalizer.js`, `lib/apply-refinement-plan.js` (unchanged) | Business: `lib/deep-refinement.js`; Creative: `lib/creative-refinement.js` (the Creative director revises its own scene plan) |
| Cost | 1 AI update | 1 AI update (`DEEP_REFINEMENT_CREDIT_COST`, server.js) |

## The redesign, step by step

1. **Context** (`buildRedesignContext`): business identity, the owner's description and declared facts, strategy,
   creative direction, every controlled design value, the type system, the hero (and its storyboard), every page with
   every section (type, variant, intent, copy, picture, form), navigation, owner uploads. Never image bytes or prompts.
2. **Plan**: `submit_website_redesign`, built from the planner's own enum vocabularies (`REDESIGN_VOCAB`). The system
   prompt includes the planner's fact, copy and design rules verbatim (`plannerRules([1, 5, 7, 10, 11, 12, 13, 15])`).
3. **Validation** (`normalizeRedesignPlan`): every value checked against its vocabulary; every section mapped back to
   the stored section it revises (keeping its pictures, form, CTA target and settings); every new sentence checked by
   the generator's claim/proof/filler rules plus a numbers/contacts check, and never allowed to drop a fact the text
   it replaces carried. Scope is enforced: a hero request leaves the pages; a homepage request restructures only
   the homepage. Testimonials, team, proof, metrics, pricing and integrations sections cannot be added.
4. **Apply** (`applyRedesignPlan`): a copy of the state. Pages the plan does not return are copied untouched. A form
   section left out comes back where it was; so does the only section showing the owner's uploads. `assets` and
   `imagePlan` are compared before/after and the update is refused if they differ (no generated Business pictures).
5. **Meaningful change** (`lib/refinement-change.js`): a weighted comparison of design values, type system, hero on
   screen, page/section structure, layouts and copy. Below the bar for its scope: nothing saved, nothing charged,
   `no_meaningful_change`.
6. **Save**: one new draft revision through `projectStore.updateOwnedProject` with `expectedRevision` (conflict ->
   `revision_conflict`), idempotent on the app's key. Never published automatically.
7. **Review**: the app previews the draft (`GET .../preview?source=draft`), shows the plain-language `changeSummary`,
   and publishes only when the owner does.

## Rendering

A redesigned direction carries `design.layoutDataset: 1`. For those directions only, the export (and so the app
preview and the ZIP) stamps the rest of the layout attributes the builder's live preview always stamps (content width,
image dominance/arrangement, section rhythm/alignment, type scale, heading width, card density/shape, split ratio,
`data-color-behavior`, page rhythm) and per-section rhythm positions, and the project store keeps section intents.
Every other project saves and exports byte-for-byte as before (`test/review/business-preservation.js`).

## Diagnostics

One line per update: `[update-intel] {requestId, projectId, baseRevision, mode, scope, classifier, plannerModel,
planningMs, operationCount, droppedInvalid, droppedFields, meaningfulChange, preserved, outcome, saved, creditsCharged}`.
No tokens, secrets or image bytes.

Tests: `test/update-intelligence.test.js` (builder), `test/website-update-preview.test.js` (app).
