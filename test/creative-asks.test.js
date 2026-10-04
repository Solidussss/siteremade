'use strict';
// CREATIVE -- THE DIRECTION ASKS (lib/creative/asks.js): a few quick questions in the studio, after the brief and before
// anything is priced or spent. The answers steer what already exists -- the art direction's preference and one line to the
// director -- and any question may be left open.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const ASKS = require('../lib/creative/asks');
const D2 = require('../lib/creative/director2');
const AI = require('../lib/creative/ai');
const ART = require('../lib/creative/art');
const { SUBJECTS } = require('./helpers/creative-subjects');

test('A1. a fixed set of questions, each answer a known option; anything else is dropped', () => {
  assert.deepEqual(ASKS.QUESTIONS.map(q => q.id), ['mood', 'motion', 'lead', 'colour']);
  ASKS.QUESTIONS.forEach(q => { assert.ok(q.title && q.options.length >= 3); q.options.forEach(o => { assert.ok(o.label && o.words); const p = o.prefer || {};
    if (p.personality) assert.ok(ART.PERSONALITIES.includes(p.personality)); if (p.mode) assert.ok(ART.MODES.includes(p.mode)); if (p.family) assert.ok(ART.FAMILIES.includes(p.family)); }); });
  assert.deepEqual(ASKS.normalise({ mood: 'cinematic', motion: 'warp', lead: 7, colour: 'dark', extra: 'x' }), { mood: 'cinematic', colour: 'dark' });
  assert.deepEqual(ASKS.normalise(null), {}); assert.deepEqual(ASKS.prefer({}), {}); assert.equal(ASKS.words({}), '');
  assert.deepEqual(ASKS.prefer({ mood: 'premium', motion: 'calm', lead: 'name' }), { personality: 'luxe', mode: 'editorial', family: 'typography-led' });
  assert.match(ASKS.words({ mood: 'bold', colour: 'light' }), /^The owner chose this direction .*bold and loud.*light and airy/);
});

test('A2. what the brief already says is chosen for the owner', () => {
  assert.deepEqual(ASKS.guess('A cinematic website about the Northern Lights, dark and dramatic, full-screen images'), { mood: 'cinematic', lead: 'photos', colour: 'dark' });
  assert.deepEqual(ASKS.guess('Kolaro cola. Bold and loud like a summer campaign. Show the can big.'), { mood: 'bold', lead: 'product' });
  assert.deepEqual(ASKS.guess('A page about my grandmother'), {});
});

test('A3. the answers steer the page: its recipe leans the chosen way on every seed', () => {
  const s = SUBJECTS.beverage; const make = (seed, prefer) => D2.direct({ understanding: s.understanding, research: { page: null, facts: s.facts }, assets: s.assets, supplied: { facts: [], memories: [] }, seed, mainAsset: s.mainAsset, prefer }).recipe;
  const cine = ASKS.prefer({ mood: 'cinematic', motion: 'show' }); const calm = ASKS.prefer({ mood: 'premium', motion: 'calm' });
  ['1', '2', '3', '4'].forEach(seed => {
    const a = make(seed, cine); assert.equal(a.personality, 'cinematic', `${seed}: ${a.recipe}`); assert.equal(a.mode, 'immersive');
    const b = make(seed, calm); assert.equal(b.personality, 'luxe', `${seed}: ${b.recipe}`); assert.equal(b.mode, 'editorial');
  });
});

test('A4. the director is told, the server passes the answers, the studio asks before anything is priced', () => {
  const content = AI.directContent({ brief: 'Kolaro', understanding: {}, assets: [], facts: [], asks: ASKS.words({ mood: 'bold' }) });
  const head = JSON.parse(content.find(c => c.type === 'text' && /"brief"/.test(c.text)).text.replace(/^[^{]*/, ''));
  assert.match(head.ownerDirection, /bold and loud/);
  assert.equal(JSON.parse(AI.directContent({ brief: 'x', understanding: {}, assets: [], facts: [] }).find(c => c.type === 'text' && /"brief"/.test(c.text)).text.replace(/^[^{]*/, '')).ownerDirection, undefined, 'no answers, no line');
  const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  assert.match(server, /input\.asks = creativeAsks\.words\(b\.asks\);\s*\n\s*input\.art = creativeArt\.choose\(\{ prefer: creativeAsks\.prefer\(b\.asks\),/);
  const studio = fs.readFileSync(path.join(__dirname, '..', 'creative.js'), 'utf8');
  assert.match(studio, /if \(!choice && !quoteId && S\.asksFor !== S\.brief\) return askDirection\(\)[\s\S]{0,200}\n\s*if \(!choice && !quoteId && !openJobFor\(S\.brief\)\) return confirmGeneration\(\)/, 'asked before the price is confirmed');
  assert.match(studio, /asks: S\.asks \|\| null/);
  assert.ok(require('../creative-core.js').asks, 'the studio has the questions');
});
