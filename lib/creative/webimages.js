'use strict';
// CREATIVE — web image discovery for exact subjects (server only).
//
// Wikimedia Commons has little for many subjects (a character, a game, a meme). This step looks further:
//   1. the search step (ai.webSearchPages: Anthropic's web search tool, bounded) finds PAGES that show the exact subject
//      -- official media pages, museum and archive records, specialist wikis, photo pages;
//   2. each page is read with the hardened fetcher (webfetch.js) and its declared images are taken: og:image /
//      twitter:image / JSON-LD image (the page's primary image), plus a few large <img> as secondary candidates;
//   3. PERMISSION is judged from what the page itself states, kept with its evidence, and kept apart from discovery:
//        free       -- CC0, public domain, CC BY or CC BY-SA stated FOR THE PICTURE: in structured data describing that
//                      image, or on a page that is the picture's own page (a photo page, a Commons file page) where it
//                      is the main image, or -- for a file stored on Wikimedia Commons -- in the file's own Commons
//                      record. A licence for a whole article (Wikipedia's text licence, a wiki's footer, a blog's
//                      rel=license) does not cover the pictures on it. For BY licences a creator must be stated.
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
  const out = { title: decode(meta('og:title') || ((/<title[^>]*>([^<]{0,200})/i.exec(h) || [])[1] || '')).slice(0, 160), site: decode(meta('og:site_name')).slice(0, 80), author: decode(meta('author') || meta('article:author') || meta('dc.creator')).slice(0, 120), licences: [], restricted: false, primary: [], others: [], mediaPage: false, wiki: false };
  // the picture's own page (a photo page, a wiki's File: page) vs an article whose licence is about its text
  const generator = meta('generator'); out.wiki = /mediawiki|fandom|wikia/i.test(generator) || /\.fandom\.com$|\.wiki(pedia|media)\.org$/i.test((() => { try { return new URL(base).hostname; } catch (e) { return ''; } })());
  out.mediaPage = /photo|image/i.test(meta('og:type')) || (out.wiki && /^(file|image):/i.test(decode(meta('og:title') || ((/<title[^>]*>([^<]{0,200})/i.exec(h) || [])[1] || ''))));
  const push = (list, u) => { const x = abs(u, base); if (x && !list.includes(x)) list.push(x); };
  ['og:image:secure_url', 'og:image', 'og:image:url', 'twitter:image', 'twitter:image:src'].forEach(k => metas.filter(a => (a.property || a.name || '').toLowerCase() === k).forEach(a => push(out.primary, a.content)));
  // licence statements: rel=license (in <link> or <a>), structured data, a licence meta
  for (const m of h.matchAll(/<(?:link|a)\s[^>]*rel\s*=\s*["'][^"']*\blicense\b[^"']*["'][^>]*>/gi)) { const a = attrs(m[0]); const l = licenceOf(a.href); if (l) out.licences.push(Object.assign(l, { via: `rel=license ${String(a.href).slice(0, 120)}`, scope: 'page' })); }
  const lm = licenceOf(meta('license') || meta('dc.rights') || meta('dcterms.license')); if (lm) out.licences.push(Object.assign(lm, { via: 'licence meta tag', scope: 'page' }));
  for (const m of h.matchAll(/<script[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    let j; try { j = JSON.parse(m[1]); } catch (e) { continue; }
    const walk = (x, depth) => {
      if (!x || typeof x !== 'object' || depth > 5) return; if (Array.isArray(x)) { x.slice(0, 20).forEach(y => walk(y, depth + 1)); return; }
      // a licence on an image object is for that image (its contentUrl / url); on anything else it is for the page
      const isImage = /imageobject|photograph|visualartwork|mediaobject/i.test([].concat(x['@type'] || []).join(' '));
      const lic = x.license || x.acquireLicensePage; const l = licenceOf(typeof lic === 'string' ? lic : lic && (lic.url || lic['@id'] || lic.name));
      if (l) out.licences.push(Object.assign(l, { via: `structured data: ${String(typeof lic === 'string' ? lic : lic.url || lic.name || '').slice(0, 120)}`, scope: isImage ? 'image' : 'page', for: isImage ? [x.contentUrl, x.url].filter(v => typeof v === 'string').map(v => abs(v, base)).filter(Boolean) : [] }));
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
  // a licence counts for this picture only when it is stated for it: on its image object, or on the picture's own page
  const covers = l => (l.scope === 'image' && (!l.for || !l.for.length || l.for.includes(imageUrl))) || (l.scope !== 'image' && primary && page.mediaPage);
  const mine = page.licences.filter(covers);
  const free = mine.filter(l => l.free); const bad = page.licences.filter(l => !l.free && (covers(l) || primary)); // a restrictive statement is heeded even when unscoped
  if (bad.length || (page.restricted && !free.some(l => l.scope === 'image'))) return { status: 'restricted', licence: bad[0] ? bad[0].name : 'all rights reserved', evidence: [bad[0] ? `${pageUrl} states ${bad[0].name} (${bad[0].via})` : `${pageUrl} says "all rights reserved"`], note: 'The page reserves rights this use would need.' };
  if (free.length) {
    const l = free[0];
    if (l.attribution && !page.author) return { status: 'unclear', licence: l.name, evidence: [`${pageUrl} states ${l.name} (${l.via})`], note: 'The licence needs the creator credited, and the page does not say who that is.' };
    return { status: 'free', licence: l.name, author: page.author || '', evidence: [`${pageUrl} states ${l.name} (${l.via}) for ${l.scope === 'image' ? 'this picture' : 'the picture it is the page of'}`], note: '' };
  }
  const other = page.licences.find(l => l.free);
  if (other) return { status: 'unclear', licence: '', evidence: [`${pageUrl} states ${other.name} for the page (${other.via}), not for this picture`], note: page.wiki ? 'The wiki\'s licence covers its text; the picture\'s own terms are not stated here.' : 'The licence on the page may not cover this picture.' };
  return { status: 'unclear', licence: '', evidence: [`${pageUrl} states no licence for it`], note: 'Finding a picture does not give permission to republish it.' };
}

// a picture stored on Wikimedia: "commons" files have their own record (licence, creator); files stored on a single
// wiki ("/wikipedia/en/...") are that wiki's local uploads -- often non-free logos and cover art
function wikimediaFile(u) {
  let x; try { x = new URL(u); } catch (e) { return null; }
  if (!/^(upload|thumb)\.wikimedia\.org$/.test(x.hostname)) return null;
  const m = /^\/wikipedia\/([^/]+)\/(?:thumb\/)?[0-9a-f]\/[0-9a-f]{2}\/([^/?]+)/.exec(x.pathname); if (!m) return null;
  let name; try { name = decodeURIComponent(m[2]); } catch (e) { return null; }
  return { project: m[1], file: 'File:' + name.replace(/_/g, ' ') };
}
const REUSABLE = /^(?!.*\b(?:nc|nd)\b)(?:public domain|pd\b|pd-|cc0|cc[ -]by(?:[ -]sa)?\b)/i;
function commonsPermission(info, file) {
  const url = info && info.pageUrl || `https://commons.wikimedia.org/wiki/${encodeURIComponent(file.replace(/ /g, '_'))}`;
  if (!info) return { status: 'unclear', licence: '', evidence: [`${file}: its Commons record could not be read`], note: 'The picture\'s own terms could not be checked.' };
  if (!REUSABLE.test(info.license || '')) return { status: /\b(nc|nd)\b/i.test(info.license || '') ? 'restricted' : 'unclear', licence: info.license || '', evidence: [`${url} states ${info.license || 'no licence'}`], note: 'The picture\'s own Commons record does not give a free licence.' };
  const needsCredit = !/^(public domain|pd\b|pd-|cc0)/i.test(info.license);
  if (needsCredit && !info.author) return { status: 'unclear', licence: info.license, evidence: [`${url} states ${info.license}`], note: 'The licence needs the creator credited, and the record does not say who that is.' };
  return { status: 'free', licence: info.license, author: info.author || '', licenseUrl: info.licenseUrl || '', commonsPage: url, evidence: [`${url} (the file's own Commons record) states ${info.license}`], note: '' };
}

// discover(input, deps) -> { candidates: [{ id, pageUrl, imageUrl, title, site, author, width, height, mime, bytes, sha1, permission, primary }], log }
//   deps: { searchPages(input) -> { pages: [{ url, title, why }], searches, usd, ms, error }, fetch?, fetchImg?,
//           commons?(fileTitles) -> [{ title, pageUrl, license, licenseUrl, author }] }
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
    const wm = wikimediaFile(w.u);
    const permission = wm && wm.project !== 'commons'
      ? { status: 'unclear', licence: '', evidence: [`stored on ${wm.project}.wikipedia as a local file (${wm.file}), not on Commons`], note: 'Files kept on one Wikipedia rather than Commons are usually non-free (logos, cover art).' }
      : wm ? null : permissionFor(w.page, w.u, w.pageUrl);
    candidates.push({ id: `w${candidates.length + 1}`, pageUrl: w.pageUrl, imageUrl: r.url, title: w.page.title || w.page.site || new URL(w.pageUrl).hostname, site: w.page.site || new URL(w.pageUrl).hostname, author: permission ? w.page.author : '', why: w.why,
      width: r.width, height: r.height, mime: r.mime, bytes: r.body, sha1, primary: w.primary, permission, commonsFile: wm && wm.project === 'commons' ? wm.file : null });
  }
  // Commons files: permission from the file's own record, in one lookup
  const cf = candidates.filter(c => c.commonsFile);
  if (cf.length) {
    let infos = [];
    try { infos = deps.commons ? await deps.commons(cf.map(c => c.commonsFile)) : await defaultCommons(cf.map(c => c.commonsFile)); log.commonsLookups = 1; } catch (e) { log.imageErrors.push('Commons lookup: ' + String(e && e.message || e).slice(0, 120)); }
    const norm = t => String(t || '').replace(/_/g, ' ').toLowerCase();
    cf.forEach(c => { const info = (infos || []).find(i => norm(i.title) === norm(c.commonsFile)); c.permission = commonsPermission(info, c.commonsFile); if (c.permission.status === 'free') { c.author = c.permission.author; c.pageUrl = c.permission.commonsPage || c.pageUrl; } });
  }
  return done(candidates);
}

async function defaultCommons(titles) {
  const research = require('./research');
  return research.commonsInfo(research.makeGetter(globalThis.fetch, { requests: 0, bytes: 0 }), titles, 800);
}

// the same picture under another size or query string (og:image ".../photo_b.jpg" vs a search result ".../photo_h.jpg")
function samePicture(a, b) {
  let x, y; try { x = new URL(a); y = new URL(b); } catch (e) { return false; }
  if (x.hostname === y.hostname && x.pathname === y.pathname) return true;
  const stem = u => { let n = u.pathname.split('/').pop() || ''; try { n = decodeURIComponent(n); } catch (e) { /* keep */ } return n.toLowerCase().replace(/\.(jpe?g|png|webp|gif)$/, '').replace(/[_-](?:[a-z]|\d{2,4}(?:x\d{2,4})?|large|medium|small|thumb|scaled)$/, ''); };
  const sx = stem(x), sy = stem(y); return sx.length >= 6 && sx === sy;
}

// art-community, portfolio and 3D-model hosts publish people's own work: of someone else's character, that is fan-made
const PERSONAL_WORK = /(^|\.)(deviantart\.com|artstation\.com|behance\.net|sketchfab\.com|pixiv\.net|tumblr\.com|newgrounds\.com|cgtrader\.com|turbosquid\.com|dribbble\.com|cara\.app|furaffinity\.net|thingiverse\.com|printables\.com|fiverr\.com|redbubble\.com|teepublic\.com|society6\.com|printler\.com|displate\.com|inprnt\.com|zbrushcentral\.com|polycount\.com|cgsociety\.org|ko-fi\.com|patreon\.com|artfol\.co)$/i;

// stock-photo libraries serve watermarked previews: never a usable picture
const STOCK = /(^|\.)(shutterstock\.com|dreamstime\.com|istockphoto\.com|alamy\.com|depositphotos\.com|stock\.adobe\.com|123rf\.com|gettyimages\.[a-z.]+|vecteezy\.com|freepik\.com|bigstockphoto\.com|canstockphoto\.com|pngtree\.com|magnific\.com|pikbest\.com|lovepik\.com|storyblocks\.com|pond5\.com|envato\.com|colourbox\.com|agefotostock\.com)$/i;

// discoverImages(input, deps) -> { candidates, curation, log } from IMAGE results (Google Images via SerpApi).
// Pictures are LOOKED AT before anything is downloaded: each result's small search thumbnail goes to the picture check
// (vision: what it shows, whether it is the character itself, and whether it is official material or fan-made).
// Only the suitable ones -- the character itself, official or of unknown origin, not a form, logo or interface -- then
// get their page read (permission evidence) and their original fetched (technical check). Suitability and permission
// stay separate: a suitable picture with no open licence is kept for the owner to review, never marked free.
//   deps.imageSearch(input) -> { results: [{ title, pageUrl, imageUrl, thumbUrl, width, height, source, isProduct, query, position }], searches, error }
//   deps.curate({ candidates: [{ id, title, description, size, thumb: { mime, bytes } }], max }) -> the picture check (ai.curate)
async function discoverImages(input, deps) {
  const t0 = Date.now(); const log = { searches: 0, pages: 0, pageErrors: [], images: 0, imageErrors: [], thumbErrors: [], bytes: 0, usd: 0, ms: 0, searchError: '', products: 0, results: 0, judged: 0 };
  const done = (candidates, curation) => ({ candidates, curation: curation || null, log: Object.assign(log, { ms: Date.now() - t0 }) });
  let found;
  try { found = await deps.imageSearch(input); } catch (e) { log.searchError = String(e && e.message || e).slice(0, 200); return done([]); }
  log.searches = found.searches || 0; log.results = (found.results || []).length; if (found.error) log.searchError = found.error;
  const fetchPage = deps.fetch || (u => safeFetch(u, { expect: /text\/html|application\/xhtml/, maxBytes: 1.5 * 1024 * 1024, accept: 'text/html' }));
  const fetchImg = deps.fetchImg || (u => fetchImage(u));
  const fetchThumb = deps.fetchThumb || (u => fetchImage(u, { maxBytes: 300 * 1024 }));
  // a shortlist across the searches (their best results first), without shopping results or repeats
  const byQuery = new Map(); (found.results || []).forEach(x => { if (!byQuery.has(x.query)) byQuery.set(x.query, []); byQuery.get(x.query).push(x); });
  const lists = [...byQuery.values()].map(l => l.slice().sort((a, b) => (a.position || 99) - (b.position || 99)));
  const shortlist = []; const seen = new Set();
  for (let i = 0; shortlist.length < 18 && lists.some(l => l[i]); i++) for (const l of lists) {
    const x = l[i]; if (!x || shortlist.length >= 18) continue;
    if (x.isProduct) { log.products++; continue; } // a shopping result: merchandise, never the character
    let img; try { img = new URL(x.imageUrl); } catch (e) { continue; }
    if (seen.has(img.href) || seen.has(x.pageUrl + '|' + img.pathname.split('/').pop())) continue; seen.add(img.href); seen.add(x.pageUrl + '|' + img.pathname.split('/').pop());
    shortlist.push(x);
  }
  // 1. look: the search thumbnails, judged by the picture check
  const cands = [];
  for (const [n, x] of shortlist.entries()) {
    const id = `w${n + 1}`; let thumb = null;
    if (x.thumbUrl) { const t = await fetchThumb(x.thumbUrl); if (t.ok && /^image\/(jpeg|png|webp)$/.test(t.mime)) thumb = { mime: t.mime, bytes: t.body }; else log.thumbErrors.push(`${x.title.slice(0, 60)}: ${t.reason || t.mime}`); }
    let host = ''; try { host = new URL(x.pageUrl).hostname; } catch (e) { /* none */ }
    cands.push({ id, x, host, thumb });
  }
  let curation = null;
  const judgeable = cands.filter(c => c.thumb);
  if (deps.curate && judgeable.length) {
    try { curation = await deps.curate({ max: 8, candidates: judgeable.map(c => ({ id: c.id, title: c.x.title, description: `on ${c.x.source || c.host} (${c.host}); found by the search "${c.x.query}"`, categories: '', size: `${c.x.width}x${c.x.height}`, thumb: c.thumb })) }); log.judged = judgeable.length; }
    catch (e) { log.searchError = log.searchError || `the picture check failed (${String(e && e.message || e).slice(0, 120)})`; }
  }
  // the host rule overrides the check's guess: a portfolio's render of a franchise character is a fan's work
  if (curation && curation.verdicts) cands.forEach(c => { const k = curation.verdicts[c.id]; if (k && PERSONAL_WORK.test(c.host) && k.origin !== 'fan') { k.origin = 'fan'; k.originBy = `${c.host} hosts personal work`; } });
  if (curation && curation.verdicts) cands.forEach(c => { const k = curation.verdicts[c.id]; if (k && STOCK.test(c.host) && !(k.issues || []).includes('watermark')) k.issues = (k.issues || []).concat(['watermark']); });
  const verdictOf = c => (curation && curation.verdicts && curation.verdicts[c.id]) || null;
  const suitable = k => !!(k && k.identity === 'exact' && (k.role === 'subject' || k.role === 'detail') && k.origin !== 'fan' && !(k.issues || []).includes('watermark'));
  // 2. read and fetch only the suitable ones: official first, then the check's quality, then size
  const order = cands.filter(c => suitable(verdictOf(c))).sort((a, b) => { const ka = verdictOf(a), kb = verdictOf(b); return (kb.origin === 'official') - (ka.origin === 'official') || (kb.quality || 0) - (ka.quality || 0) || (b.x.width * b.x.height) - (a.x.width * a.x.height); });
  const pages = new Map(); const seenHash = new Set();
  for (const c of order.slice(0, 8)) {
    const w = c.x;
    const r = await fetchImg(w.imageUrl); log.images++;
    if (r.ok && (r.width < 300 || r.height < 300)) { c.technical = { fetched: false, reason: `too small (${r.width}x${r.height})` }; log.imageErrors.push(`${w.imageUrl.slice(0, 120)}: too small`); }
    else if (!r.ok) { c.technical = { fetched: false, reason: r.reason }; log.imageErrors.push(`${w.imageUrl.slice(0, 120)}: ${r.reason}`); }
    else {
      const sha1 = crypto.createHash('sha1').update(r.body).digest('hex'); if (seenHash.has(sha1)) { c.duplicate = true; continue; } seenHash.add(sha1);
      log.bytes += r.body.length; c.technical = { fetched: true, reason: '' }; c.bytes = r.body; c.mime = r.mime; c.width = r.width; c.height = r.height; c.imageUrl = r.url;
    }
    let page = pages.get(w.pageUrl);
    if (page === undefined) { const p = await fetchPage(w.pageUrl); log.pages++; if (p.ok) { log.bytes += p.body.length; page = readPage(p.body.toString('utf8'), p.url); } else { page = null; log.pageErrors.push(`${w.pageUrl}: ${p.reason}`); } pages.set(w.pageUrl, page); }
    c.page = page;
    const wm = wikimediaFile(c.imageUrl || w.imageUrl);
    if (wm && wm.project !== 'commons') c.permission = { status: 'unclear', licence: '', evidence: [`stored on ${wm.project}.wikipedia as a local file (${wm.file}), not on Commons`], note: 'Files kept on one Wikipedia rather than Commons are usually non-free (logos, cover art).' };
    else if (wm) c.commonsFile = wm.file;
    else if (!page) c.permission = { status: 'unclear', licence: '', evidence: [`${w.pageUrl} could not be read, so what it states about the picture is unknown`], note: 'The page it is on could not be read, so its terms are unknown.' };
    else { const main = page.primary.find(p => samePicture(p, w.imageUrl) || (c.imageUrl && samePicture(p, c.imageUrl))); c.permission = permissionFor(page, main || w.imageUrl, w.pageUrl); }
  }
  const cf = cands.filter(c => c.commonsFile);
  if (cf.length) {
    let infos = [];
    try { infos = deps.commons ? await deps.commons(cf.map(c => c.commonsFile)) : await defaultCommons(cf.map(c => c.commonsFile)); } catch (e) { log.imageErrors.push('Commons lookup: ' + String(e && e.message || e).slice(0, 120)); }
    const norm = t => String(t || '').replace(/_/g, ' ').toLowerCase();
    cf.forEach(c => { const info = (infos || []).find(i => norm(i.title) === norm(c.commonsFile)); c.permission = commonsPermission(info, c.commonsFile); if (c.permission.status === 'free') c.commonsPage = c.permission.commonsPage; });
  }
  const candidates = cands.filter(c => !c.duplicate).map(c => ({
    id: c.id, pageUrl: c.commonsPage || c.x.pageUrl, imageUrl: c.imageUrl || c.x.imageUrl, thumbUrl: c.x.thumbUrl, title: c.x.title || (c.page && c.page.title) || c.host, site: c.x.source || (c.page && c.page.site) || c.host,
    author: c.permission && c.permission.status === 'free' ? (c.permission.author || (c.page && c.page.author) || '') : '', why: `Google Images: "${c.x.query}"`, query: c.x.query || '', searchPosition: c.x.position || 0,
    width: c.width || c.x.width, height: c.height || c.x.height, mime: c.mime || (c.thumb && c.thumb.mime) || '', bytes: c.bytes || null, thumb: c.thumb, technical: c.technical || null,
    permission: c.permission || null, verdict: verdictOf(c), commonsFile: c.commonsFile || null, primary: true,
  }));
  return done(candidates, curation);
}

module.exports = { STOCK, PERSONAL_WORK, discover, discoverImages, samePicture, readPage, permissionFor, licenceOf, wikimediaFile, commonsPermission };
