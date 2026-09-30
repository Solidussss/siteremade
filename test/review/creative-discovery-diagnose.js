'use strict';
// PICTURE-DISCOVERY DIAGNOSTICS -- not part of `npm test`.
//   node test/review/creative-discovery-diagnose.js [subject ...]        (default: Neegy, Super Smash Bros Ultimate)
// For each subject, the pipeline stage by stage with the count at every stage: the encyclopedia lookup (real, free),
// the search plan, the Google Images searches, the shortlist, thumbnails, the picture check, rights, downloads, what
// is used automatically and what goes to the owner to review.
//   With SERPAPI_API_KEY and ANTHROPIC_API_KEY in the environment it runs the REAL searches (at most three, plus one
//   fallback, per subject -- counted against the SerpApi plan) and ONE real picture check per subject (a cheap vision
//   call). Keys are read from the environment only and never printed.
//   Without them, the searches and the check are replayed from the controlled fixtures (test/fixtures/
//   creative-discovery.js) and every line says so: those numbers are not the live web's.
const D = require('../../lib/creative/discovery');
const serp = require('../../lib/creative/serpapi');
const ai = require('../../lib/creative/ai');
const { discoverImages } = require('../../lib/creative/webimages');
const { research } = require('../../lib/creative/research');
const FX = require('../fixtures/creative-discovery');

const SERP = String(process.env.SERPAPI_API_KEY || '').trim(); const ANTH = String(process.env.ANTHROPIC_API_KEY || '').trim();
const live = !!(SERP && ANTH);
const subjects = process.argv.slice(2).length ? process.argv.slice(2) : ['Neegy', 'Super Smash Bros Ultimate'];
// what the understanding step says about each (the AI step itself is not re-run here: it is given, and printed)
const KNOWN = { neegy: FX.NEEGY.understanding, 'super smash bros ultimate': FX.SSBU.understanding };

async function modelCall({ model, system, content, tool, maxTokens, timeoutMs }) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), timeoutMs || 60000); const t0 = Date.now();
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', signal: ctl.signal, headers: { 'x-api-key': ANTH, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model, max_tokens: maxTokens, thinking: { type: 'disabled' }, system: [{ type: 'text', text: system }], messages: [{ role: 'user', content }], tools: [tool], tool_choice: { type: 'tool', name: tool.name } }) });
    const data = await r.json().catch(() => ({})); if (!r.ok) throw new Error((data.error && data.error.message) || `HTTP ${r.status}`);
    const block = (data.content || []).find(b => b.type === 'tool_use'); if (!block) throw new Error('no structured output');
    return { input: block.input, usage: data.usage || {}, model: data.model || model, ms: Date.now() - t0 };
  } finally { clearTimeout(t); }
}

(async () => {
  console.log(live ? 'LIVE: real Google Images searches and a real picture check' : 'NO KEYS: searches and the picture check are REPLAYED from the controlled fixtures (not live numbers); the encyclopedia lookup is real');
  for (const name of subjects) {
    const key = name.toLowerCase(); const u = Object.assign({}, KNOWN[key] || { identity: { name, kind: 'recognizable' } });
    console.log(`\n=== ${name}`);
    // 1. the encyclopedia (real, free)
    const r = await research({ query: name, kind: u.kind }, { textOnly: true, titles: (u.research && u.research.wikipediaTitles) || [] }).catch(e => ({ status: 'error', error: e.message }));
    console.log(`encyclopedia: ${r.status}${r.page ? ` -> "${r.page.title}"` : ''} (${(r.facts || []).length} facts)`);
    if (r.page) u.pageTitle = r.page.title;
    // 2. the plan
    const plan = D.planSearches(u); console.log(`type: ${D.subjectType(u)}; plan: ${plan.map(p => `${p.fallback ? '[fallback] ' : ''}${p.family}: "${p.q.replace(/ -\S+/g, '').trim()}"`).join(' | ')}`);
    // 3. the searches
    const fx = key === 'neegy' ? FX.NEEGY : key === 'super smash bros ultimate' ? FX.SSBU : null;
    if (!live && !fx) { console.log('(no fixture for this subject and no keys: nothing more to run)'); continue; }
    const search = live ? (q, licenses) => serp.googleImages(q, { key: SERP, licenses }) : FX.fakeSearch(fx);
    let run = null;
    const curate = live ? ({ candidates, max }) => ai.curate({ identity: u.identity, visuals: u.visuals, max, candidates }, { limits: ai.limits(process.env), call: modelCall })
      : async ({ candidates }) => { const verdicts = {}; candidates.forEach(c => { const t = c.title + ' ' + String(c.description).replace(/; found by the search[\s\S]*$/, ''); verdicts[c.id] = /deviantart|artstation|newgrounds|pixiv|fan ?art|redraw|drawing|fan poster/i.test(t) ? { role: 'subject', identity: 'exact', origin: 'fan' } : /cosplay|figure|amiibo|plush|keychain|t-shirt|merch/i.test(t) ? { role: 'subject', identity: 'form', origin: 'unknown' } : /Switch game|Controller|poster for sale|Nintendo Switch$/i.test(t) ? { role: 'supporting', identity: 'related', origin: 'unknown' } : { role: 'subject', identity: 'exact', origin: /nintendo|smashbros|knowyourmeme/i.test(t) ? 'official' : 'unknown', quality: 3, issues: [] }; }); return { verdicts, selection: Object.keys(verdicts).filter(id => verdicts[id].identity === 'exact' && verdicts[id].origin !== 'fan').slice(0, 8), missing: [] }; };
    const offline = !live ? { fetchThumb: async u2 => ({ ok: true, url: u2, body: Buffer.from('thumb' + u2), mime: 'image/png', width: 200, height: 200 }), fetch: async u2 => ({ ok: true, url: u2, body: Buffer.from('<html><body>no licence stated</body></html>') }), fetchImg: async u2 => ({ ok: true, url: u2, body: Buffer.from('img' + u2), mime: 'image/png', width: 1600, height: 900 }) } : {};
    const found = await discoverImages({ identity: u.identity }, Object.assign({ imageSearch: async () => { run = await D.runSearches(u, { search, budget: 3 }); return { results: run.results, searches: run.searches, error: run.error }; }, curate }, offline));
    run.queries.forEach(q => console.log(`  search ${q.family}${q.fallback ? ' (fallback)' : ''}${q.cached ? ' (cached)' : ''}: ${q.ok === false ? `FAILED ${q.error}` : `${q.results} results, ${q.newResults} new, ${q.quality.good} usable -- products ${q.quality.products}, stock ${q.quality.stock}, fan sites ${q.quality.fanHosts}, forms ${q.quality.forms}, logos ${q.quality.logos}, small ${q.quality.small}, off-topic ${q.quality.offTopic}${q.weak ? ` => WEAK: ${q.why}` : ''}`}`));
    console.log(`  stop: ${run.stop}`);
    const settled = D.settle(found.candidates, found.curation);
    const sum = D.summarise({ name: u.identity.name, search: run, log: found.log, candidates: found.candidates, used: settled.images.map(v => v.id), review: settled.review.map(v => v.id) });
    console.log('  counts:', JSON.stringify(sum.counts));
    console.log(`  discovery: ${sum.discovery} | permission: ${sum.permission} | status: ${sum.status}`);
    console.log(`  owner sees: "${sum.message}"`);
  }
})();
