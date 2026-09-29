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
// the composition rules' version, stamped on every accepted plan (0 = a plan saved before versioning)
const LAYOUT_VERSION = 3;

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
  shape: ['circle', 'ring', 'triangle', 'diamond', 'star', 'wave', 'arc', 'line', 'blob', 'dots', 'sunburst', 'stripes', 'cross'],
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
const cap = (v, n) => clean(v).slice(0, n);
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

  // ---- what the director saw in each picture (vision) and what it wanted but could not have ----
  const assetNotes = (Array.isArray(p.assetNotes) ? p.assetNotes : []).slice(0, 24).filter(n => n && byId.has(n.asset)).map(n => ({ asset: n.asset, depicts: cap(n.depicts, 200), matches: oneOf(n.matches, VOCAB.matches, 'unsure'), useFor: cap(n.useFor, 120) }));
  const verdict = new Map(assetNotes.map(n => [n.asset, n.matches]));
  const baseOf = a => (a && a.cutoutOf ? byId.get(a.cutoutOf) || a : a);
  const verdictOf = a => verdict.get(a.id) || (a.cutoutOf ? verdict.get(a.cutoutOf) : null) || 'unsure';
  const wants = (Array.isArray(p.wants) ? p.wants : []).slice(0, 10).map(w => w && { description: cap(w.description, 200), role: cap(w.role, 40), asset: byId.has(w.asset) ? w.asset : null, fallback: cap(w.fallback, 200) }).filter(w => w && w.description);
  wants.forEach(w => { w.status = w.asset ? 'fulfilled' : 'missing'; });
  const limitations = (Array.isArray(p.limitations) ? p.limitations : []).slice(0, 8).map(x => cap(x, 240)).filter(Boolean);

  // ---- scenes ----
  const rawScenes = Array.isArray(p.scenes) ? p.scenes : [];
  if (rawScenes.length < LIMITS.scenes[0]) errors.push(`scenes: at least ${LIMITS.scenes[0]} scenes are needed`);
  if (rawScenes.length > LIMITS.scenes[1]) fixes.push(`scenes: ${rawScenes.length - LIMITS.scenes[1]} scene(s) beyond ${LIMITS.scenes[1]} dropped`);
  const uses = new Map(); let layersTotal = 0, pinned = 0; const seenIds = new Set();
  let sourcedLines = 0, uncited = 0; const badCites = [];
  const scenes = rawScenes.slice(0, LIMITS.scenes[1]).map((rs, si) => {
    if (!rs || typeof rs !== 'object') return null;
    let sid = id(rs.id, `scene-${si + 1}`); while (seenIds.has(sid)) sid += 'x'; seenIds.add(sid);
    const where = `scene ${si + 1} (${sid})`;
    const height = oneOf(rs.height, VOCAB.height, si === 0 ? 'screen' : 'auto');
    let pin = !!rs.pin && height === 'tall';
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
    // layers
    let layers = (Array.isArray(rs.layers) ? rs.layers : []).slice(0, LIMITS.layersPerScene).map((rl, li) => {
      if (!rl || typeof rl !== 'object') return null;
      const kind = oneOf(rl.kind, VOCAB.layerKind, rl.asset ? 'image' : 'shape');
      const role = oneOf(rl.role, VOCAB.role, li === 0 ? 'focal' : 'support');
      const e = rl.entrance || {}, l = rl.loop || {}, s = rl.scroll || {};
      const L = {
        id: id(rl.id, `l${li + 1}`), kind, role,
        box: { d: box(rl.box && rl.box.d, [50, 10, 40, 80], role === 'backdrop' || role === 'texture' || !!rl.group), m: box(rl.box && rl.box.m, [10, 10, 80, 80], role === 'backdrop' || role === 'texture' || !!rl.group) },
        z: Math.round(num(rl.z, 1, 9, role === 'focal' ? 5 : role === 'backdrop' ? 1 : 3)), rotate: num(rl.rotate, -45, 45, 0), opacity: num(rl.opacity, 0.05, 1, 1),
        mask: oneOf(rl.mask, VOCAB.mask, 'none'), treatment: oneOf(rl.treatment, VOCAB.treatment, 'none'),
        entrance: { kind: oneOf(e.kind, VOCAB.entrance, 'fade'), delay: num(e.delay, 0, 4, 0.2), dur: num(e.dur, 0.2, 3, 1.1) },
        loop: { kind: oneOf(l.kind, VOCAB.loop, 'none'), amp: num(l.amp, 0, 3, 1), period: num(l.period, 3, 30, 9) },
        scroll: Object.assign({ kind: oneOf(s.kind, VOCAB.scroll, 'none'), amount: num(s.amount, -1, 1, 0.4) }, s.anchor === 'left' || s.anchor === 'right' ? { anchor: s.anchor } : {}),
        hideM: !!rl.hideM,
        // layers sharing a group move as one object (one entrance, loop and scroll; relative placement kept)
        ...(/^[a-z0-9][a-z0-9-]{0,23}$/i.test(rl.group || '') ? { group: String(rl.group).toLowerCase() } : {}),
      };
      // the outer margin belongs to the thread that runs down the page: layers stay inside it unless they are full-bleed
      // (a member of a group follows its focal, so the group is kept whole rather than clamped piece by piece)
      if (!safety && !(L.group && role !== 'focal') && role !== 'backdrop' && role !== 'texture' && L.box.d[2] <= 90) { const b = L.box.d; const x = Math.max(5, Math.min(95 - b[2], b[0])); if (x !== b[0]) L.box.d = [x, b[1], b[2], b[3]]; }
      if (kind === 'image') {
        const a = byId.get(rl.asset);
        if (!a) { (role === 'focal' ? errors : warnings).push(`${where}: picture "${cap(rl.asset, 40)}" does not exist${role === 'focal' ? ' -- use an asset from the inventory or a shape/word focal' : ' -- layer removed'}`); return null; }
        if (verdictOf(a) === 'no') { fixes.push(`${where}: ${a.id} does not show the subject (the director's own look at it) -- layer removed`); return null; }
        const k0 = curOf(a); if (k0 && (k0.role === 'unrelated' || k0.identity === 'other')) { fixes.push(`${where}: ${a.id} does not show the subject (the picture check: ${k0.depicts || 'unrelated'}) -- layer removed`); return null; }
        if (personal && baseOf(a).origin !== 'upload') { fixes.push(`${where}: ${a.id} is not the owner's own photo -- removed from a personal page`); return null; }
        L.asset = a.id; L.fit = oneOf(rl.fit, VOCAB.fit, (a.caps && a.caps.moveFreely) ? 'contain' : 'cover'); L.focus = /^\d{1,3}% \d{1,3}%$/.test(rl.focus || '') ? rl.focus : '50% 50%';
        // a flat photo never floats as a bare rectangle: framed, masked, or used as a full backdrop
        const free = !!(a.caps && a.caps.moveFreely);
        if (!free && L.mask === 'none' && role !== 'backdrop' && role !== 'texture') { L.mask = 'window'; fixes.push(`${where}: ${a.id} is a flat photo -- framed instead of floating as a bare rectangle`); }
        if (!free && L.fit === 'contain' && L.mask !== 'none') L.fit = 'cover';
        const k = baseOf(a).id; uses.set(k, (uses.get(k) || 0) + 1);
        const max = a.cutout || (a.assess && a.assess.transparent) ? LIMITS.cutoutUses : LIMITS.photoUses;
        if (uses.get(k) > max) { fixes.push(`${where}: ${a.id} already appears ${max} times -- not repeated again as filler`); return null; }
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
      if (L.scroll.kind !== 'none') { if (scrolls >= LIMITS.scrollPerScene) L.scroll.kind = 'none'; else scrolls++; }
    });
    // a still page keeps nothing moving but light passing across (sheen)
    if (motion.tempo === 'still') layers.forEach(L => { if (L.loop.kind !== 'sheen') L.loop.kind = 'none'; });
    // when the tempo calls for movement, the opening subject is never frozen: a subject the director left without
    // an ambient loop gets the gentle one that suits what it is (a framed picture drifts inside its frame)
    if (!safety && si === 0 && motion.tempo !== 'still') {
      const f0 = layers.find(L => L.role === 'focal');
      if (f0 && f0.loop.kind === 'none' && f0.kind !== 'word' && f0.box.d[2] < 95) {
        const a0 = f0.kind === 'image' ? byId.get(f0.asset) : null; const free = !!(a0 && a0.caps && a0.caps.moveFreely);
        f0.loop = f0.kind === 'image' ? (free ? { kind: 'float', amp: 1, period: 9 } : { kind: 'kenburns', amp: 1, period: 12 }) : { kind: 'breathe', amp: 1, period: 8 };
        fixes.push(`${where}: the opening subject was frozen at a ${motion.tempo} tempo -- given a gentle ${f0.loop.kind}`);
      }
    }
    if (layersTotal + layers.length > LIMITS.layersTotal) { layers = layers.slice(0, Math.max(0, LIMITS.layersTotal - layersTotal)); fixes.push(`${where}: layer budget reached`); }
    layersTotal += layers.length;
    if (pin && !layers.some(L => L.scroll.kind !== 'none')) { pin = false; pinned--; fixes.push(`${where}: pinned without anything moving on scroll -- unpinned`); }
    const bg = rs.background || {};
    // an "auto" scene is only as tall as its words; pictures and shapes need a stage of their own beside them
    let sceneHeight = height;
    if (!safety && height === 'auto' && layers.some(L => L.role !== 'backdrop' && L.role !== 'texture')) { sceneHeight = 'short'; fixes.push(`${where}: layers need room -- the scene gets a short stage instead of text height`); }
    const scene = {
      id: sid, name: cap(rs.name, 60), purpose: cap(rs.purpose, 240), link: cap(rs.link, 240), navLabel: cap(rs.navLabel, 24),
      height: sceneHeight, pin, camera: oneOf(rs.camera, VOCAB.camera, 'none'), background: oneOf(bg.style || rs.background, VOCAB.sceneBg, si === 0 ? 'base' : 'base'), atmosphere: !!rs.atmosphere || si === 0,
      mobile: { order: oneOf(rs.mobile && rs.mobile.order, VOCAB.mobileOrder, si === 0 ? 'text-first' : 'text-first') },
      text, layers,
    };
    if (si === 0) scene.cta = cap(rs.cta, 40) || 'Begin';
    if (!scene.purpose) warnings.push(`${where}: no stated purpose`);
    // (a picture swap re-fits only the scenes that show the new picture: ctx.recompose lists their ids)
    if (!safety || (c.recompose && c.recompose.includes(sid))) { compose(scene, byId, fixes, warnings, si === 0); legible(scene, byId, fixes); }
    else if (rs.text && rs.text.scrim) scene.text.scrim = true; // a saved scrim stays
    return scene;
  }).filter(Boolean);
  if (!safety && scenes.length && !scenes[0].layers.some(L => L.role === 'focal')) {
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
  if (mainA && scenes[0]) {
    const hs = scenes[0]; const pick = assets.find(a => a.cutoutOf === mainA.id && a.caps && a.caps.moveFreely) || mainA;
    let f0 = hs.layers.find(L => L.role === 'focal');
    const leads = f0 && f0.kind === 'image' && (f0.asset === mainA.id || f0.asset === pick.id || (byId.get(f0.asset) || {}).cutoutOf === mainA.id);
    if (!leads) {
      if (!f0) { f0 = { id: 'main', kind: 'image', role: 'focal', box: { d: [52, 10, 42, 78], m: [8, 6, 84, 64] }, z: 5, rotate: 0, opacity: 1, mask: 'none', treatment: 'shadow', entrance: { kind: 'rise', delay: 0.2, dur: 1.1 }, loop: { kind: 'none', amp: 1, period: 9 }, scroll: { kind: 'none', amount: 0.4 }, hideM: false }; hs.layers.unshift(f0); }
      const free = !!(pick.caps && pick.caps.moveFreely);
      Object.assign(f0, { kind: 'image', asset: pick.id, fit: free ? 'contain' : 'cover', focus: /^\d{1,3}% \d{1,3}%$/.test(mainA.focus || '') ? mainA.focus : '50% 50%', mask: free ? 'none' : (f0.mask && f0.mask !== 'none' ? f0.mask : 'window'), opacity: Math.max(0.9, f0.opacity || 1) });
      delete f0.shape; delete f0.word;
      fixes.push(`hero: the owner's chosen main picture (${mainA.id}) leads the opening scene`);
      compose(hs, byId, fixes, warnings, true); legible(hs, byId, fixes);
    }
  }
  // ---- the subject's imagery: a logo is a reference, never the hero's main picture when a real picture of the
  // subject exists; and a page that should show its subject but cannot is marked degraded, never passed off
  const heroFocal = scenes[0] && scenes[0].layers.find(L => L.role === 'focal');
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
  // a scene's asset used on a background colour that clashes: accent/invert scenes get their own text colour
  scenes.forEach(s => { s.ink = sceneInk(s.background, palette); });
  // the main subject is never blurred: "soft" is for backdrops and textures (a blurred focal picture read as washed out)
  if (!safety) scenes.forEach(s => s.layers.forEach(L => { if (L.kind === 'image' && L.role === 'focal' && L.treatment === 'soft') { L.treatment = 'none'; fixes.push(`scene ${s.id}: the main picture is shown sharp (no soft blur)`); } }));
  // a cut-out subject almost the colour of its stage (a black silhouette on a dark scene) gets a light rim so it reads
  scenes.forEach(s => s.layers.forEach(L => {
    const a = L.kind === 'image' && byId.get(L.asset); if (!a || !(a.cutout || (a.assess && a.assess.transparent)) || !(a.assess && typeof a.assess.luminance === 'number')) return;
    const hx = s.ink.surface; const stage = 0.2126 * parseInt(hx.slice(1, 3), 16) + 0.7152 * parseInt(hx.slice(3, 5), 16) + 0.0722 * parseInt(hx.slice(5, 7), 16); // same scale as assess.luminance
    if (Math.abs(a.assess.luminance - stage) < 45 && (L.treatment === 'none' || L.treatment === 'shadow')) { L.treatment = 'glow'; fixes.push(`scene ${s.id}: ${a.id} nearly matches its background -- given a light rim to stay visible`); }
  }));
  // credits for every picture shown, limited to those
  const shown = new Set(); scenes.forEach(s => s.layers.forEach(L => { if (L.asset) { shown.add(L.asset); const a = byId.get(L.asset); if (a && a.cutoutOf) shown.add(a.cutoutOf); } }));
  // (a picture the owner adopted from the web is credited to its source page, as supplied by the owner)
  const credits = assets.filter(a => shown.has(a.id) && (a.origin !== 'upload' || a.ownerAffirmed || a.ownerPicked) && !a.cutoutOf).map(a => ({ asset: a.id, title: cap(a.title, 200), author: cap(a.author, 200), license: a.ownerPicked ? 'no licence stated; chosen by the page owner' : a.origin === 'upload' ? 'supplied by the page owner, who holds the rights' : cap(a.license, 80), url: /^https:\/\//.test(a.pageUrl || '') ? a.pageUrl : '', licenseUrl: /^https?:\/\//.test(a.licenseUrl || '') ? a.licenseUrl : '' }));
  const derived = assets.filter(a => shown.has(a.id) && a.cutoutOf).map(a => ({ asset: a.id, from: a.cutoutOf, note: 'background removed by SiteRemade' }));
  const plan = {
    v: 2, identity, concept, palette, type, atmosphere, motion, thread, scenes, wants, limitations, assetNotes, imagery,
    // the layout rules a plan was composed under: a saved page keeps its geometry; only an explicit recompose updates it
    layout: { version: safety ? num(p.layout && p.layout.version, 0, 99, 0) : LAYOUT_VERSION },
    // how the words were checked against the facts (set by the direction; carried, never invented here)
    ...(p.claims && typeof p.claims === 'object' ? { claims: { status: oneOf(p.claims.status, ['verified', 'partial', 'unchecked', 'off'], 'unchecked'), checked: num(p.claims.checked, 0, 999, 0), of: num(p.claims.of, 0, 999, 0), removed: num(p.claims.removed, 0, 999, 0), calls: num(p.claims.calls, 0, 9, 0) } } : {}),
    facts: facts.map(f => ({ id: f.id, text: cap(f.text, 600), section: cap(f.section, 80) })),
    // where the facts came from: the plan's own list, else the article the facts were read from (the director does not
    // write sources; without this a page cited facts and credited nothing -- Wikipedia text is CC BY-SA and needs credit)
    sources: (Array.isArray(p.sources) && p.sources.length ? p.sources : c.page && c.page.title && facts.length ? [c.page] : []).slice(0, 6).filter(s => s && s.title).map(s => ({ title: cap(s.title, 200), url: /^https:\/\//.test(s.url || '') ? cap(s.url, 400) : '', license: cap(s.license, 80) || (/^https:\/\/[a-z-]+\.wikipedia\.org\//.test(s.url || '') ? 'CC BY-SA 4.0' : ''), retrieved: cap(s.retrieved, 40) })),
    credits, derived,
    direction: p.direction && typeof p.direction === 'object' ? { source: oneOf(p.direction.source, ['ai', 'mock'], 'ai'), model: cap(p.direction.model, 60), at: cap(p.direction.at, 40), attempt: num(p.direction.attempt, 1, 9, 1), repaired: !!p.direction.repaired, seed: cap(p.direction.seed, 40) } : { source: 'ai', model: '', at: '', attempt: 1, repaired: false, seed: '' },
    ...(p.fixture ? { fixture: cap(p.fixture, 160) } : {}),
  };
  return { plan, fixes, warnings, errors };
}

function sceneInk(bg, P) {
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
