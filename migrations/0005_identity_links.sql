-- V14 (shared identity bridge pass): the smallest coherent schema needed to
-- LINK a generator account to a shared Supabase identity -- NOT to rekey
-- any existing ownership. Every existing FK in this database (projects.
-- owner_id, purchase_intents.owner_id, deployments.owner_id,
-- project_domains.owner_id, purchase_snapshots.owner_id,
-- credit_ledger.account_id, direction_entitlements.account_id,
-- sessions.account_id) keeps pointing at accounts.id exactly as it always
-- has. This migration adds two new, purely additive tables alongside that
-- -- see SITE-PROJECT-V14-IDENTITY-BRIDGE.md section "Phase 1" for why a
-- link table, not a column rewrite, is the safe first step: rewriting 8
-- FK-bearing tables' owner columns in one pass, against live purchased-
-- site/credit data, with no way to verify correctness against a real
-- Supabase project from this sandbox, is exactly the "destructive rekeying
-- unless the audit proves it is safe and reversible" this pass's own brief
-- forbids without that proof.
--
-- `supabase_user_id` cannot be a real FK -- Supabase's `auth.users` table
-- lives in a completely separate database/service this generator does not
-- and should not have direct SQL access to (see the app-side audit: the
-- app itself only ever reaches its own Postgres via its own service-role
-- client). It is stored and validated as a plain UUID-shaped TEXT column
-- instead, exactly the same "can't FK across a service boundary, so
-- validate at the application layer and treat it as the join key" pattern
-- this database already uses for `purchase_intents.stripe_session_id`
-- (Stripe's id, not a local FK either).

-- One row per identity link ATTEMPT'S CURRENT STATE -- not an event log
-- (see identity_link_events below for history/observability). At most one
-- row with link_status='linked' may exist per generator_account_id, and at
-- most one with link_status='linked' may exist per supabase_user_id -- the
-- two partial unique indexes below enforce both directions as real
-- database constraints, not just application-level checks, so even a
-- concurrent/racing link attempt (spec: "concurrent link attempts") cannot
-- create two active links for the same account on either side. A revoked
-- link's row is kept (status='revoked', never deleted) so a later re-link
-- has a real audit trail rather than looking like a first-ever link.
CREATE TABLE IF NOT EXISTS identity_links (
  id                    TEXT PRIMARY KEY,
  generator_account_id  TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  supabase_user_id      TEXT NOT NULL
                          CHECK (supabase_user_id GLOB '[0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f]-[0-9a-f][0-9a-f][0-9a-f][0-9a-f]-[0-9a-f][0-9a-f][0-9a-f][0-9a-f]-[0-9a-f][0-9a-f][0-9a-f][0-9a-f]-[0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f]'),
  link_status           TEXT NOT NULL DEFAULT 'linked'
                          CHECK (link_status IN ('linked', 'revoked')),
  -- 'dual_session_confirmation': both an authenticated generator session
  -- AND a freshly server-verified Supabase access token were presented in
  -- the SAME request that created this row (see lib/identity-links.js
  -- createLink) -- the only method this pass implements for linking two
  -- PRE-EXISTING accounts (spec item 21/6). 'lazy_provision': this row was
  -- created alongside a BRAND NEW generator account for a Supabase user
  -- who had no pre-existing generator account at all (see lib/identity-
  -- links.js lazyProvisionGeneratorAccount) -- not a merge of two
  -- identities, so it doesn't need dual proof, only the one verified
  -- Supabase token that created the new account in the first place.
  verification_method   TEXT NOT NULL
                          CHECK (verification_method IN ('dual_session_confirmation', 'lazy_provision')),
  -- A free-form version tag (not a foreign key to anything) so a FUTURE
  -- migration pass can tell which rows were created under which linking
  -- rules without needing to infer it from verification_method alone --
  -- e.g. if a later pass changes what "dual_session_confirmation" requires,
  -- old rows stay honestly labeled with the rules that actually applied
  -- when they were created.
  migration_version     TEXT NOT NULL DEFAULT 'v1',
  linked_at             TEXT NOT NULL,
  revoked_at            TEXT,
  created_at            TEXT NOT NULL,
  updated_at            TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_identity_links_account_active
  ON identity_links(generator_account_id) WHERE link_status = 'linked';
CREATE UNIQUE INDEX IF NOT EXISTS idx_identity_links_supabase_active
  ON identity_links(supabase_user_id) WHERE link_status = 'linked';
CREATE INDEX IF NOT EXISTS idx_identity_links_account ON identity_links(generator_account_id);
CREATE INDEX IF NOT EXISTS idx_identity_links_supabase ON identity_links(supabase_user_id);

-- Append-only audit/observability log (spec item 35) -- link_started/
-- link_succeeded/link_failed/link_conflict/lazy_account_created. NEVER
-- carries a password, token, or secret -- only ids and a short, fixed-
-- vocabulary reason string (see lib/identity-links.js's EVENT_REASONS).
-- `generator_account_id` is nullable because a 'link_started' or
-- 'link_failed' event for a not-yet-created lazy account has no generator
-- account id yet at the moment the event is logged.
CREATE TABLE IF NOT EXISTS identity_link_events (
  id                    TEXT PRIMARY KEY,
  generator_account_id  TEXT REFERENCES accounts(id) ON DELETE SET NULL,
  supabase_user_id      TEXT,
  event_type            TEXT NOT NULL
                          CHECK (event_type IN ('link_started', 'link_succeeded', 'link_failed', 'link_conflict', 'lazy_account_created')),
  reason                TEXT,
  created_at            TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_identity_link_events_account ON identity_link_events(generator_account_id);
CREATE INDEX IF NOT EXISTS idx_identity_link_events_supabase ON identity_link_events(supabase_user_id);
CREATE INDEX IF NOT EXISTS idx_identity_link_events_created ON identity_link_events(created_at);
