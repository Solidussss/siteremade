// App bridge pass (Phase 4): append-only "published revision" snapshots --
// see migrations/0006_published_snapshots.sql for the full reasoning.
//
// HONESTY NOTE (do not remove): "publish" here means exactly one thing --
// freeze the project's CURRENT state_json at its CURRENT revision into a
// new row, so POST /api/projects/:id/export compiles from it instead of the
// original purchase snapshot. It does NOT push anything to a live URL or a
// hosting provider; no such mechanism exists anywhere in this codebase
// (deploy-to for every non-'local' target records a failed deployment, and
// deployments.deployed_url is never set by any route).
//
// Same conventions as lib/purchase.js / lib/deployment-store.js: `db` is a
// DatabaseAdapter, every function takes an explicit, already-authenticated
// ownerId and never returns/mutates another account's row.
'use strict';
const crypto = require('crypto');
const { nowIso } = require('./db.js');

function genId(prefix) { return `${prefix}_${crypto.randomBytes(18).toString('base64url')}`; }

function rowToSummary(row) {
  return { id: row.id, projectId: row.project_id, revision: row.revision, directionIndex: row.direction_index, publishedAt: row.published_at };
}

// Freezes the project's current state as published. Refuses (never
// silently "fixes") on: not owned / missing (not_found), revision mismatch
// (conflict -- the caller must be publishing exactly what it reviewed), or
// a project that isn't purchased (not_purchased -- a draft has no publish
// concept). Re-publishing the revision that is ALREADY the latest published
// one is an idempotent no-op that returns the existing row, never a
// duplicate. The read-check-insert runs inside one transaction so a
// concurrent edit cannot slip a different revision between the check and
// the insert.
function publishCurrentRevision(db, ownerId, projectId, { revision, directionIndex }) {
  return db.transaction(() => {
    const row = db.projects.findOwned(ownerId, projectId);
    if (!row) return { ok: false, reason: 'not_found' };
    if (!Number.isInteger(revision) || revision !== row.revision) return { ok: false, reason: 'conflict', currentRevision: row.revision };
    if (row.status !== 'purchased') return { ok: false, reason: 'not_purchased' };
    const latest = db.publishedSnapshots.findLatestOwnedByProject(ownerId, projectId);
    if (latest && latest.revision === row.revision) return { ok: true, alreadyPublished: true, snapshot: rowToSummary(latest) };
    let dirIndex = Number.isInteger(directionIndex) ? directionIndex : null;
    if (dirIndex === null) {
      const state = JSON.parse(row.state_json);
      dirIndex = Number.isInteger(state.activeDirectionIndex) ? state.activeDirectionIndex : 0;
    }
    const ts = nowIso();
    const id = genId('pub');
    db.publishedSnapshots.insert({
      id, projectId, ownerId, revision: row.revision, directionIndex: dirIndex,
      stateJson: row.state_json, publishedAt: ts, createdAt: ts,
    });
    return { ok: true, alreadyPublished: false, snapshot: { id, projectId, revision: row.revision, directionIndex: dirIndex, publishedAt: ts } };
  });
}

// Metadata-only read (no state) -- used by the bridge's summary endpoint.
function getLatestOwnedPublished(db, ownerId, projectId) {
  const row = db.publishedSnapshots.findLatestOwnedByProject(ownerId, projectId);
  return row ? rowToSummary(row) : null;
}

// Full read including the frozen directionsState -- used ONLY by the
// export route, mirroring purchase.getOwnedPurchaseSnapshotRaw.
function getLatestOwnedPublishedRaw(db, ownerId, projectId) {
  const row = db.publishedSnapshots.findLatestOwnedByProject(ownerId, projectId);
  if (!row) return null;
  return { ...rowToSummary(row), directionsState: JSON.parse(row.state_json) };
}

module.exports = { publishCurrentRevision, getLatestOwnedPublished, getLatestOwnedPublishedRaw };
