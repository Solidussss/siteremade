// App bridge pass (Phase 4): a NEW, narrow, additive Bearer-token auth path
// for server-to-server calls from the SiteRemade customer app
// (siteremade-app) to the /api/app-bridge/* routes in server.js.
//
// It sits ALONGSIDE, and never replaces, the generator's own cookie session
// auth (requireAuth / lib/auth.js) and the V14 /api/identity/* login-handoff
// routes. Deliberately NOT built on /api/identity/supabase/session: that
// route exists to mint a 30-day browser COOKIE session, which is the wrong
// tool for a server calling another server (it would leave a stray session
// row behind on every call).
//
// Per request, and never cached across requests:
//   1. Feature flag SITEREMADE_APP_BRIDGE_ENABLED must be exactly 'true'
//      (read live from process.env) -- otherwise 404 {ok:false}, the same
//      "doesn't appear to exist" posture the identity bridge uses while
//      disabled. Default: unset => off => zero behavior change.
//   2. `Authorization: Bearer <token>` must be present -- otherwise 401.
//   3. The token is verified with lib/supabase-identity.js's EXISTING
//      verifyAccessToken() (a real call to Supabase's /auth/v1/user with
//      the anon key -- never a local JWT decode) -- invalid/expired/
//      unverifiable => 401.
//   4. The verified Supabase user id is resolved to a generator account
//      with lib/identity-links.js's EXISTING
//      resolveGeneratorAccountForSupabaseUser() (active identity_links row
//      only) -- no active link => 404 {error:{code:'identity_not_linked'}}.
//   5. On success, req.accountId is set (the same field requireAuth sets,
//      so every existing ownership-scoped store function works unchanged)
//      and req.appBridge = { supabaseUserId } for observability.
//
// What this NEVER does: read or write the `sessions` table, set any cookie,
// create/provision a generator account or identity link (unlike
// /api/identity/supabase/session's lazy provisioning), trust any
// client-supplied user/account id, log the token, or return a stack trace.
'use strict';

function appBridgeEnabled(env = process.env) {
  return String(env.SITEREMADE_APP_BRIDGE_ENABLED || '').trim().toLowerCase() === 'true';
}

function bearerTokenFrom(req) {
  const header = req.headers && req.headers.authorization;
  if (!header || typeof header !== 'string') return null;
  const m = /^Bearer\s+([A-Za-z0-9._~+/=-]{10,4096})\s*$/.exec(header);
  return m ? m[1] : null;
}

function bridgeError(res, status, code, message) {
  return res.status(status).json({ ok: false, error: { code, message } });
}

// Dependencies are injected (rather than required here) so the exact same
// real modules server.js already loaded are the ones used, and so the
// middleware has no hidden module-level state of its own.
function createRequireAppBridgeAuth({ db, supabaseIdentity, identityLinks, isEnabled = appBridgeEnabled }) {
  return async function requireAppBridgeAuth(req, res, next) {
    try {
      if (!isEnabled()) return res.status(404).json({ ok: false });
      const token = bearerTokenFrom(req);
      if (!token) return bridgeError(res, 401, 'unauthenticated', 'A valid SiteRemade access token is required.');
      const verified = await supabaseIdentity.verifyAccessToken(token);
      if (!verified || !verified.ok || !verified.userId) return bridgeError(res, 401, 'unauthenticated', 'Could not verify this SiteRemade session.');
      const accountId = identityLinks.resolveGeneratorAccountForSupabaseUser(db, verified.userId);
      if (!accountId) return bridgeError(res, 404, 'identity_not_linked', 'This SiteRemade account is not linked to a website builder account yet.');
      req.accountId = accountId;
      req.accountEmail = null; // deliberately not surfaced on this path -- nothing downstream needs it
      req.appBridge = { supabaseUserId: verified.userId };
      return next();
    } catch (error) {
      // Fail closed with a generic body -- never a stack trace or detail.
      console.error('App bridge auth failed unexpectedly.');
      return bridgeError(res, 500, 'bridge_error', 'Something went wrong. Please try again.');
    }
  };
}

module.exports = { appBridgeEnabled, bearerTokenFrom, createRequireAppBridgeAuth };
