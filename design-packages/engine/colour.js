// Brand colour transforms, applied at build time (shared by every design).
// A design is drawn in its own palette. Its package groups the colours into families (for Beadline: paint, accent,
// studio), each with one base colour. A brand gives a target colour per family; fit() works out how far to turn the
// base to land on it (hue shift, saturation factor, lightness gamma) and every colour of that family in the template
// goes through the same turn, so the colours keep their relation to each other (highlights, shadows, reflections).
// Lightness is a gamma (l^(1/g)): darker targets deepen the mid-tones but keep highlights bright.
// With the design's own colour as the target the transform is the identity and every string comes back unchanged.
'use strict';

function hexRgb(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function rgbHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn, l = (mx + mn) / 2;
  let h = 0, s = 0;
  if (d > 1e-9) {
    s = d / (1 - Math.abs(2 * l - 1));
    h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h *= 60; if (h < 0) h += 360;
  }
  return [h, s, l];
}
function hslRgb(h, s, l) {
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = l - c / 2;
  const [a, b, d] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return [a, b, d].map((v) => Math.round((v + m) * 255));
}

// the turn that takes `base` to `target` (both #rrggbb). useLight=false keeps lightness (a tint only).
function fit(base, target, useLight = true) {
  const ident = base.toLowerCase() === target.toLowerCase();
  const [bh, bs, bl] = rgbHsl(...hexRgb(base));
  const [th, ts, tl] = rgbHsl(...hexRgb(target));
  const sm = bs > 1e-6 ? ts / bs : 1;
  const gm = !ident && useLight && tl > 1e-3 && tl < 0.999 ? Math.log(bl) / Math.log(tl) : 1;
  return { dh: ts > 0.02 ? th - bh : 0, sm, gm, ident };
}

function make(t) {
  const tf = (r, g, b) => {
    let [h, s, l] = rgbHsl(r, g, b);
    h = ((h + t.dh) % 360 + 360) % 360;
    s = Math.min(1, s * t.sm);
    l = Math.pow(Math.min(1, Math.max(0, l)), 1 / t.gm);
    return hslRgb(h, s, l);
  };
  const hex = (r, g, b) => '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
  // a colour literal as written in the template: #rrggbb, rgba(r,g,b,a), or "r,g,b" (the start of rgba(r,g,b,${...}))
  return function C(str) {
    let m;
    if (t.ident) return /^\d+,\d+,\d+$/.test(str) ? `rgba(${str},` : str;
    if ((m = /^#([0-9a-f]{6})$/i.exec(str))) return hex(...tf(...hexRgb(str)));
    if ((m = /^#([0-9a-f]{6})([0-9a-f]{2})$/i.exec(str))) return hex(...tf(...hexRgb('#' + m[1]))) + m[2];
    if ((m = /^rgba\((\d+),\s*(\d+),\s*(\d+),\s*([^)]+)\)$/.exec(str))) return `rgba(${tf(+m[1], +m[2], +m[3]).join(',')},${m[4]})`;
    if ((m = /^(\d+),(\d+),(\d+)$/.exec(str))) return `rgba(${tf(+m[1], +m[2], +m[3]).join(',')},`;
    throw new Error('colour literal not understood: ' + str);
  };
}

// WCAG contrast ratio of two #rrggbb colours
function lum(h) { return hexRgb(h).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }).reduce((a, v, i) => a + v * [0.2126, 0.7152, 0.0722][i], 0); }
function contrast(a, b) { const x = lum(toHex(a)), y = lum(toHex(b)); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }
// rgba(...) strings to #rrggbb (alpha dropped) so contrast() can take any family output
function toHex(s) { const m = /^rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(s); return m ? '#' + [m[1], m[2], m[3]].map((v) => (+v).toString(16).padStart(2, '0')).join('') : s; }

module.exports = { fit, make, rgbHsl, hexRgb, contrast, toHex };
