'use strict';
// CREATIVE — TRUE 3D: the vocabulary and the motion (shared: validator, browser engine, tests).
//
// A 3D scene is never code. It names a COMPOSITION (how the model is staged) and an INTERACTION (what moves it), and
// carries a few bounded numbers; pose() turns those and the page's inputs -- scroll progress, pointer, clicks, time --
// into where the model and the camera are. The engine (lib/three-d/runtime-src.js, built into vendor/three-d/) draws
// exactly what pose() says, so the motion is the same function in the browser and in the tests.

// what moves the model
const INTERACTIONS = ['none', 'scroll-rotate', 'scroll-orbit', 'pointer-tilt', 'click-rotate'];
// how it is staged: each composition is a preset of the bounded scene fields (a scene may override them within CAMERA)
//   turns   how far the scroll turns the model (or the camera), in full turns over the scene's progress
//   float   an idle bob (0 none .. 1), stopped by reduced motion (the 3D layer does not start at all then)
//   reveal  the model grows and fades in over the first part of the scene's progress
//   dolly   the camera travels toward the model over the scene's progress (a fraction of its distance)
const COMPOSITIONS = {
  'scroll-rotate': { interaction: 'scroll-rotate', camera: { fov: 32, azimuth: 0, elevation: 8, distance: 1 }, turns: 1, float: 0, reveal: 0, dolly: 0 },
  'orbit-product': { interaction: 'scroll-orbit', camera: { fov: 30, azimuth: -25, elevation: 12, distance: 1.05 }, turns: 0.75, float: 0, reveal: 0, dolly: 0 },
  'floating-object': { interaction: 'pointer-tilt', camera: { fov: 34, azimuth: 18, elevation: 6, distance: 1.1 }, turns: 0, float: 1, reveal: 0, dolly: 0 },
  'camera-pass': { interaction: 'scroll-orbit', camera: { fov: 40, azimuth: -40, elevation: 4, distance: 1.5 }, turns: 0.22, float: 0, reveal: 0, dolly: 0.5 },
  'hero-sculpture': { interaction: 'pointer-tilt', camera: { fov: 28, azimuth: 20, elevation: 10, distance: 1 }, turns: 0, float: 0.4, reveal: 0, dolly: 0 },
  'object-reveal': { interaction: 'scroll-rotate', camera: { fov: 32, azimuth: 0, elevation: 10, distance: 1 }, turns: 0.5, float: 0, reveal: 1, dolly: 0 },
  // (a model shaped from the owner's single photo -- three-d/lathe.js: it turns only through the side the photo shows)
  'label-turn': { interaction: 'scroll-rotate', camera: { fov: 30, azimuth: 0, elevation: 7, distance: 1 }, turns: 0.25, float: 0.25, reveal: 0, dolly: 0 },
};
const COMPOSITION_NAMES = Object.keys(COMPOSITIONS);
// (the one composition proven end to end in a browser in phase 1; the others are presets of the same engine)
const DEMO_COMPOSITION = 'scroll-rotate';
const LIGHTING = ['studio', 'soft', 'dramatic', 'neutral'];
const BACKGROUNDS = ['transparent', 'surface'];
const PHONE = ['lite', 'poster'];
// the bounds of every camera number: fov and angles in degrees, distance as a multiple of the distance that frames the model
const CAMERA = { fov: [20, 60], azimuth: [-180, 180], elevation: [-30, 60], distance: [0.6, 3] };
const TURNS = [0, 4];
// pointer tilt (radians) and click steps
const TILT = { y: 0.42, x: 0.22 };
// (a phone's tilt -- sent by the page's kinetic layer as 'cr-tilt' -- leans any staging a little, on top of its own move)
const GYRO = { y: 0.38, x: 0.16 };
const CLICK_STEP = Math.PI / 2;

const TAU = Math.PI * 2;
const cl = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const fin = (v, d) => (typeof v === 'number' && isFinite(v) ? v : d);
const smooth = t => { const x = cl(t, 0, 1); return x * x * (3 - 2 * x); };

// The pose of one scene.
//   scene: { composition, interaction, camera: { fov, azimuth, elevation, distance }, turns }  (validated: three-d.js)
//   input: { p: the scene's scroll progress 0..1, anchor: the progress at which the model rests facing front (0 for a
//            pinned scene -- it turns through its hold -- 0.5 for a scene that scrolls by), px, py: pointer -1..1,
//            clicks: whole clicks so far, t: seconds }
// -> { rotY, rotX (the model, radians), azimuth, elevation (the camera, degrees), distance (multiple of the fit
//      distance), fov, lift (fraction of the model's size), scale, opacity }
function pose(scene, input) {
  const s = scene || {}; const i = input || {};
  const C = COMPOSITIONS[s.composition] || COMPOSITIONS[DEMO_COMPOSITION];
  const cam = Object.assign({}, C.camera, s.camera || {});
  const kind = INTERACTIONS.includes(s.interaction) ? s.interaction : C.interaction;
  const turns = cl(fin(s.turns, C.turns), TURNS[0], TURNS[1]);
  const p = cl(fin(i.p, 0), 0, 1); const anchor = cl(fin(i.anchor, 0), 0, 1);
  const out = { rotY: 0, rotX: 0, azimuth: fin(cam.azimuth, 0), elevation: fin(cam.elevation, 0), distance: fin(cam.distance, 1), fov: fin(cam.fov, 32), lift: 0, scale: 1, opacity: 1 };
  if (kind === 'scroll-rotate') out.rotY = (p - anchor) * turns * TAU;
  else if (kind === 'scroll-orbit') out.azimuth += (p - anchor) * turns * 360;
  else if (kind === 'pointer-tilt') { out.rotY = cl(fin(i.px, 0), -1, 1) * TILT.y; out.rotX = cl(fin(i.py, 0), -1, 1) * TILT.x; }
  else if (kind === 'click-rotate') out.rotY = Math.round(fin(i.clicks, 0)) * CLICK_STEP;
  if (i.gx || i.gy) { out.rotY += cl(fin(i.gx, 0), -1, 1) * GYRO.y; out.rotX += cl(fin(i.gy, 0), -1, 1) * GYRO.x; }
  if (C.dolly) out.distance *= 1 - C.dolly * smooth(p);
  if (C.reveal) { const r = smooth(p / 0.35); out.scale = 0.62 + 0.38 * r; out.opacity = r; }
  if (C.float) out.lift = Math.sin(fin(i.t, 0) * 0.9) * 0.018 * C.float;
  return out;
}

module.exports = { INTERACTIONS, COMPOSITIONS, COMPOSITION_NAMES, DEMO_COMPOSITION, LIGHTING, BACKGROUNDS, PHONE, CAMERA, TURNS, TILT, GYRO, CLICK_STEP, pose };
