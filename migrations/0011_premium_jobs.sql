-- PREMIUM JOBS (lib/premium-jobs.js): the premium media of one Creative generation (a cinematic hero, or a showcase's hero,
-- takeover and payoff) as a durable server-side job. The browser starts it and polls it; it never lives inside one HTTP
-- request, survives a closed tab, a refresh and a server restart, and is settled exactly once from what the provider
-- actually delivered.
--
--   status      queued | running | partial | completed | failed | cancelled   (partial / completed / failed / cancelled
--                                                                              are terminal)
--   roles_json  one entry per premium moment: { role, intent, state (pending | submitting | submitted | processing |
--               delivered | failed | blocked), sourceAssetId, sourceRef, mime, preset, credits, providerJobId, mediaId,
--               assetRef, outputMime, bytes, costUsd, failure, submittedAt, checkedAt, polls, errors, completedAt }
--   lease_*     the worker that is ticking the job right now (a second process -- or a duplicate timer -- skips it)
--   settled_at  set in the same transaction as the credit settlement: a job is settled once, never again
CREATE TABLE IF NOT EXISTS premium_jobs (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  creative_job_id TEXT NOT NULL,     -- the Creative generation (lib/creative-jobs.js) whose quote planned the premium media
  project_id TEXT,
  quote_id TEXT,
  op_id TEXT NOT NULL,               -- the credit reservation it settles ('<creative job>:premium')
  mode TEXT NOT NULL,                -- hero | showcase (the generator's mode)
  strategy TEXT NOT NULL,            -- standard | cinematic | showcase (lib/creative/premium-arc.js)
  status TEXT NOT NULL,
  roles_json TEXT NOT NULL,
  total INTEGER NOT NULL,
  completed INTEGER NOT NULL DEFAULT 0,
  credits_reserved INTEGER NOT NULL DEFAULT 0,
  credits_charged INTEGER NOT NULL DEFAULT 0,
  credits_refunded INTEGER NOT NULL DEFAULT 0,
  settled_at TEXT,
  message TEXT,
  next_check_at TEXT,
  lease_owner TEXT,
  lease_until TEXT,
  version INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_at TEXT
);
-- one premium job per generation: a second start returns the first job, never a second set of provider submissions
CREATE UNIQUE INDEX IF NOT EXISTS idx_premium_jobs_creative_job ON premium_jobs(creative_job_id);
CREATE INDEX IF NOT EXISTS idx_premium_jobs_status ON premium_jobs(status, next_check_at);
CREATE INDEX IF NOT EXISTS idx_premium_jobs_project ON premium_jobs(project_id, created_at);
