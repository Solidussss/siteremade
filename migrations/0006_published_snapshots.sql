-- App bridge pass (Phase 4): append-only "published revision" snapshots.
--
-- PG: same dialect discipline as 0001-0005 -- explicit PKs/FKs, ISO text
-- timestamps (no native TIMESTAMPTZ in node:sqlite). Purely additive: one
-- new table, no existing table's shape changes, no existing row touched.
--
-- WHY THIS EXISTS: purchase_snapshots (migrations/0003) holds exactly ONE
-- frozen copy per project (unique index on project_id), taken at purchase
-- time, and POST /api/projects/:id/export compiles only from it. That made
-- every edit made after purchase permanently un-exportable. This table is
-- the smallest fix: each "publish" (POST /api/app-bridge/website/:id/publish)
-- appends one row freezing the project's state_json at an exact revision,
-- and the export route compiles from the LATEST row here when one exists --
-- falling back to purchase_snapshots, byte-for-byte unchanged, for every
-- project that has never published through this path.
--
-- WHAT A ROW DOES NOT MEAN: nothing in this codebase pushes bytes to any
-- live URL or hosting target (deployments.deployed_url is never set by any
-- route; see lib/deployment-store.js markDeploymentLive's own comment). A
-- row here marks "this revision is the one to treat as current/published
-- and to export from" -- it is not evidence that anything is live anywhere.
--
-- Two columns beyond the minimal spec, both required by existing code
-- rather than invented: `owner_id` so reads can be ownership-scoped in SQL
-- exactly like every other owned table here (deployments, project_domains,
-- purchase_snapshots), and `direction_index` because the export compiler
-- needs to know which of the (up to 3) directions in state_json to compile
-- -- the same column purchase_snapshots already carries for the same reason.
--
-- Rows are never updated or deleted by any function in this codebase
-- (append-only), so this also incidentally gives a coarse publish history.
-- It is NOT a per-edit revision history -- see the Phase 4 report.
CREATE TABLE IF NOT EXISTS published_snapshots (
  id               TEXT PRIMARY KEY,
  project_id       TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  owner_id         TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  revision         INTEGER NOT NULL,          -- the projects.revision this snapshot was taken from
  direction_index  INTEGER NOT NULL DEFAULT 0,
  state_json       TEXT NOT NULL,             -- frozen directionsState, verbatim, at publish time
  published_at     TEXT NOT NULL,
  created_at       TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_published_snapshots_project_time ON published_snapshots(project_id, published_at);
CREATE INDEX IF NOT EXISTS idx_published_snapshots_owner ON published_snapshots(owner_id);
