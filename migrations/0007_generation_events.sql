-- Generation diagnostics: a durable, append-only record of what each
-- generation actually did -- planner outcome (used / fell back and why) and
-- every image request's outcome -- that survives a server restart.
--
-- PG: same dialect discipline as 0001-0006 -- explicit PK, ISO text
-- timestamps (no native TIMESTAMPTZ in node:sqlite). Purely additive: one
-- new table, no existing table's shape changes, no existing row touched.
--
-- WHY THIS EXISTS: server.js's operation ledger (recordOperation) and the
-- planner-attempt history were in-memory only, so after a restart there was
-- no way to answer "what did that $0.82 of image spend produce, and did the
-- visitor ever receive it?". A row here is written for:
--   kind='planner'        -- every /api/plan-website exit (success, malformed
--                            output, provider error, not configured, ...)
--   kind='image'          -- every /api/generate-image outcome, including
--                            'delivered' (with the stored image's asset hash),
--                            'replayed' (served from a previous paid result at
--                            no charge), 'joined' (a retry that attached to a
--                            still-running paid call), 'client_disconnected'
--                            (paid and stored, but the browser had already
--                            gone -- recoverable by replay), and failures
--   kind='client_outcome' -- what the browser actually did with it (used the
--                            AI plan or fell back to deterministic copy, and
--                            why; an image result discarded because the plan
--                            changed while it was in flight)
--   kind='operation'      -- a durable copy of each in-memory ledger row
--
-- PRIVATE BY CONSTRUCTION: nothing in the export compiler, the generated
-- site, or any customer-facing route reads this table. It is readable only
-- through GET /api/admin/generation-events behind SITEREMADE_ADMIN_TOKEN
-- (the same fail-closed gate as the existing operation-ledger route).
--
-- account_id/project_id are deliberately NOT foreign keys: this is a log,
-- and a diagnostic row must be writable even for a request whose project
-- only exists in the browser so far (project_id is then the browser's own
-- local id). asset_hash points at asset_blobs.hash when an image was stored.
CREATE TABLE IF NOT EXISTS generation_events (
  id                  TEXT PRIMARY KEY,
  created_at          TEXT NOT NULL,
  kind                TEXT NOT NULL,
  outcome             TEXT NOT NULL,
  account_id          TEXT,
  project_id          TEXT,
  request_key         TEXT,
  provider            TEXT,
  model               TEXT,
  quality             TEXT,
  latency_ms          INTEGER,
  estimated_cost_usd  REAL,
  credits_charged     INTEGER,
  asset_hash          TEXT,
  detail_json         TEXT
);
CREATE INDEX IF NOT EXISTS idx_generation_events_created ON generation_events (created_at);
CREATE INDEX IF NOT EXISTS idx_generation_events_replay ON generation_events (account_id, request_key, outcome);
