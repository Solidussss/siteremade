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
const env = over => Object.assign({ PREMIUM_GENERATION_V1: 'true' }, over || {});
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
    assert.deepStrictEqual([b.TARGET_FIRST_DRAFT_USD, b.TARGET_PUBLISHABLE_SITE_USD, b.SOFT_SITE_BUDGET_USD, b.HARD_SITE_BUDGET_USD], [1.5, 3, 4, 5]);
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
    assert.strictEqual(by['gallery-0'].sourceType, 'designed'); assert.strictEqual(by['gallery-0'].reason, 'real_project_media_only');
    assert.strictEqual(by['gallery-featured'].premiumRole, 'editorial');
  });
  await t('hero gets the highest-quality route; decorative never gets an expensive one', () => {
    const c = core(), s = startRoofing(c);
    const r = s.planImages({ slots: slots().concat([{ slot: 'deco', role: 'gallery', sectionType: 'contact', aspectRatio: '4:3', rank: 9 }]), uploads: [] });
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
  await t('at most ONE automatic retry, then fallback (never the same concept repeatedly)', () => {
    const cfg = P.loadConfig({}), bad = { poor: true };
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

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
