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
const { createGenerationEvents } = require('./lib/generation-events.js');
const { createImageDelivery } = require('./lib/image-delivery.js');
const purchase = require('./lib/purchase.js');
// Credit-architecture fix: lib/entitlement.js's account-durable lifetime
// cap is no longer required/called here -- it predated the credit system
// and, once credits existed alongside it, was blocking authenticated
// generation forever after 3 uses regardless of daily credits (see the
// full explanation at this file's /api/plan-website route). It remains a
// real, tested, concurrency-safe module on disk, just not wired into this
// file any more.
const credits = require('./lib/credits.js');
const { createBilling } = require('./lib/billing.js');
const creativeJobs = require('./lib/creative-jobs.js');
// FINAL GENERATOR HARDENING pass: a real, in-memory, bounded rate limiter --
// see lib/rate-limit.js's own header for the full reasoning (same honesty
// posture as directionsLedger/operationLedger below: not durable, not
// shared across instances, but genuinely enforced). normalizeEmail is
// reused directly from lib/auth.js (via the auth provider's own module,
// same implementation authProvider ultimately delegates to) so the login
// brute-force key is built the exact same way signIn itself normalizes an
// email, rather than a second, possibly-divergent copy of that logic.
const rateLimit = require('./lib/rate-limit.js');
const { normalizeEmail } = require('./lib/auth.js');
// V14 (shared identity bridge pass): identity-links.js is pure local-DB
// bookkeeping (no network calls -- see its own header); supabase-identity.js
// is the one place this file talks to Supabase's Auth API to verify a
// caller-presented access token. Neither is required/called anywhere
// except the new /api/identity/* routes below and their feature flag --
// every existing route/table/session is completely untouched by this pass
// (see SITE-PROJECT-V14-IDENTITY-BRIDGE.md's "Phase 1" for why: no
// existing FK is rekeyed, no existing auth path changes behavior).
const identityLinks = require('./lib/identity-links.js');
const supabaseIdentity = require('./lib/supabase-identity.js');
// App bridge pass (Phase 4): a narrow, additive, server-to-server contract
// for the SiteRemade customer app (/api/app-bridge/*, near the /api/projects
// routes below). Gated by its OWN flag, SITEREMADE_APP_BRIDGE_ENABLED
// (default unset => every bridge route 404s) -- deliberately independent of
// SITEREMADE_IDENTITY_BRIDGE_MODE above, which gates the browser login
// handoff and is not touched or depended on here.
const { createRequireAppBridgeAuth } = require('./lib/app-bridge-auth.js');
const publishedSnapshots = require('./lib/published-snapshots.js');
const { normalizeServerRefinementPlan, buildRefinementContext } = require('./lib/refinement-normalizer.js');
const { applyRefinementPlan, setGeneratedImage, imageSummary } = require('./lib/apply-refinement-plan.js');
// A real feature flag, not a code comment -- spec item 34 ("we need the
// ability to stop rollout without reverting the whole codebase"). Default
// 'disabled': every /api/identity/* route below fails closed (404, the
// same "doesn't appear to exist" posture as /api/admin/operation-ledger's
// own missing-token case) until this is explicitly turned on. 'internal'
// additionally requires the caller's (already-verified, either side's)
// email to appear in SITEREMADE_IDENTITY_BRIDGE_ALLOWLIST -- a real,
// enforced restriction, not a cosmetic one. 'opt_in' and 'full' behave
// identically in THIS pass (both "on for every account") -- there is no
// behavioral difference to implement yet because nothing in this pass ever
// links or provisions an account without that account's own explicit,
// in-the-moment action (see identity-links.js: lazyProvisionGeneratorAccount
// only ever fires for the Supabase identity that just authenticated itself,
// createLink only ever fires with a fresh dual-session proof) -- 'full'
// exists as the named eventual target once a real rollout needs to
// distinguish "on for everyone" from "on, but still opt-in per account,"
// which nothing in this pass's scope requires.
function identityBridgeMode() {
  const mode = String(process.env.SITEREMADE_IDENTITY_BRIDGE_MODE || 'disabled').trim().toLowerCase();
  return ['disabled', 'internal', 'opt_in', 'full'].includes(mode) ? mode : 'disabled';
}
function identityBridgeEnabled() { return identityBridgeMode() !== 'disabled'; }
function identityBridgeAllowedForEmail(email) {
  if (identityBridgeMode() !== 'internal') return true;
  const allowlist = String(process.env.SITEREMADE_IDENTITY_BRIDGE_ALLOWLIST || '')
    .split(',').map(e => normalizeEmail(e)).filter(Boolean);
  return allowlist.includes(normalizeEmail(email));
}
// V8.6: export + deployment packaging + hosting/domain handoff -- see
// SITE-PROJECT-V8.6.md. Reuses this exact same database/ownership layer
// (no parallel backend), exactly like V8.5's own modules above.
const fs = require('fs');
const exportCompiler = require('./lib/export-compiler.js');
const deploymentStore = require('./lib/deployment-store.js');
const hosting = require('./lib/hosting.js');
const runtimeClassifier = require('./lib/runtime-classifier.js');
const domainLib = require('./lib/domain.js');
const siteImport = require('./lib/site-import.js'); // Phase 9: "Redesign my existing website" extraction, see /api/redesign/extract below
const { zipDirectory } = require('./lib/archive.js');

// Deployment-safety pass: refuses to boot at all if this looks like a
// production deployment on the local (SQLite + filesystem) backend with
// any of its three durable-data paths left at their in-container
// defaults -- see lib/deployment-safety.js for the full reasoning. This
// runs BEFORE anything else (including opening the database below) so an
// unsafe deployment fails immediately and loudly, not after already
// having written to an ephemeral path.
const { assessPersistenceSafety, formatUnsafeMessage } = require('./lib/deployment-safety.js');
const persistenceSafety = assessPersistenceSafety(process.env);
if (!persistenceSafety.safe) {
  console.error(formatUnsafeMessage(persistenceSafety));
  process.exit(1);
}

const app = express();
// Railway (like most PaaS) terminates TLS at its own edge and proxies to
// this container over plain HTTP -- without this, Express's req.secure/
// req.protocol would see only that internal plain-HTTP hop and never the
// real external HTTPS scheme. `1` trusts exactly the first proxy hop
// (Railway's own edge), which is the correct value for a single reverse
// proxy in front of this app, not "trust anything." This is required for
// BOTH the Secure-cookie logic below (cookieShouldBeSecure) AND
// requireSameOrigin's own req.protocol-based check further down -- without
// it, requireSameOrigin would compare a real "https://" browser Origin
// header against a wrongly-computed "http://" expected origin and refuse
// every legitimate same-origin request once deployed behind Railway's
// proxy.
app.set('trust proxy', 1);
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
// Durable, private generation diagnostics (planner outcomes, every image
// outcome, the operation ledger) -- see lib/generation-events.js. Survives a
// restart, unlike the in-memory ledger below; never exposed on a generated
// site; read only via the admin-token route GET /api/admin/generation-events.
const generationEvents = createGenerationEvents(db, { retentionDays: Number(process.env.SITEREMADE_DIAGNOSTICS_RETENTION_DAYS) || undefined });

app.disable('x-powered-by');
// V8.5's Stripe webhook route needs the EXACT raw request bytes to verify
// Stripe's HMAC signature (JSON.stringify(JSON.parse(raw)) is not
// guaranteed byte-identical to what Stripe actually sent) -- mounted
// before the generic JSON parser below so it claims that one route first.
app.use('/api/stripe/webhook', express.raw({ type: 'application/json', limit: '2mb' }));
// The generic 900kb JSON parser must NOT run for the routes that declare their
// own 35mb projectJsonParser (a saved project carries its generated images as
// data URLs until the server internalizes them): run first, the small limit
// rejected every save with more than ~900kb of images with a 413 before the
// route's own parser was ever reached. A multi-image hero makes that every save.
const OWN_LARGE_JSON_ROUTES = [
  ['POST', /^\/api\/projects\/?$/], ['PUT', /^\/api\/projects\/[^/]+\/?$/], ['POST', /^\/api\/projects\/[^/]+\/export\/?$/],
  ['POST', /^\/api\/projects\/[^/]+\/domain\/?$/], ['POST', /^\/api\/deployments\/[^/]+\/deploy-to\/?$/],
];
const genericJsonParser = express.json({ limit: '900kb' });
app.use((req, res, next) => (OWN_LARGE_JSON_ROUTES.some(([m, re]) => req.method === m && re.test(req.path)) ? next() : genericJsonParser(req, res, next)));
// PREMIUM_GENERATION_V1: attribute every provider call from a browser project to its generation (cost ledger grouping).
app.use('/api', (req, res, next) => {
  const b = req.body;
  if (b && typeof b === 'object' && b.premiumGenerationId && b.projectId) {
    const g = String(b.premiumGenerationId).slice(0, 60), p = String(b.projectId).slice(0, 60);
    if (/^gen_[a-z0-9]{6,40}$/.test(g)) { projectGeneration.set(p, g); if (projectGeneration.size > 2000) projectGeneration.delete(projectGeneration.keys().next().value); }
  }
  next();
});
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
// Deployment-safety pass: whether a cookie set on THIS response should
// carry the Secure attribute (never sent by the browser back over plain
// HTTP). req.secure is accurate here because of `trust proxy` above --
// true for a real request that arrived over HTTPS at Railway's (or any
// single reverse proxy's) edge, even though the hop into this container
// is plain HTTP. NODE_ENV=production is a second, request-independent
// signal for any deployment where the proxy hop isn't correctly relaying
// X-Forwarded-Proto. Never secure for a plain local dev server
// (NODE_ENV unset/'development', real http://localhost), so `npm start`
// locally keeps working exactly as before -- a Secure cookie set from a
// non-HTTPS response is simply dropped by the browser, which would look
// like "sign-in doesn't stick" locally if this were unconditional.
function cookieShouldBeSecure(req) {
  return !!req.secure || process.env.NODE_ENV === 'production';
}
function ensureAnonId(req, res) {
  let id = getCookie(req, ANON_COOKIE);
  if (!id || !/^[a-f0-9-]{36}$/.test(id)) {
    id = crypto.randomUUID();
    // 1 year, HttpOnly (never readable/forgeable from the browser), Lax (so
    // it survives normal top-level navigation, e.g. after Stripe redirect),
    // Secure whenever the request is actually HTTPS/production (see
    // cookieShouldBeSecure above) -- never weakened, only ever added.
    const secureAttr = cookieShouldBeSecure(req) ? '; Secure' : '';
    res.setHeader('Set-Cookie', `${ANON_COOKIE}=${id}; Max-Age=31536000; Path=/; HttpOnly; SameSite=Lax${secureAttr}`);
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
// FINAL GENERATOR HARDENING pass (spec items 3/4/5): server-side rate
// limiting -- the highest-priority remaining abuse item per the brief.
// Every threshold below is env-overridable (same convention as the credit
// config above: a literal default that IS the real production value,
// never a magic number buried only in a test), and every bucket is keyed
// off req.ip, which is correct here specifically because `trust proxy` is
// set to `1` above -- req.ip already reflects Railway's real single-hop
// X-Forwarded-For value, not the proxy's own address, so this is not a
// second/duplicate trust decision, just reading the one Express already
// makes correctly. Deliberately NOT a general-purpose anti-fraud platform
// (per the brief: "do not build a huge anti-fraud platform") -- four
// buckets, sized to slow a scripted burst without interfering with a real
// person's normal usage (a real visitor never sends 15 sign-in attempts or
// 20 generations inside one window).
const RATE_LIMITS = {
  // Account-creation spam / signup-loop protection (spec item 4).
  signup: { max: Number(process.env.SITEREMADE_RATE_LIMIT_SIGNUP_MAX) || 8, windowMs: Number(process.env.SITEREMADE_RATE_LIMIT_SIGNUP_WINDOW_MS) || 60 * 60 * 1000 },
  // Plain per-IP request-rate ceiling on the sign-in ROUTE itself (distinct
  // from the per-EMAIL failure-count brute-force check below -- this one
  // exists so a single IP can't hammer the route at all, authenticated or
  // not, successful or not).
  signin: { max: Number(process.env.SITEREMADE_RATE_LIMIT_SIGNIN_MAX) || 15, windowMs: Number(process.env.SITEREMADE_RATE_LIMIT_SIGNIN_WINDOW_MS) || 15 * 60 * 1000 },
  // Login brute-force protection (spec item 5): counts FAILURES only, keyed
  // per normalized email -- see the peek()/recordFailure() split in
  // lib/rate-limit.js and the /api/auth/signin route below for why a
  // successful sign-in never advances this counter.
  signinFailurePerEmail: { max: Number(process.env.SITEREMADE_RATE_LIMIT_SIGNIN_FAILURE_MAX) || 8, windowMs: Number(process.env.SITEREMADE_RATE_LIMIT_SIGNIN_FAILURE_WINDOW_MS) || 15 * 60 * 1000 },
  // The three expensive, provider-calling routes (spec item 3: "Protect at
  // minimum... plan-website, generate-image, refine-website"). Keyed
  // per-account when signed in (every one of these routes already requires
  // auth, so req.accountId is always present by the time this runs) --
  // per-account is the right key here, not per-IP, since the credit ledger
  // itself is already per-account and this is a second, independent brake
  // on request VOLUME, not spend.
  generation: { max: Number(process.env.SITEREMADE_RATE_LIMIT_GENERATION_MAX) || 20, windowMs: Number(process.env.SITEREMADE_RATE_LIMIT_GENERATION_WINDOW_MS) || 60 * 1000 },
};
// A small, structured, NEVER-leaks-internals 429 body -- spec item 3's
// "no raw internal error leakage" and item 17's "clear retry message, not
// a generic generation failure" apply starting here, at the response shape
// itself, not just in the frontend that reads it.
function rateLimitMiddleware(bucketKeyFn, limitConfig, message) {
  return function (req, res, next) {
    const key = bucketKeyFn(req);
    if (!key) return next(); // no key derivable (shouldn't happen on a guarded route) -- fail open, never crash the request
    const result = rateLimit.checkAndRecord(key, limitConfig.max, limitConfig.windowMs);
    res.setHeader('X-RateLimit-Remaining', String(result.remaining));
    if (!result.allowed) {
      res.setHeader('Retry-After', String(result.retryAfterSeconds));
      return res.status(429).json({ ok: false, message, retryAfterSeconds: result.retryAfterSeconds });
    }
    next();
  };
}
const signupRateLimit = rateLimitMiddleware(req => `signup:${req.ip}`, RATE_LIMITS.signup, 'Too many accounts created from this connection recently. Please try again later.');
const signinRateLimit = rateLimitMiddleware(req => `signin:${req.ip}`, RATE_LIMITS.signin, 'Too many sign-in attempts from this connection recently. Please try again later.');
const generationRateLimit = rateLimitMiddleware(req => `generation:${req.accountId || req.ip}`, RATE_LIMITS.generation, 'Too many requests in a short time.');
// V14 (shared identity bridge pass): the same per-IP request-rate
// discipline as signin/signup above, applied to the new /api/identity/*
// routes -- these call out to a real external service (Supabase's Auth
// API) once configured, so they deserve the same throttle as any other
// route that does real, non-free work per request. Reuses RATE_LIMITS.signin's
// own threshold rather than inventing a third number with no real basis.
const identityRateLimit = rateLimitMiddleware(req => `identity:${req.ip}`, RATE_LIMITS.signin, 'Too many requests in a short time. Please try again later.');
// App bridge pass (Phase 4): the same rateLimitMiddleware helper, per-IP,
// applied BEFORE token verification on every /api/app-bridge/* route (a
// brake on token-guessing floods and on Supabase verification calls). Its
// own, larger default on purpose: unlike /api/identity/*, every legitimate
// caller here is the customer APP'S SERVER -- one egress IP carrying every
// customer's traffic -- so reusing RATE_LIMITS.signin's 15-per-15-minutes
// would throttle all customers collectively. Per-ACCOUNT volume on the one
// expensive bridge route (edits) is additionally braked by the existing
// generationRateLimit, applied after auth.
const APP_BRIDGE_RATE_LIMIT = { max: Number(process.env.SITEREMADE_RATE_LIMIT_APP_BRIDGE_MAX) || 600, windowMs: Number(process.env.SITEREMADE_RATE_LIMIT_APP_BRIDGE_WINDOW_MS) || 60 * 1000 };
const appBridgeRateLimit = rateLimitMiddleware(req => `app-bridge:${req.ip}`, APP_BRIDGE_RATE_LIMIT, 'Too many requests in a short time. Please try again later.');
// Phase 7: the limiter above runs BEFORE token verification and is keyed by
// req.ip on purpose -- it is a pre-auth abuse guard against token-guessing
// floods, nothing more. It was never meant to be each customer's real budget,
// but every legitimate caller here is the customer APP'S SERVER -- one
// shared egress IP for every customer -- so it was, until now, the ONLY
// limit on these routes, meaning one customer's heavy polling could burn
// through the shared bucket and 429 every OTHER customer. Its default was
// raised (120->600/min) so normal shared-IP traffic has real headroom before
// this guard is what bites; it is deliberately generous, not the real brake.
// The real, per-customer brake is this second limiter, applied AFTER
// requireAppBridgeAuth on every route below (edits already had an
// equivalent via generationRateLimit, keyed by req.accountId -- unchanged).
// Keyed by the VERIFIED, server-resolved generator accountId, never
// anything client-supplied, so one customer's activity can never consume
// another customer's bucket. Single-replica, in-memory, like every other
// limiter in this file -- documented scaling trigger: move to shared
// storage before running more than one replica of the generator.
const APP_BRIDGE_ACCOUNT_RATE_LIMIT = { max: Number(process.env.SITEREMADE_RATE_LIMIT_APP_BRIDGE_ACCOUNT_MAX) || 60, windowMs: Number(process.env.SITEREMADE_RATE_LIMIT_APP_BRIDGE_ACCOUNT_WINDOW_MS) || 60 * 1000 };
const appBridgeAccountRateLimit = rateLimitMiddleware(req => `app-bridge-account:${req.accountId}`, APP_BRIDGE_ACCOUNT_RATE_LIMIT, 'Too many requests for this account in a short time. Please try again later.');
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
// Product-flow pass (spec §12): a real post-purchase confirmation email,
// reusing the SAME sendEmail()/Resend integration the pre-purchase lead
// form already uses -- no new email provider, no new credentials. A
// secure DOWNLOAD LINK (not an attachment -- large/fragile) means a link
// to the authenticated My Websites area, never a raw, unauthenticated file
// URL or a bearer token embedded in the email itself (spec: "do not expose
// private tokens in email... require authenticated ownership where
// practical") -- the actual .zip is only ever served by
// /api/deployments/:id/download, which is requireAuth + ownership-checked,
// exactly like every other project route. A missing RESEND_API_KEY is a
// real, honest no-op (never a fake "email sent" claim) -- the purchase and
// snapshot themselves are already durable regardless of whether this
// email succeeds, and a failure here is caught and logged, never allowed
// to fail the webhook response Stripe is waiting on.
function purchaseMyWebsitesUrl() {
  const appBase = String(process.env.SITEREMADE_APP_URL || 'https://app.siteremade.com').replace(/\/$/, '');
  return appBase + '/?view=website';
}
async function sendPurchaseConfirmationEmail({ to, projectName, myWebsitesUrl }) {
  if (!RESEND_API_KEY || !to) return { sent: false, reason: !RESEND_API_KEY ? 'not_configured' : 'no_recipient' };
  const name = escapeHtml(projectName || 'Your website');
  const html = `<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;color:#101114">
    <p style="font-size:12px;letter-spacing:.12em;font-weight:700">SITEREMADE</p>
    <h1 style="font-size:28px;line-height:1.2">Your purchase is confirmed.</h1>
    <p style="font-size:16px;line-height:1.7;color:#555"><strong>${name}</strong> is ready. It's yours -- the real, standalone website files, not something that only works inside SiteRemade.</p>
    <p style="font-size:15px;line-height:1.7">Head to <a href="${myWebsitesUrl}">My Websites</a> in your account to:</p>
    <ul style="font-size:15px;line-height:1.9;color:#333">
      <li>Download your website as a .zip (real source files -- HTML/CSS/JS, a developer README, and a plain-language handoff guide)</li>
      <li>Choose a hosting recommendation, or skip it and host it yourself -- either way, the download is already yours</li>
      <li>Find setup resources for uploading your site, connecting a domain, and publishing future changes</li>
    </ul>
    <p style="font-size:14px;line-height:1.7;color:#777;margin-top:28px">Questions? Reply to this email.</p>
  </div>`;
  const result = await sendEmail({
    from: 'SiteRemade <hello@siteremade.com>', to: [to], reply_to: 'hello@siteremade.com',
    subject: `Your website "${projectName || 'your SiteRemade site'}" is ready`, html,
  });
  return { sent: true, result };
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
// Control-plane pass: a real key alone is no longer sufficient to activate
// paid image generation. SITEREMADE_PAID_IMAGES must ALSO be explicitly
// 'true' -- a deliberate two-key gate (operational readiness vs. "we have
// actually decided to spend money on this"), so a key added for a totally
// different reason (or left over in an environment) can never silently
// start billing image calls. This is a hard invariant: do not collapse it
// back to `!!OPENAI_API_KEY` alone.
const SITEREMADE_PAID_IMAGES = process.env.SITEREMADE_PAID_IMAGES === 'true';
// MULTI-MODEL IMAGE ROUTER PASS (supersedes the single-model "tiered
// quality" pass): auditing that earlier pass against real production
// billing showed the fix was incomplete -- `quality` was routed correctly,
// but the request body still hardcoded `model: 'gpt-image-1'` for every
// single slot, so "cheaper tier" only ever meant "the same expensive model
// at a slightly lower quality setting." A production generation logged ONE
// real image costing roughly $0.50 -- several times this file's own
// previous 'high' estimate ($0.19) -- proving gpt-image-1 itself, at
// whatever quality was actually selected, is too expensive to fund more
// than one or two images under a real per-site budget. There is no way to
// "tier" your way out of that with quality alone: the model itself has to
// change for supporting images. This section now routes different slots
// through genuinely different OpenAI image models, not just different
// quality settings on the same model.
//
// SITEREMADE_IMAGE_MODEL_SUPPORT / SITEREMADE_IMAGE_MODEL_PREMIUM name the
// two models this deployment is allowed to request. Defaults assume
// 'gpt-image-1-mini' exists as a materially cheaper sibling of
// 'gpt-image-1' -- if a deployment's real model catalog uses a different
// name, override these env vars; nothing else in this file or script.js
// needs to change. `IMAGE_MODEL_COST_ESTIMATE_USD` is keyed
// model -> quality -> base(square) cost, with `IMAGE_LANDSCAPE_COST_MULTIPLIER`
// applied for non-square sizes -- this is the "model -> quality -> size ->
// estimated cost" structure the brief asked for, instead of one flat
// low/medium/high table that silently assumed every model costs the same.
// Every number is an env-overridable ESTIMATE, not a verified OpenAI price
// (see the honesty note on SITEREMADE_IMAGE_BUDGET_USD below) -- the
// premium figures here are set conservatively HIGH (informed by the real
// ~$0.50 production data point above), specifically so the allocator will
// naturally avoid the premium model under a normal budget unless a
// deployment explicitly raises the ceiling or overrides these estimates
// with real observed numbers.
const IMAGE_MODEL_SUPPORT = process.env.SITEREMADE_IMAGE_MODEL_SUPPORT || 'gpt-image-1-mini';
const IMAGE_MODEL_PREMIUM = process.env.SITEREMADE_IMAGE_MODEL_PREMIUM || 'gpt-image-1';
// Server-side allowlist -- the browser can request a model/quality by name,
// but it can NEVER get anything outside this list actually sent to OpenAI.
// Anything else is safely downgraded to the cheap support model, never
// rejected in a way that blocks the whole generation.
const ALLOWED_IMAGE_MODELS = Array.from(new Set([IMAGE_MODEL_SUPPORT, IMAGE_MODEL_PREMIUM]));
const ALLOWED_IMAGE_QUALITIES = ['low', 'medium', 'high'];
const ALLOWED_IMAGE_ASPECT_RATIOS = ['1:1', '16:9', '4:3', '4:5', '3:4'];
const IMAGE_MODEL_COST_ESTIMATE_USD = {
  [IMAGE_MODEL_SUPPORT]: {
    low: Number(process.env.SITEREMADE_IMAGE_COST_SUPPORT_LOW_USD) || 0.006,
    medium: Number(process.env.SITEREMADE_IMAGE_COST_SUPPORT_MEDIUM_USD) || 0.015,
    high: Number(process.env.SITEREMADE_IMAGE_COST_SUPPORT_HIGH_USD) || 0.03
  },
  [IMAGE_MODEL_PREMIUM]: {
    low: Number(process.env.SITEREMADE_IMAGE_COST_PREMIUM_LOW_USD) || 0.05,
    medium: Number(process.env.SITEREMADE_IMAGE_COST_PREMIUM_MEDIUM_USD) || 0.15,
    high: Number(process.env.SITEREMADE_IMAGE_COST_PREMIUM_HIGH_USD) || 0.45
  }
};
const IMAGE_LANDSCAPE_COST_MULTIPLIER = Number(process.env.SITEREMADE_IMAGE_LANDSCAPE_COST_MULTIPLIER) || 1.4;
// Upper bound on one provider image call (see imageProviders.openai.generate).
const IMAGE_PROVIDER_TIMEOUT_MS = Number(process.env.SITEREMADE_IMAGE_PROVIDER_TIMEOUT_MS) || 150000;
function estimateImageRouteCostUsd(model, quality, aspectRatio) {
  const safeModel = ALLOWED_IMAGE_MODELS.includes(model) ? model : IMAGE_MODEL_SUPPORT;
  const safeQuality = ALLOWED_IMAGE_QUALITIES.includes(quality) ? quality : 'medium';
  const base = (IMAGE_MODEL_COST_ESTIMATE_USD[safeModel] || IMAGE_MODEL_COST_ESTIMATE_USD[IMAGE_MODEL_SUPPORT])[safeQuality];
  const isSquare = !aspectRatio || aspectRatio === '1:1';
  return isSquare ? base : Number((base * IMAGE_LANDSCAPE_COST_MULTIPLIER).toFixed(4));
}
// HONESTY NOTE (do not remove): the previous pass's $0.30 default and its
// low/medium/high estimates were shown, by real billing, to diverge sharply
// from what OpenAI actually charged -- this file has NEVER had a way to
// know the real price in advance, only a configurable guess used to drive
// the allocator's own internal comparisons. Lowering the default here to
// $0.10 (per the brief's $0.08-$0.12 target) does NOT mean generations are
// now guaranteed to cost $0.10 -- it means the allocator will stop trying
// to fund routes once its own (still-approximate) running estimate reaches
// that figure. Treat every dollar figure in this file as a planning input,
// not a billing guarantee, and update the env vars above once real
// per-model/per-quality invoice data is available.
const SITEREMADE_IMAGE_BUDGET_USD = Number(process.env.SITEREMADE_IMAGE_BUDGET_USD) || 0.10;
// HERO STORYBOARD: the hero is built from several separately generated images
// (lib/premium/hero-storyboard.js -- a lead plus at least two supporting
// images). They are funded from their OWN allowance, reserved separately from
// the site budget above, so a small site budget can never quietly cut the hero
// back to one image. Default: this deployment's own route prices for a lead on
// the premium model at medium plus three supporting images on the support
// model at medium (portrait sizes), so it scales with SITEREMADE_IMAGE_COST_*.
const SITEREMADE_HERO_IMAGE_BUDGET_USD = Number(process.env.SITEREMADE_HERO_IMAGE_BUDGET_USD)
  || Number((estimateImageRouteCostUsd(IMAGE_MODEL_PREMIUM, 'medium', '4:5') + 3 * estimateImageRouteCostUsd(IMAGE_MODEL_SUPPORT, 'medium', '4:5')).toFixed(4));
const HERO_MIN_IMAGES = 3;
// Server-side spend reservation (see the /api/generate-image handler
// below for the full explanation of what this does and does not
// guarantee): a per-project running total, reserved synchronously BEFORE
// each provider call and refunded on failure, so the server enforces the
// SAME ceiling it quotes the client rather than only trusting the client's
// own arithmetic. Reservations reset after a window of inactivity so a
// legitimate later regeneration (industry change, new upload, etc.) is
// never permanently blocked by an earlier generation's spend.
const IMAGE_SPEND_RESERVATION_WINDOW_MS = 5 * 60 * 1000;
const imageSpendReservations = new Map();
function reserveImageSpend(key, estimatedCostUsd, ceilingUsd = SITEREMADE_IMAGE_BUDGET_USD) {
  const now = Date.now();
  let entry = imageSpendReservations.get(key);
  if (!entry || (now - entry.windowStartedAt) > IMAGE_SPEND_RESERVATION_WINDOW_MS) {
    entry = { spentUsd: 0, windowStartedAt: now };
  }
  const projectedTotal = entry.spentUsd + estimatedCostUsd;
  if (projectedTotal > ceilingUsd + 1e-9) {
    imageSpendReservations.set(key, entry);
    return { ok: false, spentUsd: entry.spentUsd };
  }
  entry.spentUsd = projectedTotal;
  imageSpendReservations.set(key, entry);
  // Opportunistic cleanup -- bounded O(n) sweep of stale windows, run
  // inline rather than on a timer so this file adds no new background
  // process. Cheap at this codebase's scale; a high-traffic deployment
  // would replace this Map with a real store (out of scope here).
  if (imageSpendReservations.size > 500) {
    for (const [k, v] of imageSpendReservations) {
      if ((now - v.windowStartedAt) > IMAGE_SPEND_RESERVATION_WINDOW_MS) imageSpendReservations.delete(k);
    }
  }
  return { ok: true, spentUsd: entry.spentUsd };
}
function releaseImageSpend(key, estimatedCostUsd) {
  const entry = imageSpendReservations.get(key);
  if (entry) entry.spentUsd = Math.max(0, entry.spentUsd - estimatedCostUsd);
}
const imageProviders = {
  openai: {
    name: 'openai',
    configured: () => !!OPENAI_API_KEY && SITEREMADE_PAID_IMAGES,
    async generate(prompt, { aspectRatio, quality, model, size: sizeOverride } = {}) {
      // Legacy behaviour is unchanged (4:3 still maps to a square). PREMIUM_GENERATION_V1 passes an explicit
      // ratio-appropriate size so images are generated for the slot, not generated square and cropped.
      // HERO STORYBOARD: portrait layers (4:5 / 3:4) are generated portrait rather than square-then-cropped; the cost estimate
      // already prices every non-square request with the landscape multiplier, so this changes no budget.
      const size = sizeOverride || (aspectRatio === '1:1' ? '1024x1024' : aspectRatio === '16:9' ? '1536x1024' : (aspectRatio === '4:5' || aspectRatio === '3:4') ? '1024x1536' : '1024x1024');
      const safeQuality = ALLOWED_IMAGE_QUALITIES.includes(quality) ? quality : 'medium';
      // Allowlist enforcement happens here, not just in the route handler,
      // so this stays safe even if another call site is ever added above
      // it -- an unrecognized model name is silently downgraded to the
      // cheap support model rather than forwarded to OpenAI or rejected
      // outright (a malformed/tampered request should never crash the
      // generation, it should just fail cheap).
      const safeModel = ALLOWED_IMAGE_MODELS.includes(model) ? model : IMAGE_MODEL_SUPPORT;
      // This call previously had no timeout at all -- a hung provider
      // request held its credit + spend reservation indefinitely. Generous
      // on purpose: gpt-image-1 at high quality routinely takes well over
      // 30s, and cutting a call off after OpenAI has started work still
      // costs money. The browser now waits longer than this (see script.js
      // IMAGE_REQUEST_TIMEOUT_MS) so the server always settles first.
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), IMAGE_PROVIDER_TIMEOUT_MS);
      let response;
      try {
        response = await fetch('https://api.openai.com/v1/images/generations', {
          method: 'POST',
          headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: safeModel, prompt, size, quality: safeQuality, n: 1 }),
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timer);
      }
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error((data && data.error && data.error.message) || `Image provider returned ${response.status}`);
      const b64 = data && data.data && data.data[0] && data.data[0].b64_json;
      if (!b64) throw new Error('Image provider returned no image data');
      return { dataUrl: `data:image/png;base64,${b64}`, quality: safeQuality, model: safeModel };
    }
  }
  // Add another provider here (same {name, configured(), generate()} shape)
  // and point `activeImageProvider` at it -- nothing else in this file or
  // in script.js needs to change to swap providers.
};
const activeImageProvider = imageProviders.openai;

app.get('/api/image-provider-status', (req, res) => {
  const configured = activeImageProvider.configured();
  const reason = configured ? undefined
    : !OPENAI_API_KEY ? 'No server-side image-generation API key is configured in this environment.'
    : 'Paid image generation is disabled (SITEREMADE_PAID_IMAGES is not set to true).';
  // budgetUsd/costEstimateUsd/models/landscapeCostMultiplier let the
  // client's deterministic spend planner (script.js) read this
  // deployment's real, env-configured economics instead of guessing -- the
  // client never hardcodes a second copy of these numbers. Present even
  // when `configured` is false so the client's planner always has real
  // numbers to reason with, not undefined. costEstimateUsd is now nested
  // by model (not a flat low/medium/high table) since different models
  // have materially different economics -- see IMAGE_MODEL_COST_ESTIMATE_USD.
  // DYNAMIC CREDIT COSTING PASS: creditCosts is the credit-side sibling of
  // costEstimateUsd above, same reasoning -- the client's allocator
  // (script.js buildImagePlan's planAffordableImages-style logic) needs
  // real per-route CREDIT prices to reason about, not just dollars, and
  // must never hardcode a second copy of SITEREMADE_CREDIT_COST_IMAGE_*.
  res.json({
    // PREMIUM_GENERATION_V1: the client planner needs the SAME budgets/tiers/prices the server enforces (numbers only, no secrets).
    premium: premiumCore.cfg.enabled ? { enabled: true, cfg: premiumCore.cfg } : { enabled: false },
    configured,
    provider: configured ? activeImageProvider.name : null,
    reason,
    budgetUsd: SITEREMADE_IMAGE_BUDGET_USD,
    heroBudgetUsd: SITEREMADE_HERO_IMAGE_BUDGET_USD, heroMinImages: HERO_MIN_IMAGES,
    models: { support: IMAGE_MODEL_SUPPORT, premium: IMAGE_MODEL_PREMIUM },
    costEstimateUsd: IMAGE_MODEL_COST_ESTIMATE_USD,
    creditCosts: { support: SITEREMADE_CREDIT_COST_IMAGE_SUPPORT, premium: SITEREMADE_CREDIT_COST_IMAGE_PREMIUM },
    landscapeCostMultiplier: IMAGE_LANDSCAPE_COST_MULTIPLIER
  });
});

// PRICING PASS: public, unauthenticated -- purely marketing/checkout config,
// same posture as /api/image-provider-status above. script.js fetches this
// once on load to keep the static HTML price copy (a design-time fallback
// only, so the page still shows a correct number with JS disabled or before
// this fetch resolves) in sync with the one real canonical price constant
// this server actually charges via Stripe. Never conflated with the app's
// own subscription/monthly price, which this endpoint has no knowledge of.
app.get('/api/pricing', (req, res) => {
  res.json({
    ok: true,
    websitePriceCents: SITEREMADE_WEBSITE_PRICE_CENTS,
    websitePriceCurrency: SITEREMADE_WEBSITE_PRICE_CURRENCY,
    websitePriceDisplay: formatWebsitePriceDisplay()
  });
});

// PREMIUM_GENERATION_V1 image path. Differences from the legacy path, all deliberate:
//  - the ONLY spend gate is the per-generation BudgetGovernor (hard/soft budgets from config), not the $0.10 legacy
//    reservation; concurrent requests reserve synchronously so parallel slots cannot jointly overshoot;
//  - the prompt is guarded: UI-mockup requests are refused, the no-text/no-UI tail is always present;
//  - the image is generated at a ratio-appropriate provider size;
//  - a cheap deterministic evaluation (no paid vision call) decides whether the result is usable; a poor result gets
//    AT MOST ONE retry with a genuinely different (simplified) prompt, then the caller falls back to a designed visual;
//  - a poor result is never charged to the customer's credits.
const premiumInflight = new Map(); // generationId -> estimated USD reserved but not yet in the ledger
async function generatePremiumImage({ accountId, prompt, promptAlt, model, quality, aspectRatio, taskType, projectId, anonId, generationId, premiumTier, phase, deferSettlement }) {
  const P = premiumLib.images;
  const startedAt = Date.now();
  const safeModel = ALLOWED_IMAGE_MODELS.includes(model) ? model : IMAGE_MODEL_SUPPORT;
  const safeQuality = ALLOWED_IMAGE_QUALITIES.includes(quality) ? quality : 'medium';
  const safeAspect = ALLOWED_IMAGE_ASPECT_RATIOS.includes(aspectRatio) ? aspectRatio : '1:1';
  if (!prompt) return { ok: false, reason: 'missing_prompt' };
  const lint = P.lintImagePrompt(prompt);
  if (!lint.ok && lint.problems.some(p => /interface content/.test(p))) return { ok: false, reason: 'prompt_rejected', problems: lint.problems };
  const safePrompt = /no text/i.test(prompt) ? prompt : (prompt + ' ' + P.NEGATIVE_TAIL);
  const session = premiumSession(generationId);
  const est = premiumLib.imageCostUsd(premiumCore.cfg, { model: safeModel === IMAGE_MODEL_PREMIUM ? 'premium' : 'support', quality: safeQuality, aspectRatio: safeAspect });
  const inflight = premiumInflight.get(generationId) || 0;
  const decision = session.governor.decide({ operation: 'image_generation', phase: phase === 'repair' ? 'repair' : 'first_draft', priority: premiumTier === 'hero' ? 'critical' : premiumTier === 'decorative' ? 'optional' : 'normal', estimatedUsd: est, committedUsd: inflight });
  if (!decision.allowed) return { ok: false, reason: 'budget_exceeded', budgetLimitReached: decision.budgetLimitReached };
  const creditCost = creditCostForImageRoute(safeModel);
  let creditReserved = false, creditOp = null;
  if (accountId && creditCost > 0) {
    const cr = reserveCredit(accountId, creditCost, 'image');
    if (!cr.ok) return { ok: false, reason: 'credits_exceeded', creditsRemaining: cr.remaining };
    creditReserved = true; creditOp = cr.opId;
  }
  premiumInflight.set(generationId, inflight + est);
  const done = () => { premiumInflight.set(generationId, Math.max(0, (premiumInflight.get(generationId) || 0) - est)); };
  const size = P.providerSizeFor(safeAspect);
  let attempt = 0, current = safePrompt, evalResult = null, result = null;
  try {
    for (;;) {
      result = await activeImageProvider.generate(current, { aspectRatio: safeAspect, quality: safeQuality, model: safeModel, size });
      recordOperation({ operationType: taskType || 'IMAGE_GENERATE', provider: activeImageProvider.name, model: result.model || safeModel, ok: true, imageCount: 1, imageSize: safeAspect, imageQuality: result.quality || safeQuality, estimatedCostUsd: est, latencyMs: Date.now() - startedAt, projectId, accountId, anonId, generationId, retryCount: attempt, phase });
      evalResult = P.evaluateImageDeterministic(result.dataUrl, safeAspect);
      const next = P.retryDecision({ attempt, evaluation: evalResult }, premiumCore.cfg);
      if (next.action !== 'retry' || !promptAlt) break;
      // a retry is only run if the budget still allows it
      const again = session.governor.decide({ operation: 'image_generation', phase: 'repair', priority: 'high', estimatedUsd: est, committedUsd: premiumInflight.get(generationId) - est });
      if (!again.allowed) break;
      attempt = next.attempt; current = /no text/i.test(promptAlt) ? promptAlt : (promptAlt + ' ' + P.NEGATIVE_TAIL);
    }
  } catch (error) {
    console.error('Premium image generation failed:', error);
    done(); if (creditReserved) releaseCredit(creditOp);
    recordOperation({ operationType: taskType || 'IMAGE_GENERATE', provider: activeImageProvider.name, model: safeModel, ok: false, imageCount: 0, latencyMs: Date.now() - startedAt, projectId, accountId, anonId, generationId });
    return { ok: false, reason: 'provider_error' };
  }
  done();
  if (evalResult && evalResult.poor) { // never charge a customer for an unusable image; caller falls back to a designed visual
    if (creditReserved) releaseCredit(creditOp);
    return { ok: false, reason: 'poor_image', evaluation: evalResult, retried: attempt > 0 };
  }
  const okResult = { ok: true, dataUrl: result.dataUrl, quality: result.quality || safeQuality, model: result.model || safeModel, creditsCharged: creditReserved ? creditCost : 0, evaluation: evalResult, retried: attempt > 0 };
  if (!deferSettlement) { if (creditReserved) commitCredit(creditOp); return okResult; }
  let settled = false; // bridge edits: credits stay reserved until the edit is actually saved (spend is already in the USD ledger either way)
  okResult.settle = {
    commit() { if (settled) return; settled = true; if (creditReserved) commitCredit(creditOp); },
    release() { if (settled) return; settled = true; if (creditReserved) releaseCredit(creditOp); },
  };
  return okResult;
}

// App bridge pass (Phase 4): the body of /api/generate-image, factored out
// UNCHANGED in order and substance into one function so there is exactly
// one implementation of "generate a paid image" -- used by the existing
// browser route below AND by the new server-authoritative
// POST /api/app-bridge/website/:projectId/edits flow. Every gate runs here,
// in the same order as before, for both callers:
//   1. activeImageProvider.configured() -- which is false unless BOTH
//      OPENAI_API_KEY is set AND SITEREMADE_PAID_IMAGES === 'true' (the
//      kill switch; never read, set, or defaulted anywhere else);
//   2. model/quality/aspect re-validated against the server allowlists;
//   3. credit reservation (lib/credits.js reserveCredits), priced by
//      creditCostForImageRoute(model) -- BEFORE any provider call;
//   4. per-key USD spend reservation (reserveImageSpend) against
//      SITEREMADE_IMAGE_BUDGET_USD -- BEFORE any provider call;
//   5. the provider call; commit on success, release on any failure.
// `reservationKey` is the caller's choice of spend-budget key: the browser
// route keys by the browser-supplied projectId (its own in-browser
// `proj_<timestamp>` meta id) or the anon cookie id, exactly as before;
// the bridge keys by the SERVER's real projects.id (a different namespace --
// `proj_<random>` -- so the two can never be confused), because a
// server-to-server call has no browser id to key off.
//
// `deferSettlement` (bridge only): on success, credits stay RESERVED and
// the spend stays reserved until the caller calls settle.commit() (after
// the edit is actually saved) or settle.release() (if anything later in
// the edit fails, so nothing is saved) -- a failed edit never leaves a
// permanent charge. The browser route never passes it, so its settlement
// timing is unchanged.
//
// One deliberate behavior fix, applying to BOTH callers: when the USD
// spend reservation is refused (budgetExceeded), the credit reservation
// made one step earlier is now released. Previously that path returned
// without releasing it, leaving those credits "reserved" (unusable) until
// the next UTC-day rollover.
async function generateImageWithCredits({ accountId, prompt, model, quality, aspectRatio, reservationKey, taskType, projectId, anonId, deferSettlement = false, generationId = null, promptAlt = null, premiumTier = null, phase = null, spendBucket = null, direction = null }) {
  // Every caller today serves the Business generator; `direction` names the website when the caller has it. Refused
  // before any credit reservation or provider call.
  if (!visualMode.allowsGeneratedImages(direction)) return { ok: false, reason: 'starter_visuals_only' };
  if (!activeImageProvider.configured()) return { ok: false, reason: 'not_configured' };
  await prepareCredits(accountId);
  const premiumOn =premiumCore.cfg.enabled && !!generationId && /^gen_[a-z0-9]{6,40}$/.test(generationId);
  if (premiumOn) return generatePremiumImage({ accountId, prompt, promptAlt, model, quality, aspectRatio, taskType, projectId, anonId, generationId, premiumTier, phase, deferSettlement });
  const startedAt = Date.now();
  const safeModel = ALLOWED_IMAGE_MODELS.includes(model) ? model : IMAGE_MODEL_SUPPORT;
  const safeQuality = ALLOWED_IMAGE_QUALITIES.includes(quality) ? quality : 'medium';
  const safeAspectRatio = ALLOWED_IMAGE_ASPECT_RATIOS.includes(aspectRatio) ? aspectRatio : '1:1';
  const estimatedCostUsd = estimateImageRouteCostUsd(safeModel, safeQuality, safeAspectRatio);
  const creditCost = creditCostForImageRoute(safeModel);
  let creditReserved = false, creditOp = null;
  if (accountId && creditCost > 0) {
    const creditReservation = reserveCredit(accountId, creditCost, 'image');
    if (!creditReservation.ok) return { ok: false, reason: 'credits_exceeded', creditsRemaining: creditReservation.remaining };
    creditReserved = true; creditOp = creditReservation.opId;
  }
  // See the SERVER-SIDE SPEND ENFORCEMENT note on /api/generate-image below
  // for exactly what this per-process reservation does and doesn't guarantee.
  // hero-storyboard images spend from the hero allowance, everything else from the site budget
  const spendKey = spendBucket === 'hero' ? `${reservationKey}::hero` : reservationKey;
  const reservation = reserveImageSpend(spendKey, estimatedCostUsd, spendBucket === 'hero' ? SITEREMADE_HERO_IMAGE_BUDGET_USD : SITEREMADE_IMAGE_BUDGET_USD);
  if (!reservation.ok) {
    if (creditReserved) releaseCredit(creditOp); // behavior fix -- see header
    return { ok: false, reason: 'budget_exceeded' };
  }
  const releaseAll = () => {
    releaseImageSpend(spendKey, estimatedCostUsd);
    if (creditReserved) releaseCredit(creditOp);
  };
  if (!prompt) {
    releaseAll(); // never charged for a request that never reached the provider
    return { ok: false, reason: 'missing_prompt' };
  }
  try {
    const result = await activeImageProvider.generate(prompt, { aspectRatio: safeAspectRatio, quality: safeQuality, model: safeModel });
    const usedQuality = result.quality || safeQuality;
    const usedModel = result.model || safeModel;
    const record = (settled) => recordOperation({ operationType: taskType, provider: activeImageProvider.name, model: usedModel, ok: true, imageCount: 1, imageSize: safeAspectRatio || null, imageQuality: usedQuality, estimatedCostUsd, creditCost: creditReserved ? creditCost : null, creditsCharged: (creditReserved && settled) ? creditCost : 0, latencyMs: Date.now() - startedAt, projectId, accountId, anonId });
    if (!deferSettlement) {
      record(true);
      if (creditReserved) commitCredit(creditOp);
      return { ok: true, dataUrl: result.dataUrl, quality: usedQuality, model: usedModel, provider: activeImageProvider.name, estimatedCostUsd, creditsCharged: creditReserved ? creditCost : 0 };
    }
    let settled = false;
    return {
      ok: true, dataUrl: result.dataUrl, quality: usedQuality, model: usedModel,
      creditsCharged: creditReserved ? creditCost : 0,
      settle: {
        commit() { if (settled) return; settled = true; record(true); if (creditReserved) commitCredit(creditOp); },
        release() { if (settled) return; settled = true; record(false); releaseAll(); },
      },
    };
  } catch (error) {
    console.error('Image generation failed:', error);
    releaseAll(); // a failed attempt never permanently charges a credit
    recordOperation({ operationType: taskType, provider: activeImageProvider.name, model: safeModel, ok: false, imageCount: 0, creditCost: creditReserved ? creditCost : null, creditsCharged: 0, latencyMs: Date.now() - startedAt, projectId, accountId, anonId });
    return { ok: false, reason: 'provider_error' };
  }
}

// UNIFIED ACCOUNT / AUTH-GATED GENERATION pass: same enforcement as
// /api/plan-website above -- requireAuth instead of withOptionalAuth, so
// an unauthenticated image-generation attempt is refused (401) before this
// handler's body runs.
//
// MULTI-MODEL IMAGE ROUTER PASS: `model`/`quality`/`aspectRatio` are the
// client's own deterministic route planner's decision for this slot (see
// script.js chooseImageRoute/buildImagePlan). None of the three are
// trusted blindly -- each is re-validated against a strict server-side
// allowlist in generateImageWithCredits above and in
// activeImageProvider.generate() itself, so a malformed or tampered request
// can never reach OpenAI with an unapproved model, an unapproved quality,
// or silently request the most expensive route by default.
//
// DYNAMIC CREDIT COSTING PASS (product economics): a signed-in account's
// daily credit allowance gates this route too -- independent of, and in
// addition to, the dollar-denominated SITEREMADE_IMAGE_BUDGET_USD
// provider-spend guard, which controls what THIS SERVER spends, not what a
// given customer is allowed to ask for today. The credit price is decided
// from the validated model -- support vs. premium -- never a flat
// per-task-type number, and is reserved strictly BEFORE
// activeImageProvider.generate() is ever called: no paid provider call
// happens unless the matching credit reservation already succeeded.
//
// SERVER-SIDE SPEND ENFORCEMENT, and its real limits (do not remove this
// note): the client computes its own image plan and spend ceiling, but
// the reservation is the server's OWN independent check against the SAME
// configured ceiling -- it does not just trust whatever the client sends.
// The reservation check-and-increment runs synchronously, before the
// `await` to OpenAI, so within a single Node process it is a real atomic
// guard: two concurrent requests for the same key cannot both slip past
// the check, because Node's event loop cannot interleave two synchronous
// blocks. What this does NOT guarantee: if this deployment runs more than
// one server instance/replica (Railway horizontal scaling), each instance
// holds its own in-memory reservation map, so the true cross-instance
// ceiling is (budget x instance count), not a single global cap -- there
// is no shared store here, and adding one (Redis, a DB row with a real
// lock) would be a materially bigger change than this pass's scope. This
// is the strongest enforcement that fits the current architecture without
// that rewrite; it is a real per-instance, per-key guard, not a claim of a
// global billing cap.
//
// App bridge pass (Phase 4): the handler body now delegates to
// generateImageWithCredits; every response shape below is unchanged.
// Browser-route image delivery: stores every paid result and replays it for
// a repeated request key instead of paying again (see lib/image-delivery.js
// for the lost-image bug this fixes). The app-bridge edit flow still calls
// generateImageWithCredits directly -- its deferred-settlement contract is
// unchanged.
const imageDelivery = createImageDelivery({
  generate: args => generateImageWithCredits(args),
  events: generationEvents,
  storeImage: dataUrl => projectStore.storeImageDataUrl(db, dataUrl),
  loadImage: hash => projectStore.loadImageDataUrl(db, hash),
});
app.post('/api/generate-image', requireAuth, generationRateLimit, async (req, res) => {
  const anonId = ensureAnonId(req, res);
  // taskType/projectId are purely observability metadata the client
  // attaches (see script.js's ExecutionPlan) -- absent or wrong, this route
  // behaves identically; the ledger just falls back to a generic label.
  const taskType = clean(req.body.taskType, 40) || 'IMAGE_GENERATE';
  const projectId = clean(req.body.projectId, 60);
  // The browser's own identity for this exact image (project :: slot :: plan
  // cacheKey). Optional -- without it the request behaves exactly as before,
  // just without replay/join protection.
  const requestKey = clean(req.body.requestKey, 300);
  // If the browser gives up before we answer (its own timeout, a closed tab,
  // a dropped connection), the image is normally still stored and replayable
  // -- this just records that it happened, so "paid but never shown" is
  // visible. It is an ADDITIONAL row: the same request also has its own
  // delivery row ('delivered' / 'delivered_not_stored' / 'replayed' /
  // 'joined') written by lib/image-delivery.js, which carries the charge.
  let clientGone = false;
  res.on('close', () => { if (!res.writableFinished) clientGone = true; });
  const result = await imageDelivery.deliver({
    accountId: req.accountId, prompt: clean(req.body.prompt, 1200),
    model: clean(req.body.model, 40), quality: clean(req.body.quality, 10), aspectRatio: clean(req.body.aspectRatio, 10),
    reservationKey: projectId || anonId || 'anonymous', taskType, projectId, anonId, requestKey,
    // PREMIUM_GENERATION_V1 (ignored unless the flag is on)
    generationId: clean(req.body.premiumGenerationId, 60) || null, promptAlt: clean(req.body.promptAlt, 1200) || null, premiumTier: clean(req.body.premiumTier, 20) || null,
    spendBucket: req.body.heroLayer === true ? 'hero' : null, // HERO STORYBOARD: the hero's own image allowance
  });
  if (clientGone && result.ok) {
    // creditsCharged stays null here so summing credits over image rows never
    // counts this charge twice -- it is on the delivery row.
    const deliveryOutcome = result.replayed ? 'replayed' : result.joined ? 'joined' : (result.stored ? 'delivered' : 'delivered_not_stored');
    generationEvents.record({ kind: 'image', outcome: 'client_disconnected', accountId: req.accountId, projectId, requestKey, model: result.model, quality: result.quality, creditsCharged: null, detail: { deliveryOutcome, creditsChargedOnDeliveryRow: Number.isFinite(result.creditsCharged) ? result.creditsCharged : null, recoverableByReplay: !!(requestKey && req.accountId && result.stored) } });
  }
  if (result.ok) {
    // creditsCharged lets the client accumulate/display the real per-image
    // charge (spec: "after generation show actual charge") without
    // re-deriving support/premium pricing itself -- backend stays the sole
    // source of truth for the number, same principle as creditsRemaining.
    // A replayed/joined result is 0 -- that image was already paid for once.
    return res.json({ ok: true, dataUrl: result.dataUrl, quality: result.quality, model: result.model, evaluation: result.evaluation || undefined, creditsCharged: result.creditsCharged, replayed: !!result.replayed, creditsRemaining: req.accountId ? creditsSummaryFor(req.accountId).remaining : null });
  }
  if (result.reason === 'starter_visuals_only') return res.status(200).json({ ok: false, configured: true, starterVisualsOnly: true, creditsCharged: 0, message: 'This website uses SiteRemade starter visuals and your own uploads; no image was generated and no credits were used.' });
  if (result.reason === 'not_configured') return res.status(200).json({ ok: false, configured: false, message: 'Image generation is not configured on this environment yet.' });
  if (result.reason === 'credits_exceeded') return res.status(200).json({ ok: false, configured: true, creditsExceeded: true, creditsRemaining: result.creditsRemaining, message: 'Not enough credits for this image.' });
  if (result.reason === 'budget_exceeded') return res.status(200).json({ ok: false, configured: true, budgetExceeded: true, message: 'This generation reached its image limit, so this picture was not made. Your credits were not used for it.' });
  if (result.reason === 'missing_prompt') return res.status(400).json({ ok: false, message: 'Missing prompt.' });
  if (result.reason === 'poor_image') return res.status(200).json({ ok: false, configured: true, poorImage: true, message: 'The generated image was not good enough to use, so a designed visual is shown instead. You were not charged for it.' });
  if (result.reason === 'prompt_rejected') return res.status(400).json({ ok: false, message: 'That image request was refused.' });
  return res.status(500).json({ ok: false, message: 'Could not generate image right now.' });
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

// `context` ({accountId, projectId, taskType}) is optional and only feeds the
// durable record -- the in-memory lastAttempt keeps its original shape.
function recordPlannerAttempt(attempt, context) {
  // lastAttempt is served by the PUBLIC /api/planner-status route, so it
  // keeps exactly its original fields -- the richer per-request detail
  // (generationId, token counts, plan shape) goes only to the private
  // durable store below.
  plannerDiagnostics.lastAttempt = {
    timestamp: new Date().toISOString(),
    outcome: attempt.outcome,
    ...(attempt.latencyMs !== undefined ? { latencyMs: attempt.latencyMs } : {}),
    ...(attempt.model !== undefined ? { model: attempt.model } : {}),
    ...(attempt.errorCategory !== undefined ? { errorCategory: attempt.errorCategory } : {}),
  };
  const ctx = context || {};
  generationEvents.record({
    kind: 'planner', outcome: attempt.outcome, accountId: ctx.accountId || null, projectId: ctx.projectId || null,
    provider: 'anthropic', model: attempt.model || null, latencyMs: attempt.latencyMs,
    detail: { taskType: ctx.taskType || null, generationId: attempt.generationId || null, errorCategory: attempt.errorCategory || null, inputTokens: attempt.inputTokens, outputTokens: attempt.outputTokens, pages: attempt.pages, imagePlanEntries: attempt.imagePlanEntries, hasOfferings: attempt.hasOfferings },
  });
}

// ---- Control plane: operation cost classification + ledger ---------------
// Internal cost CLASS, not dollars -- see the architecture-pass brief part
// 12/13. Every real AI or image-generation operation this server performs
// is classified once, here, and every recorded ledger entry (below) carries
// that classification. This is what a real credit system would eventually
// meter against; this pass only makes the technical system capable of
// knowing what expensive work actually happened.
const OPERATION_COST_CLASS = {
  NEW_SITE: 'standard', NEW_DIRECTION: 'standard',
  COPY_REWRITE: 'cheap', COPY_TARGET_CHANGE: 'cheap', QUALITY_REPAIR: 'cheap',
  IMAGE_REGENERATE: 'standard', IMAGE_ADD: 'standard', IMAGE_GENERATE: 'standard',
  SECTION_REORDER: 'free', STYLE_CHANGE: 'free', COLOR_CHANGE: 'free', TYPOGRAPHY_CHANGE: 'free',
  LAYOUT_CHANGE: 'free', IMAGE_REMOVE: 'free', PAGE_ADD: 'free', PAGE_REMOVE: 'free',
  SECTION_ADD: 'free', SECTION_REMOVE: 'free', CONTENT_EDIT: 'free', RESPONSIVE_FIX: 'free'
};
function classifyOperationCost(taskType) { return OPERATION_COST_CLASS[taskType] || 'standard'; }

// ---- Product-flow pass: customer-facing daily credits ---------------------
// Maps the SAME cost-class taxonomy above onto real credit numbers a
// signed-in customer actually sees and spends -- this is deliberately the
// only place a "how many credits does X cost" number is defined, so it's
// never scattered across routes (spec: "config-driven commercial settings...
// do not scatter commercial numbers across frontend code"). `free` actions
// (color/spacing/reorder/text edits/etc.) never reach this at all in
// practice -- see server.js's own /api/refine-website comment on the
// client's local/deterministic classifier already keeping them from
// calling the server -- but are defined as 0 here too, as real defense in
// depth, not just an assumption. Users are never charged based on raw
// token counts (spec: "Do NOT charge users based on raw token counts") --
// every credit cost below is a flat number per ACTION, independent of
// however many tokens/images that action happens to use underneath; the
// operationLedger above remains the place raw provider cost/token
// observability lives, entirely separate from what a customer is charged.
// Credit-architecture fix: this default is now the SOLE authenticated
// throttle on generation (see /api/plan-website below), so its size is a
// real product decision, spelled out here rather than left as an
// arbitrary round number:
//   10 credits/day ÷ 3 credits (the 'standard' cost class below) =
//   EXACTLY 3 full NEW_SITE/NEW_DIRECTION generations per signed-in
//   account per day, with 1 credit left over.
// That "3" deliberately matches this product's own long-standing "3
// website directions" mental model (the same number the client's
// per-project MAX_DIRECTIONS and the retired lib/entitlement.js lifetime
// cap both used) -- the difference is this allowance RENEWS every UTC
// day instead of applying once per account forever. The 1 leftover
// credit is enough for exactly one 'cheap' action (COPY_REWRITE/
// COPY_TARGET_CHANGE/QUALITY_REPAIR, 1 credit each) after 3 generations,
// or can simply go unused. A generation that ALSO spends on paid images
// (IMAGE_GENERATE/IMAGE_ADD/IMAGE_REGENERATE -- each also 'standard' = 3
// credits, see the Image Decision Engine's own separate dollar-budget
// gate for whether a given slot pays for an image at all) draws from
// this SAME pool, so a day spent generating directions with paid images
// exhausts the allowance faster than 3 bare-copy generations -- this is
// intentional, not an oversight: images are the single most expensive
// action class, and the allowance is deliberately sized around the
// cheaper, always-necessary planning action, not a worst-case
// fully-imaged day. Raise SITEREMADE_DAILY_FREE_CREDITS in production if
// a more generous daily ceiling is wanted; the arithmetic above just
// documents what the shipped default actually buys someone.
// FINAL GENERATOR HARDENING pass: reconfirmed by direct audit as THE one
// authoritative backend credit-configuration source -- every other place
// a number related to credits appears (creditsSummaryFor below,
// /api/credits, the client's Generate-button label/credit indicator) reads
// through here, never a second hardcoded copy. Production resolves to
// DAILY CREDITS = 10 / GENERATION COST = 3 by default, matching the
// intended product default exactly (see primtest/v13-generator-hardening-
// test.js's source-inspection test, which proves these literal default
// values rather than assuming them -- server.js itself can't be spawned in
// this sandbox, so that test reads this exact expression out of this file
// instead of duplicating it). landing/mock-server.js's own test-double
// default mirrors this 10/3 exactly now too; a test that wants a smaller
// pool sets `creditsLimit` explicitly at its own call site rather than
// relying on a silently-different ambient default (see that file's own
// comment).
//
// DYNAMIC CREDIT COSTING PASS (product economics, supersedes the flat "3
// credits per generation" model above -- see the final report for the
// full audit this replaces): a flat per-generation number could never
// reflect what a generation actually costs to produce, and it was the
// reason free/authenticated accounts never got to experience real
// generated imagery at all in practice -- SITEREMADE_PAID_IMAGES stayed
// off in production because there was no way for spend to track value.
// The replacement is additive, not a rewrite of the ledger itself:
// BASE GENERATION now costs its own, lower, always-charged number
// (SITEREMADE_CREDIT_COST_BASE_GENERATION, default 2 -- this is what
// 'standard' now prices; NEW_SITE/NEW_DIRECTION are the only tasks still
// classified 'standard'), and each ACTUALLY-FUNDED image is priced
// separately and on top of that, by the real {model} route it was routed
// through (creditCostForImageRoute below) -- never a second flat number,
// and never charged for a slot that was planned but never actually
// generated (script.js's buildImagePlan/planAffordableImages decides
// which slots are even attempted before any credit is reserved for them).
// 10 daily credits / 2 base = 5 possible generations/day at the text-only
// floor, same "several tries a day" product feel as the old 10/3, but
// with headroom for a generation to also spend on real imagery instead of
// imagery being globally switched off.
// BILLING PASS: the daily free pool above is retired. Every account now spends from ONE ledger (lib/credits.js):
// a one-time free trial (SITEREMADE_TRIAL_CREDITS, 6), the Workspace plan's monthly allowance
// (SITEREMADE_PLAN_MONTHLY_CREDITS, 100, no rollover; verified with the app -- lib/billing.js), and the owner's separate
// tester allowance (SITEREMADE_TESTER_EMAILS, SITEREMADE_TESTER_DAILY_CREDITS per UTC day, unchanged).
const SITEREMADE_TESTER_EMAILS = new Set((process.env.SITEREMADE_TESTER_EMAILS || '').split(',').map(v => v.trim().toLowerCase()).filter(Boolean));
// Separate from the credit tester list so purchase testing can be granted
// narrowly without changing generation-credit allowances.
const SITEREMADE_FREE_PURCHASE_TESTER_EMAILS = new Set((process.env.SITEREMADE_FREE_PURCHASE_TESTER_EMAILS || '').split(',').map(v => v.trim().toLowerCase()).filter(Boolean));
function isFreePurchaseTester(email) {
  const normalized = String(email || '').trim().toLowerCase();
  return !!(normalized && SITEREMADE_FREE_PURCHASE_TESTER_EMAILS.has(normalized));
}
function isTesterAccount(accountId) {
  if (!accountId || SITEREMADE_TESTER_EMAILS.size === 0) return false;
  try {
    const account = authProvider.findAccountById(db, accountId);
    const email = String((account && account.email) || '').trim().toLowerCase();
    return !!(email && SITEREMADE_TESTER_EMAILS.has(email));
  } catch (_) { return false; }
}
const billing = createBilling({ db, isTester: isTesterAccount });
// Bring the account's grants up to date (trial once, tester day, verified plan month) before any reservation.
async function prepareCredits(accountId) {
  if (!accountId) return;
  try { await billing.refresh(accountId); } catch (e) { console.error('Billing refresh failed (free/tester grants still apply):', e.message); try { billing.applyGrants(accountId, null); } catch (_) {} }
}
// Every paid action is one ledger operation with a unique id; the default id is fresh (a new action), callers that can
// be retried pass a stable one. Returns { ok, opId, remaining, existing, status }.
function reserveCredit(accountId, amount, kind, opId) {
  return credits.reserve(db, { accountId, opId: opId || `${kind}:${crypto.randomUUID()}`, amount, kind });
}
function commitCredit(opId, providerUsd) { if (opId) credits.commit(db, opId, { providerUsd }); }
function releaseCredit(opId, providerUsd) { if (opId) credits.release(db, opId, { providerUsd }); }
// For a route whose caller supplies its own attempt id (double clicks, retries, reconnects): the same id while the
// first attempt is still running is refused (never a second provider call); an id whose attempt already finished and
// was charged is a new, separately priced action (never free work); a failed attempt's id may simply retry.
function reserveAttempt(accountId, amount, kind, opId) {
  const r = reserveCredit(accountId, amount, kind, opId);
  if (r.ok && r.existing && r.status === 'reserved') return { ok: false, inProgress: true, remaining: r.remaining };
  if (r.ok && r.existing && r.status === 'committed') { const replay = replayPaid(opId); return replay ? { ok: false, replay } : reserveCredit(accountId, amount, kind); }
  return r;
}
// A successful paid response, kept for a while under its operation id: the same attempt retried after a lost response
// (a reconnect, a timeout in the browser or the app) gets it back -- no second charge, no second provider call. Kept in
// memory (this service runs as one instance); after a restart such a retry is priced as a new action.
const paidReplays = new Map(); const PAID_REPLAY_MS = 30 * 60 * 1000;
function rememberPaid(opId, body) { if (!opId) return; paidReplays.set(opId, { at: Date.now(), body }); while (paidReplays.size > 200) paidReplays.delete(paidReplays.keys().next().value); }
function replayPaid(opId) { const r = opId && paidReplays.get(opId); return r && Date.now() - r.at < PAID_REPLAY_MS ? r.body : null; }
function creditsRemainingFor(accountId) { return accountId ? credits.available(db, accountId).total : null; }
// a stable operation id derived from the caller's own request key, scoped to the account (a key can never collide
// with, or unlock, another account's operation)
function opIdFromKey(prefix, accountId, key) {
  const k = String(key || '').trim();
  if (!k) return null;
  return `${prefix}:${crypto.createHash('sha256').update(`${accountId}|${k}`).digest('hex').slice(0, 32)}`;
}
// BILLING PASS: the agreed customer prices, fixed in code (no environment override -- an old variable left on a
// deployment must never silently change what a customer is charged): Business generation 2, optional generated image
// 1 (support) / 2 (premium), AI update 1 (CREDIT_COST_BY_CLASS.cheap), Creative page 4 (lib/creative-jobs.js).
const SITEREMADE_CREDIT_COST_BASE_GENERATION = 2;
const SITEREMADE_CREDIT_COST_IMAGE_SUPPORT = 1;
const SITEREMADE_CREDIT_COST_IMAGE_PREMIUM = 2;
// PRICING PASS: the ONE-TIME generated-website purchase price, in CAD cents
// -- the single canonical source of truth for what Stripe actually charges
// AND what the frontend displays. Previously this was two separate
// hardcoded `35000` literals (one passed into purchase.createPurchaseIntent,
// one in the Stripe line item's price_data.unit_amount below) that happened
// to agree with each other by convention, not by construction -- a future
// edit to one without the other would have silently charged a different
// amount than the purchase-intent record itself claimed. This constant is
// deliberately unrelated to and never conflated with the app's own
// subscription/monthly pricing, which lives entirely in the separate app
// repo and is never read, stored, or touched here.
const SITEREMADE_WEBSITE_PRICE_CENTS = Number(process.env.SITEREMADE_WEBSITE_PRICE_CENTS) || 14999;
const SITEREMADE_WEBSITE_PRICE_CURRENCY = (process.env.SITEREMADE_WEBSITE_PRICE_CURRENCY || 'cad').toLowerCase();
function formatWebsitePriceDisplay() {
  // "$149.99" -- always two decimals, no internal cents exposed. Currency
  // code is shown separately (matches the existing "$X <small>CAD</small>"
  // markup pattern), so this only ever formats the numeric amount.
  return `$${(SITEREMADE_WEBSITE_PRICE_CENTS / 100).toFixed(2)}`;
}
const CREDIT_COST_BY_CLASS = {
  free: 0,
  cheap: 1,
  // 'standard' now means base generation ONLY (NEW_SITE/NEW_DIRECTION).
  // IMAGE_GENERATE/IMAGE_ADD/IMAGE_REGENERATE stay classified 'standard' in
  // OPERATION_COST_CLASS above purely so the operationLedger's costClass
  // field (observability) doesn't change shape -- but their real credit
  // price no longer comes from this table at all; see
  // creditCostForImageRoute below, which /api/generate-image uses instead
  // of creditCostForTask for exactly those three task types.
  standard: SITEREMADE_CREDIT_COST_BASE_GENERATION,
};
function creditCostForTask(taskType) { return CREDIT_COST_BY_CLASS[classifyOperationCost(taskType)] || 0; }
// The real per-image credit price: keyed by which MODEL the route
// allocator actually funded this slot through, not a flat per-task
// number. This reuses the exact support/premium vocabulary
// IMAGE_MODEL_SUPPORT/IMAGE_MODEL_PREMIUM (defined earlier in this file)
// already established for real dollar routing, rather than inventing a
// parallel classification system -- the premium model costs roughly
// 10-15x the support model at the same quality (see
// IMAGE_MODEL_COST_ESTIMATE_USD), so it is also the one dimension that
// actually tracks real API expense, which is what credit price should
// track.
function creditCostForImageRoute(model) {
  return model === IMAGE_MODEL_PREMIUM ? SITEREMADE_CREDIT_COST_IMAGE_PREMIUM : SITEREMADE_CREDIT_COST_IMAGE_SUPPORT;
}
// UNIFIED ACCOUNT / AUTH-GATED GENERATION pass: the next UTC-midnight
// rollover boundary, as a real ISO timestamp the client can format in the
// visitor's own local timezone -- never a claim of a precise LOCAL reset
// time (spec item 10: "Do not claim a precise local reset time if the
// backend only uses UTC day rollover unless converted correctly"; handing
// back the real UTC instant and letting the browser's own Intl/Date
// formatting convert it is the honest way to satisfy that).
function nextUtcMidnightIso(now) {
  const d = now || new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1, 0, 0, 0, 0)).toISOString();
}
// Read-only convenience for building a response payload -- returns null for
// an anonymous caller (credits are an authenticated-account concept only;
// an anonymous visitor is instead gated by the lifetime ledger further
// down, which is the one remaining use of a "lifetime cap" in this file).
// UNIFIED ACCOUNT pass: now also returns generationCost and resetsAt --
// spec item 7 ("Ideally credit API returns enough information for UX,
// such as: remaining credits, daily allowance, generation cost, reset
// boundary") -- so the client never hardcodes the "3 credits" number
// itself (spec item 6: "Do NOT create a second credit calculation in the
// frontend. Backend is source of truth."). generationCost is the standard
// (NEW_SITE/NEW_DIRECTION) cost specifically -- the one number the
// Generate button's own label needs; per-action costs for other task
// types remain server-side-only, exactly as before.
// The customer-facing credit costs, one table for the builder AND the app (served to both).
const CREDIT_COSTS = {
  businessGeneration: SITEREMADE_CREDIT_COST_BASE_GENERATION,
  creativePage: creativeJobs.PRICES.research + creativeJobs.PRICES.direction,
  creativeResearch: creativeJobs.PRICES.research, creativeDirection: creativeJobs.PRICES.direction,
  aiUpdate: CREDIT_COST_BY_CLASS.cheap,
  imageSupport: SITEREMADE_CREDIT_COST_IMAGE_SUPPORT, imagePremium: SITEREMADE_CREDIT_COST_IMAGE_PREMIUM,
  manualEdit: 0, upload: 0,
};
function creditsSummaryFor(accountId) {
  if (!accountId) return null;
  const summary = billing.summary(accountId, CREDIT_COSTS);
  // DYNAMIC CREDIT COSTING PASS: generationCost is now specifically the
  // BASE generation cost (spec item 15's "baseGenerationCost") --
  // imageCreditCosts exposes the per-route image prices too, so the
  // client's allocator (script.js buildImagePlan) and its pre-generation
  // estimate never hardcode a second copy of either number. No USD figure
  // is included here -- this is the one place a normal customer-facing
  // response is built, and internal API cost stays server-only (spec item
  // 15: "do not expose internal USD API costs to normal users").
  return {
    ...summary,
    generationCost: creditCostForTask('NEW_SITE'),
    baseGenerationCost: SITEREMADE_CREDIT_COST_BASE_GENERATION,
    imageCreditCosts: { support: SITEREMADE_CREDIT_COST_IMAGE_SUPPORT, premium: SITEREMADE_CREDIT_COST_IMAGE_PREMIUM },
    // when the balance next changes on its own: the tester day, else the plan month
    resetsAt: summary.tester ? summary.tester.resetsAt : summary.subscription && summary.subscription.renewsAt || null,
  };
}
// DYNAMIC CREDIT COSTING PASS (spec item 19, "planner integration"): the
// planner gets a BOUNDED, ABSTRACT signal about how much visual budget this
// generation can afford -- never a dollar figure ("you have $0.08" is
// explicitly the thing the spec forbids), and never the raw credit number
// either, so Claude is reasoning about creative posture, not doing its own
// billing math. Four tiers, mapped from the account's remaining credits
// AFTER this generation's own base reservation (i.e. exactly what's left to
// spend on THIS generation's images -- the same number
// reconcileImageSupplyWithSections/buildImagePlan use client-side, see
// script.js) -- deliberately matching the breakpoints and behavior the spec
// itself describes for 10/6/4/2-3/0-1 remaining:
//   generous     (>= 8 remaining): "freely choose several useful visuals"
//   moderate     (5-7 remaining):  "still allow strong image treatment"
//   constrained  (4 remaining):    "prioritize the strongest visual, hero first"
//   minimal      (<= 3 remaining): "preserve base generation, lean on deterministic systems"
// This is advisory only -- see the tool-schema comment above
// (imageStrategy: "how imagery should be used, not how many images to
// use... never increases the budget from this field alone") and spec item
// 20 ("Claude must NOT decide final credit deduction / billing state"):
// the actual enforcement is 100% deterministic backend logic
// (planAffordableImages/reserveCredits), regardless of what Claude does
// with this hint or whether it ignores it entirely.
function visualBudgetForRemainingCredits(remaining) {
  if (typeof remaining !== 'number' || !Number.isFinite(remaining)) return 'moderate';
  if (remaining >= 8) return 'generous';
  if (remaining >= 5) return 'moderate';
  if (remaining >= 4) return 'constrained';
  return 'minimal';
}
const VISUAL_BUDGET_PROMPT_HINTS = {
  generous: 'Generous visual budget: feel free to plan for several strong generated visuals (a hero plus supporting imagery) where the business genuinely benefits from them.',
  moderate: 'Moderate visual budget: a strong hero visual plus at most one supporting image is realistic; do not plan for a heavily image-saturated page.',
  constrained: 'Constrained visual budget: prioritize a single strong hero visual over multiple supporting images; lean on the deterministic typography/icon/SVG/card system for everything else.',
  minimal: 'Minimal visual budget: plan this as a primarily deterministic, typography/icon/SVG/card-driven design; only consider a single generated image if the business would be meaningfully worse without one.'
};

// A real, in-memory, bounded operation ledger -- deliberately the SAME
// honesty posture as `directionsLedger` above (see its own comment): not
// durable across a restart or shared across horizontally-scaled instances,
// but a genuine record of every real provider call this process makes,
// immediately queryable, and never storing a secret (no API key, no raw
// prompt/image bytes -- only the accounting fields the brief asked for).
// The durable upgrade path is the same one `directionsLedger` documents: a
// small table keyed by account/anon id, added via the DatabaseAdapter,
// deliberately not built in this pass (see the report's "what still needs
// building" section) rather than reshaping this twice.
const OPERATION_LEDGER_LIMIT = 500;
const operationLedger = [];
// ---- PREMIUM_GENERATION_V1 (lib/premium): USD cost ledger, budget governor, metrics ----
// The ledger is ALWAYS on (legacy and premium runs alike, so old-vs-new economics
// are comparable); everything that changes generation BEHAVIOUR is behind
// PREMIUM_GENERATION_V1=true. recordOperation stays the single funnel for every
// provider call, so the USD ledger cannot miss an operation.
const premiumLib = require('./lib/premium');
// THE ONE RULE for pictures (lib/premium/visual-mode.js): the Business generator never uses generated imagery. Enforced
// here on the server, not only in the browser -- see generateImageWithCredits, /api/premium/review-repair and the
// app-bridge edits below.
const visualMode = require('./lib/premium/visual-mode');
const premiumFs = require('fs');
const PREMIUM_LOG_DIR = process.env.SITEREMADE_PREMIUM_LOG_DIR || path.join(__dirname, 'data', 'premium');
function premiumAppend(file, obj) { try { premiumFs.mkdirSync(PREMIUM_LOG_DIR, { recursive: true }); premiumFs.appendFile(path.join(PREMIUM_LOG_DIR, file), JSON.stringify(obj) + '\n', () => {}); } catch (_) { /* diagnostics only */ } }
const premiumCore = premiumLib.createPremiumCore(process.env, {
  ledgerSink: e => premiumAppend('cost-ledger.jsonl', e),
  sink: l => premiumAppend('generation-log.jsonl', l),
});
const projectGeneration = new Map(); // browser project id -> premium generation id (set by middleware below)
function premiumSession(generationId, seed) {
  let s = premiumCore.getSession(generationId);
  if (!s) s = premiumCore.startSession(Object.assign({ generationId, composition: premiumCore.cfg.compositionV2 }, seed || {}));
  else if (seed && seed.archetype && seed.archetype !== s.strategy.archetype) s.rebind(seed);
  return s;
}
const PREMIUM_REPAIR_TASKS = /^(COPY_|QUALITY_REPAIR|IMAGE_REGENERATE|REFINE)/;
function premiumRecord(row, entry) {
  try {
    const genId = (entry.generationId && String(entry.generationId).slice(0, 60)) || projectGeneration.get(row.projectId) || row.projectId || row.anonId || 'unassigned';
    const phase = entry.phase || (PREMIUM_REPAIR_TASKS.test(row.operationType || '') ? 'repair' : 'first_draft');
    if (row.provider === activeImageProvider.name && (row.imageCount > 0)) {
      premiumCore.ledger.record({ generationId: genId, phase, kind: 'image', provider: row.provider, model: row.model, imageTier: row.model === premiumCore.cfg.models.imagePremium ? 'premium' : 'support', operation: row.operationType, imageQuality: row.imageQuality, imageSize: row.imageSize, imageCount: row.imageCount, ok: row.ok, providerReached: true, latencyMs: row.latencyMs, retryCount: entry.retryCount || 0, projectId: row.projectId });
    } else if (row.provider === 'anthropic') {
      premiumCore.ledger.record({ generationId: genId, phase, kind: 'text', provider: row.provider, model: row.model, operation: row.operationType, tier: row.model === premiumCore.cfg.models.cheap ? 'cheap' : 'strong', usage: { inputTokens: row.inputTokens || 0, outputTokens: row.outputTokens || 0, cacheReadTokens: row.cacheReadTokens || 0, cacheWriteTokens: row.cacheWriteTokens || 0 }, latencyMs: row.latencyMs, ok: row.ok, projectId: row.projectId });
    }
  } catch (_) { /* the USD ledger must never break a generation */ }
}
function recordOperation(entry) {
  const row = {
    timestamp: new Date().toISOString(),
    operationType: entry.operationType || 'unknown',
    costClass: classifyOperationCost(entry.operationType),
    provider: entry.provider || null,
    model: entry.model || null,
    ok: !!entry.ok,
    inputTokens: Number.isFinite(entry.inputTokens) ? entry.inputTokens : null,
    outputTokens: Number.isFinite(entry.outputTokens) ? entry.outputTokens : null,
    cacheReadTokens: Number.isFinite(entry.cacheReadTokens) ? entry.cacheReadTokens : null,
    cacheWriteTokens: Number.isFinite(entry.cacheWriteTokens) ? entry.cacheWriteTokens : null,
    imageCount: Number.isFinite(entry.imageCount) ? entry.imageCount : null,
    imageSize: entry.imageSize || null,
    // MULTI-MODEL IMAGE ROUTER PASS: real observability for the claim that
    // supporting imagery now routes through a materially cheaper MODEL, not
    // just a lower quality setting on the same one -- `model` above (from
    // activeImageProvider.generate()'s own return value, never assumed) now
    // reflects the ACTUAL model requested for this specific image, so this
    // ledger no longer records every row as 'gpt-image-1' once the router
    // starts using the cheaper support model. imageQuality is the actual
    // quality requested; estimatedCostUsd is estimateImageRouteCostUsd's own
    // model+quality+aspect-specific figure (an estimate, not a billed
    // amount -- see that function's own comment), so the ledger can show
    // the real per-request cost MIX a generation produced, not just a count.
    imageQuality: entry.imageQuality || null,
    estimatedCostUsd: Number.isFinite(entry.estimatedCostUsd) ? entry.estimatedCostUsd : null,
    // DYNAMIC CREDIT COSTING PASS (spec item 29, observability -- "base
    // credits reserved, image credits reserved... credits committed,
    // credits released, final charge"): `creditCost` is what this
    // operation RESERVED (base generation cost, or the funded image
    // route's support/premium price); `creditsCharged` is what actually
    // settled -- equal to creditCost on success (committed) or 0 on
    // failure/refusal (released), the same creditsCharged number each
    // route's own HTTP response already returns to the client, so the
    // ledger and the customer-facing response can never silently disagree.
    // creditCost:null means this operation never reserved credits at all
    // (e.g. an unauthenticated caller, or a free-class task) -- distinct
    // from creditsCharged:0, which means a reservation existed but was
    // released, never committed.
    creditCost: Number.isFinite(entry.creditCost) ? entry.creditCost : null,
    creditsCharged: Number.isFinite(entry.creditsCharged) ? entry.creditsCharged : null,
    latencyMs: Number.isFinite(entry.latencyMs) ? entry.latencyMs : null,
    projectId: entry.projectId || null,
    accountId: entry.accountId || null,
    anonId: entry.anonId || null
  };
  operationLedger.push(row);
  if (operationLedger.length > OPERATION_LEDGER_LIMIT) operationLedger.shift();
  premiumRecord(row, entry);
  // Durable copy (this in-memory array is lost on restart -- the exact gap
  // that made a real run's spend untraceable afterwards). Never throws.
  generationEvents.record({
    kind: 'operation', outcome: row.ok ? 'ok' : 'failed', accountId: row.accountId, projectId: row.projectId,
    provider: row.provider, model: row.model, quality: row.imageQuality, latencyMs: row.latencyMs,
    estimatedCostUsd: row.estimatedCostUsd, creditsCharged: row.creditsCharged,
    detail: { operationType: row.operationType, costClass: row.costClass, inputTokens: row.inputTokens, outputTokens: row.outputTokens, cacheReadTokens: row.cacheReadTokens, cacheWriteTokens: row.cacheWriteTokens, imageCount: row.imageCount, imageSize: row.imageSize, creditCost: row.creditCost },
  });
  return row;
}
// Gated by a server-only shared secret (never the auth-session mechanism --
// this is operational/debug visibility, not a customer-facing feature) so
// this stays a real, usable observability tool without inventing a roles
// system this app doesn't have yet. Fails closed: with no token configured,
// the route doesn't exist at all rather than being openly readable.
const ADMIN_TOKEN = process.env.SITEREMADE_ADMIN_TOKEN;
app.get('/api/admin/operation-ledger', (req, res) => {
  if (!ADMIN_TOKEN || req.headers['x-admin-token'] !== ADMIN_TOKEN) {
    return res.status(404).json({ ok: false });
  }
  res.json({ ok: true, count: operationLedger.length, entries: operationLedger });
});
// Durable generation diagnostics (lib/generation-events.js) -- same
// fail-closed admin gate as the in-memory ledger above, but survives a
// restart. Filters: ?kind=planner|image|client_outcome|operation,
// ?accountId=, ?projectId=, ?limit= (max 1000).
app.get('/api/admin/generation-events', (req, res) => {
  if (!ADMIN_TOKEN || req.headers['x-admin-token'] !== ADMIN_TOKEN) {
    return res.status(404).json({ ok: false });
  }
  const entries = generationEvents.listRecent({ limit: req.query.limit, kind: clean(req.query.kind, 30) || null, accountId: clean(req.query.accountId, 80) || null, projectId: clean(req.query.projectId, 120) || null });
  res.json({ ok: true, count: entries.length, writeFailures: generationEvents.stats().writeFailures, entries });
});

// PREMIUM_GENERATION_V1 diagnostics: cost per generation (FIRST_DRAFT / REPAIR / TOTAL),
// generation log and economics aggregates. Internal only; never shown to customers.
app.get('/api/admin/premium-ledger', (req, res) => {
  if (!ADMIN_TOKEN || req.headers['x-admin-token'] !== ADMIN_TOKEN) return res.status(404).json({ ok: false });
  const id = clean(req.query.generationId, 60);
  if (id) return res.json({ ok: true, totals: premiumCore.ledger.totals(id), entries: premiumCore.ledger.forGeneration(id) });
  const ids = [...new Set(premiumCore.ledger.entries.map(e => e.generationId))].slice(-50);
  res.json({ ok: true, generations: ids.map(g => premiumCore.ledger.totals(g)) });
});
app.get('/api/admin/premium-metrics', (req, res) => {
  if (!ADMIN_TOKEN || req.headers['x-admin-token'] !== ADMIN_TOKEN) return res.status(404).json({ ok: false });
  const revenue = Number(process.env.PREMIUM_REVENUE_USD_PER_SITE);
  res.json({ ok: true, enabled: premiumCore.cfg.enabled, config: { budgets: premiumCore.cfg.budgets, imageTierCaps: premiumCore.cfg.imageTierCaps, retry: premiumCore.cfg.retry, models: premiumCore.cfg.models }, aggregate: premiumCore.metrics.aggregate({ revenueUsdPerSite: Number.isFinite(revenue) ? revenue : null }), recent: premiumCore.metrics.logs.slice(-25) });
});

const HERO_KEYS =['split','fullbleed-image','centered-oversized','stacked-image-below','asymmetric-offset','minimal-text-only','grid-dashboard','poster','collage','product-screenshot','editorial-rail','product-stage','floating-media','quiet-luxury'];
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
// CREATIVE DIRECTOR V2: the smallest set of new creative-plan fields that
// materially change the rendered site (see the audit). Each one is
// deterministically interpreted by script.js -- never a raw class name or
// CSS value -- and each rides the SAME existing planning call/schema as
// concept/visualMood/narrativeStrategy/imageStrategy/signatureMotif above,
// so this adds zero new provider calls. heroStrategy is the missing
// intent-level signal above the raw `visualDirection.hero` key (it also
// biases imageDominance/contentWidth/cardDensity, so two businesses that
// land on the same raw hero key can still diverge, and it gives the
// deterministic no-Claude fallback a real hero decision it never had).
// pageRhythm is the missing per-position density concept (open/build/
// proof/close), interpreted against each section's EXISTING intent --
// no new per-section schema needed for that half. avoid is a real
// suppression signal (script.js's applyAvoidList), not inert metadata.
const CREATIVE_HERO_STRATEGY_KEYS = ['image-dominant','text-dominant','product-ui-dominant','editorial','proof-first','offer-first','restrained-minimal','portfolio-led'];
const CREATIVE_PAGE_RHYTHM_KEYS = ['sparse-open-dense-mid','steady-editorial','dense-proof-compressed','expressive-alternating'];
const CREATIVE_AVOID_KEYS = ['generic-cards','saas-cta-blocks','rounded-cards','bright-cheerful'];
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
    required: ['business', 'strategy', 'heroCopy', 'visualDirection', 'creativeDirection', 'pages', 'heroStoryboard', 'imagePlan', 'functionalityPlan'],
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
          goals: { type: 'array', items: { type: 'string' }, maxItems: 5 },
          // Without this the renderer's feature/service/product lists could
          // only ever show a fixed per-category list, so every business in a
          // category read the same ("Treatments / Booking / About").
          offerings: { type: 'array', items: { type: 'string' }, maxItems: 6, description: 'The specific products, flavours, services or programmes THIS business offers, as 2-6 short labels (1-4 words each) the site can list and show -- e.g. "Peach Energy", "Hail Damage Repair". Only things the description states or clearly implies; never invent a product line. Omit if the description names none.' }
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
          hero: { type: 'string', enum: HERO_KEYS, description: 'The layout family for the hero. Prefer a genuinely premium composition where the business supports it: product-stage (a single staged product/object, real estate/retail), floating-media (2-3 overlapping surfaces, SaaS/creative), quiet-luxury (restrained, generous whitespace, one soft image -- consultancies/high-end services). Only choose a text-only layout (poster/centered-oversized/minimal-text-only) when this business genuinely has no real subject to photograph.' },
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
        required: ['concept', 'visualMood', 'narrativeStrategy', 'imageStrategy', 'signatureMotif', 'heroStrategy', 'pageRhythm'],
        description: 'The creative idea for this site, above and independent of archetype/category -- archetype stays a safe structural guardrail, this is the actual point of view. Two businesses that share an archetype should still diverge here when their descriptions imply a different posture (premium vs accessible, urgent vs considered, image-led vs informational, portfolio-heavy vs proof-heavy).',
        properties: {
          concept: { type: 'string', enum: CREATIVE_CONCEPT_KEYS },
          visualMood: { type: 'string', enum: CREATIVE_MOOD_KEYS },
          narrativeStrategy: { type: 'string', enum: CREATIVE_NARRATIVE_KEYS },
          imageStrategy: { type: 'string', enum: CREATIVE_IMAGE_STRATEGY_KEYS, description: 'How imagery should be used, not how many images to use -- SiteRemade decides real image count/placement from this plus the existing archetype budget and never increases the budget from this field alone.' },
          signatureMotif: { type: 'string', enum: CREATIVE_SIGNATURE_KEYS },
          heroStrategy: { type: 'string', enum: CREATIVE_HERO_STRATEGY_KEYS, description: 'The hero\'s creative posture -- what it is actually doing for this visitor (leading with image, leading with copy, leading with proof, leading with the offer, etc.). SiteRemade maps this onto the concrete `visualDirection.hero` layout you also chose; pick both deliberately and make them agree.' },
          pageRhythm: { type: 'string', enum: CREATIVE_PAGE_RHYTHM_KEYS, description: 'The page\'s overall density curve from opening to close -- sparse-open-dense-mid (quiet opening, denser proof/explanation in the middle, calm close), steady-editorial (even, restrained pacing throughout), dense-proof-compressed (tight, scannable, proof/urgency-forward -- e.g. emergency/local-conversion businesses), or expressive-alternating (strong contrast between sections, big statement moments). Choose the one that actually fits this business\'s pacing, not a default.' },
          avoid: { type: 'array', maxItems: 3, items: { type: 'string', enum: CREATIVE_AVOID_KEYS }, description: 'Real stylistic traps to actively suppress for THIS business, if any genuinely apply (e.g. a quiet premium restaurant avoiding bright-cheerful and generic-cards). Empty array if nothing here genuinely applies -- do not fill it in just to fill it in.' }
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
      heroStoryboard: {
        type: 'object', additionalProperties: false,
        description: 'The hero at the top of the site: a short, looping motion composition built from 3-4 SEPARATE generated images that move independently (layered, choreographed). Art-direct it for THIS business: one lead image (the product itself, the finished job, the venue, the treatment...) plus supporting images that are genuinely different subjects -- a close detail (ingredient, material, craft, texture) and a context shot (lifestyle, work in progress, the room, the people it serves). Never the same picture twice, never a recoloured template, never another industry\'s imagery.',
        required: ['concept', 'composition', 'tone', 'layers'],
        properties: {
          concept: { type: 'string', description: 'One sentence: the visual idea tying the hero images together, specific to this business.' },
          composition: { type: 'string', enum: ["hero-stage","panorama","venue-stack","columns","arch-cluster","device-float","orbit","filmstrip","diagonal","fan","split-duo"], description: 'hero-stage: product big and central with satellites; panorama: finished result full-bleed with framed insets (copy bottom-left); venue-stack: the room tall with a detail and a moment overlapping; columns: tall columns drifting against each other; arch-cluster: calm arch, round detail, quiet card; device-float: software on a device with its world floating around (copy on top); orbit: the product centred with details orbiting (copy right); filmstrip: a wide lead with a sliding strip below; diagonal: a lead with frames cascading down its side; fan: cards spread like a hand of prints (copy right); split-duo: two halves with a frame crossing the seam (before/after, the work and the result).' },
          tone: { type: 'string', enum: ['dark', 'light'] },
          treatment: { type: 'string', enum: ['photo', 'illustration'], description: 'photo for most businesses; illustration when an editorial illustration suits the business better than photography (e.g. a tutor for children).' },
          look: { type: 'string', description: 'One sentence: the shared look of all the hero images -- light direction, palette, colour grade -- so they read as one set.' },
          interface: { type: 'object', additionalProperties: false, description: 'Software only: the product screen drawn as the lead (with real, readable labels). Omit for every other business.', properties: {
            kind: { type: 'string', enum: ["schedule","monitor","pipeline","ledger","inbox","editor","store","analytics","learning","docs","workflow"] },
            items: { type: 'array', maxItems: 6, items: { type: 'string' }, description: 'Short labels from the customer\'s own words (services, features, stages). No numbers, no names of people or companies.' } } },
          loopSeconds: { type: 'number', description: 'Length of the shared motion loop, 8-18 seconds.' },
          layers: {
            type: 'array', minItems: 3, maxItems: 4,
            items: {
              type: 'object', additionalProperties: false,
              required: ['role', 'anchor', 'subject', 'prompt', 'aspectRatio', 'motion'],
              properties: {
                role: { type: 'string', enum: ["lead","detail","context","accent"], description: 'Exactly one lead.' },
                anchor: { type: 'string', enum: ["lead","a","b","c"], description: 'Placement slot in the chosen composition; the lead uses "lead", the others a/b/c, each once.' },
                subject: { type: 'string', description: 'A few words naming what this image shows, in the business\'s own terms (the stated product, flavour, service or equipment).' },
                prompt: { type: 'string', description: 'A specific image-generation prompt for this exact picture of this business: the subject (the real product in its real container, the stated flavours or service), the action or setting, framing, materials and light. No text, logos or identifiable faces, no invented claims or credentials.' },
                aspectRatio: { type: 'string', enum: ["16:9","4:3","1:1","4:5","3:4"] },
                motion: { type: 'string', enum: ["push-in","pull-out","drift-left","drift-right","rise","sink","orbit","orbit-reverse","tilt","float","slide-left","slide-right","pulse","hold"], description: 'How this image travels over the loop.' },
                intensity: { type: 'string', enum: ['subtle', 'medium', 'bold'] },
                pan: { type: 'string', enum: ["none","pan-left","pan-right","pan-up","zoom-in","zoom-out"], description: 'Movement of the picture inside its frame.' },
                depth: { type: 'integer', description: '1 (back) to 5 (front).' },
                offset: { type: 'number', description: 'Phase within the loop, 0-1, so the images move in sequence rather than in unison.' }
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
        changes: { type: 'object', additionalProperties: false, properties: { headline: { type: 'string' }, body: { type: 'string' }, ctaLabel: { type: 'string' }, hero: { type: 'string', enum: HERO_KEYS }, imagery: { type: 'string', enum: IMAGERY_KEYS }, colorBehavior: { type: 'string', enum: COLOR_BEHAVIOR_KEYS }, spacing: { type: 'string', enum: SPACING_KEYS }, imageStrategy: { type: 'string', enum: CREATIVE_IMAGE_STRATEGY_KEYS }, heroStrategy: { type: 'string', enum: CREATIVE_HERO_STRATEGY_KEYS }, pageRhythm: { type: 'string', enum: CREATIVE_PAGE_RHYTHM_KEYS } } }
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
11. Never restate the same claim, statistic, or headline idea twice across a site. If two sections would naturally make the same point, cut one, merge them, or give the second a different angle (a new objection it resolves, a new piece of proof) instead of repeating the first.
12. Decide creativeDirection as the actual creative idea for this specific business, not a restatement of its archetype/category. Two businesses that would land on the same archetype (e.g. two restaurants, two roofers, two SaaS products) must still diverge here when their description implies a different posture -- quiet/premium vs loud/accessible, considered vs urgent, image-led vs informational, portfolio-heavy vs proof-heavy. heroStrategy and pageRhythm are real creative decisions, not defaults: pick pageRhythm from how this business should actually feel to move through (a quiet tasting-menu restaurant reads differently than a same-day emergency contractor), and make heroStrategy agree with the visualDirection.hero layout you chose. Only fill in avoid when a real stylistic trap applies to this business -- leave it empty otherwise.
13. QUALITY BAR. The customer pays for this first draft and will judge it before touching anything. Design a site a professional agency would be proud to ship: (a) EVERY page is a designed page with real substance -- Home tells the story and drives the primary action; Product/Services/Shop shows the offer visually and explains it; About states the philosophy/approach using only supplied facts; Contact gives one clear way to act. Never plan a page that is a heading, one paragraph and a footer; plan 3-6 purposeful sections per secondary page, each answering a different visitor question. (b) Give every page its own composition and rhythm; do not repeat hero + three cards + CTA. (c) Choose the hero as an industry-native composition: product UI/browser frame for software, editorial or full-bleed photography for retail/hospitality/trades/nonprofit, image-led project storytelling for portfolios, restrained editorial typography for consultancies. (d) Choose media deliberately per role (photograph, product UI, diagram, data visual, abstract graphic) and write imagePrompts that depict THIS business's real subject in specific, photographic terms (subject, setting, light, framing), never generic stock or fashion for a non-fashion business. (e) Banned filler unless genuinely natural and supported: "done right", "designed for modern teams", "everything you need in one place", "effortless", "elevate your", "unlock your", "built to move fast", "future-ready", "redefine", "where X meets Y". Say the concrete thing the product or service does for a specific person. (f) Never invent testimonials, ratings, client counts, awards, staff, certifications, years, guarantees, addresses or prices; build trust with process, philosophy, capability explanation and only the facts supplied.
14. heroStoryboard is the site's opening motion piece: 3-4 separate images that move independently. Art-direct it from THIS business's product/service, audience and goal -- e.g. a drink brand: the can up close, a flavour or ingredient splash, a lifestyle moment; a coffee roaster: the bag and beans, a pour-over bloom, the roaster at work; a landscaper: the finished yard, a stone or planting detail, the crew mid-project. Those are examples, not templates: two businesses in the same category should get different concepts, subjects, compositions and motion. Every image must read as this industry, every image a different subject, prompts specific and photographic, no text/logos/identifiable faces. Give the images different motions and offsets so they move as one choreographed sequence. Take the subjects from what the customer actually wrote: their stated products in the containers they really come in (a serum in a dropper bottle, a sparkling drink in a can), the flavours or ingredients they name, the services they list (a lawn-maintenance company shows mowing and edging; a landscape builder shows patios, retaining walls and planting). A software product's lead is its screen: set interface.kind and give interface.items as short labels from the customer's words (the screen itself is drawn with readable labels, not generated). Give all the images one shared look (look) so they read as one set; use treatment "illustration" only where it suits the business better than photography.
15. heroCopy.headline opens the site, so it must say what THIS business offers or does, in the owner's own terms: a sailing school's lessons and time on the water, a florist's flowers and the occasion, a hot-sauce maker's sauce. Never a category word plus a stock phrase ("Business, done properly.", "Online, made to be noticed.") and never a sentence that would fit any business. No superlatives, rankings, results, guarantees, credentials or numbers the owner did not state. Write it the way this business would say it -- do not reuse one sentence pattern for every business. business.name is the name exactly as the owner wrote it (keep "Co.", "&" and capitals); never a service, a place or part of a sentence, and omit it when no name was given.`;

function buildPlannerUserPrompt(brief) {
  const lines = [
    `Business description (verbatim, from the visitor): "${brief.text}"`,
    brief.extractedFacts && Object.keys(brief.extractedFacts).length ? `Facts already detected in that text (treat as the ONLY safe declaredFacts unless the description states more): ${JSON.stringify(brief.extractedFacts)}` : 'No explicit facts (years/rating/customer count) were detected in the text -- do not invent any.',
    brief.location ? `Detected location: ${brief.location}` : '',
    brief.businessName ? `The business's name, as the owner wrote it: "${brief.businessName}" -- use exactly this as business.name.` : 'No business name was detected in the text -- only give business.name if the description clearly states one.',
    brief.tone ? `Requested tone: ${brief.tone}` : '',
    // DYNAMIC CREDIT COSTING PASS (spec item 19): an abstract, bounded
    // creative-posture hint only -- see VISUAL_BUDGET_PROMPT_HINTS' own
    // comment for why this is never a dollar amount or the raw credit
    // number, and why it never overrides the backend's own enforcement.
    VISUAL_BUDGET_PROMPT_HINTS[brief.visualBudget] || VISUAL_BUDGET_PROMPT_HINTS.moderate
  ];
  if (brief.priorSignatures && brief.priorSignatures.length) {
    lines.push(
      `This visitor has already been shown ${brief.priorSignatures.length} other direction(s) for this same business: ${brief.priorSignatures.map((s, i) => `\n  Direction ${i + 1}: ${s}`).join('')}`,
      'Produce a genuinely different, equally strong interpretation of the SAME business -- vary information architecture, hero composition, typography, colorBehavior, imagery, page/section structure and order, density, CTA strategy, and motion. Do not manufacture difference through random or nonsensical choices; every choice must still suit the business.'
    );
  }
  return lines.filter(Boolean).join('\n');
}

// Control-plane pass, item 11 (prompt-caching readiness): this is REAL
// caching, not scaffolding for a future one -- the Anthropic Messages API
// caches a prefix up to and including any content block marked
// `cache_control: {type:'ephemeral'}`. The system prompt (stable across
// every call) and the tool schema (stable across every call; only the
// TOOL DEFINITION is marked -- `tools` is otherwise identical every time)
// are exactly the "stable: system instructions / renderer vocabulary /
// output schema" split the brief describes; `messages` (the one part that
// actually changes per request -- the business brief/project context) is
// deliberately left uncached. Below the ~1024-token minimum this is a
// harmless no-op per Anthropic's own docs, so this stays correct even for
// the smaller refine-website call below.
const WEBSITE_PLAN_TOOL_CACHED = { ...WEBSITE_PLAN_TOOL, cache_control: { type: 'ephemeral' } };
// PLANNER HARDENING PASS (Part L): a production smoke test surfaced a real
// planner request that timed out/aborted under this route's own 25s
// ceiling. Audited before changing it: this call's max_tokens is 8192 (a
// full page-by-page site plan with strategy/creative-direction/imagePlan/
// functionalityPlan reasoning, the richest single call this server makes),
// materially larger than the 2500-max_tokens refine-website call below,
// which keeps its own, separate, unchanged 25s timeout -- that smaller task
// was never reported as timing out and this pass does not touch it.
// Raised conservatively (25s -> 35s, a 40% increase, not an arbitrarily
// large number) to give the larger completion realistic headroom under
// real production latency, while still failing in well under a minute so a
// stuck request can never leave a visitor staring at nothing indefinitely.
// A timeout here still aborts cleanly via the existing catch block below
// (AbortError -> categorizeAnthropicError -> 'timeout'), which already
// releases the reserved base credit and lets the client fall back to
// deterministic generation -- this change only widens the window before
// that abort fires, it does not touch that failure/release/fallback path.
// Quality pass: the planner is the design brain of the site, so it gets a larger completion budget and more time (env-overridable).
const PLANNER_REQUEST_TIMEOUT_MS = Number(process.env.SITEREMADE_PLANNER_TIMEOUT_MS) || 60000;
const anthropicProvider = {
  name: 'anthropic',
  configured: () => !!ANTHROPIC_API_KEY,
  async plan(brief) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), PLANNER_REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({
          model: (premiumCore && premiumCore.cfg && premiumCore.cfg.enabled && premiumCore.cfg.models.planner) || ANTHROPIC_MODEL,
          // V9: the schema grew substantially (strategy object, per-page
          // plan, per-section intent/headlineRole) -- 4096 was already
          // tight for an 8-page plan with full visualDirection/creative-
          // Direction/imagePlan/functionalityPlan; raised to give the
          // richer reasoning room without truncating mid-tool-call.
          max_tokens: Number(process.env.SITEREMADE_PLANNER_MAX_TOKENS) || 12000,
          thinking: { type: 'disabled' },
          system: [{ type: 'text', text: PLANNER_SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
          messages: [{ role: 'user', content: buildPlannerUserPrompt(brief) }],
          tools: [WEBSITE_PLAN_TOOL_CACHED],
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

// PLANNER HARDENING PASS (Part K): the exact production crash this fixes --
// `TypeError: (plan.pages || []).map is not a function` -- happened because
// `plan` here is `toolUse.input`, Claude's raw tool_use payload. The tool
// schema constrains the SHAPE Claude is asked to return, but never
// guarantees the model actually honors every field's type on a given
// response; `pages` (or a single page's `sections`) coming back as an
// object/string/number instead of an array was always possible, and
// `(plan.pages || []).map` only guards against a FALSY pages (undefined,
// null, 0, '') -- a truthy-but-wrong-type value sails straight through the
// `|| []` and crashes on `.map`. This function is the one place raw
// tool_use output gets coerced into a shape every downstream consumer
// (planSignature below, the success response sent to the client, the
// client's own buildClaudePages) can safely iterate -- called exactly once,
// immediately after the Anthropic call returns and before anything else
// touches the plan. It never silently "fixes" bad content into something
// that looks real: a completely unusable plan (not an object, or no usable
// pages at all) returns null so the caller treats this exactly like any
// other planner failure -- released credit, clean deterministic fallback --
// rather than forwarding malformed data to the client. A plan that is
// mostly fine passes through with only its actually-malformed pieces
// dropped; a fully valid plan is returned unchanged.
function normalizePlannerPlan(rawPlan) {
  if (!rawPlan || typeof rawPlan !== 'object' || Array.isArray(rawPlan)) return null;
  const rawPages = Array.isArray(rawPlan.pages) ? rawPlan.pages : null;
  if (!rawPages) {
    // `pages` IS the site's actual content -- there is nothing left to
    // salvage from a plan whose page list isn't even an array (object,
    // string, number, or genuinely absent). Unlike a single malformed
    // page below, this is not a "drop one bad piece and continue" case.
    return null;
  }
  const pages = rawPages
    .map(p => {
      if (!p || typeof p !== 'object' || Array.isArray(p)) return null; // one malformed page never takes down the whole plan
      const rawSections = Array.isArray(p.sections) ? p.sections : [];
      const sections = rawSections.filter(s => s && typeof s === 'object' && !Array.isArray(s) && typeof s.type === 'string' && s.type);
      return { ...p, sections };
    })
    .filter(p => p && p.sections.length); // a page left with zero real sections after cleanup is dropped, same rule the client's buildClaudePages already applies
  if (!pages.length) return null; // every page was malformed or empty -- still unusable overall
  return { ...rawPlan, pages };
}

function planSignature(plan) {
  // A compact, human-readable fingerprint of a plan -- sent back to Claude
  // (never shown to the visitor) so the next direction can deliberately
  // diverge from it, and kept short to stay cost-aware. Safe to assume
  // `plan.pages` is already a real array here: every caller passes this a
  // plan that has already been through normalizePlannerPlan.
  const vd = plan.visualDirection || {};
  const cd = plan.creativeDirection || {};
  const pageSummary = (plan.pages || []).map(p => `${p.id}:[${(p.sections || []).map(s => s.type).join(',')}]`).join(' ');
  return `concept=${cd.concept} mood=${cd.visualMood} narrative=${cd.narrativeStrategy} signature=${cd.signatureMotif} heroStrategy=${cd.heroStrategy} pageRhythm=${cd.pageRhythm} hero=${vd.hero} type=${vd.typography} imagery=${vd.imagery} color=${vd.colorBehavior} motion=${vd.motion} pattern=${vd.pattern} heroStoryboard=${(plan.heroStoryboard && plan.heroStoryboard.composition) || '-'}:${String((plan.heroStoryboard && plan.heroStoryboard.concept) || '').slice(0, 80)} pages=${pageSummary}`.slice(0, 600);
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

// The browser's side of generation diagnostics -- things only it knows:
// whether it actually USED the AI plan or fell back to the deterministic
// engine (and why -- the server can return ok:true and the client can still
// reject the plan in normalizeClaudePlan), and when an image result arrived
// for a plan that had already changed (so it was correctly not shown). Every
// field is allowlisted/clipped; nothing here is ever rendered anywhere. Its
// own small rate limit so it never eats the generation budget.
const CLIENT_OUTCOMES = ['plan_used', 'plan_fallback', 'image_superseded', 'image_failed', 'admission_rejected', 'generation_failed'];
const CLIENT_FALLBACK_REASONS = ['server_not_ok', 'plan_rejected_by_client', 'network', 'not_configured', 'credits_exceeded', 'timeout', 'provider_error', 'unknown'];
function diagnosticFailureDetail(body) {
  const ids = v => (Array.isArray(v) ? v.slice(0, 20).map(x => clean(x, 120)).filter(Boolean) : []);
  return {
    phase: clean(body.phase, 40) || null, starterVisualsOnly: body.starterVisualsOnly === true,
    blockers: ids(body.blockers), unresolvedSlots: ids(body.unresolvedSlots), duplicateSlots: ids(body.duplicateSlots), duplicateSectionIds: ids(body.duplicateSectionIds),
    error: clean(body.error, 200) || null,
  };
}
const diagnosticsRateLimit = rateLimitMiddleware(req => `diagnostics:${req.accountId || req.ip}`, { max: 60, windowMs: 60 * 1000 }, 'Too many requests in a short time.');
app.post('/api/generation-diagnostics', requireAuth, diagnosticsRateLimit, (req, res) => {
  const body = req.body || {};
  const outcome = clean(body.outcome, 40);
  if (!CLIENT_OUTCOMES.includes(outcome)) return res.status(400).json({ ok: false });
  const reason = CLIENT_FALLBACK_REASONS.includes(clean(body.reason, 40)) ? clean(body.reason, 40) : null;
  generationEvents.record({
    kind: 'client_outcome', outcome, accountId: req.accountId,
    projectId: clean(body.projectId, 120) || null, requestKey: clean(body.requestKey, 300) || null,
    detail: {
      generationId: clean(body.generationId, 60) || null, reason,
      slot: clean(body.slot, 120) || null,
      imagesRequested: Number.isFinite(body.imagesRequested) ? Math.max(0, Math.min(64, Math.round(body.imagesRequested))) : null,
      imagesReady: Number.isFinite(body.imagesReady) ? Math.max(0, Math.min(64, Math.round(body.imagesReady))) : null,
      // why a finished Business website was not admitted (script.js generationFailureDiagnostic): lists of slot /
      // section ids and blocker codes only, never page content
      ...(['admission_rejected', 'generation_failed'].includes(outcome) ? diagnosticFailureDetail(body) : {}),
    },
  });
  res.json({ ok: true });
});

app.get('/api/planner-status', (req, res) => {
  res.json({
    configured: anthropicProvider.configured(),
    model: ANTHROPIC_MODEL,
    lastAttempt: plannerDiagnostics.lastAttempt
  });
});

// Control-plane pass: this endpoint is now reached only for a task type the
// client's own classifier decided genuinely needs reasoning (see script.js
// classifyRefinementRequest/applyRefinementRequest) -- anything with a
// confident local/deterministic plan (color, spacing, reorder, variant,
// footer, simple section add/remove) never calls this route at all any
// more, closing the ordering gap the audit found (this route used to be
// tried FIRST for every free-text request, local classification only as a
// fallback on failure).
const REFINEMENT_TOOL_CACHED = { ...REFINEMENT_TOOL, cache_control: { type: 'ephemeral' } };
const REFINEMENT_SYSTEM_PROMPT = 'You are SiteRemade refinement intelligence. Interpret the user request against the supplied structured project and return only submit_website_refinement. Preserve unrelated content and facts. Never invent business facts, HTML, CSS, or arbitrary operations.';
const REFINEMENT_REQUEST_TIMEOUT_MS = 25000;
// App bridge pass (Phase 4): the ONE implementation of "ask Claude for a
// refinement plan" -- factored out of /api/refine-website (unchanged
// prompt, model, token limit, tool, timeout) so the new server-side
// /api/app-bridge/website/:projectId/edits route calls exactly the same
// thing instead of a forked copy. Returns
//   { providerOk:false, usage, model }            -- Anthropic returned non-2xx
//   { providerOk:true, ok, plan, usage, model }   -- 2xx; ok=false if no tool_use came back
// and THROWS on a network error/timeout (AbortError), exactly like the
// inline fetch it replaced -- each caller keeps its own credit
// reserve/commit/release and recordOperation bookkeeping around it.
// The returned plan is Claude's RAW tool input: /api/refine-website hands
// it to the browser as before (whose own normalizeRefinementPlan shapes
// it); the bridge route runs it through normalizeServerRefinementPlan
// (lib/refinement-normalizer.js) before applying anything.
async function requestRefinementPlan({ request, context }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REFINEMENT_REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL, max_tokens: 2500, thinking: { type: 'disabled' },
        system: [{ type: 'text', text: REFINEMENT_SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
        messages: [{ role: 'user', content: `Canonical business and current structured project context:\n${JSON.stringify(context || {}).slice(0, 120000)}\n\nRefinement request:\n${request}` }],
        tools: [REFINEMENT_TOOL_CACHED], tool_choice: { type: 'tool', name: 'submit_website_refinement' }
      }),
      signal: controller.signal
    });
    const data = await response.json().catch(() => ({}));
    const usage = data.usage || {};
    if (!response.ok) return { providerOk: false, usage, model: ANTHROPIC_MODEL };
    const toolUse = (data.content || []).find(block => block.type === 'tool_use' && block.name === 'submit_website_refinement');
    const ok = !!(toolUse && toolUse.input);
    return { providerOk: true, ok, plan: ok ? toolUse.input : null, usage, model: data.model || ANTHROPIC_MODEL };
  } finally {
    clearTimeout(timeout);
  }
}
// UNIFIED ACCOUNT / AUTH-GATED GENERATION pass: same enforcement as
// /api/plan-website above -- requireAuth instead of withOptionalAuth.
// App bridge pass (Phase 4): the Claude call now goes through
// requestRefinementPlan above; credit handling, ledger rows and every
// response shape are unchanged.
app.post('/api/refine-website', requireAuth, generationRateLimit, async (req, res) => {
  const anonId = ensureAnonId(req, res);
  const taskType = clean(req.body.taskType, 40) || 'COPY_REWRITE';
  const projectId = clean(req.body.projectId, 60);
  if (!anthropicProvider.configured()) return res.status(200).json({ ok: false, configured: false });
  const request = clean(req.body.request, 600);
  const context = req.body.context && typeof req.body.context === 'object' ? req.body.context : {};
  if (!request) return res.status(400).json({ ok: false, message: 'Missing refinement request.' });
  // Product-flow pass: AI-assisted refinement (copy rewrites, semantic
  // regeneration) is credit-consuming for signed-in accounts -- ordinary
  // deterministic edits never reach this route at all (see this route's own
  // comment above), so free-class taskTypes cost 0 here as real defense in
  // depth, not the primary enforcement point.
  // BILLING PASS: every request that reaches this route is a paid model call, so it costs one AI update whatever
  // `taskType` the browser labels it with -- a label can describe the edit but can never make the call free. Edits
  // that need no model (colours, spacing, reordering, typed text) are made in the browser and never come here.
  const creditCost = CREDIT_COSTS.aiUpdate;
  let creditReserved = false, creditOp = null;
  if (req.accountId && creditCost > 0) {
    await prepareCredits(req.accountId);
    const creditReservation = reserveAttempt(req.accountId, creditCost, 'ai_update', opIdFromKey('refine', req.accountId, clean(req.body.requestId, 120)));
    if (creditReservation.inProgress) return res.status(409).json({ ok: false, configured: true, inProgress: true, message: 'This update is already running.' });
    if (creditReservation.replay) return res.json(Object.assign({}, creditReservation.replay, { creditsCharged: 0, replayed: true, creditsRemaining: creditsRemainingFor(req.accountId) }));
    if (!creditReservation.ok) {
      return res.status(200).json({ ok: false, configured: true, creditsExceeded: true, creditsRemaining: creditReservation.remaining, message: `This AI update needs ${creditCost} credit and your balance is ${creditReservation.remaining}.` });
    }
    creditReserved = true; creditOp = creditReservation.opId;
  }
  const startedAt = Date.now();
  try {
    const result = await requestRefinementPlan({ request, context });
    const usage = result.usage || {};
    const latencyMs = Date.now() - startedAt;
    if (!result.providerOk) {
      recordOperation({ operationType: taskType, provider: 'anthropic', model: ANTHROPIC_MODEL, ok: false, creditCost: creditReserved ? creditCost : null, creditsCharged: 0, latencyMs, projectId, accountId: req.accountId, anonId });
      if (creditReserved) releaseCredit(creditOp);
      return res.status(200).json({ ok: false, configured: true });
    }
    const succeeded = result.ok;
    recordOperation({ operationType: taskType, provider: 'anthropic', model: result.model, ok: succeeded, inputTokens: usage.input_tokens, outputTokens: usage.output_tokens, cacheReadTokens: usage.cache_read_input_tokens, cacheWriteTokens: usage.cache_creation_input_tokens, creditCost: creditReserved ? creditCost : null, creditsCharged: (creditReserved && succeeded) ? creditCost : 0, latencyMs, projectId, accountId: req.accountId, anonId });
    if (creditReserved) { if (succeeded) commitCredit(creditOp); else releaseCredit(creditOp); }
    if (succeeded) rememberPaid(creditOp, { ok: true, plan: result.plan });
    return res.json(succeeded ? { ok: true, plan: result.plan, creditsCharged: (creditReserved && succeeded) ? creditCost : 0, creditsRemaining: creditsRemainingFor(req.accountId) } : { ok: false, configured: true });
  } catch (error) {
    recordOperation({ operationType: taskType, provider: 'anthropic', model: ANTHROPIC_MODEL, ok: false, creditCost: creditReserved ? creditCost : null, creditsCharged: 0, latencyMs: Date.now() - startedAt, projectId, accountId: req.accountId, anonId });
    if (creditReserved) releaseCredit(creditOp);
    return res.status(200).json({ ok: false, configured: true });
  }
});

// Credit-architecture fix (post-Phase-I): authenticated generation is now
// governed EXCLUSIVELY by the durable daily credit ledger (lib/credits.js)
// -- lib/entitlement.js's account-durable LIFETIME cap (reserveDirection/
// commitDirection/releaseDirection, MAX_DIRECTIONS=3 forever, keyed by
// account_id) is no longer called from this route for an authenticated
// caller. Under the prior (Phase I) wiring, BOTH gates had to pass
// independently; once an account had ever used its 3 lifetime slots, it
// was permanently blocked from Claude-planned generation no matter how
// many days passed or how many daily credits it still had -- making the
// renewing daily allowance meaningless for any account that kept using
// the product past its first few directions. That was a real bug, not a
// deliberate design: lib/entitlement.js predates the credit system and was
// this route's ONLY gate for authenticated callers before credits existed
// (V8.1/V8.5); credits were meant to supersede it as the ongoing throttle,
// not stack on top of it forever.
//
// lib/entitlement.js itself is untouched -- its reserve/commit/release
// functions, their concurrency safety, and the `direction_entitlements`
// table are all still real, still tested (see v8-1-*-test.js and the
// direct lib-level concurrency test in v8-5-ownership-test.js), just no
// longer called from here. It remains available as a proven primitive if
// a future, different need for a true lifetime cap arises.
//
// UNIFIED ACCOUNT / AUTH-GATED GENERATION pass (spec items 2/3): full
// website generation now requires a real, authenticated account --
// `withOptionalAuth` is replaced with `requireAuth`, so an unauthenticated
// request is refused with 401 before ANY of this handler's body runs, let
// alone before a Claude call. This is the actual server-side enforcement
// the spec asks for ("do not rely only on hiding/disabling the button...
// the server must reject unauthorized full generation attempts"); the
// client-side gate in script.js's runGeneration is real UX, not the
// security boundary.
//
// The anonymous lifetime-ledger gate this route used to run for an
// unauthenticated caller (MAX_DIRECTIONS/claudeDirectionsUsed as the
// trial/abuse brake) is gone from HERE -- requireAuth means there is no
// more unauthenticated branch to gate. `directionsLedger`/`ensureAnonId`/
// `MAX_DIRECTIONS` themselves are left completely untouched elsewhere in
// this file (harmless, simply unused by this specific route now) -- see
// the final report for why they weren't deleted outright. `entry` (the
// per-anonymous-cookie ledger row) is still read here, but ONLY for its
// `signatures`/`history` arrays, which predate and are independent of the
// lifetime-cap gate -- they feed Claude's own "avoid repeating a similar
// direction" diversity hint (see planBrief.priorSignatures below) and
// observability, for BOTH first-time and returning signed-in visitors on
// the same browser. Stripping this would have been a real, if minor,
// quality regression unrelated to what this pass actually needs to change.
//
// Credit-architecture completion (spec item 6: "full website generation
// costs 3 credits" as a flat, universal product rule -- not "3 credits
// only when Claude happens to succeed"): credit reservation now happens
// BEFORE the anthropicProvider.configured() check, and is committed
// immediately if Claude is unconfigured -- previously an unconfigured
// deployment reserved NOTHING for an authenticated caller, because the
// early "not configured" return happened before reservation was ever
// reached. That was a real gap: the client's deterministic engine is
// guaranteed to produce a real, saved, credit-worthy direction regardless
// of whether Claude assisted it, so the credit charge must not depend on
// Claude's availability. If Claude IS configured, behavior for that branch
// is otherwise unchanged from before this pass (reserve, attempt, commit
// on success / release on failure).
app.post('/api/plan-website', requireAuth, generationRateLimit, async (req, res) => {
  const anonId = ensureAnonId(req, res);
  const entry = getDirectionsLedgerEntry(anonId); // signatures/history only now -- see comment above
  // Observability metadata only (see script.js's ExecutionPlan) -- a
  // missing/unrecognized value just labels the ledger row generically and
  // changes nothing about how this route behaves.
  const taskType = (clean(req.body.taskType, 40) === 'NEW_DIRECTION') ? 'NEW_DIRECTION' : 'NEW_SITE';
  const projectId = clean(req.body.projectId, 60) || clean(req.body.premiumGenerationId, 60); // premiumGenerationId groups the planner's USD cost with its generation
  // Durable diagnostics context (lib/generation-events.js). generationId is
  // the browser's id for this one generation attempt, so this server-side
  // planner row can be matched to the browser's own report of whether it
  // actually used the plan (POST /api/generation-diagnostics).
  const plannerCtx = { accountId: req.accountId, projectId, taskType };
  const generationId = clean(req.body.generationId, 60) || null;
  const creditCost = CREDIT_COSTS.businessGeneration;
  let creditReserved = false, creditOp = null;
  if (creditCost > 0) {
    await prepareCredits(req.accountId);
    // one operation per generation attempt: a double click or reconnect with the same generation id never plans twice
    const creditReservation = reserveAttempt(req.accountId, creditCost, 'business_generation', opIdFromKey('gen', req.accountId, clean(req.body.premiumGenerationId, 60) || generationId));
    if (creditReservation.inProgress) return res.status(409).json({ ok: false, inProgress: true, claudeDirectionsRemaining: null, message: 'This generation is already running.' });
    if (creditReservation.replay) return res.json(Object.assign({}, creditReservation.replay, { creditsCharged: 0, replayed: true, creditsRemaining: creditsRemainingFor(req.accountId) }));
    if (!creditReservation.ok) {
      recordPlannerAttempt({ outcome: 'credits_exceeded', generationId }, plannerCtx);
      return res.status(200).json({ ok: false, limited: true, creditsExceeded: true, claudeDirectionsRemaining: null, creditsRemaining: creditReservation.remaining, message: `A Business website costs ${creditCost} credits and your balance is ${creditReservation.remaining}.` });
    }
    creditReserved = true; creditOp = creditReservation.opId;
  }
  const text = clean(req.body.text, 600);
  if (!text) {
    if (creditReserved) releaseCredit(creditOp); // never charged for a request that never reached generation
    recordPlannerAttempt({ outcome: 'missing_text', generationId }, plannerCtx);
    return res.status(400).json({ ok: false, message: 'Missing business description.' });
  }
  if (!anthropicProvider.configured()) {
    // Durable record: this direction WILL be built by the deterministic
    // engine -- the single most useful fact when a site comes out generic.
    recordPlannerAttempt({ outcome: 'not_configured', generationId }, plannerCtx);
    // The credit was reserved above for a REAL generation attempt -- the
    // client's deterministic engine is about to produce this direction
    // regardless of Claude's availability, so commit now rather than
    // leaving the reservation dangling; this response is terminal and the
    // client never retries this exact reservation.
    if (creditReserved) commitCredit(creditOp);
    return res.status(200).json({ ok: false, configured: false, message: 'AI-planned generation is not configured on this environment yet.', claudeDirectionsRemaining: null, creditsCharged: creditReserved ? creditCost : 0, creditsRemaining: creditsRemainingFor(req.accountId) });
  }
  // DYNAMIC CREDIT COSTING PASS: creditsSummaryFor is read AFTER the base
  // reservation above (creditReserved is already true here, or this route
  // already returned) -- so .remaining is exactly the credits left for
  // this generation's images, the same number visualBudgetForRemainingCredits
  // buckets into an abstract tier for the prompt below.
  const brief = {
    text,
    location: clean(req.body.location, 120),
    tone: clean(req.body.tone, 20),
    extractedFacts: (req.body.extractedFacts && typeof req.body.extractedFacts === 'object') ? req.body.extractedFacts : {},
    // the owner's own name for the business, read the same way the client reads it (lib/premium/hero-copy.js)
    businessName: premiumLib.heroCopy.extractName(text),
    priorSignatures: entry.signatures.slice(-2),
    visualBudget: visualBudgetForRemainingCredits(creditsRemainingFor(req.accountId))
  };
  const startedAt = Date.now();
  try {
    const { plan: rawPlan, usage, model } = await anthropicProvider.plan(brief);
    const latencyMs = Date.now() - startedAt;
    // PLANNER HARDENING PASS: the Anthropic call itself succeeded (real
    // tokens spent, real latency) -- but that is not the same thing as
    // "produced a usable plan." normalizePlannerPlan is the single gate
    // between Claude's raw, not-fully-trusted tool_use output and every
    // consumer of `plan` below (planSignature, the JSON response, and from
    // there the client's own renderer). A malformed/unusable result is
    // handled explicitly here, in place, rather than relying on an
    // incidental crash-and-catch a few lines down to save it.
    const plan = normalizePlannerPlan(rawPlan);
    if (!plan) {
      recordPlannerAttempt({ outcome: 'malformed_output', latencyMs, model: model || null, generationId, inputTokens: usage.input_tokens, outputTokens: usage.output_tokens }, plannerCtx);
      recordOperation({ operationType: taskType, provider: 'anthropic', model: model || ANTHROPIC_MODEL, ok: false, inputTokens: usage.input_tokens, outputTokens: usage.output_tokens, cacheReadTokens: usage.cache_read_input_tokens, cacheWriteTokens: usage.cache_creation_input_tokens, creditCost: creditReserved ? creditCost : null, creditsCharged: 0, latencyMs, projectId, accountId: req.accountId, anonId });
      // Never charge for a plan that produced nothing usable, same "only
      // charge for meaningful completed work" principle the image-credit
      // settlement logic already follows.
      if (creditReserved) releaseCredit(creditOp);
      entry.history.push({ at: startedAt, model, latencyMs, success: false, error: 'Planner returned a structurally unusable plan (malformed pages)' });
      if (entry.history.length > 10) entry.history = entry.history.slice(-10);
      console.error('Website planning produced an unusable plan (malformed pages); falling back to deterministic generation.');
      // Same response shape as the catch block below -- the client already
      // treats any ok:false plan-website response as "fall back to
      // deterministic generation," so this is not a new client-side case.
      return res.status(200).json({ ok: false, message: 'The AI planner returned something unusable this time.', claudeDirectionsRemaining: null, creditsRemaining: creditsRemainingFor(req.accountId) });
    }
    recordPlannerAttempt({
      outcome: 'success', latencyMs, model: model || null, generationId, inputTokens: usage.input_tokens, outputTokens: usage.output_tokens,
      pages: plan.pages.length, imagePlanEntries: Array.isArray(plan.imagePlan) ? plan.imagePlan.length : 0,
      hasOfferings: !!(plan.business && Array.isArray(plan.business.offerings) && plan.business.offerings.length),
    }, plannerCtx);
    recordOperation({ operationType: taskType, provider: 'anthropic', model: model || ANTHROPIC_MODEL, ok: true, inputTokens: usage.input_tokens, outputTokens: usage.output_tokens, cacheReadTokens: usage.cache_read_input_tokens, cacheWriteTokens: usage.cache_creation_input_tokens, creditCost: creditReserved ? creditCost : null, creditsCharged: creditReserved ? creditCost : 0, latencyMs, projectId, accountId: req.accountId, anonId });
    if (creditReserved) commitCredit(creditOp); // reserved -> used, only on real success
    entry.signatures.push(planSignature(plan));
    if (entry.signatures.length > 5) entry.signatures = entry.signatures.slice(-5);
    entry.history.push({ at: startedAt, model, latencyMs, success: true, tokensIn: usage.input_tokens, tokensOut: usage.output_tokens });
    if (entry.history.length > 10) entry.history = entry.history.slice(-10);
    const planned = { ok: true, plan, claudeDirectionsRemaining: null, creditsCharged: creditReserved ? creditCost : 0, creditsRemaining: creditsRemainingFor(req.accountId), meta: { model, latencyMs } };
    rememberPaid(creditOp, planned);
    return res.json(planned);
  } catch (error) {
    const latencyMs = Date.now() - startedAt;
    recordPlannerAttempt({ outcome: 'error', latencyMs, errorCategory: categorizeAnthropicError(error), generationId }, plannerCtx);
    recordOperation({ operationType: taskType, provider: 'anthropic', model: ANTHROPIC_MODEL, ok: false, creditCost: creditReserved ? creditCost : null, creditsCharged: 0, latencyMs, projectId, accountId: req.accountId, anonId });
    if (creditReserved) releaseCredit(creditOp); // a failed attempt never permanently consumes a credit
    entry.history.push({ at: startedAt, latencyMs, success: false, error: String(error && error.message || error) });
    if (entry.history.length > 10) entry.history = entry.history.slice(-10);
    console.error('Website planning failed:', error);
    return res.status(200).json({ ok: false, message: 'Could not reach the AI planner right now.', claudeDirectionsRemaining: null, creditsRemaining: creditsRemainingFor(req.accountId) });
  }
});

// CREATIVE MODE (see CREATIVE_MODE.md): research for a Creative page -- what the brief is
// about, and, for a recognizable subject, its encyclopedia facts and reusable-licence
// pictures from Wikipedia / Wikimedia Commons (free public APIs, fixed host allow-list, no
// image generation). It starts (or continues) the page's paid job -- see the BILLING PASS note in the route -- and
// creates no project; it is rate-limited like generation. Personal
// subjects get general facts about their species only (never pictures of other animals as
// "theirs"); invented subjects are not looked up at all. Retrieved text is returned as data
// for the director -- it is never treated as instructions. Every run is written to its own
// ledger (data/premium/creative-ledger.jsonl), separate from Business costs.
const creativeUnderstand = require('./lib/creative/understand');
const creativeResearch = require('./lib/creative/research');
// CREATIVE AI DIRECTION (lib/creative/ai.js): the model resolves what a brief is about (cheap
// model) and directs the page (strong model, with thumbnails of the actual pictures). Creative-only
// limits: a daily USD ceiling for all Creative AI calls on this server and a daily per-account cap
// on direction calls -- both configurable (CREATIVE_DAILY_USD_CAP, CREATIVE_ACCOUNT_DAILY_PLANS),
// neither shared with Business credits or budgets. Every call is written to creative-ledger.jsonl
// with its tokens and ESTIMATED cost. The key stays here; the browser only ever sees validated plans.
const creativeAi = require('./lib/creative/ai');
const creativeWeb = require('./lib/creative/webimages');
const creativeWebFetch = require('./lib/creative/webfetch');
const CREATIVE_AI_LIMITS = creativeAi.limits(process.env);
const creativeSpend = { day: '', usd: 0, plansByAccount: new Map(), seeded: false, imageSearches: 0 };
// Google Images through SerpApi, when the server has SERPAPI_API_KEY (read here only; never logged, returned or stored).
// Searches are counted against a daily cap that protects the SerpApi plan's monthly allowance; CREATIVE_SERPAPI_USD
// (default 0: the plan is paid monthly, not per call) adds a per-search amount to the Creative spend if set.
const creativeSerpApi = require('./lib/creative/serpapi');
const CREATIVE_SERPAPI = { searches: Math.max(1, Math.min(4, Number(process.env.CREATIVE_SERPAPI_SEARCHES) || 1)), cacheDays: Math.max(0, Number(process.env.CREATIVE_SERPAPI_CACHE_DAYS) || 30), daily: Math.max(0, Number(process.env.CREATIVE_SERPAPI_DAILY) || 60), usd: Math.max(0, Number(process.env.CREATIVE_SERPAPI_USD) || 0) };
function creativeSerpKey() { return String(process.env.SERPAPI_API_KEY || '').trim(); }
const creativeSerpCache = { loaded: false, map: new Map() }; // query -> { at, results } (metadata only: titles and URLs, never the key)
function creativeSerpCacheFile() { return path.join(PREMIUM_LOG_DIR, 'creative-serp-cache.json'); }
function creativeSerpCacheGet(q) {
  if (!creativeSerpCache.loaded) { creativeSerpCache.loaded = true; try { JSON.parse(premiumFs.readFileSync(creativeSerpCacheFile(), 'utf8')).forEach(e => creativeSerpCache.map.set(e.q, e)); } catch (e) { /* none yet */ } }
  const e = creativeSerpCache.map.get(q); return e && Date.now() - e.at < CREATIVE_SERPAPI.cacheDays * 86400000 ? e : null;
}
function creativeSerpCachePut(q, results) {
  creativeSerpCache.map.set(q, { q, at: Date.now(), results });
  const keep = [...creativeSerpCache.map.values()].sort((a, b) => b.at - a.at).slice(0, 500);
  creativeSerpCache.map = new Map(keep.map(e => [e.q, e]));
  try { premiumFs.mkdirSync(PREMIUM_LOG_DIR, { recursive: true }); premiumFs.writeFile(creativeSerpCacheFile(), JSON.stringify(keep), () => {}); } catch (e) { /* the cache is an optimisation */ }
}
function creativeSpendToday() {
  const day = new Date().toISOString().slice(0, 10);
  if (creativeSpend.day !== day) { creativeSpend.day = day; creativeSpend.usd = 0; creativeSpend.inflight = 0; creativeSpend.plansByAccount = new Map(); creativeSpend.seeded = false; creativeSpend.imageSearches = 0; }
  if (!creativeSpend.seeded) {
    creativeSpend.seeded = true; // survive a restart: today's rows from the ledger
    try {
      premiumFs.readFileSync(path.join(PREMIUM_LOG_DIR, 'creative-ledger.jsonl'), 'utf8').split('\n').forEach(l => {
        if (!l) return; let r; try { r = JSON.parse(l); } catch (e) { return; }
        if (!r.at || r.at.slice(0, 10) !== day) return;
        creativeSpend.usd += Number(r.usd) || 0;
        if (r.kind === 'creative_direct' && r.accountId) creativeSpend.plansByAccount.set(r.accountId, (creativeSpend.plansByAccount.get(r.accountId) || 0) + 1);
        if (r.kind === 'creative_imagesearch') creativeSpend.imageSearches += Number(r.searches) || 0;
      });
    } catch (e) { /* no ledger yet */ }
  }
  return creativeSpend;
}
// When the provider says the account cannot be used (balance used up, key rejected), Creative stops calling it for a
// while and says why at every step -- instead of each step spending a failing request. Temporary overloads do not count.
const creativeProvider = { downUntil: 0, reason: '' };
function creativeProviderTrip(error) {
  const msg = String(error && error.message || error); const st = Number(error && error.status) || 0;
  if (/credit balance|billing|payment|insufficient|quota/i.test(msg) || st === 401 || st === 403) {
    creativeProvider.downUntil = Date.now() + 10 * 60 * 1000;
    creativeProvider.reason = /credit balance|billing|payment|insufficient|quota/i.test(msg) ? 'the AI provider account has no usable credit balance (Anthropic: "credit balance is too low")' : 'the AI provider rejected the key';
  }
}
// THE SERVER'S OWN CREATIVE AI BUDGET (CREATIVE_DAILY_USD_CAP) -- what this server spends at the provider, never a
// customer's balance. Every paid step first reserves its WORST-CASE cost (from the configured token limits and prices),
// and what is reserved counts against the cap until the step settles -- so steps already running cannot jointly
// overshoot it. A refusal says so plainly and never touches the customer's credits.
const CREATIVE_BUDGET_MSG = 'Creative has reached its daily AI limit on our side, so this step did not run. Your credits were not used -- please try again tomorrow (UTC).';
function creativeBoundUsd(step) {
  const L = CREATIVE_AI_LIMITS, P = L.prices, M = 1e6;
  const cheap = (out, inp) => (out * P.cheap.output + inp * P.cheap.input) / M;
  if (step === 'check') return cheap(1500, 12000);
  if (step === 'research') return cheap(L.understandMaxTokens, 8000) + 2 * cheap(L.curateMaxTokens, 45000) + L.webSearches * L.webSearchUsd + CREATIVE_SERPAPI.searches * CREATIVE_SERPAPI.usd;
  const attempts = 1 + L.repairs; // 'direction': the direction, its bounded repairs and their claim checks
  return attempts * ((L.directorMaxTokens * P.strong.output + 60000 * P.strong.input) / M + (L.claimCheck ? cheap(L.claimsMaxTokens, 30000) : 0));
}
function creativeBudgetTake(usd) {
  const s = creativeSpendToday();
  if (s.usd + (s.inflight || 0) + usd > CREATIVE_AI_LIMITS.dailyUsdCap) return null;
  s.inflight = (s.inflight || 0) + usd; const day = s.day; let done = false;
  return () => { if (done) return; done = true; if (creativeSpend.day === day) creativeSpend.inflight = Math.max(0, (creativeSpend.inflight || 0) - usd); };
}
// what a Creative response says about the owner's credits
function creativeCredits(accountId, charged) { return { creditsCharged: charged || 0, creditsRemaining: creditsRemainingFor(accountId), creditCosts: { page: CREDIT_COSTS.creativePage, research: CREDIT_COSTS.creativeResearch, direction: CREDIT_COSTS.creativeDirection } }; }
function creativeProviderDown() { return Date.now() < creativeProvider.downUntil ? creativeProvider.reason : ''; }
function creativeAiAvailable() { return CREATIVE_AI_LIMITS.enabled && anthropicProvider.configured() && !creativeProviderDown(); }
function creativeAiUnavailableReason() { return !CREATIVE_AI_LIMITS.enabled ? 'AI direction is switched off (CREATIVE_AI_DIRECTION)' : !anthropicProvider.configured() ? 'no AI model is configured on this server' : creativeProviderDown() || ''; }
// a request that may use server tools (web search): the whole response comes back
async function creativeRawCall({ model, system, messages, tools, maxTokens, timeoutMs }) {
  const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), timeoutMs || 90000);
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST', headers: { 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model, max_tokens: maxTokens, system, messages, tools }), signal: controller.signal,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) { const e = new Error((data && data.error && data.error.message) || `Anthropic returned ${response.status}`); e.status = response.status; creativeProviderTrip(e); throw e; }
    return data;
  } finally { clearTimeout(timer); }
}
async function creativeModelCall({ model, system, content, messages, tool, maxTokens, timeoutMs, cacheSystem }) {
  const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), timeoutMs || 90000); const t0 = Date.now();
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST', headers: { 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model, max_tokens: maxTokens, thinking: { type: 'disabled' }, system: [{ type: 'text', text: system, ...(cacheSystem ? { cache_control: { type: 'ephemeral' } } : {}) }], messages: messages || [{ role: 'user', content }], tools: [tool], tool_choice: { type: 'tool', name: tool.name } }),
      signal: controller.signal,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) { const e = new Error((data && data.error && data.error.message) || `Anthropic returned ${response.status}`); e.status = response.status; creativeProviderTrip(e); throw e; }
    const block = (data.content || []).find(b => b.type === 'tool_use' && b.name === tool.name);
    if (!block || !block.input) throw new Error('the model returned no structured output');
    if (data.stop_reason === 'max_tokens') throw new Error('the model ran out of output room before finishing');
    return { input: block.input, toolUseId: block.id, usage: data.usage || {}, model: data.model || model, ms: Date.now() - t0 };
  } finally { clearTimeout(timer); }
}
// the deployed build, so the Creative studio files are loaded as one matching set (never a stale
// cached studio against a newer server). Public and uncached; it carries no data.
const CREATIVE_BUILD = String(process.env.RAILWAY_GIT_COMMIT_SHA || process.env.SOURCE_VERSION || `boot-${Date.now().toString(36)}`).slice(0, 40);
app.get('/api/creative/version', (req, res) => { res.setHeader('Cache-Control', 'no-store'); res.json({ v: CREATIVE_BUILD }); });
// The Creative ledger is appended in order: one write at a time (premiumAppend's parallel appends could land rows out
// of order -- the cause of an intermittent test failure, and a real ordering fault in the ledger)
let creativeLedgerQueue = Promise.resolve();
function creativeAppend(obj) {
  const line = JSON.stringify(obj) + '\n';
  creativeLedgerQueue = creativeLedgerQueue.then(() => new Promise(res => { try { premiumFs.mkdirSync(PREMIUM_LOG_DIR, { recursive: true }); premiumFs.appendFile(path.join(PREMIUM_LOG_DIR, 'creative-ledger.jsonl'), line, () => res()); } catch (e) { res(); } }));
}
function creativeLedger(row) { const s = creativeSpendToday(); s.usd += Number(row.usd) || 0; creativeAppend(Object.assign({ at: new Date().toISOString() }, row)); }

// Web discovery (webimages.js): when Commons does not cover the subject, the search step finds pages that show it and
// the hardened fetcher reads their declared images. Pictures whose pages state a free licence are used; relevant ones
// with restricted or unclear terms are offered to the owner as links to review. Bounded; costed in the ledger.
const creativeOffers = new Map(); // accountId -> { until, urls: Set } : the review pictures this account was just shown
function creativeOffer(accountId, urls) { creativeOffers.set(accountId, { until: Date.now() + 2 * 60 * 60 * 1000, urls: new Set(urls) }); if (creativeOffers.size > 5000) creativeOffers.delete(creativeOffers.keys().next().value); }
async function creativeWebDiscovery(understanding, brief, accountId, refine) {
  const identity = understanding.identity || { name: understanding.subject, kind: understanding.kind };
  const input = { identity, visuals: understanding.visuals, brief: refine ? `${brief}\nThe owner asks to look for: ${refine}` : brief };
  const out = { images: [], review: [], coverage: 'none', missing: [], log: null, usd: 0, error: '', searches: 0, diag: { queries: [], stop: '', results: 0, pagesChosen: 0, pageErrors: [], imageErrors: [], candidates: [] } };
  const serpKey = creativeSerpKey();
  const webCurate = async (candidates, max) => {
    if (!(CREATIVE_AI_LIMITS.curate && creativeAiAvailable() && creativeSpendToday().usd < CREATIVE_AI_LIMITS.dailyUsdCap)) throw new Error(creativeAiUnavailableReason() || 'the picture check is off or the daily budget is used up');
    try {
      const c = await creativeAi.curate({ identity, visuals: understanding.visuals, max, candidates }, { limits: CREATIVE_AI_LIMITS, call: creativeModelCall });
      out.usd += c.usd;
      creativeLedger({ kind: 'creative_curate', accountId, ok: true, source: 'web', model: c.model, inputTokens: c.usage.input_tokens || 0, outputTokens: c.usage.output_tokens || 0, ms: c.ms, usd: c.usd, estimated: true, candidates: c.of, judged: c.judged, selected: c.selection.length });
      return c;
    } catch (error) { creativeLedger({ kind: 'creative_curate', accountId, ok: false, source: 'web', error: String(error && error.message || error).slice(0, 200), usd: 0 }); throw error; }
  };
  const found = serpKey ? await creativeWeb.discoverImages(input, { curate: ({ candidates, max }) => webCurate(candidates, max), imageSearch: async () => {
    const spend = creativeSpendToday();
    const qs = creativeSerpApi.searchQueries(Object.assign({}, understanding, { pageTitle: understanding.pageTitle || '' }), CREATIVE_SERPAPI.searches);
    if (refine) qs.unshift({ q: `${String(refine).slice(0, 120)} -cosplay -plush -figure -site:deviantart.com`, licenses: '' });
    const results = []; let searches = 0; let error = '';
    for (const q of qs.slice(0, CREATIVE_SERPAPI.searches)) {
      const hit = CREATIVE_SERPAPI.cacheDays ? creativeSerpCacheGet(q.q) : null;
      if (hit) {
        creativeAppend({ at: new Date().toISOString(), kind: 'creative_imagesearch', provider: 'serpapi', accountId, ok: true, cached: true, searches: 0, results: hit.results.length, query: q.q.slice(0, 120), usd: 0 });
        out.diag.queries.push(q.q); out.diag.cached = true; hit.results.forEach(x => results.push(Object.assign({}, x, { query: q.q }))); continue;
      }
      if (spend.imageSearches >= CREATIVE_SERPAPI.daily) { error = error || `the daily image-search limit (${CREATIVE_SERPAPI.daily}, CREATIVE_SERPAPI_DAILY) is used up`; break; }
      const r = await creativeSerpApi.googleImages(q.q, { key: serpKey, licenses: q.licenses });
      // a refused or failed call is counted too (SerpApi may still bill it); an empty result counts as a search
      searches++; spend.imageSearches++; const usd = CREATIVE_SERPAPI.usd; spend.usd += usd; out.usd += usd;
      creativeAppend({ at: new Date().toISOString(), kind: 'creative_imagesearch', provider: 'serpapi', accountId, ok: r.ok, status: r.status, searches: 1, results: r.results.length, query: q.q.slice(0, 120), licenses: q.licenses || '', error: r.error || '', usd });
      out.diag.queries.push(q.q);
      if (!r.ok) { error = r.error; if (r.status === 401 || r.status === 403 || r.status === 429) break; continue; }
      if (CREATIVE_SERPAPI.cacheDays && r.results.length) creativeSerpCachePut(q.q, r.results); // an empty answer is not kept (it may be transient)
      r.results.forEach(x => results.push(Object.assign({}, x, { query: q.q })));
    }
    out.searches = searches; Object.assign(out.diag, { provider: 'serpapi', results: results.length, products: results.filter(x => x.isProduct).length, searchError: error });
    return { results, searches, error };
  } }) : await creativeWeb.discover(input, { searchPages: async inp => {
    try {
      const r = await creativeAi.webSearchPages(inp, { limits: CREATIVE_AI_LIMITS, raw: creativeRawCall });
      out.usd += r.usd; out.searches = r.searches; Object.assign(out.diag, { queries: r.queries || [], stop: r.stop || '', results: r.results || 0, pagesChosen: (r.pages || []).length, searchError: r.error || '' });
      creativeLedger({ kind: 'creative_websearch', accountId, ok: !r.error, model: r.model, searches: r.searches, results: r.results, pages: r.pages.length, inputTokens: r.usage.input_tokens || 0, outputTokens: r.usage.output_tokens || 0, ms: r.ms, usd: r.usd, estimated: true, error: r.error || undefined });
      return r;
    } catch (error) { creativeLedger({ kind: 'creative_websearch', accountId, ok: false, error: String(error && error.message || error).slice(0, 200), usd: 0 }); throw error; }
  } });
  out.log = found.log; out.error = found.log.searchError || '';
  if (serpKey) Object.assign(out.diag, { pagesChosen: found.log.pages || 0, thumbErrors: (found.log.thumbErrors || []).slice(0, 8), judged: found.log.judged || 0 });
  out.diag.pageErrors = (found.log.pageErrors || []).slice(0, 8); out.diag.imageErrors = (found.log.imageErrors || []).slice(0, 10);
  // every found picture, assessed three separate ways: what it shows (and whether it is official), whether it is
  // technically usable, what its page permits -- a picture that was not suitable is not read or downloaded at all
  const record = (v, k, outcome) => out.diag.candidates.push({ src: 'web', pageUrl: v.pageUrl, imageUrl: v.imageUrl, site: v.site, title: String(v.title || '').slice(0, 120), query: v.query || '', position: v.searchPosition || 0,
    technical: { size: `${v.width}x${v.height}`, mime: v.mime, kb: v.bytes ? Math.round(v.bytes.length / 1024) : 0, fetched: v.technical ? v.technical.fetched : !!v.bytes, reason: v.technical ? v.technical.reason : '', viewable: !!v.bytes && /^image\/(jpeg|png|webp)$/.test(v.mime) && v.bytes.length <= 3.5 * 1024 * 1024 },
    permission: v.permission ? { status: v.permission.status, licence: v.permission.licence, evidence: v.permission.evidence, note: v.permission.note } : { status: 'not checked', licence: '', evidence: [], note: 'not read: the picture was not suitable' },
    verdict: k ? { role: k.role, identity: k.identity, origin: k.origin || 'unknown', depicts: k.depicts, issues: k.issues, quality: k.quality } : null, outcome });
  if (!found.candidates.length) return out;
  // the picture check: the image-search path has already looked at every thumbnail; the page-search path looks now
  let c = serpKey ? found.curation : null;
  if (!serpKey) {
    const viewable = found.candidates.filter(v => v.bytes && /^image\/(jpeg|png|webp)$/.test(v.mime) && v.bytes.length <= 3.5 * 1024 * 1024);
    if (viewable.length && CREATIVE_AI_LIMITS.curate && creativeAiAvailable() && creativeSpendToday().usd < CREATIVE_AI_LIMITS.dailyUsdCap) {
      try { c = await webCurate(viewable.map(v => ({ id: v.id, title: v.title, description: `${v.site}${v.why ? ' -- ' + v.why : ''}`, categories: '', size: `${v.width}x${v.height}`, thumb: { mime: v.mime, bytes: v.bytes } })), 6); }
      catch (error) { out.error = out.error || `the picture check failed (${String(error && error.message || error).slice(0, 120)})`; }
    }
  }
  if (!c) { out.error = out.error || 'the found pictures could not be judged'; found.candidates.forEach(v => record(v, null, 'not judged')); return out; }
  const offer = [];
  for (const v of found.candidates) {
    const k = c.verdicts[v.id];
    if (!k) { record(v, null, 'not judged (no viewable picture)'); continue; }
    if (k.role === 'unrelated' || k.identity === 'other') { record(v, k, 'not the subject'); continue; }
    if (k.identity === 'form') { record(v, k, 'a real-world form (cosplay, figure, merchandise...), not the subject itself'); continue; }
    if (k.role === 'logo' || k.role === 'reference') { record(v, k, 'a logo, reference or interface capture'); continue; }
    if (k.identity === 'exact' && k.origin === 'fan') { record(v, k, 'fan-made, not official artwork'); continue; }
    if ((k.issues || []).includes('watermark')) { record(v, k, 'watermarked (a stock-photo preview or similar)'); continue; }
    const itself = (k.role === 'subject' || k.role === 'detail') && k.identity === 'exact';
    const free = v.permission && v.permission.status === 'free';
    if (free && v.bytes && c.selection.includes(v.id)) { out.images.push(Object.assign({}, v, { curation: k })); record(v, k, 'used'); }
    else if (free && v.bytes) record(v, k, 'free, but not selected');
    else if (!itself) record(v, k, `supporting picture, not free (${v.permission ? v.permission.status : 'not checked'})`);
    else offer.push({ v, k });
  }
  // the best pictures of the character itself, shown to the owner with their source and licence status (never marked free)
  offer.sort((a, b) => (b.k.origin === 'official') - (a.k.origin === 'official') || (b.k.quality || 0) - (a.k.quality || 0) || (b.v.width * b.v.height) - (a.v.width * a.v.height));
  offer.forEach(({ v, k }, n) => {
    if (n >= 6) { record(v, k, 'suitable, not offered (beyond the six shown)'); return; }
    const status = v.permission ? v.permission.status : 'unclear';
    record(v, k, `offered to the owner for review (${status}${v.bytes ? '' : '; the original could not be downloaded here'})`);
    const pv = v.bytes && v.bytes.length <= 1.2 * 1024 * 1024 ? `data:${v.mime};base64,${v.bytes.toString('base64')}` : v.thumb ? `data:${v.thumb.mime};base64,${v.thumb.bytes.toString('base64')}` : '';
    out.review.push({ id: v.id, pageUrl: v.pageUrl, imageUrl: v.imageUrl, title: v.title, site: v.site, depicts: k.depicts, role: k.role, identity: k.identity, origin: k.origin || 'unknown', query: v.query || '', width: v.width, height: v.height,
      adoptable: !!v.bytes, technical: v.technical ? v.technical.reason : '',
      permission: v.permission ? { status: v.permission.status, licence: v.permission.licence, note: v.permission.note, evidence: v.permission.evidence } : { status: 'unclear', licence: '', note: 'Its page was not read.', evidence: [] }, preview: pv });
  });
  out.coverage = out.images.some(v => v.curation.role === 'subject' && v.curation.identity === 'exact') ? 'strong' : out.images.some(v => v.curation.role === 'subject' || v.curation.role === 'detail') ? 'partial' : 'none';
  out.missing = out.coverage === 'strong' ? [] : c.missing;
  if (out.review.length) creativeOffer(accountId, out.review.filter(r => r.adoptable).map(r => r.imageUrl));
  return out;
}

const creativePictureChecks = new Map(); // job id -> picture checks run (a bounded part of the page's price)
const CREATIVE_PICTURE_CHECKS_PER_JOB = 6;
// The pictures the owner picked, checked for watermarks at up to 1024 px before the page is built (the search thumbnails
// are too small to show a faint one). One cheap vision call for up to four pictures; a ledger row.
app.post('/api/creative/check-pictures', requireAuth, requireSameOrigin, generationRateLimit, async (req, res) => {
  const list = (Array.isArray(req.body && req.body.pictures) ? req.body.pictures : []).slice(0, 4).map(p => {
    const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String(p && p.dataUrl || '')); if (!m || !/^[\w-]{1,40}$/.test(String(p.id || ''))) return null;
    const bytes = Buffer.from(m[2], 'base64'); return bytes.length > 0 && bytes.length <= 1.6 * 1024 * 1024 ? { id: String(p.id), mime: m[1], bytes } : null;
  }).filter(Boolean);
  if (!list.length) return res.status(400).json({ ok: false, message: 'No pictures to check.' });
  // BILLING PASS: the watermark check is part of a Creative page's price -- it runs only inside this account's own,
  // still-open page job (already paid or reserved), a bounded number of times per page
  const job = creativeJobs.get(db, req.accountId, clean(req.body && req.body.jobId, 60));
  if (!job || job.status === 'failed') return res.status(402).json({ ok: false, needsJob: true, reason: 'the picture check runs as part of a Creative page -- start the page from its brief first' });
  if ((creativePictureChecks.get(job.id) || 0) >= CREATIVE_PICTURE_CHECKS_PER_JOB) return res.json({ ok: false, reason: 'this page has used its included picture checks' });
  if (!creativeAiAvailable()) return res.json({ ok: false, reason: creativeAiUnavailableReason() });
  const releaseBudget = creativeBudgetTake(creativeBoundUsd('check'));
  if (!releaseBudget) return res.json({ ok: false, providerBudget: true, reason: CREATIVE_BUDGET_MSG });
  creativePictureChecks.set(job.id, (creativePictureChecks.get(job.id) || 0) + 1);
  if (creativePictureChecks.size > 5000) creativePictureChecks.delete(creativePictureChecks.keys().next().value);
  try {
    const r = await creativeAi.checkPictures({ pictures: list }, { limits: CREATIVE_AI_LIMITS, call: creativeModelCall }).finally(releaseBudget);
    credits.addProviderUsd(db, `${job.id}:research`, r.usd);
    creativeLedger({ kind: 'creative_picturecheck', accountId: req.accountId, ok: true, model: r.model, pictures: list.length, flagged: Object.values(r.results).filter(x => x.watermark).length, inputTokens: r.usage.input_tokens || 0, outputTokens: r.usage.output_tokens || 0, ms: r.ms, usd: r.usd, estimated: true });
    res.json({ ok: true, results: r.results });
  } catch (error) {
    creativeLedger({ kind: 'creative_picturecheck', accountId: req.accountId, ok: false, error: String(error && error.message || error).slice(0, 200), usd: 0 });
    res.json({ ok: false, reason: 'the watermark check failed' });
  }
});

// "Use this picture -- I have the rights to it": only a picture this studio just offered this account, fetched with the
// hardened fetcher; it becomes the owner's supplied picture (the studio records the source and the owner's affirmation)
app.post('/api/creative/fetch-image', requireAuth, requireSameOrigin, generationRateLimit, async (req, res) => {
  const url = clean(req.body && req.body.url, 1000); const o = creativeOffers.get(req.accountId);
  if (!url || !o || o.until < Date.now() || !o.urls.has(url)) return res.status(400).json({ ok: false, message: 'That picture is not one this studio offered you. Search again, or upload it yourself.' });
  const r = await creativeWebFetch.fetchImage(url);
  if (!r.ok) return res.json({ ok: false, message: `Could not fetch that picture (${r.reason}). Download it from its page and upload it instead.` });
  if (!/^image\/(jpeg|png|webp)$/.test(r.mime)) return res.json({ ok: false, message: 'That picture is in a format the studio cannot use. Download it and upload a JPEG, PNG or WebP.' });
  res.json({ ok: true, dataUrl: `data:${r.mime};base64,${r.body.toString('base64')}`, width: r.width, height: r.height, mime: r.mime });
});

app.post('/api/creative/research', requireAuth, requireSameOrigin, generationRateLimit, async (req, res) => {
  const brief = clean(req.body && req.body.brief, 1200);
  if (!brief) return res.status(400).json({ ok: false, message: 'Describe what the page should be about.' });
  const supplied = clean(req.body.supplied, 2000);
  const choice = clean(req.body.choice, 160); // the owner's pick after a clarification
  // "look again": the owner refines the picture search; the understanding they already have is reused (no new call)
  const refine = clean(req.body.refine, 120);
  const prior = refine && req.body.understanding && typeof req.body.understanding === 'object' && req.body.understanding.source === 'ai' ? req.body.understanding : null;
  // BILLING PASS: the page is one job (lib/creative-jobs.js). A new page reserves its whole price -- 1 research + 3
  // direction credits -- BEFORE any paid step; the clarification answer, "search again" and a resume after a reload
  // continue the same job (within its included research runs) and cost nothing more.
  await prepareCredits(req.accountId);
  const askedJob = clean(req.body.jobId, 60);
  let job = creativeJobs.get(db, req.accountId, askedJob);
  let jobNew = false;
  if (!job && askedJob && (refine || choice)) return res.json({ ok: false, jobEnded: true, ...creativeCredits(req.accountId), message: `This page's research session has ended. Start the page again to research it (${CREDIT_COSTS.creativePage} credits).` });
  if (!job) {
    const begun = creativeJobs.begin(db, req.accountId);
    if (!begun.ok) return res.json({ ok: false, creditsExceeded: true, ...creativeCredits(req.accountId), message: `A Creative page costs ${CREDIT_COSTS.creativePage} credits (research and direction, automatic fixes included). Your balance is ${begun.remaining}.` });
    job = begun.job; jobNew = true;
  }
  if (!creativeJobs.takeResearchRun(db, job)) return res.json({ ok: false, researchUsedUp: true, jobId: job.id, ...creativeCredits(req.accountId), message: `This page has used its ${creativeJobs.RESEARCH_RUNS} included research runs. Build it with the pictures you have or upload your own.` });
  // the server's own AI budget: reserved for the worst case before anything paid runs
  let releaseBudget = () => {};
  if (creativeAiAvailable()) {
    const take = creativeBudgetTake(creativeBoundUsd('research'));
    if (!take) { if (jobNew) creativeJobs.researchFailed(db, job); return res.json({ ok: false, providerBudget: true, jobId: jobNew ? null : job.id, ...creativeCredits(req.accountId), message: CREATIVE_BUDGET_MSG }); }
    releaseBudget = take;
  }
  res.once('close', () => releaseBudget()); res.once('finish', () => releaseBudget());
  // Settlement: research is charged once, when a paid step of it has produced something (an understanding, a picture
  // check, a picture search). A run with no paid step (AI off, the free sources only) charges nothing; if a later run of
  // the same job does, it is charged then. A first run that fails outright ends the job and returns all 4 credits.
  let paidUsd = 0, paidOk = false;
  const settleResearch = (failed) => {
    releaseBudget();
    if (failed && jobNew && !paidOk) { creativeJobs.researchFailed(db, job, { providerUsd: paidUsd }); return 0; }
    if (!paidOk) { credits.addProviderUsd(db, `${job.id}:research`, paidUsd); return 0; }
    const c = creativeJobs.researchDone(db, job, { providerUsd: paidUsd });
    return c && c.ok && !c.already ? c.charged : 0;
  };
  const startedAt = Date.now();
  // 1. what the brief is about -- the model when available (identity before research), else the built-in reader
  let understanding = creativeUnderstand.understandBrief(brief, { supplied, uploads: !!req.body.hasUploads });
  let understandMeta = { source: 'rules', reason: creativeAiUnavailableReason() };
  if (prior) {
    const s = (v, n) => String(v == null ? '' : v).slice(0, n); const arr = (v, n, m) => (Array.isArray(v) ? v : []).slice(0, n).map(x => s(x, m)).filter(Boolean);
    const pr = prior.research || {}; const pi = prior.identity || {}; const pv = prior.visuals || {};
    understanding = Object.assign({}, understanding, {
      kind: ['recognizable', 'fictional', 'invented'].includes(prior.kind) ? prior.kind : 'recognizable', subject: s(prior.subject, 120), query: s(prior.query, 160) || null, source: 'ai',
      identity: { name: s(pi.name, 120), kind: s(pi.kind, 20), what: s(pi.what, 240), confidence: s(pi.confidence, 10) },
      visuals: Object.assign({ main: s(pv.main, 200), setting: s(pv.setting, 200), supporting: arr(pv.supporting, 4, 120) }, ['artwork', 'photo', 'none'].includes(pv.depiction) ? { depiction: pv.depiction } : {}),
      research: { scope: pr.scope === 'none' ? 'none' : 'subject', wikipediaTitles: arr(pr.wikipediaTitles, 3, 160), commonsQueries: [refine].concat(arr(pr.commonsQueries, 3, 100)), note: '' },
      tone: prior.tone && typeof prior.tone === 'object' ? { register: s(prior.tone.register, 20), words: arr(prior.tone.words, 5, 30), fromBrief: !!prior.tone.fromBrief } : understanding.tone,
      motifs: arr(prior.motifs, 8, 80), audience: s(prior.audience, 160), uncertainty: arr(prior.uncertainty, 5, 200),
    });
    understandMeta = { source: 'reused', reason: 'the owner refined the picture search' };
  } else if (creativeAiAvailable() && creativeSpendToday().usd < CREATIVE_AI_LIMITS.dailyUsdCap) {
    try {
      const r = await creativeAi.understand({ brief, supplied, uploads: Number(req.body.hasUploads) || 0, choice }, { limits: CREATIVE_AI_LIMITS, call: creativeModelCall });
      const u = creativeAi.normaliseUnderstanding(r.raw, brief);
      if (choice) { u.kind = u.identity.kind === 'ambiguous' ? 'recognizable' : u.identity.kind; u.clarify = null; }
      understanding = Object.assign(u, { legacy: { tone: understanding.tone, purpose: understanding.purpose, asks: understanding.asks } });
      understandMeta = { source: 'ai', model: r.model, ms: r.ms, usd: r.usd, usage: r.usage };
      paidOk = true; paidUsd += Number(r.usd) || 0;
      creativeLedger({ kind: 'creative_understand', accountId: req.accountId, ok: true, model: r.model, inputTokens: r.usage.input_tokens || 0, outputTokens: r.usage.output_tokens || 0, ms: r.ms, usd: r.usd, estimated: true, identity: u.identity.name, identityKind: u.identity.kind, clarify: !!u.clarify });
    } catch (error) {
      understandMeta = { source: 'rules', reason: `the understanding call failed (${String(error && error.message || error).slice(0, 120)})` };
      creativeLedger({ kind: 'creative_understand', accountId: req.accountId, ok: false, error: String(error && error.message || error).slice(0, 200), usd: 0 });
    }
  } else if (creativeAiAvailable()) understandMeta.reason = 'the daily Creative AI budget is used up';
  if (understanding.clarify && !choice && !prior) {
    const charged = settleResearch(false);
    return res.json({ ok: true, jobId: job.id, understanding, understandMeta, research: { status: 'ambiguous', page: null, facts: [], options: understanding.clarify.options, question: understanding.clarify.question, log: { requests: 0, bytes: 0, ms: 0 } }, images: [], ...creativeCredits(req.accountId, charged) });
  }
  if (choice && understandMeta.source === 'rules' && understanding.kind !== 'personal') Object.assign(understanding, { kind: 'recognizable', subject: choice, query: choice });
  let result = { status: 'skipped', facts: [], images: [], options: [], log: { requests: 0, bytes: 0, ms: 0 } };
  let curateMeta = null;
  try {
    const scope = understanding.research ? understanding.research.scope : (understanding.kind === 'recognizable' ? 'subject' : understanding.kind === 'personal' && understanding.query ? 'general-topic' : 'none');
    if (scope !== 'none' && (understanding.query || (understanding.research && understanding.research.wikipediaTitles.length))) {
      const titles = understanding.research ? understanding.research.wikipediaTitles.slice() : [];
      if (choice) titles.unshift(choice);
      // pictures are skipped only for a personal subject (never other animals or people as "theirs") -- an everyday
      // object the model calls a "general topic" still gets its pictures
      // the picture check: one cheap vision call over the shortlist's thumbnails, when AI is on and within budget
      const curate = creativeAiAvailable() && CREATIVE_AI_LIMITS.curate ? async ({ candidates, max }) => {
        if (creativeSpendToday().usd >= CREATIVE_AI_LIMITS.dailyUsdCap) throw new Error('the daily Creative AI budget is used up');
        try {
          const c = await creativeAi.curate({ identity: understanding.identity || { name: understanding.subject, kind: understanding.kind }, visuals: understanding.visuals, max, candidates }, { limits: CREATIVE_AI_LIMITS, call: creativeModelCall });
          curateMeta = { source: 'ai', model: c.model, ms: c.ms, usd: c.usd, judged: c.judged, of: c.of };
          paidOk = true; paidUsd += Number(c.usd) || 0;
          creativeLedger({ kind: 'creative_curate', accountId: req.accountId, ok: true, model: c.model, inputTokens: c.usage.input_tokens || 0, outputTokens: c.usage.output_tokens || 0, ms: c.ms, usd: c.usd, estimated: true, candidates: c.of, judged: c.judged, selected: c.selection.length, coverage: c.coverage });
          return c;
        } catch (error) { creativeLedger({ kind: 'creative_curate', accountId: req.accountId, ok: false, error: String(error && error.message || error).slice(0, 200), usd: 0 }); throw error; }
      } : null;
      result = await creativeResearch.research(understanding, { textOnly: understanding.kind === 'personal' || !!creativeSerpKey(), fictional: understanding.kind === 'fictional' || !!(understanding.identity && understanding.identity.kind === 'fictional'), maxImages: 7, titles, queries: understanding.research ? understanding.research.commonsQueries : [], curate });
    }
  } catch (error) {
    console.error('Creative research failed:', error);
    creativeAppend({ at: new Date().toISOString(), kind: 'creative_research', accountId: req.accountId, ok: false, ms: Date.now() - startedAt, paidCalls: 0, usd: 0 });
    const charged = settleResearch(true);
    const alive = !!creativeJobs.get(db, req.accountId, job.id);
    return res.status(200).json({ ok: false, jobId: alive ? job.id : null, understanding, ...creativeCredits(req.accountId, charged), message: 'Could not reach the encyclopedia right now. You can still build the page from your own words and pictures.' + (alive ? '' : ' Your credits were not used.') });
  }
  // a general-topic lookup for a personal subject never turns into a question for the owner
  if (result.status === 'ambiguous' && understanding.kind === 'personal') result = { status: 'skipped', facts: [], images: [], options: [], log: result.log };
  if (result.status === 'ambiguous') understanding.kind = 'ambiguous';
  if (result.page && result.page.category && understanding.kind === 'recognizable') understanding.category = result.page.category;
  const images = (result.images || []).map((i, n) => ({
    id: `r${n + 1}`, origin: 'research', title: i.title, description: i.description, author: i.author, credit: i.credit, license: i.license, licenseUrl: i.licenseUrl,
    pageUrl: i.pageUrl, sourceUrl: i.fileUrl, found: i.found, relevance: i.relevance, width: i.width, height: i.height, mime: i.mime,
    kind: i.kind || '', curation: i.curation || null,
    retrieved: new Date().toISOString().slice(0, 10), dataUrl: `data:${i.mime};base64,${i.bytes.toString('base64')}`,
  }));
  const curation = result.curation ? Object.assign({}, result.curation, curateMeta ? { model: curateMeta.model, ms: curateMeta.ms, usd: curateMeta.usd } : {}) : null;
  // 3. web discovery, when the page needs pictures of its subject and Commons did not cover it well
  // (what the understanding says the page must show decides; with nothing stated, only real or fictional subjects)
  const vMain = understanding.visuals && understanding.visuals.main;
  const needsPictures = understanding.kind !== 'personal' && result.status !== 'ambiguous' && (vMain ? !/^\s*none\b/i.test(vMain) : understanding.kind !== 'invented');
  const covered = curation && curation.source === 'ai' && curation.coverage === 'strong';
  let review = []; let webDiag = null;
  if (needsPictures && !covered) {
    const why = !CREATIVE_AI_LIMITS.webDiscovery ? 'web discovery is switched off (CREATIVE_WEB_DISCOVERY)' : creativeAiUnavailableReason() || (creativeSpendToday().usd >= CREATIVE_AI_LIMITS.dailyUsdCap ? 'the daily Creative AI budget is used up' : '');
    let web = null;
    if (!why) { try { web = await creativeWebDiscovery(Object.assign({}, understanding, { pageTitle: (result.page && result.page.title) || '' }), brief, req.accountId, refine); } catch (error) { web = { images: [], review: [], coverage: 'none', missing: [], log: null, usd: 0, error: String(error && error.message || error).slice(0, 200), searches: 0 }; } }
    const base = images.length;
    (web ? web.images : []).slice(0, Math.max(0, 9 - base)).forEach((v, n) => images.push({
      id: `r${base + n + 1}`, origin: 'research', title: v.title, description: v.why, author: v.permission.author || v.author || '', credit: '', license: v.permission.licence, licenseUrl: v.permission.licenseUrl || '',
      pageUrl: v.pageUrl, sourceUrl: v.imageUrl, found: 'web', relevance: 1, width: v.width, height: v.height, mime: v.mime, kind: '', curation: v.curation, rightsEvidence: v.permission.evidence,
      retrieved: new Date().toISOString().slice(0, 10), dataUrl: `data:${v.mime};base64,${v.bytes.toString('base64')}`,
    }));
    review = web ? web.review : [];
    if (web) { paidUsd += Number(web.usd) || 0; if (web.searches > 0 || web.usd > 0 || (web.diag && web.diag.judged)) paidOk = true; }
    webDiag = web ? web.diag : { ran: false, reason: why };
    const rank = { none: 0, partial: 1, strong: 2 }; const merged = curation || { source: 'rules', coverage: 'none', missing: [] };
    if (web && rank[web.coverage] > (rank[merged.coverage] || 0)) { merged.coverage = web.coverage; merged.missing = web.missing; }
    merged.web = web ? { ran: true, provider: creativeSerpKey() ? 'google-images' : 'web-search', searches: web.searches, pages: web.log ? web.log.pages : 0, found: web.log ? web.log.images : 0, used: web.images.length, review: web.review.length, usd: +web.usd.toFixed(5), ms: web.log ? web.log.ms : 0, error: web.error || '' } : { ran: false, reason: why };
    if (!curation) Object.assign(merged, { reason: merged.reason || 'no Commons picture check' });
    result.curation = merged;
  }
  const curationOut = result.curation && result.curation.web ? result.curation : curation;
  creativeAppend({ at: new Date().toISOString(), kind: 'creative_research', accountId: req.accountId, ok: true, status: result.status, subjectKind: understanding.kind, requests: result.log.requests, bytes: result.log.bytes, ms: Date.now() - startedAt, images: images.length, facts: (result.facts || []).length, paidCalls: 0, usd: 0 });
  const charged = settleResearch(false);
  res.json({ ok: true, jobId: job.id, understanding, understandMeta, research: { status: result.status, page: result.page || null, facts: result.facts || [], options: result.options || [], log: result.log, curation: curationOut, review, diagnostics: needsPictures ? Object.assign({ commons: result.diagnostics || null, web: webDiag }, creativeResearch.pictureStage(result.diagnostics, webDiag)) : null }, images, ...creativeCredits(req.accountId, charged) });
});

// The model directs the page. The browser sends what it has (understanding, the research facts, the
// owner's details, the asset inventory with small thumbnails); the reply is a VALIDATED v2 plan, or
// ok:false with the reason -- the studio then uses the built-in director and labels it as such.
app.post('/api/creative/plan', requireAuth, requireSameOrigin, generationRateLimit, async (req, res) => {
  const b = req.body || {};
  // BILLING PASS: the direction is the 3-credit part of the page's job. Its reservation was made when the page began
  // (a further "try another direction" reserves its own 3). A double click or a retry after a lost response gets the
  // page already directed back, never a second model call; a direction that fails returns its credits.
  const job = creativeJobs.get(db, req.accountId, clean(b.jobId, 60));
  if (!creativeAiAvailable()) {
    // nothing paid runs: the built-in layout builds the page, and nothing still held for it is charged
    if (job && job.status === 'open') { creativeJobs.directionFailed(db, job, creativeJobs.directionOp(job)); if (!job.directions) credits.release(db, `${job.id}:research`); }
    return res.json({ ok: false, fallback: true, reason: creativeAiUnavailableReason(), ...creativeCredits(req.accountId) });
  }
  if (!job) return res.status(402).json({ ok: false, needsJob: true, ...creativeCredits(req.accountId), reason: 'this page has no active job -- start it from its brief', message: `Start the page from its brief to direct it (${CREDIT_COSTS.creativePage} credits).` });
  await prepareCredits(req.accountId);
  const started = creativeJobs.beginDirection(db, req.accountId, job, { another: !!clean(b.avoid, 600) });
  if (started.replay) return res.json(Object.assign({}, started.replay, { replayed: true }, creativeCredits(req.accountId)));
  if (!started.ok && started.reason === 'in_progress') return res.status(409).json({ ok: false, inProgress: true, message: 'This page is already being directed.' });
  if (!started.ok) return res.json({ ok: false, creditsExceeded: true, ...creativeCredits(req.accountId), message: `Another direction costs ${CREDIT_COSTS.creativeDirection} credits. Your balance is ${started.remaining || 0}.` });
  const directionOpId = started.op;
  const spend = creativeSpendToday();
  if ((spend.plansByAccount.get(req.accountId) || 0) >= CREATIVE_AI_LIMITS.accountDailyPlans) { creativeJobs.directionFailed(db, job, directionOpId); return res.json({ ok: false, fallback: true, ...creativeCredits(req.accountId), reason: `this account has used today's ${CREATIVE_AI_LIMITS.accountDailyPlans} AI directions -- your credits were not used` }); }
  const releaseBudget = creativeBudgetTake(creativeBoundUsd('direction'));
  if (!releaseBudget) { creativeJobs.directionFailed(db, job, directionOpId); return res.json({ ok: false, fallback: true, providerBudget: true, ...creativeCredits(req.accountId), reason: CREATIVE_BUDGET_MSG }); }
  res.once('close', releaseBudget); res.once('finish', releaseBudget);
  const arr = (v, n) => (Array.isArray(v) ? v.slice(0, n) : []);
  const assets = arr(b.assets, 24).filter(a => a && typeof a.id === 'string').map(a => require('./lib/creative/store').cleanAsset(Object.assign({}, a, { dataUrl: undefined, assetRef: a.assetRef || '0'.repeat(64) }))).filter(Boolean);
  const facts = arr(b.facts, 40).filter(f => f && f.id && f.text).map(f => ({ id: clean(f.id, 20), text: clean(f.text, 600), section: clean(f.section, 80) }));
  const u = b.understanding && typeof b.understanding === 'object' ? b.understanding : {};
  const input = {
    brief: clean(b.brief, 1200), understanding: u, understandingLegacy: { kind: clean(u.kind, 20), subject: clean(u.subject, 120) },
    page: b.page && typeof b.page === 'object' ? { title: clean(b.page.title, 200), description: clean(b.page.description, 300), url: clean(b.page.url, 400) } : null,
    facts, supplied: { facts: arr(b.supplied && b.supplied.facts, 12).map(x => clean(x, 300)), memories: arr(b.supplied && b.supplied.memories, 8).map(x => clean(x, 300)) },
    assets, thumbnails: arr(b.thumbnails, CREATIVE_AI_LIMITS.thumbnails).filter(t => t && typeof t.id === 'string' && typeof t.dataUrl === 'string'), maxThumbs: CREATIVE_AI_LIMITS.thumbnails,
    avoid: clean(b.avoid, 600), seed: clean(b.seed, 40),
    // the owner's choices: a main picture (it must lead), or an explicit abstract interpretation
    mainAsset: typeof b.mainAsset === 'string' && assets.some(a => a.id === b.mainAsset) ? b.mainAsset : null, abstractChosen: !!b.abstractChosen,
    // the main picture's own colours (measured in the browser): the palette is built from them
    pictureColours: b.pictureColours && typeof b.pictureColours === 'object' ? { background: /^#[0-9a-f]{6}$/i.test(b.pictureColours.background || '') ? b.pictureColours.background : '', plainBackground: !!b.pictureColours.plainBackground, colours: arr(b.pictureColours.colours, 6).filter(x => /^#[0-9a-f]{6}$/i.test(x || '')) } : null,
    // what the picture check found (coverage of the subject, the pictures that could not be found)
    coverage: b.coverage && typeof b.coverage === 'object' ? { coverage: ['strong', 'partial', 'none'].includes(b.coverage.coverage) ? b.coverage.coverage : '', missing: arr(b.coverage.missing, 3).map(x => clean(x, 160)).filter(Boolean), note: clean(b.coverage.note, 240) } : null,
  };
  const startedAt = Date.now();
  let r;
  try {
    r = await creativeAi.direct(input, {
      limits: CREATIVE_AI_LIMITS, call: creativeModelCall,
      budgetCheck: () => (creativeSpendToday().usd >= CREATIVE_AI_LIMITS.dailyUsdCap ? { ok: false, reason: 'the daily Creative AI budget ran out during this direction' } : { ok: true }),
      onUsage: x => {
        // the claim check (cheap model) is its own row: it costs, but is not a direction
        if (x.step === 'claims') return creativeLedger({ kind: 'creative_claims', accountId: req.accountId, ok: true, attempt: x.attempt, model: x.model, inputTokens: x.usage.input_tokens || 0, outputTokens: x.usage.output_tokens || 0, ms: x.ms, usd: x.usd, estimated: true });
        const s = creativeSpendToday(); s.plansByAccount.set(req.accountId, (s.plansByAccount.get(req.accountId) || 0) + 1);
        creativeLedger({ kind: 'creative_direct', accountId: req.accountId, ok: true, attempt: x.attempt, model: x.model, inputTokens: x.usage.input_tokens || 0, outputTokens: x.usage.output_tokens || 0, cacheReadTokens: x.usage.cache_read_input_tokens || 0, cacheWriteTokens: x.usage.cache_creation_input_tokens || 0, ms: x.ms, usd: x.usd, estimated: true, thumbnails: input.thumbnails.length, anotherDirection: !!input.avoid });
      },
    });
  } catch (error) {
    console.error('Creative direction failed:', error);
    creativeLedger({ kind: 'creative_direct', accountId: req.accountId, ok: false, error: String(error && error.message || error).slice(0, 200), usd: 0 });
    releaseBudget(); creativeJobs.directionFailed(db, job, directionOpId);
    return res.json({ ok: false, fallback: true, ...creativeCredits(req.accountId), reason: 'the AI direction failed unexpectedly -- your credits for it were not used' });
  }
  releaseBudget();
  const usd = +(r.attempts || []).reduce((t, a) => t + (a.usd || 0), 0).toFixed(5);
  const meta = { attempts: (r.attempts || []).map(a => ({ attempt: a.attempt, ms: a.ms, usd: a.usd, model: a.model, inputTokens: a.usage && a.usage.input_tokens, outputTokens: a.usage && a.usage.output_tokens, errors: a.errors, error: a.error, claims: a.claims })), usdEstimated: usd, ms: Date.now() - startedAt };
  if (!r.ok) {
    creativeLedger({ kind: 'creative_direct_fallback', accountId: req.accountId, ok: false, reason: String(r.reason).slice(0, 300), usd: 0 });
    creativeJobs.directionFailed(db, job, directionOpId, { providerUsd: usd });
    return res.json({ ok: false, fallback: true, reason: r.reason, meta, ...creativeCredits(req.accountId) });
  }
  const directed = { ok: true, jobId: job.id, plan: r.plan, fixes: r.fixes, warnings: r.warnings, meta };
  creativeJobs.directionDone(db, job, directionOpId, directed, { providerUsd: usd });
  res.json(Object.assign({}, directed, creativeCredits(req.accountId, CREDIT_COSTS.creativeDirection)));
});

// V9 (Phase 9): "Redesign my existing website" -- step 1 of 2. Fetches ONE
// public page the signed-in account points at and returns structured
// reference material (business name, services/headings, contact info,
// colors, logo, images, CTAs, testimonials -- see lib/site-import.js for
// the full shape and its SSRF-safety comment). This route NEVER creates a
// project, NEVER calls Claude, and charges NO credit -- it is read-only
// research the browser shows the person to review/edit. Step 2 is
// unchanged: the browser folds whatever the person keeps into the SAME
// `text` description + `extractedFacts` fields POST /api/plan-website
// already accepts, so a redesign runs through the exact same planner ->
// client compiler -> POST /api/projects pipeline as a from-scratch site
// (this ticket's explicit "do not bypass the existing generation system").
// Only when the resulting project is actually created does the browser
// also send `source: {type:'redesign', url, metadata}` to POST
// /api/projects, which is where provenance is recorded (lib/project-store.js
// createProject) -- this route itself writes nothing to any project.
//
// Rate-limited the same as generation (a server-side outbound fetch,
// however SSRF-guarded, is still a real abuse surface -- a flood of
// extraction requests is a flood of outbound requests this server makes on
// an attacker's behalf) and gated behind the same requireAuth as
// /api/plan-website's own full-generation path.
app.post('/api/redesign/extract', requireAuth, generationRateLimit, async (req, res) => {
  const url = clean(req.body && req.body.url, 2000);
  if (!url) return res.status(400).json({ ok: false, message: 'Enter your current website address.' });
  const result = await siteImport.runRedesignExtraction(url);
  if (!result.ok) {
    // Every failure reason is either a validation problem (bad url, non-
    // http(s) scheme) or an honest "couldn't fetch/read that" -- never a
    // 5xx that would look like SiteRemade itself is broken, and never a
    // detail that would help someone probe internal network layout (the
    // message is the same generic "can't be fetched" for every SSRF-
    // blocked reason -- see lib/site-import.js's own reason codes, which
    // stay server-side/log-only).
    return res.status(200).json({ ok: false, code: result.reason || 'fetch_failed', message: result.message || 'Couldn’t read that website. Check the address and try again.' });
  }
  return res.json({ ok: true, extracted: result.extracted });
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

    // BILLING PASS: one open checkout per website. An earlier checkout for it is closed at Stripe first; if Stripe
    // will not close it (it has just been paid), no second checkout is started -- one website is never paid twice.
    if (owned.status === 'purchased') return res.status(409).json({ ok: false, message: 'This project has already been purchased.' });
    for (const open of purchase.listPendingIntentsForProject(db, req.accountId, projectId)) {
      if (open.stripeSessionId && STRIPE_SECRET_KEY) {
        try { await stripeRequest(`checkout/sessions/${encodeURIComponent(open.stripeSessionId)}/expire`, {}); }
        catch (e) { return res.status(409).json({ ok: false, pendingPayment: true, message: 'A payment for this website is still being confirmed. Refresh in a minute before trying again.' }); }
      }
      purchase.cancelIntent(db, req.accountId, open.id);
    }
    const testerPurchase = isFreePurchaseTester(req.accountEmail);
    const intentResult = purchase.createPurchaseIntent(db, { ownerId: req.accountId, projectId, amount: testerPurchase ? 0 : SITEREMADE_WEBSITE_PRICE_CENTS, currency: SITEREMADE_WEBSITE_PRICE_CURRENCY });
    if (!intentResult.ok) {
      if (intentResult.reason === 'already_purchased') return res.status(409).json({ ok: false, message: 'This project has already been purchased.' });
      return res.status(404).json({ ok: false, message: 'Project not found.' });
    }
    const intentId = intentResult.intent.id;

    // Configured tester accounts can exercise the exact production handoff
    // without charging a card. This goes through the same purchase intent,
    // immutable snapshot, export and My Websites path as a paid order; only
    // the Stripe payment step is skipped.
    if (testerPurchase) {
      const fulfillment = purchase.fulfillTesterIntent(db, req.accountId, intentId);
      if (!fulfillment.ok) return res.status(500).json({ ok: false, message: 'Could not complete the tester purchase.' });
      if (!fulfillment.alreadyFulfilled && fulfillment.ownerEmail) {
        const origin = `${req.protocol}://${req.get('host')}`;
        sendPurchaseConfirmationEmail({
          to: fulfillment.ownerEmail, projectName: fulfillment.projectName,
          myWebsitesUrl: purchaseMyWebsitesUrl(),
        }).catch(error => console.error('Tester purchase confirmation email failed to send:', error));
      }
      return res.json({ ok: true, testerPurchase: true, fulfilled: true, intentId, projectId: fulfillment.projectId });
    }

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
          currency: SITEREMADE_WEBSITE_PRICE_CURRENCY,
          unit_amount: SITEREMADE_WEBSITE_PRICE_CENTS,
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
        revision: String(intentResult.intent.revision),
        mode: owned.mode === 'creative' ? 'creative' : 'business',
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
    if ((event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') && session && session.id) {
      // unlocked only for what the signed event itself says was paid, in the agreed amount and currency
      const fulfillment = purchase.fulfillBySessionId(db, session.id, { status: session.payment_status, amountTotal: session.amount_total, currency: session.currency });
      if (!fulfillment.ok && fulfillment.reason !== 'not_paid') console.error('Website purchase not fulfilled:', fulfillment.reason, session.id);
      if (fulfillment.ok && fulfillment.duplicatePayment) console.error('Website paid twice (refund the second payment):', session.id, fulfillment.projectId);
      // Only on a FIRST-TIME fulfillment (never on Stripe's own documented
      // at-least-once redelivery of the same event) -- an
      // already-fulfilled intent must never re-send this email.
      if (fulfillment.ok && !fulfillment.alreadyFulfilled && fulfillment.ownerEmail) {
        const origin = `${req.protocol}://${req.get('host')}`;
        sendPurchaseConfirmationEmail({
          to: fulfillment.ownerEmail, projectName: fulfillment.projectName,
          myWebsitesUrl: purchaseMyWebsitesUrl(),
        }).catch(error => console.error('Purchase confirmation email failed to send:', error));
      }
    } else if ((event.type === 'checkout.session.expired') && session && session.id) {
      purchase.markIntentTerminal(db, session.id, 'cancelled');
    } else if (event.type === 'checkout.session.async_payment_failed' && session && session.id) {
      purchase.markIntentTerminal(db, session.id, 'failed');
    }
    // Any other event type is acknowledged (200) without action -- Stripe
    // retries on non-2xx, and this app only cares about the two above.
    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error('Webhook fulfillment failed:', error);
    return res.status(500).json({ ok: false, message: 'Fulfillment failed.' });
  }
});

// ---- PREMIUM_GENERATION_V1: whole-site review + ONE surgical repair round ------------------------------
// Called once by the client after the first render. Server-side so the same review/repair core (and the same
// budget governor and USD ledger) serves the generator and the Workplace updater. Repair images are paid by the
// platform (accountId:null: no customer credits), bounded by HARD_SITE_BUDGET_USD; nothing about cost is returned
// to the customer.
async function anthropicSmallCall({ model, system, user, tool, maxTokens, taskType, projectId, generationId, phase, images, timeoutMs }) {
  const startedAt = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs || 25000);
  try {
    // optional vision: small JPEG/PNG/WebP thumbnails of the primary generated images so the critic can judge them, not just their prompts
    const content = (Array.isArray(images) && images.length) ? images.map(im => ({ type: 'image', source: { type: 'base64', media_type: im.mediaType, data: im.data } })).concat([{ type: 'text', text: user }]) : user;
    const body = { model, max_tokens: maxTokens || 700, thinking: { type: 'disabled' }, system, messages: [{ role: 'user', content }] };
    if (tool) { body.tools = [tool]; body.tool_choice = { type: 'tool', name: tool.name }; }
    const response = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' }, body: JSON.stringify(body), signal: controller.signal });
    const data = await response.json().catch(() => ({}));
    const usage = data.usage || {};
    recordOperation({ operationType: taskType, provider: 'anthropic', model, ok: response.ok, inputTokens: usage.input_tokens, outputTokens: usage.output_tokens, cacheReadTokens: usage.cache_read_input_tokens, cacheWriteTokens: usage.cache_creation_input_tokens, latencyMs: Date.now() - startedAt, projectId, generationId, phase });
    if (!response.ok) throw new Error((data.error && data.error.message) || `Anthropic returned ${response.status}`);
    const toolUse = (data.content || []).find(b => b.type === 'tool_use');
    const text = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('').trim();
    return { input: toolUse && toolUse.input, text, usage: { inputTokens: usage.input_tokens || 0, outputTokens: usage.output_tokens || 0, cacheReadTokens: usage.cache_read_input_tokens || 0, cacheWriteTokens: usage.cache_creation_input_tokens || 0 } };
  } finally { clearTimeout(timer); }
}
function premiumCurrentCopy(direction, targetId, field) {
  if (targetId === 'hero') return (direction.copy && direction.copy[field === 'body' ? 'sub' : field]) || '';
  for (const p of (direction.pages || [])) for (const s of (p.sections || [])) if (s && s.id === targetId) return (s.copy && s.copy[field]) || '';
  return '';
}
app.post('/api/premium/review-repair', requireAuth, generationRateLimit, async (req, res) => {
  if (!premiumCore.cfg.enabled) return res.status(404).json({ ok: false });
  const generationId = clean(req.body.generationId, 60);
  if (!/^gen_[a-z0-9]{6,40}$/.test(generationId)) return res.status(400).json({ ok: false, message: 'Invalid generation.' });
  // BILLING PASS: the quality review and its bounded automatic repairs (model critique, copy rewrites, at most the
  // governor's image replacements) are part of the Business generation the owner already paid for -- so they run only
  // for a generation this account was charged for, and only once. Any other id (guessed, replayed, never generated)
  // is refused before any model call.
  const genOp = credits.findOperation(db, opIdFromKey('gen', req.accountId, generationId));
  if (!genOp || genOp.account_id !== req.accountId || genOp.status !== 'committed') return res.status(200).json({ ok: false, message: 'Quality review was skipped.' });
  try { db.ledger.insertOp({ opId: opIdFromKey('review', req.accountId, generationId), accountId: req.accountId, kind: 'review_repair', amount: 0, status: 'committed', jobId: genOp.op_id, expiresAt: new Date().toISOString(), createdAt: new Date().toISOString() }); }
  catch (e) { return res.status(200).json({ ok: false, message: 'Quality review already ran for this generation.' }); }
  const direction = req.body.direction;
  if (!direction || typeof direction !== 'object' || !Array.isArray(direction.pages)) return res.status(400).json({ ok: false, message: 'Missing site.' });
  const description = clean(req.body.description, 1500);
  const facts = (req.body.facts && typeof req.body.facts === 'object') ? { years: !!req.body.facts.years, rating: !!req.body.facts.rating, count: !!req.body.facts.count } : {};
  const projectId = clean(req.body.projectId, 60);
  const visionImages = (Array.isArray(req.body.vision) ? req.body.vision : []).slice(0, 2).filter(v => v && /^image\/(jpeg|png|webp)$/.test(v.mediaType) && typeof v.data === 'string' && /^[A-Za-z0-9+/=]+$/.test(v.data) && v.data.length <= 260000).map(v => ({ slot: clean(v.slot, 60), mediaType: v.mediaType, data: v.data }));
  const session = premiumSession(generationId, { categoryKey: clean(req.body.categoryKey, 30), archetype: clean(req.body.archetype, 40), description, palette: (direction.design && direction.design.palette) || {}, facts, projectId });
  const cheapModel = premiumCore.cfg.models.cheap, strongModel = premiumCore.cfg.models.strong;
  const deps = {
    selfRecorded: true,
    critic: ANTHROPIC_API_KEY ? async ({ system, user, tool }) => anthropicSmallCall({ model: strongModel, system, user, tool, maxTokens: 900, taskType: 'QUALITY_REPAIR', projectId, generationId, phase: 'first_draft' }) : undefined,
    semanticCritic: (premiumCore.cfg.groundingV3 && ANTHROPIC_API_KEY) ? async ({ system, user, tool, images }) => anthropicSmallCall({ model: strongModel, system, user, tool, images, maxTokens: 3200, timeoutMs: 60000, taskType: 'SEMANTIC_CRITIQUE', projectId, generationId, phase: 'first_draft' }) : undefined,
    visualBrief: (premiumCore.cfg.visualsV4 && ANTHROPIC_API_KEY) ? async ({ system, user, tool }) => anthropicSmallCall({ model: strongModel, system, user, tool, maxTokens: 300, taskType: 'VISUAL_BRIEF', projectId, generationId, phase: 'first_draft' }) : undefined,
    // never for a Business direction (lib/premium/visual-mode.js; the review library enforces the same rule itself)
    regenerateImage: (activeImageProvider.configured() && visualMode.allowsGeneratedImages(direction)) ? async spec => generateImageWithCredits({ direction, accountId: null, prompt: spec.prompt, model: spec.model, quality: spec.quality, aspectRatio: spec.aspectRatio, reservationKey: projectId || generationId, taskType: 'QUALITY_REPAIR', projectId, anonId: null, generationId, premiumTier: 'primary', phase: 'repair' }) : undefined,
    rewriteCopy: ANTHROPIC_API_KEY ? async ({ targetId, field, maxChars, removeClaim, direction: cur }) => {
      const current = premiumCurrentCopy(cur, targetId, field);
      const limit = Math.min(Number(maxChars) || 200, 400);
      const user = `Rewrite this ${field} from a small-business website. The customer's own description is the ONLY source of facts: "${description}". Current text: "${current}". Rules: keep the meaning; at most ${limit} characters; specific and plain; no generic marketing filler; do NOT add any fact (years, ratings, counts, certifications, awards, guarantees) that is not in the description${removeClaim ? `; remove this unsupported claim: "${removeClaim}"` : ''}. Return only the rewritten text.`;
      const out = await anthropicSmallCall({ model: cheapModel, system: 'You rewrite website copy for small businesses. Never invent facts.', user, maxTokens: 220, taskType: 'COPY_REWRITE', projectId, generationId, phase: 'repair' });
      let text = String(out.text || '').replace(/^["'\u201c\u201d]+|["'\u201c\u201d]+$/g, '').trim();
      const bad = premiumLib.review.CLAIM_PATTERNS.concat(premiumLib.review.GENERIC_PHRASES).some(re => re.test(text) && !new RegExp(re.source, 'i').test(description));
      if (!text || text.length > limit * 1.25 || bad) return { ok: false, usage: out.usage };
      return { ok: true, text, usage: out.usage };
    } : undefined,
  };
  try {
    const out = await session.reviewAndRepair(direction, { description, facts, strategy: session.strategy, premiumEnabled: true, visionImages, compositionV2: premiumCore.cfg.compositionV2 }, deps);
    const d = out.direction;
    const idsOf = dir => new Set((dir.pages || []).flatMap(p => (p.sections || []).map(s => s && s.id)));
    const beforeIds = idsOf(direction), afterIds = idsOf(d);
    const semRemoved = [...beforeIds].filter(id => !afterIds.has(id)), semAdded = [...afterIds].filter(id => !beforeIds.has(id));
    const patch = {
      pages: (d.pages || []).map(p => ({ id: p.id || p.slug, label: p.label, purpose: p.purpose === undefined ? null : p.purpose })),
      archetype: (d.strategy && d.strategy.archetype) || null,
      starter: (d.design && d.design.premium && d.design.premium.vs) ? 1 : 0,
      visualBrief: out.visualBrief || null,
      removedPages: (direction.pages || []).map(p => p.id || p.slug).filter(id => !(d.pages || []).some(p => (p.id || p.slug) === id)),
      copy: d.copy || null,
      sections: (d.pages || []).flatMap(p => (p.sections || []).map(s => ({ pageId: p.id || p.slug, id: s.id, type: s.type, variant: s.variant, imageDisplayVariant: s.imageDisplayVariant || null, mediaComposition: s.mediaComposition || null, surfaceTexture: s.surfaceTexture || null, stickyMode: s.stickyMode || null, copy: s.copy || null }))),
      addedSections: [...new Set(out.actions.filter(a => a.sectionId).map(a => a.sectionId).concat(semAdded))],
      removedSections: [...new Set(out.actions.filter(a => a.kind === 'remove_section').flatMap(a => a.targetIds || [a.targetId]).concat(semRemoved))],
      imagePlan: (d.imagePlan || []).map(e => ({ slot: e.slot, sourceType: e.sourceType, focal: e.focal || null, fallbackReason: e.fallbackReason || null })),
      generated: Object.fromEntries(out.actions.filter(a => a.kind === 'regenerate_image').map(a => a.slot).concat((out.semantic && out.semantic.regenerated) || []).filter(slot => d.assets && d.assets.generated && d.assets.generated[slot] && d.assets.generated[slot].dataUrl).map(slot => [slot, { status: 'ready', dataUrl: d.assets.generated[slot].dataUrl }])),
      premiumTokens: (d.design && d.design.premiumTokens) || null,
      dimensions: (d.design && d.design.dimensions) || null,
      premium: d.premium || null,
    };
    const log = session.finish();
    return res.json({ ok: true, generationId, acceptance: out.acceptance || null, repaired: out.repaired || !!(out.semantic && out.semantic.changes.length), before: out.before, after: out.after, semantic: out.semantic ? { changes: out.semantic.changes, log: out.semantic.log, before: out.semantic.before, after: out.semantic.after } : null, actions: out.actions.map(a => ({ kind: a.kind, defectCode: a.defectCode, target: a.target || null, downgradedFrom: a.downgradedFrom || null })), skipped: out.skipped, patch, timingsMs: log.timingsMs });
  } catch (error) {
    console.error('Premium review/repair failed:', error);
    return res.status(200).json({ ok: false, message: 'Quality review was skipped.' });
  }
});
// Client tells us the customer bought/kept the site so acceptance metrics are real, not guessed.
app.post('/api/premium/accepted', requireAuth, (req, res) => {
  const id = clean(req.body.generationId, 60);
  return res.json({ ok: true, recorded: /^gen_[a-z0-9]{6,40}$/.test(id) ? premiumCore.metrics.markAccepted(id) : false });
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
app.post('/api/auth/signup', requireSameOrigin, signupRateLimit, (req, res) => {
  const result = authProvider.signUp(db, req.body && req.body.email, req.body && req.body.password);
  if (!result.ok) return res.status(400).json({ ok: false, message: result.error });
  const { token } = authProvider.createSession(db, result.account.id);
  res.setHeader('Set-Cookie', authProvider.sessionCookieHeader(token, { secure: cookieShouldBeSecure(req) }));
  return res.json({ ok: true, account: result.account });
});
// Login brute-force hardening (spec item 5): a per-normalized-email FAILURE
// counter, checked BEFORE the real auth attempt and only ever incremented
// AFTER a real failed attempt -- never on success, and never by the check
// itself (see lib/rate-limit.js's peek()/recordFailure() split, and its
// header comment for why a legitimate user's own successful retry must
// never nudge this counter). This is layered on top of, not instead of,
// signinRateLimit's plain per-IP request-rate ceiling just below -- the
// email-keyed counter survives a rotating IP; the IP-keyed one survives a
// rotating email. The response shape is IDENTICAL in every failure case
// (bad password, unknown email, AND rate-limited) -- 401 with the same
// generic "Invalid email or password."-style message from authProvider, or
// this route's own equally generic 429 message -- so this never leaks
// anything about account existence beyond what authProvider.signIn's own
// pre-existing constant-shape response already did (spec item 5: "don't
// leak whether email exists more than current UX already does").
app.post('/api/auth/signin', requireSameOrigin, signinRateLimit, (req, res) => {
  const email = req.body && req.body.email;
  const emailKey = `signin-fail:${normalizeEmail(email)}`;
  const failures = rateLimit.peek(emailKey, RATE_LIMITS.signinFailurePerEmail.windowMs);
  if (failures.count >= RATE_LIMITS.signinFailurePerEmail.max) {
    res.setHeader('Retry-After', String(failures.retryAfterSeconds));
    return res.status(429).json({ ok: false, message: 'Too many failed sign-in attempts. Please try again later.', retryAfterSeconds: failures.retryAfterSeconds });
  }
  const result = authProvider.signIn(db, email, req.body && req.body.password);
  if (!result.ok) {
    rateLimit.recordFailure(emailKey, RATE_LIMITS.signinFailurePerEmail.windowMs);
    return res.status(401).json({ ok: false, message: result.error });
  }
  const { token } = authProvider.createSession(db, result.account.id);
  res.setHeader('Set-Cookie', authProvider.sessionCookieHeader(token, { secure: cookieShouldBeSecure(req) }));
  return res.json({ ok: true, account: result.account });
});
app.post('/api/auth/signout', requireSameOrigin, (req, res) => {
  const cookies = authProvider.parseCookies(req.headers.cookie);
  const token = cookies[authProvider.SESSION_COOKIE];
  if (token) authProvider.destroySession(db, token);
  res.setHeader('Set-Cookie', authProvider.sessionCookieHeader(null, { clear: true, secure: cookieShouldBeSecure(req) }));
  return res.json({ ok: true });
});
app.get('/api/auth/me', withOptionalAuth, (req, res) => {
  if (!req.accountId) return res.json({ authenticated: false });
  // UNIFIED ACCOUNT pass: surfaces app_subscription_status (see
  // migrations/0004_app_subscription_status.sql) so the client CAN read it
  // once something real populates it -- today it is always null for every
  // account, since nothing in this codebase writes it yet. A second lookup
  // (not the session-resolution JOIN every authenticated request already
  // runs) because this is the one low-frequency route that actually needs
  // it, not a hot path.
  const record = authProvider.findAccountById(db, req.accountId);
  return res.json({ authenticated: true, account: { id: req.accountId, email: req.accountEmail, appSubscriptionStatus: (record && record.app_subscription_status) || null } });
});

// V14 (shared identity bridge pass) -- three routes, all fail closed (404)
// while the feature flag is 'disabled' (the default), matching this file's
// existing /api/admin/operation-ledger precedent for a real, enforced,
// invisible-until-turned-on gate. None of these three routes touch
// `accounts`/`projects`/`credit_ledger`/`purchase_intents` or any other
// pre-existing table -- only the two new identity_links*/identity_link_events
// tables (migrations/0005_identity_links.sql) and, for the session-exchange
// route, the EXACT SAME session-minting path signup/signin already use
// (authProvider.createSession + sessionCookieHeader) -- no second session
// mechanism, no new cookie.
//
// GET /api/identity/status -- requireAuth. {linked} only, no raw ids (spec
// item 25). Lets the frontend decide whether to show an "Upgrade to your
// unified SiteRemade account" affordance without exposing implementation
// terms.
app.get('/api/identity/status', requireAuth, (req, res) => {
  if (!identityBridgeEnabled()) return res.json({ ok: true, bridgeEnabled: false, linked: false });
  return res.json({ ok: true, bridgeEnabled: true, ...identityLinks.getLinkStatusForAccount(db, req.accountId) });
});

// POST /api/identity/supabase/session -- NOT requireAuth (a visitor may not
// have a generator session yet -- this IS how an app-only Supabase user
// gets one). requireSameOrigin because it's state-changing (can create an
// account) and mints a session cookie, same discipline as signup/signin.
// Body: { supabaseAccessToken }. The token is used for exactly one thing
// -- one verification call to lib/supabase-identity.js -- and is never
// stored anywhere (not in a cookie, not in a database column, not logged).
//
// Resolves to one of:
//  - an EXISTING link -> mint a normal generator session for that account
//    (population: a returning, already-linked user -- either originally
//    linked via this same lazy-provision path, or via the explicit
//    dual-proof /api/identity/link route below).
//  - NO link, NO colliding generator account by email -> lazily provision a
//    brand-new generator account + link, then mint a session for it
//    (population B/I: an app-only Supabase user with nothing to conflict
//    with -- see lib/identity-links.js's own header for why this does NOT
//    need dual-session proof).
//  - NO link, but a generator account with this email ALREADY exists ->
//    refuse (409) rather than auto-merge (spec item 6: "same email must
//    not auto-merge") -- the response tells the visitor to sign into that
//    existing generator account and link it from there instead (routes to
//    /api/identity/link, which DOES require dual-session proof).
app.post('/api/identity/supabase/session', requireSameOrigin, identityRateLimit, async (req, res) => {
  if (!identityBridgeEnabled()) return res.status(404).json({ ok: false });
  const token = req.body && req.body.supabaseAccessToken;
  const verified = await supabaseIdentity.verifyAccessToken(token);
  if (!verified.ok) return res.status(401).json({ ok: false, message: 'Could not verify your SiteRemade account session.' });
  if (!identityBridgeAllowedForEmail(verified.email)) return res.status(404).json({ ok: false });

  const existingAccountId = identityLinks.resolveGeneratorAccountForSupabaseUser(db, verified.userId);
  let accountId = existingAccountId;
  let created = false;
  if (!accountId) {
    const provisioned = identityLinks.lazyProvisionGeneratorAccount(db, { supabaseUserId: verified.userId, email: verified.email });
    if (!provisioned.ok) {
      return res.status(409).json({
        ok: false, reason: provisioned.reason,
        message: 'An existing generator account already uses this email address. Sign in to that account, then link it from there.',
      });
    }
    accountId = provisioned.accountId;
    created = provisioned.created;
  }
  const account = authProvider.findAccountById(db, accountId);
  const { token: sessionToken } = authProvider.createSession(db, accountId);
  res.setHeader('Set-Cookie', authProvider.sessionCookieHeader(sessionToken, { secure: cookieShouldBeSecure(req) }));
  return res.json({ ok: true, account, created });
});

// POST /api/identity/link -- requireAuth (a real generator session is the
// FIRST of the two required proofs) + requireSameOrigin. Body:
// { supabaseAccessToken } (the SECOND required proof -- verified
// server-side here, never trusted from a client-asserted user id, matching
// spec item 21's "no unsigned client-side linking" / "no `POST email1 +
// email2`"). This is the ONLY route that links two PRE-EXISTING accounts
// together (population C/D) -- see lib/identity-links.js's createLink for
// the transactional conflict handling (already-linked-elsewhere on either
// side is refused, never silently overwritten; a retry of the identical
// link is idempotent).
app.post('/api/identity/link', requireAuth, requireSameOrigin, identityRateLimit, async (req, res) => {
  if (!identityBridgeEnabled()) return res.status(404).json({ ok: false });
  if (!identityBridgeAllowedForEmail(req.accountEmail)) return res.status(404).json({ ok: false });
  const token = req.body && req.body.supabaseAccessToken;
  const verified = await supabaseIdentity.verifyAccessToken(token);
  if (!verified.ok) return res.status(401).json({ ok: false, message: 'Could not verify your SiteRemade account session.' });

  const result = identityLinks.createLink(db, { generatorAccountId: req.accountId, supabaseUserId: verified.userId });
  if (!result.ok) {
    return res.status(409).json({
      ok: false, reason: result.reason,
      message: result.reason === 'account_already_linked'
        ? 'This generator account is already linked to a different SiteRemade account.'
        : 'That SiteRemade account is already linked to a different generator account.',
    });
  }
  return res.json({ ok: true, linked: true, alreadyLinked: !!result.alreadyLinked });
});

// V15 (Phase 2: unified login + linking UX) -- two small additions to the
// V14 identity-bridge API surface, neither of which changes V14's own
// security model at all:
//
// GET /api/identity/public-status -- UNAUTHENTICATED, on purpose. A
// signed-out visitor (looking at the pre-generation auth gate, or the
// signed-out account panel) needs to know whether to show "Continue with
// SiteRemade" at all -- V14's own /api/identity/status requires
// requireAuth, which a signed-out visitor by definition doesn't have. This
// mirrors the exact existing pattern of /api/planner-status /
// /api/image-provider-status / /api/generation-status: a public read of
// "is this feature configured," never anything account-specific. It
// intentionally does NOT reveal internal-mode's allowlist or membership in
// it -- a non-allowlisted visitor sees bridgeEnabled:true exactly like an
// allowlisted one (matching the same "internal mode fails closed
// identically to disabled, never leaking who's on the list" posture the
// three action routes already have) and only discovers they're not
// eligible if they actually attempt the flow, at which point they get the
// same generic, friendly "couldn't connect right now" the frontend already
// shows for a 404 (see script.js's identity-bridge error-copy table).
app.get('/api/identity/public-status', (req, res) => {
  res.json({ ok: true, bridgeEnabled: identityBridgeEnabled() });
});

// POST /api/identity/preview -- requireAuth + requireSameOrigin +
// identityRateLimit, same gates as /api/identity/link, but performs NO
// database write and creates NO identity_link_events row -- a pure read
// that answers "if I clicked confirm right now, which SiteRemade account
// would this connect to?" so the frontend can show a real confirmation
// screen (spec: "show enough account information to let the user
// understand which accounts are being connected... require explicit
// confirmation") BEFORE calling the real, mutating /api/identity/link.
// Verifying the same token twice (once here, once again when the person
// actually confirms) is safe and cheap -- Supabase's own
// GET /auth/v1/user is a read, not a one-time-use exchange, so calling it
// twice for the same still-valid token is no different from a person
// reloading a page. This never returns account IDs, generator account
// IDs, or any identity_links row -- only the two email addresses already
// known to the person (their own generator account's, from their existing
// session, and the Supabase account's, from the token they just proved
// they hold) plus whether that Supabase identity is already linked
// elsewhere, so the confirm screen can show a real conflict warning before
// the person even clicks confirm rather than only after.
app.post('/api/identity/preview', requireAuth, requireSameOrigin, identityRateLimit, async (req, res) => {
  if (!identityBridgeEnabled()) return res.status(404).json({ ok: false });
  if (!identityBridgeAllowedForEmail(req.accountEmail)) return res.status(404).json({ ok: false });
  const token = req.body && req.body.supabaseAccessToken;
  const verified = await supabaseIdentity.verifyAccessToken(token);
  if (!verified.ok) return res.status(401).json({ ok: false, message: 'Could not verify your SiteRemade account session.' });
  const alreadyLinkedElsewhere = !!identityLinks.resolveGeneratorAccountForSupabaseUser(db, verified.userId)
    && identityLinks.resolveGeneratorAccountForSupabaseUser(db, verified.userId) !== req.accountId;
  return res.json({
    ok: true,
    generatorEmail: req.accountEmail,
    sharedEmail: verified.email,
    alreadyLinkedElsewhere,
  });
});
// Product-flow pass: a signed-in account's real, durable credit balance --
// what the account page / generation UI reads to show "X credits left
// today," separate from claudeDirectionsRemaining (the lifetime-3 cap,
// still surfaced by /api/generation-status and /api/plan-website's own
// responses).
app.get('/api/credits', requireAuth, async (req, res) => {
  await prepareCredits(req.accountId);
  res.json({ ok: true, credits: creditsSummaryFor(req.accountId) });
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
    // Phase 9: optional provenance for a project created from "Redesign my
    // existing website" (see /api/redesign/extract below). createProject's
    // own validateSourceInput re-validates this from scratch (type must be
    // exactly 'redesign', url must be a real http(s) url) -- nothing here
    // trusts the body's shape, and a from-scratch project (no `source`, the
    // overwhelming majority of calls) is completely unaffected.
    source: req.body && req.body.source,
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

// ============================================================================
// App bridge pass (Phase 4): /api/app-bridge/* -- the smallest safe
// server-to-server contract for the SiteRemade customer app
// ============================================================================
// Four routes, nothing else: read the canonical website summary, read its
// deployment/domain state, apply a plain-language edit as a new DRAFT
// revision, and publish a revision -- plus, since Phase 6, a read-only list
// of the account's purchased projects (1b, metadata only). All of them:
//   - 404 {ok:false} unless SITEREMADE_APP_BRIDGE_ENABLED === 'true';
//   - are per-IP rate limited BEFORE token verification (appBridgeRateLimit);
//   - re-verify the caller's Supabase access token and re-resolve its
//     identity_links row on EVERY request (requireAppBridgeAuth -- no
//     session, no cookie, nothing cached);
//   - scope every read/write to req.accountId through the SAME
//     ownership-scoped store functions the cookie-authenticated routes use
//     (a project id from the URL only ever says WHICH record to act on --
//     a missing and a not-owned project are the same 404);
//   - never expose the internal database, raw state_json, or image bytes.
// Canonical storage is unchanged: the generator's own `projects` row
// (state_json + revision). Nothing is copied into the customer app.
const requireAppBridgeAuth = createRequireAppBridgeAuth({ db, supabaseIdentity, identityLinks });
function bridgeError(res, status, code, message, extra) {
  return res.status(status).json({ ok: false, error: { code, message, ...(extra || {}) } });
}
// The enum vocabularies REFINEMENT_TOOL's own schema is built from -- the
// server-side plan normalizer validates against exactly these lists.
const REFINEMENT_VOCAB = {
  sectionTypes: SECTION_TYPE_KEYS, heroKeys: HERO_KEYS, imageryKeys: IMAGERY_KEYS, colorBehaviorKeys: COLOR_BEHAVIOR_KEYS,
  spacingKeys: SPACING_KEYS, imageStrategyKeys: CREATIVE_IMAGE_STRATEGY_KEYS, heroStrategyKeys: CREATIVE_HERO_STRATEGY_KEYS,
  pageRhythmKeys: CREATIVE_PAGE_RHYTHM_KEYS,
};
// "Which project is this customer's website?" -- resolved by the generator
// itself, from the authenticated account alone (no client-supplied id): the
// most recently PURCHASED project still in
// 'purchased' status (purchase snapshots are listed newest purchase first);
// otherwise the most recently updated draft/checkout_pending project.
// KNOWN SIMPLIFICATION: an account with more than one purchased project
// only ever sees its most recent one through the app.
// Phase 5: the customer app now keeps its own REFERENCE link, workspace ->
// this project id (its public.website_project_links, created the first time
// this route returns a purchased project for a single-workspace customer).
// That link never feeds back into this function and never authorizes
// anything here -- every bridge call is still resolved and ownership-checked
// from the verified token alone. If this function starts returning a
// different project for the same person (e.g. a second purchase), the app
// records a "mismatch" for staff rather than re-pointing its link.
function resolveCanonicalProjectId(accountId) {
  for (const snap of purchase.listOwnedPurchaseSnapshots(db, accountId)) {
    const st = projectStore.getOwnedProjectStatus(db, accountId, snap.projectId);
    if (st && st.status === 'purchased') return snap.projectId;
  }
  const projects = projectStore.listOwnedProjects(db, accountId); // updated_at DESC
  const purchased = projects.find(p => p.status === 'purchased');
  if (purchased) return purchased.id;
  const draft = projects.find(p => p.status === 'draft' || p.status === 'checkout_pending');
  return draft ? draft.id : null;
}
// Which direction (of up to 3) the bridge edits/publishes: the one that
// was PURCHASED when there is a purchase snapshot (so an edit can never
// silently switch a customer to a direction they didn't buy), otherwise
// the draft's active direction.
function canonicalDirectionIndex(accountId, projectId, directionsState) {
  const snap = purchase.getOwnedPurchaseSnapshot(db, accountId, projectId);
  const count = Array.isArray(directionsState && directionsState.directions) ? directionsState.directions.length : 0;
  const idx = snap && Number.isInteger(snap.directionIndex) ? snap.directionIndex
    : (Number.isInteger(directionsState && directionsState.activeDirectionIndex) ? directionsState.activeDirectionIndex : 0);
  return Math.max(0, Math.min(Math.max(0, count - 1), idx));
}
function bridgeDomains(accountId, projectId) {
  return deploymentStore.listOwnedDomains(db, accountId, projectId).map(d => ({ domain: d.domain, state: d.state, target: d.target, verifiedAt: d.verifiedAt, updatedAt: d.updatedAt }));
}

// Shared by route 1 (canonical) and route 1c (explicit id, Phase 9) --
// factored out so both return byte-identical shapes for the same project.
// null means "not found or not owned by this account" (the caller decides
// the right 404 shape for its own route).
function buildWebsiteSummary(accountId, projectId) {
  const project = projectStore.getOwnedProjectRaw(db, accountId, projectId);
  if (!project) return null;
  const directionIndex = canonicalDirectionIndex(accountId, projectId, project.directionsState);
  const direction = project.directionsState.directions[directionIndex] || {};
  const purchaseSnapshot = purchase.getOwnedPurchaseSnapshot(db, accountId, projectId);
  const published = publishedSnapshots.getLatestOwnedPublished(db, accountId, projectId);
  const isPurchased = project.status === 'purchased';
  // The revision POST /api/projects/:id/export currently compiles from.
  const deliveredRevision = published ? published.revision : (purchaseSnapshot ? purchaseSnapshot.projectRevision : null);
  return {
    ok: true, hasCanonicalProject: true,
    projectId: project.id, name: project.name, status: project.status, revision: project.revision,
    purchaseRef: project.purchaseRef, createdAt: project.createdAt, updatedAt: project.updatedAt,
    deploymentStatus: projectStore.getOwnedProjectDeploymentStatus(db, accountId, projectId),
    businessName: (direction.business && typeof direction.business.name === 'string' && direction.business.name.trim()) ? direction.business.name.trim() : null,
    domains: bridgeDomains(accountId, projectId),
    lastPublishedAt: published ? published.publishedAt : null,
    publishedRevision: published ? published.revision : null,
    purchasedRevision: purchaseSnapshot ? purchaseSnapshot.projectRevision : null,
    hasUnpublishedChanges: isPurchased && deliveredRevision !== null && project.revision > deliveredRevision,
    canEdit: project.status !== 'archived',
    canPublish: isPurchased,
    // Honest, machine-readable statement of what does NOT exist yet, so a
    // client never has to guess: no server-rendered preview URL, and no
    // automatic hosting (deployments.deployed_url is never set).
    previewUrl: null,
    liveUrl: null,
  };
}

// 1. GET /api/app-bridge/website -- a SMALL summary of the canonical
// project (never the full directionsState or any image data).
app.get('/api/app-bridge/website', appBridgeRateLimit, requireAppBridgeAuth, appBridgeAccountRateLimit, (req, res) => {
  const projectId = resolveCanonicalProjectId(req.accountId);
  if (!projectId) return res.status(404).json({ ok: false, hasCanonicalProject: false, error: { code: 'no_project', message: 'No website has been created in the SiteRemade builder for this account yet.' } });
  const summary = buildWebsiteSummary(req.accountId, projectId);
  if (!summary) return res.status(404).json({ ok: false, hasCanonicalProject: false, error: { code: 'no_project', message: 'No website found.' } });
  return res.json(summary);
});

// 1b. GET /api/app-bridge/website/candidates -- Phase 6 (additive). EVERY
// project this account has PURCHASED, not just the single newest one route
// 1 resolves: exactly the data resolveCanonicalProjectId() already iterates
// (purchase.listOwnedPurchaseSnapshots, newest purchase first, still in
// 'purchased' status), plus -- like that function's own fallback -- any
// purchased project that predates purchase snapshots. Same flag gate, same
// rate limit, same per-request token verification + identity_links
// resolution; scoped to req.accountId only, so it can never list anyone
// else's projects.
// Why it exists: when the customer app sees this account's canonical
// project change (e.g. a second purchase), it captures this list WITH THE
// CUSTOMER'S OWN TOKEN at that moment, so SiteRemade staff can later choose
// between these verified ids without the builder ever needing a staff or
// impersonation path. Metadata only -- never state_json, content or images.
//
// Phase 8: also the direct source for the customer app's OWN "connect a
// website" chooser (GET /api/app/website/candidates -> this route, same
// token) -- so each candidate now carries the same small display metadata
// route 1 already exposes for the single canonical project (name, status,
// domains, deployment status, unpublished-changes flag), not just
// {projectId, purchaseRef, purchasedAt, revision}. Still bounded (<=50
// candidates, realistically 1-3) and still metadata only: businessName
// comes from the same one directionsState field route 1 reads
// (direction.business.name), nothing else of the design is touched or
// returned. A metadata lookup failing for one candidate never drops it from
// the list -- the id/purchaseRef/revision below are never lost because of it.
app.get('/api/app-bridge/website/candidates', appBridgeRateLimit, requireAppBridgeAuth, appBridgeAccountRateLimit, (req, res) => {
  // One owner-scoped summary query (id/status/purchaseRef/revision -- no
  // state_json parsed), then the snapshot list for purchase order/dates.
  const owned = new Map(projectStore.listOwnedProjects(db, req.accountId).map(p => [p.id, p]));
  const candidates = [];
  const seen = new Set();
  const enrich = (p) => {
    let businessName = null, domains = [], deploymentStatus = 'not_deployed', hasUnpublishedChanges = false;
    try {
      const raw = projectStore.getOwnedProjectRaw(db, req.accountId, p.id);
      if (raw) {
        const directionIndex = canonicalDirectionIndex(req.accountId, p.id, raw.directionsState);
        const direction = (raw.directionsState.directions || [])[directionIndex] || {};
        businessName = (direction.business && typeof direction.business.name === 'string' && direction.business.name.trim()) ? direction.business.name.trim() : null;
        domains = bridgeDomains(req.accountId, p.id);
        deploymentStatus = projectStore.getOwnedProjectDeploymentStatus(db, req.accountId, p.id) || 'not_deployed';
        const purchaseSnapshot = purchase.getOwnedPurchaseSnapshot(db, req.accountId, p.id);
        const published = publishedSnapshots.getLatestOwnedPublished(db, req.accountId, p.id);
        const deliveredRevision = published ? published.revision : (purchaseSnapshot ? purchaseSnapshot.projectRevision : null);
        hasUnpublishedChanges = deliveredRevision !== null && p.revision > deliveredRevision;
      }
    } catch (e) { console.warn('[app-bridge] candidate metadata lookup failed for', p.id, e && e.message); }
    return { projectId: p.id, name: p.name || null, businessName, status: p.status, purchaseRef: p.purchaseRef || null, revision: Number.isInteger(p.revision) ? p.revision : null, domains, deploymentStatus, hasUnpublishedChanges };
  };
  const add = (p, purchasedAt) => { seen.add(p.id); candidates.push({ ...enrich(p), purchasedAt: purchasedAt || null }); };
  for (const snap of purchase.listOwnedPurchaseSnapshots(db, req.accountId)) {
    const p = owned.get(snap.projectId);
    if (p && p.status === 'purchased' && !seen.has(p.id)) add(p, snap.createdAt);
  }
  for (const p of owned.values()) if (p.status === 'purchased' && !seen.has(p.id)) add(p, null);
  return res.json({ ok: true, candidates: candidates.slice(0, 50) });
});

// 1c. GET /api/app-bridge/website/:projectId -- Phase 9 (multi-project).
// The explicit-id sibling of route 1 above, for when the caller already
// knows WHICH of this account's (possibly several) purchased projects it
// wants -- the app's own website_project_links can now hold more than one
// row per workspace (V54-WEBSITE-LINKS-MULTI-PROJECT-MIGRATION.sql), so
// "the canonical project" (route 1's own resolveCanonicalProjectId, still
// singular -- "most recently purchased," a documented simplification) is
// no longer sufficient for a project-centric Workplace to read any
// project OTHER than the newest one. Same auth/rate-limit gate, same
// ownership check (getOwnedProjectRaw inside buildWebsiteSummary never
// returns a row belonging to a different account -- a mismatched id and a
// genuinely nonexistent one are indistinguishable, same IDOR discipline as
// every other project lookup in this file), same response shape as route 1
// byte-for-byte, so the app's existing summaryFrom() mapping (routes/
// website-bridge.js) needs no changes to consume either one.
//
// Registered AFTER route 1b (candidates) deliberately: Express matches
// routes in registration order, and a bare `:projectId` segment would
// otherwise swallow `/website/candidates` as if "candidates" were a
// project id. It does not need to come before `:projectId/deployment` /
// `:projectId/edits` / `:projectId/publish` below -- those have an extra
// path segment, so they never collide with this route regardless of order.
app.get('/api/app-bridge/website/:projectId', appBridgeRateLimit, requireAppBridgeAuth, appBridgeAccountRateLimit, (req, res) => {
  const projectId = clean(req.params.projectId, 120);
  const summary = buildWebsiteSummary(req.accountId, projectId);
  if (!summary) return res.status(404).json({ ok: false, hasCanonicalProject: false, error: { code: 'no_project', message: 'No website found.' } });
  return res.json(summary);
});

// BILLING PASS: the same plan/credit summary the builder shows (GET /api/credits), for the app's own screens -- one
// balance, one set of prices, one renewal date in both places. `?refresh=1` re-verifies the subscription with the app
// right away (after the owner subscribes, changes or cancels), instead of waiting for the few-minute cache.
app.get('/api/app-bridge/credits', appBridgeRateLimit, requireAppBridgeAuth, appBridgeAccountRateLimit, async (req, res) => {
  try { await billing.refresh(req.accountId, { force: req.query.refresh === '1' }); } catch (e) { console.error('Billing refresh failed:', e.message); }
  return res.json({ ok: true, credits: creditsSummaryFor(req.accountId), websitePrice: { cents: SITEREMADE_WEBSITE_PRICE_CENTS, currency: SITEREMADE_WEBSITE_PRICE_CURRENCY, display: formatWebsitePriceDisplay() } });
});

// Authenticated, non-hosted preview for the Client App. This compiles the
// signed-in owner's current purchased project with the SAME export compiler
// used for handoff, then inlines local assets so the app can display one
// self-contained HTML document without exposing the builder filesystem or a
// public preview URL. Nothing is deployed and no database state is changed.
function previewMime(file) {
  const ext = path.extname(file).toLowerCase();
  return ({'.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.gif':'image/gif','.svg':'image/svg+xml','.avif':'image/avif','.ico':'image/x-icon','.woff':'font/woff','.woff2':'font/woff2','.ttf':'font/ttf'})[ext] || 'application/octet-stream';
}
function inlinePreviewAssets(html, root) {
  // The Business export is a real multi-file package: index.html links
  // styles.css and site.js, while visual assets live under assets/. A
  // single-document app preview must inline ALL of those dependencies or
  // it will look like raw browser HTML even though the downloaded export is
  // correctly styled. Keep this sourced from the compiled export itself so
  // preview and handoff cannot drift apart.
  const cssFile = path.join(root, 'styles.css');
  if (fs.existsSync(cssFile)) {
    const css = fs.readFileSync(cssFile, 'utf8').replace(/<\/style/gi, '<\\/style');
    html = html.replace(/<link\s+rel=["']stylesheet["']\s+href=["']styles\.css["']\s*\/?>(?:\s*)/i, `<style data-siteremade-preview-css>${css}</style>`);
  }
  const jsFile = path.join(root, 'site.js');
  if (fs.existsSync(jsFile)) {
    const js = fs.readFileSync(jsFile, 'utf8').replace(/<\/script/gi, '<\\/script');
    html = html.replace(/<script\s+src=["']site\.js["']\s*><\/script>/i, `<script data-siteremade-preview-js>${js}<\/script>`);
  }
  const dir = path.join(root, 'assets');
  if (!fs.existsSync(dir)) return html;
  for (const name of fs.readdirSync(dir)) {
    const file = path.join(dir, name);
    if (!fs.statSync(file).isFile()) continue;
    const data = fs.readFileSync(file).toString('base64');
    const uri = `data:${previewMime(file)};base64,${data}`;
    const rel = 'assets/' + name;
    html = html.split(rel).join(uri);
  }
  return html;
}
function compileOwnedPreviewHtml(accountId, projectId) {
  const raw = projectStore.getOwnedProjectRaw(db, accountId, projectId);
  if (!raw || raw.status !== 'purchased') return null;
  const directionIndex = canonicalDirectionIndex(accountId, projectId, raw.directionsState);
  const previewId = 'preview-' + crypto.createHash('sha1').update(projectId + ':' + raw.revision + ':' + directionIndex).digest('hex').slice(0, 20);
  const workDir = path.join(EXPORTS_DIR, previewId);
  ensureExportsDir();
  try {
    const result = exportCompiler.compileExport(db, {
      project: { id: raw.id, revision: raw.revision, directionsState: raw.directionsState },
      directionIndex, workDir, hostingChoice: null, purchaseDate: null,
    });
    const indexFile = path.join(result.workDir, 'index.html');
    if (!fs.existsSync(indexFile)) throw new Error('Preview homepage was not compiled.');
    let html = fs.readFileSync(indexFile, 'utf8');
    html = inlinePreviewAssets(html, result.workDir);
    // Keep navigation inside the preview harmless: relative multi-page links
    // are part of the export, but the app preview intentionally serves only
    // the homepage. External links may still open in a new tab.
    html = html.replace(/<head([^>]*)>/i, '<head$1><base target="_blank">');
    return html;
  } finally {
    try { fs.rmSync(workDir, { recursive: true, force: true }); } catch (e) {}
  }
}
app.get('/api/app-bridge/website/:projectId/preview', appBridgeRateLimit, requireAppBridgeAuth, appBridgeAccountRateLimit, (req, res) => {
  const projectId = clean(req.params.projectId, 120);
  try {
    const html = compileOwnedPreviewHtml(req.accountId, projectId);
    if (!html) return bridgeError(res, 404, 'not_found', 'Purchased website not found.');
    res.set('Cache-Control', 'no-store');
    res.type('html').send(html);
  } catch (e) {
    console.error('[app-bridge] preview failed:', e && e.message);
    return bridgeError(res, 500, 'preview_failed', 'The website preview could not be prepared.');
  }
});

// 2. GET /api/app-bridge/website/:projectId/deployment
app.get('/api/app-bridge/website/:projectId/deployment', appBridgeRateLimit, requireAppBridgeAuth, appBridgeAccountRateLimit, (req, res) => {
  const projectId = clean(req.params.projectId, 120);
  const status = projectStore.getOwnedProjectStatus(db, req.accountId, projectId);
  if (!status) return bridgeError(res, 404, 'not_found', 'Website not found.');
  const deployments = deploymentStore.listOwnedDeployments(db, req.accountId, projectId).slice(0, 20).map(d => ({
    id: d.id, state: d.state, target: d.target, projectRevision: d.projectRevision,
    deployedUrl: d.deployedUrl, // always null today -- no route ever sets it (no real hosting integration exists)
    failureReason: d.failureReason, createdAt: d.createdAt,
  }));
  return res.json({
    ok: true, projectId, deploymentStatus: projectStore.getOwnedProjectDeploymentStatus(db, req.accountId, projectId),
    deployments, domains: bridgeDomains(req.accountId, projectId),
    automaticHosting: false,
  });
});

// 3. POST /api/app-bridge/website/:projectId/edits -- body {baseRevision, request}.
// Pipeline: ownership + revision check (409 before ANY spend) -> reserve the
// same credits /api/refine-website charges -> requestRefinementPlan (the
// shared Claude call) -> normalizeServerRefinementPlan -> applyRefinementPlan
// on a working copy -> any replacement images through generateImageWithCredits
// (same kill switch / credit / USD-budget gates as /api/generate-image,
// spend keyed by THIS project's server id) -> save through
// projectStore.updateOwnedProject with expectedRevision (the same function
// PUT /api/projects/:id uses) -> commit credits. Any failure at any step
// releases every reservation and saves nothing. The result is a new DRAFT
// revision only: nothing is published, exported or deployed here, and
// purchase_snapshots is never written.
app.post('/api/app-bridge/website/:projectId/edits', appBridgeRateLimit, requireAppBridgeAuth, generationRateLimit, async (req, res) => {
  const projectId = clean(req.params.projectId, 120);
  const body = req.body || {};
  const baseRevision = Number.isInteger(body.baseRevision) ? body.baseRevision : null;
  const request = clean(body.request, 600);
  if (baseRevision === null) return bridgeError(res, 400, 'invalid_request', 'baseRevision is required.');
  if (!request) return bridgeError(res, 400, 'invalid_request', 'Describe the change you want to make.');
  // the app retrying an update it already made (its response was lost): the saved result, before any revision check
  const editOpId = opIdFromKey('appedit', req.accountId, clean(req.get('idempotency-key') || body.requestId, 120));
  const earlier = editOpId && replayPaid(editOpId);
  if (earlier) { const op = credits.findOperation(db, editOpId); if (op && op.account_id === req.accountId && op.status === 'committed') return res.json(Object.assign({}, earlier, { creditsCharged: 0, replayed: true, creditsRemaining: creditsRemainingFor(req.accountId) })); }
  const project = projectStore.getOwnedProjectRaw(db, req.accountId, projectId);
  if (!project) return bridgeError(res, 404, 'not_found', 'Website not found.');
  if (project.status === 'archived') return bridgeError(res, 409, 'not_editable', 'This website can no longer be edited.');
  if (project.revision !== baseRevision) return bridgeError(res, 409, 'revision_conflict', 'This website changed since you opened it. Refresh before applying this update.', { currentRevision: project.revision });
  if (!anthropicProvider.configured()) return bridgeError(res, 503, 'ai_unavailable', 'Automatic website editing isn\'t available right now. Nothing on your website was changed.');
  const directionIndex = canonicalDirectionIndex(req.accountId, projectId, project.directionsState);
  const direction = project.directionsState.directions[directionIndex];
  if (!direction) return bridgeError(res, 422, 'edit_failed', 'This website couldn\'t be read for editing. Nothing was changed.');

  // Same task type (and therefore the same 'cheap' credit class/price) that
  // /api/refine-website defaults to -- no new price is invented here.
  // BILLING PASS: one AI update (CREDIT_COSTS.aiUpdate) from the same ledger the builder spends from. The app sends
  // an idempotency key per update, so a retried or reconnected request never plans (or charges) twice.
  const taskType = 'COPY_REWRITE';
  const refineCost = CREDIT_COSTS.aiUpdate;
  let refineReserved = false, refineOp = null;
  if (refineCost > 0) {
    await prepareCredits(req.accountId);
    const reservation = reserveAttempt(req.accountId, refineCost, 'ai_update', editOpId);
    if (reservation.inProgress) return bridgeError(res, 409, 'in_progress', 'This update is already being made.');
    if (reservation.replay) return res.json(Object.assign({}, reservation.replay, { creditsCharged: 0, replayed: true, creditsRemaining: creditsRemainingFor(req.accountId) }));
    if (!reservation.ok) return bridgeError(res, 402, 'insufficient_credits', `An AI update needs ${refineCost} credit and your balance is ${reservation.remaining}. Nothing was changed.`, { creditsRemaining: reservation.remaining });
    refineReserved = true; refineOp = reservation.opId;
  }
  const imageSettlements = [];
  const startedAt = Date.now();
  let usage = {};
  let plannerModel = ANTHROPIC_MODEL;
  const recordRefine = (ok) => recordOperation({ operationType: taskType, provider: 'anthropic', model: plannerModel, ok, inputTokens: usage.input_tokens, outputTokens: usage.output_tokens, cacheReadTokens: usage.cache_read_input_tokens, cacheWriteTokens: usage.cache_creation_input_tokens, creditCost: refineReserved ? refineCost : null, creditsCharged: (ok && refineReserved) ? refineCost : 0, latencyMs: Date.now() - startedAt, projectId: project.id, accountId: req.accountId, anonId: null });
  let settled = false; // true once credits are committed -- a late error must never release a committed charge
  const fail = (status, code, message, extra) => {
    if (!settled) {
      settled = true;
      if (refineReserved) releaseCredit(refineOp);
      imageSettlements.forEach(s => s.release());
      recordRefine(false);
    }
    if (res.headersSent) return undefined;
    return bridgeError(res, status, code, message, extra);
  };
  try {
    let planResult;
    try {
      planResult = await requestRefinementPlan({ request, context: buildRefinementContext(direction) });
    } catch (error) {
      return fail(502, 'edit_failed', 'We couldn\'t work out that change right now. Nothing on your website was changed.');
    }
    usage = planResult.usage || {};
    if (planResult.model) plannerModel = planResult.model;
    if (!planResult.providerOk || !planResult.ok) return fail(502, 'edit_failed', 'We couldn\'t work out that change right now. Nothing on your website was changed.');
    const plan = normalizeServerRefinementPlan(planResult.plan, direction, REFINEMENT_VOCAB);
    if (!plan) return fail(422, 'edit_failed', 'That request didn\'t turn into a change we can make automatically. Nothing on your website was changed -- try describing it another way, or send it to the SiteRemade team.');
    const applied = applyRefinementPlan(project.directionsState, directionIndex, plan);
    if (!applied.ok) return fail(422, 'edit_failed', 'That change couldn\'t be applied cleanly, so nothing on your website was changed.');
    const changeSummary = applied.summary.slice();
    const appliedOperations = applied.applied.slice();
    if (applied.imageRequests.length && !visualMode.allowsGeneratedImages(direction)) {
      // a Business website's pictures are the owner's uploads and SiteRemade's starter visuals: a request for a new
      // generated picture is not carried out. Other changes in the same update still apply; an update that was only
      // about a picture changes nothing and is not charged.
      if (!appliedOperations.length) return fail(422, 'edit_failed', 'New pictures aren\'t generated for this website. Upload your own photo in the builder to replace a picture. Nothing was changed and no credits were used.', { reason: 'starter_visuals_only' });
      changeSummary.push('Pictures were left as they are: upload your own photo in the builder to replace one.');
      applied.imageRequests.length = 0;
    }
    if (applied.imageRequests.length) {
      if (!activeImageProvider.configured()) return fail(503, 'edit_failed', 'This change needs a new image, and new images can\'t be created right now. Nothing on your website was changed.', { reason: 'images_unavailable' });
      for (const imageRequest of applied.imageRequests) {
        // PREMIUM_GENERATION_V1: the Workplace updater shares the generator's premium image path; every edit is its own
        // generation session (its own hard budget), phase 'repair'.
        // PRICING IS PINNED to the support model at medium quality, whatever the saved image plan says. The browser's
        // imagePlan is now persisted (lib/project-store.js validateImagePlan) and can name the premium model/high
        // quality for a slot; reading it here would silently move Workplace edits onto a higher credit price. Changing
        // the edit price is a product decision, not a side effect of storing the plan. (test/workplace-edit-pricing.test.js)
        const image = await generateImageWithCredits({
          accountId: req.accountId, prompt: imageRequest.prompt,
          model: IMAGE_MODEL_SUPPORT, quality: 'medium', aspectRatio: imageRequest.aspectRatio,
          generationId: premiumCore.cfg.enabled ? premiumCore.newGenerationId() : null, premiumTier: null, phase: 'repair',
          // Re-keyed on purpose: the server's real projects.id, not a
          // browser-supplied id (this flow has none) -- see
          // generateImageWithCredits' header comment.
          reservationKey: project.id, direction,
          taskType: 'IMAGE_REGENERATE', projectId: project.id, anonId: null, deferSettlement: true,
        });
        if (!image.ok) {
          if (image.reason === 'credits_exceeded') return fail(402, 'insufficient_credits', 'This change needs a new image, and there aren\'t enough credits for it. Nothing on your website was changed.', { creditsRemaining: image.creditsRemaining });
          if (image.reason === 'budget_exceeded') return fail(429, 'edit_failed', 'Too many new images were requested in a short time. Nothing on your website was changed -- try again in a few minutes.', { reason: 'image_budget' });
          if (image.reason === 'not_configured') return fail(503, 'edit_failed', 'This change needs a new image, and new images can\'t be created right now. Nothing on your website was changed.', { reason: 'images_unavailable' });
          return fail(502, 'edit_failed', 'The new image couldn\'t be created, so nothing on your website was changed.', { reason: 'image_failed' });
        }
        imageSettlements.push(image.settle);
        setGeneratedImage(applied.state, directionIndex, imageRequest.slot, image.dataUrl);
        changeSummary.push(imageSummary(imageRequest.slot));
        appliedOperations.push({ action: 'regenerate-image', slot: imageRequest.slot, model: image.model, creditsCharged: image.creditsCharged });
      }
    }
    const saved = projectStore.updateOwnedProject(db, req.accountId, project.id, { directionsState: applied.state, expectedRevision: baseRevision });
    if (!saved.ok) {
      if (saved.reason === 'conflict') return fail(409, 'revision_conflict', 'This website changed while your update was being prepared. Nothing was changed -- refresh and try again.', { currentRevision: saved.current ? saved.current.revision : null });
      if (saved.reason === 'not_found') return fail(404, 'not_found', 'Website not found.');
      return fail(422, 'edit_failed', 'That change produced a website we couldn\'t save, so nothing was changed.');
    }
    settled = true;
    if (refineReserved) commitCredit(refineOp);
    imageSettlements.forEach(s => s.commit());
    recordRefine(true);
    const imageCredits = appliedOperations.filter(o => o.action === 'regenerate-image').reduce((n, o) => n + (o.creditsCharged || 0), 0);
    let creditsRemaining = null;
    try { creditsRemaining = creditsRemainingFor(req.accountId); } catch (e) { /* informational only -- the edit IS saved; never report it as failed */ }
    const edited = { ok: true, revision: saved.project.revision, changeSummary, appliedOperations, creditsCharged: (refineReserved ? refineCost : 0) + imageCredits, creditsRemaining };
    rememberPaid(refineOp, edited);
    return res.json(edited);
  } catch (error) {
    console.error('App bridge edit failed:', error && error.message);
    return fail(500, 'edit_failed', 'Something went wrong, so nothing on your website was changed.');
  }
});

// 4. POST /api/app-bridge/website/:projectId/publish -- body {revision}.
// WHAT THIS DOES: appends a published_snapshots row freezing the project's
// current state_json at exactly `revision`, which from then on is what
// POST /api/projects/:id/export compiles from (instead of the original
// purchase snapshot). WHAT THIS DOES NOT DO: push bytes to any live URL or
// hosting target -- no such mechanism exists anywhere in this codebase
// (deploy-to for real targets always records a failure; deployed_url is
// never set). The response says so explicitly (automaticHosting:false).
app.post('/api/app-bridge/website/:projectId/publish', appBridgeRateLimit, requireAppBridgeAuth, appBridgeAccountRateLimit, (req, res) => {
  const projectId = clean(req.params.projectId, 120);
  const body = req.body || {};
  const revision = Number.isInteger(body.revision) ? body.revision : null;
  if (revision === null) return bridgeError(res, 400, 'invalid_request', 'revision is required.');
  const project = projectStore.getOwnedProjectRaw(db, req.accountId, projectId);
  if (!project) return bridgeError(res, 404, 'not_found', 'Website not found.');
  const directionIndex = canonicalDirectionIndex(req.accountId, projectId, project.directionsState);
  // BILLING PASS: a purchase is of one kind of website. A later revision of it may be published; a different kind of
  // website (a Business purchase turned into a Creative page, or the reverse) is a new website and needs its own purchase.
  const bought = purchase.getOwnedPurchaseSnapshotRaw(db, req.accountId, projectId);
  if (bought && directionModeOf(bought.directionsState, bought.directionIndex) !== directionModeOf(project.directionsState, directionIndex)) return bridgeError(res, 409, 'not_purchased', 'This is a different kind of website from the one that was purchased, so it needs its own purchase.');
  const result = publishedSnapshots.publishCurrentRevision(db, req.accountId, projectId, { revision, directionIndex });
  if (!result.ok) {
    if (result.reason === 'not_found') return bridgeError(res, 404, 'not_found', 'Website not found.');
    if (result.reason === 'conflict') return bridgeError(res, 409, 'revision_conflict', 'This website changed since you reviewed it. Refresh before publishing.', { currentRevision: result.currentRevision });
    if (result.reason === 'not_purchased') return bridgeError(res, 409, 'not_purchased', 'Publishing is available once this website has been purchased.');
    return bridgeError(res, 500, 'publish_failed', 'Publishing didn\'t go through. Nothing was changed.');
  }
  return res.json({ ok: true, published: true, alreadyPublished: !!result.alreadyPublished, revision: result.snapshot.revision, publishedAt: result.snapshot.publishedAt, automaticHosting: false });
});

// ---- V8.6: export / deployment / hosting / domain handoff ------------------
// Export/deploy is an ownership boundary exactly like the project routes
// above: every route here does its own explicit ownership-scoped lookup
// (never trusts a client-supplied owner/project id alone), requireAuth on
// every route, requireSameOrigin on every state-changing one (spec §28).
// Deployment-safety pass: env-configurable, matching SITEREMADE_DB_PATH and
// SITEREMADE_ASSET_STORE_DIR -- this directory holds the actual compiled
// .zip artifact behind every My Websites re-download link, so it needs the
// SAME durable-volume treatment as the database and asset store (see
// lib/deployment-safety.js, which requires this to be set explicitly
// before starting what looks like a production deployment on the local
// backend). Falls back to the pre-V9 in-container default for local dev/
// the test harness, unchanged.
const EXPORTS_DIR = process.env.SITEREMADE_EXPORTS_DIR || path.join(__dirname, 'data', 'exports'); // gitignored under /data/, exactly like the sqlite db and asset-store
function directionModeOf(directionsState, index) {
  const d = ((directionsState && directionsState.directions) || [])[Number.isInteger(index) ? index : 0];
  return d && d.mode === 'creative' ? 'creative' : 'business';
}
function ensureExportsDir() { fs.mkdirSync(EXPORTS_DIR, { recursive: true }); }

// Compiles + archives + records a new deployment for an owned, PURCHASED
// project. Never trusts localStorage/UI badges/client-supplied status --
// `project.status` is read straight from the authoritative row (spec §4).
//
// Product-flow pass: this now compiles EXCLUSIVELY from the immutable
// purchase snapshot frozen at fulfillment time (see lib/purchase.js's
// fulfillBySessionId/ensureSnapshotForOwnedProject and
// migrations/0003_credits_and_snapshots.sql) -- never from the live,
// still-editable draft. This is a deliberate API contract change from the
// prior pass: since export no longer touches the live draft at all, the
// client-supplied `expectedRevision`/`directionIndex`/stale-revision check
// that used to gate this route is gone -- there is nothing left for it to
// be stale against. A request body is no longer required.
app.post('/api/projects/:id/export', requireAuth, requireSameOrigin, projectJsonParser, (req, res) => {
  const projectId = req.params.id;
  const status = projectStore.getOwnedProjectStatus(db, req.accountId, projectId);
  if (!status) return res.status(404).json({ ok: false, message: 'Project not found.' });
  if (status.status !== 'purchased') return res.status(403).json({ ok: false, message: 'This project has not been purchased yet.' });
  // ensureSnapshotForOwnedProject is a one-time, best-effort backfill for a
  // purchased project that (for any reason) predates this feature -- a
  // true no-op if a snapshot already exists, which is the normal case
  // (the Stripe webhook already created it atomically at fulfillment).
  const ensured = purchase.ensureSnapshotForOwnedProject(db, req.accountId, projectId);
  if (!ensured.ok) return res.status(500).json({ ok: false, message: 'Could not locate a purchased snapshot for this project.' });
  const snapshot = purchase.getOwnedPurchaseSnapshotRaw(db, req.accountId, projectId);
  // App bridge pass (Phase 4): if this project has ever been published
  // through POST /api/app-bridge/website/:id/publish, compile from the
  // LATEST published snapshot (post-purchase edits become exportable);
  // otherwise -- every project that never used that flow -- compile from
  // the original purchase snapshot exactly as before (same revision, same
  // direction, same state). purchaseDate/hostingChoice always still come
  // from the purchase snapshot: publishing doesn't change what was bought.
  let published = publishedSnapshots.getLatestOwnedPublishedRaw(db, req.accountId, projectId);
  // a published revision of a different kind than what was bought never replaces the purchased website
  if (published && directionModeOf(published.directionsState, published.directionIndex) !== directionModeOf(snapshot.directionsState, snapshot.directionIndex)) published = null;
  const source = published
    ? { revision: published.revision, directionIndex: published.directionIndex, directionsState: published.directionsState }
    : { revision: snapshot.projectRevision, directionIndex: snapshot.directionIndex, directionsState: snapshot.directionsState };
  const exportSource = { id: projectId, revision: source.revision, directionsState: source.directionsState };
  ensureExportsDir();
  const deploymentId = deploymentStore.genId('dep');
  const workDir = path.join(EXPORTS_DIR, deploymentId);
  let result;
  try {
    result = exportCompiler.compileExport(db, {
      project: exportSource, directionIndex: source.directionIndex, workDir,
      hostingChoice: snapshot.hostingChoice, purchaseDate: snapshot.createdAt,
    });
  } catch (e) {
    const failed = deploymentStore.recordFailedDeployment(db, {
      id: deploymentId, ownerId: req.accountId, projectId, projectRevision: source.revision, directionIndex: source.directionIndex,
      target: 'local', failureReason: (e && e.message) || 'Export failed.',
    });
    return res.status(400).json({ ok: false, message: (e && e.message) || 'Export failed.', deployment: failed });
  }
  try {
    zipDirectory(result.workDir, workDir + '.zip');
  } catch (e) {
    const failed = deploymentStore.recordFailedDeployment(db, {
      id: deploymentId, ownerId: req.accountId, projectId, projectRevision: source.revision, directionIndex: source.directionIndex,
      target: 'local', failureReason: 'Could not build a downloadable archive: ' + ((e && e.message) || 'unknown error'),
      runtimeType: result.runtimeType, runtimeReasons: result.runtimeReasons, manifest: result.manifest,
      artifactHash: result.artifactHash, compilerVersion: exportCompiler.COMPILER_VERSION,
    });
    return res.status(500).json({ ok: false, message: 'Could not build a downloadable archive.', deployment: failed });
  }
  const deployment = deploymentStore.createReadyDeployment(db, {
    id: deploymentId, ownerId: req.accountId, projectId, projectRevision: source.revision, directionIndex: source.directionIndex,
    compilerVersion: exportCompiler.COMPILER_VERSION, artifactHash: result.artifactHash,
    runtimeType: result.runtimeType, runtimeReasons: result.runtimeReasons, target: 'local',
    manifest: result.manifest, artifactPath: workDir + '.zip',
  });
  return res.status(201).json({ ok: true, deployment, manifest: result.manifest });
});

// ---- Product-flow pass: purchase snapshot / hosting choice / My Websites --
app.get('/api/projects/:id/purchase-snapshot', requireAuth, (req, res) => {
  const status = projectStore.getOwnedProjectStatus(db, req.accountId, req.params.id);
  if (!status) return res.status(404).json({ ok: false, message: 'Project not found.' });
  if (status.status !== 'purchased') return res.status(404).json({ ok: false, message: 'This project has not been purchased yet.' });
  const ensured = purchase.ensureSnapshotForOwnedProject(db, req.accountId, req.params.id);
  if (!ensured.ok) return res.status(500).json({ ok: false, message: 'Could not locate a purchased snapshot for this project.' });
  return res.json({ ok: true, snapshot: purchase.getOwnedPurchaseSnapshot(db, req.accountId, req.params.id) });
});
// Post-purchase hosting upsell (spec §6): recommendation-only, never
// required for ownership -- 'self'/omitted `provider` (or `skipped:true`)
// is a first-class, equally-valid choice, not a degraded path. Validated
// against lib/hosting.js's own real provider keys, never trusted blindly
// from the client, so this can never store a fabricated provider name.
app.post('/api/projects/:id/hosting-choice', requireAuth, requireSameOrigin, (req, res) => {
  const body = req.body || {};
  const rawProvider = body.provider ? String(body.provider).slice(0, 40) : null;
  const skipped = !!body.skipped || !rawProvider;
  const validProviderKeys = hosting.listProviders().map(p => p.key);
  if (rawProvider && rawProvider !== 'self' && !validProviderKeys.includes(rawProvider)) {
    return res.status(400).json({ ok: false, message: 'Unknown hosting provider.' });
  }
  const result = purchase.setSnapshotHostingChoice(db, req.accountId, req.params.id, { provider: skipped ? (rawProvider === 'self' ? 'self' : null) : rawProvider, skipped });
  if (!result.ok) return res.status(404).json({ ok: false, message: 'No purchase snapshot found for this project -- purchase it first.' });
  return res.json({ ok: true, hostingChoice: result.hostingChoice });
});
// My Websites (spec §15): every purchased site this account owns, with the
// snapshot/hosting/receipt/latest-download info that surface needs -- the
// purchased build stays listed here even if the editable draft keeps
// changing (spec: "the purchased build must remain accessible even if the
// editable draft changes").
app.get('/api/my-websites', requireAuth, (req, res) => {
  const snapshots = purchase.listOwnedPurchaseSnapshots(db, req.accountId);
  const websites = snapshots.map(snapshot => {
    const projectStatus = projectStore.getOwnedProjectStatus(db, req.accountId, snapshot.projectId);
    const latestDeployment = deploymentStore.getLatestGoodDeployment(db, req.accountId, snapshot.projectId);
    return {
      projectId: snapshot.projectId,
      projectName: null, // filled in below from the cheap project-summary list, avoiding a second round trip per site
      purchaseRef: projectStatus ? projectStatus.purchaseRef : null,
      purchasedAt: snapshot.createdAt,
      snapshot: { id: snapshot.id, directionIndex: snapshot.directionIndex, projectRevision: snapshot.projectRevision },
      hostingChoice: snapshot.hostingChoice,
      latestDeployment: latestDeployment ? { id: latestDeployment.id, state: latestDeployment.state, createdAt: latestDeployment.createdAt, downloadUrl: `/api/deployments/${latestDeployment.id}/download` } : null,
    };
  });
  // Fold in name/status from the plain project list so the UI doesn't need
  // a second round trip -- listOwnedProjects is already cheap (one indexed
  // query) and this route is not on any hot path.
  const projectsByid = new Map(projectStore.listOwnedProjects(db, req.accountId).map(p => [p.id, p]));
  websites.forEach(w => { const p = projectsByid.get(w.projectId); if (p) w.projectName = p.name; });
  return res.json({ ok: true, websites });
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
// PLANNER HARDENING PASS: requiring this file as a module (instead of
// running it with `node server.js`) skips app.listen() below and exposes a
// small set of pure functions so a test can exercise the REAL
// implementation directly rather than a second, parallel reimplementation
// of it -- the same principle the existing test suite already applies to
// script.js's planAffordableImages via a real browser. Set
// SITEREMADE_DB_PATH=:memory: (the existing test-harness convention -- see
// lib/db.js's own comment) before requiring this file so no real database
// file is ever touched, and leave ANTHROPIC_API_KEY/STRIPE_SECRET_KEY unset
// so nothing here can reach a real external API merely by being required --
// module-level code never calls either provider; both are only ever
// invoked from inside a route handler. Running `node server.js` directly
// (require.main === module, true in every real deployment) is completely
// unaffected: app.listen() still fires exactly as it always has.
if (require.main === module) {
  app.listen(PORT, '0.0.0.0', () => console.log(`SiteRemade running on port ${PORT}`));
} else {
  // App bridge pass (Phase 4): `app` is also exported so a test harness can
  // listen() on the REAL route table in-process (still never listens on its
  // own when required, exactly as before).
  module.exports = { app, normalizePlannerPlan, formatWebsitePriceDisplay, SITEREMADE_WEBSITE_PRICE_CENTS, SITEREMADE_WEBSITE_PRICE_CURRENCY };
}
