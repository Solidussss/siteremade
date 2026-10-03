'use strict';
// STAND-IN PICTURES for Creative reviews and fixtures: each picture drawn as an SVG from what the studio measured about it
// (its size and colours, the subject where the studio found it; a cut-out has no background) -- for judging composition,
// rhythm and fit, never photography. Used by test/review/creative-direction-review.js and test/helpers/visual-fixtures.js.
// a stand-in picture: its measured size and colours, the subject where the studio found it (a cut-out has no background)
function svgOf(a) {
  const m = a.assess || {}; const w = m.width || 1200, h = m.height || 800; const cols = (m.colours || ['#888888']).concat(['#444444', '#bbbbbb']);
  const bg = (m.background && m.background.colour) || cols[0]; const sj = m.subject || [0.2, 0.2, 0.8, 0.8];
  const [x0, y0, x1, y1] = [sj[0] * w, sj[1] * h, sj[2] * w, sj[3] * h]; const sw = x1 - x0, sh = y1 - y0;
  const back = m.transparent ? '' : `<rect width="${w}" height="${h}" fill="${bg}"/><rect width="${w}" height="${h}" fill="url(#g)"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${cols[0]}" stop-opacity=".0"/><stop offset="1" stop-color="${cols[2]}" stop-opacity=".45"/></linearGradient></defs>${back}`
    + `<rect x="${x0}" y="${y0}" width="${sw}" height="${sh}" rx="${Math.min(sw, sh) * 0.18}" fill="${cols[1]}"/><rect x="${x0 + sw * 0.12}" y="${y0 + sh * 0.42}" width="${sw * 0.76}" height="${sh * 0.16}" fill="${cols[2]}" opacity=".8"/>`
    + `<text x="${x0 + sw / 2}" y="${y0 + sh * 0.3}" font-family="system-ui" font-size="${Math.max(18, Math.min(sw, sh) * 0.09)}" text-anchor="middle" fill="${cols[2]}">${String(a.title || a.id).replace(/[<&>]/g, '')}</text></svg>`;
}
module.exports = { svgOf };
