// V9 deployment-safety pass: refuses to silently start a PRODUCTION
// deployment against persistence paths that default to somewhere INSIDE
// this app's own container filesystem. Railway (and most container PaaS)
// give a service ephemeral filesystem storage by default -- it survives
// a plain in-place restart but is wiped and replaced on every redeploy
// (new build/image), and is not guaranteed to survive host migration
// either -- unless a persistent Volume is attached and this app is told
// its mount path. There is no way for this process to verify FROM THE
// INSIDE that a given path is really backed by a mounted volume, so
// instead of guessing, this requires an explicit, non-default value for
// every path that holds real customer data before the local backend is
// allowed to start in what looks like a production deployment at all.
// Falling back to the in-container default silently is exactly the
// failure mode that loses purchased-site/account data on the next
// deploy -- so it's refused outright (a fatal startup error), not logged
// as a warning easy to miss in a deploy log.
//
// Scope: this governs ONLY the 'local' backend (SQLite + local-filesystem
// asset/export storage) -- SITEREMADE_BACKEND=production (the Supabase
// adapter contract) already fails closed on its own missing config,
// independent of and before this check ever runs (see
// lib/adapters/production-database-adapter.js and
// lib/adapters/production-auth-provider.js) -- not duplicated here. See
// PRODUCTION-ADAPTERS.md for why 'production' is not actually a working
// deployment target today (auth has no real implementation yet), which is
// exactly why THIS module exists: 'local' + a persistent volume is the
// only deployable-today path, so it's the one that needs a real safety
// net rather than an honest "throws immediately" stub.
'use strict';

// The three filesystem locations V9's product flow durably writes
// customer data to. All three must survive a redeploy for the six kinds
// of data the product-flow pass depends on (accounts/sessions, projects,
// daily credits, purchase snapshots, purchases, hosting choices all live
// in the DB; deployments/export records span the DB row AND the actual
// .zip artifact under SITEREMADE_EXPORTS_DIR).
const PERSISTENCE_ENV_VARS = [
  { key: 'SITEREMADE_DB_PATH', purpose: 'the SQLite database -- accounts, sessions, projects, daily credits, purchase snapshots, purchase intents, deployment records, entitlements' },
  { key: 'SITEREMADE_ASSET_STORE_DIR', purpose: 'uploaded/generated image bytes referenced by projects and purchase snapshots (asset_blobs)' },
  { key: 'SITEREMADE_EXPORTS_DIR', purpose: 'compiled export .zip artifacts that My Websites re-download links point at' },
];

// A conservative, additive set of signals that this process is running as
// a real deployment rather than a developer's own machine or this repo's
// own test harness (which never sets any of these). NODE_ENV=production
// is the portable signal an operator sets themselves (Railway's dashboard
// lets you set any env var per-service, including NODE_ENV); the
// RAILWAY_* variables are Railway's own auto-injected signals (present on
// every Railway-run service regardless of NODE_ENV), included so a deploy
// that forgets to set NODE_ENV is still caught rather than silently
// passing this check.
function isProductionRuntime(env) {
  return env.NODE_ENV === 'production'
    || !!env.RAILWAY_ENVIRONMENT
    || !!env.RAILWAY_ENVIRONMENT_NAME
    || !!env.RAILWAY_PROJECT_ID;
}

function backendKind(env) {
  return String(env.SITEREMADE_BACKEND || 'local').trim().toLowerCase();
}

// Pure, side-effect-free, independently testable without launching the
// HTTP server or touching a real filesystem -- takes an env object (pass
// process.env in real code, a fake object in tests) and returns either
// {safe:true, reason} or {safe:false, missing:[...]}.
function assessPersistenceSafety(env) {
  if (!isProductionRuntime(env)) return { safe: true, reason: 'not-production-runtime' };
  if (backendKind(env) !== 'local') return { safe: true, reason: 'non-local-backend-fails-closed-independently' };
  const missing = PERSISTENCE_ENV_VARS.filter(v => !env[v.key]);
  if (missing.length === 0) return { safe: true, reason: 'all-persistence-paths-explicit' };
  return { safe: false, missing };
}

function formatUnsafeMessage(assessment) {
  const lines = [
    'FATAL: refusing to start.',
    '',
    'This looks like a production deployment (NODE_ENV=production or a',
    'Railway environment variable is set) using the local SQLite backend',
    '(SITEREMADE_BACKEND=local, the default), but the persistence path(s)',
    'below are not explicitly configured and would default to a location',
    'INSIDE this app\'s own container filesystem -- which most PaaS',
    'platforms, including Railway without an attached Volume, wipe on',
    'every redeploy. Starting anyway would silently risk losing customer',
    'accounts, purchases, and purchased-site downloads on the next deploy.',
    '',
    'Missing:',
  ];
  assessment.missing.forEach(v => lines.push(`  - ${v.key}  (holds: ${v.purpose})`));
  lines.push('');
  lines.push('Fix: attach a Railway persistent Volume (e.g. mounted at /data) and');
  lines.push('set all three variables to paths inside it, e.g.:');
  lines.push('  SITEREMADE_DB_PATH=/data/siteremade.db');
  lines.push('  SITEREMADE_ASSET_STORE_DIR=/data/asset-store');
  lines.push('  SITEREMADE_EXPORTS_DIR=/data/exports');
  lines.push('See PRODUCTION-ADAPTERS.md and SITE-PROJECT-V9-DEPLOYMENT-SAFETY.md.');
  return lines.join('\n');
}

module.exports = { assessPersistenceSafety, formatUnsafeMessage, isProductionRuntime, backendKind, PERSISTENCE_ENV_VARS };
