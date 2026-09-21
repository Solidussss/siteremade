// V8.7: single selection point for which DatabaseAdapter implementation
// server.js/mock-server.js get, driven by SITEREMADE_BACKEND (default
// 'local'). This is the ONLY place that branches on backend kind for the
// database -- see PRODUCTION-ADAPTERS.md.
'use strict';
const { createSqliteAdapter, resetSqliteAdapter } = require('./sqlite-database-adapter.js');
const { getProductionDatabaseAdapter } = require('./production-database-adapter.js');

function backendKind() {
  return String(process.env.SITEREMADE_BACKEND || 'local').trim().toLowerCase();
}

// dbPath is only meaningful for the 'local' backend (a file path or
// ':memory:' -- see lib/db.js). It's ignored for 'production'.
function getDatabaseAdapter(dbPath) {
  const kind = backendKind();
  if (kind === 'local') return createSqliteAdapter(dbPath);
  if (kind === 'production') return getProductionDatabaseAdapter();
  throw new Error(`Unknown SITEREMADE_BACKEND "${kind}" -- expected "local" or "production".`);
}

// Test-only: forces a brand-new 'local' adapter instance. Throws if called
// while SITEREMADE_BACKEND=production -- there is no meaningful "reset" for
// a real database in a test.
function resetDatabaseAdapter(dbPath) {
  const kind = backendKind();
  if (kind !== 'local') throw new Error('resetDatabaseAdapter() is only meaningful for SITEREMADE_BACKEND=local.');
  return resetSqliteAdapter(dbPath);
}

module.exports = { getDatabaseAdapter, resetDatabaseAdapter, backendKind };
