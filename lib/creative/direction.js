'use strict';
// CREATIVE — the page's DIRECTION: an art-directed piece, not a set of sections made to look good. Decided in this order,
// each step constraining the next (the existing systems do the building -- art.js chooses the recipe, composition.js
// and archetypes.js compose the scenes, continuity.js plans the seams, look.js the type and colour, fonts.js the faces):
//
//   assetPlan(input)      what the page HAS before anything is laid out: each picture's role (hero, actor, bleed, detail,
//                         texture, support), how hard it may be cropped, where its subject sits, whether it floats as a
//                         cut-out, carries across a seam, holds the full frame, could become a 3D or cinematic source, and
//                         whether it is shown once or returns as the closing callback -- and whether the pool is too weak
//   concept(input)        the idea the whole page serves, from the subject's genre, its pictures and its ambition: the
//                         visual thesis, the hero actor (and whether it persists), the metaphor, what the visitor should
//                         feel, the one memorable move, the motion language, the typography language, the composition
//                         style, what joins the beginning to the end, and how aggressive the page may be
//   weights(concept)      how the concept steers art.js's choice of personality, mode and family (a soft pull: the page
//                         still varies -- never one recipe per genre)
//   beats(scenes, ctx)    each scene's role in the sequence (hook, reveal, acceleration, transformation, takeover, detail,
//                         breath, typography, interaction, callback, payoff)
//   survey(scenes, ctx)   the page as it was composed, as a structured picture of it (what dominates, how large, framed or
//                         not, the words' arrangement, motion, colour, the actor, video): what the critique judges
//   critique(scenes, ctx) the whole page judged as ONE composition -- bounded findings from a fixed list, genre-aware, each
//                         with its weight (a weak hero, imagery in cards, too many splits, a layout three times, no
//                         full-screen event, no typography event, no payoff, a hero that never returns, a page that never
//                         breathes or never escalates, premium video in a small container ...)
//   candidates(f, ...)    the bounded repairs a finding may take: a stronger layout or composition for ONE scene, from the
//                         vocabulary, its own pictures permitting (validate2 applies them and keeps one only when the page
//                         scores better -- never a rewrite of the page)
//   normalise(raw)        the ONLY door into a stored plan (plan.idea, plan.review, scene.beat)
//
// Data only, browser-safe (bundled into creative-core.js): no CSS, code or free-form layout ever comes from a model. A saved
// page carries its own idea and review and is never judged again on reopening (validate2 safety mode).

const F = require('./framing');
const COMP = require('./composition');

const VERSION = 1;          // creativeDirectionVersion: plan.idea (concept, asset plan, sequence)
const DIRECTOR_VERSION = 1; // creativeDirectorVersion: plan.review (the whole-page critique and its repairs)

const GENRES = ['product', 'fashion', 'automotive', 'tech', 'luxury', 'editorial', 'hospitality', 'personal', 'other'];
const INTENSITIES = ['restrained', 'expressive', 'aggressive'];
const MOTIONS = ['cinematic-camera', 'campaign-cuts', 'floating-product', 'editorial-restraint', 'spatial-depth', 'mechanical-precision', 'playful-elastic', 'luxury-reveal'];
const TYPES = ['campaign-oversized', 'compressed-brutal', 'luxury-serif', 'editorial-serif', 'behind-subject', 'stacked-takeover', 'edge-labels', 'minimal-captions'];
const STYLES = ['object-led', 'full-bleed-cinema', 'type-led', 'spatial-geometry', 'negative-space', 'environment-immersive', 'work-led'];
const SIGNATURES = ['actor-travel', 'monumental-object', 'full-bleed-cinema', 'type-takeover', 'slow-reveal', 'environment', 'work-sequence'];
const BOOKENDS = ['actor-return', 'image-callback', 'colour-return', 'title-return'];
const ACTOR_KINDS = ['object', 'photo', 'model3d', 'none'];
const ASSET_ROLES = ['hero', 'actor', 'bleed', 'detail', 'texture', 'support'];
const CROPS = ['none', 'light', 'generous'];
const BEATS = ['hook', 'reveal', 'acceleration', 'transformation', 'takeover', 'detail', 'breath', 'typography', 'interaction', 'callback', 'payoff'];
// what the critique may find (and validate2 may repair) -- nothing else is ever stored
const FINDINGS = ['weak-hero', 'small-hero', 'cards', 'splits', 'repeats', 'no-full', 'no-type', 'weak-payoff', 'no-return', 'no-breath', 'spent-early', 'video-small', 'same-words', 'one-asset'];

const clean = (v, n) => String(v == null ? '' : v).replace(/[\u0000-\u001f<>{}`]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
const oneOf = (v, list, d) => (list.includes(v) ? v : d);

// ---------------------------------------------------------------- the genre: how far the page may go
// (the subject's own words decide: what it is, the brief; a personal page is always personal)
const GENRE_WORDS = [
  ['automotive', /\b(cars?|coupes?|sedans?|suvs?|motorcycles?|motorbikes?|vehicles?|automotive|grand tourer|hypercar|supercar|roadster|electric car)\b/i],
  ['luxury', /\b(luxury|serums?|perfumes?|fragrances?|parfum|jewel(?:le)?ry|watch(?:es|maker)?|couture|haute|atelier|skincare|cosmetics?|champagne)\b/i],
  ['fashion', /\b(sneakers?|shoes?|trainers?|apparel|streetwear|fashion|clothing|denim|hoodies?|handbags?|footwear|garments?)\b/i],
  ['tech', /\b(software|apps?|platform|saas|api|developer|devices?|smartphones?|laptops?|gadgets?|robot(?:ics|s)?|ai|artificial intelligence|cloud|headphones?|wearables?)\b/i],
  ['hospitality', /\b(hotels?|restaurants?|caf[eé]s?|bars?|resorts?|spas?|travel|destinations?|retreats?|inns?|bistros?)\b/i],
  ['editorial', /\b(magazines?|journals?|essays?|editorial|publications?|blogs?|histor(?:y|ies)|archives?|newsletters?|stories)\b/i],
  ['product', /\b(drinks?|cola|soda|beverages?|snacks?|candy|chocolate|coffee|beer|wine|spirits?|bottles?|cans?|products?|brands?|toys?)\b/i],
];
const PERSONAL = /\b(portfolio|photographer|illustrator|designer|artist|writer|author|my work|resum[eé]|cv|personal)\b/i;
function genreOf(u) {
  const x = u || {}; const id = x.identity || {};
  const words = [id.what, id.type, x.brief, x.subject].filter(Boolean).join(' ');
  if (x.kind === 'personal' || PERSONAL.test(words) || id.type === 'person') return 'personal';
  for (const [g, re] of GENRE_WORDS) if (re.test(words)) return g;
  return id.type === 'product' ? 'product' : 'other';
}
// how aggressive each genre may be, before the pictures and the ambition have their say
const GENRE_INTENSITY = { product: 'aggressive', fashion: 'aggressive', automotive: 'aggressive', tech: 'expressive', hospitality: 'expressive', other: 'expressive', luxury: 'restrained', editorial: 'restrained', personal: 'restrained' };
const OBJECT_GENRES = ['product', 'fashion', 'automotive', 'luxury', 'tech'];

// ---------------------------------------------------------------- the asset plan
// input: { assets, pool (pool.js: { main, logo }), mainAsset, premium (hero video: { source }), premium3D ({ planned,
// sourceAssetId }) } -> { entries: [...], summary }
function assetPlan(input) {
  const inp = input || {}; const all = (inp.assets || []).filter(a => a && a.id && !a.removed && !a.failed);
  const byId = new Map(all.map(a => [a.id, a]));
  const rootOf = a => (a && a.cutoutOf && byId.get(a.cutoutOf)) || (a && a.derivedFrom && byId.get(a.derivedFrom)) || a;
  const logo = a => a.ownerRole === 'logo' || a.kind === 'logo' || (inp.pool && inp.pool.logo && inp.pool.logo.id === a.id);
  const roots = all.filter(a => !a.cutoutOf && !a.derivedFrom && !logo(a) && !(a.curation && ['unrelated'].includes(a.curation.role)));
  const mainId = (inp.pool && inp.pool.main && (rootOf(byId.get(inp.pool.main.id)) || {}).id) || (byId.get(inp.mainAsset) && rootOf(byId.get(inp.mainAsset)).id) || (roots.find(a => a.ownerRole === 'main') || roots[0] || {}).id || null;
  const cutOf = a => all.find(x => x.cutoutOf === a.id && x.caps && x.caps.moveFreely) || null;
  const vid = inp.premium && inp.premium.source; const td = inp.premium3D && inp.premium3D.planned ? inp.premium3D.sourceAssetId : null;
  const entries = roots.slice(0, 12).map(a => {
    const p = F.profile(a); const m = a.assess || {}; const cut = cutOf(a);
    const sub = Array.isArray(p.subject) ? p.subject : [0.25, 0.25, 0.75, 0.75];
    const fill = (sub[2] - sub[0]) * (sub[3] - sub[1]);
    const bleed = !p.free && !p.tight && (p.wide || (m.width || 0) >= 1400) && (m.width || 0) >= 1000;
    const detail = !p.free && fill >= 0.45 && !p.wide;
    const role = a.id === mainId ? (cut ? 'actor' : 'hero') : bleed ? 'bleed' : detail ? 'detail' : ((a.curation && a.curation.role) === 'environment' ? 'texture' : 'support');
    return {
      id: a.id, role, cutout: cut ? cut.id : null,
      crop: p.tight ? 'none' : fill >= 0.5 ? 'light' : 'generous',
      subject: [+((sub[0] + sub[2]) / 2).toFixed(2), +((sub[1] + sub[3]) / 2).toFixed(2)],
      fullFrame: bleed, carry: !!cut || bleed,
      source3d: !!cut && a.origin === 'upload' && !a.pageUrl, cinematic: !p.free && (m.width || 0) >= 1200 && p.wide !== false,
      video: !!(vid && vid === a.id) || !!(a.video && a.video.mediaId), model: !!(td && (td === a.id || (byId.get(td) && rootOf(byId.get(td)).id === a.id))),
      use: a.id === mainId ? 'callback' : 'once',
    };
  });
  const hero = entries.find(e => e.id === mainId) || null;
  const summary = {
    hero: hero ? hero.id : null, actor: hero && hero.cutout ? hero.cutout : null, pictures: entries.length,
    bleeds: entries.filter(e => e.fullFrame).length, cutouts: entries.filter(e => e.cutout).length, details: entries.filter(e => e.role === 'detail').length,
    video: (entries.find(e => e.video) || {}).id || null, model: (entries.find(e => e.model) || {}).id || null,
    // (too weak for an image-led concept: no picture of the subject itself, or a single one with nothing to stage it)
    weak: !hero || (entries.length < 2 && !(hero && (hero.cutout || hero.fullFrame))),
  };
  return { entries, summary };
}

// ---------------------------------------------------------------- the concept
// input: { understanding, assets: assetPlan(...), ambition (art.js), premium3D } -> concept
const MOTION_FOR = { product: 'campaign-cuts', fashion: 'floating-product', automotive: 'cinematic-camera', tech: 'mechanical-precision', hospitality: 'cinematic-camera', luxury: 'luxury-reveal', editorial: 'editorial-restraint', personal: 'editorial-restraint', other: 'cinematic-camera' };
const TYPE_FOR = { product: 'campaign-oversized', fashion: 'compressed-brutal', automotive: 'edge-labels', tech: 'minimal-captions', hospitality: 'minimal-captions', luxury: 'luxury-serif', editorial: 'editorial-serif', personal: 'editorial-serif', other: 'stacked-takeover' };
const STEP = (x, d) => INTENSITIES[Math.max(0, Math.min(2, INTENSITIES.indexOf(x) + d))];
function concept(input) {
  const inp = input || {}; const u = inp.understanding || {}; const plan = inp.assets || assetPlan({});
  const S = plan.summary; const genre = genreOf(u); const name = clean(u.name || (u.identity && u.identity.name) || u.subject || 'the subject', 60);
  const what = clean((u.identity && u.identity.what) || '', 60); const register = String((u.tone && (u.tone.register || u.tone)) || '').toLowerCase();
  let intensity = GENRE_INTENSITY[genre];
  if (S.weak) intensity = STEP(intensity, -1);
  if (inp.ambition === 'restrained') intensity = STEP(intensity, -1); else if (inp.ambition === 'experimental' && intensity !== 'restrained') intensity = STEP(intensity, 1);
  // the hero actor: a cut-out of the subject, a 3D model of it, or its key photograph -- persisting across scenes only where
  // the subject is an object the page can move (never on an editorial or personal page)
  const model = S.model && inp.premium3D && inp.premium3D.planned;
  const actorKind = model ? 'model3d' : S.actor ? 'object' : S.hero ? 'photo' : 'none';
  const persists = OBJECT_GENRES.includes(genre) && actorKind !== 'photo' && actorKind !== 'none' && intensity !== 'restrained';
  const signature = persists ? 'actor-travel'
    : genre === 'personal' ? 'work-sequence' : genre === 'editorial' ? 'type-takeover' : genre === 'hospitality' ? 'environment'
      : genre === 'luxury' ? (S.actor ? 'monumental-object' : 'slow-reveal') : S.bleeds >= 1 && S.hero ? 'full-bleed-cinema' : S.actor ? 'monumental-object' : 'type-takeover';
  const motion = register === 'playful' && ['product', 'fashion', 'other'].includes(genre) ? 'playful-elastic' : genre === 'tech' && S.cutouts ? 'spatial-depth' : MOTION_FOR[genre];
  const type = signature === 'actor-travel' && genre !== 'automotive' ? 'behind-subject' : TYPE_FOR[genre];
  const style = { 'actor-travel': 'object-led', 'monumental-object': 'object-led', 'full-bleed-cinema': 'full-bleed-cinema', 'type-takeover': 'type-led', 'slow-reveal': 'negative-space', environment: 'environment-immersive', 'work-sequence': 'work-led' }[signature];
  const bookend = persists ? 'actor-return' : S.hero ? 'image-callback' : 'title-return';
  const subjectWord = what || 'subject';
  const thesis = {
    'actor-travel': `The ${subjectWord} is the actor: it opens monumental and alone, travels through the page -- through type and colour -- and returns at the end.`,
    'monumental-object': `${name} is shown as one monumental object in generous space: every scene is a new way of looking at it, and it closes the page.`,
    'full-bleed-cinema': `${name} in full-screen frames: each scene is a cinematic shot, cut on the motion, and the opening shot returns as the ending.`,
    'type-takeover': `The words are the image: ${name} is told in oversized type set against the pictures, with quiet frames between the takeovers.`,
    'slow-reveal': `${name} is revealed slowly: few elements, deep negative space, light and material doing the work.`,
    environment: `${name} as a place to step into: every scene is an environment, and the page moves like walking through it.`,
    'work-sequence': `${name}, told through the work: one strong image at a time, a quiet editorial voice, and the person returning at the close.`,
  }[signature];
  const feeling = { aggressive: 'thrilled -- it should feel like a launch', expressive: 'drawn in and curious', restrained: 'calm, close and unhurried' }[intensity];
  const metaphor = { product: 'a campaign shot frame by frame', fashion: 'a runway at full speed', automotive: 'a film about one drive', tech: 'a precise machine assembling itself', luxury: 'a still life under museum light', editorial: 'a printed feature, turned into motion', personal: 'a portfolio laid out on a long table', hospitality: 'an evening arriving', other: 'a short film' }[genre];
  const memorable = { 'actor-travel': 'the subject crossing every seam and coming back at the end', 'monumental-object': 'the object at monumental scale in empty space', 'full-bleed-cinema': 'a full-screen shot that becomes the next scene', 'type-takeover': 'a type takeover that fills the screen', 'slow-reveal': 'the slow reveal of one detail', environment: 'stepping into the place', 'work-sequence': 'one image at a time, full width' }[signature];
  return {
    genre, intensity, thesis: clean(thesis, 240), feeling, metaphor, memorable,
    actor: { kind: actorKind, asset: actorKind === 'object' ? S.actor : actorKind === 'none' ? null : (S.model || S.hero), persists },
    signature, motion, type, style, bookend,
  };
}

// ---------------------------------------------------------------- the concept steers the recipe (art.js choose)
// multipliers (never zero: a page still varies) for personalities, modes and families
const PERS_FOR = { 'campaign-cuts': { kinetic: 1.5, chaotic: 1.2, playful: 1.2, editorial: 0.7, still: 0.5 }, 'playful-elastic': { playful: 1.6, kinetic: 1.2, still: 0.5 }, 'floating-product': { kinetic: 1.3, cinematic: 1.3, playful: 1.1, still: 0.6 },
  'cinematic-camera': { cinematic: 1.6, luxe: 1.1, still: 0.7 }, 'mechanical-precision': { mechanical: 1.6, cinematic: 1.2, playful: 0.7 }, 'spatial-depth': { cinematic: 1.4, mechanical: 1.4, playful: 0.7 },
  'luxury-reveal': { luxe: 1.8, cinematic: 1.2, still: 1.1, chaotic: 0.5, kinetic: 0.7, playful: 0.6 }, 'editorial-restraint': { editorial: 1.6, still: 1.2, luxe: 1.1, chaotic: 0.5, kinetic: 0.7, playful: 0.7 } };
const MODE_FOR = { aggressive: { quiet: 0.6, editorial: 0.8, expressive: 1.3, immersive: 1.2 }, expressive: { quiet: 0.8, editorial: 1, expressive: 1.2, immersive: 1 }, restrained: { quiet: 1.1, editorial: 1.3, expressive: 0.9, immersive: 0.7 } };
const FAMILY_FOR = { 'actor-travel': { 'object-story': 1.8, 'poster-to-scene': 1.1, 'editorial-sticky': 0.6 }, 'monumental-object': { 'object-story': 1.3, 'cinematic-chapters': 1.2, 'mask-transition': 1.2, 'editorial-sticky': 0.8 },
  'full-bleed-cinema': { 'cinematic-chapters': 1.6, 'layered-parallax': 1.2, 'mask-transition': 1.2, 'editorial-sticky': 0.7 }, 'type-takeover': { 'typography-led': 1.6, 'poster-to-scene': 1.3, 'colour-progression': 1.1 },
  'slow-reveal': { 'cinematic-chapters': 1.3, 'mask-transition': 1.3, 'layered-parallax': 1.1, 'editorial-sticky': 0.9 }, environment: { 'cinematic-chapters': 1.4, 'layered-parallax': 1.3, 'horizontal-gallery': 1.1 },
  'work-sequence': { 'gallery-progression': 1.4, 'editorial-sticky': 1.2, 'horizontal-gallery': 1.2, 'object-story': 0.6 } };
function weights(c) {
  const x = c || {};
  // (a subject of no recognised genre is the recipe's own to read -- the concept only steers where it knows the genre)
  if (!x.genre || x.genre === 'other') return { personality: () => 1, mode: () => 1, family: () => 1 };
  // (half-strength: a nudge toward the concept -- the history and the subject's own reading still decide between suitable
  // directions, so pages for different subjects stay far apart)
  const soft = v => 1 + ((v || 1) - 1) * 0.5;
  return { personality: k => soft((PERS_FOR[x.motion] || {})[k]), mode: m => soft((MODE_FOR[x.intensity] || {})[m]),
    family: f => soft((FAMILY_FOR[x.signature] || {})[f]) * (f === 'object-story' && x.actor && !x.actor.persists ? 0.75 : 1) };
}

// ---------------------------------------------------------------- the page as composed: a structured picture of it
const PAYOFF_LAYOUTS = ['shrine', 'editorial-hero', 'fullscreen-object', 'campaign', 'poster', 'object-stage', 'lineup', 'image', 'cinematic', 'luxe', 'giant-type'];
const HERO_LAYOUTS = ['shrine', 'luxe', 'editorial-hero', 'fullscreen-object', 'campaign', 'object-stage', 'stage', 'cinematic', 'giant-type', 'poster', 'type-stage', 'mask-stage', 'depth-stack'];
const CARD_LAYOUTS = ['framed', 'gallery', 'collage', 'scrapbook', 'strip'];
const SPLIT_LAYOUTS = ['split', 'splitscreen', 'magazine'];
const TYPE_LAYOUTS = ['giant-type', 'poster', 'campaign', 'takeover', 'brutalist', 'type-stage', 'mask-stage'];
// ctx: { byId, main (root id), rootOf(asset) -> root id, video (root ids with a clip), heroVideo, run(i) -> in the actor's run }
function survey(scenes, ctx) {
  const c = ctx || {}; const byId = c.byId || new Map(); const root = id => (c.rootOf ? c.rootOf(id) : id);
  // (with a look the page's image ledger shows each picture once -- the actor's run and the closing's marked callback
  // excepted: a picture the ledger will take away is not judged as shown)
  const seen = new Set(c.ledger && c.actorRoot ? [c.actorRoot] : []);
  return (scenes || []).map((s, i) => {
    const sh = COMP.shapeOf(s); const imgs = (s.layers || []).filter(L => L.kind === 'image' && byId.get(L.asset)).filter(L => { if (!c.ledger) return true; const r = root(L.asset); const ok = !seen.has(r) || L.callback || (c.run && c.run(i) && r === c.actorRoot); seen.add(r); return ok; });
    const f = imgs.find(L => L.role === 'focal') || imgs[0]; const area = f && f.box ? Math.round((f.box.d[2] * f.box.d[3]) / 100) : 0;
    const shape = s.composition || s.layout || 'free'; const run = !!(c.run && c.run(i));
    const typeLed = sh.typeLed || TYPE_LAYOUTS.includes(s.layout) || !!(s.text && s.text.giant);
    const full = sh.full || area >= 90 || ['editorial-hero', 'cinematic', 'campaign', 'fullscreen-object'].includes(s.layout);
    // (a scene the arc made a breath, or a calm floating composition, rests -- whatever it is built from)
    const rests = s.arc === 'breath' || s.composition === 'floating-canvas' || ['luxe', 'canvas'].includes(s.layout);
    const intensity = rests && !s.pin ? (['text', 'dense'].includes(s.layout) ? 0 : 1) : s.pin || full || sh.takeover ? 3 : run || sh.centred || !!s.composition || typeLed ? 2 : ['text', 'dense', 'sticky-steps'].includes(s.layout) ? 0 : 1;
    const t = s.text || {};
    // (video as the renderer shows it: the premium hero plays inside its picture's frame only when that frame is large,
    // else full-bleed behind the whole scene -- never small; a clip on a picture layer is as large as that layer)
    const clips = imgs.filter(L => (c.video || []).includes(root(L.asset))); const hero = i === 0 && !!c.heroVideo;
    return {
      id: s.id, i, shape, layout: s.layout, composition: s.composition || null, beat: s.beat || null,
      focal: f ? root(f.asset) : null, roots: [...new Set(imgs.map(L => root(L.asset)))], area: run ? Math.max(area, 40) : area,
      framed: sh.framed || (!s.composition && CARD_LAYOUTS.includes(s.layout)), split: !s.composition && SPLIT_LAYOUTS.includes(s.layout),
      full, typeLed, centred: sh.centred || run || ['shrine', 'luxe', 'fullscreen-object', 'object-stage'].includes(s.layout), run,
      intensity, words: `${t.size || ''}|${t.place ? `${t.place.v}/${t.place.align}` : t.region || ''}|${t.width || ''}|${t.body ? 'body' : ''}`,
      motion: s.choreo || 'settle', surface: (s.ink && s.ink.surface) || '', callback: imgs.some(L => L.callback),
      video: clips.length > 0 || hero, videoBig: (clips.length > 0 || hero) && clips.every(L => L.box && L.box.d[2] * L.box.d[3] >= 4500),
    };
  });
}

// ---------------------------------------------------------------- the critique: the page judged as one composition
// ctx: survey's ctx + { concept, mode } -> [{ code, at, w }] (at: the scene a repair should start from)
const W = { 'weak-hero': 3, 'small-hero': 2, cards: 2, splits: 1.5, repeats: 1.5, 'no-full': 1.5, 'no-type': 1, 'weak-payoff': 2, 'no-return': 1.5, 'no-breath': 1, 'spent-early': 1, 'video-small': 3, 'same-words': 1, 'one-asset': 0.5 };
function critique(scenes, ctx) {
  const c = ctx || {}; const k = c.concept || {}; const g = k.genre || 'other'; const sv = survey(scenes, c); const n = sv.length; const out = [];
  const add = (code, at) => { if (!out.some(x => x.code === code)) out.push({ code, at: Math.max(0, Math.min(n - 1, at)), w: W[code] }); };
  if (!n) return out;
  const pictured = sv.filter(x => x.focal).length; const restrained = k.intensity === 'restrained'; const visual = ['product', 'fashion', 'automotive', 'tech', 'hospitality', 'luxury'].includes(g);
  const h = sv[0];
  if (pictured && !(h.full || h.centred || h.typeLed || HERO_LAYOUTS.includes(h.layout))) add('weak-hero', 0);
  else if (pictured && h.focal && !h.full && !h.typeLed && !h.centred && h.area < (restrained ? 20 : 30)) add('small-hero', 0);
  const cards = sv.filter(x => x.framed); if (cards.length >= 2) add('cards', cards[1].i);
  const splits = sv.filter(x => x.split); if (splits.length >= (restrained ? 3 : 2)) add('splits', splits[splits.length - 1].i);
  for (let i = 2; i < n; i++) if (sv[i].shape === sv[i - 1].shape && sv[i].shape === sv[i - 2].shape && !sv[i].run) add('repeats', i);
  const count = {}; sv.forEach(x => { if (x.run) return; count[x.shape] = (count[x.shape] || 0) + 1; if (count[x.shape] === 3) add('repeats', x.i); });
  if (visual && pictured >= 2 && n >= 3 && !sv.some(x => x.full)) add('no-full', Math.max(1, sv.findIndex((x, i) => i > 0 && i < n - 1 && x.focal)));
  if (['product', 'fashion', 'automotive', 'editorial'].includes(g) && n >= 3 && !sv.some(x => x.typeLed)) add('no-type', Math.max(1, sv.findIndex((x, i) => i > 0 && i < n - 1)));
  const last = sv[n - 1];
  if (n >= 3 && !(PAYOFF_LAYOUTS.includes(last.layout) || (last.composition && (COMP.SPEC[last.composition] || { arcs: [] }).arcs.includes('payoff')))) add('weak-payoff', n - 1);
  if (n >= 3 && ['actor-return', 'image-callback'].includes(k.bookend) && c.main && !last.roots.includes(c.main)) add('no-return', n - 1);
  const middle = sv.slice(1, -1);
  if (n >= 5 && !restrained && middle.length && middle.every(x => x.intensity >= 2)) add('no-breath', middle.sort((a, b) => b.intensity - a.intensity)[Math.floor(middle.length / 2)].i);
  if (n >= 4 && !restrained && middle.length && Math.max(...middle.map(x => x.intensity)) < 2) add('spent-early', middle[middle.length - 1].i);
  sv.forEach(x => { if (x.video && !x.full && !x.videoBig) add('video-small', x.i); });
  const words = {}; sv.forEach(x => { if (x.typeLed) return; words[x.words] = (words[x.words] || 0) + 1; if (words[x.words] === 3) add('same-words', x.i); });
  const focal = {}; sv.forEach(x => { if (x.focal && !x.run && !x.callback) focal[x.focal] = (focal[x.focal] || 0) + 1; });
  if (pictured >= 3 && Object.values(focal).some(v => v > Math.ceil(n / 2))) add('one-asset', 1);
  return out;
}
const score = findings => +(findings || []).reduce((t, x) => t + (x.w || W[x.code] || 1), 0).toFixed(2);

// ---------------------------------------------------------------- the repairs a finding may take
// -> [{ at, layout } | { at, composition } | { at, layout, callback: true }], best first; validate2 tries them in order on
// the scene's own pictures and keeps one only when the page scores better. Expressive and immersive pages reach for the
// motion-first compositions; quieter pages for archetype layouts (negative space, no held scroll).
const TARGETS = {
  hero: { aggressive: ['c:fullscreen-subject', 'c:object-stage', 'campaign', 'fullscreen-object', 'shrine', 'editorial-hero'], expressive: ['c:fullscreen-subject', 'editorial-hero', 'fullscreen-object', 'shrine'], restrained: ['shrine', 'luxe', 'editorial-hero', 'fullscreen-object', 'giant-type'] },
  heroText: ['editorial-hero', 'giant-type', 'poster', 'shrine'],
  unframe: { aggressive: ['c:image-takeover', 'c:object-focus', 'edge-crop', 'image', 'editorial-hero'], expressive: ['c:image-takeover', 'edge-crop', 'image', 'editorial-hero'], restrained: ['image', 'edge-crop', 'luxe', 'shrine', 'editorial-hero'] },
  full: ['c:fullscreen-subject', 'c:cinematic-chapter', 'c:image-takeover', 'editorial-hero', 'cinematic', 'image'],
  type: ['c:type-takeover', 'giant-type', 'poster', 'campaign'],
  payoffWork: ['image', 'editorial-hero', 'giant-type', 'poster'],
  payoff: { aggressive: ['c:object-stage', 'c:fullscreen-subject', 'shrine', 'campaign', 'fullscreen-object', 'editorial-hero'], expressive: ['c:fullscreen-subject', 'c:object-stage', 'editorial-hero', 'shrine', 'image'], restrained: ['shrine', 'luxe', 'image', 'editorial-hero'] },
  breath: ['c:floating-canvas', 'luxe', 'image', 'text'],
  escalate: ['c:type-takeover', 'c:image-takeover', 'c:depth-stack', 'campaign', 'editorial-hero', 'giant-type'],
  vary: ['c:object-focus', 'c:image-takeover', 'edge-crop', 'image', 'luxe', 'editorial-hero', 'giant-type'],
};
function candidates(f, scenes, ctx) {
  const c = ctx || {}; const k = c.concept || {}; const lvl = k.intensity || 'expressive'; const n = (scenes || []).length;
  const motionFirst = c.mode === 'expressive' || c.mode === 'immersive';
  // (the best few repairs in an order of this page's own -- two pages fixed for the same reason do not become the same page)
  const rot = (arr, at) => { let h = 2166136261; for (const ch of `${c.seed || ''}|${at}|${f.code}`) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } const k = Math.min(3, arr.length); const r = (h >>> 0) % (k || 1); return arr.slice(0, k).slice(r).concat(arr.slice(0, k).slice(0, r), arr.slice(k)); };
  const list = (t, at, extra) => rot((Array.isArray(t) ? t : t[lvl] || t.expressive).filter(x => motionFirst || !x.startsWith('c:')), at).map(x => Object.assign({ at }, x.startsWith('c:') ? { composition: x.slice(2) } : { layout: x }, extra || {}));
  const middle = Array.from({ length: n }, (_, i) => i).filter(i => i > 0 && i < n - 1);
  const near = at => middle.slice().sort((a, b) => Math.abs(a - at) - Math.abs(b - at));
  switch (f.code) {
    case 'weak-hero': case 'small-hero': return list(['editorial', 'personal'].includes(k.genre) ? TARGETS.heroText : TARGETS.hero, 0);
    case 'cards': case 'splits': return list(TARGETS.unframe, f.at);
    case 'repeats': case 'same-words': return list(TARGETS.vary, f.at);
    case 'no-full': return near(f.at).slice(0, 3).flatMap(at => list(TARGETS.full, at));
    case 'no-type': return near(f.at).slice(0, 3).flatMap(at => list(TARGETS.type, at));
    case 'weak-payoff': case 'no-return': return list(['editorial', 'personal'].includes(k.genre) ? TARGETS.payoffWork : TARGETS.payoff, n - 1, { callback: f.code === 'no-return' || ['actor-return', 'image-callback'].includes(k.bookend) });
    case 'no-breath': return list(TARGETS.breath, f.at);
    case 'spent-early': return near(f.at).slice(0, 2).flatMap(at => list(TARGETS.escalate, at));
    case 'video-small': return list(['c:fullscreen-subject', 'c:cinematic-chapter', 'editorial-hero', 'cinematic'], f.at);
    default: return [];
  }
}

// ---------------------------------------------------------------- each scene's beat
// from what each scene became: its composition's arc role where it has one, else what it does on screen
const ARC_BEAT = { hook: 'hook', transformation: 'transformation', reveal: 'reveal', breath: 'breath', escalation: 'acceleration', takeover: 'takeover', payoff: 'payoff' };
function beats(scenes, ctx) {
  const sv = survey(scenes, ctx); const n = sv.length;
  return sv.map((x, i) => {
    if (i === 0) return 'hook';
    if (i === n - 1) return x.callback || (ctx && ctx.main && x.roots.includes(ctx.main) && n >= 3) ? 'callback' : 'payoff';
    const arc = scenes[i].arc && ARC_BEAT[scenes[i].arc]; if (arc && arc !== 'hook' && arc !== 'payoff') return arc;
    if (x.typeLed) return 'typography';
    if (x.run) return i <= 2 ? 'reveal' : 'acceleration';
    if (['orbit', 'orbit-stage'].includes(x.shape)) return 'interaction';
    if (x.full || x.intensity >= 3) return 'takeover';
    if (x.layout === 'edge-crop' || x.shape === 'object-focus') return 'detail';
    if (x.intensity === 0 || ['luxe', 'floating-canvas', 'canvas'].includes(x.shape)) return 'breath';
    return 'reveal';
  });
}

// ---------------------------------------------------------------- the only door into a stored plan
const cleanBeat = b => oneOf(b, BEATS, null);
// staleLabel(scene, visual, ctx) -> true when a recomposed scene's label is only the description of a picture it no longer
// shows (the words were written for that picture: a label naming a festival over a can is wrong, not art direction)
function staleLabel(scene, visual, ctx) {
  const t = scene && scene.text; const v = visual && typeof visual === 'object' ? visual : null;
  if (!t || !t.kicker || !v || !v.subject || !v.asset) return false;
  if (String(t.kicker).trim().toLowerCase() !== String(v.subject).trim().toLowerCase()) return false;
  const want = ctx.rootOf(v.asset); return !(scene.layers || []).some(L => L && L.kind === 'image' && ctx.byId.get(L.asset) && ctx.rootOf(L.asset) === want);
}
function normaliseIdea(raw, ctx) {
  if (!raw || typeof raw !== 'object' || !raw.concept || typeof raw.concept !== 'object') return null;
  const k = raw.concept; const has = id => !id || !ctx || !ctx.byId || ctx.byId.has(id);
  const a = k.actor && typeof k.actor === 'object' ? k.actor : {};
  const concept = {
    genre: oneOf(k.genre, GENRES, 'other'), intensity: oneOf(k.intensity, INTENSITIES, 'expressive'), thesis: clean(k.thesis, 240), feeling: clean(k.feeling, 120), metaphor: clean(k.metaphor, 120), memorable: clean(k.memorable, 160),
    actor: { kind: oneOf(a.kind, ACTOR_KINDS, 'none'), asset: typeof a.asset === 'string' && has(a.asset) ? clean(a.asset, 60) : null, persists: a.persists === true },
    signature: oneOf(k.signature, SIGNATURES, 'full-bleed-cinema'), motion: oneOf(k.motion, MOTIONS, 'cinematic-camera'), type: oneOf(k.type, TYPES, 'stacked-takeover'), style: oneOf(k.style, STYLES, 'object-led'), bookend: oneOf(k.bookend, BOOKENDS, 'title-return'),
  };
  const assets = (Array.isArray(raw.assets) ? raw.assets : []).slice(0, 12).filter(e => e && typeof e.id === 'string' && has(e.id)).map(e => ({
    id: clean(e.id, 60), role: oneOf(e.role, ASSET_ROLES, 'support'), cutout: typeof e.cutout === 'string' && has(e.cutout) ? clean(e.cutout, 60) : null, crop: oneOf(e.crop, CROPS, 'light'),
    subject: Array.isArray(e.subject) ? e.subject.slice(0, 2).map(v => Math.max(0, Math.min(1, +v || 0))) : [0.5, 0.5], fullFrame: !!e.fullFrame, carry: !!e.carry, source3d: !!e.source3d, cinematic: !!e.cinematic, video: !!e.video, model: !!e.model, use: e.use === 'callback' ? 'callback' : 'once' }));
  const sequence = (Array.isArray(raw.sequence) ? raw.sequence : []).slice(0, 12).map(cleanBeat).filter(Boolean);
  const m = raw.model && typeof raw.model === 'object' && typeof raw.model.asset === 'string' && has(raw.model.asset) ? { asset: clean(raw.model.asset, 60), scene: clean(raw.model.scene, 60) || null, role: oneOf(raw.model.role, ['actor', 'reveal', 'payoff'], 'reveal') } : null;
  return Object.assign({ v: Number.isInteger(raw.v) && raw.v >= 1 && raw.v <= VERSION ? raw.v : VERSION, concept, assets, sequence }, m ? { model: m } : {});
}
function normaliseReview(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const codes = x => (Array.isArray(x) ? x : []).filter(c => FINDINGS.includes(c)).slice(0, 16);
  return {
    v: Number.isInteger(raw.v) && raw.v >= 1 && raw.v <= DIRECTOR_VERSION ? raw.v : DIRECTOR_VERSION, source: oneOf(raw.source, ['rules', 'ai+rules'], 'rules'),
    before: Math.max(0, Math.min(99, +raw.before || 0)), after: Math.max(0, Math.min(99, +raw.after || 0)), found: codes(raw.found), remaining: codes(raw.remaining),
    fixed: (Array.isArray(raw.fixed) ? raw.fixed : []).slice(0, 6).filter(x => x && FINDINGS.includes(x.code)).map(x => ({ scene: clean(x.scene, 60), code: x.code, from: clean(x.from, 40), to: clean(x.to, 40) })),
  };
}

module.exports = { VERSION, DIRECTOR_VERSION, GENRES, INTENSITIES, MOTIONS, TYPES, STYLES, SIGNATURES, BOOKENDS, BEATS, FINDINGS, ASSET_ROLES, ACTOR_KINDS, CROPS, PAYOFF_LAYOUTS, HERO_LAYOUTS, W,
  genreOf, assetPlan, concept, weights, survey, critique, score, candidates, beats, staleLabel, normaliseIdea, normaliseReview, cleanBeat };
