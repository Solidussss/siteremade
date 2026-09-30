// START-HERE.md -- the first file a website owner opens in their purchased ZIP.
//
// A beginner's launch guide: "I downloaded my website" -> "my website is online", for someone who has never hosted a
// website, whatever hosting company they use. Short sentences, one action at a time, no coding, and every technical
// word explained the moment it appears. It never names a required host, never invents DNS values (the hosting company
// provides those), never mentions GitHub, and only mentions a command where the site genuinely needs server hosting.
//
// The three owner files stay separate: START-HERE.md = how to put it online (this); HANDOFF.md = what you own;
// README.md = technical details for a developer.
'use strict';

const HOSTS = { hostinger: { label: 'Hostinger', node: false }, bluehost: { label: 'Bluehost', node: false }, godaddy: { label: 'GoDaddy', node: false }, railway: { label: 'Railway', node: true } };
const FEATURE_NAMES = { contact_form_submission: 'a contact form', quote_request: 'a quote request form', booking_request: 'a booking form', newsletter_submission: 'a newsletter sign-up' };

function listWords(items) {
  if (items.length <= 1) return items.join('');
  return items.slice(0, -1).join(', ') + ' and ' + items[items.length - 1];
}

// { runtimeType: 'static'|'server_required', runtimeReasons: [], businessName, hostingChoice: {provider}|null, mode: 'business'|'creative' }
function buildStartHere({ runtimeType, runtimeReasons, businessName, hostingChoice, mode }) {
  const server = runtimeType === 'server_required';
  const features = (runtimeReasons || []).map(r => FEATURE_NAMES[r]).filter(Boolean);
  const picked = hostingChoice && !hostingChoice.skipped && HOSTS[hostingChoice.provider] ? HOSTS[hostingChoice.provider] : null;
  const L = [];
  const p = (...lines) => { L.push(...lines, ''); };

  p('# START HERE');
  p('You bought a complete website from SiteRemade. These files are your website.');
  p('This guide shows you how to put it online. You do not need coding experience.');
  if (businessName) p(`**Your website:** ${businessName}`);
  if (server) {
    p(`**What kind of website it is:** your website has ${features.length ? listWords(features) : 'a form'}. Forms need a kind of hosting called **Node.js hosting**. Many hosting companies offer it.`);
  } else {
    p('**What kind of website it is:** a standard website. Most web hosting companies can host it.');
  }

  p('## The short version');
  p('To put your website online, you need to:',
    '',
    server ? '1. Get a hosting account that offers Node.js hosting.' : '1. Get a hosting account.',
    '2. Get a domain name (your web address, like yourbusiness.com).',
    '3. Upload the website files.',
    '4. Connect the domain.',
    '5. Test the website.');
  p('Each step is explained below.');

  p('## Before you start: unzip the download');
  p('Your website arrived as one ZIP file.',
    '',
    '- On Windows: right-click the ZIP file and choose **Extract All**.',
    '- On a Mac: double-click the ZIP file.');
  p('You now have a folder. Inside it is a file called **index.html**. That is your homepage.');

  p('## Step 1 — Choose where to host your website');
  p('Hosting is simply where your website lives online. You pay a hosting company, and they keep your website running.');
  if (server) {
    p('Your website needs a hosting company that supports **Node.js**. Not every plan does.',
      '',
      '- Already have hosting? Ask your hosting company: "Can I host a Node.js website on my plan?"',
      '- No hosting yet? Go back to **SiteRemade → My Websites** to see recommended hosting companies.');
  } else {
    p('- Already have hosting? Use it.',
      '- No hosting yet? Go back to **SiteRemade → My Websites** to see recommended hosting companies.');
  }
  p('You can use any hosting company you like. Their screens look different, but the steps are the same.');
  if (picked) {
    if (server && !picked.node) p(`At checkout you picked **${picked.label}**. Before you start, check that your ${picked.label} plan supports Node.js. If it does not, choose a host that does.`);
    else p(`At checkout you picked **${picked.label}**. You can use it, or any other host.`);
  }

  p('## Step 2 — Open your hosting dashboard');
  p('Sign in to your hosting account. The main page you see is your "dashboard".');
  if (server) {
    p('Look for a button or menu with a name like:',
      '',
      '- Node.js',
      '- Create App',
      '- Web App',
      '- Application',
      '- Deploy Site');
  } else {
    p('Look for a button or menu with a name like:',
      '',
      '- Website',
      '- File Manager',
      '- Upload Website',
      '- Website Files',
      '- Deploy Site',
      '- Hosting');
  }
  p('Every company uses slightly different words. Choose the one that lets you add your website.');
  if (server) p('If you can only find a **File Manager**, your plan may not include Node.js hosting. Go back to Step 1.');

  p('## Step 3 — Upload your website');
  if (server) {
    p('1. Create a new **Node.js app** in your hosting dashboard. (Here, "app" just means your website.)',
      '2. Upload **everything** in your website folder, including any folders inside it. Keep the files together. Uploading this guide too is fine.',
      '3. Your host may ask for a **start command**. That is the instruction that starts your website. Enter exactly:');
    p('```', 'node server.js', '```');
    p('4. If your host asks anything else technical, the answers are in **README.md**. You can also send that file to your host\'s support team. They will know what to do with it.');
  } else {
    p('1. Open your website\'s main folder. Some hosts call it **public_html** or **www**. That is simply the folder your website is shown from.',
      '2. Upload **everything** in your website folder, including any folders inside it. Uploading this guide too is fine.',
      '3. Make sure **index.html** sits in that main folder, not inside another folder.');
    p('Tip: many hosts let you upload the ZIP file itself and then choose **Extract** or **Unzip**. That works too.');
  }
  p('Please do not:',
    '',
    '- upload only index.html. The other files hold your design, pictures and pages.',
    '- delete or rename files.');

  p('## Step 4 — Connect your domain');
  p('Your domain is your web address, like yourbusiness.com.');
  p('**If you bought your domain from your hosting company:**',
    'Look for **Connect Domain**, **Add Domain** or **Use an existing domain**. Choose your domain. That is usually all.');
  p('**If you bought your domain from a different company:**',
    '',
    '1. In your hosting dashboard, look for **Domains** or **Connect Domain**. Your host will show you a few settings to copy.',
    '2. These settings are called **DNS records**. They tell your web address where your website lives.',
    '3. Sign in to the company where you bought your domain.',
    '4. Find their **DNS** settings. (Search their help pages for "DNS" if you cannot find them.)',
    '5. Copy the records exactly as your hosting company shows them.');
  p('You do not need to understand DNS. Just copy the settings exactly. Every hosting company gives its own settings, so always use the ones from **your** host.');

  p('## Step 5 — Wait a little');
  p('Connecting a domain is not instant. It can take a few hours, and sometimes up to a day or two.');
  p('The padlock next to your web address (it means your website is secure) may also take a little while to appear.');
  p('This is normal. You have not done anything wrong.');

  p('## Step 6 — Test your website');
  p('Open your web address in a browser. Check that:', '',
    '- [ ] your homepage opens',
    '- [ ] the menu opens each page',
    '- [ ] your pictures show',
    '- [ ] it looks right on your phone',
    ...(server ? ['- [ ] your form works: send a test message and check that it says it was sent'] : []));
  p('If those work, your website is live.');

  if (server) {
    p('## Getting your form messages');
    p('When someone fills in the form on your website, their message is saved in your hosting account.');
    p('You can have these messages sent to your SiteRemade inbox instead. This needs one setting. Ask SiteRemade or your host\'s support team to turn it on. The details are in **README.md**, under "Sending submissions to your SiteRemade Contact inbox".');
  }

  p('## Using Hostinger, Bluehost, or GoDaddy?');
  if (server) {
    p('Their basic website plans are usually made for standard websites, uploaded with a File Manager. Your website needs **Node.js** hosting, so check that your plan includes it before you start. Search their help center for "Node.js hosting". If your plan does not include it, choose a host that does.');
    p('Hosting companies made for developers, such as Railway, also run Node.js websites. If you use one, follow that company\'s own steps for adding a website.');
  } else {
    p('These companies usually have a **File Manager** or **Website** area where you can upload a standard website. Their screens may look different from this guide. If you cannot find the upload area, search their help center for "upload an HTML website".');
    p('If you use a hosting company made for developers, such as Railway, follow that company\'s own steps for adding a website instead.');
  }

  p('## Stuck?');
  p('Go back to **SiteRemade → My Websites**. There you can:', '',
    '- download your website again',
    '- see hosting recommendations',
    '- update your website',
    '- contact SiteRemade');
  p('You do not need to edit the code in this folder unless you want to.');
  const others = mode === 'creative'
    ? '**Other files in this folder:** ATTRIBUTION.md lists the picture and text credits. Keep it with your website. README.md is a short technical note.'
    : '**Other files in this folder:** HANDOFF.md explains what you own. README.md is for a web developer, if you ever hire one.';
  L.push(others, '');
  return L.join('\n');
}

module.exports = { buildStartHere };
