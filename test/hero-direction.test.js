'use strict';
// The art-directed moving hero (lib/premium/hero-direction.js) and the section
// copy that carries its direction through the page (lib/premium/offering-copy.js),
// exercised through the REAL client (script.js in a vm, with premium-core.js
// loaded exactly as index.html loads it) and the REAL export renderer.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { loadClient, fundedProviderStatus, buildProject } = require('./helpers/load-client');
const F = require('./fixtures/businesses');
const H = require('../lib/premium/hero-direction');
const siteRender = require('../lib/site-render');
const projectStore = require('../lib/project-store');
const { mockPng } = require('./helpers/mock-image');

const text = id => F.BUSINESSES.find(b => b.id === id).text;
const plain = v => JSON.parse(JSON.stringify(v));
const CSS = fs.readFileSync(path.join(__dirname, '..', 'styles.css'), 'utf8');

// A generated project with every funded image resolved (mock images), as saved.
async function generated(t, opts = {}) {
  const c = loadClient({ fetchHandler: (url, o) => url === '/api/generate-image'
    ? { ok: true, dataUrl: mockPng(JSON.parse(o.body).prompt, JSON.parse(o.body).aspectRatio), creditsCharged: 1 }
    : new Promise(() => {}) });
  const { proj } = buildProject(c, t, { providerStatus: opts.noImages ? null : fundedProviderStatus(), claudePlanRaw: opts.plan || null });
  c.ctx.__p = proj;
  if (!opts.noImages) await c.run('(project = window.__p, resolveImagePlanAssets(project))');
  else c.run('project = window.__p');
  const cat = c.run(`categories[${JSON.stringify(proj.business.categoryKey)}]`);
  return { c, proj, cat };
}

test('the hero treatment follows what the business is and what the visitor came to do', () => {
  const pick = (categoryKey, t) => H.chooseTreatment({ categoryKey, text: t || '' });
  assert.equal(pick('retail', F.FIZZWELL_TEXT), 'PRODUCT_CLOSEUP', 'a drink brand leads with the product');
  assert.equal(pick('landscaping'), 'FINISHED_WORK', 'a landscaper opens on a finished yard');
  assert.equal(pick('roofing'), 'FINISHED_WORK');
  assert.equal(pick('hospitality'), 'ATMOSPHERE', 'a cafe is about the room');
  assert.equal(pick('wellness'), 'CARE', 'a clinic is calm and human');
  assert.equal(pick('tech'), 'INTERFACE', 'software shows the product');
  assert.equal(pick('other', 'We install and repair garage doors'), 'FINISHED_WORK');
  assert.equal(pick('other', 'Small-batch hot sauce, three heat levels'), 'PRODUCT_CLOSEUP');
});

test('different businesses get meaningfully different heroes (not one composition recoloured)', async () => {
  const cases = [
    ['fizzwell', F.FIZZWELL_TEXT, 'cinema-product', 'push'],
    ['greenline', F.GREENLINE_TEXT, 'cinema-panorama', 'pan'],
    ['fern-flint', text('fern-flint'), 'cinema-layered', 'parallax'],
    ['harbour-physio', F.HARBOUR_TEXT, 'cinema-portrait', 'breathe'],
    ['ledgerly', text('ledgerly'), 'cinema-interface', 'float'],
  ];
  const seen = new Set();
  for (const [id, t, layout, camera] of cases) {
    const { c, proj, cat } = await generated(t);
    assert.equal(proj.design.heroDirection.layout, layout, `${id}: treatment`);
    const html = c.ctx.renderHero(proj, cat);
    assert.ok(html.includes(`hero-${layout}`) && html.includes(`data-camera="${camera}"`), `${id}: renders the ${layout} composition with a ${camera} camera`);
    assert.ok(/<img class="site-visual-img site-visual-generated-img"/.test(html), `${id}: the hero shows its generated image`);
    seen.add(layout);
  }
  assert.equal(seen.size, cases.length);
});

test('the hero carries the business itself: its real offerings, name and place', async () => {
  const product = await generated(F.FIZZWELL_TEXT, { plan: F.FIZZWELL_PLAN });
  const productHtml = product.c.ctx.renderHero(product.proj, product.cat);
  ['Peach Energy', 'Cherry Energy', 'Citrus Energy'].forEach(f => assert.ok(productHtml.includes(f), `flavour chip ${f}`));
  const yard = await generated(F.GREENLINE_TEXT, { plan: F.GREENLINE_PLAN });
  const yardHtml = yard.c.ctx.renderHero(yard.proj, yard.cat);
  assert.ok(yardHtml.includes('cinema-strip') && yardHtml.includes('Calgary') && yardHtml.includes('Natural Stone Patios'), 'services strip with the place');
  assert.ok(yardHtml.includes('Yards worth coming home to.'), "the planner's headline is kept");
});

test('the hero image is shot for its camera move; a planned hero prompt keeps its subject', async () => {
  const { proj } = await generated(F.GREENLINE_TEXT);
  const hero = proj.imagePlan.find(e => e.slot === 'hero');
  assert.match(hero.prompt, /Greenline Landscapes' work: a finished backyard/);
  assert.match(hero.prompt, /slow sideways camera pan/);
  assert.ok(hero.prompt.length <= 600);
  const planned = await generated(F.FIZZWELL_TEXT, { plan: F.FIZZWELL_PLAN });
  const plannedHero = planned.proj.imagePlan.find(e => e.slot === 'hero').prompt;
  assert.ok(plannedHero.startsWith(F.FIZZWELL_PLAN.imagePlan[0].prompt) && /push-in/.test(plannedHero));
});

test('a directed hero never costs more images: exactly one hero slot, even over a collage base layout', async () => {
  const { proj } = await generated(text('fern-flint'));
  assert.equal(proj.imagePlan.filter(e => e.section === 'hero').length, 1);
  assert.ok(!proj.imagePlan.some(e => e.slot === 'collage-2'), 'the layered treatment reuses the hero still as its detail crop');
});

test('no hero image available -> a moving typographic statement, never an empty photo frame', async () => {
  const { c, proj, cat } = await generated(F.GREENLINE_TEXT, { noImages: true });
  const html = c.ctx.renderHero(proj, cat);
  assert.ok(html.includes('hero-cinema-statement') && html.includes('cinema-ticker'), html.slice(0, 200));
  assert.ok(!/<img|visual-generated/.test(html));
  assert.ok(!proj.imagePlan.some(e => e.slot === 'hero'), 'no hero image is planned or paid for');
});

test('preview and export render the identical hero, and the direction survives a save', async () => {
  for (const t of [F.FIZZWELL_TEXT, F.GREENLINE_TEXT, F.HARBOUR_TEXT]) {
    const { c, proj, cat } = await generated(t);
    const saved = projectStore.validateDirectionsState({ directions: [plain(proj)], activeDirectionIndex: 0 }).normalized.directions[0];
    assert.deepEqual(saved.design.heroDirection, plain(proj.design.heroDirection));
    const norm = h => h.replace(/\s+/g, ' ').trim();
    assert.equal(norm(siteRender.renderHero(saved, siteRender.categoryFor(saved))), norm(c.ctx.renderHero(proj, cat)));
  }
});

test('the owner choosing another hero layout wins over the direction', async () => {
  const { c, proj, cat } = await generated(F.GREENLINE_TEXT);
  proj.design.dimensions.hero = 'split';
  const html = c.ctx.renderHero(proj, cat);
  assert.ok(!html.includes('hero-cinema') && html.includes('hero-split'));
});

test('motion is seamless, stays off the headline, and stops for prefers-reduced-motion', () => {
  const loops = CSS.match(/\.hero-cinema\[data-camera="[a-z]+"\][^{]*\{animation:[^}]*\}/g) || [];
  assert.ok(loops.length >= 6, 'every camera has a loop');
  loops.forEach(rule => assert.match(rule, /infinite alternate/, `loop reverses instead of jumping: ${rule}`));
  const reduced = CSS.slice(CSS.indexOf('@media (prefers-reduced-motion:reduce){\r\n  .hero-cinema *') > -1 ? CSS.indexOf('@media (prefers-reduced-motion:reduce){\r\n  .hero-cinema *') : CSS.indexOf('@media (prefers-reduced-motion:reduce){\n  .hero-cinema *'));
  assert.match(reduced, /\.hero-cinema \*,\.hero-cinema \*::before,\.hero-cinema \*::after\{animation:none!important/);
  assert.ok(!/\.cinema-copy h3\{[^}]*animation/.test(CSS), 'the headline never animates on its own loop');
  const keyframes = CSS.match(/@keyframes sr-(cam|drift|device|sweep|glow|light|halo|orb|ticker)[^{]*\{[^@]*?\}\}/g) || [];
  keyframes.forEach(k => assert.ok(!/(^|[{;])\s*(top|left|width|height|margin)\s*:/.test(k), `animates only transform/opacity: ${k}`));
});

test('section copy describes each offering instead of category filler (both renderers)', async () => {
  const filler = /presented clearly|without the busywork|Everything .* needs, in one place|feel effortless/;
  for (const t of [F.GREENLINE_TEXT, F.HARBOUR_TEXT, text('fern-flint')]) {
    const { c, proj, cat } = await generated(t);
    const preview = proj.sections.map(s => c.ctx.renderSectionHTML(proj, s, cat)).join('');
    const saved = projectStore.validateDirectionsState({ directions: [plain(proj)], activeDirectionIndex: 0 }).normalized.directions[0];
    const exported = saved.pages[0].sections.map(s => siteRender.renderSectionHTML(saved, s, siteRender.categoryFor(saved))).join('');
    assert.ok(!filler.test(preview), `preview filler: ${(preview.match(filler) || [])[0]}`);
    assert.ok(!filler.test(exported), `export filler: ${(exported.match(filler) || [])[0]}`);
  }
  const cafe = await generated(text('fern-flint'));
  const menu = cafe.proj.sections.find(s => s.type === 'menu');
  const saved = projectStore.validateDirectionsState({ directions: [plain(cafe.proj)], activeDirectionIndex: 0 }).normalized.directions[0];
  const exportedMenu = siteRender.renderSectionHTML(saved, saved.pages[0].sections.find(s => s.type === 'menu'), siteRender.categoryFor(saved));
  for (const html of [cafe.c.ctx.renderSectionHTML(cafe.proj, menu, cafe.cat), exportedMenu]) {
    assert.ok(html.includes('Pour-over Bar') && html.includes('made to order'), 'the menu is the real offerings, described');
    assert.ok(!/Starters|Mains|Desserts|menu-line/.test(html), 'no placeholder menu groups or skeleton lines');
  }
});

test('a photo-less gallery does not repeat the offerings already listed on the page', async () => {
  const { c, proj, cat } = await generated(F.GREENLINE_TEXT, { plan: F.GREENLINE_PLAN });
  const gallery = proj.sections.find(s => s.type === 'gallery');
  assert.equal(gallery.zeroSupplyTreatment, 'icon-composition', 'precondition: the gallery funds no image');
  assert.ok(c.ctx.renderSectionHTML(proj, gallery, cat).includes('data-variant="omitted"'));
  const saved = projectStore.validateDirectionsState({ directions: [plain(proj)], activeDirectionIndex: 0 }).normalized.directions[0];
  assert.ok(siteRender.renderSectionHTML(saved, saved.pages[0].sections.find(s => s.type === 'gallery'), siteRender.categoryFor(saved)).includes('data-variant="omitted"'));
});

test('classification: a physio clinic is a care business; physio SOFTWARE is still software', () => {
  const c = loadClient();
  assert.equal(c.ctx.analyzeDescription(F.HARBOUR_TEXT).categoryKey, 'wellness');
  assert.equal(c.ctx.analyzeDescription(text('ledgerly')).categoryKey, 'tech');
});

test('testimonial wording follows the business in the export too, and is never labelled as verified', async () => {
  const cafe = await generated(text('fern-flint'));
  const grid = cafe.proj.sections.find(s => s.type === 'testimonialsGrid');
  const saved = projectStore.validateDirectionsState({ directions: [plain(cafe.proj)], activeDirectionIndex: 0 }).normalized.directions[0];
  const exported = siteRender.renderSectionHTML(saved, saved.pages[0].sections.find(s => s.type === 'testimonialsGrid'), siteRender.categoryFor(saved));
  const preview = cafe.c.ctx.renderSectionHTML(cafe.proj, grid, cafe.cat);
  for (const html of [preview, exported]) assert.ok(html.includes('A room worth returning to.') && html.includes('Regular guest'), 'hospitality voice');
  assert.ok(!exported.includes('Clear communication from start to finish.'), 'no generic quote in the export');
  const shop = await generated(F.FIZZWELL_TEXT, { plan: F.FIZZWELL_PLAN });
  assert.ok(!/Verified/.test(JSON.stringify(require('../lib/premium/section-voice').TESTIMONIAL_VOICE)));
  assert.ok(!/Verified/.test(shop.c.run('JSON.stringify(sectionVocab(project))')));
});

test('a gallery never pads a real image with an empty placeholder tile (both renderers)', async () => {
  const { c, proj, cat } = await generated(F.FIZZWELL_TEXT, { plan: F.FIZZWELL_PLAN });
  const gallery = proj.sections.find(s => s.type === 'gallery');
  const funded = proj.imagePlan.filter(e => e.section === gallery.id && e.sourceType === 'generated').length;
  assert.ok(funded >= 1 && funded < proj.imagePlan.filter(e => e.section === gallery.id).length, 'precondition: some but not all tiles are funded');
  const saved = projectStore.validateDirectionsState({ directions: [plain(proj)], activeDirectionIndex: 0 }).normalized.directions[0];
  for (const html of [c.ctx.renderSectionHTML(proj, gallery, cat), siteRender.renderSectionHTML(saved, saved.pages[0].sections.find(s => s.type === 'gallery'), siteRender.categoryFor(saved))]) {
    assert.ok(!html.includes('visual-generated-unfunded'), 'no dotted placeholder tile');
    assert.equal((html.match(/class="gallery-tile/g) || []).length, funded);
  }
});

test('archetype keywords match whole words: a landscaper is not planned as SaaS because "landscaping" contains "api"', () => {
  const c = loadClient();
  const arch = t => { c.ctx.__t = t; return c.run('(() => { const s = createGenerationSource(window.__t); return inferArchetype(s.analysis.categoryKey, s.text); })()'); };
  assert.equal(arch(F.GREENLINE_TEXT), 'local-conversion');
  assert.notEqual(arch('Clear Path is a therapist practice in Leeds'), 'product-led-saas', '"therapist" is not an API');
  assert.equal(arch('A SaaS API for developers'), 'product-led-saas', 'the real keyword still matches');
  assert.notEqual(arch('Sharp Cuts is a barber in Leeds'), 'hospitality', '"barber" is not a bar');
  assert.equal(arch('Our cafe and wine bar in Montreal'), 'hospitality');
});

test('FAQ and testimonials speak for THIS kind of business, identically in preview and export', async () => {
  const clinic = await generated(F.HARBOUR_TEXT);
  const saved = projectStore.validateDirectionsState({ directions: [plain(clinic.proj)], activeDirectionIndex: 0 }).normalized.directions[0];
  const both = type => {
    const s = clinic.proj.sections.find(x => x.type === type);
    return s ? [clinic.c.ctx.renderSectionHTML(clinic.proj, s, clinic.cat), siteRender.renderSectionHTML(saved, saved.pages[0].sections.find(x => x.type === type), siteRender.categoryFor(saved))] : [];
  };
  const faq = both('faq');
  assert.equal(faq.length, 2, 'precondition: the clinic has an FAQ');
  faq.forEach(html => {
    assert.ok(html.includes('Harbour Physio offers sports injury rehab, dry needling and post-surgery recovery in Halifax.'));
    assert.ok(html.includes('How do I book?') && !/get a quote|Is support included|real help, not just documentation/.test(html));
  });
  both('testimonialsGrid').concat(both('testimonial')).forEach(html => assert.ok(!/Straightforward pricing|did it right the first time/.test(html), 'no trade-business quotes on a clinic'));
});
