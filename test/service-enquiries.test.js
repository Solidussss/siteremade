'use strict';
// SITEREMADE'S SERVICES (lib/service-enquiries.js, POST /api/enquiries/:service, /property-videos): a property owner's
// enquiry is cleaned, kept and (when email is set up; it isn't here, so nothing leaves the machine) emailed to SiteRemade.
// Nothing takes a payment, a file or starts a generation. The Websites studio stays where it was.
process.env.SITEREMADE_DB_PATH = ':memory:';
delete process.env.RESEND_API_KEY;
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { app } = require('../server.js');
const se = require('../lib/service-enquiries');

const GOOD = { name: 'Sam Rivera', email: 'Sam@Example.com', phone: '', answers: { propertyType: 'Vacation home', platforms: ['Airbnb', 'Vrbo'], location: 'Cornwall', listing: 'https://www.airbnb.com/rooms/1', photos: 'A mix', use: ['On the listing'], message: 'Sea views from the bedrooms.' } };

test('an enquiry is cleaned to the fields the service asks, and anything else is refused', () => {
  const e = se.clean('property-video', GOOD).enquiry;
  assert.equal(e.summary, 'Property video · Vacation home · Cornwall');
  assert.deepEqual(e.contact, { name: 'Sam Rivera', email: 'sam@example.com', phone: '' });
  assert.deepEqual(e.fields.find((f) => f[0] === 'Listed on'), ['Listed on', 'Airbnb, Vrbo']);
  assert.match(se.clean('property-video', { ...GOOD, name: '' }).error, /name/);
  assert.match(se.clean('property-video', { ...GOOD, email: 'nope' }).error, /email/);
  assert.match(se.clean('property-video', { ...GOOD, answers: { ...GOOD.answers, propertyType: '' } }).error, /property/i);
  assert.match(se.clean('property-video', { ...GOOD, answers: { ...GOOD.answers, propertyType: 'Castle' } }).error, /options/);
  assert.match(se.clean('property-video', { ...GOOD, answers: { ...GOOD.answers, platforms: ['MySpace'] } }).error, /options/);
  assert.match(se.clean('property-video', { ...GOOD, answers: { ...GOOD.answers, listing: 'javascript:alert(1)' } }).error, /https/);
  assert.match(se.clean('ai-generator', GOOD).error, /Unknown service/);
  assert.equal(se.clean('property-video', { ...GOOD, company: 'Spam Ltd' }).spam, true);
  const m = se.staffEmail(se.clean('property-video', { ...GOOD, name: '<b>Sam</b>' }).enquiry, { id: 'enq_x', at: '2026-10-13' });
  assert.doesNotMatch(m.html, /<b>Sam<\/b>/, 'what they typed is escaped');
});

test('a website request: a design and one link to the business, nothing else to fill in', async () => {
  const W = { name: 'Dez Okafor', email: 'dez@example.com', answers: { businessName: 'Fade Factory', design: 'Steady Hand', link: 'https://maps.google.com/?cid=123' } };
  const e = se.clean('website', W).enquiry;
  assert.equal(e.summary, 'Website · Fade Factory · Steady Hand');
  assert.deepEqual(e.fields, [['Business', 'Fade Factory'], ['Design', 'Steady Hand'], ['Their link', 'https://maps.google.com/?cid=123']]);
  assert.match(se.clean('website', { ...W, answers: { ...W.answers, businessName: '' } }).error, /name of your business/);
  assert.match(se.clean('website', { ...W, answers: { businessName: 'Fade Factory', design: 'Steady Hand' } }).error, /Google Maps, Instagram/);
  assert.match(se.clean('website', { ...W, answers: { ...W.answers, link: 'not a link' } }).error, /https/);
  const srv = app.listen(0, '127.0.0.1'); await new Promise((r) => srv.on('listening', r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  try {
    const r = await fetch(base + '/api/enquiries/website', { method: 'POST', headers: { 'content-type': 'application/json', origin: base }, body: JSON.stringify(W) });
    assert.equal(r.status, 200); assert.equal((await r.json()).ok, true);
    const home = await (await fetch(base + '/')).text();
    assert.match(home, /data-get=/, 'each design has a Get this design button');
    assert.doesNotMatch(home, /Free right now/, 'no free self-serve generator on the homepage');
  } finally { srv.close(); }
});

test('the Property Videos page and its enquiry work, the Websites studio is still there, and both carry the service switch', async () => {
  const srv = app.listen(0, '127.0.0.1'); await new Promise((r) => srv.on('listening', r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  const post = (p, body, headers = {}) => fetch(base + p, { method: 'POST', headers: { 'content-type': 'application/json', origin: base, ...headers }, body: JSON.stringify(body) });
  try {
    const pv = await fetch(base + '/property-videos'); assert.equal(pv.status, 200);
    const html = await pv.text();
    assert.match(html, /aria-current="page">Property Videos</);
    for (const p of ['Airbnb', 'Vrbo', 'Booking.com', 'vacation rentals', 'homes for sale']) assert.ok(html.includes(p), p);
    assert.doesNotMatch(html, /testimonial|five stars|★|trusted by|clients say/i, 'no invented proof');
    for (const h of ['/', '/designs']) { const t = await (await fetch(base + h)).text(); assert.match(t, /aria-current="page">Websites</, h); assert.match(t, /href="\/property-videos"/, h); assert.match(t, /id="app"/, h + ' is still the studio'); }
    // an enquiry is kept and answered; email isn't configured here, so nothing is sent and that's recorded
    const r = await post('/api/enquiries/property-video', GOOD); const j = await r.json();
    assert.equal(r.status, 200); assert.match(j.id, /^enq_/);
    assert.equal((await post('/api/enquiries/property-video', { ...GOOD, email: 'x' })).status, 400);
    assert.equal((await post('/api/enquiries/ai-generator', GOOD)).status, 404);
    assert.equal((await post('/api/enquiries/property-video', GOOD, { origin: 'https://evil.example' })).status, 403, 'only this site’s page may send it');
    // the list is the owner's only
    assert.equal((await fetch(base + '/api/enquiries')).status, 401);
  } finally { srv.close(); }
});

test('the switch links the two services, and the video page sells only videos: no payment, files or website pitch', () => {
  const pv = fs.readFileSync(path.join(__dirname, '..', 'design-packages', 'property-videos.html'), 'utf8');
  assert.doesNotMatch(pv, /type="file"|stripe|checkout|\/api\/purchase|\/api\/credits/i);
  assert.doesNotMatch(pv, /Give the film|\/designs\/demo\/|#gallery/, 'the video page sells videos, not websites');
  assert.match(fs.readFileSync(path.join(__dirname, '..', 'design-packages', 'app.html'), 'utf8'), /href="\/property-videos"/);
});
