'use strict';
// CREATIVE — art direction. One coherent decision per page, made BEFORE the scenes are written, so a page has a
// language of its own instead of a list of unrelated effects:
//   personality   how things move (editorial, cinematic, kinetic, playful, luxe, mechanical, chaotic, still)
//   scroll        what scrolling does to the page (flow, sequence, continuous, track, stack, snap)
//   typo / nav / density / progression / depth / intensity
//   scenes        the scene architecture: a layout ARCHETYPE per scene (real, different compositions -- see
//                 archetypes.js), a scene choreography (what scroll does inside it) and a handoff (how it meets the
//                 previous scene), with what each scene carries (a statement, facts, pictures...)
//   family        the choreography FAMILY the scenes are built from -- a designed arc, not a mix (object story,
//                 cinematic chapters, editorial sticky, layered parallax, typography-led, horizontal gallery, mask
//                 transitions, poster-to-scene, gallery progression, colour progression)
//   mode          the interaction intensity (quiet, editorial, expressive, immersive): how many held scenes, how far
//                 things move, whether a persistent actor carries the page
//   actor         (object story) a run of scenes one subject lives across -- ONE actor that moves, scales and turns
//                 from pose to pose between them, instead of the same picture pasted into every scene
//
//   choose(input) -> recipe      input: { understanding, assets, facts, supplied, seed, history, avoid }
//   normaliseArt(raw) -> art     the page-level part as stored in a plan (enums whitelisted)
//   fingerprint(recipe|plan), similarity(a, b)
//
// The choice is REASONED variation: the subject and its register (from the understanding) weight the personalities;
// the pictures that exist decide which archetypes are possible (a cinematic full-bleed needs a wide, sharp picture that
// is not already tightly cropped; a floating composition needs a cut-out); the seed picks among the good options; and
// recipes this account made recently (and this page's previous direction) are steered away from. Nothing here writes
// words or invents facts.

const F = require('./framing');
const POOL = require('./pool');

const PERSONALITIES = ['editorial', 'cinematic', 'kinetic', 'playful', 'luxe', 'mechanical', 'chaotic', 'still'];
const SCROLLS = ['flow', 'sequence', 'continuous', 'track', 'stack', 'snap'];
const LAYOUTS = ['free', 'editorial-hero', 'split', 'giant-type', 'shrine', 'offcanvas', 'framed', 'floating', 'collage', 'poster', 'magazine', 'strip', 'sticky-steps', 'text', 'image', 'luxe', 'dense', 'depth', 'brutalist', 'cinematic', 'gallery',
  // the scene model's second vocabulary: an actor scene, campaigns and takeovers, image-led narrative, lineups...
  'stage', 'campaign', 'splitscreen', 'fullscreen-object', 'orbit', 'index', 'scrapbook', 'takeover', 'chapters', 'lineup', 'cardstream', 'edge-crop'];
const CHOREOS = ['settle', 'pin-steps', 'zoom-away', 'scale-through', 'mask-reveal', 'type-wipe', 'track', 'stack', 'depth', 'travel', 'actor', 'word-fill', 'chapters', 'cardstream', 'expand'];
const HANDOFFS = ['cut', 'overlap', 'bleed', 'carry', 'stack'];
const TYPOS = ['editorial', 'giant', 'minimal', 'poster', 'mixed'];
const NAVS = ['bar', 'minimal', 'index'];
const DENSITIES = ['sparse', 'balanced', 'dense'];
const PROGRESSIONS = ['steady', 'deepen', 'journey', 'invert', 'dark-to-light', 'warm-to-cool', 'muted-to-saturated', 'accent-takeover', 'gradient'];
const DEPTHS = ['flat', 'layered', 'deep'];
const FAMILIES = ['object-story', 'cinematic-chapters', 'editorial-sticky', 'layered-parallax', 'typography-led', 'horizontal-gallery', 'mask-transition', 'poster-to-scene', 'gallery-progression', 'colour-progression'];
const MODES = ['quiet', 'editorial', 'expressive', 'immersive'];
// what a scene is, beyond its composition (derived from its archetype and choreography when a plan does not say)
const SCENE_TYPES = ['section', 'pinned', 'cinematic', 'transition', 'carry', 'sticky-editorial', 'takeover', 'gallery', 'typography'];
// how a scene's own content leaves as the scene scrolls away
const EXITS = ['none', 'fade', 'shrink', 'lift'];
// how a scene's words are set
const TREATMENTS = ['standard', 'word-fill', 'letter-spread', 'stagger', 'vertical', 'outline'];
// the interaction modes: how many scenes may hold the scroll, how many may be driven by it, how far things move, and
// whether one actor may carry the page
const MODE_LIMITS = {
  quiet: { pins: 0, driven: 2, range: 0.45, actor: 0, rotate: 0 },
  editorial: { pins: 1, driven: 3, range: 0.75, actor: 0, rotate: 0.5 },
  expressive: { pins: 2, driven: 5, range: 1, actor: 3, rotate: 1 },
  immersive: { pins: 3, driven: 7, range: 1.2, actor: 5, rotate: 1.25 },
};

// how each personality moves: the renderer reads these as CSS variables and runtime factors
const MOTION = {
  editorial: { range: 0.6, ease: 'cubic-bezier(.25,.8,.25,1)', pin: 110, loops: 'gentle', text: 'lines', label: 'restrained editorial' },
  cinematic: { range: 1, ease: 'cubic-bezier(.45,.05,.25,1)', pin: 150, loops: 'gentle', text: 'fade', label: 'smooth cinematic' },
  kinetic: { range: 1.35, ease: 'cubic-bezier(.7,0,.2,1)', pin: 90, loops: 'lively', text: 'slide', label: 'kinetic graphic' },
  playful: { range: 1.2, ease: 'cubic-bezier(.34,1.56,.64,1)', pin: 100, loops: 'lively', text: 'spring', label: 'playful elastic' },
  luxe: { range: 0.5, ease: 'cubic-bezier(.22,.61,.36,1)', pin: 160, loops: 'gentle', text: 'spaced', label: 'luxurious, slow' },
  mechanical: { range: 1, ease: 'cubic-bezier(.83,0,.17,1)', pin: 95, loops: 'none', text: 'type', label: 'mechanical, geometric' },
  chaotic: { range: 1.5, ease: 'cubic-bezier(.68,-.35,.27,1.35)', pin: 90, loops: 'lively', text: 'jump', label: 'chaotic, controlled' },
  still: { range: 0.25, ease: 'ease', pin: 120, loops: 'none', text: 'fade', label: 'still, respectful' },
};

// what each personality reaches for -- the pools the recipe is drawn from (weights)
const STYLE = {
  editorial: { scroll: { flow: 3, continuous: 1.5, snap: 1 }, hero: { 'editorial-hero': 3, split: 3, magazine: 2, 'giant-type': 1.5, framed: 1.5 }, body: { magazine: 3, split: 2, text: 2, framed: 2, 'sticky-steps': 2.5, image: 1.5, gallery: 1.5, dense: 1 }, choreo: { settle: 3, 'type-wipe': 2, 'mask-reveal': 2, 'pin-steps': 2 }, handoff: { cut: 3, bleed: 2, overlap: 1 }, typo: { editorial: 3, minimal: 1.5, mixed: 1 }, nav: { bar: 2, index: 2 }, density: { balanced: 3, dense: 1 }, progression: { steady: 2, journey: 2 }, depth: { flat: 2, layered: 1 } },
  cinematic: { scroll: { sequence: 3, continuous: 2.5, flow: 1 }, hero: { cinematic: 3, 'editorial-hero': 2.5, offcanvas: 2, shrine: 1.5 }, body: { cinematic: 2.5, image: 2, depth: 2.5, 'sticky-steps': 2, gallery: 2, split: 1.5, text: 1.5 }, choreo: { 'zoom-away': 3, depth: 2.5, 'mask-reveal': 2, 'pin-steps': 2, 'scale-through': 1.5 }, handoff: { bleed: 3, overlap: 2, carry: 1.5 }, typo: { minimal: 3, giant: 1.5 }, nav: { minimal: 3, bar: 1 }, density: { sparse: 2, balanced: 2 }, progression: { deepen: 3, journey: 1.5 }, depth: { deep: 3, layered: 1 } },
  kinetic: { scroll: { track: 3, stack: 2, sequence: 2 }, hero: { 'giant-type': 3, poster: 2.5, offcanvas: 2, split: 1 }, body: { strip: 3, poster: 2, 'giant-type': 2, dense: 2, collage: 1.5, gallery: 1.5, 'sticky-steps': 1.5 }, choreo: { track: 3, 'type-wipe': 2.5, stack: 2, 'scale-through': 2, travel: 1.5 }, handoff: { cut: 2, stack: 2, carry: 1.5 }, typo: { giant: 3, poster: 2 }, nav: { minimal: 2, index: 2 }, density: { dense: 2.5, balanced: 1.5 }, progression: { invert: 2.5, journey: 1.5 }, depth: { layered: 2, flat: 1 } },
  playful: { scroll: { stack: 2.5, flow: 2, track: 1.5 }, hero: { shrine: 3, floating: 2.5, poster: 2, collage: 2, offcanvas: 1.5 }, body: { collage: 2.5, floating: 2, strip: 2, dense: 1.5, 'giant-type': 1.5, 'sticky-steps': 2, shrine: 1 }, choreo: { travel: 3, stack: 2.5, 'pin-steps': 2, track: 1.5, 'scale-through': 1.5 }, handoff: { carry: 2.5, overlap: 2, cut: 1 }, typo: { poster: 2.5, giant: 2, mixed: 1 }, nav: { bar: 2, minimal: 1.5 }, density: { dense: 2, balanced: 2 }, progression: { journey: 3, invert: 1 }, depth: { layered: 3 } },
  luxe: { scroll: { flow: 2.5, sequence: 2, snap: 1.5 }, hero: { luxe: 3, shrine: 2, framed: 2, 'editorial-hero': 1.5 }, body: { luxe: 2.5, framed: 2.5, text: 2, image: 2, 'sticky-steps': 1.5, magazine: 1.5, gallery: 1.5 }, choreo: { settle: 3, 'mask-reveal': 2.5, 'zoom-away': 2, 'pin-steps': 1.5 }, handoff: { bleed: 3, cut: 2 }, typo: { minimal: 3, editorial: 2 }, nav: { minimal: 3, index: 1.5 }, density: { sparse: 3 }, progression: { steady: 2, deepen: 2 }, depth: { flat: 2, layered: 1 } },
  mechanical: { scroll: { snap: 2, sequence: 2, track: 2 }, hero: { brutalist: 3, 'giant-type': 2.5, split: 1.5, poster: 1.5 }, body: { brutalist: 3, dense: 2.5, strip: 2, 'sticky-steps': 2, text: 1.5, gallery: 1.5 }, choreo: { 'type-wipe': 3, track: 2, 'pin-steps': 2, travel: 1.5, stack: 1.5 }, handoff: { cut: 3, stack: 2 }, typo: { poster: 2.5, giant: 2 }, nav: { index: 3, bar: 1 }, density: { dense: 3 }, progression: { invert: 2.5, steady: 1.5 }, depth: { flat: 3 } },
  chaotic: { scroll: { stack: 2, track: 2, continuous: 2 }, hero: { collage: 3, poster: 2.5, 'giant-type': 2, offcanvas: 2, brutalist: 1.5 }, body: { collage: 3, poster: 2.5, depth: 2, strip: 2, brutalist: 1.5, 'giant-type': 2, floating: 1.5 }, choreo: { travel: 2.5, 'scale-through': 2.5, depth: 2, stack: 2, 'type-wipe': 2, track: 1.5 }, handoff: { overlap: 2.5, carry: 2, stack: 2 }, typo: { poster: 3, giant: 2, mixed: 1.5 }, nav: { minimal: 2, index: 1.5 }, density: { dense: 3 }, progression: { invert: 2, journey: 2 }, depth: { deep: 2, layered: 2 } },
  still: { scroll: { flow: 3 }, hero: { framed: 3, luxe: 2, 'editorial-hero': 2, shrine: 1.5, text: 1 }, body: { framed: 3, text: 2.5, image: 2, magazine: 2, luxe: 1.5, gallery: 1.5 }, choreo: { settle: 4, 'mask-reveal': 1 }, handoff: { cut: 3, bleed: 2 }, typo: { editorial: 3, minimal: 2 }, nav: { bar: 3 }, density: { sparse: 2, balanced: 2 }, progression: { steady: 3 }, depth: { flat: 3 } },
};

// the subject's genre, from what the understanding and research say it is (words only; no guessing about pictures)
const GENRES = [
  ['brutal', /\bbrutalis[mt]\b|\bbrutalist\b/i],
  ['tribute', /\b(in memory|memorial|remember(ed|ing)?|passed away|grandad|grandpa|grandma|granny|nan|funeral|tribute to (my|our))\b/i],
  ['meme', /\b(meme|shrine|cursed|absurd|parody|shitpost|lol|vibe|internet (culture|famous)|viral|brainrot|goofy|silly)\b/i],
  ['fashion', /\b(fashion|couture|runway|designer|apparel|clothing|garment|luxury|jewel(le)?ry|perfume|fragrance|handbag|atelier|haute|tailor)\b/i],
  ['music', /\b(music|musician|band|album|synth|synthesi[sz]er|dj|techno|jazz|song|producer|composer|experimental|noise|record label|vinyl|concert|rapper|singer)\b/i],
  ['tech', /\b(software|app|platform|startup|saas|api|robot|cyber|quantum|computer|algorithm|artificial intelligence|machine learning|futur(e|istic)|sci-?fi|spacecraft|code|developer)\b/i],
  // (real prompts: Polaroid's "instant film camera" read as a film; Starlink's "satellite dish" read as food -- those
  // phrases are taken out before matching, see NOT_GENRE; no lookbehind: this module runs in the browser too)
  ['film', /\b(film|movie|cinema|director|screenplay|trailer|noir|premiere|documentary|hollywood|silent film)\b/i],
  ['food', /\b(food|dish|burger|sandwich|pizza|cake|bread|coffee|tea|cookie|snack|dessert|soup|chocolate|kitchen|restaurant|bakery|sauce|noodle|taco|donut|doughnut|candy|ice cream|cheese|fruit)\b/i],
  ['art', /\b(art|artist|artwork|gallery|exhibition|brutalis[mt]|sculpture|installation|zine|printmak|painting|painter|mural|collective)\b/i],
  ['editorial', /\b(magazine|journal|essay|issue|editorial|review|column|publication|newspaper|story of|long-?read)\b/i],
  ['nature', /\b(animal|bird|fish|forest|ocean|sea|plant|flower|tree|mountain|river|insect|whale|wildlife|reef|species)\b/i],
  ['history', /\b(history|historic|ancient|war|museum|artefact|artifact|empire|dynasty|century|medieval|archaeolog)\b/i],
];
const GENRE_WEIGHTS = {
  tribute: { still: 3.5, editorial: 2, luxe: 1.2 },
  brutal: { mechanical: 4, chaotic: 1.2, editorial: 0.8 },
  meme: { playful: 3, chaotic: 3, cinematic: 1.3, kinetic: 1 },
  fashion: { luxe: 3, editorial: 2.5, cinematic: 1.5, kinetic: 1 },
  music: { kinetic: 3, chaotic: 2.5, cinematic: 1.5, mechanical: 1.5 },
  tech: { mechanical: 3, kinetic: 2, cinematic: 1.3, editorial: 0.8 },
  film: { cinematic: 3.5, editorial: 1.5, kinetic: 1 },
  food: { playful: 3, kinetic: 1.5, editorial: 1.2, luxe: 1 },
  art: { chaotic: 2.2, mechanical: 2.2, editorial: 2, kinetic: 1 },
  editorial: { editorial: 3.5, luxe: 1.5, cinematic: 1.2 },
  nature: { cinematic: 2.5, editorial: 2, luxe: 1.2, playful: 1 },
  history: { editorial: 3, cinematic: 2.5, still: 0.8 },
  object: { editorial: 2, playful: 1.5, luxe: 1.5, cinematic: 1.5, kinetic: 1 },
  // (from the settled identity type: a game franchise, a character, a product, a place -- none of them an essay)
  game: { cinematic: 3, kinetic: 2.5, playful: 2, chaotic: 1.3, mechanical: 0.8 },
  character: { playful: 3, cinematic: 2, kinetic: 1.5, chaotic: 1.2 },
  product: { cinematic: 2.5, kinetic: 2, playful: 1.5, mechanical: 1.5, luxe: 1.2, editorial: 0.6 },
  place: { cinematic: 3.5, luxe: 1.5, editorial: 1.2, kinetic: 0.6 },
};
// the register the understanding reports (or the rules reader's tone word) shifts them
const TONE_SHIFT = {
  extravagant: { chaotic: 1.5, playful: 1, cinematic: 1 }, absurd: { chaotic: 2, playful: 1.5, cinematic: 0.8 },
  playful: { playful: 2, kinetic: 0.8 }, cinematic: { cinematic: 2 }, retro: { mechanical: 1.5, playful: 1 },
  tender: { still: 2.5, editorial: 1, luxe: 1, chaotic: -3, kinetic: -2, playful: -1 },
  reverent: { still: 2, luxe: 1.2, chaotic: -3, playful: -2 }, serious: { editorial: 1.5, still: 1.5, chaotic: -3, playful: -2.5 },
  restrained: { luxe: 1.5, editorial: 1.5, still: 1, chaotic: -2.5, kinetic: -1.5 }, lyrical: { luxe: 1.5, editorial: 1, cinematic: 0.8 },
  editorial: { editorial: 1.5 },
};

// ---- helpers
function rng(seed) { let s = 2166136261; for (const ch of String(seed)) { s ^= ch.charCodeAt(0); s = Math.imul(s, 16777619); } const f = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; f.at = () => s; f.from = v => { s = v >>> 0; return f; }; return f; }
function weighted(r, table, filter) {
  const entries = Object.entries(table).filter(([k, w]) => w > 0 && (!filter || filter(k)));
  if (!entries.length) return null;
  const total = entries.reduce((t, [, w]) => t + w, 0); let x = r() * total;
  for (const [k, w] of entries) { x -= w; if (x <= 0) return k; }
  return entries[entries.length - 1][0];
}
const oneOf = (v, list, d) => (list.includes(v) ? v : d);
function registerOf(u) { const t = u && u.tone; return String((t && typeof t === 'object' ? t.register : t) || '').toLowerCase(); }
// The settled identity type (identity.js, server) decides first: a game franchise is a game whatever its words say; a
// product or a real person takes a domain genre (fashion, music, food, art) when its words name one. Without a type
// (a saved page, the rules reader), the words alone decide, as before.
const GAME_WORDS = /\b(video ?games?|game series|videogame|nintendo|playstation|xbox|fighting game|platformer|rpg|esports|console game|game franchise)\b/i;
const FUTURE_WORDS = /\b(satellites?|spacecraft|rockets?|space ?flight|orbit(?:al)?|robots?|robotics|artificial intelligence|machine learning|internet|broadband|software|quantum|futur(?:e|istic)|sci-?fi|drones?|semiconductors?|virtual reality|electric vehicles?|launch vehicle|aerospace)\b/i;
const DOMAIN_GENRES = ['brutal', 'tribute', 'fashion', 'music', 'food', 'art'];
const NOT_GENRE = /\b(satellite dish(?:es)?|dish antennas?|instant film|film cameras?|film photography)\b/gi;
function genreOf(u, page) {
  const text = [u && u.subject, u && u.brief, u && u.identity && u.identity.what, ...((u && u.motifs) || []), page && page.title, page && page.description].filter(Boolean).join(' ').replace(NOT_GENRE, ' ');
  const hit = GENRES.find(([, re]) => re.test(text)); const words = hit ? hit[0] : 'object';
  const type = u && u.identity && u.identity.type; const said = [u && u.subject, u && u.identity && u.identity.what, u && u.visuals && u.visuals.main, ...((u && u.motifs) || []), page && page.description].filter(Boolean).join(' ').replace(NOT_GENRE, ' ');
  const domain =() => { const d = GENRES.find(([k, re]) => DOMAIN_GENRES.includes(k) && re.test(said)); return d ? d[0] : ''; };
  switch (type) {
    case 'meme': return 'meme';
    case 'franchise': return GAME_WORDS.test(`${said} ${(u && u.brief) || ''}`) ? 'game' : 'film';
    case 'fictional-character': return 'character';
    case 'place': return words === 'tribute' ? 'tribute' : 'place';
    case 'product': return domain() === 'fashion' ? 'fashion' : FUTURE_WORDS.test(said) ? 'tech' : domain() || 'product';
    case 'real-person': return domain() || (['film', 'tech', 'history', 'editorial'].includes(words) ? words : 'editorial');
    default: return words;
  }
}

// ---- visual ambition: how big the page's moves are, decided BEFORE the personality, from (in order) the owner's own
// words, the page's purpose, the subject's type and the pictures that exist. (Measured on real prompts: every page went
// through one register-weighted draw, and a quiet register or a generic genre made restrained editorial the default
// even for a game franchise or a satellite network.)
const AMBITIONS = ['restrained', 'expressive', 'cinematic', 'experimental'];
const WANT = [
  ['experimental', /\b(experimental|weird|surreal|chaotic|glitch(?:y)?|unhinged|maximalist|avant[- ]garde|trippy|psychedelic|rule[- ]breaking)\b/i],
  ['cinematic', /\b(cinematic|epic|immersive|dramatic|blockbuster|trailer|3d|awe[- ]?inspiring)\b/i],
  ['restrained', /\b(minimal(?:ist)?|calm|quiet|understated|elegant|subtle|restrained|serene|refined|sober|respectful|gentle)\b/i],
  ['expressive', /\b(bold|loud|vibrant|energetic|fun|dynamic|exciting|hype|wild|crazy|over the top|colou?rful|punchy)\b/i],
];
const READING = /\b(portfolio|resume|résumé|cv|blog|essay|article|newsletter|about me|biography|obituary|in memory|documentation|report|case study|long-?read)\b/i;
const SOLEMN = /\b(memorial|cemetery|cathedral|church|chapel|mosque|synagogue|temple|shrine|war|genocide|holocaust|funeral|grave|tomb|minimalist)\b/i;
const BY_GENRE = { game: 'cinematic', film: 'cinematic', tech: 'cinematic', nature: 'cinematic', place: 'cinematic', character: 'expressive', product: 'expressive', art: 'expressive', food: 'expressive', meme: 'experimental', brutal: 'experimental', fashion: 'restrained', editorial: 'restrained', history: 'restrained', tribute: 'restrained' };
const WHY_GENRE = { game: 'a game franchise', film: 'a film or show', tech: 'futuristic technology', nature: 'a natural world', place: 'an iconic place', character: 'a character', product: 'an iconic product', art: 'an art subject', food: 'a food subject', meme: 'an internet meme', brutal: 'a brutalist subject', fashion: 'a fashion subject', editorial: 'a text-led subject', history: 'a historical subject', tribute: 'a tribute' };
function ambitionOf(u, ctx) {
  const c = ctx || {}; u = u || {}; const brief = String(u.brief || ''); const genre = c.genre || genreOf(u, c.page); const reg = registerOf(u);
  const quiet = QUIET_REGISTERS.includes(reg); const inv = c.inv || null;
  const done = (level, why) => (level === 'cinematic' && inv && inv.distinct === 0 ? { level: 'expressive', why: `${why}, but no picture to stage` } : { level, why });
  const asked = WANT.find(([, re]) => re.test(brief)); if (asked) return done(asked[0], 'the brief asks for it');
  if (u.kind === 'personal' || (u.identity && u.identity.type === 'personal') || genre === 'tribute') return { level: 'restrained', why: 'a personal page' };
  if (READING.test(brief)) return { level: 'restrained', why: 'a page to be read' };
  if (quiet && u.tone && u.tone.fromBrief) return { level: 'restrained', why: 'the brief asks for a quiet tone' };
  const what = `${u.subject || ''} ${(u.identity && u.identity.what) || ''}`;
  if (genre === 'place' && SOLEMN.test(what)) return { level: 'restrained', why: 'a solemn place' };
  // (a calm music genre is an atmosphere to live in: slow, but staged -- not a column of text)
  if (genre === 'music') return done(quiet ? 'cinematic' : 'expressive', quiet ? 'an atmosphere to live in' : 'a music subject');
  if (BY_GENRE[genre]) return done(BY_GENRE[genre], WHY_GENRE[genre]);
  return done(quiet ? 'restrained' : 'expressive', quiet ? 'a quiet subject' : 'this subject');
}
// how the ambition bends the personalities (multipliers) and the modes (weights; 0 = never)
const AMB_PERS = {
  restrained: { chaotic: 0.3, kinetic: 0.6, playful: 0.7 },
  expressive: { still: 0.1, editorial: 0.4, luxe: 0.5 },
  cinematic: { still: 0.1, editorial: 0.3, luxe: 0.6, cinematic: 1.1 },
  experimental: { still: 0, editorial: 0.25, luxe: 0.3, chaotic: 1.6, kinetic: 1.3, mechanical: 1.2 },
};
const AMB_MODE = {
  restrained: { quiet: 3, editorial: 3, expressive: 0.6, immersive: 0 },
  expressive: { quiet: 0, editorial: 0.6, expressive: 3, immersive: 1.5 },
  // (immersive stays the peak, not the default: an expressive page with a cinematic personality is already cinematic)
  cinematic: { quiet: 0, editorial: 0.4, expressive: 2.5, immersive: 2.5 },
  experimental: { quiet: 0, editorial: 0.3, expressive: 3, immersive: 2 },
};
// ---- concepts: the page's named idea, built from the existing families (no new renderer): which arcs carry it
const CONCEPTS = {
  campaign: { families: { 'colour-progression': 3, 'poster-to-scene': 2.5, 'object-story': 0.8 }, personality: { playful: 1.3, kinetic: 1.3, chaotic: 1.2 } },
  cinematic: { families: { 'cinematic-chapters': 3, 'mask-transition': 1.2, 'layered-parallax': 1 }, personality: { cinematic: 1.5 } },
  'object-led': { families: { 'object-story': 3, 'colour-progression': 0.8 }, personality: {} },
  'world-building': { families: { 'layered-parallax': 3, 'cinematic-chapters': 1.2, 'horizontal-gallery': 0.8 }, personality: { cinematic: 1.2 } },
  'kinetic-type': { families: { 'typography-led': 3, 'poster-to-scene': 1.2 }, personality: { mechanical: 1.5, kinetic: 1.5 } },
  'visual-journey': { families: { 'horizontal-gallery': 3, 'gallery-progression': 1.2, 'layered-parallax': 0.8 }, personality: { kinetic: 1.2 } },
  // (a subject worth turning in depth: the arcs the spatial layer can use -- whether it is used stays the system's decision)
  'spatial-showcase': { families: { 'object-story': 2, 'cinematic-chapters': 2, 'layered-parallax': 2 }, personality: { cinematic: 1.2 }, modes: { immersive: 2 } },
  editorial: { families: { 'editorial-sticky': 3, 'gallery-progression': 2, 'mask-transition': 2 }, personality: { editorial: 1.3, luxe: 1.2 } },
};
const CONCEPT_NAMES = Object.keys(CONCEPTS);
const CONCEPT_W = {
  restrained: { editorial: 4, 'visual-journey': 1.2, cinematic: 1, 'kinetic-type': 0.5 },
  expressive: { campaign: 2.5, 'object-led': 2, 'kinetic-type': 2, 'visual-journey': 1.5, 'world-building': 1.3, cinematic: 1, editorial: 0.25 },
  cinematic: { cinematic: 3, 'world-building': 2.5, 'spatial-showcase': 2, 'object-led': 1.5, campaign: 1, 'visual-journey': 1, editorial: 0.1 },
  experimental: { 'kinetic-type': 2.5, campaign: 2.5, 'world-building': 2, 'object-led': 1.5, 'spatial-showcase': 1, editorial: 0.05 },
};
const CONCEPT_GENRE = {
  game: { 'spatial-showcase': 1.5, cinematic: 1.3, 'world-building': 1.4, 'object-led': 1.3, campaign: 1.2 },
  character: { 'object-led': 1.6, campaign: 1.4, 'world-building': 1.2 },
  product: { 'object-led': 1.8, campaign: 1.5, 'spatial-showcase': 1.4 },
  tech: { 'spatial-showcase': 1.5, 'world-building': 1.3, 'kinetic-type': 1.3, cinematic: 1.2 },
  place: { cinematic: 1.6, 'world-building': 1.4, 'visual-journey': 1.3, 'object-led': 0.3 },
  meme: { campaign: 1.5, 'kinetic-type': 1.5, 'object-led': 1.3 },
  music: { 'world-building': 1.5, 'kinetic-type': 1.3, 'visual-journey': 1.1 },
  fashion: { editorial: 1.5, 'visual-journey': 1.3, campaign: 1.2 },
  film: { cinematic: 1.6, 'world-building': 1.2 },
  nature: { cinematic: 1.4, 'world-building': 1.3, 'visual-journey': 1.2 },
  food: { campaign: 1.5, 'object-led': 1.4 },
  art: { 'visual-journey': 1.3, 'kinetic-type': 1.2 },
};

// ---- what the pictures make possible
// the same picture reached twice -- an owner's upload and the found picture it came from, or two sizes of one picture -- has
// the same shape and the same measured colours: it is one picture, however many times it is in the inventory
const { sameAs, distinctPictures } = POOL;
const subjectish = x => x.a.origin === 'upload' || !x.a.curation || x.a.curation.role === 'subject' || x.a.curation.role === 'detail' || x.a.curation.role === 'environment';
// what the page's pictures make possible -- from the ONE pool (pool.js): discovered and uploaded pictures together, the
// owner's logo left out (a header mark, never a scene picture), and the owner's chosen main picture as `main`
function inventory(assets, opts) {
  const pool = (opts && opts.pool) || POOL.build(assets, { mainAsset: opts && opts.mainAsset });
  const keep = new Set(); pool.pictures.forEach(p => { keep.add(p.id); if (p.cut) keep.add(p.cut); });
  const live = (assets || []).filter(a => a && keep.has(a.id) && a.assess);
  const usable = live;
  const withP = usable.map(a => ({ a, p: F.profile(a) }));
  const cut = withP.filter(x => x.p.free);
  const photos = withP.filter(x => !x.p.free && !(x.a.cutout));
  const subjectish = x => x.a.origin === 'upload' || !x.a.curation || x.a.curation.role === 'subject' || x.a.curation.role === 'detail';
  // (the main picture leads as its cut-out when it has one, else as itself; with no choice, the best picture of the subject)
  const own = pool.main && withP.find(x => x.a.id === (pool.main.cut || pool.main.id));
  const main = own || (cut.find(subjectish) || photos.filter(subjectish).sort((x, y) => (y.p.big - x.p.big) || ((x.p.tight ? 1 : 0) - (y.p.tight ? 1 : 0)))[0] || cut[0] || photos[0]) || null;
  // photos that fill a desktop scene without losing more than a bleed's share, and are not already tight
  const bleedable = photos.filter(x => !x.p.tight && F.coverCrop(x.p.aspect, 1.6).crop <= F.budgetFor(x.a, 'bleed') && (x.p.big || x.a.origin === 'upload'));
  const cinema = photos.filter(x => !x.p.tight && x.p.aspect >= 1.4 && x.p.big);
  // cut-outs of the same original count once (a picture and its cut-out are one picture)
  const distinct = new Set(withP.map(x => x.a.cutoutOf || x.a.id)).size;
  // how many times pictures may appear on the page in all (validate2: a photo twice, a picture with a cut-out three times)
  const ids = [...new Set(withP.map(x => x.a.cutoutOf || x.a.id))];
  const uses = ids.reduce((t, id) => t + POOL.photoUses(ids.length) + (withP.some(x => x.a.cutoutOf === id) ? 1 : 0), 0);
  return { all: withP, cut, photos, main, bleedable, cinema, distinct, uses, pool };
}
// how many picture appearances an archetype needs (required, and what it takes when pictures are plentiful)
// (an actor scene -- `stage` -- takes none of its own: the actor is one picture, shown once, living across the run)
const NEED = { 'editorial-hero': [1, 1], cinematic: [1, 1], split: [1, 2], 'giant-type': [0, 1], shrine: [1, 1], offcanvas: [1, 1], framed: [1, 2], floating: [1, 3], collage: [3, 4], poster: [1, 1], magazine: [0, 1], strip: [3, 6], 'sticky-steps': [0, 2], text: [0, 0], image: [1, 1], luxe: [1, 1], dense: [0, 0], depth: [1, 2], brutalist: [0, 1], gallery: [2, 4],
  stage: [0, 0], campaign: [1, 1], splitscreen: [1, 1], 'fullscreen-object': [1, 1], orbit: [1, 1], index: [3, 6], scrapbook: [2, 4], takeover: [0, 0], chapters: [2, 5], lineup: [3, 6], cardstream: [3, 5], 'edge-crop': [1, 1] };

// which archetypes this page's pictures and words can carry (for the hero, `main` is the opening picture)
function eligible(layout, inv, content, hero) {
  const m = inv.main; const n = inv.distinct;
  switch (layout) {
    // (a full-bleed opening takes the best wide picture of the subject -- the director chooses it for this composition)
    case 'editorial-hero': return inv.bleedable.some(x => subjectish(x));
    case 'cinematic': return inv.cinema.some(x => subjectish(x));
    case 'offcanvas': case 'floating': case 'fullscreen-object': case 'stage': return inv.cut.length > 0;
    case 'shrine': case 'luxe': case 'framed': case 'split': case 'image': case 'depth': case 'campaign': return n >= 1;
    case 'splitscreen': return inv.photos.length >= 1;
    case 'poster': return n >= 1 && content.shortName;
    case 'giant-type': return content.shortName || !hero;
    case 'collage': case 'strip': case 'index': case 'cardstream': return n >= 3;
    case 'gallery': case 'scrapbook': return n >= 2;
    case 'chapters': return inv.bleedable.length >= 2;
    case 'lineup': return inv.cut.length >= 3 || n >= 4;
    case 'orbit': return n >= 1 && content.items >= 3;
    // an intentional edge crop needs a picture whose subject was located, with room around it
    case 'edge-crop': return inv.photos.some(x => !x.p.tight && x.p.source !== 'unknown' && x.p.big);
    case 'magazine': return content.prose;
    case 'sticky-steps': return content.items >= 2;
    case 'dense': return content.items >= 3;
    case 'text': case 'brutalist': case 'takeover': return true;
    default: return false;
  }
}
// the choreography an archetype supports (its natural scroll event first) -- only ones it has something to play with:
// a zoom-away needs a picture, a scale-through a word or halo to pass through, steps need lines, a track pictures
const NATURAL = {
  'editorial-hero': ['zoom-away', 'settle', 'depth'], cinematic: ['zoom-away', 'mask-reveal', 'depth'], offcanvas: ['travel', 'depth', 'settle'], floating: ['depth', 'travel', 'settle'],
  shrine: ['scale-through', 'settle', 'travel'], luxe: ['mask-reveal', 'settle', 'expand'], framed: ['mask-reveal', 'settle', 'expand', 'zoom-away'], split: ['settle', 'mask-reveal', 'type-wipe'],
  image: ['expand', 'zoom-away', 'mask-reveal', 'settle'], depth: ['depth'], poster: ['scale-through', 'type-wipe', 'depth'], 'giant-type': ['type-wipe', 'settle'],
  collage: ['depth', 'travel'], strip: ['track'], gallery: ['stack', 'pin-steps'], magazine: ['settle', 'type-wipe', 'mask-reveal'], 'sticky-steps': ['pin-steps'],
  dense: ['settle', 'type-wipe'], text: ['type-wipe', 'settle'], brutalist: ['type-wipe', 'settle', 'travel'],
  stage: ['actor'], campaign: ['scale-through', 'settle'], splitscreen: ['mask-reveal', 'settle'], 'fullscreen-object': ['travel', 'scale-through', 'settle'], orbit: ['travel', 'settle'],
  index: ['settle', 'mask-reveal'], scrapbook: ['depth', 'travel'], takeover: ['word-fill'], chapters: ['chapters'], lineup: ['depth', 'settle'], cardstream: ['cardstream'], 'edge-crop': ['depth', 'mask-reveal', 'settle'],
};
// choreographies that hold the scroll while they play
const PINNED_CHOREOS = ['pin-steps', 'zoom-away', 'scale-through', 'track', 'stack', 'chapters', 'cardstream', 'expand'];
// what content an archetype suits
const CARRIES = {
  'editorial-hero': 'opening', cinematic: 'picture', offcanvas: 'statement', floating: 'statement', shrine: 'statement', luxe: 'statement', framed: 'picture', split: 'statement',
  image: 'picture', depth: 'statement', poster: 'statement', 'giant-type': 'statement', collage: 'pictures', strip: 'pictures', gallery: 'pictures', magazine: 'prose',
  'sticky-steps': 'facts', dense: 'facts', text: 'statement', brutalist: 'facts',
  stage: 'statement', campaign: 'statement', splitscreen: 'statement', 'fullscreen-object': 'statement', orbit: 'facts', index: 'pictures', scrapbook: 'pictures', takeover: 'statement',
  chapters: 'pictures', lineup: 'pictures', cardstream: 'pictures', 'edge-crop': 'picture',
};

// ---- choreography families: each is a designed arc (its beats), with the subjects, personalities, modes and
// pictures it suits. A beat is a small pool of archetypes; the builder takes the one this page can carry.
const pool = s => Object.fromEntries(s.split('|').map(x => { const [k, w] = x.split(':'); return [k, Number(w || 1)]; }));
const FAMILY = {
  'object-story': {
    modes: ['expressive', 'immersive'], needs: inv => inv.cut.length > 0 && !!(inv.main && inv.main.p.free),
    genre: { meme: 2.5, food: 2.5, object: 2.5, fashion: 1.5, tech: 1.5, music: 1, art: 1, product: 3, character: 2.5, game: 2 }, personality: { playful: 2.5, kinetic: 2, chaotic: 2, cinematic: 1.5, luxe: 1.5, mechanical: 1 },
    scroll: { sequence: 2, continuous: 1.5 }, progression: { 'accent-takeover': 2.5, 'muted-to-saturated': 1.5, invert: 1 }, handoff: { overlap: 1.5, bleed: 1.5, cut: 1 },
    beats: (r, c) => { const L = Math.max(2, Math.min(c.lim.actor, c.mode === 'immersive' ? 3 + (r() < 0.5 ? 1 : 0) : 2 + (r() < 0.5 ? 1 : 0)));
      const run = Array.from({ length: L }, (_, i) => ({ run: true, carries: i ? (i === 1 && c.content.items >= 2 ? 'facts' : 'statement') : 'opening' }));
      return run.concat([{ pool: pool('lineup:2.5|shrine:1|gallery:1|collage:1'), release: true }, { body: true }, { closing: true }]); },
  },
  'cinematic-chapters': {
    modes: ['editorial', 'expressive', 'immersive'], needs: inv => inv.bleedable.length >= 2,
    genre: { film: 3, nature: 2.5, history: 2, fashion: 1.5, editorial: 1, object: 1, art: 1, place: 3, game: 2.5, tech: 1.5 }, personality: { cinematic: 3, luxe: 2, editorial: 1.5, still: 1 },
    scroll: { sequence: 2, continuous: 1.5 }, progression: { 'dark-to-light': 2, deepen: 1.5, gradient: 1 }, handoff: { bleed: 2, overlap: 1.5 },
    beats: () => [{ pool: pool('editorial-hero:3|cinematic:2|split:1'), hero: true }, { pool: pool('chapters') }, { pool: pool('takeover:2|text:1') }, { pool: pool('image:1|split:1|framed:1|edge-crop:1') }, { closing: true }],
  },
  'editorial-sticky': {
    modes: ['quiet', 'editorial', 'expressive'], needs: (inv, c) => c.items >= 2 || c.prose,
    genre: { editorial: 3, history: 2.5, art: 1.5, tech: 1, object: 1, nature: 1, tribute: 1.5, place: 1, product: 0.5 }, personality: { editorial: 3, still: 2, luxe: 1.5, mechanical: 1 },
    scroll: { flow: 3, snap: 1 }, progression: { steady: 2, journey: 1.5, 'warm-to-cool': 1 }, handoff: { cut: 2, overlap: 1 },
    beats: () => [{ pool: pool('split:2|magazine:2|framed:1|editorial-hero:1'), hero: true }, { pool: pool('sticky-steps:3|orbit:1') }, { pool: pool('takeover:2|text:1') }, { pool: pool('magazine:1|framed:1|index:1|edge-crop:1') }, { closing: true }],
  },
  'layered-parallax': {
    modes: ['editorial', 'expressive', 'immersive'], needs: inv => inv.distinct >= 2,
    genre: { nature: 1.5, meme: 1.5, music: 1.5, art: 1, object: 1, game: 2, place: 2, character: 1.5, tech: 1.5 }, personality: { cinematic: 2, chaotic: 2, playful: 1.5, luxe: 1 },
    scroll: { continuous: 2, flow: 1 }, progression: { deepen: 2, gradient: 1.5 }, handoff: { overlap: 1.5, carry: 1, bleed: 1 },
    beats: () => [{ pool: pool('offcanvas:2|floating:2|depth:1|poster:1'), hero: true }, { pool: pool('depth') }, { pool: pool('floating:1|collage:1|scrapbook:1') }, { pool: pool('text:1|takeover:1') }, { pool: pool('depth:1|image:1|edge-crop:1') }, { closing: true }],
  },
  'typography-led': {
    modes: ['quiet', 'editorial', 'expressive', 'immersive'], needs: () => true,
    genre: { tech: 2, art: 2, music: 2, editorial: 1.5, meme: 1, brutal: 2, game: 1, product: 1 }, personality: { mechanical: 3, kinetic: 2.5, editorial: 1.5, chaotic: 1.5 },
    scroll: { snap: 1.5, flow: 1.5, sequence: 1 }, progression: { invert: 2, 'muted-to-saturated': 1.5 }, handoff: { cut: 2, stack: 1 },
    beats: () => [{ pool: pool('giant-type:2|poster:1|takeover:1'), hero: true }, { pool: pool('takeover') }, { pool: pool('brutalist:1|dense:1|giant-type:1') }, { pool: pool('split:1|framed:1|edge-crop:1') }, { pool: pool('takeover:1|text:1') }, { closing: true }],
  },
  'horizontal-gallery': {
    modes: ['editorial', 'expressive', 'immersive'], needs: inv => inv.distinct >= 3,
    genre: { food: 1.5, art: 1.5, nature: 1.5, fashion: 1, object: 1, product: 1.5, place: 1.5, game: 1.5 }, personality: { kinetic: 2.5, playful: 2, chaotic: 1.5, editorial: 1 },
    scroll: { track: 3 }, progression: { journey: 2, invert: 1 }, handoff: { cut: 1.5, overlap: 1 },
    beats: () => [{ pool: pool('split:1|giant-type:1|poster:1|campaign:1'), hero: true }, { pool: pool('strip') }, { pool: pool('text:1|dense:1|takeover:1') }, { pool: pool('index:1|gallery:1|cardstream:1') }, { closing: true }],
  },
  'mask-transition': {
    modes: ['editorial', 'expressive', 'immersive'], needs: inv => inv.distinct >= 2,
    genre: { fashion: 2, nature: 1.5, editorial: 1.5, history: 1, place: 1.5, product: 1 }, personality: { cinematic: 2, editorial: 2, luxe: 2 },
    scroll: { flow: 2, continuous: 1 }, progression: { 'warm-to-cool': 2, 'dark-to-light': 1.5 }, handoff: { overlap: 2.5, cut: 1 },
    beats: () => [{ pool: pool('framed:2|luxe:1|split:1'), hero: true }, { pool: pool('framed:1|image:1'), choreo: 'expand' }, { pool: pool('text:1|takeover:1') }, { pool: pool('splitscreen:1|framed:1') }, { pool: pool('image:1|edge-crop:1'), choreo: 'mask-reveal' }, { closing: true }],
  },
  'poster-to-scene': {
    modes: ['expressive', 'immersive'], needs: (inv, c) => c.shortName && inv.distinct >= 1,
    genre: { music: 2, meme: 2, art: 1.5, food: 1, game: 2, character: 2, product: 1.5 }, personality: { chaotic: 2, kinetic: 2, playful: 1.5, mechanical: 1 },
    scroll: { sequence: 2, stack: 1 }, progression: { invert: 2, 'accent-takeover': 1.5 }, handoff: { stack: 1, overlap: 1.5, cut: 1 },
    beats: () => [{ pool: pool('poster'), hero: true }, { pool: pool('image:1|framed:1'), choreo: 'expand' }, { pool: pool('giant-type:1|takeover:1') }, { pool: pool('collage:1|strip:1|scrapbook:1') }, { closing: true }],
  },
  'gallery-progression': {
    modes: ['quiet', 'editorial', 'expressive'], needs: inv => inv.distinct >= 3,
    genre: { art: 2, nature: 1.5, tribute: 2, food: 1, fashion: 1, place: 1 }, personality: { playful: 1.5, editorial: 1.5, still: 1.5, luxe: 1 },
    scroll: { flow: 2, stack: 1 }, progression: { steady: 1.5, journey: 1.5 }, handoff: { cut: 1.5, overlap: 1 },
    beats: () => [{ pool: pool('framed:1|index:1|collage:1|luxe:1'), hero: true }, { pool: pool('gallery') }, { pool: pool('scrapbook:1|collage:1|index:1') }, { pool: pool('text') }, { closing: true }],
  },
  'colour-progression': {
    modes: ['editorial', 'expressive', 'immersive'], needs: inv => inv.distinct >= 1,
    genre: { food: 2, meme: 1.5, music: 1.5, fashion: 1, tech: 1, product: 2, character: 1.5, game: 1.5 }, personality: { playful: 2.5, kinetic: 2, chaotic: 2, mechanical: 1 },
    scroll: { flow: 1.5, continuous: 1.5 }, progression: { 'accent-takeover': 3 }, handoff: { bleed: 3 },
    beats: () => [{ pool: pool('campaign:2|splitscreen:1'), hero: true }, { pool: pool('splitscreen:1|campaign:1|fullscreen-object:1') }, { pool: pool('giant-type:1|takeover:1') }, { pool: pool('campaign:1|lineup:1|fullscreen-object:1') }, { closing: true }],
  },
};
// the mode a personality tends to (a register can pull it quieter)
const MODE_W = {
  still: { quiet: 4, editorial: 1 }, luxe: { quiet: 2, editorial: 2.5, expressive: 1 }, editorial: { quiet: 1.5, editorial: 3, expressive: 1 },
  cinematic: { editorial: 1, expressive: 2, immersive: 2.5 }, kinetic: { expressive: 2.5, immersive: 2 }, playful: { editorial: 1, expressive: 3, immersive: 1.5 },
  mechanical: { editorial: 2, expressive: 2, immersive: 1 }, chaotic: { expressive: 2, immersive: 2.5 },
};
const QUIET_REGISTERS = ['tender', 'reverent', 'serious', 'restrained'];
// the actor's poses along its run (x, y: offset from the scene's centre in vw / vh; s: scale; r: degrees). Rotation is
// scaled by the mode and dropped for calm personalities; the renderer halves every range on a phone.
const POSES = {
  showcase: [{ x: 18, y: 2, s: 1, r: -6 }, { x: -22, y: 0, s: 1.12, r: 8 }, { x: 20, y: 2, s: 1.26, r: -4 }, { x: -16, y: 4, s: 0.9, r: 10 }, { x: 0, y: 6, s: 0.72, r: 0 }],
  journey: [{ x: -18, y: 2, s: 0.95, r: 4 }, { x: 20, y: 0, s: 1.05, r: -6 }, { x: -20, y: 3, s: 1.15, r: 6 }, { x: 18, y: 4, s: 0.9, r: -4 }, { x: 0, y: 4, s: 0.8, r: 0 }],
  monument: [{ x: 18, y: 2, s: 1.08, r: 0 }, { x: -20, y: 0, s: 1.18, r: 0 }, { x: 20, y: 0, s: 1.18, r: 0 }, { x: 0, y: 0, s: 1.3, r: 0 }, { x: 0, y: 4, s: 0.85, r: 0 }],
  turn: [{ x: 16, y: 2, s: 1, r: -12 }, { x: -18, y: 0, s: 1.1, r: 12 }, { x: 18, y: 2, s: 1.2, r: -10 }, { x: -12, y: 3, s: 0.95, r: 14 }, { x: 0, y: 5, s: 0.8, r: 0 }],
};
const POSE_BY = { playful: 'turn', chaotic: 'turn', kinetic: 'showcase', mechanical: 'showcase', cinematic: 'monument', luxe: 'monument', editorial: 'journey', still: 'monument' };

// ---- the recipe
function contentOf(input) {
  const facts = (input.facts || []).filter(f => f && f.text);
  const sup = input.supplied || {}; const supN = ((sup.facts || []).length + (sup.memories || []).length);
  const name = String((input.understanding && (input.understanding.name || (input.understanding.identity && input.understanding.identity.name) || input.understanding.subject)) || '');
  return { facts: facts.length, items: Math.max(facts.filter(f => f.text.length <= 240).length, supN), prose: facts.some(f => f.text.length > 120) || supN >= 2, dated: facts.filter(f => /\b(1[0-9]{3}|20[0-4][0-9])\b/.test(f.text)).length, shortName: name.length > 0 && name.length <= 22 && name.split(/\s+/).length <= 3 };
}
function familyFits(family, mode, inv, content) { const f = FAMILY[family]; return !!f && f.modes.includes(mode) && f.needs(inv, content); }

function buildRecipe(r, input, personality, family, mode, inv, content, genre, cover) {
  const st = STYLE[personality]; const fam = FAMILY[family]; const lim = MODE_LIMITS[mode];
  const typo = weighted(r, st.typo); const nav = weighted(r, st.nav); const density = weighted(r, st.density); const depth = weighted(r, st.depth);
  const scroll = weighted(r, fam.scroll) || weighted(r, st.scroll); const progression = weighted(r, fam.progression) || weighted(r, st.progression);
  const beats = fam.beats(r, { mode, inv, content, lim });
  // the budgets the scenes draw on: picture appearances (each picture may appear two or three times; the actor is one) and
  // lines of facts (the opening quotes one)
  let usesLeft = inv.uses - (inv.main ? 1 : 0); let itemsLeft = Math.max(0, content.items - (content.facts ? 1 : 0)); let prose = content.prose;
  const used = new Map(); const scenes = [];
  const fits = (k, i, hero) => {
    if (i && k === scenes[i - 1].layout && k !== 'stage') return false;
    if ((used.get(k) || 0) >= 2 && k !== 'stage') return false;
    if (!eligible(k, inv, { ...content, items: itemsLeft, prose }, hero)) return false;
    if (!hero && (NEED[k] || [0])[0] > usesLeft) return false;
    if (k === 'dense' && itemsLeft < 3) return false;
    if ((k === 'sticky-steps' || k === 'orbit') && itemsLeft < 2) return false;
    if (mode === 'quiet' && ['track', 'chapters', 'cardstream'].includes((NATURAL[k] || [])[0])) return false;
    return true;
  };
  beats.forEach((b, i) => {
    const hero = i === 0; const last = i === beats.length - 1;
    let layout;
    if (b.run) layout = 'stage';
    else {
      let p = b.pool;
      if (b.body) p = st.body;
      if (b.closing) { p = { text: 2 }; ['shrine', 'luxe', 'image', 'framed', 'poster', 'giant-type', 'takeover'].forEach(k => { if (st.body[k] || st.hero[k]) p[k] = 0.8; }); }
      layout = weighted(r, p, k => fits(k, i, hero)) || weighted(r, st.body, k => fits(k, i, hero)) || (hero ? (inv.main ? (inv.main.p.free ? 'shrine' : 'split') : 'giant-type') : itemsLeft >= 2 ? 'sticky-steps' : 'text');
    }
    used.set(layout, (used.get(layout) || 0) + 1);
    const c = CARRIES[layout]; const need = NEED[layout] || [0, 0];
    if (!hero) usesLeft -= Math.min(usesLeft, Math.max(need[0], Math.min(need[1], usesLeft - (beats.length - 1 - i))));
    const carries = hero ? 'opening' : last ? 'closing' : b.carries || c;
    itemsLeft -= Math.min(itemsLeft, layout === 'dense' ? 5 : layout === 'sticky-steps' || layout === 'brutalist' || layout === 'orbit' ? 4 : carries === 'facts' ? 3 : 1);
    if (c === 'prose') prose = false;
    const nat = NATURAL[layout] || ['settle'];
    let choreo = b.choreo && (nat.includes(b.choreo) || b.choreo === 'mask-reveal') ? b.choreo : weighted(r, Object.fromEntries(nat.map((k, j) => [k, (st.choreo[k] || 0.6) * (j ? 1 : 1.5)]))) || nat[0];
    if (b.run && carries === 'facts') choreo = 'pin-steps'; // the actor holds while each line takes its turn
    const handoff = hero ? 'cut' : b.run || (beats[i - 1] && beats[i - 1].run && !b.release) ? 'cut' : weighted(r, fam.handoff) || 'cut';
    scenes.push({ layout, choreo, handoff, carries, ...(b.run ? { run: true } : {}) });
  });
  // the pictures: the chosen page is held to the pictures it has and planned around them (its candidates are compared as
  // their families designed them -- coverage never decides which direction wins)
  if (cover) { coverPictures(r, scenes, inv, content, st, input); planVisuals(scenes, inv, content); }
  // the mode bounds the whole: how many scenes hold the scroll, and how many are driven by it at all
  let pins = 0, driven = 0;
  scenes.forEach(s => {
    const pinned = PINNED_CHOREOS.includes(s.choreo) || (s.layout === 'takeover' && lim.pins > 1);
    if (pinned) { if (pins >= lim.pins) { s.choreo = (NATURAL[s.layout] || []).find(c => !PINNED_CHOREOS.includes(c) && c !== 'word-fill') || (s.layout === 'takeover' ? 'word-fill' : 'settle'); } else pins++; }
    if (s.choreo !== 'settle' && !s.run) { if (driven >= lim.driven) s.choreo = s.layout === 'takeover' ? 'word-fill' : 'settle'; else driven++; }
  });
  if (mode === 'quiet') scenes.forEach(s => { if (!['settle', 'mask-reveal', 'type-wipe', 'word-fill'].includes(s.choreo)) s.choreo = 'settle'; if (s.handoff === 'carry' || s.handoff === 'stack') s.handoff = 'cut'; });
  // scroll-model touches that do not break the family's arc
  if (scroll === 'stack') scenes.forEach((s, i) => { if (i > 1 && !s.run && !(scenes[i - 1] && scenes[i - 1].run) && i % 2 === 0 && s.handoff !== 'stack') s.handoff = 'stack'; });
  if (scroll === 'snap') scenes.forEach(s => { if (s.handoff === 'stack') s.handoff = 'cut'; });
  // a carry needs a picture on both sides of the seam (and never inside the actor's run -- the actor is the carry there)
  scenes.forEach((s, i) => { if (s.handoff === 'carry' && (i === 0 || s.run || scenes[i - 1].run || ['text', 'dense', 'brutalist', 'magazine', 'takeover'].includes(s.layout) || ['text', 'dense', 'brutalist', 'magazine', 'strip', 'takeover'].includes(scenes[i - 1].layout))) s.handoff = 'overlap'; });
  // the actor's run: its poses, scaled for the mode (calm personalities never tilt the subject)
  let actor = null;
  const runIdx = scenes.map((s, i) => (s.run ? i : -1)).filter(i => i >= 0);
  if (runIdx.length >= 2) {
    const set = POSES[POSE_BY[personality] || 'showcase']; const rot = ['luxe', 'still', 'cinematic'].includes(personality) ? 0 : lim.rotate;
    actor = { from: runIdx[0], to: runIdx[runIdx.length - 1], poses: runIdx.map((_, k) => { const p = set[Math.min(k, set.length - 1)]; return { x: p.x, y: p.y, s: p.s, r: Math.round(p.r * rot) }; }), exit: scenes[runIdx[runIdx.length - 1] + 1] && scenes[runIdx[runIdx.length - 1] + 1].layout === 'lineup' ? 'rejoin' : r() < 0.5 ? 'offstage' : 'shrink' };
  }
  // the page as one timeline: its rhythm, its two or three memorable moments, how each scene becomes the next, and who
  // lives across scenes (timeline.js) -- planned now, so pages can be compared by how they move, not only by layout
  const flow = require('./timeline').planFlow(r, { family, mode, personality, typo, scenes: scenes.map(x => ({ layout: x.layout, choreo: x.choreo, carries: x.carries })), actor: actor ? { from: actor.from, to: actor.to } : null, shortName: content.shortName });
  scenes.forEach(s => { delete s.run; delete s.covered; });
  const M = MOTION[personality];
  const intensity = Math.max(1, Math.min(5, MODES.indexOf(mode) + 1 + (M.range > 1 ? 1 : 0)));
  const recipe = { family, mode, personality, scroll, typo, nav, density, progression, depth, intensity, genre, scenes, ...(actor ? { actor } : {}), flow };
  recipe.behavior = require('./timeline').behavior(flow, { progression, scroll });
  recipe.recipe = fingerprint(recipe);
  recipe.why = `${genre === 'object' ? 'this subject' : `a ${genre} subject`}${registerOf(input.understanding) ? `, ${registerOf(input.understanding)}` : ''}: a ${family.replace(/-/g, ' ')} arc, ${mode}, with ${M.label} motion${actor ? ' and one subject carried across the opening scenes' : ''}`;
  return recipe;
}

// ---- a visual subject is shown: the scenes follow the pictures that exist
// A family's arc was written as a sequence of compositions; some of them carry words alone (a statement set large, a
// colour takeover). With pictures in the pool those became "giant colour blocks with floating text" while good pictures
// sat unused. So the recipe is held to its pictures: the opening is always picture-led when the page has a picture; with
// three or more distinct pictures every scene shows one, with two at most one scene is words alone, with one at most one
// (the page reuses its picture through crops, its cut-out and a closing return instead). A requested premium hero video
// opens on a composition that shows a moving picture large.
const WORDS_ONLY = ['text', 'takeover', 'dense'];
const HERO_WEAK = ['text', 'takeover', 'dense', 'brutalist', 'giant-type', 'magazine'];
const VIDEO_HERO = ['editorial-hero', 'cinematic', 'image', 'splitscreen', 'split'];
// every composition that shows a picture as its subject (the widest set a covered scene may become)
const PICTURE_LED = ['split', 'image', 'framed', 'edge-crop', 'splitscreen', 'luxe', 'shrine', 'offcanvas', 'depth', 'campaign', 'fullscreen-object', 'poster', 'cinematic', 'floating'];
const PICTURE_FOR = { facts: ['sticky-steps', 'split', 'framed', 'edge-crop'], statement: ['split', 'image', 'edge-crop', 'splitscreen', 'framed', 'luxe', 'shrine', 'offcanvas'], closing: ['image', 'luxe', 'framed', 'shrine', 'split'], prose: ['magazine', 'split', 'framed'], pictures: ['gallery', 'collage', 'index', 'scrapbook', 'framed'], picture: ['image', 'framed', 'edge-crop', 'split'], opening: ['split', 'editorial-hero', 'framed', 'shrine', 'image'] };
function coverPictures(r, scenes, inv, content, st, input) {
  if (!inv.main || !scenes.length) return;
  const premium = !!(input && input.premium && input.premium.video);
  const ok = (k, i) => k !== (scenes[i - 1] || {}).layout && k !== (scenes[i + 1] || {}).layout && eligible(k, inv, Object.assign({}, content, { items: Math.max(2, content.items) }), i === 0);
  // (varied, in the page's own language: weighted by its personality's compositions, the ones that suit what the scene
  // carries counting more -- from a stream of its own, so the recipe's random stream is never drawn here and a page that
  // needs no change plans exactly as before)
  const rc = rng(`${(input && input.seed) || ''}|cover|${(input && input.understanding && input.understanding.subject) || ''}`);
  // (away from the compositions this account's recent pages used, as the recipe itself is)
  const recent = new Set(((input && input.history) || []).slice(-5).flatMap(h => { const p = parseFp(fingerprint(h)); return [p.hero].concat(p.body); }));
  // (and away from the compositions this page already uses: a page is several different compositions)
  const pick = (list, i, prefer) => { const t = {}; const here = new Set(scenes.map(s => s.layout)); list.forEach(k => { if (!WORDS_ONLY.includes(k)) t[k] = (t[k] || 0) + (st.body[k] || st.hero[k] || 0.5) * ((prefer || []).includes(k) ? 1.6 : 1) * (recent.has(k) ? 0.35 : 1) * (here.has(k) ? 0.4 : 1); }); return weighted(rc, t, k => ok(k, i)) || null; };
  const set = (s, layout) => { s.layout = layout; s.choreo = (NATURAL[layout] || ['settle'])[0]; s.covered = true; };
  // the opening
  const h = scenes[0];
  if (!h.run && (HERO_WEAK.includes(h.layout) || (premium && !VIDEO_HERO.includes(h.layout)))) {
    const want = premium ? VIDEO_HERO : Object.keys(st.hero).filter(k => !HERO_WEAK.includes(k)).concat(PICTURE_FOR.opening);
    const k = pick(want, 0, PICTURE_FOR.opening) || pick(PICTURE_FOR.opening, 0); if (k) set(h, k);
  }
  // the rest: at most `allowed` scenes of words alone; a takeover (a colour block) goes first, the closing last
  const allowed = inv.distinct >= 3 ? 0 : 1;
  const wordsOnly = scenes.map((s, i) => ({ s, i })).filter(x => x.i > 0 && !x.s.run && WORDS_ONLY.includes(x.s.layout))
    .sort((a, b) => (b.s.layout === 'takeover') - (a.s.layout === 'takeover') || (a.i === scenes.length - 1) - (b.i === scenes.length - 1));
  wordsOnly.slice(0, Math.max(0, wordsOnly.length - allowed)).forEach(({ s, i }) => {
    const fit = PICTURE_FOR[s.carries] || PICTURE_FOR.statement;
    const k = pick(fit.concat(Object.keys(st.body), PICTURE_LED), i, fit) || pick(['split', 'image', 'framed'], i);
    if (k) { set(s, k); if (s.carries === 'facts' && k !== 'sticky-steps') s.carries = 'statement'; }
  });
}

// the visual plan (pool.js): every scene's picture(s), decided with the scenes and before any words. A composition that
// only stands cut-outs on its stage (a shrine's plinth, an off-canvas figure, floating layers) is given a photo
// composition when its picture has no cut-out -- otherwise the photo is shown small in a large, empty scene.
const CUT_ONLY = { shrine: 'image', luxe: 'image', offcanvas: 'split', floating: 'split', 'fullscreen-object': 'split', orbit: 'split' };
function planVisuals(scenes, inv, content) {
  if (!inv.pool) return;
  const free = id => { const x = inv.all.find(y => y.a.id === id); return !!(x && x.p.free); };
  POOL.assign(scenes, inv.pool).forEach((v, i) => {
    if (!v) return; const s = scenes[i]; s.visual = v;
    if (CUT_ONLY[s.layout] && !free(v.asset)) {
      s.layout = i === 0 ? (eligible('editorial-hero', inv, content, true) ? 'editorial-hero' : 'split') : CUT_ONLY[s.layout];
      s.choreo = (NATURAL[s.layout] || ['settle'])[0];
    }
  });
}

function fingerprint(x) {
  if (!x) return '';
  if (typeof x === 'string') return x;
  const a = x.art || x; const scenes = x.scenes || [];
  const head = a.family ? `${a.family}.${a.mode || '?'}.${a.personality || '?'}` : `${a.personality || '?'}`;
  const layout = `${head}/${a.scroll || '?'}/${scenes.map(s => s.layout || 'free').join(',')}`.slice(0, 200);
  // (how the page moves travels with how it is laid out: a stored page's behaviour is its timeline's)
  const beh = a.behavior || (x.timeline && x.timeline.behavior) || '';
  return beh ? `${layout}#${beh}`.slice(0, 560) : layout;
}
function parseFp(fp) {
  const [head, scroll, list] = String(fp || '').split('#')[0].split('/'); const h = String(head || '').split('.');
  const layouts = (list || '').split(',').filter(Boolean);
  return h.length === 3 ? { family: h[0], mode: h[1], personality: h[2], scroll, hero: layouts[0] || '', body: layouts.slice(1) } : { family: '', mode: '', personality: head, scroll, hero: layouts[0] || '', body: layouts.slice(1) };
}
// how alike two pages are: their layout and art direction, and -- when both have one -- how they MOVE (actor lifecycle,
// transitions, rhythm, moments, typography behaviour, progression, scroll). Two pages with different layouts but the
// same choreography are still alike.
function similarity(a, b) {
  const fa = fingerprint(a), fb = fingerprint(b); const L = layoutSimilarity(fa, fb);
  const ba = fa.split('#')[1], bb = fb.split('#')[1];
  return ba && bb ? +(0.45 * L + 0.55 * require('./timeline').behaviorSimilarity(ba, bb)).toFixed(3) : L;
}
function layoutSimilarity(fa, fb) {
  const x = parseFp(fa), y = parseFp(fb);
  if (!x.personality || !y.personality) return 0;
  const A = new Set(x.body), B = new Set(y.body); const inter = [...A].filter(k => B.has(k)).length; const uni = new Set([...A, ...B]).size || 1;
  const fam = x.family && y.family ? 0.2 * (x.family === y.family) + 0.1 * (x.mode === y.mode) : 0;
  const w = x.family && y.family ? 1 : 1 / 0.7; // (an old fingerprint has no family or mode: the rest counts for all of it)
  return +Math.min(1, fam + w * (0.2 * (x.personality === y.personality) + 0.1 * (x.scroll === y.scroll) + 0.15 * (x.hero === y.hero) + 0.25 * (inter / uni))).toFixed(3);
}

// input: { understanding, assets, facts, supplied, page, seed, history: [fingerprints], avoid: fingerprint, prefer: {personality?, family?, mode?} }
function choose(input) {
  const inp = input || {}; const u = inp.understanding || {};
  const r = rng(`${inp.seed || ''}|${u.subject || ''}|${u.brief || ''}`);
  const genre = genreOf(u, inp.page); const reg = registerOf(u);
  // the pictures first: one pool (discovered + uploaded + picked), its main picture, its logo kept apart
  const pool = inp.pool || POOL.build(inp.assets, { mainAsset: inp.mainAsset, personal: u.kind === 'personal' });
  const inv = inventory(inp.assets, { pool }); const content = contentOf(inp);
  // the ambition first (the subject, the owner's words, the purpose, the pictures), then everything inside it
  const amb = AMBITIONS.includes(inp.ambition) ? { level: inp.ambition, why: 'asked for' } : ambitionOf(u, { genre, page: inp.page, inv });
  const w = Object.assign({}, GENRE_WEIGHTS[genre] || GENRE_WEIGHTS.object);
  Object.entries(TONE_SHIFT[reg] || {}).forEach(([k, v]) => { w[k] = (w[k] || 0) + v; });
  if (u.kind === 'personal' && genre !== 'tribute') { w.chaotic = (w.chaotic || 0) - 1.5; w.editorial = (w.editorial || 0) + 1; }
  PERSONALITIES.forEach(k => { w[k] = Math.max(0, (w[k] || 0) * (AMB_PERS[amb.level][k] == null ? 1 : AMB_PERS[amb.level][k])); });
  const pref = inp.prefer || {};
  if (PERSONALITIES.includes(pref.personality)) w[pref.personality] += 6;
  const history = (inp.history || []).map(fingerprint).filter(Boolean).slice(-10);
  const avoid = inp.avoid ? fingerprint(inp.avoid) : '';
  // the concepts this subject and these pictures can carry (one of its families must fit some mode the ambition allows)
  const modesOk = MODES.filter(m => AMB_MODE[amb.level][m] > 0);
  const cw = {}; CONCEPT_NAMES.forEach(k => {
    const fits = Object.keys(CONCEPTS[k].families).some(f => modesOk.some(m => familyFits(f, m, inv, content)));
    if (fits) cw[k] = (CONCEPT_W[amb.level][k] || 0) * ((CONCEPT_GENRE[genre] || {})[k] || 1);
  });
  // (an explicit preference is a request: the concepts built on the preferred family lead)
  if (FAMILIES.includes(pref.family)) { const top = Math.max(...Object.values(cw), 1); CONCEPT_NAMES.forEach(k => { if (CONCEPTS[k].families[pref.family] >= 2) cw[k] = top * 4; }); }
  const cwMax = Math.max(...Object.values(cw), 0.0001);
  // several candidates, each a concept, a personality, a mode and a family that suit the subject and each other; the
  // best suits the subject and its ambition and differs most from what this account (and this page) already has
  let best = null;
  for (let i = 0; i < 16; i++) {
    const concept = weighted(r, cw) || 'kinetic-type'; const C = CONCEPTS[concept];
    const pw = Object.fromEntries(PERSONALITIES.map(k => [k, w[k] * (C.personality[k] || 1)]));
    const personality = weighted(r, pw) || 'editorial';
    const mw = {}; MODES.forEach(m => { const a = AMB_MODE[amb.level][m]; mw[m] = a > 0 ? (((MODE_W[personality] || MODE_W.editorial)[m] || 0) * 0.5 + a + ((C.modes || {})[m] || 0)) : 0; });
    if (MODES.includes(pref.mode)) mw[pref.mode] = (mw[pref.mode] || 0) + 6;
    const mode = weighted(r, mw) || 'editorial';
    const fw = {}; FAMILIES.forEach(f => { if (!familyFits(f, mode, inv, content)) return; const F0 = FAMILY[f]; fw[f] = (0.4 + (F0.genre[genre] || 0.3)) * (0.4 + (F0.personality[personality] || 0.2)) * (C.families[f] || 0.15) + (pref.family === f ? 20 : 0); });
    const family = weighted(r, fw) || 'typography-led';
    if (!familyFits(family, mode, inv, content)) continue;
    const at = r.at(); const cand = buildRecipe(r, inp, personality, family, mode, inv, content, genre);
    const suit = w[personality] / Math.max(...Object.values(w), 1) + (fw[family] || 0) / Math.max(...Object.values(fw), 1);
    // (how well the candidate keeps the ambition and the concept: history may steer between suitable directions, never
    // out of them -- real runs: a game franchise drawn as luxe editorial because its suitable recipes had been used)
    // (a soft pull: the concept was already drawn by its weight -- a hard bonus made one concept win every seed)
    const fit = 0.5 * (pref.mode === mode ? 1 : AMB_MODE[amb.level][mode] / Math.max(...Object.values(AMB_MODE[amb.level]))) + 0.4 * Math.min(1, (cw[concept] || 0) / cwMax) + (C.families[family] ? 0.4 : 0);
    const past = history.length ? Math.max(...history.map(h => similarity(cand.recipe, h))) : 0;
    const again = avoid ? similarity(cand.recipe, avoid) : 0;
    const variety = new Set(cand.scenes.map(s => s.layout)).size / cand.scenes.length + new Set(cand.scenes.map(s => s.choreo)).size / cand.scenes.length * 0.5;
    // (a family this account used recently costs more than its share of the fingerprint: the arc is what reads as sameness)
    const famSeen = history.filter(h => parseFp(h).family === family).length;
    const wanted = (pref.mode === mode ? 2 : 0) + (pref.family === family ? 2 : 0);
    const score = suit * 1.5 + fit * 1.5 + variety - past * 2 - again * 3 - famSeen * 0.6 + wanted + r() * 0.15;
    if (!best || score > best.score) best = { score, cand, past, again, concept, rebuild: [at, personality, family, mode] };
  }
  if (!best) { const at = r.at(); const cand = buildRecipe(r, inp, 'editorial', 'typography-led', 'editorial', inv, content, genre); best = { cand, past: 0, again: 0, concept: 'kinetic-type', rebuild: [at, 'editorial', 'typography-led', 'editorial'] }; }
  // the winner, built again from the same point of the random stream -- identical up to its pictures -- and held to them
  if (inv.main) { const [at, pp, ff, mm] = best.rebuild; best.cand = buildRecipe(rng('').from(at), inp, pp, ff, mm, inv, content, genre, true); }
  const out = Object.assign(best.cand, { ambition: amb.level, concept: best.concept, novelty: +(1 - Math.max(best.past, best.again)).toFixed(2) });
  out.why = `${amb.level} (${amb.why}) -- a ${best.concept.replace(/-/g, ' ')} concept: ${out.why}`.slice(0, 240);
  // (the visual plan was made with the scenes: out.scenes[i].visual -- the words are written for those pictures)
  out.pool = { main: pool.main, logo: pool.logo, counts: pool.counts, excluded: pool.excluded.slice(0, 12) };
  if (inp.premium && inp.premium.video) out.premium = { intent: inp.premium.intent, source: inp.premium.source || (pool.main && pool.main.id) || null };
  return out;
}

// the page-level art as it is stored in a plan
function normaliseArt(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const personality = oneOf(raw.personality, PERSONALITIES, null); if (!personality) return null;
  const s = (v, n) => String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]/g, '').slice(0, n);
  return {
    personality, scroll: oneOf(raw.scroll, SCROLLS, 'flow'), typo: oneOf(raw.typo, TYPOS, 'editorial'), nav: oneOf(raw.nav, NAVS, 'bar'),
    density: oneOf(raw.density, DENSITIES, 'balanced'), progression: oneOf(raw.progression, PROGRESSIONS, 'steady'), depth: oneOf(raw.depth, DEPTHS, 'layered'),
    intensity: Math.max(1, Math.min(5, Math.round(Number(raw.intensity) || 3))), recipe: s(raw.recipe, 560), why: s(raw.why, 240), genre: s(raw.genre, 20),
    // (the family and mode were added later: a page saved before them keeps exactly what it had)
    ...(FAMILIES.includes(raw.family) ? { family: raw.family } : {}), ...(MODES.includes(raw.mode) ? { mode: raw.mode } : {}),
    ...(AMBITIONS.includes(raw.ambition) ? { ambition: raw.ambition } : {}), ...(CONCEPT_NAMES.includes(raw.concept) ? { concept: raw.concept } : {}),
    ...(typeof raw.behavior === 'string' && raw.behavior ? { behavior: s(raw.behavior, 360) } : {}),
  };
}

module.exports = { layoutSimilarity, FAMILIES, MODES, MODE_LIMITS, FAMILY, SCENE_TYPES, EXITS, TREATMENTS, POSES, PINNED_CHOREOS, familyFits, distinctPictures, sameAs, PERSONALITIES, SCROLLS, LAYOUTS, CHOREOS, HANDOFFS, TYPOS, NAVS, DENSITIES, PROGRESSIONS, DEPTHS, MOTION, STYLE, NATURAL, CARRIES, NEED, choose, normaliseArt, fingerprint, similarity, genreOf, inventory, eligible, rng, ambitionOf, AMBITIONS, CONCEPTS, CONCEPT_NAMES };
