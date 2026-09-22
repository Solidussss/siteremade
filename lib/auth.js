// V8.5: the minimum production-sensible account layer -- sign up, sign in,
// sign out, identify the current authenticated user, restore owned
// projects. No teams/orgs/roles/invitations/social login (explicitly out
// of scope per the spec). No npm dependency: password hashing uses Node
// core `crypto.scrypt` (a real, salted, slow KDF -- not a bcrypt
// substitute in name only, a real one in function), sessions use a random
// token handed to the browser via an HttpOnly cookie, with only the
// token's SHA-256 stored server-side (so a DB read alone is never
// replayable as a session).
'use strict';
const crypto = require('crypto');

const SESSION_COOKIE = 'siteremade_session';
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const SCRYPT_KEYLEN = 64;

function nowIso() { return new Date().toISOString(); }

// ---- Cookie parsing (shared by server.js's Express req.headers.cookie and
// mock-server.js's raw http req.headers.cookie -- both expose the same
// standard header string, so one parser serves both frameworks). ----------
function parseCookies(header) {
  const out = {};
  String(header || '').split(';').forEach(part => {
    const idx = part.indexOf('=');
    if (idx === -1) return;
    const key = part.slice(0, idx).trim();
    if (!key) return;
    out[key] = decodeURIComponent(part.slice(idx + 1).trim());
  });
  return out;
}
// Deployment-safety pass: `secure` adds the Secure attribute (the cookie
// is never sent by the browser back over plain HTTP) when the caller
// tells us this response is actually HTTPS/production -- see server.js's
// own cookieShouldBeSecure for how that's decided from a real request.
// Defaults to false (unchanged behavior) so every existing caller that
// doesn't pass it -- including mock-server.js's test harness, which always
// runs over plain http://localhost -- keeps working exactly as before;
// HttpOnly and SameSite=Lax are unchanged either way, and the token/
// expiration format below is untouched.
function sessionCookieHeader(token, { clear = false, secure = false } = {}) {
  const attrs = ['Path=/', 'HttpOnly', 'SameSite=Lax'];
  if (secure) attrs.push('Secure');
  if (clear) return `${SESSION_COOKIE}=; Max-Age=0; ${attrs.join('; ')}`;
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}; ${attrs.join('; ')}`;
}

// ---- Password hashing -------------------------------------------------------
function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(String(password), salt, SCRYPT_KEYLEN);
  return `scrypt:${salt.toString('hex')}:${hash.toString('hex')}`;
}
function verifyPassword(password, stored) {
  if (!stored || typeof stored !== 'string') return false;
  const parts = stored.split(':');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const salt = Buffer.from(parts[1], 'hex');
  const expected = Buffer.from(parts[2], 'hex');
  let actual;
  try { actual = crypto.scryptSync(String(password), salt, expected.length); } catch (e) { return false; }
  if (actual.length !== expected.length) return false;
  return crypto.timingSafeEqual(actual, expected);
}

// ---- Validation --------------------------------------------------------------
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function normalizeEmail(raw) { return String(raw || '').trim().toLowerCase().slice(0, 254); }
function validateSignup(email, password) {
  const e = normalizeEmail(email);
  if (!EMAIL_RE.test(e)) return { valid: false, error: 'Enter a valid email address.' };
  if (typeof password !== 'string' || password.length < 8) return { valid: false, error: 'Password must be at least 8 characters.' };
  if (password.length > 200) return { valid: false, error: 'Password is too long.' };
  return { valid: true, email: e };
}

// ---- Accounts ------------------------------------------------------------
function genId(prefix) {
  // Unguessable, non-sequential -- crypto.randomBytes, not an autoincrement
  // integer -- so an account/session id can never be enumerated or guessed
  // by incrementing a counter.
  return `${prefix}_${crypto.randomBytes(16).toString('hex')}`;
}
// `db` is a DatabaseAdapter (see lib/adapters/database-adapter.js) --
// V8.7 moved the raw SQL that used to live in this file's functions into
// lib/adapters/sqlite-database-adapter.js's `accounts`/`sessions`
// namespaces, unchanged in text/semantics; everything below calls those
// named methods instead. This file remains the "local scrypt/session
// implementation" the AuthProvider boundary wraps (see
// lib/adapters/local-auth-provider.js).
function createAccount(db, email, password) {
  const check = validateSignup(email, password);
  if (!check.valid) return { ok: false, error: check.error };
  const existing = db.accounts.findByEmail(check.email);
  if (existing) return { ok: false, error: 'An account with this email already exists.' };
  const id = genId('acct');
  const ts = nowIso();
  db.accounts.insert({ id, email: check.email, passwordHash: hashPassword(password), createdAt: ts, updatedAt: ts });
  return { ok: true, account: { id, email: check.email } };
}
function findAccountByEmail(db, email) {
  return db.accounts.findByEmail(normalizeEmail(email));
}
function findAccountById(db, id) {
  if (!id) return null;
  return db.accounts.findById(id);
}
function signIn(db, email, password) {
  const account = findAccountByEmail(db, email);
  // Constant-shape response whether the email exists or not -- never
  // confirms "this email doesn't have an account" vs "wrong password" as
  // distinct signals (a mild but real account-enumeration defense).
  if (!account || !verifyPassword(password, account.password_hash)) {
    return { ok: false, error: 'Invalid email or password.' };
  }
  return { ok: true, account: { id: account.id, email: account.email } };
}

// ---- Sessions --------------------------------------------------------------
function hashToken(token) { return crypto.createHash('sha256').update(token).digest('hex'); }
function createSession(db, accountId) {
  const token = crypto.randomBytes(32).toString('base64url');
  const ts = nowIso();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
  db.sessions.insert({ idHash: hashToken(token), accountId, createdAt: ts, expiresAt });
  return { token, expiresAt };
}
// Resolves a raw cookie token to {accountId, email} -- returns null for a
// missing, malformed, unknown, or expired session (an expired session is
// opportunistically deleted, never silently treated as valid).
function resolveSession(db, token) {
  if (!token || typeof token !== 'string') return null;
  const id = hashToken(token);
  const row = db.sessions.findWithAccountEmail(id);
  if (!row) return null;
  if (new Date(row.expiresAt).getTime() < Date.now()) {
    db.sessions.delete(id);
    return null;
  }
  return { accountId: row.accountId, email: row.email };
}
function deleteSession(db, token) {
  if (!token) return;
  db.sessions.delete(hashToken(token));
}

module.exports = {
  SESSION_COOKIE, SESSION_TTL_MS,
  parseCookies, sessionCookieHeader,
  hashPassword, verifyPassword,
  createAccount, findAccountByEmail, findAccountById, signIn,
  createSession, resolveSession, deleteSession,
  normalizeEmail,
};
