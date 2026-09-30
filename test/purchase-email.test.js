'use strict';
// The purchase confirmation email (lib/purchase-email.js, sent by server.js sendPurchaseConfirmationEmail): what it
// says, that nothing from the project can inject markup, that it is built the email-safe way, and -- end to end on
// the REAL server -- that a real (mocked-Stripe) purchase sends it once through the Resend path with the same
// sender and reply-to.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { buildPurchaseConfirmationEmail } = require('../lib/purchase-email');
const { startServer, client, providerCalls } = require('./helpers/server-process');

const URL_ = 'https://app.siteremade.com/?view=website';

test('the email says what matters: purchase confirmed, the website name, ownership, no lock-in, My Websites, hosting choice, START-HERE, reply for help', () => {
  const { subject, html, text } = buildPurchaseConfirmationEmail({ projectName: 'Greenline Landscapes', myWebsitesUrl: URL_ });
  assert.equal(subject, 'Your website "Greenline Landscapes" is ready');
  for (const s of ['PURCHASE CONFIRMED', 'Your website is ready.', '<strong>Greenline Landscapes</strong> is officially yours.', 'real source files', 'work without SiteRemade', 'No lock-in', 'host it wherever you like',
    'Download your website', 'Choose your hosting', 'Connect your domain and go live', 'use any host you like', 'START-HERE', 'The website files are yours. You can host them anywhere, keep them forever, or hand them to a developer.', 'Need help? Reply to this email.', 'SiteRemade']) {
    assert.ok(html.includes(s), `html: ${s}`);
  }
  for (const s of ['Purchase confirmed', 'Greenline Landscapes is officially yours.', `Open My Websites: ${URL_}`, 'No lock-in', '01  Download your website', 'START-HERE', 'The website files are yours.', 'Reply to this email']) assert.ok(text.includes(s), `text: ${s}`);
});

test('the CTA is a real button to My Websites, and the address is also there as plain text', () => {
  const { html } = buildPurchaseConfirmationEmail({ projectName: 'X', myWebsitesUrl: URL_ });
  const cta = html.match(/<td class="sr-btn"[^>]*bgcolor="#315cff"[^>]*>\s*<a href="([^"]+)"[^>]*>OPEN MY WEBSITES<\/a>/);
  assert.ok(cta, 'a table-cell button with a solid background');
  assert.equal(cta[1], URL_);
  assert.match(html, /Or open this link: <a href="https:\/\/app\.siteremade\.com\/\?view=website"[^>]*>https:\/\/app\.siteremade\.com\/\?view=website<\/a>/);
});

test('a hostile project name cannot inject markup into the email or break the subject line', () => {
  const evil = '"><script>alert(1)</script><img src=x onerror=alert(2)> & <a href="javascript:alert(3)">x</a>\r\nBcc: victim@example.com';
  const { subject, html, text } = buildPurchaseConfirmationEmail({ projectName: evil, myWebsitesUrl: URL_ });
  assert.ok(!/<script|<img|<a href="javascript:/i.test(html) && !/<[a-z][^>]*\son\w+=/i.test(html), 'no injected tags, links or event-handler attributes (the words survive only as escaped text)');
  assert.ok(html.includes('&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;'), 'shown as text, escaped');
  assert.ok(html.includes('&amp; &lt;a href=&quot;javascript:alert(3)&quot;&gt;'));
  assert.ok(!/[\r\n]/.test(subject), 'one line: no header injection through the subject');
  assert.ok(subject.length <= 140);
  // a hostile URL value would be escaped as an attribute too (the server builds it; this is defense in depth)
  const odd = buildPurchaseConfirmationEmail({ projectName: 'X', myWebsitesUrl: 'https://app.siteremade.com/?a="><script>x</script>' }).html;
  assert.ok(!odd.includes('"><script>'));
});

test('built the email-safe way: tables, inline styles, 600px, no scripts, no remote images or stylesheets', () => {
  const { html } = buildPurchaseConfirmationEmail({ projectName: 'Greenline Landscapes', myWebsitesUrl: URL_ });
  assert.ok(!/<script/i.test(html)); assert.ok(!/<img/i.test(html), 'no images to block or break');
  assert.ok(!/<link[^>]+stylesheet/i.test(html)); assert.ok(!/@import|url\(/i.test(html), 'nothing loaded from elsewhere');
  assert.ok(!/display:\s*(flex|grid)/i.test(html) && !/background-image/i.test(html), 'no flex, grid or background images');
  assert.match(html, /max-width:600px/); assert.match(html, /<!--\[if mso\]><table role="presentation" width="600"/, 'fixed width for Outlook');
  assert.ok((html.match(/role="presentation"/g) || []).length >= 5, 'layout tables are marked presentational');
  assert.equal((html.match(/<style>/g) || []).length, 1, 'one small style block, only for narrow screens');
  assert.match(html.match(/<style>([\s\S]*?)<\/style>/)[1].trim(), /^@media only screen and \(max-width: 480px\)/);
  assert.match(html, /font-family:Arial,Helvetica,sans-serif/);
  assert.match(html, /bgcolor="#0b0e18"[^>]*>\s*<div[^>]*>SITEREMADE<\/div>/, 'dark header with the text wordmark');
});

test('end to end: a real purchase sends this email once, through Resend, from hello@siteremade.com with reply-to kept', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sr-email-'));
  const env = {
    SITEREMADE_BACKEND: 'local', SITEREMADE_DB_PATH: path.join(dir, 'app.db'), SITEREMADE_ASSET_STORE_DIR: path.join(dir, 'assets'), SITEREMADE_PREMIUM_LOG_DIR: path.join(dir, 'premium'),
    RESEND_API_KEY: 're_test_mock_only', STRIPE_SECRET_KEY: 'sk_test_mock_only', STRIPE_WEBHOOK_SECRET: 'whsec_email_test',
    MOCK_CALL_LOG: path.join(dir, 'calls.log'), NODE_ENV: 'test',
  };
  const server = await startServer(env);
  try {
    const call = client(server.port);
    await call('POST', '/api/auth/signup', { email: 'owner@example.com', password: 'correct-horse-battery-staple' });
    const direction = { business: { name: 'Acme', categoryKey: 'other' }, pages: [{ id: 'home', slug: '', label: 'Home', sections: [] }], design: {}, copy: {} };
    const created = await call('POST', '/api/projects', { name: '<b>Acme</b> & "Co"', directionsState: { directions: [direction], activeDirectionIndex: 0 } });
    assert.ok(created.body.project, JSON.stringify(created.body).slice(0, 200));
    await call('POST', '/api/checkout', { projectId: created.body.project.id, businessName: 'Acme' });
    const session = providerCalls(env.MOCK_CALL_LOG).filter(x => x.provider === 'stripe' && x.endpoint === 'checkout').pop().session;
    const send = async () => {
      const body = JSON.stringify({ id: 'evt_' + crypto.randomBytes(4).toString('hex'), type: 'checkout.session.completed', data: { object: { id: session, payment_status: 'paid', amount_total: 14999, currency: 'cad' } } });
      const t = Math.floor(Date.now() / 1000);
      const r = await fetch(`http://127.0.0.1:${server.port}/api/stripe/webhook`, { method: 'POST', headers: { 'content-type': 'application/json', 'stripe-signature': `t=${t},v1=${crypto.createHmac('sha256', env.STRIPE_WEBHOOK_SECRET).update(`${t}.${body}`).digest('hex')}` }, body });
      assert.equal(r.status, 200);
    };
    await send();
    let mails = [];
    for (let i = 0; i < 40 && !mails.length; i++) { await new Promise(r => setTimeout(r, 50)); mails = providerCalls(env.MOCK_CALL_LOG).filter(x => x.provider === 'resend'); }
    assert.equal(mails.length, 1, 'sent once');
    const m = mails[0];
    assert.equal(m.auth, true, 'authenticated to Resend with the configured key');
    assert.equal(m.from, 'SiteRemade <hello@siteremade.com>'); assert.equal(m.reply_to, 'hello@siteremade.com'); assert.deepEqual(m.to, ['owner@example.com']);
    assert.equal(m.subject, 'Your website "<b>Acme</b> & "Co"" is ready');
    assert.ok(m.html.includes('<strong>&lt;b&gt;Acme&lt;/b&gt; &amp; &quot;Co&quot;</strong> is officially yours.'), 'the real project name, escaped');
    assert.ok(!m.html.includes('<b>Acme</b>'));
    assert.match(m.html, /<a href="https:\/\/app\.siteremade\.com\/\?view=website"[^>]*>OPEN MY WEBSITES<\/a>/, 'the CTA uses the existing My Websites address');
    assert.ok(m.text && m.text.includes('Open My Websites: https://app.siteremade.com/?view=website'), 'a plain-text version is sent too');
    // Stripe redelivering the same event never sends a second email
    await send(); await new Promise(r => setTimeout(r, 300));
    assert.equal(providerCalls(env.MOCK_CALL_LOG).filter(x => x.provider === 'resend').length, 1);
  } finally { await server.stop(); fs.rmSync(dir, { recursive: true, force: true }); }
});
