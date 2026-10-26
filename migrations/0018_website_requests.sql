-- WEBSITES, DONE FOR YOU (lib/service-enquiries.js 'website'): a website request moves through the owner's requests page.
--   status        new | building | preview_sent | paid | done | declined   (property videos keep new | replied | done)
--   preview_url   the preview the owner sent the customer
--   pay_token     the customer's private pay link: /pay/<pay_token>
--   paid_at       when Stripe confirmed the payment (the webhook), payment_ref its checkout session
--   note          the owner's own note
ALTER TABLE service_enquiries ADD COLUMN preview_url TEXT;
ALTER TABLE service_enquiries ADD COLUMN pay_token TEXT;
ALTER TABLE service_enquiries ADD COLUMN paid_at TEXT;
ALTER TABLE service_enquiries ADD COLUMN payment_ref TEXT;
ALTER TABLE service_enquiries ADD COLUMN note TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_service_enquiries_pay_token ON service_enquiries(pay_token);
