// Layout guards: small CSS additions a build gets only when its content needs them. A design lists the guards it
// uses in design.json; the kinds below are shared by every design. Content that fits the original's proportions
// gets no guard at all, so a default build stays byte-for-byte the original.
'use strict';

const px = (v) => `${v}px`;
// clamp(min, vw, max) or max(min, vw) as CSS, and its value at a viewport width
const clampCss = ([lo, vw, hi]) => (hi == null ? `max(${px(lo)},${vw}vw)` : `clamp(${px(lo)},${vw}vw,${px(hi)})`);
const clampAt = ([lo, vw, hi], v) => Math.max(lo, Math.min(hi == null ? Infinity : hi, (vw / 100) * v));

// fitText: a big single-line word (a footer wordmark) that would run past its column. It is scaled down only as far
// as needed for the whole text to sit inside the column at every width. Needs the glyph table (metrics.json).
//   { selector, text: [paths joined], metric, size: [minPx, vw, maxPx], container: { max: px|null, gutter: [minPx, vw, maxPx|null] },
//     skipIf: { path, equals } }
function fitText(g, c, ctx) {
  if (g.skipIf && ctx.get(c, g.skipIf.path) === g.skipIf.equals) return '';
  const text = [].concat(g.text).map((p) => ctx.get(c, p) || '').join('');
  const em = ctx.textEm(g.metric, text);
  const k = (0.96 / em).toFixed(4);
  const cont = (v) => Math.min(g.container.max ?? Infinity, v) - 2 * clampAt(g.container.gutter, v);
  const fitsAlways = [320, 390, 640, 980, 1240, 1440, 1920].every((v) => clampAt(g.size, v) * em <= cont(v) * 0.96);
  if (fitsAlways) return '';
  const contCss = g.container.max == null ? '100vw' : `min(${px(g.container.max)},100vw)`;
  return `${g.selector}{font-size:min(${clampCss(g.size)},calc((${contCss} - 2 * ${clampCss(g.container.gutter)}) * ${k}))}`;
}

// collapseByLength: a one-line row (a nav) whose items get hidden below a breakpoint. Longer labels need more room,
// so the breakpoint moves up to where the row would otherwise wrap. Width estimate: base px + per-character px.
//   { base, parts: [{ paths: [...], perChar }], default: px, css: "...{w}..." }
function collapseByLength(g, c, ctx) {
  const need = g.base + g.parts.reduce((a, part) => a + part.perChar * part.paths.reduce((n, p) => n + [...String(ctx.get(c, p) || '')].length, 0), 0) + (g.fixedExtra || 0);
  if (need <= g.default) return '';
  return g.css.replace('{w}', Math.ceil(need / 10) * 10);
}

// contrastSwitch: when two brand colours end up too close (a gloss-black wordmark on a graphite background), swap in
// an alternative style.   { a: "F:#hex", b: "F:#hex", min, css }
function contrastSwitch(g, c, ctx) {
  const col = (ref) => { const m = /^([A-Z][A-Za-z]*):(.+)$/.exec(ref); return ref.startsWith('=') ? ctx.get(c, ref.slice(1)) : ctx.families[m[1]](m[2]); };
  return ctx.contrast(col(g.a), col(g.b)) >= g.min ? '' : g.css;
}

module.exports = { fitText, collapseByLength, contrastSwitch };
