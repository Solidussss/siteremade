-- V9 (product-flow pass): durable daily credit ledger + immutable purchase
-- snapshots.
--
-- PG: same dialect discipline as 0001_init.sql/0002_deployments.sql --
-- explicit PKs/FKs/CHECKs, ISO text timestamps (no native TIMESTAMPTZ in
-- node:sqlite). Purely additive: two new tables, no existing table's shape
-- changes.

-- A real, general, per-account DAILY credit allowance -- the durable
-- counterpart to (and NOT a replacement for) `direction_entitlements`
-- (migrations/0001_init.sql), which remains the separate, already-shipped
-- lifetime-3-directions cap. This table governs day-to-day throughput for
-- credit-consuming actions generally (new site/direction, image
-- generation/regeneration, AI-assisted copy rewrites) -- see lib/credits.js
-- for the exact reserve/commit/release discipline (identical pattern to
-- lib/entitlement.js, same reasoning about single-process synchronous
-- atomicity applies here).
--
-- `used`/`reserved` are reset to 0 (never accumulated) whenever
-- `last_grant_date` is behind the current UTC date -- see lib/credits.js's
-- ensureRow. This means the daily allowance does NOT roll over unused, and
-- a page refresh mid-day can never re-grant it (last_grant_date already
-- matches "today" for the rest of that day, so ensureRow is a no-op until
-- the date actually changes). `lifetime_used` is a pure observability
-- counter (never gates anything) so the account's total real usage stays
-- visible even though the daily window resets.
CREATE TABLE IF NOT EXISTS credit_ledger (
  account_id      TEXT PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
  used            INTEGER NOT NULL DEFAULT 0,
  reserved        INTEGER NOT NULL DEFAULT 0,
  lifetime_used   INTEGER NOT NULL DEFAULT 0,
  last_grant_date TEXT NOT NULL,               -- 'YYYY-MM-DD', UTC
  updated_at      TEXT NOT NULL
);

-- A durable, immutable copy of the EXACT directionsState/revision that was
-- live at the moment a purchase was fulfilled (see lib/purchase.js's
-- fulfillBySessionId, which creates this row in the SAME transaction as
-- marking the project 'purchased' -- both become true atomically). This is
-- the handoff source of truth: export/deployment (lib/export-compiler.js,
-- via server.js's export route) compiles from THIS row, never from the
-- live, still-editable `projects.state_json` -- so continuing to edit a
-- purchased project's draft afterward can never silently change what the
-- customer already paid for and downloaded (spec: "do not mutate or
-- overwrite the purchased artifact casually after purchase").
--
-- One snapshot per project (enforced by the unique index below) -- this
-- model has no "re-purchase" flow (lib/purchase.js's createPurchaseIntent
-- already refuses a new intent once a project is 'purchased'), so a second
-- snapshot for the same project should never occur; the unique index makes
-- that a real, enforced invariant rather than merely an assumption.
--
-- `hosting_choice_json` is the ONE column on this row that IS written again
-- after insert (see lib/purchase.js's setSnapshotHostingChoice) -- the
-- post-purchase hosting upsell is chosen sometime after payment completes,
-- so it can't be known at snapshot-creation time. This is purchase
-- metadata, not purchased CONTENT: state_json/direction_index/
-- project_revision (the actual frozen website) are never rewritten after
-- insert by any function in this codebase.
CREATE TABLE IF NOT EXISTS purchase_snapshots (
  id                  TEXT PRIMARY KEY,
  project_id          TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  owner_id            TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  purchase_intent_id  TEXT REFERENCES purchase_intents(id) ON DELETE SET NULL, -- null only for a best-effort backfill (see ensureSnapshotForOwnedProject)
  direction_index     INTEGER NOT NULL,
  state_json          TEXT NOT NULL,           -- frozen directionsState, verbatim, at purchase time
  project_revision    INTEGER NOT NULL,        -- the projects.revision this snapshot was taken from
  hosting_choice_json TEXT,                    -- {provider, skipped, chosenAt} once chosen -- null until then
  created_at          TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_purchase_snapshots_project ON purchase_snapshots(project_id);
CREATE INDEX IF NOT EXISTS idx_purchase_snapshots_owner ON purchase_snapshots(owner_id);
