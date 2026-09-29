-- ONE AUTHORITATIVE CREDIT LEDGER (billing pass). Replaces the daily counter row in credit_ledger (kept, unused, for
-- history) with grants + operations:
--   credit_grants      what an account may spend: the one-time free trial, each paid subscription billing month, the
--                      owner's tester allowance per UTC day. A grant's id is deterministic (trial:<account>,
--                      sub:<subscription>:<period start>, tester:<account>:<day>), so it can only ever be created once.
--                      expires_at NULL = never expires; revoked_at ends it early (an immediately cancelled plan).
--   credit_operations  one row per paid action, keyed by a unique operation id: a retry, double click or reconnect
--                      that reuses the id can never reserve or charge twice. status: reserved -> committed | released.
--                      A reservation that is never settled (crash, abandoned job) stops holding credits at expires_at.
--                      provider_usd tracks what the work actually cost, even when the customer is not charged.
--   credit_allocations which grant(s) an operation draws from. An operation stays charged against the grant it was
--                      reserved on, so a request that crosses a day or billing-month boundary never touches another
--                      period's credits.
--   creative_jobs      one Creative page generation (research -> pictures -> direction) as one identifiable job, so
--                      picking a picture, searching again or resuming after a reload continues it instead of charging
--                      again.
--   billing_entitlements the last verified subscription state for an account (from the app, which reads it from Stripe).
-- Purely additive: no existing table changes shape except two nullable columns on purchase_intents.
CREATE TABLE IF NOT EXISTS credit_grants (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  kind TEXT NOT NULL,              -- trial | subscription | tester
  amount INTEGER NOT NULL,
  starts_at TEXT NOT NULL,
  expires_at TEXT,
  revoked_at TEXT,
  source TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_credit_grants_account ON credit_grants(account_id);

CREATE TABLE IF NOT EXISTS credit_operations (
  op_id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  amount INTEGER NOT NULL,
  status TEXT NOT NULL,            -- reserved | committed | released
  job_id TEXT,
  provider_usd REAL NOT NULL DEFAULT 0,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_credit_operations_account ON credit_operations(account_id, created_at);
CREATE INDEX IF NOT EXISTS idx_credit_operations_job ON credit_operations(job_id);

CREATE TABLE IF NOT EXISTS credit_allocations (
  op_id TEXT NOT NULL,
  grant_id TEXT NOT NULL,
  amount INTEGER NOT NULL,
  PRIMARY KEY (op_id, grant_id)
);
CREATE INDEX IF NOT EXISTS idx_credit_allocations_grant ON credit_allocations(grant_id);

CREATE TABLE IF NOT EXISTS creative_jobs (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  status TEXT NOT NULL,            -- open | directing | done | failed
  research_runs INTEGER NOT NULL DEFAULT 0,
  directions INTEGER NOT NULL DEFAULT 0,
  result_json TEXT,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_creative_jobs_account ON creative_jobs(account_id);

CREATE TABLE IF NOT EXISTS billing_entitlements (
  account_id TEXT PRIMARY KEY,
  supabase_user_id TEXT,
  workspace_id TEXT,
  subscription_id TEXT,
  status TEXT NOT NULL,
  period_start TEXT,
  period_end TEXT,
  cancel_at_period_end INTEGER NOT NULL DEFAULT 0,
  checked_at TEXT NOT NULL
);

-- the agreed deliverable: the project state and revision the customer checked out, frozen when checkout starts
ALTER TABLE purchase_intents ADD COLUMN state_json TEXT;
ALTER TABLE purchase_intents ADD COLUMN project_revision INTEGER;
