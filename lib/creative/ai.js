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
    claimCheck: !off(e.CREATIVE_CLAIM_CHECK),                  // the cheap model checks every line against the facts
    claimsMaxTokens: n(e.CREATIVE_CLAIMS_MAX_TOKENS, 3000),
    webDiscovery: !off(e.CREATIVE_WEB_DISCOVERY),              // web search for pages that show the exact subject
    webSearches: n(e.CREATIVE_WEB_SEARCHES, 3), webSearchUsd: n(e.CREATIVE_WEB_SEARCH_USD, 0.01), // $10 per 1,000 searches
    curate: !off(e.CREATIVE_CURATE),                           // one cheap vision call chooses the research pictures
    curateMaxTokens: n(e.CREATIVE_CURATE_MAX_TOKENS, 3500),
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
- visuals: say what the page must SHOW. main = the picture the page cannot do without (a character's own likeness, the object itself, the artefact itself); setting = where it lives, if that matters; supporting = up to 4 signature objects, details or related works. Say "none" where a thing has no likeness (an idea, a feeling). visuals.depiction: "artwork" for anything normally seen as drawn, animated, rendered, game or comic art (any cartoon, anime, comic, game or animated character or creature -- even a world-famous one like Mickey Mouse or Kirby), "photo" for a real thing, "none" for no likeness.
- Commons queries: up to 4, for pictures that would genuinely show those visuals. Write them like Wikimedia Commons file names: 2-5 concrete words, the subject's name plus what the picture shows ("Rosetta Stone British Museum", "axolotl aquarium"). For a fictional character or other fictional, branded or trademarked subject, the main visual is its OWN depiction -- artwork, a render, a sprite, an animation or game still -- never a real-world form of it (a cosplayer, figure, statue, plush toy, merchandise, a vehicle painted with it, a logo): those are not the character. Query for the depiction with the subject's name ("Kirby sprite", "Pikachu artwork") and for free scenery or signature objects that fit the page; free depictions are rare, and a web search looks further when Commons has none. For a meme or concept, search the original works or precedents the article names. Never query generic mood words ("adventure landscape"): they return unrelated pictures.
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
        commonsQueries: { type: 'array', maxItems: 4, items: { type: 'string' } },
        note: { type: 'string' },
      } },
      visuals: { type: 'object', description: 'What the page must show.', properties: {
        main: { type: 'string', description: 'The one picture the page cannot do without.' },
        setting: { type: 'string' },
        supporting: { type: 'array', maxItems: 4, items: { type: 'string' } },
        depiction: { type: 'string', enum: ['artwork', 'photo', 'none'], description: 'How the main subject is normally seen: artwork (drawn, animated, rendered, game or comic art -- any cartoon, anime, comic, game or animated character or creature, however famous), photo (a real thing), none (no likeness).' },
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
- Motion serves the pictures you have. With tempo slow, measured or lively, the opening subject has a clear entrance AND an ambient loop. A framed photo or painting cannot turn its head or walk: give it "kenburns" (it drifts and zooms slowly inside its frame). "sheen" passes light across a picture -- the one loop a "still" page keeps. Cut-outs can float, bob, sway or swim. Supporting layers move slower and smaller than the subject, or rest.
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
- group: layers with the same group id are ONE object (a blade and its hilt, a crown on a head, a figure and its shadow): one entrance, loop and scroll for the whole, every part keeping its place relative to the others. Use it whenever parts must not come apart.
- mobile.order: text-first | stage-first. Every layer needs a phone box; hideM hides a secondary layer on phones.
- Page level: palette (bg, bg2, ink, muted, accent, glow as #rrggbb; readable), type.display ${VOCAB.display.join('/')}, type.scale monumental|large|quiet, type.case, atmosphere (backdrop ${VOCAB.backdrop.join('/')}; light; particles ${VOCAB.particles.join('/')}; density 0-1; grain), motion.tempo still|slow|measured|lively, thread (${VOCAB.thread.join('/')}: a line that runs down the page between scenes; "none" is fine).
The renderer automatically makes a complete still version for reduced motion; plan a composition that reads well when nothing moves.

COMPOSITION RULES
- The focal layer is large: in the opening scene it covers roughly a quarter of the desktop stage or more, and it never sits under the words. Put words in a region clear of it (e.g. text left, focal box starting at x>=50). On phones, words and stage are stacked, so phone boxes can use the full stage.
- For a focal subject, prefer an asset with "transparent": true when it clearly shows the subject: it can stand, float and move on the stage. For an independent object, creature or character a clean cut-out is usually the stronger hero than a higher-resolution framed photo; frame a photo (or use it full-bleed) when its setting matters or the frame serves the concept. A flat photo as focal gets a deliberate mask chosen for the concept (arch, circle, frame, porthole, polaroid, torn, blob, window, slit) or becomes a full-bleed backdrop -- never mask "none".
- A picture can be reused across scenes for continuity (a different crop, mask, scale or treatment), but a photo appears at most ${LIMITS.photoUses} times and a cutout at most ${LIMITS.cutoutUses} times. Never repeat a photo as filler.
- Drawn shapes and giant words are real design tools: use them to build the scene when pictures are thin, not as decoration everywhere.
- Most scenes need a real visual event that fills its stage with intent (a picture, a composition of shapes at scale, a giant word or number that moves). A resting scene may be sparse on purpose, but not every scene: a lone thin line beside a paragraph is not a composition.

HONESTY
- Use ONLY asset ids from the inventory. Look at each thumbnail and fill assetNotes: what it actually depicts, and whether it matches the subject (yes/partly/no/unsure). A filename is not proof. Do not use pictures that do not show what the page says they show.
- "transparent": true means the subject can move freely on the stage; otherwise it is a flat rectangle -- mask it, frame it or use it as a backdrop. Do not ask for cutouts that are not in the inventory.
- Pictures with origin "upload" were supplied by the page's owner, who has the right to use them: they are the first choice for the subject's main visual whenever they show it (look at them). Never avoid an upload as "unlicensed" or "unofficial"; describe what it shows accurately (a cosplayer is a cosplayer).
- Research pictures carry the picture check: role (subject / environment / supporting / detail / logo / reference), identity (exact = the subject itself; form = a real-world form of it such as a cosplayer, figure, plush or replica; related) and what it depicts. The opening scene's main visual is a "subject" picture whenever one exists. A logo or reference is supporting material, never the main visual. A "form" is shown and described as exactly what it is -- never call a cosplayer or a figure the character himself. A generic landscape is atmosphere, never a named fictional place.
- The inventory's pictureCheck says how well the subject is covered and which pictures are missing. When the subject itself is missing, say so: one precise upload request in "wants" and a limitation. Build the page honestly around what exists; do not dress abstract shapes up as the subject.
- List in "wants" the pictures you would ideally use; mark each fulfilled with an asset id or say what you did instead. If the subject itself has no usable picture, compose deliberately with shapes, words and atmosphere, and add a limitation (the studio will ask the owner for an upload). Shapes, words and atmosphere SUPPORT the subject; they never impersonate it: no shape built, coloured or arranged to look like the subject or its face (a yellow triangle with red cheeks is not Pikachu; a pink disc is not Kirby). Where the subject has no picture in a scene, that scene is about something else (its world, a fact, a detail) -- not a stand-in.
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
    group: { type: 'string', description: 'layers with the same group id move as one object' },
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
  const item = { type: 'object', required: ['text', 'kind'], properties: { label: { type: 'string' }, text: { type: 'string' }, kind: { type: 'string', enum: VOCAB.copyKind }, cite: { type: 'string', description: 'exactly one fact id from facts, e.g. "f3"' } } };
  return { type: 'array', minItems: LIMITS.scenes[0], maxItems: LIMITS.scenes[1], items: { type: 'object', required: ['id', 'purpose', 'height', 'layers', 'text'], properties: {
    id: { type: 'string' }, name: { type: 'string' }, purpose: { type: 'string', description: 'why this scene exists' }, link: { type: 'string', description: 'how it follows from the previous scene' }, navLabel: { type: 'string' },
    height: { type: 'string', enum: VOCAB.height }, pin: { type: 'boolean' }, camera: { type: 'string', enum: VOCAB.camera }, background: { type: 'string', enum: VOCAB.sceneBg }, atmosphere: { type: 'boolean' },
    mobile: { type: 'object', properties: { order: { type: 'string', enum: VOCAB.mobileOrder } } },
    cta: { type: 'string', description: 'first scene only: a short label for the scroll-on link' },
    layers: { type: 'array', maxItems: LIMITS.layersPerScene, items: layer },
    text: { type: 'object', properties: { kicker: { type: 'string' }, heading: { type: 'string' }, body: { type: 'string' }, kind: { type: 'string', enum: VOCAB.copyKind }, cite: { type: 'string', description: 'exactly one fact id from facts, e.g. "f3"' }, items: { type: 'array', maxItems: LIMITS.items, items: item }, list: { type: 'string', enum: VOCAB.list }, region: { type: 'string', enum: VOCAB.region }, size: { type: 'string', enum: VOCAB.textSize }, width: { type: 'string', enum: VOCAB.textWidth }, entrance: { type: 'string', enum: VOCAB.textEntrance } } },
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
  const k = a.curation;
  return { id: a.id, ownerRole: a.ownerRole && a.ownerRole !== 'auto' ? a.ownerRole : undefined, pictureCheck: k ? { role: k.role, identity: k.identity, depicts: k.depicts, issues: k.issues && k.issues.length ? k.issues : undefined } : undefined, origin: a.origin, title: String(a.title || '').replace(/^File:/, '').slice(0, 120), description: String(a.description || '').slice(0, 160), size: `${s.width || '?'}x${s.height || '?'}`, orientation: s.orientation, transparent: !!(s.transparent || a.cutout), cutoutOf: a.cutoutOf || undefined, subjectBox: s.subject || undefined, colours: (s.colours || []).slice(0, 3), license: a.license || (a.origin === 'upload' ? 'owner upload' : ''), foundBy: a.found || (a.origin === 'upload' ? 'uploaded by the owner' : '') };
}
function directContent(input) {
  const inv = (input.assets || []).map(inventoryLine);
  const facts = (input.facts || []).slice(0, 30).map(f => ({ id: f.id, section: f.section, text: f.text }));
  const u = input.understanding || {};
  const header = {
    brief: String(input.brief || '').slice(0, 1200),
    understanding: { identity: u.identity || { name: u.subject, kind: u.kind }, tone: u.tone, audience: u.audience, motifs: u.motifs, uncertainty: u.uncertainty, researchScope: u.research && u.research.scope, visuals: u.visuals || undefined },
    ownerChoices: input.mainAsset || input.abstractChosen ? { mainPicture: input.mainAsset ? `asset ${input.mainAsset} -- the owner chose it as the main subject: it MUST be the opening scene's main visual` : undefined, abstract: input.abstractChosen ? 'no usable picture of the subject was found; the owner chose an abstract interpretation -- compose with shapes, type, colour and atmosphere, and never present a shape as the subject itself' : undefined } : undefined,
    pictureCheck: input.coverage ? { coverage: input.coverage.coverage, missing: input.coverage.missing, note: input.coverage.note } : undefined,
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

// ---------------------------------------------------------------- picture curation
// ONE cheap vision call looks at small thumbnails of the research shortlist BEFORE anything is downloaded, says
// what each actually shows and what role it could play, and picks a coherent set. Keyword ranking alone put
// logos and unrelated festival photos above a real cosplay photo of the subject.
const CURATE_SYSTEM = `You choose the pictures for one image-led web page about the given subject, from thumbnails of free-licence candidates. Judge what each picture actually SHOWS, not its file name.
Roles: "subject" (shows the subject itself -- for a fictional character, its own depiction), "environment" (a setting or backdrop that genuinely belongs to it), "supporting" (a signature object, related work or person), "detail" (a close-up or texture of the subject), "logo" (a logo, wordmark or title card -- a reference, never the subject's likeness), "reference" (a map, diagram, timeline, chart, document or screenshot), "unrelated" (anything else).
Identity: "exact" = the subject itself (for a fictional character: artwork, a render, a sprite, an animation or game still of that character); "form" = a real-world form of a fictional, branded or trademarked subject (a cosplayer, figure, plush toy, merchandise, replica, statue, balloon, mural, a vehicle painted with it; also any PHOTOGRAPH of a physical product that shows the character -- a toy or device whose screen shows it, packaging, a printed shirt or poster in a room, food shaped like it) -- NOT the subject's likeness: judge it as a form, never select it and never count it toward coverage; "related" = belongs to the subject's world without being it; "other" = not about this subject. A generic landscape is at most "related" environment; it is never a specific fictional place without evidence in the picture. A real place that merely looks like a fictional or invented one is "related", never "exact". "reference" is only for maps, diagrams, charts, timelines, documents and screenshots -- including any user-interface capture (a game menu, HUD, app or website screen, a dashboard), which is never the character even when the character appears in it; -- a painting, illustration, film still or historical artwork is judged by what it shows (subject, supporting, related).
Select a coherent set of at most MAX pictures in order of use: the strongest main picture first, then complementary roles. Prefer sharp, well-lit pictures with the subject whole and uncropped; a subject on a plain background can be cut out ("separable"). For an independent object, creature or character, include the best picture of it standing whole on a plain background when there is one -- it can become a floating cut-out -- alongside pictures where the setting matters. Leave out unrelated, watermarked, text-heavy, heavily cropped and near-duplicate pictures, and pictures whose style clashes with the rest of the set. Logos and references only when nothing better serves.
Origin (for a fictional, branded or trademarked subject): "official" = published by the rights holder -- official artwork and renders, promotional and key art, box or cover art, stills and screenshots of the game, film or show itself; "fan" = made by fans -- drawings, redraws, fan 3D renders, edits, fan wallpapers, AI-made pictures (judge the picture's style against the character's established official look, and the source site: an art-community or wallpaper site is usually fan-made unless the picture is clearly the official art); a drawing or render credited as an individual's "own work" (not the rights holder or its official channel) is fan-made; "unknown" when you cannot tell, and always for real-world subjects (objects, places, people, animals). Never select a fan-made picture as the subject.
coverage: "strong" if a selected picture clearly shows the main visual, "partial" if only a part or a closely related picture does, "none" if nothing does (forms do not count). missing: the specific pictures the page needs and none of the candidates show (e.g. "a clear picture of the character himself"), at most 3.`;
const CURATE_TOOL = {
  name: 'submit_creative_curation', description: 'What each candidate shows, and the set to use.',
  input_schema: { type: 'object', required: ['candidates', 'selection', 'coverage'], properties: {
    candidates: { type: 'array', items: { type: 'object', required: ['id', 'role', 'identity', 'depicts'], properties: {
      id: { type: 'string' }, role: { type: 'string', enum: ['subject', 'environment', 'supporting', 'detail', 'logo', 'reference', 'unrelated'] },
      identity: { type: 'string', enum: ['exact', 'form', 'related', 'other'] }, depicts: { type: 'string', description: 'What the picture shows, in a few words.' },
      issues: { type: 'array', items: { type: 'string', enum: ['cropped', 'watermark', 'text-heavy', 'low-quality', 'busy', 'dark', 'duplicate', 'screenshot', 'collage'] } },
      separable: { type: 'boolean', description: 'The subject stands on a plain background and could be cut out.' },
      origin: { type: 'string', enum: ['official', 'fan', 'unknown'], description: 'For a fictional/branded subject: official material, fan-made, or unknown.' },
      quality: { type: 'integer', minimum: 0, maximum: 3 },
    } } },
    selection: { type: 'array', items: { type: 'string' } },
    coverage: { type: 'string', enum: ['strong', 'partial', 'none'] },
    missing: { type: 'array', maxItems: 3, items: { type: 'string' } },
    note: { type: 'string' },
  } },
};
const ROLES = CURATE_TOOL.input_schema.properties.candidates.items.properties.role.enum;
const IDENTITIES = CURATE_TOOL.input_schema.properties.candidates.items.properties.identity.enum;
const ISSUES = CURATE_TOOL.input_schema.properties.candidates.items.properties.issues.items.enum;
// input: { identity, visuals, max, candidates: [{ id, title, description, categories, size, thumb: { mime, bytes } }] }
async function curate(input, deps) {
  const L = deps.limits; const t0 = Date.now(); const max = Math.max(1, Math.min(10, input.max || 7));
  const cands = (input.candidates || []).filter(c => c && c.thumb && c.thumb.bytes).slice(0, 18);
  const content = [{ type: 'text', text: `SUBJECT: ${JSON.stringify(input.identity || {})}\nTHE PAGE MUST SHOW: ${JSON.stringify(input.visuals || {})}\nMAX: ${max}\n\n${cands.length} candidates follow.` }];
  cands.forEach(c => {
    content.push({ type: 'text', text: `Candidate ${c.id}: ${JSON.stringify({ title: String(c.title || '').replace(/^File:/, '').slice(0, 120), description: String(c.description || '').slice(0, 320), categories: String(c.categories || '').slice(0, 160), size: c.size })}` });
    content.push({ type: 'image', source: { type: 'base64', media_type: c.thumb.mime, data: c.thumb.bytes.toString('base64') } });
  });
  content.push({ type: 'text', text: 'Now submit the curation with submit_creative_curation (every candidate once).' });
  const r = await deps.call({ model: L.understandModel, system: CURATE_SYSTEM.replace('MAX', String(max)), content, tool: CURATE_TOOL, maxTokens: L.curateMaxTokens, timeoutMs: Math.min(L.timeoutMs, 60000) });
  const ids = new Set(cands.map(c => c.id)); const s = (v, n) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, n);
  const verdicts = {};
  ((r.input && r.input.candidates) || []).forEach(v => {
    if (!v || !ids.has(v.id) || verdicts[v.id]) return;
    verdicts[v.id] = { role: ROLES.includes(v.role) ? v.role : 'unrelated', identity: IDENTITIES.includes(v.identity) ? v.identity : 'other', depicts: s(v.depicts, 160), issues: (Array.isArray(v.issues) ? v.issues : []).filter(x => ISSUES.includes(x)).slice(0, 5), separable: !!v.separable, quality: Math.max(0, Math.min(3, Math.round(Number(v.quality) || 0))), origin: ['official', 'fan', 'unknown'].includes(v.origin) ? v.origin : 'unknown' };
  });
  // the selection: known, judged, useful candidates only, each once
  const selection = [...new Set(((r.input && r.input.selection) || []).filter(id => ids.has(id) && verdicts[id] && verdicts[id].role !== 'unrelated' && verdicts[id].identity !== 'other' && verdicts[id].identity !== 'form' && !(verdicts[id].origin === 'fan' && verdicts[id].identity === 'exact')))].slice(0, max);
  return {
    verdicts, selection, coverage: ['strong', 'partial', 'none'].includes(r.input && r.input.coverage) ? r.input.coverage : 'none',
    missing: ((r.input && r.input.missing) || []).slice(0, 3).map(m => s(m, 160)).filter(Boolean), note: s(r.input && r.input.note, 240),
    judged: Object.keys(verdicts).length, of: cands.length,
    usage: r.usage, usd: estimateUsd(r.usage, pricesFor(L, L.understandModel)), model: r.model, ms: Date.now() - t0,
  };
}

// ---------------------------------------------------------------- web discovery (search step)
// Anthropic's web search tool (a server tool on the same key) finds PAGES that show the exact subject; the model then
// submits up to 8 of them. Only URLs the search itself returned are accepted -- the model cannot make the server fetch a
// URL it wrote. Pages and images are then read by the hardened fetcher (webfetch.js / webimages.js).
const SEARCH_SYSTEM = `You find web pages that SHOW one exact subject, for an image-led web page about it. Search the web (at most MAXS searches) with precise queries that name the exact subject -- and its version or edition -- plus what should be seen ("Bulbasaur official artwork", "Antikythera mechanism fragment A photograph"). Prefer pages whose MAIN picture is the subject itself: official media or press pages, museum and archive records, the subject's own site, specialist wiki file pages, photo pages that state a licence. Avoid shops, social feeds, pages about something else that only mention the name, and pages whose main picture would be a logo, a crowd, an aircraft livery, a toy or a costume -- unless the brief asks for that. Search first; then, in a separate step, call submit_image_pages with up to 8 page URLs taken from your search results.`;
const SUBMIT_PAGES_TOOL = {
  name: 'submit_image_pages', description: 'The pages whose main picture shows the subject.',
  input_schema: { type: 'object', required: ['pages'], properties: { pages: { type: 'array', maxItems: 8, items: { type: 'object', required: ['url'], properties: { url: { type: 'string' }, shows: { type: 'string', description: 'what the page\'s main picture should show' } } } } } },
};
// input: { identity, visuals, brief } ; deps: { limits, raw(req) -> Anthropic response JSON }
async function webSearchPages(input, deps) {
  const L = deps.limits; const t0 = Date.now(); const maxS = Math.max(1, Math.min(5, L.webSearches || 3));
  const tools = [{ type: 'web_search_20250305', name: 'web_search', max_uses: maxS }, SUBMIT_PAGES_TOOL];
  let messages = [{ role: 'user', content: [{ type: 'text', text: `${JSON.stringify({ subject: input.identity || {}, mustShow: input.visuals || {}, brief: String(input.brief || '').slice(0, 600) })}\n\nFind the pages, then submit them with submit_image_pages.` }] }];
  const results = []; let picked = null; const usage = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }; let searches = 0; const errors = []; let model = ''; const queries = []; let stop = '';
  for (let turn = 0; turn < 3; turn++) {
    const r = await deps.raw({ model: L.understandModel, system: SEARCH_SYSTEM.replace('MAXS', String(maxS)), messages, tools, maxTokens: 1500, timeoutMs: Math.min(L.timeoutMs, 90000) });
    model = r.model || model; const u = r.usage || {}; stop = r.stop_reason || stop;
    Object.keys(usage).forEach(k => { usage[k] += Number(u[k]) || 0; }); searches += Number(u.server_tool_use && u.server_tool_use.web_search_requests) || 0;
    for (const b of r.content || []) {
      if (b.type === 'web_search_tool_result') { if (Array.isArray(b.content)) b.content.forEach(x => { if (x && x.type === 'web_search_result' && x.url) results.push({ url: String(x.url), title: String(x.title || '').slice(0, 160) }); }); else if (b.content && b.content.error_code) errors.push(b.content.error_code); }
      if (b.type === 'tool_use' && b.name === SUBMIT_PAGES_TOOL.name && b.input && Array.isArray(b.input.pages)) picked = b.input.pages;
      if (b.type === 'server_tool_use' && b.name === 'web_search' && b.input && b.input.query) queries.push(String(b.input.query).slice(0, 120));
    }
    if (r.stop_reason === 'refusal') { errors.push('the model declined the search (stop_reason: refusal)'); break; }
    if (picked || r.stop_reason !== 'pause_turn') break;
    messages = messages.concat([{ role: 'assistant', content: r.content }]); // a paused server-tool turn continues as it is
  }
  const known = new Map(results.map(x => [x.url, x]));
  const chosen = (picked || []).filter(p => p && known.has(String(p.url))).map(p => ({ url: String(p.url), title: known.get(String(p.url)).title, why: String(p.shows || '').slice(0, 160) }));
  const pages = (chosen.length ? chosen : results.map(x => ({ url: x.url, title: x.title, why: '' }))).slice(0, 8);
  const usd = +(estimateUsd(usage, pricesFor(L, L.understandModel)) + searches * (L.webSearchUsd || 0.01)).toFixed(5);
  return { pages, results: results.length, searches, queries, stop, usage, usd, model, ms: Date.now() - t0, error: errors[0] || '' };
}

// ---------------------------------------------------------------- claim check
// The validator catches numbers, citations and owner-words, not a claim phrased without numbers ("a shockwave that
// circled the planet", "the width of a stadium"). The cheap model reads every line of an accepted plan against the
// facts and the owner's details. Coverage is accounted for line by line: every line needs one valid verdict, and a
// "supported" verdict must point at evidence that exists. Unanswered lines get one follow-up; a failed check gets one
// retry; what still cannot be verified is never reported as verified. Unsupported lines go back in the one repair;
// after it, they are taken out and the section is repaired as a whole (no orphaned headings, empty lists or blank scenes).
const CLAIMS_SYSTEM = `You check the words of one web page against the only material it may rely on: the FACTS (from an encyclopedia, with ids) and the OWNER DETAILS (what the page's owner wrote). Give EVERY line exactly one verdict, using its ref:
- "supported": every factual claim in the line is stated by the facts or the owner details (paraphrase, the same numbers rounded, and combining facts are fine). List the ids of the facts that state it in "evidence" (or "owner" for the owner details) -- a supported line without evidence does not count;
- "no-claim": the line makes no factual claim -- mood, metaphor, humour, a scene label, an invitation, a question, an obvious figure of speech ("Behold, the Roll" is a no-claim);
- "unsupported": the line states or implies something the material does not: an event, cause, effect, place, date, quantity, record, comparison ("the width of a stadium", "circled the planet"), attribution or quotation. An addition to an otherwise supported sentence makes the line unsupported.
Judge against the material, not the world: a true statement the material does not make is unsupported. For a fictional subject the facts describe the fiction; claims about it need the same support. Be strict about facts and generous to plain tone and fiction-flavoured mood. For unsupported lines, quote the unsupported part in "claim".`;
const CLAIMS_TOOL = {
  name: 'submit_creative_claims', description: 'A verdict for each line of the page.',
  input_schema: { type: 'object', required: ['lines'], properties: { lines: { type: 'array', items: { type: 'object', required: ['ref', 'verdict'], properties: {
    ref: { type: 'string' }, verdict: { type: 'string', enum: ['supported', 'no-claim', 'unsupported'] },
    evidence: { type: 'array', items: { type: 'string' }, description: 'supported lines: the fact ids (or "owner") that state it' },
    claim: { type: 'string', description: 'unsupported lines: the part the material does not state' },
  } } } } },
};
function claimLines(plan) {
  const out = []; const add = (ref, text, where, what, kind) => { if (text && String(text).trim()) out.push({ ref, text: String(text), where, what, kind: kind || '' }); };
  add('concept.title', plan.concept.title, 'concept', 'title'); add('concept.logline', plan.concept.logline, 'concept', 'logline');
  plan.scenes.forEach((s, i) => {
    const t = s.text; const where = `scene ${i + 1} (${s.id})`;
    add(`s${i}.kicker`, t.kicker, where, 'kicker'); add(`s${i}.heading`, t.heading, where, 'heading'); add(`s${i}.body`, t.body, where, 'paragraph', t.kind);
    t.items.forEach((it, j) => add(`s${i}.item${j}`, [it.label, it.text].filter(Boolean).join(': '), where, `line ${j + 1}`, it.kind));
    s.layers.forEach((L, k) => { if (L.kind === 'word') add(`s${i}.word${k}`, L.word.text, where, 'word layer'); });
  });
  return out;
}
// one checker call over some lines -> the raw tool answer (throws on a failed or truncated call)
async function claimsCall(lines, plan, input, deps) {
  const L = deps.limits; const t0 = Date.now();
  const material = { subject: plan.identity, facts: (input.facts || []).slice(0, 30).map(f => ({ id: f.id, text: f.text })), ownerDetails: input.supplied || { facts: [], memories: [] }, lines: lines.map(l => ({ ref: l.ref, text: l.text })) };
  const r = await deps.call({ model: L.understandModel, system: CLAIMS_SYSTEM, content: [{ type: 'text', text: `${JSON.stringify(material, null, 1)}\n\nGive exactly one verdict for every one of the ${lines.length} lines with submit_creative_claims.` }], tool: CLAIMS_TOOL, maxTokens: L.claimsMaxTokens, timeoutMs: Math.min(L.timeoutMs, 60000) });
  return Object.assign(r, { usd: estimateUsd(r.usage, pricesFor(L, L.understandModel)), ms: Date.now() - t0 });
}
const STRICT = { unsupported: 3, supported: 2, 'no-claim': 1 };
// -> { status: verified | partial | unchecked, unsupported: [lines], unresolved: [lines], checked, lines, calls, usd, ms, errors, conflicts, unknown, noEvidence }
async function verifyClaims(plan, input, deps, attempt) {
  const lines = claimLines(plan); const byRef = new Map(lines.map(l => [l.ref, l]));
  const factIds = new Set((input.facts || []).map(f => f.id)); const sup = input.supplied || {};
  const hasOwner = ((sup.facts || []).length + (sup.memories || []).length) > 0;
  const verdicts = new Map(); const out = { calls: 0, usd: 0, ms: 0, errors: [], conflicts: 0, unknown: 0, noEvidence: 0 };
  const ask = async subset => {
    let r; try { r = await claimsCall(subset, plan, input, deps); } catch (e) { out.errors.push(String(e && e.message || e).slice(0, 160)); return false; }
    out.calls++; out.usd = +(out.usd + r.usd).toFixed(5); out.ms += r.ms;
    if (deps.onUsage) deps.onUsage({ step: 'claims', attempt, usage: r.usage, usd: r.usd, model: r.model, ms: r.ms });
    const asked = new Set(subset.map(l => l.ref)); const got = new Map();
    const answers = r.input && Array.isArray(r.input.lines) ? r.input.lines : null;
    if (!answers) { out.errors.push('the check came back without verdicts'); return false; }
    for (const x of answers) {
      if (!x || typeof x !== 'object' || !asked.has(x.ref)) { out.unknown++; continue; }
      const verdict = STRICT[x.verdict] ? x.verdict : null; if (!verdict) { out.unknown++; continue; }
      const evidence = (Array.isArray(x.evidence) ? x.evidence : []).map(e => String(e).trim()).filter(e => factIds.has(e) || (e === 'owner' && hasOwner));
      // "supported" is evidence of a check only when it points at material that exists
      if (verdict === 'supported' && !evidence.length) { out.noEvidence++; continue; }
      const v = { verdict, evidence, claim: String(x.claim || '').slice(0, 160) }; const prev = got.get(x.ref);
      if (prev && prev.verdict !== verdict) { out.conflicts++; got.set(x.ref, STRICT[prev.verdict] >= STRICT[verdict] ? prev : v); } // conflicting answers: the stricter holds
      else if (!prev) got.set(x.ref, v);
    }
    got.forEach((v, ref) => verdicts.set(ref, v));
    return true;
  };
  // at most two checker calls: the check, then either one retry (it failed) or one follow-up for unanswered lines
  if (!(await ask(lines))) await ask(lines);
  else { const missing = lines.filter(l => !verdicts.has(l.ref)); if (missing.length) await ask(missing); }
  const unresolved = lines.filter(l => !verdicts.has(l.ref));
  const unsupported = lines.filter(l => verdicts.has(l.ref) && verdicts.get(l.ref).verdict === 'unsupported').map(l => Object.assign({}, l, { claim: verdicts.get(l.ref).claim }));
  const status = !out.calls || verdicts.size === 0 ? 'unchecked' : unresolved.length ? 'partial' : 'verified';
  return Object.assign(out, { status, unsupported, unresolved, checked: lines.length - unresolved.length, lines: lines.length, byRef });
}
const claimProblem = u => `${u.where}: the ${u.what} "${u.text.slice(0, 120)}" claims ${u.claim ? `"${u.claim}"` : 'something'} that no given fact or owner detail states -- say it from the facts, or without the claim`;
// Taking words out, and repairing what is left: a hero heading falls back to the subject's name; other headings are
// cleared (a replacement label would be new, unchecked words); a scene left with only a heading or kicker and no
// picture is dropped; a kicker never stands alone. conservative: the check could not run -- invented paragraphs and
// list lines go too, keeping cited and owner-supplied ones.
function withoutClaims(plan, lines, conservative) {
  const p = JSON.parse(JSON.stringify(plan)); const notes = []; const touched = new Set();
  const dropItems = new Map(); const dropWords = new Map();
  lines.forEach(u => {
    const m = /^s(\d+)\.(kicker|heading|body|item(\d+)|word(\d+))$/.exec(u.ref);
    const note = `${u.where}: the ${u.what} "${u.text.slice(0, 80)}" was taken out (${u.claim ? `"${u.claim}" is not in the facts` : 'it could not be checked against the facts'})`;
    if (u.ref === 'concept.title') { p.concept.title = ''; notes.push(note); return; }
    if (u.ref === 'concept.logline') { p.concept.logline = `A page about ${p.identity.name}.`; notes.push(note); return; }
    if (!m) return; const i = +m[1]; const s = p.scenes[i]; if (!s) return; touched.add(s);
    if (m[2] === 'kicker') s.text.kicker = '';
    else if (m[2] === 'heading') s.text.heading = i === 0 ? p.identity.name : '';
    else if (m[2] === 'body') s.text.body = '';
    else if (m[3] != null) dropItems.set(s, (dropItems.get(s) || new Set()).add(+m[3]));
    else if (m[4] != null) dropWords.set(s, (dropWords.get(s) || new Set()).add(+m[4]));
    notes.push(note);
  });
  dropItems.forEach((set, s) => { s.text.items = s.text.items.filter((_, j) => !set.has(j)); });
  dropWords.forEach((set, s) => { s.layers = s.layers.filter((_, k) => !set.has(k)); });
  if (conservative) p.scenes.forEach((s, i) => {
    if (s.text.body && s.text.kind === 'imagined') { s.text.body = ''; touched.add(s); notes.push(`scene ${i + 1} (${s.id}): an invented paragraph was left out -- the words could not be checked`); }
    const keep = s.text.items.filter(it => it.kind !== 'imagined'); if (keep.length < s.text.items.length) { s.text.items = keep; touched.add(s); notes.push(`scene ${i + 1} (${s.id}): invented list lines were left out -- the words could not be checked`); }
  });
  // repair each touched section as a whole
  p.scenes = p.scenes.filter((s, i) => {
    if (i === 0 || !touched.has(s)) return true;
    const t = s.text; const hasWords = !!(t.body || t.items.length); const hasPicture = s.layers.some(L => L.kind === 'image' || (L.role === 'focal' && L.kind !== 'word'));
    if (!t.heading && t.kicker && !hasWords) t.kicker = ''; // a kicker never stands alone
    if (!hasWords && !hasPicture && (t.heading || t.kicker || !s.layers.length) && p.scenes.length > 2) { notes.push(`scene ${i + 1} (${s.id}): nothing but a heading was left -- the scene was dropped`); return false; }
    return true;
  });
  return { plan: p, notes };
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
    const vctx = { page: input.page || null, visuals: input.understanding && input.understanding.visuals, coverage: input.coverage || null, mainAsset: input.mainAsset || null, abstractChosen: !!input.abstractChosen, assets: input.assets, facts: input.facts, understanding: input.understandingLegacy, supplied: [].concat((input.supplied && input.supplied.facts) || [], (input.supplied && input.supplied.memories) || []) };
    const v = validatePlan2(Object.assign({}, r.input, { direction: { source: /^mock/i.test(r.model || '') ? 'mock' : (deps.source || 'ai'), model: r.model, at: new Date().toISOString(), attempt, repaired: attempt > 1, seed: input.seed || '' } }), vctx);
    const rec = { attempt, ms: Date.now() - t0, usage: r.usage, usd, model: r.model, errors: v.errors, fixes: v.fixes.length }; attempts.push(rec);
    if (deps.onUsage) deps.onUsage({ attempt, usage: r.usage, usd, model: r.model, ms: Date.now() - t0 });
    last = v;
    let problems = v.errors;
    if (!problems.length) {
      // the claim check (cheap model): only on a plan that is otherwise ready
      const wantCheck = L.claimCheck && ((input.facts || []).length || vctx.supplied.length);
      const check = wantCheck ? await verifyClaims(v.plan, input, deps, attempt) : null;
      if (check) {
        rec.usd = +(rec.usd + check.usd).toFixed(5);
        rec.claims = { status: check.status, calls: check.calls, usd: check.usd, ms: check.ms, lines: check.lines, checked: check.checked, unsupported: check.unsupported.length, unresolved: check.unresolved.length, conflicts: check.conflicts, unknown: check.unknown, noEvidence: check.noEvidence, errors: check.errors.slice(0, 2) };
      }
      const summary = (c, removed) => (c ? { status: c.status, checked: c.checked, of: c.lines, removed, calls: c.calls } : { status: 'off', checked: 0, of: 0, removed: 0, calls: 0 });
      if (!check || (check.status === 'verified' && !check.unsupported.length)) { v.plan.claims = summary(check, 0); return { ok: true, plan: v.plan, fixes: v.fixes, warnings: v.warnings, attempts, raw: r.input }; }
      if (check.unsupported.length && attempt <= L.repairs) { problems = check.unsupported.map(claimProblem); rec.errors = problems; }
      else {
        // no repair left (or nothing the director must fix): unsupported lines are taken out; lines that could not be
        // verified are treated the same way (never reported as checked); an unchecked page keeps only cited/owner prose
        const out = check.unsupported.concat(check.unresolved);
        const cut = withoutClaims(v.plan, out, check.status === 'unchecked'); const v2 = validatePlan2(cut.plan, vctx);
        if (!v2.errors.length) {
          v2.plan.claims = summary(check, out.length);
          const warn = check.status === 'verified' ? [] : [check.status === 'unchecked' ? `the words could NOT be checked against the facts (${check.errors[0] || 'the check failed'}) -- invented prose was left out` : `${check.unresolved.length} line(s) could not be verified and were taken out`];
          return { ok: true, plan: v2.plan, fixes: v.fixes.concat(cut.notes), warnings: v.warnings.concat(v2.warnings, warn), attempts, raw: r.input };
        }
        last = v2; problems = v2.errors; break;
      }
    }
    // one bounded repair: the model sees its own plan and the exact problems
    messages = [
      { role: 'user', content: directContent(input) },
      { role: 'assistant', content: [{ type: 'tool_use', id: r.toolUseId || 'plan_1', name: DIRECTOR_TOOL.name, input: r.input }] },
      { role: 'user', content: [{ type: 'tool_result', tool_use_id: r.toolUseId || 'plan_1', is_error: true, content: `The plan cannot be shown as it is. Fix exactly these problems and resubmit the whole plan:\n- ${problems.join('\n- ')}` }] },
    ];
    last = Object.assign({}, v, { errors: problems });
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
    clarify: kind === 'personal' ? null : clarify, research: { scope: kind === 'personal' && scope === 'subject' ? 'general-topic' : scope, wikipediaTitles: (res.wikipediaTitles || []).slice(0, 3).map(t => s(t, 160)).filter(t => t && !(kind === 'personal' && t.toLowerCase() === s(owner.name || id.name, 80).toLowerCase())), commonsQueries: (res.commonsQueries || []).slice(0, 4).map(t => s(t, 100)).filter(Boolean), note: s(res.note, 200) },
    visuals: { main: s(r.visuals && r.visuals.main, 200), setting: s(r.visuals && r.visuals.setting, 200), supporting: ((r.visuals && r.visuals.supporting) || []).slice(0, 4).map(v => s(v, 120)).filter(Boolean), ...(['artwork', 'photo', 'none'].includes(r.visuals && r.visuals.depiction) ? { depiction: r.visuals.depiction } : {}) },
    // a personal subject's NAME is never looked up ("Bubbles" is not the chimpanzee): only its general type is
    query: scope === 'none' ? null : kind === 'personal'
      ? (s(((res.wikipediaTitles || []).find(t => s(t, 160).toLowerCase() !== s(owner.name || id.name, 80).toLowerCase())) || owner.type, 160) || null)
      : (s((res.wikipediaTitles || [])[0] || id.name, 160) || null),
    tone: { register: s(r.tone && r.tone.register, 20) || 'editorial', words: ((r.tone && r.tone.words) || []).slice(0, 5).map(w => s(w, 30)), fromBrief: !!(r.tone && r.tone.fromBrief) },
    audience: s(r.audience, 160), motifs: (r.motifs || []).slice(0, 8).map(m => s(m, 80)).filter(Boolean), uncertainty: (r.uncertainty || []).slice(0, 5).map(m => s(m, 200)).filter(Boolean),
    brief: s(brief, 1200), source: 'ai',
  };
}

module.exports = { limits, estimateUsd, understand, direct, normaliseUnderstanding, UNDERSTAND_TOOL, DIRECTOR_TOOL, UNDERSTAND_SYSTEM, DIRECTOR_SYSTEM, directContent, understandContent, inventoryLine, CLAIMS_TOOL, CLAIMS_SYSTEM, claimLines, verifyClaims, withoutClaims, curate, CURATE_TOOL, CURATE_SYSTEM, webSearchPages, SUBMIT_PAGES_TOOL, SEARCH_SYSTEM };
