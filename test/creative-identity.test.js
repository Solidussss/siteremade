'use strict';
// CREATIVE IDENTITY AND AMBITION: what the brief is about is decided by rules (lib/creative/identity.js) from the model's
// reading, the brief's own words and what the open web says -- the same brief resolves the same way on every run, and a
// name nothing explains is asked about with fixed options, never guessed. The art direction is chosen INSIDE that
// identity (art.js: genre from the identity type, a visual ambition, a named concept), and the director cannot swap it.
// (Real calls on "Make a website based off of Neegy." answered invented / fictional / unknown at random before this.)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const ID = require('../lib/creative/identity');
const ART = require('../lib/creative/art');
const ai = require('../lib/creative/ai');
const D = require('../lib/creative/discovery');
const { validatePlan2 } = require('../lib/creative/validate2');

// what Google returned for "Neegy" (trimmed from a real search): a weak song panel, Know Your Meme, meme explainers
const NEEGY_WEB = { kg: { title: 'Neegy', type: 'Song by Vault Uploads ‧ 2026', description: '' }, results: [
  { link: 'https://www.reddit.com/r/PeterExplainsTheJoke/x', title: 'What\'s "neegy" Peter?', snippet: 'This is the "Neegy" meme, and it\'s a big piece of internet brain rot that started from a viral Fortnite voice chat clip.' },
  { link: 'https://www.youtube.com/watch?v=x', title: 'what does neegy mean?', snippet: 'Fortnite clips, insane plays, tournaments, and more.' },
  { link: 'https://knowyourmeme.com/memes/neegy', title: 'neegy meme', snippet: 'neegy meme from tiktok' },
  { link: 'https://www.tiktok.com/discover/neegy', title: 'Who Is Neegy Original Girl', snippet: 'the viral Neegy meme and how creators use the Neegy sound.' },
  { link: 'https://www.tiktok.com/discover/neegy-meaning', title: 'Neegy What Does That Mean', snippet: 'Neegy, also known as Neegie, is a slang term and brainrot meme based around a viral Fortnite clip.' },
] };
const BRIEF = 'Make a website based off of Neegy.';
// the readings the understanding model actually gave for that brief, run to run
const GUESSES = [
  { identity: { name: 'Neegy', kind: 'invented', type: 'invented', recognized: false, confidence: 'low' }, clarify: { needed: true, options: [{ label: 'A character or creature' }, { label: 'A brand or product' }] } },
  { identity: { name: 'Neegy', kind: 'fictional', type: 'fictional-character', recognized: false, confidence: 'low' }, clarify: { needed: true, options: [{ label: 'A personal subject' }, { label: 'A fictional character or franchise' }] } },
  { identity: { name: 'Neegy', kind: 'recognizable', type: 'unknown', recognized: false, confidence: 'low' }, clarify: { needed: true, options: [{ label: 'A personal pet or animal' }, { label: 'A brand, product, or service' }] } },
  { identity: { name: 'Neegy', kind: 'personal', type: 'personal', recognized: false, confidence: 'low' } },
  { identity: { name: 'Neegy', kind: 'invented', confidence: 'medium' } },
];

test('identity: one brief, every reading the model gave, the same evidence -> the same identity (a meme), every time', () => {
  const ev = ID.webEvidence(NEEGY_WEB);
  assert.ok(ev.scores.meme >= 4, JSON.stringify(ev.scores));
  assert.ok(!ev.scores.franchise, 'a song panel and the word Fortnite are not a game franchise');
  const out = GUESSES.map(raw => ID.resolve({ raw, brief: BRIEF, web: ev }));
  out.forEach(x => { assert.equal(x.type, 'meme', JSON.stringify(x)); assert.equal(x.status, 'resolved'); assert.equal(x.source, 'web'); });
  // determinism: the same inputs give exactly the same answer
  assert.deepEqual(ID.resolve({ raw: GUESSES[0], brief: BRIEF, web: ev }), ID.resolve({ raw: GUESSES[0], brief: BRIEF, web: ev }));
  assert.ok(out.every(x => x.confidence > 0.55 && x.confidence < 1), 'confident, not certain');
});

test('identity: a name with NO evidence is ambiguous -- asked with fixed options, never resolved as invented or personal from the model\'s guess', () => {
  const out = GUESSES.map(raw => ID.resolve({ raw, brief: 'Make a website about Blorvix.', web: ID.webEvidence({ kg: null, results: [] }) }));
  out.forEach(x => { assert.equal(x.status, 'ambiguous', JSON.stringify(x)); assert.ok(!['invented', 'personal'].includes(x.type)); });
  // the options do not depend on what the model wrote
  const opts = out.map(x => ID.options(x).map(o => o.title).sort().join('|'));
  assert.equal(new Set(opts).size, 1, opts.join('\n'));
  assert.ok(ID.options(out[0]).some(o => o.type === 'meme') && ID.options(out[0]).some(o => o.type === 'personal') && ID.options(out[0]).some(o => o.type === 'invented'));
  // applied to the understanding: a question with those options, no research, no picture search intent
  const u = ID.applyIdentity(ai.normaliseUnderstanding(GUESSES[0], 'Make a website about Blorvix.'), out[0], GUESSES[0]);
  assert.equal(u.kind, 'ambiguous'); assert.equal(u.clarify.question, ID.QUESTION); assert.equal(u.clarify.options.length, ID.ORDER.length);
  assert.ok(u.clarify.options.every(o => o.wikipediaTitle === ''), 'a kind of thing is never sent as an article title');
});

test('identity: the owner\'s pick of a fixed option decides the type; the brief\'s own words decide personal and invented', () => {
  ID.ORDER.forEach(t => { assert.equal(ID.choiceType(ID.LABELS[t][0]), t); const x = ID.resolve({ raw: GUESSES[2], brief: BRIEF, choice: ID.LABELS[t][0] }); assert.equal(x.type, t); assert.equal(x.source, 'owner'); });
  assert.equal(ID.choiceType('Princess Zelda'), null);
  // a named article chosen from a clarification is never asked about again
  assert.equal(ID.resolve({ raw: { identity: { name: 'Zelda', kind: 'fictional', type: 'fictional-character', confidence: 'medium' }, clarify: { needed: true, options: [{ label: 'a', wikipediaTitle: 'A' }, { label: 'b', wikipediaTitle: 'B' }] } }, brief: 'Zelda', choice: 'Princess Zelda' }).status, 'resolved');
  const dog = ID.resolve({ raw: { identity: { name: 'Rex', kind: 'recognizable', type: 'real-person', recognized: true, confidence: 'high' } }, brief: 'A page for my dog Rex' });
  assert.equal(dog.type, 'personal'); assert.equal(ID.wantsWeb({ identity: { name: 'Rex' } }, 'A page for my dog Rex'), false, 'a personal subject is never searched for');
  const land = ID.resolve({ raw: { identity: { name: 'Catland', kind: 'invented', type: 'invented', recognized: true, confidence: 'high' } }, brief: 'an imaginary country run entirely by cats' });
  assert.equal(land.type, 'invented'); assert.equal(land.status, 'invented');
  assert.equal(ID.legacyKind('meme', 'resolved'), 'recognizable'); assert.equal(ID.legacyKind('fictional-character', 'resolved'), 'fictional'); assert.equal(ID.legacyKind('unknown', 'ambiguous'), 'ambiguous');
});

test('identity: a known subject resolves from the model and the search panel; several real things with one name are still asked about', () => {
  const ssbu = ID.resolve({ raw: { identity: { name: 'Super Smash Bros. Ultimate', kind: 'recognizable', type: 'franchise', recognized: true, confidence: 'high' } }, brief: 'Super Smash Bros. Ultimate', web: ID.webEvidence({ kg: { title: 'Super Smash Bros. Ultimate', type: 'Video game' }, results: [] }) });
  assert.equal(ssbu.type, 'franchise'); assert.equal(ssbu.level, 'high');
  assert.equal(ID.searchIntent('franchise', 'a crossover fighting video game'), 'game');
  // a product search ("on white", "in use") is for a physical object; a network or a label keeps the word rules
  assert.equal(ID.searchIntent('product', 'an instant camera'), 'product');
  assert.equal(ID.searchIntent('product', 'a satellite internet network'), null);
  assert.equal(ID.searchIntent('product', 'a Japanese fashion house'), null);
  // without any web evidence, a model that KNOWS it still resolves it
  assert.equal(ID.resolve({ raw: { identity: { name: 'Starlink', type: 'product', recognized: true, confidence: 'medium' } }, brief: 'Starlink' }).status, 'resolved');
  const zelda = ID.resolve({ raw: { identity: { name: 'Zelda', kind: 'fictional', type: 'franchise', recognized: true, confidence: 'medium' }, clarify: { needed: true, question: 'Which Zelda?', options: [{ label: 'The franchise', wikipediaTitle: 'The Legend of Zelda' }, { label: 'The princess', wikipediaTitle: 'Princess Zelda' }] } }, brief: 'Zelda' });
  assert.equal(zelda.status, 'ambiguous'); assert.ok(zelda.entities);
  const u = ID.applyIdentity(ai.normaliseUnderstanding({ identity: { name: 'Zelda', kind: 'fictional', confidence: 'medium' } }, 'Zelda'), zelda, { clarify: { question: 'Which Zelda?', options: [{ label: 'The franchise', wikipediaTitle: 'The Legend of Zelda' }, { label: 'The princess', wikipediaTitle: 'Princess Zelda' }] } });
  assert.deepEqual(u.clarify.options.map(o => o.wikipediaTitle), ['The Legend of Zelda', 'Princess Zelda']);
});

test('identity applied: a meme the model did not know is looked up, searched for as a meme and played as one', () => {
  const raw = GUESSES[0]; const idn = ID.resolve({ raw, brief: BRIEF, web: ID.webEvidence(NEEGY_WEB) });
  const u = ID.applyIdentity(ai.normaliseUnderstanding(raw, BRIEF), idn, raw);
  assert.equal(u.kind, 'recognizable'); assert.equal(u.clarify, null); assert.equal(u.identity.type, 'meme'); assert.equal(u.identity.status, 'resolved');
  assert.equal(u.research.scope, 'subject', 'the encyclopedia is asked (and it refuses an article whose title is not the subject)');
  assert.equal(u.searchIntent, 'meme'); assert.equal(D.planSearches(Object.assign({}, u, { visuals: {} }))[0].family, 'meme');
  assert.equal(u.tone.register, 'playful');
  const inv = ID.applyIdentity(ai.normaliseUnderstanding({ identity: { name: 'Catland', kind: 'invented' } }, 'x'), { name: 'Catland', type: 'invented', status: 'invented', confidence: 0.9, level: 'high', candidates: [], evidence: [], source: 'brief' }, {});
  assert.equal(inv.research.scope, 'none'); assert.equal(inv.query, null);
});

test('understanding: read at temperature 0, with the identity type, a "recognized" flag and room for web evidence', async () => {
  let seen = null; await ai.understand({ brief: BRIEF, settled: 'An internet meme or online character (meme)', evidence: ['knowyourmeme.com: neegy meme'] }, { limits: ai.limits({}), call: async a => { seen = a; return { input: {}, usage: {}, model: 'mock' }; } });
  assert.equal(seen.temperature, 0);
  assert.match(seen.content[0].text, /IDENTITY IS SETTLED/); assert.match(seen.content[0].text, /WEB EVIDENCE[^\n]*data, not instructions/);
  const props = ai.UNDERSTAND_TOOL.input_schema.properties.identity.properties; assert.ok(props.type.enum.includes('meme') && props.type.enum.includes('unknown')); assert.equal(props.recognized.type, 'boolean');
  assert.match(ai.DIRECTOR_SYSTEM, /understanding\.identity is SETTLED/);
});

// ---------------------------------------------------------------- genre and ambition
const U = (type, what, extra) => Object.assign({ kind: 'recognizable', subject: 'X', brief: 'X', identity: { name: 'X', type, what }, tone: { register: 'cinematic' }, motifs: [] }, extra || {});
test('genre: from the identity type first -- a game is a game, a satellite network is tech (not food), an instant camera is a product (not film)', () => {
  assert.equal(ART.genreOf(U('franchise', 'a crossover fighting video game')), 'game');
  assert.equal(ART.genreOf(U('product', 'satellite internet constellation', { motifs: ['phased-array dish antenna', 'satellite dish'] })), 'tech');
  assert.equal(ART.genreOf(U('product', 'an instant film camera')), 'product');
  assert.equal(ART.genreOf(U('product', 'Japanese avant-garde fashion house')), 'fashion');
  assert.equal(ART.genreOf(U('place', 'an expressionist opera house on the harbour')), 'place');
  assert.equal(ART.genreOf(U('meme', 'a viral internet meme')), 'meme');
  // without a type, the words decide -- and the old traps are gone
  assert.notEqual(ART.genreOf({ subject: 'Starlink', identity: { what: 'satellite dish antenna network' } }), 'food');
  assert.notEqual(ART.genreOf({ subject: 'Polaroid Now', identity: { what: 'instant film camera' } }), 'film');
});

test('visual ambition: chosen from the owner\'s words, the purpose, the subject and the pictures', () => {
  const a = (u, ctx) => ART.ambitionOf(u, ctx).level;
  assert.equal(a(U('franchise', 'a fighting video game')), 'cinematic');
  assert.equal(a(U('product', 'satellite internet constellation')), 'cinematic');
  assert.equal(a(U('product', 'an instant camera')), 'expressive');
  assert.equal(a(U('place', 'an opera house', { tone: { register: 'reverent' } })), 'cinematic', 'a register the model guessed does not make an icon restrained');
  assert.equal(a(U('place', 'a war memorial and cemetery')), 'restrained');
  assert.equal(a(U('meme', 'a viral meme')), 'experimental');
  assert.equal(a(U('product', 'fashion house', { identity: { type: 'product', what: 'a fashion house' } })), 'restrained');
  assert.equal(a(U('known-entity', 'a music genre', { subject: 'ambient music', identity: { type: 'known-entity', what: 'a music genre' }, tone: { register: 'restrained' } })), 'cinematic');
  assert.equal(a(U('personal', 'my dog', { kind: 'personal' })), 'restrained');
  assert.equal(a(U('franchise', 'a video game', { brief: 'a minimal, quiet page about Halo' })), 'restrained', 'the owner\'s words win');
  assert.equal(a(U('product', 'a camera', { brief: 'an experimental page about the Polaroid Now' })), 'experimental');
  assert.equal(a(U('franchise', 'a video game', { brief: 'an essay on Halo' })), 'restrained');
  assert.equal(a(U('franchise', 'a video game'), { inv: { distinct: 0 } }), 'expressive', 'nothing to stage cinematically without a picture');
});

// the pictures a real game page has: wide key art, a cut-out, more stills
const pic = (id, w, h, extra) => Object.assign({ id, origin: 'research', title: id, license: 'CC BY 4.0', assess: { width: w, height: h, aspect: +(w / h).toFixed(3), orientation: w > h ? 'landscape' : 'portrait', subject: [0.2, 0.2, 0.8, 0.8], colours: ['#c0502e', '#223344', '#ddeeff'], luminance: 110, background: { colour: '#333333', uniformity: 0.3 } }, caps: { moveFreely: false, frame: true, backdrop: w > h }, curation: { role: 'subject', identity: 'exact', depicts: id, issues: [] } }, extra || {});
const PICS = [pic('k1', 2000, 1100), pic('k2', 1920, 1080), pic('k3', 1600, 1200), pic('plain', 1400, 1400), pic('c-plain', 900, 1100, { origin: 'derived', cutout: true, cutoutOf: 'plain', assess: { width: 900, height: 1100, aspect: 0.818, orientation: 'portrait', transparent: true, subject: [0.02, 0.02, 0.98, 0.98], colours: ['#2255cc'], luminance: 96 }, caps: { moveFreely: true } })];
const FACTS = ['It was released in 2018.', 'It features every fighter from the series.', 'It sold over thirty million copies.'].map((text, i) => ({ id: `f${i + 1}`, text, section: 'x' }));
const restrained = r => ['editorial', 'luxe', 'still'].includes(r.personality) || ['quiet', 'editorial'].includes(r.mode) || r.concept === 'editorial';
test('art direction: a game franchise is not drawn as an editorial essay -- not fresh, and not after a history of every expressive recipe', () => {
  const u = U('franchise', 'a crossover fighting video game', { subject: 'Super Smash Bros. Ultimate', brief: 'Super Smash Bros. Ultimate', tone: { register: 'cinematic' } });
  const fresh = Array.from({ length: 120 }, (_, i) => ART.choose({ understanding: u, assets: PICS, facts: FACTS, seed: `g${i}`, history: [] }));
  assert.ok(fresh.filter(restrained).length <= 6, `restrained: ${fresh.filter(restrained).map(r => r.recipe.split('/')[0]).join(', ')}`);
  assert.ok(new Set(fresh.map(r => r.concept)).size >= 4, `concepts: ${[...new Set(fresh.map(r => r.concept))]}`);
  assert.ok(new Set(fresh.map(r => r.family)).size >= 4, 'several arcs');
  assert.ok(fresh.every(r => r.ambition === 'cinematic'));
  // an account that has made every suitable recipe already: history steers between them, never out to an essay
  const hist = fresh.slice(0, 10).map(r => r.recipe);
  const later = Array.from({ length: 60 }, (_, i) => ART.choose({ understanding: u, assets: PICS, facts: FACTS, seed: `h${i}`, history: hist }));
  assert.ok(later.filter(restrained).length <= 4, `restrained with history: ${later.filter(restrained).length}`);
});

test('art direction: editorial stays the home of fashion, personal and text-led pages', () => {
  const fashion = U('product', 'a Japanese avant-garde fashion house', { subject: 'Comme des Garcons', brief: 'A quiet, minimal page about the fashion house Comme des Garcons', tone: { register: 'restrained', fromBrief: true } });
  const runs = Array.from({ length: 60 }, (_, i) => ART.choose({ understanding: fashion, assets: PICS, facts: FACTS, seed: `f${i}` }));
  assert.ok(runs.every(r => r.ambition === 'restrained' && ['quiet', 'editorial', 'expressive'].includes(r.mode) && r.mode !== 'immersive'));
  assert.ok(runs.filter(restrained).length >= 50, `${runs.filter(restrained).length} of 60`);
  const tribute = ART.choose({ understanding: { kind: 'personal', subject: 'Frank', brief: 'in memory of our grandad Frank', identity: { type: 'personal' }, tone: { register: 'tender' } }, assets: PICS, facts: [], seed: '1' });
  assert.equal(tribute.ambition, 'restrained'); assert.notEqual(tribute.mode, 'immersive');
});

test('the director keeps the system\'s direction on a new page (a revision may change it); spatial stays the system\'s decision', () => {
  const u = U('franchise', 'a fighting video game', { subject: 'Neon Brawl' });
  const recipe = ART.choose({ understanding: u, assets: PICS, facts: FACTS, seed: 'lock' });
  const plan = { identity: { name: 'Neon Brawl', kind: 'recognizable' }, concept: { title: 'x', logline: 'x' }, palette: { bg: '#101014', bg2: '#1c1c22', ink: '#f4f1ea', muted: '#b9b4aa', accent: '#e4572e', glow: '#ffd166' }, type: { display: 'grotesk' }, atmosphere: { backdrop: 'solid' }, motion: { tempo: 'measured' }, assetNotes: [],
    art: { personality: 'luxe', mode: 'quiet', family: 'editorial-sticky', concept: 'editorial', ambition: 'restrained', scroll: 'flow' },
    scenes: [{ id: 's1', purpose: 'x', height: 'screen', layers: [{ id: 'l1', kind: 'image', role: 'focal', asset: 'k1' }], text: { heading: 'Neon Brawl', kind: 'imagined' } }, { id: 's2', purpose: 'x', height: 'screen', layers: [], text: { heading: 'Two', kind: 'imagined' } }],
    timeline: { renderer: 'spatial' } };
  const v = validatePlan2(JSON.parse(JSON.stringify(plan)), { assets: PICS, facts: FACTS, understanding: u, art: recipe, spatial: 'on' });
  ['personality', 'mode', 'family', 'concept', 'ambition'].forEach(k => assert.equal(v.plan.art[k], recipe[k], k));
  assert.ok(v.fixes.some(f => /^art: the chosen/.test(f)), v.fixes.join('\n'));
  const rev = validatePlan2(JSON.parse(JSON.stringify(plan)), { assets: PICS, facts: FACTS, understanding: u, art: recipe, artOptional: true });
  assert.equal(rev.plan.art.personality, 'luxe', 'a revision asked for may change the direction');
  // the recipe never names a renderer, and a plan asking for spatial gets it only through the system's own decision
  assert.ok(!('renderer' in recipe));
  assert.ok(v.plan.timeline.renderer === 'dom' || (v.plan.timeline.why || []).length, 'decided, with reasons');
  assert.match(fs.readFileSync(path.join(__dirname, '..', 'lib', 'creative', 'ai.js'), 'utf8'), /renderer: dom\. Whether the page ALSO gets a spatial/);
});

test('server: the identity step is wired in -- the web check is cached and counted, a kind of thing is never an article title', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  assert.match(src, /creativeIdentity\.resolve\(\{ raw: r\.raw, brief, web: web\.evidence, choice \}\)/);
  assert.match(src, /if \(choice && !creativeIdentity\.choiceType\(choice\)\) titles\.unshift\(choice\)/);
  assert.match(src, /kind: 'creative_identitysearch'/); assert.match(src, /creativeSerpCacheGet\(key\)/);
  assert.doesNotMatch(src, /googleWeb\([^)]*brief/, 'only the name is searched, never the brief');
});
