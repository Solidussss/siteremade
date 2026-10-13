// REQUESTS FROM A PUBLISHED DESIGN SITE (migrations/0016_design_site_requests.sql): a visitor books, orders, reserves or
// asks on a live site at /s/<id>, and the request reaches the business. It is kept (the owner's inbox in the studio,
// GET /api/designs/sites/:id/requests) and emailed to the owner's account. A design's page sends it with
// window.SiteRemade.send(), which only a live (or downloaded) page has: the studio preview and the design demos have no
// sender, so the page shows what would be sent and says it was not. Nothing here claims a booking is confirmed or a
// payment taken: a request is a request, and the business confirms it.
'use strict';

const KINDS = { booking: 'Booking request', order: 'Order request', reservation: 'Reservation request', enquiry: 'Enquiry', quote: 'Quote request', callback: 'Call-back request', trial: 'Trial request', waitlist: 'Waitlist sign-up', entry: 'Draw entry' };
const LIMITS = { summary: 300, label: 60, value: 1000, fields: 30, bytes: 16 * 1024 };
const EMAIL_RE = /^[^\s@<>"']{1,64}@[^\s@<>"']{1,190}\.[a-z]{2,24}$/i;
const clip = (s, n) => String(s == null ? '' : s).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim().slice(0, n);

// what a page sent, cleaned, or the reason it can't be taken
function clean(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { error: 'Send the request as JSON.' };
  if (Buffer.byteLength(JSON.stringify(body)) > LIMITS.bytes) return { error: 'That request is too long.' };
  // a hidden field people never see: a bot fills it in, and its request is quietly dropped
  if (clip(body.website, 200)) return { spam: true };
  const kind = String(body.kind || '');
  if (!KINDS[kind]) return { error: 'Unknown kind of request.' };
  const summary = clip(body.summary, LIMITS.summary);
  if (!summary) return { error: 'Say what the request is for.' };
  const raw = Array.isArray(body.fields) ? body.fields : [];
  if (raw.length > LIMITS.fields) return { error: 'Too many details in one request.' };
  const fields = [];
  for (const f of raw) {
    if (!Array.isArray(f) || f.length !== 2) return { error: 'Each detail is a label and a value.' };
    const label = clip(f[0], LIMITS.label), value = clip(f[1], LIMITS.value);
    if (label && value) fields.push([label, value]);
  }
  const c = body.contact && typeof body.contact === 'object' ? body.contact : {};
  const contact = { name: clip(c.name, 120), phone: clip(c.phone, 40), email: clip(c.email, 254).toLowerCase() };
  if (contact.email && !EMAIL_RE.test(contact.email)) return { error: 'That email address doesn’t look right.' };
  if (contact.phone && contact.phone.replace(/\D/g, '').length < 6) return { error: 'That phone number looks too short.' };
  if (!contact.name) return { error: 'Add a name so the business knows who it’s from.' };
  if (!contact.phone && !contact.email) return { error: 'Add a phone number or an email so the business can reply.' };
  return { request: { kind, summary, fields, contact } };
}

const esc = (s) => String(s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
// the email the owner gets: what was asked for, who asked and how to reply, and a link to the inbox
function ownerEmail({ businessName, request, inboxUrl, siteUrl }) {
  const what = KINDS[request.kind], who = request.contact.name, biz = businessName || 'your website';
  const rows = [['Name', who]].concat(request.contact.phone ? [['Phone', request.contact.phone]] : [], request.contact.email ? [['Email', request.contact.email]] : [], request.fields);
  const subject = `${what} from ${who} · ${biz}`.slice(0, 180);
  const text = `${what} from ${biz}'s website${siteUrl ? ` (${siteUrl})` : ''}\n\n${request.summary}\n\n${rows.map(([k, v]) => `${k}: ${v}`).join('\n')}\n\n` +
    `Nothing is confirmed until you reply.${request.contact.email ? ' Reply to this email to answer them.' : ''}\nAll requests: ${inboxUrl}\n`;
  const html = `<div style="font:15px/1.5 -apple-system,Segoe UI,Roboto,sans-serif;color:#1d1d1f;max-width:560px">
<p style="margin:0 0 4px;color:#6b6b73;font-size:13px;letter-spacing:.04em;text-transform:uppercase">${esc(what)} · ${esc(biz)}</p>
<h2 style="margin:0 0 16px;font-size:20px">${esc(request.summary)}</h2>
<table style="border-collapse:collapse;width:100%">${rows.map(([k, v]) => `<tr><td style="padding:6px 12px 6px 0;color:#6b6b73;vertical-align:top;white-space:nowrap">${esc(k)}</td><td style="padding:6px 0;white-space:pre-wrap">${esc(v)}</td></tr>`).join('')}</table>
<p style="margin:20px 0 0;color:#6b6b73">Nothing is confirmed until you reply.${request.contact.email ? ' Reply to this email to answer them.' : request.contact.phone ? ' Call or text them on the number above.' : ''}</p>
<p style="margin:12px 0 0"><a href="${esc(inboxUrl)}">All requests from your website</a></p></div>`;
  return { subject, text, html, replyTo: request.contact.email || null };
}

// the sender a live page gets, put just before </head>: it posts to the site's own request address
function senderScript(endpoint) {
  return `<script>window.SiteRemade={live:true,send:function(r){r=r||{};var hp=document.querySelector('input[name="website"]');if(hp&&hp.value)r.website=hp.value;` +
    `return fetch(${JSON.stringify(endpoint)},{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(r)}).then(function(x){return x.json().catch(function(){return{}}).then(function(j){if(!x.ok||!j.ok)throw new Error(j.message||'It didn\\u2019t send. Please try again, or call us.');return j;});});}};</script>`;
}
function withSender(html, endpoint) {
  const s = senderScript(endpoint);
  return /<\/head>/i.test(html) ? html.replace(/<\/head>/i, () => s + '</head>') : s + html;
}

module.exports = { KINDS, LIMITS, clean, ownerEmail, senderScript, withSender };
// a preview (the studio, the design demos) says what would happen instead of sending
const PREVIEW_TAG = 'Preview · not sent';
const PREVIEW_NOTE = 'Preview: nothing was sent. On the live site this goes straight to the business.';
function withPreview(html) {
  const s = `<script>window.SiteRemade={live:false,tag:${JSON.stringify(PREVIEW_TAG)},note:${JSON.stringify(PREVIEW_NOTE)}};</script>`;
  return /<\/head>/i.test(html) ? html.replace(/<\/head>/i, () => s + '</head>') : s + html;
}
module.exports.withPreview = withPreview;
module.exports.PREVIEW_NOTE = PREVIEW_NOTE;
