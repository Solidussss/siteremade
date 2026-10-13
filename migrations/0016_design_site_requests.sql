-- REQUESTS FROM PUBLISHED DESIGN SITES (lib/site-requests.js): what a visitor books, orders, reserves or asks for on a
-- live site at /s/<id>. Kept for the owner's inbox and emailed to the owner's account.
--   kind          booking | order | reservation | enquiry | quote | callback | trial | waitlist | entry
--   summary       one line of what was asked for, as the page wrote it
--   fields_json   [[label, value]] the details, in the page's order
--   contact_json  { name, phone, email } (a name and at least one way to reply)
--   status        new | done   (the owner marks a request done in the inbox)
--   emailed_at    when the owner's email went (NULL: not sent, see email_error)
CREATE TABLE IF NOT EXISTS design_site_requests (
  id TEXT PRIMARY KEY,
  site_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  summary TEXT NOT NULL,
  fields_json TEXT NOT NULL,
  contact_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'new',
  emailed_at TEXT,
  email_error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_design_site_requests_site ON design_site_requests(site_id, created_at);
