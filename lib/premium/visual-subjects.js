'use strict';
// VISUAL SUBJECTS -- what each hero image actually shows, decided from the
// owner's own words rather than a category keyword.
//
//   factsFor(ctx)        the owner's stated specifics: drink container and
//                        flavours, skincare product types (serum -> dropper,
//                        cleanser -> pump...), pantry goods, garments, menu items,
//                        the services they list (mowing, edging, retaining walls,
//                        dry needling...), and for software the kind of product
//                        (scheduling, monitoring...) and who it serves.
//   FACETS               a library of concrete subjects: a label, a photographic
//                        prompt (subject, action/setting, framing, material, light)
//                        and the matching code-drawn illustration (./hero-art-kinds).
//   specialiseLayers()   fills a storyboard concept's layers from those facts --
//                        a lawn-care company gets mowing / edging / cleanup, a
//                        landscape builder patio / retaining wall / planting.
//   artForText()         the illustration for a planner-written layer, matched on
//                        its own subject and prompt.
//   planProblems()       semantic checks on a planner storyboard: a container that
//                        contradicts the product, or images that ignore everything
//                        the owner said they sell.
// Pure (no I/O, no randomness). Shared by the preview bundle and the export.
const ART = require('./hero-art');

function plain(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }
function clip(s, n) { const t = String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); return t.length > n ? t.slice(0, n - 1).replace(/\s+\S*$/, '') : t; }
const cap = s => { s = String(s || ''); return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; };
function listPhrase(a) { const x = (a || []).filter(Boolean); if (x.length <= 1) return x[0] || ''; return `${x.slice(0, -1).join(', ')} and ${x[x.length - 1]}`; }
// first index of a regex in text (or -1)
function firstIndex(re, text) { const m = new RegExp(re.source, re.flags.replace('g', '')).exec(text); return m ? m.index : -1; }

// ---- products --------------------------------------------------------------------------------------------------
const DRINK_RE = /\b(sparkling|soda|sodas|seltzers?|energy drinks?|tonics?|lemonades?|kombucha|juices?|cold[- ]pressed|smoothies?|cold brew|iced teas?|wines?|beers?|ales?|lagers?|ipas?|ciders?|gin|vodka|whisk(?:e)?y|rum|spirits|mocktails?|drinks?|beverages?)\b/;
function drinkFacts(t) {
  if (!DRINK_RE.test(t)) return null;
  let variant = 'can';
  if (/\b(wines?|vineyard|winery)\b/.test(t)) variant = 'wine';
  else if (/\b(gin|vodka|whisk(?:e)?y|rum|spirits|distiller\w*)\b/.test(t)) variant = 'spirit';
  else if (/\b(kombucha|juices?|cold[- ]pressed|smoothies?|iced teas?)\b/.test(t)) variant = /\bkombucha\b/.test(t) ? 'kombucha' : 'juice';
  else if (/\b(beers?|ales?|lagers?|ipas?|ciders?|brew(?:ery|ing))\b/.test(t)) variant = 'beer';
  let container = variant === 'can' ? 'can' : 'bottle';
  if (/\bcans?\b|\bcanned\b/.test(t)) container = 'can';
  else if (/\bbottles?\b|\bbottled\b/.test(t)) container = 'bottle';
  if (container === 'can' && variant !== 'can' && variant !== 'beer') variant = 'can';
  return { container, variant: container === 'can' ? 'can' : variant, noun: container === 'can' ? 'can' : ({ wine: 'wine bottle', spirit: 'bottle', beer: 'beer bottle', kombucha: 'glass bottle', juice: 'glass bottle' }[variant] || 'bottle') };
}
// skincare and body care: product type -> the container it actually comes in
const SKIN_TYPES = [
  { re: /\b(serums?|face oils?|facial oils?|ampoules?|essences?|retinol)\b/, variant: 'dropper', container: 'amber glass dropper bottle' },
  { re: /\b(cleansers?|face wash|cleansing (?:gel|milk|oil)|body wash|shampoos?|conditioners?|lotions?|hand wash)\b/, variant: 'pump', container: 'frosted pump bottle' },
  { re: /\b(moisturi[sz]ers?|creams?|night cream|eye cream|body butters?|masks?|scrubs?|exfoliants?)\b/, variant: 'jar', container: 'heavy glass jar with a ribbed lid' },
  { re: /\b(spf|sunscreens?|sun cream|sunblock|hand creams?|gels?)\b/, variant: 'tube', container: 'soft squeeze tube' },
  { re: /\b(balms?|salves?|pomades?|lip balms?)\b/, variant: 'tin', container: 'shallow metal tin' },
  { re: /\b(toners?|facial mists?|mists?)\b/, variant: 'toner', container: 'tall glass bottle' },
  { re: /\b(soaps?|soap bars?)\b/, variant: 'bar', container: 'bar' },
];
const SKIN_RE = /\b(skin ?care|serums?|cleansers?|moisturi[sz]ers?|spf|sunscreens?|toners?|balms?|cosmetics?|beauty|face oils?|creams?|body care|soaps?)\b/;
function phraseAt(t, idx, len) {
  // the owner's own product phrase: up to two describing words before the product noun ("vitamin c serum")
  const seg = t.slice(0, idx).split(/[,;.:!?()]|\band\b|\bor\b|\bwith\b/).pop();
  const before = seg.replace(/[^a-z0-9\s-]/g, ' ').trim().split(/\s+/).slice(-2).filter(w => w && !STOPWORDS.has(w));
  const pre = []; for (let i = before.length - 1; i >= 0; i--) { if (STOPWORDS.has(before[i])) break; pre.unshift(before[i]); }
  return (pre.join(' ') + ' ' + t.slice(idx, idx + len)).trim();
}
const STOPWORDS = new Set('a,an,the,and,or,of,for,with,our,their,its,in,on,at,to,from,by,selling,sells,makes,making,offers,offering,including,like,such,as,plus,also,gentle,daily,small,online,shop,store,brand,company,business,we,is,are,that,which,into,your,you'.split(','));
function skinFacts(t) {
  if (!SKIN_RE.test(t)) return null;
  const found = [];
  SKIN_TYPES.forEach(st => { const re = new RegExp(st.re.source, 'g'); const m = re.exec(t); if (m) found.push({ variant: st.variant, container: st.container, index: m.index, len: m[0].length, phrase: phraseAt(t, m.index, m[0].length) }); });
  found.sort((a, b) => a.index - b.index);
  const spans = found.map(p => ({ from: p.index - (p.phrase.length - p.len), to: p.index + p.len }));
  const own = found.filter((p, i) => !found.some((q, j) => j !== i && q.variant !== p.variant && p.index >= spans[j].from && p.index < spans[j].to && q.phrase.length > p.phrase.length));
  return { products: own.length ? own : [{ variant: 'dropper', container: 'amber glass dropper bottle', index: 0, phrase: 'serum' }] };
}
const PANTRY_TYPES = [
  { re: /\b(hot sauces?|chil[ie] sauces?|sauces?|chil[ie] oils?)\b/, variant: 'woozy', noun: 'sauce bottle', dish: 'tacos' },
  { re: /\b(jams?|preserves|marmalades?|honey|nut butters?|peanut butter|salsas?|pickles|chutneys?|spreads?)\b/, variant: 'jar', noun: 'glass jar', dish: 'eggs' },
  { re: /\b(chocolates?|chocolate bars?|cacao)\b/, variant: 'bar', noun: 'chocolate bar', dish: 'generic' },
  { re: /\b(granola|coffee beans|tea blends|loose[- ]leaf teas?|snacks?|chips|crisps|jerky|trail mix|cookies|biscuits|crackers)\b/, variant: 'pouch', noun: 'stand-up pouch', dish: 'generic' },
  { re: /\b(spices?|spice blends?|rubs|seasonings?)\b/, variant: 'jar', noun: 'spice jar', dish: 'steak' },
  { re: /\b(olive oils?|oils|vinegars?)\b/, variant: 'tin', noun: 'tin', dish: 'salad' },
];
function pantryFacts(t) { let best = null; PANTRY_TYPES.forEach(pt => { const i = firstIndex(pt.re, t); if (i >= 0 && (!best || i < best.index)) { const m = new RegExp(pt.re.source).exec(t); best = Object.assign({ index: i, phrase: phraseAt(t, i, m[0].length) }, pt); } }); return best; }
const HOME_TYPES = [
  { re: /\bcandles?\b/, variant: 'candle' }, { re: /\b(mugs?|ceramics?|pottery|stoneware|tableware|bowls?)\b/, variant: 'mug' }, { re: /\b(vases?|planters?)\b/, variant: 'vase' },
];
function homeFacts(t) { let best = null; HOME_TYPES.forEach(ht => { const i = firstIndex(ht.re, t); if (i >= 0 && (!best || i < best.index)) best = { variant: ht.variant, index: i }; }); return best; }
const APPAREL_TYPES = [
  { re: /\b(hoodies?|sweatshirts?|crewnecks?)\b/, variant: 'hoodie', noun: 'hoodie' }, { re: /\b(t-?shirts?|tees)\b/, variant: 'tee', noun: 't-shirt' }, { re: /\b(denim|jeans)\b/, variant: 'jeans', noun: 'denim' },
  { re: /\b(sneakers?|trainers|shoes|footwear)\b/, variant: 'sneaker', noun: 'sneakers' }, { re: /\b(caps?|hats?|beanies?)\b/, variant: 'cap', noun: 'cap' }, { re: /\b(gowns?|dresses|dress|bridal|wedding dress\w*)\b/, variant: 'gown', noun: 'gown' },
  { re: /\b(jewell?ery|rings?|necklaces?|earrings?|bracelets?)\b/, variant: 'ring', noun: 'ring' }, { re: /\b(knitwear|sweaters?|jumpers?|cardigans?)\b/, variant: 'knit', noun: 'knitwear' }, { re: /\b(jackets?|coats?|outerwear)\b/, variant: 'hoodie', noun: 'jacket' },
];
function apparelFacts(t) { const found = []; APPAREL_TYPES.forEach(a => { const i = firstIndex(a.re, t); if (i >= 0) found.push({ variant: a.variant, noun: a.noun, index: i }); }); found.sort((a, b) => a.index - b.index); return found.length ? found : null; }
// menu items for hospitality: what is actually on the plate / in the cup
const MENU_TYPES = [
  { re: /\b(pasta|spaghetti|tagliatelle|gnocchi|ravioli)\b/, dish: 'pasta' }, { re: /\b(pizzas?|wood[- ]fired)\b/, dish: 'pizza' }, { re: /\b(sushi|sashimi|omakase)\b/, dish: 'sushi' },
  { re: /\b(ramen|noodles?|pho|udon)\b/, dish: 'ramen' }, { re: /\b(steaks?|steakhouse|grill)\b/, dish: 'steak' }, { re: /\b(burgers?)\b/, dish: 'burger' }, { re: /\b(tacos?|taqueria)\b/, dish: 'tacos' },
  { re: /\b(salads?|bowls?|vegan|plant[- ]based)\b/, dish: 'salad' }, { re: /\b(brunch|breakfast|eggs?)\b/, dish: 'eggs' },
];
function menuFacts(t) { const found = []; MENU_TYPES.forEach(m => { const i = firstIndex(m.re, t); if (i >= 0) found.push({ dish: m.dish, index: i }); }); found.sort((a, b) => a.index - b.index); return found.map(f => f.dish); }
function bakeFacts(t) { const i = { croissant: firstIndex(/\b(croissants?|pastr\w*|viennoiserie)\b/, t), cake: firstIndex(/\b(cakes?|cupcakes?|wedding cakes?)\b/, t), bread: firstIndex(/\b(breads?|sourdough|loaves|loaf|baguettes?)\b/, t) }; const k = Object.keys(i).filter(x => i[x] >= 0).sort((a, b) => i[a] - i[b]); return k; }
// one spelling per chilli: "fermented chilies", "chillies", "chiles", "hot peppers" -> chili
function chiliWords(t) {
  return String(t || '').replace(/\b(?:hot|chil(?:l)?i|chile) peppers?\b/g, 'chili')
    .replace(/\bchil(?:l)?ies\b|\bchil(?:l)?is\b|\bchiles\b|\bchile\b|\bchilli\b/g, 'chili')
    .replace(/\bghost peppers\b/g, 'ghost pepper').replace(/\bjalapenos\b/g, 'jalapeno').replace(/\bhabaneros\b/g, 'habanero');
}
// HEAT LEVELS are the names of a sauce's strengths ("three heat levels: mild, smoky and
// ghost pepper") -- labels for the bottles, not flavours and not ingredients.
const HEAT_WORDS = /^(mild|medium|hot|extra[- ]hot|very hot|x+hot|original|classic|smoky|fiery|insane|nuclear|ghost pepper|carolina reaper|reaper|habanero|scotch bonnet|jalapeno|green|red|chipotle|sweet heat|sweet|fire)$/;
function heatFacts(t) {
  const m = /\b(?:(?:one|two|three|four|five|\d)\s+)?(?:heat levels?|heats|spice levels?|levels? of heat|strengths)\b\s*(?::|-|,|\(|are|include|including|from)?\s*([^.;)]+)/.exec(t);
  const split = s => s.split(/,|\band\b|\bor\b|\bto\b|\//).map(x => x.replace(/[^a-z\s-]/g, ' ').trim().replace(/\s+/g, ' ')).filter(Boolean);
  let levels = null, span = null;
  if (m) { const items = split(m[1]).filter(x => x.split(' ').length <= 3); if (items.length >= 2) { levels = items; span = [m.index, m.index + m[0].length]; } }
  if (!levels) { // "in mild, medium and hot"
    const r = /\b(mild|medium|hot|extra[- ]hot)\b(?:\s*(?:,|and|or|to)\s*(?:mild|medium|hot|extra[- ]hot)\b){1,3}/.exec(t);
    if (r) { levels = split(r[0]); span = [r.index, r.index + r[0].length]; }
  }
  if (!levels) return null;
  return { levels: levels.slice(0, 4).map(l => l.split(' ').map(cap).join(' ')), span, named: levels.every(l => HEAT_WORDS.test(l)) };
}
// INGREDIENTS the owner says the product is made with ("made with fermented chilies")
const INGREDIENT_CLAUSE = /\b(?:made (?:with|from)|brewed with|packed with|using|infused with|blended with|with (?:real|fresh|fermented|local|organic|wild))\s+([^.;:]+)/g;
function ingredientFacts(t) {
  const out = []; let m; const re = new RegExp(INGREDIENT_CLAUSE.source, 'g'); const spans = [];
  while ((m = re.exec(t))) { spans.push([m.index, m.index + m[0].length]); const seg = m[0]; ART.FLAVOUR_KEYS.slice().sort((a, b) => b.length - a.length).forEach(k => { const i = seg.search(new RegExp(`\\b${k.replace(/ /g, '\\s')}\\b`)); if (i >= 0 && !out.some(o => o.key === k)) out.push({ key: k, index: m.index + i }); }); }
  out.sort((a, b) => a.index - b.index);
  return { list: out.map(o => o.key), spans };
}
const blank = (t, spans) => (spans || []).reduce((s, [a, b]) => s.slice(0, a) + ' '.repeat(b - a) + s.slice(b), t);
// flavours / named ingredients, in the order the owner lists them
function flavourFacts(t) {
  const keys = ART.FLAVOUR_KEYS.slice().sort((a, b) => b.length - a.length);
  const hits = [];
  keys.forEach(k => { const re = new RegExp(`\\b${k.replace(/ /g, '\\s')}\\b`); const m = re.exec(t); if (m && !hits.some(h => h.index <= m.index && h.index + h.key.length >= m.index + k.length)) hits.push({ key: k, index: m.index }); });
  hits.sort((a, b) => a.index - b.index);
  // one flavour can be named by two words ("habanero mango", "lemon ginger"): adjacent names are one flavour
  const merged = [];
  hits.forEach(h => { const prev = merged[merged.length - 1]; if (prev && /^\s+$/.test(t.slice(prev.end, h.index))) { prev.key += ` ${h.key}`; prev.end = h.index + h.key.length; } else merged.push({ key: h.key, index: h.index, end: h.index + h.key.length }); });
  return merged.map(h => (h.key === 'berries' ? 'berry' : h.key)).filter((k, i, a) => a.indexOf(k) === i).slice(0, 4);
}
// ---- software ----------------------------------------------------------------------------------------------------
const UI_TYPES = [
  { kind: 'schedule', re: /\b(schedul\w*|bookings?|appointments?|calendars?|reservations?|no-shows?)\b/ },
  { kind: 'monitor', re: /\b(monitor\w*|observability|uptime|alert\w*|incidents?|logs|logging|infrastructure|devops|on-call|latency|apis?)\b/ },
  { kind: 'ledger', re: /\b(invoic\w*|accounting|bookkeeping|billing|payroll|expenses?|payments?)\b/ },
  { kind: 'pipeline', re: /\b(crm|pipelines?|sales|leads|deals|project management|tasks|kanban)\b/ },
  { kind: 'inbox', re: /\b(support|help ?desk|tickets?|live chat|inbox|customer service)\b/ },
  { kind: 'docs', re: /\b(documents?|contracts?|forms|e-?sign\w*|ocr|extract\w*|pdfs?)\b/ },
  { kind: 'learning', re: /\b(courses?|lms|e-?learning|lessons|training platform)\b/ },
  { kind: 'store', re: /\b(e-?commerce|storefronts?|online stores?|shop builder|checkout|inventory)\b/ },
  { kind: 'editor', re: /\b(design tool|editor|whiteboard|canvas|content creation|video editing|website builder)\b/ },
  { kind: 'workflow', re: /\b(ai|automation|automate\w*|workflows?|agents?|integrations?)\b/ },
  { kind: 'analytics', re: /\b(analytics|dashboards?|reporting|insights|metrics|data)\b/ },
];
const SERVED = [
  { re: /\b(clinics?|physio\w*|dentists?|dental|chiropract\w*|patients?|practices?|therap\w*)\b/, served: 'clinic', audience: 'patients', art: 'treatment-room', services: ['Initial assessment', 'Follow-up', 'Treatment'] },
  { re: /\b(salons?|barbers?|spas?|stylists?|nail)\b/, served: 'salon', audience: 'clients', art: 'salon', services: ['Cut & style', 'Colour', 'Blow-dry'] },
  { re: /\b(restaurants?|cafes?|bars?|hospitality)\b/, served: 'restaurant', audience: 'guests', art: 'dining', services: ['Table for two', 'Table for four', 'Private dining'] },
  { re: /\b(gyms?|fitness|studios?|coaches|trainers)\b/, served: 'gym', audience: 'members', art: 'weights', services: ['Personal training', 'Group class', 'Assessment'] },
  { re: /\b(contractors?|trades\w*|plumbers?|electricians?|builders?|field service)\b/, served: 'trades', audience: 'customers', art: 'framing', services: ['Site visit', 'Quote', 'Job'] },
  { re: /\b(schools?|tutors?|teachers?|students?)\b/, served: 'school', audience: 'students', art: 'classroom', services: ['Lesson', 'Tutoring', 'Review'] },
];
function techFacts(t) {
  let best = null; UI_TYPES.forEach((u, order) => { const i = firstIndex(u.re, t); if (i >= 0 && (!best || order < best.order)) best = { kind: u.kind, order, index: i }; });
  const kind = best ? best.kind : 'analytics';
  let served = null; SERVED.forEach(s => { const i = firstIndex(s.re, t); if (i >= 0 && (!served || i < served.index)) served = Object.assign({ index: i }, s); });
  const items = kind === 'schedule' ? (served ? served.services : ['Appointment', 'Consultation', 'Follow-up'])
    : kind === 'monitor' ? ['api', 'web', 'worker', 'database', 'queue'] : null;
  return { ui: kind, audience: served ? served.audience : (kind === 'schedule' ? 'clients' : null), served: served ? served.served : null, servedArt: served ? served.art : null, items, reminders: /\bremind\w*\b/.test(t) };
}

// ---- facts ---------------------------------------------------------------------------------------------------------
// ctx: { categoryKey, name, text, ownOfferings[], offerings[], place, accent }
function factsFor(ctx) {
  const c = ctx || {};
  const t = plain(`${c.text || ''}. ${(c.ownOfferings || []).join(', ')}`);
  const f = { text: t, name: c.name || '', place: c.place || '', categoryKey: c.categoryKey || 'other', offers: (c.ownOfferings || []).filter(Boolean) };
  // three different kinds of information: heat levels (bottle labels), ingredients (what it is made with)
  // and flavours (the range) -- each read from its own part of the owner's words
  const tc = chiliWords(t);
  f.heat = heatFacts(tc);
  // a heat level's name ("ghost pepper") is a label wherever it appears -- also in the listed offerings
  const heatSpans = [];
  if (f.heat) { heatSpans.push(f.heat.span); f.heat.levels.forEach(l => { const re = new RegExp(`\\b${l.toLowerCase().replace(/[^a-z0-9 -]/g, '')}\\b`, 'g'); let m; while ((m = re.exec(tc))) heatSpans.push([m.index, m.index + m[0].length]); }); }
  const ing = ingredientFacts(blank(tc, heatSpans));
  f.ingredients = ing.list;
  f.flavours = flavourFacts(blank(tc, heatSpans.concat(ing.spans)));
  f.drink = drinkFacts(t);
  f.skin = f.drink ? null : skinFacts(t);
  f.pantry = f.drink || f.skin ? null : pantryFacts(t);
  f.home = homeFacts(t);
  f.apparel = apparelFacts(t);
  f.menu = menuFacts(t);
  f.bakes = bakeFacts(t);
  f.tech = c.categoryKey === 'tech' || /\b(software|saas|platform|app|apps)\b/.test(t) ? techFacts(t) : null;
  const unnamed = c.name ? t.split(plain(c.name)).join(' ') : t;
  f.facets = matchFacets(unnamed, f.categoryKey, plain((c.ownOfferings || []).join(', ')));
  f.noun = String(c.noun || '').trim();
  return f;
}

// ---- the facet library -------------------------------------------------------------------------------------------------
// id, cats (categories it belongs to; '*' = any), re (owner's words), roles it can fill,
// subject + shot (templates: {name} {inPlace} {phrase}), art (kind + params).
const F = (id, cats, re, roles, subject, shot, art) => ({ id, cats, re, roles, subject, shot, art });
const FACETS = [
  // landscaping: maintenance vs construction
  F('mowing', ['landscaping'], /\b(mow\w*|lawn care|lawn maintenance|lawns?|grass cutting|turf care)\b/, ['lead', 'context'], 'a freshly mowed striped lawn', 'A freshly mowed lawn with crisp diagonal stripes in front of a family home{inPlace}, a walk-behind mower parked at the edge, clean edges along the path, bright morning sun, eye-level wide view', { kind: 'lawn-mowing' }),
  F('edging', ['landscaping'], /\b(edg(?:e|es|ing)|trimming|string trimm\w*)\b/, ['detail', 'context'], 'a crisp edge cut along a garden bed', 'A string trimmer cutting a razor-straight edge where lawn meets a dark mulched bed, fresh clippings in the air, low close-up at ground level, morning light raking across the grass', { kind: 'edging' }),
  F('aeration', ['landscaping'], /\b(aerat\w*|overseed\w*|fertili[sz]\w*|weed control|top ?dressing)\b/, ['detail', 'context'], 'core aeration plugs across the lawn', 'Neat rows of soil cores pulled from a green lawn after core aeration, a sprinkler arcing water in the background, low angle, soft morning light', { kind: 'aeration' }),
  F('cleanup', ['landscaping'], /\b(clean[- ]?ups?|leaf removal|leaves|fall clean\w*|spring clean\w*|yard clean\w*)\b/, ['context', 'detail'], 'a seasonal leaf cleanup', 'A rake gathering a pile of orange and red autumn leaves on a green lawn during a yard cleanup, leaves scattered, warm late-afternoon light, mid-shot', { kind: 'leaf-cleanup' }),
  F('hedges', ['landscaping'], /\b(hedg\w*|shrub trimm\w*|prun\w*|topiary)\b/, ['detail', 'context'], 'freshly clipped hedges', 'Freshly clipped boxwood hedges with sharp square edges lining a lawn, a pair of hedge shears resting on top, clear daylight', { kind: 'hedge' }),
  F('patio', ['landscaping', 'renovation'], /\b(patios?|pavers?|interlock\w*|flagstone|hardscap\w*|stonework)\b/, ['lead', 'detail'], 'a finished natural-stone patio', 'A finished natural-stone patio{inPlace} at golden hour, tight joints between the flagstones, a low fire pit and two chairs, planting softening the edges, wide view', { kind: 'patio', byRole: { detail: 'paver-laying', context: 'paver-laying' }, text: { detail: ['flagstones being set in the sand bed', 'Flagstones being set into a levelled sand bed with a rubber mallet and a spirit level, joints tight and even, low close-up, soft daylight'], context: ['the patio being built', 'A landscaper setting a large flagstone into a bed of screenings with a rubber mallet, work in progress, low three-quarter view, soft daylight'] } }),
  F('retaining', ['landscaping'], /\b(retaining walls?|stone walls?|garden walls?)\b/, ['lead', 'detail', 'context'], 'a stacked-stone retaining wall', 'A new stacked-stone retaining wall with a clean cap row holding back a planted terrace, crisp mortar-free joints, grasses and perennials above it, soft daylight, three-quarter view', { kind: 'retaining-wall' }),
  F('planting', ['landscaping', 'nonprofit'], /\b(planting|plantings|garden beds?|perennials?|shrubs?|flower beds?|native plants?|gardens?)\b/, ['detail', 'context'], 'fresh planting in a mulched bed', 'Fresh perennials, ornamental grasses and flowering shrubs planted into a dark mulched bed, stepping stones at the edge, dew on the leaves, close three-quarter view', { kind: 'planting-bed' }),
  F('pergola', ['landscaping', 'renovation'], /\b(pergolas?|decks?|outdoor living|gazebos?)\b/, ['lead', 'context'], 'a cedar pergola over the patio', 'A cedar pergola over a paved patio with outdoor chairs, warm evening light through the slats, wide view', { kind: 'pergola' }),
  F('firepit', ['landscaping'], /\b(fire ?pits?|outdoor kitchens?|fireplaces?)\b/, ['context', 'lead'], 'a stone fire pit at dusk', 'A round stone fire pit glowing at dusk on a paved patio, chairs around it and string lights overhead, cosy evening light', { kind: 'fire-pit' }),
  F('pathway', ['landscaping'], /\b(walkways?|pathways?|garden paths?|paths)\b/, ['detail', 'context'], 'a flagstone garden path', 'A curving flagstone path through a planted garden, lawn on either side, golden-hour light, eye-level view down the path', { kind: 'garden-path' }),
  F('irrigation', ['landscaping'], /\b(irrigation|sprinklers?|drip lines?)\b/, ['detail'], 'sprinklers watering the lawn', 'Pop-up sprinklers arcing fine water over a striped lawn, droplets catching the morning sun, low angle', { kind: 'irrigation' }),
  // roofing
  F('shingles', ['roofing'], /\b(shingles?|asphalt|architectural)\b/, ['detail'], 'new architectural shingles and flashing', 'Close-up of freshly installed architectural shingles in neat staggered rows with clean metal flashing along a valley, crisp shadows, overcast daylight', { kind: 'shingles' }),
  F('metal-roof', ['roofing'], /\b(metal roof\w*|standing seam)\b/, ['lead', 'detail'], 'a standing-seam metal roof', 'A family home{inPlace} with a new standing-seam metal roof, straight seams catching the light, clear blue sky, three-quarter view', { kind: 'roof-house', params: { colour: '#6b7f8f' } }),
  F('roof-repair', ['roofing'], /\b(repairs?|leaks?|storm damage|inspections?)\b/, ['context'], 'a roof repair in progress', 'A ladder against the eave of a house during a roof repair, a bundle of shingles and a tool bag on the roof, bright sky', { kind: 'roof-ladder' }),
  F('gutters', ['roofing'], /\b(gutters?|eavestroughs?|downspouts?)\b/, ['detail', 'context'], 'new seamless gutters along the eave', 'New seamless aluminium gutters running along the eave of a house, a ladder resting nearby, clear daylight', { kind: 'roof-ladder' }),
  F('replacement', ['roofing'], /\b(roof replacement|re-?roof\w*|new roofs?)\b/, ['lead'], 'a newly replaced roof', 'A family home{inPlace} with a newly replaced roof, clean ridge line and fresh shingles, clear sky, three-quarter view', { kind: 'roof-house' }),
  // painting
  F('interior-paint', ['painting'], /\b(interior|rooms?|walls?|ceilings?)\b/, ['lead'], 'a freshly painted living room', 'A freshly painted living room with crisp walls and bright white trim, furniture back in place, soft afternoon light through the window, wide view', { kind: 'painted-room' }),
  F('exterior-paint', ['painting'], /\b(exteriors?|siding|house painting|decks?)\b/, ['lead', 'context'], 'a freshly painted house exterior', 'A house exterior with freshly painted siding and trim, a ladder against the wall and a paint can on the grass, clear daylight, three-quarter view', { kind: 'house-paint' }),
  F('cabinets', ['painting', 'renovation'], /\b(cabinets?|cabinetry|kitchen cabinets?)\b/, ['detail', 'context'], 'freshly painted kitchen cabinets', 'A kitchen with freshly painted shaker cabinets, new brass pulls and a clean counter, soft natural light', { kind: 'kitchen' }),
  F('trim', ['painting'], /\b(trim|cutting in|baseboards?|detail work)\b/, ['detail'], 'a brush cutting a clean line', 'A paint brush cutting a perfectly straight line where the wall meets white trim, masking tape along the edge, macro', { kind: 'cutting-in' }),
  F('colour', ['painting'], /\b(colou?r consult\w*|colou?rs?|swatches?)\b/, ['detail', 'context'], 'paint colours and a loaded roller', 'An open paint can, a loaded roller in a tray and colour swatches on a drop cloth, overhead three-quarter view, soft light', { kind: 'paint-tray' }),
  // plumbing
  F('bathroom', ['plumbing', 'renovation'], /\b(bathrooms?|showers?|baths?|vanit\w*)\b/, ['lead', 'context'], 'a finished bathroom', 'A finished modern bathroom with a walk-in glass shower, a floating vanity and new chrome fixtures, clean tile, soft daylight, wide view', { kind: 'bathroom' }),
  F('fixtures', ['plumbing'], /\b(faucets?|taps?|fixtures?|sinks?|leaks?|toilets?)\b/, ['detail'], 'a new faucet running into the basin', 'A new chrome faucet with water running into a white basin, tile behind, macro with a clean highlight on the spout', { kind: 'faucet' }),
  F('pipework', ['plumbing'], /\b(pip(?:es|ing|ework)|re-?pip\w*|drains?|sewer|valves?)\b/, ['detail', 'context'], 'copper pipework and a valve', 'Neat new copper pipework with soldered elbows and a quarter-turn valve, an adjustable wrench resting on the pipe, close-up, workshop light', { kind: 'pipes' }),
  F('water-heater', ['plumbing'], /\b(water heaters?|hot water|boilers?|tankless)\b/, ['detail', 'context'], 'a new water heater', 'A newly installed water heater with insulated hot and cold lines in a clean utility room, even light', { kind: 'water-heater' }),
  // electrical
  F('lighting', ['electrical'], /\b(lighting|lights?|pot lights?|recessed|fixtures?|pendants?)\b/, ['lead', 'detail'], 'a room glowing with new lighting', 'A living room{inPlace} glowing with new pendant and recessed lighting at dusk, warm pools of light on the walls, wide view', { kind: 'lit-room' }),
  F('panel', ['electrical'], /\b(panels?|breakers?|upgrades?|service upgrade)\b/, ['detail'], 'a neatly wired electrical panel', 'A neatly wired electrical panel with labelled breakers and tidy cable runs, close-up, even light', { kind: 'panel' }),
  F('outlets', ['electrical'], /\b(outlets?|wiring|rewir\w*|switches?|receptacles?)\b/, ['detail', 'context'], 'new outlets and switches', 'New white outlet and switch plates on a freshly painted wall, square and level, soft side light, close-up', { kind: 'outlets' }),
  F('ev', ['electrical', 'automotive'], /\b(ev chargers?|ev charging|electric vehicles?|car chargers?)\b/, ['detail', 'context'], 'a wall-mounted EV charger', 'A wall-mounted EV charger in a clean garage with the cable plugged into an electric car, even light, three-quarter view', { kind: 'ev-charger' }),
  // cleaning
  F('home-clean', ['cleaning'], /\b(homes?|houses?|residential|apartments?|condos?)\b/, ['lead'], 'a spotless sunlit living room', 'A spotless, sunlit living room after a deep clean, plumped cushions, gleaming floors and a clear coffee table, wide view', { kind: 'clean-room' }),
  F('kitchen-clean', ['cleaning'], /\b(kitchens?|counters?|countertops?|surfaces?)\b/, ['detail'], 'a gleaming countertop being wiped', 'A microfiber cloth and spray bottle on a gleaming kitchen countertop, streak-free shine, macro', { kind: 'spray-shine' }),
  F('deep-clean', ['cleaning'], /\b(deep clean\w*|move[- ](?:in|out)|end of lease|spring clean\w*)\b/, ['context'], 'a cleaning caddy ready to go', 'A cleaning caddy with spray bottles, brushes and folded cloths set down in a bright kitchen, mid-shot', { kind: 'caddy' }),
  F('carpet', ['cleaning'], /\b(carpets?|rugs?|upholstery|vacuum\w*)\b/, ['context', 'detail'], 'a vacuum on a freshly cleaned rug', 'An upright vacuum on a freshly cleaned rug in a bright living room, clean lines in the pile, mid-shot', { kind: 'vacuum' }),
  F('office-clean', ['cleaning'], /\b(offices?|commercial|workplaces?|janitorial)\b/, ['lead', 'context'], 'a clean, bright office', 'A clean, bright office with tidy desks and a clear floor at the end of the day, wide view', { kind: 'office' }),
  // renovation
  F('kitchen-reno', ['renovation'], /\b(kitchens?)\b/, ['lead'], 'a finished renovated kitchen', 'A finished renovated kitchen with a stone island, new cabinetry and pendant lights, natural light, wide view', { kind: 'kitchen' }),
  F('basement', ['renovation'], /\b(basements?|additions?|framing|structural)\b/, ['context'], 'fresh framing mid-renovation', 'A room mid-renovation with fresh timber framing, a cordless drill on a sawhorse and sawdust on the floor, work light, wide view', { kind: 'framing' }),
  F('tile', ['renovation', 'plumbing'], /\b(til(?:e|es|ing)|backsplash\w*)\b/, ['detail'], 'freshly laid tile', 'Freshly laid tile with even grout lines and spacers still in place above a cabinet run, close-up', { kind: 'tile-detail' }),
  F('joinery', ['renovation', 'creative'], /\b(joinery|carpentry|millwork|built-?ins?|woodwork\w*|dovetail\w*)\b/, ['detail'], 'precise cabinet joinery', 'A macro of precise hand-cut dovetail joinery in oak, a pencil resting on the board, raking workshop light', { kind: 'joinery' }),
  // automotive
  F('detailing', ['automotive'], /\b(detail\w*|ceramic coating|paint correction|polish\w*|ppf|wax\w*)\b/, ['lead', 'detail'], 'a freshly detailed car', 'A freshly detailed car in a dark studio bay, deep glossy paint reflecting long overhead light strips like a mirror, low three-quarter view', { kind: 'car-shine' }),
  F('polisher', ['automotive'], /\b(paint correction|polish\w*|swirl\w*|buff\w*)\b/, ['detail'], 'a polisher correcting paint', 'A dual-action polisher correcting paint on a car panel, swirl marks disappearing into a mirror finish, macro', { kind: 'polisher' }),
  F('wheels', ['automotive'], /\b(wheels?|rims?|tyres?|tires?)\b/, ['detail', 'context'], 'a clean alloy wheel', 'A freshly cleaned alloy wheel and tyre, dressed rubber and a spotless brake caliper, close-up, studio light', { kind: 'rim' }),
  F('repair', ['automotive'], /\b(repairs?|brakes?|oil changes?|diagnostics?|mechanic\w*|servic\w*|maintenance)\b/, ['lead', 'context'], 'a car on the lift in the bay', 'A car raised on a two-post lift in a clean garage bay{inPlace}, tools on the wall, bright work lights, wide view', { kind: 'car-lift' }),
  F('parts', ['automotive'], /\b(parts|engines?|transmissions?|clutch\w*)\b/, ['detail'], 'engine parts on the bench', 'Engine parts, gears and a spark plug laid out on a workbench beside a torque wrench, macro, workshop light', { kind: 'engine-parts' }),
  // wellness & care
  F('rehab', ['wellness'], /\b(rehab\w*|sports injur\w*|injur\w*|exercise\w*|mobility|strength(?:ening)?|post[- ]surg\w*|recovery)\b/, ['detail', 'context'], 'resistance-band recovery exercise', 'A resistance band, foam roller and light dumbbell set out on an exercise mat in a bright clinic, ready for a guided rehab session, three-quarter view, soft daylight', { kind: 'exercise-kit' }),
  F('manual-therapy', ['wellness'], /\b(manual therapy|hands-on|massage therap\w*|treatment tables?|chiropract\w*|osteopath\w*)\b/, ['lead'], 'the treatment room ready for a session', 'A bright treatment room with a padded treatment table, a fresh pillow cover, resistance bands on a hook and a window of morning light, wide view', { kind: 'treatment-room' }),
  F('needling', ['wellness'], /\b(dry needling|acupuncture|needles?)\b/, ['detail'], 'dry needling tray', 'A sterile tray of fine acupuncture needles with a folded towel on a clinic trolley, macro, clean even light', { kind: 'needles' }),
  F('massage', ['wellness'], /\b(massage|hot stones?|aromatherapy|facials?|body treatments?)\b/, ['detail', 'context'], 'warm stones, oil and towels', 'Warm basalt stones stacked beside a bottle of massage oil and rolled towels on a wooden tray, macro, warm soft light', { kind: 'spa' }),
  F('hair', ['wellness'], /\b(hair|haircuts?|cuts|colou?r|stylists?|salons?|barber\w*)\b/, ['lead', 'detail'], 'the salon chairs and mirrors', 'A bright salon with styling chairs facing round mirrors, a tidy product shelf and warm bulbs, wide view', { kind: 'salon' }),
  F('salon-tools', ['wellness'], /\b(haircuts?|cuts|trims?|barber\w*|styling)\b/, ['detail'], 'shears and a comb', 'Hairdressing shears and a fine comb on a clean counter beside a styling product, macro', { kind: 'salon-tools' }),
  F('nails', ['wellness'], /\b(nails?|manicures?|pedicures?|gel polish)\b/, ['detail'], 'nail polish bottles', 'A row of nail polish bottles in a curated palette on a manicure table, macro, soft light', { kind: 'nails' }),
  F('dental', ['wellness'], /\b(dental|dentists?|teeth|whitening|hygiene|orthodont\w*)\b/, ['detail', 'lead'], 'bright dental care', 'A clean, bright dental treatment room with the chair and a tray of instruments, calm light, wide view', { kind: 'dental' }),
  // fitness
  F('boxing', ['fitness'], /\b(boxing|kickboxing|muay thai|mma|sparring)\b/, ['lead'], 'the heavy bag and gloves', 'A heavy bag hanging under hard top light in a gritty gym, red gloves resting on the bench below, dramatic contrast', { kind: 'boxing' }),
  F('wraps', ['fitness'], /\b(boxing|sparring|pads|wraps)\b/, ['detail'], 'hand wraps and gloves', 'Hand wraps rolled beside a pair of red boxing gloves on a bench, macro, hard light', { kind: 'wraps' }),
  F('pilates', ['fitness', 'wellness'], /\b(pilates|reformers?)\b/, ['lead', 'context'], 'reformers in the studio', 'A calm studio with pilates reformers lined up on pale wood floors, a mirror wall and soft morning light, wide view', { kind: 'reformer' }),
  F('yoga', ['fitness', 'wellness'], /\b(yoga|meditation|breathwork|stretch\w*)\b/, ['lead', 'detail', 'context'], 'mats laid out in the studio', 'Yoga mats laid out in a quiet studio with plants and daylight, blocks and straps beside them, wide view', { kind: 'yoga' }),
  F('strength', ['fitness'], /\b(strength|weights?|barbells?|powerlift\w*|weightlift\w*|olympic lifting|personal training)\b/, ['lead', 'detail'], 'a loaded barbell and weights', 'A loaded barbell on the platform with kettlebells and dumbbells nearby, chalk on the knurling, hard gym light', { kind: 'weights' }),
  F('kettlebell', ['fitness'], /\b(kettlebells?|hiit|conditioning|circuits?|bootcamps?)\b/, ['detail', 'context'], 'a row of kettlebells', 'A row of kettlebells in graduated weights on a rubber floor, low angle, gym light', { kind: 'kettlebells' }),
  // real estate
  F('homes', ['realestate'], /\b(homes?|houses?|family homes?|single[- ]family|buyers?|sellers?)\b/, ['lead'], 'a home exterior at dusk', 'A welcoming family home{inPlace} at dusk, warm light in every window, a landscaped front walk, three-quarter view', { kind: 'house-dusk' }),
  F('condos', ['realestate'], /\b(condos?|apartments?|lofts?|penthouses?|downtown)\b/, ['lead', 'detail'], 'a condo living room with a city view', 'A condo living room with floor-to-ceiling windows over the city{inPlace} at blue hour, designer furniture, wide view', { kind: 'living-room', params: { variant: 'city' } }),
  F('staging', ['realestate'], /\b(staging|interiors?|kitchens?|open houses?)\b/, ['detail'], 'a bright staged kitchen', 'A bright staged kitchen with an island, pendant lights and flowers on the counter, natural light', { kind: 'kitchen' }),
  F('keys', ['realestate'], /\b(keys|closings?|first[- ]time buyers?|move[- ]in)\b/, ['context'], 'house keys on a tag', 'A set of house keys on a brass ring with a house-shaped tag, resting on a hallway table, soft evening light, macro', { kind: 'keys' }),
  F('neighbourhood', ['realestate'], /\b(neighbou?rhoods?|communit\w*|streets?|towns?)\b/, ['context'], 'the neighbourhood street', 'A tree-lined neighbourhood street{inPlace} with townhouses and cafés at golden hour, eye level', { kind: 'street' }),
  // money & advice
  F('tax', ['finance'], /\b(tax\w*|accounting|bookkeeping|payroll|returns?)\b/, ['lead', 'detail'], 'organised financial documents', 'Neatly organised financial documents, a calculator and a fountain pen on a clean desk, soft window light, three-quarter overhead view', { kind: 'desk-docs', params: { variant: 'finance' } }),
  F('retirement', ['finance'], /\b(retirement|pensions?|investments?|wealth|savings?|portfolios?)\b/, ['detail', 'context'], 'a long-term plan on paper', 'A planning document with a long-term growth line sketched by hand beside a pen and a cup of coffee, soft daylight, close-up', { kind: 'desk-docs', params: { variant: 'finance' } }),
  F('mortgage', ['finance', 'realestate'], /\b(mortgages?|home loans?|insurance)\b/, ['context'], 'the family home the plan protects', 'A family home at dusk with warm lights in the windows, the future the planning is for, three-quarter view', { kind: 'house-dusk' }),
  F('legal-docs', ['professional'], /\b(contracts?|wills?|estates?|agreements?|leases?|conveyancing)\b/, ['detail'], 'a contract being signed', 'A contract on a walnut desk with a fountain pen resting on the signature line, close-up, warm office light', { kind: 'desk-docs', params: { variant: 'contract' } }),
  F('law-library', ['professional'], /\b(law|legal|litigation|counsel|attorneys?|lawyers?|solicitors?)\b/, ['context'], 'law books in the library', 'Shelves of law books in a quiet library, a reading lamp glowing, warm light', { kind: 'library' }),
  F('workshop', ['professional'], /\b(workshops?|strategy|planning sessions?|facilitation|consult\w*)\b/, ['detail'], 'a workshop wall of sticky notes', 'A whiteboard covered in grouped sticky notes and arrows from a strategy workshop, a marker resting on the ledge, close-up', { kind: 'sticky-wall' }),
  F('meeting', ['professional', 'finance'], /\b(meetings?|advisory|coaching|recruit\w*|hr|teams?)\b/, ['lead', 'context'], 'a working session around the table', 'A working session around a table with laptops, notebooks and coffee, seen from above, bright office light', { kind: 'team-table' }),
  // learning
  F('maths', ['education'], /\b(math\w*|algebra|calculus|numeracy|sat|act|exam prep|test prep)\b/, ['lead', 'detail'], 'a worked maths problem on the desk', 'A notebook open to a neatly worked algebra problem, pencils and a textbook beside it on a bright study desk, overhead three-quarter view', { kind: 'study-desk', params: { variant: 'math' } }),
  F('reading', ['education'], /\b(reading|literacy|english|writing|essays?|phonics|languages?)\b/, ['lead', 'detail'], 'books and notes on the desk', 'A stack of books, handwritten notes and sharpened pencils on a bright study desk, soft daylight, three-quarter view', { kind: 'books' }),
  F('piano', ['education', 'creative'], /\b(piano|keys lessons|keyboard lessons)\b/, ['lead', 'detail'], 'a piano keyboard', 'Piano keys in soft side light, sheet music on the stand, close-up', { kind: 'music', params: { variant: 'piano' } }),
  F('guitar', ['education', 'creative'], /\b(guitars?|music lessons?|ukuleles?)\b/, ['lead', 'detail'], 'an acoustic guitar', 'An acoustic guitar resting on a stand in a sunny music room, warm wood grain, three-quarter view', { kind: 'music', params: { variant: 'guitar' } }),
  // creative
  F('photo', ['creative'], /\b(photograph\w*|photo shoots?|portraits?|headshots?)\b/, ['lead'], 'a camera and light on set', 'A camera on a tripod facing a softbox-lit studio set, cables across the floor, behind-the-scenes view', { kind: 'camera-set' }),
  F('prints', ['creative'], /\b(prints?|albums?|galleries|framing|editing)\b/, ['detail'], 'prints spread on the light table', 'A spread of printed photographs on a light table with a loupe resting on top, overhead view', { kind: 'prints' }),
  F('branding', ['creative', 'professional'], /\b(branding|brand identity|logos?|identity|graphic design|packaging design)\b/, ['lead', 'detail'], 'a moodboard of the brand work', 'A studio moodboard of type specimens, colour chips and sketches pinned to cork, a swatch fan in front, daylight', { kind: 'moodboard' }),
  F('illustration', ['creative'], /\b(illustrat\w*|sketch\w*|drawings?|murals?)\b/, ['detail', 'lead'], 'a sketchbook and swatches', 'An open sketchbook with pencil studies beside a fan of colour swatches on a desk, overhead view, soft daylight', { kind: 'sketch-desk' }),
  F('interior-design', ['creative', 'realestate'], /\b(interior design\w*|home staging|decorat\w*)\b/, ['lead', 'detail'], 'a styled living room', 'A styled living room with layered textiles, a statement lamp and art on the wall, soft afternoon light, wide view', { kind: 'living-room' }),
  // community
  F('food-bank', ['nonprofit'], /\b(food banks?|meals?|hunger|groceries|pantr\w*|produce)\b/, ['lead', 'detail'], 'a crate of fresh produce', 'A wooden crate of fresh donated produce -- apples, citrus and greens -- on a folding table, close three-quarter view, natural light', { kind: 'produce-crate' }),
  F('environment', ['nonprofit'], /\b(tree planting|trees|environment\w*|restoration|conservation|climate|greening)\b/, ['detail', 'context'], 'seedlings planted in fresh soil', 'Young seedlings just planted in rich dark soil with a trowel beside them, low close-up, soft daylight', { kind: 'seedling' }),
  F('gathering', ['nonprofit', 'hospitality'], /\b(community (?:meals?|events?|dinners?)|gatherings?|volunteers?|events?)\b/, ['context', 'lead'], 'a long table set for the community', 'A long table set outdoors for a community meal, string lights overhead and flowers in the middle, golden hour, wide view', { kind: 'community-table' }),
  F('animals', ['nonprofit', '*'], /\b(animal rescue|shelters?|adopt\w*|dogs?|puppies|pets?|grooming|dog walk\w*|pet sitt\w*)\b/, ['lead', 'detail', 'context'], 'a happy dog', 'A happy, well-groomed dog sitting on a clean floor with a new collar, eye level, soft natural light', { kind: 'dog', byRole: { detail: 'dog:walk', context: 'dog:walk' }, text: { detail: ['a dog out on a walk', 'A happy dog trotting along a park path on a lead, the walker out of frame, bright morning light, low eye-level view'], context: ['a dog out on a walk', 'A happy dog trotting along a park path on a lead, the walker out of frame, bright morning light, low eye-level view'] } }),
  // unusual businesses ('other' and anything else)
  F('sailing', ['*', 'education'], /\b(sailing|sailboats?|sail lessons|dinghy|dinghies|regattas?|yacht club)\b/, ['lead', 'detail'], 'a sailboat under way', 'A small sailboat heeling gently under a full mainsail on bright blue water{inPlace}, a second boat in the distance, clear daylight, wide view from the water', { kind: 'sailboat', byRole: { detail: 'rope-cleat' }, text: { detail: ['a line made fast on a deck cleat', 'A mooring line coiled and made fast on a stainless deck cleat, weathered teak underneath, bright sun, close overhead view'] } }),
  F('paddling', ['*', 'fitness'], /\b(kayak\w*|canoe\w*|paddle ?board\w*|stand[- ]up paddl\w*|sup boards?)\b/, ['lead', 'detail', 'context'], 'kayaks and a paddleboard on the water', 'Two sit-in kayaks and a stand-up paddleboard on a calm lake{inPlace}, paddles resting across them, bright morning light, wide view from the shore', { kind: 'kayaks', byRole: { detail: 'kayaks:shore', context: 'kayaks:shore' }, text: { detail: ['kayaks pulled up on the shore', 'Two kayaks pulled up on a sandy shore with their paddles laid beside them, the lake behind, golden light, low three-quarter view'], context: ['kayaks pulled up on the shore', 'Two kayaks pulled up on a sandy shore with their paddles laid beside them, the lake behind, golden light, low three-quarter view'] } }),
  F('boat', ['*'], /\b(boats?|charters?|cruises?|yachts?|boat tours?|ferr(?:y|ies))\b/, ['lead', 'context'], 'a charter boat on the water', 'A charter boat on calm water at golden hour{inPlace}, gentle wake behind it, wide view from the water', { kind: 'boat' }),
  F('sunset-cruise', ['*'], /\b(sunset|evening|dusk) (?:boat |harbou?r )?(?:tours?|cruises?|sails?|trips?)\b/, ['context', 'lead'], 'guests on deck at sunset', 'Guests seen from behind on the deck of a small boat at sunset{inPlace}, deck lights coming on, calm water, warm golden light', { kind: 'boat-dusk' }),
  F('fishing', ['*'], /\b(fishing|anglers?|angling|fly fishing|tackle)\b/, ['detail', 'lead'], 'rods, reels and tackle on the dock', 'A fishing rod, reel and an open tackle box on a wooden dock by the water, late-afternoon light, close three-quarter view', { kind: 'fishing' }),
  F('cycling', ['*', 'fitness'], /\b(bikes?|bicycles?|cycling|e-?bikes?|bike repairs?)\b/, ['lead', 'detail'], 'a bicycle ready to ride', 'A clean, well-tuned bicycle leaning in soft daylight on a quiet street, three-quarter view', { kind: 'bicycle', byRole: { detail: 'bicycle:stand' }, text: { detail: ['a bike on the workstand', 'A bicycle clamped in a workshop repair stand, a pegboard of tools behind, bright even light, three-quarter view'] } }),
  // what a florist actually offers, when the owner says so: the installations, the delivery, the workshop, the wreaths
  F('flower-arch', ['*', 'hospitality'], /\b(ceremony arch\w*|floral arch\w*|flower arch\w*|wedding arch\w*|arbou?rs?|floral installations?|flower walls?)\b/, ['lead', 'detail', 'context'], 'a floral ceremony arch', 'A ceremony arch dressed in fresh flowers and trailing greenery at the end of a garden aisle{inPlace}, rows of chairs either side, golden light, wide view down the aisle', { kind: 'ceremony-arch' }),
  F('flower-delivery', ['*'], /\b(deliver(?:y|ies|ing|s)?\s+(?:[a-z-]+\s+){0,3}?(?:flowers?|bouquets?|blooms)|(?:flowers?|bouquets?|blooms)\s+(?:[a-z-]+\s+){0,3}?deliver\w*)\b/, ['lead', 'detail', 'context'], 'a bouquet delivered to the door', 'A hand-tied bouquet standing in its open delivery box on a front step, a handwritten tag on the ribbon, soft morning light, eye level', { kind: 'bouquet-delivery' }),
  F('flower-workshop', ['*', 'education'], /\b((?:flower|floral)[- ]arranging (?:workshops?|classes|lessons)|floristry (?:workshops?|classes|courses?)|(?:flower|floral|wreath|bouquet)[- ](?:making )?(?:workshops?|classes))\b/, ['lead', 'detail', 'context'], 'a flower-arranging workshop table', 'A long workshop table from above, places set with vases, loose stems, scissors and twine, hands arranging flowers at one place, bright daylight', { kind: 'flower-workshop' }),
  F('wreaths', ['*'], /\b(wreaths?|dried flowers?|dried flower wreaths?)\b/, ['lead', 'detail', 'context'], 'a dried-flower wreath on the door', 'A dried-flower wreath of muted stems and seed heads hung on a painted door by a linen ribbon, soft side light, straight on', { kind: 'wreath' }),
  F('flowers', ['*'], /\b(florists?|flowers?|bouquets?|floral\w*|arrangements?)\b/, ['lead', 'detail'], 'a fresh bouquet', 'A fresh hand-tied bouquet of garden roses and greenery wrapped in kraft paper, soft window light, three-quarter view', { kind: 'bouquet', byRole: { detail: 'flower-buckets', context: 'flower-buckets' }, text: { detail: ['fresh stems in buckets at the bench', 'Zinc buckets of fresh stems -- roses, ranunculus and eucalyptus -- on the florist\'s bench beside shears and a spool of twine, soft window light'], context: ['fresh stems in buckets at the bench', 'Zinc buckets of fresh stems -- roses, ranunculus and eucalyptus -- on the florist\'s bench beside shears and a spool of twine, soft window light'] } }),
  F('stationery', ['*', 'creative'], /\b(stationery|invitations?|letterpress|greeting cards|cards|wedding suites?|calligraph\w*|printing)\b/, ['lead', 'detail'], 'invitations and envelopes', 'Letterpress invitation cards, an envelope with a wax seal and a sprig of greenery on linen, overhead view, soft daylight', { kind: 'stationery', byRole: { detail: 'stationery-detail' }, text: { detail: ['the wax-sealed invitation up close', 'A close-up of a pressed wax seal closing a letterpress invitation envelope in cotton paper, a silk ribbon and a calligraphy nib beside it, soft raking light'] } }),
  F('events', ['*', 'hospitality'], /\b(weddings?|events?|parties|celebrations?|receptions?|catering)\b/, ['context'], 'the {phraseOne} table under string lights', 'A long {phraseOne} table set under string lights, flowers and candles down the middle, place cards at each setting, dusk, wide view', { kind: 'event-lights' }),
  F('moving', ['*'], /\b(moving|movers|removals?|relocation\w*|storage)\b/, ['lead', 'detail'], 'packed moving boxes', 'Neatly packed and labelled moving boxes stacked in a bright empty room, three-quarter view', { kind: 'moving' }),
  F('travel', ['*'], /\b(travel|travel agenc\w*|getaways?|holidays?|vacations?|trip planning)\b/, ['detail', 'context'], 'a packed suitcase', 'A packed suitcase by the door with a coffee cup nearby, soft morning light, three-quarter view', { kind: 'travel' }),
  F('sewing', ['*', 'fashion'], /\b(tailor\w*|alterations?|sewing|seamstress\w*|upholster\w*|hemming)\b/, ['lead', 'detail', 'context'], 'a sewing machine at work', 'A sewing machine with fabric under the needle in a bright workroom, macro three-quarter view', { kind: 'sewing', byRole: { detail: 'fabric' }, text: { detail: ['a seam pinned and chalk-marked', 'A seam pinned and chalk-marked on suiting fabric, a tape measure and scissors beside it, macro, soft light'] } }),
  F('solar', ['*', 'electrical'], /\b(solar|panels installation|renewable\w*)\b/, ['lead', 'detail'], 'solar panels on a roof', 'Rows of solar panels on a pitched roof under a clear sky, crisp reflections, three-quarter view', { kind: 'solar' }),
  F('pottery', ['*', 'creative'], /\b(pottery|ceramics? classes|wheel throwing|kilns?)\b/, ['detail', 'lead'], 'a pot on the wheel', 'A freshly thrown pot on the wheel in a clay studio, tools and finished pieces on the shelf behind, warm light', { kind: 'workbench', params: { variant: 'pottery' } }),
  F('cakes', ['*', 'hospitality'], /\b(custom cakes?|wedding cakes?|cakes?|cupcakes?)\b/, ['lead', 'detail'], 'a tiered celebration cake', 'A tiered celebration cake with piped icing and fresh berries on a stand, soft window light, three-quarter view', { kind: 'bakery', params: { variant: 'cake' } }),
  F('music', ['*'], /\b(music|musicians?|recording studios?|recording)\b/, ['detail'], 'an acoustic guitar', 'An acoustic guitar on a stand in a warm room, three-quarter view', { kind: 'music', params: { variant: 'guitar' } }),
];
const FACET_BY_ID = Object.fromEntries(FACETS.map(f => [f.id, f]));
function facetAllowed(f, cat) { return cat === 'other' ? true : f.cats.includes(cat); }
// the broad subject of a trade: shown, but led by anything more specific the owner names
const BROAD_FACETS = new Set(['flowers', 'events', 'boat', 'animals']);
const OTHER_GENERIC = /^(?:repairs?|servic\w*|maintenance|inspections?|leaks?|installs?|installations?|design|consult\w*|classes?|lessons?|training|care|cleaning|deliver\w*|events?|tours?|sessions?|workshops?|rentals?|hire|storage|moving)$/;
// facets the owner's words name, in the order they name them. An everyday subject ('*': a boat, flowers, bikes)
// also counts for a business filed under another category when it is in the owner's own list of what they
// offer -- a yacht broker filed as real estate sells sailboats, not houses (offCategory marks those).
function matchFacets(t, cat, offersText) {
  const out = [];
  FACETS.forEach(f => {
    const own = facetAllowed(f, cat); const listed = !own && f.cats.includes('*') && !!offersText && new RegExp(f.re.source).test(offersText);
    if (!own && !listed) return;
    const re = new RegExp(f.re.source); const m = re.exec(t); if (!m) return;
    // an unclassified business borrows another trade's subject only on that trade's own words -- "repairs mountain
    // bikes" is not a car on a lift or a roof repair
    if (cat === 'other' && !f.cats.includes('*') && OTHER_GENERIC.test(m[0])) return;
    out.push(Object.assign({ id: f.id, index: m.index, phrase: m[0] }, listed ? { offCategory: true } : {}));
  });
  out.sort((a, b) => a.index - b.index || b.phrase.length - a.phrase.length || (FACET_BY_ID[a.id].cats.includes(cat) ? -1 : 1));
  return out;
}

// ---- template vars from facts ------------------------------------------------------------------------------------------
function varsFor(facts, ctx) {
  const f = facts || {}; const c = ctx || {};
  const skinP = f.skin && f.skin.products || [];
  const v = {
    name: c.name || f.name || 'the business', place: c.place || f.place || '', inPlace: (c.place || f.place) ? ` in ${c.place || f.place}` : '',
    flavourList: listPhrase(f.flavours) || '', flavour: (f.flavours && f.flavours[0]) || '', flavour2: (f.flavours && (f.flavours[1] || f.flavours[0])) || '',
    ingredientList: listPhrase(ingredientsOf(f).map(k => (k === 'chili' ? 'fresh red chillies' : k))) || '', heatList: f.heat ? listPhrase(f.heat.levels.map(l => l.toLowerCase())) : '',
    container: f.drink ? f.drink.noun : 'can', containers: f.drink ? (f.drink.container === 'can' ? 'cans' : 'bottles') : 'cans',
    skinProduct: skinP[0] ? skinP[0].phrase : 'serum', skinContainer: skinP[0] ? skinP[0].container : 'amber glass dropper bottle',
    skinList: listPhrase(skinP.map(p => p.phrase)) || 'serum', skinProduct2: skinP[1] ? skinP[1].phrase : (skinP[0] ? skinP[0].phrase : 'cream'),
    // "the vitamin c serum in an amber glass dropper bottle, the gel cleanser in a frosted pump bottle ..."
    skinWithContainers: listPhrase(skinP.slice(0, 3).map(p => `the ${p.phrase} in ${/^[aeiou]/.test(p.container) ? 'an' : 'a'} ${p.container}`)) || 'the serum in an amber glass dropper bottle',
    pantryNoun: f.pantry ? f.pantry.noun : 'glass jar', pantryProduct: f.pantry ? f.pantry.phrase : '',
    garment: f.apparel ? f.apparel[0].noun : 'garment', garments: f.apparel ? listPhrase(f.apparel.slice(0, 3).map(a => a.noun)) : 'the collection',
    dish: (f.menu && f.menu[0]) || '', bake: (f.bakes && f.bakes[0]) || '',
  };
  return v;
}

// ---- default art for every concept layer ---------------------------------------------------------------------------------
// conceptId -> [lead, detail, context], each (facts, vars) -> { kind, params }
// the business name for packaging and screens -- blank rather than a placeholder when it is not known
const label = v => (v.name && v.name !== 'the business' ? clip(v.name, 22) : '');
const flavours = f => (f.flavours || []).slice(0, 3);
const skinVariants = f => (f.skin && f.skin.products || []).map(p => p.variant).filter((x, i, a) => a.indexOf(x) === i);
const drinkLead = (f, v, range) => (f.drink && f.drink.container === 'bottle') ? { kind: 'bottle-hero', params: Object.assign({ label: label(v), variant: f.drink.variant, flavours: flavours(f) }, range ? { range: true } : {}) } : { kind: range && flavours(f).length > 1 ? 'can-range' : 'can-hero', params: { label: label(v), flavours: flavours(f) } };
const pour = (f, v) => ({ kind: 'drink-pour', params: { label: label(v), container: f.drink ? f.drink.container : 'can', flavours: flavours(f), variant: f.drink && f.drink.variant === 'wine' ? 'wine' : f.drink && f.drink.variant === 'beer' ? 'pint' : 'rocks' } });
const served = f => (f.tech && f.tech.servedArt) || 'team-table';
const iface = (f, v) => ({ kind: 'interface', params: { ui: f.tech ? f.tech.ui : 'analytics', label: label(v), items: f.tech && f.tech.items, audience: f.tech && f.tech.audience, reminders: f.tech && f.tech.reminders } });
const notice = (f, v) => { const ui = f.tech ? f.tech.ui : 'analytics'; const msg = { schedule: [f.tech && f.tech.reminders ? 'Appointment reminder' : 'New booking', 'Tomorrow · confirmed'], monitor: ['Alert resolved', 'All services healthy'], ledger: ['Invoice paid', 'Sent to your account'], inbox: ['New conversation', 'Assigned to you'], pipeline: ['Deal moved', 'Proposal stage'] }[ui] || ['Update', 'Ready to review']; return { kind: 'phone-notice', params: { label: label(v), items: msg } }; };
// A pantry product's lead. A sauce stands in a hot-sauce bottle; when the owner names
// heat levels (or two or more flavours) the range stands side by side, each bottle
// labelled with the owner's own name for it. The label otherwise says what it is.
const SAUCE_RE = /\b(hot sauces?|chil[i]? sauces?|pepper sauces?|chili oils?)\b/;
function pantryLead(f, v) {
  const variant = f.pantry ? f.pantry.variant : 'jar';
  if (variant !== 'woozy') return { kind: 'pantry-hero', params: { label: label(v), variant, flavours: flavours(f) } };
  const range = (f.heat && f.heat.levels.length > 1) ? f.heat.levels : (flavours(f).length > 1 ? flavours(f).map(cap) : null);
  const sub = (/\bhot sauces?\b/.exec(f.text) || /\b(chili sauces?|pepper sauces?|chili oils?|sauces?)\b/.exec(f.text) || [''])[0].replace(/s$/, '');
  return { kind: 'pantry-hero', params: Object.assign({ label: label(v), variant, flavours: flavours(f), sub }, range ? { variants: range.slice(0, 3) } : {}) };
}
// what the product is made with: the ingredients the owner names; a hot sauce is chillies by definition
const ingredientsOf = f => { const own = (f.ingredients || []).slice(0, 3); if (own.length) return own; if (SAUCE_RE.test(f.text || '')) return ['chili']; return flavours(f); };
// what the business offers in its own words: its listed offerings, else what it says it is
const offerWords = f => ((f.offers && f.offers.length) ? f.offers : (f.noun ? [f.noun] : [])).map(cap);
const CONCEPT_ART = {
  'drink-chill': [(f, v) => drinkLead(f, v, false), f => ({ kind: 'fruit-splash', params: { flavours: flavours(f) } }), pour],
  'drink-range': [(f, v) => drinkLead(f, v, true), f => ({ kind: 'fruit-splash', params: { flavours: flavours(f) } }), (f, v) => (f.drink && f.drink.container === 'bottle' ? pour(f, v) : { kind: 'can-ice', params: { label: label(v), flavours: flavours(f) } })],
  'skincare-ritual': [(f, v) => ({ kind: 'skincare-hero', params: { label: label(v), variant: skinVariants(f)[0] || 'dropper', sub: v.skinProduct } }), f => ({ kind: 'texture-swatch', params: { variant: skinVariants(f).includes('jar') ? 'jar' : null } }), (f, v) => ({ kind: 'basin-ritual', params: { label: label(v), variants: skinVariants(f) } })],
  'skincare-botanic': [(f, v) => ({ kind: skinVariants(f).length > 1 ? 'skincare-range' : 'skincare-hero', params: { label: label(v), variants: skinVariants(f), variant: skinVariants(f)[0] || 'jar', sub: v.skinProduct } }), () => ({ kind: 'botanicals' }), (f, v) => ({ kind: 'basin-ritual', params: { label: label(v), variants: skinVariants(f) } })],
  'food-product': [(f, v) => pantryLead(f, v), f => (ingredientsOf(f).length ? { kind: 'ingredients', params: { flavours: ingredientsOf(f) } } : { kind: 'offer-cards', params: { items: f.offers } }), f => ({ kind: 'plated', params: Object.assign({ variant: f.pantry ? f.pantry.dish : 'generic' }, f.pantry && f.pantry.variant === 'woozy' ? { drizzle: true } : {}) })],
  'home-goods': [(f, v) => ({ kind: 'home-object', params: { label: label(v), variant: f.home ? f.home.variant : 'vase' } }), (f, v) => ({ kind: 'home-object', params: { label: label(v), variant: f.home && f.home.variant === 'candle' ? 'mug' : 'candle' } }), f => ({ kind: 'workbench', params: { variant: f.home && f.home.variant === 'candle' ? 'candle' : 'pottery' } })],
  'retail-general': [(f, v) => ({ kind: 'offer-cards', params: { label: label(v), items: f.offers } }), () => ({ kind: 'fabric', params: { variant: 'weave' } }), () => ({ kind: 'living-room' })],
  'fashion-street': [f => ({ kind: 'apparel', params: { variant: f.apparel ? f.apparel[0].variant : 'hoodie' } }), () => ({ kind: 'fabric', params: { variant: 'weave' } }), f => ({ kind: 'rail', params: { variant: f.apparel && f.apparel[0].variant === 'tee' ? 'tee' : null } })],
  'fashion-atelier': [f => ({ kind: 'apparel', params: { variant: f.apparel && f.apparel[0].variant === 'ring' ? 'ring' : 'gown' } }), () => ({ kind: 'fabric', params: { variant: 'weave', colour: '#e9e1d6' } }), () => ({ kind: 'sewing' })],
  'fashion-general': [f => ({ kind: 'apparel', params: { variant: f.apparel ? f.apparel[0].variant : 'tee' } }), f => ({ kind: 'fabric', params: { variant: f.apparel && f.apparel.some(a => a.variant === 'knit') ? 'knit' : 'weave' } }), () => ({ kind: 'rail' })],
  'coffee-roaster': [(f, v) => ({ kind: 'coffee-bag', params: { label: label(v), sub: /single[- ]origin/.test(f.text) ? 'single origin' : 'whole bean' } }), () => ({ kind: 'pour-over' }), () => ({ kind: 'roaster' })],
  'cafe-venue': [f => ({ kind: 'cafe', params: { items: (f.offers || []).map(cap) } }), f => ({ kind: 'latte', params: { side: f.bakes && f.bakes[0] === 'croissant' ? 'croissant' : 'bread' } }), () => ({ kind: 'espresso' })],
  'restaurant-table': [f => ({ kind: 'plated', params: { variant: (f.menu && f.menu[0]) || 'generic' } }), f => ({ kind: 'plated', params: { variant: (f.menu && f.menu[1]) || (f.menu && f.menu[0] === 'steak' ? 'salad' : 'steak'), glass: false } }), () => ({ kind: 'dining' })],
  'bakery-oven': [f => ({ kind: 'bakery', params: { variant: (f.bakes && f.bakes[0]) || 'bread' } }), f => ({ kind: 'bakery', params: { variant: (f.bakes && f.bakes[1]) || ((f.bakes && f.bakes[0]) === 'croissant' ? 'bread' : 'croissant') } }), f => ({ kind: 'cafe', params: { items: (f.offers || []).map(cap) } })],
  'bar-night': [() => ({ kind: 'bar' }), f => ({ kind: 'cocktail', params: { flavours: flavours(f) } }), f => (/\b(beers?|taps?|taproom|brewery|ale)\b/.test(f.text) ? { kind: 'taps' } : { kind: 'cocktail', params: { variant: 'rocks', flavours: flavours(f).slice(1) } })],
  'hospitality-general': [() => ({ kind: 'dining' }), f => ({ kind: 'plated', params: { variant: (f.menu && f.menu[0]) || 'generic' } }), f => ({ kind: 'cafe', params: { items: (f.offers || []).map(cap) } })],
  'creative-photo': [() => ({ kind: 'camera-set' }), () => ({ kind: 'prints' }), () => ({ kind: 'street' })],
  'creative-studio': [() => ({ kind: 'moodboard' }), () => ({ kind: 'sketch-desk' }), () => ({ kind: 'team-table' })],
  'saas-vertical': [iface, notice, f => ({ kind: served(f) })],
  'saas-dev': [iface, () => ({ kind: 'server-rack' }), () => ({ kind: 'team-table' })],
  'tech-general': [iface, notice, () => ({ kind: 'team-table' })],
  'finance-planning': [() => ({ kind: 'team-table' }), () => ({ kind: 'desk-docs', params: { variant: 'finance' } }), () => ({ kind: 'house-dusk' })],
  'law-counsel': [() => ({ kind: 'office', params: { variant: 'law' } }), () => ({ kind: 'desk-docs', params: { variant: 'contract' } }), () => ({ kind: 'library' })],
  'consulting-workshop': [() => ({ kind: 'team-table' }), f => ({ kind: 'sticky-wall', params: { items: (f.offers || []).slice(0, 3).map(cap) } }), () => ({ kind: 'office' })],
  'education-tutor': [f => ({ kind: 'study-desk', params: { variant: /\b(math\w*|algebra|calculus|sat|exam)\b/.test(f.text) ? 'math' : 'reading' } }), () => ({ kind: 'books' }), f => ({ kind: 'classroom', params: { variant: /\b(math\w*|algebra|calculus)\b/.test(f.text) ? 'math' : 'reading' } })],
  'fitness-boxing': [() => ({ kind: 'boxing' }), () => ({ kind: 'wraps' }), () => ({ kind: 'ring' })],
  'fitness-studio': [f => ({ kind: /\b(pilates|reformers?)\b/.test(f.text) ? 'reformer' : 'yoga' }), () => ({ kind: 'exercise-kit' }), f => ({ kind: /\b(pilates|reformers?)\b/.test(f.text) ? 'yoga' : 'reformer' })],
  'fitness-gym': [() => ({ kind: 'weights' }), () => ({ kind: 'kettlebells' }), () => ({ kind: 'exercise-kit' })],
  'realestate-dusk': [() => ({ kind: 'house-dusk' }), () => ({ kind: 'kitchen' }), () => ({ kind: 'keys' })],
  'realestate-condo': [() => ({ kind: 'living-room', params: { variant: 'city' } }), () => ({ kind: 'kitchen' }), () => ({ kind: 'street' })],
  'clinic-physio': [() => ({ kind: 'treatment-room' }), () => ({ kind: 'exercise-kit' }), () => ({ kind: 'reception' })],
  'spa-calm': [() => ({ kind: 'treatment-room', params: { variant: 'spa' } }), () => ({ kind: 'spa' }), () => ({ kind: 'basin-ritual', params: { variants: ['pump', 'jar'] } })],
  'wellness-general': [() => ({ kind: 'treatment-room' }), () => ({ kind: 'spa' }), () => ({ kind: 'reception' })],
  'nonprofit-community': [() => ({ kind: 'community-table' }), () => ({ kind: 'produce-crate' }), () => ({ kind: 'seedling' })],
  'landscape-build': [() => ({ kind: 'patio' }), () => ({ kind: 'retaining-wall' }), () => ({ kind: 'planting-bed' })],
  'lawn-care': [() => ({ kind: 'lawn-mowing' }), () => ({ kind: 'edging' }), () => ({ kind: 'leaf-cleanup' })],
  'landscape-general': [() => ({ kind: 'garden-path' }), () => ({ kind: 'planting-bed' }), () => ({ kind: 'hedge' })],
  roofing: [() => ({ kind: 'roof-house' }), () => ({ kind: 'shingles' }), () => ({ kind: 'roof-ladder' })],
  renovation: [() => ({ kind: 'kitchen' }), () => ({ kind: 'tile-detail' }), () => ({ kind: 'framing' })],
  painting: [() => ({ kind: 'painted-room' }), () => ({ kind: 'cutting-in' }), () => ({ kind: 'paint-tray' })],
  plumbing: [() => ({ kind: 'bathroom' }), () => ({ kind: 'faucet' }), () => ({ kind: 'pipes' })],
  electrical: [() => ({ kind: 'lit-room' }), () => ({ kind: 'panel' }), f => ({ kind: /\bev\b|electric vehicle/.test(f.text) ? 'ev-charger' : 'outlets' })],
  cleaning: [() => ({ kind: 'clean-room' }), () => ({ kind: 'spray-shine' }), () => ({ kind: 'caddy' })],
  'auto-detailing': [() => ({ kind: 'car-shine' }), () => ({ kind: 'polisher' }), () => ({ kind: 'rim' })],
  'auto-repair': [() => ({ kind: 'car-lift' }), () => ({ kind: 'engine-parts' }), () => ({ kind: 'rim' })],
  'other-product': [(f, v) => ({ kind: 'offer-cards', params: { label: label(v), items: offerWords(f) } }), f => (/\b(hand-?made|workshop|wood\w*|leather|metal\w*|furniture|carpent\w*)\b/.test(f.text) ? { kind: 'workbench', params: { variant: 'tools' } } : { kind: 'offer-cards', params: { items: offerWords(f).slice().reverse() } }), (f, v) => ({ kind: 'offer-cards', params: { label: label(v), items: offerWords(f).slice(1).concat(offerWords(f).slice(0, 1)) } })],
  'other-service': [(f, v) => ({ kind: 'offer-cards', params: { label: label(v), items: offerWords(f) } }), f => ({ kind: 'offer-cards', params: { items: offerWords(f).slice().reverse() } }), (f, v) => ({ kind: 'offer-cards', params: { label: label(v), items: offerWords(f).slice(1).concat(offerWords(f).slice(0, 1)) } })],
};
// concepts whose layers follow the product itself (containers, flavours) rather than a list of services
const KEEP_LEAD = new Set(['cafe-venue', 'bar-night', 'hospitality-general', 'restaurant-table', 'bakery-oven', 'realestate-dusk', 'realestate-condo', 'clinic-physio', 'spa-calm', 'fitness-boxing', 'fitness-studio', 'fitness-gym', 'creative-photo', 'nonprofit-community']);
const PRODUCT_LED = new Set(['drink-chill', 'drink-range', 'skincare-ritual', 'skincare-botanic', 'food-product', 'home-goods', 'fashion-street', 'fashion-atelier', 'fashion-general', 'coffee-roaster', 'saas-vertical', 'saas-dev', 'tech-general']);
function facetArt(facet, v, role) { const a = facet.art; const [kind, variant] = String((a.byRole && a.byRole[role]) || a.kind).split(':'); return { kind, params: Object.assign({}, a.params || {}, variant ? { variant } : {}, kind === 'offer-cards' ? { label: clip(v.name, 22) } : {}) }; }
function singular(w) { w = String(w || ''); return /ies$/.test(w) ? w.slice(0, -3) + 'y' : /(ss|us)$/.test(w) ? w : w.replace(/s$/, ''); }
function facetText(facet, role) { const t = facet.art.text && facet.art.text[role]; return t ? { subject: t[0], shot: t[1] } : { subject: facet.subject, shot: facet.shot }; }
function fillText(tpl, v) { return String(tpl || '').replace(/\{(\w+)\}/g, (m, k) => (v[k] != null ? v[k] : '')).replace(/\s+,/g, ',').replace(/\s{2,}/g, ' ').trim(); }

// A concept's layers made specific to this business: the concept's own subjects
// with the facts filled in, then any service/subject the owner names replacing
// the generic one for the role it fits. Each layer gains its `art` spec.
// layers: [{ role, subject, shot }] (subject/shot already filled by the concept templates)
function specialiseLayers(conceptId, layers, facts, ctx) {
  const f = facts || factsFor(ctx); const v = varsFor(f, ctx);
  const arts = CONCEPT_ART[conceptId] || CONCEPT_ART['other-service'];
  const usedFacets = new Set(); const usedArt = new Set();
  const facetsFor = f.facets || [];
  const keyOf = a => `${a.kind}|${(a.params && a.params.variant) || ''}`;
  const out = layers.map((l, i) => {
    const base = Object.assign({}, l, { art: arts[i] ? arts[i](f, v) : { kind: 'offer-cards', params: { items: f.offers } }, facet: null });
    const productLed = PRODUCT_LED.has(conceptId) && !(conceptId === 'saas-vertical' && i === 2);
    // a venue's own room leads -- unless what the owner lists is something else entirely (a yacht broker filed as real estate)
    const offLead = facetsFor.some(m => m.offCategory && FACET_BY_ID[m.id].roles.includes('lead'));
    if (productLed || (i === 0 && KEEP_LEAD.has(conceptId) && !offLead)) { usedArt.add(keyOf(base.art)); return base; }
    // a named subject can appear twice only when its role gives a genuinely different picture (the cards, then the seal close-up)
    const fits = (m, fresh) => { const a = facetArt(FACET_BY_ID[m.id], v, l.role); return FACET_BY_ID[m.id].roles.includes(l.role) && !usedArt.has(keyOf(a)) && (fresh ? ![...usedFacets].some(k => k.startsWith(`${m.id}|`)) : !usedFacets.has(`${m.id}|${keyOf(a)}`)); };
    // everything the owner named gets shown once before anything is shown twice
    // the lead shows the business's defining offering: a specific one it names (a ceremony arch, a delivery, a workshop)
    // before the broad subject of its trade (flowers, boats, animals) -- which then takes a supporting role
    const order = i === 0 ? facetsFor.filter(m => !BROAD_FACETS.has(m.id)).concat(facetsFor.filter(m => BROAD_FACETS.has(m.id))) : facetsFor;
    const pick = order.find(m => fits(m, true)) || order.find(m => fits(m, false));
    if (!pick) { usedArt.add(keyOf(base.art)); return base; }
    const facet = FACET_BY_ID[pick.id]; usedFacets.add(`${pick.id}|${keyOf(facetArt(facet, v, l.role))}`);
    const fv = Object.assign({}, v, { phrase: pick.phrase, phraseOne: singular(pick.phrase) });
    const words = facetText(facet, l.role);
    const res = Object.assign(base, { subject: fillText(words.subject, fv), shot: fillText(words.shot, fv), art: facetArt(facet, fv, l.role), facet: pick.id });
    usedArt.add(keyOf(res.art));
    return res;
  });
  // never the same picture twice: a layer whose picture repeats an earlier one takes the first concept default
  // (any role) or remaining named subject that is not on screen yet
  const seen = new Set();
  return out.map((l, i) => {
    const k = keyOf(l.art);
    if (!seen.has(k)) { seen.add(k); return l; }
    const cands = arts.map(fn => ({ art: fn(f, v) })).concat(facetsFor.filter(m => FACET_BY_ID[m.id].roles.includes(l.role)).map(m => ({ facet: FACET_BY_ID[m.id], phrase: m.phrase, art: facetArt(FACET_BY_ID[m.id], v, l.role) })));
    const alt = cands.find(c => !seen.has(keyOf(c.art)) && !out.some((o, j) => j !== i && keyOf(o.art) === keyOf(c.art)));
    if (!alt) { seen.add(k); return l; }
    seen.add(keyOf(alt.art));
    if (alt.facet) { const fv = Object.assign({}, v, { phrase: alt.phrase, phraseOne: singular(alt.phrase) }); const words = facetText(alt.facet, l.role); return Object.assign({}, l, { subject: fillText(words.subject, fv), shot: fillText(words.shot, fv), art: alt.art, facet: alt.facet.id }); }
    return Object.assign({}, l, { art: alt.art, subject: SUBJECT_OF_ART[alt.art.kind] ? SUBJECT_OF_ART[alt.art.kind].subject : l.subject, shot: SUBJECT_OF_ART[alt.art.kind] ? fillText(SUBJECT_OF_ART[alt.art.kind].shot, v) : l.shot });
  });
}
// when a repeated picture is swapped for another concept default, its words follow it
const SUBJECT_OF_ART = {
  'desk-docs': { subject: 'organised documents and a calculator', shot: 'Neatly organised financial documents, a calculator and a fountain pen on a clean desk, soft window light, three-quarter overhead view' },
  'house-dusk': { subject: 'a family home at dusk', shot: 'A family home{inPlace} at dusk with warm light in every window, three-quarter view' },
  'team-table': { subject: 'a working session around the table', shot: 'A working session around a table with laptops, notebooks and coffee, seen from above, bright office light' },
  'produce-crate': { subject: 'a crate of fresh produce', shot: 'A wooden crate of fresh produce on a folding table, close three-quarter view, natural light' },
  'community-table': { subject: 'a long table set for the community', shot: 'A long table set outdoors for a community meal, string lights overhead, golden hour, wide view' },
  seedling: { subject: 'seedlings planted in fresh soil', shot: 'Young seedlings just planted in rich dark soil with a trowel beside them, low close-up, soft daylight' },
};
// The illustration for a planner-written layer: matched on its own words first,
// then the product facts, then the concept default for its role.
const TEXT_ART = [
  [/\b(dropper|serum)\b/, (f, v) => ({ kind: 'skincare-hero', params: { label: label(v), variant: 'dropper', sub: v.skinProduct } })],
  [/\b(pump bottle|cleanser)\b/, (f, v) => ({ kind: 'skincare-hero', params: { label: label(v), variant: 'pump', sub: 'cleanser' } })],
  [/\b(swatch|texture|smear)\b/, () => ({ kind: 'texture-swatch' })],
  [/\b(cans?)\b/, (f, v) => ({ kind: /\b(line(?:d)? up|range|row|trio|three)\b/.test(v._t) ? 'can-range' : 'can-hero', params: { label: label(v), flavours: flavours(f) } })],
  [/\b(splash|fruit|citrus|peach|cherry|berries|ingredients? splash)\b/, f => ({ kind: 'fruit-splash', params: { flavours: flavours(f) } })],
  [/\b(pour(?:ed|ing)? over ice|glass of|cocktail|poured)\b/, pour],
  [/\b(interface|screen|dashboard|calendar|app)\b/, iface],
  [/\b(notification|phone)\b/, notice],
];
function artForText(text, role, facts, ctx, fallbackArt) {
  const f = facts || factsFor(ctx); const v = Object.assign(varsFor(f, ctx), { _t: plain(text) });
  const t = v._t;
  let facet = null, at = Infinity;
  FACETS.forEach(x => { if (!facetAllowed(x, f.categoryKey)) return; const m = new RegExp(x.re.source).exec(t); if (m && m.index < at) { at = m.index; facet = x; } });
  // a drink shown poured or out in the world is the serving scene, not another pack shot
  if (f.drink && /\b(rooftop|terrace|picnic|beach|poolside|outdoors?|raised|cheers|poured|pouring|glass)\b/.test(t)) return pour(f, v);
  if (facet) return facetArt(facet, v, role);
  for (const [re, fn] of TEXT_ART) if (re.test(t)) { if (fn === iface && f.categoryKey !== 'tech') continue; return fn(f, v); }
  return fallbackArt || { kind: 'offer-cards', params: { label: label(v), items: f.offers } };
}

// ---- semantic checks on a planner storyboard -------------------------------------------------------------------------------
const CONTAINER_WORDS = { dropper: /\bdroppers?\b/, pump: /\bpump bottles?\b/, can: /\bcans?\b/, wine: /\bwine bottles?\b/, jar: /\bjars?\b/ };
function planProblems(layers, facts) {
  const f = facts || {}; const problems = [];
  const texts = layers.map(l => plain(`${l.subject} ${l.prompt}`));
  // a container that contradicts the product
  if (f.drink) texts.forEach((t, i) => { if (CONTAINER_WORDS.dropper.test(t) || /\b(serum|moisturi[sz]er|cleanser)\b/.test(t)) problems.push(`layer ${i + 1} shows a skincare container for a drinks brand`); if (f.drink.container === 'can' && /\bbottles?\b/.test(t) && !/\bcans?\b/.test(t)) problems.push(`layer ${i + 1} shows bottles but ${f.name || 'the brand'} sells cans`); });
  if (f.skin) texts.forEach((t, i) => { if (CONTAINER_WORDS.can.test(t) || /\b(soda|beer|energy drink)\b/.test(t)) problems.push(`layer ${i + 1} shows a drink can for a skincare brand`); });
  // the owner's stated specifics must appear somewhere in the images
  const specifics = [].concat(f.flavours || [], (f.skin && f.skin.products || []).map(p => p.phrase.split(' ').pop().replace(/s$/, '')), (f.facets || []).slice(0, 3).map(m => m.phrase.replace(/s$/, '')), (f.apparel || []).map(a => a.noun), f.menu || []).filter(Boolean);
  if (specifics.length) { const all = texts.join(' '); if (!specifics.some(s => all.includes(plain(s)))) problems.push(`no image shows what the owner says they offer (${specifics.slice(0, 4).join(', ')})`); }
  return problems;
}

// ---- a shared look across the hero's images ---------------------------------------------------------------------------------
function lookLine(sb, accentWord) {
  const acc = accentWord || 'brand-colour';
  if (sb && sb.treatment === 'illustration') return `Shared look for every image in this set: detailed editorial illustration with gouache texture, light from the upper left, a restrained palette led by ${acc}.`;
  return sb && sb.tone === 'dark'
    ? `Shared look for every image in this set: key light from the upper left, deep shadows with a ${acc} rim light, rich contrast, one consistent colour grade.`
    : `Shared look for every image in this set: key light from the upper left, airy neutrals with ${acc} accents, gentle contrast, one consistent colour grade.`;
}

module.exports = { FACETS, FACET_BY_ID, CONCEPT_ART, PRODUCT_LED, factsFor, varsFor, matchFacets, specialiseLayers, artForText, planProblems, lookLine, plain, listPhrase };
