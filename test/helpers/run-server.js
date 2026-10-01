'use strict';
// Runs the REAL server.js route table in a child process for integration
// tests, with the two paid providers replaced at the network edge (only
// api.openai.com and api.anthropic.com are intercepted -- plus, when
// SUPABASE_URL is set, Supabase's /auth/v1/user token check -- everything
// else, including the database, asset store, auth and credits, is the real
// code).
//   MOCK_PLANNER = success | malformed | error   (default success). On success the
//     plan is the fixture whose business name the request mentions (Fizzwell,
//     Greenline Landscapes), else FIZZWELL_PLAN. Any other Claude tool (the
//     premium critics) answers 529, so those paths take their no-Claude fallback.
//   MOCK_IMAGE_DELAY_MS = ms before a mock image response (default 0)
//   MOCK_REFINEMENT_IMAGE_SLOT = slot the mock Workplace-edit plan regenerates (default hero)
//   MOCK_REFINEMENT_COPY = a hero headline the mock Workplace-edit plan also sets (unset: the update is only a picture)
//   MOCK_SUPABASE_USER_ID / MOCK_SUPABASE_EMAIL = the identity any bearer token verifies as
//   MOCK_REDESIGN = premium | editorial | creative | hero | noop | invent | drop-form | malformed (the redesign planner,
//     test/helpers/mock-redesign.js); MOCK_CREATIVE_REVISE = same (a Creative revision comes back unchanged)
// Prints "LISTENING <port>" once ready. Counts every provider call it
// answers into MOCK_CALL_LOG (a file) so a test can prove what was "paid".
const fs = require('fs');
const path = require('path');
const { mockPng } = require('./mock-image');
const { FIZZWELL_PLAN, GREENLINE_PLAN } = require('../fixtures/businesses');
const MOCK_PLANS = [FIZZWELL_PLAN, GREENLINE_PLAN];

const realFetch = globalThis.fetch;
// lib/paid-providers.js: this process answers every paid provider itself (below), so the server may 'call' them -- the
// only way provider mode 'mock' can exist (no environment variable selects it)
// (SITEREMADE_TEST_NO_PROVIDER_MOCK=1: run the server exactly as a developer machine would -- keys in the environment,
// no mock marker -- to prove the paid-provider guard keeps every provider off; any paid request is still logged here)
if (process.env.SITEREMADE_TEST_NO_PROVIDER_MOCK !== '1') globalThis.__SITEREMADE_PROVIDER_MOCK = true;
const PAID = require('../../lib/paid-providers.js');
const mockCreativeCounters = {};
const log = entry => { if (process.env.MOCK_CALL_LOG) fs.appendFileSync(process.env.MOCK_CALL_LOG, JSON.stringify(entry) + '\n'); };
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

globalThis.fetch = async function (url, options) {
  const u = String(url);
  if (u.startsWith('https://api.openai.com/')) {
    const body = JSON.parse(options.body);
    log({ provider: 'openai', prompt: body.prompt, model: body.model, quality: body.quality, size: body.size });
    const delay = Number(process.env.MOCK_IMAGE_DELAY_MS) || 0;
    if (delay) await new Promise(r => setTimeout(r, delay));
    const dataUrl = mockPng(body.prompt, body.size === '1536x1024' ? '16:9' : '1:1');
    return json({ data: [{ b64_json: dataUrl.split(',')[1] }] });
  }
  // SerpApi Google Images (Creative discovery, only when the test server has SERPAPI_API_KEY): MOCK_SERPAPI = empty |
  // refused (HTTP 401 whose message repeats the key -- it must never reach a response or the ledger)
  if (u.startsWith('https://serpapi.com/search')) {
    const q = new URL(u).searchParams;
    log({ provider: 'serpapi', engine: q.get('engine'), q: q.get('q'), licenses: q.get('licenses') || '', keyPresent: !!q.get('api_key') });
    if (process.env.MOCK_SERPAPI === 'refused') return json({ error: `Invalid API key ${q.get('api_key')}. Your API key should be here: https://serpapi.com/manage-api-key` }, 401);
    return json({ search_metadata: { status: 'Success' }, error: "Google hasn't returned any results for this query." });
  }
  // MOCK_WIKI: Wikipedia answers with a small article about toilet paper; Wikimedia Commons and upload.wikimedia.org
  // answer TOO -- a free (CC0) picture record and its bytes -- and every request is logged, so a test can prove Creative
  // never asks Commons for a picture (if it did, the picture would be there to take)
  if (process.env.MOCK_WIKI && /^https:\/\/([a-z0-9-]+\.)*(wikipedia|wikimedia)\.org\//.test(u)) {
    const x = new URL(u); const q = x.searchParams;
    log({ provider: 'wikimedia', host: x.hostname, path: x.pathname, what: q.get('list') || q.get('prop') || '' });
    const file = { title: 'File:Toilet paper roll.jpg', imageinfo: [{ url: 'https://upload.wikimedia.org/wikipedia/commons/a/ab/Toilet_paper_roll.jpg', thumburl: 'https://upload.wikimedia.org/wikipedia/commons/a/ab/Toilet_paper_roll.jpg', descriptionurl: 'https://commons.wikimedia.org/wiki/File:Toilet_paper_roll.jpg', mime: 'image/jpeg', width: 1600, height: 1200, thumbwidth: 1600, thumbheight: 1200, extmetadata: { LicenseShortName: { value: 'CC0' }, Artist: { value: 'A. Photographer' } } }] };
    if (x.hostname === 'en.wikipedia.org' && /\/page\/summary\//.test(x.pathname)) return json({ type: 'standard', title: 'Toilet paper', description: 'tissue paper product', extract: 'Toilet paper is a tissue paper product used for cleaning after using a toilet.', content_urls: { desktop: { page: 'https://en.wikipedia.org/wiki/Toilet_paper' } } });
    if (x.hostname === 'en.wikipedia.org' && q.get('prop') === 'extracts') return json({ query: { pages: { 1: { extract: 'Toilet paper is a tissue paper product used for cleaning after using a toilet.\n\n== History ==\nThe first documented use of toilet paper dates to the 6th century in China, according to written records.\nModern rolls of toilet paper were first sold in the United States in the late nineteenth century.' } } } });
    if (x.hostname === 'en.wikipedia.org' && q.get('prop') === 'images') return json({ query: { pages: { 1: { images: [{ title: file.title }] } } } });
    if (x.hostname === 'commons.wikimedia.org' && q.get('list') === 'search') return json({ query: { search: [{ title: file.title }] } });
    if (x.hostname === 'commons.wikimedia.org' && q.get('prop') === 'imageinfo') return json({ query: { pages: { 1: file } } });
    if (x.hostname === 'upload.wikimedia.org') return new Response(Buffer.from(mockPng('toilet paper', '1:1').split(',')[1], 'base64'), { status: 200, headers: { 'content-type': 'image/png' } });
    return json({}, 404);
  }
  // Higgsfield (premium media; never the real API in tests). MOCK_HIGGSFIELD = success (default) | failed | nsfw | slow
  // (never completes). Every submit is logged with its model endpoint and parameters, so a test can prove what was asked.
  if (u.startsWith('https://api.higgsfield.ai/')) {
    const x = new URL(u); const h = (options && options.headers) || {};
    mockCreativeCounters.hf = mockCreativeCounters.hf || 0;
    const st = /^\/requests\/([^/]+)\/status$/.exec(x.pathname);
    if (st) {
      const kind = process.env.MOCK_HIGGSFIELD || 'success';
      log({ provider: 'higgsfield', endpoint: 'status', request: st[1] });
      if (kind === 'slow') return json({ status: 'in_progress', request_id: st[1] });
      if (kind === 'failed' || kind === 'nsfw') return json({ status: kind, request_id: st[1] });
      const video = /video/.test(st[1]);
      return json(video ? { status: 'completed', request_id: st[1], video: { url: `https://higgsfield-output.test/${st[1]}.mp4` } } : { status: 'completed', request_id: st[1], images: [{ url: `https://higgsfield-output.test/${st[1]}.png` }] });
    }
    const body = JSON.parse((options && options.body) || '{}');
    mockCreativeCounters.hf++;
    const id = `hf_mock_${/video/.test(x.pathname) ? 'video' : 'image'}_${mockCreativeCounters.hf}`;
    log({ provider: 'higgsfield', endpoint: x.pathname, auth: /^Key .+/.test(String(h.Authorization || h.authorization || '')), params: body });
    return json({ status: 'queued', request_id: id, status_url: `https://api.higgsfield.ai/requests/${id}/status`, cancel_url: `https://api.higgsfield.ai/requests/${id}/cancel` });
  }
  if (u.startsWith('https://higgsfield-output.test/')) {
    log({ provider: 'higgsfield', endpoint: 'download', url: u });
    if (u.endsWith('.mp4')) return new Response(Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypmp42mock-video-bytes')]), { status: 200, headers: { 'content-type': 'video/mp4' } });
    return new Response(Buffer.from(mockPng('higgsfield', '16:9').split(',')[1], 'base64'), { status: 200, headers: { 'content-type': 'image/png' } });
  }
  if (u.startsWith('https://api.anthropic.com/')) {
    const body = JSON.parse(options.body);
    const tool = body.tool_choice && body.tool_choice.name;
    // the "Update My Website" redesign planner: answers read the real site context (test/helpers/mock-redesign.js)
    if (tool === 'submit_website_redesign') { const r = require('./mock-redesign').respond(body, process.env); log(Object.assign({ provider: 'anthropic' }, r.log)); return json(r.body); }
    log({ provider: 'anthropic', tool });
    // Creative mode's understanding / direction tools: labelled mock answers (test/helpers/mock-creative.js)
    // the watermark check on picked pictures (labelled mock: nothing is flagged unless MOCK_WATERMARK names an id)
    if (tool === 'submit_picture_check') { const ids = [...JSON.stringify(body.messages).matchAll(/Picture ([\w-]+):/g)].map(m => m[1]); return json({ model: 'mock-creative-picturecheck', usage: { input_tokens: 900, output_tokens: 60 }, stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 'w1', name: tool, input: { pictures: ids.map(id => ({ id, watermark: id === process.env.MOCK_WATERMARK, text: id === process.env.MOCK_WATERMARK ? 'mock watermark' : '' })) } }] }); }
    if (tool && tool.startsWith('submit_creative_')) { const r = require('./mock-creative').respond(body, process.env, mockCreativeCounters); return json(r.body, r.status); }
    // Creative web discovery: the mock cannot search the web -- one search, no results (labelled as a mock model)
    if ((body.tools || []).some(t => t && t.name === 'submit_image_pages')) return json({ model: 'mock-creative-websearch', stop_reason: 'end_turn', usage: { input_tokens: 800, output_tokens: 60, server_tool_use: { web_search_requests: 1 } }, content: [{ type: 'server_tool_use', id: 'srvtoolu_mock', name: 'web_search', input: { query: 'mock' } }, { type: 'web_search_tool_result', tool_use_id: 'srvtoolu_mock', content: [] }, { type: 'text', text: 'mock: no web search in tests' }] });
    const usage = { input_tokens: 4200, output_tokens: 1800, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
    if (tool === 'submit_website_refinement') {
      // MOCK_REFINEMENT_COPY: also change the hero headline to this text (an update that is not only about a picture)
      const operations = process.env.MOCK_REFINEMENT_COPY ? [{ action: 'edit-copy', targetId: 'hero', changes: { headline: process.env.MOCK_REFINEMENT_COPY } }] : [];
      const input = { scope: 'section', operations, imageActions: [{ action: 'regenerate', slot: process.env.MOCK_REFINEMENT_IMAGE_SLOT || 'hero' }] };
      return json({ model: body.model, usage, content: [{ type: 'tool_use', name: tool, input }] });
    }
    const mode = process.env.MOCK_PLANNER || 'success';
    if (mode === 'error' || tool !== 'submit_website_plan') return json({ error: { message: 'mock: overloaded' } }, 529);
    const asked = JSON.stringify(body.messages || '');
    const plan = MOCK_PLANS.find(p => asked.includes(p.business.name)) || FIZZWELL_PLAN;
    const input = mode === 'malformed' ? { ...plan, pages: 'not-an-array' } : plan;
    return json({ model: body.model, usage, content: [{ type: 'tool_use', name: tool, input }] });
  }
  // Stripe (website checkout; never the real API in tests): a Checkout Session is created with a test id and its
  // price is logged; MOCK_STRIPE_EXPIRE=fail makes closing an earlier session fail (as when it has just been paid)
  if (u.startsWith('https://api.stripe.com/v1/')) {
    const endpoint = u.slice('https://api.stripe.com/v1/'.length);
    const form = new URLSearchParams(String((options && options.body) || ''));
    if (/^checkout\/sessions\/[^/]+\/expire$/.test(endpoint)) {
      const session = decodeURIComponent(endpoint.split('/')[2]);
      log({ provider: 'stripe', endpoint: 'expire', session });
      if (process.env.MOCK_STRIPE_EXPIRE === 'fail') return json({ error: { message: 'mock: this session is complete' } }, 400);
      return json({ id: session, status: 'expired' });
    }
    if (endpoint === 'checkout/sessions') {
      mockCreativeCounters.stripe = (mockCreativeCounters.stripe || 0) + 1;
      const id = `cs_test_mock_${process.pid}_${mockCreativeCounters.stripe}`;
      log({ provider: 'stripe', endpoint: 'checkout', session: id, mode: form.get('mode'), amount: Number(form.get('line_items[0][price_data][unit_amount]')), currency: form.get('line_items[0][price_data][currency]'), price: form.get('line_items[0][price]') || '', kind: form.get('metadata[kind]'), intentId: form.get('metadata[intentId]'), purchaseId: form.get('metadata[purchaseId]'), packId: form.get('metadata[packId]'), projectId: form.get('metadata[projectId]'), websiteMode: form.get('metadata[mode]') });
      return json({ id, url: `https://checkout.stripe.test/${id}` });
    }
    return json({ error: { message: `mock: unhandled Stripe endpoint ${endpoint}` } }, 400);
  }
  // Resend (transactional email; never the real API in tests): the full payload is logged so a test can read exactly
  // what would have been sent
  if (u === 'https://api.resend.com/emails') {
    const body = JSON.parse(options.body);
    log({ provider: 'resend', auth: /^Bearer .+/.test(String((options.headers || {}).Authorization || '')), ...body });
    return json({ id: 'email_mock_' + Date.now() });
  }
  if (process.env.SUPABASE_URL && u.startsWith(process.env.SUPABASE_URL.replace(/\/$/, '') + '/auth/v1/user')) {
    log({ provider: 'supabase' });
    // a second identity for ownership tests: any token containing "test-access-token-other" is a different user
    const h = (options && options.headers) || {};
    const auth = String(h.Authorization || h.authorization || '');
    if (/test-access-token-other/.test(auth)) return json({ id: '00000000-0000-4000-8000-000000000009', email: 'other-owner@example.com' });
    return json({ id: process.env.MOCK_SUPABASE_USER_ID || '00000000-0000-4000-8000-000000000001', email: process.env.MOCK_SUPABASE_EMAIL || 'bridge-test@example.com' });
  }
  // a paid provider this harness does not answer is refused -- a test can never fall through to a real, billed API
  if (PAID.providerForUrl(u)) return Promise.reject(new Error(`test harness: unmocked paid provider request refused (${u.slice(0, 60)})`));
  return realFetch(url, options);
};

// server.js's premium cost ledger defaults to <repo>/data/premium even with
// PREMIUM_GENERATION_V1 off -- keep mock-run costs out of the repo.
if (!process.env.SITEREMADE_PREMIUM_LOG_DIR) process.env.SITEREMADE_PREMIUM_LOG_DIR = fs.mkdtempSync(path.join(require('os').tmpdir(), 'sr-premium-log-'));

const { app } = require(path.join(__dirname, '..', '..', 'server.js'));
const server = app.listen(0, '127.0.0.1', () => console.log(`LISTENING ${server.address().port}`));
