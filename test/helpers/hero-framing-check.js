'use strict';
// Reads a RENDERED storyboard hero (the markup the preview and the export ship)
// and reports, per drawn layer and per view (desktop / phone), how much of its
// main subject a visitor actually sees: inside the frame's shape, inside the
// part of the picture that stays visible through the whole pan/zoom loop, and
// not covered by the frames stacked above it or (desktop, full-bleed lead) the
// headline block. Everything is re-derived from the markup itself -- placement
// and motion custom properties, the SVG viewBox and its data-subject-box -- so
// a drawing that is cropped, positioned or layered wrong is caught whatever
// produced it. Counting visible layers would not catch a lead that shows only
// grass while its house is cropped away; this does.
const FR = require('../../lib/premium/hero-framing');

const vars = style => { const o = {}; String(style).replace(/--([a-z0-9]+):([^;]+)/g, (m, k, v) => { o[k] = parseFloat(v); return m; }); return o; };
function svgInfo(html) {
  const vb = /viewBox="([^"]+)"/.exec(html); const sb = /data-subject-box="([^"]+)"/.exec(html); const db = /data-detail-boxes="([^"]+)"/.exec(html);
  return { viewBox: vb ? vb[1].split(/\s+/).map(Number) : null, box: sb ? sb[1].split(/\s+/).map(Number) : null, details: db ? db[1].split(';').map(t => t.split(/\s+/).map(Number)) : [], kind: (/data-art="([^"]+)"/.exec(html) || [])[1] || null };
}
// what the frame really shows of a viewBox drawn with "xMidYMid slice" into a frame of this ratio
function effectiveCrop(vb, ratio) {
  const [x, y, w, h] = vb;
  if (w / h > ratio) { const cw = h * ratio; return [x + (w - cw) / 2, y, cw, h]; }
  const ch = w / ratio; return [x, y + (h - ch) / 2, w, ch];
}
function parseHero(html) {
  const copy = (/data-copy="([^"]+)"/.exec(html) || [])[1] || 'left';
  const layers = []; const re = /<figure class="sb-layer sb-role-([a-z]+) sb-shape-([a-z]+)" data-slot="([^"]+)"[^>]*?data-source="([a-z]+)"[^>]*?style="([^"]*)"><div class="sb-frame"><div class="sb-media">([\s\S]*?)<\/div><\/div><\/figure>/g; let m;
  while ((m = re.exec(html))) {
    const [, role, shape, slot, source, style, media] = m; const v = vars(style);
    const arts = media.split(/(?=<div class="ha-art)/).filter(s => s.startsWith('<div class="ha-art'));
    const desk = arts.find(a => !/ha-phone/.test(a.slice(0, 60))) || null; const phone = arts.find(a => /ha-phone/.test(a.slice(0, 60))) || desk;
    layers.push({
      slot, role, shape, source, z: v.z, desktop: [v.x, v.y, v.w, v.h], mobile: [v.mx, v.my, v.mw, v.mh],
      track: { from: { x: v.fx, y: v.fy, s: v.fs, r: v.fr }, to: { x: v.tx, y: v.ty, s: v.ts, r: v.tr } }, motion: [[v.ix0, v.iy0, v.is0], [v.ix1, v.iy1, v.is1]],
      art: { desktop: desk && svgInfo(desk), phone: phone && svgInfo(phone) }, interface: /data-art="interface"/.test(media),
    });
  }
  return { copy, layers };
}
// -> [{ slot, role, view, kind, share, core }] for every drawn layer that has a subject
function framingReport(html) {
  const { copy, layers } = parseHero(html); const out = [];
  for (const l of layers) {
    if (l.source !== 'art' || l.interface) continue;
    for (const view of ['desktop', 'phone']) {
      const a = l.art[view]; if (!a || !a.viewBox) continue;
      const ratio = FR.frameRatioOf(l, view, copy); const crop = effectiveCrop(a.viewBox, ratio);
      const win = FR.stableWindowFor(l.motion); const occ = FR.occludersFor(layers, l.slot, view, copy);
      // details: the least-visible printed label on the subject (1 = every label wholly in view at every moment)
      out.push({ slot: l.slot, role: l.role, view, kind: a.kind, hasSubject: !!a.box, share: a.box ? FR.visibleShare(a.box, crop, win, occ, l.shape) : 1, core: a.box ? FR.visibleShare(FR.core(a.box), crop, win, occ, l.shape) : 1, labels: a.details.length, details: FR.detailShare(a.details, crop, win, occ, l.shape, 16) });
    }
  }
  return out;
}
module.exports = { parseHero, framingReport, effectiveCrop };
