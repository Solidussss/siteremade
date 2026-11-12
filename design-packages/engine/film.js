// THE FILM: the media behind a v5 design's hero, played by the scroll. A design takes it in its hooks
// (film.derive(c, photos)) and puts {{$.film.runtime|raw}} in its page script; then
//
//   const film = SRFilm(canvas, {{$.film.json|raw}}, { flat })   // flat: show the last frame and stay still
//   film.draw(p, t)        // p: 0-1 through the take, t: seconds (only the no-media glow moves with t)
//   film.mode              // 'frames' | 'video' | 'photos' | 'type'
//   film.thumb(i, n)       // a small picture for step i of n (or '' with no media)
//   film.seconds()         // the take's length
//   film.size()            // after the canvas changes size
//   film.live()            // true when it should be drawn every frame (a video seeking, the glow moving)
//
// The media, in order: the take as still frames (photos.frames, "/…{n}.jpg|count|w|h|seconds", made on the server
// from the hero video; the nearest loaded frame is drawn, every eighth loads first, a phone takes the half-size set),
// else the video itself (photos.video, seeked to the scroll), else the business's photos (each takes its share of the
// scroll, the camera pushing in, the next dissolving in), else a dark glow in the design's colour with sparks.
'use strict';
const photoHero = require('./photo-hero');

const okUrl = (u) => typeof u === 'string' && (/^(https:\/\/|\/)[^\s"'<>()]+$/.test(u) || /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/.test(u));

// photos: the list to use when the design has its own photo fields (in chapter order), else photos.* via photo-hero
function derive(c, photos, glow) {
  const ph = (c && c.photos) || {};
  const fm = typeof ph.frames === 'string' ? /^(\/[^\s"'<>()|]*\{n\}[^\s"'<>()|]*)\|(\d{1,4})\|(\d{1,5})\|(\d{1,5})\|(\d{1,4})$/.exec(ph.frames) : null;
  const frames = fm && +fm[2] > 1 ? { u: fm[1], n: +fm[2], w: +fm[3], h: +fm[4], s: +fm[5] } : null;
  const video = okUrl(ph.video) ? ph.video : null;
  const list = photos ? photos.filter(okUrl).map((src) => ({ src, fx: .5, fy: .45, zoom: 1.18 }))
    : photoHero.shots(c).filter((x) => okUrl(x.src)).map((x) => ({ src: x.src, fx: x.fx / 100, fy: x.fy / 100, zoom: x.zoom }));
  const data = { frames, video, photos: list, glow: glow || [255, 150, 70] };
  const mode = frames ? 'frames' : video ? 'video' : list.length ? 'photos' : 'type';
  const poster = okUrl(ph.main) ? ph.main : list.length ? list[list.length - 1].src : '';
  return { json: JSON.stringify(data).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029'), mode, poster, runtime: RUNTIME };
}

const RUNTIME = `function SRFilm(cv,FILM,o){o=o||{};var cx=cv.getContext('2d'),W=1,H=1,dirty=true,flat=!!o.flat;
var coarse=matchMedia('(pointer:coarse)').matches,inFrame=false;try{inFrame=window.self!==window.top}catch(e){inFrame=true}
var shown=innerWidth;try{if(window.frameElement)shown=window.frameElement.getBoundingClientRect().width}catch(e){}
var cl=function(v){return v<0?0:v>1?1:v},ss=function(a,b,v){var t=cl((v-a)/(b-a));return t*t*(3-2*t)};
var fx=o.fx==null?.5:o.fx,fy=o.fy==null?.5:o.fy;
function size(){var r=cv.getBoundingClientRect(),d=Math.min(devicePixelRatio||1,coarse?2:1.5);W=Math.max(1,Math.round(r.width*d));H=Math.max(1,Math.round(r.height*d));if(cv.width!==W||cv.height!==H){cv.width=W;cv.height=H}dirty=true}
function cover(img,iw,ih,z,ax,ay,a){if(!iw||!ih)return;var s=Math.max(W/iw,H/ih)*(z||1),dw=iw*s,dh=ih*s;cx.globalAlpha=a==null?1:a;cx.drawImage(img,(W-dw)*(ax==null?fx:ax),(H-dh)*(ay==null?fy:ay),dw,dh);cx.globalAlpha=1}
var F=FILM.frames,FI=[],FN=0,STEP=1,fu='';
if(F){FN=F.n;fu=F.u;var lite=inFrame&&shown<900?'t':coarse?'s':'';if(lite&&fu.indexOf('/f/{n}')>=0){fu=fu.replace('/f/{n}','/'+lite+'/{n}');if(lite==='s')STEP=2}
 var fl=function(i){if(i<0||i>=FN||FI[i])return;var im=new Image();im.decoding='async';im.onload=function(){im.ok=1;dirty=true};im.src=fu.replace('{n}',String(i+1));FI[i]=im};
 var lastI=(FN-1)-((FN-1)%STEP);if(flat)fl(lastI);else{fl(0);fl(lastI);for(var st=8*STEP;st>=STEP;st>>=1)for(var i=0;i<FN;i+=st)fl(i)}}
function near(w){for(var d=0;d<FN;d++){if(w-d>=0&&FI[w-d]&&FI[w-d].ok)return FI[w-d];if(w+d<FN&&FI[w+d]&&FI[w+d].ok)return FI[w+d]}return null}
var V=null;if(!F&&FILM.video){V=document.createElement('video');V.muted=true;V.playsInline=true;V.preload='auto';V.setAttribute('muted','');V.setAttribute('playsinline','');
 V.addEventListener('loadeddata',function(){dirty=true;var pl=V.play();if(pl&&pl.then)pl.then(function(){V.pause()}).catch(function(){})});V.addEventListener('seeked',function(){dirty=true});V.src=FILM.video}
var PH=(!F&&!V?FILM.photos:[]).map(function(p){var im=new Image();im.decoding='async';im.onload=function(){dirty=true};im.src=p.src;return{im:im,src:p.src,fx:p.fx,fy:p.fy,zoom:p.zoom}});
var mode=F?'frames':V?'video':PH.length?'photos':'type',G=FILM.glow||[255,150,70];
var SP=[];for(var k=0;k<80;k++)SP.push({x:(k*.618034)%1,y:(k*.3819)%1,s:.4+((k*7)%10)/10,r:1+((k*3)%5)/2});
var lastP=-1;
function draw(p,t){p=cl(p);if(!dirty&&mode!=='video'&&mode!=='type'&&Math.abs(p-lastP)<1e-5)return;lastP=p;dirty=false;
 if(F){var im=near(Math.round(p*(FN-1)));if(!im)return;cx.clearRect(0,0,W,H);cover(im,im.naturalWidth,im.naturalHeight);return}
 if(V){if(V.readyState>=1&&V.duration){var want=p*(V.duration-.05);if(!V.seeking&&Math.abs(V.currentTime-want)>1/30)V.currentTime=want}if(V.readyState>=2)cover(V,V.videoWidth,V.videoHeight);return}
 if(PH.length){var kk=Math.min(p,.9999)*PH.length,i=Math.floor(kk),f=kk-i,a=PH[i],b=PH[i+1];cx.fillStyle='#000';cx.fillRect(0,0,W,H);
  if(a.im.complete&&a.im.naturalWidth)cover(a.im,a.im.naturalWidth,a.im.naturalHeight,1+(a.zoom-1)*(flat?1:f),a.fx,a.fy);
  var mix=b?ss(.82,1,f):0;if(mix>0&&b.im.complete&&b.im.naturalWidth)cover(b.im,b.im.naturalWidth,b.im.naturalHeight,1,b.fx,b.fy,mix);return}
 var heat=flat?1:ss(.2,.9,p),m=Math.max(W,H);cx.fillStyle='#090706';cx.fillRect(0,0,W,H);
 var g=cx.createRadialGradient(W*.6,H*1.08,0,W*.6,H*1.08,m*(.55+.45*heat));g.addColorStop(0,'rgba('+G[0]+','+G[1]+','+G[2]+','+(.42+.4*heat)+')');g.addColorStop(.4,'rgba('+(G[0]*.6|0)+','+(G[1]*.4|0)+','+(G[2]*.4|0)+','+(.22+.25*heat)+')');g.addColorStop(1,'rgba(0,0,0,0)');cx.fillStyle=g;cx.fillRect(0,0,W,H);
 cx.fillStyle='rgba('+Math.min(255,G[0]+40)+','+Math.min(255,G[1]+50)+','+Math.min(255,G[2]+50)+',1)';
 for(var j=0;j<SP.length;j++){var s=SP[j],y=H*(1-((s.y+(t||0)*.05*s.s+p*.6)%1)),x=W*(.2+.8*s.x)+Math.sin((t||0)*s.s+s.x*9)*18;cx.globalAlpha=(.12+.5*heat)*(y/H);cx.beginPath();cx.arc(x,y,s.r*(W/1400+.6),0,6.283);cx.fill()}cx.globalAlpha=1}
function thumb(i,n){if(F){var tu=F.u.indexOf('/f/{n}')>=0?F.u.replace('/f/{n}','/t/{n}'):F.u;return tu.replace('{n}',String(Math.round(((i+.5)/n)*(FN-1))+1))}
 if(PH.length)return PH[Math.min(PH.length-1,Math.floor(i*PH.length/n))].src;return ''}
size();addEventListener('resize',size);
return{mode:mode,draw:draw,thumb:thumb,size:size,seconds:function(){return F?F.s:V&&V.duration?V.duration:12},live:function(){return mode==='video'||(mode==='type'&&!flat)},poke:function(){dirty=true}}}`;

module.exports = { derive, RUNTIME, okUrl };
