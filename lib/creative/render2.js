'use strict';
// CREATIVE — renderer for v2 (scene) plans. The same reusable mechanics serve every subject:
//   scenes of any number and height, optionally PINNED (the scene holds while scroll scrubs its
//   layers), a stage of layers per scene (pictures, drawn shapes, giant words) with masks,
//   treatments, depth, entrance choreography, ambient loops and scroll-linked movement, a
//   per-scene camera, page atmosphere, a thread that runs through the page, and a complete
//   reduced-motion composition. The plan (validated data) decides how they are used; nothing in it
//   is executed. Output: one self-contained document, used for the studio preview and the export.
//
//   renderCreative2(plan, assets, { src(asset) -> url, mode: 'preview'|'export', motion: 'full'|'reduced',
//                                   threeD: the project's validated 3D block (three-d.js), threeDRuntime: the engine's url })

const { esc, cleanTitle, FONTS } = require('./render');
const { drawnRect } = require('./validate');
const FR = require('./framing');
const PAL = require('./palette');
const ARCH = require('./archetypes');
const ART = require('./art');
const TL = require('./timeline');
const SP = require('./spatial');
const RENDERERS = require('./renderers');
const SPR = require('./spatial-runtime');
const CR = require('./carry-route');
const COMP = require('./composition');
const TD = require('./three-d');
const KIN = require('./kinetic');
const LOOK = require('./look');
const TYPEFACES = require('./fonts');

const FONT2 = Object.assign({}, FONTS, {
  mono: `"Cascadia Mono", "SF Mono", Consolas, "Courier New", monospace`,
  condensed: `"Arial Narrow", "Roboto Condensed", "Helvetica Neue Condensed", "Franklin Gothic Medium Cond", "Segoe UI", sans-serif`,
  script: `"Segoe Script", "Brush Script MT", "Snell Roundhand", cursive`,
  // the look's families (look.js): system faces only -- the page never loads a font from elsewhere
  block: `"Arial Black", "Segoe UI Black", "Helvetica Neue", Helvetica, Arial, sans-serif`,
  campaign: `Impact, Haettenschweiler, "Franklin Gothic Heavy", "Arial Narrow Bold", "Arial Black", sans-serif`,
  wide: `"Century Gothic", Futura, "Avenir Next", Avenir, "Segoe UI", "Trebuchet MS", sans-serif`,
  neutral: `"Helvetica Neue", "Segoe UI", Inter, Roboto, Helvetica, Arial, sans-serif`,
  humanist: `"Gill Sans", "Gill Sans MT", Seravek, Candara, Optima, "Segoe UI", sans-serif`,
});
const WEIGHT = { didone: 700, grotesk: 800, serif: 700, rounded: 700, slab: 700, mono: 700, condensed: 700, script: 400, block: 900, campaign: 400, wide: 700, neutral: 700, humanist: 600 };
const hexRgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)).join(',');
const HEIGHT_VH = { screen: 100, tall: 100, short: 64, auto: 0 };

function renderCreative2(plan, assets, opts) {
  const o = opts || {}; const mode = o.mode === 'export' ? 'export' : 'preview';
  const byId = new Map((assets || []).filter(a => a && !a.removed).map(a => [a.id, a]));
  const src = a => (a && o.src ? o.src(a) : '') || '';
  // (a picture's smaller copies, when the build made them: a screen loads the size it needs -- lib/creative/variants.js)
  const srcset = a => (a && o.srcset ? o.srcset(a) : '') || '';
  // PREMIUM MEDIA: a picture that also has a stored video (a local asset of the project) plays it over the picture; the
  // export points at the bundled file, the studio at the owner's own file route -- never a provider URL
  const videoSrc = a => (a && a.video ? (o.videoSrc ? o.videoSrc(a) : (mode === 'export' ? '' : `/api/premium-media/${encodeURIComponent(a.video.mediaId)}/file`)) : '') || '';
  const P = plan.palette; const hero = plan.scenes[0];
  // the owner's chosen typefaces (fonts.js -- ids only): the faces this page loads, and the type its headlines are fitted
  // with -- the chosen headline face's own measured width. A page without them renders exactly as it always did.
  const fonts = TYPEFACES.sanitize(plan.fonts); const fontType = fonts ? TYPEFACES.headlineType(fonts, plan.look ? plan.look.type : { case: plan.type.case }) : null;
  const fontSrc = o.fontSrc || (file => (mode === 'export' ? `assets/${file}` : `/creative-fonts/${encodeURIComponent(file)}`));
  // facts numbered in reading order; only cited ones are listed
  const citeNo = new Map(); const factById = new Map(plan.facts.map(f => [f.id, f]));
  plan.scenes.forEach(s => { [s.text.cite, ...s.text.items.map(i => i.cite)].forEach(c => { if (c && factById.has(c) && !citeNo.has(c)) citeNo.set(c, citeNo.size + 1); }); });
  const cite = c => (c && citeNo.has(c) ? `<a class="cr-cite" href="#cr-sources" aria-label="Source ${citeNo.get(c)}">[${citeNo.get(c)}]</a>` : '');
  const edit = k => ` data-edit="${esc(k)}"`;
  const creditOf = a => { const base = a && a.cutoutOf ? byId.get(a.cutoutOf) : a; if (!base || (base.origin === 'upload' && !base.ownerPicked)) return ''; const cr = plan.credits.find(x => x.asset === base.id); return cr ? [cr.author && cr.author.slice(0, 60), cr.license].filter(Boolean).join(' · ') : ''; };

  const arted0 = !!plan.art || plan.scenes.some(s => s.layout && s.layout !== 'free');
  // the page as one timeline (timeline.js): actors that live across scenes on two fixed layers (behind the scenes' content:
  // the backdrop whose colour flows from scene to scene, the typography and background actors; in front: the picture
  // actors and the transitions' own elements), the scenes they cross made transparent over the backdrop so the page
  // reads as one surface. Without scripting or with reduced motion none of it shows: each scene keeps its own colour
  // and the actor rests, as a picture, in its first scene.
  const tl = plan.art && plan.timeline && Array.isArray(plan.timeline.actors) ? plan.timeline : null;
  const actors = tl ? tl.actors.filter(a => a.from < plan.scenes.length && (a.kind !== 'image' || byId.get(a.asset))) : [];
  const castScenes = new Set(); actors.forEach(a => { for (let i = a.from; i <= Math.min(a.to, plan.scenes.length - 1); i++) castScenes.add(i); });
  const seamIn = new Map((tl ? tl.transitions : []).map(t => [t.at, t.family]));
  const actor = actors.find(a => a.role === 'primary') || null;
  // the renderer (renderers.js): a spatial page is the complete DOM page plus the spatial layer (spatial-runtime.js),
  // which draws the scenes it takes over in depth behind the words and hands them back on any failure
  const renderer = tl ? RENDERERS.resolve(plan).id : 'dom'; const spatial = renderer === 'spatial' ? tl.spatial : null;
  const spScenes = new Map(); if (spatial) spatial.pieces.forEach(p => (p.scenes || [p.scene]).forEach(i => spScenes.set(i, p.kind)));
  // (the scenes the spatial layer draws behind: a picture actor's run and the set pieces -- only these give up their own
  // surface and atmosphere while it runs; a typography actor is DOM and leaves its scene as designed)
  const spBehind = new Set(spScenes.keys()); if (spatial) actors.filter(a => a.kind === 'image' && spatial.actors.some(x => x.role === a.role)).forEach(a => { for (let i = a.from; i <= Math.min(a.to, plan.scenes.length - 1); i++) spBehind.add(i); });
  const behind = i => spBehind.has(i);
  const glSeams = spatial ? spatial.seams.filter(s => SEAM_SPAN[s.family] && behind(s.at - 1) && behind(s.at)) : [];
  // ONE surface: on a page with continuity contracts the scenes are transparent over a fixed backdrop whose colour flows
  // from each scene's picture-driven colour to the next (no "new section, new block" edges); without scripting or with
  // reduced motion every scene keeps its own colour
  const ct = tl && tl.continuity; const flowAll = !!(ct && arted0);
  // the premium hero video (Higgsfield, delivered and stored with the project): found from the hero's picture -- its
  // cut-out leads back to the photo it was made from -- or the premium request's own source, and shown unmistakably
  const heroVideo = (() => {
    if (!ct || !ct.hero) return null; const a = byId.get(ct.hero.asset); const base = a && a.cutoutOf ? byId.get(a.cutoutOf) : a;
    const v = [base, a].concat((plan.premiumMedia || []).map(m => byId.get(m.asset))).filter(Boolean).find(x => videoSrc(x));
    return v ? { asset: v, scene: ct.hero.scene, end: ct.hero.end } : null;
  })();
  // the motion-first compositions (composition.js): each composed scene's plane tracks, computed here from its name and its
  // pictures -- the hero video's measured motion continues through the next two scenes' cameras
  const lead = ct && ct.hero && ct.hero.video ? ct.hero.motion || 'none' : 'none'; const heroAt = ct && ct.hero ? ct.hero.scene || 0 : 0;
  // (a showcase's premium arc, premium-arc.js: each moment's scene is its clip, full-screen; a later moment's measured
  // motion leads the two cameras after it, as the hero's does)
  const pvArc = Array.isArray(plan.premiumArc) && plan.premiumArc.length >= 2 ? plan.premiumArc.filter(e => e && Number.isInteger(e.scene) && plan.scenes[e.scene]) : [];
  const pvAt = new Map(pvArc.map(e => [e.scene, e]));
  const leadFor = si => { const e = pvArc.filter(x => x.role !== 'hero' && x.scene < si && si <= x.scene + 2 && x.measured && x.measured.motion && x.measured.motion !== 'none').pop(); return e ? { lead: e.measured.motion, near: true } : { lead, near: si > heroAt && si <= heroAt + 2 }; };
  // TRUE 3D (three-d.js): a stage in each section that shows a model, where the subject's own picture sits -- the picture
  // stays until the model has been drawn, and for good when it cannot be. A page without a 3D scene gets none of this.
  // THE KINETIC LAYER (kinetic.js): smooth scroll, words that rise, pictures that lean with the mouse, clips the visitor
  // plays -- a page made with the look; never a page from before it
  const kin = KIN.on(plan, o);
  const td = o.threeD ? TD.forPage(o.threeD, { scenes: plan.scenes, byId, src, runtime: o.threeDRuntime || TD.RUNTIME[mode], actor: plan.actor }) : null;
  const compOf = (s, si) => (arted0 && s.composition && COMP.SPEC[s.composition] ? COMP.tracks(s, si, { byId, lead: leadFor(si).lead, leadNear: leadFor(si).near, mirror: !!(s.text.place && s.text.place.gc[0] >= 7) }) : null);
  const parts = plan.scenes.map((s, si) => renderScene(s, si, { plan, byId, src, videoSrc, srcset, cite, edit, creditOf, mode, fontType, arted: arted0, actor, tl, cast: castScenes, seamIn, sp: spatial ? spScenes : null, spBehind, td: td ? td.stages : null, heroVideo, flowAll, ctrack: compOf(s, si), pv: pvAt.get(si) || null, pvAfter: pvAt.get(si - 1) || null, mainAsset: ct && ct.hero ? (byId.get((byId.get(ct.hero.asset) || {}).cutoutOf) || byId.get(ct.hero.asset) || null) : null }));
  // a scene that holds while the next one stacks over it is held only for that: the two share a wrapper, so the hold
  // ends once it is covered and both then scroll on (never a scene stuck under the rest of the page)
  const sceneHtml = parts.map((h, si) => {
    const cur = plan.scenes[si];
    // (a scene stacking onto its predecessor never holds for the next one: one hold at a time)
    const opens = k => !!(plan.scenes[k + 1] && plan.scenes[k + 1].handoff === 'stack' && plan.scenes[k].handoff !== 'stack');
    if (arted0 && opens(si)) h = `<div class="sc-pair">\n${h}`;
    else if (arted0 && si > 0 && cur.handoff === 'stack' && opens(si - 1)) h = `${h}\n</div>`;
    return h;
  }).join('\n');
  const cast = tl ? castHtml(plan, tl, actors, byId, src, heroVideo) : { back: '', front: '' };
  const navItems = plan.scenes.slice(1).filter(s => s.navLabel).slice(0, 5).map(s => `<li><a href="#${esc(s.id)}">${esc(s.navLabel)}</a></li>`).join('') + '<li><a href="#cr-sources">Sources</a></li>';
  // the owner's logo leads the header when there is one (its own proportions, never regenerated); else the name
  const logoA = plan.logo && byId.get(plan.logo.asset); const brandName = hero.text.heading || plan.identity.name;
  const brand = logoA && src(logoA) ? `<a class="cr-brand cr-brand-logo" href="#top"><img class="cr-logo" src="${esc(src(logoA))}" alt="${esc(brandName)}" width="${(logoA.assess && logoA.assess.width) || 200}" height="${(logoA.assess && logoA.assess.height) || 60}" decoding="async"></a>` : `<a class="cr-brand" href="#top">${esc(brandName)}</a>`;
  const nav = `<header class="cr-nav">${brand}<nav aria-label="Scenes"><ul class="cr-links">${navItems}</ul><details class="cr-menu"><summary>Contents</summary><ul>${navItems}</ul></details></nav></header>`;
  // (the owner's own brand -- their logo, or their own product photo as the main picture of a name nobody knows: the page is
  // theirs, so it carries their copyright, never an 'unofficial' or 'imagined' disclaimer)
  const ownBrand = (assets || []).some(a => a && a.origin === 'upload' && (a.ownerRole === 'logo' || (a.ownerRole === 'main' && plan.identity.kind === 'invented')));
  const kindNote = ownBrand ? `© ${new Date().getFullYear()} ${esc(plan.identity.name)}.` : plan.identity.kind === 'personal' ? 'A personal page. Everything here about them was written by the family.' : plan.identity.kind === 'fictional' ? `An unofficial fan page about a work of fiction. Not affiliated with, or endorsed by, its creators or owners.` : plan.identity.kind === 'invented' ? (citeNo.size ? 'An unofficial page. The numbered lines come from the sources below; everything else on it is imagined.' : 'A work of imagination: nothing on this page describes real events.') : `An unofficial page made for fun. Not affiliated with, or endorsed by, anyone connected with ${esc(plan.identity.name)}.`;
  const cited = [...citeNo.keys()].map(k => factById.get(k));
  const sources = `<footer class="cr-foot" id="cr-sources"><details class="cr-sources"><summary>Sources and credits</summary>
    <p class="cr-kinds">${plan.identity.kind === 'personal' ? 'Words about them come from the family. ' : ''}${plan.identity.kind === 'fictional' ? 'Facts marked with a number describe the stories, as reported by the source below. ' : ''}Headlines and lines not marked with a number are written for this page and are not facts.</p>
    ${cited.length ? `<h3>Facts</h3><p>From ${plan.sources.map(s => `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.title)}</a>${s.license ? ` (${esc(s.license)})` : ''}${s.retrieved ? `, retrieved ${esc(String(s.retrieved).slice(0, 10))}` : ''}`).join(', ') || 'the sources below'}.</p><ol class="cr-factlist">${cited.map(f => `<li>${esc(f.text)}</li>`).join('')}</ol>` : ''}
    ${plan.credits.length ? `<h3>Pictures</h3><ul class="cr-credits">${plan.credits.map(c => `<li><a href="${esc(c.url)}" target="_blank" rel="noopener">${esc(cleanTitle(c.title))}</a>${c.author ? ` by ${esc(c.author)}` : ''}${c.license ? `, ${c.licenseUrl ? `<a href="${esc(c.licenseUrl)}" rel="noopener license">${esc(c.license)}</a>` : esc(c.license)}` : ''}${plan.derived.some(d => d.from === c.asset) ? ' — background removed by SiteRemade' : ''}</li>`).join('')}</ul>` : ''}
    </details><p class="cr-footnote">${kindNote}</p><p class="cr-made">Made with SiteRemade Creative</p></footer>`;
  const art = plan.art || null; const arted = arted0;
  const M = art ? ART.MOTION[art.personality] || ART.MOTION.editorial : null;
  const scene = Object.assign({ thread: plan.thread.kind, tempo: plan.motion.tempo, mode, focal: focalCfg(hero, byId) }, art ? { personality: art.personality, range: M.range } : {});
  const t = hero.text;
  const artAttrs = art ? ` data-personality="${art.personality}" data-scroll="${art.scroll}" data-typo="${art.typo}" data-nav="${art.nav}" data-density="${art.density}" data-depth="${art.depth}" style="--range:${M.range};--ease:${M.ease};--pinv:${M.pin}"` : '';
  return `<!doctype html>
<html lang="en" class="cr cr2"${tl ? ` data-renderer="${renderer}"` : ''}${flowAll ? ' data-flowall' : ''}${heroVideo || pvArc.length ? ' data-premium="video"' : ''}${td ? ' data-3d' : ''}${kin ? ' data-kinetic' : ''}${pvArc.length ? ` data-pvarc="${pvArc.length}"` : ''}${logoA ? ' data-logo' : ''}${fonts ? ` data-fonts="${esc(fonts.headline || 'chosen')}"` : ''} data-display="${plan.type.display}" data-scale="${plan.type.scale}" data-case="${plan.type.case}" data-tempo="${plan.motion.tempo}" data-backdrop="${plan.atmosphere.backdrop}" data-motion="${o.motion === 'reduced' ? 'reduced' : 'full'}" data-mode="${mode}" data-connector="${plan.thread.kind}"${artAttrs}${plan.look ? ` data-look="${plan.look.type.family}" data-devices="${plan.look.devices.join(' ')}" data-enter="${plan.look.enter}"` : ''}>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(t.heading || plan.identity.name)}</title>
<meta name="description" content="${esc((plan.concept.logline || t.body || '').slice(0, 160))}">
<meta name="generator" content="SiteRemade Creative">
<script>document.documentElement.classList.add('cr-js')</script>
<style>${css(plan, P)}${arted ? ARTCSS : ''}${spatial ? SPATIAL_CSS : ''}${td ? td.css : ''}${kin ? KIN.css : ''}${plan.look ? lookCss(plan.look) : ''}${fonts ? fontsCss(fonts, fontType, fontSrc) : ''}</style>
</head>
<body>
<a class="cr-skip" href="#main">Skip to content</a>
${nav}
${cast.back}<main id="main">
<svg class="cr-connector" aria-hidden="true" focusable="false"></svg>
${sceneHtml}
${sources}
</main>
${cast.front}${plan.fixture ? `<p class="cr-fixture" role="note">${esc(plan.fixture)}</p>` : ''}
<script type="application/json" id="cr-scene">${JSON.stringify(scene).replace(/</g, '\\u003c')}</script>
${spatial ? `<script type="application/json" id="cr-spatial">${spatialData(plan, spatial, actors, byId, src, glSeams)}</script>\n` : ''}${td ? `<script type="application/json" id="cr-3d">${td.json}</script>\n` : ''}<script>${RUNTIME2}${arted ? ART_RUNTIME : ''}${spatial ? SPR.RUNTIME : ''}${td ? td.loader : ''}${mode === 'preview' ? PREVIEW2 : ''}${kin ? KIN.js : ''}</script>
</body>
</html>`;
}

// the cast layers: every actor as ONE element with its keyframes as numbers (the runtime samples them on one scroll axis)
function castHtml(plan, tl, actors, byId, src, heroVideo) {
  const keys = a => a.keys.map(k => [k.g, k.x, k.y, k.s, k.r, k.o].concat(k.sp != null ? [k.sp] : []).join(',')).join(';');
  const head = a => `class="ca" data-role="${a.role}" data-from="${a.from}" data-to="${a.to}" data-ease="${a.ease}" data-keys="${keys(a)}"`;
  const img = a => { const x = byId.get(a.asset); const wd = (x.assess && x.assess.width) || 800, ht = (x.assess && x.assess.height) || 1000;
    return `<div ${head(a)} data-img style="--aa:${(wd / ht).toFixed(3)}"><img class="ca-img" data-asset="${esc(x.id)}" src="${esc(src(x))}" alt="" width="${wd}" height="${ht}" decoding="async"><div class="cr-missing" aria-hidden="true"><span>${esc(initials(plan.identity.name))}</span></div></div>`; };
  const word = a => { let ci = 0; const letters = [...a.text].map(ch => (ch === ' ' ? '<span class="sp"> </span>' : `<span class="ch" style="--ci:${ci++}">${esc(ch)}</span>`)).join('');
    return `<div ${head(a)} data-style="${a.style}" style="--cn:${Math.max(1, ci)}"><span class="ca-word">${letters}</span></div>`; };
  const shape = a => `<div ${head(a)}><i class="ca-shape" data-form="${a.shape.form}" data-fill="${a.shape.fill}"></i></div>`;
  // (the name stands in front of the pictures where its contracts say so -- a word breaking apart over the scene -- and
  // behind them otherwise)
  const contracts = (tl.continuity && tl.continuity.contracts) || [];
  const typoFront = !heroVideo && contracts.some(k => k.typography === 'front'); // (never in front of a premium hero video: the moving picture leads)
  const back = actors.filter(a => a.role === 'background' || (a.role === 'typography' && !typoFront)).map(a => (a.kind === 'word' ? word(a) : shape(a))).join('');
  const front = actors.filter(a => a.role === 'typography' && typoFront).map(a => word(a).replace('<div class="ca"', '<div class="ca" data-depth="front"')).join('') + actors.filter(a => a.kind === 'image').map(img).join('');
  // the transitions that are elements of their own: a panel wiping across, a colour taking the screen over, a word that
  // becomes the window onto the next picture (the next scene's own picture, shown at the size that scene shows it).
  // Each plays across its contract's overlap: it starts while the outgoing scene is still leaving (data-span, in screens)
  // and finishes as the next one arrives (data-end; only a carried subject may land just after: a wash or a panel never
  // still covers a scene that has come to rest at the top of the screen)
  const typo = actors.find(a => a.role === 'typography');
  const win = (at, lead, span) => { const k = contracts.find(x => x.at === at); return k ? `data-lead="${lead}" data-span="${Math.round((k.overlap.to - k.overlap.from) * 100) / 100}" data-end="${k.overlap.to}"` : `data-lead="${lead}" data-span="${span}"`; };
  const seams = tl.transitions.map(t => {
    const next = plan.scenes[t.at]; if (!next) return '';
    if (t.family === 'foreground-wipe') return `<i class="cs cs-wipe" data-at="${t.at}" ${win(t.at, '.3', '.6')} style="--c:${(next.ink && next.ink.surface) || 'var(--accent)'}"></i>`;
    if (t.family === 'shape-takeover') return `<i class="cs cs-take" data-at="${t.at}" ${win(t.at, '.45', '.45')} style="--c:${(next.ink && next.ink.surface) || 'var(--accent)'}"></i>`;
    if (t.family === 'type-mask' && typo) {
      const L = next.layers.find(x => x.role === 'focal' && x.kind === 'image'); const a = L && byId.get(L.asset); if (!a) return '';
      const u = esc(src(a)).replace(/'/g, '%27').replace(/[()]/g, c => (c === '(' ? '%28' : '%29'));
      return `<div class="cs cs-mask" data-at="${t.at}" ${win(t.at, '.6', '.6')} style="--cn:${Math.max(1, typo.text.replace(/\s/g, '').length)}"><span class="csm-word" style="background-image:url('${u}')">${esc(typo.text)}</span><i class="csm-img" style="background-image:url('${u}')"></i></div>`;
    }
    return '';
  }).join('') + carries(plan, contracts, byId, src);
  return { back: `<div class="cr-cast cr-back" aria-hidden="true"><i class="cb cb-a"></i><i class="cb cb-b"></i>${back}</div>\n`, front: `<div class="cr-cast cr-front" aria-hidden="true">${front}${seams}</div>\n` };
}

// a subject carried physically across a seam (a contract's carry: the same picture or the same subject on both sides):
// one element that, through the seam's window, travels from where the subject is in the outgoing scene to where it is in
// the incoming one -- both measured live as they scroll -- while the two scenes' own copies step aside; the outgoing
// picture turns into the incoming one on the way (a photo into its cut-out, one shot of the subject into the next)
function carries(plan, contracts, byId, src) {
  const focal = s => (s && s.layers.find(L => L.role === 'focal' && L.kind === 'image')) || null;
  const fit = (a, L) => ((a.caps && a.caps.moveFreely) || L.fit === 'contain' ? 'contain' : 'cover');
  return contracts.filter(k => k.carry && k.carry !== 'none').map(k => {
    const LA = focal(plan.scenes[k.at - 1]), LB = focal(plan.scenes[k.at]); const a = LA && byId.get(LA.asset), b = LB && byId.get(LB.asset);
    if (!a || !b || !src(a) || !src(b)) return '';
    // (a carry starts a little before the seam's own window and lands a little after the next scene has begun)
    const from = Math.max(-0.75, k.overlap.from - 0.15), to = Math.min(0.45, k.overlap.to + 0.15);
    return `<div class="cs cs-carry" data-at="${k.at}" data-lead="0" data-span="${Math.round((to - from) * 100) / 100}" data-end="${to}" data-carry="${k.carry}"><img class="csc-a" src="${esc(src(a))}" alt="" style="object-fit:${fit(a, LA)};object-position:${LA.focus || '50% 50%'}"><img class="csc-b" src="${esc(src(b))}" alt="" style="object-fit:${fit(b, LB)};object-position:${LB.focus || '50% 50%'}"></div>`;
  }).join('');
}

// what the spatial runtime draws, as numbers and file paths only (validated: spatial.js normalise)
const SEAM_SPAN = { 'object-pass': 0.6, 'disc-approach': 0.45, 'plane-approach': 0.7, 'card-flight': 0.7 };
function spatialData(plan, sp, actors, byId, src, glSeams) {
  const rgb = h => [1, 3, 5].map(i => +(parseInt(String(h).slice(i, i + 2), 16) / 255).toFixed(3));
  const aspect = a => +(((a.assess && a.assess.width) || 800) / ((a.assess && a.assess.height) || 1000)).toFixed(3);
  const out = {
    v: 1, q: sp.quality, phone: sp.phone, depth: sp.depth, fog: sp.fog, Q: SP.QUALITY, caps: { modelBytes: SP.CAPS.modelBytes },
    pal: { accent: rgb(plan.palette.accent), glow: rgb(plan.palette.glow), ink: rgb(plan.palette.ink) },
    cam: sp.camera.map(k => [k.g, k.dz, k.dx, k.dy, k.yaw, k.pitch]),
    actors: sp.actors.map(x => {
      const a = actors.find(y => y.role === x.role); const img = a && byId.get(a.asset); if (!img) return null; const mdl = x.model ? byId.get(x.model) : null;
      return { role: x.role, form: x.form, url: src(img), aa: aspect(img), model: mdl ? src(mdl) : '', from: a.from, to: a.to, K: a.keys.map((k, j) => [k.g, k.x, k.y, k.s, k.r, k.o, x.z[j] || 0, x.ry[j] || 0]) };
    }).filter(Boolean),
    pieces: sp.pieces.map(p => (p.kind === 'globe' ? { kind: p.kind, scene: p.scene, points: p.points, arcs: p.arcs, fill: p.fill }
      : { kind: p.kind, scene: p.scene, scenes: p.scenes || [p.scene], steps: !!p.steps, planes: p.assets.map(id => byId.get(id)).filter(Boolean).map(a => ({ url: src(a), aa: aspect(a) })) })),
    particles: sp.particles,
    seams: (glSeams || []).map(s => {
      const next = plan.scenes[s.at]; const L = next && next.layers.find(x => x.role === 'focal' && x.kind === 'image'); const a = L && byId.get(L.asset);
      return { at: s.at, fam: s.family, span: SEAM_SPAN[s.family], c: rgb((next && next.ink && next.ink.surface) || plan.palette.accent), url: (s.family === 'plane-approach' || s.family === 'card-flight') && a ? src(a) : '' };
    }),
  };
  return JSON.stringify(out).replace(/</g, '\\u003c');
}
// the globe's DOM form (no WebGL, reduced motion, a phone kept DOM): the same points, still, drawn once as SVG
function globeSvg(p) {
  const n = Math.min(520, p.points); const ga = Math.PI * (3 - Math.sqrt(5)); const tx = 0.38, ty = 0.6; const dots = [];
  for (let i = 0; i < n; i++) {
    const y0 = 1 - (i / (n - 1)) * 2, r = Math.sqrt(1 - y0 * y0), th = ga * i; let x = Math.cos(th) * r, y = y0, z = Math.sin(th) * r;
    [x, z] = [x * Math.cos(ty) + z * Math.sin(ty), -x * Math.sin(ty) + z * Math.cos(ty)]; [y, z] = [y * Math.cos(tx) - z * Math.sin(tx), y * Math.sin(tx) + z * Math.cos(tx)];
    if (z < -0.05) continue; dots.push(`<circle cx="${x.toFixed(3)}" cy="${(-y).toFixed(3)}" r="${(0.006 + 0.008 * z).toFixed(4)}" opacity="${(0.3 + 0.7 * z).toFixed(2)}"/>`);
  }
  return `<svg class="sp-globe-dom" viewBox="-1.05 -1.05 2.1 2.1" aria-hidden="true" focusable="false" data-fill="${p.fill}">${dots.join('')}</svg>`;
}

function actorStatic(c) {
  const a = c.byId.get(c.actor.asset); const st = TL.stateAt(c.actor, c.actor.from + 0.15) || { x: 0, y: 0, s: 1, r: 0 }; const wd = (a.assess && a.assess.width) || 800, ht = (a.assess && a.assess.height) || 1000;
  return `<div class="actor-static" data-img style="--aa:${(wd / ht).toFixed(3)};--ax:${Math.round(st.x)};--ay:${Math.round(st.y)};--as:${st.s.toFixed(2)};--ar:${Math.round(st.r)}"><img class="actor-img" data-asset="${esc(a.id)}" src="${esc(c.src(a))}" alt="${esc(a.alt || c.plan.identity.name)}" width="${wd}" height="${ht}" decoding="async"><div class="cr-missing" aria-hidden="true"><span>${esc(initials(c.plan.identity.name))}</span></div></div>`;
}

function focalCfg(s, byId) {
  const f = s.layers.find(L => L.role === 'focal' && L.kind === 'image'); if (!f) return null;
  const a = byId.get(f.asset); return { fit: f.fit, aspect: (a && a.assess && a.assess.aspect) || 1, bbox: (a && a.assess && a.assess.subject) || [0, 0, 1, 1] };
}
function initials(t) { return String(t || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join(''); }

function particles(atm, count) {
  if (atm.particles === 'none' || !count) return '';
  let seed = 11; const r = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  if (atm.particles === 'stars') { const dots = []; for (let i = 0; i < count * 3; i++) dots.push(`${(r() * 100).toFixed(1)}vw ${(r() * 100).toFixed(1)}vh 0 ${r() < 0.15 ? 1 : 0}px rgba(255,255,255,${(0.3 + r() * 0.6).toFixed(2)})`); return `<div class="pt" data-kind="stars" aria-hidden="true"><i class="pt-stars" style="box-shadow:${dots.join(',')}"></i></div>`; }
  const parts = []; for (let i = 0; i < count; i++) { const k = atm.particles; const size = k === 'fog' ? 40 + r() * 50 : k === 'clouds' ? 14 + r() * 18 : k === 'steam' ? 6 + r() * 8 : k === 'bubbles' ? 0.4 + r() * 1.4 : k === 'petals' || k === 'confetti' ? 0.5 + r() * 0.7 : 0.15 + r() * 0.35; parts.push(`<i style="--px:${(r() * 100).toFixed(1)};--py:${(r() * 100).toFixed(1)};--ps:${size.toFixed(2)};--pd:${(r() * -20).toFixed(1)}s;--pt:${(9 + r() * 16).toFixed(1)}s;--pr:${Math.round(r() * 360)}deg"></i>`); }
  return `<div class="pt" data-kind="${atm.particles}" aria-hidden="true">${parts.join('')}</div>`;
}

// (a picture past the first two scenes loads as it comes near -- except where it starts clipped, carried or pinned: Safari
// never starts a lazy picture its reveal has clipped shut, and a pinned or sliding scene moves its pictures by transform)
function lazyAt(c, si, L) {
  if (si < 2 || L.track) return false; const s = c.plan && c.plan.scenes && c.plan.scenes[si]; if (!s) return false;
  return !s.pin && !/reveal|mask|track|wipe|travel/.test(s.choreo || '') && !['mask', 'window'].includes(L.mask);
}
function renderLayer(L, si, c, groupInner) {
  const [x, y, w, h] = L.box.d; const [mx, my, mw, mh] = L.box.m;
  const a0 = L.kind === 'image' ? c.byId.get(L.asset) : null;
  // the art-directed page: a layer's depth (its z) for depth choreography, its step, a strip panel's own aspect
  const extra = c.arted ? `;--dz:${((L.z - 4) * 0.3).toFixed(2)}${L.step != null ? `;--sti:${L.step}` : ''}${L.seq != null ? `;--sq:${L.seq}` : ''}${L.win ? `;--wx:${L.win[0]};--wy:${L.win[1]};--ww:${L.win[2]};--wh:${L.win[3]}` : ''}${L.track && a0 ? `;--ar:${Math.max(0.62, Math.min(1.8, FR.profile(a0).aspect)).toFixed(3)}` : ''}` : '';
  const isFocal = L.kind === 'image' && L.role === 'focal' && c.focalBeat && !c.focalDone; if (isFocal) c.focalDone = true;
  const xfPartner = c.xf && !isFocal && L.kind === 'image' && L.role !== 'focal' && L.role !== 'texture' && !c.xfDone; if (xfPartner) c.xfDone = true;
  const pl = c.ctrack ? c.ctrack.planes[L.id] || null : null;
  const style = `--x:${x};--y:${y};--w:${w};--h:${h};--mx:${mx};--my:${my};--mw:${mw};--mh:${mh};--z:${L.z};--rot:${L.rotate}deg;--op:${L.opacity};--delay:${L.entrance.delay}s;--dur:${L.entrance.dur}s;--amp:${L.loop.amp};--period:${L.loop.period}s${extra}${isFocal && c.focalBeat.vars ? ';' + c.focalBeat.vars : ''}${pl ? ';' + planeStyle(pl, c.ctrack.rest) : ''}`;
  const artAttrs = `${pl ? planeAttrs(pl) : ''}${isFocal ? c.focalBeat.attrs : ''}${xfPartner ? ` data-xf="${c.xf.j}" data-xfdir="${c.xf.b.dir}"` : ''}${L.seq != null ? ' data-seq' : ''}${L.win ? ' data-win' : ''}${L.step != null ? ` data-step="${L.step}"` : ''}${L.exit ? ` data-exit="${L.exit}"` : ''}${L.enter ? ` data-enter="${L.enter}"` : ''}${L.track ? ' data-track' : ''}${L.frame ? ` data-frame="${L.frame}"` : ''}`;
  let art = '';
  if (groupInner != null) {
    return `<div class="ly ly-group" data-kind="group" data-role="${L.role === 'focal' && si === 0 ? 'subject' : L.role}"${pl ? planeAttrs(pl) : ''} style="${style}"><div class="ly-scroll" data-scroll="${L.scroll.kind}" data-amount="${L.scroll.amount}"${L.scroll.anchor ? ` data-anchor="${L.scroll.anchor === 'left' ? 'left' : 'right'}"` : ''}><div class="ly-in" data-entrance="${L.entrance.kind}"><div class="ly-loop" data-loop="${L.loop.kind}"><div class="ly-art ly-group-art">${groupInner}</div></div></div></div></div>`;
  }
  if (L.kind === 'image') {
    const a = c.byId.get(L.asset); if (!a) return '';
    const wd = (a.assess && a.assess.width) || 1200, ht = (a.assess && a.assess.height) || 900;
    // a framed picture (framing.js) carries its framing to the page: fit and crop position per breakpoint (as CSS
    // variables, so they hold without scripting), its crop budget and where its subject is -- the runtime guard
    // re-checks the crop against the real viewport and never lets it pass the budget
    let imgAttr = `style="object-fit:${L.fit};object-position:${L.focus}"`;
    if (L.frame) {
      const pr = FR.profile(a); const budget = c.pv && L.role === 'focal' && L.asset === c.pv.asset ? 1 : FR.budgetFor(a, L.frame);
      imgAttr = `data-fit="${L.fit}"${L.mfit ? ` data-mfit="${L.mfit}"` : ''} data-crop="${budget}" data-f="${pr.focus.map(v => v.toFixed(3)).join(' ')}"${pr.subject ? ` data-subj="${pr.subject.join(' ')}"` : ''} style="--of:${L.fit};--oq:${L.focus};--mof:${L.mfit || L.fit};--moq:${L.mfocus || L.focus}"`;
    }
    const vid = c.videoSrc ? c.videoSrc(a) : '';
    // (the payoff clip plays once and rests on its last frame: the page concludes, it does not loop)
    const once = c.pv && c.pv.role === 'payoff' && L.asset === c.pv.asset;
    art = `<img class="ly-img" data-asset="${esc(a.id)}" src="${esc(c.src(a))}"${c.srcset && c.srcset(a) ? ` srcset="${esc(c.srcset(a))}" sizes="(max-width:720px) 100vw, 70vw"` : ''} alt="${esc(a.alt || '')}" width="${wd}" height="${ht}" decoding="async"${lazyAt(c, si, L) ? ' loading="lazy"' : si === 0 && L.role === 'focal' ? ' fetchpriority="high"' : ''} ${imgAttr}>${vid ? `<video class="ly-vid" data-asset="${esc(a.id)}" src="${esc(vid)}" poster="${esc(c.src(a))}" muted${once ? ' data-once' : ' loop'} playsinline autoplay preload="metadata" aria-hidden="true" ${imgAttr}></video>` : ''}<div class="cr-missing" aria-hidden="true"><span>${esc(initials(c.plan.identity.name))}</span></div>`;
  } else if (L.kind === 'shape') {
    // drawn as light (thin glowing strokes, glows, sparkles) -- except the focal shape of an explicitly abstract page
    const solid = c.plan.imagery && c.plan.imagery.status === 'abstract' && L.role === 'focal';
    art = `<div class="shape" data-form="${L.shape.form}" data-fill="${L.shape.fill}"${L.shape.stroke ? ' data-stroke' : ''}${solid ? '' : ' data-light'}>${L.shape.form === 'wave' ? '<svg viewBox="0 0 200 40" preserveAspectRatio="none"><path d="M0 20 Q 25 0 50 20 T 100 20 T 150 20 T 200 20" /></svg>' : ''}</div>`;
  } else {
    art = `<span class="ly-word" data-style="${L.word.style}" style="--len:${Math.max(2, L.word.text.length)}">${esc(L.word.text)}</span>`;
  }
  // (the ceiling on a picture's scroll zoom travels with it: framing.js ZOOM)
  const zmax = L.kind === 'image' && (L.scroll.kind === 'zoom-in' || L.scroll.kind === 'zoom-out') ? ` data-zmax="${FR.zoomCeiling(L)}"` : '';
  // (a photograph placed in the scene melts into it: which of its edges, per breakpoint -- an edge on the screen's edge stays)
  const ma = L.kind === 'image' && c.plan.look ? c.byId.get(L.asset) : null;
  const meltBox = (b, p) => { if (!Array.isArray(b) || b.length < 4) return ''; const l = b[0] > 1.5, r = b[0] + b[2] < 98.5, t = b[1] > 1.5, bo = b[1] + b[3] < 98.5; return l && r && t && bo ? `${p}-all ${p}-l ${p}-r ${p}-t ${p}-b` : [l && 'l', r && 'r', t && 't', bo && 'b'].filter(Boolean).map(x => `${p}-${x}`).join(' '); };
  // (the owner's own product photos are shown as shot -- never greyed, tinted or blurred by a treatment)
  const ownShot = !!(ma && c.plan.look && (ma.origin === 'upload' || (ma.cutoutOf && (c.byId.get(ma.cutoutOf) || {}).origin === 'upload')) && ma.ownerRole !== 'logo');
  const meltable = ma && !ma.cutout && !(ma.assess && ma.assess.transparent) && !['backdrop', 'texture'].includes(L.role) && ['none', 'window', 'frame', 'polaroid'].includes(L.mask);
  const melt = meltable && L.track ? 'd-all d-l d-r d-t d-b m-all m-l m-r m-t m-b' : meltable && L.box ? [meltBox(L.box.d, 'd'), meltBox(L.box.m, 'm')].filter(Boolean).join(' ') : '';
  // (a wide photograph in a tall phone box: covering it cut away most of the photo and blew its middle up soft -- a 16:9
  // product shot in a portrait box showed half its width. Past about 40% cut, on a phone the box takes the photo's own
  // shape, centred where the box was: the whole photograph, sharp, still melting into the scene)
  const wa = L.kind === 'image' && si > 0 && !L.track && L.fit !== 'contain' && L.box && Array.isArray(L.box.m) ? c.byId.get(L.asset) : null;
  const war = wa && !wa.cutout && !(wa.assess && wa.assess.transparent) && wa.assess && wa.assess.width && wa.assess.height ? wa.assess.width / wa.assess.height : 0;
  const wide = war >= 1.2 && !(c.pv && L.asset === c.pv.asset) && war / ((L.box.m[2] / Math.max(1, L.box.m[3])) * 0.89) > 1.6;
  const gr = L.kind === 'image' && c.plan.look && c.plan.look.grade && L.treatment === 'none' ? c.plan.look.grade.per[L.asset] : null; const ga = gr ? c.byId.get(L.asset) : null;
  const gradeAttr = gr ? ` data-grade="${ga && !ga.cutout && !(ga.assess && ga.assess.transparent) && L.fit === 'cover' ? 'tint' : 'tone'}" style="--gf:brightness(${gr[0]}) saturate(${gr[1]}) contrast(${c.plan.look.grade.c})"` : '';
  return `<div class="ly" data-kind="${L.kind}" data-role="${L.role === 'focal' && si === 0 ? 'subject' : L.role}"${L.hideM ? ' data-hide-m' : ''}${L.kind === 'image' ? ' data-img' : ''}${L.edge === 'fade' ? ' data-edge="fade"' : ''}${melt ? ` data-melt="${melt}"` : ''}${wide ? ' data-wide' : ''}${artAttrs} style="${style}${wide ? `;--war:${war.toFixed(3)};--wmw:${Math.max(L.box.m[2], 92)}` : ''}"><div class="ly-scroll" data-scroll="${L.scroll.kind}" data-amount="${L.scroll.amount}"${zmax}${L.scroll.anchor ? ` data-anchor="${L.scroll.anchor === 'left' ? 'left' : 'right'}"` : ''}><div class="ly-in" data-entrance="${L.entrance.kind}"><div class="ly-loop" data-loop="${L.loop.kind}"><div class="ly-art" data-mask="${L.mask}" data-treatment="${ownShot && ['mono', 'duotone', 'soft'].includes(L.treatment) ? 'none' : L.treatment}"${L.frame ? ` data-fit="${L.fit}"` : ''}${gradeAttr}>${art}</div></div></div></div></div>`;
}

// a plane of a composition (composition.js tracks): its keys as numbers, the window it opens from, and its resting state
// (transform, opacity, clip) written inline -- what reduced motion and a page without scripting show
const planeAttrs = (pl, plane) => ` data-plane="${plane || pl.plane}" data-tk="${pl.keys.map(k => k.join(',')).join(';')}"${pl.win ? ` data-win4="${pl.win.map(v => Math.round(v * 100) / 100).join(',')}"` : ''}`;
function planeStyle(pl, rest) {
  const v = COMP.sample(pl.keys, rest); const f = n => Math.round(n * 1000) / 1000;
  const clip = pl.win && v[5] > 0.001 ? `;clip-path:inset(${f(pl.win[1] * v[5])}% ${f((100 - pl.win[0] - pl.win[2]) * v[5])}% ${f((100 - pl.win[1] - pl.win[3]) * v[5])}% ${f(pl.win[0] * v[5])}% round ${f(v[5] * 18)}px)` : '';
  return `--ko:${f(v[4])};transform:translate3d(${f(v[0])}vw,${f(v[1])}vh,0) rotateY(${f(v[6])}deg) rotate(${f(v[3])}deg) scale(${f(v[2])})${clip}`;
}
// a group is ONE object on the stage: a wrapper at the union of its members' boxes carries the anchor's entrance,
// loop and scroll (the focal's, else the first member's); members sit inside it at their relative places and keep
// only their own ambient loop -- so a blade and its hilt, or a head and its halo, never come apart
function union(boxes) {
  const x0 = Math.min(...boxes.map(b => b[0])), y0 = Math.min(...boxes.map(b => b[1])), x1 = Math.max(...boxes.map(b => b[0] + b[2])), y1 = Math.max(...boxes.map(b => b[1] + b[3]));
  return [x0, y0, Math.max(1, x1 - x0), Math.max(1, y1 - y0)];
}
const rel = (b, u) => [(b[0] - u[0]) / u[2] * 100, (b[1] - u[1]) / u[3] * 100, b[2] / u[2] * 100, b[3] / u[3] * 100].map(v => Math.round(v * 100) / 100);
function renderStage(s, si, c0) {
  const c = Object.assign({}, c0, { focalDone: false, xfDone: false }); const out = []; const done = new Set();
  s.layers.forEach(L => {
    if (!L.group) { out.push(renderLayer(L, si, c)); return; }
    if (done.has(L.group)) return; done.add(L.group);
    const members = s.layers.filter(M => M.group === L.group);
    const anchor = members.find(M => M.role === 'focal') || members[0];
    const ud = union(members.map(M => M.box.d)), um = union(members.map(M => M.box.m));
    const inner = members.map(M => renderLayer(Object.assign({}, M, { box: { d: rel(M.box.d, ud), m: rel(M.box.m, um) }, entrance: Object.assign({}, M.entrance, { kind: 'none' }), scroll: { kind: 'none', amount: 0 }, loop: M === anchor ? Object.assign({}, M.loop, { kind: 'none' }) : M.loop, role: M.role === 'focal' ? 'part' : M.role }), si, Object.assign({}, c, { ctrack: null }))).join('');
    const wrap = Object.assign({}, anchor, { box: { d: ud, m: um }, rotate: 0, opacity: 1, z: Math.max(...members.map(M => M.z)), mask: 'none', treatment: 'none', role: anchor.role });
    out.push(renderLayer(wrap, si, c, inner));
  });
  return out.join('');
}

function renderScene(s, si, c) {
  const k = `scenes.${si}.text`; const t = s.text; const hero = si === 0;
  const H = hero ? 'h1' : 'h2';
  const artOn = !!(s.layout && s.layout !== 'free'); const art = c.plan.art || null;
  const wlist = String(t.heading).split(/\s+/).filter(Boolean);
  const wordHtml = (w, j) => (t.entrance === 'split-words' ? `<span class="w" style="--i:${j}">${esc(w)}</span>` : esc(w));
  // a short opening title set in staggered lines (giant and poster typography): two or three lines, each stepped in
  const stagger = artOn && hero && art && (art.typo === 'giant' || art.typo === 'poster') && wlist.length >= 3 && t.heading.length <= 44;
  // the text-layout rules the scene's words were set by (validate2 text.fit, LOOK.TEXT_FIT): a scene saved before today's keeps
  // rendering exactly as it did until it is re-fitted ("Fix text layout", an edit, a recompose); a page with a look always
  // fitted its headlines to a measure
  const fitV = Number.isInteger(t.fit) ? t.fit : 0; const fitted = !!c.plan.look || fitV >= 2 || !!c.fontType;
  // (today's rules measure a heading written in capitals as capitals: a family set in mixed case fits its measure to
  // lower-case letters, and capitals are wider -- by the family's own capitals factor)
  // (a chosen headline face is measured by its own width and capitals -- fonts.js headlineType)
  const lt = c.fontType || (c.plan.look && c.plan.look.type) || {}; const caseUpper = c.fontType || c.plan.look ? lt.case === 'upper' : !!(c.plan.type && c.plan.type.case === 'upper');
  const letters = String(t.heading).match(/\p{L}/gu) || []; const capsShare = letters.length ? letters.filter(ch => ch !== ch.toLowerCase()).length / letters.length : 0;
  const capsK = (fitV >= 2 || c.fontType) && !caseUpper && capsShare > 0.6 ? (lt.upper || 1.2) : 1;
  let words; let lw = fitted ? Math.ceil(LOOK.measure(t.heading) * capsK) : Math.max(4, ...String(t.heading).split(/\s+/).map(w => w.length));
  if (stagger && fitV >= 2) {
    // (today's rules break the title where the fitted headline breaks -- LOOK.lines, the same measure -- and size it so its
    // longest line, with that line's step, still fits: never a lone last word, never a line pushed past its column)
    const L = LOOK.lines(t.heading); let j = 0; const adv = c.fontType || c.plan.look ? (lt.adv || 0.55) * (caseUpper ? lt.upper || 1.2 : 1) : 0.5;
    const step = t.place && t.place.align === 'center' ? [0, 0, 0] : [0, 0.9, 0.35];
    lw = Math.max(lw, ...L.map((l, i) => Math.ceil(l.length * capsK + (step[i] || 0) / adv) + 1));
    words = L.map(l => `<span class="ln">${l.split(' ').map(u => u.split(' ').map(w => wordHtml(w, j++)).join(' ')).join(' ')}</span>`).join(' ');
  } else if (stagger) {
    const n = wlist.length >= 5 ? 3 : 2; const per = t.heading.length / n; const lines = [[]]; let len = 0;
    wlist.forEach((w, j) => { if (len > per * lines.length && lines.length < n) lines.push([]); lines[lines.length - 1].push([w, j]); len += w.length + 1; });
    words = lines.map(l => `<span class="ln">${l.map(([w, j]) => wordHtml(w, j)).join(' ')}</span>`).join(' ');
  } else words = t.entrance === 'split-words' ? wlist.map(wordHtml).join(' ') : esc(fitted ? LOOK.keep(t.heading) : t.heading);
  const tr = artOn ? t.treatment || '' : '';
  // this scene's beats (timeline.js): each on an element of the scene, driven by its own window of the scene's progress
  const beats = c.tl ? c.tl.beats.filter(b => b.scene === si) : [];
  const beatOf = target => beats.map((b, j) => (b.target === target ? { b, j } : null)).filter(Boolean);
  const battr = target => beatOf(target).map(({ b, j }) => ` data-b${j}="${b.op}-${b.dir}"`).join('');
  const bvars = target => beatOf(target).map(({ b, j }) => [typeof b.v === 'number' ? `--v${j}:${b.v}` : '', typeof b.v2 === 'number' ? `--u${j}:${b.v2}` : ''].filter(Boolean).join(';')).filter(Boolean).join(';');
  const has = op => beats.some(b => b.op === op);
  // (letters spread apart and gather as the scene arrives: each letter moved by translate only, words kept whole)
  let ci = 0; const cn = String(t.heading).replace(/\s+/g, '').length;
  if ((tr === 'letter-spread' || has('letter-spread')) && !stagger) words = wlist.map(w => `<span class="lw">${[...w].map(ch => `<span class="ch" style="--ci:${ci++}">${esc(ch)}</span>`).join('')}</span>`).join(' ');
  // (a statement fills in word by word as it is read: the body, else the heading)
  const fillBody = (tr === 'word-fill' && !!t.body) || beats.some(b => b.op === 'word-fill' && b.target === 'body'); const fillHead = ((tr === 'word-fill' && !t.body) || beats.some(b => b.op === 'word-fill' && b.target === 'heading')) && !stagger;
  const fill = str => String(str).split(/\s+/).filter(Boolean).map((w, j) => `<span class="wf" style="--i:${j}">${esc(w)}</span>`).join(' ');
  if (fillHead) words = fill(t.heading);
  const wn = fillBody ? String(t.body).split(/\s+/).filter(Boolean).length : fillHead ? wlist.length : 0;
  const items = t.items.length ? `<ol class="sc-list" data-list="${t.list}">${t.items.map((it, j) => `<li class="sc-item" style="--i:${j}">${it.label ? `<span class="sc-label"${c.edit(`${k}.items.${j}.label`)}>${esc(it.label)}</span>` : ''}<span${c.edit(`${k}.items.${j}.text`)}>${esc(it.text)}</span>${c.cite(it.cite)}</li>`).join('')}</ol>` : '';
  const heroFocal = hero ? s.layers.find(L => L.role === 'focal' && L.kind === 'image') : null;
  const inRun = !!(c.actor && si >= c.actor.from && si <= c.actor.to);
  const credit = heroFocal ? c.creditOf(c.byId.get(heroFocal.asset)) : hero && inRun ? c.creditOf(c.byId.get(c.actor.asset)) : '';
  // (a text-swap shows its second line first, then the heading settles in its place)
  if (has('text-swap') && t.alt) words = `<span class="hs"><span class="hs-alt" aria-hidden="true">${esc(t.alt)}</span><span class="hs-main">${words}</span></span>`;
  const place = artOn && t.place ? t.place : null;
  const tpl = artOn && c.ctrack && c.ctrack.text ? c.ctrack.text : null;
  // (a look's scene whose giant word IS its heading shows the name once: the giant word is the headline the eye reads, the
  // heading stays for screen readers and search -- never the same name twice, one under the other)
  const norm = v => String(v || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  const echoed = !!c.plan.look && !t.giant && !!t.heading && s.layers.some(L => L.kind === 'word' && L.role === 'echo' && L.word && L.word.style === 'solid' && !(L.opacity < 0.8) && L.box && L.box.d && L.box.d[2] >= 80 && norm(L.word.text) === norm(t.heading));
  const textArt = artOn ? ` data-v="${place ? place.v : 'middle'}" data-align="${place ? place.align : 'left'}" data-mplace="${t.mplace || 'above'}"${t.giant ? ' data-giant' : ''}${echoed ? ' data-echoed' : ''}${t.columns ? ' data-columns' : ''}${t.shade ? ` data-shade="${t.shade}"` : ''}${tr ? ` data-treatment="${tr}"` : ''}${t.role ? ` data-role="${t.role}"` : ''}${t.act ? ` data-act="${t.act}"` : ''}${t.copy ? ` data-copy="${t.copy}"` : ''}${tpl ? planeAttrs(tpl, 'text') : ''}${place || wn || tpl || tr === 'letter-spread' || has('letter-spread') ? ` style="${[place ? `--gc:${place.gc[0] + 1} / ${place.gc[1] + 2}` : '', wn ? `--wn:${wn}` : '', tr === 'letter-spread' || has('letter-spread') ? `--cn:${cn}` : '', tpl ? planeStyle(tpl, c.ctrack.rest) : ''].filter(Boolean).join(';')}"` : ''}` : '';
  const text = `<div class="sc-text${t.scrim ? ' has-scrim' : ''}" data-region="${t.region}" data-size="${t.size}" data-width="${t.width}" data-entrance="${t.entrance}"${textArt}>
      ${t.kicker ? `<p class="sc-kicker${hero ? ' cr-kicker' : ''}"${c.edit(`${k}.kicker`)}>${esc(t.kicker)}</p>` : ''}
      ${t.heading ? `<${H} class="sc-heading${hero ? ' cr-h1' : ''}" data-len="${t.heading.length > 40 ? 'xl' : t.heading.length > 22 ? 'l' : 's'}"${t.entrance === 'split-words' || stagger || tr === 'letter-spread' || fillHead || has('letter-spread') || has('text-swap') ? '' : c.edit(`${k}.heading`)}${stagger ? ' data-stagger' : ''}${battr('heading')} style="--lw:${lw}${t.giant && c.plan.look ? `;--lwm:${Math.ceil(LOOK.measure(t.heading, true) * capsK)}` : ''}${t.giant && c.plan.look && LOOK.units(t.heading).length <= 8 ? `;--lww:${Math.ceil(Math.max(4, ...LOOK.units(t.heading).map(w => w.length + 1)) * capsK)}` : ''}${bvars('heading') ? ';' + bvars('heading') : ''}">${words}</${H}>` : ''}
      ${t.body ? `<p class="sc-body${hero ? ' cr-lede' : ''}"${battr('body')}${bvars('body') ? ` style="${bvars('body')}"` : ''}${fillBody && tr === 'word-fill' ? ` data-blen="${t.body.length > 240 ? 'l' : t.body.length > 120 ? 'm' : 's'}"` : ''}><span${c.edit(`${k}.body`)}>${fillBody ? fill(t.body) : esc(t.body)}</span>${c.cite(t.cite)}</p>` : ''}
      ${items}
      ${hero && s.cta && c.plan.scenes[1] ? `<a class="sc-cta cr-cta" href="#${esc(c.plan.scenes[1].id)}">${esc(s.cta)}<span aria-hidden="true">↓</span></a>` : ''}
    </div>`;
  const count = hero || s.atmosphere ? Math.round(c.plan.atmosphere.density * (c.plan.atmosphere.particles === 'stars' ? 60 : 22)) : 0;
  const atmos = hero || s.atmosphere ? `<div class="sc-world" aria-hidden="true"><div class="sc-backdrop"></div><div class="sc-light" data-light="${c.plan.atmosphere.light}"></div>${particles(c.plan.atmosphere, count)}${c.plan.atmosphere.grain ? '<div class="sc-grain"></div>' : ''}</div>` : '';
  // every scene has its own air: a far haze in the palette's colours, a vignette, and a few near, out-of-focus sparkles
  let seed = 97 + si * 31; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const near = [0, 1, 2, 3].map(() => `<i style="left:${(rnd() * 96).toFixed(1)}%;top:${(30 + rnd() * 65).toFixed(1)}%;width:${(0.6 + rnd() * 1.4).toFixed(2)}vw;height:${(0.6 + rnd() * 1.4).toFixed(2)}vw;--t:${(16 + rnd() * 14).toFixed(1)}s;--d:${(-rnd() * 20).toFixed(1)}s"></i>`).join('');
  // (a page with a look takes its air from the brand and its pictures: no drifting haze, no sparkles)
  const amb = c.plan.look ? '' : `<div class="sc-amb" aria-hidden="true"><i class="amb-haze"></i><i class="amb-haze amb-b"></i><i class="amb-vig"></i><span class="amb-near">${near}</span></div>`;
  const ink = s.ink || {};
  const prev = si > 0 && c.plan.scenes[si - 1] && c.plan.scenes[si - 1].ink ? c.plan.scenes[si - 1].ink.surface : '';
  const changes = prev && ink.surface && prev.toLowerCase() !== String(ink.surface).toLowerCase();
  // the art-directed seam: a bleed evolves the colour as the scene arrives (instead of the fixed fade); an overlap or a
  // stack covers the previous scene; a scene followed by a stacking one holds while it is covered
  const handoff = s.handoff || 'cut'; const nextS = c.plan.scenes[si + 1];
  const flow = changes && !(c.arted && ['bleed', 'overlap', 'stack'].includes(handoff));
  const bleed = changes && c.arted && handoff === 'bleed';
  const hold = !!(c.arted && nextS && nextS.handoff === 'stack' && handoff !== 'stack');
  const overlapped = !!(c.arted && nextS && nextS.handoff === 'overlap');
  const carries = s.layers.some(L => L.exit || L.enter);
  // the seams this scene takes part in: entered by an expanding picture or from depth, left toward the camera
  const seamIn = c.seamIn ? c.seamIn.get(si) || '' : ''; const seamOut = c.seamIn ? c.seamIn.get(si + 1) || '' : '';
  // the continuity contracts (continuity.js) of the seams this scene meets: the window its picture opens from (the
  // previous scene's frame, or the hero's subject), when the backdrop starts handing over, how the hero video ends
  const ct = c.tl && c.tl.continuity; const kIn = ct ? ct.contracts.find(x => x.at === si) : null; const kOut = ct ? ct.contracts.find(x => x.at === si + 1) : null;
  const opensFrom = kIn && ['image-expand', 'card-expand'].includes(seamIn) && kIn.family === seamIn && kIn.outgoing.inset ? kIn.outgoing.inset : null;
  const bgw = kOut ? (kOut.background === 'carry' ? 0.92 : Math.round((1 + kOut.overlap.from) * 100) / 100) : null;
  // the premium hero video: inside the picture's own frame when the scene shows that photo large; otherwise full-bleed
  // behind the scene (a cut-out or a small frame would hide it) -- never a file the page has but does not show
  const HV = c.heroVideo && c.heroVideo.scene === si ? c.heroVideo : null;
  const inFrame = HV ? s.layers.find(L => L.kind === 'image' && L.asset === HV.asset.id && L.box.d[2] * L.box.d[3] >= 4500) : null;
  const vh = HV ? HV.end || 'static-frame' : '';
  const heroVid = HV && !inFrame ? `<div class="sc-herovid" aria-hidden="true"><img class="shv-still" src="${esc(c.src(HV.asset))}" alt=""><video class="shv-vid" src="${esc(c.videoSrc(HV.asset))}" poster="${esc(c.src(HV.asset))}" muted loop playsinline autoplay preload="auto"></video></div>` : '';
  const stageVideo = HV && !inFrame ? Object.assign({}, c, { videoSrc: a => (a && a.id === HV.asset.id ? '' : c.videoSrc(a)) }) : c;
  // (the clip playing full-bleed behind the scene IS that photo: the same photo is not drawn again, still, over its own
  // clip -- the photo itself, a copy of it, or the same file uploaded again; a cut-out of the subject still floats over it)
  const sameAsClip = L => { if (L.kind !== 'image') return false; const a = c.byId.get(L.asset); if (!a || a.cutout || a.cutoutOf || (a.assess && a.assess.transparent)) return false; const h = HV.asset; return a.id === h.id || a.derivedFrom === h.id || (!!a.assetRef && a.assetRef === h.assetRef) || (!!c.src(a) && c.src(a) === c.src(h)); };
  const stageScene = HV && !inFrame && s.layers.some(sameAsClip) ? Object.assign({}, s, { layers: s.layers.filter(L => !sameAsClip(L)) }) : s;
  // the words enter from the picture's side: they come out of the image as the scene arrives (not laid on top of it)
  const fL = s.layers.find(L => L.role === 'focal' && L.kind === 'image');
  const tie = c.flowAll && fL && fL.box.d[2] < 85 ? (fL.box.d[0] + fL.box.d[2] / 2 >= 50 ? 'right' : 'left') : '';
  // the contracts on the page: the direction things move across each seam (this scene arrives along the incoming one's
  // vector and leaves along the outgoing one's), and the colour window of the seam it arrives through
  const vin = c.flowAll && kIn && kIn.motionVector && kIn.motionVector !== 'none' ? kIn.motionVector : '';
  const vout = c.flowAll && kOut && kOut.motionVector && kOut.motionVector !== 'none' ? kOut.motionVector : '';
  const pal = c.flowAll && kIn ? `${kIn.overlap.from},${kIn.overlap.to},${kIn.paletteHandoff === 'blend' && kIn.background === 'carry' ? 'hold' : kIn.paletteHandoff || 'blend'}` : '';
  const seamAttr = (['image-expand', 'card-expand', 'depth-handoff'].includes(seamIn) ? ` data-seam-in="${seamIn}"` : '') + (seamOut === 'depth-handoff' ? ' data-seam-out="depth-handoff"' : '') + (vh ? ` data-vh="${vh}"` : '') + (tie ? ` data-tie="${tie}"` : '') + (vin ? ` data-vin="${vin}"` : '') + (vout ? ` data-vout="${vout}"` : '') + (c.pv ? ` data-pv="${c.pv.role}" data-pvend="${c.pv.continuation || 'settle'}"` : '') + (c.pvAfter && c.pvAfter.role !== 'hero' ? ` data-pvafter="${c.pvAfter.role}"` : '');
  // a rest scene (or one whose picture is small) is never an empty field: a dim, slow echo of its own picture -- or of the
  // page's main picture, the visual identity coming back in another role -- lies behind it
  const cover = s.layers.filter(L => L.kind === 'image').reduce((t, L) => t + (L.box.d[2] * L.box.d[3]) / 10000, 0);
  const rest = c.tl && ['rest', 'acceleration'].includes((c.tl.rhythm || [])[si]);
  // (the closing scene's callback: when the main picture is not its own picture, the main picture returns behind it)
  const callback = c.flowAll && ct && ct.callback && ct.callback.scene === si && ct.callback.kind !== 'none' ? ct.callback.kind : '';
  const echoA = callback && callback !== 'subject' && c.mainAsset ? c.mainAsset
    : c.flowAll && !inRun && !hero && (rest || cover < 0.3) && cover < 0.5 ? (fL && c.byId.get(fL.asset)) || c.mainAsset || null
    // (the scene after a later premium moment keeps a dim echo of that clip's picture: the takeover's world fades, it does not vanish)
    : c.flowAll && c.pvAfter && c.pvAfter.role !== 'hero' && cover < 0.6 && c.byId.get(c.pvAfter.asset) ? c.byId.get(c.pvAfter.asset) : null;
  // (a page with a look never shows a picture twice: no echo -- its callback is a real, marked layer -- look.js ledger)
  const echo = echoA && !c.plan.look && c.src(echoA) ? `<div class="sc-ghost" aria-hidden="true"><img src="${esc(c.src(echoA))}" alt="" decoding="async"></div>` : '';
  const glowC = c.flowAll && s.visual && s.visual.palette ? PAL.glow(PAL.secondary(c.byId.get(s.visual.asset)) || s.visual.palette, c.plan.palette) : '';
  const inCast = !!(c.cast && c.cast.has(si));
  // (in a held composition everything that arrives has arrived by the composition's rest -- where the scene is read: the
  // heading it is about shows, never the line before it; a word spreading its letters has spread, never half over the
  // heading. What leaves still leaves after it)
  const cRest = s.pin && c.ctrack && typeof c.ctrack.rest === 'number' ? c.ctrack.rest : null;
  // (words alone, set giant -- a look's statement scene: on a phone it is the whole screen, the empty stage gone)
  const has3d = !!(c.td && c.td.has(si));
  const alone = !!c.plan.look && artOn && !!t.giant && !s.layers.some(L => L.kind === 'image') && !has3d;
  const beatWin = beats.map(b => { let f0 = s.pin ? b.from : b.dir === 'out' ? 0.55 + b.from * 0.4 : 0.08 + b.from * 0.47; let t0 = s.pin ? b.to : b.dir === 'out' ? 0.55 + b.to * 0.4 : 0.08 + b.to * 0.47; if (b.dir !== 'out' && cRest != null && t0 > cRest) { t0 = Math.max(0.04, cRest); f0 = Math.max(0, Math.min(f0, t0 - 0.12)); } return `${f0.toFixed(3)},${t0.toFixed(3)}`; }).join(';');
  const needsP = c.arted && (artOn && s.choreo && s.choreo !== 'settle' && s.choreo !== 'actor' || !!c.ctrack || bleed || carries || hold || !!s.exit || tr === 'letter-spread' || tr === 'word-fill' || beats.length > 0 || !!seamAttr);
  const covers = s.layers.some(L => L.kind === 'image' && L.fit === 'cover');
  const sceneArt = c.arted && (artOn || s.handoff) ? ` data-layout="${s.layout || 'free'}" data-choreo="${s.choreo || 'settle'}" data-handoff="${handoff}"${artOn ? ` data-mplace="${t.mplace || 'above'}"` : ''}${s.steps && s.pin ? ` data-steps="${s.steps}"` : ''}${s.sceneType ? ` data-type="${s.sceneType}"` : ''}${s.exit && seamOut !== 'depth-handoff' ? ` data-exit="${s.exit}"` : ''}${inRun ? ' data-actor' : ''}${inCast ? ' data-cast' : ''}${seamAttr}${beats.length ? ` data-beats="${beatWin}"` : ''}${has('perspective') ? ' data-persp' : ''}${needsP ? ' data-p' : ''}${hold ? ' data-hold' : ''}${overlapped ? ' data-overlapped' : ''}${bleed ? ' data-bleed' : ''}${bgw != null ? ` data-bgw="${bgw}"` : ''}${pal ? ` data-pal="${pal}"` : ''}${glowC ? ` data-glow="${glowC}"` : ''}${callback ? ` data-callback="${callback}"` : ''}${echo ? ' data-echo' : ''}${c.ctrack ? ` data-comp="${c.ctrack.comp}" data-cam="${c.ctrack.camera}" data-rest="${c.ctrack.rest}"` : ''}${c.ctrack && s.arc ? ` data-arc="${s.arc}"` : ''}` : '';
  const counter = s.steps && s.pin && s.steps > 1 ? `<p class="sc-count" aria-hidden="true"><b>01</b><span> / ${String(s.steps).padStart(2, '0')}</span></p>` : '';
  const shade = artOn && t.shade ? `<div class="sc-shade" data-shade="${t.shade}" aria-hidden="true"></div>` : '';
  const trackStage = artOn && s.choreo === 'track';
  const spKind = c.sp ? c.sp.get(si) || '' : ''; const spPiece = spKind === 'globe' ? c.tl.spatial.pieces.find(p => p.kind === 'globe' && p.scene === si) : null;
  return `<section class="sc${hero ? ' cr-hero' : ' cr-reveal'}" id="${hero ? 'top' : esc(s.id)}" data-scene="${si}"${spKind ? ` data-sp="${spKind}"` : ''}${c.spBehind && c.spBehind.has(si) ? ' data-sp-behind' : ''} data-height="${s.height}"${alone ? ' data-alone' : ''}${has3d ? ' data-3d' : ''}${s.pin ? ' data-pin' : ''} data-bg="${s.background}"${s.tone ? ' data-tone' : ''}${flow ? ' data-flow' : ''} data-camera="${s.camera}"${covers && s.camera !== 'none' ? ' data-camcap' : ''} data-morder="${s.mobile.order}"${hero ? ' data-hero' : ''}${sceneArt}${s.move && s.move.words ? ` data-kmw="${s.move.words}"` : ''}${s.move && s.move.picture ? ` data-kmp="${s.move.picture}"` : ''}${c.plan.signature && c.plan.signature.scene === s.id ? ` data-ksig="${c.plan.signature.kind}"` : ''} style="--s-ink:${ink.ink};--s-muted:${ink.muted};--s-surface:${ink.surface}${ink.accent ? `;--s-accent:${ink.accent}` : ''}${flow || bleed ? `;--prev:${prev}` : ''}${s.steps && s.pin ? `;--steps:${s.steps}` : ''}${opensFrom ? `;--sit:${opensFrom[0]}%;--sir:${opensFrom[1]}%;--sib:${opensFrom[2]}%;--sil:${opensFrom[3]}%` : ''}${c.ctrack && c.ctrack.comp === 'mask-stage' && fL && c.byId.get(fL.asset) ? `;--mimg:url('${esc(c.src(c.byId.get(fL.asset))).replace(/'/g, '%27').replace(/[()]/g, ch => (ch === '(' ? '%28' : '%29'))}')` : ''}"${c.arted ? ` data-surf="${ink.surface}"` : ''} aria-label="${esc(t.heading || s.name || `Scene ${si + 1}`)}">
  <div class="sc-pin">${atmos}${amb}${echo}${heroVid}${spPiece ? globeSvg(spPiece) : ''}
    ${beatOf('scene').map(({ b, j }) => (b.op === 'takeover' ? `<i class="sc-bgx" aria-hidden="true" data-b${j}="background-in" style="--from:${prev || 'var(--bg)'}"></i><i class="sc-take" aria-hidden="true" data-b${j}="takeover-in"></i>` : `<i class="sc-bgx" aria-hidden="true" data-b${j}="background-in" style="--from:${prev || 'var(--bg)'}"></i>`)).join('')}
    <div class="sc-stage"${trackStage ? ' data-track' : ''}${battr('stage')}${s.layers.some(L => L.seq != null) || bvars('stage') ? ` style="${[s.layers.some(L => L.seq != null) ? `--n:${s.layers.filter(L => L.seq != null).length}` : '', bvars('stage')].filter(Boolean).join(';')}"` : ''}>${renderStage(stageScene, si, Object.assign({}, stageVideo, { focalBeat: { attrs: battr('focal'), vars: bvars('focal') }, xf: beatOf('focal').find(x => x.b.op === 'crossfade') }))}${(c.td && c.td.get(si)) || ''}</div>
    ${c.actor && c.actor.from === si ? actorStatic(c) : ''}
    ${shade}${text}${counter}
    ${credit ? `<p class="cr-herocredit">Picture: ${esc(credit)}</p>` : ''}
  </div>
</section>`;
}

// ---------------------------------------------------------------- the look (look.js)
// A page with a look: its type system (the family's fit, tracking and leading), no glass, no rounded frames, no
// generic gradients -- and each scene arriving as ONE composed event: one mask opens over the whole stage while the
// camera settles, the words ride the same mask, nothing staggers on its own clock. Reduced motion shows it all at once.
function lookCss(L) {
  const t = L.type; const R = 'html.cr-js[data-look]:not([data-motion="reduced"])';
  return `
html[data-look][data-display][data-case]{--fit:${LOOK.fitFor(t)}cqi;--dtrack:${t.track}em;--dlead:${t.lead}}
html[data-look] .sc-heading,html[data-look] .cr-brand{letter-spacing:var(--dtrack)!important;line-height:var(--dlead)!important;text-wrap:balance}
html[data-look][data-case="upper"] .sc-heading{text-transform:uppercase}
/* one page, one shoot: each picture's own correction, and one light cast over the photographs that fill their frames */
${L.grade ? `html[data-look]{--gtint:${L.grade.tint};--galpha:${L.grade.alpha}}
html[data-look] .ly-art[data-grade] :is(.ly-img,.ly-vid){filter:var(--gf)}
html[data-look] .ly-art[data-grade="tint"]::after{content:"";position:absolute;inset:0;background:var(--gtint);mix-blend-mode:soft-light;opacity:var(--galpha);pointer-events:none;border-radius:inherit}
` : ''}/* the subject carried across the opening is the scene's object at full size: up to 44% of the screen's width (a wide
   product), most of its height (a tall one) -- the words keep the other side */
@media (min-width:45.01em){html[data-look] .ca[data-img]{height:64vh;height:64svh;max-width:44vw}}
/* a statement scene on a phone: the whole screen, the words in its middle, no empty stage under them */
@media (max-width:45em){html[data-look] .sc[data-alone] .sc-stage{display:none}html[data-look] .sc[data-alone] .sc-pin{justify-content:center;min-height:72svh}html[data-look][data-look] .sc:not([data-comp="mask-stage"]) .sc-text[data-giant] .sc-heading[data-len]{font-size:min(19vw,calc(var(--fit) * 1.06 / var(--lwm,var(--lw))))}html[data-look][data-look] .sc[data-alone]:not([data-comp="mask-stage"]) .sc-text[data-giant] .sc-heading[data-len]{font-size:min(30vw,calc(var(--fit) * 1.02 / var(--lww,var(--lwm,var(--lw)))))}html[data-look] .sc[data-comp] .sc-text[data-giant]{text-align:center!important;transform-origin:50% 50%}}
/* a statement set giant stays giant however long it is: its size comes from its longest line, never from a cap for long headings */
html[data-look] .sc-text[data-giant] .sc-heading[data-len]{font-size:min(clamp(4rem,15vw,17rem),calc(var(--fit) * 1.12 / var(--lw)))}
/* the name once: where a solid giant word is the heading, on a desktop the heading is read by screen readers and search, not
   shown twice (on a phone the giant word runs off both edges -- the heading stays) */
@media (min-width:45.01em){html[data-look] .sc-text[data-echoed] .sc-heading{position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0}}
/* an opening shrine is the brand's name set monumental over its object -- on a quiet page too */
html[data-look] .sc.cr-hero[data-layout="shrine"] .sc-text[data-size="display"] .sc-heading[data-len]{font-size:min(clamp(3rem,9vw,9.5rem),calc(var(--fit) / var(--lw)))}
/* the closing scene owns the whole screen -- on a phone too: the credits follow it, never share its screen */
html[data-look] main>.sc:last-of-type:not([data-pin]) .sc-pin{min-height:100vh;min-height:100svh;justify-content:center}
/* words never sit in a box: no panel, no band -- where they need the picture held back behind them, a soft glow in the
   scene's own colour blends into the background with no edge at all */
html[data-look] :is(.sc-text.has-scrim,.sc[data-choreo="expand"] .sc-text){background:none;padding:0;border-radius:0;-webkit-backdrop-filter:none;backdrop-filter:none;box-shadow:none;position:relative;isolation:isolate}
html[data-look] :is(.sc-text.has-scrim,.sc[data-choreo="expand"] .sc-text,.sc:has(.sc-shade[data-shade="band"]) .sc-text)::before{content:"";position:absolute;inset:-38% -32%;z-index:-1;pointer-events:none;background:radial-gradient(closest-side,color-mix(in srgb,var(--s-surface,var(--bg)) 84%,transparent),color-mix(in srgb,var(--s-surface,var(--bg)) 46%,transparent) 58%,transparent)}
html[data-look] .sc:has(.sc-shade[data-shade="band"]) .sc-text{position:relative;isolation:isolate}
html[data-look] .sc-shade[data-shade="band"]{display:none}
html[data-look] .sc-list[data-list="notes"] .sc-item{background:none;border:0;border-top:3px solid var(--s-accent,var(--accent));border-radius:0;padding:14px 0 0}
html[data-look] .ly-art:is([data-mask="window"],[data-mask="frame"],[data-mask="porthole"],[data-mask="polaroid"]){border:0;outline:0;border-radius:0;box-shadow:none;padding:0;background:none}
html[data-look] .cs-carry{border-radius:0;filter:none}
html[data-look] .ly[data-track][data-melt]{--rot:0deg!important}
html[data-look] .sc[data-choreo="track"] .ly[data-track] .ly-art{background:none;box-shadow:none!important;border:0;border-radius:0;padding:0}
@media (max-width:45em){html[data-look] .sc[data-choreo="track"] .sc-stage[data-track]{height:min(54svh,calc(59vw * 2))}html[data-look] .sc[data-choreo="track"] .ly[data-track]{height:100%;aspect-ratio:auto;width:min(86vw,calc(54svh * var(--ar,1)))}html[data-look] .sc[data-choreo="track"] .ly[data-track] :is(.ly-img,.ly-vid){object-fit:cover!important}}
/* photographs never sit in a box: the edges that face into the page melt into the scene's own colour -- no frame, no hard
   edge, no drop shadow (an edge on the screen's edge stays) */
html[data-look] .ly[data-melt] .ly-art{--kf:15%;--kfy:13%;--ml:0%;--mr:0%;--mt:0%;--mb:0%;border:0;outline:0;padding:0;background:none;box-shadow:none!important;-webkit-mask-image:linear-gradient(to right,transparent,#000 var(--ml),#000 calc(100% - var(--mr)),transparent),linear-gradient(to bottom,transparent,#000 var(--mt),#000 calc(100% - var(--mb)),transparent);mask-image:linear-gradient(to right,transparent,#000 var(--ml),#000 calc(100% - var(--mr)),transparent),linear-gradient(to bottom,transparent,#000 var(--mt),#000 calc(100% - var(--mb)),transparent);-webkit-mask-composite:source-in;mask-composite:intersect;-webkit-mask-size:var(--kmz,100% 100%);mask-size:var(--kmz,100% 100%);-webkit-mask-position:var(--kmo,0 0);mask-position:var(--kmo,0 0);-webkit-mask-repeat:no-repeat;mask-repeat:no-repeat}
@media (min-width:45.01em){
  html[data-look] .ly[data-melt~="d-l"] .ly-art{--ml:var(--kf)}html[data-look] .ly[data-melt~="d-r"] .ly-art{--mr:var(--kf)}html[data-look] .ly[data-melt~="d-t"] .ly-art{--mt:var(--kfy)}html[data-look] .ly[data-melt~="d-b"] .ly-art{--mb:var(--kfy)}
  html[data-look] .ly[data-melt~="d-all"] .ly-art{-webkit-mask-image:linear-gradient(to right,transparent,#000 var(--ml),#000 calc(100% - var(--mr)),transparent),linear-gradient(to bottom,transparent,#000 var(--mt),#000 calc(100% - var(--mb)),transparent),radial-gradient(ellipse 80% 80% at 50% 50%,#000 64%,transparent 100%);mask-image:linear-gradient(to right,transparent,#000 var(--ml),#000 calc(100% - var(--mr)),transparent),linear-gradient(to bottom,transparent,#000 var(--mt),#000 calc(100% - var(--mb)),transparent),radial-gradient(ellipse 80% 80% at 50% 50%,#000 64%,transparent 100%);}}
@media (max-width:45em){
  html[data-look] .ly[data-melt] .ly-art{--kf:12%;--kfy:11%}
  html[data-look] .ly[data-melt~="m-l"] .ly-art{--ml:var(--kf)}html[data-look] .ly[data-melt~="m-r"] .ly-art{--mr:var(--kf)}html[data-look] .ly[data-melt~="m-t"] .ly-art{--mt:var(--kfy)}html[data-look] .ly[data-melt~="m-b"] .ly-art{--mb:var(--kfy)}
  html[data-look] .ly[data-melt~="m-all"] .ly-art{-webkit-mask-image:linear-gradient(to right,transparent,#000 var(--ml),#000 calc(100% - var(--mr)),transparent),linear-gradient(to bottom,transparent,#000 var(--mt),#000 calc(100% - var(--mb)),transparent),radial-gradient(ellipse 80% 80% at 50% 50%,#000 64%,transparent 100%);mask-image:linear-gradient(to right,transparent,#000 var(--ml),#000 calc(100% - var(--mr)),transparent),linear-gradient(to bottom,transparent,#000 var(--mt),#000 calc(100% - var(--mb)),transparent),radial-gradient(ellipse 80% 80% at 50% 50%,#000 64%,transparent 100%);}}
html[data-look] .sc[data-seam-in="card-expand"] .ly:is([data-role="focal"],[data-role="subject"]) .ly-loop{clip-path:inset(calc((1 - var(--sn,1)) * var(--sit,38%)) calc((1 - var(--sn,1)) * var(--sir,52%)) calc((1 - var(--sn,1)) * var(--sib,16%)) calc((1 - var(--sn,1)) * var(--sil,12%)))}
html[data-look] .cb{background:var(--cbc,var(--bg))!important}
html.cr2[data-look][data-look] .sc .sc-backdrop{background:none!important}html[data-look] .sc-backdrop::before,html[data-look] .sc-backdrop::after{display:none}
html[data-look] .sc[data-bg="deep"]{background:var(--s-surface,var(--bg2))}
${R} .sc .sc-stage,${R} .sc .sc-text{transition:clip-path 1.15s cubic-bezier(.65,0,.2,1)}
${R} .sc:not(.is-in) .sc-stage,${R} .sc:not(.is-in) .sc-text{clip-path:inset(0 0 100% 0)}
${R} .sc.is-in .sc-stage,${R} .sc.is-in .sc-text{clip-path:inset(-60% -60% -60% -60%)}
${R} .sc .sc-text>*,${R} .sc .sc-item,${R} .sc .w{transition-delay:0s!important}
${R} .sc:not(.is-in) :is(.sc-text>*,.sc-item,.w){opacity:1!important;transform:none!important}
${R}[data-enter="camera"] .sc .ly-in{transition:transform 1.4s cubic-bezier(.2,.8,.2,1),opacity .6s ease}
`;
}

// ---------------------------------------------------------------- the chosen typefaces (fonts.js)
// Only the faces the page uses are declared (and so only they are ever loaded: an exported site carries just their files);
// the headline face sets the fit the headings are sized by -- its own measured width, tracking and leading -- above the
// look's and the display family's; the body and the eyebrow/label faces are the page's reading and label type.
function fontsCss(fonts, ty, src) {
  const H = 'html[data-fonts][data-fonts][data-display][data-case]';
  return `\n${TYPEFACES.fontFaceCss(fonts, src)}\n` +
    (ty ? `${H}{--display:${TYPEFACES.stack(fonts.headline)};--dw:${ty.weight};--fit:${LOOK.fitFor(ty)}cqi;--dtrack:${ty.track}em;--dlead:${ty.lead}}\nhtml[data-fonts] .sc-heading,html[data-fonts] .cr-brand{letter-spacing:var(--dtrack)!important;line-height:var(--dlead)!important}\n${ty.case === 'upper' ? 'html[data-fonts] .sc-heading{text-transform:uppercase}\n' : ''}` : '') +
    (fonts.body ? `${H}{--body:${TYPEFACES.stack(fonts.body)}}\n` : '') +
    (fonts.label ? `${H}{--label:${TYPEFACES.stack(fonts.label)}}\nhtml[data-fonts] :is(.sc-kicker,.cr-kicker,.cr-nav a,.sc-cta,.sc-count){font-family:var(--label)}\n` : '');
}

// ---------------------------------------------------------------- CSS
function css(plan, P) {
  const d = plan.type.display;
  return `
:root{--bg:${P.bg};--bg2:${P.bg2};--ink:${P.ink};--muted:${P.muted};--accent:${P.accent};--glow:${P.glow};--accent-rgb:${hexRgb(P.accent)};--glow-rgb:${hexRgb(P.glow)};--ink-rgb:${hexRgb(P.ink)};--bg-rgb:${hexRgb(P.bg)};
--display:${FONT2[d]};--fit:165cqi;--dw:${WEIGHT[d]};--body:system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;--k:1;--nav:58px}
/* how many average characters fit the heading's width: wide faces and capitals need more room (no mid-word breaks) */
html[data-case="upper"]{--fit:125cqi}html[data-display="slab"],html[data-display="grotesk"],html[data-display="rounded"]{--fit:150cqi}html[data-display="slab"][data-case="upper"],html[data-display="grotesk"][data-case="upper"],html[data-display="rounded"][data-case="upper"]{--fit:116cqi}html[data-display="condensed"]{--fit:210cqi}html[data-display="condensed"][data-case="upper"]{--fit:170cqi}
html[data-tempo="slow"]{--k:.6}html[data-tempo="lively"]{--k:1.25}html[data-tempo="still"]{--k:0}
*{box-sizing:border-box}html{scroll-behavior:smooth}html[data-motion="reduced"]{scroll-behavior:auto}
body{margin:0;background:var(--bg);color:var(--ink);font:17px/1.6 var(--body);overflow-x:clip}
main{position:relative;display:block;overflow-x:clip}a{color:inherit}img{max-width:none}
.cr-skip{position:absolute;left:-999px;top:8px;background:var(--ink);color:var(--bg);padding:8px 12px;z-index:50}.cr-skip:focus{left:8px}
.cr-nav{position:fixed;inset:0 0 auto 0;height:var(--nav);display:flex;align-items:center;justify-content:space-between;gap:16px;padding:0 clamp(16px,3vw,40px);z-index:40;background:linear-gradient(rgba(var(--bg-rgb),.7),rgba(var(--bg-rgb),0));color:var(--ink)}
.cr-brand{font-family:var(--display);font-weight:var(--dw);text-decoration:none;font-size:17px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:45vw}
.cr-brand-logo{display:flex;align-items:center;max-width:none;overflow:visible}.cr-logo{display:block;height:34px;width:auto;max-width:min(220px,42vw);object-fit:contain}
@media (max-width:720px){.cr-logo{height:28px;max-width:46vw}}
.cr-links{display:flex;gap:clamp(12px,2vw,26px);list-style:none;margin:0;padding:0;font-size:13px;letter-spacing:.05em}.cr-links a{text-decoration:none;opacity:.8}.cr-links a:hover,.cr-links a:focus{opacity:1;text-decoration:underline}
.cr-menu{display:none;position:relative}.cr-menu summary{cursor:pointer;list-style:none;font-size:14px;padding:8px 12px;border:1px solid rgba(var(--ink-rgb),.35);border-radius:99px}.cr-menu summary::-webkit-details-marker{display:none}
.cr-menu ul{position:absolute;right:0;top:44px;list-style:none;margin:0;padding:10px 0;background:var(--bg);border:1px solid rgba(var(--ink-rgb),.2);border-radius:12px;min-width:180px}.cr-menu li a{display:block;padding:10px 18px;text-decoration:none}
/* scenes */
.sc{position:relative;color:var(--s-ink,var(--ink));background:var(--s-surface,var(--bg))}
.sc[data-bg="deep"]{background:linear-gradient(180deg,var(--bg2),var(--bg))}
.sc[data-bg="tint"]{background:linear-gradient(180deg,rgba(var(--accent-rgb),.10),rgba(var(--accent-rgb),.04))}
/* the air of a scene: far haze in the palette's colours, a vignette, near out-of-focus sparkles (depth) */
.sc-amb{position:absolute;inset:0;z-index:0;pointer-events:none;overflow:hidden}
.amb-haze{position:absolute;width:72vmax;height:72vmax;left:-18vmax;top:-28vmax;border-radius:50%;background:radial-gradient(circle,color-mix(in srgb,var(--s-accent,var(--accent)) 13%,transparent),transparent 66%);animation:k-haze calc(40s / max(var(--k),.4)) ease-in-out infinite alternate}
.amb-haze.amb-b{left:auto;top:auto;right:-22vmax;bottom:-32vmax;background:radial-gradient(circle,color-mix(in srgb,var(--glow) 10%,transparent),transparent 66%);animation-duration:calc(52s / max(var(--k),.4));animation-direction:alternate-reverse}
.amb-vig{position:absolute;inset:0;background:radial-gradient(ellipse 90% 80% at 50% 45%,transparent 58%,color-mix(in srgb,var(--s-surface,var(--bg)) 72%,#000) 100%);opacity:.5}
.amb-near i{position:absolute;border-radius:50%;background:radial-gradient(circle,color-mix(in srgb,var(--glow) 42%,transparent),transparent 70%);filter:blur(3px);opacity:0;animation:k-near var(--t) linear infinite;animation-delay:var(--d)}
html[data-tempo="still"] .amb-near{display:none}
@keyframes k-haze{0%{transform:translate3d(0,0,0) scale(1)}100%{transform:translate3d(6vmax,4vmax,0) scale(1.12)}}
@keyframes k-near{0%{transform:translate3d(0,8vh,0);opacity:0}20%,80%{opacity:.65}100%{transform:translate3d(4vw,-36vh,0);opacity:0}}
/* shapes drawn as light: thin glowing strokes that fade along their length, soft glows, haze and twinkling sparkles */
.shape[data-light]{--fa:color-mix(in srgb,var(--f) 60%,transparent);--fs:color-mix(in srgb,var(--f) 24%,transparent)}
.shape[data-light][data-form="ring"],.shape[data-light][data-form="arc"]{background:none;border:max(1px,.4cqmin) solid var(--fa);box-shadow:0 0 18px var(--fs),inset 0 0 18px var(--fs);-webkit-mask:conic-gradient(from 200deg,transparent 0 6%,#000 36% 64%,transparent 94%);mask:conic-gradient(from 200deg,transparent 0 6%,#000 36% 64%,transparent 94%)}
.shape[data-light][data-form="arc"]{border-bottom-color:transparent;border-left-color:transparent}
.shape[data-light][data-form="line"]{height:1px;top:50%;background:linear-gradient(90deg,transparent,var(--fa) 30%,var(--fa) 70%,transparent);box-shadow:0 0 12px var(--fs)}
@container (orientation: portrait){.shape[data-light][data-form="line"]{width:1px;height:auto;left:50%;background:linear-gradient(180deg,transparent,var(--fa) 30%,var(--fa) 70%,transparent)}}
.shape[data-light][data-form="wave"] path{stroke:var(--fa);stroke-width:1.2}.shape[data-light][data-form="wave"] svg{filter:drop-shadow(0 0 6px var(--f));-webkit-mask:linear-gradient(90deg,transparent,#000 25%,#000 75%,transparent);mask:linear-gradient(90deg,transparent,#000 25%,#000 75%,transparent)}
.shape[data-light][data-form="circle"]{background:radial-gradient(circle,var(--fa) 0,var(--fs) 34%,transparent 70%);filter:blur(2px)}
.shape[data-light][data-form="blob"]{border-radius:50%;background:radial-gradient(ellipse at 40% 45%,var(--fs),transparent 70%),radial-gradient(ellipse at 66% 60%,color-mix(in srgb,var(--glow) 16%,transparent),transparent 66%);filter:blur(22px)}
.shape[data-light][data-form="star"]{width:auto;height:auto;background:radial-gradient(circle,#fff 0 5%,var(--fa) 12%,transparent 58%);clip-path:polygon(50% 0,55% 45%,100% 50%,55% 55%,50% 100%,45% 55%,0 50%,45% 45%);filter:drop-shadow(0 0 8px var(--f));animation:k-sparkle calc(4.5s / max(var(--k),.4)) ease-in-out infinite}
.shape[data-light][data-form="triangle"],.shape[data-light][data-form="diamond"],.shape[data-light][data-form="cross"]{background:linear-gradient(160deg,var(--fa),var(--fs) 55%,transparent);opacity:.75}
.shape[data-light][data-form="dots"]{background:radial-gradient(circle,var(--fa) 0 1.2px,transparent 1.7px) 0 0/34px 34px;-webkit-mask:radial-gradient(ellipse,#000 18%,transparent 72%);mask:radial-gradient(ellipse,#000 18%,transparent 72%)}
.shape[data-light][data-form="sunburst"]{background:repeating-conic-gradient(var(--fs) 0 3deg,transparent 3deg 14deg);filter:blur(1.5px)}
.shape[data-light][data-form="stripes"]{background:repeating-linear-gradient(115deg,var(--fs) 0 2px,transparent 2px 38px);-webkit-mask:linear-gradient(90deg,transparent,#000 30%,#000 70%,transparent);mask:linear-gradient(90deg,transparent,#000 30%,#000 70%,transparent)}
.shape[data-light][data-stroke]:not([data-form="ring"]):not([data-form="arc"]):not([data-form="wave"]):not([data-form="line"]){background:none;box-shadow:inset 0 0 0 1px var(--fa),0 0 16px var(--fs)}
/* depth: decoration far back is softer and dimmer */
.ly[data-role="backdrop"] .shape[data-light]:not([data-form="blob"]),.ly[data-role="texture"] .shape[data-light]:not([data-form="blob"]){filter:blur(2.5px);opacity:.6}
@keyframes k-sparkle{0%,100%{opacity:.55;transform:scale(.86) rotate(0)}50%{opacity:1;transform:scale(1.04) rotate(12deg)}}
/* a scene in its picture's tone; arriving from the previous scene's colour; a picture whose frame dissolves */
.sc[data-tone]{background:var(--s-surface)}
.sc[data-flow] .sc-pin::before{content:"";position:absolute;inset:0 0 auto 0;height:22vh;background:linear-gradient(var(--prev),transparent);z-index:1;pointer-events:none}
.ly[data-edge="fade"] .ly-art{-webkit-mask-image:linear-gradient(to right,transparent,#000 14%,#000 86%,transparent),linear-gradient(to bottom,transparent,#000 12%,#000 88%,transparent);-webkit-mask-composite:source-in;mask-image:linear-gradient(to right,transparent,#000 14%,#000 86%,transparent),linear-gradient(to bottom,transparent,#000 12%,#000 88%,transparent);mask-composite:intersect}
.sc-pin{position:relative;min-height:calc(var(--sh,0)*1vh);display:grid;grid-template-columns:5% 1fr 1fr 5%;grid-template-rows:auto;align-items:center;padding:calc(var(--nav) + 4vh) 0 6vh;overflow:clip;isolation:isolate}
.sc[data-height="screen"],.sc[data-height="tall"]{--sh:100}.sc[data-height="short"]{--sh:64}.sc[data-height="auto"]{--sh:0}
.sc[data-height="auto"] .sc-pin{padding:clamp(80px,12vh,150px) 0}
.sc[data-pin]{height:230vh}.sc[data-pin] .sc-pin{position:sticky;top:0;height:100vh;min-height:0}
.sc-world{position:absolute;inset:0;z-index:0;overflow:hidden}.sc-backdrop{position:absolute;inset:-6%}.sc-light{position:absolute;inset:0;pointer-events:none}
.sc-stage{position:absolute;inset:0;z-index:3;will-change:transform;transform-origin:60% 55%}
.sc-text{position:relative;z-index:6;grid-row:1;width:100%;max-width:100%;container-type:inline-size}
.sc-text[data-region="left"],.sc-text[data-region="top-left"],.sc-text[data-region="bottom-left"]{grid-column:2}
.sc-text[data-region="right"],.sc-text[data-region="top-right"],.sc-text[data-region="bottom-right"]{grid-column:3}
/* centred blocks keep a definite width (they are size containers for their heading), centred by margins */
.sc-text[data-region="center"],.sc-text[data-region="top"],.sc-text[data-region="bottom"]{grid-column:2 / 4;text-align:center;margin-inline:auto}
.sc-text[data-region^="top"]{align-self:start}.sc-text[data-region^="bottom"]{align-self:end}
.sc-text[data-width="narrow"]{max-width:34ch}.sc-text[data-width="medium"]{max-width:52ch}.sc-text[data-width="wide"]{max-width:70ch}
.sc-text[data-region="center"][data-width="wide"],.sc-text[data-region="top"][data-width="wide"],.sc-text[data-region="bottom"][data-width="wide"]{max-width:min(64ch,86vw)}
.sc-text.has-scrim{padding:22px 26px;border-radius:14px;background:rgba(var(--bg-rgb),.72);background:color-mix(in srgb,var(--s-surface,var(--bg)) 80%,transparent);backdrop-filter:blur(6px)}
.sc-kicker{margin:0 0 14px;text-transform:uppercase;letter-spacing:.22em;font-size:12.5px;font-weight:700;color:var(--s-accent,var(--accent))}
.sc[data-bg="accent"] .sc-kicker,.sc[data-bg="invert"] .sc-kicker{color:var(--s-ink)}
.sc-heading{margin:0;font-family:var(--display);font-weight:var(--dw);line-height:1;letter-spacing:-.015em;text-wrap:balance;overflow-wrap:normal;hyphens:manual}
html[data-case="upper"] .sc-heading{text-transform:uppercase;letter-spacing:.01em}
.sc-text[data-size="display"] .sc-heading{font-size:min(clamp(2.8rem,7.2vw,7.4rem),calc(var(--fit) / var(--lw)));line-height:.94}
html[data-scale="monumental"] .sc-text[data-size="display"] .sc-heading{font-size:min(clamp(3.2rem,9vw,9.5rem),calc(var(--fit) / var(--lw)))}
html[data-scale="quiet"] .sc-text[data-size="display"] .sc-heading{font-size:min(clamp(2.4rem,5vw,5rem),calc(var(--fit) / var(--lw)))}
.sc-text[data-size="large"] .sc-heading{font-size:min(clamp(2rem,4.4vw,4rem),calc(var(--fit) / var(--lw)))}
/* a long title steps down rather than stacking into a tower of huge lines */
html .sc-text[data-size="display"] .sc-heading[data-len="l"]{font-size:min(clamp(2.4rem,4.9vw,5.2rem),calc(var(--fit) / var(--lw)))}
html .sc-text[data-size="display"] .sc-heading[data-len="xl"],html .sc-text[data-size="large"] .sc-heading[data-len="xl"]{font-size:min(clamp(2rem,3.6vw,3.8rem),calc(var(--fit) / var(--lw)))}
.sc-text[data-size="medium"] .sc-heading{font-size:min(clamp(1.6rem,3vw,2.7rem),calc(var(--fit) / var(--lw)))}
.sc-text[data-size="small"] .sc-heading{font-size:clamp(1.3rem,2vw,1.8rem)}
.sc-body{margin:20px 0 0;font-size:clamp(16px,1.25vw,19px);color:var(--s-muted,var(--muted))}
.sc-text[data-region="center"] .sc-body,.sc-text[data-region="top"] .sc-body,.sc-text[data-region="bottom"] .sc-body{margin-left:auto;margin-right:auto}
.sc-cta{display:inline-flex;align-items:center;gap:10px;margin-top:26px;padding:12px 20px;border-radius:99px;background:var(--accent);color:var(--bg);text-decoration:none;font-weight:700;font-size:15px}
.sc-cta:focus-visible,.cr-links a:focus-visible{outline:3px solid var(--glow);outline-offset:3px}
.sc-list{list-style:none;padding:0;margin:24px 0 0;display:grid;gap:14px;text-align:left}
.sc-item{position:relative;font-size:clamp(15px,1.15vw,18px)}
.sc-label{display:block;font-family:var(--display);font-weight:var(--dw);color:var(--accent);font-size:1.5em;line-height:1.1}
.sc[data-bg="accent"] .sc-label,.sc[data-bg="invert"] .sc-label{color:var(--s-ink)}
.sc-list[data-list="numbered"]{counter-reset:n}.sc-list[data-list="numbered"] .sc-item{counter-increment:n;padding-left:58px}.sc-list[data-list="numbered"] .sc-item::before{content:counter(n,decimal-leading-zero);position:absolute;left:0;top:-4px;font-family:var(--display);font-weight:var(--dw);font-size:28px;color:var(--accent)}
.sc-list[data-list="timeline"]{border-left:2px solid rgba(var(--accent-rgb),.55);padding-left:24px;gap:22px}.sc-list[data-list="timeline"] .sc-item::before{content:"";position:absolute;left:-32px;top:7px;width:13px;height:13px;border-radius:50%;background:var(--accent);box-shadow:0 0 0 5px rgba(var(--accent-rgb),.2)}
.sc-list[data-list="notes"]{grid-template-columns:repeat(auto-fit,minmax(min(100%,220px),1fr))}.sc-list[data-list="notes"] .sc-item{background:rgba(var(--glow-rgb),.12);border:1px solid rgba(var(--glow-rgb),.3);padding:18px;border-radius:14px 14px 14px 2px;font-family:var(--display)}
.sc-list[data-list="labelled"] .sc-item{border-top:1px solid rgba(var(--ink-rgb),.18);padding-top:12px}
.cr-cite{font-size:.62em;vertical-align:super;margin-left:3px;text-decoration:none;color:var(--accent)}
.cr-herocredit{position:absolute;right:14px;bottom:8px;margin:0;font-size:11px;opacity:.6;z-index:6;max-width:50%;text-align:right}
/* layers */
.ly{position:absolute;left:calc(var(--x)*1%);top:calc(var(--y)*1%);width:calc(var(--w)*1%);height:calc(var(--h)*1%);z-index:var(--z);opacity:var(--op)}
.ly-scroll,.ly-in,.ly-loop,.ly-art{position:absolute;inset:0}
.ly-scroll{will-change:transform}.ly-scroll[data-anchor="left"]{transform-origin:0 50%}.ly-scroll[data-anchor="right"]{transform-origin:100% 50%}
.ly-art{transform:rotate(var(--rot));container-type:size}
.ly-img{position:absolute;inset:0;width:100%;height:100%;display:block}
.ly-vid{position:absolute;inset:0;width:100%;height:100%;display:block;object-fit:var(--of,cover);object-position:var(--oq,50% 50%)}html[data-motion="reduced"] .ly-vid{display:none}@media (prefers-reduced-motion:reduce){.ly-vid{display:none}}
.ly[data-kind="image"] .ly-art[data-mask="none"] .ly-img{object-position:50% 100%}
.ly-art[data-mask="circle"]{clip-path:circle(closest-side at 50% 50%)}
.ly-art[data-mask="diamond"]{clip-path:polygon(50% 0,100% 50%,50% 100%,0 50%)}
.ly-art[data-mask="arch"]{border-radius:999px 999px 16px 16px;overflow:hidden}
.ly-art[data-mask="window"]{border-radius:18px;overflow:hidden;box-shadow:0 28px 60px rgba(0,0,0,.35)}
.ly-art[data-mask="frame"]{border:clamp(7px,1vw,14px) solid #2b2016;outline:2px solid rgba(var(--accent-rgb),.8);outline-offset:-6px;overflow:hidden;box-shadow:0 28px 60px rgba(0,0,0,.45);background:#111}
.ly-art[data-mask="porthole"]{border-radius:50%;overflow:hidden;border:clamp(9px,1.3vw,18px) solid #b8893d;box-shadow:inset 0 0 40px rgba(0,0,0,.45),0 0 0 4px #6d4b1c,0 28px 60px rgba(0,0,0,.4)}
.ly-art[data-mask="torn"]{clip-path:polygon(0 3%,8% 0,17% 4%,26% 1%,35% 5%,46% 1%,57% 4%,68% 0,79% 5%,90% 1%,100% 4%,98% 16%,100% 30%,97% 45%,100% 60%,97% 75%,100% 90%,96% 100%,85% 96%,74% 100%,62% 97%,50% 100%,38% 96%,27% 100%,15% 97%,4% 100%,0 88%,3% 74%,0 60%,3% 45%,0 30%,2% 15%)}
.ly-art[data-mask="blob"]{border-radius:42% 58% 63% 37% / 41% 44% 56% 59%;overflow:hidden}
.ly-art[data-mask="polaroid"]{background:#f4efe6;padding:4% 4% 14%;box-shadow:0 22px 50px rgba(0,0,0,.35)}.ly-art[data-mask="polaroid"] .ly-img{position:relative;height:100%}
.ly-art[data-mask="slit"]{clip-path:inset(0 30% 0 30% round 999px)}
.ly-art[data-treatment="shadow"] .ly-img,.ly-art[data-treatment="shadow"] .shape{filter:drop-shadow(0 22px 26px rgba(0,0,0,.4))}
.ly-art[data-treatment="glow"] .ly-img,.ly-art[data-treatment="glow"] .shape{filter:drop-shadow(0 0 1.2px rgba(var(--glow-rgb),.75)) drop-shadow(0 0 26px rgba(var(--glow-rgb),.5))}
.ly-art[data-treatment="mono"] .ly-img{filter:grayscale(1) contrast(1.08)}
.ly-art[data-treatment="duotone"] .ly-img{filter:grayscale(1) contrast(1.15)}.ly-art[data-treatment="duotone"]::after{content:"";position:absolute;inset:0;background:var(--accent);mix-blend-mode:color;pointer-events:none}
.ly-art[data-treatment="outline"] .ly-img{filter:drop-shadow(0 0 0 var(--ink)) drop-shadow(1px 0 0 var(--ink)) drop-shadow(-1px 0 0 var(--ink)) drop-shadow(0 1px 0 var(--ink)) drop-shadow(0 -1px 0 var(--ink))}
.ly-art[data-treatment="soft"] .ly-img{filter:blur(1.5px) saturate(.9)}
.ly-art[data-treatment="grain"]::after,.sc-grain{content:"";position:absolute;inset:0;pointer-events:none;background:repeating-radial-gradient(circle at 17% 32%,rgba(255,255,255,.035) 0 1px,transparent 1px 3px),repeating-radial-gradient(circle at 71% 64%,rgba(0,0,0,.05) 0 1px,transparent 1px 4px);mix-blend-mode:overlay}
.cr-missing{display:none}[data-img].is-missing .ly-img{visibility:hidden}
[data-img].is-missing .cr-missing{display:flex;position:absolute;inset:0;align-items:center;justify-content:center;background:radial-gradient(circle at 50% 45%,rgba(var(--accent-rgb),.32),rgba(var(--accent-rgb),.06) 60%,transparent 72%);font-family:var(--display);font-weight:var(--dw);color:var(--ink);font-size:clamp(24px,6vw,96px)}
/* drawn shapes */
.shape{position:absolute;inset:0;--f:var(--accent)}
.shape[data-fill="glow"]{--f:var(--glow)}.shape[data-fill="ink"]{--f:var(--ink)}.shape[data-fill="muted"]{--f:var(--muted)}.shape[data-fill="bg2"]{--f:var(--bg2)}
.shape[data-form="circle"]{border-radius:50%;background:var(--f)}
.shape[data-form="circle"],.shape[data-form="sunburst"]{width:100cqmin;height:100cqmin;margin:auto}
.shape[data-form="ring"]{border-radius:50%;border:max(3px,6cqmin) solid var(--f)}
.shape[data-form="triangle"]{background:var(--f);clip-path:polygon(50% 0,100% 100%,0 100%)}
.shape[data-form="diamond"]{background:var(--f);clip-path:polygon(50% 0,100% 50%,50% 100%,0 50%)}
.shape[data-form="star"]{background:var(--f);clip-path:polygon(50% 0,61% 35%,98% 35%,68% 57%,79% 91%,50% 70%,21% 91%,32% 57%,2% 35%,39% 35%)}
.shape[data-form="cross"]{background:var(--f);clip-path:polygon(38% 0,62% 0,62% 38%,100% 38%,100% 62%,62% 62%,62% 100%,38% 100%,38% 62%,0 62%,0 38%,38% 38%)}
.shape[data-form="blob"]{background:var(--f);border-radius:42% 58% 63% 37% / 41% 44% 56% 59%}
.shape[data-form="arc"]{border-radius:50%;border:max(3px,4cqmin) solid var(--f);border-bottom-color:transparent;border-left-color:transparent}
.shape[data-form="line"]{top:calc(50% - 1.5px);bottom:auto;height:3px;background:var(--f)}
@container (orientation: portrait){.shape[data-form="line"]{top:0;bottom:0;height:auto;left:calc(50% - 1.5px);right:auto;width:3px}}
.shape[data-form="dots"]{background:radial-gradient(circle,var(--f) 22%,transparent 24%) 0 0/28px 28px}
.shape[data-form="sunburst"]{border-radius:50%;background:repeating-conic-gradient(var(--f) 0 6deg,transparent 6deg 15deg);mask:radial-gradient(circle,#000 30%,transparent 70%);-webkit-mask:radial-gradient(circle,#000 30%,transparent 70%)}
.shape[data-form="stripes"]{background:repeating-linear-gradient(115deg,var(--f) 0 10px,transparent 10px 26px)}
.shape[data-form="wave"] svg{width:100%;height:100%}.shape[data-form="wave"] path{fill:none;stroke:var(--f);stroke-width:3}
.shape[data-stroke]:not([data-form="ring"]):not([data-form="arc"]):not([data-form="wave"]):not([data-form="line"]){background:transparent;box-shadow:inset 0 0 0 3px var(--f)}
/* giant words */
.ly-word{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-family:var(--display);font-weight:var(--dw);line-height:.85;white-space:nowrap;font-size:min(92cqh,calc(165cqw / var(--len)));color:var(--accent)}
.ly-word[data-style="outline"]{color:transparent;-webkit-text-stroke:max(1px,.6cqmin) var(--accent)}
.ly-word[data-style="ghost"]{color:var(--ink);opacity:.08}
/* atmosphere */
html[data-backdrop="gradient"] .sc-backdrop{background:radial-gradient(ellipse at 70% 30%,var(--bg2),var(--bg) 70%)}
html[data-backdrop="spotlight"] .sc-backdrop{background:radial-gradient(ellipse 55% 75% at 68% -5%,rgba(var(--glow-rgb),.5),rgba(var(--glow-rgb),0) 60%),radial-gradient(ellipse 80% 40% at 68% 100%,var(--bg2),var(--bg) 70%)}
html[data-backdrop="fog"] .sc-backdrop{background:radial-gradient(ellipse 40% 50% at 78% 18%,rgba(var(--glow-rgb),.3),transparent 65%),linear-gradient(180deg,var(--bg2),var(--bg) 75%)}
html[data-backdrop="water"] .sc-backdrop{background:linear-gradient(180deg,var(--bg2) 0,var(--bg) 75%)}
html[data-backdrop="water"] .sc-backdrop::before{content:"";position:absolute;inset:-20% 0 0 0;background:repeating-linear-gradient(100deg,rgba(255,255,255,.09) 0 3%,transparent 3% 9%);-webkit-mask-image:linear-gradient(180deg,#000,transparent 70%);mask-image:linear-gradient(180deg,#000,transparent 70%);animation:k-rays calc(14s / max(var(--k),.1)) ease-in-out infinite alternate}
html[data-backdrop="stars"] .sc-backdrop{background:radial-gradient(circle at 100% 110%,rgba(var(--accent-rgb),.45),transparent 38%),radial-gradient(ellipse at 30% 20%,var(--bg2),var(--bg) 70%)}
html[data-backdrop="sky"] .sc-backdrop{background:linear-gradient(180deg,var(--bg2),var(--bg))}
html[data-backdrop="paper"] .sc-backdrop{background:repeating-linear-gradient(0deg,rgba(0,0,0,.02) 0 2px,transparent 2px 5px),radial-gradient(ellipse at 60% 40%,var(--bg),var(--bg2))}
html[data-backdrop="grain"] .sc-backdrop{background:var(--bg)}html[data-backdrop="grain"] .sc-backdrop::after{content:"";position:absolute;inset:0;background:repeating-radial-gradient(circle at 30% 40%,rgba(var(--ink-rgb),.05) 0 1px,transparent 1px 3px)}
html[data-backdrop="horizon"] .sc-backdrop{background:linear-gradient(180deg,var(--bg) 0,var(--bg) 62%,var(--bg2) 62.3%,var(--bg) 100%)}
html[data-backdrop="vignette"] .sc-backdrop{background:radial-gradient(ellipse at 50% 45%,var(--bg2),var(--bg) 68%)}
html[data-backdrop="sunrise"] .sc-backdrop{background:radial-gradient(circle at 70% 105%,rgba(var(--glow-rgb),.9),rgba(var(--accent-rgb),.45) 22%,transparent 52%),linear-gradient(180deg,var(--bg),var(--bg2))}
html[data-backdrop="grid"] .sc-backdrop{background:linear-gradient(rgba(var(--ink-rgb),.06) 1px,transparent 1px) 0 0/56px 56px,linear-gradient(90deg,rgba(var(--ink-rgb),.06) 1px,transparent 1px) 0 0/56px 56px,var(--bg)}
.sc-light[data-light="spot"]{background:conic-gradient(from 180deg at 66% -10%,transparent 0 160deg,rgba(var(--glow-rgb),.13) 170deg,rgba(var(--glow-rgb),.2) 180deg,rgba(var(--glow-rgb),.13) 190deg,transparent 200deg);animation:k-breath calc(9s / max(var(--k),.1)) ease-in-out infinite}
.sc-light[data-light="lamp"]{background:radial-gradient(circle at 80% 16%,rgba(var(--glow-rgb),.35),transparent 35%)}
.sc-light[data-light="caustics"]{background:radial-gradient(ellipse 30% 12% at 30% 20%,rgba(255,255,255,.12),transparent 70%),radial-gradient(ellipse 25% 10% at 70% 35%,rgba(255,255,255,.1),transparent 70%);animation:k-caustic calc(11s / max(var(--k),.1)) ease-in-out infinite alternate}
.sc-light[data-light="rim"]{background:radial-gradient(circle at 75% 45%,rgba(var(--glow-rgb),.16),transparent 45%)}
.sc-light[data-light="sun"]{background:radial-gradient(circle at 85% 10%,rgba(255,255,255,.85),rgba(255,248,220,.3) 12%,transparent 40%)}
.pt{position:absolute;inset:0}.pt i{position:absolute;left:calc(var(--px)*1%);top:calc(var(--py)*1%);width:calc(var(--ps)*1vw);height:calc(var(--ps)*1vw);border-radius:50%;animation:k-dust var(--pt) linear infinite;animation-delay:var(--pd)}
.pt[data-kind="dust"] i,.pt[data-kind="sparks"] i{background:rgba(var(--glow-rgb),.75);box-shadow:0 0 6px rgba(var(--glow-rgb),.6)}
.pt[data-kind="sparks"] i{animation-name:k-rise}
.pt[data-kind="bubbles"] i{border:1.5px solid rgba(255,255,255,.55);background:radial-gradient(circle at 30% 30%,rgba(255,255,255,.5),rgba(255,255,255,.04) 60%);animation-name:k-rise}
.pt[data-kind="fog"] i{background:radial-gradient(closest-side,rgba(200,210,220,.13),transparent);animation-name:k-fog;border-radius:40%}
.pt[data-kind="clouds"] i{height:calc(var(--ps)*.4vw);background:radial-gradient(closest-side,rgba(255,255,255,.85),rgba(255,255,255,0));animation-name:k-cloud}
.pt[data-kind="steam"] i{height:calc(var(--ps)*2.4vw);background:radial-gradient(closest-side,rgba(255,255,255,.14),transparent);animation-name:k-steam}
.pt[data-kind="petals"] i,.pt[data-kind="confetti"] i{border-radius:60% 0 60% 0;background:var(--accent);opacity:.8;animation-name:k-fall}
.pt[data-kind="confetti"] i{border-radius:2px;height:calc(var(--ps)*.45vw)}
.pt[data-kind="snow"] i{background:rgba(255,255,255,.85);animation-name:k-fall}
.pt-stars{position:absolute;left:0;top:0;width:1px;height:1px;border-radius:50%;animation:k-twinkle 5s ease-in-out infinite alternate}
@keyframes k-dust{0%{transform:translate3d(0,0,0);opacity:0}20%{opacity:.8}100%{transform:translate3d(3vw,-18vh,0);opacity:0}}
@keyframes k-rise{0%{transform:translate3d(0,30vh,0);opacity:0}15%{opacity:.9}100%{transform:translate3d(1.5vw,-60vh,0);opacity:0}}
@keyframes k-fall{0%{transform:translate3d(0,-20vh,0) rotate(var(--pr));opacity:0}15%{opacity:.85}100%{transform:translate3d(-4vw,70vh,0) rotate(calc(var(--pr) + 300deg));opacity:0}}
@keyframes k-fog{0%,100%{transform:translate3d(-10vw,0,0)}50%{transform:translate3d(8vw,-2vh,0)}}
@keyframes k-cloud{0%{transform:translate3d(-30vw,0,0);opacity:0}12%,88%{opacity:1}100%{transform:translate3d(30vw,0,0);opacity:0}}
@keyframes k-steam{0%{transform:translate3d(0,10vh,0) scale(.6);opacity:0}30%{opacity:1}100%{transform:translate3d(2vw,-30vh,0) scale(1.4);opacity:0}}
@keyframes k-twinkle{0%{opacity:.35}100%{opacity:1}}
@keyframes k-rays{0%{transform:translateX(-2%) skewX(-2deg)}100%{transform:translateX(2%) skewX(2deg)}}
@keyframes k-breath{0%,100%{opacity:.75}50%{opacity:1}}
@keyframes k-caustic{0%{transform:translate3d(-2%,0,0)}100%{transform:translate3d(3%,2%,0) scale(1.08)}}
/* entrances (only with scripting) */
.cr-js .ly-in{transition:transform var(--dur) cubic-bezier(.2,.9,.25,1) var(--delay),opacity calc(var(--dur)*.7) ease var(--delay),clip-path var(--dur) cubic-bezier(.6,0,.2,1) var(--delay)}
.cr-js .sc:not(.is-in) [data-entrance="rise"].ly-in{transform:translate3d(0,14%,0);opacity:0}
.cr-js .sc:not(.is-in) [data-entrance="descend"].ly-in{transform:translate3d(0,-45%,0) rotate(-4deg);opacity:0}
.cr-js .sc:not(.is-in) [data-entrance="drop"].ly-in{transform:translate3d(0,-110%,0);opacity:0}
.cr-js [data-entrance="drop"].ly-in,.cr-js [data-entrance="descend"].ly-in,.cr-js [data-entrance="pop"].ly-in{transition-timing-function:cubic-bezier(.3,1.35,.45,1),ease,ease}
.cr-js .sc:not(.is-in) [data-entrance="pop"].ly-in{transform:scale(.55);opacity:0}
.cr-js .sc:not(.is-in) [data-entrance="fade"].ly-in{opacity:0}
.cr-js .sc:not(.is-in) [data-entrance="unveil"].ly-in{clip-path:inset(100% 0 0 0)}
.cr-js [data-entrance="unveil"].ly-in{clip-path:inset(0 0 0 0)}
.cr-js .sc:not(.is-in) [data-entrance="dolly"].ly-in{transform:scale(1.08);opacity:0}
.cr-js .sc:not(.is-in) [data-entrance="slide-left"].ly-in{transform:translate3d(18%,0,0);opacity:0}
.cr-js .sc:not(.is-in) [data-entrance="slide-right"].ly-in{transform:translate3d(-18%,0,0);opacity:0}
.cr-js .sc:not(.is-in) [data-entrance="spin-in"].ly-in{transform:rotate(-90deg) scale(.5);opacity:0}
.cr-js .sc-text>*{transition:transform .9s cubic-bezier(.2,.9,.25,1),opacity .8s ease}
.cr-js .sc:not(.is-in) .sc-text[data-entrance="rise"]>*{opacity:0;transform:translate3d(0,24px,0)}
.cr-js .sc:not(.is-in) .sc-text[data-entrance="fade"]>*{opacity:0}
.cr-js .sc-text>*:nth-child(2){transition-delay:.1s}.cr-js .sc-text>*:nth-child(3){transition-delay:.2s}.cr-js .sc-text>*:nth-child(4){transition-delay:.3s}.cr-js .sc-text>*:nth-child(5){transition-delay:.4s}
.cr-js .sc-text[data-entrance="split-words"] .w{display:inline-block;transition:opacity .6s ease calc(var(--i)*.06s),transform .7s cubic-bezier(.2,.9,.25,1) calc(var(--i)*.06s)}
.cr-js .sc:not(.is-in) .sc-text[data-entrance="split-words"] .w{opacity:0;transform:translate3d(0,.4em,0)}
.cr-js .sc-item{transition:opacity .6s ease calc(.3s + var(--i)*.09s),transform .7s cubic-bezier(.2,.9,.25,1) calc(.3s + var(--i)*.09s)}
.cr-js .sc:not(.is-in) .sc-item{opacity:0;transform:translate3d(0,18px,0)}
/* ambient loops, after the entrance */
.sc.is-in .ly-loop{animation:var(--ln,none) calc(var(--period) / max(var(--k),.1)) ease-in-out calc(var(--delay) + var(--dur)) infinite}
[data-loop="float"]{--ln:k-float}[data-loop="sway"]{--ln:k-sway}[data-loop="swim"]{--ln:k-swim}[data-loop="breathe"]{--ln:k-breathe}[data-loop="drift"]{--ln:k-drift}[data-loop="spin"]{--ln:k-spin}[data-loop="pulse"]{--ln:k-pulse}[data-loop="orbit"]{--ln:k-orbit}[data-loop="bob"]{--ln:k-bob}
.sc.is-in .ly-loop[data-loop="spin"]{animation-timing-function:linear}
/* kenburns: the picture itself drifts and zooms slowly INSIDE its frame (the frame stays put) -- life for photos and paintings */
.sc.is-in .ly-loop[data-loop="kenburns"]{animation:none}
.sc.is-in [data-loop="kenburns"] .ly-img{animation:k-kenburns calc(var(--period) * 2 / max(var(--k),.1)) ease-in-out calc(var(--delay) + var(--dur)) infinite alternate;transform-origin:var(--kb-o,40% 45%)}
/* (the slow zoom never creeps past its ceiling: 6%, or a deliberate detail's 35% -- framing.js ZOOM) */
@keyframes k-kenburns{0%{transform:scale(1.02) translate3d(0,0,0)}100%{transform:scale(min(var(--kbmax,1.06),calc(1.02 + var(--amp) * .05))) translate3d(calc(min(var(--amp),1) * -1.6%),calc(min(var(--amp),1) * -1%),0)}}
.ly[data-frame="detail"]{--kbmax:1.35}
/* sheen: light passes across the picture -- a band over a framed picture, a gentle brightening on a cut-out; allowed on still pages */
.sc.is-in .ly-loop[data-loop="sheen"]{animation:none}
[data-loop="sheen"] .ly-art:not([data-mask="none"])::before{content:"";position:absolute;inset:-10% -60%;z-index:2;pointer-events:none;background:linear-gradient(105deg,transparent 42%,rgba(255,250,235,.22) 50%,transparent 58%);transform:translate3d(-60%,0,0);mix-blend-mode:screen}
.sc.is-in [data-loop="sheen"] .ly-art:not([data-mask="none"])::before{animation:k-sheen calc(var(--period) * 1.6) ease-in-out calc(var(--delay) + var(--dur) + .6s) infinite}
.sc.is-in [data-loop="sheen"] .ly-art[data-mask="none"]{animation:k-glint calc(var(--period) * 1.6) ease-in-out calc(var(--delay) + var(--dur)) infinite}
@keyframes k-sheen{0%{transform:translate3d(-60%,0,0)}45%,100%{transform:translate3d(60%,0,0)}}
@keyframes k-glint{0%,100%{filter:brightness(1)}40%{filter:brightness(calc(1 + var(--amp) * .12))}}
@keyframes k-float{0%,100%{transform:translate3d(0,0,0)}50%{transform:translate3d(0,calc(var(--amp)*var(--k)*-1.4%),0)}}
@keyframes k-sway{0%,100%{transform:rotate(calc(var(--amp)*var(--k)*-1.4deg))}50%{transform:rotate(calc(var(--amp)*var(--k)*1.4deg))}}
@keyframes k-swim{0%,100%{transform:translate3d(0,0,0) rotate(0)}25%{transform:translate3d(calc(var(--amp)*var(--k)*1.6%),calc(var(--amp)*var(--k)*-1%),0) rotate(calc(var(--amp)*var(--k)*1deg))}75%{transform:translate3d(calc(var(--amp)*var(--k)*-1.6%),calc(var(--amp)*var(--k)*.6%),0) rotate(calc(var(--amp)*var(--k)*-1deg))}}
@keyframes k-breathe{0%,100%{transform:scale(1)}50%{transform:scale(calc(1 + var(--amp)*var(--k)*.015))}}
@keyframes k-drift{0%,100%{transform:translate3d(calc(var(--amp)*var(--k)*-1%),0,0)}50%{transform:translate3d(calc(var(--amp)*var(--k)*1%),calc(var(--amp)*var(--k)*-.6%),0)}}
@keyframes k-spin{to{transform:rotate(360deg)}}
@keyframes k-pulse{0%,100%{opacity:1}50%{opacity:calc(1 - var(--amp)*.2)}}
@keyframes k-orbit{0%{transform:rotate(0) translate3d(calc(var(--amp)*var(--k)*2%),0,0) rotate(0)}100%{transform:rotate(360deg) translate3d(calc(var(--amp)*var(--k)*2%),0,0) rotate(-360deg)}}
@keyframes k-bob{0%,100%{transform:translate3d(0,0,0) rotate(0)}30%{transform:translate3d(0,calc(var(--amp)*var(--k)*-2%),0) rotate(calc(var(--amp)*var(--k)*-2deg))}60%{transform:translate3d(0,calc(var(--amp)*var(--k)*.6%),0) rotate(calc(var(--amp)*var(--k)*1.5deg))}}
/* thread */
.cr-connector{position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none;z-index:4;overflow:visible}
.cr-connector .cr-dot{transition:opacity .5s ease,transform .6s cubic-bezier(.3,1.4,.5,1);transform-box:fill-box;transform-origin:center}.cr-connector .cr-dot:not(.on){opacity:0;transform:scale(.3)}
/* sources */
.cr-foot{scroll-margin-top:calc(var(--nav) + 12px);padding:48px clamp(20px,7vw,150px) 36px;font-size:13px;color:var(--muted);border-top:1px solid rgba(var(--ink-rgb),.12)}
.cr-sources summary{cursor:pointer;color:var(--ink);font-weight:600;font-size:14px}
.cr-sources h3{font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:var(--ink);margin:22px 0 8px}
.cr-factlist,.cr-credits{padding-left:20px}.cr-factlist li,.cr-credits li{margin:0 0 6px;overflow-wrap:anywhere}
.cr-footnote,.cr-made{margin:16px 0 0;max-width:70ch}
.cr-fixture{position:fixed;left:10px;bottom:10px;z-index:60;margin:0;max-width:min(340px,calc(100vw - 20px));padding:6px 10px;border-radius:6px;background:#ffe14d;color:#111;font:600 12px/1.35 var(--body);box-shadow:0 4px 14px rgba(0,0,0,.3)}
/* phones: words and stage stacked; the stage keeps each scene's composition in its own boxes */
@media (max-width:720px){
  body{font-size:16px}.cr-links{display:none}.cr-menu{display:block}
  .sc-pin{display:flex;flex-direction:column;align-items:stretch;padding:calc(var(--nav) + 12px) 0 40px;min-height:0}
  .sc[data-height="auto"] .sc-pin{padding:64px 0}
  .sc-text{order:1;padding:0 20px 0 26px;text-align:left!important;justify-self:auto;max-width:none!important}
  .sc-text.has-scrim{margin:0 14px;padding:16px}
  /* (on a phone a scene reads words first, its pictures under them -- each scene one group, never pictures between two
     scenes' words; the opening keeps the order it was made with) */
  .sc[data-hero][data-morder="stage-first"] .sc-text{order:3}
  .sc-stage{order:2;position:relative;inset:auto;flex:0 0 auto;height:min(112vw,64svh);margin:16px 0}
  .sc[data-height="short"] .sc-stage{height:min(80vw,46svh)}.sc[data-height="auto"] .sc-stage{height:min(96vw,56svh)}
  .sc[data-pin]{height:180vh}.sc[data-pin] .sc-pin{height:100svh;justify-content:center}.sc[data-pin] .sc-stage{height:min(100vw,52svh)}
  .ly{left:calc(var(--mx)*1%);top:calc(var(--my)*1%);width:calc(var(--mw)*1%);height:calc(var(--mh)*1%)}
  .ly[data-hide-m]{display:none}
  .sc-text[data-size="display"] .sc-heading{font-size:min(14vw,calc(var(--fit) / var(--lw)))}
  .sc-text[data-size="large"] .sc-heading{font-size:min(10vw,calc(var(--fit) / var(--lw)))}
  html .sc-text[data-size] .sc-heading[data-len="s"]{font-size:min(14vw,calc(var(--fit) / var(--lw)))}
  html .sc-text[data-size] .sc-heading[data-len="l"]{font-size:min(10.5vw,calc(var(--fit) / var(--lw)))}
  html .sc-text[data-size] .sc-heading[data-len="xl"]{font-size:min(8.5vw,calc(var(--fit) / var(--lw)))}
  html .sc-text[data-size="medium"] .sc-heading,html .sc-text[data-size="small"] .sc-heading{font-size:min(7.5vw,calc(var(--fit) / var(--lw)))}
  .sc-body{font-size:15.5px;margin-top:12px}
  .cr-herocredit{position:static;padding:0 20px 0 26px;order:4;max-width:none;text-align:left}
  .cr-foot{padding:36px 20px 28px 26px}
  /* phones: the fixed header is a solid bar (its fade let dark scenes' words run under the page title), and every tap
     target is finger-sized; citation numbers readable */
  .cr-nav{background:rgba(var(--bg-rgb),.92);-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px)}
  .cr-brand{display:flex;align-items:center;min-height:44px}
  .cr-menu summary,.cr-sources summary{display:flex;align-items:center;min-height:44px}
  .cr-cite{font-size:12px;padding:6px 2px}
}
/* reduced motion: the complete still composition */
html[data-motion="reduced"] *,html[data-motion="reduced"] *::before,html[data-motion="reduced"] *::after{animation:none!important;transition:none!important}
html[data-motion="reduced"] .ly-in,html[data-motion="reduced"] .sc-text>*,html[data-motion="reduced"] .sc-item,html[data-motion="reduced"] .w{opacity:1!important;transform:none!important;clip-path:none!important}
html[data-motion="reduced"] .ly-scroll,html[data-motion="reduced"] .sc-stage{transform:none!important;clip-path:none!important}
html[data-motion="reduced"] .sc[data-pin]{height:auto}html[data-motion="reduced"] .sc[data-pin] .sc-pin{position:relative;height:auto;min-height:100vh}
html[data-motion="reduced"] .cr-connector .cr-dot{opacity:1;transform:none}
@media print{.cr-nav,.cr-connector,.sc-world{display:none}}
`;
}

function beatCss() {
  let o = '';
  for (let j = 0; j < 3; j++) {
    const I = `(1 - var(--b${j},1))`, O = `var(--b${j},0)`, B = `var(--b${j},1)`, V = `var(--v${j},0)`, U = `var(--u${j},0)`, A = `[data-b${j}=`;
    [['in', I], ['out', O]].forEach(([d, P]) => {
      o += `${A}"translate-${d}"]{translate:calc(${V} * ${P} * 1vw * var(--mk,1)) calc(${U} * ${P} * 1vh * var(--mk,1))}\n`;
      o += `${A}"scale-${d}"]{scale:calc(1 + (${V} - 1) * ${P} * var(--mk,1))}\n`;
      o += `${A}"rotate-${d}"]{rotate:calc(${V} * ${P} * 1deg * var(--mk,1))}\n`;
      o += `${A}"opacity-${d}"]{opacity:calc(1 - (1 - ${V}) * ${P})}\n`;
      o += `${A}"clip-${d}"] .ly-loop{clip-path:inset(calc(${V} * ${P} * 100%) calc(${V} * ${P} * 70%) round calc(${P} * 24px))}\n`;
      o += `${A}"letter-spread-${d}"] .ch{translate:calc((var(--ci,0) - (var(--cn,8) - 1) / 2) * ${P} * .3em * var(--mk,1)) 0}\n`;
      o += `${A}"depth-shift-${d}"] .ly{translate:0 calc(var(--dz,0) * ${V} * ${P} * 24vh * var(--mk,1))}\n`;
      o += `${A}"perspective-${d}"]{rotate:x calc(${V} * ${P} * 1deg * var(--mk,1));transform-origin:50% 85%}\n`;
    });
    o += `${A}"crossfade-out"]{opacity:calc(1 - ${O})}[data-xf="${j}"][data-xfdir="out"]{opacity:${O};left:auto}\n`;
    o += `${A}"crossfade-in"]{opacity:${B}}[data-xf="${j}"][data-xfdir="in"]{opacity:calc(1 - ${B})}\n`;
    // (one line, then the other -- never both in one place at once, a doubled headline)
    o += `${A}"text-swap-in"] .hs-alt{opacity:clamp(0, 1 - ${B} * 2.2, 1);translate:0 calc(${B} * -.35em)}${A}"text-swap-in"] .hs-main{opacity:clamp(0, ${B} * 2.2 - 1.2, 1);translate:0 calc(${I} * .35em)}\n`;
    o += `${A}"word-fill-in"] .wf{opacity:calc(.16 + .84 * clamp(0, ${B} * (var(--wn,10) + 2) - var(--i,0), 1))}\n`;
    o += `.sc-bgx${A}"background-in"]{opacity:calc(1 - ${B})}.sc-take${A}"takeover-in"]{clip-path:circle(calc(${B} * 150%) at 50% 58%)}\n`;
  }
  // (a text-swap: the second line and the heading share one place)
  o += '.hs{display:inline-grid}.hs>span{grid-area:1/1}.hs-alt{opacity:0}\n';
  return o;
}

// ---------------------------------------------------------------- runtime (fixed code; reads only numbers/enums)
const RUNTIME2 = `
(function(){
var d=document,html=d.documentElement,W=window,cfg={};try{cfg=JSON.parse(d.getElementById('cr-scene').textContent)}catch(e){}
function reduced(){return html.getAttribute('data-motion')==='reduced'}
if(W.matchMedia&&W.matchMedia('(prefers-reduced-motion: reduce)').matches)html.setAttribute('data-motion','reduced');
var scenes=[].slice.call(d.querySelectorAll('.sc')),hero=scenes[0],mainEl=d.getElementById('main');
function markMissing(img){var f=img.closest('[data-img]');if(f)f.classList.add('is-missing');W.__crMissing=(W.__crMissing||0)+1}
[].forEach.call(d.querySelectorAll('img[data-asset]'),function(img){if(!img.getAttribute('src')){markMissing(img);return}img.addEventListener('error',function(){markMissing(img)});img.addEventListener('load',function(){var f=img.closest('[data-img]');if(f)f.classList.remove('is-missing');layout()});if(img.complete&&img.naturalWidth===0)markMissing(img)});
/* entrances: the hero when its focal picture has decoded; every other scene as it arrives */
function enter(s){if(!s.classList.contains('is-in')){s.classList.add('is-in');if(s===hero)W.__crEntered=Date.now()}}
if(hero){var f=hero.querySelector('[data-role="subject"] img');var go=function(){requestAnimationFrame(function(){enter(hero)})};if(!f||reduced())enter(hero);else{if(f.decode)f.decode().then(go,go);else go();setTimeout(function(){enter(hero)},2500)}}
var io=('IntersectionObserver' in W)?new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting){enter(e.target);e.target.classList.add('is-seen');io.unobserve(e.target)}})},{rootMargin:'0px 0px -12% 0px',threshold:0}):null;
scenes.slice(1).forEach(function(s){if(io&&!reduced())io.observe(s);else{enter(s);s.classList.add('is-seen')}});
/* scroll: each scene's progress p (0 arriving .. 1 leaving; pinned scenes: through their hold) drives its layers and camera */
var ticking=false,measured=false,mainTop=0;
/* geometry is read only when the layout changes (load, resize, a picture arriving) -- never while scrolling: each scene's
   top and height are kept, and a frame works from the scroll position alone (a held scene is measured by its pair) */
scenes.forEach(function(s){s._st=s.querySelector('.sc-stage');s._cam=s.getAttribute('data-camera');s._ls=[].slice.call(s.querySelectorAll('.ly-scroll')).filter(function(l){return l.getAttribute('data-scroll')!=='none'})});
function topOf(e){return e.getBoundingClientRect().top+(W.scrollY||W.pageYOffset)}
function measure(){measured=true;mainTop=mainEl?topOf(mainEl):0;scenes.forEach(function(s){var p=s.parentNode;s._top=topOf(s.hasAttribute('data-hold')&&p&&p.classList&&p.classList.contains('sc-pair')?p:s);s._h=s.offsetHeight});if(W.__crArtMeasure)W.__crArtMeasure()}
function prog(s,vh,y){var top=s._top-y;if(s.hasAttribute('data-pin')){var span=s._h-vh;return span>0?Math.max(0,Math.min(1,-top/span)):0}return Math.max(0,Math.min(1,(vh-top)/(vh+s._h)))}
/* zm: the ceiling on a picture's zoom (data-zmax, framing.js ZOOM) */
function tf(kind,a,p,vw,vh,zm){var q=p-.5;switch(kind){
 case 'parallax':return 'translate3d(0,'+(-q*a*vh*.3).toFixed(1)+'px,0)';
 case 'drift-x':return 'translate3d('+(q*a*vw*.35).toFixed(1)+'px,0,0)';
 case 'rise':return 'translate3d(0,'+((1-p)*a*vh*.35).toFixed(1)+'px,0)';
 case 'sink':return 'translate3d(0,'+(p*a*vh*.3).toFixed(1)+'px,0)';
 case 'zoom-in':return 'scale('+Math.min(zm||9,1+p*Math.abs(a)*.55).toFixed(3)+')';
 case 'zoom-out':return 'scale('+Math.min(zm||9,1+(1-p)*Math.abs(a)*.55).toFixed(3)+')';
 case 'rotate':return 'rotate('+(q*a*80).toFixed(1)+'deg)';
 case 'pass-through':return 'translate3d('+(-q*a*vw*1.1).toFixed(1)+'px,0,0)';
 default:return ''}}
/* k: a scene showing cropped pictures pushes in half as far (no compounding zoom into a crop) */
function cam(kind,p,k){var q=p-.5;k=k||.12;switch(kind){case 'push-in':return 'scale('+(1+p*k).toFixed(3)+')';case 'pull-out':return 'scale('+(1+k-p*k).toFixed(3)+')';case 'pan-left':return 'translate3d('+(-q*6).toFixed(2)+'%,0,0)';case 'pan-right':return 'translate3d('+(q*6).toFixed(2)+'%,0,0)';case 'rise':return 'translate3d(0,'+(-q*8).toFixed(2)+'%,0)';default:return ''}}
function frame(){ticking=false;if(!measured)measure();var vh=W.innerHeight,vw=W.innerWidth,red=reduced(),y=W.scrollY||W.pageYOffset;
  scenes.forEach(function(s){var top=s._top-y;if(top+s._h<-vh||top>vh*2)return;var p=prog(s,vh,y);var st=s._st;
    if(st&&s._cam!=='none'&&!st.hasAttribute('data-track'))st.style.transform=red?'':cam(s._cam,p,s.hasAttribute('data-camcap')?.06:.12);
    s._ls.forEach(function(l){var k=l.getAttribute('data-scroll');if(red){l.style.transform='';l.style.clipPath='';return}var a=+l.getAttribute('data-amount')||0;
      if(k==='reveal'){var v=Math.min(1,p*1.8);l.style.clipPath='inset(0 0 '+((1-v)*100).toFixed(1)+'% 0)';return}l.style.transform=tf(k,a,p,vw,vh,+l.getAttribute('data-zmax')||0)})});
  if(W.__crArtFrame)W.__crArtFrame(vh,vw,red);
  if(W.__crKinFrame)W.__crKinFrame(y);
  if(mask){var mt=mainTop,tY=Math.min(y+vh*.66-mt,startY+y*1.6),drawn=red?len:Math.max(0,Math.min(len,lenAtY(tY)));mask.setAttribute('stroke-dashoffset',(len-drawn).toFixed(1));dots.forEach(function(c){c.classList.toggle('on',c._at<=drawn+1)})}
}
function onScroll(){if(!ticking){ticking=true;requestAnimationFrame(frame)}}
W.addEventListener('scroll',onScroll,{passive:true});
/* the thread: from the hero down the side margins, crossing only between scenes */
var svg=d.querySelector('.cr-connector'),NS='http://www.w3.org/2000/svg',mask=null,len=0,table=[],dots=[],startY=0;
function el(n,a){var e=d.createElementNS(NS,n);for(var k in a)e.setAttribute(k,a[k]);return e}
function lenAtY(y){if(!table.length||y<=table[0][0])return 0;for(var i=1;i<table.length;i++){if(table[i][0]>=y){var a=table[i-1],b=table[i];return a[1]+(b[1]-a[1])*((y-a[0])/Math.max(1,b[0]-a[0]))}}return len}
function focalPoint(){var f=hero&&hero.querySelector('[data-role="subject"]');if(!f||!cfg.focal||cfg.focal.fit!=='contain')return null;var r=f.getBoundingClientRect(),m=mainEl.getBoundingClientRect(),w=r.width,h=r.height,x=r.left-m.left,y=r.top-m.top,a=cfg.focal.aspect;if(w/h>a){var nw=h*a;x+=(w-nw)/2;w=nw}else{var nh=w/a;y+=h-nh;h=nh}var b=cfg.focal.bbox;return{x:x+w*(b[0]+(b[2]-b[0])*.5),y:y+h*(b[1]+(b[3]-b[1])*.97)}}
function layout(){
  if(W.__crArtLayout)W.__crArtLayout();
  measure();
  if(!svg||!mainEl||cfg.thread==='none'){frame();return}
  var mw=mainEl.clientWidth,mh=mainEl.scrollHeight,phone=mw<=720;svg.setAttribute('viewBox','0 0 '+mw+' '+mh);svg.setAttribute('width',mw);svg.setAttribute('height',mh);while(svg.firstChild)svg.removeChild(svg.firstChild);dots=[];mask=null;
  var rest=scenes.slice(1);if(!rest.length){frame();return}
  var side=phone?10:Math.max(12,Math.min(80,mw*.035)),left=side,right=mw-side,band=phone?30:46,hb=hero.offsetTop+hero.offsetHeight,sp=phone?null:focalPoint(),pts=[];
  pts.push(sp?{x:sp.x,y:sp.y}:{x:left,y:hb-band});
  rest.forEach(function(s,i){pts.push({x:phone?left:(i%2?left:right),y:s.offsetTop+Math.min(s.offsetHeight*.5,W.innerHeight*.6),top:s.offsetTop})});
  startY=pts[0].y;var f=function(v){return v.toFixed(1)},p='M'+f(pts[0].x)+' '+f(pts[0].y);
  for(var i=1;i<pts.length;i++){var a=pts[i-1],b=pts[i],yb=Math.max(a.y+band+2,b.top);p+=' L'+f(a.x)+' '+f(yb-band)+' C'+f(a.x)+' '+f(yb)+' '+f(b.x)+' '+f(yb)+' '+f(b.x)+' '+f(yb+band)+' L'+f(b.x)+' '+f(b.y)}
  var k=cfg.thread,accent=getComputedStyle(html).getPropertyValue('--accent').trim()||'#c33',wide=phone?8:28;
  var defs=el('defs',{});mask=el('path',{d:p,fill:'none',stroke:'#fff','stroke-width':wide+16,'stroke-linecap':'butt'});var mk=el('mask',{id:'cr-thread-mask',maskUnits:'userSpaceOnUse',x:0,y:0,width:mw,height:mh});mk.appendChild(mask);defs.appendChild(mk);svg.appendChild(defs);
  var g=el('g',{mask:'url(#cr-thread-mask)'});
  if(k==='ribbon'){g.appendChild(el('path',{d:p,fill:'none',stroke:'rgba(0,0,0,.25)','stroke-width':wide,transform:'translate(3 6)'}));g.appendChild(el('path',{d:p,fill:'none',stroke:'#fbfaf6','stroke-width':wide}));g.appendChild(el('path',{d:p,fill:'none',stroke:'rgba(120,110,95,.5)','stroke-width':wide,'stroke-dasharray':'1.2 '+(phone?40:90)}))}
  else if(k==='thread'){g.appendChild(el('path',{d:p,fill:'none',stroke:accent,'stroke-width':phone?1.6:2.4}))}
  else if(k==='stitch'){g.appendChild(el('path',{d:p,fill:'none',stroke:accent,'stroke-width':phone?2:3,'stroke-dasharray':'10 8','stroke-linecap':'round'}))}
  else if(k==='orbit'){g.appendChild(el('path',{d:p,fill:'none',stroke:accent,'stroke-width':phone?2:3,'stroke-dasharray':'0.1 12','stroke-linecap':'round',opacity:.85}))}
  else if(k==='line'){g.appendChild(el('path',{d:p,fill:'none',stroke:accent,'stroke-width':phone?1.5:2,opacity:.8}))}
  svg.appendChild(g);len=mask.getTotalLength();table=[];for(var s=0;s<=240;s++){var q=mask.getPointAtLength(len*s/240);table.push([q.y,len*s/240])}
  if(k==='bubbles'){for(var t=40;t<len;t+=phone?46:70){var q2=mask.getPointAtLength(t),rr=(phone?3:5)+((t*7919)%9);var c=el('circle',{cx:f(q2.x),cy:f(q2.y),r:rr,fill:'rgba(255,255,255,.12)',stroke:'rgba(255,255,255,.6)','stroke-width':1.3,'class':'cr-dot'});c._at=t;svg.appendChild(c);dots.push(c)}}
  if(k==='thread'){pts.slice(1).forEach(function(pt){var c=el('circle',{cx:pt.x,cy:pt.y,r:phone?4:6,fill:accent,stroke:'#fff','stroke-width':2,'class':'cr-dot'});c._at=lenAtY(pt.y);svg.appendChild(c);dots.push(c)})}
  mask.setAttribute('stroke-dasharray',len+' '+len);frame()}
var rw0=W.innerWidth,rh0=W.innerHeight;function realResize(){var w=W.innerWidth,h=W.innerHeight;if(w===rw0&&Math.abs(h-rh0)<180)return false;rw0=w;rh0=h;return true}
var rt;W.addEventListener('resize',function(){if(!realResize())return;clearTimeout(rt);rt=setTimeout(layout,120)});
if('ResizeObserver' in W&&mainEl){var last=0;new ResizeObserver(function(){var h=mainEl.scrollHeight;if(Math.abs(h-last)>2){last=h;clearTimeout(rt);rt=setTimeout(layout,120)}}).observe(mainEl)}
if(d.readyState==='complete')layout();else W.addEventListener('load',layout);setTimeout(layout,60);
/* in-page navigation: every "#..." link scrolls within this page and never navigates (in the studio's srcdoc preview a
   bare "#id" resolves against the parent site and would load it into the preview). Sections scroll to their top (their
   padding clears the sticky header); other targets sit below the header. Sources and citations open the source list;
   the phone menu closes; focus moves to the destination. */
function navTo(id){var t=id==='top'?hero:d.getElementById(id);if(!t)return false;
  var det=d.querySelector('.cr-sources');if(det&&(id==='cr-sources'||(t.closest&&t.closest('.cr-foot'))))det.open=true;
  var nav=d.querySelector('.cr-nav'),off=nav?nav.getBoundingClientRect().height:0,isScene=t.classList&&t.classList.contains('sc');
  var y=id==='top'?0:Math.max(0,t.getBoundingClientRect().top+(W.scrollY||W.pageYOffset)-(isScene?0:off+12));
  var m=d.querySelector('details.cr-menu[open]');if(m)m.open=false;
  try{W.scrollTo({top:y,behavior:reduced()?'auto':'smooth'})}catch(x){W.scrollTo(0,y)}
  if(!t.hasAttribute('tabindex'))t.setAttribute('tabindex','-1');try{t.focus({preventScroll:true})}catch(x){}
  try{if(location.protocol==='http:'||location.protocol==='https:'||location.protocol==='file:')history.replaceState(null,'','#'+id)}catch(x){}
  return true}
d.addEventListener('click',function(e){var a=e.target.closest&&e.target.closest('a[href^="#"]');if(!a)return;var id='';try{id=decodeURIComponent(a.getAttribute('href').slice(1))}catch(x){}e.preventDefault();if(id)navTo(id)});
W.__crNav=navTo;
if(location.hash&&location.hash.length>1){var h0=location.hash.slice(1);setTimeout(function(){try{navTo(decodeURIComponent(h0))}catch(x){}},450)}
W.__crLayout=layout;W.__crFrame=frame;W.__crMeasure=measure;
})();`;
const PREVIEW2 = `
(function(){var d=document,html=d.documentElement;
window.addEventListener('message',function(e){if(e.source!==window.parent)return;var m=e.data||{};
  if(m.type==='cr-edit'){[].forEach.call(d.querySelectorAll('[data-edit]'),function(n){if(n.getAttribute('data-edit')===m.key)n.textContent=String(m.text==null?'':m.text)});if(window.__crLayout)window.__crLayout()}
  else if(m.type==='cr-motion'){html.setAttribute('data-motion',m.motion==='reduced'?'reduced':'full');if(m.tempo)html.setAttribute('data-tempo',m.tempo);[].forEach.call(d.querySelectorAll('.sc'),function(s){s.classList.add('is-in','is-seen')});if(window.__crLayout)window.__crLayout()}
  else if(m.type==='cr-replay'){var h=d.querySelector('.sc');if(h){h.classList.remove('is-in');void h.offsetWidth;setTimeout(function(){h.classList.add('is-in')},80)}}
});
/* the preview never navigates itself: in-page links are handled by the page runtime; external source links open in a
   new tab (target=_blank); anything else is inert here */
d.addEventListener('click',function(e){var a=e.target.closest&&e.target.closest('a[href]');if(!a)return;var h=a.getAttribute('href');if((h&&h.charAt(0)==='#')||a.getAttribute('target')==='_blank')return;e.preventDefault()});
})();`;

// ---------------------------------------------------------------- art direction (only on art-directed pages)
// Layout archetypes (archetypes.js), scene choreography, handoffs, motion personality, typography, navigation and
// density. Scroll-linked effects read two numbers the runtime writes on each moving scene -- --p (its scroll progress)
// and --pe (that progress through the choreography's window, eased in the page's personality) -- and use the
// individual transform properties (translate / scale / rotate), so they never fight the entrance and loop transforms.
// Without scripting, or with reduced motion, every one of them rests in its finished composition.
const ARTCSS = `
/* ===== art direction ===== */
html.cr-js[data-personality] .ly-in{transition-timing-function:var(--ease),ease,var(--ease)}
html.cr-js[data-personality] .sc-text>*{transition-timing-function:var(--ease),ease}
html[data-personality="luxe"] .ly-in,html[data-personality="cinematic"] .ly-in{transition-duration:calc(var(--dur) * 1.25),calc(var(--dur) * .9),calc(var(--dur) * 1.25)}
html[data-personality="editorial"] .amb-near,html[data-personality="luxe"] .amb-near,html[data-personality="mechanical"] .amb-near,html[data-personality="still"] .amb-near{display:none}
html[data-personality="mechanical"] .amb-haze,html[data-personality="still"] .amb-haze,html[data-personality="editorial"] .amb-haze.amb-b{display:none}
/* the composition grid: twelve columns inside the page margins; the words take the columns the archetype gave them */
.sc[data-layout]:not([data-layout="free"]) .sc-pin{grid-template-columns:5% repeat(12,minmax(0,1fr)) 5%}
.sc[data-layout]:not([data-layout="free"]) .sc-text{grid-column:var(--gc,2 / 8);max-width:none;margin-inline:0}
.sc-text[data-v="top"]{align-self:start}.sc-text[data-v="middle"]{align-self:center}.sc-text[data-v="bottom"]{align-self:end}
.sc-text[data-v][data-align="center"]{text-align:center}.sc-text[data-v][data-align="right"]{text-align:right}
.sc-text[data-v][data-align="center"] .sc-body,.sc-text[data-v][data-align="center"] .sc-list{margin-inline:auto}
.sc-text[data-v][data-width="narrow"] :is(.sc-body,.sc-list){max-width:34ch}.sc-text[data-v][data-width="medium"] :is(.sc-body,.sc-list){max-width:52ch}.sc-text[data-v][data-width="wide"] :is(.sc-body,.sc-list){max-width:72ch}
.sc-text[data-v][data-width="narrow"] .sc-heading{max-width:14ch}.sc-text[data-v][data-align="center"][data-width="narrow"] .sc-heading{margin-inline:auto}
/* density: how much air a page breathes */
html[data-density="sparse"] .sc[data-layout] .sc-pin{padding-top:calc(var(--nav) + 9vh);padding-bottom:10vh}
html[data-density="dense"] .sc[data-layout] .sc-pin{padding-top:calc(var(--nav) + 2vh);padding-bottom:4vh}
/* typography does the work: giant, poster, minimal, editorial and mixed faces of the same page */
html[data-typo="giant"] .sc[data-layout] .sc-text[data-size="display"] .sc-heading{font-size:min(clamp(3.4rem,9.5vw,11rem),calc(var(--fit) * 1.08 / var(--lw)));line-height:.86;letter-spacing:-.035em}
html[data-typo="poster"] .sc[data-layout] .sc-heading{text-transform:uppercase;letter-spacing:-.005em;line-height:.9}
html[data-typo="minimal"] .sc[data-layout] .sc-heading{font-weight:500;letter-spacing:-.01em}
html[data-typo="minimal"] .sc[data-layout] .sc-kicker{letter-spacing:.34em;font-weight:600}
html[data-typo="editorial"] .sc[data-layout] .sc-kicker{letter-spacing:.18em;border-top:1px solid currentColor;padding-top:10px;display:inline-block}
html[data-typo="mixed"] .sc[data-layout]:nth-of-type(even) .sc-heading{font-style:italic;font-weight:400}
.sc-heading[data-stagger] .ln{display:block}.sc-heading[data-stagger] .ln:nth-child(2){padding-left:.9em}.sc-heading[data-stagger] .ln:nth-child(3){padding-left:.35em}
.sc-text[data-align="center"] .sc-heading[data-stagger] .ln{padding-left:0}
@media (min-width:721px){html[data-typo="editorial"] .sc[data-layout] .sc-text[data-align="left"][data-v="middle"]>.sc-kicker{position:absolute;right:calc(100% + clamp(14px,1.6vw,26px));top:0;writing-mode:vertical-rl;transform:rotate(180deg);border:0;padding:0;margin:0;white-space:nowrap}}
/* giant type across the scene, its picture behind it */
.sc-text[data-giant] .sc-heading{font-size:min(clamp(4rem,15vw,17rem),calc(var(--fit) * 1.12 / var(--lw)));line-height:.82;letter-spacing:-.04em;text-shadow:0 0 .35em var(--s-surface,var(--bg))}
.sc-text[data-giant] :is(.sc-body,.sc-list){max-width:36ch;margin-left:auto;margin-right:0}
.sc-text[data-giant][data-align="center"] :is(.sc-body,.sc-list){margin-inline:auto}
/* a caption on its picture sits on a shade of the scene's own colour */
.sc-shade{position:absolute;left:0;right:0;bottom:0;height:62%;z-index:5;pointer-events:none;background:linear-gradient(180deg,transparent,color-mix(in srgb,var(--s-surface,var(--bg)) 76%,transparent) 55%,color-mix(in srgb,var(--s-surface,var(--bg)) 94%,transparent))}
.sc-shade[data-shade="band"]{bottom:13%;height:34%;z-index:21}
.sc[data-layout="cinematic"] .sc-stage::before,.sc[data-layout="cinematic"] .sc-stage::after{content:"";position:absolute;left:0;right:0;height:13%;background:var(--s-surface,var(--bg));z-index:20}
.sc[data-layout="cinematic"] .sc-stage::before{top:0}.sc[data-layout="cinematic"] .sc-stage::after{bottom:0}
.sc[data-layout="cinematic"] .sc-text{z-index:21}
/* archetype faces */
.sc-text[data-columns] .sc-body{columns:2 22ch;column-gap:2.4em}
.sc[data-layout="magazine"] .sc-text{border-top:2px solid currentColor;padding-top:18px}
.sc[data-layout="magazine"] .sc-body>span::first-letter{float:left;font-family:var(--display);font-weight:var(--dw);font-size:3.4em;line-height:.8;padding:.06em .1em 0 0;color:var(--s-accent,var(--accent))}
.sc[data-layout="brutalist"] .sc-text{font-family:"Cascadia Mono","SF Mono",Consolas,"Courier New",monospace}
.sc[data-layout="brutalist"] .sc-heading{text-transform:uppercase;letter-spacing:-.02em;border-bottom:3px solid currentColor;padding-bottom:.16em}
.sc[data-layout="brutalist"] .sc-list{gap:0;border-top:2px solid currentColor}.sc[data-layout="brutalist"] .sc-item{border-bottom:2px solid currentColor;padding:12px 0}
.sc[data-layout="brutalist"] .ly-art{border-radius:0!important;box-shadow:none!important}.sc[data-layout="brutalist"] .ly[data-kind="image"] .ly-art{outline:3px solid var(--s-ink,var(--ink));outline-offset:0}
.shape[data-form="block"]{background:var(--f)}.shape[data-light][data-form="block"]{background:var(--f);opacity:.9}
.sc[data-layout="dense"] .sc-list{grid-template-columns:repeat(auto-fill,minmax(min(100%,250px),1fr));gap:20px 30px}
.sc[data-layout="dense"] .sc-item{border-top:2px solid rgba(var(--ink-rgb),.22);padding-top:12px}
.sc[data-layout="luxe"] .sc-kicker{letter-spacing:.42em;font-weight:500}.sc[data-layout="luxe"] .sc-heading{font-weight:400}
.ly-art[data-fit="contain"]:is([data-mask="window"],[data-mask="frame"]){background:color-mix(in srgb,var(--s-surface,var(--bg)) 90%,var(--s-ink,var(--ink)))}
.ly-img[data-crop]{object-fit:var(--of,cover);object-position:var(--oq,50% 50%)}
/* (a phone has its own fit and crop position for each framed picture: a wide picture shown whole there is never cropped) */
@media (max-width:720px){.ly-img[data-crop]{object-fit:var(--mof,var(--of,cover));object-position:var(--moq,var(--oq,50% 50%))}}
/* a strip: pictures in a row at one height, each as wide as its own picture, moved sideways by the vertical scroll */
.sc[data-choreo="track"] .sc-stage[data-track]{display:flex;align-items:center;gap:clamp(18px,3vw,48px);padding:0 10vw 0 38vw;width:max-content;right:auto;transform-origin:0 50%}
.sc[data-choreo="track"] .ly[data-track]{position:relative;left:auto;top:auto;width:auto;height:min(62vh,50vw);aspect-ratio:var(--ar,1);flex:0 0 auto}
.sc[data-choreo="track"] .sc-pin::after{content:"";position:absolute;left:0;top:0;bottom:0;width:37vw;background:linear-gradient(90deg,var(--s-surface,var(--bg)) 82%,transparent);z-index:5;pointer-events:none}
.sc[data-choreo="track"] .sc-text{z-index:7}
/* held scenes: the pin lasts as long as the choreography needs (the runtime sets a strip's exact length) */
html.cr-js .sc[data-pin][data-choreo="zoom-away"],html.cr-js .sc[data-pin][data-choreo="scale-through"]{height:calc(100vh + var(--pinv,110) * 1vh)}
html.cr-js .sc[data-pin][data-steps]{height:min(calc(100vh + var(--steps,2) * var(--pinv,110) * .62vh),420vh)}
html.cr-js .sc[data-pin][data-choreo="track"]{height:300vh}
html:not(.cr-js) .sc[data-layout][data-pin]{height:auto}html:not(.cr-js) .sc[data-layout][data-pin] .sc-pin{position:relative;height:auto;min-height:100vh}
/* steps: the words change while the picture holds (or the picture changes with them) */
html.cr-js .sc[data-steps] .sc-list{display:grid}
html.cr-js .sc[data-steps] .sc-item{grid-area:1/1;align-self:start}
html.cr-js .sc[data-steps].is-in .sc-item{transition:opacity .45s var(--ease),transform .6s var(--ease)}
html.cr-js .sc[data-steps].is-in .sc-item:not(.is-on){opacity:0;transform:translate3d(0,20px,0);pointer-events:none}
html.cr-js .sc[data-steps].is-in .sc-item.is-on{opacity:1;transform:none;transition-delay:0s}
.ly[data-step]{transition:opacity .7s var(--ease,ease),translate .9s var(--ease,ease),scale .9s var(--ease,ease),filter .9s ease}
html.cr-js .sc[data-steps] .ly[data-step]:not(.is-on){opacity:0}
html.cr-js .sc[data-choreo="stack"] .ly[data-step]:not(.is-on):not(.is-past){opacity:var(--op);translate:0 120vh}
html.cr-js .sc[data-choreo="stack"] .ly[data-step].is-past{opacity:var(--op);scale:.93;translate:0 -2%;filter:brightness(.7)}
.sc-count{position:absolute;right:5%;bottom:5vh;z-index:7;margin:0;font-family:var(--display);font-weight:var(--dw);font-size:13px;letter-spacing:.2em;color:var(--s-muted,var(--muted))}.sc-count b{font-size:30px;margin-right:4px;color:var(--s-ink,var(--ink));letter-spacing:0}
html:not(.cr-js) .sc-count{display:none}
html:not(.cr-js) .sc[data-steps] .ly[data-step],html[data-motion="reduced"] .sc[data-steps] .ly[data-step]{translate:calc(var(--sti,0) * 5%) calc(var(--sti,0) * 4%)!important;rotate:calc(var(--sti,0) * 2deg)!important;scale:calc(1 - var(--sti,0) * .07)!important;opacity:var(--op)!important;filter:none!important}
/* choreography */
.sc[data-choreo="zoom-away"] .ly:is([data-role="focal"],[data-role="subject"]){scale:calc(1 - var(--pe,0) * min(.18, .12 * var(--range,1)));transform-origin:50% 45%}
.sc[data-choreo="zoom-away"] .ly:is([data-role="focal"],[data-role="subject"]) .ly-art{border-radius:calc(var(--pe,0) * 28px);overflow:hidden}
.sc[data-choreo="scale-through"] .ly:is([data-role="echo"],[data-role="backdrop"],[data-kind="word"]){scale:calc(1 + var(--pe,0) * 2.4 * var(--range,1));opacity:calc(var(--op) * (1 - var(--pe,0) * .92))}
.sc[data-choreo="scale-through"] .ly:is([data-role="focal"],[data-role="subject"]){translate:0 calc((1 - var(--pe,1)) * 5vh);scale:calc(.95 + var(--pe,1) * .05)}
.sc[data-choreo="mask-reveal"] .ly:is([data-role="focal"],[data-role="subject"]) .ly-loop{clip-path:inset(calc((1 - var(--pe,1)) * 44%) calc((1 - var(--pe,1)) * 28%) round calc((1 - var(--pe,1)) * 40px))}
.sc[data-choreo="type-wipe"] .sc-heading{clip-path:inset(-.25em calc((1 - var(--pe,1)) * 100%) -.25em -.1em);translate:calc((1 - var(--pe,1)) * -5vw) 0}
.sc[data-choreo="type-wipe"] .ly[data-kind="word"]{translate:calc((.5 - var(--p,.5)) * 56vw * var(--range,1)) 0}
.sc[data-choreo="depth"] .ly{translate:0 calc((.5 - var(--p,.5)) * var(--dz,0) * 24vh * var(--range,1))}
html[data-depth="deep"] .sc[data-choreo="depth"] .ly{translate:0 calc((.5 - var(--p,.5)) * var(--dz,0) * 34vh * var(--range,1))}
.sc[data-choreo="travel"] .ly:is([data-role="focal"],[data-role="subject"]){translate:calc((var(--p,.5) - .5) * 26vw * var(--range,1)) calc((.5 - var(--p,.5)) * 8vh);rotate:calc((var(--p,.5) - .5) * 24deg * var(--range,1))}
.sc[data-choreo="travel"] .ly[data-role="support"]{translate:calc((.5 - var(--p,.5)) * 14vw * var(--range,1)) 0;rotate:calc((.5 - var(--p,.5)) * 30deg)}
/* the seams between scenes */
.ly[data-exit="right"] .ly-scroll{translate:calc(max(0, var(--p,0) - .6) * 150vw) 0}.ly[data-exit="left"] .ly-scroll{translate:calc(max(0, var(--p,0) - .6) * -150vw) 0}
.ly[data-enter="left"] .ly-scroll{translate:calc(max(0, .42 - var(--p,1)) * -150vw) 0}.ly[data-enter="right"] .ly-scroll{translate:calc(max(0, .42 - var(--p,1)) * 150vw) 0}
/* (desktop: the stage is absolute, so it can end above the strip the next scene will cover; on phones the stage is in the
   flow and the scene simply keeps extra room at its foot) */
@media (min-width:721px){.sc[data-overlapped] .sc-stage{bottom:14vh}.sc[data-overlapped] .sc-pin{padding-bottom:calc(6vh + 14vh)}.sc[data-overlapped]:not([data-pin]) .sc-pin{min-height:calc(var(--sh,0) * 1vh + 14vh)}}
.sc[data-handoff="overlap"]{margin-top:-14vh;z-index:2;border-radius:clamp(20px,3vw,44px) clamp(20px,3vw,44px) 0 0;box-shadow:0 -28px 60px rgba(0,0,0,.28);overflow:clip}
/* (on one continuous surface the overlap is the two scenes sharing the screen -- not a card with an edge sliding up) */
html.cr-js[data-flowall]:not([data-motion="reduced"]) .sc[data-handoff="overlap"]{border-radius:0;box-shadow:none}
.sc[data-handoff="stack"]{z-index:2;box-shadow:0 -30px 70px rgba(0,0,0,.34)}
/* (a sticky scene is held only within its parent: the pair; the pair itself is not positioned, so every scene keeps main as
   its offset parent and the thread's path is unchanged) */
.sc-pair{display:block}.sc[data-hold]{position:sticky;top:var(--hold,0px);z-index:1}
.sc[data-hold] .sc-pin::after{content:"";position:absolute;inset:0;background:#000;opacity:calc(var(--cover,0) * .5);pointer-events:none;z-index:30}
.sc[data-bleed]{background:color-mix(in srgb,var(--s-surface) calc(var(--mix,1) * 100%),var(--prev))!important}
/* navigation treatments */
html[data-nav="minimal"] .cr-nav{background:none;transition:transform .5s var(--ease,ease)}
html[data-nav="minimal"] .cr-nav.is-away{transform:translate3d(0,-110%,0)}
@media (min-width:721px){
  html[data-nav="minimal"] .cr-links{display:none}html[data-nav="minimal"] .cr-menu{display:block}
  html[data-nav="index"] .cr-nav{background:none}
  html[data-nav="index"] .cr-links{position:fixed;right:clamp(14px,2vw,28px);top:50%;transform:translateY(-50%);flex-direction:column;align-items:flex-end;gap:12px;counter-reset:ix}
  html[data-nav="index"] .cr-links li{counter-increment:ix}
  html[data-nav="index"] .cr-links a{display:flex;align-items:center;gap:10px;font-size:0;opacity:.6;min-height:24px}
  html[data-nav="index"] .cr-links a::after{content:counter(ix,decimal-leading-zero);font-size:12px;letter-spacing:.12em;font-variant-numeric:tabular-nums;border-top:1px solid currentColor;padding-top:3px;min-width:24px;text-align:right}
  html[data-nav="index"] .cr-links a:is(:hover,:focus-visible,.is-active){font-size:12px;opacity:1;text-decoration:none;letter-spacing:.14em;text-transform:uppercase}
  html[data-scroll="snap"]{scroll-snap-type:y proximity}html[data-scroll="snap"] .sc{scroll-snap-align:start}
}
/* phones: every archetype recomposes -- its own stage height, the words above, below or over the picture, shorter holds,
   smaller movements -- and keeps its idea */
@media (max-width:720px){
  .sc[data-layout]:not([data-layout="free"]) .sc-text{grid-column:auto}
${Object.entries(ARCH.MSTAGE).map(([k, v]) => `  .sc[data-layout="${k}"] .sc-stage{height:min(${v}vw,${Math.min(86, Math.round(v * 0.72))}svh)}`).join('\n')}
  .sc[data-layout][data-mplace="overlay"]:not([data-layout="free"]) .sc-pin{display:grid;grid-template-columns:100%;padding:0}
  .sc[data-layout][data-mplace="overlay"] .sc-stage{grid-area:1/1;margin:0;height:min(128vw,86svh)}
  .sc[data-layout][data-mplace="overlay"]:not([data-layout="free"]) .sc-text{grid-area:1/1;grid-column:1;align-self:end;z-index:6;padding:0 20px 30px 26px}
  .sc[data-mplace="overlay"] .sc-shade{height:70%}
  .sc[data-hero][data-mplace="below"] .sc-text{order:3}
  .sc .ly[data-img][data-wide]{width:calc(var(--wmw) * 1%);left:calc(50% - var(--wmw) * .5%);height:auto;aspect-ratio:var(--war);top:calc(var(--my) * 1% + var(--mh) * .5% - var(--wmw) * .5vw / var(--war))}
  /* (a scene made words-below now reads words first: its words and pictures sit together in the middle of the screen) */
  .sc[data-mplace="below"]:not([data-hero]) .sc-pin{justify-content:center!important}.sc[data-mplace="below"]:not([data-hero]):not([data-pin]) .sc-pin{min-height:100svh}
  .sc-text[data-giant] .sc-heading{font-size:min(17vw,calc(var(--fit) * 1.1 / var(--lw)))}
  .sc[data-layout="giant-type"] .sc-stage{margin-top:-8vw}
  html[data-typo="giant"] .sc[data-layout] .sc-text[data-size="display"] .sc-heading{font-size:min(15vw,calc(var(--fit) / var(--lw)))}
  .sc-text[data-columns] .sc-body{columns:auto}
  html.cr-js .sc[data-pin][data-choreo="zoom-away"],html.cr-js .sc[data-pin][data-choreo="scale-through"]{height:calc(100svh + var(--pinv,110) * .6svh)}
  html.cr-js .sc[data-pin][data-steps]{height:min(calc(100svh + var(--steps,2) * var(--pinv,110) * .42svh),300svh)}
  .sc[data-pin][data-steps] .sc-pin{justify-content:flex-start}
  .sc[data-choreo="track"] .sc-stage[data-track]{position:relative;inset:auto;height:min(64vw,46svh);padding:0 12vw 0 6vw;margin:18px 0}
  .sc[data-choreo="track"] .ly[data-track]{height:100%}
  .sc[data-choreo="track"] .sc-pin::after{display:none}
  .sc[data-handoff="overlap"]{margin-top:-6vh}
  .sc[data-overlapped] .sc-pin{padding-bottom:calc(40px + 6vh)}.sc[data-overlapped]:not([data-pin]) .sc-pin{min-height:0}
  .sc[data-hold]{position:relative}
  .sc-count{right:18px;bottom:auto;top:calc(var(--nav) + 10px)}
  .sc[data-choreo="travel"] .ly:is([data-role="focal"],[data-role="subject"]){translate:calc((var(--p,.5) - .5) * 14vw) 0;rotate:calc((var(--p,.5) - .5) * 14deg)}
  .sc[data-choreo="depth"] .ly{translate:0 calc((.5 - var(--p,.5)) * var(--dz,0) * 12vh)}
  .sc[data-choreo="type-wipe"] .ly[data-kind="word"]{translate:calc((.5 - var(--p,.5)) * 40vw) 0}
}/* ===== the second vocabulary: the actor, campaigns and takeovers, chapters, card streams, expanding pictures ===== */
/* ===== the page as one timeline (timeline.js) =====
   Two fixed layers: behind the scenes' content, the backdrop (two colour sheets crossfading as the scroll passes from
   one scene's colour to the next) with the typography and background actors; in front, the picture actors and the
   transitions' own elements. The scenes an actor crosses are transparent over the backdrop, so they read as one
   surface. Each actor is one element: --ax/--ay (vw/vh from the centre), --as, --ar (deg), --ao, --sp (letter spread),
   written by the runtime from its keyframes -- translate, scale, rotate and opacity only. */
.cr-cast{position:fixed;inset:0;pointer-events:none;overflow:clip;display:none}
html.cr-js:not([data-motion="reduced"]) .cr-cast{display:block}
.cr-back{z-index:0}.cr-front{z-index:30}
main#main{z-index:1}
html.cr-js:not([data-motion="reduced"]) .sc[data-cast]{background:transparent!important}
html.cr-js:not([data-motion="reduced"]) .sc[data-cast] .sc-pin::before{display:none}
.cb{position:absolute;inset:0;background:var(--bg)}.cb-b{opacity:0}
.ca{position:absolute;left:50%;top:50%;translate:calc(-50% + var(--ax,0) * 1vw) calc(-50% + var(--ay,0) * 1vh);scale:var(--as,1);rotate:calc(var(--ar,0) * 1deg);opacity:var(--ao,0);will-change:translate,scale,rotate,opacity}
.ca[data-img]{height:54vh;height:54svh;aspect-ratio:var(--aa,.8);max-width:34vw}
.ca[data-role="secondary"]{height:44svh;max-width:28vw}
.ca-img{display:block;width:100%;height:100%;object-fit:contain;filter:drop-shadow(0 28px 34px rgba(0,0,0,.32))}
.ca.is-missing .ca-img{visibility:hidden}.ca .cr-missing{display:none}
.ca[data-role="typography"]{font-family:var(--display);font-weight:var(--dw);font-size:min(24vw,calc(170vw / var(--cn,8)));line-height:.82;letter-spacing:-.035em;white-space:nowrap;text-transform:uppercase}
.ca[data-style="ghost"] .ca-word{color:color-mix(in srgb,var(--ink) 13%,transparent)}
.ca[data-style="outline"] .ca-word{color:transparent;-webkit-text-stroke:max(2px,.012em) color-mix(in srgb,var(--accent) 80%,transparent)}
.ca[data-style="solid"] .ca-word{color:var(--accent)}
.ca-word .ch{display:inline-block;translate:calc((var(--ci,0) - (var(--cn,8) - 1) / 2) * var(--sp,0) * .45em) 0}
.ca[data-role="background"]{width:74vmin;height:74vmin}
.ca-shape{position:absolute;inset:0;border-radius:50%;background:radial-gradient(circle,color-mix(in srgb,var(--f,var(--accent)) 50%,transparent),transparent 68%)}
.ca-shape[data-fill="glow"]{--f:var(--glow)}.ca-shape[data-fill="ink"]{--f:var(--ink)}.ca-shape[data-fill="muted"]{--f:var(--muted)}
.ca-shape[data-form="ring"]{background:none;border:max(2px,.4vmin) solid color-mix(in srgb,var(--f,var(--accent)) 60%,transparent)}
.ca-shape[data-form="blob"]{border-radius:42% 58% 55% 45% / 48% 40% 60% 52%}
/* the actor at rest, when the cast does not play (no scripting, reduced motion): its first pose, in the scene it opens */
.actor-static{position:absolute;left:50%;top:50%;height:60vh;height:60svh;aspect-ratio:var(--aa,.8);max-width:38vw;translate:calc(-50% + var(--ax,0) * 1vw) calc(-50% + var(--ay,0) * 1vh);scale:var(--as,1);rotate:calc(var(--ar,0) * 1deg);z-index:4;pointer-events:none}
html.cr-js:not([data-motion="reduced"]) .actor-static{display:none}
.actor-img{display:block;width:100%;height:100%;object-fit:contain;filter:drop-shadow(0 28px 34px rgba(0,0,0,.32))}
.actor-static.is-missing .actor-img{visibility:hidden}.actor-static .cr-missing{display:none}
/* transitions with elements of their own: a panel wiping across the seam, a colour taking the screen over, a word that
   becomes the window onto the next scene's picture (--w: 0 -> 1 across the seam) */
.cs{position:absolute;inset:0;opacity:0}
.cs-wipe{background:var(--accent);translate:calc((1 - 2 * var(--w,0)) * 104%) 0;skew:-6deg 0;opacity:calc(min(1, var(--w,0) * 50) * min(1, (1 - var(--w,0)) * 50))}
.cs-take{background:var(--c,var(--accent));clip-path:circle(calc(var(--w,0) * 78%) at 50% 58%);opacity:calc(min(1, var(--w,0) * 50) * (1 - max(0, var(--w,0) - .86) * 7.1))}
.cs-mask{display:grid;place-items:center;opacity:calc(min(1, var(--w,0) * 50) * (1 - max(0, var(--w,0) - .9) * 10))}
.csm-word{font-family:var(--display);font-weight:var(--dw);font-size:min(26vw,calc(175vw / var(--cn,8)));line-height:.8;letter-spacing:-.04em;text-transform:uppercase;white-space:nowrap;background-size:cover;background-position:center;background-attachment:fixed;-webkit-background-clip:text;background-clip:text;color:transparent;scale:calc(.94 + min(.5, var(--w,0)) * .12)}
.csm-img{position:absolute;inset:0;background-size:cover;background-position:center;clip-path:circle(calc(max(0, var(--w,0) - .5) * 2 * 80%) at 50% 52%)}
/* the seams a scene takes part in: entered by a picture that grows from a window into the scene, a card that opens, or
   from depth; left toward the camera (--sn: arriving 0 -> 1, --sx: leaving 0 -> 1) */
.sc[data-seam-in="image-expand"] .ly:is([data-role="focal"],[data-role="subject"]) .ly-loop{clip-path:inset(calc((1 - var(--sn,1)) * var(--sit,30%)) calc((1 - var(--sn,1)) * var(--sir,34%)) calc((1 - var(--sn,1)) * var(--sib,30%)) calc((1 - var(--sn,1)) * var(--sil,34%)) round calc((1 - var(--sn,1)) * 22px))}
.sc[data-seam-in="card-expand"] .ly:is([data-role="focal"],[data-role="subject"]) .ly-loop{clip-path:inset(calc((1 - var(--sn,1)) * var(--sit,38%)) calc((1 - var(--sn,1)) * var(--sir,52%)) calc((1 - var(--sn,1)) * var(--sib,16%)) calc((1 - var(--sn,1)) * var(--sil,12%)) round calc((1 - var(--sn,1)) * 18px))}
/* the hero's premium video hands over: as the hero leaves it settles into its own still frame (the picture it was made
   from -- the picture the page continues with), so the page never cuts from a playing video to an unrelated scene */
.sc[data-vh] .ly-vid{opacity:calc(1 - min(1, var(--sx,0) * 1.6))}
/* the premium hero video shown full-bleed behind the hero (when its picture is not shown large in a frame of its own):
   unmistakably the opening's moving image, with the scene's own colour under the words so they stay readable */
/* ===== the premium arc (showcase: premium-arc.js): each moment's clip IS the screen -- 100% of the viewport, edge to
   edge, cover, never a card or a column; the words lie over it. How it ends is the next scene's beginning: the hero's
   subject freezes into its still while the world changes, the takeover pushes through toward the camera, the payoff
   settles and stays ===== */
.sc[data-pv]{min-height:100vh;min-height:100svh}
html .sc[data-pv][data-pv] .sc-stage{position:absolute;inset:0;margin:0;height:auto}
.sc[data-pv] .ly[data-role="focal"],.sc[data-pv] .ly[data-role="subject"]{left:0;top:0;width:100%;height:100%;rotate:0deg}
/* (a composition's window never keeps a premium clip small: the clip arrives through the seam -- --sn, below -- and then
   owns the whole screen, whatever the composition's planes were doing) */
html .sc[data-pv][data-pv] .ly:is([data-role="focal"],[data-role="subject"]){clip-path:none!important}
.sc[data-pv] .ly[data-role="focal"] :is(.ly-img,.ly-vid){width:100%;height:100%;object-fit:cover}
.sc[data-pv] .sc-text{position:relative;z-index:6}
.sc[data-pvend="freeze-subject"] .ly-vid{opacity:calc(1 - min(1, var(--sx,0) * 1.6))}
html.cr-js:not([data-motion="reduced"]) .sc[data-pvend="push-through"] .ly[data-role="focal"] .ly-loop{scale:calc(1 + var(--sx,0) * .32);opacity:calc(1 - max(0, var(--sx,0) - .45) * 1.8);transform-origin:50% 50%}
html.cr-js:not([data-motion="reduced"]) .sc[data-pv]:not([data-pv="hero"]) .ly[data-role="focal"] .ly-loop{clip-path:inset(calc((1 - var(--sn,1)) * 14%) calc((1 - var(--sn,1)) * 18%) round calc((1 - var(--sn,1)) * 24px))}
html.cr-js:not([data-motion="reduced"]) .sc[data-pvafter] .sc-ghost{opacity:.22}
@media (max-width:720px){
  .sc[data-pv] .sc-pin{min-height:100svh;display:flex;flex-direction:column;justify-content:flex-end;padding:calc(var(--nav) + 12px) 0 34px}
  /* (stronger than every layout's own phone stage height: a premium moment's stage is the whole screen) */
  html .sc[data-pv][data-pv] .sc-stage{position:absolute;inset:0;height:auto;margin:0;grid-area:auto}
  html .sc[data-pv][data-pv] .ly-vid{object-position:var(--moq,var(--oq,50% 50%))}
  html .sc[data-pv][data-pv] .ly[data-role="focal"],html .sc[data-pv][data-pv] .ly[data-role="subject"]{left:0;top:0;width:100%;height:100%}
  .sc[data-pv] .ly:not([data-role="focal"]):not([data-role="subject"]){display:none}
  .sc[data-pv] .sc-text{order:3}
  .sc[data-pv] .sc-shade{display:block;top:auto;bottom:0;left:0;right:0;width:auto;height:62%;background:linear-gradient(180deg,transparent,color-mix(in srgb,var(--s-surface,var(--bg)) 80%,transparent) 60%,color-mix(in srgb,var(--s-surface,var(--bg)) 90%,transparent))}
}
.sc-herovid{position:absolute;inset:0;z-index:1;overflow:hidden;pointer-events:none}
.sc-herovid :is(video,img){position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.sc-herovid .shv-still{display:none}
.sc-herovid::after{content:"";position:absolute;inset:0;background:linear-gradient(90deg,color-mix(in srgb,var(--s-surface) 82%,transparent) 0%,color-mix(in srgb,var(--s-surface) 35%,transparent) 42%,transparent 68%),linear-gradient(0deg,color-mix(in srgb,var(--s-surface) 75%,transparent),transparent 32%)}
.sc[data-vh] .sc-herovid video{opacity:calc(1 - min(1, var(--sx,0) * 1.6))}
html[data-motion="reduced"] .sc-herovid video{display:none}html[data-motion="reduced"] .sc-herovid .shv-still{display:block}
@media (prefers-reduced-motion:reduce){.sc-herovid video{display:none}.sc-herovid .shv-still{display:block}}
@media (max-width:720px){.sc-herovid video{inset:auto;left:-8%;top:57%;width:116%;height:auto;max-height:100%;transform:translateY(-50%);object-fit:contain;-webkit-mask-image:linear-gradient(to bottom,transparent,#000 16%,#000 84%,transparent);mask-image:linear-gradient(to bottom,transparent,#000 16%,#000 84%,transparent)}.sc-herovid .shv-still{object-fit:contain}}
/* ===== one surface (continuity contracts): the scenes are transparent over the fixed backdrop, whose colour flows from
   each scene's picture-driven colour into the next across the seam's overlap -- no "new section, new block" edge ===== */
html.cr-js[data-flowall]:not([data-motion="reduced"]) .sc{background:transparent!important}
html.cr-js[data-flowall]:not([data-motion="reduced"]) .sc .sc-pin::before,html.cr-js[data-flowall]:not([data-motion="reduced"]) .amb-vig{display:none}
html.cr-js[data-flowall]:not([data-motion="reduced"]) :is(.sc-amb,.sc-world){-webkit-mask-image:linear-gradient(180deg,transparent,#000 18%,#000 82%,transparent);mask-image:linear-gradient(180deg,transparent,#000 18%,#000 82%,transparent)}
html.cr-js[data-flowall]:not([data-motion="reduced"]) .sc-backdrop{background:radial-gradient(ellipse 70% 60% at 72% 28%,color-mix(in srgb,var(--s-accent,var(--accent)) 18%,transparent),transparent 70%)!important}
html[data-flowall] .cb{background:radial-gradient(58% 52% at 76% 28%,color-mix(in srgb,var(--cbg,transparent) 30%,transparent),transparent 72%),radial-gradient(130% 100% at 70% 12%,color-mix(in srgb,var(--cbc,var(--bg)) 82%,#fff 18%),var(--cbc,var(--bg)) 52%,color-mix(in srgb,var(--cbc,var(--bg)) 72%,#000) 100%)}
/* a colour handoff spans its seam (data-pal: it opens before the seam and closes after the next scene has begun); a sweep
   is the next colour rising from below as a soft front, not a uniform fade */
html[data-flowall] .cb-b[data-mode="sweep"]{-webkit-mask-image:linear-gradient(0deg,#000 calc(var(--t,0) * 160% - 60%),transparent calc(var(--t,0) * 160%));mask-image:linear-gradient(0deg,#000 calc(var(--t,0) * 160% - 60%),transparent calc(var(--t,0) * 160%))}
/* the carried subject: one element travelling between the two scenes' pictures; the outgoing shot turns into the next */
.cs-carry{inset:auto;left:0;top:0;width:0;height:0;border-radius:14px;overflow:hidden;filter:drop-shadow(0 26px 34px rgba(0,0,0,.35));will-change:left,top,width,height}
.cs-carry img{position:absolute;inset:0;width:100%;height:100%}.cs-carry .csc-b{opacity:0}
.cs-carry:is([data-carry="light"],[data-carry-live="light"]){filter:none}
/* the direction of motion across a seam: the scene arrives along the incoming vector and leaves along the outgoing one */
.sc[data-vin="lr"]{--vi:-1}.sc[data-vin="rl"]{--vi:1}.sc[data-vout="lr"]{--vo:1}.sc[data-vout="rl"]{--vo:-1}
html.cr-js[data-flowall]:not([data-motion="reduced"]) .sc:is([data-vin],[data-vout]) .sc-stage{translate:calc(((1 - var(--sn,1)) * var(--vi,0) * var(--vamp,14) + var(--sx,0) * var(--vo,0) * var(--vamp,14) * .85) * 1vw) 0}
html.cr-js[data-flowall]:not([data-motion="reduced"]) .sc[data-vin="in"]:not([data-seam-in]) .sc-stage{scale:calc(.84 + var(--sn,1) * .16)}
html.cr-js[data-flowall]:not([data-motion="reduced"]) .sc[data-vout="in"]:not([data-seam-out]) .sc-stage{scale:calc(1 + var(--sx,0) * .18)}
html.cr-js[data-flowall]:not([data-motion="reduced"]) .sc[data-vin="out"]:not([data-seam-in]) .sc-stage{scale:calc(1.14 - var(--sn,1) * .14)}
/* a rest scene's echo: its own picture (or the page's main picture) dim and soft behind it, drifting slowly */
.sc-ghost{position:absolute;inset:-4%;z-index:1;pointer-events:none;overflow:hidden;opacity:.24;-webkit-mask-image:radial-gradient(ellipse 78% 72% at 50% 50%,#000 30%,transparent 80%);mask-image:radial-gradient(ellipse 78% 72% at 50% 50%,#000 30%,transparent 80%)}
.sc-ghost img{display:block;width:100%;height:100%;object-fit:cover;filter:blur(16px) saturate(.9);scale:1.1}
html.cr-js:not([data-motion="reduced"]) .sc-ghost img{translate:0 calc((var(--p,.5) - .5) * -5vh)}
.sc[data-callback] .sc-ghost{opacity:.3}
/* words placed in a full-bleed picture's empty side are shaded from that side */
.sc-shade[data-shade="left"],.sc-shade[data-shade="right"]{top:0;bottom:0;height:auto;width:60%;background:linear-gradient(90deg,color-mix(in srgb,var(--s-surface,var(--bg)) 90%,transparent),color-mix(in srgb,var(--s-surface,var(--bg)) 55%,transparent) 55%,transparent)}
.sc-shade[data-shade="left"]{left:0;right:auto}.sc-shade[data-shade="right"]{right:0;left:auto;background:linear-gradient(270deg,color-mix(in srgb,var(--s-surface,var(--bg)) 90%,transparent),color-mix(in srgb,var(--s-surface,var(--bg)) 55%,transparent) 55%,transparent)}
.sc-shade[data-shade="top"]{top:0;bottom:auto;height:58%;background:linear-gradient(180deg,color-mix(in srgb,var(--s-surface,var(--bg)) 92%,transparent),transparent)}
.sc-text[data-v][data-align="right"] :is(.sc-body,.sc-list),.sc-text[data-v][data-align="right"][data-width="narrow"] .sc-heading{margin-left:auto}
/* on a phone those words sit at the foot of the picture, left-aligned: the shade follows them there (a side band would
   only wash over the picture -- and its subject -- while the words sat below it) */
@media (max-width:720px){.sc[data-mplace] .sc-shade:is([data-shade="left"],[data-shade="right"],[data-shade="top"]){top:auto;bottom:0;left:0;right:0;width:auto;height:46%;background:linear-gradient(180deg,transparent,color-mix(in srgb,var(--s-surface,var(--bg)) 76%,transparent) 55%,color-mix(in srgb,var(--s-surface,var(--bg)) 94%,transparent))}.sc[data-mplace="overlay"] .sc-text[data-align="right"]{text-align:left}.sc[data-mplace="overlay"] .sc-text[data-align="right"] :is(.sc-body,.sc-list){margin-left:0}}
/* phones keep the same story, smaller: shorter travel, no blur, a softer echo */
@media (max-width:720px){.sc{--vamp:5}.sc-ghost{opacity:.16}.cs-carry{filter:none}}
/* a wipe is a band of the next scene's colour sweeping across, never a flat slab covering the screen */
html[data-flowall] .cs-wipe{background:linear-gradient(100deg,transparent 0%,color-mix(in srgb,var(--c,var(--accent)) 65%,transparent) 24%,var(--c,var(--accent)) 50%,color-mix(in srgb,var(--c,var(--accent)) 65%,transparent) 76%,transparent 100%);skew:-12deg 0}
/* full-bleed pictures and text bands melt into the flowing colour at their top and bottom edges: a scene's picture
   rises out of the last scene's colour instead of starting on a hard line */
html.cr-js[data-flowall]:not([data-motion="reduced"]) .ly[data-frame="bleed"],html.cr-js[data-flowall]:not([data-motion="reduced"]) .sc[data-layout="chapters"] .ly{-webkit-mask-image:linear-gradient(180deg,transparent 0,#000 16%,#000 84%,transparent 100%);mask-image:linear-gradient(180deg,transparent 0,#000 16%,#000 84%,transparent 100%)}
html.cr-js[data-flowall]:not([data-motion="reduced"]) .sc-shade{-webkit-mask-image:linear-gradient(180deg,#000 72%,transparent);mask-image:linear-gradient(180deg,#000 72%,transparent)}
/* words tied to their picture: they come out of the picture's side as the scene arrives */
.sc[data-tie="right"]{--td:1}.sc[data-tie="left"]{--td:-1}
@media (min-width:721px){html.cr-js[data-flowall]:not([data-motion="reduced"]) .sc[data-tie] .sc-text{translate:calc((1 - var(--sn,1)) * var(--td,0) * 7vw) 0}}
/* depth: the leaving scene moves toward the camera and goes soft; the next arrives from far behind and sharpens */
.sc[data-seam-out="depth-handoff"] .sc-stage{scale:calc(1 + var(--sx,0) * .3);opacity:calc(1 - var(--sx,0) * .9);filter:blur(calc(var(--sx,0) * 6px))}
.sc[data-seam-in="depth-handoff"] .sc-stage{scale:calc(.76 + var(--sn,1) * .24);filter:blur(calc((1 - var(--sn,1)) * 5px))}
@media (max-width:720px){.sc[data-seam-out="depth-handoff"] .sc-stage{scale:calc(1 + var(--sx,0) * .12);filter:none}.sc[data-seam-in="depth-handoff"] .sc-stage{scale:calc(.9 + var(--sn,1) * .1);filter:none}}
/* a scene's flood: its previous colour fades from over it, or a circle of its new colour grows across it */
.sc-bgx{position:absolute;inset:0;z-index:0;background:var(--from,var(--bg));pointer-events:none}
.sc-take{position:absolute;inset:0;z-index:0;background:var(--s-surface,var(--accent));pointer-events:none}
.sc[data-persp] .sc-pin{perspective:1100px}
${beatCss()}
.sc[data-layout="stage"] .sc-text{z-index:9}
/* a campaign: the name huge and centred over its subject, the scene flooded in the accent colour */
.sc[data-layout="campaign"] .sc-heading{font-size:min(clamp(3.2rem,11vw,12rem),calc(var(--fit) * 1.05 / var(--lw)));line-height:.86;letter-spacing:-.03em}
/* a typographic takeover: one statement set large, filling in word by word as it is read */
.sc[data-layout="takeover"] .sc-text[data-v] .sc-body{font-family:var(--display);font-weight:var(--dw);font-size:min(clamp(1.7rem,4.2vw,4.4rem),6.4vh);line-height:1.08;letter-spacing:-.015em;color:var(--s-ink,var(--ink));max-width:24ch}
.sc[data-layout="takeover"] .sc-text[data-v] .sc-body[data-blen="m"]{font-size:min(clamp(1.5rem,3.1vw,3.3rem),5vh);max-width:30ch}.sc[data-layout="takeover"] .sc-text[data-v] .sc-body[data-blen="l"]{font-size:min(clamp(1.3rem,2.2vw,2.4rem),3.8vh);max-width:40ch}
.sc[data-layout] .sc-text[data-treatment="word-fill"]:has(.sc-body) .sc-heading{font-family:var(--body)!important;font-size:clamp(.9rem,1.1vw,1.05rem)!important;font-weight:700!important;letter-spacing:.16em!important;text-transform:uppercase;line-height:1.3!important;color:var(--s-muted,var(--muted));max-width:none}
.wf{opacity:calc(.16 + .84 * clamp(0, var(--pe,1) * (var(--wn,10) + 2) - var(--i,0), 1))}
/* letters that spread apart and gather as the scene arrives (translate only; the scene clips them) */
.sc-heading .lw{display:inline-block;white-space:nowrap}
.sc-text[data-treatment="letter-spread"] .ch{display:inline-block;translate:calc((var(--ci,0) - (var(--cn,8) - 1) / 2) * max(0, 1 - var(--p,1) * 2.2) * .22em) 0}
/* an outlined headline */
.sc-text[data-treatment="outline"] .sc-heading{color:transparent;-webkit-text-stroke:max(1.5px,.018em) var(--s-ink,var(--ink))}
/* a kicker that runs up the edge beside the words */
@media (min-width:721px){.sc-text[data-treatment="vertical"]>.sc-kicker{position:absolute;right:calc(100% + clamp(12px,1.4vw,22px));top:0;writing-mode:vertical-rl;rotate:180deg;margin:0;white-space:nowrap;letter-spacing:.3em;border:0;padding:0}}
/* chapters: full-bleed pictures crossfading while the scroll holds, each settling with a slight, bounded push */
.sc[data-choreo="chapters"] .ly[data-step]{transition:opacity 1s var(--ease,ease),scale 1.8s var(--ease,ease)}
html.cr-js .sc[data-choreo="chapters"] .ly[data-step].is-on{scale:1.04}
.sc[data-choreo="chapters"] .sc-item{font-family:var(--display);font-weight:var(--dw);font-size:clamp(1.25rem,2.3vw,2.1rem);line-height:1.15;color:var(--s-ink,var(--ink))}
/* a card stream: framed pictures in depth, each coming forward and passing as the scroll holds (the last one stays) */
.sc[data-choreo="cardstream"] .ly[data-seq]{--t:clamp(-2, calc(var(--pe,0) * (var(--n,3) - 1) - var(--sq,0)), 1.2);translate:0 calc(var(--t) * -7vh);scale:calc(1 + var(--t) * .1);opacity:calc(var(--op) * (1 - max(0, var(--t) - .35) * 1.6))}
html.cr-js .sc[data-pin]:is([data-choreo="cardstream"],[data-choreo="expand"]){height:calc(100vh + var(--pinv,110) * 1.3vh)}
/* an expanding picture: laid out at full bleed and first seen through its own window, which opens to fill the scene --
   the picture itself is never enlarged; the words sit on a panel of the scene's colour over it */
.sc[data-choreo="expand"] .ly[data-win] .ly-loop{clip-path:inset(calc((1 - var(--pe,1)) * var(--wy,10) * 1%) calc((1 - var(--pe,1)) * (100 - var(--wx,10) - var(--ww,80)) * 1%) calc((1 - var(--pe,1)) * (100 - var(--wy,10) - var(--wh,80)) * 1%) calc((1 - var(--pe,1)) * var(--wx,10) * 1%) round calc((1 - var(--pe,1)) * 22px))}
.sc[data-choreo="expand"] .sc-text{background:color-mix(in srgb,var(--s-surface,var(--bg)) 86%,transparent);padding:clamp(16px,2vw,30px);border-radius:14px}
/* object and text orbit: the lines placed either side of the subject */
@media (min-width:721px){
  .sc[data-layout="orbit"] .sc-text[data-v]{grid-column:2 / 14;align-self:stretch;display:flex;flex-direction:column;min-height:calc(100vh - var(--nav) - 12vh)}
  .sc[data-layout="orbit"] .sc-text[data-v] .sc-list{flex:1;display:grid;grid-template-columns:minmax(0,1fr) 34% minmax(0,1fr);grid-auto-rows:1fr;column-gap:4%;align-items:center;max-width:none;margin-top:2vh}
  .sc[data-layout="orbit"] .sc-item{max-width:30ch}
  .sc[data-layout="orbit"] .sc-item:nth-child(odd){grid-column:1;justify-self:end;text-align:right}
  .sc[data-layout="orbit"] .sc-item:nth-child(even){grid-column:3;justify-self:start}
}
/* a lineup stands on its floor; a scrapbook's pictures are taped down */
.sc[data-layout="lineup"] .ly[data-kind="image"] .ly-art{filter:drop-shadow(0 18px 16px rgba(0,0,0,.26))}
.shape[data-form="tape"]{background:color-mix(in srgb,var(--f) 58%,transparent);border-radius:2px;filter:none!important;box-shadow:0 1px 3px rgba(0,0,0,.16)}
/* how a scene's own content leaves as it scrolls away (only a scene the scroll already drives, never a held one) */
.sc[data-exit]:not([data-pin]) :is(.sc-stage,.sc-text){--xe:clamp(0, (var(--p,0) - .7) * 3.4, 1)}
.sc[data-exit="fade"]:not([data-pin]) :is(.sc-stage,.sc-text){opacity:calc(1 - var(--xe) * .85)}
.sc[data-exit="lift"]:not([data-pin]) :is(.sc-stage,.sc-text){translate:0 calc(var(--xe) * -12vh)}
.sc[data-exit="shrink"]:not([data-pin]) .sc-stage{scale:calc(1 - var(--xe) * .14)}
.sc[data-exit="shrink"]:not([data-pin]) .sc-text{opacity:calc(1 - var(--xe) * .7)}
/* phones: the actor stands in the top of the screen, its scene's words below it; every movement is smaller */
@media (max-width:720px){
  html{--mk:.5}
  .ca[data-img],.actor-static{top:calc(var(--nav) + 1svh);height:36svh;max-width:88vw;translate:calc(-50% + var(--ax,0) * .35vw + (max(var(--ax,0), 34) - 34) * 2.4vw + (min(var(--ax,0), -34) + 34) * 2.4vw) calc(var(--ay,0) * .3vh);rotate:clamp(-8deg, calc(var(--ar,0) * 1deg), 8deg)}
  .ca[data-role="secondary"],.ca[data-role="background"]{display:none}
  html.cr-js:not([data-motion="reduced"]) .sc[data-actor] .sc-pin{padding-top:calc(var(--nav) + 40svh)}
  html.cr-js:not([data-motion="reduced"]) .sc[data-actor] .sc-stage{display:none}
  .ca[data-role="typography"]{translate:calc(-50% + var(--ax,0) * .4vw) calc(-50% + var(--ay,0) * .5vh);font-size:min(30vw,calc(150vw / var(--cn,8)))}
  .ca-word .ch{translate:calc((var(--ci,0) - (var(--cn,8) - 1) / 2) * var(--sp,0) * .18em) 0}
  .cs-wipe{skew:0deg 0}
  .sc[data-layout="stage"] .sc-stage{height:38svh}
  .sc[data-layout="takeover"] .sc-text[data-v] .sc-body{font-size:clamp(1.5rem,7.4vw,2.4rem);max-width:none;margin-inline:0}.sc[data-layout="takeover"] .sc-text[data-v] .sc-body[data-blen="m"]{font-size:clamp(1.3rem,6vw,2rem);max-width:none}.sc[data-layout="takeover"] .sc-text[data-v] .sc-body[data-blen="l"]{font-size:clamp(1.1rem,4.8vw,1.6rem);max-width:none}
  .sc[data-choreo="cardstream"] .ly[data-seq]{translate:0 calc(var(--t) * -3vh);scale:calc(1 + var(--t) * .06)}
  html.cr-js .sc[data-pin]:is([data-choreo="cardstream"],[data-choreo="expand"]){height:calc(100svh + var(--pinv,110) * .8svh)}
  .sc[data-choreo="expand"] .sc-text{background:none;padding:0}
  .sc[data-exit="lift"]:not([data-pin]) :is(.sc-stage,.sc-text){translate:0 calc(var(--xe) * -5vh)}
  .sc[data-exit="shrink"]:not([data-pin]) .sc-stage{scale:calc(1 - var(--xe) * .08)}
  .sc-text[data-treatment="letter-spread"] .ch{translate:calc((var(--ci,0) - (var(--cn,8) - 1) / 2) * max(0, 1 - var(--p,1) * 2.2) * .1em) 0}
}

/* reduced motion (and no scripting): the finished composition of every choreography */
html[data-motion="reduced"] .ly{translate:none!important;scale:none!important;rotate:none!important}
html[data-motion="reduced"] .ly-scroll{translate:none!important}
html[data-motion="reduced"] .ly-loop{clip-path:none!important}
html[data-motion="reduced"] .sc-heading{clip-path:none!important;translate:none!important}
html[data-motion="reduced"] .sc[data-hold]{position:relative}
html[data-motion="reduced"] .sc[data-bleed]{background:var(--s-surface)!important}
html[data-motion="reduced"] .sc-count{display:none}
:is(html[data-motion="reduced"],html:not(.cr-js)) .sc[data-choreo="track"] .sc-stage[data-track]{position:relative;inset:auto;grid-column:1 / -1;grid-row:2;width:auto;max-width:100%;overflow-x:auto;transform:none!important;padding:0 5vw;height:min(60vh,64vw);scroll-snap-type:x mandatory}
:is(html[data-motion="reduced"],html:not(.cr-js)) .sc[data-choreo="track"] .ly[data-track]{scroll-snap-align:start}
:is(html[data-motion="reduced"],html:not(.cr-js)) .sc[data-choreo="track"] .sc-pin::after{display:none}
/* (the second vocabulary at rest: every word filled, letters gathered, cards dealt as a deck, the first chapter shown with
   all its titles, nothing leaving; a held scene is only as tall as its composition, its lines listed one under another) */
html[data-motion="reduced"] .sc-text .ch{translate:none!important}
html[data-motion="reduced"] .wf{opacity:1!important}
html[data-motion="reduced"] .sc[data-exit] :is(.sc-stage,.sc-text){opacity:1!important;translate:none!important;scale:none!important}
html[data-motion="reduced"] .sc[data-choreo="cardstream"] .ly[data-seq]{opacity:var(--op)!important}
:is(html[data-motion="reduced"],html:not(.cr-js)) .sc[data-choreo="chapters"] .ly[data-step]:not([data-step="0"]){opacity:0!important}
:is(html[data-motion="reduced"],html:not(.cr-js)) .sc[data-choreo="chapters"] .ly[data-step]{translate:none!important;rotate:none!important;scale:none!important}
html[data-motion="reduced"] .sc[data-pin][data-pin]{height:auto!important}
html[data-motion="reduced"] .sc[data-steps] .sc-item{grid-area:auto!important}
/* ---- motion-first compositions (composition.js): planes moved by one camera; the composition's own scene length */
html.cr-js .sc[data-pin][data-choreo="compose"]{height:190vh}
.sc[data-comp] [data-plane]{transform-origin:50% 50%;will-change:transform}
.sc[data-comp] .ly[data-plane]{opacity:calc(var(--op,1) * var(--ko,1))}.sc[data-comp] .sc-text[data-plane]{opacity:var(--ko,1)}
.sc[data-comp="perspective-lineup"] .sc-stage{perspective:1500px}
/* what dominates is never a card: the focal of a composition carries no frame chrome; a wall's tiles meet edge to edge */
.sc[data-comp]:not([data-comp="tunnel-stage"]):not([data-comp="perspective-lineup"]) .ly[data-role="focal"] .ly-art,.sc[data-comp]:not([data-comp="tunnel-stage"]):not([data-comp="perspective-lineup"]) .ly[data-role="subject"] .ly-art{border-radius:0;box-shadow:none;border:0;padding:0;background:none}
.sc[data-layout="image-wall"] .ly[data-kind="image"] .ly-art{border-radius:0;box-shadow:none;border:0;padding:0}
.sc[data-layout="canvas"] .ly[data-kind="image"] .ly-art{border-radius:2px;box-shadow:0 40px 80px -30px rgba(0,0,0,.55)}
.sc[data-layout="object-stage"] .ly[data-kind="word"],.sc[data-layout="type-stage"] .ly[data-kind="word"],.sc[data-layout="mask-stage"] .ly[data-kind="word"]{display:flex;align-items:center;justify-content:center}
/* the words serve the visual event: a label is small and sits at the edge; giant type is the visual; copy beyond what the
   role shows is a caption revealed late; a scene's lines are micro-labels (a breath keeps ordinary reading copy) */
.sc[data-comp] .sc-text[data-role="label"]{max-width:min(36rem,40vw)}
.sc[data-comp] .sc-text[data-copy="caption"] .sc-body{font-size:clamp(13px,1vw,15px);line-height:1.5;max-width:36ch;opacity:clamp(0,calc((var(--p,1) - .42) * 4),1);letter-spacing:.01em}
.sc[data-comp] .sc-text:not([data-role="reading"]) .sc-list{font-size:12px;letter-spacing:.08em;text-transform:uppercase;max-width:44ch;opacity:.86}
.sc[data-comp] .sc-text:not([data-role="reading"]) .sc-list .sc-item{margin:.2em 0}
.sc-text[data-act="word-stack"] .sc-heading .w{display:block;line-height:.88}
.sc-text[data-act="baseline"] .sc-heading .w{display:inline-block}.sc-text[data-act="baseline"] .sc-heading .w:nth-child(odd){translate:0 calc((1 - var(--p,1)) * -.32em)}.sc-text[data-act="baseline"] .sc-heading .w:nth-child(even){translate:0 calc((1 - var(--p,1)) * .32em)}
/* a word mask: the picture is seen only through the giant words until they pass the camera */
/* (an opening seen only through its words showed a pale screen until it was scrolled: the photo is there from the first frame,
   soft and full-bleed behind the words, and the words still carry it) */
.sc[data-hero][data-comp="mask-stage"]::before{content:"";position:absolute;inset:0;z-index:0;pointer-events:none;background:var(--mimg) 50% 50%/cover no-repeat;opacity:.26;-webkit-mask-image:radial-gradient(ellipse 85% 75% at 50% 50%,#000 35%,transparent 85%);mask-image:radial-gradient(ellipse 85% 75% at 50% 50%,#000 35%,transparent 85%)}
.sc[data-comp="mask-stage"] :is(.sc-text[data-giant] .sc-heading,.ly[data-kind="word"] .ly-word){background:var(--mimg) 50% 50%/cover no-repeat;-webkit-background-clip:text;background-clip:text;color:transparent;-webkit-text-fill-color:transparent;-webkit-text-stroke:max(1px,.014em) color-mix(in srgb,var(--s-ink,currentColor) 72%,transparent);paint-order:stroke fill}
/* (a heading whose words swap: each version is its own window onto the picture -- a window cut through the whole heading
   would show the hidden version too, both sets of letters at once) */
/* (the words of a mask stage still grow toward the camera where the scene rests: they are set to fit the screen at that size) */
html .sc[data-comp="mask-stage"] .sc-text[data-giant] .sc-heading[data-len]{font-size:min(13vw,calc(var(--fit) * .86 / var(--lw)))}
/* (on a phone the words are the window in the middle of the picture, sized to the narrow screen -- never a caption at its foot) */
@media (max-width:720px){html .sc[data-comp="mask-stage"] .sc-text[data-giant] .sc-heading[data-len]{font-size:min(24vw,calc(var(--fit) * .9 / var(--lwm,var(--lw))))}.sc[data-layout][data-comp="mask-stage"][data-mplace="overlay"]:not([data-layout="free"]) .sc-text[data-giant]{align-self:center;padding:0 16px}}
.sc[data-comp="mask-stage"] .sc-text[data-giant] .sc-heading:has(.hs){background:none}.sc[data-comp="mask-stage"] .sc-text[data-giant] .sc-heading .hs>span{background:var(--mimg) 50% 50%/cover no-repeat;-webkit-background-clip:text;background-clip:text;color:transparent;-webkit-text-fill-color:transparent}
.sc-shade[data-shade="center"]{inset:0;height:auto;background:radial-gradient(ellipse 72% 58% at 50% 50%,color-mix(in srgb,var(--s-surface,var(--bg)) 74%,transparent),transparent 78%)}
@media (max-width:720px){html.cr-js .sc[data-pin][data-choreo="compose"]{height:160svh}.sc[data-comp] .sc-text[data-role="label"]{max-width:none}}
html[data-motion="reduced"] .sc[data-comp][data-pin]{height:auto}
`;

const ART_RUNTIME = `
(function(){
var d=document,html=d.documentElement,W=window,cfg={};try{cfg=JSON.parse(d.getElementById('cr-scene').textContent)}catch(e){}
function reduced(){return html.getAttribute('data-motion')==='reduced'}
function cl(v){return v<0?0:v>1?1:v}
var EZ={ss:function(t){return t*t*(3-2*t)},io:function(t){return t<.5?16*t*t*t*t*t:1-Math.pow(-2*t+2,5)/2},ob:function(t){var a=1.70158,b=a+1;return 1+b*Math.pow(t-1,3)+a*Math.pow(t-1,2)}};
var ease=({kinetic:EZ.io,mechanical:EZ.io,playful:EZ.ob,chaotic:EZ.ob})[cfg.personality]||EZ.ss;
/* each choreography plays over its own part of the scene's progress */
var WIN={'zoom-away':[0,.8],'scale-through':[0,.85],'mask-reveal':[.04,.42],'type-wipe':[.06,.4],cardstream:[.04,.96],expand:[.05,.72]};
var all=[].slice.call(d.querySelectorAll('.sc')),scenes=all.filter(function(s){return s.hasAttribute('data-p')});
scenes.forEach(function(s){s._bw=(s.getAttribute('data-beats')||'').split(';').filter(Boolean).map(function(t){return t.split(',').map(Number)});s._seam=s.hasAttribute('data-seam-in')||s.hasAttribute('data-seam-out')||s.hasAttribute('data-vh')||s.hasAttribute('data-tie')||s.hasAttribute('data-vin')||s.hasAttribute('data-vout')||s.hasAttribute('data-pv');s._ch=s.getAttribute('data-choreo');s._steps=+s.getAttribute('data-steps')||0;s._track=s.querySelector('.sc-stage[data-track]');s._items=[].slice.call(s.querySelectorAll('.sc-item'));s._ly=[].slice.call(s.querySelectorAll('.ly[data-step]'));s._count=s.querySelector('.sc-count b');s._wf=!!s.querySelector('[data-treatment="word-fill"]');s._ct=s.hasAttribute('data-comp');s._i=-1;s._next=all[all.indexOf(s)+1]||null});
function prog(s,vh,y){var top=s._top-y;if(s.hasAttribute('data-pin')){var span=s._h-vh;return span>0?cl(-top/span):0}return cl((vh-top)/(vh+s._h))}
/* the page as one timeline: g = scene index + progress through that scene (0 when its top reaches the top of the screen,
   1 when its bottom does), from the cached geometry. Each actor samples its keyframes at g -- one track, so a scene's end
   state is the next scene's start state -- and writes its numbers only when they change. The backdrop crossfades from
   one scene's colour to the next as the seam approaches; a transition's own element plays across its seam (--w). */
var EZT={smooth:EZ.ss,snap:function(t){return t<.5?16*Math.pow(t,5):1-Math.pow(-2*t+2,5)/2},spring:function(t){var c=1.4;return 1+(c+1)*Math.pow(t-1,3)+c*Math.pow(t-1,2)}};
var castEls=[].slice.call(d.querySelectorAll('.ca[data-keys]')).map(function(el){return{el:el,from:+el.getAttribute('data-from'),to:+el.getAttribute('data-to'),e:EZT[el.getAttribute('data-ease')]||EZT.smooth,K:el.getAttribute('data-keys').split(';').map(function(t){return t.split(',').map(Number)}),k:''}});
var seamEls=[].slice.call(d.querySelectorAll('.cs[data-at]')).map(function(el){return{el:el,at:+el.getAttribute('data-at'),lead:+el.getAttribute('data-lead')||.4,span:+el.getAttribute('data-span')||.5,end:+el.getAttribute('data-end')||0,w:-1,carry:el.classList.contains('cs-carry')}});
var cb=d.querySelector('.cb-a'),cb2=d.querySelector('.cb-b'),BA='',BB='',BT=-1,BM='';
var MAXY=0;
function G(y){var n=all.length,k=0;if(!n||all[0]._top==null)return 0;for(var i=0;i<n;i++){if(all[i]._top<=y+1)k=i;else break}var s=all[k];return k+cl((y-s._top)/Math.max(1,s._h))}
function sample(A,g){var K=A.K,n=K.length,i=0;if(g<=K[0][0])return K[0];if(g>=K[n-1][0])return K[n-1];while(i<n-2&&K[i+1][0]<g)i++;var a=K[i],b=K[i+1],t=A.e((g-a[0])/Math.max(1e-6,b[0]-a[0])),o=[g];for(var j=1;j<a.length;j++)o.push(a[j]+((b[j]==null?a[j]:b[j])-a[j])*t);return o}
function frameCast(y,red){if(red||(!castEls.length&&!seamEls.length&&!cb))return;var g=G(y);
  castEls.forEach(function(A){var on=g>=A.from-.6&&g<=A.to+1.25,v=on?sample(A,g):null,key=v?v[1].toFixed(2)+'|'+v[2].toFixed(2)+'|'+v[3].toFixed(3)+'|'+v[4].toFixed(2)+'|'+cl(v[5]).toFixed(2)+'|'+(v[6]==null?'':v[6].toFixed(2)):'off';if(key===A.k)return;A.k=key;var st=A.el.style;
    if(!v){st.setProperty('--ao','0');return}st.setProperty('--ax',v[1].toFixed(2));st.setProperty('--ay',v[2].toFixed(2));st.setProperty('--as',v[3].toFixed(3));st.setProperty('--ar',v[4].toFixed(2));st.setProperty('--ao',cl(v[5]).toFixed(2));if(v[6]!=null)st.setProperty('--sp',cl(v[6]).toFixed(3))});
  if(cb){var n=all.length,k=Math.max(0,Math.min(n-1,Math.floor(g))),j=0,t=0,mode='blend',P,f0;
    /* the seam whose colour window holds g (data-pal: from,to around the seam, and how): it opens while the last scene is
       still on screen and closes after the next has begun -- before that window the last scene's colour, after it the next */
    if(k+1<n){P=pal(all[k+1]);f0=k+1+P[0];if(g>=f0){j=k+1;t=(g-f0)/Math.max(.05,P[1]-P[0]);mode=P[2]}}
    if(!j&&k>0){P=pal(all[k]);if(g<=k+P[1]){j=k;t=(g-(k+P[0]))/Math.max(.05,P[1]-P[0]);mode=P[2]}}
    var A0=j?all[j-1]:all[k],B0=j?all[j]:all[k],a=A0.getAttribute('data-surf')||'',b=B0.getAttribute('data-surf')||a,ga=A0.getAttribute('data-glow')||'',gb=B0.getAttribute('data-glow')||ga;
    /* hold: the colour stays until the middle of its window, then turns; sweep: the next colour rises as a soft front */
    t=j?(mode==='hold'?EZ.ss(cl((t-.45)/.55)):EZ.ss(cl(t))):0;
    if(a!==BA){BA=a;cb.style.backgroundColor=a;cb.style.setProperty('--cbc',a);cb.style.setProperty('--cbg',ga||'transparent')}if(b!==BB){BB=b;cb2.style.backgroundColor=b;cb2.style.setProperty('--cbc',b);cb2.style.setProperty('--cbg',gb||'transparent')}
    if(mode!==BM){BM=mode;cb2.setAttribute('data-mode',mode)}t=Math.round(t*100)/100;if(t!==BT){BT=t;cb2.style.setProperty('--t',t);cb2.style.opacity=mode==='sweep'?(t>0?'1':'0'):String(t)}}
  var vh=W.innerHeight;seamEls.forEach(function(S){var sc=all[S.at];if(!sc||sc._top==null)return;var e0=sc._top+(S.carry?S.end:Math.min(0,S.end))*vh,end=Math.min(e0,MAXY?Math.max(0,MAXY-vh*.3):e0),span=Math.max(1,Math.min(S.span*vh,end)),w=Math.round(cl((y-(end-span))/span)*1000)/1000;if(S.carry){carry(S,w,end-span,end);return}if(w===S.w)return;S.w=w;S.el.style.setProperty('--w',w)})}
/* (with a look the next colour is in place a quarter of a scene earlier: a scene's words never arrive on the last scene's colour) */
function pal(s){return s._pal||(s._pal=(function(v){var p=String(v||'-.4,0,blend').split(','),sh=d.documentElement.hasAttribute('data-look')?(window.innerWidth<=720?.45:.25):0;return[(+p[0]||-.4)-sh,(+p[1]||0)-sh,p[2]||'blend']})(s.getAttribute('data-pal')))}
/* a carried subject: through its window the element follows the live positions of the two scenes' pictures (measured as
   they scroll), from the outgoing one to the incoming one, while both step aside; the outgoing shot turns into the next */
/* its route keeps the words readable (carry-route.js): planned once per pass from the two pictures and the words' line
   boxes -- straight, an upper/lower (or side) lane, smaller, or not at all -- and checked again every frame */
${CR.SOURCE}
function wordsNear(S,sy){var T=[],r=d.createRange();[all[S.at-1],all[S.at],all[S.at+1]].forEach(function(s){if(!s)return;[].forEach.call(s.querySelectorAll('.sc-heading,.sc-kicker,.sc-body'),function(t){var k=t.classList.contains('sc-heading')?'h':'p';r.selectNodeContents(t);[].forEach.call(r.getClientRects(),function(q){if(q.width>1&&q.height>1)T.push({x:q.left,y:q.top+sy,w:q.width,h:q.height,k:k})})})});return T}
function box(r,dy){return{x:r.left,y:r.top+(dy||0),w:r.width,h:r.height}}
function carry(S,w,y0,y1){var el=S.el,vw=W.innerWidth,vh=W.innerHeight,sy=W.scrollY||W.pageYOffset;if(!S.ok){S.ok=1;var q='.ly:is([data-role="focal"],[data-role="subject"])';S.A=all[S.at-1]&&all[S.at-1].querySelector(q);S.B=all[S.at]&&all[S.at].querySelector(q);S.ib=el.querySelector('.csc-b');S.lv=el.getAttribute('data-carry')}
  if(!S.A||!S.B)return;var on=w>0&&w<1;
  if(!on){S.P=null;if(S.on){S.on=0;el.style.opacity='0';S.A.style.visibility='';S.B.style.visibility=''}return}
  var ra=S.A.getBoundingClientRect(),rb=S.B.getBoundingClientRect();
  if(!S.P||S.vw!==vw||S.vh!==vh){S.vw=vw;S.vh=vh;S.T=wordsNear(S,sy);S.P=carryPlan({a:box(ra,sy),b:box(rb,sy),texts:S.T,y0:y0,y1:y1,vw:vw,vh:vh,level:S.lv,phone:vw<=720});el.setAttribute('data-carry-live',S.P.level);el.setAttribute('data-lane',S.P.lane)}
  var P=S.P,st=el.style;
  if(P.level==='none'){if(S.on){S.on=0;st.opacity='0';S.A.style.visibility='';S.B.style.visibility=''}return}
  var R=carryAt(P,box(ra),box(rb),w,vw,vh),T=S.T.map(function(t){return{x:t.x,y:t.y-sy,w:t.w,h:t.h,k:t.k}}),op=R.o*cl(2-cover(R,T,vw,vh));
  st.left=R.x.toFixed(1)+'px';st.top=R.y.toFixed(1)+'px';st.width=R.w.toFixed(1)+'px';st.height=R.h.toFixed(1)+'px';st.opacity=op.toFixed(3);S.on=1;
  /* each scene's own copy stays until the carried one has taken over, and is back before it lets go */
  S.A.style.visibility=P.lift>0&&w<P.lift+.06?'':'hidden';S.B.style.visibility=P.land<1&&w>P.land-.06?'':'hidden';
  S.ib.style.opacity=EZ.ss(cl((w-.3)/.4)).toFixed(3)}
/* a composition (composition.js): each of its planes follows its own keys over the scene's progress -- one camera with
   depth, the same smooth step the tracks were planned with; on a phone the travel is shorter; with reduced motion every
   plane holds the composition's resting state */
function compPlanes(s){if(!s._cp){s._cp=[].slice.call(s.querySelectorAll('[data-tk]')).map(function(el){return{el:el,K:el.getAttribute('data-tk').split(';').map(function(t){return t.split(',').map(Number)}),w:(function(w){return w.length===4&&W.innerWidth<=720?[7,8,86,84]:w})((el.getAttribute('data-win4')||'').split(',').filter(Boolean).map(Number)),k:''}});s._rest=+(s.getAttribute('data-rest')||0)}return s._cp}
function ksample(K,p){var n=K.length,i=0;if(p<=K[0][0])return K[0].slice(1);if(p>=K[n-1][0])return K[n-1].slice(1);while(i<n-2&&K[i+1][0]<p)i++;var a=K[i],b=K[i+1],t=(p-a[0])/Math.max(1e-6,b[0]-a[0]),o=[];t=t*t*(3-2*t);for(var j=1;j<a.length;j++)o.push(a[j]+(b[j]-a[j])*t);return o}
function compApply(P,v,m){var x=v[0]*m,y=v[1]*m,s=1+(v[2]-1)*(m<1?.82:1),r=v[3]*m,ry=v[6]*m,key=x.toFixed(2)+'|'+y.toFixed(2)+'|'+s.toFixed(3)+'|'+r.toFixed(2)+'|'+v[4].toFixed(3)+'|'+v[5].toFixed(3)+'|'+ry.toFixed(1);if(key===P.k)return;P.k=key;var st=P.el.style;
  st.transform='translate3d('+x.toFixed(2)+'vw,'+y.toFixed(2)+'vh,0) rotateY('+ry.toFixed(1)+'deg) rotate('+r.toFixed(2)+'deg) scale('+s.toFixed(3)+')';st.setProperty('--ko',v[4].toFixed(3));
  if(P.w.length===4){var c=v[5],w=P.w;st.clipPath=c>.001?'inset('+(w[1]*c).toFixed(2)+'% '+((100-w[0]-w[2])*c).toFixed(2)+'% '+((100-w[1]-w[3])*c).toFixed(2)+'% '+(w[0]*c).toFixed(2)+'% round '+(c*18).toFixed(1)+'px)':'none'}}
function compFrame(s,p,vw){var m=vw<=720?.55:1;compPlanes(s).forEach(function(P){compApply(P,ksample(P.K,p),m)})}
/* a composition in a scene that is not held: the moment the scene fills the screen is the composition at its rest (the
   state it reads best at) -- its travel before and after spread over the arrival and the leaving, never the words still
   half-way to the camera when the scene has come to rest */
function unheld(s,p,vh){compPlanes(s);var p0=vh/(vh+s._h),r=s._rest;return p<=p0?r*p/Math.max(1e-6,p0):r+(1-r)*(p-p0)/Math.max(1e-6,1-p0)}
/* a held composition plays as it arrives, holds and leaves -- never a blank screen: it composes itself as it scrolls in (arriving at its rest, the
   state it reads best at, the moment it fills the screen), plays its camera while it holds, and makes its last move as it
   scrolls away over the next scene -- never fading to nothing while it still covers the screen */
function held(s,vh,y){compPlanes(s);var top=s._top-y,span=Math.max(1,s._h-vh),r=s._rest||0,d=.85;if(top>0)return r*cl(1-top/vh);var q=-top/span;if(q<=1)return r+(d-r)*q;return d+(1-d)*cl((-top-span)/vh)}
/* (the same arrival for the beats of a scene that is not held: half-way through their passage when it fills the screen) */
function arrive(s,p,vh){var p0=vh/(vh+s._h);return p<=p0?.5*p/Math.max(1e-6,p0):.5+.5*(p-p0)/Math.max(1e-6,1-p0)}
function compRest(s){compPlanes(s).forEach(function(P){compApply(P,ksample(P.K,s._rest),1)})}
/* steps: the words (and pictures) of a held scene, one state at a time */
function setStep(s,i){if(i===s._i)return;s._i=i;var n=s._steps,m=s._ly.length,it=s._items.length,li=m?Math.min(m-1,Math.floor(i*m/n)):-1,ii=it?Math.min(it-1,Math.floor(i*it/n)):-1;
  s._items.forEach(function(el,k){el.classList.toggle('is-on',k===ii)});
  s._ly.forEach(function(el){var k=+el.getAttribute('data-step');el.classList.toggle('is-on',k===li);el.classList.toggle('is-past',k<li)});
  if(s._count)s._count.textContent=(i<9?'0':'')+(i+1)}
function frameArt(vh,vw,red){var y=W.scrollY||W.pageYOffset;
  frameCast(y,red);
  scenes.forEach(function(s){if(s._top==null)return;var top=s._top-y;if(top+s._h<-vh||top>vh*2)return;
    if(red){if(s._ct)compRest(s);s._bw.forEach(function(b,j){s.style.removeProperty('--b'+j)});s.style.removeProperty('--sn');s.style.removeProperty('--sx');s.style.removeProperty('--p');s.style.removeProperty('--pe');s.style.removeProperty('--mix');s.style.removeProperty('--cover');if(s._track)s._track.style.transform='';return}
    var p=prog(s,vh,y),w=s._ch==='word-fill'||(s._wf&&s._ch==='settle')?(s.hasAttribute('data-pin')?[.04,.9]:[.18,.62]):WIN[s._ch],pe=w?ease(cl((p-w[0])/(w[1]-w[0]))):p;
    s.style.setProperty('--p',p.toFixed(4));s.style.setProperty('--pe',pe.toFixed(4));
    var hp=s._ct&&s.hasAttribute('data-pin')?held(s,vh,y):null;
    if(s._ct)compFrame(s,hp!=null?hp:s.hasAttribute('data-pin')?p:unheld(s,p,vh),vw);
    /* each beat plays over its own window of the scene's progress */
    var pb=hp!=null?hp:s.hasAttribute('data-pin')?p:arrive(s,p,vh);s._bw.forEach(function(b,j){s.style.setProperty('--b'+j,EZ.ss(cl((pb-b[0])/Math.max(.01,b[1]-b[0]))).toFixed(4))});
    if(s._seam){s.style.setProperty('--sn',cl(1-top/vh).toFixed(4));s.style.setProperty('--sx',cl(1-(top+s._h)/vh).toFixed(4))}
    if(s.hasAttribute('data-bleed'))s.style.setProperty('--mix',cl((vh-top)/(vh*.85)).toFixed(3));
    if(s._steps&&s.hasAttribute('data-pin'))setStep(s,Math.min(s._steps-1,Math.floor(p*s._steps*.9999)));
    if(s._track&&s.hasAttribute('data-pin'))s._track.style.transform='translate3d('+(-p*(s._travel||0)).toFixed(1)+'px,0,0)';
    if(s.hasAttribute('data-hold')&&s._next&&s._next._top!=null){var nt=s._next._top-y;s.style.setProperty('--cover',cl(1-nt/vh).toFixed(3))}
  });
  navFrame(vh,y)}
/* navigation: a minimal bar steps aside while reading down and returns on the way up; an index marks where you are */
var nav=d.querySelector('.cr-nav'),menuEl=d.querySelector('details.cr-menu'),navMode=html.getAttribute('data-nav'),lastY=0,links=[].slice.call(d.querySelectorAll('.cr-links a[href^="#"]'));
function navFrame(vh,y){
  if(navMode==='minimal'&&nav){var open=menuEl&&menuEl.open;if(y>lastY+4&&y>vh*.5&&!open)nav.classList.add('is-away');else if(y<lastY-4||y<vh*.5)nav.classList.remove('is-away')}
  lastY=y;
  if(navMode==='index'){var cur=null;links.forEach(function(a){var t=a._t;if(t&&t._top!=null){var top=t._top-y;if(top<vh*.5&&top+t._h>vh*.5)cur=a}});links.forEach(function(a){a.classList.toggle('is-active',a===cur)})}}
/* framing guard: the plan framed each picture for a planned shape; the real viewport may differ -- a crop never
   passes the picture's budget (it is then shown whole), and the crop window always holds the measured subject */
function win(v,f,s0,s1,top){if(v>=1)return 0;var st=Math.max(0,Math.min(1-v,f-v/2));if(s0!=null){if(s1-s0<=v)st=Math.max(s1-v,Math.min(s0,st));else st=top?s0:Math.max(0,Math.min(1-v,(s0+s1)/2-v/2))}return Math.max(0,Math.min(1-v,st))}
function guard(img){if(!img.naturalWidth||!img.hasAttribute('data-crop'))return;var w=img.offsetWidth,h=img.offsetHeight;if(!w||!h)return;
  var fit=(W.innerWidth<=720&&img.getAttribute('data-mfit'))||img.getAttribute('data-fit')||'cover';
  if(fit!=='cover'){img.style.objectFit=fit;img.style.objectPosition='';img.classList.remove('is-whole');return}
  var ai=img.naturalWidth/img.naturalHeight,ab=w/h,cx=ai>ab,crop=cx?1-ab/ai:1-ai/ab,max=+img.getAttribute('data-crop');
  if(crop>max+.08){img.style.objectFit='contain';img.style.objectPosition='50% 50%';img.classList.add('is-whole');return}
  img.classList.remove('is-whole');img.style.objectFit='cover';if(crop<.002){img.style.objectPosition='50% 50%';return}
  var f=(img.getAttribute('data-f')||'.5 .45').split(' ').map(Number),s=(img.getAttribute('data-subj')||'').split(' ').map(Number),has=s.length===4&&!isNaN(s[0]),v=1-crop;
  if(cx){img.style.objectPosition=(win(v,f[0],has?s[0]:null,has?s[2]:null,false)/(1-v)*100).toFixed(1)+'% '+(f[1]*100).toFixed(1)+'%'}
  else{img.style.objectPosition=(f[0]*100).toFixed(1)+'% '+(win(v,f[1],has?s[1]:null,has?s[3]:null,true)/(1-v)*100).toFixed(1)+'%'}}
function layoutArt(){var vh=W.innerHeight,vw=W.innerWidth,red=reduced();
  scenes.forEach(function(s){
    if(s._track){if(red||!s.hasAttribute('data-pin')){s.style.height='';s._travel=0;s._track.style.transform='';return}var sw=s._track.scrollWidth,travel=Math.max(0,sw-vw*.96);s._travel=travel;s.style.height=Math.round(vh+Math.min(travel*1.05,vh*2.4))+'px'}
    if(s._steps&&s._i<0&&!red)setStep(s,0);
  });
  all.forEach(function(s){if(s.hasAttribute('data-hold'))s.style.setProperty('--hold',Math.min(0,vh-s.offsetHeight)+'px')});
  [].forEach.call(d.querySelectorAll('img[data-crop]'),guard)}
/* (the index's targets that are not scenes -- the sources -- are measured with the scenes) */
links.forEach(function(a){a._t=d.getElementById(a.getAttribute('href').slice(1))});
function measureArt(){MAXY=Math.max(0,d.scrollingElement.scrollHeight-W.innerHeight);links.forEach(function(a){var t=a._t;if(t&&!(t.classList&&t.classList.contains('sc'))){t._top=t.getBoundingClientRect().top+(W.scrollY||W.pageYOffset);t._h=t.offsetHeight}})}
W.__crArtFrame=frameArt;W.__crArtLayout=layoutArt;W.__crArtMeasure=measureArt;
[].forEach.call(d.querySelectorAll('img[data-crop]'),function(img){img.addEventListener('load',function(){guard(img)})});
/* (the payoff clip plays once: it starts from its first frame when its scene is on screen, not at page load) */
(function(){var once=[].slice.call(d.querySelectorAll('video[data-once]'));if(!once.length||!('IntersectionObserver' in W))return;once.forEach(function(v){v.removeAttribute('autoplay');v.autoplay=false;try{v.pause();v.currentTime=0}catch(e){}});var po=new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting&&e.intersectionRatio>=.5){var v=e.target;po.unobserve(v);try{v.currentTime=0;var p=v.play();if(p&&p.catch)p.catch(function(){})}catch(err){}}})},{threshold:[.5]});once.forEach(function(v){po.observe(v)})})();
layoutArt();if(W.__crFrame)W.__crFrame();
})();`;

// the spatial layer's page rules: its canvas sits behind the words and above the backdrop; while it runs, the scenes are
// transparent over the backdrop (their colours still flow from scene to scene), and a DOM picture it has redrawn hides
const SPATIAL_CSS = `
.sp-canvas{position:fixed;inset:0;width:100%;height:100%;z-index:0;pointer-events:none;display:block}
html.sp-on .sc[data-sp-behind]{background:transparent!important}
html.sp-on .sc[data-sp-behind] :is(.sc-backdrop,.sc-bgx,.sc-take,.amb-vig),html.sp-on .sc[data-flow][data-sp-behind] .sc-pin::before{display:none}
html.sp-on .sp-own{visibility:hidden!important}
html.sp-on .sc[data-sp-live]:not([data-sp="globe"]) .sc-stage{visibility:hidden}
html.sp-on.sp-pt .pt{display:none}
.sp-globe-dom{position:absolute;z-index:0;width:min(58vmin,560px);aspect-ratio:1;right:7vw;top:50%;translate:0 -50%;pointer-events:none;fill:var(--accent);opacity:.9}
.sc:has(.sc-text[data-align="right"]) .sp-globe-dom{right:auto;left:7vw}
.sp-globe-dom[data-fill="glow"]{fill:var(--glow)}.sp-globe-dom[data-fill="ink"]{fill:var(--ink)}
@media (max-width:720px){.sp-globe-dom{width:84vw;right:8vw;top:58%;opacity:.35}}
`;

module.exports = { renderCreative2 };
