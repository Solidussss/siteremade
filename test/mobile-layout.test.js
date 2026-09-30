'use strict';
// Mobile QA regressions -- the fixes a real phone audit found (test/review/mobile-audit.js renders the builder and the
// compiled websites in Electron at 320-820px and measures them; this repo has no browser dependency, so `npm test`
// pins the specific causes instead):
//   - generated websites' form fields were invisible on light sites (a fixed white-on-dark border);
//   - process step titles collapsed ("Reachout") because a [class*="-num"] rule also caught the list containers;
//   - the phone nav button (8px) and hero buttons (9px) were unreadable;
//   - text fields under 16px make iOS zoom the page;
//   - builder controls were 26-38px tall;
//   - the Creative header let dark scenes' words run under the page title.
// Plus the compiled outputs themselves: a Business export and a Creative export carry what phones need.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const CSS = fs.readFileSync(path.join(__dirname, '..', 'styles.css'), 'utf8').replace(/\r\n/g, '\n').replace(/\/\*[\s\S]*?\*\//g, ''); // rules only, never comments
// every rule inside @media blocks whose condition matches `re`, as one string
function mediaBlocks(css, re) {
  const out = []; let i = 0;
  while ((i = css.indexOf('@media', i)) !== -1) {
    const open = css.indexOf('{', i); const cond = css.slice(i + 6, open);
    let depth = 1, j = open + 1; while (depth && j < css.length) { if (css[j] === '{') depth++; else if (css[j] === '}') depth--; j++; }
    if (re.test(cond)) out.push(css.slice(open + 1, j - 1));
    i = j;
  }
  return out.join('\n');
}
const PHONE = mediaBlocks(CSS, /max-width:\s*720px/);
const TOUCH = mediaBlocks(CSS, /pointer:\s*coarse/);
const px = (block, selector, prop) => { const m = new RegExp(selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\{[^}]*' + prop + ':\\s*([\\d.]+)px').exec(block); return m ? Number(m[1]) : null; };

test('generated websites: form fields take their colours from the site palette, never a fixed white-on-dark border', () => {
  const rule = /\.module-field input,\.module-field select,\.module-field textarea\{([^}]*)\}/.exec(CSS)[1];
  assert.ok(!/rgba\(255,\s*255,\s*255/.test(rule), 'no white border that disappears on a light site');
  assert.match(rule, /border:1px solid color-mix\(in srgb,var\(--site-text\)/);
  assert.match(rule, /background:color-mix\(in srgb,var\(--site-bg\)/);
});

test('generated websites: the large-step numbers rule targets the numbers only, not the list that contains them', () => {
  assert.ok(!/\[class\*="-num"\]/.test(CSS), 'a substring class match also caught process-flow-large-number / process-flow-numbered');
  const m = /\[data-comp-layout="large-steps"\] :is\(([^)]*)\)\{font-size/.exec(CSS);
  assert.ok(m, 'the rule exists');
  const targets = m[1].split(',').map(s => s.trim());
  assert.ok(targets.includes('.process-large-num') && targets.includes('.process-flow-num'));
  assert.ok(!targets.some(t => /process-flow-large-number|process-flow-numbered|process-flow\b(?!-)/.test(t)));
});

test('generated websites on phones: readable nav, buttons, labels and card text', () => {
  assert.ok(px(PHONE, '.builder-site .site-nav button', 'font-size') >= 13, 'nav button (was 8px)');
  assert.ok(px(PHONE, '.site-brand-lockup #siteBusiness', 'font-size') >= 13, 'business name (was 10px)');
  const tablet = mediaBlocks(CSS, /max-width:\s*1024px/);
  assert.ok(px(tablet, '.builder-site .site-actions :is(button, a)', 'font-size') >= 14, 'hero / section buttons (were 9px)');
  assert.ok(px(tablet, '.builder-site .module-field label', 'font-size') >= 13);
  assert.ok(px(tablet, '.builder-site .site-nav-link', 'font-size') >= 13);
});

test('text fields are 16px on tablets and touch screens (iOS zooms the page for anything smaller)', () => {
  assert.match(TOUCH, /:is\(input:not\(\[type=checkbox\]\)[^{]*select, textarea\)\s*\{\s*font-size:16px!important/);
  assert.match(mediaBlocks(CSS, /max-width:\s*1024px\),\s*\(pointer:\s*coarse/), /font-size:16px!important/, 'the same rule covers tablets by width');
});

test('builder controls are finger-sized on phones and tablets, and readable; the generated preview keeps its own design', () => {
  const rule = /(:is\(\.nav, \.hero, \.builder-section[^{]*)\{\s*min-height:44px;/.exec(mediaBlocks(CSS, /max-width:\s*1024px\),\s*\(pointer:\s*coarse/));
  assert.match(PHONE, /\.tone-toggle button, \.device-toggle button, \.reset-colors, \.asset-add-button[^{]*\{\s*font-size:13px;/, 'readable builder buttons on phones (were 9-10px)');
  assert.match(PHONE, /\.control-label[^{]*\{\s*font-size:12px;/);
  assert.ok(rule, 'a 44px rule for the builder interface');
  assert.match(rule[1], /:not\(\.builder-site \*\)/, 'never inside the generated website preview');
  assert.match(rule[1], /#creativeStudio/, 'the Creative studio too');
  assert.match(mediaBlocks(CSS, /max-width:\s*430px/), /\.device-toggle \{[^}]*grid-template-columns:repeat\(3, minmax\(0, 1fr\)\)/, 'Desktop / Tablet / Mobile on one row');
  assert.match(CSS, /\.refinement-row textarea,\.refinement-row input\{width:100%/, 'the change-request box fills its card');
});

test('a compiled Business website ships a phone viewport and the phone rules', () => {
  process.env.SITEREMADE_BACKEND = 'local';
  const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'sr-mobile-export-'));
  process.env.SITEREMADE_ASSET_STORE_DIR = path.join(TMP, 'assets');
  try {
    const { loadClient, premiumProviderStatus, buildProject } = require('./helpers/load-client');
    const projectStore = require('../lib/project-store');
    const { compileExport } = require('../lib/export-compiler');
    const db = require('../lib/adapters/database-adapter').getDatabaseAdapter(':memory:');
    const { proj } = buildProject(loadClient(), 'Summit Roofing repairs and replaces residential roofs in Calgary, with free inspections.', { providerStatus: premiumProviderStatus() });
    const state = projectStore.validateDirectionsState({ directions: [JSON.parse(JSON.stringify(proj))], activeDirectionIndex: 0 }).normalized;
    projectStore.internalizeAssets(db, state);
    const workDir = path.join(TMP, 'out');
    compileExport(db, { project: { id: 'proj_mobile_check', revision: 1, directionsState: state }, directionIndex: 0, workDir, hostingChoice: null, purchaseDate: null });
    const html = fs.readFileSync(path.join(workDir, 'index.html'), 'utf8');
    assert.match(html, /<meta name="viewport" content="width=device-width, initial-scale=1(\.0)?">/);
    assert.ok(!/style="[^"]*\bwidth:\s*(\d{4,}|[4-9]\d\d)px/.test(html), 'no fixed pixel width wider than a phone in the markup');
    const css = fs.readFileSync(path.join(workDir, 'styles.css'), 'utf8');
    assert.ok(css.includes('font-size:16px!important') && css.includes('.builder-site .site-actions :is(button, a) { font-size:14px; }'), 'the phone rules travel with the website');
  } finally { fs.rmSync(TMP, { recursive: true, force: true }); }
});

test('a compiled Creative page keeps its motion on phones, recomposes its scenes, and has a solid header', () => {
  const { renderCreative2 } = require('../lib/creative/render2');
  const { validatePlan2 } = require('../lib/creative/validate2');
  const saved = JSON.parse(JSON.stringify(require('./fixtures/creative-saved-stage2.json').creative));
  const plan = validatePlan2(saved.plan, { assets: saved.assets, facts: saved.plan.facts }).plan;
  const out = renderCreative2(plan, saved.assets, { mode: 'export' });
  const page = typeof out === 'string' ? out : (out && out.html) || '';
  assert.match(page, /<meta name="viewport" content="width=device-width/);
  const phone = mediaBlocks(page.replace(/\r\n/g, '\n'), /max-width:\s*720px/);
  assert.ok(phone.length > 500, 'a phone composition exists');
  assert.match(phone, /\.cr-nav\{background:rgba\(var\(--bg-rgb\),\.9\d?\)/, 'a solid header bar on phones');
  assert.match(phone, /\.ly\{left:calc\(var\(--mx\)\*1%\)/, 'layers take their phone boxes (recomposed, not hidden)');
  assert.ok(!/animation:\s*none/.test(phone), 'motion is not switched off on phones -- only for reduced motion');
  assert.match(phone, /min-height:44px/);
  // every layer's phone box starts on the screen
  plan.scenes.forEach(s => (s.layers || []).forEach(L => { const m = L.box && L.box.m; if (!m) return; assert.ok(m[0] > -60 && m[0] < 100 && m[1] > -60 && m[1] < 100, `${s.id}: layer starts on screen (${m})`); }));
});
