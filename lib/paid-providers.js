'use strict';
// PAID PROVIDERS ARE PRODUCTION / CUSTOMER RESOURCES ONLY.
//
// SiteRemade pays for four external providers: Anthropic (reasoning, Creative direction, planning, updates), SerpApi
// (Google Images discovery), Higgsfield (optional premium media) and OpenAI images (optional generated pictures). A
// development machine, a test run, a screenshot batch or a local QA loop must never fall through into one of them --
// not because a key happens to be on the machine, not because a variable was copied from production.
//
// One decision, made here and nowhere else:
//   live   real calls allowed: a production runtime (NODE_ENV=production or Railway's own variables -- the same signal
//          lib/deployment-safety.js uses), unless ALLOW_PAID_PROVIDER_CALLS=false; or, anywhere, an explicit
//          ALLOW_PAID_PROVIDER_CALLS=true (an obvious, deliberate override -- off by default outside production)
//   mock   the in-process test harness (test/helpers/run-server.js) has replaced fetch with recorded/synthetic answers and
//          marked the process (globalThis.__SITEREMADE_PROVIDER_MOCK). No environment variable can select this mode.
//   off    everything else: every paid provider reports itself unavailable (the code takes its no-AI path), keys are
//          never handed out, and installFetchGuard() refuses any request to a paid host before it leaves the process.
//
// Keys are read from the environment here, returned only to server code that is allowed to use them, and never
// logged, serialised or included in a response (status() reports only configured/enabled booleans).
const { isProductionRuntime } = require('./deployment-safety');

const PROVIDERS = {
  anthropic: { env: ['ANTHROPIC_API_KEY'], hosts: ['api.anthropic.com'], label: 'Anthropic' },
  serpapi: { env: ['SERPAPI_API_KEY'], hosts: ['serpapi.com'], label: 'SerpApi' },
  higgsfield: { env: ['HIGGSFIELD_API_KEY'], hosts: ['api.higgsfield.ai', 'platform.higgsfield.ai', 'cloud.higgsfield.ai'], label: 'Higgsfield' },
  openai: { env: ['OPENAI_API_KEY'], hosts: ['api.openai.com'], label: 'OpenAI images' },
};
const PAID_HOSTS = Object.values(PROVIDERS).flatMap(p => p.hosts);

class PaidProviderBlockedError extends Error {
  constructor(provider, mode) { super(`${provider} calls are disabled in this environment (paid providers: ${mode}). Set ALLOW_PAID_PROVIDER_CALLS=true only if you really mean to spend money.`); this.code = 'PAID_PROVIDER_BLOCKED'; this.provider = provider; }
}

function mode(env = process.env, g = globalThis) {
  const flag = String(env.ALLOW_PAID_PROVIDER_CALLS || '').trim().toLowerCase();
  if (flag === 'true') return 'live';
  if (isProductionRuntime(env) && flag !== 'false') return 'live';
  if (g && g.__SITEREMADE_PROVIDER_MOCK === true) return 'mock';
  return 'off';
}
function rawKey(name, env = process.env) { const p = PROVIDERS[name]; if (!p) return ''; for (const k of p.env) { const v = String(env[k] || '').trim(); if (v) return v; } return ''; }
// whether server code may call this provider now (configured AND allowed in this environment)
function allowed(name, env = process.env, g = globalThis) { return mode(env, g) !== 'off' && !!rawKey(name, env); }
// the key, only when the provider may be called; '' otherwise (every caller treats '' as "not configured")
function key(name, env = process.env, g = globalThis) { return allowed(name, env, g) ? rawKey(name, env) : ''; }
// for diagnostics and the admin page: never the key, never a fragment of it
function status(env = process.env, g = globalThis) {
  const m = mode(env, g);
  return { mode: m, providers: Object.fromEntries(Object.entries(PROVIDERS).map(([n, p]) => {
    const configured = !!rawKey(n, env);
    return [n, { label: p.label, configured, enabled: m !== 'off' && configured, reason: m === 'off' ? (configured ? 'paid provider calls are disabled outside production (ALLOW_PAID_PROVIDER_CALLS)' : 'not configured') : configured ? '' : `${p.env[0]} is not set` }];
  })) };
}
function providerForUrl(url) {
  let host = ''; try { host = new URL(String(url)).hostname.toLowerCase(); } catch (e) { return null; }
  for (const [n, p] of Object.entries(PROVIDERS)) if (p.hosts.some(h => host === h || host.endsWith('.' + h))) return n;
  return null;
}
// The network edge: a request to a paid host while paid calls are off never leaves the process, whatever code made it
// (a stray direct fetch, a library, a forgotten debug script inside the server). Installed once at server start.
function installFetchGuard(env = process.env, g = globalThis) {
  if (!g || typeof g.fetch !== 'function' || g.fetch.__paidProviderGuard) return;
  const inner = g.fetch;
  const guarded = function (url, options) {
    const target = typeof url === 'string' ? url : url && url.url ? url.url : String(url);
    const provider = providerForUrl(target);
    if (provider && mode(env, g) === 'off') return Promise.reject(new PaidProviderBlockedError(PROVIDERS[provider].label, 'off'));
    return inner.call(this, url, options);
  };
  guarded.__paidProviderGuard = true;
  g.fetch = guarded;
}

module.exports = { PROVIDERS, PAID_HOSTS, PaidProviderBlockedError, mode, allowed, key, status, providerForUrl, installFetchGuard };
