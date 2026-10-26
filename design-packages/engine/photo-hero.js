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
//   veil     "light" or "dark" behind the words (default: from the headline's colour)
//   motion   what a photo with a known subject does (lib/photo-analyse.js leaves its mask in photos.<slot>Mask):
//            "gloss"  a band of light crosses the subject, strongest on its highlights (paint, chrome, glass), while
//                     the background softly falls out of focus; the camera barely moves, the subject stays put
//                     (cars, products, nails, watches)
//            "focus"  the background falls out of focus and dims around the subject, a faint sheen on it (people,
//                     food, pets, work in progress)
//            absent   the camera moves only. A photo without a subject (a room, a garden) always does that.
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
  // (each photo's subject, as a soft greyscale mask: set by the photo analysis, cleared when the photo changes)
  'photos.mainMask': { kind: 'photo', hidden: true, offer: 'always', label: 'where the subject is in the main photo' },
  'photos.beforeMask': { kind: 'photo', hidden: true, offer: 'always', label: 'where the subject is in the first photo' },
  'photos.secondMask': { kind: 'photo', hidden: true, offer: 'always', label: 'where the subject is in the second photo' },
  'photos.thirdMask': { kind: 'photo', hidden: true, offer: 'always', label: 'where the subject is in the third photo' },
};

// the photos in chapter order, each with its camera: [{ src, fx, fy, dir, zoom }]
function shots(content) {
  const p = (content && content.photos) || {};
  if (!p.main) return [];
  const list = ORDER.filter((k) => p[k]).map((k) => ({ src: p[k], mask: p[k + 'Mask'] || null }));
  const plan = String(p.camera || '').split(';').map((s) => s.trim().split(/\s+/).map(Number));
  return list.map((s, i) => {
    const [fx, fy, dir, zoom] = plan[i] || [];
    const ok = (v, lo, hi) => typeof v === 'number' && isFinite(v) && v >= lo && v <= hi;
    return { ...s, fx: ok(fx, 0, 100) ? fx : 50, fy: ok(fy, 0, 100) ? fy : 45, dir: dir === -1 ? -1 : dir === 1 ? 1 : (i % 2 ? -1 : 1), zoom: ok(zoom, 1, 1.6) ? zoom : 1.24 };
  });
}

const CSS = `.srph-on{isolation:isolate}
.srph{position:absolute;inset:0;z-index:-1;overflow:hidden;pointer-events:none}
.srph-shot{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;will-change:transform,clip-path;display:block}
.srph-line{position:absolute;top:0;bottom:0;left:0;z-index:2;width:2px;margin-left:-1px;background:#fff;box-shadow:0 0 20px rgba(255,255,255,.85);opacity:0}
.srph::after{content:"";position:absolute;inset:0;z-index:1}
.srph.dark::after{background:linear-gradient(90deg,rgba(8,8,10,.82) 0%,rgba(8,8,10,.5) 38%,rgba(8,8,10,.12) 72%,rgba(8,8,10,.05) 100%),linear-gradient(0deg,rgba(8,8,10,.55) 0%,transparent 30%)}
.srph.light::after{background:linear-gradient(90deg,rgba(255,253,248,.88) 0%,rgba(255,253,248,.6) 38%,rgba(255,253,248,.12) 72%,transparent 100%),linear-gradient(0deg,rgba(255,253,248,.6) 0%,transparent 30%)}
@media (max-width:820px){
  .srph.dark::after{background:linear-gradient(180deg,rgba(8,8,10,.8) 0%,rgba(8,8,10,.45) 40%,rgba(8,8,10,.1) 62%,rgba(8,8,10,.55) 100%)}
  .srph.light::after{background:linear-gradient(180deg,rgba(255,253,248,.9) 0%,rgba(255,253,248,.55) 42%,rgba(255,253,248,.1) 64%,rgba(255,253,248,.6) 100%)}
}
.srph-hidden{visibility:hidden!important;opacity:0!important;width:2px!important;height:2px!important;min-width:0!important;min-height:0!important}`;

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
var box=document.createElement('div');box.className='srph '+(C.veil==='light'||C.veil==='dark'?C.veil:lum<0.5?'light':'dark');box.appendChild(tpl.content.cloneNode(true));stage.prepend(box);stage.classList.add('srph-on');dispatchEvent(new Event('resize'));
var S=[].slice.call(box.querySelectorAll('.srph-shot')),L=box.querySelector('.srph-line'),RM=matchMedia('(prefers-reduced-motion:reduce)').matches,sm=scrollY,vis=true,MO=C.motion==='gloss'||C.motion==='focus'?C.motion:null;
// a photo with a subject mask: drawn by WebGL, with the light and focus on the subject (no WebGL: the photo as it is)
var VS='attribute vec2 a;varying vec2 v;void main(){v=vec2(a.x*.5+.5,.5-a.y*.5);gl_Position=vec4(a,0.,1.);}';
var FS='precision mediump float;uniform sampler2D P,B,M;uniform float T,F,G,K;varying vec2 v;void main(){vec3 c=texture2D(P,v).rgb,b=texture2D(B,v).rgb;float m=smoothstep(.18,.82,texture2D(M,v).r);'+
 'vec3 bg=mix(c,b*(1.-.22*F),F);vec3 o=mix(bg,c*(1.+.04*F),m);float l=dot(c,vec3(.299,.587,.114)),d=(v.x*.94+v.y*.34)-T,band=exp(-d*d/.003)+.3*exp(-d*d/.04);'+
 'float s=band*m*(K+(1.-K)*smoothstep(.42,.97,l))*G;o=1.-(1.-o)*(1.-vec3(1.,.97,.92)*s);gl_FragColor=vec4(o,1.);}';
function glShot(im){var src=im.dataset.mask;if(!MO||RM||!src)return;var mk=new Image();mk.src=src;
 Promise.all([im.decode?im.decode():Promise.resolve(),mk.decode?mk.decode():new Promise(function(r){mk.onload=r})]).then(function(){
  var cv=document.createElement('canvas'),k=Math.min(1,1600/im.naturalWidth);cv.width=Math.round(im.naturalWidth*k);cv.height=Math.round(im.naturalHeight*k);
  var g=cv.getContext('webgl',{premultipliedAlpha:false,antialias:false,preserveDrawingBuffer:false});if(!g)return;
  function sh(t,c){var o=g.createShader(t);g.shaderSource(o,c);g.compileShader(o);return o}
  var pr=g.createProgram();g.attachShader(pr,sh(g.VERTEX_SHADER,VS));g.attachShader(pr,sh(g.FRAGMENT_SHADER,FS));g.linkProgram(pr);if(!g.getProgramParameter(pr,g.LINK_STATUS))return;g.useProgram(pr);
  var bf=g.createBuffer();g.bindBuffer(g.ARRAY_BUFFER,bf);g.bufferData(g.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,1,1]),g.STATIC_DRAW);var al=g.getAttribLocation(pr,'a');g.enableVertexAttribArray(al);g.vertexAttribPointer(al,2,g.FLOAT,false,0,0);
  // (the blurred copy: the photo drawn tiny, then stretched back with smooth sampling)
  var bl=document.createElement('canvas');bl.width=Math.max(8,Math.round(cv.width/14));bl.height=Math.max(8,Math.round(cv.height/14));bl.getContext('2d').drawImage(im,0,0,bl.width,bl.height);
  [[im,'P',0],[bl,'B',1],[mk,'M',2]].forEach(function(t){var tx=g.createTexture();g.activeTexture(g.TEXTURE0+t[2]);g.bindTexture(g.TEXTURE_2D,tx);
   g.texParameteri(g.TEXTURE_2D,g.TEXTURE_WRAP_S,g.CLAMP_TO_EDGE);g.texParameteri(g.TEXTURE_2D,g.TEXTURE_WRAP_T,g.CLAMP_TO_EDGE);g.texParameteri(g.TEXTURE_2D,g.TEXTURE_MIN_FILTER,g.LINEAR);g.texParameteri(g.TEXTURE_2D,g.TEXTURE_MAG_FILTER,g.LINEAR);
   g.texImage2D(g.TEXTURE_2D,0,g.RGB,g.RGB,g.UNSIGNED_BYTE,t[0]);g.uniform1i(g.getUniformLocation(pr,t[1]),t[2])});
  var U={};['T','F','G','K'].forEach(function(n){U[n]=g.getUniformLocation(pr,n)});g.viewport(0,0,cv.width,cv.height);
  cv.className=im.className;cv.setAttribute('style',im.getAttribute('style'));cv.setAttribute('role','img');cv.setAttribute('aria-label',im.alt||'');for(var kk in im.dataset)cv.dataset[kk]=im.dataset[kk];
  cv.draw=function(e){g.uniform1f(U.T,-.35+1.7*e);g.uniform1f(U.F,(MO==='focus'?.85:.5)*Math.min(1,e*1.6));g.uniform1f(U.G,MO==='gloss'?1.25:.4);g.uniform1f(U.K,MO==='gloss'?.22:.35);g.drawArrays(g.TRIANGLE_STRIP,0,4)};
  im.replaceWith(cv);S[S.indexOf(im)]=cv;cv.draw(0);last=-1}).catch(function(){})}

function cl(v){return v<0?0:v>1?1:v}function ease(t){return t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2}
function prog(){var top=sec.getBoundingClientRect().top+scrollY,h=sec.offsetHeight-innerHeight;return h>40?cl((sm-top)/h):cl((sm-top)/Math.max(1,sec.offsetHeight))}
function scene(p){var n=S.length,w=n>1?Math.min(.12,.6/n):0,edge=-1;
 S.forEach(function(im,i){var a=i/n,b=(i+1)/n,from=i?Math.max(0,a-w):0,e=ease(cl((p-from)/(b-from))),d=+im.dataset.dir,z=+im.dataset.zoom,q=im.draw&&MO==='gloss'?.3:1;
  // (a lit subject stays put: the camera only breathes)
  im.style.transform='translate('+(q*d*(3-6*e)).toFixed(2)+'%,'+(q*(2-6*e)).toFixed(2)+'%) scale('+(1.04+(z-1.04)*e*q).toFixed(4)+')';
  if(im.draw&&im.style.visibility!=='hidden')im.draw(cl((p-from)/(b-from)));
  if(i){var r=cl((p-(a-w))/w);im.style.visibility=r>0?'visible':'hidden';im.style.clipPath=r>=1?'none':'inset(0 '+((1-r)*100).toFixed(2)+'% 0 0)';if(r>0&&r<1)edge=r}});
 L.style.opacity=edge<0?0:1;if(edge>=0)L.style.left=(edge*100).toFixed(2)+'%'}
if('IntersectionObserver' in window)new IntersectionObserver(function(es){vis=es[0].isIntersecting},{rootMargin:'200px'}).observe(sec);
var last=-1;S.slice().forEach(glShot);(function tick(){sm+=(scrollY-sm)*(RM?1:.14);if(Math.abs(scrollY-sm)<.5)sm=scrollY;if(vis){var p=prog();if(Math.abs(p-last)>1e-5){scene(p);last=p}}requestAnimationFrame(tick)})();
})();`;

const attr = (v) => String(v).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// the page with the photos in place (or unchanged without a main photo)
function inject(html, manifest, content) {
  const cfg = manifest && manifest.photoHero;
  const list = shots(content);
  if (!cfg || !list.length) return html;
  const name = (content.business && (content.business.name || content.business.wordmark)) || (content.brand && content.brand.name) || '';
  const imgs = list.map((s, i) => `<img class="srph-shot" src="${attr(s.src)}" alt="${i === list.length - 1 ? attr(String(name).replace(/\*/g, '')) : ''}" data-dir="${s.dir}" data-zoom="${s.zoom}"${s.mask ? ` data-mask="${attr(s.mask)}"` : ''} style="object-position:${s.fx}% ${s.fy}%;transform-origin:${s.fx}% ${s.fy}%${i ? ';visibility:hidden' : ''}"${i === list.length - 1 ? ' fetchpriority="high"' : ''}>`).join('');
  const conf = JSON.stringify({ section: cfg.section || '#top', stage: cfg.stage || '.stage', hide: cfg.hide || [], veil: cfg.veil || null, motion: cfg.motion || null }).replace(/</g, '\\u003c');
  const block = `<style>${CSS}</style><template id="srph-shots">${imgs}<i class="srph-line" aria-hidden="true"></i></template><script type="application/json" id="srph-cfg">${conf}</script><script>${RUNTIME}</script>`;
  const at = html.lastIndexOf('</body>');
  return at < 0 ? html + block : html.slice(0, at) + block + html.slice(at);
}

module.exports = { FIELDS, ORDER, shots, inject };
