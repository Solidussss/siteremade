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
  // Re-entrant: a transaction inside a transaction becomes a savepoint, so a domain step that needs two ledger
  // writes to succeed or fail together (a Creative job's two reservations) can wrap functions that are themselves
  // transactional. The outermost call is unchanged (BEGIN IMMEDIATE ... COMMIT / ROLLBACK).
  let depth = 0;
  function transaction(fn) {
    const sp = depth > 0 ? `sr_sp_${depth}` : null;
    db.exec(sp ? `SAVEPOINT ${sp}` : 'BEGIN IMMEDIATE');
    depth++;
    try {
      const result = fn();
      depth--;
      db.exec(sp ? `RELEASE ${sp}` : 'COMMIT');
      return result;
    } catch (e) {
      depth--;
      db.exec(sp ? `ROLLBACK TO ${sp}; RELEASE ${sp}` : 'ROLLBACK');
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
    // lib/published-snapshots.js listLatestOwnedPublishedRevisions -- one row per project, no state_json
    listLatestRevisionsOwned(ownerId) {
      return db.prepare('SELECT project_id, MAX(revision) AS revision FROM published_snapshots WHERE owner_id = ? GROUP BY project_id').all(ownerId);
    },
  };

  // Generation diagnostics -- lib/generation-events.js's own SQL; see
  // migrations/0008_generation_events.sql. Append-only apart from the
  // age-based retention prune.
  const generationEvents = {
    insert(row) {
      db.prepare(`INSERT INTO generation_events (id, created_at, kind, outcome, account_id, project_id, request_key, provider, model, quality,
                    latency_ms, estimated_cost_usd, credits_charged, asset_hash, detail_json)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(row.id, row.createdAt, row.kind, row.outcome, row.accountId, row.projectId, row.requestKey, row.provider, row.model, row.quality,
          row.latencyMs, row.estimatedCostUsd, row.creditsCharged, row.assetHash, row.detailJson);
    },
    // The most recent image this account already paid for under this exact
    // request key (browser project id + slot + plan cacheKey) -- what makes a
    // retry or a reload idempotent instead of a second paid call.
    findLatestDeliveredImage(accountId, requestKey) {
      return db.prepare(`SELECT * FROM generation_events WHERE kind = 'image' AND outcome = 'delivered' AND account_id = ? AND request_key = ?
                         AND asset_hash IS NOT NULL ORDER BY created_at DESC LIMIT 1`).get(accountId, requestKey) || null;
    },
    listRecent({ limit = 200, kind = null, accountId = null, projectId = null } = {}) {
      const where = [], args = [];
      if (kind) { where.push('kind = ?'); args.push(kind); }
      if (accountId) { where.push('account_id = ?'); args.push(accountId); }
      if (projectId) { where.push('project_id = ?'); args.push(projectId); }
      const sql = `SELECT * FROM generation_events ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY created_at DESC LIMIT ?`;
      return db.prepare(sql).all(...args, Math.max(1, Math.min(1000, Number(limit) || 200)));
    },
    deleteOlderThan(isoCutoff) {
      return db.prepare('DELETE FROM generation_events WHERE created_at < ?').run(isoCutoff).changes;
    },
  };

  // lib/credits.js (the authoritative ledger) and lib/creative-jobs.js -- migrations/0009_credit_ledger.sql
  const ledger = {
    insertGrantIfNew(g) {
      return db.prepare('INSERT OR IGNORE INTO credit_grants (id, account_id, kind, amount, starts_at, expires_at, revoked_at, source, created_at) VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?)')
        .run(g.id, g.accountId, g.kind, g.amount, g.startsAt, g.expiresAt || null, g.source || null, g.createdAt).changes;
    },
    findGrant(id) { return db.prepare('SELECT * FROM credit_grants WHERE id = ?').get(id) || null; },
    grantsForAccount(accountId) { return db.prepare('SELECT * FROM credit_grants WHERE account_id = ? ORDER BY created_at').all(accountId); },
    revokeGrant(id, ts) { return db.prepare('UPDATE credit_grants SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL').run(ts, id).changes; },
    // what a grant has already given out: committed operations, and reservations that have not expired
    usedOnGrant(grantId, nowIso) {
      const r = db.prepare(`SELECT COALESCE(SUM(a.amount), 0) AS n FROM credit_allocations a JOIN credit_operations o ON o.op_id = a.op_id
        WHERE a.grant_id = ? AND (o.status = 'committed' OR (o.status = 'reserved' AND o.expires_at > ?))`).get(grantId, nowIso);
      return r ? r.n : 0;
    },
    findOp(opId) { return db.prepare('SELECT * FROM credit_operations WHERE op_id = ?').get(opId) || null; },
    insertOp(o) {
      db.prepare('INSERT INTO credit_operations (op_id, account_id, kind, amount, status, job_id, provider_usd, expires_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?)')
        .run(o.opId, o.accountId, o.kind, o.amount, o.status, o.jobId || null, o.expiresAt, o.createdAt, o.createdAt);
    },
    insertAllocation(opId, grantId, amount) { db.prepare('INSERT INTO credit_allocations (op_id, grant_id, amount) VALUES (?, ?, ?)').run(opId, grantId, amount); },
    deleteAllocations(opId) { db.prepare('DELETE FROM credit_allocations WHERE op_id = ?').run(opId); },
    deleteOp(opId) { db.prepare('DELETE FROM credit_allocations WHERE op_id = ?').run(opId); db.prepare('DELETE FROM credit_operations WHERE op_id = ?').run(opId); },
    allocationsForOp(opId) { return db.prepare('SELECT * FROM credit_allocations WHERE op_id = ?').all(opId); },
    setOpStatus(opId, from, to, ts) { return db.prepare('UPDATE credit_operations SET status = ?, updated_at = ? WHERE op_id = ? AND status = ?').run(to, ts, opId, from).changes; },
    setOpExpiry(opId, expiresAt, ts) { db.prepare('UPDATE credit_operations SET expires_at = ?, updated_at = ? WHERE op_id = ?').run(expiresAt, ts, opId); },
    addProviderUsd(opId, usd, ts) { db.prepare('UPDATE credit_operations SET provider_usd = provider_usd + ?, updated_at = ? WHERE op_id = ?').run(usd, ts, opId); },
    // reservations nobody settled (a crash, an abandoned job) become 'released' once they expire
    releaseExpired(nowIso, ts) { return db.prepare("UPDATE credit_operations SET status = 'released', updated_at = ? WHERE status = 'reserved' AND expires_at <= ?").run(ts, nowIso).changes; },
    opsForAccount(accountId, limit) { return db.prepare('SELECT * FROM credit_operations WHERE account_id = ? ORDER BY created_at DESC LIMIT ?').all(accountId, Math.max(1, Math.min(500, limit || 50))); },
    opsForJob(jobId) { return db.prepare('SELECT * FROM credit_operations WHERE job_id = ? ORDER BY created_at').all(jobId); },
    insertJob(j) { db.prepare('INSERT INTO creative_jobs (id, account_id, status, research_runs, directions, result_json, expires_at, created_at, updated_at) VALUES (?, ?, ?, 0, 0, NULL, ?, ?, ?)').run(j.id, j.accountId, j.status, j.expiresAt, j.createdAt, j.createdAt); },
    findJob(id) { return db.prepare('SELECT * FROM creative_jobs WHERE id = ?').get(id) || null; },
    updateJob(id, fields, ts) {
      const keys = Object.keys(fields).filter(k => ['status', 'research_runs', 'directions', 'result_json', 'expires_at'].includes(k));
      if (!keys.length) return 0;
      return db.prepare(`UPDATE creative_jobs SET ${keys.map(k => `${k} = ?`).join(', ')}, updated_at = ? WHERE id = ?`).run(...keys.map(k => fields[k]), ts, id).changes;
    },
    // a job may only move from the state the caller read (no two directions at once)
    claimJob(id, from, to, ts) { return db.prepare('UPDATE creative_jobs SET status = ?, updated_at = ? WHERE id = ? AND status = ?').run(to, ts, id, from).changes; },
    findEntitlement(accountId) { return db.prepare('SELECT * FROM billing_entitlements WHERE account_id = ?').get(accountId) || null; },
    upsertEntitlement(e) {
      db.prepare(`INSERT INTO billing_entitlements (account_id, supabase_user_id, workspace_id, subscription_id, status, period_start, period_end, cancel_at_period_end, checked_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(account_id) DO UPDATE SET supabase_user_id = excluded.supabase_user_id, workspace_id = excluded.workspace_id,
        subscription_id = excluded.subscription_id, status = excluded.status, period_start = excluded.period_start, period_end = excluded.period_end,
        cancel_at_period_end = excluded.cancel_at_period_end, checked_at = excluded.checked_at`)
        .run(e.accountId, e.supabaseUserId || null, e.workspaceId || null, e.subscriptionId || null, e.status, e.periodStart || null, e.periodEnd || null, e.cancelAtPeriodEnd ? 1 : 0, e.checkedAt);
    },
  };
  // the agreed deliverable of a checkout (migrations/0009): frozen when checkout starts
  purchaseIntents.setAgreedState = (intentId, stateJson, revision) => {
    db.prepare('UPDATE purchase_intents SET state_json = ?, project_revision = ? WHERE id = ?').run(stateJson, revision, intentId);
  };
  purchaseIntents.findById = id => db.prepare('SELECT * FROM purchase_intents WHERE id = ?').get(id) || null;
  purchaseIntents.listPendingForProject = projectId => db.prepare("SELECT * FROM purchase_intents WHERE project_id = ? AND status = 'pending' ORDER BY created_at").all(projectId);

  return {
    kind: 'sqlite',
    raw: db, // escape hatch for lib/db.js-level concerns ONLY (migrations); domain code must never use this
    transaction,
    accounts, sessions, projects, assetBlobs, purchaseIntents, entitlements, credits, purchaseSnapshots, deployments, domains,
    identityLinks, identityLinkEvents, publishedSnapshots, generationEvents, ledger,
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
