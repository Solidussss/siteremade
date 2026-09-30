// The purchase confirmation email: a branded product handoff (sent by server.js sendPurchaseConfirmationEmail).
//
// Written for real email clients (Gmail, Outlook, Apple Mail, phones): a 600px table layout, every style inline,
// solid colours, Arial/Helvetica, no images, no external CSS, no JavaScript. The one <style> block only tightens
// padding on narrow screens -- the email reads correctly without it. The button is a table cell with a solid
// background (so it is a real button in Outlook too, just with square corners there), and its link is repeated as
// plain text underneath, so the address is still there if a client strips styles. A plain-text version is sent
// alongside.
//
// Everything that comes from the customer's project (the name) is escaped; the My Websites address is built by the
// server and escaped as an attribute as well.
'use strict';

const BRAND = { dark: '#0b0e18', accent: '#315cff', text: '#0d0e11', muted: '#5f6470', faint: '#8a8f99', page: '#eef0f4', line: '#e4e7ee', tint: '#f3f5ff' };
const FONT = 'Arial,Helvetica,sans-serif';

function esc(value) {
  return String(value == null ? '' : value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}
// the project name on one line: no control characters (nothing can break the subject header), whitespace tidied
function oneLine(value) { return String(value == null ? '' : value).replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim(); }
// a long name is shortened in the subject line only; the email itself shows it (up to 200 characters)
function shorten(value, max) { return value.length > max ? value.slice(0, max - 1).trimEnd() + '…' : value; }

const STEPS = [
  ['Download your website', 'In My Websites, download your website as a .zip file.'],
  ['Choose your hosting', 'Pick one of our hosting recommendations, or use any host you like.'],
  ['Connect your domain and go live', 'Point your web address at your host, then check your site.'],
];

function buildPurchaseConfirmationEmail({ projectName, myWebsitesUrl }) {
  const line = oneLine(projectName);
  const rawName = line.slice(0, 200) || 'Your website';
  const name = esc(rawName);
  const url = esc(myWebsitesUrl);
  const subject = `Your website "${shorten(line, 80) || 'your SiteRemade site'}" is ready`;

  const stepRows = STEPS.map(([title, body], i) => `
              <tr>
                <td valign="top" width="44" style="padding:0 0 18px 0;font-family:${FONT};font-size:13px;line-height:20px;font-weight:bold;color:${BRAND.accent};letter-spacing:1px;">0${i + 1}</td>
                <td valign="top" style="padding:0 0 18px 0;font-family:${FONT};">
                  <div style="font-size:15px;line-height:20px;font-weight:bold;color:${BRAND.text};">${title}</div>
                  <div style="font-size:14px;line-height:21px;color:${BRAND.muted};padding-top:2px;">${body}</div>
                </td>
              </tr>`).join('');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>Your website is ready</title>
<style>
  @media only screen and (max-width: 480px) {
    .sr-pad { padding-left: 22px !important; padding-right: 22px !important; }
    .sr-hero { padding-top: 30px !important; }
    .sr-h1 { font-size: 26px !important; line-height: 32px !important; }
    .sr-btn a { padding-left: 24px !important; padding-right: 24px !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background-color:${BRAND.page};">
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:${BRAND.page};">Purchase confirmed. ${name} is yours — download it from My Websites.</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${BRAND.page}" style="background-color:${BRAND.page};">
    <tr>
      <td align="center" style="padding:24px 12px;">
        <!--[if mso]><table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;">
          <tr>
            <td align="center" bgcolor="${BRAND.dark}" style="background-color:${BRAND.dark};padding:30px 24px;border-radius:14px 14px 0 0;">
              <div style="font-family:${FONT};font-size:16px;line-height:20px;font-weight:bold;letter-spacing:5px;color:#ffffff;">SITEREMADE</div>
              <div style="font-family:${FONT};font-size:11px;line-height:16px;letter-spacing:2px;color:#8f9bc4;padding-top:6px;">YOUR WEBSITE HANDOFF</div>
            </td>
          </tr>
          <tr>
            <td class="sr-pad sr-hero" bgcolor="#ffffff" style="background-color:#ffffff;padding:40px 40px 8px 40px;font-family:${FONT};">
              <div style="font-size:12px;line-height:16px;font-weight:bold;letter-spacing:2px;color:${BRAND.accent};">PURCHASE CONFIRMED</div>
              <h1 class="sr-h1" style="margin:12px 0 0 0;font-family:${FONT};font-size:30px;line-height:36px;font-weight:bold;color:${BRAND.text};">Your website is ready.</h1>
              <p style="margin:14px 0 0 0;font-size:18px;line-height:26px;color:${BRAND.text};"><strong>${name}</strong> is officially yours.</p>
              <p style="margin:12px 0 0 0;font-size:15px;line-height:24px;color:${BRAND.muted};">You now have the real source files for your website — standalone files that work without SiteRemade. No lock-in: host it wherever you like.</p>
            </td>
          </tr>
          <tr>
            <td class="sr-pad" align="center" bgcolor="#ffffff" style="background-color:#ffffff;padding:28px 40px 8px 40px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td class="sr-btn" align="center" bgcolor="${BRAND.accent}" style="background-color:${BRAND.accent};border-radius:10px;">
                    <a href="${url}" target="_blank" style="display:inline-block;padding:16px 36px;font-family:${FONT};font-size:15px;line-height:20px;font-weight:bold;letter-spacing:1px;color:#ffffff;text-decoration:none;border-radius:10px;">OPEN MY WEBSITES</a>
                  </td>
                </tr>
              </table>
              <p style="margin:14px 0 0 0;font-family:${FONT};font-size:12px;line-height:18px;color:${BRAND.faint};">Or open this link: <a href="${url}" target="_blank" style="color:${BRAND.accent};text-decoration:underline;word-break:break-all;">${url}</a></p>
            </td>
          </tr>
          <tr>
            <td class="sr-pad" bgcolor="#ffffff" style="background-color:#ffffff;padding:32px 40px 0 40px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="border-top:1px solid ${BRAND.line};font-size:1px;line-height:1px;">&nbsp;</td></tr></table>
            </td>
          </tr>
          <tr>
            <td class="sr-pad" bgcolor="#ffffff" style="background-color:#ffffff;padding:28px 40px 4px 40px;font-family:${FONT};">
              <div style="font-size:12px;line-height:16px;font-weight:bold;letter-spacing:2px;color:${BRAND.faint};padding-bottom:18px;">WHAT HAPPENS NEXT</div>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${stepRows}
              </table>
              <p style="margin:0;font-size:14px;line-height:21px;color:${BRAND.muted};">Your download includes a <strong style="color:${BRAND.text};">START-HERE</strong> guide that walks you through putting the site online.</p>
            </td>
          </tr>
          <tr>
            <td class="sr-pad" bgcolor="#ffffff" style="background-color:#ffffff;padding:28px 40px 40px 40px;border-radius:0 0 14px 14px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td bgcolor="${BRAND.tint}" style="background-color:${BRAND.tint};border-left:3px solid ${BRAND.accent};padding:18px 20px;font-family:${FONT};border-radius:0 8px 8px 0;">
                    <div style="font-size:15px;line-height:20px;font-weight:bold;color:${BRAND.text};">It's yours, for good.</div>
                    <div style="font-size:14px;line-height:21px;color:${BRAND.muted};padding-top:4px;">The website files are yours. You can host them anywhere, keep them forever, or hand them to a developer.</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:24px 24px 8px 24px;font-family:${FONT};">
              <p style="margin:0;font-size:13px;line-height:20px;color:${BRAND.muted};">Need help? Reply to this email.</p>
              <p style="margin:10px 0 0 0;font-size:12px;line-height:18px;color:${BRAND.faint};"><strong style="color:${BRAND.muted};">SiteRemade</strong> · hello@siteremade.com</p>
              <p style="margin:6px 0 0 0;font-size:11px;line-height:16px;color:${BRAND.faint};">You're receiving this because you bought a website from SiteRemade.</p>
            </td>
          </tr>
        </table>
        <!--[if mso]></td></tr></table><![endif]-->
      </td>
    </tr>
  </table>
</body>
</html>`;

  const text = [
    'SITEREMADE',
    '',
    'Purchase confirmed. Your website is ready.',
    '',
    `${rawName} is officially yours.`,
    '',
    'You now have the real source files for your website: standalone files that work without SiteRemade. No lock-in: host it wherever you like.',
    '',
    `Open My Websites: ${myWebsitesUrl}`,
    '',
    'WHAT HAPPENS NEXT',
    ...STEPS.map(([title, body], i) => `0${i + 1}  ${title}. ${body}`),
    '',
    'Your download includes a START-HERE guide that walks you through putting the site online.',
    '',
    'The website files are yours. You can host them anywhere, keep them forever, or hand them to a developer.',
    '',
    'Need help? Reply to this email.',
    'SiteRemade · hello@siteremade.com',
    '',
  ].join('\n');

  return { subject, html, text };
}

module.exports = { buildPurchaseConfirmationEmail };
