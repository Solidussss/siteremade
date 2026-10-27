// DEMO PHOTOS: real photographs for every design's demo, so the catalogue shows each design the way a business's site
// will look, not a drawing. The owner's "Find photos" (design-packages/demo-photos.html) does, per design:
//   1. searches for real photographs of that kind of business, free for business use with no credit needed: Pexels
//      (with a free key), else Wikimedia Commons (CC0 or public domain only), else Openverse (CC0 or public domain)
//   2. downloads the best-sized candidates and shrinks them to the site's size (JPEG, 1600 px at most)
//   3. lets the hero director (lib/hero-director.js, Claude on SiteRemade's key) pick and order up to four, or none
//   4. finds each one's subject (lib/photo-analyse.js) and keeps the set (db.demoPhotos)
// The demo at /designs/demo/<design> then plays them like a real site would. A customer's site never gets them: it
// starts from the design's example words (design-sites startFromExample), and its photos are the customer's own.
'use strict';

const heroDirector = require('./hero-director');
const work = require('./photo-work');
const { ORDER } = require('../design-packages/engine/photo-hero');

// what each design's business looks like in a photo: two searches each, the first one tried first
const QUERIES = {
  larder: ['restaurant dinner table candles', 'plated food restaurant'], ochre: ['hair salon colourist', 'hairdresser salon'],
  ventricle: ['gym barbell weights', 'weightlifting gym'], brisk: ['clean modern kitchen', 'cleaning kitchen'],
  verge: ['garden patio lawn', 'landscaped garden'], camber: ['car mechanic garage', 'car repair workshop'],
  steadyhand: ['barber haircut', 'barbershop'], saltglass: ['dental clinic', 'dentist'],
  axis: ['physiotherapy treatment', 'massage therapy'], beadline: ['car detailing', 'car wash foam'],
  compass: ['business coaching meeting', 'office meeting window'], drape: ['clothing boutique', 'clothes shop rail'],
  fettle: ['plumber pipes', 'electrician work'], forno: ['pizza oven', 'wood fired pizza'],
  gather: ['wedding barn venue', 'wedding reception tables'], halcyra: ['perfume bottle', 'fragrance bottle'],
  halden: ['law office desk', 'office meeting room'], hearth: ['bed and breakfast bedroom', 'cosy hotel room'],
  inkwell: ['tattoo artist', 'tattoo studio'], keel: ['roofer roof', 'roof tiles'],
  lacquer: ['manicure nails', 'nail salon'], northlight: ['photography studio', 'photographer camera studio'],
  petal: ['florist bouquet', 'flower shop'], plait: ['office team laptop', 'startup office'],
  plumb: ['house extension construction', 'builder construction site'], primer: ['tutor student homework', 'studying desk books'],
  proof: ['bakery bread', 'sourdough bread'], scruff: ['dog grooming', 'dog groomer'],
  sereine: ['skincare serum bottle', 'cosmetics bottle'], stillwater: ['yoga studio', 'yoga class'],
  aldane: ['wristwatch', 'watch closeup'], clutch: ['toy building bricks', 'colorful toy blocks'],
  kova: ['running shoes', 'sneakers'], nube: ['coffee shop', 'latte coffee cup'],
  ondo: ['headphones', 'over-ear headphones'], lintel: ['house exterior', 'modern house'],
};

const MAX_BYTES = 15 * 1024 * 1024;
const PER_DESIGN = 8; // candidates the director looks at

// THE LIBRARIES, best first. Each search gives real photographs only, free for business use with no credit needed:
// [{ url, width, height, title, creator, license, landing, source }]. A library that refuses us ("slow down", or
// not available) is skipped for the rest of the run and the next one is asked.
const UA = 'SiteRemade/1.0 (https://www.siteremade.com; hello@siteremade.com)';
const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));
const plain = (html) => String(html || '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
const spaced = {}; // (each library's last search, to keep them spaced out)
async function politely(name, gapMs, wait, call) { const gap = (spaced[name] || 0) + gapMs - Date.now(); if (gap > 0) await wait(gap); spaced[name] = Date.now(); return call(); }
const refused = (name, status) => Object.assign(new Error(`${name} refused the search (${status})`), { code: 'refused', library: name });

// Pexels (pexels.com): the best free photos, free for business use, no credit needed. Needs a free key (PEXELS_API_KEY).
async function pexels(query, { fetchImpl, wait, keys }) {
  const key = keys && keys.pexels; if (!key) return null;
  const q = new URLSearchParams({ query, orientation: 'landscape', size: 'large', per_page: '20' });
  const r = await politely('pexels', 1500, wait, () => fetchImpl(`https://api.pexels.com/v1/search?${q}`, { headers: { authorization: key, 'user-agent': UA } }));
  if (!r.ok) throw refused('Pexels', r.status);
  const j = await r.json();
  return (j.photos || []).filter((x) => x && x.src && (x.src.large2x || x.src.original)).map((x) => ({ url: x.src.original ? `${x.src.original}?auto=compress&cs=tinysrgb&w=1600` : x.src.large2x, width: x.width, height: x.height, title: String(x.alt || 'Photo').slice(0, 140), creator: String(x.photographer || '').slice(0, 80), license: 'Pexels', landing: x.url || '', source: 'pexels' }));
}

// Pixabay (pixabay.com): good free photos, free for business use, no credit needed. Needs a free key
// (PIXABAY_API_KEY: shown on pixabay.com/api/docs once signed in). Pixabay asks that photos are kept on our own
// server rather than linked, which is what we do. Editors' choice first, the best of the rest after.
async function pixabay(query, { fetchImpl, wait, keys }) {
  const key = keys && keys.pixabay; if (!key) return null;
  const ask = async (editors) => {
    const q = new URLSearchParams({ key, q: query.slice(0, 100), image_type: 'photo', orientation: 'horizontal', min_width: '1200', safesearch: 'true', per_page: '20', order: 'popular' });
    if (editors) q.set('editors_choice', 'true');
    const r = await politely('pixabay', 800, wait, () => fetchImpl(`https://pixabay.com/api/?${q}`, { headers: { accept: 'application/json', 'user-agent': UA } }));
    if (!r.ok) throw refused('Pixabay', r.status);
    return ((await r.json()).hits || []).filter((x) => x && (x.largeImageURL || x.fullHDURL));
  };
  let hits = await ask(true); if (hits.length < 4) hits = hits.concat(await ask(false));
  return hits.map((x) => ({ url: x.fullHDURL || x.largeImageURL, width: x.imageWidth, height: x.imageHeight, title: String(x.tags || 'Photo').slice(0, 140), creator: String(x.user || '').slice(0, 80), license: 'Pixabay', landing: x.pageURL || '', source: 'pixabay' }));
}

// Wikimedia Commons: real photos, no key. Only files whose licence is CC0 or public domain are kept; Commons hands
// back a copy 1600 px wide, so nothing big is downloaded.
async function commons(query, { fetchImpl, wait }) {
  const q = new URLSearchParams({ action: 'query', format: 'json', formatversion: '2', generator: 'search', gsrnamespace: '6', gsrlimit: '30',
    gsrsearch: `${query} filetype:bitmap`, prop: 'imageinfo', iiprop: 'url|size|mime|extmetadata', iiurlwidth: '1600', iiextmetadatafilter: 'LicenseShortName|Artist|ObjectName' });
  const r = await politely('commons', 1500, wait, () => fetchImpl(`https://commons.wikimedia.org/w/api.php?${q}`, { headers: { accept: 'application/json', 'user-agent': UA } }));
  if (!r.ok) throw refused('Wikimedia Commons', r.status);
  const j = await r.json();
  return ((j.query && j.query.pages) || []).map((pg) => ({ pg, ii: (pg.imageinfo || [])[0] })).filter(({ ii }) => ii && ii.mime === 'image/jpeg' && (ii.thumburl || ii.url))
    .map(({ pg, ii }) => { const m = ii.extmetadata || {}, lic = plain(m.LicenseShortName && m.LicenseShortName.value); return { url: ii.thumburl || ii.url, width: ii.width, height: ii.height, title: plain(m.ObjectName && m.ObjectName.value) || String(pg.title || '').replace(/^File:/, '').replace(/\.[a-z]+$/i, ''), creator: plain(m.Artist && m.Artist.value).slice(0, 80), license: lic, landing: ii.descriptionurl || '', source: 'wikimedia' }; })
    .filter((x) => /^(cc0|public domain|pd\b|pd-)/i.test(x.license) && (x.width || 0) >= 1200 && (x.height || 0) >= 700)
    .map((x) => ({ ...x, title: x.title.slice(0, 140), license: /^cc0/i.test(x.license) ? 'CC0' : 'Public domain' }));
}

// Openverse: CC0 and public-domain photographs from many collections, no key; it limits shared servers hard.
async function openverse(query, { fetchImpl, wait }) {
  const q = new URLSearchParams({ q: query, license: 'cc0,pdm', category: 'photograph', size: 'large', mature: 'false', page_size: '20' });
  const r = await politely('openverse', 12000, wait, () => fetchImpl(`https://api.openverse.org/v1/images/?${q}`, { headers: { accept: 'application/json', 'user-agent': UA } }));
  if (!r.ok) throw refused('Openverse', r.status);
  const j = await r.json();
  return (j.results || [])
    .filter((x) => x && x.url && /^https:\/\//.test(x.url) && /^(cc0|pdm)$/i.test(String(x.license || '')) && !x.mature)
    .filter((x) => !x.filetype || /^jpe?g$/i.test(x.filetype))
    .filter((x) => (x.width || 0) >= 1000 && (x.height || 0) >= 640)
    .map((x) => ({ url: x.url, width: x.width, height: x.height, title: String(x.title || '').slice(0, 140), creator: String(x.creator || '').slice(0, 80), license: String(x.license).toUpperCase(), landing: x.foreign_landing_url || '', source: x.source || x.provider || 'openverse' }));
}

// (the free libraries without a key, Commons and Openverse, are only asked when no keyed library is set up: their
// photos are too uneven to stand in for a business, so with a key they never are)
const LIBRARIES = [['pexels', pexels], ['pixabay', pixabay], ['commons', commons], ['openverse', openverse]];
const envKeys = () => ({ pexels: process.env.PEXELS_API_KEY || '', pixabay: process.env.PIXABAY_API_KEY || '' });
// one search across the libraries: the first that answers with photos wins; refusals are remembered in `off`
async function search(query, { fetchImpl = fetch, wait = sleep, keys = envKeys(), off = new Set(), log = () => {} } = {}) {
  const keyed = !!(keys.pexels || keys.pixabay);
  for (const [name, f] of LIBRARIES) {
    if (off.has(name) || (keyed && (name === 'commons' || name === 'openverse'))) continue;
    try { const got = await f(query, { fetchImpl, wait, keys }); if (got && got.length) return got; }
    catch (e) { off.add(name); log(`${name} skipped: ${e.message}`); }
  }
  return [];
}

// one photo, downloaded and shrunk to the site's size; null when it isn't a JPEG we can read
async function download(url, { fetchImpl = fetch } = {}) {
  const r = await fetchImpl(url, { headers: { 'user-agent': UA }, redirect: 'follow', signal: AbortSignal.timeout(25000) });
  if (!r.ok) return null;
  const len = Number(r.headers.get('content-length') || 0); if (len > MAX_BYTES) return null;
  const buf = Buffer.from(await r.arrayBuffer()); if (buf.length > MAX_BYTES || buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  return work.shrink(buf);
}

// a design's demo set: searched, downloaded, picked and ordered by the director, each subject found.
// -> { photos: [{ slot, data, mask }], camera, note, credits } or { none: reason }
async function findFor(design, { manifest, category, call = null, fetchImpl = fetch, wait = sleep, keys = envKeys(), off = new Set(), log = () => {} } = {}) {
  const queries = QUERIES[design];
  if (!queries) return { none: 'no search for this design' };
  const seen = new Set(), cands = [];
  for (const q of queries) {
    if (cands.length >= PER_DESIGN * 2) break;
    for (const c of await search(q, { fetchImpl, wait, keys, off, log })) if (!seen.has(c.url)) { seen.add(c.url); cands.push(c); }
  }
  // (wide photos first: they suit a website's hero best)
  cands.sort((a, b) => (b.width / b.height >= 1.2) - (a.width / a.height >= 1.2) || b.width * b.height - a.width * a.height);
  const got = [];
  for (const c of cands) {
    if (got.length >= PER_DESIGN) break;
    try { const data = await download(c.url, { fetchImpl }); if (data) got.push({ ...c, data }); } catch (e) { log(`skip ${c.url}: ${e.message}`); }
  }
  if (!got.length) return { none: off.size && cands.length === 0 ? 'the photo libraries refused the search: try again in an hour' : 'the libraries had no usable photos for this business' };
  const d = await heroDirector.direct(got.map((g) => ({ mime: 'image/jpeg', data: g.data })), { call, design, category, businessName: 'a demo business' });
  if (!d || d.plan.keep) return { none: d && d.plan.note ? d.plan.note : 'none of the photos was good enough' };
  const pick = { before: d.plan.before, second: d.plan.middle[0] || 0, third: d.plan.middle[1] || 0, main: d.plan.main };
  const order = ORDER.filter((k) => pick[k]);
  const found = [];
  for (const k of order) { try { found[pick[k] - 1] = await work.analyse(got[pick[k] - 1].data); } catch (e) { found[pick[k] - 1] = null; } }
  const changes = heroDirector.changes({ manifest: manifest || { photoHero: {} }, schema: {} }, d.plan, got.map((g) => 'x'), found);
  const camera = (changes.find((c) => c.path === 'photos.camera') || {}).value || null;
  return {
    photos: order.map((k) => { const g = got[pick[k] - 1], f = found[pick[k] - 1]; return { slot: k, data: g.data, mask: f && f.kind === 'subject' ? f.mask : null }; }),
    camera, note: d.plan.note || '', by: d.by, problem: d.problem || null,
    credits: order.map((k) => { const g = got[pick[k] - 1]; return { slot: k, title: g.title, creator: g.creator, license: g.license, landing: g.landing, source: g.source }; }),
  };
}

module.exports = { QUERIES, LIBRARIES, search, download, shrink: require('./photo-shrink').shrink, findFor };
