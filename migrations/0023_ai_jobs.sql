-- CUSTOMER AI JOBS (lib/ai-jobs.js): every paid AI action a customer (or the owner) starts from the studio -- a
-- Claude-assisted update, "Make It Your Own" planning, generated images, Wan videos, property videos. A job is one
-- request (idempotent per account + key); its PARTS are the paid calls it makes (one for most jobs, one per
-- transition for a property showcase). Each part has its own credit reservation (credit_operations.op_id =
-- part.op_id), so a part that fails is refunded on its own and a delivered part is charged on its own.
-- Additive only: no existing table changes.
CREATE TABLE IF NOT EXISTS ai_jobs (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  idem_key TEXT NOT NULL,
  kind TEXT NOT NULL,                 -- assist_update | own_plan | image | video | exterior | showcase
  site_id TEXT,
  owner INTEGER NOT NULL DEFAULT 0,   -- 1: the SiteRemade owner's own job (no credits charged; still inside the budgets)
  video INTEGER NOT NULL DEFAULT 0,   -- 1: counts against the global video concurrency limit
  status TEXT NOT NULL,               -- queued | running | succeeded | partial | failed
  credits INTEGER NOT NULL DEFAULT 0, -- quoted when it opened (server-side)
  charged INTEGER NOT NULL DEFAULT 0, -- what it actually cost the customer
  est_usd REAL NOT NULL DEFAULT 0,    -- budgeted provider cost
  provider_usd REAL NOT NULL DEFAULT 0, -- what the providers actually charged
  loss_usd REAL NOT NULL DEFAULT 0,   -- provider charges on parts that delivered nothing (refunded to the customer)
  params_json TEXT,
  result_json TEXT,
  error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  finished_at TEXT,
  UNIQUE (account_id, idem_key)
);
CREATE INDEX IF NOT EXISTS idx_ai_jobs_account ON ai_jobs(account_id, created_at);
CREATE INDEX IF NOT EXISTS idx_ai_jobs_status ON ai_jobs(status, video);
CREATE INDEX IF NOT EXISTS idx_ai_jobs_created ON ai_jobs(created_at);

CREATE TABLE IF NOT EXISTS ai_job_parts (
  job_id TEXT NOT NULL,
  n INTEGER NOT NULL,                 -- 1.. in order
  status TEXT NOT NULL,               -- pending | running | done | failed
  attempt INTEGER NOT NULL DEFAULT 1,
  op_id TEXT,                         -- this attempt's credit reservation
  credits INTEGER NOT NULL DEFAULT 0,
  est_usd REAL NOT NULL DEFAULT 0,
  provider_usd REAL NOT NULL DEFAULT 0, -- across all attempts
  loss_usd REAL NOT NULL DEFAULT 0,
  result_json TEXT,
  error TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (job_id, n)
);
