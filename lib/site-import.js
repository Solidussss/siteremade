// V9 (Phase 9): "Redesign my existing website" -- SiteRemade §1/§8/§9 of the
// Phase 9 ticket. Two responsibilities, deliberately kept separate:
//
//   fetchPublicHtml(url)   -- SSRF-safe retrieval of ONE public page's HTML.
//   extractSiteFacts(html) -- dependency-free, regex/string-based reading
//                             of that HTML into the structured reference
//                             shape server.js's /api/redesign/extract route
//                             hands back to the browser.
//
// What this module explicitly does NOT do (see migrations/0007_project_source.sql
// and this ticket's own §8): administer, log into, or mirror the source
// CMS; follow more than one page; guarantee completeness; or produce
// anything that gets saved as a project by itself. It only ever returns
// REFERENCE material for a human (and, downstream, the EXISTING
// /api/plan-website -> client compiler -> POST /api/projects pipeline) to
// read, edit, and choose to use. Nothing here bypasses that pipeline or
// creates a parallel "redesign project" type -- see lib/project-store.js's
// `source` field (Phase 9) for where this data actually ends up.
//
// SSRF safety: this is the one place in this codebase that fetches a URL
// the ACCOUNT HOLDER (not staff) supplies, so it reuses the exact pinned-
// connection technique lib/domain.js's verifyDomainReachable already
// proved out for the (also user-influenced, though narrower) custom-domain
// check -- see that file's own comment on why pinning (not merely
// checking, then separately connecting) is what actually closes the DNS-
// rebinding hole. isPrivateOrReservedIp is imported, not re-implemented, so
// there is exactly one definition of "unsafe address" in this codebase.
'use strict';
const dns = require('dns').promises;
const http = require('http');
const https = require('https');
const net = require('net');
const { isPrivateOrReservedIp } = require('./domain.js');

const FETCH_TIMEOUT_MS = 8000;
const MAX_HTML_BYTES = 2 * 1024 * 1024; // 2MB decoded -- generous for a real marketing page, bounded against a hostile/huge response
const MAX_REDIRECTS = 4;
const BLOCKED_HOSTNAMES = new Set(['localhost', 'metadata.google.internal']);

function parseImportUrl(raw) {
  let u;
  try { u = new URL(String(raw || '').trim()); } catch (e) { return { ok: false, error: 'Enter a valid website address, like https://yourbusiness.com.' }; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return { ok: false, error: 'Only http:// and https:// addresses are supported.' };
  if (!u.hostname) return { ok: false, error: 'Enter a valid website address.' };
  return { ok: true, url: u };
}

// Same shape as lib/domain.js's resolveFirstPublicAddress, generalized to
// also accept a literal IP already present in the URL (verifyDomainReachable
// never needed that case -- a domain field can't be a bare IP; a pasted
// website URL technically could be).
async function resolveFirstPublicAddress(hostname) {
  const literalFamily = net.isIP(hostname);
  if (literalFamily) return isPrivateOrReservedIp(hostname) ? { blocked: true } : { address: hostname, family: literalFamily };
  let addrs = [];
  let family = 4;
  try { addrs = await dns.resolve4(hostname); } catch (e) { /* try v6 below */ }
  if (!addrs.length) { family = 6; try { addrs = await dns.resolve6(hostname); } catch (e) { /* none */ } }
  if (!addrs.length) return null;
  if (addrs.some(isPrivateOrReservedIp)) return { blocked: true };
  return { address: addrs[0], family };
}

// Connects to a PRE-VALIDATED, PINNED address -- never re-resolves the
// hostname mid-request. See this file's header and lib/domain.js's own
// comment for why pinning (not just a preceding DNS check) is required.
function fetchPinned(urlObj, pinnedAddress, family) {
  return new Promise((resolve, reject) => {
    const useHttps = urlObj.protocol === 'https:';
    const mod = useHttps ? https : http;
    const req = mod.get({
      hostname: urlObj.hostname, path: (urlObj.pathname || '/') + (urlObj.search || ''),
      port: urlObj.port || (useHttps ? 443 : 80), timeout: FETCH_TIMEOUT_MS,
      headers: { Host: urlObj.hostname, 'User-Agent': 'SiteRemadeImportBot/1.0 (+https://siteremade.com/redesign)', Accept: 'text/html,application/xhtml+xml' },
      lookup: (_host, _opts, cb) => cb(null, pinnedAddress, family),
    }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) { res.resume(); resolve({ redirectTo: res.headers.location }); return; }
      if (res.statusCode >= 400) { res.resume(); resolve({ statusCode: res.statusCode, body: '' }); return; }
      const ct = String(res.headers['content-type'] || '');
      if (ct && !/text\/html|application\/xhtml/i.test(ct)) { res.resume(); resolve({ statusCode: res.statusCode, body: '', notHtml: true }); return; }
      let body = ''; let bytes = 0; let truncated = false;
      res.on('data', chunk => {
        if (truncated) return;
        bytes += chunk.length;
        if (bytes > MAX_HTML_BYTES) { truncated = true; res.destroy(); return; }
        body += chunk.toString('utf8');
      });
      res.on('end', () => resolve({ statusCode: res.statusCode, body }));
      res.on('close', () => { if (truncated) resolve({ statusCode: res.statusCode || 200, body }); });
      res.on('error', reject);
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject);
  });
}

async function fetchPublicHtml(rawUrl) {
  const parsed = parseImportUrl(rawUrl);
  if (!parsed.ok) return { ok: false, reason: 'invalid_url', message: parsed.error };
  let urlObj = parsed.url;
  let redirects = 0;
  while (true) {
    if (BLOCKED_HOSTNAMES.has(urlObj.hostname.toLowerCase())) return { ok: false, reason: 'blocked_host', message: 'That address can’t be fetched.' };
    let resolved;
    try { resolved = await resolveFirstPublicAddress(urlObj.hostname); } catch (e) { return { ok: false, reason: 'dns_failed', message: 'Couldn’t find that website. Check the address and try again.' }; }
    if (!resolved) return { ok: false, reason: 'dns_failed', message: 'Couldn’t find that website. Check the address and try again.' };
    if (resolved.blocked) return { ok: false, reason: 'blocked_target', message: 'That address can’t be fetched.' };
    let result;
    try { result = await fetchPinned(urlObj, resolved.address, resolved.family); }
    catch (e) { return { ok: false, reason: 'unreachable', message: 'Couldn’t reach that website right now. Check the address and try again.' }; }
    if (result.redirectTo) {
      redirects += 1;
      if (redirects > MAX_REDIRECTS) return { ok: false, reason: 'too_many_redirects', message: 'That website redirected too many times.' };
      let next;
      try { next = new URL(result.redirectTo, urlObj); } catch (e) { return { ok: false, reason: 'bad_redirect', message: 'That website redirected somewhere unreadable.' }; }
      if (next.protocol !== 'http:' && next.protocol !== 'https:') return { ok: false, reason: 'bad_redirect', message: 'That website redirected to an unsupported address.' };
      urlObj = next;
      continue;
    }
    if (result.notHtml) return { ok: false, reason: 'not_html', message: 'That address didn’t return a web page.' };
    if (result.statusCode >= 400) return { ok: false, reason: 'fetch_failed', message: `That website returned an error (${result.statusCode}).` };
    if (!result.body || !result.body.trim()) return { ok: false, reason: 'empty', message: 'That page appears to be empty.' };
    return { ok: true, html: result.body, finalUrl: urlObj.toString() };
  }
}

// ---------------------------------------------------------------------
// Extraction: dependency-free (no cheerio/jsdom in this environment --
// see PRODUCTION-ADAPTERS.md's own "no npm install" note). Everything
// below is regex/string scanning tuned for real marketing-site HTML, not
// a general-purpose HTML parser -- it degrades to omitting a field rather
// than guessing when the markup doesn't match, matching every other
// extractor in this codebase's "never fabricate" discipline (see
// lib/project-store.js capStringsDeep's own header).
// ---------------------------------------------------------------------
const ENTITY_MAP = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': '\'', apos: '\'', nbsp: ' ', mdash: '—', ndash: '–', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“' };
function decodeEntities(s) {
  return String(s || '').replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, (m, code) => {
    if (code[0] === '#') {
      const num = code[1] === 'x' || code[1] === 'X' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(num) ? String.fromCodePoint(num) : m;
    }
    return Object.prototype.hasOwnProperty.call(ENTITY_MAP, code.toLowerCase()) ? ENTITY_MAP[code.toLowerCase()] : m;
  });
}
function stripTags(html) { return decodeEntities(String(html || '').replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim(); }
function cap(s, n) { return String(s || '').slice(0, n); }
function capList(arr, n, itemLen) { return (Array.isArray(arr) ? arr : []).filter(Boolean).map(x => cap(x, itemLen)).filter(x => x.trim()).slice(0, n); }
function dedupe(arr) { const seen = new Set(); return arr.filter(x => { const k = x.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; }); }

function extractMeta(html, name) {
  const re = new RegExp(`<meta[^>]+(?:name|property)=["']${name}["'][^>]*content=["']([^"']*)["']`, 'i');
  const re2 = new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:name|property)=["']${name}["']`, 'i');
  const m = html.match(re) || html.match(re2);
  return m ? decodeEntities(m[1]).trim() : null;
}
function extractTitle(html) {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return m ? stripTags(m[1]) : null;
}
function extractHeadings(html, level) {
  const re = new RegExp(`<h${level}[^>]*>([\\s\\S]*?)<\\/h${level}>`, 'gi');
  const out = [];
  let m; while ((m = re.exec(html)) && out.length < 20) { const t = stripTags(m[1]); if (t) out.push(t); }
  return out;
}
function extractJsonLd(html) {
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  const out = [];
  let m;
  while ((m = re.exec(html))) {
    try {
      const parsed = JSON.parse(m[1].trim());
      const list = Array.isArray(parsed) ? parsed : (parsed['@graph'] ? parsed['@graph'] : [parsed]);
      list.forEach(x => { if (x && typeof x === 'object') out.push(x); });
    } catch (e) { /* malformed JSON-LD on the source page -- skip it, never guess */ }
  }
  return out;
}
// LocalBusiness/Organization schema.org types (or anything with a plain
// PostalAddress) -- the single highest-confidence source when present.
function businessFactsFromJsonLd(items) {
  const biz = items.find(x => {
    const t = Array.isArray(x['@type']) ? x['@type'] : [x['@type']];
    return t.some(tt => typeof tt === 'string' && /LocalBusiness|Organization|Restaurant|Store|ProfessionalService|Attorney|Dentist|MedicalBusiness|HomeAndConstructionBusiness/i.test(tt));
  });
  if (!biz) return null;
  const addr = biz.address && typeof biz.address === 'object' ? biz.address : null;
  const addressParts = addr ? [addr.streetAddress, addr.addressLocality, addr.addressRegion, addr.postalCode].filter(Boolean).join(', ') : null;
  return {
    name: typeof biz.name === 'string' ? cap(biz.name, 200) : null,
    telephone: typeof biz.telephone === 'string' ? cap(biz.telephone, 40) : null,
    email: typeof biz.email === 'string' ? cap(biz.email, 180) : null,
    address: addressParts ? cap(addressParts, 300) : null,
    priceRange: typeof biz.priceRange === 'string' ? cap(biz.priceRange, 20) : null,
    sameAs: Array.isArray(biz.sameAs) ? capList(biz.sameAs, 8, 300) : null,
    aggregateRating: biz.aggregateRating && typeof biz.aggregateRating === 'object'
      ? { ratingValue: biz.aggregateRating.ratingValue != null ? String(biz.aggregateRating.ratingValue).slice(0, 10) : null, reviewCount: biz.aggregateRating.reviewCount != null ? String(biz.aggregateRating.reviewCount).slice(0, 10) : null }
      : null,
  };
}
function extractPhones(html) {
  const fromTel = Array.from(html.matchAll(/href=["']tel:([^"'?]+)/gi)).map(m => decodeURIComponent(m[1]));
  const bodyText = stripTags(html);
  const fromText = Array.from(bodyText.matchAll(/\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}/g)).map(m => m[0]);
  return dedupe(capList([...fromTel, ...fromText], 5, 40));
}
function extractEmails(html) {
  const fromMailto = Array.from(html.matchAll(/href=["']mailto:([^"'?]+)/gi)).map(m => decodeURIComponent(m[1]));
  return dedupe(capList(fromMailto, 5, 180));
}
function resolveUrl(u, base) { try { return new URL(u, base).toString(); } catch (e) { return null; } }
function extractImages(html, baseUrl, limit) {
  const out = [];
  const re = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi;
  let m;
  while ((m = re.exec(html)) && out.length < limit) {
    const src = m[1];
    if (!src || src.startsWith('data:')) continue;
    const full = resolveUrl(src, baseUrl);
    if (!full) continue;
    const altM = m[0].match(/alt=["']([^"']*)["']/i);
    out.push({ url: cap(full, 500), alt: altM ? cap(decodeEntities(altM[1]), 200) : null });
  }
  return out;
}
function extractLogo(html, baseUrl) {
  // Priority: an <img> whose src/alt/class mentions "logo" > og:image > a
  // <link rel="icon"> favicon, so a real logo image wins over a generic
  // social-share thumbnail when both are present.
  const logoImgRe = /<img[^>]+(?:src|alt|class|id)=["'][^"']*logo[^"']*["'][^>]*>/i;
  const m = html.match(logoImgRe);
  if (m) { const srcM = m[0].match(/src=["']([^"']+)["']/i); if (srcM) { const full = resolveUrl(srcM[1], baseUrl); if (full) return full; } }
  const og = extractMeta(html, 'og:image');
  if (og) { const full = resolveUrl(og, baseUrl); if (full) return full; }
  const iconM = html.match(/<link[^>]+rel=["'](?:shortcut icon|icon)["'][^>]+href=["']([^"']+)["']/i) || html.match(/<link[^>]+href=["']([^"']+)["'][^>]+rel=["'](?:shortcut icon|icon)["']/i);
  if (iconM) { const full = resolveUrl(iconM[1], baseUrl); if (full) return full; }
  return null;
}
// Hex colors from inline style="" attributes and <style> blocks, tallied by
// frequency -- a best-effort brand-color signal, never a guarantee of the
// real brand palette (a site's colors can equally live in an external
// stylesheet this single-page fetch never retrieves -- see this function's
// own return, which is silently empty in that case rather than invented).
function extractColors(html, limit) {
  const styleBlocks = Array.from(html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)).map(m => m[1]).join(' ');
  const inlineStyles = Array.from(html.matchAll(/style=["']([^"']*)["']/gi)).map(m => m[1]).join(' ');
  const all = styleBlocks + ' ' + inlineStyles;
  const hexes = Array.from(all.matchAll(/#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/g)).map(m => `#${m[1].toLowerCase()}`);
  const boring = new Set(['#fff', '#ffffff', '#000', '#000000', '#fafafa', '#f5f5f5']); // near-white/black is rarely a meaningful brand color signal
  const counts = new Map();
  hexes.forEach(h => { if (boring.has(h)) return; counts.set(h, (counts.get(h) || 0) + 1); });
  return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).slice(0, limit).map(([hex]) => hex);
}
function extractFontFamilies(html, limit) {
  const styleBlocks = Array.from(html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)).map(m => m[1]).join(' ');
  const inlineStyles = Array.from(html.matchAll(/style=["']([^"']*)["']/gi)).map(m => m[1]).join(' ');
  const families = Array.from((styleBlocks + ' ' + inlineStyles).matchAll(/font-family\s*:\s*([^;}]+)/gi))
    .map(m => m[1].split(',')[0].trim().replace(/^["']|["']$/g, ''))
    .filter(f => f && !/^(inherit|initial|unset)$/i.test(f));
  return dedupe(capList(families, limit, 80));
}
const CTA_VERBS = /\b(call|book|schedule|get (?:a|your)(?: \w+){0,2} quote|request (?:a|your) quote|contact us|contact|buy now|shop|order|reserve|sign up|get started|learn more|free estimate|free consultation|apply now)\b/i;
function extractCtas(html, limit) {
  const out = [];
  const re = /<(?:a|button)[^>]*>([\s\S]*?)<\/(?:a|button)>/gi;
  let m;
  while ((m = re.exec(html)) && out.length < limit) {
    const t = stripTags(m[1]);
    if (t && t.length <= 60 && CTA_VERBS.test(t)) out.push(t);
  }
  return dedupe(out);
}
function extractTestimonials(html, limit) {
  // Looks for blocks that quote text near the words "testimonial"/"review",
  // or quoted text that reads like a customer quote (starts/ends with a
  // curly or straight quote mark, reasonably short). Best-effort: real
  // testimonial widgets vary too much for one dependency-free heuristic to
  // catch reliably, so this is a starting point for a human to confirm,
  // never treated as verified fact (see lib/project-store.js's "never
  // invent a fact" discipline -- these become source_metadata, NOT
  // declaredFacts, unless a person confirms them).
  const out = [];
  const blockRe = /<(?:blockquote|q)[^>]*>([\s\S]*?)<\/(?:blockquote|q)>/gi;
  let m;
  while ((m = blockRe.exec(html)) && out.length < limit) { const t = stripTags(m[1]); if (t && t.length >= 15) out.push(t); }
  if (out.length < limit) {
    const quoteRe = /[“"]([^"”]{20,240})[”"]/g;
    let qm;
    while ((qm = quoteRe.exec(stripTags(html))) && out.length < limit) out.push(qm[1].trim());
  }
  return dedupe(capList(out, limit, 300));
}
function extractNavStructure(html, baseUrl, limit) {
  const navBlocks = Array.from(html.matchAll(/<nav[^>]*>([\s\S]*?)<\/nav>/gi)).map(m => m[1]);
  const source = navBlocks.length ? navBlocks.join(' ') : html;
  const out = [];
  const re = /<a[^>]+href=["']([^"'#][^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(source)) && out.length < limit) {
    const label = stripTags(m[2]);
    if (!label || label.length > 40) continue;
    out.push(label);
  }
  return dedupe(out);
}

// The single entry point server.js's route calls. Returns a structured,
// already-capped shape -- this IS the shape stored verbatim as
// project.source.metadata (see lib/project-store.js validateSourceInput,
// which caps it again independently -- defense in depth, not reliance on
// this function alone).
function extractSiteFacts(html, finalUrl) {
  const jsonLd = extractJsonLd(html);
  const biz = businessFactsFromJsonLd(jsonLd);
  const title = extractTitle(html);
  const ogSiteName = extractMeta(html, 'og:site_name');
  const h1s = extractHeadings(html, 1);
  const h2s = extractHeadings(html, 2);
  const h3s = extractHeadings(html, 3);
  return {
    businessName: cap((biz && biz.name) || ogSiteName || h1s[0] || title || '', 200) || null,
    metaDescription: cap(extractMeta(html, 'description') || extractMeta(html, 'og:description') || '', 500) || null,
    pageTitle: title ? cap(title, 200) : null,
    headings: { h1: capList(h1s, 5, 150), h2: capList(h2s, 10, 150), h3: capList(h3s, 15, 150) },
    navStructure: capList(extractNavStructure(html, finalUrl, 15), 15, 60),
    contact: {
      phones: extractPhones(html),
      emails: extractEmails(html),
      address: (biz && biz.address) || null,
    },
    serviceArea: (biz && biz.address) || null, // best-effort: same signal as contact.address unless a future pass adds a dedicated "service area" heuristic
    branding: {
      colors: extractColors(html, 6),
      fontFamilies: extractFontFamilies(html, 4),
      logoUrl: extractLogo(html, finalUrl),
    },
    images: extractImages(html, finalUrl, 12),
    ctas: capList(extractCtas(html, 10), 10, 60),
    testimonials: extractTestimonials(html, 5),
    businessFacts: biz ? {
      telephone: biz.telephone, email: biz.email, priceRange: biz.priceRange,
      sameAs: biz.sameAs, aggregateRating: biz.aggregateRating,
    } : null,
    sourceUrl: cap(finalUrl, 2000),
    extractedAt: new Date().toISOString(),
  };
}

async function runRedesignExtraction(rawUrl) {
  const fetched = await fetchPublicHtml(rawUrl);
  if (!fetched.ok) return fetched;
  let extracted;
  try { extracted = extractSiteFacts(fetched.html, fetched.finalUrl); }
  catch (e) { return { ok: false, reason: 'parse_failed', message: 'Couldn’t read that page. Try a different URL, or describe your business instead.' }; }
  return { ok: true, extracted };
}

module.exports = {
  parseImportUrl, fetchPublicHtml, extractSiteFacts, runRedesignExtraction,
  // exported for tests
  extractColors, extractFontFamilies, extractCtas, extractTestimonials, extractPhones, extractEmails, extractImages, extractLogo, extractNavStructure, businessFactsFromJsonLd, extractJsonLd,
};
