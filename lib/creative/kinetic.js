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

// THE MOTION VOCABULARY the director chooses from, per scene (scene.move): how its headline arrives and how its pictures
// move through the scroll. A scene without a choice gets the layer's own rule (its arc role, the personality's pool).
const MOVES = {
  words: ['3d', 'blur', 'pop', 'split', 'cascade', 'flip', 'type', 'sweep', 'fill', 'rise'],
  picture: ['grow', 'tilt', 'drift', 'turn', 'rush', 'pixel', 'still'],
};
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

/* 3D WORDS: the big headlines have depth -- an extrusion in a darker shade of their own colour, lit from the mouse's side
   -- and each word turns toward the mouse (on a touch screen, with the scroll). The page's character sets how deep. */
html.k-go:not([data-motion="reduced"]) .sc[data-k3] .sc-heading{--kex:calc(.62 - var(--kpx,0) * .9);--key:calc(.8 - var(--kpy,0) * .9);perspective:1100px;perspective-origin:50% 40%;transform-style:preserve-3d;
  text-shadow:calc(var(--kex) * 0.0105em * var(--k3,1)) calc(var(--key) * 0.0105em * var(--k3,1)) 0 color-mix(in srgb,currentColor 76%,var(--s-surface,#000)),calc(var(--kex) * 0.0210em * var(--k3,1)) calc(var(--key) * 0.0210em * var(--k3,1)) 0 color-mix(in srgb,currentColor 73%,var(--s-surface,#000)),calc(var(--kex) * 0.0315em * var(--k3,1)) calc(var(--key) * 0.0315em * var(--k3,1)) 0 color-mix(in srgb,currentColor 71%,var(--s-surface,#000)),calc(var(--kex) * 0.0420em * var(--k3,1)) calc(var(--key) * 0.0420em * var(--k3,1)) 0 color-mix(in srgb,currentColor 69%,var(--s-surface,#000)),calc(var(--kex) * 0.0525em * var(--k3,1)) calc(var(--key) * 0.0525em * var(--k3,1)) 0 color-mix(in srgb,currentColor 66%,var(--s-surface,#000)),calc(var(--kex) * 0.0630em * var(--k3,1)) calc(var(--key) * 0.0630em * var(--k3,1)) 0 color-mix(in srgb,currentColor 64%,var(--s-surface,#000)),calc(var(--kex) * 0.0735em * var(--k3,1)) calc(var(--key) * 0.0735em * var(--k3,1)) 0 color-mix(in srgb,currentColor 61%,var(--s-surface,#000)),calc(var(--kex) * 0.0840em * var(--k3,1)) calc(var(--key) * 0.0840em * var(--k3,1)) 0 color-mix(in srgb,currentColor 59%,var(--s-surface,#000)),calc(var(--kex) * 0.0945em * var(--k3,1)) calc(var(--key) * 0.0945em * var(--k3,1)) 0 color-mix(in srgb,currentColor 57%,var(--s-surface,#000)),calc(var(--kex) * 0.1050em * var(--k3,1)) calc(var(--key) * 0.1050em * var(--k3,1)) 0 color-mix(in srgb,currentColor 54%,var(--s-surface,#000)),calc(var(--kex) * 0.1155em * var(--k3,1)) calc(var(--key) * 0.1155em * var(--k3,1)) 0 color-mix(in srgb,currentColor 52%,var(--s-surface,#000)),calc(var(--kex) * 0.1260em * var(--k3,1)) calc(var(--key) * 0.1260em * var(--k3,1)) 0 color-mix(in srgb,currentColor 50%,var(--s-surface,#000)),calc(var(--kex) * 0.1365em * var(--k3,1)) calc(var(--key) * 0.1365em * var(--k3,1)) 0 color-mix(in srgb,currentColor 47%,var(--s-surface,#000)),calc(var(--kex) * 0.1470em * var(--k3,1)) calc(var(--key) * 0.1470em * var(--k3,1)) 0 color-mix(in srgb,currentColor 45%,var(--s-surface,#000)),calc(var(--kex) * 0.1575em * var(--k3,1)) calc(var(--key) * 0.1575em * var(--k3,1)) 0 color-mix(in srgb,currentColor 43%,var(--s-surface,#000)),calc(var(--kex) * 0.1680em * var(--k3,1)) calc(var(--key) * 0.1680em * var(--k3,1)) 0 color-mix(in srgb,currentColor 40%,var(--s-surface,#000)),calc(var(--kex) * 0.1785em * var(--k3,1)) calc(var(--key) * 0.1785em * var(--k3,1)) 0 color-mix(in srgb,currentColor 38%,var(--s-surface,#000)),calc(var(--kex) * 0.1890em * var(--k3,1)) calc(var(--key) * 0.1890em * var(--k3,1)) 0 color-mix(in srgb,currentColor 35%,var(--s-surface,#000)),calc(var(--kex) * 0.1995em * var(--k3,1)) calc(var(--key) * 0.1995em * var(--k3,1)) 0 color-mix(in srgb,currentColor 33%,var(--s-surface,#000)),calc(var(--kex) * 0.2100em * var(--k3,1)) calc(var(--key) * 0.2100em * var(--k3,1)) 0 color-mix(in srgb,currentColor 31%,var(--s-surface,#000)),calc(var(--kex) * 0.2205em * var(--k3,1)) calc(var(--key) * 0.2205em * var(--k3,1)) 0 color-mix(in srgb,currentColor 28%,var(--s-surface,#000)),calc(var(--kex) * 0.2310em * var(--k3,1)) calc(var(--key) * 0.2310em * var(--k3,1)) 0 color-mix(in srgb,currentColor 26%,var(--s-surface,#000)),calc(var(--kex) * .2em) calc(var(--key) * .26em) .22em rgba(0,0,0,.2),0 0 .55em color-mix(in srgb,var(--s-surface,#000) 50%,transparent)}
html.k-go:not([data-motion="reduced"]) .sc[data-k3].k-done .kw{overflow:visible}
html.k-go:not([data-motion="reduced"]) .sc[data-k3] .kw{transform:rotateY(calc((-16deg + var(--kpx,0) * 22deg) * var(--k3,1))) rotateX(calc((9deg - var(--kpy,0) * 16deg) * var(--k3,1))) skewX(calc(var(--kv,0) * -7deg * var(--kI,1)));transform-style:preserve-3d}
@media (hover:none){html.k-go:not([data-motion="reduced"]) .sc[data-k3] .kw{transform:rotateY(calc((-14deg + (var(--p,.5) - .5) * 30deg) * var(--k3,1))) rotateX(calc((9deg - (var(--p,.5) - .5) * 30deg) * var(--k3,1)))}
  html.k-go:not([data-motion="reduced"]) .sc[data-k3] .sc-heading{--kex:calc(.55 + (var(--p,.5) - .5) * 1.4);--key:.85}}
/* every headline leans with the scroll's speed */
html.k-go:not([data-motion="reduced"]) .sc:not([data-k3]) .kw{transform:skewX(calc(var(--kv,0) * -7deg * var(--kI,1)))}

/* LETTERS: a 3D headline is made of letters -- they burst apart in 3D as their scene is left (the opening's as soon as the
   page scrolls) and come back together on the way up; on a mouse they scatter from the cursor and spring back */
.kc{display:inline-block}
html.k-go:not([data-motion="reduced"]) .sc[data-k3] .kc{transform:translate3d(calc(var(--kb,0) * var(--rx) * 1vw), calc(var(--kb,0) * var(--ry) * 1vh), 0) rotate(calc(var(--kb,0) * var(--rr) * 1deg)) scale(calc(1 + var(--kb) * var(--rs)));opacity:calc(1 - var(--kb,0) * .92);transition:translate .6s cubic-bezier(.2,.9,.3,1.35),rotate .6s cubic-bezier(.2,.9,.3,1.35)}
/* (giant words carry half the depth and angle: on monumental type a full extrusion becomes a slab) */
html.k-go:not([data-motion="reduced"]) .sc[data-k3]:not(:first-of-type):not([data-hero]) .sc-text[data-giant]{--k3:calc(var(--k3c,1) * .45)}
/* (only the opening bursts -- as soon as the page scrolls; a later 3D headline keeps its depth and its scatter, never shards) */
html.k-go:not([data-motion="reduced"]) .sc[data-k3]:is(:first-of-type,[data-hero]) .kc{--kb:clamp(0, (var(--p,0) - .1) * 3.1, 1)}

/* THE WORDS' ENTRANCES: each scene's headline arrives its own way (chosen by the page's character, never the same twice in
   a row) -- blur, pop, cascade, flip, split, type, sweep -- the opening and the 3D headlines keep their rise */
html.k-on:not([data-motion="reduced"]) .sc[data-kt] .kw>i{transform:none}
html.k-on:not([data-motion="reduced"]) .sc[data-kt]:not([data-kt="sweep"]) .kw{overflow:visible}
html.k-on:not([data-motion="reduced"]) .sc[data-kt="blur"] .kw>i{opacity:0;filter:blur(18px);scale:1.3;transition:opacity .9s ease calc(var(--wi) * 85ms),filter 1.1s ease calc(var(--wi) * 85ms),scale 1.2s cubic-bezier(.16,1,.3,1) calc(var(--wi) * 85ms)}
html.k-go:not([data-motion="reduced"]) .sc[data-kt="blur"].is-in .kw>i{opacity:1;filter:none;scale:1}
html.k-on:not([data-motion="reduced"]) .sc[data-kt="pop"] .kw>i{opacity:0;scale:.15;rotate:-10deg;transition:opacity .35s ease calc(var(--wi) * 75ms),scale .75s cubic-bezier(.34,1.7,.64,1) calc(var(--wi) * 75ms),rotate .75s cubic-bezier(.34,1.7,.64,1) calc(var(--wi) * 75ms)}
html.k-go:not([data-motion="reduced"]) .sc[data-kt="pop"].is-in .kw>i{opacity:1;scale:1;rotate:0deg}
html.k-on:not([data-motion="reduced"]) .sc[data-kt="split"] .kw>i{opacity:0;translate:calc(var(--side,1) * 46vw) 0;transition:opacity .8s ease calc(var(--wi) * 40ms),translate 1.25s cubic-bezier(.16,1,.3,1) calc(var(--wi) * 40ms)}
html.k-go:not([data-motion="reduced"]) .sc[data-kt="split"].is-in .kw>i{opacity:1;translate:0 0}
html.k-on:not([data-motion="reduced"]) .sc[data-kt="cascade"] .kc{opacity:0;translate:0 -1.1em;rotate:calc(var(--rr0,12) * 1deg);transition:opacity .4s ease calc(var(--ci) * 30ms),translate .8s cubic-bezier(.34,1.56,.64,1) calc(var(--ci) * 30ms),rotate .8s cubic-bezier(.34,1.56,.64,1) calc(var(--ci) * 30ms)}
html.k-go:not([data-motion="reduced"]) .sc[data-kt="cascade"].is-in .kc{opacity:1;translate:0 0;rotate:0deg}
html.k-on:not([data-motion="reduced"]) .sc[data-kt="flip"] .kw>i{perspective:700px}
html.k-on:not([data-motion="reduced"]) .sc[data-kt="flip"] .kc{opacity:0;rotate:x -100deg;transform-origin:50% 0;transition:opacity .5s ease calc(var(--ci) * 34ms),rotate 1s cubic-bezier(.16,1,.3,1) calc(var(--ci) * 34ms)}
html.k-go:not([data-motion="reduced"]) .sc[data-kt="flip"].is-in .kc{opacity:1;rotate:x 0deg}
html.k-on:not([data-motion="reduced"]) .sc[data-kt="type"] .kc{opacity:0;transition:opacity 0s linear calc(.2s + var(--ci) * 48ms)}
html.k-go:not([data-motion="reduced"]) .sc[data-kt="type"].is-in .kc{opacity:1}
html.k-go:not([data-motion="reduced"]) .sc[data-kt="type"] .sc-heading::after{content:"";display:inline-block;width:.07em;height:.85em;margin-left:.06em;vertical-align:-.05em;background:currentColor;animation:k-caret 1s steps(1) infinite}
html.k-on:not([data-motion="reduced"]) .sc[data-kt="sweep"] .kw{position:relative}
html.k-on:not([data-motion="reduced"]) .sc[data-kt="sweep"] .kw>i{opacity:0}
html.k-go:not([data-motion="reduced"]) .sc[data-kt="sweep"].is-in .kw>i{animation:k-sweepw 1s linear calc(var(--wi) * 110ms) both}
html.k-go:not([data-motion="reduced"]) .sc[data-kt="sweep"] .kw::after{content:"";position:absolute;inset:.04em -.02em .1em;background:var(--s-accent,var(--accent,currentColor));transform:scaleX(0);transform-origin:0 50%}
html.k-go:not([data-motion="reduced"]) .sc[data-kt="sweep"].is-in .kw::after{animation:k-sweep 1s cubic-bezier(.7,0,.3,1) calc(var(--wi) * 110ms) both}
@keyframes k-sweep{0%{transform:scaleX(0);transform-origin:0 50%}50%{transform:scaleX(1);transform-origin:0 50%}50.1%{transform:scaleX(1);transform-origin:100% 50%}100%{transform:scaleX(0);transform-origin:100% 50%}}
@keyframes k-sweepw{0%,49%{opacity:0}50%,100%{opacity:1}}
@keyframes k-caret{0%,49%{opacity:1}50%,100%{opacity:0}}
/* the small line above a headline tightens into place */
html.k-on:not([data-motion="reduced"]) .sc .sc-kicker{transition:opacity .9s ease,filter .9s ease,translate 1s cubic-bezier(.16,1,.3,1),letter-spacing 1.4s cubic-bezier(.16,1,.3,1)}
html.k-on:not([data-motion="reduced"]) .sc:not(.is-in) .sc-kicker{letter-spacing:.7em}
/* words that drift apart and back with the scroll (a long headline on a lively page) */
html.k-go:not([data-motion="reduced"]) .sc[data-kd] .kw{translate:calc(max(0, .55 - var(--p,.5)) * var(--wd,1) * 16vw * var(--kI,1)) 0}
/* on a mouse, a headline's letters ripple as the mouse crosses it */
@media (hover:hover) and (pointer:fine){html.k-go:not([data-motion="reduced"]) .sc[data-kt]:is([data-kt="cascade"],[data-kt="flip"],[data-kt="type"]).is-in .sc-heading:hover .kc{animation:k-wave .9s ease-in-out calc(var(--ci) * 35ms)}}
@keyframes k-wave{0%,100%{translate:0 0}35%{translate:0 -.16em}70%{translate:0 .04em}}
/* THE CLIP IN THE NAME: a page that opens on a premium clip shows the clip only inside its name's letters; as the page
   scrolls, the letters grow past the camera and the footage floods the screen (--kz, --ko from the scroll) */
.k-knock{position:absolute;inset:0;z-index:5;overflow:hidden;pointer-events:none;background:var(--kbg,#111)}
.k-knock video{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block}
html[data-motion="reduced"] .k-knock{display:none}
html.k-go:not([data-motion="reduced"]) .sc[data-knock] .k-knock video{-webkit-mask-image:var(--kmask),linear-gradient(rgba(0,0,0,var(--ko,0)),rgba(0,0,0,var(--ko,0)));mask-image:var(--kmask),linear-gradient(rgba(0,0,0,var(--ko,0)),rgba(0,0,0,var(--ko,0)));-webkit-mask-size:calc(var(--kz,1) * 100%) auto,100% 100%;mask-size:calc(var(--kz,1) * 100%) auto,100% 100%;-webkit-mask-position:center;mask-position:center;-webkit-mask-repeat:no-repeat;mask-repeat:no-repeat}
html.k-go:not([data-motion="reduced"]) .sc[data-knock] .sc-heading{opacity:var(--ko,0);transition:opacity .2s linear}
/* a full-screen clip scene melts into the page's colour at its foot */
html.k-go:not([data-motion="reduced"]) .sc[data-pv] .ly[data-role="focal"] .ly-art::after{content:"";position:absolute;inset:auto 0 0;height:22%;background:linear-gradient(to bottom,transparent,var(--s-surface,transparent));pointer-events:none;z-index:2}
/* PIXELS: a reveal's photograph arrives as big blocks that sharpen into the picture (a flat 2D drawing over it, gone once sharp) */
.k-pix{position:absolute;inset:0;width:100%;height:100%;display:block;pointer-events:none;image-rendering:pixelated;z-index:1}
/* THE INTRO: the first visit of a session opens on the name and a count, then the page is uncovered */
.k-intro{position:fixed;inset:0;z-index:2147482500;display:grid;place-items:center;background:var(--kbg,#111);color:var(--kink,#fff);clip-path:inset(0 0 0 0);transition:clip-path .9s cubic-bezier(.76,0,.24,1)}
.k-intro.is-out{clip-path:inset(0 0 100% 0)}
.k-intro-n{font-family:var(--kmf,inherit);font-weight:800;font-size:clamp(48px,11vw,190px);letter-spacing:-.02em;text-transform:uppercase;line-height:1;overflow:hidden;padding:.05em .1em .1em}
.k-intro-n span{display:inline-block;transform:translateY(110%);animation:k-in-up .9s cubic-bezier(.16,1,.3,1) forwards;animation-delay:calc(var(--i) * 55ms)}
.k-intro-c{position:absolute;right:4vw;bottom:4vh;font:600 clamp(14px,1.4vw,20px)/1 system-ui,sans-serif;letter-spacing:.12em;font-variant-numeric:tabular-nums}
@keyframes k-in-up{to{transform:none}}
html[data-motion="reduced"] .k-intro{display:none}
/* THE PROGRESS LINE: how far down the page the visitor is */
.k-prog{position:fixed;left:0;top:0;height:2px;width:100%;transform-origin:0 50%;transform:scaleX(var(--kprog,0));background:var(--accent,currentColor);z-index:2147481500;pointer-events:none}
html[data-motion="reduced"] .k-prog{display:none}
/* (a phone has no room to spare at its sides: the words never drift off it, a 3D word tips forward only, a little shallower) */
/* (a phone's tilt is its mouse: the pictures lean by their depth, the 3D words turn with it) */
@media (hover:none),(pointer:coarse){
  html.k-on:not([data-motion="reduced"]):where(.k-tilt) .ly{translate:calc(var(--kpx,0) * var(--kdp,0) * 2.6vw) calc(var(--kpy,0) * var(--kdp,0) * 1.3vh)}
  html.k-on:not([data-motion="reduced"]):where(.k-tilt) .ly[data-role="focal"],html.k-on:not([data-motion="reduced"]):where(.k-tilt) .ly[data-role="subject"]{--kdp:1.3}
  html.k-on:not([data-motion="reduced"]):where(.k-tilt) .ly[data-role="support"]{--kdp:.8}
  html.k-on:not([data-motion="reduced"]):where(.k-tilt) .ly[data-role="backdrop"],html.k-on:not([data-motion="reduced"]):where(.k-tilt) .ly[data-role="texture"]{--kdp:.35}
  html.k-on:not([data-motion="reduced"]):where(.k-tilt) .ly[data-role="backdrop"] .ly-art{scale:1.06}}
@media (max-width:720px){html.k-go:not([data-motion="reduced"]) .sc[data-kd] .kw{translate:none}
  html.k-go:not([data-motion="reduced"]) .sc[data-k3] .sc-heading{--k3:calc(var(--k3c,1) * .6)}
  html.k-go:not([data-motion="reduced"]) .sc[data-k3] .kw{transform:rotateY(calc(var(--kpx,0) * 18deg * var(--k3,1))) rotateX(calc((8deg - (var(--p,.5) - .5) * 24deg - var(--kpy,0) * 8deg) * var(--k3,1)))}}
/* THE BAND: the page's name runs across the page between scenes, faster as the visitor scrolls faster, turning with the scroll */
.k-mq{position:relative;z-index:3;overflow:hidden;padding:2.2vh 0;pointer-events:none;background:var(--bg,#111);border-block:1px solid color-mix(in srgb,var(--ink,#fff) 14%,transparent)}
.k-mq-t{display:inline-flex;white-space:nowrap;will-change:transform;font-family:var(--kmf,inherit);font-weight:800;font-size:clamp(56px,12vw,220px);line-height:1;letter-spacing:-.02em;text-transform:uppercase;color:transparent;-webkit-text-stroke:1.5px var(--ink,#fff)}
.k-mq-t span{padding:0 .35em}.k-mq-t span:nth-child(2n){color:var(--accent,var(--ink,#fff));-webkit-text-stroke:0}
html[data-motion="reduced"] .k-mq{display:none}
.k-mq-t .k-mq-f{display:inline-block;height:.78em;aspect-ratio:16/9;margin:0 .3em;vertical-align:-.08em;border-radius:.08em;object-fit:cover;-webkit-text-stroke:0;box-shadow:0 .05em .2em rgba(0,0,0,.35)}
/* THE TRAIL: in one scene, the mouse leaves the page's own pictures behind it */
.k-trail{position:fixed;left:0;top:0;width:clamp(120px,14vw,240px);aspect-ratio:4/5;object-fit:cover;border-radius:10px;pointer-events:none;z-index:2147481000;box-shadow:0 18px 40px rgba(0,0,0,.35);animation:k-trail 1.15s cubic-bezier(.16,1,.3,1) forwards}
@keyframes k-trail{0%{opacity:0;scale:.4}14%{opacity:1;scale:1}70%{opacity:1;scale:1}100%{opacity:0;scale:.86;translate:0 40px}}
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
var CH={luxe:[.55,0,0,1.35,95,.08,.55],still:[.45,0,0,1.4,100,.075,.45],editorial:[.75,1,1.2,1.15,80,.09,.75],cinematic:[1,1.6,2,1.25,85,.085,1],kinetic:[1.25,3.2,6,.9,55,.12,1.25],playful:[1.3,3,7,.85,55,.13,1.3],chaotic:[1.5,4,9,.8,45,.14,1.5],mechanical:[1,0,0,.75,40,.12,.9]};
var pers=H.getAttribute('data-personality')||'editorial',ch=CH[pers]||CH.editorial;K.personality=pers;
H.style.setProperty('--kI',ch[0]);H.style.setProperty('--kS',ch[1]);H.style.setProperty('--kR',ch[2]);H.style.setProperty('--kT',ch[3]);H.style.setProperty('--kW',ch[4]);H.style.setProperty('--k3',ch[6]);H.style.setProperty('--k3c',ch[6]);var GL=ch[5];
function rgb(c){c=c||'';var m;if(c.indexOf('rgb')===0){m=c.match(/[0-9.]+/g);return m&&m.length>=3?[+m[0],+m[1],+m[2]]:null}m=/^#([0-9a-f]{6})$/i.exec(c);return m?[parseInt(m[1].slice(0,2),16),parseInt(m[1].slice(2,4),16),parseInt(m[1].slice(4),16)]:null}
function lumi(c){return c?[0,1,2].reduce(function(a,k){var v=c[k]/255;v=v<=.03928?v/12.92:Math.pow((v+.055)/1.055,2.4);return a+v*[.2126,.7152,.0722][k]},0):null}
function clear(h,sc){var a=lumi(rgb(getComputedStyle(h).color)),b=lumi(rgb(sc.getAttribute('data-surf')));if(a==null||b==null)return true;return (Math.max(a,b)+.05)/(Math.min(a,b)+.05)>=3.2}
var ARC={takeover:'grow',payoff:'grow',reveal:/^(mechanical|kinetic|playful|chaotic)$/.test(pers)?'pixel':'tilt',transformation:'turn',breath:'drift',escalation:'rush'};
(function(){var kinds=['grow','tilt','drift','turn','rush','pixel'],last='',all=[].slice.call(d.querySelectorAll('.sc'));all.forEach(function(sc,i){
if(i>0&&!sc.hasAttribute('data-pv')&&!('3d' in sc.dataset)&&!/^(mask-reveal|expand)$/.test(sc.getAttribute('data-choreo')||'')&&sc.querySelector('.ly[data-kind="image"],.ly .ly-img')){var want=sc.getAttribute('data-kmp');if(want==='still'){last=''}else if(kinds.indexOf(want)>=0){sc.setAttribute('data-kp',want);last=want}else{var k=ARC[sc.getAttribute('data-arc')]||kinds[i%kinds.length];if(k===last)k=kinds[(kinds.indexOf(k)+1)%kinds.length];if(ch[0]<.6&&(k==='rush'||k==='turn'||k==='pixel'))k='drift';sc.setAttribute('data-kp',k);last=k}}
var h=sc.querySelector('.sc-heading'),mw=sc.getAttribute('data-kmw')||'',nw=h?h.querySelectorAll('.kw').length:0;if(h&&clear(h,sc)&&(i===0||(mw==='3d'&&nw<=6)||(!mw&&(/^(takeover|payoff)$/.test(sc.getAttribute('data-arc')||'')||h.hasAttribute('data-giant')||sc.querySelector('.sc-text[data-giant]')))))sc.setAttribute('data-k3','');if(i>0&&i<all.length-1&&h&&(mw==='fill'?nw>=3:!mw&&nw>=5)&&!sc.hasAttribute('data-pin'))sc.setAttribute('data-kf','');
if(i<all.length-1&&!sc.hasAttribute('data-pin')&&!sc.hasAttribute('data-seam-in'))sc.setAttribute('data-kx','')})})();
/* ---- decode (a mechanical page): each headline's letters resolve out of noise, left to right, as its scene arrives */
function decode(h){if(h._dec)return;h._dec=1;var ws=[].slice.call(h.querySelectorAll('.kc').length?h.querySelectorAll('.kc'):h.querySelectorAll('.kw>i')),fin=ws.map(function(w){return w.textContent}),G='ABCDEFGHJKLMNPRSTUVWXYZ0123456789#%&*/<>',t0=performance.now(),total=fin.join('').length,dur=650+total*18;
(function step(t){var k=Math.min(1,(t-t0)/dur),n=Math.floor(k*total),c=0;ws.forEach(function(w,j){var f=fin[j],o='';for(var x=0;x<f.length;x++,c++)o+=c<n||/[^A-Za-z0-9]/.test(f[x])?f[x]:G[(Math.random()*G.length)|0];w.textContent=o});if(k<1)requestAnimationFrame(step);else ws.forEach(function(w,j){w.textContent=fin[j]})})(t0)}
/* ---- smooth scroll (wheel only) */
var target=W.scrollY||0,cur=target,gliding=false;
function maxY(){return Math.max(0,(d.scrollingElement||H).scrollHeight-innerHeight)}
function scrollable(el,dy){for(;el&&el!==d.body&&el!==H;el=el.parentElement){var s=getComputedStyle(el);if(/(auto|scroll)/.test(s.overflowY)&&el.scrollHeight>el.clientHeight+1){if(dy<0?el.scrollTop>0:el.scrollTop+el.clientHeight<el.scrollHeight-1)return true}}return false}
/* (instant steps: the page's own smooth scrolling -- for its contents links -- would restart on every step and crawl) */
function to(y){try{W.scrollTo({top:y,left:0,behavior:'instant'})}catch(e){W.scrollTo(0,y)}}
function glide(){cur+=(target-cur)*GL;if(Math.abs(target-cur)<.6)cur=target;to(cur);if(cur!==target)requestAnimationFrame(glide);else gliding=false}
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
/* ---- tilt (a touch screen): the phone's angle against where it is held -- that rest angle follows the hand over a
   couple of seconds -- steers the same depth the mouse does; tiny shakes are ignored */
var tilting=false;
if(!fine&&!RM&&W.DeviceOrientationEvent){var g0=null,b0=null;
function onTilt(e){if(e.gamma==null||e.beta==null||reduced())return;var a=(screen.orientation&&screen.orientation.angle)||W.orientation||0,gx=e.gamma,gy=e.beta;if(a===90){gx=e.beta;gy=-e.gamma}else if(a===-90||a===270){gx=-e.beta;gy=e.gamma}
if(g0==null){g0=gx;b0=gy}g0+=(gx-g0)*.005;b0+=(gy-b0)*.005;var nx=Math.max(-1,Math.min(1,(gx-g0)/18)),ny=Math.max(-1,Math.min(1,(gy-b0)/18));if(Math.abs(nx-tx)<.01&&Math.abs(ny-ty)<.01)return;
tx=nx;ty=ny;if(!tilting){tilting=true;H.classList.add('k-tilt');K.tilt=true}if(!moving){moving=true;requestAnimationFrame(follow)}}
var heard=false;function listen(){if(heard)return;heard=true;W.addEventListener('deviceorientation',onTilt,{passive:true})}
var DOE=W.DeviceOrientationEvent;if(typeof DOE.requestPermission==='function'){var ask=function(){d.removeEventListener('click',ask,true);d.removeEventListener('touchend',ask,true);try{DOE.requestPermission().then(function(r){if(r==='granted')listen()},function(){})}catch(e){}};d.addEventListener('click',ask,true);d.addEventListener('touchend',ask,true)}listen()}
var rx=0,ry=0;
function follow(){px+=(tx-px)*.08;py+=(ty-py)*.08;rx+=(mx-rx)*.22;ry+=(my-ry)*.22;if(!reduced()){H.style.setProperty('--kpx',px.toFixed(4));H.style.setProperty('--kpy',py.toFixed(4))}
if(ring)ring.style.transform='translate3d('+rx.toFixed(1)+'px,'+ry.toFixed(1)+'px,0)';
if(tilting&&W.CustomEvent)W.dispatchEvent(new CustomEvent('cr-tilt',{detail:{x:px,y:py}}));
if(Math.abs(tx-px)>.001||Math.abs(ty-py)>.001||Math.abs(mx-rx)>.3||Math.abs(my-ry)>.3)requestAnimationFrame(follow);else moving=false}
var prog=null;if(!RM){prog=d.createElement('div');prog.className='k-prog';prog.setAttribute('aria-hidden','true');d.body.appendChild(prog)}
/* ---- scrubbed clips: the visitor plays them. Their scenes' places are measured when the layout changes (load, resize, the
   page growing) -- never read while scrolling */
var clips=[],hero=null,firstSc=d.querySelector('.sc');
[].forEach.call(d.querySelectorAll('.ly-vid,.shv-vid'),function(v){var sc=v.closest('.sc');if(!sc)return;v.setAttribute('data-scrub','');v.removeAttribute('autoplay');v.removeAttribute('loop');v.autoplay=false;v.loop=false;v.preload='auto';try{v.pause()}catch(e){}
var c={v:v,sc:sc,want:0,at:0,busy:false,ready:false,top:0,h:1};v.addEventListener('loadedmetadata',function(){c.ready=v.duration>0;kick()});v.addEventListener('seeked',function(){c.busy=false});if(v.readyState>=1&&v.duration>0)c.ready=true;
clips.push(c);if(sc===firstSc)hero=c});K.scrub=clips.length;
/* (on a phone the product carried between scenes stands fixed at the top of the screen: a scene's words that scroll up under it fade there, and come back below it) */
var navPx=56,under=[].slice.call(d.querySelectorAll('.sc[data-actor] .sc-text')).map(function(t){return{t:t,top:0,h:0}});
function keepClear(y){if(innerWidth>720||reduced()){under.forEach(function(u){u.t.style.opacity=''});return}var zone=navPx+innerHeight*.38;under.forEach(function(u){var top=u.top-y,o=Math.max(0,Math.min(1,(top-zone)/90));u.t.style.opacity=o<1?o.toFixed(3):''})}
function measureK(){var y=W.scrollY||0;kdLines();navPx=parseFloat(getComputedStyle(H).getPropertyValue('--nav'))||56;under.forEach(function(u){var r=u.t.getBoundingClientRect();u.top=r.top+y;u.h=r.height});clips.forEach(function(c){var r=c.sc.getBoundingClientRect();c.top=r.top+y;c.h=Math.max(1,r.height)});if(knock){var r=knock.sc.getBoundingClientRect();knock.top=r.top+y;knock.h=Math.max(1,r.height)}}
function clipAt(c,y,vh){var top=c.top-y,tall=c.h>vh*1.05,span=tall?c.h-vh:c.h+vh,p=tall?-top/span:(vh-top)/span;return Math.max(0,Math.min(1,p))}
var heroScrolled=false,scrubbing=false,SY=W.scrollY||0;
function flood(y){if(!knock)return;var q=Math.max(0,Math.min(1,(-(knock.top-y)/knock.h-.02)/.34)),e=q*q*(3-2*q);knock.sc.style.setProperty('--kz',(1+e*e*7).toFixed(3));knock.sc.style.setProperty('--ko',Math.max(0,Math.min(1,(e-.3)/.6)).toFixed(3))}
function scrubFrame(){var vh=innerHeight,y=SY,live=false;flood(y);if(!reduced())clips.forEach(function(c){if(!c.ready)return;var top=c.top-y;if(top+c.h<-50||top>vh+50)return;var dur=c.v.duration,p=c===hero?Math.max(0,Math.min(1,-top/c.h)):clipAt(c,y,vh);
/* (the opening clip: the mouse plays it -- on a touch screen it plays by itself; once the page scrolls, the scroll carries it on
   from where it was) */
if(c===hero){if(!heroScrolled){if(fine&&mx>=0)p=mx/innerWidth;else{p=(Date.now()/1000/Math.max(2,dur))%1;live=true}c.base=p}else p=(c.base||0)+(1-(c.base||0))*p}
if(c!==hero)p=p<.5?2*p*p:1-2*(1-p)*(1-p);c.want=p*Math.max(0,dur-.05);c.at+=(c.want-c.at)*.18;if(Math.abs(c.want-c.at)>.004)live=true;if(!c.busy&&Math.abs(c.v.currentTime-c.at)>1/30){c.busy=true;try{if(c.v.fastSeek&&Math.abs(c.v.currentTime-c.at)>.5)c.v.fastSeek(c.at);else c.v.currentTime=c.at}catch(e){c.busy=false}}});
if(live)requestAnimationFrame(scrubFrame);else scrubbing=false}
function kick(){if((clips.length||knock)&&!scrubbing){scrubbing=true;requestAnimationFrame(scrubFrame)}}
if(clips.length||knock||under.length){measureK();W.addEventListener('resize',function(){measureK();kick()});W.addEventListener('load',function(){measureK();kick()});if(W.ResizeObserver){try{new W.ResizeObserver(function(){measureK();kick()}).observe(d.body)}catch(e){}}kick()}
/* ---- the scroll's speed: pictures lean with it (--kv), settling when it stops */
var ly0=W.scrollY||0,kvIn=0,kv=0,kvRun=false;function speed(){kv+=(kvIn-kv)*.14;kvIn*=.7;if(Math.abs(kv)<.002&&Math.abs(kvIn)<.002){kv=0;kvRun=false}H.style.setProperty('--kv',reduced()?'0':kv.toFixed(3));if(kvRun)requestAnimationFrame(speed)}
/* ---- one scroll listener for the whole page: the page's own frame (render2) calls this with where the page is */
W.__crKinFrame=function(y){SY=y;if(under.length)keepClear(y);if(prog)H.style.setProperty('--kprog',Math.max(0,Math.min(1,y/Math.max(1,(d.scrollingElement||H).scrollHeight-innerHeight))).toFixed(4));if(!gliding)cur=target=y;heroScrolled=y>8;kvIn=Math.max(-1,Math.min(1,(y-ly0)/60));ly0=y;if(!kvRun){kvRun=true;requestAnimationFrame(speed)}kick()};
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
/* ---- each scene's headline entrance, from the page's character; letters where the entrance works letter by letter */
/* (the drifting lines: a line is the words that share a top -- measured with the layout, never while scrolling) */
function kdLines(){[].forEach.call(d.querySelectorAll('.sc[data-kd] .sc-heading'),function(h){var ws=[].slice.call(h.querySelectorAll('.kw')),tops=[],al=getComputedStyle(h).textAlign;ws.forEach(function(w){var t=Math.round(w.offsetTop/8);if(tops.indexOf(t)<0)tops.push(t)});tops.sort(function(a,b){return a-b});ws.forEach(function(w){var L=tops.indexOf(Math.round(w.offsetTop/8));w.style.setProperty('--wd',al==='center'?(L%2?1:-1):(/right|end/.test(al)?-1:1)*(L+1)*.5)})})}
var TK={luxe:['blur','sweep','blur','rise'],still:['blur','rise'],editorial:['blur','sweep','type','rise'],cinematic:['blur','flip','split','rise'],kinetic:['pop','cascade','split','flip','sweep'],playful:['pop','cascade','sweep','split','flip'],chaotic:['cascade','pop','split','flip','sweep'],mechanical:['type','flip','rise']};
(function(){var pool=TK[pers]||TK.editorial,lastT='',all=[].slice.call(d.querySelectorAll('.sc'));all.forEach(function(sc,i){var h=sc.querySelector('.sc-heading');if(!h||i===0||sc.hasAttribute('data-k3'))return;var mw=sc.getAttribute('data-kmw')||'',k=/^(blur|pop|split|cascade|flip|type|sweep|rise)$/.test(mw)?mw:pool[i%pool.length];if(k!==mw&&k===lastT)k=pool[(pool.indexOf(k)+1)%pool.length];if(sc.hasAttribute('data-kf'))k='rise';lastT=k;
var ws=h.querySelectorAll('.kw');if(k==='split'&&ws.length<2)k='blur';if(k!=='rise')sc.setAttribute('data-kt',k);
if(k==='split')[].forEach.call(ws,function(w,j){w.firstChild.style.setProperty('--side',j<ws.length/2?-1:1)});
if(/^(cascade|flip|type)$/.test(k)){var n=0;[].forEach.call(h.querySelectorAll('.kw>i'),function(w){var t=w.textContent;w.textContent='';[].forEach.call(t,function(c){var sp=d.createElement('span');sp.className='kc';sp.textContent=c;sp.style.setProperty('--ci',n);sp.style.setProperty('--rr0',((n%2?1:-1)*(8+n*7%14)));w.appendChild(sp);n++})})}
if(ws.length>=4&&ch[0]>=1&&i<all.length-1&&!sc.hasAttribute('data-pin')&&!sc.hasAttribute('data-kf'))sc.setAttribute('data-kd','')});kdLines();K.text=[].map.call(d.querySelectorAll('.sc'),function(x){return x.getAttribute('data-kt')||(x.hasAttribute('data-k3')?'3d':'rise')}).join(' ')})();
/* ---- the clip in the name: the page's name drawn once (in the headline's own face) as the clip's mask */
var knock=null;(function(){var hv=firstSc&&firstSc.querySelector('.sc-herovid video,.ly-vid'),hh=firstSc&&firstSc.querySelector('.sc-heading'),pin=firstSc&&(firstSc.querySelector('.sc-pin')||firstSc);if(!hv||!hh||RM)return;var name=hh.textContent.trim(),src=hv.getAttribute('src');if(!name||name.length>16||!src)return;
var lay=d.createElement('div');lay.className='k-knock';lay.setAttribute('aria-hidden','true');var kv0=d.createElement('video');kv0.src=src;kv0.muted=true;kv0.playsInline=true;kv0.setAttribute('playsinline','');kv0.preload='auto';kv0.className='k-knock-v';lay.appendChild(kv0);var surf=firstSc.getAttribute('data-surf');if(surf)lay.style.setProperty('--kbg',surf);pin.insertBefore(lay,pin.firstChild);
firstSc.setAttribute('data-knock','');K.knock=true;var cs=getComputedStyle(hh),txt=cs.textTransform==='uppercase'?name.toUpperCase():name;
/* (a tall screen gets the name standing up the full height of it) */
var port=null;function draw(){port=innerWidth<innerHeight*.8;var cv=d.createElement('canvas'),Wd=port?900:1600,Hd=port?1600:900,run=port?Hd:Wd,across=port?Wd:Hd;cv.width=Wd;cv.height=Hd;var g=cv.getContext('2d');var font=function(px){return (cs.fontStyle||'')+' '+(cs.fontWeight||'800')+' '+px+'px '+cs.fontFamily};g.font=font(300);var tw=g.measureText(txt).width||1,px=Math.min(300*run*.9/tw,across*.62);g.font=font(px);g.fillStyle='#fff';g.textAlign='center';g.textBaseline='middle';g.translate(Wd/2,Hd/2);if(port)g.rotate(-Math.PI/2);g.fillText(txt,0,px*.04);
try{firstSc.style.setProperty('--kmask','url('+cv.toDataURL('image/png')+')')}catch(e){firstSc.removeAttribute('data-knock');K.knock=false}}
if(d.fonts&&d.fonts.ready)d.fonts.ready.then(draw);else draw();knock={sc:firstSc,top:0,h:1};W.addEventListener('resize',function(){if(port!==(innerWidth<innerHeight*.8))draw()});
/* (the layer's clip is now the opening clip the visitor plays; the opening's own stays still behind it) */
var c={v:kv0,sc:firstSc,want:0,at:0,busy:false,ready:false,top:0,h:1};kv0.addEventListener('loadedmetadata',function(){c.ready=kv0.duration>0;kick()});kv0.addEventListener('seeked',function(){c.busy=false});clips.forEach(function(x){if(x.sc===firstSc)try{x.v.pause()}catch(e){}});clips=clips.filter(function(x){return x.sc!==firstSc});clips.push(c);hero=c;K.scrub=clips.length;measureK();kick();})();
/* ---- letters: a 3D headline's words become letters, each with its own way to fly */
var ci=0;[].forEach.call(d.querySelectorAll('.sc[data-k3]:not([data-knock]) .kw>i'),function(w){var t=w.textContent;if(!t||t.length>24)return;w.textContent='';[].forEach.call(t,function(c){var sp=d.createElement('span');sp.className='kc';sp.textContent=c;sp.style.setProperty('--ci',ci);var r=function(k){var x=Math.sin((ci+1)*12.9898+k*78.233)*43758.5453;return x-Math.floor(x)};
sp.style.setProperty('--rx',((r(1)-.5)*70).toFixed(1));sp.style.setProperty('--ry',((r(2)-.7)*80).toFixed(1));sp.style.setProperty('--rr',((r(3)-.5)*220).toFixed(0));sp.style.setProperty('--rs',(r(4)*1.4-.2).toFixed(2));w.appendChild(sp);ci++})});K.letters=ci;
/* ---- on a mouse, a headline's letters scatter from the cursor and spring back */
var near=null;function scatter(e){var sc=e.target&&e.target.closest?e.target.closest('.sc[data-k3]'):null,h=sc&&sc.querySelector('.sc-heading');if(near&&near!==h)[].forEach.call(near.querySelectorAll('.kc'),function(c){c.style.translate='';c.style.rotate=''});near=h;if(!h||reduced())return;
[].forEach.call(h.querySelectorAll('.kc'),function(c){var r=c.getBoundingClientRect(),dx=r.left+r.width/2-e.clientX,dy=r.top+r.height/2-e.clientY,dd=Math.sqrt(dx*dx+dy*dy),R=Math.max(90,r.height*1.6);if(dd<R&&dd>0){var f=(1-dd/R),k=f*f*Math.min(60,r.height*.55);c.style.translate=(dx/dd*k).toFixed(1)+'px '+(dy/dd*k).toFixed(1)+'px';c.style.rotate=(dx/dd*f*24).toFixed(1)+'deg'}else{c.style.translate='';c.style.rotate=''}})}
if(fine&&!RM){var sq=null;W.addEventListener('pointermove',function(e){if(e.pointerType&&e.pointerType!=='mouse')return;if(!sq){sq=e;requestAnimationFrame(function(){scatter(sq);sq=null})}else sq=e},{passive:true})}
/* ---- a call to action decodes its words when the mouse arrives */
if(fine&&!RM)[].forEach.call(d.querySelectorAll('.cr-cta,.cr-links a'),function(a){var tn=null;for(var k=0;k<a.childNodes.length;k++)if(a.childNodes[k].nodeType===3&&a.childNodes[k].nodeValue.trim()){tn=a.childNodes[k];break}if(!tn)return;var fin=tn.nodeValue,G='ABCDEFGHJKLMNPRSTUVWXYZ#%&*',run=0;
a.addEventListener('pointerenter',function(){if(reduced()||run)return;var t0=performance.now();run=1;(function st(t){var k=Math.min(1,(t-t0)/420),n=Math.floor(k*fin.length),o='';for(var x=0;x<fin.length;x++)o+=x<n||fin[x]===' '?fin[x]:G[(Math.random()*G.length)|0];tn.nodeValue=o;if(k<1)requestAnimationFrame(st);else{tn.nodeValue=fin;run=0}})(t0)})});
/* ---- once a scene's words have risen, they leave their masks (a 3D word needs room to turn) */
if(W.MutationObserver)[].forEach.call(d.querySelectorAll('.sc[data-k3]'),function(sc){var tm=0;function chk(){clearTimeout(tm);if(sc.classList.contains('is-in'))tm=setTimeout(function(){sc.classList.add('k-done')},1500);else sc.classList.remove('k-done')}chk();new MutationObserver(chk).observe(sc,{attributes:true,attributeFilter:['class']})});
/* ---- THE BAND: after the opening, the page's name (and the opening's line) runs across the page */
var mq=null,mqX=0,mqW=1,mqOn=false,mqLast=0;
(function(){var first=d.querySelector('.sc'),hh=first&&first.querySelector('.sc-heading');if(!first||!hh||RM)return;var name=(d.title||'').split(/ [-|\u2013\u2014] /)[0].trim()||hh.textContent.trim();var line=(first.querySelector('.sc-kicker')||{}).textContent||'';
var words=[name,'\u2726'];void line;if(!name||name.length>40)return;var box=d.createElement('div');box.className='k-mq';box.setAttribute('aria-hidden','true');var t=d.createElement('div');t.className='k-mq-t';
for(var k=0;k<8;k++){var sp=d.createElement('span');sp.textContent=words[k%words.length];t.appendChild(sp)}box.appendChild(t);var ff=getComputedStyle(hh).fontFamily;if(ff)box.style.setProperty('--kmf',ff);
var surf=first.getAttribute('data-surf');if(surf)box.style.background=surf;var ink=first.style.getPropertyValue('--s-ink'),acc=first.style.getPropertyValue('--s-accent');if(ink)box.style.setProperty('--ink',ink);if(acc)box.style.setProperty('--accent',acc);var after=first.closest('.sc-pair')||first;after.parentNode.insertBefore(box,after.nextSibling);mq=t;
if(W.IntersectionObserver)new IntersectionObserver(function(es){mqOn=es[0].isIntersecting;if(mqOn)requestAnimationFrame(band)}).observe(box);else{mqOn=true;requestAnimationFrame(band)}
W.dispatchEvent(new Event('resize'))})();
function band(t){if(!mq||!mqOn)return;var dt=Math.min(64,t-(mqLast||t));mqLast=t;mqW=mq.scrollWidth/2||1;mqX-=(.045+Math.abs(kv)*2.4)*dt*(kv<-.02?-1:1);if(mqX<-mqW)mqX+=mqW;if(mqX>0)mqX-=mqW;if(!reduced())mq.style.transform='translate3d('+mqX.toFixed(1)+'px,0,0) rotate('+(kv*-2).toFixed(2)+'deg)';requestAnimationFrame(band)}
/* ---- THE CLIP'S OWN FRAMES IN THE BAND: when the page has a premium clip, moments of it (sampled here from the clip itself,
   a few small stills) run through the band between the name -- the footage carries on down the page */
(function(){if(!mq||RM||!hero||!hero.v)return;var src=hero.v.getAttribute('src');if(!src)return;var v=d.createElement('video');v.muted=true;v.playsInline=true;v.preload='auto';v.src=src;var shots=[],times=[.12,.3,.48,.66,.84],k=0;
function grab(){try{var cv=d.createElement('canvas');cv.width=320;cv.height=180;var g=cv.getContext('2d'),vw=v.videoWidth||16,vh=v.videoHeight||9,sc=Math.max(320/vw,180/vh);g.drawImage(v,(320-vw*sc)/2,(180-vh*sc)/2,vw*sc,vh*sc);shots.push(cv.toDataURL('image/jpeg',.72))}catch(e){shots=null;return}next()}
function next(){if(!shots)return;if(k>=times.length){place();return}v.currentTime=Math.max(0,(v.duration||1)*times[k++])}
function place(){if(!shots||!shots.length)return;var spans=[].slice.call(mq.children);spans.forEach(function(sp,i){if(sp.textContent==='\u2726'){var im=d.createElement('img');im.className='k-mq-f';im.alt='';im.src=shots[i%shots.length];sp.textContent='';sp.appendChild(im)}});K.frames=shots.length}
v.addEventListener('seeked',grab);v.addEventListener('loadeddata',function(){next()},{once:true})})();
/* ---- THE TRAIL: one scene (a breath of the story, else the middle one) leaves the page's pictures behind the mouse */
(function(){if(!fine||RM)return;var all=[].slice.call(d.querySelectorAll('.sc')),srcs=[].slice.call(d.querySelectorAll('.ly-img')).map(function(i){return i.currentSrc||i.src}).filter(function(u,k,a){return u&&a.indexOf(u)===k}).slice(0,10);if(srcs.length<3||all.length<3)return;
var sc=all.filter(function(x,k){return k>0&&k<all.length-1&&x.getAttribute('data-arc')==='breath'})[0]||all[Math.floor(all.length/2)];sc.setAttribute('data-ktrail','');K.trail=true;var lx=-999,ly=-999,n=0,alive=0;
sc.addEventListener('pointermove',function(e){if(reduced()||e.pointerType!=='mouse'||e.target.closest('a,button'))return;var dx=e.clientX-lx,dy=e.clientY-ly;if(dx*dx+dy*dy<90*90||alive>9)return;lx=e.clientX;ly=e.clientY;
var im=d.createElement('img');im.className='k-trail';im.alt='';im.src=srcs[n++%srcs.length];im.style.left=(e.clientX-70)+'px';im.style.top=(e.clientY-90)+'px';im.style.rotate=((Math.random()*16)-8).toFixed(1)+'deg';d.body.appendChild(im);alive++;setTimeout(function(){im.remove();alive--},1200)})})();
/* ---- PIXELS: as a 'pixel' scene arrives, its photographs draw from big blocks to sharp (cover-fitted like the picture) */
function pixelate(img){var art=img.closest('.ly-art');if(!art||!img.complete||!img.naturalWidth)return;var r=art.getBoundingClientRect();if(r.width<40||r.height<40)return;var cv=d.createElement('canvas');cv.className='k-pix';cv.setAttribute('aria-hidden','true');var Wd=Math.round(r.width),Hd=Math.round(r.height);cv.width=Wd;cv.height=Hd;var g=cv.getContext('2d');if(!g)return;g.imageSmoothingEnabled=false;
var iw=img.naturalWidth,ih=img.naturalHeight,k=Math.max(Wd/iw,Hd/ih),dw=iw*k,dh=ih*k,op=(getComputedStyle(img).objectPosition||'50% 50%').split(' '),ox=parseFloat(op[0])/100,oy=parseFloat(op[1]||op[0])/100;if(isNaN(ox))ox=.5;if(isNaN(oy))oy=.5;var left=(Wd-dw)*ox,top=(Hd-dh)*oy,off=d.createElement('canvas'),og=off.getContext('2d');
art.appendChild(cv);var steps=[56,40,28,18,11,6,3],k2=0;img.style.visibility='hidden';(function step(){if(k2>=steps.length||reduced()){cv.remove();img.style.visibility='';return}var b=steps[k2++],w=Math.max(1,Math.round(Wd/b)),h=Math.max(1,Math.round(Hd/b));off.width=w;off.height=h;og.imageSmoothingEnabled=true;og.clearRect(0,0,w,h);try{og.drawImage(img,left/b,top/b,dw/b,dh/b)}catch(e){cv.remove();img.style.visibility='';return}g.clearRect(0,0,Wd,Hd);g.drawImage(off,0,0,w,h,0,0,Wd,Hd);setTimeout(step,85)})()}
if(!RM&&W.MutationObserver)[].forEach.call(d.querySelectorAll('.sc[data-kp="pixel"]'),function(sc){var done=false;function go(){if(done||!sc.classList.contains('is-in')||reduced())return;done=true;[].forEach.call(sc.querySelectorAll('.ly:is([data-role="focal"],[data-role="support"],[data-role="subject"]) .ly-img'),function(img){if(getComputedStyle(img).objectFit==='cover')pixelate(img)})}go();new MutationObserver(go).observe(sc,{attributes:true,attributeFilter:['class']})});
/* ---- on a mouse, the picture under it tilts toward it like a card in the hand */
var tiltEl=null;function tilt(e){var sc=e.target&&e.target.closest?e.target.closest('.sc'):null,hit=null;if(sc&&!reduced())[].some.call(sc.querySelectorAll('.ly:is([data-role="focal"],[data-role="support"]) .ly-in'),function(el){var r=el.getBoundingClientRect();if(e.clientX>=r.left&&e.clientX<=r.right&&e.clientY>=r.top&&e.clientY<=r.bottom&&r.width>60){hit={el:el,r:r};return true}return false});
if(tiltEl&&(!hit||hit.el!==tiltEl)){tiltEl.style.rotate='';tiltEl=null}if(!hit)return;var nx=(e.clientX-hit.r.left)/hit.r.width*2-1,ny=(e.clientY-hit.r.top)/hit.r.height*2-1,mag=Math.min(1,Math.sqrt(nx*nx+ny*ny));tiltEl=hit.el;hit.el.style.rotate=(-ny).toFixed(3)+' '+nx.toFixed(3)+' 0 '+(mag*7*(ch[0]||1)).toFixed(2)+'deg'}
if(fine&&!RM){var tq=null;W.addEventListener('pointermove',function(e){if(e.pointerType&&e.pointerType!=='mouse')return;if(!tq){tq=e;requestAnimationFrame(function(){tilt(tq);tq=null})}else tq=e},{passive:true})}
/* ---- THE INTRO: once a session, the page's name rises with a count to 100, then the page is uncovered and its opening plays */
var intro=null;(function(){var first=d.querySelector('.sc'),hh=first&&first.querySelector('.sc-heading');if(RM||!first||!hh||location.hash)return;try{if(W.sessionStorage.getItem('k-intro'))return;W.sessionStorage.setItem('k-intro','1')}catch(e){return}
var name=(d.title||'').split(/ [-|\u2013\u2014] /)[0].trim()||hh.textContent.trim();if(!name||name.length>24)return;intro=d.createElement('div');intro.className='k-intro';intro.setAttribute('aria-hidden','true');var surf=first.getAttribute('data-surf'),ink=first.style.getPropertyValue('--s-ink');if(surf)intro.style.setProperty('--kbg',surf);if(ink)intro.style.setProperty('--kink',ink);var ff=getComputedStyle(hh).fontFamily;if(ff)intro.style.setProperty('--kmf',ff);
var nm=d.createElement('div');nm.className='k-intro-n';[].forEach.call(name,function(c,i){var sp=d.createElement('span');sp.textContent=c===' '?'\u00a0':c;sp.style.setProperty('--i',i);nm.appendChild(sp)});var cn=d.createElement('div');cn.className='k-intro-c';cn.textContent='000';intro.appendChild(nm);intro.appendChild(cn);d.body.appendChild(intro);
var t0=performance.now(),dur=1250,out=false;function finish(){if(out)return;out=true;cn.textContent='100';intro.classList.add('is-out');setTimeout(function(){if(intro){intro.remove();intro=null}},1000);goNow()}
(function count(t){if(out)return;var k=Math.min(1,(t-t0)/dur),v=Math.round((1-Math.pow(1-k,3))*100);cn.textContent=(v<10?'00':v<100?'0':'')+v;if(k<1)requestAnimationFrame(count);else finish()})(t0);
/* (never left covering the page: frames pause in a hidden tab, a timer still runs) */setTimeout(finish,2600)})();
/* ---- on: the next frame, so a scene that is already in still plays its entrance */
/* (two steps: every word takes its start first, then the scenes already in play their entrance like the rest) */
H.classList.add('k-on');void H.offsetWidth;function goNow(){requestAnimationFrame(function(){requestAnimationFrame(function(){H.classList.add('k-go')})})}if(!intro)goNow();
})();
`;

module.exports = { on, css, js, MOVES };
