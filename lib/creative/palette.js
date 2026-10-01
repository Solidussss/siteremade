'use strict';
// CREATIVE — image-driven colour. A page about pictures takes its colour FROM its pictures: each scene's surface is the
// colour identity of the picture it shows, so scrolling from a warm sunset to a blue sky moves the page itself from warm
// to blue -- and a scene without a picture of its own sits between its neighbours' colours instead of on a random block.
//
//   identity(asset)                       -> { hex, h, s, l, neutral } the picture's colour identity, from what was
//                                            measured (assets.js): its atmosphere (a coloured background) first, else its
//                                            most saturated subject colour -- assess.colours lists the SUBJECT's colours
//                                            (the background is measured separately), so a sky never wins by accident
//   fromColours(list)                     -> the same, for colours measured elsewhere (a premium video's frames)
//   tone(hex, page)                       -> a scene surface in that hue, set for the page's light (dark or light), so the
//                                            words keep their contrast (validate2's sceneInk re-checks them)
//   sceneTones(scenes, page, identities, opts) -> one tone per scene: its picture's, the gaps between filled from both
//                                            sides, and (opts.hero) a premium hero's cast carried into the scenes after it
// Data only, browser-safe (bundled into creative-core.js).

const HEX = /^#[0-9a-f]{6}$/i;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
function rgb(h) { return [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)); }
function toHex(r, g, b) { return '#' + [r, g, b].map(v => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join(''); }
function hsl(hex) {
  const [r, g, b] = rgb(hex).map(v => v / 255); const mx = Math.max(r, g, b), mn = Math.min(r, g, b); const l = (mx + mn) / 2; let h = 0, s = 0;
  if (mx !== mn) { const d = mx - mn; s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn); h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h /= 6; }
  return { h, s, l };
}
function fromHsl(h, s, l) {
  if (!s) return toHex(l * 255, l * 255, l * 255);
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s; const p = 2 * l - q;
  const f = t => { t = (t + 1) % 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; };
  return toHex(f(h + 1 / 3) * 255, f(h) * 255, f(h - 1 / 3) * 255);
}
function mix(a, b, t) { if (!HEX.test(a || '')) return b; if (!HEX.test(b || '')) return a; const x = rgb(a), y = rgb(b); return toHex(...x.map((v, i) => v + (y[i] - v) * t)); }
function lum(hex) { const c = rgb(hex).map(v => v / 255).map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; }
function distance(a, b) { if (!HEX.test(a || '') || !HEX.test(b || '')) return 0; const x = rgb(a), y = rgb(b); return Math.round(Math.sqrt(x.reduce((t, v, i) => t + (v - y[i]) ** 2, 0))); }
// how much a colour reads as a colour (saturation that is visible: not near-black, not near-white)
const vivid = c => c.s * (1 - Math.abs(c.l - 0.5) * 1.4);

const NEUTRAL = { hex: '', h: 0, s: 0, l: 0.5, neutral: true };
function describe(hex) { const c = hsl(hex); return { hex: hex.toLowerCase(), h: +c.h.toFixed(3), s: +c.s.toFixed(3), l: +c.l.toFixed(3), neutral: vivid(c) < 0.12 }; }
// (colours come most common first: how much of the picture a colour covers counts as much as how vivid it is -- a green
// box with a yellow centre is green)
const PROMINENCE = [1, 0.6, 0.4, 0.3, 0.25, 0.2, 0.15];
function fromColours(list) {
  const cs = (list || []).filter(x => HEX.test(x || '')); if (!cs.length) return NEUTRAL;
  const best = cs.map((x, i) => ({ x, v: vivid(hsl(x)), w: vivid(hsl(x)) * (PROMINENCE[i] || 0.1) })).filter(c => c.v >= 0.12).sort((a, b) => b.w - a.w)[0];
  return describe(best ? best.x : cs[0]);
}
function identity(asset) {
  const a = (asset && asset.assess) || {}; const bg = a.background || null; const cols = (a.colours || []).filter(x => HEX.test(x || ''));
  // a picture whose background is a colour (a sky, a sunset, a red wall) lives in that colour: it is what fills the frame
  if (!a.transparent && !(asset && asset.cutout) && bg && HEX.test(bg.colour || '') && bg.uniformity >= 0.35 && vivid(hsl(bg.colour)) >= 0.12) return describe(bg.colour);
  // otherwise (a cut-out, a plain studio background, a busy scene) its most vivid colour -- the background's too when busy
  const pool = cols.concat(!a.transparent && bg && bg.uniformity < 0.35 && HEX.test(bg.colour || '') ? [bg.colour] : []);
  return pool.length ? fromColours(pool) : NEUTRAL;
}
// a scene surface in a picture's hue: deep on a dark page, pale on a light one -- strong enough to read as that colour
function tone(hex, page) {
  const bg = (page && HEX.test(page.bg || '') && page.bg) || '#111114';
  if (!HEX.test(hex || '')) return bg.toLowerCase();
  const c = hsl(hex); if (vivid(c) < 0.12) return bg.toLowerCase();
  const dark = lum(bg) < 0.3;
  const t = dark ? fromHsl(c.h, clamp(c.s, 0.35, 0.72), 0.17) : fromHsl(c.h, clamp(c.s, 0.3, 0.6), 0.88);
  return mix(bg, t, 0.88).toLowerCase();
}
// one tone per scene. identities[i]: the hex of scene i's picture ('' when it has none). Scenes without a picture take
// the colour between their neighbours (leaning toward the one they lead into); a premium hero's cast (opts.hero: hex)
// is the opening's colour and fades through the next scenes -- the page inherits the video's light
function sceneTones(n, page, identities, opts) {
  const o = opts || {}; const own = Array.from({ length: n }, (_, i) => (HEX.test(identities[i] || '') && !describe(identities[i]).neutral ? tone(identities[i], page) : ''));
  const at = Math.max(0, Math.min(n - 1, o.heroAt || 0));
  if (o.hero && HEX.test(o.hero) && n) own[at] = tone(o.hero, page);
  const out = own.slice();
  for (let i = 0; i < n; i++) {
    if (out[i]) continue;
    let p = i - 1; while (p >= 0 && !own[p]) p--; let q = i + 1; while (q < n && !own[q]) q++;
    const A = p >= 0 ? own[p] : '', B = q < n ? own[q] : '';
    out[i] = A && B ? mix(A, B, (i - p) / (q - p) * 0.8 + 0.1) : A || B || (page && page.bg) || '';
  }
  // (a premium hero defines the opening's light: the next three scenes lean into its colour -- strongly, then less --
  // before the page's own pictures take over)
  if (o.hero && HEX.test(o.hero)) { const h = tone(o.hero, page); const lean = [0.55, 0.35, 0.18]; for (let i = at + 1; i < n && i <= at + lean.length; i++) out[i] = mix(out[i], h, lean[i - at - 1]); }
  return out.map(x => (x ? x.toLowerCase() : x));
}
// a picture's second colour: the most prominent vivid colour clearly apart from its identity (the accent a scene hands
// on to the next one's glow); '' when it has none
function secondary(asset) {
  const a = (asset && asset.assess) || {}; const id = identity(asset); const pool = (a.colours || []).concat(a.background && HEX.test(a.background.colour || '') ? [a.background.colour] : []).filter(x => HEX.test(x || ''));
  const far = pool.map((x, i) => ({ x, c: hsl(x), i })).filter(o => vivid(o.c) >= 0.18 && (!id.hex || Math.min(Math.abs(o.c.h - id.h), 1 - Math.abs(o.c.h - id.h)) > 0.08 || distance(o.x, id.hex) > 120));
  return far.length ? far.sort((p, q) => (vivid(q.c) * (PROMINENCE[q.i] || 0.1)) - (vivid(p.c) * (PROMINENCE[p.i] || 0.1)))[0].x.toLowerCase() : '';
}
// a glow in a colour, set for the page's light (brighter than the surface it lights)
function glow(hex, page) {
  if (!HEX.test(hex || '')) return ''; const bg = (page && page.bg) || '#111114'; const c = hsl(hex); const dark = lum(bg) < 0.3;
  return fromHsl(c.h, clamp(c.s, 0.4, 0.85), dark ? 0.42 : 0.72).toLowerCase();
}
// after a premium hero video is delivered: its MEASURED colour cast (sampled from its frames in the browser) becomes the
// hero scene's colour and carries into the scenes after it. Only scenes that took their colour from a picture are
// re-toned (a scene flooded by a timeline beat keeps its flood). Returns a new plan (validate it in safety mode).
// motion: the video's measured direction (lr, rl, in, out) -- the next seams continue it
function retune(plan, cast, motion) {
  if (!plan || !Array.isArray(plan.scenes) || (!HEX.test(cast || '') && !motion)) return plan;
  const p = JSON.parse(JSON.stringify(plan)); const n = p.scenes.length;
  const hero = p.timeline && p.timeline.continuity && p.timeline.continuity.hero;
  if (HEX.test(cast || '')) {
    const tones = sceneTones(n, p.palette, p.scenes.map(s => (s.visual && s.visual.palette) || ''), { hero: cast, heroAt: hero ? hero.scene || 0 : 0 });
    p.scenes.forEach((s, i) => { if (s.tone && tones[i]) s.tone = tones[i]; });
    if (hero) hero.cast = cast.toLowerCase();
  }
  // (a measurement that came back unsure clears any earlier direction: 'none' is an answer too). The next two seams'
  // stored directions are dropped so the re-validation derives them again -- from the measured motion, or, when there is
  // none, from their own pictures -- instead of keeping what was there before the video existed
  if (hero && ['lr', 'rl', 'in', 'out', 'none'].includes(motion)) {
    hero.motion = motion; const at = hero.scene || 0;
    ((p.timeline.continuity.contracts) || []).forEach(k => { if (k.at > at && k.at <= at + 2) delete k.motionVector; });
  }
  return p;
}

module.exports = { identity, secondary, glow, fromColours, tone, sceneTones, retune, mix, lum, distance, hsl, fromHsl, describe };
