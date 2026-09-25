'use strict';
// Electron driver for the repeatable quality fixtures (PREMIUM_GENERATION_V1 Part 42/43).
//
//   env -u ELECTRON_RUN_AS_NODE <path-to>/electron[.exe] premium-fixtures/run-fixtures.js --user-data-dir=<tmp>
//   env: FIX_MODES=legacy,premium  FIX_IDS=roofing,saas  FIX_OUT=<dir>  MOCK_BLANK_ONCE=hero
//
// For each fixture business and each pipeline (legacy = flag off, premium = PREMIUM_GENERATION_V1=true) it starts a
// FRESH server (in-memory DB) with the provider test doubles in mock-providers.js, signs up a real account, runs the
// REAL client generation in a real browser engine, then records: image decisions, USD ledger totals (simulated token
// usage, estimated prices), timings, deterministic quality rubric, REAL phone-width layout measurements, and screenshots.
const { app, BrowserWindow } = require('electron');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const http = require('http');

const ROOT = path.join(__dirname, '..');
const OUT = process.env.FIX_OUT || path.join(ROOT, 'premium-fixtures', 'out');
const MODES = (process.env.FIX_MODES || 'legacy,premium').split(',');
const fixtures = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures.json'), 'utf8')).filter(f => !process.env.FIX_IDS || process.env.FIX_IDS.split(',').includes(f.id));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const step = m => { if (process.env.FIX_VERBOSE) console.log('   · ' + m); };
let sharedWindow = null; // one window for every run: destroying hidden windows can hang Electron on Windows
let port = 5200 + Math.floor(Math.random() * 400);

function httpGet(url, headers) { return new Promise((resolve, reject) => { http.get(url, { headers, agent: false, timeout: 8000 }, res => { let b = ''; res.on('data', d => b += d); res.on('end', () => resolve({ status: res.statusCode, body: b })); }).on('timeout', function () { this.destroy(new Error('http timeout')); }).on('error', reject); }); }
async function startServer(mode, tag) {
  const p = port++;
  const logDir = path.join(OUT, 'logs', tag); fs.mkdirSync(logDir, { recursive: true });
  const env = Object.assign({}, process.env, {
    PORT: String(p), SITEREMADE_DB_PATH: ':memory:', OPENAI_API_KEY: 'mock', SITEREMADE_PAID_IMAGES: 'true', ANTHROPIC_API_KEY: 'mock',
    PREMIUM_GENERATION_V1: mode === 'premium' ? 'true' : 'false', SITEREMADE_ADMIN_TOKEN: 'fixture-admin', SITEREMADE_PREMIUM_LOG_DIR: logDir,
    MOCK_LOG: path.join(logDir, 'provider-calls.jsonl'), SITEREMADE_DAILY_FREE_CREDITS: '1000',
    SITEREMADE_RATE_LIMIT_SIGNUP_MAX: '1000', SITEREMADE_RATE_LIMIT_GENERATION_MAX: '1000', ELECTRON_RUN_AS_NODE: '',
  });
  delete env.ELECTRON_RUN_AS_NODE;
  const child = spawn('node', ['-r', path.join(__dirname, 'mock-providers.js'), 'server.js'], { cwd: ROOT, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  child.stdout.on('data', d => { out += d; }); child.stderr.on('data', d => { out += d; });
  for (let i = 0; i < 60; i++) { if (/running on port/.test(out)) break; await sleep(250); }
  if (!/running on port/.test(out)) throw new Error('server did not start: ' + out.slice(0, 500));
  return { port: p, child, logDir, tail: () => out };
}

async function runOne(fixture, mode) {
  const tag = `${fixture.id}-${mode}`;
  const srv = await startServer(mode, tag);
  const w = sharedWindow || (sharedWindow = new BrowserWindow({ width: 1440, height: 900, show: false, webPreferences: { sandbox: true } }));
  w.setContentSize(1440, 900);
  const result = { fixture: fixture.id, label: fixture.label, mode };
  try {
    const base = `http://localhost:${srv.port}/`;
    await w.loadURL(base); await sleep(1200);
    const ev = code => w.webContents.executeJavaScript(code, true);
    const su = await ev(`fetch('/api/auth/signup',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'fx-${tag}@example.com',password:'Fixture-pass-12345'})}).then(r=>r.json())`);
    if (!su.ok) throw new Error('signup failed ' + JSON.stringify(su));
    await w.loadURL(base); await sleep(2500);
    result.premiumFlagSeenByClient = await ev(`!!(window.__siteremadeImageProvider && window.__siteremadeImageProvider.premium && window.__siteremadeImageProvider.premium.enabled)`);
    await ev(`(()=>{ window.__fxImgLog = []; const of = window.fetch; window.fetch = async function (u, o) { const r = await of.apply(this, arguments); if (String(u).includes('/api/generate-image')) { try { const c = r.clone(); const j = await c.json(); let b = {}; try { b = JSON.parse(o.body); } catch (e) {} window.__fxImgLog.push({ status: r.status, ok: j.ok, reason: j.message || null, poor: j.poorImage || null, budget: j.budgetExceeded || null, slot: b.role, tier: b.premiumTier, gid: !!b.premiumGenerationId, aspect: b.aspectRatio, model: b.model, quality: b.quality, promptHead: (b.prompt || '').slice(0, 80) }); } catch (e) {} } return r; }; })()`);
    const t0 = Date.now();
    const run = await ev(`(async()=>{ const t=performance.now(); try { await runGeneration(${JSON.stringify(fixture.text)}); } catch(e){ return {error:String(e&&e.message||e)}; }
      for (let i=0;i<240 && !(directions && directions.length>=1);i++) await new Promise(r=>setTimeout(r,250));
      return {ms: Math.round(performance.now()-t), directions: directions.length}; })()`);
    result.wallMs = Date.now() - t0; result.run = run;
    if (run.error || !run.directions) throw new Error('generation did not complete: ' + JSON.stringify(run));
    await sleep(800);
    step('generation complete');
    // ---- collect from the real client state
    result.project = await ev(`(()=>{ const p = directions[0]; return {
      archetype: p.strategy && p.strategy.archetype, category: p.business && p.business.categoryKey,
      hero: p.design.dimensions.heroDisplayVariant || p.design.dimensions.hero, typeKey: p.design.dimensions.type,
      premiumTokens: p.design.premiumTokens ? { typographyKey: p.design.premiumTokens.typographyKey, heading: p.design.premiumTokens.vars['--site-font-heading'], h1: p.design.premiumTokens.vars['--site-h1'], spaceMajor: p.design.premiumTokens.vars['--site-space-major'] } : null,
      review: p.design.premium && p.design.premium.review || null,
      copy: p.copy, sections: p.pages[0].sections.map(s => s.type + '/' + (s.variant||'-')),
      imagePlan: (p.imagePlan||[]).map(e => ({ slot:e.slot, role:e.role, sourceType:e.sourceType, model:e.model, quality:e.quality, aspectRatio:e.aspectRatio, tier:e.tier||null, focal:e.focal||null, reason:e.premiumReason||null, estimatedCostUsd:e.estimatedCostUsd })),
      generated: Object.keys(p.assets.generated||{}).map(k => ({ slot:k, status:p.assets.generated[k].status, focal:p.assets.generated[k].focal||null })) }; })()`);
    result.imageRequests = await ev('(window.__fxImgLog||[])');
    step('project collected');
    // ---- real phone-width layout measurement of the finished site
    result.mobile = await ev(`(()=>{ const m = window.SiteRemadePremium.mobile.measureMobile(builderSite,[390,360]); return m; })()`);
    // ---- the same deterministic rubric applied to the FINAL site of both pipelines (comparable)
    result.rubricFinal = await ev(`(()=>{ const P = window.SiteRemadePremium; const p = directions[0]; const cat = categories[p.business.categoryKey]||categories.other;
      const s = P.strategy.deriveStrategy({archetype:p.strategy&&p.strategy.archetype,categoryKey:p.business.categoryKey,categoryLabel:cat.label,description:p.source.text,facts:p.source.facts,location:p.source.location,creativeDirection:p.intent&&p.intent.creativeDirection});
      const d = JSON.parse(JSON.stringify(p,(k,v)=>k==='dataUrl'?undefined:v)); d.imagePlan = p.imagePlan; d.mobileReport = ${JSON.stringify(result.mobile)};
      const r = P.review.reviewDirection(d,{strategy:s,premiumEnabled:!!p.design.premiumTokens,description:p.source.text,facts:p.source.facts}); return {categories:r.categories, defects:r.defects.filter(x=>x.severity>0).map(x=>({c:x.category,code:x.code,sev:x.severity,detail:x.detail||null}))}; })()`);
    result.debugHero = await ev('(()=>{ const h=builderSite.querySelector(".site-hero, [class*=hero]"); return h ? h.outerHTML.slice(0,1500) : null; })()');
    if (process.env.FIX_DEBUG_JS) result.debugCustom = await ev(fs.readFileSync(process.env.FIX_DEBUG_JS, 'utf8'));
    step('mobile + rubric done');
    // ---- screenshots: desktop top / middle, mobile top
    fs.mkdirSync(path.join(OUT, 'shots'), { recursive: true });
    // Screenshots of the SITE ONLY (isolated from the generator page so nothing else can be in frame), desktop then phone.
    const isolate = (mobile) => `(()=>{ const site = window.__fxSite || (window.__fxSite = builderSite.cloneNode(true)); const s = site.cloneNode(true); s.removeAttribute('id');
      document.documentElement.style.background = '#0c0e12'; document.body.className = ''; document.body.style.cssText = 'margin:0;background:#0c0e12;overflow:hidden'; document.body.innerHTML = '';
      const dev = document.createElement('div'); dev.className = 'builder-device' + (${mobile} ? ' mobile' : ''); dev.style.cssText = ${mobile} ? 'width:416px;min-height:0;padding:13px;display:flex;justify-content:center' : 'width:1300px;min-height:0;padding:0;display:block;overflow:visible';
      dev.appendChild(s); document.body.appendChild(dev); return document.body.scrollHeight; })()`;
    await ev(`window.__fxSite = builderSite.cloneNode(true)`);
    for (const [name, mobile, width] of [['desktop', false, 1300], ['mobile', true, 416]]) {
      const h = await ev(isolate(mobile));
      w.setContentSize(width, Math.min(2400, Math.max(600, h + 20))); await sleep(1200);
      await ev(`new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))`);
      fs.writeFileSync(path.join(OUT, 'shots', `${tag}-${name}.png`), (await w.webContents.capturePage()).toPNG());
      result[name + 'PageHeightPx'] = h;
    }
    step('screenshots done');
    // ---- server-side numbers (USD ledger, provider calls)
    const adminGet = p => ev(`fetch(${JSON.stringify(p)},{headers:{'x-admin-token':'fixture-admin'}}).then(r=>r.json())`);
    step('fetching ledger'); const led = await Promise.race([adminGet('/api/admin/premium-ledger'), sleep(10000).then(() => { throw new Error('ledger fetch timeout'); })]); step('ledger ok');
    const gens = led.generations || [];
    result.ledger = { generations: gens, FIRST_DRAFT_COST: +gens.reduce((n, g) => n + g.FIRST_DRAFT_COST, 0).toFixed(4), REPAIR_COST: +gens.reduce((n, g) => n + g.REPAIR_COST, 0).toFixed(4), TOTAL_SITE_COST: +gens.reduce((n, g) => n + g.TOTAL_SITE_COST, 0).toFixed(4), imageCount: gens.reduce((n, g) => n + g.imageCount, 0), imageAttempts: gens.reduce((n, g) => n + g.imageAttempts, 0), imageRetries: gens.reduce((n, g) => n + g.imageRetries, 0) };
    if (mode === 'premium') { const m = await adminGet('/api/admin/premium-metrics'); result.generationLog = (m.recent || []).slice(-1)[0] || null; }
    const calls = fs.existsSync(path.join(srv.logDir, 'provider-calls.jsonl')) ? fs.readFileSync(path.join(srv.logDir, 'provider-calls.jsonl'), 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l)) : [];
    result.providerCalls = calls.map(c => ({ kind: c.kind, model: c.model, quality: c.quality, size: c.size, blank: c.blank || undefined, promptSample: c.prompt ? c.prompt.slice(0, 260) : undefined }));
  } catch (e) { result.error = String(e && e.stack || e); step('caught: ' + result.error.slice(0, 200)); }
  finally { step('cleanup'); try { await w.loadURL('about:blank'); } catch (_) { /* ignore */ } srv.child.kill(); await sleep(300); }
  result.serverTail = srv.tail().slice(-1200);
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, `${tag}.json`), JSON.stringify(result, null, 2));
  return result;
}

app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  const all = [];
  for (const f of fixtures) for (const m of MODES) { process.stdout.write(`${f.id}/${m} ... `); const r = await runOne(f, m); all.push(r); console.log(r.error ? 'ERROR ' + r.error.split('\n')[0] : `ok ${r.wallMs}ms $${r.ledger && r.ledger.TOTAL_SITE_COST} images=${r.ledger && r.ledger.imageCount}`); }
  fs.writeFileSync(path.join(OUT, 'summary.json'), JSON.stringify(all, null, 2));
  app.exit(0);
});
