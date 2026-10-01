'use strict';
// Starts test/helpers/run-server.js (the REAL server.js, paid providers
// stubbed at the network edge) as a child process, plus a tiny cookie-
// keeping HTTP client and a reader for the mock provider-call log.
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const RUNNER = path.join(__dirname, 'run-server.js');

function startServer(env) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [RUNNER], { env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    const timer = setTimeout(() => { child.kill(); reject(new Error('server did not start:\n' + out)); }, 20000);
    child.stdout.on('data', d => {
      out += d;
      const m = /LISTENING (\d+)/.exec(out);
      if (m) { clearTimeout(timer); resolve({ port: Number(m[1]), output: () => out, stop: () => new Promise(r => { child.once('exit', r); child.kill(); }) }); }
    });
    child.stderr.on('data', d => { out += d; });
    child.once('exit', code => { clearTimeout(timer); if (!/LISTENING/.test(out)) reject(new Error(`server exited ${code}:\n${out}`)); });
  });
}

function client(port) {
  const jar = new Map(); // cookie name -> value (a session cookie must survive an unrelated Set-Cookie)
  return async function call(method, url, body, headers = {}, { signal } = {}) {
    const cookie = [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
    const res = await fetch(`http://127.0.0.1:${port}${url}`, {
      method, headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}), ...headers },
      body: body ? JSON.stringify(body) : undefined, signal,
    });
    (res.headers.getSetCookie ? res.headers.getSetCookie() : []).forEach(c => {
      const [pair] = c.split(';'); const i = pair.indexOf('=');
      jar.set(pair.slice(0, i).trim(), pair.slice(i + 1));
    });
    return { status: res.status, body: await res.json().catch(() => null) };
  };
}

const providerCalls = file => fs.existsSync(file) ? fs.readFileSync(file, 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l)) : [];

// OWNERSHIP + CREDITS: a new Creative page starts only after the owner confirms its quote. This does what the studio
// does: ask, read the quote, confirm it (the test's own call -- nothing paid runs before the confirmation).
async function research(call, body) {
  const first = await call('POST', '/api/creative/research', body);
  if (!(first.body && first.body.needsConfirmation && first.body.quote)) return first;
  return call('POST', '/api/creative/research', Object.assign({}, body, { quoteId: first.body.quote.id }));
}

module.exports = { startServer, client, providerCalls, research };
