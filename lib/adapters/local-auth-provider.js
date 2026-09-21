// V8.7: the 'local' AuthProvider implementation -- a thin wrapper around
// lib/auth.js's real scrypt/session implementation (unchanged, see that
// file's own header), adding one genuinely new thing: `getCurrentAccount`,
// which used to be hand-duplicated as `getSessionAccount` in BOTH
// server.js and mock-server.js (identical 4-line bodies). Moving it here
// gives both files one shared "resolve the current authenticated account
// from this request" implementation, which is exactly the "current
// authenticated account" surface the AuthProvider boundary is meant to
// expose -- see PRODUCTION-ADAPTERS.md.
//
// server.js/mock-server.js's own `requireAuth`/`withOptionalAuth`/
// `requireSameOrigin` middleware are deliberately NOT moved here -- they're
// framework glue (Express middleware vs. a raw-http dispatcher's own
// convention), not an infrastructure concern, and each already just calls
// getCurrentAccount() internally now.
'use strict';
const auth = require('../auth.js');

function getCurrentAccount(db, req) {
  const cookies = auth.parseCookies(req.headers.cookie);
  const token = cookies[auth.SESSION_COOKIE];
  return token ? auth.resolveSession(db, token) : null;
}

module.exports = {
  kind: 'local',
  SESSION_COOKIE: auth.SESSION_COOKIE,
  parseCookies: auth.parseCookies,
  sessionCookieHeader: auth.sessionCookieHeader,
  signUp(db, email, password) { return auth.createAccount(db, email, password); },
  signIn(db, email, password) { return auth.signIn(db, email, password); },
  createSession(db, accountId) { return auth.createSession(db, accountId); },
  destroySession(db, token) { return auth.deleteSession(db, token); },
  getCurrentAccount,
  findAccountById(db, id) { return auth.findAccountById(db, id); },
};
