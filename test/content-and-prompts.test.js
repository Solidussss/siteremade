'use strict';
// Why generated sites read as generic: each test pins one verified cause,
// exercised through the REAL client code (script.js in a vm) and, where the
// renderer is duplicated, through lib/site-render.js too.
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadClient, fundedProviderStatus, buildProject } = require('./helpers/load-client');
const { BUSINESSES, FIZZWELL_TEXT, FIZZWELL_PLAN } = require('./fixtures/businesses');
const siteRender = require('../lib/site-render');
const projectStore = require('../lib/project-store');

const client = loadClient();
const call = (fn, ...args) => client.ctx[fn](...args);
const category = key => client.run(`categories[${JSON.stringify(key)}]`);
// Values created inside the vm have another realm's prototypes; compare plain copies.
const plain = v => JSON.parse(JSON.stringify(v));

test('classification: short keywords match whole words only ("sparkling" is not a spa, "apparel" is not an app)', () => {
  const cat = t => client.run(`analyzeDescription(${JSON.stringify(t)}).categoryKey`);
  assert.notEqual(cat(FIZZWELL_TEXT), 'wellness', 'a sparkling drink brand was classified as a Health & Wellness studio');
  assert.equal(cat(FIZZWELL_TEXT), 'retail');
  assert.equal(cat('A day spa in Victoria'), 'wellness', 'a real spa still matches');
  assert.equal(cat('Streetwear apparel label'), 'fashion');
  assert.equal(cat('An app for booking dog walkers'), 'tech', 'a real app still matches');
  assert.equal(cat('Emergency plumbing and drain repair'), 'plumbing', 'stems still prefix-match');
});

test('business name: the name the description opens with is used, never a "<Category> Studio" template', () => {
  BUSINESSES.forEach(b => assert.equal(call('extractBusinessName', b.text), b.expect.name, b.text));
  assert.equal(call('extractBusinessName', 'The Daily Grind is a cafe'), 'The Daily Grind');
  assert.equal(call('extractBusinessName', 'We are a roofing company in Calgary'), '', 'pronouns are never taken as a name');
  assert.equal(call('extractBusinessName', 'Our studio is great'), '');
  assert.equal(call('extractBusinessName', 'A bakery called Crumb & Co in Ottawa'), 'Crumb & Co', 'the original "called X" rule still works');
});

test('a successful AI plan\'s business name and offerings are actually applied (they used to be validated, then discarded)', () => {
  const { proj, usedClaude } = buildProject(loadClient(), FIZZWELL_TEXT, { claudePlanRaw: FIZZWELL_PLAN });
  assert.equal(usedClaude, true);
  assert.equal(proj.business.name, 'Fizzwell');
  assert.deepEqual(plain(proj.business.offerings), FIZZWELL_PLAN.business.offerings);
});

test('location stops at the sentence boundary but keeps abbreviations', () => {
  assert.equal(call('extractLocation', 'A café in Portland. Single-origin beans and pastries.'), 'Portland');
  assert.equal(call('extractLocation', "A bakery in St. John's serving bread."), "St. John's");
  assert.equal(call('extractLocation', 'Roofing in New York City today'), 'New York City');
});

test('offerings: only lists the description actually states; otherwise the category list is used unchanged', () => {
  assert.deepEqual(plain(call('extractOfferings', FIZZWELL_TEXT)), ['Peach', 'Cherry', 'Citrus']);
  assert.deepEqual(plain(call('extractOfferings', 'Online skincare store selling gentle cleansers, serums and moisturizers made for sensitive skin. Free shipping over $60 and easy 30 day returns.')), ['Gentle Cleansers', 'Serums', 'Moisturizers']);
  assert.deepEqual(plain(call('extractOfferings', 'Wedding and portrait photographer based in Toronto.')), [], 'nothing listed -> nothing invented');
  const retail = category('retail');
  assert.deepEqual(plain(call('offeringsFor', { business: { offerings: [] } }, retail)), plain(retail.services));
  assert.deepEqual(plain(call('offeringsFor', { business: { offerings: ['Only One'] } }, retail)), plain(retail.services), 'one label is not a list');
});

test('no single-letter badges: features use icons, and a product slot with no image shows the full name as a wordmark (both renderers)', () => {
  const { proj } = buildProject(loadClient(), BUSINESSES.find(b => b.id === 'glow-theory').text);
  const cat = category(proj.business.categoryKey);
  const section = { id: 's1', type: 'features', variant: 'grid', copy: {} };
  const product = { id: 's2', type: 'productShowcase', copy: {} };
  const letterBadge = /<span class="feature-mark">[A-Za-z]<\/span>|product-panel-mark/;
  const preview = client.ctx.renderFeatures(proj, cat, section) + client.ctx.renderProductShowcase(proj, cat, product);
  const exported = siteRender.renderSectionHTML(proj, section, cat) + siteRender.renderSectionHTML(proj, product, cat);
  for (const [name, html] of [['preview', preview], ['export', exported]]) {
    assert.ok(!letterBadge.test(html), `${name} still renders a letter badge`);
    assert.ok(/<span class="feature-mark"><svg/.test(html), `${name} feature cards carry an icon`);
    assert.ok(html.includes('<p class="product-panel-wordmark">Glow Theory</p>'), `${name} shows the business name as the no-image product visual`);
    assert.ok(html.includes('Gentle Cleansers'), `${name} lists the real offerings`);
  }
  const amp = buildProject(loadClient(), BUSINESSES.find(b => b.id === 'fern-flint').text).proj;
  const ampHtml = client.ctx.renderProductShowcase(amp, category(amp.business.categoryKey), product);
  assert.ok(ampHtml.includes('Fern &amp; Flint') && !ampHtml.includes('&amp;amp;'), 'the business name is escaped exactly once');
});

test('image prompts: every slot gets its own prompt, about THIS business, with colour words instead of hex codes', () => {
  for (const b of BUSINESSES) {
    const { proj } = buildProject(loadClient(), b.text, { providerStatus: fundedProviderStatus() });
    const prompts = proj.imagePlan.map(e => e.prompt);
    assert.equal(new Set(prompts).size, prompts.length, `${b.id}: two slots were sent the identical prompt`);
    prompts.forEach(p => {
      assert.ok(!/#[0-9a-f]{6}/i.test(p), `${b.id}: hex colour code in prompt: ${p}`);
      assert.ok(p.includes(b.expect.name), `${b.id}: prompt does not name the business: ${p}`);
      assert.ok(p.length <= 600, `${b.id}: prompt longer than the server accepts`);
    });
  }
});

test('AI image prompts: every planned prompt can reach a slot (not one per role), none is used twice', () => {
  const { proj } = buildProject(loadClient(), FIZZWELL_TEXT, { claudePlanRaw: FIZZWELL_PLAN, providerStatus: fundedProviderStatus() });
  const planned = new Set(FIZZWELL_PLAN.imagePlan.map(e => e.prompt));
  // A directed hero keeps the planner's prompt and appends only its camera framing (lib/premium/hero-direction.js).
  const plannedOf = p => [...planned].find(pl => p === pl || p.startsWith(pl.replace(/[.\s]+$/, '') + '. '));
  const used = proj.imagePlan.map(e => plannedOf(e.prompt)).filter(Boolean);
  const hero = proj.imagePlan.find(e => e.slot === 'hero');
  assert.ok(hero.prompt.startsWith(FIZZWELL_PLAN.imagePlan[0].prompt) && /push-in/.test(hero.prompt), 'the hero keeps the planned shot and gains the camera framing');
  assert.ok(proj.imagePlan.filter(e => e.slot !== 'hero').every(e => !/push-in|camera pan/.test(e.prompt)), 'only the hero is framed for motion');
  assert.equal(new Set(used).size, used.length, 'a planned prompt was assigned to two slots');
  assert.equal(used.length, Math.min(planned.size, proj.imagePlan.length), 'planned prompts were discarded while slots fell back to generic ones');
  const galleryPrompts = proj.imagePlan.filter(e => e.role === 'gallery').map(e => e.prompt);
  assert.ok(galleryPrompts.length >= 2 && new Set(galleryPrompts).size === galleryPrompts.length, 'gallery tiles each get a different planned shot');
});

test('saved projects keep the planner\'s prompts intact (they were clipped to 200 chars / wiped on every save)', () => {
  const { proj } = buildProject(loadClient(), FIZZWELL_TEXT, { claudePlanRaw: FIZZWELL_PLAN });
  const saved = projectStore.validateDirectionsState({ directions: [JSON.parse(JSON.stringify(proj))], activeDirectionIndex: 0 }).normalized.directions[0];
  assert.equal(saved.intent.claudeImagePrompts.hero, proj.intent.claudeImagePrompts.hero);
  assert.ok(proj.intent.claudeImagePrompts.hero.length > 200);
  assert.deepEqual(plain(saved.intent.claudeImagePromptList), plain(proj.intent.claudeImagePromptList));
  assert.deepEqual(plain(saved.business.offerings), FIZZWELL_PLAN.business.offerings);
});

test('palette hue follows colours the description names; otherwise the category hue is unchanged', () => {
  assert.ok(call('descriptionColourHue', FIZZWELL_TEXT) < 40, 'peach/cherry/citrus -> warm red-orange');
  assert.equal(call('descriptionColourHue', 'We send a message every season'), null, 'no false hits inside other words');
  assert.equal(call('descriptionColourHue', BUSINESSES.find(b => b.id === 'ledgerly').text), null);
});
