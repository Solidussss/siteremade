'use strict';
// CREATIVE — the motion-first composition layer (shared: server validation, studio bundle, tests).
//
// A layout archetype (archetypes.js) says where things REST. A composition says what the scene IS while it plays: what
// dominates the screen, what moves, what stays fixed, what transforms, what enters and leaves, and what it becomes for the
// next scene. It sits above the layouts: each composition is staged on a base archetype (an existing one, or one of the
// few made for it) and adds ONE coordinated set of plane tracks over the held scene's progress -- a camera with depth, not
// five unrelated animations. Everything here is data from fixed vocabularies with bounded numbers: a model may NAME a
// composition, never describe motion; the renderer computes the tracks from the name and the measured pictures.
//
//   COMPOSITIONS, SPEC[name]          the vocabulary
//   ARC                                a page's visual rhythm (hook, transformation, reveal, breath, escalation, takeover,
//                                      payoff) -- planned with the compositions
//   TYPE_ACTS                          what the words do as part of the composition
//   artDirection(understanding)        what the subject IS, visually (traits that weight the compositions)
//   planPage(scenes, ctx)              art.js: a composition (and arc role) per scene, from the pictures that exist
//   fit(comp, x)                       whether a scene's pictures can carry a composition (x: what the scene has)
//   baseFor(comp, x)                   the archetype a composition is staged on, for those pictures
//   audit(plan) / repairs(...)         the page-level structure rules (too editorial, no takeover, ...)
//   tracks(scene, si, ctx)             the renderer's plane keyframes (bounded numbers)
//   metrics(plan)                      structural metrics of a page (tests, QA, the report)

const F = require('./framing');

const COMPOSITIONS = ['object-stage', 'fullscreen-subject', 'image-takeover', 'depth-stack', 'orbit-stage', 'split-transform', 'type-takeover', 'mask-stage', 'tunnel-stage', 'gallery-collapse', 'perspective-lineup', 'floating-canvas', 'cinematic-chapter', 'image-wall', 'object-focus'];
const ARC = ['hook', 'transformation', 'reveal', 'breath', 'escalation', 'takeover', 'payoff'];
const TYPE_ACTS = ['none', 'word-takeover', 'word-mask', 'letter-spread', 'word-stack', 'vertical', 'baseline', 'behind-subject', 'depth', 'pinned', 'word-replace', 'scale-through', 'edge'];
const CAMERAS = ['hold', 'push', 'pull', 'lateral', 'orbit', 'fly-through', 'zoom-through', 'rise'];
// how the words serve the composition: a label (small, at an edge), a statement (large, short), the headline pinned while
// the visual changes, giant type that is the visual -- or, in a breath, ordinary reading copy
const TEXT_ROLES = ['label', 'statement', 'pinned', 'giant', 'reading'];
// the most body text each role SHOWS as reading copy; longer words become a caption revealed late in the scene (nothing is
// dropped -- the facts stay on the page, the picture leads)
const COPY = { label: 90, statement: 160, pinned: 120, giant: 0, reading: 520 };

// ---------------------------------------------------------------- the vocabulary
// planes: subject (the focal picture), bg (environment / backdrop / decoration behind), fg (supporting pictures in front),
// type (a giant word layer on the stage), text (the scene's words). A key is [p, x vw, y vh, s, r deg, o, c, ry deg]:
// p the held scene's progress, c how CLOSED the plane's window is (1 = only its window shows, 0 = the whole plane).
// `rest` is the progress the composition reads best at: shown with reduced motion and without scripts.
const K = (p, x, y, s, r, o, c, ry) => [p, x || 0, y || 0, s == null ? 1 : s, r || 0, o == null ? 1 : o, c || 0, ry || 0];
const SPEC = {
  'object-stage': {
    what: 'the subject alone at the centre of the screen while its world changes around it', dominant: 'subject', needs: ['cut'], intensity: 'stage', hold: true, camera: 'push',
    frame: 'cutout', text: 'label', act: 'behind-subject', becomes: 'depth-handoff', fixed: 'the subject', moves: 'the giant name behind it and the light around it', arcs: ['hook', 'reveal', 'payoff'], rest: 0.45,
    planes: { subject: [K(0, 0, 7, 0.84, -3), K(0.45, 0, 0, 1, 0), K(1, 0, -3, 1.12, 3)], type: [K(0, 9, 0, 0.92, 0, 0.3), K(0.45, 0, 0, 1, 0, 0.9), K(1, -9, 0, 1.12, 0, 0.55)], bg: [K(0, 0, 0, 1.1), K(1, 0, 0, 1)], text: [K(0, 0, 4, 1, 0, 0), K(0.3, 0, 0, 1, 0, 1), K(1, 0, -2, 1, 0, 1)] },
  },
  'fullscreen-subject': {
    what: 'one picture of the subject owns the whole screen; the camera pushes in', dominant: 'image', needs: ['bleed|cut'], intensity: 'takeover', hold: true, camera: 'push',
    frame: 'bleed', text: 'label', act: 'none', becomes: 'image-expand', fixed: 'the words at the edge', moves: 'the camera toward the subject', arcs: ['hook', 'takeover', 'payoff'], rest: 0.3,
    planes: { subject: [K(0, 0, 0, 1), K(1, 0, 0, 1.14)], fg: [K(0, -4, 0, 1.05), K(1, 6, 0, 1.2)], text: [K(0, 0, 3, 1, 0, 0), K(0.15, 0, 0, 1, 0, 1), K(0.8, 0, 0, 1, 0, 1), K(1, 0, -4, 1, 0, 0)] },
  },
  'image-takeover': {
    what: 'a picture first seen as a window in the empty side opens until it owns the screen', dominant: 'image', needs: ['bleed'], intensity: 'takeover', hold: true, camera: 'push',
    frame: 'expand', text: 'pinned', act: 'pinned', becomes: 'image-expand', fixed: 'the headline', moves: 'the window, opening to full bleed', arcs: ['transformation', 'takeover'], rest: 0,
    window: [56, 16, 34, 58],
    planes: { subject: [K(0, 0, 0, 1.06, 0, 1, 1), K(0.6, 0, 0, 1, 0, 1, 0), K(1, 0, 0, 1.05, 0, 1, 0)], text: [K(0), K(1)] },
  },
  'depth-stack': {
    what: 'foreground, subject, words and background on separate planes: the background recedes, a foreground passes', dominant: 'subject', needs: ['cut'], intensity: 'hit', hold: true, camera: 'push',
    frame: 'cutout', text: 'statement', act: 'depth', becomes: 'depth-handoff', fixed: 'nothing: every plane moves at its own depth', moves: 'the camera, through the planes', arcs: ['reveal', 'escalation'], rest: 0.5,
    planes: { bg: [K(0, 0, 0, 1.16), K(1, 0, 0, 1)], subject: [K(0, 0, 8, 0.9), K(0.5, 0, 0, 1), K(1, 0, -6, 1.12)], fg: [K(0, -26, 8, 1.25), K(1, 26, -8, 1.45)], text: [K(0, 0, 3, 1), K(1, 0, -5, 1)] },
  },
  'orbit-stage': {
    what: 'the subject stays fixed at the centre while its lines turn around it', dominant: 'subject', needs: ['items'], intensity: 'stage', hold: true, camera: 'orbit',
    frame: 'cutout', text: 'reading', act: 'none', becomes: 'color-bleed', fixed: 'the subject', moves: 'the ring of lines and light around it', arcs: ['reveal', 'escalation'], rest: 0.5,
    planes: { subject: [K(0, 0, 0, 1, -4), K(1, 0, 0, 1.06, 4)], bg: [K(0, 0, 0, 1, -30), K(1, 0, 0, 1.1, 30)] },
  },
  'split-transform': {
    what: 'it begins as a split; the picture half takes over the screen and the words step out', dominant: 'image', needs: ['bleed'], intensity: 'hit', hold: true, camera: 'lateral',
    frame: 'expand', text: 'statement', act: 'none', becomes: 'image-expand', fixed: 'the picture', moves: 'its frame, from half to the whole screen', arcs: ['transformation'], rest: 0,
    window: [50, 0, 50, 100],
    planes: { subject: [K(0, 0, 0, 1.04, 0, 1, 1), K(0.62, 0, 0, 1, 0, 1, 0), K(1, 0, 0, 1.04, 0, 1, 0)], text: [K(0), K(0.3, 0, 0, 1, 0, 1), K(0.6, -10, 0, 1, 0, 0), K(1, -10, 0, 1, 0, 0)] },
  },
  'type-takeover': {
    what: 'a few words fill the screen; the subject rises behind them, then the type scales through the camera', dominant: 'type', needs: ['short'], intensity: 'takeover', hold: true, camera: 'zoom-through',
    frame: 'cutout', text: 'giant', act: 'scale-through', becomes: 'shape-takeover', fixed: 'the words, until they pass the camera', moves: 'the subject behind the type, then the type itself', arcs: ['takeover', 'hook', 'escalation'], rest: 0.4,
    planes: { text: [K(0, 0, 0, 0.86, 0, 0), K(0.2, 0, 0, 1, 0, 1), K(0.68, 0, 0, 1.08, 0, 1), K(1, 0, 0, 3.4, 0, 0)], type: [K(0, 0, 0, 0.86, 0, 0), K(0.2, 0, 0, 1, 0, 1), K(0.68, 0, 0, 1.08, 0, 1), K(1, 0, 0, 3.4, 0, 0)], subject: [K(0, 0, 26, 0.82, 0, 0), K(0.35, 0, 8, 0.96, 0, 1), K(0.75, 0, -4, 1.06, 0, 1), K(1, 0, -16, 1.16, 0, 1)] },
  },
  'mask-stage': {
    what: 'the picture is seen only through the words; the words grow until the picture is the whole screen', dominant: 'type', needs: ['bleed', 'short'], intensity: 'takeover', hold: true, camera: 'zoom-through',
    frame: 'mask', text: 'giant', act: 'word-mask', becomes: 'image-expand', fixed: 'the picture behind the mask', moves: 'the masking words, toward the camera', arcs: ['transformation', 'takeover'], rest: 0.2,
    planes: { text: [K(0, 0, 0, 0.94), K(0.5, 0, 0, 1.5), K(0.82, 0, 0, 5.5, 0, 0), K(1, 0, 0, 6, 0, 0)], type: [K(0, 0, 0, 0.94), K(0.5, 0, 0, 1.5), K(0.82, 0, 0, 5.5, 0, 0), K(1, 0, 0, 6, 0, 0)], subject: [K(0, 0, 0, 1.12, 0, 0), K(0.6, 0, 0, 1.08, 0, 0), K(0.84, 0, 0, 1.02, 0, 1), K(1, 0, 0, 1, 0, 1)] },
  },
  'tunnel-stage': {
    what: 'pictures arranged in depth along one axis; the camera flies through them', dominant: 'images', needs: ['three'], intensity: 'hit', hold: true, camera: 'fly-through',
    frame: 'depth', text: 'label', act: 'none', becomes: 'card-expand', fixed: 'the axis', moves: 'the camera, past each picture', arcs: ['escalation'], rest: 0.3, keepChoreo: 'cardstream',
    planes: { bg: [K(0, 0, 0, 1), K(1, 0, 0, 1.3)], text: [K(0, 0, 0, 1, 0, 1), K(0.8, 0, 0, 1, 0, 1), K(1, 0, -4, 1, 0, 0)] },
  },
  'gallery-collapse': {
    what: 'a wall of pictures collapses inward into one subject that takes the screen', dominant: 'images', needs: ['three', 'bleed'], intensity: 'takeover', hold: true, camera: 'push',
    frame: 'expand', text: 'statement', act: 'none', becomes: 'image-expand', fixed: 'the chosen picture', moves: 'the others, into it', arcs: ['takeover', 'transformation', 'escalation'], rest: 0, collapse: true,
    planes: { subject: [K(0, 0, 0, 1, 0, 1, 1), K(0.35, 0, 0, 1, 0, 1, 1), K(0.8, 0, 0, 1, 0, 1, 0), K(1, 0, 0, 1.04, 0, 1, 0)], text: [K(0, 0, 0, 1, 0, 1), K(0.4, 0, 0, 1, 0, 1), K(0.62, 0, -4, 1, 0, 0), K(1, 0, -4, 1, 0, 0)] },
  },
  'perspective-lineup': {
    what: 'the subject and its kin in a row in perspective; the row converges and the centre one comes forward', dominant: 'images', needs: ['three'], intensity: 'stage', hold: true, camera: 'orbit',
    frame: 'cutout', text: 'label', act: 'none', becomes: 'actor-carry', fixed: 'the centre of the row', moves: 'the row, turning toward the centre', arcs: ['reveal', 'escalation', 'payoff'], rest: 0.6, lineup: true,
    planes: { subject: [K(0, 0, 4, 0.92), K(0.6, 0, 0, 1.08), K(1, 0, -2, 1.18)], text: [K(0, 0, 0, 1, 0, 0), K(0.3, 0, 0, 1, 0, 1), K(1, 0, 0, 1, 0, 1)] },
  },
  'floating-canvas': {
    what: 'pictures float free of frames at different depths, drifting past one another', dominant: 'images', needs: ['two'], intensity: 'stage', hold: false, camera: 'rise',
    frame: 'unframed', text: 'statement', act: 'baseline', becomes: 'depth-handoff', fixed: 'the words', moves: 'each picture at its own depth', arcs: ['escalation', 'breath', 'reveal'], rest: 0.5, drift: true,
    planes: { subject: [K(0, 0, 6, 1), K(1, 0, -6, 1.04)], text: [K(0), K(1)] },
  },
  'cinematic-chapter': {
    what: 'a full-bleed chapter with a small label; the camera pushes in and zooms through into the next', dominant: 'image', needs: ['bleed'], intensity: 'hit', hold: true, camera: 'zoom-through',
    frame: 'bleed', text: 'label', act: 'pinned', becomes: 'image-expand', fixed: 'the label', moves: 'the camera, through the picture', arcs: ['hook', 'reveal', 'breath', 'payoff'], rest: 0.25,
    planes: { subject: [K(0, 0, 0, 1), K(0.7, 0, 0, 1.08), K(1, 0, 0, 1.14)], text: [K(0, 0, 2, 1, 0, 0), K(0.12, 0, 0, 1, 0, 1), K(0.86, 0, 0, 1, 0, 1), K(1, 0, 0, 1, 0, 0)] },
  },
  'image-wall': {
    what: 'a wall of pictures edge to edge; the camera pushes into one tile until it is the screen', dominant: 'images', needs: ['three'], intensity: 'takeover', hold: true, camera: 'zoom-through',
    frame: 'wall', text: 'label', act: 'none', becomes: 'image-expand', fixed: 'the chosen tile', moves: 'the camera, into it', arcs: ['escalation', 'payoff', 'takeover'], rest: 0, wall: true,
    planes: { text: [K(0, 0, 0, 1, 0, 1), K(0.45, 0, 0, 1, 0, 1), K(0.7, 0, -3, 1, 0, 0), K(1, 0, -3, 1, 0, 0)] },
  },
  'object-focus': {
    what: 'the subject at the centre, then the camera moves in until a detail of it fills the screen', dominant: 'subject', needs: ['zoom'], intensity: 'hit', hold: true, camera: 'push',
    frame: 'detail', text: 'label', act: 'edge', becomes: 'image-expand', fixed: 'the label at the edge', moves: 'the camera, into the detail', arcs: ['transformation', 'reveal'], rest: 0.2, focus: true,
    planes: { subject: [K(0, 0, 0, 1), K(0.3, 0, 0, 1.02), K(1, 0, 0, 1.6)], text: [K(0, 0, 0, 1, 0, 1), K(0.55, 0, 0, 1, 0, 1), K(0.86, 0, 0, 1, 0, 0), K(1, 0, 0, 1, 0, 0)] },
  },
};

// the compositions that make a takeover moment, that put a visual full-screen, that centre the subject, that let the words
// lead -- what the page-level rules count
const TAKEOVER = COMPOSITIONS.filter(k => SPEC[k].intensity === 'takeover');
const FULLSCREEN = ['fullscreen-subject', 'image-takeover', 'split-transform', 'mask-stage', 'gallery-collapse', 'cinematic-chapter', 'image-wall'];
const CENTRED = ['object-stage', 'fullscreen-subject', 'depth-stack', 'orbit-stage', 'object-focus', 'type-takeover', 'perspective-lineup'];
const TYPE_LED = ['type-takeover', 'mask-stage'];
const TRANSFORMS = ['image-takeover', 'split-transform', 'mask-stage', 'gallery-collapse', 'object-focus', 'image-wall'];
// the layouts that read as an editorial split (a picture beside a block of copy) and the masks that read as a framed card
const EDITORIAL = ['split', 'framed', 'magazine', 'splitscreen', 'image', 'edge-crop', 'luxe', 'sticky-steps'];
const CARD_MASKS = ['window', 'frame', 'polaroid', 'arch', 'circle', 'torn', 'blob', 'diamond', 'slit', 'porthole'];

// ---------------------------------------------------------------- what the subject IS
// a small lexicon of visual traits, read from what the understanding says the subject is (never from a name alone): each
// trait weights the compositions and sets the field the subject lives in (the page's backdrop and light)
const TRAITS = [
  ['cosmic', /\b(space|cosmic|cosmos|galax(?:y|ies)|universe|stars?|starfield|planets?|nebula|astronaut|interstellar|orbit(?:al)?|void)\b/i, { field: 'void', scale: 'vast', w: { 'fullscreen-subject': 1.6, 'depth-stack': 1.5, 'object-stage': 1.4, 'type-takeover': 1.3, 'tunnel-stage': 1.2, 'floating-canvas': 1.1, 'split-transform': 0.7, 'image-wall': 0.6 } }],
  ['chrome', /\b(chrome|chromed|silver|metal(?:lic)?|steel|mirror(?:ed)?|reflective|liquid metal|polished)\b/i, { light: 'specular', w: { 'object-stage': 1.5, 'object-focus': 1.4, 'depth-stack': 1.1 } }],
  ['speed', /\b(speed|fast|racing|race|surf(?:er|ing|board)?|fly(?:ing)?|flight|rocket|jet|velocity|streak|board)\b/i, { motion: 'streak', w: { 'split-transform': 1.3, 'tunnel-stage': 1.3, 'depth-stack': 1.2, 'fullscreen-subject': 1.2 } }],
  ['product', /\b(product|sneakers?|shoes?|trainers?|cans?|bottles?|gadget|watch(?:es)?|phone|headphones|bag|packaging|flavou?rs?|drink)\b/i, { field: 'studio', w: { 'object-stage': 1.6, 'perspective-lineup': 1.5, 'object-focus': 1.5, 'orbit-stage': 1.3, 'type-takeover': 1.1, 'cinematic-chapter': 0.6 } }],
  ['tech', /\b(tech|technology|software|ai|artificial intelligence|data|digital|interface|cyber|code|network|platform|device|processor|chip)\b/i, { field: 'grid', w: { 'tunnel-stage': 1.5, 'floating-canvas': 1.4, 'type-takeover': 1.4, 'depth-stack': 1.2, 'mask-stage': 1.2 } }],
  ['world', /\b(city|landscape|place|world|building|architecture|island|mountains?|coast|resort|travel|destination|interior)\b/i, { field: 'atmos', w: { 'cinematic-chapter': 1.6, 'image-takeover': 1.4, 'image-wall': 1.3, 'mask-stage': 1.2, 'object-stage': 0.6 } }],
  ['figure', /\b(character|hero|superhero|person|portrait|face|figure|mascot|warrior|herald|creature|robot|man|woman)\b/i, { w: { 'object-stage': 1.4, 'fullscreen-subject': 1.3, 'object-focus': 1.2, 'type-takeover': 1.1 } }],
  ['isolated', /\b(alone|lone|lonely|isolat(?:ed|ion)|solitary|vast|empty|silence|silent)\b/i, { scale: 'vast', w: { 'fullscreen-subject': 1.3, 'object-stage': 1.2 } }],
];
function artDirection(u) {
  const x = u || {}; const text = [x.subject, x.brief, x.identity && x.identity.what, x.visuals && x.visuals.main, ...(x.motifs || []), x.tone && x.tone.register].filter(Boolean).join(' ');
  const traits = []; const w = {}; let field = '', light = '', motion = '', scale = '';
  TRAITS.forEach(([name, re, t]) => { if (!re.test(text)) return; traits.push(name); Object.entries(t.w).forEach(([k, v]) => { w[k] = (w[k] || 1) * v; }); field = field || t.field || ''; light = light || t.light || ''; motion = motion || t.motion || ''; scale = scale || t.scale || ''; });
  return { traits, weights: w, field: field || 'none', light: light || 'none', motion: motion || 'none', scale: scale || 'none' };
}

// ---------------------------------------------------------------- what a scene's pictures can carry
// x: { cut (a clean cut-out of the scene's subject), bleed (a wide photo that can fill the screen), located (a photo whose
// subject was found, with room around it), pictures (distinct pictures the scene can show), items (lines), short (a
// heading or name of a few words), video (the premium hero video is this scene's picture) }
function fit(comp, x) {
  const S = SPEC[comp]; if (!S) return false; const v = x || {};
  return S.needs.every(n => n.split('|').some(k => ({ zoom: !!v.zoom, cut: !!v.cut, bleed: !!v.bleed, located: !!v.located, items: (v.items || 0) >= 3, short: !!v.short, three: (v.pictures || 0) >= 3, two: (v.pictures || 0) >= 2 })[k]));
}
// the archetype a composition is staged on, for the pictures it has (a cut-out stands on a stage; a photo fills the screen)
function baseFor(comp, x) {
  const v = x || {};
  switch (comp) {
    case 'object-stage': return 'object-stage';
    case 'fullscreen-subject': return v.bleed || v.video ? 'editorial-hero' : 'fullscreen-object';
    case 'image-takeover': case 'split-transform': return 'editorial-hero';
    case 'depth-stack': return 'depth-stack';
    case 'orbit-stage': return 'orbit';
    case 'type-takeover': return 'type-stage';
    case 'mask-stage': return 'mask-stage';
    case 'tunnel-stage': return 'cardstream';
    case 'gallery-collapse': case 'image-wall': return 'image-wall';
    case 'perspective-lineup': return 'lineup';
    case 'floating-canvas': return 'canvas';
    case 'cinematic-chapter': return v.bleeds >= 2 ? 'chapters' : 'editorial-hero';
    case 'object-focus': return v.cut ? 'fullscreen-object' : 'editorial-hero';
    default: return 'split';
  }
}
// carryOf(scene, byId, { video, name }) -> what a composed scene's pictures can carry (the x that fit and baseFor read):
// a clean cut-out of its subject, a wide photo that fills the screen (never a studio shot: a photo whose plain background
// gave it a cut-out has nothing to fill a screen with), a located subject, how many pictures, a few words to set giant
const fewWords = (h, n, len) => (h || '').length <= len && (h || '').split(/\s+/).filter(Boolean).length <= n;
function carryOf(scene, byId, o) {
  const opt = o || {}; const all = [...byId.values()]; const base = a => (a && a.cutoutOf && byId.get(a.cutoutOf)) || a;
  const imgs = (scene.layers || []).filter(L => L.kind === 'image' && byId.get(L.asset)); const f = imgs.find(L => L.role === 'focal') || imgs[0];
  const a = f && byId.get(f.asset); const pr = a ? F.profile(a) : null; const studio = b => !!(b && all.some(x => x.cutoutOf === b.id));
  const wide = b => !!(b && !F.profile(b).free && F.canBleed(b, 1.6) && !studio(b));
  const cut = !!(a && (pr.free || all.some(x => x.cutoutOf === base(a).id && x.caps && x.caps.moveFreely && !(x.curation && x.curation.role === 'unrelated'))));
  const name = String(opt.name || ''); const t = scene.text || {};
  const located = !!(pr && !pr.free && !pr.tight && pr.source !== 'unknown' && pr.big);
  // (a detail the camera can move into: a cut-out with the pixels for 1.3x, or a photo whose subject was found)
  const tall = x => !!(x && (x.cutout || (x.assess && x.assess.transparent)) && ((x.assess && x.assess.height) || 0) * 1.15 / 520 >= 1.3);
  const zoom = located || (!!a && pr.free ? tall(a) : !!a && all.some(x => x.cutoutOf === base(a).id && tall(x)));
  return { zoom, cut, bleed: wide(base(a)) || !!opt.video, located, pictures: new Set(imgs.map(L => base(byId.get(L.asset)).id)).size, items: (t.items || []).length,
    short: fewWords(t.heading, 4, 32) || (!!name && fewWords(name, 3, 18)), video: !!opt.video, bleeds: imgs.filter(L => wide(base(byId.get(L.asset)))).length };
}
// how many pictures a composition's base shows (the visual plan assigns them)
const TAKES = { 'object-stage': 1, 'depth-stack': 2, 'type-stage': 1, 'mask-stage': 1, 'image-wall': 5, canvas: 3 };
// every base a composition may be staged on (a scene whose pictures pushed it onto another layout loses the composition)
const BASES = { 'object-stage': ['object-stage'], 'fullscreen-subject': ['editorial-hero', 'fullscreen-object'], 'image-takeover': ['editorial-hero'], 'depth-stack': ['depth-stack'], 'orbit-stage': ['orbit'], 'split-transform': ['editorial-hero'],
  'type-takeover': ['type-stage'], 'mask-stage': ['mask-stage'], 'tunnel-stage': ['cardstream'], 'gallery-collapse': ['image-wall'], 'perspective-lineup': ['lineup'], 'floating-canvas': ['canvas'], 'cinematic-chapter': ['chapters', 'editorial-hero'], 'image-wall': ['image-wall'], 'object-focus': ['fullscreen-object', 'editorial-hero'] };
// the composition a scene's pictures still allow when they cannot carry the one it was given (closest idea first)
const NEAREST = { 'object-stage': ['object-focus', 'fullscreen-subject'], 'depth-stack': ['object-stage', 'fullscreen-subject'], 'type-takeover': ['mask-stage', 'image-takeover'], 'mask-stage': ['type-takeover', 'image-takeover'], 'gallery-collapse': ['image-takeover', 'floating-canvas'], 'image-wall': ['floating-canvas', 'fullscreen-subject'],
  'perspective-lineup': ['floating-canvas', 'object-stage'], 'tunnel-stage': ['floating-canvas', 'depth-stack'], 'floating-canvas': ['fullscreen-subject', 'object-focus'], 'orbit-stage': ['object-stage', 'object-focus'], 'image-takeover': ['fullscreen-subject', 'object-focus'], 'split-transform': ['image-takeover', 'fullscreen-subject'],
  'fullscreen-subject': ['object-focus', 'cinematic-chapter'], 'cinematic-chapter': ['fullscreen-subject', 'image-takeover'], 'object-focus': ['fullscreen-subject', 'object-stage'] };

// ---------------------------------------------------------------- the page's visual rhythm
// not section 1, 2, 3: a hook, a transformation, a reveal, a breath, an escalation, a takeover, a payoff -- sized to the
// page, never two loud beats without a breath between on a long page
// (a few designed arcs per length -- the page picks one, so pages of one length do not all beat the same way)
const ARCS = {
  3: [['hook', 'takeover', 'payoff'], ['hook', 'transformation', 'payoff']],
  4: [['hook', 'transformation', 'takeover', 'payoff'], ['hook', 'reveal', 'takeover', 'payoff'], ['hook', 'takeover', 'breath', 'payoff']],
  5: [['hook', 'transformation', 'breath', 'takeover', 'payoff'], ['hook', 'reveal', 'breath', 'escalation', 'payoff'], ['hook', 'takeover', 'breath', 'reveal', 'payoff']],
  6: [['hook', 'transformation', 'reveal', 'breath', 'takeover', 'payoff'], ['hook', 'reveal', 'breath', 'transformation', 'takeover', 'payoff'], ['hook', 'takeover', 'breath', 'reveal', 'escalation', 'payoff']],
  7: [['hook', 'transformation', 'reveal', 'breath', 'escalation', 'takeover', 'payoff'], ['hook', 'reveal', 'transformation', 'breath', 'takeover', 'escalation', 'payoff'], ['hook', 'takeover', 'breath', 'reveal', 'escalation', 'transformation', 'payoff']],
};
function arcFor(n, mode, pick) {
  if (mode !== 'expressive' && mode !== 'immersive') return Array.from({ length: n }, (_, i) => (i === 0 ? 'hook' : i === n - 1 ? 'payoff' : 'breath'));
  if (n <= 2) return ['hook', 'payoff'].slice(0, n);
  const set = ARCS[Math.min(7, n)]; const base = set[Math.min(set.length - 1, Math.floor((pick || 0) * set.length))].slice();
  if (n <= 7) return base;
  const out = base.slice(0, 6); while (out.length < n - 1) out.push(out.length % 2 ? 'breath' : 'escalation'); out.push('payoff'); return out;
}
// the page rhythm (timeline.js RHYTHM) each arc role plays as -- never two events side by side
const ARC_RHYTHM = { hook: 'setup', transformation: 'event', reveal: 'event', breath: 'rest', escalation: 'acceleration', takeover: 'escalation', payoff: 'payoff' };
function rhythmOf(arc) {
  const r = arc.map(a => ARC_RHYTHM[a] || 'rest');
  for (let i = 1; i < r.length; i++) if (['event', 'escalation'].includes(r[i]) && ['event', 'escalation'].includes(r[i - 1])) r[i - 1] = 'acceleration';
  return r;
}
// what each arc role reaches for, in order of preference
const ARC_POOL = {
  hook: ['fullscreen-subject', 'object-stage', 'cinematic-chapter', 'type-takeover', 'image-takeover', 'perspective-lineup', 'depth-stack', 'mask-stage'],
  transformation: ['split-transform', 'image-takeover', 'object-focus', 'mask-stage', 'gallery-collapse'],
  reveal: ['object-stage', 'depth-stack', 'perspective-lineup', 'object-focus', 'orbit-stage', 'cinematic-chapter'],
  breath: ['floating-canvas', 'cinematic-chapter'],
  escalation: ['depth-stack', 'tunnel-stage', 'image-wall', 'perspective-lineup', 'floating-canvas'],
  takeover: ['type-takeover', 'image-takeover', 'mask-stage', 'gallery-collapse', 'fullscreen-subject', 'image-wall'],
  payoff: ['object-stage', 'fullscreen-subject', 'perspective-lineup', 'cinematic-chapter', 'image-wall'],
};
// the composition a family's own designed scene already is (the recipe's arc keeps its identity: an object story's lineup
// release stays a lineup, a cinematic arc's chapters stay chapters -- only editorial compositions are replaced)
const NATIVE = { lineup: 'perspective-lineup', chapters: 'cinematic-chapter', cardstream: 'tunnel-stage', orbit: 'orbit-stage', 'giant-type': 'type-takeover', poster: 'type-takeover', campaign: 'type-takeover', takeover: 'type-takeover', depth: 'depth-stack', shrine: 'object-stage', offcanvas: 'object-stage', collage: 'floating-canvas', scrapbook: 'floating-canvas', floating: 'floating-canvas', index: 'image-wall', cinematic: 'cinematic-chapter', 'fullscreen-object': 'fullscreen-subject' };
// how many scenes may hold the scroll for their composition, by mode (separate from the layout choreographies' own pins)
const HOLDS = { quiet: 0, editorial: 1, expressive: 4, immersive: 5 };

// planPage(scenes, ctx) -- art.js, before the visual plan. scenes: the recipe's [{ layout, choreo, carries, run? }];
// ctx: { mode, inv (art.js inventory), content, direction (artDirection), premium, rng }. Sets scene.composition,
// scene.arc and scene.layout (the composition's base) on expressive and immersive pages with pictures; a breath may stay
// an ordinary composition (the page's reading moment). Returns the arc.
function planPage(scenes, ctx) {
  const c = ctx || {}; const n = scenes.length; const inv = c.inv; const r = c.rng || Math.random;
  if (!inv || !inv.main || !n || (c.mode !== 'expressive' && c.mode !== 'immersive')) return null;
  const arc = arcFor(n, c.mode, r()); const w = (c.direction && c.direction.weights) || {};
  const located = inv.photos.some(p => !p.p.tight && p.p.source !== 'unknown' && p.p.big);
  const zoom = located || inv.cut.some(x => ((x.a.assess && x.a.assess.height) || 0) * 1.15 / 520 >= 1.3);
  const have = { zoom, cut: inv.cut.length > 0, bleed: inv.bleedable.length > 0, located, pictures: inv.distinct, items: (c.content && c.content.items) || 0, short: !!(c.content && c.content.shortName), bleeds: inv.bleedable.length };
  const used = new Map(); let holds = 0; const maxHolds = HOLDS[c.mode] || 0;
  scenes.forEach((s, i) => {
    const role = arc[i]; s.arc = role;
    if (s.run) return; // (an actor's run is its own composition: the actor IS the subject on stage)
    // a breath on a page with copy to read keeps a calm reading composition; otherwise it floats its pictures
    if (role === 'breath' && (s.carries === 'facts' || s.carries === 'prose')) return;
    const x = Object.assign({}, have, i === 0 && c.premium ? { video: true, bleed: true } : {});
    let pool = ARC_POOL[role].filter(k => fit(k, x) && k !== (scenes[i - 1] || {}).composition && (used.get(k) || 0) < 2);
    // the premium hero video opens on a composition that shows a moving picture full-screen
    if (i === 0 && c.premium) pool = ['fullscreen-subject', 'cinematic-chapter'].filter(k => fit(k, x));
    // (a scene the family designed as a motion-first layout keeps that idea, as its composition)
    // (a strong preference, not a rule: the page still varies)
    const nat = !(i === 0 && c.premium) && NATIVE[s.layout]; const native = nat && fit(nat, x) && nat !== (scenes[i - 1] || {}).composition && (used.get(nat) || 0) < 2 ? nat : '';
    if (native && !pool.includes(native)) pool.unshift(native);
    if (!pool.length) return;
    // (weighted: the arc role's preference order, what the subject IS, and away from compositions the page already has)
    const table = Object.fromEntries(pool.map((k, j) => [k, (w[k] || 1) * (1 + (pool.length - j) * 0.35) * (used.has(k) ? 0.35 : 1) * (k === native ? 2.5 : 1)]));
    let pick = pool[0]; let t = r() * Object.values(table).reduce((a, b) => a + b, 0);
    for (const [k, v] of Object.entries(table)) { t -= v; if (t <= 0) { pick = k; break; } }
    // (past the mode's holds the composition still plays -- as the scene passes; validate2 decides which ones hold)
    if (SPEC[pick].hold) holds++; void maxHolds;
    used.set(pick, (used.get(pick) || 0) + 1);
    s.composition = pick; s.layout = baseFor(pick, x);
    s.choreo = SPEC[pick].keepChoreo || (pick === 'cinematic-chapter' && s.layout === 'chapters' ? 'chapters' : pick === 'orbit-stage' ? 'travel' : 'compose');
  });
  return arc;
}

// ---------------------------------------------------------------- the page as a whole
// what a scene IS structurally (for the rules and the metrics)
function shapeOf(s) {
  const imgs = (s.layers || []).filter(L => L.kind === 'image'); const f = imgs.find(L => L.role === 'focal') || imgs[0];
  const area = f && f.box ? (f.box.d[2] * f.box.d[3]) / 100 : 0; const comp = s.composition || '';
  // (an actor's scene is a subject moving in depth across the page; a scene flooded in one bold colour around one object
  // is a takeover that owns the screen)
  const run = s.layout === 'stage'; const flood = (s.background === 'accent' || s.background === 'invert') && (run || CENTRED.includes(comp));
  const framed = !!(f && CARD_MASKS.includes(f.mask) && area < 60 && !['image-takeover', 'split-transform', 'gallery-collapse', 'image-wall'].includes(comp));
  const editorial = !comp && EDITORIAL.includes(s.layout) && !!f && area < 75;
  // (one bold colour and one object owns the whole screen too: a type takeover's flood)
  const full = (FULLSCREEN.includes(comp) && ['editorial-hero', 'chapters', 'image-wall', 'mask-stage'].includes(s.layout)) || (comp === 'type-takeover' && s.background === 'accent') || flood || (!!f && area >= 90) || (!comp && ['editorial-hero', 'cinematic', 'chapters'].includes(s.layout));
  const side = f && f.box ? (f.box.d[0] + f.box.d[2] / 2 < 45 ? 'left' : f.box.d[0] + f.box.d[2] / 2 > 55 ? 'right' : 'centre') : 'none';
  const typeLed = TYPE_LED.includes(comp) || ['takeover', 'giant-type', 'poster'].includes(s.layout) || ['letter-spread', 'word-fill'].includes((s.text || {}).treatment) || ['word-takeover', 'word-mask', 'scale-through', 'word-stack', 'behind-subject'].includes((s.text || {}).act);
  return { comp, framed, editorial, full, side, centred: CENTRED.includes(comp) || run || s.layout === 'fullscreen-object', takeover: TAKEOVER.includes(comp) || s.layout === 'campaign' || flood, typeLed, transforms: TRANSFORMS.includes(comp) || s.choreo === 'expand', camera: (!!comp && SPEC[comp].camera !== 'hold') || run, depth: ['depth-stack', 'tunnel-stage', 'object-stage', 'floating-canvas', 'perspective-lineup'].includes(comp) || s.choreo === 'depth' || run, words: ((s.text || {}).body || '').length + ((s.text || {}).items || []).reduce((t, it) => t + (it.text || '').length, 0) };
}
// audit(plan) -> [{ code, at }]: the structure rules for a page meant to move. A page of image + copy blocks, framed cards,
// no takeover, no full-screen visual, no centred subject, no typography moment, no camera, no transformation fails them.
const AUDIT = ['too-editorial', 'repeated-split', 'framed-images', 'same-alternation', 'same-composition', 'no-takeover', 'no-fullscreen', 'weak-subject', 'no-type-moment', 'no-transformation', 'flat-depth', 'no-camera', 'no-hook', 'weak-payoff', 'premium-underused'];
function audit(plan, opts) {
  const o = opts || {}; const scenes = plan.scenes || []; const mode = (plan.art && plan.art.mode) || o.mode || 'editorial';
  if (!(mode === 'expressive' || mode === 'immersive') || scenes.length < 3) return [];
  const sh = scenes.map(shapeOf); const issues = []; const add = (code, at) => { if (!issues.some(x => x.code === code)) issues.push({ code, at }); };
  const pictured = sh.filter(x => x.side !== 'none').length; if (!pictured) return [];
  const ed = sh.map((x, i) => (x.editorial ? i : -1)).filter(i => i >= 0);
  if (ed.length >= 3) add('too-editorial', ed[2]);
  for (let i = 2; i < sh.length; i++) if (sh[i].editorial && sh[i - 1].editorial && sh[i - 2].editorial) add('repeated-split', i);
  const fr = sh.map((x, i) => (x.framed ? i : -1)).filter(i => i >= 0);
  if (fr.length >= 3) add('framed-images', fr[2]);
  for (let i = 2; i < sh.length; i++) if (sh[i].editorial && sh[i - 1].editorial && sh[i - 2].editorial && sh[i].side !== 'centre' && sh[i].side === sh[i - 2].side && sh[i - 1].side !== sh[i].side) add('same-alternation', i);
  // (variety that fits the subject, never one structure repeated: a composition three times is one too many)
  const seen = {}; sh.forEach((x, i) => { if (!x.comp) return; seen[x.comp] = (seen[x.comp] || 0) + 1; if (seen[x.comp] === 3) add('same-composition', i); });
  const best = k => { const i = sh.findIndex((x, j) => j > 0 && !x[k]); return i > 0 ? i : 1; };
  if (!sh.some(x => x.takeover)) add('no-takeover', best('takeover'));
  if (!sh.some(x => x.full)) add('no-fullscreen', 0);
  if (o.subject && !sh.some(x => x.centred)) add('weak-subject', best('centred'));
  if (!sh.some(x => x.typeLed)) add('no-type-moment', best('typeLed'));
  if (!sh.some(x => x.transforms)) add('no-transformation', best('transforms'));
  if (!sh.some(x => x.depth)) add('flat-depth', best('depth'));
  if (!sh.some(x => x.camera)) add('no-camera', best('camera'));
  if (!(sh[0].full || sh[0].centred || sh[0].typeLed)) add('no-hook', 0);
  const last = scenes[scenes.length - 1]; const cb = plan.timeline && plan.timeline.continuity && plan.timeline.continuity.callback;
  if (!cb && !(last.composition && SPEC[last.composition].arcs.includes('payoff'))) add('weak-payoff', scenes.length - 1);
  const hv = plan.timeline && plan.timeline.continuity && plan.timeline.continuity.hero;
  if (hv && hv.video && !(sh[hv.scene || 0].full)) add('premium-underused', hv.scene || 0);
  return issues;
}
// the composition each finding asks for (bounded: from the vocabulary, the scene's own pictures permitting)
const WANTS = { 'same-composition': ['object-stage', 'depth-stack', 'image-takeover', 'object-focus', 'type-takeover', 'perspective-lineup', 'cinematic-chapter', 'floating-canvas'], 'too-editorial': ['object-stage', 'depth-stack', 'image-takeover', 'split-transform', 'floating-canvas'], 'repeated-split': ['split-transform', 'image-takeover', 'object-focus'], 'framed-images': ['image-takeover', 'object-stage', 'floating-canvas'], 'same-alternation': ['object-stage', 'depth-stack', 'fullscreen-subject'],
  'no-takeover': ['type-takeover', 'image-takeover', 'mask-stage', 'fullscreen-subject', 'gallery-collapse'], 'no-fullscreen': ['fullscreen-subject', 'cinematic-chapter', 'image-takeover'], 'weak-subject': ['object-stage', 'object-focus', 'depth-stack', 'fullscreen-subject'], 'no-type-moment': ['type-takeover', 'mask-stage'],
  'no-transformation': ['split-transform', 'image-takeover', 'object-focus', 'mask-stage'], 'flat-depth': ['depth-stack', 'object-stage', 'floating-canvas'], 'no-camera': ['fullscreen-subject', 'cinematic-chapter', 'object-focus'], 'no-hook': ['fullscreen-subject', 'object-stage', 'cinematic-chapter', 'type-takeover'],
  'weak-payoff': ['object-stage', 'fullscreen-subject', 'cinematic-chapter'], 'premium-underused': ['fullscreen-subject', 'cinematic-chapter'] };
// fixesFor(issues, plan, can(at, comp)) -> [{ at, code, composition }]: each finding moved onto the scene that can carry
// the composition it wants (the found scene first, then the nearest editorial or framed scene)
function fixesFor(issues, plan, can) {
  const out = []; const scenes = plan.scenes || []; const taken = new Set();
  issues.forEach(x => {
    // (a scene that already has a composition is only taken when it is the found one; the closing only for the payoff)
    const dup = i => scenes[i].composition && (scenes.filter(s => s.composition === scenes[i].composition).length > 1 || scenes[i].composition === 'floating-canvas');
    const free = i => i !== x.at && i > 0 && (!scenes[i].composition || dup(i)) && (i !== scenes.length - 1 || x.code === 'weak-payoff');
    const any = i => i !== x.at && i > 0 && !free(i) && i !== scenes.length - 1;
    const near = (a, b) => Math.abs(a - x.at) - Math.abs(b - x.at);
    const order = [x.at].concat(scenes.map((s, i) => i).filter(free).sort(near), scenes.map((s, i) => i).filter(any).sort(near));
    for (const at of order) {
      if (taken.has(at) || at == null || at < 0 || at >= scenes.length) continue;
      // (the compositions the page already has twice are not given again)
      const count = k => scenes.filter((s, j) => j !== at && s.composition === k).length;
      const comp = (WANTS[x.code] || []).filter(k => count(k) < 2 && k !== scenes[at].composition).sort((a, b) => count(a) - count(b)).find(k => k !== (scenes[at - 1] || {}).composition && k !== (scenes[at + 1] || {}).composition && can(at, k));
      if (comp) { out.push({ at, code: x.code, composition: comp }); taken.add(at); return; }
    }
  });
  return out;
}

// ---------------------------------------------------------------- the renderer's tracks
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const r2 = v => Math.round(v * 100) / 100;
// the bounds every key is held to (phone halves the travel at runtime)
const KB = { x: [-60, 60], y: [-40, 40], s: [0.2, 6.5], r: [-40, 40], o: [0, 1], c: [0, 1], ry: [-40, 40] };
const boundKey = (k, sMax) => [clamp(r2(k[0]), 0, 1), clamp(r2(k[1]), ...KB.x), clamp(r2(k[2]), ...KB.y), clamp(r2(k[3]), KB.s[0], sMax), clamp(r2(k[4]), ...KB.r), clamp(r2(k[5]), ...KB.o), clamp(r2(k[6]), ...KB.c), clamp(r2(k[7]), ...KB.ry)];
// the hero video's measured motion continues through the next two scenes' cameras: a push-in pushes, a pull-back pulls,
// a pan travels the same way (ctx.lead: 'in'|'out'|'lr'|'rl'|'none'; ctx.leadNear: true within two scenes of the hero)
function cameraKeys(keys, comp, ctx) {
  const lead = ctx && ctx.leadNear ? ctx.lead : 'none'; if (!lead || lead === 'none') return keys;
  return keys.map(k => { const q = k.slice(); const t = q[0];
    if (lead === 'lr' || lead === 'rl') q[1] = q[1] + (lead === 'lr' ? 1 : -1) * (t - 0.5) * 8;
    else if (lead === 'in') q[3] = q[3] * (1 + t * 0.04); else if (lead === 'out') q[3] = q[3] * (1.04 - t * 0.04);
    return q; });
}
// tracks(scene, si, ctx) -> { comp, camera, hold, rest, planes: { [layerId]: { plane, keys, win? } }, text: { keys } }
// ctx: { byId, lead, leadNear, mirror (the words sit right: windows open from the left) }
function tracks(scene, si, ctx) {
  const comp = scene && scene.composition; const S = SPEC[comp]; if (!S) return null; const c = ctx || {};
  const out = { comp, camera: S.camera, hold: !!scene.pin, rest: S.rest, act: (scene.text && scene.text.act) || S.act, planes: {}, text: null };
  const layers = scene.layers || []; const focal = layers.find(L => L.role === 'focal' && L.kind === 'image');
  // how far a picture may be enlarged: a photo within the scroll zoom ceiling (a deliberate detail further), a cut-out within
  // what its pixels hold
  const sMaxOf = L => { if (!L || L.kind !== 'image') return KB.s[1]; const a = c.byId && c.byId.get(L.asset); const free = !!(a && ((a.caps && a.caps.moveFreely) || a.cutout || (a.assess && a.assess.transparent))); if (!free) return L.frame === 'detail' ? F.ZOOM.detail : F.ZOOM.scroll; const h = (a && a.assess && a.assess.height) || 900; return clamp(h * 1.15 / 520, 1.05, 1.9); };
  const keysFor = (plane, L) => (S.planes[plane] ? cameraKeys(S.planes[plane], comp, c).map(k => boundKey(k, sMaxOf(L))) : null);
  const mirror = !!c.mirror; const flipX = k => k.map(q => [q[0], -q[1], q[2], q[3], -q[4], q[5], q[6], -q[7]]);
  const put = (L, plane, keys, extra) => { if (keys) out.planes[L.id] = Object.assign({ plane, keys: mirror ? flipX(keys) : keys }, extra || {}); };
  // the window a picture opens from: the composition's card place (mirrored to the side away from the words), or the
  // tile the picture had in the wall
  const winOf = () => { if (!S.window) return null; const w = S.window.slice(); if (mirror) w[0] = 100 - w[0] - w[2]; return w; };
  if (focal) {
    let keys = keysFor('subject', focal);
    // the detail the camera moves into: toward the picture's measured subject (object-focus)
    if (S.focus && keys) { const a = c.byId && c.byId.get(focal.asset); const pr = a ? F.profile(a) : null; const fx = pr ? (pr.focus[0] - 0.5) : 0, fy = pr ? (pr.focus[1] - 0.45) : 0; keys = keys.map(q => { const k = q.slice(); const z = k[3] - 1; k[1] = clamp(r2(-fx * z * 60), ...KB.x); k[2] = clamp(r2(-fy * z * 40), ...KB.y); return k; }); }
    // (the wall's chosen tile is where the camera goes: it grows to the screen while the others pass the edges)
    if (S.wall) put(focal, 'subject', [boundKey(K(0), 3.4), boundKey(K(0.45, 0, 0, 1), 3.4), boundKey(K(1, 0, 0, 3.2), 3.4)]);
    else if (S.collapse) put(focal, 'subject', keys, { win: (focal.win || [35, 30, 30, 40]).slice() });
    else if (S.window) put(focal, 'subject', keys, { win: winOf() });
    else if (keys) put(focal, 'subject', keys);
  }
  const fc = focal && focal.box ? [focal.box.d[0] + focal.box.d[2] / 2, focal.box.d[1] + focal.box.d[3] / 2] : [50, 50];
  layers.forEach((L, j) => {
    if (L === focal) return;
    const box = L.box ? L.box.d : [0, 0, 100, 100]; const cx = box[0] + box[2] / 2, cy = box[1] + box[3] / 2;
    if (L.kind === 'word' && S.planes.type) { put(L, 'type', keysFor('type', L)); return; }
    if (S.wall && L.kind === 'image') {
      // the camera pushes into the chosen tile: every tile scales about the chosen tile's centre (a wall that collapses
      // instead pulls its tiles into it and lets them go)
      const Z = 3.2; const dx = (cx - fc[0]) * (Z - 1), dy = (cy - fc[1]) * (Z - 1);
      put(L, 'fg', [boundKey(K(0), 3.4), boundKey(K(0.45, 0, 0, 1), 3.4), boundKey(K(1, dx, dy * 0.62, Z, 0, 0.6), 3.4)]);
      return;
    }
    if (S.collapse && L.kind === 'image') { put(L, 'fg', [boundKey(K(0), 2), boundKey(K(0.3, 0, 0, 1), 2), boundKey(K(0.7, (fc[0] - cx) * 0.9, (fc[1] - cy) * 0.55, 0.45, 0, 0), 2), boundKey(K(1, (fc[0] - cx) * 0.9, (fc[1] - cy) * 0.55, 0.45, 0, 0), 2)]); return; }
    if (S.lineup && L.kind === 'image') { const off = (cx - 50) / 50; put(L, 'fg', [boundKey(K(0, off * 10, 2, 0.94, 0, 1, 0, off * 28), 1.3), boundKey(K(0.6, -off * 4, 0, 0.9, 0, 0.9, 0, off * 34), 1.3), boundKey(K(1, -off * 8, 2, 0.84, 0, 0.75, 0, off * 38), 1.3)]); return; }
    if (S.drift && L.kind === 'image') { const d = ((L.z || 4) - 4) * 0.5 + (j % 2 ? 0.4 : -0.3); put(L, 'fg', [boundKey(K(0, d * -3, 8 + d * 8, 1), 1.2), boundKey(K(1, d * 3, -8 - d * 8, 1.03), 1.2)]); return; }
    if (L.role === 'backdrop' || L.role === 'texture' || L.kind === 'shape' || (L.kind === 'image' && box[2] >= 95 && box[3] >= 95)) { put(L, 'bg', keysFor('bg', L)); return; }
    if (L.kind === 'image') put(L, 'fg', keysFor('fg', L));
  });
  const label = (comp === 'type-takeover' || comp === 'mask-stage') && !(scene.text && scene.text.giant);
  const tk = label ? [K(0, 0, 3, 1, 0, 0), K(0.2, 0, 0, 1, 0, 1), K(1, 0, 0, 1, 0, 1)] : S.planes.text;
  if (tk) out.text = { keys: (() => { const k = tk.map(q => boundKey(q, 6.5)); return mirror ? flipX(k) : k; })() };
  return out;
}
// a track sampled at p (the same function the runtime implements; the smooth step between keys)
function sample(keys, p) {
  if (!keys || !keys.length) return null; if (p <= keys[0][0]) return keys[0].slice(1); const n = keys.length; if (p >= keys[n - 1][0]) return keys[n - 1].slice(1);
  let i = 0; while (i < n - 2 && keys[i + 1][0] < p) i++; const A = keys[i], B = keys[i + 1]; let t = (p - A[0]) / Math.max(1e-6, B[0] - A[0]); t = t * t * (3 - 2 * t);
  return A.slice(1).map((v, j) => v + (B[j + 1] - v) * t);
}

// ---------------------------------------------------------------- metrics
// metrics(plan) -> the page's structure in numbers: how editorial, how framed, how many takeovers, full-screen visuals,
// centred subjects, typography moments, transformations, camera moves, held scenes, average copy per scene
function metrics(plan) {
  const sh = (plan.scenes || []).map(shapeOf); const n = sh.length || 1; let runE = 0, runF = 0, maxE = 0, maxF = 0;
  sh.forEach(x => { runE = x.editorial ? runE + 1 : 0; runF = x.framed ? runF + 1 : 0; maxE = Math.max(maxE, runE); maxF = Math.max(maxF, runF); });
  return { scenes: sh.length, compositions: sh.filter(x => x.comp).length, editorial: sh.filter(x => x.editorial).length, framed: sh.filter(x => x.framed).length, longestEditorialRun: maxE, longestFramedRun: maxF,
    takeovers: sh.filter(x => x.takeover).length, fullscreen: sh.filter(x => x.full).length, centred: sh.filter(x => x.centred).length, typeLed: sh.filter(x => x.typeLed).length, transforms: sh.filter(x => x.transforms).length,
    camera: sh.filter(x => x.camera).length, depth: sh.filter(x => x.depth).length, avgCopy: Math.round(sh.reduce((t, x) => t + x.words, 0) / n), distinctStructures: new Set((plan.scenes || []).map(s => s.composition || s.layout)).size };
}

// alternatives(comp, arc) -> the compositions to try, in order, when a scene's pictures cannot carry `comp`
function alternatives(comp, arc) { return [...new Set((NEAREST[comp] || []).concat(ARC_POOL[arc] || [], ['object-focus', 'fullscreen-subject', 'object-stage', 'floating-canvas', 'image-takeover']))].filter(k => k !== comp); }
module.exports = { NATIVE, alternatives, carryOf, COMPOSITIONS, SPEC, ARC, ARC_RHYTHM, ARC_POOL, TYPE_ACTS, CAMERAS, TEXT_ROLES, COPY, TAKEOVER, FULLSCREEN, CENTRED, TYPE_LED, TRANSFORMS, EDITORIAL, CARD_MASKS, HOLDS, TAKES, BASES, NEAREST, AUDIT, WANTS, KB, TRAITS,
  artDirection, fit, baseFor, arcFor, rhythmOf, planPage, shapeOf, audit, fixesFor, tracks, sample, boundKey, metrics };
