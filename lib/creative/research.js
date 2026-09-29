'use strict';
// CREATIVE — research for a recognizable subject (server only).
//
//   research(understanding, { fetchImpl, maxImages })  ->  {
//     status: 'ok' | 'ambiguous' | 'not_found',
//     page:   { title, url, description, license },
//     facts:  [{ id, text, section, source }]      sentences from the article, each with its source
//     options: [{ title, description }]            when the subject is ambiguous: what the owner can pick
//     images: [{ title, fileUrl, pageUrl, mime, width, height, license, licenseUrl, author, credit,
//                attributionRequired, bytes (Buffer), relevance }]
//     log:    { requests, bytes, ms }
//   }
// Sources: Wikipedia for facts (CC BY-SA, attributed on the page) and Wikimedia Commons for
// images, ONLY files whose licence allows reuse (public domain, CC0, CC BY, CC BY-SA). Only
// fixed Wikimedia hosts are contacted. Everything retrieved is data: markup is stripped to
// plain text and nothing in it is followed, executed or treated as an instruction.

const HOSTS = new Set(['en.wikipedia.org', 'commons.wikimedia.org', 'upload.wikimedia.org', 'thumb.wikimedia.org']);
const UA = 'SiteRemade-Creative/1.0 (https://www.siteremade.com; hello@siteremade.com)';
// free to reuse with credit: public domain, CC0, CC BY, CC BY-SA -- never NonCommercial or NoDerivatives
const REUSABLE = /^(?!.*\b(?:nc|nd)\b)(?:public domain|pd\b|pd-|cc0|cc[ -]by(?:[ -]sa)?\b)/i;
const TEXT_LIMIT = 14000;
// the kind of Commons picture a scene can lift out as its own layer, by what the subject is
const CUTOUT_HINT = { character: 'illustration', object: 'white background', food: 'white background', animal: 'white background', vehicle: 'white background', game: 'cover art', person: 'portrait', place: 'panorama' };
const { classifyResearch } = require('./understand');

// (pronunciations stripped from plain-text extracts leave "()" or "(; ...)" behind -- removed)
const plain = s => String(s == null ? '' : s).replace(/<[^>]*>/g, ' ').replace(/\s*\(\s*[;,]?\s*\)/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
const wikiUrl = title => `https://en.wikipedia.org/wiki/${encodeURIComponent(String(title).replace(/ /g, '_'))}`;

function makeGetter(fetchImpl, log) {
  return async function get(url, { binary, maxBytes } = {}) {
    let u; try { u = new URL(url); } catch (e) { return { ok: false, status: 0, error: 'bad url' }; }
    if (!HOSTS.has(u.hostname) || u.protocol !== 'https:') return { ok: false, status: 0, error: `host not allowed: ${u.hostname}` };
    const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), 15000);
    try {
      const res = await fetchImpl(url, { headers: { 'user-agent': UA, 'api-user-agent': UA, accept: binary ? 'image/*' : 'application/json' }, signal: ctl.signal, redirect: 'follow' });
      log.requests++;
      if (!res.ok) return { ok: false, status: res.status };
      if (binary) { const ab = await res.arrayBuffer(); if (maxBytes && ab.byteLength > maxBytes) return { ok: false, status: 413 }; log.bytes += ab.byteLength; return { ok: true, buffer: Buffer.from(ab), type: res.headers.get('content-type') || '' }; }
      const text = await res.text(); log.bytes += text.length; return { ok: true, json: JSON.parse(text) };
    } catch (e) { return { ok: false, status: 0, error: String(e && e.message || e) }; } finally { clearTimeout(timer); }
  };
}

// sentences worth stating as facts: complete, not too long, not a list fragment
// sentence boundaries, but not after an abbreviation or an initial ("Dr. Watson", "Arthur C. Doyle", "c. 1900")
// (also after an opening bracket: "on 30 June [O.S. 17 June] 1908" is one sentence)
const ABBREV = /(?:^|[\s([“".])(?:dr|mr|mrs|ms|st|jr|sr|prof|gen|col|capt|lt|sgt|mt|ft|no|vol|vs|etc|approx|ca|c|e\.g|i\.e|u\.s|u\.k|inc|ltd|co|[a-z])\.$/i;
function splitSentences(text) {
  // a sentence may hold parentheses and stops that are not boundaries ("[O.S. 17 June]", "3.5 m") -- before, text up to
  // such a stop was silently dropped
  const parts = String(text || '').replace(/\s+/g, ' ').match(/(?:\([^)]*\)|[^.!?]|[.!?](?!\s+[A-Z0-9"“(]|\s*$))+[.!?]+(?=\s+[A-Z0-9"“(]|\s*$)/g) || [];
  const out = [];
  parts.forEach(p => { if (out.length && ABBREV.test(out[out.length - 1])) out[out.length - 1] += p; else out.push(p); });
  // a "sentence" that still ends on an abbreviation was cut short ("…as early as c." before "589 when … wrote:")
  return out.map(s => s.trim()).filter(s => !ABBREV.test(s) || /\betc\.$/i.test(s));
}
// a sentence that only makes sense after the one before it ("Most are narrated by...", "It was...")
const LEANS_ON_CONTEXT = /^(it|this|that|these|those|they|them|he|she|his|her|its|their|there|such|however|also|in addition|additionally|furthermore|moreover|thus|therefore|meanwhile|all but|most|many|some|both|another|others?|the latter|the former|similarly|likewise|instead)\b/i;
function factsFromExtract(extract, page) {
  const facts = []; let section = 'Overview';
  const blocks = String(extract || '').split(/\n+/);
  for (const raw of blocks) {
    const head = /^\s*(={2,})\s*([^=]+?)\s*\1\s*$/.exec(raw);
    if (head) { section = plain(head[2]); continue; }
    if (/^(see also|references|external links|further reading|notes|bibliography|sources|citations)$/i.test(section)) continue;
    for (const s of splitSentences(plain(raw))) {
      const words = s.split(' ').length;
      if (words < 7 || words > 45) continue;
      if (LEANS_ON_CONTEXT.test(s)) continue;
      // quotations cut in half, or with editorial ellipses, are not facts on their own
      if (/\.\.\.|…/.test(s) || ((s.match(/["“”]/g) || []).length % 2) || /^["“”'\[]/.test(s)) continue;
      facts.push({ id: `f${facts.length + 1}`, text: s.trim(), section, source: { title: page.title, url: page.url, license: 'CC BY-SA 4.0 (Wikipedia)' } });
      if (facts.length >= 24) return facts;
    }
  }
  return facts;
}

const tokens = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').split(/[^a-z0-9]+/).filter(w => w.length > 2);
// words that describe a picture of the subject rather than naming something else in it
const DESCRIPTIVE = /^(the|and|with|for|from|roll|rolls|single|one|two|three|pair|white|black|red|pink|blue|green|yellow|orange|purple|brown|grey|gray|golden|silver|dark|light|bright|small|large|big|little|old|new|vintage|antique|classic|modern|original|isolated|background|studio|closeup|close|macro|view|front|side|top|back|detail|photo|photograph|picture|image|illustration|drawing|engraving|portrait|cover|art|artwork|version|edit|cropped|crop|transparent|cutout|embossed|plain|common|typical|standard|example|specimen|real|full|half|near|far|left|right|shot|snapshot|colour|color|coloured|colored|toy|model|replica|figure|statue)$/;
// Commons metadata sometimes repeats a name ("Unknown author Unknown author")
function dedupe(s) { const w = String(s || '').split(' '); for (let n = 1; n <= w.length / 2; n++) if (w.length % n === 0 && w.every((x, i) => x === w[i % n])) return w.slice(0, n).join(' '); return String(s || ''); }
function relevance(fileTitle, subjectTokens, fromPage) {
  const t = tokens(fileTitle); const hit = subjectTokens.filter(w => t.includes(w)).length;
  let r = (hit / Math.max(1, subjectTokens.length)) + (fromPage ? 0.6 : 0);
  // other nouns in the title mean the picture is of something else that involves the subject
  // ("toilet paper seedlings cup" is a plant; "pink toilet paper" is toilet paper)
  const extra = t.filter(w => !subjectTokens.includes(w) && !DESCRIPTIVE.test(w) && !/^\d+$/.test(w) && !/^(jpg|jpeg|png|webp|file|dsc|img)\d*$/.test(w));
  r -= Math.min(0.45, extra.length * 0.09);
  if (/\b(logo|icon|map|flag|signature|coat of arms|chart|graph|diagram of|seal|stamp|button|symbol)\b/i.test(fileTitle)) r -= 0.8;
  return r;
}

async function commonsInfo(get, titles, width) {
  if (!titles.length) return [];
  const url = `https://commons.wikimedia.org/w/api.php?action=query&format=json&prop=imageinfo&iiprop=url|size|mime|extmetadata&iiurlwidth=${width || 1600}&iiextmetadatafilter=LicenseShortName|LicenseUrl|Artist|Credit|AttributionRequired|UsageTerms|ImageDescription|Categories&titles=${encodeURIComponent(titles.slice(0, 40).join('|'))}`;
  const r = await get(url); if (!r.ok) return [];
  return Object.values((r.json.query && r.json.query.pages) || {}).map(p => {
    const i = (p.imageinfo || [])[0]; if (!i) return null; const m = i.extmetadata || {}; const v = k => (m[k] && m[k].value) || '';
    return { title: plain(p.title), pageUrl: i.descriptionurl, fileUrl: i.thumburl || i.url, mime: i.mime, width: i.thumbwidth || i.width, height: i.thumbheight || i.height, originalWidth: i.width, originalHeight: i.height, license: plain(v('LicenseShortName')), licenseUrl: plain(v('LicenseUrl')), author: dedupe(plain(v('Artist'))).slice(0, 200), credit: plain(v('Credit')).slice(0, 200), attributionRequired: v('AttributionRequired') !== 'false', description: plain(v('ImageDescription')).slice(0, 300), categories: plain(v('Categories')).replace(/\|/g, ', ').slice(0, 400) };
  }).filter(Boolean);
}

// what kind of picture a file is, from its name, description and Commons categories -- a wordmark named
// "The Legend of Zelda Skyward Sword.png" is still a logo, and its categories say so
const KIND_RULES = [
  ['logo', /\b(logos?|wordmarks?|logotypes?|title cards?|brand marks?)\b/i],
  ['reference', /\b(maps?|locator|diagrams?|charts?|graphs?|timelines?|infographics?|flowcharts?|schematics?|screenshots?|screen ?caps?|documents?|pdf|signatures?|coats? of arms|flags? of|icons?|seals? of)\b/i],
  ['form', /\b(cosplay(?:ers?)?|costumes?|figures?|figurines?|statues?|sculptures?|toys?|plush(?:ies)?|dolls?|replicas?|props?|balloons?|murals?|amiibo|lego|models?|exhibitions?|merchandise|mascots?)\b/i],
];
function pictureKind(i) {
  const text = `${i.title} ${i.description || ''} ${i.categories || ''}`;
  for (const [kind, re] of KIND_RULES) if (re.test(text)) return kind;
  return '';
}
// batch uploads of one shoot ("... 2025 - 20250525 1", "(Batch Edits - 174)", "HOF04609 cens") are one picture for choosing
function seriesKey(title) {
  return String(title).toLowerCase().replace(/^file:/, '').replace(/\.(jpe?g|png|webp)$/, '').replace(/\([^)]*\)/g, ' ').replace(/\b(cropped|crop|edit(?:ed)?|batch edits?|raw-export|cens|version|v\d+)\b/g, ' ').replace(/[\d_]+/g, ' ').replace(/[^a-z]+/g, ' ').trim();
}

async function research(u, opts) {
  const o = opts || {}; const log = { requests: 0, bytes: 0, ms: 0 }; const t0 = Date.now();
  const get = makeGetter(o.fetchImpl || globalThis.fetch, log);
  const done = out => Object.assign(out, { log: Object.assign(log, { ms: Date.now() - t0 }) });
  const query = String((u && u.query) || '').trim(); if (!query) return done({ status: 'not_found', facts: [], images: [], options: [] });
  // 1. the article: titles the understanding step resolved (tried in order), else the subject's own title, else search
  let summary = null;
  for (const t of (o.titles || []).slice(0, 3)) {
    const s = await get(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(String(t).replace(/ /g, '_'))}`);
    if (s.ok && s.json && s.json.type !== 'disambiguation' && s.json.type !== 'https://mediawiki.org/wiki/HyperSwitch/errors/not_found' && s.json.title) { summary = s; break; }
  }
  if (!summary) summary = await get(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(query.replace(/ /g, '_'))}`);
  if (!summary.ok || !summary.json || summary.json.type === 'https://mediawiki.org/wiki/HyperSwitch/errors/not_found') {
    const s = await get(`https://en.wikipedia.org/w/api.php?action=query&format=json&list=search&srlimit=5&srsearch=${encodeURIComponent(query)}`);
    const top = s.ok && s.json.query && s.json.query.search && s.json.query.search[0];
    if (!top) return done({ status: 'not_found', facts: [], images: [], options: [] });
    summary = await get(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(top.title.replace(/ /g, '_'))}`);
    if (!summary.ok) return done({ status: 'not_found', facts: [], images: [], options: [] });
  }
  const sj = summary.json;
  if (sj.type === 'disambiguation') {
    const s = await get(`https://en.wikipedia.org/w/api.php?action=query&format=json&list=search&srlimit=6&srsearch=${encodeURIComponent(query)}`);
    const options = ((s.ok && s.json.query && s.json.query.search) || []).filter(x => !/disambiguation/i.test(x.title)).slice(0, 5).map(x => ({ title: plain(x.title), description: plain(x.snippet).slice(0, 140) }));
    return done({ status: 'ambiguous', page: { title: plain(sj.title), url: wikiUrl(sj.title) }, facts: [], images: [], options });
  }
  const page = { title: plain(sj.title), url: (sj.content_urls && sj.content_urls.desktop && sj.content_urls.desktop.page) || wikiUrl(sj.title), description: plain(sj.description), extract: plain(sj.extract), license: 'CC BY-SA 4.0', retrieved: new Date().toISOString().slice(0, 10) };
  page.category = classifyResearch(page);
  // 2. its text, with section headings
  const ex = await get(`https://en.wikipedia.org/w/api.php?action=query&format=json&prop=extracts&explaintext=1&exsectionformat=wiki&redirects=1&titles=${encodeURIComponent(page.title)}`);
  const extract = ex.ok ? String((Object.values((ex.json.query && ex.json.query.pages) || {})[0] || {}).extract || '').slice(0, TEXT_LIMIT) : page.extract;
  const facts = factsFromExtract(extract || page.extract, page);
  if (!facts.length && page.extract) splitSentences(page.extract).slice(0, 4).forEach((s, i) => facts.push({ id: `f${i + 1}`, text: s.trim(), section: 'Overview', source: { title: page.title, url: page.url, license: 'CC BY-SA 4.0 (Wikipedia)' } }));
  if (o.textOnly) return done({ status: 'ok', page, facts, images: [], options: [] });
  // 3. images: candidates from the article's own files, a Commons search for the subject, one for a version a scene
  // can lift out as a layer, and the searches the understanding step asked for -- reusable licences only
  const subjectTokens = tokens(`${query} ${page.title}`).slice(0, 6);
  const pimg = await get(`https://en.wikipedia.org/w/api.php?action=query&format=json&prop=images&imlimit=40&redirects=1&titles=${encodeURIComponent(page.title)}`);
  const pageFiles = pimg.ok ? (Object.values((pimg.json.query && pimg.json.query.pages) || {})[0] || {}).images || [] : [];
  const fromPage = new Set(pageFiles.map(f => f.title));
  const hint = o.searchHint || CUTOUT_HINT[page.category] || 'white background';
  const commonsSearch = async q => { const r = await get(`https://commons.wikimedia.org/w/api.php?action=query&format=json&list=search&srnamespace=6&srlimit=20&srsearch=${encodeURIComponent(q)}`); return r.ok ? ((r.json.query && r.json.query.search) || []).map(x => x.title) : []; };
  const hinted = new Set(await commonsSearch(`${page.title} ${hint}`));
  const searchFiles = await commonsSearch(page.title);
  // searches the understanding step asked for (the subject's real-world forms, settings, signature objects) -- at most four
  const byQuery = new Map();
  for (const q of (o.queries || []).slice(0, 4)) (await commonsSearch(String(q).slice(0, 100))).forEach(t => { if (!byQuery.has(t)) byQuery.set(t, String(q)); });
  const titles = [...new Set([...hinted, ...fromPage, ...byQuery.keys(), ...searchFiles])].filter(t => /\.(jpe?g|png|webp)$/i.test(t));
  const all = (await commonsInfo(get, titles.slice(0, 40))).concat(titles.length > 40 ? await commonsInfo(get, titles.slice(40, 80)) : []);
  // (diagnostics: o.trace collects every candidate and why it was kept or dropped)
  const trace = Array.isArray(o.trace) ? o.trace : null;
  const foundBy = t => (hinted.has(t) ? 'commons-search:layer' : fromPage.has(t) ? 'article' : byQuery.has(t) ? 'commons-search:directed' : 'commons-search');
  const diag = { queries: [`${page.title} ${hint}`, page.title].concat((o.queries || []).slice(0, 4).map(String)), found: titles.length, refused: { licence: 0, type: 0, small: 0 }, lowRelevance: 0, sameSeries: 0, shortlisted: 0, judged: [], rankedOut: [], forms: 0 };
  const infos = all.filter(i => {
    const why = !REUSABLE.test(i.license) ? 'licence: ' + (i.license || 'none') : !/^image\/(jpeg|png|webp)$/.test(i.mime) ? 'type: ' + i.mime : (i.originalWidth || 0) < 300 ? 'too small: ' + i.originalWidth + 'px' : '';
    if (why) diag.refused[/^licence/.test(why) ? 'licence' : /^type/.test(why) ? 'type' : 'small']++;
    if (why && trace) trace.push({ title: i.title, dropped: why, found: foundBy(i.title) });
    return !why;
  });
  // relevance: the subject's words -- and for a directed search, that search's own words -- in the file's name,
  // description and categories. A picture matching neither is dropped however large it is (a flat score for directed
  // results let fourteen 9504-px festival photos beat a cosplay photo of the subject). Logos and references rank low.
  infos.forEach(i => {
    i.kind = pictureKind(i); i.found = foundBy(i.title); i.series = seriesKey(i.title);
    const words = tokens(i.title + ' ' + (i.description || '') + ' ' + (i.categories || ''));
    const subjectShare = subjectTokens.filter(w => words.includes(w)).length / Math.max(1, subjectTokens.length);
    let r = relevance(i.title, subjectTokens, fromPage.has(i.title));
    const q = byQuery.get(i.title);
    if (q) { const qt = tokens(q).filter(w => !DESCRIPTIVE.test(w)); const qs = qt.length ? qt.filter(w => words.includes(w)).length / qt.length : 0; r = Math.max(r, 0.15 + 0.55 * qs + 0.35 * subjectShare); }
    else if (r < 0.5) r = Math.max(r, 0.2 + 0.4 * subjectShare);
    if (i.kind === 'logo') r -= 0.5; else if (i.kind === 'reference') r -= 0.35;
    i.relevance = +(r + (hinted.has(i.title) ? 0.2 : 0)).toFixed(2);
  });
  const byScore = (a, b) => b.relevance - a.relevance || (b.originalWidth * b.originalHeight) - (a.originalWidth * a.originalHeight);
  const perSeries = new Map();
  const good = infos.filter(i => i.relevance > 0.3).sort(byScore).filter(i => { const n = (perSeries.get(i.series) || 0) + 1; perSeries.set(i.series, n); return n <= 2; });
  const max = o.maxImages || 6;
  let picked = null, curation = null;
  if (o.curate && good.length) {
    // a shortlist balanced across where the candidates came from, judged from small thumbnails before any download
    const quota = { 'commons-search:layer': 4, 'commons-search:directed': 8, article: 4, 'commons-search': 4 }; const used = {};
    const short = good.filter(i => { used[i.found] = (used[i.found] || 0) + 1; return used[i.found] <= quota[i.found]; }).slice(0, 16);
    diag.shortlisted = short.length;
    // candidates that ranked below the shortlist were never looked at: named, so a reviewer can check what was missed
    diag.rankedOut = good.filter(i => !short.includes(i)).slice(0, 8).map(i => ({ title: i.title, relevance: i.relevance, size: i.originalWidth + 'x' + i.originalHeight, found: i.found }));
    const small = new Map((await commonsInfo(get, short.map(i => i.title), 330)).map(x => [x.title, x.fileUrl]));
    const cands = [];
    for (const [k, i] of short.entries()) {
      const url = small.get(i.title); if (!url) continue;
      const t = await get(url, { binary: true, maxBytes: 300 * 1024 });
      if (t.ok && /^image\/(jpeg|png|webp)/.test(t.type)) cands.push({ id: 'c' + (k + 1), info: i, title: i.title, description: `${i.description || ''}${i.author ? ` -- author: ${String(i.author).slice(0, 80)}` : ''}${i.credit ? ` -- credit: ${String(i.credit).slice(0, 80)}` : ''}`, categories: i.categories, size: i.originalWidth + 'x' + i.originalHeight, thumb: { mime: t.type.split(';')[0], bytes: t.buffer } });
    }
    try { curation = await o.curate({ candidates: cands, max }); } catch (e) { curation = { error: String(e && e.message || e).slice(0, 160) }; }
    if (curation && !curation.error) {
      cands.forEach(c => { const v = curation.verdicts && curation.verdicts[c.id]; if (v) c.info.curation = v; });
      if (o.fictional) cands.forEach(c => { const v = c.info.curation; if (v && v.identity === 'exact' && v.origin !== 'fan' && /\bown work\b/i.test(c.info.credit || '')) { v.origin = 'fan'; v.originBy = 'Commons credits it as an individual\'s own work'; } });
      const byId = new Map(cands.map(c => [c.id, c.info]));
      // a real-world form (cosplay, figure, merchandise...) is never downloaded as a picture of the subject
      picked = (curation.selection || []).map(id => byId.get(id)).filter(i => i && !(i.curation && (i.curation.identity === 'form' || (i.curation.identity === 'exact' && i.curation.origin === 'fan'))));
      cands.forEach(c => { const v = c.info.curation; if (v && v.identity === 'form') diag.forms++;
        diag.judged.push({ src: 'commons', title: c.title, pageUrl: c.info.pageUrl, found: c.info.found, query: byQuery.get(c.title) || '', size: c.size, licence: c.info.license, author: String(c.info.author || '').slice(0, 80),
          verdict: v ? { role: v.role, identity: v.identity, origin: v.origin || 'unknown', depicts: v.depicts, issues: v.issues, quality: v.quality } : null,
          outcome: !v ? 'not judged' : picked.includes(c.info) ? 'used' : v.identity === 'form' ? 'a real-world form, not the subject itself' : v.identity === 'exact' && v.origin === 'fan' ? 'fan-made, not official artwork' : v.identity === 'other' || v.role === 'unrelated' ? 'not the subject' : 'not selected' }); });
      if (!picked.length) picked = null;
    }
  }
  if (!picked) {
    // no curation (switched off, over budget, failed): the ranking alone -- half the downloads pictures a scene can
    // use as a separate layer, a couple of the directed results, the rest the best of the others
    const layerish = good.filter(i => i.found === 'commons-search:layer').slice(0, Math.ceil(max / 2));
    const directedPick = good.filter(i => i.found === 'commons-search:directed' && !layerish.includes(i)).slice(0, o.queries && o.queries.length ? 2 : 0);
    picked = layerish.concat(directedPick, good.filter(i => !layerish.includes(i) && !directedPick.includes(i)).slice(0, Math.max(0, max - layerish.length - directedPick.length)));
  }
  if (trace) infos.forEach(i => trace.push({ title: i.title, found: i.found, kind: i.kind, relevance: i.relevance, size: i.originalWidth + 'x' + i.originalHeight, license: i.license, picked: picked.includes(i), role: i.curation && (i.curation.role + '/' + i.curation.identity), depicts: i.curation && i.curation.depicts, dropped: i.relevance <= 0.3 ? 'relevance' : !good.includes(i) ? 'same series' : picked.includes(i) ? '' : 'not chosen' }));
  const images = [];
  for (const i of picked.slice(0, max)) {
    const r = await get(i.fileUrl, { binary: true, maxBytes: 4 * 1024 * 1024 });
    if (r.ok && /^image\//.test(r.type)) images.push(Object.assign({}, i, { bytes: r.buffer, mime: r.type.split(';')[0] }));
    if (log.bytes > 16 * 1024 * 1024) break;
  }
  diag.lowRelevance = infos.filter(i => i.relevance <= 0.3).length; diag.sameSeries = infos.filter(i => i.relevance > 0.3 && !good.includes(i)).length;
  if (curation && curation.error) diag.checkError = curation.error;
  const cur = curation && !curation.error ? { source: 'ai', coverage: curation.coverage, missing: curation.missing || [], note: curation.note || '', judged: curation.judged, of: curation.of }
    : { source: 'rules', reason: curation && curation.error ? 'the picture check failed (' + curation.error + ')' : o.curate ? 'no candidates to judge' : 'picture check off' };
  return done({ status: 'ok', page, facts, images, options: [], curation: cur, diagnostics: diag });
}

// Where did the pictures of the subject stop? Judged from the recorded evidence, stage by stage -- never lumped into
// "no pictures" or "copyright". depiction = the check saw the subject itself (for a character: its artwork, render,
// sprite or still), not a real-world form of it.
function pictureStage(commons, web) {
  const judged = [].concat((commons && commons.judged) || [], (web && web.candidates) || []);
  const depicts = judged.filter(x => x.verdict && x.verdict.identity === 'exact' && (x.verdict.role === 'subject' || x.verdict.role === 'detail') && x.verdict.origin !== 'fan');
  const fans = judged.filter(x => x.verdict && x.verdict.identity === 'exact' && x.verdict.origin === 'fan').length;
  const used = depicts.filter(x => x.outcome === 'used');
  const forms = judged.filter(x => x.verdict && x.verdict.identity === 'form').length;
  const count = src => judged.filter(x => x.src === src).length;
  const providerError = (web && (web.searchError || (web.stop === 'refusal' ? 'the search model declined' : ''))) || (commons && commons.checkError) || '';
  // the web's own evidence, whatever the verdict: pages that refused access, pictures too small or unreadable
  const pe = (web && web.pageErrors) || [], ie = (web && web.imageErrors) || [];
  const refused = pe.filter(e => /HTTP (401|403|429)/.test(e)).length, small = ie.filter(e => /too small/.test(e)).length;
  const webNote = web && web.pagesChosen ? ` Web: ${web.pagesChosen} pages chosen${refused ? `, ${refused} refused access (HTTP 401/403/429)` : ''}${pe.length - refused ? `, ${pe.length - refused} unreadable` : ''}${small ? `, ${small} picture(s) too small (under 300 px)` : ''}.` : '';
  if (used.length) return { stage: 'none', note: `${used.length} picture(s) of the subject itself are usable automatically` };
  if (depicts.some(x => x.src === 'web' && x.permission && x.permission.status !== 'free')) {
    const byStatus = {}; depicts.filter(x => x.src === 'web').forEach(x => { byStatus[x.permission.status] = (byStatus[x.permission.status] || 0) + 1; });
    return { stage: 'permission', note: `found ${depicts.length} picture(s) showing the subject itself, but none states a free licence for that picture (${Object.entries(byStatus).map(([k, n]) => n + ' ' + k).join(', ')})` + webNote };
  }
  if (depicts.length) return { stage: 'selection', note: `${depicts.length} picture(s) showing the subject were judged but not used (${depicts.map(x => x.outcome).join('; ')})` + webNote };
  if (providerError) return { stage: 'provider', note: `a provider step failed or declined: ${providerError}` + webNote };
  if (forms || fans) return { stage: 'identity', note: `only ${[forms ? `real-world forms (${forms}: cosplay, figures, merchandise and the like)` : '', fans ? `fan-made pictures (${fans})` : ''].filter(Boolean).join(' and ')} were found -- no official depiction of the subject itself` + webNote };
  return { stage: 'discovery', note: `no candidate showed the subject (${count('commons')} Commons and ${count('web')} web pictures looked at)` + webNote };
}

module.exports = { pictureStage, research, factsFromExtract, splitSentences, relevance, plain, REUSABLE, HOSTS, commonsInfo, makeGetter };
