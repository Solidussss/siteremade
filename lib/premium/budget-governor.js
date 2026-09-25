'use strict';
// The single, deterministic place a spend decision is made. No other module
// compares cost to a budget: they ask `decide()`.
//
// Policy (all thresholds come from config.js):
//   FIRST DRAFT  may spend up to  SOFT - REPAIR_RESERVE   (so a repair round always has room)
//                'optional' work is skipped once the first-draft TARGET is reached
//   REPAIR       may spend up to  HARD                    (never beyond; BUDGET_LIMIT_REACHED otherwise)
//   'critical'   work is the site itself (strategy, hero): allowed up to HARD in the first draft
// Requests can carry `fallbacks` (cheaper alternatives, most-preferred first);
// the governor returns the best one that fits instead of failing outright.
// Hitting a limit is NOT an error: the caller returns its current best site
// and the governor records BUDGET_LIMIT_REACHED.

const round = n => Math.round(n * 1e6) / 1e6;
const PRIORITIES = ['critical', 'high', 'normal', 'optional'];

class BudgetGovernor {
  constructor(cfg, ledger, generationId) {
    this.cfg = cfg; this.ledger = ledger; this.generationId = generationId;
    this.limitReached = false;
    this.decisions = [];
  }
  spent() { return this.ledger.totalFor(this.generationId); }
  remaining() { return round(Math.max(0, this.cfg.budgets.HARD_SITE_BUDGET_USD - this.spent())); }
  // Ceiling that applies to a phase (USD cumulative).
  ceilingFor(phase, priority) {
    const b = this.cfg.budgets;
    if (phase === 'repair') return b.HARD_SITE_BUDGET_USD;
    if (priority === 'critical') return b.HARD_SITE_BUDGET_USD;
    return Math.max(0, b.SOFT_SITE_BUDGET_USD - b.REPAIR_RESERVE_USD);
  }
  // request: { operation, phase, priority, estimatedUsd, committedUsd?, fallbacks?:[{id,estimatedUsd}], id? }
  decide(request) {
    const req = Object.assign({ phase: 'first_draft', priority: 'normal', fallbacks: [] }, request);
    if (!PRIORITIES.includes(req.priority)) req.priority = 'normal';
    // committedUsd: planned-but-not-yet-recorded spend (e.g. image slots allocated earlier in the same plan).
    const spent = this.spent() + (req.committedUsd || 0);
    const ceiling = this.ceilingFor(req.phase, req.priority);
    let options = [{ id: req.id || 'primary', estimatedUsd: req.estimatedUsd }].concat(req.fallbacks || []);
    // Optional sub-budget (e.g. semantic review): a smaller ceiling that applies on top of the site ceilings.
    if (req.subBudget) options = options.filter(o => req.subBudget.spentUsd + o.estimatedUsd <= req.subBudget.ceilingUsd + 1e-9);
    let out = null;
    // 'optional' first-draft work stops at the first-draft target.
    if (req.phase === 'first_draft' && req.priority === 'optional' && spent >= this.cfg.budgets.TARGET_FIRST_DRAFT_USD) {
      out = { allowed: false, choice: null, reason: 'first_draft_target_reached', budgetLimitReached: false };
    } else {
      for (let i = 0; i < options.length; i++) {
        const o = options[i];
        if (spent + o.estimatedUsd <= ceiling + 1e-9) {
          // Preferred option did not fit AND it was the hard ceiling that stopped it: that is a budget stop, even though a cheaper fallback ran.
          const hardStopped = i > 0 && spent + options[0].estimatedUsd > this.cfg.budgets.HARD_SITE_BUDGET_USD - 1e-9;
          out = { allowed: true, choice: o, reason: i === 0 ? 'ok' : 'downgraded', budgetLimitReached: hardStopped };
          break;
        }
      }
      if (!out && !options.length) out = { allowed: false, choice: null, reason: 'sub_budget', budgetLimitReached: false };
      if (!out) {
        const hit = spent + Math.min.apply(null, options.map(o => o.estimatedUsd)) > this.cfg.budgets.HARD_SITE_BUDGET_USD - 1e-9 || req.phase === 'repair';
        out = { allowed: false, choice: null, reason: hit ? 'hard_budget' : 'phase_ceiling', budgetLimitReached: hit };
      }
    }
    if (out.budgetLimitReached) this.limitReached = true;
    out.operation = req.operation; out.phase = req.phase; out.priority = req.priority;
    out.spentUsd = round(spent); out.remainingUsd = this.remaining();
    this.decisions.push(out);
    return out;
  }
  // Convenience: estimate + decide in one place for images.
  summary() {
    return { generationId: this.generationId, spentUsd: round(this.spent()), remainingUsd: this.remaining(), BUDGET_LIMIT_REACHED: this.limitReached, decisions: this.decisions.length };
  }
}

module.exports = { BudgetGovernor, PRIORITIES };
