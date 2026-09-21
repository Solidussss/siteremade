-- V8.6: export + deployment packaging + hosting/domain handoff.
--
-- Extends the schema V8.5's migration runner already established
-- (migrations/0001_init.sql is never rewritten -- see its own header
-- comment and lib/db.js's runMigrations, which tracks applied files by
-- name in `schema_migrations`). This is a pure ADDITIVE migration: it adds
-- two new tables and touches no existing table's shape. `projects.
-- deployment_status` (the V8.5 placeholder column) is left exactly as it
-- is -- still a real, valid column -- and is now kept in sync by
-- lib/deployment-store.js as a convenience summary alongside the detailed
-- rows below, per the V8.6 spec's own "keep it synchronized... if useful"
-- guidance. It is never the load-bearing record of deployment state.
--
-- PG: as with 0001_init.sql, this stays close to what a real Postgres
-- migration would look like (explicit CHECK constraints standing in for
-- what a real deployment might also enforce via enum types).

-- One row per export/deployment ATTEMPT -- never overwritten in place.
-- Redeploying a newer project revision, or retrying a failed deploy,
-- always inserts a NEW row; the previous row (including a previously
-- 'live' or 'ready' one) is left completely untouched, so "last known
-- good deployment" is always recoverable even after a later attempt fails
-- (V8.6 spec §29).
CREATE TABLE IF NOT EXISTS deployments (
  id                    TEXT PRIMARY KEY,             -- unguessable: crypto.randomBytes(18) base64url
  owner_id              TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  project_id            TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  project_revision      INTEGER NOT NULL,              -- the EXACT projects.revision this export was compiled from
  direction_index       INTEGER NOT NULL DEFAULT 0,    -- which direction of that revision was exported
  compiler_version      TEXT NOT NULL,                 -- lib/export-compiler.js's own version string -- see reproducibility (§12)
  artifact_hash         TEXT NOT NULL,                 -- sha256 of the canonical (timestamp-free) compiled output
  runtime_type          TEXT NOT NULL CHECK (runtime_type IN ('static', 'server_required')),
  runtime_reasons_json  TEXT NOT NULL DEFAULT '[]',    -- e.g. ["contact_form_submission","booking_request"]
  target                TEXT NOT NULL DEFAULT 'local'
                          CHECK (target IN ('local', 'railway', 'hostinger', 'bluehost', 'godaddy')),
  state                 TEXT NOT NULL DEFAULT 'packaging'
                          CHECK (state IN ('not_deployed', 'packaging', 'ready', 'deploying', 'live', 'failed')),
  manifest_json         TEXT NOT NULL,                 -- the full machine-readable export manifest (§6)
  artifact_path         TEXT,                          -- server-local path to the built .zip, never exposed to the client directly
  deployed_url          TEXT,                          -- only ever set once a target genuinely reports a real reachable URL
  failure_reason        TEXT,
  created_at            TEXT NOT NULL,
  updated_at            TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_deployments_project ON deployments(project_id);
CREATE INDEX IF NOT EXISTS idx_deployments_owner ON deployments(owner_id);

-- Structured custom-domain handoff (§19/§20). One row per (project,
-- domain) the owner has entered; state is server-owned, same discipline as
-- `deployments.state` -- the client can request instructions or a
-- verification pass, but can never write `state` directly.
CREATE TABLE IF NOT EXISTS project_domains (
  id                TEXT PRIMARY KEY,
  owner_id          TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  project_id        TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  domain            TEXT NOT NULL,
  target            TEXT NOT NULL DEFAULT 'local',
  state             TEXT NOT NULL DEFAULT 'not_configured'
                      CHECK (state IN ('not_configured', 'instructions_generated', 'dns_pending', 'verified', 'ssl_pending', 'live')),
  dns_records_json  TEXT NOT NULL DEFAULT '[]',
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL,
  verified_at       TEXT
);
CREATE INDEX IF NOT EXISTS idx_domains_project ON project_domains(project_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_domains_project_domain ON project_domains(project_id, domain);
