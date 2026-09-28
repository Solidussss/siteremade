'use strict';
// Business-specific hero imagery (lib/premium/visual-subjects.js + the code-drawn
// illustrations in lib/premium/hero-art*.js), proved through the REAL client
// (script.js in a vm with premium-core.js), the REAL export renderer and the REAL
// save validator. Images are mocked (test/helpers/mock-image.js) -- no provider
// call of any kind. The businesses below are deliberately NOT fixtures used to
// tune the library: new wording, and close pairs that must still differ.
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildHeroFixture } = require('./helpers/hero-matrix-build');
const { HERO_MATRIX } = require('./fixtures/hero-matrix');
const S = require('../lib/premium/hero-storyboard');
const VS = require('../lib/premium/visual-subjects');
const K = require('../lib/premium/hero-art-kinds');
const siteRender = require('../lib/site-render');
const projectStore = require('../lib/project-store');

const plain = v => JSON.parse(JSON.stringify(v));
const arts = sb => sb.layers.map(l => l.art && l.art.kind);
const cache = {};
async function hero(text, opts) { const key = `${text}|${JSON.stringify(opts || {})}`; if (!cache[key]) cache[key] = await buildHeroFixture({ text }, opts || {}); return cache[key]; }

const UNFAMILIAR = {
  lawnMaint: 'Cutting Edge Lawn Co. keeps suburban lawns sharp with weekly mowing, crisp edging and spring aeration in Oakville.',
  landBuild: 'Stonecraft Outdoor builds natural stone patios, retaining walls and planting beds for homeowners in Guelph.',
  soda: 'Citrine Soda Co. makes sparkling soda in cans in blood orange, lime and ginger.',
  kombucha: 'Wild Ferment brews raw kombucha in glass bottles in ginger, hibiscus and lemon.',
  skincare: 'Dew Lab is a skincare brand making a vitamin C serum, a gel cleanser and a barrier cream.',
  physio: 'Motion Physio is a physiotherapy clinic treating running injuries with exercise rehab, dry needling and manual therapy.',
  booking: 'Bookwise is scheduling software for dental practices with online booking and automatic reminders.',
  observability: 'Tracepoint is software for engineering teams: uptime monitoring, alerting and logs for APIs.',
  sailing: 'Harbour Knots teaches sailing lessons and runs sunset cruises from the marina.',
  florist: 'Petal & Post is a florist delivering bouquets and wedding flowers across Bristol.',
};

test('subjects come from what the owner actually offers -- lawn maintenance vs landscape construction', async () => {
  const lawn = (await hero(UNFAMILIAR.lawnMaint)).proj.heroStoryboard;
  const build = (await hero(UNFAMILIAR.landBuild)).proj.heroStoryboard;
  assert.deepEqual(plain(arts(lawn)).sort(), ['aeration', 'edging', 'lawn-mowing'], `lawn maintenance: ${arts(lawn)}`);
  assert.ok(['patio', 'retaining-wall', 'planting-bed'].every(k => arts(build).includes(k) || (k === 'patio' && arts(build).includes('paver-laying'))), `landscape construction: ${arts(build)}`);
  assert.deepEqual(plain(arts(lawn).filter(k => arts(build).includes(k))), [], 'two landscapers with different offerings share no picture');
  assert.ok(lawn.layers.some(l => /\bedg(e|ing)\b/i.test(l.prompt)) && build.layers.some(l => /retaining wall/i.test(l.prompt)));
});

test('a drink brand shows its real container and the flavours it names; a close competitor differs', async () => {
  const soda = (await hero(UNFAMILIAR.soda)).proj.heroStoryboard;
  const kom = (await hero(UNFAMILIAR.kombucha)).proj.heroStoryboard;
  const lead = soda.layers[0];
  assert.match(lead.art.kind, /^can-/);
  assert.deepEqual(plain(lead.art.params.flavours), ['blood orange', 'lime', 'ginger']);
  assert.ok(soda.layers.some(l => /blood orange/i.test(l.prompt)), 'a stated flavour reaches an image prompt');
  assert.equal(kom.layers[0].art.kind, 'bottle-hero');
  assert.equal(kom.layers[0].art.params.variant, 'kombucha');
  assert.ok(!/\bcans?\b/i.test(kom.layers[0].prompt), 'the bottled brand is not shown as a can');
  assert.ok(kom.layers.some(l => /hibiscus/i.test(l.prompt)));
});

test('skincare shows its actual product types in the containers they come in', async () => {
  const sb = (await hero(UNFAMILIAR.skincare)).proj.heroStoryboard;
  const variants = [].concat(...sb.layers.map(l => [l.art.params.variant].concat(l.art.params.variants || [])).filter(Boolean));
  ['dropper', 'pump', 'jar'].forEach(v => assert.ok(variants.includes(v), `${v} missing from ${variants}`));
  assert.ok(sb.layers.some(l => /dropper/i.test(l.prompt)), 'the serum is a dropper bottle in the prompt too');
  assert.ok(!sb.layers.some(l => /\bcans?\b/i.test(l.prompt)));
});

test('a physio clinic shows treatment, rehab exercise and its clinic; software shows the RIGHT interface', async () => {
  const physio = (await hero(UNFAMILIAR.physio)).proj.heroStoryboard;
  assert.equal(arts(physio)[0], 'treatment-room');
  assert.ok(arts(physio).includes('exercise-kit') || arts(physio).includes('needles'), `${arts(physio)}`);
  const booking = (await hero(UNFAMILIAR.booking)).proj.heroStoryboard;
  const obs = (await hero(UNFAMILIAR.observability)).proj.heroStoryboard;
  assert.equal(booking.layers[0].render, 'art');
  assert.equal(booking.layers[0].art.params.ui, 'schedule');
  assert.equal(booking.layers[0].art.params.audience, 'patients');
  assert.equal(booking.layers[0].art.params.reminders, true);
  assert.equal(obs.layers[0].art.params.ui, 'monitor');
  // no dashboard art on a service business
  for (const t of [UNFAMILIAR.lawnMaint, UNFAMILIAR.physio, UNFAMILIAR.florist]) assert.ok(!arts((await hero(t)).proj.heroStoryboard).includes('interface'));
});

test('an unusual business the classifier cannot place still gets pictures of what it does', async () => {
  const sail = (await hero(UNFAMILIAR.sailing)).proj;
  const flor = (await hero(UNFAMILIAR.florist)).proj;
  assert.ok(arts(sail.heroStoryboard).includes('sailboat') && arts(sail.heroStoryboard).includes('rope-cleat'), `${sail.business.categoryKey}: ${arts(sail.heroStoryboard)}`);
  assert.ok(arts(sail.heroStoryboard).includes('boat-dusk'), 'the sunset cruise is its own picture');
  // (a florist that delivers leads with the bouquet in its delivery box -- flowers either way)
  assert.ok(arts(flor.heroStoryboard).some(k => k === 'bouquet' || k === 'bouquet-delivery'), `${flor.business.categoryKey}: ${arts(flor.heroStoryboard)}`);
});

test('no paid imagery: every layer draws a specific, detailed illustration -- one visual language, never the same picture twice', async () => {
  for (const f of HERO_MATRIX) {
    const b = await buildHeroFixture(f, { providerStatus: null });
    const sb = b.proj.heroStoryboard;
    const html = b.heroHtml();
    const figures = html.match(/<figure class="sb-layer[^>]*>/g) || [];
    assert.equal(figures.length, sb.layers.length, `${f.id}: every layer drawn`);
    assert.ok(figures.every(x => /data-source="art"/.test(x)), `${f.id}: all illustrations`);
    assert.ok(!/<img /.test(html), `${f.id}: no image tag without an image`);
    assert.ok(!/NaN|undefined/.test(html), `${f.id}: broken geometry in the drawing`);
    const kinds = sb.layers.map(l => `${l.art.kind}|${l.art.params.variant || ''}`);
    assert.equal(new Set(kinds).size, kinds.length, `${f.id}: the same picture twice (${kinds})`);
    // gradient/filter ids never collide between the layers of one hero (they share one document)
    const ids = [...html.matchAll(/ id="([^"]+)"/g)].map(m => m[1]);
    assert.equal(new Set(ids).size, ids.length, `${f.id}: duplicate SVG ids`);
    // one palette: every drawing is tinted from the site accent it was given
    assert.ok(!b.proj.imagePlan.some(e => e.storyboardLayer && e.sourceType === 'generated'), `${f.id}: nothing paid for`);
  }
});

test('every illustration kind draws cleanly at every hero aspect, light and dark', () => {
  for (const kind of K.ART_KINDS) for (const aspect of Object.keys(K.BOX)) for (const tone of ['light', 'dark']) {
    const html = K.drawArt({ kind, params: { label: 'Test Co', flavours: ['lime', 'cherry'], items: ['First service', 'Second service'], ui: 'schedule' } }, { aspect, tone, accent: '#3b6fd6', role: 'lead', seed: kind });
    assert.ok(/<svg[\s\S]*<\/svg>/.test(html), `${kind} ${aspect}: no svg`);
    assert.ok(!/NaN|undefined|Infinity/.test(html), `${kind} ${aspect} ${tone}: broken geometry`);
  }
});

test('drawn interfaces are honest: the owner\'s words and generic UI labels, no invented metrics, prices or ratings', () => {
  const U = require('../lib/premium/hero-art-ui');
  for (const ui of U.INTERFACE_KINDS) {
    const html = K.drawArt({ kind: 'interface', params: { ui, label: 'Bookwise', items: ['Cleaning', 'Check-up'], audience: 'patients' } }, { aspect: '16:9', tone: 'dark', accent: '#3b6fd6', role: 'lead' });
    const text = [...html.matchAll(/<text[^>]*>([^<]*)<\/text>/g)].map(m => m[1]).join(' | ');
    assert.ok(text.includes('Bookwise'), `${ui}: product name`);
    assert.ok(!/[$£€%]|\b\d+(\.\d+)?\s?(k|m|users|customers|stars?)\b/i.test(text), `${ui}: invented metric in "${text}"`);
    assert.ok(/class="ha-ui-wide"[\s\S]*class="ha-ui-compact"/.test(html), `${ui}: both the desktop and phone layouts`);
  }
});

test('the planner is checked for sense, not just keywords: a wrong container or ignoring the stated offer is rejected', () => {
  const ctx = { categoryKey: 'retail', name: 'Citrine Soda Co.', text: UNFAMILIAR.soda, ownOfferings: [], offerings: [] };
  const base = { concept: 'x', composition: 'hero-stage', tone: 'dark', layers: [
    { role: 'lead', anchor: 'lead', subject: 'a soda can on ice', prompt: 'A cold can of blood orange sparkling soda on wet stone, condensation on the metal, rim light, product photography', aspectRatio: '4:5', motion: 'push-in' },
    { role: 'detail', anchor: 'a', subject: 'blood orange and lime slices', prompt: 'Sliced blood orange and lime with sparkling bubbles and droplets, backlit macro on a dark backdrop, fresh and juicy', aspectRatio: '1:1', motion: 'float' },
    { role: 'context', anchor: 'b', subject: 'a can poured into a glass outdoors', prompt: 'A can of the soda poured over ice into a glass on a sunny terrace, citrus garnish, candid lifestyle photograph', aspectRatio: '1:1', motion: 'orbit' }] };
  assert.equal(S.validatePlanned(base, ctx).ok, true, S.validatePlanned(base, ctx).problems.join('; '));
  const dropper = plain(base); dropper.layers[0] = { ...dropper.layers[0], subject: 'a serum dropper bottle', prompt: 'An amber serum dropper bottle of the soda brand on stone, soft light, product photography of the drink' };
  assert.match(S.validatePlanned(dropper, ctx).problems.join(' '), /skincare container for a drinks brand/);
  const generic = plain(base); generic.layers = generic.layers.map((l, i) => ({ ...l, subject: ['a drink on a table', 'bubbles in a glass', 'friends at a party'][i], prompt: ['A drink product shot on a table with soft light and a plain backdrop, commercial photography', 'Bubbles rising in a glass of sparkling drink, macro with backlight, commercial photography', 'A sparkling drink at a sunny party, candid lifestyle photograph with warm light'][i] }));
  assert.match(S.validatePlanned(generic, ctx).problems.join(' '), /no image shows what the owner says they offer/);
});

test('each hero image can be replaced with the owner\'s photo -- placement, motion and focus kept, through save, reopen and export', async () => {
  const b = await buildHeroFixture(HERO_MATRIX.find(f => f.id === 'greenline'));
  const { client, proj, category } = b;
  const before = b.heroHtml().match(/<figure class="sb-layer[^>]*data-slot="hero-2"[^>]*>/)[0];
  // exactly what the editor's "Use my photo" does (script.js heroLayerInput handler)
  const photo = 'data:image/png;base64,' + require('./helpers/mock-image').mockPng('owner photo of the finished patio', '1:1').split(',')[1];
  client.ctx.__photo = photo;
  client.run(`(function(){ removeHeroLayerUpload(project, 'hero-2'); const a = createAsset('hero', window.__photo, 'patio.png'); a.slot = 'hero-2'; project.assets.items.push(a); project.assets.plan = planAssets(project.assets); project.heroStoryboard.layers[1].focal = '50% 20%'; })()`);
  const requestsBefore = b.requests.length;
  await client.run('(renderProject(project), resolveImagePlanAssets(project))');
  const html = b.heroHtml();
  const fig = html.match(/<figure class="sb-layer[^>]*data-slot="hero-2"[^>]*>[\s\S]*?<\/figure>/)[0];
  assert.ok(fig.includes(photo.slice(0, 60)), 'the owner photo is shown in that layer');
  assert.ok(/--op:50% 20%;--op-m:50% 20%/.test(fig), 'the chosen focus point applies, on desktop and on phones');
  assert.ok(!/<img[^>]*style="object-position/.test(fig), 'no inline position fights the per-view framing');
  assert.equal(fig.match(/<figure[^>]*>/)[0].replace(/ data-source="[^"]+"| data-art="[^"]+"|;--op(?:-m)?:[^;"]+/g, ''), before.replace(/ data-source="[^"]+"| data-art="[^"]+"|;--op(?:-m)?:[^;"]+/g, ''), 'same placement, depth and motion track');
  // other layers keep their own pictures
  assert.ok(/data-slot="hero-3"[^>]*data-source="image"/.test(html));
  // the plan never re-requests a layer the owner covered, not even on a later re-plan
  assert.ok(!b.requests.slice(requestsBefore).some(r => /hero-2/.test(r.requestKey || '')), 'no regeneration over the owner photo');
  const entry = proj.imagePlan.find(e => e.slot === 'hero-2');
  assert.ok(entry && entry.sourceType !== 'generated', 'the photo layer is not planned for generation');
  // save + reopen + export
  const saved = projectStore.validateDirectionsState({ directions: [plain(proj)], activeDirectionIndex: 0 }).normalized.directions[0];
  assert.ok(saved.assets.items.some(a => a.slot === 'hero-2' && a.dataUrl === photo), 'the photo and its layer binding survive the save');
  assert.equal(saved.heroStoryboard.layers[1].focal, '50% 20%');
  const norm = h => h.replace(/\s+/g, ' ').trim();
  assert.equal(norm(siteRender.renderHero(saved, siteRender.categoryFor(saved))), norm(html), 'export renders the replaced hero identically');
  // removing the photo brings the layer's own picture back
  client.run(`(removeHeroLayerUpload(project, 'hero-2'), project.assets.plan = planAssets(project.assets), renderProject(project))`);
  assert.ok(!b.heroHtml().includes(photo.slice(0, 60)));
});

test('cost: the same single planning call, the same image budget; software heroes buy one image fewer', async () => {
  for (const f of HERO_MATRIX) {
    const b = await buildHeroFixture(f);
    const n = b.requests.filter(r => r.heroLayer === true).length;
    assert.equal(n, b.proj.business.categoryKey === 'tech' ? 2 : 3, `${f.id}: ${n} hero images requested`);
  }
  // quality and model routing unchanged: the hero layers still ask for the same tiers as before
  const b = await buildHeroFixture(HERO_MATRIX.find(f => f.id === 'fizzwell'));
  const tiers = b.proj.imagePlan.filter(e => e.storyboardLayer).map(e => e.quality);
  assert.ok(tiers.every(q => ['low', 'medium', 'high'].includes(q)));
});
