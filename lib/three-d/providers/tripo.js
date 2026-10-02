'use strict';
// TRIPO -- the first real image-to-3D provider (server only), behind the adapter interface of lib/three-d/provider.js.
// Built against Tripo's documented V3 API (developers.tripo3d.ai; V2 is retired on 1 November 2026 and is not used):
//   https://openapi.tripo3d.ai/v3, header "Authorization: Bearer <key>", JSON answers { code: 0, data } (code != 0: an error)
//   POST /generation/image-to-model  { input: <image url>, model, texture, pbr, face_limit, ... } -> { data: { task_id } }
//   GET  /tasks/<task_id>            -> { data: { status: queued | running | success | failed | cancelled | banned,
//                                        progress, output: { model_url }, error_code, error_message } }
// Failed and cancelled tasks are not charged by Tripo. It has not been called for real from this code yet: the shapes
// above are the documentation's, proven here against a fake (test/helpers/mock-tripo.js).
//
// TRIPO_API_KEY comes from the environment through lib/paid-providers.js only (production / an explicit override) and is
// never logged, serialised, returned or exported: every error text leaving this module is scrubbed of it. Without a key
// -- which is every development machine and every test -- no call here reaches the network at all.
//
// WHAT IS ASKED FOR, always, and nothing else (a model a website can show, as the provider's own file):
//   one image (the owner's own upload, by SiteRemade's scoped, durable source link -- never a picture found on the web);
//   a PINNED model version (never "latest": a model update must not change what customers get overnight); a GLB with PBR
//   materials; an explicit face_limit; triangles (quad: false -- quad output is FBX); no `compress` (it meshopt-compresses
//   the file, which neither the website's engine nor the checks can read); no parts, no low-poly restyle.
//
// THE FOUR CALLS (lib/premium-jobs.js decides when: there is no waiting loop here, and nothing is ever retried here)
//   submit    one request. The answer is a task id and nothing else. A refusal Tripo answered carries its HTTP status
//             (e.status: no cost; 429 also e.busy: it may be asked again later); no answer at all carries none (uncertain:
//             the job never sends it again). The image is checked BEFORE anything is sent: JPEG or PNG, within Tripo's size.
//   status    queued | in_progress | completed | failed | canceled | nsfw (Tripo's "banned": refused, no cost). A
//             completed task answers with a REFERENCE to itself ("tripo:task:<id>"), never Tripo's download address --
//             that address is signed and expires within minutes, so it is never kept.
//   cancel    Tripo's V3 documents no cancellation: always "not confirmed" (the job keeps checking, as it must).
//   download  asks the task again for a fresh address, EVERY attempt, downloads the bytes at once (size-capped), and
//             hands back the file. After that SiteRemade's stored copy is the only one that matters.
const TD = require('../../creative/three-d');

const BASE = 'https://openapi.tripo3d.ai/v3';
const DEFAULT_MODEL = 'v3.1-20260211';
const MODEL = /^[A-Za-z][A-Za-z0-9]*(?:[.-][A-Za-z0-9]+){1,4}$/; // a dated version (v3.1-20260211, P1-20260311): never a moving name
const TASK = /^[\w-]{4,120}$/;
const REF = /^tripo:task:([\w-]{4,120})$/;
// what Tripo accepts as an input image (it also takes WebP; SiteRemade sends the two formats every provider takes)
const INPUT = { mimes: ['image/jpeg', 'image/png'], maxBytes: 20 * 1024 * 1024, minBytes: 200 };
// triangles asked for: a model a browser turns smoothly, well inside what may ship (TD.LIMITS.triangles)
const FACE_LIMIT = 50000;
const MOVING = /^(latest|default|stable|current|newest)$/i;

function scrub(text, key) { let s = String(text || ''); if (key && key.length >= 6) s = s.split(key).join('[key]'); return s.replace(/Bearer\s+\S+/gi, 'Bearer [key]').slice(0, 240); }
// -> the pinned version to ask for, or '' when the configured one is not a pinned version
function modelVersion(raw) { const v = String(raw == null ? '' : raw).trim(); if (!v) return DEFAULT_MODEL; return MODEL.test(v) && !MOVING.test(v) && /\d{6,8}$/.test(v) ? v : ''; }
// the image as it must be before it is sent: -> '' (fine) or why not
function inputProblem(image) {
  const i = image || {}; const mime = String(i.mime || '').toLowerCase();
  if (!INPUT.mimes.includes(mime)) return 'the source picture must be a JPEG or a PNG';
  const n = Number(i.bytes);
  if (!Number.isFinite(n) || n < INPUT.minBytes) return 'the source picture could not be measured';
  if (n > INPUT.maxBytes) return `the source picture is larger than ${Math.round(INPUT.maxBytes / 1048576)} MB`;
  return '';
}
// exactly what is sent to make one model
function requestBody(imageUrl, model, faceLimit) {
  return { input: imageUrl, model, texture: true, pbr: true, texture_quality: 'standard', face_limit: faceLimit, quad: false, smart_low_poly: false, generate_parts: false, auto_size: false };
}

// deps: { key: string | () => string, model (SITEREMADE_3D_MODEL_VERSION), faceLimit, fetchImpl, timeoutMs, maxBytes }
function createTripo(deps) {
  const d = deps || {}; const f = d.fetchImpl || ((...a) => globalThis.fetch(...a));
  const keyOf = () => String((typeof d.key === 'function' ? d.key() : d.key) || '');
  const model = modelVersion(d.model); const faceLimit = Math.max(1000, Math.min(TD.LIMITS.triangles, Math.round(Number(d.faceLimit) || FACE_LIMIT)));
  const maxBytes = d.maxBytes || TD.LIMITS.inputBytes;
  // a refusal made HERE, before anything was sent (no cost, by construction)
  const refuse = (msg) => Object.assign(new Error(msg), { status: 400, notSent: true });
  async function call(method, path, body) {
    const key = keyOf();
    if (!key) throw refuse('Tripo is unavailable: no API key on this server, or paid providers are switched off here');
    const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), d.timeoutMs || 30000);
    try {
      const res = await f(`${BASE}${path}`, { method, headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Accept: 'application/json' }, body: body ? JSON.stringify(body) : undefined, signal: ctl.signal, redirect: 'error' });
      const data = await res.json().catch(() => null);
      const code = data && typeof data.code === 'number' ? data.code : null;
      if (!res.ok || (code !== null && code !== 0)) {
        // Tripo answered, and the answer is no: nothing was made. (An HTTP 200 carrying an error code is a refusal too.)
        const e = new Error(scrub(`Tripo returned ${res.status}${code ? ` (code ${code})` : ''}${data && data.message ? ': ' + String(data.message) : ''}`, key));
        e.status = res.ok ? 400 : res.status; e.code = code; e.trace = String((res.headers && res.headers.get && res.headers.get('x-tripo-trace-id')) || '').slice(0, 80);
        // (too many at once / too fast: not made, and worth asking again later -- Tripo allows a few tasks at a time)
        if (res.status === 429 || code === 2000) { e.busy = true; e.status = 429; }
        throw e;
      }
      if (!data || !data.data || typeof data.data !== 'object') throw new Error('Tripo answered without a body');
      return data.data;
    } catch (e) { if (e.status) throw e; throw new Error(scrub(e && e.name === 'AbortError' ? 'Tripo did not answer in time' : `Tripo request failed: ${(e && e.message) || e}`, key)); }
    finally { clearTimeout(timer); }
  }
  // where a finished task's file is, as Tripo names it today (and as its older answers did)
  const modelUrlOf = out => { const o = out && typeof out === 'object' ? out : {}; for (const k of ['model_url', 'pbr_model_url', 'pbr_model', 'model']) { const v = o[k] && typeof o[k] === 'object' ? o[k].url : o[k]; if (typeof v === 'string' && v) return v; } return ''; };
  return {
    name: 'tripo', model, faceLimit,
    configured: () => !!keyOf() && !!model,
    // params: { image_url (SiteRemade's scoped source link), image: { mime, bytes } (what that link serves), requestId }
    async submit(endpoint, params) {
      const p = params || {};
      if (!model) throw refuse('Tripo is unavailable: SITEREMADE_3D_MODEL_VERSION must be a pinned model version');
      if (!/^https?:\/\/[^\s"'<>]{8,600}$/.test(String(p.image_url || ''))) throw refuse('there is no source link for the picture');
      const bad = inputProblem(p.image); if (bad) throw refuse(bad);
      const r = await call('POST', '/generation/image-to-model', requestBody(p.image_url, model, faceLimit));
      const id = String(r.task_id || '');
      // (accepted, but no id came back: it may exist at Tripo -- uncertain, never sent again)
      if (!TASK.test(id)) throw new Error('Tripo returned no task id');
      return { requestId: id, status: 'queued' };
    },
    async status(requestId) {
      if (!TASK.test(String(requestId || ''))) throw new Error('not a Tripo task id');
      const t = await call('GET', `/tasks/${encodeURIComponent(requestId)}`);
      const s = String(t.status || '').toLowerCase(); const out = { requestId: String(requestId), progress: Number(t.progress) || 0 };
      if (s === 'success') return modelUrlOf(t.output) ? Object.assign(out, { status: 'completed', outputUrl: `tripo:task:${requestId}`, mediaType: 'model3d' }) : Object.assign(out, { status: 'failed', reason: 'the provider finished without a model' });
      if (s === 'failed' || s === 'expired') return Object.assign(out, { status: 'failed', reason: scrub(t.error_message || '', keyOf()).slice(0, 120) });
      if (s === 'banned') return Object.assign(out, { status: 'nsfw' });
      if (s === 'cancelled' || s === 'canceled') return Object.assign(out, { status: 'canceled' });
      return Object.assign(out, { status: s === 'queued' ? 'queued' : 'in_progress' });
    },
    async cancel() { return false; },
    // ref: "tripo:task:<id>" -- the only thing a completed status hands out. Anything else (an address someone kept) is refused.
    async download(ref) {
      const m = REF.exec(String(ref || '')); if (!m) throw new Error('not a Tripo task reference (a download address is never kept)');
      const t = await call('GET', `/tasks/${encodeURIComponent(m[1])}`);
      const url = String(t.status || '').toLowerCase() === 'success' ? modelUrlOf(t.output) : '';
      if (!/^https:\/\/[^\s"'<>]+$/.test(url)) throw new Error('Tripo has no download address for this task right now');
      const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), d.downloadTimeoutMs || 90000);
      try {
        const res = await f(url, { signal: ctl.signal });
        if (!res.ok) throw new Error(`the model could not be downloaded (${res.status})`);
        const declared = Number(res.headers && res.headers.get && res.headers.get('content-length'));
        if (declared > maxBytes) throw new Error('the model is too large to download');
        const bytes = Buffer.from(await res.arrayBuffer());
        if (!bytes.length || bytes.length > maxBytes) throw new Error('the model is empty or too large');
        return { bytes, mime: TD.MIME, sourceFormat: 'glb', modelFile: { name: 'model.glb', bytes }, textures: [], metadata: { upAxis: 'Y', generator: 'tripo', model } };
      } catch (e) { throw new Error(scrub(e && e.name === 'AbortError' ? 'the model download did not finish in time' : (e && e.message) || 'the model could not be downloaded', keyOf())); }
      finally { clearTimeout(timer); }
    },
  };
}

module.exports = { createTripo, modelVersion, inputProblem, requestBody, scrub, BASE, DEFAULT_MODEL, INPUT, FACE_LIMIT };
