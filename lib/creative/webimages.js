'use strict';
// CREATIVE — web image discovery for exact subjects (server only).
//
// Wikimedia Commons has little for many subjects (a character, a game, a meme). This step looks further:
//   1. the search step (ai.webSearchPages: Anthropic's web search tool, bounded) finds PAGES that show the exact subject
//      -- official media pages, museum and archive records, specialist wikis, photo pages;
//   2. each page is read with the hardened fetcher (webfetch.js) and its declared images are taken: og:image /
//      twitter:image / JSON-LD image (the page's primary image), plus a few large <img> as secondary candidates;
//   3. PERMISSION is judged from what the page itself states, kept with its evidence, and kept apart from discovery:
//        free       -- the page declares CC0, public domain, CC BY or CC BY-SA (rel=license or structured data) and the
//                      image is the page's primary image; for BY licences a creator must be stated (attribution)
//        restricted -- NonCommercial / NoDerivatives licences, or "all rights reserved"
//        unclear    -- anything else: an official site, a wiki, a transparent PNG, a code licence on a repository --
//                      none of those grants rights to the artwork
//      Only "free" images are used automatically. Relevant "restricted"/"unclear" ones are shown to the owner as
//      source links to review; if the owner affirms they have the rights, the picture becomes the owner's supplied
//      picture (recorded as such), exactly like an upload.
//   4. the picture check (ai.curate, vision) judges the thumbnails like any other candidates.
// Bounded: ≤ 8 pages, ≤ 10 images, ≤ 30 MB, each request capped (see webfetch.js).

const crypto = require('crypto');
const { safeFetch, fetchImage } = require('./webfetch');

const decode = s => String(s || '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#(\d+);/g, (m, n) => String.fromCharCode(+n)).trim();
function attrs(tag) { const out = {}; for (const m of String(tag).matchAll(/([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+))/g)) out[m[1].toLowerCase()] = decode(m[3] != null ? m[3] : m[4] != null ? m[4] : m[5]); return out; }
const abs = (u, base) => { try { const x = new URL(decode(u), base); return x.protocol === 'https:' ? x.href : ''; } catch (e) { return ''; } };

// a licence from a URL or a short statement -> { name, free, attribution } | null
function licenceOf(s) {
  const t = String(s || '').toLowerCase();
  if (!t) return null;
  if (/creativecommons\.org\/publicdomain\/zero|\bcc0\b/.test(t)) return { name: 'CC0', free: true, attribution: false };
  if (/creativecommons\.org\/publicdomain\/mark|\bpublic domain\b/.test(t)) return { name: 'Public domain', free: true, attribution: false };
  const m = /creativecommons\.org\/licenses\/(by(?:-(?:sa|nc|nd|nc-sa|nc-nd))?)\/(\d(?:\.\d)?)/.exec(t) || /\bcc[ -](by(?:-(?:sa|nc|nd|nc-sa|nc-nd))?)(?:[ -](\d(?:\.\d)?))?/.exec(t);
  if (m) { const kind = m[1].toUpperCase(); const name = `CC ${kind}${m[2] ? ' ' + m[2] : ''}`; return { name, free: !/NC|ND/.test(kind), attribution: true }; }
  return null;
}

// read one HTML page -> { title, site, author, licences: [{ name, free, attribution, via }], restricted, primary: [urls], others: [urls] }
function readPage(html, base) {
  const h = String(html || '').slice(0, 1.5 * 1024 * 1024);
  const metas = [...h.matchAll(/<meta\s[^>]*>/gi)].map(m => attrs(m[0]));
  const meta = k => (metas.find(a => (a.property || a.name || '').toLowerCase() === k) || {}).content || '';
  const out = { title: decode(meta('og:title') || ((/<title[^>]*>([^<]{0,200})/i.exec(h) || [])[1] || '')).slice(0, 160), site: decode(meta('og:site_name')).slice(0, 80), author: decode(meta('author') || meta('article:author') || meta('dc.creator')).slice(0, 120), licences: [], restricted: false, primary: [], others: [] };
  const push = (list, u) => { const x = abs(u, base); if (x && !list.includes(x)) list.push(x); };
  ['og:image:secure_url', 'og:image', 'og:image:url', 'twitter:image', 'twitter:image:src'].forEach(k => metas.filter(a => (a.property || a.name || '').toLowerCase() === k).forEach(a => push(out.primary, a.content)));
  // licence statements: rel=license (in <link> or <a>), structured data, a licence meta
  for (const m of h.matchAll(/<(?:link|a)\s[^>]*rel\s*=\s*["'][^"']*\blicense\b[^"']*["'][^>]*>/gi)) { const a = attrs(m[0]); const l = licenceOf(a.href); if (l) out.licences.push(Object.assign(l, { via: `rel=license ${String(a.href).slice(0, 120)}` })); }
  const lm = licenceOf(meta('license') || meta('dc.rights') || meta('dcterms.license')); if (lm) out.licences.push(Object.assign(lm, { via: 'licence meta tag' }));
  for (const m of h.matchAll(/<script[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    let j; try { j = JSON.parse(m[1]); } catch (e) { continue; }
    const walk = (x, depth) => {
      if (!x || typeof x !== 'object' || depth > 5) return; if (Array.isArray(x)) { x.slice(0, 20).forEach(y => walk(y, depth + 1)); return; }
      const lic = x.license || x.acquireLicensePage; const l = licenceOf(typeof lic === 'string' ? lic : lic && (lic.url || lic['@id'] || lic.name)); if (l) out.licences.push(Object.assign(l, { via: `structured data: ${String(typeof lic === 'string' ? lic : lic.url || lic.name || '').slice(0, 120)}` }));
      const who = x.creator || x.author; const name = typeof who === 'string' ? who : who && (Array.isArray(who) ? who[0] && who[0].name : who.name); if (name && !out.author) out.author = decode(name).slice(0, 120);
      if (x.copyrightNotice && /all rights reserved/i.test(String(x.copyrightNotice))) out.restricted = true;
      const img = x.contentUrl || x.image; [].concat(img || []).slice(0, 4).forEach(v => push(out.primary, typeof v === 'string' ? v : v && (v.contentUrl || v.url)));
      Object.keys(x).forEach(k => { if (k !== 'image' && typeof x[k] === 'object') walk(x[k], depth + 1); });
    };
    walk(j, 0);
  }
  if (/all rights reserved/i.test(h.replace(/<[^>]+>/g, ' ').slice(0, 400000))) out.restricted = true;
  // a few large pictures in the page itself (declared dimensions, or a wide srcset entry)
  for (const m of h.matchAll(/<img\s[^>]*>/gi)) {
    if (out.others.length >= 4) break; const a = attrs(m[0]); const w = +a.width || 0, hh = +a.height || 0;
    const big = (w >= 500 && hh >= 300) || /\s(9\d\d|1\d{3,})w/.test(a.srcset || ''); if (!big) continue;
    const best = (a.srcset || '').split(',').map(x => x.trim().split(/\s+/)).filter(x => x[0]).sort((p, q) => (parseInt(q[1]) || 0) - (parseInt(p[1]) || 0))[0];
    push(out.others, best ? best[0] : a.src);
  }
  return out;
}

// the permission for one image of a page -- judged from the page's own statements, with the evidence kept
function permissionFor(page, imageUrl, pageUrl) {
  const primary = page.primary.includes(imageUrl);
  const free = page.licences.filter(l => l.free); const bad = page.licences.filter(l => !l.free);
  if (bad.length || page.restricted) return { status: 'restricted', licence: bad[0] ? bad[0].name : 'all rights reserved', evidence: [bad[0] ? `${pageUrl} states ${bad[0].name} (${bad[0].via})` : `${pageUrl} says "all rights reserved"`], note: 'The page reserves rights this use would need.' };
  if (free.length && primary) {
    const l = free[0];
    if (l.attribution && !page.author) return { status: 'unclear', licence: l.name, evidence: [`${pageUrl} states ${l.name} (${l.via})`], note: 'The licence needs the creator credited, and the page does not say who that is.' };
    return { status: 'free', licence: l.name, author: page.author || '', evidence: [`${pageUrl} states ${l.name} (${l.via}) for its main image`], note: '' };
  }
  if (free.length) return { status: 'unclear', licence: free[0].name, evidence: [`${pageUrl} states ${free[0].name}, but not clearly for this picture`], note: 'The licence on the page may not cover this picture.' };
  return { status: 'unclear', licence: '', evidence: [`${pageUrl} states no licence for it`], note: 'Finding a picture does not give permission to republish it.' };
}

// discover(input, deps) -> { candidates: [{ id, pageUrl, imageUrl, title, site, author, width, height, mime, bytes, sha1, permission, primary }], log }
//   deps: { searchPages(input) -> { pages: [{ url, title, why }], searches, usd, ms, error }, fetch?, fetchImg? }
async function discover(input, deps) {
  const t0 = Date.now(); const log = { searches: 0, pages: 0, pageErrors: [], images: 0, imageErrors: [], bytes: 0, usd: 0, ms: 0, searchError: '' };
  const done = candidates => Object.assign({ candidates }, { log: Object.assign(log, { ms: Date.now() - t0 }) });
  let found;
  try { found = await deps.searchPages(input); } catch (e) { log.searchError = String(e && e.message || e).slice(0, 200); return done([]); }
  log.searches = found.searches || 0; log.usd = found.usd || 0; if (found.error) log.searchError = found.error;
  const pages = []; const seenPage = new Set();
  for (const p of found.pages || []) { let u; try { u = new URL(p.url); } catch (e) { continue; } if (u.protocol !== 'https:') continue; u.hash = ''; if (seenPage.has(u.href)) continue; seenPage.add(u.href); pages.push(Object.assign({}, p, { url: u.href })); if (pages.length >= 8) break; }
  const fetchPage = deps.fetch || (u => safeFetch(u, { expect: /text\/html|application\/xhtml/, maxBytes: 1.5 * 1024 * 1024, accept: 'text/html' }));
  const fetchImg = deps.fetchImg || (u => fetchImage(u));
  const want = [];
  for (const p of pages) {
    const r = await fetchPage(p.url); log.pages++;
    if (!r.ok) { log.pageErrors.push(`${p.url}: ${r.reason}`); continue; }
    log.bytes += r.body.length;
    const page = readPage(r.body.toString('utf8'), r.url);
    page.primary.slice(0, 2).forEach(u => want.push({ u, page, pageUrl: r.url, primary: true, why: p.why || '' }));
    page.others.slice(0, 2).forEach(u => want.push({ u, page, pageUrl: r.url, primary: false, why: p.why || '' }));
  }
  const candidates = []; const seenImg = new Set(); const seenHash = new Set();
  for (const w of want) {
    if (candidates.length >= 10 || log.bytes > 30 * 1024 * 1024) break;
    if (seenImg.has(w.u)) continue; seenImg.add(w.u);
    const r = await fetchImg(w.u); log.images++;
    if (!r.ok) { log.imageErrors.push(`${w.u.slice(0, 120)}: ${r.reason}`); continue; }
    log.bytes += r.body.length;
    if (r.width < 300 || r.height < 300) { log.imageErrors.push(`${w.u.slice(0, 120)}: too small (${r.width}x${r.height})`); continue; }
    const sha1 = crypto.createHash('sha1').update(r.body).digest('hex'); if (seenHash.has(sha1)) continue; seenHash.add(sha1);
    candidates.push({ id: `w${candidates.length + 1}`, pageUrl: w.pageUrl, imageUrl: r.url, title: w.page.title || w.page.site || new URL(w.pageUrl).hostname, site: w.page.site || new URL(w.pageUrl).hostname, author: w.page.author, why: w.why,
      width: r.width, height: r.height, mime: r.mime, bytes: r.body, sha1, primary: w.primary, permission: permissionFor(w.page, w.u, w.pageUrl) });
  }
  return done(candidates);
}

module.exports = { discover, readPage, permissionFor, licenceOf };
