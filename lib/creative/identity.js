'use strict';
// CREATIVE — identity resolution (server only). WHAT the brief is about is settled here, by rules, BEFORE any creative
// direction -- the model's reading is one piece of evidence, never the decision.
//
// Why: the understanding model was asked to guess the kind of an unfamiliar name ("Make a website based off of Neegy.").
// Real calls on that one brief answered invented, fictional or "<UNKNOWN>" at random, with low confidence every time,
// and wrote different clarification options on every run -- so the same brief became a meme page, a personal page or
// an abstract invented page depending on the draw. The open web had a clear answer (an internet meme: Know Your Meme,
// Reddit, TikTok) that the model's knowledge did not.
//
//   cues(brief)                           -> { personal, invented, bareName, name, words }   what the brief itself says
//   webEvidence(serp)                     -> { kg, results, scores, notes }                  a Google web search, read
//   resolve({ raw, brief, web, choice })  -> identity                                      the decision, deterministic
//   options(identity)                     -> clarification options (fixed wording for an unknown name)
//   choiceType(choice)                    -> a TYPE when the owner picked one of the fixed options
//   legacyKind(type, status)              -> recognizable | fictional | personal | invented | ambiguous
//
// identity: { name, type, status: resolved | ambiguous | invented, confidence (0..1), level: high | medium | low,
//             candidates: [{ type, score }], evidence: [short notes], source: model | web | brief | owner }
// The same inputs always give the same identity; a name with no evidence is AMBIGUOUS (asked), never invented.

const TYPES = ['known-entity', 'meme', 'fictional-character', 'real-person', 'product', 'place', 'franchise', 'invented', 'personal', 'unknown'];
// what the owner is shown when nothing says what an unfamiliar name is: fixed wording, fixed order (never rewritten per
// run); options the evidence supports come first
const LABELS = {
  meme: ['An internet meme or online character', 'A viral meme, trend or internet character'],
  'fictional-character': ['A character from a game, show, book or film', 'A fictional character or creature'],
  franchise: ['A game, show, film or franchise', 'A video game, series, film or franchise'],
  'real-person': ['A real person, artist or creator', 'A real, public person'],
  product: ['A brand, product or app', 'A real product, brand, company or service'],
  place: ['A real place or building', 'A city, landmark, building or venue'],
  'known-entity': ['Something real that has its own name', 'An event, artwork, idea or other real thing'],
  personal: ['My own pet, person or project', 'Someone or something of mine -- it is not looked up'],
  invented: ['An idea I made up', 'An invented concept -- nothing is looked up'],
};
const ORDER = ['meme', 'fictional-character', 'franchise', 'real-person', 'product', 'place', 'personal', 'invented'];
const norm = s => String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

// ---------------------------------------------------------------- what the brief says
const PERSONAL = /\b(my|our)\s+(?:own\s+|late\s+|little\s+|old\s+|best\s+|beloved\s+|dear\s+|family\s+)*(dog|puppy|cat|kitten|pet|fish|goldfish|hamster|rabbit|bunny|horse|pony|bird|parrot|budgie|tortoise|turtle|guinea pig|lizard|snake|grand(?:ad|pa|father|ma|mother|parents?)|nan|nana|granny|mum|mom|mother|dad|father|parents?|brother|sister|son|daughter|kids?|children|baby|wife|husband|partner|girlfriend|boyfriend|friend|uncle|aunt|auntie|cousin|teacher|family|team|band|club|wedding|garden|house|home)\b/i;
const INVENTED = /\b(imaginary|made[- ]up|invented|fictional (?:country|world|city|planet|brand|company|product|creature|island|kingdom|band)|a world where|what if|my own (?:game|world|character|universe|brand|creature)|i (?:made|invented|created|dreamed) up|concept for an? (?:imaginary|fictional|invented))\b/i;
const BOILER = /^\s*(?:please\s+)?(?:make|create|build|design|generate|do|give me|i want|i'd like|can you make)?\s*(?:me\s+)?(?:a|an|the)?\s*(?:one[- ]page\s+)?(?:web\s*site|website|site|page|web\s*page|landing page|tribute page|fan page|fan site)?\s*(?:that is\s+|which is\s+)?(?:about|for|on|of|based (?:off|on)(?: of)?|dedicated to|celebrating|featuring|around)?\s*/i;
function cues(brief) {
  const b = String(brief || '').replace(/\s+/g, ' ').trim();
  const rest = b.replace(BOILER, '').replace(/[.!?]+$/, '').trim();
  const words = rest ? rest.split(' ').length : 0;
  // a bare name: the brief is (almost) only the subject's name -- nothing in it says what kind of thing it is
  const bareName = words > 0 && words <= 5 && !/[,;:]/.test(rest) && !INVENTED.test(b) && !PERSONAL.test(b);
  return { personal: PERSONAL.test(b), invented: INVENTED.test(b), bareName, name: bareName ? rest.slice(0, 80) : '', words };
}

// ---------------------------------------------------------------- what the open web says (one Google web search)
// serp: { kg: { title, type, description } | null, results: [{ link, title, snippet }] }
const HOSTS = [
  [/(^|\.)knowyourmeme\.com$/, { meme: 2.5 }, 'Know Your Meme has a page'],
  [/(^|\.)fandom\.com$/, { 'fictional-character': 0.6, franchise: 0.6 }, 'a fan wiki has a page'],
  [/(^|\.)(store\.steampowered\.com|nintendo\.com|playstation\.com|xbox\.com|epicgames\.com|ign\.com|gamespot\.com|polygon\.com|metacritic\.com)$/, { franchise: 1 }, 'game sites list it'],
  [/(^|\.)(imdb\.com|netflix\.com|rottentomatoes\.com|crunchyroll\.com|myanimelist\.net|tvtropes\.org)$/, { franchise: 1 }, 'film and TV sites list it'],
  [/(^|\.)(tripadvisor\.[a-z.]+|wikivoyage\.org|lonelyplanet\.com|unesco\.org|booking\.com|timeout\.com)$/, { place: 1 }, 'travel sites list it'],
  [/(^|\.)(amazon\.[a-z.]+|bestbuy\.com|walmart\.com|target\.com|apple\.com|ebay\.[a-z.]+)$/, { product: 0.5 }, 'shops sell it'],
  [/(^|\.)linkedin\.com$/, { 'real-person': 0.5 }, 'a profile exists'],
];
const TEXT = [
  [/\b(meme|memes|brain ?rot|viral (?:clip|sound|video|trend)|internet (?:slang|phenomenon|trend|character)|slang term|copypasta|reaction image)\b/i, 'meme', 0.75],
  [/\b(video game|game series|nintendo switch|playstation|xbox|fighting game|platformer|rpg)\b/i, 'franchise', 0.5],
  [/\b(tv series|television series|anime series|animated series|feature film|film series|sitcom)\b/i, 'franchise', 0.5],
  [/\b(fictional character|the character|protagonist|antagonist|mascot)\b/i, 'fictional-character', 0.4],
  [/\b(landmark|tourist attraction|located in|venue|building|national park|heritage site)\b/i, 'place', 0.5],
  [/\b(buy|price|product|launch(?:ed)?|camera|device|service|subscription|company|brand)\b/i, 'product', 0.3],
  [/\b(born|singer|rapper|actor|actress|athlete|youtuber|streamer|politician|designer|footballer)\b/i, 'real-person', 0.3],
];
// the search engine's own panel ("Video game", "Opera house", "Fashion house", "Song by ...")
const KG = [
  [/video game|game series|fighting game|game franchise/i, 'franchise', 2],
  [/television series|tv series|tv program|anime|animated series|film series|^film$|\bmovie\b|media franchise/i, 'franchise', 2],
  [/fictional character|character/i, 'fictional-character', 2],
  [/building|landmark|tourist attraction|opera house|arts centre|arts center|museum|stadium|bridge|park|city|town|country|island|mountain|cathedral|temple|palace|venue/i, 'place', 2],
  [/company|corporation|brand|product|camera|device|smartphone|internet service|satellite|constellation|fashion house|clothing|manufacturer|retailer|software|application|website/i, 'product', 2],
  [/\b(person|singer|rapper|actor|actress|musician|artist|athlete|footballer|politician|designer|youtuber|streamer|author|presenter|entrepreneur)\b/i, 'real-person', 2],
  [/meme|internet phenomenon/i, 'meme', 2],
];
const hostOf = u => { try { return new URL(u).hostname.toLowerCase(); } catch (e) { return ''; } };
function webEvidence(serp) {
  const s = serp || {}; const scores = {}; const notes = []; const add = (t, v) => { scores[t] = +((scores[t] || 0) + v).toFixed(2); };
  const results = (Array.isArray(s.results) ? s.results : []).slice(0, 10).map(r => ({ host: hostOf(r.link), title: String(r.title || '').slice(0, 120), snippet: String(r.snippet || '').slice(0, 240) }));
  const kg = s.kg && (s.kg.type || s.kg.title) ? { title: String(s.kg.title || '').slice(0, 120), type: String(s.kg.type || '').slice(0, 120), description: String(s.kg.description || '').slice(0, 240) } : null;
  if (kg && kg.type) {
    // (a minor song or album that shares the name -- "Neegy: song by Vault Uploads" -- is weak evidence of anything)
    const hit = /\b(song|single|album|ep)\b/i.test(kg.type) ? null : KG.find(([re]) => re.test(kg.type));
    if (hit) { add(hit[1], hit[2]); notes.push(`search panel: "${kg.type}"`); } else { add('known-entity', 0.5); notes.push(`search panel: "${kg.type}" (weak)`); }
  }
  const hostSeen = new Set(); const textCap = {};
  results.forEach(r => {
    HOSTS.forEach(([re, w, note]) => { if (re.test(r.host) && !hostSeen.has(note)) { hostSeen.add(note); Object.entries(w).forEach(([t, v]) => add(t, v)); notes.push(note); } });
    const text = `${r.title} ${r.snippet}`;
    TEXT.forEach(([re, t, v]) => { if (re.test(text) && (textCap[t] || 0) < 3) { textCap[t] = (textCap[t] || 0) + 1; add(t, v); } });
  });
  Object.entries(textCap).forEach(([t, n]) => notes.push(`${n} result(s) describe it as ${t.replace('-', ' ')}`));
  if (/^en\.wikipedia\.org$/.test((results[0] || {}).host || '')) { add('known-entity', 1); notes.push('a Wikipedia article is the top result'); }
  return { kg, results, scores, notes: notes.slice(0, 8) };
}

// ---------------------------------------------------------------- the decision
// raw: the understanding model's raw output (identity.type, identity.recognized, identity.confidence, candidates, kind)
// the model's own reading counts fully only when it says it KNOWS the thing; a guess about an unfamiliar name is a hint
const MODEL_W = { high: 3, medium: 2, low: 0.5 };
const KIND_TYPE = { recognizable: 'known-entity', fictional: 'fictional-character', personal: 'personal', invented: 'invented' };
function choiceType(choice) {
  const c = norm(choice); if (!c) return null;
  if (/^type /.test(c)) { const t = c.slice(5).replace(/ /g, '-'); return TYPES.includes(t) ? t : null; }
  for (const t of Object.keys(LABELS)) if (LABELS[t].some(l => norm(l) === c)) return t;
  return null;
}
function resolve(input) {
  const i = input || {}; const raw = i.raw || {}; const id = raw.identity || {}; const brief = String(i.brief || '');
  const cue = cues(brief); const name = String(id.name || cue.name || '').replace(/\s+/g, ' ').trim().slice(0, 120);
  const out = (type, status, confidence, source, evidence, candidates) => ({ name, type, status, confidence: +confidence.toFixed(2), level: confidence >= 0.8 ? 'high' : confidence >= 0.55 ? 'medium' : 'low', candidates: candidates || [{ type, score: 1 }], evidence: evidence.slice(0, 8), source });
  // 1. the owner said what it is (one of the fixed options, or a named article from a clarification): decided
  const picked = choiceType(i.choice);
  if (picked) return out(picked, picked === 'invented' ? 'invented' : 'resolved', 1, 'owner', [`the owner chose: ${LABELS[picked][0]}`]);
  // 2. the brief says it is the owner's own (a pet, a grandad): never looked up, never a public figure
  if (cue.personal) return out('personal', 'resolved', 0.95, 'brief', ['the brief says it is the owner\'s own']);
  // 3. the evidence, scored
  const score = {}; const ev = []; const add = (t, v) => { if (TYPES.includes(t) && v) score[t] = +((score[t] || 0) + v).toFixed(2); };
  const conf = ['high', 'medium', 'low'].includes(id.confidence) ? id.confidence : 'low';
  // (an older reading without "recognized" counts as known only when it was sure)
  const knows = conf !== 'low' && id.recognized !== false && (id.recognized === true || conf === 'high');
  const modelType = TYPES.includes(id.type) && id.type !== 'unknown' ? id.type : KIND_TYPE[id.kind] || null;
  // (the owner named one of several real things -- an article: it is that thing, read by the model with the choice; the
  // owner is never asked twice)
  if (String(i.choice || '').trim()) { const t = modelType && !['invented', 'personal'].includes(modelType) ? modelType : 'known-entity'; return out(t, 'resolved', 0.9, 'owner', [`the owner chose: ${String(i.choice).slice(0, 80)}`]); }
  // (the model alone never makes a bare, unfamiliar name personal or invented: that needs the brief's own words)
  if (modelType && !(['personal', 'invented'].includes(modelType) && !knows && cue.bareName)) { add(modelType, knows ? MODEL_W[conf] : 0.5); ev.push(`the model ${knows ? 'knows it' : 'guesses'}: ${modelType} (${conf})`); }
  if (knows) (Array.isArray(id.candidates) ? id.candidates : []).slice(0, 3).forEach(c => { if (c && TYPES.includes(c.type) && c.type !== modelType) add(c.type, 0.75); });
  if (cue.invented) { add('invented', 4); ev.push('the brief describes an invented idea'); }
  if (modelType === 'invented' && knows && !cue.bareName && cue.words >= 4) add('invented', 2);
  if (i.web) { Object.entries(i.web.scores || {}).forEach(([t, v]) => add(t, v)); ev.push(...(i.web.notes || [])); }
  const ranked = Object.entries(score).filter(([t]) => t !== 'unknown').sort((a, b) => b[1] - a[1] || ORDER.indexOf(a[0]) - ORDER.indexOf(b[0]));
  const [top, second] = [ranked[0] || ['unknown', 0], ranked[1] || ['', 0]];
  const candidates = ranked.slice(0, 4).map(([type, s]) => ({ type, score: s }));
  const source = i.web && Object.keys(i.web.scores || {}).length ? 'web' : 'model';
  // the model asked which of several REAL things was meant ("Zelda": the franchise, a game, the princess) -- each an
  // article of its own -- and nothing settles it: that question is kept (its options are named articles, not guesses)
  const asked = raw.clarify && raw.clarify.needed && (raw.clarify.options || []).filter(o => o && String(o.wikipediaTitle || '').trim()).length >= 2;
  const webSure = !!i.web && Math.max(0, ...Object.values(i.web.scores || {})) >= 3;
  if (asked && conf !== 'high' && !webSure && !cue.invented) return Object.assign(out(top[0] || 'unknown', 'ambiguous', 0.5, 'model', ev.concat(['several real things share this name']), candidates), { entities: true });
  if (top[1] >= 2 && top[1] - second[1] >= 1.5) {
    const confidence = Math.min(0.97, top[1] / (top[1] + second[1] + 1));
    return out(top[0], top[0] === 'invented' ? 'invented' : 'resolved', confidence, source, ev, candidates);
  }
  // nothing decisive: kept as a question, with the candidates the evidence supports -- never a confident guess
  if (!ev.length) ev.push('nothing found says what this is');
  return out('unknown', 'ambiguous', Math.min(0.5, top[1] / 6), source, ev, candidates);
}

// the clarification for an ambiguous identity: the evidence's candidates first, then every other kind, in fixed order
function options(identity) {
  const lead = ((identity && identity.candidates) || []).map(c => c.type).filter(t => ORDER.includes(t));
  const types = [...new Set(lead.concat(ORDER))];
  return types.map(t => ({ title: LABELS[t][0], wikipediaTitle: '', description: LABELS[t][1], type: t }));
}
const QUESTION = 'We could not tell what this is. Which is it?';

function legacyKind(type, status) {
  if (status === 'ambiguous') return 'ambiguous';
  if (type === 'personal') return 'personal';
  if (type === 'invented' || status === 'invented') return 'invented';
  if (type === 'fictional-character') return 'fictional';
  return 'recognizable';
}
// how its pictures are searched (discovery.subjectType's intents), from the decided type
function searchIntent(type, text) {
  const t = String(text || '');
  if (type === 'meme') return 'meme';
  if (type === 'franchise') return /\b(video ?games?|game series|videogame|nintendo|playstation|xbox|fighting game|platformer|rpg|game)\b/i.test(t) ? 'game' : 'screen';
  if (type === 'fictional-character') return 'character';
  // (a product search -- "on white", "in use" -- is for a physical object; a service, network or label keeps the existing
  // word rules: real prompts searched "Starlink isolated on white background")
  if (type === 'product') return /\b(camera|phone|smartphone|headphones?|earbuds|watch|sneakers?|shoes?|car|motorbike|bicycle|console|device|gadget|laptop|bottle|perfume|handbag|chair|lamp|speaker|drink|snack)\b/i.test(t) && !/\b(service|network|constellation|company|fashion house|label|brand)\b/i.test(t) ? 'product' : null;
  if (type === 'place') return 'place';
  if (type === 'real-person') return 'real';
  return null;
}
// whether the open web should be asked: a named subject that is not the owner's own and not a described invention
function wantsWeb(raw, brief) {
  const cue = cues(brief); if (cue.personal || cue.invented) return false;
  const id = (raw && raw.identity) || {};
  if (id.kind === 'personal' && !cue.bareName) return false;
  return !!String(id.name || cue.name || '').trim();
}

// the decision written onto a normalised understanding (ai.normaliseUnderstanding): every later step -- research, the
// picture search, the art direction, the director -- reads this one identity, never the model's guess
function applyIdentity(u, idn, raw) {
  const x = Object.assign({}, u); const r = raw || {};
  const kind = legacyKind(idn.type, idn.status);
  x.kind = kind;
  x.identity = Object.assign({}, u.identity, { name: (u.identity && u.identity.name) || idn.name, kind: kind === 'ambiguous' ? ((u.identity && u.identity.kind) || 'recognizable') : kind, confidence: idn.level, type: idn.type, status: idn.status, score: idn.confidence, candidates: idn.candidates, evidence: idn.evidence, source: idn.source });
  if (idn.status === 'ambiguous') {
    const named = idn.entities ? ((r.clarify && r.clarify.options) || []).slice(0, 5).map(o => ({ title: String(o.label || o.wikipediaTitle || '').slice(0, 120), wikipediaTitle: String(o.wikipediaTitle || '').slice(0, 160), description: String(o.description || '').slice(0, 200) })).filter(o => o.title) : [];
    x.clarify = named.length >= 2 ? { question: String((r.clarify && r.clarify.question) || 'Which one did you mean?').slice(0, 200), options: named } : { question: QUESTION, options: options(idn) };
  } else x.clarify = null;
  // never looked up: the owner's own subject (only its general type, as before) and an invented idea
  if (idn.type === 'invented') Object.assign(x, { research: Object.assign({}, u.research, { scope: 'none', wikipediaTitles: [] }), query: null });
  if (idn.type === 'personal' && u.kind !== 'personal') Object.assign(x, { research: Object.assign({}, u.research, { scope: 'none', wikipediaTitles: [] }), query: null });
  // an invented reading of a named thing the evidence placed (a meme the model did not know): it IS looked up
  if (idn.status === 'resolved' && !['invented', 'personal'].includes(idn.type) && u.research && u.research.scope === 'none') Object.assign(x, { research: Object.assign({}, u.research, { scope: 'subject' }), query: u.query || idn.name || null });
  // a meme is played for what it is unless the brief asked for another tone
  if (idn.type === 'meme' && !(u.tone && u.tone.fromBrief)) x.tone = Object.assign({}, u.tone, { register: ['absurd', 'extravagant'].includes(u.tone && u.tone.register) ? u.tone.register : 'playful' });
  const intent = searchIntent(idn.type, `${(u.identity && u.identity.what) || ''} ${u.brief || ''} ${(idn.evidence || []).join(' ')}`);
  if (intent) x.searchIntent = intent; else delete x.searchIntent;
  return x;
}

module.exports = { TYPES, LABELS, ORDER, QUESTION, cues, webEvidence, resolve, options, choiceType, legacyKind, searchIntent, wantsWeb, applyIdentity };
