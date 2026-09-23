-- V9 (Phase 9): project provenance -- "new" vs "redesign of an existing site".
-- Additive only, safe to re-run. Matches 0001_init.sql's PG-shape convention
-- (this sandbox runs node:sqlite; a real Postgres/Supabase deployment would
-- run the same ALTERs).
--
-- Why: the redesign/import product goal requires SiteRemade to remember
-- that a project started from an existing business's website (which URL,
-- when, what was extracted) -- for support, for re-refinement context, and
-- so the UI can be honest about where a project came from. It does NOT
-- change what a project IS: an imported/redesigned project is a normal
-- row in `projects`, going through the exact same strategy/archetype/
-- generation pipeline (POST /api/plan-website) as one built from a text
-- description. This migration only adds provenance columns; it never
-- creates a second project table or a parallel status/lifecycle.
--
-- source_metadata_json is reference material ONLY (what extraction found:
-- business name, services, contact info, colors, logo url, etc.) -- never
-- the canonical WebsiteProject content, which stays exactly where it
-- always has: `state_json`. A row with source_type='new' never has this
-- column populated.

ALTER TABLE projects ADD COLUMN source_type TEXT NOT NULL DEFAULT 'new'
  CHECK (source_type IN ('new', 'redesign'));
ALTER TABLE projects ADD COLUMN source_url TEXT;                 -- the existing site's URL, redesign only
ALTER TABLE projects ADD COLUMN source_imported_at TEXT;         -- ISO 8601, when extraction ran
ALTER TABLE projects ADD COLUMN source_metadata_json TEXT;       -- extracted reference facts (see lib/site-import.js), redesign only

-- No backfill needed: every row that predates this migration was created
-- through the from-scratch flow, and the DEFAULT above already makes it
-- 'new' correctly -- there is nothing to infer or guess.
