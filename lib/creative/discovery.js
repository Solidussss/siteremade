'use strict';
// CREATIVE — picture DISCOVERY through Google Images (SerpApi), kept apart from PERMISSION.
//
// Finding the subject and being allowed to use a picture of it are two different questions. This module answers the
// first as well as it can -- several DISTINCT searches for the subject itself, a fallback when a result set is weak, a
// cache that never freezes a poor answer -- and reports both answers separately, with a count at every stage, so "we
// found it but could not verify its rights" is never shown as "we found nothing".
//
//   planSearches(u, opts)            -> [{ q, licenses, family, fallback }]       bounded, distinct query families
//   assessResults(results, u)        -> { total, good, products, stock, fanHosts, forms, logos, small, offTopic, weak, why }
//   runSearches(u, deps)             -> { results, searches, cachedQueries, queries: [...], stop, error }
//   summarise({ search, log, candidates, curation, used, review }) -> { counts, discovery, permission, status, message }
//
// Nothing here decides that a picture may be used: that stays with the permission reading (webimages.js) and the
// server's existing rules. A picture whose page states no free licence is never auto-used, however well it matches.

const { STOCK, PERSONAL_WORK, excludedSource } = require('./webimages');

// bounds: fresh searches per generation (the server's CREATIVE_SERPAPI_SEARCHES, default 3), one extra fallback only
// when everything so far was weak, and never more than six queries considered in all (cached ones included)
// (real prompts: the first family alone returned 30+ results counted good, discovery stopped there, and every candidate
// came from ONE intent -- now at least two distinct families run before results count as enough; minUsable: fewer
// usable pictures of the subject than this after the picture check earns one more family)
const LIMITS = { defaultBudget: 3, maxBudget: 5, extraFallback: 1, maxQueries: 6, weakGood: 6, enoughGood: 12, plentyGood: 20, resultsPerSearch: 40, minFamilies: 2, minUsable: 3 };
// a cached answer: a strong one keeps for the cache's days; a weak one for two days (a better query or a better index
// gets its chance soon); an empty one is never kept
const WEAK_CACHE_DAYS = 2;
// the query plan's version: part of every cache key, so a query built by older code is never answered from its cache
const PLAN_VERSION = 'q3';

const STOP = new Set(['the', 'and', 'for', 'with', 'from', 'of', 'a', 'an', 'in', 'on', 'official', 'game', 'video', 'series', 'character', 'image', 'picture', 'art', 'artwork', 'meme', 'page', 'fan']);
const norm = s => String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
// the words that name the subject (what a relevant result's title or page must mention)
function subjectTokens(name) { return norm(name).split(' ').filter(t => t.length >= 3 && !STOP.has(t)); }

// ---------------------------------------------------------------- the plan
const EXCLUDE_ART = '-cosplay -plush -figure -toy -merch -fanart -site:deviantart.com -site:pinterest.com -site:artstation.com -site:behance.net -site:sketchfab.com';
const EXCLUDE_STOCK = '-site:shutterstock.com -site:dreamstime.com -site:istockphoto.com -site:alamy.com -site:depositphotos.com -site:stock.adobe.com -site:123rf.com -site:gettyimages.com -site:vecteezy.com -site:freepik.com -site:pngtree.com -site:magnific.com';
// what kind of depicted subject it is: decides which DISTINCT intents are searched
function subjectType(u, brief) {
  const said0 = `${(u && u.identity && u.identity.what) || ''} ${(u && u.visuals && u.visuals.main) || ''} ${(u && u.category) || ''} ${brief || ''}`;
  return roleType(subjectType0(u, brief), said0);
}
// a product or real subject of a kind whose pictures have well-known roles is searched for those roles (the asset director
// then casts them): a drink as the product, its campaign and its condensation; a car three-quarter, in profile, inside, in
// detail; fashion as product, campaign and material; skincare as the bottle, a still life and a texture; software as its
// interface. Bounded: the same number of families and the same single fallback as every other kind.
function roleType(type, said) {
  if (type !== 'product' && type !== 'real') return type;
  if (/\b(software|saas|web ?app|mobile app|app|platform|dashboard|scheduling|crm|api)\b/i.test(said) && !/\b(appliance|apple|apparel)\b/i.test(said)) return 'software';
  if (type !== 'product' && !/\b(drink|soda|cola|beverage|juice|beer|wine|spirit|whisky|gin|coffee|tea|sneakers?|shoes?|trainers?|boots?|loafers?|dress|jacket|handbag|apparel|fashion|car|coupe|sedan|suv|motorbike|serum|skincare|cream|moisturi[sz]er|cosmetic|perfume|fragrance)\b/i.test(said)) return type;
  if (/\b(drink|soda|cola|beverage|juice|beer|wine|spirit|whisky|gin|seltzer|energy drink|coffee|tea)\b/i.test(said)) return 'beverage';
  if (/\b(car|coupe|sedan|suv|motorbike|motorcycle|supercar|roadster|hatchback|ev)\b/i.test(said)) return 'vehicle';
  if (/\b(serum|skincare|skin care|cream|moisturi[sz]er|cosmetics?|perfume|fragrance|lipstick|cleanser|lotion)\b/i.test(said)) return 'beauty';
  if (/\b(sneakers?|shoes?|trainers?|boots?|loafers?|heels|dress|jacket|coat|handbag|bag|apparel|fashion|clothing|garment|knitwear)\b/i.test(said)) return 'fashion';
  return type;
}
function subjectType0(u, brief) {
  // the settled identity (identity.js) decides when there is one: a meme is searched as a meme on every run
  if (u && FAMILIES[u.searchIntent]) return u.searchIntent;
  const said = `${(u.identity && u.identity.what) || ''} ${(u.visuals && u.visuals.main) || ''} ${u.category || ''} ${brief || ''}`;
  const kind = String((u.identity && u.identity.kind) || u.kind || ''); const dep = u.visuals && u.visuals.depiction;
  if (/\b(meme|internet (?:celebrity|phenomenon|character)|viral|reaction image|copypasta)\b/i.test(said)) return 'meme';
  if (/\b(video ?games?|game series|videogame|nintendo|playstation|xbox|console game|fighting game|platform game|platformer|rpg)\b/i.test(said)) return 'game';
  if (/\b(anime|manga|cartoon|animated|animation|tv series|television series|movie|comic|webcomic|(?:tv|television|web|cartoon|animated) show)\b/i.test(said)) return 'screen';
  // (real prompts: an "instant film camera" was searched as a film -- "official poster", "character render": a physical
  // product wins over the bare word "film")
  const product = /\b(product|camera|phone|smartphone|headphones?|earbuds|watch|sneakers?|shoes?|car|motorbike|bicycle|console|device|gadget|laptop|bottle|perfume|handbag|chair|lamp|speaker|drink|snack)\b/i.test(said);
  if (!product && /\bfilms?\b/i.test(said)) return 'screen';
  const artwork = dep ? dep === 'artwork' : /fictional|invented/.test(kind) || /\b(character|mascot|superhero|pok[eé]mon)\b/i.test(said);
  if (artwork) return 'character';
  // (a real place and a real product are searched for what each needs: wide views and night views of a building; the
  // object alone on white, in use, and from another side for a product)
  if (/\b(building|architecture|architectural|landmark|venue|opera house|tower|bridge|cathedral|temple|castle|palace|museum|stadium|monument|heritage site|skyline|harbou?r|national park|island|mountain|city)\b/i.test(said)) return 'place';
  if (product) return 'product';
  return 'real';
}
// Each family is a different INTENT, so the searches return different pictures (not "X official render / X official
// image / X official artwork", which return one result set three times). Primary families first, fallbacks after.
const FAMILIES = {
  game: [['render', 'official render'], ['key-art', 'key art'], ['screenshot', 'gameplay screenshot'], ['character-render', 'character render', true], ['promo', 'official artwork promotional', true]],
  character: [['render', 'official render'], ['promo', 'official artwork promotional'], ['still', 'screenshot OR still'], ['sheet', 'character art', true], ['sprite', 'sprite OR model sheet', true]],
  screen: [['promo', 'official artwork promotional'], ['still', 'still OR screenshot'], ['render', 'character render'], ['key-visual', 'key visual', true], ['poster', 'official poster', true]],
  meme: [['meme', 'meme'], ['character', 'character image'], ['original', 'original image'], ['template', 'meme template', true], ['reaction', 'reaction image', true]],
  real: [['photo', 'high resolution photo -site:pinterest.com'], ['isolated', 'isolated on white background'], ['context', ''], ['closeup', 'close up photograph', true], ['photo2', 'photograph', true]],
  place: [['photo', 'high resolution photo -site:pinterest.com'], ['wide', 'wide angle panorama'], ['night', 'at night photograph'], ['aerial', 'aerial view', true], ['interior', 'interior photograph', true]],
  product: [['product', 'product photo'], ['isolated', 'isolated on white background'], ['in-use', 'in use photo'], ['angle', 'side view product photo', true], ['closeup', 'close up detail photo', true]],
  beverage: [['product', 'product photography'], ['campaign', 'advertising campaign photo'], ['isolated', 'isolated on white background'], ['condensation', 'condensation close up', true], ['packaging', 'packaging detail', true]],
  vehicle: [['three-quarter', 'three quarter front photo'], ['profile', 'side profile photo'], ['interior', 'interior photo'], ['detail', 'wheel detail close up', true], ['night', 'at night photo', true]],
  fashion: [['product', 'product photo'], ['campaign', 'editorial campaign photo'], ['isolated', 'isolated on white background'], ['material', 'material detail close up', true], ['silhouette', 'worn on model photo', true]],
  beauty: [['product', 'product bottle photo'], ['still-life', 'campaign still life photo'], ['isolated', 'isolated packaging on white background'], ['texture', 'texture macro close up', true], ['ingredient', 'ingredient detail photo', true]],
  software: [['interface', 'app interface screenshot'], ['dashboard', 'dashboard screenshot'], ['product', 'product screenshot'], ['device', 'on laptop screen', true], ['ui', 'user interface design', true]],
};
function planSearches(u, opts) {
  const o = opts || {}; u = u || {};
  const name = String((u.identity && u.identity.name) || u.subject || '').replace(/\s+/g, ' ').trim().slice(0, 80); if (!name) return [];
  // disambiguation from the article: its parenthetical ("Link (The Legend of Zelda)") or a different title that the
  // understanding step resolved for this subject ("BMO" + "Adventure Time") -- never a title that is the name itself
  // written differently ("Super Smash Bros. Ultimate" for "Super Smash Bros Ultimate")
  const titles = [].concat((u.research && u.research.wikipediaTitles) || [], u.pageTitle || []).map(String).filter(Boolean);
  const nn = norm(name); let ctx = '';
  for (const t of titles) { const m = /\(([^)]+)\)/.exec(t); if (m && !/^(character|franchise|series|video game|film|tv series|comics|meme)$/i.test(m[1].trim()) && norm(t.replace(/\([^)]*\)/, '')).includes(nn)) { ctx = m[1].trim(); break; } }
  if (!ctx) { const other = titles.find(t => { const a = norm(t.replace(/\([^)]*\)/g, '')); return a && !a.includes(nn) && !nn.includes(a); }); if (other) ctx = other.replace(/\s*\([^)]*\)\s*/g, ' ').trim(); }
  const base = `${name}${ctx && !nn.includes(norm(ctx)) ? ' ' + ctx : ''}`.slice(0, 90);
  const type = subjectType(u, o.brief);
  const art = !['real', 'place', 'product', 'beverage', 'vehicle', 'fashion', 'beauty', 'software'].includes(type); const not = art ? EXCLUDE_ART : EXCLUDE_STOCK;
  // the understanding's own words for what the page must show become a family of their own when they say something
  // specific beyond the name ("Mario, Link and Pikachu mid-fight" -> "Super Smash Bros Ultimate Mario Link Pikachu")
  const said = [(u.visuals && u.visuals.main) || '', ...(((u.visuals && u.visuals.supporting) || []).slice(0, 2))].join(' ');
  const extra = norm(said).split(' ').filter(t => t.length >= 4 && !STOP.has(t) && !nn.split(' ').includes(t) && !/^(the|this|that|their|them|with|showing|shown|clear|picture|pictures|photo|photos|image|images|official|artwork|character|characters|subject|itself|real|actual)$/.test(t)).slice(0, 3);
  const setting = norm((u.visuals && u.visuals.setting) || '').split(' ').filter(t => t.length >= 4 && !STOP.has(t)).slice(0, 3).join(' ');
  const out = []; const seenIntent = new Set();
  const add = (family, words, fallback) => { const q = `${base}${words ? ' ' + words : ''} ${not}`.replace(/\s+/g, ' ').trim(); const key = norm(q.replace(/ -\S+/g, '')); if (seenIntent.has(key)) return; seenIntent.add(key); out.push({ q, licenses: '', family, fallback: !!fallback }); };
  // the owner's own "search again for ..." words come first (still subject-specific: the name is added when missing)
  if (o.refine) { const r = String(o.refine).replace(/\s+/g, ' ').trim().slice(0, 120); const withName = norm(r).includes(nn) ? r : `${name} ${r}`; out.push({ q: `${withName} ${not}`.trim(), licenses: '', family: 'owner', fallback: false }); seenIntent.add(norm(withName)); }
  FAMILIES[type].forEach(([family, words, fallback]) => { if (family === 'context') { if (setting) add(family, setting, false); else add('photo2', 'photograph', false); } else add(family, words, fallback); });
  if (extra.length >= 2) add('described', extra.join(' '), true);
  // what the page's motion will need from its pictures (timeline.motionIntent): a clean cut-out to carry the subject
  // across scenes, a wide picture to fill the screen -- searched for only when the results so far do not have it
  const needs = o.needs || {}; const needList = [];
  if (needs.cutout) needList.push({ family: 'cutout', need: 'cutout', words: art ? 'transparent png render' : 'isolated png' });
  if (needs.bleed) needList.push({ family: 'wide', need: 'bleed', words: art ? 'wallpaper' : 'wide landscape photo' });
  // (the spatial tier turns its subject in depth: the same subject from another angle -- searched only when the needs
  // before it are met, within the same single extra search)
  if (needs.alternate) needList.push({ family: 'alternate', need: 'alternate', words: art ? 'side view render' : 'side view' });
  const main = out.slice(0, LIMITS.maxQueries);
  needList.forEach(n => { const q = `${base} ${n.words} ${not}`.replace(/\s+/g, ' ').trim(); if (!main.some(p => norm(p.q) === norm(q))) main.push({ q, licenses: '', family: n.family, fallback: true, need: n.need }); });
  return main;
}

// ---------------------------------------------------------------- how good a result set is (before any picture is judged)
const FORM_TITLE = /\b(cosplay(?:er|ers)?|costume|plush(?:ie)?|figur(?:e|ine)s?|toys?|merch(?:andise)?|t-?shirts?|shirts?|hoodies?|mugs?|stickers?|keychains?|lego|amiibo|funko|statues?|replicas?|backpacks?|cases?|decals?|posters? for sale)\b/i;
const LOGO_TITLE = /\b(logos?|wordmarks?|logotypes?|icons?|emblems?)\b/i;
function hostOf(u) { try { return new URL(u).hostname; } catch (e) { return ''; } }
function assessResults(results, u) {
  const name = String((u && ((u.identity && u.identity.name) || u.subject)) || '');
  const toks = subjectTokens(name);
  const a = { total: 0, good: 0, products: 0, stock: 0, fanHosts: 0, forms: 0, logos: 0, small: 0, offTopic: 0, weak: false, why: '' };
  (results || []).forEach(x => {
    a.total++; const host = hostOf(x.pageUrl); const text = norm(`${x.title} ${x.source} ${x.pageUrl}`);
    if (x.isProduct) a.products++;
    else if (STOCK.test(host)) a.stock++;
    else if (PERSONAL_WORK.test(host)) a.fanHosts++;
    else if (FORM_TITLE.test(x.title || '')) a.forms++;
    else if (LOGO_TITLE.test(x.title || '')) a.logos++;
    else if (x.width && x.height && Math.max(x.width, x.height) < 400) a.small++;
    else if (toks.length && !toks.some(t => text.includes(t))) a.offTopic++;
    else a.good++;
  });
  a.weak = a.good < LIMITS.weakGood;
  if (a.weak) {
    const worst = [['no results', a.total ? 0 : 1], ['mostly shopping results', a.products], ['mostly stock previews', a.stock], ['mostly fan-made (art-community sites)', a.fanHosts], ['mostly cosplay, figures or merchandise', a.forms], ['mostly logos', a.logos], ['mostly too small to use', a.small], ['mostly about something else', a.offTopic]].sort((x, y) => y[1] - x[1])[0];
    a.why = a.total ? (worst[1] ? `${worst[0]} (${a.good} of ${a.total} usable)` : `only ${a.good} of ${a.total} usable`) : 'no results';
  }
  return a;
}

// ---------------------------------------------------------------- the searches
// deps: { search(q, licenses) -> { ok, status, results, error }, cacheGet(key) -> { results, good, at } | null,
//         cachePut(key, results, quality), budget, dailyLeft() -> number, refine, brief }
const cacheKey = p => `${PLAN_VERSION}|${p.licenses || ''}|${p.q}`;
async function runSearches(u, deps) {
  const d = deps || {}; const budget = Math.max(1, Math.min(LIMITS.maxBudget, Number(d.budget) || LIMITS.defaultBudget));
  const plan = planSearches(u, { refine: d.refine, brief: d.brief, needs: d.needs });
  const out = { results: [], searches: 0, cachedQueries: 0, queries: [], stop: '', error: '', plan: plan.map(p => p.family) };
  const seen = new Set(); let good = 0; let allWeak = true;
  for (const p of plan) {
    if (out.queries.length >= LIMITS.maxQueries) { out.stop = 'query limit'; break; }
    // plenty already: a second family still runs for variety (renders AND key art AND stills), then it stops
    if (out.queries.length >= LIMITS.minFamilies && (good >= LIMITS.plentyGood || (good >= LIMITS.enoughGood && out.queries.length >= 3))) { out.stop = 'enough good results'; break; }
    // fallback families only when what came so far is weak (a need's own search waits for the end)
    if (p.need) continue;
    if (p.fallback && good >= LIMITS.weakGood * 1.5) continue;
    let results; let cached = false; let status = 200;
    const hit = d.cacheGet ? d.cacheGet(cacheKey(p)) : null;
    if (hit && Array.isArray(hit.results)) { results = hit.results; cached = true; out.cachedQueries++; }
    else {
      const cap = budget + (allWeak && out.searches >= budget ? LIMITS.extraFallback : 0);
      if (out.searches >= cap) { out.stop = 'search budget used'; break; }
      if (d.dailyLeft && d.dailyLeft() <= 0) { out.error = out.error || 'the daily image-search limit is used up'; out.stop = 'daily limit'; break; }
      const r = await d.search(p.q, p.licenses); out.searches++; status = r.status;
      if (!r.ok) {
        out.error = r.error || 'the search failed'; out.queries.push({ q: p.q, family: p.family, fallback: p.fallback, cached: false, ok: false, status: r.status, error: out.error });
        if (r.status === 401 || r.status === 403 || r.status === 429) { out.stop = 'provider refused'; break; }
        continue;
      }
      results = (r.results || []).slice(0, LIMITS.resultsPerSearch);
    }
    // (Wikimedia-hosted results are not a Creative picture source: they are dropped before anything is scored)
    results = results.filter(x => !excludedSource(x.pageUrl, x.imageUrl));
    const q = assessResults(results, u);
    let fresh = 0;
    results.forEach(x => { const k = x.imageUrl; if (!k || seen.has(k)) return; seen.add(k); fresh++; out.results.push(Object.assign({}, x, { query: p.q, family: p.family })); });
    // a result set that mostly repeats what earlier searches returned adds nothing: it counts as weak
    const repeat = results.length ? 1 - fresh / results.length : 0;
    const newGood = Math.round(q.good * (results.length ? fresh / results.length : 0));
    good += newGood; const weak = q.weak || repeat > 0.7;
    if (!weak) allWeak = false;
    if (!cached && d.cachePut && results.length) d.cachePut(cacheKey(p), results, q);
    out.queries.push({ q: p.q, family: p.family, fallback: p.fallback, cached, ok: true, status, results: results.length, newResults: fresh, quality: q, weak, why: weak ? (repeat > 0.7 ? `mostly the same pictures as the searches before (${Math.round(repeat * 100)}% repeated)` : q.why) : '' });
  }
  if (!out.stop) out.stop = 'plan complete';
  // a need the results do not meet gets its own search -- the one extra search, and only if none was spent yet
  const met = { cutout: out.results.some(x => /\.png(\?|$)/i.test(x.imageUrl) && /png|render|transparent|cut ?out|isolated/i.test(`${x.title} ${x.imageUrl}`)), bleed: out.results.some(x => x.width >= 1600 && x.height && x.width / x.height >= 1.55), alternate: out.results.some(x => /\b(side|back|rear|profile|angle|three.quarter|turnaround)\b|\b3\/4\b/i.test(x.title || '')) };
  out.needs = {};
  for (const p of plan.filter(x => x.need)) {
    out.needs[p.need] = met[p.need] ? 'met' : 'unmet';
    if (met[p.need] || out.stop === 'provider refused' || out.stop === 'daily limit') continue;
    const hit = d.cacheGet ? d.cacheGet(cacheKey(p)) : null; let results = null; let cached = false;
    if (hit && Array.isArray(hit.results)) { results = hit.results; cached = true; out.cachedQueries++; }
    else if (out.searches < budget + LIMITS.extraFallback && !(d.dailyLeft && d.dailyLeft() <= 0)) { const r = await d.search(p.q, p.licenses); out.searches++; if (!r.ok) { out.queries.push({ q: p.q, family: p.family, need: p.need, cached: false, ok: false, status: r.status, error: r.error || 'the search failed' }); break; } results = (r.results || []).slice(0, LIMITS.resultsPerSearch); }
    if (!results) break;
    results = results.filter(x => !excludedSource(x.pageUrl, x.imageUrl)); const q = assessResults(results, u); let fresh = 0;
    results.forEach(x => { if (!x.imageUrl || seen.has(x.imageUrl)) return; seen.add(x.imageUrl); fresh++; out.results.push(Object.assign({}, x, { query: p.q, family: p.family })); });
    if (!cached && d.cachePut && results.length) d.cachePut(cacheKey(p), results, q);
    out.queries.push({ q: p.q, family: p.family, need: p.need, fallback: true, cached, ok: true, status: 200, results: results.length, newResults: fresh, quality: q, weak: q.weak, why: q.weak ? q.why : '' });
    out.needs[p.need] = 'searched';
    break; // (one need search per generation)
  }
  out.good = good;
  // more(): the next family not yet searched (a fallback one included), once, within the budget -- called when fewer than
  // LIMITS.minUsable usable pictures of the subject survive the picture check
  let moreUsed = false;
  out.more = async () => {
    if (moreUsed || out.stop === 'provider refused' || out.stop === 'daily limit') return null; moreUsed = true;
    const ran = new Set(out.queries.map(q => q.q)); const p = plan.find(x => !x.need && !ran.has(x.q)); if (!p) return null;
    let results = null; let cached = false; const hit = d.cacheGet ? d.cacheGet(cacheKey(p)) : null;
    if (hit && Array.isArray(hit.results)) { results = hit.results; cached = true; out.cachedQueries++; }
    else { if (out.searches >= budget + LIMITS.extraFallback || (d.dailyLeft && d.dailyLeft() <= 0)) return null; const r = await d.search(p.q, p.licenses); out.searches++; if (!r.ok) { out.queries.push({ q: p.q, family: p.family, more: true, cached: false, ok: false, status: r.status, error: r.error || 'the search failed' }); return null; } results = (r.results || []).slice(0, LIMITS.resultsPerSearch); }
    results = results.filter(x => !excludedSource(x.pageUrl, x.imageUrl)); const q = assessResults(results, u); const fresh = [];
    results.forEach(x => { if (!x.imageUrl || seen.has(x.imageUrl)) return; seen.add(x.imageUrl); const y = Object.assign({}, x, { query: p.q, family: p.family }); fresh.push(y); out.results.push(y); });
    if (!cached && d.cachePut && results.length) d.cachePut(cacheKey(p), results, q);
    out.queries.push({ q: p.q, family: p.family, more: true, fallback: true, cached, ok: true, status: 200, results: results.length, newResults: fresh.length, quality: q, weak: q.weak, why: q.weak ? q.why : '' });
    return { results: fresh, family: p.family };
  };
  return out;
}
// how long a cached answer stays usable (days), from what it held
function cacheDaysFor(entry, cacheDays) { return entry && Number(entry.good) >= LIMITS.weakGood ? cacheDays : Math.min(cacheDays, WEAK_CACHE_DAYS); }

// ---------------------------------------------------------------- the outcome, discovery and permission apart
// candidates: webimages.discoverImages' candidates (each with verdict, permission, technical); used / review: ids
function summarise(x) {
  const s = x.search || {}; const log = x.log || {}; const cands = x.candidates || []; const used = new Set(x.used || []); const review = new Set(x.review || []);
  const v = c => c.verdict || null;
  const isExact = c => { const k = v(c); return !!(k && k.identity === 'exact' && (k.role === 'subject' || k.role === 'detail') && k.origin !== 'fan'); };
  const isFan = c => { const k = v(c); return !!(k && k.identity === 'exact' && k.origin === 'fan'); };
  const isForm = c => { const k = v(c); return !!(k && k.identity === 'form'); };
  const isLogo = c => { const k = v(c); return !!(k && (k.role === 'logo' || k.role === 'reference')); };
  const isUnrelated = c => { const k = v(c); return !!(k && (k.role === 'unrelated' || k.identity === 'other')); };
  const exact = cands.filter(isExact);
  const permOf = c => (c.permission ? c.permission.status : 'unchecked');
  const counts = {
    searchQueries: (s.queries || []).length, freshSearches: s.searches || 0, cachedSearches: s.cachedQueries || 0, weakSearches: (s.queries || []).filter(q => q.weak).length,
    rawResults: (s.queries || []).reduce((t, q) => t + (q.results || 0), 0), uniqueResults: (s.results || []).length,
    productsSkipped: log.products || 0, shortlisted: cands.length + (x.duplicates || 0), thumbnailsLoaded: cands.filter(c => c.thumb).length, thumbnailFailures: (log.thumbErrors || []).length,
    visionJudged: log.judged || cands.filter(c => v(c)).length,
    exactSubject: exact.length, fanMade: cands.filter(isFan).length, formsCosplayMerch: cands.filter(isForm).length, logos: cands.filter(isLogo).length, unrelated: cands.filter(isUnrelated).length,
    related: cands.filter(c => v(c) && !isExact(c) && !isFan(c) && !isForm(c) && !isLogo(c) && !isUnrelated(c)).length,
    permissionFree: exact.filter(c => permOf(c) === 'free').length, permissionRestricted: exact.filter(c => permOf(c) === 'restricted').length, permissionUnclear: exact.filter(c => permOf(c) === 'unclear' || permOf(c) === 'unchecked').length,
    technicalFailures: cands.filter(c => c.technical && !c.technical.fetched).length,
    autoUsed: used.size, reviewOnly: review.size,
  };
  // what was FOUND (whatever may be done with it)
  const discovery = s.error && !counts.uniqueResults ? 'search-failed' : counts.exactSubject ? 'exact-subject' : counts.fanMade ? 'fan-made-only' : counts.formsCosplayMerch ? 'forms-only' : counts.logos ? 'logos-only' : counts.related ? 'related-only' : counts.visionJudged ? 'nothing-relevant' : counts.shortlisted ? 'not-judged' : 'nothing-found';
  // what may be DONE with the exact-subject pictures
  const permission = !counts.exactSubject ? 'n/a' : counts.permissionFree ? 'free' : counts.permissionRestricted && !counts.permissionUnclear ? 'restricted' : 'unclear';
  const status = counts.autoUsed ? 'used' : discovery === 'exact-subject' ? 'found-rights-unverified' : discovery;
  return { counts, discovery, permission, status, message: messageFor(status, x.name || 'the subject', counts, s) };
}
function messageFor(status, name, c, s) {
  switch (status) {
    case 'used': return `Found pictures of ${name} whose pages state a free licence; ${c.autoUsed} ${c.autoUsed === 1 ? 'is' : 'are'} used automatically.`;
    case 'found-rights-unverified': return `We found pictures of ${name}, but their reuse rights could not be verified automatically.${c.reviewOnly ? ` ${c.reviewOnly} ${c.reviewOnly === 1 ? 'is' : 'are'} shown below: use one only if you have the right to, or upload your own.` : ' Their sites did not let the studio download them: save one from its page and upload it if you have the right to.'}`;
    case 'fan-made-only': return `We found pictures of ${name}, but only fan-made ones (${c.fanMade}), not official artwork -- they are not used automatically. Upload an official picture you have the rights to, or search again.`;
    case 'forms-only': return `We found cosplay, figures or merchandise of ${name} (${c.formsCosplayMerch}), not ${name} itself. Upload a picture of it, or search again.`;
    case 'logos-only': return `We found only logos or reference images for ${name} (${c.logos}), not ${name} itself. Upload a picture of it, or search again.`;
    case 'related-only': return `We found related pictures (${c.related}), but none showing ${name} itself. Upload a picture of it, or search again.`;
    case 'search-failed': return `The picture search did not complete${s && s.error ? `: ${s.error}` : ''}.`;
    case 'not-judged': return `We found ${c.uniqueResults} possible pictures of ${name}, but they could not be checked this time.`;
    default: return `We couldn't find pictures of ${name}${c.searchQueries ? ` in ${c.searchQueries} image searches` : ''}.`;
  }
}

// ---------------------------------------------------------------- what each judged picture becomes
// settle(candidates, curation, { record, maxReview }) -> { images, review }. A picture is used automatically ONLY when its
// page states a free licence (webimages' permission reading) AND the picture check selected it; never a fan-made one, a
// form, a logo or a watermarked preview. The best pictures of the subject itself whose terms are restricted or unclear go
// to the owner to review, marked as such -- never marked free.
function settle(candidates, c, o) {
  const opt = o || {}; const record = opt.record || (() => {}); const maxReview = opt.maxReview || 6;
  const images = [], review = [], offer = [];
  for (const v of candidates || []) {
    const k = c && c.verdicts ? c.verdicts[v.id] : null;
    if (!k) { record(v, null, 'not judged (no viewable picture)'); continue; }
    if (k.role === 'unrelated' || k.identity === 'other') { record(v, k, 'not the subject'); continue; }
    if (k.identity === 'form') { record(v, k, 'a real-world form (cosplay, figure, merchandise...), not the subject itself'); continue; }
    if (k.role === 'logo' || k.role === 'reference') { record(v, k, 'a logo, reference or interface capture'); continue; }
    if (k.identity === 'exact' && k.origin === 'fan') { record(v, k, 'fan-made, not official artwork'); continue; }
    if ((k.issues || []).includes('watermark')) { record(v, k, 'watermarked (a stock-photo preview or similar)'); continue; }
    const itself = (k.role === 'subject' || k.role === 'detail') && k.identity === 'exact';
    const free = v.permission && v.permission.status === 'free';
    if (free && v.bytes && (c.selection || []).includes(v.id)) { images.push(Object.assign({}, v, { curation: k })); record(v, k, 'used'); }
    else if (free && v.bytes) record(v, k, 'free, but not selected');
    else if (!itself) record(v, k, `supporting picture, not free (${v.permission ? v.permission.status : 'not checked'})`);
    else offer.push({ v, k });
  }
  // the best pictures of the subject itself, shown to the owner with their source and licence status (never marked free)
  offer.sort((a, b) => (b.k.origin === 'official') - (a.k.origin === 'official') || (b.k.quality || 0) - (a.k.quality || 0) || (b.v.width * b.v.height) - (a.v.width * a.v.height));
  offer.forEach(({ v, k }, n) => {
    if (n >= maxReview) { record(v, k, `suitable, not offered (beyond the ${maxReview} shown)`); return; }
    const status = v.permission ? v.permission.status : 'unclear';
    record(v, k, `offered to the owner for review (${status}${v.bytes ? '' : '; the original could not be downloaded here'})`);
    const pv = v.bytes && v.bytes.length <= 1.2 * 1024 * 1024 ? `data:${v.mime};base64,${v.bytes.toString('base64')}` : v.thumb ? `data:${v.thumb.mime};base64,${v.thumb.bytes.toString('base64')}` : '';
    review.push({ id: v.id, pageUrl: v.pageUrl, imageUrl: v.imageUrl, title: v.title, site: v.site, depicts: k.depicts, role: k.role, identity: k.identity, origin: k.origin || 'unknown', framing: k.framing || '', query: v.query || '', width: v.width, height: v.height,
      adoptable: !!v.bytes, technical: v.technical ? v.technical.reason : '',
      permission: v.permission ? { status: v.permission.status, licence: v.permission.licence, note: v.permission.note, evidence: v.permission.evidence } : { status: 'unclear', licence: '', note: 'Its page was not read.', evidence: [] }, preview: pv });
  });
  return { images, review };
}

module.exports = { settle, LIMITS, WEAK_CACHE_DAYS, PLAN_VERSION, planSearches, assessResults, runSearches, summarise, subjectType, subjectTokens, cacheKey, cacheDaysFor, messageFor };
