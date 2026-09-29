'use strict';
// CREATIVE — what a saved Creative project keeps, and nothing else. Called from
// lib/project-store.js ONLY for a direction whose mode is 'creative'; Business directions
// never reach this file, so their saved shape is byte-for-byte what it was.
//
//   direction.mode      'creative'
//   direction.creative  { v, brief, understanding, supplied, research, assets, plan, motion, cost, updatedAt }
//
// Assets keep their provenance (origin, source page, author, licence, what was done to them)
// next to their pixels; the pixels are stored exactly like Business images (content-addressed
// assetRef, see project-store internalize/hydrate).

const { validatePlan } = require('./validate');
const { validatePlan2 } = require('./validate2');

const MAX_ASSETS = 24;
const MAX_DATA_URL_BYTES = 8 * 1024 * 1024;
const s = (v, n) => (typeof v === 'string' ? v : v == null ? '' : String(v)).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').slice(0, n);
const n = (v, lo, hi) => (typeof v === 'number' && isFinite(v) ? Math.max(lo, Math.min(hi, v)) : null);
const HEX = /^#[0-9a-f]{6}$/i;
const httpsUrl = v => (/^https:\/\/[^\s"'<>]+$/.test(v || '') ? s(v, 500) : '');

function cleanAssess(a) {
  if (!a || typeof a !== 'object') return null;
  const box = Array.isArray(a.subject) && a.subject.length === 4 && a.subject.every(v => typeof v === 'number' && v >= 0 && v <= 1) ? a.subject.slice() : null;
  return {
    width: n(a.width, 1, 20000) || 1, height: n(a.height, 1, 20000) || 1, aspect: n(a.aspect, 0.05, 20) || 1,
    orientation: ['landscape', 'portrait', 'square'].includes(a.orientation) ? a.orientation : 'square',
    transparentShare: n(a.transparentShare, 0, 1) || 0, transparent: !!a.transparent,
    background: a.background && typeof a.background === 'object' ? { colour: HEX.test(a.background.colour || '') ? a.background.colour : '#ffffff', uniformity: n(a.background.uniformity, 0, 1) || 0, tolerance: n(a.background.tolerance, 0, 255) || 0 } : null,
    subject: box, colours: Array.isArray(a.colours) ? a.colours.filter(c => HEX.test(c)).slice(0, 6) : [],
    luminance: n(a.luminance, 0, 255) || 0, megapixels: n(a.megapixels, 0, 400) || 0,
  };
}
const ROLES = ['subject', 'environment', 'supporting', 'detail', 'logo', 'reference', 'unrelated'];
function cleanCuration(c) {
  if (!c || typeof c !== 'object') return null;
  return { role: ROLES.includes(c.role) ? c.role : 'unrelated', identity: ['exact', 'form', 'related', 'other'].includes(c.identity) ? c.identity : 'other', depicts: s(c.depicts, 160), issues: cleanStrings(c.issues, 5, 20), separable: !!c.separable, quality: n(c.quality, 0, 3) || 0 };
}
function cleanAsset(raw) {
  if (!raw || typeof raw !== 'object' || !/^[\w-]{1,40}$/.test(raw.id || '')) return null;
  const out = {
    id: raw.id, origin: ['upload', 'research', 'derived'].includes(raw.origin) ? raw.origin : 'upload',
    title: s(raw.title, 200), alt: s(raw.alt, 300), author: s(raw.author, 200), license: s(raw.license, 80),
    licenseUrl: /^https?:\/\//.test(raw.licenseUrl || '') ? s(raw.licenseUrl, 400) : '', pageUrl: httpsUrl(raw.pageUrl), sourceUrl: httpsUrl(raw.sourceUrl),
    found: s(raw.found, 40), relevance: n(raw.relevance, -5, 5) || 0, retrieved: s(raw.retrieved, 40),
    assess: cleanAssess(raw.assess), caps: raw.caps && typeof raw.caps === 'object' ? { moveFreely: !!raw.caps.moveFreely, frame: !!raw.caps.frame, backdrop: !!raw.caps.backdrop, heroSize: !!raw.caps.heroSize, lowRes: !!raw.caps.lowRes } : null,
    cutout: !!raw.cutout, illustration: !!raw.illustration, removed: !!raw.removed, failed: !!raw.failed,
    processing: s(raw.processing, 200), mime: /^image\/(png|jpeg|webp|gif)$/.test(raw.mime || '') ? raw.mime : '',
    fixture: raw.fixture ? s(raw.fixture, 200) : undefined,
    // what the picture check saw in it (research pictures): kept, so reopening never judges the pictures again
    kind: ['logo', 'reference', 'form'].includes(raw.kind) ? raw.kind : '',
    // the owner's role for an upload, a picture's source-stated rights evidence (web), and an owner's affirmation of rights
    ownerRole: ['main', 'background', 'logo', 'supporting'].includes(raw.ownerRole) ? raw.ownerRole : undefined, rightsEvidence: Array.isArray(raw.rightsEvidence) ? cleanStrings(raw.rightsEvidence, 3, 240) : undefined, ownerAffirmed: raw.ownerAffirmed ? true : undefined,
    focus: /^\d{1,3}% \d{1,3}%$/.test(raw.focus || '') ? raw.focus : undefined,
    curation: cleanCuration(raw.curation),
  };
  if (!out.curation) delete out.curation;
  ['ownerRole', 'rightsEvidence', 'ownerAffirmed', 'focus'].forEach(k => { if (out[k] === undefined) delete out[k]; });
  if (raw.cutoutOf && /^[\w-]{1,40}$/.test(raw.cutoutOf)) out.cutoutOf = raw.cutoutOf;
  if (typeof raw.dataUrl === 'string' && raw.dataUrl) {
    const m = /^data:(image\/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/=]+)$/.exec(raw.dataUrl);
    if (!m || Math.floor(m[2].length * 0.75) > MAX_DATA_URL_BYTES) return null;
    out.dataUrl = raw.dataUrl;
  } else if (typeof raw.assetRef === 'string' && /^[a-f0-9]{64}$/.test(raw.assetRef)) out.assetRef = raw.assetRef;
  else if (!out.removed) return null; // an asset with no pixels is only kept as a removed record
  if (out.fixture === undefined) delete out.fixture;
  return out;
}
function cleanFacts(list) { return (Array.isArray(list) ? list : []).slice(0, 40).map(f => f && typeof f === 'object' && ({ id: s(f.id, 20), text: s(f.text, 600), section: s(f.section, 80), source: f.source && typeof f.source === 'object' ? { title: s(f.source.title, 200), url: httpsUrl(f.source.url), license: s(f.source.license, 80) } : undefined })).filter(f => f && f.id && f.text); }
function cleanStrings(list, max, len) { return (Array.isArray(list) ? list : []).slice(0, max).map(x => s(x, len).trim()).filter(Boolean); }

function sanitizeCreative(raw) {
  const c = raw && typeof raw === 'object' ? raw : {};
  const u = c.understanding && typeof c.understanding === 'object' ? c.understanding : {};
  const understanding = {
    kind: ['recognizable', 'personal', 'fictional', 'invented', 'ambiguous'].includes(u.kind) ? u.kind : 'recognizable',
    subject: s(u.subject, 120), name: s(u.name, 80), relation: s(u.relation, 10), species: u.species ? s(u.species, 40) : null, noun: s(u.noun, 40),
    query: u.query ? s(u.query, 160) : null, purpose: s(u.purpose, 20), asks: cleanStrings(u.asks, 4, 200), brief: s(u.brief, 1200),
    // the rules reader stores tone as a word; the AI understanding as { register, words, fromBrief }
    tone: u.tone && typeof u.tone === 'object' ? { register: s(u.tone.register, 20), words: cleanStrings(u.tone.words, 5, 30), fromBrief: !!u.tone.fromBrief } : s(u.tone, 20),
    ...(u.source === 'ai' ? {
      source: 'ai', identity: u.identity && typeof u.identity === 'object' ? { name: s(u.identity.name, 120), kind: s(u.identity.kind, 20), what: s(u.identity.what, 240), confidence: s(u.identity.confidence, 10) } : null,
      audience: s(u.audience, 160), motifs: cleanStrings(u.motifs, 8, 80), uncertainty: cleanStrings(u.uncertainty, 5, 200),
      research: u.research && typeof u.research === 'object' ? { scope: s(u.research.scope, 20), wikipediaTitles: cleanStrings(u.research.wikipediaTitles, 3, 160), commonsQueries: cleanStrings(u.research.commonsQueries, 4, 100), note: s(u.research.note, 200) } : null,
      visuals: u.visuals && typeof u.visuals === 'object' ? { main: s(u.visuals.main, 200), setting: s(u.visuals.setting, 200), supporting: cleanStrings(u.visuals.supporting, 4, 120) } : null,
      legacy: u.legacy && typeof u.legacy === 'object' ? { tone: s(u.legacy.tone, 20), purpose: s(u.legacy.purpose, 20), asks: cleanStrings(u.legacy.asks, 4, 200) } : null,
    } : {}),
  };
  const r = c.research && typeof c.research === 'object' ? c.research : {};
  const page = r.page && typeof r.page === 'object' ? { title: s(r.page.title, 200), url: httpsUrl(r.page.url), description: s(r.page.description, 300), extract: s(r.page.extract, 2000), license: s(r.page.license, 80), retrieved: s(r.page.retrieved, 40), category: s(r.page.category, 20) } : null;
  const assets = (Array.isArray(c.assets) ? c.assets : []).slice(0, MAX_ASSETS).map(cleanAsset).filter(Boolean);
  // the accepted plan is kept exactly as validated: reopening or exporting never plans again
  const facts = cleanFacts(r.facts);
  const planOf = x => (x && typeof x === 'object' ? (x.v === 2 ? validatePlan2(x, { mode: 'safety', page, assets, facts: x.facts || facts, understanding, supplied: [].concat(cleanStrings(c.supplied && c.supplied.facts, 12, 300), cleanStrings(c.supplied && c.supplied.memories, 8, 300)) }).plan : validatePlan(x, assets).plan) : null);
  const plan = planOf(c.plan);
  const cost = c.cost && typeof c.cost === 'object' ? c.cost : {};
  const pm = c.planMeta && typeof c.planMeta === 'object' ? c.planMeta : null;
  const planMeta = pm ? { source: ['ai', 'mock', 'fallback', 'rules'].includes(pm.source) ? pm.source : 'rules', model: s(pm.model, 60), reason: s(pm.reason, 300), at: s(pm.at, 40), usdEstimated: n(pm.usdEstimated, 0, 100) || 0, ms: n(pm.ms, 0, 1e7) || 0, attempts: n(pm.attempts, 0, 9) || 0, repaired: !!pm.repaired } : null;
  // earlier directions for this page (the concept line only, so "try another direction" can steer away and the studio can list them)
  const history = (Array.isArray(c.history) ? c.history : []).slice(-6).map(h => h && typeof h === 'object' && { title: s(h.title, 80), logline: s(h.logline, 300), source: s(h.source, 10), at: s(h.at, 40) }).filter(h => h && (h.title || h.logline));
  return {
    v: 1, brief: s(c.brief, 1200), understanding,
    supplied: { facts: cleanStrings(c.supplied && c.supplied.facts, 12, 300), memories: cleanStrings(c.supplied && c.supplied.memories, 8, 300) },
    planMeta, history,
    // the owner's choices: the main picture (an asset id) and an explicit abstract interpretation
    mainAsset: typeof c.mainAsset === 'string' && assets.some(a => a.id === c.mainAsset && !a.removed) ? c.mainAsset : undefined, abstractChosen: c.abstractChosen ? true : undefined,
    research: { status: s(r.status, 20), page, facts, options: (Array.isArray(r.options) ? r.options : []).slice(0, 8).map(x => (typeof x === 'string' ? { title: s(x, 120), description: '' } : x && typeof x === 'object' ? { title: s(x.title, 120), description: s(x.description, 160) } : null)).filter(x => x && x.title), log: r.log && typeof r.log === 'object' ? { requests: n(r.log.requests, 0, 1000) || 0, bytes: n(r.log.bytes, 0, 1e9) || 0, ms: n(r.log.ms, 0, 1e7) || 0 } : null,
      // pictures found on the web with restricted/unclear terms: kept as links only (never their pixels)
      review: (Array.isArray(r.review) ? r.review : []).slice(0, 4).map(x => x && typeof x === 'object' && { pageUrl: httpsUrl(x.pageUrl), imageUrl: httpsUrl(x.imageUrl), title: s(x.title, 160), site: s(x.site, 80), depicts: s(x.depicts, 160), permission: x.permission && typeof x.permission === 'object' ? { status: x.permission.status === 'restricted' ? 'restricted' : 'unclear', licence: s(x.permission.licence, 40), note: s(x.permission.note, 200) } : { status: 'unclear', licence: '', note: '' } }).filter(x => x && x.pageUrl),
      curation: r.curation && typeof r.curation === 'object' ? { source: r.curation.source === 'ai' ? 'ai' : 'rules', coverage: ['strong', 'partial', 'none'].includes(r.curation.coverage) ? r.curation.coverage : '', missing: cleanStrings(r.curation.missing, 3, 160), note: s(r.curation.note, 240), reason: s(r.curation.reason, 200), model: s(r.curation.model, 60), usd: n(r.curation.usd, 0, 10) || 0, ms: n(r.curation.ms, 0, 1e7) || 0, judged: n(r.curation.judged, 0, 40) || 0, of: n(r.curation.of, 0, 40) || 0 } : null },
    assets, plan,
    motion: { intensity: c.motion && c.motion.intensity === 'calm' ? 'calm' : 'lively' },
    cost: { researchRequests: n(cost.researchRequests, 0, 1000) || 0, researchBytes: n(cost.researchBytes, 0, 1e9) || 0, paidCalls: n(cost.paidCalls, 0, 100) || 0, credits: n(cost.credits, 0, 100) || 0, aiCalls: n(cost.aiCalls, 0, 1000) || 0, aiUsdEstimated: n(cost.aiUsdEstimated, 0, 1000) || 0 },
    fixture: c.fixture ? s(c.fixture, 300) : undefined,
    updatedAt: s(c.updatedAt, 40),
  };
}

module.exports = { sanitizeCreative, cleanAsset };
