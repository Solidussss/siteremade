'use strict';
// HERO COPY -- the business's name and its opening words, read from what the
// owner actually wrote.
//
//   extractName(text)     the name the owner gave ("Harbour Knots teaches...",
//                         "We are Stem Studio, a florist...", "...called X",
//                         "Citrine Soda Co. makes..."). Never a service ("Residential
//                         Cleaning offers..."), a place, or a sentence fragment.
//   readBusiness(text, name)   what it IS (identity: "a florist") and what it DOES
//                         (clauses: verb + objects + where/how: "teaches | sailing
//                         lessons | from the marina").
//   heroCopyFor(ctx)      a headline, kicker and sub built only from those words --
//                         several sentence shapes, chosen per business, so two
//                         businesses never share one pattern -- or null when the
//                         description gives nothing to build on.
//   headlineProblem(h, ctx)  why a (planner-written) headline should not ship:
//                         generic (a category word + stock phrase, or nothing from
//                         the owner's words) or a claim the owner never made.
// Pure and deterministic (no I/O, no randomness): the live preview (premium-core.js
// bundle) and the export read the same stored copy.

const cap = s => { s = String(s || ''); return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; };
const clean = s => String(s || '').replace(/\s+/g, ' ').trim();
function listPhrase(a) { const x = (a || []).filter(Boolean); if (x.length <= 1) return x[0] || ''; return `${x.slice(0, -1).join(', ')} and ${x[x.length - 1]}`; }
function hash(s) { let h = 2166136261; const t = String(s || ''); for (let i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

// ---- the name ------------------------------------------------------------------------------------------------------
// a capitalised word (internal capitals, apostrophes, "&", and an abbreviation's full stop: "Co.", "St.")
const CAPWORD = "(?:[A-Z][A-Za-z0-9'’-]*\\.?|&)";
const CONNECT = "(?:&|and|of|the|de|du|la|le|on|by|n'|'n')";
const NAME = `${CAPWORD}(?:\\s+(?:${CONNECT}\\s+)?${CAPWORD}){0,4}`;
const PRONOUN_START = new Set(['we', 'i', 'our', 'my', 'this', 'it', 'they', 'a', 'an', 'the', 'hi', 'hello', 'looking', 'need', 'please', 'website', 'site', 'welcome', 'at', 'in', 'for', 'with', 'from', 'on', 'every', 'each', 'all', 'some', 'most', 'best', 'top', 'local', 'your']);
// words that on their own only name a kind of work, a quality or a place -- a "name" made only of these is a description
const GENERIC = new Set(('residential commercial professional local family mobile emergency affordable premium luxury custom quality expert certified licensed small independent boutique online modern ' +
  'cleaning roofing plumbing landscaping landscape painting lawn care services service company business studio shop store agency firm group solutions home homes house garden gardens ' +
  'electrical electric heating cooling hvac repair repairs renovation renovations construction contracting contractor contractors builders building design designs marketing consulting ' +
  'dog dogs pet pets walking sitting grooming training fitness yoga pilates massage therapy wellness health dental clinic beauty hair nails salon barber spa cafe coffee bakery ' +
  'restaurant food catering wedding weddings photography photographer events event flowers florist sailing boat boats fishing charter charters tours tour travel auto car cars detailing ' +
  'mechanic tutoring tutors tutor lessons classes school academy software app apps platform tech technology digital web website websites data ai the and of').split(' '));
const ABBREV_END = /\b(?:Co|Inc|Ltd|Corp|LLC|St|Bros)\.$/;
// a lowercase word right after the name that makes it the subject of a sentence
const NOT_VERBS = new Set(['across', 'as', 'plus', 'its', 'this', 'his', 'hers', 'was', 'gas', 'bus', 'less', 'various', 'famous', 'previous', 'serious', 'thus', 'yes', 'business', 'fitness', 'wellness', 'glass', 'grass', 'class', 'dress', 'press', 'always', 'perhaps', 'towards', 'sometimes', 'news', 'services', 'goods', 'products', 'solutions']);
function looksLikeVerb(w) { const x = String(w || '').toLowerCase(); if (/^(is|are|was|were|has|have|does|do|offers?|makes?|runs?)$/.test(x)) return true; return x.length >= 4 && /[a-z](?:s|es)$/.test(x) && !/ss$/.test(x) && !NOT_VERBS.has(x); }
function tidyName(n) { let s = clean(n).replace(/[,;:]+$/, ''); if (/\.$/.test(s) && !ABBREV_END.test(s)) s = s.replace(/\.+$/, ''); return s; }
function acceptable(name, text) {
  const words = name.split(/\s+/).map(w => w.toLowerCase().replace(/[^a-z0-9&']/g, '')).filter(Boolean);
  if (!words.length || words.length > 6) return false;
  if (PRONOUN_START.has(words[0]) && !(words[0] === 'the' && words.length > 1)) return false;
  if (words.every(w => GENERIC.has(w) || w === '&')) return false; // "Residential Cleaning", "Dog Walking"
  const place = /\bin\s+([A-Z][a-zA-Z'.-]+(?:\s[A-Z][a-zA-Z'.-]+){0,2})/.exec(text || '');
  if (place && place[1].replace(/[.,]+$/, '') === name) return false; // a place is not a name
  return true;
}
function extractName(text) {
  const t = clean(text); if (!t) return '';
  const tries = [
    new RegExp(`\\b(?:called|named)\\s+(${NAME})`),
    new RegExp(`^(?:we are|we're|this is|welcome to|hi,? we're|hello,? we're)\\s+(${NAME})(?=\\s*(?:,|\\.|\\s+and\\b|\\s+[-–—]\\s|$))`, 'i'),
    new RegExp(`^at\\s+(${NAME}),\\s+(?:we|our)\\b`, 'i'),
    new RegExp(`^((?:The\\s+)?${NAME})(?=\\s*,\\s*(?:a|an|the|we|our)\\b|\\s+\\(|\\s+[-–—]\\s)`),
    new RegExp(`^((?:The\\s+)?${NAME})\\s+([a-z][a-z-]+)\\b`),
  ];
  for (let i = 0; i < tries.length; i++) {
    const m = tries[i].exec(t); if (!m) continue;
    if (i === 4 && (!looksLikeVerb(m[2]) || /^(?:is|are)\s+(?:where|home|a (?:city|town|place)|the (?:city|town|place)|located)\b/i.test(t.slice(m.index + m[1].length).trim()))) continue;
    let name = tidyName(m[1]);
    // "We are Stem Studio" captures the name only when it is capitalised ("we are a roofing company" is not a name)
    if (i === 1 && !/^[A-Z]/.test(name)) continue;
    if (acceptable(name, t)) return name;
  }
  return '';
}

// ---- what it is and what it does ------------------------------------------------------------------------------------
const IRREGULAR = { build: 'built', rebuild: 'rebuilt', make: 'made', sell: 'sold', teach: 'taught', run: 'run', grow: 'grown', lead: 'led', mow: 'mown', do: 'done', sew: 'sewn', hold: 'held', bring: 'brought', feed: 'fed', keep: 'kept', find: 'found', buy: 'bought', cut: 'cut', shoot: 'shot', sit: 'sat', write: 'written', draw: 'drawn', give: 'given', take: 'taken', fit: 'fitted', ship: 'shipped', plan: 'planned', knit: 'knitted', lay: 'laid', weave: 'woven', throw: 'thrown', drive: 'driven', dig: 'dug', spin: 'spun', stop: 'stopped', wrap: 'wrapped', prep: 'prepped', map: 'mapped' };
// verbs whose participle makes a poor headline ("offered", "done", "helped")
const NO_PARTICIPLE = new Set(['offer', 'provide', 'do', 'help', 'keep', 'focus', 'specialise', 'specialize', 'have', 'run', 'care', 'bring', 'support', 'work', 'love', 'aim', 'want', 'try', 'get', 'go', 'come', 'let', 'use', 'include', 'feature', 'give', 'take', 'find', 'sit', 'hold', 'lead', 'make sure']);
const NOUN_ING = new Set(['wedding', 'weddings', 'clothing', 'lighting', 'catering', 'flooring', 'landscaping', 'roofing', 'plumbing', 'painting', 'cleaning', 'bedding', 'planning', 'consulting', 'accounting', 'marketing', 'printing', 'framing', 'coaching', 'training', 'tutoring', 'fishing', 'sailing', 'camping', 'housekeeping', 'bookkeeping', 'engineering', 'packaging', 'branding', 'detailing', 'recording', 'hosting', 'dog walking', 'walking', 'sitting', 'grooming', 'boxing', 'sparring', 'decking', 'fencing', 'siding', 'paving', 'tiling', 'heating', 'cooling', 'dining', 'baking', 'brewing', 'roasting', 'banking', 'lending', 'moving', 'storage', 'shipping', 'sewing', 'knitting', 'building', 'buildings', 'cycling', 'climbing', 'swimming', 'skating', 'surfing', 'diving', 'kayaking', 'paddling', 'hiking', 'running', 'rowing', 'riding', 'dancing', 'singing', 'drawing', 'pottery', 'morning', 'evening', 'spring', 'string', 'ceiling', 'awning', 'awnings', 'railing', 'seating', 'ring', 'rings', 'thing', 'things', 'king', 'wing', 'wings', 'something', 'everything', 'nothing', 'anything']);
function baseOf(w) {
  const x = w.toLowerCase();
  if (/ing$/.test(x)) {
    // "delivering" -> deliver, "making" -> make, "running" -> run: the known verb wins, else the bare stem
    const s = x.slice(0, -3); const und = s.length > 2 && s[s.length - 1] === s[s.length - 2] && !/(ll|ss|ff|zz)$/.test(s) ? s.slice(0, -1) : s;
    for (const cnd of [s, und, s + 'e', und + 'e']) if (COMMON_VERBS.test(cnd)) return cnd;
    return s;
  }
  if (/ies$/.test(x)) return x.slice(0, -3) + 'y';
  if (/(ch|sh|x|ss|zz|o)es$/.test(x)) return x.slice(0, -2);
  if (/s$/.test(x) && !/ss$/.test(x)) return x.slice(0, -1);
  return x;
}
function participle(base) {
  if (!base || NO_PARTICIPLE.has(base)) return '';
  if (IRREGULAR[base]) return IRREGULAR[base];
  if (/e$/.test(base)) return base + 'd';
  if (/[^aeiou]y$/.test(base)) return base.slice(0, -1) + 'ied';
  return base + 'ed';
}
function gerund(base) {
  if (!base) return '';
  if (/ie$/.test(base)) return base.slice(0, -2) + 'ying';
  if (/[^aeiou]e$/.test(base) && base !== 'be') return base.slice(0, -1) + 'ing';
  if (/^(?:run|plan|shop|ship|stop|wrap|map|prep|dig|spin|sit|cut|set|get|put|swim|knit|fit|tan|trim|chop|mop|jog|drop)$/.test(base)) return base + base.slice(-1) + 'ing';
  return base + 'ing';
}
// words a clause's object stops at: where / how / for whom, or a describing participle ("hot honey | infused with habanero")
const TAIL_WORD = /^(?:from|in|across|for|to|at|on|around|by|near|throughout|with|within|along|over|inside|outside|since|using|out|all|based|made|sold|built|grown|brewed|roasted|baked|infused|blended|delivered|designed|handmade|hand-made|crafted|sourced|printed|packed|shipped|served|run)$/;
const PEOPLE = /\b(?:teams?|families|family|clients?|customers?|homeowners?|businesses|kids|children|students?|patients?|owners?|people|members?|companies|brands?|manufacturers?|organisations?|organizations?|startups?|founders?|couples?|parents?|seniors?|adults?|athletes?|runners?|guests?|travell?ers?)$/;
const PLACE_TAIL = /^(?:in|across|around|from|throughout|on|at|near)\s+(?:the\s+)?[A-Z]/;
function singular(w) { return /ies$/.test(w) ? w.slice(0, -3) + 'y' : /(?:ch|sh|x|ss)es$/.test(w) ? w.slice(0, -2) : /s$/.test(w) && !/ss$/.test(w) ? w.slice(0, -1) : w; }
const COMMON_VERBS = /^(?:alert|notify|remind|send|invoice|bill|report|sync|connect|integrate|teach|run|rent|hire|build|rebuild|make|sell|deliver|repair|replace|paint|fix|install|clean|design|create|bake|brew|roast|serve|print|grow|walk|treat|train|coach|photograph|handle|host|guide|plan|cook|cater|restore|maintain|detail|tailor|alter|mow|craft|import|ship|stock|frame|tune|groom|offer|provide|do|help|keep|collect|distribute|renovate|remodel|upgrade|inspect|lay|pour|edge|aerate|trim|prune|plant|haul|move|store|wash|polish|coat|protect|ferment|bottle|blend|mix|sew|knit|weave|dye|glaze|carve|forge|weld|sharpen|upholster|refinish|arrange|style|cut|colour|color|shape|manage|prepare|advise|represent|insure|lend|buy|lease|list|develop|support|monitor|automate|schedule|track|audit|tutor|mentor|lead|organise|organize|raise|feed|rescue|shelter|foster|clear|remove|tow|fit|supply|source|press|bind|engrave|embroider|hand-pour|pack|smoke|cure|pickle|preserve|roll|fold|bring|play|record|master|film|shoot|edit|write|draw|illustrate|translate|transcribe|fund|donate|care|visit|take|drive|fly|sail|paddle|climb|explore|book|stage|throw|launch|specialise|specialize|focus|sit)$/;
function verbForm(w) {
  const x = String(w || '').toLowerCase().replace(/[^a-z-]/g, '');
  if (!x || NOUN_ING.has(x)) return null;
  if (/ing$/.test(x)) return COMMON_VERBS.test(baseOf(x)) ? 'gerund' : null;
  if (/s$/.test(x) && x.length >= 4 && !NOT_VERBS.has(x) && COMMON_VERBS.test(baseOf(x))) return 'third';
  if (COMMON_VERBS.test(x)) return 'base';
  return null;
}
// "teaches sailing lessons and runs sunset cruises" -> two clauses; "patios, retaining walls and planting beds" stays one
// (a new clause starts only at a verb of the same form as the first, right after "and" or a comma)
function splitClauses(s, form) {
  const words = s.split(/\s+/); const out = []; let cur = [];
  for (let i = 0; i < words.length; i++) {
    const w = words[i]; const prev = words[i - 1] || '';
    const joins = prev === 'and' || /,$/.test(prev);
    if (i > 0 && cur.length > 2 && joins && verbForm(w) === form && !(prev === 'and' && cur.length === 2)) { if (prev === 'and') cur.pop(); out.push(cur.join(' ').replace(/,$/, '')); cur = []; }
    cur.push(w);
  }
  if (cur.length) out.push(cur.join(' '));
  return out.filter(Boolean);
}
function clauseParts(c) {
  let words = c.split(/\s+/); const verbs = [words[0]];
  // "replaces and repairs shingle roofs", "collecting and distributing groceries": one object, two verbs
  if (words[1] === 'and' && words[2] && verbForm(words[2])) { verbs.push(words[2]); words = [words[0]].concat(words.slice(3)); }
  const rest = words.slice(1); let cut = rest.length;
  for (let i = 1; i < rest.length; i++) if (TAIL_WORD.test(rest[i].toLowerCase().replace(/[^a-z-]/g, ''))) { cut = i; break; }
  if (rest[0] && /^(?:with|for|to)$/i.test(rest[0])) cut = 0;
  const object = clean(rest.slice(0, cut).join(' ')).replace(/[,.]+$/, ''); let tail = clean(rest.slice(cut).join(' ')).replace(/[,.]+$/, '');
  if (/,/.test(tail) && !/\band\b/.test(tail.split(',').slice(1).join(','))) tail = tail.split(',')[0]; // "infused with habanero, sold at markets" -> the first phrase
  const bases = verbs.map(baseOf); const parts = bases.map(participle);
  const items = object.split(/\s*,\s*|\s+and\s+|\s+or\s+/).map(x => x.replace(/^(?:a|an|the|their|your|our)\s+/i, '').trim()).filter(Boolean);
  return { verb: verbs[0].toLowerCase(), base: bases[0], bases, part: parts.every(Boolean) ? parts.join(' and ') : '', object, items, tail, people: items.length > 0 && items.every(x => PEOPLE.test(x)) };
}
const IDENTITY_STOP = /^(?:in|for|with|based|that|who|which|across|serving|from|on|at|near|around|since|run|where|whose|to|by)$/i;
// the city the text is in: "in Portland. Single-origin..." is Portland (a full stop ends it unless it is an abbreviation)
function placeIn(t) {
  const m = /\bin\s+([A-Z][a-zA-Z'.-]+(?:\s[A-Z][a-zA-Z'.-]+){0,2})/.exec(t); if (!m) return '';
  const kept = []; for (const w of m[1].split(/\s+/)) { kept.push(w); if (/\.$/.test(w) && w.length > 4) break; }
  return kept.join(' ').replace(/[.,]+$/, '');
}
function sentencesOf(t) {
  const out = []; const re = /[.!?](?=\s+[A-Z0-9])/g; let s = 0, m;
  while ((m = re.exec(t))) { const before = t.slice(Math.max(0, m.index - 5), m.index + 1); if (ABBREV_END.test(before) || /\b[A-Z]\.$/.test(before)) continue; out.push(t.slice(s, m.index + 1)); s = m.index + 1; }
  out.push(t.slice(s)); return out.map(clean).filter(Boolean);
}
// "Petal & Post is a florist delivering bouquets..." -> identity "florist", clauses [delivering | bouquets, wedding flowers | across Bristol]
function readBusiness(text, name) {
  const t = clean(text); const sentences = sentencesOf(t);
  const first = (sentences[0] || '').replace(/[.!?]+$/, '');
  let rest = first; let named = false;
  if (name) { const i = first.toLowerCase().indexOf(name.toLowerCase()); if (i >= 0) { rest = first.slice(i + name.length); named = true; } }
  // "We are Stem Studio, a wedding florist ...": what follows the name's comma is what it is
  const appositive = /^[,:;–—-]/.test(clean(rest));
  rest = clean(rest).replace(/^[,:;–—-]+\s*/, '');
  // first person: "I walk dogs", "...called Northfield Tutors and we help kids"
  let form = null;
  const fp = /(?:^|\band\s+|,\s*)(?:we|i)\s+(?:also\s+)?(.*)$/i.exec(named ? rest : first);
  if (fp && (!named || /^(?:and\s+)?(?:we|i)\b|^,/i.test(rest))) { if (/^(?:are|'re|am)\s/i.test(fp[1])) rest = fp[1].replace(/^(?:are|'re|am)\s+/i, 'is '); else { rest = fp[1]; form = 'base'; } }
  let identity = '', article = '', audience = '', lead = '';
  const idm = /^(?:is|are|'s)\s+(?:(a|an|the)\s+)?(.*)$/i.exec(rest) || (appositive ? /^(a|an|the)\s+(.*)$/i.exec(rest) : null);
  if (!form && idm) {
    article = (idm[1] || '').toLowerCase(); const words = idm[2].split(/\s+/); const idw = [];
    for (let i = 0; i < words.length; i++) {
      const bare = words[i].replace(/[,;:]+$/, '');
      if (idw.length && (IDENTITY_STOP.test(bare) || verbForm(bare) === 'gerund')) break;
      idw.push(bare); if (/[,;:]$/.test(words[i])) break;
    }
    identity = idw.join(' '); rest = clean(words.slice(idw.length).join(' ')).replace(/^[,;:]\s*/, '');
    const aud = /^for\s+(.+?)(?=\s+(?:with|in|across|that|who|to)\b|[,:;]|$)/.exec(rest); if (aud) audience = aud[1];
  }
  // the verb phrases: after the identity (a gerund: "delivering ..."), after the name ("teaches ..."), or after "we"/"I".
  // A verb opens the phrase or follows a joining word -- "online booking" and "uptime monitoring" are things, not actions.
  const words = rest.split(/\s+/).filter(Boolean);
  // ("in Ottawa making sourdough..." -- after a place name a gerund is still the action)
  const vi = words.findIndex((w, i) => { const f = verbForm(w); if (!f || (form && f !== form)) return false; const raw = words[i - 1] || ''; const prev = raw.toLowerCase(); return i === 0 || f !== 'gerund' || /[,:;]$/.test(prev) || /^[A-Z]/.test(raw) || /^(?:and|with|for|by|to|in|also|then)$/.test(prev); });
  let clauses = [];
  if (vi >= 0) {
    lead = words.slice(0, vi).join(' ');
    const f = form || verbForm(words[vi]);
    clauses = splitClauses(words.slice(vi).join(' '), f).map(clauseParts).filter(c => c.items.length || c.tail);
  } else {
    // "a cocktail bar in Chicago with seasonal cocktails, natural wine and late-night snacks",
    // "software for engineering teams: uptime monitoring, alerting and logs for APIs"
    const w = /(?:\bwith|:)\s+([^.;]+)$/.exec(rest);
    if (w) {
      const idx = w[1].search(/\s+(?=for\s|in\s[A-Z]|across\s|from\s)/); const list = idx >= 0 ? w[1].slice(0, idx) : w[1]; const tail = idx >= 0 ? clean(w[1].slice(idx)) : (audience ? `for ${audience}` : '');
      const items = list.split(/\s*,\s*|\s+and\s+/).map(x => x.replace(/^(?:a|an|the)\s+/i, '').trim()).filter(Boolean);
      if (items.length >= 2) clauses = [{ verb: 'with', base: 'with', bases: ['with'], part: '', object: list, items, tail, people: false }]; lead = rest.slice(0, w.index).trim();
    }
  }
  return { first, sentences: sentences.slice(1), identity, article, audience, clauses, lead: clean(lead), place: placeIn(t), form: form || 'third' };
}

// someone who does the work -> the work itself ("a wedding photographer" -> "wedding photography")
const AGENT_TO_WORK = [[/photographers?$/, 'photography'], [/videographers?$/, 'films'], [/florists?$/, 'flowers'], [/tutors?$/, 'tutoring'], [/coach(?:es)?$/, 'coaching'], [/designers?$/, 'design'],
  [/electricians?$/, 'electrical work'], [/plumbers?$/, 'plumbing'], [/roofers?$/, 'roofing'], [/painters?$/, 'painting'], [/landscapers?$/, 'landscaping'], [/caterers?$/, 'catering'], [/architects?$/, 'architecture'], [/therapists?$/, 'therapy'],
  [/trainers?$/, 'training'], [/cleaners?$/, 'cleaning'], [/detailers?$/, 'detailing'], [/tailors?$/, 'tailoring'], [/groomers?$/, 'grooming'], [/physiotherapists?$/, 'physiotherapy']];
function workOf(identity) { const x = String(identity || '').toLowerCase(); for (const [re, w] of AGENT_TO_WORK) if (re.test(x)) return clean(x.replace(re, w)); return ''; }
// "a sparkling energy drink brand" -> "sparkling energy drinks" (what a maker of things makes)
function productOf(identity) {
  const m = /^(.+?)\s+(?:brand|label|maker|makers)$/i.exec(String(identity || '')); if (!m || /\b(?:and|or)\b/.test(m[1]) || m[1].split(' ').length > 4) return '';
  const w = m[1].split(' '); const last = w.pop(); return w.concat(/s$/.test(last) || /(?:wear|ware|ry|ing)$/.test(last) ? last : `${last}s`).join(' ');
}
// an item inside a sentence: lower case ("Single-origin Beans" -> "single-origin beans"), acronyms kept ("EV chargers", "APIs")
const lc = s => String(s || '').split(/\s+/).map(w => (/^[A-Z]{2,}s?$/.test(w) ? w : w.replace(/^[A-Z](?=[a-z'’-]|$)/, c => c.toLowerCase()))).join(' ');
// just the place in a where-phrase ("for homeowners in Guelph" -> "in Guelph")
const shortPlace = tail => (/\b(?:in|across|around|from|throughout|on)\s+(?:the\s+)?[A-Z][\w'.-]*(?:\s[A-Z][\w'.-]*){0,2}/.exec(tail || '') || [''])[0];
// the where/how phrase to end a headline with, short enough to read at a glance
function tailFor(tail, place, items) {
  const t = clean(tail); const opts = [t];
  const ins = t.split(/\s+(?=in\s)/); if (ins.length > 1 && /,|\band\b/.test(ins[ins.length - 1])) opts.unshift(ins[ins.length - 1]); // "in cans in blood orange, lime and ginger" -> the flavours
  const fors = t.split(/\s+(?=for\s)/); if (fors.length > 1) opts.push(fors[0], fors.slice(1).join(' '));
  const pl = (/\b(?:in|across|around|from|throughout|on)\s+(?:the\s+)?[A-Z][\w'.-]*(?:\s[A-Z][\w'.-]*){0,2}/.exec(t) || [''])[0]; if (pl) opts.push(pl);
  for (const o of opts) if (o && o.length <= 46) return o;
  if (!t && place && !items.join(' ').includes(place)) return `in ${place}`;
  return '';
}

// a clause's things, as a visitor would name them: "walk dogs" -> "dog walking"; "do pet sitting" -> "pet sitting"
const itemsOf = x => (x.base === 'do' ? x.items : (x.bases.length === 1 && x.items.length === 1 && /^[a-z]+s$/.test(x.items[0]) && /^(?:walk|groom|wash|clean|mow|sit|train|detail|tune|service|valet)$/.test(x.base) ? [`${singular(x.items[0])} ${gerund(x.base)}`] : x.items));
const titleWords = s => String(s).split(/\s+/).map((w, i) => (i > 0 && /^(?:and|or|of|the|a|an|for|with|to|in|on|by)$/.test(w) ? w : w.charAt(0).toUpperCase() + w.slice(1))).join(' ');
// What the business offers, read from what it says it does -- for a description that gives no list of its own
// ("Blue Mooring rents kayaks and paddleboards..." -> Kayaks, Paddleboards). Never who it serves ("families"),
// never a clause that is not a thing ("help kids with..."); 2-5 short items or nothing.
function offeringsFrom(text, name) {
  const b = readBusiness(text, name || extractName(text));
  let items = [];
  for (const x of b.clauses) {
    if (x.people || x.base === 'help') continue;
    if (x.items.length === 1 && /^with\s+[^,]+(?:,[^,]+)*\s+and\s+/.test(x.tail)) items = items.concat(x.tail.replace(/^with\s+/, '').split(/\s+(?=in\s+[A-Z]|across\s|from\s|for\s)/)[0].split(/\s*,\s*|\s+and\s+/));
    else items = items.concat(itemsOf(x));
  }
  items = items.map(s => clean(s).replace(/^(?:a|an|the)\s+/i, '')).filter(s => s && s.split(' ').length <= 4 && s.length <= 32 && /^[A-Za-z][A-Za-z' &-]*$/.test(s));
  items = items.filter((s, i) => items.findIndex(o => o.toLowerCase() === s.toLowerCase()) === i);
  return items.length >= 2 && items.length <= 5 ? items.map(s => titleWords(lc(s))) : [];
}

// ctx: { text, name, categoryKey, place, offerings[], seed }
function heroCopyFor(ctx) {
  const c = ctx || {}; const text = clean(c.text); if (!text) return null;
  const name = c.name || extractName(text);
  const b = readBusiness(text, name);
  const place = c.place || b.place;
  const cands = [];
  const add = (kind, s) => { s = clean(s).replace(/\s+([,.:])/g, '$1').replace(/,\s*,/g, ','); if (s.length >= 14 && s.length <= 80 && s.split(' ').length >= 3) cands.push({ kind, text: cap(s.replace(/[.:,;]*$/, '.')) }); };
  const cl = b.clauses.slice(0, 2);
  if (cl.length) {
    const last = cl[cl.length - 1];
    const helpWith = cl.find(x => /^(?:help|support|advise|coach|guide)$/.test(x.base) && /^with\s/.test(x.tail));
    // "treating running injuries with exercise rehab, dry needling and manual therapy", "keeps lawns sharp with weekly
    // mowing, crisp edging and spring aeration": the list after "with" is what they actually offer
    const withList = !helpWith && cl.length === 1 && cl[0].items.length === 1 && /^with\s+[^,]+(?:,[^,]+)*\s+and\s+/.test(cl[0].tail) ? cl[0] : null;
    if (withList) {
      const rest = withList.tail.replace(/^with\s+/, ''); const cut = rest.search(/\s+(?=in\s+[A-Z]|across\s|from\s|for\s)/); const what = (cut >= 0 ? rest.slice(0, cut) : rest).split(/\s*,\s*|\s+and\s+/).map(lc);
      const wherePart = cut >= 0 ? clean(rest.slice(cut)) : (place ? `in ${place}` : '');
      if (/^(?:treat|fix|help|support|ease|relieve|heal|cure|manage|resolve|repair)$/.test(withList.base)) add('with', `${listPhrase(what)} for ${lc(withList.object)}`);
      else add('with', `${listPhrase(what)}${wherePart && wherePart.length <= 30 ? ` ${wherePart}` : ''}`);
    } else if (helpWith) {
      // "helping families with retirement, savings and tax planning" -> "Retirement, savings and tax planning for families."
      const what = helpWith.tail.replace(/^with\s+/, '').split(/\s+(?=for|in|across|to)\b/)[0]; const list = what.split(/\s*,\s*|\s+and\s+/).map(lc);
      add('help', `${listPhrase(list)}${/homework$/.test(what) ? ' help' : ''} for ${helpWith.object}${place && !what.includes(place) ? ` in ${place}` : ''}`);
    } else if (cl.some(x => x.people || x.base === 'help')) {
      // the object is who they serve ("alerting on-call teams", "helping families buy and sell homes"): the owner's own verb phrases
      add('doing', cl.map(x => `${gerund(x.base)} ${x.object}${x === last && x.tail && x.tail.length <= 30 ? ` ${x.tail}` : ''}`).join(' and '));
    } else {
      let items = cl.reduce((a, x) => a.concat(itemsOf(x)), []).map(lc);
      if (items.length > 4 || (items.length === 4 && listPhrase(items).length > 52)) items = items.slice(0, 3);
      const where = tailFor(last.tail || (/^(?:in|from|across)\s/.test(b.lead) ? b.lead : ''), place, items);
      const tailIsParticiple = /^(?:made|sold|built|grown|brewed|roasted|baked|infused|blended|delivered|designed|handmade|hand-made|crafted|sourced|printed|packed|shipped|served|based|run)\b/.test(where);
      const placeLike = PLACE_TAIL.test(where) || /^by hand\b/.test(where) || /^(?:by the|on)\b/.test(where) || /^to\s+(?:\w+\s+)?(?:families|people|homes|customers|clients|members|neighbours|neighbors)\b/.test(where);
      const p = !tailIsParticiple && placeLike && (cl.length === 1 || cl[0].base === cl[1].base) ? cl[0].part : '';
      const shapeOf = (pp, wh) => (pp ? 'made-where' : wh ? 'what-where' : 'what');
      add(shapeOf(p, where), `${listPhrase(items)}${p ? `, ${p}` : tailIsParticiple ? ',' : ''}${where ? ` ${where}` : ''}`);
      if (p && where && (PLACE_TAIL.test(where) || /^by hand\b/.test(where))) add('inverted', `${cap(p)} ${where}: ${listPhrase(items)}`);
      // shorter phrasings of the same facts: the first two of a long list (the full list is in the offer chips and
      // sections), the place without the audience ("for homeowners in Guelph" -> "in Guelph"), the list without its verb
      const sets = items.length > 2 && listPhrase(items).length > 34 ? [items, items.slice(0, 2)] : [items];
      const near = shortPlace(where); const wheres = near && near !== where ? [where, near] : [where];
      for (const set of sets) for (const wh of wheres) for (const pp of (p ? [p, ''] : [''])) {
        if (set === items && wh === where && pp === p) continue;
        add(shapeOf(pp, wh), `${listPhrase(set)}${pp ? `, ${pp}` : (tailIsParticiple && wh === where) ? ',' : ''}${wh ? ` ${wh}` : ''}`);
      }
      if (/^(?:rent|hire|book)$/.test(cl[0].base)) add('invite', `${cap(cl[0].base)} ${listPhrase(items)}${where ? ` ${where}` : ''}`);
    }
  }
  if (b.identity) {
    const work = workOf(b.identity); const made = productOf(b.identity);
    const aud = b.audience ? ` for ${b.audience}` : '';
    if (work) add('work', `${work}${aud}${place ? ` in ${place}` : ''}`);
    if (made) add('made', `${made}${place ? ` from ${place}` : ''}`);
    if (/\b(?:software|app|platform|tool|tools)\b/i.test(b.identity) && b.identity.split(' ').length > 1 && b.audience) add('product', `${b.identity}${aud}`);
  }
  // offerings the owner listed in a later sentence ("Single-origin beans, pour-over bar and fresh pastries.")
  const offers = (c.offerings || []).filter(Boolean).map(String);
  if (!cl.length && offers.length >= 2) add('offers', `${listPhrase(offers.slice(0, 3).map(lc))}${place ? ` in ${place}` : ''}`);
  if (!cands.length && b.identity) add('identity', `${b.article === 'the' ? 'the ' : ''}${b.identity}${b.audience ? ` for ${b.audience}` : ''}${place ? ` in ${place}` : ''}`);
  if (!cands.length) return null;
  // an opening line is read at a glance: the shorter phrasings when there are any
  const pool = cands.filter(x => x.text.length <= 54).length ? cands.filter(x => x.text.length <= 54) : cands;
  const pick = pool[hash(`${text}|${c.seed || 0}`) % pool.length];
  // the kicker: what the business is (else where it is); the sub: the owner's next sentence, else what it is
  const kickerBase = b.identity && b.identity.split(' ').length <= 4 ? b.identity : '';
  const kicker = kickerBase ? clean(`${kickerBase}${place && kickerBase.length + place.length < 30 && !pick.text.includes(place) ? ` · ${place}` : ''}`).toUpperCase() : '';
  const next = b.sentences.find(s => s.length >= 12 && s.length <= 170 && !/[$€£]|\d+\s*%|free shipping|returns?\b/i.test(s));
  let sub = next ? cap(next.replace(/\s*[.!]*$/, '.')) : '';
  if (!sub && name && b.identity) sub = `${name} is ${b.article ? `${/^[aeiou]/i.test(b.identity) && b.article !== 'the' ? 'an' : b.article} ` : ''}${b.identity}${b.audience ? ` for ${b.audience}` : ''}${place && !pick.text.includes(place) ? ` in ${place}` : ''}.`;
  return { headline: pick.text, kicker, sub, shape: pick.kind, read: b };
}

// ---- checking a planner-written headline ------------------------------------------------------------------------------
const STOCK = /,\s*(?:done properly|made to be noticed|worth stopping for|built the right way|made to be seen|worth the trip|made to be tasted|handled with care|handled with expertise|explained clearly|presented properly|taught properly|on your own terms|because it matters|done right|done to last|built to last|finished clean|fixed properly|handled fast|wired right|done to code|done thoroughly|spotless every time|cared for properly|detailed right|built for the weather|built on reputation|outdoors done right|colour done right)\.?$/i;
const GENERIC_LINES = /^(?:built to make a strong first impression|a modern website\b|your business,|welcome to\b|quality you can trust|excellence in\b|the best\b)/i;
// claims only the owner can make: rankings, awards, guarantees, credentials, results, numbers
const CLAIMS = /\b(?:best|#\s?1|number one|no\.\s?1|award[- ]?winning|awards?|guarantee[ds]?|trusted by|leading|premier|top[- ]rated|five[- ]star|5[- ]star|certified|licensed|insured|accredited|official|world[- ]class|unbeatable|cheapest|fastest|only|proven|results)\b/i;
const STOP = new Set('a an the and or of for to in on at by with from your our their its is are be we you it that this as into over just every all any more most very so than then now here there up out new get make made done right way how what who where when why can will need want know love count rely'.split(' '));
const contentWords = s => String(s || '').toLowerCase().replace(/[^a-z0-9\s-]/g, ' ').split(/\s+/).filter(w => w.length > 2 && !STOP.has(w));
const stem = w => w.replace(/(?:ies|es|s|ing|ed)$/, '');
// words that could open ANY business's site: a headline made only of these (and category words) says nothing about this one
const GENERIC_VOCAB = new Set(('quality trust trusted excellence excellent service services solution solutions business businesses experience experiences results professional professionals ' +
  'properly better best first impression impressions modern website site online noticed built care cared caring work works working team teams expert experts expertise reliable ' +
  'simple easy fast today tomorrow future growth grow success successful difference matters matter detail details standard standards level next partner partners perfect premium ' +
  'style story stories brand brands company companies product products studio agency firm group local community people customer customers client clients home homes life lives ' +
  'world everyday everything something beautiful great good amazing incredible unique special stand standout confidence confident style stylish vision passion passionate ' +
  'dedicated commitment committed craft crafted craftsmanship creative creativity innovative innovation elevate elevated elevating transform transforming journey moment moments ' +
  'value values real true genuine honest help helping deliver delivering delivered make making create creating created impact impression noticed seen heard feel ' +
  'category general other offering offerings offer offers approach approaches way ways right place places time times day days start started starts begin begins here').split(' '));
function headlineProblem(h, ctx) {
  const s = clean(h); const c = ctx || {}; if (!s) return 'empty';
  if (STOCK.test(s) && s.split(',')[0].split(' ').length <= 3) return 'generic';
  if (GENERIC_LINES.test(s)) return 'generic';
  const owner = `${c.text || ''} ${(c.offerings || []).join(' ')} ${c.name || ''}`;
  const claim = CLAIMS.exec(s); if (claim && !new RegExp(`\\b${claim[0].replace(/[#.]/g, m => `\\${m}`)}\\b`, 'i').test(owner)) return 'claim';
  const nums = s.match(/\d+/g) || []; if (nums.some(n => !owner.includes(n))) return 'claim';
  // specific when it names something concrete (a yard, a can, a sail) or anything the owner wrote
  const ownerStems = new Set(contentWords(owner).map(stem));
  const words = contentWords(s);
  if (!words.some(w => ownerStems.has(stem(w)) || !GENERIC_VOCAB.has(w))) return 'generic';
  return null;
}

// a planner-given name that is really a service, a place or a fragment is not used
function isNameLike(name, text) { const n = tidyName(name || ''); return !!n && n.length <= 60 && acceptable(n, text || ''); }
module.exports = { offeringsFrom, isNameLike, extractName, readBusiness, heroCopyFor, headlineProblem, participle, gerund, baseOf, workOf, productOf, placeIn };
