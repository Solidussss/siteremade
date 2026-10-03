'use strict';
// CREATIVE FONTS (lib/creative/fonts.js): one registry of typefaces -- open-source web faces (SIL OFL, vendored, loaded only
// when a page uses them, shipped only in a website that uses them) and system stacks (nothing downloaded: no proprietary
// face is ever shipped). A page stores ids only (plan.fonts), validated against the registry; the renderer, the export,
// the previews and the editor read the same list. A page saved without fonts renders exactly as it did. Choosing fonts
// re-fits every heading by the chosen face's own measured width. REAL PROVIDER SPEND: $0 (no provider is involved).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const T = require('../lib/creative/fonts');
const LOOK = require('../lib/creative/look');
const D2 = require('../lib/creative/director2');
const { validatePlan2 } = require('../lib/creative/validate2');
const { renderCreative2 } = require('../lib/creative/render2');
const editor = require('../lib/creative-editor');
const { ASSETS, UND, FACTS } = require('./helpers/brand-fixture');
const { startServer, client, providerCalls } = require('./helpers/server-process');
const S = require('./helpers/three-d-scenario');
const { readZip } = require('./helpers/showcase-purchase');

const VENDOR = path.join(__dirname, '..', 'vendor', 'creative-fonts');
const copy = x => JSON.parse(JSON.stringify(x));
function page(seed) {
  const { plan, recipe } = D2.direct({ understanding: UND, research: { page: null, facts: FACTS }, assets: ASSETS, supplied: { facts: [], memories: [] }, seed, mainAsset: 'can' });
  return validatePlan2(plan, { assets: ASSETS, facts: FACTS, understanding: UND, art: recipe, mainAsset: 'can' }).plan;
}
const direction = plan => ({ mode: 'creative', creative: { plan: copy(plan), assets: ASSETS, understanding: UND, research: { facts: FACTS }, supplied: { facts: [], memories: [] } } });
const html = (P, o) => renderCreative2(P, ASSETS, Object.assign({ mode: 'export', src: a => `${a.id}.png` }, o || {}));
const safety = P => validatePlan2(copy(P), { assets: ASSETS, facts: FACTS, understanding: UND, mode: 'safety' }).plan;
const faces = h => [...h.matchAll(/@font-face\{font-family:"([^"]+)";font-style:normal;font-weight:(\d+);font-display:swap;src:url\("([^"]+)"\)/g)].map(m => ({ family: m[1], weight: +m[2], url: m[3] }));

// ================================================================ the registry
test('FT-1. the registry: 51 typefaces in 10 categories, clear ids, every web face vendored with its licence and the bytes it says -- and no proprietary face shipped anywhere', () => {
  assert.equal(T.LIST.length, 51); assert.equal(new Set(T.LIST.map(f => f.id)).size, T.LIST.length, 'ids unique');
  T.LIST.forEach(f => { assert.match(f.id, /^[a-z0-9-]{2,40}$/); assert.ok(f.label && ['sans-serif', 'serif', 'monospace'].includes(f.kind) && ['web', 'system'].includes(f.source), f.id); assert.ok(T.stack(f.id), f.id); });
  assert.deepEqual(T.CATEGORIES.map(c => c.label), ['Apple / Clean UI', 'Social / Instagram-style', 'Luxury / Fashion', 'Editorial', 'Modern Tech', 'Bold / Brutalist', 'Creative / Experimental', 'Friendly / Soft', 'Monospace', 'Classic / System']);
  T.CATEGORIES.forEach(c => { assert.ok(c.fonts.length >= 5, c.id); c.fonts.forEach(id => assert.ok(T.known(id), `${c.id}: ${id}`)); });
  assert.ok(T.LIST.every(f => T.CATEGORIES.some(c => c.fonts.includes(f.id))), 'every face is in a category');
  // web faces: vendored files, each the bytes the registry records, each face's SIL Open Font License beside it
  const web = T.LIST.filter(f => f.source === 'web'); assert.equal(web.length, 43);
  web.forEach(f => {
    const d = T.DATA.fonts[f.id]; assert.ok(d, f.id); assert.equal(d.license, 'OFL-1.1', f.id); assert.match(d.pkg, /^@fontsource\//);
    assert.match(fs.readFileSync(path.join(VENDOR, d.licenseFile), 'utf8'), /SIL OPEN FONT LICENSE/i, `${f.id} licence`);
    Object.values(d.weights).forEach(w => { const buf = fs.readFileSync(path.join(VENDOR, w.file)); assert.equal(buf.length, w.bytes, w.file); assert.equal(crypto.createHash('sha256').update(buf).digest('hex'), w.sha256, w.file); assert.equal(buf.readUInt32BE(0), 0x774f4632, `${w.file} is WOFF2`); });
    assert.ok(T.metrics(f.id).adv > 0.3 && T.metrics(f.id).adv < 1, `${f.id} measured`);
  });
  // system faces: a stack the device answers -- never a file, never a URL
  T.LIST.filter(f => f.source === 'system').forEach(f => { assert.equal(T.DATA.fonts[f.id], undefined); assert.doesNotMatch(f.stack, /url\(|@|;|\{/, f.id); });
  assert.equal(T.stack('apple-system'), '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Helvetica Neue", Arial, sans-serif');
  const shipped = fs.readdirSync(VENDOR); assert.equal(shipped.filter(f => f.endsWith('.woff2')).length, T.FILES.length, 'nothing vendored the registry does not name');
  shipped.forEach(f => assert.doesNotMatch(f, /sf-?pro|san-?francisco|instagram|avenir|helvetica|arial|georgia|times|garamond-premier|segoe/i, `${f}: no proprietary face is shipped`));
  // (the widths are each face's own, measured from its file by scripts/vendor-creative-fonts.js)
  assert.ok(T.metrics('syne').adv > T.metrics('inter').adv && T.metrics('inter').adv > T.metrics('bebas-neue').adv, 'a wide face is wider than a neutral one, a condensed one narrower');
  assert.equal(T.metrics('bebas-neue').upper, 1, 'a face of capitals only');
});

test('FT-2. the pairings: Apple, Instagram, Minimal, Luxury, Editorial, Tech, Streetwear, Bold Campaign, Friendly, Classic -- each a headline, a body and a label face the registry knows', () => {
  assert.deepEqual(T.PRESETS.map(p => p.name), ['Apple', 'Instagram', 'Minimal', 'Luxury', 'Editorial', 'Tech', 'Streetwear', 'Bold Campaign', 'Friendly', 'Classic']);
  T.PRESETS.forEach(p => T.ROLES.forEach(r => assert.ok(T.known(p[r]), `${p.id}.${r}: ${p[r]}`)));
  assert.deepEqual([T.preset('apple').headline, T.preset('apple').body], ['apple-system', 'apple-system']);
  assert.equal(T.preset('luxury').headline, 'bodoni-moda'); assert.equal(T.preset('streetwear').headline, 'anton'); assert.equal(T.preset('bold-campaign').headline, 'archivo-black');
});

test('FT-3. only known ids are stored: an unknown id, a font-family string, CSS -- dropped by validation, refused by the editor', () => {
  assert.equal(T.sanitize({ headline: 'comic-sans' }), null); assert.equal(T.sanitize('inter'), null); assert.equal(T.sanitize(null), null);
  assert.deepEqual(T.sanitize({ headline: 'inter', body: '"Comic Sans", cursive', label: 'x;}body{color:red', preset: 'nope', extra: 'syne' }), { headline: 'inter' });
  const P = copy(page('1')); P.fonts = { headline: 'url(evil)', body: 'Inter' }; assert.equal(safety(P).fonts, undefined, 'a stored page keeps no unknown font');
  P.fonts = { headline: 'playfair-display', body: 'inter', label: 'inter', preset: 'editorial' }; assert.deepEqual(safety(P).fonts, P.fonts);
  for (const op of [{ headline: 'helvetica-neue-pro' }, { body: '"Arial"' }, { preset: 'brutal' }, {}]) {
    const r = editor.applyEdit(direction(page('1')), Object.assign({ type: 'fonts' }, op)); assert.equal(r.ok, false, JSON.stringify(op)); assert.equal(r.code, 'invalid_request');
  }
});

test('FT-4. a page loads only the faces it uses -- a pairing of web faces declares exactly those files; the Apple pairing declares none and downloads nothing; the export points at the files it ships', () => {
  const P = page('1');
  const lux = editor.applyEdit(direction(P), { type: 'fonts', preset: 'luxury' }).creative.plan; const h = html(lux);
  assert.deepEqual(faces(h).map(f => `${f.family}:${f.weight}:${f.url}`), ['SR Bodoni Moda:700:assets/bodoni-moda-700.woff2', 'SR Manrope:400:assets/manrope-400.woff2', 'SR Manrope:700:assets/manrope-700.woff2']);
  assert.match(h, /<html[^>]* data-fonts="bodoni-moda"/); assert.match(h, /--display:"SR Bodoni Moda", Georgia/); assert.match(h, /--body:"SR Manrope"/); assert.match(h, /--label:"SR Manrope"/);
  assert.equal((h.match(/\.woff2/g) || []).length, 3, 'no other face is named anywhere');
  const apple = editor.applyEdit(direction(P), { type: 'fonts', preset: 'apple' }).creative.plan; const ha = html(apple);
  assert.deepEqual(faces(ha), [], 'system faces: no @font-face'); assert.doesNotMatch(ha, /\.woff2|@font-face/); assert.match(ha, /--display:-apple-system, BlinkMacSystemFont, "SF Pro Display"/);
  // the studio preview asks the builder's own font route; a stand-in face (Avenir Next) brings only its open fallback
  assert.match(html(lux, { mode: 'preview' }), /src:url\("\/creative-fonts\/bodoni-moda-700\.woff2"\)/);
  const av = editor.applyEdit(direction(P), { type: 'fonts', headline: 'avenir-next', body: 'avenir-next', label: 'avenir-next' }).creative.plan;
  const avf = faces(html(av)); assert.ok(avf.length && avf.every(f => f.family === 'SR Nunito Sans'), 'Avenir Next is on the device -- only its open fallback is declared'); assert.match(html(av), /--display:"Avenir Next", Avenir, "SR Nunito Sans"/);
});

test('FT-5. a website saved before fonts renders exactly as it did: no font is added on reopening, recomposing or re-applying the look -- only the owner\'s explicit choice changes its type', () => {
  ['1', '2', '3'].forEach(seed => {
    const P = page(seed); assert.equal(P.fonts, undefined, 'a page made now has no fonts until the owner picks them');
    const h = html(P); assert.doesNotMatch(h, /@font-face|data-fonts|\.woff2|--label/); assert.equal(html(safety(P)), h, 'reopened: byte for byte');
    assert.equal(validatePlan2(copy(P), { assets: ASSETS, facts: FACTS, understanding: UND, mode: 'accept', art: P.art }).plan.fonts, undefined, 'recomposed: still its own type');
    assert.match(h, new RegExp(`--display:[^;]*;--fit:165cqi`), 'the display family stack as before');
  });
  // giving a role back to the page's own type: back exactly to no fonts
  const P = page('1'); const a = editor.applyEdit(direction(P), { type: 'fonts', headline: 'inter' }).creative;
  const b = editor.applyEdit({ mode: 'creative', creative: a }, { type: 'fonts', headline: '' }); assert.equal(b.ok, true); assert.equal(b.creative.plan.fonts, undefined);
});

test('FT-6. switching fonts re-fits every heading by the chosen face: today\'s text-layout rules on every scene, the fit from the face\'s own width -- a wide face sets smaller than a condensed one; capitals are measured as capitals; the words never change', () => {
  const P = page('1'); const fit = h => +/html\[data-fonts\]\[data-fonts\]\[data-display\]\[data-case\]\{--display:[^;]+;--dw:\d+;--fit:(\d+)cqi/.exec(h)[1];
  const syne = editor.applyEdit(direction(P), { type: 'fonts', headline: 'syne' }); const bebas = editor.applyEdit(direction(P), { type: 'fonts', headline: 'bebas-neue' });
  [syne, bebas].forEach(r => { assert.equal(r.ok, true, r.message); r.creative.plan.scenes.forEach((s, i) => { assert.equal(s.text.fit, LOOK.TEXT_FIT); assert.deepEqual(editor.textOf(s), editor.textOf(P.scenes[i])); }); });
  assert.ok(fit(html(syne.creative.plan)) < fit(html(bebas.creative.plan)), 'more characters fit a line of Bebas Neue than of Syne');
  // an all-caps headline in a mixed-case face is measured as capitals (Inter) -- in a capitals-only face it already is (Bebas)
  const caps = 'THE WORLD RAISES ONE GLASS'; const lwOf = p => +/<h1 class="sc-heading[^"]*"[^>]*style="--lw:(\d+)/.exec(html(p))[1];
  const base = copy(P); base.look.type = Object.assign({}, base.look.type, { case: 'normal' });
  const withCaps = id => { let d = direction(base); d = { mode: 'creative', creative: editor.applyEdit(d, { type: 'text', sceneId: base.scenes[0].id, field: 'heading', value: caps }).creative }; return editor.applyEdit(d, { type: 'fonts', headline: id }).creative.plan; };
  assert.ok(lwOf(withCaps('inter')) >= Math.ceil(16 * T.metrics('inter').upper) + 1, 'Inter: 16 capitals measured as capitals');
  assert.ok(lwOf(withCaps('bebas-neue')) < lwOf(withCaps('inter')), 'Bebas Neue: capitals are its own width');
  // the same fonts again: nothing to save
  const again = editor.applyEdit({ mode: 'creative', creative: syne.creative }, { type: 'fonts', headline: 'syne' }); assert.equal(again.unchanged, true);
});

// ================================================================ through the bridge: saved, reopened, previewed, published, exported
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'sr-fonts-'));
let shared = null;
async function world() {
  if (shared) return shared;
  const env = S.threeDEnv(fs.mkdtempSync(path.join(TMP, 'w-')), { SITEREMADE_TRIAL_CREDITS: '200', SITEREMADE_RATE_LIMIT_APP_BRIDGE_ACCOUNT_MAX: '100000' });
  const srv = await startServer(env); const sc = await S.buildThreeDScenario({ port: srv.port, env });
  const call = client(srv.port); await call('POST', '/api/identity/supabase/session', { supabaseAccessToken: 'test-access-token-owner' });
  const as = token => async (method, url, body) => { const r = await fetch(`http://127.0.0.1:${srv.port}${url}`, { method, headers: Object.assign(token ? { authorization: `Bearer ${token}` } : {}, body ? { 'content-type': 'application/json' } : {}), body: body ? JSON.stringify(body) : undefined }); const t = r.headers.get('content-type') || ''; const buf = Buffer.from(await r.arrayBuffer()); return { status: r.status, headers: r.headers, body: /json/.test(t) ? JSON.parse(buf.toString('utf8')) : null, text: buf.toString('utf8'), buf }; };
  shared = { srv, env, sc, call, owner: as('test-access-token-owner'), other: as('test-access-token-other'), anon: as(null), projectId: sc.projectId };
  return shared;
}
test.after(async () => { if (shared) await shared.srv.stop(); });

test('FT-7. a pairing chosen in the editor is the project\'s own: saved as a draft (free, no provider), there on reopening, in the draft preview, unchanged on the published site until Publish, then in the published preview and the downloaded website -- the same faces, only those files, each with its licence', async () => {
  const w = await world(); const P = `/api/app-bridge/website/${w.projectId}`;
  const o = (await w.owner('GET', `${P}/creative`)).body; assert.equal(o.outline.fonts.current, null); assert.equal(o.outline.fonts.fonts.length, 51); assert.ok(o.outline.actions.includes('fonts'));
  assert.doesNotMatch(JSON.stringify(o.outline.fonts), /sha256|vendor|fontsource|\.woff(?!2)/, 'the picker gets names and files, nothing internal');
  const credits0 = (await w.call('GET', '/api/credits')).body.credits.remaining; const paid0 = providerCalls(w.env.MOCK_CALL_LOG).filter(c => c.provider !== 'supabase').length;
  const live0 = (await w.owner('GET', `${P}/preview`)).text;
  const r = await w.owner('POST', `${P}/creative/edit`, { baseRevision: o.revision, op: { type: 'fonts', preset: 'editorial' } });
  assert.equal(r.status, 200, JSON.stringify(r.body)); assert.equal(r.body.creditsCharged, 0); assert.match(r.body.changeSummary[0], /Instrument Serif/);
  // reopened
  const o2 = (await w.owner('GET', `${P}/creative`)).body; assert.deepEqual(o2.outline.fonts.current, { headline: 'instrument-serif', body: 'source-sans-3', label: 'inter', preset: 'editorial' });
  // the draft preview: exactly these faces, inlined
  const draft = (await w.owner('GET', `${P}/preview?source=draft`)).text; const df = faces(draft);
  assert.deepEqual(df.map(f => `${f.family}:${f.weight}`), ['SR Instrument Serif:400', 'SR Source Sans 3:400', 'SR Source Sans 3:700', 'SR Inter:700']);
  assert.ok(df.every(f => f.url.startsWith('data:font/woff2;base64,')), 'inlined in the preview');
  assert.doesNotMatch(live0, /@font-face/); assert.equal((await w.owner('GET', `${P}/preview`)).text, live0, 'the published site waits for Publish');
  // publish -> the published preview and the download carry the same faces, and only them
  assert.equal((await w.owner('POST', `${P}/publish`, { revision: r.body.revision })).status, 200);
  const live = (await w.owner('GET', `${P}/preview`)).text; assert.deepEqual(faces(live).map(f => `${f.family}:${f.weight}`), df.map(f => `${f.family}:${f.weight}`));
  const zip = readZip((await w.owner('GET', `${P}/download`)).buf); const index = zip.get('index.html').toString('utf8');
  assert.deepEqual(faces(index).map(f => `${f.family}:${f.weight}:${f.url}`), ['SR Instrument Serif:400:assets/instrument-serif-400.woff2', 'SR Source Sans 3:400:assets/source-sans-3-400.woff2', 'SR Source Sans 3:700:assets/source-sans-3-700.woff2', 'SR Inter:700:assets/inter-700.woff2']);
  const fontFiles = [...zip.keys()].filter(k => /\.woff2$/.test(k)).sort(); assert.deepEqual(fontFiles, ['assets/instrument-serif-400.woff2', 'assets/inter-700.woff2', 'assets/source-sans-3-400.woff2', 'assets/source-sans-3-700.woff2']);
  fontFiles.forEach(k => assert.deepEqual(zip.get(k), fs.readFileSync(path.join(VENDOR, k.slice(7))), `${k}: the vendored bytes`));
  ['instrument-serif', 'source-sans-3', 'inter'].forEach(id => assert.match(zip.get(`assets/${id}.OFL.txt`).toString('utf8'), /SIL OPEN FONT LICENSE/i));
  assert.match(zip.get('ATTRIBUTION.md').toString('utf8'), /## Typefaces[\s\S]*Instrument Serif -- SIL Open Font License 1\.1/);
  const manifest = JSON.parse(zip.get('export-manifest.json').toString('utf8')); assert.equal(manifest.assets.filter(a => a.contentType === 'font/woff2').length, 4);
  // free, and no provider
  assert.equal((await w.call('GET', '/api/credits')).body.credits.remaining, credits0); assert.equal(providerCalls(w.env.MOCK_CALL_LOG).filter(c => c.provider !== 'supabase').length, paid0);
  // another customer cannot choose this website's fonts
  assert.equal((await w.other('POST', `${P}/creative/edit`, { baseRevision: r.body.revision, op: { type: 'fonts', preset: 'apple' } })).status, 404);
});

test('FT-8. the builder\'s font route serves exactly the registry\'s files -- immutable, readable as fonts across origins -- and nothing else (no other name, no path, not the repo folder)', async () => {
  const w = await world();
  const ok = await w.anon('GET', '/creative-fonts/inter-700.woff2'); assert.equal(ok.status, 200); assert.equal(ok.headers.get('content-type'), 'font/woff2');
  assert.equal(ok.headers.get('access-control-allow-origin'), '*'); assert.match(ok.headers.get('cache-control'), /immutable/); assert.deepEqual(ok.buf, fs.readFileSync(path.join(VENDOR, 'inter-700.woff2')));
  for (const u of ['/creative-fonts/inter-900.woff2', '/creative-fonts/inter.LICENSE.txt', '/creative-fonts/..%2fserver.js', '/creative-fonts/../server.js', '/creative-fonts/INTER-700.woff2', '/vendor/creative-fonts/inter-700.woff2', '/creative-fonts/']) {
    const r = await w.anon('GET', u); assert.ok(r.status === 404 || (r.status === 200 && /<html/i.test(r.text) && !r.buf.equals(ok.buf)), `${u}: ${r.status}`); assert.notEqual(r.headers.get('content-type'), 'font/woff2', u);
  }
});
