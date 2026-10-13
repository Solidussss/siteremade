-- ENQUIRIES FOR SITEREMADE'S OWN SERVICES (lib/service-enquiries.js): someone asks SiteRemade for work that isn't made
-- in the studio, starting with property videos (/property-videos). Kept, and emailed to hello@siteremade.com.
-- One table for every service, so a new service only adds its fields to lib/service-enquiries.js.
--   service       property-video (more later)
--   summary       one line for the inbox, made from the fields
--   fields_json   [[label, value]] what they told us, in the form's order
--   contact_json  { name, email, phone }
--   status        new | replied | done
--   emailed_at    when the email to SiteRemade went (NULL: not sent, see email_error)
CREATE TABLE IF NOT EXISTS service_enquiries (
  id TEXT PRIMARY KEY,
  service TEXT NOT NULL,
  summary TEXT NOT NULL,
  fields_json TEXT NOT NULL,
  contact_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'new',
  emailed_at TEXT,
  email_error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_service_enquiries_service ON service_enquiries(service, created_at);
