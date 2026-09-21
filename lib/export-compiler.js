// V8.6: the export compiler (spec §2-13). Compiles a persisted, owned
// project's SELECTED direction into a real, standalone static or
// server-required site package -- never by scraping the live preview DOM,
// always from the same controlled WebsiteProject model script.js's own
// renderer reads (see lib/site-render.js's own header for the porting
// discipline). Never depends on the SiteRemade editor UI, never triggers
// image generation, never ships editor/account/generator/Stripe/test code.
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const render = require('./site-render.js');
const { classifyRuntime } = require('./runtime-classifier.js');
const { nowIso } = require('./db.js');
// V8.7: asset bytes go through the AssetStore adapter, not a direct
// filesystem path borrowed from lib/project-store.js -- see
// hydrateAssetsForExport below and lib/adapters/asset-store.js.
const { getAssetStore } = require('./adapters/asset-store.js');

const COMPILER_VERSION = 'site-export-compiler@1.0.0';
const MAX_PAGES_EXPORT = 6; // mirrors lib/project-store.js's own MAX_PAGES -- defense in depth, never trust a larger number
const CONTENT_TYPE_EXT = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif', 'image/svg+xml': 'svg' };
// Mirrors script.js's own MODULE_FIELD_MAX_LEN (line ~2384) -- kept in sync
// by hand for the same documented reason lib/vocabulary.js already is.
const MODULE_FIELD_MAX_LEN = { text: 120, email: 180, tel: 40, textarea: 1000, select: 60, date: 20, time: 20 };

// ---- Reproducibility (§12) -------------------------------------------------
function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(stableStringify).join(',') + ']';
  const keys = Object.keys(value).sort();
  return '{' + keys.map(k => JSON.stringify(k) + ':' + stableStringify(value[k])).join(',') + '}';
}
// Hashes the RAW (assetRef-only, dataUrl-free) direction -- deliberately
// BEFORE hydrateAssetsForExport runs, so the hash never depends on this
// particular export's own working directory, and never embeds a
// timestamp/random id -- same project id + revision + direction + compiler
// version always produces the same hash (spec §12), which is what makes
// "did this project's exported content actually change" a real, checkable
// question later (deployment comparison/rollback).
function computeArtifactHash({ projectId, directionIndex, direction, runtimeType, runtimeReasons }) {
  const source = stableStringify({ compilerVersion: COMPILER_VERSION, projectId, directionIndex, runtimeType, runtimeReasons, direction });
  return crypto.createHash('sha256').update(source).digest('hex');
}

// ---- Asset export (§11) ----------------------------------------------------
// Resolves every {assetRef} marker in a (already deep-cloned) direction to
// a real file written under assetsOutDir, rewriting the same `dataUrl`
// field name lib/site-render.js's ported renderers read -- see that file's
// header for why that keeps every renderer byte-for-byte unmodified. The
// filename IS the content hash, so two references to the same image (two
// slots, two pages, even two separate export runs) write the same file
// once -- real deduplication, not merely "don't double count". Never reads
// anything but already-resolved blobs already sitting in
// data/asset-store/ -- never calls the image-generation provider.
function hydrateAssetsForExport(db, direction, assetsOutDir) {
  const manifestAssets = [];
  const written = new Set();
  const assetStore = getAssetStore();
  function resolveEntry(entry) {
    if (!entry || typeof entry.assetRef !== 'string') return entry;
    const row = db.assetBlobs.find(entry.assetRef);
    if (!row) return entry; // referenced blob genuinely missing -- degrade to no image, same as lib/project-store.js's hydrateOneEntry
    const ext = CONTENT_TYPE_EXT[row.content_type] || 'bin';
    const fileName = `${entry.assetRef}.${ext}`;
    if (!written.has(fileName)) {
      written.add(fileName);
      fs.mkdirSync(assetsOutDir, { recursive: true });
      const destPath = path.join(assetsOutDir, fileName);
      // Goes through the AssetStore adapter, never a hard-coded filesystem
      // path -- the compiler doesn't care whether the bytes came from local
      // disk or a real object-storage service behind the same interface.
      if (!fs.existsSync(destPath)) {
        const buf = assetStore.get(entry.assetRef);
        if (buf) fs.writeFileSync(destPath, buf);
      }
      manifestAssets.push({ hash: entry.assetRef, contentType: row.content_type, byteLength: row.byte_length, path: `assets/${fileName}` });
    }
    const { assetRef, ...rest } = entry;
    return { ...rest, dataUrl: `assets/${fileName}` };
  }
  if (direction.assets) {
    direction.assets.items = (direction.assets.items || []).map(resolveEntry);
    const gen = direction.assets.generated || {};
    Object.keys(gen).forEach(slot => { gen[slot] = resolveEntry(gen[slot]); });
  }
  return manifestAssets;
}

function truncate(s, n) { s = String(s || ''); return s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s; }

// ---- Per-page HTML document -------------------------------------------------
// Ships the SAME #builderSite/data-*/inline-CSS-var skeleton index.html's
// own live preview uses (see index.html lines 142-144) -- this is what
// lets the existing, unmodified styles.css render this page identically
// with zero export-specific CSS of its own. SEO baseline (§22): title,
// meta description, OG basics, favicon (only if the project has a real
// uploaded/generated logo -- never SiteRemade's own brand asset), grounded
// in the project's OWN copy/category, never invented business claims.
function renderDocument({ direction, category, page, pageIndex, pages, businessName, routes }) {
  const pv = render.paletteVars(direction.design.palette || {});
  const styleAttr = Object.keys(pv).map(k => `${k}:${pv[k]}`).join(';');
  const dims = direction.design.dimensions || {};
  const dataAttrs = [
    `data-style="${render.escapeHtml((direction.intent && direction.intent.seedKey) || '')}"`,
    `data-hero="${render.escapeHtml(dims.hero || 'split')}"`,
    `data-type="${render.escapeHtml(dims.type || '')}"`,
    `data-nav="${render.escapeHtml(dims.nav || '')}"`,
    `data-card="${render.escapeHtml(dims.card || '')}"`,
    `data-imagery="${render.escapeHtml(dims.imagery || '')}"`,
    `data-cta="${render.escapeHtml(dims.cta || '')}"`,
    `data-colorBehavior="${render.escapeHtml(dims.colorBehavior || '')}"`,
    `data-motion="${render.escapeHtml(dims.motion || 'none')}"`,
    `data-spacing="${render.escapeHtml(dims.spacing || '')}"`,
    `data-pattern="${render.escapeHtml(dims.pattern || '')}"`,
    `data-layout="${render.escapeHtml((direction.design && direction.design.heroLayout) || 'split')}"`,
  ].join(' ');
  const isHome = pageIndex === 0;
  const bodyHtml = render.renderPageBody(direction, page, isHome, category);
  const plan = direction.assets.plan || {};
  const logoAsset = plan.logo ? (direction.assets.items || []).find(a => a.id === plan.logo) : null;
  const navLinksHtml = pages.length > 1
    ? render.renderNavHtml(pages, pageIndex)
    : (page.sections || []).map(s => ['services', 'gallery', 'about'].includes(s.type) ? `<span>${render.escapeHtml(render.navLabelFor(s.type, direction.business.categoryKey))}</span>` : '').join('');
  const navCtaLabel = render.escapeHtml((direction.copy && direction.copy.cta) || category.cta);
  const businessLine = render.escapeHtml((direction.copy && direction.copy.headline) || category.headline);
  const title = render.escapeHtml(`${businessName} — ${(direction.copy && direction.copy.headline) || category.headline}`);
  const description = render.escapeHtml(truncate((direction.copy && direction.copy.sub) || category.sub, 160));
  const faviconLink = (logoAsset && logoAsset.dataUrl) ? `<link rel="icon" href="${render.escapeHtml(logoAsset.dataUrl)}">` : '';
  const routesJson = JSON.stringify(routes).replace(/</g, '\\u003c');
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title}</title>
<meta name="description" content="${description}">
<meta property="og:type" content="website">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${description}">
${faviconLink}
<link rel="stylesheet" href="styles.css">
</head>
<body>
<div class="builder-site" id="builderSite" ${dataAttrs} style="${styleAttr}">
  <div class="site-nav" id="siteNav">
    <div class="site-brand-lockup">${(logoAsset && logoAsset.dataUrl) ? `<img id="siteLogo" class="active" alt="${render.escapeHtml(businessName)} logo" src="${render.escapeHtml(logoAsset.dataUrl)}" />` : ''}<strong id="siteBusiness"${logoAsset ? ' class="logo-active"' : ''}>${render.escapeHtml(businessName.toUpperCase())}</strong></div>
    <div id="siteNavLinks">${navLinksHtml}</div>
    <button type="button" id="siteNavCta">${navCtaLabel}</button>
  </div>
  <div id="siteSectionsRoot">${bodyHtml}</div>
</div>
<script>window.__SITE_ROUTES = ${routesJson};</script>
<script src="site.js"></script>
</body>
</html>
`;
}

function buildRobots() { return 'User-agent: *\nAllow: /\n'; }
// No real domain is known at export time -- rather than fabricate one,
// <loc> uses a clearly-labelled placeholder host with an explicit
// instruction to fix it once the site has a real domain (see the
// generated README.md, which repeats this).
function buildSitemap(pages) {
  const urls = pages.map((p, i) => `  <url><loc>https://your-domain-here.example/${i === 0 ? '' : render.pageFileName(p, i)}</loc></url>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<!-- Replace "your-domain-here.example" with your real domain once this site is live. -->\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

// ---- Client runtime shipped with every export (new -- has no script.js ----
// equivalent: the live app is a single-page in-memory editor with its own
// moduleRuntimeState Map/switchPage; an export is real separate HTML pages
// with no editor and no in-memory project object, so navigation and form
// submission have to work from plain, real browser APIs instead). Ships
// unchanged in BOTH static and server-required packages (module forms only
// ever exist in a server_required package by construction -- see
// lib/runtime-classifier.js -- so the submit-handling code is simply never
// exercised in a static package, not a risk of silently faking anything).
const SITE_RUNTIME_JS = `// Generated by SiteRemade -- static site runtime. No editor, no account
// system, no generator logic: page navigation, CTA targets, and (only on a
// server-required export) real module-form submission.
(function () {
  'use strict';
  var routes = window.__SITE_ROUTES || {};
  document.addEventListener('click', function (event) {
    var cta = event.target.closest('[data-cta-kind]');
    if (!cta) return;
    var kind = cta.dataset.ctaKind;
    if (kind === 'page') {
      var target = routes[cta.dataset.ctaPageId];
      if (target) window.location.href = target;
    } else if (kind === 'section') {
      var targetPage = routes[cta.dataset.ctaPageId];
      var here = window.location.pathname.split('/').pop() || 'index.html';
      if (targetPage && targetPage !== here) {
        window.location.href = targetPage + '#module-' + cta.dataset.ctaSectionId;
      } else {
        var el = document.getElementById('module-' + cta.dataset.ctaSectionId);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
  });
  if (window.location.hash.indexOf('#module-') === 0) {
    var target = document.getElementById(window.location.hash.slice(1));
    if (target) target.scrollIntoView({ block: 'start' });
  }

  var MAX_LEN = { text: 120, email: 180, tel: 40, textarea: 1000, select: 60, date: 20, time: 20 };
  function validateEmail(v) { return /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(String(v || '').trim()); }
  function validatePhone(v) { var d = String(v || '').replace(/[^\\d]/g, ''); return d.length >= 7 && d.length <= 15; }
  function validateField(kind, required, value, label) {
    var v = String(value == null ? '' : value).slice(0, MAX_LEN[kind] || 200);
    if (required && !v.trim()) return { valid: false, error: (label || 'This field') + ' is required.' };
    if (!v.trim()) return { valid: true, value: '' };
    if (kind === 'email' && !validateEmail(v)) return { valid: false, error: 'Enter a valid email address.' };
    if (kind === 'tel' && !validatePhone(v)) return { valid: false, error: 'Enter a valid phone number.' };
    return { valid: true, value: v };
  }
  document.addEventListener('submit', function (event) {
    var form = event.target.closest('[data-module-form]');
    if (!form) return;
    event.preventDefault();
    var wrapper = form.closest('.site-section-module');
    var fields = Array.prototype.slice.call(form.querySelectorAll('[data-field-key]'));
    var values = {}, errors = {}, firstBad = null;
    fields.forEach(function (el) {
      var label = (form.querySelector('label[for="' + el.id + '"]') || {}).textContent || el.dataset.fieldKey;
      var kind = el.tagName === 'SELECT' ? 'select' : el.tagName === 'TEXTAREA' ? 'textarea' : (el.type || 'text');
      var result = validateField(kind, el.required, el.value, label);
      var errEl = document.getElementById(el.getAttribute('aria-describedby'));
      if (!result.valid) {
        errors[el.dataset.fieldKey] = result.error;
        el.setAttribute('aria-invalid', 'true');
        if (errEl) errEl.textContent = result.error;
        if (!firstBad) firstBad = el;
      } else {
        el.removeAttribute('aria-invalid');
        if (errEl) errEl.textContent = '';
        values[el.dataset.fieldKey] = result.value;
      }
    });
    if (firstBad) { firstBad.focus(); return; }
    var btn = form.querySelector('.module-submit-btn');
    var errBanner = form.querySelector('.module-submit-error');
    fields.forEach(function (el) { el.disabled = true; });
    if (btn) { btn.disabled = true; btn.textContent = 'Sending…'; }
    if (errBanner) { errBanner.hidden = true; errBanner.textContent = ''; }
    fetch('/api/submit/' + encodeURIComponent(form.dataset.sectionId), {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(values)
    }).then(function (res) { return res.json().then(function (body) { return { status: res.status, body: body }; }); })
      .then(function (r) {
        if (r.body && r.body.ok) {
          var successEl = wrapper.querySelector('.module-success');
          form.hidden = true;
          if (successEl) {
            successEl.hidden = false;
            successEl.innerHTML = '<p>' + (successEl.dataset.successMessage || 'Thanks — we received that.') + '</p><p class="module-preview-note">' + (successEl.dataset.integrationNote || '') + '</p>';
            successEl.focus();
          }
        } else {
          fields.forEach(function (el) { el.disabled = false; });
          if (btn) { btn.disabled = false; btn.textContent = btn.dataset.idleLabel || 'Submit'; }
          if (errBanner) { errBanner.hidden = false; errBanner.textContent = (r.body && r.body.message) || 'Something went wrong. Please try again.'; }
        }
      }).catch(function () {
        fields.forEach(function (el) { el.disabled = false; });
        if (btn) { btn.disabled = false; btn.textContent = btn.dataset.idleLabel || 'Submit'; }
        if (errBanner) { errBanner.hidden = false; errBanner.textContent = 'Could not submit right now. Please try again.'; }
      });
  });
})();
`;

// ---- Server-required extras (§8/§9/§28) ------------------------------------
// A minimal, standalone Node HTTP server -- core modules only (this repo's
// own no-new-npm-dependency constraint, and this sandbox genuinely has no
// npm access -- see lib/db.js's own comment). Serves the compiled static
// files AND exposes one narrow POST /api/submit/:sectionId endpoint per
// enabled module, validated against the SAME field vocabulary/limits the
// live app itself uses (MODULE_FIELD_MAX_LEN/validateEmail/validatePhone),
// baked in at export time from the project's OWN module configuration --
// never a generic "accept anything" form-to-email relay, and never a copy
// of the SiteRemade generator backend (no /api/plan-website, no auth, no
// Stripe, no asset store).
//
// V8.7: submission delivery is now a SubmissionProvider (mirrors this
// repo's own DatabaseAdapter/AssetStore/AuthProvider selector pattern --
// see lib/adapters/*.js), selected at RUNTIME by the exported site's own
// operator via SUBMISSION_BACKEND, never baked in at export/compile time
// (the compiling account has no way to know, at export time, whether the
// person who eventually self-hosts this package will want local-only
// storage or a real webhook target -- that's an operational decision for
// whoever runs `node server.js`, not a generator-time one).
//   - "local" (default): unchanged V8.6 behavior -- validate, then persist
//     to data/submissions.jsonl. No network call, nothing "sent" anywhere.
//   - "webhook": a REAL, working production provider (not a stub -- the
//     exported site has no npm dependencies, but Node's own core `http`/
//     `https` modules are enough to actually deliver a submission over the
//     network, so this is implemented for real, not merely contracted).
//     POSTs the validated, bound submission (sectionId, module type, field
//     values, and this export's own projectId/artifactHash/revision -- so
//     whatever receives it can tell which site and which build produced
//     it) as JSON to SUBMISSION_WEBHOOK_URL, optionally HMAC-signed with
//     SUBMISSION_WEBHOOK_SECRET. Returns ok:true ONLY if the webhook
//     endpoint actually answered with a 2xx status -- a network failure or
//     a non-2xx response is reported to the visitor as a real failure
//     (502), never silently swallowed into a fake success message.
// Fails closed at startup: SUBMISSION_BACKEND=webhook with no
// SUBMISSION_WEBHOOK_URL configured refuses to start rather than quietly
// falling back to local-file storage -- same fail-closed discipline this
// repo's own lib/adapters/database-adapter.js applies to
// SITEREMADE_BACKEND=production.
function buildServerJs({ moduleRegistry, projectId, artifactHash, revision }) {
  const registryJson = JSON.stringify(moduleRegistry, null, 2);
  return `// Generated by SiteRemade -- minimal standalone server for a
// server-required export. Node core modules only, no npm dependencies.
// Serves the compiled site and accepts real module-form submissions.
// Honest about what it is: by default it only saves submissions to a
// local file (data/submissions.jsonl) -- it does NOT relay them to any
// email/CRM/third-party integration unless you explicitly configure
// SUBMISSION_BACKEND=webhook + SUBMISSION_WEBHOOK_URL below. See
// README.md's "Form submissions" section.
'use strict';
const http = require('http');
const https = require('https');
const { URL } = require('url');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, 'data');
const SUBMISSIONS_FILE = path.join(DATA_DIR, 'submissions.jsonl');
const PORT = process.env.PORT ? Number(process.env.PORT) : 8080;
const MAX_LEN = { text: 120, email: 180, tel: 40, textarea: 1000, select: 60, date: 20, time: 20 };
const MODULE_REGISTRY = ${registryJson};
const EXPORT_PROJECT_ID = ${JSON.stringify(projectId)};
const EXPORT_ARTIFACT_HASH = ${JSON.stringify(artifactHash)};
const EXPORT_REVISION = ${JSON.stringify(revision)};

// ---- SubmissionProvider selection (see this generator's own comment in
// lib/export-compiler.js's buildServerJs for the full rationale) ----------
const SUBMISSION_BACKEND = process.env.SUBMISSION_BACKEND || 'local';
const SUBMISSION_WEBHOOK_URL = process.env.SUBMISSION_WEBHOOK_URL || '';
const SUBMISSION_WEBHOOK_SECRET = process.env.SUBMISSION_WEBHOOK_SECRET || '';
if (SUBMISSION_BACKEND !== 'local' && SUBMISSION_BACKEND !== 'webhook') {
  console.error('Invalid SUBMISSION_BACKEND "' + SUBMISSION_BACKEND + '" -- must be "local" or "webhook". Refusing to start.');
  process.exit(1);
}
if (SUBMISSION_BACKEND === 'webhook' && !SUBMISSION_WEBHOOK_URL) {
  console.error('SUBMISSION_BACKEND=webhook requires SUBMISSION_WEBHOOK_URL to be set. Refusing to start rather than silently falling back to local file storage -- see README.md.');
  process.exit(1);
}
const submissionProviders = {
  // Sandbox/local provider -- unchanged V8.6 behavior: a real, durable
  // local write, nothing more claimed.
  local: {
    submit(record) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      fs.appendFileSync(SUBMISSIONS_FILE, JSON.stringify(record) + '\\n');
      return Promise.resolve({ ok: true });
    },
  },
  // Real production provider -- an actual HTTP(S) POST using only Node's
  // core modules, not a fabricated "connected" state. ok:true is returned
  // ONLY when the remote endpoint actually answers with a 2xx status.
  webhook: {
    submit(record) {
      return new Promise((resolve) => {
        let target;
        try { target = new URL(SUBMISSION_WEBHOOK_URL); } catch (e) {
          resolve({ ok: false, error: 'Invalid SUBMISSION_WEBHOOK_URL.' }); return;
        }
        const payload = JSON.stringify(record);
        const lib = target.protocol === 'http:' ? http : https;
        const headers = { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) };
        if (SUBMISSION_WEBHOOK_SECRET) {
          headers['X-SiteRemade-Signature'] = crypto.createHmac('sha256', SUBMISSION_WEBHOOK_SECRET).update(payload).digest('hex');
        }
        let req;
        try {
          req = lib.request(target, { method: 'POST', headers }, (res) => {
            res.resume(); // drain -- webhook receivers' own response body is not part of this contract
            if (res.statusCode >= 200 && res.statusCode < 300) resolve({ ok: true });
            else resolve({ ok: false, error: 'Webhook responded with status ' + res.statusCode + '.' });
          });
        } catch (e) { resolve({ ok: false, error: 'Webhook request could not be sent: ' + e.message }); return; }
        req.on('error', (e) => resolve({ ok: false, error: 'Webhook request failed: ' + e.message }));
        req.setTimeout(10000, () => req.destroy(new Error('Webhook request timed out.')));
        req.write(payload);
        req.end();
      });
    },
  },
};
const activeSubmissionProvider = submissionProviders[SUBMISSION_BACKEND];

function validateEmail(v) { return /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(String(v || '').trim()); }
function validatePhone(v) { const d = String(v || '').replace(/[^\\d]/g, ''); return d.length >= 7 && d.length <= 15; }
function validateSubmission(module, raw) {
  const errors = {}; const values = {};
  (module.fields || []).forEach(f => {
    let v = String((raw && raw[f.key]) == null ? '' : raw[f.key]).slice(0, MAX_LEN[f.kind] || 200);
    if (f.required && !v.trim()) { errors[f.key] = f.label + ' is required.'; return; }
    if (v.trim()) {
      if (f.kind === 'email' && !validateEmail(v)) { errors[f.key] = 'Enter a valid email address.'; return; }
      if (f.kind === 'tel' && !validatePhone(v)) { errors[f.key] = 'Enter a valid phone number.'; return; }
    }
    values[f.key] = v;
  });
  return { valid: Object.keys(errors).length === 0, errors, values };
}
function sendJson(res, status, obj) { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); }
function readJsonBody(req, maxBytes) {
  return new Promise((resolve, reject) => {
    let body = ''; let bytes = 0;
    req.on('data', c => { bytes += c.length; if (bytes > maxBytes) { reject(new Error('too_large')); req.destroy(); return; } body += c; });
    req.on('end', () => { try { resolve(body ? JSON.parse(body) : {}); } catch (e) { resolve({}); } });
    req.on('error', reject);
  });
}
const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.svg': 'image/svg+xml', '.xml': 'application/xml', '.txt': 'text/plain', '.ico': 'image/x-icon' };

const server = http.createServer(async (req, res) => {
  try {
    const urlPath = decodeURIComponent(req.url.split('?')[0]);
    if (req.method === 'POST' && urlPath.startsWith('/api/submit/')) {
      const sectionId = urlPath.slice('/api/submit/'.length);
      const module = MODULE_REGISTRY[sectionId];
      if (!module) return sendJson(res, 404, { ok: false, message: 'Unknown form.' });
      let raw;
      try { raw = await readJsonBody(req, 40 * 1024); } catch (e) { return sendJson(res, 413, { ok: false, message: 'Submission too large.' }); }
      const { valid, errors, values } = validateSubmission(module, raw);
      if (!valid) return sendJson(res, 400, { ok: false, message: 'Please fix the highlighted fields.', errors });
      const record = {
        sectionId, type: module.type, values, at: new Date().toISOString(), id: crypto.randomBytes(9).toString('base64url'),
        projectId: EXPORT_PROJECT_ID, artifactHash: EXPORT_ARTIFACT_HASH, revision: EXPORT_REVISION, provider: SUBMISSION_BACKEND,
      };
      const result = await activeSubmissionProvider.submit(record);
      if (!result.ok) return sendJson(res, 502, { ok: false, message: 'Could not deliver this submission right now. Please try again shortly.' });
      return sendJson(res, 200, { ok: true, message: module.successMessage });
    }
    // Static file serving -- traversal-safe: resolves against ROOT and
    // refuses anything that escapes it (defense in depth even though every
    // href this site itself emits is a fixed, compiler-generated path).
    let rel = urlPath === '/' ? '/index.html' : urlPath;
    const filePath = path.join(ROOT, rel);
    if (!filePath.startsWith(ROOT + path.sep) && filePath !== path.join(ROOT, 'index.html')) { res.writeHead(403); res.end('forbidden'); return; }
    fs.readFile(filePath, (err, data) => {
      if (err) { res.writeHead(404); res.end('not found'); return; }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream' });
      res.end(data);
    });
  } catch (e) {
    try { sendJson(res, 500, { ok: false, message: 'Server error.' }); } catch (e2) { /* already sent */ }
  }
});
server.listen(PORT, () => console.log('Site running on port ' + PORT));
`;
}
function buildPackageJson(slug) {
  return JSON.stringify({ name: `${slug || 'siteremade-export'}-site`, private: true, version: '1.0.0', description: 'Exported SiteRemade website.', scripts: { start: 'node server.js' }, engines: { node: '>=18' } }, null, 2) + '\n';
}
function buildReadme({ runtimeType, businessName }) {
  const common = `# ${businessName} — exported website\n\nThis is a real, standalone export of your SiteRemade website. It does not depend on the SiteRemade editor, your account, or any SiteRemade backend.\n\n`;
  if (runtimeType === 'static') {
    return common + `## Hosting\n\nThis is a static site: index.html, any additional page files, styles.css, site.js, and an assets/ folder. Upload the contents of this folder to any static host (see export-manifest.json for the technical requirements a hosting recommendation is based on).\n\nBefore going live, update sitemap.xml's placeholder domain to your real one.\n`;
  }
  return common + `## Hosting\n\nThis site needs a live Node.js runtime (it has real, functioning contact/quote/booking/newsletter form(s) -- see export-manifest.json's runtimeReasons). It has no npm dependencies.\n\n### Run it\n\n\`\`\`\nnode server.js\n\`\`\`\n\nIt listens on the PORT environment variable, or 8080.\n\n### Form submissions\n\nBy default (SUBMISSION_BACKEND=local, or unset), submissions are validated server-side and saved to data/submissions.jsonl only -- nothing is sent anywhere else.\n\nTo actually deliver submissions to your own email/CRM/automation system, set:\n\n- \`SUBMISSION_BACKEND=webhook\`\n- \`SUBMISSION_WEBHOOK_URL\` -- the HTTPS endpoint that will receive each validated submission as a JSON POST (fields, form type, and this export's projectId/artifactHash/revision)\n- \`SUBMISSION_WEBHOOK_SECRET\` (optional) -- if set, each request is signed with an \`X-SiteRemade-Signature\` HMAC-SHA256 header so your endpoint can verify it came from this server\n\nIf SUBMISSION_BACKEND=webhook is set without SUBMISSION_WEBHOOK_URL, the server refuses to start rather than silently falling back to local-only storage. A submission is only reported as successful to your visitor once the configured backend actually confirms it (a real local file write, or a real 2xx response from your webhook) -- a failed delivery is reported as a real failure, never hidden.\n\nBefore going live, update sitemap.xml's placeholder domain to your real one.\n`;
}

// ---- Top-level orchestration ------------------------------------------------
// `project` is lib/project-store.js's getOwnedProjectRaw shape (ownership
// already checked by the caller -- this function does no auth/ownership
// work of its own, exactly like lib/project-store.js's own CRUD
// functions). `directionIndex` defaults to the direction's own
// activeDirectionIndex if not supplied.
function compileExport(db, { project, directionIndex, workDir }) {
  const directionsState = project.directionsState;
  const directions = (directionsState && directionsState.directions) || [];
  const idx = Number.isInteger(directionIndex) ? directionIndex : (directionsState.activeDirectionIndex || 0);
  if (!directions.length || idx < 0 || idx >= directions.length) {
    throw Object.assign(new Error('Invalid direction index for this project.'), { code: 'INVALID_DIRECTION' });
  }
  const rawDirection = directions[idx];
  const { runtimeType, runtimeReasons } = classifyRuntime(rawDirection);
  const artifactHash = computeArtifactHash({ projectId: project.id, directionIndex: idx, direction: rawDirection, runtimeType, runtimeReasons });

  fs.rmSync(workDir, { recursive: true, force: true });
  fs.mkdirSync(workDir, { recursive: true });

  const direction = JSON.parse(JSON.stringify(rawDirection)); // never mutate the persisted row
  const assets = hydrateAssetsForExport(db, direction, path.join(workDir, 'assets'));
  const category = render.categoryFor(direction);
  const pages = (direction.pages || []).slice(0, MAX_PAGES_EXPORT);
  if (!pages.length) throw Object.assign(new Error('This project has no pages to export.'), { code: 'NO_PAGES' });

  const routes = {};
  pages.forEach((p, i) => { routes[p.id] = render.pageFileName(p, i); });
  const businessName = (direction.business && direction.business.name) || 'Your Business';

  fs.writeFileSync(path.join(workDir, 'styles.css'), fs.readFileSync(path.join(__dirname, '..', 'styles.css')));
  fs.writeFileSync(path.join(workDir, 'site.js'), SITE_RUNTIME_JS);
  pages.forEach((page, i) => {
    fs.writeFileSync(path.join(workDir, render.pageFileName(page, i)), renderDocument({ direction, category, page, pageIndex: i, pages, businessName, routes }));
  });
  fs.writeFileSync(path.join(workDir, 'robots.txt'), buildRobots());
  fs.writeFileSync(path.join(workDir, 'sitemap.xml'), buildSitemap(pages));

  const moduleRegistry = {}; // sectionId -> {type, successMessage, fields:[{key,label,kind,required}]}
  const moduleSummaries = [];
  pages.forEach(p => (p.sections || []).forEach(s => {
    if (s.module && s.module.enabled) {
      moduleRegistry[s.id] = {
        type: s.module.type,
        successMessage: (s.module.successState && s.module.successState.message) || render.escapeHtml(''),
        fields: (s.module.fields || []).map(f => ({ key: f.key, label: f.label, kind: f.kind, required: !!f.required })),
      };
      moduleSummaries.push({ pageId: p.id, sectionId: s.id, type: s.module.type, provider: 'local (default) -- see manifest.submissionBackend', fields: (s.module.fields || []).map(f => f.key) });
    }
  }));

  const exportedAt = nowIso();
  const manifest = {
    projectId: project.id,
    exportedRevision: project.revision,
    directionIndex: idx,
    exportTimestamp: exportedAt,
    compilerVersion: COMPILER_VERSION,
    artifactHash,
    runtimeType, runtimeReasons,
    pages: pages.map((p, i) => ({ id: p.id, label: p.label, slug: p.slug || '', route: render.pageFileName(p, i) })),
    assets: assets.map(a => ({ hash: a.hash, contentType: a.contentType, byteLength: a.byteLength, path: a.path })),
    functionalityModules: moduleSummaries,
    requiredEnvVars: runtimeType === 'server_required' ? ['PORT (optional, defaults to 8080)'] : [],
    configuredIntegrations: [],
    unconfiguredIntegrations: moduleSummaries.length ? Array.from(new Set(moduleSummaries.map(m => m.type))) : [],
    // V8.7: submission delivery is a runtime choice made by whoever
    // self-hosts this export (see server.js's own SubmissionProvider
    // selection), not something baked in at compile time -- this block
    // documents the two real options rather than claiming either is active.
    submissionBackend: runtimeType === 'server_required' ? {
      default: 'local', options: ['local', 'webhook'],
      selectVia: 'SUBMISSION_BACKEND environment variable',
      webhookEnvVars: ['SUBMISSION_WEBHOOK_URL (required for webhook)', 'SUBMISSION_WEBHOOK_SECRET (optional, HMAC-signs each delivery)'],
      note: 'local (default) only writes to data/submissions.jsonl. webhook performs a real HTTP(S) POST and fails closed at startup if SUBMISSION_WEBHOOK_URL is missing -- it never silently falls back to local storage.',
    } : null,
    build: runtimeType === 'server_required'
      ? { runtime: 'node>=18', installCommand: null, buildCommand: null, startCommand: 'node server.js' }
      : { runtime: 'static', installCommand: null, buildCommand: null, startCommand: null },
  };
  fs.writeFileSync(path.join(workDir, 'export-manifest.json'), JSON.stringify(manifest, null, 2));
  fs.writeFileSync(path.join(workDir, 'README.md'), buildReadme({ runtimeType, businessName }));

  if (runtimeType === 'server_required') {
    fs.writeFileSync(path.join(workDir, 'server.js'), buildServerJs({ moduleRegistry, projectId: project.id, artifactHash, revision: project.revision }));
    fs.writeFileSync(path.join(workDir, 'package.json'), buildPackageJson((direction.pages[0] && direction.pages[0].slug) || businessName.toLowerCase().replace(/[^a-z0-9]+/g, '-')));
  }

  return { manifest, workDir, runtimeType, runtimeReasons, artifactHash, pages };
}

module.exports = {
  COMPILER_VERSION, compileExport, classifyRuntime, hydrateAssetsForExport, computeArtifactHash, stableStringify,
};
