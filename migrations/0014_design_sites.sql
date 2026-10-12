-- DESIGN SITES (lib/design-sites.js, design-packages/): a website made from one of SiteRemade's premium designs
-- (Beadline, Halcyra, ...) by the brief-to-site flow: the owner fills in a brief, the AI writer drafts the content, the
-- design's checker answers, and the finished page is built from the design's template. Publishing makes it public at
-- /s/<id>.
--
--   status          writing | needs_owner | built | failed     (writing is the only non-terminal state)
--   brief_json      the brief as the owner wrote it (answers to the writer's questions are appended to it)
--   content_json    the content the checker accepted (built only)
--   questions_json  what the writer needs the owner to answer (needs_owner only)
--   confirm_json    facts on the page the brief did not give, for the owner to confirm (built only)
--   attempts_json   each draft and what the checker said about it
--   usage_json      AI tokens used and the estimated cost
--   html            the built page (built only)
--   published_at    when it was made public at /s/<id> (NULL: private)
CREATE TABLE IF NOT EXISTS design_sites (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  design TEXT NOT NULL,
  status TEXT NOT NULL,
  business_name TEXT,
  brief_json TEXT NOT NULL,
  content_json TEXT,
  questions_json TEXT,
  confirm_json TEXT,
  attempts_json TEXT,
  usage_json TEXT,
  html TEXT,
  message TEXT,
  published_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_design_sites_account ON design_sites(account_id, created_at);
