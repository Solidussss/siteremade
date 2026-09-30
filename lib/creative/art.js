'use strict';
// CREATIVE — art direction. One coherent decision per page, made BEFORE the scenes are written, so a page has a
// language of its own instead of a list of unrelated effects:
//   personality   how things move (editorial, cinematic, kinetic, playful, luxe, mechanical, chaotic, still)
//   scroll        what scrolling does to the page (flow, sequence, continuous, track, stack, snap)
//   typo / nav / density / progression / depth / intensity
//   scenes        the scene architecture: a layout ARCHETYPE per scene (real, different compositions -- see
//                 archetypes.js), a scene choreography (what scroll does inside it) and a handoff (how it meets the
//                 previous scene), with what each scene carries (a statement, facts, pictures...)
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
const LAYOUTS = ['free', 'editorial-hero', 'split', 'giant-type', 'shrine', 'offcanvas', 'framed', 'floating', 'collage', 'poster', 'magazine', 'strip', 'sticky-steps', 'text', 'image', 'luxe', 'dense', 'depth', 'brutalist', 'cinematic', 'gallery'];
const CHOREOS = ['settle', 'pin-steps', 'zoom-away', 'scale-through', 'mask-reveal', 'type-wipe', 'track', 'stack', 'depth', 'travel'];
const HANDOFFS = ['cut', 'overlap', 'bleed', 'carry', 'stack'];
const TYPOS = ['editorial', 'giant', 'minimal', 'poster', 'mixed'];
const NAVS = ['bar', 'minimal', 'index'];
const DENSITIES = ['sparse', 'balanced', 'dense'];
const PROGRESSIONS = ['steady', 'deepen', 'journey', 'invert'];
const DEPTHS = ['flat', 'layered', 'deep'];

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
const NEED = { 'editorial-hero': [1, 1], cinematic: [1, 1], split: [1, 2], 'giant-type': [0, 1], shrine: [1, 1], offcanvas: [1, 1], framed: [1, 2], floating: [1, 3], collage: [3, 4], poster: [1, 1], magazine: [0, 1], strip: [3, 6], 'sticky-steps': [0, 2], text: [0, 0], image: [1, 1], luxe: [1, 1], dense: [0, 0], depth: [1, 2], brutalist: [0, 1], gallery: [2, 4] };

// which archetypes this page's pictures and words can carry (for the hero, `main` is the opening picture)
function eligible(layout, inv, content, hero) {
  const m = inv.main; const n = inv.distinct;
  switch (layout) {
    case 'editorial-hero': return hero ? !!(m && inv.bleedable.some(x => x.a.id === m.a.id || x.a.id === m.a.cutoutOf)) : inv.bleedable.length > 0;
    case 'cinematic': return hero ? !!(m && inv.cinema.some(x => x.a.id === m.a.id || x.a.id === m.a.cutoutOf)) : inv.cinema.length > 0;
    case 'offcanvas': case 'floating': return inv.cut.length > 0;
    case 'shrine': case 'luxe': case 'framed': case 'split': case 'image': case 'depth': return n >= 1;
    case 'poster': return n >= 1 && content.shortName;
    case 'giant-type': return content.shortName || !hero;
    case 'collage': return n >= 3;
    case 'strip': return n >= 3;
    case 'gallery': return n >= 2;
    case 'magazine': return content.prose;
    case 'sticky-steps': return content.items >= 2;
    case 'dense': return content.items >= 3;
    case 'text': case 'brutalist': return true;
    default: return false;
  }
}
// the choreography an archetype supports (its natural scroll event first) -- only ones it has something to play with:
// a zoom-away needs a picture, a scale-through a word or halo to pass through, steps need lines, a track pictures
const NATURAL = {
  'editorial-hero': ['zoom-away', 'settle', 'depth'], cinematic: ['zoom-away', 'mask-reveal', 'depth'], offcanvas: ['travel', 'depth', 'settle'], floating: ['depth', 'travel', 'settle'],
  shrine: ['scale-through', 'settle', 'travel'], luxe: ['mask-reveal', 'settle'], framed: ['mask-reveal', 'settle', 'zoom-away'], split: ['settle', 'mask-reveal', 'type-wipe'],
  image: ['zoom-away', 'mask-reveal', 'settle'], depth: ['depth'], poster: ['scale-through', 'type-wipe', 'depth'], 'giant-type': ['type-wipe', 'settle'],
  collage: ['depth', 'travel'], strip: ['track'], gallery: ['stack', 'pin-steps'], magazine: ['settle', 'type-wipe', 'mask-reveal'], 'sticky-steps': ['pin-steps'],
  dense: ['settle', 'type-wipe'], text: ['type-wipe', 'settle'], brutalist: ['type-wipe', 'settle', 'travel'],
};
// what content an archetype suits
const CARRIES = {
  'editorial-hero': 'opening', cinematic: 'picture', offcanvas: 'statement', floating: 'statement', shrine: 'statement', luxe: 'statement', framed: 'picture', split: 'statement',
  image: 'picture', depth: 'statement', poster: 'statement', 'giant-type': 'statement', collage: 'pictures', strip: 'pictures', gallery: 'pictures', magazine: 'prose',
  'sticky-steps': 'facts', dense: 'facts', text: 'statement', brutalist: 'facts',
};

// ---- the recipe
function contentOf(input) {
  const facts = (input.facts || []).filter(f => f && f.text);
  const sup = input.supplied || {}; const supN = ((sup.facts || []).length + (sup.memories || []).length);
  const name = String((input.understanding && (input.understanding.name || (input.understanding.identity && input.understanding.identity.name) || input.understanding.subject)) || '');
  return { facts: facts.length, items: Math.max(facts.filter(f => f.text.length <= 240).length, supN), prose: facts.some(f => f.text.length > 120) || supN >= 2, dated: facts.filter(f => /\b(1[0-9]{3}|20[0-4][0-9])\b/.test(f.text)).length, shortName: name.length > 0 && name.length <= 22 && name.split(/\s+/).length <= 3 };
}

function sceneCount(density, content, inv, r) {
  const base = density === 'sparse' ? 4 : density === 'dense' ? 6 : 5;
  const matter = Math.ceil(content.items / 3) + Math.min(3, Math.max(0, inv.distinct - 1)) + (content.prose ? 1 : 0);
  return Math.max(3, Math.min(8, Math.round((base + Math.min(base + 1, matter + 2)) / 2 + (r() < 0.5 ? 0 : 1) - (content.facts === 0 && inv.distinct <= 1 ? 1 : 0))));
}

function buildRecipe(r, input, personality, inv, content, genre) {
  const st = STYLE[personality];
  const scroll = weighted(r, st.scroll);
  const typo = weighted(r, st.typo); const nav = weighted(r, st.nav); const density = weighted(r, st.density);
  const progression = weighted(r, st.progression); const depth = weighted(r, st.depth);
  const hero = weighted(r, st.hero, k => eligible(k, inv, content, true)) || (inv.main ? (inv.main.p.free ? 'shrine' : 'split') : 'giant-type');
  const n = sceneCount(density, content, inv, r);
  const scenes = [{ layout: hero, choreo: weighted(r, Object.fromEntries((NATURAL[hero] || ['settle']).map((c, i) => [c, (st.choreo[c] || 0.6) * (i ? 1 : 1.6)]))) || 'settle', handoff: 'cut', carries: 'opening' }];
  // the body: drawn from the personality's pool, each archetype suited to what is left to say, never the same twice in
  // a row (and at most twice in all), with at least one real scroll event when the personality moves at all
  // the budgets the scenes draw on: picture appearances (each picture may appear two or three times) and lines of
  // facts (the opening quotes one)
  let usesLeft = inv.uses - ((NEED[hero] || [0])[0] || (inv.main ? 1 : 0));
  let itemsLeft = Math.max(0, content.items - (content.facts ? 1 : 0)); let prose = content.prose;
  const used = new Map([[hero, 1]]);
  for (let i = 1; i < n; i++) {
    const last = i === n - 1;
    const pool = Object.assign({}, st.body);
    if (last) { pool.text = (pool.text || 1) + 1; ['shrine', 'luxe', 'image', 'framed', 'poster', 'giant-type'].forEach(k => { if (pool[k]) pool[k] += 0.8; }); }
    const layout = weighted(r, pool, k => {
      if (k === scenes[i - 1].layout || (used.get(k) || 0) >= 2) return false;
      if (!eligible(k, inv, { ...content, items: itemsLeft, prose }, false)) return false;
      if ((NEED[k] || [0])[0] > usesLeft) return false;
      if (k === 'dense' && itemsLeft < 3) return false;
      if (k === 'sticky-steps' && itemsLeft < 2) return false;
      return true;
    }) || (itemsLeft >= 2 ? 'sticky-steps' : 'text');
    used.set(layout, (used.get(layout) || 0) + 1);
    const c = CARRIES[layout]; const need = NEED[layout] || [0, 0];
    usesLeft -= Math.min(usesLeft, Math.max(need[0], Math.min(need[1], usesLeft - (n - 1 - i))));
    itemsLeft -= Math.min(itemsLeft, layout === 'dense' ? 5 : layout === 'sticky-steps' || layout === 'brutalist' ? 4 : c === 'facts' ? 3 : 1);
    if (c === 'prose') prose = false;
    const nat = NATURAL[layout] || ['settle'];
    const choreo = weighted(r, Object.fromEntries(nat.map((k, j) => [k, (st.choreo[k] || 0.5) * (j ? 1 : 1.5)]))) || nat[0];
    const handoff = weighted(r, st.handoff) || 'cut';
    scenes.push({ layout, choreo, handoff, carries: last ? 'closing' : c });
  }
  // the scroll model shapes the whole: a track page has its horizontal passage, a sequence holds several scenes, a
  // stack page stacks, a continuous page hides its seams, a snapping page has no pinned scene
  const pinnedChoreos = ['pin-steps', 'zoom-away', 'scale-through', 'track', 'stack', 'mask-reveal'];
  if (scroll === 'track' && !scenes.some(s => s.layout === 'strip')) { const i = scenes.findIndex((s, k) => k > 0 && CARRIES[s.layout] !== 'closing' && eligible('strip', inv, content, false)); if (i > 0) Object.assign(scenes[i], { layout: 'strip', choreo: 'track', carries: 'pictures' }); }
  if (scroll === 'stack') scenes.forEach((s, i) => { if (i > 0 && i % 2 === 1) s.handoff = 'stack'; });
  if (scroll === 'continuous') scenes.forEach((s, i) => { if (i > 0 && s.handoff === 'cut') s.handoff = i % 2 ? 'overlap' : 'bleed'; });
  if (scroll === 'snap') scenes.forEach(s => { if (pinnedChoreos.includes(s.choreo) && s.choreo !== 'mask-reveal') s.choreo = 'settle'; if (s.handoff === 'stack') s.handoff = 'cut'; });
  if (scroll === 'sequence') { let k = 0; scenes.forEach((s, i) => { if (i > 0 && k < 3 && !pinnedChoreos.includes(s.choreo)) { const nat = (NATURAL[s.layout] || []).find(c => pinnedChoreos.includes(c)); if (nat) { s.choreo = nat; k++; } } }); }
  if (personality === 'still') scenes.forEach(s => { if (s.choreo !== 'settle' && s.choreo !== 'mask-reveal') s.choreo = 'settle'; if (s.handoff === 'carry' || s.handoff === 'stack') s.handoff = 'cut'; });
  // a carry needs a picture on both sides of the seam
  scenes.forEach((s, i) => { if (s.handoff === 'carry' && (i === 0 || ['text', 'dense', 'brutalist', 'magazine'].includes(s.layout) || ['text', 'dense', 'brutalist', 'magazine', 'strip'].includes(scenes[i - 1].layout))) s.handoff = 'overlap'; });
  // at most three pinned scenes (the same limit the validator enforces)
  let pins = 0; scenes.forEach(s => { if (pinnedChoreos.includes(s.choreo) && s.choreo !== 'mask-reveal') { pins++; if (pins > 3) s.choreo = 'settle'; } });
  const M = MOTION[personality];
  const intensity = Math.max(1, Math.min(5, Math.round(M.range * 3 + (scroll === 'track' || scroll === 'stack' ? 0.5 : 0))));
  const recipe = { personality, scroll, typo, nav, density, progression, depth, intensity, genre, scenes };
  recipe.recipe = fingerprint(recipe);
  recipe.why = `${genre === 'object' ? 'this subject' : `a ${genre} subject`}${registerOf(input.understanding) ? `, ${registerOf(input.understanding)}` : ''}: ${M.label} motion, ${scroll} scroll, opening on a ${hero} composition`;
  return recipe;
}

function fingerprint(x) {
  if (!x) return '';
  if (typeof x === 'string') return x;
  const a = x.art || x; const scenes = x.scenes || [];
  return `${a.personality || '?'}/${a.scroll || '?'}/${scenes.map(s => s.layout || 'free').join(',')}`.slice(0, 160);
}
function parseFp(fp) { const [personality, scroll, list] = String(fp || '').split('/'); const layouts = (list || '').split(',').filter(Boolean); return { personality, scroll, hero: layouts[0] || '', body: layouts.slice(1) }; }
function similarity(a, b) {
  const x = parseFp(fingerprint(a)), y = parseFp(fingerprint(b));
  if (!x.personality || !y.personality) return 0;
  const A = new Set(x.body), B = new Set(y.body); const inter = [...A].filter(k => B.has(k)).length; const uni = new Set([...A, ...B]).size || 1;
  return 0.3 * (x.personality === y.personality) + 0.15 * (x.scroll === y.scroll) + 0.2 * (x.hero === y.hero) + 0.35 * (inter / uni);
}

// input: { understanding, assets, facts, supplied, page, seed, history: [fingerprints], avoid: fingerprint, prefer: {personality?} }
function choose(input) {
  const inp = input || {}; const u = inp.understanding || {};
  const r = rng(`${inp.seed || ''}|${u.subject || ''}|${u.brief || ''}`);
  const genre = genreOf(u, inp.page); const reg = registerOf(u);
  const w = Object.assign({}, GENRE_WEIGHTS[genre] || GENRE_WEIGHTS.object);
  Object.entries(TONE_SHIFT[reg] || {}).forEach(([k, v]) => { w[k] = (w[k] || 0) + v; });
  if (u.kind === 'personal' && genre !== 'tribute') { w.chaotic = (w.chaotic || 0) - 1.5; w.editorial = (w.editorial || 0) + 1; }
  PERSONALITIES.forEach(k => { w[k] = Math.max(0, w[k] || 0); });
  if (inp.prefer && PERSONALITIES.includes(inp.prefer.personality)) w[inp.prefer.personality] += 6;
  const inv = inventory(inp.assets); const content = contentOf(inp);
  const history = (inp.history || []).map(fingerprint).filter(Boolean).slice(-10);
  const avoid = inp.avoid ? fingerprint(inp.avoid) : '';
  // several candidates, each drawn from the weighted pools; the best is the one that suits the subject and differs
  // most from what this account (and this page) already has
  let best = null;
  for (let i = 0; i < 10; i++) {
    const personality = weighted(r, w) || 'editorial';
    const cand = buildRecipe(r, inp, personality, inv, content, genre);
    const suit = w[personality] / Math.max(...Object.values(w), 1);
    const past = history.length ? Math.max(...history.map(h => similarity(cand.recipe, h))) : 0;
    const again = avoid ? similarity(cand.recipe, avoid) : 0;
    const variety = new Set(cand.scenes.map(s => s.layout)).size / cand.scenes.length + new Set(cand.scenes.map(s => s.choreo)).size / cand.scenes.length * 0.5;
    const score = suit * 2 + variety - past * 1.6 - again * 3 + r() * 0.15;
    if (!best || score > best.score) best = { score, cand, past, again };
  }
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
    intensity: Math.max(1, Math.min(5, Math.round(Number(raw.intensity) || 3))), recipe: s(raw.recipe, 160), why: s(raw.why, 240), genre: s(raw.genre, 20),
  };
}

module.exports = { distinctPictures, sameAs, PERSONALITIES, SCROLLS, LAYOUTS, CHOREOS, HANDOFFS, TYPOS, NAVS, DENSITIES, PROGRESSIONS, DEPTHS, MOTION, STYLE, NATURAL, CARRIES, NEED, choose, normaliseArt, fingerprint, similarity, genreOf, inventory, eligible, rng };
