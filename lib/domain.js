// V8.6 spec §19-21: custom-domain handoff. Domain syntax validation,
// structured (never falsely-verified) DNS instructions, and a narrow,
// SSRF-safe live-verification check.
'use strict';
const dns = require('dns').promises;
const http = require('http');
const https = require('https');
const net = require('net');

function validateDomain(raw) {
  const domain = String(raw || '').trim().toLowerCase().replace(/\.$/, '');
  if (!domain) return { valid: false, error: 'Domain is required.' };
  if (domain.length > 253) return { valid: false, error: 'Domain is too long.' };
  if (/^https?:\/\//.test(String(raw))) return { valid: false, error: 'Enter just the domain, without https:// or a path.' };
  // Real syntax check: dot-separated labels of letters/digits/hyphens (no
  // leading/trailing hyphen per label), ending in a letters-only TLD of at
  // least 2 characters. Deliberately rejects a bare IP, a path, or
  // whitespace -- this only ever validates SYNTAX, never reachability or
  // ownership (that's verifyDomainReachable, and even that never proves
  // ownership -- see its own comment).
  const labelRe = /^(?!-)[a-z0-9-]{1,63}(?<!-)$/;
  const labels = domain.split('.');
  if (labels.length < 2) return { valid: false, error: 'Enter a full domain, e.g. yourbusiness.com.' };
  const tld = labels[labels.length - 1];
  if (!/^[a-z]{2,63}$/.test(tld)) return { valid: false, error: 'Enter a valid domain, e.g. yourbusiness.com.' };
  if (!labels.every(l => labelRe.test(l))) return { valid: false, error: 'Enter a valid domain, e.g. yourbusiness.com.' };
  return { valid: true, domain };
}

// Structured DNS instructions (spec §19: "represent records structurally
// -- type/host-name/value-target/TTL"). `target` is one of
// lib/hosting.js's DEPLOYMENT_TARGETS keys. Only 'local' is real here, so
// its instructions are honestly generic ("point this at wherever you
// upload the export") rather than a fabricated hostname for a provider
// this environment isn't actually connected to.
function buildDnsInstructions(target, domain) {
  const isSubdomain = domain.split('.').length > 2;
  const rootHost = isSubdomain ? domain.split('.')[0] : '@';
  if (!target || target === 'local') {
    return [
      { type: 'A', hostName: '@', valueTarget: '<the IP address of wherever you host this export>', ttl: 3600, note: 'Point your domain at whatever server or static host you deploy the downloaded export to.' },
      { type: 'CNAME', hostName: 'www', valueTarget: domain, ttl: 3600, note: `Optional -- makes www.${domain} resolve the same way.` },
    ];
  }
  return [
    { type: 'CNAME', hostName: rootHost, valueTarget: `<hostname ${target} would give you once connected>`, ttl: 3600, note: `${target} is not connected in this environment yet -- this is the SHAPE of the record you'd add once it is, not a live value.` },
  ];
}

// ---- §21: optional, narrow, SSRF-safe live-verification -------------------
// Reports only whether `domain` currently resolves to a public address and
// answers HTTP(S) -- and, if `expectedFingerprint` is supplied, whether the
// response body contains it. This is a reachability check, NEVER an
// ownership/control proof, and the caller (server.js's route) must never
// present its result as "verified" beyond that.
const BLOCKED_HOSTNAMES = new Set(['localhost', 'metadata.google.internal']);
function isPrivateOrReservedIp(ip) {
  if (net.isIP(ip) === 4) {
    const p = ip.split('.').map(Number);
    if (p[0] === 0) return true;
    if (p[0] === 10) return true;
    if (p[0] === 127) return true;
    if (p[0] === 169 && p[1] === 254) return true; // link-local, incl. 169.254.169.254 cloud metadata
    if (p[0] === 172 && p[1] >= 16 && p[1] <= 31) return true;
    if (p[0] === 192 && p[1] === 168) return true;
    if (p[0] === 192 && p[1] === 0 && p[2] === 2) return true; // TEST-NET
    if (p[0] === 100 && p[1] >= 64 && p[1] <= 127) return true; // CGNAT
    if (p[0] >= 224) return true; // multicast/reserved
    return false;
  }
  if (net.isIP(ip) === 6) {
    const low = ip.toLowerCase();
    if (low === '::1' || low === '::') return true;
    if (low.startsWith('fe80:') || low.startsWith('fc') || low.startsWith('fd')) return true;
    if (low.startsWith('::ffff:')) return isPrivateOrReservedIp(low.slice(7)); // IPv4-mapped
    return false;
  }
  return true; // not a recognizable literal IP -- fail closed
}
const VERIFY_TIMEOUT_MS = 4000;
const VERIFY_MAX_BYTES = 64 * 1024;
const VERIFY_MAX_REDIRECTS = 3;

// Fetches `path` on `hostname`, but connects to a PRE-RESOLVED, PRE-
// VALIDATED `pinnedAddress` rather than letting the HTTP client re-resolve
// the hostname itself -- this is what actually closes the SSRF hole: a
// naive "resolve, check the IP, then call http.get(url)" is vulnerable to
// DNS rebinding (the attacker's DNS server returns a public IP for the
// check, then a private one for the real connection a few milliseconds
// later). Pinning the connection to the address we already validated makes
// that attack impossible -- whatever the name resolves to a second later
// is irrelevant, because we never resolve it again.
function fetchPinned(hostname, pinnedAddress, useHttps, path) {
  return new Promise((resolve, reject) => {
    const mod = useHttps ? https : http;
    const req = mod.get({
      hostname, path, port: useHttps ? 443 : 80, timeout: VERIFY_TIMEOUT_MS,
      headers: { Host: hostname },
      lookup: (_host, _opts, cb) => cb(null, pinnedAddress, net.isIP(pinnedAddress)),
    }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        resolve({ redirectTo: res.headers.location });
        return;
      }
      let body = '';
      let bytes = 0;
      res.on('data', chunk => {
        bytes += chunk.length;
        if (bytes > VERIFY_MAX_BYTES) { res.destroy(); return; }
        body += chunk.toString('utf8');
      });
      res.on('end', () => resolve({ statusCode: res.statusCode, body }));
      res.on('error', reject);
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject);
  });
}
async function resolveFirstPublicAddress(hostname) {
  let addrs = [];
  try { addrs = await dns.resolve4(hostname); } catch (e) { /* try v6 below */ }
  if (!addrs.length) { try { addrs = await dns.resolve6(hostname); } catch (e) { /* none */ } }
  if (!addrs.length) return null;
  if (addrs.some(isPrivateOrReservedIp)) return { blocked: true };
  return { address: addrs[0] };
}
async function verifyDomainReachable(domainInput, { expectedFingerprint } = {}) {
  const check = validateDomain(domainInput);
  if (!check.valid) return { ok: false, reason: 'invalid_domain', message: check.error };
  let hostname = check.domain;
  let useHttps = true;
  let redirects = 0;
  while (true) {
    if (BLOCKED_HOSTNAMES.has(hostname)) return { ok: false, reason: 'blocked_host', message: 'Refusing to check a blocked hostname.' };
    const resolved = await resolveFirstPublicAddress(hostname);
    if (!resolved) return { ok: false, reason: 'dns_failed', message: 'Could not resolve this domain yet.' };
    if (resolved.blocked) return { ok: false, reason: 'blocked_target', message: 'This domain resolves to a non-public address and cannot be checked.' };
    let result;
    try { result = await fetchPinned(hostname, resolved.address, useHttps, '/'); }
    catch (e) {
      if (useHttps) { useHttps = false; try { result = await fetchPinned(hostname, resolved.address, false, '/'); } catch (e2) { return { ok: false, reason: 'unreachable', message: 'Could not reach this domain over HTTP(S).' }; } }
      else return { ok: false, reason: 'unreachable', message: 'Could not reach this domain over HTTP(S).' };
    }
    if (result.redirectTo) {
      redirects += 1;
      if (redirects > VERIFY_MAX_REDIRECTS) return { ok: false, reason: 'too_many_redirects', message: 'Too many redirects.' };
      let next;
      try { next = new URL(result.redirectTo, `${useHttps ? 'https' : 'http'}://${hostname}/`); } catch (e) { return { ok: false, reason: 'bad_redirect', message: 'Redirected to an unparseable location.' }; }
      if (next.protocol !== 'http:' && next.protocol !== 'https:') return { ok: false, reason: 'bad_redirect', message: 'Redirected to a disallowed protocol.' };
      hostname = next.hostname;
      useHttps = next.protocol === 'https:';
      continue;
    }
    return {
      ok: true, statusCode: result.statusCode, usedHttps: useHttps,
      matchesFingerprint: expectedFingerprint ? result.body.includes(expectedFingerprint) : null,
    };
  }
}

module.exports = { validateDomain, buildDnsInstructions, verifyDomainReachable, isPrivateOrReservedIp };
