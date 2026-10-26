'use strict';
// WEBSITES, DONE FOR YOU (lib/website-requests.js): a request comes in from "Get this design", the owner sees it on
// /requests, sends the preview with a pay link, and a signed Stripe event marks it paid. No email is set up here and no
// Stripe key, so nothing leaves the machine.
process.env.SITEREMADE_DB_PATH = ':memory:';
process.env.SITEREMADE_DESIGN_OWNER_CUTOFF = '2999-01-01T00:00:00.000Z';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_website_requests';
delete process.env.RESEND_API_KEY;
delete process.env.STRIPE_SECRET_KEY;
delete process.env.ANTHROPIC_API_KEY; // (the hero director is a recorded stand-in here: never the paid API)
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { app, setDesignDeps } = require('../server.js');
const wr = require('../lib/website-requests');

const OWNER = 'jaydenflynn9@gmail.com';

async function server() {
  const srv = app.listen(0, '127.0.0.1'); await new Promise((r) => srv.on('listening', r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  const session = async (email) => {
    let cookie = '';
    const call = async (method, p, body, headers = {}) => {
      const r = await fetch(base + p, { method, headers: { 'content-type': 'application/json', origin: base, cookie, ...headers }, body: body ? JSON.stringify(body) : undefined, redirect: 'manual' });
      const sc = r.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
      const text = await r.text(); let json = null; try { json = JSON.parse(text); } catch (e) { /* html */ }
      return { status: r.status, json, text, headers: r.headers };
    };
    if (email) {
      const up = await call('POST', '/api/auth/signup', { email, password: 'correct-horse-battery-staple' });
      if (up.status !== 200) assert.equal((await call('POST', '/api/auth/signin', { email, password: 'correct-horse-battery-staple' })).status, 200, 'signed in');
    }
    return call;
  };
  return { srv, base, session };
}
function stripeEvent(base, type, object) {
  const body = JSON.stringify({ id: 'evt_' + crypto.randomBytes(6).toString('hex'), type, data: { object } });
  const t = Math.floor(Date.now() / 1000);
  const sig = crypto.createHmac('sha256', process.env.STRIPE_WEBHOOK_SECRET).update(`${t}.${body}`).digest('hex');
  return fetch(`${base}/api/stripe/webhook`, { method: 'POST', headers: { 'content-type': 'application/json', 'stripe-signature': `t=${t},v1=${sig}` }, body });
}

test('request -> owner page -> preview with a pay link -> paid by a signed Stripe event', async () => {
  const { srv, base, session } = await server();
  try {
    const guest = await session(null);
    const sent = await guest('POST', '/api/enquiries/website', { name: 'Dez Okafor', email: 'dez@example.com', phone: '+1 403 555 0100', answers: { businessName: 'Fade Factory', design: 'Steady Hand', designKey: 'steadyhand', link: 'https://instagram.com/steadyhandcuts' } });
    assert.equal(sent.status, 200, sent.text);
    // their photos, with the private token the request gave back
    const tok = sent.json.uploadToken; assert.match(tok, /^[A-Za-z0-9_-]{20,40}$/);
    const jpeg = 'data:image/jpeg;base64,' + Buffer.from('a stand-in photo').toString('base64');
    assert.equal((await guest('POST', `/api/enquiries/photos/${tok}`, { photo: jpeg })).json.count, 1);
    assert.equal((await guest('POST', `/api/enquiries/photos/${tok}`, { photo: jpeg })).json.count, 2);
    assert.equal((await guest('POST', `/api/enquiries/photos/${tok}`, { photo: 'data:image/svg+xml;base64,PHN2Zz4=' })).status, 400, 'not a photo');
    assert.equal((await guest('POST', '/api/enquiries/photos/not-a-real-token-xxxxxxxx', { photo: jpeg })).status, 404);

    // only the owner sees requests
    const stranger = await session('someone@example.com');
    assert.equal((await stranger('GET', '/api/requests')).status, 404);
    assert.equal((await guest('GET', '/api/requests')).status, 401);
    assert.equal((await guest('GET', '/requests')).status, 200, 'the page itself loads (the data is what is guarded)');
    const owner = await session(OWNER);
    const list = await owner('GET', '/api/requests');
    assert.equal(list.status, 200);
    const q = list.json.requests[0];
    assert.equal(q.businessName, 'Fade Factory'); assert.equal(q.photos.length, 2);
    const img = await owner('GET', q.photos[0].url); assert.equal(img.status, 200); assert.equal(img.headers.get('content-type'), 'image/jpeg');
    assert.equal((await stranger('GET', q.photos[0].url)).status, 404, 'only the owner sees the photos');
    assert.equal(q.design, 'Steady Hand'); assert.equal(q.designKey, 'steadyhand'); assert.equal(q.link, 'https://instagram.com/steadyhandcuts'); assert.equal(q.status, 'new');
    assert.equal(list.json.emailOn, false); assert.equal(list.json.payOn, false);

    // moving it along, a note, a bad status
    assert.equal((await owner('POST', `/api/requests/${q.id}`, { status: 'building', note: 'Use the blue logo' })).json.request.status, 'building');
    assert.equal((await owner('POST', `/api/requests/${q.id}`, { status: 'gone' })).status, 400);
    assert.equal((await stranger('POST', `/api/requests/${q.id}`, { status: 'done' })).status, 404);

    // the preview needs a link; then a pay link and a message to paste
    assert.equal((await owner('POST', `/api/requests/${q.id}/send-preview`, { previewUrl: 'not a link' })).status, 400);
    const pv = await owner('POST', `/api/requests/${q.id}/send-preview`, { previewUrl: 'https://www.siteremade.com/s/abc' });
    assert.equal(pv.status, 200, pv.text);
    assert.equal(pv.json.emailed, false, 'no email set up here');
    assert.equal(pv.json.request.status, 'preview_sent');
    assert.match(pv.json.message, /Hi Dez, your Steady Hand website is ready/);
    assert.match(pv.json.message, /https:\/\/www\.siteremade\.com\/s\/abc/);
    const payPath = new URL(pv.json.request.payUrl).pathname;
    assert.match(payPath, /^\/pay\/[A-Za-z0-9_-]{20,40}$/);
    // sending again keeps the same pay link
    const again = await owner('POST', `/api/requests/${q.id}/send-preview`, {});
    assert.equal(new URL(again.json.request.payUrl).pathname, payPath);

    // the customer's pay page
    const page = await guest('GET', payPath);
    assert.equal(page.status, 200); assert.match(page.text, /Pay \$149\.99/); assert.match(page.text, /See your website/);
    assert.equal((await guest('GET', '/pay/not-a-real-token-at-all-xx')).status, 404);
    const noStripe = await guest('POST', payPath);
    assert.equal(noStripe.status, 503, 'no Stripe key here: the page says so instead of failing');

    // a signed event for a different amount doesn't count; the right one does, once
    const obj = { id: 'cs_test_1', client_reference_id: q.id, payment_status: 'paid', amount_total: 1, currency: 'cad', metadata: { kind: 'website_request', requestId: q.id } };
    assert.equal((await stripeEvent(base, 'checkout.session.completed', obj)).status, 200);
    assert.equal((await owner('GET', '/api/requests')).json.requests[0].paidAt, null);
    obj.amount_total = 14999;
    assert.equal((await stripeEvent(base, 'checkout.session.completed', obj)).status, 200);
    const paid = (await owner('GET', '/api/requests')).json.requests[0];
    assert.ok(paid.paidAt); assert.equal(paid.status, 'paid');
    assert.match((await guest('GET', payPath)).text, /Thank you, Dez/);
    // an unsigned event is refused
    const forged = await fetch(`${base}/api/stripe/webhook`, { method: 'POST', headers: { 'content-type': 'application/json', 'stripe-signature': 't=1,v1=00' }, body: JSON.stringify({ type: 'checkout.session.completed', data: { object: obj } }) });
    assert.equal(forged.status, 400);
  } finally { srv.close(); }
});

test('the preview message and the pay page escape what customers typed', () => {
  const row = { id: 'enq_1', summary: 'Website · X', status: 'preview_sent', preview_url: 'https://example.com/p', pay_token: 'tok_tok_tok_tok_tok_tok_1', fields_json: JSON.stringify([['Design', '<b>X</b>']]), contact_json: JSON.stringify({ name: '<script>Al</script>', email: 'a@b.co' }) };
  const m = wr.previewMessage(row, { base: 'https://s.test', price: '$149.99 CAD' });
  assert.doesNotMatch(m.html, /<script>Al/); assert.doesNotMatch(m.html, /<b>X<\/b>/);
  assert.match(m.text, /https:\/\/s\.test\/pay\/tok_tok_tok_tok_tok_tok_1/);
  assert.doesNotMatch(wr.payPage(row, { price: '$149.99' }), /<b>X<\/b>/);
});

test('customers no longer run the AI: a new site points them to "Get this design", and a change they ask for goes to the owner', async () => {
  const { srv, session } = await server();
  try {
    const customer = await session('customer@example.com');
    const made = await customer('POST', '/api/designs/sites', { design: 'steadyhand', brief: { about: 'a barbershop' } });
    assert.equal(made.status, 403); assert.match(made.json.message, /Get this design/);
    // a site the owner built and handed over before (on the customer's account)
    const me = await customer('GET', '/api/auth/me');
    const raw = require('../lib/db').getDb(process.env.SITEREMADE_DB_PATH), now = new Date().toISOString();
    raw.prepare('INSERT INTO design_sites (id, account_id, design, status, business_name, brief_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run('ds_handover123', me.json.account.id, 'steadyhand', 'built', 'Fade Factory', '{}', now, now);
    const ask = await customer('POST', '/api/designs/sites/ds_handover123/ask', { request: 'Change Saturday hours to 9 to 4' });
    assert.equal(ask.status, 202, ask.text); assert.equal(ask.json.sent, true);
    const owner = await session(OWNER);
    const change = (await owner('GET', '/api/requests')).json.requests.find((q) => q.service === 'change');
    assert.ok(change, 'the owner sees the change request');
    assert.equal(change.contact.email, 'customer@example.com');
    assert.deepEqual(change.fields.map((f) => f[0]), ['Website', 'Change']);
    assert.match(change.fields[1][1], /Saturday hours/);
  } finally { srv.close(); }
});

test('the owner builds a site from the design example (no AI): named, editable, photos offered, publishable', async () => {
  const { srv, session } = await server();
  try {
    const owner = await session(OWNER), customer = await session('customer2@example.com');
    assert.equal((await customer('POST', '/api/designs/sites/from-example', { design: 'steadyhand', businessName: 'Fade Factory' })).status, 404);
    assert.equal((await owner('POST', '/api/designs/sites/from-example', { design: 'steadyhand', businessName: '' })).status, 400);
    const made = await owner('POST', '/api/designs/sites/from-example', { design: 'steadyhand', businessName: 'Fade Factory' });
    assert.equal(made.status, 200, made.text);
    const id = made.json.site.id;
    const ed = await owner('GET', `/api/designs/sites/${id}/editor`);
    assert.equal(ed.status, 200, ed.text);
    assert.ok(ed.json.editor.fields.some((f) => f.path === 'hero.photo' && f.kind === 'photo'), 'the photo field is offered');
    assert.ok(ed.json.editor.fields.some((f) => f.value === 'Fade Factory'), 'named for the business');
    const photo = 'data:image/jpeg;base64,' + Buffer.from('stand-in photo').toString('base64');
    const saved = await owner('POST', `/api/designs/sites/${id}/edit`, { changes: [{ path: 'hero.photo', value: photo }] });
    assert.equal(saved.status, 200, saved.text);
    const pub = await owner('POST', `/api/designs/sites/${id}/publish`, { on: true, confirm: true });
    assert.equal(pub.status, 200, pub.text);
    const live = await customer('GET', `/s/${id}`);
    assert.equal(live.status, 200); assert.ok(live.text.includes('class="photo"'), 'the live page shows the photo');
  } finally { srv.close(); }
});

test('starting from the example puts the business name everywhere the example used its own name', () => {
  const ds = require('../lib/design-sites');
  const rows = new Map(); const db = { designSites: { insert(r) { rows.set(r.id, { id: r.id, status: r.status, business_name: r.businessName, design: r.design }); }, update(id, f) { Object.assign(rows.get(id), f); }, find(id) { return rows.get(id); } } };
  const r = ds.startFromExample(db, { accountId: 'a', design: 'steadyhand', businessName: 'Fade Factory' });
  assert.ok(r.row, r.error);
  const content = JSON.parse(r.row.content_json);
  assert.doesNotMatch(JSON.stringify(content), /steady hand/i, 'no trace of the example name');
  assert.equal(content.business.wordmark, 'FADE FACTORY', 'in capitals, like the example');
  assert.match(content.footer.fine, /© \d{4} Fade Factory\./, 'no made-up business line');
});

// ONE TAP (POST /api/requests/:id/build, lib/hero-director.js): the request becomes a site in its design, under the
// business's name, with the customer's photos placed in the moving hero. Here the director is recorded, never Claude.
test('one tap builds the site from a request, with the photos placed by the hero director', async () => {
  const { srv, base, session } = await server();
  const seen = [];
  setDesignDeps({ writer: () => { throw new Error('no writer in this test'); }, director: () => async ({ images, brief }) => {
    seen.push({ n: images.length, brief, mimes: images.map((i) => i.mime) });
    return { plan: { main: 3, before: 1, middle: [2, 2, 7], camera: [{ photo: 3, focus_x: 40, focus_y: 55, drift: 'left', zoom: 1.3 }], skip: [], note: 'The finished room ends the hero.' }, usage: { input: 1000, output: 100 } };
  } });
  try {
    const guest = await session(null), owner = await session(OWNER);
    const jpeg = (s) => 'data:image/jpeg;base64,' + Buffer.from('photo ' + s).toString('base64');
    const ask = async (answers, n) => {
      const r = await guest('POST', '/api/enquiries/website', { name: 'Ana Silva', email: 'ana@example.com', answers });
      for (let i = 1; i <= n; i++) assert.equal((await guest('POST', `/api/enquiries/photos/${r.json.uploadToken}`, { photo: jpeg(i) })).status, 200);
      return r.json.id;
    };
    // a cleaning company, three photos: the photo hero
    const id = await ask({ businessName: 'Sparkle Bright', design: 'Brisk', designKey: 'brisk', link: 'https://sparklebright.example.com' }, 3);
    const stranger = await session('someone-else@example.com');
    assert.equal((await stranger('POST', `/api/requests/${id}/build`, {})).status, 404, 'owner only');
    const b = await owner('POST', `/api/requests/${id}/build`, {});
    assert.equal(b.status, 200, b.text);
    assert.equal(b.json.director.by, 'claude'); assert.equal(b.json.director.used, 3); assert.equal(b.json.director.note, 'The finished room ends the hero.');
    assert.equal(seen.length, 1); assert.equal(seen[0].n, 3); assert.match(seen[0].brief, /Sparkle Bright, a cleaning company/);
    assert.equal(b.json.request.siteId, b.json.siteId); assert.equal(b.json.request.status, 'building');
    const ed = await owner('GET', `/api/designs/sites/${b.json.siteId}/editor`);
    assert.equal(ed.status, 200, ed.text);
    const val = (p) => (ed.json.fields || ed.json.editor.fields).find((f) => f.path === p)?.value;
    assert.equal(val('photos.before'), jpeg(1)); assert.equal(val('photos.second'), jpeg(2)); assert.equal(val('photos.main'), jpeg(3)); assert.equal(val('photos.third'), null);
    // a second tap opens the same site; "again" makes a fresh one
    const again = await owner('POST', `/api/requests/${id}/build`, {});
    assert.equal(again.json.siteId, b.json.siteId); assert.equal(again.json.existing, true);
    const fresh = await owner('POST', `/api/requests/${id}/build`, { again: true });
    assert.notEqual(fresh.json.siteId, b.json.siteId); assert.equal(seen.length, 2);
    // live: the requests page offers its link
    assert.equal((await owner('POST', `/api/designs/sites/${fresh.json.siteId}/publish`, { confirm: true })).status, 200);
    const list = await owner('GET', '/api/requests');
    const q = list.json.requests.find((x) => x.id === id);
    assert.equal(q.site.live, true); assert.equal(q.site.url, `${base}/s/${fresh.json.siteId}`);
    assert.equal((await guest('GET', `/s/${fresh.json.siteId}`)).text.includes('srph-cfg'), true, 'the live page plays the photos');

    // the barber design takes them in its own photo mode; a director that fails falls back to their order
    setDesignDeps({ writer: () => { throw new Error('no writer'); }, director: () => async () => { throw new Error('overloaded'); } });
    const id2 = await ask({ businessName: 'Fade Factory', design: 'Steady Hand', designKey: 'steadyhand', link: 'https://instagram.com/fadefactory' }, 2);
    const b2 = await owner('POST', `/api/requests/${id2}/build`, {});
    assert.equal(b2.status, 200, b2.text); assert.equal(b2.json.director.by, 'order'); assert.equal(b2.json.director.problem, 'overloaded');
    const ed2 = await owner('GET', `/api/designs/sites/${b2.json.siteId}/editor`);
    const val2 = (p) => (ed2.json.fields || ed2.json.editor.fields).find((f) => f.path === p)?.value;
    assert.equal(val2('hero.photo'), jpeg(1), 'their first photo ends the hero'); assert.equal(val2('hero.photo2'), jpeg(2));

    // weak photos: Claude keeps the design's own animation, and the page is the example's, named
    setDesignDeps({ writer: () => { throw new Error('no writer'); }, director: () => async () => ({ plan: { use_photos: false, main: 1, before: 0, middle: [], camera: [], skip: [{ photo: 1, why: 'a blurry screenshot' }], note: 'Ask for a clear photo of the shop.' } }) });
    const id4 = await ask({ businessName: 'Bright Smile', design: 'Saltglass', designKey: 'saltglass', link: 'https://brightsmile.example.com' }, 1);
    const b4 = await owner('POST', `/api/requests/${id4}/build`, {});
    assert.equal(b4.status, 200, b4.text); assert.equal(b4.json.director.kept, true); assert.equal(b4.json.director.used, 0);
    const ed4 = await owner('GET', `/api/designs/sites/${b4.json.siteId}/editor`);
    assert.equal((ed4.json.fields || ed4.json.editor.fields).find((f) => f.path === 'hero.photo').value, null, 'the drawing stays');

    // no photos: just the named site
    const id3 = await ask({ businessName: 'Corner Plate', design: 'Larder', designKey: 'larder', link: 'https://cornerplate.example.com' }, 0);
    const b3 = await owner('POST', `/api/requests/${id3}/build`, {});
    assert.equal(b3.status, 200, b3.text); assert.equal(b3.json.director, null); assert.equal(b3.json.photos, 0);
  } finally { setDesignDeps({ writer: () => { throw new Error('no writer'); } }); srv.close(); }
});

test('the hero director: a plan is checked against the photos there are', () => {
  const hd = require('../lib/hero-director');
  assert.equal(hd.checkPlan({ main: 9 }, 3), null, 'a photo that isn’t there');
  const p = hd.checkPlan({ main: 2, before: 2, middle: [1, 1, 3, 3], camera: [{ photo: 2, focus_x: 140, focus_y: -5, drift: 'up', zoom: 9 }], skip: [{ photo: 2, why: 'x' }], note: ' fine ' }, 3);
  assert.deepEqual(p, { keep: false, main: 2, before: 0, middle: [1, 3], camera: [{ photo: 2, fx: 100, fy: 0, dir: 1, zoom: 1.5 }], skip: [], note: 'fine' });
  assert.deepEqual(hd.byOrder(1), { keep: false, main: 1, before: 0, middle: [], camera: [], skip: [], note: 'Photos used in the order the customer sent them: the first ends the hero.' });
});
