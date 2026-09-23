// V8.7: the 'production' DatabaseAdapter contract.
//
// This is intentionally NOT a working production implementation. Per this
// pass's own stop condition: if real production database credentials/
// infrastructure aren't available in this sandbox, build the adapter
// contract and configuration path cleanly, keep the local backend fully
// functional, and document exactly what's needed -- rather than faking a
// connection or attempting a real Postgres/Supabase client integration
// this sandbox can't actually verify.
//
// What's genuinely missing here, confirmed by inspection before writing
// this file:
//   - No SUPABASE_URL/SUPABASE_PUBLISHABLE_KEY/SUPABASE_SECRET_KEY (or any
//     other production DB credential) is configured anywhere in this repo
//     or this sandbox's environment.
//   - `@supabase/supabase-js` (or `pg`) is not installed in this repo's
//     node_modules, and `npm install` is confirmed blocked in this sandbox
//     (see SITE-PROJECT-V8.5.md part 1) -- so even with credentials, this
//     sandbox cannot actually open a real connection to verify one.
//   - The real, separate SiteRemade ops app (a different repository this
//     engagement has separately inspected) already runs on real Supabase
//     Postgres with exactly this env var naming
//     (SUPABASE_URL/SUPABASE_PUBLISHABLE_KEY/SUPABASE_SECRET_KEY -- see its
//     lib/context.js). This adapter deliberately reuses those SAME names
//     rather than inventing new ones, so a real deployment that wants this
//     generator to share infrastructure with that app doesn't have to
//     reconcile two different naming schemes.
//
// getProductionDatabaseAdapter() therefore does exactly two things: (1)
// validate that the required config is present, throwing a clear, specific
// error immediately (fail closed) if it is not -- NEVER silently falling
// back to the local SQLite adapter; (2) if config IS present, attempt to
// load `@supabase/supabase-js` and fail with an equally clear error if it
// isn't installed, rather than pretending to connect.
//
// The method surface below documents the exact contract a real
// implementation must satisfy -- one method per lib/adapters/
// sqlite-database-adapter.js method, same namespaces, same argument/return
// shapes. A future real implementation replaces the body of each method
// (typically a handful of Supabase `.from(table)...` calls, following the
// exact patterns already established in the real app's own server.js) --
// domain code (lib/auth.js, lib/project-store.js, lib/purchase.js,
// lib/entitlement.js, lib/deployment-store.js) needs ZERO changes to run
// against it, because it only ever calls these named methods, never raw
// SQL.
'use strict';

const REQUIRED_ENV = ['SUPABASE_URL', 'SUPABASE_SECRET_KEY'];

function missingConfig() {
  return REQUIRED_ENV.filter(name => !process.env[name]);
}

function notImplemented(method) {
  return function () {
    throw new Error(
      `Production DatabaseAdapter method "${method}" is not implemented in this sandbox. ` +
      `See lib/adapters/production-database-adapter.js and PRODUCTION-ADAPTERS.md for the ` +
      `exact contract this method must satisfy (mirrors lib/adapters/sqlite-database-adapter.js).`
    );
  };
}

function getProductionDatabaseAdapter() {
  const missing = missingConfig();
  if (missing.length) {
    throw new Error(
      `SITEREMADE_BACKEND=production requires ${REQUIRED_ENV.join(', ')} to be set ` +
      `(missing: ${missing.join(', ')}). Refusing to start rather than silently falling back ` +
      `to the local SQLite backend -- see PRODUCTION-ADAPTERS.md.`
    );
  }
  // Config is present, but this sandbox cannot npm install a real Supabase
  // client to verify a connection (see this file's header) -- fail closed
  // with a specific, actionable error rather than pretending to connect.
  let supabaseModule;
  try {
    supabaseModule = require('@supabase/supabase-js');
  } catch (e) {
    throw new Error(
      `SITEREMADE_BACKEND=production requires the "@supabase/supabase-js" package, which is not ` +
      `installed in this environment. Install it (npm install @supabase/supabase-js), then ` +
      `implement the methods documented in lib/adapters/production-database-adapter.js. ` +
      `See PRODUCTION-ADAPTERS.md for the full checklist.`
    );
  }
  // Deliberately not implemented further -- see this file's header. A real
  // deployment replaces everything below with genuine
  // supabaseModule.createClient(...) -backed query methods, one per
  // namespace/method below, matching lib/adapters/sqlite-database-adapter.js's
  // exact contract.
  const methods = [
    'accounts.insert', 'accounts.findByEmail', 'accounts.findById',
    'sessions.insert', 'sessions.findWithAccountEmail', 'sessions.delete',
    'projects.insert', 'projects.listOwned', 'projects.findOwned', 'projects.findById',
    'projects.findOwnedBySourceLocalId', 'projects.updateWithRevisionCheck', 'projects.archiveDraft',
    'projects.markCheckoutPendingFromDraft', 'projects.markPurchased', 'projects.markDraftFromCheckoutPending',
    'projects.setDeploymentStatus',
    'assetBlobs.find', 'assetBlobs.insertIfMissing',
    'purchaseIntents.insert', 'purchaseIntents.attachStripeSession', 'purchaseIntents.findOwned',
    'purchaseIntents.findByStripeSessionId', 'purchaseIntents.markFulfilled', 'purchaseIntents.markTerminal',
    'entitlements.find', 'entitlements.insertZeroRow', 'entitlements.incrementReserved',
    'entitlements.commitReservedToUsed', 'entitlements.releaseReserved',
    'credits.find', 'credits.insertRow', 'credits.resetForNewDay', 'credits.incrementReserved',
    'credits.commitReservedToUsed', 'credits.releaseReserved',
    'purchaseSnapshots.insert', 'purchaseSnapshots.findByProject', 'purchaseSnapshots.findOwnedByProject',
    'purchaseSnapshots.setHostingChoice', 'purchaseSnapshots.listOwned',
    'deployments.insertReady', 'deployments.insertFailed', 'deployments.markLive', 'deployments.findOwned',
    'deployments.listOwned', 'deployments.findLatestGood', 'deployments.listStatesForProject',
    'domains.findByProjectAndDomain', 'domains.updateForUpsert', 'domains.insert', 'domains.findOwned',
    'domains.listOwned', 'domains.setState',
    // App bridge pass (Phase 4): migrations/0006_published_snapshots.sql.
    'publishedSnapshots.insert', 'publishedSnapshots.findLatestOwnedByProject',
  ];
  const adapter = { kind: 'production', raw: supabaseModule, transaction: notImplemented('transaction') };
  methods.forEach(path => {
    const [ns, method] = path.split('.');
    adapter[ns] = adapter[ns] || {};
    adapter[ns][method] = notImplemented(path);
  });
  return adapter;
}

module.exports = { getProductionDatabaseAdapter, REQUIRED_ENV };
