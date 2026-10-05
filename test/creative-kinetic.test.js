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
  const rules = KIN.css.replace(/\/\*[\s\S]*?\*\//g, '').split('}').filter(r => /translate|rotate|scale|transform|opacity|filter|animation/.test(r) && !/@keyframes|^\s*[\d.,% ]+%/.test(r.trim()) && !/^\s*\.k-cur|\.k-lens|\.k-cur\.is|\.kw\{|\.kw>i\{display|data-scrub|^\s*\.k-mq|^\s*\.k-trail|^\s*\.k-knock|^\s*\.k-intro|^\s*\.k-pix|^\s*\.k-prog|^\s*\.k-wall|^\s*\.k-spot|^\s*\.k-mark\{/.test(r.trim()));
  // (the signature's wall and light are not drawn at all without motion)
  assert.match(KIN.css, /html:not\(\.k-go\) \.k-wall,html\[data-motion="reduced"\] \.k-wall\{display:none\}/); assert.match(KIN.css, /html:not\(\.k-go\) \.k-spot,html\[data-motion="reduced"\] \.k-spot\{display:none\}/);
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
  assert.match(KIN.js, /if\(k!==mw&&k===lastT\)k=pool\[\(pool\.indexOf\(k\)\+1\)%pool\.length\];/);
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
  assert.match(KIN.js, /if\(!intro\)goNow\(\);/, 'the entrances wait for the intro'); assert.ok(KIN.js.includes("intro.classList.add('is-out');setTimeout(function(){if(intro){intro.remove();intro=null}},1000);goNow()"), 'the page is uncovered, then its opening plays'); assert.ok(KIN.js.includes('setTimeout(finish,2600)'), 'never left covering the page');
  assert.match(KIN.js, /function clear\(h,sc\)\{/, 'a headline that barely reads is never made 3D'); assert.match(KIN.css, /@media \(max-width:720px\)\{[^}]*\.sc\[data-kd\] \.kw\{translate:none\}/, 'nothing drifts off a phone');
  assert.match(KIN.js, /reveal:\/\^\(mechanical\|kinetic\|playful\|chaotic\)\$\/\.test\(pers\)\?'pixel':'tilt'/);
  assert.match(KIN.js, /function pixelate\(img\)\{/); assert.match(KIN.js, /if\(k2>=steps\.length\|\|reduced\(\)\)\{cv\.remove\(\);img\.style\.visibility='';return\}/, 'the picture itself always comes back');
  assert.match(KIN.js, /hit\.el\.style\.rotate=/); assert.match(KIN.css, /\.k-prog\{position:fixed;/); assert.match(KIN.css, /html\[data-motion="reduced"\] \.k-intro\{display:none\}/);
});

test('K12. the clip carries on down the page: moments of it, sampled from the clip itself, run through the name band', () => {
  assert.match(KIN.js, /times=\[\.12,\.3,\.48,\.66,\.84\]/); assert.match(KIN.js, /cv\.toDataURL\('image\/jpeg',\.72\)/);
  assert.match(KIN.js, /if\(sp\.textContent==='\u2726'\)\{var im=d\.createElement\('img'\);im\.className='k-mq-f';/, 'between the name, in place of the mark');
  assert.match(KIN.js, /\(function\(\)\{if\(!mq\|\|RM\|\|!hero\|\|!hero\.v\)return;/, 'only with a clip, never for reduced motion');
});

test('K13. the glide moves the page in instant steps: the page\'s own smooth scrolling (for its contents links) would restart on every step and crawl', () => {
  assert.match(KIN.js, /function to\(y\)\{try\{W\.scrollTo\(\{top:y,left:0,behavior:'instant'\}\)\}catch\(e\)\{W\.scrollTo\(0,y\)\}\}/);
  assert.match(KIN.js, /function glide\(\)\{cur\+=\(target-cur\)\*GL;if\(Math\.abs\(target-cur\)<\.6\)cur=target;to\(cur\);/);
  assert.doesNotMatch(KIN.js.slice(KIN.js.indexOf('function glide'), KIN.js.indexOf('function glide') + 200), /W\.scrollTo\(0,cur\)/);
});

test('K14. the director chooses each scene\'s motion (scene.move): only the vocabulary survives, the page carries it, and the layer follows it before its own rules', () => {
  const A = require('../lib/creative/ai');
  const sch = A.DIRECTOR_TOOL.input_schema.properties.scenes.items.properties.move.properties;
  assert.deepEqual(sch.words.enum, KIN.MOVES.words); assert.deepEqual(sch.picture.enum, KIN.MOVES.picture);
  assert.match(A.DIRECTOR_SYSTEM, /MOTION \(scene\.move\)/, 'the director is told what each move is for');
  const s = SUBJECTS.beverage; const d = D2.direct({ understanding: s.understanding, research: { page: null, facts: s.facts }, assets: s.assets, supplied: { facts: [], memories: [] }, seed: '1', mainAsset: s.mainAsset });
  d.plan.scenes[1].move = { words: 'cascade', picture: 'rush' }; d.plan.scenes[2].move = { words: 'explode', picture: 'still' };
  const v = validatePlan2(d.plan, { assets: s.assets, facts: s.facts, understanding: s.understanding, art: d.recipe, mainAsset: s.mainAsset });
  assert.deepEqual(v.plan.scenes[1].move, { words: 'cascade', picture: 'rush' });
  assert.deepEqual(v.plan.scenes[2].move, { picture: 'still' }, 'a move outside the vocabulary is dropped, the rest kept');
  assert.equal(v.plan.scenes[3].move, undefined, 'a scene without a choice carries none');
  const h = render({ plan: v.plan, assets: s.assets });
  assert.match(h, /data-kmw="cascade" data-kmp="rush"/); assert.match(h, /data-kmp="still"/);
  assert.match(KIN.js, /var want=sc\.getAttribute\('data-kmp'\);if\(want==='still'\)\{last=''\}else if\(kinds\.indexOf\(want\)>=0\)\{sc\.setAttribute\('data-kp',want\)/, 'a chosen picture move is used as chosen');
  assert.match(KIN.js, /\(mw==='3d'&&nw<=6\)/, 'a chosen 3D headline is short enough to stand as an object');
  assert.match(KIN.js, /k=\/\^\(blur\|pop\|split\|cascade\|flip\|type\|sweep\|rise\)\$\/\.test\(mw\)\?mw:pool/, 'a chosen entrance beats the pool');
});

test('K15. a phone\'s tilt is its mouse: it steers the same depth (pictures lean, 3D words turn) and leans the 3D product; iOS is asked once on a tap', () => {
  assert.match(KIN.js, /if\(!fine&&!RM&&W\.DeviceOrientationEvent\)/, 'only a touch screen, never for reduced motion');
  assert.match(KIN.js, /W\.addEventListener\('deviceorientation',onTilt,\{passive:true\}\)/);
  assert.match(KIN.js, /typeof DOE\.requestPermission==='function'/, 'iOS asks permission, on the first tap');
  assert.match(KIN.js, /d\.addEventListener\('touchend',ask,true\)\}listen\(\)\}/, 'and every phone listens at once (a browser that never asks is never kept waiting)');
  assert.match(KIN.js, /g0\+=\(gx-g0\)\*\.005/, 'the rest angle follows the hand, so the page settles wherever the phone is held');
  assert.match(KIN.js, /W\.dispatchEvent\(new CustomEvent\('cr-tilt'/, 'the 3D product is told');
  assert.match(KIN.css, /@media \(hover:none\),\(pointer:coarse\)\{[^@]*:where\(\.k-tilt\) \.ly\{translate:/, 'pictures lean only once the phone has actually tilted');
  assert.match(KIN.css, /\.sc\[data-k3\] \.kw\{transform:rotateY\(calc\(var\(--kpx,0\) \* 18deg/, 'the 3D words turn with the phone');
  const POSE = require('../lib/creative/three-d-pose');
  const still = POSE.pose({ composition: 'label-turn' }, { p: 0.5 }), leaned = POSE.pose({ composition: 'label-turn' }, { p: 0.5, gx: 1, gy: -1 });
  assert.ok(Math.abs(leaned.rotY - still.rotY - POSE.GYRO.y) < 1e-9 && Math.abs(leaned.rotX - still.rotX + POSE.GYRO.x) < 1e-9, 'the product leans on top of its own staging');
});

test('K16. photographs never sit in a box: a photo placed in a scene melts into its colour (no frame, no shadow); a cut-out, a backdrop or a shaped mask never does; an edge on the screen\'s edge stays', () => {
  const s = SUBJECTS.beverage; const d = D2.direct({ understanding: s.understanding, research: { page: null, facts: s.facts }, assets: s.assets, supplied: { facts: [], memories: [] }, seed: '2', mainAsset: s.mainAsset });
  const v = validatePlan2(d.plan, { assets: s.assets, facts: s.facts, understanding: s.understanding, art: d.recipe, mainAsset: s.mainAsset });
  const sc = v.plan.scenes.find((x, i) => i > 0 && x.layers.some(L => L.kind === 'image'));
  const ph = { id: 'ph', origin: 'upload', title: 'p', alt: 'p', mime: 'image/jpeg', relevance: 4, assess: { width: 1600, height: 900 } };
  const cut = Object.assign({}, ph, { id: 'cu', cutout: true, mime: 'image/png' });
  sc.layers = [
    { kind: 'image', asset: 'ph', role: 'support', mask: 'none', treatment: 'none', fit: 'cover', focus: '50% 50%', box: { d: [44, 64, 24, 30], m: [4, 56, 44, 40] }, entrance: { kind: 'none' }, loop: { kind: 'none' }, scroll: { kind: 'none', amount: 0 } },
    { kind: 'image', asset: 'ph', role: 'support', mask: 'none', treatment: 'none', fit: 'cover', focus: '50% 50%', box: { d: [0, 10, 100, 40], m: [0, 0, 100, 50] }, entrance: { kind: 'none' }, loop: { kind: 'none' }, scroll: { kind: 'none', amount: 0 } },
    { kind: 'image', asset: 'cu', role: 'focal', mask: 'none', treatment: 'none', fit: 'contain', focus: '50% 50%', box: { d: [10, 10, 30, 60], m: [4, 0, 92, 50] }, entrance: { kind: 'none' }, loop: { kind: 'none' }, scroll: { kind: 'none', amount: 0 } },
    { kind: 'image', asset: 'ph', role: 'support', mask: 'circle', treatment: 'none', fit: 'cover', focus: '50% 50%', box: { d: [60, 10, 20, 30], m: [4, 0, 40, 30] }, entrance: { kind: 'none' }, loop: { kind: 'none' }, scroll: { kind: 'none', amount: 0 } },
  ];
  const h = renderCreative2(v.plan, s.assets.concat([ph, cut]), { mode: 'export', src: a => `${a.id}.png` });
  const sec = h.slice(h.indexOf(`id="${sc.id}"`)); const own = sec.slice(0, sec.indexOf('</section>'));
  assert.ok(own.includes('data-melt="d-all d-l d-r d-t d-b m-all m-l m-r m-t m-b"'), 'a photo inside the page melts on every side');
  assert.ok(own.includes('data-melt="d-t d-b m-b"'), 'a full-width photo melts only the edges that face into the page');
  assert.match(h, /\.ly\[data-melt~="d-l"\] \.ly-art\{--ml:var\(--kf\)\}/, 'each side melts on its own');
  assert.match(h, /html\[data-look\] \.ly\[data-melt\] \.ly-art\{[^}]*box-shadow:none!important/, 'no drop shadow');
  assert.match(KIN.js, /function meltFit\(\)/, 'a fitted picture melts at its own painted edges');
  const tags = own.match(/<div class="ly"[^>]*>/g).join(' ');
  assert.equal((tags.match(/data-melt=/g) || []).length, 2, 'the cut-out and the shaped mask never melt');
});

test('K17. the signature moment: one set piece per page, the director\'s if it fits, else the brand\'s -- a drink pours, a loud brand gets the type wall, otherwise the spotlight; never the opening or the closing; a saved page keeps only what it was saved with', () => {
  const byId = new Map([['photo', { id: 'photo', assess: {} }], ['cut', { id: 'cut', cutout: true }]]);
  const sc = (id, heading, layers, arc) => ({ id, text: { heading }, layers: layers || [], arc });
  const scenes = [sc('opening', 'Kolaro', [{ kind: 'image', asset: 'cut', role: 'focal' }]), sc('s2', 'A long heading of many many words here', [{ kind: 'image', asset: 'photo', role: 'focal' }], 'reveal'),
    sc('s3', 'From every side', [{ kind: 'image', asset: 'cut', role: 'focal' }], 'takeover'), sc('end', 'Bye', [{ kind: 'image', asset: 'photo', role: 'focal' }])];
  assert.deepEqual(KIN.signature(scenes, { understanding: { subject: 'a cola soft drink' }, byId }), { kind: 'pour', scene: 's3' });
  assert.deepEqual(KIN.signature(scenes, { understanding: { subject: 'a streetwear sneaker' }, byId }), { kind: 'typewall', scene: 's3' });
  assert.deepEqual(KIN.signature(scenes, { understanding: { subject: 'a garden' }, byId, personality: 'luxe' }), { kind: 'spotlight', scene: 's2' });
  assert.deepEqual(KIN.signature(scenes, { ask: { kind: 'spotlight', scene: 's2' }, understanding: { subject: 'a cola' }, byId }), { kind: 'spotlight', scene: 's2' }, 'the director\'s choice when it fits');
  assert.deepEqual(KIN.signature(scenes, { ask: { kind: 'pour', scene: 'end' }, understanding: { subject: 'a cola' }, byId }), { kind: 'pour', scene: 's3' }, 'never the closing: the brand decides instead');
  assert.equal(KIN.signature(scenes, { understanding: { subject: 'a cola' }, byId, keep: true }), null, 'a saved page never gains one');
  assert.deepEqual(KIN.signature(scenes, { ask: { kind: 'typewall', scene: 's3' }, byId, keep: true }), { kind: 'typewall', scene: 's3' });
  // through the validator and onto the page
  const s = SUBJECTS.beverage; const d = D2.direct({ understanding: s.understanding, research: { page: null, facts: s.facts }, assets: s.assets, supplied: { facts: [], memories: [] }, seed: '1', mainAsset: s.mainAsset });
  const v = validatePlan2(d.plan, { assets: s.assets, facts: s.facts, understanding: s.understanding, art: d.recipe, mainAsset: s.mainAsset });
  assert.ok(v.plan.signature && KIN.SIGNATURES.includes(v.plan.signature.kind), 'a page with a look gets one');
  const h = render({ plan: v.plan, assets: s.assets });
  assert.equal((h.match(/ data-ksig="/g) || []).length, 1, 'exactly one scene carries it');
  const A = require('../lib/creative/ai'); assert.deepEqual(A.DIRECTOR_TOOL.input_schema.properties.signature.properties.kind.enum, KIN.SIGNATURES);
  assert.match(KIN.css, /\.sc\[data-ksig="pour"\] \.sc-heading :is\(\.kw,\.kw>i,\.kc\)\{[^}]*transform:none!important/, 'the pour heading\'s words stay in its text (a transformed word would leave the liquid)');
});

test('K18. polish: the page\'s colour morphs from scene to scene (a scene sliding over the last keeps its own); the nav steps aside going down and returns going up; the call to action fills on hover; the closing carries the brand\'s name at the page\'s width -- all measured with the layout, never per frame', () => {
  assert.match(KIN.css, /html\.k-morph:not\(\[data-motion="reduced"\]\) \.sc:not\(\[data-handoff="overlap"\]\):not\(\[data-handoff="stack"\]\):not\(\[data-overlapped\]\)\{background:transparent!important\}/);
  assert.match(KIN.js, /function paint\(y\)\{var vh=innerHeight,n=morph\.cols\.length,s=Math\.round\(vh\*\.1\)/, 'per frame: numbers and one gradient');
  // (each scene keeps its colour behind its own words; only the seam melts -- a heading never sits on the next scene's colour)
  assert.match(KIN.js, /morph\.bg\.style\.background=v/); assert.match(KIN.css, /html\.k-morph \.k-bg\{position:fixed;inset:0;z-index:-1;pointer-events:none\}/);
  assert.doesNotMatch(KIN.js.slice(KIN.js.indexOf('function paint(y)'), KIN.js.indexOf('function paint(y)') + 400), /getBoundingClientRect|offsetTop|getComputedStyle/, 'no layout read while scrolling');
  assert.match(KIN.js, /function measureM\(\)\{if\(!morph\)return;/); assert.match(KIN.js, /function measureK\(\)\{var y=W\.scrollY\|\|0;kdLines\(\);meltFit\(\);measureM\(\);fitMark\(\);/);
  assert.match(KIN.js, /if\(y>140&&y>navY\+6\)\{if\(!navOff\)\{navOff=true;H\.classList\.add\('k-navhide'\)\}\}/);
  assert.match(KIN.css, /\.k-navhide \.cr-nav:not\(:has\(details\[open\]\)\)\{translate:0 -110%;opacity:0\}/, 'never while its menu is open');
  assert.match(KIN.css, /html\[data-kinetic\] \.sc-cta:is\(:hover,:focus-visible\)::before\{clip-path:inset\(0\)\}/);
  assert.match(KIN.js, /mark\.className='k-mark';mark\.setAttribute\('aria-hidden','true'\)/, 'the closing name is decoration, never read twice');
  assert.doesNotMatch(KIN.js + KIN.css, /signature=/i, 'an exported page never carries what looks like a signed link');
});

test('K19. the owner\'s own brand: their logo, or their product photo as the main picture of a name nobody knows -- the page carries their copyright (never an "unofficial" or "imagined" disclaimer), and their own photos are never greyed, tinted or blurred by a treatment', () => {
  const { ASSETS, UND, FACTS } = require('./helpers/brand-fixture');
  const d = D2.direct({ understanding: UND, research: { page: null, facts: FACTS }, assets: ASSETS, supplied: { facts: [], memories: [] }, seed: '3', mainAsset: 'can' });
  const v = validatePlan2(d.plan, { assets: ASSETS, facts: FACTS, understanding: UND, art: d.recipe, mainAsset: 'can' });
  const sc = v.plan.scenes.find(s => s.layers.some(L => L.kind === 'image' && L.asset === 'can'));
  if (sc) sc.layers.filter(L => L.asset === 'can').forEach(L => { L.treatment = 'mono'; });
  const h = renderCreative2(v.plan, ASSETS, { mode: 'export', src: a => `${a.id}.png` });
  assert.ok(h.includes(`class="cr-footnote">© ${new Date().getFullYear()} ${v.plan.identity.name}.<`), 'the owner\'s logo: their copyright');
  assert.doesNotMatch(h, /An unofficial page made for fun|A work of imagination/);
  if (sc) { const sec = h.slice(h.indexOf(`id="${sc.id}"`), h.indexOf('</section>', h.indexOf(`id="${sc.id}"`))); assert.doesNotMatch(sec, /data-treatment="mono"/, 'the owner\'s product photo is never greyed'); }
  // without a logo, a recognised brand's page is still unofficial
  const noLogo = ASSETS.filter(a => a.id !== 'logo');
  const h2 = renderCreative2(v.plan, noLogo, { mode: 'export', src: a => `${a.id}.png` });
  assert.match(h2, /An unofficial page made for fun/);
});

test('K20. a touch screen plays its clips (muted, looping, inline) -- iPhone Safari never loads a paused clip\'s frames, so a scroll-driven clip stays blank there; the clip in the name (a second copy) is a mouse page\'s alone', () => {
  assert.match(KIN.js, /if\(!fine\)\{v\.muted=true;v\.setAttribute\('muted',''\);v\.loop=true;v\.playsInline=true;v\.setAttribute\('playsinline',''\);v\.autoplay=true;/);
  assert.match(KIN.js, /if\(!hv\|\|!hh\|\|RM\|\|!fine\)return;/);
});

test('K21. a phone\'s browser bars sliding away (a resize of the height alone, less than a bar) never re-measures the page mid-scroll -- it made the page jump under the finger', () => {
  const R2 = require('fs').readFileSync(require('path').join(__dirname, '..', 'lib', 'creative', 'render2.js'), 'utf8');
  assert.match(R2, /function realResize\(\)\{var w=W\.innerWidth,h=W\.innerHeight;if\(w===rw0&&Math\.abs\(h-rh0\)<180\)return false;/);
  assert.match(R2, /W\.addEventListener\('resize',function\(\)\{if\(!realResize\(\)\)return;/);
  assert.match(KIN.js, /if\(w===kw0&&Math\.abs\(h-kh0\)<180\)return;kw0=w;kh0=h;measureK\(\)/);
});

test('K22. the intro name breaks between words only; letters that drop or hinge in stay inside their own line', () => {
  assert.ok(KIN.js.includes("wd=d.createElement('span');wd.className='k-intro-w'"), 'letters grouped by word');
  assert.ok(KIN.css.includes('.k-intro-w{display:inline-block;white-space:nowrap;overflow:hidden'), 'a word never breaks');
  assert.ok(KIN.css.includes('.sc[data-kt]:not([data-kt="sweep"]):not([data-kt="cascade"]):not([data-kt="flip"]) .kw{overflow:visible}'), 'cascade and flip keep the word clip');
});
