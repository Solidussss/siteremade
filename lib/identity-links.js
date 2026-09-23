// V14 (shared identity bridge pass): pure local-database logic for linking
// a generator account to a shared Supabase user id. This file NEVER talks
// to Supabase itself (no network call anywhere below) -- by the time
// anything here runs, the caller (server.js's /api/identity/* routes) has
// already obtained a real, server-verified {supabaseUserId, email} pair
// from lib/supabase-identity.js. That separation mirrors every other
// domain module in this repo: lib/credits.js/lib/purchase.js never call an
// external provider either, only server.js's routes do, then hand the
// already-verified result down. Same "db is a DatabaseAdapter, domain code
// never calls db.prepare directly" convention too -- see
// lib/adapters/sqlite-database-adapter.js's identityLinks/
// identityLinkEvents namespaces for the actual SQL.
'use strict';
const crypto = require('crypto');
const { nowIso } = require('./db.js');
const authLib = require('./auth.js');

function genId(prefix) {
  return `${prefix}_${crypto.randomBytes(16).toString('hex')}`;
}

// A password hash that can NEVER verify successfully against ANY password
// -- lib/auth.js's verifyPassword() rejects anything whose first ':'-
// delimited segment isn't literally 'scrypt' before it ever reaches
// scryptSync, so this is a real, safe "there is no local password for this
// account" sentinel, not an obscure/guessable one. A lazily-provisioned
// account (population B/I -- an app-only Supabase user with no prior
// generator account) has no local password at all and must never gain one
// implicitly; if this account is later also given a real local password
// (not implemented in this pass -- see the migration doc's "not yet
// built" list), that would go through the exact same hashPassword() path
// signup already uses, overwriting this sentinel deliberately, never as a
// side effect of linking.
const NO_LOCAL_PASSWORD_SENTINEL = 'supabase-provisioned:no-local-password:v1';

// A fixed, reviewed vocabulary of event reasons -- callers pass ONE OF
// THESE, never a freeform string built from request data, an error
// message, or (above all) a token/password. This is what actually
// enforces spec item 35's "do NOT log passwords/tokens/secrets": there is
// structurally no code path that can pass one through, because logEvent's
// only caller-supplied string comes from this fixed object.
const REASONS = Object.freeze({
  ACCOUNT_ALREADY_LINKED: 'generator_account_already_linked_to_a_different_supabase_user',
  SUPABASE_USER_ALREADY_LINKED: 'supabase_user_already_linked_to_a_different_generator_account',
  ALREADY_LINKED_SAME_PAIR: 'already_linked_same_pair_idempotent_noop',
  EMAIL_CONFLICT: 'existing_generator_account_with_this_email_requires_explicit_linking',
  LAZY_PROVISIONED: 'no_existing_generator_account_or_conflict_new_account_created',
  LINK_CREATED: 'dual_session_confirmation_succeeded',
  BRIDGE_DISABLED: 'identity_bridge_feature_flag_disabled',
});

function logEvent(db, { generatorAccountId, supabaseUserId, eventType, reason }) {
  db.identityLinkEvents.insert({
    id: genId('idev'),
    generatorAccountId: generatorAccountId || null,
    supabaseUserId: supabaseUserId || null,
    eventType,
    reason: reason || null,
    createdAt: nowIso(),
  });
}

// Read-only: does this Supabase user already have a linked generator
// account? Returns the generator account id, or null. Used by the session-
// exchange route to decide "resume an existing link" vs. "no link yet."
function resolveGeneratorAccountForSupabaseUser(db, supabaseUserId) {
  const row = db.identityLinks.findActiveBySupabaseUser(supabaseUserId);
  return row ? row.generator_account_id : null;
}

// Read-only, exposed to the frontend via /api/identity/status -- {linked}
// only, never a raw id (spec item 25: "do not expose implementation terms
// like Supabase UUID, account link table, migration ID").
function getLinkStatusForAccount(db, generatorAccountId) {
  return { linked: !!db.identityLinks.findActiveByAccount(generatorAccountId) };
}

// Population B/I: a Supabase-verified visitor with NO pre-existing
// generator account and NO existing link. Creates a brand-new generator
// account (no usable local password -- see NO_LOCAL_PASSWORD_SENTINEL
// above) and links it in the SAME transaction, so a crash between the two
// can never leave an unlinked orphan account. This is NOT a merge of two
// identities (there is nothing pre-existing to conflict with), so it does
// not require dual-session proof -- only the one already-verified Supabase
// identity that's creating it.
//
// If an account with this email ALREADY exists, this function refuses to
// create a second one or silently attach to the existing one (spec: "same
// email must not auto-merge") -- it returns {ok:false, reason:
// 'email_conflict'} so the caller can route the visitor to the explicit
// dual-proof linking flow (createLink) instead, where they prove control
// of BOTH identities before anything is connected.
//
// Idempotent: calling this again for a Supabase user who already has a
// link (from a prior call, or from having gone through createLink instead)
// is a safe no-op that returns the existing account, never a duplicate.
function lazyProvisionGeneratorAccount(db, { supabaseUserId, email }) {
  return db.transaction(() => {
    const existingLink = db.identityLinks.findActiveBySupabaseUser(supabaseUserId);
    if (existingLink) return { ok: true, accountId: existingLink.generator_account_id, created: false };

    const normalizedEmail = authLib.normalizeEmail(email);
    const existingAccount = db.accounts.findByEmail(normalizedEmail);
    if (existingAccount) {
      logEvent(db, { supabaseUserId, eventType: 'link_failed', reason: REASONS.EMAIL_CONFLICT });
      return { ok: false, reason: 'email_conflict' };
    }

    const ts = nowIso();
    const accountId = genId('acct');
    db.accounts.insert({ id: accountId, email: normalizedEmail, passwordHash: NO_LOCAL_PASSWORD_SENTINEL, createdAt: ts, updatedAt: ts });
    db.identityLinks.insert({
      id: genId('idlink'), generatorAccountId: accountId, supabaseUserId,
      verificationMethod: 'lazy_provision', migrationVersion: 'v1', linkedAt: ts, createdAt: ts, updatedAt: ts,
    });
    logEvent(db, { generatorAccountId: accountId, supabaseUserId, eventType: 'lazy_account_created', reason: REASONS.LAZY_PROVISIONED });
    return { ok: true, accountId, created: true };
  });
}

// Population C/D: linking two PRE-EXISTING accounts. The caller (server.js
// route) must have ALREADY verified both sides before calling this --
// requireAuth resolved a real generator session for `generatorAccountId`,
// and lib/supabase-identity.js verified the Supabase access token for
// `supabaseUserId` -- this function's own job is only the safe, transactional
// bookkeeping: refuse any ambiguous double-link, never overwrite an
// existing different link silently, and stay idempotent for a retried
// identical request (spec items 12/22: "replayed link request idempotent,"
// "concurrent link requests safe").
function createLink(db, { generatorAccountId, supabaseUserId }) {
  logEvent(db, { generatorAccountId, supabaseUserId, eventType: 'link_started' });
  return db.transaction(() => {
    const existingForAccount = db.identityLinks.findActiveByAccount(generatorAccountId);
    if (existingForAccount) {
      if (existingForAccount.supabase_user_id === supabaseUserId) {
        logEvent(db, { generatorAccountId, supabaseUserId, eventType: 'link_succeeded', reason: REASONS.ALREADY_LINKED_SAME_PAIR });
        return { ok: true, alreadyLinked: true };
      }
      logEvent(db, { generatorAccountId, supabaseUserId, eventType: 'link_conflict', reason: REASONS.ACCOUNT_ALREADY_LINKED });
      return { ok: false, reason: 'account_already_linked' };
    }
    const existingForSupabaseUser = db.identityLinks.findActiveBySupabaseUser(supabaseUserId);
    if (existingForSupabaseUser) {
      logEvent(db, { generatorAccountId, supabaseUserId, eventType: 'link_conflict', reason: REASONS.SUPABASE_USER_ALREADY_LINKED });
      return { ok: false, reason: 'supabase_user_already_linked' };
    }
    const ts = nowIso();
    db.identityLinks.insert({
      id: genId('idlink'), generatorAccountId, supabaseUserId,
      verificationMethod: 'dual_session_confirmation', migrationVersion: 'v1', linkedAt: ts, createdAt: ts, updatedAt: ts,
    });
    logEvent(db, { generatorAccountId, supabaseUserId, eventType: 'link_succeeded', reason: REASONS.LINK_CREATED });
    return { ok: true, alreadyLinked: false };
  });
}

module.exports = {
  NO_LOCAL_PASSWORD_SENTINEL, REASONS,
  resolveGeneratorAccountForSupabaseUser, getLinkStatusForAccount,
  lazyProvisionGeneratorAccount, createLink, logEvent,
};
