'use strict';
// Per-generation log + the aggregate economics the brief asks for. Data
// only: no dashboard. Acceptance is recorded when the customer actually
// accepts the site (buys/publishes) via markAccepted().

const avg = xs => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 1e6) / 1e6 : null);

function buildGenerationLog(x) {
  const t = x.totals || {};
  return {
    generationId: x.generationId, at: new Date().toISOString(), premium: !!x.premium, archetype: x.archetype || null, projectId: x.projectId || null,
    firstDraftCostUsd: t.FIRST_DRAFT_COST || 0, repairCostUsd: t.REPAIR_COST || 0, totalCostUsd: t.TOTAL_SITE_COST || 0,
    imageCount: t.imageCount || 0, imageAttempts: t.imageAttempts || 0, imageRetries: t.imageRetries || 0, modelCalls: t.modelCalls || 0,
    qualityBefore: x.before || null, qualityAfter: x.after || null,
    repairRan: !!x.repairRan, repairActions: (x.repairActions || []).map(a => ({ kind: a.kind, code: a.defectCode })), budgetLimitReached: !!x.budgetLimitReached,
    fullRegenerationsRequested: x.fullRegenerationsRequested || 0,
    timingsMs: x.timingsMs || {}, accepted: false, acceptedAt: null,
  };
}

class MetricsStore {
  constructor(opts) { this.logs = []; this.limit = (opts && opts.limit) || 5000; this.sink = (opts && opts.sink) || null; }
  append(log) { this.logs.push(log); if (this.logs.length > this.limit) this.logs.shift(); if (this.sink) { try { this.sink(log); } catch (_) { /* never break generation */ } } return log; }
  markAccepted(generationId) { const l = [...this.logs].reverse().find(x => x.generationId === generationId); if (l && !l.accepted) { l.accepted = true; l.acceptedAt = new Date().toISOString(); return true; } return false; }
  aggregate(opts) {
    const revenueUsd = opts && Number.isFinite(opts.revenueUsdPerSite) ? opts.revenueUsdPerSite : null;
    const logs = this.logs, accepted = logs.filter(l => l.accepted);
    const attempts = logs.reduce((n, l) => n + l.imageAttempts, 0), retries = logs.reduce((n, l) => n + l.imageRetries, 0);
    // generations before acceptance, per project: count generation logs for the same project up to the accepted one
    const byProject = {};
    logs.forEach(l => { if (l.projectId) (byProject[l.projectId] = byProject[l.projectId] || []).push(l); });
    const counts = Object.values(byProject).filter(ls => ls.some(l => l.accepted)).map(ls => ls.findIndex(l => l.accepted) + 1);
    const firstDraftAccepted = Object.values(byProject).filter(ls => ls.some(l => l.accepted)).filter(ls => ls[0].accepted).length;
    const acceptedProjects = Object.values(byProject).filter(ls => ls.some(l => l.accepted)).length;
    const avgPublishable = avg(accepted.map(l => l.totalCostUsd));
    return {
      sampleSize: logs.length, acceptedCount: accepted.length,
      FIRST_OUTPUT_ACCEPTANCE_RATE: acceptedProjects ? Math.round(firstDraftAccepted / Object.keys(byProject).length * 1000) / 1000 : null,
      AVERAGE_GENERATIONS_BEFORE_ACCEPTANCE: avg(counts),
      IMAGE_RETRY_RATE: attempts ? Math.round(retries / attempts * 1000) / 1000 : null,
      AVERAGE_FIRST_DRAFT_COST_USD: avg(logs.map(l => l.firstDraftCostUsd)),
      AVERAGE_PUBLISHABLE_SITE_COST_USD: avgPublishable,
      COST_AS_PERCENT_OF_REVENUE: revenueUsd && avgPublishable != null ? Math.round(avgPublishable / revenueUsd * 1000) / 10 : null,
      repairRunRate: logs.length ? Math.round(logs.filter(l => l.repairRan).length / logs.length * 1000) / 1000 : null,
      budgetLimitReachedRate: logs.length ? Math.round(logs.filter(l => l.budgetLimitReached).length / logs.length * 1000) / 1000 : null,
      note: revenueUsd == null ? 'set PREMIUM_REVENUE_USD_PER_SITE (website price converted to USD) to get COST_AS_PERCENT_OF_REVENUE' : undefined,
    };
  }
}

module.exports = { buildGenerationLog, MetricsStore };
