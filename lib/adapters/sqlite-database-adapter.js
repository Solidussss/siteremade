// V8.7: the 'local' DatabaseAdapter implementation. Every statement in this
// file is the EXACT SQL that used to live inline inside lib/auth.js,
// lib/project-store.js, lib/purchase.js, lib/entitlement.js, and
// lib/deployment-store.js -- moved here verbatim (not rewritten) so V8.1-
// V8.6 behavior is byte-for-byte unchanged. Domain modules no longer call
// `db.prepare(...)` directly; they call a named method on the adapter
// object this file returns (see lib/adapters/database-adapter.js for the
// selector, and PRODUCTION-ADAPTERS.md for the full method contract a
// production adapter must satisfy). Grouped by table/domain concern, one
// namespace per concern, exactly mirroring the module that used to own
// each query.
'use strict';
const { getDb, resetDb, nowIso } = require('../db.js');

function createSqliteAdapter(dbPath) {
  const db = getDb(dbPath);

  // A cross-table (or, for entitlements, single-row-but-still-atomic)
  // transaction primitive -- the SAME BEGIN IMMEDIATE/COMMIT/ROLLBACK
  // pattern lib/purchase.js and lib/entitlement.js already hand-rolled
  // inline, now shared in one place so a production adapter has one clear
  // seam to implement its own transaction semantics against.
  function transaction(fn) {
    db.exec('BEGIN IMMEDIATE');
    try {
      const result = fn();
      db.exec('COMMIT');
      return result;
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
  }

  const accounts = {
    // lib/auth.js createAccount
    insert(row) {
      db.prepare('INSERT INTO accounts (id, email, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
        .run(row.id, row.email, row.passwordHash, row.createdAt, row.updatedAt);
    },
    // lib/auth.js createAccount (dup check) + signIn
    findByEmail(email) {
      return db.prepare('SELECT * FROM accounts WHERE email = ?').get(email) || null;
    },
    // lib/auth.js findAccountById -- same narrow column set as the original,
    // plus app_subscription_status (UNIFIED ACCOUNT pass, migrations/
    // 0004_app_subscription_status.sql -- see that file for why this exists
    // and what it does NOT yet mean). Still never selects password_hash.
    findById(id) {
      return db.prepare('SELECT id, email, created_at, app_subscription_status FROM accounts WHERE id = ?').get(id) || null;
    },
  };

  const sessions = {
    // lib/auth.js createSession
    insert(row) {
      db.prepare('INSERT INTO sessions (id, account_id, created_at, expires_at) VALUES (?, ?, ?, ?)')
        .run(row.idHash, row.accountId, row.createdAt, row.expiresAt);
    },
    // lib/auth.js resolveSession -- the account_id/expires_at/email join
    findWithAccountEmail(idHash) {
      return db.prepare('SELECT s.account_id as accountId, s.expires_at as expiresAt, a.email as email FROM sessions s JOIN accounts a ON a.id = s.account_id WHERE s.id = ?').get(idHash) || null;
    },
    // lib/auth.js resolveSession (expired cleanup) + deleteSession
    delete(idHash) {
      db.prepare('DELETE FROM sessions WHERE id = ?').run(idHash);
    },
  };

  const projects = {
    // lib/project-store.js createProject
    // Phase 9: sourceType/sourceUrl/sourceImportedAt/sourceMetadataJson are
    // provenance only (migrations/0007_project_source.sql) -- every existing
    // caller that doesn't pass them gets the column defaults ('new', null,
    // null, null), unchanged from before this migration existed.
    insert(row) {
      db.prepare(`INSERT INTO projects (id, owner_id, name, status, source_local_id, state_json, revision, created_at, updated_at, source_type, source_url, source_imported_at, source_metadata_json)
                  VALUES (?, ?, ?, 'draft', ?, ?, 1, ?, ?, ?, ?, ?, ?)`)
        .run(row.id, row.ownerId, row.name, row.sourceLocalId, row.stateJson, row.createdAt, row.updatedAt,
          row.sourceType || 'new', row.sourceUrl || null, row.sourceImportedAt || null, row.sourceMetadataJson || null);
    },
    // lib/project-store.js listOwnedProjects
    listOwned(ownerId) {
      return db.prepare('SELECT * FROM projects WHERE owner_id = ? ORDER BY updated_at DESC').all(ownerId);
    },
    // lib/project-store.js getOwnedProject / getOwnedProjectRaw / updateOwnedProject / archiveProject
    findOwned(ownerId, projectId) {
      return db.prepare('SELECT * FROM projects WHERE id = ? AND owner_id = ?').get(projectId, ownerId) || null;
    },
    // lib/project-store.js updateOwnedProject's post-update re-read, and
    // lib/purchase.js's own project lookups by id alone (webhook path has
    // no ownerId to check against -- it trusts the purchase_intents row's
    // own owner_id instead, already ownership-bound at intent-creation time)
    findById(id) {
      return db.prepare('SELECT * FROM projects WHERE id = ?').get(id) || null;
    },
    // lib/project-store.js createProject's idempotent-migration lookup
    findOwnedBySourceLocalId(ownerId, sourceLocalId) {
      return db.prepare('SELECT * FROM projects WHERE owner_id = ? AND source_local_id = ?').get(ownerId, sourceLocalId) || null;
    },
    // lib/project-store.js updateOwnedProject -- compare-and-swap on revision
    updateWithRevisionCheck({ id, ownerId, name, stateJson, expectedRevision, updatedAt }) {
      const result = db.prepare(`UPDATE projects SET name = ?, state_json = ?, revision = revision + 1, updated_at = ?
                                  WHERE id = ? AND owner_id = ? AND revision = ?`)
        .run(name, stateJson, updatedAt, id, ownerId, expectedRevision);
      return { changes: result.changes };
    },
    // lib/project-store.js archiveProject -- only a draft may be archived
    archiveDraft(id, updatedAt) {
      const result = db.prepare(`UPDATE projects SET status = 'archived', updated_at = ? WHERE id = ?`).run(updatedAt, id);
      return { changes: result.changes };
    },
    // lib/purchase.js createPurchaseIntent
    markCheckoutPendingFromDraft(id, updatedAt) {
      db.prepare(`UPDATE projects SET status = 'checkout_pending', updated_at = ? WHERE id = ? AND status = 'draft'`).run(updatedAt, id);
    },
    // lib/purchase.js fulfillBySessionId
    markPurchased(id, purchaseRef, updatedAt) {
      db.prepare(`UPDATE projects SET status = 'purchased', purchase_ref = ?, updated_at = ? WHERE id = ?`).run(purchaseRef, updatedAt, id);
    },
    // lib/purchase.js markIntentTerminal -- release an abandoned checkout back to draft
    markDraftFromCheckoutPending(id, updatedAt) {
      db.prepare(`UPDATE projects SET status = 'draft', updated_at = ? WHERE id = ? AND status = 'checkout_pending'`).run(updatedAt, id);
    },
    // lib/deployment-store.js syncProjectDeploymentStatus
    setDeploymentStatus(id, status) {
      db.prepare('UPDATE projects SET deployment_status = ? WHERE id = ?').run(status, id);
    },
  };

  const assetBlobs = {
    // lib/project-store.js internalizeOneEntry / lib/export-compiler.js hydrateAssetsForExport
    find(hash) {
      return db.prepare('SELECT * FROM asset_blobs WHERE hash = ?').get(hash) || null;
    },
    // lib/project-store.js internalizeOneEntry
    insertIfMissing(row) {
      const existing = db.prepare('SELECT hash FROM asset_blobs WHERE hash = ?').get(row.hash);
      if (existing) return;
      db.prepare('INSERT INTO asset_blobs (hash, content_type, byte_length, created_at) VALUES (?, ?, ?, ?)')
        .run(row.hash, row.contentType, row.byteLength, row.createdAt);
    },
  };

  const purchaseIntents = {
    // lib/purchase.js createPurchaseIntent
    insert(row) {
      db.prepare(`INSERT INTO purchase_intents (id, owner_id, project_id, status, amount, currency, created_at, updated_at)
                  VALUES (?, ?, ?, 'pending', ?, ?, ?, ?)`)
        .run(row.id, row.ownerId, row.projectId, row.amount, row.currency, row.createdAt, row.updatedAt);
    },
    // lib/purchase.js attachStripeSession
    attachStripeSession(id, stripeSessionId, updatedAt) {
      db.prepare('UPDATE purchase_intents SET stripe_session_id = ?, updated_at = ? WHERE id = ?').run(stripeSessionId, updatedAt, id);
    },
    // lib/purchase.js getOwnedPurchaseIntent
    findOwned(ownerId, intentId) {
      return db.prepare('SELECT * FROM purchase_intents WHERE id = ? AND owner_id = ?').get(intentId, ownerId) || null;
    },
    // lib/purchase.js fulfillBySessionId / markIntentTerminal
    findByStripeSessionId(stripeSessionId) {
      return db.prepare('SELECT * FROM purchase_intents WHERE stripe_session_id = ?').get(stripeSessionId) || null;
    },
    // lib/purchase.js fulfillBySessionId
    markFulfilled(id, updatedAt) {
      db.prepare(`UPDATE purchase_intents SET status = 'fulfilled', updated_at = ? WHERE id = ? AND status = 'pending'`).run(updatedAt, id);
    },
    // lib/purchase.js markIntentTerminal
    markTerminal(id, status, updatedAt) {
      db.prepare('UPDATE purchase_intents SET status = ?, updated_at = ? WHERE id = ?').run(status, updatedAt, id);
    },
  };

  const entitlements = {
    // lib/entitlement.js ensureRow
    find(accountId) {
      return db.prepare('SELECT * FROM direction_entitlements WHERE account_id = ?').get(accountId) || null;
    },
    // lib/entitlement.js ensureRow
    insertZeroRow(accountId, updatedAt) {
      db.prepare('INSERT INTO direction_entitlements (account_id, used, reserved, updated_at) VALUES (?, 0, 0, ?)').run(accountId, updatedAt);
    },
    // lib/entitlement.js reserveDirection
    incrementReserved(accountId, updatedAt) {
      db.prepare('UPDATE direction_entitlements SET reserved = reserved + 1, updated_at = ? WHERE account_id = ?').run(updatedAt, accountId);
    },
    // lib/entitlement.js commitDirection -- reserved-- (floored at 0), used++
    commitReservedToUsed(accountId, updatedAt) {
      db.prepare('UPDATE direction_entitlements SET reserved = MAX(0, reserved - 1), used = used + 1, updated_at = ? WHERE account_id = ?').run(updatedAt, accountId);
    },
    // lib/entitlement.js releaseDirection -- reserved-- (floored at 0), used unchanged
    releaseReserved(accountId, updatedAt) {
      db.prepare('UPDATE direction_entitlements SET reserved = MAX(0, reserved - 1), updated_at = ? WHERE account_id = ?').run(updatedAt, accountId);
    },
  };

  const credits = {
    // lib/credits.js ensureRow
    find(accountId) {
      return db.prepare('SELECT * FROM credit_ledger WHERE account_id = ?').get(accountId) || null;
    },
    // lib/credits.js ensureRow (first-ever row for this account)
    insertRow(accountId, lastGrantDate, updatedAt) {
      db.prepare('INSERT INTO credit_ledger (account_id, used, reserved, lifetime_used, last_grant_date, updated_at) VALUES (?, 0, 0, 0, ?, ?)').run(accountId, lastGrantDate, updatedAt);
    },
    // lib/credits.js ensureRow -- day rollover: used/reserved reset to 0, never accumulated
    resetForNewDay(accountId, lastGrantDate, updatedAt) {
      db.prepare('UPDATE credit_ledger SET used = 0, reserved = 0, last_grant_date = ?, updated_at = ? WHERE account_id = ?').run(lastGrantDate, updatedAt, accountId);
    },
    // lib/credits.js reserveCredits
    incrementReserved(accountId, cost, updatedAt) {
      db.prepare('UPDATE credit_ledger SET reserved = reserved + ?, updated_at = ? WHERE account_id = ?').run(cost, updatedAt, accountId);
    },
    // lib/credits.js commitCredits -- reserved -= cost (floored at 0), used += cost, lifetime_used += cost
    commitReservedToUsed(accountId, cost, updatedAt) {
      db.prepare('UPDATE credit_ledger SET reserved = MAX(0, reserved - ?), used = used + ?, lifetime_used = lifetime_used + ?, updated_at = ? WHERE account_id = ?').run(cost, cost, cost, updatedAt, accountId);
    },
    // lib/credits.js releaseCredits -- reserved -= cost (floored at 0), used unchanged
    releaseReserved(accountId, cost, updatedAt) {
      db.prepare('UPDATE credit_ledger SET reserved = MAX(0, reserved - ?), updated_at = ? WHERE account_id = ?').run(cost, updatedAt, accountId);
    },
  };

  const purchaseSnapshots = {
    // lib/purchase.js createSnapshotFromRow
    insert(row) {
      db.prepare(`INSERT INTO purchase_snapshots (id, project_id, owner_id, purchase_intent_id, direction_index, state_json, project_revision, hosting_choice_json, created_at)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(row.id, row.projectId, row.ownerId, row.purchaseIntentId, row.directionIndex, row.stateJson, row.projectRevision, row.hostingChoiceJson, row.createdAt);
    },
    // lib/purchase.js fulfillBySessionId / ensureSnapshotForOwnedProject -- one row per project (unique index)
    findByProject(projectId) {
      return db.prepare('SELECT * FROM purchase_snapshots WHERE project_id = ?').get(projectId) || null;
    },
    // lib/purchase.js getOwnedPurchaseSnapshot(Raw) -- ownership-checked read
    findOwnedByProject(ownerId, projectId) {
      return db.prepare('SELECT * FROM purchase_snapshots WHERE project_id = ? AND owner_id = ?').get(projectId, ownerId) || null;
    },
    // lib/purchase.js setSnapshotHostingChoice -- the ONE column ever rewritten after insert (see migration's own comment)
    setHostingChoice(projectId, hostingChoiceJson) {
      db.prepare('UPDATE purchase_snapshots SET hosting_choice_json = ? WHERE project_id = ?').run(hostingChoiceJson, projectId);
    },
    // My Websites aggregate view -- every purchased snapshot this account owns
    listOwned(ownerId) {
      return db.prepare('SELECT * FROM purchase_snapshots WHERE owner_id = ? ORDER BY created_at DESC').all(ownerId);
    },
  };

  const deployments = {
    // lib/deployment-store.js createReadyDeployment
    insertReady(row) {
      db.prepare(`INSERT INTO deployments (id, owner_id, project_id, project_revision, direction_index, compiler_version, artifact_hash, runtime_type, runtime_reasons_json, target, state, manifest_json, artifact_path, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ready', ?, ?, ?, ?)`)
        .run(row.id, row.ownerId, row.projectId, row.projectRevision, row.directionIndex, row.compilerVersion, row.artifactHash, row.runtimeType, row.runtimeReasonsJson, row.target, row.manifestJson, row.artifactPath, row.createdAt, row.updatedAt);
    },
    // lib/deployment-store.js recordFailedDeployment
    insertFailed(row) {
      db.prepare(`INSERT INTO deployments (id, owner_id, project_id, project_revision, direction_index, compiler_version, artifact_hash, runtime_type, runtime_reasons_json, target, state, manifest_json, artifact_path, failure_reason, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'failed', ?, NULL, ?, ?, ?)`)
        .run(row.id, row.ownerId, row.projectId, row.projectRevision, row.directionIndex, row.compilerVersion, row.artifactHash, row.runtimeType, row.runtimeReasonsJson, row.target, row.manifestJson, row.failureReason, row.createdAt, row.updatedAt);
    },
    // lib/deployment-store.js markDeploymentLive
    markLive(id, deployedUrl, updatedAt) {
      db.prepare(`UPDATE deployments SET state = 'live', deployed_url = ?, updated_at = ? WHERE id = ?`).run(deployedUrl, updatedAt, id);
    },
    // lib/deployment-store.js getOwnedDeployment / markDeploymentLive
    findOwned(ownerId, deploymentId) {
      return db.prepare('SELECT * FROM deployments WHERE id = ? AND owner_id = ?').get(deploymentId, ownerId) || null;
    },
    // lib/deployment-store.js listOwnedDeployments
    listOwned(ownerId, projectId) {
      return db.prepare('SELECT * FROM deployments WHERE owner_id = ? AND project_id = ? ORDER BY created_at DESC').all(ownerId, projectId);
    },
    // lib/deployment-store.js getLatestGoodDeployment
    findLatestGood(ownerId, projectId) {
      return db.prepare(`SELECT * FROM deployments WHERE owner_id = ? AND project_id = ? AND state IN ('ready','live') ORDER BY created_at DESC LIMIT 1`).get(ownerId, projectId) || null;
    },
    // lib/deployment-store.js syncProjectDeploymentStatus
    listStatesForProject(projectId) {
      return db.prepare('SELECT state FROM deployments WHERE project_id = ? ORDER BY created_at DESC').all(projectId);
    },
  };

  const domains = {
    // lib/deployment-store.js upsertDomain
    findByProjectAndDomain(projectId, domain) {
      return db.prepare('SELECT * FROM project_domains WHERE project_id = ? AND domain = ?').get(projectId, domain) || null;
    },
    // lib/deployment-store.js upsertDomain (existing row)
    updateForUpsert(id, target, dnsRecordsJson, updatedAt) {
      db.prepare(`UPDATE project_domains SET target = ?, state = 'instructions_generated', dns_records_json = ?, updated_at = ? WHERE id = ?`)
        .run(target, dnsRecordsJson, updatedAt, id);
    },
    // lib/deployment-store.js upsertDomain (new row)
    insert(row) {
      db.prepare(`INSERT INTO project_domains (id, owner_id, project_id, domain, target, state, dns_records_json, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 'instructions_generated', ?, ?, ?)`)
        .run(row.id, row.ownerId, row.projectId, row.domain, row.target, row.dnsRecordsJson, row.createdAt, row.updatedAt);
    },
    // lib/deployment-store.js getOwnedDomain / setDomainState
    findOwned(ownerId, domainId) {
      return db.prepare('SELECT * FROM project_domains WHERE id = ? AND owner_id = ?').get(domainId, ownerId) || null;
    },
    // lib/deployment-store.js listOwnedDomains
    listOwned(ownerId, projectId) {
      return db.prepare('SELECT * FROM project_domains WHERE owner_id = ? AND project_id = ? ORDER BY created_at DESC').all(ownerId, projectId);
    },
    // lib/deployment-store.js setDomainState
    setState(id, state, updatedAt, verifiedAt) {
      db.prepare(`UPDATE project_domains SET state = ?, updated_at = ?, verified_at = ? WHERE id = ?`).run(state, updatedAt, verifiedAt, id);
    },
  };

  // V14 (shared identity bridge pass): lib/identity-links.js's own SQL,
  // moved here verbatim -- same "one namespace per domain module, domain
  // code never calls db.prepare directly" convention every table above
  // already follows. See migrations/0005_identity_links.sql for the two
  // partial unique indexes this namespace relies on for real,
  // constraint-enforced (not just application-checked) uniqueness.
  const identityLinks = {
    // lib/identity-links.js resolveGeneratorAccountForSupabaseUser /
    // createLink's own pre-check
    findActiveBySupabaseUser(supabaseUserId) {
      return db.prepare(`SELECT * FROM identity_links WHERE supabase_user_id = ? AND link_status = 'linked'`).get(supabaseUserId) || null;
    },
    // lib/identity-links.js getLinkStatusForAccount / createLink's own pre-check
    findActiveByAccount(generatorAccountId) {
      return db.prepare(`SELECT * FROM identity_links WHERE generator_account_id = ? AND link_status = 'linked'`).get(generatorAccountId) || null;
    },
    // lib/identity-links.js createLink / lazyProvisionGeneratorAccount --
    // relies on the two partial unique indexes to make a concurrent
    // duplicate-link attempt fail here (caught by the caller's
    // transaction), never silently succeed twice.
    insert(row) {
      db.prepare(`INSERT INTO identity_links (id, generator_account_id, supabase_user_id, link_status, verification_method, migration_version, linked_at, created_at, updated_at)
                  VALUES (?, ?, ?, 'linked', ?, ?, ?, ?, ?)`)
        .run(row.id, row.generatorAccountId, row.supabaseUserId, row.verificationMethod, row.migrationVersion, row.linkedAt, row.createdAt, row.updatedAt);
    },
    // Forward-compatible plumbing: not called by any route in this pass
    // (link reversal is a named future follow-up, not shipped yet -- see
    // SITE-PROJECT-V14-IDENTITY-BRIDGE.md §23), but the row is kept (audit
    // trail), never deleted, when this IS wired up; see this table's own
    // migration comment.
    revoke(id, revokedAt) {
      const result = db.prepare(`UPDATE identity_links SET link_status = 'revoked', revoked_at = ?, updated_at = ? WHERE id = ? AND link_status = 'linked'`).run(revokedAt, revokedAt, id);
      return { changes: result.changes };
    },
  };
  const identityLinkEvents = {
    // lib/identity-links.js logEvent -- append-only, never updated/deleted.
    // NEVER pass a password/token/secret as `reason` -- see that file's own
    // EVENT_REASONS allowlist, which is what actually enforces this.
    insert(row) {
      db.prepare(`INSERT INTO identity_link_events (id, generator_account_id, supabase_user_id, event_type, reason, created_at)
                  VALUES (?, ?, ?, ?, ?, ?)`)
        .run(row.id, row.generatorAccountId || null, row.supabaseUserId || null, row.eventType, row.reason || null, row.createdAt);
    },
    // Test/observability read -- most-recent-first.
    listByAccount(generatorAccountId) {
      return db.prepare(`SELECT * FROM identity_link_events WHERE generator_account_id = ? ORDER BY created_at DESC`).all(generatorAccountId);
    },
  };

  // App bridge pass (Phase 4): lib/published-snapshots.js's own SQL -- see
  // migrations/0006_published_snapshots.sql. Append-only: there is
  // deliberately no update/delete method here.
  const publishedSnapshots = {
    insert(row) {
      db.prepare(`INSERT INTO published_snapshots (id, project_id, owner_id, revision, direction_index, state_json, published_at, created_at)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(row.id, row.projectId, row.ownerId, row.revision, row.directionIndex, row.stateJson, row.publishedAt, row.createdAt);
    },
    // Ownership-scoped "latest published" read -- highest revision wins
    // (revision is monotonic per project), published_at breaks a tie.
    findLatestOwnedByProject(ownerId, projectId) {
      return db.prepare(`SELECT * FROM published_snapshots WHERE owner_id = ? AND project_id = ?
                         ORDER BY revision DESC, published_at DESC LIMIT 1`).get(ownerId, projectId) || null;
    },
  };

  return {
    kind: 'sqlite',
    raw: db, // escape hatch for lib/db.js-level concerns ONLY (migrations); domain code must never use this
    transaction,
    accounts, sessions, projects, assetBlobs, purchaseIntents, entitlements, credits, purchaseSnapshots, deployments, domains,
    identityLinks, identityLinkEvents, publishedSnapshots,
  };
}

// Test-only: mirrors lib/db.js's own resetDb -- forces a brand-new
// underlying connection (used between test contexts that each want a fully
// clean database). Only meaningful for the 'local' backend; a production
// adapter has no equivalent (a real database isn't reset between test
// runs in the same way).
function resetSqliteAdapter(dbPath) {
  resetDb(dbPath);
  return createSqliteAdapter(dbPath);
}

module.exports = { createSqliteAdapter, resetSqliteAdapter, nowIso };
