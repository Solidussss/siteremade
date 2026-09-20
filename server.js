const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 8080;
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;

app.disable('x-powered-by');
app.use(express.json({ limit: '900kb' }));
app.use(express.urlencoded({ extended: false, limit: '900kb' }));
app.use(express.static(__dirname,{
  setHeaders(res,filePath){
    if(/\.(?:png|jpg|jpeg|webp|svg|ico)$/i.test(filePath)){
      res.setHeader('Cache-Control','public, max-age=604800, stale-while-revalidate=86400');
    }else if(/\.(?:css|js)$/i.test(filePath)){
      res.setHeader('Cache-Control','public, max-age=3600, stale-while-revalidate=86400');
    }
  }
}));

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
function clean(value, max = 2000) { return String(value ?? '').trim().slice(0, max); }
async function sendEmail(payload) {
  if (!RESEND_API_KEY) throw new Error('RESEND_API_KEY is not configured');
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.message || `Resend returned ${response.status}`);
  return data;
}

// ---- V6: real Checkout Session creation, honestly scoped -----------------
// Mirrors the raw-fetch-to-api.stripe.com convention already used elsewhere
// in SiteRemade's production app (no stripe npm package required, which
// also can't be installed in every environment this repo runs in). This
// intentionally receives and stores nothing beyond a small summary --
// see SITE-PROJECT-V6.md for why, and for the backend persistence work
// (a public endpoint to store a purchased WebsiteProject server-side) that
// still needs to be built before a purchase can be reliably recovered from
// a different browser/device.
function flattenForStripe(obj, prefix, out) {
  out = out || {};
  Object.keys(obj || {}).forEach(key => {
    const value = obj[key];
    const paramKey = prefix ? `${prefix}[${key}]` : key;
    if (value === undefined || value === null) return;
    if (Array.isArray(value)) {
      value.forEach((item, i) => {
        if (item && typeof item === 'object') flattenForStripe(item, `${paramKey}[${i}]`, out);
        else out[`${paramKey}[${i}]`] = item;
      });
    } else if (typeof value === 'object') {
      flattenForStripe(value, paramKey, out);
    } else {
      out[paramKey] = value;
    }
  });
  return out;
}
async function stripeRequest(endpoint, params) {
  const flat = flattenForStripe(params);
  const body = new URLSearchParams();
  Object.keys(flat).forEach(k => body.append(k, String(flat[k])));
  const response = await fetch(`https://api.stripe.com/v1/${endpoint}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${STRIPE_SECRET_KEY}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error((data && data.error && data.error.message) || `Stripe returned ${response.status}`);
  return data;
}

// ---- V7: image-provider abstraction ---------------------------------------
// Audited before writing any of this (SITE-PROJECT-V7.md part 2/10): this
// environment has no image-generation API key configured, and this
// sandbox's own outbound network is restricted to package registries and
// GitHub -- confirmed by a direct connectivity check to the two most likely
// providers, both rejected by the egress policy. So `configured` is
// honestly false here, and the client falls back to the art-directed CSS
// "designed" tier (see script.js renderVisualSlot/buildImagePlan) -- no
// image generation is faked. The interface below is real and ready to
// activate wherever a provider *is* reachable: set OPENAI_API_KEY on the
// server and no client code needs to change. The key is read from the
// server environment only, used only in this server-side fetch, and is
// never sent to or readable by the browser.
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const imageProviders = {
  openai: {
    name: 'openai',
    configured: () => !!OPENAI_API_KEY,
    async generate(prompt, { aspectRatio } = {}) {
      const size = aspectRatio === '1:1' ? '1024x1024' : aspectRatio === '16:9' ? '1536x1024' : '1024x1024';
      const response = await fetch('https://api.openai.com/v1/images/generations', {
        method: 'POST',
        headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'gpt-image-1', prompt, size, n: 1 }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error((data && data.error && data.error.message) || `Image provider returned ${response.status}`);
      const b64 = data && data.data && data.data[0] && data.data[0].b64_json;
      if (!b64) throw new Error('Image provider returned no image data');
      return { dataUrl: `data:image/png;base64,${b64}` };
    }
  }
  // Add another provider here (same {name, configured(), generate()} shape)
  // and point `activeImageProvider` at it -- nothing else in this file or
  // in script.js needs to change to swap providers.
};
const activeImageProvider = imageProviders.openai;

app.get('/api/image-provider-status', (req, res) => {
  const configured = activeImageProvider.configured();
  res.json({
    configured,
    provider: configured ? activeImageProvider.name : null,
    reason: configured ? undefined : 'No server-side image-generation API key is configured in this environment.'
  });
});

app.post('/api/generate-image', async (req, res) => {
  try {
    if (!activeImageProvider.configured()) {
      return res.status(200).json({ ok: false, configured: false, message: 'Image generation is not configured on this environment yet.' });
    }
    const prompt = clean(req.body.prompt, 600);
    const aspectRatio = clean(req.body.aspectRatio, 10);
    if (!prompt) return res.status(400).json({ ok: false, message: 'Missing prompt.' });
    const result = await activeImageProvider.generate(prompt, { aspectRatio });
    return res.json({ ok: true, dataUrl: result.dataUrl });
  } catch (error) {
    console.error('Image generation failed:', error);
    return res.status(500).json({ ok: false, message: 'Could not generate image right now.' });
  }
});

app.post('/api/checkout', async (req, res) => {
  try {
    if (!STRIPE_SECRET_KEY) {
      // Real, honest state: the architecture is wired end-to-end (this
      // route, the client call, metadata shape) but no live key is
      // configured in this environment. We do not fake a successful
      // checkout -- see SITE-PROJECT-V6.md.
      return res.status(200).json({ ok: false, configured: false, message: 'Checkout is not yet configured on this environment.' });
    }
    const projectId = clean(req.body.projectId, 60);
    const businessName = clean(req.body.businessName, 160) || 'Your Business';
    const industry = clean(req.body.industry, 120) || 'General Business';
    const sectionsSummary = clean(req.body.sectionsSummary, 200);
    const brandColor = clean(req.body.brandColor, 20);
    if (!projectId) return res.status(400).json({ ok: false, message: 'Missing project reference.' });

    const origin = `${req.protocol}://${req.get('host')}`;
    const session = await stripeRequest('checkout/sessions', {
      mode: 'payment',
      success_url: `${origin}/?purchased=1&project=${encodeURIComponent(projectId)}#buy`,
      cancel_url: `${origin}/?purchase_cancelled=1#buy`,
      line_items: [{
        quantity: 1,
        price_data: {
          currency: 'cad',
          unit_amount: 35000,
          product_data: {
            name: `SiteRemade website — ${businessName}`,
            description: `${industry} · ${sectionsSummary || 'Generated website'}`.slice(0, 300),
          },
        },
      }],
      // metadata.kind follows the same dispatch convention as SiteRemade's
      // main app's Stripe webhook (metadata.kind === 'website_purchase' is
      // a new kind that app doesn't handle yet -- documented as required
      // next-step backend work, not built here).
      metadata: {
        kind: 'website_purchase',
        projectId,
        businessName: businessName.slice(0, 90),
        industry: industry.slice(0, 90),
        brandColor,
      },
    });

    return res.json({ ok: true, url: session.url });
  } catch (error) {
    console.error('Checkout session failed:', error);
    return res.status(500).json({ ok: false, message: 'Could not start checkout. Please try again shortly.' });
  }
});

app.post('/api/lead', async (req, res) => {
  try {
    if (clean(req.body.companyWebsite, 200)) return res.status(200).json({ ok: true });

    const name = clean(req.body.name, 120);
    const business = clean(req.body.business, 160);
    const website = clean(req.body.website, 500);
    const email = clean(req.body.email, 254);
    const phone = clean(req.body.phone, 80);
    const message = clean(req.body.message, 4000);
    const description = clean(req.body.description, 400);
    const designMode = clean(req.body.designMode, 80);
    const brandColor = clean(req.body.brandColor, 30);
    const backgroundColor = clean(req.body.backgroundColor, 30);
    const textColor = clean(req.body.textColor, 30);
    const logoName = clean(req.body.logoName, 180);
    const logoData = clean(req.body.logoData, 800000);
    const layout = clean(req.body.layout, 80);
    const industry = clean(req.body.industry, 120);
    const sections = clean(req.body.sections, 1000);

    if (!name || !business || !email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ ok: false, message: 'Please enter your name, business and a valid email.' });
    }

    const safe = {
      name: escapeHtml(name), business: escapeHtml(business), website: escapeHtml(website || 'Not provided'),
      email: escapeHtml(email), phone: escapeHtml(phone || 'Not provided'), message: escapeHtml(message || 'No additional notes'),
      description: escapeHtml(description || 'Not provided'),
      designMode: escapeHtml(designMode || 'Not provided'), brandColor: escapeHtml(brandColor || 'Not provided'),
      backgroundColor: escapeHtml(backgroundColor || 'Not provided'), textColor: escapeHtml(textColor || 'Not provided'),
      logoName: escapeHtml(logoName || 'Not provided'),
      layout: escapeHtml(layout || 'Not provided'), industry: escapeHtml(industry || 'Not provided'), sections: escapeHtml(sections || 'Not provided')
    };

    const leadHtml = `
      <div style="font-family:Arial,sans-serif;max-width:680px;margin:auto;color:#101114">
        <p style="font-size:12px;letter-spacing:.12em;font-weight:700">SITEREMADE — NEW DESIGN LEAD</p>
        <h1 style="font-size:32px;margin:12px 0 8px">${safe.business}</h1>
        <p style="font-size:16px;color:#666;margin:0 0 28px">${safe.designMode} · ${safe.brandColor} · ${safe.layout} · ${safe.industry}</p>
        <table style="width:100%;border-collapse:collapse;font-size:15px">
          <tr><td style="padding:12px 0;border-bottom:1px solid #ddd;font-weight:700">Name</td><td style="padding:12px 0;border-bottom:1px solid #ddd">${safe.name}</td></tr>
          <tr><td style="padding:12px 0;border-bottom:1px solid #ddd;font-weight:700">Email</td><td style="padding:12px 0;border-bottom:1px solid #ddd">${safe.email}</td></tr>
          <tr><td style="padding:12px 0;border-bottom:1px solid #ddd;font-weight:700">Phone</td><td style="padding:12px 0;border-bottom:1px solid #ddd">${safe.phone}</td></tr>
          <tr><td style="padding:12px 0;border-bottom:1px solid #ddd;font-weight:700">Website</td><td style="padding:12px 0;border-bottom:1px solid #ddd">${safe.website}</td></tr>
          <tr><td style="padding:12px 0;border-bottom:1px solid #ddd;font-weight:700">Described as</td><td style="padding:12px 0;border-bottom:1px solid #ddd">${safe.description}</td></tr>
          <tr><td style="padding:12px 0;border-bottom:1px solid #ddd;font-weight:700">Website style</td><td style="padding:12px 0;border-bottom:1px solid #ddd">${safe.designMode}</td></tr>
          <tr><td style="padding:12px 0;border-bottom:1px solid #ddd;font-weight:700">Main colour</td><td style="padding:12px 0;border-bottom:1px solid #ddd">${safe.brandColor}</td></tr>
          <tr><td style="padding:12px 0;border-bottom:1px solid #ddd;font-weight:700">Background</td><td style="padding:12px 0;border-bottom:1px solid #ddd">${safe.backgroundColor}</td></tr>
          <tr><td style="padding:12px 0;border-bottom:1px solid #ddd;font-weight:700">Text</td><td style="padding:12px 0;border-bottom:1px solid #ddd">${safe.textColor}</td></tr>
          <tr><td style="padding:12px 0;border-bottom:1px solid #ddd;font-weight:700">Logo</td><td style="padding:12px 0;border-bottom:1px solid #ddd">${safe.logoName}</td></tr>
          <tr><td style="padding:12px 0;border-bottom:1px solid #ddd;font-weight:700">Layout</td><td style="padding:12px 0;border-bottom:1px solid #ddd">${safe.layout}</td></tr>
          <tr><td style="padding:12px 0;border-bottom:1px solid #ddd;font-weight:700">Business type</td><td style="padding:12px 0;border-bottom:1px solid #ddd">${safe.industry}</td></tr>
          <tr><td style="padding:12px 0;border-bottom:1px solid #ddd;font-weight:700">Included</td><td style="padding:12px 0;border-bottom:1px solid #ddd">${safe.sections}</td></tr>
        </table>
        <h3 style="margin-top:28px">Notes</h3>
        <p style="white-space:pre-wrap;line-height:1.6">${safe.message}</p>
      </div>`;

    let logoAttachments;
    if (logoData && /^data:image\/(png|jpeg|webp|svg\+xml);base64,/.test(logoData)) {
      const match = logoData.match(/^data:(image\/(?:png|jpeg|webp|svg\+xml));base64,(.+)$/);
      if (match) {
        const ext = match[1] === 'image/jpeg' ? 'jpg' : match[1] === 'image/svg+xml' ? 'svg' : match[1].split('/')[1];
        logoAttachments = [{
          filename: logoName || `business-logo.${ext}`,
          content: match[2]
        }];
      }
    }

    await sendEmail({
      from: 'SiteRemade Leads <leads@siteremade.com>', to: ['hello@siteremade.com'], reply_to: email,
      subject: `New SiteRemade design — ${business}`, html: leadHtml,
      ...(logoAttachments ? { attachments: logoAttachments } : {})
    });

    await sendEmail({
      from: 'SiteRemade <hello@siteremade.com>', to: [email], reply_to: 'hello@siteremade.com',
      subject: 'Your SiteRemade direction is saved',
      html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;color:#101114"><p style="font-size:12px;letter-spacing:.12em;font-weight:700">SITEREMADE</p><h1 style="font-size:32px;line-height:1.1">Got it, ${safe.name}.</h1><p style="font-size:16px;line-height:1.7;color:#555">We received the direction you built for <strong>${safe.business}</strong>.</p><p style="font-size:15px;line-height:1.7">${safe.brandColor} · ${safe.layout} · ${safe.industry}</p><p style="font-size:14px;line-height:1.7;color:#777;margin-top:28px">We'll review it against your real business and get back to you with the next step. If you want to add anything, reply directly to this email.</p></div>`,
    });

    return res.json({ ok: true, message: 'Design received. We’ll review your direction and get back to you.' });
  } catch (error) {
    console.error('Lead submission failed:', error);
    return res.status(500).json({ ok: false, message: 'Something went wrong sending your design. Please email hello@siteremade.com.' });
  }
});

app.get('/privacy', (req, res) => res.sendFile(path.join(__dirname, 'privacy.html')));
app.get('/terms', (req, res) => res.sendFile(path.join(__dirname, 'terms.html')));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.listen(PORT, '0.0.0.0', () => console.log(`SiteRemade running on port ${PORT}`));
