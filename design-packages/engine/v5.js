// The v5 page standard, applied to every design's page when it is built (lib/bespoke/rules.js has the full list).
// The designs keep their own look and interactions; this adds what every page needs and none of them had:
//   - <html lang>, a meta description (from the page's own first paragraph), html/body overflow-x:clip
//   - a skip link to the page's main content, and visible focus outlines where a design had none
//   - still mode: ?still in the URL makes the page behave exactly as it does for a visitor who asked for reduced
//     motion (the designs already handle that in CSS and in their scripts), so screenshots and previews show the
//     finished state instead of an animation's first frame
//   inject(html, content) -> html
'use strict';

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const plain = (s) => String(s).replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();

// runs before the design's own scripts: in still mode, matchMedia('(prefers-reduced-motion: reduce)') matches, and
// once the page is parsed the design's reduced-motion CSS applies to everyone
const STILL = '<script>(function(){if(!/[?&]still\\b/.test(location.search))return;var d=document.documentElement;d.classList.add("sr-still");'
  + 'var mm=window.matchMedia&&window.matchMedia.bind(window);if(mm)window.matchMedia=function(q){var r=mm(q);if(/prefers-reduced-motion\\s*:\\s*reduce/.test(q))'
  + '{return{matches:true,media:q,onchange:null,addListener:function(){},removeListener:function(){},addEventListener:function(){},removeEventListener:function(){},dispatchEvent:function(){return false}}}return r};'
  + 'function flip(rules){for(var i=0;i<rules.length;i++){var r=rules[i];if(r.media&&/prefers-reduced-motion\\s*:\\s*reduce/.test(r.media.mediaText)){try{r.media.mediaText="all"}catch(e){}}else if(r.cssRules&&r.type!==1){flip(r.cssRules)}}}'
  + 'function all(){for(var s=0;s<document.styleSheets.length;s++){try{flip(document.styleSheets[s].cssRules)}catch(e){}}}'
  // pinned scroll scenes (a tall track with a sticky stage): show the scene at its end and fold the track to one
  // screen. The track reports itself as scrolled to the end, so the design's own progress maths reads 1.
  + 'function pin(){var vh=innerHeight,n=0;var els=document.querySelectorAll("body *");for(var i=0;i<els.length;i++){var el=els[i];if(getComputedStyle(el).position!=="sticky")continue;'
  + 'var p=el.parentElement;if(!p||p.__srPin)continue;var H=p.getBoundingClientRect().height;if(H<vh*1.6)continue;(function(p,H){var run=H-vh,top0=p.offsetTop,real=p.getBoundingClientRect.bind(p);p.__srPin=1;'
  + 'p.getBoundingClientRect=function(){var r=real(),t=r.top-run;return{top:t,bottom:t+H,left:r.left,right:r.right,width:r.width,height:H,x:r.left,y:t,toJSON:function(){return this}}};'
  + 'try{Object.defineProperty(p,"offsetHeight",{configurable:true,get:function(){return H}});Object.defineProperty(p,"offsetTop",{configurable:true,get:function(){return top0-run}})}catch(e){}'
  + 'p.classList.add("sr-pinned")})(p,H);n++}if(n){dispatchEvent(new Event("resize"));dispatchEvent(new Event("scroll"))}}'
  + 'document.addEventListener("DOMContentLoaded",function(){all();pin()});addEventListener("load",function(){all();pin();setTimeout(function(){dispatchEvent(new Event("scroll"))},300)})})()</script>';
const BASE_CSS = '<style>html,body{overflow-x:clip}.sr-skip{position:fixed;left:12px;top:-80px;z-index:2147483647;padding:10px 16px;border-radius:8px;background:#111;color:#fff;font:600 15px/1.2 system-ui,sans-serif;text-decoration:none}.sr-skip:focus{top:12px}.sr-still .sr-pinned{height:100vh!important;min-height:0!important;max-height:100vh!important}</style>';
const FOCUS_CSS = '<style>:where(a,button,input,select,textarea,summary,[tabindex]):focus-visible{outline:3px solid currentColor;outline-offset:3px}</style>';

function description(html) {
  const body = html.slice(Math.max(0, html.search(/<body\b/i)));
  for (const m of body.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)) {
    const t = plain(m[1]);
    if (t.length >= 60 && !/[{}<>]/.test(t)) return t.length > 155 ? t.slice(0, 152).replace(/\s+\S*$/, '') + '...' : t;
  }
  return null;
}

function inject(html, c = {}) {
  if (typeof html !== 'string' || !/<html\b/i.test(html)) return html;
  let out = html;
  const lang = /^[a-z]{2}(?:-[A-Za-z]{2})?$/.test((c && c.lang) || '') ? c.lang : 'en';
  out = out.replace(/<html\b(?![^>]*\blang=)([^>]*)>/i, `<html lang="${lang}"$1>`);
  const head = [STILL, BASE_CSS];
  if (!/:focus-visible|:focus\b/.test(out)) head.push(FOCUS_CSS);
  if (!/<meta[^>]+name=["']?description/i.test(out)) { const d = description(out); if (d) head.push(`<meta name="description" content="${esc(d)}">`); }
  out = /<head\b[^>]*>/i.test(out) ? out.replace(/<head\b[^>]*>/i, (m) => m + head.join('')) : out.replace(/<html\b[^>]*>/i, (m) => m + '<head>' + head.join('') + '</head>');
  // the skip link goes to the first <main>, else the first section after the top bar; an existing id is reused
  if (!/class=["']sr-skip["']/.test(out)) {
    let target = null;
    out = out.replace(/<(main|section)\b([^>]*)>/i, (m, tag, attrs) => {
      const id = attrs.match(/\bid=["']([^"']+)["']/);
      if (id) { target = id[1]; return m; }
      target = 'sr-main'; return `<${tag} id="sr-main"${attrs}>`;
    });
    if (target) out = out.replace(/<body\b[^>]*>/i, (m) => `${m}<a class="sr-skip" href="#${target}">Skip to content</a>`);
  }
  return out;
}

module.exports = { inject, description, STILL };
