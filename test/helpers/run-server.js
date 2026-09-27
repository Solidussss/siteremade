'use strict';
// Runs the REAL server.js route table in a child process for integration
// tests, with the two paid providers replaced at the network edge (only
// api.openai.com and api.anthropic.com are intercepted -- everything else,
// including the database, asset store, auth and credits, is the real code).
//   MOCK_PLANNER = success | malformed | error   (default success)
//   MOCK_IMAGE_DELAY_MS = ms before a mock image response (default 0)
// Prints "LISTENING <port>" once ready. Counts every provider call it
// answers into MOCK_CALL_LOG (a file) so a test can prove what was "paid".
const fs = require('fs');
const path = require('path');
const { mockPng } = require('./mock-image');
const { FIZZWELL_PLAN } = require('../fixtures/businesses');

const realFetch = globalThis.fetch;
const log = entry => { if (process.env.MOCK_CALL_LOG) fs.appendFileSync(process.env.MOCK_CALL_LOG, JSON.stringify(entry) + '\n'); };
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

globalThis.fetch = async function (url, options) {
  const u = String(url);
  if (u.startsWith('https://api.openai.com/')) {
    const body = JSON.parse(options.body);
    log({ provider: 'openai', prompt: body.prompt });
    const delay = Number(process.env.MOCK_IMAGE_DELAY_MS) || 0;
    if (delay) await new Promise(r => setTimeout(r, delay));
    const dataUrl = mockPng(body.prompt, body.size === '1536x1024' ? '16:9' : '1:1');
    return json({ data: [{ b64_json: dataUrl.split(',')[1] }] });
  }
  if (u.startsWith('https://api.anthropic.com/')) {
    const body = JSON.parse(options.body);
    const tool = body.tool_choice && body.tool_choice.name;
    log({ provider: 'anthropic', tool });
    const usage = { input_tokens: 4200, output_tokens: 1800, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
    const mode = process.env.MOCK_PLANNER || 'success';
    if (mode === 'error') return json({ error: { message: 'mock: overloaded' } }, 529);
    const input = mode === 'malformed' ? { ...FIZZWELL_PLAN, pages: 'not-an-array' } : FIZZWELL_PLAN;
    return json({ model: body.model, usage, content: [{ type: 'tool_use', name: tool, input }] });
  }
  return realFetch(url, options);
};

const { app } = require(path.join(__dirname, '..', '..', 'server.js'));
const server = app.listen(0, '127.0.0.1', () => console.log(`LISTENING ${server.address().port}`));
