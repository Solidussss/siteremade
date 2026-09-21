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
  const rows = db.deployments.listStatesForProject(projectId);
  let summary = 'not_deployed';
  if (rows.some(r => r.state === 'live')) summary = 'live';
  else if (rows.some(r => r.state === 'ready')) summary = 'ready';
  else if (rows.length && (rows[0].state === 'failed')) summary = 'failed';
  else if (rows.some(r => r.state === 'deploying' || r.state === 'packaging')) summary = 'packaging';
  db.projects.setDeploymentStatus(projectId, summary);
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
  db.deployments.insertReady({
    id, ownerId, projectId, projectRevision, directionIndex, compilerVersion, artifactHash, runtimeType,
    runtimeReasonsJson: JSON.stringify(runtimeReasons || []), target, manifestJson: JSON.stringify(manifest),
    artifactPath: artifactPath || null, createdAt: ts, updatedAt: ts,
  });
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
  db.deployments.insertFailed({
    id, ownerId, projectId, projectRevision, directionIndex, compilerVersion: compilerVersion || 'n/a',
    artifactHash: artifactHash || 'n/a', runtimeType: runtimeType || 'static',
    runtimeReasonsJson: JSON.stringify(runtimeReasons || []), target, manifestJson: JSON.stringify(manifest || {}),
    failureReason: String(failureReason || 'Unknown failure.').slice(0, 500), createdAt: ts, updatedAt: ts,
  });
  syncProjectDeploymentStatus(db, projectId);
  return getOwnedDeployment(db, ownerId, id);
}
// The only other legal transition in this sandbox: a real target later
// reports a genuinely reachable URL. Never called by any route today (no
// real hosting target is wired up -- see lib/hosting.js), kept as the
// server-owned mutator a future real adapter would call.
function markDeploymentLive(db, ownerId, deploymentId, deployedUrl) {
  const row = db.deployments.findOwned(ownerId, deploymentId);
  if (!row) return null;
  db.deployments.markLive(deploymentId, deployedUrl, nowIso());
  syncProjectDeploymentStatus(db, row.project_id);
  return getOwnedDeployment(db, ownerId, deploymentId);
}

function getOwnedDeployment(db, ownerId, deploymentId) {
  const row = db.deployments.findOwned(ownerId, deploymentId);
  return row ? rowToDeployment(row) : null;
}
function listOwnedDeployments(db, ownerId, projectId) {
  return db.deployments.listOwned(ownerId, projectId).map(rowToDeployment);
}
// "Last known good" -- independent of whatever the MOST RECENT row is
// (which may be a later failed attempt). This is what the UI shows as
// "deployed revision" and what a redeploy failure must never clobber.
function getLatestGoodDeployment(db, ownerId, projectId) {
  const row = db.deployments.findLatestGood(ownerId, projectId);
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
  const existing = db.domains.findByProjectAndDomain(projectId, domain);
  const ts = nowIso();
  if (existing) {
    db.domains.updateForUpsert(existing.id, target, JSON.stringify(dnsRecords), ts);
    return getOwnedDomain(db, ownerId, existing.id);
  }
  const id = genId('dom');
  db.domains.insert({ id, ownerId, projectId, domain, target, dnsRecordsJson: JSON.stringify(dnsRecords), createdAt: ts, updatedAt: ts });
  return getOwnedDomain(db, ownerId, id);
}
function getOwnedDomain(db, ownerId, domainId) {
  const row = db.domains.findOwned(ownerId, domainId);
  return row ? rowToDomain(row) : null;
}
function listOwnedDomains(db, ownerId, projectId) {
  return db.domains.listOwned(ownerId, projectId).map(rowToDomain);
}
// Server-owned domain state transition -- a client can ask for
// verification to RUN (see lib/domain.js's verifyDomain), but never sets
// the resulting state itself.
function setDomainState(db, ownerId, domainId, state, { verified } = {}) {
  if (!VALID_DOMAIN_STATES.includes(state)) throw new Error('Invalid domain state.');
  const row = db.domains.findOwned(ownerId, domainId);
  if (!row) return null;
  const ts = nowIso();
  db.domains.setState(domainId, state, ts, verified ? ts : row.verified_at);
  return getOwnedDomain(db, ownerId, domainId);
}

module.exports = {
  VALID_STATES, VALID_TARGETS, VALID_DOMAIN_STATES, genId,
  createReadyDeployment, recordFailedDeployment, markDeploymentLive,
  getOwnedDeployment, listOwnedDeployments, getLatestGoodDeployment, syncProjectDeploymentStatus,
  upsertDomain, getOwnedDomain, listOwnedDomains, setDomainState,
};
