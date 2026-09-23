// V14 (shared identity bridge pass): server-side verification of a
// Supabase Auth access token, so the generator can trust a caller's shared
// SiteRemade identity WITHOUT ever managing Supabase tokens as its own
// session mechanism (see SITE-PROJECT-V14-IDENTITY-BRIDGE.md's "generator
// session transition" section for why: Option B there -- exchange the
// verified Supabase identity for the generator's own existing HttpOnly
// session, immediately, server-side -- is what this module feeds).
//
// Same "pluggable, honestly-reports-unconfigured, real network call, never
// a fabricated success" shape as server.js's own anthropicProvider/
// imageProvider -- `configured()` is false whenever the required env vars
// aren't set (true in this sandbox: there is no real Supabase project
// reachable from here, and this module makes no attempt to pretend
// otherwise), and verifyAccessToken() always makes a REAL HTTP call when
// configured, never a local JWT-decode-without-verification shortcut (a
// generator that merely base64-decoded the JWT payload without checking
// Supabase's own signature would trust a forged token completely).
//
// Deliberately uses ONLY the publishable/anon key, never the service-role
// key -- verifying "is this access token valid, and whose is it" is
// exactly what Supabase's GoTrue `/auth/v1/user` endpoint is FOR with an
// anon-scoped client (see the app-side audit: its own lib/context.js does
// the identical `anon.auth.getUser(access)` call). The generator has no
// reason to ever hold a Supabase service-role key -- it never queries the
// app's Postgres data, only asks "whose token is this."
'use strict';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY;

function configured() {
  return !!(SUPABASE_URL && SUPABASE_ANON_KEY);
}

// A real UUID shape check -- the same one migrations/0005_identity_links.sql
// enforces as a database CHECK constraint, mirrored here so a malformed id
// is rejected before it ever reaches a query, not just eventually by the
// database.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Verifies a Supabase access token against Supabase's own Auth API.
// Returns {ok:true, userId, email} only for a token Supabase itself
// confirms is currently valid (not expired, not revoked, correctly
// signed) -- never decodes the JWT locally to skip that real network
// round-trip. Fails soft ({ok:false}) for every kind of problem
// (unconfigured, network error, non-2xx, malformed response, non-UUID
// user id) -- callers always treat {ok:false} as "cannot verify this
// identity right now," never as a reason to fall back to trusting the
// caller's own claim about who they are.
async function verifyAccessToken(accessToken) {
  if (!configured() || !accessToken || typeof accessToken !== 'string') return { ok: false };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(`${SUPABASE_URL.replace(/\/$/, '')}/auth/v1/user`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${accessToken}`, apikey: SUPABASE_ANON_KEY },
      signal: controller.signal,
    });
    if (!response.ok) return { ok: false };
    const data = await response.json().catch(() => null);
    if (!data || typeof data.id !== 'string' || !UUID_RE.test(data.id) || typeof data.email !== 'string' || !data.email) {
      return { ok: false };
    }
    return { ok: true, userId: data.id, email: data.email };
  } catch (error) {
    return { ok: false };
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = { configured, verifyAccessToken };
