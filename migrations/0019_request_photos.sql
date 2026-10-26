-- PHOTOS WITH A WEBSITE REQUEST (lib/website-requests.js): the customer sends their own photos with "Get this design".
--   upload_token  (on the request) the customer's one-time right to add photos right after sending it
--   request_photos  each photo, a JPEG/PNG/WebP the browser already shrank, in the order they chose them
ALTER TABLE service_enquiries ADD COLUMN upload_token TEXT;
CREATE TABLE IF NOT EXISTS request_photos (
  id TEXT PRIMARY KEY,
  enquiry_id TEXT NOT NULL,
  mime TEXT NOT NULL,
  data BLOB NOT NULL,
  sort INTEGER NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_request_photos_enquiry ON request_photos(enquiry_id, sort);
