// V8.7: single selection point for which AssetStore implementation
// lib/project-store.js and lib/export-compiler.js get, driven by the same
// SITEREMADE_BACKEND switch as the database adapter (see database-adapter.js).
// Unlike the database adapter, this is a lazily-initialized module-level
// singleton rather than something threaded through every call site as a
// parameter -- matching how lib/db.js's own `nowIso` is already imported
// directly by every domain file in this repo without being threaded
// through function signatures. Both project-store.js and export-compiler.js
// call getAssetStore() themselves; no server.js/mock-server.js call site
// needs to change.
'use strict';
const { getInstance: getLocalAssetStore } = require('./local-asset-store.js');
const { getProductionAssetStore } = require('./production-asset-store.js');

function backendKind() {
  return String(process.env.SITEREMADE_BACKEND || 'local').trim().toLowerCase();
}

function getAssetStore() {
  const kind = backendKind();
  if (kind === 'local') return getLocalAssetStore();
  if (kind === 'production') return getProductionAssetStore();
  throw new Error(`Unknown SITEREMADE_BACKEND "${kind}" -- expected "local" or "production".`);
}

module.exports = { getAssetStore };
