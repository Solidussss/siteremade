'use strict';
// THE REALISM ENGINE (REALISM_ENGINE.md): the Business Reality Model, its industry modules, and the checks every
// generator can run where business data becomes a page. Pure; no I/O, no model calls.
//
//   fromBrief({ kind, fields, brief })        -> model: the owner's words as confirmed facts, industry detected, derived
//                                                facts computed (a 42 h reserve from 30 turns -> 1.4 h a turn)
//   audit(model, entries, { assumed })        -> items: every claim in the page's words with its status and whether it
//                                                is material ([{ path, kind, text, status, material, flagged }])
//   publishCheck(model, items, { html })      -> { ok, blocking }: a real business may not publish material claims the
//                                                owner has not confirmed; a concept must say it is a demonstration
//   confirmClaims(model, items, by)           -> the owner confirms claims (recorded, never silent)
//   writerBrief(model)                        -> the lines a writer is given about this business
//   fromGrounding(grounding) / fromCreative(plan)   adapters for the Business and Creative generators (read only)
const M = require('./model');
const IND = require('./industries');
const X = require('./extract');

const lower = (s) => String(s || '').toLowerCase();

// facts an industry can read straight from the owner's words
const READERS = {
  watch: [
    ['offerings.specs.powerReserve', /(\d+)[- ]?(?:h|hours?)\b[^.]{0,12}power reserve|power reserve(?: of)?[^.\d]{0,12}(\d+)/i, (m) => +(m[1] || m[2])],
    ['offerings.specs.crownTurns', /(\d+)\s+(?:crown\s+)?turns\b/i, (m) => +m[1]],
    ['offerings.specs.frequencyHz', /(\d+(?:\.\d+)?)\s?Hz\b/i, (m) => +m[1]],
    ['offerings.complications.secondTimeZone', /\b(no (?:second time ?zone|gmt|dual[- ]time))\b|\b(gmt|second time ?zone|dual[- ]time)\b/i, (m) => !m[1]],
  ],
  fitness: [['operations.capacity', /(?:classes? (?:of|up to|capped at|limited to)|capacity(?: of)?|max(?:imum)? of)\s*(\d+)/i, (m) => +m[1]]],
};

function fromBrief({ kind = 'real', fields = [], brief = {} } = {}) {
  const text = fields.map((f) => brief[f.key]).concat(brief._answers ? [brief._answers.text] : []).filter(Boolean).join('\n');
  const mod = IND.detect(text);
  const m = M.create({ kind: kind === 'concept' ? 'concept' : 'real', industry: mod });
  const own = (p, v) => M.set(m, p, v, { status: 'confirmed', source: 'owner' });
  if (brief.businessName) own('identity.name', String(brief.businessName).trim());
  for (const f of fields) { const v = String(brief[f.key] || '').trim(); if (v && f.key !== 'businessName' && f.key !== 'businessKind') own(`brief.${f.key}`, v); }
  if (brief._answers && brief._answers.text) own('brief.answers', String(brief._answers.text));
  own('identity.industry', mod.label);
  // every price the owner wrote, with its words around it
  let i = 0;
  for (const c of X.claimsIn(text, mod)) if (c.kind === 'price') own(`offerings.prices.${i++}`, c.match);
  for (const [p, re, read] of READERS[mod.id] || []) { const r = re.exec(text); if (r) own(p, read(r)); }
  for (const [k, v] of Object.entries(mod.general || {})) M.set(m, `general.${k}`, v, { status: 'confirmed', source: 'research' });
  mod.derive(m, M);
  m.ownerText = text; // (kept for matching claims to what the owner actually said; not a fact)
  return m;
}

// numbers the model can stand behind, by status
function numberSets(m) {
  const known = new Set(X.numbersIn(m.ownerText || '').flat()), derived = new Set(), confirmedClaims = new Map();
  for (const [p, f] of Object.entries(m.facts)) {
    // an owner's confirmation covers that one claim in that one place (page.<path>|<text>), nothing else on the page
    if (p.startsWith('page.')) { if (f.status === 'confirmed') confirmedClaims.set(p.slice(5), f); continue; }
    const vals = Array.isArray(f.value) ? f.value : [f.value];
    for (const v of vals) for (const alts of X.numbersIn(String(v))) for (const n of alts) {
      if (f.status === 'confirmed') known.add(n); else if (f.status === 'derived') derived.add(n);
    }
  }
  return { known, derived, confirmedClaims };
}
const claimKey = (p, text) => `${p}|${text}`;

const MATERIAL = (mod) => new Set(IND.UNIVERSAL_MATERIAL.concat(mod.material || []));

// entries: [{ path, text }] (the page's words, one per field) and [{ path, value: number }] (bare numbers at fact paths)
function audit(m, entries, { assumed = [] } = {}) {
  const mod = IND.byId(m.industry && m.industry.id), material = MATERIAL(mod);
  const { known, derived, confirmedClaims } = numberSets(m);
  const owner = lower(m.ownerText);
  const flaggedPaths = new Set(assumed.map((p) => String(p).replace(/\[(\d+|\*)\]/g, '.$1')));
  const flagged = (p) => [...flaggedPaths].some((a) => p === a || p.startsWith(a + '.') || a.startsWith(p + '.'));
  const items = [], seen = new Set();
  for (const e of entries) {
    const claims = e.text != null ? X.claimsIn(e.text, mod) : [];
    const hint = X.kindOfPath(e.path);
    if (e.value != null && hint && typeof e.value === 'number') claims.push({ kind: hint, match: String(e.value), bare: true });
    for (const c of claims) {
      const key = e.path + '|' + c.kind + '|' + c.match; if (seen.has(key)) continue; seen.add(key);
      const nums = X.numbersIn(c.match);
      let status;
      if (confirmedClaims.has(claimKey(e.path, c.match))) status = 'confirmed';
      else if (nums.length) status = nums.every((alts) => alts.some((n) => known.has(n))) ? 'confirmed' : nums.every((alts) => alts.some((n) => known.has(n) || derived.has(n))) ? 'derived' : null;
      else status = owner.includes(lower(c.match)) ? 'confirmed' : null;
      // a zero price is "included", not a claim about money
      if (c.kind === 'price' && c.bare && Number(c.match) === 0) continue;
      const wasFlagged = flagged(e.path);
      if (!status) status = m.kind === 'concept' ? 'illustrative' : 'proposed';
      items.push({ path: e.path, kind: c.kind, text: c.match, status, material: material.has(c.kind), flagged: status === 'confirmed' || status === 'derived' ? undefined : wasFlagged });
    }
  }
  return items;
}

const NOTICE = /\b(made[- ]up|concept|fictional|demonstration|demo (?:site|business|brand|page)|not a real)\b/i;
function visibleText(html) { return String(html || '').replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/gi, ' '); }

function publishCheck(m, items, { html } = {}) {
  const blocking = [];
  if (m.kind === 'real') {
    for (const it of items) if (it.material && it.status === 'proposed') blocking.push({ path: it.path, kind: it.kind, text: it.text, why: 'not confirmed by the owner' });
  } else if (html != null && !NOTICE.test(visibleText(html))) {
    blocking.push({ path: 'footer', kind: 'notice', text: '', why: 'a concept business must say on the page that it is a demonstration' });
  }
  return { ok: !blocking.length, blocking };
}

// The owner says these claims are true: each becomes a confirmed page fact with who confirmed it and when.
function confirmClaims(m, items, by, at = new Date().toISOString()) {
  const paths = [];
  for (const it of items) { const p = 'page.' + claimKey(it.path, it.text); if (!m.facts[p]) M.set(m, p, it.text, { status: 'proposed', source: 'generator' }); paths.push(p); }
  return M.confirm(m, paths, by, at);
}

// What a writer is told about the business: who it is, what is confirmed, what it may only propose.
function writerBrief(m) {
  const mod = IND.byId(m.industry && m.industry.id);
  const mat = [...MATERIAL(mod)].join(', ');
  const L = [];
  L.push(`Industry: ${mod.label}.`);
  if (m.kind === 'real') {
    L.push('This is a REAL business. Material claims -- ' + mat + ' -- appear only as the brief states them. Where the design needs one the brief does not give, prefer wording without the claim; if the design must show a value, use a modest one and list its path in "_assumed": it is shown to the owner as PROPOSED and cannot be published until the owner confirms it.');
    L.push('No reviews, ratings, testimonials, customer counts, awards, certifications, guarantees, founding years or addresses unless the brief gives them. footer.fine is ordinary fine print for this business (never "made-up" or "concept").');
  } else {
    L.push('This is a CONCEPT business (a demonstration). Invented details may fill gaps; keep them consistent with each other everywhere they appear, list them in "_assumed" (they are ILLUSTRATIVE), and never present them as verified: no awards, certifications, ratings, reviews, press or customer counts. footer.fine must say plainly that the business is made up for a concept site.');
  }
  L.push('Must look and read the same in every view: ' + mod.consistent.join('; ') + '.');
  if (mod.imagery.avoid.length) L.push('Never substitute: ' + mod.imagery.avoid.join('; ') + '.');
  const facts = Object.entries(m.facts).filter(([p, f]) => !p.startsWith('brief.') && !p.startsWith('page.') && !p.startsWith('general.') && p !== 'identity.industry' && (f.status === 'confirmed' || f.status === 'derived'));
  if (facts.length) L.push('Facts already established: ' + facts.map(([p, f]) => `${p} = ${JSON.stringify(f.value)} (${f.status}${f.from ? ' from ' + f.from.join(' + ') : ''})`).join('; ') + '.');
  return L;
}

// ---- adapters (read only: they describe what a generator already decided, in the model's terms) ----------------------
// Business generator: BUSINESS_GROUNDING (lib/premium/grounding.js deriveGrounding)
function fromGrounding(g) {
  const v = g.verifiedFacts || {}, text = String(v.description || '');
  const m = M.create({ kind: 'real', industry: IND.detect(text + ' ' + (g.businessType || '')) });
  const own = (p, x) => M.set(m, p, x, { status: 'confirmed', source: 'owner' });
  if (text) own('brief.description', text);
  if (v.location || g.location) own('identity.location', v.location || g.location);
  if (g.primaryOffer) own('offerings.items', g.primaryOffer); // (the owner's own first sentence)
  m.unsupported = (g.unsupportedFacts || []).slice(); // what the Business generator already refuses to invent
  m.ownerText = text;
  return m;
}
// Creative generator: researched facts ([{ id, text }], sourced from the encyclopedia) and the owner's supplied lines;
// imagined words make no claim
function fromCreative({ facts = [], supplied = [], subject = '' } = {}) {
  const m = M.create({ kind: 'real', industry: IND.detect([subject].concat(supplied).join(' ')) });
  facts.forEach((f, i) => M.set(m, `research.${f.id || i}`, f.text, { status: 'confirmed', source: 'research' }));
  supplied.forEach((t, i) => M.set(m, `brief.supplied.${i}`, t, { status: 'confirmed', source: 'owner' }));
  m.ownerText = facts.map((f) => f.text).concat(supplied).join('\n');
  return m;
}

module.exports = { fromBrief, audit, publishCheck, confirmClaims, writerBrief, fromGrounding, fromCreative, model: M, industries: IND, extract: X };
