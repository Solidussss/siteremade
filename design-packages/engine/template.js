// The template language every design package uses. Small on purpose: a template is the original design file with
// tags where content goes, so the tags must never clash with the design's own code.
//
//   {{path}}                 text from the content, HTML-escaped
//   {{path|filter|filter}}   filters, applied left to right (see FILTERS)
//   {{.}} {{.name}}          the current loop item / a field of it;  {{@index}} {{@n}} (0- and 1-based)
//   {{$.name}}               a value the design's hooks derived (prices, positions, ...)
//   {{F:#rrggbb}}            a colour of family F (declared in design.json), turned to the brand
//   {{@table:path}}          an entry of a design table, picked by the value at path (rendered as a template)
//   {{@table.field:path}}    one field of that entry
//   {{#each path join="..."}} ... {{/each}}
//   {{#if path}} ... {{else}} ... {{/if}}      {{#unless path}} ... {{/unless}}
//
// A tag never contains { or }, which keeps it apart from JavaScript like `${x}` in the design's code.
'use strict';

const FILTERS = {
  esc: (v) => String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'),
  attr: (v) => FILTERS.esc(v).replace(/"/g, '&quot;'),
  // (only "</script" can end the script block early, so only that is escaped; other HTML inside strings stays as is)
  js: (v) => "'" + String(v).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/<\/(script)/gi, '<\\/$1') + "'",
  // the inside of a '...' string that the template already has the quotes for
  jsq: (v) => FILTERS.js(v).slice(1, -1),
  jsd: (v) => '"' + String(v).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/<\/(script)/gi, '<\\/$1') + '"',
  tl: (v) => String(v).replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${'),
  num: (v) => { if (typeof v !== 'number' || !isFinite(v)) throw new Error('not a number: ' + v); return String(v); },
  raw: (v) => String(v),
  upper: (v) => String(v).toUpperCase(),
  lower: (v) => String(v).toLowerCase(),
  // *word* -> <em>word</em>, **word** -> <b>word</b>, after escaping. For content that needs emphasis.
  rich: (v) => FILTERS.esc(v).replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/\*([^*]+)\*/g, '<em>$1</em>'),
  // the same text with the markers removed (for aria labels, canvas text)
  plain: (v) => String(v).replace(/\*\*([^*]+)\*\*/g, '$1').replace(/\*([^*]+)\*/g, '$1'),
};
const ESCAPING = new Set(['esc', 'attr', 'js', 'jsq', 'jsd', 'tl', 'num', 'raw', 'rich']);

function parse(src) {
  const re = /\{\{([^{}]+)\}\}/g;
  const root = { kind: 'root', body: [] };
  const stack = [root];
  let last = 0, m;
  const top = () => stack[stack.length - 1];
  const add = (n) => { const t = top(); (t.inAlt ? t.alt : t.body).push(n); };
  while ((m = re.exec(src))) {
    if (m.index > last) add({ kind: 'text', text: src.slice(last, m.index) });
    last = re.lastIndex;
    const tag = m[1].trim();
    let b;
    if ((b = /^#each\s+(\S+)(?:\s+join="((?:[^"\\]|\\.)*)")?$/.exec(tag))) {
      const node = { kind: 'each', path: b[1], join: b[2] ? JSON.parse('"' + b[2] + '"') : '', body: [] };
      add(node); stack.push(node);
    } else if ((b = /^#(if|unless)\s+(\S+)$/.exec(tag))) {
      const node = { kind: b[1], path: b[2], body: [], alt: null };
      add(node); stack.push(node);
    } else if (tag === 'else') {
      const n = top(); if (n.kind !== 'if' && n.kind !== 'unless') throw new Error('{{else}} outside #if');
      n.alt = []; n.inAlt = true;
    } else if ((b = /^\/(each|if|unless)$/.exec(tag))) {
      const n = stack.pop(); delete n.inAlt; if (n.kind !== b[1]) throw new Error(`{{/${b[1]}}} closes {{#${n.kind}}}`);
    } else {
      add({ kind: 'tag', tag });
    }
  }
  if (last < src.length) add({ kind: 'text', text: src.slice(last) });
  if (stack.length !== 1) throw new Error('unclosed {{#' + top().kind + '}}');
  return root;
}
function resolve(path, scope) {
  const { content, derived, item, index } = scope;
  if (path === '.') return item;
  if (path === '@index') return index;
  if (path === '@n') return index + 1;
  let base, rest;
  if (path.startsWith('.')) { base = item; rest = path.slice(1); }
  else if (path.startsWith('$.')) { base = derived; rest = path.slice(2); }
  else { base = content; rest = path; }
  return rest.split('.').reduce((v, k) => (v == null ? undefined : v[k]), base);
}

function render(src, ctx, scope) {
  const tree = typeof src === 'string' ? parse(src) : src;
  return renderNodes(tree.body, ctx, scope || { content: ctx.content, derived: ctx.derived, item: undefined, index: 0 });
}
function renderNodes(nodes, ctx, scope) {
  let out = '';
  for (const n of nodes) {
    if (n.kind === 'text') out += n.text;
    else if (n.kind === 'each') {
      const list = resolve(n.path, scope);
      if (!Array.isArray(list)) throw new Error(`{{#each ${n.path}}}: not a list`);
      out += list.map((item, index) => renderNodes(n.body, ctx, { ...scope, item, index })).join(n.join);
    } else if (n.kind === 'if' || n.kind === 'unless') {
      let v = resolve(n.path, scope); if (Array.isArray(v)) v = v.length > 0;
      const yes = n.kind === 'if' ? !!v : !v;
      out += renderNodes(yes ? n.body : n.alt || [], ctx, scope);
    } else out += renderTag(n.tag, ctx, scope);
  }
  return out;
}
function renderTag(tag, ctx, scope) {
  // colour family
  const fm = /^([A-Z][A-Za-z]*):(.+)$/.exec(tag);
  if (fm && ctx.families[fm[1]]) return ctx.families[fm[1]](fm[2]);
  // design table
  const tm = /^@([\w-]+)(?:\.([\w-]+))?:(.+)$/.exec(tag);
  if (tm) {
    const table = ctx.tables[tm[1]]; if (!table) throw new Error('no table ' + tm[1]);
    const key = resolve(tm[3], scope);
    let v = table[key]; if (v === undefined) throw new Error(`table ${tm[1]} has no entry "${key}"`);
    if (tm[2]) v = v[tm[2]];
    return render(String(v), ctx, scope);
  }
  const [path, ...filters] = tag.split('|').map((s) => s.trim());
  let v = resolve(path, scope);
  if (v === undefined || v === null) throw new Error(`no value for {{${tag}}}`);
  if (!filters.some((f) => ESCAPING.has(f))) filters.push(typeof v === 'number' ? 'num' : 'esc');
  for (const f of filters) { if (!FILTERS[f]) throw new Error('unknown filter ' + f); v = FILTERS[f](v); }
  return v;
}

module.exports = { render, parse, FILTERS };
