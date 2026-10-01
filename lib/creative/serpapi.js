'use strict';
// CREATIVE — Google Images through SerpApi (server only).
//
// https://serpapi.com/google-images-api : GET https://serpapi.com/search?engine=google_images&q=...&api_key=...
// Each images_results item carries title, link (the page it is on), original (+ original_width/height),
// thumbnail, source and is_product. `licenses` narrows to Google's usage-rights filter (cl = Creative Commons);
// that filter is a search hint only -- permission is still judged from what each page states (webimages.js).
// HTTP 401 = bad key, 403 = no permission, 429 = hourly limit OR the account ran out of searches.
// Cached searches (same query within an hour) are free; a search with no results still counts.
//
// The key comes from the server's environment (SERPAPI_API_KEY) and is never logged, returned or stored: every error
// text is scrubbed of it before it leaves this module.

const ENDPOINT = 'https://serpapi.com/search';

function scrub(text, key) { let s = String(text || ''); if (key) s = s.split(key).join('[key]'); return s.replace(/api_key=[^&\s"]+/g, 'api_key=[key]').slice(0, 200); }

// the queries for a subject: the discovery plan (discovery.js) -- distinct intents for the subject itself, primary
// families first ("Link (The Legend of Zelda)" -> "Link The Legend of Zelda ...", "BMO" + "Adventure Time")
function searchQueries(u, max) {
  return require('./discovery').planSearches(u || {}).slice(0, Math.max(1, max || 3)).map(p => ({ q: p.q, licenses: p.licenses }));
}

// one search -> { ok, status, results: [{ title, pageUrl, imageUrl, thumbUrl, width, height, source, isProduct, position }], error }
async function googleImages(q, o) {
  const key = o && o.key; if (!key) return { ok: false, status: 0, results: [], error: 'SERPAPI_API_KEY is not configured on this server' };
  const params = new URLSearchParams({ engine: 'google_images', q: String(q).slice(0, 200), hl: 'en', gl: 'us', safe: 'active', ijn: '0' });
  if (o.licenses) params.set('licenses', o.licenses);
  params.set('api_key', key);
  const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), o.timeoutMs || 45000); // a fresh Google Images search can take 20-30 s
  try {
    const res = await (o.fetchImpl || globalThis.fetch)(`${ENDPOINT}?${params}`, { signal: ctl.signal, headers: { accept: 'application/json' } });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.error) {
      const why = res.status === 401 ? 'the SerpApi key was refused (401)' : res.status === 403 ? 'the SerpApi account has no permission for this (403)' : res.status === 429 ? 'SerpApi limit reached: hourly throughput or the plan\'s monthly searches (429)' : `SerpApi returned ${res.status}`;
      // an empty result is reported by SerpApi as an "error" text with HTTP 200: that is a search with nothing found
      if (res.ok && /hasn't returned any results/i.test(String(data.error))) return { ok: true, status: 200, results: [], error: '' };
      return { ok: false, status: res.status, results: [], error: scrub(`${why}${data.error ? ': ' + data.error : ''}`, key) };
    }
    const results = (Array.isArray(data.images_results) ? data.images_results : []).slice(0, 40).map(x => ({
      title: String(x.title || '').slice(0, 160), pageUrl: String(x.link || ''), imageUrl: String(x.original || ''), thumbUrl: String(x.thumbnail || ''),
      width: Number(x.original_width) || 0, height: Number(x.original_height) || 0, source: String(x.source || '').slice(0, 80), isProduct: !!x.is_product, position: Number(x.position) || 0,
    })).filter(x => /^https:\/\//.test(x.pageUrl) && /^https?:\/\//.test(x.imageUrl));
    return { ok: true, status: res.status, results, error: '' };
  } catch (e) {
    return { ok: false, status: 0, results: [], error: scrub(e && e.name === 'AbortError' ? 'SerpApi did not answer in time' : `SerpApi request failed: ${e && e.message || e}`, key) };
  } finally { clearTimeout(timer); }
}

// one Google WEB search for a name -- what the open web says it is (identity.js reads it; nothing here is a picture):
// -> { ok, status, kg: { title, type, description } | null, results: [{ link, title, snippet }], error }
async function googleWeb(q, o) {
  const key = o && o.key; if (!key) return { ok: false, status: 0, kg: null, results: [], error: 'SERPAPI_API_KEY is not configured on this server' };
  const params = new URLSearchParams({ engine: 'google', q: String(q).slice(0, 120), hl: 'en', gl: 'us', safe: 'active', num: '10' });
  params.set('api_key', key);
  const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), o.timeoutMs || 20000);
  try {
    const res = await (o.fetchImpl || globalThis.fetch)(`${ENDPOINT}?${params}`, { signal: ctl.signal, headers: { accept: 'application/json' } });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.error) {
      if (res.ok && /hasn't returned any results/i.test(String(data.error))) return { ok: true, status: 200, kg: null, results: [], error: '' };
      return { ok: false, status: res.status, kg: null, results: [], error: scrub(`SerpApi returned ${res.status}${data.error ? ': ' + data.error : ''}`, key) };
    }
    const g = data.knowledge_graph; const kg = g && (g.title || g.type) ? { title: String(g.title || '').slice(0, 120), type: String(g.type || '').slice(0, 120), description: String(g.description || '').slice(0, 240) } : null;
    const results = (Array.isArray(data.organic_results) ? data.organic_results : []).slice(0, 10).map(x => ({ link: String(x.link || '').slice(0, 300), title: String(x.title || '').slice(0, 160), snippet: String(x.snippet || '').slice(0, 300) })).filter(x => /^https?:\/\//.test(x.link));
    return { ok: true, status: res.status, kg, results, error: '' };
  } catch (e) {
    return { ok: false, status: 0, kg: null, results: [], error: scrub(e && e.name === 'AbortError' ? 'SerpApi did not answer in time' : `SerpApi request failed: ${e && e.message || e}`, key) };
  } finally { clearTimeout(timer); }
}

module.exports = { googleImages, googleWeb, searchQueries, scrub };
