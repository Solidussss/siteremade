'use strict';
// PREMIUM JOBS -- the ONE way SiteRemade spends provider money on premium media: the premium video of a Creative generation
// whose owner chose a video mode (Creative + Cinematic Hero: one clip; Creative Showcase: hero, takeover and payoff), as a
// durable, server-owned job (migrations/0011_premium_jobs.sql, 0012_premium_sources.sql).
//
// Why a job: a showcase's three clips take minutes. Made inside one HTTP request, the request outlived the browser's and the
// proxy's patience (HTTP 499 after ~5 minutes) and the page reported a failure while the provider went on to deliver every
// clip. The browser STARTS a job (a fast request) and POLLS it; the server owns its whole life -- submit, check, download,
// store, settle -- and a closed tab, a refresh, an aborted fetch, a proxy timeout or a server restart changes nothing.
//
//   create(db, spec)          -> { job, reused }   one job per generation (a second start returns the first: no second
//                                                   set of provider submissions, no second reservation)
//   view(row)                 -> what the studio sees (states per role, delivered media, SiteRemade credits, a message)
//   telemetry(row)            -> what each role cost and why (internal: model, resolution, duration, estimated and
//                                observed provider cost, provider job id, outcome, credits charged, times) -- no secrets,
//                                no source links, no provider output URLs
//   createWorker(deps)        -> { kick(id), tick(id), resumeAll(), stop() }
//
// MONEY RULES (each one tested with a fake provider: test/creative-premium-jobs.test.js)
//   - at most one provider submission per role, ever: a role is marked "submitting" (and written) before its submit;
//     a submit whose outcome is uncertain (a timeout, a dropped connection, a provider-side 5xx) is NEVER sent again --
//     it is recorded as a possible provider cost and its SiteRemade credits are returned
//   - never more clips than the job's mode allows (max_clips: Hero 1, Showcase 3), never past its provider budget
//     (budget_usd: clips x the per-clip budget, 2.25 USD) -- checked before every submit, whatever else happened
//   - the provider kill switch (deps.enabled) stops every submission that has not happened yet; what was already sent is
//     still followed to its outcome (it may already cost money: its clip is collected, not abandoned)
//   - no automatic retry of a generation, ever; only the DOWNLOAD of a finished clip is retried (bounded) -- the clip
//     exists at the provider, and a temporary download or storage error must not lose it
//   - the deadline never pretends a provider cost away: at the soft deadline the provider is asked to cancel; only a
//     cancellation the provider CONFIRMS ends the role as "cancelled, no provider cost"; otherwise the role keeps being
//     checked (a late clip is still delivered and kept) until the hard deadline, where it is recorded as unresolved --
//     possible provider cost -- and its SiteRemade credits are returned
//   - settled exactly once, in one transaction with settled_at: delivered roles are charged, everything else returned
//
// A 3D MODEL IS ONE MORE PREMIUM ASSET TYPE of this same job (lib/three-d): a role with mediaType 'model3d' is reserved,
// submitted once, followed, downloaded, charged only if delivered and settled once exactly like a clip -- there is no
// second job system. Two things differ, and only these: its provider is a 3D adapter (deps.provider3D, never Higgsfield),
// and what the provider made is NORMALISED before it is stored (deps.process3D: Blender, then the shipping budget). A
// model that cannot be normalised yet (Blender busy or missing) is retried like a download -- the model exists at the
// provider, so the generation is never repeated; one that can never ship is a failed role: its credits are returned and
// its provider cost stays on the record as incurred.
//   - a 3D role's life, as the owner's screen follows it (view().roles[].phase): queued -> submitting -> processing ->
//     downloading -> verifying -> ready, or failed, or possible-cost (sent, never confirmed, never sent again)
//   - BUSY IS NOT A SUBMISSION: a 3D provider that answers "too many at once" (HTTP 429) made nothing and charged
//     nothing, so the role waits and asks again later (bounded). That is the one case a role is sent more than once, and
//     it can never be a second generation: the first request was refused outright.
//   - a 3D job started from its own quote (operation creative_3d) settles that quote with it
const crypto = require('crypto');
const credits = require('./credits');
const PM = require('./media/premium-media');

// (verifying: a 3D model has been downloaded and is being checked -- its bytes are not kept across a restart, so a role
// found here is simply downloaded and checked again; nothing is generated again)
const ROLE_STATES = ['pending', 'submitting', 'submitted', 'processing', 'downloading', 'verifying', 'delivered', 'failed', 'blocked'];
const JOB_STATES = ['queued', 'running', 'partial', 'completed', 'failed', 'cancelled'];
const ROLE_DONE = new Set(['delivered', 'failed', 'blocked']);
const ACTIVE = new Set(['queued', 'running']);
const LABEL = { hero: 'Hero', takeover: 'Takeover', payoff: 'Payoff', single: 'Cinematic hero', model3d: '3D model' };
// the most clips each generation mode may ever submit (Creative: none -- it never has a premium job)
// (and the most 3D models a 3D job may submit: one)
const MAX_CLIPS = { creative: 0, hero: 1, showcase: 3, model3d: 1 };
const is3D = r => !!r && r.mediaType === 'model3d';
// what a 3D role asks its provider for (the adapter decides the rest: lib/three-d/provider.js)
const PRESET_3D = { endpoint: 'image-to-3d', mediaType: 'model3d', params: {} };
// what the provider side of a role is known to be -- the truth about external cost, kept apart from what the owner sees
//   not_sent   never reached the provider (no cost)            rejected   the provider refused the request (no cost)
//   accepted   the provider has it, running                    completed  the provider made it (its cost is incurred)
//   failed     the provider reported failed / declined (no cost; failed requests are not charged by Higgsfield)
//   cancelled  the provider CONFIRMED a cancellation (no cost) unknown    not known (possible cost: never resubmitted)
const PROVIDER_STATES = ['not_sent', 'rejected', 'accepted', 'completed', 'failed', 'cancelled', 'unknown'];
const SPEND = { not_sent: 'none', rejected: 'none', accepted: 'pending', completed: 'incurred', failed: 'none', cancelled: 'none', unknown: 'possible' };
// how often a job is checked (first soon, then backing off), its deadlines, how long the credit reservation is held ahead,
// how long a worker's lease lasts, how often a finished clip's download is tried -- overridable by the environment
function policy(env) {
  const e = env || {}; const n = (v, d) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : d);
  const hard = n(e.PREMIUM_JOB_HARD_DEADLINE_MS, 6 * 60 * 60 * 1000);
  return {
    firstCheckMs: n(e.PREMIUM_JOB_FIRST_CHECK_MS, 8000), checkMs: n(e.PREMIUM_JOB_CHECK_MS, 10000), maxCheckMs: n(e.PREMIUM_JOB_MAX_CHECK_MS, 30000),
    softDeadlineMs: n(e.PREMIUM_JOB_ROLE_DEADLINE_MS, 60 * 60 * 1000), hardDeadlineMs: hard, lateCheckMs: n(e.PREMIUM_JOB_LATE_CHECK_MS, 5 * 60 * 1000),
    holdMs: n(e.PREMIUM_JOB_HOLD_MS, hard + 60 * 60 * 1000), leaseMs: n(e.PREMIUM_JOB_LEASE_MS, 2 * 60 * 1000),
    // (a role "submitting" for longer than this, with no provider id, was interrupted mid-submit: the submit call itself
    // gives up after 30 s, so nobody is still sending it)
    submitStaleMs: n(e.PREMIUM_JOB_SUBMIT_STALE_MS, 3 * 60 * 1000),
    maxDownloadTries: n(e.PREMIUM_JOB_MAX_DOWNLOAD_TRIES, 8), downloadRetryMs: n(e.PREMIUM_JOB_DOWNLOAD_RETRY_MS, 30 * 1000),
    // (a busy 3D provider: how often the request is offered again, and how long between)
    maxBusyTries: n(e.PREMIUM_JOB_MAX_BUSY_TRIES, 20), busyRetryMs: n(e.PREMIUM_JOB_BUSY_RETRY_MS, 15 * 1000),
  };
}
const iso = ms => new Date(ms).toISOString();
const rolesOf = row => { try { return JSON.parse(row.roles_json) || []; } catch (e) { return []; } };
const said = e => String((e && e.message) || e || 'unknown error').slice(0, 200);
const credit = n => `${n} SiteRemade credit${n === 1 ? '' : 's'}`;

// ---------------------------------------------------------------- create / read
// spec: { accountId, creativeJobId, projectId, quoteId, opId, mode ('hero' | 'showcase'), strategy, creditsReserved,
// budgetUsd, roles: [{ role, intent, sourceAssetId, sourceRef, mime, sourceBase, preset, mediaType, subject, credits,
//   source? ({ kind: 'model3d', modelAssetId, modelRef, renderRef }: the clip starts from a still of the page's 3D model),
// estimatedUsd, observedUsd, state: 'pending' | 'blocked', failure }] }. Roles beyond the mode's maximum are blocked.
function create(db, spec, now) {
  const at = iso(now || Date.now()); const max = MAX_CLIPS[spec.mode] || 0;
  const roles = spec.roles.map((r, i) => Object.assign({ state: 'pending', providerState: 'not_sent', polls: 0, errors: 0 }, r,
    i >= max && r.state !== 'blocked' ? { state: 'blocked', failure: { code: 'over_mode_limit', reason: 'more clips than the chosen mode includes' } } : {}));
  const done = roles.every(r => ROLE_DONE.has(r.state));
  const id = 'pj_' + crypto.randomBytes(12).toString('base64url');
  const inserted = db.premiumJobs.insertIfNew({ id, accountId: spec.accountId, creativeJobId: spec.creativeJobId, projectId: spec.projectId, quoteId: spec.quoteId, opId: spec.opId, mode: spec.mode, strategy: spec.strategy,
    status: 'queued', rolesJson: JSON.stringify(roles), total: roles.length, completed: 0, creditsReserved: spec.creditsReserved || 0, maxClips: max, budgetUsd: spec.budgetUsd || 0, message: messageFor('queued', roles, 0), nextCheckAt: at, createdAt: at });
  const job = inserted ? db.premiumJobs.find(id) : db.premiumJobs.findByCreativeJob(spec.creativeJobId);
  return { job, reused: !inserted, settleNow: inserted && done };
}
// the owner's words: SiteRemade credits only (never a word about the provider's money -- a returned credit is ours)
function messageFor(status, roles, returned) {
  const total = roles.length; const ready = roles.filter(r => r.state === 'delivered').length; const one = total === 1;
  if (total && roles.every(is3D)) return message3D(status, roles, returned);
  if (ACTIVE.has(status)) {
    const late = roles.some(r => r.late && !ROLE_DONE.has(r.state)) ? ' — taking longer than usual' : '';
    return (one ? 'Creating cinematic hero…' : `Creating premium videos — ${ready} of ${total} complete`) + late;
  }
  if (status === 'completed') return one ? 'Cinematic hero ready' : 'Premium videos ready';
  const failed = roles.filter(r => r.state === 'failed' || r.state === 'blocked');
  const why = failed.map(r => `${LABEL[r.role] || r.role} ${r.state === 'blocked' ? 'was not made' : 'failed'}${r.failure && r.failure.reason ? ` (${r.failure.reason})` : ''}`).join('; ');
  const back = returned ? `; ${credit(returned)} returned` : '';
  if (status === 'partial') return `${ready} of ${total} premium videos ready. ${why}${back}.`;
  if (status === 'cancelled') return `Premium video cancelled${back}.`;
  return `${one ? 'The cinematic hero' : 'The premium videos'} could not be made: ${why}${back}.`;
}
// (a job of 3D models says so: never a word about video)
function message3D(status, roles, returned) {
  if (ACTIVE.has(status)) return 'Creating 3D model…' + (roles.some(r => r.late && !ROLE_DONE.has(r.state)) ? ' — taking longer than usual' : '');
  if (status === 'completed') return '3D model ready';
  const back = returned ? `; ${credit(returned)} returned` : '';
  if (status === 'cancelled') return `3D model cancelled${back}.`;
  const f = roles.find(r => r.state === 'failed' || r.state === 'blocked');
  return `The 3D model ${f && f.state === 'blocked' ? 'was not made' : 'could not be made'}${f && f.failure && f.failure.reason ? ` (${f.failure.reason})` : ''}${back}.`;
}
// a delivered 3D model as the studio gets it: the stored, normalised asset record (lib/creative/three-d.js) -- its file is
// SiteRemade's own stored copy, never the provider's address
// where a 3D role is, in the owner's terms
const PHASE_3D = { pending: 'queued', submitting: 'submitting', submitted: 'processing', processing: 'processing', downloading: 'downloading', verifying: 'verifying', delivered: 'ready', failed: 'failed', blocked: 'failed' };
const phase3D = r => (r.state === 'failed' && r.providerState === 'unknown' ? 'possible-cost' : PHASE_3D[r.state] || 'queued');
function view3D(r) { return { kind: 'model3d', role: r.role, sourceAssetId: r.sourceAssetId, sectionId: r.sectionId || '', composition: r.composition || 'scroll-rotate', threeD: r.threeD || null, premium: { mediaId: r.mediaId, provider: r.provider || '', providerJobId: r.providerJobId, intent: r.intent, sourceAssetId: r.sourceAssetId } }; }
// what the studio sees: never a provider URL, a source link, a provider cost or a key
function view(row) {
  const roles = rolesOf(row);
  return {
    jobId: row.id, creativeJobId: row.creative_job_id, projectId: row.project_id || null, status: row.status, mode: row.mode, strategy: row.strategy,
    total: row.total, completed: roles.filter(r => r.state === 'delivered').length, terminal: !ACTIVE.has(row.status),
    roles: roles.map(r => Object.assign({ role: r.role, label: LABEL[r.role] || r.role, state: r.state }, is3D(r) ? { phase: phase3D(r) } : {}, r.late && !ROLE_DONE.has(r.state) ? { late: true } : {}, r.mediaId && r.state === 'delivered' ? { mediaId: r.mediaId } : {}, r.failure ? { failure: r.failure.reason, code: r.failure.code } : {})),
    delivered: roles.filter(r => r.state === 'delivered').map(r => (is3D(r) ? view3D(r) : { kind: 'video', role: r.role === 'single' ? undefined : r.role, sourceAssetId: r.sourceAssetId,
      video: { mediaId: r.mediaId, assetRef: r.assetRef, mime: r.outputMime || 'video/mp4', intent: r.intent }, premium: { mediaId: r.mediaId, provider: 'higgsfield', providerJobId: r.providerJobId, intent: r.intent, sourceAssetId: r.sourceAssetId } })),
    failed: roles.filter(r => r.state === 'failed' || r.state === 'blocked').map(r => ({ role: r.role, intent: r.intent, code: (r.failure && r.failure.code) || r.state, reason: (r.failure && r.failure.reason) || '' })),
    // (SiteRemade credits: reserved for the job, charged for delivered clips, returned for the rest)
    credits: { reserved: row.credits_reserved, charged: row.credits_charged, returned: row.credits_refunded, refunded: row.credits_refunded, settled: !!row.settled_at },
    message: row.message || messageFor(row.status, roles, row.credits_refunded), createdAt: row.created_at, updatedAt: row.updated_at, completedAt: row.completed_at || null,
  };
}
// internal: why this job cost what it cost, role by role
function telemetry(row) {
  const roles = rolesOf(row);
  return {
    jobId: row.id, creativeJobId: row.creative_job_id, accountId: row.account_id, mode: row.mode, strategy: row.strategy, status: row.status, maxClips: row.max_clips, budgetUsd: row.budget_usd,
    creditsReserved: row.credits_reserved, creditsCharged: row.credits_charged, creditsReturned: row.credits_refunded, settledAt: row.settled_at || null, createdAt: row.created_at, completedAt: row.completed_at || null,
    providerSubmissions: roles.filter(r => r.submittingAt).length,
    providerSpend: { incurredUsd: +roles.filter(r => r.providerState === 'completed').reduce((n, r) => n + (r.observedUsd || 0), 0).toFixed(2), possibleUsd: +roles.filter(r => r.providerState === 'unknown' || r.providerState === 'accepted').reduce((n, r) => n + (r.observedUsd || 0), 0).toFixed(2) },
    roles: roles.map(r => ({ role: r.role, intent: r.intent, model: r.model || '', resolution: r.resolution || '', durationS: r.durationS || null, estimatedUsd: r.estimatedUsd || 0, observedCostUsd: r.observedUsd || 0,
      providerJobId: r.providerJobId || null, state: r.state, providerState: r.providerState || 'not_sent', providerSpend: SPEND[r.providerState || 'not_sent'], outcome: (r.failure && r.failure.code) || (r.state === 'delivered' ? 'delivered' : r.state),
      creditsCharged: r.creditsCharged || 0, submittingAt: r.submittingAt || null, submittedAt: r.submittedAt || null, outcomeAt: r.outcomeAt || null, cancelRequestedAt: r.cancelRequestedAt || null, polls: r.polls || 0, downloadTries: r.downloadTries || 0, ...(r.busyTries ? { busyRefusals: r.busyTries } : {}) })),
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
    const s = credits.settle(db, row.op_id, { charge, now: new Date(at), reason: row.mode === 'model3d' ? '3D model not delivered' : 'premium video not delivered' });
    // (a 3D job reserved under its own confirmed quote: the quote is settled with it, in this same transaction)
    if (row.quote_id && row.op_id === `quote:${row.quote_id}` && db.quotes) db.quotes.setStatus(row.quote_id, 'accepted', 'settled', at);
    const charged = s && s.ok !== false ? (s.charged || 0) : 0; const returned = Math.max(0, row.credits_reserved - charged);
    roles.forEach(r => { r.creditsCharged = r.state === 'delivered' ? r.credits || 0 : 0; });
    const status = delivered.length === roles.length ? 'completed' : delivered.length ? 'partial' : 'failed';
    db.premiumJobs.update(id, row.version, { status, roles_json: JSON.stringify(roles), completed: delivered.length, credits_charged: charged, credits_refunded: returned, settled_at: at, completed_at: at, next_check_at: null, message: messageFor(status, roles, returned) }, at);
    if (db.usage) db.usage.add(row.op_id, { status: delivered.length ? 'ok' : 'failed', settled: charged, refunded: returned }, at);
    return db.premiumJobs.find(id);
  });
}

// ---------------------------------------------------------------- the worker
// deps: { db, provider (createHiggsfield-like: submit / status / cancel / download), presets, costs, store(bytes, mime) ->
// assetRef, sourceUrl(role, job) -> a durable, scoped link to the role's upload, releaseSource(jobId, role), enabled() ->
// is paid premium generation switched on, policy, now() -> ms, log(rec), owner }
function createWorker(deps) {
  const d = deps || {}; const db = d.db; const P = d.policy || policy({}); const clock = d.now || Date.now; const log = d.log || (() => {});
  const owner = d.owner || `w_${process.pid}_${crypto.randomBytes(4).toString('hex')}`;
  const timers = new Map(); const running = new Set(); let stopped = false;
  const providerOf = () => (typeof d.provider === 'function' ? d.provider() : d.provider);
  const presetsOf = () => (typeof d.presets === 'function' ? d.presets() : d.presets) || PM.presets();
  const enabled = () => (typeof d.enabled === 'function' ? d.enabled() : true);
  // (3D: its own adapter and its own switch -- off unless the server says otherwise)
  const provider3D = r => (typeof d.provider3D === 'function' ? d.provider3D(r) : null);
  const enabled3D = () => (typeof d.enabled3D === 'function' ? !!d.enabled3D() : false);
  const release = (jobId, r) => { try { if (d.releaseSource) d.releaseSource(jobId, r.role); } catch (e) { /* expires on its own */ } };
  function schedule(id, ms) {
    if (stopped) return; if (timers.has(id)) clearTimeout(timers.get(id));
    const t = setTimeout(() => { timers.delete(id); tick(id).catch(e => log({ step: 'tick-error', jobId: id, error: said(e) })); }, Math.max(0, ms));
    if (t.unref) t.unref(); timers.set(id, t);
  }
  // the next check: soon after a submit, then backing off by how long the job has been running; a job past its soft
  // deadline is checked slowly; a pending download retries on its own interval
  function delayFor(row, roles) {
    const age = clock() - Date.parse(row.created_at);
    let ms = age < P.checkMs ? P.firstCheckMs : Math.min(P.maxCheckMs, P.checkMs + Math.floor(age / 60000) * 2000);
    const open = roles.filter(r => !ROLE_DONE.has(r.state));
    if (open.length && open.every(r => r.late)) ms = Math.max(ms, P.lateCheckMs);
    if (open.some(r => r.state === 'downloading' || r.state === 'verifying')) ms = Math.min(ms, P.downloadRetryMs);
    // (a role waiting out a busy provider is offered again when its wait is over)
    open.filter(r => r.state === 'pending' && r.nextSubmitAt).forEach(r => { ms = Math.min(ms, Math.max(250, Date.parse(r.nextSubmitAt) - clock())); });
    return ms;
  }
  // an outcome is written with what it means for provider cost and for the owner
  function outcome(r, state, providerState, failure) { r.state = state; r.providerState = providerState; if (failure) r.failure = failure; r.outcomeAt = iso(clock()); }
  async function tick(id) {
    if (stopped || running.has(id)) return; running.add(id);
    const now = clock();
    try {
      if (!db.premiumJobs.lease(id, owner, iso(now + P.leaseMs), iso(now))) { schedule(id, P.checkMs); return; } // (another worker has it)
      let row = db.premiumJobs.find(id); if (!row || !ACTIVE.has(row.status)) return;
      // (the reservation is held while the job runs -- past its hard deadline -- never released by its expiry)
      credits.extend(db, row.op_id, iso(now + P.holdMs), new Date(now));
      if (db.premiumSources) db.premiumSources.deleteExpired(iso(now));
      const roles = rolesOf(row);
      // a write of what the worker now knows; a lost race (version moved) ends this tick -- the next one starts over
      const save = (extra) => {
        const ready = roles.filter(r => r.state === 'delivered').length;
        const ok = db.premiumJobs.update(id, row.version, Object.assign({ roles_json: JSON.stringify(roles), completed: ready, status: 'running', message: messageFor('running', roles, 0) }, extra || {}), iso(clock()));
        if (!ok) throw new Error('premium job changed underneath the worker');
        row = db.premiumJobs.find(id); return row;
      };
      const provider = providerOf(); const presets = presetsOf();
      // 1. a role interrupted mid-submit (a crash, a restart): the provider may or may not have it -- it is NEVER sent
      //    again (a second submit could be a second charge); recorded as a possible provider cost, its credits returned
      roles.filter(r => r.state === 'submitting' && !r.providerJobId && now - Date.parse(r.submittingAt || 0) > P.submitStaleMs).forEach(r => {
        outcome(r, 'failed', 'unknown', { code: 'submission_uncertain', reason: 'the server restarted while it was being sent; it was not sent again' }); release(id, r);
        log({ step: 'submission-uncertain', jobId: id, role: r.role });
      });
      // 2. each pending role: submitted once -- if the switch is on, the mode allows another clip and the budget has room
      for (const r of roles.filter(x => x.state === 'pending')) {
        if (r.nextSubmitAt && Date.parse(r.nextSubmitAt) > clock()) continue; // (waiting out a busy provider)
        const three = is3D(r); const pre = three ? PRESET_3D : presets[r.preset]; const prov = three ? provider3D(r) : provider;
        const attempted = roles.filter(x => x.submittingAt);
        const spent = attempted.reduce((n, x) => n + (x.estimatedUsd || 0), 0);
        if (!(three ? enabled3D() : enabled())) { outcome(r, 'blocked', 'not_sent', { code: 'premium_disabled', reason: three ? '3D models are switched off on this server' : 'premium video is switched off on this server' }); continue; }
        if (three && !prov) { outcome(r, 'failed', 'not_sent', { code: 'provider_unavailable', reason: 'no 3D provider is configured on this server' }); continue; }
        if (!pre || !pre.endpoint) { outcome(r, 'failed', 'not_sent', { code: 'invalid_endpoint', reason: 'no media model is configured' }); continue; }
        if (attempted.length >= (row.max_clips || 0)) { outcome(r, 'blocked', 'not_sent', { code: 'over_mode_limit', reason: 'more clips than the chosen mode includes' }); continue; }
        if (row.budget_usd > 0 && spent + (r.estimatedUsd || 0) > row.budget_usd + 1e-9) { outcome(r, 'blocked', 'not_sent', { code: 'budget_blocked', reason: 'it would pass this generation\'s provider budget' }); continue; }
        Object.assign(r, { state: 'submitting', submittingAt: iso(clock()), mediaId: r.mediaId || 'pm_' + crypto.randomBytes(10).toString('base64url'), model: pre.endpoint, resolution: pre.resolution || '', durationS: pre.durationS || (pre.params && pre.params.duration) || null });
        save(); // (written BEFORE the submit: whatever happens next, this role is never submitted again)
        let params = null;
        try {
          // (a 3D request carries its own idempotency key -- this job and role -- so an adapter can refuse to make it twice)
          // (and says what its source link serves -- the stored upload's own type and size -- so the adapter can refuse an
          // image the provider would refuse, before anything is sent)
          params = three ? { image_url: await d.sourceUrl(r, row), image: { mime: r.mime || '', bytes: r.sourceBytes || 0 }, prompt: String(r.subject || '').slice(0, 300), mode: r.mode3d || 'object', requestId: `${id}:${r.role}` }
            : Object.assign({}, pre.params, { image_url: await d.sourceUrl(r, row), prompt: PM.promptFor({ intent: r.intent, subject: r.subject, source: r.source && r.source.kind }) });
          if (three) r.provider = prov.name || 'model3d';
          const sub = await prov.submit(pre.endpoint, params);
          Object.assign(r, { providerJobId: sub.requestId, state: 'submitted', providerState: 'accepted', submittedAt: iso(clock()) });
          if (db.premiumMedia) db.premiumMedia.insert({ id: r.mediaId, accountId: row.account_id, projectId: row.project_id, provider: three ? r.provider : 'higgsfield', providerJobId: sub.requestId, mediaType: pre.mediaType, intent: r.intent, sourceAssetId: r.sourceAssetId, preset: r.preset, status: 'pending', credits: r.credits || 0, opId: row.op_id,
            provenanceJson: JSON.stringify({ provider: three ? r.provider : 'higgsfield', preset: r.preset, endpoint: pre.endpoint, resolution: r.resolution, durationS: r.durationS, estimatedUsd: r.estimatedUsd, intent: r.intent, role: r.role, sourceAssetId: r.sourceAssetId, prompt: params.prompt, requestedAt: r.submittedAt, premiumJobId: id }), createdAt: r.submittedAt });
          log({ step: 'submitted', jobId: id, role: r.role, providerJobId: sub.requestId, model: pre.endpoint, resolution: r.resolution, durationS: r.durationS, estimatedUsd: r.estimatedUsd });
        } catch (e) {
          // a refusal the provider answered (a 4xx) was not accepted: no cost. Anything else -- no answer, a timeout, a 5xx
          // -- may or may not have been accepted: a possible provider cost, never sent again
          const refused = !!(e && e.status && e.status >= 400 && e.status < 500); const unsent = !params;
          // a BUSY 3D provider (429: too many at once) refused it outright -- nothing was made, nothing is owed. The role
          // goes back to waiting and is offered again later; it was never a submission (its mark is taken back, so the
          // one-submission limit still means what it says)
          if (three && e && e.busy && (r.busyTries || 0) < P.maxBusyTries) {
            r.busyTries = (r.busyTries || 0) + 1; r.state = 'pending'; r.providerState = 'not_sent'; delete r.submittingAt;
            r.nextSubmitAt = iso(clock() + P.busyRetryMs * Math.min(6, r.busyTries)); release(id, r);
            log({ step: 'provider-busy', jobId: id, role: r.role, tries: r.busyTries }); save(); continue;
          }
          outcome(r, 'failed', refused || unsent ? (unsent ? 'not_sent' : 'rejected') : 'unknown', { code: refused || unsent ? 'provider_refused' : 'submission_uncertain', reason: refused || unsent ? `it could not be sent to the media provider (${said(e)})` : 'the media provider did not confirm it; it was not sent again' });
          release(id, r); log({ step: 'submit-failed', jobId: id, role: r.role, providerState: r.providerState, error: said(e) });
        }
        save();
      }
      // 3. each role at the provider: checked on its own
      for (const r of roles.filter(x => x.state === 'submitted' || x.state === 'processing')) {
        const age = clock() - Date.parse(r.submittedAt);
        let s;
        try { s = await (is3D(r) ? provider3D(r) : provider).status(r.providerJobId); r.errors = 0; } catch (e) {
          // (an unreachable provider is not a failure; past the hard deadline the role is unresolved -- possible cost)
          r.errors = (r.errors || 0) + 1; r.checkedAt = iso(clock());
          if (age > P.hardDeadlineMs) { outcome(r, 'failed', 'unknown', { code: 'provider_unresolved', reason: 'the media provider could not be reached to finish it' }); release(id, r); }
          save(); continue;
        }
        r.polls = (r.polls || 0) + 1; r.checkedAt = iso(clock());
        if (s.status === 'completed' && s.outputUrl) {
          // the provider made it (its cost is incurred): from here only the download is ever retried
          Object.assign(r, { state: 'downloading', providerState: 'completed', outputUrl: s.outputUrl, providerCompletedAt: iso(clock()), downloadTries: 0 }); release(id, r);
          log({ step: 'provider-completed', jobId: id, role: r.role, providerJobId: r.providerJobId, observedUsd: r.observedUsd });
        } else if (['failed', 'nsfw', 'canceled'].includes(s.status)) {
          const cancelled = s.status === 'canceled';
          outcome(r, 'failed', cancelled ? 'cancelled' : 'failed', cancelled ? { code: 'cancelled', reason: 'it was cancelled at the deadline' } : { code: 'provider_failed', providerStatus: s.status, reason: s.status === 'nsfw' ? 'the provider declined the content' : `the provider reported ${s.status}` });
          if (db.premiumMedia) db.premiumMedia.update(r.mediaId, { status: 'failed', cost_usd: 0 }, iso(clock()));
          release(id, r); log({ step: 'provider-failed', jobId: id, role: r.role, providerStatus: s.status });
        } else {
          r.state = 'processing';
          // the soft deadline (the server's clock -- never a browser's): ask the provider to cancel, once. Only a cancellation
          // it confirms ends the role; otherwise it keeps being checked -- slowly -- and a late clip is still delivered
          if (age > P.softDeadlineMs && !r.cancelRequestedAt) {
            r.cancelRequestedAt = iso(clock()); r.late = true;
            let ok = false; try { ok = await (is3D(r) ? provider3D(r) : provider).cancel(r.providerJobId); } catch (e) { ok = false; }
            r.cancelAnswer = ok ? 'requested' : 'not_confirmed';
            log({ step: 'deadline-cancel', jobId: id, role: r.role, providerJobId: r.providerJobId, answer: r.cancelAnswer });
          } else if (age > P.softDeadlineMs) r.late = true;
          // the hard deadline: not finished, not cancelled -- unresolved, a possible provider cost (never claimed avoided)
          if (age > P.hardDeadlineMs) { outcome(r, 'failed', 'unknown', { code: 'provider_unresolved', reason: 'it was still not finished after the deadline' }); release(id, r); if (db.premiumMedia) db.premiumMedia.update(r.mediaId, { status: 'failed' }, iso(clock())); }
        }
        save();
      }
      // 4. each finished clip: downloaded and stored -- retried (bounded) on a temporary error, never generated again
      for (const r of roles.filter(x => x.state === 'downloading' || x.state === 'verifying')) {
        if (r.nextDownloadAt && Date.parse(r.nextDownloadAt) > clock()) continue;
        const three = is3D(r); const pre = three ? PRESET_3D : presets[r.preset] || {}; r.downloadTries = (r.downloadTries || 0) + 1;
        try {
          let file = await (three ? provider3D(r) : provider).download(r.outputUrl, pre.mediaType || 'video');
          // a 3D model: what the provider made is normalised (Blender) and measured against the shipping budget before it
          // is stored. Not possible yet -> tried again, like a download; never possible -> a failed role (below)
          let made = null;
          if (three) {
            r.state = 'verifying'; save(); // (seen by the owner; a restart here just downloads and checks again)
            made = typeof d.process3D === 'function' ? await d.process3D(file, r, row) : { ok: false, code: 'no_processor', reason: 'this server cannot process 3D models', retry: false };
            if (!made.ok) { const e = new Error(made.reason || made.code || 'the model could not be processed'); if (!made.retry) e.final = { code: made.code || 'processing_failed', stage: made.stage || '' }; throw e; }
            file = { bytes: made.bytes, mime: 'model/gltf-binary' };
          }
          const mime = three ? 'model/gltf-binary' : (pre.mediaType || 'video') === 'video' ? 'video/mp4' : (/^image\/(png|jpeg|webp)$/.test(file.mime) ? file.mime : 'image/png');
          const assetRef = d.store(file.bytes, mime);
          outcome(r, 'delivered', 'completed'); Object.assign(r, { assetRef, outputMime: mime, bytes: file.bytes.length, completedAt: iso(clock()) }, made ? { threeD: Object.assign({}, made.asset, { assetRef }) } : {}); delete r.outputUrl; delete r.nextDownloadAt;
          if (db.premiumMedia) db.premiumMedia.update(r.mediaId, { status: 'completed', cost_usd: r.observedUsd || 0, asset_ref: assetRef, mime, bytes: file.bytes.length, provenance_json: JSON.stringify({ provider: three ? r.provider : 'higgsfield', preset: r.preset, endpoint: r.model, resolution: r.resolution, durationS: r.durationS, estimatedUsd: r.estimatedUsd, observedCostUsd: r.observedUsd, intent: r.intent, role: r.role, sourceAssetId: r.sourceAssetId, providerJobId: r.providerJobId, outcome: 'completed', completedAt: r.completedAt, storedAs: assetRef, premiumJobId: id, terms: three ? "a 3D model made from the owner's own upload; check the provider's current terms for commercial use of outputs" : "generated by Higgsfield for this website; check Higgsfield's current terms for commercial use of outputs", ...(r.source ? { cinematicSource: r.source } : {}) }) }, r.completedAt);
          if (db.usage && !three) db.usage.add(row.op_id, { higgsfield_jobs: 1, higgsfield_usd: r.observedUsd || 0 }, r.completedAt);
          if (r.observedUsd > 0) credits.addProviderUsd(db, row.op_id, r.observedUsd, new Date(clock()));
          log({ step: 'delivered', jobId: id, role: r.role, providerJobId: r.providerJobId, downloadTries: r.downloadTries });
        } catch (e) {
          r.downloadError = said(e);
          if (e && e.final) {
            // the provider made it (incurred) but it is not a model a website may show: recorded, its credits returned
            outcome(r, 'failed', 'completed', { code: 'processing_failed', detail: e.final.code, reason: `the 3D model could not be prepared for the website (${said(e)})` });
            if (db.premiumMedia) db.premiumMedia.update(r.mediaId, { status: 'failed', cost_usd: r.observedUsd || 0 }, iso(clock()));
            if (r.observedUsd > 0) credits.addProviderUsd(db, row.op_id, r.observedUsd, new Date(clock()));
            log({ step: 'processing-failed', jobId: id, role: r.role, providerJobId: r.providerJobId, stage: e.final.stage, code: e.final.code });
          } else if (r.downloadTries >= P.maxDownloadTries) {
            // the provider made it (incurred) but it could not be fetched: kept as a record (provider job id, outcome) for
            // recovery; the owner's credits for it are returned
            outcome(r, 'failed', 'completed', { code: 'download_failed', reason: 'the finished clip could not be downloaded' });
            if (db.usage && !three) db.usage.add(row.op_id, { higgsfield_jobs: 1, higgsfield_usd: r.observedUsd || 0 }, iso(clock()));
            log({ step: 'download-failed', jobId: id, role: r.role, providerJobId: r.providerJobId, tries: r.downloadTries, error: r.downloadError });
          } else r.nextDownloadAt = iso(clock() + P.downloadRetryMs * Math.min(4, r.downloadTries));
        }
        save();
      }
      // 5. every role has an outcome: settle once; else check again later
      if (roles.every(r => ROLE_DONE.has(r.state))) {
        save(); const done = settle(db, id, clock());
        log(Object.assign({ step: 'settled' }, done ? telemetry(done) : { jobId: id }));
        return;
      }
      const wait = delayFor(row, roles); save({ next_check_at: iso(clock() + wait) }); schedule(id, wait);
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

module.exports = { ROLE_STATES, JOB_STATES, PROVIDER_STATES, MAX_CLIPS, ACTIVE, LABEL, PRESET_3D, is3D, policy, create, view, telemetry, settle, messageFor, createWorker, rolesOf };
