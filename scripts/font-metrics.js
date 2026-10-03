'use strict';
// FONT METRICS from the font file itself (TrueType/OpenType .ttf/.otf, or WOFF 1.0 .woff): how wide a font sets text, in
// em -- what the Creative headline fitting needs to size a heading so it fits its column (lib/creative/look.js fitFor,
// measure). Reads only head, hhea, cmap and hmtx. Build-time tooling (scripts/vendor-creative-fonts.js, tests): the
// renderer reads the numbers it produced, never a font file.
//
//   read(buffer) -> { unitsPerEm, advance(codepoint) -> em | null, ascent, descent }
//   measure(buffer) -> { adv, upper, sampleLower, sampleUpper }   (adv: average em per character of a lower-case
//     headline sample, spaces included; upper: the same sample in capitals, as a factor of adv)
const zlib = require('zlib');

function tables(buf) {
  const sig = buf.readUInt32BE(0); const out = {};
  if (sig === 0x774f4646) { // 'wOFF'
    const n = buf.readUInt16BE(12);
    for (let i = 0; i < n; i++) {
      const o = 44 + i * 20; const tag = buf.toString('latin1', o, o + 4);
      const off = buf.readUInt32BE(o + 4), comp = buf.readUInt32BE(o + 8), orig = buf.readUInt32BE(o + 12);
      const raw = buf.subarray(off, off + comp); out[tag] = comp < orig ? zlib.inflateSync(raw) : raw;
    }
    return out;
  }
  if (sig === 0x774f4632) throw new Error('WOFF2 is not read here -- measure the .woff or .ttf of the same face');
  const n = buf.readUInt16BE(4);
  for (let i = 0; i < n; i++) { const o = 12 + i * 16; const tag = buf.toString('latin1', o, o + 4); const off = buf.readUInt32BE(o + 8), len = buf.readUInt32BE(o + 12); out[tag] = buf.subarray(off, off + len); }
  return out;
}
function cmapOf(t) {
  const c = t.cmap; const n = c.readUInt16BE(2); let best = null;
  for (let i = 0; i < n; i++) { const pid = c.readUInt16BE(4 + i * 8), eid = c.readUInt16BE(6 + i * 8), off = c.readUInt32BE(8 + i * 8); const fmt = c.readUInt16BE(off);
    if ((fmt === 4 || fmt === 12) && (pid === 3 || pid === 0) && (!best || fmt === 12)) best = { off, fmt }; }
  if (!best) throw new Error('no Unicode cmap');
  const o = best.off;
  if (best.fmt === 12) { const groups = c.readUInt32BE(o + 12); return cp => { for (let g = 0; g < groups; g++) { const b = o + 16 + g * 12; const s = c.readUInt32BE(b), e = c.readUInt32BE(b + 4); if (cp >= s && cp <= e) return c.readUInt32BE(b + 8) + (cp - s); } return 0; }; }
  const segX2 = c.readUInt16BE(o + 6); const ends = o + 14, starts = ends + segX2 + 2, deltas = starts + segX2, ranges = deltas + segX2;
  return cp => { for (let s = 0; s < segX2 / 2; s++) { const end = c.readUInt16BE(ends + s * 2); if (cp > end) continue; const start = c.readUInt16BE(starts + s * 2); if (cp < start) return 0;
    const delta = c.readInt16BE(deltas + s * 2), ro = c.readUInt16BE(ranges + s * 2); if (!ro) return (cp + delta) & 0xffff;
    const gi = c.readUInt16BE(ranges + s * 2 + ro + (cp - start) * 2); return gi ? (gi + delta) & 0xffff : 0; } return 0; };
}
function read(buf) {
  const t = tables(buf); const upm = t.head.readUInt16BE(18); const nh = t.hhea.readUInt16BE(34); const glyph = cmapOf(t);
  const adv = gi => (gi < nh ? t.hmtx.readUInt16BE(gi * 4) : t.hmtx.readUInt16BE((nh - 1) * 4));
  return { unitsPerEm: upm, ascent: t.hhea.readInt16BE(4) / upm, descent: t.hhea.readInt16BE(6) / upm, advance: cp => { const g = glyph(cp); return g ? adv(g) / upm : null; } };
}
// the sample a headline is fitted with: ordinary words, spaces included (the look's own families were tuned on these)
const SAMPLE = 'the world raises one glass every summer pull up a chair out of the dark small batches big taste behold the icon';
function measure(buf) {
  const f = read(buf); const avg = s => { let w = 0, n = 0; for (const ch of s) { const a = f.advance(ch.codePointAt(0)); if (a != null) { w += a; n++; } } return n ? w / n : null; };
  const lower = avg(SAMPLE), caps = avg(SAMPLE.toUpperCase());
  return { adv: lower, upper: caps / lower, sampleLower: lower, sampleUpper: caps };
}
module.exports = { read, measure, SAMPLE };
