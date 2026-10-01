'use strict';
// "Update My Website" update intelligence: a request is either a SURGICAL edit (the existing operation plan) or a
// DEEP REFINEMENT (a redesign of the whole site as a structured direction -- lib/deep-refinement.js, Creative:
// lib/creative-refinement.js). Pure tests for the classifier, the context, the fact rules and the surgical operations;
// then the REAL server.js end to end (test/helpers/run-server.js stubs only Claude, OpenAI, Supabase and Stripe --
// the redesign planner's answers are test/helpers/mock-redesign.js, which reads the context the server really sent).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');
const { startServer, client, providerCalls } = require('./helpers/server-process');
const { loadClient, premiumProviderStatus, buildProject, seedSavedImages } = require('./helpers/load-client');
const { mockPng } = require('./helpers/mock-image');

process.env.SITEREMADE_BACKEND = process.env.SITEREMADE_BACKEND || 'local';
const { classifyEditRequest } = require('../lib/edit-classifier');
const deepRefinement = require('../lib/deep-refinement');
const refinementChange = require('../lib/refinement-change');
const projectStore = require('../lib/project-store');
const { normalizeServerRefinementPlan } = require('../lib/refinement-normalizer');
const { applyRefinementPlan } = require('../lib/apply-refinement-plan');

const FLORIST = 'Petal & Stem is a florist in Portland making wedding flowers, bouquets and same-day delivery. Call 503-555-0147.';
const OWNER = { authorization: 'Bearer test-access-token-owner' };
const WEBHOOK_SECRET = 'whsec_update_intel_test';

function businessDirection({ text = FLORIST, uploads = [], savedImages = false } = {}) {
  const c = loadClient();
  const { proj } = buildProject(c, text, { providerStatus: premiumProviderStatus(), uploads });
  if (savedImages) seedSavedImages(proj, mockPng);
  // the premium token system a PREMIUM_GENERATION_V1 site carries (script.js attachPremiumDesign), composition on
  const tokens = require('../lib/premium/design-tokens');
  proj.design.premiumTokens = tokens.sanitizeTokens(tokens.buildDesignTokens({ typographyDirection: 'humanist-workhorse', spacingCharacter: 'standard', layoutPattern: 'service-led' }, proj.design.palette, { composition: true }));
  return projectStore.validateDirectionsState({ directions: [JSON.parse(JSON.stringify(proj))], activeDirectionIndex: 0 }).normalized.directions[0];
}

// ---- 1. classification (pure, free) ----------------------------------------------------------------------------------
test('classification: specific fields, literal values and structural moves are surgical; described outcomes are deep', () => {
  for (const r of ['change the hero button to Book Now', 'move testimonials above services', 'change the headline to Fresh flowers daily', 'remove FAQ',
    'add a services section', 'change spacing', 'update phone number to 604-555-0199', 'Give the homepage a fresh hero photo.', 'make the headline warmer', 'make it blue']) {
    assert.equal(classifyEditRequest(r).mode, 'surgical', r);
  }
  const deep = {
    'Make this website feel way more premium and less generic.': 'site', 'make the homepage more editorial': 'page', 'this feels generic, make it more creative': 'site',
    'redesign the hero': 'hero', 'make the site feel more minimal and high-end': 'site', 'make this website feel more like a modern fashion brand': 'site',
    'make this feel like a luxury brand': 'site', 'make the whole website more creative': 'site',
  };
  for (const [r, scope] of Object.entries(deep)) { const c = classifyEditRequest(r); assert.equal(c.mode, 'deep', r); assert.equal(c.scope, scope, r); }
  assert.deepEqual(classifyEditRequest('make the homepage more editorial').targetPages, ['home']);
  // not a keyword switch: a style word next to a literal value stays a specific edit; the scores explain why
  const mixed = classifyEditRequest('change the hero headline to "Luxury flowers, delivered"');
  assert.equal(mixed.mode, 'surgical'); assert.ok(mixed.signals.literal && mixed.signals.outcomeWords >= 1);
});

// ---- 2. the context: the whole site, never pixels -------------------------------------------------------------------
test('E. the redesign context carries every page and section, the design, the hero and the facts -- never image bytes or prompts', () => {
  const d = businessDirection({ savedImages: true, uploads: [{ type: 'image', dataUrl: mockPng('owner upload', '1:1'), name: 'our-shop.png' }] });
  const ctx = deepRefinement.buildRedesignContext(d, { classification: classifyEditRequest('make the whole site more premium') });
  assert.equal(ctx.pages.length, d.pages.length, 'every page');
  assert.equal(ctx.pages.reduce((n, p) => n + p.sections.length, 0), d.pages.reduce((n, p) => n + p.sections.length, 0), 'every section');
  ctx.pages.forEach((p, i) => p.sections.forEach((s, j) => { assert.equal(s.id, d.pages[i].sections[j].id); assert.equal(s.type, d.pages[i].sections[j].type); }));
  assert.equal(ctx.design.hero, d.design.dimensions.hero); assert.equal(ctx.hero.headline, d.copy.headline);
  assert.match(ctx.ownerDescription, /503-555-0147/); assert.equal(ctx.business.name, 'Petal & Stem');
  assert.equal(ctx.ownerUploads.length, 1);
  const json = JSON.stringify(ctx);
  assert.ok(!/data:image\//.test(json), 'no image bytes');
  assert.ok(!json.includes('saved before the starter-visual rule'), 'no stored image prompts');
  assert.ok(json.length < 40000, `compact (${json.length} chars)`);
});

// ---- 3. validation + fact rules (pure) --------------------------------------------------------------------------------
test('F. new copy may not invent proof, numbers or contacts, or drop a fact the owner gave; unsupported values and sections are dropped', () => {
  const d = businessDirection();
  // a slice of server.js REDESIGN_VOCAB (server.js is never loaded in-process: it opens its database on require)
  const vocab = {
    sectionTypes: require('../lib/vocabulary').SECTION_TYPE_KEYS, heroKeys: ['split', 'poster', 'quiet-luxury', 'centered-oversized'], typeKeys: ['geo-sans', 'serif-editorial'],
    spacingKeys: ['standard', 'compact', 'airy', 'generous'], creativeConceptKeys: ['private-client-luxury'], creativeMoodKeys: ['quiet-luxury', 'warm'],
    sectionIntentKeys: require('../lib/vocabulary').SECTION_INTENT_KEYS, headlineRoleKeys: ['declarative', 'editorial'],
  };
  const home = d.pages[0];
  const raw = {
    interpretation: 'x', design: { hero: 'not-a-layout', spacing: 'airy', typography: 'serif-editorial' }, creativeDirection: { visualMood: 'quiet-luxury', concept: 'made-up' },
    hero: { headline: 'Award-winning florists since 1998', sub: 'Fresh flowers for every occasion.', kicker: 'Portland' },
    pages: [{ pageId: home.id, sections: [
      { type: 'testimonialsGrid', headline: 'What clients say' }, { type: 'pricing' },
      ...home.sections.map(s => ({ ref: s.id, type: s.type, headline: 'Rated 5 stars by 2,000 clients' })),
      { type: 'faq', headline: 'Questions about delivery', body: 'Email us at orders@invented.example.' },
    ] }],
  };
  const out = deepRefinement.normalizeRedesignPlan(raw, d, { vocab, classification: classifyEditRequest('make the whole site more premium'), request: 'make the whole site more premium' });
  const reasons = out.dropped.map(x => `${x.where}: ${x.reason}`).join('\n');
  assert.equal(out.plan.design.hero, undefined, 'unknown layout dropped'); assert.equal(out.plan.design.spacing, 'airy');
  assert.equal(out.plan.creativeDirection.concept, undefined); assert.equal(out.plan.creativeDirection.visualMood, 'quiet-luxury');
  assert.match(reasons, /hero\.headline: unsupported claim "Award-winning"/);
  assert.match(reasons, /hero\.sub: would remove a fact the owner gave \(5035550147\)/, 'the phone number in the hero is kept');
  assert.equal(out.plan.hero.kicker, 'Portland');
  assert.match(reasons, /new testimonialsGrid section would need facts/); assert.match(reasons, /new pricing section would need facts/);
  assert.match(reasons, /headline: (unsupported claim "(Rated|2,000 clients)"|a number the owner never gave)/);
  assert.match(reasons, /body: a contact detail or link the owner never gave/);
  const types = out.plan.pages[0].sections.map(s => s.type);
  assert.ok(!types.includes('testimonialsGrid') && !types.includes('pricing') && types.includes('faq'));
  assert.equal(out.plan.pages[0].sections.find(s => s.type === 'faq').copy.headline, 'Questions about delivery');
  // a claim the owner's own words already make is allowed
  const ok = deepRefinement.copyProblem('Same-day delivery in Portland', deepRefinement.copyCorpus(d), 'headline');
  assert.equal(ok, null);
});

// ---- 4. surgical operations (pure) -- the existing system is unchanged ----------------------------------------------
test('surgical edits still work: headline, move section, remove section, spacing', () => {
  const d = businessDirection();
  const state = { directions: [d], activeDirectionIndex: 0 };
  const vocab = { sectionTypes: require('../lib/vocabulary').SECTION_TYPE_KEYS, heroKeys: [], imageryKeys: [], colorBehaviorKeys: [], spacingKeys: ['standard', 'compact', 'airy', 'generous'], imageStrategyKeys: [], heroStrategyKeys: [], pageRhythmKeys: [] };
  const [a, b] = d.pages[0].sections;
  const plan = normalizeServerRefinementPlan({ scope: 'page', operations: [
    { action: 'edit-copy', targetId: 'hero', changes: { headline: 'Fresh flowers daily' } },
    { action: 'move-section', targetId: b.id, beforeId: a.id },
    { action: 'change-design', changes: { spacing: 'airy' } },
    { action: 'remove-section', targetId: a.id },
  ], imageActions: [] }, d, vocab);
  assert.equal(plan.operations.length, 4);
  const r = applyRefinementPlan(state, 0, plan);
  assert.equal(r.ok, true);
  const after = r.state.directions[0];
  assert.equal(after.copy.headline, 'Fresh flowers daily'); assert.equal(after.design.dimensions.spacing, 'airy');
  assert.equal(after.pages[0].sections[0].id, b.id, 'moved to the top'); assert.ok(!after.pages[0].sections.some(s => s.id === a.id), 'removed');
  assert.equal(after.design.layoutDataset, undefined, 'a surgical edit never changes how the site exports');
});

test('J. meaningful change: an unchanged or trivially changed site is not a redesign', () => {
  const d = businessDirection();
  const same = refinementChange.measureBusinessChange(d, JSON.parse(JSON.stringify(d)));
  assert.equal(same.score, 0); assert.equal(refinementChange.isMeaningful(same, 'site').ok, false);
  const tiny = JSON.parse(JSON.stringify(d)); tiny.design.dimensions.nav = tiny.design.dimensions.nav === 'inline' ? 'boxed-pill' : 'inline';
  const m = refinementChange.measureBusinessChange(d, tiny);
  assert.ok(m.score > 0); assert.equal(refinementChange.isMeaningful(m, 'site').ok, false);
});

// ---- 5. the real server ------------------------------------------------------------------------------------------------
let srv = null;
async function server() {
  if (srv) return srv;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sr-update-intel-'));
  const env = {
    SITEREMADE_BACKEND: 'local', SITEREMADE_DB_PATH: path.join(dir, 'app.db'), SITEREMADE_ASSET_STORE_DIR: path.join(dir, 'assets'),
    SITEREMADE_PREMIUM_LOG_DIR: path.join(dir, 'premium'), SITEREMADE_EXPORTS_DIR: path.join(dir, 'exports'),
    PREMIUM_GENERATION_V1: 'true', ANTHROPIC_API_KEY: 'test-only', OPENAI_API_KEY: 'test-only', SITEREMADE_PAID_IMAGES: 'true', SITEREMADE_IMAGE_BUDGET_USD: '5',
    SITEREMADE_APP_BRIDGE_ENABLED: 'true', SITEREMADE_IDENTITY_BRIDGE_MODE: 'full', SUPABASE_URL: 'https://supabase.test', SUPABASE_ANON_KEY: 'test-anon-key', SUPABASE_PUBLISHABLE_KEY: '',
    STRIPE_SECRET_KEY: 'sk_test_mock_only', STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET, SITEREMADE_TRIAL_CREDITS: '60',
    MOCK_REFINEMENT_COPY: 'Fresh flowers, arranged daily', MOCK_CALL_LOG: path.join(dir, 'provider-calls.log'), NODE_ENV: 'test',
  };
  const s = await startServer(env);
  const call = client(s.port);
  assert.equal((await call('POST', '/api/identity/supabase/session', { supabaseAccessToken: 'test-access-token-owner' })).status, 200);
  const calls = () => providerCalls(env.MOCK_CALL_LOG);
  const create = async (direction, name = 'Petal & Stem') => {
    const r = await call('POST', '/api/projects', { name, directionsState: { directions: [direction], activeDirectionIndex: 0 } });
    assert.ok(r.status === 200 || r.status === 201, JSON.stringify(r.body).slice(0, 300));
    return r.body.project;
  };
  const buy = async projectId => {
    await call('POST', '/api/checkout', { projectId, businessName: 'Petal & Stem' });
    const asked = calls().filter(x => x.provider === 'stripe' && x.endpoint === 'checkout' && x.projectId === projectId).pop(); const session = asked.session;
    const body = JSON.stringify({ id: 'evt_' + session, type: 'checkout.session.completed', data: { object: { id: session, payment_status: 'paid', amount_total: asked.amount, currency: 'cad' } } });
    const t = Math.floor(Date.now() / 1000); const sig = crypto.createHmac('sha256', WEBHOOK_SECRET).update(`${t}.${body}`).digest('hex');
    const r = await fetch(`http://127.0.0.1:${s.port}/api/stripe/webhook`, { method: 'POST', headers: { 'content-type': 'application/json', 'stripe-signature': `t=${t},v1=${sig}` }, body });
    assert.equal(r.status, 200);
  };
  const stored = async id => (await call('GET', `/api/projects/${id}`)).body.project;
  // OWNERSHIP + CREDITS: the app shows the update's quote and the owner approves it -- this does the same (r.quoted is
  // the price the owner saw)
  const edit = async (project, request, extra = {}) => {
    const q = await call('POST', '/api/app-bridge/quotes', { operation: 'website_update', request, projectId: project.id }, OWNER);
    const quote = q.body && q.body.quote;
    const r = await call('POST', `/api/app-bridge/website/${project.id}/edits`, Object.assign({ baseRevision: project.revision, request }, quote ? { quoteId: quote.id } : {}, extra.body || {}), Object.assign({}, OWNER, extra.headers || {}));
    r.quoted = quote ? quote.credits : null; return r;
  };
  const balance = async () => (await call('GET', '/api/credits')).body.credits.remaining;
  const text = async url => { const r = await fetch(`http://127.0.0.1:${s.port}${url}`, { headers: OWNER }); return { status: r.status, headers: r.headers, body: await r.text() }; };
  const bytes = async url => { const r = await fetch(`http://127.0.0.1:${s.port}${url}`, { headers: OWNER }); return { status: r.status, body: Buffer.from(await r.arrayBuffer()) }; };
  srv = { s, env, dir, call, calls, create, buy, stored, edit, balance, text, bytes };
  return srv;
}
test.after(async () => { if (srv) { await srv.s.stop(); fs.rmSync(srv.dir, { recursive: true, force: true }); } });
const redesignCalls = calls => calls.filter(c => c.provider === 'anthropic' && c.tool === 'submit_website_redesign');
const dims = d => d.design.dimensions;
const pictures = d => JSON.stringify({ assets: d.assets, imagePlan: d.imagePlan });

test('A/E/H. "Make this website feel way more premium and less generic" -- a real redesign across the site, one credit, no pictures touched', async () => {
  const { create, edit, stored, balance, calls } = await server();
  const project = await create(businessDirection());
  const before = (await stored(project.id)).directionsState.directions[0];
  const credits = await balance();
  const openaiBefore = calls().filter(c => c.provider === 'openai').length;
  const r = await edit(project, 'Make this website feel way more premium and less generic.');
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.mode, 'deep'); assert.equal(r.body.scope, 'site');
  assert.equal(r.quoted, 5, 'a whole-site redesign is quoted at 5'); assert.equal(r.body.creditsCharged, 5); assert.equal(await balance(), credits - 5, 'the quoted price');
  assert.ok(r.body.changeSummary.length >= 5, r.body.changeSummary.join(' | '));
  assert.ok(r.body.changeSummary.every(s => !/[{}_]|dimensions|typography=|op:/.test(s)), 'plain language, no schema');
  const saved = await stored(project.id);
  assert.equal(saved.revision, project.revision + 1, 'one new draft revision');
  const after = saved.directionsState.directions[0];
  const changedDims = Object.keys(dims(after)).filter(k => dims(after)[k] !== dims(before)[k]);
  assert.ok(changedDims.length >= 5, `design values changed: ${changedDims}`);
  assert.equal(after.design.premiumTokens.typographyKey, 'editorial-contrast', 'the type system every page draws from');
  assert.equal(after.intent.creativeDirection.visualMood, 'quiet-luxury');
  assert.notEqual(after.copy.headline, before.copy.headline);
  assert.equal(after.design.layoutDataset, 1);
  // E: site-wide -- more than the homepage changed, and the planner saw every page
  const changedPages = after.pages.filter((p, i) => JSON.stringify(p.sections.map(s => s.id)) !== JSON.stringify(before.pages[i].sections.map(s => s.id)));
  assert.ok(changedPages.length >= 2, 'several pages restructured');
  const planned = redesignCalls(calls()).pop();
  assert.equal(planned.pagesInContext, before.pages.length); assert.equal(planned.imageBytesSent, false);
  // H: Business pictures -- nothing generated, nothing added, removed or replaced
  assert.equal(calls().filter(c => c.provider === 'openai').length, openaiBefore, 'no image generated');
  assert.equal(pictures(after), pictures(before));
  // facts: the owner's phone number is still on the site
  assert.ok(JSON.stringify(after.copy).includes('503-555-0147'));
});

test('B. "make the homepage more editorial" -- changes the homepage composition and rhythm, leaves the other pages', async () => {
  const { create, edit, stored } = await server();
  const project = await create(businessDirection());
  const before = (await stored(project.id)).directionsState.directions[0];
  const r = await edit(project, 'make the homepage more editorial');
  assert.equal(r.status, 200, JSON.stringify(r.body)); assert.equal(r.body.scope, 'page');
  const after = (await stored(project.id)).directionsState.directions[0];
  assert.notEqual(dims(after).sectionRhythm, dims(before).sectionRhythm);
  assert.equal(after.intent.creativeDirection.pageRhythm, 'steady-editorial');
  assert.notDeepEqual(after.pages[0].sections.map(s => [s.id, s.variant]), before.pages[0].sections.map(s => [s.id, s.variant]), 'homepage recomposed');
  for (let i = 1; i < before.pages.length; i++) assert.deepEqual(after.pages[i], before.pages[i], `${before.pages[i].label} untouched`);
  assert.ok(r.body.changeSummary.some(s => /editorial/i.test(s)), r.body.changeSummary.join(' | '));
});

test('C. "this feels generic, make it more creative" -- a new creative direction and several design dimensions', async () => {
  const { create, edit, stored } = await server();
  const project = await create(businessDirection());
  const before = (await stored(project.id)).directionsState.directions[0];
  const r = await edit(project, 'this feels generic, make it more creative');
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const after = (await stored(project.id)).directionsState.directions[0];
  const cd = k => [before.intent.creativeDirection[k], after.intent.creativeDirection[k]];
  assert.notEqual(...cd('concept')); assert.notEqual(...cd('visualMood')); assert.notEqual(...cd('pageRhythm'));
  assert.ok(['imagery', 'sectionRhythm', 'sectionAlignment', 'cardShape', 'splitRatio', 'imageDominance'].filter(k => dims(after)[k] !== dims(before)[k]).length >= 4);
});

test('D. "redesign the hero" -- a new hero composition and headline; pages and facts untouched', async () => {
  const { create, edit, stored } = await server();
  const project = await create(businessDirection());
  const before = (await stored(project.id)).directionsState.directions[0];
  const r = await edit(project, 'redesign the hero');
  assert.equal(r.status, 200, JSON.stringify(r.body)); assert.equal(r.body.scope, 'hero');
  const after = (await stored(project.id)).directionsState.directions[0];
  assert.notEqual(after.heroStoryboard.composition, before.heroStoryboard.composition, 'the moving hero was recomposed');
  assert.deepEqual(after.heroStoryboard.layers.map(l => [l.slot, l.art]), before.heroStoryboard.layers.map(l => [l.slot, l.art]), 'the same pictures');
  assert.notEqual(after.copy.headline, before.copy.headline);
  assert.equal(after.copy.sub, before.copy.sub, 'the sub line (with the phone number) is kept');
  assert.deepEqual(after.pages, before.pages, 'no page restructured -- the planner\'s page changes were ignored for a hero request');
  assert.match(r.body.changeSummary[0], /Redesigned the top of your homepage/);
});

test('F. invented proof is never saved; the owner\'s facts survive; testimonials and team are not invented', async () => {
  const { create, edit, stored } = await server();
  const project = await create(businessDirection());
  const r = await edit(project, 'Make the whole site feel more premium and credible');
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const after = (await stored(project.id)).directionsState.directions[0];
  const json = JSON.stringify({ copy: after.copy, pages: after.pages });
  for (const bad of ['Award-winning', '2,000', '1998', '555-0100', 'invented.example', 'certified', 'guarantee', 'Rated 5', '12 experts']) assert.ok(!json.includes(bad), `no "${bad}"`);
  assert.ok(!after.pages.some(p => p.sections.some(s => ['testimonialsGrid', 'testimonial', 'team'].includes(s.type))), 'no invented social proof sections');
  assert.equal(after.copy.sub, 'Call 503-555-0147.', 'the owner\'s phone number');
  assert.equal(after.business.name, 'Petal & Stem'); assert.equal(after.source.text, FLORIST);
});

test('G. owner uploads survive; a form the redesign left out is kept where it was', async () => {
  const { create, edit, stored } = await server();
  const upload = { type: 'image', dataUrl: mockPng('the owner\'s own shop photo', '4:3'), name: 'shop.png' };
  const project = await create(businessDirection({ uploads: [upload] }));
  const before = (await stored(project.id)).directionsState.directions[0];
  const formBefore = before.pages.flatMap(p => p.sections.map(s => ({ page: p.id, s }))).find(x => x.s.module);
  assert.ok(formBefore, 'the fixture has a form');
  const r = await edit(project, 'Make the whole website simpler and more minimal');
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const after = (await stored(project.id)).directionsState.directions[0];
  assert.equal(after.assets.items.length, before.assets.items.length); assert.equal(after.assets.items[0].name, 'shop.png');
  assert.equal(pictures(after), pictures(before), 'uploads and their placement untouched');
  const page = after.pages.find(p => p.id === formBefore.page);
  const form = page.sections.find(s => s.id === formBefore.s.id);
  assert.ok(form && form.module && form.module.type === formBefore.s.module.type, 'the working form is still there');
  assert.ok(r.body.changeSummary.includes('Kept your form where visitors can use it'));
});

test('J. a broad request whose result is basically unchanged is not saved and not charged', async () => {
  const { create, edit, stored, balance } = await server();
  const project = await create(businessDirection());
  const credits = await balance();
  const r = await edit(project, 'Refresh the look of the whole website, keeping everything as it is');
  assert.equal(r.status, 422, JSON.stringify(r.body));
  assert.equal(r.body.error.code, 'no_meaningful_change');
  assert.equal(r.body.error.message, 'The redesign did not produce a meaningful enough change, so nothing was saved and no credits were used. Try describing what you want to see, or send it to the SiteRemade team.');
  assert.equal(await balance(), credits, 'no credit used');
  assert.equal((await stored(project.id)).revision, project.revision, 'nothing saved');
});

test('K. a redesign respects baseRevision: a stale revision is refused before any planning or charge', async () => {
  const { create, edit, balance, calls, call } = await server();
  const project = await create(businessDirection());
  const saved = await call('PUT', `/api/projects/${project.id}`, { directionsState: (await call('GET', `/api/projects/${project.id}`)).body.project.directionsState, expectedRevision: project.revision });
  assert.equal(saved.status, 200, JSON.stringify(saved.body).slice(0, 200));
  const credits = await balance(); const planned = redesignCalls(calls()).length;
  const r = await edit(project, 'Make this website feel way more premium');
  assert.equal(r.status, 409); assert.equal(r.body.error.code, 'revision_conflict');
  assert.equal(redesignCalls(calls()).length, planned, 'no planner call'); assert.equal(await balance(), credits);
});

test('an unusable redesign plan changes nothing and costs nothing; a retried update is never planned or charged twice', async () => {
  const { create, edit, stored, balance, calls } = await server();
  const project = await create(businessDirection());
  const credits = await balance();
  const bad = await edit(project, 'Redesign the whole website, gibberish mode');
  assert.equal(bad.status, 422, JSON.stringify(bad.body)); assert.equal(bad.body.error.code, 'edit_failed');
  assert.equal(await balance(), credits); assert.equal((await stored(project.id)).revision, project.revision);
  const key = { 'idempotency-key': 'redesign-once-' + Date.now() };
  const first = await edit(project, 'Make this website feel way more premium', { headers: key });
  assert.equal(first.status, 200, JSON.stringify(first.body));
  const planned = redesignCalls(calls()).length;
  const again = await edit(project, 'Make this website feel way more premium', { headers: key });
  assert.equal(again.status, 200); assert.equal(again.body.replayed, true); assert.equal(again.body.creditsCharged, 0);
  assert.equal(again.body.revision, first.body.revision);
  assert.equal(redesignCalls(calls()).length, planned, 'not planned again'); assert.equal(await balance(), credits - first.quoted, 'charged once, at the quoted price');
});

test('surgical requests still take the operation plan (not the redesign), cost one AI update, and save a draft', async () => {
  const { create, edit, stored, calls, balance } = await server();
  const project = await create(businessDirection());
  const credits = await balance(); const planned = redesignCalls(calls()).length;
  const r = await edit(project, 'Change the headline to "Fresh flowers, arranged daily"');
  assert.equal(r.status, 200, JSON.stringify(r.body)); assert.equal(r.body.mode, 'surgical');
  assert.equal(redesignCalls(calls()).length, planned, 'the redesign planner was not used');
  assert.equal(calls().filter(c => c.tool === 'submit_website_refinement').length > 0, true);
  assert.equal(await balance(), credits - 1);
  const after = (await stored(project.id)).directionsState.directions[0];
  assert.equal(after.copy.headline, 'Fresh flowers, arranged daily'); assert.equal(after.design.layoutDataset, undefined);
});

// ---- L. preview before publish, and export parity after it ---------------------------------------------------------------
function readZip(buf) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 65535); i--) if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  const count = buf.readUInt16LE(eocd + 10); let p = buf.readUInt32LE(eocd + 16); const files = new Map();
  for (let n = 0; n < count; n++) {
    const method = buf.readUInt16LE(p + 10), csize = buf.readUInt32LE(p + 20), nlen = buf.readUInt16LE(p + 28), xlen = buf.readUInt16LE(p + 30), clen = buf.readUInt16LE(p + 32), off = buf.readUInt32LE(p + 42);
    const name = buf.slice(p + 46, p + 46 + nlen).toString('utf8'); const lnlen = buf.readUInt16LE(off + 26), lxlen = buf.readUInt16LE(off + 28);
    const raw = buf.slice(off + 30 + lnlen + lxlen, off + 30 + lnlen + lxlen + csize);
    files.set(name, method === 8 ? zlib.inflateRawSync(raw) : raw); p += 46 + nlen + xlen + clen;
  }
  return files;
}
// the page itself, whether inlined for the app preview or as the ZIP's files
const pageOnly = html => html.replace(/<style data-siteremade-preview-css>[\s\S]*?<\/style>|<link rel="stylesheet" href="styles\.css">/g, '')
  .replace(/<script data-siteremade-preview-js>[\s\S]*?<\/script>|<script src="site\.js"><\/script>/g, '').replace('<base target="_blank">', '')
  .replace(/data:image\/[a-z+]+;base64,[A-Za-z0-9+/=]+|assets\/[A-Za-z0-9._-]+/g, 'ASSET').replace(/\s+/g, ' ');

test('L. the app previews the saved draft before publishing; after publishing, the preview and the downloaded ZIP are that same site', async () => {
  const { create, buy, edit, text, bytes, call, stored } = await server();
  const project = await create(businessDirection());
  await buy(project.id);
  const bought = await stored(project.id);
  const publishedBefore = await text(`/api/app-bridge/website/${project.id}/preview`);
  assert.equal(publishedBefore.status, 200);
  const r = await edit(bought, 'Make this website feel way more premium and less generic.');
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const newHeadline = (await stored(project.id)).directionsState.directions[0].copy.headline;
  const esc = s => s.replace(/&/g, '&amp;');
  // before publishing: the draft preview shows the redesign, the published preview still shows what was bought
  const draft = await text(`/api/app-bridge/website/${project.id}/preview?source=draft`);
  assert.equal(draft.status, 200); assert.equal(draft.headers.get('x-siteremade-preview'), 'draft'); assert.equal(draft.headers.get('x-siteremade-revision'), String(r.body.revision));
  assert.ok(draft.body.includes(esc(newHeadline)), 'the draft preview shows the new headline');
  assert.match(draft.body, /data-page-rhythm="steady-editorial"/); assert.match(draft.body, /data-rhythm-position="/);
  const stillPublished = await text(`/api/app-bridge/website/${project.id}/preview`);
  assert.ok(!stillPublished.body.includes(esc(newHeadline)), 'nothing published automatically');
  assert.equal(pageOnly(stillPublished.body), pageOnly(publishedBefore.body));
  // publish exactly the reviewed revision
  const pub = await call('POST', `/api/app-bridge/website/${project.id}/publish`, { revision: r.body.revision }, OWNER);
  assert.equal(pub.status, 200, JSON.stringify(pub.body));
  const published = await text(`/api/app-bridge/website/${project.id}/preview`);
  assert.equal(pageOnly(published.body), pageOnly(draft.body), 'the published preview is the reviewed draft');
  const zip = await bytes(`/api/app-bridge/website/${project.id}/download`);
  assert.equal(zip.status, 200);
  const index = readZip(zip.body).get('index.html').toString('utf8');
  assert.equal(pageOnly(index), pageOnly(draft.body), 'the ZIP homepage is the reviewed draft');
});

test('the draft preview is owner-only', async () => {
  const { s, create } = await server();
  const project = await create(businessDirection());
  const r = await fetch(`http://127.0.0.1:${s.port}/api/app-bridge/website/${project.id}/preview?source=draft`, { headers: { authorization: 'Bearer test-access-token-other' } });
  assert.equal(r.status, 404);
});

test('diagnostics: one [update-intel] line per update -- classification, timing, counts, drops, the change verdict, save and charge; never a token or image bytes', async () => {
  const { s, create, edit } = await server();
  const project = await create(businessDirection());
  const r = await edit(project, 'Make the whole site feel more premium and credible');
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const lines = s.output().split('\n').filter(l => l.startsWith('[update-intel] ')).map(l => JSON.parse(l.slice('[update-intel] '.length)));
  const line = lines.filter(l => l.projectId === project.id).pop();
  assert.ok(line, 'logged');
  for (const k of ['requestId', 'projectId', 'baseRevision', 'mode', 'scope', 'classifier', 'plannerModel', 'planningMs', 'operationCount', 'droppedInvalid', 'droppedFields', 'meaningfulChange', 'saved', 'creditsCharged', 'outcome']) assert.ok(k in line, `has ${k}`);
  assert.equal(line.mode, 'deep_refinement'); assert.equal(line.outcome, 'saved'); assert.equal(line.saved, true); assert.equal(line.creditsCharged, r.quoted);
  assert.equal(line.baseRevision, project.revision); assert.equal(line.plannerModel, 'mock-redesign-planner');
  assert.ok(line.droppedInvalid >= 5 && line.droppedFields.some(d => /unsupported claim/.test(d.reason)), 'what was dropped, and why');
  assert.equal(line.meaningfulChange.ok, true);
  assert.ok(lines.some(l => l.outcome === 'no_meaningful_change' && l.saved === false && l.creditsCharged === 0), 'a no-op redesign is logged as such');
  assert.ok(lines.some(l => l.mode === 'surgical_edit' && l.outcome === 'saved'), 'surgical edits are logged too');
  const all = s.output();
  assert.ok(!/test-access-token|Bearer |sk_test|test-only|data:image\//.test(all.split('\n').filter(l => l.startsWith('[update-intel]')).join('\n')), 'no secrets or image bytes');
});

// ---- I. Creative -----------------------------------------------------------------------------------------------------
function creativeDirection() {
  const { validatePlan2 } = require('../lib/creative/validate2');
  const mock = require('./helpers/mock-creative');
  const page = { title: 'Toilet paper', url: 'https://en.wikipedia.org/wiki/Toilet_paper', description: 'A tissue paper product', extract: 'Toilet paper is a tissue paper product used for cleaning.', category: 'object', retrieved: '2026-09-28', license: 'CC BY-SA 4.0' };
  const facts = [{ id: 'f1', text: 'Toilet paper is a tissue paper product used for cleaning.', section: 'Overview', source: { title: 'Toilet paper', url: page.url, license: 'CC BY-SA 4.0' } }];
  const asset = { id: 'a1', origin: 'research', title: 'File:Toilet paper roll.jpg', alt: 'A roll of toilet paper', author: 'Jane Photographer', license: 'CC BY-SA 4.0', licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/', pageUrl: 'https://commons.wikimedia.org/wiki/File:Toilet_paper_roll.jpg', sourceUrl: 'https://upload.wikimedia.org/x.jpg', retrieved: '2026-09-28', processing: 'resized', mime: 'image/png', dataUrl: mockPng('a roll of toilet paper', '4:3'), assess: { width: 1200, height: 900, aspect: 1.33, orientation: 'landscape' } };
  const understanding = { kind: 'recognizable', subject: 'Toilet paper', name: 'Toilet paper', identity: { name: 'Toilet paper', kind: 'recognizable' } };
  const body = { messages: [{ role: 'user', content: [{ type: 'text', text: JSON.stringify({ understanding: { identity: { name: 'Toilet paper', kind: 'recognizable' } }, assets: [{ id: 'a1', transparent: false, title: asset.title }], facts }) }] }] };
  const v = validatePlan2(mock.plan(body, 'ok', {}), { page, assets: [asset], facts, understanding: { kind: 'recognizable', subject: 'Toilet paper' }, supplied: [] });
  assert.deepEqual(v.errors, [], 'the fixture plan is valid');
  const state = { directions: [{ mode: 'creative', meta: { id: 'c1' }, pages: [{ id: 'creative', label: 'Creative page', sections: [] }], creative: { brief: 'A website about toilet paper', understanding, research: { status: 'ok', page, facts }, assets: [asset], plan: v.plan, motion: { intensity: 'lively' } } }], activeDirectionIndex: 0 };
  return projectStore.validateDirectionsState(state).normalized.directions[0];
}

test('I. a Creative page is revised by its own director: new concept and scenes; research, sources, pictures and licences unchanged', async () => {
  const { create, edit, stored, balance, calls } = await server();
  const project = await create(creativeDirection(), 'Toilet paper');
  const before = (await stored(project.id)).directionsState.directions[0];
  const credits = await balance();
  const plannedBusiness = redesignCalls(calls()).length;
  const r = await edit(project, 'Make this page feel more playful and much less dark');
  assert.equal(r.status, 200, JSON.stringify(r.body)); assert.equal(r.body.mode, 'deep'); assert.equal(r.body.creditsCharged, r.quoted);
  assert.equal(await balance(), credits - r.quoted);
  assert.ok(calls().some(c => c.provider === 'anthropic' && c.tool === 'submit_creative_plan'), 'the Creative director revised it');
  assert.equal(redesignCalls(calls()).length, plannedBusiness);
  const after = (await stored(project.id)).directionsState.directions[0];
  assert.equal(after.mode, 'creative', 'still a Creative page -- never flattened into Business sections');
  assert.equal(after.creative.plan.concept.title, 'Mock Stage, revised');
  assert.notDeepEqual(after.creative.plan.scenes.map(s => s.id), before.creative.plan.scenes.map(s => s.id));
  assert.deepEqual(after.creative.research, before.creative.research, 'research and its sources');
  assert.deepEqual(after.creative.assets, before.creative.assets, 'pictures with author, licence and source page');
  assert.deepEqual(after.creative.motion, before.creative.motion);
  assert.equal(after.creative.history.slice(-1)[0].title, before.creative.plan.concept.title, 'the previous concept is kept in the history');
  assert.ok(r.body.changeSummary.includes('Gave the page a new creative concept'), r.body.changeSummary.join(' | '));
});

test('I/J. a Creative revision that comes back the same is not saved and not charged', async () => {
  const { create, edit, stored, balance } = await server();
  const project = await create(creativeDirection(), 'Toilet paper');
  const credits = await balance();
  const r = await edit(project, 'Refresh the whole page, keeping everything as it is');
  assert.equal(r.status, 422, JSON.stringify(r.body)); assert.equal(r.body.error.code, 'no_meaningful_change');
  assert.equal(await balance(), credits); assert.equal((await stored(project.id)).revision, project.revision);
});
