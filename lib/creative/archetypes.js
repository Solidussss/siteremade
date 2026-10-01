'use strict';
// CREATIVE — layout archetypes. A scene's `layout` is a real composition, not a label: each archetype decides where the
// words sit (on a 12-column grid, top/middle/bottom), how much of the scene the pictures take and where, how they are
// framed (through framing.js, so the container adapts to the picture), what is layered over what, how tall the scene is,
// what scroll does inside it (its choreography), and how it recomposes on a phone.
//
//   composeScene(scene, env)   mutates a validated v2 scene whose layout is not 'free'
//     env: { byId, si, hero, art, motion, rng, name, fixes, warnings }
//   MSTAGE                     the phone stage height per archetype (vw) -- the renderer's CSS uses the same table
//   PINNED                     choreographies that hold the scene while scroll plays them
//
// The model (or the built-in director) chooses the archetype, the pictures and the words; this module places them.
// A scene whose pictures cannot carry its archetype (a cinematic band for a tight portrait, a collage of one picture)
// is recomposed as the nearest archetype that can -- and says so.

const F = require('./framing');
const { MOTION, NATURAL, MODE_LIMITS } = require('./art');

const PINNED = ['pin-steps', 'zoom-away', 'scale-through', 'track', 'stack', 'chapters', 'cardstream', 'expand'];
const SHAPED = ['circle', 'arch', 'blob', 'diamond', 'slit', 'porthole', 'torn'];
// phone stage height in vw (its aspect is 100 / MSTAGE); strip's stage is its horizontal track
const MSTAGE = { 'editorial-hero': 128, cinematic: 64, split: 108, 'giant-type': 96, shrine: 110, offcanvas: 112, framed: 112, floating: 104, collage: 120, poster: 118, magazine: 108, strip: 96, 'sticky-steps': 74, text: 56, image: 104, luxe: 92, dense: 56, depth: 108, brutalist: 96, gallery: 112,
  stage: 40, campaign: 110, splitscreen: 96, 'fullscreen-object': 128, orbit: 100, index: 150, scrapbook: 124, takeover: 30, chapters: 150, lineup: 88, cardstream: 112, 'edge-crop': 112 };
const FALLBACK = { 'editorial-hero': ['split', 'framed'], cinematic: ['image', 'framed'], offcanvas: ['floating', 'shrine', 'framed'], floating: ['shrine', 'framed'], collage: ['gallery', 'framed', 'text'], strip: ['gallery', 'framed', 'text'], gallery: ['framed', 'image', 'text'], 'sticky-steps': ['split', 'text'], dense: ['brutalist', 'text'], magazine: ['split', 'text'], poster: ['giant-type', 'shrine', 'text'], shrine: ['framed', 'text'], luxe: ['text'], framed: ['text'], split: ['text'], image: ['text'], depth: ['framed', 'text'], 'giant-type': ['split', 'text'], brutalist: ['text'], text: [],
  stage: ['fullscreen-object', 'shrine', 'text'], campaign: ['shrine', 'framed', 'text'], splitscreen: ['split', 'framed', 'text'], 'fullscreen-object': ['shrine', 'framed', 'text'], orbit: ['sticky-steps', 'split', 'text'],
  index: ['gallery', 'framed', 'text'], scrapbook: ['collage', 'framed', 'text'], takeover: ['text'], chapters: ['gallery', 'image', 'text'], lineup: ['index', 'collage', 'gallery', 'framed', 'text'], cardstream: ['gallery', 'collage', 'framed', 'text'], 'edge-crop': ['split', 'framed', 'text'] };
// compositions that show one picture of any kind (a photo or a cut-out): the last resort before words alone
const PICTURE_SAFE = ['split', 'framed', 'image', 'shrine', 'floating', 'offcanvas'];
const COL = c => 5 + (c - 1) * 7.5; // left edge (in % of the scene) of grid column c (12 columns across the middle 90%)

// how tall a text block is on a 1440x900 desktop scene (% of its height) -- to keep pictures clear of it
function textHeight(t, cols) {
  const w = cols / 12 * 0.9 * 1440; const fs = { display: 92, large: 56, medium: 40, small: 26 }[t.size] || 56;
  const lines = (len, px) => Math.max(1, Math.ceil(len * px * 0.52 / Math.min(w, t.width === 'narrow' ? 560 : t.width === 'wide' ? 1100 : 820)));
  let h = t.kicker ? 34 : 0;
  if (t.heading) h += lines(t.heading.length, fs) * fs * 1.02;
  if (t.body) h += 20 + lines(t.body.length, 18) * 29;
  (t.items || []).forEach(it => { h += 14 + lines((it.label ? it.label.length + 2 : 0) + it.text.length, 17) * 28; });
  return h / 900 * 100;
}
function textRect(t, place) {
  const [c0, c1] = place.gc; const hgt = Math.min(92, textHeight(t, c1 - c0 + 1) + 4);
  const y = place.v === 'top' ? 12 : place.v === 'bottom' ? 94 - hgt : 50 - hgt / 2;
  return [COL(c0), Math.max(6, y), COL(c1 + 1) - COL(c0), hgt];
}
const overlap = (a, b) => Math.max(0, Math.min(a[0] + a[2], b[0] + b[2]) - Math.max(a[0], b[0])) * Math.max(0, Math.min(a[1] + a[3], b[1] + b[3]) - Math.max(a[1], b[1]));

// ---------------------------------------------------------------- the archetypes
// each returns { place, mplace, slots: [{ d, m, intent, anchor, manchor, z, rot, mask, role, step }], decos: [...],
//   height, choreos (allowed), stepFx } -- or null when the scene cannot be this archetype
const A = {};
A['editorial-hero'] = (S, e) => ({
  place: { gc: [1, 8], v: 'bottom', align: 'left' }, mplace: 'overlay', height: 'screen', shade: 'bottom',
  slots: [{ d: [0, 0, 100, 100], m: [0, 0, 100, 100], intent: 'bleed', anchor: 'cm', z: 2, role: 'focal', needs: 'bleed' }],
});
A.cinematic = (S, e) => ({
  place: { gc: [3, 10], v: 'bottom', align: 'center' }, mplace: 'below', height: 'screen', shade: 'band',
  slots: [{ d: [0, 13, 100, 74], m: [0, 8, 100, 84], intent: 'bleed', anchor: 'cm', z: 2, role: 'focal', needs: 'bleed' }],
});
A.split = (S, e) => {
  const right = e.side === 'right';
  return {
    place: right ? { gc: [1, 5], v: 'middle', align: 'left' } : { gc: [8, 12], v: 'middle', align: 'left' }, mplace: 'above', height: 'screen',
    slots: [{ d: right ? [44, 0, 56, 100] : [0, 0, 56, 100], m: [0, 0, 100, 100], intent: 'editorial', anchor: right ? 'rm' : 'lm', manchor: 'cm', z: 3, role: 'focal' },
      { d: right ? [34, 60, 17, 30] : [49, 60, 17, 30], m: [58, 62, 38, 34], intent: 'framed', mask: 'window', anchor: 'cb', z: 6, role: 'support', optional: true }],
  };
};
// (giant type is for a few words: a sentence set that large is a wall, not a composition)
A['giant-type'] = (S, e) => ((S.text.heading || '').length > 30 || (S.text.heading || '').split(/\s+/).length > 4 ? null : {
  place: { gc: [1, 12], v: 'middle', align: 'left' }, mplace: 'above', height: 'screen', giant: true,
  // the picture stands behind the first words of the heading; the paragraph sits to the right, clear of it
  slots: [e.focalAspect >= 1.2 ? { d: [5, 46, 48, 48], m: [4, 20, 92, 76], intent: 'framed', mask: 'window', anchor: 'lb', z: 3, role: 'focal', optional: true }
    : { d: [8, 12, 30, 82], m: [18, 0, 64, 100], intent: e.freeFirst ? 'floating' : 'framed', mask: e.freeFirst ? 'none' : 'arch', anchor: 'cb', z: 3, role: 'focal', optional: true }],
});
A.shrine = (S, e) => {
  const long = (S.text.body || '').length > 170 || S.text.items.length > 0;
  if (long) return null;
  return {
    place: { gc: [3, 10], v: 'top', align: 'center' }, mplace: 'above', height: 'screen', shrineTitle: true,
    slots: [{ d: [35, 42, 30, 56], m: [18, 2, 64, 94], intent: e.freeFirst ? 'floating' : 'framed', mask: e.freeFirst ? 'none' : 'arch', anchor: 'cb', z: 5, role: 'focal' }],
    decos: [{ kind: 'shape', form: e.personality === 'playful' || e.personality === 'chaotic' ? 'sunburst' : 'circle', fill: 'glow', d: [30, 34, 40, 66], m: [8, 0, 84, 96], z: 2, opacity: 0.5, role: 'backdrop' },
      { kind: 'shape', form: 'line', fill: 'accent', d: [30, 96, 40, 1], m: [14, 97, 72, 1], z: 3, opacity: 0.8, role: 'support' }],
  };
};
A.offcanvas = (S, e) => (e.freeFirst ? {
  place: { gc: [1, 5], v: 'middle', align: 'left' }, mplace: 'above', height: 'screen',
  // the subject is larger than the scene and runs off its right and bottom edges -- never its top (a head stays whole)
  slots: [{ d: [44, 6, 72, 118], m: [26, 4, 96, 112], intent: 'floating', anchor: 'lt', z: 5, role: 'focal', bleed: true }],
  decos: [{ kind: 'shape', form: 'ring', fill: 'accent', d: [40, 8, 50, 80], m: [10, 6, 90, 84], z: 2, opacity: 0.35, role: 'backdrop' }],
} : null);
A.framed = (S, e) => {
  const right = e.side === 'right';
  return {
    place: right ? { gc: [1, 5], v: 'middle', align: 'left' } : { gc: [8, 12], v: 'middle', align: 'left' }, mplace: 'above', height: 'screen',
    slots: [{ d: right ? [52, 12, 38, 76] : [10, 12, 38, 76], m: [10, 4, 80, 92], intent: 'framed', mask: e.personality === 'luxe' || e.personality === 'still' ? 'window' : e.personality === 'playful' ? 'polaroid' : 'frame', anchor: 'cm', z: 5, role: 'focal' },
      { d: right ? [46, 58, 16, 30] : [42, 58, 16, 30], m: [60, 58, 34, 38], intent: 'framed', mask: 'polaroid', rot: right ? -4 : 4, anchor: 'cb', z: 6, role: 'support', optional: true }],
  };
};
A.floating = (S, e) => (e.free >= 1 ? {
  place: { gc: [1, 5], v: 'middle', align: 'left' }, mplace: 'above', height: 'screen',
  slots: [{ d: [50, 8, 40, 80], m: [14, 4, 72, 80], intent: 'floating', anchor: 'cb', z: 5, role: 'focal', freeOnly: true },
    { d: [82, 56, 15, 32], m: [66, 56, 30, 36], intent: 'floating', anchor: 'cb', z: 7, role: 'support', optional: true, freeOnly: true, rot: 6 },
    { d: [40, 64, 12, 24], m: [2, 60, 28, 32], intent: 'floating', anchor: 'cb', z: 3, role: 'support', optional: true, freeOnly: true, rot: -8 }],
} : null);
A.collage = (S, e) => (e.images >= 2 ? {
  place: { gc: [1, 4], v: 'middle', align: 'left' }, mplace: 'above', height: 'screen',
  slots: [{ d: [40, 8, 30, 52], m: [4, 2, 56, 46], intent: 'collage', mask: 'polaroid', rot: -4, anchor: 'cm', z: 5, role: 'focal' },
    { d: [66, 26, 28, 48], m: [42, 22, 54, 42], intent: 'collage', mask: 'polaroid', rot: 5, anchor: 'cm', z: 6, role: 'support' },
    { d: [44, 56, 24, 38], m: [8, 56, 48, 40], intent: 'collage', mask: 'torn', rot: 3, anchor: 'cm', z: 4, role: 'support', optional: true },
    { d: [74, 4, 18, 26], m: [60, 64, 36, 32], intent: 'collage', mask: 'polaroid', rot: -7, anchor: 'cm', z: 7, role: 'support', optional: true }],
  decos: e.shortName ? [{ kind: 'word', text: e.name, style: 'ghost', d: [34, 34, 66, 30], m: [0, 36, 100, 26], z: 1, opacity: 0.12, role: 'texture' }] : [],
} : null);
A.poster = (S, e) => (e.shortName ? {
  place: { gc: [1, 4], v: 'bottom', align: 'left' }, mplace: 'below', height: 'screen', smallHeading: true,
  slots: [{ d: [42, 4, 32, 92], m: [20, 4, 60, 94], intent: e.freeFirst ? 'floating' : 'masked', mask: e.freeFirst ? 'none' : 'arch', anchor: 'cb', z: 6, role: 'focal' }],
  decos: [{ kind: 'word', text: e.name, style: e.personality === 'mechanical' ? 'solid' : 'outline', d: [-6, 16, 112, 44], m: [-8, 18, 116, 36], z: 3, opacity: 1, role: 'echo' },
    { kind: 'shape', form: e.personality === 'mechanical' ? 'stripes' : 'circle', fill: 'accent', d: [30, 14, 42, 70], m: [10, 10, 80, 70], z: 2, opacity: 0.4, role: 'backdrop' }],
} : null);
A.magazine = (S, e) => ({
  place: { gc: [7, 12], v: 'top', align: 'left' }, mplace: 'below', height: 'screen', columns: (S.text.body || '').length > 220,
  slots: [{ d: [0, 0, 48, 100], m: [0, 0, 100, 100], intent: 'editorial', anchor: 'lm', z: 3, role: 'focal', optional: true }],
});
A.strip = (S, e) => (e.images >= 3 ? { track: true, place: { gc: [1, 4], v: 'middle', align: 'left' }, mplace: 'above', height: 'tall' } : null);
A['sticky-steps'] = (S, e) => (S.text.items.length >= 2 ? {
  place: { gc: [1, 5], v: 'middle', align: 'left' }, mplace: 'below', height: 'tall', steps: true,
  slots: [{ d: [52, 10, 42, 80], m: [6, 4, 88, 92], intent: 'editorial', anchor: 'cm', z: 5, role: 'focal', optional: true, stepped: true }],
} : null);
A.text = (S, e) => ({
  place: { gc: [2, 11], v: 'middle', align: e.rng() < 0.55 ? 'left' : 'center' }, mplace: 'above', height: (S.text.body || '').length + S.text.items.length * 120 > 360 ? 'auto' : 'short', columns: (S.text.body || '').length > 260,
  slots: [{ d: [82, 58, 11, 30], m: [70, 8, 26, 84], intent: 'framed', mask: 'window', anchor: 'cb', z: 4, role: 'support', optional: true }],
  decos: [{ kind: 'shape', form: 'line', fill: 'accent', d: [5, 90, 30, 0.6], m: [6, 94, 50, 1], z: 2, opacity: 0.7, role: 'support' }],
});
A.image = (S, e) => ({
  place: { gc: [1, 5], v: 'bottom', align: 'left' }, mplace: 'below', height: 'screen', caption: true,
  slots: [{ d: [4, 4, 92, 74], m: [0, 0, 100, 100], intent: 'editorial', anchor: 'ct', z: 3, role: 'focal' }],
});
A.luxe = (S, e) => ({
  place: { gc: [1, 4], v: 'bottom', align: 'left' }, mplace: 'below', height: 'screen',
  slots: [{ d: [42, 16, 16, 54], m: [28, 8, 44, 84], intent: e.freeFirst ? 'floating' : 'framed', mask: e.freeFirst ? 'none' : 'window', anchor: 'cb', z: 5, role: 'focal' }],
  decos: [{ kind: 'shape', form: 'line', fill: 'muted', d: [42, 76, 16, 0.4], m: [28, 96, 44, 0.6], z: 3, opacity: 0.6, role: 'support' }],
});
A.dense = (S, e) => (S.text.items.length >= 3 ? {
  place: { gc: [1, 12], v: 'top', align: 'left' }, mplace: 'above', height: 'auto', grid: true,
  slots: [{ d: [84, 4, 11, 16], m: [70, 4, 26, 90], intent: 'masked', mask: 'circle', anchor: 'cm', z: 3, role: 'support', optional: true }],
  decos: [{ kind: 'shape', form: e.personality === 'playful' ? 'dots' : 'stripes', fill: 'accent', d: [0, 82, 100, 18], m: [0, 70, 100, 30], z: 1, opacity: 0.14, role: 'texture' }],
} : null);
A.depth = (S, e) => ({
  place: { gc: [1, 5], v: 'middle', align: 'left' }, mplace: 'above', height: 'screen',
  slots: [{ d: [46, 8, 44, 84], m: [12, 4, 76, 92], intent: e.freeFirst ? 'floating' : 'framed', mask: e.freeFirst ? 'none' : 'arch', anchor: 'cb', z: 5, role: 'focal' },
    { d: [-6, -6, 112, 112], m: [-8, -8, 116, 116], intent: 'texture', anchor: 'cm', z: 1, role: 'texture', optional: true, opacity: 0.26, textureOnly: true }],
  decos: [{ kind: 'shape', form: 'ring', fill: 'glow', d: [78, 60, 16, 30], m: [70, 66, 28, 30], z: 8, opacity: 0.45, role: 'support' },
    { kind: 'shape', form: 'circle', fill: 'accent', d: [38, 70, 10, 16], m: [2, 70, 20, 22], z: 2, opacity: 0.35, role: 'support' }],
});
A.brutalist = (S, e) => ({
  place: { gc: [1, 7], v: 'top', align: 'left' }, mplace: 'above', height: 'screen', table: true,
  slots: [{ d: [60, 6, 34, 60], m: [4, 4, 92, 92], intent: 'framed', mask: 'none', anchor: 'lt', z: 5, role: 'focal', optional: true, hard: true }],
  decos: [{ kind: 'shape', form: 'block', fill: 'accent', d: [64, 12, 34, 60], m: [10, 10, 90, 90], z: 3, opacity: 1, role: 'backdrop' }],
});
A.gallery = (S, e) => (e.images >= 2 ? {
  place: { gc: [1, 4], v: 'bottom', align: 'left' }, mplace: 'above', height: 'tall', steps: true, gallery: true,
  slots: [{ d: [34, 8, 56, 84], m: [6, 2, 88, 96], intent: 'framed', mask: 'window', anchor: 'cm', z: 5, role: 'focal', stepped: true }],
} : null);


// ---- the second vocabulary: an actor's scene, campaigns and takeovers, image-led narrative, lineups, streams, orbits
// An actor scene (inside a persistent actor's run): the actor is NOT one of the scene's layers -- it lives on the run's
// rail and moves between its poses; the scene composes its words on the side the actor has left free, with a halo where
// the actor stands and, on an opening or a type-led page, the subject's name set huge behind it.
A.stage = (S, e) => {
  if (!e.actorPose) return null;
  const x = e.actorPose.x; const cx = 50 + x; const steps = S.text.items.length >= 2;
  // (the words keep clear of the actor: the far side when it stands aside, above or below it when it stands in the middle)
  const place = x <= -8 ? { gc: [8, 12], v: 'middle', align: 'left' } : x >= 8 ? { gc: [1, 5], v: 'middle', align: 'left' } : e.hero ? { gc: [1, 5], v: 'bottom', align: 'left' } : { gc: [1, 4], v: 'top', align: 'left' };
  // the subject's name set huge behind the actor, on the actor's own side of the scene -- never under the words
  const wordBox = x <= -8 ? [-10, 30, 60, 38] : x >= 8 ? [50, 30, 60, 38] : [-4, 64, 108, 30];
  return {
    place, mplace: 'below', height: 'screen', steps, actorScene: true,
    decos: [{ kind: 'shape', form: 'circle', fill: 'glow', d: [Math.max(-10, cx - 22), 14, 44, 76], m: [10, 0, 80, 96], z: 1, opacity: 0.45, role: 'backdrop' }]
      .concat((e.hero || e.typo === 'giant' || e.typo === 'poster') && e.shortName ? [{ kind: 'word', text: e.name, style: e.personality === 'mechanical' || e.personality === 'kinetic' ? 'solid' : 'outline', d: wordBox, m: [-6, 30, 112, 30], z: 2, opacity: e.personality === 'luxe' ? 0.35 : 0.9, role: 'echo' }] : []),
  };
};
// a campaign: the name centred and large, the subject presented beneath it, the scene flooded in the accent colour
A.campaign = (S, e) => ({
  place: { gc: [2, 11], v: 'top', align: 'center' }, mplace: 'above', height: 'screen', takeover: 'accent',
  slots: [{ d: [33, 34, 34, 62], m: [16, 2, 68, 94], intent: e.freeFirst ? 'floating' : 'framed', mask: e.freeFirst ? 'none' : 'window', anchor: 'cb', z: 5, role: 'focal' }],
  decos: [{ kind: 'shape', form: 'circle', fill: 'glow', d: [28, 30, 44, 70], m: [6, 0, 88, 96], z: 2, opacity: 0.45, role: 'backdrop' }],
});
// a hard split screen: a picture fills one half, the other half is the accent colour field holding the words
A.splitscreen = (S, e) => {
  const right = e.side === 'right';
  return {
    place: right ? { gc: [1, 5], v: 'middle', align: 'left' } : { gc: [8, 12], v: 'middle', align: 'left' }, mplace: 'above', height: 'screen', takeover: 'accent', verticalKicker: true,
    slots: [{ d: right ? [50, 0, 50, 100] : [0, 0, 50, 100], m: [0, 0, 100, 100], intent: 'editorial', anchor: right ? 'rm' : 'lm', manchor: 'cm', z: 3, role: 'focal', hard: true }],
  };
};
// the object fills the screen: one cut-out subject nearly the scene's full height, the words small in its corner
A['fullscreen-object'] = (S, e) => (e.freeFirst ? {
  place: { gc: [1, 4], v: 'top', align: 'left' }, mplace: 'above', height: 'screen', smallHeading: true, verticalKicker: true,
  slots: [{ d: [24, 2, 52, 96], m: [8, 2, 84, 96], intent: 'floating', anchor: 'cb', z: 5, role: 'focal', freeOnly: true }],
  decos: [{ kind: 'shape', form: 'ring', fill: 'accent', d: [26, 6, 48, 88], m: [6, 4, 88, 92], z: 2, opacity: 0.3, role: 'backdrop' }],
} : null);
// object and text orbit: the subject at the centre, each line of the scene placed around it
A.orbit = (S, e) => (S.text.items.length >= 3 && S.text.items.every(it => it.text.length <= 150) ? {
  place: { gc: [1, 4], v: 'top', align: 'left' }, mplace: 'above', height: 'screen', orbit: true,
  slots: [{ d: [38, 24, 24, 56], m: [22, 4, 56, 92], intent: e.freeFirst ? 'floating' : 'framed', mask: e.freeFirst ? 'none' : 'circle', anchor: 'cm', z: 5, role: 'focal' }],
  decos: [{ kind: 'shape', form: 'ring', fill: 'muted', d: [30, 14, 40, 76], m: [10, 0, 80, 100], z: 2, opacity: 0.35, role: 'backdrop' }],
} : null);
// a minimal index: small pictures, each whole, in an even grid with a great deal of space
A.index = (S, e) => (e.images >= 3 ? {
  place: { gc: [1, 3], v: 'top', align: 'left' }, mplace: 'above', height: 'screen',
  slots: Array.from({ length: Math.min(6, e.images) }, (_, k) => ({ d: [36 + (k % 3) * 20, 16 + Math.floor(k / 3) * 40, 16, 30], m: [4 + (k % 2) * 48, 2 + Math.floor(k / 2) * 33, 44, 30], intent: 'framed', mask: 'window', anchor: 'cm', z: 4, role: k ? 'support' : 'focal', optional: k > 2 })),
} : null);
// a scrapbook: pictures pinned at angles with tape, and the lines written beside them like notes
A.scrapbook = (S, e) => (e.images >= 2 ? {
  place: { gc: [1, 4], v: 'bottom', align: 'left' }, mplace: 'above', height: 'screen', notes: true,
  slots: [{ d: [38, 8, 28, 50], m: [4, 2, 54, 46], intent: 'collage', mask: 'polaroid', rot: -5, anchor: 'cm', z: 5, role: 'focal' },
    { d: [64, 30, 26, 44], m: [44, 30, 52, 40], intent: 'collage', mask: 'polaroid', rot: 4, anchor: 'cm', z: 6, role: 'support' },
    { d: [46, 58, 22, 36], m: [10, 64, 44, 34], intent: 'collage', mask: 'torn', rot: -2, anchor: 'cm', z: 4, role: 'support', optional: true }],
  decos: [{ kind: 'shape', form: 'tape', fill: 'glow', d: [44, 6, 10, 4], m: [16, 0, 22, 5], z: 8, opacity: 0.75, role: 'support', rot: -8 },
    { kind: 'shape', form: 'tape', fill: 'glow', d: [72, 28, 10, 4], m: [62, 28, 22, 5], z: 8, opacity: 0.75, role: 'support', rot: 12 }],
} : null);
// a typographic takeover: one statement fills the scene, its words filling in as it is read
A.takeover = (S, e) => ((S.text.body || S.text.heading || '').split(/\s+/).length >= 6 ? {
  place: { gc: [1, 11], v: 'middle', align: 'left' }, mplace: 'above', height: 'screen', takeoverType: true,
} : null);
// chapters: full-bleed pictures one after another while the scroll holds, each with its own title at the foot
A.chapters = (S, e) => (e.images >= 2 ? {
  place: { gc: [1, 6], v: 'bottom', align: 'left' }, mplace: 'overlay', height: 'tall', steps: true, chapters: true, shade: 'bottom',
  slots: [{ d: [0, 0, 100, 100], m: [0, 0, 100, 100], intent: 'bleed', anchor: 'cm', z: 3, role: 'focal', stepped: true }],
} : null);
// a lineup: the subject and its kin in a row, in perspective, the centre one lifted on a plinth
A.lineup = (S, e) => {
  const n = Math.min(7, e.images); if (n < 3) return null; const mid = (n - 1) / 2;
  return {
    place: { gc: [3, 10], v: 'bottom', align: 'center' }, mplace: 'below', height: 'screen', smallHeading: true,
    slots: Array.from({ length: n }, (_, k) => { const off = Math.abs(k - mid); const w = 76 / n; return { d: [12 + k * w, 22 + off * 5, w * 0.9, 50 - off * 7], m: [2 + k * (96 / n), 20 + off * 6, (96 / n) * 0.92, 60 - off * 8], intent: 'floating', mask: 'window', anchor: 'cb', z: 7 - Math.round(off), role: k === Math.round(mid) ? 'focal' : 'support', rot: (k - mid) * 3, optional: k >= 3 }; }),
    decos: [{ kind: 'shape', form: 'circle', fill: 'glow', d: [36, 60, 28, 18], m: [20, 76, 60, 20], z: 1, opacity: 0.55, role: 'backdrop' }],
  };
};
// a card stream: framed pictures in depth, flying toward the viewer one after another while the scroll holds
A.cardstream = (S, e) => (e.images >= 3 ? {
  place: { gc: [1, 4], v: 'bottom', align: 'left' }, mplace: 'above', height: 'tall', cards: true,
  slots: Array.from({ length: Math.min(5, e.images) }, (_, k) => ({ d: [36 + ((k % 2) ? 10 : -6), 18 + (k % 3) * 4, 30, 60], m: [12 + ((k % 2) ? 6 : -4), 6, 76, 88], intent: 'framed', mask: 'window', anchor: 'cm', z: 8 - k, role: k ? 'support' : 'focal', optional: k > 2, card: k })),
} : null);
// an edge crop: one picture flush to the scene's edge, cropped close on purpose around its (located) subject
A['edge-crop'] = (S, e) => (e.focalKnown ? {
  place: { gc: [1, 5], v: 'middle', align: 'left' }, mplace: 'above', height: 'screen',
  slots: [{ d: [42, 0, 58, 100], m: [0, 0, 100, 100], intent: 'detail', anchor: 'rm', manchor: 'cm', z: 3, role: 'focal', hard: true }],
} : null);

// ---------------------------------------------------------------- motion by personality
const ENTRANCE = { editorial: ['fade', 'unveil'], cinematic: ['fade', 'fade'], kinetic: ['slide-left', 'slide-right'], playful: ['pop', 'drop'], luxe: ['fade', 'fade'], mechanical: ['unveil', 'slide-left'], chaotic: ['spin-in', 'drop'], still: ['fade', 'fade'] };
const TEXT_IN = { editorial: 'rise', cinematic: 'fade', kinetic: 'split-words', playful: 'split-words', luxe: 'fade', mechanical: 'split-words', chaotic: 'split-words', still: 'fade' };
function motionFor(L, e, i, free) {
  const M = MOTION[e.personality] || MOTION.editorial; const en = ENTRANCE[e.personality] || ENTRANCE.editorial;
  const slow = e.personality === 'luxe' || e.personality === 'cinematic' || e.personality === 'still';
  L.entrance = { kind: en[i % 2], delay: +(0.15 + i * (slow ? 0.25 : 0.12)).toFixed(2), dur: slow ? 1.6 : e.personality === 'kinetic' || e.personality === 'mechanical' ? 0.8 : 1.1 };
  // ambient life: a cut-out breathes or floats; a framed picture holds still (no zoom creeping into its crop)
  if (M.loops === 'none' || L.role === 'texture' || L.role === 'backdrop') L.loop = { kind: 'none', amp: 1, period: 9 };
  else if (L.kind === 'image') L.loop = free && i === 0 ? { kind: e.personality === 'playful' || e.personality === 'chaotic' ? 'bob' : 'float', amp: M.loops === 'lively' ? 1.2 : 0.8, period: slow ? 12 : 8 } : L.kind === 'image' && L.fit === 'cover' && M.loops === 'gentle' && i === 0 ? { kind: 'sheen', amp: 0.6, period: 11 } : { kind: 'none', amp: 1, period: 9 };
  else L.loop = L.kind === 'shape' && i < 2 && M.loops !== 'none' ? { kind: L.shape && L.shape.form === 'ring' ? 'spin' : 'breathe', amp: 0.8, period: 24 } : { kind: 'none', amp: 1, period: 9 };
  L.scroll = { kind: 'none', amount: 0 };
}

// ---------------------------------------------------------------- compose
function composeScene(S, env) {
  const e = Object.assign({}, env);
  const byId = e.byId; const fixes = e.fixes || []; const warnings = e.warnings || [];
  e.personality = (e.art && e.art.personality) || 'editorial';
  const imgs = S.layers.filter(L => L.kind === 'image' && byId.get(L.asset));
  const decosIn = S.layers.filter(L => L.kind !== 'image');
  // the focal picture first, then the rest in the plan's order
  imgs.sort((a, b) => (b.role === 'focal') - (a.role === 'focal'));
  const isFree = L => F.profile(byId.get(L.asset)).free;
  e.freeFirst = !!(imgs[0] && isFree(imgs[0])); e.free = imgs.filter(isFree).length; e.focalAspect = imgs[0] ? F.profile(byId.get(imgs[0].asset)).aspect : 1;
  // (an intentional close crop needs a subject that was located, with room around it)
  const p0 = imgs[0] ? F.profile(byId.get(imgs[0].asset)) : null; e.focalKnown = !!(p0 && !p0.free && !p0.tight && p0.source !== 'unknown' && p0.big);
  e.typo = e.art && e.art.typo; e.mode = (e.art && e.art.mode) || 'expressive';
  e.images = new Set(imgs.map(L => { const a = byId.get(L.asset); return (a && a.cutoutOf) || L.asset; })).size;
  e.name = String(e.name || '').slice(0, 24); e.shortName = e.name.length > 0 && e.name.length <= 18 && e.name.split(/\s+/).length <= 3;
  e.side = e.side || (e.rng() < 0.5 ? 'right' : 'left');
  let layout = S.layout; let spec = A[layout] ? A[layout](S, e) : null;
  // the first archetype (in the fallback chain) that this scene's pictures and words can carry
  // (an archetype needs a picture for each of its required slots)
  const tryLayout = l => { const sp = A[l] && A[l](S, e); return sp && (sp.slots || []).filter(s => !s.optional).length > imgs.length ? null : sp; };
  if (spec && (spec.slots || []).filter(s => !s.optional).length > imgs.length) spec = null;
  if (spec && spec.slots && spec.slots.some(s => s.needs === 'bleed') && imgs[0]) {
    const a = byId.get(imgs[0].asset); const p = F.profile(a);
    const slot = spec.slots[0]; const ab = slot.d[2] * 1.6 / slot.d[3];
    if (p.free || p.tight || F.coverCrop(p.aspect, ab).crop > F.budgetFor(a, 'bleed') + 0.02) { spec = null; }
  }
  for (const alt of FALLBACK[layout] || []) { if (spec) break; if (alt === 'text' && imgs.length) continue; spec = tryLayout(alt); if (spec) layout = alt; }
  // a scene that has a picture is never composed as words alone (the picture would be dropped and the scene left as a
  // colour block): the first composition that can show it
  for (const alt of PICTURE_SAFE) { if (spec || !imgs.length) break; spec = tryLayout(alt); if (spec) layout = alt; }
  if (!spec) { layout = 'text'; spec = A.text(S, e); }
  if (layout !== S.layout) fixes.push(`scene ${S.id}: a ${S.layout} composition needs ${S.layout === 'editorial-hero' || S.layout === 'cinematic' ? 'a wide, uncropped picture' : S.layout === 'collage' || S.layout === 'strip' || S.layout === 'gallery' ? 'more pictures' : S.layout === 'sticky-steps' || S.layout === 'dense' ? 'more lines' : 'a different picture'} -- composed as ${layout}`);
  S.layout = layout;
  const stageM = 100 / (MSTAGE[layout] || 108);
  const out = [];
  // ---- pictures into their slots
  const slots = (spec.slots || []).slice();
  let pool = imgs.slice();
  if (spec.track) {
    // a horizontal strip: every picture at one height, each shown whole at its own width, one after another
    // (the renderer lays the panels out in a row at one height, each as wide as its own picture: the boxes are nominal)
    pool.slice(0, 6).forEach((L, i) => {
      const a = byId.get(L.asset); const p = F.profile(a); const asp = Math.max(0.62, Math.min(1.8, p.aspect));
      L.box = { d: [0, 0, 100, 100], m: [0, 0, 100, 100] }; L.track = true;
      // a picture far wider or taller than a panel may be is lightly cropped to it (at most ~15%); the rest are whole
      Object.assign(L, { fit: Math.abs(p.aspect - asp) < 0.01 ? 'contain' : 'cover', focus: '50% 50%', frame: Math.abs(p.aspect - asp) < 0.01 ? 'framed' : 'light', mask: p.free ? 'none' : 'window', rotate: 0, z: 5, opacity: 1, role: i === 0 ? 'focal' : 'support' });
      if (L.fit === 'cover') L.focus = F.objectPosition(p, F.coverCrop(p.aspect, asp));
      delete L.mfit; delete L.mfocus; delete L.step;
      out.push(L); motionFor(L, e, i, p.free);
    });
    if (pool.length > 6) fixes.push(`scene ${S.id}: a strip shows at most six pictures`);
    pool = [];
  }
  slots.forEach((slot, si) => {
    let L = null;
    if (slot.textureOnly) { const k = pool.findIndex(x => { const a = byId.get(x.asset); const c = a && a.curation; return c && (c.role === 'environment' || c.role === 'detail') && !F.profile(a).free; }); if (k >= 0) L = pool.splice(k, 1)[0]; }
    else if (slot.freeOnly) { const k = pool.findIndex(isFree); if (k >= 0) L = pool.splice(k, 1)[0]; }
    else L = pool.shift() || null;
    if (!L) return;
    const a = byId.get(L.asset);
    L.box = { d: slot.d.slice(), m: slot.m.slice() }; L.role = slot.role === 'focal' ? 'focal' : slot.role;
    L.z = slot.z; L.rotate = slot.rot || 0; L.opacity = slot.opacity || 1;
    L.mask = F.profile(a).free ? 'none' : (slot.mask || (slot.intent === 'framed' ? 'window' : 'none'));
    L.frame = L.frame && F.FRAMES.includes(L.frame) && L.frame !== 'auto' && slot.intent !== 'texture' && slot.intent !== 'bleed' && slot.intent !== 'collage' ? L.frame : slot.intent;
    // the plan may ask for an explicit detail crop -- only where the archetype frames a picture in its own container
    if (L.frame === 'detail' && !['split', 'image', 'magazine', 'sticky-steps', 'framed'].includes(layout)) L.frame = slot.intent;
    const fd = F.frameLayer(L, a, 'd', { stageAspect: spec.height === 'short' ? 2.5 : 1.6, anchor: slot.anchor, mask: L.mask });
    const fm = F.frameLayer(L, a, 'm', { stageAspect: stageM, anchor: slot.manchor || slot.anchor, mask: L.mask });
    fd.notes.concat(fm.notes).forEach(n => { if (!fixes.includes(`scene ${S.id}: ${n}`)) fixes.push(`scene ${S.id}: ${n}`); });
    L.box = { d: fd.box, m: fm.box }; L.fit = fd.fit; L.focus = fd.focus; L.frame = fd.intent;
    if (fm.fit !== fd.fit || fm.focus !== fd.focus) { L.mfit = fm.fit; L.mfocus = fm.focus; } else { delete L.mfit; delete L.mfocus; }
    // a framed or contained flat photo is framed deliberately (never a bare rectangle), a cover crop inside a shaped mask
    if (!fd.profile.free && L.mask === 'none' && fd.intent !== 'bleed' && fd.intent !== 'texture' && !slot.hard) L.mask = fd.fit === 'contain' ? 'window' : 'none';
    // a shaped mask (circle, arch...) cuts into whatever it holds: only a picture cropped within its budget goes in one;
    // a picture shown whole gets a rectangular frame instead
    if (fd.fit === 'contain' && SHAPED.includes(L.mask)) L.mask = 'window';
    if (slot.hard) L.mask = 'none';
    delete L.edge; delete L.group;
    if (slot.stepped) L.step = 0; else delete L.step;
    if (slot.card != null) L.seq = slot.card; else delete L.seq;
    out.push(L); motionFor(L, e, out.length - 1, fd.profile.free);
  });
  // stepped scenes: the remaining pictures take later steps in the same slot (the visual changes with the words)
  const stepSlot = slots.find(s => s.stepped);
  if (stepSlot && pool.length) {
    const steps = spec.gallery ? Math.min(5, 1 + pool.length) : Math.max(2, Math.min(6, S.text.items.length));
    pool.splice(0, steps - 1).forEach((L, k) => {
      const a = byId.get(L.asset);
      L.box = { d: stepSlot.d.slice(), m: stepSlot.m.slice() }; L.role = 'support'; L.z = stepSlot.z + 1 + k; L.rotate = spec.gallery && e.personality !== 'luxe' ? [-2, 2.5, -1.5, 3][k % 4] : 0; L.opacity = 1;
      L.mask = F.profile(a).free ? 'none' : (stepSlot.mask || 'window'); L.frame = stepSlot.intent;
      const fd = F.frameLayer(L, a, 'd', { stageAspect: 1.6, anchor: stepSlot.anchor, mask: L.mask }); const fm = F.frameLayer(L, a, 'm', { stageAspect: stageM, anchor: stepSlot.anchor, mask: L.mask });
      L.box = { d: fd.box, m: fm.box }; L.fit = fd.fit; L.focus = fd.focus; L.frame = fd.intent; if (fm.fit !== fd.fit || fm.focus !== fd.focus) { L.mfit = fm.fit; L.mfocus = fm.focus; }
      if (!fd.profile.free && L.mask === 'none') L.mask = 'window';
      L.step = k + 1; delete L.edge; delete L.group; out.push(L); motionFor(L, e, 1, fd.profile.free);
    });
  }
  if (pool.length) fixes.push(`scene ${S.id}: ${pool.length} picture(s) beyond what a ${layout} composition shows were left out of this scene`);
  // ---- decoration: the plan's own shapes and words take the archetype's decoration places; the archetype adds its own
  // only where it needs them (a poster's giant word is the subject's own name -- never a new claim)
  const decos = (spec.decos || []).slice(); const given = decosIn.slice();
  decos.forEach((dk, k) => {
    let L = given.findIndex(g => g.kind === dk.kind);
    L = L >= 0 ? given.splice(L, 1)[0] : null;
    if (!L) {
      if (dk.kind === 'word' && !dk.text) return;
      L = { id: `art-${dk.kind}-${k + 1}`, kind: dk.kind, role: dk.role, rotate: 0, mask: 'none', treatment: 'none', entrance: { kind: 'fade', delay: 0.2, dur: 1.2 }, loop: { kind: 'none', amp: 1, period: 9 }, scroll: { kind: 'none', amount: 0 }, hideM: false };
      if (dk.kind === 'shape') L.shape = { form: dk.form, fill: dk.fill, stroke: false }; else L.word = { text: dk.text, style: dk.style };
    } else if (dk.kind === 'shape' && L.shape && dk.form === 'block') L.shape.form = 'block';
    L.box = { d: dk.d.slice(), m: dk.m.slice() }; L.z = dk.z; L.opacity = dk.opacity; L.role = dk.role; L.rotate = dk.rot || L.rotate || 0;
    if (dk.kind === 'word' && L.word && dk.style) L.word.style = dk.style;
    motionFor(L, e, out.length, false);
    out.push(L);
  });
  if (given.length) fixes.push(`scene ${S.id}: ${given.length} decorative layer(s) the ${layout} composition has no place for were left out`);
  S.layers = out;
  // ---- the words
  const t = S.text;
  t.place = Object.assign({}, spec.place); t.mplace = spec.mplace;
  if (spec.giant) { t.size = 'display'; t.giant = true; } else delete t.giant;
  if (spec.smallHeading || spec.shrineTitle) t.size = e.hero ? 'large' : 'medium';
  if (layout === 'cinematic') S.tone = '#0b0b0d'; else if (S.tone === '#0b0b0d') delete S.tone;
  if (layout === 'luxe' || layout === 'image') t.size = t.size === 'display' && e.hero ? 'large' : 'medium';
  if (layout === 'editorial-hero' && e.hero) t.size = 'display';
  if (layout === 'campaign') t.size = 'display';
  if (spec.columns) t.columns = true; else delete t.columns;
  if (layout === 'dense') t.list = t.list === 'plain' ? 'labelled' : t.list;
  if (layout === 'sticky-steps' || layout === 'gallery' || layout === 'chapters' || layout === 'orbit' || (layout === 'stage' && spec.steps)) t.list = t.list === 'timeline' && layout !== 'orbit' && layout !== 'chapters' ? 'timeline' : 'labelled';
  if (spec.notes) t.list = 'notes';
  // a campaign or a split screen floods its scene in the accent colour (the words are re-coloured against it)
  if (spec.takeover === 'accent' && !S.tone) S.background = 'accent';
  t.entrance = TEXT_IN[e.personality] || 'rise';
  if (t.entrance === 'split-words' && (t.heading || '').length > 60) t.entrance = 'rise';
  t.width = layout === 'luxe' ? 'narrow' : layout === 'text' || layout === 'dense' || layout === 'takeover' ? 'wide' : t.width;
  // how the words are set: a takeover's statement fills in word by word; a short giant headline spreads its letters as it
  // plays on an expressive page; a split screen or a full-screen object runs its kicker up the edge
  delete t.treatment;
  if (spec.takeoverType) { t.treatment = 'word-fill'; t.size = 'display'; }
  else if ((layout === 'giant-type' || layout === 'poster' || layout === 'campaign') && (t.heading || '').length <= 18 && ['kinetic', 'mechanical', 'chaotic'].includes(e.personality) && (e.mode === 'expressive' || e.mode === 'immersive')) t.treatment = 'letter-spread';
  else if (spec.verticalKicker && t.kicker) t.treatment = 'vertical';
  else if (layout === 'campaign' && e.personality === 'chaotic') t.treatment = 'outline';
  // the legacy region (for anything that still reads it) follows the new place
  const [c0, c1] = t.place.gc; const cx = (COL(c0) + COL(c1 + 1)) / 2;
  t.region = c1 - c0 >= 8 ? (t.place.v === 'bottom' ? 'bottom' : t.place.v === 'top' ? 'top' : 'center') : `${t.place.v === 'bottom' ? 'bottom-' : t.place.v === 'top' ? 'top-' : ''}${cx < 50 ? 'left' : 'right'}`;
  if (!['left', 'right', 'center', 'bottom-left', 'bottom-right', 'bottom', 'top-left', 'top-right', 'top'].includes(t.region)) t.region = 'left';
  delete t.scrim;
  // the words must stay clear of the main picture unless the archetype layers them on purpose (a caption on a
  // full-bleed picture sits on a shade; giant type crosses the picture behind it)
  const tr = textRect(t, t.place);
  const deliberate = spec.shade || spec.giant || spec.track || spec.cards || spec.orbit || ['poster', 'dense', 'lineup', 'index', 'takeover', 'stage'].includes(layout);
  if (!deliberate) out.filter(L => L.kind === 'image' && L.role !== 'texture' && L.role !== 'backdrop' && (L.step == null || L.step === 0)).forEach(L => {
    const d = L.box.d; if (overlap(d, tr) > Math.min(d[2] * d[3], tr[2] * tr[3]) * 0.12) { t.scrim = true; warnings.push(`scene ${S.id}: the words are long for a ${layout} composition -- they sit on a panel over the picture`); }
  });
  if (spec.shade) t.shade = spec.shade; else delete t.shade;
  // ---- height, pin, choreography
  const allowed = (NATURAL[layout] || ['settle']).concat(['settle']);
  let ch = allowed.includes(S.choreo) ? S.choreo : allowed[0];
  if (e.personality === 'still' && ch !== 'settle' && ch !== 'mask-reveal') ch = 'settle';
  if (spec.track) ch = 'track';
  if (spec.steps) ch = spec.chapters ? 'chapters' : spec.gallery ? (S.choreo === 'pin-steps' ? 'pin-steps' : 'stack') : 'pin-steps';
  if (spec.cards) ch = 'cardstream';
  if (spec.takeoverType) ch = 'word-fill';
  if (spec.actorScene && !spec.steps) ch = 'actor';
  // a choreography needs something to play with: otherwise the scene settles (no held scroll with nothing happening)
  const focalImg = out.find(L => L.kind === 'image' && L.role === 'focal');
  const has = { 'zoom-away': !!focalImg, 'scale-through': out.some(L => L.role === 'echo' || L.role === 'backdrop' || L.kind === 'word'), 'mask-reveal': out.some(L => L.role === 'focal'), travel: out.some(L => L.role === 'focal'), depth: out.length >= 2, expand: !!focalImg, cardstream: out.filter(L => L.seq != null).length >= 3, chapters: out.filter(L => L.step != null).length >= 2, actor: !!e.actorPose };
  if (has[ch] === false) { const alt = allowed.find(x => x !== ch && has[x] !== false && !PINNED.includes(x)) || 'settle'; fixes.push(`scene ${S.id}: nothing here for a ${ch} to move -- it ${alt === 'settle' ? 'settles' : `plays as ${alt}`}`); ch = alt; }
  // the mode decides what may hold the scroll: a quiet page holds nothing; an editorial page one scene
  const lim = MODE_LIMITS[e.mode] || MODE_LIMITS.expressive;
  if (lim.pins === 0 && PINNED.includes(ch)) { const alt = allowed.find(x => !PINNED.includes(x)) || 'settle'; fixes.push(`scene ${S.id}: a quiet page holds nothing -- the ${ch} ${alt === 'settle' ? 'settles' : `plays as ${alt}`}`); ch = alt; }
  // an expanding picture: the picture is laid out at full bleed and seen first through its own window, which opens to
  // fill the scene -- the picture itself is never enlarged. A picture that cannot fill the scene within its bleed
  // budget reveals itself in its frame instead.
  if (ch === 'expand' && focalImg) {
    const a = byId.get(focalImg.asset); const probe = Object.assign({}, focalImg, { frame: 'bleed', box: { d: [0, 0, 100, 100], m: [0, 0, 100, 100] } });
    const fd = F.frameLayer(probe, a, 'd', { stageAspect: 1.6, anchor: 'cm' }); const fm = F.frameLayer(probe, a, 'm', { stageAspect: 100 / (MSTAGE[layout] || 108), anchor: 'cm' });
    const fills = r => r.fit === 'cover' && (!r.box || (r.box[2] >= 99 && r.box[3] >= 99));
    if (fills(fd) && fills(fm)) {
      focalImg.win = focalImg.box.d.map(v => Math.round(v * 10) / 10); focalImg.box = { d: [0, 0, 100, 100], m: [0, 0, 100, 100] };
      Object.assign(focalImg, { fit: 'cover', focus: fd.focus, frame: 'bleed', mask: 'none', rotate: 0 }); delete focalImg.mfit; if (fm.focus !== fd.focus) focalImg.mfocus = fm.focus; else delete focalImg.mfocus;
      out.forEach(L => { if (L !== focalImg && L.kind === 'image') L.hideM = true; });
    } else { ch = 'mask-reveal'; fixes.push(`scene ${S.id}: ${a && a.id} cannot fill the scene without a heavy crop -- it is revealed in its frame instead of expanding`); }
  }
  if (ch !== 'expand' && out.some(L => L.win)) out.forEach(L => { delete L.win; });
  S.choreo = ch;
  // a takeover holds the scroll while its words fill in only on an expressive page; elsewhere it fills as it passes
  S.pin = PINNED.includes(ch) || (ch === 'word-fill' && lim.pins > 1);
  S.height = S.pin ? 'tall' : spec.height;
  if (!S.pin) unstep(S);
  if (S.pin && spec.steps) { const n = spec.chapters ? Math.max(2, Math.min(5, out.filter(L => L.step != null).length)) : Math.max(2, Math.min(6, Math.max(S.text.items.length, 1 + out.filter(L => L.step > 0).length))); S.steps = spec.chapters ? Math.max(n, Math.min(5, S.text.items.length)) : n; } else if (S.pin) S.steps = 1; else delete S.steps;
  // what the scene is, and how its own content leaves as it scrolls away (only a scene the scroll already drives)
  S.sceneType = layout === 'stage' ? 'carry' : layout === 'chapters' || layout === 'cinematic' || layout === 'editorial-hero' ? 'cinematic' : layout === 'takeover' ? 'typography' : layout === 'sticky-steps' ? 'sticky-editorial'
    : ['gallery', 'index', 'cardstream', 'strip', 'lineup', 'scrapbook', 'collage'].includes(layout) ? 'gallery' : spec.takeover ? 'takeover' : ch === 'expand' ? 'transition' : S.pin ? 'pinned' : 'section';
  const EXIT_BY = { cinematic: 'fade', luxe: 'fade', kinetic: 'lift', mechanical: 'lift', playful: 'shrink', chaotic: 'shrink' };
  if (!e.hero && !S.pin && ch !== 'settle' && ch !== 'actor' && EXIT_BY[e.personality]) S.exit = EXIT_BY[e.personality]; else delete S.exit;
  S.camera = 'none';
  S.mobile = { order: t.mplace === 'below' ? 'stage-first' : 'text-first' };
  return S;
}

// the carry between two scenes: the previous scene's main picture leaves toward one side as this one's arrives from
// the other, so one object seems to travel across the seam
function linkCarry(prev, S) {
  const a = prev.layers.find(L => L.role === 'focal' && L.kind === 'image'); const b = S.layers.find(L => L.role === 'focal' && L.kind === 'image');
  if (!a || !b) return false;
  const side = a.box.d[0] + a.box.d[2] / 2 >= 50 ? 'right' : 'left';
  a.exit = side; b.enter = side === 'right' ? 'left' : 'right';
  return true;
}

// a scene that does not hold the scroll shows no steps: its first picture stays, the pictures of later steps go (they would
// otherwise sit on top of one another in the same place), and its lines are listed one under another
function unstep(S) { if (!S.layers.some(L => L.step > 0)) { S.layers.forEach(L => { delete L.step; }); return; } S.layers = S.layers.filter(L => !(L.step > 0)); S.layers.forEach(L => { delete L.step; }); delete S.steps; }
module.exports = { composeScene, unstep, linkCarry, textHeight, textRect, MSTAGE, PINNED, FALLBACK, ARCHETYPES: Object.keys(A) };
