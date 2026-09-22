const express = require('express');
const path = require('path');
const crypto = require('crypto');

// V8.5: durable account/project/purchase persistence -- see
// SITE-PROJECT-V8.5.md part 1 for why this is a real, hand-rolled,
// no-npm-dependency backend (auth, SQLite via node:sqlite, purchase-intent
// binding, hand-rolled Stripe webhook verification) scoped to THIS sandbox
// app, rather than wired to the separate, real production SiteRemade app's
// own Supabase project -- the same "don't touch the production app/
// database casually" boundary V8/V6 already established for the anonymous
// generation ledger below.
// V8.7: server.js talks to a DatabaseAdapter, not a raw node:sqlite handle
// -- see lib/adapters/database-adapter.js. SITEREMADE_BACKEND selects which
// implementation ('local' by default, matching every prior version's
// behavior exactly); domain modules below are unchanged in how they're
// called (still `fn(db, ...)`), only what `db` unlocks internally changed.
const { getDatabaseAdapter } = require('./lib/adapters/database-adapter.js');
const { getAuthProvider } = require('./lib/adapters/auth-provider.js');
const authProvider = getAuthProvider();
const projectStore = require('./lib/project-store.js');
const purchase = require('./lib/purchase.js');
const entitlement = require('./lib/entitlement.js');
// V8.6: export + deployment packaging + hosting/domain handoff -- see
// SITE-PROJECT-V8.6.md. Reuses this exact same database/ownership layer
// (no parallel backend), exactly like V8.5's own modules above.
const fs = require('fs');
const exportCompiler = require('./lib/export-compiler.js');
const deploymentStore = require('./lib/deployment-store.js');
const hosting = require('./lib/hosting.js');
const runtimeClassifier = require('./lib/runtime-classifier.js');
const domainLib = require('./lib/domain.js');
const { zipDirectory } = require('./lib/archive.js');

const app = express();
const PORT = process.env.PORT || 8080;
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;
// A real file-backed database by default (durable across restarts, which
// is the entire point) -- DB_PATH lets a test harness point this at a
// throwaway file or ':memory:' instead, without touching this file.
// SITEREMADE_BACKEND=production instead gets the production adapter
// contract, which fails closed immediately if required config is missing
// (see lib/adapters/production-database-adapter.js) -- never a silent
// fallback to this local database.
const db = getDatabaseAdapter(process.env.SITEREMADE_DB_PATH);

app.disable('x-powered-by');
// V8.5's Stripe webhook route needs the EXACT raw request bytes to verify
// Stripe's HMAC signature (JSON.stringify(JSON.parse(raw)) is not
// guaranteed byte-identical to what Stripe actually sent) -- mounted
// before the generic JSON parser below so it claims that one route first.
app.use('/api/stripe/webhook', express.raw({ type: 'application/json', limit: '2mb' }));
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

// ---- V8: anonymous id for metering expensive AI actions --------------------
// No auth/session infrastructure exists in this app yet (see
// SITE-PROJECT-V8.md part 7/8 for the full audit) -- this is the smallest
// real mechanism that is NOT "a counter in localStorage the visitor can
// clear": a first-party, HttpOnly cookie the browser cannot read or edit,
// naming an id the visitor cannot see or forge, checked against a
// server-side ledger before any Claude call happens (so clearing the
// browser's localStorage, or lying in a request body, cannot buy more free
// generations -- only clearing the actual HttpOnly cookie can, which is the
// honestly-stated limit of this pass; see the report for the durable,
// account-aware path this is designed to grow into without a reshape).
// No cookie-parsing dependency is added -- this app already avoids npm
// packages where a few lines of plain code cover it (see the Stripe/OpenAI
// blocks below).
const ANON_COOKIE = 'siteremade_anon';
function getCookie(req, name) {
  const header = req.headers.cookie || '';
  const match = header.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : null;
}
function ensureAnonId(req, res) {
  let id = getCookie(req, ANON_COOKIE);
  if (!id || !/^[a-f0-9-]{36}$/.test(id)) {
    id = crypto.randomUUID();
    // 1 year, HttpOnly (never readable/forgeable from the browser), Lax (so
    // it survives normal top-level navigation, e.g. after Stripe redirect).
    res.setHeader('Set-Cookie', `${ANON_COOKIE}=${id}; Max-Age=31536000; Path=/; HttpOnly; SameSite=Lax`);
  }
  return id;
}
// In-memory ledger: one entry per anonymous id. This is intentionally NOT
// the durable mechanism (it resets on every deploy/restart and does not
// share state across horizontally-scaled instances) -- it is real
// server-side enforcement for THIS pass, honestly scoped, with the durable
// upgrade path (a small table keyed by anon id / account id) documented
// rather than built, per the instruction not to touch the production
// Supabase app casually. See SITE-PROJECT-V8.md part 8.
//
// V8.1 naming/semantics note (see SITE-PROJECT-V8.1.md): the real product
// rule is "3 website directions total," not "3 Claude calls." The
// AUTHORITATIVE 3-direction cap is enforced client-side (script.js's
// `directions.length`), because a fully-deterministic direction (Claude
// unconfigured, or the client's own cap already reached before it would
// even try) never talks to this server at all -- there is no request for
// this ledger to count. What this ledger DOES track honestly is "how many
// times has THIS visitor successfully had Claude plan a direction" -- a
// useful, real signal (it's what lets the diversity prompt know how many
// prior directions to describe, and it's a real, if partial, brake on paid
// Claude usage specifically) but not a claim that it is the total-direction
// counter. `MAX_DIRECTIONS` here matches the client's own cap only because
// both are meant to describe "3," not because this counter enforces it.
const MAX_DIRECTIONS = 3;
const directionsLedger = new Map();
function getDirectionsLedgerEntry(anonId) {
  let entry = directionsLedger.get(anonId);
  if (!entry) { entry = { claudeDirectionsUsed: 0, signatures: [], history: [] }; directionsLedger.set(anonId, entry); }
  return entry;
}

// ---- V8.5: authenticated identity -------------------------------------
// The ONLY place a request's account identity is ever established --
// every ownership check downstream reads `req.accountId`, which is always
// either null (anonymous, unauthenticated) or a real, server-verified
// account id resolved from a signed, HttpOnly session cookie. Nothing
// downstream of this ever trusts a client-supplied user/owner id from a
// request body, header, or query string (see SITE-PROJECT-V8.5.md
// "security" / "ownership invariant").
// V8.7: delegates to the AuthProvider's shared getCurrentAccount (see
// lib/adapters/local-auth-provider.js) instead of hand-rolling the same
// cookie-parse-then-resolveSession logic mock-server.js also used to
// duplicate -- one real implementation instead of two copies.
function getSessionAccount(req) {
  return authProvider.getCurrentAccount(db, req);
}
// Attaches req.accountId/req.accountEmail (or null) without refusing the
// request -- used on routes that behave differently for anonymous vs.
// authenticated callers (e.g. /api/plan-website's entitlement branch)
// without making auth mandatory for them.
function withOptionalAuth(req, res, next) {
  const session = getSessionAccount(req);
  req.accountId = session ? session.accountId : null;
  req.accountEmail = session ? session.email : null;
  next();
}
// Refuses outright (401) when no valid session is present -- used on every
// route that only makes sense for an owned resource.
function requireAuth(req, res, next) {
  const session = getSessionAccount(req);
  if (!session) return res.status(401).json({ ok: false, message: 'Sign in required.' });
  req.accountId = session.accountId;
  req.accountEmail = session.email;
  next();
}
// A lightweight, real same-origin check for every state-changing
// authenticated route -- the CSRF strategy appropriate to this session
// model (an HttpOnly, SameSite=Lax cookie plus a JSON-only API with no
// CORS headers ever exposing it cross-origin -- see
// SITE-PROJECT-V8.5.md "security"). SameSite=Lax already blocks the classic
// cross-site form-POST case; this adds a second, independent check: a
// present Origin (or, failing that, Referer) header must match this
// server's own origin. Genuinely absent on both (some legitimate same-
// origin fetches in older browsers) is allowed through, matching a
// pragmatic, documented, non-bank-grade posture -- not a claim of
// completeness beyond what's stated in the report.
function requireSameOrigin(req, res, next) {
  const expected = `${req.protocol}://${req.get('host')}`;
  const origin = req.headers.origin;
  const referer = req.headers.referer;
  if (origin && origin !== expected) return res.status(403).json({ ok: false, message: 'Cross-origin request refused.' });
  if (!origin && referer && !referer.startsWith(expected)) return res.status(403).json({ ok: false, message: 'Cross-origin request refused.' });
  next();
}
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

// ---- V8: Claude website-planning provider ----------------------------------
// A clean, isolated abstraction, same shape/spirit as the image-provider
// block above: a real interface, a server-only key, and an honest
// `configured()` check rather than faking a plan when none can be produced.
// Audited before writing this (SITE-PROJECT-V8.md part 1): unlike
// api.openai.com (blocked by this sandbox's egress policy), api.anthropic.com
// IS network-reachable from here. `configured()` reflects the deployment's
// server-side `ANTHROPIC_API_KEY` configuration.
//
// Claude is asked for a PLAN, never code: the request forces a single tool
// call (`submit_website_plan`) whose JSON Schema enum-constrains every
// design-dimension field to the exact vocabulary the renderer already
// understands (see categoryDimensionDefaults/dimensionKeywords in script.js
// -- this list must stay in sync with that file). That schema is what makes
// the model's output structurally impossible to turn into arbitrary
// HTML/CSS, and what lets the normalization layer in script.js validate
// every field against a known-safe allowlist rather than trusting free text.
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5';
const plannerDiagnostics = { lastAttempt: null };

function categorizeAnthropicError(error) {
  const status = Number(error && error.status);
  const message = String(error && error.message || error || '').toLowerCase();
  if (error && error.name === 'AbortError' || /\btimeout\b|timed out|aborted/.test(message)) return 'timeout';
  if (status === 401 || status === 403 || /\bauth(?:entication|orization)?\b|api key|invalid x-api-key|permission/.test(message)) return 'auth_error';
  if (status === 429 || /rate limit|too many requests|rate_limited/.test(message)) return 'rate_limited';
  if (status === 400 || status === 404 || /invalid model|unknown model|model.*not found|endpoint.*not found|invalid endpoint/.test(message)) return 'invalid_model_or_endpoint';
  if (error && (error.code === 'ETIMEDOUT' || error.code === 'ECONNRESET' || error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') || /fetch failed|network|connect/.test(message)) return 'network_error';
  return 'provider_error';
}

function recordPlannerAttempt(attempt) {
  plannerDiagnostics.lastAttempt = {
    timestamp: new Date().toISOString(),
    ...attempt
  };
}

const HERO_KEYS = ['split','fullbleed-image','centered-oversized','stacked-image-below','asymmetric-offset','minimal-text-only','grid-dashboard','poster','collage','product-screenshot','editorial-rail'];
const TYPE_KEYS = ['geo-sans','serif-editorial','display-condensed','classic-serif-mix','mono-technical','humanist'];
const NAV_KEYS = ['inline','boxed-pill','minimal-until-scroll','sidebar','centered-logo'];
const CARD_KEYS = ['flat','bordered','elevated-shadow','image-led','numbered-editorial','outline-ghost'];
const IMAGERY_KEYS = ['abstract-geometric','photo-led-placeholder','illustration','texture-organic','grid-mosaic','technical-network','editorial-bold','atmospheric-warm','trade-proof','chart-financial','nature-cause','creative-collage','dashboard-ui'];
const CTA_KEYS = ['solid-pill','sharp-block','outline-ghost','underline-link','floating-badge'];
const COLOR_BEHAVIOR_KEYS = ['neutral-single-accent','high-contrast-mono-accent','warm-earth-multi-tone','dark-luxury-metallic'];
const MOTION_KEYS = ['none','subtle','expressive'];
const SPACING_KEYS = ['standard','compact','airy','generous'];
const PATTERN_KEYS = ['standard','proof-first','story-first','portfolio-first'];
const CONTENT_WIDTH_KEYS = ['contained','wide','edge-to-edge'];
const IMAGE_DOMINANCE_KEYS = ['supporting','balanced','dominant'];
const IMAGE_ARRANGEMENT_KEYS = ['single','stacked','mosaic','rail'];
const SECTION_RHYTHM_KEYS = ['steady','alternating','feature-band','editorial'];
const SECTION_ALIGNMENT_KEYS = ['left','center','split'];
const TYPOGRAPHY_SCALE_KEYS = ['compact','standard','display'];
const HEADING_WIDTH_KEYS = ['narrow','balanced','wide'];
const CARD_DENSITY_KEYS = ['airy','compact','mixed'];
const CARD_SHAPE_KEYS = ['square','soft','pill'];
const SPLIT_RATIO_KEYS = ['even','text-heavy','media-heavy'];
const CREATIVE_CONCEPT_KEYS = ['institutional-editorial','private-client-luxury','founder-focused','product-led-technical','expressive-creative-technology','enterprise-systems','intimate-editorial','chef-led-premium','portfolio-led','methodology-led','conversion-first','technical-product'];
const CREATIVE_MOOD_KEYS = ['restrained','warm','cinematic','energetic','precise','expressive','quiet-luxury'];
const CREATIVE_NARRATIVE_KEYS = ['editorial','expertise-first','portfolio-led','product-demo-led','credibility-first','conversion-first','founder-story-led','methodology-led','technical-product'];
const CREATIVE_IMAGE_STRATEGY_KEYS = ['photography-led','sparse-premium','editorial-lifestyle','people-team','product-ui','architecture-interior','macro-detail','project-portfolio','abstract-branded','mostly-typographic'];
const CREATIVE_SIGNATURE_KEYS = ['oversized-manifesto','asymmetric-index','editorial-image-rail','large-type-break','case-study-band','split-story','staggered-mosaic','media-interruption','process-timeline','visual-philosophy','product-showcase'];
const SECTION_TYPE_KEYS = ['proof','metrics','services','features','productShowcase','integrations','pricing','faq','process','gallery','caseStudies','imageLedEditorial','about','team','testimonial','testimonialsGrid','menu','reservationCta','serviceAreas','contact','newsletter','ctaBanner'];
// V8.4: the module vocabulary a section may optionally carry -- kept in
// exact sync with script.js's own MODULE_TYPE_KEYS/MODULE_FIELD_ALLOWLIST/
// INTEGRATION_PROVIDER_KEYS, the same one-for-one mirroring convention the
// HERO_KEYS/SECTION_TYPE_KEYS lists above already use. The schema only ever
// lets Claude pick a module TYPE and which of a fixed, already-safe field
// KEY to include -- never a field's label, input kind, validation, or any
// live credential/webhook/price/address; script.js's own
// normalizeSectionModuleFromClaude re-validates everything here again,
// independently, before any of it becomes real project state.
const MODULE_TYPE_KEYS = ['contact','quote','newsletter','booking','location','action','product'];
const MODULE_FIELD_KEYS = ['name','email','phone','message','service','description','preferredContact','date','time','partySize','notes'];
const INTEGRATION_PROVIDER_KEYS = ['calendly','shopify','square','stripe','mailchimp','google-maps'];

// ---- Generation-intelligence upgrade: business/audience/site-strategy and
// page/section-level reasoning ---------------------------------------------
// Additive to everything above -- no existing key was renamed or removed.
// `archetype` is deliberately NOT 1:1 with `categoryKey`: a "tech" business
// could be product-led-saas, portfolio (an agency), or trust-heavy-
// professional (an enterprise consultancy) -- the archetype is what actually
// drives page architecture and section grammar; categoryKey stays the fixed,
// deterministic renderer/palette lookup it always was (see buildGenerationPlan
// in script.js -- Claude's free-text business.category still never picks it).
const ARCHETYPE_KEYS = ['product-led-saas','service-business','premium-consultancy','editorial-brand','portfolio','ecommerce-showcase','local-conversion','trust-heavy-professional','launch-campaign','community-nonprofit','hospitality'];
const SOPHISTICATION_KEYS = ['general','informed','expert'];
const BUSINESS_SCOPE_KEYS = ['local','national','digital'];
const VISUAL_INTENSITY_KEYS = ['quiet','standard','bold'];
const INFORMATION_DENSITY_KEYS = ['compact','standard','spacious'];
// Why a section exists -- the "reasoning" layer sitting above its `type`.
// Two sections of the same type (e.g. two 'services') can carry different
// intent ('explain' the first time, 'compare' the second) which is what
// headlineRole/claims selection keys off, without inventing new render types.
const SECTION_INTENT_KEYS = ['introduce','explain','compare','prove','demonstrate','reassure','convert','educate','showcase','narrate'];
const HEADLINE_ROLE_KEYS = ['declarative','explanatory','benefit-led','proof-led','editorial','contrast','question'];
// Image roles: the original 4 (hero/product/team/gallery) stay valid --
// existing saved projects/cached prompts/normalizeClaudePlan lookups by role
// keep working unchanged -- these are ADDITIONS for why an image exists, not
// just where it sits, per SITE-PROJECT brief part "Visual storytelling".
const IMAGE_ROLE_KEYS = ['hero','product','team','gallery','atmosphere','process','founder','portfolio','location','texture','editorial','feature','beforeAfter'];
const FUNCTIONALITY_STATUS_KEYS = ['supportedNow','plannedIntegration','requiresCustomBuild'];

const WEBSITE_PLAN_TOOL = {
  name: 'submit_website_plan',
  description: 'Submit a structured plan for a small-business marketing website. Return structure and copy only -- never HTML, CSS, or code.',
  input_schema: {
    type: 'object',
    additionalProperties: false,
    required: ['business', 'strategy', 'heroCopy', 'visualDirection', 'creativeDirection', 'pages', 'imagePlan', 'functionalityPlan'],
    properties: {
      heroCopy: {
        type: 'object', additionalProperties: false,
        required: ['kicker', 'headline', 'sub', 'ctaLabel'],
        description: 'Copy for the site\'s single most prominent element, the hero. Persuasive positioning is fine; it must follow the same no-fabricated-facts rule as section copy.',
        properties: {
          kicker: { type: 'string', description: 'Short eyebrow label above the headline (a few words).' },
          headline: { type: 'string', description: 'The main hero headline -- the single most important line on the site, specific to this business.' },
          sub: { type: 'string', description: 'One supporting sentence under the headline.' },
          ctaLabel: { type: 'string', description: 'Primary call-to-action button label, e.g. "Get a quote", "Book a table".' }
        }
      },
      business: {
        type: 'object', additionalProperties: false,
        required: ['understanding', 'category', 'targetCustomer', 'positioning', 'tone', 'goals'],
        properties: {
          name: { type: 'string', description: 'Only if the business name was actually given.' },
          understanding: { type: 'string', description: 'One or two sentences: what this specific business actually is/does.' },
          category: { type: 'string', description: 'Closest fit -- used only for fallback/analytics, not a template lookup.' },
          targetCustomer: { type: 'string' },
          positioning: { type: 'string' },
          tone: { type: 'string', enum: ['professional', 'bold', 'friendly'] },
          goals: { type: 'array', items: { type: 'string' }, maxItems: 5 }
        }
      },
      declaredFacts: {
        type: 'object', additionalProperties: false,
        description: 'ONLY facts literally present in the business owner\'s own description. Omit any field not actually supplied -- never estimate or invent one.',
        properties: {
          years: { type: 'string' }, rating: { type: 'string' }, customerCount: { type: 'string' }, location: { type: 'string' },
          otherFacts: { type: 'array', items: { type: 'string' }, maxItems: 5 }
        }
      },
      // V9: site-strategy reasoning -- sits between `business` (what the
      // company IS) and `visualDirection`/`pages` (what the site LOOKS
      // like/CONTAINS). This is the layer that decides page architecture,
      // section intent and copy hierarchy; every field here should visibly
      // shape the pages/sections you submit below, not just describe them
      // after the fact.
      strategy: {
        type: 'object', additionalProperties: false,
        required: ['archetype', 'secondaryAudience', 'visitorIntent', 'primaryConversion', 'secondaryConversion', 'credibilityStrategy', 'sophisticationLevel', 'businessScope', 'proofStrategy', 'informationHierarchy'],
        description: 'How you reason about this business as a website problem, before deciding pages/sections. Pick the archetype that best matches how this site should actually work -- it is NOT a restatement of business.category.',
        properties: {
          archetype: { type: 'string', enum: ARCHETYPE_KEYS, description: 'The kind of site this business actually needs, independent of industry category -- e.g. a boutique law firm and a boutique interior designer might both be premium-consultancy; a local roofer and a local cleaner might both be local-conversion.' },
          secondaryAudience: { type: 'string', description: 'A real secondary visitor type, if one genuinely exists (e.g. "referral partners" alongside "homeowners"). Empty string if there truly is only one audience.' },
          visitorIntent: { type: 'string', description: 'What the visitor is actually trying to figure out when they land on this site.' },
          primaryConversion: { type: 'string', description: 'The one action this site most wants a visitor to take.' },
          secondaryConversion: { type: 'string', description: 'A real secondary action for a visitor not ready for the primary one yet (e.g. "join the newsletter" before "book a call"). Empty string if none is warranted.' },
          credibilityStrategy: { type: 'string', description: 'What will actually make this specific visitor trust this specific business -- proof, credentials, portfolio, warmth, scale, etc.' },
          sophisticationLevel: { type: 'string', enum: SOPHISTICATION_KEYS, description: 'How much this visitor already knows about the category -- changes how much the copy needs to explain vs assume.' },
          businessScope: { type: 'string', enum: BUSINESS_SCOPE_KEYS },
          proofStrategy: { type: 'string', description: 'What kind of proof matters most here -- numbers, named work, testimonials, credentials, or none available yet.' },
          informationHierarchy: { type: 'array', items: { type: 'string' }, maxItems: 6, description: 'The 3-6 things a visitor needs to learn, in the order they need to learn them -- this should visibly drive your page/section order below.' }
        }
      },
      visualDirection: {
        type: 'object', additionalProperties: false,
        required: ['hero', 'typography', 'nav', 'card', 'imagery', 'cta', 'colorBehavior', 'motion', 'spacing', 'pattern', 'contentWidth', 'imageDominance', 'imageArrangement', 'sectionRhythm', 'sectionAlignment', 'typographyScale', 'headingWidth', 'cardDensity', 'cardShape', 'splitRatio', 'rationale'],
        properties: {
          hero: { type: 'string', enum: HERO_KEYS },
          typography: { type: 'string', enum: TYPE_KEYS },
          nav: { type: 'string', enum: NAV_KEYS },
          card: { type: 'string', enum: CARD_KEYS },
          imagery: { type: 'string', enum: IMAGERY_KEYS },
          cta: { type: 'string', enum: CTA_KEYS, description: 'CTA button/link treatment (the visual hierarchy of the primary call to action).' },
          colorBehavior: { type: 'string', enum: COLOR_BEHAVIOR_KEYS },
          motion: { type: 'string', enum: MOTION_KEYS, description: 'Depend on business/mood/page -- restrained for finance/legal/trades, soft for restaurant/wellness, editorial for fashion/creative, potentially expressive for technology. "none" is a valid, often correct choice.' },
          spacing: { type: 'string', enum: SPACING_KEYS },
          pattern: { type: 'string', enum: PATTERN_KEYS },
          contentWidth: { type: 'string', enum: CONTENT_WIDTH_KEYS },
          imageDominance: { type: 'string', enum: IMAGE_DOMINANCE_KEYS },
          imageArrangement: { type: 'string', enum: IMAGE_ARRANGEMENT_KEYS },
          sectionRhythm: { type: 'string', enum: SECTION_RHYTHM_KEYS },
          sectionAlignment: { type: 'string', enum: SECTION_ALIGNMENT_KEYS },
          typographyScale: { type: 'string', enum: TYPOGRAPHY_SCALE_KEYS },
          headingWidth: { type: 'string', enum: HEADING_WIDTH_KEYS },
          cardDensity: { type: 'string', enum: CARD_DENSITY_KEYS },
          cardShape: { type: 'string', enum: CARD_SHAPE_KEYS },
          splitRatio: { type: 'string', enum: SPLIT_RATIO_KEYS },
          rationale: { type: 'string', description: 'One sentence: why this direction suits this business.' }
        }
      },
      creativeDirection: {
        type: 'object', additionalProperties: false,
        required: ['concept', 'visualMood', 'narrativeStrategy', 'imageStrategy', 'signatureMotif'],
        properties: {
          concept: { type: 'string', enum: CREATIVE_CONCEPT_KEYS },
          visualMood: { type: 'string', enum: CREATIVE_MOOD_KEYS },
          narrativeStrategy: { type: 'string', enum: CREATIVE_NARRATIVE_KEYS },
          imageStrategy: { type: 'string', enum: CREATIVE_IMAGE_STRATEGY_KEYS },
          signatureMotif: { type: 'string', enum: CREATIVE_SIGNATURE_KEYS }
        }
      },
      pages: {
        type: 'array', minItems: 1, maxItems: 8,
        description: 'Only the pages this specific business actually needs -- a local contractor might need 3, a SaaS company or an editorial fashion brand may need more. Do not default to a fixed count.',
        items: {
          type: 'object', additionalProperties: false,
          required: ['id', 'label', 'purpose', 'plan', 'sections'],
          properties: {
            id: { type: 'string' }, label: { type: 'string' }, purpose: { type: 'string' },
            // V9: what this ONE page is for, planned independently of every
            // other page -- this is what should make Home/Services/About/
            // Contact (or whatever pages you chose) each feel deliberately
            // different rather than four copies of the same section rhythm.
            plan: {
              type: 'object', additionalProperties: false,
              required: ['visitorQuestion', 'primaryCta', 'secondaryCta', 'visualIntensity', 'informationDensity', 'copyTone', 'imageCritical'],
              properties: {
                visitorQuestion: { type: 'string', description: 'The one question a visitor lands on this page to answer, e.g. "Is this for me and why should I care?"' },
                primaryCta: { type: 'string' },
                secondaryCta: { type: 'string', description: 'Empty string if this page genuinely has only one meaningful call to action.' },
                visualIntensity: { type: 'string', enum: VISUAL_INTENSITY_KEYS },
                informationDensity: { type: 'string', enum: INFORMATION_DENSITY_KEYS },
                copyTone: { type: 'string', description: 'This page\'s own copy register, e.g. "reassuring and concrete" vs "confident and fast" -- can differ from the site-wide business.tone where the page\'s job calls for it.' },
                imageCritical: { type: 'boolean', description: 'True only if this specific page genuinely needs imagery to do its job (a portfolio/menu/gallery-led page) -- false for a page that works fine as text (most FAQ/pricing/contact pages).' }
              }
            },
            sections: {
              type: 'array', minItems: 2, maxItems: 10,
              items: {
                type: 'object', additionalProperties: false,
                required: ['type', 'intent', 'headlineRole', 'headline'],
                properties: {
                  type: { type: 'string', enum: SECTION_TYPE_KEYS },
                  // V9: why this section exists on this page, and what kind
                  // of headline it should carry -- reasoned independently of
                  // `type` so two 'services' sections (say, on Home and on a
                  // secondary page) can play different roles instead of
                  // repeating the same claim in the same voice.
                  intent: { type: 'string', enum: SECTION_INTENT_KEYS, description: 'What this section is doing for the visitor at this point in the page -- introducing, proving, reassuring, converting, etc.' },
                  headlineRole: { type: 'string', enum: HEADLINE_ROLE_KEYS, description: 'The rhetorical shape of this section\'s headline. Vary this across a page -- a page of all-declarative headlines reads as a flat list, not a designed sequence.' },
                  headline: { type: 'string' },
                  subhead: { type: 'string' },
                  body: { type: 'string' },
                  ctaLabel: { type: 'string' },
                  claims: {
                    type: 'array', maxItems: 6,
                    description: 'Any factual claim this section\'s copy relies on (a number, a named client, a certification, a guarantee). sourced:true ONLY if it came directly from declaredFacts. Do not restate a claim already used in an earlier section on this page -- if the same fact is relevant again, reference it briefly rather than re-introducing it as new information.',
                    items: {
                      type: 'object', additionalProperties: false, required: ['text', 'sourced'],
                      properties: { text: { type: 'string' }, sourced: { type: 'boolean' } }
                    }
                  },
                  // V8.4: an optional REAL, working functionality module for
                  // this section -- contact/quote forms, a newsletter
                  // signup, a booking/reservation request, a location
                  // placeholder, a direct call/email/directions/external-
                  // link action, or a product CTA. Only include this when
                  // it is genuinely compatible with this section's own
                  // type (a contact-style module on a contact/ctaBanner/
                  // serviceAreas section, a booking module on a
                  // reservationCta/contact section, etc.) -- SiteRemade
                  // independently re-validates the pairing and silently
                  // drops anything incompatible, so an incorrect guess here
                  // never breaks the render, it just does nothing.
                  module: {
                    type: 'object', additionalProperties: false, required: ['type'],
                    description: 'A real, working module -- never a description of one. Omit this field entirely for a section that should stay static/decorative.',
                    properties: {
                      type: { type: 'string', enum: MODULE_TYPE_KEYS },
                      fields: {
                        type: 'array', maxItems: 8,
                        description: 'Which optional field KEYS to include, beyond the type\'s own always-included essentials (e.g. name/email). Only keys relevant to this module type are used; anything else is ignored.',
                        items: { type: 'string', enum: MODULE_FIELD_KEYS }
                      },
                      requiredFields: {
                        type: 'array', maxItems: 8,
                        description: 'Which of the included field keys should be marked required, beyond the type\'s own always-required essentials.',
                        items: { type: 'string', enum: MODULE_FIELD_KEYS }
                      },
                      successMessage: { type: 'string', description: 'A short, real message shown after a real (or preview) submission -- never a claim of something that does not exist, e.g. do not promise a specific response time unless the business actually stated one.' },
                      integrationProvider: { type: 'string', enum: INTEGRATION_PROVIDER_KEYS, description: 'Only a plausible FUTURE integration for this module (e.g. booking -> calendly) -- never a claim that it is actually connected today; it never will be, from this field alone.' }
                    }
                  }
                }
              }
            }
          }
        }
      },
      imagePlan: {
        type: 'array', maxItems: 64,
        description: 'Only images that earn their place -- do not add one merely because a section type supports one. Pick the role that says WHY the image exists (e.g. \'founder\' for a credibility photo, \'process\' for a how-it-works shot, \'atmosphere\' for a mood-setting visual), not just a generic \'gallery\'/\'team\' bucket.',
        items: {
          type: 'object', additionalProperties: false,
          required: ['role', 'intent', 'prompt', 'aspectRatio'],
          properties: {
            role: { type: 'string', enum: IMAGE_ROLE_KEYS },
            intent: { type: 'string', description: 'Why this specific image exists here, in a few words -- what it needs to communicate that the copy alone does not.' },
            prompt: { type: 'string', description: 'A specific, vivid image-generation prompt for this exact business -- never a generic phrase.' },
            aspectRatio: { type: 'string', enum: ['16:9', '4:3', '1:1'] }
          }
        }
      },
      functionalityPlan: {
        type: 'array', maxItems: 8,
        description: 'A short honest NARRATIVE of what this business would reasonably need the site to DO -- separate from the real, working `module` fields above. A module you actually placed on a section is "supportedNow" (it really works, as a labeled preview submission). Payments, real bookings against a live calendar, logins, or anything needing a live backend/API key this app does not have is plannedIntegration or requiresCustomBuild. Never claim a system exists that does not.',
        items: {
          type: 'object', additionalProperties: false, required: ['feature', 'status'],
          properties: {
            feature: { type: 'string' },
            status: { type: 'string', enum: FUNCTIONALITY_STATUS_KEYS },
            note: { type: 'string' }
          }
        }
      }
    }
  }
};

const REFINEMENT_TOOL = {
  name: 'submit_website_refinement',
  description: 'Return a narrowly scoped structured mutation plan for the existing SiteRemade project. Never return HTML, CSS, or arbitrary code.',
  input_schema: {
    type: 'object', additionalProperties: false,
    required: ['scope', 'operations', 'imageActions', 'explanation'],
    properties: {
      scope: { type: 'string', enum: ['section', 'page', 'site'] },
      operations: { type: 'array', maxItems: 8, items: { type: 'object', additionalProperties: false, required: ['action'], properties: {
        action: { type: 'string', enum: ['edit-copy', 'change-design', 'change-variant', 'move-section', 'remove-section', 'insert-section', 'add-page', 'change-image-strategy'] },
        targetId: { type: 'string' }, sectionType: { type: 'string', enum: SECTION_TYPE_KEYS }, beforeId: { type: 'string' },
        changes: { type: 'object', additionalProperties: false, properties: { headline: { type: 'string' }, body: { type: 'string' }, ctaLabel: { type: 'string' }, hero: { type: 'string', enum: HERO_KEYS }, imagery: { type: 'string', enum: IMAGERY_KEYS }, colorBehavior: { type: 'string', enum: COLOR_BEHAVIOR_KEYS }, spacing: { type: 'string', enum: SPACING_KEYS }, imageStrategy: { type: 'string', enum: CREATIVE_IMAGE_STRATEGY_KEYS } } }
      } } },
      imageActions: { type: 'array', maxItems: 8, items: { type: 'object', additionalProperties: false, required: ['action'], properties: { action: { type: 'string', enum: ['regenerate', 'add'] }, slot: { type: 'string' }, role: { type: 'string', enum: IMAGE_ROLE_KEYS } } } },
      explanation: { type: 'string' }
    }
  }
};

const PLANNER_SYSTEM_PROMPT = `You are SiteRemade's website-planning engine. Given a short small-business description, reason about what THIS specific business needs and call submit_website_plan with a structured plan -- never HTML, CSS, or code.

Rules:
1. Never invent a fact. Customer counts, ratings, years in business, awards, certifications, revenue, named clients, testimonials, specific locations, staff, or guarantees may ONLY appear if they are literally present in the business owner's own description (echoed to you as declaredFacts/extracted signals). Persuasive marketing copy is welcome; fabricated facts are not. Every claim your copy depends on must be listed in that section's claims array with sourced:true only when it truly came from the input.
2. Reason about the actual business -- do not default to a generic template or a fixed page/section count. A premium AI logistics company, a neighborhood roofer, and an editorial fashion label should end up structurally different: different pages, different section choices and order, different density, different hero, different motion.
3. Every enum field must be a real, considered choice, not a random pick -- explain your visual direction in one sentence (rationale).
4. functionalityPlan must be honest: SiteRemade can render a contact/lead form and static content today. Booking, payments, ecommerce, portals, and live integrations do not exist yet -- mark them plannedIntegration or requiresCustomBuild, never supportedNow.
5. Keep copy concise and genuinely specific to this business -- avoid generic filler like "a modern website that makes your business obvious" unless the input truly gives you nothing else to work with.
6. Where it genuinely fits, give ONE relevant section a real, working module (module.type) -- a restaurant's reservation section gets a booking module, a contractor's services/contact section gets a quote module, a retail product section gets a product module, and so on. Only choose a module type that's actually compatible with that section (a booking module belongs on a reservation/contact section, not on a pricing table). Do not invent a phone number, email address, physical address, price, checkout link, or "connected" integration for it -- leave a config-level fact out entirely rather than guess; SiteRemade renders an honest empty/placeholder state for anything you don't supply. A module you place is a REAL, working preview form, not a description of a future feature -- that's what functionalityPlan is for.
7. Choose every visualDirection field deliberately, including contentWidth, imageDominance, imageArrangement, sectionRhythm, sectionAlignment, typographyScale, headingWidth, cardDensity, cardShape, and splitRatio. These are controlled renderer values, not CSS or HTML.
8. Reason about strategy BEFORE structure: decide archetype, audience, conversion goals, credibility strategy and information hierarchy first, and let those decisions actually show up in which pages you choose, what order sections appear in, and what each section's intent/headlineRole is. Two businesses in the same category should end up structurally different if their strategy differs -- do not converge on the same page count or section skeleton out of habit.
9. Plan each page independently. A page's plan (visitorQuestion, primaryCta, visualIntensity, informationDensity, copyTone, imageCritical) should differ meaningfully from page to page -- a page that just repeats Home's rhythm at lower density is not a real second page, it's padding. Only create a page this business genuinely needs.
10. Give sections a deliberate rhythm, not uniform density -- vary visualIntensity/informationDensity across a page's sections (e.g. an immersive opening, a quieter trust moment, a denser explanation, a proof-heavy section, a concise close) rather than six sections that all feel the same size and weight. Vary headlineRole across a page too -- do not make every section's headline declarative.
11. Never restate the same claim, statistic, or headline idea twice across a site. If two sections would naturally make the same point, cut one, merge them, or give the second a different angle (a new objection it resolves, a new piece of proof) instead of repeating the first.`;

function buildPlannerUserPrompt(brief) {
  const lines = [
    `Business description (verbatim, from the visitor): "${brief.text}"`,
    brief.extractedFacts && Object.keys(brief.extractedFacts).length ? `Facts already detected in that text (treat as the ONLY safe declaredFacts unless the description states more): ${JSON.stringify(brief.extractedFacts)}` : 'No explicit facts (years/rating/customer count) were detected in the text -- do not invent any.',
    brief.location ? `Detected location: ${brief.location}` : '',
    brief.tone ? `Requested tone: ${brief.tone}` : ''
  ];
  if (brief.priorSignatures && brief.priorSignatures.length) {
    lines.push(
      `This visitor has already been shown ${brief.priorSignatures.length} other direction(s) for this same business: ${brief.priorSignatures.map((s, i) => `\n  Direction ${i + 1}: ${s}`).join('')}`,
      'Produce a genuinely different, equally strong interpretation of the SAME business -- vary information architecture, hero composition, typography, colorBehavior, imagery, page/section structure and order, density, CTA strategy, and motion. Do not manufacture difference through random or nonsensical choices; every choice must still suit the business.'
    );
  }
  return lines.filter(Boolean).join('\n');
}

const anthropicProvider = {
  name: 'anthropic',
  configured: () => !!ANTHROPIC_API_KEY,
  async plan(brief) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25000);
    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({
          model: ANTHROPIC_MODEL,
          // V9: the schema grew substantially (strategy object, per-page
          // plan, per-section intent/headlineRole) -- 4096 was already
          // tight for an 8-page plan with full visualDirection/creative-
          // Direction/imagePlan/functionalityPlan; raised to give the
          // richer reasoning room without truncating mid-tool-call.
          max_tokens: 8192,
          thinking: { type: 'disabled' },
          system: PLANNER_SYSTEM_PROMPT,
          messages: [{ role: 'user', content: buildPlannerUserPrompt(brief) }],
          tools: [WEBSITE_PLAN_TOOL],
          tool_choice: { type: 'tool', name: 'submit_website_plan' }
        }),
        signal: controller.signal
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const error = new Error((data && data.error && data.error.message) || `Anthropic returned ${response.status}`);
        error.status = response.status;
        throw error;
      }
      const toolUse = (data.content || []).find(b => b.type === 'tool_use' && b.name === 'submit_website_plan');
      if (!toolUse || !toolUse.input) throw new Error('Model did not return a structured plan');
      return { plan: toolUse.input, usage: data.usage || {}, model: data.model || ANTHROPIC_MODEL };
    } finally {
      clearTimeout(timeout);
    }
  }
};

function planSignature(plan) {
  // A compact, human-readable fingerprint of a plan -- sent back to Claude
  // (never shown to the visitor) so the next direction can deliberately
  // diverge from it, and kept short to stay cost-aware.
  const vd = plan.visualDirection || {};
  const cd = plan.creativeDirection || {};
  const pageSummary = (plan.pages || []).map(p => `${p.id}:[${(p.sections || []).map(s => s.type).join(',')}]`).join(' ');
  return `concept=${cd.concept} mood=${cd.visualMood} narrative=${cd.narrativeStrategy} signature=${cd.signatureMotif} hero=${vd.hero} type=${vd.typography} imagery=${vd.imagery} color=${vd.colorBehavior} motion=${vd.motion} pattern=${vd.pattern} pages=${pageSummary}`.slice(0, 500);
}

// V8.1: field names describe exactly what this server actually observes --
// Claude usage -- and never claim to be "how many total directions this
// visitor has," since a deterministic-only direction never reaches this
// endpoint at all. The client (script.js) enforces the real 3-direction-
// total cap itself via `directions.length` and does not surface these
// numbers to the visitor as if they were that cap.
app.get('/api/generation-status', (req, res) => {
  const anonId = ensureAnonId(req, res);
  const entry = getDirectionsLedgerEntry(anonId);
  res.json({
    planConfigured: anthropicProvider.configured(),
    claudeDirectionsUsed: entry.claudeDirectionsUsed,
    maxClaudeDirections: MAX_DIRECTIONS,
    claudeDirectionsRemaining: Math.max(0, MAX_DIRECTIONS - entry.claudeDirectionsUsed)
  });
});

app.get('/api/planner-status', (req, res) => {
  res.json({
    configured: anthropicProvider.configured(),
    model: ANTHROPIC_MODEL,
    lastAttempt: plannerDiagnostics.lastAttempt
  });
});

app.post('/api/refine-website', async (req, res) => {
  if (!anthropicProvider.configured()) return res.status(200).json({ ok: false, configured: false });
  const request = clean(req.body.request, 600);
  const context = req.body.context && typeof req.body.context === 'object' ? req.body.context : {};
  if (!request) return res.status(400).json({ ok: false, message: 'Missing refinement request.' });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25000);
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL, max_tokens: 2500, thinking: { type: 'disabled' },
        system: 'You are SiteRemade refinement intelligence. Interpret the user request against the supplied structured project and return only submit_website_refinement. Preserve unrelated content and facts. Never invent business facts, HTML, CSS, or arbitrary operations.',
        messages: [{ role: 'user', content: `Canonical business and current structured project context:\n${JSON.stringify(context).slice(0, 120000)}\n\nRefinement request:\n${request}` }],
        tools: [REFINEMENT_TOOL], tool_choice: { type: 'tool', name: 'submit_website_refinement' }
      }),
      signal: controller.signal
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return res.status(200).json({ ok: false, configured: true });
    const toolUse = (data.content || []).find(block => block.type === 'tool_use' && block.name === 'submit_website_refinement');
    return res.json(toolUse && toolUse.input ? { ok: true, plan: toolUse.input } : { ok: false, configured: true });
  } catch (error) {
    return res.status(200).json({ ok: false, configured: true });
  } finally {
    clearTimeout(timeout);
  }
});

// V8.5: authenticated visitors get a DURABLE, server-authoritative
// entitlement (lib/entitlement.js's reserve/commit/release, keyed by
// account_id in SQLite) instead of the anonymous in-memory cookie ledger
// below -- a refresh or a second device can never reset or exceed it. The
// two paths are deliberately kept separate (never merged/double-counted),
// per the spec's own "explicitly separate anonymous protection from
// authenticated durable entitlement."
app.post('/api/plan-website', withOptionalAuth, async (req, res) => {
  const anonId = ensureAnonId(req, res);
  const entry = getDirectionsLedgerEntry(anonId);
  const authed = !!req.accountId;
  const remainingFor = () => authed
    ? entitlement.getEntitlement(db, req.accountId, MAX_DIRECTIONS).remaining
    : Math.max(0, MAX_DIRECTIONS - entry.claudeDirectionsUsed);
  if (!anthropicProvider.configured()) {
    return res.status(200).json({ ok: false, configured: false, message: 'AI-planned generation is not configured on this environment yet.', claudeDirectionsRemaining: remainingFor() });
  }
  let reservation = null;
  if (authed) {
    reservation = entitlement.reserveDirection(db, req.accountId, MAX_DIRECTIONS);
    if (!reservation.ok) {
      return res.status(200).json({ ok: false, limited: true, claudeDirectionsRemaining: 0, message: 'This account has used its Claude-planned directions for now.' });
    }
  } else if (entry.claudeDirectionsUsed >= MAX_DIRECTIONS) {
    // Enforced here, server-side, BEFORE any model call -- a real brake on
    // Claude usage specifically for this anonymous visitor, independent of
    // (and in addition to) the client's own overall 3-direction-total cap.
    // The client is expected to fall back to the deterministic engine on
    // this response -- which still produces a real direction for the
    // visitor, it just doesn't ask Claude to plan it.
    return res.status(200).json({ ok: false, limited: true, claudeDirectionsRemaining: 0, message: 'This visitor has used their Claude-planned directions for now.' });
  }
  const text = clean(req.body.text, 600);
  if (!text) {
    if (authed) entitlement.releaseDirection(db, req.accountId); // never charged for a request that never reached Claude
    return res.status(400).json({ ok: false, message: 'Missing business description.' });
  }
  const brief = {
    text,
    location: clean(req.body.location, 120),
    tone: clean(req.body.tone, 20),
    extractedFacts: (req.body.extractedFacts && typeof req.body.extractedFacts === 'object') ? req.body.extractedFacts : {},
    priorSignatures: entry.signatures.slice(-2)
  };
  const startedAt = Date.now();
  try {
    const { plan, usage, model } = await anthropicProvider.plan(brief);
    const latencyMs = Date.now() - startedAt;
    recordPlannerAttempt({ outcome: 'success', latencyMs, model: model || null });
    if (authed) entitlement.commitDirection(db, req.accountId); // reserved -> used, only on real success
    entry.signatures.push(planSignature(plan));
    if (entry.signatures.length > 5) entry.signatures = entry.signatures.slice(-5);
    entry.history.push({ at: startedAt, model, latencyMs, success: true, tokensIn: usage.input_tokens, tokensOut: usage.output_tokens });
    if (entry.history.length > 10) entry.history = entry.history.slice(-10);
    if (!authed) entry.claudeDirectionsUsed += 1; // anonymous path unchanged from V8/V8.1
    return res.json({ ok: true, plan, claudeDirectionsRemaining: remainingFor(), meta: { model, latencyMs } });
  } catch (error) {
    const latencyMs = Date.now() - startedAt;
    recordPlannerAttempt({ outcome: 'error', latencyMs, errorCategory: categorizeAnthropicError(error) });
    if (authed) entitlement.releaseDirection(db, req.accountId); // a failed attempt never permanently consumes a direction
    entry.history.push({ at: startedAt, latencyMs, success: false, error: String(error && error.message || error) });
    if (entry.history.length > 10) entry.history = entry.history.slice(-10);
    console.error('Website planning failed:', error);
    // A failed attempt does NOT consume one of this visitor's Claude
    // attempts -- only a real returned plan does. The direction itself
    // still gets created by the client's deterministic fallback.
    return res.status(200).json({ ok: false, message: 'Could not reach the AI planner right now.', claudeDirectionsRemaining: remainingFor() });
  }
});

// V8.5: checkout now requires an authenticated account and an OWNED
// project id -- a stable purchase_intents row (account, exact project,
// pending) is created server-side BEFORE the Stripe Checkout Session
// exists, and the session is created with that intent id as its
// client_reference_id/success_url token. The browser's return from
// checkout is only ever a UX trigger to ask the server for VERIFIED status
// (GET /api/purchase-intents/:id) -- the query string itself is never
// trusted (see SITE-PROJECT-V8.5.md part 6).
app.post('/api/checkout', requireAuth, requireSameOrigin, async (req, res) => {
  try {
    const projectId = clean(req.body.projectId, 120);
    if (!projectId) return res.status(400).json({ ok: false, message: 'Missing project reference.' });
    const owned = projectStore.getOwnedProject(db, req.accountId, projectId);
    // A missing/not-owned project is indistinguishable from the caller's
    // point of view -- never confirms whether some OTHER account's project
    // id exists (see SITE-PROJECT-V8.5.md "security").
    if (!owned) return res.status(404).json({ ok: false, message: 'Project not found.' });

    const businessName = clean(req.body.businessName, 160) || 'Your Business';
    const industry = clean(req.body.industry, 120) || 'General Business';
    const sectionsSummary = clean(req.body.sectionsSummary, 200);
    const brandColor = clean(req.body.brandColor, 20);

    const intentResult = purchase.createPurchaseIntent(db, { ownerId: req.accountId, projectId, amount: 35000, currency: 'cad' });
    if (!intentResult.ok) {
      if (intentResult.reason === 'already_purchased') return res.status(409).json({ ok: false, message: 'This project has already been purchased.' });
      return res.status(404).json({ ok: false, message: 'Project not found.' });
    }
    const intentId = intentResult.intent.id;

    if (!STRIPE_SECRET_KEY) {
      // Real, honest state: the architecture is wired end-to-end (intent
      // creation, this route, the client call, metadata shape) but no live
      // key is configured in this environment. We do not fake a successful
      // checkout -- see SITE-PROJECT-V6.md. The intent row created above is
      // harmless left in 'pending' -- a later real checkout attempt for the
      // same project creates its own fresh intent.
      return res.status(200).json({ ok: false, configured: false, message: 'Checkout is not yet configured on this environment.' });
    }

    const origin = `${req.protocol}://${req.get('host')}`;
    const session = await stripeRequest('checkout/sessions', {
      mode: 'payment',
      // The success URL carries the INTENT id, never the raw project id --
      // the client asks the server to verify that intent's real status
      // rather than trusting this query string directly.
      success_url: `${origin}/?purchased=1&intent=${encodeURIComponent(intentId)}#buy`,
      cancel_url: `${origin}/?purchase_cancelled=1&intent=${encodeURIComponent(intentId)}#buy`,
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
      // next-step backend work, not built here). intentId is what THIS
      // app's own /api/stripe/webhook reconciles fulfillment against.
      metadata: {
        kind: 'website_purchase',
        intentId,
        projectId,
        businessName: businessName.slice(0, 90),
        industry: industry.slice(0, 90),
        brandColor,
      },
    });
    purchase.attachStripeSession(db, intentId, session.id);

    return res.json({ ok: true, url: session.url, intentId });
  } catch (error) {
    console.error('Checkout session failed:', error);
    return res.status(500).json({ ok: false, message: 'Could not start checkout. Please try again shortly.' });
  }
});

// Stripe fires this server-to-server (never trusted without a verified
// signature) on Checkout Session lifecycle events. Idempotent by
// construction (lib/purchase.js's fulfillBySessionId/markIntentTerminal)
// -- a duplicate delivery of the same event is always a safe no-op.
app.post('/api/stripe/webhook', (req, res) => {
  if (!STRIPE_WEBHOOK_SECRET) return res.status(503).json({ ok: false, message: 'Webhook is not configured on this environment.' });
  const signature = req.headers['stripe-signature'];
  const rawBody = req.body; // Buffer, thanks to the express.raw() mount above
  if (!purchase.verifyStripeWebhookSignature(rawBody, signature, STRIPE_WEBHOOK_SECRET)) {
    return res.status(400).json({ ok: false, message: 'Invalid signature.' });
  }
  let event;
  try { event = JSON.parse(rawBody.toString('utf8')); } catch (e) { return res.status(400).json({ ok: false, message: 'Malformed event body.' }); }
  const session = event && event.data && event.data.object;
  try {
    if (event.type === 'checkout.session.completed' && session && session.id) {
      purchase.fulfillBySessionId(db, session.id);
    } else if ((event.type === 'checkout.session.expired') && session && session.id) {
      purchase.markIntentTerminal(db, session.id, 'cancelled');
    }
    // Any other event type is acknowledged (200) without action -- Stripe
    // retries on non-2xx, and this app only cares about the two above.
    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error('Webhook fulfillment failed:', error);
    return res.status(500).json({ ok: false, message: 'Fulfillment failed.' });
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

// ============================================================================
// V8.5: auth + owned-project API
// ============================================================================
// A project's serialized directions state can be several MB once it
// contains a few generated images (dedup/internalization happens AFTER
// validation -- see lib/project-store.js), so POST/PUT /api/projects use
// their own raised-limit JSON parser rather than blanket-raising the
// 900kb default every other route still uses.
const projectJsonParser = express.json({ limit: '35mb' });

// V8.7: these four routes now go through the AuthProvider (sign in/up/out,
// current-account resolution) instead of calling lib/auth.js directly --
// see lib/adapters/local-auth-provider.js. Behavior is unchanged (it's the
// exact same lib/auth.js underneath); this is what makes "sign in/up/out"
// a real part of the AuthProvider boundary rather than only requireAuth.
app.post('/api/auth/signup', requireSameOrigin, (req, res) => {
  const result = authProvider.signUp(db, req.body && req.body.email, req.body && req.body.password);
  if (!result.ok) return res.status(400).json({ ok: false, message: result.error });
  const { token } = authProvider.createSession(db, result.account.id);
  res.setHeader('Set-Cookie', authProvider.sessionCookieHeader(token));
  return res.json({ ok: true, account: result.account });
});
app.post('/api/auth/signin', requireSameOrigin, (req, res) => {
  const result = authProvider.signIn(db, req.body && req.body.email, req.body && req.body.password);
  if (!result.ok) return res.status(401).json({ ok: false, message: result.error });
  const { token } = authProvider.createSession(db, result.account.id);
  res.setHeader('Set-Cookie', authProvider.sessionCookieHeader(token));
  return res.json({ ok: true, account: result.account });
});
app.post('/api/auth/signout', requireSameOrigin, (req, res) => {
  const cookies = authProvider.parseCookies(req.headers.cookie);
  const token = cookies[authProvider.SESSION_COOKIE];
  if (token) authProvider.destroySession(db, token);
  res.setHeader('Set-Cookie', authProvider.sessionCookieHeader(null, { clear: true }));
  return res.json({ ok: true });
});
app.get('/api/auth/me', withOptionalAuth, (req, res) => {
  if (!req.accountId) return res.json({ authenticated: false });
  return res.json({ authenticated: true, account: { id: req.accountId, email: req.accountEmail } });
});

// Create (or idempotently resolve, via sourceLocalId) an owned project.
// This is also the anonymous -> account migration endpoint: the client
// sends the EXACT in-browser directions state, unmodified, tagged with the
// browser-local project's own meta.id as sourceLocalId (see
// SITE-PROJECT-V8.5.md "anonymous -> account migration").
app.post('/api/projects', requireAuth, requireSameOrigin, projectJsonParser, (req, res) => {
  const result = projectStore.createProject(db, req.accountId, {
    name: req.body && req.body.name,
    directionsState: req.body && req.body.directionsState,
    sourceLocalId: req.body && req.body.sourceLocalId,
  });
  if (!result.ok) return res.status(400).json({ ok: false, message: result.error });
  return res.status(result.alreadyExisted ? 200 : 201).json({ ok: true, project: result.project, migrated: result.migrated, alreadyExisted: result.alreadyExisted });
});
app.get('/api/projects', requireAuth, (req, res) => {
  return res.json({ ok: true, projects: projectStore.listOwnedProjects(db, req.accountId) });
});
app.get('/api/projects/:id', requireAuth, (req, res) => {
  const project = projectStore.getOwnedProject(db, req.accountId, req.params.id);
  // A missing project and one owned by someone else are the SAME response
  // -- this endpoint never confirms another account's project exists (see
  // SITE-PROJECT-V8.5.md "security" / IDOR).
  if (!project) return res.status(404).json({ ok: false, message: 'Project not found.' });
  return res.json({ ok: true, project });
});
app.put('/api/projects/:id', requireAuth, requireSameOrigin, projectJsonParser, (req, res) => {
  const body = req.body || {};
  const result = projectStore.updateOwnedProject(db, req.accountId, req.params.id, {
    name: body.name, directionsState: body.directionsState,
    expectedRevision: Number.isInteger(body.expectedRevision) ? body.expectedRevision : undefined,
  });
  if (!result.ok) {
    if (result.reason === 'not_found') return res.status(404).json({ ok: false, message: 'Project not found.' });
    if (result.reason === 'conflict') return res.status(409).json({ ok: false, reason: 'conflict', current: result.current });
    return res.status(400).json({ ok: false, message: result.error || 'Invalid project state.' });
  }
  return res.json({ ok: true, project: result.project });
});
app.delete('/api/projects/:id', requireAuth, requireSameOrigin, (req, res) => {
  const result = projectStore.archiveProject(db, req.accountId, req.params.id);
  if (!result.ok) {
    if (result.reason === 'not_found') return res.status(404).json({ ok: false, message: 'Project not found.' });
    return res.status(409).json({ ok: false, message: 'Only a draft project can be archived.' });
  }
  return res.json({ ok: true });
});
app.get('/api/projects/:id/purchase-status', requireAuth, (req, res) => {
  const status = projectStore.getOwnedProjectStatus(db, req.accountId, req.params.id);
  if (!status) return res.status(404).json({ ok: false, message: 'Project not found.' });
  return res.json({ ok: true, status });
});
// Verified-purchase polling target for the post-checkout-return UX
// trigger -- see the /api/checkout and /api/stripe/webhook comments above.
app.get('/api/purchase-intents/:id', requireAuth, (req, res) => {
  const intent = purchase.getOwnedPurchaseIntent(db, req.accountId, req.params.id);
  if (!intent) return res.status(404).json({ ok: false, message: 'Purchase intent not found.' });
  return res.json({ ok: true, intent });
});

// ---- V8.6: export / deployment / hosting / domain handoff ------------------
// Export/deploy is an ownership boundary exactly like the project routes
// above: every route here does its own explicit ownership-scoped lookup
// (never trusts a client-supplied owner/project id alone), requireAuth on
// every route, requireSameOrigin on every state-changing one (spec §28).
const EXPORTS_DIR = path.join(__dirname, 'data', 'exports'); // gitignored under /data/, exactly like the sqlite db and asset-store
function ensureExportsDir() { fs.mkdirSync(EXPORTS_DIR, { recursive: true }); }

// Compiles + archives + records a new deployment for an owned, PURCHASED
// project. Never trusts localStorage/UI badges/client-supplied status --
// `project.status` is read straight from the authoritative row (spec §4).
// Binds to the EXACT revision the client says it has (§3): the caller must
// have already flushed its latest autosave and pass that resulting
// revision number, or this refuses with a stale-revision conflict rather
// than silently exporting whatever the server happens to have.
app.post('/api/projects/:id/export', requireAuth, requireSameOrigin, projectJsonParser, (req, res) => {
  const projectId = req.params.id;
  const project = projectStore.getOwnedProjectRaw(db, req.accountId, projectId);
  if (!project) return res.status(404).json({ ok: false, message: 'Project not found.' });
  if (project.status !== 'purchased') return res.status(403).json({ ok: false, message: 'This project has not been purchased yet.' });
  const body = req.body || {};
  const expectedRevision = Number.isInteger(body.expectedRevision) ? body.expectedRevision : null;
  if (expectedRevision === null) return res.status(400).json({ ok: false, message: 'expectedRevision is required -- save your latest changes first.' });
  if (expectedRevision !== project.revision) {
    return res.status(409).json({ ok: false, reason: 'stale_revision', message: 'Your local copy is behind the saved project. Reload and try again.', currentRevision: project.revision });
  }
  const directionIndex = Number.isInteger(body.directionIndex) ? body.directionIndex : (project.directionsState.activeDirectionIndex || 0);
  ensureExportsDir();
  const deploymentId = deploymentStore.genId('dep');
  const workDir = path.join(EXPORTS_DIR, deploymentId);
  let result;
  try {
    result = exportCompiler.compileExport(db, { project, directionIndex, workDir });
  } catch (e) {
    const failed = deploymentStore.recordFailedDeployment(db, {
      id: deploymentId, ownerId: req.accountId, projectId, projectRevision: project.revision, directionIndex,
      target: 'local', failureReason: (e && e.message) || 'Export failed.',
    });
    return res.status(400).json({ ok: false, message: (e && e.message) || 'Export failed.', deployment: failed });
  }
  try {
    zipDirectory(result.workDir, workDir + '.zip');
  } catch (e) {
    const failed = deploymentStore.recordFailedDeployment(db, {
      id: deploymentId, ownerId: req.accountId, projectId, projectRevision: project.revision, directionIndex,
      target: 'local', failureReason: 'Could not build a downloadable archive: ' + ((e && e.message) || 'unknown error'),
      runtimeType: result.runtimeType, runtimeReasons: result.runtimeReasons, manifest: result.manifest,
      artifactHash: result.artifactHash, compilerVersion: exportCompiler.COMPILER_VERSION,
    });
    return res.status(500).json({ ok: false, message: 'Could not build a downloadable archive.', deployment: failed });
  }
  const deployment = deploymentStore.createReadyDeployment(db, {
    id: deploymentId, ownerId: req.accountId, projectId, projectRevision: project.revision, directionIndex,
    compilerVersion: exportCompiler.COMPILER_VERSION, artifactHash: result.artifactHash,
    runtimeType: result.runtimeType, runtimeReasons: result.runtimeReasons, target: 'local',
    manifest: result.manifest, artifactPath: workDir + '.zip',
  });
  return res.status(201).json({ ok: true, deployment, manifest: result.manifest });
});
app.get('/api/projects/:id/deployments', requireAuth, (req, res) => {
  const project = projectStore.getOwnedProjectStatus(db, req.accountId, req.params.id);
  if (!project) return res.status(404).json({ ok: false, message: 'Project not found.' });
  return res.json({ ok: true, deployments: deploymentStore.listOwnedDeployments(db, req.accountId, req.params.id) });
});
app.get('/api/deployments/:id', requireAuth, (req, res) => {
  const deployment = deploymentStore.getOwnedDeployment(db, req.accountId, req.params.id);
  if (!deployment) return res.status(404).json({ ok: false, message: 'Deployment not found.' });
  return res.json({ ok: true, deployment });
});
// The real downloadable artifact (spec §18) -- ownership-checked, only
// ever serves a deployment that actually finished packaging (a 'failed'
// row has no artifact). Filename is built from sanitized, server-known
// values only, never from raw request input.
app.get('/api/deployments/:id/download', requireAuth, (req, res) => {
  const deployment = deploymentStore.getOwnedDeployment(db, req.accountId, req.params.id);
  if (!deployment || !['ready', 'live'].includes(deployment.state)) return res.status(404).json({ ok: false, message: 'Export not available.' });
  const zipPath = path.join(EXPORTS_DIR, `${req.params.id}.zip`);
  if (!fs.existsSync(zipPath)) return res.status(404).json({ ok: false, message: 'Export artifact missing.' });
  const safeName = `siteremade-export-${req.params.id}.zip`.replace(/[^a-zA-Z0-9._-]/g, '');
  res.setHeader('Content-Disposition', `attachment; filename="${safeName}"`);
  res.setHeader('Content-Type', 'application/zip');
  return res.sendFile(zipPath);
});
// Redeploy-to-target (spec §15/§26/§29): attempts to hand an EXISTING,
// already-packaged deployment off to a named hosting target. 'local' is
// the only real one (already satisfied by the export itself); every other
// target honestly fails with a real, specific reason rather than faking
// success -- and always as a NEW row, so a failed redeploy attempt can
// never destroy or hide whatever the last good deployment was.
app.post('/api/deployments/:id/deploy-to', requireAuth, requireSameOrigin, projectJsonParser, (req, res) => {
  const source = deploymentStore.getOwnedDeployment(db, req.accountId, req.params.id);
  if (!source || !['ready', 'live'].includes(source.state)) return res.status(404).json({ ok: false, message: 'No ready export to deploy.' });
  const targetKey = String((req.body && req.body.target) || '').trim();
  const target = hosting.getTarget(targetKey);
  if (!target) return res.status(400).json({ ok: false, message: 'Unknown hosting target.' });
  if (targetKey === 'local') return res.json({ ok: true, deployment: source }); // already satisfied -- no-op, not a new row
  const failed = deploymentStore.recordFailedDeployment(db, {
    ownerId: req.accountId, projectId: source.projectId, projectRevision: source.projectRevision, directionIndex: source.directionIndex,
    target: targetKey, failureReason: target.available ? 'This target is not yet wired up in this environment.' : target.reason,
    runtimeType: source.runtimeType, runtimeReasons: source.runtimeReasons, manifest: source.manifest,
    artifactHash: source.artifactHash, compilerVersion: source.compilerVersion,
  });
  return res.status(200).json({ ok: true, deployment: failed });
});
// A structured, technical-fit hosting recommendation (spec §16) -- reads
// current project state directly (classifyRuntime), so it works even
// before a first export exists.
app.get('/api/projects/:id/hosting-recommendation', requireAuth, (req, res) => {
  const project = projectStore.getOwnedProjectRaw(db, req.accountId, req.params.id);
  if (!project) return res.status(404).json({ ok: false, message: 'Project not found.' });
  const directionIndex = Number.isInteger(Number(req.query.directionIndex)) ? Number(req.query.directionIndex) : (project.directionsState.activeDirectionIndex || 0);
  const direction = project.directionsState.directions[directionIndex];
  if (!direction) return res.status(400).json({ ok: false, message: 'Invalid direction index.' });
  const classification = runtimeClassifier.classifyRuntime(direction);
  return res.json({ ok: true, recommendation: hosting.recommend(classification) });
});
app.get('/api/hosting-providers', (req, res) => res.json({ ok: true, providers: hosting.listProviders() }));

// ---- V8.6: custom-domain handoff -------------------------------------------
app.post('/api/projects/:id/domain', requireAuth, requireSameOrigin, projectJsonParser, (req, res) => {
  const project = projectStore.getOwnedProjectStatus(db, req.accountId, req.params.id);
  if (!project) return res.status(404).json({ ok: false, message: 'Project not found.' });
  const check = domainLib.validateDomain(req.body && req.body.domain);
  if (!check.valid) return res.status(400).json({ ok: false, message: check.error });
  const target = hosting.getTarget((req.body && req.body.target) || 'local') ? (req.body && req.body.target) || 'local' : 'local';
  const dnsRecords = domainLib.buildDnsInstructions(target, check.domain);
  const domain = deploymentStore.upsertDomain(db, { ownerId: req.accountId, projectId: req.params.id, domain: check.domain, target, dnsRecords });
  return res.json({ ok: true, domain });
});
app.get('/api/projects/:id/domains', requireAuth, (req, res) => {
  const project = projectStore.getOwnedProjectStatus(db, req.accountId, req.params.id);
  if (!project) return res.status(404).json({ ok: false, message: 'Project not found.' });
  return res.json({ ok: true, domains: deploymentStore.listOwnedDomains(db, req.accountId, req.params.id) });
});
// A real, narrow, SSRF-safe reachability check (spec §21) -- never
// presents a domain as verified merely because instructions were
// generated (§20); only a real DNS+HTTP(S) check advances the state.
app.post('/api/domains/:id/verify', requireAuth, requireSameOrigin, async (req, res) => {
  const domain = deploymentStore.getOwnedDomain(db, req.accountId, req.params.id);
  if (!domain) return res.status(404).json({ ok: false, message: 'Domain not found.' });
  const result = await domainLib.verifyDomainReachable(domain.domain);
  let nextState = domain.state;
  if (result.ok) nextState = result.usedHttps ? 'live' : 'verified';
  else if (domain.state === 'not_configured' || domain.state === 'instructions_generated') nextState = 'dns_pending';
  const updated = deploymentStore.setDomainState(db, req.accountId, req.params.id, nextState, { verified: !!result.ok });
  return res.json({ ok: true, check: result, domain: updated });
});

app.get('/privacy', (req, res) => res.sendFile(path.join(__dirname, 'privacy.html')));
app.get('/terms', (req, res) => res.sendFile(path.join(__dirname, 'terms.html')));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.listen(PORT, '0.0.0.0', () => console.log(`SiteRemade running on port ${PORT}`));
