// The customisation engine. Knows nothing about any one design: everything design-specific comes from the design
// package folder (design.json, template.html, schema.json, optional hooks.js and metrics.json).
//   const { loadDesign, validate, build } = require('./engine');
'use strict';
const fs = require('fs');
const path = require('path');
const { render } = require('./template');
const { fit, make, rgbHsl, hexRgb, contrast } = require('./colour');
const GUARDS = require('./guards');
const photoHero = require('./photo-hero');

// photos: a data URL of a JPEG/PNG/WebP (only base64 characters, so it is safe in an attribute and in CSS url()),
// or an https link without quotes, spaces or brackets
const PHOTO_MAX_KB = 900;
const isPhoto = (v) => typeof v === 'string' && (/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/.test(v) ? v.length <= PHOTO_MAX_KB * 1024 : /^https:\/\/[^\s"'()<>\\]+$/.test(v) && v.length <= 1000);
const get = (o, p) => p.split('.').reduce((v, k) => (v == null ? undefined : v[k]), o);

// every concrete path matching a pattern like "stages.*.name"
function expand(o, pattern) {
  const parts = pattern.split('.');
  const out = [];
  (function walk(v, i, acc) {
    if (i === parts.length) { out.push([acc.join('.'), v]); return; }
    if (v == null) { out.push([acc.concat(parts.slice(i)).join('.'), undefined]); return; }
    if (parts[i] === '*') { if (Array.isArray(v)) v.forEach((x, n) => walk(x, i + 1, acc.concat(n))); return; }
    walk(v[parts[i]], i + 1, acc.concat(parts[i]));
  })(o, 0, []);
  return out;
}

function loadDesign(dir) {
  const read = (f) => fs.readFileSync(path.join(dir, f), 'utf8');
  const manifest = JSON.parse(read('design.json'));
  const d = {
    dir, manifest,
    template: read(manifest.template || 'template.html'),
    schema: JSON.parse(read(manifest.schema || 'schema.json')),
    tables: manifest.tables ? (typeof manifest.tables === 'string' ? JSON.parse(read(manifest.tables)) : manifest.tables) : {},
    metrics: fs.existsSync(path.join(dir, 'metrics.json')) ? JSON.parse(read('metrics.json')) : {},
    hooks: manifest.hooks ? require(path.resolve(dir, manifest.hooks)) : {},
  };
  // a design that takes the business's photos in its hero (engine/photo-hero.js) offers the photo fields
  if (manifest.photoHero) d.schema.optional = Object.assign({}, photoHero.FIELDS, d.schema.optional || {});
  return d;
}

function families(d, c) {
  const out = {};
  for (const [name, f] of Object.entries(d.manifest.families || {})) {
    const target = get(c, f.target);
    out[name] = make(fit(f.base, /^#[0-9a-f]{6}$/i.test(target || '') ? target : f.base, !f.keepLightness));
  }
  return out;
}
// "F:#hex" -> that colour turned by family F; "=path" -> a colour from the content; "#hex" -> that fixed colour
function colourRef(ref, fam, c) { if (ref.startsWith('=')) return get(c, ref.slice(1)); if (/^#[0-9a-f]{6}$/i.test(ref)) return ref; const m = /^([A-Z][A-Za-z]*):(.+)$/.exec(ref); return fam[m[1]](m[2]); }

// width of a text in em, from the glyph table measured for this design (see measure.js)
function textEm(d, c, metric, text) {
  const spec = d.manifest.metrics[metric];
  const key = spec.fontChoice ? get(c, spec.fontChoice) : 'default';
  const table = d.metrics[metric] && d.metrics[metric][key];
  if (!table) throw new Error(`metrics.json has no "${metric}" for "${key}" - run engine/measure.js`);
  return [...text].reduce((a, ch) => a + (table[ch] ?? table['?'] ?? 0.6), 0);
}

function ctxFor(d, c) {
  return { design: d, content: c, families: families(d, c), get, expand, textEm: (m, t) => textEm(d, c, m, t), contrast, rgbHsl, hexRgb };
}

function validate(d, c) {
  const S = d.schema, errors = [];
  for (const [pat, [lo, hi]] of Object.entries(S.text || {})) {
    for (const [p, v] of expand(c, pat)) {
      if (typeof v !== 'string') { errors.push(`${p}: missing`); continue; }
      const n = [...v.replace(/\*/g, '')].length;
      if (n < lo || n > hi) errors.push(`${p}: ${n} characters (allowed ${lo}-${hi}): "${v}"`);
      if (/[<>{}\n\r]/.test(v)) errors.push(`${p}: contains < > { } or a line break`);
    }
  }
  for (const [pat, [lo, hi]] of Object.entries(S.lists || {})) {
    for (const [p, v] of expand(c, pat)) {
      if (!Array.isArray(v)) { errors.push(`${p}: missing list`); continue; }
      if (v.length < lo || v.length > hi) errors.push(`${p}: ${v.length} entries (allowed ${lo}-${hi})`);
    }
  }
  for (const [pat, [lo, hi]] of Object.entries(S.numbers || {})) {
    for (const [p, v] of expand(c, pat)) if (typeof v !== 'number' || !isFinite(v) || v < lo || v > hi) errors.push(`${p}: ${v} (allowed ${lo}-${hi})`);
  }
  for (const [pat, spec] of Object.entries(S.choices || {})) {
    const opts = Array.isArray(spec) ? spec : spec.options, optional = !Array.isArray(spec) && spec.optional;
    for (const [p, v] of expand(c, pat)) if (!(v === undefined && optional) && !opts.includes(v)) errors.push(`${p}: "${v}" is not one of ${opts.join(', ')}`);
  }
  for (const pat of S.colours || []) for (const [p, v] of expand(c, pat)) if (!/^#[0-9a-f]{6}$/i.test(v || '')) errors.push(`${p}: use #rrggbb`);
  // optional fields (a finish colour, a strap or bracelet): checked only where present
  for (const [pat, o] of Object.entries(S.optional || {})) for (const [p, v] of expand(c, pat)) {
    if (v == null) continue;
    if (o.kind === 'colour' && !/^#[0-9a-f]{6}$/i.test(v)) errors.push(`${p}: use #rrggbb`);
    if (o.kind === 'choice' && !o.options.includes(v)) errors.push(`${p}: "${v}" is not one of ${o.options.join(', ')}`);
    if (o.kind === 'number' && (typeof v !== 'number' || !isFinite(v) || v < o.min || v > o.max)) errors.push(`${p}: ${v} (allowed ${o.min}-${o.max})`);
    // a photo the business uploaded (the editor shrinks it to a JPEG first), or an https link to one
    if (o.kind === 'photo' && !isPhoto(v)) errors.push(`${p}: a JPEG, PNG or WebP photo (up to ${PHOTO_MAX_KB} KB), or an https link to one`);
    if (o.kind === 'text') { const n = [...String(v).replace(/\*/g, '')].length; if (typeof v !== 'string' || n < (o.min || 0) || n > o.max) errors.push(`${p}: ${n} characters (allowed ${o.min || 0}-${o.max}): "${v}"`); }
    // a week of opening hours: each day null (closed) or { open, close } as HH:MM
    if (o.kind === 'week') for (const day of ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']) {
      const w = v[day], t = (x) => /^([01]\d|2[0-3]):[0-5]\d$/.test(x);
      if (w !== null && !(w && t(w.open) && t(w.close) && w.open < w.close)) errors.push(`${p}.${day}: closed, or open before close as HH:MM (24-hour)`);
    }
  }
  for (const [keys, max] of Object.entries(S.combined || {})) {
    const n = keys.split('+').reduce((a, k) => a + [...String(get(c, k) || '').replace(/\*/g, '')].length, 0);
    if (n > max) errors.push(`${keys}: ${n} characters together (allowed ${max})`);
  }
  if (errors.length) return { errors };

  const ctx = ctxFor(d, c);
  for (const w of S.widths || []) {
    for (const [p, v] of expand(c, w.path)) {
      const em = textEm(d, c, w.metric, w.transform === 'upper' ? String(v).toUpperCase() : String(v).replace(/\*/g, ''));
      if (em > w.maxEm) errors.push(`${p}: too wide for ${w.label} (${em.toFixed(1)} em, room for ${w.maxEm}): "${v}"`);
    }
  }
  const K = d.manifest.checks || {};
  for (const L of K.lightness || []) {
    for (const [p, v] of expand(c, L.path)) {
      const [, s, l] = rgbHsl(...hexRgb(v));
      if (l < L.range[0] || l > L.range[1]) errors.push(`${p}: lightness ${l.toFixed(2)} outside ${L.range.join('-')}${L.note ? ' (' + L.note + ')' : ''}`);
      if (L.maxSaturation != null && s > L.maxSaturation) errors.push(`${p}: saturation ${s.toFixed(2)} above ${L.maxSaturation}`);
    }
  }
  const measured = {};
  for (const [a, b, min, label] of K.contrast || []) {
    // either side may be a pattern over a list ("=notes.*.colour"): every entry is checked
    const as = a.startsWith('=') && a.includes('*') ? expand(c, a.slice(1)).map(([p, v]) => [p, v]) : [[a, colourRef(a, ctx.families, c)]];
    for (const [ap, av] of as) {
      const got = contrast(av, colourRef(b, ctx.families, c));
      measured[label + (as.length > 1 ? ` (${ap})` : '')] = +got.toFixed(2);
      if (got < min) errors.push(`contrast, ${label}${as.length > 1 ? ' ' + ap : ''}: ${got.toFixed(2)} (needs ${min})`);
    }
  }
  if (d.hooks.validate) errors.push(...(d.hooks.validate(c, ctx) || []));
  return { errors, contrast: measured };
}

function build(d, c) {
  const ctx = ctxFor(d, c);
  const derived = d.hooks.derive ? d.hooks.derive(c, ctx) : {};
  const css = (d.manifest.guards || []).map((g) => GUARDS[g.type](g, c, ctx)).filter(Boolean).join('\n');
  derived._guards = css ? css + '\n' : '';
  derived._guardList = (d.manifest.guards || []).filter((g) => GUARDS[g.type](g, c, ctx)).map((g) => g.name || g.type);
  // (a design with its own photo slots can still take a video hero: its "videoHero" says where it goes)
  const heroManifest = !d.manifest.photoHero && d.manifest.videoHero && c.photos && c.photos.video ? { ...d.manifest, photoHero: d.manifest.videoHero } : d.manifest;
  const html = photoHero.inject(render(d.template, { content: c, derived, families: ctx.families, tables: d.tables }), heroManifest, c);
  return { html, guards: derived._guardList };
}

module.exports = { loadDesign, validate, build, expand, get, isPhoto, PHOTO_MAX_KB };
