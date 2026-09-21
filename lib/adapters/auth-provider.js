// V8.7: single selection point for which AuthProvider implementation
// server.js/mock-server.js get, driven by the same SITEREMADE_BACKEND
// switch as the database/asset-store adapters (see database-adapter.js).
'use strict';
const localAuthProvider = require('./local-auth-provider.js');
const { getProductionAuthProvider } = require('./production-auth-provider.js');

function backendKind() {
  return String(process.env.SITEREMADE_BACKEND || 'local').trim().toLowerCase();
}

function getAuthProvider() {
  const kind = backendKind();
  if (kind === 'local') return localAuthProvider;
  if (kind === 'production') return getProductionAuthProvider();
  throw new Error(`Unknown SITEREMADE_BACKEND "${kind}" -- expected "local" or "production".`);
}

module.exports = { getAuthProvider };
