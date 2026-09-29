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
  loop: ['float', 'sway', 'swim', 'breathe', 'drift', 'spin', 'pulse', 'orbit', 'bob', 'none'],
  scroll: ['none', 'parallax', 'drift-x', 'rise', 'sink', 'zoom-in', 'zoom-out', 'rotate', 'pass-through', 'reveal'],
  copyKind: ['sourced', 'supplied', 'imagined'],
  matches: ['yes', 'partly', 'no', 'unsure'],
};
const LIMITS = { scenes: [2, 9], layersPerScene: 6, layersTotal: 32, pinned: 3, loopsPerScene: 2, scrollPerScene: 4, items: 6, photoUses: 2, cutoutUses: 3, heading: 110, body: 520, item: 260, kicker: 70 };
// where each text region sits on a desktop scene (x, y, w, h in % of the scene)
const REGION_BOXES = { left: [5, 16, 42, 68], right: [53, 16, 42, 68], center: [16, 24, 68, 52], 'bottom-left': [5, 56, 52, 38], 'bottom-right': [43, 56, 52, 38], bottom: [10, 62, 80, 32], 'top-left': [5, 8, 52, 38], 'top-right': [43, 8, 52, 38], top: [10, 8, 80, 32] };
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
function numbersIn(t) {
  const out = new Set(); const s = String(t || '').toLowerCase().replace(/(\d),(\d{3})/g, '$1$2');
  (s.match(/\d+(?:\.\d+)?/g) || []).forEach(n => out.add(String(+n)));
  s.replace(/\b(twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)[- ](one|two|three|four|five|six|seven|eight|nine)\b/g, (m, a, b) => { out.add(String(NUMW[a] + NUMW[b])); return ' '; })
    .split(/[^a-z]+/).forEach(w => { if (NUMW[w] && NUMW[w] > 2) out.add(String(NUMW[w])); });
  return out;
}

function validatePlan2(raw, ctx) {
  const c = ctx || {}; const fixes = [], warnings = [], errors = [];
  const p = raw && typeof raw === 'object' ? raw : {};
  const assets = (c.assets || []).filter(a => a && a.id && !a.removed && !a.failed);
  const byId = new Map(assets.map(a => [a.id, a]));
  const facts = (c.facts || []).filter(f => f && f.id && f.text); const factIds = new Set(facts.map(f => f.id));
  const u = c.understanding || {}; const personal = (p.identity && p.identity.kind === 'personal') || u.kind === 'personal';

  // ---- identity, concept, look ----
  const identity = { name: cap(p.identity && p.identity.name, 120) || cap(u.subject, 120), kind: oneOf(p.identity && p.identity.kind, ['recognizable', 'fictional', 'personal', 'invented'], u.kind === 'ambiguous' ? 'recognizable' : (u.kind || 'recognizable')), note: cap(p.identity && p.identity.note, 200) };
  if (personal) identity.kind = 'personal';
  const concept = { title: cap(p.concept && p.concept.title, 80), logline: cap(p.concept && p.concept.logline, 300), why: cap(p.concept && p.concept.why, 300) };
  if (!concept.logline) errors.push('concept: no logline -- say what the page is, in one or two sentences');
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
  let sourcedLines = 0, uncited = 0;
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
    const text = { kicker: cap(tx.kicker, LIMITS.kicker), heading: clean(tx.heading), body: clean(tx.body), kind: oneOf(tx.kind, VOCAB.copyKind, 'imagined'), cite: factIds.has(tx.cite) ? tx.cite : null, region: oneOf(tx.region, VOCAB.region, si === 0 ? 'left' : 'center'), size: oneOf(tx.size, VOCAB.textSize, si === 0 ? 'display' : 'large'), width: oneOf(tx.width, VOCAB.textWidth, 'medium'), list: oneOf(tx.list, VOCAB.list, 'plain'), entrance: oneOf(tx.entrance, VOCAB.textEntrance, 'rise'), items: [] };
    if (text.heading.length > LIMITS.heading) { errors.push(`${where}: heading is ${text.heading.length} characters (max ${LIMITS.heading}) -- write a shorter one, never cut it off`); text.heading = text.heading.slice(0, LIMITS.heading); }
    if (text.body.length > LIMITS.body) { errors.push(`${where}: body is ${text.body.length} characters (max ${LIMITS.body})`); text.body = ''; }
    if (text.body && text.kind === 'sourced') { sourcedLines++; if (!text.cite) { uncited++; fixes.push(`${where}: an uncited "sourced" paragraph was removed`); text.body = ''; } }
    if (text.body && text.kind === 'imagined' && ATTRIBUTED_QUOTE.test(text.body)) { fixes.push(`${where}: an invented quotation was removed`); text.body = ''; }
    // a paragraph that cites a real fact rests on it: it is sourced, whatever the model labelled it
    if (text.body && text.kind === 'imagined' && text.cite) { text.kind = 'sourced'; fixes.push(`${where}: a paragraph citing ${text.cite} is marked as sourced`); }
    // an "imagined" paragraph that states numbers: they must come from a fact (then it is sourced, and cited) -- or it goes back
    if (text.body && text.kind === 'imagined' && facts.length) {
      const nums = [...numbersIn(text.body)];
      if (nums.length) {
        const best = facts.map(f => ({ f, hit: nums.filter(n => numbersIn(f.text).has(n)).length })).sort((a, b) => b.hit - a.hit)[0];
        if (best && best.hit === nums.length) { text.kind = 'sourced'; text.cite = best.f.id; fixes.push(`${where}: a paragraph restating ${best.f.id} is marked as sourced and cited`); }
        else errors.push(`${where}: the "imagined" paragraph states numbers (${nums.join(', ')}) that no given fact supports -- cite the fact or remove the numbers`);
      }
    }
    if (personal && text.body && text.kind === 'sourced' && !/general|in general|most |many |typically/i.test(`${text.kicker} ${text.heading}`)) warnings.push(`${where}: a sourced paragraph on a personal page -- make sure it reads as general, not about them`);
    if (text.body && text.kind === 'supplied' && c.supplied && suppliedShare(text.body, c.supplied) < 0.5) { text.kind = 'imagined'; fixes.push(`${where}: a paragraph labelled as the owner's words is mostly new wording -- labelled imagined`); }
    (Array.isArray(tx.items) ? tx.items : []).slice(0, LIMITS.items).forEach(it => {
      if (!it || typeof it !== 'object') return;
      const item = { label: cap(it.label, 40), text: clean(it.text), kind: oneOf(it.kind, VOCAB.copyKind, 'imagined'), cite: factIds.has(it.cite) ? it.cite : null };
      if (!item.text) return;
      if (item.kind === 'imagined' && item.cite) item.kind = 'sourced'; // cites a real fact: it rests on it
      if (item.text.length > LIMITS.item) { fixes.push(`${where}: a ${item.text.length}-character line was left out (never cut mid-sentence)`); return; }
      if (item.kind === 'sourced') { sourcedLines++; if (!item.cite) { uncited++; fixes.push(`${where}: an uncited "sourced" line was removed`); return; } }
      if (item.kind === 'imagined' && ATTRIBUTED_QUOTE.test(item.text)) { fixes.push(`${where}: an invented quotation was removed`); return; }
      if (item.kind === 'supplied' && c.supplied && suppliedShare(item.text, c.supplied) < 0.5) { item.kind = 'imagined'; fixes.push(`${where}: a line labelled as the owner's words is mostly new wording -- labelled imagined`); }
      text.items.push(item);
    });
    if (tx.items && tx.items.length > LIMITS.items) fixes.push(`${where}: only the first ${LIMITS.items} lines kept`);
    // a numbered list already numbers its lines
    if (text.list === 'numbered') text.items.forEach(it => { if (/^\d+\.?$/.test(it.label)) it.label = ''; });
    if (si === 0 && !text.heading) errors.push('hero: the first scene needs a heading (the page title)');
    // layers
    let layers = (Array.isArray(rs.layers) ? rs.layers : []).slice(0, LIMITS.layersPerScene).map((rl, li) => {
      if (!rl || typeof rl !== 'object') return null;
      const kind = oneOf(rl.kind, VOCAB.layerKind, rl.asset ? 'image' : 'shape');
      const role = oneOf(rl.role, VOCAB.role, li === 0 ? 'focal' : 'support');
      const e = rl.entrance || {}, l = rl.loop || {}, s = rl.scroll || {};
      const L = {
        id: id(rl.id, `l${li + 1}`), kind, role,
        box: { d: box(rl.box && rl.box.d, [50, 10, 40, 80], role === 'backdrop' || role === 'texture'), m: box(rl.box && rl.box.m, [10, 10, 80, 80], role === 'backdrop' || role === 'texture') },
        z: Math.round(num(rl.z, 1, 9, role === 'focal' ? 5 : role === 'backdrop' ? 1 : 3)), rotate: num(rl.rotate, -45, 45, 0), opacity: num(rl.opacity, 0.05, 1, 1),
        mask: oneOf(rl.mask, VOCAB.mask, 'none'), treatment: oneOf(rl.treatment, VOCAB.treatment, 'none'),
        entrance: { kind: oneOf(e.kind, VOCAB.entrance, 'fade'), delay: num(e.delay, 0, 4, 0.2), dur: num(e.dur, 0.2, 3, 1.1) },
        loop: { kind: oneOf(l.kind, VOCAB.loop, 'none'), amp: num(l.amp, 0, 3, 1), period: num(l.period, 3, 30, 9) },
        scroll: { kind: oneOf(s.kind, VOCAB.scroll, 'none'), amount: num(s.amount, -1, 1, 0.4) },
        hideM: !!rl.hideM,
      };
      // the outer margin belongs to the thread that runs down the page: layers stay inside it unless they are full-bleed
      if (role !== 'backdrop' && role !== 'texture' && L.box.d[2] <= 90) { const b = L.box.d; const x = Math.max(5, Math.min(95 - b[2], b[0])); if (x !== b[0]) L.box.d = [x, b[1], b[2], b[3]]; }
      if (kind === 'image') {
        const a = byId.get(rl.asset);
        if (!a) { (role === 'focal' ? errors : warnings).push(`${where}: picture "${cap(rl.asset, 40)}" does not exist${role === 'focal' ? ' -- use an asset from the inventory or a shape/word focal' : ' -- layer removed'}`); return null; }
        if (verdictOf(a) === 'no') { fixes.push(`${where}: ${a.id} does not show the subject (the director's own look at it) -- layer removed`); return null; }
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
    // motion budget: a focal point, supporting movement and rest -- not everything moving at once
    let loops = 0, scrolls = 0;
    layers.sort((a, b) => (a.role === 'focal' ? -1 : 0) - (b.role === 'focal' ? -1 : 0));
    layers.forEach(L => {
      if (L.loop.kind !== 'none') { if (loops >= LIMITS.loopsPerScene) { L.loop.kind = 'none'; fixes.push(`${where}: ${L.id} held still (at most ${LIMITS.loopsPerScene} moving layers per scene)`); } else loops++; }
      if (L.scroll.kind !== 'none') { if (scrolls >= LIMITS.scrollPerScene) L.scroll.kind = 'none'; else scrolls++; }
    });
    if (motion.tempo === 'still') layers.forEach(L => { L.loop.kind = 'none'; });
    if (layersTotal + layers.length > LIMITS.layersTotal) { layers = layers.slice(0, Math.max(0, LIMITS.layersTotal - layersTotal)); fixes.push(`${where}: layer budget reached`); }
    layersTotal += layers.length;
    if (pin && !layers.some(L => L.scroll.kind !== 'none')) { pin = false; pinned--; fixes.push(`${where}: pinned without anything moving on scroll -- unpinned`); }
    const bg = rs.background || {};
    const scene = {
      id: sid, name: cap(rs.name, 60), purpose: cap(rs.purpose, 240), link: cap(rs.link, 240), navLabel: cap(rs.navLabel, 24),
      height, pin, camera: oneOf(rs.camera, VOCAB.camera, 'none'), background: oneOf(bg.style || rs.background, VOCAB.sceneBg, si === 0 ? 'base' : 'base'), atmosphere: !!rs.atmosphere || si === 0,
      mobile: { order: oneOf(rs.mobile && rs.mobile.order, VOCAB.mobileOrder, si === 0 ? 'text-first' : 'text-first') },
      text, layers,
    };
    if (si === 0) scene.cta = cap(rs.cta, 40) || 'Begin';
    if (!scene.purpose) warnings.push(`${where}: no stated purpose`);
    compose(scene, byId, fixes, warnings, si === 0);
    return scene;
  }).filter(Boolean);
  if (scenes.length && !scenes[0].layers.some(L => L.role === 'focal')) {
    // no focal in the hero: the heaviest layer becomes it, else the page title itself carries the scene
    const heavy = scenes[0].layers.slice().sort((a, b) => area(b.box.d) - area(a.box.d))[0];
    if (heavy) { heavy.role = 'focal'; fixes.push('hero: the largest layer made the focal point'); } else warnings.push('hero: no picture or drawn focal -- the title carries the first scene');
  }
  if (sourcedLines && uncited / sourcedLines > 0.4) errors.push(`copy: ${uncited} of ${sourcedLines} "sourced" lines had no valid fact id -- cite the fact ids given, or mark the line imagined`);
  if (!scenes.some(s => s.text.heading || s.text.body || s.text.items.length)) errors.push('copy: the page has no words');
  // a scene's asset used on a background colour that clashes: accent/invert scenes get their own text colour
  scenes.forEach(s => { s.ink = sceneInk(s.background, palette); });
  // a cut-out subject almost the colour of its stage (a black silhouette on a dark scene) gets a light rim so it reads
  scenes.forEach(s => s.layers.forEach(L => {
    const a = L.kind === 'image' && byId.get(L.asset); if (!a || !(a.cutout || (a.assess && a.assess.transparent)) || !(a.assess && typeof a.assess.luminance === 'number')) return;
    const hx = s.ink.surface; const stage = 0.2126 * parseInt(hx.slice(1, 3), 16) + 0.7152 * parseInt(hx.slice(3, 5), 16) + 0.0722 * parseInt(hx.slice(5, 7), 16); // same scale as assess.luminance
    if (Math.abs(a.assess.luminance - stage) < 45 && (L.treatment === 'none' || L.treatment === 'shadow')) { L.treatment = 'glow'; fixes.push(`scene ${s.id}: ${a.id} nearly matches its background -- given a light rim to stay visible`); }
  }));
  // credits for every picture shown, limited to those
  const shown = new Set(); scenes.forEach(s => s.layers.forEach(L => { if (L.asset) { shown.add(L.asset); const a = byId.get(L.asset); if (a && a.cutoutOf) shown.add(a.cutoutOf); } }));
  const credits = assets.filter(a => shown.has(a.id) && a.origin !== 'upload' && !a.cutoutOf).map(a => ({ asset: a.id, title: cap(a.title, 200), author: cap(a.author, 200), license: cap(a.license, 80), url: /^https:\/\//.test(a.pageUrl || '') ? a.pageUrl : '', licenseUrl: /^https?:\/\//.test(a.licenseUrl || '') ? a.licenseUrl : '' }));
  const derived = assets.filter(a => shown.has(a.id) && a.cutoutOf).map(a => ({ asset: a.id, from: a.cutoutOf, note: 'background removed by SiteRemade' }));
  const plan = {
    v: 2, identity, concept, palette, type, atmosphere, motion, thread, scenes, wants, limitations, assetNotes,
    facts: facts.map(f => ({ id: f.id, text: cap(f.text, 600), section: cap(f.section, 80) })),
    sources: Array.isArray(p.sources) ? p.sources.slice(0, 6).filter(s => s && s.title).map(s => ({ title: cap(s.title, 200), url: /^https:\/\//.test(s.url || '') ? cap(s.url, 400) : '', license: cap(s.license, 80), retrieved: cap(s.retrieved, 40) })) : [],
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
function compose(scene, byId, fixes, warnings, hero) {
  const focal = scene.layers.find(L => L.role === 'focal'); if (!focal) return;
  const asset = focal.asset ? byId.get(focal.asset) : null;
  const rect = k => (focal.kind === 'image' ? drawnRect(focal, asset, k) : focal.box[k].slice());
  const min = hero ? MIN_FOCAL.hero : MIN_FOCAL.scene;
  for (let i = 0; i < 4 && area(rect('d')) < min && focal.role !== 'backdrop'; i++) {
    const b = focal.box.d; const g = Math.min(3, Math.max(1.05, Math.sqrt(min / Math.max(1, area(rect('d')))) * 1.03));
    const w = Math.min(100, b[2] * g), h = Math.min(100, b[3] * g); focal.box.d = box([b[0] - (w - b[2]) / 2, b[1] - (h - b[3]) / 2, w, h], b);
    if (i === 0) fixes.push(`scene ${scene.id}: focal picture enlarged to stay the main visual`);
  }
  if (focal.role === 'backdrop' || focal.box.d[2] >= 90) return; // a full-bleed focal carries the words over a scrim
  // a ghost word or a faint shape behind the words is a background, not something the words hide
  if (focal.kind === 'word' || (focal.kind === 'shape' && focal.opacity < 0.5)) return;
  if (!(scene.text.heading || scene.text.body || scene.text.items.length)) return;
  let tb = REGION_BOXES[scene.text.region]; let r = rect('d');
  if (overlap(r, tb) > area(r) * 0.06) {
    // move the focal to the other side of the words, else move the words
    const b = focal.box.d; const cx = tb[0] + tb[2] / 2;
    const target = cx < 50 ? Math.max(tb[0] + tb[2] + 2, 100 - b[2]) : Math.min(tb[0] - b[2] - 2, 0);
    const moved = box([cx < 50 ? Math.min(target, 100 - b[2]) : Math.max(0, target), b[1], b[2], b[3]], b);
    const trial = Object.assign({}, focal, { box: Object.assign({}, focal.box, { d: moved }) });
    const r2 = focal.kind === 'image' ? drawnRect(trial, asset, 'd') : moved;
    if (overlap(r2, tb) <= area(r2) * 0.06) { focal.box.d = moved; fixes.push(`scene ${scene.id}: focal moved clear of the words`); }
    else {
      const other = OPPOSITE[scene.text.region]; if (overlap(r, REGION_BOXES[other]) <= area(r) * 0.06) { scene.text.region = other; fixes.push(`scene ${scene.id}: words moved clear of the focal`); }
      else { scene.text.scrim = true; warnings.push(`scene ${scene.id}: words sit over the focal picture -- a scrim keeps them readable`); }
    }
  }
  // secondaries never cover the words
  tb = REGION_BOXES[scene.text.region];
  scene.layers.forEach(L => { if (L === focal || L.role === 'backdrop' || L.role === 'texture') return; const lr = L.kind === 'image' ? drawnRect(L, byId.get(L.asset), 'd') : L.box.d; if (overlap(lr, tb) > area(lr) * 0.25 && L.opacity > 0.35) { L.opacity = 0.3; L.z = Math.min(L.z, 2); fixes.push(`scene ${scene.id}: ${L.id} faded behind the words`); } });
}

module.exports = { validatePlan2, VOCAB, LIMITS, REGION_BOXES, contrast, sceneInk };
