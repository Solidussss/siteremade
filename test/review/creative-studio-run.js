'use strict';
// Electron: drives the REAL Creative studio (index.html?creative=1 on a local server.js) the way
// a person would -- sign up, open Creative mode, type the brief, add uploads, create, edit text,
// replace / remove pictures, save, reload the whole page and reopen the project from the
// account -- and records screenshots, timings and what the studio produced.
//   electron creative-studio-run.js job.json
// job: { url, outDir, email, cases: [{ id, brief, supplied, memories, uploads: [file], fixture, replaceWith, remove, failAsset }] }
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

const job = JSON.parse(fs.readFileSync(process.argv[process.argv.length - 1], 'utf8'));
const sleep = ms => new Promise(r => setTimeout(r, ms));
app.disableHardwareAcceleration();
const log = m => { process.stdout.write(m + '\n'); fs.appendFileSync(path.join(job.outDir, 'studio-run.log'), m + '\n'); };

async function grab(w) { let img = null; for (let t = 0; t < 30 && (!img || img.isEmpty()); t++) { try { w.webContents.invalidate(); img = await w.webContents.capturePage(); } catch (e) { img = null; } if (!img || img.isEmpty()) await sleep(250 + t * 50); } return img; }
async function shot(w, name) { const img = await grab(w); if (img) fs.writeFileSync(path.join(job.outDir, name + '.png'), img.toPNG()); return name + '.png'; }
const js = (w, code) => w.webContents.executeJavaScript(code);
async function until(w, code, ms, every) { const t0 = Date.now(); while (Date.now() - t0 < ms) { const v = await js(w, code).catch(() => null); if (v) return v; await sleep(every || 300); } return null; }
function fileJs(file) { const b64 = fs.readFileSync(file).toString('base64'); const type = /\.png$/i.test(file) ? 'image/png' : 'image/jpeg'; return `(() => { const bin = atob(${JSON.stringify(b64)}); const a = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i); return new File([a], ${JSON.stringify(path.basename(file))}, { type: ${JSON.stringify(type)} }); })()`; }
// v2 (AI-directed) plans: the direction, its provenance, its scenes and layers
const SUMMARY2 = `(() => { const S = SiteRemadeCreativeStudio.state(); const p = S.plan; if (!p) return null; return {
  v: 2, planMeta: S.planMeta, understandMeta: S.understandMeta, identity: p.identity, concept: p.concept, palette: p.palette, type: p.type, atmosphere: p.atmosphere, motion: p.motion, thread: p.thread,
  scenes: p.scenes.map(s => ({ id: s.id, name: s.name, purpose: s.purpose, link: s.link, height: s.height, pin: s.pin, camera: s.camera, background: s.background, text: { kicker: s.text.kicker, heading: s.text.heading, body: s.text.body, kind: s.text.kind, cite: s.text.cite, items: s.text.items, region: s.text.region, list: s.text.list }, layers: s.layers.map(l => ({ kind: l.kind, role: l.role, asset: l.asset, shape: l.shape, word: l.word, mask: l.mask, treatment: l.treatment, fit: l.fit, entrance: l.entrance.kind, loop: l.loop.kind, scroll: l.scroll.kind, d: l.box.d, m: l.box.m })) })),
  wants: p.wants, limitations: p.limitations, assetNotes: p.assetNotes, credits: p.credits, facts: p.facts.length, fixes: S.lastFixes, warnings: S.lastWarnings, history: S.history,
  assets: S.assets.map(a => ({ id: a.id, origin: a.origin, title: a.title, license: a.license || '', author: (a.author || '').slice(0, 80), found: a.found || '', size: a.assess ? a.assess.width + 'x' + a.assess.height : '', cutout: !!a.cutout, cutoutOf: a.cutoutOf || null, processing: a.processing || '', removed: !!a.removed })),
  research: S.research ? { status: S.research.status, page: S.research.page && { title: S.research.page.title, url: S.research.page.url }, log: S.research.log, facts: (S.research.facts || []).length } : null,
  understanding: S.understanding, cost: S.cost, htmlBytes: (S.lastHtml || '').length } })()`;
const SUMMARY = `(() => { const S = SiteRemadeCreativeStudio.state(); const p = S.plan; if (!p) return null; if (p.v === 2) return ${SUMMARY2}; return {
  kind: p.kind, category: p.category, tone: p.tone, world: p.world, concept: p.concept.line, connector: p.connector.kind, layout: p.hero.layout,
  layers: p.hero.layers.map(l => ({ role: l.role, asset: l.asset, frame: l.frame, fit: l.fit, entrance: l.entrance.kind, loop: l.loop.kind, d: l.box.d, m: l.box.m, hideM: !!l.hideM })),
  title: p.hero.title, sections: p.sections.map(s => ({ type: s.type, kind: s.kind, title: s.title || '', items: (s.items || []).length, asset: s.asset || null, assets: s.assets || null })),
  facts: p.facts.length, sources: p.sources, credits: p.credits, derived: p.derived, fixes: S.lastFixes, warnings: S.lastWarnings,
  assets: S.assets.map(a => ({ id: a.id, origin: a.origin, title: a.title, license: a.license || '', author: (a.author || '').slice(0, 80), found: a.found || '', relevance: a.relevance, size: a.assess ? a.assess.width + 'x' + a.assess.height : '', transparent: !!(a.assess && a.assess.transparent), bgUniformity: a.assess && a.assess.background ? a.assess.background.uniformity : null, cutout: !!a.cutout, cutoutOf: a.cutoutOf || null, processing: a.processing || '', removed: !!a.removed, failed: !!a.failed, bytes: a.dataUrl ? Math.round(a.dataUrl.length * 0.75) : 0 })),
  research: S.research ? { status: S.research.status, page: S.research.page && { title: S.research.page.title, url: S.research.page.url, category: S.research.page.category }, log: S.research.log } : null,
  understanding: S.understanding, cost: S.cost, htmlBytes: (S.lastHtml || '').length } })()`;

app.whenReady().then(async () => {
  await require('electron').session.defaultSession.clearCache(); // a review must never run a cached older studio
  fs.mkdirSync(job.outDir, { recursive: true });
  const w = new BrowserWindow({ width: 1440, height: 900, show: true, useContentSize: true, webPreferences: { backgroundThrottling: false } });
  const results = { cases: [] };
  try {
    await w.loadURL(job.url + '/?creative=1');
    await until(w, `!!window.SiteRemadeCreativeEntry && document.readyState === 'complete'`, 20000);
    // Business first: the page as a Business visitor sees it (the switch only appears with ?creative=1)
    results.businessBefore = await js(w, `({ lastProject: localStorage.getItem('siteremade:lastProject'), switch: !!document.getElementById('modeSwitch'), creativeLoaded: !!window.SiteRemadeCreative })`);
    await shot(w, 'business-with-switch');
    // an account: sign up, or (a remote review account that already exists) sign in
    const pw = job.password || 'correct-horse-battery-staple';
    const signup = await js(w, `fetch('/api/auth/signup', { method: 'POST', headers: { 'content-type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify({ email: ${JSON.stringify(job.email)}, password: ${JSON.stringify(pw)} }) }).then(r => r.status)`);
    log('signup ' + signup);
    if (signup !== 200) log('signin ' + await js(w, `fetch('/api/auth/signin', { method: 'POST', headers: { 'content-type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify({ email: ${JSON.stringify(job.email)}, password: ${JSON.stringify(pw)} }) }).then(r => r.status)`));
    await w.loadURL(job.url + '/?creative=1');
    await until(w, `typeof currentAccount !== 'undefined' && !!currentAccount`, 20000);
    for (const c of job.cases) {
      const r = { id: c.id, brief: c.brief, shots: [], timings: {} };
      results.cases.push(r);
      try {
        await js(w, `SiteRemadeCreativeEntry.open()`);
        await until(w, `!!window.SiteRemadeCreativeStudio && !document.getElementById('creativeStudio').hidden`, 20000);
        if (c.fixture) await js(w, `SiteRemadeCreativeStudio.setFixture(${JSON.stringify(c.fixture)})`);
        for (const f of c.uploads || []) await js(w, `SiteRemadeCreativeStudio.addFiles([${fileJs(f)}])`);
        await js(w, `(() => { const set = (id, v) => { const e = document.getElementById(id); e.value = v; e.dispatchEvent(new Event('input')); }; set('csBrief', ${JSON.stringify(c.brief)}); set('csSupplied', ${JSON.stringify((c.supplied || []).join('\n'))}); set('csMemories', ${JSON.stringify((c.memories || []).join('\n'))}); if (${!!(c.supplied || c.uploads)}) document.getElementById('csPersonal').open = true; return true; })()`);
        r.shots.push(await shot(w, `${c.id}-studio-brief`));
        const t0 = Date.now();
        await js(w, `SiteRemadeCreativeStudio.create()`);
        const WAIT = `(() => { const S = SiteRemadeCreativeStudio.state(); return (S.plan && !S.busy) ? 'plan' : (!document.getElementById('csError').hidden ? 'error:' + document.getElementById('csError').textContent : (document.querySelector('.cs-choice') ? 'ambiguous' : null)); })()`;
        let ok = await until(w, WAIT, 240000, 400);
        // a clarification: record it, then answer as the case says (the owner's choice)
        if (ok === 'ambiguous' && c.choose) {
          r.clarification = await js(w, `({ question: document.querySelector('#csChoices p') && document.querySelector('#csChoices p').textContent, options: [...document.querySelectorAll('.cs-choice strong')].map(e => e.textContent) })`);
          r.shots.push(await shot(w, `${c.id}-studio-clarify`));
          await js(w, `(() => { const b = [...document.querySelectorAll('.cs-choice')].find(x => x.textContent.toLowerCase().includes(${JSON.stringify(c.choose.toLowerCase())})) || document.querySelector('.cs-choice'); b.click(); return true; })()`);
          ok = await until(w, WAIT.replace("document.querySelector('.cs-choice') ? 'ambiguous' : null", 'null'), 240000, 400);
        }
        r.timings.createMs = Date.now() - t0; r.outcome = ok;
        r.progress = await js(w, `[...document.querySelectorAll('#csProgressList li')].map(li => ({ step: li.dataset.step, state: li.dataset.state || '', note: li.querySelector('small').textContent }))`);
        log(`${c.id}: ${ok} in ${r.timings.createMs}ms`);
        if (ok === 'ambiguous') { r.shots.push(await shot(w, `${c.id}-studio-ambiguous`)); r.options = await js(w, `[...document.querySelectorAll('.cs-choice strong')].map(e => e.textContent)`); continue; }
        if (ok !== 'plan') { r.shots.push(await shot(w, `${c.id}-studio-error`)); continue; }
        await sleep(4500);
        r.summary = await js(w, SUMMARY);
        r.shots.push(await shot(w, `${c.id}-studio-desktop`));
        await js(w, `document.querySelector('[data-device="phone"]').click()`); await sleep(3500);
        r.shots.push(await shot(w, `${c.id}-studio-phone`));
        await js(w, `document.querySelector('[data-device="desktop"]').click()`); await sleep(500);
        for (const tab of ['pictures', 'sources', 'motion']) { await js(w, `document.querySelector('[data-tab="${tab}"]').click()`); await sleep(400); r.shots.push(await shot(w, `${c.id}-studio-tab-${tab}`)); }
        await js(w, `document.querySelector('[data-tab="words"]').click()`);
        // save
        await js(w, `SiteRemadeCreativeStudio.save()`);
        const saved = await until(w, `(() => { const S = SiteRemadeCreativeStudio.state(); return S.projectId && !S.dirty ? S.projectId : null; })()`, 60000);
        r.projectId = saved; log(`${c.id}: saved ${saved}`);
        // edit text in place: the preview updates without a rebuild
        if (c.edit) {
          const before = await js(w, `document.getElementById('csFrame').contentDocument.querySelector('.cr-hero') === window.__lastHero || (window.__lastHero = document.getElementById('csFrame').contentDocument.querySelector('.cr-hero'), false)`);
          // v1: the tagline; v2: the opening scene's small line above the title
          const key = await js(w, `SiteRemadeCreativeStudio.state().plan.v === 2 ? 'scenes.0.text.kicker' : 'hero.title.tagline'`);
          await js(w, `(() => { const ta = document.querySelector('textarea[data-key="${key}"]'); ta.value = ${JSON.stringify(c.edit)}; ta.dispatchEvent(new Event('input')); return true; })()`);
          await sleep(300);
          r.edit = await js(w, `(() => { const d = document.getElementById('csFrame').contentDocument; const p = SiteRemadeCreativeStudio.state().plan; return { key: ${JSON.stringify(key)}, shown: (d.querySelector('[data-edit="${key}"]') || {}).textContent, sameDocument: d.querySelector('.cr-hero') === window.__lastHero, plan: p.v === 2 ? p.scenes[0].text.kicker : p.hero.title.tagline }; })()`);
          r.edit.before = before;
          r.shots.push(await shot(w, `${c.id}-studio-edited`));
          await js(w, `SiteRemadeCreativeStudio.save()`); await until(w, `!SiteRemadeCreativeStudio.state().dirty`, 60000);
        }
        // replace the main picture with another file: the hero is re-directed for the new picture
        if (c.replaceWith) {
          const main = await js(w, `(() => { const S = SiteRemadeCreativeStudio.state(); const p = S.plan; const l = p.v === 2 ? p.scenes[0].layers.find(x => x.role === 'focal' && x.asset) : p.hero.layers[0]; if (!l) return null; const a = S.assets.find(x => x.id === l.asset); return a ? (a.cutoutOf || a.id) : null; })()`);
          await js(w, `document.querySelector('[data-tab="pictures"]').click()`);
          // the Replace button opens a file picker; the test hands the file straight to the same function
          await js(w, `(() => { const orig = HTMLInputElement.prototype.click; const f = ${fileJs(c.replaceWith)}; HTMLInputElement.prototype.click = function () { if (this.type === 'file') { const dt = new DataTransfer(); dt.items.add(f); this.files = dt.files; this.dispatchEvent(new Event('change')); HTMLInputElement.prototype.click = orig; return; } return orig.call(this); }; document.querySelector('[data-replace="${main}"]').click(); return true; })()`);
          await until(w, `(() => { const S = SiteRemadeCreativeStudio.state(); const p = S.plan; const l = p.v === 2 ? p.scenes[0].layers.find(x => x.role === 'focal' && x.asset) : p.hero.layers[0]; if (!l) return null; const a = S.assets.find(x => x.id === l.asset); return a && (a.cutoutOf || a.id) !== ${JSON.stringify(main)}; })()`, 30000);
          await sleep(3500);
          r.replace = { from: main, summary: await js(w, SUMMARY) };
          r.shots.push(await shot(w, `${c.id}-studio-replaced`));
          await js(w, `SiteRemadeCreativeStudio.save()`); await until(w, `!SiteRemadeCreativeStudio.state().dirty`, 60000);
        }
        if (c.remove) {
          const victim = await js(w, `(() => { const S = SiteRemadeCreativeStudio.state(); const s = S.plan.sections.find(x => x.type === 'plate' || x.type === 'gallery'); return s ? (s.asset || s.assets[0]) : null; })()`);
          if (victim) {
            await js(w, `document.querySelector('[data-tab="pictures"]').click(); document.querySelector('[data-remove="${victim}"]').click(); true`); await sleep(1500);
            r.remove = { asset: victim, sections: await js(w, `SiteRemadeCreativeStudio.state().plan.sections.map(s => s.type + (s.asset ? ':' + s.asset : '') + (s.assets ? ':' + s.assets.join('+') : ''))`) };
            await js(w, `SiteRemadeCreativeStudio.save()`); await until(w, `!SiteRemadeCreativeStudio.state().dirty`, 60000);
          }
        }
        r.savedHtmlBytes = await js(w, `SiteRemadeCreativeStudio.html().length`);
        const planBefore = await js(w, `JSON.stringify(SiteRemadeCreativeStudio.state().plan)`);
        // reload the whole app and reopen the project from the account list
        await w.loadURL(job.url + '/');
        await until(w, `typeof currentAccount !== 'undefined' && !!currentAccount && typeof loadSelectedOwnedProjectById === 'function'`, 20000);
        r.businessAfterReload = await js(w, `({ lastProject: localStorage.getItem('siteremade:lastProject'), switchShown: !!document.getElementById('modeSwitch'), creativeCoreLoaded: !!window.SiteRemadeCreative, directions: typeof directions !== 'undefined' ? directions.length : null })`);
        const t1 = Date.now();
        await js(w, `loadSelectedOwnedProjectById(${JSON.stringify(saved)})`);
        const reopened = await until(w, `(() => { const S = window.SiteRemadeCreativeStudio && SiteRemadeCreativeStudio.state(); return S && S.projectId === ${JSON.stringify(saved)} && S.plan ? true : null; })()`, 60000);
        r.timings.reopenMs = Date.now() - t1;
        await sleep(4000);
        const planAfter = await js(w, `JSON.stringify(SiteRemadeCreativeStudio.state().plan)`);
        r.reopen = { ok: !!reopened, planIdentical: planBefore === planAfter, planBytes: planAfter.length, businessUntouched: await js(w, `({ lastProject: localStorage.getItem('siteremade:lastProject'), directions: typeof directions !== 'undefined' ? directions.length : null })`) };
        if (!r.reopen.planIdentical) { fs.writeFileSync(path.join(job.outDir, `${c.id}-plan-before.json`), planBefore); fs.writeFileSync(path.join(job.outDir, `${c.id}-plan-after.json`), planAfter); }
        r.shots.push(await shot(w, `${c.id}-studio-reopened`));
        const proj = await js(w, `fetch('/api/projects/${saved}', { credentials: 'same-origin' }).then(r => r.json())`);
        fs.writeFileSync(path.join(job.outDir, `${c.id}.project.json`), JSON.stringify(proj.project));
        // "Try another direction" on the reopened project: same subject, facts and pictures; a different concept
        if (c.another) {
          const t2 = Date.now();
          await js(w, `(() => { window.confirm = () => true; SiteRemadeCreativeStudio.anotherDirection(); return true; })()`);
          await until(w, `(() => { const S = SiteRemadeCreativeStudio.state(); return S && !S.busy && S.history && S.history.length ? true : null; })()`, 240000, 500);
          r.timings.anotherMs = Date.now() - t2; await sleep(4500);
          r.another = await js(w, SUMMARY);
          r.shots.push(await shot(w, `${c.id}-b-studio-desktop`));
          await js(w, `SiteRemadeCreativeStudio.save()`); await until(w, `!SiteRemadeCreativeStudio.state().dirty`, 60000);
          const proj2 = await js(w, `fetch('/api/projects/${saved}', { credentials: 'same-origin' }).then(r => r.json())`);
          fs.writeFileSync(path.join(job.outDir, `${c.id}-b.project.json`), JSON.stringify(proj2.project));
          log(`${c.id}: another direction in ${r.timings.anotherMs}ms: ${r.another && r.another.concept ? r.another.concept.title : '?'}`);
        }
        await js(w, `SiteRemadeCreativeStudio.close(); true`);
        await w.loadURL(job.url + '/?creative=1');
        await until(w, `typeof currentAccount !== 'undefined' && !!currentAccount`, 20000);
        log(`${c.id}: reopened ${r.reopen.ok} identical ${r.reopen.planIdentical}`);
      } catch (e) { r.error = String(e && e.stack || e).slice(0, 600); log(`${c.id}: ERROR ${r.error}`); }
      fs.writeFileSync(path.join(job.outDir, 'studio-results.json'), JSON.stringify(results, null, 1));
    }
    results.projects = await js(w, `fetch('/api/projects', { credentials: 'same-origin' }).then(r => r.json())`);
  } catch (e) { results.error = String(e && e.stack || e); log('FATAL ' + results.error); }
  fs.writeFileSync(path.join(job.outDir, 'studio-results.json'), JSON.stringify(results, null, 1));
  app.quit();
});
