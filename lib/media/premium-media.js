'use strict';
// PREMIUM MEDIA -- provider-neutral. SiteRemade composes the website (direction, timeline, DOM and spatial renderers,
// typography, transitions, storage, export); a premium media provider (Higgsfield today) only supplies an occasional
// asset SiteRemade cannot reasonably make itself. The order of preference is fixed:
//   1 the customer's own assets   2 SiteRemade DOM/CSS   3 the spatial renderer   4 discovered, approved imagery
//   5 light image treatment       6 premium media -- only for a meaningful improvement nothing above can reproduce
//
// Bounded by construction:
//   - INTENTS is the whole vocabulary (the Creative plan names an intent and a source picture -- never an API parameter);
//     each intent maps to a fixed PRESET (endpoint, duration, resolution) chosen here
//   - at most LIMITS.perGeneration premium assets per generation; one submit per asset, no retry loop
//   - every submit is checked against the operation's provider-spend ceiling first (lib/provider-budget.js); an
//     extended preset is downgraded, anything else that does not fit is dropped -- never silently exceeded
//   - the SOURCE must be the owner's own upload, a derived cut-out of an eligible picture, a discovered picture whose
//     stated licence permits modification, or a picture the owner picked AND explicitly confirmed for transformation.
//     Rights-unclear discovered imagery is never sent (Google/SerpApi = discovery; permission or owner approval = the
//     gate; the provider = optional transformation; SiteRemade = the final composition). No Wikimedia, ever.
//   - every finished output is downloaded and stored as a project asset (content-addressed) with its provenance; the
//     website and its export use that local file, never a provider URL
const crypto = require('crypto');

const INTENTS = {
  cinematic_hero: { mediaType: 'video', preset: 'video_5s_720p', prompt: 'slow cinematic camera move, subtle parallax and light, the subject stays exactly as it is' },
  object_motion: { mediaType: 'video', preset: 'video_5s_720p', prompt: 'the object turns slowly in place, studio light, no change to its shape or details' },
  image_to_video: { mediaType: 'video', preset: 'video_5s_720p', prompt: 'gentle natural motion, the scene stays faithful to the picture' },
  environment_motion: { mediaType: 'video', preset: 'video_5s_720p', prompt: 'ambient atmospheric motion in the environment, slow and seamless' },
  premium_transition: { mediaType: 'video', preset: 'video_5s_720p', prompt: 'a smooth continuous camera move through the scene' },
  alternate_angle: { mediaType: 'image', preset: 'image_standard', prompt: 'the same subject seen from another angle, faithful to its design' },
  image_enhance: { mediaType: 'image', preset: 'image_standard', prompt: 'the same picture, cleaner light and detail, nothing added or removed' },
  stylized_treatment: { mediaType: 'image', preset: 'image_standard', prompt: 'the same picture in a refined editorial colour treatment' },
};
const INTENT_NAMES = Object.keys(INTENTS);
const LIMITS = { perGeneration: 2, subjectChars: 120 };
// what each preset asks the provider for. Endpoints are configuration: the video default is Higgsfield's documented
// image-to-video model; an image-edit endpoint must be configured (HIGGSFIELD_IMAGE_ENDPOINT) before image intents run.
function presets(env = process.env) {
  const video = String(env.HIGGSFIELD_VIDEO_ENDPOINT || 'wan/v2.7/image-to-video').trim();
  const image = String(env.HIGGSFIELD_IMAGE_ENDPOINT || '').trim();
  return {
    video_5s_720p: { endpoint: video, mediaType: 'video', params: { duration: 5, resolution: '720p' }, downgrade: null },
    video_5s_1080p: { endpoint: video, mediaType: 'video', params: { duration: 5, resolution: '1080p' }, downgrade: 'video_5s_720p' },
    image_standard: { endpoint: image || null, mediaType: 'image', params: {}, downgrade: null },
  };
}

// a licence stated on the picture's own page that allows a modified version (never NoDerivatives)
const MODIFIABLE = /^(cc0|public domain|pdm|cc[- ]by(?:[- ]sa)?(?: [0-9.]+)?|cc[- ]by(?:[- ]nc)?(?:[- ]sa)?(?: [0-9.]+)?)$/i;
// -> { ok, reason }
function sourceEligibility(asset, ctx) {
  const c = ctx || {}; const a = asset;
  if (!a || a.removed || a.failed) return { ok: false, reason: 'the picture is not on the page' };
  if (/wikimedia|wikipedia/i.test(`${a.pageUrl || ''} ${a.sourceUrl || ''}`)) return { ok: false, reason: 'Wikimedia pictures are never used' };
  if (a.cutoutOf) { const parent = c.byId && c.byId.get(a.cutoutOf); return parent ? sourceEligibility(parent, c) : { ok: false, reason: 'its original picture is missing' }; }
  if (a.origin === 'upload' && !a.ownerPicked) return { ok: true, reason: "the owner's own picture" };
  if (a.ownerPicked || a.origin === 'upload') {
    return (c.confirmed || []).includes(a.id) ? { ok: true, reason: 'picked and confirmed for transformation by the owner' }
      : { ok: false, reason: 'a picture found on the web: the owner must confirm they may transform it' };
  }
  const lic = String(a.license || '').trim();
  if (a.origin === 'research' && lic && MODIFIABLE.test(lic) && !/\bnd\b/i.test(lic)) return { ok: true, reason: `stated licence ${lic} permits modification` };
  return { ok: false, reason: 'its reuse rights are unclear -- never sent for transformation automatically' };
}

const clean = (v, n) => String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f<>{}]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
// The plan's (or the owner's) premium-media requests -> the bounded, validated set SiteRemade will consider.
// raw: [{ intent, asset, subject?, why? }]; ctx: { assets, models, mode, renderer, confirmed, kind }
// -> { requests: [{ intent, mediaType, preset, sourceAssetId, subject, why }], dropped: [{ intent, reason }] }
function validateRequests(raw, ctx) {
  const c = ctx || {}; const out = []; const dropped = [];
  const byId = new Map((c.assets || []).filter(a => a && a.id).map(a => [a.id, a]));
  const hasModel = (c.models || []).length > 0;
  if (c.kind === 'business') return { requests: [], dropped: (raw || []).map(r => ({ intent: r && r.intent, reason: 'Business websites never use premium media automatically' })) };
  for (const r of (Array.isArray(raw) ? raw : []).slice(0, 6)) {
    const intent = r && INTENT_NAMES.includes(r.intent) ? r.intent : null;
    if (!intent) { dropped.push({ intent: r && r.intent, reason: 'not a premium media intent' }); continue; }
    if (out.length >= LIMITS.perGeneration) { dropped.push({ intent, reason: `at most ${LIMITS.perGeneration} premium assets per generation` }); continue; }
    if (out.some(x => x.intent === intent)) { dropped.push({ intent, reason: 'already requested' }); continue; }
    // the hierarchy: what SiteRemade already does well is never bought
    if (hasModel && ['object_motion', 'alternate_angle'].includes(intent)) { dropped.push({ intent, reason: 'the spatial renderer already turns this subject from its 3D model' }); continue; }
    if (['quiet', 'editorial'].includes(c.mode) && INTENTS[intent].mediaType === 'video') { dropped.push({ intent, reason: 'a restrained page does not need premium motion' }); continue; }
    const src = byId.get(r.asset);
    const el = sourceEligibility(src, { byId, confirmed: c.confirmed });
    if (!el.ok) { dropped.push({ intent, reason: el.reason }); continue; }
    out.push({ intent, mediaType: INTENTS[intent].mediaType, preset: INTENTS[intent].preset, sourceAssetId: src.id, subject: clean(r.subject, LIMITS.subjectChars), why: clean(r.why, 160) });
  }
  return { requests: out, dropped };
}
function promptFor(req) { return `${INTENTS[req.intent].prompt}${req.subject ? `. Subject: ${req.subject}` : ''}`.slice(0, 400); }

// Execute validated requests. deps: { db, provider (createHiggsfield), budget (createBudget), costs, presets, store(bytes,
// mime) -> assetRef, sourceUrl(req) -> public URL of the source picture, accountId, projectId, opId, now }
// -> { delivered: [intent], media: [record], failed: [{ intent, reason }] }
async function run(requests, deps) {
  const d = deps || {}; const P = d.presets || presets(); const at = () => new Date(d.now || Date.now()).toISOString();
  const out = { delivered: [], media: [], failed: [] };
  for (const req of (requests || []).slice(0, LIMITS.perGeneration)) {
    let presetKey = req.preset; let preset = P[presetKey];
    if (!preset || !preset.endpoint) { out.failed.push({ intent: req.intent, reason: `${req.mediaType} media is not configured on this server` }); continue; }
    // the budget first: an extended preset steps down; anything else that does not fit is not submitted
    let est = d.costs.higgsfield[presetKey] || 0;
    while (!d.budget.fits(est) && preset.downgrade) { presetKey = preset.downgrade; preset = P[presetKey]; est = d.costs.higgsfield[presetKey] || 0; }
    if (!d.budget.fits(est)) { out.failed.push({ intent: req.intent, reason: 'it would exceed this operation\'s budget' }); continue; }
    const hold = d.budget.check(`premium media ${req.intent}`, est);
    const id = 'pm_' + crypto.randomBytes(10).toString('base64url');
    const provenance = { provider: 'higgsfield', preset: presetKey, endpoint: preset.endpoint, intent: req.intent, sourceAssetId: req.sourceAssetId, prompt: promptFor(req), requestedAt: at() };
    d.db.premiumMedia.insert({ id, accountId: d.accountId, projectId: d.projectId, provider: 'higgsfield', mediaType: preset.mediaType, intent: req.intent, sourceAssetId: req.sourceAssetId, preset: presetKey, status: 'pending', credits: 0, opId: d.opId, provenanceJson: JSON.stringify(provenance), createdAt: at() });
    try {
      const params = Object.assign({}, preset.params, { image_url: await d.sourceUrl(req), prompt: promptFor(req) });
      const sub = await d.provider.submit(preset.endpoint, params);
      d.db.premiumMedia.update(id, { provider_job_id: sub.requestId }, at());
      const s = await d.provider.waitFor(sub.requestId);
      if (s.status !== 'completed' || !s.outputUrl) {
        // failed / nsfw / canceled are not charged by Higgsfield; a request timed out on our side may still be
        hold.settle(s.status === 'timeout' ? est : 0); d.budget.record('higgsfield', { usd: s.status === 'timeout' ? est : 0, jobs: 1, settled: true });
        d.db.premiumMedia.update(id, { status: 'failed', cost_usd: s.status === 'timeout' ? est : 0, provenance_json: JSON.stringify(Object.assign(provenance, { providerJobId: sub.requestId, outcome: s.status })) }, at());
        out.failed.push({ intent: req.intent, reason: s.status === 'nsfw' ? 'the provider declined the content' : `the provider reported ${s.status}` }); continue;
      }
      const file = await d.provider.download(s.outputUrl, preset.mediaType);
      const mime = preset.mediaType === 'video' ? 'video/mp4' : (/^image\/(png|jpeg|webp)$/.test(file.mime) ? file.mime : 'image/png');
      const assetRef = d.store(file.bytes, mime);
      hold.settle(est); d.budget.record('higgsfield', { usd: est, jobs: 1, settled: true });
      Object.assign(provenance, { providerJobId: sub.requestId, outcome: 'completed', completedAt: at(), storedAs: assetRef, costUsdEstimate: est, terms: 'generated by Higgsfield for this website; check Higgsfield\'s current terms for commercial use of outputs' });
      d.db.premiumMedia.update(id, { status: 'completed', cost_usd: est, asset_ref: assetRef, mime, bytes: file.bytes.length, provenance_json: JSON.stringify(provenance) }, at());
      out.delivered.push(req.intent);
      out.media.push({ id, intent: req.intent, mediaType: preset.mediaType, sourceAssetId: req.sourceAssetId, assetRef, mime, bytes: file.bytes.length, provider: 'higgsfield', providerJobId: sub.requestId, provenance });
    } catch (e) {
      hold.release(); d.budget.record('higgsfield', { usd: 0, jobs: 1, settled: true });
      d.db.premiumMedia.update(id, { status: 'failed', provenance_json: JSON.stringify(Object.assign(provenance, { outcome: 'error', error: String(e && e.message || e).slice(0, 200) })) }, at());
      out.failed.push({ intent: req.intent, reason: String(e && e.message || e).slice(0, 160) });
    }
  }
  return out;
}

module.exports = { INTENTS, INTENT_NAMES, LIMITS, presets, sourceEligibility, validateRequests, promptFor, run };
