// Migration numbering and the upgrade path production actually takes.
//
// lib/db.js applies every migrations/*.sql not yet in schema_migrations, in
// filename order, keyed by filename. Live production (Railway, SQLite on the
// /data volume) is already at 0007_project_source.sql, so the generation-
// events table must arrive as 0008 -- a second "0007_*" would sort BEFORE
// 0007_project_source.sql and make the numbering ambiguous.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const MIGRATIONS_DIR = path.join(__dirname, '..', 'migrations');
const files = () => fs.readdirSync(MIGRATIONS_DIR).filter(f => f.endsWith('.sql')).sort();

test('migration numbers are unique and contiguous, with generation events at 0008 after 0007_project_source', () => {
  const list = files();
  const numbers = list.map(f => f.slice(0, 4));
  assert.ok(list.every(f => /^\d{4}_[a-z0-9_]+\.sql$/.test(f)), 'every migration is NNNN_name.sql');
  assert.equal(new Set(numbers).size, numbers.length, `duplicate migration number in ${list.join(', ')}`);
  numbers.forEach((n, i) => assert.equal(Number(n), i + 1, `migration numbering has a gap or reorder at ${list[i]}`));
  assert.ok(list.includes('0007_project_source.sql'), 'the live 0007 migration is untouched');
  assert.ok(list.includes('0008_generation_events.sql'), 'generation events is the next number');
  assert.ok(!list.includes('0007_generation_events.sql'), 'the old conflicting number is gone');
  assert.ok(list.indexOf('0008_generation_events.sql') > list.indexOf('0007_project_source.sql'));
});

test('nothing in the code still points at the old migration name', () => {
  for (const file of ['lib/generation-events.js', 'lib/adapters/sqlite-database-adapter.js', 'lib/adapters/production-database-adapter.js']) {
    const src = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
    assert.ok(!src.includes('0007_generation_events'), `${file} still references 0007_generation_events`);
  }
});

test('a database already at live 0007 upgrades by applying only 0008, keeping existing rows', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sr-migrate-'));
  const dbPath = path.join(dir, 'live.db');
  // Build the database exactly as live production has it: 0001..0007 applied
  // through the same schema_migrations bookkeeping lib/db.js uses.
  const pre = new DatabaseSync(dbPath);
  pre.exec('CREATE TABLE IF NOT EXISTS schema_migrations (id TEXT PRIMARY KEY, applied_at TEXT NOT NULL)');
  for (const f of files().filter(f => f < '0008')) {
    pre.exec(fs.readFileSync(path.join(MIGRATIONS_DIR, f), 'utf8'));
    pre.prepare('INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)').run(f, '2026-01-01T00:00:00.000Z');
  }
  const now = '2026-01-01T00:00:00.000Z';
  pre.prepare('INSERT INTO accounts (id, email, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)').run('acct_1', 'a@example.com', 'scrypt:x:y', now, now);
  pre.prepare("INSERT INTO projects (id, owner_id, name, state_json, source_type, source_url, created_at, updated_at) VALUES (?, ?, ?, ?, 'redesign', ?, ?, ?)")
    .run('proj_1', 'acct_1', 'Existing', '{}', 'https://example.com', now, now);
  assert.equal(pre.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE name = 'generation_events'").get().n, 0);
  pre.close();

  process.env.SITEREMADE_BACKEND = 'local';
  const { resetDatabaseAdapter } = require('../lib/adapters/database-adapter');
  const db = resetDatabaseAdapter(dbPath);
  try {
    const raw = db.raw;
    const applied = raw.prepare('SELECT id, applied_at FROM schema_migrations ORDER BY id').all();
    assert.deepEqual(applied.map(r => r.id), files());
    const fresh = applied.filter(r => r.applied_at !== now).map(r => r.id);
    assert.deepEqual(fresh, ['0008_generation_events.sql'], 'only the new migration ran');
    const project = raw.prepare('SELECT source_type, source_url FROM projects WHERE id = ?').get('proj_1');
    assert.equal(project.source_type, 'redesign', 'live 0007 provenance data survives the upgrade');
    assert.equal(project.source_url, 'https://example.com');

    const { createGenerationEvents } = require('../lib/generation-events');
    const events = createGenerationEvents(db);
    events.record({ kind: 'image', outcome: 'delivered', accountId: 'acct_1', projectId: 'proj_1', requestKey: 'p::hero::k1', assetHash: 'abc', model: 'gpt-image-1', quality: 'medium' });
    const found = events.findDeliveredImage('acct_1', 'p::hero::k1');
    assert.ok(found && found.asset_hash === 'abc', 'the upgraded database serves image replay');
  } finally {
    resetDatabaseAdapter(':memory:');
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('re-opening an up-to-date database applies nothing', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sr-migrate-'));
  const dbPath = path.join(dir, 'fresh.db');
  process.env.SITEREMADE_BACKEND = 'local';
  const { resetDatabaseAdapter } = require('../lib/adapters/database-adapter');
  try {
    const first = resetDatabaseAdapter(dbPath).raw.prepare('SELECT id, applied_at FROM schema_migrations ORDER BY id').all();
    assert.deepEqual(first.map(r => r.id), files());
    resetDatabaseAdapter(':memory:');
    const second = resetDatabaseAdapter(dbPath).raw.prepare('SELECT id, applied_at FROM schema_migrations ORDER BY id').all();
    assert.deepEqual(second, first);
  } finally {
    resetDatabaseAdapter(':memory:');
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
