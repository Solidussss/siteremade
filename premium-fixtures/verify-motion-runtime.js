'use strict';
// Loads the REAL exported-site runtime (styles.css + the exact SITE_RUNTIME_JS
// string from lib/export-compiler.js, extracted at run time -- never a
// reimplementation) into a real Electron page and drives real scroll events,
// so Motion Engine V1's scroll-triggered reveal, header-scroll and parallax
// are verified as ACTUAL running behaviour, not just source-text presence or
// a final-state screenshot. Part 31: "actually watch the motion... do not
// only inspect screenshots."
//   node_modules/.bin/electron.cmd premium-fixtures/verify-motion-runtime.js
const { app, BrowserWindow } = require('electron');
const fs = require('fs'), path = require('path');

const ROOT = path.join(__dirname, '..');
const srcJs = fs.readFileSync(path.join(ROOT, 'lib', 'export-compiler.js'), 'utf8');
const m = srcJs.match(/const SITE_RUNTIME_JS = `([\s\S]*?)`;/);
if (!m) { console.error('SITE_RUNTIME_JS not found'); process.exit(1); }
const runtimeJs = m[1];
const css = fs.readFileSync(path.join(ROOT, 'styles.css'), 'utf8');

const html = `<!doctype html><html><head><meta charset="utf-8">
<style>${css}
body{margin:0}
.spacer{height:1400px}
</style></head>
<body>
<div class="builder-site" id="builderSite" data-nav="minimal-until-scroll" data-motion="expressive">
  <div class="site-nav"><strong>Test Co</strong></div>
  <div class="site-hero hero-product-stage" data-hero-family="PRODUCT_STAGE" data-depth="DRAMATIC" data-hero-motion="STAGE_REVEAL" data-motion-intensity="EXPRESSIVE" data-depth-motion="PARALLAX">
    <p class="hero-kicker-center">KICKER</p>
    <div class="hero-stage-frame"><span class="hero-stage-ring hero-stage-ring-a"></span><span class="hero-stage-ring hero-stage-ring-b"></span><div class="hero-stage-object"><img class="site-visual-img" src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBTAA7"></div></div>
    <h3 class="hero-stage-headline">Headline</h3><p class="hero-stage-sub">Sub</p>
  </div>
  <div class="spacer"></div>
  <div class="site-section site-section-feature" data-comp-tone="base" data-comp-weight="medium" data-reveal="RISE">
    <div class="feature-visual"><img class="site-visual-img" src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBTAA7"></div>
    <div class="feature-copy"><h2>Feature</h2></div>
  </div>
  <div class="site-section" data-comp-tone="alt" data-comp-weight="quiet" data-reveal="RISE" data-depth-motion="PARALLAX"></div>
  <div class="spacer"></div>
</body></html>`;

app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  const w = new BrowserWindow({ width: 1000, height: 900, show: true, webPreferences: { contextIsolation: false, backgroundThrottling: false } });
  await w.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
  const ev = code => w.webContents.executeJavaScript(code, true);
  await ev(runtimeJs);
  await new Promise(r => setTimeout(r, 300));

  const results = {};
  results.docScrollHeight = await ev(`document.documentElement.scrollHeight`);
  results.winInnerHeight = await ev(`window.innerHeight`);
  // 1. The below-the-fold feature section must start UNREVEALED (real scroll-gating, not everything shown at load).
  results.featureInitialOpacity = await ev(`getComputedStyle(document.querySelectorAll('.site-section-feature')[0]).opacity`);
  results.featureHasSrReveal = await ev(`document.querySelectorAll('.site-section-feature')[0].classList.contains('sr-reveal')`);
  // 2. The hero, in view at load, should reveal automatically (it's the very first thing a visitor sees).
  await new Promise(r => setTimeout(r, 400));
  results.heroRevealedAtLoad = await ev(`document.querySelector('.site-hero').classList.contains('sr-revealed')`);
  // 3. Scroll the feature section into view (an explicit instant jump -- also exercises the observer's own
  // scrollCatchUp fallback for exactly this case) -- it must become revealed.
  results.featureOffsetTopBefore = await ev(`document.querySelectorAll('.site-section-feature')[0].getBoundingClientRect().top`);
  await ev(`window.scrollTo({top: document.querySelectorAll('.site-section-feature')[0].offsetTop - 200, behavior: 'instant'})`);
  await new Promise(r => setTimeout(r, 250));
  results.scrollYAfterJump = await ev(`window.scrollY`);
  results.featureOffsetTopAfter = await ev(`document.querySelectorAll('.site-section-feature')[0].getBoundingClientRect().top`);
  await new Promise(r => setTimeout(r, 600));
  results.featureRevealedAfterScroll = await ev(`document.querySelectorAll('.site-section-feature')[0].classList.contains('sr-revealed')`);
  results.featureOpacityAfterScroll = await ev(`getComputedStyle(document.querySelectorAll('.site-section-feature')[0]).opacity`);
  // 4. Header scroll behaviour: data-nav-scrolled should flip once scrolled.
  results.navScrolledAttr = await ev(`document.querySelector('.site-nav').getAttribute('data-nav-scrolled')`);
  // 5. Parallax: --parallax-y should be a real, non-zero value for the in-view depth-motion element.
  await ev(`window.scrollTo({top: document.querySelector('[data-depth-motion="PARALLAX"]:not(.site-hero)').offsetTop - 300, behavior: 'instant'})`);
  await new Promise(r => setTimeout(r, 500));
  results.parallaxY = await ev(`getComputedStyle(document.querySelector('[data-depth-motion="PARALLAX"]:not(.site-hero)')).getPropertyValue('--parallax-y')`);
  // 6. Scroll back to top; nav should un-solidify.
  await ev(`window.scrollTo({top: 0, behavior: 'instant'})`);
  await new Promise(r => setTimeout(r, 300));
  results.navScrolledBackAtTop = await ev(`document.querySelector('.site-nav').getAttribute('data-nav-scrolled')`);
  results.debugClassName = await ev(`document.querySelectorAll('.site-section-feature')[0].className`);
  results.debugMatchMediaReduced = await ev(`window.matchMedia('(prefers-reduced-motion: reduce)').matches`);
  results.debugMotionDisabledVar = await ev(`document.getElementById('builderSite').getAttribute('data-motion')`);
  results.debugTransition = await ev(`getComputedStyle(document.querySelectorAll('.site-section-feature')[0]).transition`);


  console.log(JSON.stringify(results, null, 2));
  fs.writeFileSync(path.join(__dirname, 'motion-runtime-result.json'), JSON.stringify(results, null, 2));
  await w.webContents.capturePage().then(img => fs.writeFileSync(path.join(__dirname, 'motion-runtime-shot.png'), img.toPNG()));
  app.quit();
});
