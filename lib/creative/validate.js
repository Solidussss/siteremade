'use strict';
// CREATIVE — every scene plan (deterministic director or model) passes through here before it
// is rendered or stored. Two jobs:
//   1. structure: whitelist enums, cap strings and counts, drop references to assets / facts
//      that do not exist, enforce the honesty rules (sourced lines must cite a real fact; a
//      personal subject is only ever shown in the owner's own photos; general species facts
//      stay in a clearly-labelled aside).
//   2. composition: work out where the subject is ACTUALLY drawn (its box, the image's aspect,
//      the subject's position inside the image) on a desktop stage and a phone stage, then keep
//      the subject large, keep the headline off it, and move -- or drop -- secondary layers that
//      collide. The subject is never shrunk to make room.
//
//   validatePlan(plan, assets) -> { plan, fixes: [..], warnings: [..] }
//   subjectRect(layer, asset, stage) -> the drawn subject rectangle in stage %
// Data only -- nothing in a plan is ever executed; the renderer escapes every string.

const WORLDS = ['monument', 'studio', 'fog', 'underwater', 'night', 'sky', 'warm', 'paper'];
const TONES = ['lyrical', 'cinematic', 'playful', 'absurd', 'tender', 'editorial', 'retro'];
const KINDS = ['recognizable', 'personal', 'fictional'];
const LAYOUTS = ['stage', 'portrait', 'panorama', 'type'];
const FRAMES = ['none', 'window', 'frame', 'arch', 'porthole'];
const SHADOWS = ['none', 'floor', 'drop', 'glow'];
const ENTRANCES = ['rise', 'descend', 'pop', 'fade', 'unveil', 'dolly', 'none'];
const LOOPS = ['float', 'sway', 'swim', 'breathe', 'drift', 'none'];
const ROLES = ['subject', 'companion'];
const CONNECTORS = ['ribbon', 'thread', 'bubbles', 'orbit', 'line', 'none'];
const LIGHTS = ['spot', 'lamp', 'caustics', 'rim', 'sun', 'none'];
const PARTICLES = ['dust', 'fog', 'bubbles', 'stars', 'clouds', 'steam', 'none'];
const DISPLAYS = ['didone', 'grotesk', 'serif', 'rounded', 'slab'];
const SECTION_TYPES = ['about', 'ask', 'gallery', 'memories', 'aside', 'closing', 'statement', 'story', 'dossier', 'specimen', 'plate', 'facts', 'timeline', 'ode', 'sources'];
const COPY_KINDS = ['sourced', 'supplied', 'imagined', 'mixed'];
const TITLE_PLACES = { d: ['left', 'bottom'], m: ['top', 'bottom'] };
const MAX_SECTIONS = 12, MAX_LAYERS = 4, MAX_ITEMS = 8;

// the stages the composition is checked on: a desktop hero (16:10) and the phone hero's picture stage
const STAGES = { d: { aspect: 1.6 }, m: { aspect: 0.9 } };
// where the headline block sits on the desktop stage, per placement (x, y, w, h in %)
const TITLE_BOXES = { left: [5, 14, 41, 70], bottom: [5, 60, 56, 34] };

const str = (v, n) => (typeof v === 'string' ? v : v == null ? '' : String(v)).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim().slice(0, n);
const oneOf = (v, list, dflt) => (list.includes(v) ? v : dflt);
const num = (v, lo, hi, dflt) => (typeof v === 'number' && isFinite(v) ? Math.max(lo, Math.min(hi, v)) : dflt);
const HEX = /^#[0-9a-f]{6}$/i;
function box(raw, dflt) {
  const b = Array.isArray(raw) && raw.length === 4 && raw.every(v => typeof v === 'number' && isFinite(v)) ? raw.slice() : dflt.slice();
  b[2] = Math.max(4, Math.min(100, b[2])); b[3] = Math.max(4, Math.min(100, b[3]));
  b[0] = Math.max(0, Math.min(100 - b[2], b[0])); b[1] = Math.max(0, Math.min(100 - b[3], b[1]));
  return b.map(v => Math.round(v * 10) / 10);
}
const area = r => Math.max(0, r[2]) * Math.max(0, r[3]);
function relLum(hex) { const c = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; }
function contrast(a, b) { const x = relLum(a), y = relLum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }
function mix(a, b, t) { const pa = [1, 3, 5].map(i => parseInt(a.slice(i, i + 2), 16)), pb = [1, 3, 5].map(i => parseInt(b.slice(i, i + 2), 16)); return '#' + pa.map((v, i) => Math.round(v + (pb[i] - v) * t).toString(16).padStart(2, '0')).join(''); }
function overlap(a, b) { const x = Math.max(0, Math.min(a[0] + a[2], b[0] + b[2]) - Math.max(a[0], b[0])); const y = Math.max(0, Math.min(a[1] + a[3], b[1] + b[3]) - Math.max(a[1], b[1])); return x * y; }

// where a contained image (and the subject inside it) is actually drawn within a layer box
function drawnRect(layer, asset, stageKey) {
  const b = layer.box[stageKey]; const st = STAGES[stageKey];
  const imgAspect = asset && asset.assess && asset.assess.aspect ? asset.assess.aspect : 1;
  if (layer.fit === 'cover') return b.slice();
  // box aspect in real proportions: % of width vs % of height on a stage of aspect st.aspect
  const boxAspect = (b[2] * st.aspect) / b[3];
  let w = b[2], h = b[3];
  if (imgAspect > boxAspect) h = (b[2] * st.aspect) / imgAspect; else w = (b[3] * imgAspect) / st.aspect;
  return [b[0] + (b[2] - w) / 2, b[1] + (b[3] - h), w, h]; // centred, standing on the box floor (object-position 50% 100%)
}
function subjectRect(layer, asset, stageKey) {
  const r = drawnRect(layer, asset, stageKey); const s = asset && asset.assess && asset.assess.subject;
  if (!s || layer.fit === 'cover') return r;
  return [r[0] + s[0] * r[2], r[1] + s[1] * r[3], (s[2] - s[0]) * r[2], (s[3] - s[1]) * r[3]];
}

function cleanLayer(raw, assetsById, i) {
  if (!raw || typeof raw !== 'object') return null;
  const asset = assetsById.get(raw.asset); if (!asset) return null;
  const role = oneOf(raw.role, ROLES, i ? 'companion' : 'subject');
  const e = raw.entrance || {}; const l = raw.loop || {};
  return {
    id: str(raw.id, 40).replace(/[^\w-]/g, '') || `layer-${i + 1}`, role, asset: asset.id,
    box: { d: box(raw.box && raw.box.d, [50, 10, 40, 80]), m: box(raw.box && raw.box.m, [15, 10, 70, 80]) },
    z: Math.round(num(raw.z, 1, 9, role === 'subject' ? 5 : 3)), fit: raw.fit === 'cover' ? 'cover' : 'contain',
    focus: /^\d{1,3}% \d{1,3}%$/.test(raw.focus || '') ? raw.focus : '50% 50%',
    frame: oneOf(raw.frame, FRAMES, 'none'), shadow: oneOf(raw.shadow, SHADOWS, 'none'),
    entrance: { kind: oneOf(e.kind, ENTRANCES, 'fade'), delay: num(e.delay, 0, 3, 0.3), dur: num(e.dur, 0.3, 3, 1.2) },
    loop: { kind: oneOf(l.kind, LOOPS, 'none'), amp: num(l.amp, 0, 3, 1), period: num(l.period, 4, 30, 10) },
    depth: num(raw.depth, 0, 1, 0.3),
    ...(raw.hideM && role !== 'subject' ? { hideM: true } : {}),
  };
}

function cleanItems(raw, factIds, fixes, where) {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, MAX_ITEMS).map(it => {
    if (!it || typeof it !== 'object') return null;
    const kind = oneOf(it.kind, COPY_KINDS, 'imagined'); const cite = factIds.has(it.cite) ? it.cite : null;
    if (kind === 'sourced' && !cite) { fixes.push(`${where}: dropped a "sourced" line with no source`); return null; }
    const out = { text: str(it.text, 420), kind }; if (cite) out.cite = cite; if (it.year) out.year = str(it.year, 8);
    return out.text ? out : null;
  }).filter(Boolean);
}

function validatePlan(rawPlan, assets) {
  const fixes = [], warnings = []; const p = rawPlan && typeof rawPlan === 'object' ? rawPlan : {};
  const live = (assets || []).filter(a => a && a.id && !a.removed);
  const assetsById = new Map(live.map(a => [a.id, a]));
  const kind = oneOf(p.kind, KINDS, 'recognizable');
  const facts = (Array.isArray(p.facts) ? p.facts : []).slice(0, 40).map(f => f && ({ id: str(f.id, 20), text: str(f.text, 600), section: str(f.section, 80), source: str(f.source, 20) })).filter(f => f && f.id && f.text);
  const factIds = new Set(facts.map(f => f.id));
  const palette = {}; ['bg', 'bg2', 'ink', 'muted', 'accent', 'glow'].forEach(k => { palette[k] = HEX.test((p.palette || {})[k] || '') ? p.palette[k].toLowerCase() : { bg: '#15120f', bg2: '#2b231b', ink: '#f6efe3', muted: '#bfb2a0', accent: '#d8b46a', glow: '#fff1cf' }[k]; });
  // legible whatever the source of the plan: text on the background, and the accent (kicker, links, button)
  if (contrast(palette.ink, palette.bg) < 7) { palette.ink = relLum(palette.bg) > 0.3 ? '#15120f' : '#f6f3ee'; fixes.push('palette: text colour changed for legibility'); }
  if (contrast(palette.muted, palette.bg) < 4.5) palette.muted = mix(palette.ink, palette.bg, 0.3);
  for (let i = 0; i < 12 && contrast(palette.accent, palette.bg) < 3.2; i++) palette.accent = mix(palette.accent, relLum(palette.bg) > 0.3 ? '#000000' : '#ffffff', 0.18);

  // ---- hero ----
  const h = p.hero || {};
  let layers = (Array.isArray(h.layers) ? h.layers : []).slice(0, MAX_LAYERS).map((l, i) => cleanLayer(l, assetsById, i)).filter(Boolean);
  // a personal subject appears only in the owner's own pictures
  if (kind === 'personal') {
    const own = a => a && (a.origin === 'upload' || (a.cutoutOf && (assetsById.get(a.cutoutOf) || {}).origin === 'upload'));
    const before = layers.length; layers = layers.filter(l => own(assetsById.get(l.asset)));
    if (layers.length < before) fixes.push('hero: removed a picture that is not the owner\'s own photo of their subject');
  }
  // exactly one subject, first
  const subj = layers.find(l => l.role === 'subject') || layers[0];
  if (subj) { subj.role = 'subject'; layers = [subj].concat(layers.filter(l => l !== subj).map(l => Object.assign(l, { role: 'companion' }))); }
  let layout = oneOf(h.layout, LAYOUTS, subj ? 'stage' : 'type');
  if (!subj) layout = 'type';
  if (subj && layout === 'type') layout = 'stage';
  const t = h.title || {};
  const title = {
    kicker: str(t.kicker, 70), text: str(t.text, 80) || 'Untitled', tagline: str(t.tagline, 140), taglineKind: oneOf(t.taglineKind, COPY_KINDS, 'imagined'),
    lede: str(t.lede, 260), ledeKind: oneOf(t.ledeKind, COPY_KINDS, 'imagined'), cite: factIds.has(t.cite) ? t.cite : null,
    place: { d: oneOf(t.place && t.place.d, TITLE_PLACES.d, 'left'), m: oneOf(t.place && t.place.m, TITLE_PLACES.m, 'top') },
  };
  if (title.ledeKind === 'sourced' && !title.cite && title.lede) { title.lede = ''; fixes.push('hero: dropped a sourced introduction with no source'); }
  if (layout === 'panorama') { title.place.d = 'bottom'; }
  const atm = h.atmosphere || {};
  const hero = {
    layout, layers, title,
    atmosphere: { light: oneOf(atm.light, LIGHTS, 'none'), particles: oneOf(atm.particles, PARTICLES, 'none'), count: Math.round(num(atm.count, 0, 60, 12)) },
    camera: { entrance: h.camera && h.camera.entrance === 'none' ? 'none' : 'dolly', scroll: h.camera && h.camera.scroll === 'none' ? 'none' : 'push' },
    cta: { label: str(h.cta && h.cta.label, 40) || 'Scroll the story', target: '' },
  };

  // ---- composition ----
  if (subj && layout !== 'panorama') compose(hero, assetsById, fixes, warnings);

  // ---- sections ----
  const seen = new Set(); let sections = [];
  (Array.isArray(p.sections) ? p.sections : []).forEach(raw => {
    if (!raw || typeof raw !== 'object' || sections.length >= MAX_SECTIONS) return;
    const type = SECTION_TYPES.includes(raw.type) ? raw.type : null; if (!type) { fixes.push(`sections: unknown section type "${str(raw.type, 30)}" dropped`); return; }
    let id = str(raw.id, 40).replace(/[^\w-]/g, '') || `s-${type}-${sections.length + 1}`; while (seen.has(id)) id += 'x'; seen.add(id);
    const where = `section ${id}`;
    const s = { id, type, kind: oneOf(raw.kind, COPY_KINDS, 'imagined'), layout: str(raw.layout, 20).replace(/[^\w-]/g, '') };
    ['eyebrow', 'title', 'note'].forEach(k => { if (raw[k]) s[k] = str(raw[k], k === 'note' ? 200 : 160); });
    if (raw.body) s.body = str(raw.body, 900);
    if (Array.isArray(raw.paragraphs)) s.paragraphs = raw.paragraphs.slice(0, 6).map(x => str(x, 600)).filter(Boolean);
    if (raw.cite && factIds.has(raw.cite)) s.cite = raw.cite;
    if (raw.items) s.items = cleanItems(raw.items, factIds, fixes, where);
    if (raw.asset) { if (assetsById.has(raw.asset)) s.asset = raw.asset; else fixes.push(`${where}: picture no longer available, section kept without it`); }
    if (Array.isArray(raw.assets)) s.assets = raw.assets.filter(a => assetsById.has(a)).slice(0, 6);
    if (raw.studioOnly) s.studioOnly = true;
    // a statement "sourced" as a whole needs its citation
    if (type === 'statement' && s.kind === 'sourced' && !s.cite) s.kind = 'imagined';
    // personal subjects: sourced lines only in the general aside, which must say so
    if (kind === 'personal' && s.kind === 'sourced' && type !== 'aside' && type !== 'sources') { fixes.push(`${where}: sourced facts are not about this subject -- removed`); return; }
    if (kind === 'personal' && type === 'aside' && !s.note) s.note = 'General facts, not about this subject in particular.';
    if (kind === 'personal' && s.assets) s.assets = s.assets.filter(a => (assetsById.get(a) || {}).origin === 'upload');
    // sections that need content they no longer have
    if (['facts', 'timeline', 'memories', 'about'].includes(type) && !(s.items && s.items.length)) { fixes.push(`${where}: nothing left to show -- removed`); return; }
    if (type === 'gallery' && !(s.assets && s.assets.length)) { fixes.push(`${where}: no pictures left -- removed`); return; }
    if (type === 'plate' && !s.asset) { fixes.push(`${where}: no picture left -- removed`); return; }
    sections.push(s);
  });
  // the sources section always exists, once, last
  sections = sections.filter(s => s.type !== 'sources').concat([Object.assign({ id: 's-sources', type: 'sources', kind: 'sourced', title: 'Sources and credits', layout: 'list' }, (p.sections || []).find(s => s && s.type === 'sources') ? { id: str((p.sections.find(s => s && s.type === 'sources')).id, 40).replace(/[^\w-]/g, '') || 's-sources' } : {})]);
  const first = sections.find(s => !s.studioOnly && s.type !== 'sources') || sections[0];
  hero.cta.target = `#${first.id}`;

  const sources = (Array.isArray(p.sources) ? p.sources : []).slice(0, 12).map(s => s && ({ id: str(s.id, 20), title: str(s.title, 200), url: /^https:\/\//.test(s.url || '') ? str(s.url, 400) : '', license: str(s.license, 80), retrieved: str(s.retrieved, 40), used: str(s.used, 40) })).filter(s => s && s.title);
  const credits = (Array.isArray(p.credits) ? p.credits : []).filter(c => c && assetsById.has(c.asset)).map(c => ({ asset: c.asset, title: str(c.title, 200), author: str(c.author, 200), license: str(c.license, 80), url: /^https:\/\//.test(c.url || '') ? str(c.url, 400) : '', licenseUrl: /^https?:\/\//.test(c.licenseUrl || '') ? str(c.licenseUrl, 400) : '' }));
  const derived = (Array.isArray(p.derived) ? p.derived : []).filter(d => d && assetsById.has(d.asset)).map(d => ({ asset: d.asset, from: str(d.from, 40), note: str(d.note, 120) }));
  const conn = p.connector || {};
  const plan = {
    v: 1, kind, category: str(p.category, 20).replace(/[^\w-]/g, '') || 'concept', tone: oneOf(p.tone, TONES, 'editorial'), world: oneOf(p.world, WORLDS, 'studio'),
    concept: { line: str(p.concept && p.concept.line, 300), mood: oneOf(p.concept && p.concept.mood, TONES, 'editorial') },
    palette, type: { display: oneOf(p.type && p.type.display, DISPLAYS, 'serif') },
    hero, connector: { kind: oneOf(conn.kind, CONNECTORS, 'line'), colour: HEX.test(conn.colour || '') ? conn.colour : palette.accent },
    sections, sources, credits, derived, facts,
    motion: { intensity: p.motion && p.motion.intensity === 'calm' ? 'calm' : 'lively' },
    director: p.director === 'model' ? 'model' : 'deterministic',
    ...(p.fixture ? { fixture: str(p.fixture, 160) } : {}), // test fixtures say so on the page itself
  };
  // every picture on the page has its credit (or is the owner's upload, or a cutout of one that is credited)
  // ...and only pictures the page actually shows are listed
  const shown = new Set(); usedAssets(plan).forEach(id => { shown.add(id); const a = assetsById.get(id); if (a && a.cutoutOf) shown.add(a.cutoutOf); });
  plan.credits = plan.credits.filter(c => shown.has(c.asset)); plan.derived = plan.derived.filter(d => shown.has(d.asset));
  const credited = new Set(plan.credits.map(c => c.asset));
  usedAssets(plan).forEach(id => { const a = assetsById.get(id); const base = a && a.cutoutOf ? assetsById.get(a.cutoutOf) : a; if (base && base.origin !== 'upload' && !credited.has(base.id)) { const c = { asset: base.id, title: str(base.title, 200), author: str(base.author, 200), license: str(base.license, 80), url: /^https:\/\//.test(base.pageUrl || '') ? base.pageUrl : '', licenseUrl: /^https?:\/\//.test(base.licenseUrl || '') ? base.licenseUrl : '' }; plan.credits.push(c); credited.add(base.id); fixes.push(`credits: added the missing credit for ${c.title || base.id}`); } });
  return { plan, fixes, warnings };
}
function usedAssets(plan) {
  const ids = new Set(); plan.hero.layers.forEach(l => ids.add(l.asset));
  plan.sections.forEach(s => { if (s.asset) ids.add(s.asset); (s.assets || []).forEach(a => ids.add(a)); });
  return [...ids];
}

// ---- composition: subject large and clear of the headline; secondaries move or go -----------------------
const MIN_SUBJECT = { d: { area: 1400, h: 48 }, m: { area: 3000, h: 58 } }; // % x % of the stage
const COMPANION_SLOTS = { d: [[78, 60, 18, 32], [80, 6, 16, 26], [46, 66, 16, 30]], m: [[2, 4, 26, 24], [72, 4, 26, 24], [2, 72, 24, 26], [74, 72, 24, 26]] };
function compose(hero, assetsById, fixes, warnings) {
  const subj = hero.layers[0]; const sa = assetsById.get(subj.asset);
  ['d', 'm'].forEach(k => {
    // 1. the subject is big enough (grown around its centre if not -- never shrunk)
    let sr = subjectRect(subj, sa, k); const min = MIN_SUBJECT[k];
    for (let i = 0; i < 4 && (area(sr) < min.area || sr[3] < min.h) && (subj.box[k][3] < 100 || subj.box[k][2] < 100); i++) {
      // straight to the size needed (a little over), grown around its centre and kept on the stage
      const b = subj.box[k]; const g = Math.min(4, Math.max(1.05, Math.sqrt(min.area / Math.max(1, area(sr))), min.h / Math.max(1, sr[3])) * 1.04); const w = Math.min(100, b[2] * g), hh = Math.min(100, b[3] * g);
      subj.box[k] = box([b[0] - (w - b[2]) / 2, b[1] - (hh - b[3]) / 2, w, hh], b); sr = subjectRect(subj, sa, k);
      if (i === 0) fixes.push(`hero (${k === 'd' ? 'desktop' : 'phone'}): subject enlarged to stay the main visual`);
    }
    if (area(sr) < min.area * 0.8) warnings.push(`hero (${k === 'd' ? 'desktop' : 'phone'}): the subject picture is small in its frame (${Math.round(area(sr) / 100)}% of the stage)`);
    // 2. desktop: the headline never sits on the subject -- move the subject sideways, else move the headline
    if (k === 'd') {
      const tb = TITLE_BOXES[hero.title.place.d];
      if (overlap(sr, tb) > area(sr) * 0.04) {
        const b = subj.box.d; const shift = tb[0] + tb[2] + 1 - sr[0];
        if (hero.title.place.d === 'left' && b[0] + shift + b[2] <= 100) { subj.box.d = box([b[0] + shift, b[1], b[2], b[3]], b); fixes.push('hero (desktop): subject moved clear of the headline'); }
        else if (hero.title.place.d === 'left') { subj.box.d = box([100 - b[2], b[1], b[2], b[3]], b); if (overlap(subjectRect(subj, sa, 'd'), tb) > area(sr) * 0.04) { hero.title.place.d = 'bottom'; fixes.push('hero (desktop): headline moved below the subject'); } }
        sr = subjectRect(subj, sa, 'd');
        if (overlap(sr, TITLE_BOXES[hero.title.place.d]) > area(sr) * 0.04) warnings.push('hero (desktop): headline still touches the subject');
      }
    }
    // 3. companions: clear of the headline and mostly clear of the subject, else another slot, else dropped
    const blockers = k === 'd' ? [TITLE_BOXES[hero.title.place.d]] : [];
    hero.layers.slice(1).forEach(l => {
      const ok = r => blockers.every(b => overlap(r, b) === 0) && overlap(r, sr) <= area(r) * 0.03 && hero.layers.filter(o => o !== l && o !== subj && !o.dropped && !(k === 'm' && o.hideM)).every(o => overlap(r, drawnRect(o, assetsById.get(o.asset), k)) <= area(r) * 0.1);
      const cur = drawnRect(l, assetsById.get(l.asset), k); if (ok(cur)) return;
      const slot = COMPANION_SLOTS[k].find(s => { const t = Object.assign({}, l, { box: Object.assign({}, l.box, { [k]: s }) }); return ok(drawnRect(t, assetsById.get(l.asset), k)); });
      if (slot) { l.box[k] = slot.slice(); fixes.push(`hero (${k === 'd' ? 'desktop' : 'phone'}): ${l.id} moved to keep the subject and headline clear`); }
      else if (k === 'm') { l.hideM = true; fixes.push(`hero (phone): ${l.id} left out on phones -- no clear place for it`); }
      else { l.dropped = true; fixes.push(`hero (desktop): ${l.id} removed -- no clear place for it`); }
    });
  });
  hero.layers = hero.layers.filter(l => !l.dropped);
}

module.exports = { validatePlan, subjectRect, drawnRect, overlap, area, usedAssets, TITLE_BOXES, STAGES, WORLDS, SECTION_TYPES, CONNECTORS };
