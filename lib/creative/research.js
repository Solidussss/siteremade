'use strict';
// CREATIVE — research for a recognizable subject (server only): FACTS AND IDENTITY ONLY.
//
//   research(understanding, { fetchImpl, titles })  ->  {
//     status: 'ok' | 'ambiguous' | 'not_found',
//     page:   { title, url, description, license },
//     facts:  [{ id, text, section, source }]      sentences from the article, each with its source
//     options: [{ title, description }]            when the subject is ambiguous: what the owner can pick
//     log:    { requests, bytes, ms }
//   }
// Source: Wikipedia, for facts (CC BY-SA, attributed on the page) and for who or what the subject is. Wikipedia and
// Wikimedia Commons are NOT a picture source for Creative: pictures come from Google Images through SerpApi
// (discovery.js / webimages.js) or from the owner. Only en.wikipedia.org is contacted. Everything retrieved is data:
// markup is stripped to plain text and nothing in it is followed, executed or treated as an instruction.

const HOSTS = new Set(['en.wikipedia.org']);
const UA = 'SiteRemade-Creative/1.0 (https://www.siteremade.com; hello@siteremade.com)';
const TEXT_LIMIT = 14000;
const { classifyResearch } = require('./understand');

// (pronunciations stripped from plain-text extracts leave "()" or "(; ...)" behind -- removed)
const plain = s => String(s == null ? '' : s).replace(/<[^>]*>/g, ' ').replace(/\s*\(\s*[;,]?\s*\)/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
const wikiUrl = title => `https://en.wikipedia.org/wiki/${encodeURIComponent(String(title).replace(/ /g, '_'))}`;

function makeGetter(fetchImpl, log) {
  return async function get(url) {
    let u; try { u = new URL(url); } catch (e) { return { ok: false, status: 0, error: 'bad url' }; }
    if (!HOSTS.has(u.hostname) || u.protocol !== 'https:') return { ok: false, status: 0, error: `host not allowed: ${u.hostname}` };
    const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), 15000);
    try {
      const res = await fetchImpl(url, { headers: { 'user-agent': UA, 'api-user-agent': UA, accept: 'application/json' }, signal: ctl.signal, redirect: 'follow' });
      log.requests++;
      if (!res.ok) return { ok: false, status: res.status };
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
// whether an article title names the searched subject: most of the query's words (loosely: "doughnuts" ~ "doughnut")
// appear in the title itself
function namesSubject(title, query) {
  const q = tokens(query).filter(w => !['the', 'and', 'for', 'page', 'about', 'fan', 'site', 'website'].includes(w)); if (!q.length) return false;
  const t = tokens(title); const stem = w => w.replace(/(es|s)$/, '').slice(0, 6);
  const hits = q.filter(w => t.some(x => stem(x) === stem(w) || x.startsWith(stem(w)) || w.startsWith(stem(x)))).length;
  return hits >= Math.max(1, Math.ceil(q.length * 0.6));
}
async function research(u, opts) {
  const o = opts || {}; const log = { requests: 0, bytes: 0, ms: 0 }; const t0 = Date.now();
  const get = makeGetter(o.fetchImpl || globalThis.fetch, log);
  const done = out => Object.assign(out, { log: Object.assign(log, { ms: Date.now() - t0 }) });
  const query = String((u && u.query) || '').trim(); if (!query) return done({ status: 'not_found', facts: [], options: [] });
  // 1. the article: titles the understanding step resolved (tried in order), else the subject's own title, else search
  let summary = null;
  for (const t of (o.titles || []).slice(0, 3)) {
    const s = await get(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(String(t).replace(/ /g, '_'))}`);
    if (s.ok && s.json && s.json.type !== 'disambiguation' && s.json.type !== 'https://mediawiki.org/wiki/HyperSwitch/errors/not_found' && s.json.title) { summary = s; break; }
  }
  if (!summary) summary = await get(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(query.replace(/ /g, '_'))}`);
  if (!summary.ok || !summary.json || summary.json.type === 'https://mediawiki.org/wiki/HyperSwitch/errors/not_found') {
    const s = await get(`https://en.wikipedia.org/w/api.php?action=query&format=json&list=search&srlimit=5&srsearch=${encodeURIComponent(query)}`);
    // a full-text hit is the subject only when its TITLE names it: "Neegy" must not become the article on a rapper whose
    // birth name is Neegy Neegyson (the text matched, the subject did not) -- that would bring wrong facts and pictures
    const top = s.ok && s.json.query && s.json.query.search && s.json.query.search.find(x => namesSubject(x.title, query));
    if (!top) return done({ status: 'not_found', facts: [], options: [] });
    summary = await get(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(top.title.replace(/ /g, '_'))}`);
    if (!summary.ok) return done({ status: 'not_found', facts: [], options: [] });
  }
  const sj = summary.json;
  if (sj.type === 'disambiguation') {
    const s = await get(`https://en.wikipedia.org/w/api.php?action=query&format=json&list=search&srlimit=6&srsearch=${encodeURIComponent(query)}`);
    const options = ((s.ok && s.json.query && s.json.query.search) || []).filter(x => !/disambiguation/i.test(x.title)).slice(0, 5).map(x => ({ title: plain(x.title), description: plain(x.snippet).slice(0, 140) }));
    return done({ status: 'ambiguous', page: { title: plain(sj.title), url: wikiUrl(sj.title) }, facts: [], options });
  }
  const page = { title: plain(sj.title), url: (sj.content_urls && sj.content_urls.desktop && sj.content_urls.desktop.page) || wikiUrl(sj.title), description: plain(sj.description), extract: plain(sj.extract), license: 'CC BY-SA 4.0', retrieved: new Date().toISOString().slice(0, 10) };
  page.category = classifyResearch(page);
  // 2. its text, with section headings
  const ex = await get(`https://en.wikipedia.org/w/api.php?action=query&format=json&prop=extracts&explaintext=1&exsectionformat=wiki&redirects=1&titles=${encodeURIComponent(page.title)}`);
  const extract = ex.ok ? String((Object.values((ex.json.query && ex.json.query.pages) || {})[0] || {}).extract || '').slice(0, TEXT_LIMIT) : page.extract;
  const facts = factsFromExtract(extract || page.extract, page);
  if (!facts.length && page.extract) splitSentences(page.extract).slice(0, 4).forEach((s, i) => facts.push({ id: `f${i + 1}`, text: s.trim(), section: 'Overview', source: { title: page.title, url: page.url, license: 'CC BY-SA 4.0 (Wikipedia)' } }));
  return done({ status: 'ok', page, facts, options: [] });
}

// Where did the pictures of the subject stop? Judged from the recorded Google Images evidence, stage by stage -- never
// lumped into "no pictures" or "copyright". depiction = the check saw the subject itself (for a character: its artwork,
// render, sprite or still), not a real-world form of it.
function pictureStage(web) {
  const judged = (web && web.candidates) || [];
  const depicts = judged.filter(x => x.verdict && x.verdict.identity === 'exact' && (x.verdict.role === 'subject' || x.verdict.role === 'detail') && x.verdict.origin !== 'fan');
  const fans = judged.filter(x => x.verdict && x.verdict.identity === 'exact' && x.verdict.origin === 'fan').length;
  const used = depicts.filter(x => x.outcome === 'used');
  const forms = judged.filter(x => x.verdict && x.verdict.identity === 'form').length;
  const providerError = (web && (web.searchError || (web.stop === 'refusal' ? 'the search model declined' : ''))) || '';
  // the web's own evidence, whatever the verdict: pages that refused access, pictures too small or unreadable
  const pe = (web && web.pageErrors) || [], ie = (web && web.imageErrors) || [];
  const refused = pe.filter(e => /HTTP (401|403|429)/.test(e)).length, small = ie.filter(e => /too small/.test(e)).length;
  const webNote = web && web.pagesChosen ? ` Web: ${web.pagesChosen} pages chosen${refused ? `, ${refused} refused access (HTTP 401/403/429)` : ''}${pe.length - refused ? `, ${pe.length - refused} unreadable` : ''}${small ? `, ${small} picture(s) too small (under 300 px)` : ''}.` : '';
  if (used.length) return { stage: 'none', note: `${used.length} picture(s) of the subject itself are usable automatically` };
  if (depicts.some(x => x.permission && x.permission.status !== 'free')) {
    const byStatus = {}; depicts.forEach(x => { const st = x.permission ? x.permission.status : 'unclear'; byStatus[st] = (byStatus[st] || 0) + 1; });
    return { stage: 'permission', note: `found ${depicts.length} picture(s) showing the subject itself, but none states a free licence for that picture (${Object.entries(byStatus).map(([k, n]) => n + ' ' + k).join(', ')})` + webNote };
  }
  if (depicts.length) return { stage: 'selection', note: `${depicts.length} picture(s) showing the subject were judged but not used (${depicts.map(x => x.outcome).join('; ')})` + webNote };
  if (providerError) return { stage: 'provider', note: `a provider step failed or declined: ${providerError}` + webNote };
  if (forms || fans) return { stage: 'identity', note: `only ${[forms ? `real-world forms (${forms}: cosplay, figures, merchandise and the like)` : '', fans ? `fan-made pictures (${fans})` : ''].filter(Boolean).join(' and ')} were found -- no official depiction of the subject itself` + webNote };
  return { stage: 'discovery', note: `no candidate showed the subject (${judged.length} pictures looked at)` + webNote };
}

module.exports = { pictureStage, research, factsFromExtract, splitSentences, namesSubject, plain, HOSTS, makeGetter };
