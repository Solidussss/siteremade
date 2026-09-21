// V8.7: the 'production' AssetStore contract. Same stop-condition
// discipline as lib/adapters/production-database-adapter.js: no real
// object-storage credentials/config exist anywhere in this repo or
// sandbox, and `@supabase/supabase-js` isn't installed here to verify a
// connection even if some were added -- so this fails closed with a clear,
// specific error rather than faking a connection.
//
// The real app this generator will eventually sit alongside already uses
// Supabase (see production-database-adapter.js's header) -- Supabase
// Storage is the natural real target for this store (a bucket, addressed
// the same way: put(buffer) -> upload to `${hash}`, get(hash) -> download,
// exists/delete/stat map onto Supabase Storage's own object-metadata
// calls). SITEREMADE_ASSET_BUCKET names which bucket. Required env vars
// reuse SUPABASE_URL/SUPABASE_SECRET_KEY from the database adapter (the
// same project's service-role key covers Storage too) rather than
// inventing a second credential scheme.
'use strict';

const REQUIRED_ENV = ['SUPABASE_URL', 'SUPABASE_SECRET_KEY', 'SITEREMADE_ASSET_BUCKET'];

function missingConfig() {
  return REQUIRED_ENV.filter(name => !process.env[name]);
}

function notImplemented(method) {
  return function () {
    throw new Error(
      `Production AssetStore method "${method}" is not implemented in this sandbox. ` +
      `See lib/adapters/production-asset-store.js and PRODUCTION-ADAPTERS.md.`
    );
  };
}

function getProductionAssetStore() {
  const missing = missingConfig();
  if (missing.length) {
    throw new Error(
      `SITEREMADE_BACKEND=production requires ${REQUIRED_ENV.join(', ')} for asset storage ` +
      `(missing: ${missing.join(', ')}). Refusing to start rather than silently falling back ` +
      `to local filesystem asset storage -- see PRODUCTION-ADAPTERS.md.`
    );
  }
  try {
    require('@supabase/supabase-js');
  } catch (e) {
    throw new Error(
      `SITEREMADE_BACKEND=production requires "@supabase/supabase-js" for Supabase Storage, ` +
      `which is not installed in this environment. See PRODUCTION-ADAPTERS.md.`
    );
  }
  return {
    kind: 'production',
    bucket: process.env.SITEREMADE_ASSET_BUCKET,
    put: notImplemented('put'),
    get: notImplemented('get'),
    exists: notImplemented('exists'),
    delete: notImplemented('delete'),
    stat: notImplemented('stat'),
  };
}

module.exports = { getProductionAssetStore, REQUIRED_ENV };
