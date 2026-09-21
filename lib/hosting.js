// V8.6 spec §15-17: hosting-target abstraction + structured provider
// catalog + a recommendation engine driven by the export manifest's own
// runtimeType -- never a "best host" marketing claim, never invented
// pricing/deals. Only the 'local' target is real in this sandbox (an
// actual downloadable package lib/export-compiler.js built) -- every other
// entry is honest, structured metadata describing what that provider
// supports and how a handoff to it WOULD work, with `available:false` and
// a real reason, never faked credentials or a simulated live deploy
// (§15: "if real deployment credentials/providers do not exist... do not
// fake them -- ship a fully functional local/export target and a clean
// adapter contract for real providers").
'use strict';

// Commercial metadata (affiliateUrl/handoffUrl/description) is kept
// separate from the fields the compiler/recommendation logic actually
// reasons over (supportsRuntime/domainSupport/sslSupport/available) -- see
// §17's "treat provider commercial metadata separately from core
// deployment logic". No affiliate links exist anywhere in this repo today
// (confirmed via grep before writing this file), so `affiliateUrl` is left
// null throughout -- a real configuration surface for a real one, not a
// placeholder value pretending to be live.
const DEPLOYMENT_TARGETS = {
  local: {
    key: 'local', label: 'Download (local export)', supportsRuntime: ['static', 'server_required'],
    available: true,
    domainSupport: false, sslSupport: false,
    handoffUrl: null, affiliateUrl: null,
    description: 'A real, downloadable .zip of the compiled site (static or server-required). Upload it to any host yourself, or hand it to a developer.',
  },
  railway: {
    key: 'railway', label: 'Railway', supportsRuntime: ['static', 'server_required'],
    available: false, reason: 'No Railway API token or project is configured in this environment.',
    domainSupport: true, sslSupport: true,
    handoffUrl: 'https://railway.app', affiliateUrl: null,
    description: 'Node-capable hosting -- a technical fit for server_required projects once a real Railway deployment adapter is connected.',
  },
  hostinger: {
    key: 'hostinger', label: 'Hostinger', supportsRuntime: ['static'],
    available: false, reason: 'No Hostinger handoff is configured in this environment.',
    domainSupport: true, sslSupport: true,
    handoffUrl: 'https://www.hostinger.com', affiliateUrl: null,
    description: 'Shared hosting -- a fit for static projects. A server_required project would need Hostinger\'s Node hosting tier (or SiteRemade-hosted backend) instead.',
  },
  bluehost: {
    key: 'bluehost', label: 'Bluehost', supportsRuntime: ['static'],
    available: false, reason: 'No Bluehost handoff is configured in this environment.',
    domainSupport: true, sslSupport: true,
    handoffUrl: 'https://www.bluehost.com', affiliateUrl: null,
    description: 'Shared hosting -- a fit for static projects.',
  },
  godaddy: {
    key: 'godaddy', label: 'GoDaddy', supportsRuntime: ['static'],
    available: false, reason: 'No GoDaddy handoff is configured in this environment.',
    domainSupport: true, sslSupport: true,
    handoffUrl: 'https://www.godaddy.com', affiliateUrl: null,
    description: 'Domain registration and shared hosting -- a fit for a static project, or purely for registering/pointing a domain at any other target here.',
  },
};

function listProviders() { return Object.values(DEPLOYMENT_TARGETS); }
function getTarget(key) { return DEPLOYMENT_TARGETS[key] || null; }

// A structured recommendation based purely on technical fit (spec §16):
// which targets support this manifest's runtimeType, and which of those
// are actually usable right now in this environment. `reasoning` names the
// concrete runtimeReasons driving a server_required recommendation rather
// than asserting an opinion.
function recommend(manifest) {
  const runtimeType = manifest.runtimeType;
  const fits = listProviders().filter(p => p.supportsRuntime.includes(runtimeType));
  const reasoning = runtimeType === 'static'
    ? 'This project needs no server-side runtime -- static or shared hosting is sufficient. Any host that serves plain HTML/CSS/JS will work.'
    : `This project needs a live backend to honestly handle: ${(manifest.runtimeReasons || []).join(', ') || 'server-side functionality'}. It needs Node-capable hosting (or a SiteRemade-hosted backend) -- plain static/shared hosting would silently break those features.`;
  return {
    runtimeType,
    runtimeReasons: manifest.runtimeReasons || [],
    recommendedTargets: fits.map(p => p.key),
    availableNow: fits.filter(p => p.available).map(p => p.key),
    reasoning,
  };
}

module.exports = { DEPLOYMENT_TARGETS, listProviders, getTarget, recommend };
