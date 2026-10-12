'use strict';
// THE BUSINESS REALITY MODEL -- one structured description of a business that every generator can read, with where
// each fact came from (REALISM_ENGINE.md). Pure: no I/O, no model calls; safe for the browser bundle.
//
// A fact is { value, status, source, from?, confirmedBy?, at? }, keyed by a dotted path ("offerings.prices.case.0").
//   confirmed     supplied by the owner (source 'owner') or a trusted source (source 'research')
//   derived       calculated from other facts (from: [paths]; source 'derived')
//   proposed      a suggestion (source 'writer' | 'generator'); a commitment only once the owner confirms it
//   illustrative  invented for a business the owner said is a concept or demo
// The only way to "confirmed" from anything else is confirm(), which records who confirmed it. checkTransition() finds
// any other way (a silent promotion).
//
//   create({ kind: 'real' | 'concept', industry })   -> model
//   set(m, path, value, { status, source, from })     -> fact (throws on an impossible status/source)
//   get(m, path) / value(m, path)
//   propose(m, path, value, source)                   -> proposed for a real business, illustrative for a concept
//   confirm(m, paths, by, at)                         -> the facts confirmed by the owner (recorded)
//   checkTransition(before, after)                    -> [{ path, from, to }] silent promotions / rewritten facts
//   summary(m)                                        -> { kind, industry, counts, unconfirmed: [paths] }

const STATUS = ['confirmed', 'derived', 'proposed', 'illustrative'];
const SOURCES = { confirmed: ['owner', 'research'], derived: ['derived'], proposed: ['writer', 'generator', 'industry'], illustrative: ['writer', 'generator', 'industry'] };
const KINDS = ['real', 'concept'];

// The common foundation every industry shares (the industry module adds its own paths under the same three groups).
const FOUNDATION = {
  identity: ['name', 'industry', 'subcategory', 'location', 'audience', 'positioning', 'personality', 'tone', 'objective'],
  offerings: ['items', 'variants', 'features', 'materials', 'prices', 'pricing', 'availability', 'restrictions', 'purchase'],
  operations: ['serviceArea', 'workflow', 'delivery', 'payment', 'support', 'warranty', 'scheduling', 'limitations'],
};

function create({ kind = 'real', industry = null } = {}) {
  if (!KINDS.includes(kind)) throw new Error(`reality: kind must be ${KINDS.join(' or ')}`);
  return { v: 1, kind, industry: industry ? { id: industry.id, label: industry.label, sub: industry.sub || null } : null, facts: {} };
}

function set(m, path, value, { status, source, from } = {}) {
  if (!STATUS.includes(status)) throw new Error(`reality: unknown status "${status}" for ${path}`);
  if (!SOURCES[status].includes(source)) throw new Error(`reality: a ${status} fact cannot come from "${source}" (${path})`);
  if (status === 'illustrative' && m.kind !== 'concept') throw new Error(`reality: illustrative facts belong to a concept business only (${path})`);
  if (status === 'derived' && !(Array.isArray(from) && from.length)) throw new Error(`reality: a derived fact names what it was derived from (${path})`);
  const prev = m.facts[path];
  // a confirmed fact is never overwritten by a weaker one (a writer cannot replace what the owner said)
  if (prev && prev.status === 'confirmed' && status !== 'confirmed') return prev;
  const f = { value, status, source };
  if (from) f.from = from.slice();
  m.facts[path] = f;
  return f;
}
const get = (m, path) => m.facts[path] || null;
const value = (m, path) => (m.facts[path] ? m.facts[path].value : undefined);
// what a generator may add on its own: proposed (a real business) or illustrative (a concept)
const propose = (m, path, v, source = 'writer') => set(m, path, v, { status: m.kind === 'concept' ? 'illustrative' : 'proposed', source });

function confirm(m, paths, by, at = new Date().toISOString()) {
  if (!by) throw new Error('reality: confirm() needs who confirmed');
  const done = [];
  for (const p of paths) {
    const f = m.facts[p];
    if (!f || f.status === 'confirmed') continue;
    m.facts[p] = { value: f.value, status: 'confirmed', source: 'owner', confirmedBy: by, at, was: f.status };
    done.push(p);
  }
  return done;
}

// Facts that became confirmed without confirm(), and confirmed facts whose value changed without the owner.
function checkTransition(before, after) {
  const out = [];
  for (const [p, a] of Object.entries((after && after.facts) || {})) {
    const b = before && before.facts && before.facts[p];
    if (a.status === 'confirmed' && b && b.status !== 'confirmed' && !a.confirmedBy) out.push({ path: p, from: b.status, to: 'confirmed' });
    if (a.status === 'confirmed' && !b && a.source !== 'owner' && a.source !== 'research') out.push({ path: p, from: null, to: 'confirmed' });
    if (b && b.status === 'confirmed' && a.status === 'confirmed' && JSON.stringify(a.value) !== JSON.stringify(b.value) && !a.confirmedBy) out.push({ path: p, from: 'confirmed', to: 'changed' });
  }
  return out;
}

function summary(m) {
  const counts = Object.fromEntries(STATUS.map((s) => [s, 0]));
  for (const f of Object.values(m.facts)) counts[f.status]++;
  return { kind: m.kind, industry: m.industry, counts, unconfirmed: Object.entries(m.facts).filter(([, f]) => f.status === 'proposed').map(([p]) => p) };
}

module.exports = { STATUS, KINDS, FOUNDATION, create, set, get, value, propose, confirm, checkTransition, summary };
