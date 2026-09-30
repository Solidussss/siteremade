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
function rng(seed) { let s = 2166136261; for (const ch of String(seed)) { s ^= ch.charCodeAt(0); s = Math.imul(s, 16777619); } return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; }
function weighted(r, table, filter) {
  const entries = Object.entries(table).filter(([k, w]) => w > 0 && (!filter || filter(k)));
  if (!entries.length) return null;
  const total = entries.reduce((t, [, w]) => t + w, 0); let x = r() * total;
  for (const [k, w] of entries) { x -= w; if (x <= 0) return k; }
  return entries[entries.length - 1][0];
}
const oneOf = (v, list, d) => (list.includes(v) ? v : d);
function registerOf(u) { const t = u && u.tone; return String((t && typeof t === 'object' ? t.register : t) || '').toLowerCase(); }
function genreOf(u, page) {
  const text = [u && u.subject, u && u.brief, u && u.identity && u.identity.what, ...((u && u.motifs) || []), page && page.title, page && page.description].filter(Boolean).join(' ');
  const hit = GENRES.find(([, re]) => re.test(text));
  return hit ? hit[0] : 'object';
}

// ---- what the pictures make possible
// the same picture reached twice -- an owner's upload and the Commons file it came from, or two sizes of one file -- has
// the same shape and the same measured colours: it is one picture, however many times it is in the inventory
function sameAs(a, b) { const x = a.assess, y = b.assess; return !!(x && y && Math.abs((x.aspect || 0) - (y.aspect || 0)) < 0.006 && (x.colours || []).length >= 3 && (x.colours || []).slice(0, 3).join() === (y.colours || []).slice(0, 3).join()); }
function distinctPictures(list) { const out = []; list.forEach(a => { if (!a.cutoutOf && out.some(b => !b.cutoutOf && sameAs(a, b))) return; out.push(a); }); return out; }
const subjectish = x => x.a.origin === 'upload' || !x.a.curation || x.a.curation.role === 'subject' || x.a.curation.role === 'detail' || x.a.curation.role === 'environment';
function inventory(assets) {
  const live = distinctPictures((assets || []).filter(a => a && !a.removed && !a.failed && a.assess).sort((a, b) => (b.origin === 'upload') - (a.origin === 'upload')));
  const usable = live.filter(a => !(a.curation && (a.curation.role === 'unrelated' || a.curation.role === 'logo' || a.curation.role === 'reference' || a.curation.identity === 'other')));
  const withP = usable.map(a => ({ a, p: F.profile(a) }));
  const cut = withP.filter(x => x.p.free);
  const photos = withP.filter(x => !x.p.free && !(x.a.cutout));
  const subjectish = x => x.a.origin === 'upload' || !x.a.curation || x.a.curation.role === 'subject' || x.a.curation.role === 'detail';
  const main = (cut.find(subjectish) || photos.filter(subjectish).sort((x, y) => (y.p.big - x.p.big) || ((x.p.tight ? 1 : 0) - (y.p.tight ? 1 : 0)))[0] || cut[0] || photos[0]) || null;
  // photos that fill a desktop scene without losing more than a bleed's share, and are not already tight
  const bleedable = photos.filter(x => !x.p.tight && F.coverCrop(x.p.aspect, 1.6).crop <= F.budgetFor(x.a, 'bleed') && (x.p.big || x.a.origin === 'upload'));
  const cinema = photos.filter(x => !x.p.tight && x.p.aspect >= 1.4 && x.p.big);
  // cut-outs of the same original count once (a picture and its cut-out are one picture)
  const distinct = new Set(withP.map(x => x.a.cutoutOf || x.a.id)).size;
  // how many times pictures may appear on the page in all (validate2: a photo twice, a picture with a cut-out three times)
  const ids = [...new Set(withP.map(x => x.a.cutoutOf || x.a.id))];
  const uses = ids.reduce((t, id) => t + (withP.some(x => x.a.cutoutOf === id) ? 3 : 2), 0);
  return { all: withP, cut, photos, main, bleedable, cinema, distinct, uses };
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
    genre: { meme: 2.5, food: 2.5, object: 2.5, fashion: 1.5, tech: 1.5, music: 1, art: 1 }, personality: { playful: 2.5, kinetic: 2, chaotic: 2, cinematic: 1.5, luxe: 1.5, mechanical: 1 },
    scroll: { sequence: 2, continuous: 1.5 }, progression: { 'accent-takeover': 2.5, 'muted-to-saturated': 1.5, invert: 1 }, handoff: { overlap: 1.5, bleed: 1.5, cut: 1 },
    beats: (r, c) => { const L = Math.max(2, Math.min(c.lim.actor, c.mode === 'immersive' ? 3 + (r() < 0.5 ? 1 : 0) : 2 + (r() < 0.5 ? 1 : 0)));
      const run = Array.from({ length: L }, (_, i) => ({ run: true, carries: i ? (i === 1 && c.content.items >= 2 ? 'facts' : 'statement') : 'opening' }));
      return run.concat([{ pool: pool('lineup:2.5|shrine:1|gallery:1|collage:1'), release: true }, { body: true }, { closing: true }]); },
  },
  'cinematic-chapters': {
    modes: ['editorial', 'expressive', 'immersive'], needs: inv => inv.bleedable.length >= 2,
    genre: { film: 3, nature: 2.5, history: 2, fashion: 1.5, editorial: 1, object: 1, art: 1 }, personality: { cinematic: 3, luxe: 2, editorial: 1.5, still: 1 },
    scroll: { sequence: 2, continuous: 1.5 }, progression: { 'dark-to-light': 2, deepen: 1.5, gradient: 1 }, handoff: { bleed: 2, overlap: 1.5 },
    beats: () => [{ pool: pool('editorial-hero:3|cinematic:2|split:1'), hero: true }, { pool: pool('chapters') }, { pool: pool('takeover:2|text:1') }, { pool: pool('image:1|split:1|framed:1|edge-crop:1') }, { closing: true }],
  },
  'editorial-sticky': {
    modes: ['quiet', 'editorial', 'expressive'], needs: (inv, c) => c.items >= 2 || c.prose,
    genre: { editorial: 3, history: 2.5, art: 1.5, tech: 1, object: 1, nature: 1, tribute: 1.5 }, personality: { editorial: 3, still: 2, luxe: 1.5, mechanical: 1 },
    scroll: { flow: 3, snap: 1 }, progression: { steady: 2, journey: 1.5, 'warm-to-cool': 1 }, handoff: { cut: 2, overlap: 1 },
    beats: () => [{ pool: pool('split:2|magazine:2|framed:1|editorial-hero:1'), hero: true }, { pool: pool('sticky-steps:3|orbit:1') }, { pool: pool('takeover:2|text:1') }, { pool: pool('magazine:1|framed:1|index:1|edge-crop:1') }, { closing: true }],
  },
  'layered-parallax': {
    modes: ['editorial', 'expressive', 'immersive'], needs: inv => inv.distinct >= 2,
    genre: { nature: 1.5, meme: 1.5, music: 1.5, art: 1, object: 1 }, personality: { cinematic: 2, chaotic: 2, playful: 1.5, luxe: 1 },
    scroll: { continuous: 2, flow: 1 }, progression: { deepen: 2, gradient: 1.5 }, handoff: { overlap: 1.5, carry: 1, bleed: 1 },
    beats: () => [{ pool: pool('offcanvas:2|floating:2|depth:1|poster:1'), hero: true }, { pool: pool('depth') }, { pool: pool('floating:1|collage:1|scrapbook:1') }, { pool: pool('text:1|takeover:1') }, { pool: pool('depth:1|image:1|edge-crop:1') }, { closing: true }],
  },
  'typography-led': {
    modes: ['quiet', 'editorial', 'expressive', 'immersive'], needs: () => true,
    genre: { tech: 2, art: 2, music: 2, editorial: 1.5, meme: 1, brutal: 2 }, personality: { mechanical: 3, kinetic: 2.5, editorial: 1.5, chaotic: 1.5 },
    scroll: { snap: 1.5, flow: 1.5, sequence: 1 }, progression: { invert: 2, 'muted-to-saturated': 1.5 }, handoff: { cut: 2, stack: 1 },
    beats: () => [{ pool: pool('giant-type:2|poster:1|takeover:1'), hero: true }, { pool: pool('takeover') }, { pool: pool('brutalist:1|dense:1|giant-type:1') }, { pool: pool('split:1|framed:1|edge-crop:1') }, { pool: pool('takeover:1|text:1') }, { closing: true }],
  },
  'horizontal-gallery': {
    modes: ['editorial', 'expressive', 'immersive'], needs: inv => inv.distinct >= 3,
    genre: { food: 1.5, art: 1.5, nature: 1.5, fashion: 1, object: 1 }, personality: { kinetic: 2.5, playful: 2, chaotic: 1.5, editorial: 1 },
    scroll: { track: 3 }, progression: { journey: 2, invert: 1 }, handoff: { cut: 1.5, overlap: 1 },
    beats: () => [{ pool: pool('split:1|giant-type:1|poster:1|campaign:1'), hero: true }, { pool: pool('strip') }, { pool: pool('text:1|dense:1|takeover:1') }, { pool: pool('index:1|gallery:1|cardstream:1') }, { closing: true }],
  },
  'mask-transition': {
    modes: ['editorial', 'expressive', 'immersive'], needs: inv => inv.distinct >= 2,
    genre: { fashion: 2, nature: 1.5, editorial: 1.5, history: 1 }, personality: { cinematic: 2, editorial: 2, luxe: 2 },
    scroll: { flow: 2, continuous: 1 }, progression: { 'warm-to-cool': 2, 'dark-to-light': 1.5 }, handoff: { overlap: 2.5, cut: 1 },
    beats: () => [{ pool: pool('framed:2|luxe:1|split:1'), hero: true }, { pool: pool('framed:1|image:1'), choreo: 'expand' }, { pool: pool('text:1|takeover:1') }, { pool: pool('splitscreen:1|framed:1') }, { pool: pool('image:1|edge-crop:1'), choreo: 'mask-reveal' }, { closing: true }],
  },
  'poster-to-scene': {
    modes: ['expressive', 'immersive'], needs: (inv, c) => c.shortName && inv.distinct >= 1,
    genre: { music: 2, meme: 2, art: 1.5, food: 1 }, personality: { chaotic: 2, kinetic: 2, playful: 1.5, mechanical: 1 },
    scroll: { sequence: 2, stack: 1 }, progression: { invert: 2, 'accent-takeover': 1.5 }, handoff: { stack: 1, overlap: 1.5, cut: 1 },
    beats: () => [{ pool: pool('poster'), hero: true }, { pool: pool('image:1|framed:1'), choreo: 'expand' }, { pool: pool('giant-type:1|takeover:1') }, { pool: pool('collage:1|strip:1|scrapbook:1') }, { closing: true }],
  },
  'gallery-progression': {
    modes: ['quiet', 'editorial', 'expressive'], needs: inv => inv.distinct >= 3,
    genre: { art: 2, nature: 1.5, tribute: 2, food: 1, fashion: 1 }, personality: { playful: 1.5, editorial: 1.5, still: 1.5, luxe: 1 },
    scroll: { flow: 2, stack: 1 }, progression: { steady: 1.5, journey: 1.5 }, handoff: { cut: 1.5, overlap: 1 },
    beats: () => [{ pool: pool('framed:1|index:1|collage:1|luxe:1'), hero: true }, { pool: pool('gallery') }, { pool: pool('scrapbook:1|collage:1|index:1') }, { pool: pool('text') }, { closing: true }],
  },
  'colour-progression': {
    modes: ['editorial', 'expressive', 'immersive'], needs: inv => inv.distinct >= 1,
    genre: { food: 2, meme: 1.5, music: 1.5, fashion: 1, tech: 1 }, personality: { playful: 2.5, kinetic: 2, chaotic: 2, mechanical: 1 },
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

function buildRecipe(r, input, personality, family, mode, inv, content, genre) {
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
  scenes.forEach(s => { delete s.run; });
  const M = MOTION[personality];
  const intensity = Math.max(1, Math.min(5, MODES.indexOf(mode) + 1 + (M.range > 1 ? 1 : 0)));
  const recipe = { family, mode, personality, scroll, typo, nav, density, progression, depth, intensity, genre, scenes, ...(actor ? { actor } : {}) };
  recipe.recipe = fingerprint(recipe);
  recipe.why = `${genre === 'object' ? 'this subject' : `a ${genre} subject`}${registerOf(input.understanding) ? `, ${registerOf(input.understanding)}` : ''}: a ${family.replace(/-/g, ' ')} arc, ${mode}, with ${M.label} motion${actor ? ' and one subject carried across the opening scenes' : ''}`;
  return recipe;
}

function fingerprint(x) {
  if (!x) return '';
  if (typeof x === 'string') return x;
  const a = x.art || x; const scenes = x.scenes || [];
  const head = a.family ? `${a.family}.${a.mode || '?'}.${a.personality || '?'}` : `${a.personality || '?'}`;
  return `${head}/${a.scroll || '?'}/${scenes.map(s => s.layout || 'free').join(',')}`.slice(0, 200);
}
function parseFp(fp) {
  const [head, scroll, list] = String(fp || '').split('/'); const h = String(head || '').split('.');
  const layouts = (list || '').split(',').filter(Boolean);
  return h.length === 3 ? { family: h[0], mode: h[1], personality: h[2], scroll, hero: layouts[0] || '', body: layouts.slice(1) } : { family: '', mode: '', personality: head, scroll, hero: layouts[0] || '', body: layouts.slice(1) };
}
function similarity(a, b) {
  const x = parseFp(fingerprint(a)), y = parseFp(fingerprint(b));
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
  const w = Object.assign({}, GENRE_WEIGHTS[genre] || GENRE_WEIGHTS.object);
  Object.entries(TONE_SHIFT[reg] || {}).forEach(([k, v]) => { w[k] = (w[k] || 0) + v; });
  if (u.kind === 'personal' && genre !== 'tribute') { w.chaotic = (w.chaotic || 0) - 1.5; w.editorial = (w.editorial || 0) + 1; }
  PERSONALITIES.forEach(k => { w[k] = Math.max(0, w[k] || 0); });
  const pref = inp.prefer || {};
  if (PERSONALITIES.includes(pref.personality)) w[pref.personality] += 6;
  const inv = inventory(inp.assets); const content = contentOf(inp);
  const history = (inp.history || []).map(fingerprint).filter(Boolean).slice(-10);
  const avoid = inp.avoid ? fingerprint(inp.avoid) : '';
  // several candidates, each a personality, a mode and a family that suit the subject and each other; the best is the
  // one that suits the subject and differs most from what this account (and this page) already has
  let best = null;
  for (let i = 0; i < 14; i++) {
    const personality = weighted(r, w) || 'editorial';
    const mw = Object.assign({}, MODE_W[personality] || MODE_W.editorial);
    if (QUIET_REGISTERS.includes(reg) || u.kind === 'personal') { mw.quiet = (mw.quiet || 0) + 2; mw.editorial = (mw.editorial || 0) + 1; mw.immersive = 0; }
    if (MODES.includes(pref.mode)) mw[pref.mode] = (mw[pref.mode] || 0) + 6;
    const mode = weighted(r, mw) || 'editorial';
    const fw = {}; FAMILIES.forEach(f => { if (!familyFits(f, mode, inv, content)) return; const F0 = FAMILY[f]; fw[f] = (0.4 + (F0.genre[genre] || 0.3)) * (0.4 + (F0.personality[personality] || 0.2)) + (pref.family === f ? 20 : 0); });
    const family = weighted(r, fw) || 'typography-led';
    if (!familyFits(family, mode, inv, content)) continue;
    const cand = buildRecipe(r, inp, personality, family, mode, inv, content, genre);
    const suit = w[personality] / Math.max(...Object.values(w), 1) + (fw[family] || 0) / Math.max(...Object.values(fw), 1);
    const past = history.length ? Math.max(...history.map(h => similarity(cand.recipe, h))) : 0;
    const again = avoid ? similarity(cand.recipe, avoid) : 0;
    const variety = new Set(cand.scenes.map(s => s.layout)).size / cand.scenes.length + new Set(cand.scenes.map(s => s.choreo)).size / cand.scenes.length * 0.5;
    // (a family this account used recently costs more than its share of the fingerprint: the arc is what reads as sameness)
    const famSeen = history.filter(h => parseFp(h).family === family).length;
    const wanted = (pref.mode === mode ? 2 : 0) + (pref.family === family ? 2 : 0);
    const score = suit * 1.5 + variety - past * 2 - again * 3 - famSeen * 0.6 + wanted + r() * 0.15;
    if (!best || score > best.score) best = { score, cand, past, again };
  }
  if (!best) { const cand = buildRecipe(r, inp, 'editorial', 'typography-led', 'editorial', inv, content, genre); best = { cand, past: 0, again: 0 }; }
  return Object.assign(best.cand, { novelty: +(1 - Math.max(best.past, best.again)).toFixed(2) });
}

// the page-level art as it is stored in a plan
function normaliseArt(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const personality = oneOf(raw.personality, PERSONALITIES, null); if (!personality) return null;
  const s = (v, n) => String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]/g, '').slice(0, n);
  return {
    personality, scroll: oneOf(raw.scroll, SCROLLS, 'flow'), typo: oneOf(raw.typo, TYPOS, 'editorial'), nav: oneOf(raw.nav, NAVS, 'bar'),
    density: oneOf(raw.density, DENSITIES, 'balanced'), progression: oneOf(raw.progression, PROGRESSIONS, 'steady'), depth: oneOf(raw.depth, DEPTHS, 'layered'),
    intensity: Math.max(1, Math.min(5, Math.round(Number(raw.intensity) || 3))), recipe: s(raw.recipe, 200), why: s(raw.why, 240), genre: s(raw.genre, 20),
    // (the family and mode were added later: a page saved before them keeps exactly what it had)
    ...(FAMILIES.includes(raw.family) ? { family: raw.family } : {}), ...(MODES.includes(raw.mode) ? { mode: raw.mode } : {}),
  };
}

module.exports = { FAMILIES, MODES, MODE_LIMITS, FAMILY, SCENE_TYPES, EXITS, TREATMENTS, POSES, PINNED_CHOREOS, familyFits, distinctPictures, sameAs, PERSONALITIES, SCROLLS, LAYOUTS, CHOREOS, HANDOFFS, TYPOS, NAVS, DENSITIES, PROGRESSIONS, DEPTHS, MOTION, STYLE, NATURAL, CARRIES, NEED, choose, normaliseArt, fingerprint, similarity, genreOf, inventory, eligible, rng };
