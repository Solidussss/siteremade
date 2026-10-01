-- OWNERSHIP + CREDITS (no subscription). Buy the website once, own it permanently; credits pay for SiteRemade's AI and
-- media work. Purely additive: no existing table changes shape except new nullable columns on purchase_intents.
--
--   credit_events     the append-only audit trail of every credit movement: what was granted (purchased, the first
--                     website bonus, trial, tester day, a legacy Workspace month, an admin adjustment), what an operation
--                     reserved, charged, released or refunded, and what a refund revoked. Rows are never updated or
--                     deleted (the triggers below refuse it). The spendable balance still derives from grants and
--                     allocations (lib/credits.js) inside one transaction with these rows.
--   credit_purchases  one row per credit-pack checkout: fulfilled only from the signed Stripe event, exactly once (the
--                     grant id is purchase:<row id>), reversed on a refund (unused credits only).
--   credit_quotes     what a planned operation will cost, shown to the customer BEFORE anything paid runs. Accepting a
--                     quote reserves its credits under the quote's own operation id (accepting twice reserves once).
--   usage_ledger      the economics of every billable operation, without secrets: quoted / reserved / settled /
--                     refunded credits, each provider's usage and cost estimate, renderer, premium enhancements,
--                     provider request ids, outcome.
--   premium_media     provider-neutral premium media records (Higgsfield today): intent, source asset, provider job id,
--                     cost, provenance and the LOCAL asset the finished media was stored as (never a provider URL).
CREATE TABLE IF NOT EXISTS credit_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id TEXT NOT NULL,
  type TEXT NOT NULL,              -- purchased | first_website_bonus | trial | tester | legacy_subscription | admin_adjustment
                                   -- | reserved | charged | released | refunded | revoked
  amount INTEGER NOT NULL,         -- credits moved by this event (always >= 0; the type says which way)
  op_id TEXT,
  grant_id TEXT,
  reason TEXT,
  ref TEXT,                        -- the purchase / quote / Stripe session this event came from
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_credit_events_account ON credit_events(account_id, id);
CREATE INDEX IF NOT EXISTS idx_credit_events_op ON credit_events(op_id);
CREATE TRIGGER IF NOT EXISTS credit_events_append_only_update BEFORE UPDATE ON credit_events BEGIN SELECT RAISE(ABORT, 'credit_events is append-only'); END;
CREATE TRIGGER IF NOT EXISTS credit_events_append_only_delete BEFORE DELETE ON credit_events BEGIN SELECT RAISE(ABORT, 'credit_events is append-only'); END;

CREATE TABLE IF NOT EXISTS credit_purchases (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  pack_id TEXT NOT NULL,
  credits INTEGER NOT NULL,
  amount INTEGER NOT NULL,         -- cents
  currency TEXT NOT NULL,
  status TEXT NOT NULL,            -- pending | fulfilled | cancelled | failed | refunded
  stripe_session_id TEXT UNIQUE,
  payment_intent_id TEXT,
  grant_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_credit_purchases_account ON credit_purchases(account_id, created_at);
CREATE INDEX IF NOT EXISTS idx_credit_purchases_payment ON credit_purchases(payment_intent_id);

CREATE TABLE IF NOT EXISTS credit_quotes (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  project_id TEXT,
  operation TEXT NOT NULL,
  items_json TEXT NOT NULL,
  credits INTEGER NOT NULL,        -- what is reserved on acceptance (the most this operation can cost)
  min_credits INTEGER NOT NULL,    -- what it costs if the optional parts are not needed (refunded at settlement)
  ceiling_usd REAL NOT NULL,       -- internal provider-spend ceiling (never shown to customers)
  status TEXT NOT NULL,            -- open | accepted | settled | expired | cancelled
  op_id TEXT,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_credit_quotes_account ON credit_quotes(account_id, created_at);

CREATE TABLE IF NOT EXISTS usage_ledger (
  op_id TEXT PRIMARY KEY,
  account_id TEXT,
  project_id TEXT,
  operation TEXT NOT NULL,
  status TEXT NOT NULL,            -- pending | ok | failed
  quoted INTEGER NOT NULL DEFAULT 0,
  reserved INTEGER NOT NULL DEFAULT 0,
  settled INTEGER NOT NULL DEFAULT 0,
  refunded INTEGER NOT NULL DEFAULT 0,
  ceiling_usd REAL NOT NULL DEFAULT 0,
  anthropic_usd REAL NOT NULL DEFAULT 0,
  anthropic_input_tokens INTEGER NOT NULL DEFAULT 0,
  anthropic_output_tokens INTEGER NOT NULL DEFAULT 0,
  serpapi_searches INTEGER NOT NULL DEFAULT 0,
  serpapi_usd REAL NOT NULL DEFAULT 0,
  higgsfield_jobs INTEGER NOT NULL DEFAULT 0,
  higgsfield_usd REAL NOT NULL DEFAULT 0,
  openai_usd REAL NOT NULL DEFAULT 0,
  renderer TEXT,
  premium_json TEXT,
  provider_ids_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_usage_ledger_operation ON usage_ledger(operation, created_at);

CREATE TABLE IF NOT EXISTS premium_media (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  project_id TEXT,
  provider TEXT NOT NULL,
  provider_job_id TEXT,
  media_type TEXT NOT NULL,        -- image | video
  intent TEXT NOT NULL,
  source_asset_id TEXT,
  preset TEXT NOT NULL,
  status TEXT NOT NULL,            -- pending | completed | failed | rejected
  cost_usd REAL NOT NULL DEFAULT 0,
  credits INTEGER NOT NULL DEFAULT 0,
  op_id TEXT,
  asset_ref TEXT,                  -- sha256 of the stored bytes in the asset store (the export reads these)
  mime TEXT,
  bytes INTEGER,
  provenance_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_premium_media_project ON premium_media(project_id, created_at);

-- the website's kind is part of what was bought (its price differs); the payment intent ties a later refund to it
ALTER TABLE purchase_intents ADD COLUMN kind TEXT;
ALTER TABLE purchase_intents ADD COLUMN payment_intent_id TEXT;
ALTER TABLE purchase_intents ADD COLUMN bonus_grant_id TEXT;
-- a refunded website payment (the status column's CHECK allows no new value: the refund is its own column)
ALTER TABLE purchase_intents ADD COLUMN refunded_at TEXT;
