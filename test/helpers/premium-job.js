'use strict';
// The premium media of a generation runs as a server job (lib/premium-jobs.js): a test STARTS it, then POLLS its status
// until it has an outcome -- exactly as the studio does. premiumRun() returns the job's outcome in the shape the older
// synchronous premium response had, so a test can say what was delivered, charged and returned.
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function startPremium(call, body) { return call('POST', '/api/creative/premium/start', body); }
async function pollPremium(call, jobId, { timeoutMs = 20000, until } = {}) {
  const t0 = Date.now(); let last = null;
  for (;;) {
    last = await call('GET', `/api/creative/premium/status/${jobId}`);
    const job = last.body && last.body.job;
    if (!job || job.terminal || (until && until(job)) || Date.now() - t0 > timeoutMs) return last;
    await sleep(50);
  }
}
async function premiumRun(call, body, opts) {
  const start = await startPremium(call, body);
  if (!start.body || !start.body.job) return { start, job: null, status: start.status, body: Object.assign({}, start.body, { premium: Object.assign({ executionStarted: false, delivered: [] }, (start.body && start.body.premium) || {}), creditsCharged: 0, creditsRefunded: 0 }) };
  const end = await pollPremium(call, start.body.job.jobId, opts); const job = end.body.job;
  const firstFail = job.failed[0];
  return {
    start, job, status: end.status,
    body: {
      ok: true, replayed: !!start.body.reused, creditsRemaining: end.body.creditsRemaining, creditsCharged: job.credits.charged, creditsRefunded: job.credits.refunded,
      assets: job.delivered,
      premium: {
        executionStarted: job.roles.some(r => r.state !== 'blocked'), delivered: job.delivered.map(m => m.video.intent), deliveredRoles: job.delivered.map(m => m.role).filter(Boolean),
        skipped: job.failed.map(f => ({ role: f.role, intent: f.intent, reason: f.code, message: f.reason })),
        status: { planned: true, made: job.delivered.map(m => m.video.intent), reason: job.completed === job.total ? '' : (firstFail && firstFail.code) || '', message: job.message },
      },
    },
  };
}
module.exports = { startPremium, pollPremium, premiumRun, sleep };
