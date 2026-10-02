'use strict';
// THE WEBSITE ADMIN -- the one SiteRemade account allowed to remove websites from SiteRemade (any account's, drafts and
// purchased: migrations/0013_project_removal.sql). The owner's decision: exactly this account, by its email, and no
// one else -- not a workspace owner or admin, not SiteRemade staff, not any role. The email is the one Supabase verified
// for the caller's own access token (lib/supabase-identity.js), and it must be a CONFIRMED email -- never an address a
// request names. The Client App (siteremade-app lib/website-admin.js) holds the same list and checks it first; this
// server checks it again on its own.
const WEBSITE_ADMIN_EMAILS = Object.freeze(['jaydenflynn9@gmail.com']);

// identity: { email, emailConfirmed } (req.appBridge, set by lib/app-bridge-auth.js from the verified token)
function isWebsiteAdmin(identity) {
  if (!identity || identity.emailConfirmed !== true) return false;
  return WEBSITE_ADMIN_EMAILS.includes(String(identity.email || '').trim().toLowerCase());
}

module.exports = { WEBSITE_ADMIN_EMAILS, isWebsiteAdmin };
