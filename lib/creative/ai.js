'use strict';
// CREATIVE — AI direction (server only). Two model steps, both through structured tool output:
//
//   understand(brief)   the cheap model resolves WHAT the page is about before anything is looked up:
//                       identity (and whether it is real, fictional, personal or invented), tone,
//                       audience, visual motifs, research titles/queries, uncertainty, and a short
//                       clarification question only when a wrong guess would change the page.
//   direct(input)       the strong model directs the whole page as a v2 scene plan: concept, hero,
//                       scenes (any number, structure and pacing), layers from the REAL asset inventory
//                       (it is shown small thumbnails, so it judges what each picture depicts), words
//                       grounded in the given facts and the owner's details, motion, mobile and
//                       reduced-motion intent. The plan is validated (validate2.js); if it cannot be
//                       shown honestly, ONE repair call is made with the exact problems; then the caller
//                       falls back to the deterministic director and says so.
//
// Credentials never leave the server: this module receives a `call` function from server.js.
// Every call is metered (tokens, estimated USD from the configured prices, latency) and limited by
// explicit, configurable caps (see limits()).

const { VOCAB, LIMITS, validatePlan2 } = require('./validate2');

// ---------------------------------------------------------------- limits and cost
function limits(env) {
  const e = env || process.env; const n = (v, d) => (Number.isFinite(Number(v)) && v !== '' && v != null ? Number(v) : d);
  const off = v => ['0', 'false', 'off', 'no'].includes(String(v == null ? '' : v).toLowerCase());
  return {
    enabled: !off(e.CREATIVE_AI_DIRECTION),
    understandModel: e.CREATIVE_MODEL_UNDERSTAND || e.PREMIUM_MODEL_CHEAP || 'claude-haiku-4-5-20251001',
    directorModel: e.CREATIVE_MODEL_DIRECTOR || e.PREMIUM_MODEL_STRONG || e.ANTHROPIC_MODEL || 'claude-sonnet-5',
    directorMaxTokens: n(e.CREATIVE_DIRECTOR_MAX_TOKENS, 9000),
    understandMaxTokens: n(e.CREATIVE_UNDERSTAND_MAX_TOKENS, 1600),
    repairs: Math.max(0, Math.min(2, n(e.CREATIVE_MAX_REPAIRS, 1))),
    timeoutMs: n(e.CREATIVE_AI_TIMEOUT_MS, 100000),
    dailyUsdCap: n(e.CREATIVE_DAILY_USD_CAP, 6),            // all Creative AI calls on this server, per UTC day
    accountDailyPlans: n(e.CREATIVE_ACCOUNT_DAILY_PLANS, 20), // direction calls per account per UTC day (repairs included)
    thumbnails: Math.max(0, Math.min(12, n(e.CREATIVE_MAX_THUMBNAILS, 10))),
    prices: {
      strong: { input: n(e.PREMIUM_PRICE_STRONG_INPUT, 3), output: n(e.PREMIUM_PRICE_STRONG_OUTPUT, 15), cacheRead: n(e.PREMIUM_PRICE_STRONG_CACHE_READ, 0.3), cacheWrite: n(e.PREMIUM_PRICE_STRONG_CACHE_WRITE, 3.75) },
      cheap: { input: n(e.PREMIUM_PRICE_CHEAP_INPUT, 1), output: n(e.PREMIUM_PRICE_CHEAP_OUTPUT, 5), cacheRead: n(e.PREMIUM_PRICE_CHEAP_CACHE_READ, 0.1), cacheWrite: n(e.PREMIUM_PRICE_CHEAP_CACHE_WRITE, 1.25) },
    },
  };
}
// ESTIMATED USD from token usage and the configured per-million prices (the invoice is the real charge)
function estimateUsd(usage, price) {
  const u = usage || {}; const M = 1e6;
  return +(((u.input_tokens || 0) * price.input + (u.output_tokens || 0) * price.output + (u.cache_read_input_tokens || 0) * price.cacheRead + (u.cache_creation_input_tokens || 0) * price.cacheWrite) / M).toFixed(5);
}

// ---------------------------------------------------------------- understanding
const UNDERSTAND_SYSTEM = `You read a brief for a one-page, image-led, animated website and work out exactly what it is about BEFORE anything is researched. You never write the page.

Rules:
- Resolve identity first. "Zelda" may be the franchise, one game or the character; pick from context ("the games", "Breath of the Wild", "princess") and say which. Give the exact English Wikipedia article title(s) that match THAT identity, best first.
- A personal subject ("my dog Rex", "our grandad Frank", "my goldfish Bubbles") is the owner's own pet/person. NEVER map it to a public figure or a famous animal that shares the name. Research, if any, is only the general topic (e.g. the species), and it is marked as general.
- An invented or joke concept ("a country run by cats", a meme idea) is invented: no factual research about it unless the brief refers to a real internet phenomenon with an article.
- Never substitute an easier or better-documented subject.
- Ask a clarification only when a wrong identity would materially change the page and the brief gives no way to tell. Otherwise choose, and record the uncertainty.
- research.scope: "subject" for anything real or fictional that has its own article (an everyday object, a game, an event, a meme); "general-topic" ONLY for a personal subject, whose own story is not researched but whose type may be (e.g. goldfish); "none" for invented concepts.
- Commons queries: at most 3, for pictures that would genuinely belong on the page (the subject itself, its setting, its signature objects). Short, concrete, searchable words.
- Motifs: visual ideas that truly belong to the subject (shapes, materials, colours, settings, symbols) -- not generic mood words.
- Tone: take it from the brief. If the brief does not say, choose what suits the subject; a serious subject is treated seriously.`;

const UNDERSTAND_TOOL = {
  name: 'submit_creative_understanding',
  description: 'What the brief is about, resolved before research.',
  input_schema: {
    type: 'object', required: ['identity', 'research', 'tone', 'motifs'],
    properties: {
      identity: { type: 'object', required: ['name', 'kind', 'confidence'], properties: {
        name: { type: 'string', description: 'The subject as the page will name it.' },
        kind: { type: 'string', enum: ['recognizable', 'fictional', 'personal', 'invented'] },
        what: { type: 'string', description: 'One line: exactly which thing this is (e.g. "the Nintendo video game franchise, not a single game").' },
        confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
        ownerSubject: { type: 'object', description: 'Personal subjects only.', properties: { name: { type: 'string' }, type: { type: 'string', description: 'e.g. goldfish, grandfather' } } },
      } },
      clarify: { type: 'object', properties: { needed: { type: 'boolean' }, question: { type: 'string' }, options: { type: 'array', maxItems: 5, items: { type: 'object', properties: { label: { type: 'string' }, wikipediaTitle: { type: 'string' }, description: { type: 'string' } } } } } },
      research: { type: 'object', required: ['scope'], properties: {
        scope: { type: 'string', enum: ['subject', 'general-topic', 'none'] },
        wikipediaTitles: { type: 'array', maxItems: 3, items: { type: 'string' } },
        commonsQueries: { type: 'array', maxItems: 3, items: { type: 'string' } },
        note: { type: 'string' },
      } },
      tone: { type: 'object', required: ['register'], properties: {
        register: { type: 'string', enum: ['extravagant', 'cinematic', 'playful', 'absurd', 'tender', 'restrained', 'lyrical', 'editorial', 'retro', 'serious', 'reverent'] },
        words: { type: 'array', maxItems: 5, items: { type: 'string' } },
        fromBrief: { type: 'boolean', description: 'true if the brief asked for this tone' },
      } },
      audience: { type: 'string' },
      motifs: { type: 'array', maxItems: 8, items: { type: 'string' } },
      uncertainty: { type: 'array', maxItems: 5, items: { type: 'string' } },
    },
  },
};

// ---------------------------------------------------------------- direction
const DIRECTOR_SYSTEM = `You are the creative director of SiteRemade Creative. You design ONE image-led, animated web page about the given subject, as structured data for a fixed renderer. You make the visual and editorial decisions; the renderer only executes them.

WHAT GOOD LOOKS LIKE
- Moving imagery carries the page; words support it. The subject is the focal point of the opening scene and stays prominent.
- A specific concept, not a template: a named idea (e.g. "The Last Roll Standing: a coronation for the humblest object") that decides the look, the scenes and the motion.
- Scenes, each with a reason to exist and a link to the next. Choose how many (2-9), their order, heights and pacing for THIS subject and tone: a restrained subject may need four quiet scenes; an extravagant one may need a pinned, scroll-scrubbed reveal. Do not default to facts -> history -> gallery -> closing.
- Coordinated motion: one focal movement, supporting movement, and resting moments. Never everything moving at once. Tempo "still" is valid for solemn subjects.
- Tone comes from the brief: beautiful, cinematic, ridiculous or restrained. Serious subjects are not joked about. Do not turn subjects into shops, museums or businesses.
- Avoid dashboards, fake interfaces, rows of identical cards and floating photo rectangles. A flat photo is framed deliberately (mask) or used as a full backdrop.

THE MECHANICS YOU CAN USE (per scene)
- height: screen | tall | short | auto. pin: true (only with tall) holds the scene while scroll scrubs its layers -- use for a reveal or a transformation, at most 3 per page.
- camera: none | push-in | pull-out | pan-left | pan-right | rise (moves the whole stage with scroll).
- background: base | deep | invert | tint | accent (per scene, for rhythm).
- layers (max ${LIMITS.layersPerScene} per scene): kind image (asset id from the inventory), shape (drawn: ${VOCAB.shape.join(', ')}; fill ${VOCAB.fill.join('/')}; stroke), or word (a giant word or number, max 24 chars, style solid/outline/ghost).
  role focal | support | backdrop | texture | echo. box.d and box.m are [x, y, w, h] in % of the desktop stage (16:10) and the phone stage (about 9:10); backdrop/texture layers may bleed (-30..130).
  mask: ${VOCAB.mask.join(', ')}. treatment: ${VOCAB.treatment.join(', ')}. rotate (-45..45), opacity, z (1-9).
  entrance: ${VOCAB.entrance.join(', ')} (+ delay, dur seconds). loop: ${VOCAB.loop.join(', ')} (+ amp 0-3, period 3-30 s) -- at most ${LIMITS.loopsPerScene} looping layers per scene. scroll: ${VOCAB.scroll.join(', ')} (+ amount -1..1).
- text: kicker (<=${LIMITS.kicker} chars), heading (<=${LIMITS.heading}), body (<=${LIMITS.body}), items (<=${LIMITS.items}, each <=${LIMITS.item}, optional short label such as a year or a name), list style ${VOCAB.list.join('/')}, region ${VOCAB.region.join('/')}, size display|large|medium|small, width narrow|medium|wide, entrance rise|fade|split-words|none.
- mobile.order: text-first | stage-first. Every layer needs a phone box; hideM hides a secondary layer on phones.
- Page level: palette (bg, bg2, ink, muted, accent, glow as #rrggbb; readable), type.display ${VOCAB.display.join('/')}, type.scale monumental|large|quiet, type.case, atmosphere (backdrop ${VOCAB.backdrop.join('/')}; light; particles ${VOCAB.particles.join('/')}; density 0-1; grain), motion.tempo still|slow|measured|lively, thread (${VOCAB.thread.join('/')}: a line that runs down the page between scenes; "none" is fine).
The renderer automatically makes a complete still version for reduced motion; plan a composition that reads well when nothing moves.

COMPOSITION RULES
- The focal layer is large: in the opening scene it covers roughly a quarter of the desktop stage or more, and it never sits under the words. Put words in a region clear of it (e.g. text left, focal box starting at x>=50). On phones, words and stage are stacked, so phone boxes can use the full stage.
- For a focal subject, prefer an asset with "transparent": true when it clearly shows the subject: it can stand, float and move on the stage. A flat photo as focal gets a deliberate mask chosen for the concept (arch, circle, frame, porthole, polaroid, torn, blob, window, slit) or becomes a full-bleed backdrop -- never mask "none".
- A picture can be reused across scenes for continuity (a different crop, mask, scale or treatment), but a photo appears at most ${LIMITS.photoUses} times and a cutout at most ${LIMITS.cutoutUses} times. Never repeat a photo as filler.
- Drawn shapes and giant words are real design tools: use them to build the scene when pictures are thin, not as decoration everywhere.
- Most scenes need a real visual event that fills its stage with intent (a picture, a composition of shapes at scale, a giant word or number that moves). A resting scene may be sparse on purpose, but not every scene: a lone thin line beside a paragraph is not a composition.

HONESTY
- Use ONLY asset ids from the inventory. Look at each thumbnail and fill assetNotes: what it actually depicts, and whether it matches the subject (yes/partly/no/unsure). A filename is not proof. Do not use pictures that do not show what the page says they show.
- "transparent": true means the subject can move freely on the stage; otherwise it is a flat rectangle -- mask it, frame it or use it as a backdrop. Do not ask for cutouts that are not in the inventory.
- List in "wants" the pictures you would ideally use; mark each fulfilled with an asset id or say what you did instead. If the subject itself has no usable picture, compose deliberately with shapes, words and atmosphere, and add a limitation (the studio will ask the owner for an upload).
- Personal subjects: only the owner's own uploads show them; only the owner's words describe them; never invent their appearance, history, personality, quotes or memories. A line is "supplied" only if it closely restates what the owner wrote; any embellishment ("endlessly curious") makes it "imagined". General facts about their species/type are labelled as general.
- Facts: every factual sentence is kind "sourced" with the exact fact id it rests on (cite). Rephrase facts into the page's voice, concisely, without changing their meaning. Owner details are kind "supplied". Everything you invent (headlines, taglines, jokes, invented-world lore) is kind "imagined" and must not read as a factual claim.
- For fictional subjects, facts describe the fiction as the source reports it; do not present them as real-world events.
- Never invent quotes, product claims, statistics, endorsements or official status. Never truncate a sentence: write shorter ones.
- Headings, kickers, labels and imagined lines may NOT introduce facts of their own: no numbers, dates, measurements, comparisons ("bigger than...", "as tall as...") or claims unless the same scene cites a fact that states exactly that. Mood, metaphor and invitation are fine; new information is not.
- Research is material for the direction, not a list to paste: use the facts that serve the concept; leave the rest.
- The page is unofficial and says so in its footer (the renderer adds this).`;

function scenesSchema() {
  const box = { type: 'array', items: { type: 'number' }, minItems: 4, maxItems: 4 };
  const layer = { type: 'object', required: ['kind', 'role', 'box'], properties: {
    id: { type: 'string' }, kind: { type: 'string', enum: VOCAB.layerKind }, role: { type: 'string', enum: VOCAB.role },
    asset: { type: 'string', description: 'image layers: an asset id from the inventory' },
    shape: { type: 'object', properties: { form: { type: 'string', enum: VOCAB.shape }, fill: { type: 'string', enum: VOCAB.fill }, stroke: { type: 'boolean' } } },
    word: { type: 'object', properties: { text: { type: 'string' }, style: { type: 'string', enum: VOCAB.wordStyle } } },
    box: { type: 'object', required: ['d', 'm'], properties: { d: box, m: box } },
    fit: { type: 'string', enum: VOCAB.fit }, focus: { type: 'string', description: '"x% y%" crop focus for cover' },
    mask: { type: 'string', enum: VOCAB.mask }, treatment: { type: 'string', enum: VOCAB.treatment },
    rotate: { type: 'number' }, opacity: { type: 'number' }, z: { type: 'integer' }, hideM: { type: 'boolean' },
    entrance: { type: 'object', properties: { kind: { type: 'string', enum: VOCAB.entrance }, delay: { type: 'number' }, dur: { type: 'number' } } },
    loop: { type: 'object', properties: { kind: { type: 'string', enum: VOCAB.loop }, amp: { type: 'number' }, period: { type: 'number' } } },
    scroll: { type: 'object', properties: { kind: { type: 'string', enum: VOCAB.scroll }, amount: { type: 'number' } } },
  } };
  const item = { type: 'object', required: ['text', 'kind'], properties: { label: { type: 'string' }, text: { type: 'string' }, kind: { type: 'string', enum: VOCAB.copyKind }, cite: { type: 'string' } } };
  return { type: 'array', minItems: LIMITS.scenes[0], maxItems: LIMITS.scenes[1], items: { type: 'object', required: ['id', 'purpose', 'height', 'layers', 'text'], properties: {
    id: { type: 'string' }, name: { type: 'string' }, purpose: { type: 'string', description: 'why this scene exists' }, link: { type: 'string', description: 'how it follows from the previous scene' }, navLabel: { type: 'string' },
    height: { type: 'string', enum: VOCAB.height }, pin: { type: 'boolean' }, camera: { type: 'string', enum: VOCAB.camera }, background: { type: 'string', enum: VOCAB.sceneBg }, atmosphere: { type: 'boolean' },
    mobile: { type: 'object', properties: { order: { type: 'string', enum: VOCAB.mobileOrder } } },
    cta: { type: 'string', description: 'first scene only: a short label for the scroll-on link' },
    layers: { type: 'array', maxItems: LIMITS.layersPerScene, items: layer },
    text: { type: 'object', properties: { kicker: { type: 'string' }, heading: { type: 'string' }, body: { type: 'string' }, kind: { type: 'string', enum: VOCAB.copyKind }, cite: { type: 'string' }, items: { type: 'array', maxItems: LIMITS.items, items: item }, list: { type: 'string', enum: VOCAB.list }, region: { type: 'string', enum: VOCAB.region }, size: { type: 'string', enum: VOCAB.textSize }, width: { type: 'string', enum: VOCAB.textWidth }, entrance: { type: 'string', enum: VOCAB.textEntrance } } },
  } } };
}
const HEXS = { type: 'string', pattern: '^#[0-9a-fA-F]{6}$' };
const DIRECTOR_TOOL = {
  name: 'submit_creative_plan',
  description: 'The whole page, as scenes for the renderer.',
  input_schema: {
    type: 'object', required: ['identity', 'concept', 'palette', 'type', 'atmosphere', 'motion', 'scenes', 'assetNotes'],
    properties: {
      identity: { type: 'object', properties: { name: { type: 'string' }, kind: { type: 'string', enum: ['recognizable', 'fictional', 'personal', 'invented'] }, note: { type: 'string' } } },
      concept: { type: 'object', required: ['title', 'logline'], properties: { title: { type: 'string' }, logline: { type: 'string' }, why: { type: 'string', description: 'why this concept suits this subject and brief' } } },
      palette: { type: 'object', required: ['bg', 'bg2', 'ink', 'muted', 'accent', 'glow'], properties: { bg: HEXS, bg2: HEXS, ink: HEXS, muted: HEXS, accent: HEXS, glow: HEXS } },
      type: { type: 'object', properties: { display: { type: 'string', enum: VOCAB.display }, scale: { type: 'string', enum: VOCAB.typeScale }, case: { type: 'string', enum: VOCAB.typeCase } } },
      atmosphere: { type: 'object', properties: { backdrop: { type: 'string', enum: VOCAB.backdrop }, light: { type: 'string', enum: VOCAB.light }, particles: { type: 'string', enum: VOCAB.particles }, density: { type: 'number' }, grain: { type: 'boolean' } } },
      motion: { type: 'object', properties: { tempo: { type: 'string', enum: VOCAB.tempo }, signature: { type: 'string', description: 'the one movement people will remember' } } },
      thread: { type: 'object', properties: { kind: { type: 'string', enum: VOCAB.thread } } },
      assetNotes: { type: 'array', items: { type: 'object', required: ['asset', 'depicts', 'matches'], properties: { asset: { type: 'string' }, depicts: { type: 'string' }, matches: { type: 'string', enum: VOCAB.matches }, useFor: { type: 'string' } } } },
      wants: { type: 'array', maxItems: 8, items: { type: 'object', properties: { description: { type: 'string' }, role: { type: 'string' }, asset: { type: 'string' }, fallback: { type: 'string' } } } },
      limitations: { type: 'array', maxItems: 6, items: { type: 'string' } },
      scenes: scenesSchema(),
    },
  },
};

// ---------------------------------------------------------------- prompts (user content)
function understandContent(input) {
  return [{ type: 'text', text: `BRIEF:\n${String(input.brief || '').slice(0, 1200)}\n\nOWNER-SUPPLIED DETAILS (may be empty):\n${String(input.supplied || '').slice(0, 1500)}\n\nOWNER UPLOADED ${input.uploads ? input.uploads : 'no'} PHOTO(S).${input.choice ? `\n\nTHE OWNER CHOSE THIS IDENTITY WHEN ASKED: ${String(input.choice).slice(0, 160)}` : ''}` }];
}
function inventoryLine(a) {
  const s = a.assess || {};
  return { id: a.id, origin: a.origin, title: String(a.title || '').replace(/^File:/, '').slice(0, 120), description: String(a.description || '').slice(0, 160), size: `${s.width || '?'}x${s.height || '?'}`, orientation: s.orientation, transparent: !!(s.transparent || a.cutout), cutoutOf: a.cutoutOf || undefined, subjectBox: s.subject || undefined, colours: (s.colours || []).slice(0, 3), license: a.license || (a.origin === 'upload' ? 'owner upload' : ''), foundBy: a.found || (a.origin === 'upload' ? 'uploaded by the owner' : '') };
}
function directContent(input) {
  const inv = (input.assets || []).map(inventoryLine);
  const facts = (input.facts || []).slice(0, 30).map(f => ({ id: f.id, section: f.section, text: f.text }));
  const u = input.understanding || {};
  const header = {
    brief: String(input.brief || '').slice(0, 1200),
    understanding: { identity: u.identity || { name: u.subject, kind: u.kind }, tone: u.tone, audience: u.audience, motifs: u.motifs, uncertainty: u.uncertainty, researchScope: u.research && u.research.scope },
    source: input.page ? { title: input.page.title, description: input.page.description, url: input.page.url } : null,
    facts, ownerDetails: input.supplied || { facts: [], memories: [] },
    assets: inv,
    avoid: input.avoid ? `A previous direction for this page was: ${String(input.avoid).slice(0, 600)}. Make a MEANINGFULLY DIFFERENT concept: different structure, scene count or pacing, composition and motion -- same subject, facts and uploads.` : undefined,
  };
  const content = [{ type: 'text', text: `Direct the page. Everything you may use is below.\n\n${JSON.stringify(header, null, 1)}` }];
  (input.thumbnails || []).slice(0, input.maxThumbs || 10).forEach(t => {
    const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(t.dataUrl || ''); if (!m || m[2].length > 220000) return;
    content.push({ type: 'text', text: `Thumbnail of asset "${String(t.id).slice(0, 40)}":` });
    content.push({ type: 'image', source: { type: 'base64', media_type: m[1], data: m[2] } });
  });
  content.push({ type: 'text', text: 'Now submit the plan with submit_creative_plan. Fill assetNotes for every asset you were shown.' });
  return content;
}

// ---------------------------------------------------------------- calls
// call({ model, system, content, tool, maxTokens, timeoutMs }) -> { input, usage, model, ms }
async function understand(input, deps) {
  const L = deps.limits; const t0 = Date.now();
  const r = await deps.call({ model: L.understandModel, system: UNDERSTAND_SYSTEM, content: understandContent(input), tool: UNDERSTAND_TOOL, maxTokens: L.understandMaxTokens, timeoutMs: Math.min(L.timeoutMs, 45000) });
  const usd = estimateUsd(r.usage, pricesFor(L, L.understandModel));
  return { raw: r.input, usage: r.usage, model: r.model, ms: Date.now() - t0, usd };
}
function pricesFor(L, model) { return /haiku/i.test(model) ? L.prices.cheap : L.prices.strong; }

// direct -> { ok, plan, attempts: [{usage, usd, ms, errors}], fixes, warnings, errors, reason }
async function direct(input, deps) {
  const L = deps.limits; const attempts = []; let messages = null; let last = null;
  for (let attempt = 1; attempt <= 1 + L.repairs; attempt++) {
    if (deps.budgetCheck) { const b = deps.budgetCheck(); if (!b.ok) return { ok: false, reason: b.reason, attempts, errors: last && last.errors }; }
    const t0 = Date.now(); let r;
    const content = attempt === 1 ? directContent(input) : null;
    try {
      r = await deps.call({ model: L.directorModel, system: DIRECTOR_SYSTEM, content, messages, tool: DIRECTOR_TOOL, maxTokens: L.directorMaxTokens, timeoutMs: L.timeoutMs, cacheSystem: true });
    } catch (e) {
      attempts.push({ attempt, ms: Date.now() - t0, error: String(e && e.message || e).slice(0, 200) });
      return { ok: false, reason: `the model call failed (${String(e && e.message || e).slice(0, 120)})`, attempts, errors: last && last.errors };
    }
    const usd = estimateUsd(r.usage, pricesFor(L, L.directorModel));
    // a test provider answers as "mock-..." and its plans are labelled MOCKED everywhere downstream
    const v = validatePlan2(Object.assign({}, r.input, { direction: { source: /^mock/i.test(r.model || '') ? 'mock' : (deps.source || 'ai'), model: r.model, at: new Date().toISOString(), attempt, repaired: attempt > 1, seed: input.seed || '' } }), { assets: input.assets, facts: input.facts, understanding: input.understandingLegacy, supplied: [].concat((input.supplied && input.supplied.facts) || [], (input.supplied && input.supplied.memories) || []) });
    attempts.push({ attempt, ms: Date.now() - t0, usage: r.usage, usd, model: r.model, errors: v.errors, fixes: v.fixes.length });
    if (deps.onUsage) deps.onUsage({ attempt, usage: r.usage, usd, model: r.model, ms: Date.now() - t0 });
    last = v;
    if (!v.errors.length) return { ok: true, plan: v.plan, fixes: v.fixes, warnings: v.warnings, attempts, raw: r.input };
    // one bounded repair: the model sees its own plan and the exact problems
    messages = [
      { role: 'user', content: directContent(input) },
      { role: 'assistant', content: [{ type: 'tool_use', id: r.toolUseId || 'plan_1', name: DIRECTOR_TOOL.name, input: r.input }] },
      { role: 'user', content: [{ type: 'tool_result', tool_use_id: r.toolUseId || 'plan_1', is_error: true, content: `The plan cannot be shown as it is. Fix exactly these problems and resubmit the whole plan:\n- ${v.errors.join('\n- ')}` }] },
    ];
  }
  return { ok: false, reason: `the plan still had problems after ${L.repairs} repair attempt(s): ${(last.errors || []).slice(0, 3).join('; ')}`, attempts, errors: last.errors };
}

// the understanding, normalised for research and for the studio (raw model output is data, clamped here)
function normaliseUnderstanding(raw, brief) {
  const r = raw && typeof raw === 'object' ? raw : {}; const s = (v, n) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, n);
  const id = r.identity || {}; const kind = ['recognizable', 'fictional', 'personal', 'invented'].includes(id.kind) ? id.kind : 'recognizable';
  // the owner's own pet or person is never a question about which public "Bubbles" they meant
  const clarify = kind !== 'personal' && r.clarify && r.clarify.needed && Array.isArray(r.clarify.options) && r.clarify.options.length >= 2 ? { question: s(r.clarify.question, 200), options: r.clarify.options.slice(0, 5).map(o => ({ title: s(o.label || o.wikipediaTitle, 120), wikipediaTitle: s(o.wikipediaTitle, 160), description: s(o.description, 200) })).filter(o => o.title) } : null;
  const res = r.research || {}; const scope0 = ['subject', 'general-topic', 'none'].includes(res.scope) ? res.scope : (kind === 'invented' ? 'none' : 'subject');
  // "general-topic" is a personal subject's type; for anything else it means the subject itself
  const scope = scope0 === 'general-topic' && kind !== 'personal' ? 'subject' : scope0;
  const owner = id.ownerSubject || {};
  return {
    kind: clarify ? 'ambiguous' : kind, subject: s(kind === 'personal' ? (owner.name || id.name) : id.name, 120) || s(brief, 80), name: s(owner.name, 80), species: kind === 'personal' ? s(owner.type, 40) || null : null, noun: s(owner.type, 40),
    identity: { name: s(id.name, 120), kind, what: s(id.what, 240), confidence: ['high', 'medium', 'low'].includes(id.confidence) ? id.confidence : 'medium' },
    clarify: kind === 'personal' ? null : clarify, research: { scope: kind === 'personal' && scope === 'subject' ? 'general-topic' : scope, wikipediaTitles: (res.wikipediaTitles || []).slice(0, 3).map(t => s(t, 160)).filter(t => t && !(kind === 'personal' && t.toLowerCase() === s(owner.name || id.name, 80).toLowerCase())), commonsQueries: (res.commonsQueries || []).slice(0, 3).map(t => s(t, 100)).filter(Boolean), note: s(res.note, 200) },
    // a personal subject's NAME is never looked up ("Bubbles" is not the chimpanzee): only its general type is
    query: scope === 'none' ? null : kind === 'personal'
      ? (s(((res.wikipediaTitles || []).find(t => s(t, 160).toLowerCase() !== s(owner.name || id.name, 80).toLowerCase())) || owner.type, 160) || null)
      : (s((res.wikipediaTitles || [])[0] || id.name, 160) || null),
    tone: { register: s(r.tone && r.tone.register, 20) || 'editorial', words: ((r.tone && r.tone.words) || []).slice(0, 5).map(w => s(w, 30)), fromBrief: !!(r.tone && r.tone.fromBrief) },
    audience: s(r.audience, 160), motifs: (r.motifs || []).slice(0, 8).map(m => s(m, 80)).filter(Boolean), uncertainty: (r.uncertainty || []).slice(0, 5).map(m => s(m, 200)).filter(Boolean),
    brief: s(brief, 1200), source: 'ai',
  };
}

module.exports = { limits, estimateUsd, understand, direct, normaliseUnderstanding, UNDERSTAND_TOOL, DIRECTOR_TOOL, UNDERSTAND_SYSTEM, DIRECTOR_SYSTEM, directContent, understandContent, inventoryLine };
