// V8.7: the 'production' AuthProvider contract.
//
// Per this pass's own instruction: "Add a production auth adapter only if
// the real SiteRemade auth system is actually available/configured in the
// codebase. Do not invent tokens or credentials. Do not duplicate users
// between systems." Confirmed by direct inspection (this same engagement
// separately audited the real, separate SiteRemade ops app repository):
// the real SiteRemade auth system is Supabase Auth, with its own
// account/session/cookie model (sr_access/sr_refresh HttpOnly cookies,
// Supabase-issued JWTs, a `profiles` table keyed by the Supabase Auth user
// id) -- structurally a DIFFERENT identity system from this generator's
// local scrypt/session accounts, not an interchangeable one. There is no
// shared user table, no shared session format, and no existing bridge
// between the two anywhere in this repo.
//
// Unifying them for real requires an explicit product decision this pass
// does not make on its own: e.g. (a) an explicit account-linking flow (a
// generator account and an app account get connected by the person, not
// assumed identical because the email matches), or (b) migrating this
// generator to authenticate directly against the same Supabase project
// the app uses, retiring the local scrypt accounts entirely. Either is a
// real, separate migration -- not something to invent unasked inside an
// infrastructure-adapter pass. This file therefore fails closed on every
// method, exactly like the database/asset-store production adapters,
// rather than fabricating a bridge.
'use strict';

// Unlike the database/asset-store production adapters (where the only gap
// is "credentials present but the Supabase queries aren't implemented
// yet"), auth has no safe partial state -- there is no real SiteRemade
// auth system configured in this codebase at all, and simply having
// SUPABASE_URL/SUPABASE_SECRET_KEY set wouldn't make local and production
// accounts the same identity system. So this fails closed immediately at
// selection time, with the full explanation from this file's header,
// rather than returning an object that fails lazily per method.
function getProductionAuthProvider() {
  throw new Error(
    'SITEREMADE_BACKEND=production has no real AuthProvider in this codebase. The real SiteRemade ' +
    'auth system (Supabase Auth, in the separate ops-app repository) is a structurally different ' +
    'identity system from this generator\'s local scrypt/session accounts -- unifying them requires ' +
    'an explicit product decision (account linking, or migrating this generator onto the same ' +
    'Supabase project), not something to invent inside an infrastructure-adapter pass. See ' +
    'lib/adapters/production-auth-provider.js and PRODUCTION-ADAPTERS.md.'
  );
}

module.exports = { getProductionAuthProvider };
