'use strict';
// REQUESTS FROM A LIVE DESIGN SITE (lib/site-requests.js, POST /s/:id/request): a visitor's booking or order reaches the
// business -- kept for the owner's inbox (never another account's), emailed when email is set up (it isn't here: no
// Resend key, so nothing leaves the machine and the inbox says the email wasn't sent). Scripted writer, no AI.
process.env.SITEREMADE_DB_PATH = ':memory:';
delete process.env.RESEND_API_KEY;
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { app, setDesignDeps } = require('../server.js');
const sr = require('../lib/site-requests');

const meridian = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'design-sites', 'meridian-38.json'), 'utf8'));
const BRIEF = { businessName: 'Meridian 38', brand: 'Meridian', watch: 'Hand-wound, 42-hour reserve.', options: 'Cases $1,850.', reserve: '$300 deposit.' };
const writer = () => ({ name: 'scripted', usage: { calls: 0, input: 1, output: 1, cacheWrite: 0, cacheRead: 0 }, start() {}, feedback() {}, async next() { return JSON.stringify(meridian); } });
const GOOD = { kind: 'booking', summary: 'Gel manicure, Tue 14 Oct 10:30 with Amy', fields: [['Treatments', 'Gel manicure'], ['When', 'Tue 14 Oct 10:30']], contact: { name: 'Jo Bloggs', phone: '07700 900123' } };

test('what a page sends is cleaned, and a request without a name or a way to reply is refused', () => {
  assert.deepEqual(sr.clean(GOOD).request, { kind: 'booking', summary: GOOD.summary, fields: GOOD.fields, contact: { name: 'Jo Bloggs', phone: '07700 900123', email: '' } });
  assert.match(sr.clean({ ...GOOD, contact: { name: 'Jo' } }).error, /phone number or an email/);
  assert.match(sr.clean({ ...GOOD, contact: { phone: '0770090012' } }).error, /name/);
  assert.match(sr.clean({ ...GOOD, contact: { name: 'Jo', email: 'not-an-email' } }).error, /email/);
  assert.match(sr.clean({ ...GOOD, kind: 'payment' }).error, /Unknown kind/);
  assert.match(sr.clean({ ...GOOD, fields: Array(31).fill(['a', 'b']) }).error, /Too many/);
  assert.equal(sr.clean({ ...GOOD, website: 'http://spam.example' }).spam, true);
  const m = sr.ownerEmail({ businessName: 'Lacquer <Room>', request: sr.clean({ ...GOOD, contact: { name: '<b>Jo</b>', email: 'jo@example.com' } }).request, inboxUrl: 'https://x/designs' });
  assert.doesNotMatch(m.html, /<b>Jo<\/b>/, 'what a visitor typed is escaped');
  assert.match(m.subject, /^Booking request from <b>Jo<\/b> · Lacquer <Room>$/);
  assert.equal(m.replyTo, 'jo@example.com');
  assert.match(m.text, /Nothing is confirmed until you reply/);
});

test('a live site sends its requests to the owner, who sees them in the inbox; a preview has no sender', async () => {
  const srv = app.listen(0, '127.0.0.1'); await new Promise((r) => srv.on('listening', r));
  const base = `http://127.0.0.1:${srv.address().port}`; let cookie = '';
  const call = async (m, p, body, extra = {}) => { const r = await fetch(base + p, { method: m, headers: Object.assign({ 'content-type': 'application/json', origin: base, cookie }, extra), body: body ? JSON.stringify(body) : undefined }); const sc = r.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0]; const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch (e) { /* html */ } return { status: r.status, json: j, text: t, headers: r.headers }; };
  const settled = async (id) => { for (let i = 0; i < 200; i++) { const s = (await call('GET', `/api/designs/sites/${id}`)).json.site; if (s.status !== 'writing') return s; await new Promise((r) => setTimeout(r, 25)); } throw new Error('timed out'); };
  try {
    assert.equal((await call('POST', '/api/auth/signup', { email: 'owner@example.com', password: 'correct-horse-battery-staple' })).status, 200);
    setDesignDeps({ writer });
    const id = (await call('POST', '/api/designs/sites', { design: 'aldane', brief: BRIEF })).json.site.id;
    assert.equal((await settled(id)).status, 'built');
    // not live yet: nothing is taken, and the visitor is told so
    const early = await call('POST', `/s/${id}/request`, GOOD, { cookie: '' });
    assert.equal(early.status, 404, early.text.slice(0, 300)); assert.match(early.json.message, /isn’t live/);
    const preview = (await call('GET', `/api/designs/sites/${id}/preview`)).text;
    assert.match(preview, /window\.SiteRemade=\{live:false,tag:"Preview · not sent",note:"Preview: nothing was sent/, 'the preview never sends, and says so');
    assert.doesNotMatch(preview, /\/request"/);
    assert.match((await call('GET', '/designs/demo/lacquer')).text, /window\.SiteRemade=\{live:false/, 'nor does a design demo');
    const pub = await call('POST', `/api/designs/sites/${id}/publish`, { on: true, confirm: true });
    assert.equal(pub.status, 200, pub.text.slice(0, 300));
    const page = (await call('GET', `/s/${id}`)).text;
    assert.match(page, new RegExp(`window\\.SiteRemade=\\{live:true.*fetch\\("/s/${id}/request"`));
    assert.match((await call('GET', `/api/designs/sites/${id}/download`)).text, new RegExp(`fetch\\("http://127\\.0\\.0\\.1:\\d+/s/${id}/request"`), 'a downloaded copy posts back here');
    // a copy hosted elsewhere may post (CORS); a bad request is refused with the reason; a bot's is dropped quietly
    const pre = await fetch(`${base}/s/${id}/request`, { method: 'OPTIONS', headers: { origin: 'https://example.org', 'access-control-request-method': 'POST' } });
    assert.equal(pre.status, 204); assert.equal(pre.headers.get('access-control-allow-origin'), '*');
    const bad = await call('POST', `/s/${id}/request`, { ...GOOD, contact: { name: 'Jo' } }, { cookie: '', origin: 'https://example.org' });
    assert.equal(bad.status, 400); assert.match(bad.json.message, /phone number or an email/);
    assert.equal((await call('POST', `/s/${id}/request`, { ...GOOD, website: 'x' }, { cookie: '' })).json.ok, true);
    const ok = await call('POST', `/s/${id}/request`, GOOD, { cookie: '' });
    assert.equal(ok.status, 200); assert.match(ok.json.id, /^rq_/);
    // the inbox: the one real request, not emailed (no email set up here) and saying so
    const inbox = (await call('GET', `/api/designs/sites/${id}/requests`)).json.requests;
    assert.equal(inbox.length, 1);
    assert.deepEqual({ kind: inbox[0].kindLabel, summary: inbox[0].summary, name: inbox[0].contact.name, status: inbox[0].status, emailed: inbox[0].emailed, err: inbox[0].emailError },
      { kind: 'Booking request', summary: GOOD.summary, name: 'Jo Bloggs', status: 'new', emailed: false, err: 'not_configured' });
    assert.equal((await call('GET', '/api/designs')).json.sites[0].newRequests, 1);
    assert.equal((await call('POST', `/api/designs/sites/${id}/requests/${inbox[0].id}`, { status: 'done' })).json.request.status, 'done');
    assert.equal((await call('GET', '/api/designs')).json.sites[0].newRequests, 0);
    // another account sees none of it
    cookie = '';
    assert.equal((await call('POST', '/api/auth/signup', { email: 'other@example.com', password: 'correct-horse-battery-staple' })).status, 200);
    assert.equal((await call('GET', `/api/designs/sites/${id}/requests`)).status, 404);
    assert.equal((await call('POST', `/api/designs/sites/${id}/requests/${inbox[0].id}`, { status: 'new' })).status, 404);
  } finally { srv.close(); }
});

test('every design sends what its visitors ask for: no form is a demo any more', () => {
  const { designs, demoHtml } = require('../lib/design-sites');
  // Plumb's request is a phone call (its button rings the builder); every other design sends through SiteRemade
  const CALLS_ONLY = ['plumb'];
  for (const { design } of designs()) {
    const html = demoHtml(design);
    assert.doesNotMatch(html, /Demo only|nothing was (?:sent|booked|ordered|held|charged|created)|On a live (?:site|listing)|pretend bag/i, `${design} still says it is a demo`);
    if (CALLS_ONLY.includes(design)) assert.match(html, /href="tel:/, `${design} calls the business`);
    else assert.match(html, /window\.SiteRemade;return s&&s\.live\?s\.send\(r\)|window\.SiteRemade; return s && s\.live \? s\.send\(r\)/, `${design} sends its requests`);
  }
});
