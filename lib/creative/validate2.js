'use strict';
// CREATIVE — scene plans, version 2 (AI-directed). A v2 plan is a sequence of SCENES the model
// composes from reusable mechanics: layered stages (pictures, drawn shapes, giant words), masks,
// treatments, depth, entrance choreography, ambient loops, scroll-linked movement, pinned
// scroll-scrubbed scenes and camera moves, plus the words for each scene. The model decides how
// those mechanics serve the subject; the renderer (render2.js) is the same for every subject.
//
//   VOCAB                         every enum and bound (the model's tool schema is built from it)
//   validatePlan2(raw, ctx)       -> { plan, fixes, warnings, errors }
//     ctx: { assets, facts, understanding }
//   errors are problems worth one repair attempt (the plan cannot honestly be shown as it is);
//   fixes are corrections made in place; warnings are kept for the studio.
// Data only: nothing in a plan is executed, and every string is escaped by the renderer.

const { drawnRect, overlap, area } = require('./validate');
const ART = require('./art');
const TL = require('./timeline');
const SP = require('./spatial');
const CT = require('./continuity');
const POOL = require('./pool');
const PAL = require('./palette');
// compositions that carry words alone (a scene planned around a picture never becomes one of these)
const WORDS_ONLY = ['text', 'takeover', 'dense'];
const VIDEO_INTENTS = ['cinematic_hero', 'image_to_video', 'object_motion', 'environment_motion'];
const FR = require('./framing');
const ARCH = require('./archetypes');
const COMP = require('./composition');
// the composition rules' version, stamped on every accepted plan (0 = a plan saved before versioning)
// 4: the page blends into its pictures (cut-outs, scene tones, dissolving frames, page tone)
// 5: art direction -- layout archetypes, scene choreography and handoffs, explicit image framing with crop budgets and
//    zoom ceilings (a plan without them is composed exactly as under 4)
const LAYOUT_VERSION = 5;

const VOCAB = {
  display: ['didone', 'grotesk', 'serif', 'rounded', 'slab', 'mono', 'condensed', 'script'],
  typeScale: ['monumental', 'large', 'quiet'],
  typeCase: ['normal', 'upper'],
  backdrop: ['solid', 'gradient', 'spotlight', 'fog', 'water', 'stars', 'sky', 'paper', 'grain', 'horizon', 'vignette', 'sunrise', 'grid'],
  light: ['spot', 'lamp', 'caustics', 'rim', 'sun', 'none'],
  particles: ['dust', 'fog', 'bubbles', 'stars', 'clouds', 'steam', 'petals', 'sparks', 'snow', 'confetti', 'none'],
  tempo: ['still', 'slow', 'measured', 'lively'],
  thread: ['ribbon', 'thread', 'bubbles', 'orbit', 'line', 'stitch', 'none'],
  height: ['screen', 'tall', 'short', 'auto'],
  sceneBg: ['base', 'deep', 'invert', 'tint', 'accent'],
  camera: ['none', 'push-in', 'pull-out', 'pan-left', 'pan-right', 'rise'],
  region: ['left', 'right', 'center', 'bottom-left', 'bottom-right', 'bottom', 'top-left', 'top-right', 'top'],
  textSize: ['display', 'large', 'medium', 'small'],
  textWidth: ['narrow', 'medium', 'wide'],
  list: ['plain', 'numbered', 'labelled', 'timeline', 'notes'],
  textEntrance: ['rise', 'fade', 'split-words', 'none'],
  mobileOrder: ['text-first', 'stage-first'],
  layerKind: ['image', 'shape', 'word'],
  role: ['focal', 'support', 'backdrop', 'texture', 'echo'],
  fit: ['contain', 'cover'],
  mask: ['none', 'circle', 'arch', 'window', 'frame', 'porthole', 'torn', 'blob', 'diamond', 'polaroid', 'slit'],
  treatment: ['none', 'shadow', 'glow', 'duotone', 'mono', 'grain', 'outline', 'soft'],
  shape: ['circle', 'ring', 'triangle', 'diamond', 'star', 'wave', 'arc', 'line', 'blob', 'dots', 'sunburst', 'stripes', 'cross', 'block', 'tape'],
  // art direction (art.js / archetypes.js / framing.js)
  layout: ART.LAYOUTS, choreo: ART.CHOREOS, handoff: ART.HANDOFFS, frame: FR.FRAMES,
  personality: ART.PERSONALITIES, scrollModel: ART.SCROLLS, mplace: ['above', 'below', 'overlay'], textV: ['top', 'middle', 'bottom'], textAlign: ['left', 'center', 'right'],
  fill: ['accent', 'glow', 'ink', 'muted', 'bg2'],
  wordStyle: ['solid', 'outline', 'ghost'],
  entrance: ['rise', 'descend', 'pop', 'fade', 'unveil', 'dolly', 'slide-left', 'slide-right', 'spin-in', 'drop', 'none'],
  loop: ['float', 'sway', 'swim', 'breathe', 'drift', 'spin', 'pulse', 'orbit', 'bob', 'kenburns', 'sheen', 'none'],
  scroll: ['none', 'parallax', 'drift-x', 'rise', 'sink', 'zoom-in', 'zoom-out', 'rotate', 'pass-through', 'reveal'],
  copyKind: ['sourced', 'supplied', 'imagined'],
  matches: ['yes', 'partly', 'no', 'unsure'],
};
const LIMITS = { scenes: [2, 9], layersPerScene: 6, layersTotal: 32, pinned: 3, loopsPerScene: 2, scrollPerScene: 4, items: 6, photoUses: 2, cutoutUses: 3, heading: 110, body: 520, item: 260, kicker: 70 };
// where each text region sits on a desktop scene (x, y, w, h in % of the scene)
const REGION_BOXES = { left: [5, 16, 42, 68], right: [50, 16, 45, 68], center: [16, 24, 68, 52], 'bottom-left': [5, 56, 45, 38], 'bottom-right': [50, 56, 45, 38], bottom: [10, 62, 80, 32], 'top-left': [5, 8, 45, 38], 'top-right': [50, 8, 45, 38], top: [10, 8, 80, 32] };
const OPPOSITE = { left: 'right', right: 'left', center: 'bottom', 'bottom-left': 'top-right', 'bottom-right': 'top-left', bottom: 'top', 'top-left': 'bottom-right', 'top-right': 'bottom-left', top: 'bottom' };

const HEX = /^#[0-9a-f]{6}$/i;
const clean = (v, n) => (typeof v === 'string' ? v : v == null ? '' : String(v)).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim();
// (shortened, then trimmed: a cut that ends on a space would otherwise lose it on the next pass -- reopening must not change a thing)
const cap = (v, n) => clean(v).slice(0, n).trim();
const oneOf = (v, list, d) => (list.includes(v) ? v : d);
const num = (v, lo, hi, d) => (typeof v === 'number' && isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d);
const id = (v, d) => (clean(v).replace(/[^\w-]/g, '').slice(0, 40) || d);
function lum(hex) { const c = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; }
function contrast(a, b) { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }
function mix(a, b, t) { const pa = [1, 3, 5].map(i => parseInt(a.slice(i, i + 2), 16)), pb = [1, 3, 5].map(i => parseInt(b.slice(i, i + 2), 16)); return '#' + pa.map((v, i) => Math.round(v + (pb[i] - v) * t).toString(16).padStart(2, '0')).join(''); }
function box(raw, d, loose) {
  const lo = loose ? -30 : 0, hiW = loose ? 160 : 100;
  const b = Array.isArray(raw) && raw.length === 4 && raw.every(v => typeof v === 'number' && isFinite(v)) ? raw.slice() : d.slice();
  b[2] = Math.max(3, Math.min(hiW, b[2])); b[3] = Math.max(3, Math.min(hiW, b[3]));
  b[0] = Math.max(lo, Math.min((loose ? 130 : 100) - b[2], b[0])); b[1] = Math.max(lo, Math.min((loose ? 130 : 100) - b[3], b[1]));
  return b.map(v => Math.round(v * 10) / 10);
}
// a model sometimes writes a quotation into invented copy; quotes attributed to anyone are never invented
const ATTRIBUTED_QUOTE = /["“][^"”]{8,}["”]\s*[,—–-]?\s*(?:said|says|wrote|writes|according to)\b|\b(?:said|says|wrote|once wrote)\s*[,:]?\s*["“]/i;

// "supplied" means the owner's words: a line labelled so must mostly be made of what the owner wrote
const STOP = new Set('a an and the of to in on at for with by from as is are was were be been his her their its it he she they them him this that these those very so just still all any one own not no'.split(' '));
const words = t => String(t || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(w => w.length > 2 && !STOP.has(w));
function suppliedShare(text, supplied) { const w = words(text); if (!w.length) return 1; const pool = new Set(words(supplied.join(' '))); return w.filter(x => pool.has(x) || pool.has(x.replace(/s$/, '')) || pool.has(x + 's')).length / w.length; }

// numbers in a sentence (digits, and number words up to the thousands) -- an "imagined" line may not carry its own
const NUMW = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90, hundred: 100, thousand: 1000 };
// ordinals, so "the eighteenth century" in a fact supports "18th century" in a label
const ORDW = { first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10, eleventh: 11, twelfth: 12, thirteenth: 13, fourteenth: 14, fifteenth: 15, sixteenth: 16, seventeenth: 17, eighteenth: 18, nineteenth: 19, twentieth: 20, thirtieth: 30, fortieth: 40, fiftieth: 50, sixtieth: 60, seventieth: 70, eightieth: 80, ninetieth: 90, hundredth: 100, thousandth: 1000 };
function numbersIn(t) {
  const out = new Set(); const s = String(t || '').toLowerCase().replace(/(\d),(\d{3})/g, '$1$2');
  (s.match(/\d+(?:\.\d+)?/g) || []).forEach(n => out.add(String(+n)));
  s.replace(/\b(twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)[- ](one|two|three|four|five|six|seven|eight|nine|first|second|third|fourth|fifth|sixth|seventh|eighth|ninth)\b/g, (m, a, b) => { out.add(String(NUMW[a] + (NUMW[b] || ORDW[b]))); return ' '; })
    .split(/[^a-z]+/).forEach(w => { const v = NUMW[w] || ORDW[w]; if (v && v > 2) out.add(String(v)); });
  return out;
}

function validatePlan2(raw, ctx) {
  const c = ctx || {}; const fixes = [], warnings = [], errors = [];
  const p = raw && typeof raw === 'object' ? raw : {};
  const rawScenes0 = () => (Array.isArray(p.scenes) ? p.scenes : []);
  const assets = (c.assets || []).filter(a => a && a.id && !a.removed && !a.failed);
  const byId = new Map(assets.map(a => [a.id, a]));
  const facts = (c.facts || []).filter(f => f && f.id && f.text); const factIds = new Set(facts.map(f => f.id));
  // a citation as the model writes it -- "f3", "F3", "[f3]", "fact 3", or "f2, f3" for a line drawing on two facts --
  // is read as the first real fact id in it; nothing that is not a given fact id is ever accepted
  const citeOf = v => {
    if (typeof v !== 'string' || !v) return null; if (factIds.has(v)) return v;
    for (const m of v.matchAll(/(?:^|[^a-z0-9])(?:f|fact)[\s_#-]*0*(\d+)/gi)) { const idv = `f${m[1]}`; if (factIds.has(idv)) return idv; }
    return null;
  };
  const u = c.understanding || {}; const personal = (p.identity && p.identity.kind === 'personal') || u.kind === 'personal';
  // "accept" (a new plan from the director, or a recompose the owner asked for) normalises and composes it;
  // "safety" (reopening, exporting, loading a saved page) only enforces what must always hold -- bounds, existing
  // assets, the owner's-photos rule, honest labels -- and never moves anything, so a saved design stays as accepted
  const safety = c.mode === 'safety';
  const curOf = a => (a && (a.curation || (a.cutoutOf && byId.get(a.cutoutOf) && byId.get(a.cutoutOf).curation))) || null;

  // ---- identity, concept, look ----
  const identity = { name: cap(p.identity && p.identity.name, 120) || cap(u.subject, 120), kind: oneOf(p.identity && p.identity.kind, ['recognizable', 'fictional', 'personal', 'invented'], u.kind === 'ambiguous' ? 'recognizable' : (u.kind || 'recognizable')), note: cap(p.identity && p.identity.note, 200) };
  if (personal) identity.kind = 'personal';
  const concept = { title: cap(p.concept && p.concept.title, 80), logline: cap(p.concept && p.concept.logline, 300), why: cap(p.concept && p.concept.why, 300) };
  if (!concept.logline) errors.push('concept: no logline -- say what the page is, in one or two sentences');
  // headings, kickers, labels and the concept may not bring numbers of their own ("eighty million trees"): anything
  // above a small count must be stated by a given fact or the owner's own details
  const knownNums = new Set(); facts.concat((c.supplied || []).map(t => ({ text: t }))).forEach(f => numbersIn(f.text).forEach(n => knownNums.add(n)));
  const unsupported = s => [...numbersIn(s)].filter(n => +n > 12 && !knownNums.has(n));
  const checkNums = (where, what, s) => { const bad = unsupported(s); if (bad.length) errors.push(`${where}: the ${what} states ${bad.join(', ')}, which no given fact supports -- use a number from the facts, or none`); };
  if (facts.length || (c.supplied || []).length) { checkNums('concept', 'title', concept.title); checkNums('concept', 'logline', concept.logline); }
  const palette = {}; const pal = p.palette || {};
  [['bg', '#111114'], ['bg2', '#22222a'], ['ink', '#f4f2ee'], ['muted', '#b9b5ad'], ['accent', '#e0b44c'], ['glow', '#fff3d6']].forEach(([k, d]) => { palette[k] = HEX.test(pal[k] || '') ? pal[k].toLowerCase() : d; });
  if (contrast(palette.ink, palette.bg) < 7) { palette.ink = lum(palette.bg) > 0.3 ? '#141414' : '#f6f3ee'; fixes.push('palette: text colour changed for legibility'); }
  if (contrast(palette.muted, palette.bg) < 4.5) palette.muted = mix(palette.ink, palette.bg, 0.3);
  for (let i = 0; i < 12 && contrast(palette.accent, palette.bg) < 3.2; i++) palette.accent = mix(palette.accent, lum(palette.bg) > 0.3 ? '#000000' : '#ffffff', 0.18);
  const t = p.type || {};
  const type = { display: oneOf(t.display, VOCAB.display, 'serif'), scale: oneOf(t.scale, VOCAB.typeScale, 'large'), case: oneOf(t.case, VOCAB.typeCase, 'normal') };
  const at = p.atmosphere || {};
  const atmosphere = { backdrop: oneOf(at.backdrop, VOCAB.backdrop, 'gradient'), light: oneOf(at.light, VOCAB.light, 'none'), particles: oneOf(at.particles, VOCAB.particles, 'none'), density: num(at.density, 0, 1, 0.4), grain: !!at.grain };
  const motion = { tempo: oneOf(p.motion && p.motion.tempo, VOCAB.tempo, 'measured'), signature: cap(p.motion && p.motion.signature, 200) };
  const thread = { kind: oneOf(p.thread && p.thread.kind, VOCAB.thread, 'none'), colour: HEX.test((p.thread || {}).colour || '') ? p.thread.colour : palette.accent };
  // ---- art direction: the plan's own (a saved page, or the model's), else -- for a new plan -- the recipe the art
  // director chose for this page (ctx.art). A plan with neither is composed exactly as before (every scene 'free').
  // (a revision offers the recipe without imposing it: it applies only when the director adopted it -- a page asked to
  // stay as it is stays as it is)
  const useRecipe = !safety && !!c.art && !(c.artOptional && !(p.art && typeof p.art === 'object'));
  const art0 = ART.normaliseArt(p.art); const artR = useRecipe ? ART.normaliseArt(c.art) : null;
  const art = art0 && artR ? Object.assign({}, artR, art0, { recipe: artR.recipe || art0.recipe }) : art0 || artR;
  // a NEW page keeps the direction the system chose for its subject: the director tunes the details (type, nav, density,
  // progression, depth), never the concept, ambition, arc, intensity or personality -- a game franchise is not quietly
  // turned into an editorial essay (a revision may change them: the owner asked for it)
  if (art0 && artR && !c.artOptional) {
    const moved = ['personality', 'family', 'mode', 'ambition', 'concept'].filter(k => artR[k] && art[k] !== artR[k]);
    moved.forEach(k => { art[k] = artR[k]; });
    if (moved.length) fixes.push(`art: the chosen ${moved.join(', ')} kept (${moved.map(k => `${art0[k] || '-'} -> ${artR[k]}`).join(', ')})`);
  }
  const modeLim = ART.MODE_LIMITS[(art && art.mode) || 'expressive'] || ART.MODE_LIMITS.expressive;
  // the field the subject lives in (composition.js artDirection): a cosmic subject lives in a void, a digital one on a dark
  // grid -- the page is dark whatever the director's first palette (a new page only; a saved page keeps its colours)
  const field = art && art.direction ? art.direction.field : 'none';
  if (!safety && (field === 'void' || field === 'grid') && lum(palette.bg) > 0.08) {
    const deep = field === 'void' ? '#04060f' : '#05090d';
    palette.bg = mix(palette.accent, deep, 0.9); palette.bg2 = mix(palette.accent, deep, 0.78); palette.ink = '#f2f4fa'; palette.muted = mix(palette.ink, palette.bg, 0.32);
    for (let i = 0; i < 12 && contrast(palette.accent, palette.bg) < 3.2; i++) palette.accent = mix(palette.accent, '#ffffff', 0.18);
    palette.glow = mix(palette.glow, '#ffffff', 0.4);
    fixes.push(`palette: a ${field === 'void' ? 'cosmic' : 'digital'} subject lives in a dark field -- the page is dark`);
  }
  // (a void is full of stars -- the subject's field, not a decorative choice)
  if (!safety && field === 'void' && !['stars', 'sparks'].includes(atmosphere.particles)) { atmosphere.particles = 'stars'; atmosphere.density = Math.max(atmosphere.density, 0.5); }
  const recipeScenes = useRecipe && Array.isArray(c.art.scenes) ? c.art.scenes : [];
  const planRng = ART.rng(`${(p.direction && p.direction.seed) || c.seed || ''}|${cap(p.identity && p.identity.name, 60) || cap(u.subject, 60)}`);
  const flip = planRng() < 0.5 ? 1 : 0;

  // ---- what the director saw in each picture (vision) and what it wanted but could not have ----
  const assetNotes = (Array.isArray(p.assetNotes) ? p.assetNotes : []).slice(0, 24).filter(n => n && byId.has(n.asset)).map(n => ({ asset: n.asset, depicts: cap(n.depicts, 200), matches: oneOf(n.matches, VOCAB.matches, 'unsure'), useFor: cap(n.useFor, 120) }));
  const verdict = new Map(assetNotes.map(n => [n.asset, n.matches]));
  const baseOf = a => (a && a.cutoutOf ? byId.get(a.cutoutOf) || a : a);
  const verdictOf = a => verdict.get(a.id) || (a.cutoutOf ? verdict.get(a.cutoutOf) : null) || 'unsure';
  const wants = (Array.isArray(p.wants) ? p.wants : []).slice(0, 10).map(w => w && { description: cap(w.description, 200), role: cap(w.role, 40), asset: byId.has(w.asset) ? w.asset : null, fallback: cap(w.fallback, 200) }).filter(w => w && w.description);
  wants.forEach(w => { w.status = w.asset ? 'fulfilled' : 'missing'; });
  const limitations = (Array.isArray(p.limitations) ? p.limitations : []).slice(0, 8).map(x => cap(x, 240)).filter(Boolean);

  // ---- the persistent actor (an object story): ONE picture of the subject that lives across a run of scenes, moving
  // from pose to pose between them -- never the same picture pasted into each. It must be a clean cut-out of the subject
  // (the owner's own on a personal page), never a tight crop; its poses are bounded, and it is never enlarged past what
  // its pixels can hold.
  const rawActor = p.actor && typeof p.actor === 'object' ? p.actor : (useRecipe && c.art && c.art.actor ? c.art.actor : null);
  let actor = null;
  if (rawActor && art && rawScenes0().length >= 2) {
    const n = Math.min(rawScenes0().length, LIMITS.scenes[1]); const maxLen = safety ? 5 : modeLim.actor;
    const from = Math.round(num(rawActor.from, 0, n - 1, 0)); let to = Math.round(num(rawActor.to, from, n - 1, from));
    if (to - from + 1 > maxLen) to = from + maxLen - 1;
    const okActor = a => !!(a && (a.cutout || (a.assess && a.assess.transparent)) && !(curOf(a) && (curOf(a).role === 'unrelated' || curOf(a).identity === 'other' || curOf(a).identity === 'form')) && !(personal && baseOf(a).origin !== 'upload') && verdictOf(a) !== 'no');
    let a = byId.get(rawActor.asset);
    if (!okActor(a) && !safety) {
      const main = c.mainAsset && byId.get(c.mainAsset); const rank = x => (baseOf(x).origin === 'upload' ? 4 : 0) + (curOf(x) && curOf(x).role === 'subject' ? 2 : 0) + (x.relevance || 0);
      a = (main && assets.find(x => x.cutoutOf === main.id && okActor(x))) || assets.filter(okActor).sort((x, y) => rank(y) - rank(x))[0] || null;
    }
    // (a run that opens the page carries the owner's chosen main picture -- or starts after the opening scene)
    let from1 = from; const mainC = !safety && c.mainAsset ? byId.get(c.mainAsset) : null;
    if (mainC && from1 === 0 && a && a.id !== mainC.id && a.cutoutOf !== mainC.id) { const own = assets.find(x => (x.id === mainC.id || x.cutoutOf === mainC.id) && okActor(x)); if (own) a = own; else from1 = 1; }
    if (maxLen >= 2 && to > from1 && okActor(a)) {
      const res = a.assess && a.assess.height ? Math.max(0.5, Math.min(1.4, a.assess.height * 1.15 / 670)) : 1.2;
      const raw = Array.isArray(rawActor.poses) ? rawActor.poses : []; const poses = [];
      for (let k = 0; k <= to - from1; k++) { const q = raw[Math.min(k, raw.length - 1)] || {}; poses.push({ x: Math.round(num(q.x, -30, 30, 0)), y: Math.round(num(q.y, -20, 20, 0)), s: Math.round(num(q.s, 0.5, res, 1) * 100) / 100, r: Math.round(num(q.r, -18, 18, 0)) }); }
      actor = { asset: a.id, from: from1, to, poses, exit: oneOf(rawActor.exit, ['offstage', 'shrink', 'rejoin'], 'offstage') };
      if (!safety && rawActor.asset && rawActor.asset !== a.id) fixes.push(`actor: ${a.id} carries the run (the picture given could not)`);
    } else if (!safety) fixes.push(modeLim.actor < 2 ? 'actor: a quiet or editorial page carries no actor -- each scene composes on its own' : 'actor: no clean cut-out of the subject to carry across scenes -- each scene composes on its own');
  }
  const inRun = si => !!(actor && si >= actor.from && si <= actor.to);

  // ---- scenes ----
  const rawScenes = rawScenes0();
  if (rawScenes.length < LIMITS.scenes[0]) errors.push(`scenes: at least ${LIMITS.scenes[0]} scenes are needed`);
  if (rawScenes.length > LIMITS.scenes[1]) fixes.push(`scenes: ${rawScenes.length - LIMITS.scenes[1]} scene(s) beyond ${LIMITS.scenes[1]} dropped`);
  const uses = new Map(); let layersTotal = 0, pinned = 0; const seenIds = new Set();
  // (how often one picture may appear: twice -- three times as its cut-out -- and more on a page with only one or two
  // pictures, each time framed differently, so a weak search still makes a picture-led page)
  const nPics = new Set(assets.filter(a => a.ownerRole !== 'logo' && !(curOf(a) && (curOf(a).role === 'unrelated' || curOf(a).identity === 'other'))).map(a => baseOf(a).id)).size;
  const extra = Math.max(0, POOL.photoUses(nPics) - LIMITS.photoUses);
  // where a scene's words go, from its picture: a subject on the left puts the picture on the left and the words on the
  // right (the picture's empty side faces them); a full-bleed picture keeps its words in its measured negative space
  // (unknown composition: the archetype's own alternation)
  const placeFor = (scene, alt) => {
    const f = scene.layers.find(L => L.role === 'focal' && L.kind === 'image' && byId.get(L.asset)) || scene.layers.find(L => L.kind === 'image' && byId.get(L.asset));
    if (!f) return { side: alt };
    const pr = CT.profileOf(byId.get(f.asset));
    const side = pr.side === 'left' || pr.side === 'right' ? pr.side : alt;
    const textSide = ['left', 'right', 'top'].includes(pr.space) && pr.room >= 0.22 ? pr.space : pr.side === 'left' ? 'right' : pr.side === 'right' ? 'left' : '';
    return { side, textSide };
  };
  const useMax = { photo: LIMITS.photoUses + extra, cut: LIMITS.cutoutUses + extra };
  let compsSoFar = 0, holds = 0; const holdCap = COMP.HOLDS[(art && art.mode) || 'quiet'] || 0;
  // what a scene's pictures can carry, for its composition: a clean cut-out, a wide photo that fills the screen, a located
  // subject, how many pictures (composition.js fit / baseFor)
  const carryOf = (scene, si) => COMP.carryOf(scene, byId, { video: !!(si === 0 && c.premiumHero), name: identity.name });
  let sourcedLines = 0, uncited = 0; const badCites = [];
  const scenes = rawScenes.slice(0, LIMITS.scenes[1]).map((rs, si) => {
    if (!rs || typeof rs !== 'object') return null;
    let sid = id(rs.id, `scene-${si + 1}`); while (seenIds.has(sid)) sid += 'x'; seenIds.add(sid);
    const where = `scene ${si + 1} (${sid})`;
    const height = oneOf(rs.height, VOCAB.height, si === 0 ? 'screen' : 'auto');
    // the scene's composition: an archetype (composed by archetypes.js) or 'free' (the plan's own boxes)
    const rec = recipeScenes[si] || null;
    const layout0 = oneOf(rs.layout, VOCAB.layout, art && rec && !rs.layout ? oneOf(rec.layout, VOCAB.layout, 'free') : 'free');
    let layout = inRun(si) && (!safety || (c.recompose && c.recompose.includes(id(rs.id, `scene-${si + 1}`)))) ? 'stage' : layout0;
    const artScene = layout !== 'free';
    const composing = !safety || !!(c.recompose && c.recompose.includes(sid));
    // (an archetype decides its own pin when it is composed; a saved one keeps what it had)
    let pin = !!rs.pin && height === 'tall' && !(artScene && composing);
    if (pin && pinned >= LIMITS.pinned) { pin = false; fixes.push(`${where}: more than ${LIMITS.pinned} pinned scenes -- unpinned`); }
    if (pin) pinned++;
    // words
    const tx = rs.text || {};
    const text = { kicker: cap(tx.kicker, LIMITS.kicker), heading: clean(tx.heading), body: clean(tx.body), kind: oneOf(tx.kind, VOCAB.copyKind, 'imagined'), cite: citeOf(tx.cite), region: oneOf(tx.region, VOCAB.region, si === 0 ? 'left' : 'center'), size: oneOf(tx.size, VOCAB.textSize, si === 0 ? 'display' : 'large'), width: oneOf(tx.width, VOCAB.textWidth, 'medium'), list: oneOf(tx.list, VOCAB.list, 'plain'), entrance: oneOf(tx.entrance, VOCAB.textEntrance, 'rise'), items: [] };
    if (text.heading.length > LIMITS.heading) { errors.push(`${where}: heading is ${text.heading.length} characters (max ${LIMITS.heading}) -- write a shorter one, never cut it off`); text.heading = text.heading.slice(0, LIMITS.heading); }
    if (text.body.length > LIMITS.body) { errors.push(`${where}: body is ${text.body.length} characters (max ${LIMITS.body})`); text.body = ''; }
    if (text.body && text.kind === 'sourced') { sourcedLines++; if (!text.cite) { uncited++; if (tx.cite) badCites.push(String(tx.cite).slice(0, 30)); fixes.push(`${where}: an uncited "sourced" paragraph was removed`); text.body = ''; } }
    if (text.body && text.kind === 'imagined' && ATTRIBUTED_QUOTE.test(text.body)) { fixes.push(`${where}: an invented quotation was removed`); text.body = ''; }
    // a paragraph that cites a real fact rests on it: it is sourced, whatever the model labelled it
    if (text.body && text.kind === 'imagined' && text.cite) { text.kind = 'sourced'; fixes.push(`${where}: a paragraph citing ${text.cite} is marked as sourced`); }
    // an "imagined" paragraph that states numbers: they must come from a fact (then it is sourced, and cited) -- or it goes back
    if (text.body && text.kind === 'imagined' && facts.length) {
      const nums = [...numbersIn(text.body)];
      if (nums.length) {
        const ranked = facts.map(f => ({ f, has: numbersIn(f.text) })).map(x => Object.assign(x, { hit: nums.filter(n => x.has.has(n)).length })).filter(x => x.hit).sort((a, b) => b.hit - a.hit);
        const best = ranked[0];
        // a summary may draw on a few facts at once (size, speed, height): every number must still come from one of them
        const top = ranked.slice(0, 3); const covered = nums.every(n => top.some(x => x.has.has(n)));
        if (best && best.hit === nums.length) { text.kind = 'sourced'; text.cite = best.f.id; fixes.push(`${where}: a paragraph restating ${best.f.id} is marked as sourced and cited`); }
        else if (best && covered) { text.kind = 'sourced'; text.cite = best.f.id; fixes.push(`${where}: a paragraph drawing on ${top.map(x => x.f.id).join(', ')} is marked as sourced and cited`); }
        else errors.push(`${where}: the "imagined" paragraph states numbers (${nums.join(', ')}) that no given fact supports -- cite the fact or remove the numbers`);
      }
    }
    if (personal && text.body && text.kind === 'sourced' && !/general|in general|most |many |typically/i.test(`${text.kicker} ${text.heading}`)) warnings.push(`${where}: a sourced paragraph on a personal page -- make sure it reads as general, not about them`);
    if (text.body && text.kind === 'supplied' && c.supplied && suppliedShare(text.body, c.supplied) < 0.5) { text.kind = 'imagined'; fixes.push(`${where}: a paragraph labelled as the owner's words is mostly new wording -- labelled imagined`); }
    (Array.isArray(tx.items) ? tx.items : []).slice(0, LIMITS.items).forEach(it => {
      if (!it || typeof it !== 'object') return;
      const item = { label: cap(it.label, 40), text: clean(it.text), kind: oneOf(it.kind, VOCAB.copyKind, 'imagined'), cite: citeOf(it.cite) };
      if (!item.text) return;
      if (item.kind === 'imagined' && item.cite) item.kind = 'sourced'; // cites a real fact: it rests on it
      if (item.text.length > LIMITS.item) { fixes.push(`${where}: a ${item.text.length}-character line was left out (never cut mid-sentence)`); return; }
      if (item.kind === 'sourced') { sourcedLines++; if (!item.cite) { uncited++; if (it.cite) badCites.push(String(it.cite).slice(0, 30)); fixes.push(`${where}: an uncited "sourced" line was removed`); return; } }
      if (item.kind === 'imagined' && ATTRIBUTED_QUOTE.test(item.text)) { fixes.push(`${where}: an invented quotation was removed`); return; }
      if (item.kind === 'supplied' && c.supplied && suppliedShare(item.text, c.supplied) < 0.5) { item.kind = 'imagined'; fixes.push(`${where}: a line labelled as the owner's words is mostly new wording -- labelled imagined`); }
      text.items.push(item);
    });
    if (tx.items && tx.items.length > LIMITS.items) fixes.push(`${where}: only the first ${LIMITS.items} lines kept`);
    // a numbered list already numbers its lines
    if (text.list === 'numbered') text.items.forEach(it => { if (/^\d+\.?$/.test(it.label)) it.label = ''; });
    if (facts.length || (c.supplied || []).length) { checkNums(where, 'kicker', text.kicker); checkNums(where, 'heading', text.heading); text.items.forEach(it => checkNums(where, 'label', it.label)); }
    if (si === 0 && !text.heading) errors.push('hero: the first scene needs a heading (the page title)');
    // where an archetype put the words (kept as composed on a saved page)
    if (artScene) {
      const pl = tx.place && typeof tx.place === 'object' && Array.isArray(tx.place.gc) ? tx.place : null;
      if (pl) { const g0 = Math.round(num(pl.gc[0], 1, 12, 1)); const g1 = Math.round(num(pl.gc[1], g0, 12, 12)); text.place = { gc: [g0, g1], v: oneOf(pl.v, VOCAB.textV, 'middle'), align: oneOf(pl.align, VOCAB.textAlign, 'left') }; }
      text.mplace = oneOf(tx.mplace, VOCAB.mplace, 'above');
      if (tx.giant) text.giant = true; if (tx.columns) text.columns = true;
      if (['bottom', 'band', 'left', 'right', 'top', 'center'].includes(tx.shade)) text.shade = tx.shade;
      // (how the words serve a composition: their role, their typographic act, a caption revealed late)
      if (COMP.TEXT_ROLES.includes(tx.role)) text.role = tx.role; if (COMP.TYPE_ACTS.includes(tx.act) && tx.act !== 'none') text.act = tx.act; if (tx.copy === 'caption') text.copy = 'caption';
      if (ART.TREATMENTS.includes(tx.treatment) && tx.treatment !== 'standard') text.treatment = tx.treatment;
      // (the line a text-swap shows first, before the heading settles in its place -- plain words, never facts or numbers)
      const alt = cap(tx.alt, 60); if (alt && !/\d/.test(alt)) text.alt = alt;
    }
    // layers
    let layers = (Array.isArray(rs.layers) ? rs.layers : []).slice(0, LIMITS.layersPerScene).map((rl, li) => {
      if (!rl || typeof rl !== 'object') return null;
      const kind = oneOf(rl.kind, VOCAB.layerKind, rl.asset ? 'image' : 'shape');
      const role = oneOf(rl.role, VOCAB.role, li === 0 ? 'focal' : 'support');
      const e = rl.entrance || {}, l = rl.loop || {}, s = rl.scroll || {};
      const L = {
        id: id(rl.id, `l${li + 1}`), kind, role,
        // (an archetype may deliberately run a layer off the scene -- an off-canvas subject, a poster's giant word)
        box: { d: box(rl.box && rl.box.d, [50, 10, 40, 80], role === 'backdrop' || role === 'texture' || !!rl.group || artScene), m: box(rl.box && rl.box.m, [10, 10, 80, 80], role === 'backdrop' || role === 'texture' || !!rl.group || artScene) },
        z: Math.round(num(rl.z, 1, 9, role === 'focal' ? 5 : role === 'backdrop' ? 1 : 3)), rotate: num(rl.rotate, -45, 45, 0), opacity: num(rl.opacity, 0.05, 1, 1),
        mask: oneOf(rl.mask, VOCAB.mask, 'none'), treatment: oneOf(rl.treatment, VOCAB.treatment, 'none'),
        entrance: { kind: oneOf(e.kind, VOCAB.entrance, 'fade'), delay: num(e.delay, 0, 4, 0.2), dur: num(e.dur, 0.2, 3, 1.1) },
        loop: { kind: oneOf(l.kind, VOCAB.loop, 'none'), amp: num(l.amp, 0, 3, 1), period: num(l.period, 3, 30, 9) },
        scroll: Object.assign({ kind: oneOf(s.kind, VOCAB.scroll, 'none'), amount: num(s.amount, -1, 1, 0.4) }, s.anchor === 'left' || s.anchor === 'right' ? { anchor: s.anchor } : {}),
        hideM: !!rl.hideM,
        ...(rl.edge === 'fade' ? { edge: 'fade' } : {}),
        // layers sharing a group move as one object (one entrance, loop and scroll; relative placement kept)
        ...(/^[a-z0-9][a-z0-9-]{0,23}$/i.test(rl.group || '') ? { group: String(rl.group).toLowerCase() } : {}),
        // the art-directed page: a step of a pinned scene, a carry across a seam, a strip's panel
        ...(typeof rl.step === 'number' && isFinite(rl.step) ? { step: Math.round(num(rl.step, 0, 6, 0)) } : {}),
        ...(rl.exit === 'left' || rl.exit === 'right' ? { exit: rl.exit } : {}), ...(rl.enter === 'left' || rl.enter === 'right' ? { enter: rl.enter } : {}),
        ...(rl.track ? { track: true } : {}),
        ...(typeof rl.seq === 'number' && isFinite(rl.seq) ? { seq: Math.round(num(rl.seq, 0, 9, 0)) } : {}),
        ...(Array.isArray(rl.win) && rl.win.length === 4 && rl.win.every(v => typeof v === 'number' && isFinite(v)) ? { win: box(rl.win, [10, 10, 80, 80], true) } : {}),
      };
      // the outer margin belongs to the thread that runs down the page: layers stay inside it unless they are full-bleed
      // (a member of a group follows its focal, so the group is kept whole rather than clamped piece by piece)
      if (!safety && !artScene && !(L.group && role !== 'focal') && role !== 'backdrop' && role !== 'texture' && L.box.d[2] <= 90) { const b = L.box.d; const x = Math.max(5, Math.min(95 - b[2], b[0])); if (x !== b[0]) L.box.d = [x, b[1], b[2], b[3]]; }
      if (kind === 'image') {
        const a = byId.get(rl.asset);
        if (!a) { (role === 'focal' ? errors : warnings).push(`${where}: picture "${cap(rl.asset, 40)}" does not exist${role === 'focal' ? ' -- use an asset from the inventory or a shape/word focal' : ' -- layer removed'}`); return null; }
        // the owner's logo is a header mark, never a scene picture
        if (a.ownerRole === 'logo' || baseOf(a).ownerRole === 'logo') { fixes.push(`${where}: ${a.id} is the logo -- shown in the header, never as a scene picture`); return null; }
        // (the owner's own pictures are theirs to show: a model's "does not match" never removes an upload)
        if (verdictOf(a) === 'no' && baseOf(a).origin !== 'upload') { fixes.push(`${where}: ${a.id} does not show the subject (the director's own look at it) -- layer removed`); return null; }
        const k0 = curOf(a); if (k0 && (k0.role === 'unrelated' || k0.identity === 'other')) { fixes.push(`${where}: ${a.id} does not show the subject (the picture check: ${k0.depicts || 'unrelated'}) -- layer removed`); return null; }
        if (personal && baseOf(a).origin !== 'upload') { fixes.push(`${where}: ${a.id} is not the owner's own photo -- removed from a personal page`); return null; }
        L.asset = a.id; L.fit = oneOf(rl.fit, VOCAB.fit, (a.caps && a.caps.moveFreely) ? 'contain' : 'cover'); L.focus = /^\d{1,3}% \d{1,3}%$/.test(rl.focus || '') ? rl.focus : '50% 50%';
        // the framing intention (framing.js), and the phone's own fit and crop position where they differ
        if (VOCAB.frame.includes(rl.frame)) L.frame = rl.frame;
        if (VOCAB.fit.includes(rl.mfit)) L.mfit = rl.mfit;
        if (/^\d{1,3}% \d{1,3}%$/.test(rl.mfocus || '')) L.mfocus = rl.mfocus;
        // a flat photo never floats as a bare rectangle: framed, masked, or used as a full backdrop (an archetype frames
        // its own pictures, and a deliberate full bleed or texture is not a rectangle floating on the page)
        const free = !!(a.caps && a.caps.moveFreely);
        if (!free && !artScene && L.frame !== 'bleed' && L.frame !== 'texture' && L.mask === 'none' && L.edge !== 'fade' && role !== 'backdrop' && role !== 'texture') { L.mask = 'window'; fixes.push(`${where}: ${a.id} is a flat photo -- framed instead of floating as a bare rectangle`); }
        // (a shaped mask needs the picture to fill it; a picture framed whole keeps its contain -- framing.js shaped its frame)
        if (!free && L.fit === 'contain' && L.mask !== 'none' && !L.frame) L.fit = 'cover';
        // (a supporting picture in a gallery-type scene -- a strip, an index, a lineup -- shows the set, it is not a repeat
        // of the picture as filler: only a scene's lead picture counts toward how often a picture may appear)
        const k = baseOf(a).id; const inSet = (POOL.TAKES[layout] || 0) >= 3 && role !== 'focal';
        if (!inSet) uses.set(k, (uses.get(k) || 0) + 1);
        const max = a.cutout || (a.assess && a.assess.transparent) ? useMax.cut : useMax.photo;
        if (!inSet && uses.get(k) > max) { fixes.push(`${where}: ${a.id} already appears ${max} times -- not repeated again as filler`); return null; }
      } else if (kind === 'shape') {
        const sh = rl.shape || {};
        L.shape = { form: oneOf(sh.form, VOCAB.shape, 'circle'), fill: oneOf(sh.fill, VOCAB.fill, 'accent'), stroke: !!sh.stroke };
      } else {
        const w = cap(rl.word && rl.word.text, 24);
        if (!w) { warnings.push(`${where}: an empty word layer was removed`); return null; }
        L.word = { text: w, style: oneOf(rl.word && rl.word.style, VOCAB.wordStyle, 'outline') };
      }
      return L;
    }).filter(Boolean);
    if (rs.layers && rs.layers.length > LIMITS.layersPerScene) fixes.push(`${where}: only ${LIMITS.layersPerScene} layers kept`);
    // the visual plan's picture for this scene (art.js / pool.js): a scene planned around a picture shows it -- a direction
    // that left it out gets it back (never inside an actor's run: the actor is that scene's picture)
    const recVis = !safety && art && rec && rec.visual && !inRun(si) ? rec.visual : null;
    if (recVis && !layers.some(L => L.kind === 'image')) {
      const a = byId.get(recVis.asset); const k = a && baseOf(a).id; const free = !!(a && a.caps && a.caps.moveFreely);
      if (a && a.ownerRole !== 'logo' && (uses.get(k) || 0) < (a.cutout || (a.assess && a.assess.transparent) ? useMax.cut : useMax.photo)) {
        uses.set(k, (uses.get(k) || 0) + 1);
        layers.forEach(L => { if (L.role === 'focal') L.role = 'support'; });
        layers.unshift({ id: 'vis', kind: 'image', role: 'focal', asset: a.id, box: { d: [52, 10, 42, 78], m: [8, 6, 84, 64] }, z: 5, rotate: 0, opacity: 1, mask: free || artScene ? 'none' : 'window', treatment: free ? 'shadow' : 'none', entrance: { kind: 'rise', delay: 0.2, dur: 1.1 }, loop: { kind: 'none', amp: 1, period: 9 }, scroll: { kind: 'none', amount: 0.4 }, hideM: false, fit: free ? 'contain' : 'cover', focus: '50% 50%' });
        if (WORDS_ONLY.includes(layout)) layout = WORDS_ONLY.includes(rec.layout) || POOL.NONE.includes(rec.layout) ? 'split' : rec.layout;
        fixes.push(`${where}: the picture planned for this scene (${a.id}) was missing -- the scene is built around it`);
      }
    }
    // a stage with things on it has a main one (so it stays large and clear of the words): the largest picture, else the largest layer
    if (!safety && si > 0 && !layers.some(L => L.role === 'focal')) {
      const main = layers.filter(L => L.kind === 'image' && L.role !== 'backdrop' && L.role !== 'texture').sort((a, b) => area(b.box.d) - area(a.box.d))[0];
      if (main) { main.role = 'focal'; fixes.push(`${where}: ${main.id} is the scene's main visual`); }
    }
    // connected parts share one transform: groups the plan gives, and (on acceptance) a small layer lying mostly on
    // the focal -- a hilt on a blade, a halo on a head -- joins the focal's group instead of drifting apart
    const focalL = layers.find(L => L.role === 'focal');
    if (!safety && focalL && focalL.box.d[2] < 90) layers.forEach(L => {
      if (L === focalL || L.group || L.role === 'backdrop' || L.role === 'texture' || L.kind === 'word') return;
      if (overlap(L.box.d, focalL.box.d) >= area(L.box.d) * 0.5 && area(L.box.d) <= area(focalL.box.d) * 0.6) { focalL.group = focalL.group || `g-${focalL.id}`.slice(0, 24).toLowerCase(); L.group = focalL.group; fixes.push(`${where}: ${L.id} is part of ${focalL.id} -- they move as one`); }
    });
    // a group of one is no group
    const groupSize = new Map(); layers.forEach(L => { if (L.group) groupSize.set(L.group, (groupSize.get(L.group) || 0) + 1); });
    layers.forEach(L => { if (L.group && groupSize.get(L.group) < 2) delete L.group; });
    // motion budget: a focal point, supporting movement and rest -- not everything moving at once
    let loops = 0, scrolls = 0;
    layers.sort((a, b) => (a.role === 'focal' ? -1 : 0) - (b.role === 'focal' ? -1 : 0));
    layers.forEach(L => {
      if (L.loop.kind !== 'none') { if (loops >= LIMITS.loopsPerScene) { L.loop.kind = 'none'; fixes.push(`${where}: ${L.id} held still (at most ${LIMITS.loopsPerScene} moving layers per scene)`); } else loops++; }
      if (L.scroll.kind !== 'none') { if (scrolls >= (art && art.mode ? 3 : LIMITS.scrollPerScene)) L.scroll.kind = 'none'; else scrolls++; }
    });
    // a still page keeps nothing moving but light passing across (sheen)
    if (motion.tempo === 'still') layers.forEach(L => { if (L.loop.kind !== 'sheen') L.loop.kind = 'none'; });
    // when the tempo calls for movement, the opening subject is never frozen: a subject the director left without
    // an ambient loop gets the gentle one that suits what it is (a framed picture drifts inside its frame)
    if (!safety && !artScene && si === 0 && motion.tempo !== 'still') {
      const f0 = layers.find(L => L.role === 'focal');
      if (f0 && f0.loop.kind === 'none' && f0.kind !== 'word' && f0.box.d[2] < 95) {
        const a0 = f0.kind === 'image' ? byId.get(f0.asset) : null; const free = !!(a0 && a0.caps && a0.caps.moveFreely);
        f0.loop = f0.kind === 'image' ? (free ? { kind: 'float', amp: 1, period: 9 } : { kind: 'kenburns', amp: 1, period: 12 }) : { kind: 'breathe', amp: 1, period: 8 };
        fixes.push(`${where}: the opening subject was frozen at a ${motion.tempo} tempo -- given a gentle ${f0.loop.kind}`);
      }
    }
    if (layersTotal + layers.length > LIMITS.layersTotal) { layers = layers.slice(0, Math.max(0, LIMITS.layersTotal - layersTotal)); fixes.push(`${where}: layer budget reached`); }
    layersTotal += layers.length;
    // (an archetype's choreography is its scroll movement; its layers need no scroll kind of their own to hold it)
    if (pin && !(artScene && ARCH.PINNED.includes(rs.choreo)) && !layers.some(L => L.scroll.kind !== 'none')) { pin = false; pinned--; fixes.push(`${where}: pinned without anything moving on scroll -- unpinned`); }
    const bg = rs.background || {};
    // an "auto" scene is only as tall as its words; pictures and shapes need a stage of their own beside them
    let sceneHeight = height;
    if (!safety && !artScene && height === 'auto' && layers.some(L => L.role !== 'backdrop' && L.role !== 'texture')) { sceneHeight = 'short'; fixes.push(`${where}: layers need room -- the scene gets a short stage instead of text height`); }
    const scene = {
      id: sid, name: cap(rs.name, 60), purpose: cap(rs.purpose, 240), link: cap(rs.link, 240), navLabel: cap(rs.navLabel, 24),
      height: sceneHeight, pin, camera: oneOf(rs.camera, VOCAB.camera, 'none'), background: oneOf(bg.style || rs.background, VOCAB.sceneBg, si === 0 ? 'base' : 'base'), atmosphere: !!rs.atmosphere || si === 0,
      mobile: { order: oneOf(rs.mobile && rs.mobile.order, VOCAB.mobileOrder, si === 0 ? 'text-first' : 'text-first') },
      text, layers,
      ...(HEX.test(rs.tone || '') ? { tone: String(rs.tone).toLowerCase() } : {}),
    };
    if (artScene || rs.choreo || rs.handoff || (art && rec)) {
      scene.layout = layout;
      // the motion-first composition (composition.js): one the model named from the vocabulary, else the recipe's for this
      // scene when the model kept its layout; never inside an actor's run, never on a quiet page, one on an editorial page
      const asked = oneOf(rs.composition, COMP.COMPOSITIONS, '');
      const fromRec = !asked && rec && COMP.COMPOSITIONS.includes(rec.composition) && (!rs.layout || rs.layout === rec.layout || (COMP.BASES[rec.composition] || []).includes(rs.layout)) ? rec.composition : '';
      // (a saved page keeps the composition it was made with -- it was validated then)
      const comp = (asked || fromRec) && !inRun(si) && (safety && !composing ? !!asked : art && art.mode && art.mode !== 'quiet' && !(art.mode === 'editorial' && compsSoFar >= 1)) ? (asked || fromRec) : '';
      if (comp) { scene.composition = comp; compsSoFar++; const arc = oneOf(rs.arc, COMP.ARC, rec && COMP.ARC.includes(rec.arc) ? rec.arc : ''); if (arc) scene.arc = arc; }
      else if (asked || rs.composition) fixes.push(`${where}: the ${cap(rs.composition, 30)} composition is not available here -- composed as ${layout}`);
      scene.choreo = oneOf(rs.choreo, VOCAB.choreo, rec ? oneOf(rec.choreo, VOCAB.choreo, 'settle') : 'settle');
      scene.handoff = si === 0 ? 'cut' : oneOf(rs.handoff, VOCAB.handoff, rec ? oneOf(rec.handoff, VOCAB.handoff, 'cut') : 'cut');
      // (inside the actor's run the actor is the continuity: scenes meet with a cut or a colour bleed, never sliding over it)
      if (inRun(si) && si > actor.from && !['cut', 'bleed'].includes(scene.handoff)) scene.handoff = 'cut';
      if (ART.SCENE_TYPES.includes(rs.sceneType)) scene.sceneType = rs.sceneType;
      if (ART.EXITS.includes(rs.exit) && rs.exit !== 'none') scene.exit = rs.exit;
      if (pin && typeof rs.steps === 'number') scene.steps = Math.round(num(rs.steps, 1, 6, 1));
    }
    if (si === 0) scene.cta = cap(rs.cta, 40) || 'Begin';
    if (!scene.purpose) warnings.push(`${where}: no stated purpose`);
    // (a picture swap re-fits only the scenes that show the new picture: ctx.recompose lists their ids)
    if (composing && artScene) {
      // an archetype composes the scene: pictures with a plain background float as their cut-outs first, so the
      // composition is made for the picture that will actually be shown
      if (scene.composition) { BYID.set(scene, byId); stageComposition(scene, carryOf(scene, si), fixes, where); }
      swapCutouts(scene, byId, assets, fixes);
      ARCH.composeScene(scene, { byId, si, hero: si === 0, art, actorPose: inRun(si) ? actor.poses[si - actor.from] : null, rng: ART.rng(`${(p.direction && p.direction.seed) || ''}|${sid}`), name: identity.name, fixes, warnings, video: !!(si === 0 && c.premiumHero), ...placeFor(scene, (si + flip) % 2 ? 'left' : 'right') });
      const pinCap = art && art.mode ? Math.min(LIMITS.pinned, modeLim.pins) : LIMITS.pinned;
      // (a composition held while it plays counts against the mode's composition holds, not the layout pins)
      if (scene.pin && scene.choreo === 'compose') { if (holds >= holdCap) { scene.pin = false; scene.height = 'screen'; fixes.push(`${where}: the page already holds ${holdCap} composition(s) -- this one plays as it passes`); } else holds++; }
      else if (scene.pin) { if (pinned >= pinCap) { scene.pin = false; scene.choreo = 'settle'; scene.height = scene.height === 'tall' ? 'screen' : scene.height; ARCH.unstep(scene); fixes.push(`${where}: ${pinCap ? `more than ${pinCap} held scene${pinCap > 1 ? 's' : ''} on ${art && art.mode ? `a${art.mode === 'editorial' || art.mode === 'expressive' || art.mode === 'immersive' ? 'n' : ''} ${art.mode}` : 'the'} page` : `a ${art.mode} page holds nothing`} -- this one plays as it passes`); } else pinned++; }
    } else if (composing) { compose(scene, byId, fixes, warnings, si === 0); if (!safety) frameFree(scene, byId, fixes); legible(scene, byId, fixes); }
    else if (rs.text && rs.text.scrim) scene.text.scrim = true; // a saved scrim stays
    // every enlargement stays inside its ceiling (framing.js ZOOM): a picture is never blown up to fill a container --
    // only a deliberate "detail" framing goes further (a saved page keeps its numbers; the renderer caps them as it draws)
    if (!safety) boundZoom(scene, byId, fixes);
    // what the scene's words answer: its picture. The note is the director's (it described the picture it built the scene
    // on), kept only when the scene really shows that picture; the colour is always the picture's measured identity
    const rv = rs.visual && typeof rs.visual === 'object' ? rs.visual : null;
    const baseId = x => (byId.get(x) ? baseOf(byId.get(x)).id : x);
    const same = x => !!(rv && typeof rv.asset === 'string' && baseId(x) === baseId(rv.asset));
    // the words were written for a picture the composition then dropped (an archetype that only stands cut-outs on its
    // stage drops a flat photo): the scene is recomposed around the picture its words describe -- words and picture match
    const described = !safety && composing && artScene && !inRun(si) && rv && rv.subject && byId.get(rv.asset) ? byId.get(rv.asset) : null;
    if (described && described.ownerRole !== 'logo' && baseOf(described).ownerRole !== 'logo' && !scene.layers.some(L => L.kind === 'image' && same(L.asset))) {
      const free = !!(described.caps && described.caps.moveFreely);
      scene.layers.forEach(L => { if (L.role === 'focal') L.role = 'support'; });
      scene.layers.unshift({ id: 'said', kind: 'image', role: 'focal', asset: described.id, box: { d: [52, 10, 42, 78], m: [8, 6, 84, 64] }, z: 5, rotate: 0, opacity: 1, mask: 'none', treatment: free ? 'shadow' : 'none', entrance: { kind: 'rise', delay: 0.2, dur: 1.1 }, loop: { kind: 'none', amp: 1, period: 9 }, scroll: { kind: 'none', amount: 0.4 }, hideM: false, fit: free ? 'contain' : 'cover', focus: '50% 50%' });
      const was = scene.layout; scene.layout = free ? 'shrine' : 'split'; scene.choreo = 'settle';
      ARCH.composeScene(scene, { byId, si, hero: si === 0, art, rng: ART.rng(`${(p.direction && p.direction.seed) || ''}|${sid}|said`), name: identity.name, fixes, warnings, ...placeFor(scene, (si + flip) % 2 ? 'left' : 'right') });
      fixes.push(`${where}: its words describe ${described.id}, which the ${was} composition left out -- recomposed around it`);
    }
    const vimgs = scene.layers.filter(L => L.kind === 'image' && byId.get(L.asset)).map(L => L.asset).concat(inRun(si) ? [actor.asset] : []);
    if (vimgs.length && (!safety || rv)) { // (a saved page keeps its own note -- reopening never adds one)
      const focalA = (scene.layers.find(L => L.role === 'focal' && L.kind === 'image' && byId.get(L.asset)) || {}).asset;
      const va = vimgs.find(same) || (inRun(si) ? actor.asset : focalA) || vimgs[0]; const trusted = same(va);
      const recV = rec && rec.visual && rec.visual.base === baseId(va) ? rec.visual : null;
      scene.visual = { asset: va, subject: cap(trusted ? rv.subject : recV ? recV.subject : '', 100), moment: cap(trusted ? rv.moment : '', 80),
        intent: oneOf(rv && rv.intent, POOL.INTENTS, si === 0 ? 'introduce' : 'celebrate'), relation: oneOf(trusted && rv.relation, POOL.RELATIONS, recV ? recV.relation : si === 0 ? 'opens' : 'shifts'),
        palette: PAL.identity(byId.get(va)).hex || PAL.identity(baseOf(byId.get(va))).hex || '', source: POOL.sourceOf(baseOf(byId.get(va))) };
      if (rv && typeof rv.asset === 'string' && rv.asset && !trusted) fixes.push(`${where}: its words were written for ${cap(rv.asset, 40)}, which the scene does not show -- that picture note was dropped`);
    }
    return scene;
  }).filter(Boolean);
  // (an opening inside the actor's run has the actor as its focal point)
  if (!safety && scenes.length && !inRun(0) && !scenes[0].layers.some(L => L.role === 'focal')) {
    // no focal in the hero: the heaviest layer becomes it, else the page title itself carries the scene
    const heavy = scenes[0].layers.slice().sort((a, b) => area(b.box.d) - area(a.box.d))[0];
    if (heavy) { heavy.role = 'focal'; fixes.push('hero: the largest layer made the focal point'); } else warnings.push('hero: no picture or drawn focal -- the title carries the first scene');
  }
  if (sourcedLines && uncited / sourcedLines > 0.4) {
    const ids = [...factIds]; const shown = [...new Set(badCites)].slice(0, 6).map(x => `"${x}"`).join(', ');
    errors.push(`copy: ${uncited} of ${sourcedLines} "sourced" lines had no valid fact id${shown ? ` (cite was ${shown})` : ' (cite was empty)'} -- each cite must be exactly one of the given ids (${ids.length ? `${ids[0]}…${ids[ids.length - 1]}` : 'none were given'}); a line drawing on two facts cites the main one; otherwise mark the line imagined`);
  }
  if (!scenes.some(s => s.text.heading || s.text.body || s.text.items.length)) errors.push('copy: the page has no words');
  // ---- the owner's chosen main picture leads the opening scene: enforced here, not left to the model. Its clean cutout
  // is used when there is one; the layer keeps its place in the composition and is re-fitted to the new picture.
  const mainA = !safety && c.mainAsset ? byId.get(c.mainAsset) : null;
  if (mainA && scenes[0] && !inRun(0)) {
    const hs = scenes[0]; const pick = assets.find(a => a.cutoutOf === mainA.id && a.caps && a.caps.moveFreely) || mainA;
    let f0 = hs.layers.find(L => L.role === 'focal');
    const leads = f0 && f0.kind === 'image' && (f0.asset === mainA.id || f0.asset === pick.id || (byId.get(f0.asset) || {}).cutoutOf === mainA.id);
    if (!leads) {
      if (!f0) { f0 = { id: 'main', kind: 'image', role: 'focal', box: { d: [52, 10, 42, 78], m: [8, 6, 84, 64] }, z: 5, rotate: 0, opacity: 1, mask: 'none', treatment: 'shadow', entrance: { kind: 'rise', delay: 0.2, dur: 1.1 }, loop: { kind: 'none', amp: 1, period: 9 }, scroll: { kind: 'none', amount: 0.4 }, hideM: false }; hs.layers.unshift(f0); }
      const free = !!(pick.caps && pick.caps.moveFreely);
      Object.assign(f0, { kind: 'image', asset: pick.id, fit: free ? 'contain' : 'cover', focus: /^\d{1,3}% \d{1,3}%$/.test(mainA.focus || '') ? mainA.focus : '50% 50%', mask: free ? 'none' : (f0.mask && f0.mask !== 'none' ? f0.mask : 'window'), opacity: Math.max(0.9, f0.opacity || 1) });
      delete f0.shape; delete f0.word; delete f0.mfit; delete f0.mfocus;
      fixes.push(`hero: the owner's chosen main picture (${mainA.id}) leads the opening scene`);
      if (hs.layout && hs.layout !== 'free') { f0.frame = 'auto'; delete f0.frame; ARCH.composeScene(hs, { byId, si: 0, hero: true, art, rng: ART.rng(`${(p.direction && p.direction.seed) || ''}|${hs.id}`), name: identity.name, fixes, warnings, ...placeFor(hs, flip ? 'left' : 'right') }); }
      else { compose(hs, byId, fixes, warnings, true); frameFree(hs, byId, fixes); legible(hs, byId, fixes); }
      boundZoom(hs, byId, fixes);
    }
  }
  // ---- the art-directed page as a whole: a carry needs a picture on both sides of its seam; the background follows the
  // page's progression where a scene has no colour of its own; at most three scenes hold the scroll
  if (!safety && art) {
    // (the actor's run is one wrapper on the page: its scenes meet with a cut or a colour bleed, and nothing stacks onto
    // its last scene -- a held pair never straddles the run)
    if (actor) scenes.forEach((s, i) => { if (i && inRun(i) && !['cut', 'bleed'].includes(s.handoff)) s.handoff = 'cut'; if (i === actor.to + 1 && s.handoff === 'stack') s.handoff = 'overlap'; });
    scenes.forEach((s, i) => { if (i && s.handoff === 'carry') { scenes[i - 1].layers.forEach(L => { delete L.exit; }); s.layers.forEach(L => { delete L.enter; }); if (!ARCH.linkCarry(scenes[i - 1], s)) { s.handoff = 'overlap'; fixes.push(`scene ${s.id}: nothing to carry across the seam -- it slides over the previous scene instead`); } } });
    // (a stack holds the previous scene while this one covers it: the previous scene must fit the screen, and must not be
    // stacking onto its own predecessor -- one hold at a time)
    scenes.forEach((s, i) => { if (i && s.handoff === 'stack' && (scenes[i - 1].pin || scenes[i - 1].height === 'auto' || scenes[i - 1].height === 'tall' || scenes[i - 1].handoff === 'stack')) s.handoff = 'overlap'; });
  }
  // ---- the subject's imagery: a logo is a reference, never the hero's main picture when a real picture of the
  // subject exists; and a page that should show its subject but cannot is marked degraded, never passed off
  const heroFocal = inRun(0) ? { kind: 'image', role: 'focal', asset: actor.asset } : scenes[0] && scenes[0].layers.find(L => L.role === 'focal');
  // (the owner's uploads count as pictures of the subject -- they are the owner's choice -- unless the director saw
  // that one does not show it)
  const subjectPics = assets.filter(a => { if (baseOf(a).origin === 'upload') return verdictOf(a) !== 'no'; const k = curOf(a); return k && k.role === 'subject' && (k.identity === 'exact' || k.identity === 'form'); });
  const heroCur = heroFocal && heroFocal.kind === 'image' ? curOf(byId.get(heroFocal.asset)) : null;
  const visuals = c.visuals || null; const coverage = c.coverage || null;
  // whether the page must show its subject follows what the understanding said it must show; the kind decides only
  // when nothing was said (a meme or a concept "invented" in the brief can still have a picture it cannot do without)
  const needsImagery = visuals && visuals.main ? !/^\s*none\b/i.test(visuals.main) : identity.kind !== 'invented';
  if (!safety && needsImagery && subjectPics.length && !c.abstractChosen && !mainA) {
    const use = subjectPics.slice(0, 3).map(a => a.id).join(', ');
    if (heroCur && (heroCur.role === 'logo' || heroCur.role === 'reference')) errors.push(`hero: its main picture ${heroFocal.asset} is a ${heroCur.role} -- use a picture of the subject (${use}); logos and references are supporting material`);
    else if (heroCur && (heroCur.role === 'supporting' || heroCur.role === 'environment')) errors.push(`hero: its main picture ${heroFocal.asset} shows ${heroCur.role === 'supporting' ? 'a supporting object' : 'a setting'}, not the subject -- ${use} show${subjectPics.length > 1 ? '' : 's'} the subject; lead with it`);
    else if (heroFocal && heroFocal.kind !== 'image') errors.push(`hero: no picture of the subject although ${use} show${subjectPics.length > 1 ? '' : 's'} it -- make one of them the hero's main visual`);
  }
  let imagery;
  if (!safety && c.abstractChosen) imagery = { status: 'abstract', degraded: false, missing: ((coverage && coverage.missing) || []).slice(0, 3).map(x => cap(x, 160)), note: 'an abstract interpretation, chosen by the owner when no usable picture of the subject was found' };
  else if (safety && p.imagery && typeof p.imagery === 'object') imagery = { status: oneOf(p.imagery.status, ['strong', 'form', 'weak', 'missing', 'not-needed', 'abstract'], 'weak'), degraded: !!p.imagery.degraded, missing: (Array.isArray(p.imagery.missing) ? p.imagery.missing : []).slice(0, 3).map(x => cap(x, 160)).filter(Boolean), note: cap(p.imagery.note, 240) };
  else {
    const heroIsPicture = heroFocal && heroFocal.kind === 'image';
    const status = !needsImagery ? 'not-needed' : !heroIsPicture ? 'missing' : !heroCur ? 'strong' : heroCur.role === 'subject' || heroCur.role === 'detail' ? (heroCur.identity === 'form' ? 'form' : 'strong') : 'weak';
    const missing = ((coverage && coverage.missing) || []).slice(0, 3).map(x => cap(x, 160));
    imagery = { status, degraded: status === 'missing' || status === 'weak', missing, note: status === 'missing' ? `no picture of ${identity.name || 'the subject'} to show${missing[0] ? ` (missing: ${missing[0]})` : ''}` : status === 'weak' ? `the main picture does not show ${identity.name || 'the subject'} itself` : status === 'form' ? `shown through a real-world form (${(heroCur && heroCur.depicts) || 'a costume, figure or replica'}), not the subject itself` : '' };
  }
  // ---- the page as a whole (composition.js audit): a page meant to move is not six variants of image + copy. Too many
  // editorial splits or framed cards, no takeover, no full-screen visual, no centred subject, no typography moment, no
  // transformation, flat depth, no camera: each finding is moved onto the scene that can carry the composition it asks
  // for (the scene's own pictures permitting), and that scene is composed again -- bounded, from the vocabulary
  if (!safety && art && (art.mode === 'expressive' || art.mode === 'immersive')) {
    const subject = scenes.some(sc => sc.layers.some(L => L.kind === 'image' && byId.get(L.asset) && (FR.profile(byId.get(L.asset)).free || assets.some(x => x.cutoutOf === baseOf(byId.get(L.asset)).id))));
    const can = (at, k) => { const sc = scenes[at]; if (!sc || inRun(at) || !sc.layout || sc.layout === 'free' || !sc.layers.some(L => L.kind === 'image')) return false; return COMP.fit(k, carryOf(sc, at)) && (!COMP.SPEC[k].hold || sc.pin || holds < holdCap); };
    // (in rounds: a change is kept only when the page has fewer findings after it -- a fix never trades one for another)
    for (let round = 0; round < 3; round++) { const issues = COMP.audit({ scenes, art }, { subject }); if (!issues.length) break; let kept = 0;
    COMP.fixesFor(issues, { scenes }, can).forEach(f => {
      const sc = scenes[f.at]; const was = sc.composition || sc.layout; const wasHeld = sc.pin && sc.choreo === 'compose';
      // (a repair never costs a scene one of its pictures: one the new composition cannot show keeps the scene as it was)
      const snap = JSON.stringify(sc); const pics = () => new Set(sc.layers.filter(L => L.kind === 'image' && byId.get(L.asset)).map(L => baseOf(byId.get(L.asset)).id)); const had = pics();
      sc.composition = f.composition; sc.arc = sc.arc || (f.at === 0 ? 'hook' : f.at === scenes.length - 1 ? 'payoff' : COMP.SPEC[f.composition].arcs[0]);
      BYID.set(sc, byId); stageComposition(sc, carryOf(sc, f.at), fixes, `scene ${f.at + 1} (${sc.id})`); swapCutouts(sc, byId, assets, fixes);
      ARCH.composeScene(sc, { byId, si: f.at, hero: f.at === 0, art, rng: ART.rng(`${(p.direction && p.direction.seed) || ''}|${sc.id}|whole`), name: identity.name, fixes, warnings, video: !!(f.at === 0 && c.premiumHero), ...placeFor(sc, (f.at + flip) % 2 ? 'left' : 'right') });
      const undo = () => { Object.keys(sc).forEach(k => delete sc[k]); Object.assign(sc, JSON.parse(snap)); };
      if ([...had].some(id => !pics().has(id))) { undo(); return; }
      if (COMP.audit({ scenes, art }, { subject }).length >= issues.length) { undo(); return; }
      kept++;
      if (wasHeld && !(sc.pin && sc.choreo === 'compose')) holds--;
      if (sc.pin && sc.choreo === 'compose' && !wasHeld) { if (holds >= holdCap) { sc.pin = false; sc.height = 'screen'; } else holds++; }
      fixes.push(`page: ${f.code} -- scene ${f.at + 1} becomes ${sc.composition || sc.layout} (was ${was})`);
    });
    if (!kept) break; }
  }
  // ---- the page blends into its pictures (a new or recomposed plan; a saved page keeps what it had)
  if (!safety) blendPictures(scenes, palette, byId, assets, fixes, warnings);
  // (a campaign or a split screen IS its accent field: the colour takeover wins over a tone taken from its picture)
  // (and a type takeover of one object: one bold colour and the object -- composition.js)
  if (!safety) scenes.forEach(s => { if (s.layout === 'campaign' || s.layout === 'splitscreen' || (s.composition === 'type-takeover' && !s.layers.some(L => L.kind === 'image' && byId.get(L.asset) && !FR.profile(byId.get(L.asset)).free))) { s.background = 'accent'; delete s.tone; } });
  // (an archetype places its own decoration deliberately; the one-shape rule is for free compositions)
  if (!safety) scenes.forEach(s => { if (!s.layout || s.layout === 'free') calmShapes(s, fixes); });
  // the background's progression down the page, for scenes that have no colour of their own (a picture's tone wins)
  if (!safety && art && art.mode) {
    // at most so many scenes driven by the scroll for the page's mode (an actor's run counts once)
    let driven = 0; const PINNED = ARCH.PINNED;
    scenes.forEach(s => {
      if (!s.choreo || s.choreo === 'settle' || s.choreo === 'actor') return;
      if (driven < modeLim.driven) { driven++; return; }
      fixes.push(`scene ${s.id}: the page already has ${modeLim.driven} scenes driven by the scroll -- this one settles`);
      if (PINNED.includes(s.choreo) || s.pin) { s.pin = false; s.height = 'screen'; ARCH.unstep(s); }
      s.choreo = s.layout === 'takeover' ? 'word-fill' : 'settle'; if (s.exit) delete s.exit;
    });
    // at most two expensive effects at once in a scene (a clip-driven reveal, a blurred panel, a colour blend, a blur)
    scenes.forEach(s => {
      let cost = (['mask-reveal', 'expand', 'cardstream', 'chapters'].includes(s.choreo) ? 1 : 0) + (s.text.scrim ? 1 : 0);
      s.layers.forEach(L => {
        const c1 = (L.kind === 'image' && (L.treatment === 'duotone' || L.treatment === 'soft')) || (L.kind === 'shape' && L.shape.form === 'blob') ? 1 : 0;
        if (!c1) return;
        if (cost >= 2) { if (L.kind === 'image') { L.treatment = L.treatment === 'duotone' ? 'mono' : 'none'; } else L.opacity = Math.min(L.opacity, 0.15); fixes.push(`scene ${s.id}: ${L.id} simplified (at most two expensive effects in a scene)`); } else cost += 1;
      });
    });
  }
  if (!safety && art && art.progression !== 'steady') {
    const n = scenes.length; const dark = lum(palette.bg) < 0.3;
    scenes.forEach((s, i) => {
      if (!i || s.tone || s.background !== 'base') return;
      if (art.progression === 'invert') { if (i % 2 === 1) s.background = 'invert'; return; }
      // a colour takeover: alternate scenes flood in the accent colour (the words re-coloured against it)
      if (art.progression === 'accent-takeover') { if (i % 2 === 1) s.background = 'accent'; return; }
      const t0 = i / Math.max(1, n - 1); const light = lum(palette.bg) > 0.3;
      const ends = { 'dark-to-light': [light ? mix(palette.bg, '#000000', 0.82) : palette.bg, light ? palette.bg : mix(palette.bg, '#ffffff', 0.86)], 'warm-to-cool': [mix(palette.bg, '#ff8a3d', 0.2), mix(palette.bg, '#3d7bff', 0.2)], 'muted-to-saturated': [mix(palette.bg, '#808080', 0.3), mix(palette.bg, palette.accent, 0.38)], gradient: [palette.bg, mix(palette.bg2, palette.accent, 0.25)] }[art.progression];
      if (ends) { s.tone = mix(ends[0], ends[1], t0); return; }
      const t = i / Math.max(1, n - 1);
      const target = art.progression === 'deepen' ? mix(palette.bg2, dark ? '#000000' : '#ffffff', dark ? 0.45 : 0.25) : [palette.bg2, mix(palette.bg, palette.accent, 0.2), mix(palette.bg2, palette.glow, 0.25)][i % 3];
      s.tone = mix(palette.bg, target, art.progression === 'deepen' ? t : 0.75);
    });
  }
  // ---- the page as ONE timeline (timeline.js): actors living across scenes, beats inside them, the transitions between
  // them, the rhythm and its memorable moments. A page composed with a mode gets one; a saved page keeps exactly its own.
  let timeline = null;
  const resCap = id => { const a = byId.get(id); return a && a.assess && a.assess.height ? Math.max(0.5, Math.min(1.4, a.assess.height * 1.15 / 670)) : 1.2; };
  const tctx = { scenes, mode: art && art.mode, actor, byId, resCap, art, models: c.models };
  if (safety) { if (p.timeline && typeof p.timeline === 'object' && art) timeline = TL.normalise(p.timeline, tctx).timeline; }
  else if (art && art.mode) {
    const raw = p.timeline && typeof p.timeline === 'object' ? p.timeline
      : TL.compose({ scenes, flow: useRecipe && c.art && c.art.flow, actor, byId, name: identity.name, mode: art.mode, personality: art.personality, art, rng: ART.rng(`${(p.direction && p.direction.seed) || ''}|timeline`) });
    // (what the motion needs from the pictures, and whether it had it: a cut-out for an actor, a wide picture to fill the
    // screen, a foreground and a background, room for a close crop)
    if (!raw.needs) { const imgs = scenes.flatMap(sc => sc.layers.filter(L => L.kind === 'image')); const cut = assets.find(a => a.cutout || (a.assess && a.assess.transparent)); const bleedL = imgs.find(L => L.frame === 'bleed');
      raw.needs = TL.assetNeeds(useRecipe && c.art && c.art.flow ? c.art.flow : { cast: actor ? { primary: {} } : {}, seams: raw.transitions || [] }, { scenes }).map(n => Object.assign(n, { met: n.need === 'cutout' ? ((actor && actor.asset) || (cut && cut.id) || '') : n.need === 'bleed' ? ((bleedL && bleedL.asset) || '') : n.need === 'layers' ? (cut && bleedL ? cut.id + '+' + bleedL.asset : '') : (scenes.some(sc => sc.layout === 'edge-crop') ? 'edge-crop' : '') })); }
    // the arc: after the opening the page gathers pace before its first event (acceleration -- always after a premium
    // hero, which sets the pace), and a page meant to move ends on a payoff rather than trailing off
    const hasPremium = !!(c.premiumHero && byId.has(c.premiumHero.source));
    if (Array.isArray(raw.rhythm) && raw.rhythm.length === scenes.length && !['quiet', 'editorial'].includes(art.mode)) {
      const R = raw.rhythm; const n = R.length;
      if (n >= 4 && R[1] === 'rest' && (hasPremium || ['event', 'escalation'].includes(R[2]))) R[1] = 'acceleration';
      if (n >= 4 && R[n - 1] === 'rest') R[n - 1] = 'payoff';
    }
    // (each seam follows how its two pictures relate -- continuity.js chooseSeams -- within the mode's budget)
    const cs = CT.chooseSeams(raw, { scenes, byId, mode: art.mode, premiumHero: hasPremium, name: identity.name });
    if (cs.changed) fixes.push(`timeline: ${cs.changed} seam(s) chosen from how their pictures relate (${cs.seams.map(s => `${s.at}:${s.relationship}->${s.family}`).join(', ')})`);
    // (a type takeover whose giant word is the subject's name IS the name's moment: no second name travels across it)
    const named = scenes.map((sc, i) => (['type-takeover', 'mask-stage'].includes(sc.composition) && sc.layers.some(L => L.kind === 'word') ? i : -1)).filter(i => i >= 0);
    const ty0 = named.length && Array.isArray(raw.actors) ? raw.actors.find(a => a && a.role === 'typography') : null;
    if (ty0 && named.some(i => i >= (ty0.from || 0) - 1 && i <= (ty0.to || 0) + 1)) { raw.actors = raw.actors.filter(a => a !== ty0); fixes.push('timeline: the name is the type takeover\'s own word -- it does not also travel as an actor'); }
    const nt = TL.normalise(raw, tctx); timeline = nt.timeline; nt.fixes.slice(0, 12).forEach(x => fixes.push(x));
    // what the timeline does to the scenes themselves: a flood or a takeover leaves the scene in its new colour (the words
    // are coloured for it); a signature transition owns its seam (no overlap or stack fighting it)
    timeline.beats.filter(b => b.op === 'background' || b.op === 'takeover').forEach(b => { const sc = scenes[b.scene]; sc.background = b.v; delete sc.tone; });
    // (one name per scene: where the typography actor crosses, an archetype's echo of the name steps aside)
    const ty = timeline.actors.find(a => a.role === 'typography');
    if (ty) scenes.forEach((sc, i) => { if (i >= ty.from && i <= ty.to) sc.layers = sc.layers.filter(L => !(L.kind === 'word' && L.role === 'echo')); });
    timeline.transitions.forEach(t => { const sc = scenes[t.at]; if (TL.SIGNATURE.includes(t.family) || t.family === 'actor-carry') sc.handoff = 'cut'; });
    // the renderer (spatial.js): DOM unless the concept genuinely gains from real depth -- an object that turns, a camera
    // flying through chapters, a lineup in perspective, a globe of data, particles -- and only with the spatial tier
    // enabled (CREATIVE_SPATIAL=on). Immersive mode alone is never a reason. Why is recorded on the timeline.
    const sctx = { enabled: c.spatial, mode: art.mode, family: art.family, personality: art.personality, kind: identity.kind, name: identity.name, title: concept.title, logline: concept.logline, what: c.what || (u.identity && u.identity.what), visuals: (u.visuals && u.visuals.main) || (c.visuals && c.visuals.main), motifs: c.motifs || u.motifs, scenes, timeline, byId, models: c.models };
    const dec = SP.decide(sctx); timeline.why = dec.why;
    const spatial = dec.renderer === 'spatial' ? SP.compose(sctx, dec) : null;
    if (spatial) {
      timeline.renderer = 'spatial'; timeline.spatial = spatial; fixes.push(`renderer: spatial (${dec.why.join(', ')})`);
      // (what the spatial layer would like from the pictures, and whether it had it -- never required: each has a fallback)
      const pa = actor && byId.get(actor.asset); const fl = spatial.pieces.find(x => x.kind === 'flight'); const mdl = spatial.actors.find(x => x.form === 'model');
      const alt = pa && assets.find(a => a.id !== pa.id && a.id !== pa.cutoutOf && (a.cutout || (a.assess && a.assess.transparent)) && curOf(a) && curOf(a).identity === 'exact');
      const met = { transparent: pa && (pa.cutout || (pa.assess && pa.assess.transparent)) ? pa.id : '', alternate: alt ? alt.id : '', environment: fl ? fl.assets[0] : '', foreground: '', model: mdl ? mdl.model : '' };
      const sn = SP.assetNeeds({ cutout: !!actor, bleed: !!fl, object: !!actor }).map(x => Object.assign(x, { met: met[x.need] || '' }));
      // (a plan accepted again -- a recompose, a revision -- replaces its spatial needs, never repeats them)
      const kinds = new Set(sn.map(x => x.need)); timeline.needs = (timeline.needs || []).filter(x => !kinds.has(x.need)).concat(sn).slice(0, 10);
    }
    else { if (raw.renderer === 'spatial') fixes.push(`renderer: DOM -- spatial was asked for but is not justified here (${dec.why.join(', ')})`); timeline.renderer = 'dom'; delete timeline.spatial; }
    timeline.behavior = TL.behavior(timeline, art);
    // (the page's fingerprint says how it actually moves: the validated timeline's behaviour, not the recipe's first plan)
    if (art) { art.behavior = timeline.behavior; art.recipe = (String(art.recipe || '').split('#')[0] + '#' + timeline.behavior).slice(0, 560); }
  }
  // ---- image-driven colour (palette.js): each scene's surface is its picture's colour; a scene without a picture sits
  // between its neighbours' colours; a confirmed premium hero's colour carries into the scenes after it. (A scene a
  // timeline beat floods keeps its flood: that colour change IS its moment.)
  if (!safety && art && art.mode) {
    const ids = scenes.map(s => (s.visual && s.visual.palette) || '');
    if (ids.some(Boolean)) {
      const flooded = new Set(timeline ? timeline.beats.filter(b => b.op === 'background' || b.op === 'takeover').map(b => b.scene) : []);
      // (a type takeover's flood is its moment too: one bold colour and one object)
      scenes.forEach((s, i) => { if (s.composition === 'type-takeover' && s.background === 'accent') flooded.add(i); });
      const src = c.premiumHero && c.premiumHero.source && byId.get(c.premiumHero.source);
      const tones = PAL.sceneTones(scenes.length, palette, ids, { hero: src ? PAL.identity(src).hex : '' });
      scenes.forEach((s, i) => { if (flooded.has(i) || !tones[i]) return; if (s.visual || !s.background || s.background === 'base') { s.background = 'base'; s.tone = tones[i]; } });
      fixes.push('palette: each scene takes its colour from its picture');
    }
  }
  // a scene's asset used on a background colour that clashes: accent/invert scenes get their own text colour
  scenes.forEach(s => { s.ink = sceneInk(s.background, palette, s.tone); });
  // the main subject is never blurred: "soft" is for backdrops and textures (a blurred focal picture read as washed out)
  if (!safety) scenes.forEach(s => s.layers.forEach(L => { if (L.kind === 'image' && L.role === 'focal' && L.treatment === 'soft') { L.treatment = 'none'; fixes.push(`scene ${s.id}: the main picture is shown sharp (no soft blur)`); } }));
  // a cut-out subject almost the colour of its stage (a black silhouette on a dark scene) gets a light rim so it reads
  // (decided when the page is composed; a saved page keeps its own treatments on reopening and export)
  if (!safety) scenes.forEach(s => s.layers.forEach(L => {
    const a = L.kind === 'image' && byId.get(L.asset); if (!a || !(a.cutout || (a.assess && a.assess.transparent)) || !(a.assess && typeof a.assess.luminance === 'number')) return;
    const hx = s.ink.surface; const stage = 0.2126 * parseInt(hx.slice(1, 3), 16) + 0.7152 * parseInt(hx.slice(3, 5), 16) + 0.0722 * parseInt(hx.slice(5, 7), 16); // same scale as assess.luminance
    if (Math.abs(a.assess.luminance - stage) < 45 && (L.treatment === 'none' || L.treatment === 'shadow')) { L.treatment = 'glow'; fixes.push(`scene ${s.id}: ${a.id} nearly matches its background -- given a light rim to stay visible`); }
  }));
  // credits for every picture shown, limited to those
  const shown = new Set(); if (actor) { shown.add(actor.asset); const aa = byId.get(actor.asset); if (aa && aa.cutoutOf) shown.add(aa.cutoutOf); } scenes.forEach(s => s.layers.forEach(L => { if (L.asset) { shown.add(L.asset); const a = byId.get(L.asset); if (a && a.cutoutOf) shown.add(a.cutoutOf); } }));
  // (a picture the owner adopted from the web is credited to its source page, as supplied by the owner)
  const credits = assets.filter(a => shown.has(a.id) && (a.origin !== 'upload' || a.ownerAffirmed || a.ownerPicked) && !a.cutoutOf).map(a => ({ asset: a.id, title: cap(a.title, 200), author: cap(a.author, 200), license: a.ownerPicked ? 'no licence stated; chosen by the page owner' : a.origin === 'upload' ? 'supplied by the page owner, who holds the rights' : cap(a.license, 80), url: /^https:\/\//.test(a.pageUrl || '') ? a.pageUrl : '', licenseUrl: /^https?:\/\//.test(a.licenseUrl || '') ? a.licenseUrl : '' }));
  const derived = assets.filter(a => shown.has(a.id) && a.cutoutOf).map(a => ({ asset: a.id, from: a.cutoutOf, note: 'background removed by SiteRemade' }));
  // PREMIUM MEDIA needs the director named (lib/media/premium-media.js): intents from the fixed list, pictures from this
  // inventory, at most two -- a suggestion the owner may buy, never a call. Eligibility and the hierarchy rules are applied
  // again, by the server, when it is quoted.
  const PM = ['cinematic_hero', 'object_motion', 'image_to_video', 'environment_motion', 'premium_transition', 'alternate_angle', 'image_enhance', 'stylized_treatment'];
  const premiumMedia = (Array.isArray(p.premiumMedia) ? p.premiumMedia : []).filter(m => m && PM.includes(m.intent) && byId.has(m.asset)).slice(0, 2)
    .map(m => ({ intent: m.intent, asset: m.asset, subject: cap(m.subject, 120), why: cap(m.why, 200) }));
  // the premium hero video the owner confirmed is planned into the page before it exists: it starts from the picture the
  // page was planned around (the server chose it -- the main picture when it is eligible), so the hero, its handoff and
  // the video can never disagree
  const ph = !safety && c.premiumHero && VIDEO_INTENTS.includes(c.premiumHero.intent) && byId.has(c.premiumHero.source) ? c.premiumHero : null;
  if (ph && !premiumMedia.some(m => VIDEO_INTENTS.includes(m.intent))) premiumMedia.splice(0, 0, { intent: ph.intent, asset: ph.source, subject: '', why: 'the premium hero video the owner confirmed' });
  if (premiumMedia.length > 2) premiumMedia.length = 2;
  // the owner's logo: a header mark (kept with the page; never a scene picture)
  const logoA = (p.logo && byId.get(p.logo.asset) && byId.get(p.logo.asset).ownerRole === 'logo' ? byId.get(p.logo.asset) : null) || assets.find(a => a.ownerRole === 'logo' && a.origin === 'upload' && !a.cutoutOf) || null;
  // ---- continuity (continuity.js): every seam between two scenes as a contract -- what crosses it, its state on both
  // sides (one state), the overlap, depth, mask, backdrop, typography and camera -- derived from this timeline and these
  // pictures. A new page gets its built-in contracts (the continuity pass may refine them); a saved page keeps its own.
  if (timeline && (!safety || (p.timeline && p.timeline.continuity))) {
    const ct = CT.normalise(p.timeline && p.timeline.continuity, { scenes, timeline, byId, premiumMedia, mode: art && art.mode, name: identity.name });
    if (ct.continuity) timeline.continuity = ct.continuity;
  }
  const plan = {
    v: 2, identity, concept, palette, type, atmosphere, motion, thread, scenes, wants, limitations, assetNotes, imagery,
    ...(premiumMedia.length ? { premiumMedia } : {}),
    ...(logoA ? { logo: { asset: logoA.id } } : {}),
    // the page's art direction (motion personality, scroll model, typography, navigation...), when it has one
    ...(art ? { art } : {}),
    // the persistent actor (a run of scenes one subject lives across)
    ...(actor ? { actor } : {}),
    // the page as one timeline: actors, beats, transitions, rhythm, moments
    ...(timeline ? { timeline } : {}),
    // the layout rules a plan was composed under: a saved page keeps its geometry; only an explicit recompose updates it
    layout: { version: safety ? num(p.layout && p.layout.version, 0, 99, 0) : LAYOUT_VERSION },
    // how the words were checked against the facts (set by the direction; carried, never invented here)
    ...(p.claims && typeof p.claims === 'object' ? { claims: { status: oneOf(p.claims.status, ['verified', 'partial', 'unchecked', 'off'], 'unchecked'), checked: num(p.claims.checked, 0, 999, 0), of: num(p.claims.of, 0, 999, 0), removed: num(p.claims.removed, 0, 999, 0), calls: num(p.claims.calls, 0, 9, 0) } } : {}),
    facts: facts.map(f => ({ id: f.id, text: cap(f.text, 600), section: cap(f.section, 80) })),
    // where the facts came from: the plan's own list, else the article the facts were read from (the director does not
    // write sources; without this a page cited facts and credited nothing -- Wikipedia text is CC BY-SA and needs credit)
    sources: (Array.isArray(p.sources) && p.sources.length ? p.sources : c.page && c.page.title && facts.length ? [c.page] : []).slice(0, 6).filter(s => s && s.title).map(s => ({ title: cap(s.title, 200), url: /^https:\/\//.test(s.url || '') ? cap(s.url, 400) : '', license: cap(s.license, 80) || (/^https:\/\/[a-z-]+\.wikipedia\.org\//.test(s.url || '') ? 'CC BY-SA 4.0' : ''), retrieved: cap(s.retrieved, 40) })),
    credits, derived,
    direction: p.direction && typeof p.direction === 'object' ? { source: oneOf(p.direction.source, ['ai', 'mock', 'built-in'], 'ai'), model: cap(p.direction.model, 60), at: cap(p.direction.at, 40), attempt: num(p.direction.attempt, 1, 9, 1), repaired: !!p.direction.repaired, seed: cap(p.direction.seed, 40) } : { source: 'ai', model: '', at: '', attempt: 1, repaired: false, seed: '' },
    ...(p.fixture ? { fixture: cap(p.fixture, 160) } : {}),
  };
  // an art-directed plan is returned in exactly the form it will be stored and reopened in (every bound applied, keys in
  // their saved order), so saving, reopening and exporting it never changes a byte of the design
  if (!safety && (plan.art || plan.scenes.some(s => s.layout && s.layout !== 'free'))) {
    const canonical = validatePlan2(plan, Object.assign({}, c, { mode: 'safety', recompose: null })).plan;
    return { plan: canonical, fixes, warnings, errors };
  }
  return { plan, fixes, warnings, errors };
}

// The page follows its pictures instead of sitting behind them:
//  1. a picture on a plain background floats -- its clean cut-out replaces it (no white disc on a dark scene);
//  2. a scene whose main picture keeps its own background takes that background's tone;
//  3. that picture's frame dissolves into the scene (soft edges, no box);
//  4. the page's base colour moves toward the opening picture's tone, so every scene shares its world.
// Text and accent colours are then re-derived for contrast against each scene's tone (sceneInk).
function blendPictures(scenes, palette, byId, assets, fixes, warnings) {
  const floats = a => !!(a && (a.cutout || (a.assess && a.assess.transparent)));
  const cutOf = a => assets.find(x => x.cutoutOf === a.id && x.caps && x.caps.moveFreely);
  scenes.forEach((s, si) => {
    let changed = false;
    // (an archetype scene swapped its cut-outs before it was composed, and keeps the frames it chose)
    const artScene = s.layout && s.layout !== 'free';
    if (!artScene) s.layers.forEach(L => {
      if (L.kind !== 'image' || L.role === 'backdrop' || L.role === 'texture') return;
      const a = byId.get(L.asset); if (!a || floats(a)) return;
      const cut = cutOf(a); if (!cut) return;
      L.asset = cut.id; L.mask = 'none'; L.fit = 'contain'; delete L.edge; if (L.treatment === 'none') L.treatment = 'shadow';
      changed = true; fixes.push(`scene ${s.id}: ${a.id} has a plain background -- its cut-out floats in the scene instead`);
    });
    // (a full-bleed backdrop already fills its scene: only a picture that leaves the scene around it gives it a tone)
    const main = s.layers.filter(L => L.kind === 'image' && L.opacity >= 0.6 && L.role !== 'backdrop' && L.role !== 'texture' && area(L.box.d) < 7000).map(L => ({ L, a: byId.get(L.asset) }))
      .filter(x => x.a && !floats(x.a) && x.a.assess && x.a.assess.background && HEX.test(x.a.assess.background.colour || ''))
      .sort((x, y) => (y.L.role === 'focal') - (x.L.role === 'focal') || area(y.L.box.d) - area(x.L.box.d))[0];
    if (main && main.a.assess.background.uniformity >= 0.45) {
      // the picture's tone, moved just far enough toward dark or light that the words on it read at 7:1
      let tone = main.a.assess.background.colour.toLowerCase(); const toLight = lum(tone) > 0.18;
      for (let i = 0; i < 20 && contrast(tone, toLight ? '#141414' : '#f6f3ee') < 7; i++) tone = mix(tone, toLight ? '#ffffff' : '#000000', 0.12);
      s.tone = tone;
      // its frame dissolves into the scene -- unless dissolving would mean cropping a picture shown whole beyond an
      // editorial crop (it then keeps its frame, on its own colour)
      const cropIf = main.L.fit === 'contain' ? FR.coverCrop(FR.profile(main.a).aspect, (main.L.box.d[2] * FR.STAGE.d) / main.L.box.d[3]).crop : 0;
      if (!artScene && ['none', 'window', 'frame', 'polaroid'].includes(main.L.mask) && main.L.role !== 'backdrop' && cropIf <= FR.BUDGET.editorial && !FR.profile(main.a).tight) { main.L.mask = 'none'; main.L.edge = 'fade'; if (main.L.fit === 'contain') main.L.fit = 'cover'; }
      changed = true; fixes.push(`scene ${s.id}: takes the tone of its picture (${s.tone}) so the picture sits in its own world`);
    }
    if (changed && !artScene) { compose(s, byId, fixes, warnings, si === 0); frameFree(s, byId, fixes); legible(s, byId, fixes); boundZoom(s, byId, fixes); }
  });
  const h = scenes[0] && scenes[0].tone;
  if (h) {
    palette.bg = mix(palette.bg, h, 0.75); palette.bg2 = mix(palette.bg2, h, 0.45);
    if (contrast(palette.ink, palette.bg) < 7) palette.ink = lum(palette.bg) > 0.3 ? '#141414' : '#f6f3ee';
    if (contrast(palette.muted, palette.bg) < 4.5) palette.muted = mix(palette.ink, palette.bg, 0.3);
    for (let i = 0; i < 12 && contrast(palette.accent, palette.bg) < 3.2; i++) palette.accent = mix(palette.accent, lum(palette.bg) > 0.3 ? '#000000' : '#ffffff', 0.18);
    fixes.push(`palette: the page's base colour follows the opening picture (${h})`);
  }
}
// Decoration is light, not clip-art: one deliberate shape per scene at most (the largest; a focal shape and a focal's
// own group are not decoration), and none across the words -- a shape that passes behind them fades almost away.
function calmShapes(scene, fixes) {
  const focal = scene.layers.find(L => L.role === 'focal');
  const deco = scene.layers.filter(L => L.kind === 'shape' && L.role !== 'focal' && !(focal && focal.group && L.group === focal.group));
  if (deco.length > 1) {
    const keep = deco.slice().sort((a, b) => area(b.box.d) - area(a.box.d))[0];
    const drop = new Set(deco.filter(L => L !== keep));
    scene.layers = scene.layers.filter(L => !drop.has(L));
    fixes.push(`scene ${scene.id}: ${drop.size} decorative shape${drop.size > 1 ? 's' : ''} removed -- one deliberate shape at most`);
  }
  const t = scene.text; if (!(t.heading || t.body || t.items.length)) return;
  const tb = REGION_BOXES[t.region];
  scene.layers.forEach(L => {
    if (L.kind !== 'shape' || L.role === 'focal' || L.opacity <= 0.2) return;
    if (overlap(L.box.d, tb) > Math.min(area(L.box.d), area(tb)) * 0.12) { L.opacity = 0.18; L.z = Math.min(L.z, 2); fixes.push(`scene ${scene.id}: a ${L.shape.form} passing behind the words fades almost away`); }
  });
}
function sceneInk(bg, P, tone) {
  if (tone) {
    const light = contrast('#141414', tone) >= contrast('#f6f3ee', tone); const ink = contrast(P.ink, tone) >= 7 ? P.ink : light ? '#141414' : '#f6f3ee';
    let accent = P.accent; for (let i = 0; i < 12 && contrast(accent, tone) < 3.2; i++) accent = mix(accent, light ? '#000000' : '#ffffff', 0.18);
    let muted = mix(ink, tone, 0.3); for (let i = 0; i < 8 && contrast(muted, tone) < 4.5; i++) muted = mix(muted, ink, 0.3);
    return { ink, muted, surface: tone, accent };
  }
  if (bg === 'invert') return { ink: P.bg, muted: mix(P.bg, P.ink, 0.3), surface: P.ink };
  if (bg === 'accent') { const dark = contrast('#111111', P.accent) >= contrast('#f7f5f0', P.accent); return { ink: dark ? '#111111' : '#f7f5f0', muted: dark ? '#2a2a2a' : '#ece8e0', surface: P.accent }; }
  return { ink: P.ink, muted: P.muted, surface: bg === 'deep' ? P.bg2 : P.bg };
}

// composition: the focal layer stays large and clear of the words; secondaries give way first
const MIN_FOCAL = { hero: 1300, scene: 650 };
// whatever the composition, the words must read: checked after it, for every scene
function legible(scene, byId, fixes) {
  const t = scene.text; if (!(t.heading || t.body || t.items.length)) return;
  // a long heading in the narrow column stacks into a tower of one or two words a line
  if (t.width === 'narrow' && t.heading.length > 40) { t.width = 'medium'; fixes.push(`scene ${scene.id}: a long heading gets the medium column`); }
  const tb = REGION_BOXES[t.region];
  // a word layer across the words garbles them: it becomes a ghost behind them
  scene.layers.forEach(L => { if (L.kind === 'word' && L.opacity > 0.2 && overlap(L.box.d, tb) > area(L.box.d) * 0.15) { L.opacity = 0.16; L.z = Math.min(L.z, 2); fixes.push(`scene ${scene.id}: the word "${L.word.text}" is a ghost behind the words`); } });
  // words directly on a photo that fills their area (a full-bleed focal or a backdrop picture) get a scrim
  if (!t.scrim && scene.layers.some(L => L.kind === 'image' && L.opacity > 0.3 && overlap(drawnRect(L, byId.get(L.asset), 'd'), tb) > area(tb) * 0.3)) { t.scrim = true; fixes.push(`scene ${scene.id}: the words sit on a picture -- a scrim keeps them readable`); }
}

// a picture on a plain background floats as its clean cut-out (before an archetype composes around it)
// a composition is staged on the base its pictures can carry (composition.js baseFor); pictures it shows as photos -- a
// full bleed, a wall, a mask, the far plane of a depth stack -- stay photos (marked bleed before the cut-out swap), a
// stage that stands its subject alone takes the cut-out. A scene whose pictures cannot carry its composition takes the
// nearest one they can, or composes as its own layout.
function stageComposition(scene, x, fixes, where) {
  let comp = scene.composition;
  if (!COMP.fit(comp, x)) {
    const alt = COMP.alternatives(comp, scene.arc).find(k => COMP.fit(k, x));
    fixes.push(`${where}: its pictures cannot carry a ${comp}${alt ? ` -- staged as ${alt}` : ''}`);
    if (!alt) { delete scene.composition; delete scene.arc; return; }
    comp = alt; scene.composition = alt;
  }
  const base = COMP.baseFor(comp, x); scene.layout = base;
  scene.choreo = COMP.SPEC[comp].keepChoreo || (base === 'chapters' ? 'chapters' : base === 'orbit' ? 'travel' : 'compose');
  const photo = ['editorial-hero', 'mask-stage', 'image-wall', 'chapters'].includes(base) || (base === 'type-stage' && !x.cut);
  const imgs = scene.layers.filter(L => L.kind === 'image'); const f = imgs.find(L => L.role === 'focal') || imgs[0];
  // (a stage that shows the photo full-screen shows the photo -- a cut-out the plan gave it goes back to its original)
  if (photo && f && byIdOf(scene) && x.video) { const a = byIdOf(scene).get(f.asset); if (a && a.cutoutOf && byIdOf(scene).get(a.cutoutOf)) { f.asset = a.cutoutOf; f.fit = 'cover'; } }
  imgs.forEach(L => { if (photo || (base === 'depth-stack' && L !== f)) { L.frame = 'bleed'; L.mask = 'none'; } });
}
const BYID = new WeakMap(); const byIdOf = scene => BYID.get(scene);
function swapCutouts(scene, byId, assets, fixes) {
  scene.layers.forEach(L => {
    if (L.kind !== 'image' || L.role === 'backdrop' || L.role === 'texture') return;
    const a = byId.get(L.asset); if (!a || a.cutout || (a.assess && a.assess.transparent)) return;
    const cut = assets.find(x => x.cutoutOf === a.id && x.caps && x.caps.moveFreely); if (!cut) return;
    // (a picture chosen as a texture or a full bleed stays a picture)
    if (L.frame === 'bleed' || L.frame === 'texture' || L.frame === 'detail') return;
    L.asset = cut.id; L.mask = 'none'; L.fit = 'contain'; delete L.edge; delete L.frame; if (L.treatment === 'none') L.treatment = 'shadow';
    fixes.push(`scene ${scene.id}: ${a.id} has a plain background -- its cut-out floats in the scene instead`);
  });
}
// a free composition's pictures are framed as deliberately as an archetype's: a cover crop stays inside its budget
// (the container reshapes toward the picture, or the picture is shown whole), and the crop keeps the subject in view
function frameFree(scene, byId, fixes) {
  scene.layers.forEach(L => {
    if (L.kind !== 'image' || L.group || L.role === 'backdrop' || L.role === 'texture') return;
    const a = byId.get(L.asset); if (!a) return; const pr = FR.profile(a); if (pr.free) return;
    const intent = L.frame && L.frame !== 'auto' ? L.frame : L.edge === 'fade' ? 'editorial' : L.mask !== 'none' ? 'masked' : 'light';
    const probe = Object.assign({}, L, { frame: intent });
    const fd = FR.frameLayer(probe, a, 'd', { anchor: 'cm' }); const fm = FR.frameLayer(probe, a, 'm', { anchor: 'cm' });
    [...new Set(fd.notes.concat(fm.notes))].forEach(n => fixes.push(`scene ${scene.id}: ${n}`));
    L.box = { d: fd.box, m: fm.box }; L.frame = fd.intent;
    if (fd.fit !== L.fit || L.focus === '50% 50%') L.focus = fd.focus;
    L.fit = fd.fit;
    if (fm.fit !== fd.fit || fm.focus !== fd.focus) { L.mfit = fm.fit; L.mfocus = fm.focus; } else { delete L.mfit; delete L.mfocus; }
    if (L.fit === 'contain' && ['circle', 'arch', 'blob', 'diamond', 'slit', 'porthole', 'torn'].includes(L.mask)) L.mask = 'window';
    if (L.fit === 'contain' && L.edge === 'fade') { delete L.edge; if (L.mask === 'none') L.mask = 'window'; }
  });
}
// the ceilings on artificial enlargement (framing.js ZOOM): an ambient zoom and a scroll zoom on a picture stay small;
// an explicit detail framing may go further
function boundZoom(scene, byId, fixes) {
  scene.layers.forEach(L => {
    if (L.kind !== 'image') return;
    const detail = L.frame === 'detail';
    if (L.loop.kind === 'kenburns') { const max = ((detail ? FR.ZOOM.detail : FR.ZOOM.loop) - 1.02) / 0.05; if (L.loop.amp > max) { L.loop.amp = Math.round(max * 100) / 100; fixes.push(`scene ${scene.id}: ${L.id}'s slow zoom kept small (no creeping crop)`); } }
    if (L.scroll.kind === 'zoom-in' || L.scroll.kind === 'zoom-out') { const max = ((detail ? FR.ZOOM.detail : FR.ZOOM.scroll) - 1) / 0.55; if (Math.abs(L.scroll.amount) > max) { L.scroll.amount = Math.round(Math.sign(L.scroll.amount || 1) * max * 100) / 100; fixes.push(`scene ${scene.id}: ${L.id}'s scroll zoom kept inside ${Math.round(((detail ? FR.ZOOM.detail : FR.ZOOM.scroll) - 1) * 100)}%`); } }
  });
}

// a member's box, carried from its group's old anchor box to the new one (moved and scaled with it)
function carry(m, from, to) {
  const sx = to[2] / Math.max(0.1, from[2]), sy = to[3] / Math.max(0.1, from[3]);
  return [to[0] + (m[0] - from[0]) * sx, to[1] + (m[1] - from[1]) * sy, m[2] * sx, m[3] * sy].map(v => Math.round(v * 10) / 10);
}

function compose(scene, byId, fixes, warnings, hero) {
  const focal = scene.layers.find(L => L.role === 'focal'); if (!focal) return;
  const asset = focal.asset ? byId.get(focal.asset) : null;
  // the focal's group travels with it: every move, enlargement or reduction is applied to the whole object
  const members = focal.group ? scene.layers.filter(L => L !== focal && L.group === focal.group) : [];
  const setFocal = (k, nb) => { const old = focal.box[k]; focal.box[k] = nb; members.forEach(M => { M.box[k] = carry(M.box[k], old, nb); }); };
  const rect = k => (focal.kind === 'image' ? drawnRect(focal, asset, k) : focal.box[k].slice());
  const min = hero ? MIN_FOCAL.hero : MIN_FOCAL.scene;
  // (a box that already spans the stage stops growing, so validating again changes nothing)
  for (let i = 0; i < 4 && area(rect('d')) < min && focal.role !== 'backdrop' && focal.box.d[2] < 100 && focal.box.d[3] < 100; i++) {
    const b = focal.box.d; const g = Math.min(3, Math.max(1.05, Math.sqrt(min / Math.max(1, area(rect('d')))) * 1.03));
    const w = Math.min(100, b[2] * g), h = Math.min(100, b[3] * g); setFocal('d', box([b[0] - (w - b[2]) / 2, b[1] - (h - b[3]) / 2, w, h], b));
    if (i === 0) fixes.push(`scene ${scene.id}: focal picture enlarged to stay the main visual`);
  }
  // phones: the words sit above the stage, so the focal can and should fill it
  const minM = hero ? 3000 : 2000; const rectM = () => (focal.kind === 'image' ? drawnRect(focal, asset, 'm') : focal.box.m.slice());
  for (let i = 0; i < 4 && area(rectM()) < minM && focal.role !== 'backdrop' && focal.box.m[2] < 100 && focal.box.m[3] < 100; i++) {
    const b = focal.box.m; const g = Math.min(3, Math.max(1.05, Math.sqrt(minM / Math.max(1, area(rectM()))) * 1.03));
    const w = Math.min(100, b[2] * g), h = Math.min(100, b[3] * g); setFocal('m', box([b[0] - (w - b[2]) / 2, b[1] - (h - b[3]) / 2, w, h], b));
    if (i === 0) fixes.push(`scene ${scene.id}: focal picture enlarged on phones`);
  }
  if (focal.role === 'backdrop' || focal.box.d[2] >= 90) return; // a full-bleed focal carries the words over a scrim
  // a ghost word or a faint shape behind the words is a background, not something the words hide
  if (focal.kind === 'word' || (focal.kind === 'shape' && focal.opacity < 0.5)) return;
  if (!(scene.text.heading || scene.text.body || scene.text.items.length)) return;
  let tb = REGION_BOXES[scene.text.region]; const r = rect('d');
  if (overlap(r, tb) > area(r) * 0.06) {
    // the main subject keeps its size where it can: move it clear, else move the words, and only then make it smaller
    const b = focal.box.d; const cx = tb[0] + tb[2] / 2;
    // to the far side of the words, inside the outer margin the thread runs in
    const lo = b[2] <= 90 ? 5 : 0, hi = b[2] <= 90 ? 95 : 100;
    const target = cx < 50 ? Math.max(tb[0] + tb[2] + 2, hi - b[2]) : Math.min(tb[0] - b[2] - 2, lo);
    const moved = box([cx < 50 ? Math.min(target, hi - b[2]) : Math.max(lo, target), b[1], b[2], b[3]], b);
    const rectAt = d => (focal.kind === 'image' ? drawnRect(Object.assign({}, focal, { box: Object.assign({}, focal.box, { d }) }), asset, 'd') : d);
    const r2 = rectAt(moved); const other = OPPOSITE[scene.text.region];
    // (the room beside the words, for the last resort of a smaller focal)
    const room = cx < 50 ? hi - (tb[0] + tb[2] + 2) : tb[0] - 2 - lo; const f = room / b[2];
    const fit = f >= 0.55 && f < 1 ? box([cx < 50 ? tb[0] + tb[2] + 2 : lo, b[1] + b[3] * (1 - f) / 2, room, b[3] * f], b) : null;
    const r3 = fit && rectAt(fit);
    if (overlap(r2, tb) <= area(r2) * 0.06) { setFocal('d', moved); fixes.push(`scene ${scene.id}: focal moved clear of the words`); }
    else if (overlap(r, REGION_BOXES[other]) <= area(r) * 0.06) { scene.text.region = other; fixes.push(`scene ${scene.id}: words moved clear of the focal`); }
    else if (fit && overlap(r3, tb) <= area(r3) * 0.06 && area(r3) >= min) { setFocal('d', fit); fixes.push(`scene ${scene.id}: focal made smaller to sit beside the words`); }
    else { scene.text.scrim = true; warnings.push(`scene ${scene.id}: words sit over the focal picture -- a scrim keeps them readable`); }
  }
  // secondaries never cover the words (the focal's own group is part of the focal, not a secondary)
  tb = REGION_BOXES[scene.text.region];
  scene.layers.forEach(L => {
    // (a full-bleed texture is a background; a small "texture" -- a bubble, a spark -- is decoration and must not sit on the words or the button)
    if (L === focal || members.includes(L) || L.role === 'backdrop' || (L.role === 'texture' && area(L.box.d) >= 1500)) return;
    const lrOf = d => (L.kind === 'image' ? drawnRect(Object.assign({}, L, { box: Object.assign({}, L.box, { d }) }), byId.get(L.asset), 'd') : d);
    const lr = lrOf(L.box.d); if (!(overlap(lr, tb) > area(lr) * 0.25)) return;
    // first move it beside the words (and off the focal); only if there is no room does it fade behind them
    const b = L.box.d; const fr = rect('d');
    const spots = [tb[0] + tb[2] + 2, tb[0] - b[2] - 2].filter(x => x >= 5 && x + b[2] <= 95).map(x => [x, b[1], b[2], b[3]]);
    const free = spots.find(d => overlap(lrOf(d), tb) <= area(lrOf(d)) * 0.06 && overlap(d, fr) <= area(d) * 0.25);
    if (free) { L.box.d = free; fixes.push(`scene ${scene.id}: ${L.id} moved beside the words`); return; }
    // a photo behind body text competes with it far more than a flat shape does, so it fades further
    const faint = L.kind === 'image' ? 0.15 : 0.3;
    if (L.opacity > faint + 0.05) { L.opacity = faint; L.z = Math.min(L.z, 2); fixes.push(`scene ${scene.id}: ${L.id} faded behind the words`); }
  });
  // clear at rest is not enough: a layer that grows or slides on scroll must stay clear at its largest too
  // (mirrors the runtime: zoom scales by 1 + |amount| * .55, drift-x slides |amount| * 17.5% each way, the camera scales about 60% 55%)
  const camS = scene.camera === 'push-in' || scene.camera === 'pull-out' ? 1.12 : 1;
  scene.layers.forEach(L => {
    const k = L.scroll.kind; if (members.includes(L) || L.role === 'backdrop' || L.role === 'texture' || !['zoom-in', 'zoom-out', 'drift-x'].includes(k) || L.opacity < 0.5) return;
    const rest = L.kind === 'image' ? drawnRect(L, byId.get(L.asset), 'd') : L.box.d;
    // a zoom scales about the layer box's centre, or about its left/right edge when anchored
    const bx = L.box.d;
    const peak = (a, anchor) => {
      let [x, y, w, h] = rest;
      if (k === 'drift-x') { const dx = Math.abs(a) * 17.5; x -= dx; w += 2 * dx; }
      else { const s = 1 + Math.abs(a) * 0.55; const ox = anchor === 'left' ? bx[0] : anchor === 'right' ? bx[0] + bx[2] : bx[0] + bx[2] / 2, oy = bx[1] + bx[3] / 2; x = ox + (x - ox) * s; y = oy + (y - oy) * s; w *= s; h *= s; }
      return [60 + (x - 60) * camS, 55 + (y - 55) * camS, w * camS, h * camS];
    };
    // with a 2% margin either side of the words for the idle loops (float, breathe) that ride on top
    const tbM = [tb[0] - 2, tb[1], tb[2] + 4, tb[3]];
    const clear = (a, anchor) => overlap(peak(a, anchor), tbM) <= area(rest) * 0.02;
    if (overlap(peak(0), tb) > area(rest) * 0.02 || clear(L.scroll.amount, L.scroll.anchor)) return;
    const a0 = L.scroll.amount;
    // first keep the zoom and grow it away from the words (anchored on the edge that faces them)
    const away = bx[0] + bx[2] / 2 < tb[0] + tb[2] / 2 ? 'right' : 'left';
    if (k !== 'drift-x' && clear(a0, away)) { L.scroll.anchor = away; fixes.push(`scene ${scene.id}: ${L.id} ${k} grows away from the words`); return; }
    const a = [0.66, 0.33].map(f => Math.round(a0 * f * 100) / 100).find(v => clear(v, L.scroll.anchor));
    if (a) { L.scroll.amount = a; fixes.push(`scene ${scene.id}: ${L.id} ${k} reduced so it never grows over the words`); }
    else { L.scroll = { kind: 'parallax', amount: a0 }; fixes.push(`scene ${scene.id}: ${L.id} ${k} would cross the words -- parallax instead`); }
  });
}

module.exports = { validatePlan2, VOCAB, LIMITS, REGION_BOXES, LAYOUT_VERSION, contrast, sceneInk, carry };
