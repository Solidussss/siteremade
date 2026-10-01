'use strict';
// CREATIVE PICTURE DISCOVERY: finding the subject is kept apart from being allowed to use a picture of it. Several
// distinct Google Images searches (not one), a fallback when a result set is weak, a cache that never freezes a poor
// answer, bounded everything -- and "found, but rights unverified" is never reported as "nothing found". Automatic use
// stays exactly as strict as before: only pictures whose pages state a free licence.
const test = require('node:test');
const assert = require('node:assert/strict');
const D = require('../lib/creative/discovery');
const serp = require('../lib/creative/serpapi');
const { discoverImages } = require('../lib/creative/webimages');
const { research } = require('../lib/creative/research');
const { SSBU, NEEGY, fakeSearch } = require('./fixtures/creative-discovery');

const png = n => { const b = Buffer.alloc(40); b.write('\x89PNG\r\n\x1a\n', 0, 'latin1'); b.writeUInt32BE(n, 30); return b; };
const norm = q => q.replace(/ -\S+/g, '').trim().toLowerCase();
// the whole discovery pipeline over a fixture, as the server runs it: the searches, the look at every thumbnail (a fake
// picture check from a verdict rule), reading pages and fetching originals, settling, and the summary
async function pipeline(fx, o) {
  const opt = o || {}; const search = opt.search || fakeSearch(fx); let run = null; const fetched = [], read = [];
  const found = await discoverImages({ identity: fx.understanding.identity }, {
    imageSearch: async () => { run = await D.runSearches(fx.understanding, { search, budget: opt.budget, cacheGet: opt.cacheGet, cachePut: opt.cachePut, dailyLeft: opt.dailyLeft }); return { results: run.results, searches: run.searches, error: run.error }; },
    fetchThumb: async u => ({ ok: true, url: u, body: png(u.length), mime: 'image/png', width: 200, height: 200 }),
    curate: async ({ candidates }) => { const verdicts = {}; candidates.forEach(c => { verdicts[c.id] = opt.verdict(c); }); return { verdicts, selection: candidates.map(c => c.id).filter(id => verdicts[id].identity === 'exact' && verdicts[id].origin !== 'fan').slice(0, 8), coverage: 'partial', missing: [] }; },
    fetch: async u => { read.push(u); const page = opt.pages && opt.pages(u); return page ? { ok: true, url: u, body: Buffer.from(page) } : { ok: true, url: u, body: Buffer.from('<html><head><title>x</title></head><body>no licence stated</body></html>') }; },
    fetchImg: async u => { fetched.push(u); return opt.fetchFails && opt.fetchFails(u) ? { ok: false, reason: 'HTTP 403' } : { ok: true, url: u, body: png(1000 + fetched.length), mime: 'image/png', width: 1600, height: 900 }; },
  });
  const settled = D.settle(found.candidates, found.curation);
  const sum = D.summarise({ name: fx.name, search: run, log: found.log, candidates: found.candidates, used: settled.images.map(v => v.id), review: settled.review.map(r => r.id) });
  return { run, found, settled, sum, search, fetched, read };
}
// the picture check as a rule over the fixture's titles and hosts
const verdictBy = c => {
  const t = `${c.title} ${String(c.description).replace(/; found by the search[\s\S]*$/, '')}`; // (title and site only: the query itself names the exclusions)
  if (/deviantart|artstation|newgrounds|pixiv|fan ?art|redraw|drawing|fan poster/i.test(t)) return { role: 'subject', identity: 'exact', origin: 'fan', depicts: 'a fan drawing', quality: 2, issues: [] };
  if (/cosplay|figure|amiibo|plush|keychain|t-shirt|merch/i.test(t)) return { role: 'subject', identity: 'form', origin: 'unknown', depicts: 'merchandise', quality: 1, issues: [] };
  if (/Switch game|Controller|poster for sale|Nintendo Switch$/i.test(t)) return { role: 'supporting', identity: 'related', origin: 'unknown', depicts: 'a product box', quality: 1, issues: [] };
  return { role: 'subject', identity: 'exact', origin: /nintendo|smashbros|knowyourmeme/i.test(t) ? 'official' : 'unknown', depicts: 'the subject itself', quality: 3, issues: [] };
};
const onlyFan = () => ({ role: 'subject', identity: 'exact', origin: 'fan', depicts: 'a fan drawing', quality: 2, issues: [] });
const FREE_PAGE = '<html><head><meta property="og:type" content="photo"><meta property="og:image" content="IMG"><meta name="author" content="A. Artist"></head><body><a rel="license" href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a></body></html>';

// ---------------------------------------------------------------- 1
test('1. a recognizable, branded subject runs several DISTINCT search families by default -- not one query', async () => {
  const { run, search } = await pipeline(SSBU, { verdict: verdictBy });
  assert.ok(run.searches >= 2 && run.searches <= D.LIMITS.defaultBudget, `${run.searches} searches`);
  const qs = search.calls.map(norm);
  assert.equal(new Set(qs).size, qs.length, 'no query repeated');
  assert.deepEqual(run.queries.map(q => q.family), ['render', 'key-art', 'screenshot'], 'render, key art and gameplay screenshots: three intents');
  qs.forEach(q => { assert.match(q, /^super smash bros\. ultimate /); assert.doesNotMatch(q, /ultimate super smash/, 'the name is never repeated from the article title'); });
  qs.forEach(q => assert.doesNotMatch(q, /official image|mood|aesthetic|wallpaper/, 'subject-specific, never generic mood searches'));
  // the default budget is three (the old default was one); the server reads it from the module
  assert.equal(D.LIMITS.defaultBudget, 3);
  assert.match(require('fs').readFileSync(require('path').join(__dirname, '..', 'server.js'), 'utf8'), /Number\(process\.env\.CREATIVE_SERPAPI_SEARCHES\) \|\| creativeDiscovery\.LIMITS\.defaultBudget/);
  // each subject type has its own intents: a meme is searched as a meme, a real thing as a photograph
  assert.deepEqual(D.planSearches(NEEGY.understanding).filter(p => !p.fallback).map(p => norm(p.q)), ['neegy meme', 'neegy character image', 'neegy original image']);
  assert.match(norm(D.planSearches({ identity: { name: 'Doughnut', kind: 'recognizable' }, visuals: { depiction: 'photo', setting: 'a bakery counter' } })[2].q), /^doughnut bakery counter$/);
  // the old API still answers, from the same plan
  assert.deepEqual(serp.searchQueries(SSBU.understanding, 3).map(q => q.q), D.planSearches(SSBU.understanding).slice(0, 3).map(p => p.q));
});

// ---------------------------------------------------------------- 2
test('2. a weak first search (mostly shopping, figures and cosplay) is followed by different searches for the subject', async () => {
  const { run } = await pipeline(SSBU, { verdict: verdictBy });
  const first = run.queries[0];
  assert.equal(first.family, 'render'); assert.equal(first.weak, true); assert.match(first.why, /mostly shopping results|mostly cosplay/);
  assert.ok(run.queries[1] && run.queries[1].family !== 'render' && !run.queries[1].weak, 'the next search is a different intent, and it is strong');
  // when EVERY search is weak, one extra fallback search is allowed beyond the budget -- then it stops
  const junk = { name: 'X', understanding: { identity: { name: 'Zorblax', kind: 'fictional', what: 'a video game character' }, visuals: { depiction: 'artwork' } }, results: {} };
  const products = async () => ({ ok: true, status: 200, results: Array.from({ length: 12 }, (_, i) => ({ title: `Zorblax toy ${i}`, pageUrl: `https://s${i}.example.com/p`, imageUrl: `https://s${i}.example.com/${Math.random()}.jpg`, width: 800, height: 800, isProduct: true, position: i + 1 })) });
  const r = await D.runSearches(junk.understanding, { search: products, budget: 3 });
  assert.equal(r.searches, 4, 'three weak searches, then one fallback');
  assert.ok(r.queries.every(q => q.weak)); assert.ok(r.queries.some(q => q.fallback), 'the extra search is a fallback family');
  assert.equal(r.stop, 'search budget used');
  // an excellent first answer does not spend the whole budget: a second family still runs for variety, then it stops
  const plenty = async q => ({ ok: true, status: 200, results: Array.from({ length: 25 }, (_, i) => ({ title: `Zorblax official art ${i}`, pageUrl: `https://ok${i}.example.com/p`, imageUrl: `https://ok${i}.example.com/${norm(q).length}-${i}.png`, width: 1600, height: 900, position: i + 1 })) });
  const r2 = await D.runSearches(junk.understanding, { search: plenty, budget: 3 });
  assert.ok(r2.searches <= 2, `${r2.searches} searches for an excellent subject`); assert.equal(r2.stop, 'enough good results');
});

// ---------------------------------------------------------------- 3
test('3. shopping results do not count as finding the subject', async () => {
  const a = D.assessResults(SSBU.results.render, SSBU.understanding);
  assert.equal(a.weak, true); assert.ok(a.products >= 5 && a.forms >= 5 && a.good <= 2, JSON.stringify(a));
  // a discovery that only ever saw shopping results reports nothing found -- never the subject
  const onlyShop = { name: 'X', understanding: SSBU.understanding, results: { render: SSBU.results.render.filter(x => x.isProduct), 'key-art': SSBU.results.render.filter(x => x.isProduct), screenshot: [] } };
  const { sum, found } = await pipeline(onlyShop, { verdict: verdictBy });
  assert.equal(found.candidates.length, 0, 'shopping results are never looked at');
  assert.ok(['nothing-found', 'nothing-relevant'].includes(sum.discovery)); assert.equal(sum.counts.exactSubject, 0);
  assert.ok(sum.counts.productsSkipped > 0, 'and the skipped shopping results are counted');
});

// ---------------------------------------------------------------- 4
test('4. fan-made pictures only: reported as found-but-not-official, never as "nothing found"', async () => {
  const { sum, settled } = await pipeline(NEEGY, { verdict: onlyFan });
  assert.equal(sum.discovery, 'fan-made-only'); assert.equal(sum.status, 'fan-made-only');
  assert.ok(sum.counts.fanMade > 0); assert.equal(settled.images.length, 0); assert.equal(settled.review.length, 0, 'fan art is still never offered or used');
  assert.match(sum.message, /We found pictures of Neegy, but only fan-made ones/); assert.doesNotMatch(sum.message, /couldn't find/i);
});

// ---------------------------------------------------------------- 5, 6
test('5, 6. the subject found with unclear rights: discovery succeeded, permission is reported separately, and the pictures reach the owner to review', async () => {
  const { sum, settled } = await pipeline(SSBU, { verdict: verdictBy });
  assert.equal(sum.discovery, 'exact-subject', 'discovery succeeded'); assert.equal(sum.permission, 'unclear'); assert.equal(sum.status, 'found-rights-unverified');
  assert.ok(sum.counts.exactSubject >= 6 && sum.counts.permissionUnclear === sum.counts.exactSubject && sum.counts.permissionFree === 0);
  assert.match(sum.message, /We found pictures of Super Smash Bros\. Ultimate, but their reuse rights could not be verified automatically/);
  assert.ok(settled.review.length >= 1 && settled.review.length <= 6, `${settled.review.length} offered for review`);
  assert.ok(settled.review.every(r => r.identity === 'exact' && r.origin !== 'fan' && r.permission.status !== 'free'));
  assert.equal(settled.images.length, 0, 'nothing used automatically');
  // official material first on the review screen
  assert.equal(settled.review[0].origin, 'official');
  // a restricted page ("All rights reserved") is reported as restricted, still as a successful discovery
  const r2 = await pipeline(NEEGY, { verdict: verdictBy, pages: () => '<html><body>© 2024 Example. All rights reserved.</body></html>' });
  assert.equal(r2.sum.discovery, 'exact-subject'); assert.ok(r2.sum.counts.permissionRestricted >= 1, JSON.stringify(r2.sum.counts));
});

// ---------------------------------------------------------------- 7
test('7. a picture whose page states a free licence is still used automatically', async () => {
  const { sum, settled } = await pipeline(SSBU, { verdict: verdictBy, pages: u => (/press\.nintendo\.com/.test(u) ? FREE_PAGE.replace('IMG', 'https://press.nintendo.com/img/ssbu-banner.png') : null) });
  assert.equal(settled.images.length, 1); assert.match(settled.images[0].imageUrl, /ssbu-banner/); assert.equal(settled.images[0].permission.status, 'free');
  assert.equal(sum.status, 'used'); assert.equal(sum.counts.autoUsed, 1); assert.equal(sum.counts.permissionFree, 1);
});

// ---------------------------------------------------------------- 8
test('8. a weak cached answer never suppresses a better search: it is used, found weak, and the next families still run', async () => {
  const cache = new Map(); const put = (k, results, q) => cache.set(k, { results, good: q.good, at: Date.now() });
  // yesterday's answer for the first query was poor (all shopping)
  const firstKey = D.cacheKey(D.planSearches(SSBU.understanding)[0]);
  cache.set(firstKey, { results: SSBU.results.render.filter(x => x.isProduct), good: 0, at: Date.now() - 86400000 });
  const search = fakeSearch(SSBU);
  const { run } = await pipeline(SSBU, { verdict: verdictBy, search, cacheGet: k => cache.get(k) || null, cachePut: put });
  assert.equal(run.queries[0].cached, true); assert.equal(run.queries[0].weak, true);
  assert.ok(search.calls.length >= 2, 'fresh searches followed'); assert.ok(run.queries.slice(1).some(q => !q.cached && !q.weak));
  // a weak answer expires after two days, a strong one keeps for the cache's thirty
  assert.equal(D.cacheDaysFor({ good: 0 }, 30), D.WEAK_CACHE_DAYS); assert.equal(D.cacheDaysFor({ good: 12 }, 30), 30);
  assert.equal(D.cacheDaysFor({}, 30), D.WEAK_CACHE_DAYS, 'an old entry without a quality record counts as weak');
  // the plan's version is part of every key: an answer cached for an older query plan is never reused
  assert.match(firstKey, new RegExp(`^${D.PLAN_VERSION}\\|`));
  // the server applies the expiry
  const srv = require('fs').readFileSync(require('path').join(__dirname, '..', 'server.js'), 'utf8');
  assert.match(srv, /creativeDiscovery\.cacheDaysFor\(e, CREATIVE_SERPAPI\.cacheDays\)/);
});

// ---------------------------------------------------------------- 9
test('9. everything stays bounded: searches, queries, results, looks, downloads', async () => {
  const flood = async q => ({ ok: true, status: 200, results: Array.from({ length: 100 }, (_, i) => ({ title: `Zorblax toy ${i}`, pageUrl: `https://s${i}.example.com/p`, imageUrl: `https://s${i}.example.com/${norm(q).length}-${i}.jpg`, width: 800, height: 800, isProduct: i % 2 === 0, position: i + 1 })) });
  const u = { identity: { name: 'Zorblax', kind: 'fictional', what: 'a video game character' }, visuals: { main: 'Zorblax with its glowing sword and armour', depiction: 'artwork' } };
  for (const budget of [1, 3, 99]) {
    const r = await D.runSearches(u, { search: flood, budget });
    assert.ok(r.searches <= Math.min(budget, D.LIMITS.maxBudget) + D.LIMITS.extraFallback, `budget ${budget}: ${r.searches} searches`);
    assert.ok(r.queries.length <= D.LIMITS.maxQueries); assert.ok(r.queries.every(q => q.results <= D.LIMITS.resultsPerSearch));
  }
  assert.ok(D.planSearches(u, { refine: 'with the sword' }).length <= D.LIMITS.maxQueries);
  // a provider refusal stops the searches at once; the daily cap is respected
  const refused = await D.runSearches(u, { search: async () => ({ ok: false, status: 429, results: [], error: 'limit' }), budget: 3 });
  assert.equal(refused.searches, 1); assert.equal(refused.stop, 'provider refused');
  const daily = await D.runSearches(u, { search: flood, budget: 3, dailyLeft: () => 0 });
  assert.equal(daily.searches, 0); assert.match(daily.error, /daily/);
  // looks and downloads stay within the pipeline's own limits (18 thumbnails judged, 8 originals fetched)
  const { found, fetched } = await pipeline(SSBU, { verdict: () => ({ role: 'subject', identity: 'exact', origin: 'official', depicts: 'x', quality: 3, issues: [] }) });
  assert.ok(found.candidates.length <= 18); assert.ok(fetched.length <= 8);
});

// ---------------------------------------------------------------- 10
test('10. no Google Images result is ever used automatically without the permission check saying free', async () => {
  // every result the subject itself, official, selected by the check, downloaded -- but no page states a licence
  const { settled } = await pipeline(SSBU, { verdict: () => ({ role: 'subject', identity: 'exact', origin: 'official', depicts: 'x', quality: 3, issues: [] }) });
  assert.equal(settled.images.length, 0);
  // and directly: selected, downloaded, the subject itself -- restricted, unclear or unread terms are never used
  const v = (id, permission) => ({ id, pageUrl: 'https://x.example.org/p', imageUrl: `https://x.example.org/${id}.png`, bytes: png(1), mime: 'image/png', width: 1600, height: 900, permission });
  const c = { verdicts: { a: { role: 'subject', identity: 'exact', origin: 'official' }, b: { role: 'subject', identity: 'exact', origin: 'official' }, c: { role: 'subject', identity: 'exact', origin: 'official' }, d: { role: 'subject', identity: 'exact', origin: 'official' } }, selection: ['a', 'b', 'c', 'd'] };
  const out = D.settle([v('a', { status: 'restricted' }), v('b', { status: 'unclear' }), v('c', null), v('d', { status: 'free', licence: 'CC BY 4.0' })], c);
  assert.deepEqual(out.images.map(x => x.id), ['d']); assert.deepEqual(out.review.map(x => x.id).sort(), ['a', 'b', 'c']);
  assert.ok(out.review.every(r => r.permission.status !== 'free'));
  // a fan-made or watermarked picture is neither used nor offered, whatever its licence
  const f = D.settle([v('e', { status: 'free' }), v('g', { status: 'free' })], { verdicts: { e: { role: 'subject', identity: 'exact', origin: 'fan' }, g: { role: 'subject', identity: 'exact', origin: 'official', issues: ['watermark'] } }, selection: ['e', 'g'] });
  assert.equal(f.images.length + f.review.length, 0);
});

// ---------------------------------------------------------------- the identity itself
test('an encyclopedia search never turns the subject into something else: "Neegy" is not a rapper born Neegy Neegyson', async () => {
  const fetchImpl = async url => {
    const u = String(url);
    if (/page\/summary\/Neegy/.test(u)) return new Response(JSON.stringify({ type: 'https://mediawiki.org/wiki/HyperSwitch/errors/not_found' }), { status: 404 });
    if (/list=search/.test(u)) return new Response(JSON.stringify({ query: { search: [{ title: 'Franglish (rapper)', snippet: 'Born Neegy Neegyson (1994-08-02)' }, { title: 'Bermuda Electric Light Company', snippet: 'PureNEEGY Renewables' }] } }), { status: 200 });
    throw new Error(`unexpected ${u}`);
  };
  const r = await research({ query: 'Neegy', kind: 'fictional' }, { fetchImpl, textOnly: true });
  assert.equal(r.status, 'not_found', 'no article about a different subject'); assert.equal((r.facts || []).length, 0);
  // and the picture searches never borrow a mismatched article's words
  assert.ok(D.planSearches(NEEGY.understanding).every(p => !/rapper|franglish/i.test(p.q)));
  // a real match still resolves ("doughnuts" -> "Doughnut")
  const ok = async url => { const u = String(url); if (/page\/summary\/doughnuts/.test(u)) return new Response('{}', { status: 404 }); if (/list=search/.test(u)) return new Response(JSON.stringify({ query: { search: [{ title: 'Doughnut' }] } }), { status: 200 }); if (/page\/summary\/Doughnut/.test(u)) return new Response(JSON.stringify({ type: 'standard', title: 'Doughnut', extract: 'A doughnut is a type of fried dough confection.', description: 'fried dough' }), { status: 200 }); if (/prop=extracts/.test(u)) return new Response(JSON.stringify({ query: { pages: { 1: { extract: 'A doughnut is a type of fried dough confection. It is popular in many countries.' } } } }), { status: 200 }); throw new Error(u); };
  const d = await research({ query: 'doughnuts', kind: 'recognizable' }, { fetchImpl: ok, textOnly: true });
  assert.equal(d.status, 'ok'); assert.equal(d.page.title, 'Doughnut');
});

test('the owner sees what was found apart from what may be used: the studio message follows the discovery outcome', () => {
  const studio = require('fs').readFileSync(require('path').join(__dirname, '..', 'creative.js'), 'utf8');
  assert.match(studio, /but their reuse rights could not be verified automatically/);
  assert.match(studio, /web\.message && web\.status && web\.status !== 'nothing-found'/, 'fan-made, forms or logos only are said as such');
  assert.doesNotMatch(studio, /couldn\\'t find usable artwork/, 'the old catch-all is gone');
  const c = { searchQueries: 3, fanMade: 4, formsCosplayMerch: 5, logos: 2, related: 1, autoUsed: 0, reviewOnly: 0, uniqueResults: 20 };
  assert.match(D.messageFor('forms-only', 'X', c), /cosplay, figures or merchandise of X/);
  assert.match(D.messageFor('logos-only', 'X', c), /only logos/);
  assert.match(D.messageFor('nothing-found', 'X', c), /couldn't find pictures of X in 3 image searches/);
  assert.match(D.messageFor('found-rights-unverified', 'X', Object.assign({}, c, { reviewOnly: 0 })), /did not let the studio download them/);
});

// ---------------------------------------------------------------- Wikipedia = facts; pictures never from Wikimedia
test('without SERPAPI_API_KEY, Creative never falls back to Wikimedia pictures: Wikipedia gives facts only (the real server)', async () => {
  const fs = require('fs'); const os = require('os'); const path = require('path');
  const { startServer, client } = require('./helpers/server-process');
  // the stubbed Wikimedia hosts WOULD answer with a free (CC0) picture and its bytes: if any Commons picture path were
  // still alive, the picture would be there for it to take
  for (const ai of ['', 'mock-only']) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sr-no-commons-')); const calls = path.join(dir, 'calls.log');
    const s = await startServer({ SITEREMADE_BACKEND: 'local', SITEREMADE_DB_PATH: path.join(dir, 'app.db'), SITEREMADE_ASSET_STORE_DIR: path.join(dir, 'a'), SITEREMADE_PREMIUM_LOG_DIR: path.join(dir, 'p'), ANTHROPIC_API_KEY: ai, OPENAI_API_KEY: '', STRIPE_SECRET_KEY: '', SERPAPI_API_KEY: '', MOCK_WIKI: '1', MOCK_CALL_LOG: calls, NODE_ENV: 'test' });
    try {
      const call = client(s.port);
      await call('POST', '/api/auth/signup', { email: `no-commons-${ai || 'rules'}-${Date.now()}@example.com`, password: 'correct-horse-battery-staple' });
      const r = await call('POST', '/api/creative/research', { brief: 'toilet paper' });
      const label = ai ? 'with the (mock) AI' : 'without AI';
      assert.equal(r.body.ok, true, label); assert.equal(r.body.research.status, 'ok', label);
      assert.equal(r.body.research.page.title, 'Toilet paper'); assert.ok(r.body.research.facts.length >= 2, 'Wikipedia still gives the facts');
      assert.deepEqual(r.body.images, [], `${label}: no picture from Wikimedia`);
      assert.deepEqual(r.body.research.review || [], [], `${label}: nothing from Wikimedia offered for review either`);
      const dg = r.body.research.diagnostics || {};
      assert.ok(!('commons' in dg), `${label}: Commons is not part of the picture diagnostics`);
      assert.doesNotMatch(JSON.stringify(r.body.research), /commons|wikimedia\.org/i, `${label}: nothing about Commons anywhere in the research answer`);
      const asked = (fs.existsSync(calls) ? fs.readFileSync(calls, 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l)) : []).filter(c => c.provider === 'wikimedia');
      assert.ok(asked.length > 0 && asked.every(c => c.host === 'en.wikipedia.org'), `${label}: only Wikipedia was asked -- ${JSON.stringify(asked.map(c => c.host))}`);
      assert.ok(asked.every(c => c.what !== 'images'), `${label}: not even the article's file list is asked for`);
      if (ai) assert.ok(dg.web, 'with AI, the picture step is the web search (never Commons)');
    } finally { await s.stop(); }
  }
});

test('the research module itself can no longer fetch pictures: facts only, one host, whatever it is asked', async () => {
  const asked = [];
  const fetchImpl = async url => { asked.push(String(url)); const u = new URL(url);
    if (/page\/summary/.test(u.pathname)) return new Response(JSON.stringify({ type: 'standard', title: 'Toilet paper', extract: 'Toilet paper is a tissue paper product used for cleaning after using a toilet.' }), { status: 200 });
    if (u.searchParams.get('prop') === 'extracts') return new Response(JSON.stringify({ query: { pages: { 1: { extract: 'Toilet paper is a tissue paper product used for cleaning after using a toilet.' } } } }), { status: 200 });
    return new Response('{}', { status: 200 }); };
  // the old picture options (textOnly off, directed searches, a picture check) are ignored
  const r = await research({ query: 'toilet paper', kind: 'recognizable' }, { fetchImpl, textOnly: false, queries: ['toilet paper white background'], maxImages: 7, curate: async () => { throw new Error('never called'); } });
  assert.equal(r.status, 'ok'); assert.equal(r.images, undefined); assert.equal(r.curation, undefined); assert.equal(r.diagnostics, undefined);
  assert.ok(asked.every(u => new URL(u).hostname === 'en.wikipedia.org'), asked.join(' '));
  const R = require('../lib/creative/research');
  ['commonsInfo', 'REUSABLE', 'relevance'].forEach(k => assert.equal(R[k], undefined, `${k} is gone`));
  const W = require('../lib/creative/webimages');
  ['wikimediaFile', 'commonsPermission'].forEach(k => assert.equal(W[k], undefined, `${k} is gone`));
  // and a Google Images result hosted on Wikimedia is never a candidate
  const found = await W.discoverImages({ identity: { name: 'X' } }, {
    imageSearch: async () => ({ searches: 1, results: [{ title: 'X', pageUrl: 'https://commons.wikimedia.org/wiki/File:X.png', imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/x/xx/X.png', thumbUrl: 'https://t.example.org/1', width: 1600, height: 1200, source: 'Wikimedia Commons', query: 'X', position: 1 },
      { title: 'X', pageUrl: 'https://en.wikipedia.org/wiki/X', imageUrl: 'https://upload.wikimedia.org/wikipedia/en/x/xx/X.png', thumbUrl: 'https://t.example.org/2', width: 1600, height: 1200, source: 'Wikipedia', query: 'X', position: 2 }] }),
    fetchThumb: async () => { throw new Error('never looked at'); }, curate: async () => { throw new Error('never judged'); },
  });
  assert.equal(found.candidates.length, 0);
  const run = await D.runSearches(SSBU.understanding, { search: async () => ({ ok: true, status: 200, results: [{ title: 'Super Smash Bros. Ultimate', pageUrl: 'https://en.wikipedia.org/wiki/SSBU', imageUrl: 'https://upload.wikimedia.org/wikipedia/en/5/50/SSBU.jpg', width: 1600, height: 900, position: 1 }] }), budget: 1 });
  assert.equal(run.results.length, 0, 'not counted as a usable result either');
});
// ---------------------------------------------------------------- regressions found with real prompts (discovery quality)
const goodResults = (q, n, tag) => Array.from({ length: n }, (_, i) => ({ title: `Sydney Opera House ${tag} view ${i}`, pageUrl: `https://site${i % 7}.example/${tag}/${i}`, imageUrl: `https://img${i % 7}.example/${tag}-${i}-unique.jpg`, thumbUrl: `https://t.example/${tag}${i}.jpg`, width: 1600 + i, height: 1000, source: `site${i % 7}`, position: i + 1 }));
const PLACE = { identity: { name: 'Sydney Opera House', kind: 'recognizable', what: 'the performing arts venue and architectural landmark in Sydney' } };

test('real prompts: the kind of subject decides the searches -- a product beats the bare words "film" and "show"; a place gets wide and night views', () => {
  assert.equal(D.subjectType({ identity: { what: 'A modern instant film camera by Polaroid' }, visuals: { main: 'The camera itself, photographed to show its design' } }), 'product');
  assert.equal(D.subjectType({ identity: { what: 'an American TV show about doctors' } }), 'screen');
  assert.equal(D.subjectType({ identity: { what: 'the 1927 silent science-fiction film' } }), 'screen');
  assert.equal(D.subjectType(PLACE), 'place');
  const prod = D.planSearches({ identity: { name: 'Polaroid Now', what: 'an instant camera' } }).map(p => p.family);
  assert.deepEqual(prod.slice(0, 3), ['product', 'isolated', 'in-use']); assert.ok(prod.includes('angle'));
  const place = D.planSearches(PLACE).map(p => norm(p.q)); assert.ok(place.some(q => /wide angle panorama/.test(q)) && place.some(q => /at night/.test(q)));
  assert.ok(!D.planSearches(PLACE).some(p => /isolated on white|character render|official poster/.test(p.q)));
});

test('real prompts: at least two distinct search families run, even when the first alone returns plenty (one intent made every candidate alike)', async () => {
  const qs = []; const run = await D.runSearches(PLACE, { budget: 3, search: async q => { qs.push(q); return { ok: true, status: 200, results: goodResults(q, 40, `f${qs.length}`) }; } });
  assert.ok(qs.length >= 2, qs.join(' | ')); assert.notEqual(norm(qs[0]), norm(qs[1])); assert.equal(run.stop, 'enough good results');
  // more(): the next family not yet searched, once, within the budget
  const before = run.searches; const m = await run.more(); assert.ok(m && m.results.length && m.family); assert.equal(run.searches, before + 1);
  assert.equal(await run.more(), null, 'once per generation');
  const tight = await D.runSearches(PLACE, { budget: 2, search: async q => ({ ok: true, status: 200, results: goodResults(q, 40, `t${q.length}`) }) });
  tight.searches = 2 + D.LIMITS.extraFallback; assert.equal(await tight.more(), null, 'never past the budget and its one fallback');
});

test('real prompts: near-duplicates (one listing at several addresses, one file on another host) are skipped before the picture check', async () => {
  const dup = i => ({ title: 'Polaroid Now instant camera generation 3 white', pageUrl: `https://shop${i}.example/p/${i}`, imageUrl: `https://cdn${i}.example/polaroid-now-white-${i}.jpg`, thumbUrl: `https://t.example/d${i}.jpg`, width: 1000, height: 1000, source: 'x', position: i, query: 'q' });
  const same = i => ({ title: `Camera review ${i}`, pageUrl: `https://blog${i}.example/a`, imageUrl: `https://media${i}.example/uploads/polaroid-now-front-view.jpg`, thumbUrl: `https://t.example/s${i}.jpg`, width: 1200, height: 800, source: 'y', position: 10 + i, query: 'q' });
  const results = [dup(1), dup(2), dup(3), same(1), same(2), { title: 'Polaroid Now in a hand outdoors', pageUrl: 'https://z.example/a', imageUrl: 'https://z.example/hand.jpg', thumbUrl: 'https://t.example/z.jpg', width: 1500, height: 1000, source: 'z', position: 20, query: 'q' }];
  let judged = 0;
  const out = await discoverImages({ identity: { name: 'Polaroid Now' } }, { imageSearch: async () => ({ results, searches: 1 }), fetchThumb: async u => ({ ok: true, url: u, body: png(u.length), mime: 'image/png' }),
    curate: async ({ candidates }) => { judged += candidates.length; const verdicts = {}; candidates.forEach(c => { verdicts[c.id] = { role: 'subject', identity: 'exact', origin: 'unknown', depicts: 'it', quality: 3, issues: [] }; }); return { verdicts, selection: [], coverage: 'strong' }; },
    fetch: async u => ({ ok: true, url: u, body: Buffer.from('<html></html>') }), fetchImg: async u => ({ ok: true, url: u, body: png(u.length + 999), mime: 'image/png', width: 1500, height: 1000 }) });
  assert.equal(judged, 3, 'one of each picture is judged'); assert.equal(out.log.nearDuplicates, 3);
  const { nearKeys } = require('../lib/creative/webimages');
  assert.ok(nearKeys(dup(1)).some(k => nearKeys(dup(2)).includes(k)) && !nearKeys(dup(1)).some(k => nearKeys(same(1)).includes(k)));
});

test('real prompts: when fewer than three usable pictures of the subject survive the picture check, one more family is searched and its new pictures judged -- and never when enough did', async () => {
  const mk = (tag, n) => Array.from({ length: n }, (_, i) => ({ title: `Starlink ${tag} ${i}`, pageUrl: `https://${tag}${i}.example/p`, imageUrl: `https://${tag}${i}.example/${tag}-${i}-pic.jpg`, thumbUrl: `https://t.example/${tag}${i}.jpg`, width: 1600, height: 1000, source: tag, position: i + 1, query: tag }));
  const run = async (exactFirst) => {
    const calls = []; let moreCalls = 0;
    const out = await discoverImages({ identity: { name: 'Starlink' } }, { imageSearch: async () => ({ results: mk('a', 6), searches: 1 }), more: async () => { moreCalls++; return { family: 'context', results: mk('b', 5) }; },
      fetchThumb: async u => ({ ok: true, url: u, body: png(u.length), mime: 'image/png' }),
      curate: async ({ candidates }) => { calls.push(candidates.length); const verdicts = {}; candidates.forEach((c, i) => { const ok = /Starlink b/.test(c.title) || i < exactFirst; verdicts[c.id] = ok ? { role: 'subject', identity: 'exact', origin: 'unknown', depicts: 'it', quality: 3, issues: [] } : { role: 'reference', identity: 'related', depicts: 'a logo', quality: 1, issues: [] }; }); return { verdicts, selection: candidates.map(c => c.id).filter(id => verdicts[id].identity === 'exact'), coverage: 'partial' }; },
      fetch: async u => ({ ok: true, url: u, body: Buffer.from('<html></html>') }), fetchImg: async u => ({ ok: true, url: u, body: Buffer.concat([png(5000), Buffer.from(u)]), mime: 'image/png', width: 1600, height: 1000 }) });
    return { out, calls, moreCalls };
  };
  const thin = await run(1); assert.equal(thin.moreCalls, 1); assert.deepEqual(thin.calls, [6, 5], 'the new pictures get their own look');
  assert.ok(thin.out.candidates.filter(c => c.verdict && c.verdict.identity === 'exact').length >= 6); assert.equal(thin.out.log.more.family, 'context');
  const rich = await run(4); assert.equal(rich.moreCalls, 0, 'enough usable pictures: no extra search');
});

test('real prompts: the picture check judges EVERY candidate (it once judged 8 of 18), and a photograph of a real product is the subject, never a "form"', async () => {
  const ai = require('../lib/creative/ai'); let req = null;
  const cands = Array.from({ length: 12 }, (_, i) => ({ id: `w${i + 1}`, title: `Polaroid Now ${i}`, description: 'x', size: '800x800', thumb: { mime: 'image/png', bytes: png(i + 10) } }));
  await ai.curate({ identity: { name: 'Polaroid Now' }, visuals: {}, max: 8, candidates: cands }, { limits: ai.limits({}), call: async r => { req = r; return { input: { candidates: [], selection: [], coverage: 'none' }, usage: {}, model: 'test' }; } });
  assert.equal(req.tool.input_schema.properties.candidates.minItems, 12); assert.equal(req.tool.input_schema.properties.candidates.maxItems, 12);
  assert.match(req.system, /verdict for EVERY candidate/); assert.match(req.system, /at most 8 pictures/);
  assert.match(req.system, /a photograph of that product or place is "exact", never "form"/);
  assert.equal(ai.CURATE_TOOL.input_schema.properties.candidates.minItems, undefined, 'the shared tool is not changed');
});

test('real prompts: at the picture gate the owner is offered the main picture and up to two that add something different -- and still builds only with what they confirm', () => {
  const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'creative.js'), 'utf8');
  const body = src.slice(src.indexOf('  function preselect(review) {'), src.indexOf('  function showGate(g) {'));
  const preselect = new Function(`${body}; return preselect;`)();
  const r = (w, h, framing, site, extra) => Object.assign({ width: w, height: h, framing, site, adoptable: true }, extra || {});
  assert.deepEqual(preselect([r(1000, 1400, 'whole', 'a'), r(1000, 1400, 'whole', 'a'), r(1920, 1080, 'scene', 'b'), r(1000, 1000, 'tight', 'c')]), [0, 2, 3]);
  assert.deepEqual(preselect([r(800, 800, 'whole', 'a', { watermarked: 'shutterstock' }), r(800, 800, 'whole', 'b', { adoptable: false }), r(900, 900, 'whole', 'c')]), [2], 'never a watermarked or unfetchable picture');
  assert.deepEqual(preselect([r(800, 800, 'whole', 'a'), r(800, 800, 'whole', 'a'), r(800, 800, 'whole', 'b')]), [0, 2], 'the same kind of picture from the same source is not picked twice');
  assert.deepEqual(preselect([]), []);
  assert.match(src, /Build with ' \+ \(pickN === 1 \? 'this picture' : 'these ' \+ pickN \+ ' pictures'\)/, 'building stays the owner\'s explicit choice');
});
