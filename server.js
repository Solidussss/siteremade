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
// Credit-architecture fix: lib/entitlement.js's account-durable lifetime
// cap is no longer required/called here -- it predated the credit system
// and, once credits existed alongside it, was blocking authenticated
// generation forever after 3 uses regardless of daily credits (see the
// full explanation at this file's /api/plan-website route). It remains a
// real, tested, concurrency-safe module on disk, just not wired into this
// file any more.
const credits = require('./lib/credits.js');
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

app.disable('x-powered-by');
// V8.5's Stripe webhook route needs the EXACT raw request bytes to verify
// Stripe's HMAC signature (JSON.stringify(JSON.parse(raw)) is not
// guaranteed byte-identical to what Stripe actually sent) -- mounted
// before the generic JSON parser below so it claims that one route first.
app.use('/api/stripe/webhook', express.raw({ type: 'application/json', limit: '2mb' }));
app.use(express.json({ limit: '900kb' }));
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
function reserveImageSpend(key, estimatedCostUsd) {
  const now = Date.now();
  let entry = imageSpendReservations.get(key);
  if (!entry || (now - entry.windowStartedAt) > IMAGE_SPEND_RESERVATION_WINDOW_MS) {
    entry = { spentUsd: 0, windowStartedAt: now };
  }
  const projectedTotal = entry.spentUsd + estimatedCostUsd;
  if (projectedTotal > SITEREMADE_IMAGE_BUDGET_USD + 1e-9) {
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
      const size = sizeOverride || (aspectRatio === '1:1' ? '1024x1024' : aspectRatio === '16:9' ? '1536x1024' : '1024x1024');
      const safeQuality = ALLOWED_IMAGE_QUALITIES.includes(quality) ? quality : 'medium';
      // Allowlist enforcement happens here, not just in the route handler,
      // so this stays safe even if another call site is ever added above
      // it -- an unrecognized model name is silently downgraded to the
      // cheap support model rather than forwarded to OpenAI or rejected
      // outright (a malformed/tampered request should never crash the
      // generation, it should just fail cheap).
      const safeModel = ALLOWED_IMAGE_MODELS.includes(model) ? model : IMAGE_MODEL_SUPPORT;
      const response = await fetch('https://api.openai.com/v1/images/generations', {
        method: 'POST',
        headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: safeModel, prompt, size, quality: safeQuality, n: 1 }),
      });
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
  let creditReserved = false;
  if (accountId && creditCost > 0) {
    const cr = credits.reserveCredits(db, accountId, creditCost, SITEREMADE_DAILY_FREE_CREDITS);
    if (!cr.ok) return { ok: false, reason: 'credits_exceeded', creditsRemaining: cr.remaining };
    creditReserved = true;
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
    done(); if (creditReserved) credits.releaseCredits(db, accountId, creditCost);
    recordOperation({ operationType: taskType || 'IMAGE_GENERATE', provider: activeImageProvider.name, model: safeModel, ok: false, imageCount: 0, latencyMs: Date.now() - startedAt, projectId, accountId, anonId, generationId });
    return { ok: false, reason: 'provider_error' };
  }
  done();
  if (evalResult && evalResult.poor) { // never charge a customer for an unusable image; caller falls back to a designed visual
    if (creditReserved) credits.releaseCredits(db, accountId, creditCost);
    return { ok: false, reason: 'poor_image', evaluation: evalResult, retried: attempt > 0 };
  }
  const okResult = { ok: true, dataUrl: result.dataUrl, quality: result.quality || safeQuality, model: result.model || safeModel, creditsCharged: creditReserved ? creditCost : 0, evaluation: evalResult, retried: attempt > 0 };
  if (!deferSettlement) { if (creditReserved) credits.commitCredits(db, accountId, creditCost); return okResult; }
  let settled = false; // bridge edits: credits stay reserved until the edit is actually saved (spend is already in the USD ledger either way)
  okResult.settle = {
    commit() { if (settled) return; settled = true; if (creditReserved) credits.commitCredits(db, accountId, creditCost); },
    release() { if (settled) return; settled = true; if (creditReserved) credits.releaseCredits(db, accountId, creditCost); },
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
async function generateImageWithCredits({ accountId, prompt, model, quality, aspectRatio, reservationKey, taskType, projectId, anonId, deferSettlement = false, generationId = null, promptAlt = null, premiumTier = null, phase = null }) {
  if (!activeImageProvider.configured()) return { ok: false, reason: 'not_configured' };
  const premiumOn = premiumCore.cfg.enabled && !!generationId && /^gen_[a-z0-9]{6,40}$/.test(generationId);
  if (premiumOn) return generatePremiumImage({ accountId, prompt, promptAlt, model, quality, aspectRatio, taskType, projectId, anonId, generationId, premiumTier, phase, deferSettlement });
  const startedAt = Date.now();
  const safeModel = ALLOWED_IMAGE_MODELS.includes(model) ? model : IMAGE_MODEL_SUPPORT;
  const safeQuality = ALLOWED_IMAGE_QUALITIES.includes(quality) ? quality : 'medium';
  const safeAspectRatio = ALLOWED_IMAGE_ASPECT_RATIOS.includes(aspectRatio) ? aspectRatio : '1:1';
  const estimatedCostUsd = estimateImageRouteCostUsd(safeModel, safeQuality, safeAspectRatio);
  const creditCost = creditCostForImageRoute(safeModel);
  let creditReserved = false;
  if (accountId && creditCost > 0) {
    const creditReservation = credits.reserveCredits(db, accountId, creditCost, SITEREMADE_DAILY_FREE_CREDITS);
    if (!creditReservation.ok) return { ok: false, reason: 'credits_exceeded', creditsRemaining: creditReservation.remaining };
    creditReserved = true;
  }
  // See the SERVER-SIDE SPEND ENFORCEMENT note on /api/generate-image below
  // for exactly what this per-process reservation does and doesn't guarantee.
  const reservation = reserveImageSpend(reservationKey, estimatedCostUsd);
  if (!reservation.ok) {
    if (creditReserved) credits.releaseCredits(db, accountId, creditCost); // behavior fix -- see header
    return { ok: false, reason: 'budget_exceeded' };
  }
  const releaseAll = () => {
    releaseImageSpend(reservationKey, estimatedCostUsd);
    if (creditReserved) credits.releaseCredits(db, accountId, creditCost);
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
      if (creditReserved) credits.commitCredits(db, accountId, creditCost);
      return { ok: true, dataUrl: result.dataUrl, quality: usedQuality, model: usedModel, creditsCharged: creditReserved ? creditCost : 0 };
    }
    let settled = false;
    return {
      ok: true, dataUrl: result.dataUrl, quality: usedQuality, model: usedModel,
      creditsCharged: creditReserved ? creditCost : 0,
      settle: {
        commit() { if (settled) return; settled = true; record(true); if (creditReserved) credits.commitCredits(db, accountId, creditCost); },
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
app.post('/api/generate-image', requireAuth, generationRateLimit, async (req, res) => {
  const anonId = ensureAnonId(req, res);
  // taskType/projectId are purely observability metadata the client
  // attaches (see script.js's ExecutionPlan) -- absent or wrong, this route
  // behaves identically; the ledger just falls back to a generic label.
  const taskType = clean(req.body.taskType, 40) || 'IMAGE_GENERATE';
  const projectId = clean(req.body.projectId, 60);
  const result = await generateImageWithCredits({
    accountId: req.accountId, prompt: clean(req.body.prompt, 1200),
    model: clean(req.body.model, 40), quality: clean(req.body.quality, 10), aspectRatio: clean(req.body.aspectRatio, 10),
    reservationKey: projectId || anonId || 'anonymous', taskType, projectId, anonId,
    // PREMIUM_GENERATION_V1 (ignored unless the flag is on)
    generationId: clean(req.body.premiumGenerationId, 60) || null, promptAlt: clean(req.body.promptAlt, 1200) || null, premiumTier: clean(req.body.premiumTier, 20) || null,
  });
  if (result.ok) {
    // creditsCharged lets the client accumulate/display the real per-image
    // charge (spec: "after generation show actual charge") without
    // re-deriving support/premium pricing itself -- backend stays the sole
    // source of truth for the number, same principle as creditsRemaining.
    return res.json({ ok: true, dataUrl: result.dataUrl, quality: result.quality, model: result.model, evaluation: result.evaluation || undefined, creditsCharged: result.creditsCharged, creditsRemaining: req.accountId ? creditsSummaryFor(req.accountId).remaining : null });
  }
  if (result.reason === 'not_configured') return res.status(200).json({ ok: false, configured: false, message: 'Image generation is not configured on this environment yet.' });
  if (result.reason === 'credits_exceeded') return res.status(200).json({ ok: false, configured: true, creditsExceeded: true, creditsRemaining: result.creditsRemaining, message: 'This account has used its daily credit allowance.' });
  if (result.reason === 'budget_exceeded') return res.status(200).json({ ok: false, configured: true, budgetExceeded: true, message: 'Server-side per-generation image budget already reached; this request was not sent to the image provider.' });
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

function recordPlannerAttempt(attempt) {
  plannerDiagnostics.lastAttempt = {
    timestamp: new Date().toISOString(),
    ...attempt
  };
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
const SITEREMADE_DAILY_FREE_CREDITS = Number(process.env.SITEREMADE_DAILY_FREE_CREDITS) || 10;
const SITEREMADE_CREDIT_COST_BASE_GENERATION = Number(process.env.SITEREMADE_CREDIT_COST_BASE_GENERATION) || 2;
const SITEREMADE_CREDIT_COST_IMAGE_SUPPORT = Number(process.env.SITEREMADE_CREDIT_COST_IMAGE_SUPPORT) || 1;
const SITEREMADE_CREDIT_COST_IMAGE_PREMIUM = Number(process.env.SITEREMADE_CREDIT_COST_IMAGE_PREMIUM) || 2;
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
  cheap: Number(process.env.SITEREMADE_CREDIT_COST_CHEAP) || 1,
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
function creditsSummaryFor(accountId) {
  if (!accountId) return null;
  const summary = credits.getCredits(db, accountId, SITEREMADE_DAILY_FREE_CREDITS);
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
    resetsAt: nextUtcMidnightIso()
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

const HERO_KEYS =['split','fullbleed-image','centered-oversized','stacked-image-below','asymmetric-offset','minimal-text-only','grid-dashboard','poster','collage','product-screenshot','editorial-rail'];
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
12. Decide creativeDirection as the actual creative idea for this specific business, not a restatement of its archetype/category. Two businesses that would land on the same archetype (e.g. two restaurants, two roofers, two SaaS products) must still diverge here when their description implies a different posture -- quiet/premium vs loud/accessible, considered vs urgent, image-led vs informational, portfolio-heavy vs proof-heavy. heroStrategy and pageRhythm are real creative decisions, not defaults: pick pageRhythm from how this business should actually feel to move through (a quiet tasting-menu restaurant reads differently than a same-day emergency contractor), and make heroStrategy agree with the visualDirection.hero layout you chose. Only fill in avoid when a real stylistic trap applies to this business -- leave it empty otherwise.`;

function buildPlannerUserPrompt(brief) {
  const lines = [
    `Business description (verbatim, from the visitor): "${brief.text}"`,
    brief.extractedFacts && Object.keys(brief.extractedFacts).length ? `Facts already detected in that text (treat as the ONLY safe declaredFacts unless the description states more): ${JSON.stringify(brief.extractedFacts)}` : 'No explicit facts (years/rating/customer count) were detected in the text -- do not invent any.',
    brief.location ? `Detected location: ${brief.location}` : '',
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
const PLANNER_REQUEST_TIMEOUT_MS = Number(process.env.SITEREMADE_PLANNER_TIMEOUT_MS) || 35000;
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
          model: ANTHROPIC_MODEL,
          // V9: the schema grew substantially (strategy object, per-page
          // plan, per-section intent/headlineRole) -- 4096 was already
          // tight for an 8-page plan with full visualDirection/creative-
          // Direction/imagePlan/functionalityPlan; raised to give the
          // richer reasoning room without truncating mid-tool-call.
          max_tokens: 8192,
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
  return `concept=${cd.concept} mood=${cd.visualMood} narrative=${cd.narrativeStrategy} signature=${cd.signatureMotif} heroStrategy=${cd.heroStrategy} pageRhythm=${cd.pageRhythm} hero=${vd.hero} type=${vd.typography} imagery=${vd.imagery} color=${vd.colorBehavior} motion=${vd.motion} pattern=${vd.pattern} pages=${pageSummary}`.slice(0, 500);
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
  const creditCost = creditCostForTask(taskType);
  let creditReserved = false;
  if (req.accountId && creditCost > 0) {
    const creditReservation = credits.reserveCredits(db, req.accountId, creditCost, SITEREMADE_DAILY_FREE_CREDITS);
    if (!creditReservation.ok) {
      return res.status(200).json({ ok: false, configured: true, creditsExceeded: true, creditsRemaining: creditReservation.remaining, message: 'This account has used its daily credit allowance.' });
    }
    creditReserved = true;
  }
  const startedAt = Date.now();
  try {
    const result = await requestRefinementPlan({ request, context });
    const usage = result.usage || {};
    const latencyMs = Date.now() - startedAt;
    if (!result.providerOk) {
      recordOperation({ operationType: taskType, provider: 'anthropic', model: ANTHROPIC_MODEL, ok: false, creditCost: creditReserved ? creditCost : null, creditsCharged: 0, latencyMs, projectId, accountId: req.accountId, anonId });
      if (creditReserved) credits.releaseCredits(db, req.accountId, creditCost);
      return res.status(200).json({ ok: false, configured: true });
    }
    const succeeded = result.ok;
    recordOperation({ operationType: taskType, provider: 'anthropic', model: result.model, ok: succeeded, inputTokens: usage.input_tokens, outputTokens: usage.output_tokens, cacheReadTokens: usage.cache_read_input_tokens, cacheWriteTokens: usage.cache_creation_input_tokens, creditCost: creditReserved ? creditCost : null, creditsCharged: (creditReserved && succeeded) ? creditCost : 0, latencyMs, projectId, accountId: req.accountId, anonId });
    if (creditReserved) { if (succeeded) credits.commitCredits(db, req.accountId, creditCost); else credits.releaseCredits(db, req.accountId, creditCost); }
    return res.json(succeeded ? { ok: true, plan: result.plan, creditsCharged: (creditReserved && succeeded) ? creditCost : 0, creditsRemaining: req.accountId ? creditsSummaryFor(req.accountId).remaining : null } : { ok: false, configured: true });
  } catch (error) {
    recordOperation({ operationType: taskType, provider: 'anthropic', model: ANTHROPIC_MODEL, ok: false, creditCost: creditReserved ? creditCost : null, creditsCharged: 0, latencyMs: Date.now() - startedAt, projectId, accountId: req.accountId, anonId });
    if (creditReserved) credits.releaseCredits(db, req.accountId, creditCost);
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
  const creditCost = creditCostForTask(taskType);
  let creditReserved = false;
  if (creditCost > 0) {
    const creditReservation = credits.reserveCredits(db, req.accountId, creditCost, SITEREMADE_DAILY_FREE_CREDITS);
    if (!creditReservation.ok) {
      return res.status(200).json({ ok: false, limited: true, creditsExceeded: true, claudeDirectionsRemaining: null, creditsRemaining: creditReservation.remaining, message: 'This account has used its daily credit allowance -- more opens up tomorrow (UTC).' });
    }
    creditReserved = true;
  }
  const text = clean(req.body.text, 600);
  if (!text) {
    if (creditReserved) credits.releaseCredits(db, req.accountId, creditCost); // never charged for a request that never reached generation
    return res.status(400).json({ ok: false, message: 'Missing business description.' });
  }
  if (!anthropicProvider.configured()) {
    // The credit was reserved above for a REAL generation attempt -- the
    // client's deterministic engine is about to produce this direction
    // regardless of Claude's availability, so commit now rather than
    // leaving the reservation dangling; this response is terminal and the
    // client never retries this exact reservation.
    if (creditReserved) credits.commitCredits(db, req.accountId, creditCost);
    return res.status(200).json({ ok: false, configured: false, message: 'AI-planned generation is not configured on this environment yet.', claudeDirectionsRemaining: null, creditsCharged: creditReserved ? creditCost : 0, creditsRemaining: creditsSummaryFor(req.accountId).remaining });
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
    priorSignatures: entry.signatures.slice(-2),
    visualBudget: visualBudgetForRemainingCredits(creditsSummaryFor(req.accountId).remaining)
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
      recordPlannerAttempt({ outcome: 'malformed_output', latencyMs, model: model || null });
      recordOperation({ operationType: taskType, provider: 'anthropic', model: model || ANTHROPIC_MODEL, ok: false, inputTokens: usage.input_tokens, outputTokens: usage.output_tokens, cacheReadTokens: usage.cache_read_input_tokens, cacheWriteTokens: usage.cache_creation_input_tokens, creditCost: creditReserved ? creditCost : null, creditsCharged: 0, latencyMs, projectId, accountId: req.accountId, anonId });
      // Never charge for a plan that produced nothing usable, same "only
      // charge for meaningful completed work" principle the image-credit
      // settlement logic already follows.
      if (creditReserved) credits.releaseCredits(db, req.accountId, creditCost);
      entry.history.push({ at: startedAt, model, latencyMs, success: false, error: 'Planner returned a structurally unusable plan (malformed pages)' });
      if (entry.history.length > 10) entry.history = entry.history.slice(-10);
      console.error('Website planning produced an unusable plan (malformed pages); falling back to deterministic generation.');
      // Same response shape as the catch block below -- the client already
      // treats any ok:false plan-website response as "fall back to
      // deterministic generation," so this is not a new client-side case.
      return res.status(200).json({ ok: false, message: 'The AI planner returned something unusable this time.', claudeDirectionsRemaining: null, creditsRemaining: creditsSummaryFor(req.accountId).remaining });
    }
    recordPlannerAttempt({ outcome: 'success', latencyMs, model: model || null });
    recordOperation({ operationType: taskType, provider: 'anthropic', model: model || ANTHROPIC_MODEL, ok: true, inputTokens: usage.input_tokens, outputTokens: usage.output_tokens, cacheReadTokens: usage.cache_read_input_tokens, cacheWriteTokens: usage.cache_creation_input_tokens, creditCost: creditReserved ? creditCost : null, creditsCharged: creditReserved ? creditCost : 0, latencyMs, projectId, accountId: req.accountId, anonId });
    if (creditReserved) credits.commitCredits(db, req.accountId, creditCost); // reserved -> used, only on real success
    entry.signatures.push(planSignature(plan));
    if (entry.signatures.length > 5) entry.signatures = entry.signatures.slice(-5);
    entry.history.push({ at: startedAt, model, latencyMs, success: true, tokensIn: usage.input_tokens, tokensOut: usage.output_tokens });
    if (entry.history.length > 10) entry.history = entry.history.slice(-10);
    return res.json({ ok: true, plan, claudeDirectionsRemaining: null, creditsCharged: creditReserved ? creditCost : 0, creditsRemaining: creditsSummaryFor(req.accountId).remaining, meta: { model, latencyMs } });
  } catch (error) {
    const latencyMs = Date.now() - startedAt;
    recordPlannerAttempt({ outcome: 'error', latencyMs, errorCategory: categorizeAnthropicError(error) });
    recordOperation({ operationType: taskType, provider: 'anthropic', model: ANTHROPIC_MODEL, ok: false, creditCost: creditReserved ? creditCost : null, creditsCharged: 0, latencyMs, projectId, accountId: req.accountId, anonId });
    if (creditReserved) credits.releaseCredits(db, req.accountId, creditCost); // a failed attempt never permanently consumes a credit
    entry.history.push({ at: startedAt, latencyMs, success: false, error: String(error && error.message || error) });
    if (entry.history.length > 10) entry.history = entry.history.slice(-10);
    console.error('Website planning failed:', error);
    return res.status(200).json({ ok: false, message: 'Could not reach the AI planner right now.', claudeDirectionsRemaining: null, creditsRemaining: creditsSummaryFor(req.accountId).remaining });
  }
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

    const intentResult = purchase.createPurchaseIntent(db, { ownerId: req.accountId, projectId, amount: SITEREMADE_WEBSITE_PRICE_CENTS, currency: SITEREMADE_WEBSITE_PRICE_CURRENCY });
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
      const fulfillment = purchase.fulfillBySessionId(db, session.id);
      // Only on a FIRST-TIME fulfillment (never on Stripe's own documented
      // at-least-once redelivery of the same event) -- an
      // already-fulfilled intent must never re-send this email.
      if (fulfillment.ok && !fulfillment.alreadyFulfilled && fulfillment.ownerEmail) {
        const origin = `${req.protocol}://${req.get('host')}`;
        sendPurchaseConfirmationEmail({
          to: fulfillment.ownerEmail, projectName: fulfillment.projectName,
          myWebsitesUrl: `${origin}/#my-websites`,
        }).catch(error => console.error('Purchase confirmation email failed to send:', error));
      }
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

// ---- PREMIUM_GENERATION_V1: whole-site review + ONE surgical repair round ------------------------------
// Called once by the client after the first render. Server-side so the same review/repair core (and the same
// budget governor and USD ledger) serves the generator and the Workplace updater. Repair images are paid by the
// platform (accountId:null: no customer credits), bounded by HARD_SITE_BUDGET_USD; nothing about cost is returned
// to the customer.
async function anthropicSmallCall({ model, system, user, tool, maxTokens, taskType, projectId, generationId, phase }) {
  const startedAt = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25000);
  try {
    const body = { model, max_tokens: maxTokens || 700, thinking: { type: 'disabled' }, system, messages: [{ role: 'user', content: user }] };
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
  const direction = req.body.direction;
  if (!direction || typeof direction !== 'object' || !Array.isArray(direction.pages)) return res.status(400).json({ ok: false, message: 'Missing site.' });
  const description = clean(req.body.description, 1500);
  const facts = (req.body.facts && typeof req.body.facts === 'object') ? { years: !!req.body.facts.years, rating: !!req.body.facts.rating, count: !!req.body.facts.count } : {};
  const projectId = clean(req.body.projectId, 60);
  const session = premiumSession(generationId, { categoryKey: clean(req.body.categoryKey, 30), archetype: clean(req.body.archetype, 40), description, palette: (direction.design && direction.design.palette) || {}, facts, projectId });
  const cheapModel = premiumCore.cfg.models.cheap, strongModel = premiumCore.cfg.models.strong;
  const deps = {
    selfRecorded: true,
    critic: ANTHROPIC_API_KEY ? async ({ system, user, tool }) => anthropicSmallCall({ model: strongModel, system, user, tool, maxTokens: 900, taskType: 'QUALITY_REPAIR', projectId, generationId, phase: 'first_draft' }) : undefined,
    regenerateImage: activeImageProvider.configured() ? async spec => generateImageWithCredits({ accountId: null, prompt: spec.prompt, model: spec.model, quality: spec.quality, aspectRatio: spec.aspectRatio, reservationKey: projectId || generationId, taskType: 'QUALITY_REPAIR', projectId, anonId: null, generationId, premiumTier: 'primary', phase: 'repair' }) : undefined,
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
    const out = await session.reviewAndRepair(direction, { description, facts, strategy: session.strategy, premiumEnabled: true, compositionV2: premiumCore.cfg.compositionV2 }, deps);
    const d = out.direction;
    const patch = {
      copy: d.copy || null,
      sections: (d.pages || []).flatMap(p => (p.sections || []).map(s => ({ pageId: p.id || p.slug, id: s.id, type: s.type, variant: s.variant, copy: s.copy || null }))),
      addedSections: out.actions.filter(a => a.sectionId).map(a => a.sectionId),
      removedSections: out.actions.filter(a => a.kind === 'remove_section').flatMap(a => a.targetIds || [a.targetId]),
      imagePlan: (d.imagePlan || []).map(e => ({ slot: e.slot, sourceType: e.sourceType, focal: e.focal || null, fallbackReason: e.fallbackReason || null })),
      generated: Object.fromEntries(out.actions.filter(a => a.kind === 'regenerate_image' && d.assets && d.assets.generated && d.assets.generated[a.slot] && d.assets.generated[a.slot].dataUrl).map(a => [a.slot, { status: 'ready', dataUrl: d.assets.generated[a.slot].dataUrl }])),
      premiumTokens: (d.design && d.design.premiumTokens) || null,
      dimensions: (d.design && d.design.dimensions) || null,
      premium: d.premium || null,
    };
    const log = session.finish();
    return res.json({ ok: true, generationId, repaired: out.repaired, before: out.before, after: out.after, actions: out.actions.map(a => ({ kind: a.kind, defectCode: a.defectCode, target: a.target || null, downgradedFrom: a.downgradedFrom || null })), skipped: out.skipped, patch, timingsMs: log.timingsMs });
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
app.get('/api/credits', requireAuth, (req, res) => {
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
  const taskType = 'COPY_REWRITE';
  const refineCost = creditCostForTask(taskType);
  let refineReserved = false;
  if (refineCost > 0) {
    const reservation = credits.reserveCredits(db, req.accountId, refineCost, SITEREMADE_DAILY_FREE_CREDITS);
    if (!reservation.ok) return bridgeError(res, 402, 'insufficient_credits', 'You\'ve used today\'s editing allowance. Nothing was changed -- more opens up tomorrow (UTC).', { creditsRemaining: reservation.remaining });
    refineReserved = true;
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
      if (refineReserved) credits.releaseCredits(db, req.accountId, refineCost);
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
    if (applied.imageRequests.length) {
      if (!activeImageProvider.configured()) return fail(503, 'edit_failed', 'This change needs a new image, and new images can\'t be created right now. Nothing on your website was changed.', { reason: 'images_unavailable' });
      for (const imageRequest of applied.imageRequests) {
        // PREMIUM_GENERATION_V1: the Workplace updater shares the generator's premium image path. Route, ratio and tier come
        // from the stored image plan; every edit is its own generation session (its own hard budget), phase 'repair'.
        const planEntry = premiumCore.cfg.enabled ? ((applied.state.directions[directionIndex].imagePlan || []).find(e => e.slot === imageRequest.slot) || null) : null;
        const image = await generateImageWithCredits({
          accountId: req.accountId, prompt: imageRequest.prompt,
          model: (planEntry && planEntry.model) || IMAGE_MODEL_SUPPORT, quality: (planEntry && planEntry.quality) || 'medium', aspectRatio: (planEntry && planEntry.aspectRatio) || imageRequest.aspectRatio,
          generationId: premiumCore.cfg.enabled ? premiumCore.newGenerationId() : null, premiumTier: planEntry && planEntry.tier || null, phase: 'repair',
          // Re-keyed on purpose: the server's real projects.id, not a
          // browser-supplied id (this flow has none) -- see
          // generateImageWithCredits' header comment.
          reservationKey: project.id,
          taskType: 'IMAGE_REGENERATE', projectId: project.id, anonId: null, deferSettlement: true,
        });
        if (!image.ok) {
          if (image.reason === 'credits_exceeded') return fail(402, 'insufficient_credits', 'This change needs a new image, and there aren\'t enough credits left today. Nothing on your website was changed.', { creditsRemaining: image.creditsRemaining });
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
    if (refineReserved) credits.commitCredits(db, req.accountId, refineCost);
    imageSettlements.forEach(s => s.commit());
    recordRefine(true);
    const imageCredits = appliedOperations.filter(o => o.action === 'regenerate-image').reduce((n, o) => n + (o.creditsCharged || 0), 0);
    let creditsRemaining = null;
    try { creditsRemaining = creditsSummaryFor(req.accountId).remaining; } catch (e) { /* informational only -- the edit IS saved; never report it as failed */ }
    return res.json({
      ok: true, revision: saved.project.revision, changeSummary, appliedOperations,
      creditsCharged: (refineReserved ? refineCost : 0) + imageCredits,
      creditsRemaining,
    });
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
  const published = publishedSnapshots.getLatestOwnedPublishedRaw(db, req.accountId, projectId);
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
