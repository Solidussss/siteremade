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
//   MOCK_SUPABASE_USER_ID / MOCK_SUPABASE_EMAIL = the identity any bearer token verifies as
// Prints "LISTENING <port>" once ready. Counts every provider call it
// answers into MOCK_CALL_LOG (a file) so a test can prove what was "paid".
const fs = require('fs');
const path = require('path');
const { mockPng } = require('./mock-image');
const { FIZZWELL_PLAN, GREENLINE_PLAN } = require('../fixtures/businesses');
const MOCK_PLANS = [FIZZWELL_PLAN, GREENLINE_PLAN];

const realFetch = globalThis.fetch;
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
  if (u.startsWith('https://api.anthropic.com/')) {
    const body = JSON.parse(options.body);
    const tool = body.tool_choice && body.tool_choice.name;
    log({ provider: 'anthropic', tool });
    // Creative mode's understanding / direction tools: labelled mock answers (test/helpers/mock-creative.js)
    if (tool && tool.startsWith('submit_creative_')) { const r = require('./mock-creative').respond(body, process.env, mockCreativeCounters); return json(r.body, r.status); }
    // Creative web discovery: the mock cannot search the web -- one search, no results (labelled as a mock model)
    if ((body.tools || []).some(t => t && t.name === 'submit_image_pages')) return json({ model: 'mock-creative-websearch', stop_reason: 'end_turn', usage: { input_tokens: 800, output_tokens: 60, server_tool_use: { web_search_requests: 1 } }, content: [{ type: 'server_tool_use', id: 'srvtoolu_mock', name: 'web_search', input: { query: 'mock' } }, { type: 'web_search_tool_result', tool_use_id: 'srvtoolu_mock', content: [] }, { type: 'text', text: 'mock: no web search in tests' }] });
    const usage = { input_tokens: 4200, output_tokens: 1800, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
    if (tool === 'submit_website_refinement') {
      const input = { scope: 'section', operations: [], imageActions: [{ action: 'regenerate', slot: process.env.MOCK_REFINEMENT_IMAGE_SLOT || 'hero' }] };
      return json({ model: body.model, usage, content: [{ type: 'tool_use', name: tool, input }] });
    }
    const mode = process.env.MOCK_PLANNER || 'success';
    if (mode === 'error' || tool !== 'submit_website_plan') return json({ error: { message: 'mock: overloaded' } }, 529);
    const asked = JSON.stringify(body.messages || '');
    const plan = MOCK_PLANS.find(p => asked.includes(p.business.name)) || FIZZWELL_PLAN;
    const input = mode === 'malformed' ? { ...plan, pages: 'not-an-array' } : plan;
    return json({ model: body.model, usage, content: [{ type: 'tool_use', name: tool, input }] });
  }
  if (process.env.SUPABASE_URL && u.startsWith(process.env.SUPABASE_URL.replace(/\/$/, '') + '/auth/v1/user')) {
    log({ provider: 'supabase' });
    return json({ id: process.env.MOCK_SUPABASE_USER_ID || '00000000-0000-4000-8000-000000000001', email: process.env.MOCK_SUPABASE_EMAIL || 'bridge-test@example.com' });
  }
  return realFetch(url, options);
};

// server.js's premium cost ledger defaults to <repo>/data/premium even with
// PREMIUM_GENERATION_V1 off -- keep mock-run costs out of the repo.
if (!process.env.SITEREMADE_PREMIUM_LOG_DIR) process.env.SITEREMADE_PREMIUM_LOG_DIR = fs.mkdtempSync(path.join(require('os').tmpdir(), 'sr-premium-log-'));

const { app } = require(path.join(__dirname, '..', '..', 'server.js'));
const server = app.listen(0, '127.0.0.1', () => console.log(`LISTENING ${server.address().port}`));
