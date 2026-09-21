// V8.5: durable persistence layer, built on Node's built-in `node:sqlite`
// (Node >=22.5, experimental) -- this sandbox cannot `npm install` (see
// SITE-PROJECT-V8.5.md part 1), so there is no `pg`/`better-sqlite3`/
// `@supabase/supabase-js` available. `node:sqlite` gives a real, in-process
// SQL engine with real transactions and constraints, with zero npm
// dependency -- used here as the honestly-scoped local stand-in for a real
// Postgres/Supabase database (see migrations/0001_init.sql for the
// intended production dialect and the explicit PG: divergence notes).
//
// This module is required by BOTH server.js and mock-server.js -- unlike
// the Claude/OpenAI/Stripe-session-creation mocking elsewhere in this repo
// (which exists because real network access to those providers is blocked
// in this sandbox), nothing in the persistence/auth/purchase-reconciliation
// layer needs external network access, so there is no reason for
// mock-server.js to run a second, parallel, fake implementation of it --
// see lib/README.md.
'use strict';
const { DatabaseSync } = require('node:sqlite');
const fs = require('fs');
const path = require('path');

const MIGRATIONS_DIR = path.join(__dirname, '..', 'migrations');

function nowIso() { return new Date().toISOString(); }

function runMigrations(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (id TEXT PRIMARY KEY, applied_at TEXT NOT NULL)`);
  const applied = new Set(db.prepare('SELECT id FROM schema_migrations').all().map(r => r.id));
  const files = fs.readdirSync(MIGRATIONS_DIR).filter(f => f.endsWith('.sql')).sort();
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
    db.exec('BEGIN');
    try {
      db.exec(sql);
      db.prepare('INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)').run(file, nowIso());
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw new Error(`Migration ${file} failed: ${e.message}`);
    }
  }
}

// One DatabaseSync instance per process, lazily opened. `dbPath` may be a
// real file path (server.js's default -- persists across restarts, exactly
// what "durable" requires) or ':memory:' (used by the test suite so every
// test run starts from a clean, deterministic database with no leftover
// state from a previous run -- see SITE-PROJECT-V8.5.md's "reproducible
// local test setup" requirement).
let dbInstance = null;
let dbInstancePath = null;
function getDb(dbPath) {
  const resolved = dbPath || path.join(__dirname, '..', 'data', 'siteremade.db');
  if (dbInstance && dbInstancePath === resolved) return dbInstance;
  if (dbInstance) { try { dbInstance.close(); } catch (e) { /* already closed */ } }
  if (resolved !== ':memory:') fs.mkdirSync(path.dirname(resolved), { recursive: true });
  dbInstance = new DatabaseSync(resolved);
  dbInstancePath = resolved;
  // WAL isn't meaningfully relevant for :memory: and adds no value for a
  // single-process sandbox server, but is harmless and real-world sane for
  // the file-backed case (fewer writer-blocks-reader situations).
  if (resolved !== ':memory:') { try { dbInstance.exec('PRAGMA journal_mode = WAL'); } catch (e) { /* fine on some fs, ignore */ } }
  dbInstance.exec('PRAGMA foreign_keys = ON');
  runMigrations(dbInstance);
  return dbInstance;
}
// Test-only: force a brand-new instance (used between test files/contexts
// that each want a fully clean database, rather than accumulating state
// across an entire suite run).
function resetDb(dbPath) {
  if (dbInstance) { try { dbInstance.close(); } catch (e) { /* ignore */ } }
  dbInstance = null;
  dbInstancePath = null;
  return getDb(dbPath);
}

module.exports = { getDb, resetDb, nowIso };
