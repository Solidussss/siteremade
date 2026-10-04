'use strict';
// CREATIVE -- THE KINETIC LAYER: what makes a page feel made, not assembled, using only what the page already has (its
// words, its pictures, its clips). No provider is asked for anything; a page made before the look (no plan.look) never gets
// it, and reduced motion turns every part of it off.
//   smooth scroll     the wheel glides (a weighted, eased scroll) -- desktop only; touch, keys and the scrollbar stay native
//   kinetic words     headlines rise word by word out of their own line masks as their scene arrives; the lines after them
//                     follow, softened in from a blur
//   pointer depth     on a mouse, the scene's pictures lean with the cursor -- the subject most, the backdrop least -- and
//                     the words drift the other way; the call to action leans toward the cursor (magnetic)
//   cursor            a soft ring follows the mouse and opens over what can be clicked
//   scrubbed clips    a premium clip is played BY THE VISITOR: its scene's scroll moves it forward and back (and the opening
//                     clip follows the mouse across the screen) -- never a few seconds looping on their own
// Exports { css, js, on(plan, opts) }: render2 adds both to a page when on() says so.

const on = (plan, opts) => !!(plan && plan.look) && !(opts && opts.kinetic === false);

const css = `
html[data-kinetic] .kw{display:inline-block;overflow:hidden;vertical-align:top;padding:0 .06em .14em 0;margin:0 -.06em -.14em 0}
html[data-kinetic] .kw>i{display:inline-block;font-style:inherit;will-change:transform}
html.k-on:not([data-motion="reduced"]) .sc .kw>i{transform:translate3d(0,108%,0) rotate(calc(var(--kR,4) * 1deg));transition:transform calc(var(--kT,1.05) * 1s) cubic-bezier(.16,1,.3,1) calc(var(--kd0,.08s) + var(--wi) * var(--kW,70) * 1ms)}
html.k-go:not([data-motion="reduced"]) .sc.is-in .kw>i{transform:none}
html.k-on:not([data-motion="reduced"]) .sc :is(.sc-body,.sc-kicker,.sc-cta,.sc-list){transition:opacity .9s ease calc(var(--kb,.35s)),filter .9s ease calc(var(--kb,.35s)),translate 1s cubic-bezier(.16,1,.3,1) calc(var(--kb,.35s))}
html.k-on:not(.k-go):not([data-motion="reduced"]) :is(.sc-body,.sc-kicker,.sc-cta,.sc-list),html.k-on:not([data-motion="reduced"]) .sc:not(.is-in) :is(.sc-body,.sc-kicker,.sc-cta,.sc-list){opacity:0;filter:blur(8px);translate:0 1.2em}
html.k-on:not([data-motion="reduced"]) .sc .sc-kicker{--kb:.0s}
@media (hover:hover) and (pointer:fine){
  html.k-on:not([data-motion="reduced"]) .ly{translate:calc(var(--kpx,0) * var(--kdp,0) * 1vw) calc(var(--kpy,0) * var(--kdp,0) * 1vh)}
  html.k-on:not([data-motion="reduced"]) .ly[data-role="focal"],html.k-on:not([data-motion="reduced"]) .ly[data-role="subject"]{--kdp:1.3}
  html.k-on:not([data-motion="reduced"]) .ly[data-role="support"]{--kdp:.8}
  html.k-on:not([data-motion="reduced"]) .ly[data-role="backdrop"],html.k-on:not([data-motion="reduced"]) .ly[data-role="texture"]{--kdp:.35}
  html.k-on:not([data-motion="reduced"]) .ly[data-role="backdrop"] .ly-art{scale:1.04}
  html.k-on:not([data-motion="reduced"]) .sc-text{translate:calc(var(--kpx,0) * -.35vw) calc(var(--kpy,0) * -.35vh)}
  html.k-on:not([data-motion="reduced"]) .cr-cta{translate:var(--kmx,0) var(--kmy,0);transition:translate .35s cubic-bezier(.16,1,.3,1)}
  .k-cur{position:fixed;left:0;top:0;width:34px;height:34px;margin:-17px 0 0 -17px;border-radius:50%;border:1.5px solid #fff;mix-blend-mode:difference;pointer-events:none;z-index:2147483000;opacity:0;transition:opacity .3s ease,width .35s cubic-bezier(.16,1,.3,1),height .35s cubic-bezier(.16,1,.3,1),margin .35s cubic-bezier(.16,1,.3,1),background-color .35s ease}
  html.k-on:not([data-motion="reduced"]) .k-cur.is-on{opacity:1}
  .k-cur.is-link{width:74px;height:74px;margin:-37px 0 0 -37px;background:#fff}
  .k-cur.is-scrub{width:96px;height:96px;margin:-48px 0 0 -48px}
  .k-cur.is-scrub::after{content:"\\2194";position:absolute;inset:0;display:grid;place-items:center;color:#fff;font:600 20px/1 system-ui,sans-serif}
}
html.k-on .ly-vid[data-scrub],html.k-on .shv-vid[data-scrub]{opacity:1}
.k-lens{position:absolute;inset:0;width:100%;height:100%;display:block;pointer-events:none;opacity:0;transition:opacity .25s ease}
/* every picture leans with the scroll's speed and settles when it stops */
html.k-go:not([data-motion="reduced"]) .ly-art{transform:rotate(var(--rot)) skewY(calc(var(--kv,0) * var(--kS,2.2) * 1deg))}
/* tilt: the pictures swing up from the floor plane as their scene arrives */
html.k-go:not([data-motion="reduced"]) .sc[data-kp="tilt"] .ly-loop{perspective:1400px}
html.k-go:not([data-motion="reduced"]) .sc[data-kp="tilt"] .ly:is([data-role="focal"],[data-role="support"],[data-role="subject"]) .ly-art{rotate:x calc(clamp(0, .42 - var(--p,.42), .42) * 85deg * var(--kI,1));transform-origin:50% 100%;opacity:calc(.35 + .65 * clamp(0, var(--p,1) * 2.6, 1))}
/* grow: the main picture opens from a card to its full size */
html.k-go:not([data-motion="reduced"]) .sc[data-kp="grow"] .ly:is([data-role="focal"],[data-role="subject"]) .ly-art{scale:calc(1 - .42 * var(--kI,1) * (1 - clamp(0, (var(--p,1) - .04) * 2.5, 1)));border-radius:calc((1 - clamp(0, (var(--p,1) - .04) * 2.5, 1)) * 34px);overflow:hidden}
/* drift: each picture travels at its own depth while the scene passes */
html.k-go:not([data-motion="reduced"]) .sc[data-kp="drift"] .ly[data-role="support"] .ly-art{translate:0 calc((var(--p,.5) - .5) * -22vh);rotate:calc((var(--p,.5) - .5) * 6deg)}
html.k-go:not([data-motion="reduced"]) .sc[data-kp="drift"] .ly:is([data-role="focal"],[data-role="subject"]) .ly-art{translate:0 calc((var(--p,.5) - .5) * -7vh);scale:calc(1.06 - var(--p,.5) * .08)}
/* turn: a transformation -- the picture turns and straightens into place as the scene arrives */
html.k-go:not([data-motion="reduced"]) .sc[data-kp="turn"] .ly:is([data-role="focal"],[data-role="subject"]) .ly-art{rotate:calc((1 - clamp(0, (var(--p,1) - .02) * 2.6, 1)) * -14deg * var(--kI,1));scale:calc(1 - .22 * var(--kI,1) * (1 - clamp(0, (var(--p,1) - .02) * 2.6, 1)))}
html.k-go:not([data-motion="reduced"]) .sc[data-kp="turn"] .ly[data-role="support"] .ly-art{rotate:calc((1 - clamp(0, var(--p,1) * 2.4, 1)) * 18deg * var(--kI,1))}
/* rush: an escalation -- the pictures come in fast from the side, leaning into the move */
html.k-go:not([data-motion="reduced"]) .sc[data-kp="rush"] .ly:is([data-role="focal"],[data-role="subject"],[data-role="support"]) .ly-art{translate:calc((1 - clamp(0, (var(--p,1) - .03) * 3, 1)) * 34vw * var(--kI,1)) 0;rotate:calc((1 - clamp(0, (var(--p,1) - .03) * 3, 1)) * 7deg * var(--kI,1))}
html.k-go:not([data-motion="reduced"]) .sc[data-kp="rush"] .ly[data-role="support"] .ly-art{translate:calc((1 - clamp(0, (var(--p,1) - .08) * 3, 1)) * -40vw * var(--kI,1)) 0}
/* long headlines fill word by word as the scene is read */
html.k-go:not([data-motion="reduced"]) .sc[data-kf] .kw>i{opacity:clamp(.16, ((var(--p,1) - .14) * 2.6 * var(--wn,8)) - var(--wi), 1)}
/* the scene being left sinks back and dims while the next one comes over it */
html.k-go:not([data-motion="reduced"]) .sc[data-kx] .sc-pin{scale:calc(1 - clamp(0, (var(--p,0) - .7) * 3.4, 1) * .07);filter:brightness(calc(1 - clamp(0, (var(--p,0) - .7) * 3.4, 1) * .4));transform-origin:50% 0;border-radius:calc(clamp(0, (var(--p,0) - .7) * 3.4, 1) * 28px);overflow:hidden}
/* film grain: the page has a surface */
html[data-kinetic]:not([data-motion="reduced"]) body::after{content:"";position:fixed;inset:-50%;z-index:2147482000;pointer-events:none;opacity:.07;mix-blend-mode:overlay;background-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='180' height='180'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='3' stitchTiles='stitch'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>");animation:k-grain .9s steps(6) infinite}
@keyframes k-grain{0%{translate:0 0}20%{translate:-4% 3%}40%{translate:3% -5%}60%{translate:-6% -2%}80%{translate:5% 4%}100%{translate:0 0}}
`;

// (ES5, like the page's own runtime: it runs on every browser the page does)
const js = `
(function(){var d=document,W=window,H=d.documentElement;if(!H.hasAttribute('data-kinetic'))return;
var RM=W.matchMedia&&W.matchMedia('(prefers-reduced-motion: reduce)').matches;
function reduced(){return RM||H.getAttribute('data-motion')==='reduced'}
var fine=W.matchMedia&&W.matchMedia('(hover: hover) and (pointer: fine)').matches;
var K=W.__kinetic={words:0,scrub:0,smooth:false,pointer:fine};
/* ---- kinetic words: every headline, word by word, each in its own line mask */
function split(h){if(h.querySelector('.ch,.kw'))return;var wi=0,walk=d.createTreeWalker(h,4,null),nodes=[],n;while((n=walk.nextNode()))if(/\\S/.test(n.nodeValue))nodes.push(n);
nodes.forEach(function(t){var f=d.createDocumentFragment();t.nodeValue.split(/(\\s+)/).forEach(function(p){if(!p)return;if(/^\\s+$/.test(p)){f.appendChild(d.createTextNode(p));return}var o=d.createElement('span');o.className='kw';var i=d.createElement('i');i.style.setProperty('--wi',wi++);i.textContent=p;o.appendChild(i);f.appendChild(o)});t.parentNode.replaceChild(f,t)});K.words+=wi}
[].forEach.call(d.querySelectorAll('.sc-heading'),function(h){split(h);var n=h.querySelectorAll('.kw').length;h.style.setProperty('--wn',n)});
/* ---- each scene its own movement: the pictures (tilt, grow, drift -- never the same twice in a row), a long headline that
   fills as it is read, and the sink as it is left. The opening, a premium clip's scene and a 3D scene keep their own. */
/* THE PAGE'S CHARACTER (its art direction's personality) sets how everything moves -- how far, how fast, how much it leans
   -- and EACH SCENE'S PLACE IN THE STORY (its arc) sets which move its pictures make: one grammar, the whole page */
var CH={luxe:[.55,0,0,1.35,95,.08],still:[.45,0,0,1.4,100,.075],editorial:[.75,1,1.2,1.15,80,.09],cinematic:[1,1.6,2,1.25,85,.085],kinetic:[1.25,3.2,6,.9,55,.12],playful:[1.3,3,7,.85,55,.13],chaotic:[1.5,4,9,.8,45,.14],mechanical:[1,0,0,.75,40,.12]};
var pers=H.getAttribute('data-personality')||'editorial',ch=CH[pers]||CH.editorial;K.personality=pers;
H.style.setProperty('--kI',ch[0]);H.style.setProperty('--kS',ch[1]);H.style.setProperty('--kR',ch[2]);H.style.setProperty('--kT',ch[3]);H.style.setProperty('--kW',ch[4]);var GL=ch[5];
var ARC={takeover:'grow',payoff:'grow',reveal:'tilt',transformation:'turn',breath:'drift',escalation:'rush'};
(function(){var kinds=['grow','tilt','drift','turn','rush'],last='',all=[].slice.call(d.querySelectorAll('.sc'));all.forEach(function(sc,i){
if(i>0&&!sc.hasAttribute('data-pv')&&!('3d' in sc.dataset)&&!/^(mask-reveal|expand)$/.test(sc.getAttribute('data-choreo')||'')&&sc.querySelector('.ly[data-kind="image"],.ly .ly-img')){var k=ARC[sc.getAttribute('data-arc')]||kinds[i%kinds.length];if(k===last)k=kinds[(kinds.indexOf(k)+1)%kinds.length];if(ch[0]<.6&&(k==='rush'||k==='turn'))k='drift';sc.setAttribute('data-kp',k);last=k}
var h=sc.querySelector('.sc-heading');if(i>0&&i<all.length-1&&h&&h.querySelectorAll('.kw').length>=5&&!sc.hasAttribute('data-pin'))sc.setAttribute('data-kf','');
if(i<all.length-1&&!sc.hasAttribute('data-pin')&&!sc.hasAttribute('data-seam-in'))sc.setAttribute('data-kx','')})})();
/* ---- decode (a mechanical page): each headline's letters resolve out of noise, left to right, as its scene arrives */
function decode(h){if(h._dec)return;h._dec=1;var ws=[].slice.call(h.querySelectorAll('.kw>i')),fin=ws.map(function(w){return w.textContent}),G='ABCDEFGHJKLMNPRSTUVWXYZ0123456789#%&*/<>',t0=performance.now(),total=fin.join('').length,dur=650+total*18;
(function step(t){var k=Math.min(1,(t-t0)/dur),n=Math.floor(k*total),c=0;ws.forEach(function(w,j){var f=fin[j],o='';for(var x=0;x<f.length;x++,c++)o+=c<n||/[^A-Za-z0-9]/.test(f[x])?f[x]:G[(Math.random()*G.length)|0];w.textContent=o});if(k<1)requestAnimationFrame(step);else ws.forEach(function(w,j){w.textContent=fin[j]})})(t0)}
/* ---- smooth scroll (wheel only) */
var target=W.scrollY||0,cur=target,gliding=false;
function maxY(){return Math.max(0,(d.scrollingElement||H).scrollHeight-innerHeight)}
function scrollable(el,dy){for(;el&&el!==d.body&&el!==H;el=el.parentElement){var s=getComputedStyle(el);if(/(auto|scroll)/.test(s.overflowY)&&el.scrollHeight>el.clientHeight+1){if(dy<0?el.scrollTop>0:el.scrollTop+el.clientHeight<el.scrollHeight-1)return true}}return false}
function glide(){cur+=(target-cur)*GL;if(Math.abs(target-cur)<.6)cur=target;W.scrollTo(0,cur);if(cur!==target)requestAnimationFrame(glide);else gliding=false}
if(fine&&!RM){K.smooth=true;W.addEventListener('wheel',function(e){if(reduced()||e.ctrlKey||e.defaultPrevented)return;var dy=e.deltaY*(e.deltaMode===1?40:e.deltaMode===2?innerHeight:1);if(!dy||scrollable(e.target,dy))return;e.preventDefault();if(!gliding){cur=target=W.scrollY}target=Math.max(0,Math.min(maxY(),target+dy));if(!gliding){gliding=true;requestAnimationFrame(glide)}},{passive:false});
}
/* ---- pointer: depth, the magnetic call to action, the cursor */
var px=0,py=0,tx=0,ty=0,mx=-1,my=-1,ring=null,moving=false;
if(fine){ring=d.createElement('div');ring.className='k-cur';ring.setAttribute('aria-hidden','true');d.body.appendChild(ring);
W.addEventListener('pointermove',function(e){if(e.pointerType&&e.pointerType!=='mouse')return;mx=e.clientX;my=e.clientY;tx=mx/innerWidth*2-1;ty=my/innerHeight*2-1;ring.classList.add('is-on');
var t=e.target&&e.target.closest?e.target:null;ring.classList.toggle('is-link',!!(t&&t.closest('a,button,[role="button"]')));ring.classList.toggle('is-scrub',!!(t&&hero&&hero.v&&t.closest('.sc')===hero.sc&&!t.closest('a,button')));
[].forEach.call(d.querySelectorAll('.cr-cta'),function(b){var r=b.getBoundingClientRect(),cx=r.left+r.width/2,cy=r.top+r.height/2,dx=mx-cx,dy=my-cy,dist=Math.sqrt(dx*dx+dy*dy);if(dist<160){b.style.setProperty('--kmx',(dx*.28).toFixed(1)+'px');b.style.setProperty('--kmy',(dy*.28).toFixed(1)+'px')}else{b.style.removeProperty('--kmx');b.style.removeProperty('--kmy')}});
if(hero)kick();if(!moving){moving=true;requestAnimationFrame(follow)}},{passive:true});
d.addEventListener('pointerleave',function(){ring.classList.remove('is-on')})}
var rx=0,ry=0;
function follow(){px+=(tx-px)*.08;py+=(ty-py)*.08;rx+=(mx-rx)*.22;ry+=(my-ry)*.22;if(!reduced()){H.style.setProperty('--kpx',px.toFixed(4));H.style.setProperty('--kpy',py.toFixed(4))}
if(ring)ring.style.transform='translate3d('+rx.toFixed(1)+'px,'+ry.toFixed(1)+'px,0)';
if(Math.abs(tx-px)>.001||Math.abs(ty-py)>.001||Math.abs(mx-rx)>.3||Math.abs(my-ry)>.3)requestAnimationFrame(follow);else moving=false}
/* ---- scrubbed clips: the visitor plays them. Their scenes' places are measured when the layout changes (load, resize, the
   page growing) -- never read while scrolling */
var clips=[],hero=null,firstSc=d.querySelector('.sc');
[].forEach.call(d.querySelectorAll('.ly-vid,.shv-vid'),function(v){var sc=v.closest('.sc');if(!sc)return;v.setAttribute('data-scrub','');v.removeAttribute('autoplay');v.removeAttribute('loop');v.autoplay=false;v.loop=false;v.preload='auto';try{v.pause()}catch(e){}
var c={v:v,sc:sc,want:0,at:0,busy:false,ready:false,top:0,h:1};v.addEventListener('loadedmetadata',function(){c.ready=v.duration>0;kick()});v.addEventListener('seeked',function(){c.busy=false});if(v.readyState>=1&&v.duration>0)c.ready=true;
clips.push(c);if(sc===firstSc)hero=c});K.scrub=clips.length;
function measureK(){var y=W.scrollY||0;clips.forEach(function(c){var r=c.sc.getBoundingClientRect();c.top=r.top+y;c.h=Math.max(1,r.height)})}
function clipAt(c,y,vh){var top=c.top-y,tall=c.h>vh*1.05,span=tall?c.h-vh:c.h+vh,p=tall?-top/span:(vh-top)/span;return Math.max(0,Math.min(1,p))}
var heroScrolled=false,scrubbing=false,SY=W.scrollY||0;
function scrubFrame(){var vh=innerHeight,y=SY,live=false;if(!reduced())clips.forEach(function(c){if(!c.ready)return;var top=c.top-y;if(top+c.h<-50||top>vh+50)return;var dur=c.v.duration,p=c===hero?Math.max(0,Math.min(1,-top/c.h)):clipAt(c,y,vh);
/* (the opening clip: the mouse plays it -- on a touch screen it plays by itself; once the page scrolls, the scroll carries it on
   from where it was) */
if(c===hero){if(!heroScrolled){if(fine&&mx>=0)p=mx/innerWidth;else{p=(Date.now()/1000/Math.max(2,dur))%1;live=true}c.base=p}else p=(c.base||0)+(1-(c.base||0))*p}
c.want=p*Math.max(0,dur-.05);c.at+=(c.want-c.at)*.18;if(Math.abs(c.want-c.at)>.004)live=true;if(!c.busy&&Math.abs(c.v.currentTime-c.at)>1/30){c.busy=true;try{if(c.v.fastSeek&&Math.abs(c.v.currentTime-c.at)>.5)c.v.fastSeek(c.at);else c.v.currentTime=c.at}catch(e){c.busy=false}}});
if(live)requestAnimationFrame(scrubFrame);else scrubbing=false}
function kick(){if(clips.length&&!scrubbing){scrubbing=true;requestAnimationFrame(scrubFrame)}}
if(clips.length){measureK();W.addEventListener('resize',function(){measureK();kick()});W.addEventListener('load',function(){measureK();kick()});if(W.ResizeObserver){try{new W.ResizeObserver(function(){measureK();kick()}).observe(d.body)}catch(e){}}kick()}
/* ---- the scroll's speed: pictures lean with it (--kv), settling when it stops */
var ly0=W.scrollY||0,kvIn=0,kv=0,kvRun=false;function speed(){kv+=(kvIn-kv)*.14;kvIn*=.7;if(Math.abs(kv)<.002&&Math.abs(kvIn)<.002){kv=0;kvRun=false}H.style.setProperty('--kv',reduced()?'0':kv.toFixed(3));if(kvRun)requestAnimationFrame(speed)}
/* ---- one scroll listener for the whole page: the page's own frame (render2) calls this with where the page is */
W.__crKinFrame=function(y){SY=y;if(!gliding)cur=target=y;heroScrolled=y>8;kvIn=Math.max(-1,Math.min(1,(y-ly0)/60));ly0=y;if(!kvRun){kvRun=true;requestAnimationFrame(speed)}kick()};
/* ---- the lens: the main photograph bends, ripples and splits its colour around the mouse (WebGL; a mouse only; drawn
   only while the mouse is over it -- otherwise the photograph itself, untouched) */
var lenses=[];
if(fine&&!RM&&W.WebGLRenderingContext)[].forEach.call(d.querySelectorAll('.ly[data-role="focal"] .ly-img,.ly[data-role="subject"] .ly-img'),function(img){var art=img.closest('.ly-art');if(!art||img.closest('[data-loop="kenburns"]')||art.querySelector('.ly-vid'))return;if(getComputedStyle(img).objectFit!=='cover')return;lenses.push({img:img,art:art,s:0,ts:0,x:.5,y:.5,tx:.5,ty:.5,vx:0,vy:0,ok:null})});
K.lenses=lenses.length;
var VS='attribute vec2 p;varying vec2 v;void main(){v=vec2(p.x*.5+.5,.5-p.y*.5);gl_Position=vec4(p,0.,1.);}';
var FS='precision mediump float;uniform sampler2D t;uniform vec2 m,sc,of,vel;uniform float s,tm,asp;varying vec2 v;void main(){vec2 d=v-m;d.x*=asp;float r=length(d);float f=smoothstep(.34,0.,r);vec2 dir=r>.0001?normalize(d):vec2(0.);dir.x/=asp;float w=sin(r*18.-tm*2.6)*.0035*f*s;vec2 q=v-dir*f*f*.055*s+dir*w-vel*f*.06*s;vec2 u=of+q*sc;float ca=.0045*s*f*f;vec4 c=texture2D(t,u);gl_FragColor=vec4(texture2D(t,u+dir*ca).r,c.g,texture2D(t,u-dir*ca).b,c.a);}';
function lensInit(L){L.ok=false;try{var cv=d.createElement('canvas');cv.className='k-lens';cv.setAttribute('aria-hidden','true');var gl=cv.getContext('webgl',{premultipliedAlpha:false,alpha:true});if(!gl)return;
function sh(k,src){var o=gl.createShader(k);gl.shaderSource(o,src);gl.compileShader(o);return o}var pr=gl.createProgram();gl.attachShader(pr,sh(gl.VERTEX_SHADER,VS));gl.attachShader(pr,sh(gl.FRAGMENT_SHADER,FS));gl.linkProgram(pr);if(!gl.getProgramParameter(pr,gl.LINK_STATUS))return;gl.useProgram(pr);
var b=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,b);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,1,1]),gl.STATIC_DRAW);var a=gl.getAttribLocation(pr,'p');gl.enableVertexAttribArray(a);gl.vertexAttribPointer(a,2,gl.FLOAT,false,0,0);
var tx=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,tx);[gl.TEXTURE_WRAP_S,gl.TEXTURE_WRAP_T].forEach(function(k){gl.texParameteri(gl.TEXTURE_2D,k,gl.CLAMP_TO_EDGE)});gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,L.img);
L.u={};['m','sc','of','vel','s','tm','asp'].forEach(function(k){L.u[k]=gl.getUniformLocation(pr,k)});L.gl=gl;L.cv=cv;cv.style.filter=getComputedStyle(L.img).filter;L.art.appendChild(cv);L.ok=true}catch(e){L.ok=false}}
function lensDraw(L){var gl=L.gl,cv=L.cv,r=L.art.getBoundingClientRect(),dpr=Math.min(1.5,W.devicePixelRatio||1),Wd=Math.max(1,Math.round(r.width*dpr)),Hd=Math.max(1,Math.round(r.height*dpr));if(cv.width!==Wd||cv.height!==Hd){cv.width=Wd;cv.height=Hd;gl.viewport(0,0,Wd,Hd)}
var iw=L.img.naturalWidth||1,ih=L.img.naturalHeight||1,k=Math.max(r.width/iw,r.height/ih),dw=iw*k,dh=ih*k,op=(getComputedStyle(L.img).objectPosition||'50% 50%').split(' '),ox=parseFloat(op[0])/100,oy=parseFloat(op[1]||op[0])/100;if(isNaN(ox))ox=.5;if(isNaN(oy))oy=.5;
var left=(r.width-dw)*ox,top=(r.height-dh)*oy;gl.uniform2f(L.u.sc,r.width/dw,r.height/dh);gl.uniform2f(L.u.of,-left/dw,-top/dh);gl.uniform2f(L.u.m,L.x,L.y);gl.uniform2f(L.u.vel,L.vx,L.vy);gl.uniform1f(L.u.s,L.s);gl.uniform1f(L.u.tm,performance.now()/1000);gl.uniform1f(L.u.asp,r.width/Math.max(1,r.height));gl.drawArrays(gl.TRIANGLE_STRIP,0,4)}
var lensRun=false;
function lensTick(){var any=false;lenses.forEach(function(L){if(!L.ok)return;var px0=L.x,py0=L.y;L.s+=(L.ts-L.s)*.09;L.x+=(L.tx-L.x)*.16;L.y+=(L.ty-L.y)*.16;L.vx+=((L.x-px0)*4-L.vx)*.2;L.vy+=((L.y-py0)*4-L.vy)*.2;
if(L.s>.004){any=true;L.cv.style.opacity='1';lensDraw(L)}else L.cv.style.opacity='0'});if(any||lenses.some(function(L){return L.ok&&L.ts>0}))requestAnimationFrame(lensTick);else lensRun=false}
if(lenses.length)W.addEventListener('pointermove',function(e){if(e.pointerType&&e.pointerType!=='mouse')return;var hit=false;lenses.forEach(function(L){var r=L.art.getBoundingClientRect(),on=!reduced()&&e.clientX>=r.left&&e.clientX<=r.right&&e.clientY>=r.top&&e.clientY<=r.bottom&&r.width>40;
if(on&&L.ok===null&&L.img.complete&&L.img.naturalWidth)lensInit(L);L.ts=on&&L.ok?1:0;if(on){L.tx=(e.clientX-r.left)/r.width;L.ty=(e.clientY-r.top)/r.height;hit=true}});if(!lensRun){lensRun=true;requestAnimationFrame(lensTick)}},{passive:true});
if(pers==='mechanical'&&!RM&&W.MutationObserver){var heads=[].slice.call(d.querySelectorAll('.sc'));heads.forEach(function(sc){var h=sc.querySelector('.sc-heading');if(!h)return;if(sc.classList.contains('is-in'))setTimeout(function(){if(!reduced())decode(h)},120);new MutationObserver(function(){if(sc.classList.contains('is-in')&&!reduced())decode(h)}).observe(sc,{attributes:true,attributeFilter:['class']})})}
/* ---- on: the next frame, so a scene that is already in still plays its entrance */
/* (two steps: every word takes its start first, then the scenes already in play their entrance like the rest) */
H.classList.add('k-on');void H.offsetWidth;requestAnimationFrame(function(){requestAnimationFrame(function(){H.classList.add('k-go')})});
})();
`;

module.exports = { on, css, js };
