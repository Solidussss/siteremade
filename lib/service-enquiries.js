// ENQUIRIES FOR SITEREMADE'S OWN SERVICES (migrations/0017_service_enquiries.sql). The first is property videos: an
// owner asks for a cinematic film made from their listing photographs, and we reply by hand. Nothing here takes a
// payment, accepts files or starts a generation: an enquiry is a conversation starting. Each service lists its own fields
// (SERVICES below), so a later service, an upload step or a price only changes this file and its page.
'use strict';

const EMAIL_RE = /^[^\s@<>"']{1,64}@[^\s@<>"']{1,190}\.[a-z]{2,24}$/i;
const MAX_BYTES = 16 * 1024;
const clip = (s, n) => String(s == null ? '' : s).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim().slice(0, n);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// what each service asks, in the order the email shows it. kind: one (a value from the list), many (some of the list),
// text (free text up to max), url (a link). Required fields must be answered.
const SERVICES = {
  // a website, done for them: they pick a design and send one link we can build from (their Google Maps listing,
  // Instagram or current site, with its real photos and details). We build it by hand; they approve, then pay.
  website: {
    label: 'Website',
    fields: [
      { key: 'design', label: 'Design', kind: 'text', max: 80, required: true },
      { key: 'link', label: 'Their link', kind: 'url', max: 500, required: true },
      { key: 'message', label: 'Message', kind: 'text', max: 2000 },
    ],
  },
  // a change to a website we built, asked for from the site's editor: the owner makes it by hand
  change: {
    label: 'Change request',
    fields: [
      { key: 'site', label: 'Website', kind: 'url', max: 500, required: true },
      { key: 'request', label: 'Change', kind: 'text', max: 2000, required: true },
    ],
  },
  'property-video': {
    label: 'Property video',
    fields: [
      { key: 'propertyType', label: 'Property', kind: 'one', required: true,
        options: ['Short-term rental', 'Vacation home', 'Home for sale', 'Home to let', 'Boutique hotel or B&B', 'Holiday park or cabins', 'Something else'] },
      { key: 'platforms', label: 'Listed on', kind: 'many',
        options: ['Airbnb', 'Vrbo', 'Booking.com', 'Own booking website', 'Estate agent or property portal', 'Not listed yet'] },
      { key: 'location', label: 'Where it is', kind: 'text', max: 160 },
      { key: 'listing', label: 'Listing or photos link', kind: 'url', max: 500 },
      { key: 'photos', label: 'Photographs', kind: 'one',
        options: ['Professional photos', 'Phone photos', 'A mix', 'Not sure yet'] },
      { key: 'use', label: 'Where the film will be used', kind: 'many',
        options: ['On the listing', 'Social media', 'Own website', 'Ads', 'Not sure yet'] },
      { key: 'message', label: 'Message', kind: 'text', max: 3000 },
    ],
  },
};

// what the page sent, cleaned, or the reason it can't be taken
function clean(service, body) {
  const S = SERVICES[service];
  if (!S) return { error: 'Unknown service.' };
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { error: 'Send the enquiry as JSON.' };
  if (Buffer.byteLength(JSON.stringify(body)) > MAX_BYTES) return { error: 'That enquiry is too long.' };
  // a field people never see: a bot fills it in and its enquiry is quietly dropped
  if (clip(body.company, 200)) return { spam: true };
  const name = clip(body.name, 120), email = clip(body.email, 254).toLowerCase(), phone = clip(body.phone, 40);
  if (!name) return { error: 'Add your name.' };
  if (!EMAIL_RE.test(email)) return { error: 'Add an email address we can reply to.' };
  if (phone && phone.replace(/\D/g, '').length < 6) return { error: 'That phone number looks too short.' };
  const answers = body.answers && typeof body.answers === 'object' && !Array.isArray(body.answers) ? body.answers : {};
  const fields = [];
  for (const f of S.fields) {
    const raw = answers[f.key];
    let value = '';
    if (f.kind === 'one') { const v = clip(raw, 80); if (v && !f.options.includes(v)) return { error: `Pick one of the options for “${f.label}”.` }; value = v; }
    else if (f.kind === 'many') { const list = (Array.isArray(raw) ? raw : []).map((v) => clip(v, 80)).filter(Boolean); if (list.some((v) => !f.options.includes(v))) return { error: `Pick from the options for “${f.label}”.` }; value = [...new Set(list)].join(', '); }
    else if (f.kind === 'url') { const v = clip(raw, f.max); if (v && !/^https?:\/\/[^\s<>"']+\.[^\s<>"']+/i.test(v)) return { error: 'The link should start with https://' }; value = v; }
    else value = clip(raw, f.max);
    if (f.required && !value) return { error: f.kind === 'url' ? 'Paste a link to your business: Google Maps, Instagram or your current website.' : `Tell us the ${f.label.toLowerCase()}.` };
    if (value) fields.push([f.label, value]);
  }
  const get = (label) => (fields.find((x) => x[0] === label) || [])[1];
  const summary = [S.label, get('Design'), get('Website'), get('Property'), get('Where it is')].filter(Boolean).join(' · ');
  return { enquiry: { service, summary, fields, contact: { name, email, phone } } };
}

// the email to SiteRemade
function staffEmail(enq, { id, at }) {
  const rows = [['Name', enq.contact.name], ['Email', enq.contact.email], ['Phone', enq.contact.phone || '—'], ...enq.fields]
    .map(([k, v]) => `<tr><td style="padding:10px 14px 10px 0;border-bottom:1px solid #e3e3e3;font-weight:700;vertical-align:top;white-space:nowrap">${esc(k)}</td><td style="padding:10px 0;border-bottom:1px solid #e3e3e3;white-space:pre-wrap">${esc(v)}</td></tr>`).join('');
  return {
    subject: `New enquiry: ${enq.summary}`,
    html: `<div style="font-family:Arial,sans-serif;max-width:640px;margin:auto;color:#101114"><p style="font-size:12px;letter-spacing:.12em;font-weight:700">SITEREMADE · ${esc(SERVICES[enq.service].label.toUpperCase())} ENQUIRY</p><h1 style="font-size:26px;margin:10px 0 18px">${esc(enq.summary)}</h1><table style="width:100%;border-collapse:collapse;font-size:15px">${rows}</table><p style="color:#777;font-size:12px;margin-top:22px">${esc(id)} · ${esc(at)} · reply to this email to answer them.</p></div>`,
  };
}

module.exports = { SERVICES, clean, staffEmail, EMAIL_RE };
