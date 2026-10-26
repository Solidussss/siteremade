// The photo hero: any design's hero shows the business's own photos instead of its drawing, and stays a scroll scene.
// Up to four photos (photos.before, photos.second, photos.third, photos.main, in that order) are the chapters of the
// hero's scroll; inside each the camera moves (push in or pull back, drifting toward its side) and the next photo wipes
// in behind a light line. photos.camera is the plan per photo (where to focus, which way to drift, how far to zoom),
// written by the hero director (lib/hero-director.js) or left out for the default moves.
//
// A design opts in with "photoHero" in design.json (an object; every key optional):
//   section  the hero section (default "#top", then "#hero")
//   stage    the element inside it that stays on screen (default ".stage")
//   hide     the drawing to hide when photos show (default: the stage's canvases)
// The design's words, buttons and step captions stay on top of the photos; a veil behind them keeps them readable,
// light or dark to match the design's own text colour.
'use strict';

const ORDER = ['before', 'second', 'third', 'main'];
const FIELDS = {
  'photos.main': { kind: 'photo', offer: 'always', label: 'your main photo: it ends the hero (the finished work, the place, the team). The drawing is replaced; scrolling moves the camera through your photos.' },
  'photos.before': { kind: 'photo', offer: 'always', label: 'a first photo, if you have a before and after (it comes first).' },
  'photos.second': { kind: 'photo', offer: 'always', label: 'a photo for the middle of the scroll.' },
  'photos.third': { kind: 'photo', offer: 'always', label: 'another photo for the middle.' },
  'photos.camera': { kind: 'text', max: 400, hidden: true, offer: 'always', label: 'the camera plan (set by the hero director)' },
};

// the photos in chapter order, each with its camera: [{ src, fx, fy, dir, zoom }]
function shots(content) {
  const p = (content && content.photos) || {};
  if (!p.main) return [];
  const list = ORDER.filter((k) => p[k]).map((k) => ({ src: p[k] }));
  const plan = String(p.camera || '').split(';').map((s) => s.trim().split(/\s+/).map(Number));
  return list.map((s, i) => {
    const [fx, fy, dir, zoom] = plan[i] || [];
    const ok = (v, lo, hi) => typeof v === 'number' && isFinite(v) && v >= lo && v <= hi;
    return { ...s, fx: ok(fx, 0, 100) ? fx : 50, fy: ok(fy, 0, 100) ? fy : 45, dir: dir === -1 ? -1 : dir === 1 ? 1 : (i % 2 ? -1 : 1), zoom: ok(zoom, 1, 1.6) ? zoom : 1.24 };
  });
}

const CSS = `.srph-on{isolation:isolate}
.srph{position:absolute;inset:0;z-index:-1;overflow:hidden;pointer-events:none}
.srph-shot{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;will-change:transform,clip-path}
.srph-line{position:absolute;top:0;bottom:0;left:0;z-index:2;width:2px;margin-left:-1px;background:#fff;box-shadow:0 0 20px rgba(255,255,255,.85);opacity:0}
.srph::after{content:"";position:absolute;inset:0;z-index:1}
.srph.dark::after{background:linear-gradient(90deg,rgba(8,8,10,.82) 0%,rgba(8,8,10,.5) 38%,rgba(8,8,10,.12) 72%,rgba(8,8,10,.05) 100%),linear-gradient(0deg,rgba(8,8,10,.55) 0%,transparent 30%)}
.srph.light::after{background:linear-gradient(90deg,rgba(255,253,248,.88) 0%,rgba(255,253,248,.6) 38%,rgba(255,253,248,.12) 72%,transparent 100%),linear-gradient(0deg,rgba(255,253,248,.6) 0%,transparent 30%)}
@media (max-width:820px){
  .srph.dark::after{background:linear-gradient(180deg,rgba(8,8,10,.8) 0%,rgba(8,8,10,.45) 40%,rgba(8,8,10,.1) 62%,rgba(8,8,10,.55) 100%)}
  .srph.light::after{background:linear-gradient(180deg,rgba(255,253,248,.9) 0%,rgba(255,253,248,.55) 42%,rgba(255,253,248,.1) 64%,rgba(255,253,248,.6) 100%)}
}
.srph-hidden{visibility:hidden!important;width:2px!important;height:2px!important;min-width:0!important;min-height:0!important}`;

// the scene, run in the page: chapters, camera moves, the wipe, all from the scroll
const RUNTIME = `(function(){
var C=JSON.parse(document.getElementById('srph-cfg').textContent),sec=document.querySelector(C.section)||document.querySelector('#top')||document.querySelector('#hero');if(!sec)return;
var stage=sec.querySelector(C.stage)||sec,tpl=document.getElementById('srph-shots');if(!tpl)return;
// the drawing stays (its loop also runs the step captions) but shrinks to 2px, and its 2D drawing calls do nothing
function quiet(cv){var x=null;if(cv.tagName!=='CANVAS')return;try{x=cv.getContext('2d')}catch(e){}if(!x)return;
 'arc arcTo ellipse rect roundRect moveTo lineTo bezierCurveTo quadraticCurveTo fill stroke fillRect strokeRect clearRect fillText strokeText drawImage putImageData clip'.split(' ').forEach(function(m){x[m]=function(){}});
 ['createLinearGradient','createRadialGradient','createConicGradient'].forEach(function(m){var f=x[m];if(f)x[m]=function(){try{return f.apply(x,arguments)}catch(e){return x.createLinearGradient(0,0,1,1)}}})}
// (a drawing sized from the shrunken canvas can ask for a negative radius, which would throw and stop its loop: 0 instead)
var P=window.CanvasRenderingContext2D&&CanvasRenderingContext2D.prototype;if(P)[['arc',[2]],['ellipse',[2,3]],['arcTo',[4]],['createRadialGradient',[2,5]]].forEach(function(m){var f=P[m[0]];if(f)P[m[0]]=function(){var a=[].slice.call(arguments);m[1].forEach(function(i){if(a[i]<0)a[i]=0});return f.apply(this,a)}});
(C.hide&&C.hide.length?C.hide:['canvas']).forEach(function(s){stage.querySelectorAll(s).forEach(function(e){e.classList.add('srph-hidden');quiet(e)})});
if(getComputedStyle(stage).position==='static')stage.style.position='relative';
var h1=stage.querySelector('h1')||sec.querySelector('h1'),col=h1?getComputedStyle(h1).color.match(/\\d+(\\.\\d+)?/g):null,lum=col?(0.2126*col[0]+0.7152*col[1]+0.0722*col[2])/255:1;
var box=document.createElement('div');box.className='srph '+(lum<0.5?'light':'dark');box.appendChild(tpl.content.cloneNode(true));stage.prepend(box);stage.classList.add('srph-on');dispatchEvent(new Event('resize'));
var S=[].slice.call(box.querySelectorAll('.srph-shot')),L=box.querySelector('.srph-line'),RM=matchMedia('(prefers-reduced-motion:reduce)').matches,sm=scrollY,vis=true;
function cl(v){return v<0?0:v>1?1:v}function ease(t){return t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2}
function prog(){var top=sec.getBoundingClientRect().top+scrollY,h=sec.offsetHeight-innerHeight;return h>40?cl((sm-top)/h):cl((sm-top)/Math.max(1,sec.offsetHeight))}
function scene(p){var n=S.length,w=n>1?Math.min(.12,.6/n):0,edge=-1;
 S.forEach(function(im,i){var a=i/n,b=(i+1)/n,from=i?Math.max(0,a-w):0,e=ease(cl((p-from)/(b-from))),d=+im.dataset.dir,z=+im.dataset.zoom;
  im.style.transform='translate('+(d*(3-6*e)).toFixed(2)+'%,'+(2-6*e).toFixed(2)+'%) scale('+(1.04+(z-1.04)*e).toFixed(4)+')';
  if(i){var r=cl((p-(a-w))/w);im.style.visibility=r>0?'visible':'hidden';im.style.clipPath=r>=1?'none':'inset(0 '+((1-r)*100).toFixed(2)+'% 0 0)';if(r>0&&r<1)edge=r}});
 L.style.opacity=edge<0?0:1;if(edge>=0)L.style.left=(edge*100).toFixed(2)+'%'}
if('IntersectionObserver' in window)new IntersectionObserver(function(es){vis=es[0].isIntersecting},{rootMargin:'200px'}).observe(sec);
var last=-1;(function tick(){sm+=(scrollY-sm)*(RM?1:.14);if(Math.abs(scrollY-sm)<.5)sm=scrollY;if(vis){var p=prog();if(Math.abs(p-last)>1e-5){scene(p);last=p}}requestAnimationFrame(tick)})();
})();`;

const attr = (v) => String(v).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// the page with the photos in place (or unchanged without a main photo)
function inject(html, manifest, content) {
  const cfg = manifest && manifest.photoHero;
  const list = shots(content);
  if (!cfg || !list.length) return html;
  const name = (content.business && (content.business.name || content.business.wordmark)) || (content.brand && content.brand.name) || '';
  const imgs = list.map((s, i) => `<img class="srph-shot" src="${attr(s.src)}" alt="${i === list.length - 1 ? attr(String(name).replace(/\*/g, '')) : ''}" data-dir="${s.dir}" data-zoom="${s.zoom}" style="object-position:${s.fx}% ${s.fy}%;transform-origin:${s.fx}% ${s.fy}%${i ? ';visibility:hidden' : ''}"${i === list.length - 1 ? ' fetchpriority="high"' : ''}>`).join('');
  const conf = JSON.stringify({ section: cfg.section || '#top', stage: cfg.stage || '.stage', hide: cfg.hide || [] }).replace(/</g, '\\u003c');
  const block = `<style>${CSS}</style><template id="srph-shots">${imgs}<i class="srph-line" aria-hidden="true"></i></template><script type="application/json" id="srph-cfg">${conf}</script><script>${RUNTIME}</script>`;
  const at = html.lastIndexOf('</body>');
  return at < 0 ? html + block : html.slice(0, at) + block + html.slice(at);
}

module.exports = { FIELDS, ORDER, shots, inject };
