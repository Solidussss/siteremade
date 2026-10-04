'use strict';
// CREATIVE, THE LOOK (look.js): one committed visual system per page. A consumer brand -- a mocked cola soft drink with
// a red-and-white logo, a red can, a cola pour, a bottle and a crowd (test/helpers/brand-fixture.js; the code knows no
// brand by name) -- must come out with bold campaign type, the brand's red / white / cola-brown palette, a product-led
// opening, no thin serif headline, no decorative rail, no translucent boxes or frames, no picture shown twice, no
// blurred blobs, and scenes that arrive as one composed event. Pure functions in-process: no server, no provider ($0).
const test = require('node:test');
const assert = require('node:assert/strict');
const LOOK = require('../lib/creative/look');
const PAL = require('../lib/creative/palette');
const D2 = require('../lib/creative/director2');
const { validatePlan2, VOCAB } = require('../lib/creative/validate2');
const { renderCreative2 } = require('../lib/creative/render2');
const { FONTS } = require('../lib/creative/render');
const { ASSETS, UND, FACTS } = require('./helpers/brand-fixture');

const SEEDS = ['1', '2', '3', '4', '5', '6'];
const byId = new Map(ASSETS.map(a => [a.id, a]));
function brandPage(seed) {
  const { plan, recipe } = D2.direct({ understanding: UND, research: { page: null, facts: FACTS }, assets: ASSETS, supplied: { facts: [], memories: [] }, seed, mainAsset: 'can' });
  const v = validatePlan2(plan, { assets: ASSETS, facts: FACTS, understanding: UND, art: recipe, mainAsset: 'can' });
  assert.deepEqual(v.errors, []); return v.plan;
}
const html = (P, o) => renderCreative2(P, ASSETS, Object.assign({ mode: 'export', src: a => `${a.id}.png` }, o || {}));
const PAGES = SEEDS.map(brandPage);
const root = id => LOOK.root(byId.get(id), byId).id;
const isRed = hex => { const c = PAL.hsl(hex); return (c.h < 0.03 || c.h > 0.97) && c.s > 0.7 && c.l > 0.3 && c.l < 0.6; };
const isBrown = hex => { const c = PAL.hsl(hex); const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)); return c.h > 0.01 && c.h < 0.12 && c.l < 0.25 && r > g && g > b; };
const isWhite = hex => PAL.lum(hex) > 0.85;

// ================================================================ the regression
test('LOOK-1. a cola brand gets bold campaign type -- never a thin serif headline -- fitted to its words', () => {
  PAGES.forEach(P => {
    assert.ok(['campaign', 'block', 'condensed'].includes(P.type.display), `${P.art.recipe}: ${P.type.display}`);
    assert.equal(P.type.display, P.look.type.family);
    const h = html(P);
    assert.match(h, new RegExp(`<html[^>]* data-display="${P.type.display}"`)); assert.match(h, /<html[^>]* data-look="/);
    const display = /--display:([^;]+);/.exec(h)[1];
    assert.doesNotMatch(display, /Georgia|Bodoni|Didot|Playfair|Palatino|(^|,\s*)serif\s*$/, `the display face is no serif: ${display}`);
    assert.ok(!display.includes(FONTS.serif) && !display.includes(FONTS.didone));
    // headlines are fitted to a measure (balanced lines), not to their longest word alone
    P.scenes.forEach(s => { if (!s.text.heading || s.text.entrance === 'split-words') return; assert.match(h, new RegExp(`--lw:${LOOK.measure(s.text.heading)}[;"]`), s.text.heading); });
  });
});

test('LOOK-2. its palette is the brand\'s own: red, white and cola brown -- from the logo and the pictures -- and every scene is readable on its colour', () => {
  PAGES.forEach(P => {
    const b = P.look.brand; assert.equal(b.confident, true); assert.ok(b.from.includes('logo'));
    assert.ok(isRed(b.primary), b.primary); assert.ok(isWhite(b.light), b.light); assert.ok(isBrown(b.deep), b.deep);
    assert.equal(P.palette.accent, b.primary, 'the brand red is the accent'); assert.ok(isWhite(P.palette.bg), 'a light page');
    assert.ok(LOOK.contrast(P.palette.ink, P.palette.bg) >= 7);
    const fields = [b.primary, b.light, b.deep];
    // (words alone stand on the brand red; a page whose every scene shows a picture keeps the red as its accent)
    assert.ok(P.scenes.some(s => s.ink.surface === b.primary) || P.scenes.every((s, i) => s.layers.some(L => L.kind === 'image') || (P.actor && i >= P.actor.from && i <= P.actor.to)), `${P.art.recipe}: a scene stands on the brand red`);
    P.scenes.forEach((s, i) => { if (s.background === 'base' && !s.layers.some(L => L.kind === 'image') && !(P.actor && i >= P.actor.from && i <= P.actor.to) && !s.tone) assert.fail(`${s.id}: a words-only scene on no brand colour`); });
    P.scenes.forEach(s => {
      assert.ok(LOOK.contrast(s.ink.ink, s.ink.surface) >= 4.5, `${s.id}: words readable on ${s.ink.surface}`);
      // (a surface is a brand colour, a photograph's own tone, or a flood -- never a random one)
      assert.ok(fields.includes(s.ink.surface) || s.tone || ['accent', 'invert', 'deep'].includes(s.background), `${s.id}: ${s.ink.surface}`);
    });
    // a red can never stands on a red field
    P.scenes.forEach((s, i) => { const free = s.layers.some(L => L.kind === 'image' && root(L.asset) === 'can') || (P.actor && i >= P.actor.from && i <= P.actor.to); if (free && s.background === 'base') assert.notEqual(s.ink.surface, b.primary, `${s.id}`); });
  });
});

test('LOOK-3. product-led: the page opens on the product itself', () => {
  PAGES.forEach(P => {
    const opening = P.scenes[0].layers.filter(L => L.kind === 'image').map(L => root(L.asset)).concat(P.actor && P.actor.from === 0 ? [root(P.actor.asset)] : []);
    assert.ok(opening.includes('can'), `${P.art.recipe}: ${opening}`);
  });
});

test('LOOK-4. no rail, no translucent boxes, no default frames, no blurred blobs, no generic gradients', () => {
  PAGES.forEach(P => {
    const h = html(P);
    assert.equal(P.thread.kind, 'none'); assert.match(h, /data-connector="none"/);
    P.scenes.forEach(s => s.layers.forEach(L => {
      if (L.kind === 'image') assert.ok(!['window', 'frame', 'porthole', 'polaroid', 'blob', 'torn'].includes(L.mask), `${s.id}: ${L.mask}`);
      if (L.kind === 'shape' && L.role !== 'focal') assert.ok(!['blob', 'circle', 'star', 'dots', 'sunburst'].includes(L.shape.form), `${s.id}: no soft glow as decoration (${L.shape.form})`);
    }));
    assert.doesNotMatch(h, /class="sc-amb"|class="amb-haze|class="ca-shape"|class="sc-ghost"/);
    assert.ok(['solid', 'grain', 'paper', 'grid', 'water', 'stars'].includes(P.atmosphere.backdrop), P.atmosphere.backdrop); assert.equal(P.atmosphere.particles, 'none'); assert.equal(P.atmosphere.light, 'none');
    assert.ok(!P.timeline || !P.timeline.actors.some(a => a.role === 'background'), 'no decorative background shape');
    assert.ok(!P.scenes.some(s => s.background === 'tint'), 'no translucent tint');
    // the words never stand in a box (no panel, no band, never glass): where they need the picture held back, a glow of the
    // scene's own colour blends into the background with no edge
    assert.match(h, /html\[data-look\] :is\(\.sc-text\.has-scrim,[^)]*\)\{background:none;padding:0;border-radius:0;-webkit-backdrop-filter:none;backdrop-filter:none;box-shadow:none/);
    assert.match(h, /::before\{content:"";position:absolute;inset:-38% -32%;z-index:-1;pointer-events:none;background:radial-gradient\(closest-side,/);
    assert.match(h, /html\[data-look\] \.sc-shade\[data-shade="band"\]\{display:none\}/);
    assert.match(h, /html\[data-look\] \.cs-carry\{border-radius:0;filter:none\}/);
  });
});

test('LOOK-5. every picture appears once: no repeat, no echo, no cut-out of a picture already shown -- one marked callback at most, in the closing scene', () => {
  PAGES.forEach(P => {
    const seen = new Map(); const handed = i => !!(P.timeline && P.timeline.transitions.some(t => t.at === i && ['card-expand', 'actor-carry'].includes(t.family)));
    P.scenes.forEach((s, i) => s.layers.forEach(L => {
      if (L.kind !== 'image') return; const r = root(L.asset);
      if (L.callback) { assert.equal(i, P.scenes.length - 1, 'a callback closes the page'); return; }
      if (P.actor && i >= P.actor.from && i <= P.actor.to && r === root(P.actor.asset)) return;
      if (seen.has(r)) assert.ok(handed(i) && seen.get(r) === i - 1 && L.role === 'focal', `${P.art.recipe}: ${r} shown again in ${s.id}`);
      else seen.set(r, i);
    }));
    if (P.actor) assert.ok(![...seen.entries()].some(([r, i]) => r === root(P.actor.asset) && (i < P.actor.from || i > P.actor.to)), 'the actor\'s picture is not shown again outside its run');
    assert.ok(P.scenes.flatMap(s => s.layers.filter(L => L.callback)).length <= 1);
    assert.doesNotMatch(html(P), /class="sc-ghost"/);
  });
  // the ledger itself: a photo, its cut-out and a copy of the cut-out are ONE picture
  const copy = { id: 'pv-c-can', origin: 'derived', derivedFrom: 'c-can', mime: 'image/png', assetRef: 'a'.repeat(64), assess: byId.get('c-can').assess, caps: byId.get('c-can').caps };
  const assets = ASSETS.concat([copy]);
  const img = (asset, extra) => Object.assign({ kind: 'image', role: 'focal', asset, box: { d: [50, 10, 40, 80], m: [10, 10, 80, 80] } }, extra || {});
  const raw = { identity: { name: 'Kolaro', kind: 'recognizable' }, concept: { title: 'Kolaro', logline: 'A cola.' }, palette: {}, type: {}, atmosphere: {}, motion: {},
    scenes: [{ id: 'a', purpose: 'p', height: 'screen', layers: [img('can')], text: { heading: 'Kolaro', size: 'display' } },
      { id: 'b', purpose: 'p', height: 'screen', layers: [img('c-can')], text: { heading: 'Ice cold' } },
      { id: 'c', purpose: 'p', height: 'screen', layers: [img('pour'), img('pv-c-can', { role: 'support', box: { d: [5, 10, 30, 60], m: [5, 5, 40, 40] } })], text: { heading: 'Poured' } },
      { id: 'd', purpose: 'p', height: 'screen', layers: [img('can', { callback: true })], text: { heading: 'Again, deliberately' } }] };
  const v = validatePlan2(raw, { assets, facts: [], understanding: UND });
  const shown = v.plan.scenes.map(s => s.layers.filter(L => L.kind === 'image').map(L => L.asset));
  assert.deepEqual(shown[1], [], 'the cut-out of the opening photo is the same picture');
  assert.ok(!shown[2].includes('pv-c-can'), 'a copy of the cut-out is the same picture'); assert.ok(shown[2].includes('pour'));
  assert.deepEqual(shown[3].map(root), ['can'], 'the one marked callback (the photo or its cut-out: the same picture)'); assert.equal(v.plan.scenes[3].layers[0].callback, true);
  const twice = JSON.parse(JSON.stringify(raw)); twice.scenes[2].layers = [img('can', { callback: true })];
  const v2 = validatePlan2(twice, { assets, facts: [], understanding: UND });
  assert.ok(!v2.plan.scenes[2].layers.some(L => L.asset === 'can'), 'a callback anywhere but the closing scene is a repeat');
});

test('LOOK-6. motion: each scene enters as ONE composed event -- one entrance for every layer, no stagger, the words on the same mask; 2-4 devices, nothing outside them', () => {
  PAGES.forEach(P => {
    P.scenes.forEach(s => {
      assert.ok(new Set(s.layers.map(L => `${L.entrance.kind}@${L.entrance.delay}`)).size <= 1, `${s.id}: one entrance`);
      assert.ok(s.layers.every(L => L.entrance.delay === 0)); assert.equal(s.text.entrance, 'none');
    });
    const d = P.look.devices; assert.ok(d.length >= 2 && d.length <= 4, d.join()); d.forEach(x => assert.ok(LOOK.DEVICES.includes(x)));
    const h = html(P); assert.match(h, new RegExp(`data-devices="${d.join(' ')}"`)); assert.match(h, new RegExp(`data-enter="${P.look.enter}"`));
    assert.match(h, /html\.cr-js\[data-look\]:not\(\[data-motion="reduced"\]\) \.sc:not\(\.is-in\) \.sc-stage,html\.cr-js\[data-look\]:not\(\[data-motion="reduced"\]\) \.sc:not\(\.is-in\) \.sc-text\{clip-path:inset\(0 0 100% 0\)\}/, 'one mask over the stage and the words');
    // nothing outside the devices: no shaped mask without mask-reveal, no moving loop without parallax, no moving type without type-motion
    P.scenes.forEach(s => s.layers.forEach(L => {
      if (L.kind === 'image' && LOOK.SHAPED.includes(L.mask)) assert.ok(d.includes('mask-reveal'));
      if (L.loop && !['none', 'sheen', 'kenburns'].includes(L.loop.kind)) assert.ok(d.includes('parallax'), `${s.id}: ${L.loop.kind}`);
    }));
    if (P.timeline) {
      assert.ok(!P.timeline.transitions.some(t => ['foreground-wipe', 'shape-takeover'].includes(t.family)), 'no flat shape transitions');
      if (!d.includes('type-motion')) assert.ok(!P.timeline.actors.some(a => a.role === 'typography'));
      if (!d.includes('handoff')) assert.ok(!(P.timeline.continuity && P.timeline.continuity.contracts.some(k => k.carry && k.carry !== 'none')));
    }
  });
});

test('LOOK-7. deterministic: the same brief, pictures and seed make the same page, byte for byte -- and it reopens unchanged', () => {
  SEEDS.slice(0, 3).forEach(seed => {
    const a = brandPage(seed), b = brandPage(seed); b.direction.at = a.direction.at; // (the direction is time-stamped)
    assert.equal(JSON.stringify(a), JSON.stringify(b)); assert.equal(html(a), html(b));
    const reopened = validatePlan2(JSON.parse(JSON.stringify(a)), { assets: ASSETS, facts: FACTS, understanding: UND, mode: 'safety' }).plan;
    assert.equal(JSON.stringify(reopened.look), JSON.stringify(a.look)); assert.equal(html(reopened), html(a), 'save, reopen, export: the same page');
  });
});

// ================================================================ the type system
test('LOOK-8. typography follows what the page is about -- premium is not a thin serif: luxury fashion gets the high-contrast serif, an essay the editorial serif, tech a wide or block sans, a restrained premium product a sans', () => {
  const famOf = (u, extra) => LOOK.direct(Object.assign({ plan: { art: { personality: (extra && extra.personality) || 'editorial' }, scenes: (extra && extra.heads || ['A heading']).map(h => ({ text: { heading: h } })) }, assets: [], understanding: u }, extra || {})).type.family;
  assert.equal(famOf({ subject: 'Maison Verne', brief: 'a quiet luxury couture fashion house', tone: { register: 'restrained' } }, { personality: 'luxe' }), 'didone');
  assert.equal(famOf({ subject: 'The Hanseatic League', brief: 'a long-read essay on the history of the Hanseatic League', tone: { register: 'serious' } }), 'serif');
  assert.ok(['wide', 'block', 'neutral'].includes(famOf({ subject: 'Qubit One', brief: 'a quantum computer startup platform', identity: { type: 'product', what: 'a quantum computing platform' } }, { personality: 'mechanical' })));
  const premium = famOf({ subject: 'Arc Kettle', brief: 'a premium, restrained page for a stainless steel kettle', tone: { register: 'restrained' }, identity: { type: 'product', what: 'a premium kettle' } }, { personality: 'luxe' });
  assert.ok(!['serif', 'didone'].includes(premium), `a premium product is not a thin serif (${premium})`);
  assert.equal(famOf({ subject: 'Bloop', brief: 'a playful page about a cartoon character', identity: { type: 'fictional-character' } }, { personality: 'playful' }), 'rounded');
  // a director's (or model's) serif for a soft drink is not honoured: the hint only counts when the family is eligible
  const cola = LOOK.direct({ plan: { type: { display: 'didone' }, art: { personality: 'cinematic' }, scenes: [{ text: { heading: 'Kolaro' } }] }, assets: ASSETS, understanding: UND, mainAsset: 'can' });
  assert.ok(!['serif', 'didone'].includes(cola.type.family), cola.type.family);
  // every family is in the vocabulary and has a face
  LOOK.FAMILY_NAMES.forEach(f => assert.ok(VOCAB.display.includes(f), f));
});

test('LOOK-9. headline fitting: a short phrase is set on balanced lines, never one word per line; a short word is held to the next and the last line is never one short word', () => {
  assert.equal(LOOK.measure('Kolaro'), 7, 'one word: its own length');
  assert.ok(LOOK.measure('Out of the dark.') > 'dark.'.length + 1, 'a phrase is not sized by its longest word alone');
  assert.equal(LOOK.measure('Out of the dark.'), 10, 'two balanced lines: "Out of / the dark."'); assert.deepEqual(LOOK.units('Out of the dark.'), ['Out', 'of', 'the\u00a0dark.']);
  const long = 'A small celebration of a big favourite, poured over ice';
  assert.ok(LOOK.measure(long) >= Math.ceil(long.length / 4), 'a long line takes at most four lines');
  ['Kolaro', 'Out of the dark.', long, 'Behold the icon of a summer'].forEach(t => assert.ok(LOOK.measure(t) >= Math.max(...t.split(' ').map(w => w.length)) + 1, `${t}: the longest word always fits`));
  assert.equal(LOOK.keep('Pull up a chair'), 'Pull up a\u00a0chair', 'an article holds to the next word'); assert.equal(LOOK.measure('A small celebration of a big favourite.'), 17, 'three lines, never one word alone in the middle');
  assert.ok(LOOK.keep('Everything worth knowing and more').endsWith('and more'), 'the last line is never one short word');
  assert.equal(LOOK.keep('Kolaro'), 'Kolaro');
  // the renderer sets the held text, fitted with the family's own advance and case
  const P = PAGES[0]; const h = html(P);
  assert.match(h, new RegExp(`html\\[data-look\\]\\[data-display\\]\\[data-case\\]\\{--fit:${LOOK.fitFor(P.look.type)}cqi;--dtrack:${P.look.type.track}em;--dlead:${P.look.type.lead}\\}`));
  assert.ok(LOOK.fitFor({ adv: 0.47, upper: 1.18, case: 'upper' }) > LOOK.fitFor({ adv: 0.72, upper: 1.18, case: 'upper' }), 'a condensed face fits more characters than a wide one');
});

// ================================================================ compatibility, reduced motion, mobile
test('LOOK-10. a page saved before looks reopens and renders exactly as it did: no look, its own type, rail, echoes and air', () => {
  const P = JSON.parse(JSON.stringify(PAGES[0])); delete P.look; P.thread.kind = 'ribbon'; P.type.display = 'serif';
  const v = validatePlan2(P, { assets: ASSETS, facts: FACTS, understanding: UND, mode: 'safety' }).plan;
  assert.equal(v.look, undefined, 'a saved page is never given a look on reopening'); assert.equal(v.thread.kind, 'ribbon'); assert.equal(v.type.display, 'serif');
  const h = html(v); assert.doesNotMatch(h, /data-look=|html\[data-look\]/); assert.match(h, /class="sc-amb"/); assert.match(h, /data-connector="ribbon"/);
  assert.equal(html(v), h, 'stable');
  // only an explicit recompose (today's layout rules) gives it the look
  const re = validatePlan2(P, { assets: ASSETS, facts: FACTS, understanding: UND, mode: 'accept', art: P.art }).plan; assert.ok(re.look); assert.equal(re.thread.kind, 'none');
});

test('LOOK-11. reduced motion and phones: the composed entrance is motion only -- reduced motion shows every scene at once; nothing in the look sizes past the screen', () => {
  const P = PAGES[0]; const reduced = html(P, { motion: 'reduced' });
  assert.match(reduced, /<html[^>]* data-motion="reduced"/);
  const lookCss = reduced.slice(reduced.indexOf('html[data-look][data-display]'), reduced.indexOf('</style>'));
  lookCss.split('\n').filter(l => /clip-path|transition:|[{;]transform:/.test(l)).forEach(l => assert.match(l, /html\.cr-js\[data-look\]:not\(\[data-motion="reduced"\]\)|card-expand/, `motion is scoped away from reduced motion: ${l.slice(0, 80)}`));
  assert.match(reduced, /html\[data-motion="reduced"\] \.ly-scroll,html\[data-motion="reduced"\] \.sc-stage\{transform:none!important;clip-path:none!important\}/);
  assert.doesNotMatch(lookCss, /\d{3,}px|\d{3,}vw/, 'no fixed widths in the look');
  assert.match(reduced, /@media \(max-width:720px\)/, 'the phone layout is still there');
});
