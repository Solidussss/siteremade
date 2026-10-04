'use strict';
// CREATIVE -- THE KINETIC LAYER (lib/creative/kinetic.js): smooth scroll, words that rise out of their own line masks,
// pictures that lean with the mouse and move with the scroll by each scene's place in the story, clips the visitor plays
// (scroll and mouse) instead of a few seconds looping, and a hover lens on the main photographs. Only a page made with the
// look; reduced motion turns all of it off; the page keeps ONE scroll listener. REAL PROVIDER SPEND: $0.
const test = require('node:test');
const assert = require('node:assert/strict');
const KIN = require('../lib/creative/kinetic');
const D2 = require('../lib/creative/director2');
const { validatePlan2 } = require('../lib/creative/validate2');
const { renderCreative2 } = require('../lib/creative/render2');
const { SUBJECTS } = require('./helpers/creative-subjects');

const page = (id, seed) => { const s = SUBJECTS[id]; const d = D2.direct({ understanding: s.understanding, research: { page: null, facts: s.facts }, assets: s.assets, supplied: { facts: [], memories: [] }, seed, mainAsset: s.mainAsset });
  return { plan: validatePlan2(d.plan, { assets: s.assets, facts: s.facts, understanding: s.understanding, art: d.recipe, mainAsset: s.mainAsset }).plan, assets: s.assets }; };
const render = (p, o) => renderCreative2(p.plan, p.assets, Object.assign({ mode: 'export', src: a => `${a.id}.png` }, o || {}));

test('K1. a page made with the look moves; a page from before it renders exactly as it did', () => {
  const p = page('beverage', '1'); assert.ok(p.plan.look, 'today\'s pages carry a look');
  const h = render(p); assert.match(h, /<html[^>]* data-kinetic/); assert.ok(h.includes(KIN.css) && h.includes(KIN.js));
  const old = JSON.parse(JSON.stringify(p.plan)); delete old.look; const ho = renderCreative2(old, p.assets, { mode: 'export', src: a => `${a.id}.png` });
  assert.doesNotMatch(ho, /data-kinetic|__kinetic|k-cur|\.kw>i/, 'an older page gets none of it');
  assert.doesNotMatch(render(p, { kinetic: false }), /data-kinetic/, 'and a renderer may leave it out (the visual director measures pages at rest)');
});

test('K2. one scroll listener for the whole page, runtime included; per-frame work reads no layout', () => {
  const h = render(page('sneaker', '2'));
  assert.equal((h.match(/addEventListener\('scroll'/g) || []).length, 1, 'the page\'s own frame calls the kinetic layer');
  assert.match(h, /if\(W\.__crKinFrame\)W\.__crKinFrame\(y\);/); assert.match(KIN.js, /W\.__crKinFrame=function\(y\)\{/);
  const fn = name => { const i = KIN.js.indexOf(`function ${name}(`); let depth = 0; const j = KIN.js.indexOf('{', i); for (let k = j; k < KIN.js.length; k++) { if (KIN.js[k] === '{') depth++; else if (KIN.js[k] === '}') { depth--; if (!depth) return KIN.js.slice(i, k + 1); } } return ''; };
  ['scrubFrame', 'clipAt', 'speed', 'glide'].forEach(n => assert.doesNotMatch(fn(n), /getBoundingClientRect|offsetTop|offsetHeight|getComputedStyle|querySelector/, `${n} reads no layout`));
  assert.match(fn('measureK'), /getBoundingClientRect/, 'measured when the layout changes');
  new Function(KIN.js); // (it parses as the plain script it ships as)
});

test('K3. reduced motion turns every part of it off', () => {
  const rules = KIN.css.split('}').filter(r => /translate|rotate|scale|transform|opacity|filter|animation/.test(r) && !/@keyframes|^\s*(0|20|40|60|80|100)%/.test(r.trim()) && !/^\s*\.k-cur|\.k-lens|\.k-cur\.is|\.kw\{|\.kw>i\{display|data-scrub/.test(r));
  rules.forEach(r => assert.match(r, /:not\(\[data-motion="reduced"\]\)/, `gated: ${r.trim().slice(0, 90)}`));
  assert.match(KIN.js, /function reduced\(\)\{return RM\|\|H\.getAttribute\('data-motion'\)==='reduced'\}/);
  assert.match(KIN.js, /if\(fine&&!RM\)\{K\.smooth=true;/, 'no smooth scroll for reduced motion or a touch screen');
});

test('K4. a premium clip is played by the visitor -- its scene\'s scroll, and the opening clip by the mouse -- never looping on its own', () => {
  assert.match(KIN.js, /v\.removeAttribute\('autoplay'\);v\.removeAttribute\('loop'\);v\.autoplay=false;v\.loop=false;/);
  assert.match(KIN.js, /if\(fine&&mx>=0\)p=mx\/innerWidth;/, 'the mouse plays the opening clip');
  assert.match(KIN.js, /else p=\(c\.base\|\|0\)\+\(1-\(c\.base\|\|0\)\)\*p/, 'and the scroll carries it on from there');
});

test('K5. the motion follows the page\'s direction: its personality sets how far and how fast, each scene\'s arc which move', () => {
  ['luxe', 'still', 'editorial', 'cinematic', 'kinetic', 'playful', 'chaotic', 'mechanical'].forEach(p => assert.match(KIN.js, new RegExp(`${p}:\\[`), p));
  assert.match(KIN.js, /var ARC=\{takeover:'grow',payoff:'grow',reveal:'tilt',transformation:'turn',breath:'drift',escalation:'rush'\};/);
  ['grow', 'tilt', 'drift', 'turn', 'rush'].forEach(k => assert.ok(KIN.css.includes(`[data-kp="${k}"]`), k));
  assert.match(KIN.js, /if\(pers==='mechanical'&&!RM&&W\.MutationObserver\)/, 'a mechanical page decodes its words');
});

test('K6. the hover lens: only a mouse, only a photograph, only while the mouse is over it', () => {
  assert.match(KIN.js, /if\(fine&&!RM&&W\.WebGLRenderingContext\)/);
  assert.match(KIN.js, /if\(!art\|\|img\.closest\('\[data-loop="kenburns"\]'\)\|\|art\.querySelector\('\.ly-vid'\)\)return;if\(getComputedStyle\(img\)\.objectFit!=='cover'\)return;/, 'never over a clip or a moving picture');
  assert.match(KIN.js, /L\.cv\.style\.opacity='0'/, 'gone when the mouse leaves');
});
