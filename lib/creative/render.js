'use strict';
// CREATIVE — the scene renderer. ONE function turns a validated scene plan into ONE
// self-contained HTML document: markup, scoped CSS and a small fixed runtime (entrance,
// ambient loops, scroll camera/parallax, section reveals, the connector that runs down the
// page, particles, reduced motion, missing-image fallbacks). The studio shows this document
// in an iframe; the export writes the same document as index.html -- preview IS export.
// Nothing Business uses is loaded or touched: the document has its own CSS and runtime.
//
//   renderCreative(plan, assets, { src(asset) -> url, mode: 'preview'|'export', motion: 'full'|'reduced', siteUrl })
//
// The runtime below is fixed code shipped by SiteRemade. A plan is data: it selects among
// the runtime's capabilities (layers, depth, entrances, loops, connector kinds, particles,
// lights) through validated enums and numbers -- no plan string is ever executed, and every
// string is escaped.

const { subjectRect } = require('./validate');

const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const attr = esc;
const FONTS = {
  didone: `"Bodoni MT", "Bodoni 72", Didot, "Didot LT STD", "Playfair Display", Georgia, serif`,
  grotesk: `"Helvetica Neue", "Segoe UI", Arial, sans-serif`,
  serif: `Georgia, "Iowan Old Style", "Palatino Linotype", "Book Antiqua", serif`,
  rounded: `"Arial Rounded MT Bold", "Segoe UI Rounded", Nunito, "Trebuchet MS", sans-serif`,
  slab: `Rockwell, "Rockwell Extra Bold", "Roboto Slab", "Courier New", Georgia, serif`,
};
const DISPLAY_WEIGHT = { didone: 700, grotesk: 800, serif: 700, rounded: 700, slab: 700 };
const NAV_LABEL = { dossier: 'The file', facts: 'Facts', timeline: 'History', gallery: 'Pictures', specimen: 'Up close', plate: 'Pictures', story: 'Story', ode: 'Ode', about: 'About', memories: 'Memories', aside: 'Species', statement: 'Intro', sources: 'Sources' };

function hexRgb(h) { return [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)).join(','); }

function renderCreative(plan, assets, opts) {
  const o = opts || {}; const mode = o.mode === 'export' ? 'export' : 'preview';
  const byId = new Map((assets || []).filter(a => a && !a.removed).map(a => [a.id, a]));
  const src = a => (a && o.src ? o.src(a) : '') || '';
  const P = plan.palette; const hero = plan.hero; const t = hero.title;
  // facts are numbered in reading order, and only the ones the page actually cites are listed
  const citeNo = new Map(); const factById = new Map(plan.facts.map(f => [f.id, f]));
  const note = id => { if (id && factById.has(id) && !citeNo.has(id)) citeNo.set(id, citeNo.size + 1); };
  note(t.cite); plan.sections.filter(s => mode === 'preview' || !s.studioOnly).forEach(s => { note(s.cite); (s.items || []).forEach(it => note(it.cite)); });
  plan = Object.assign({}, plan, { cited: [...citeNo.keys()].map(id => factById.get(id)) });
  const cite = id => (id && citeNo.has(id) ? `<a class="cr-cite" href="#cr-sources" aria-label="Source">[${citeNo.get(id)}]</a>` : '');
  const creditOf = a => { const base = a && a.cutoutOf ? byId.get(a.cutoutOf) : a; if (!base || base.origin === 'upload') return ''; const c = plan.credits.find(x => x.asset === base.id); return c ? [c.author && c.author.replace(/\s+/g, ' ').slice(0, 60), c.license].filter(Boolean).join(' · ') : ''; };
  const img = (a, cls, extra) => { const s = src(a); const w = (a && a.assess && a.assess.width) || 1200, h = (a && a.assess && a.assess.height) || 900; return `<img class="${cls || ''}" data-asset="${attr(a.id)}" src="${attr(s)}" alt="${attr(a.alt || '')}" width="${w}" height="${h}" decoding="async"${extra || ''}>`; };
  const edit = key => ` data-edit="${attr(key)}"`;

  // ---------- hero ----------
  const subj = hero.layers[0]; const subjAsset = subj && byId.get(subj.asset);
  const layerHtml = hero.layers.map(l => {
    const a = byId.get(l.asset); if (!a) return '';
    const [x, y, w, h] = l.box.d; const [mx, my, mw, mh] = l.box.m;
    const style = `--x:${x};--y:${y};--w:${w};--h:${h};--mx:${mx};--my:${my};--mw:${mw};--mh:${mh};--z:${l.z};--delay:${l.entrance.delay}s;--dur:${l.entrance.dur}s;--amp:${l.loop.amp};--period:${l.loop.period}s;--focus:${l.focus}`;
    return `<figure class="cr-layer" data-img data-role="${l.role}" data-entrance="${l.entrance.kind}" data-loop="${l.loop.kind}" data-frame="${l.frame}" data-shadow="${l.shadow}" data-fit="${l.fit}"${l.hideM ? ' data-hide-m' : ''} style="${style}">`
      + `<div class="cr-par" data-depth="${l.depth}"><div class="cr-in"><div class="cr-loop">`
      + `${l.shadow === 'floor' ? '<div class="cr-floor"></div>' : ''}<div class="cr-frame">${img(a, 'cr-img')}<div class="cr-missing" aria-hidden="true"><span>${esc(initials(t.text))}</span></div></div>`
      + `</div></div></div></figure>`;
  }).join('');
  // a plinth / floor for a free-standing subject in a staged world
  const plinth = subj && hero.layout === 'stage' && subj.shadow === 'floor' && (plan.world === 'monument' || plan.world === 'studio' || plan.world === 'warm')
    ? (() => { const r = subjectRect(subj, subjAsset, 'd'); const m = subjectRect(subj, subjAsset, 'm'); return `<div class="cr-plinth" aria-hidden="true" style="--x:${(r[0] - r[2] * 0.12).toFixed(1)};--y:${(r[1] + r[3] - 1.5).toFixed(1)};--w:${(r[2] * 1.24).toFixed(1)};--mx:${(m[0] - m[2] * 0.1).toFixed(1)};--my:${(m[1] + m[3] - 1.5).toFixed(1)};--mw:${(m[2] * 1.2).toFixed(1)}"><div class="cr-in"></div></div>`; })() : '';
  const particles = particleHtml(hero.atmosphere, plan.world);
  const longest = Math.max(4, ...String(t.text).split(/\s+/).map(w => w.length));
  const lenClass = t.text.length <= 12 ? 's' : t.text.length <= 26 ? 'm' : 'l';
  const subjCredit = subjAsset ? creditOf(subjAsset) : '';
  const heroHtml = `<section class="cr-hero" id="top" data-layout="${hero.layout}" data-title-d="${t.place.d}" data-title-m="${t.place.m}" aria-label="${attr(t.text)}">
  <div class="cr-world" aria-hidden="true"><div class="cr-backdrop"></div><div class="cr-light" data-light="${hero.atmosphere.light}"></div>${particles}</div>
  <div class="cr-stage">${plinth}${layerHtml}${hero.layout === 'type' ? `<div class="cr-echo" aria-hidden="true">${esc(t.text)}</div>` : ''}</div>
  <div class="cr-title" style="--lw:${longest}">
    <div class="cr-title-head">
      ${t.kicker ? `<p class="cr-kicker cr-t" style="--i:0"${edit('hero.title.kicker')}>${esc(t.kicker)}</p>` : ''}
      <h1 class="cr-h1 cr-t" data-len="${lenClass}" style="--i:1"${edit('hero.title.text')}>${esc(t.text)}</h1>
      ${t.tagline ? `<p class="cr-tagline cr-t" style="--i:2"${edit('hero.title.tagline')}>${esc(t.tagline)}</p>` : ''}
    </div>
    <div class="cr-title-foot">
      ${t.lede ? `<p class="cr-lede cr-t" style="--i:3"><span${edit('hero.title.lede')}>${esc(t.lede)}</span>${cite(t.cite)}</p>` : ''}
      <a class="cr-cta cr-t" style="--i:4" href="${attr(hero.cta.target)}">${esc(hero.cta.label)}<span aria-hidden="true">↓</span></a>
    </div>
  </div>
  ${subjCredit ? `<p class="cr-herocredit">Picture: ${esc(subjCredit)}</p>` : ''}
</section>`;

  // ---------- sections ----------
  const visible = plan.sections.filter(s => mode === 'preview' || !s.studioOnly);
  const sectionHtml = visible.map((s, idx) => renderSection(s, plan.sections.indexOf(s), { plan, byId, img, cite, esc, edit, creditOf, subjAsset, subj, t, mode })).join('\n');

  // ---------- nav ----------
  const seenLabels = new Set();
  // up to five sections, and Sources always last
  const navItems = visible.filter(s => s.type !== 'closing' && s.type !== 'ask' && s.type !== 'sources').map(s => ({ id: s.id, label: NAV_LABEL[s.type] || s.eyebrow || 'More' })).filter(n => !seenLabels.has(n.label) && seenLabels.add(n.label)).slice(0, 5)
    .concat(visible.filter(s => s.type === 'sources').map(s => ({ id: s.id, label: 'Sources' })));
  const navLinks = navItems.map(n => `<li><a href="#${attr(n.id)}">${esc(n.label)}</a></li>`).join('');
  const nav = `<header class="cr-nav"><a class="cr-brand" href="#top">${esc(t.text)}</a><nav aria-label="Sections"><ul class="cr-links">${navLinks}</ul><details class="cr-menu"><summary>Contents</summary><ul>${navLinks}</ul></details></nav></header>`;

  const footerNote = plan.kind === 'personal' ? 'A personal page. Everything here about them was written by the family.'
    : plan.kind === 'fictional' ? 'A work of imagination: nothing on this page describes real events.'
      : `An unofficial page made for fun. Not affiliated with, or endorsed by, anyone connected with ${esc(t.text)}.`;
  const footer = `<footer class="cr-footer"><p>${footerNote}</p><p class="cr-made">Made with SiteRemade Creative</p></footer>`;

  // ---------- runtime config (numbers and enums only) ----------
  const scene = {
    connector: plan.connector.kind, intensity: plan.motion.intensity, camera: hero.camera.scroll === 'push',
    subject: subj && subjAsset ? { fit: subj.fit, aspect: (subjAsset.assess && subjAsset.assess.aspect) || 1, bbox: (subjAsset.assess && subjAsset.assess.subject) || [0, 0, 1, 1] } : null,
    mode,
  };
  const description = (t.lede || t.tagline || plan.concept.line || '').slice(0, 160);
  return `<!doctype html>
<html lang="en" class="cr" data-world="${plan.world}" data-display="${plan.type.display}" data-intensity="${plan.motion.intensity}" data-connector="${plan.connector.kind}" data-motion="${o.motion === 'reduced' ? 'reduced' : 'full'}" data-mode="${mode}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(t.text)}</title>
<meta name="description" content="${attr(description)}">
<meta name="generator" content="SiteRemade Creative">
<script>document.documentElement.classList.add('cr-js')</script>
<style>${css(plan, P)}</style>
</head>
<body>
<a class="cr-skip" href="#main">Skip to content</a>
${nav}
<main id="main">
<svg class="cr-connector" aria-hidden="true" focusable="false"></svg>
${heroHtml}
${sectionHtml}
${footer}
</main>
${plan.fixture ? `<p class="cr-fixture" role="note">${esc(plan.fixture)}</p>` : ''}
<script type="application/json" id="cr-scene">${JSON.stringify(scene).replace(/</g, '\\u003c')}</script>
<script>${RUNTIME}${mode === 'preview' ? PREVIEW_RUNTIME : ''}</script>
</body>
</html>`;
}

function initials(text) { return String(text || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join(''); }

function particleHtml(atm, world) {
  const n = atm.count; if (!n || atm.particles === 'none') return '';
  let seed = 7; const r = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const parts = [];
  if (atm.particles === 'stars') {
    const dots = []; for (let i = 0; i < n * 3; i++) dots.push(`${(r() * 100).toFixed(2)}vw ${(r() * 100).toFixed(2)}vh 0 ${r() < 0.15 ? 1 : 0}px rgba(255,255,255,${(0.35 + r() * 0.6).toFixed(2)})`);
    return `<div class="cr-particles" data-kind="stars"><i class="cr-stars" style="box-shadow:${dots.join(',')}"></i><i class="cr-stars cr-stars-b" style="box-shadow:${dots.slice(0, n).map(d => d.replace(/rgba\([^)]*\)/, 'rgba(255,255,255,.9)')).join(',')}"></i></div>`;
  }
  for (let i = 0; i < n; i++) {
    const size = atm.particles === 'fog' ? 40 + r() * 50 : atm.particles === 'clouds' ? 14 + r() * 18 : atm.particles === 'steam' ? 6 + r() * 8 : atm.particles === 'bubbles' ? 0.4 + r() * 1.4 : 0.15 + r() * 0.35;
    parts.push(`<i style="--px:${(r() * 100).toFixed(1)};--py:${(r() * 100).toFixed(1)};--ps:${size.toFixed(2)};--pd:${(r() * -20).toFixed(1)}s;--pt:${(10 + r() * 16).toFixed(1)}s"></i>`);
  }
  return `<div class="cr-particles" data-kind="${atm.particles}">${parts.join('')}</div>`;
}

// ---------- one section ----------
function renderSection(s, idx, c) {
  const { esc, edit, cite, img, byId } = c; const k = `sections.${idx}`;
  const head = (cls) => `${s.eyebrow ? `<p class="cr-eyebrow${s.kind === 'imagined' ? ' is-imagined' : ''}"${edit(`${k}.eyebrow`)}>${esc(s.eyebrow)}</p>` : ''}${s.title ? `<h2 class="cr-h2${cls ? ` ${cls}` : ''}"${edit(`${k}.title`)}>${esc(s.title)}</h2>` : ''}`;
  const items = (list, cls) => (list || []).map((it, j) => `<li class="cr-item cr-reveal" style="--i:${j}">${it.year ? `<span class="cr-year">${esc(it.year)}</span>` : ''}<span${edit(`${k}.items.${j}.text`)}>${esc(it.text)}</span>${cite(it.cite)}</li>`).join('');
  const figure = (a, cls, caption) => { if (!a) return ''; const cr = c.creditOf(a); return `<figure class="${cls}" data-img style="--ar:${(a.assess && a.assess.aspect) || 1.33}">${img(a, 'cr-img')}<div class="cr-missing" aria-hidden="true"><span>Picture unavailable</span></div>${caption || cr ? `<figcaption>${caption ? `<span>${esc(caption)}</span>` : ''}${cr ? `<small>${esc(cr)}</small>` : ''}</figcaption>` : ''}</figure>`; };
  const open = (extra) => `<section class="cr-section cr-reveal" id="${esc(s.id)}" data-type="${s.type}" data-layout="${esc(s.layout || '')}" data-kind="${s.kind}"${extra || ''}><div class="cr-anchor" aria-hidden="true"></div><div class="cr-wrap">`;
  const close = `</div></section>`;
  switch (s.type) {
    case 'statement': {
      const words = String(s.title || '').split(/\s+/).map((w, j) => `<span class="cr-word" style="--i:${j}">${esc(w)}</span>`).join(' ');
      return `${open()}<p class="cr-statement"><span${edit(`${k}.title`)}>${words}</span>${cite(s.cite)}</p>${s.body ? `<p class="cr-body"${edit(`${k}.body`)}>${esc(s.body)}</p>` : ''}${close}`;
    }
    case 'specimen': {
      const a = byId.get(s.asset);
      return `${open()}<div class="cr-specimen">${a ? `<div class="cr-specimen-art" data-img><div class="cr-spin">${img(a, 'cr-img')}</div><div class="cr-missing" aria-hidden="true"><span>${esc(initials(c.t.text))}</span></div></div>` : ''}<div class="cr-specimen-copy">${head()}<ol class="cr-callouts">${items(s.items)}</ol></div></div>${close}`;
    }
    case 'dossier': {
      const a = byId.get(s.asset);
      return `${open()}<div class="cr-dossier">${a ? `<div class="cr-pinned cr-reveal">${figure(a, 'cr-photo')}</div>` : ''}<div class="cr-file">${head()}<ul class="cr-list">${items(s.items)}</ul></div></div>${close}`;
    }
    case 'plate': {
      const a = byId.get(s.asset);
      return `${open()}${figure(a, 'cr-plate', s.title)}${close}`.replace('<div class="cr-wrap">', '<div class="cr-wrap cr-wide">');
    }
    case 'facts': case 'about':
      return `${open()}${head()}<ol class="cr-ledger">${items(s.items)}</ol>${close}`;
    case 'timeline':
      return `${open()}${head()}<ol class="cr-rail">${items(s.items)}</ol>${close}`;
    case 'gallery': {
      const pics = (s.assets || []).map(id => byId.get(id)).filter(Boolean);
      return `${open()}${head()}<div class="cr-scatter" data-n="${pics.length}">${pics.map((a, j) => `<div class="cr-card cr-reveal" style="--i:${j}">${figure(a, 'cr-photo', cleanTitle(a.title))}</div>`).join('')}</div>${close}`;
    }
    case 'memories':
      return `${open()}${head()}<ul class="cr-notes">${items(s.items)}</ul>${close}`;
    case 'aside':
      return `${open()}${head()}${s.note ? `<p class="cr-note"${edit(`${k}.note`)}>${esc(s.note)}</p>` : ''}<ul class="cr-columns">${items(s.items)}</ul>${close}`;
    case 'story': case 'ode':
      return `${open()}${head('cr-h2-quiet')}<div class="cr-column">${(s.paragraphs || []).map((p, j) => `<p class="cr-reveal" style="--i:${j}"${edit(`${k}.paragraphs.${j}`)}>${esc(p)}</p>`).join('')}${s.body ? `<p${edit(`${k}.body`)}>${esc(s.body)}</p>` : ''}</div>${close}`;
    case 'ask':
      return `${open(' data-studio-only')}<div class="cr-ask">${head()}<p${edit(`${k}.body`)}>${esc(s.body || '')}</p></div>${close}`;
    case 'closing': {
      const a = c.subjAsset;
      return `${open()}<div class="cr-closing">${a && c.subj ? `<div class="cr-echo-art${c.subj.fit === 'cover' ? ' is-framed' : ''}" data-img style="--focus:${c.subj.focus || '50% 50%'}">${img(a, 'cr-img')}<div class="cr-missing" aria-hidden="true"><span>${esc(initials(c.t.text))}</span></div></div>` : ''}<p class="cr-closing-line"${edit(`${k}.title`)}>${esc(s.title || '')}</p><a class="cr-top" href="#top">Back to the top</a></div>${close}`;
    }
    case 'sources': {
      const plan = c.plan;
      const facts = plan.cited.length ? `<h3>Facts</h3><p>Lines marked with a number come from the ${plan.sources.map(src => `<a href="${esc(src.url)}" rel="noopener">${esc(src.title)}</a>`).join(', ') || 'sources below'} article${plan.sources[0] && plan.sources[0].license ? ` (${esc(plan.sources[0].license)})` : ''}${plan.sources[0] && plan.sources[0].retrieved ? `, retrieved ${esc(String(plan.sources[0].retrieved).slice(0, 10))}` : ''}.</p><ol class="cr-factlist">${plan.cited.map((f, i) => `<li id="cr-fact-${i + 1}">${esc(f.text)}</li>`).join('')}</ol>` : '';
      const credits = plan.credits.length ? `<h3>Pictures</h3><ul class="cr-credits">${plan.credits.map(cr => `<li><a href="${esc(cr.url)}" rel="noopener">${esc(cleanTitle(cr.title))}</a>${cr.author ? ` by ${esc(cr.author)}` : ''}${cr.license ? `, ${cr.licenseUrl ? `<a href="${esc(cr.licenseUrl)}" rel="noopener license">${esc(cr.license)}</a>` : esc(cr.license)}` : ''}${plan.derived.some(d => d.from === cr.asset) ? ' — background removed by SiteRemade' : ''}</li>`).join('')}</ul>` : '';
      const kinds = `<p class="cr-kinds">${plan.kind === 'personal' ? 'Words about them come from the family. ' : ''}Headlines and lines marked <em>Imagined</em> are written for this page and are not facts.</p>`;
      return `<section class="cr-section cr-sources" id="${esc(s.id)}" data-type="sources"><div class="cr-wrap" id="cr-sources"><h2 class="cr-h2">${esc(s.title || 'Sources and credits')}</h2>${kinds}${facts}${credits}</div></section>`;
    }
    default: return '';
  }
}
// a file title as a caption: no "File:", extension, underscores, or photo-site id numbers ("Rubber Duck (33539138686)")
function cleanTitle(t) { return String(t || '').replace(/^File:/, '').replace(/\.(jpe?g|png|webp|gif)$/i, '').replace(/[_]+/g, ' ').replace(/\s*\(\d{6,}\)/g, '').replace(/\s+\d{6,}$/, '').replace(/\s+/g, ' ').trim(); }

// ---------- CSS (scoped to this document; nothing from Business) ----------
function css(plan, P) {
  const d = plan.type.display;
  return `
:root{--bg:${P.bg};--bg2:${P.bg2};--ink:${P.ink};--muted:${P.muted};--accent:${P.accent};--glow:${P.glow};--accent-rgb:${hexRgb(P.accent)};--glow-rgb:${hexRgb(P.glow)};--ink-rgb:${hexRgb(P.ink)};--bg-rgb:${hexRgb(P.bg)};
--display:${FONTS[d]};--dw:${DISPLAY_WEIGHT[d]};--body:system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;--k:1;--gutter:clamp(20px,7vw,150px);--nav:60px}
html[data-intensity="calm"]{--k:.55}
*{box-sizing:border-box}
html{scroll-behavior:smooth;-webkit-text-size-adjust:100%}
html[data-motion="reduced"]{scroll-behavior:auto}
body{margin:0;background:var(--bg);color:var(--ink);font:17px/1.6 var(--body);overflow-x:clip}
img{max-width:100%}
a{color:inherit}
.cr-skip{position:absolute;left:-999px;top:8px;background:var(--ink);color:var(--bg);padding:8px 12px;z-index:50}.cr-skip:focus{left:8px}
main{position:relative;display:block}
/* nav */
.cr-nav{position:fixed;inset:0 0 auto 0;height:var(--nav);display:flex;align-items:center;justify-content:space-between;gap:16px;padding:0 clamp(16px,3vw,40px);z-index:40;color:var(--ink);background:linear-gradient(rgba(var(--bg-rgb),.72),rgba(var(--bg-rgb),0));backdrop-filter:blur(2px)}
.cr-brand{font-family:var(--display);font-weight:var(--dw);text-decoration:none;font-size:18px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:40vw}
.cr-links{display:flex;gap:clamp(12px,2vw,28px);list-style:none;margin:0;padding:0;font-size:14px;letter-spacing:.04em}
.cr-links a{text-decoration:none;opacity:.82}.cr-links a:hover,.cr-links a:focus{opacity:1;text-decoration:underline}
.cr-menu{display:none;position:relative}.cr-menu summary{cursor:pointer;list-style:none;font-size:14px;padding:8px 12px;border:1px solid rgba(var(--ink-rgb),.35);border-radius:99px}.cr-menu summary::-webkit-details-marker{display:none}
.cr-menu ul{position:absolute;right:0;top:44px;list-style:none;margin:0;padding:10px 0;background:var(--bg);border:1px solid rgba(var(--ink-rgb),.2);border-radius:12px;min-width:180px;box-shadow:0 18px 40px rgba(0,0,0,.25)}
.cr-menu li a{display:block;padding:10px 18px;text-decoration:none}
/* hero */
.cr-hero{position:relative;min-height:max(100svh,600px);display:grid;grid-template-columns:5% 41% 1fr;align-items:center;overflow:clip;isolation:isolate}
.cr-world{position:absolute;inset:0;z-index:0;overflow:hidden}
.cr-backdrop{position:absolute;inset:-6%}
.cr-light{position:absolute;inset:0;pointer-events:none}
.cr-stage{position:absolute;inset:0;z-index:4;transform-origin:70% 60%;will-change:transform}
.cr-layer{position:absolute;margin:0;left:calc(var(--x)*1%);top:calc(var(--y)*1%);width:calc(var(--w)*1%);height:calc(var(--h)*1%);z-index:var(--z)}
.cr-par,.cr-in,.cr-loop,.cr-frame{position:absolute;inset:0}
.cr-par{will-change:transform}
.cr-img{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;object-position:50% 100%;display:block}
.cr-layer[data-fit="cover"] .cr-img{object-fit:cover;object-position:var(--focus)}
.cr-missing{display:none}
[data-img].is-missing .cr-img{visibility:hidden}
[data-img].is-missing .cr-missing{display:flex;position:absolute;inset:0;align-items:center;justify-content:center;background:radial-gradient(circle at 50% 45%,rgba(var(--accent-rgb),.35),rgba(var(--accent-rgb),.08) 60%,transparent 70%);font-family:var(--display);font-weight:var(--dw);color:var(--ink);font-size:clamp(28px,8vw,120px);letter-spacing:.02em;text-align:center}
.cr-section [data-img].is-missing .cr-missing{font-family:var(--body);font-size:14px;font-weight:500;background:rgba(var(--ink-rgb),.06);border:1px dashed rgba(var(--ink-rgb),.25)}
/* shadows and frames */
.cr-layer[data-shadow="drop"] .cr-img{filter:drop-shadow(0 18px 24px rgba(0,0,0,.35))}
.cr-layer[data-shadow="glow"] .cr-img{filter:drop-shadow(0 0 1.2px rgba(var(--glow-rgb),.75)) drop-shadow(0 0 26px rgba(var(--glow-rgb),.45)) drop-shadow(0 12px 18px rgba(0,0,0,.35))}
.cr-layer[data-shadow="floor"] .cr-img{filter:drop-shadow(0 10px 14px rgba(0,0,0,.28))}
.cr-floor{position:absolute;left:12%;right:12%;bottom:-3%;height:9%;border-radius:50%;background:radial-gradient(closest-side,rgba(0,0,0,.45),rgba(0,0,0,0));filter:blur(2px)}
.cr-layer[data-frame="window"] .cr-frame{border-radius:22px;overflow:hidden;box-shadow:0 30px 60px rgba(0,0,0,.35),inset 0 0 0 1px rgba(255,255,255,.15)}
.cr-layer[data-frame="frame"] .cr-frame{border:clamp(8px,1.1vw,16px) solid #2b2016;outline:2px solid rgba(var(--accent-rgb),.8);outline-offset:-6px;box-shadow:0 30px 70px rgba(0,0,0,.5);overflow:hidden;background:#111}
.cr-layer[data-frame="arch"] .cr-frame{border-radius:999px 999px 18px 18px;overflow:hidden;box-shadow:0 30px 60px rgba(0,0,0,.3)}
.cr-layer[data-frame="porthole"] .cr-frame{border-radius:50%;overflow:hidden;border:clamp(10px,1.4vw,20px) solid #b8893d;box-shadow:inset 0 0 40px rgba(0,0,0,.45),0 0 0 4px #6d4b1c,0 30px 60px rgba(0,0,0,.45)}
.cr-layer[data-frame="porthole"] .cr-frame::after{content:"";position:absolute;inset:0;border-radius:50%;background:linear-gradient(135deg,rgba(255,255,255,.35),rgba(255,255,255,0) 40%)}
.cr-plinth{position:absolute;left:calc(var(--x)*1%);top:calc(var(--y)*1%);width:calc(var(--w)*1%);height:22%;z-index:2}
.cr-plinth .cr-in{position:absolute;inset:0;border-radius:50% 50% 6px 6px/14% 14% 6px 6px;background:linear-gradient(180deg,rgba(var(--glow-rgb),.20),rgba(0,0,0,.35) 18%,rgba(0,0,0,.6));box-shadow:inset 0 2px 0 rgba(var(--glow-rgb),.25)}
/* title */
.cr-title{grid-column:2;position:relative;z-index:6;padding:calc(var(--nav) + 6vh) 0 8vh;container-type:inline-size}
.cr-hero[data-title-d="bottom"]{align-items:end;grid-template-columns:5% 56% 1fr}
.cr-hero[data-title-d="bottom"] .cr-title{padding-bottom:6vh}
.cr-kicker{margin:0 0 14px;text-transform:uppercase;letter-spacing:.22em;font-size:13px;color:var(--accent);font-weight:600}
.cr-h1{margin:0;font-family:var(--display);font-weight:var(--dw);line-height:.92;letter-spacing:-.02em;font-size:min(clamp(3rem,7.4vw,7.6rem),calc(170cqi / var(--lw)));text-wrap:balance}
.cr-h1[data-len="l"]{font-size:min(clamp(2.4rem,4.8vw,5rem),calc(170cqi / var(--lw)))}
html[data-display="grotesk"] .cr-h1{letter-spacing:-.045em;text-transform:none}
.cr-tagline{margin:18px 0 0;font-size:clamp(19px,1.7vw,25px);line-height:1.35;color:var(--ink);opacity:.92;font-family:var(--display);font-style:italic;max-width:32ch}
html[data-display="grotesk"] .cr-tagline,html[data-display="rounded"] .cr-tagline{font-style:normal}
.cr-lede{margin:20px 0 0;max-width:46ch;color:var(--muted);font-size:16px}
.cr-cta{display:inline-flex;align-items:center;gap:10px;margin-top:26px;padding:12px 20px;border-radius:99px;background:var(--accent);color:var(--bg);text-decoration:none;font-weight:700;font-size:15px}
.cr-cta span{display:inline-block}
.cr-cta:focus-visible,.cr-links a:focus-visible,.cr-top:focus-visible{outline:3px solid var(--glow);outline-offset:3px}
.cr-herocredit{position:absolute;right:14px;bottom:8px;margin:0;font-size:11px;opacity:.6;z-index:6;max-width:50%;text-align:right}
.cr-cite{font-size:.62em;vertical-align:super;margin-left:3px;text-decoration:none;color:var(--accent)}
.cr-echo{position:absolute;inset:auto -5% 6% -5%;font-family:var(--display);font-weight:var(--dw);font-size:24vw;line-height:.8;white-space:nowrap;opacity:.07;text-align:center}
.cr-hero[data-layout="panorama"] .cr-stage::after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(var(--bg-rgb),.3),rgba(var(--bg-rgb),0) 22%,rgba(var(--bg-rgb),0) 42%,rgba(var(--bg-rgb),.78) 62%,rgba(var(--bg-rgb),.94) 82%),linear-gradient(90deg,rgba(var(--bg-rgb),.55),rgba(var(--bg-rgb),0) 60%);z-index:8}
.cr-hero[data-layout="panorama"] .cr-lede{color:var(--ink);opacity:.86}
.cr-hero[data-layout="type"]{grid-template-columns:8% 84% 1fr}.cr-hero[data-layout="type"] .cr-title{text-align:center}.cr-hero[data-layout="type"] .cr-tagline,.cr-hero[data-layout="type"] .cr-lede{margin-left:auto;margin-right:auto}
/* worlds */
html[data-world="monument"] .cr-backdrop{background:radial-gradient(ellipse 55% 75% at 70% -5%,rgba(var(--glow-rgb),.55),rgba(var(--glow-rgb),0) 60%),radial-gradient(ellipse 80% 40% at 70% 100%,var(--bg2),var(--bg) 70%),var(--bg)}
html[data-world="studio"] .cr-backdrop{background:linear-gradient(180deg,var(--bg) 0,var(--bg) 58%,var(--bg2) 100%),var(--bg)}
html[data-world="studio"] .cr-backdrop::after{content:"";position:absolute;inset:0;background:radial-gradient(ellipse 50% 60% at 70% 40%,rgba(255,255,255,.55),transparent 70%)}
html[data-world="fog"] .cr-backdrop{background:radial-gradient(ellipse 40% 50% at 78% 18%,rgba(var(--glow-rgb),.35),transparent 65%),linear-gradient(180deg,var(--bg2),var(--bg) 75%)}
html[data-world="underwater"] .cr-backdrop{background:linear-gradient(180deg,var(--bg2) 0,var(--bg) 70%,#0b3a4a 88%,#c9b88a 100%)}
html[data-world="underwater"] .cr-backdrop::before{content:"";position:absolute;inset:-20% 0 0 0;background:repeating-linear-gradient(100deg,rgba(255,255,255,.10) 0 3%,transparent 3% 9%);mask-image:linear-gradient(180deg,#000,transparent 70%);-webkit-mask-image:linear-gradient(180deg,#000,transparent 70%);animation:cr-rays calc(14s / var(--k)) ease-in-out infinite alternate}
html[data-world="night"] .cr-backdrop{background:radial-gradient(circle at 100% 110%,rgba(var(--accent-rgb),.55),rgba(var(--accent-rgb),0) 38%),radial-gradient(ellipse at 30% 20%,var(--bg2),var(--bg) 70%)}
html[data-world="sky"] .cr-backdrop{background:linear-gradient(180deg,var(--bg) 0,var(--bg2) 100%)}
html[data-world="warm"] .cr-backdrop{background:radial-gradient(ellipse 60% 70% at 68% 20%,rgba(var(--glow-rgb),.35),transparent 65%),linear-gradient(180deg,var(--bg2),var(--bg) 70%)}
html[data-world="paper"] .cr-backdrop{background:repeating-linear-gradient(0deg,rgba(0,0,0,.018) 0 2px,transparent 2px 5px),radial-gradient(ellipse at 60% 40%,var(--bg),var(--bg2))}
.cr-light[data-light="spot"]{background:conic-gradient(from 180deg at 68% -10%,transparent 0 160deg,rgba(var(--glow-rgb),.13) 170deg,rgba(var(--glow-rgb),.2) 180deg,rgba(var(--glow-rgb),.13) 190deg,transparent 200deg);animation:cr-breath calc(9s / var(--k)) ease-in-out infinite}
.cr-light[data-light="lamp"]{background:radial-gradient(circle at 80% 16%,rgba(var(--glow-rgb),.35),transparent 35%);animation:cr-flicker 7s steps(1) infinite}
.cr-light[data-light="caustics"]{background:radial-gradient(ellipse 30% 12% at 30% 20%,rgba(255,255,255,.12),transparent 70%),radial-gradient(ellipse 25% 10% at 70% 35%,rgba(255,255,255,.1),transparent 70%);animation:cr-caustic calc(11s / var(--k)) ease-in-out infinite alternate}
.cr-light[data-light="rim"]{background:radial-gradient(circle at 75% 45%,rgba(var(--glow-rgb),.16),transparent 45%)}
.cr-light[data-light="sun"]{background:radial-gradient(circle at 85% 10%,rgba(255,255,255,.9),rgba(255,248,220,.35) 12%,transparent 40%)}
/* particles */
.cr-particles{position:absolute;inset:0}
.cr-particles i{position:absolute;left:calc(var(--px)*1%);top:calc(var(--py)*1%);width:calc(var(--ps)*1vw);height:calc(var(--ps)*1vw);border-radius:50%;animation:cr-p var(--pt) linear infinite;animation-delay:var(--pd)}
.cr-particles[data-kind="dust"] i{background:rgba(var(--glow-rgb),.7);box-shadow:0 0 6px rgba(var(--glow-rgb),.6);animation-name:cr-dust}
.cr-particles[data-kind="bubbles"] i{border:1.5px solid rgba(255,255,255,.55);background:radial-gradient(circle at 30% 30%,rgba(255,255,255,.5),rgba(255,255,255,.04) 60%);animation-name:cr-rise}
.cr-particles[data-kind="fog"] i{background:radial-gradient(closest-side,rgba(200,210,220,.13),transparent);animation-name:cr-fog;border-radius:40%}
.cr-particles[data-kind="clouds"] i{height:calc(var(--ps)*.4vw);background:radial-gradient(closest-side,rgba(255,255,255,.85),rgba(255,255,255,0));animation-name:cr-cloud}
.cr-particles[data-kind="steam"] i{width:calc(var(--ps)*1vw);height:calc(var(--ps)*2.4vw);background:radial-gradient(closest-side,rgba(255,255,255,.14),transparent);animation-name:cr-steam}
.cr-stars{position:absolute;left:0;top:0;width:1px;height:1px;border-radius:50%}
.cr-stars-b{animation:cr-twinkle 5s ease-in-out infinite alternate}
@keyframes cr-dust{0%{transform:translate3d(0,0,0);opacity:0}20%{opacity:.8}100%{transform:translate3d(3vw,-18vh,0);opacity:0}}
@keyframes cr-rise{0%{transform:translate3d(0,30vh,0);opacity:0}15%{opacity:.9}100%{transform:translate3d(1.5vw,-60vh,0);opacity:0}}
@keyframes cr-fog{0%{transform:translate3d(-10vw,0,0)}50%{transform:translate3d(8vw,-2vh,0)}100%{transform:translate3d(-10vw,0,0)}}
@keyframes cr-cloud{0%{transform:translate3d(-30vw,0,0)}100%{transform:translate3d(30vw,0,0)}}
@keyframes cr-steam{0%{transform:translate3d(0,10vh,0) scale(.6);opacity:0}30%{opacity:1}100%{transform:translate3d(2vw,-30vh,0) scale(1.4);opacity:0}}
@keyframes cr-twinkle{0%{opacity:.25}100%{opacity:1}}
@keyframes cr-rays{0%{transform:translateX(-2%) skewX(-2deg)}100%{transform:translateX(2%) skewX(2deg)}}
@keyframes cr-breath{0%,100%{opacity:.75}50%{opacity:1}}
@keyframes cr-flicker{0%,100%{opacity:1}47%{opacity:.86}49%{opacity:1}83%{opacity:.93}}
@keyframes cr-caustic{0%{transform:translate3d(-2%,0,0) scale(1)}100%{transform:translate3d(3%,2%,0) scale(1.08)}}
/* entrance (only when scripting runs; without it everything is simply shown) */
.cr-js .cr-in{transition:transform var(--dur) cubic-bezier(.2,.9,.25,1) var(--delay),opacity calc(var(--dur)*.7) ease var(--delay),clip-path var(--dur) cubic-bezier(.6,0,.2,1) var(--delay)}
.cr-js .cr-hero:not(.is-in) [data-entrance="rise"] .cr-in{transform:translate3d(0,14%,0);opacity:0}
.cr-js .cr-hero:not(.is-in) [data-entrance="descend"] .cr-in{transform:translate3d(0,-55%,0) rotate(-5deg);opacity:0}
.cr-js [data-entrance="descend"] .cr-in{transition-timing-function:cubic-bezier(.3,1.35,.45,1),ease,ease}
.cr-js .cr-hero:not(.is-in) [data-entrance="pop"] .cr-in{transform:scale(.55);opacity:0}
.cr-js [data-entrance="pop"] .cr-in{transition-timing-function:cubic-bezier(.3,1.5,.5,1),ease,ease}
.cr-js .cr-hero:not(.is-in) [data-entrance="fade"] .cr-in{opacity:0}
.cr-js .cr-hero:not(.is-in) [data-entrance="unveil"] .cr-in{clip-path:inset(100% 0 0 0);transform:scale(1.06)}
.cr-js [data-entrance="unveil"] .cr-in{clip-path:inset(0 0 0 0)}
.cr-js .cr-hero:not(.is-in) [data-entrance="dolly"] .cr-in{transform:scale(1.14);opacity:0}
.cr-js .cr-hero:not(.is-in) .cr-plinth .cr-in{transform:scaleX(.4);opacity:0}
.cr-js .cr-plinth .cr-in{--dur:1.2s;--delay:.2s}
.cr-js .cr-t{transition:transform .9s cubic-bezier(.2,.9,.25,1) calc(.12s + var(--i)*.1s),opacity .8s ease calc(.12s + var(--i)*.1s)}
.cr-js .cr-hero:not(.is-title) .cr-t{opacity:0;transform:translate3d(0,24px,0)}
/* ambient loops (start once the entrance has finished) */
.cr-hero.is-in .cr-loop{animation:var(--loopname,none) calc(var(--period) / var(--k)) ease-in-out calc(var(--delay) + var(--dur)) infinite}
[data-loop="float"]{--loopname:cr-float}[data-loop="sway"]{--loopname:cr-sway}[data-loop="swim"]{--loopname:cr-swim}[data-loop="breathe"]{--loopname:cr-breathe}
.cr-layer[data-loop="drift"] .cr-loop{--loopname:none}
.cr-hero.is-in .cr-layer[data-loop="drift"] .cr-img{animation:cr-drift calc(var(--period) / var(--k)) ease-in-out calc(var(--delay) + var(--dur)) infinite alternate}
@keyframes cr-float{0%,100%{transform:translate3d(0,0,0)}50%{transform:translate3d(0,calc(var(--amp)*var(--k)*-1.4%),0)}}
@keyframes cr-sway{0%,100%{transform:rotate(calc(var(--amp)*var(--k)*-1.2deg))}50%{transform:rotate(calc(var(--amp)*var(--k)*1.2deg))}}
@keyframes cr-swim{0%,100%{transform:translate3d(0,0,0) rotate(0)}25%{transform:translate3d(calc(var(--amp)*var(--k)*1.6%),calc(var(--amp)*var(--k)*-1%),0) rotate(calc(var(--amp)*var(--k)*1deg))}75%{transform:translate3d(calc(var(--amp)*var(--k)*-1.6%),calc(var(--amp)*var(--k)*.6%),0) rotate(calc(var(--amp)*var(--k)*-1deg))}}
@keyframes cr-breathe{0%,100%{transform:scale(1)}50%{transform:scale(calc(1 + var(--amp)*var(--k)*.014))}}
@keyframes cr-drift{0%{transform:scale(1.02) translate3d(-1%,0,0)}100%{transform:scale(1.08) translate3d(1%,-1%,0)}}
/* the connector */
.cr-connector{position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none;z-index:3;overflow:visible}
.cr-connector .cr-dot{transition:opacity .5s ease,transform .6s cubic-bezier(.3,1.4,.5,1);transform-box:fill-box;transform-origin:center}
.cr-connector .cr-dot:not(.on){opacity:0;transform:scale(.3)}
/* sections */
.cr-section{position:relative;padding:clamp(80px,12vh,150px) var(--gutter);overflow-x:clip}
main{overflow-x:clip}
.cr-wrap{max-width:1080px;margin:0 auto;position:relative}
.cr-wrap.cr-wide{max-width:1320px}
.cr-anchor{position:absolute;left:0;right:0;top:50%;height:1px}
.cr-eyebrow{margin:0 0 12px;text-transform:uppercase;letter-spacing:.2em;font-size:12px;font-weight:700;color:var(--accent)}
.cr-eyebrow.is-imagined::before{content:"✦ ";letter-spacing:0}
.cr-h2{margin:0 0 30px;font-family:var(--display);font-weight:var(--dw);font-size:clamp(2rem,4.4vw,3.8rem);line-height:1;letter-spacing:-.015em;text-wrap:balance;overflow-wrap:anywhere}
.cr-h2-quiet{font-size:clamp(1.8rem,3.4vw,3rem)}
.cr-section:nth-of-type(even){background:linear-gradient(180deg,rgba(var(--ink-rgb),.035),rgba(var(--ink-rgb),0))}
.cr-js .cr-reveal .cr-item,.cr-js .cr-reveal.cr-item,.cr-js .cr-column p.cr-reveal,.cr-js .cr-card.cr-reveal,.cr-js .cr-pinned.cr-reveal{opacity:0;transform:translate3d(0,26px,0);transition:opacity .7s ease calc(var(--i,0)*.09s),transform .8s cubic-bezier(.2,.9,.25,1) calc(var(--i,0)*.09s)}
.cr-js .is-seen .cr-item,.cr-js .cr-item.is-seen,.cr-js .cr-column p.is-seen,.cr-js .cr-card.is-seen,.cr-js .cr-pinned.is-seen{opacity:1;transform:none}
.cr-js .cr-section.cr-reveal .cr-h2,.cr-js .cr-section.cr-reveal .cr-eyebrow{opacity:0;transform:translate3d(0,18px,0);transition:opacity .7s ease,transform .8s cubic-bezier(.2,.9,.25,1)}
.cr-js .cr-section.is-seen .cr-h2,.cr-js .cr-section.is-seen .cr-eyebrow{opacity:1;transform:none}
.cr-statement{font-family:var(--display);font-weight:var(--dw);font-size:clamp(1.9rem,4.2vw,3.9rem);line-height:1.1;margin:0;max-width:24ch;text-wrap:balance}
.cr-js .cr-word{display:inline-block;opacity:.12;transform:translate3d(0,.3em,0);transition:opacity .6s ease calc(var(--i)*.035s),transform .7s cubic-bezier(.2,.9,.25,1) calc(var(--i)*.035s)}
.cr-js .is-seen .cr-word{opacity:1;transform:none}
.cr-body{max-width:60ch;color:var(--muted);font-size:18px;margin:26px 0 0}
.cr-specimen{display:grid;grid-template-columns:minmax(0,5fr) minmax(0,6fr);gap:clamp(24px,5vw,80px);align-items:center}
.cr-specimen-art{position:relative;aspect-ratio:3/4;max-height:78vh}
.cr-spin{position:absolute;inset:0;will-change:transform}
.cr-specimen-art .cr-img{filter:drop-shadow(0 30px 40px rgba(0,0,0,.35))}
.cr-callouts{list-style:none;padding:0;margin:0;counter-reset:c}
.cr-callouts .cr-item{counter-increment:c;position:relative;padding:18px 0 18px 64px;border-top:1px solid rgba(var(--ink-rgb),.2)}
.cr-callouts .cr-item::before{content:counter(c,decimal-leading-zero);position:absolute;left:0;top:14px;font-family:var(--display);font-size:30px;color:var(--accent);font-weight:var(--dw)}
.cr-callouts .cr-item::after{content:"";position:absolute;left:0;top:-1px;height:2px;width:0;background:var(--accent);transition:width 1s cubic-bezier(.6,0,.2,1) calc(.2s + var(--i)*.15s)}
.cr-callouts .cr-item.is-seen::after,.is-seen .cr-callouts .cr-item::after{width:48px}
.cr-dossier{display:grid;grid-template-columns:minmax(0,4fr) minmax(0,6fr);gap:clamp(24px,5vw,70px);align-items:start}
.cr-pinned{transform:rotate(-2.5deg)}
.cr-js .cr-pinned.is-seen{transform:rotate(-2.5deg)}
.cr-photo{margin:0;position:relative;background:#f4efe6;padding:12px 12px 14px;box-shadow:0 20px 50px rgba(0,0,0,.35);color:#2a241d}
.cr-photo .cr-img{position:relative;height:auto;aspect-ratio:var(--ar);object-fit:cover;object-position:50% 30%}
.cr-photo[data-img].is-missing .cr-img{visibility:hidden}
.cr-photo figcaption{font-size:13px;margin-top:10px;line-height:1.35}.cr-photo figcaption small{display:block;opacity:.7;font-size:11px;margin-top:4px}
.cr-pinned .cr-photo::before{content:"";position:absolute;top:-14px;left:50%;width:90px;height:26px;margin-left:-45px;background:rgba(var(--glow-rgb),.55);transform:rotate(3deg);z-index:2}
.cr-file{background:rgba(var(--ink-rgb),.04);border:1px solid rgba(var(--ink-rgb),.14);padding:clamp(22px,3vw,40px);border-radius:4px}
.cr-list{list-style:none;padding:0;margin:0}.cr-list .cr-item{padding:12px 0 12px 22px;position:relative;border-bottom:1px dashed rgba(var(--ink-rgb),.18)}.cr-list .cr-item::before{content:"";position:absolute;left:0;top:22px;width:8px;height:8px;background:var(--accent);border-radius:50%}
.cr-plate{margin:0;position:relative;overflow:hidden;border-radius:6px;aspect-ratio:var(--ar);max-height:88vh;width:100%;background:rgba(var(--ink-rgb),.06)}
.cr-plate .cr-img{object-fit:cover;transform:scale(1.12);will-change:transform}
.cr-plate figcaption{position:absolute;left:0;right:0;bottom:0;padding:60px clamp(16px,3vw,40px) 18px;background:linear-gradient(transparent,rgba(0,0,0,.72));color:#fff;display:flex;justify-content:space-between;gap:16px;align-items:end;flex-wrap:wrap}
.cr-plate figcaption span{font-family:var(--display);font-size:clamp(18px,2.2vw,28px);max-width:40ch}.cr-plate figcaption small{opacity:.75;font-size:12px}
.cr-ledger{list-style:none;padding:0;margin:0;counter-reset:l;columns:2 340px;column-gap:56px}
.cr-ledger .cr-item{break-inside:avoid;counter-increment:l;padding:0 0 30px 0;position:relative;font-size:18px}
.cr-ledger .cr-item::before{content:counter(l);display:block;font-family:var(--display);font-weight:var(--dw);font-size:54px;line-height:1;color:var(--accent);margin-bottom:8px}
.cr-rail{list-style:none;margin:0;padding:0 0 0 30px;border-left:2px solid rgba(var(--accent-rgb),.5)}
.cr-rail .cr-item{position:relative;padding:0 0 34px 20px}
.cr-rail .cr-item::before{content:"";position:absolute;left:-39px;top:10px;width:14px;height:14px;border-radius:50%;background:var(--accent);box-shadow:0 0 0 5px rgba(var(--accent-rgb),.2)}
.cr-year{display:block;font-family:var(--display);font-weight:var(--dw);font-size:34px;line-height:1.1;color:var(--accent)}
.cr-scatter{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,260px),1fr));gap:clamp(20px,3vw,44px);align-items:start}
.cr-card:nth-child(3n+1){transform:rotate(-1.6deg)}.cr-card:nth-child(3n+2){transform:rotate(1.2deg);margin-top:40px}.cr-card:nth-child(3n){transform:rotate(-.6deg);margin-top:12px}
.cr-js .cr-card.cr-reveal:not(.is-seen){transform:translate3d(0,40px,0) rotate(3deg)}
.cr-notes{list-style:none;padding:0;margin:0;display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,240px),1fr));gap:22px}
.cr-notes .cr-item{background:rgba(var(--glow-rgb),.16);border:1px solid rgba(var(--glow-rgb),.35);padding:22px;border-radius:14px 14px 14px 2px;font-size:18px;font-family:var(--display)}
.cr-note{font-size:14px;color:var(--muted);border-left:3px solid var(--accent);padding-left:12px;margin:-10px 0 26px;max-width:60ch}
.cr-columns{list-style:none;padding:0;margin:0;display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,260px),1fr));gap:28px;color:var(--muted)}
.cr-column{max-width:640px}.cr-column p{font-family:var(--display);font-size:clamp(20px,2vw,25px);line-height:1.5;margin:0 0 22px}
.cr-ask{border:2px dashed rgba(var(--accent-rgb),.7);border-radius:16px;padding:28px}
.cr-closing{text-align:center;display:flex;flex-direction:column;align-items:center;gap:22px}
.cr-echo-art{position:relative;width:min(46vw,300px);aspect-ratio:1}
.cr-echo-art .cr-img{animation:cr-float calc(8s / var(--k)) ease-in-out infinite;--amp:1.4;filter:drop-shadow(0 20px 30px rgba(0,0,0,.35))}
.cr-echo-art.is-framed{border-radius:50%;overflow:hidden;border:6px solid rgba(var(--accent-rgb),.85);box-shadow:0 24px 50px rgba(0,0,0,.35);width:min(40vw,240px)}
.cr-echo-art.is-framed .cr-img{object-fit:cover;object-position:var(--focus);animation:none;filter:none}
.cr-closing-line{font-family:var(--display);font-weight:var(--dw);font-size:clamp(2rem,5vw,4.4rem);line-height:1.05;margin:0;max-width:20ch;text-wrap:balance}
.cr-top{font-size:14px;letter-spacing:.08em;text-transform:uppercase}
.cr-sources{font-size:14px;color:var(--muted);background:rgba(0,0,0,.12)}
.cr-sources .cr-h2{font-size:clamp(1.6rem,2.6vw,2.2rem);color:var(--ink)}
.cr-sources h3{font-size:14px;letter-spacing:.14em;text-transform:uppercase;color:var(--ink);margin:28px 0 10px}
.cr-factlist,.cr-credits{padding-left:22px;margin:0}.cr-factlist li,.cr-credits li{margin:0 0 8px;overflow-wrap:anywhere}
.cr-kinds{max-width:70ch}
.cr-footer{padding:40px var(--gutter);font-size:13px;color:var(--muted);border-top:1px solid rgba(var(--ink-rgb),.12);display:flex;justify-content:space-between;gap:20px;flex-wrap:wrap}
.cr-footer p{margin:0;max-width:70ch}
/* phones: the headline above the picture, the picture on its own stage, the rest below */
@media (max-width:720px){
  :root{--gutter:20px;--nav:54px}
  body{font-size:16px}
  .cr-links{display:none}.cr-menu{display:block}
  .cr-hero,.cr-hero[data-title-d]{display:flex;flex-direction:column;align-items:stretch;min-height:100svh}
  .cr-stage{align-self:stretch;width:auto}
  .cr-hero[data-layout="panorama"] .cr-stage{margin:0}
  .cr-title{display:contents}
  .cr-title-head{order:1;padding:calc(var(--nav) + 18px) 20px 6px 28px;position:relative;z-index:6;container-type:inline-size}
  .cr-stage{order:2;position:relative;inset:auto;height:min(111vw,62svh);flex:0 0 auto;margin:0 0 0 8px}
  .cr-title-foot{order:3;padding:6px 20px 36px 28px;position:relative;z-index:6}
  .cr-hero[data-title-m="bottom"] .cr-title-head{order:3}.cr-hero[data-title-m="bottom"] .cr-title-foot{order:4}
  .cr-layer{left:calc(var(--mx)*1%);top:calc(var(--my)*1%);width:calc(var(--mw)*1%);height:calc(var(--mh)*1%)}
  .cr-layer[data-hide-m]{display:none}
  .cr-plinth{left:calc(var(--mx)*1%);top:calc(var(--my)*1%);width:calc(var(--mw)*1%);height:16%}
  .cr-h1{font-size:min(15vw,calc(165cqi / var(--lw)))}.cr-h1[data-len="l"]{font-size:min(10vw,calc(165cqi / var(--lw)))}
  .cr-tagline{font-size:18px;margin-top:12px}
  .cr-lede{font-size:15px;margin-top:8px}
  .cr-cta{margin-top:16px}
  .cr-herocredit{position:static;order:5;padding:0 20px 12px 28px;max-width:none;text-align:left}
  .cr-hero[data-layout="panorama"] .cr-stage::after{background:linear-gradient(180deg,rgba(var(--bg-rgb),0) 60%,rgba(var(--bg-rgb),.9))}
  .cr-section{padding:72px 20px 72px 28px}
  .cr-specimen,.cr-dossier{grid-template-columns:1fr}
  .cr-specimen-art{max-height:none;width:min(100%,360px);margin:0 auto}
  .cr-ledger{columns:1}
  .cr-card:nth-child(n){margin-top:0}
  .cr-plate{aspect-ratio:auto;height:auto}.cr-plate .cr-img{position:relative;height:auto;aspect-ratio:var(--ar)}
  .cr-plate figcaption{position:static;background:none;color:inherit;padding:12px 0 0}
  .cr-echo{font-size:30vw}
}
/* reduced motion: the complete composition, still */
html[data-motion="reduced"] *,html[data-motion="reduced"] *::before,html[data-motion="reduced"] *::after{animation:none!important;transition:none!important}
html[data-motion="reduced"] .cr-in,html[data-motion="reduced"] .cr-t,html[data-motion="reduced"] .cr-reveal,html[data-motion="reduced"] .cr-item,html[data-motion="reduced"] .cr-word,html[data-motion="reduced"] .cr-card,html[data-motion="reduced"] .cr-pinned,html[data-motion="reduced"] .cr-h2,html[data-motion="reduced"] .cr-eyebrow,html[data-motion="reduced"] .cr-column p{opacity:1!important;clip-path:none!important}
html[data-motion="reduced"] .cr-hero .cr-in,html[data-motion="reduced"] .cr-t,html[data-motion="reduced"] .cr-item,html[data-motion="reduced"] .cr-word,html[data-motion="reduced"] .cr-h2,html[data-motion="reduced"] .cr-eyebrow,html[data-motion="reduced"] .cr-column p{transform:none!important}
html[data-motion="reduced"] .cr-card.cr-reveal:not(.is-seen){transform:none}
html[data-motion="reduced"] .cr-callouts .cr-item::after{width:48px}
html[data-motion="reduced"] .cr-connector .cr-dot{opacity:1;transform:none}
@media (prefers-reduced-motion:reduce){html{scroll-behavior:auto}}
.cr-fixture{position:fixed;left:10px;bottom:10px;z-index:60;margin:0;max-width:min(340px,calc(100vw - 20px));padding:6px 10px;border-radius:6px;background:#ffe14d;color:#111;font:600 12px/1.35 var(--body);box-shadow:0 4px 14px rgba(0,0,0,.3)}
@media print{.cr-nav,.cr-connector,.cr-world{display:none}.cr-hero{min-height:auto}}
`;
}

// ---------- the runtime (fixed code; reads only the numeric/enum scene config) ----------
const RUNTIME = `
(function(){
var d=document,html=d.documentElement,W=window;
var cfg={};try{cfg=JSON.parse(d.getElementById('cr-scene').textContent)}catch(e){}
function mq(q){return W.matchMedia&&W.matchMedia(q).matches}
function reduced(){return html.getAttribute('data-motion')==='reduced'}
if(mq('(prefers-reduced-motion: reduce)'))html.setAttribute('data-motion','reduced');
var hero=d.querySelector('.cr-hero'),stage=hero&&hero.querySelector('.cr-stage'),title=hero&&hero.querySelector('.cr-title');
/* images: a picture that fails keeps its place and shows a quiet stand-in instead */
function markMissing(img){var f=img.closest('[data-img]');if(f)f.classList.add('is-missing');W.__crMissing=(W.__crMissing||0)+1}
[].forEach.call(d.querySelectorAll('img[data-asset]'),function(img){
  if(!img.getAttribute('src')){markMissing(img);return}
  img.addEventListener('error',function(){markMissing(img)});
  img.addEventListener('load',function(){var f=img.closest('[data-img]');if(f)f.classList.remove('is-missing');layout()});
  if(img.complete&&img.naturalWidth===0)markMissing(img);
});
/* entrance: the headline at once, the scene when its subject has decoded (or after a short wait) */
function start(){if(!hero||hero.classList.contains('is-in'))return;hero.classList.add('is-in');W.__crEntered=Date.now()}
if(hero){
  requestAnimationFrame(function(){requestAnimationFrame(function(){hero.classList.add('is-title')})});
  var sub=hero.querySelector('[data-role="subject"] img');
  if(!sub||reduced())start();
  else{var go=function(){requestAnimationFrame(start)};if(sub.decode)sub.decode().then(go,go);else if(sub.complete)go();else{sub.addEventListener('load',go);sub.addEventListener('error',go)}setTimeout(start,2500)}
}
/* sections reveal once, as they arrive */
var io=('IntersectionObserver' in W)?new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting){e.target.classList.add('is-seen');io.unobserve(e.target)}})},{rootMargin:'0px 0px -10% 0px',threshold:0}):null;
[].forEach.call(d.querySelectorAll('.cr-reveal'),function(el){if(io&&!reduced())io.observe(el);else el.classList.add('is-seen')});
/* the connector: a path from the subject down through every section, drawn as the reader scrolls */
var startY=0,svg=d.querySelector('.cr-connector'),NS='http://www.w3.org/2000/svg',path=null,mask=null,len=0,table=[],dots=[],mainEl=d.getElementById('main');
function el(n,a){var e=d.createElementNS(NS,n);for(var k in a)e.setAttribute(k,a[k]);return e}
function subjectPoint(){
  var f=hero&&hero.querySelector('[data-role="subject"]');if(!f||!cfg.subject||cfg.subject.fit!=='contain')return null;
  var r=f.getBoundingClientRect(),m=mainEl.getBoundingClientRect();
  var w=r.width,h=r.height,x=r.left-m.left,y=r.top-m.top;
  if(cfg.subject.fit==='contain'){var a=cfg.subject.aspect;if(w/h>a){var nw=h*a;x+=(w-nw)/2;w=nw}else{var nh=w/a;y+=h-nh;h=nh}}
  var b=cfg.subject.bbox;return {x:x+w*(b[0]+(b[2]-b[0])*.5),y:y+h*(b[1]+(b[3]-b[1])*.97)};
}
function layout(){
  if(!svg||!mainEl||cfg.connector==='none')return;
  var mw=mainEl.clientWidth,mh=mainEl.scrollHeight,m=mainEl.getBoundingClientRect(),phone=mw<=720;
  svg.setAttribute('viewBox','0 0 '+mw+' '+mh);svg.setAttribute('width',mw);svg.setAttribute('height',mh);
  while(svg.firstChild)svg.removeChild(svg.firstChild);dots=[];
  var secs=[].slice.call(d.querySelectorAll('.cr-section:not(.cr-sources)')).filter(function(s){return s.offsetParent!==null});
  if(!secs.length)return;
  /* it runs down the side margins (half-way between the page edge and the nearest content) and only
     crosses the page in the empty band where one section meets the next -- never over text or pictures */
  var minLeft=mw;[].forEach.call(d.querySelectorAll('.cr-section .cr-wrap'),function(wr){var l=wr.getBoundingClientRect().left-m.left;if(l>0&&l<minLeft)minLeft=l});
  var side=phone?10:Math.max(10,Math.min(minLeft,200)/2),left=side,right=mw-side;
  var sp=subjectPoint(),hb=hero.offsetTop+hero.offsetHeight,band=phone?30:46;
  var pts=[];
  if(sp&&!phone)pts.push({x:sp.x,y:sp.y});else pts.push({x:left,y:hb-band});
  secs.forEach(function(s,i){var y=s.offsetTop+s.offsetHeight*0.5;pts.push({x:phone?left:(i%2?left:right),y:y,top:s.offsetTop})});
  startY=pts[0].y; /* nothing is drawn at rest: it starts unrolling when the reader scrolls */
  var f=function(v){return v.toFixed(1)},p='M'+f(pts[0].x)+' '+f(pts[0].y);
  for(var i=1;i<pts.length;i++){var a=pts[i-1],b=pts[i],yb=Math.max(a.y+band+2,b.top);
    p+=' L'+f(a.x)+' '+f(yb-band)+' C'+f(a.x)+' '+f(yb)+' '+f(b.x)+' '+f(yb)+' '+f(b.x)+' '+f(yb+band)+' L'+f(b.x)+' '+f(b.y)}
  var k=cfg.connector,accent=getComputedStyle(html).getPropertyValue('--accent').trim()||'#c33',wide=phone?8:30;
  var defs=el('defs',{});mask=el('path',{d:p,fill:'none',stroke:'#fff','stroke-width':wide+16,'stroke-linecap':'butt'});
  var mk=el('mask',{id:'cr-reveal-mask',maskUnits:'userSpaceOnUse',x:0,y:0,width:mw,height:mh});mk.appendChild(mask);defs.appendChild(mk);svg.appendChild(defs);
  var grp=el('g',{mask:'url(#cr-reveal-mask)'});
  if(k==='ribbon'){
    grp.appendChild(el('path',{d:p,fill:'none',stroke:'rgba(0,0,0,.28)','stroke-width':wide,transform:'translate(3 6)','stroke-linecap':'butt'}));
    grp.appendChild(el('path',{d:p,fill:'none',stroke:'#fbfaf6','stroke-width':wide,'stroke-linecap':'butt'}));
    grp.appendChild(el('path',{d:p,fill:'none',stroke:'rgba(0,0,0,.08)','stroke-width':wide*.62,'stroke-dasharray':'1 7'}));
    grp.appendChild(el('path',{d:p,fill:'none',stroke:'rgba(120,110,95,.55)','stroke-width':wide,'stroke-dasharray':'1.2 '+(phone?40:90)}));
  }else if(k==='thread'){grp.appendChild(el('path',{d:p,fill:'none',stroke:'#b3202a','stroke-width':phone?1.6:2.4}))}
  else if(k==='orbit'){grp.appendChild(el('path',{d:p,fill:'none',stroke:accent,'stroke-width':phone?2:3,'stroke-dasharray':'0.1 12','stroke-linecap':'round',opacity:.85}))}
  else if(k==='line'){grp.appendChild(el('path',{d:p,fill:'none',stroke:accent,'stroke-width':phone?1.5:2,opacity:.8}))}
  svg.appendChild(grp);
  path=mask;len=path.getTotalLength();table=[];for(var s=0;s<=240;s++){var q=path.getPointAtLength(len*s/240);table.push([q.y,len*s/240])}
  if(k==='bubbles'){for(var t=40;t<len;t+=phone?46:70){var q2=path.getPointAtLength(t),r=(phone?3:5)+((t*7919)%9);var c=el('circle',{cx:q2.x.toFixed(1),cy:q2.y.toFixed(1),r:r,fill:'rgba(255,255,255,.12)',stroke:'rgba(255,255,255,.6)','stroke-width':1.3,'class':'cr-dot'});c._at=t;svg.appendChild(c);dots.push(c)}}
  if(k==='thread'){pts.slice(1).forEach(function(pt){var c=el('circle',{cx:pt.x,cy:pt.y,r:phone?4:7,fill:'#b3202a',stroke:'#fff','stroke-width':2,'class':'cr-dot'});c._at=lenAtY(pt.y);svg.appendChild(c);dots.push(c)})}
  mask.setAttribute('stroke-dasharray',len+' '+len);
  frame();
}
function lenAtY(y){if(!table.length)return 0;if(y<=table[0][0])return 0;for(var i=1;i<table.length;i++){if(table[i][0]>=y){var a=table[i-1],b=table[i];return a[1]+(b[1]-a[1])*((y-a[0])/Math.max(1,b[0]-a[0]))}}return len}
/* per frame: camera push and parallax in the hero, the connector's drawn length */
var ticking=false;
function frame(){ticking=false;
  var y=W.scrollY||W.pageYOffset,vh=W.innerHeight,red=reduced();
  if(hero&&stage){var h=hero.offsetHeight,p=Math.max(0,Math.min(1,y/h)),phone=W.innerWidth<=720;
    if(!red&&p<1){[].forEach.call(hero.querySelectorAll('.cr-par'),function(l){var dep=+l.getAttribute('data-depth')||0;l.style.transform='translate3d(0,'+(-p*h*dep*(phone?.18:.32)).toFixed(1)+'px,0)'});
      stage.style.transform=cfg.camera&&!phone?'scale('+(1+p*.07).toFixed(4)+')':'';
      if(title&&!phone)title.style.transform='translate3d(0,'+(-p*70).toFixed(1)+'px,0)'}
    else if(red){[].forEach.call(hero.querySelectorAll('.cr-par'),function(l){l.style.transform=''});stage.style.transform='';if(title)title.style.transform=''}}
  [].forEach.call(d.querySelectorAll('.cr-plate .cr-img'),function(im){if(red){im.style.transform='';return}var r=im.parentNode.getBoundingClientRect();var q=(r.top+r.height/2-vh/2)/vh;im.style.transform='translate3d(0,'+(q*-4).toFixed(2)+'%,0) scale(1.12)'});
  [].forEach.call(d.querySelectorAll('.cr-spin'),function(sp){if(red){sp.style.transform='';return}var r=sp.getBoundingClientRect();var q=(r.top+r.height/2-vh/2)/vh;sp.style.transform='rotate('+(q*-6).toFixed(2)+'deg) translate3d(0,'+(q*-18).toFixed(1)+'px,0)'});
  if(mask){var mt=mainEl.getBoundingClientRect().top+y,tY=Math.min(y+vh*.66-mt,startY+y*1.6),drawn=red?len:Math.max(0,Math.min(len,lenAtY(tY)));mask.setAttribute('stroke-dashoffset',(len-drawn).toFixed(1));
    dots.forEach(function(c){c.classList.toggle('on',c._at<=drawn+1)})}
}
function onScroll(){if(!ticking){ticking=true;requestAnimationFrame(frame)}}
W.addEventListener('scroll',onScroll,{passive:true});
var rt;W.addEventListener('resize',function(){clearTimeout(rt);rt=setTimeout(layout,120)});
if('ResizeObserver' in W&&mainEl){var last=0;new ResizeObserver(function(){var h=mainEl.scrollHeight;if(Math.abs(h-last)>2){last=h;clearTimeout(rt);rt=setTimeout(layout,120)}}).observe(mainEl)}
if(d.readyState==='complete')layout();else W.addEventListener('load',layout);
setTimeout(layout,60);
W.__crLayout=layout;W.__crFrame=frame;
})();`;

// preview only: the studio edits text in place and switches motion without rebuilding the page
const PREVIEW_RUNTIME = `
(function(){var d=document,html=d.documentElement;
window.addEventListener('message',function(e){if(e.source!==window.parent)return;var m=e.data||{};
  if(m.type==='cr-edit'){[].forEach.call(d.querySelectorAll('[data-edit]'),function(n){if(n.getAttribute('data-edit')===m.key)n.textContent=String(m.text==null?'':m.text)});if(window.__crLayout)window.__crLayout()}
  else if(m.type==='cr-motion'){html.setAttribute('data-motion',m.motion==='reduced'?'reduced':'full');if(m.intensity)html.setAttribute('data-intensity',m.intensity==='calm'?'calm':'lively');[].forEach.call(d.querySelectorAll('.cr-reveal'),function(n){n.classList.add('is-seen')});if(window.__crFrame)window.__crFrame()}
  else if(m.type==='cr-replay'){var h=d.querySelector('.cr-hero');if(h){h.classList.remove('is-in','is-title');void h.offsetWidth;requestAnimationFrame(function(){h.classList.add('is-title');setTimeout(function(){h.classList.add('is-in')},80)})}}
});
d.addEventListener('click',function(e){var a=e.target.closest&&e.target.closest('a[href]');if(!a)return;var h=a.getAttribute('href');if(h&&h.charAt(0)==='#')return;e.preventDefault()});
})();`;

module.exports = { renderCreative, esc, cleanTitle, FONTS };
