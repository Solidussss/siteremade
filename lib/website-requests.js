// WEBSITES, DONE FOR YOU: a customer picks a design and sends one link to their business (lib/service-enquiries.js
// 'website'). The owner builds it, sends a preview with a private pay link (/pay/<token>), and the customer pays the
// website price once through Stripe. This file holds the parts that need no server: the statuses, the owner's view of a
// request, the customer's email and the message the owner can paste into a DM, and the pay page.
'use strict';

const crypto = require('crypto');

const STATUSES = ['new', 'building', 'preview_sent', 'paid', 'done', 'declined'];
const STATUS_LABEL = { new: 'New', building: 'Building', preview_sent: 'Preview sent', paid: 'Paid', done: 'Live', declined: 'Declined', replied: 'Replied' };
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const isHttpUrl = (u) => /^https?:\/\/[^\s<>"']+\.[^\s<>"']+/i.test(String(u || ''));
const newPayToken = () => crypto.randomBytes(18).toString('base64url');

const field = (row, label) => { try { return (JSON.parse(row.fields_json).find((f) => f[0] === label) || [])[1] || ''; } catch (e) { return ''; } };
const contact = (row) => { try { return JSON.parse(row.contact_json); } catch (e) { return {}; } };
const payUrl = (base, row) => (row.pay_token ? `${base}/pay/${row.pay_token}` : null);

// what the owner's requests page shows for one request
function ownerView(row, base) {
  return {
    id: row.id, service: row.service, summary: row.summary, status: row.status, statusLabel: STATUS_LABEL[row.status] || row.status,
    businessName: field(row, 'Business'), design: field(row, 'Design'), designKey: /^[a-z]{2,20}$/.test(field(row, 'Design key')) ? field(row, 'Design key') : null, link: field(row, 'Their link'), message: field(row, 'Message'),
    fields: (() => { try { return JSON.parse(row.fields_json); } catch (e) { return []; } })(),
    contact: contact(row), siteId: row.site_id || null, previewUrl: row.preview_url || null, payUrl: payUrl(base, row), paidAt: row.paid_at || null,
    note: row.note || '', emailed: !!row.emailed_at, emailError: row.email_error || null, createdAt: row.created_at, updatedAt: row.updated_at,
  };
}

// the preview, for the customer: an email, and the same words as a message the owner can paste into a DM or a text
function previewMessage(row, { base, price }) {
  const c = contact(row), first = String(c.name || '').trim().split(/\s+/)[0] || 'there', design = field(row, 'Design') || 'new';
  const text = `Hi ${first}, your ${design} website is ready to look at: ${row.preview_url}\n\nIf you're happy with it, you can pay here (${price}, one time, no subscription): ${payUrl(base, row)}\n\nWant anything changed first? Just reply and tell me.`;
  const html = `<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;color:#101114"><p style="font-size:12px;letter-spacing:.12em;font-weight:700">SITEREMADE</p>
<h1 style="font-size:30px;line-height:1.15;margin:10px 0 14px">Your website is ready to look at, ${esc(first)}.</h1>
<p style="font-size:16px;line-height:1.6;color:#444">We built your ${esc(design)} site with your details. Have a look on your phone and your computer:</p>
<p style="margin:22px 0"><a href="${esc(row.preview_url)}" style="background:#101114;color:#fff;text-decoration:none;padding:14px 22px;border-radius:999px;font-weight:700;display:inline-block">See your website</a></p>
<p style="font-size:16px;line-height:1.6;color:#444">Want something changed? Just reply to this email and tell us. When you're happy with it:</p>
<p style="margin:22px 0"><a href="${esc(payUrl(base, row))}" style="background:#fff;color:#101114;text-decoration:none;padding:13px 21px;border-radius:999px;font-weight:700;display:inline-block;border:2px solid #101114">Pay ${esc(price)} and go live</a></p>
<p style="font-size:13px;line-height:1.6;color:#777">${esc(price)}, one time. The website is yours, no subscription.</p></div>`;
  return { subject: 'Your website is ready to look at', text, html };
}

// the customer's "we've got it" after a website request
function requestReceived(enq) {
  const first = String(enq.contact.name || '').trim().split(/\s+/)[0] || 'there', design = (enq.fields.find((f) => f[0] === 'Design') || [])[1] || 'new';
  return { subject: `We got your request for the ${design} website`, html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;color:#101114"><p style="font-size:12px;letter-spacing:.12em;font-weight:700">SITEREMADE</p>
<h1 style="font-size:28px;line-height:1.15;margin:10px 0 14px">Got it, ${esc(first)}.</h1>
<p style="font-size:16px;line-height:1.6;color:#444">We're building your ${esc(design)} website with your real photos and details. You'll get a link to look at it, usually within two days.</p>
<p style="font-size:16px;line-height:1.6;color:#444">Nothing to pay yet: you only pay once you've seen it and you're happy. Want to add something, like photos, prices or your logo? Just reply to this email.</p></div>` };
}

// the pay page: the preview, the price and one button (or "paid, thank you")
function payPage(row, { price, state = '', error = '' }) {
  const design = field(row, 'Design'), c = contact(row), paid = !!row.paid_at;
  const body = paid || state === 'paid'
    ? `<p class="tag">PAID</p><h1>Thank you${c.name ? `, ${esc(String(c.name).split(' ')[0])}` : ''}.</h1><p>Your payment went through. We'll put your website live and send you the link.</p>`
    : `<p class="tag">${esc(design ? `${design.toUpperCase()} WEBSITE` : 'YOUR WEBSITE')}</p><h1>Ready when you are.</h1>
<p>Have a look at your website first. If you'd like anything changed, reply to our email and we'll sort it before you pay.</p>
${row.preview_url ? `<p><a class="ghost" href="${esc(row.preview_url)}" target="_blank" rel="noopener">See your website</a></p>` : ''}
<form method="post" action="/pay/${esc(row.pay_token)}"><button>Pay ${esc(price)}</button></form>
<p class="small">One time. The website is yours, no subscription. Secure payment by Stripe.</p>
${state === 'cancelled' ? '<p class="note">The payment was cancelled. Nothing was charged.</p>' : ''}${error ? `<p class="note">${esc(error)}</p>` : ''}`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>SiteRemade · Your website</title><link rel="icon" href="/favicon.png">
<style>body{margin:0;font-family:Inter,system-ui,-apple-system,Arial,sans-serif;background:#f4f3ef;color:#101114;display:grid;place-items:center;min-height:100vh;padding:16px;box-sizing:border-box}
main{box-sizing:border-box;background:#fff;border-radius:24px;padding:34px 28px;max-width:440px;width:100%;box-shadow:0 30px 80px rgba(0,0,0,.08)}
.tag{font-size:11px;letter-spacing:.14em;font-weight:800;color:#777;margin:0}h1{font-size:34px;letter-spacing:-.04em;line-height:1.05;margin:10px 0 12px}
p{line-height:1.6;color:#444}button,.ghost{display:block;width:100%;box-sizing:border-box;text-align:center;border-radius:999px;padding:15px 20px;font-weight:700;font-size:16px;line-height:1;font-family:inherit;cursor:pointer;text-decoration:none}
button{background:#101114;color:#fff;border:0;margin-top:6px}.ghost{border:2px solid #101114;color:#101114}.small{font-size:13px;color:#777}.note{color:#b3261e}</style></head>
<body><main>${body}</main></body></html>`;
}

module.exports = { STATUSES, STATUS_LABEL, isHttpUrl, newPayToken, ownerView, previewMessage, requestReceived, payPage, field, contact };
