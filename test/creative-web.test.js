'use strict';
// Creative web discovery: the hardened fetcher, image validation, permission evidence, and the discovery flow with
// injected network (no real requests in tests).
const test = require('node:test');
const assert = require('node:assert/strict');
const { checkUrl, blockedAddress, imageInfo, safeFetch } = require('../lib/creative/webfetch');
const { readPage, permissionFor, licenceOf, discover, wikimediaFile } = require('../lib/creative/webimages');
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
  assert.deepEqual(wikimediaFile('https://upload.wikimedia.org/wikipedia/en/a/ab/Some_game_cover.png'), { project: 'en', file: 'File:Some game cover.png' });
  assert.deepEqual(wikimediaFile('https://thumb.wikimedia.org/wikipedia/commons/thumb/2/29/Trifuerza.svg/1280px-Trifuerza.svg.png?x=1'), { project: 'commons', file: 'File:Trifuerza.svg' });
  // discovery: a Commons file takes its own record's licence and creator; a local Wikipedia file stays unclear
  const png = () => { const b = Buffer.alloc(40); b.write('\x89PNG\r\n\x1a\n', 0, 'latin1'); return b; };
  const pages = { [art]: wikiHtml('https://upload.wikimedia.org/wikipedia/commons/2/29/Tri_force.png'), 'https://en.wikipedia.org/wiki/Other': wikiHtml('https://upload.wikimedia.org/wikipedia/en/a/ab/Some_game_cover.png') };
  let asked = null;
  const out = await discover({ identity: { name: 'X' } }, {
    searchPages: async () => ({ pages: Object.keys(pages).map(url => ({ url })), searches: 1, usd: 0.01 }),
    fetch: async u => ({ ok: true, url: u, body: Buffer.from(pages[u]) }),
    fetchImg: async u => { const b = png(); b.write(u.slice(-12), 20); return { ok: true, url: u, body: b, mime: 'image/png', width: 900, height: 900 }; },
    commons: async titles => { asked = titles; return [{ title: 'File:Tri force.png', pageUrl: 'https://commons.wikimedia.org/wiki/File:Tri_force.png', license: 'Public domain', licenseUrl: '', author: '' }]; },
  });
  assert.deepEqual(asked, ['File:Tri force.png'], 'only the Commons file is looked up');
  const byFile = Object.fromEntries(out.candidates.map(c => [c.imageUrl.split('/').pop(), c]));
  assert.equal(byFile['Tri_force.png'].permission.status, 'free'); assert.match(byFile['Tri_force.png'].permission.evidence[0], /own Commons record/);
  assert.notEqual(byFile['Tri_force.png'].author, 'Contributors to Wikimedia projects');
  assert.equal(byFile['Some_game_cover.png'].permission.status, 'unclear'); assert.match(byFile['Some_game_cover.png'].permission.note, /non-free/);
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
