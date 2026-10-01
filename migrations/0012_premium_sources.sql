-- PREMIUM SOURCES: the one picture a premium media provider may fetch for one role of one premium job, through an
-- unguessable link (lib/premium-jobs.js, server.js /api/premium-media/source/:token). Durable, so a server restart between
-- a submit and the provider's fetch never loses the picture; scoped, so a link opens exactly one stored upload; bounded,
-- so it stops working once that role has an outcome, or at its expiry, whichever comes first.
--
--   token_hash  sha256 of the link's token (the token itself is only ever in the URL given to the provider)
--   asset_ref   the stored upload (content-addressed asset store) -- never a path, never another file
CREATE TABLE IF NOT EXISTS premium_sources (
  token_hash TEXT PRIMARY KEY,
  premium_job_id TEXT NOT NULL,
  role TEXT NOT NULL,
  asset_ref TEXT NOT NULL,
  mime TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_premium_sources_job ON premium_sources(premium_job_id, role);
CREATE INDEX IF NOT EXISTS idx_premium_sources_expiry ON premium_sources(expires_at);

-- each premium job carries its own hard limits, checked before every provider submission: the most clips its mode allows
-- (Cinematic Hero 1, Showcase 3) and the provider-spend budget (clips x the per-clip budget, 2.25 USD each by default)
ALTER TABLE premium_jobs ADD COLUMN max_clips INTEGER NOT NULL DEFAULT 0;
ALTER TABLE premium_jobs ADD COLUMN budget_usd REAL NOT NULL DEFAULT 0;
