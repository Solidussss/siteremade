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

test('a database at 0007 upgrades by applying 0008 and then 0009, keeping existing rows', () => {
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
    assert.deepEqual(fresh, ['0008_generation_events.sql', '0009_credit_ledger.sql', '0010_credits_ownership.sql', '0011_premium_jobs.sql', '0012_premium_sources.sql'], 'only the newer migrations ran');
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

// BILLING PASS: live production is at 0008. The credit ledger arrives as 0009 and must leave every existing project,
// purchase, snapshot and published revision exactly as it was -- and a purchase made before the upgrade still exports.
test('a database at live 0008 upgrades by applying only 0009; purchases, snapshots and projects survive untouched', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sr-migrate-'));
  const dbPath = path.join(dir, 'live.db');
  const pre = new DatabaseSync(dbPath);
  pre.exec('CREATE TABLE IF NOT EXISTS schema_migrations (id TEXT PRIMARY KEY, applied_at TEXT NOT NULL)');
  for (const f of files().filter(f => f < '0009')) {
    pre.exec(fs.readFileSync(path.join(MIGRATIONS_DIR, f), 'utf8'));
    pre.prepare('INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)').run(f, '2026-01-01T00:00:00.000Z');
  }
  const now = '2026-01-01T00:00:00.000Z';
  const state = JSON.stringify({ directions: [{ business: { name: 'Bought' }, pages: [] }], activeDirectionIndex: 0 });
  pre.prepare('INSERT INTO accounts (id, email, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)').run('acct_1', 'a@example.com', 'scrypt:x:y', now, now);
  pre.prepare("INSERT INTO projects (id, owner_id, name, status, purchase_ref, state_json, revision, created_at, updated_at) VALUES ('proj_bought', 'acct_1', 'Bought', 'purchased', 'cs_test_1', ?, 3, ?, ?)").run(state, now, now);
  pre.prepare("INSERT INTO projects (id, owner_id, name, state_json, created_at, updated_at) VALUES ('proj_draft', 'acct_1', 'Draft', ?, ?, ?)").run(state, now, now);
  pre.prepare("INSERT INTO purchase_intents (id, owner_id, project_id, stripe_session_id, status, amount, currency, created_at, updated_at) VALUES ('pi_1', 'acct_1', 'proj_bought', 'cs_test_1', 'fulfilled', 14999, 'cad', ?, ?)").run(now, now);
  pre.prepare("INSERT INTO purchase_snapshots (id, project_id, owner_id, purchase_intent_id, direction_index, state_json, project_revision, created_at) VALUES ('snap_1', 'proj_bought', 'acct_1', 'pi_1', 0, ?, 3, ?)").run(state, now);
  pre.prepare("INSERT INTO credit_ledger (account_id, used, reserved, lifetime_used, last_grant_date, updated_at) VALUES ('acct_1', 4, 0, 12, '2026-01-01', ?)").run(now);
  const before = t => pre.prepare(`SELECT * FROM ${t} ORDER BY 1`).all();
  const snapshot = { projects: before('projects'), purchase_intents: before('purchase_intents'), purchase_snapshots: before('purchase_snapshots'), credit_ledger: before('credit_ledger') };
  pre.close();

  process.env.SITEREMADE_BACKEND = 'local';
  const { resetDatabaseAdapter } = require('../lib/adapters/database-adapter');
  const db = resetDatabaseAdapter(dbPath);
  try {
    const raw = db.raw;
    const applied = raw.prepare('SELECT id, applied_at FROM schema_migrations ORDER BY id').all();
    assert.deepEqual(applied.filter(r => r.applied_at !== now).map(r => r.id), ['0009_credit_ledger.sql', '0010_credits_ownership.sql', '0011_premium_jobs.sql', '0012_premium_sources.sql']);
    assert.deepEqual(raw.prepare('SELECT * FROM projects ORDER BY 1').all(), snapshot.projects, 'projects are unchanged');
    assert.deepEqual(raw.prepare('SELECT * FROM purchase_snapshots ORDER BY 1').all(), snapshot.purchase_snapshots, 'purchase snapshots are unchanged');
    assert.deepEqual(raw.prepare('SELECT * FROM credit_ledger ORDER BY 1').all(), snapshot.credit_ledger, 'the old daily counter is kept for history');
    const intents = raw.prepare('SELECT * FROM purchase_intents ORDER BY 1').all();
    assert.equal(intents.length, 1);
    const plain = rows => JSON.parse(JSON.stringify(rows));
    assert.deepEqual(plain(intents.map(r => { const o = Object.assign({}, r); delete o.state_json; delete o.project_revision; delete o.kind; delete o.payment_intent_id; delete o.bonus_grant_id; delete o.refunded_at; return o; })), plain(snapshot.purchase_intents), 'purchase records are unchanged');
    assert.equal(intents[0].state_json, null, 'the new agreed-state column is empty for an old purchase');
    // the purchased website is still purchased and still resolves its snapshot through the domain code
    const purchase = require('../lib/purchase');
    assert.equal(purchase.getOwnedPurchaseSnapshotRaw(db, 'acct_1', 'proj_bought').projectRevision, 3);
    // and the account starts on the new ledger with its one-time trial (existing accounts included)
    const credits = require('../lib/credits');
    credits.ensureGrants(db, 'acct_1', { trialCredits: 6, testerDailyCredits: 0, subscription: null });
    assert.equal(credits.available(db, 'acct_1').total, 6);
  } finally {
    resetDatabaseAdapter(':memory:');
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// OWNERSHIP + CREDITS: live production is at 0009 (Workspace-subscription credits). 0010 is additive: every owned website,
// snapshot, grant (a legacy Workspace month included) and operation survives; the old purchase still exports; the
// account's balance is unchanged; nothing is re-granted.
test('a database at live 0009 upgrades by applying only 0010; owned websites, grants and operations survive untouched', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sr-migrate-'));
  const dbPath = path.join(dir, 'live.db');
  const pre = new DatabaseSync(dbPath);
  pre.exec('CREATE TABLE IF NOT EXISTS schema_migrations (id TEXT PRIMARY KEY, applied_at TEXT NOT NULL)');
  for (const f of files().filter(f => f < '0010')) {
    pre.exec(fs.readFileSync(path.join(MIGRATIONS_DIR, f), 'utf8'));
    pre.prepare('INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)').run(f, '2026-01-01T00:00:00.000Z');
  }
  const now = '2026-01-01T00:00:00.000Z';
  const state = JSON.stringify({ directions: [{ business: { name: 'Bought' }, pages: [] }], activeDirectionIndex: 0 });
  pre.prepare('INSERT INTO accounts (id, email, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)').run('acct_1', 'a@example.com', 'scrypt:x:y', now, now);
  pre.prepare("INSERT INTO projects (id, owner_id, name, status, purchase_ref, state_json, revision, created_at, updated_at) VALUES ('proj_bought', 'acct_1', 'Bought', 'purchased', 'cs_test_1', ?, 3, ?, ?)").run(state, now, now);
  pre.prepare("INSERT INTO purchase_intents (id, owner_id, project_id, stripe_session_id, status, amount, currency, created_at, updated_at) VALUES ('pi_1', 'acct_1', 'proj_bought', 'cs_test_1', 'fulfilled', 14999, 'cad', ?, ?)").run(now, now);
  pre.prepare("INSERT INTO purchase_snapshots (id, project_id, owner_id, purchase_intent_id, direction_index, state_json, project_revision, created_at) VALUES ('snap_1', 'proj_bought', 'acct_1', 'pi_1', 0, ?, 3, ?)").run(state, now);
  pre.prepare("INSERT INTO credit_grants (id, account_id, kind, amount, starts_at, expires_at, revoked_at, source, created_at) VALUES ('trial:acct_1', 'acct_1', 'trial', 6, '1970-01-01T00:00:00.000Z', NULL, NULL, 'free trial', ?)").run(now);
  pre.prepare("INSERT INTO credit_grants (id, account_id, kind, amount, starts_at, expires_at, revoked_at, source, created_at) VALUES ('sub:sub_1:2026-01-01T00:00:00.000Z', 'acct_1', 'subscription', 100, '2026-01-01T00:00:00.000Z', '2099-01-01T00:00:00.000Z', NULL, 'Workspace subscription sub_1', ?)").run(now);
  pre.prepare("INSERT INTO credit_operations (op_id, account_id, kind, amount, status, job_id, provider_usd, expires_at, created_at, updated_at) VALUES ('gen:1', 'acct_1', 'business_generation', 2, 'committed', NULL, 0.05, ?, ?, ?)").run(now, now, now);
  pre.prepare("INSERT INTO credit_allocations (op_id, grant_id, amount) VALUES ('gen:1', 'sub:sub_1:2026-01-01T00:00:00.000Z', 2)").run();
  const before = t => pre.prepare(`SELECT * FROM ${t} ORDER BY 1`).all();
  const snapshot = { projects: before('projects'), purchase_snapshots: before('purchase_snapshots'), credit_grants: before('credit_grants'), credit_operations: before('credit_operations'), credit_allocations: before('credit_allocations') };
  pre.close();

  process.env.SITEREMADE_BACKEND = 'local';
  const { resetDatabaseAdapter } = require('../lib/adapters/database-adapter');
  const db = resetDatabaseAdapter(dbPath);
  try {
    const raw = db.raw;
    const plain = rows => JSON.parse(JSON.stringify(rows));
    assert.deepEqual(raw.prepare('SELECT id, applied_at FROM schema_migrations ORDER BY id').all().filter(r => r.applied_at !== now).map(r => r.id), ['0010_credits_ownership.sql', '0011_premium_jobs.sql', '0012_premium_sources.sql']);
    for (const t of Object.keys(snapshot)) assert.deepEqual(plain(raw.prepare(`SELECT * FROM ${t} ORDER BY 1`).all()), plain(snapshot[t]), `${t} is unchanged`);
    const purchase = require('../lib/purchase');
    assert.equal(purchase.getOwnedPurchaseSnapshotRaw(db, 'acct_1', 'proj_bought').projectRevision, 3, 'the purchased website still resolves its snapshot');
    const credits = require('../lib/credits');
    assert.equal(credits.available(db, 'acct_1', '2026-06-01T00:00:00.000Z').total, 6 + 98, 'the trial and the legacy Workspace month keep exactly what they had');
    credits.ensureGrants(db, 'acct_1', { trialCredits: 6, testerDailyCredits: 0, subscription: null }, '2026-06-01T00:00:00.000Z');
    assert.equal(credits.available(db, 'acct_1', '2026-06-01T00:00:00.000Z').total, 104, 'nothing is granted twice');
    // the audit trail is append-only
    db.creditEvents.append({ accountId: 'acct_1', type: 'admin_adjustment', amount: 1, reason: 'test', createdAt: now });
    assert.throws(() => raw.prepare('UPDATE credit_events SET amount = 99').run(), /append-only/);
    assert.throws(() => raw.prepare('DELETE FROM credit_events').run(), /append-only/);
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
