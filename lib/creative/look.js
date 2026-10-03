'use strict';
// CREATIVE — the page's LOOK: one committed visual system per page, decided once from what the page is about and what it
// has to show, instead of a pile of independent effects. It is stored with the plan (plan.look) and every part of the
// pipeline reads the same decision:
//
//   type      the typographic system: a family chosen from the brand's category, its imagery, its logo, its energy,
//             the length of its copy and its compositions (never "premium = thin serif"), with the case, tracking,
//             leading and average advance the renderer fits headlines with
//   brand     the palette roles: primary (the brand's own colour), light, deep -- from the logo, the dominant colours of
//             the pictures and a semantic colour when one is confidently known -- and how confident that is
//   devices   the 2-4 visual devices the page commits to (DEVICES); everything outside them is left out
//   enter     how a scene arrives: ONE composed event (one mask over the stage, one camera settle, the words with it)
//
//   direct({ plan, assets, understanding, page, rng }) -> look       (a new or recomposed page)
//   normalise(raw) -> look | null                                     (a saved page keeps its own; null: no look)
//   root(asset, byId) -> the picture an asset comes from (cut-out, copy) -- the image ledger counts roots
//   measure(text) -> characters per line a headline is fitted to; keep(text) -> the text with its short words held
//   brandPalette(brand, page) -> { bg, bg2, ink, muted, accent, glow }
//   fields(n, brand, opts) -> one surface per scene from the brand roles
//   devicesFor(plan, signals) -> ['colour-field', ...]
// Data only, browser-safe (bundled into creative-core.js). Nothing here knows any brand by name.

const PAL = require('./palette');
const ART = require('./art');

const VERSION = 1;
// the text-layout rules a scene's words are set by (stored per scene as text.fit): 2 -- every headline fitted to a measure
// with its short words held, and a staggered opening title broken by LOOK.lines. A scene saved with older rules renders as
// it was saved until it is re-fitted; raise this when the rules change what a saved scene would look like.
const TEXT_FIT = 2;
const HEX = /^#[0-9a-f]{6}$/i;

// ---------------------------------------------------------------- type
// adv: average advance of a character in em (capitals wider: x UPPER); lead: line height; track: letter spacing (em)
const FAMILIES = {
  campaign: { adv: 0.47, upper: 1.18, lead: 0.88, track: 0, case: 'upper' },      // heavy uppercase campaign type
  block: { adv: 0.66, upper: 1.2, lead: 0.9, track: -0.035, case: 'normal' },     // bold grotesk / block sans
  condensed: { adv: 0.46, upper: 1.22, lead: 0.92, track: 0, case: 'upper' },      // condensed display
  wide: { adv: 0.72, upper: 1.18, lead: 1.02, track: 0.03, case: 'upper' },        // wide geometric
  neutral: { adv: 0.57, upper: 1.25, lead: 0.98, track: -0.025, case: 'normal' },  // neutral modern sans
  humanist: { adv: 0.55, upper: 1.25, lead: 1.02, track: -0.01, case: 'normal' },  // humanist sans
  serif: { adv: 0.55, upper: 1.3, lead: 1.04, track: -0.01, case: 'normal' },      // editorial serif
  didone: { adv: 0.54, upper: 1.32, lead: 1.02, track: -0.01, case: 'normal' },    // high-contrast serif (luxury)
  rounded: { adv: 0.6, upper: 1.22, lead: 0.98, track: -0.015, case: 'normal' },   // playful
  grotesk: { adv: 0.6, upper: 1.24, lead: 0.94, track: -0.03, case: 'normal' },
  slab: { adv: 0.6, upper: 1.22, lead: 0.96, track: -0.01, case: 'normal' },
  mono: { adv: 0.6, upper: 1.0, lead: 1.02, track: -0.02, case: 'upper' },
  script: { adv: 0.5, upper: 1.4, lead: 1.1, track: 0, case: 'normal' },
};
const FAMILY_NAMES = Object.keys(FAMILIES);
// what draws a page to each family: its genre, the personality it moves with, its signals. "gate": the family is only
// eligible when one of these holds (a thin high-contrast serif is for luxury and fashion, not for anything "premium")
const TYPE_W = {
  campaign: { genre: { product: 2, food: 2, music: 1.5, meme: 1.2, brutal: 1, game: 0.8 }, personality: { kinetic: 1.5, chaotic: 1.5, playful: 1, cinematic: 0.5 }, consumer: 3, saturated: 1.5, poster: 1.2, short: 1.5, long: -3 },
  block: { genre: { product: 2, tech: 1.5, game: 1.5, music: 1, art: 1, character: 0.8 }, personality: { kinetic: 1.5, cinematic: 1, mechanical: 1, chaotic: 0.8 }, consumer: 2, saturated: 1, poster: 1, short: 1, long: -1 },
  condensed: { genre: { film: 2.2, game: 1.8, music: 1.5, place: 1.2, history: 0.6 }, personality: { cinematic: 2, kinetic: 1.2, chaotic: 0.8 }, poster: 0.8, short: 0.6, long: -1.5 },
  wide: { genre: { tech: 2.5, fashion: 1, place: 0.8 }, personality: { mechanical: 2, luxe: 1.2, cinematic: 0.8 }, short: 1, long: -2.5 },
  neutral: { base: 1.2, genre: { object: 1, tech: 1, editorial: 0.6, nature: 0.6, product: 0.5 }, personality: { editorial: 1, mechanical: 0.6 }, long: 1.5 },
  humanist: { base: 0.4, genre: { nature: 2, tribute: 1.6, place: 1, food: 0.6, history: 0.6 }, personality: { still: 1.6, editorial: 0.8 }, long: 1 },
  serif: { genre: { editorial: 3, history: 2.5, tribute: 1.4, art: 0.8 }, personality: { editorial: 1.2, still: 1 }, long: 1, gate: ['editorial', 'history', 'tribute', 'art', 'reading'] },
  didone: { genre: { fashion: 3.5 }, personality: { luxe: 1.5 }, luxury: 3, gate: ['fashion', 'luxury'] },
  rounded: { genre: { character: 2, meme: 1.5, food: 0.8 }, personality: { playful: 2.2 }, consumer: 0.4, gate: ['playful', 'character', 'meme'] },
  mono: { genre: { brutal: 2, tech: 0.8 }, personality: { mechanical: 1.2 }, gate: ['brutal', 'tech', 'mechanical'] },
  slab: { genre: { brutal: 1, history: 0.4 }, personality: { chaotic: 0.6 }, gate: ['brutal', 'chaotic', 'history'] },
  grotesk: { gate: [] }, script: { gate: [] }, // (kept readable for saved pages; never chosen as a new page's system)
};
// a consumer brand: a drink, a snack, trainers -- a product people buy off a shelf, sold with campaign type
const CONSUMER = /\b(cola|soda|soft ?drinks?|beverages?|energy drinks?|sports drinks?|drinks? brand|snacks?|crisps|chips|cereal|candy|sweets|chocolate bar|fast[- ]food|burgers?|sneakers?|trainers|sportswear|streetwear|brand|retail|supermarket|toys?)\b/i;
const LUXURY = /\b(luxury|luxe|couture|haute|jewel(?:le)?ry|perfume|fragrance|watchmaker|champagne|atelier|maison)\b/i;
const READING = /\b(essay|journal|magazine|blog|newsletter|long-?read|memoir|biography|obituary|history of)\b/i;

function registerOf(u) { const t = u && u.tone; return String((t && typeof t === 'object' ? t.register : t) || '').toLowerCase(); }
function satOf(hex) { if (!HEX.test(hex || '')) return 0; const h = PAL.hsl(hex); return h.l > 0.12 && h.l < 0.9 ? h.s : 0; }

// what the page is, as the look reads it
function signals(input) {
  const i = input || {}; const plan = i.plan || {}; const u = i.understanding || {}; const page = i.page || null;
  const assets = (i.assets || []).filter(a => a && a.id && !a.removed && !a.failed);
  const byId = new Map(assets.map(a => [a.id, a]));
  const genre = ART.genreOf(u, page);
  const text = [u.subject, u.brief, u.identity && u.identity.what, ...(u.motifs || []), page && page.title, page && page.description, page && page.category].filter(Boolean).join(' ');
  const art = plan.art || {}; const personality = art.personality || 'editorial';
  const heads = (plan.scenes || []).map(s => String((s.text && s.text.heading) || '').trim()).filter(Boolean);
  const meanHead = heads.length ? heads.reduce((t, h) => t + h.length, 0) / heads.length : 20;
  const maxHead = heads.reduce((m, h) => Math.max(m, h.length), 0);
  const layouts = (plan.scenes || []).map(s => s.composition || s.layout || '');
  const poster = layouts.filter(l => ['giant-type', 'poster', 'campaign', 'type-stage', 'type-takeover', 'takeover', 'brutalist'].includes(l)).length;
  const logo = assets.find(a => !a.cutoutOf && a.ownerRole === 'logo') || assets.find(a => !a.cutoutOf && a.curation && a.curation.role === 'logo') || (plan.logo && byId.get(plan.logo.asset)) || null;
  const pictures = assets.filter(a => a !== logo && a.ownerRole !== 'logo' && !(a.curation && (a.curation.role === 'logo' || a.curation.role === 'unrelated' || a.curation.identity === 'other')));
  const mainId = i.mainAsset || null;
  const main = (mainId && byId.get(mainId)) || pictures.find(a => !a.cutoutOf && a.origin === 'upload') || pictures.find(a => !a.cutoutOf) || null;
  const sat = Math.max(0, ...pictures.slice(0, 6).flatMap(a => ((a.assess && a.assess.colours) || []).slice(0, 3).map(satOf)), ...(logo && logo.assess ? (logo.assess.colours || []).map(satOf) : []));
  const reg = registerOf(u);
  return {
    genre, personality, register: reg, text,
    // (luxury is what the subject IS -- couture, jewellery, perfume -- never a quiet register or a slow personality: a
    // premium kettle is not a fashion house)
    consumer: CONSUMER.test(text), luxury: LUXURY.test(text) || genre === 'fashion',
    reading: READING.test(text) || genre === 'editorial',
    meanHead, maxHead, short: meanHead <= 18, long: meanHead > 34 || maxHead > 60, poster, layouts,
    saturated: sat >= 0.55, logo, main, pictures, byId,
    semantic: [].concat((u.identity && u.identity.colours) || [], u.colours || []).filter(c => HEX.test(c || '')).map(c => c.toLowerCase()).slice(0, 3),
  };
}

// the family: every family scored against the signals; a gated family needs its reason. hint: the director's own
// choice counts for a little when it is eligible (a model's "serif" for a soft drink is not)
function chooseType(sig, hint, rng) {
  const gates = { editorial: sig.genre === 'editorial', history: sig.genre === 'history', tribute: sig.genre === 'tribute', art: sig.genre === 'art', reading: sig.reading, fashion: sig.genre === 'fashion', luxury: sig.luxury, playful: sig.personality === 'playful', character: sig.genre === 'character', meme: sig.genre === 'meme', brutal: sig.genre === 'brutal', tech: sig.genre === 'tech', mechanical: sig.personality === 'mechanical', chaotic: sig.personality === 'chaotic' };
  const scored = FAMILY_NAMES.filter(f => TYPE_W[f]).map(f => {
    const w = TYPE_W[f];
    if (w.gate && !w.gate.some(g => gates[g])) return { f, s: -Infinity };
    let s = (w.base || 0) + ((w.genre || {})[sig.genre] || 0) + ((w.personality || {})[sig.personality] || 0);
    if (sig.consumer) s += w.consumer || 0; if (sig.luxury) s += w.luxury || 0; if (sig.saturated) s += w.saturated || 0;
    if (sig.poster) s += (w.poster || 0) * Math.min(2, sig.poster); if (sig.short) s += w.short || 0; if (sig.long) s += w.long || 0;
    if (hint && (hint === f || (hint === 'grotesk' && f === 'block'))) s += 1;
    return { f, s: s + (rng ? rng() * 0.3 : 0) };
  }).sort((a, b) => b.s - a.s);
  return scored[0] && scored[0].s > -Infinity ? scored[0].f : 'neutral';
}
function typeSystem(sig, hint, rng) {
  const family = chooseType(sig, hint, rng); const F = FAMILIES[family];
  // capitals only while the lines stay short enough to read as one shape
  const cs = F.case === 'upper' && sig.maxHead <= (family === 'campaign' ? 48 : 36) ? 'upper' : 'normal';
  return { family, case: cs, track: F.track, lead: F.lead, adv: F.adv, upper: F.upper };
}

// ---------------------------------------------------------------- headline fitting
// A headline is set as UNITS that never break apart: an article holds to the word after it ("the dark"), and the last
// line is never one short word (the last two words hold together when the last is short). Then the characters per line it
// is fitted to: never only its longest word (that sized a short phrase so large every word took its own line) -- the
// narrowest measure that sets the phrase on as few balanced lines as its length asks for, its longest unit always whole.
const ARTICLES = /^(a|an|the|&)$/i;
function units(text) {
  const w = String(text || '').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean); const out = [];
  for (let i = 0; i < w.length; i++) { if (ARTICLES.test(w[i]) && i < w.length - 1) { out.push(w[i] + '\u00a0' + w[i + 1]); i++; } else out.push(w[i]); }
  if (out.length > 2 && out[out.length - 1].length <= 4) out.splice(out.length - 2, 2, out[out.length - 2] + '\u00a0' + out[out.length - 1]);
  return out;
}
function keep(text) { return units(text).join(' '); }
function measure(text) {
  const u = units(text).map(x => x.length); const n = u.reduce((t, x) => t + x, 0) + Math.max(0, u.length - 1); if (!n) return 4;
  const target = n <= 12 ? 1 : n <= 26 ? 2 : n <= 46 ? 3 : 4;
  const linesAt = w => { let lines = 1, cur = 0; u.forEach(x => { if (!cur) cur = x; else if (cur + 1 + x <= w) cur += 1 + x; else { lines++; cur = x; } }); return lines; };
  let w = Math.max(...u); while (w < n && linesAt(w) > target) w++;
  return Math.max(4, w + 1);
}
// the lines themselves: the units set at that measure -- what a headline set in explicit lines (a staggered title) uses,
// so it breaks exactly where the fitted headline would (never one short word left alone on the last line)
function lines(text) {
  const u = units(text); if (!u.length) return []; const w = measure(text) - 1; const out = [];
  u.forEach(x => { const last = out[out.length - 1]; if (last != null && last.length + 1 + x.length <= w) out[out.length - 1] = last + ' ' + x; else out.push(x); });
  return out;
}
// fit = how many characters of this family fit 100cqi at 1em, a little under for the faces each stack falls back to
function fitFor(type) { const adv = type.adv * (type.case === 'upper' ? type.upper : 1); return Math.round(100 / adv * 0.94); }

// ---------------------------------------------------------------- colour
function contrast(a, b) { const x = PAL.lum(a), y = PAL.lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }
const hueGap = (a, b) => { const d = Math.abs(a - b) % 1; return Math.min(d, 1 - d); };
// the brand's colours: the logo first, then the main picture, then the other pictures, then a semantic colour the
// understanding is sure of -- weighted, chromatic hues merged, plus the lightest and the darkest colour the brand shows
function brand(sig) {
  const votes = []; const add = (hex, w, from) => { if (HEX.test(hex || '')) votes.push({ hex: hex.toLowerCase(), w, from, ...PAL.hsl(hex) }); };
  const cols = a => ((a && a.assess && a.assess.colours) || []);
  const bgOf = a => (a && a.assess && a.assess.background && a.assess.background.uniformity > 0.6 ? a.assess.background.colour : null);
  if (sig.logo) { cols(sig.logo).slice(0, 4).forEach((c, k) => add(c, 3 - k * 0.5, 'logo')); add(bgOf(sig.logo), 1.2, 'logo'); }
  if (sig.main) cols(sig.main).slice(0, 4).forEach((c, k) => add(c, 2 - k * 0.35, 'image'));
  sig.pictures.filter(a => a !== sig.main && !a.cutoutOf).slice(0, 5).forEach(a => cols(a).slice(0, 3).forEach((c, k) => add(c, 0.8 - k * 0.2, 'image')));
  sig.semantic.forEach(c => add(c, 3, 'semantic'));
  const chroma = votes.filter(v => v.s >= 0.4 && v.l >= 0.2 && v.l <= 0.72);
  const groups = []; chroma.forEach(v => { const g = groups.find(x => hueGap(x.h, v.h) < 0.05); if (g) { g.w += v.w; g.from.add(v.from); if (v.w > g.best.w) g.best = v; } else groups.push({ h: v.h, w: v.w, best: v, from: new Set([v.from]) }); });
  groups.sort((a, b) => b.w - a.w);
  const top = groups[0] || null;
  // confident: the brand's own mark names it -- the logo, or a colour the subject is known by. Pictures alone are not a
  // brand (their colours already give each scene its tone: palette.js)
  const confident = !!top && (top.from.has('logo') || top.from.has('semantic'));
  const primary = top ? top.best.hex : null;
  const lights = votes.filter(v => v.l >= 0.86 && v.s <= 0.4).sort((a, b) => b.w - a.w);
  const darks = votes.filter(v => v.l <= 0.26 && v.l >= 0.03).sort((a, b) => (b.s * b.w) - (a.s * a.w));
  const light = lights[0] ? PAL.mix(lights[0].hex, '#ffffff', 0.3) : primary ? PAL.mix(primary, '#ffffff', 0.94) : null;
  // (the deep colour keeps its own warmth -- a dark brown stays brown -- and is dark enough to carry light words)
  let deep = darks[0] ? darks[0].hex : primary ? PAL.mix(primary, '#0b0b0b', 0.82) : null;
  if (deep) for (let k = 0; k < 8 && PAL.lum(deep) > 0.04; k++) deep = PAL.mix(deep, '#000000', 0.2);
  const second = groups.find(g => g !== top && hueGap(g.h, top.h) > 0.08 && g.w >= 1.2);
  return { confident, primary, light, deep, second: second ? second.best.hex : null, from: top ? [...top.from] : [] };
}
// the page's palette from the brand roles: a light page with the brand's colour as its accent and its deep colour for
// words (or a dark page when its pictures are dark), every pair readable
function brandPalette(b, base, dark) {
  const P = Object.assign({}, base);
  if (!b || !b.primary) return P;
  const light = b.light || '#f6f4ef', deep = b.deep || '#141210';
  if (dark) { P.bg = deep; P.bg2 = PAL.mix(deep, b.primary, 0.18); P.ink = light; P.glow = light; }
  else { P.bg = light; P.bg2 = PAL.mix(light, b.primary, 0.1); P.ink = contrast(deep, light) >= 7 ? deep : '#141414'; P.glow = '#ffffff'; }
  P.accent = b.primary;
  for (let i = 0; i < 12 && contrast(P.ink, P.bg) < 7; i++) P.ink = PAL.mix(P.ink, dark ? '#ffffff' : '#000000', 0.25);
  P.muted = PAL.mix(P.ink, P.bg, 0.3); for (let i = 0; i < 8 && contrast(P.muted, P.bg) < 4.5; i++) P.muted = PAL.mix(P.muted, P.ink, 0.3);
  return P;
}
// one surface per scene from the brand roles (the colour field), chosen from what the scene shows: words alone stand on
// the brand's own colour when the page sells with it (type on red is the campaign move), a free-standing subject on the
// light or the deep one -- never on its own colour (a red can on a red field disappears) -- and never the same field twice
// in a row. opts.fixed(i): the colour a scene already has of its own (a flood, a photograph's tone) -- kept, and its
// neighbours step away from it. opts.pictureHex(s): the colour of the scene's subject ('' for words alone)
function fields(scenes, b, opts) {
  const o = opts || {}; if (!b || !b.primary) return scenes.map(() => '');
  const roles = { primary: b.primary, light: b.light || '#f6f4ef', deep: b.deep || '#141210' };
  const fixed = i => (o.fixed && o.fixed(i)) || '';
  let prev = '';
  return scenes.map((s, i) => {
    const own = fixed(i); if (own) { prev = own; return ''; }
    const pic = o.pictureHex && o.pictureHex(s); const next = fixed(i + 1);
    const ok = r => (!prev || PAL.distance(roles[r], prev) > 40) && !(next && PAL.distance(roles[r], next) <= 40) && !(pic && PAL.distance(pic, roles[r]) < 90);
    const want = !pic ? (o.loud ? ['primary', 'deep', 'light'] : ['deep', 'light', 'primary']) : (i === 0 ? ['light', 'deep', 'primary'] : ['deep', 'light', 'primary']);
    const r = want.find(ok) || want.find(x => !(pic && PAL.distance(pic, roles[x]) < 90)) || want[0];
    prev = roles[r]; return roles[r];
  });
}

// ---------------------------------------------------------------- devices
// The devices a page commits to. Each names what it allows; what the page does not commit to is left out (validate2):
//   colour-field  scenes on flat colour fields from the brand roles, colour floods between them
//   bleed-crop    pictures cropped hard, bleeding off the edges and overlapping the grid
//   camera        one camera through the scenes: push, pull, zoom, depth (the choreographies that move the stage)
//   mask-reveal   a shaped window: geometric masks, a word that becomes the window onto the next picture
//   type-motion   words that move: fill, spread, swap, the name carried as a word actor
//   handoff       a subject carried from one scene into the next (carries, the actor, image-expand)
//   parallax      layers at different depths drifting at different rates (scroll parallax, ambient loops)
const DEVICES = ['colour-field', 'bleed-crop', 'camera', 'mask-reveal', 'type-motion', 'handoff', 'parallax'];
const CAMERA_CHOREO = ['zoom-away', 'scale-through', 'depth', 'expand'];
const TYPE_CHOREO = ['type-wipe', 'word-fill'];
const MASK_CHOREO = ['mask-reveal'];
const SHAPED = ['circle', 'arch', 'diamond', 'slit'];
const TEXT_MOVES = ['word-fill', 'letter-spread', 'stagger', 'outline', 'vertical'];
// what the plan already uses: a choreography or an actor is the page's architecture (never stripped: it forces its
// device); the rest are counted so the choice keeps what the composition leans on
function usage(plan) {
  const sc = plan.scenes || []; const tl = plan.timeline || null; const contracts = (tl && tl.continuity && tl.continuity.contracts) || [];
  const layers = sc.flatMap(s => s.layers || []);
  const forced = new Set(); const count = Object.fromEntries(DEVICES.map(d => [d, 0]));
  sc.forEach(s => { if (CAMERA_CHOREO.includes(s.choreo)) forced.add('camera'); if (TYPE_CHOREO.includes(s.choreo)) forced.add('type-motion'); if (MASK_CHOREO.includes(s.choreo)) forced.add('mask-reveal'); });
  if (plan.actor) forced.add('handoff');
  layers.forEach(L => { if (L.kind === 'image' && SHAPED.includes(L.mask)) count['mask-reveal']++; if (L.kind === 'image' && L.frame === 'bleed') count['bleed-crop']++; if ((L.scroll && L.scroll.kind !== 'none') || (L.loop && L.loop.kind !== 'none')) count.parallax++; });
  sc.forEach(s => { if (s.text && TEXT_MOVES.includes(s.text.treatment)) count['type-motion']++; if (['accent', 'invert'].includes(s.background)) count['colour-field']++; });
  contracts.forEach(k => { if (k.carry && k.carry !== 'none') count.handoff++; if (k.camera && k.camera !== 'none') count.camera++; });
  ((tl && tl.transitions) || []).forEach(t => { if (['image-expand', 'actor-carry', 'depth-handoff', 'card-expand'].includes(t.family)) count.handoff++; if (t.family === 'type-mask') count['mask-reveal']++; if (t.family === 'color-bleed') count['colour-field']++; });
  return { forced, count };
}
function devicesFor(plan, sig, b, type) {
  const { forced, count } = usage(plan);
  const P = sig.personality;
  const score = {
    'colour-field': (b && b.confident ? 3 : 0) + (sig.consumer ? 1.5 : 0) + count['colour-field'] * 0.5,
    'bleed-crop': (sig.pictures.filter(a => !a.cutoutOf).length >= 2 ? 2 : 0.5) + count['bleed-crop'] * 0.4 + (P === 'cinematic' ? 1 : 0),
    camera: (P === 'cinematic' ? 2 : 0) + (P === 'luxe' ? 1 : 0) + count.camera * 0.3,
    'mask-reveal': count['mask-reveal'] * 0.6 + (P === 'editorial' || P === 'luxe' ? 0.6 : 0),
    'type-motion': (['campaign', 'block', 'condensed'].includes(type.family) ? 1.2 : 0) + (['kinetic', 'chaotic', 'playful'].includes(P) ? 1.2 : 0) + count['type-motion'] * 0.4,
    handoff: count.handoff * 0.5 + (P === 'cinematic' || P === 'kinetic' ? 0.6 : 0),
    parallax: (P === 'cinematic' || P === 'playful' ? 0.8 : 0) + count.parallax * 0.15,
  };
  const chosen = DEVICES.filter(d => forced.has(d)).sort((a, b2) => score[b2] - score[a]).slice(0, 4);
  DEVICES.filter(d => !chosen.includes(d)).sort((a, b2) => score[b2] - score[a] || DEVICES.indexOf(a) - DEVICES.indexOf(b2)).forEach(d => { if (chosen.length < 2 || (chosen.length < 3 && score[d] >= 1.5) || (chosen.length < 4 && score[d] >= 3)) chosen.push(d); });
  return DEVICES.filter(d => chosen.includes(d));
}

// ---------------------------------------------------------------- the decision
function direct(input) {
  const i = input || {}; const sig = signals(i); const plan = i.plan || {};
  const hint = plan.type && plan.type.display;
  const type = typeSystem(sig, hint, i.rng);
  const b = brand(sig);
  const devices = devicesFor(plan, sig, b, type);
  return {
    v: VERSION,
    type: { family: type.family, case: type.case, track: type.track, lead: type.lead, adv: type.adv, upper: type.upper },
    brand: { confident: b.confident, primary: b.primary || '', light: b.light || '', deep: b.deep || '', second: b.second || '', from: b.from },
    devices,
    enter: devices.includes('mask-reveal') ? 'mask' : devices.includes('camera') ? 'camera' : 'mask',
    loud: !!(sig.consumer || ['campaign', 'block'].includes(type.family) && b.confident),
    _sig: sig,
  };
}
const num = (v, lo, hi, d) => (typeof v === 'number' && isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d);
const hex = v => (HEX.test(v || '') ? v.toLowerCase() : '');
function normalise(raw) {
  if (!raw || typeof raw !== 'object' || raw.v !== VERSION) return null;
  const t = raw.type || {}; const fam = FAMILY_NAMES.includes(t.family) ? t.family : 'neutral'; const F = FAMILIES[fam];
  const b = raw.brand || {};
  return {
    v: VERSION,
    type: { family: fam, case: t.case === 'upper' ? 'upper' : 'normal', track: num(t.track, -0.08, 0.2, F.track), lead: num(t.lead, 0.75, 1.4, F.lead), adv: num(t.adv, 0.3, 1, F.adv), upper: num(t.upper, 1, 1.6, F.upper) },
    brand: { confident: !!b.confident, primary: hex(b.primary), light: hex(b.light), deep: hex(b.deep), second: hex(b.second), from: (Array.isArray(b.from) ? b.from : []).filter(x => ['logo', 'image', 'semantic'].includes(x)) },
    devices: DEVICES.filter(d => (Array.isArray(raw.devices) ? raw.devices : []).includes(d)).slice(0, 4),
    enter: raw.enter === 'camera' ? 'camera' : 'mask',
    loud: !!raw.loud,
  };
}

// the picture an asset comes from: its cut-out's photo, a copy's original (persisted links only; a broken or looping
// chain ends at the last picture reached)
function root(asset, byId) {
  let a = asset; const seen = new Set();
  for (let k = 0; a && k < 9; k++) { const up = a.cutoutOf || a.derivedFrom; if (!up || seen.has(a.id) || !byId.get(up)) return a; seen.add(a.id); a = byId.get(up); }
  return a;
}

module.exports = { VERSION, TEXT_FIT, FAMILIES, FAMILY_NAMES, TYPE_W, DEVICES, SHAPED, TEXT_MOVES, CAMERA_CHOREO, signals, chooseType, typeSystem, measure, keep, units, lines, fitFor, brand, brandPalette, fields, devicesFor, usage, direct, normalise, root, contrast };
