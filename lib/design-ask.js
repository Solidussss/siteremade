'use strict';
// ASK FOR A CHANGE (2026-10-22): the owner types what they want ("make it darker", "change the colours to black and
// gold", "add a booking button") and gets back a PLAN in the website editor's own terms -- the same field changes and
// list operations a person could make by hand (lib/design-editor.js). Nothing is saved here: the owner sees the plan
// (each field, before -> after), then applies it through the normal save (lib/design-sites.js edit()), with undo.
//
// Why this can't break a design: the writer only sees -- and may only name -- the fields the design lets the owner
// change (its schema). The drawing, the scroll scenes, the animation code and the layout live in the design's template,
// which is never touched; every plan is dry-run through the editor and the design's checker before it is shown, and a
// plan that fails is sent back to the writer once to fix. Requests the design can't do (a new kind of section, a photo
// in a design that draws its visuals in code, a different hero animation) come back as "cannot", in plain words, with
// the closest thing it can do -- never as a silent rewrite.
//
//   plan(d, spec, content, request, writer) -> Promise<{ ok, kind, summary, changes, ops, rename, cannot, question,
//                                                       diff: [{ path, label, before, after, approved }] }>
//   check(d, spec, content, p)              -> { errors, diff }   (pure: the dry run)

const editor = require('./design-editor');
const { validate } = require('../design-packages/engine/engine');

const MAX_REQUEST = 800;
const at = (o, p) => String(p).split('.').reduce((a, k) => (a == null ? a : a[k]), o);
const label = (p) => p.split('.').map((k) => (/^\d+$/.test(k) ? '#' + (+k + 1) : k.replace(/([a-z])([A-Z])/g, '$1 $2'))).join(' · ');

function catalogue(d, spec, content) {
  const { fields, lists } = editor.fields(d, spec, content);
  const F = fields.map((f) => {
    const range = f.kind === 'text' ? ` (${f.min}-${f.max} chars)` : f.kind === 'number' ? ` (${f.min}-${f.max})` : f.options ? ` (one of: ${f.options.map((o) => JSON.stringify(o)).join(', ')})` : f.kind === 'colour' ? ' (#rrggbb)' : '';
    return `${f.path} [${f.kind}${f.optional ? ', optional' : ''}${f.locked ? ', the business name' : ''}]${range} = ${JSON.stringify(f.value)}`;
  });
  const L = lists.map((l) => `${l.path}: ${l.length} items (${l.min}-${l.max}); "add" copies the item at index (default the last) to the next place`);
  return { fields, lists, text: F.join('\n'), listText: L.join('\n') };
}

function prompt(d, spec, content, request) {
  const cat = catalogue(d, spec, content);
  const approved = ((content._reality && content._reality.confirmed) || []).map((c) => c.path);
  const system = [
    `You edit a live website built from the "${spec.title}" design for the owner, from one request in their own words.`,
    'The design\'s pictures, scroll animation, interactions and layout are code you cannot see or change. You change the site ONLY through the editable fields listed below (its words, numbers, colours, switches and options) and its lists. Every other part of the site stays exactly as it is.',
    '',
    'Return exactly one JSON object and nothing else:',
    '{ "kind": "content" | "design" | "animation" | "mixed" | "none",',
    '  "summary": "one plain sentence to the owner: what will change",',
    '  "changes": [{ "path": "<a field path from the list>", "value": <new value> }],',
    '  "ops": [{ "op": "add" | "remove", "list": "<a list path>", "index": <number, optional> }],',
    '  "rename": null or "<the new business name, only when the owner asks to rename the business>",',
    '  "cannot": ["<each part of the request this design cannot do, in plain words, with the closest thing it can do>"],',
    '  "question": null or "<one short question, only when the request is too vague to act on at all>" }',
    '',
    'kind: "content" for words and numbers; "design" for colours, themes, fonts, finishes and the look; "animation" for motion, scenes and interactive parts; "mixed" for more than one; "none" when nothing can be changed.',
    '',
    'RULES',
    '- Change only what the request asks for. Keep every other field as it is: never rewrite text the owner did not ask about.',
    '- Use only paths from the list, values within each field\'s range and options, colours as #rrggbb. A text field must fit its character range.',
    '- Colours: change the theme colour fields together so the page stays readable (light text on dark backgrounds and the reverse). "Darker" means the background colours get darker and text stays legible.',
    '- Animation and scenes: you may change their words, numbers, switches and options; you cannot change how they move. A request for different motion goes in "cannot", with what the design already does.',
    '- Sections: a section can be switched on or off only if it has a switch in the list. A section the design does not have goes in "cannot", with the closest existing section you can use instead (and use it if that clearly serves the request).',
    '- Pictures: this design draws its visuals in code; it has no photo to replace. An uploaded picture goes in "cannot".',
    '- Facts: never invent prices, phone numbers, addresses, hours, reviews or credentials. Use the owner\'s own words for any fact they give.',
    approved.length ? `- The owner has already confirmed these fields: ${approved.join(', ')}. Change them only if the request names them directly.` : '',
    '- The business name is changed only through "rename", and only when asked.',
    '',
    'What this design shows:',
    ...(spec.writerNotes || []).map((n) => '- ' + n),
  ].filter((l) => l !== '').join('\n');
  const user = [
    'EDITABLE FIELDS (path [kind] (range) = current value):', cat.text,
    cat.listText ? 'LISTS:\n' + cat.listText : 'LISTS: none',
    'THE OWNER\'S REQUEST:', request,
  ].join('\n\n');
  return { system, user };
}

function parse(text) {
  const i = text.indexOf('{'), j = text.lastIndexOf('}');
  if (i < 0 || j < i) throw new Error('no JSON in the answer');
  const r = JSON.parse(text.slice(i, j + 1));
  return {
    kind: ['content', 'design', 'animation', 'mixed', 'none'].includes(r.kind) ? r.kind : 'mixed',
    summary: String(r.summary || '').slice(0, 300),
    changes: (Array.isArray(r.changes) ? r.changes : []).filter((c) => c && typeof c.path === 'string').slice(0, 200).map((c) => ({ path: c.path, value: c.value })),
    ops: (Array.isArray(r.ops) ? r.ops : []).filter((o) => o && typeof o.list === 'string' && (o.op === 'add' || o.op === 'remove')).slice(0, 20)
      .map((o) => ({ op: o.op, list: o.list, ...(Number.isInteger(o.index) ? { index: o.index } : {}) })),
    rename: typeof r.rename === 'string' && r.rename.trim() ? r.rename.replace(/\s+/g, ' ').trim().slice(0, 80) : null,
    cannot: (Array.isArray(r.cannot) ? r.cannot : []).map((x) => String(x).slice(0, 300)).filter(Boolean).slice(0, 6),
    question: typeof r.question === 'string' && r.question.trim() ? r.question.trim().slice(0, 300) : null,
  };
}

// The dry run: the plan applied to a copy through the editor (which refuses anything the design doesn't let the owner
// change) and the design's checker. diff = what the owner sees before saving.
function check(d, spec, content, p) {
  const errors = [];
  let next = content, changed = [];
  try { ({ content: next, changed } = editor.apply(d, spec, content, { changes: p.changes, ops: p.ops })); } catch (e) { return { errors: e.errors || [e.message], diff: [] }; }
  if (p.rename) {
    const pinned = Object.entries(spec.pinned || {}).filter(([, key]) => key === 'businessName').map(([path]) => path);
    for (const path of pinned) {
      const max = (d.schema.text[path] || [0, Infinity])[1];
      if ([...p.rename].length > max) errors.push(`rename: "${p.rename}" is longer than this design shows (${max} characters); use a shorter form`);
      else { const ks = path.split('.'), last = ks.pop(); const o = ks.reduce((a, k) => a[k], next); o[last] = p.rename; changed.push(path); }
    }
  }
  if (!errors.length && (changed.length || p.rename)) errors.push(...validate(d, next).errors);
  const approved = new Set(((content._reality && content._reality.confirmed) || []).map((c) => c.path));
  const diff = changed.map((path) => ({ path, label: label(path), before: at(content, path), after: at(next, path), approved: approved.has(path) }));
  return { errors, diff };
}

async function plan(d, spec, content, request, writer) {
  const req = String(request || '').replace(/\s+/g, ' ').trim().slice(0, MAX_REQUEST);
  if (!req) return { ok: false, message: 'Write what you want changed.' };
  writer.start(prompt(d, spec, content, req));
  let p = null, last = [];
  for (let n = 1; n <= 2; n++) {
    let text;
    try { text = await writer.next(); p = parse(text); } catch (e) { last = ['the answer was not valid JSON: ' + e.message]; p = null; }
    if (p) {
      const r = check(d, spec, content, p);
      if (!r.errors.length) return { ok: true, request: req, ...p, diff: r.diff };
      last = r.errors;
    }
    if (n < 2) writer.feedback(`That plan was rejected by the design's checker:\n${last.map((e) => '- ' + e).join('\n')}\n\nReturn the full corrected JSON plan. Keep what was fine; fix only these.`);
  }
  return { ok: false, message: 'That change would break the design’s rules, so nothing was changed. Try saying it another way, or make it in the fields below.', errors: last };
}

module.exports = { plan, check, prompt, parse, catalogue };
