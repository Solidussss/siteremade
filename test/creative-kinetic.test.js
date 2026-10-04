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
  const rules = KIN.css.replace(/\/\*[\s\S]*?\*\//g, '').split('}').filter(r => /translate|rotate|scale|transform|opacity|filter|animation/.test(r) && !/@keyframes|^\s*[\d.,% ]+%/.test(r.trim()) && !/^\s*\.k-cur|\.k-lens|\.k-cur\.is|\.kw\{|\.kw>i\{display|data-scrub|^\s*\.k-mq|^\s*\.k-trail|^\s*\.k-knock|^\s*\.k-intro|^\s*\.k-pix|^\s*\.k-prog/.test(r.trim()));
  // (the band, the clip in the name, the intro and the progress line are not drawn at all for reduced motion; the trail and
  // the pixels are never made for it)
  ['k-intro', 'k-prog'].forEach(k => assert.match(KIN.css, new RegExp(`html\\[data-motion="reduced"\\] \\.${k}\\{display:none\\}`), k));
  assert.match(KIN.js, /if\(!RM&&W\.MutationObserver\)\[\]\.forEach\.call\(d\.querySelectorAll\('\.sc\[data-kp="pixel"\]'\)/, 'no pixels for reduced motion');
  assert.match(KIN.css, /html\[data-motion="reduced"\] \.k-mq\{display:none\}/); assert.match(KIN.css, /html\[data-motion="reduced"\] \.k-knock\{display:none\}/);
  assert.match(KIN.js, /\(function\(\)\{if\(!fine\|\|RM\)return;var all=/, 'no trail for reduced motion'); assert.match(KIN.js, /sc\.addEventListener\('pointermove',function\(e\)\{if\(reduced\(\)/);
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
  assert.match(KIN.js, /var ARC=\{takeover:'grow',payoff:'grow',reveal:\/\^\(mechanical\|kinetic\|playful\|chaotic\)\$\/\.test\(pers\)\?'pixel':'tilt',transformation:'turn',breath:'drift',escalation:'rush'\};/);
  ['grow', 'tilt', 'drift', 'turn', 'rush'].forEach(k => assert.ok(KIN.css.includes(`[data-kp="${k}"]`), k));
  assert.match(KIN.js, /if\(pers==='mechanical'&&!RM&&W\.MutationObserver\)/, 'a mechanical page decodes its words');
});

test('K6. the hover lens: only a mouse, only a photograph, only while the mouse is over it', () => {
  assert.match(KIN.js, /if\(fine&&!RM&&W\.WebGLRenderingContext\)/);
  assert.match(KIN.js, /if\(!art\|\|img\.closest\('\[data-loop="kenburns"\]'\)\|\|art\.querySelector\('\.ly-vid'\)\)return;if\(getComputedStyle\(img\)\.objectFit!=='cover'\)return;/, 'never over a clip or a moving picture');
  assert.match(KIN.js, /L\.cv\.style\.opacity='0'/, 'gone when the mouse leaves');
});

test('K7. 3D words are solid blocks seen at an angle: a deep extrusion shaded from the face back, turned toward the visitor around one vanishing point, lit from the mouse -- and never in a box', () => {
  const rule = KIN.css.slice(KIN.css.indexOf('.sc[data-k3] .sc-heading{--kex:'), KIN.css.indexOf('}', KIN.css.indexOf('.sc[data-k3] .sc-heading{--kex:')));
  assert.ok((rule.match(/color-mix\(in srgb,currentColor \d+%,var\(--s-surface,#000\)\)/g) || []).length >= 20, 'at least 20 layers of depth, their sides blending into the scene\'s own colour');
  const shades = [...rule.matchAll(/currentColor (\d+)%/g)].map(m => +m[1]); assert.ok(shades[0] > shades[shades.length - 1], 'lighter at the face, darker at the back');
  assert.match(rule, /perspective:1100px/); assert.match(rule, /--kex:calc\(\.62 - var\(--kpx,0\) \* \.9\)/, 'the light comes from the mouse');
  assert.match(KIN.css, /\.sc\[data-k3\] \.kw\{transform:rotateY\(calc\(\(-16deg \+ var\(--kpx,0\) \* 22deg\)/, 'a resting angle, moved by the mouse');
  const h = render(page('beverage', '2')); assert.match(h, /html\[data-look\] \.sc-shade\[data-shade="band"\]\{display:none\}/);
});

test('K8. the opening clip in the name: its own layer, the page\'s name as its mask (standing up on a tall screen), the scroll floods it -- and it is the clip the visitor plays', () => {
  assert.match(KIN.js, /lay\.className='k-knock'/); assert.match(KIN.js, /if\(port\)g\.rotate\(-Math\.PI\/2\)/);
  assert.match(KIN.js, /function flood\(y\)\{if\(!knock\)return;/); assert.match(KIN.js, /clips=clips\.filter\(function\(x\)\{return x\.sc!==firstSc\}\);clips\.push\(c\);hero=c;/);
  assert.match(KIN.css, /\.sc\[data-knock\] \.k-knock video\{-webkit-mask-image:var\(--kmask\),linear-gradient/);
});

test('K9. the words have a range of entrances, chosen by the page\'s character and never the same twice in a row; 3D headlines burst into letters as they are left', () => {
  ['blur', 'pop', 'split', 'cascade', 'flip', 'type', 'sweep'].forEach(k => assert.ok(KIN.css.includes(`[data-kt="${k}"]`), k));
  assert.match(KIN.js, /if\(k===lastT\)k=pool\[\(pool\.indexOf\(k\)\+1\)%pool\.length\];/);
  assert.match(KIN.css, /\.sc\[data-k3\]:is\(:first-of-type,\[data-hero\]\) \.kc\{--kb:clamp\(0, \(var\(--p,0\) - \.1\) \* 3\.1, 1\)\}/, 'only the opening bursts');
  assert.match(KIN.css, /\.sc\[data-k3\] \.kc\{transform:translate3d\(calc\(var\(--kb,0\)/, 'a later 3D headline stays whole');
});

test('K10. a page in a real browser-like render carries the set pieces: the band (the page\'s name, its colours), the trail, the letters', () => {
  const h = render(page('sneaker', '3'));
  assert.match(KIN.js, /var words=\[name,'\u2726'\];/); assert.match(KIN.js, /var surf=first\.getAttribute\('data-surf'\);if\(surf\)box\.style\.background=surf;/);
  assert.match(KIN.js, /sc\.setAttribute\('data-ktrail',''\)/); assert.ok(h.includes(KIN.js));
});

test('K11. the intro (once a session, never for reduced motion or a deep link) holds the entrances until the page is uncovered; reveals arrive in pixels on a lively or mechanical page; the picture under the mouse tilts; a progress line follows the scroll', () => {
  assert.match(KIN.js, /if\(RM\|\|!first\|\|!hh\|\|location\.hash\)return;try\{if\(W\.sessionStorage\.getItem\('k-intro'\)\)return;/);
  assert.match(KIN.js, /if\(!intro\)goNow\(\);/, 'the entrances wait for the intro'); assert.ok(KIN.js.includes("intro.classList.add('is-out');setTimeout(function(){if(intro){intro.remove();intro=null}},1000);goNow()"), 'the page is uncovered, then its opening plays');
  assert.match(KIN.js, /reveal:\/\^\(mechanical\|kinetic\|playful\|chaotic\)\$\/\.test\(pers\)\?'pixel':'tilt'/);
  assert.match(KIN.js, /function pixelate\(img\)\{/); assert.match(KIN.js, /if\(k2>=steps\.length\|\|reduced\(\)\)\{cv\.remove\(\);img\.style\.visibility='';return\}/, 'the picture itself always comes back');
  assert.match(KIN.js, /hit\.el\.style\.rotate=/); assert.match(KIN.css, /\.k-prog\{position:fixed;/); assert.match(KIN.css, /html\[data-motion="reduced"\] \.k-intro\{display:none\}/);
});

test('K12. the clip carries on down the page: moments of it, sampled from the clip itself, run through the name band', () => {
  assert.match(KIN.js, /times=\[\.12,\.3,\.48,\.66,\.84\]/); assert.match(KIN.js, /cv\.toDataURL\('image\/jpeg',\.72\)/);
  assert.match(KIN.js, /if\(sp\.textContent==='\u2726'\)\{var im=d\.createElement\('img'\);im\.className='k-mq-f';/, 'between the name, in place of the mark');
  assert.match(KIN.js, /\(function\(\)\{if\(!mq\|\|RM\|\|!hero\|\|!hero\.v\)return;/, 'only with a clip, never for reduced motion');
});
