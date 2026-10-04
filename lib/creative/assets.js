'use strict';
const PS = require('./premium-source');
// CREATIVE — what an image actually supports, read from its pixels (pure; RGBA in, facts out).
//
//   assess(img)            size, aspect, transparency, where the subject sits, how uniform
//                          the background is, its colours -- so the scene is planned around
//                          what the asset can really do.
//   cutout(img)            a REAL background-removal step for an image on a plain background:
//                          flood-fill from the edges on the background colour, feathered. It
//                          returns a cutout only when the cut is clean; otherwise it says why,
//                          and the image stays a framed picture.
//   capabilities(a)        what the scene may do with an asset: move it freely over a world
//                          (transparent / clean cutout), frame it, or use it as a backdrop.
// img: { width, height, data: RGBA (Uint8ClampedArray | Uint8Array | Buffer) }.
// Browser: pixels come from <canvas>; Node: from lib/creative/png.js.

const lum = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
const hex = (r, g, b) => '#' + [r, g, b].map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
const dist = (a, i, r, g, b) => Math.sqrt((a[i] - r) ** 2 + (a[i + 1] - g) ** 2 + (a[i + 2] - b) ** 2);

// every pixel along the image's four edges (a band `band` px deep)
function borderIndices(w, h, band) {
  const out = []; const b = Math.max(1, band | 0);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (x < b || y < b || x >= w - b || y >= h - b) out.push((y * w + x) * 4);
  return out;
}
function median(vals) { const s = vals.slice().sort((a, b) => a - b); return s.length ? s[s.length >> 1] : 0; }

// a coarse palette: colours quantised to 4 bits per channel, the most common first (transparent pixels ignored)
function palette(img, n, skip) {
  const { data, width, height } = img; const counts = new Map(); const step = Math.max(1, Math.floor(Math.sqrt(width * height / 40000)));
  for (let y = 0; y < height; y += step) for (let x = 0; x < width; x += step) {
    const i = (y * width + x) * 4; if (data[i + 3] < 128) continue; if (skip && skip(i)) continue;
    const k = ((data[i] >> 4) << 8) | ((data[i + 1] >> 4) << 4) | (data[i + 2] >> 4);
    const c = counts.get(k) || { n: 0, r: 0, g: 0, b: 0 }; c.n++; c.r += data[i]; c.g += data[i + 1]; c.b += data[i + 2]; counts.set(k, c);
  }
  return [...counts.values()].sort((a, b) => b.n - a.n).slice(0, n || 5).map(c => hex(c.r / c.n, c.g / c.n, c.b / c.n));
}

function assess(img) {
  const { width: w, height: h, data } = img; const px = w * h;
  let transparent = 0, minX = w, minY = h, maxX = -1, maxY = -1, lumSum = 0, count = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    if (data[i + 3] < 16) { transparent++; continue; }
    if (x < minX) minX = x; if (y < minY) minY = y; if (x > maxX) maxX = x; if (y > maxY) maxY = y;
    lumSum += lum(data[i], data[i + 1], data[i + 2]); count++;
  }
  const transparentShare = transparent / px;
  // the background, read from the edges: its colour and how uniform it is
  const band = Math.max(2, Math.round(Math.min(w, h) * 0.02)); const edge = borderIndices(w, h, band).filter(i => data[i + 3] >= 16);
  const bg = edge.length ? [median(edge.map(i => data[i])), median(edge.map(i => data[i + 1])), median(edge.map(i => data[i + 2]))] : [255, 255, 255];
  const spread = edge.length ? edge.map(i => dist(data, i, bg[0], bg[1], bg[2])) : [0];
  const tol = Math.max(24, Math.min(70, median(spread) * 2.5 + 20));
  const uniformity = edge.length ? spread.filter(d => d < tol).length / spread.length : 0;
  // where the subject sits: the opaque pixels (transparent art) or the pixels unlike the background (plain background)
  let subject = null;
  if (transparentShare > 0.08 && maxX >= 0) subject = [minX / w, minY / h, (maxX + 1) / w, (maxY + 1) / h];
  else if (uniformity > 0.75) {
    let sx = w, sy = h, ex = -1, ey = -1; const step = Math.max(1, Math.floor(Math.min(w, h) / 300));
    for (let y = 0; y < h; y += step) for (let x = 0; x < w; x += step) { const i = (y * w + x) * 4; if (dist(data, i, bg[0], bg[1], bg[2]) > tol * 1.2) { if (x < sx) sx = x; if (y < sy) sy = y; if (x > ex) ex = x; if (y > ey) ey = y; } }
    if (ex > sx && ey > sy) subject = [sx / w, sy / h, (ex + 1) / w, (ey + 1) / h];
  }
  const colours = palette(img, 5, transparentShare > 0.08 ? null : (i => dist(data, i, bg[0], bg[1], bg[2]) < tol));
  return {
    width: w, height: h, aspect: +(w / h).toFixed(3), orientation: w > h * 1.15 ? 'landscape' : h > w * 1.15 ? 'portrait' : 'square',
    transparentShare: +transparentShare.toFixed(3), transparent: transparentShare > 0.08,
    background: { colour: hex(bg[0], bg[1], bg[2]), uniformity: +uniformity.toFixed(3), tolerance: Math.round(tol) },
    subject: subject && subject.map(v => +v.toFixed(3)), colours, luminance: count ? Math.round(lumSum / count) : 0,
    megapixels: +(px / 1e6).toFixed(2),
    // (a 64-bit difference hash -- the same picture resized, re-saved or re-hosted has (nearly) the same one, its mirror
    // the reflected one -- and how crisp its strongest edges are: asset-director.js)
    sig: signature(img), sharp: (() => { const v = PS.sharpness(img); return v == null ? undefined : Math.round(v * 1000) / 1000; })(),
  };
}
// signature(img) -> 16 hex: each of 8 rows of a 9x8 greyscale reduction, 1 where a cell is brighter than its right neighbour
function signature(img) {
  const { width: w, height: h, data } = img; if (!w || !h) return undefined; const g = [];
  for (let y = 0; y < 8; y++) for (let x = 0; x < 9; x++) {
    let s = 0, n = 0; const x0 = Math.floor((x * w) / 9), x1 = Math.max(x0 + 1, Math.floor(((x + 1) * w) / 9)), y0 = Math.floor((y * h) / 8), y1 = Math.max(y0 + 1, Math.floor(((y + 1) * h) / 8));
    const sx = Math.max(1, Math.floor((x1 - x0) / 6)), sy = Math.max(1, Math.floor((y1 - y0) / 6));
    for (let yy = y0; yy < y1; yy += sy) for (let xx = x0; xx < x1; xx += sx) { const i = (yy * w + xx) * 4; const a = data[i + 3] / 255; s += (0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]) * a + 255 * (1 - a); n++; }
    g.push(n ? s / n : 0);
  }
  let out = ''; for (let y = 0; y < 8; y++) { let byte = 0; for (let x = 0; x < 8; x++) byte = (byte << 1) | (g[y * 9 + x] > g[y * 9 + x + 1] ? 1 : 0); out += byte.toString(16).padStart(2, '0'); }
  return out;
}

// where the picture has a real edge: the strongest colour change across a pixel (Sobel, per channel, on a 3x3-smoothed
// copy so JPEG grain is not an edge), against what the picture's own border -- its backdrop -- shows. k: how many times
// the backdrop's own variation a change must be to stop the fill. The wall is thickened by a pixel so a hairline gap in
// an outline does not let the fill through. -> Uint8Array (1 = an edge)
function edgeWall(img, k) {
  const { width: w, height: h, data } = img; const sm = new Float32Array(w * h * 3);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) for (let c = 0; c < 3; c++) {
    let s = 0, n = 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue; s += data[(yy * w + xx) * 4 + c]; n++; }
    sm[(y * w + x) * 3 + c] = s / n;
  }
  const g = new Float32Array(w * h); const at = (x, y, c) => sm[(Math.min(h - 1, Math.max(0, y)) * w + Math.min(w - 1, Math.max(0, x))) * 3 + c];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let m = 0; for (let c = 0; c < 3; c++) {
      const gx = at(x + 1, y - 1, c) + 2 * at(x + 1, y, c) + at(x + 1, y + 1, c) - at(x - 1, y - 1, c) - 2 * at(x - 1, y, c) - at(x - 1, y + 1, c);
      const gy = at(x - 1, y + 1, c) + 2 * at(x, y + 1, c) + at(x + 1, y + 1, c) - at(x - 1, y - 1, c) - 2 * at(x, y - 1, c) - at(x + 1, y - 1, c);
      m = Math.max(m, Math.sqrt(gx * gx + gy * gy) / 4);
    }
    g[y * w + x] = m;
  }
  const border = borderIndices(w, h, Math.max(2, Math.round(Math.min(w, h) * 0.02))).map(i => g[i >> 2]).sort((a, b) => a - b);
  const q90 = border.length ? border[Math.floor(border.length * 0.9)] : 0; const T = Math.max(6, q90 * k);
  const wall = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { if (g[y * w + x] < T) continue; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const xx = x + dx, yy = y + dy; if (xx >= 0 && yy >= 0 && xx < w && yy < h) wall[yy * w + xx] = 1; } }
  return wall;
}

// Background removal for a subject on a plain background. Returns { img, bbox, removedShare, clean, reason }.
// First with the cast-shadow clean-up stopped at real edges too (a subject's pale, grey part standing in its own shadow --
// a can's silver base -- stays); if that leaves too much shadow for a clean outline, again with the shadow followed freely.
function cutout(img, opts) {
  const o = opts || {}; const first = cutoutOnce(img, Object.assign({}, o, { shadowWall: o.edges !== false }));
  if (first.clean || o.edges === false || !/too close to the background/.test(first.reason || '')) return first;
  return cutoutOnce(img, Object.assign({}, o, { shadowWall: false }));
}
function cutoutOnce(img, opts) {
  const o = opts || {}; const { width: w, height: h, data } = img; const a = assess(img);
  if (a.transparent) return { img, bbox: a.subject, removedShare: a.transparentShare, clean: true, reason: 'already transparent' };
  if (a.background.uniformity < (o.minUniformity || 0.8)) return { img: null, clean: false, reason: 'busy background (edges not uniform)', assess: a };
  const hx = a.background.colour; const bg = [parseInt(hx.slice(1, 3), 16), parseInt(hx.slice(3, 5), 16), parseInt(hx.slice(5, 7), 16)];
  const tol = o.tolerance || a.background.tolerance;
  // THE OUTLINE: the fill crosses only smooth background, never a real edge. A product's light parts -- a silver lid, a
  // cream label band, a white heel -- can be nearly the background's colour, so colour alone lets the fill run into them;
  // but where they meet the background there is an edge, and the backdrop itself has none (o.edges === false: colour only)
  const wall = o.edges === false ? null : edgeWall(img, o.edgeK || 3);
  const open = q => !wall || !wall[q];
  // flood fill from every edge pixel close to the background colour
  const mask = new Uint8Array(w * h); const stack = [];
  for (const i of borderIndices(w, h, 1)) { const p = i >> 2; if (!mask[p] && dist(data, i, bg[0], bg[1], bg[2]) < tol) { mask[p] = 1; stack.push(p); } }
  while (stack.length) {
    const p = stack.pop(); const x = p % w, y = (p / w) | 0;
    const nb = [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, y > 0 ? p - w : -1, y < h - 1 ? p + w : -1];
    for (const q of nb) if (q >= 0 && !mask[q] && open(q) && dist(data, q * 4, bg[0], bg[1], bg[2]) < tol) { mask[q] = 1; stack.push(q); }
  }
  // the edge itself is a few pixels wide: the background-coloured pixels on its outer side are background too -- taken
  // from the background inwards, at most RIM pixels deep, so the fill still never runs on into the subject
  if (wall) {
    const RIM = 3; const depth = new Int8Array(w * h); let front = [];
    for (let p = 0; p < w * h; p++) if (mask[p] === 1) front.push(p);
    for (let d = 1; d <= RIM && front.length; d++) {
      const next = [];
      for (const p of front) { const x = p % w, y = (p / w) | 0; for (const q of [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, y > 0 ? p - w : -1, y < h - 1 ? p + w : -1]) {
        if (q < 0 || mask[q] || !wall[q] || depth[q] || dist(data, q * 4, bg[0], bg[1], bg[2]) >= tol) continue; mask[q] = 1; depth[q] = d; next.push(q); } }
      front = next;
    }
  }
  // soft cast shadows on a neutral background (grey, smooth, darker than the background) go too -- followed only while
  // they keep darkening inwards: where it turns brighter again it is the subject (a can's silver base standing in its shadow):
  // the scene draws its own shadow, and a pale photo shadow glows on a dark stage
  const chroma = i => Math.max(data[i], data[i + 1], data[i + 2]) - Math.min(data[i], data[i + 1], data[i + 2]);
  const bgLum = lum(bg[0], bg[1], bg[2]); const bgNeutral = Math.max(...bg) - Math.min(...bg) < 22;
  if (bgNeutral && o.shadows !== false) {
    const shadowy = (q, from) => { const i = q * 4; const l = lum(data[i], data[i + 1], data[i + 2]); const j = from * 4; return chroma(i) < 16 && l > bgLum * 0.5 && l < bgLum + 6 && l <= lum(data[j], data[j + 1], data[j + 2]) + 2 && dist(data, i, data[j], data[j + 1], data[j + 2]) < 7; };
    for (let p = 0; p < w * h; p++) if (mask[p]) stack.push(p);
    while (stack.length) {
      const p = stack.pop(); const x = p % w, y = (p / w) | 0;
      const nb = [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, y > 0 ? p - w : -1, y < h - 1 ? p + w : -1];
      for (const q of nb) if (q >= 0 && !mask[q] && (!o.shadowWall || open(q)) && shadowy(q, p)) { mask[q] = 2; stack.push(q); }
    }
  }
  // background showing through enclosed gaps (between a plant's stems, inside a handle): pockets of
  // smooth, exactly-background colour are background too. Not for illustrations, whose white eyes
  // and highlights can be enclosed the same way.
  if (o.holes !== false) {
    const seen = new Uint8Array(w * h); const minHole = Math.max(30, w * h * 0.0015);
    for (let p0 = 0; p0 < w * h; p0++) {
      if (mask[p0] || seen[p0] || dist(data, p0 * 4, bg[0], bg[1], bg[2]) >= Math.min(tol, 14)) continue;
      const comp = [p0]; seen[p0] = 1; let rough = 0;
      for (let k = 0; k < comp.length; k++) {
        const p = comp[k]; const x = p % w, y = (p / w) | 0;
        for (const q of [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, y > 0 ? p - w : -1, y < h - 1 ? p + w : -1]) {
          if (q < 0 || mask[q] || seen[q]) continue;
          if (dist(data, q * 4, bg[0], bg[1], bg[2]) < Math.min(tol, 14)) { seen[q] = 1; comp.push(q); if (dist(data, q * 4, data[p * 4], data[p * 4 + 1], data[p * 4 + 2]) > 6) rough++; }
        }
      }
      if (comp.length >= minHole && rough / comp.length < 0.05) comp.forEach(p => { mask[p] = 3; });
    }
  }
  let removed = 0; for (let p = 0; p < w * h; p++) removed += mask[p] ? 1 : 0;
  const removedShare = removed / (w * h);
  if (removedShare < 0.12) return { img: null, clean: false, reason: 'the subject fills the frame -- nothing to remove', removedShare, assess: a };
  if (removedShare > 0.94) return { img: null, clean: false, reason: 'almost nothing left after removing the background', removedShare, assess: a };
  // keep the largest connected foreground region and anything big (drop specks), then feather the edge
  const out = new Uint8ClampedArray(data.length); out.set(data);
  const label = new Int32Array(w * h).fill(-1); const sizes = []; let biggest = 0;
  for (let p = 0; p < w * h; p++) {
    if (mask[p] || label[p] >= 0) continue; const id = sizes.length; let n = 0; const st = [p]; label[p] = id;
    while (st.length) { const q = st.pop(); n++; const x = q % w, y = (q / w) | 0; for (const r of [x > 0 ? q - 1 : -1, x < w - 1 ? q + 1 : -1, y > 0 ? q - w : -1, y < h - 1 ? q + w : -1]) if (r >= 0 && !mask[r] && label[r] < 0) { label[r] = id; st.push(r); } }
    sizes.push(n); if (n > sizes[biggest]) biggest = id;
  }
  const keepMin = Math.max(40, sizes[biggest] * 0.08);
  // a separate piece that meets the frame edge and has no texture is left-over background (a wall, a window, a
  // gradient the fill did not reach) -- not a second part of the subject. Textured pieces stay: a subject may have
  // several real parts, and a textured piece at the edge is a crop, judged below.
  const touchesFrame = new Uint8Array(sizes.length), smooth = new Float64Array(sizes.length), probes = new Float64Array(sizes.length);
  for (let p = 0; p < w * h; p++) {
    const id = label[p]; if (id < 0) continue; const x = p % w, y = (p / w) | 0;
    if (x === 0 || y === 0 || x === w - 1 || y === h - 1) touchesFrame[id] = 1;
    if (x < w - 1 && label[p + 1] === id && (p & 3) === 0) { probes[id]++; if (dist(data, p * 4, data[p * 4 + 4], data[p * 4 + 5], data[p * 4 + 6]) < 5) smooth[id]++; }
  }
  const leftover = sizes.map((n, id) => id !== biggest && touchesFrame[id] && probes[id] > 20 && smooth[id] / probes[id] > 0.85);
  let minX = w, minY = h, maxX = -1, maxY = -1, edgeTouch = 0; let dropped = 0;
  for (let p = 0; p < w * h; p++) {
    if (!mask[p] && leftover[label[p]]) { mask[p] = 4; dropped++; }
    const keep = !mask[p] && sizes[label[p]] >= keepMin; const i = p * 4;
    if (!keep) { out[i + 3] = 0; continue; }
    const x = p % w, y = (p / w) | 0;
    if (x < minX) minX = x; if (y < minY) minY = y; if (x > maxX) maxX = x; if (y > maxY) maxY = y;
    // feather: a kept pixel beside a removed one fades with how close it is to the background colour
    const nearBg = (x > 0 && mask[p - 1]) || (x < w - 1 && mask[p + 1]) || (y > 0 && mask[p - w]) || (y < h - 1 && mask[p + w]);
    if (nearBg) { const d = dist(data, i, bg[0], bg[1], bg[2]); out[i + 3] = Math.round(255 * Math.min(1, Math.max(0.15, (d - tol * 0.5) / tol))); }
    if (x === 0 || y === 0 || x === w - 1 || y === h - 1) edgeTouch++;
  }
  if (maxX < 0) return { img: null, clean: false, reason: 'nothing left', assess: a };
  // the cut must follow the subject's real outline: along a true edge the kept pixels are clearly
  // unlike the background; where the fill leaked into a subject of nearly the background's colour
  // (white paper on a white wall) the "edge" is texture, and the result is shredded -- refused
  const contrast = [];
  for (let p = 0; p < w * h; p += 1) {
    if (mask[p] || out[p * 4 + 3] === 0) continue; const x = p % w, y = (p / w) | 0;
    // a pixel on the outline, read two pixels further in (the outline pixel itself is anti-aliased)
    const d = x > 1 && mask[p - 1] === 1 ? -1 : x < w - 2 && mask[p + 1] === 1 ? 1 : y > 1 && mask[p - w] === 1 ? -w : y < h - 2 && mask[p + w] === 1 ? w : 0;
    if (!d) continue; const q = p - 2 * d; const inner = q >= 0 && q < w * h && !mask[q] ? q : p;
    contrast.push(dist(data, inner * 4, bg[0], bg[1], bg[2]) / tol);
  }
  const edgeContrast = contrast.length ? median(contrast) : 0; const weakEdge = contrast.length ? contrast.filter(c => c < 1.6).length / contrast.length : 1;
  if (contrast.length && (edgeContrast < (o.minEdgeContrast || 1.6) || weakEdge > (o.maxWeakEdge || 0.5))) return { img: null, clean: false, reason: 'the subject is too close to the background colour for a clean cut', removedShare, edgeContrast: +edgeContrast.toFixed(2), weakEdge: +weakEdge.toFixed(2), assess: a };
  // a subject cut off by several frame edges is a crop, not a cutout
  const touches = [minX === 0, minY === 0, maxX === w - 1, maxY === h - 1].filter(Boolean).length;
  if (touches >= 3) return { img: null, clean: false, reason: 'the subject runs off the frame on several sides', removedShare, assess: a };
  // defringe: a pale, colourless rim left where a soft shadow or the background met the subject
  // along the bottom of the subject, where a cast shadow meets it, the rim is greyer and wider: peeled further there
  const shadowZone = minY + (maxY - minY) * 0.7;
  if (bgNeutral) for (let pass = 0; pass < 2; pass++) {
    const drop = [];
    for (let p = 0; p < w * h; p++) {
      const i = p * 4; if (out[i + 3] === 0) continue; const x = p % w, y = (p / w) | 0;
      const edge = (x > 0 && out[i - 1] === 0) || (x < w - 1 && out[i + 7] === 0) || (y > 0 && out[i - w * 4 + 3] === 0) || (y < h - 1 && out[i + w * 4 + 3] === 0);
      if (edge && chroma(i) < 20 && lum(data[i], data[i + 1], data[i + 2]) > bgLum * 0.72) drop.push(i);
    }
    drop.forEach(i => { out[i + 3] = 0; });
  }
  if (bgNeutral) {
    // the bottom band: a flood from the removed background through pale, colourless pixels (JPEG noise allowed),
    // at most 3% of the image deep -- a coloured or dark subject edge stops it
    const shade = p => { const i = p * 4; return out[i + 3] > 0 && ((p / w) | 0) > shadowZone && chroma(i) < 24 && lum(data[i], data[i + 1], data[i + 2]) > bgLum * 0.5; };
    const depth = new Int16Array(w * h).fill(-1); const q = []; const maxDepth = Math.max(4, Math.round(h * 0.03));
    for (let p = 0; p < w * h; p++) { if (!shade(p)) continue; const x = p % w, y = (p / w) | 0; const i = p * 4; if ((x > 0 && out[i - 1] === 0) || (x < w - 1 && out[i + 7] === 0) || (y > 0 && out[i - w * 4 + 3] === 0) || (y < h - 1 && out[i + w * 4 + 3] === 0)) { depth[p] = 0; q.push(p); } }
    for (let k = 0; k < q.length; k++) {
      const p = q[k]; if (depth[p] >= maxDepth) continue; const x = p % w, y = (p / w) | 0;
      for (const r of [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, y > 0 ? p - w : -1, y < h - 1 ? p + w : -1]) if (r >= 0 && depth[r] < 0 && shade(r)) { depth[r] = depth[p] + 1; q.push(r); }
    }
    q.forEach(p => { out[p * 4 + 3] = 0; });
  }
  return { img: { width: w, height: h, data: out }, bbox: [minX / w, minY / h, (maxX + 1) / w, (maxY + 1) / h].map(v => +v.toFixed(3)), removedShare: +removedShare.toFixed(3), clean: true, reason: 'plain background removed', edgeTouch, edgeContrast: +edgeContrast.toFixed(2), weakEdge: +weakEdge.toFixed(2), assess: a };
}

// crop an RGBA image to a normalised box (used after a cutout, so the subject fills its layer)
function crop(img, box, pad) {
  const { width: w, height: h, data } = img; const p = pad || 0.02;
  const x0 = Math.max(0, Math.floor((box[0] - p) * w)), y0 = Math.max(0, Math.floor((box[1] - p) * h)), x1 = Math.min(w, Math.ceil((box[2] + p) * w)), y1 = Math.min(h, Math.ceil((box[3] + p) * h));
  const cw = Math.max(1, x1 - x0), ch = Math.max(1, y1 - y0); const out = new Uint8ClampedArray(cw * ch * 4);
  for (let y = 0; y < ch; y++) out.set(data.subarray(((y + y0) * w + x0) * 4, ((y + y0) * w + x1) * 4), y * cw * 4);
  return { width: cw, height: ch, data: out };
}

// what a scene may do with an asset, from its assessment
function capabilities(asset) {
  const a = asset.assess || {}; const big = (a.width || 0) >= 900 || (a.height || 0) >= 900;
  const free = !!(a.transparent || asset.cutout);
  return {
    moveFreely: free,                          // a separate layer that can float over a world
    frame: !free,                              // a picture in a frame / window
    backdrop: !free && a.orientation === 'landscape' && big, // wide and sharp enough to fill a hero
    heroSize: big || free,                     // sharp enough to be shown large
    lowRes: (a.width || 0) < 500 && (a.height || 0) < 500,
  };
}

module.exports = { assess, cutout, crop, capabilities, palette, lum, hex };
