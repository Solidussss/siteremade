-- V8.5: durable account-backed project ownership + purchase persistence.
--
-- Written to run today on Node's built-in `node:sqlite` (this sandbox
-- cannot `npm install`, so there is no `pg`/`@supabase/supabase-js`
-- available -- see SITE-PROJECT-V8.5.md part 1). The dialect below is kept
-- deliberately close to what a real Postgres/Supabase migration would look
-- like (explicit PKs, FKs, CHECK constraints, indexes, timestamps as ISO
-- text since SQLite has no native TIMESTAMPTZ) so this file documents the
-- intended production shape, not just the sandbox shape. Divergences from
-- a real Supabase deployment are called out inline with "-- PG:" comments.
--
-- PG: in a real Supabase/Postgres deployment, table-level Row Level
-- Security policies would sit alongside this schema as defense in depth
-- (auth.uid() = owner_id, etc.) -- see SITE-PROJECT-V8.5.md part "security"
-- for why this pass does NOT rely on RLS as a substitute for the
-- server-side ownership checks in lib/project-store.js; those checks are
-- the real, load-bearing authorization boundary in both the sandbox and
-- (as defense in depth alongside RLS) a real deployment.

CREATE TABLE IF NOT EXISTS accounts (
  id            TEXT PRIMARY KEY,               -- PG: uuid default gen_random_uuid()
  email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,                   -- 'scrypt:<saltHex>:<hashHex>' -- see lib/auth.js
  created_at    TEXT NOT NULL,                   -- ISO 8601 -- PG: timestamptz default now()
  updated_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id          TEXT PRIMARY KEY,                  -- sha256(raw session token) -- the raw token itself
                                                    -- lives only in the HttpOnly cookie, never stored
  account_id  TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  created_at  TEXT NOT NULL,
  expires_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_account ON sessions(account_id);

-- One row per owned project. The WebsiteProject itself (pages, sections,
-- design, copy, functionality modules, directions[], activeDirectionIndex,
-- editor-relevant ids) is a coherent structured JSON document already --
-- see SITE-PROJECT-V8.5.md part 2 for why this is stored as ONE json
-- column (`state_json`) rather than split into a table per field/section.
-- Transient runtime-only state (undo/redo WeakMap history, focused input,
-- in-flight image request objects, ephemeral module-submission runtime) is
-- never part of what the client sends to persist -- see
-- lib/project-store.js's own stripping/validation pass.
CREATE TABLE IF NOT EXISTS projects (
  id               TEXT PRIMARY KEY,             -- unguessable: crypto.randomBytes(18) base64url, NOT sequential
  owner_id         TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  name             TEXT NOT NULL DEFAULT 'Untitled project',
  status           TEXT NOT NULL DEFAULT 'draft'
                     CHECK (status IN ('draft', 'checkout_pending', 'purchased', 'archived')),
  purchase_ref     TEXT,                          -- Stripe Checkout Session id once purchased (support/reconciliation only)
  source_local_id  TEXT,                          -- the browser-local project.meta.id this row was migrated from, if any --
                                                    -- used to make anonymous->account migration idempotent (never duplicate)
  state_json       TEXT NOT NULL,                 -- the serialized WebsiteProject (post-validation/normalization, assets internalized)
  revision         INTEGER NOT NULL DEFAULT 1,     -- optimistic-concurrency token -- bumped on every accepted update
  created_at       TEXT NOT NULL,
  updated_at       TEXT NOT NULL,
  deployment_status TEXT NOT NULL DEFAULT 'not_deployed' -- V8.6 placeholder; unused this pass, never read/written beyond default
);
CREATE INDEX IF NOT EXISTS idx_projects_owner ON projects(owner_id);
-- Idempotent migration lookup: the SAME local project migrated twice by
-- the same account must resolve to the SAME row, never a duplicate.
CREATE UNIQUE INDEX IF NOT EXISTS idx_projects_owner_source_local
  ON projects(owner_id, source_local_id) WHERE source_local_id IS NOT NULL;

-- A stable, server-created binding between (account, exact project) and a
-- Stripe Checkout Session, created BEFORE redirecting to Stripe -- this is
-- what makes "a payment must grant ownership of the exact project the
-- buyer intended to purchase" enforceable: fulfillment reconciles against
-- THIS row's project_id, never against whatever the browser happens to
-- have in local state when it returns from checkout.
CREATE TABLE IF NOT EXISTS purchase_intents (
  id                TEXT PRIMARY KEY,             -- unguessable -- this is the id the success_url carries, never the raw project id
  owner_id          TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  project_id        TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  stripe_session_id TEXT UNIQUE,                  -- set once the real Checkout Session is created
  status            TEXT NOT NULL DEFAULT 'pending'
                       CHECK (status IN ('pending', 'fulfilled', 'failed', 'cancelled')),
  amount            INTEGER NOT NULL,             -- minor units (cents), matches the existing $350 CAD line item
  currency          TEXT NOT NULL DEFAULT 'cad',
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_purchase_intents_owner ON purchase_intents(owner_id);
CREATE INDEX IF NOT EXISTS idx_purchase_intents_project ON purchase_intents(project_id);

-- Server-authoritative direction entitlement, per authenticated account --
-- the durable counterpart to V8/V8.1's anonymous HttpOnly-cookie ledger.
-- `reserved` implements the same reserve-before-call / commit-on-success /
-- release-on-failure discipline V8.1.1's client-side concurrency lock
-- already established, now enforced server-side so a refresh or a second
-- device can never reset or exceed the allowance.
CREATE TABLE IF NOT EXISTS direction_entitlements (
  account_id  TEXT PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
  used        INTEGER NOT NULL DEFAULT 0,
  reserved    INTEGER NOT NULL DEFAULT 0,
  updated_at  TEXT NOT NULL
);

-- Content-addressed local stand-in for real object storage (Supabase
-- Storage in production -- see SITE-PROJECT-V8.5.md part "asset
-- persistence" for why a full storage migration is out of scope this
-- pass). One row per unique image blob (deduped by sha256 of its bytes),
-- referenced from a project's state_json via a stable {"assetRef":"<sha256>"}
-- marker in place of the raw base64 dataUrl.
CREATE TABLE IF NOT EXISTS asset_blobs (
  hash          TEXT PRIMARY KEY,                 -- sha256 hex of the raw image bytes
  content_type  TEXT NOT NULL,
  byte_length   INTEGER NOT NULL,
  created_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS schema_migrations (
  id          TEXT PRIMARY KEY,
  applied_at  TEXT NOT NULL
);
