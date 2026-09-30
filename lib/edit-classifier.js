// "Update My Website" -- which kind of intelligence a request needs (server.js POST /api/app-bridge/website/:id/edits).
//
//   surgical_edit    a specific field, value or structural move ("change the headline to X", "move testimonials above
//                    services", "remove the FAQ", "change the spacing"). Goes to the existing operation plan
//                    (lib/refinement-normalizer.js + lib/apply-refinement-plan.js): cheap, fast, deterministic.
//   deep_refinement  a RESULT rather than a field ("make it feel premium", "this feels generic, make it more creative",
//                    "redesign the hero", "make the homepage more editorial"). Goes to the redesign path
//                    (lib/deep-refinement.js): the whole site is studied and revised as a structured direction.
//
// Deterministic and free (no model call before the owner is charged). Not a keyword switch: each request is read for
// separate signals -- does it describe an outcome or name a field, does it carry a literal value, is it a structural
// move, how wide is its scope, how many design systems would the outcome touch -- and the two readings are scored
// against each other. A request that names a specific field with a literal value stays surgical even if it also uses
// a style word ("change the hero button to Book Now"); a request that only describes how the site should feel is deep.
'use strict';

// Words that describe how a site should come across (the outcome), each with the design systems it usually moves.
// A word that moves several systems at once is what makes a request "broad".
const OUTCOME_LEXICON = [
  [/\b(premium|luxur(y|ious)|luxe|high[- ]end|upscale|upmarket|exclusive|boutique|classy|sophisticated|refined|elegant|polished|sleek|expensive[- ]looking)\b/, ['type', 'spacing', 'color', 'hero', 'copy']],
  [/\b(editorial|magazine|journal|publication)\b/, ['type', 'rhythm', 'hero', 'layout']],
  [/\b(minimal(ist)?|pared[- ]back|stripped[- ]back|clean(er)?|simple|simpler|uncluttered|calm(er)?|quiet(er)?|serene|restrained)\b/, ['spacing', 'density', 'color', 'motion']],
  [/\b(bold(er)?|striking|dramatic|loud(er)?|punch(y|ier)|confident|impactful|vibrant|energetic|dynamic|lively)\b/, ['type', 'color', 'hero', 'motion']],
  [/\b(creative|artistic|expressive|imaginative|original|distinctive|unique|memorable|different|unexpected|interesting|characterful)\b/, ['layout', 'hero', 'rhythm', 'concept']],
  [/\b(generic|boring|bland|dull|plain|basic|template[- ]?(y|like)?|cookie[- ]cutter|samey|cheap(-looking)?|amateur(ish)?|dated|old[- ]fashioned|outdated|stale|flat)\b/, ['layout', 'type', 'hero', 'concept']],
  [/\b(modern|contemporary|fresh(er)?|current|up[- ]to[- ]date|futuristic|cutting[- ]edge|techy|stylish|trendy|cool(er)?)\b/, ['type', 'layout', 'color']],
  [/\b(warm(er)?|friendl(y|ier)|welcoming|approachable|inviting|cosy|cozy|human|personal|playful|fun|cheerful)\b/, ['color', 'copy', 'type']],
  [/\b(professional|corporate|trustworthy|credible|serious|authoritative|established)\b/, ['type', 'copy', 'color']],
  [/\b(cinematic|immersive|visual|image[- ]led|photo[- ]led)\b/, ['hero', 'imagery', 'layout']],
  [/\b(rustic|organic|natural|earthy|handmade|artisan(al)?|crafted|timeless|classic)\b/, ['color', 'type', 'imagery']],
  [/\b(fashion|couture|gallery|studio|agency|brand)\b/, ['type', 'layout', 'hero']],
];
const REDESIGN_VERB = /\b(re-?design|re-?think|overhaul|revamp|re-?work|re-?imagine|transform|re-?style|refresh|moderni[sz]e|elevate|upgrade|level[- ]up|make-?over|re-?do|re-?build|re-?invent|re-?vamp|polish up|spruce up|glow[- ]up)\b/;
const FEEL = /\b(feel|feels|feeling|look|looks|looking|vibe|vibes|aesthetic|style|mood|energy|personality|impression|come across|reads? as)\b/;
const COMPARISON = /\blike (a|an|the|those)\b|\bin the style of\b|\bsimilar to\b|\bmore like\b/;
const MORE_LESS = /\b(way |much |a lot |a bit |slightly |far )?(more|less)\s+[a-z-]{3,}/;

const SCOPE_SITE = /\b(whole|entire|full|all( of)?( the)?|every)\s+(the\s+)?(web)?(site|pages?)\b|\bsite[- ]?wide\b|\beverywhere\b|\bacross the (web)?site\b|\b(this|my|the|our) (web)?site\b|\bthe whole thing\b/;
const SCOPE_HOME = /\bhome ?page\b|\blanding page\b|\bfront page\b|\bmain page\b|\bhomepage\b/;
const SCOPE_HERO = /\bhero\b|\btop of (the|my|our) (home ?)?page\b|\babove the fold\b|\bfirst (thing|section|screen)\b|\bopening section\b|\bheader (section|image)\b/;

// A specific field, element or value the owner points at.
const SPECIFIC_FIELD = /\b(headline|heading|title|subtitle|sub-?heading|tagline|slogan|button|cta|call to action|phone|number|email|address|hours|opening times|price|prices|text|wording|word|sentence|paragraph|label|link|logo|photo|image|picture|menu item|footer|nav(igation)? (item|link))\b/;
// A literal value to put in place: quoted text, "to <Capitalised words>", "replace X with Y", a phone/email.
const LITERAL = [
  /["“‘'][^"”’']{2,}["”’']/, /\b(to|with|into) say\b/, /\bsays?\s+["“]/, /\bchange\b[^.]{0,60}\bto\s+[A-Z0-9"“]/, /\breplace\b[^.]{0,60}\bwith\b/,
  /\b(update|set|make)\b[^.]{0,40}\b(to|as)\s+[A-Z0-9"“$]/, /\+?\d[\d\s().-]{6,}\d/, /[^\s@]+@[^\s@]+\.[^\s@]+/, /\brename\b/,
];
// A structural move of named sections/pages.
const SECTION_NAMES = '(section|faq|faqs|testimonials?|reviews?|gallery|services?|about|contact|pricing|prices|newsletter|process|how it works|team|menu|features?|products?|portfolio|work|case stud(y|ies)|booking|reservations?|service areas?|call[- ]to[- ]action|banner|form|map|page)';
const STRUCTURAL = [
  new RegExp(`\\b(move|swap|reorder|put|place|shift)\\b[^.]{0,60}\\b(above|below|before|after|under|over|beneath|to the (top|bottom|end|start)|first|last)\\b`),
  new RegExp(`\\b(remove|delete|hide|get rid of|drop|take (out|away|off))\\b[^.]{0,40}\\b${SECTION_NAMES}`),
  new RegExp(`\\badd (a|an|another|some)?\\s*[a-z -]{0,30}\\b${SECTION_NAMES}\\b`),
  new RegExp(`\\b(switch|change) the layout of\\b`),
];
// One specific design control, named on its own ("tighten the spacing", "make it blue").
const SINGLE_CONTROL = /\b(spacing|padding|white ?space|gaps?|colou?rs?|palette|blue|green|red|black|white|dark mode|font|typeface|font size|text size|rounded|corners|layout of the \w+ section)\b/;

function uniq(a) { return [...new Set(a)]; }

// -> { mode: 'surgical'|'deep', scope: 'section'|'hero'|'page'|'site', targetPages: ['home']|null, scores, signals, reasons }
function classifyEditRequest(request) {
  const text = String(request || '').replace(/\s+/g, ' ').trim();
  const lower = text.toLowerCase();
  const outcomeHits = OUTCOME_LEXICON.filter(([re]) => re.test(lower));
  const systems = uniq(outcomeHits.flatMap(([, s]) => s));
  const signals = {
    outcomeWords: outcomeHits.length,
    designSystems: systems.length,
    redesignVerb: REDESIGN_VERB.test(lower),
    feel: FEEL.test(lower),
    comparison: COMPARISON.test(lower) && outcomeHits.length > 0,
    moreLess: MORE_LESS.test(lower) && outcomeHits.length > 0,
    scopeSite: SCOPE_SITE.test(lower),
    scopeHome: SCOPE_HOME.test(lower),
    scopeHero: SCOPE_HERO.test(lower),
    specificField: SPECIFIC_FIELD.test(lower),
    literal: LITERAL.some(re => re.test(text)),
    structural: STRUCTURAL.some(re => re.test(lower)),
    singleControl: SINGLE_CONTROL.test(lower),
  };
  // Describing a result: outcome words, "feel/look like", comparisons, redesign verbs -- weighted up when the outcome
  // plainly touches several design systems at once, or the scope is the whole site.
  let deep = 0;
  if (signals.redesignVerb) deep += 3;
  deep += Math.min(3, signals.outcomeWords) * 2;
  if (signals.feel && signals.outcomeWords) deep += 1;
  if (signals.comparison) deep += 2;
  if (signals.moreLess) deep += 1;
  if (signals.designSystems >= 4) deep += 1;
  if (signals.scopeSite && (signals.outcomeWords || signals.redesignVerb)) deep += 1;
  if (signals.scopeHero && signals.redesignVerb) deep += 1;
  // Pointing at something specific: a literal value, a structural move, a named field, one named control.
  let surgical = 0;
  if (signals.literal) surgical += 3;
  if (signals.structural) surgical += 3;
  if (signals.specificField) surgical += 1.5;
  if (signals.singleControl && !signals.outcomeWords) surgical += 2;
  // A specific field WITHOUT a result to aim for, or a field + one style word ("make the headline warmer"), is a
  // targeted tweak, not a redesign -- unless the owner asked to redesign it.
  const deepEnough = deep >= 3 && deep > surgical && !(signals.literal && !signals.redesignVerb && signals.outcomeWords < 2);
  const mode = deepEnough ? 'deep' : 'surgical';
  const scope = mode === 'surgical' ? 'section'
    : (signals.scopeHero && !signals.scopeSite ? 'hero' : signals.scopeHome && !signals.scopeSite ? 'page' : 'site');
  const reasons = [];
  if (signals.redesignVerb) reasons.push('asks for a redesign');
  if (signals.outcomeWords) reasons.push(`describes an outcome (${signals.outcomeWords} style word${signals.outcomeWords === 1 ? '' : 's'}, ${signals.designSystems} design systems)`);
  if (signals.comparison) reasons.push('compares to a kind of brand');
  if (signals.literal) reasons.push('gives a literal value');
  if (signals.structural) reasons.push('moves, adds or removes named sections');
  if (signals.specificField) reasons.push('names a specific field');
  return { mode, scope, targetPages: scope === 'page' ? ['home'] : null, scores: { deep, surgical }, signals, reasons };
}

module.exports = { classifyEditRequest };
