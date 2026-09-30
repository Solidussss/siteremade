'use strict';
// Creative web discovery: the hardened fetcher, image validation, permission evidence, and the discovery flow with
// injected network (no real requests in tests).
const test = require('node:test');
const assert = require('node:assert/strict');
const { checkUrl, blockedAddress, imageInfo, safeFetch } = require('../lib/creative/webfetch');
const { readPage, permissionFor, licenceOf, discover, excludedSource } = require('../lib/creative/webimages');
const ai = require('../lib/creative/ai');

test('fetcher: only public https hosts; private, loopback, link-local, mapped and odd addresses are refused', async () => {
  ['http://example.org/a', 'https://user:pw@example.org/', 'https://example.org:8443/', 'https://localhost/', 'https://printer.local/', 'https://127.0.0.1/', 'https://10.1.2.3/', 'https://[::1]/', 'https://169.254.169.254/latest/meta-data', 'ftp://example.org/', 'javascript:alert(1)']
    .forEach(u => assert.equal(checkUrl(u).ok, false, u));
  assert.equal(checkUrl('https://www.example.org/page?x=1').ok, true);
  ['127.0.0.1', '10.0.0.1', '172.16.5.4', '192.168.1.1', '169.254.1.1', '100.64.0.1', '0.0.0.0', '224.0.0.1', '::1', 'fe80::1', 'fd00::1', '::ffff:10.0.0.1', '::ffff:127.0.0.1']
    .forEach(ip => assert.equal(blockedAddress(ip), true, ip));
  ['93.184.216.34', '2606:2800:220:1:248:1893:25c8:1946'].forEach(ip => assert.equal(blockedAddress(ip), false, ip));
  // a public name that resolves to a private address is refused before any connection
  const r = await safeFetch('https://sneaky.example.org/', {}, { lookup: (h, o, cb) => cb(null, [{ address: '10.0.0.8', family: 4 }]), request: () => { throw new Error('must not connect'); } });
  assert.equal(r.ok, false); assert.match(r.reason, /private/);
  // a redirect into private space is refused; more than three redirects stop
  let hops = 0;
  const lookup = (h, o, cb) => cb(null, [{ address: h === 'inner.example.org' ? '192.168.0.2' : '93.184.216.34', family: 4 }]);
  const r2 = await safeFetch('https://a.example.org/', {}, { lookup, request: async () => ({ redirect: 'https://inner.example.org/secret' }) });
  assert.equal(r2.ok, false); assert.match(r2.reason, /private/);
  const r3 = await safeFetch('https://a.example.org/', {}, { lookup, request: async () => { hops++; return { redirect: `https://a.example.org/${hops}` }; } });
  assert.equal(r3.ok, false); assert.match(r3.reason, /too many redirects/); assert.equal(hops, 4);
});

test('images are what their bytes say: real signatures and dimensions, not headers or names', () => {
  const png = Buffer.alloc(33); png.write('\x89PNG\r\n\x1a\n', 0, 'latin1'); png.writeUInt32BE(13, 8); png.write('IHDR', 12); png.writeUInt32BE(800, 16); png.writeUInt32BE(600, 20);
  assert.deepEqual(imageInfo(png), { mime: 'image/png', width: 800, height: 600 });
  const jpg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x02, 0x58, 0x03, 0x20, 0x03, 0x01, 0x22, 0x00, 0x02, 0x11, 0x01]);
  assert.deepEqual(imageInfo(jpg), { mime: 'image/jpeg', width: 800, height: 600 });
  assert.equal(imageInfo(Buffer.from('<html><body>not an image</body></html>')), null);
});

test('permission comes from what the page states, with its evidence -- never from "official", a wiki or a PNG', () => {
  assert.deepEqual(licenceOf('https://creativecommons.org/licenses/by-sa/4.0/'), { name: 'CC BY-SA 4.0', free: true, attribution: true });
  assert.equal(licenceOf('https://creativecommons.org/licenses/by-nc/2.0/').free, false);
  assert.equal(licenceOf('https://creativecommons.org/publicdomain/zero/1.0/').name, 'CC0');
  const base = 'https://photos.example.org/p/1';
  const flickrish = readPage('<meta property="og:type" content="photo"><meta property="og:image" content="https://img.example.org/1.jpg"><meta name="author" content="A. Photographer"><a rel="license" href="https://creativecommons.org/licenses/by/2.0/">CC BY</a>', base);
  const p1 = permissionFor(flickrish, 'https://img.example.org/1.jpg', base);
  assert.equal(p1.status, 'free'); assert.equal(p1.licence, 'CC BY 2.0'); assert.equal(p1.author, 'A. Photographer'); assert.match(p1.evidence[0], /rel=license/);
  // the same licence, but no creator to credit: not free to use
  assert.equal(permissionFor(readPage('<meta property="og:image" content="https://img.example.org/1.jpg"><link rel="license" href="https://creativecommons.org/licenses/by/4.0/">', base), 'https://img.example.org/1.jpg', base).status, 'unclear');
  // an official page with its key art: no licence stated -> unclear, however official
  const official = readPage('<meta property="og:site_name" content="The Official Site"><meta property="og:image" content="https://cdn.example.org/art.png">', base);
  assert.equal(permissionFor(official, 'https://cdn.example.org/art.png', base).status, 'unclear');
  // all rights reserved, or a NonCommercial licence -> restricted
  assert.equal(permissionFor(readPage('<meta property="og:image" content="https://img.example.org/2.jpg"><footer>© 2024 Studio. All rights reserved.</footer>', base), 'https://img.example.org/2.jpg', base).status, 'restricted');
  assert.equal(permissionFor(readPage('<meta property="og:image" content="https://img.example.org/3.jpg"><a rel="license" href="https://creativecommons.org/licenses/by-nc/2.0/">x</a>', base), 'https://img.example.org/3.jpg', base).status, 'restricted');
  // on a photo page, the licence covers its main picture -- not a secondary picture on the page
  const withImg = readPage('<meta property="og:type" content="photo"><meta property="og:image" content="https://img.example.org/main.jpg"><meta name="author" content="B"><a rel="license" href="https://creativecommons.org/publicdomain/zero/1.0/">CC0</a><img src="https://img.example.org/other.jpg" width="900" height="600">', base);
  assert.equal(permissionFor(withImg, 'https://img.example.org/main.jpg', base).status, 'free');
  assert.equal(permissionFor(withImg, 'https://img.example.org/other.jpg', base).status, 'unclear');
});

test('a licence counts only when it is stated for the picture: an article\'s text licence does not cover its images', async () => {
  const art = 'https://en.wikipedia.org/wiki/Some_game';
  const wikiHtml = img => `<meta name="generator" content="MediaWiki 1.45"><meta property="og:title" content="Some game - Wikipedia"><meta property="og:image" content="${img}"><link rel="license" href="https://creativecommons.org/licenses/by-sa/4.0/"><meta name="author" content="Contributors to Wikimedia projects">`;
  // the text licence of an article: not the picture's
  const page = readPage(wikiHtml('https://img.example.org/cover.png'), art);
  const p = permissionFor(page, 'https://img.example.org/cover.png', art);
  assert.equal(p.status, 'unclear'); assert.match(p.evidence[0], /for the page/); assert.match(p.note, /text/);
  // a photo page (og:type photo) that states a licence for its main picture: free
  const photo = readPage('<meta property="og:type" content="flickr_photos:photo"><meta property="og:image" content="https://live.example.org/1.jpg"><meta name="author" content="D"><a rel="license" href="https://creativecommons.org/licenses/by/2.0/">x</a>', 'https://photos.example.org/p/1');
  assert.equal(permissionFor(photo, 'https://live.example.org/1.jpg', 'https://photos.example.org/p/1').status, 'free');
  // structured data describing the image itself
  const ld = readPage('<script type="application/ld+json">{"@type":"ImageObject","contentUrl":"https://img.example.org/x.jpg","license":"https://creativecommons.org/publicdomain/zero/1.0/"}</script>', 'https://museum.example.org/obj/1');
  assert.equal(permissionFor(ld, 'https://img.example.org/x.jpg', 'https://museum.example.org/obj/1').status, 'free');
  // Wikimedia is not a Creative picture source: an article page, a Commons file page and a file hosted on
  // upload.wikimedia.org are never read, fetched or offered -- and nothing asks Commons for a picture's licence
  ['https://en.wikipedia.org/wiki/X', 'https://commons.wikimedia.org/wiki/File:X.png', 'https://upload.wikimedia.org/wikipedia/commons/2/29/X.png', 'https://www.wikidata.org/wiki/Q1'].forEach(u => assert.ok(excludedSource(u), u));
  ['https://www.nintendo.com/x', 'https://ssb.wiki.gg/x', 'https://zelda.fandom.com/wiki/Link'].forEach(u => assert.ok(!excludedSource(u), u));
  const png = () => { const b = Buffer.alloc(40); b.write('\x89PNG\r\n\x1a\n', 0, 'latin1'); return b; };
  const pages = { [art]: wikiHtml('https://upload.wikimedia.org/wikipedia/commons/2/29/Tri_force.png'), 'https://official.example.org/game': '<meta property="og:image" content="https://upload.wikimedia.org/wikipedia/en/a/ab/Some_game_cover.png"><meta property="og:image" content="https://official.example.org/key-art.png">' };
  const read = [], fetched = [];
  const out = await discover({ identity: { name: 'X' } }, {
    searchPages: async () => ({ pages: Object.keys(pages).map(url => ({ url })), searches: 1, usd: 0.01 }),
    fetch: async u => { read.push(u); return { ok: true, url: u, body: Buffer.from(pages[u]) }; },
    fetchImg: async u => { fetched.push(u); const b = png(); b.write(u.slice(-12), 20); return { ok: true, url: u, body: b, mime: 'image/png', width: 900, height: 900 }; },
  });
  assert.deepEqual(read, ['https://official.example.org/game'], 'the Wikipedia article is never read');
  assert.deepEqual(fetched, ['https://official.example.org/key-art.png'], 'no Wikimedia-hosted picture is downloaded');
  assert.deepEqual(out.candidates.map(c => c.imageUrl), ['https://official.example.org/key-art.png']);
  assert.equal(out.candidates[0].permission.status, 'unclear', 'judged from its own page only');
  assert.equal(out.log.commonsLookups, undefined);
});

test('discovery: bounded, deduplicated, and only images with a stated free licence count as usable', async () => {
  const jpg = n => { const b = Buffer.alloc(200); Buffer.from([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x02, 0x58, 0x03, 0x20]).copy(b); b.writeUInt32BE(n, 100); return b; };
  const pages = {
    'https://a.example.org/free': '<meta property="og:type" content="photo"><meta property="og:image" content="https://img.example.org/a.jpg"><meta name="author" content="C"><a rel="license" href="https://creativecommons.org/licenses/by/4.0/">x</a>',
    'https://b.example.org/official': '<meta property="og:image" content="https://img.example.org/b.jpg">',
    'https://c.example.org/dup': '<meta property="og:image" content="https://img.example.org/a.jpg">',
  };
  const out = await discover({ identity: { name: 'X' } }, {
    searchPages: async () => ({ pages: Object.keys(pages).map(url => ({ url })).concat([{ url: 'http://insecure.example.org/' }]), searches: 2, usd: 0.03 }),
    fetch: async u => (pages[u] ? { ok: true, url: u, body: Buffer.from(pages[u]) } : { ok: false, reason: 'HTTP 404' }),
    fetchImg: async u => { const b = jpg(0); Buffer.from(u).copy(b, 120); return { ok: true, url: u, body: b, mime: 'image/jpeg', width: 800, height: 600 }; },
  });
  assert.equal(out.log.searches, 2); assert.equal(out.candidates.length, 2, 'the repeated picture is fetched once; the http page is never fetched');
  assert.deepEqual(out.candidates.map(c => c.permission.status), ['free', 'unclear']);
});

test('search step: the model may only submit pages the search itself returned; cost counts searches and tokens', async () => {
  const raw = async () => ({ model: 'claude-haiku-4-5', stop_reason: 'tool_use', usage: { input_tokens: 10000, output_tokens: 300, server_tool_use: { web_search_requests: 2 } }, content: [
    { type: 'web_search_tool_result', content: [{ type: 'web_search_result', url: 'https://a.example.org/1', title: 'A' }, { type: 'web_search_result', url: 'https://b.example.org/2', title: 'B' }] },
    { type: 'tool_use', name: 'submit_image_pages', input: { pages: [{ url: 'https://b.example.org/2', shows: 'the subject' }, { url: 'https://invented.example.org/x' }] } }] });
  const r = await ai.webSearchPages({ identity: { name: 'X' } }, { limits: ai.limits({}), raw });
  assert.deepEqual(r.pages.map(p => p.url), ['https://b.example.org/2'], 'an invented URL is dropped');
  assert.equal(r.searches, 2); assert.equal(r.usd, +(10000 * 1 / 1e6 + 300 * 5 / 1e6 + 0.02).toFixed(5));
  // a search-tool error is reported, not hidden
  const e = await ai.webSearchPages({ identity: { name: 'X' } }, { limits: ai.limits({}), raw: async () => ({ usage: {}, content: [{ type: 'web_search_tool_result', content: { type: 'web_search_tool_result_error', error_code: 'unavailable' } }] }) });
  assert.equal(e.error, 'unavailable'); assert.deepEqual(e.pages, []);
});

test('a real-world form (cosplay, figure, merchandise) is never selected as a picture of the subject', async () => {
  const thumb = { mime: 'image/png', bytes: Buffer.from('x') };
  const call = async () => ({ model: 'm', usage: {}, input: { candidates: [{ id: 'c1', role: 'subject', identity: 'form', depicts: 'a cosplayer dressed as the character' }, { id: 'c2', role: 'subject', identity: 'exact', depicts: 'official artwork of the character' }, { id: 'c3', role: 'environment', identity: 'related', depicts: 'a forest' }], selection: ['c1', 'c2', 'c3'], coverage: 'strong' } });
  const c = await ai.curate({ identity: { name: 'X' }, candidates: ['c1', 'c2', 'c3'].map(id => ({ id, thumb })) }, { limits: ai.limits({}), call });
  assert.deepEqual(c.selection, ['c2', 'c3']);
});

test('where the pictures stopped is judged from the evidence, stage by stage', () => {
  const { pictureStage } = require('../lib/creative/research');
  const v = (identity, role) => ({ identity, role: role || 'subject' });
  const W = (identity, status, outcome) => ({ src: 'web', verdict: v(identity), permission: { status }, outcome });
  assert.equal(pictureStage({ candidates: [W('exact', 'free', 'used')] }).stage, 'none');
  const p = pictureStage({ candidates: [W('form', 'unclear', 'a real-world form'), W('exact', 'unclear', 'offered'), W('exact', 'restricted', 'offered')] });
  assert.equal(p.stage, 'permission'); assert.match(p.note, /1 unclear, 1 restricted/);
  assert.equal(pictureStage({ candidates: [W('form', 'unclear', 'a form'), W('other', 'unclear', 'not the subject')] }).stage, 'identity');
  assert.equal(pictureStage({ candidates: [], searchError: 'unavailable' }).stage, 'provider');
  assert.equal(pictureStage({ candidates: [W('other', 'unclear', 'not the subject')] }).stage, 'discovery');
  assert.equal(pictureStage({ candidates: [W('exact', 'free', 'not selected')] }).stage, 'selection');
  assert.equal(pictureStage(null).stage, 'discovery', 'no search at all is nothing looked at -- never another source');
});

test('SerpApi adapter: the documented request; the key never appears in an error; empty results are a search, not a failure', async () => {
  const serp = require('../lib/creative/serpapi');
  const KEY = 'sk-test-secret-123';
  let asked = null;
  const ok = await serp.googleImages('Kirby official artwork', { key: KEY, licenses: 'cl', fetchImpl: async u => { asked = new URL(u); return new Response(JSON.stringify({ images_results: [
    { position: 1, title: 'Kirby', link: 'https://example.org/kirby', original: 'https://img.example.org/kirby.png', original_width: 1200, original_height: 1100, thumbnail: 'https://encrypted-tbn0.gstatic.com/x', source: 'Example', is_product: false },
    { position: 2, title: 'Kirby plush', link: 'https://shop.example.org/p', original: 'https://img.example.org/plush.jpg', original_width: 800, original_height: 800, source: 'Shop', is_product: true },
    { position: 3, title: 'no page', link: 'http://insecure.example.org/', original: 'https://img.example.org/x.jpg' }] }), { status: 200 }); } });
  assert.equal(asked.origin + asked.pathname, 'https://serpapi.com/search');
  assert.equal(asked.searchParams.get('engine'), 'google_images'); assert.equal(asked.searchParams.get('licenses'), 'cl'); assert.equal(asked.searchParams.get('q'), 'Kirby official artwork');
  assert.equal(ok.ok, true); assert.deepEqual(ok.results.map(r => [r.imageUrl, r.isProduct]), [['https://img.example.org/kirby.png', false], ['https://img.example.org/plush.jpg', true]], 'a non-https page is dropped; shopping flagged');
  const refused = await serp.googleImages('q', { key: KEY, fetchImpl: async () => new Response(JSON.stringify({ error: `Invalid API key ${KEY}.` }), { status: 401 }) });
  assert.equal(refused.ok, false); assert.equal(refused.status, 401); assert.match(refused.error, /refused \(401\)/); assert.ok(!refused.error.includes(KEY));
  const crashed = await serp.googleImages('q', { key: KEY, fetchImpl: async u => { throw new Error(`connect failed ${u}`); } });
  assert.ok(!crashed.error.includes(KEY)); assert.match(crashed.error, /api_key=\[key\]/);
  const empty = await serp.googleImages('q', { key: KEY, fetchImpl: async () => new Response(JSON.stringify({ error: "Google hasn't returned any results for this query." }), { status: 200 }) });
  assert.deepEqual([empty.ok, empty.results.length, empty.error], [true, 0, '']);
  assert.match((await serp.googleImages('q', { key: '' })).error, /not configured/);
  const qs = serp.searchQueries({ identity: { name: 'BMO', kind: 'fictional' }, research: { wikipediaTitles: [] }, pageTitle: 'Adventure Time' });
  assert.match(serp.searchQueries({ identity: { name: 'Toilet paper', kind: 'recognizable' } }, 1)[0].q, /^Toilet paper high resolution photo/, 'a real-world subject is searched as a photograph');
  assert.equal(qs.length, 3); assert.ok(qs.every(q => q.q.startsWith('BMO Adventure Time ') && /-cosplay/.test(q.q) && /-site:deviantart.com/.test(q.q) && !q.licenses));
  assert.match(qs[0].q, /official render/); assert.match(qs[2].q, /screenshot OR still/);
  assert.match(serp.searchQueries({ identity: { name: 'Link', kind: 'fictional' }, research: { wikipediaTitles: ['Link (The Legend of Zelda)'] } })[0].q, /^Link The Legend of Zelda official render/);
});

test('image discovery: pictures are judged from their thumbnails first; only suitable official ones are read and downloaded; licence stays separate', async () => {
  const { discoverImages, samePicture } = require('../lib/creative/webimages');
  assert.equal(samePicture('https://live.example.org/123/4567_abc_b.jpg', 'https://live.example.org/123/4567_abc_h.jpg'), true);
  assert.equal(samePicture('https://a.example.org/one.jpg', 'https://a.example.org/two.jpg'), false);
  const png = n => { const b = Buffer.alloc(40); b.write('\x89PNG\r\n\x1a\n', 0, 'latin1'); b.writeUInt32BE(n, 30); return b; };
  const R = (n, extra) => Object.assign({ title: `r${n}`, pageUrl: `https://p${n}.example.org/page`, imageUrl: `https://i${n}.example.org/pic${n}.png`, thumbUrl: `https://thumbs.example.org/t${n}`, width: 1200, height: 1200, source: `Site ${n}`, query: 'X official render', position: n }, extra);
  const results = [R(1, { pageUrl: 'https://photos.example.org/p/1', imageUrl: 'https://live.example.org/123/4567_abc_h.jpg' }), R(2), R(3), R(4, { isProduct: true }), R(5, { pageUrl: 'https://blocked.example.org/x' }), R(6)];
  const verdicts = { w1: { role: 'subject', identity: 'exact', origin: 'official', depicts: 'official render', quality: 3 }, w2: { role: 'subject', identity: 'exact', origin: 'fan', depicts: 'fan drawing', quality: 3 }, w3: { role: 'subject', identity: 'form', origin: 'unknown', depicts: 'a cosplayer' }, w4: { role: 'subject', identity: 'exact', origin: 'unknown', depicts: 'the character', quality: 2 }, w5: { role: 'reference', identity: 'related', origin: 'official', depicts: 'a game menu' } };
  const pages = { 'https://photos.example.org/p/1': '<meta property="og:type" content="photo"><meta property="og:image" content="https://live.example.org/123/4567_abc_b.jpg"><meta name="author" content="A. Artist"><a rel="license" href="https://creativecommons.org/licenses/by/2.0/">CC BY</a>' };
  const fetched = [], thumbs = [], read = []; let judged = null;
  const out = await discoverImages({ identity: { name: 'X' } }, {
    imageSearch: async () => ({ searches: 3, results }),
    fetchThumb: async u => { thumbs.push(u); return { ok: true, url: u, body: png(thumbs.length), mime: 'image/png', width: 200, height: 200 }; },
    curate: async ({ candidates }) => { judged = candidates.map(c => c.id); return { verdicts, selection: ['w1'], coverage: 'partial', missing: [] }; },
    fetch: async u => { read.push(u); return pages[u] ? { ok: true, url: u, body: Buffer.from(pages[u]) } : { ok: false, reason: 'HTTP 403' }; },
    fetchImg: async u => { fetched.push(u); return /blocked|i5\./.test(u) ? { ok: false, reason: 'HTTP 403' } : { ok: true, url: u, body: png(100 + fetched.length), mime: 'image/png', width: 1200, height: 1200 }; },
  });
  assert.equal(out.log.products, 1); assert.ok(!thumbs.includes('https://thumbs.example.org/t4'), 'a shopping result is not even looked at');
  assert.deepEqual(judged, ['w1', 'w2', 'w3', 'w4', 'w5'], 'every other result is judged from its thumbnail');
  assert.deepEqual(fetched.sort(), ['https://i5.example.org/pic5.png', 'https://live.example.org/123/4567_abc_h.jpg'].sort(), 'only the suitable pictures (official or unknown origin, the character itself) are downloaded -- not the fan drawing, the cosplay or the menu');
  const by = Object.fromEntries(out.candidates.map(c => [c.id, c]));
  assert.equal(by.w1.permission.status, 'free'); assert.equal(by.w1.author, 'A. Artist');
  assert.equal(by.w4.permission.status, 'unclear'); assert.equal(by.w4.technical.fetched, false); assert.match(by.w4.permission.evidence[0], /could not be read/);
  assert.equal(by.w2.permission, null, 'a fan drawing is neither read nor marked'); assert.equal(by.w2.verdict.origin, 'fan');
  assert.ok(out.candidates.every(c => c.query === 'X official render'), 'the search that found each picture is kept');
});

test('the picture check never selects a fan-made depiction of the character', async () => {
  const thumb = { mime: 'image/png', bytes: Buffer.from('x') };
  const call = async () => ({ model: 'm', usage: {}, input: { candidates: [{ id: 'c1', role: 'subject', identity: 'exact', origin: 'fan', depicts: 'fan drawing' }, { id: 'c2', role: 'subject', identity: 'exact', origin: 'official', depicts: 'official render' }], selection: ['c1', 'c2'], coverage: 'strong' } });
  const c = await ai.curate({ identity: { name: 'X' }, candidates: ['c1', 'c2'].map(id => ({ id, thumb })) }, { limits: ai.limits({}), call });
  assert.deepEqual(c.selection, ['c2']); assert.equal(c.verdicts.c1.origin, 'fan');
});

test('stage verdict: fan-made pictures do not count as the character', () => {
  const { pictureStage } = require('../lib/creative/research');
  const v = pictureStage({ candidates: [{ src: 'web', verdict: { role: 'subject', identity: 'exact', origin: 'fan' }, outcome: 'fan-made, not official artwork' }] });
  assert.equal(v.stage, 'identity'); assert.match(v.note, /fan-made pictures \(1\)/);
});

test('a portfolio or art-community picture of a franchise character counts as fan-made, whatever the check guessed', async () => {
  const { discoverImages, PERSONAL_WORK } = require('../lib/creative/webimages');
  ['cagataycetin.artstation.com', 'www.behance.net', 'sketchfab.com', 'www.deviantart.com'].forEach(h => assert.ok(PERSONAL_WORK.test(h), h));
  ['www.pokemon.com', 'screenrant.com', 'commons.wikimedia.org'].forEach(h => assert.ok(!PERSONAL_WORK.test(h), h));
  const png = n => { const b = Buffer.alloc(40); b.write('\x89PNG\r\n\x1a\n', 0, 'latin1'); b.writeUInt32BE(n, 30); return b; };
  const fetched = [];
  const out = await discoverImages({ identity: { name: 'X' } }, {
    imageSearch: async () => ({ searches: 1, results: [{ title: 'X render', pageUrl: 'https://someone.artstation.com/projects/1', imageUrl: 'https://cdn.example.org/x.png', thumbUrl: 'https://t.example.org/1', width: 1800, height: 1800, source: 'ArtStation', query: 'q', position: 1 }] }),
    fetchThumb: async u => ({ ok: true, url: u, body: png(1), mime: 'image/png', width: 200, height: 200 }),
    curate: async () => ({ verdicts: { w1: { role: 'subject', identity: 'exact', origin: 'official', depicts: 'X', quality: 3 } }, selection: ['w1'], coverage: 'strong', missing: [] }),
    fetch: async () => ({ ok: false, reason: 'unused' }), fetchImg: async u => { fetched.push(u); return { ok: false, reason: 'unused' }; },
  });
  assert.equal(out.candidates[0].verdict.origin, 'fan'); assert.match(out.candidates[0].verdict.originBy, /personal work/); assert.deepEqual(fetched, [], 'a fan work is not downloaded');
});

test('the search follows how the subject is seen: artwork for any drawn or game character (even a "recognizable" one), photos for real things, never stock previews', async () => {
  const serp = require('../lib/creative/serpapi');
  assert.match(serp.searchQueries({ identity: { name: 'Kirby', kind: 'recognizable' }, visuals: { depiction: 'artwork' } }, 1)[0].q, /^Kirby official render/);
  assert.match(serp.searchQueries({ identity: { name: 'Silver Surfer', kind: 'recognizable', what: 'a Marvel Comics superhero' } }, 1)[0].q, /^Silver Surfer official render/, 'keyword fallback when the understanding did not say');
  const photo = serp.searchQueries({ identity: { name: 'Toilet paper', kind: 'recognizable' }, visuals: { depiction: 'photo' } }, 1)[0].q;
  assert.match(photo, /^Toilet paper high resolution photo/); assert.match(photo, /-site:shutterstock\.com/); assert.match(photo, /-site:dreamstime\.com/);
  const { discoverImages, STOCK } = require('../lib/creative/webimages');
  assert.ok(STOCK.test('www.dreamstime.com') && STOCK.test('stock.adobe.com') && STOCK.test('pngtree.com') && STOCK.test('www.magnific.com') && !STOCK.test('www.nintendo.com') && !STOCK.test('pngimg.com'));
  const png = n => { const b = Buffer.alloc(40); b.write('\x89PNG\r\n\x1a\n', 0, 'latin1'); b.writeUInt32BE(n, 30); return b; };
  const fetched = [];
  await discoverImages({ identity: { name: 'X' } }, {
    imageSearch: async () => ({ searches: 1, results: [{ title: 'X', pageUrl: 'https://www.dreamstime.com/x', imageUrl: 'https://thumbs.dreamstime.com/x.jpg', thumbUrl: 'https://t.example.org/1', width: 900, height: 900, source: 'Dreamstime', query: 'q', position: 1 }] }),
    fetchThumb: async u => ({ ok: true, url: u, body: png(1), mime: 'image/png', width: 200, height: 200 }),
    curate: async () => ({ verdicts: { w1: { role: 'subject', identity: 'exact', origin: 'unknown', depicts: 'X', quality: 3, issues: [] } }, selection: ['w1'], coverage: 'strong', missing: [] }),
    fetch: async () => ({ ok: false, reason: 'unused' }), fetchImg: async u => { fetched.push(u); return { ok: false, reason: 'unused' }; },
  });
  assert.deepEqual(fetched, [], 'a stock-photo preview is treated as watermarked and never downloaded');
});
