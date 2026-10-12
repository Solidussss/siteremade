-- DESIGN SITE REVISIONS (lib/design-editor.js): the website editor changes a built design site's content and keeps the
-- previous versions so an edit can be undone.
--   revisions_json   [{ at, by, content_json }] newest last, at most 20 (the current content is content_json itself)
ALTER TABLE design_sites ADD COLUMN revisions_json TEXT;
