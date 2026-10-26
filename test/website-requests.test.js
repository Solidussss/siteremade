'use strict';
// WEBSITES, DONE FOR YOU (lib/website-requests.js): a request comes in from "Get this design", the owner sees it on
// /requests, sends the preview with a pay link, and a signed Stripe event marks it paid. No email is set up here and no
// Stripe key, so nothing leaves the machine.
process.env.SITEREMADE_DB_PATH = ':memory:';
process.env.SITEREMADE_DESIGN_OWNER_CUTOFF = '2999-01-01T00:00:00.000Z';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_website_requests';
delete process.env.RESEND_API_KEY;
delete process.env.STRIPE_SECRET_KEY;
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { app } = require('../server.js');
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
    const sent = await guest('POST', '/api/enquiries/website', { name: 'Dez Okafor', email: 'dez@example.com', phone: '+1 403 555 0100', answers: { design: 'Steady Hand', designKey: 'steadyhand', link: 'https://instagram.com/steadyhandcuts' } });
    assert.equal(sent.status, 200, sent.text);

    // only the owner sees requests
    const stranger = await session('someone@example.com');
    assert.equal((await stranger('GET', '/api/requests')).status, 404);
    assert.equal((await guest('GET', '/api/requests')).status, 401);
    assert.equal((await guest('GET', '/requests')).status, 200, 'the page itself loads (the data is what is guarded)');
    const owner = await session(OWNER);
    const list = await owner('GET', '/api/requests');
    assert.equal(list.status, 200);
    const q = list.json.requests[0];
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
  assert.equal(content.business.wordmark, 'Fade Factory');
});
