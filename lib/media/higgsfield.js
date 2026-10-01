'use strict';
// HIGGSFIELD -- the optional premium media provider (server only). Built against Higgsfield's documented API
// (docs.higgsfield.ai): https://api.higgsfield.ai, header "Authorization: Key <key id>:<key secret>", asynchronous
// requests -- POST /<model endpoint> -> { status: 'queued', request_id, status_url, cancel_url }; GET
// /requests/<id>/status -> queued | in_progress | completed | failed | nsfw | canceled; a completed request carries
// images[].url or video.url. Failed and NSFW-flagged requests are not charged by Higgsfield. Outputs are kept for at least
// 7 days, so SiteRemade downloads every finished output immediately and stores it as its own project asset -- a website
// never hotlinks a provider URL.
//
// HIGGSFIELD_API_KEY holds "<key id>:<key secret>" (the two parts Higgsfield issues). It comes from the environment through
// lib/paid-providers.js only (production / an explicit override), and is never logged, serialised, returned or exported:
// every error text leaving this module is scrubbed of it.
//
// Bounded by construction: one submit per asset (no retry loop -- a failed request is reported, not resubmitted), a fixed
// number of status polls, a download size cap.
const BASE = 'https://api.higgsfield.ai';
const TERMINAL = new Set(['completed', 'failed', 'nsfw', 'canceled', 'cancelled']);
const MAX_BYTES = { image: 15 * 1024 * 1024, video: 60 * 1024 * 1024 };

function scrub(text, key) {
  let s = String(text || ''); if (key) { s = s.split(key).join('[key]'); key.split(':').filter(p => p.length >= 6).forEach(p => { s = s.split(p).join('[key]'); }); }
  return s.slice(0, 240);
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

// deps: { key, fetchImpl, pollMs, maxPolls, timeoutMs, sleepImpl }
function createHiggsfield(deps) {
  const d = deps || {}; const key = String(d.key || ''); const f = d.fetchImpl || ((...a) => globalThis.fetch(...a));
  const pollMs = d.pollMs == null ? 4000 : d.pollMs; const maxPolls = d.maxPolls || 60; const wait = d.sleepImpl || sleep;
  const headers = () => ({ Authorization: `Key ${key}`, 'Content-Type': 'application/json', Accept: 'application/json' });
  async function call(method, url, body) {
    const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), d.timeoutMs || 30000);
    try {
      const res = await f(url, { method, headers: headers(), body: body ? JSON.stringify(body) : undefined, signal: ctl.signal, redirect: 'error' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { const e = new Error(scrub(`Higgsfield returned ${res.status}${data && (data.detail || data.message) ? ': ' + JSON.stringify(data.detail || data.message) : ''}`, key)); e.status = res.status; throw e; }
      return data;
    } catch (e) { if (e.status) throw e; throw new Error(scrub(e && e.name === 'AbortError' ? 'Higgsfield did not answer in time' : `Higgsfield request failed: ${e && e.message || e}`, key)); }
    finally { clearTimeout(timer); }
  }
  return {
    configured: () => !!key,
    // one request (never retried here): -> { requestId, status }
    async submit(endpoint, params) {
      if (!key) throw new Error('Higgsfield is unavailable: HIGGSFIELD_API_KEY is not set on this server');
      if (!/^[a-z0-9][a-z0-9._/-]{2,80}$/i.test(String(endpoint || '')) || /\.\./.test(endpoint)) throw new Error('invalid Higgsfield model endpoint');
      const r = await call('POST', `${BASE}/${endpoint}`, params);
      const requestId = String(r.request_id || '').slice(0, 120);
      if (!/^[\w-]{4,120}$/.test(requestId)) throw new Error('Higgsfield returned no request id');
      return { requestId, status: String(r.status || 'queued') };
    },
    async status(requestId) { const r = await call('GET', `${BASE}/requests/${encodeURIComponent(requestId)}/status`); return normalise(r); },
    async cancel(requestId) { try { await call('POST', `${BASE}/requests/${encodeURIComponent(requestId)}/cancel`); return true; } catch (e) { return false; } },
    // poll a bounded number of times; a request still running at the end is cancelled (Higgsfield cancels only queued
    // requests -- one already processing finishes on its side and is reported as timed out here)
    async waitFor(requestId) {
      for (let i = 0; i < maxPolls; i++) {
        const s = await this.status(requestId);
        if (TERMINAL.has(s.status)) return s;
        if (pollMs) await wait(pollMs);
      }
      await this.cancel(requestId);
      return { status: 'timeout', requestId };
    },
    // the finished output, downloaded into memory (https only, size-capped)
    async download(url, mediaType) {
      if (!/^https:\/\//.test(String(url || ''))) throw new Error('Higgsfield output is not an https URL');
      const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), d.timeoutMs || 60000);
      try {
        const res = await f(url, { signal: ctl.signal });
        if (!res.ok) throw new Error(`the output could not be downloaded (${res.status})`);
        const buf = Buffer.from(await res.arrayBuffer());
        if (!buf.length || buf.length > MAX_BYTES[mediaType === 'video' ? 'video' : 'image']) throw new Error('the output is empty or too large');
        return { bytes: buf, mime: String(res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase() };
      } finally { clearTimeout(timer); }
    },
  };
}
function normalise(r) {
  const status = String((r && r.status) || '').toLowerCase();
  const out = { status: status === 'cancelled' ? 'canceled' : status, requestId: String((r && r.request_id) || '') };
  if (r && r.video && r.video.url) Object.assign(out, { outputUrl: String(r.video.url), mediaType: 'video' });
  else if (r && Array.isArray(r.images) && r.images[0] && r.images[0].url) Object.assign(out, { outputUrl: String(r.images[0].url), mediaType: 'image' });
  return out;
}

module.exports = { createHiggsfield, normalise, scrub, BASE, MAX_BYTES };
