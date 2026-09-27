// Generation diagnostics -- durable, private record of planner and image
// outcomes (see migrations/0008_generation_events.sql for what each kind/
// outcome means and why this exists).
//
// Two hard rules:
//   1. Recording NEVER breaks a request. Every write is wrapped: a failing
//      write (full disk, the not-yet-implemented production adapter, a
//      malformed value) is swallowed and counted, never thrown into a route
//      that is in the middle of charging credits or returning an image.
//   2. Nothing here is customer-facing. The only reader outside tests is the
//      admin-token-gated GET /api/admin/generation-events route.
'use strict';
const crypto = require('crypto');

const DETAIL_MAX_CHARS = 2000;
const DEFAULT_RETENTION_DAYS = 30;

function clip(value, n) { return value == null ? null : String(value).slice(0, n); }
function intOrNull(v) { return Number.isFinite(v) ? Math.round(v) : null; }
function numOrNull(v) { return Number.isFinite(v) ? v : null; }

function createGenerationEvents(db, { now = () => new Date(), retentionDays = DEFAULT_RETENTION_DAYS } = {}) {
  let writeFailures = 0;
  let lastPruneDay = null;

  function record(evt) {
    try {
      if (!evt || !evt.kind || !evt.outcome) return null;
      const detail = evt.detail && typeof evt.detail === 'object' ? JSON.stringify(evt.detail) : null;
      const row = {
        id: 'gev_' + crypto.randomBytes(9).toString('hex'),
        createdAt: now().toISOString(),
        kind: clip(evt.kind, 30),
        outcome: clip(evt.outcome, 40),
        accountId: clip(evt.accountId, 80),
        projectId: clip(evt.projectId, 120),
        requestKey: clip(evt.requestKey, 300),
        provider: clip(evt.provider, 40),
        model: clip(evt.model, 60),
        quality: clip(evt.quality, 20),
        latencyMs: intOrNull(evt.latencyMs),
        estimatedCostUsd: numOrNull(evt.estimatedCostUsd),
        creditsCharged: intOrNull(evt.creditsCharged),
        assetHash: clip(evt.assetHash, 80),
        detailJson: detail ? detail.slice(0, DETAIL_MAX_CHARS) : null,
      };
      db.generationEvents.insert(row);
      pruneDaily();
      return row;
    } catch (e) {
      writeFailures++;
      return null;
    }
  }

  // Bounded growth without a background timer: at most once per UTC day,
  // piggybacked on a write.
  function pruneDaily() {
    const day = now().toISOString().slice(0, 10);
    if (day === lastPruneDay) return;
    lastPruneDay = day;
    try {
      const cutoff = new Date(now().getTime() - retentionDays * 86400000).toISOString();
      db.generationEvents.deleteOlderThan(cutoff);
    } catch (e) { writeFailures++; }
  }

  function findDeliveredImage(accountId, requestKey) {
    if (!accountId || !requestKey) return null;
    try { return db.generationEvents.findLatestDeliveredImage(String(accountId), String(requestKey)); } catch (e) { return null; }
  }

  function listRecent(opts) {
    return db.generationEvents.listRecent(opts || {}).map(row => ({
      ...row,
      detail: row.detail_json ? safeParse(row.detail_json) : null,
      detail_json: undefined,
    }));
  }

  return { record, findDeliveredImage, listRecent, stats: () => ({ writeFailures }) };
}

function safeParse(s) { try { return JSON.parse(s); } catch (e) { return null; } }

module.exports = { createGenerationEvents, DEFAULT_RETENTION_DAYS };
