-- WEBSITE REMOVAL: a website removed from SiteRemade by the website admin (lib/website-admin.js). A soft delete: the
-- project row stays -- with its status (a purchased website stays 'purchased'), its revisions, its purchase snapshot and
-- published revisions, its purchase intents and payments, its credit ledger, its premium media, 3D models and stored files
-- -- so billing and audit history are never lost. Every OWNER-scoped read (an account's projects, the builder's project
-- list, the app's Saved Websites, the Website view, preview, download, reopen, save, checkout) treats a removed project
-- as gone; reads by id alone (the Stripe webhook's) are unchanged.
--   removed_at  when it was removed (NULL: an active project)
--   removed_by  the Supabase user id of the admin who removed it
ALTER TABLE projects ADD COLUMN removed_at TEXT;
ALTER TABLE projects ADD COLUMN removed_by TEXT;
CREATE INDEX IF NOT EXISTS idx_projects_removed ON projects(removed_at);
