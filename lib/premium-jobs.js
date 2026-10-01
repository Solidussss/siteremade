'use strict';
// PREMIUM JOBS -- the premium media of one Creative generation (a cinematic hero, or a showcase's hero, takeover and
// payoff) as a durable, server-owned job (migrations/0011_premium_jobs.sql).
//
// Why: a showcase's three clips take minutes. Made inside one HTTP request, the request outlived the browser's and the
// proxy's patience (HTTP 499 after ~5 minutes) and the page reported a failure while the provider went on to deliver
// every clip. The request is not the job: the browser STARTS a job (a fast request that returns its id), then POLLS it;
// the server owns the job's whole life -- submit, check, download, store, settle -- and a closed tab, a refresh, an aborted
// fetch, a proxy timeout or a server restart changes nothing about it.
//
//   create(db, spec)          -> { job, reused }   one job per generation (a second start returns the first: no second
//                                                   set of provider submissions, no second reservation)
//   view(row)                 -> what the studio sees (states per role, delivered media, credits, a message)
//   createWorker(deps)        -> { kick(id), tick(id), resumeAll(), stop() }
//
// The worker, per job, on a bounded schedule (no tight loop): each pending role is submitted ONCE (never retried); each
// submitted role is checked on its own (a hero may be delivered while the takeover is processing and the payoff queued);
// a completed output is downloaded and stored as a project asset with its provenance; a failed / declined / cancelled one
// is marked failed. When every role has an outcome the job is settled ONCE, in one transaction with its settled_at:
// delivered roles are charged, the rest returned. Only the provider's outcome decides -- never a browser's timing.
//
// Recovery: everything the worker learns is written before it acts on it. A role caught between "submitting" and a stored
// provider id (a crash during the submit) cannot be known to the provider or not: it is never resubmitted -- it is failed
// and its credits returned. A role past its deadline (an explicit, bounded policy: POLICY.roleDeadlineMs since its
// submission, measured on the server) is cancelled where the provider allows and failed.
const crypto = require('crypto');
const credits = require('./credits');
const PM = require('./media/premium-media');

const ROLE_STATES = ['pending', 'submitting', 'submitted', 'processing', 'delivered', 'failed', 'blocked'];
const JOB_STATES = ['queued', 'running', 'partial', 'completed', 'failed', 'cancelled'];
const ROLE_DONE = new Set(['delivered', 'failed', 'blocked']);
const ACTIVE = new Set(['queued', 'running']);
const LABEL = { hero: 'Hero', takeover: 'Takeover', payoff: 'Payoff', single: 'Cinematic hero' };
// how often a job is checked (first soon, then backing off to a ceiling), how long a role may run, how long the credit
// reservation is held ahead, how long a worker's lease lasts -- overridable by the environment (tests make it fast)
function policy(env) {
  const e = env || {}; const n = (v, d) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : d);
  return {
    firstCheckMs: n(e.PREMIUM_JOB_FIRST_CHECK_MS, 8000), checkMs: n(e.PREMIUM_JOB_CHECK_MS, 10000), maxCheckMs: n(e.PREMIUM_JOB_MAX_CHECK_MS, 30000),
    roleDeadlineMs: n(e.PREMIUM_JOB_ROLE_DEADLINE_MS, 60 * 60 * 1000), holdMs: n(e.PREMIUM_JOB_HOLD_MS, 3 * 60 * 60 * 1000),
    leaseMs: n(e.PREMIUM_JOB_LEASE_MS, 2 * 60 * 1000), maxStatusErrors: n(e.PREMIUM_JOB_MAX_STATUS_ERRORS, 30), maxDownloadErrors: 3,
  };
}
const iso = ms => new Date(ms).toISOString();
const rolesOf = row => { try { return JSON.parse(row.roles_json) || []; } catch (e) { return []; } };
const said = e => String((e && e.message) || e || 'unknown error').slice(0, 200);

// ---------------------------------------------------------------- create / read
// spec: { accountId, creativeJobId, projectId, quoteId, opId, mode, strategy, creditsReserved, roles: [{ role, intent,
// sourceAssetId, sourceRef, mime, preset, mediaType, subject, credits, state: 'pending' | 'blocked', failure }] }
function create(db, spec, now) {
  const at = iso(now || Date.now());
  const roles = spec.roles.map(r => Object.assign({ state: 'pending', polls: 0, errors: 0 }, r));
  const done = roles.every(r => ROLE_DONE.has(r.state));
  const id = 'pj_' + crypto.randomBytes(12).toString('base64url');
  const inserted = db.premiumJobs.insertIfNew({ id, accountId: spec.accountId, creativeJobId: spec.creativeJobId, projectId: spec.projectId, quoteId: spec.quoteId, opId: spec.opId, mode: spec.mode, strategy: spec.strategy,
    status: 'queued', rolesJson: JSON.stringify(roles), total: roles.length, completed: 0, creditsReserved: spec.creditsReserved || 0, message: messageFor('queued', roles, 0), nextCheckAt: at, createdAt: at });
  const job = inserted ? db.premiumJobs.find(id) : db.premiumJobs.findByCreativeJob(spec.creativeJobId);
  return { job, reused: !inserted, settleNow: inserted && done };
}
function messageFor(status, roles, refunded) {
  const total = roles.length; const ready = roles.filter(r => r.state === 'delivered').length; const one = total === 1;
  if (ACTIVE.has(status)) return one ? 'Creating cinematic hero…' : `Creating premium videos — ${ready} of ${total} complete`;
  if (status === 'completed') return one ? 'Cinematic hero ready' : 'Premium videos ready';
  const failed = roles.filter(r => r.state === 'failed' || r.state === 'blocked');
  const why = failed.map(r => `${LABEL[r.role] || r.role} ${r.state === 'blocked' ? 'was not made' : 'failed'}${r.failure && r.failure.reason ? ` (${r.failure.reason})` : ''}`).join('; ');
  const back = refunded ? `; ${refunded} credit${refunded === 1 ? '' : 's'} returned` : '';
  if (status === 'partial') return `${ready} of ${total} premium videos ready. ${why}${back}.`;
  if (status === 'cancelled') return `Premium video cancelled${back}.`;
  return `${one ? 'The cinematic hero' : 'The premium videos'} could not be made: ${why}${back}.`;
}
// what the studio sees: never a provider URL, a source reference or a key
function view(row) {
  const roles = rolesOf(row);
  return {
    jobId: row.id, creativeJobId: row.creative_job_id, projectId: row.project_id || null, status: row.status, mode: row.mode, strategy: row.strategy,
    total: row.total, completed: roles.filter(r => r.state === 'delivered').length, terminal: !ACTIVE.has(row.status),
    roles: roles.map(r => Object.assign({ role: r.role, label: LABEL[r.role] || r.role, state: r.state === 'submitting' ? 'submitted' : r.state }, r.mediaId && r.state === 'delivered' ? { mediaId: r.mediaId } : {}, r.failure ? { failure: r.failure.reason, code: r.failure.code } : {})),
    delivered: roles.filter(r => r.state === 'delivered').map(r => ({ kind: 'video', role: r.role === 'single' ? undefined : r.role, sourceAssetId: r.sourceAssetId,
      video: { mediaId: r.mediaId, assetRef: r.assetRef, mime: r.outputMime || 'video/mp4', intent: r.intent }, premium: { mediaId: r.mediaId, provider: 'higgsfield', providerJobId: r.providerJobId, intent: r.intent, sourceAssetId: r.sourceAssetId } })),
    failed: roles.filter(r => r.state === 'failed' || r.state === 'blocked').map(r => ({ role: r.role, intent: r.intent, code: (r.failure && r.failure.code) || r.state, reason: (r.failure && r.failure.reason) || '' })),
    credits: { reserved: row.credits_reserved, charged: row.credits_charged, refunded: row.credits_refunded, settled: !!row.settled_at },
    message: row.message || messageFor(row.status, roles, row.credits_refunded), createdAt: row.created_at, updatedAt: row.updated_at, completedAt: row.completed_at || null,
  };
}

// ---------------------------------------------------------------- settlement (exactly once)
// -> the settled row. Delivered roles are charged; failed, blocked and never-submitted roles are returned. Repeated calls
// (a repeated poll, two workers, a restart) find settled_at set and change nothing.
function settle(db, id, now) {
  const at = iso(now || Date.now());
  return db.transaction(() => {
    const row = db.premiumJobs.find(id); if (!row || row.settled_at) return row;
    const roles = rolesOf(row); if (!roles.every(r => ROLE_DONE.has(r.state))) return row;
    const delivered = roles.filter(r => r.state === 'delivered');
    const charge = delivered.reduce((n, r) => n + (r.credits || 0), 0);
    const s = credits.settle(db, row.op_id, { charge, now: new Date(at), reason: 'premium media not delivered' });
    const charged = s && s.ok !== false ? (s.charged || 0) : 0; const refunded = Math.max(0, row.credits_reserved - charged);
    const status = delivered.length === roles.length ? 'completed' : delivered.length ? 'partial' : 'failed';
    db.premiumJobs.update(id, row.version, { status, completed: delivered.length, credits_charged: charged, credits_refunded: refunded, settled_at: at, completed_at: at, next_check_at: null, message: messageFor(status, roles, refunded) }, at);
    if (db.usage) db.usage.add(row.op_id, { status: delivered.length ? 'ok' : 'failed', settled: charged, refunded }, at);
    return db.premiumJobs.find(id);
  });
}

// ---------------------------------------------------------------- the worker
// deps: { db, provider (createHiggsfield-like: submit / status / cancel / download), presets, costs, store(bytes, mime) ->
// assetRef, sourceUrl(role) -> a URL the provider can fetch the source from, policy, now() -> ms, log(rec), owner }
function createWorker(deps) {
  const d = deps || {}; const db = d.db; const P = d.policy || policy({}); const clock = d.now || Date.now; const log = d.log || (() => {});
  const owner = d.owner || `w_${process.pid}_${crypto.randomBytes(4).toString('hex')}`;
  const timers = new Map(); const running = new Set(); let stopped = false;
  const providerOf = () => (typeof d.provider === 'function' ? d.provider() : d.provider);
  const presetsOf = () => (typeof d.presets === 'function' ? d.presets() : d.presets) || PM.presets();
  function schedule(id, ms) {
    if (stopped) return; if (timers.has(id)) clearTimeout(timers.get(id));
    const t = setTimeout(() => { timers.delete(id); tick(id).catch(e => log({ step: 'tick-error', jobId: id, error: said(e) })); }, Math.max(0, ms));
    if (t.unref) t.unref(); timers.set(id, t);
  }
  // the next check: soon after a submit, then backing off by how long the job has been running, never faster than checkMs
  function delayFor(row) { const age = clock() - Date.parse(row.created_at); return age < P.checkMs ? P.firstCheckMs : Math.min(P.maxCheckMs, P.checkMs + Math.floor(age / 60000) * 2000); }
  async function tick(id) {
    if (stopped || running.has(id)) return; running.add(id);
    const now = clock();
    try {
      if (!db.premiumJobs.lease(id, owner, iso(now + P.leaseMs), iso(now))) { schedule(id, P.checkMs); return; } // (another worker has it)
      let row = db.premiumJobs.find(id); if (!row || !ACTIVE.has(row.status)) return;
      // (the reservation is held while the job runs: never released by its expiry under a long generation)
      credits.extend(db, row.op_id, iso(now + P.holdMs), new Date(now));
      const roles = rolesOf(row);
      // a write of what the worker now knows; a lost race (version moved) ends this tick -- the next one starts over
      const save = (extra) => {
        const ready = roles.filter(r => r.state === 'delivered').length;
        const ok = db.premiumJobs.update(id, row.version, Object.assign({ roles_json: JSON.stringify(roles), completed: ready, status: 'running', message: messageFor('running', roles, 0) }, extra || {}), iso(clock()));
        if (!ok) throw new Error('premium job changed underneath the worker');
        row = db.premiumJobs.find(id); return row;
      };
      // 1. a crash mid-submit: the provider may or may not have it -- never resubmitted, failed and returned
      roles.filter(r => r.state === 'submitting' && !r.providerJobId).forEach(r => { r.state = 'failed'; r.failure = { code: 'submission_uncertain', reason: 'the server restarted while it was being sent; it was not sent again' }; });
      const provider = providerOf(); const presets = presetsOf();
      // 2. each pending role: submitted once
      for (const r of roles.filter(x => x.state === 'pending')) {
        const pre = presets[r.preset];
        if (!pre || !pre.endpoint) { r.state = 'failed'; r.failure = { code: 'invalid_endpoint', reason: 'no media model is configured' }; save(); continue; }
        r.state = 'submitting'; r.mediaId = r.mediaId || 'pm_' + crypto.randomBytes(10).toString('base64url'); save();
        try {
          const params = Object.assign({}, pre.params, { image_url: await d.sourceUrl(r), prompt: PM.promptFor({ intent: r.intent, subject: r.subject }) });
          const sub = await provider.submit(pre.endpoint, params);
          Object.assign(r, { providerJobId: sub.requestId, state: 'submitted', submittedAt: iso(clock()) });
          if (db.premiumMedia) db.premiumMedia.insert({ id: r.mediaId, accountId: row.account_id, projectId: row.project_id, provider: 'higgsfield', providerJobId: sub.requestId, mediaType: pre.mediaType, intent: r.intent, sourceAssetId: r.sourceAssetId, preset: r.preset, status: 'pending', credits: r.credits || 0, opId: row.op_id,
            provenanceJson: JSON.stringify({ provider: 'higgsfield', preset: r.preset, endpoint: pre.endpoint, intent: r.intent, role: r.role, sourceAssetId: r.sourceAssetId, prompt: params.prompt, requestedAt: r.submittedAt, premiumJobId: id }), createdAt: r.submittedAt });
          log({ step: 'submitted', jobId: id, role: r.role, providerJobId: sub.requestId });
        } catch (e) { r.state = 'failed'; r.failure = { code: 'provider_failed', reason: `it could not be sent to the media provider (${said(e)})` }; log({ step: 'submit-failed', jobId: id, role: r.role, error: said(e) }); }
        save();
      }
      // 3. each submitted role: checked on its own
      for (const r of roles.filter(x => x.state === 'submitted' || x.state === 'processing')) {
        const pre = presets[r.preset] || {}; const actual = ((d.costs && d.costs.higgsfield) || {})[pre.costKey || r.preset] || 0;
        let s;
        try { s = await provider.status(r.providerJobId); r.errors = 0; } catch (e) {
          r.errors = (r.errors || 0) + 1; r.checkedAt = iso(clock());
          // (an unreachable provider is not a failure -- until the role's deadline, after a bounded number of errors)
          if (r.errors >= P.maxStatusErrors && clock() - Date.parse(r.submittedAt) > P.roleDeadlineMs) { r.state = 'failed'; r.failure = { code: 'timed_out', reason: 'the media provider could not be reached before the deadline' }; }
          save(); continue;
        }
        r.polls = (r.polls || 0) + 1; r.checkedAt = iso(clock());
        if (s.status === 'completed' && s.outputUrl) {
          try {
            const file = await provider.download(s.outputUrl, pre.mediaType || 'video');
            const mime = (pre.mediaType || 'video') === 'video' ? 'video/mp4' : (/^image\/(png|jpeg|webp)$/.test(file.mime) ? file.mime : 'image/png');
            const assetRef = d.store(file.bytes, mime);
            Object.assign(r, { state: 'delivered', assetRef, outputMime: mime, bytes: file.bytes.length, costUsd: actual, completedAt: iso(clock()) });
            if (db.premiumMedia) db.premiumMedia.update(r.mediaId, { status: 'completed', cost_usd: actual, asset_ref: assetRef, mime, bytes: file.bytes.length, provenance_json: JSON.stringify({ provider: 'higgsfield', preset: r.preset, intent: r.intent, role: r.role, sourceAssetId: r.sourceAssetId, providerJobId: r.providerJobId, outcome: 'completed', completedAt: r.completedAt, storedAs: assetRef, costUsd: actual, premiumJobId: id, terms: "generated by Higgsfield for this website; check Higgsfield's current terms for commercial use of outputs" }) }, r.completedAt);
            if (db.usage) db.usage.add(row.op_id, { higgsfield_jobs: 1, higgsfield_usd: actual }, r.completedAt);
            if (actual > 0) credits.addProviderUsd(db, row.op_id, actual, new Date(clock()));
            log({ step: 'delivered', jobId: id, role: r.role });
          } catch (e) {
            // (the clip exists at the provider: a download that fails is tried again on the next checks, a few times)
            r.downloadErrors = (r.downloadErrors || 0) + 1;
            if (r.downloadErrors >= P.maxDownloadErrors) { r.state = 'failed'; r.failure = { code: 'download_failed', reason: `the finished clip could not be downloaded (${said(e)})` }; }
            else r.state = 'processing';
          }
        } else if (['failed', 'nsfw', 'canceled'].includes(s.status)) {
          r.state = 'failed'; r.failure = { code: 'provider_failed', providerStatus: s.status, reason: s.status === 'nsfw' ? 'the provider declined the content' : `the provider reported ${s.status}` };
          if (db.premiumMedia) db.premiumMedia.update(r.mediaId, { status: 'failed', cost_usd: 0 }, iso(clock()));
          log({ step: 'failed', jobId: id, role: r.role, providerStatus: s.status });
        } else {
          r.state = 'processing';
          // the explicit server-side deadline (never the browser's): a role still running long after its submission is
          // cancelled where the provider allows and failed -- its credits returned
          if (clock() - Date.parse(r.submittedAt) > P.roleDeadlineMs) {
            try { await provider.cancel(r.providerJobId); } catch (e) { /* best effort */ }
            r.state = 'failed'; r.failure = { code: 'timed_out', reason: 'it was still not finished at the deadline' };
            if (db.premiumMedia) db.premiumMedia.update(r.mediaId, { status: 'failed' }, iso(clock()));
          }
        }
        save();
      }
      // 4. every role has an outcome: settle once; else check again later
      if (roles.every(r => ROLE_DONE.has(r.state))) { save(); const done = settle(db, id, clock()); log({ step: 'settled', jobId: id, status: done && done.status }); return; }
      save({ next_check_at: iso(clock() + delayFor(row)) }); schedule(id, delayFor(row));
    } catch (e) { log({ step: 'tick-error', jobId: id, error: said(e) }); schedule(id, P.checkMs); }
    finally { running.delete(id); try { db.premiumJobs.unlease(id, owner); } catch (e) { /* the next tick re-leases */ } }
  }
  return {
    owner,
    kick(id, ms) { schedule(id, ms == null ? 0 : ms); },
    tick,
    // after a (re)start: every job still queued or running is picked up where it was -- nothing is resubmitted
    resumeAll() { const list = db.premiumJobs.active(); list.forEach((j, i) => schedule(j.id, 200 + i * 100)); return list.length; },
    scheduled: () => [...timers.keys()],
    stop() { stopped = true; timers.forEach(t => clearTimeout(t)); timers.clear(); },
  };
}

module.exports = { ROLE_STATES, JOB_STATES, ACTIVE, LABEL, policy, create, view, settle, messageFor, createWorker, rolesOf };
