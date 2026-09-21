// V8.6: durable deployment/export records + the domain-handoff rows,
// extending V8.5's persistence layer the same way lib/purchase.js and
// lib/entitlement.js already do (real rows in the same node:sqlite
// database, ownership-scoped exactly like lib/project-store.js -- every
// function here takes an explicit ownerId and never returns/mutates a row
// belonging to a different account).
//
// State machine discipline (spec §14): `deployments.state` is changed ONLY
// by the functions in this file, each called by a server route after a
// REAL outcome (a package really finished writing to disk, an archive
// really failed, a hosting target really isn't configured) -- no HTTP
// route in server.js/mock-server.js ever accepts a client-supplied state
// value. A "packaging" attempt that fails never touches or deletes a
// previous successful row (§29) -- every attempt is a brand new INSERT.
'use strict';
const crypto = require('crypto');
const { nowIso } = require('./db.js');

function genId(prefix) { return `${prefix}_${crypto.randomBytes(18).toString('base64url')}`; }

const VALID_STATES = ['not_deployed', 'packaging', 'ready', 'deploying', 'live', 'failed'];
const VALID_TARGETS = ['local', 'railway', 'hostinger', 'bluehost', 'godaddy'];
const VALID_DOMAIN_STATES = ['not_configured', 'instructions_generated', 'dns_pending', 'verified', 'ssl_pending', 'live'];

function rowToDeployment(row) {
  return {
    id: row.id, projectId: row.project_id, projectRevision: row.project_revision,
    directionIndex: row.direction_index, compilerVersion: row.compiler_version,
    artifactHash: row.artifact_hash, runtimeType: row.runtime_type,
    runtimeReasons: JSON.parse(row.runtime_reasons_json || '[]'),
    target: row.target, state: row.state,
    manifest: row.manifest_json ? JSON.parse(row.manifest_json) : null,
    deployedUrl: row.deployed_url || null, failureReason: row.failure_reason || null,
    createdAt: row.created_at, updatedAt: row.updated_at,
  };
}

// Convenience summary only -- see migrations/0002_deployments.sql's own
// comment for why `deployments` (not this column) is the load-bearing
// record. Recomputed from real rows every time a deployment is
// created/transitioned; never written to directly by any route.
function syncProjectDeploymentStatus(db, projectId) {
  const rows = db.prepare('SELECT state FROM deployments WHERE project_id = ? ORDER BY created_at DESC').all(projectId);
  let summary = 'not_deployed';
  if (rows.some(r => r.state === 'live')) summary = 'live';
  else if (rows.some(r => r.state === 'ready')) summary = 'ready';
  else if (rows.length && (rows[0].state === 'failed')) summary = 'failed';
  else if (rows.some(r => r.state === 'deploying' || r.state === 'packaging')) summary = 'packaging';
  db.prepare('UPDATE projects SET deployment_status = ? WHERE id = ?').run(summary, projectId);
}

// A real, successfully-packaged export/deployment -- called only once the
// compiler + archiver have already produced real bytes on disk. Starts
// (and, for the 'local' target, ends -- packaging IS the deployment for a
// download-only target) at 'ready'.
// `id`, when supplied, lets the caller pick the deployment id BEFORE
// calling this (server.js does, so the on-disk export/artifact paths it
// already built -- named after that same id -- line up with the row this
// creates, without a second rename step). Falls back to a fresh id
// otherwise (every existing call site/test that doesn't care).
function createReadyDeployment(db, { id, ownerId, projectId, projectRevision, directionIndex, compilerVersion, artifactHash, runtimeType, runtimeReasons, target, manifest, artifactPath }) {
  if (!VALID_TARGETS.includes(target)) throw new Error('Invalid deployment target.');
  id = id || genId('dep');
  const ts = nowIso();
  db.prepare(`INSERT INTO deployments (id, owner_id, project_id, project_revision, direction_index, compiler_version, artifact_hash, runtime_type, runtime_reasons_json, target, state, manifest_json, artifact_path, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ready', ?, ?, ?, ?)`)
    .run(id, ownerId, projectId, projectRevision, directionIndex, compilerVersion, artifactHash, runtimeType, JSON.stringify(runtimeReasons || []), target, JSON.stringify(manifest), artifactPath || null, ts, ts);
  syncProjectDeploymentStatus(db, projectId);
  return getOwnedDeployment(db, ownerId, id);
}
// A failed attempt -- still a real row (so "latest attempt failed" is
// visible), but never overwrites or removes whatever the last GOOD
// deployment was (spec §29). Used both for a real packaging/archive
// failure and for "this hosting target isn't configured in this
// environment" (§15 -- honest, not faked).
function recordFailedDeployment(db, { id, ownerId, projectId, projectRevision, directionIndex, target, failureReason, runtimeType, runtimeReasons, manifest, artifactHash, compilerVersion }) {
  if (!VALID_TARGETS.includes(target)) throw new Error('Invalid deployment target.');
  id = id || genId('dep');
  const ts = nowIso();
  db.prepare(`INSERT INTO deployments (id, owner_id, project_id, project_revision, direction_index, compiler_version, artifact_hash, runtime_type, runtime_reasons_json, target, state, manifest_json, artifact_path, failure_reason, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'failed', ?, NULL, ?, ?, ?)`)
    .run(id, ownerId, projectId, projectRevision, directionIndex, compilerVersion || 'n/a', artifactHash || 'n/a', runtimeType || 'static', JSON.stringify(runtimeReasons || []), target, JSON.stringify(manifest || {}), String(failureReason || 'Unknown failure.').slice(0, 500), ts, ts);
  syncProjectDeploymentStatus(db, projectId);
  return getOwnedDeployment(db, ownerId, id);
}
// The only other legal transition in this sandbox: a real target later
// reports a genuinely reachable URL. Never called by any route today (no
// real hosting target is wired up -- see lib/hosting.js), kept as the
// server-owned mutator a future real adapter would call.
function markDeploymentLive(db, ownerId, deploymentId, deployedUrl) {
  const row = db.prepare('SELECT * FROM deployments WHERE id = ? AND owner_id = ?').get(deploymentId, ownerId);
  if (!row) return null;
  db.prepare(`UPDATE deployments SET state = 'live', deployed_url = ?, updated_at = ? WHERE id = ?`).run(deployedUrl, nowIso(), deploymentId);
  syncProjectDeploymentStatus(db, row.project_id);
  return getOwnedDeployment(db, ownerId, deploymentId);
}

function getOwnedDeployment(db, ownerId, deploymentId) {
  const row = db.prepare('SELECT * FROM deployments WHERE id = ? AND owner_id = ?').get(deploymentId, ownerId);
  return row ? rowToDeployment(row) : null;
}
function listOwnedDeployments(db, ownerId, projectId) {
  return db.prepare('SELECT * FROM deployments WHERE owner_id = ? AND project_id = ? ORDER BY created_at DESC').all(ownerId, projectId).map(rowToDeployment);
}
// "Last known good" -- independent of whatever the MOST RECENT row is
// (which may be a later failed attempt). This is what the UI shows as
// "deployed revision" and what a redeploy failure must never clobber.
function getLatestGoodDeployment(db, ownerId, projectId) {
  const row = db.prepare(`SELECT * FROM deployments WHERE owner_id = ? AND project_id = ? AND state IN ('ready','live') ORDER BY created_at DESC LIMIT 1`).get(ownerId, projectId);
  return row ? rowToDeployment(row) : null;
}

// ---- Domain handoff (§19/§20) ----------------------------------------------
function rowToDomain(row) {
  return {
    id: row.id, projectId: row.project_id, domain: row.domain, target: row.target, state: row.state,
    dnsRecords: JSON.parse(row.dns_records_json || '[]'),
    createdAt: row.created_at, updatedAt: row.updated_at, verifiedAt: row.verified_at || null,
  };
}
function upsertDomain(db, { ownerId, projectId, domain, target, dnsRecords }) {
  const existing = db.prepare('SELECT * FROM project_domains WHERE project_id = ? AND domain = ?').get(projectId, domain);
  const ts = nowIso();
  if (existing) {
    db.prepare(`UPDATE project_domains SET target = ?, state = 'instructions_generated', dns_records_json = ?, updated_at = ? WHERE id = ?`)
      .run(target, JSON.stringify(dnsRecords), ts, existing.id);
    return getOwnedDomain(db, ownerId, existing.id);
  }
  const id = genId('dom');
  db.prepare(`INSERT INTO project_domains (id, owner_id, project_id, domain, target, state, dns_records_json, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 'instructions_generated', ?, ?, ?)`)
    .run(id, ownerId, projectId, domain, target, JSON.stringify(dnsRecords), ts, ts);
  return getOwnedDomain(db, ownerId, id);
}
function getOwnedDomain(db, ownerId, domainId) {
  const row = db.prepare('SELECT * FROM project_domains WHERE id = ? AND owner_id = ?').get(domainId, ownerId);
  return row ? rowToDomain(row) : null;
}
function listOwnedDomains(db, ownerId, projectId) {
  return db.prepare('SELECT * FROM project_domains WHERE owner_id = ? AND project_id = ? ORDER BY created_at DESC').all(ownerId, projectId).map(rowToDomain);
}
// Server-owned domain state transition -- a client can ask for
// verification to RUN (see lib/domain.js's verifyDomain), but never sets
// the resulting state itself.
function setDomainState(db, ownerId, domainId, state, { verified } = {}) {
  if (!VALID_DOMAIN_STATES.includes(state)) throw new Error('Invalid domain state.');
  const row = db.prepare('SELECT * FROM project_domains WHERE id = ? AND owner_id = ?').get(domainId, ownerId);
  if (!row) return null;
  const ts = nowIso();
  db.prepare(`UPDATE project_domains SET state = ?, updated_at = ?, verified_at = ? WHERE id = ?`)
    .run(state, ts, verified ? ts : row.verified_at, domainId);
  return getOwnedDomain(db, ownerId, domainId);
}

module.exports = {
  VALID_STATES, VALID_TARGETS, VALID_DOMAIN_STATES, genId,
  createReadyDeployment, recordFailedDeployment, markDeploymentLive,
  getOwnedDeployment, listOwnedDeployments, getLatestGoodDeployment, syncProjectDeploymentStatus,
  upsertDomain, getOwnedDomain, listOwnedDomains, setDomainState,
};
