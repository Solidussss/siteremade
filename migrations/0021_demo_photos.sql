-- DEMO PHOTOS (lib/demo-photos.js): real photos for each design's demo, so the catalogue shows each design the way a
-- business's site will look. Found by the owner's "Find photos" (a free library, CC0 / public domain only, picked by
-- the hero director) or uploaded by hand. They belong to the demo alone: a site built for a customer never gets them.
--   demo_sets    one per design: the camera plan, the director's note, where each photo came from
--   demo_photos  the photos themselves (JPEG, at most 1600 px) and each one's subject mask
CREATE TABLE IF NOT EXISTS demo_sets (
  design TEXT PRIMARY KEY,
  camera TEXT,
  note TEXT,
  credits_json TEXT,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS demo_photos (
  design TEXT NOT NULL,
  slot TEXT NOT NULL,
  data BLOB NOT NULL,
  mask TEXT,
  PRIMARY KEY (design, slot)
);
