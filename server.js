const express = require('express');
const path = require('path');
const crypto = require('crypto');

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
// IS network-reachable from here -- but no ANTHROPIC_API_KEY is set for this
// app to use (this container's own Claude access uses a different, internal
// credential that is not a usable API key for a separate deployed app, and
// is never read or reused here). So `configured()` is honestly false in this
// environment too, and every generation falls back to the real V7
// deterministic engine -- nothing is faked.
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

const HERO_KEYS = ['split','fullbleed-image','centered-oversized','stacked-image-below','asymmetric-offset','minimal-text-only','grid-dashboard','poster','collage','product-screenshot'];
const TYPE_KEYS = ['geo-sans','serif-editorial','display-condensed','classic-serif-mix','mono-technical','humanist'];
const NAV_KEYS = ['inline','boxed-pill','minimal-until-scroll','sidebar','centered-logo'];
const CARD_KEYS = ['flat','bordered','elevated-shadow','image-led','numbered-editorial','outline-ghost'];
const IMAGERY_KEYS = ['abstract-geometric','photo-led-placeholder','illustration','texture-organic','grid-mosaic','technical-network','editorial-bold','atmospheric-warm','trade-proof','chart-financial','nature-cause','creative-collage','dashboard-ui'];
const CTA_KEYS = ['solid-pill','sharp-block','outline-ghost','underline-link','floating-badge'];
const COLOR_BEHAVIOR_KEYS = ['neutral-single-accent','high-contrast-mono-accent','warm-earth-multi-tone','dark-luxury-metallic'];
const MOTION_KEYS = ['none','subtle','expressive'];
const SPACING_KEYS = ['standard','compact','airy','generous'];
const PATTERN_KEYS = ['standard','proof-first','story-first','portfolio-first'];
const SECTION_TYPE_KEYS = ['proof','metrics','services','features','productShowcase','integrations','pricing','faq','process','gallery','caseStudies','imageLedEditorial','about','team','testimonial','testimonialsGrid','menu','reservationCta','serviceAreas','contact','newsletter','ctaBanner'];
const IMAGE_ROLE_KEYS = ['hero','product','team','gallery'];
const FUNCTIONALITY_STATUS_KEYS = ['supportedNow','plannedIntegration','requiresCustomBuild'];

const WEBSITE_PLAN_TOOL = {
  name: 'submit_website_plan',
  description: 'Submit a structured plan for a small-business marketing website. Return structure and copy only -- never HTML, CSS, or code.',
  input_schema: {
    type: 'object',
    additionalProperties: false,
    required: ['business', 'heroCopy', 'visualDirection', 'pages', 'imagePlan', 'functionalityPlan'],
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
      visualDirection: {
        type: 'object', additionalProperties: false,
        required: ['hero', 'typography', 'nav', 'card', 'imagery', 'cta', 'colorBehavior', 'motion', 'spacing', 'pattern', 'rationale'],
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
          rationale: { type: 'string', description: 'One sentence: why this direction suits this business.' }
        }
      },
      pages: {
        type: 'array', minItems: 1, maxItems: 8,
        description: 'Only the pages this specific business actually needs -- a local contractor might need 3, a SaaS company or an editorial fashion brand may need more. Do not default to a fixed count.',
        items: {
          type: 'object', additionalProperties: false,
          required: ['id', 'label', 'purpose', 'sections'],
          properties: {
            id: { type: 'string' }, label: { type: 'string' }, purpose: { type: 'string' },
            sections: {
              type: 'array', minItems: 2, maxItems: 10,
              items: {
                type: 'object', additionalProperties: false,
                required: ['type', 'headline'],
                properties: {
                  type: { type: 'string', enum: SECTION_TYPE_KEYS },
                  headline: { type: 'string' },
                  subhead: { type: 'string' },
                  body: { type: 'string' },
                  ctaLabel: { type: 'string' },
                  claims: {
                    type: 'array', maxItems: 6,
                    description: 'Any factual claim this section\'s copy relies on (a number, a named client, a certification, a guarantee). sourced:true ONLY if it came directly from declaredFacts.',
                    items: {
                      type: 'object', additionalProperties: false, required: ['text', 'sourced'],
                      properties: { text: { type: 'string' }, sourced: { type: 'boolean' } }
                    }
                  }
                }
              }
            }
          }
        }
      },
      imagePlan: {
        type: 'array', maxItems: 8,
        items: {
          type: 'object', additionalProperties: false,
          required: ['role', 'intent', 'prompt', 'aspectRatio'],
          properties: {
            role: { type: 'string', enum: IMAGE_ROLE_KEYS },
            intent: { type: 'string' },
            prompt: { type: 'string', description: 'A specific, vivid image-generation prompt for this exact business -- never a generic phrase.' },
            aspectRatio: { type: 'string', enum: ['16:9', '4:3', '1:1'] }
          }
        }
      },
      functionalityPlan: {
        type: 'array', maxItems: 8,
        description: 'What this business would reasonably need the site to DO. Only "supportedNow" for a contact/lead form and static content -- anything needing a live backend, payments, real bookings/reservations or logins is plannedIntegration or requiresCustomBuild. Never claim a system exists that does not.',
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

const PLANNER_SYSTEM_PROMPT = `You are SiteRemade's website-planning engine. Given a short small-business description, reason about what THIS specific business needs and call submit_website_plan with a structured plan -- never HTML, CSS, or code.

Rules:
1. Never invent a fact. Customer counts, ratings, years in business, awards, certifications, revenue, named clients, testimonials, specific locations, staff, or guarantees may ONLY appear if they are literally present in the business owner's own description (echoed to you as declaredFacts/extracted signals). Persuasive marketing copy is welcome; fabricated facts are not. Every claim your copy depends on must be listed in that section's claims array with sourced:true only when it truly came from the input.
2. Reason about the actual business -- do not default to a generic template or a fixed page/section count. A premium AI logistics company, a neighborhood roofer, and an editorial fashion label should end up structurally different: different pages, different section choices and order, different density, different hero, different motion.
3. Every enum field must be a real, considered choice, not a random pick -- explain your visual direction in one sentence (rationale).
4. functionalityPlan must be honest: SiteRemade can render a contact/lead form and static content today. Booking, payments, ecommerce, portals, and live integrations do not exist yet -- mark them plannedIntegration or requiresCustomBuild, never supportedNow.
5. Keep copy concise and genuinely specific to this business -- avoid generic filler like "a modern website that makes your business obvious" unless the input truly gives you nothing else to work with.`;

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
          max_tokens: 4096,
          thinking: { type: 'disabled' },
          system: PLANNER_SYSTEM_PROMPT,
          messages: [{ role: 'user', content: buildPlannerUserPrompt(brief) }],
          tools: [WEBSITE_PLAN_TOOL],
          tool_choice: { type: 'tool', name: 'submit_website_plan' }
        }),
        signal: controller.signal
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error((data && data.error && data.error.message) || `Anthropic returned ${response.status}`);
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
  const pageSummary = (plan.pages || []).map(p => `${p.id}:[${(p.sections || []).map(s => s.type).join(',')}]`).join(' ');
  return `hero=${vd.hero} type=${vd.typography} imagery=${vd.imagery} color=${vd.colorBehavior} motion=${vd.motion} pattern=${vd.pattern} pages=${pageSummary}`.slice(0, 400);
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

app.post('/api/plan-website', async (req, res) => {
  const anonId = ensureAnonId(req, res);
  const entry = getDirectionsLedgerEntry(anonId);
  if (!anthropicProvider.configured()) {
    return res.status(200).json({ ok: false, configured: false, message: 'AI-planned generation is not configured on this environment yet.', claudeDirectionsRemaining: Math.max(0, MAX_DIRECTIONS - entry.claudeDirectionsUsed) });
  }
  if (entry.claudeDirectionsUsed >= MAX_DIRECTIONS) {
    // Enforced here, server-side, BEFORE any model call -- a real brake on
    // Claude usage specifically for this anonymous visitor, independent of
    // (and in addition to) the client's own overall 3-direction-total cap.
    // The client is expected to fall back to the deterministic engine on
    // this response -- which still produces a real direction for the
    // visitor, it just doesn't ask Claude to plan it.
    return res.status(200).json({ ok: false, limited: true, claudeDirectionsRemaining: 0, message: 'This visitor has used their Claude-planned directions for now.' });
  }
  const text = clean(req.body.text, 600);
  if (!text) return res.status(400).json({ ok: false, message: 'Missing business description.' });
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
    entry.claudeDirectionsUsed += 1;
    entry.signatures.push(planSignature(plan));
    if (entry.signatures.length > 5) entry.signatures = entry.signatures.slice(-5);
    entry.history.push({ at: startedAt, model, latencyMs, success: true, tokensIn: usage.input_tokens, tokensOut: usage.output_tokens });
    if (entry.history.length > 10) entry.history = entry.history.slice(-10);
    return res.json({ ok: true, plan, claudeDirectionsRemaining: Math.max(0, MAX_DIRECTIONS - entry.claudeDirectionsUsed), meta: { model, latencyMs } });
  } catch (error) {
    const latencyMs = Date.now() - startedAt;
    entry.history.push({ at: startedAt, latencyMs, success: false, error: String(error && error.message || error) });
    if (entry.history.length > 10) entry.history = entry.history.slice(-10);
    console.error('Website planning failed:', error);
    // A failed attempt does NOT consume one of this visitor's Claude
    // attempts -- only a real returned plan does. The direction itself
    // still gets created by the client's deterministic fallback.
    return res.status(200).json({ ok: false, message: 'Could not reach the AI planner right now.', claudeDirectionsRemaining: Math.max(0, MAX_DIRECTIONS - entry.claudeDirectionsUsed) });
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
