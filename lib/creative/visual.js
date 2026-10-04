'use strict';
// CREATIVE -- THE VISUAL DIRECTOR: what the finished page LOOKS like, judged from the page itself (rendered, captured at
// 1440 and 390 -- visual-capture.js), not from its plan. The structured director (direction.js) knows what each scene is;
// it cannot see that a serum is a sliver of the screen, that a giant headline sinks into a dark portrait, or that an
// ending is quieter than the scene before it. This module measures exactly those things and names them:
//
//   MEASURE / PAGE   the in-page scripts: every picture, the actor, video and 3D as drawn (the subject inside each
//                    picture, through its crop), every line of words with its colour and size
//   metrics()        from those and the screenshots (PNG): how much of the screen the subject commands, the contrast of
//                    the words against what they actually stand on, dead space, balance, competing focal points, and
//                    each scene's visual impact
//   detect()         the visual failures, genre-aware (luxury may breathe; a car should dominate; editorial type may
//                    lead), per view -- desktop and mobile are separate questions
//   offered()        the bounded repairs each scene can take (a fixed vocabulary; only what the composition system can
//                    do safely) -- the model chooses among these, never anything else
//   normalise()      plan.visualReview (VERSION), the only door into a stored page
//
// Browser-safe and pure: no I/O. visual-review.js runs the browser, the model and the repairs.
const VERSION = 1;

const ISSUES = ['hero_subject_too_small', 'hero_lacks_dominance', 'subject_lost', 'too_much_dead_space', 'weak_text_contrast', 'headline_lost_in_image',
  'weak_hierarchy', 'visually_boring', 'no_focal_point', 'looks_unfinished', 'accidental_composition', '3d_disconnected', '3d_too_small', 'video_underused',
  'payoff_weaker_than_previous', 'opening_weaker_than_later', 'poor_balance', 'crowded_one_side', 'subject_fights_type', 'wrong_crop', 'generic_template',
  'mobile_loses_impact', 'type_unreadable_oversized', 'accidental_overlap', 'abrupt_transition', 'competing_focal_points', 'weak_final_payoff', 'competing_heading_overlap'];
const REPAIRS = ['increase_subject_dominance', 'decrease_subject_dominance', 'move_copy_left', 'move_copy_right', 'move_copy_up', 'move_copy_down',
  'increase_text_contrast', 'simplify_background', 'switch_to_full_bleed', 'switch_to_takeover', 'switch_to_typography_stage', 'reduce_dead_space',
  'increase_negative_space', 'enlarge_3d', 'reduce_3d', 'move_3d_forward', 'move_3d_back', 'strengthen_payoff', 'strengthen_opening',
  'reduce_competing_elements', 'change_crop_focus', 'increase_image_dominance', 'decrease_image_dominance', 'remove_unnecessary_frame', 'simplify_scene',
  'restore_previous_composition'];
// (not offered: switch_to_actor_stage -- an actor lives across a run the art direction planned; it is never bolted on)
// the layouts that exist to show a picture (one that shows none is unfinished)
const PICTURED = ['editorial-hero', 'cinematic', 'fullscreen-object', 'image', 'framed', 'split', 'shrine', 'luxe', 'object-stage', 'campaign', 'gallery', 'image-wall', 'edge-crop', 'canvas', 'depth-stack', 'cardstream'];
const SEVERITY = ['low', 'medium', 'high']; const SW = { low: 1, medium: 2, high: 3 };
const VIEWS = ['desktop', 'mobile'];

// how much of the screen the subject should command in the opening, by genre (a share of the viewport), and how much
// flat, empty screen is still a choice rather than a gap. Luxury and editorial may breathe; a car or a can should not
// be a detail of its own opening; editorial and personal pages may let typography lead instead.
const GENRE = {
  product: { subject: 0.16, dead: 0.6 }, fashion: { subject: 0.14, dead: 0.62 }, automotive: { subject: 0.2, dead: 0.6 }, tech: { subject: 0.12, dead: 0.62 },
  luxury: { subject: 0.1, dead: 0.74 }, hospitality: { subject: 0.12, dead: 0.66 }, editorial: { subject: 0.06, dead: 0.72, type: true }, personal: { subject: 0.08, dead: 0.72, type: true },
  other: { subject: 0.12, dead: 0.66 },
};
const LOUD = { aggressive: 1.15, expressive: 1, restrained: 0.85 };
function bar(concept) {
  const k = concept || {}; const g = GENRE[k.genre] || GENRE.other; const f = LOUD[k.intensity] || 1;
  return { subject: g.subject * f, dead: Math.min(0.85, g.dead / Math.sqrt(f)), type: !!g.type, genre: k.genre || 'other' };
}

// ---------------------------------------------------------------- in the page
// PAGE: where each scene starts, and the page's own layout faults (a held scene rests in the middle of its hold -- a held
// composition where it arrives: at its own rest, the state its camera is designed around, the moment it fills the screen)
const PAGE = `(() => { const vw = document.documentElement.clientWidth; const sc = [...document.querySelectorAll('section.sc')];
  return { vw, vh: innerHeight, height: document.scrollingElement.scrollHeight, overflowX: Math.max(0, document.scrollingElement.scrollWidth - vw),
    scenes: sc.map((s, i) => { const r = s.getBoundingClientRect(); const at = Math.max(0, Math.round(r.top + scrollY)); return { i, id: s.id, layout: s.dataset.layout || 'free', at, h: Math.round(r.height), rest: s.hasAttribute('data-pin') && s.dataset.comp && s.dataset.rest != null ? at + 1 : at + Math.max(0, Math.round((r.height - innerHeight) / 2)) }; }) }; })()`;
// MEASURE(i, subjects): scene i as it rests on screen. subjects: { assetId: [x0, y0, x1, y1] } (the measured subject, for
// pictures that do not carry it -- the actor's cut-out)
function MEASURE(i, subjects) {
  return `(() => { const I = ${+i}; const SUBJ = ${JSON.stringify(subjects || {})};
  const vw = document.documentElement.clientWidth, vh = innerHeight; const sec = document.querySelectorAll('section.sc')[I]; if (!sec) return null;
  const clip = r => { const x0 = Math.max(0, r.left), y0 = Math.max(0, r.top), x1 = Math.min(vw, r.right), y1 = Math.min(vh, r.bottom); return x1 > x0 + 1 && y1 > y0 + 1 ? [x0, y0, x1, y1].map(v => Math.round(v)) : null; };
  const shown = el => { for (let p = el; p && p !== document.documentElement; p = p.parentElement) { const cs = getComputedStyle(p); if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity < 0.08) return false; } return true; };
  // the subject inside a picture as drawn: through object-fit / object-position, then the element's own scale
  const subjOf = (el, sj) => { if (!sj || sj.length !== 4) return null; const r = el.getBoundingClientRect(); const bw = el.offsetWidth || r.width, bh = el.offsetHeight || r.height; const nw = el.naturalWidth || el.videoWidth || bw, nh = el.naturalHeight || el.videoHeight || bh; if (!bw || !bh || !nw || !nh) return null;
    const cs = getComputedStyle(el); const fit = cs.objectFit; let s, cw, ch; if (fit === 'cover') s = Math.max(bw / nw, bh / nh); else if (fit === 'contain' || fit === 'scale-down') s = Math.min(bw / nw, bh / nh); if (s) { cw = nw * s; ch = nh * s; } else { cw = bw; ch = bh; }
    const pos = (cs.objectPosition || '50% 50%').split(' ').map(v => (/%$/.test(v) ? parseFloat(v) / 100 : 0.5)); const ox = (bw - cw) * pos[0], oy = (bh - ch) * (pos[1] == null ? 0.5 : pos[1]); const kx = r.width / bw, ky = r.height / bh;
    return { left: r.left + (ox + sj[0] * cw) * kx, top: r.top + (oy + sj[1] * ch) * ky, right: r.left + (ox + sj[2] * cw) * kx, bottom: r.top + (oy + sj[3] * ch) * ky }; };
  const out = { i: I, vw, vh, id: sec.id, layout: sec.dataset.layout || 'free', top: Math.round(sec.getBoundingClientRect().top), surface: sec.dataset.surf || '', pics: [], words: [], decor: [], video: [], model: [] };
  const pic = (el, role, kind) => { if (!shown(el)) return; const r = el.getBoundingClientRect(); const c = clip(r); if (!c) return; const a = el.getAttribute('data-asset') || ''; const sj = (el.getAttribute('data-subj') || '').split(' ').map(Number); const ly = el.closest('.ly');
    const s = subjOf(el, sj.length === 4 && sj.every(v => !isNaN(v)) ? sj : SUBJ[a]); const cs = getComputedStyle(el); let crop = 0; const nw = el.naturalWidth, nh = el.naturalHeight, bw = el.offsetWidth, bh = el.offsetHeight; if (cs.objectFit === 'cover' && nw && nh && bw && bh) { const ai = nw / nh, ab = bw / bh; crop = ai > ab ? 1 - ab / ai : 1 - ai / ab; }
    const budget = el.hasAttribute('data-crop') ? +el.getAttribute('data-crop') : null;
    out.pics.push({ asset: a, role, kind, rect: c, subject: s ? clip(s) : null, frame: ly ? ly.getAttribute('data-frame') || '' : '', fit: cs.objectFit, crop: Math.round(crop * 1000) / 1000, over: budget != null && crop > budget + 0.1, video: !!(ly && ly.querySelector('.ly-vid')) }); };
  sec.querySelectorAll('.ly-img').forEach(el => { const ly = el.closest('.ly'); pic(el, ly ? ly.getAttribute('data-role') || '' : '', 'layer'); });
  document.querySelectorAll('.cr-cast .ca-img').forEach(el => pic(el, 'actor', 'actor'));
  sec.querySelectorAll('.sc-herovid').forEach(el => { const c = clip(el.getBoundingClientRect()); if (c) out.video.push({ rect: c, hero: true }); });
  sec.querySelectorAll('.ly-vid').forEach(el => { const ly = el.closest('.ly'); const img = ly && ly.querySelector('.ly-img'); const c = clip((shown(el) ? el : img || el).getBoundingClientRect()); if (c) out.video.push({ rect: c, hero: false }); });
  sec.querySelectorAll('.td-stage, .td-poster').forEach(el => { if (!shown(el)) return; const c = clip(el.getBoundingClientRect()); if (c) out.model.push({ rect: c }); });
  sec.querySelectorAll('.ly[data-kind="shape"], .ly[data-kind="word"]').forEach(el => { if (!shown(el)) return; const c = clip(el.getBoundingClientRect()); if (c) out.decor.push({ kind: el.getAttribute('data-kind'), role: el.getAttribute('data-role') || '', rect: c }); });
  // the type that could compete with the heading: the heading's settled line, a text-swap's other line, word layers --
  // each with what the eye gets of it (opacity through every parent, colour, size) and where it sits in the stacking
  out.type = [];
  const eff = el => { let o = 1; for (let p = el; p && p !== document.documentElement; p = p.parentElement) o *= +getComputedStyle(p).opacity; return o; };
  const glyphs = el => { const rg = document.createRange(); rg.selectNodeContents(el); const rs = [...rg.getClientRects()].filter(r => r.width > 2 && r.height > 2); if (!rs.length) return null; return clip({ left: Math.min(...rs.map(r => r.left)), top: Math.min(...rs.map(r => r.top)), right: Math.max(...rs.map(r => r.right)), bottom: Math.max(...rs.map(r => r.bottom)) }); };
  const zOf = el => { for (let p = el; p && p !== sec; p = p.parentElement) { const z = getComputedStyle(p).zIndex; if (z !== 'auto') return +z || 0; } return 0; };
  // (a word layer draws each letter in its own span: its size and colour are the letters', not the container's)
  const typeOf = (el, k) => { if (!el || !el.textContent.trim()) return; const r = glyphs(el); if (!r) return; const g = [...el.querySelectorAll('*')].find(x => x.children.length === 0 && x.textContent.trim()) || el; const cs = getComputedStyle(g);
    out.type.push({ k, text: el.textContent.trim().slice(0, 80), rect: r, px: parseFloat(cs.fontSize) || 0, opacity: Math.round(eff(el) * 1000) / 1000, color: cs.color, fill: cs.webkitTextFillColor || '', stroke: parseFloat(cs.webkitTextStrokeWidth) || 0, z: zOf(el) }); };
  const HD = sec.querySelector('.sc-heading'); if (HD) { typeOf(HD.querySelector('.hs-main') || HD, 'heading'); typeOf(HD.querySelector('.hs-alt'), 'swap'); }
  sec.querySelectorAll('.ly[data-kind="word"]').forEach(el => { const t = el.querySelector('.lw') || el; typeOf(t, 'word'); });
  [['heading', '.sc-heading'], ['kicker', '.sc-kicker'], ['body', '.sc-body']].forEach(([k, q]) => sec.querySelectorAll(q).forEach(el => { if (!shown(el) || !el.textContent.trim()) return;
    const rg = document.createRange(); rg.selectNodeContents(el); const rs = [...rg.getClientRects()].filter(r => r.width > 2 && r.height > 2); if (!rs.length) return;
    const u = rs.reduce((a, r) => [Math.min(a[0], r.left), Math.min(a[1], r.top), Math.max(a[2], r.right), Math.max(a[3], r.bottom)], [1e9, 1e9, -1e9, -1e9]);
    const cs = getComputedStyle(el); const off = u[0] < -2 || u[2] > vw + 2; const c = clip({ left: u[0], top: u[1], right: u[2], bottom: u[3] });
    out.words.push({ k, rect: c, lines: rs.slice(0, 12).map(r => clip(r)).filter(Boolean), off, px: parseFloat(cs.fontSize) || 0, color: cs.color, fill: cs.webkitTextFillColor || '', stroke: parseFloat(cs.webkitTextStrokeWidth) || 0, chars: el.textContent.trim().length }); }));
  return out; })()`;
}

// ---------------------------------------------------------------- from the screenshots
const rgbOf = s => { const m = /rgba?\(([^)]+)\)/.exec(String(s || '')); if (!m) return null; const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return p.length >= 3 ? { r: p[0], g: p[1], b: p[2], a: p.length >= 4 ? p[3] : 1 } : null; };
const lin = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
const lumOf = (r, g, b) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
const ratio = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
const area = r => (r ? Math.max(0, r[2] - r[0]) * Math.max(0, r[3] - r[1]) : 0);
const inside = (x, y, r) => r && x >= r[0] && x < r[2] && y >= r[1] && y < r[3];
const meet = (a, b) => { const r = [Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.min(a[2], b[2]), Math.min(a[3], b[3])]; return r[2] > r[0] && r[3] > r[1] ? r : null; };
const union = rs => rs.filter(Boolean).reduce((a, r) => (a ? [Math.min(a[0], r[0]), Math.min(a[1], r[1]), Math.max(a[2], r[2]), Math.max(a[3], r[3])] : r.slice()), null);

// the words against what they actually stand on (the screenshot without them): the share of the words' lines whose
// background is too close to their colour (large type 2:1, small 3:1), and the median ratio
function contrastOf(word, bare, k) {
  const c = rgbOf(word.fill && rgbOf(word.fill) && rgbOf(word.fill).a > 0 ? word.fill : word.color); if (!c || c.a < 0.3 || !bare) return null;
  const Lt = lumOf(c.r, c.g, c.b); const large = word.px >= 30; const need = large ? 2 : 3; const rs = []; const lines = word.lines && word.lines.length ? word.lines : [word.rect];
  // (the glyphs: the middle of each line box, not the air above and below it -- and the worst letter-sized patch of
  // them: a giant word that sinks into a dark picture for a letter or two is lost there, however clear the rest is)
  let worst = 0;
  lines.forEach(r => { if (!r) return; const nx = Math.max(3, Math.min(40, Math.round((r[2] - r[0]) / 12))), ny = Math.max(2, Math.min(8, Math.round((r[3] - r[1]) / 12))); const g = [];
    for (let iy = 0; iy < ny; iy++) { const row = []; for (let ix = 0; ix < nx; ix++) { const x = Math.floor((r[0] + (ix + 0.5) * (r[2] - r[0]) / nx) * k), y = Math.floor((r[1] + (0.15 + 0.7 * (iy + 0.5) / ny) * (r[3] - r[1])) * k); if (x < 0 || y < 0 || x >= bare.width || y >= bare.height) { row.push(null); continue; } const o = (y * bare.width + x) * 4; const v = ratio(Lt, lumOf(bare.data[o], bare.data[o + 1], bare.data[o + 2])); rs.push(v); row.push(v < need ? 1 : 0); } g.push(row); }
    if (word.px < 30 || (r[2] - r[0]) < word.px * 2) return;
    const wx = Math.max(2, Math.round((word.px * 0.6) / ((r[2] - r[0]) / nx))), wy = Math.max(1, Math.ceil(ny / 2));
    for (let y0 = 0; y0 + wy <= ny; y0++) for (let x0 = 0; x0 + wx <= nx; x0++) { let n = 0, lo = 0; for (let y = y0; y < y0 + wy; y++) for (let x = x0; x < x0 + wx; x++) { const v = g[y][x]; if (v == null) continue; n++; lo += v; } if (n) worst = Math.max(worst, lo / n); } });
  if (!rs.length) return null; rs.sort((a, b) => a - b);
  return { low: +(rs.filter(v => v < need).length / rs.length).toFixed(3), median: +rs[rs.length >> 1].toFixed(2), worst: +worst.toFixed(2), need };
}
// the screen in cells: flat cells outside every picture and every line of words are dead space; the rest carry visual
// mass (local contrast + distance from the surface), whose centre says where the screen leans
function fieldOf(shot, m, k) {
  if (!shot) return null; const W = shot.width, H = shot.height; const nx = m.vw >= 700 ? 24 : 10, ny = m.vw >= 700 ? 15 : 22; const cw = W / nx, ch = H / ny; const cells = [];
  const solid = m.pics.map(p => p.rect).concat(m.words.map(w => w.rect), m.video.map(v => v.rect), m.model.map(v => v.rect)).filter(Boolean);
  for (let iy = 0; iy < ny; iy++) for (let ix = 0; ix < nx; ix++) {
    let n = 0, s = 0, s2 = 0; const x0 = Math.floor(ix * cw), y0 = Math.floor(iy * ch), x1 = Math.floor((ix + 1) * cw), y1 = Math.floor((iy + 1) * ch);
    for (let y = y0; y < y1; y += 2) for (let x = x0; x < x1; x += 2) { const o = (y * W + x) * 4; const l = 0.299 * shot.data[o] + 0.587 * shot.data[o + 1] + 0.114 * shot.data[o + 2]; n++; s += l; s2 += l * l; }
    const mean = n ? s / n : 0; const sd = n ? Math.sqrt(Math.max(0, s2 / n - mean * mean)) : 0; const cx = (ix + 0.5) * cw / k, cy = (iy + 0.5) * ch / k;
    cells.push({ ix, iy, mean, sd, covered: solid.some(r => inside(cx, cy, r)), nav: cy < 64 });
  }
  const flat = cells.filter(c => c.sd < 5); const surf = flat.length ? flat.map(c => c.mean).sort((a, b) => a - b)[flat.length >> 1] : 128;
  const live = cells.filter(c => !c.nav); const dead = live.filter(c => c.sd < 5 && !c.covered && Math.abs(c.mean - surf) < 14).length / Math.max(1, live.length);
  let tm = 0, mx = 0, my = 0, left = 0, right = 0; live.forEach(c => { const w = c.sd + Math.abs(c.mean - surf) * 0.6; tm += w; mx += w * (c.ix + 0.5) / nx; my += w * (c.iy + 0.5) / ny; if (c.ix < nx / 3) left += w; else if (c.ix >= (2 * nx) / 3) right += w; });
  return { dead: +dead.toFixed(3), cx: tm ? +(mx / tm).toFixed(3) : 0.5, cy: tm ? +(my / tm).toFixed(3) : 0.5, side: tm ? +(Math.max(left, right) / tm).toFixed(3) : 0, lean: left > right ? 'left' : 'right', busy: +(live.filter(c => c.sd >= 5).length / Math.max(1, live.length)).toFixed(3) };
}
// the visible share of a box (or a shape's actual pixels: a 3D model is the part of its stage that differs from the surface)
function pixelsIn(shot, r, k, surf) {
  if (!shot || !r) return 0; let n = 0, hit = 0; for (let y = Math.floor(r[1] * k); y < Math.floor(r[3] * k); y += 3) for (let x = Math.floor(r[0] * k); x < Math.floor(r[2] * k); x += 3) { if (x >= shot.width || y >= shot.height) continue; const o = (y * shot.width + x) * 4; n++; const l = 0.299 * shot.data[o] + 0.587 * shot.data[o + 1] + 0.114 * shot.data[o + 2]; if (Math.abs(l - surf) > 18) hit++; }
  return n ? hit / n : 0;
}

// competing type: the heading and any other headline-sized type over it, both visible, neither clearly beneath the other.
// Not a fault: type that does not touch the heading (a word behind the product, an edge label), a faint watermark
// (under 20% opacity), or layered type with a clear hierarchy (twice the heading's size or more, and well under half its
// visual weight). Weight = what the eye gets: opacity x the contrast of its colour on the surface (an outline reads light).
const tokens = x => new Set(String(x || '').toLowerCase().replace(/[^\p{L}\p{N} ]+/gu, ' ').split(/\s+/).filter(Boolean));
function typeOverlapOf(m, surfaceHex) {
  const T = m.type || []; const P = T.find(x => x.k === 'heading'); if (!P || !P.rect) return null;
  const sl = (() => { const h = /^#([0-9a-f]{6})$/i.exec(surfaceHex || ''); if (!h) return lumOf(128, 128, 128); const v = parseInt(h[1], 16); return lumOf((v >> 16) & 255, (v >> 8) & 255, v & 255); })();
  const weight = x => { const fill = rgbOf(x.fill) && rgbOf(x.fill).a > 0.05 ? rgbOf(x.fill) : null; const c = fill || rgbOf(x.color); if (!c) return 0;
    const legible = Math.min(1, (ratio(lumOf(c.r, c.g, c.b), sl) - 1) / 3); return x.opacity * (c.a == null ? 1 : c.a) * (fill || c.a > 0.05 ? legible : 0.35); };
  const wp = weight(P); let worst = null;
  T.filter(x => x !== P && x.rect).forEach(S => {
    const o = meet(P.rect, S.rect); if (!o) return; const ov = area(o) / Math.max(1, Math.min(area(P.rect), area(S.rect)));
    const size = S.px / Math.max(1, P.px); const ws = weight(S); if (ov < 0.25 || size < 0.5) return;
    if (S.opacity < 0.2 || P.opacity < 0.2 || ws < 0.12) return;                       // (a watermark, or only one of them is really there)
    if (size >= 2 && ws <= 0.35 * wp) return;                                          // (deliberate layering: a clear hierarchy)
    const a = tokens(P.text), b = tokens(S.text); const same = a.size && b.size ? [...a].filter(t => b.has(t)).length / new Set([...a, ...b]).size : 0;
    const score = +(ov * Math.min(1, ws / Math.max(0.05, wp))).toFixed(3);
    if (!worst || score > worst.score) worst = { score, kind: S.k, overlap: +ov.toFixed(2), size: +size.toFixed(2), weight: +ws.toFixed(2), primary: +wp.toFixed(2), similar: +same.toFixed(2), text: S.text.slice(0, 40) };
  });
  return worst;
}
// metrics(scene capture { m, shot, bare } (PNGs decoded { width, height, data }), { focal ids }) -> the scene's visual facts
function metrics(cap, ctx) {
  const m = cap.m; if (!m) return null; const V = m.vw * m.vh; const k = cap.shot ? cap.shot.width / m.vw : 0.5; const c = ctx || {};
  const pics = m.pics.map(p => Object.assign({}, p, { share: area(p.rect) / V, sshare: p.subject ? area(p.subject) / V : 0 }));
  // the subject: what the page is about -- the actor, the focal or subject picture, the owner's main picture; else the largest
  const key = pics.filter(p => p.role === 'actor' || p.role === 'focal' || p.role === 'subject' || (c.main && c.main.includes(p.asset)));
  const subjP = (key.length ? key : pics).slice().sort((a, b) => (b.sshare || b.share) - (a.sshare || a.share))[0] || null;
  const subject = subjP ? (subjP.sshare || subjP.share * 0.6) : 0;
  const head = m.words.find(w => w.k === 'heading'); const field = fieldOf(cap.shot, m, k);
  const con = {}; m.words.forEach(w => { if (con[w.k]) return; const x = contrastOf(w, cap.bare, k); if (x) con[w.k] = x; });
  // where the words cross a picture: the share of the heading's box over a picture (or the actor)
  const over = head && head.rect ? Math.min(1, pics.reduce((t, p) => t + area(meet(head.rect, p.rect)), 0) / Math.max(1, area(head.rect))) : 0;
  const video = m.video.length ? Math.max(...m.video.map(v => area(v.rect) / V)) : null;
  const surfL = field && cap.shot ? (() => { const s = []; for (let i = 0; i < cap.shot.data.length; i += 4 * 97) s.push(0.299 * cap.shot.data[i] + 0.587 * cap.shot.data[i + 1] + 0.114 * cap.shot.data[i + 2]); s.sort((a, b) => a - b); return s[s.length >> 1]; })() : 128;
  const model = m.model.length ? Math.max(...m.model.map(v => (area(v.rect) / V) * pixelsIn(cap.shot, v.rect, k, surfL))) : null;
  const big = pics.filter(p => p.share >= 0.1).map(p => p.share).concat(m.decor.filter(d => d.kind === 'word' && area(d.rect) / V >= 0.15).map(d => area(d.rect) / V)).sort((a, b) => b - a);
  const headPx = head ? head.px / m.vh : 0; const headLow = con.heading ? con.heading.low : 0;
  const lead = Math.max(subject, video ? video * 0.8 : 0, model || 0);
  // visual impact, 0..1: how strongly the scene holds the eye -- the subject's command of the screen, the type's scale
  // (as legible as it is), and how much of the screen is doing something
  const impact = 0.5 * Math.min(1, lead / 0.3) + 0.3 * Math.min(1, headPx / 0.14) * (headLow >= 0.35 ? 0.5 : 1) + 0.2 * (field ? 1 - field.dead : 0.5);
  return {
    i: m.i, id: m.id, layout: m.layout, subject: +subject.toFixed(3), picture: +(pics.length ? Math.max(...pics.map(p => p.share)) : 0).toFixed(3), subjectAsset: subjP ? subjP.asset : null, subjectRole: subjP ? subjP.role : null,
    heading: head ? { px: +headPx.toFixed(3), share: +(area(head.rect) / V).toFixed(3), over: +over.toFixed(2), off: !!head.off, chars: head.chars } : null,
    contrast: con, dead: field ? field.dead : null, balance: field ? { cx: field.cx, side: field.side, lean: field.lean } : null, busy: field ? field.busy : null,
    focal: big.length, focalTop: big.slice(0, 2).map(v => +v.toFixed(3)), video: video == null ? null : +video.toFixed(3), model: model == null ? null : +model.toFixed(3),
    typeOverlap: typeOverlapOf(m, m.surface), pictures: pics.length, textOff: m.words.filter(w => w.off).length, cropOver: m.pics.filter(p => p.over).length, actor: pics.some(p => p.role === 'actor'), impact: +impact.toFixed(3), lowFi: !!(c.lowFi && subjP && c.lowFi.includes(subjP.asset)),
  };
}

// ---------------------------------------------------------------- what is visibly wrong
// detect({ desktop: [metrics per scene], mobile: [...] }, { concept, scenes (the plan's), run(i) }) -> [{ scene, view, issue, severity, evidence }]
function detect(views, ctx) {
  const c = ctx || {}; const B = bar(c.concept); const out = []; const add = (scene, view, issue, severity, evidence) => out.push({ scene, view, issue, severity, evidence });
  VIEWS.forEach(view => {
    const S = views[view] || []; if (!S.length) return; const n = S.length; const mob = view === 'mobile';
    S.forEach((x, i) => {
      if (!x) return;
      // the words: unreadable against what they stand on (large type sinking into a picture; small words without contrast)
      const hc = x.contrast.heading; if (hc && x.heading && !x.lowFi && hc.low >= 0.25) add(i, view, x.heading.over >= 0.25 ? 'headline_lost_in_image' : 'weak_text_contrast', hc.low >= 0.45 ? 'high' : 'medium', { low: hc.low, median: hc.median, over: x.heading.over });
      // (a large headline that disappears for a stretch where it crosses a picture)
      else if (hc && x.heading && !x.lowFi && x.heading.over >= 0.1 && x.heading.px >= 0.06 && hc.worst >= 0.75) add(i, view, 'headline_lost_in_image', hc.worst >= 0.9 ? 'high' : 'medium', { worst: hc.worst, low: hc.low, over: x.heading.over });
      // a scene made to show a picture that shows none: unfinished, whatever its words
      if (PICTURED.includes(x.layout) && x.pictures === 0 && x.video == null && x.model == null) add(i, view, 'looks_unfinished', 'high', { layout: x.layout, picture: x.picture });
      ['kicker', 'body'].forEach(k => { const t = x.contrast[k]; if (t && !x.lowFi && t.low >= 0.5) add(i, view, 'weak_text_contrast', 'medium', { words: k, low: t.low, median: t.median }); });
      if (x.heading && x.heading.off) add(i, view, 'type_unreadable_oversized', 'high', { textOff: x.textOff });
      // dead space: a flat, empty screen with no picture large enough to make the emptiness a choice -- nor a monumental
      // headline (a giant statement on a field is the scene, on any page; on a type-led page a large one is)
      if (x.dead != null && x.dead >= B.dead && x.picture < 0.3 && !(x.heading && x.heading.px >= (B.type ? 0.1 : 0.12))) add(i, view, 'too_much_dead_space', x.dead >= B.dead + 0.1 ? 'medium' : 'low', { dead: x.dead, limit: +B.dead.toFixed(2) });
      // balance (desktop: the screen leans hard to one side and nothing answers it)
      if (!mob && x.balance && Math.abs(x.balance.cx - 0.5) >= 0.2 && x.balance.side >= 0.62) add(i, view, 'crowded_one_side', 'low', { cx: x.balance.cx, side: x.balance.side, lean: x.balance.lean });
      // too many things asking to be looked at, none winning
      if (x.focal >= 3 && x.focalTop[0] < 1.5 * x.focalTop[1]) add(i, view, 'competing_focal_points', 'medium', { large: x.focal, top: x.focalTop });
      // two headline-sized pieces of type in one place, both legible enough to fight
      if (x.typeOverlap && x.typeOverlap.score >= 0.3) add(i, view, 'competing_heading_overlap', x.typeOverlap.score >= 0.55 || x.typeOverlap.similar >= 0.5 || x.typeOverlap.kind === 'swap' ? 'high' : 'medium', x.typeOverlap);
      if (x.video != null && !c.heroOnly && x.video < 0.35) add(i, view, 'video_underused', 'high', { video: x.video });
      if (x.model != null && x.model < (mob ? 0.1 : 0.12)) add(i, view, '3d_too_small', 'high', { model: x.model });
    });
    // the opening: an obvious focal point, a subject that commands the screen for its genre -- or, where the genre lets
    // type lead, type that does
    const h = S[0];
    if (h) {
      const typeLeads = B.type && h.heading && h.heading.px >= 0.1 && !(h.contrast.heading && h.contrast.heading.low >= 0.25);
      const need = B.subject * (mob ? 0.75 : 1); const lead = Math.max(h.subject, h.video ? h.video * 0.8 : 0, h.model || 0);
      if (!typeLeads && lead < need) {
        if (mob && views.desktop && views.desktop[0] && Math.max(views.desktop[0].subject, views.desktop[0].video || 0) >= B.subject) add(0, view, 'mobile_loses_impact', 'medium', { subject: h.subject, need: +need.toFixed(3), desktop: views.desktop[0].subject });
        // (graded: far below the bar is a subject too small to carry the opening; just below it, a subject that could command more)
        else add(0, view, lead < need * 0.6 ? 'hero_subject_too_small' : 'hero_lacks_dominance', lead < need * 0.6 ? 'high' : lead < need * 0.85 ? 'medium' : 'low', { subject: h.subject, need: +need.toFixed(3), genre: B.genre });
      }
      if (lead < 0.03 && !(h.heading && h.heading.px >= 0.08)) add(0, view, 'no_focal_point', 'high', { subject: h.subject, headline: h.heading ? h.heading.px : 0 });
      // the opening should be among the strongest moments of the page
      const later = Math.max(0, ...S.slice(1).map(x => (x ? x.impact : 0)));
      if (!mob && n >= 3 && h.impact < 0.75 * later && h.impact < 0.5) add(0, view, 'opening_weaker_than_later', 'medium', { impact: h.impact, strongest: +later.toFixed(3) });
    }
    // the ending should feel like one: not quieter than the scene before it
    const L = S[n - 1], P = S[n - 2];
    // ...and judged as an ending in its own right, against the page's recent visual high point (the last three scenes
    // before it that show a real subject -- a text-only scene in between does not excuse it): a subject that is a speck,
    // or one that falls well short of that high point and of what its genre's ending needs. Luxury may end quietly but
    // not on a speck; editorial and personal pages may end on type; an actor or image callback promises a subject.
    let finalWeak = false; let typeEnds = false;
    if (L && n >= 3) {
      const k = c.concept || {}; const lead = x => (x ? Math.max(x.subject, x.video ? x.video * 0.8 : 0, x.model || 0) : 0);
      const promised = ['actor-return', 'image-callback'].includes(k.bookend); typeEnds = !!((B.type || !promised) && L.heading && L.heading.px >= (mob ? 0.05 : 0.08) && !(L.contrast.heading && L.contrast.heading.low >= 0.25));
      const need = B.subject * (B.genre === 'luxury' ? 0.45 : B.type ? 0.5 : 0.7) * (mob ? 0.75 : 1);
      const recent = S.slice(Math.max(0, n - 4), n - 1).filter(x => x && lead(x) >= 0.05); const high = recent.length ? recent : S.slice(0, n - 1).filter(x => x && lead(x) >= 0.05);
      const hiLead = Math.max(0, ...high.map(lead)), hiImpact = Math.max(0, ...high.map(x => x.impact)); const l = lead(L);
      const speck = L.pictures > 0 && l < 0.02 && !typeEnds; const short = l < need && (l < 0.45 * hiLead || L.impact < 0.6 * hiImpact) && !typeEnds;
      const empty = L.pictures === 0 && L.video == null && L.model == null && promised && !typeEnds;
      if (speck || short || empty) { finalWeak = true; add(n - 1, view, 'weak_final_payoff', speck || empty || l < need * 0.5 ? 'high' : 'medium', { subject: l, need: +need.toFixed(3), recentHigh: +hiLead.toFixed(3), impact: L.impact, recentImpact: +hiImpact.toFixed(3), speck, genre: B.genre }); }
    }
    // (an ending carried by its type, where the genre lets type lead, is not a quiet picture)
    if (!mob && !finalWeak && !typeEnds && L && P && n >= 3 && L.impact < 0.82 * P.impact && L.impact < 0.55) add(n - 1, view, 'payoff_weaker_than_previous', L.impact < 0.65 * P.impact ? 'high' : 'medium', { impact: L.impact, previous: P.impact });
  });
  // (desktop and phone are separate questions: each view's findings stand on their own -- a phone problem is never folded
  // into the desktop one, or it could neither be offered nor repaired for the phone)
  return out;
}
const score = list => (list || []).reduce((t, f) => t + (SW[f.severity] || 1), 0);

// ---------------------------------------------------------------- what each scene can take (the only repairs offered)
// scene: the plan's scene; m: its metrics (desktop); ctx: { i, n, run (in the actor's run), event (a premium moment),
// previous (the composition the structured director replaced, if any), threeD (a 3D model stands in this scene) }
const FOR = {
  hero_subject_too_small: ['increase_subject_dominance', 'strengthen_opening', 'switch_to_full_bleed', 'remove_unnecessary_frame', 'reduce_dead_space'],
  hero_lacks_dominance: ['increase_subject_dominance', 'strengthen_opening', 'remove_unnecessary_frame', 'switch_to_full_bleed'],
  subject_lost: ['increase_subject_dominance', 'switch_to_full_bleed', 'reduce_competing_elements'],
  mobile_loses_impact: ['increase_subject_dominance', 'move_copy_down'],
  too_much_dead_space: ['reduce_dead_space', 'switch_to_full_bleed', 'increase_image_dominance'],
  weak_text_contrast: ['move_copy_left', 'move_copy_right', 'increase_text_contrast', 'decrease_image_dominance', 'change_crop_focus'],
  headline_lost_in_image: ['move_copy_right', 'move_copy_left', 'decrease_image_dominance', 'increase_text_contrast'],
  subject_fights_type: ['move_copy_left', 'move_copy_right', 'decrease_image_dominance', 'change_crop_focus'],
  payoff_weaker_than_previous: ['strengthen_payoff', 'increase_subject_dominance', 'switch_to_full_bleed', 'reduce_competing_elements'],
  opening_weaker_than_later: ['strengthen_opening', 'increase_subject_dominance', 'switch_to_typography_stage', 'restore_previous_composition'],
  poor_balance: ['move_copy_left', 'move_copy_right', 'increase_image_dominance'], crowded_one_side: ['move_copy_left', 'move_copy_right', 'increase_negative_space'],
  competing_focal_points: ['reduce_competing_elements', 'simplify_scene', 'remove_unnecessary_frame'], accidental_overlap: ['reduce_competing_elements', 'simplify_scene'],
  looks_unfinished: ['switch_to_typography_stage', 'switch_to_full_bleed', 'simplify_scene'], accidental_composition: ['simplify_scene', 'restore_previous_composition', 'switch_to_full_bleed'],
  '3d_too_small': ['enlarge_3d', 'move_3d_forward', 'reduce_competing_elements'], '3d_disconnected': ['move_3d_forward', 'simplify_background', 'simplify_scene'],
  video_underused: ['switch_to_full_bleed', 'increase_image_dominance'], wrong_crop: ['change_crop_focus', 'remove_unnecessary_frame'],
  generic_template: ['switch_to_takeover', 'switch_to_typography_stage', 'switch_to_full_bleed'], visually_boring: ['switch_to_takeover', 'increase_subject_dominance', 'switch_to_typography_stage'],
  weak_hierarchy: ['simplify_scene', 'increase_subject_dominance', 'switch_to_typography_stage'], no_focal_point: ['increase_subject_dominance', 'switch_to_full_bleed', 'strengthen_opening'],
  // the ending judged as an ending (whatever the scene before it is); a second piece of large type over the heading
  weak_final_payoff: ['increase_subject_dominance', 'strengthen_payoff', 'switch_to_full_bleed', 'simplify_scene'],
  competing_heading_overlap: ['reduce_competing_elements', 'simplify_scene', 'move_copy_up', 'move_copy_down'],
  // (type too large for its screen, a seam that jars: named, not repaired here -- text fitting and continuity own them)
  type_unreadable_oversized: [], abrupt_transition: [],
};
function capable(scene, m, ctx) {
  const c = ctx || {}; const L = scene.layers || []; const img = L.some(x => x.kind === 'image'); const open = !c.run && !c.event && scene.layout && scene.layout !== 'free';
  const t = scene.text || {}; const words = !!(t.heading || t.kicker || t.body); const decor = L.filter(x => (x.kind === 'shape' || x.kind === 'word') && x.role !== 'focal').length + (t.alt ? 1 : 0);
  const ok = new Set();
  if (img || c.run) { ok.add('increase_subject_dominance'); ok.add('decrease_subject_dominance'); ok.add('reduce_dead_space'); ok.add('increase_negative_space'); }
  if (img) { ok.add('increase_image_dominance'); ok.add('decrease_image_dominance'); }
  if (img && L.some(x => x.kind === 'image' && x.fit === 'cover')) ok.add('change_crop_focus');
  if (img && L.some(x => x.kind === 'image' && ((x.mask && x.mask !== 'none') || x.frame))) ok.add('remove_unnecessary_frame');
  if (words && t.place && Array.isArray(t.place.gc)) { if (t.place.gc[0] > 1) ok.add('move_copy_left'); if (t.place.gc[1] < 12) ok.add('move_copy_right'); if (t.place.v !== 'top') ok.add('move_copy_up'); if (t.place.v !== 'bottom') ok.add('move_copy_down'); }
  if (words && t.place) ok.add('increase_text_contrast');
  if (decor) { ok.add('reduce_competing_elements'); ok.add('simplify_scene'); ok.add('simplify_background'); }
  if (open && img) { ok.add('switch_to_full_bleed'); ok.add('switch_to_takeover'); if (c.i === 0) ok.add('strengthen_opening'); if (c.i === c.n - 1) ok.add('strengthen_payoff'); }
  if (open && words) ok.add('switch_to_typography_stage');
  if (open && c.previous) ok.add('restore_previous_composition');
  if (c.threeD) ['enlarge_3d', 'reduce_3d', 'move_3d_forward', 'move_3d_back'].forEach(r => ok.add(r));
  return ok;
}
// on a phone the words stack with the picture: moving them sideways or recomposing the scene is a desktop decision
const PHONE = ['increase_subject_dominance', 'decrease_subject_dominance', 'reduce_dead_space', 'increase_negative_space', 'increase_image_dominance', 'decrease_image_dominance', 'move_copy_up', 'move_copy_down', 'increase_text_contrast', 'reduce_competing_elements', 'simplify_scene', 'change_crop_focus'];
// offered(finding, scene, metrics, ctx) -> the repairs for this finding this scene can take, in the order worth trying
function offered(f, scene, m, ctx) {
  const ok = capable(scene, m, ctx); if (f.view === 'mobile') [...ok].forEach(r => { if (!PHONE.includes(r)) ok.delete(r); });
  let list = (FOR[f.issue] || []).filter(r => ok.has(r));
  // words over a picture move AWAY from it: toward the side the picture is not
  if (['weak_text_contrast', 'headline_lost_in_image', 'subject_fights_type'].includes(f.issue) && m && m.balance) { const away = m.balance.lean === 'left' ? 'move_copy_right' : 'move_copy_left'; list = [away].concat(list.filter(r => r !== away)).filter(r => ok.has(r)); }
  if (f.issue === 'crowded_one_side' && m && m.balance) { const away = m.balance.lean === 'left' ? 'move_copy_right' : 'move_copy_left'; list = [away].concat(list.filter(r => r !== away)).filter(r => ok.has(r)); }
  return [...new Set(list)];
}
// all the repairs a scene may take for anything the model judges (its own findings choose among these)
function anyFor(scene, m, ctx, view) { const ok = capable(scene, m, ctx); return REPAIRS.filter(r => ok.has(r) && (view !== 'mobile' || PHONE.includes(r))); }

// ---------------------------------------------------------------- the stored record (the only door)
const clean = (v, n) => String(v == null ? '' : v).replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, n);
function normalise(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const item = x => (x && typeof x === 'object' && ISSUES.includes(x.issue) ? Object.assign({ scene: clean(x.scene, 60), issue: x.issue, view: VIEWS.includes(x.view) ? x.view : 'desktop', severity: SEVERITY.includes(x.severity) ? x.severity : 'medium' }, REPAIRS.includes(x.repair) ? { repair: x.repair } : {}) : null);
  const list = (x, n) => (Array.isArray(x) ? x : []).slice(0, n).map(item).filter(Boolean);
  return {
    v: Number.isInteger(raw.v) && raw.v >= 1 && raw.v <= VERSION ? raw.v : VERSION, source: ['measure', 'ai+measure'].includes(raw.source) ? raw.source : 'measure',
    verdict: ['strong', 'almost', 'weak'].includes(raw.verdict) ? raw.verdict : null,
    before: Math.max(0, Math.min(99, +raw.before || 0)), after: Math.max(0, Math.min(99, +raw.after || 0)),
    found: list(raw.found, 16), kept: list(raw.kept, 3), reverted: list(raw.reverted, 6),
  };
}

module.exports = { VERSION, ISSUES, REPAIRS, SEVERITY, VIEWS, GENRE, FOR, PHONE, PICTURED, bar, PAGE, MEASURE, contrastOf, fieldOf, metrics, detect, score, capable, offered, anyFor, normalise };
