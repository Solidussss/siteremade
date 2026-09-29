'use strict';
// CREATIVE — a hardened fetcher for public web pages and images (server only).
//
// Web discovery reads pages the search step found and the images those pages declare. Any URL here came, in the end,
// from outside, so every request is treated as hostile input:
//   * https only, standard port only, no credentials in the URL, no cookies sent or kept
//   * the host name is resolved here and EVERY address is checked: loopback, private, link-local, carrier-grade NAT,
//     multicast, reserved and unique-local ranges (IPv4 and IPv6, including IPv4-mapped) are refused
//   * the connection is made to the address that was checked (no second lookup, so no DNS-rebinding window)
//   * redirects are followed by hand, at most 3, each one checked the same way
//   * time and size are capped while streaming; an image must have a real image signature and sane dimensions
// Nothing fetched is executed or followed further than these rules allow.

const https = require('https');
const dns = require('dns');
const net = require('net');

const UA = 'SiteRemade-Creative/1.0 (+https://www.siteremade.com; image discovery for owner-made pages)';

function ipv4Private(ip) {
  const p = ip.split('.').map(Number);
  if (p.length !== 4 || p.some(n => !(n >= 0 && n <= 255))) return true;
  const [a, b] = p;
  return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168) || (a === 192 && b === 0) || (a === 198 && (b === 18 || b === 19)) || a >= 224;
}
function blockedAddress(ip) {
  if (net.isIPv4(ip)) return ipv4Private(ip);
  if (!net.isIPv6(ip)) return true;
  const v = ip.toLowerCase();
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(v); if (mapped) return ipv4Private(mapped[1]);
  return v === '::' || v === '::1' || /^f[cd]/.test(v) || /^fe[89ab]/.test(v) || /^ff/.test(v) || /^64:ff9b:/.test(v) || /^2001:db8/.test(v) || /^::ffff:/.test(v);
}

// -> { ok, url } or { ok: false, reason }
function checkUrl(raw) {
  let u; try { u = new URL(String(raw)); } catch (e) { return { ok: false, reason: 'not a URL' }; }
  if (u.protocol !== 'https:') return { ok: false, reason: 'only https is fetched' };
  if (u.username || u.password) return { ok: false, reason: 'credentials in the URL' };
  if (u.port && u.port !== '443') return { ok: false, reason: 'non-standard port' };
  const host = u.hostname.replace(/^\[|\]$/g, '');
  if (!host || host === 'localhost' || /\.(local|internal|localhost|lan|home|corp)$/i.test(host)) return { ok: false, reason: 'not a public host' };
  if (net.isIP(host) && blockedAddress(host)) return { ok: false, reason: 'a private address' };
  return { ok: true, url: u };
}

function resolvePublic(host, lookup) {
  return new Promise(resolve => {
    if (net.isIP(host)) return resolve(blockedAddress(host) ? { ok: false, reason: 'a private address' } : { ok: true, address: host, family: net.isIP(host) });
    (lookup || dns.lookup)(host, { all: true }, (err, list) => {
      if (err || !list || !list.length) return resolve({ ok: false, reason: 'the host does not resolve' });
      if (list.some(x => blockedAddress(x.address))) return resolve({ ok: false, reason: 'the host resolves to a private address' });
      resolve({ ok: true, address: list[0].address, family: list[0].family });
    });
  });
}

// one request to an address that has already been checked
function requestOnce(u, address, family, o) {
  return new Promise(resolve => {
    const req = https.request({
      host: address, family, servername: u.hostname, port: 443, method: 'GET', path: u.pathname + u.search,
      headers: { host: u.host, 'user-agent': UA, accept: o.accept || '*/*', 'accept-encoding': 'identity' },
      // the certificate is checked against the real host name; the socket goes to the checked address
      lookup: (h, opts, cb) => cb(null, address, family),
      timeout: o.timeoutMs,
    }, res => {
      const status = res.statusCode || 0;
      if (status >= 300 && status < 400 && res.headers.location) { res.resume(); return resolve({ redirect: res.headers.location, status }); }
      if (status < 200 || status >= 300) { res.resume(); return resolve({ ok: false, status, reason: `HTTP ${status}` }); }
      const type = String(res.headers['content-type'] || '').toLowerCase();
      if (o.expect && !o.expect.test(type)) { res.resume(); return resolve({ ok: false, status, reason: `unexpected content type (${type.split(';')[0] || 'none'})` }); }
      const declared = Number(res.headers['content-length'] || 0); if (declared > o.maxBytes) { res.resume(); return resolve({ ok: false, status, reason: 'too large' }); }
      const chunks = []; let n = 0;
      res.on('data', c => { n += c.length; if (n > o.maxBytes) { req.destroy(); resolve({ ok: false, status, reason: 'too large' }); } else chunks.push(c); });
      res.on('end', () => resolve({ ok: true, status, type, body: Buffer.concat(chunks) }));
      res.on('error', () => resolve({ ok: false, status, reason: 'connection error' }));
    });
    req.on('timeout', () => { req.destroy(); resolve({ ok: false, reason: 'timed out' }); });
    req.on('error', e => resolve({ ok: false, reason: `connection failed (${String(e && e.code || e.message || e).slice(0, 40)})` }));
    req.end();
  });
}

// fetch(url, { expect: /regex on content-type/, maxBytes, timeoutMs, accept }) -> { ok, url, type, body } | { ok: false, reason }
async function safeFetch(raw, opts, deps) {
  const o = Object.assign({ maxBytes: 1.5 * 1024 * 1024, timeoutMs: 10000 }, opts || {}); const d = deps || {};
  let current = raw;
  for (let hop = 0; hop <= 3; hop++) {
    const c = checkUrl(current); if (!c.ok) return { ok: false, url: String(current), reason: c.reason };
    const r0 = await resolvePublic(c.url.hostname.replace(/^\[|\]$/g, ''), d.lookup); if (!r0.ok) return { ok: false, url: c.url.href, reason: r0.reason };
    const r = await (d.request || requestOnce)(c.url, r0.address, r0.family, o);
    if (r.redirect) { try { current = new URL(r.redirect, c.url).href; } catch (e) { return { ok: false, url: c.url.href, reason: 'a broken redirect' }; } continue; }
    return Object.assign({ url: c.url.href }, r);
  }
  return { ok: false, url: String(current), reason: 'too many redirects' };
}

// an image is what its bytes say it is -- never what its URL or header claims -> { mime, width, height } | null
function imageInfo(buf) {
  if (!buf || buf.length < 24) return null;
  if (buf[0] === 0x89 && buf.toString('ascii', 1, 4) === 'PNG') return { mime: 'image/png', width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') {
    const k = buf.toString('ascii', 12, 16);
    if (k === 'VP8X' && buf.length >= 30) return { mime: 'image/webp', width: 1 + buf.readUIntLE(24, 3), height: 1 + buf.readUIntLE(27, 3) };
    if (k === 'VP8 ' && buf.length >= 30) return { mime: 'image/webp', width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
    if (k === 'VP8L' && buf.length >= 25) { const b = buf.readUInt32LE(21); return { mime: 'image/webp', width: 1 + (b & 0x3fff), height: 1 + ((b >> 14) & 0x3fff) }; }
    return null;
  }
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i + 9 < buf.length) {
      if (buf[i] !== 0xff) { i++; continue; }
      const m = buf[i + 1]; const len = buf.readUInt16BE(i + 2);
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { mime: 'image/jpeg', height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
      i += 2 + len;
    }
    return null;
  }
  if (buf.toString('ascii', 0, 3) === 'GIF') return { mime: 'image/gif', width: buf.readUInt16LE(6), height: buf.readUInt16LE(8) };
  return null;
}

async function fetchImage(raw, opts, deps) {
  const r = await safeFetch(raw, Object.assign({ expect: /^image\//, maxBytes: 6 * 1024 * 1024, accept: 'image/avif,image/webp,image/png,image/jpeg,image/*;q=0.8' }, opts || {}), deps);
  if (!r.ok) return r;
  const info = imageInfo(r.body);
  if (!info) return { ok: false, url: r.url, reason: 'not a valid image' };
  if (!(info.width >= 1 && info.height >= 1) || info.width > 12000 || info.height > 12000) return { ok: false, url: r.url, reason: 'implausible image dimensions' };
  if (/image\/gif/.test(info.mime)) return { ok: false, url: r.url, reason: 'animated/GIF images are not used' };
  return Object.assign(r, info);
}

module.exports = { safeFetch, fetchImage, imageInfo, checkUrl, blockedAddress, UA };
