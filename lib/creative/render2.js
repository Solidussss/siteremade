'use strict';
// CREATIVE — renderer for v2 (scene) plans. The same reusable mechanics serve every subject:
//   scenes of any number and height, optionally PINNED (the scene holds while scroll scrubs its
//   layers), a stage of layers per scene (pictures, drawn shapes, giant words) with masks,
//   treatments, depth, entrance choreography, ambient loops and scroll-linked movement, a
//   per-scene camera, page atmosphere, a thread that runs through the page, and a complete
//   reduced-motion composition. The plan (validated data) decides how they are used; nothing in it
//   is executed. Output: one self-contained document, used for the studio preview and the export.
//
//   renderCreative2(plan, assets, { src(asset) -> url, mode: 'preview'|'export', motion: 'full'|'reduced' })

const { esc, cleanTitle, FONTS } = require('./render');
const { drawnRect } = require('./validate');

const FONT2 = Object.assign({}, FONTS, {
  mono: `"Cascadia Mono", "SF Mono", Consolas, "Courier New", monospace`,
  condensed: `"Arial Narrow", "Roboto Condensed", "Helvetica Neue Condensed", "Franklin Gothic Medium Cond", "Segoe UI", sans-serif`,
  script: `"Segoe Script", "Brush Script MT", "Snell Roundhand", cursive`,
});
const WEIGHT = { didone: 700, grotesk: 800, serif: 700, rounded: 700, slab: 700, mono: 700, condensed: 700, script: 400 };
const hexRgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)).join(',');
const HEIGHT_VH = { screen: 100, tall: 100, short: 64, auto: 0 };

function renderCreative2(plan, assets, opts) {
  const o = opts || {}; const mode = o.mode === 'export' ? 'export' : 'preview';
  const byId = new Map((assets || []).filter(a => a && !a.removed).map(a => [a.id, a]));
  const src = a => (a && o.src ? o.src(a) : '') || '';
  const P = plan.palette; const hero = plan.scenes[0];
  // facts numbered in reading order; only cited ones are listed
  const citeNo = new Map(); const factById = new Map(plan.facts.map(f => [f.id, f]));
  plan.scenes.forEach(s => { [s.text.cite, ...s.text.items.map(i => i.cite)].forEach(c => { if (c && factById.has(c) && !citeNo.has(c)) citeNo.set(c, citeNo.size + 1); }); });
  const cite = c => (c && citeNo.has(c) ? `<a class="cr-cite" href="#cr-sources" aria-label="Source ${citeNo.get(c)}">[${citeNo.get(c)}]</a>` : '');
  const edit = k => ` data-edit="${esc(k)}"`;
  const creditOf = a => { const base = a && a.cutoutOf ? byId.get(a.cutoutOf) : a; if (!base || (base.origin === 'upload' && !base.ownerPicked)) return ''; const cr = plan.credits.find(x => x.asset === base.id); return cr ? [cr.author && cr.author.slice(0, 60), cr.license].filter(Boolean).join(' · ') : ''; };

  const sceneHtml = plan.scenes.map((s, si) => renderScene(s, si, { plan, byId, src, cite, edit, creditOf, mode })).join('\n');
  const navItems = plan.scenes.slice(1).filter(s => s.navLabel).slice(0, 5).map(s => `<li><a href="#${esc(s.id)}">${esc(s.navLabel)}</a></li>`).join('') + '<li><a href="#cr-sources">Sources</a></li>';
  const nav = `<header class="cr-nav"><a class="cr-brand" href="#top">${esc(hero.text.heading || plan.identity.name)}</a><nav aria-label="Scenes"><ul class="cr-links">${navItems}</ul><details class="cr-menu"><summary>Contents</summary><ul>${navItems}</ul></details></nav></header>`;
  const kindNote = plan.identity.kind === 'personal' ? 'A personal page. Everything here about them was written by the family.' : plan.identity.kind === 'fictional' ? `An unofficial fan page about a work of fiction. Not affiliated with, or endorsed by, its creators or owners.` : plan.identity.kind === 'invented' ? (citeNo.size ? 'An unofficial page. The numbered lines come from the sources below; everything else on it is imagined.' : 'A work of imagination: nothing on this page describes real events.') : `An unofficial page made for fun. Not affiliated with, or endorsed by, anyone connected with ${esc(plan.identity.name)}.`;
  const cited = [...citeNo.keys()].map(k => factById.get(k));
  const sources = `<footer class="cr-foot" id="cr-sources"><details class="cr-sources"><summary>Sources and credits</summary>
    <p class="cr-kinds">${plan.identity.kind === 'personal' ? 'Words about them come from the family. ' : ''}${plan.identity.kind === 'fictional' ? 'Facts marked with a number describe the stories, as reported by the source below. ' : ''}Headlines and lines not marked with a number are written for this page and are not facts.</p>
    ${cited.length ? `<h3>Facts</h3><p>From ${plan.sources.map(s => `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.title)}</a>${s.license ? ` (${esc(s.license)})` : ''}${s.retrieved ? `, retrieved ${esc(String(s.retrieved).slice(0, 10))}` : ''}`).join(', ') || 'the sources below'}.</p><ol class="cr-factlist">${cited.map(f => `<li>${esc(f.text)}</li>`).join('')}</ol>` : ''}
    ${plan.credits.length ? `<h3>Pictures</h3><ul class="cr-credits">${plan.credits.map(c => `<li><a href="${esc(c.url)}" target="_blank" rel="noopener">${esc(cleanTitle(c.title))}</a>${c.author ? ` by ${esc(c.author)}` : ''}${c.license ? `, ${c.licenseUrl ? `<a href="${esc(c.licenseUrl)}" rel="noopener license">${esc(c.license)}</a>` : esc(c.license)}` : ''}${plan.derived.some(d => d.from === c.asset) ? ' — background removed by SiteRemade' : ''}</li>`).join('')}</ul>` : ''}
    </details><p class="cr-footnote">${kindNote}</p><p class="cr-made">Made with SiteRemade Creative</p></footer>`;
  const scene = { thread: plan.thread.kind, tempo: plan.motion.tempo, mode, focal: focalCfg(hero, byId) };
  const t = hero.text;
  return `<!doctype html>
<html lang="en" class="cr cr2" data-display="${plan.type.display}" data-scale="${plan.type.scale}" data-case="${plan.type.case}" data-tempo="${plan.motion.tempo}" data-backdrop="${plan.atmosphere.backdrop}" data-motion="${o.motion === 'reduced' ? 'reduced' : 'full'}" data-mode="${mode}" data-connector="${plan.thread.kind}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(t.heading || plan.identity.name)}</title>
<meta name="description" content="${esc((plan.concept.logline || t.body || '').slice(0, 160))}">
<meta name="generator" content="SiteRemade Creative">
<script>document.documentElement.classList.add('cr-js')</script>
<style>${css(plan, P)}</style>
</head>
<body>
<a class="cr-skip" href="#main">Skip to content</a>
${nav}
<main id="main">
<svg class="cr-connector" aria-hidden="true" focusable="false"></svg>
${sceneHtml}
${sources}
</main>
${plan.fixture ? `<p class="cr-fixture" role="note">${esc(plan.fixture)}</p>` : ''}
<script type="application/json" id="cr-scene">${JSON.stringify(scene).replace(/</g, '\\u003c')}</script>
<script>${RUNTIME2}${mode === 'preview' ? PREVIEW2 : ''}</script>
</body>
</html>`;
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

function renderLayer(L, si, c, groupInner) {
  const [x, y, w, h] = L.box.d; const [mx, my, mw, mh] = L.box.m;
  const style = `--x:${x};--y:${y};--w:${w};--h:${h};--mx:${mx};--my:${my};--mw:${mw};--mh:${mh};--z:${L.z};--rot:${L.rotate}deg;--op:${L.opacity};--delay:${L.entrance.delay}s;--dur:${L.entrance.dur}s;--amp:${L.loop.amp};--period:${L.loop.period}s`;
  let art = '';
  if (groupInner != null) {
    return `<div class="ly ly-group" data-kind="group" data-role="${L.role === 'focal' && si === 0 ? 'subject' : L.role}" style="${style}"><div class="ly-scroll" data-scroll="${L.scroll.kind}" data-amount="${L.scroll.amount}"${L.scroll.anchor ? ` data-anchor="${L.scroll.anchor === 'left' ? 'left' : 'right'}"` : ''}><div class="ly-in" data-entrance="${L.entrance.kind}"><div class="ly-loop" data-loop="${L.loop.kind}"><div class="ly-art ly-group-art">${groupInner}</div></div></div></div></div>`;
  }
  if (L.kind === 'image') {
    const a = c.byId.get(L.asset); if (!a) return '';
    const wd = (a.assess && a.assess.width) || 1200, ht = (a.assess && a.assess.height) || 900;
    art = `<img class="ly-img" data-asset="${esc(a.id)}" src="${esc(c.src(a))}" alt="${esc(a.alt || '')}" width="${wd}" height="${ht}" decoding="async" style="object-fit:${L.fit};object-position:${L.focus}"><div class="cr-missing" aria-hidden="true"><span>${esc(initials(c.plan.identity.name))}</span></div>`;
  } else if (L.kind === 'shape') {
    art = `<div class="shape" data-form="${L.shape.form}" data-fill="${L.shape.fill}"${L.shape.stroke ? ' data-stroke' : ''}>${L.shape.form === 'wave' ? '<svg viewBox="0 0 200 40" preserveAspectRatio="none"><path d="M0 20 Q 25 0 50 20 T 100 20 T 150 20 T 200 20" /></svg>' : ''}</div>`;
  } else {
    art = `<span class="ly-word" data-style="${L.word.style}" style="--len:${Math.max(2, L.word.text.length)}">${esc(L.word.text)}</span>`;
  }
  return `<div class="ly" data-kind="${L.kind}" data-role="${L.role === 'focal' && si === 0 ? 'subject' : L.role}"${L.hideM ? ' data-hide-m' : ''}${L.kind === 'image' ? ' data-img' : ''}${L.edge === 'fade' ? ' data-edge="fade"' : ''} style="${style}"><div class="ly-scroll" data-scroll="${L.scroll.kind}" data-amount="${L.scroll.amount}"${L.scroll.anchor ? ` data-anchor="${L.scroll.anchor === 'left' ? 'left' : 'right'}"` : ''}><div class="ly-in" data-entrance="${L.entrance.kind}"><div class="ly-loop" data-loop="${L.loop.kind}"><div class="ly-art" data-mask="${L.mask}" data-treatment="${L.treatment}">${art}</div></div></div></div></div>`;
}

// a group is ONE object on the stage: a wrapper at the union of its members' boxes carries the anchor's entrance,
// loop and scroll (the focal's, else the first member's); members sit inside it at their relative places and keep
// only their own ambient loop -- so a blade and its hilt, or a head and its halo, never come apart
function union(boxes) {
  const x0 = Math.min(...boxes.map(b => b[0])), y0 = Math.min(...boxes.map(b => b[1])), x1 = Math.max(...boxes.map(b => b[0] + b[2])), y1 = Math.max(...boxes.map(b => b[1] + b[3]));
  return [x0, y0, Math.max(1, x1 - x0), Math.max(1, y1 - y0)];
}
const rel = (b, u) => [(b[0] - u[0]) / u[2] * 100, (b[1] - u[1]) / u[3] * 100, b[2] / u[2] * 100, b[3] / u[3] * 100].map(v => Math.round(v * 100) / 100);
function renderStage(s, si, c) {
  const out = []; const done = new Set();
  s.layers.forEach(L => {
    if (!L.group) { out.push(renderLayer(L, si, c)); return; }
    if (done.has(L.group)) return; done.add(L.group);
    const members = s.layers.filter(M => M.group === L.group);
    const anchor = members.find(M => M.role === 'focal') || members[0];
    const ud = union(members.map(M => M.box.d)), um = union(members.map(M => M.box.m));
    const inner = members.map(M => renderLayer(Object.assign({}, M, { box: { d: rel(M.box.d, ud), m: rel(M.box.m, um) }, entrance: Object.assign({}, M.entrance, { kind: 'none' }), scroll: { kind: 'none', amount: 0 }, loop: M === anchor ? Object.assign({}, M.loop, { kind: 'none' }) : M.loop, role: M.role === 'focal' ? 'part' : M.role }), si, c)).join('');
    const wrap = Object.assign({}, anchor, { box: { d: ud, m: um }, rotate: 0, opacity: 1, z: Math.max(...members.map(M => M.z)), mask: 'none', treatment: 'none', role: anchor.role });
    out.push(renderLayer(wrap, si, c, inner));
  });
  return out.join('');
}

function renderScene(s, si, c) {
  const k = `scenes.${si}.text`; const t = s.text; const hero = si === 0;
  const H = hero ? 'h1' : 'h2';
  const words = t.entrance === 'split-words' ? String(t.heading).split(/\s+/).map((w, j) => `<span class="w" style="--i:${j}">${esc(w)}</span>`).join(' ') : esc(t.heading);
  const items = t.items.length ? `<ol class="sc-list" data-list="${t.list}">${t.items.map((it, j) => `<li class="sc-item" style="--i:${j}">${it.label ? `<span class="sc-label"${c.edit(`${k}.items.${j}.label`)}>${esc(it.label)}</span>` : ''}<span${c.edit(`${k}.items.${j}.text`)}>${esc(it.text)}</span>${c.cite(it.cite)}</li>`).join('')}</ol>` : '';
  const heroFocal = hero ? s.layers.find(L => L.role === 'focal' && L.kind === 'image') : null;
  const credit = heroFocal ? c.creditOf(c.byId.get(heroFocal.asset)) : '';
  const text = `<div class="sc-text${t.scrim ? ' has-scrim' : ''}" data-region="${t.region}" data-size="${t.size}" data-width="${t.width}" data-entrance="${t.entrance}">
      ${t.kicker ? `<p class="sc-kicker${hero ? ' cr-kicker' : ''}"${c.edit(`${k}.kicker`)}>${esc(t.kicker)}</p>` : ''}
      ${t.heading ? `<${H} class="sc-heading${hero ? ' cr-h1' : ''}" data-len="${t.heading.length > 40 ? 'xl' : t.heading.length > 22 ? 'l' : 's'}"${t.entrance === 'split-words' ? '' : c.edit(`${k}.heading`)} style="--lw:${Math.max(4, ...String(t.heading).split(/\s+/).map(w => w.length))}">${words}</${H}>` : ''}
      ${t.body ? `<p class="sc-body${hero ? ' cr-lede' : ''}"><span${c.edit(`${k}.body`)}>${esc(t.body)}</span>${c.cite(t.cite)}</p>` : ''}
      ${items}
      ${hero && s.cta && c.plan.scenes[1] ? `<a class="sc-cta cr-cta" href="#${esc(c.plan.scenes[1].id)}">${esc(s.cta)}<span aria-hidden="true">↓</span></a>` : ''}
    </div>`;
  const count = hero || s.atmosphere ? Math.round(c.plan.atmosphere.density * (c.plan.atmosphere.particles === 'stars' ? 60 : 22)) : 0;
  const atmos = hero || s.atmosphere ? `<div class="sc-world" aria-hidden="true"><div class="sc-backdrop"></div><div class="sc-light" data-light="${c.plan.atmosphere.light}"></div>${particles(c.plan.atmosphere, count)}${c.plan.atmosphere.grain ? '<div class="sc-grain"></div>' : ''}</div>` : '';
  const ink = s.ink || {};
  const prev = si > 0 && c.plan.scenes[si - 1] && c.plan.scenes[si - 1].ink ? c.plan.scenes[si - 1].ink.surface : '';
  const flow = prev && ink.surface && prev.toLowerCase() !== String(ink.surface).toLowerCase();
  return `<section class="sc${hero ? ' cr-hero' : ' cr-reveal'}" id="${hero ? 'top' : esc(s.id)}" data-scene="${si}" data-height="${s.height}"${s.pin ? ' data-pin' : ''} data-bg="${s.background}"${s.tone ? ' data-tone' : ''}${flow ? ' data-flow' : ''} data-camera="${s.camera}" data-morder="${s.mobile.order}"${hero ? ' data-hero' : ''} style="--s-ink:${ink.ink};--s-muted:${ink.muted};--s-surface:${ink.surface}${ink.accent ? `;--s-accent:${ink.accent}` : ''}${flow ? `;--prev:${prev}` : ''}" aria-label="${esc(t.heading || s.name || `Scene ${si + 1}`)}">
  <div class="sc-pin">${atmos}
    <div class="sc-stage">${renderStage(s, si, c)}</div>
    ${text}
    ${credit ? `<p class="cr-herocredit">Picture: ${esc(credit)}</p>` : ''}
  </div>
</section>`;
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
.cr-links{display:flex;gap:clamp(12px,2vw,26px);list-style:none;margin:0;padding:0;font-size:13px;letter-spacing:.05em}.cr-links a{text-decoration:none;opacity:.8}.cr-links a:hover,.cr-links a:focus{opacity:1;text-decoration:underline}
.cr-menu{display:none;position:relative}.cr-menu summary{cursor:pointer;list-style:none;font-size:14px;padding:8px 12px;border:1px solid rgba(var(--ink-rgb),.35);border-radius:99px}.cr-menu summary::-webkit-details-marker{display:none}
.cr-menu ul{position:absolute;right:0;top:44px;list-style:none;margin:0;padding:10px 0;background:var(--bg);border:1px solid rgba(var(--ink-rgb),.2);border-radius:12px;min-width:180px}.cr-menu li a{display:block;padding:10px 18px;text-decoration:none}
/* scenes */
.sc{position:relative;color:var(--s-ink,var(--ink));background:var(--s-surface,var(--bg))}
.sc[data-bg="deep"]{background:linear-gradient(180deg,var(--bg2),var(--bg))}
.sc[data-bg="tint"]{background:linear-gradient(180deg,rgba(var(--accent-rgb),.10),rgba(var(--accent-rgb),.04))}
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
.cr-js .sc:not(.is-in) [data-entrance="dolly"].ly-in{transform:scale(1.18);opacity:0}
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
@keyframes k-kenburns{0%{transform:scale(1.02) translate3d(0,0,0)}100%{transform:scale(calc(1.02 + var(--amp) * .05)) translate3d(calc(var(--amp) * -1.6%),calc(var(--amp) * -1%),0)}}
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
  .sc[data-morder="stage-first"] .sc-text{order:3}
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
var ticking=false;
function prog(s,vh){var r=s.getBoundingClientRect();if(s.hasAttribute('data-pin')){var span=r.height-vh;return span>0?Math.max(0,Math.min(1,-r.top/span)):0}return Math.max(0,Math.min(1,(vh-r.top)/(vh+r.height)))}
function tf(kind,a,p,vw,vh){var q=p-.5;switch(kind){
 case 'parallax':return 'translate3d(0,'+(-q*a*vh*.3).toFixed(1)+'px,0)';
 case 'drift-x':return 'translate3d('+(q*a*vw*.35).toFixed(1)+'px,0,0)';
 case 'rise':return 'translate3d(0,'+((1-p)*a*vh*.35).toFixed(1)+'px,0)';
 case 'sink':return 'translate3d(0,'+(p*a*vh*.3).toFixed(1)+'px,0)';
 case 'zoom-in':return 'scale('+(1+p*Math.abs(a)*.55).toFixed(3)+')';
 case 'zoom-out':return 'scale('+(1+(1-p)*Math.abs(a)*.55).toFixed(3)+')';
 case 'rotate':return 'rotate('+(q*a*80).toFixed(1)+'deg)';
 case 'pass-through':return 'translate3d('+(-q*a*vw*1.1).toFixed(1)+'px,0,0)';
 default:return ''}}
function cam(kind,p){var q=p-.5;switch(kind){case 'push-in':return 'scale('+(1+p*.12).toFixed(3)+')';case 'pull-out':return 'scale('+(1.12-p*.12).toFixed(3)+')';case 'pan-left':return 'translate3d('+(-q*6).toFixed(2)+'%,0,0)';case 'pan-right':return 'translate3d('+(q*6).toFixed(2)+'%,0,0)';case 'rise':return 'translate3d(0,'+(-q*8).toFixed(2)+'%,0)';default:return ''}}
function frame(){ticking=false;var vh=W.innerHeight,vw=W.innerWidth,red=reduced();
  scenes.forEach(function(s){var r=s.getBoundingClientRect();if(r.bottom<-vh||r.top>vh*2)return;var p=prog(s,vh);var st=s.querySelector('.sc-stage');
    if(st)st.style.transform=red?'':cam(s.getAttribute('data-camera'),p);
    [].forEach.call(s.querySelectorAll('.ly-scroll'),function(l){var k=l.getAttribute('data-scroll');if(k==='none'){return}if(red){l.style.transform='';l.style.clipPath='';return}var a=+l.getAttribute('data-amount')||0;
      if(k==='reveal'){var v=Math.min(1,p*1.8);l.style.clipPath='inset(0 0 '+((1-v)*100).toFixed(1)+'% 0)';return}l.style.transform=tf(k,a,p,vw,vh)})});
  if(mask){var y=W.scrollY||W.pageYOffset,mt=mainEl.getBoundingClientRect().top+y,tY=Math.min(y+vh*.66-mt,startY+y*1.6),drawn=red?len:Math.max(0,Math.min(len,lenAtY(tY)));mask.setAttribute('stroke-dashoffset',(len-drawn).toFixed(1));dots.forEach(function(c){c.classList.toggle('on',c._at<=drawn+1)})}
}
function onScroll(){if(!ticking){ticking=true;requestAnimationFrame(frame)}}
W.addEventListener('scroll',onScroll,{passive:true});
/* the thread: from the hero down the side margins, crossing only between scenes */
var svg=d.querySelector('.cr-connector'),NS='http://www.w3.org/2000/svg',mask=null,len=0,table=[],dots=[],startY=0;
function el(n,a){var e=d.createElementNS(NS,n);for(var k in a)e.setAttribute(k,a[k]);return e}
function lenAtY(y){if(!table.length||y<=table[0][0])return 0;for(var i=1;i<table.length;i++){if(table[i][0]>=y){var a=table[i-1],b=table[i];return a[1]+(b[1]-a[1])*((y-a[0])/Math.max(1,b[0]-a[0]))}}return len}
function focalPoint(){var f=hero&&hero.querySelector('[data-role="subject"]');if(!f||!cfg.focal||cfg.focal.fit!=='contain')return null;var r=f.getBoundingClientRect(),m=mainEl.getBoundingClientRect(),w=r.width,h=r.height,x=r.left-m.left,y=r.top-m.top,a=cfg.focal.aspect;if(w/h>a){var nw=h*a;x+=(w-nw)/2;w=nw}else{var nh=w/a;y+=h-nh;h=nh}var b=cfg.focal.bbox;return{x:x+w*(b[0]+(b[2]-b[0])*.5),y:y+h*(b[1]+(b[3]-b[1])*.97)}}
function layout(){
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
var rt;W.addEventListener('resize',function(){clearTimeout(rt);rt=setTimeout(layout,120)});
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
W.__crLayout=layout;W.__crFrame=frame;
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

module.exports = { renderCreative2 };
