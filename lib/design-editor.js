'use strict';
// THE WEBSITE EDITOR for design sites: what the owner may change on a built site, read from the design's own rules
// (its schema: text lengths, number ranges, choices, colours, list sizes), and how a change is applied. It changes the
// real site state -- the content the design's template is built from -- never a picture of it. Every saved change goes
// through the same checker as generation (lib/design-sites.js edit()), so an edit can never break a design.
//
//   fields(d, spec, content)   -> { fields: [{ path, kind, value, min, max, options, locked }], lists: [{ path, length, min, max }] }
//                                 kind: text | number | choice | toggle | colour, in the order the content has them
//   apply(d, spec, content, { changes: [{ path, value }], ops: [{ op: 'add' | 'remove', list, index }] })
//                              -> { content, changed: [paths] }; throws an Error with .errors for anything not editable
// Pure: no I/O.

const { expand, isPhoto, PHOTO_MAX_KB } = require('../design-packages/engine/engine');
const clone = (o) => JSON.parse(JSON.stringify(o));
// a schema pattern ("configure.cases.*.price", "nav.*") against a concrete path
const matches = (pat, p) => { const a = pat.split('.'), b = p.split('.'); return a.length === b.length && a.every((x, i) => x === '*' || x === b[i]); };

function rules(d) {
  const S = d.schema, out = [];
  for (const [pat, [lo, hi]] of Object.entries(S.text || {})) out.push({ pat, kind: 'text', min: lo, max: hi });
  for (const [pat, [lo, hi]] of Object.entries(S.numbers || {})) out.push({ pat, kind: 'number', min: lo, max: hi });
  for (const [pat, spec] of Object.entries(S.choices || {})) { const opts = Array.isArray(spec) ? spec : spec.options; out.push({ pat, kind: opts.every((o) => typeof o === 'boolean') ? 'toggle' : 'choice', options: opts }); }
  for (const pat of S.colours || []) out.push({ pat, kind: 'colour' });
  return out;
}

function leaves(content) {
  const out = [];
  (function walk(o, p) {
    if (Array.isArray(o)) o.forEach((x, i) => walk(x, p ? `${p}.${i}` : String(i)));
    else if (o && typeof o === 'object') { for (const [k, v] of Object.entries(o)) if (!k.startsWith('_')) walk(v, p ? `${p}.${k}` : k); }
    else if (o !== null && o !== undefined) out.push([p, o]);
  })(content, '');
  return out;
}

function fields(d, spec, content, { hidden = false } = {}) {
  const R = rules(d), pinned = new Set(Object.keys(spec.pinned || {}));
  const fieldsOut = [];
  for (const [p, v] of leaves(content)) {
    const r = R.find((x) => matches(x.pat, p));
    if (!r) continue; // not in the design's rules: protected (the drawing, the plan geometry, derived values)
    const f = { path: p, kind: r.kind, value: v };
    if (r.min != null) { f.min = r.min; f.max = r.max; }
    if (r.options) f.options = r.options;
    if (pinned.has(p)) f.locked = true;
    fieldsOut.push(f);
  }
  // optional fields (schema.optional: a finish colour, strap or bracelet): offered on every item they apply to, empty
  // meaning the design's own drawn default; each goes in after its item's other fields
  let alwaysAt = 0;
  for (const [pat, o] of Object.entries(d.schema.optional || {})) {
    if (o.hidden && !hidden) continue; // (set by the system, e.g. the hero director's camera plan)
    for (const [p, v] of expand(content, pat)) {
      const parent = p.split('.').slice(0, -1).join('.'), owner = parent ? at(content, parent) : content;
      // (offer 'always': a field whose group may not exist yet, like the photo hero's photos)
      if (o.offer !== 'always' && (!owner || typeof owner !== 'object')) continue;
      if (fieldsOut.some((x) => x.path === p)) continue;
      if (o.offer === 'present' && v == null) continue; // (a spec row's length, only on the rows that have one)
      const f = { path: p, kind: o.kind, value: v == null ? null : v, optional: o.offer !== 'present' };
      if (o.max != null) { f.min = o.min || 0; f.max = o.max; }
      if (o.options) f.options = o.options;
      if (o.label) f.label = o.label;
      if (o.hidden) f.hidden = true;
      // (an 'always' field goes first, in the order the design lists them: the photos lead the editor)
      if (o.offer === 'always') { fieldsOut.splice(alwaysAt++, 0, f); continue; }
      let k = -1; fieldsOut.forEach((x, i) => { if (x.path.startsWith(parent + '.')) k = i; });
      fieldsOut.splice(Math.max(k + 1, alwaysAt), 0, f);
    }
  }
  const lists = [], locked = new Set(spec.editorLockedLists || []); // (a list whose items carry geometry the editor can't set, e.g. a floor plan's rooms)
  for (const [pat, [lo, hi]] of Object.entries(d.schema.lists || {})) {
    if (locked.has(pat)) continue;
    const parts = pat.split('.');
    (function walk(v, i, acc) {
      if (i === parts.length) { if (Array.isArray(v) && lo !== hi) lists.push({ path: acc.join('.'), length: v.length, min: lo, max: hi }); return; }
      if (v == null) return;
      if (parts[i] === '*') { if (Array.isArray(v)) v.forEach((x, n) => walk(x, i + 1, acc.concat(n))); return; }
      walk(v[parts[i]], i + 1, acc.concat(parts[i]));
    })(content, 0, []);
  }
  return { fields: fieldsOut, lists };
}

function at(o, p) { return p.split('.').reduce((a, k) => (a == null ? a : a[k]), o); }
function setAt(o, p, v) {
  const ks = p.split('.'), last = ks.pop();
  // (a group that isn't there yet, like photos.*, is made on the way)
  let parent = o; for (const k of ks) { if (parent[k] == null && !/^\d+$/.test(k)) parent[k] = {}; parent = parent[k]; }
  if (parent == null || typeof parent !== 'object') throw new Error(`${p}: not found`);
  parent[last] = v;
}

// (system: true lets the system set its own hidden fields too, like the hero director's camera plan; a photo's subject
// mask may also come with the photo itself, as the server sends it after analysing a photo the owner uploaded)
function apply(d, spec, content, { changes = [], ops = [], system = false } = {}) {
  const next = clone(content), errors = [], changed = [];
  const { fields: F, lists: L } = fields(d, spec, content, { hidden: true });
  const withPhoto = new Set(changes.filter((c) => /^photos\.(main|before|second|third)$/.test(c.path) && c.value).map((c) => c.path + 'Mask'));
  for (const ch of changes) {
    const f = F.find((x) => x.path === ch.path && (!x.hidden || system || withPhoto.has(x.path)));
    if (!f) { errors.push(`${ch.path}: not something this design lets you change`); continue; }
    if (f.locked) { errors.push(`${ch.path}: set from the brief (the business name), not editable here`); continue; }
    let v = ch.value;
    // an optional field cleared: back to the design's own default
    if (f.optional && (v == null || v === '')) { if (f.value != null) { const ks = ch.path.split('.'), last = ks.pop(), grp = ks.length ? at(next, ks.join('.')) : next; delete grp[last]; if (ks.length && !Object.keys(grp).length) { const up = ks.length > 1 ? at(next, ks.slice(0, -1).join('.')) : next; delete up[ks[ks.length - 1]]; } changed.push(ch.path); } continue; }
    if (f.kind === 'week') {
      // { sun: null | { open, close }, ... } (or that as JSON): every other key of the object is kept
      try { v = typeof v === 'string' ? JSON.parse(v) : v; } catch (e) { errors.push(`${ch.path}: a week of opening hours`); continue; }
      const days = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'], wk = Object.assign({}, f.value);
      for (const dd of days) wk[dd] = v && v[dd] && v[dd].open ? { open: String(v[dd].open), close: String(v[dd].close) } : null;
      v = wk;
    } else if (f.kind === 'number') { v = typeof v === 'number' ? v : Number(String(v).replace(/[^\d.-]/g, '')); if (!isFinite(v)) { errors.push(`${ch.path}: a number`); continue; } }
    else if (f.kind === 'toggle') v = v === true || v === 'true';
    else if (f.kind === 'colour') { v = String(v).trim().toLowerCase(); if (!/^#[0-9a-f]{6}$/.test(v)) { errors.push(`${ch.path}: a colour like #2c5a4e`); continue; } }
    else if (f.kind === 'photo') { v = String(v || ''); if (!isPhoto(v)) { errors.push(`${ch.path}: a JPEG, PNG or WebP photo (up to ${PHOTO_MAX_KB} KB)`); continue; } }
    else if (f.kind === 'choice') { if (!f.options.includes(v)) { errors.push(`${ch.path}: one of ${f.options.join(', ')}`); continue; } }
    else v = String(v ?? '').replace(/\s+/g, ' ').trim();
    if (JSON.stringify(v) === JSON.stringify(f.value)) continue;
    setAt(next, ch.path, v); changed.push(ch.path);
  }
  // list ops, highest index first so removals don't shift each other
  for (const op of ops.slice().sort((a, b) => (b.index || 0) - (a.index || 0))) {
    const l = L.find((x) => x.path === op.list), arr = at(next, op.list);
    if (!l || !Array.isArray(arr)) { errors.push(`${op.list}: not a list this design lets you change`); continue; }
    const i = Math.max(0, Math.min(arr.length - 1, op.index == null ? arr.length - 1 : op.index));
    if (op.op === 'add') { if (arr.length >= l.max) { errors.push(`${op.list}: at most ${l.max}`); continue; } arr.splice(i + 1, 0, clone(arr[i])); changed.push(`${op.list}.${i + 1}`); }
    else if (op.op === 'remove') { if (arr.length <= l.min) { errors.push(`${op.list}: at least ${l.min}`); continue; } arr.splice(i, 1); changed.push(op.list); }
    else errors.push(`${op.list}: unknown change "${op.op}"`);
  }
  if (errors.length) throw Object.assign(new Error('Some changes could not be made.'), { errors });
  // the owner swapped or removed a hero photo: the camera plan was for the old photos, so the default moves take over
  // (and a swapped photo's subject mask was found in the old photo: it goes too, until the photo is analysed again)
  if (!system && next.photos && changed.some((c) => c.startsWith('photos.'))) {
    delete next.photos.camera;
    for (const c of changed) if (/^photos\.(main|before|second|third)$/.test(c) && !changed.includes(c + 'Mask')) delete next.photos[c.slice(7) + 'Mask'];
    if (!Object.keys(next.photos).length) delete next.photos;
  }
  return { content: next, changed };
}

module.exports = { fields, apply, rules, matches };
