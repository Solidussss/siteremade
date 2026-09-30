'use strict';
// CREATIVE — image framing. Every picture on a Creative page is framed on purpose: the plan says what the picture is
// FOR (show the whole subject, a light crop, an editorial crop, an explicit detail crop, full bleed, a framed print, a
// floating cut-out, a masked shape, a texture, a collage piece), and this module turns that intention into a fit, a
// crop position and -- when the container does not suit the picture -- a container reshaped to the picture.
//
// What it knows about a picture is only what was measured or seen:
//   - its pixel size and aspect (assets.assess),
//   - where the subject sits, when that could be read from the pixels (a transparent picture's opaque area, or the part
//     of a plain-background picture unlike its background -- assets.assess.subject),
//   - what the picture check (a vision call over the thumbnail) said about its framing ("whole", "tight", "cropped"...)
//     and where its important part is (curation.framing / curation.focus), and an owner-set focus.
// Nothing is guessed beyond that: a busy photo with no measured subject is treated as "unknown" and cropped gently.
//
//   profile(asset)                                -> { aspect, free, subject, fill, edges, tight, focus, source }
//   frameLayer(layer, asset, stageKey, opts)      -> { fit, focus, box, crop, zoom, intent, notes[] }  (a pure decision)
//   coverCrop(imageAspect, boxAspect)             -> { crop, axis, zoom }
//   ZOOM                                          the ceilings for every artificial enlargement
// Data only: the renderer applies it (object-fit / object-position), and its runtime guard re-checks the crop against
// the real viewport (a viewport wider than planned never crops past the budget).

// the framing intentions (the plan's `frame` on an image layer)
const FRAMES = ['auto', 'full', 'contain', 'light', 'editorial', 'detail', 'bleed', 'framed', 'floating', 'cutout', 'masked', 'texture', 'collage'];
// how much of a picture an intention may cut away along its cropped axis (share of that axis; 0 = nothing)
const BUDGET = { full: 0, contain: 0, framed: 0, floating: 0, cutout: 0, collage: 0.1, light: 0.14, masked: 0.3, editorial: 0.3, bleed: 0.34, detail: 0.62, texture: 1 };
// the most any artificial enlargement may add: an ambient loop, scroll-linked zoom, a scene camera, an entrance, and a
// deliberate detail (an explicit "detail" framing or a transitional zoom-away that settles back to 1)
// the most a picture whose subject was never located may lose
const UNKNOWN = 0.2;
const ZOOM = { loop: 1.06, scroll: 1.15, camera: 1.06, entrance: 1.06, detail: 1.35 };
// the stages the plan's boxes are drawn on (desktop scene, phone stage): real width / height
const STAGE = { d: 1.6, m: 0.9 };

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const r1 = v => Math.round(v * 10) / 10;

function coverCrop(ai, ab) {
  if (!(ai > 0) || !(ab > 0)) return { crop: 0, axis: 'x', zoom: 1 };
  // an image wider than its box loses width; a taller one loses height
  return ai > ab ? { crop: 1 - ab / ai, axis: 'x', zoom: ai / ab } : { crop: 1 - ai / ab, axis: 'y', zoom: ab / ai };
}

// what is known about a picture's framing
function profile(asset) {
  const a = (asset && asset.assess) || {}; const k = (asset && asset.curation) || {};
  const aspect = a.aspect > 0 ? a.aspect : (a.width && a.height ? a.width / a.height : 1);
  const free = !!(asset && (asset.cutout || a.transparent || (asset.caps && asset.caps.moveFreely)));
  const s = Array.isArray(a.subject) && a.subject.length === 4 && a.subject[2] > a.subject[0] && a.subject[3] > a.subject[1] ? a.subject.slice() : null;
  const fill = s ? (s[2] - s[0]) * (s[3] - s[1]) : null;
  const edges = s ? [s[0] <= 0.02, s[1] <= 0.02, s[2] >= 0.98, s[3] >= 0.98].filter(Boolean).length : null;
  const seen = typeof k.framing === 'string' ? k.framing : '';
  const issues = Array.isArray(k.issues) ? k.issues : [];
  // tight: the subject already fills the frame (or runs off it) -- cropping it further cuts the subject itself.
  // A clean cut-out is the whole object by construction (a cut touching three edges is refused), so it is never tight.
  const tight = !free && (seen === 'tight' || seen === 'cropped' || issues.includes('cropped') || (s != null && (fill > 0.74 || (edges >= 2 && fill > 0.5))));
  const parse = v => { const m = /^(\d{1,3})% (\d{1,3})%$/.exec(v || ''); return m ? [clamp(+m[1] / 100, 0, 1), clamp(+m[2] / 100, 0, 1)] : null; };
  const vision = Array.isArray(k.focus) && k.focus.length === 2 && k.focus.every(v => typeof v === 'number' && v >= 0 && v <= 1) ? k.focus.slice() : null;
  // where the important part is: the owner's choice, the picture check's, the measured subject's centre (upper third of
  // a tall subject, where a head or the top of an object is); unknown -> slightly above centre
  const focus = parse(asset && asset.focus) || vision || (s ? [(s[0] + s[2]) / 2, s[1] + (s[3] - s[1]) * (s[3] - s[1] > 0.5 ? 0.38 : 0.5)] : [0.5, aspect < 0.9 ? 0.36 : 0.45]);
  return { aspect, free, subject: s, fill, edges, tight, seen, focus, source: s ? 'pixels' : seen ? 'vision' : 'unknown', wide: aspect >= 1.45, tall: aspect <= 0.8, big: (a.width || 0) >= 1100 || (a.height || 0) >= 1100 };
}

// the crop window start (0..1-v) along one axis: centred on the focus, holding the whole subject span when it fits;
// a subject taller than the window keeps its top (heads, the top of an object), a wider one stays centred
function windowStart(v, f, s0, s1, keepTop) {
  if (v >= 1) return 0;
  let st = clamp(f - v / 2, 0, 1 - v);
  if (s0 != null) {
    if (s1 - s0 <= v) st = clamp(st, s1 - v, s0);
    else st = keepTop ? s0 : clamp((s0 + s1) / 2 - v / 2, 0, 1 - v);
  }
  return clamp(st, 0, 1 - v);
}
function objectPosition(p, crop) {
  const v = 1 - crop.crop; const s = p.subject;
  if (crop.crop <= 0.001) return '50% 50%';
  if (crop.axis === 'x') { const st = windowStart(v, p.focus[0], s && s[0], s && s[2], false); return `${Math.round(st / (1 - v) * 100)}% ${Math.round(p.focus[1] * 100)}%`; }
  const st = windowStart(v, p.focus[1], s && s[1], s && s[3], true); return `${Math.round(p.focus[0] * 100)}% ${Math.round(st / (1 - v) * 100)}%`;
}
// reshape a box toward an aspect (real proportions) inside itself, holding one side/corner (anchor: 'l','r','c' x 't','b','m')
function reshape(box, stageAspect, target, anchor) {
  const [x, y, w, h] = box; const cur = (w * stageAspect) / h; const an = anchor || 'cm';
  let nw = w, nh = h;
  if (cur > target) nw = (h * target) / stageAspect; else nh = (w * stageAspect) / target;
  const ax = an.includes('l') ? 0 : an.includes('r') ? 1 : 0.5; const ay = an.includes('t') ? 0 : an.includes('b') ? 1 : 0.5;
  return [r1(x + (w - nw) * ax), r1(y + (h - nh) * ay), r1(nw), r1(nh)];
}

// The decision for one image layer on one stage. opts: { stageAspect, anchor, role, mask, allowReshape (default true),
// minKeep (smallest share of the box a reshape may keep, default .45) }
function frameLayer(layer, asset, stageKey, opts) {
  const o = opts || {}; const notes = [];
  const sa = o.stageAspect || STAGE[stageKey] || 1.6;
  const p = profile(asset);
  const box = (layer.box && layer.box[stageKey] ? layer.box[stageKey] : [0, 0, 100, 100]).slice();
  let intent = FRAMES.includes(layer.frame) ? layer.frame : 'auto';
  const role = o.role || layer.role;
  const mask = o.mask != null ? o.mask : layer.mask || 'none';
  if (intent === 'auto') intent = p.free ? 'floating' : role === 'backdrop' ? 'bleed' : role === 'texture' ? 'texture' : mask && mask !== 'none' ? 'masked' : 'light';
  // a cut-out is shown whole; it never fills a box by cropping
  if (p.free && !['texture', 'collage', 'detail'].includes(intent)) intent = intent === 'cutout' ? 'cutout' : 'floating';
  // an already tight picture is never cropped further: it is shown whole, in a frame, with space around it
  if (p.tight && BUDGET[intent] > 0.06 && intent !== 'texture') {
    const to = mask && !['none', 'window', 'frame', 'polaroid'].includes(mask) ? 'framed' : intent === 'bleed' ? 'framed' : 'contain';
    notes.push(`${asset && asset.id}: already tightly framed (${p.source === 'pixels' ? 'the subject fills the picture' : 'the picture check said so'}) -- shown ${to === 'framed' ? 'whole in a frame' : 'whole'} instead of a ${intent} crop`);
    intent = to;
  }
  // (unknown subject: at most a light crop's share more than a light crop -- nothing is guessed about where it is)
  const budget = p.source === 'unknown' && !['texture', 'detail'].includes(intent) ? Math.min(BUDGET[intent], UNKNOWN) : BUDGET[intent];
  const ab = (box[2] * sa) / box[3];
  if (budget === 0 || p.free) {
    // shown whole: the frame hugs the picture (no letterbox bands inside a frame); a free cut-out keeps its box and
    // stands on its floor (drawnRect)
    const nb = p.free || o.allowReshape === false ? box : reshape(box, sa, p.aspect, o.anchor);
    // (a free cut-out stands on its box's floor -- the composition's overlap checks assume it: validate.js drawnRect)
    return { fit: 'contain', focus: p.free ? '50% 100%' : '50% 50%', box: nb, crop: 0, zoom: 1, intent, profile: p, notes };
  }
  let c = coverCrop(p.aspect, ab);
  let nb = box;
  if (c.crop > budget + 0.005) {
    // the container does not suit the picture: reshape it toward the picture until the crop is inside the budget
    const target = c.axis === 'x' ? p.aspect * (1 - budget) : p.aspect / (1 - budget);
    const cand = o.allowReshape === false ? box : reshape(box, sa, target, o.anchor);
    const keep = (cand[2] * cand[3]) / Math.max(1, box[2] * box[3]);
    if (o.allowReshape !== false && keep >= (o.minKeep || 0.45)) { nb = cand; c = coverCrop(p.aspect, (nb[2] * sa) / nb[3]); notes.push(`${asset && asset.id}: its ${intent} frame was reshaped to the picture (a ${Math.round(coverCrop(p.aspect, ab).crop * 100)}% crop would have cut it)`); }
    else {
      // no shape of this container keeps the crop honest: the picture is shown whole instead
      notes.push(`${asset && asset.id}: a ${intent} crop here would cut ${Math.round(c.crop * 100)}% of it -- shown whole instead`);
      const whole = o.allowReshape === false ? box : reshape(box, sa, p.aspect, o.anchor);
      return { fit: 'contain', focus: '50% 50%', box: whole, crop: 0, zoom: 1, intent: intent === 'bleed' ? 'framed' : 'contain', profile: p, notes };
    }
  }
  return { fit: 'cover', focus: objectPosition(p, c), box: nb, crop: +c.crop.toFixed(3), zoom: +c.zoom.toFixed(3), intent, profile: p, notes };
}

// the ceiling for a layer's artificial zoom: a deliberate detail may go further, nothing else does
function zoomCeiling(layer) { return layer && layer.frame === 'detail' ? ZOOM.detail : ZOOM.scroll; }

function budgetFor(asset, intent) { const p = profile(asset); const b = BUDGET[intent] == null ? BUDGET.light : BUDGET[intent]; return p.source === 'unknown' && !['texture', 'detail'].includes(intent) ? Math.min(b, UNKNOWN) : b; }

module.exports = { UNKNOWN, budgetFor, FRAMES, BUDGET, ZOOM, STAGE, profile, frameLayer, coverCrop, objectPosition, reshape, zoomCeiling };
