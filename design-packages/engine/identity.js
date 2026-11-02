// The business's own logo and typeface, on any design.
//
//   identity.logo        their logo (a PNG with its background taken out by the studio, or any photo/https link). It
//                        replaces what the design shows at the top-left (the design's a.brand / a.logo), sized from its
//                        own shape so a wide wordmark and a square badge look the same weight; it's the site's icon too.
//   identity.logoColour  "Original", "White" or "Black". Left empty, the page picks: a one-colour logo that would
//                        disappear on the header (dark on dark, light on light) is shown white or black instead.
//   identity.type        a typeface pair from TYPES (headings + text). Left empty, the design keeps its own fonts.
//                        Every design sets its fonts through --display/--f-display and --body/--f-body, so the pair
//                        replaces those everywhere; the design's mono font stays. Text the design fits to its width
//                        (its fitText guards) and the headline are re-fitted in the browser once the font has loaded.
'use strict';

// display and body: [family, the weights to load ('' = the font's only one), the generic fallback]
const TYPES = {
  Modern: { display: ['Inter Tight', '400;600;700;800', 'sans-serif'], body: ['Inter', '400;500;600;700', 'sans-serif'], about: 'clean and current' },
  Editorial: { display: ['Playfair Display', '400;600;700;800', 'serif'], body: ['Source Sans 3', '400;600', 'sans-serif'], about: 'magazine serif' },
  Elegant: { display: ['Cormorant Garamond', '400;500;600;700', 'serif'], body: ['Jost', '400;500;600', 'sans-serif'], about: 'fine and light' },
  Bold: { display: ['Bebas Neue', '', 'sans-serif'], body: ['Inter', '400;500;600;700', 'sans-serif'], about: 'tall capitals' },
  Classic: { display: ['DM Serif Display', '', 'serif'], body: ['DM Sans', '400;500;700', 'sans-serif'], about: 'timeless serif' },
  Technical: { display: ['Space Grotesk', '400;500;600;700', 'sans-serif'], body: ['IBM Plex Sans', '400;500;600', 'sans-serif'], about: 'precise' },
  Warm: { display: ['Fraunces', '400;600;700;800', 'serif'], body: ['Manrope', '400;500;600;700', 'sans-serif'], about: 'soft serif' },
  Fashion: { display: ['Bodoni Moda', '400;600;700', 'serif'], body: ['Montserrat', '400;500;600', 'sans-serif'], about: 'high contrast' },
  Statement: { display: ['Archivo Black', '', 'sans-serif'], body: ['Archivo', '400;500;600', 'sans-serif'], about: 'heavy and loud' },
  Friendly: { display: ['Quicksand', '500;600;700', 'sans-serif'], body: ['Nunito', '400;600;700', 'sans-serif'], about: 'rounded' },
  Expressive: { display: ['Syne', '400;600;700;800', 'sans-serif'], body: ['Outfit', '400;500;600', 'sans-serif'], about: 'art-school' },
  Condensed: { display: ['Oswald', '400;500;600;700', 'sans-serif'], body: ['Source Sans 3', '400;600', 'sans-serif'], about: 'narrow and strong' },
  Wide: { display: ['Unbounded', '400;600;800', 'sans-serif'], body: ['Manrope', '400;500;600;700', 'sans-serif'], about: 'wide geometric' },
  Literary: { display: ['Instrument Serif', '', 'serif'], body: ['Inter', '400;500;600;700', 'sans-serif'], about: 'quiet serif' },
};
const COLOURS = ['Original', 'White', 'Black'];

const FIELDS = {
  'identity.logo': { kind: 'photo', offer: 'always', label: 'your logo: it replaces the name at the top of the site, sized to fit' },
  'identity.logoColour': { kind: 'choice', options: COLOURS, offer: 'always', label: 'the logo’s colour (the design’s own: chosen so it stands out)' },
  'identity.type': { kind: 'choice', options: Object.keys(TYPES), offer: 'always', label: 'the typeface' },
};

const fam = (f) => f[0].replace(/ /g, '+') + (f[1] ? `:wght@${f[1]}` : '');
const stack = (f) => `"${f[0]}",${f[2]}`;
function fontUrl(name) { const t = TYPES[name]; if (!t) return null; const fams = [t.display, t.body].filter((f, i, a) => a.findIndex((g) => g[0] === f[0]) === i); return `https://fonts.googleapis.com/css2?${fams.map((f) => 'family=' + fam(f)).join('&')}&display=swap`; }
// what the studio needs to show and preview the choices
// one stylesheet with just "Aa" in every heading font, for the studio's typeface buttons
function chipsUrl() { return `https://fonts.googleapis.com/css2?${Object.values(TYPES).map((t) => 'family=' + fam(t.display)).join('&')}&text=Aa&display=swap`; }
function publicTypes() { return Object.entries(TYPES).map(([name, t]) => ({ name, about: t.about, display: stack(t.display), body: stack(t.body), url: fontUrl(name) })); }
function typeCss(name) {
  const t = TYPES[name]; if (!t) return '';
  // (on every element, important: a design that sets its font variables on a wrapper is overridden there too)
  return `html.sr-type *{--display:${stack(t.display)}!important;--f-display:${stack(t.display)}!important;--body:${stack(t.body)}!important;--f-body:${stack(t.body)}!important}html.sr-typing body{opacity:0!important}`;
}

// a logo's pixel size, from its shape: the same visual weight whatever its proportions (area ~ 4300 px²), between
// 26 and 54 px tall and at most 210 px wide
function dims(src) {
  const m = /^data:image\/(png|jpeg|webp);base64,(.+)$/.exec(String(src || '')); if (!m) return null;
  let b; try { b = Buffer.from(m[2], 'base64'); } catch (e) { return null; }
  if (m[1] === 'png' && b.length > 24 && b.toString('ascii', 12, 16) === 'IHDR') return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
  if (m[1] === 'webp' && b.length > 30 && b.toString('ascii', 0, 4) === 'RIFF') {
    const k = b.toString('ascii', 12, 16);
    if (k === 'VP8X') return { w: 1 + b.readUIntLE(24, 3), h: 1 + b.readUIntLE(27, 3) };
    if (k === 'VP8 ') return { w: b.readUInt16LE(26) & 0x3fff, h: b.readUInt16LE(28) & 0x3fff };
    if (k === 'VP8L') { const v = b.readUInt32LE(21); return { w: 1 + (v & 0x3fff), h: 1 + ((v >> 14) & 0x3fff) }; }
  }
  if (m[1] === 'jpeg') for (let i = 2; i < b.length - 9;) {
    if (b[i] !== 0xff) { i++; continue; } const t = b[i + 1], len = b.readUInt16BE(i + 2);
    if (t >= 0xc0 && t <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(t)) return { w: b.readUInt16BE(i + 7), h: b.readUInt16BE(i + 5) };
    i += 2 + len;
  }
  return null;
}
function logoSize(src) {
  const d = dims(src), aspect = d && d.w > 0 && d.h > 0 ? d.w / d.h : 3;
  let h = Math.max(26, Math.min(54, Math.sqrt(4300 / aspect))), w = h * aspect;
  if (w > 210) { w = 210; h = w / aspect; }
  return { w: Math.round(w), h: Math.round(h) };
}

const attr = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
// the page script: re-fit text the design fits to its width once a chosen font has loaded, and (logo colour left to
// the page) show a one-colour logo white or black where it would disappear
function script(fit, autoColour) {
  // a chosen typeface: the page first lays out in the design's own fonts and measures its headlines (and the text the
  // design fits to its width), then switches to the chosen pair (html.sr-type) and shrinks any of them that now take
  // more room, so a wider font never breaks the layout. The page stays hidden for that moment (at most 2.5 s).
  return `<script>(function(){var F=${JSON.stringify(fit)},H=document.documentElement,orig=[];
function fitAll(useHeight){if(!F)return;orig.forEach(function(o){var e=o.e;e.style.fontSize='';var f=parseFloat(getComputedStyle(e).fontSize),k=0;while(k<10&&((useHeight&&o.h>0&&e.offsetHeight>o.h*1.04)||(e.clientWidth>0&&e.scrollWidth>e.clientWidth+2))){f*=0.94;e.style.fontSize=f+'px';k++;}});}
function bg(el){for(var e=el;e&&e.nodeType===1;e=e.parentElement){var c=getComputedStyle(e).backgroundColor,m=/rgba?\\(([\\d.]+),\\s*([\\d.]+),\\s*([\\d.]+)(?:,\\s*([\\d.]+))?/.exec(c);if(m&&(m[4]===undefined||+m[4]>0.5))return (0.2126*m[1]+0.7152*m[2]+0.0722*m[3])/255;}return 1;}
function tone(img){try{var c=document.createElement('canvas'),n=48;c.width=n;c.height=Math.max(1,Math.round(n*img.naturalHeight/img.naturalWidth));var x=c.getContext('2d');x.drawImage(img,0,0,c.width,c.height);var d=x.getImageData(0,0,c.width,c.height).data,L=0,S=0,k=0;for(var i=0;i<d.length;i+=4){if(d[i+3]<128)continue;var r=d[i]/255,g=d[i+1]/255,b=d[i+2]/255,mx=Math.max(r,g,b),mn=Math.min(r,g,b);L+=0.2126*r+0.7152*g+0.0722*b;S+=mx-mn;k++;}if(!k)return'';L/=k;S/=k;return S>0.18?'':L<0.4?'dark':L>0.7?'light':'';}catch(e){return'';}}
function colour(){${autoColour ? `document.querySelectorAll('img.sr-logo').forEach(function(img){var go=function(){var t=tone(img),b=bg(img.parentElement);img.style.filter=t==='dark'&&b<0.4?'brightness(0) invert(1)':t==='light'&&b>0.6?'brightness(0)':'';};if(img.complete)go();else img.addEventListener('load',go);});` : ''}}
function show(){H.classList.remove('sr-typing');}
function start(){colour();if(!F){return;}var ready=document.fonts&&document.fonts.ready?document.fonts.ready:Promise.resolve();
ready.then(function(){orig=[].map.call(document.querySelectorAll(F),function(e){return{e:e,h:e.offsetHeight};});H.classList.add('sr-type');return document.fonts&&document.fonts.ready?new Promise(function(r){requestAnimationFrame(function(){document.fonts.ready.then(r);});}):null;}).then(function(){fitAll(true);show();},show);}
if(F){H.classList.add('sr-typing');setTimeout(show,2500);}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();addEventListener('load',colour);addEventListener('resize',function(){clearTimeout(start.t);start.t=setTimeout(function(){fitAll(false);},150);});})();</script>`;
}

// the rendered page -> the page with the business's logo and typeface
function inject(html, content, manifest) {
  const id = (content && content.identity) || {}; let out = html, head = '', autoColour = false;
  const logo = typeof id.logo === 'string' && id.logo ? id.logo : null, type = TYPES[id.type] ? id.type : null;
  if (!logo && !type) return html;
  if (logo) {
    const m = /<a\b[^>]*\bclass="(?:[^"]*\s)?(?:brand|logo)(?:\s[^"]*)?"[^>]*>/.exec(out);
    const end = m ? out.indexOf('</a>', m.index + m[0].length) : -1;
    if (m && end > 0) {
      const s = logoSize(logo), filter = id.logoColour === 'White' ? 'brightness(0) invert(1)' : id.logoColour === 'Black' ? 'brightness(0)' : '';
      autoColour = !COLOURS.includes(id.logoColour);
      const img = `<img class="sr-logo" src="${attr(logo)}" alt="" width="${s.w}" height="${s.h}" style="--w:${s.w}px;--h:${s.h}px${filter ? `;filter:${filter}` : ''}">`;
      out = out.slice(0, m.index) + m[0].replace(/class="/, 'class="sr-logo-a ') + img + out.slice(end);
      head += `<style>.sr-logo-a{display:inline-flex!important;align-items:center;flex:0 0 auto;gap:0!important;padding-top:0!important;padding-bottom:0!important;background:none!important;border:0!important}.sr-logo{display:block;width:var(--w);height:var(--h);max-width:min(var(--w),46vw);object-fit:contain;object-position:left center}@media(max-width:640px){.sr-logo{width:calc(var(--w)*.84);height:calc(var(--h)*.84)}}</style>`;
      if (/^data:image\//.test(logo)) head += `<link rel="icon" href="${attr(logo)}">`;
    }
  }
  if (type) head += `<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link rel="stylesheet" href="${attr(fontUrl(type))}"><style>${typeCss(type)}</style>`;
  const fit = type ? ['h1', 'h2'].concat((manifest.guards || []).filter((g) => g.type === 'fitText' && g.selector).map((g) => g.selector)).join(',') : '';
  head += script(fit, autoColour);
  return /<\/head>/i.test(out) ? out.replace(/<\/head>/i, head + '</head>') : head + out;
}

module.exports = { FIELDS, TYPES, COLOURS, publicTypes, chipsUrl, fontUrl, typeCss, logoSize, dims, inject };
