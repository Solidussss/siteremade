'use strict';
// Loads the REAL browser script.js (a global-scope script, not a CommonJS
// module) into a Node `vm` context so tests exercise the production
// functions themselves -- buildGenerationPlan, buildImagePlan,
// resolveImagePlanAssets, renderVisualSlot, normalizeClaudePlan, the section
// renderers -- rather than hand-copied twins that could drift.
//
// The DOM is a permissive stub: every property read returns the same
// callable proxy, so script.js's top-level wiring ($('#x').addEventListener,
// document.querySelectorAll(...).forEach, ...) runs without a browser. Pure
// render functions return HTML strings and never touch it. `fetch` is a
// controllable mock -- nothing here can ever reach a real provider.
const vm = require('vm');
const fs = require('fs');
const path = require('path');

// SITEREMADE_CLIENT_SCRIPT lets a mutation check point the suite at a
// deliberately-broken copy of script.js to prove a test really fails on the
// bug it guards. Never set in normal runs.
const SCRIPT_PATH = process.env.SITEREMADE_CLIENT_SCRIPT || path.join(__dirname, '..', '..', 'script.js');

function permissiveStub() {
  const fn = function () { return proxy; };
  const proxy = new Proxy(fn, {
    get(target, key) {
      if (key === Symbol.iterator) return function* () {};
      if (key === Symbol.toPrimitive) return () => '';
      if (key === 'then') return undefined; // never look like a thenable
      if (key === 'length') return 0;
      return proxy;
    },
    set() { return true; },
    apply() { return proxy; },
    construct() { return proxy; },
    has() { return true; },
  });
  return proxy;
}

// fetchHandler(url, options) -> value (a plain object is wrapped as a JSON
// Response-alike) or a Promise of one. Default: never resolves, so a test
// that forgets to mock a route hangs visibly instead of silently passing.
function loadClient({ fetchHandler } = {}) {
  const stub = permissiveStub();
  const storage = () => { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) }; };
  const fetchCalls = [];
  let handler = fetchHandler || (() => new Promise(() => {}));
  const ctx = {
    console, setTimeout, clearTimeout, setInterval: () => 0, clearInterval() {}, queueMicrotask, structuredClone,
    URL, URLSearchParams, TextEncoder, TextDecoder, AbortController, Promise, JSON, Math, Date, Map, Set, WeakMap, Intl, atob, btoa, performance,
    requestAnimationFrame: f => setTimeout(f, 0), cancelAnimationFrame: id => clearTimeout(id),
    document: stub, history: stub, localStorage: storage(), sessionStorage: storage(),
    navigator: { userAgent: 'node-test', clipboard: stub }, location: { hash: '', search: '', pathname: '/', href: 'http://localhost/', origin: 'http://localhost' },
    matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }), getComputedStyle: () => stub,
    HTMLElement: function () {}, Element: function () {}, Node: function () {}, Event: function () {}, CustomEvent: function () {},
    MutationObserver: function () { return stub; }, IntersectionObserver: function () { return stub; }, ResizeObserver: function () { return stub; },
    FileReader: function () { return stub; }, Image: function () { return stub; }, Blob: function () {},
    fetch(url, options) {
      fetchCalls.push({ url: String(url), options: options || {} });
      const signal = options && options.signal;
      return new Promise((resolve, reject) => {
        if (signal) signal.addEventListener('abort', () => { const e = new Error('aborted'); e.name = 'AbortError'; reject(e); });
        Promise.resolve(handler(String(url), options || {})).then(value => {
          if (value && typeof value.json === 'function') return resolve(value);
          resolve({ ok: true, status: (value && value.__status) || 200, json: async () => value });
        }, reject);
      });
    },
  };
  ctx.window = ctx; ctx.self = ctx; ctx.globalThis = ctx;
  ctx.addEventListener = () => {}; ctx.removeEventListener = () => {};
  vm.createContext(ctx);
  // Same load order as index.html: the icon data, the shared premium core
  // (hero direction, visual/motion engines -- loaded on every page, flag or no
  // flag), then the app.
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', '..', 'icons-data.js'), 'utf8'), ctx, { filename: 'icons-data.js' });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', '..', 'premium-core.js'), 'utf8'), ctx, { filename: 'premium-core.js' });
  vm.runInContext(fs.readFileSync(SCRIPT_PATH, 'utf8'), ctx, { filename: 'script.js' });
  return {
    ctx,
    fetchCalls,
    setFetchHandler(fn) { handler = fn; },
    // Evaluate an expression inside the script's own global scope (reaches
    // its top-level let/const bindings, e.g. `project`, `latestCredits`).
    run(code) { return vm.runInContext(code, ctx); },
  };
}

// A funded, configured image provider as /api/image-provider-status would
// report it with this repo's own server.js defaults -- plus a budget large
// enough that the allocator funds more than the hero, so tests exercise
// multi-slot generation the way a real deployment with a raised
// SITEREMADE_IMAGE_BUDGET_USD does.
function fundedProviderStatus(overrides) {
  return Object.assign({
    configured: true, provider: 'openai', budgetUsd: 1.2,
    models: { support: 'gpt-image-1-mini', premium: 'gpt-image-1' },
    costEstimateUsd: {
      'gpt-image-1-mini': { low: 0.006, medium: 0.015, high: 0.03 },
      'gpt-image-1': { low: 0.05, medium: 0.15, high: 0.45 },
    },
    creditCosts: { support: 1, premium: 2 },
    landscapeCostMultiplier: 1.4,
  }, overrides || {});
}

// Builds a real project through the client's own generation plan, exactly as
// runGeneration does (minus the network/animation shell). claudePlanRaw, when
// given, goes through the real normalizeClaudePlan first.
// uploads: [{ type: 'hero'|'gallery'|'team'|'logo', dataUrl, name }] -- staged before the steps run, exactly like
// pictures attached in the generator box (runGeneration's pendingUploads).
function buildProject(client, text, { claudePlanRaw = null, providerStatus = null, credits = 40, seed = 0, uploads = [] } = {}) {
  client.ctx.__siteremadeImageProvider = providerStatus;
  client.run(`latestCredits = ${JSON.stringify({ remaining: credits })};`);
  client.ctx.__testInput = { text, claudePlanRaw, seed, uploads };
  return client.run(`(() => {
    const { text, claudePlanRaw, seed, uploads } = window.__testInput;
    let claudePlan = null;
    if (claudePlanRaw) {
      const catDefaults = categoryDimensionDefaults[analyzeDescription(text).categoryKey] || categoryDimensionDefaults.other;
      claudePlan = normalizeClaudePlan(claudePlanRaw, catDefaults);
    }
    const src = createGenerationSource(text);
    const { proj, steps } = buildGenerationPlan(src.text, null, claudePlan, seed, src);
    (uploads || []).forEach(u => proj.assets.items.push(createAsset(u.type, u.dataUrl, u.name)));
    steps.forEach(s => s.run());
    proj.meta.id = proj.meta.id || 'proj_test';
    return { proj, usedClaude: !!claudePlan };
  })()`);
}

// The provider status production reports with PREMIUM_GENERATION_V1 on: a configured OpenAI provider AND the
// premium core (starter visuals, grounding, composition). The Business generator must still never request an image.
function premiumProviderStatus(overrides) {
  const cfg = require('../../lib/premium/config').loadConfig({ PREMIUM_GENERATION_V1: 'true' });
  return fundedProviderStatus(Object.assign({ premium: { enabled: true, cfg } }, overrides || {}));
}
// A project saved BEFORE the starter-visuals-only rule, when its pictures were generated: ready images for the given
// plan slots (default: every slot that is not an upload), keyed by each entry's cacheKey exactly as they were stored.
// Rendering and export still show such images; no new one is ever requested.
function seedSavedImages(proj, mockPng, slots) {
  proj.assets.generated = proj.assets.generated || {};
  (proj.imagePlan || []).filter(e => e.sourceType !== 'user' && (!slots || slots.includes(e.slot))).forEach(e => {
    proj.assets.generated[e.slot] = { cacheKey: e.cacheKey, status: 'ready', dataUrl: mockPng(e.slot, e.aspectRatio || '1:1'), prompt: 'saved before the starter-visual rule' };
  });
  return proj;
}

module.exports = { loadClient, fundedProviderStatus, premiumProviderStatus, seedSavedImages, buildProject, permissiveStub };
