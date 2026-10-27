-- DEMO PHOTOS, SHOWN OR NOT (lib/demo-photos.js): the owner looks at the photos found for the demos first, and decides
-- whether the site shows them ("show" = "on") or keeps the designs' drawings. One row per setting.
CREATE TABLE IF NOT EXISTS demo_settings (
  key TEXT PRIMARY KEY,
  value TEXT
);
