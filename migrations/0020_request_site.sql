-- THE SITE BUILT FOR A WEBSITE REQUEST (server.js POST /api/requests/:id/build): the owner's one tap makes a design
-- site from the request (the design's example under the business's name, with the customer's photos placed by the
-- hero director), and the request remembers it, so the requests page can open it and offer its link as the preview.
ALTER TABLE service_enquiries ADD COLUMN site_id TEXT;
