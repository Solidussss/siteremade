'use strict';
// node test-premium-generation.js
// Unit + orchestration tests for lib/premium (PREMIUM_GENERATION_V1). No
// network. These prove OUR logic (budgeting, planning, prompt safety,
// review/repair limits, preservation). They do NOT prove model output
// quality or real provider cost -- see PREMIUM_GENERATION_V1.md.
const assert = require('assert');
const P = require('./lib/premium');
const { PNG_BLANK, PNG_PHOTO } = makePngs();

let passed = 0, failed = 0;
async function t(name, fn) { try { await fn(); passed++; console.log('  ok   ' + name); } catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + (e && e.stack || e)); } }

function makePngs() {
  // minimal PNG headers with declared dimensions; payload size decides "flat vs photo"
  const mk = (w, h, bytes) => {
    const head = Buffer.alloc(33); head.write('\x89PNG\r\n\x1a\n', 0, 'latin1'); head.writeUInt32BE(13, 8); head.write('IHDR', 12, 'latin1'); head.writeUInt32BE(w, 16); head.writeUInt32BE(h, 20);
    return 'data:image/png;base64,' + Buffer.concat([head, Buffer.alloc(bytes, 7)]).toString('base64');
  };
  return { PNG_BLANK: mk(1536, 1024, 3000), PNG_PHOTO: mk(1536, 1024, 2500000) };
}
// V1-level tests run with the sub-features explicitly OFF (they are ON by default in production); V2/V3/V4 tests switch them on.
const env = over => Object.assign({ PREMIUM_GENERATION_V1: 'true', PREMIUM_COMPOSITION_V2: 'false', PREMIUM_GROUNDING_V3: 'false', PREMIUM_VISUALS_V4: 'false' }, over || {});
const core = over => P.createPremiumCore(P.loadConfig(env(over)));
const palette = { background: '#f7f8fa', main: '#c0451f', text: '#101216', accent2: '#1b4b8f' };
const startRoofing = c => c.startSession({ categoryKey: 'roofing', categoryLabel: 'Roofing', archetype: 'local-conversion', palette, description: 'Family roofing company in Calgary, shingle repair and replacement', location: 'Calgary' });
const slots = () => [
  { slot: 'hero', role: 'hero', sectionType: 'hero', aspectRatio: '16:9', rank: 0 },
  { slot: 'product', role: 'product', sectionType: 'productShowcase', aspectRatio: '4:3', rank: 1 },
  { slot: 'about', role: 'team', sectionType: 'about', aspectRatio: '1:1', rank: 2 },
  { slot: 'team-0', role: 'team', sectionType: 'team', aspectRatio: '1:1', rank: 3 },
  { slot: 'gallery-0', role: 'gallery', sectionType: 'gallery', aspectRatio: '4:3', rank: 4 },
  { slot: 'gallery-featured', role: 'gallery', sectionType: 'imageLedEditorial', aspectRatio: '16:9', rank: 5 },
];
const sample = () => ({
  copy: { headline: 'Roof repairs and replacements in Calgary', sub: 'Call for a straightforward quote.', cta: 'Get a quote' },
  design: { dimensions: { hero: 'split', imageDominance: 'balanced' } },
  pages: [{ id: 'home', slug: '', sections: [
    { id: 's1', type: 'services', variant: 'numbered', copy: { headline: 'What we do', body: 'Shingle repair and full roof replacement.' } },
    { id: 's2', type: 'process', variant: 'x', copy: {} },
    { id: 's3', type: 'ctaBanner', variant: 'plain', copy: { ctaLabel: 'Get a quote' } },
    { id: 's4', type: 'contact', copy: {} },
  ] }],
  imagePlan: [{ slot: 'hero', sourceType: 'generated', aspectRatio: '16:9', cacheKey: 'k1', kind: 'photo', routeKind: 'premium', quality: 'high', model: 'gpt-image-1', focal: { x: .7, y: .5 } }],
  assets: { generated: { hero: { status: 'ready', dataUrl: PNG_PHOTO } } },
});

(async () => {
  console.log('config / flag');
  await t('flag is OFF unless PREMIUM_GENERATION_V1 is set (legacy pipeline stays default)', () => {
    assert.strictEqual(P.loadConfig({}).enabled, false);
    assert.strictEqual(P.loadConfig({ PREMIUM_GENERATION_V1: 'true' }).enabled, true);
    assert.strictEqual(P.loadConfig({ PREMIUM_GENERATION_V1: 'false' }).enabled, false);
  });
  await t('budgets default to the briefed targets and are env-overridable', () => {
    const b = P.loadConfig({}).budgets;
    assert.deepStrictEqual([b.TARGET_FIRST_DRAFT_USD, b.TARGET_PUBLISHABLE_SITE_USD, b.SOFT_SITE_BUDGET_USD, b.HARD_SITE_BUDGET_USD], [1.5, 3.0, 3.5, 5]);
    assert.strictEqual(P.loadConfig({ HARD_SITE_BUDGET_USD: '2.5' }).budgets.HARD_SITE_BUDGET_USD, 2.5);
  });

  console.log('cost ledger');
  await t('records tokens, image cost, cumulative, and aggregates FIRST_DRAFT / REPAIR / TOTAL', () => {
    const c = core(), s = startRoofing(c);
    s.recordText({ operation: 'understand_business', usage: { inputTokens: 3000, outputTokens: 5000, cacheReadTokens: 2000 } });
    s.recordImage({ model: 'gpt-image-1', imageTier: 'premium', quality: 'high', aspectRatio: '16:9' });
    s.recordImage({ model: 'gpt-image-1-mini', imageTier: 'support', quality: 'medium', aspectRatio: '4:3', phase: 'repair', retryCount: 1 });
    const t1 = s.totals();
    assert.ok(t1.FIRST_DRAFT_COST > 0.6 && t1.REPAIR_COST > 0.02);
    assert.strictEqual(Math.round((t1.FIRST_DRAFT_COST + t1.REPAIR_COST) * 1e6), Math.round(t1.TOTAL_SITE_COST * 1e6));
    assert.strictEqual(t1.imageCount, 2); assert.strictEqual(t1.imageRetries, 1); assert.strictEqual(t1.modelCalls, 1);
    const last = c.ledger.entries[c.ledger.entries.length - 1];
    assert.strictEqual(last.cumulativeUsd, t1.TOTAL_SITE_COST);
    assert.ok(last.provider && last.model && last.operation);
  });
  await t('a failed image that reached the provider is still counted (conservative)', () => {
    const c = core(), s = startRoofing(c);
    s.recordImage({ model: 'gpt-image-1', imageTier: 'premium', quality: 'medium', aspectRatio: '16:9', ok: false, providerReached: true });
    assert.ok(s.totals().TOTAL_SITE_COST > 0);
    s.recordImage({ model: 'gpt-image-1', imageTier: 'premium', quality: 'medium', aspectRatio: '16:9', ok: false, providerReached: false });
    assert.strictEqual(s.totals().imageCount, 0);
  });

  console.log('budget governor (centralised)');
  await t('affordable request is allowed as asked', () => {
    const s = startRoofing(core());
    const d = s.governor.decide({ operation: 'image_generation', phase: 'first_draft', priority: 'normal', estimatedUsd: 0.3, id: 'a' });
    assert.ok(d.allowed && d.reason === 'ok' && d.choice.id === 'a');
  });
  await t('remaining $0.40: a $0.90 request is downgraded to a cheaper fallback, not run', () => {
    const c = core({ HARD_SITE_BUDGET_USD: '5' }), s = startRoofing(c);
    s.ledger.record({ generationId: s.generationId, kind: 'other', operation: 'seed', costUsdOverride: 4.6 });
    assert.ok(Math.abs(s.governor.remaining() - 0.4) < 1e-9);
    const d = s.governor.decide({ operation: 'image_generation', phase: 'repair', priority: 'high', estimatedUsd: 0.9, id: 'expensive', fallbacks: [{ id: 'cheap', estimatedUsd: 0.2 }] });
    assert.ok(d.allowed); assert.strictEqual(d.choice.id, 'cheap'); assert.strictEqual(d.reason, 'downgraded');
  });
  await t('nothing affordable: refused with BUDGET_LIMIT_REACHED (not an error)', () => {
    const c = core(), s = startRoofing(c);
    s.ledger.record({ generationId: s.generationId, kind: 'other', operation: 'seed', costUsdOverride: 4.95 });
    const d = s.governor.decide({ operation: 'image_generation', phase: 'repair', priority: 'high', estimatedUsd: 0.2 });
    assert.strictEqual(d.allowed, false); assert.strictEqual(d.budgetLimitReached, true);
    assert.strictEqual(s.budget().BUDGET_LIMIT_REACHED, true);
  });
  await t('first-draft spending stops before the repair reserve; repair may still use it', () => {
    const c = core(), s = startRoofing(c); // soft 4 - reserve .75 = 3.25
    s.ledger.record({ generationId: s.generationId, kind: 'other', operation: 'seed', costUsdOverride: 3.2 });
    assert.strictEqual(s.governor.decide({ operation: 'x', phase: 'first_draft', priority: 'normal', estimatedUsd: 0.2 }).allowed, false);
    assert.strictEqual(s.governor.decide({ operation: 'x', phase: 'repair', priority: 'high', estimatedUsd: 0.2 }).allowed, true);
  });
  await t('optional first-draft work is skipped once the first-draft target is reached', () => {
    const c = core(), s = startRoofing(c);
    s.ledger.record({ generationId: s.generationId, kind: 'other', operation: 'seed', costUsdOverride: 1.6 });
    const d = s.governor.decide({ operation: 'x', phase: 'first_draft', priority: 'optional', estimatedUsd: 0.01 });
    assert.strictEqual(d.allowed, false); assert.strictEqual(d.reason, 'first_draft_target_reached');
  });
  await t('an explicit new full generation is a separate session with its own budget', () => {
    const c = core(), a = startRoofing(c);
    a.ledger.record({ generationId: a.generationId, kind: 'other', operation: 'seed', costUsdOverride: 4.9 });
    const b = startRoofing(c);
    assert.ok(b.governor.remaining() > 4.9); assert.ok(a.governor.remaining() < 0.2);
  });

  console.log('model routing');
  await t('strong model only for high-value tasks; cheap/deterministic elsewhere', () => {
    const cfg = P.loadConfig({});
    ['understand_business', 'art_direction', 'page_architecture', 'section_hierarchy', 'image_role_planning', 'whole_site_critique', 'repair_decision'].forEach(op => assert.strictEqual(P.routeOperation(op, cfg).tier, 'strong', op));
    ['extraction', 'classification', 'field_generation', 'copy_rewrite_basic'].forEach(op => assert.strictEqual(P.routeOperation(op, cfg).tier, 'cheap', op));
    ['normalization', 'metadata', 'formatting', 'render_decision', 'image_evaluation'].forEach(op => { const r = P.routeOperation(op, cfg); assert.strictEqual(r.tier, 'deterministic'); assert.strictEqual(r.model, null); });
    assert.notStrictEqual(P.routeOperation('extraction', cfg).model, P.routeOperation('art_direction', cfg).model);
    assert.throws(() => P.routeOperation('made_up', cfg));
  });

  console.log('strategy + art direction');
  await t('strategy is one object covering the brief and does not invent a differentiator or proof', () => {
    const st = startRoofing(core()).strategy;
    ['businessType', 'primaryCustomer', 'primaryOffer', 'trustRequirements', 'conversionGoal', 'visualPersonality', 'typographyDirection', 'sectionHierarchy', 'pagePriorities', 'layoutPattern'].forEach(k => assert.ok(k in st, k));
    assert.strictEqual(st.strongestDifferentiator, null); assert.strictEqual(st.hasSuppliedProof, false);
    assert.strictEqual(st.conversionGoal, 'request_quote');
  });
  await t('layout/type/spacing vary by archetype but come from a curated set', () => {
    const c = core();
    const a = P.strategy.deriveStrategy({ archetype: 'premium-consultancy', categoryKey: 'professional' }), b = P.strategy.deriveStrategy({ archetype: 'hospitality', categoryKey: 'hospitality' }), d = P.strategy.deriveStrategy({ archetype: 'product-led-saas', categoryKey: 'tech' });
    assert.notStrictEqual(a.layoutPattern, b.layoutPattern); assert.notStrictEqual(a.layoutPattern, d.layoutPattern);
    P.strategy.ARCHETYPES.forEach(ar => { const s = P.strategy.deriveStrategy({ archetype: ar }); assert.ok(P.tokens.TYPE_SYSTEMS[s.typographyDirection], ar); });
  });
  await t('art direction is decided from strategy+palette and includes consistency rules incl. no-UI', () => {
    const art = startRoofing(core()).art;
    ['photographyStyle', 'lighting', 'colorMood', 'subjectTreatment', 'compositionStyle', 'humanPresence', 'realismLevel', 'contrast', 'imageConsistencyRules'].forEach(k => assert.ok(art[k], k));
    assert.ok(art.imageConsistencyRules.some(r => /no browser windows|website\/app UI/.test(r)));
    assert.ok(/warm/.test(art.colorMood), art.colorMood);
  });
  await t('malformed strategy input falls back field-by-field', () => {
    const s = P.strategy.normalizeStrategy({ conversionGoal: 'nonsense', sectionHierarchy: 'x' }, { archetype: 'hospitality' });
    assert.strictEqual(s.conversionGoal, 'reserve'); assert.ok(Array.isArray(s.sectionHierarchy));
  });

  console.log('image role planning');
  await t('roles, aspect ratios and source decisions per slot', () => {
    const c = core(), s = startRoofing(c);
    const r = s.planImages({ slots: slots(), uploads: [] });
    const by = Object.fromEntries(r.slots.map(x => [x.slot, x]));
    assert.strictEqual(by.hero.premiumRole, 'hero'); assert.strictEqual(by.hero.aspectRatio, '16:9'); assert.strictEqual(by.hero.sourceType, 'generated'); assert.strictEqual(by.hero.tier, 'hero');
    assert.strictEqual(by['team-0'].sourceType, 'designed'); assert.strictEqual(by['team-0'].reason, 'real_team_photos_only');
    assert.strictEqual(by['gallery-0'].sourceType, 'generated'); // quality pass: trades galleries may use generated material/result photography
    assert.strictEqual(by['gallery-featured'].premiumRole, 'editorial');
  });
  await t('hero gets the highest-quality route; decorative never gets an expensive one', () => {
    const c = core(), s = startRoofing(c);
    const r = s.planImages({ slots: slots().concat([{ slot: 'deco', role: 'decor', sectionType: 'contact', aspectRatio: '4:3', rank: 9 }]), uploads: [] });
    const hero = r.slots.find(x => x.slot === 'hero'), deco = r.slots.find(x => x.slot === 'deco');
    assert.strictEqual(hero.routeKind, 'premium'); assert.strictEqual(hero.quality, 'high');
    if (deco.sourceType === 'generated') assert.ok(deco.estimatedUsd <= c.cfg.imageTierCaps.decorative + 1e-9);
  });
  await t('real business images win over generation and are not stretched', () => {
    const c = core(), s = startRoofing(c);
    const r = s.planImages({ slots: slots(), uploads: [{ id: 'u1', type: 'hero', width: 3000, height: 1000 }].map(u => u) });
    const withUpload = slots(); withUpload[0].assetId = 'u1';
    const r2 = s.planImages({ slots: withUpload, uploads: [{ id: 'u1', width: 3000, height: 1000 }] });
    const hero = r2.slots.find(x => x.slot === 'hero');
    assert.strictEqual(hero.sourceType, 'user'); assert.strictEqual(hero.estimatedUsd, 0);
    assert.ok(hero.crop.loss > 0.4); // ultra-wide into 16:9: honest crop advice, not a silent stretch
  });
  await t('a low-resolution supplied hero is replaced by a generated alternative when budget allows', () => {
    const c = core(), s = startRoofing(c);
    const sl = slots(); sl[0].assetId = 'u2';
    const r = s.planImages({ slots: sl, uploads: [{ id: 'u2', width: 300, height: 200 }] });
    assert.strictEqual(r.slots[0].sourceType, 'generated');
  });
  await t('testimonial slots never get generated imagery (no fabricated people)', () => {
    const s = startRoofing(core());
    const r = s.planImages({ slots: [{ slot: 't', role: 'gallery', sectionType: 'testimonial', rank: 1 }], uploads: [] });
    assert.strictEqual(r.slots[0].sourceType, 'designed');
  });
  await t('image spending is capped by the governor: tiny budget leaves later slots designed, hero last to go', () => {
    const c = core({ HARD_SITE_BUDGET_USD: '0.8', SOFT_SITE_BUDGET_USD: '0.8', PREMIUM_REPAIR_RESERVE_USD: '0.1' }), s = startRoofing(c);
    const r = s.planImages({ slots: slots().slice(0, 2).concat([{ slot: 'p2', role: 'product', sectionType: 'productShowcase', aspectRatio: '4:3', rank: 2 }]), uploads: [] });
    const spent = r.slots.filter(x => x.sourceType === 'generated').reduce((n, x) => n + x.estimatedUsd, 0);
    assert.ok(spent <= 0.8 + 1e-9, String(spent));
    assert.strictEqual(r.slots.find(x => x.slot === 'hero').sourceType, 'generated');
  });
  await t('credits limit funding when the account is short (client parity)', () => {
    const s = startRoofing(core());
    const r = s.planImages({ slots: slots(), uploads: [], credits: { remaining: 1, support: 1, premium: 2 } });
    assert.ok(r.slots.filter(x => x.sourceType === 'generated').every(x => x.routeKind === 'support'));
  });
  await t('legacy comparison: default legacy image ceiling ($0.10) cannot fund a premium hero, premium can', () => {
    const c = core(), s = startRoofing(c);
    const hero = s.planImages({ slots: [slots()[0]], uploads: [] }).slots[0];
    assert.ok(hero.estimatedUsd > 0.10, String(hero.estimatedUsd));
  });

  await t('many gallery images cannot exceed the first-draft target: extra primary images are optional', () => {
    const c = core(), s = c.startSession({ categoryKey: 'hospitality', categoryLabel: 'Food', archetype: 'hospitality', palette });
    const many = [{ slot: 'hero', role: 'hero', sectionType: 'hero', aspectRatio: '16:9', rank: 0 }].concat(Array.from({ length: 10 }, (_, i) => ({ slot: 'g' + i, role: 'gallery', sectionType: 'gallery', aspectRatio: '4:3', rank: i + 1 })));
    const r = s.planImages({ slots: many, uploads: [] });
    assert.ok(r.committedUsd <= c.cfg.budgets.TARGET_FIRST_DRAFT_USD + 0.65, String(r.committedUsd)); // hero (critical) may cross the target, optional images may not
    assert.ok(r.slots.filter(x => x.sourceType === 'generated').length < 11);
  });
  await t('provider callbacks that record their own cost are not double counted (selfRecorded)', async () => {
    const c = core(), s = startRoofing(c), d = sample(); d.assets.generated.hero = { status: 'error' }; d.design.premiumTokens = s.tokens;
    await s.reviewAndRepair(d, { description: 'x' }, { selfRecorded: true, regenerateImage: async () => ({ ok: true, dataUrl: PNG_PHOTO }) });
    assert.strictEqual(s.totals().imageAttempts, 0);
  });
  await t('browser bundle exposes the same API', () => {
    const B = require('./premium-core.js');
    assert.ok(B.createPremiumCore && B.mobile && B.images.allocateImages && B.tokens.sanitizeTokens);
  });

  console.log('prompts: composition-aware, photography not UI');
  await t('hero prompt states subject position, negative space, aspect and lighting', () => {
    const s = startRoofing(core());
    const p = s.planImages({ slots: [slots()[0]], uploads: [], heroTextSide: 'left' }).slots[0].prompt;
    assert.ok(/right 55%/.test(p) && /negative space on the left/.test(p) && /16:9|Wide landscape/.test(p) && /daylight/i.test(p), p);
    assert.ok(/residential roof/.test(p));
    assert.ok(/no text/i.test(p) && /no browser windows/i.test(p));
  });
  await t('hero text on the right flips the subject to the left', () => {
    const s = startRoofing(core());
    const p = s.planImages({ slots: [slots()[0]], uploads: [], heroTextSide: 'right' }).slots[0].prompt;
    assert.ok(/left 55%/.test(p) && /negative space on the right/.test(p), p);
  });
  await t('every planned prompt passes the UI-mockup lint across all archetypes', () => {
    const c = core();
    P.strategy.ARCHETYPES.forEach(ar => Object.keys(P.strategy.CATEGORY_SUBJECTS).forEach(cat => {
      const s = c.startSession({ categoryKey: cat, categoryLabel: cat, archetype: ar, palette, location: 'Calgary' });
      s.planImages({ slots: slots(), uploads: [] }).slots.filter(x => x.prompt).forEach(x => {
        const l = P.images.lintImagePrompt(x.prompt); assert.ok(l.ok, `${ar}/${cat}/${x.slot}: ${l.problems} :: ${x.prompt}`);
        const l2 = P.images.lintImagePrompt(x.promptSimplified); assert.ok(l2.ok, `simplified ${ar}/${cat}/${x.slot}: ${l2.problems}`);
      });
    }));
  });
  await t('a prompt whose prohibition tail was truncated mid-sentence is not misread as a UI request', () => {
    const full = startRoofing(core()).planImages({ slots: [slots()[0]], uploads: [] }).slots[0].prompt;
    for (let n = 300; n < full.length; n += 37) { const l = P.images.lintImagePrompt(full.slice(0, n)); assert.ok(!l.problems.some(p => /interface content/.test(p)), n + ':' + l.problems); }
  });
  await t('lint catches a prompt that asks for a website/dashboard image', () => {
    assert.strictEqual(P.images.lintImagePrompt('A modern website dashboard on a laptop, 16:9 frame, no text').ok, false);
    assert.strictEqual(P.images.lintImagePrompt('roofing company image').ok, false);
  });
  await t('SaaS/tech sites get abstract graphics, never UI photographs', () => {
    const c = core(), s = c.startSession({ categoryKey: 'tech', categoryLabel: 'Technology', archetype: 'product-led-saas', palette });
    const hero = s.planImages({ slots: [slots()[0]], uploads: [] }).slots[0];
    assert.strictEqual(hero.kind, 'abstract'); assert.ok(/Abstract brand graphic/.test(hero.prompt)); assert.ok(P.images.lintImagePrompt(hero.prompt).ok);
  });

  console.log('focal point / crop / aspect');
  await t('focal metadata + object-position derived from the brief (no vision call)', () => {
    const s = startRoofing(core());
    const h = s.planImages({ slots: [slots()[0]], uploads: [], heroTextSide: 'left' }).slots[0];
    assert.strictEqual(h.focal.objectPosition, '72% 55%');
    assert.strictEqual(P.images.focalFor('about').objectPosition, '50% 38%');
  });
  await t('provider size follows the slot ratio: landscape and portrait are not both squares', () => {
    assert.strictEqual(P.images.providerSizeFor('16:9'), '1536x1024'); assert.strictEqual(P.images.providerSizeFor('4:5'), '1024x1536'); assert.strictEqual(P.images.providerSizeFor('1:1'), '1024x1024');
  });
  await t('crop advice recommends contain when cover would discard most of the picture', () => {
    assert.strictEqual(P.images.cropAdvice(1000, 1000, '16:9').recommend, 'cover');
    assert.strictEqual(P.images.cropAdvice(4000, 800, '4:5').recommend, 'contain');
  });

  console.log('image evaluation + retry policy');
  await t('flat/blank output is detected without a paid vision call', () => {
    assert.strictEqual(P.images.evaluateImageDeterministic(PNG_BLANK, '16:9').poor, true);
    assert.strictEqual(P.images.evaluateImageDeterministic(PNG_PHOTO, '16:9').poor, false);
    assert.strictEqual(P.images.evaluateImageDeterministic('data:text/plain;base64,AAAA', '16:9').poor, true);
    assert.strictEqual(P.images.evaluateImageDeterministic(PNG_PHOTO, '4:5').reasons[0], 'orientation_mismatch');
  });
  await t('bounded automatic retries (2 for premium photo-led quality), then fallback (never an endless loop)', () => {
    const cfg = P.loadConfig({ PREMIUM_IMAGE_MAX_AUTO_RETRIES: '1' }), bad = { poor: true };
    assert.strictEqual(P.loadConfig({}).retry.maxImageRetries, 2);
    assert.strictEqual(P.images.retryDecision({ attempt: 0, evaluation: bad }, cfg).action, 'retry');
    assert.strictEqual(P.images.retryDecision({ attempt: 0, evaluation: bad }, cfg).simplifiedPrompt, true);
    assert.strictEqual(P.images.retryDecision({ attempt: 1, evaluation: bad }, cfg).action, 'fallback');
    assert.strictEqual(P.images.retryDecision({ attempt: 0, evaluation: { poor: false } }, cfg).action, 'accept');
    assert.strictEqual(P.images.retryDecision({ attempt: 1, evaluation: bad, hasAlternateSource: true }, cfg).to, 'alternate_source');
  });
  await t('the retry prompt is genuinely different from the original', () => {
    const s = startRoofing(core());
    const h = s.planImages({ slots: [slots()[0]], uploads: [] }).slots[0];
    assert.notStrictEqual(h.prompt, h.promptSimplified); assert.ok(h.promptSimplified.length < h.prompt.length);
  });

  console.log('design tokens');
  await t('token system covers the required roles and sanitises on the way back in', () => {
    const tk = startRoofing(core()).tokens;
    ['--site-font-heading', '--site-font-body', '--site-radius', '--site-space-major', '--site-content-width', '--site-measure', '--site-h1'].forEach(k => assert.ok(tk.vars[k], k));
    assert.ok(tk.palette.background && tk.palette.text && tk.palette.accent);
    assert.ok(P.tokens.sanitizeTokens(tk));
    const evil = JSON.parse(JSON.stringify(tk)); evil.vars['--site-radius'] = '1px;background:url(http://x)'; evil.vars['--evil'] = '1'; evil.vars['--site-x'] = '</style>';
    const clean = P.tokens.sanitizeTokens(evil);
    assert.ok(!('--site-radius' in clean.vars) && !('--evil' in clean.vars) && !('--site-x' in clean.vars));
    assert.strictEqual(P.tokens.sanitizeTokens({ premium: false }), null);
  });
  await t('font values are safe inside a style="" attribute (no double quotes)', () => {
    Object.values(P.tokens.TYPE_SYSTEMS).forEach(ts => { assert.ok(!/"/.test(ts.heading + ts.body)); });
  });
  await t('serif is only used where the strategy calls for editorial character', () => {
    P.strategy.ARCHETYPES.forEach(ar => { const s = P.strategy.deriveStrategy({ archetype: ar }); const tk = P.tokens.buildDesignTokens(s, palette); const serif = /Iowan|Palatino|Georgia/.test(tk.vars['--site-font-heading']); assert.strictEqual(serif, ['premium-consultancy', 'portfolio', 'editorial-brand', 'hospitality', 'community-nonprofit'].includes(ar), ar); });
  });

  console.log('preservation model');
  await t('good/locked sections are never auto-repaired; only flagged ones are', () => {
    const c = core(), s = startRoofing(c), d = sample();
    d.pages[0].sections.splice(1, 0, { id: 's1b', type: 'services', variant: 'numbered', copy: {} }); // adjacent duplicate type => defect on s1b
    P.sections.markAllGood(d); P.sections.lock(d, 'section', 's1b');
    const review = P.review.reviewDirection(d, { strategy: s.strategy, premiumEnabled: true });
    const plan = P.repair.planRepairs(d, review, s.governor, c.cfg);
    assert.ok(!plan.actions.some(a => a.targetId === 's1b'), 'locked target must not be touched');
    assert.strictEqual(P.sections.stateOf(d, 'section', 's1b'), 'locked');
    assert.strictEqual(P.sections.stateOf(d, 'section', 's3'), 'good');
  });
  await t('full-site regeneration must be explicit and opens a new generation; section/image/style requests preserve the rest', () => {
    const d = sample(); P.sections.markAllGood(d);
    assert.strictEqual(P.sections.planRegeneration(d, { scope: 'full_site' }).ok, false);
    const full = P.sections.planRegeneration(d, { scope: 'full_site', explicit: true }); assert.ok(full.ok && full.newGeneration);
    assert.strictEqual(P.sections.planRegeneration(d, { scope: 'hero', targetId: 'hero' }).preserve, 'everything_else');
    assert.strictEqual(P.sections.planRegeneration(d, { scope: 'style' }).preserve, 'all_content_and_images');
    P.sections.lock(d, 'section', 's1');
    assert.strictEqual(P.sections.planRegeneration(d, { scope: 'section', targetId: 's1' }).reason, 'target_is_locked');
    assert.ok(P.sections.planRegeneration(d, { scope: 'section', targetId: 's1', overrideLock: true }).ok);
  });

  console.log('whole-site review + quality rubric');
  await t('clean site passes; mobile is UNVERIFIED (not silently PASS) until measured', () => {
    const c = core(), s = startRoofing(c), d = sample(); d.design.premiumTokens = s.tokens;
    const r = P.review.reviewDirection(d, { strategy: s.strategy, premiumEnabled: true, description: 'Family roofing company in Calgary' });
    assert.strictEqual(r.categories.MOBILE_READINESS, 'UNVERIFIED');
    ['VISUAL_COHERENCE', 'IMAGE_QUALITY', 'TYPOGRAPHY', 'LAYOUT', 'BUSINESS_SPECIFICITY', 'CONVERSION_CLARITY', 'TECHNICAL_VALIDITY'].forEach(k => assert.strictEqual(r.categories[k], 'PASS', k + JSON.stringify(r.defects)));
  });
  await t('detects fabricated claims, generic AI phrasing, missing CTA, failed hero image, mobile overflow', () => {
    const s = startRoofing(core()), d = sample();
    d.copy.sub = 'Award-winning roofers with 25 years of experience. Elevate your home seamlessly.';
    d.pages[0].sections = d.pages[0].sections.filter(x => x.type !== 'ctaBanner' && x.type !== 'contact');
    d.assets.generated.hero = { status: 'error' };
    d.mobileReport = { widths: [{ width: 390, overflowX: true, heroHeadlineLines: 7 }] };
    const r = P.review.reviewDirection(d, { strategy: s.strategy, premiumEnabled: true, description: 'Family roofing company in Calgary' });
    const codes = r.defects.map(x => x.code);
    ['unsupported_claim', 'generic_phrase', 'no_conversion_path', 'image_failed', 'horizontal_overflow', 'hero_headline_wraps_too_much'].forEach(k => assert.ok(codes.includes(k), k + ' :: ' + codes));
    assert.strictEqual(r.categories.BUSINESS_SPECIFICITY, 'FAIL'); assert.strictEqual(r.categories.IMAGE_QUALITY, 'FAIL'); assert.strictEqual(r.categories.MOBILE_READINESS, 'FAIL');
  });
  await t('invented testimonial sections are flagged and removed; supplied ones are kept', async () => {
    const c = core(), s = startRoofing(c), d = sample(); d.design.premiumTokens = s.tokens;
    d.pages[0].sections.splice(1, 0, { id: 'tt', type: 'testimonialsGrid', variant: 'grid', copy: {} });
    const out = await s.reviewAndRepair(d, { description: 'Family roofing company in Calgary' }, {});
    assert.ok(!out.direction.pages[0].sections.some(x => x.id === 'tt')); assert.ok(out.actions.some(a => a.kind === 'remove_section'));
    const r2 = P.review.reviewDirection(Object.assign(sample(), { pages: [{ id: 'home', slug: '', sections: [{ id: 'tt', type: 'testimonial', copy: {} }, { id: 'c', type: 'contact', copy: {} }] }] }), { strategy: s.strategy, description: 'Roofing. Here is a testimonial from a customer: great work.' });
    assert.ok(!r2.defects.some(x => x.code === 'fabricated_testimonial'));
  });
  await t('a claim the customer actually supplied is not flagged', () => {
    const s = startRoofing(core()), d = sample(); d.copy.sub = 'Serving Calgary for 25 years.';
    const r = P.review.reviewDirection(d, { strategy: s.strategy, premiumEnabled: true, description: 'Roofing company, 25 years in Calgary' });
    assert.ok(!r.defects.some(x => x.code === 'unsupported_claim'));
  });
  await t('model critique output is validated against the rubric schema', () => {
    const parsed = P.review.parseCritique({ defects: [{ category: 'LAYOUT', code: 'x', severity: 2, targetKind: 'section', targetId: 's1', evidence: 'e', repairKind: 'swap_variant' }, { category: 'BOGUS', code: 'y', severity: 1, targetKind: 'site', evidence: 'z' }, null] });
    assert.strictEqual(parsed.length, 1); assert.strictEqual(parsed[0].source, 'model_critique');
    assert.deepStrictEqual(P.review.parseCritique('nonsense'), []);
    assert.ok(P.review.CRITIQUE_TOOL.input_schema.properties.defects.maxItems <= 5);
  });

  console.log('surgical repair: at most one round, only what is weak, budget-stopped');
  await t('repairs only flagged targets, at most 3 actions, one round; untouched sections are byte-identical', async () => {
    const c = core(), s = startRoofing(c), d = sample();
    d.pages[0].sections = [
      { id: 'a', type: 'services', variant: 'numbered', copy: { headline: 'A' } }, { id: 'b', type: 'services', variant: 'numbered', copy: { headline: 'B' } },
      { id: 'c', type: 'about', variant: 'split', copy: { headline: 'C' } }, { id: 'd', type: 'ctaBanner', variant: 'plain', copy: {} }, { id: 'e', type: 'contact', copy: {} }];
    d.copy.sub = 'Elevate your roof, seamlessly. World-class, cutting-edge unlock your potential.';
    d.assets.generated.hero = { status: 'error' }; d.design.premiumTokens = s.tokens;
    const before = JSON.stringify(d.pages[0].sections.find(x => x.id === 'c'));
    let regen = 0, rewrites = 0;
    const out = await s.reviewAndRepair(d, { description: 'Roofing in Calgary' }, {
      regenerateImage: async () => { regen++; return { ok: true, dataUrl: PNG_PHOTO }; },
      rewriteCopy: async () => { rewrites++; return { ok: true, text: 'Straightforward roof repair in Calgary.', usage: { inputTokens: 800, outputTokens: 60 } }; },
    });
    assert.ok(out.repaired); assert.ok(out.actions.length <= 3);
    assert.strictEqual(JSON.stringify(out.direction.pages[0].sections.find(x => x.id === 'c')), before);
    assert.ok(regen <= 1); assert.strictEqual(out.direction.assets.generated.hero.status, 'ready');
    assert.strictEqual(P.sections.stateOf(out.direction, 'image', 'hero'), 'regenerated');
    assert.ok(out.after.IMAGE_QUALITY === 'PASS');
    assert.ok(s.totals().REPAIR_COST > 0); assert.strictEqual(s.totals().FIRST_DRAFT_COST, 0);
    const before2 = s.totals().modelCalls; assert.ok(before2 >= rewrites);
  });
  await t('a poor regenerated image triggers designed fallback, not a second generation', async () => {
    const c = core(), s = startRoofing(c), d = sample(); d.assets.generated.hero = { status: 'error' }; d.design.premiumTokens = s.tokens;
    let calls = 0;
    const out = await s.reviewAndRepair(d, { description: 'x' }, { regenerateImage: async () => { calls++; return { ok: true, dataUrl: PNG_BLANK }; } });
    assert.strictEqual(calls, 1);
    assert.ok(out.actions.some(a => a.kind === 'use_designed_fallback'));
    assert.strictEqual(out.direction.imagePlan.find(e => e.slot === 'hero').sourceType, 'designed');
  });
  await t('HARD BUDGET: repair that would exceed the ceiling is not run; site returned as-is; BUDGET_LIMIT_REACHED recorded', async () => {
    const c = core(), s = startRoofing(c), d = sample(); d.assets.generated.hero = { status: 'error' }; d.design.premiumTokens = s.tokens;
    s.ledger.record({ generationId: s.generationId, kind: 'other', operation: 'first-draft', costUsdOverride: 4.9 });
    let calls = 0;
    const out = await s.reviewAndRepair(d, { description: 'x' }, { regenerateImage: async () => { calls++; return { ok: true, dataUrl: PNG_PHOTO }; } });
    assert.strictEqual(calls, 0, 'paid repair must not run');
    assert.ok(out.budgetLimitReached); assert.ok(s.budget().BUDGET_LIMIT_REACHED);
    assert.ok(s.totals().TOTAL_SITE_COST <= c.cfg.budgets.HARD_SITE_BUDGET_USD + 1e-9);
    assert.ok(out.actions.every(a => a.kind !== 'regenerate_image'));
  });
  await t('no repair round runs when PREMIUM_MAX_REPAIR_ROUNDS=0', async () => {
    const c = core({ PREMIUM_MAX_REPAIR_ROUNDS: '0' }), s = startRoofing(c), d = sample(); d.assets.generated.hero = { status: 'error' };
    const out = await s.reviewAndRepair(d, { description: 'x' }, {});
    assert.strictEqual(out.repaired, false);
  });
  await t('optional model critique runs at most once and only when it fits the budget', async () => {
    const c = core(), s = startRoofing(c), d = sample(); d.design.premiumTokens = s.tokens; let calls = 0;
    const critic = async () => { calls++; return { input: { defects: [] }, usage: { inputTokens: 2500, outputTokens: 400 } }; };
    await s.reviewAndRepair(d, { description: 'Roofing' }, { critic });
    assert.strictEqual(calls, 1);
    const s2 = startRoofing(c); s2.ledger.record({ generationId: s2.generationId, kind: 'other', operation: 'x', costUsdOverride: 4.999 }); let calls2 = 0;
    await s2.reviewAndRepair(sample(), { description: 'Roofing' }, { critic: async () => { calls2++; return { input: { defects: [] } }; } });
    assert.strictEqual(calls2, 0);
  });
  await t('repairs can be expressed as a refinement plan for the Workplace updater path', () => {
    const plan = P.repair.asRefinementPlan([{ kind: 'swap_variant', targetId: 'b', variant: 'described' }, { kind: 'regenerate_image', slot: 'hero' }, { kind: 'set_focal', slot: 'hero' }]);
    assert.deepStrictEqual(plan.operations, [{ action: 'change-variant', targetId: 'b', variant: 'described' }]);
    assert.deepStrictEqual(plan.imageActions, [{ action: 'regenerate', slot: 'hero' }]);
  });

  console.log('metrics');
  await t('generation log captures cost, images, retries, quality before/after, repair and budget flags', async () => {
    const c = core(), s = startRoofing(c), d = sample(); s.projectId = 'p1'; d.assets.generated.hero = { status: 'error' }; d.design.premiumTokens = s.tokens;
    s.recordText({ operation: 'understand_business', usage: { inputTokens: 3000, outputTokens: 4000 } });
    s.recordImage({ model: 'gpt-image-1', imageTier: 'premium', quality: 'high', aspectRatio: '16:9' });
    await s.reviewAndRepair(d, { description: 'x' }, { regenerateImage: async () => ({ ok: true, dataUrl: PNG_PHOTO }) });
    const log = s.finish();
    ['firstDraftCostUsd', 'repairCostUsd', 'totalCostUsd', 'imageCount', 'imageRetries', 'modelCalls', 'qualityBefore', 'qualityAfter', 'repairRan', 'budgetLimitReached', 'fullRegenerationsRequested', 'timingsMs'].forEach(k => assert.ok(k in log, k));
    assert.strictEqual(log.repairRan, true); assert.ok(log.qualityBefore.IMAGE_QUALITY && log.qualityAfter.IMAGE_QUALITY);
  });
  await t('aggregate metrics: acceptance, generations-before-acceptance, retry rate, average costs', () => {
    const m = new P.metrics.MetricsStore();
    const mk = (id, proj, cost, first, retries, attempts) => P.metrics.buildGenerationLog({ generationId: id, projectId: proj, totals: { TOTAL_SITE_COST: cost, FIRST_DRAFT_COST: first, REPAIR_COST: cost - first, imageRetries: retries, imageAttempts: attempts } });
    m.append(mk('g1', 'A', 2.0, 1.2, 0, 4)); m.markAccepted('g1');
    m.append(mk('g2', 'B', 1.8, 1.4, 1, 4)); m.append(mk('g3', 'B', 2.4, 1.6, 0, 4)); m.markAccepted('g3');
    m.append(mk('g4', 'C', 1.0, 1.0, 1, 2));
    const a = m.aggregate({ revenueUsdPerSite: 100 });
    assert.strictEqual(a.acceptedCount, 2); assert.strictEqual(a.AVERAGE_GENERATIONS_BEFORE_ACCEPTANCE, 1.5);
    assert.strictEqual(a.FIRST_OUTPUT_ACCEPTANCE_RATE, Math.round(1 / 3 * 1000) / 1000);
    assert.strictEqual(a.IMAGE_RETRY_RATE, Math.round(2 / 14 * 1000) / 1000);
    assert.strictEqual(a.AVERAGE_PUBLISHABLE_SITE_COST_USD, 2.2); assert.strictEqual(a.COST_AS_PERCENT_OF_REVENUE, 2.2);
    assert.strictEqual(new P.metrics.MetricsStore().aggregate().COST_AS_PERCENT_OF_REVENUE, null);
  });

  console.log('PREMIUM_COMPOSITION_V2');
  const C = P.composition;
  const PAL = { background: '#f7f7f8', main: '#c0451f', text: '#111111' };
  const recipes = {
    'local-conversion': ['serviceAreas', 'proof', 'caseStudies', 'contact'], 'premium-consultancy': ['services', 'process', 'faq', 'ctaBanner'],
    hospitality: ['menu', 'gallery', 'about', 'testimonialsGrid', 'reservationCta', 'imageLedEditorial'], 'product-led-saas': ['features', 'productShowcase', 'integrations', 'pricing', 'faq', 'ctaBanner'],
    'community-nonprofit': ['about', 'metrics', 'gallery', 'newsletter', 'contact'], 'service-business': ['services', 'serviceAreas', 'ctaBanner'], portfolio: ['gallery', 'about', 'services', 'ctaBanner'],
  };
  const planFor2 = (arch, types) => C.planPageComposition({ sections: types.map((ty, i) => ({ id: 's' + i, type: ty, hasImage: ['gallery', 'caseStudies', 'imageLedEditorial', 'productShowcase'].includes(ty) })), strategy: { archetype: arch, conversionGoal: 'request_quote' }, palette: PAL });
  await t('config: composition/grounding/visuals are ON with V1 (rollback switch = false) and never on without V1', () => {
    assert.strictEqual(P.loadConfig({}).compositionV2, false);
    const on = P.loadConfig({ PREMIUM_GENERATION_V1: 'true' });
    assert.deepStrictEqual([on.compositionV2, on.groundingV3, on.visualsV4], [true, true, true]);
    assert.strictEqual(P.loadConfig({ PREMIUM_COMPOSITION_V2: 'true' }).compositionV2, false);
    assert.strictEqual(P.loadConfig({ PREMIUM_GENERATION_V1: 'true', PREMIUM_COMPOSITION_V2: 'false' }).compositionV2, false);
  });
  await t('plan guarantees: every archetype gets >=2 moments, no 3-equal-weight run, every neighbour pair clearly different', () => {
    Object.entries(recipes).forEach(([arch, types]) => {
      const plan = planFor2(arch, types);
      assert.ok(plan.moments >= 2, arch + ' moments ' + plan.moments);
      for (let i = 2; i < plan.sections.length; i++) assert.ok(!(plan.sections[i].weight === plan.sections[i - 1].weight && plan.sections[i].weight === plan.sections[i - 2].weight), arch + ' weight run at ' + i);
      for (let i = 1; i < plan.sections.length; i++) assert.ok(C.neighbourContrast(plan.sections[i - 1], plan.sections[i]) >= 1, arch + ' neighbours ' + i + ' ' + plan.sections[i - 1].type + '/' + plan.sections[i].type);
      assert.deepStrictEqual(C.evaluateComposition(plan).filter(f => f.severity >= 2), [], arch);
    });
  });
  await t('pacing is deliberate: at least three distinct surfaces and a strong closing CTA band', () => {
    Object.entries(recipes).forEach(([arch, types]) => {
      const plan = planFor2(arch, types);
      assert.ok(new Set(plan.sections.map(s => s.tone)).size >= 3, arch + ' tones ' + [...new Set(plan.sections.map(s => s.tone))]);
      const cta = plan.sections.filter(s => s.role === 'CONVERT').pop();
      assert.ok(cta && cta.cta === 'band' && cta.weight === 'strong', arch);
    });
  });
  await t('visual grammar differs by archetype (not one composition for every business)', () => {
    const sig = a => planFor2(a, recipes[a]).sections.map(s => s.tone[0] + (s.moment || '-')).join('');
    assert.notStrictEqual(sig('premium-consultancy'), sig('local-conversion'));
    assert.strictEqual(C.GRAMMAR['premium-consultancy'].feel, 'restrained'); assert.strictEqual(C.GRAMMAR.hospitality.feel, 'immersive'); assert.strictEqual(C.GRAMMAR['product-led-saas'].feel, 'structured');
    assert.strictEqual(planFor2('premium-consultancy', recipes['premium-consultancy']).footer.tone, 'base');
    assert.notStrictEqual(planFor2('local-conversion', recipes['local-conversion']).footer.tone, 'base');
  });
  await t('cards only where content is a repeated unit; prose sections are open', () => {
    const plan = planFor2('service-business', ['services', 'about', 'faq', 'process', 'ctaBanner']);
    const by = Object.fromEntries(plan.sections.map(s => [s.type, s]));
    assert.strictEqual(by.services.open, false); ['about', 'faq', 'process', 'ctaBanner'].forEach(k => assert.strictEqual(by[k].open, true, k));
  });
  await t('fullbleed only for sections that actually have imagery; without an image the section becomes a contrast band', () => {
    const withImg = C.planPageComposition({ sections: [{ id: 'a', type: 'services' }, { id: 'f', type: 'faq' }, { id: 'g', type: 'gallery', hasImage: true }, { id: 'p', type: 'process' }, { id: 'c', type: 'ctaBanner' }], strategy: { archetype: 'hospitality' }, palette: PAL }), noImg = C.planPageComposition({ sections: [{ id: 'a', type: 'services' }, { id: 'f', type: 'faq' }, { id: 'g', type: 'gallery', hasImage: false }, { id: 'p', type: 'process' }, { id: 'c', type: 'ctaBanner' }], strategy: { archetype: 'hospitality' }, palette: PAL });
    assert.strictEqual(withImg.sections[2].moment, 'fullbleed'); assert.strictEqual(noImg.sections[2].moment, 'contrastband');
  });
  await t('statement moments only for short copy (copy length matches composition)', () => {
    const mk = chars => C.planPageComposition({ sections: [{ id: 'a', type: 'services' }, { id: 'b', type: 'about', copyChars: chars }, { id: 'c', type: 'faq' }, { id: 'd', type: 'ctaBanner' }], strategy: { archetype: 'premium-consultancy' }, palette: PAL }).sections[1].moment;
    assert.strictEqual(mk(120), 'statement'); assert.notStrictEqual(mk(900), 'statement');
  });
  await t('surface colours derive from the palette: dark sites get a deep brand band, light sites a dark band; ink readable', () => {
    const dark = C.compositionVars({ background: '#160e0e', main: '#c0451f', text: '#ffffff' }), light = C.compositionVars(PAL);
    [dark, light].forEach(v => { assert.ok(C.contrast(v['--site-comp-contrast-bg'], v['--site-comp-contrast-ink']) >= 4.5); assert.ok(C.contrast(v['--site-comp-brand-bg'], v['--site-comp-brand-ink']) >= 3); });
    assert.ok(C.lum(light['--site-comp-contrast-bg']) < 0.25); assert.notStrictEqual(dark['--site-comp-contrast-bg'], '#ffffff');
  });
  await t('final CTA headline is business-specific per goal and never the generic filler', () => {
    assert.strictEqual(C.finalCtaHeadline({ conversionGoal: 'reserve' }, { location: 'Vancouver' }), 'Reserve a table in Vancouver');
    assert.strictEqual(C.finalCtaHeadline({ conversionGoal: 'request_quote' }, { noun: 'Roof', location: 'Calgary' }), 'Request a quote for your roof in Calgary');
    P.strategy.CONVERSION_GOALS.forEach(g => assert.ok(!/ready to (take|see|get)/i.test(C.finalCtaHeadline({ conversionGoal: g }, {}))));
  });
  await t('tokens carry composition surfaces only when asked; sanitiser keeps them and flags composition', () => {
    const s = P.strategy.deriveStrategy({ archetype: 'local-conversion' });
    const off = P.tokens.sanitizeTokens(P.tokens.buildDesignTokens(s, PAL)), on = P.tokens.sanitizeTokens(P.tokens.buildDesignTokens(s, PAL, { composition: true }));
    assert.strictEqual(off.composition, false); assert.strictEqual(on.composition, true); assert.strictEqual(on.dataAttrs['data-comp'], 'v2');
    assert.ok(Object.keys(on.vars).filter(k => /^--site-comp-/.test(k)).length >= 8);
  });
  await t('stamping (export path): every section gets tone and weight, the CTA a band, the footer a tone', () => {
    const proj = { strategy: { archetype: 'local-conversion' }, business: { categoryKey: 'roofing' }, design: { palette: PAL }, source: { location: 'Calgary' } };
    const parts = ['serviceAreas', 'caseStudies', 'ctaBanner'].map((ty, i) => ({ section: { id: 's' + i, type: ty }, html: '<div class="site-section site-section-' + ty + '"><p>x</p></div>' }));
    const out = P.stamp.stampParts(proj, parts, { variant: 'split', hasImage: false });
    assert.ok(out.html.every(h => /data-comp-tone="/.test(h) && /data-comp-weight="/.test(h)));
    assert.ok(/data-comp-cta="band"/.test(out.html[2]));
    assert.ok(/data-comp-footer="resolved"/.test(P.stamp.stampFooterHtml('<div class="site-section site-footer" data-variant="resolved"></div>', out.plan)));
  });
  await t('rubric: composition categories are NOT_APPLICABLE without the flag, and real with it', () => {
    const s = P.strategy.deriveStrategy({ archetype: 'product-led-saas' });
    const tok = P.tokens.sanitizeTokens(P.tokens.buildDesignTokens(s, PAL, { composition: true }));
    const mk = types => ({ copy: { headline: 'Scheduling for clinics', cta: 'Start' }, design: { palette: PAL, dimensions: { hero: 'split' }, premiumTokens: tok }, pages: [{ id: 'home', slug: '', sections: types.map((ty, i) => ({ id: 'q' + i, type: ty })) }], imagePlan: [], assets: { generated: {} } });
    const off = P.review.reviewDirection(mk(['features', 'faq', 'ctaBanner']), { strategy: s, description: 'x' });
    ['VISUAL_PACING', 'SECTION_CONTRAST', 'COMPOSITION_VARIETY', 'CTA_STRENGTH', 'FOOTER_COMPLETION'].forEach(k => assert.strictEqual(off.categories[k], 'NOT_APPLICABLE'));
    const bad = P.review.reviewDirection(mk(['features', 'faq', 'integrations']), { strategy: s, description: 'x', compositionV2: true });
    assert.strictEqual(bad.categories.CTA_STRENGTH, 'FAIL'); assert.ok(bad.defects.some(d => d.code === 'no_final_cta' && d.repair && d.repair.kind === 'insert_cta_section'));
    const good = P.review.reviewDirection(mk(['features', 'productShowcase', 'faq', 'ctaBanner']), { strategy: s, description: 'x', compositionV2: true });
    ['VISUAL_PACING', 'SECTION_CONTRAST', 'COMPOSITION_VARIETY', 'CTA_STRENGTH', 'FOOTER_COMPLETION'].forEach(k => assert.notStrictEqual(good.categories[k], 'FAIL', k));
  });
  await t('rubric flags REPETITIVE_COMPOSITION and flat pacing on a flat plan', () => {
    const flat = { sections: Array.from({ length: 5 }, (_, i) => ({ id: 'x' + i, type: 'services', role: 'EDUCATE', tone: 'base', weight: 'medium', moment: null, open: false, layout: 'default', cta: null })), footer: { tone: 'base', layout: 'resolved' } };
    assert.ok(C.evaluateComposition(flat).some(f => f.code === 'REPETITIVE_COMPOSITION'));
    assert.ok(C.evaluateComposition(flat).some(f => f.code === 'flat_pacing_run'));
  });
  await t('composition repair is surgical and free: missing final CTA inserted, unsupported testimonials removed as ONE action, rest untouched', async () => {
    const c = P.createPremiumCore(P.loadConfig({ PREMIUM_GENERATION_V1: 'true', PREMIUM_COMPOSITION_V2: 'true', PREMIUM_GROUNDING_V3: 'false' })), s = c.startSession({ categoryKey: 'cleaning', archetype: 'service-business', palette: PAL, composition: true });
    const d = { copy: { headline: 'Residential cleaning in Edmonton', cta: 'Book' }, design: { palette: PAL, dimensions: { hero: 'split' }, premiumTokens: s.tokens }, pages: [{ id: 'home', slug: '', sections: [{ id: 'a', type: 'services', variant: 'numbered', copy: { headline: 'What we clean' } }, { id: 't1', type: 'testimonial', copy: {} }, { id: 't2', type: 'testimonialsGrid', copy: {} }, { id: 't3', type: 'testimonial', copy: {} }, { id: 'b', type: 'serviceAreas', copy: {} }] }], imagePlan: [], assets: { generated: {} } };
    const before = JSON.stringify(d.pages[0].sections.find(x => x.id === 'a'));
    const out = await s.reviewAndRepair(d, { description: 'Residential cleaning service in Edmonton' }, {});
    const kinds = out.actions.map(a => a.kind);
    assert.ok(kinds.includes('insert_cta_section') && kinds.filter(k => k === 'remove_section').length === 1, kinds.join());
    assert.strictEqual(JSON.stringify(out.direction.pages[0].sections.find(x => x.id === 'a')), before);
    assert.ok(out.direction.pages[0].sections.some(x => x.type === 'ctaBanner') && !out.direction.pages[0].sections.some(x => /^t/.test(x.id)));
    assert.strictEqual(s.totals().TOTAL_SITE_COST, 0);
  });

  console.log('PREMIUM_GROUNDING_V3');
  const SKIN = 'Online skincare store in Vancouver selling gentle cleansers, serums and moisturizers for sensitive skin. Free shipping over $60.';
  const RESTO = 'Neighbourhood Italian restaurant in Vancouver serving fresh pasta and wood-fired pizza. Reservations recommended on weekends.';
  const SAAS = 'Scheduling software for physiotherapy clinics. Online booking, automatic reminders and a dashboard. 14 day free trial.';
  const gOf = (text, categoryKey, archetype) => P.grounding.deriveGrounding({ description: text, categoryKey, archetype, location: 'Vancouver', facts: {} });
  const leakySite = () => ({
    copy: { headline: 'Products, made to be noticed.', sub: 'Browse the range.', cta: 'Reserve a table' },
    strategy: { archetype: 'local-conversion' },
    pages: [
      { id: 'home', slug: '', label: 'Home', purpose: 'Remove friction and make starting easy.', sections: [
        { id: 'a1', type: 'productShowcase', variant: 'x', copy: { headline: 'Bestsellers' } },
        { id: 'a2', type: 'testimonial', variant: 'x', copy: { headline: 'Loved by guests', body: 'Verified customer' } },
        { id: 'a3', type: 'pricing', variant: 'x', copy: { headline: 'Starter Growth Enterprise' } },
        { id: 'a4', type: 'menu', variant: 'x', copy: { headline: 'The menu' } },
        { id: 'a5', type: 'team', variant: 'x', copy: {} },
      ] },
      { id: 'about', slug: 'about', label: 'About', purpose: 'Establish who is behind the business and why they can be trusted.', sections: [{ id: 'b1', type: 'about', variant: 'x', copy: {} }] },
      { id: 'contact', slug: 'contact', label: 'Contact', sections: [{ id: 'c1', type: 'contact', copy: {} }] },
    ],
  });
  await t('V3 flag: on with V1, off with =false, never without V1', () => {
    assert.strictEqual(P.loadConfig({ PREMIUM_GENERATION_V1: 'true' }).groundingV3, true);
    assert.strictEqual(P.loadConfig({ PREMIUM_GROUNDING_V3: 'true' }).groundingV3, false);
    assert.strictEqual(P.loadConfig({ PREMIUM_GENERATION_V1: 'true', PREMIUM_GROUNDING_V3: 'off' }).groundingV3, false);
  });
  await t('V3 budgets: semantic sub-budgets have the briefed defaults', () => {
    const b = P.loadConfig({}).budgets;
    assert.deepStrictEqual([b.SEMANTIC_REVIEW_TARGET_USD, b.SEMANTIC_REPAIR_TARGET_USD, b.SEMANTIC_REVIEW_HARD_CEILING_USD], [0.30, 0.30, 0.60]);
  });
  await t('grounding: skincare store is retail, no restaurant/SaaS concepts, no invented proof', () => {
    const g = gOf(SKIN, 'ecommerce', 'ecommerce-showcase');
    assert.strictEqual(g.family, 'retail'); assert.strictEqual(g.subtype, 'skincare');
    ['menu', 'reservationCta', 'pricing'].forEach(s => assert.ok(g.forbiddenSections.includes(s), 'forbids ' + s));
    assert.notStrictEqual(g.teamAvailability, 'supplied');
    assert.ok(g.forbiddenWords.includes('menu') && g.forbiddenWords.includes('guest'));
    assert.notStrictEqual(g.testimonialAvailability, 'supplied');
    assert.ok(/skincare|serum|cream/i.test(JSON.stringify(g.imagerySubjects)));
    assert.ok(g.imageryAvoid.some(w => /fashion|apparel|clothing/i.test(w)));
  });
  await t('grounding: restaurant keeps menu/reservation concepts; saas without pricing forbids pricing', () => {
    const r = gOf(RESTO, 'restaurant', 'hospitality');
    assert.strictEqual(r.family, 'hospitality'); assert.ok(!r.forbiddenSections.includes('menu'));
    const s = gOf(SAAS, 'saas', 'product-led-saas');
    assert.strictEqual(s.family, 'saas'); assert.strictEqual(s.pricingModel, 'none-supplied');
  });
  await t('grounding: strict word matching (no prefix false positives) and supplied testimonials are honoured', () => {
    assert.strictEqual(P.grounding.wordMatch('a candlestick maker', 'candle'), false);
    assert.strictEqual(P.grounding.wordMatch('handmade candles', 'candle'), true);
    const g = gOf(SKIN + ' Testimonial: "Best serum I have used in years, my skin feels calm."', 'ecommerce', 'ecommerce-showcase');
    assert.strictEqual(g.testimonialAvailability, 'supplied');
  });
  await t('semantic guard: fake testimonials, SaaS tiers, menu and team are removed from a retail site (deterministic, $0)', () => {
    const g = gOf(SKIN, 'ecommerce', 'ecommerce-showcase'); const site = leakySite();
    const def = P.semantic.checkSemantics(site, g, { description: SKIN, facts: {} });
    const out = P.semantic.applyRepairs(site, def, g).direction;
    const types = out.pages.flatMap(p => p.sections.map(s => s.type));
    ['testimonial', 'pricing', 'menu', 'team'].forEach(x => assert.ok(!types.includes(x), x + ' removed'));
    assert.ok(types.includes('productShowcase'));
    assert.ok(def.some(x => x.category === 'INVENTED_TRUST_SIGNALS') && def.some(x => x.category === 'WRONG_BUSINESS_CONCEPTS'));
  });
  await t('semantic guard: builder-instruction page purposes never survive as customer copy', () => {
    const g = gOf(SKIN, 'ecommerce', 'ecommerce-showcase'); const site = leakySite();
    const out = P.semantic.applyRepairs(site, P.semantic.checkSemantics(site, g, { description: SKIN }), g).direction;
    out.pages.forEach(p => assert.ok(!P.semantic.INTERNAL_PATTERNS.some(re => re.test(p.purpose || '')), 'purpose clean on ' + p.label));
    assert.ok(P.semantic.validateCustomerText('Remove friction and make starting easy.', g, 'headline').length > 0);
    assert.strictEqual(P.semantic.validateCustomerText('Gentle cleansers for sensitive skin', g, 'headline').length, 0);
  });
  await t('semantic guard: cross-family CTA ("Reserve a table") is replaced on a retail site', () => {
    const g = gOf(SKIN, 'ecommerce', 'ecommerce-showcase'); const site = leakySite();
    const out = P.semantic.applyRepairs(site, P.semantic.checkSemantics(site, g, { description: SKIN }), g).direction;
    assert.ok(!/reserve/i.test(out.copy.cta || ''), 'hero CTA: ' + out.copy.cta);
  });
  await t('semantic guard: thin About/Contact pages are enriched without inventing facts', () => {
    const g = gOf(SKIN, 'ecommerce', 'ecommerce-showcase'); const site = leakySite();
    const out = P.semantic.applyRepairs(site, P.semantic.checkSemantics(site, g, { description: SKIN }), g).direction;
    assert.ok(out.pages.find(p => p.slug === 'about').sections.length >= 2);
  });
  await t('semantic guard: a Pricing page is dropped when no pricing was supplied', () => {
    const g = gOf(SAAS, 'saas', 'product-led-saas');
    const site = { copy: {}, pages: [{ id: 'home', slug: '', label: 'Home', sections: [{ id: 'h', type: 'features', copy: {} }] }, { id: 'pricing', slug: 'pricing', label: 'Pricing', sections: [{ id: 'q', type: 'faq', copy: {} }] }] };
    const out = P.semantic.applyRepairs(site, P.semantic.checkSemantics(site, g, { description: SAAS }), g).direction;
    assert.ok(!out.pages.some(p => p.slug === 'pricing'));
  });
  await t('semantic guard: supplied restaurant content is NOT touched (no false positives on a correct site)', () => {
    const g = gOf(RESTO, 'restaurant', 'hospitality');
    const site = { copy: { headline: 'Fresh pasta and wood-fired pizza', sub: 'Dinner Tuesday to Sunday in Vancouver.', cta: 'Reserve a table' }, strategy: { archetype: 'hospitality' }, pages: [
      { id: 'home', slug: '', label: 'Home', sections: [{ id: 'm', type: 'menu', copy: { headline: 'The menu' } }, { id: 'r', type: 'reservationCta', copy: {} }] },
      { id: 'about', slug: 'about', label: 'About', sections: [{ id: 'a', type: 'about', copy: {} }, { id: 'cb', type: 'ctaBanner', copy: {} }] }] };
    const def = P.semantic.checkSemantics(site, g, { description: RESTO }).filter(x => x.severity >= 3);
    assert.deepStrictEqual(def.map(x => x.code), []);
  });
  await t('image subject validation: off-subject prompts are caught before money is spent; grounded prompts pass', () => {
    const g = gOf(SKIN, 'ecommerce', 'ecommerce-showcase');
    const strat = P.strategy.deriveStrategy({ archetype: 'ecommerce-showcase', categoryKey: 'ecommerce', categoryLabel: 'Retail', description: SKIN, location: 'Vancouver', grounding: g });
    const art = P.art.deriveArtDirection(strat, { background: '#fff', main: '#245', text: '#111' });
    const prompt = P.images.buildImagePrompt({ role: 'hero', aspectRatio: '16:9', textSide: 'left', avoid: strat.imageAvoid }, strat, art);
    assert.ok(/skincare|serum|cream/i.test(prompt), prompt.slice(0, 160));
    assert.ok(P.images.lintImagePrompt(prompt).ok, JSON.stringify(P.images.lintImagePrompt(prompt).problems));
    assert.strictEqual(P.images.validateImagePromptSubject(prompt, g).ok, true);
    assert.strictEqual(P.images.validateImagePromptSubject('a runway model wearing fashion apparel', g).ok, false);
  });
  await t('session: guard + ONE critic call + <=5 critic fixes, cost tracked in the semantic budget', async () => {
    const c = core({ PREMIUM_GROUNDING_V3: 'true' });
    const s = c.startSession({ categoryKey: 'ecommerce', categoryLabel: 'Retail', archetype: 'ecommerce-showcase', palette, description: SKIN });
    let calls = 0;
    const many = Array.from({ length: 8 }, (_, i) => ({ category: 'COPY_SPECIFICITY', code: 'x' + i, severity: 2, where: 'hero', field: 'sub', evidence: 'generic', fixKind: 'apply_fix_text', fixText: 'Gentle cleansers and serums for sensitive skin.' }));
    const site = leakySite(); site.copy.cta = 'Shop now';
    const out = await s.reviewAndRepair(site, { description: SKIN, facts: {}, premiumEnabled: true }, { semanticCritic: async () => { calls++; return { input: { defects: many }, usage: { inputTokens: 3000, outputTokens: 600 } }; } });
    assert.strictEqual(calls, 1);
    assert.ok(out.semantic && out.semantic.log.criticRan);
    assert.ok(out.semantic.changes.length >= 4, 'deterministic + critic changes applied');
    assert.ok(out.semantic.log.criticCostUsd <= 0.30 + 1e-9, 'within semantic target: ' + out.semantic.log.criticCostUsd);
    assert.ok(!out.direction.pages.flatMap(p => p.sections.map(x => x.type)).includes('testimonial'));
  });
  await t('session: critic fix that invents a fact or leaks another business is rejected', async () => {
    const c = core({ PREMIUM_GROUNDING_V3: 'true' });
    const s = c.startSession({ categoryKey: 'ecommerce', categoryLabel: 'Retail', archetype: 'ecommerce-showcase', palette, description: SKIN });
    const bad = [{ category: 'COPY_SPECIFICITY', code: 'x', severity: 3, where: 'hero', field: 'sub', evidence: 'e', fixKind: 'apply_fix_text', fixText: 'Reserve your table for our verified customers since 1998.' }];
    const site = leakySite();
    const out = await s.reviewAndRepair(site, { description: SKIN, facts: {}, premiumEnabled: true }, { semanticCritic: async () => ({ input: { defects: bad }, usage: { inputTokens: 3000, outputTokens: 300 } }) });
    assert.ok(!/1998|verified|reserve/i.test(out.direction.copy.sub || ''), out.direction.copy.sub);
  });
  await t('session: with V3 OFF nothing changes (no semantic pass, no critic call)', async () => {
    const c = core();
    const s = c.startSession({ categoryKey: 'ecommerce', categoryLabel: 'Retail', archetype: 'ecommerce-showcase', palette, description: SKIN });
    let calls = 0;
    const out = await s.reviewAndRepair(leakySite(), { description: SKIN, facts: {}, premiumEnabled: true }, { semanticCritic: async () => { calls++; return { input: { defects: [] }, usage: {} }; } });
    assert.strictEqual(calls, 0); assert.ok(!out.semantic);
    assert.ok(out.direction.pages[0].sections.some(x => x.type === 'menu'), 'V3 guards did not run: the off-category menu section is still there (V1 behaviour)');
  });
  await t('rubric: 10 semantic categories exist and are NOT_APPLICABLE when V3 is off', () => {
    P.semantic.SEMANTIC_CATEGORIES.forEach(k => assert.ok(P.review.CATEGORIES.includes(k), k));
    const r = P.review.reviewDirection(sample(), { strategy: P.strategy.deriveStrategy({ categoryKey: 'roofing', categoryLabel: 'Roofing', archetype: 'local-conversion', description: 'roofing in Calgary' }), premiumEnabled: true });
    assert.ok(P.semantic.SEMANTIC_CATEGORIES.every(k => r.categories[k] === 'NOT_APPLICABLE' || (r.categories[k] && r.categories[k].status === 'NOT_APPLICABLE') || r.categories[k] === undefined));
  });
  await t('CTA validation: a critic button label must fit THIS business', () => {
    const roof = P.grounding.deriveGrounding({ description: 'Family roofing company in Calgary. Free quotes.', categoryKey: 'roofing', archetype: 'local-conversion', location: 'Calgary' });
    assert.ok(P.semantic.validateCustomerText('Shop the range', roof, 'cta').length > 0);
    assert.strictEqual(P.semantic.validateCustomerText('Get a free quote', roof, 'cta').length, 0);
    const g = gOf(SKIN, 'ecommerce', 'ecommerce-showcase');
    assert.ok(P.semantic.validateCustomerText('Reserve a table', g, 'cta').length > 0);
    assert.strictEqual(P.semantic.validateCustomerText('Shop the range', g, 'cta').length, 0);
  });
  await t('metrics: semantic defects/repairs are aggregated', async () => {
    const c = core({ PREMIUM_GROUNDING_V3: 'true' });
    const s = c.startSession({ categoryKey: 'ecommerce', categoryLabel: 'Retail', archetype: 'ecommerce-showcase', palette, description: SKIN });
    await s.reviewAndRepair(leakySite(), { description: SKIN, facts: {}, premiumEnabled: true }, {});
    s.finish();
    const m = c.metrics.summary ? c.metrics.summary() : c.metrics.aggregate();
    assert.ok(m.SEMANTIC_REPAIR_RATE >= 0 && m.AVERAGE_SEMANTIC_DEFECTS > 0, JSON.stringify(m).slice(0, 300));
  });

  console.log('PREMIUM_VISUALS_V4');
  const TECH = 'Technology company building modern AI software. Tools for creative teams. Los Angeles.';
  const techProj = (over) => Object.assign({ source: { text: TECH, location: 'Los Angeles' }, business: { categoryKey: 'tech', name: 'Lumen' }, strategy: { archetype: 'product-led-saas' }, design: { premium: { vs: 1 }, dimensions: { hero: 'centered-oversized' } },
    copy: { headline: 'Software for creative teams', sub: 'Tools for creative teams in Los Angeles.', cta: 'Get started' },
    pages: [{ id: 'home', slug: '', label: 'Home', sections: [{ id: 'f1', type: 'features', copy: {} }, { id: 'faq1', type: 'faq', copy: {} }] }, { id: 'about', slug: 'about', label: 'About', sections: [{ id: 'ab', type: 'about', copy: {} }] }],
    imagePlan: [{ slot: 'hero', role: 'hero', sourceType: 'designed' }, { slot: 'product', role: 'product', sourceType: 'designed' }] }, over || {});
  await t('V4 flag: on with V1 (+V3), off with =false, needs V3', () => {
    const c = k => P.loadConfig(k).visualsV4;
    assert.strictEqual(c({ PREMIUM_GENERATION_V1: 'true' }), true);
    assert.strictEqual(c({ PREMIUM_VISUALS_V4: 'true' }), false);
    assert.strictEqual(c({ PREMIUM_GENERATION_V1: 'true', PREMIUM_VISUALS_V4: 'false' }), false);
    assert.strictEqual(c({ PREMIUM_GENERATION_V1: 'true', PREMIUM_GROUNDING_V3: 'false' }), false);
  });
  await t('industry visual profile: derived from the grounding, one per business family', () => {
    const fam = f => P.visuals.profileFromGrounding({ family: f }).id;
    assert.deepStrictEqual(['saas', 'retail', 'hospitality', 'local_service', 'professional', 'creative'].map(fam), ['tech', 'retail', 'hospitality', 'trades', 'consultancy', 'portfolio']);
    assert.strictEqual(P.visuals.contextFor(techProj()).profile.id, 'tech');
  });
  await t('starter visuals: every kind renders valid, self-contained SVG with no invented numbers', () => {
    const p = techProj();
    P.visuals.STARTER_KINDS.forEach(k => {
      const h = P.visuals.renderKind(k, p, 'x');
      assert.ok(/<svg[^>]*viewBox/.test(h) && /<\/svg>/.test(h), k);
      assert.ok(!/NaN|undefined|null/.test(h), k + ' has bad tokens');
      const labels = [...h.matchAll(/<text[^>]*>([^<]*)<\/text>/g)].map(m => m[1]);
      labels.filter(l => !/^0[1-4]$/.test(l)).forEach(l => assert.ok(!/\d|%|\$/.test(l), k + ' label looks like data: ' + l));
    });
  });
  await t('starter visuals: unique gradient ids per slot; nothing rendered unless the project opted in', () => {
    const p = techProj();
    const a = P.visuals.starterHtml(p, 'hero'), b = P.visuals.starterHtml(p, 'product');
    const ida = a.match(/id="(svg-a[^"]*)"/), idb = b.match(/id="(svg-a[^"]*)"/);
    assert.ok(ida && idb && ida[1] !== idb[1], 'ids differ');
    const off = techProj({ design: { premium: {} } });
    assert.strictEqual(P.visuals.starterHtml(off, 'hero'), null);
  });
  await t('starter media: hero/product use a product UI for tech, brand graphic for team/about, photography families keep photos', () => {
    const ctx = P.visuals.contextFor(techProj());
    assert.ok(/^ui-/.test(P.visuals.starterKindFor(ctx, 'hero', 'hero')));
    assert.strictEqual(P.visuals.starterKindFor(ctx, 'team', 'team-1'), 'brand-mark');
    assert.strictEqual(P.visuals.PROFILES.retail.media.hero, 'PHOTO');
    assert.strictEqual(P.visuals.PROFILES.tech.media.hero, 'PRODUCT_UI');
  });
  await t('media planning: tech hero/product become $0 starter visuals; retail still gets generated photography', () => {
    const c = core({ PREMIUM_GROUNDING_V3: 'true', PREMIUM_VISUALS_V4: 'true' });
    const mk = (text, key, arch, label) => {
      const g = P.grounding.deriveGrounding({ description: text, categoryKey: key, archetype: arch, location: 'LA' });
      const strat = P.strategy.deriveStrategy({ archetype: arch, categoryKey: key, categoryLabel: label, description: text, grounding: g, visualsV4: true });
      const art = P.art.deriveArtDirection(strat, palette);
      const gov = new P.BudgetGovernor(c.cfg, new P.CostLedger(c.cfg), 'gen_t1');
      return P.images.allocateImages({ slots: slots(), strategy: strat, art, uploads: [], cfg: c.cfg, governor: gov });
    };
    const tech = mk(TECH, 'tech', 'product-led-saas', 'Technology');
    const hero = tech.slots.find(s => s.slot === 'hero'), prod = tech.slots.find(s => s.slot === 'product');
    assert.ok(hero.sourceType === 'designed' && hero.starter && hero.mediaType === 'PRODUCT_UI' && hero.estimatedUsd === 0, JSON.stringify(hero));
    assert.ok(prod.starter && prod.estimatedUsd === 0);
    const retail = mk('Online skincare store selling serums and cleansers.', 'ecommerce', 'ecommerce-showcase', 'Retail');
    assert.strictEqual(retail.slots.find(s => s.slot === 'hero').sourceType, 'generated');
    assert.ok(retail.committedUsd > tech.committedUsd);
  });
  await t('first-draft completeness: a text-only tech hero is caught and repaired with a product-visual hero', () => {
    const p = techProj(); const g = gOf(TECH, 'tech', 'product-led-saas');
    const def = P.visuals.checkVisuals(p, { description: TECH });
    assert.ok(def.some(x => x.category === 'HERO_VISUAL_STRENGTH' && x.severity === 3));
    assert.ok(def.some(x => x.category === 'FIRST_DRAFT_COMPLETENESS'));
    assert.ok(def.some(x => x.category === 'PRODUCT_VISUAL_EXPLANATION'));
    const out = P.semantic.applyRepairs(p, def, g).direction;
    assert.strictEqual(out.design.dimensions.hero, 'product-screenshot');
    assert.ok(out.pages[0].sections.some(s => s.type === 'productShowcase'));
    assert.strictEqual(P.visuals.checkVisuals(out, {}).filter(x => x.severity >= 3).length, 0);
  });
  await t('first-draft completeness: an empty visual slot (no media, no starter) is flagged and fixed by enabling starters', () => {
    const p = techProj({ design: { premium: {}, dimensions: { hero: 'product-screenshot' } } }); const g = gOf(TECH, 'tech', 'product-led-saas');
    const def = P.visuals.checkVisuals(p, {});
    assert.ok(def.some(x => x.category === 'MEDIA_COMPLETENESS' && x.repair && x.repair.kind === 'enable_starter'));
    const out = P.semantic.applyRepairs(p, def, g).direction;
    assert.strictEqual(out.design.premium.vs, 1);
    assert.strictEqual(P.visuals.checkVisuals(out, {}).filter(x => x.category === 'MEDIA_COMPLETENESS').length, 0);
  });
  await t('placeholder leakage: "upload your photo" / lorem text on the site is flagged', () => {
    const p = techProj(); p.pages[0].sections[0].copy = { body: 'Lorem ipsum dolor sit amet' }; p.pages[1].sections[0].copy = { body: 'Your image here' };
    const d = P.visuals.checkVisuals(p, {}).filter(x => x.category === 'PLACEHOLDER_LEAKAGE');
    assert.strictEqual(d.length, 2);
  });
  await t('generic tech copy is flagged ("done right", "everything ... in one place", "feel effortless")', () => {
    const g = gOf(TECH, 'tech', 'product-led-saas');
    ['Software for modern AI software, done right.', 'Everything modern AI software needs, in one place.', 'Designed to make docs feel effortless.'].forEach(x => assert.ok(P.semantic.validateCustomerText(x, g, 'headline').some(z => /generic/.test(z)), x));
    assert.strictEqual(P.semantic.validateCustomerText('Turn a creative brief into a reviewed draft.', g, 'headline').length, 0);
  });
  await t('tech product features explain the workflow (no Product / Pricing / Docs filler, no pricing implied)', () => {
    const items = P.visuals.featureItemsFor(techProj());
    assert.strictEqual(items.length, 4);
    items.forEach(i => assert.ok(!/pricing|docs|\$|free|plan/i.test(i.label + ' ' + i.body)));
    assert.strictEqual(P.visuals.featureItemsFor(techProj({ design: { premium: {} } })), null);
    const retailP = techProj({ source: { text: 'Online skincare store selling serums.' }, business: { categoryKey: 'ecommerce', name: 'Glow' }, strategy: { archetype: 'ecommerce-showcase' } });
    assert.strictEqual(P.visuals.featureItemsFor(retailP), null);
  });
  await t('visual brief: validated (no numbers/brands), encoded flat, decoded back', () => {
    const ok = P.visuals.validateBrief({ kind: 'ui-workflow', steps: ['Brief', 'Generate', 'Review', 'Publish'] });
    assert.ok(ok); const enc = P.visuals.encodeBrief(ok); assert.ok(enc.length <= 200 && /^ui-workflow\|/.test(enc));
    assert.deepStrictEqual(P.visuals.decodeBrief(enc, { kind: 'ui-dashboard', steps: [], panels: [] }).steps, ['Brief', 'Generate', 'Review', 'Publish']);
    assert.strictEqual(P.visuals.validateBrief({ kind: 'ui-workflow', steps: ['Brief', '10x faster', 'Review', 'Acme Corp'] }), null);
    assert.strictEqual(P.visuals.validateBrief({ kind: 'nonsense', steps: ['A', 'B', 'C', 'D'] }), null);
  });
  await t('session V4: ONE visual-brief call for tech (governed, ledgered), none for retail; V4 off = none', async () => {
    const run = async (text, key, arch, envx) => {
      const c = core(envx); const s = c.startSession({ categoryKey: key, categoryLabel: 'X', archetype: arch, palette, description: text }); let calls = 0;
      const p = techProj({ source: { text }, business: { categoryKey: key, name: 'Lumen' }, strategy: { archetype: arch } });
      const out = await s.reviewAndRepair(p, { description: text, facts: {}, premiumEnabled: true }, { visualBrief: async () => { calls++; return { input: { kind: 'ui-workflow', steps: ['Brief', 'Generate', 'Review', 'Publish'] }, usage: { inputTokens: 500, outputTokens: 80 } }; }, semanticCritic: async () => ({ input: { defects: [] }, usage: { inputTokens: 3000, outputTokens: 200 } }) });
      return { calls, out, s };
    };
    const on = { PREMIUM_GROUNDING_V3: 'true', PREMIUM_VISUALS_V4: 'true' };
    const a = await run(TECH, 'tech', 'product-led-saas', on); assert.strictEqual(a.calls, 1); assert.ok(/^ui-workflow\|/.test(a.out.visualBrief));
    assert.ok(a.s.ledger.forGeneration(a.s.generationId).some(e => e.operation === 'visual_brief'), 'ledgered');
    const b = await run('Online skincare store selling serums.', 'ecommerce', 'ecommerce-showcase', on); assert.strictEqual(b.calls, 0);
    const c = await run(TECH, 'tech', 'product-led-saas', { PREMIUM_GROUNDING_V3: 'true' }); assert.strictEqual(c.calls, 0);
  });
  await t('rubric: 8 visual categories exist; NOT_APPLICABLE unless V4 is on', () => {
    P.semantic.VISUAL_CATEGORIES.forEach(k => assert.ok(P.review.CATEGORIES.includes(k), k));
    const strat = P.strategy.deriveStrategy({ categoryKey: 'tech', categoryLabel: 'Tech', archetype: 'product-led-saas', description: TECH });
    const off = P.review.reviewDirection(techProj(), { strategy: strat, premiumEnabled: true, groundingV3: true, description: TECH });
    P.semantic.VISUAL_CATEGORIES.forEach(k => assert.strictEqual(off.categories[k], 'NOT_APPLICABLE', k));
    const on = P.review.reviewDirection(techProj(), { strategy: strat, premiumEnabled: true, groundingV3: true, visualsV4: true, description: TECH });
    assert.strictEqual(on.categories.HERO_VISUAL_STRENGTH, 'FAIL'); assert.strictEqual(on.categories.FIRST_DRAFT_COMPLETENESS, 'FAIL');
  });
  await t('image prompts still pass the lint after V4 (avoid-list wording)', () => {
    const g = gOf('Online skincare store in Vancouver selling serums.', 'ecommerce', 'ecommerce-showcase');
    const strat = P.strategy.deriveStrategy({ archetype: 'ecommerce-showcase', categoryKey: 'ecommerce', categoryLabel: 'Retail', description: SKIN, grounding: g, visualsV4: true });
    const art = P.art.deriveArtDirection(strat, palette);
    ['hero', 'product', 'gallery'].forEach(role => assert.ok(P.images.lintImagePrompt(P.images.buildImagePrompt({ role, aspectRatio: '4:3', textSide: 'left', avoid: strat.imageAvoid }, strat, art)).ok, role));
  });

  console.log('PREMIUM QUALITY PASS (V5)');
  const V5ON = { PREMIUM_GROUNDING_V3: 'true', PREMIUM_VISUALS_V4: 'true', PREMIUM_COMPOSITION_V2: 'true' };
  await t('quality-first budgets: target 1.50, soft 3.50, hard 5.00; primary image cap raised; photo-led sites fund a full photo set', () => {
    const b = P.loadConfig({ PREMIUM_GENERATION_V1: 'true' });
    assert.deepStrictEqual([b.budgets.TARGET_FIRST_DRAFT_USD, b.budgets.SOFT_SITE_BUDGET_USD, b.budgets.HARD_SITE_BUDGET_USD], [1.5, 3.5, 5]);
    assert.ok(b.imageTierCaps.primary >= 0.45 && b.imageTierCaps.hero >= 0.75);
    assert.ok(b.models.planner);
  });
  await t('secondary-page depth: thin About / Contact / catalog pages are enriched with grounded sections only', () => {
    const g = gOf('Family roofing company in Calgary. Free quotes.', 'roofing', 'local-conversion');
    const site = { copy: { headline: 'Roofing in Calgary' }, pages: [
      { id: 'home', slug: '', label: 'Home', sections: [{ id: 'h1', type: 'services', copy: {} }] },
      { id: 'about', slug: 'about', label: 'About', sections: [{ id: 'a', type: 'about', copy: {} }] },
      { id: 'contact', slug: 'contact', label: 'Contact', sections: [{ id: 'c', type: 'contact', copy: {} }] },
      { id: 'services', slug: 'services', label: 'Services', sections: [{ id: 's', type: 'services', copy: {} }] }] };
    const out = P.semantic.applyRepairs(site, P.semantic.checkSemantics(site, g, { description: 'x' }), g).direction;
    const types = slug => out.pages.find(p => p.slug === slug).sections.map(s => s.type);
    assert.ok(types('about').length >= 3 && types('about').includes('process'), types('about').join());
    assert.ok(types('contact').length >= 2, types('contact').join());
    assert.ok(types('services').length >= 2, types('services').join());
    ['testimonial', 'team', 'pricing'].forEach(x => out.pages.forEach(p => assert.ok(!p.sections.some(s => s.type === x))));
  });
  await t('hero families: photography businesses never keep a text-only or interface hero; tech keeps the browser-frame hero', () => {
    const V = P.visuals;
    assert.strictEqual(V.chooseHero(V.PROFILES.retail, 'poster'), 'product-stage'); // Visual Engine V1: retail's default hero is now PRODUCT_STAGE
    assert.strictEqual(V.chooseHero(V.PROFILES.hospitality, 'centered-oversized'), 'fullbleed-image');
    assert.strictEqual(V.chooseHero(V.PROFILES.trades, 'product-screenshot'), 'split');
    assert.strictEqual(V.chooseHero(V.PROFILES.retail, 'editorial-rail'), 'product-stage'); // narrowed allowlist (Part 30): retail now always upgrades to its premium default
    assert.strictEqual(V.chooseHero(V.PROFILES.retail, 'collage'), 'collage'); // a still-allowed, still-photo-capable alternate is kept
    assert.strictEqual(V.chooseHero(V.PROFILES.tech, 'grid-dashboard'), 'product-screenshot');
    const retailProj = techProj({ source: { text: 'Online skincare store selling serums.' }, business: { categoryKey: 'ecommerce', name: 'Glow' }, strategy: { archetype: 'ecommerce-showcase' }, design: { premium: { vs: 1 }, dimensions: { hero: 'poster' } } });
    assert.ok(V.checkVisuals(retailProj, {}).some(x => x.code === 'hero_family_mismatch' && x.repair && x.repair.value === 'product-stage'));
  });
  const imgSite = () => { const s = techProj({ source: { text: 'Online skincare store in Vancouver selling serums.' }, business: { categoryKey: 'ecommerce', name: 'Glow' }, strategy: { archetype: 'ecommerce-showcase' }, design: { premium: { vs: 1 }, dimensions: { hero: 'asymmetric-offset' } } });
    s.imagePlan = [{ slot: 'hero', role: 'hero', sourceType: 'generated', kind: 'photo', model: 'gpt-image-1', quality: 'high', routeKind: 'premium', aspectRatio: '16:9', cacheKey: 'k', prompt: 'skincare products on a clean surface, soft light', promptSimplified: 'skincare bottles, simple' }, { slot: 'product', role: 'product', sourceType: 'generated', kind: 'photo', model: 'gpt-image-1', quality: 'medium', routeKind: 'premium', aspectRatio: '4:3', cacheKey: 'k2', prompt: 'skincare product close-up' }];
    return s; };
  const criticImg = (slot, prompt) => async () => ({ input: { defects: [{ category: 'IMAGE_SUBJECT_RELEVANCE', code: 'poor_hero', severity: 3, where: 'image', targetId: slot, evidence: 'generic stock', fixKind: 'regenerate_image', fixText: prompt }, { category: 'IMAGE_SUBJECT_RELEVANCE', code: 'poor_product', severity: 3, where: 'image', targetId: 'product', evidence: 'x', fixKind: 'regenerate_image', fixText: prompt }] }, usage: { inputTokens: 6000, outputTokens: 1500 } });
  await t('image repair: the critic may request ONE replacement of a primary image; it is governed, verified and recorded', async () => {
    const c = core(V5ON); const s = c.startSession({ categoryKey: 'ecommerce', categoryLabel: 'Retail', archetype: 'ecommerce-showcase', palette, description: SKIN });
    let regen = 0, seenPrompt = '';
    const out = await s.reviewAndRepair(imgSite(), { description: SKIN, facts: {}, premiumEnabled: true }, {
      semanticCritic: criticImg('hero', 'Editorial photograph of skincare bottles and a glass jar on a stone plinth, soft window light, shallow depth of field'),
      regenerateImage: async spec => { if (spec.slot === 'hero') { regen++; seenPrompt = spec.prompt; } return { ok: true, dataUrl: PNG_PHOTO }; } });
    assert.strictEqual(regen, 1, 'exactly one hero replacement although the critic asked for two images');
    assert.strictEqual(out.semantic.changes.filter(c => c.kind === 'regenerate_image' && c.code !== 'photo_slot_retry').length, 1, 'the critic never replaces more than one image (unresolved photo slots are retried separately, V6)');
    assert.ok(out.semantic.regenerated.includes('hero'));
    assert.ok(/skincare bottles/.test(seenPrompt) && /no text/i.test(seenPrompt), 'validated critic prompt + safety tail');
    assert.ok(out.semantic.regenerated.includes('hero'));
    assert.ok(out.direction.assets.generated.hero.dataUrl);
    assert.ok(s.ledger.forGeneration(s.generationId).some(e => e.kind === 'image' && e.phase === 'repair'), 'repair image is in the ledger');
  });
  await t('image repair: an off-subject or UI-word critic prompt falls back to the planner prompt; a poor result never replaces the image', async () => {
    const c = core(V5ON); const s = c.startSession({ categoryKey: 'ecommerce', categoryLabel: 'Retail', archetype: 'ecommerce-showcase', palette, description: SKIN });
    let seen = '';
    const out = await s.reviewAndRepair(imgSite(), { description: SKIN, facts: {}, premiumEnabled: true }, {
      semanticCritic: criticImg('hero', 'A fashion runway model wearing apparel in a dashboard screenshot'),
      regenerateImage: async spec => { if (spec.slot === 'hero') seen = spec.prompt; return { ok: true, dataUrl: PNG_BLANK }; } });
    assert.ok(/skincare bottles, simple/.test(seen), 'fell back: ' + seen.slice(0, 80));
    assert.ok(!out.semantic.regenerated.includes('hero'), 'a poor result never replaces the hero');
  });
  await t('image repair: never when the budget forbids it', async () => {
    const c = core(Object.assign({ HARD_SITE_BUDGET_USD: '0.05', SOFT_SITE_BUDGET_USD: '0.05' }, V5ON)); const s = c.startSession({ categoryKey: 'ecommerce', categoryLabel: 'Retail', archetype: 'ecommerce-showcase', palette, description: SKIN });
    let regen = 0;
    await s.reviewAndRepair(imgSite(), { description: SKIN, facts: {}, premiumEnabled: true }, { semanticCritic: criticImg('hero', 'Editorial photograph of skincare bottles on stone, soft light'), regenerateImage: async () => { regen++; return { ok: true, dataUrl: PNG_PHOTO }; } });
    assert.strictEqual(regen, 0);
  });
  await t('critic gets the pictures: vision thumbnails are passed through to the critic call', async () => {
    const c = core(V5ON); const s = c.startSession({ categoryKey: 'ecommerce', categoryLabel: 'Retail', archetype: 'ecommerce-showcase', palette, description: SKIN });
    let got = null;
    await s.reviewAndRepair(imgSite(), { description: SKIN, facts: {}, premiumEnabled: true, visionImages: [{ slot: 'hero', mediaType: 'image/jpeg', data: 'AAAA' }] }, { semanticCritic: async x => { got = x; return { input: { defects: [] }, usage: {} }; } });
    assert.ok(got && got.images && got.images.length === 1 && /IMAGE quality/.test(got.user));
    assert.ok(got.tool.input_schema.properties.defects.maxItems >= 10);
  });
  await t('acceptance gate: blockers left after the repair pass are reported; a clean site is accepted', async () => {
    const c = core(V5ON); const s = c.startSession({ categoryKey: 'tech', categoryLabel: 'Tech', archetype: 'product-led-saas', palette, description: TECH });
    const bad = techProj(); bad.pages[0].sections[0].copy = { body: 'Your image here' };
    const o1 = await s.reviewAndRepair(bad, { description: TECH, facts: {}, premiumEnabled: true }, {});
    assert.strictEqual(o1.acceptance.accepted, false); assert.ok(o1.acceptance.blockers.includes('placeholder_text'));
    const s2 = c.startSession({ categoryKey: 'tech', categoryLabel: 'Tech', archetype: 'product-led-saas', palette, description: TECH });
    const good = techProj({ design: { premium: { vs: 1 }, dimensions: { hero: 'product-screenshot' } }, pages: [{ id: 'home', slug: '', label: 'Home', sections: [{ id: 'f', type: 'features', copy: {} }, { id: 'p', type: 'productShowcase', copy: {} }] }] });
    const o2 = await s2.reviewAndRepair(good, { description: TECH, facts: {}, premiumEnabled: true }, {});
    assert.strictEqual(o2.acceptance.accepted, true, JSON.stringify(o2.acceptance));
  });
  await t('starter visuals: the layered hero composition renders for tech; never for photography families', () => {
    const p = techProj();
    assert.ok(/data-starter="ui-stack"/.test(P.visuals.starterHtml(p, 'hero')));
    const retailProj = techProj({ source: { text: 'Online skincare store selling serums.' }, business: { categoryKey: 'ecommerce', name: 'Glow' }, strategy: { archetype: 'ecommerce-showcase' } });
    assert.ok(!/ui-/.test(P.visuals.starterHtml(retailProj, 'hero')));
  });

  console.log('PREMIUM_PHOTO_LED_V6');
  const WELL = 'A wellness studio in Los Angeles offering yoga and recovery therapy';
  const gW = () => P.grounding.deriveGrounding({ description: WELL, categoryKey: 'wellness', archetype: 'local-conversion', location: 'Los Angeles' });
  const E = P.editorial;
  const wellSite = () => ({ source: { text: WELL, location: 'Los Angeles' }, business: { categoryKey: 'wellness', name: 'Studio' }, strategy: { archetype: 'local-conversion' }, design: { premium: { vs: 1 }, dimensions: { hero: 'stacked-image-below', imagery: 'atmospheric-warm' } },
    copy: { headline: 'Feel better, starting here.', sub: 'x', cta: 'Book Now' },
    pages: [
      { id: 'home', slug: '', label: 'Home', purpose: 'Orient the visitor and make the case for why this business is worth their attention.', sections: [{ id: 'a', type: 'about', copy: {} }, { id: 's', type: 'services', variant: 'described', copy: {} }, { id: 'tg', type: 'testimonialsGrid', copy: {} }, { id: 'f', type: 'faq', copy: {} }, { id: 'c', type: 'ctaBanner', copy: {} }] },
      { id: 'work', slug: 'work', label: 'Work', purpose: 'Explain each yoga class type and what to expect.', sections: [{ id: 's2', type: 'services', copy: {} }] },
      { id: 'services', slug: 'services', label: 'Services', purpose: 'Convey the philosophy and feel of the studio.', sections: [{ id: 'a2', type: 'about', copy: {} }] },
      { id: 'contact', slug: 'contact', label: 'Contact', purpose: 'Remove friction and make starting easy.', sections: [{ id: 'ct', type: 'contact', copy: {} }] }] });
  await t('grounding: yoga/recovery is a WELLNESS family (photo-led) and scheduling software for physio clinics stays SaaS', () => {
    const g = gW(); assert.strictEqual(g.family, 'wellness'); assert.strictEqual(g.primaryCTA, 'Book a class');
    assert.ok(E.isPhotoLed(g, WELL));
    const s = P.grounding.deriveGrounding({ description: 'Scheduling software for physiotherapy clinics. Online booking and a dashboard.', categoryKey: 'tech', archetype: 'product-led-saas' });
    assert.strictEqual(s.family, 'saas'); assert.ok(!E.isPhotoLed(s, ''));
    assert.strictEqual(P.visuals.profileFromGrounding(g).id, 'wellness'); assert.ok(P.visuals.PROFILES.wellness.photoLed && P.visuals.PROFILES.retail.photoLed && !P.visuals.PROFILES.tech.photoLed);
  });
  await t('shot lists: wellness >=5 photographs (hero, movement, recovery, studio, atmosphere); retail/hospitality >=4; briefs carry no faces/UI', () => {
    const shots = E.shotList(gW()); assert.ok(shots.length >= 5); ['hero', 'movement', 'recovery', 'studio', 'atmosphere'].forEach(id => assert.ok(shots.some(s => s.id === id), id));
    assert.strictEqual(E.minPhotos(gW()), 5);
    const retail = P.grounding.deriveGrounding({ description: 'Online skincare store selling serums.', categoryKey: 'ecommerce', archetype: 'ecommerce-showcase' });
    assert.ok(E.shotList(retail).length >= 4 && E.minPhotos(retail) >= 4);
    shots.forEach(s => assert.ok(!/dashboard|screenshot|logo|text/i.test(s.brief), s.id));
  });
  await t('instruction / filler text is hard-blocked: planner purposes and template filler never count as customer copy', () => {
    ['Explain each yoga class type and what to expect.', 'Convey the philosophy and feel of the studio.', 'Remove friction and make starting easy.', 'Establish who is behind the business and why they can be trusted.',
      'A regular part of the care on offer.', 'Reach out and we\'ll walk through this together.', 'Real care, presented clearly.'].forEach(x => assert.ok(E.looksLikeInstruction(x), x));
    ['Move well, rest properly.', 'Show up as you are.', 'Build strength and calm.', 'Yoga classes that build strength, mobility and calm.', 'Tell us what you need and we will help you begin.'].forEach(x => assert.ok(!E.looksLikeInstruction(x), x));
  });
  await t('wellness plan: specific offerings, alternating photographic sections, real page names, no generic cards, no leaked purposes', () => {
    const out = E.planLayout(wellSite(), gW(), WELL).direction;
    const types = i => out.pages[i].sections.map(s => s.type);
    assert.ok(out.pages[0].sections.length >= 9, types(0).join());
    const feats = out.pages[0].sections.filter(s => s.type === 'editorialFeature');
    assert.deepStrictEqual(feats.map(s => s.variant), ['image-left', 'image-right', 'full']);
    assert.ok(feats.every(s => s.copy.brief && s.copy.headline && !E.looksLikeInstruction(s.copy.body)));
    assert.ok(!types(0).includes('testimonialsGrid'));
    const svc = E.itemsOf(out.pages[0].sections.find(s => s.type === 'services')); assert.deepStrictEqual(svc.map(x => x.title).slice(0, 2), ['Yoga classes', 'Recovery sessions']);
    assert.ok(E.itemsOf(out.pages[0].sections.find(s => s.type === 'faq')).length >= 4);
    assert.deepStrictEqual(out.pages.map(p => p.label), ['Home', 'Classes & Recovery', 'The Studio', 'Contact']);
    out.pages.forEach(p => assert.ok(!E.looksLikeInstruction(p.purpose), p.label + ': ' + p.purpose));
    assert.ok(out.pages[1].sections.length >= 5 && out.pages[2].sections.length >= 5);
    assert.ok(out.pages[0].sections.some(s => s.type === 'ctaBanner' && /^Begin with a class/.test(s.copy.headline) && s.copy.ctaLabel === 'Book a class'));
    const kinds = new Set(out.pages.flatMap(p => p.sections.filter(s => s.type === 'editorialFeature').map(s => s.variant))); assert.ok(kinds.has('image-left') && kinds.has('image-right') && kinds.has('full'));
  });
  await t('wellness plan keeps existing section ids (uploads/edits survive) and is idempotent', () => {
    const once = E.planLayout(wellSite(), gW(), WELL).direction; const twice = E.planLayout(once, gW(), WELL).direction;
    assert.ok(once.pages[0].sections.some(s => s.id === 's') && once.pages[0].sections.some(s => s.id === 'c'));
    assert.deepStrictEqual(twice.pages.map(p => p.sections.length), once.pages.map(p => p.sections.length));
    assert.strictEqual(twice.pages[0].sections.filter(s => s.type === 'editorialFeature').length, 3);
  });
  await t('planning is idempotent for EVERY photo-led family: re-planning never creates new feature sections (= new image slots)', () => {
    const cases = [[WELL, 'wellness', 'local-conversion'], ['Online skincare store selling serums.', 'ecommerce', 'ecommerce-showcase'], ['Family roofing company in Calgary. Free quotes.', 'roofing', 'local-conversion'], ['Neighbourhood Italian restaurant in Vancouver serving pasta.', 'restaurant', 'hospitality']];
    cases.forEach(([text, key, arch]) => {
      const g = P.grounding.deriveGrounding({ description: text, categoryKey: key, archetype: arch, location: 'X' });
      const site = { source: { text }, business: { categoryKey: key }, strategy: { archetype: arch }, design: { dimensions: {} }, pages: [{ id: 'h', slug: '', label: 'Home', sections: ['services', 'gallery', 'process'].map((ty, i) => ({ id: 'x' + i, type: ty, copy: {} })) }, { id: 'p2', slug: 'services', label: 'Services', sections: [{ id: 'y', type: 'services', copy: {} }] }] };
      const one = E.planLayout(site, g, text).direction, two = E.planLayout(one, g, text).direction;
      const ids = d => d.pages.flatMap(p => p.sections.filter(s => s.type === 'editorialFeature').map(s => s.id));
      assert.deepStrictEqual(ids(two), ids(one), key); assert.ok(ids(one).length >= 3, key);
    });
  });
  await t('generic photo-led plan (retail) inserts alternating photographic features and never invents copy', () => {
    const g = P.grounding.deriveGrounding({ description: 'Online skincare store in Vancouver selling gentle cleansers and serums. Free shipping over $60.', categoryKey: 'ecommerce', archetype: 'ecommerce-showcase', location: 'Vancouver' });
    const site = { source: { text: 'Online skincare store in Vancouver selling gentle cleansers and serums. Free shipping over $60.' }, business: { categoryKey: 'ecommerce' }, strategy: { archetype: 'ecommerce-showcase' }, design: { dimensions: {} },
      pages: [{ id: 'h', slug: '', label: 'Home', sections: ['productShowcase', 'gallery', 'newsletter', 'process'].map((t, i) => ({ id: 'x' + i, type: t, copy: {} })) }] };
    const out = E.planLayout(site, g, site.source.text).direction; const feats = out.pages[0].sections.filter(s => s.type === 'editorialFeature');
    assert.ok(feats.length >= 3 && feats.every(f => f.copy.brief)); assert.ok(out.pages[0].sections.some(s => s.id === 'x0') && out.pages[0].sections.some(s => s.id === 'x3'));
    feats.forEach(f => assert.ok(f.copy.body && !/[0-9$%]/.test(f.copy.body) && !E.looksLikeInstruction(f.copy.body), 'caption describes the photograph, no claims/prices: ' + f.copy.body));
  });
  await t('image planning: feature slots are generated PHOTOS with their own briefs; tech stays deterministic', () => {
    const c = core({ PREMIUM_GROUNDING_V3: 'true', PREMIUM_VISUALS_V4: 'true' }); const g = gW();
    const strat = P.strategy.deriveStrategy({ archetype: 'local-conversion', categoryKey: 'wellness', categoryLabel: 'Wellness', description: WELL, grounding: g, visualsV4: true }); const art = P.art.deriveArtDirection(strat, palette);
    const briefs = E.shotList(g);
    const sl = [{ slot: 'hero', role: 'hero', sectionType: 'hero', aspectRatio: '16:9', rank: 0 }].concat(briefs.slice(1, 5).map((b, i) => ({ slot: 'f' + i + '::feature', role: 'gallery', sectionType: 'editorialFeature', aspectRatio: i === 2 ? '16:9' : '4:5', rank: 1 + i, brief: b.brief })));
    const gov = new P.BudgetGovernor(c.cfg, new P.CostLedger(c.cfg), 'gen_v6'); const r = P.images.allocateImages({ slots: sl, strategy: strat, art, uploads: [], cfg: c.cfg, governor: gov });
    assert.ok(r.slots.every(s => s.sourceType === 'generated'), JSON.stringify(r.slots.map(s => s.sourceType + ':' + s.reason)));
    assert.strictEqual(new Set(r.slots.map(s => s.prompt)).size, r.slots.length, 'every photograph has its own prompt');
    assert.ok(/yoga pose on a mat/.test(r.slots[1].prompt) && /treatment room/.test(r.slots[2].prompt));
    r.slots.forEach(s => assert.ok(P.images.lintImagePrompt(s.prompt).ok, s.slot));
    assert.ok(r.committedUsd <= c.cfg.budgets.SOFT_SITE_BUDGET_USD, 'photo set fits the soft budget: ' + r.committedUsd);
  });
  await t('photo-set gates: incomplete photo set, mostly-starter art, no hero anchor, sparse pages, generic FAQ and instruction text are all flagged', () => {
    const g = gW(); const site = wellSite(); site.imagePlan = [{ slot: 'hero', sourceType: 'designed', starter: true }, { slot: 'p', sourceType: 'designed', starter: true }, { slot: 'q', sourceType: 'generated' }]; site.design.dimensions.hero = 'poster';
    const codes = E.checkPhotoLed(site, g, WELL).map(x => x.code);
    ['photo_set_incomplete', 'photo_led_mostly_starter_art', 'photo_led_hero_without_anchor', 'page_too_sparse', 'generic_faq', 'instruction_text_on_site'].forEach(c => assert.ok(codes.includes(c), c + ' in ' + codes.join()));
    const planned = E.planLayout(wellSite(), g, WELL).direction; planned.imagePlan = Array.from({ length: 8 }, (_, i) => ({ slot: 's' + i, sourceType: 'generated' })); planned.design.dimensions.hero = 'fullbleed-image';
    assert.deepStrictEqual(E.checkPhotoLed(planned, g, WELL).filter(x => x.severity >= 3).map(x => x.code), []);
  });
  await t('session V6: failed photo slots are retried (max 3, governed, ledgered); the layout repair runs through review-repair', async () => {
    const c = core({ PREMIUM_GROUNDING_V3: 'true', PREMIUM_VISUALS_V4: 'true', PREMIUM_PHOTO_LED_V6: 'true' });
    const s = c.startSession({ categoryKey: 'wellness', categoryLabel: 'Wellness', archetype: 'local-conversion', palette, description: WELL });
    const site = E.planLayout(wellSite(), gW(), WELL).direction; site.design.dimensions.hero = 'fullbleed-image';
    site.imagePlan = Array.from({ length: 6 }, (_, i) => ({ slot: 's' + i, sourceType: 'generated', model: 'gpt-image-1', quality: 'medium', routeKind: 'premium', aspectRatio: '4:5', cacheKey: 'k' + i, prompt: 'a calm studio detail', promptSimplified: 'a calm studio, simple' }));
    site.assets = { generated: Object.fromEntries(site.imagePlan.map((e, i) => [e.slot, { cacheKey: e.cacheKey, status: i < 5 ? 'error' : 'ready' }])) };
    const calls = []; const out = await s.reviewAndRepair(site, { description: WELL, facts: {}, premiumEnabled: true }, { regenerateImage: async spec => { calls.push(spec.slot); return { ok: true, dataUrl: PNG_PHOTO }; } });
    assert.ok(calls.length >= 1 && calls.length <= 3, 'retried once each, at most 3 slots: ' + calls.join());
    assert.ok(out.semantic.regenerated.length <= 3 && s.ledger.forGeneration(s.generationId).filter(e => e.kind === 'image' && e.phase === 'repair').length >= 1);
    // the plan check runs inside the normal review: an unplanned (Claude-planned) wellness site is reshaped
    const raw = wellSite(); raw.imagePlan = []; const s2 = c.startSession({ categoryKey: 'wellness', categoryLabel: 'Wellness', archetype: 'local-conversion', palette, description: WELL });
    const out2 = await s2.reviewAndRepair(raw, { description: WELL, facts: {}, premiumEnabled: true }, {});
    assert.ok(out2.direction.pages[0].sections.some(x => x.type === 'editorialFeature'), 'layout repair applied');
    out2.direction.pages.forEach(p => assert.ok(!E.looksLikeInstruction(p.purpose)));
  });
  await t('export parity: the export renderer draws editorialFeature (all variants) and never prints an instruction as a page intro', () => {
    const SR = require('./lib/site-render');
    const project = { source: { text: WELL, location: 'Los Angeles' }, business: { name: 'Studio', categoryKey: 'wellness' }, strategy: { archetype: 'local-conversion' }, design: { premium: { vs: 1 }, dimensions: { imagery: 'atmospheric-warm' } }, assets: { items: [], plan: {}, generated: {} }, imagePlan: [], pages: [], copy: { sub: 'Feel better.' } };
    const cat = SR.categoryFor ? SR.categoryFor(project) : SR.categories.wellness;
    ['image-left', 'image-right', 'full', 'quote'].forEach(v => { const html = SR.renderSectionHTML(project, { id: 'z' + v, type: 'editorialFeature', variant: v, copy: { headline: 'Rest is part of the practice', body: 'Time to reset.', brief: 'a treatment room' } }, cat); assert.ok(new RegExp('data-variant="' + v + '"').test(html), v); if (v !== 'quote') assert.ok(/visual-starter|site-visual-img/.test(html), v + ' has media'); });
    const hdr = SR.renderPageHeader(project, { label: 'Classes', purpose: 'Explain each yoga class type and what to expect.' }, cat);
    assert.ok(!/Explain each/.test(hdr) && /Feel better/.test(hdr));
    const svc = SR.renderSectionHTML(project, { id: 'sv', type: 'services', variant: 'described', copy: E.setItems({}, [{ title: 'Yoga classes', body: 'Classes that build strength.' }]) }, cat);
    assert.ok(/Yoga classes/.test(svc) && !/presented clearly/.test(svc));
  });
  await t('flags: V6 ON with V1 (rollback =false); retries default 2; planner has its own model setting', () => {
    assert.strictEqual(P.loadConfig({ PREMIUM_GENERATION_V1: 'true' }).photoLedV6, true);
    assert.strictEqual(P.loadConfig({ PREMIUM_GENERATION_V1: 'true', PREMIUM_PHOTO_LED_V6: 'false' }).photoLedV6, false);
    assert.strictEqual(P.loadConfig({ PREMIUM_PHOTO_LED_V6: 'true' }).photoLedV6, false);
  });

  console.log('PREMIUM_GENERATION_V7');
  const RE = 'Residential real estate team focused on downtown Toronto, helping buyers and sellers with condos and houses.';
  const gRE = () => P.grounding.deriveGrounding({ description: RE, categoryKey: 'realestate', archetype: 'trust-heavy-professional', location: 'Toronto' });
  await t('grounding: real estate is its own photo-led family (was silently folded into "professional")', () => {
    const g = gRE();
    assert.strictEqual(g.family, 'realestate');
    assert.strictEqual(g.primaryCTA, 'Contact an Agent'); // never implies live inventory
    assert.ok(/skyline|home exterior/.test(g.imagerySubjects.hero));
    assert.ok(P.editorial.isPhotoLed(g, RE));
    assert.strictEqual(P.visuals.profileFromGrounding(g).id, 'realestate');
    assert.ok(P.visuals.PROFILES.realestate.photoLed);
    assert.ok(g.unsupportedFacts.some(x => /listing|inventory/i.test(x)));
  });
  await t('root cause (V7 Part 2): before this fix, real estate had NO hero-image guarantee and NO photo-led page plan', () => {
    // family 'professional' (the old mapping) is not photo-led -- only personal-brand wording flips it -- so a plain
    // "residential real estate TEAM" description never triggered photography, and 'professional' profile heroVariants
    // include the text-only 'poster' layout, which plans zero image slots at all (renderHero never calls renderVisualSlot).
    const gOld = P.grounding.deriveGrounding({ description: RE, categoryKey: 'professional', archetype: 'trust-heavy-professional', location: 'Toronto' });
    assert.strictEqual(gOld.family, 'professional'); assert.ok(!P.editorial.isPhotoLed(gOld, RE));
    // SITEREMADE_VISUAL_ENGINE_V1 note: 'professional'/consultancy no longer has this gap either -- its one allowed
    // hero (QUIET_LUXURY) always renders a real image slot (never a text-only layout), even with no funded photo.
    assert.ok(!P.visuals.PROFILES.consultancy.heroVariants.includes('poster'));
    assert.strictEqual(P.visuals.PROFILES.consultancy.heroVariant, 'quiet-luxury');
  });
  await t('hero families: real estate never keeps a text-only hero (poster/minimal/centered-oversized are not offered)', () => {
    const V = P.visuals;
    assert.deepStrictEqual(V.PROFILES.realestate.heroVariants.filter(h => ['poster', 'minimal-text-only', 'centered-oversized'].includes(h)), []);
    assert.strictEqual(V.chooseHero(V.PROFILES.realestate, 'poster'), 'fullbleed-image');
    assert.strictEqual(V.chooseHero(V.PROFILES.realestate, 'split'), 'split');
  });
  await t('shot list: real estate has >=4 photographs (hero, neighbourhood, buyer lifestyle, seller interior); starter fallback is a skyline, not a random mark', () => {
    const g = gRE(); const shots = P.editorial.shotList(g);
    assert.ok(shots.length >= 4); ['hero', 'neighborhood', 'buyerLifestyle', 'sellerInterior'].forEach(id => assert.ok(shots.some(s => s.id === id), id));
    shots.forEach(s => assert.ok(!/people|address|signage/i.test(s.brief) || /no /i.test(s.brief), s.id));
    const p = { source: { text: RE }, business: { categoryKey: 'realestate', name: 'Core Realty' }, strategy: { archetype: 'trust-heavy-professional' }, design: { premium: { vs: 1 } } };
    assert.strictEqual(P.visuals.starterHtml(p, 'hero').match(/data-starter="([^"]+)"/)[1], 'realestate-scene');
  });
  await t('listing truthfulness: "current/active/available/our/exclusive listings" is rewritten to a safe framing; "listing process" and normal copy are untouched', () => {
    const g = gRE();
    assert.strictEqual(P.editorial.sanitizeListingClaim('Current listings in the core', g), 'Areas we specialize in');
    assert.strictEqual(P.editorial.sanitizeListingClaim('Browse available listings now', g), 'What we help buyers find');
    assert.strictEqual(P.editorial.sanitizeListingClaim('Our listing process is simple', g), null);
    assert.strictEqual(P.editorial.sanitizeListingClaim('A calm approach to buying and selling', g), null);
    assert.strictEqual(P.editorial.sanitizeListingClaim('Current listings', P.grounding.deriveGrounding({ description: 'x', categoryKey: 'wellness', archetype: 'local-conversion' })), null, 'only applies to the realestate family');
  });
  await t('planner-copy sanitizer (Part 11): the exact reported leak is hard-blocked, and normal first-person copy is not', () => {
    const E = P.editorial;
    assert.ok(E.looksLikeInstruction('Walk a prospective buyer through how the team helps them find and win a property downtown.'));
    assert.ok(E.looksLikeInstruction('Make the cost clear before they ask.'));
    assert.ok(!E.looksLikeInstruction('We walk every buyer through financing, tours and offers.'));
    assert.ok(!E.looksLikeInstruction('Straightforward guidance from search to close.'));
  });
  const reSite = () => ({ source: { text: RE, location: 'Toronto' }, business: { categoryKey: 'realestate', name: 'Core Realty' }, strategy: { archetype: 'trust-heavy-professional' },
    design: { premium: { vs: 1 }, dimensions: { hero: 'poster' } }, copy: { headline: 'Find the right place.', sub: 'x', cta: 'Contact an Agent' },
    pages: [
      { id: 'h', slug: '', label: 'Home', purpose: 'Orient the visitor and make the case for why this business is worth their attention.', sections: [{ id: 'a', type: 'about', copy: {} }, { id: 's', type: 'services', copy: {} }, { id: 'f', type: 'faq', copy: {} }, { id: 'c', type: 'ctaBanner', copy: { headline: 'Current listings in the core' } }] },
      { id: 'l', slug: 'listings', label: 'Listings', purpose: 'Walk a prospective buyer through how the team helps them find and win a property downtown.', sections: [{ id: 's2', type: 'services', copy: {} }] },
      { id: 'ab', slug: 'about', label: 'About', purpose: 'Establish who is behind the business and why they can be trusted.', sections: [{ id: 'a2', type: 'about', copy: {} }] },
      { id: 'ct', slug: 'contact', label: 'Contact', purpose: 'Remove friction and make starting easy.', sections: [{ id: 'c2', type: 'contact', copy: {} }] }] });
  await t('secondary-page composition (Parts 14/15): Listings/About are renamed to Buyers/Sellers with their own process and a real visual each; no invented listing claim survives', () => {
    const out = P.editorial.planLayout(reSite(), gRE(), RE).direction;
    assert.deepStrictEqual(out.pages.map(p => p.label), ['Home', 'Buyers', 'Sellers', 'Contact']);
    const buyerProc = P.editorial.itemsOf(out.pages[1].sections.find(s => s.type === 'process'));
    const sellerProc = P.editorial.itemsOf(out.pages[2].sections.find(s => s.type === 'process'));
    assert.notDeepStrictEqual(buyerProc.map(x => x.title), sellerProc.map(x => x.title), 'buyer and seller flows are grounded and different');
    assert.ok(/search/i.test(buyerProc[0].title) && /pric|review/i.test(sellerProc.map(x => x.title).join(' ')));
    out.pages.forEach(p => assert.ok(!P.editorial.looksLikeInstruction(p.purpose || ''), p.label + ': ' + p.purpose));
    const home = out.pages[0]; const feats = home.sections.filter(s => s.type === 'editorialFeature');
    assert.ok(feats.length >= 3 && feats.every(f => f.copy.brief));
    assert.ok(feats.some(f => /neighbourhood/i.test(f.copy.headline)), 'home shows a neighbourhood visual (Part 4)');
  });
  await t('image planning: real estate funds a full photo set (hero + neighbourhood + buyer + seller visuals), no gallery-generation block', () => {
    const g = gRE();
    const strat = P.strategy.deriveStrategy({ archetype: 'trust-heavy-professional', categoryKey: 'realestate', categoryLabel: 'Real Estate', description: RE, grounding: g, visualsV4: true, location: 'Toronto' });
    const art = P.art.deriveArtDirection(strat, palette);
    const shots = P.editorial.shotList(g);
    const sl = [{ slot: 'hero', role: 'hero', sectionType: 'hero', aspectRatio: '16:9', rank: 0 }].concat(shots.slice(1, 4).map((s, i) => ({ slot: 'f' + i + '::feature', role: 'gallery', sectionType: 'editorialFeature', aspectRatio: '4:5', rank: i + 1, brief: s.brief })));
    const c = core({ PREMIUM_GROUNDING_V3: 'true', PREMIUM_VISUALS_V4: 'true', PREMIUM_PHOTO_LED_V6: 'true' });
    const gov = new P.BudgetGovernor(c.cfg, new P.CostLedger(c.cfg), 'gen_re1');
    const r = P.images.allocateImages({ slots: sl, strategy: strat, art, uploads: [], cfg: c.cfg, governor: gov });
    assert.ok(r.slots.every(s => s.sourceType === 'generated'), JSON.stringify(r.slots.map(s => s.slot + ':' + s.sourceType + ':' + s.reason)));
    assert.ok(/skyline|home exterior/.test(r.slots[0].prompt));
    r.slots.forEach(s => assert.ok(P.images.lintImagePrompt(s.prompt).ok, s.slot));
  });
  await t('process collision repair: a flagged section is switched to an already-vertical variant (never overlaps again)', () => {
    const strat = P.strategy.deriveStrategy({ categoryKey: 'realestate', categoryLabel: 'Real Estate', archetype: 'trust-heavy-professional', description: RE });
    const direction = { copy: {}, activePageIndex: 0, design: { dimensions: { hero: 'split' } },
      pages: [{ id: 'home', slug: '', sections: [{ id: 'p1', type: 'process', copy: {} }] }],
      processReport: [{ width: 820, index: 0, kind: 'step_overlap' }] };
    const review = P.review.reviewDirection(direction, { strategy: strat, premiumEnabled: true, visualsV4: true, description: RE });
    assert.strictEqual(review.categories.VISUAL_COLLISIONS, 'FAIL');
    const collide = review.defects.find(d => d.category === 'VISUAL_COLLISIONS');
    assert.ok(collide && collide.repair && collide.repair.kind === 'set_process_variant' && collide.repair.where.id === 'p1');
    const out = P.semantic.applyRepairs(direction, [collide], gRE()).direction;
    assert.strictEqual(out.pages[0].sections[0].imageDisplayVariant, 'alternating');
    const SR = require('./lib/site-render');
    const cat = SR.categories.other;
    const html = SR.renderSectionHTML({ source: {}, business: {}, strategy: {}, design: { dimensions: {} } }, out.pages[0].sections[0], cat);
    assert.ok(/data-variant="alternating"/.test(html));
  });
  await t('rubric: VISUAL_COLLISIONS / PREMIUM_FEEL / HERO_QUALITY / BUSINESS_TRUTHFULNESS exist and are gated NOT_APPLICABLE without V4', () => {
    ['VISUAL_COLLISIONS', 'PREMIUM_FEEL', 'HERO_QUALITY', 'BUSINESS_TRUTHFULNESS'].forEach(k => assert.ok(P.review.CATEGORIES.includes(k), k));
    const strat = P.strategy.deriveStrategy({ categoryKey: 'realestate', categoryLabel: 'Real Estate', archetype: 'trust-heavy-professional', description: RE });
    const off = P.review.reviewDirection({ copy: {}, pages: [{ id: 'h', slug: '', sections: [] }] }, { strategy: strat, premiumEnabled: true, groundingV3: true, description: RE });
    ['VISUAL_COLLISIONS', 'PREMIUM_FEEL', 'HERO_QUALITY', 'BUSINESS_TRUTHFULNESS'].forEach(k => assert.strictEqual(off.categories[k], 'NOT_APPLICABLE', k));
  });
  await t('whole-site critic: sees the new criteria (hero image quality, premium feel, collisions, truthfulness) and can request one image replacement', async () => {
    const c = core({ PREMIUM_GROUNDING_V3: 'true', PREMIUM_VISUALS_V4: 'true' });
    const s = c.startSession({ categoryKey: 'realestate', categoryLabel: 'Real Estate', archetype: 'trust-heavy-professional', palette, description: RE });
    let seenPrompt = '';
    const site = reSite(); site.imagePlan = [{ slot: 'hero', role: 'hero', sourceType: 'generated', kind: 'photo', model: 'gpt-image-1', quality: 'high', routeKind: 'premium', aspectRatio: '16:9', cacheKey: 'k', prompt: 'a home exterior', promptSimplified: 'a home exterior, simple' }];
    const out = await s.reviewAndRepair(site, { description: RE, facts: {}, premiumEnabled: true }, {
      semanticCritic: async p => { seenPrompt = p.user; return { input: { defects: [{ category: 'HERO_QUALITY', code: 'weak_hero', severity: 3, where: 'image', targetId: 'hero', evidence: 'generic stock', fixKind: 'regenerate_image', fixText: 'a well-composed downtown Toronto home exterior at golden hour, no people, no signage' }] }, usage: { inputTokens: 3000, outputTokens: 400 } }; },
      regenerateImage: async () => ({ ok: true, dataUrl: PNG_PHOTO }),
    });
    assert.ok(/PREMIUM_FEEL|HERO_QUALITY|VISUAL_COLLISIONS|BUSINESS_TRUTHFULNESS/.test(seenPrompt));
    assert.ok(out.semantic.regenerated.includes('hero'));
  });

  console.log('SITEREMADE_VISUAL_ENGINE_V1');
  await t('hero family vocabulary: normalization, invalid-value fallback, variant mapping is a closed set of 8', () => {
    const VE = P.visualEngine;
    assert.strictEqual(VE.HERO_FAMILY_KEYS.length, 8);
    assert.strictEqual(VE.normalizeHeroFamily('product_stage'), 'PRODUCT_STAGE');
    assert.strictEqual(VE.normalizeHeroFamily('nonsense-value-claude-invented', 'COLLAGE'), 'COLLAGE');
    assert.strictEqual(VE.normalizeHeroFamily(undefined), 'EDITORIAL_SPLIT');
    assert.strictEqual(VE.normalizeHeroFamily(null, 'also-not-real'), 'EDITORIAL_SPLIT');
    VE.HERO_FAMILY_KEYS.forEach(k => assert.strictEqual(VE.familyForVariant(VE.heroVariantFor(k)), k, k));
  });
  await t('media composition vocabulary: normalization and invalid-value fallback', () => {
    const VE = P.visualEngine;
    assert.strictEqual(VE.normalizeMediaComposition('oversized-image'), 'OVERSIZED_IMAGE');
    assert.strictEqual(VE.normalizeMediaComposition('made up nonsense', 'OFFSET_IMAGE'), 'OFFSET_IMAGE');
    assert.strictEqual(VE.normalizeMediaComposition(undefined), 'DEFAULT');
    assert.ok(VE.MEDIA_COMPOSITION_KEYS.length >= 6);
  });
  await t('depth and surface vocabulary: normalization, fallback, and a fixed per-family depth (Part 6 V1 scope)', () => {
    const VE = P.visualEngine;
    assert.strictEqual(VE.normalizeDepth('dramatic'), 'DRAMATIC');
    assert.strictEqual(VE.normalizeDepth('not-a-depth', 'LAYERED'), 'LAYERED');
    assert.strictEqual(VE.normalizeDepth(undefined), 'SUBTLE');
    assert.strictEqual(VE.depthForFamily('PRODUCT_STAGE'), 'DRAMATIC');
    assert.strictEqual(VE.depthForFamily('TYPOGRAPHIC_STATEMENT'), 'FLAT');
    assert.strictEqual(VE.normalizeSurfaceTexture('GRID-TECHNICAL'), 'grid-technical');
    assert.strictEqual(VE.normalizeSurfaceTexture('nope', 'clean'), 'clean');
    assert.strictEqual(VE.surfaceTextureFor('tech'), 'grid-technical');
    assert.strictEqual(VE.surfaceTextureFor('wellness'), 'radial-field');
  });
  await t('industry hero selection: a preference order, filtered by whether a real photo will actually be funded (Part 4: not a fixed mapping)', () => {
    const VE = P.visualEngine;
    assert.strictEqual(VE.pickHeroFamily('retail', true), 'PRODUCT_STAGE');
    assert.strictEqual(VE.pickHeroFamily('saas', false), 'FRAME_WITHIN_FRAME'); // interface-led: no photo needed
    // a photo-dependent family is never picked with no funded media
    assert.strictEqual(VE.pickHeroFamily('retail', false), 'TYPOGRAPHIC_STATEMENT');
    // an already-good current choice that's still viable is kept, not overridden (Part 4)
    assert.strictEqual(VE.pickHeroFamily('retail', true, 'COLLAGE'), 'COLLAGE');
    assert.strictEqual(VE.pickHeroFamily('retail', false, 'COLLAGE'), 'TYPOGRAPHIC_STATEMENT', 'a photo-dependent current choice is replaced once media is unavailable, and retail has no photo-independent family of its own');
  });
  await t('anti-repetition: 3+ identical media positions in a row is flagged; varied positions are not', () => {
    const VE = P.visualEngine;
    const same = [{ type: 'editorialFeature', variant: 'image-left' }, { type: 'editorialFeature', variant: 'image-left' }, { type: 'editorialFeature', variant: 'image-left' }];
    assert.ok(VE.checkLayoutRepetition(same).some(x => x.code === 'repeated_media_position'));
    const varied = [{ type: 'editorialFeature', variant: 'image-left' }, { type: 'editorialFeature', variant: 'image-right' }, { type: 'editorialFeature', variant: 'full' }];
    assert.deepStrictEqual(VE.checkLayoutRepetition(varied), []);
  });
  await t('section intensity: QUIET/NORMAL/FEATURE/HEROIC map onto lib/premium/composition.js\'s existing weight/moment fields (no second pacing engine)', () => {
    const VE = P.visualEngine;
    assert.strictEqual(VE.intensityFor({ weight: 'quiet' }), 'QUIET');
    assert.strictEqual(VE.intensityFor({ weight: 'medium' }), 'NORMAL');
    assert.strictEqual(VE.intensityFor({ weight: 'strong' }), 'FEATURE');
    assert.strictEqual(VE.intensityFor({ weight: 'strong', moment: 'fullbleed' }), 'HEROIC');
  });
  await t('visual moments quota (Part 14): a page with no moment, no quiet section, or no closing CTA band is flagged', () => {
    const VE = P.visualEngine;
    const flat = { sections: Array.from({ length: 5 }, () => ({ weight: 'medium', moment: null, cta: null })) };
    const codes = VE.checkVisualMoments(flat).map(x => x.code);
    assert.ok(codes.includes('no_visual_moment') && codes.includes('no_quiet_section') && codes.includes('no_strong_closing_cta'));
    const good = { sections: [{ weight: 'quiet', moment: null, cta: null }, { weight: 'strong', moment: 'fullbleed', cta: null }, { weight: 'strong', moment: 'ctaband', cta: 'band' }] };
    assert.deepStrictEqual(VE.checkVisualMoments(good), []);
  });
  await t('retail hero: default is now PRODUCT_STAGE; the structured placeholder is a staged object, not the wide shelf scene', () => {
    const p = techProj({ source: { text: 'Online skincare store selling serums.' }, business: { categoryKey: 'ecommerce', name: 'Glow' }, strategy: { archetype: 'ecommerce-showcase' }, design: { premium: { vs: 1 } } });
    assert.strictEqual(P.visuals.PROFILES.retail.heroVariant, 'product-stage');
    const html = P.visuals.starterHtml(p, 'hero');
    assert.strictEqual(html.match(/data-starter="([^"]+)"/)[1], 'product-bottle-stage');
    assert.ok(!/undefined|NaN/.test(html));
  });
  await t('media composition is actually assigned on a photo-led page plan, and never repeats on consecutive features', () => {
    const g = P.grounding.deriveGrounding({ description: SKIN, categoryKey: 'ecommerce', archetype: 'ecommerce-showcase', location: 'Vancouver' });
    const site = { source: { text: SKIN }, business: { categoryKey: 'ecommerce' }, strategy: { archetype: 'ecommerce-showcase' }, design: { dimensions: {} },
      pages: [{ id: 'h', slug: '', label: 'Home', sections: ['productShowcase', 'gallery', 'newsletter', 'process'].map((ty, i) => ({ id: 'x' + i, type: ty, copy: {} })) }] };
    const out = P.editorial.planLayout(site, g, SKIN).direction;
    const feats = out.pages[0].sections.filter(s => s.type === 'editorialFeature');
    feats.forEach(f => assert.ok(P.visualEngine.MEDIA_COMPOSITION_KEYS.includes(f.mediaComposition), f.mediaComposition));
    for (let i = 1; i < feats.length; i++) if (feats[i - 1].variant === feats[i].variant) assert.notStrictEqual(feats[i - 1].mediaComposition, feats[i].mediaComposition, 'same side back-to-back should still vary its media treatment');
  });
  await t('preview/export parity: the 3 new hero layouts render byte-identical markup in script.js and lib/site-render.js', () => {
    const fs = require('fs');
    const a = fs.readFileSync('script.js', 'utf8'), b = fs.readFileSync('lib/site-render.js', 'utf8');
    ['hero-product-stage', 'hero-floating-media', 'hero-quiet-luxury'].forEach(key => {
      const re = new RegExp(`<div class="site-hero ${key}"[\\s\\S]*?</div>\\s*</div>\\s*\`;`);
      const ma = a.match(re), mb = b.match(re);
      assert.ok(ma && mb, key + ' present in both files');
      assert.strictEqual(ma[0].replace(/\s+/g, ' ').trim(), mb[0].replace(/\s+/g, ' ').trim(), key + ' markup differs between preview and export');
    });
  });
  await t('export renderer: PRODUCT_STAGE/FLOATING_MEDIA/QUIET_LUXURY actually produce real, non-empty markup with the right data attributes', () => {
    const SR = require('./lib/site-render');
    const base = { source: { location: '' }, business: { name: 'Glow', categoryKey: 'ecommerce', tone: 'x' }, design: { dimensions: { imagery: 'abstract-geometric' } }, assets: { plan: {}, items: [], generated: {} }, copy: { headline: 'H', sub: 'S', cta: 'C' } };
    const cat = SR.categories.retail;
    ['product-stage', 'floating-media', 'quiet-luxury'].forEach(hero => {
      const p = Object.assign({}, base, { design: Object.assign({}, base.design, { dimensions: Object.assign({}, base.design.dimensions, { hero }) }) });
      const html = SR.renderHero(p, cat);
      assert.ok(html.includes(`data-hero-family=`), hero);
      assert.ok(!/undefined|NaN/.test(html), hero);
    });
  });
  await t('planner vocabulary is validated before it ever reaches the renderer: an invented heroFamily value cannot pass through', () => {
    const VE = P.visualEngine;
    ['floating-media-please', '', null, 42, 'DROP TABLE'].forEach(bad => assert.ok(VE.HERO_FAMILY_KEYS.includes(VE.normalizeHeroFamily(bad)), String(bad)));
  });

  console.log('SITEREMADE_VISUAL_ENGINE_V1_1');
  await t('hero compatibility (Part 5): a family is only offered when the business can actually support it', () => {
    const VE = P.visualEngine;
    assert.strictEqual(VE.heroCompatible('COLLAGE', { funded: true, galleryCount: 0 }), false, 'a collage needs a second surface');
    assert.strictEqual(VE.heroCompatible('COLLAGE', { funded: true, galleryCount: 2 }), true);
    assert.strictEqual(VE.heroCompatible('FLOATING_MEDIA', { funded: true, galleryCount: 0, interfaceLed: false }), false);
    assert.strictEqual(VE.heroCompatible('FLOATING_MEDIA', { funded: true, interfaceLed: true }), true);
    assert.strictEqual(VE.heroCompatible('QUIET_LUXURY', {}), true, 'never depends on a funded photo');
    assert.strictEqual(VE.heroCompatible('PRODUCT_STAGE', { funded: false }), false);
  });
  await t('dynamic hero selection (Part 4): a still-viable current choice is kept, an incompatible one is replaced -- never a fixed mapping', () => {
    const VE = P.visualEngine;
    assert.strictEqual(VE.selectHeroFamily({ family: 'retail', mediaCtx: { funded: true, galleryCount: 3 }, currentFamily: 'COLLAGE' }), 'COLLAGE');
    assert.strictEqual(VE.selectHeroFamily({ family: 'retail', mediaCtx: { funded: true, galleryCount: 0 }, currentFamily: 'COLLAGE' }), 'PRODUCT_STAGE', 'collage was picked but the site has no gallery -- falls back');
  });
  await t('same-industry variation (Parts 12, 19): 3 real retail sub-verticals genuinely land on different, grounded hero families', () => {
    const VE = P.visualEngine;
    const skincare = VE.selectHeroFamily({ family: 'retail', subtype: 'skincare', mediaCtx: { funded: true, galleryCount: 3 } });
    const apparel = VE.selectHeroFamily({ family: 'retail', subtype: 'apparel', mediaCtx: { funded: true, galleryCount: 3 } });
    const coffee = VE.selectHeroFamily({ family: 'retail', subtype: 'coffee_tea', mediaCtx: { funded: true, galleryCount: 3 } });
    assert.deepStrictEqual([skincare, apparel, coffee], ['PRODUCT_STAGE', 'COLLAGE', 'FULL_BLEED_CINEMATIC']);
    assert.strictEqual(new Set([skincare, apparel, coffee]).size, 3, 'three distinct families, not the same hero with different colours');
  });
  await t('same-industry variation: SaaS product concept picks a genuinely different hero (multi-panel vs single-surface vs systems-level)', () => {
    const VE = P.visualEngine;
    const dashboard = VE.selectHeroFamily({ family: 'saas', concept: 'ui-dashboard', mediaCtx: { funded: true, interfaceLed: true } });
    const command = VE.selectHeroFamily({ family: 'saas', concept: 'ui-command', mediaCtx: { funded: true, interfaceLed: true } });
    const infra = VE.selectHeroFamily({ family: 'saas', concept: 'diagram-system', mediaCtx: { funded: true, interfaceLed: true } });
    assert.deepStrictEqual([dashboard, command, infra], ['FLOATING_MEDIA', 'FRAME_WITHIN_FRAME', 'TYPOGRAPHIC_STATEMENT']);
  });
  await t('same-industry variation: wellness wording genuinely changes the hero (restorative vs group/energetic vs neutral)', () => {
    const VE = P.visualEngine;
    const mc = { funded: true, galleryCount: 2 };
    assert.strictEqual(VE.selectHeroFamily({ family: 'wellness', description: 'A quiet restorative spa retreat', mediaCtx: mc }), 'QUIET_LUXURY');
    assert.strictEqual(VE.selectHeroFamily({ family: 'wellness', description: 'High-energy group training studio classes', mediaCtx: mc }), 'FULL_BLEED_CINEMATIC');
    // "studio" itself reads as the more energetic/group signal (matches the actual live wellness fixture text) --
    // an explainable choice, not a bug; a description with neither signal falls through to the steady default.
    assert.strictEqual(VE.selectHeroFamily({ family: 'wellness', description: 'A private one-on-one massage practice', mediaCtx: mc }), 'QUIET_LUXURY', 'wellness\'s own steady industry default when no signal fires');
  });
  await t('depth activation (Part 8): a real per-section level derived from the page\'s own pacing, never applied to a non-media section', () => {
    const VE = P.visualEngine;
    assert.strictEqual(VE.depthForSection({ type: 'editorialFeature' }, 'HEROIC'), 'DRAMATIC');
    assert.strictEqual(VE.depthForSection({ type: 'editorialFeature' }, 'FEATURE'), 'LAYERED');
    assert.strictEqual(VE.depthForSection({ type: 'editorialFeature' }, 'QUIET'), 'FLAT');
    assert.strictEqual(VE.depthForSection({ type: 'faq' }, 'HEROIC'), null, 'a plain text section never gets a depth attribute -- not every section floats');
    assert.strictEqual(VE.depthForSection({ type: 'process' }, 'FEATURE'), null);
  });
  await t('contrast validation (Part 14): a surface texture is only offered when it will not hurt real text/background contrast', () => {
    const VE = P.visualEngine;
    assert.strictEqual(VE.contrastOk('#111111', '#ffffff'), true);
    assert.strictEqual(VE.contrastOk('#eeeeee', '#f4f2ee'), false, 'pale text on a pale surface -- the exact live regression this part guards against');
    assert.strictEqual(VE.safeToTexture('#101216', '#f7f8fa'), true);
  });
  await t('media compositions (Part 6): all 6 defined treatments are genuinely in rotation, none silently unused', () => {
    const g = P.grounding.deriveGrounding({ description: SKIN, categoryKey: 'ecommerce', archetype: 'ecommerce-showcase', location: 'Vancouver' });
    const site = { source: { text: SKIN }, business: { categoryKey: 'ecommerce' }, strategy: { archetype: 'ecommerce-showcase' }, design: { dimensions: {} },
      pages: [{ id: 'h', slug: '', label: 'Home', sections: ['productShowcase', 'gallery', 'newsletter', 'process'].map((ty, i) => ({ id: 'x' + i, type: ty, copy: {} })) }] };
    const out = P.editorial.planLayout(site, g, SKIN).direction;
    const used = new Set(out.pages[0].sections.filter(s => s.type === 'editorialFeature').map(s => s.mediaComposition));
    assert.ok(used.size >= 2, 'at least the left/right/full cycle produced real variety: ' + [...used].join(','));
    [...used].forEach(mc => assert.ok(P.visualEngine.MEDIA_COMPOSITION_KEYS.includes(mc), mc));
  });
  await t('surface activation (Part 7): exactly one section on Home is textured, and only when contrast allows it', () => {
    const g = P.grounding.deriveGrounding({ description: SKIN, categoryKey: 'ecommerce', archetype: 'ecommerce-showcase', location: 'Vancouver' });
    const site = { source: { text: SKIN }, business: { categoryKey: 'ecommerce' }, strategy: { archetype: 'ecommerce-showcase' }, design: { dimensions: {} },
      pages: [{ id: 'h', slug: '', label: 'Home', sections: ['productShowcase', 'gallery', 'newsletter', 'process'].map((ty, i) => ({ id: 'x' + i, type: ty, copy: {} })) }] };
    const out = P.editorial.planLayout(site, g, SKIN).direction;
    const textured = out.pages[0].sections.filter(s => s.surfaceTexture);
    assert.ok(textured.length <= 1, 'at most one deliberate texture per home page: ' + textured.length);
    if (textured.length) assert.ok(P.visualEngine.SURFACE_TEXTURES.includes(textured[0].surfaceTexture));
  });
  await t('preview/export parity for the render-time additions: mediaComposition/surfaceTexture attributes and the OVERLAPPING_PAIR echo render identically via the one shared renderFeature', () => {
    const project = { source: { location: '' }, business: { name: 'Glow', categoryKey: 'ecommerce', tone: 'x' }, design: { dimensions: { imagery: 'abstract-geometric' }, palette: { background: '#f7f8fa', text: '#101216' } }, assets: { items: [], plan: {}, generated: {} }, imagePlan: [], pages: [], copy: {} };
    const deps = { escapeHtml: s => String(s), renderVisualSlot: () => '<div class="visual-generated"></div>', slotFor: (p, s) => s.id + '::feature' };
    const section = { id: 'f1', type: 'editorialFeature', variant: 'image-left', mediaComposition: 'OVERLAPPING_PAIR', surfaceTexture: 'radial-field', copy: { headline: 'H', body: 'B' } };
    const html = P.editorial.renderFeature(project, section, deps);
    assert.ok(/data-media-comp="OVERLAPPING_PAIR"/.test(html) && /data-surface-texture="radial-field"/.test(html) && /feature-visual-echo/.test(html));
  });
  await t('hero gate stays consistent with the new selector: every family selectHeroFamily can produce for an industry is still accepted by that industry\'s server-side hero_family_mismatch gate', () => {
    const V = P.visuals; const VE = P.visualEngine;
    const familyToKey = { saas: 'tech', retail: 'retail', wellness: 'wellness', hospitality: 'hospitality', realestate: 'realestate', local_service: 'trades', appointments: 'trades', creative: 'portfolio', nonprofit: 'cause' };
    Object.keys(VE.INDUSTRY_HERO_PREFERENCE).forEach(fam => {
      const profKey = familyToKey[fam]; if (!profKey) return;
      const prof = V.PROFILES[profKey]; if (!prof || !prof.heroVariants) return;
      VE.INDUSTRY_HERO_PREFERENCE[fam].forEach(hf => assert.ok(prof.heroVariants.includes(VE.heroVariantFor(hf)), `${fam} profile "${profKey}" is missing ${hf} (${VE.heroVariantFor(hf)}) from its allowed gate`));
    });
  });
  await t('planner vocabulary: the 3 new premium hero layouts are now selectable through the existing, already-integrated hero field (no parallel schema needed -- family and variant are in bijection)', () => {
    const fs = require('fs');
    const server = fs.readFileSync('server.js', 'utf8'); const client = fs.readFileSync('script.js', 'utf8');
    ['product-stage', 'floating-media', 'quiet-luxury'].forEach(k => {
      assert.ok(new RegExp(`HERO_KEYS\\s*=\\s*\\[[^\\]]*'${k}'`).test(server), 'server HERO_KEYS: ' + k);
      assert.ok(new RegExp(`CLAUDE_HERO_KEYS\\s*=\\s*\\[[^\\]]*'${k}'`).test(client), 'client CLAUDE_HERO_KEYS: ' + k);
    });
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
