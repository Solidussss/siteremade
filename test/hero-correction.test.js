'use strict';
// Correction pass: the hero's words never move or clip; supporting frames keep off product labels; stated
// offerings choose what is drawn. Through the REAL client (script.js in a vm with premium-core.js), the REAL save
// validator and export renderer. No provider is ever called.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { buildHeroFixture } = require('./helpers/hero-matrix-build');
const { HERO_MATRIX } = require('./fixtures/hero-matrix');
const { framingReport, parseHero } = require('./helpers/hero-framing-check');
const S = require('../lib/premium/hero-storyboard');
const FR = require('../lib/premium/hero-framing');
const K = require('../lib/premium/hero-art-kinds');
const siteRender = require('../lib/site-render');
const projectStore = require('../lib/project-store');

const plain = v => JSON.parse(JSON.stringify(v));
const cache = {};
async function hero(text, opts) { const k = `${text}|${JSON.stringify(opts || {})}`; if (!cache[k]) cache[k] = await buildHeroFixture({ text }, opts || { providerStatus: null }); return cache[k]; }
const fx = id => HERO_MATRIX.find(f => f.id === id).text;

// ---- 1. the words stay put ---------------------------------------------------------------------------------------
test('the hero copy sits outside the moving stage and no rule animates, transforms or clips it', async () => {
  const html = (await hero(fx('summit-roofing'))).heroHtml();
  const copyAt = html.indexOf('class="cinema-copy sb-copy"'), stageAt = html.indexOf('class="sb-stage"');
  assert.ok(copyAt > 0 && stageAt > copyAt, 'the copy is a sibling before the stage, never inside a moving layer');
  const css = fs.readFileSync(path.join(__dirname, '..', 'styles.css'), 'utf8');
  const rules = css.match(/[^{}]*\{[^{}]*\}/g) || [];
  const copyRules = rules.filter(r => /(\.sb-copy|\.cinema-copy)(?![-\w])[^{]*\{/.test(r) && /hero-storyboard|hero-cinema/.test(r.split('{')[0]));
  assert.ok(copyRules.length > 5);
  for (const r of copyRules) {
    const body = r.slice(r.indexOf('{'));
    // the only motion allowed is the one-time entrance: never looping, never sideways
    const anim = /\banimation\s*:\s*([^;}]+)/.exec(body);
    if (anim && !/^none/.test(anim[1].trim())) {
      assert.ok(!/infinite/.test(anim[1]), `looping copy animation: ${r.trim().slice(0, 120)}`);
      const name = anim[1].trim().split(/\s+/)[0]; const kf = new RegExp(`@keyframes ${name}\\{([\\s\\S]*?)\\}\\}`).exec(css);
      assert.ok(kf, `keyframes ${name}`);
      assert.ok(!/translate3d\(\s*-?[1-9]|translateX|translate\(\s*-?[1-9]/.test(kf[1]), `copy moves sideways in ${name}`);
    }
    assert.ok(!/\btransform\s*:(?!\s*none)/.test(body), `transformed copy: ${r.trim().slice(0, 120)}`);
    assert.ok(!/overflow(-x)?\s*:\s*(hidden|clip)/.test(body), `copy clipped by an overflow rule: ${r.trim().slice(0, 120)}`);
  }
});

// ---- 2. labels stay clear ----------------------------------------------------------------------------------------
const PRODUCT_KINDS = new Set(['pantry-hero', 'can-hero', 'can-range', 'bottle-hero', 'skincare-hero', 'skincare-range', 'coffee-bag', 'home-object', 'basin-ritual']);
test('Ember & Salt: every bottle label (brand and heat level) stays wholly in view on desktop and phones, through the whole loop', async () => {
  const b = await hero(fx('ember-salt'));
  const lead = framingReport(b.heroHtml()).filter(r => r.slot === 'hero');
  assert.equal(lead.length, 2);
  for (const r of lead) {
    assert.ok(r.labels >= 6, `${r.view}: the brand and the heat level on each of three bottles are tracked (${r.labels})`);
    assert.equal(r.details, 1, `${r.view}: the most-covered label is fully visible (${r.details})`);
  }
  // the round dish inset still overlaps the bottles (the depth is kept): it now travels less instead of moving away
  const { layers } = parseHero(b.heroHtml());
  const raw = S.resolveLayers(b.proj.heroStoryboard);
  const dish = layers.find(l => l.slot !== 'hero' && l.z > layers.find(x => x.slot === 'hero').z && JSON.stringify(l.desktop) === JSON.stringify(raw.find(x => x.slot === l.slot).desktop) && Math.abs(l.track.to.y) < Math.abs(raw.find(x => x.slot === l.slot).track.to.y) + 1e-9 && (Math.abs(l.track.to.x) + Math.abs(l.track.to.y)) < (Math.abs(raw.find(x => x.slot === l.slot).track.to.x) + Math.abs(raw.find(x => x.slot === l.slot).track.to.y)));
  assert.ok(dish, 'a covering inset keeps its placement and moves less');
  const leadRaw = raw.find(x => x.slot === 'hero');
  const stillOverlaps = ['desktop', 'phone'].some(view => { const sr = FR.stageRatio(view, b.proj.heroStoryboard.copySafe); const a = FR.placedRect(dish, view, sr), c = FR.placedRect(leadRaw, view, sr); return a[0] < c[0] + c[2] && a[0] + a[2] > c[0] && a[1] < c[1] + c[3] && a[1] + a[3] > c[1]; });
  assert.ok(stillOverlaps, 'the inset still overlaps the lead');
});

test('the check is meaningful: with the insets moving at full travel, the heat-level label was covered', async () => {
  const b = await hero(fx('ember-salt'));
  const sb = b.proj.heroStoryboard; const raw = S.resolveLayers(sb); const leadLayer = sb.layers.find(l => l.slot === 'hero');
  const art = Object.assign({}, leadLayer.art, { params: Object.assign({}, leadLayer.art.params, { label: 'Ember & Salt' }) });
  const lead = raw.find(l => l.slot === 'hero');
  const worst = Math.min(...['desktop', 'phone'].map(view => K.framingOf(art, { aspect: leadLayer.aspect, role: 'lead', seed: `${sb.conceptId}|hero` }, { ratio: FR.frameRatioOf(lead, view, sb.copySafe), pan: leadLayer.pan, shape: lead.shape, avoid: FR.occludersFor(raw, 'hero', view, sb.copySafe) }).detailShare));
  assert.ok(worst < 0.999, `undamped, a label is partly covered (${worst})`);
});

test('product line-ups across the fixtures keep every label clear; crowded leads keep their middle clear', async () => {
  const texts = HERO_MATRIX.filter(f => !f.plan).map(f => f.text).concat([
    'Red Door Hot Sauce makes habanero mango and garlic jalapeno hot sauces in Austin.', 'Citrine Soda Co. makes sparkling soda in cans in blood orange, lime and ginger.',
    'Wild Ferment brews raw kombucha in glass bottles in ginger, hibiscus and lemon.', 'Dew Lab is a skincare brand making a vitamin C serum, a gel cleanser and a barrier cream.']);
  const bad = [];
  for (const t of texts) {
    const b = await hero(t);
    for (const r of framingReport(b.heroHtml())) {
      if (PRODUCT_KINDS.has(r.kind) && r.labels && r.details < 0.999) bad.push(`${b.proj.business.name} ${r.slot} ${r.view} ${r.kind} label ${r.details.toFixed(2)}`);
      if (r.role === 'lead' && r.hasSubject && r.core < 0.9) bad.push(`${b.proj.business.name} lead ${r.view} ${r.kind} core ${r.core.toFixed(2)}`);
    }
  }
  assert.deepEqual(bad, []);
});

test('photos: the owner\'s focus is never moved to make room -- only drawn artwork is framed around labels', async () => {
  const b = await buildHeroFixture({ text: fx('ember-salt') }, { savedImages: true });
  b.proj.heroStoryboard.layers[0].focal = '20% 80%';
  const fig = b.heroHtml().match(/<figure class="sb-layer[^>]*data-slot="hero"[^>]*>/)[0];
  assert.ok(/--op:20% 80%;--op-m:20% 80%/.test(fig));
});

// ---- 3. what the business offers chooses the picture ---------------------------------------------------------------
const lead = sb => sb.layers[0].art.kind;
const kinds = sb => sb.layers.map(l => l.art.kind + (l.art.params && l.art.params.variant ? `:${l.art.params.variant}` : ''));
test('three florists with different offerings get different subjects -- each led by what it actually offers', async () => {
  const arch = (await hero('We are Stem Studio, a wedding florist designing bridal bouquets and ceremony arches in Kent.')).proj.heroStoryboard;
  const delivery = (await hero('Petal & Post is a florist delivering bouquets and wedding flowers across Bristol.')).proj.heroStoryboard;
  const workshop = (await hero('The Bloom Room runs flower-arranging workshops and sells dried flower wreaths.')).proj.heroStoryboard;
  assert.equal(lead(arch), 'ceremony-arch');
  assert.equal(lead(delivery), 'bouquet-delivery');
  assert.equal(lead(workshop), 'flower-workshop');
  assert.ok(kinds(workshop).includes('wreath'), 'the wreaths it sells');
  assert.ok(!kinds(delivery).includes('ceremony-arch') && !kinds(workshop).includes('ceremony-arch'), 'no arch unless the owner offers one');
  assert.ok(!kinds(arch).includes('bouquet-delivery'), 'no delivery unless the owner offers it');
  // a florist that names only flowers keeps the bouquet (the broad subject is reused when that is what they offer)
  assert.equal(lead((await hero('Rosehip is a florist in Leeds selling seasonal flowers and bouquets.')).proj.heroStoryboard), 'bouquet');
  // two florists that genuinely offer the same thing share the drawing
  assert.equal(lead((await hero('Blossom Run is a florist offering same-day flower delivery in Cardiff.')).proj.heroStoryboard), 'bouquet-delivery');
});

test('the same reasoning across other trades: close relatives with different offerings get different subjects', async () => {
  const sailing = kinds((await hero('Harbour Knots teaches sailing lessons and runs sunset cruises from the marina.')).proj.heroStoryboard);
  const kayaks = kinds((await hero('Blue Mooring rents kayaks and paddleboards by the hour on Lake Muskoka.')).proj.heroStoryboard);
  const broker = kinds((await hero('Keel & Compass sells used sailboats and handles yacht brokerage in Halifax.')).proj.heroStoryboard);
  assert.equal(sailing[0], 'sailboat'); assert.equal(kayaks[0], 'kayaks'); assert.equal(broker[0], 'sailboat');
  assert.ok(!kayaks.includes('sailboat') && !sailing.includes('kayaks'));
  const repair = kinds((await hero('Gravel & Grind repairs mountain bikes and sells refurbished road bikes in Squamish.')).proj.heroStoryboard);
  assert.ok(repair.includes('bicycle:stand'), 'a bike repair shop shows the workstand');
});

test('offering-led subjects survive save, reopen and export unchanged', async () => {
  const b = await hero('We are Stem Studio, a wedding florist designing bridal bouquets and ceremony arches in Kent.');
  const saved = projectStore.validateDirectionsState({ directions: [plain(b.proj)], activeDirectionIndex: 0 }).normalized.directions[0];
  assert.equal(saved.heroStoryboard.layers[0].art.kind, 'ceremony-arch');
  const norm = h => h.replace(/\s+/g, ' ').trim();
  assert.equal(norm(siteRender.renderHero(saved, siteRender.categoryFor(saved))), norm(b.heroHtml()), 'export renders the same hero as the preview');
});
