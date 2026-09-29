'use strict';
// Hero polish: the subject stays in view on every screen and through the whole
// motion loop, the drawings say the right thing (a hot-sauce brand's chillies and
// labelled bottles), and the opening words and the name belong to THIS business.
// Proved through the REAL client (script.js in a vm with premium-core.js), the
// REAL save validator and the REAL export renderer. No provider is ever called.
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildHeroFixture } = require('./helpers/hero-matrix-build');
const { HERO_MATRIX } = require('./fixtures/hero-matrix');
const { framingReport, parseHero, effectiveCrop } = require('./helpers/hero-framing-check');
const { loadClient, buildProject } = require('./helpers/load-client');
const FR = require('../lib/premium/hero-framing');
const K = require('../lib/premium/hero-art-kinds');
const VS = require('../lib/premium/visual-subjects');
const HC = require('../lib/premium/hero-copy');
const siteRender = require('../lib/site-render');
const projectStore = require('../lib/project-store');

const plain = v => JSON.parse(JSON.stringify(v));
const cache = {};
async function hero(text) { if (!cache[text]) cache[text] = await buildHeroFixture({ text }, { providerStatus: null }); return cache[text]; }
const fx = id => HERO_MATRIX.find(f => f.id === id).text;
// descriptions the drawing and copy libraries were not tuned on, including close relatives with different offerings
const NEW = {
  sailing: 'Harbour Knots teaches sailing lessons and runs sunset cruises from the marina.',
  brokerage: 'Keel & Compass sells used sailboats and handles yacht brokerage in Halifax.',
  kayaks: 'Blue Mooring rents kayaks and paddleboards by the hour on Lake Muskoka.',
  florist: 'Petal & Post is a florist delivering bouquets and wedding flowers across Bristol.',
  workshops: 'The Bloom Room runs flower-arranging workshops and sells dried flower wreaths.',
  bridal: 'We are Stem Studio, a wedding florist designing bridal bouquets and ceremony arches in Kent.',
  stone: 'Stonecraft Outdoor builds natural stone patios, retaining walls and planting beds for homeowners in Guelph.',
  soda: 'Citrine Soda Co. makes sparkling soda in cans in blood orange, lime and ginger.',
  printer: 'Ink & Quill prints custom business cards, letterhead and rubber stamps in Leeds.',
  bikes: 'Gravel & Grind repairs mountain bikes and sells refurbished road bikes in Squamish.',
  tailor: 'Mend Well Tailoring does alterations, hemming and suit repairs in Toronto.',
  sauces: 'Red Door Hot Sauce makes habanero mango and garlic jalapeno hot sauces in Austin.',
  honey: 'Sweet Heat Honey makes hot honey infused with habanero, sold at farmers markets.',
  unnamed: 'I walk dogs and do pet sitting around Hamilton.',
};

// ---- 1. the subject stays in view ----------------------------------------------------------------------------
test('the roofing hero keeps its house in view on a phone, through the whole pan and zoom, clear of the inset frames', async () => {
  const b = await hero(fx('summit-roofing'));
  const html = b.heroHtml();
  const lead = framingReport(html).filter(r => r.slot === 'hero');
  assert.equal(lead.length, 2, 'the drawn lead is framed for desktop and for phones');
  for (const r of lead) {
    assert.equal(r.kind, 'roof-house');
    assert.ok(r.hasSubject, 'the house is marked as the subject of the drawing');
    assert.ok(r.core >= 0.95, `${r.view}: the middle of the house is visible at every moment (${r.core})`);
    assert.ok(r.share >= 0.75, `${r.view}: most of the house is visible (${r.share})`);
  }
  // the phone gets its own composition, not a slice of the wide one
  const { layers } = parseHero(html); const l = layers.find(x => x.slot === 'hero');
  assert.notDeepEqual(l.art.phone.viewBox, l.art.desktop.viewBox);
});

test('the framing check is meaningful: the old roofing crop (the left third of a wide drawing) is caught', async () => {
  const b = await hero(fx('summit-roofing'));
  const html = b.heroHtml();
  const { layers } = parseHero(html); const l = layers.find(x => x.slot === 'hero');
  // what da63534 shipped: the lead drawn 1.25x wider than the desktop frame and pinned left (xMinYMid), so a
  // phone frame showed only the canvas's left edge -- grass and a tree
  const house = K.framingOf({ kind: 'roof-house', params: {} }, { aspect: '16:9', role: 'lead' }, { ratio: 2.15, pan: 'none', shape: 'full', avoid: [] });
  const [W, H] = house.canvas; const phoneRatio = FR.frameRatioOf(l, 'phone', 'bottom-left');
  const leftSlice = [0, 0, H * phoneRatio, H];
  const win = FR.stableWindowFor(l.motion);
  const old = FR.visibleShare(FR.core(house.box), leftSlice, win, [], 'full');
  assert.ok(old < 0.4, `the old phone crop hides the house (core visible: ${old})`);
  // and the same check on the shipped markup passes
  const now = framingReport(html).find(r => r.slot === 'hero' && r.view === 'phone');
  assert.ok(now.core > 0.95);
  // a crop moved off the subject in the markup itself is reported too
  const moved = html.replace(/(<div class="ha-art ha-phone"[^>]*><svg viewBox=")([^"]+)"/, (m, a, vb) => { const v = vb.split(' ').map(Number); return `${a}${v[0] - v[2] * 0.9} ${v[1]} ${v[2]} ${v[3]}"`; });
  assert.ok(framingReport(moved).find(r => r.slot === 'hero' && r.view === 'phone').core < 0.3, 'a subject slid out of frame fails the check');
  assert.ok(effectiveCrop([0, 0, 200, 100], 1)[2] === 100);
});

test('every drawn subject in every fixture hero stays recognisable on desktop and on phones, clear of overlapping frames and the headline', async () => {
  const texts = HERO_MATRIX.filter(f => !f.plan).map(f => f.text).concat(Object.values(NEW));
  const worst = [];
  for (const t of texts) {
    const b = await hero(t);
    for (const r of framingReport(b.heroHtml())) {
      if (!r.hasSubject) continue;
      const min = r.role === 'lead' ? 0.88 : 0.75;
      if (r.core < min || r.share < 0.45) worst.push(`${b.proj.business.name} ${r.slot} ${r.view} ${r.kind} core ${r.core.toFixed(2)} whole ${r.share.toFixed(2)}`);
    }
  }
  assert.deepEqual(worst, [], 'subjects lost to a crop, the motion, another frame or the copy');
});

test('vulnerable subjects -- boats, vehicles, buildings, product ranges, treatment equipment -- are marked and framed in every frame shape', () => {
  const vulnerable = ['roof-house', 'house-dusk', 'house-paint', 'street', 'boat', 'sailboat', 'boat-dusk', 'bicycle', 'car-shine', 'ev-charger', 'can-range', 'skincare-range', 'pantry-hero', 'bottle-hero', 'treatment-room', 'reformer', 'salon', 'dental', 'kitchen', 'bathroom'];
  const params = { label: 'Test Co', flavours: ['lime', 'cherry', 'peach'], variants: ['Mild', 'Hot'], variant: 'woozy', range: true };
  for (const kind of vulnerable) {
    for (const ratio of [0.62, 0.83, 1, 1.4, 1.72, 2.2]) for (const pan of ['pan-left', 'zoom-in', 'pan-up']) {
      const f = K.framingOf({ kind, params }, { aspect: '16:9', role: 'lead' }, { ratio, pan, shape: 'rounded', avoid: [] });
      assert.ok(f.box, `${kind}: a subject is marked`);
      assert.ok(f.coreShare >= 0.95, `${kind} @ ${ratio} ${pan}: the subject's middle is in view (${f.coreShare})`);
      assert.ok(f.share >= 0.6, `${kind} @ ${ratio} ${pan}: most of the subject is in view (${f.share})`);
    }
  }
  // a frame covered on one side: the subject moves to the open side instead of hiding under it
  const covered = K.framingOf({ kind: 'sailboat', params: {} }, { aspect: '4:5', role: 'lead' }, { ratio: 0.8, pan: 'none', shape: 'rounded', avoid: [[0.5, -0.1, 1.2, 1.1]] });
  assert.ok(covered.coreShare >= 0.9, `sailboat beside an overlapping frame (${covered.coreShare})`);
});

test('every drawing either marks its subject or is a whole-frame scene (a texture or a room), and the list of scenes is deliberate', () => {
  const SCENES = new Set(['texture-swatch', 'botanicals', 'rail', 'fabric', 'taps', 'moodboard', 'server-rack', 'sticky-wall', 'library', 'ring', 'hedge', 'paver-laying', 'planting-bed', 'garden-path', 'shingles', 'roof-ladder', 'rope-cleat', 'seedling', 'tile-detail', 'cutting-in', 'faucet', 'pipes', 'water-heater', 'panel', 'pendants', 'car-lift', 'flower-buckets', 'offer-cards', 'interface']);
  const unmarked = K.ART_KINDS.filter(kind => !SCENES.has(kind) && !K.framingOf({ kind, params: { label: 'Test Co', flavours: ['lime'], items: ['One', 'Two'] } }, { aspect: '4:3', role: 'lead' }, { ratio: 1.3, pan: 'none', shape: 'rounded', avoid: [] }).box);
  assert.deepEqual(unmarked, [], 'kinds with no marked subject');
});

test('photos are framed per view too: the owner\'s focus wins everywhere, otherwise the middle is kept clear of what covers it', async () => {
  const b = await buildHeroFixture({ text: fx('summit-roofing') }, { savedImages: true });
  const fig = b.heroHtml().match(/<figure class="sb-layer[^>]*data-slot="hero"[^>]*>/)[0];
  assert.ok(/--op:\d+% \d+%;--op-m:\d+% \d+%/.test(fig), 'a photo lead (saved before the starter-visual rule) carries a desktop and a phone position');
  b.proj.heroStoryboard.layers[0].focal = '30% 70%';
  const fig2 = b.heroHtml().match(/<figure class="sb-layer[^>]*data-slot="hero"[^>]*>/)[0];
  assert.ok(/--op:30% 70%;--op-m:30% 70%/.test(fig2), 'the owner\'s focus applies on both');
  // a photo behind an inset frame on one side is positioned toward the open side
  assert.equal(FR.photoPosition(16 / 9, { ratio: 0.8, pan: 'none', shape: 'rounded', avoid: [[0.55, 0, 1.2, 1]] }).split(' ')[0] !== '50%', true);
});

// ---- 2. drawings that say the right thing ---------------------------------------------------------------------
test('a hot-sauce brand: heat levels, ingredients and flavours are three different things', () => {
  const f = VS.factsFor({ text: fx('ember-salt'), categoryKey: 'retail', ownOfferings: ['Mild', 'Smoky', 'Ghost Pepper'] });
  assert.deepEqual(f.heat.levels, ['Mild', 'Smoky', 'Ghost Pepper'], 'the heat levels, as the owner named them');
  assert.deepEqual(f.ingredients, ['chili'], '"fermented chilies" is the ingredient (and nothing else is invented)');
  assert.deepEqual(f.flavours, [], '"smoky" is a heat level, not a flavour to colour the sauce or draw');
  // two-word flavour names stay one flavour
  assert.deepEqual(VS.factsFor({ text: NEW.sauces, categoryKey: 'retail' }).flavours, ['habanero mango', 'garlic jalapeno']);
  // a jam is not given chillies
  const jam = VS.factsFor({ text: 'Bramble & Co makes small-batch strawberry jam and marmalade.', categoryKey: 'retail' });
  assert.ok(!jam.ingredients.includes('chili') && !jam.flavours.includes('chili'));
});

test('the hot-sauce hero draws labelled sauce bottles and recognisable chillies -- not brown balls', async () => {
  const b = await hero(fx('ember-salt'));
  const sb = b.proj.heroStoryboard;
  const lead = sb.layers.find(l => l.role === 'lead');
  assert.equal(lead.art.kind, 'pantry-hero');
  assert.deepEqual(plain(lead.art.params.variants), ['Mild', 'Smoky', 'Ghost Pepper'], 'one bottle per heat level');
  const html = b.heroHtml();
  const leadSvg = html.match(/data-slot="hero"[\s\S]*?<\/figure>/)[0];
  for (const label of ['MILD', 'SMOKY', 'GHOST PEPPER']) assert.ok(leadSvg.includes(`>${label}</text>`), `a bottle labelled ${label}`);
  assert.ok((leadSvg.match(/>EMBER &amp; SALT<\/text>/g) || []).length >= 3, 'the brand on every label');
  assert.ok(!/#7a4a2a/i.test(leadSvg), 'no brown "smoky" sauce');
  // sauce colours are sauce colours: reds and oranges
  const detail = sb.layers.find(l => l.art && l.art.kind === 'ingredients');
  assert.ok(detail, 'an ingredients layer');
  assert.deepEqual(plain(detail.art.params.flavours), ['chili']);
  const ing = K.drawArt(detail.art, { aspect: '1:1', ratio: 1, role: 'detail' });
  assert.ok((ing.match(/fill="#4d7a2a"/g) || []).length >= 6, 'at least six chilli pods, each with its green calyx');
  assert.ok(!/garlic|lime/.test(JSON.stringify(detail.art)), 'no invented garlic or lime');
  // the dish is dressed with the sauce
  const dish = sb.layers.find(l => l.art && l.art.kind === 'plated');
  if (dish) assert.equal(dish.art.params.drizzle, true);
});

test('bottle proportions and labels: a single sauce is a woozy bottle full of red sauce, labelled with the brand and what it is', () => {
  const svg = K.drawArt({ kind: 'pantry-hero', params: { label: 'Ember & Salt', variant: 'woozy', sub: 'hot sauce' } }, { aspect: '4:5', ratio: 0.8, role: 'lead', seed: 'x' });
  assert.ok(svg.includes('>EMBER &amp; SALT</text>') && svg.includes('>HOT SAUCE</text>'));
  assert.ok(/stop-color="#c0241a"/.test(svg) || /#c0241a/.test(svg), 'hot-sauce red');
  const range = K.drawArt({ kind: 'pantry-hero', params: { label: 'Red Door', variant: 'woozy', variants: ['Habanero Mango', 'Garlic Jalapeno'] } }, { aspect: '4:5', ratio: 0.8, role: 'lead', seed: 'y' });
  assert.ok(range.includes('>HABANERO MANGO</text>') && range.includes('>GARLIC JALAPENO</text>'), 'each bottle carries the owner\'s flavour name');
});

// ---- 3. names and opening words ----------------------------------------------------------------------------------
test('business names: natural descriptions keep their name; a service, a place or a fragment is never taken for one', () => {
  const expect = {
    [NEW.sailing]: 'Harbour Knots', [NEW.stone]: 'Stonecraft Outdoor', [NEW.soda]: 'Citrine Soda Co.', [NEW.bridal]: 'Stem Studio', [NEW.kayaks]: 'Blue Mooring',
    [NEW.printer]: 'Ink & Quill', [NEW.tailor]: 'Mend Well Tailoring', [fx('summit-roofing')]: 'Summit Roofing', [fx('cutline-lawn')]: 'Cutline Lawn Co',
    [fx('brightline-paint')]: 'Brightline Painting', [fx('flowright')]: 'FlowRight Plumbing', 'At Kiln & Crate, we throw stoneware mugs by hand.': 'Kiln & Crate',
    'Maria\'s Kitchen caters weddings in Porto.': 'Maria\'s Kitchen', 'My business is called Northfield Tutors and we help kids with homework.': 'Northfield Tutors',
    [NEW.unnamed]: '', 'Residential Cleaning offers weekly cleans in Surrey.': '', 'Toronto is where we run our dog walking service.': '',
    'We are a roofing company in Calgary': '', 'Dog walking and pet sitting in Hamilton.': '', 'Wedding and portrait photographer based in Toronto.': '',
  };
  for (const [t, name] of Object.entries(expect)) assert.equal(HC.extractName(t), name, t);
});

test('a business the description does not name gets a clear placeholder -- never an invented "<Category> Studio" brand', async () => {
  const b = await hero(NEW.unnamed);
  assert.equal(b.proj.business.name, 'Your Business');
  assert.equal(b.proj.meta.previewBrandName, true);
  assert.ok(!/Studio/.test(b.proj.business.name));
  assert.ok(!b.heroHtml().includes('YOUR BUSINESS</text>'), 'a placeholder is never printed on packaging or screens');
  // named ones are never replaced by a template
  for (const t of [NEW.sailing, NEW.soda, NEW.bridal]) assert.ok(!/Studio$|Business/.test((await hero(t)).proj.business.name) || /Stem Studio/.test((await hero(t)).proj.business.name));
});

test('the owner\'s own name survives regenerating, saving, reopening and export -- and the drawings carry it', async () => {
  const client = loadClient();
  const { proj } = buildProject(client, fx('ember-salt'));
  client.ctx.__proj = proj;
  // what the editor's name field does, then Generate again on the same description
  const regen = client.run(`(() => {
    const p = window.__proj; p.business.name = 'Ember and Salt Hot Sauce Co'; p.business.nameSource = 'owner'; p.meta.previewBrandName = false;
    const src = createGenerationSource(p.source.text); const { proj, steps } = buildGenerationPlan(src.text, p, null, 1, src); steps.forEach(s => s.run()); return proj;
  })()`);
  assert.equal(regen.business.name, 'Ember and Salt Hot Sauce Co', 'the typed name is kept');
  assert.equal(regen.business.nameSource, 'owner');
  const saved = projectStore.validateDirectionsState({ directions: [plain(regen)], activeDirectionIndex: 0 }).normalized.directions[0];
  assert.equal(saved.business.name, 'Ember and Salt Hot Sauce Co');
  assert.equal(saved.business.nameSource, 'owner');
  assert.equal(saved.meta.previewBrandName, false);
  const exported = siteRender.renderHero(saved, siteRender.categoryFor(saved));
  assert.ok(exported.includes('>EMBER AND SALT HOT</text>'), 'the bottles carry the owner\'s name (clipped to fit the label) in the export');
  assert.ok(!exported.includes('>EMBER &amp; SALT</text>'), 'not the name the drawing was generated with');
  // a placeholder flag survives the save too (so a reopened unnamed project never prints "Your Business" on a label)
  const unnamed = buildProject(loadClient(), NEW.unnamed).proj;
  const savedUnnamed = projectStore.validateDirectionsState({ directions: [plain(unnamed)], activeDirectionIndex: 0 }).normalized.directions[0];
  assert.equal(savedUnnamed.meta.previewBrandName, true);
});

test('headlines say what the business offers: the previously generic ones, and unfamiliar close relatives, each in their own words', async () => {
  const expectWords = {
    [NEW.florist]: /bouquet|flower/i, [NEW.sailing]: /sail/i, [fx('paperbark')]: /invitation|stationery/i, [fx('ember-salt')]: /hot sauce|chil/i,
    [fx('tidewater-charters')]: /fishing|boat|charter/i, [NEW.stone]: /patio|stone|wall/i, [NEW.soda]: /soda/i, [NEW.kayaks]: /kayak|paddleboard/i,
    [NEW.brokerage]: /sailboat|yacht/i, [NEW.workshops]: /workshop|wreath|flower/i, [NEW.bridal]: /bridal|bouquet|arch|wedding flowers/i, [NEW.printer]: /card|letterhead|stamp/i,
    [NEW.bikes]: /bike/i, [NEW.tailor]: /alteration|hemming|suit/i, [NEW.honey]: /honey/i, [NEW.unnamed]: /dog|pet/i,
  };
  const heads = [];
  for (const [t, re] of Object.entries(expectWords)) {
    const b = await hero(t); const h = b.proj.copy.headline;
    heads.push(h);
    assert.match(h, re, `${t} -> "${h}"`);
    assert.ok(!/done properly|made to be noticed|built the right way|worth stopping for/i.test(h), `stock phrase: ${h}`);
    assert.equal(HC.headlineProblem(h, { text: t, name: b.proj.business.name, offerings: b.proj.business.offerings }), null, `the fallback passes its own check: ${h}`);
    assert.ok(!/\b(best|award|guarantee|#1|leading|trusted|certified)\b/i.test(h), `no invented claim: ${h}`);
  }
  // not one new sentence pattern everywhere
  const shapes = new Set(Object.keys(expectWords).map(t => HC.heroCopyFor({ text: t, name: HC.extractName(t) }).shape));
  assert.ok(shapes.size >= 3, `several sentence shapes (${[...shapes].join(', ')})`);
  assert.equal(new Set(heads).size, heads.length, 'no two businesses share a headline');
  // close relatives with different offerings read differently
  const h = async t => (await hero(t)).proj.copy.headline;
  assert.notEqual(await h(NEW.sailing), await h(NEW.brokerage));
  assert.notEqual(await h(NEW.florist), await h(NEW.workshops));
});

test('planner copy: a specific planner headline ships as written; a generic one or one with an invented claim is replaced', () => {
  const { FIZZWELL_PLAN, FIZZWELL_TEXT } = require('./fixtures/businesses');
  const build = headline => { const plan = plain(FIZZWELL_PLAN); plan.heroCopy.headline = headline; return buildProject(loadClient(), FIZZWELL_TEXT, { claudePlanRaw: plan }).proj; };
  assert.equal(build('Sparkling energy. Zero sugar.').copy.headline, 'Sparkling energy. Zero sugar.', 'specific planner copy is kept');
  assert.equal(build('Yards worth coming home to.').copy.headline, 'Yards worth coming home to.', 'concrete wording not in the description is still kept');
  for (const bad of ['Business, done properly.', 'Online, made to be noticed.', 'Built to make a strong first impression.', 'The award-winning energy drink.', 'Trusted by 10,000 customers.']) {
    const p = build(bad);
    assert.notEqual(p.copy.headline, bad, `replaced: ${bad}`);
    assert.ok(p.meta.plannerHeadlineReplaced, 'the replacement is recorded');
    assert.match(p.copy.headline, /energy|drink|sparkling|peach|cherry|citrus/i, `grounded fallback: ${p.copy.headline}`);
  }
});
