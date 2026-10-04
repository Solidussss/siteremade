/* CREATIVE MODE — the studio. Loaded on demand by creative-entry.js (never by the Business
   builder). Brief -> research (server: /api/creative/research, free sources only) -> pictures
   read in this browser (canvas: size, background, where the subject is; a real background-
   removal step when the background is plain) -> scene direction -> validation -> the page,
   shown in an iframe exactly as it exports. Text edits and picture changes update the page
   without rebuilding it from scratch; the project saves through the same /api/projects
   endpoints as a Business site, as a direction with mode:'creative'. */
(function () {
  'use strict';
  var C = window.SiteRemadeCreative; if (!C) throw new Error('creative-core.js missing');
  var POINTER = 'siteremade:creativeProject';
  var JOB = 'siteremade:creativeJob'; // the page job still open for a brief (resume after a reload continues it, free)
  var S = null; // studio state
  var root = null, frame = null, els = {};
  var blobUrls = {};

  function fresh() {
    return { brief: '', suppliedText: '', memoriesText: '', choice: '', understanding: null, research: null, assets: [], plan: null,
      // the generation mode the owner chose (creative | hero | showcase): Creative unless they choose a video mode
      mode: 'creative', modePrices: null,
      // what a premium cinematic clip starts from: the owner's upload ('image') or the page's own 3D model ('model3d')
      premiumSource: 'image',
      projectId: null, revision: null, status: null, jobId: null, name: '', dirty: false, busy: false, device: narrowScreen() ? 'phone' : 'desktop', previewMotion: 'full', fixture: '', planMeta: null, history: [], previous: null, understandMeta: null, mainAsset: null, abstractChosen: false, refines: 0, directing: false, picked: null, models: [], spatialOn: false,
      cost: { researchRequests: 0, researchBytes: 0, paidCalls: 0, credits: 0, aiCalls: 0, aiUsdEstimated: 0 } };
  }
  function h(tag, attrs, html) { var e = document.createElement(tag); if (attrs) Object.keys(attrs).forEach(function (k) { if (k === 'class') e.className = attrs[k]; else if (k === 'text') e.textContent = attrs[k]; else e.setAttribute(k, attrs[k]); }); if (html != null) e.innerHTML = html; return e; }
  function esc(s) { return C.render.esc(s); }
  function api(path, opts) {
    if (typeof apiFetch === 'function') return apiFetch(path, opts); // the Business page's own helper (same session cookie)
    return fetch(path, { method: (opts && opts.method) || 'GET', headers: opts && opts.body ? { 'Content-Type': 'application/json' } : undefined, body: opts && opts.body ? JSON.stringify(opts.body) : undefined, credentials: 'same-origin' })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (d) { return { ok: r.ok, status: r.status, data: d }; }); });
  }
  // the Business page's own sign-in gate: the studio steps back beneath it while it is open, then returns
  function needSignIn(msg) {
    if (typeof showAuthGate !== 'function') { fail('Sign in first.'); return; }
    // a Business brief waiting for sign-in must not start generating because someone signed in from Creative
    var pending = null;
    try { pending = (typeof pendingGenerationText !== 'undefined' && pendingGenerationText) || localStorage.getItem('siteremade:pendingGenerationText'); } catch (e) { pending = null; }
    if (pending && typeof setPendingGenerationText === 'function') setPendingGenerationText(null);
    root.classList.add('cs-behind'); showAuthGate(msg);
    var mo = new MutationObserver(function () {
      if (document.body.classList.contains('generation-gate-open')) return;
      mo.disconnect(); root.classList.remove('cs-behind');
      if (pending && typeof setPendingGenerationText === 'function') setPendingGenerationText(pending);
      if (signedIn()) setSaveState('Signed in. You can create and save now.');
    });
    mo.observe(document.body, { attributes: true, attributeFilter: ['class'] });
  }
  function signedIn() { try { return typeof currentAccount !== 'undefined' && !!currentAccount; } catch (e) { return false; } }

  // ---------- layout ----------
  function build() {
    root = h('div', { id: 'creativeStudio', class: 'cs', role: 'dialog', 'aria-label': 'Creative mode' });
    root.innerHTML = [
      '<header class="cs-top"><div class="cs-title"><strong>Creative mode</strong><span class="cs-badge">preview</span></div>',
      '<div class="cs-device" role="group" aria-label="Preview size"><button type="button" data-device="desktop" aria-pressed="true">Desktop</button><button type="button" data-device="phone" aria-pressed="false">Phone</button></div>',
      '<div class="cs-actions"><span class="cs-save-state" id="csSaveState" aria-live="polite"></span><button type="button" class="cs-btn" id="csSave" disabled>Save to my account</button><button type="button" class="cs-btn cs-primary" id="csBuy" hidden>Buy this website</button><button type="button" class="cs-btn cs-ghost" id="csClose">Back to Business</button></div></header>',
      '<div class="cs-fixture" id="csFixture" hidden></div>',
      '<div class="cs-body"><aside class="cs-panel" id="csPanel">',
      '<section class="cs-step" id="csBriefStep"><h2>What is the page about?</h2>',
      '<p class="cs-hint">Anything: a character, a game, an everyday object, a food, your pet, a person you love. Say how it should feel.</p>',
      '<textarea id="csBrief" rows="3" maxlength="6000" placeholder="A website about toilet paper — make it grand and a bit absurd"></textarea>',
      '<div class="cs-chips" id="csChips"></div>',
      '<details class="cs-personal" id="csPersonal"><summary>Your own details and photos <small>(for a personal page)</small></summary>',
      '<label for="csSupplied">True details, one per line</label><textarea id="csSupplied" rows="4" maxlength="2000" placeholder="Bubbles lived with us for nine years.\nHe raced to the glass whenever someone came home."></textarea>',
      '<label for="csMemories">Favourite memories, one per line (optional)</label><textarea id="csMemories" rows="3" maxlength="2000"></textarea>',
      '<p class="cs-hint">A personal page only ever shows your own photos of them and only says what you write here.</p></details>',
      '<div class="cs-uploads"><input type="file" id="csUpload" accept="image/png,image/jpeg,image/webp" multiple hidden><button type="button" class="cs-btn cs-ghost" id="csUploadBtn">+ Add your own pictures</button><input type="file" id="csLogo" accept="image/png,image/jpeg,image/webp" hidden><button type="button" class="cs-btn cs-ghost" id="csLogoBtn" title="Optional: shown top-left in the page header, never as a scene picture">+ Add your logo</button><input type="file" id="csModel" accept=".glb,model/gltf-binary" hidden><button type="button" class="cs-btn cs-ghost" id="csModelBtn" title="Optional: a 3D model of your main subject, used only on pages with a 3D layer">+ Add a 3D model (.glb)</button><div class="cs-thumbs" id="csThumbs"></div></div>',
      '<div class="cs-pv" id="csPv"><p class="cs-pv-head">Generation mode</p><div class="cs-modes" id="csModes" role="radiogroup" aria-label="Generation mode">' + MODES.map(function (m) { return '<button type="button" role="radio" class="cs-mode" data-mode="' + m.id + '" aria-checked="' + (m.id === 'creative' ? 'true' : 'false') + '"><strong>' + m.name + '</strong><span>' + m.line + '</span><em data-mode-credits="' + m.id + '"></em></button>'; }).join('') + '</div>',
      '<p class="cs-hint">Higgsfield video modes require eligible uploaded images. Pictures found on the web are used on the page, never for video.</p>',
      '<p class="cs-pv-state" id="csPvState" aria-live="polite"></p>',
      '<div class="cs-pv-src" id="csPvSrc" hidden><p class="cs-pv-head">Source</p><div class="cs-src" role="radiogroup" aria-label="Cinematic source"><button type="button" role="radio" data-src="image" aria-checked="true">Image</button><button type="button" role="radio" data-src="model3d" aria-checked="false">3D Model</button></div><p class="cs-hint" id="csPvSrcNote"></p></div></div>',
      '<div class="cs-sum" id="csSum" aria-live="polite"></div>',
      '<button type="button" class="cs-btn cs-primary" id="csCreate">Create the page</button><button type="button" class="cs-btn cs-ghost" id="csBackToPage" hidden>Back to the page</button>',
      '<p class="cs-cost" id="csCostNote">Another direction for the same page is priced before it runs. Editing by hand is free. Downloading the finished website is a separate one-time purchase, the same as a Business website.</p><p class="cs-cost" id="csBalance" aria-live="polite"></p>',
      '</section>',
      '<section class="cs-step" id="csAskStep" hidden><h2>A few quick choices</h2><p class="cs-hint">Point the director your way. Leave any open and it chooses.</p><div id="csAskList"></div>',
      '<button type="button" class="cs-btn cs-primary" id="csAskGo">Make it this way</button><button type="button" class="cs-btn cs-ghost" id="csAskSkip">Skip, let the director choose</button><button type="button" class="cs-btn cs-ghost" id="csAskBack">Back to the description</button></section>',
      '<section class="cs-step" id="csProgress" hidden><h2>Making it</h2><ol class="cs-progress" id="csProgressList"></ol><div id="csChoices"></div><p class="cs-error" id="csError" role="alert" hidden></p></section>',
      '<section class="cs-step" id="csEditor" hidden>',
      '<div class="cs-asks" id="csAsks" hidden></div>',
      '<nav class="cs-tabs" role="tablist"><button type="button" role="tab" data-tab="words" aria-selected="true">Words</button><button type="button" role="tab" data-tab="pictures" aria-selected="false">Pictures</button><button type="button" role="tab" data-tab="motion" aria-selected="false">Motion</button><button type="button" role="tab" data-tab="sources" aria-selected="false">Sources</button></nav>',
      '<div class="cs-tab" data-panel="words"></div><div class="cs-tab" data-panel="pictures" hidden></div><div class="cs-tab" data-panel="motion" hidden></div><div class="cs-tab" data-panel="sources" hidden></div>',
      '<button type="button" class="cs-btn cs-ghost cs-new" id="csNew">Start a different page</button>',
      '</section></aside>',
      '<div class="cs-stage" id="csStage"><div class="cs-empty" id="csEmpty"><p>Your page appears here.</p><p class="cs-hint">Examples: toilet paper, Sherlock Holmes, a Big Mac, your goldfish.</p></div><div class="cs-viewport" id="csViewport" hidden><iframe id="csFrame" title="Creative page preview"></iframe></div></div>',
      '</div>',
    ].join('');
    document.body.appendChild(root);
    ['csBrief', 'csSupplied', 'csMemories', 'csUpload', 'csUploadBtn', 'csThumbs', 'csCreate', 'csProgress', 'csProgressList', 'csChoices', 'csError', 'csEditor', 'csBriefStep', 'csStage', 'csViewport', 'csEmpty', 'csFrame', 'csSave', 'csSaveState', 'csClose', 'csNew', 'csAsks', 'csChips', 'csFixture', 'csPersonal', 'csBuy', 'csBalance', 'csModes', 'csPvState', 'csSum', 'csAskStep', 'csAskList', 'csAskGo', 'csAskSkip', 'csAskBack'].forEach(function (id) { els[id] = document.getElementById(id); });
    frame = els.csFrame;
    ['A website about toilet paper — make it grand and a bit absurd', 'Sherlock Holmes fan site, cinematic and moody', 'A tribute to the Big Mac', 'A memorial page for my goldfish Bubbles'].forEach(function (t) {
      var b = h('button', { type: 'button', class: 'cs-chip', text: t.replace(/ —.*| fan site.*/, '') }); b.addEventListener('click', function () { els.csBrief.value = t; if (/my goldfish/.test(t)) els.csPersonal.open = true; els.csBrief.focus(); }); els.csChips.appendChild(b);
    });
    els.csClose.addEventListener('click', close);
    els.csCreate.addEventListener('click', function () { create(); });
    // the generation mode: a radio group (click, or the arrow keys) -- the cost summary follows it at once
    [].forEach.call(els.csModes.querySelectorAll('[data-mode]'), function (b) {
      b.addEventListener('click', function () { setMode(b.getAttribute('data-mode')); });
      b.addEventListener('keydown', function (e) { var k = e.key; if (k !== 'ArrowDown' && k !== 'ArrowRight' && k !== 'ArrowUp' && k !== 'ArrowLeft') return; e.preventDefault(); var i = MODES.indexOf(modeOf(b.getAttribute('data-mode'))); var n = MODES[(i + (k === 'ArrowDown' || k === 'ArrowRight' ? 1 : MODES.length - 1)) % MODES.length]; setMode(n.id); els.csModes.querySelector('[data-mode="' + n.id + '"]').focus(); });
    });
    els.csBrief.addEventListener('input', function () { priceSoon(700); });
    [].forEach.call(root.querySelectorAll('#csPvSrc [data-src]'), function (b) { b.addEventListener('click', function () { if (!b.disabled) setSource(b.getAttribute('data-src')); }); });
    var back = document.getElementById('csBackToPage'); if (back) back.addEventListener('click', backToPage);
    els.csUploadBtn.addEventListener('click', function () { els.csUpload.click(); });
    var mb = document.getElementById('csModelBtn'), mi = document.getElementById('csModel');
    if (mb && mi) { mb.addEventListener('click', function () { mi.click(); }); mi.addEventListener('change', function () { addModel(mi.files && mi.files[0]); mi.value = ''; }); }
    els.csUpload.addEventListener('change', function () { addUploads([].slice.call(els.csUpload.files || [])); els.csUpload.value = ''; });
    // the logo: one picture, kept as it is (no cut-out, never regenerated), shown in the page header
    var lb = document.getElementById('csLogoBtn'), li = document.getElementById('csLogo');
    if (lb && li) { lb.addEventListener('click', function () { li.click(); }); li.addEventListener('change', function () { var f = li.files && li.files[0]; li.value = ''; if (f) addUploads([f], 'logo'); }); }
    els.csSave.addEventListener('click', save);
    els.csBuy.addEventListener('click', buyOrDownload);
    els.csNew.addEventListener('click', function () { if (S.dirty && !window.confirm('Start a different page? Unsaved changes to this one will be lost.')) return; S = fresh(); resetUI(); });
    [].forEach.call(root.querySelectorAll('[data-device]'), function (b) { b.addEventListener('click', function () { S.device = b.getAttribute('data-device'); [].forEach.call(root.querySelectorAll('[data-device]'), function (x) { x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); }); fit(); }); });
    [].forEach.call(root.querySelectorAll('[data-tab]'), function (b) { b.addEventListener('click', function () { showTab(b.getAttribute('data-tab')); }); });
    window.addEventListener('resize', fit);
    var jump = document.createElement('button'); jump.type = 'button'; jump.className = 'cs-jump'; jump.id = 'csJump'; jump.hidden = true; jump.textContent = 'See the page \u2191';
    jump.addEventListener('click', function () { els.csStage.scrollIntoView({ behavior: 'smooth', block: 'start' }); }); root.appendChild(jump);
    if (window.IntersectionObserver) new IntersectionObserver(function (es) { jump.hidden = es[0].isIntersecting || els.csViewport.hidden; }, { root: root.querySelector('.cs-body'), threshold: 0.15 }).observe(els.csStage);
    root.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !S.busy) close(); });
  }
  function showTab(name) {
    [].forEach.call(root.querySelectorAll('[data-tab]'), function (b) { b.setAttribute('aria-selected', b.getAttribute('data-tab') === name ? 'true' : 'false'); });
    [].forEach.call(root.querySelectorAll('[data-panel]'), function (p) { p.hidden = p.getAttribute('data-panel') !== name; });
  }
  function resetUI() {
    els.csBrief.value = S.brief; els.csSupplied.value = S.suppliedText; els.csMemories.value = S.memoriesText;
    els.csBriefStep.hidden = false; els.csProgress.hidden = true; els.csEditor.hidden = true; els.csViewport.hidden = true; els.csEmpty.hidden = false;
    els.csChoices.innerHTML = ''; els.csError.hidden = true; var pvl = document.getElementById('csPvLive'); if (pvl) pvl.remove(); var td0 = document.getElementById('cs3d'); if (td0) td0.remove(); renderThumbs(); setSaveState(''); els.csSave.disabled = true; showFixture(); showBuy();
    fit();
  }
  // ---------- credits and the website purchase ----------
  // the balance and prices come from the server (the same numbers the builder and the app show)
  var price = null;
  function showBalance(remaining) {
    if (!els.csBalance) return;
    if (typeof remaining === 'number') S.creditsRemaining = remaining;
    var n = S.creditsRemaining; els.csBalance.textContent = typeof n === 'number' ? 'Your balance: ' + n + ' credit' + (n === 1 ? '' : 's') + (S.planLabel ? ' (' + S.planLabel + ')' : '') + '.' : '';
  }
  function refreshBalance() {
    if (!signedIn()) { if (els.csBalance) els.csBalance.textContent = ''; return; }
    api('/api/credits').then(function (r) { if (r.ok && r.data && r.data.credits) { S.planLabel = r.data.credits.planLabel; showBalance(r.data.credits.remaining); } });
    if (!price) api('/api/pricing').then(function (r) { if (r.ok && r.data && r.data.ok) { var p = (r.data.websitePrices && r.data.websitePrices.creative) || { display: r.data.websitePriceDisplay, currency: r.data.websitePriceCurrency }; price = p.display + ' ' + String(p.currency || '').toUpperCase(); showBuy(); } });
  }
  function showBuy() {
    if (!els.csBuy) return;
    els.csBuy.hidden = !S.plan;
    els.csBuy.textContent = S.status === 'purchased' ? 'Download website' : 'Buy this website' + (price ? ' — ' + price : '');
    els.csBuy.title = S.status === 'purchased' ? 'Download the files of the website you bought' : 'One-time purchase: you own this website permanently and can download and host it anywhere. No subscription, and owning it never needs credits.';
  }
  function rememberJob(directed) { try { if (S.jobId) localStorage.setItem(JOB, JSON.stringify({ jobId: S.jobId, brief: S.brief, directed: !!directed })); } catch (e) { /* optional */ } }
  function openJobFor(brief) { var j = null; try { j = JSON.parse(localStorage.getItem(JOB) || 'null'); } catch (e) { j = null; } return j && !j.directed && j.brief === brief ? j.jobId : null; }
  function creditsFrom(d) { if (d && typeof d.creditsRemaining === 'number') showBalance(d.creditsRemaining); }
  function buyOrDownload() {
    if (!S.plan || S.busy) return; if (!signedIn()) { needSignIn('Sign in to buy this website.'); return; }
    els.csBuy.disabled = true;
    var done = function () { els.csBuy.disabled = false; };
    if (S.status === 'purchased') {
      setSaveState('Preparing your download…');
      return api('/api/projects/' + encodeURIComponent(S.projectId) + '/export', { method: 'POST' }).then(function (r) {
        done();
        if (r.ok && r.data.ok && r.data.deployment) { setSaveState('Download ready'); window.location.href = '/api/deployments/' + encodeURIComponent(r.data.deployment.id) + '/download'; }
        else setSaveState((r.data && r.data.message) || 'The download could not be prepared. Try again.');
      });
    }
    // what is bought is the page as saved at checkout: save first
    var saved = !S.projectId || S.dirty ? save() : Promise.resolve({ ok: true, data: { ok: true } });
    return Promise.resolve(saved).then(function (s) {
      if (!s || !S.projectId || S.dirty) { done(); return; }
      setSaveState('Opening checkout…');
      return api('/api/checkout', { method: 'POST', body: { projectId: S.projectId, businessName: S.name || pageTitle(), industry: 'Creative page', sectionsSummary: 'Creative page' } }).then(function (r) {
        done();
        if (r.ok && r.data.ok && r.data.testerPurchase && r.data.fulfilled) {
          S.status = 'purchased';
          showBuy();
          setSaveState('Tester purchase complete — your real purchased handoff is ready.');
          return;
        }
        if (r.ok && r.data.ok && r.data.url) { window.location.href = r.data.url; return; }
        if (r.status === 409 && /already been purchased/.test((r.data && r.data.message) || '')) { S.status = 'purchased'; showBuy(); }
        setSaveState((r.data && r.data.message) || 'Checkout could not start. Try again shortly.');
      });
    });
  }
  function showFixture() { els.csFixture.hidden = !S.fixture; els.csFixture.textContent = S.fixture ? 'TEST FIXTURE — ' + S.fixture : ''; }

  // ---------- open / close ----------
  var onClose = null;
  function open(opts) {
    if (!root) { build(); S = fresh(); resetUI(); }
    onClose = opts && opts.onClose;
    root.hidden = false; document.body.classList.add('cs-open'); refreshBalance(); renderPv(); priceSoon(0);
    if (opts && opts.project) loadProject(opts.project);
    else if (!S.plan) offerLast();
    setTimeout(function () { (S.plan ? els.csSave : els.csBrief).focus(); }, 30);
  }
  function close() {
    if (!root) return; root.hidden = true; document.body.classList.remove('cs-open');
    if (onClose) onClose();
  }
  function offerLast() {
    var ptr = null; try { ptr = JSON.parse(localStorage.getItem(POINTER) || 'null'); } catch (e) { ptr = null; }
    if (!ptr || !ptr.id || !signedIn() || document.getElementById('csResume')) return;
    var b = h('button', { type: 'button', class: 'cs-btn cs-ghost', id: 'csResume', text: 'Continue “' + (ptr.name || 'your last Creative page') + '”' });
    b.addEventListener('click', function () { b.disabled = true; api('/api/projects/' + encodeURIComponent(ptr.id)).then(function (r) { b.remove(); if (r.ok && r.data.ok) loadProject(r.data.project); else fail('That page could not be loaded from your account.'); }); });
    els.csBriefStep.insertBefore(b, els.csBriefStep.firstChild.nextSibling);
  }

  // ---------- pictures: read in the browser ----------
  function loadImage(src) { return new Promise(function (resolve, reject) { var im = new Image(); im.onload = function () { resolve(im); }; im.onerror = function () { reject(new Error('unreadable image')); }; im.src = src; }); }
  function pixels(im, maxSide) {
    var w = im.naturalWidth, h2 = im.naturalHeight, k = Math.min(1, maxSide / Math.max(w, h2));
    var cv = document.createElement('canvas'); cv.width = Math.max(1, Math.round(w * k)); cv.height = Math.max(1, Math.round(h2 * k));
    var ctx = cv.getContext('2d', { willReadFrequently: true }); ctx.drawImage(im, 0, 0, cv.width, cv.height);
    return { canvas: cv, img: { width: cv.width, height: cv.height, data: ctx.getImageData(0, 0, cv.width, cv.height).data } };
  }
  function toDataUrl(img, type, q) { var cv = document.createElement('canvas'); cv.width = img.width; cv.height = img.height; var ctx = cv.getContext('2d'); var id = ctx.createImageData(img.width, img.height); id.data.set(img.data); ctx.putImageData(id, 0, 0); return cv.toDataURL(type || 'image/png', q); }
  var ILLUSTRATION = /\b(illustration|drawing|engraving|sketch|etching|lithograph|woodcut|cartoon|poster|painting)\b/i;
  // assess one picture; when its background is plain, cut the subject out as a separate asset
  function processAsset(asset) {
    return loadImage(asset.dataUrl).then(function (im) {
      var px = pixels(im, 1100); var a = C.assets.assess(px.img);
      a.width = im.naturalWidth; a.height = im.naturalHeight; a.megapixels = +((im.naturalWidth * im.naturalHeight) / 1e6).toFixed(2);
      asset.assess = a; asset.illustration = ILLUSTRATION.test((asset.title || '') + ' ' + (asset.description || ''));
      asset.caps = C.assets.capabilities(asset);
      var out = [asset];
      // a logo or a map is never lifted out as a floating layer
      var reference = asset.ownerRole === 'logo' || (asset.curation && (asset.curation.role === 'logo' || asset.curation.role === 'reference'));
      if (!a.transparent && !reference && a.background && a.background.uniformity >= 0.8) {
        var cut = C.assets.cutout(px.img, { holes: !asset.illustration });
        if (cut.clean && cut.img) {
          var cropped = C.assets.crop(cut.img, cut.bbox, 0.02); var ca = C.assets.assess(cropped);
          var derived = { id: 'c-' + asset.id, origin: 'derived', cutout: true, cutoutOf: asset.id, title: asset.title, alt: asset.alt, relevance: asset.relevance, illustration: asset.illustration, kind: asset.kind, curation: asset.curation,
            dataUrl: toDataUrl(cropped, 'image/png'), mime: 'image/png', assess: ca, processing: 'Background removed in the browser (plain background, edge flood fill, ' + Math.round(cut.removedShare * 100) + '% removed), cropped to the subject' };
          derived.caps = C.assets.capabilities(derived); out.push(derived);
          asset.processing = 'Cut out as a separate layer (see its cutout)';
        } else asset.processing = 'Kept as a framed picture: ' + (cut.reason || 'no clean cut');
      } else asset.processing = a.transparent ? 'Already transparent: moves as its own layer' : 'Kept as a framed picture: busy background (no clean cutout possible)';
      return out;
    }).catch(function () { asset.failed = true; asset.processing = 'Could not be read'; return [asset]; });
  }
  function fileToAsset(file, n) {
    return new Promise(function (resolve) {
      var r = new FileReader(); r.onload = function () { resolve(r.result); }; r.onerror = function () { resolve(null); }; r.readAsDataURL(file);
    }).then(function (dataUrl) {
      if (!dataUrl) return null;
      return loadImage(dataUrl).then(function (im) {
        // large uploads are resized once, here (a phone photo does not need 12 megapixels)
        // (its premium-video quality is read from the file as it came, before any resize: premium-source.js)
        var quality = uploadQuality(im);
        if (Math.max(im.naturalWidth, im.naturalHeight) > 2000 || dataUrl.length > 4e6) { var px = pixels(im, 2000); var alpha = /png|webp/.test(file.type); dataUrl = px.canvas.toDataURL(alpha ? 'image/png' : 'image/jpeg', 0.9); }
        return { id: 'u' + Date.now().toString(36) + n, origin: 'upload', title: file.name.replace(/\.[a-z]+$/i, ''), alt: '', relevance: 2, dataUrl: dataUrl, mime: dataUrl.slice(5, dataUrl.indexOf(';')), quality: quality || undefined };
      }).catch(function () { return null; });
    });
  }
  // how crisp an upload is (at about the size of the video) and how blocky its compression is (a crop at its own
  // resolution, on the JPEG grid) -> { sharpness, blockiness } | null
  function uploadQuality(im) {
    try {
      var W = im.naturalWidth, H = im.naturalHeight; var sharp = C.premiumSource.sharpness(pixels(im, 1100).img);
      var s = Math.min(512, W - (W % 8), H - (H % 8)); var sx = Math.max(0, Math.floor((W - s) / 16) * 8), sy = Math.max(0, Math.floor((H - s) / 16) * 8);
      var cv = document.createElement('canvas'); cv.width = s; cv.height = s; var ctx = cv.getContext('2d', { willReadFrequently: true }); ctx.drawImage(im, sx, sy, s, s, 0, 0, s, s);
      var blk = s >= 64 ? C.premiumSource.blockiness({ width: s, height: s, data: ctx.getImageData(0, 0, s, s).data }) : null;
      var q = {}; if (sharp != null) q.sharpness = sharp; if (blk != null) q.blockiness = blk; return Object.keys(q).length ? q : null;
    } catch (e) { return null; }
  }
  function addUploads(files, role) {
    var uploads = S.assets.filter(function (a) { return a.origin === 'upload' && !a.removed; });
    // (one photo at a time: each is decoded at full size before it is resized, and eight 12-megapixel photos decoded at
    // once is more than a phone's browser allows a tab -- it closes the page)
    var picked = files.slice(0, Math.max(0, 8 - uploads.length));
    return picked.reduce(function (chain, file, n) { return chain.then(function (acc) { return fileToAsset(file, n).then(function (a) { acc.push(a); return acc; }); }); }, Promise.resolve([])).then(function (list) {
      list = list.filter(Boolean); if (!list.length) return;
      // (one logo at most: a new one replaces the role of the last)
      if (role === 'logo') { S.assets.forEach(function (x) { if (x.ownerRole === 'logo') x.ownerRole = 'auto'; }); list.forEach(function (a) { a.ownerRole = 'logo'; a.title = a.title || 'logo'; a.relevance = 0; }); }
      // (and measured and cut out one at a time, for the same reason)
      return list.reduce(function (chain, a) { return chain.then(function (acc) { return processAsset(a).then(function (g) { acc.push(g); return acc; }); }); }, Promise.resolve([])).then(function (groups) {
        groups.forEach(function (g) { S.assets = S.assets.concat(g); });
        renderThumbs(); if (S.gate) showGate(S.gate);
        if (S.plan && S.plan.v === 2) { if (role === 'logo') { S.plan = settle(S.plan); refresh(); } buildEditor(); markDirty(); }
        else if (S.plan) { placeNewUploads(list); rebuildHero(); refresh(); }
      });
    });
  }
  // a 3D model (GLB): checked for its signature and size here, stored with the project like its pictures, drawn only by a
  // page with a 3D layer -- a page without one, or a browser that cannot draw it, shows the main picture instead
  function addModel(file) {
    if (!file) return; if (file.size > 8 * 1024 * 1024) { els.csError.hidden = false; els.csError.textContent = 'That 3D model is larger than 8 MB. Please use a smaller .glb file.'; return; }
    var r = new FileReader(); r.onload = function () {
      var url = String(r.result || ''); var i = url.indexOf(','); var head = ''; try { head = atob(url.slice(i + 1, i + 9)).slice(0, 4); } catch (e) { head = ''; }
      if (i < 0 || head !== 'glTF') { els.csError.hidden = false; els.csError.textContent = 'That file is not a binary glTF (.glb) model.'; return; }
      S.models = [{ id: 'm' + Date.now().toString(36), format: 'glb', origin: 'upload', title: file.name.replace(/\.[a-z0-9]+$/i, ''), of: liveMain() || '', bytes: file.size, mime: 'model/gltf-binary', dataUrl: 'data:model/gltf-binary;base64,' + url.slice(i + 1) }];
      renderThumbs(); if (S.plan) markDirty();
    }; r.readAsDataURL(file);
  }
  function modelMeta() { return (S.models || []).map(function (m) { return { id: m.id, format: 'glb', of: m.of || '', bytes: m.bytes || 0, title: m.title }; }); }
  function renderThumbs() {
    var ups = S.assets.filter(function (a) { return a.origin === 'upload' && !a.removed; });
    var roles = [['auto', 'Let the page decide'], ['main', 'Main subject'], ['supporting', 'Supporting'], ['background', 'Background'], ['logo', 'Logo']];
    var pvBy = {}; if (currentMode().on) pvVerdicts().forEach(function (v) { pvBy[v.id] = v; });
    els.csThumbs.innerHTML = ups.map(function (a) { var r = S.mainAsset === a.id ? 'main' : (a.ownerRole || 'auto'); var pv = pvBy[a.id]; return '<figure>' + (pv ? '<span class="cs-pv-tag" data-ok="' + (pv.ok ? 'yes' : 'no') + '" title="' + esc(pv.ok ? 'Suitable for premium video' : pv.reason) + '">' + (pv.ok ? 'video ✓' : 'not for video') + '</span>' : '') + '<img src="' + esc(a.dataUrl) + '" alt=""><button type="button" data-rm="' + esc(a.id) + '" aria-label="Remove">×</button><select data-role-for="' + esc(a.id) + '" aria-label="Use this picture as">' + roles.map(function (x) { return '<option value="' + x[0] + '"' + (x[0] === r ? ' selected' : '') + '>' + x[1] + '</option>'; }).join('') + '</select>' + (a.ownerPicked ? '<small title="' + esc(a.pageUrl || '') + '">picked from ' + esc(a.author || 'the web') + '</small>' : a.ownerAffirmed ? '<small title="You said you have the rights to use it">from the web · your rights</small>' : '') + '</figure>'; }).join('');
    (S.models || []).forEach(function (m) { els.csThumbs.insertAdjacentHTML('beforeend', '<figure class="cs-model"><span>3D · ' + esc(m.title || 'model') + '</span><button type="button" data-rm-model="' + esc(m.id) + '" aria-label="Remove the 3D model">×</button></figure>'); });
    [].forEach.call(els.csThumbs.querySelectorAll('[data-rm-model]'), function (b) { b.addEventListener('click', function () { S.models = S.models.filter(function (m) { return m.id !== b.getAttribute('data-rm-model'); }); renderThumbs(); if (S.plan) markDirty(); }); });
    [].forEach.call(els.csThumbs.querySelectorAll('[data-rm]'), function (b) { b.addEventListener('click', function () { removeAsset(b.getAttribute('data-rm')); }); });
    [].forEach.call(els.csThumbs.querySelectorAll('[data-role-for]'), function (sel) { sel.addEventListener('change', function () { setUploadRole(sel.getAttribute('data-role-for'), sel.value); }); });
    renderPv(); priceSoon();
  }

  // the owner's role for an upload; one main subject at most (it then leads the opening scene)
  function setUploadRole(id, role) {
    var a = S.assets.find(function (x) { return x.id === id; }); if (!a) return;
    if (role === 'main') { S.assets.forEach(function (x) { if (x.ownerRole === 'main') x.ownerRole = 'auto'; }); S.mainAsset = id; }
    else if (S.mainAsset === id) S.mainAsset = null;
    a.ownerRole = role === 'main' ? 'main' : role; renderThumbs(); if (S.plan) markDirty();
    if (S.gate) showGate(S.gate);
  }

  // ---------- create ----------
  function steps(list) { els.csProgressList.innerHTML = list.map(function (s) { return '<li data-step="' + s[0] + '"><i></i><span>' + esc(s[1]) + '</span><small></small></li>'; }).join(''); }
  var ticker = null;
  function step(id, state, note) {
    var li = els.csProgressList.querySelector('[data-step="' + id + '"]'); if (!li) return; li.setAttribute('data-state', state); if (note != null) li.querySelector('small').textContent = note;
    if (ticker && (ticker.id === id || state === 'active')) { clearInterval(ticker.t); ticker = null; }
    if (state === 'active') { var t0 = Date.now(), base = note != null ? note : li.querySelector('small').textContent; ticker = { id: id, t: setInterval(function () { var sec = Math.round((Date.now() - t0) / 1000); li.querySelector('small').textContent = (base ? base + ' · ' : '') + sec + ' s'; }, 1000) }; }
  }
  function usedUp() {
    var box = h('div', { class: 'cs-dir-actions', id: 'csUsedUp' });
    var ptr = null; try { ptr = JSON.parse(localStorage.getItem(POINTER) || 'null'); } catch (e) { ptr = null; }
    if (ptr && ptr.id) { var o = h('button', { type: 'button', class: 'cs-btn', text: 'Open \u201c' + (ptr.name || 'your saved page') + '\u201d' }); o.addEventListener('click', function () { o.disabled = true; api('/api/projects/' + encodeURIComponent(ptr.id)).then(function (r) { if (r.ok && r.data.ok) loadProject(r.data.project); else fail('That page could not be loaded from your account.'); }); }); box.appendChild(o); }
    var f = h('button', { type: 'button', class: 'cs-btn cs-ghost', text: 'Start this page fresh (priced first)' }); f.addEventListener('click', function () { try { localStorage.removeItem(JOB); } catch (e) { /* optional */ } S.jobId = null; create(); }); box.appendChild(f);
    els.csError.appendChild(box);
  }
  // (brought into view: on a phone the message would otherwise sit far below where the owner is looking)
  function fail(msg) { els.csError.hidden = false; els.csError.textContent = msg; S.busy = false; els.csCreate.disabled = false; els.csBriefStep.hidden = false; try { els.csError.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (e) { /* older browsers */ } }
  function lines(t) { return String(t || '').split(/\n+/).map(function (x) { return x.trim(); }).filter(Boolean); }

  // ---------- THE GENERATION MODE: Creative, Creative + Cinematic Hero, Creative Showcase ----------
  // The owner chooses one before anything is quoted. It decides whether Higgsfield is used, how many premium moments are
  // planned (the standard / showcase strategies underneath: premium-arc.js), the quote and the credit total. The video
  // modes start only from the owner's own uploads that are good enough for full-screen video (premium-source.js); a
  // showcase needs two (the hero and the payoff share one picture, the takeover needs another).
  var MODES = [
    { id: 'creative', name: 'Creative', line: 'No Higgsfield video. The lowest cost.', on: false, moments: 1, needs: 0 },
    { id: 'hero', name: 'Creative + Cinematic Hero', line: '1 Higgsfield premium video, made from one of your uploads.', on: true, moments: 1, needs: 1 },
    { id: 'showcase', name: 'Creative Showcase', line: '3 Higgsfield premium videos: the hero, a mid-page takeover and a closing payoff.', on: true, moments: 3, needs: 2 },
  ];
  function modeOf(id) { return MODES.filter(function (m) { return m.id === id; })[0] || MODES[0]; }
  function currentMode() { return modeOf(S.mode); }
  // which uploads can become premium video, and why not (the same verdict the server enforces: premium-source.js)
  function pvVerdicts() {
    var byId = new Map(S.assets.map(function (a) { return [a.id, a]; }));
    return S.assets.filter(function (a) { return a.origin === 'upload' && !a.removed && a.ownerRole !== 'logo'; }).map(function (a) { return Object.assign({ id: a.id, title: a.title || 'upload' }, C.premiumSource.eligible(a, { byId: byId })); });
  }
  function eligibleCount() { return pvVerdicts().filter(function (v) { return v.ok; }).length; }
  // THE CINEMATIC SOURCE (lib/creative/cinematic-source.js): the owner's upload, or the page's own interactive 3D model --
  // a still of it, rendered here by the 3D engine, is what the provider animates. 3D Model is offered only when the page
  // has a finished model; the choice is saved with the page. The source belongs to the CINEMATIC modes only (Creative +
  // Cinematic Hero, Creative Showcase): base Creative never uses Higgsfield, so there the choice is kept but inactive --
  // choosing 3D Model never turns Creative into a cinematic generation (and the server refuses one: startPremium).
  function cineModel() { return C.cinematicSource.modelFor(S.threeD, S.assets); }
  function cineSource() { return currentMode().on && S.premiumSource === 'model3d' && cineModel() ? 'model3d' : 'image'; }
  function setSource(v) { S.premiumSource = C.cinematicSource.clean(v); if (S.plan && S.projectId) markDirty(); renderPv(); priceSoon(0); }
  // (the 3D model is a source of its own: the moments that show the product start from it, so it counts as one more)
  function sourceCount() { var n = eligibleCount(); var mdl = cineSource() === 'model3d' ? cineModel() : null; return mdl && !pvVerdicts().some(function (v) { return v.ok && v.id === mdl.sourceAssetId; }) ? n + 1 : n; }
  function premiumChoice(mode) { var m = mode || currentMode(); return { on: m.on, moments: m.moments, eligibleUploads: m.on ? sourceCount() : 0 }; }
  function setMode(id) { S.mode = modeOf(id).id; renderThumbs(); }
  function renderPv() {
    if (!els.csModes) return; var m = currentMode();
    [].forEach.call(els.csModes.querySelectorAll('[data-mode]'), function (b) { var on = b.getAttribute('data-mode') === m.id; b.setAttribute('aria-checked', on ? 'true' : 'false'); b.tabIndex = on ? 0 : -1; });
    var srcBox = document.getElementById('csPvSrc');
    if (srcBox) {
      // (shown in the cinematic modes; in base Creative only when the page has a model, and then clearly inactive)
      var has = !!cineModel(); var cur = cineSource(); var off = !m.on; srcBox.hidden = off && !has; srcBox.setAttribute('data-inactive', off ? 'true' : 'false');
      [].forEach.call(srcBox.querySelectorAll('[data-src]'), function (b) { var v = b.getAttribute('data-src'); b.setAttribute('aria-checked', !off && v === cur ? 'true' : 'false'); b.disabled = off || (v === 'model3d' && !has); b.tabIndex = !off && v === cur ? 0 : -1; });
      document.getElementById('csPvSrcNote').textContent = off ? C.cinematicSource.MESSAGES.inactive : has ? C.cinematicSource.MESSAGES.available : C.cinematicSource.MESSAGES.unavailable;
    }
    if (!m.on) { els.csPvState.textContent = ''; return; }
    if (cineSource() === 'model3d') { els.csPvState.textContent = m.moments > 1 ? 'The hero and closing videos start from a still of your 3D model; the takeover needs one suitable uploaded photo of its own.' : 'The video starts from a still of your 3D model.'; return; }
    var v = pvVerdicts(); var ok = v.filter(function (x) { return x.ok; }); var bad = v.filter(function (x) { return !x.ok; });
    els.csPvState.textContent = (!v.length ? m.name + ' needs ' + (m.needs > 1 ? m.needs + ' suitable uploaded photos' : 'an uploaded photo') + ' (web pictures are never used for video).'
      : ok.length >= m.needs ? ok.length + ' of ' + v.length + ' upload' + (v.length === 1 ? '' : 's') + ' suitable for premium video.'
      : m.name + ' needs ' + m.needs + ' suitable uploaded photo' + (m.needs === 1 ? '' : 's') + '; ' + (ok.length ? 'you have ' + ok.length + '.' : 'none of yours is suitable yet.'))
      + (bad.length ? ' Not suitable: ' + bad.slice(0, 3).map(function (x) { return x.title + ' (' + x.reason + ')'; }).join('; ') + '.' : '');
  }
  // the cost of each mode and of the chosen one, as the server prices it (nothing is stored: the quote is made when the
  // owner creates)
  var priceTimer = null, priceSeq = 0;
  function priceSoon(ms) { clearTimeout(priceTimer); priceTimer = setTimeout(priceNow, ms == null ? 250 : ms); }
  function priceModes() {
    // (the chosen mode at its own price -- as if its uploads were there: a mode never looks cheaper because a photo is missing)
    var m = currentMode(); var pc = premiumChoice(m); if (m.on) pc.eligibleUploads = Math.max(pc.eligibleUploads, m.needs);
    return api('/api/creative/price', { method: 'POST', body: { request: els.csBrief ? els.csBrief.value.trim() : '', premium: pc } }).then(function (r) {
      if (!r.ok || !r.data || !r.data.ok) return null; S.modePrices = r.data.modes || null; return r.data;
    });
  }
  function priceNow() {
    if (!els.csSum) return; var seq = ++priceSeq;
    priceModes().then(function (d) {
      if (seq !== priceSeq || !d) return; if (typeof d.creditsRemaining === 'number') showBalance(d.creditsRemaining);
      S.premiumOff = d.premiumAvailable === false ? (d.premiumUnavailable || 'Premium video is unavailable right now.') : '';
      MODES.forEach(function (m) { var el = els.csModes.querySelector('[data-mode-credits="' + m.id + '"]'); var card = els.csModes.querySelector('[data-mode="' + m.id + '"]'); var p = d.modes && d.modes[m.id]; var off = m.on && S.premiumOff; if (card) card.setAttribute('data-unavailable', off ? 'yes' : 'no'); if (el) el.textContent = off ? 'unavailable' : p ? (p.minCredits < p.credits ? 'up to ' : '') + p.credits + ' credits' : ''; });
      els.csSum.innerHTML = '<table class="cs-lines">' + costRows(d.items, d.credits, d.minCredits, d.creditsRemaining).map(function (l) { return '<tr' + (l.cls ? ' class="' + l.cls + '"' : '') + '><td>' + esc(l.label) + '</td><td>' + esc(l.value) + '</td></tr>'; }).join('') + '</table>'
        + (currentMode().on && sourceCount() < currentMode().needs ? '<p class="cs-hint cs-needs">Needs ' + (currentMode().needs > 1 ? currentMode().needs + ' suitable uploaded photos' : 'a suitable uploaded photo') + ' before it can be created.</p>' : '')
        + (!currentMode().on && d.premium && d.premium.briefAsks ? '<p class="cs-hint">Your description mentions video: choose Cinematic Hero or Showcase to include it.</p>' : '');
    });
  }
  var LINE = { creative_dom: 'Creative website', spatial_surcharge: 'Spatial depth, only if used' };
  var ROLE_LINE = { hero: 'Premium hero video', takeover: 'Premium takeover video', payoff: 'Premium payoff video' };
  function costRows(items, total, min, balance) {
    var rows = (items || []).map(function (i) { var pv = /^premium_/.test(i.code); return { label: (pv ? (ROLE_LINE[i.role] || 'Premium hero video') : (LINE[i.code] || i.label)), value: (i.optional ? '+' : '') + i.credits + ' credits', cls: pv ? 'cs-pvline' : '' }; });
    rows.push({ label: 'Total', value: (min < total ? 'up to ' : '') + total + ' credits', cls: 'cs-total' });
    if (typeof balance === 'number') rows.push({ label: 'Your balance', value: balance + ' credit' + (balance === 1 ? '' : 's'), cls: 'cs-muted' });
    return rows;
  }
  // ONE modal for decisions about cost: it confirms the setup the owner chose, and when that setup cannot run it offers
  // the ways on -- it never changes the setup by itself. -> Promise<action id>
  function modal(o) {
    return new Promise(function (resolve) {
      var old = document.getElementById('csModal'); if (old) old.remove();
      var box = h('div', { id: 'csModal', class: 'cs-modal', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'csModalTitle' });
      var rows = (o.lines || []).map(function (l) { return '<tr' + (l.cls ? ' class="' + l.cls + '"' : '') + '><td>' + esc(l.label) + '</td><td>' + esc(l.value) + '</td></tr>'; }).join('');
      box.innerHTML = '<div class="cs-modal-card"><h2 id="csModalTitle">' + esc(o.title) + '</h2>' + (o.text ? '<p>' + esc(o.text) + '</p>' : '') + (rows ? '<table class="cs-lines">' + rows + '</table>' : '') + (o.note ? '<p class="cs-hint">' + esc(o.note) + '</p>' : '')
        + '<p class="cs-modal-status" id="csModalStatus" aria-live="polite"></p><div class="cs-modal-actions">' + o.actions.map(function (a) { return '<button type="button" class="cs-btn' + (a.primary ? ' cs-go' : ' cs-ghost') + '" data-act="' + esc(a.id) + '">' + esc(a.label) + '</button>'; }).join('') + '</div></div>';
      root.appendChild(box);
      var key = function (e) { if (e.key === 'Escape') { e.stopPropagation(); done('cancel'); } };
      var done = function (v) { root.removeEventListener('keydown', key, true); box.remove(); resolve(v); };
      root.addEventListener('keydown', key, true);
      [].forEach.call(box.querySelectorAll('[data-act]'), function (b) { b.addEventListener('click', function () { var a = b.getAttribute('data-act'); if (o.stay && o.stay(a, box)) return; done(a); }); });
      var first = box.querySelector('.cs-go') || box.querySelector('[data-act]'); if (first) first.focus();
    });
  }
  // credits are bought in a new tab (the page being made waits here); then the owner comes back and checks the balance
  function buyCredits(need) {
    return api('/api/billing/catalog').then(function (r) {
      var packs = (r.data && r.data.catalog && r.data.catalog.packs) || [];
      return modal({ title: 'Add credits', text: 'Credits are a one-time purchase and never expire. Checkout opens in a new tab; this page waits here.' + (need > 0 ? ' This setup needs ' + need + ' more.' : ''),
        actions: packs.map(function (p) { return { id: 'pack:' + p.id, label: p.credits + ' credits · ' + p.display }; }).concat([{ id: 'check', label: 'I have paid: check my balance', primary: true }, { id: 'back', label: 'Back' }]),
        stay: function (a, box) {
          if (a.indexOf('pack:') !== 0) return false;
          var st = box.querySelector('#csModalStatus'); st.textContent = 'Opening secure checkout…'; var w = window.open('', '_blank');
          api('/api/credits/checkout', { method: 'POST', body: { packId: a.slice(5) } }).then(function (x) {
            var d = x.data || {};
            if (d.ok && d.url) { if (w) { w.opener = null; w.location.href = d.url; } else window.open(d.url, '_blank', 'noopener'); st.textContent = 'Finish paying in the new tab, then press "I have paid: check my balance".'; }
            else { if (w) w.close(); st.textContent = d.message || 'Checkout could not start. Please try again shortly.'; }
          });
          return true;
        } });
    });
  }
  function quoteFor(operation, premium) {
    return api('/api/quotes', { method: 'POST', body: { operation: operation, projectId: S.projectId || '', request: operation === 'creative_generation' ? S.brief : '', premium: premium || { on: false } } }).then(function (r) {
      if (r.status === 401) { needSignIn('Sign in to continue.'); return null; }
      if (!r.ok || !r.data || !r.data.ok) { els.csError.hidden = false; els.csError.textContent = (r.data && r.data.message) || 'Could not price this right now.'; return null; }
      if (typeof r.data.creditsRemaining === 'number') showBalance(r.data.creditsRemaining);
      return r.data;
    });
  }
  // a new page: the chosen mode, priced, confirmed -- or, when it cannot run as chosen, the owner picks the way on:
  // upload suitable photos, a lower mode, buy credits, or cancel. It never changes the mode by itself. -> quoteId | null
  function modeCredits(m) { var p = S.modePrices && S.modePrices[m.id]; return p ? p.credits : null; }
  function switchAction(m) { var c = modeCredits(m); return { id: 'mode:' + m.id, label: 'Switch to ' + m.name + (c != null ? ' (' + (m.on ? 'up to ' : '') + c + ' credits)' : '') }; }
  function afterSwitch(a) { if (a && a.indexOf('mode:') === 0) { setMode(a.slice(5)); return confirmGeneration(); } return null; }
  function confirmGeneration() {
    // (the page's 3D model, when it is the chosen cinematic source, is a source of its own: sourceCount)
    var m = currentMode(); var have = m.on ? sourceCount() : 0;
    return priceModes().then(function (pd) {
      // (video modes are off on the server: the owner chooses Creative or stops -- nothing is quoted for video)
      if (m.on && pd && pd.premiumAvailable === false) return modal({ title: m.name + ' is unavailable right now', text: pd.premiumUnavailable || 'Premium video is unavailable right now.', actions: [switchAction(MODES[0]), { id: 'cancel', label: 'Cancel' }] }).then(afterSwitch);
      if (m.on && have < m.needs) {
        var bad = pvVerdicts().filter(function (x) { return !x.ok; });
        var lower = MODES.filter(function (x) { return MODES.indexOf(x) < MODES.indexOf(m) && x.needs <= have; }).reverse();
        return modal({ title: m.name + ' needs ' + (m.needs > 1 ? m.needs + ' suitable uploaded photos' : 'a suitable uploaded photo'),
          text: 'Higgsfield video uses your own uploaded images only' + (have ? '; you have ' + have + ' suitable.' : bad.length ? ', and none of your uploads is suitable for it yet.' : ', and you have not uploaded one yet.'),
          lines: bad.slice(0, 4).map(function (x) { return { label: x.title, value: x.reason }; }),
          actions: [{ id: 'upload', label: 'Upload suitable photos' }].concat(lower.map(switchAction), [{ id: 'cancel', label: 'Cancel' }]) }).then(function (a) {
          if (a === 'upload') { els.csUpload.click(); return null; }
          return afterSwitch(a);
        });
      }
      return quoteFor('creative_generation', premiumChoice(m)).then(function (d) {
        if (!d) return null; var q = d.quote; var st = d.premium || null; var bal = d.creditsRemaining; S.premium = st;
        var lines = [{ label: 'Mode', value: m.name }].concat(costRows(q.items, q.credits, q.minCredits, bal));
        var prem = q.items.some(function (i) { return /^premium_/.test(i.code); });
        if (typeof bal === 'number' && bal < q.credits) {
          // (the cheaper modes this balance covers and these uploads can make)
          var cheaper = MODES.filter(function (x) { var c = modeCredits(x); return x.id !== m.id && c != null && c < q.credits && c <= bal && x.needs <= sourceCount(); }).reverse();
          return modal({ title: 'Not enough credits for ' + m.name, text: 'This mode needs ' + q.credits + ' credits and you have ' + bal + '.', lines: lines,
            actions: [{ id: 'buy', label: 'Buy more credits', primary: !cheaper.length }].concat(cheaper.map(switchAction), [{ id: 'cancel', label: 'Cancel' }]) }).then(function (a) {
            if (a === 'buy') return buyCredits(q.credits - bal).then(function () { return confirmGeneration(); });
            return afterSwitch(a);
          });
        }
        return modal({ title: 'Create this page?', lines: lines, note: [st && st.reduced ? st.reduced.message : '', prem ? 'Each premium video is charged only if it is made; one that is not made is returned.' : 'No Higgsfield video in this mode.'].filter(Boolean).join(' '),
          actions: [{ id: 'go', label: 'Create (' + (q.minCredits < q.credits ? 'up to ' : '') + q.credits + ' credits)', primary: true }, { id: 'cancel', label: 'Cancel' }] }).then(function (a) { return a === 'go' ? q.id : null; });
      });
    });
  }
  // OWNERSHIP + CREDITS: other dynamic work (another direction) is quoted first and runs only once the owner confirms it
  function confirmQuote(operation, preface) {
    return quoteFor(operation).then(function (d) {
      if (!d) return null; var q = d.quote; var bal = d.creditsRemaining; var lines = costRows(q.items, q.credits, q.minCredits, bal);
      if (typeof bal === 'number' && bal < q.credits) return modal({ title: 'Not enough credits', text: (preface ? preface + ' ' : '') + 'This needs ' + q.credits + ' credits and you have ' + bal + '.', lines: lines, actions: [{ id: 'buy', label: 'Buy more credits', primary: true }, { id: 'cancel', label: 'Cancel' }] }).then(function (a) {
        return a === 'buy' ? buyCredits(q.credits - bal).then(function () { return confirmQuote(operation, preface); }) : null;
      });
      return modal({ title: preface || 'Continue?', lines: lines, actions: [{ id: 'go', label: 'Continue (' + (q.minCredits < q.credits ? 'up to ' : '') + q.credits + ' credits)', primary: true }, { id: 'cancel', label: 'Cancel' }] }).then(function (a) { return a === 'go' ? q.id : null; });
    });
  }
  // the direction asks (lib/creative/asks.js): a few taps that steer the page before it is made -- what the brief already
  // says is chosen for the owner; any question may be left open. Resolves the answers ({} when skipped), null to go back.
  function askDirection() {
    var A = C.asks; var picked = A.guess(S.brief);
    els.csAskList.innerHTML = A.QUESTIONS.map(function (q) { return '<div class="cs-ask"><p class="cs-ask-q">' + esc(q.title) + '</p><div class="cs-ask-opts">' + q.options.map(function (o) { return '<button type="button" class="cs-ask-opt" data-q="' + q.id + '" data-o="' + o.id + '" aria-pressed="' + (picked[q.id] === o.id) + '"><strong>' + esc(o.label) + '</strong><small>' + esc(o.hint || '') + '</small></button>'; }).join('') + '</div></div>'; }).join('');
    [].forEach.call(els.csAskList.querySelectorAll('.cs-ask-opt'), function (b) { b.addEventListener('click', function () { var q = b.getAttribute('data-q'), o = b.getAttribute('data-o'); if (picked[q] === o) delete picked[q]; else picked[q] = o; [].forEach.call(els.csAskList.querySelectorAll('.cs-ask-opt[data-q="' + q + '"]'), function (x) { x.setAttribute('aria-pressed', String(picked[q] === x.getAttribute('data-o'))); }); }); });
    els.csBriefStep.hidden = true; els.csAskStep.hidden = false;
    return new Promise(function (resolve) {
      function done(v) { els.csAskStep.hidden = true; els.csBriefStep.hidden = false; els.csAskGo.onclick = els.csAskSkip.onclick = els.csAskBack.onclick = null; resolve(v); }
      els.csAskGo.onclick = function () { done(A.normalise(picked)); }; els.csAskSkip.onclick = function () { done({}); }; els.csAskBack.onclick = function () { done(null); };
    });
  }
  function create(choice, quoteId) {
    if (S.busy) return;
    S.brief = els.csBrief.value.trim(); S.suppliedText = els.csSupplied.value; S.memoriesText = els.csMemories.value;
    if (!S.brief) { els.csBrief.focus(); return; }
    if (!signedIn()) { needSignIn('Sign in to make a Creative page — it saves to your account like any website.'); return; }
    if (S.dirty && S.plan && !choice && !quoteId && !window.confirm('Make a new page from this description? Your changes to the current page will be replaced.')) return;
    if (!choice && !quoteId && S.asksFor !== S.brief) return askDirection().then(function (a) { if (!a) return; S.asks = a; S.asksFor = S.brief; return create(); });
    if (!choice && !quoteId && !openJobFor(S.brief)) return confirmGeneration().then(function (q) { if (q) return create(choice, q); });
    S.busy = true; S.picked = null; els.csCreate.disabled = true; els.csError.hidden = true; els.csChoices.innerHTML = ''; var bk = document.getElementById('csBackToPage'); if (bk) bk.hidden = true;
    els.csProgress.hidden = false; els.csEditor.hidden = true; els.csBriefStep.hidden = true;
    steps([['understand', 'Understanding the brief'], ['research', 'Looking it up (encyclopedia and picture search)'], ['pictures', 'Reading the pictures (size, background, cutouts)'], ['direct', 'Directing the page'], ['build', 'Building the page'], ['premium', 'Premium media (Higgsfield)']]);
    var uploads = S.assets.filter(function (a) { return a.origin === 'upload' && !a.removed; });
    step('understand', 'active', 'Reading the brief, then looking it up: the encyclopedia for facts, a picture search, and a check of the pictures (up to a minute)');
    var t0 = Date.now();
    var jobId = choice ? S.jobId : openJobFor(S.brief);
    return api('/api/creative/research', { method: 'POST', body: { brief: S.brief, supplied: S.suppliedText, choice: choice || '', hasUploads: uploads.length, premium: premiumChoice(), jobId: jobId || '', quoteId: quoteId || '' } }).then(function (r) {
      if (r.status === 401) { S.busy = false; els.csCreate.disabled = false; els.csBriefStep.hidden = false; needSignIn('Sign in to make a Creative page.'); return; }
      // the price changed or the quote ran out: confirm the new one (nothing was reserved or spent)
      // (the price changed, the quote ran out, or the balance no longer covers it: the owner sees the setup again and decides)
      if (r.data && ((r.data.needsConfirmation && r.data.quote) || (r.data.creditsExceeded && !choice))) { S.busy = false; els.csCreate.disabled = false; els.csProgress.hidden = true; els.csBriefStep.hidden = false; creditsFrom(r.data); return confirmGeneration().then(function (q) { if (q) return create(choice, q); }); }
      creditsFrom(r.data);
      if (r.data && r.data.jobId) { S.jobId = r.data.jobId; rememberJob(false); } else if (r.data && (r.data.jobEnded || r.data.creditsExceeded)) S.jobId = null;
      // this page's included research runs are used up (a phone that dropped the page mid-generation and reloaded it):
      // never a dead end -- open the page already saved, or start this page fresh (a new job, priced and confirmed first)
      if (r.data && r.data.researchUsedUp) { step('understand', 'failed', r.data.message); fail(r.data.message); return usedUp(); }
      if (!r.ok || !r.data.ok) { step('understand', 'failed', (r.data && r.data.message) || 'The lookup failed.'); return fail((r.data && r.data.message) || 'The lookup failed. Please try again.'); }
      var d = r.data; if (d.premium) { S.premium = d.premium; S.premiumResult = null; step('premium', 'wait', premiumHeadline(d.premium)); } S.understanding = d.understanding; S.understandMeta = d.understandMeta || null; S.research = d.research; S.choice = choice || ''; S.spatialOn = !!d.spatial;
      var u = d.understanding || {};
      step('understand', 'done', describeUnderstanding(u) + (S.understandMeta && S.understandMeta.source === 'ai' ? ' · AI (' + ((S.understandMeta.ms || 0) / 1000).toFixed(1) + 's)' : ' · built-in reader' + (S.understandMeta && S.understandMeta.reason ? ' (' + S.understandMeta.reason + ')' : '')));
      if (d.research.log) { S.cost.researchRequests += d.research.log.requests || 0; S.cost.researchBytes += d.research.log.bytes || 0; }
      if (d.research.status === 'ambiguous') { step('research', 'wait', d.research.question || 'More than one thing is called that'); return askChoice(d.research.options || [], d.research.question); }
      var cw = (d.research.curation && d.research.curation.web) || null; var fromWeb = (d.images || []).filter(function (i) { return i.found === 'web'; }).length;
      var note = d.research.page ? d.research.page.title + ' · ' + (d.research.facts || []).length + ' facts · ' + d.images.length + ' pictures' + (cw && cw.ran ? ' (' + fromWeb + (cw.provider === 'google-images' ? ' from Google Images, ' + (cw.pages || 0) + ' pages read' : ' from a web search of ' + (cw.pages || 0) + ' pages') + (cw.review ? '; ' + cw.review + ' more found, reuse rights not verified' : cw.status && cw.status !== 'used' && cw.status !== 'nothing-found' && cw.message ? '; ' + cw.status.replace(/-/g, ' ') : '') + ')' : '') : (u.kind === 'fictional' || u.kind === 'invented') && !d.research.page ? 'Nothing looked up' : 'Nothing found — the page uses your words and pictures';
      step('research', 'done', note + ' (' + ((Date.now() - t0) / 1000).toFixed(1) + 's)');
      step('pictures', 'active');
      var research = (d.images || []).map(function (i) { return { id: i.id, origin: 'research', title: i.title, description: i.description, alt: cleanAlt(i), author: i.author, license: i.license, licenseUrl: i.licenseUrl, pageUrl: i.pageUrl, sourceUrl: i.sourceUrl, found: i.found, relevance: i.relevance, retrieved: i.retrieved, mime: i.mime, dataUrl: i.dataUrl, kind: i.kind || '', curation: i.curation || null, rightsEvidence: i.rightsEvidence }; });
      // keep the owner's uploads; research pictures are replaced by this run's
      S.assets = S.assets.filter(function (a) { return a.origin === 'upload' || (a.origin === 'derived' && S.assets.some(function (b) { return b.id === a.cutoutOf && b.origin === 'upload'; })); });
      var todo = research.filter(function (a) { return !S.assets.some(function (b) { return b.id === a.id; }); });
      var done = 0;
      return todo.reduce(function (p, a) { return p.then(function () { return processAsset(a).then(function (g) { S.assets = S.assets.concat(g); done++; step('pictures', 'active', done + ' of ' + todo.length); return new Promise(function (res) { setTimeout(res, 0); }); }); }); }, Promise.resolve()).then(function () {
        var cut = S.assets.filter(function (a) { return a.cutout; }).length, bad = S.assets.filter(function (a) { return a.failed; }).length;
        step('pictures', 'done', S.assets.filter(function (a) { return !a.cutout; }).length + ' pictures · ' + cut + ' cut out as separate layers' + (bad ? ' · ' + bad + ' unreadable' : ''));
        return afterPictures();
      });
    }).catch(function (e) { fail('Something went wrong: ' + (e && e.message || e)); });
  }
  // Does the page have a usable picture of its subject? If not, the owner decides BEFORE a direction is paid for:
  // supply pictures, adopt a found one they have the rights to, search again, or explicitly choose an abstract page.
  function needsSubjectPicture() {
    var u = S.understanding || {}; if (u.kind === 'personal' || S.abstractChosen) return false;
    var v = u.visuals && u.visuals.main; if (v && /^\s*none\b/i.test(v)) return false;
    if (!v && (u.kind === 'invented' || (u.identity && u.identity.kind === 'invented'))) return false;
    return true;
  }
  function usableSubject() {
    return S.assets.some(function (a) { if (a.removed || a.failed) return false; if (a.origin === 'upload') return a.ownerRole !== 'logo' && a.ownerRole !== 'background'; var k = a.curation; return !!(k && (k.role === 'subject' || k.role === 'detail') && k.identity === 'exact' && k.origin !== 'fan'); });
  }
  function mainProblem() {
    var a = S.mainAsset && S.assets.find(function (x) { return x.id === S.mainAsset && !x.removed; }); if (!S.mainAsset) return ''; if (!a) return 'The picture you chose as the main subject is no longer here.';
    if (a.failed) return 'The picture you chose as the main subject could not be read. Choose another or upload it again.';
    var w = a.assess && a.assess.width, hh = a.assess && a.assess.height; if (w && hh && Math.max(w, hh) < 300) return 'The picture you chose as the main subject is too small (' + w + '×' + hh + ' px) to lead a page. Upload a larger one.';
    return '';
  }
  function afterPictures() {
    var dg = S.research && S.research.diagnostics;
    if (dg && dg.stage === 'none' && !usableSubject()) { dg.stage = 'processing'; dg.note = 'usable pictures of the subject were found, but none could be read here: ' + S.assets.filter(function (a) { return a.failed; }).map(function (a) { return a.title + ' (' + (a.processing || 'unreadable') + ')'; }).join('; '); }
    var problem = mainProblem();
    if (problem || (needsSubjectPicture() && !usableSubject())) { S.busy = false; showGate({ problem: problem }); return Promise.resolve(); }
    return proceedToDirection();
  }
  // PREMIUM MEDIA in the generation: planned in the confirmed quote -> made here, right after the direction, with no
  // further offer or confirmation. Planned or not, made or not, the owner is told in plain words (and why).
  function premiumHeadline(st) { if (!st) return ''; if (st.made && st.made.length) return st.message; return st.planned ? 'Premium media planned: Yes — ' + st.message.replace(/^Premium media planned: /, '') : 'Premium media planned: No — ' + st.message; }
  // what the page was planned around, in plain words: the one pool (found + yours), how much of it is on the page, the
  // main picture (and why the owner's choice could not lead, when it could not), the logo, the premium video's source
  function visualNote() {
    var v = S.visualPlan; if (!v || !v.counts) return '';
    var name = function (id) { var a = S.assets.find(function (x) { return x.id === id; }); return a ? '“' + String(a.title || a.alt || id).replace(/^File:/, '').slice(0, 40) + '”' : id; };
    var c = v.counts; var yours = (c.uploaded || 0) + (c.picked || 0);
    return 'Pictures: ' + (c.discovered || 0) + ' found + ' + yours + ' of yours — ' + (v.used || []).length + ' of ' + (c.total || 0) + ' on the page'
      + (v.main ? ' · main: ' + name(v.main.id) + (v.mainReason ? ' (your choice could not lead: ' + v.mainReason + ')' : '') : '')
      + (v.logo ? ' · your logo is in the header' : '')
      + (v.premiumHero ? (v.premiumHero.source ? ' · the premium video starts from ' + name(v.premiumHero.source) + (v.premiumHero.note ? ' (' + v.premiumHero.note + ')' : '') : ' · premium video: ' + v.premiumHero.note) : '');
  }
  // the delivered video's colour cast and the way it moves, measured from two of its frames (same-origin file: the canvas
  // stays readable) -> { cast, accent, brightness, side, motion } (motion: lr / rl / in / out -- the next seams continue
  // it -- or none when the frames do not show one clear camera move; side: where its subject sits, from where the last
  // frame departs most from its own mean)
  function videoCast(url) {
    return new Promise(function (resolve) {
      var v = document.createElement('video'); var done = false; var cols = []; var frames = []; var times = []; var i = 0;
      var result = function () { var pal = cols.length ? C.palette.fromColours(cols) : null; var f = frames[frames.length - 1]; var lum = f ? frameLight(f) : null; return { cast: pal ? pal.hex || null : null, accent: cols.filter(function (x) { return pal && x !== pal.hex; })[0] || null, brightness: lum ? lum.brightness : null, side: lum ? lum.side : '', motion: frames.length === 2 ? C.continuity.videoMotion(frames[0], frames[1]) : 'none' }; };
      var finish = function () { if (done) return; done = true; clearTimeout(t); try { v.removeAttribute('src'); v.load(); } catch (e) { /* gone */ } resolve(result()); };
      var t = setTimeout(finish, 15000);
      var grab = function () { if (i >= times.length) return finish(); v.currentTime = times[i++]; };
      v.muted = true; v.playsInline = true; v.preload = 'auto';
      v.addEventListener('error', function () { finish(); });
      v.addEventListener('seeked', function () { try { var cv = document.createElement('canvas'); cv.width = 64; cv.height = 40; var ctx = cv.getContext('2d', { willReadFrequently: true }); ctx.drawImage(v, 0, 0, 64, 40); var img = { width: 64, height: 40, data: ctx.getImageData(0, 0, 64, 40).data }; frames.push(img); cols = cols.concat(C.assets.palette(img, 4)); } catch (e) { /* unreadable frame */ } grab(); });
      v.addEventListener('loadeddata', function () { var d = isFinite(v.duration) && v.duration > 0 ? v.duration : 2; times = [Math.min(1, d * 0.2), d * 0.65]; grab(); });
      v.src = url;
    });
  }
  // a frame's brightness (0..1) and where its subject sits: the columns that depart most from the frame's mean light
  function frameLight(f) {
    var W = f.width, H = f.height, d = f.data, sum = 0, n = W * H, col = []; var L = function (i) { return (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255; };
    for (var p = 0; p < n; p++) sum += L(p * 4); var mean = sum / n; var tot = 0, mx = 0;
    for (var x = 0; x < W; x++) { var c = 0; for (var y = 0; y < H; y++) c += Math.abs(L((y * W + x) * 4) - mean); col.push(c); tot += c; mx += c * (x + 0.5) / W; }
    var cx = tot ? mx / tot : 0.5; return { brightness: Math.round(mean * 100) / 100, side: cx < 0.42 ? 'left' : cx > 0.58 ? 'right' : 'centre' };
  }
  // a showcase's clips (premium-arc.js): each delivered clip joins its moment -- attached to its source picture (a copy of
  // it when the picture already carries another moment's clip, as the payoff's return to the hero's picture does), the
  // plan's moments pointed at it, and the page retuned to what each clip really is: its scene takes the clip's colour,
  // the next two lean into it, the words move off the subject's side, the next cameras continue its motion
  function integrateArc(delivered) {
    if (!S.plan || S.plan.v !== 2 || !Array.isArray(S.plan.premiumArc) || !delivered.length) return Promise.resolve('');
    var A = C.premiumArc.attach(S.assets, delivered); S.assets = A.assets; S.plan = C.premiumArc.repoint(S.plan, A.byRole);
    var said = [];
    return delivered.reduce(function (p, m) {
      return p.then(function () {
        var a = S.assets.find(function (x) { return x.id === A.byRole[m.role]; }); if (!a || !a.video) return;
        return videoCast('/api/premium-media/' + encodeURIComponent(a.video.mediaId) + '/file').then(function (k) {
          if (k && k.cast) a.video.cast = k.cast;
          // (the hero keeps its own path -- the whole page's palette follows the opening clip -- and records it on its moment)
          if (m.role === 'hero' && k && (k.cast || k.motion)) S.plan = C.palette.retune(S.plan, k.cast, k.motion);
          if (k) S.plan = C.premiumArc.retune(S.plan, m.role, k);
          said.push(m.role + (k && k.cast ? ' (' + k.cast + (k.motion && k.motion !== 'none' ? ', ' + ({ lr: 'left to right', rl: 'right to left', in: 'pushing in', out: 'pulling back' })[k.motion] : '') + ')' : ''));
        });
      });
    }, Promise.resolve()).then(function () {
      S.plan = settle(S.plan);
      return said.length ? 'Full-screen premium moments: ' + said.join(' · ') + ' — the page around each one retuned to the clip it got' : '';
    });
  }
  // a delivered premium hero video becomes part of the page: shown in the opening, and the page's colours re-tuned to the
  // colour it actually has (the planning used its source picture's colour)
  function integrateVideo(asset) {
    if (!asset || !asset.video || !S.plan || S.plan.v !== 2) return Promise.resolve('');
    return videoCast('/api/premium-media/' + encodeURIComponent(asset.video.mediaId) + '/file').then(function (m) {
      var cast = m && m.cast, motion = m && m.motion;
      if (cast) asset.video.cast = cast;
      if (cast || motion) S.plan = settle(C.palette.retune(S.plan, cast, motion));
      var hero = S.plan.timeline && S.plan.timeline.continuity && S.plan.timeline.continuity.hero;
      return 'Shown in the opening scene' + (hero && hero.end ? ', settling into its still frame as the page moves on' : '') + (cast ? ' · page colours tuned to its colour (' + cast + ')' : '') + (motion && motion !== 'none' ? ' · the next scenes continue its motion (' + ({ lr: 'left to right', rl: 'right to left', in: 'pushing in', out: 'pulling back' })[motion] + ')' : '');
    });
  }
  function heroAsset() { var s0 = S.plan && S.plan.scenes && S.plan.scenes[0]; var L = s0 && (s0.layers || []).find(function (l) { return l.kind === 'image' && l.asset; }); return (S.plan && S.plan.actor && S.plan.actor.asset) || (L && L.asset) || liveMain() || ''; }
  // ---------- PREMIUM MEDIA: a server-owned job (lib/premium-jobs.js) ----------
  // Started here -- after the page is saved to the owner's account, so the clips are attached even if this tab closes --
  // then FOLLOWED by polling. The start returns at once; the provider's minutes happen on the server. A request that ends
  // (a refresh, a closed tab, a proxy timeout, a dropped connection) is never a premium failure: only the job's own outcome
  // is. Each delivered clip is attached to its moment once, measured and the page retuned, then the page is saved again.
  var PV_STATE = { pending: 'Queued', submitting: 'Submitting', submitted: 'Processing at Higgsfield', processing: 'Processing at Higgsfield', downloading: 'Downloading', delivered: 'Ready', failed: 'Failed', blocked: 'Not made' };
  var PV_KEY = 'siteremade:premiumJob';
  function rememberPremium(job) { try { localStorage.setItem(PV_KEY, JSON.stringify({ jobId: job.jobId, creativeJobId: job.creativeJobId, projectId: S.projectId || null })); } catch (e) { /* optional */ } }
  function sendAssets() {
    var arc = (S.plan && Array.isArray(S.plan.premiumArc) ? S.plan.premiumArc : []).map(function (e) { return { role: e.role, asset: e.asset }; });
    var cand = live(); var picks = ((S.plan && S.plan.premiumMedia) || []).map(function (m) { return m.asset; }).concat(arc.map(function (e) { return e.asset; }), [heroAsset()]);
    return { arc: arc, assets: cand.map(function (a) { var o = { id: a.id, origin: a.origin, title: a.title, license: a.license, pageUrl: a.pageUrl, sourceUrl: a.sourceUrl, ownerPicked: a.ownerPicked, ownerAffirmed: a.ownerAffirmed, cutoutOf: a.cutoutOf, mime: a.mime, assetRef: a.assetRef, curation: a.curation, assess: a.assess, quality: a.quality, ownerRole: a.ownerRole }; if (picks.indexOf(a.id) >= 0 || (a.origin === 'upload' && !a.ownerPicked) || a.id === (cand.find(function (x) { return x.id === picks[picks.length - 1]; }) || {}).cutoutOf) o.dataUrl = a.dataUrl; return o; }) };
  }
  function savedFirst() { return signedIn() && S.plan ? Promise.resolve(save()).catch(function () { return null; }) : Promise.resolve(null); }
  // the 3D engine in this window (the same file the preview uses), for one still of the page's model
  var engineWait = null;
  function td3Engine() {
    if (window.SiteRemade3D && window.SiteRemade3D.still) return Promise.resolve(window.SiteRemade3D); if (engineWait) return engineWait;
    engineWait = new Promise(function (res, rej) { var s = document.createElement('script'); s.src = C.threeD.RUNTIME.preview; s.async = true; s.onload = function () { if (window.SiteRemade3D && window.SiteRemade3D.still) res(window.SiteRemade3D); else { engineWait = null; rej(new Error('engine')); } }; s.onerror = function () { engineWait = null; rej(new Error('engine')); }; document.head.appendChild(s); });
    return engineWait;
  }
  // the cinematic still: the stored model, drawn by the engine as cinematic-source.js RENDER says -> a PNG data URL
  function td3Still(model) { var url = srcFor(model); if (!url) return Promise.reject(new Error('no model')); return td3Engine().then(function (E) { return E.still(Object.assign({ model: url, maxBytes: C.threeD.LIMITS.modelBytes }, C.cinematicSource.RENDER)); }).then(function (r) { return r.dataUrl; }); }
  function runPremium() {
    if (S.premiumJob) { followPremium(S.premiumJob.jobId); return Promise.resolve(); }
    if (!S.premium || !S.premium.planned || !S.jobId) { step('premium', 'done', premiumHeadline(S.premiumResult || S.premium) || 'Premium media planned: No'); return Promise.resolve(); }
    step('premium', 'active', 'Saving the page to your account, then starting the premium videos…');
    // (the 3D source: one still of the page's model, rendered once -- a retry sends the same still; a still that could not
    // be drawn is said so to the server, which makes nothing from it and returns its credits)
    var cine = null;
    var source = function () {
      if (cineSource() !== 'model3d') return Promise.resolve(null); if (cine) return Promise.resolve(cine); var mdl = cineModel();
      step('premium', 'active', 'Rendering a still of your 3D model for the cinematic video…');
      return td3Still(mdl).then(function (png) { cine = { kind: 'model3d', modelId: mdl.id, render: png }; return cine; }, function () { cine = { kind: 'model3d', modelId: mdl.id, render: '' }; return cine; });
    };
    var start = function () {
      return source().then(function (cs) {
        var x = sendAssets();
        return api('/api/creative/premium/start', { method: 'POST', body: Object.assign({ jobId: S.jobId, projectId: S.projectId || '', brief: S.brief, premiumMedia: (S.plan && S.plan.premiumMedia) || [], premiumArc: x.arc, heroAsset: heroAsset(), subject: (S.understanding && S.understanding.identity && S.understanding.identity.name) || '', assets: x.assets, models: modelMeta() }, cs ? { cinematicSource: cs } : {}) });
      });
    };
    var started = function (r) {
      var d = (r && r.data) || {}; creditsFrom(d);
      if (d.job) { S.premiumJob = { jobId: d.job.jobId }; rememberPremium(d.job); showPremium(d.job); followPremium(d.job.jobId); return; }
      if (!r || !r.ok && !r.status) throw new Error('unreachable');
      var st = (d.premium && d.premium.status) || { planned: true, reason: 'not_run', message: (d.message || 'The premium media step could not start.') + ' Its SiteRemade credits were returned.' };
      S.premiumResult = st; step('premium', st.planned === false ? 'done' : 'failed', premiumHeadline(st));
    };
    return savedFirst().then(start).then(started).catch(function () {
      // (the start did not come back -- the job may exist all the same: asking again returns that job, never a second one)
      step('premium', 'active', 'Reconnecting to the premium videos…');
      return new Promise(function (res) { setTimeout(res, 3000); }).then(start).then(started).catch(function () { step('premium', 'active', 'Premium videos: the connection dropped — reopen this page to see their progress.'); });
    });
  }
  // the live progress, in the progress list while the page is being made and in the editor afterwards
  function showPremium(job) {
    if (!job) return; var steps = job.total > 1;
    step('premium', job.terminal ? (job.completed ? 'done' : 'failed') : 'active', job.message);
    var box = document.getElementById('csPvLive');
    if (!box) { box = h('div', { id: 'csPvLive', class: 'cs-pvlive', 'aria-live': 'polite' }); els.csEditor.insertBefore(box, els.csEditor.firstChild); }
    box.setAttribute('data-state', job.status);
    box.innerHTML = '<p><strong>' + esc(job.message) + '</strong></p>'
      + (steps ? '<ul class="cs-pvroles">' + job.roles.map(function (r) { return '<li data-state="' + esc(r.state) + '"><span>' + esc(r.label) + '</span><em>' + esc((PV_STATE[r.state] || r.state) + (r.late ? ' (taking longer than usual)' : '')) + '</em></li>'; }).join('') + '</ul>' : '')
      + (job.terminal ? '' : '<p class="cs-hint">You can keep editing, or close this tab: the videos keep being made on our side and are added to the page when they are ready — reopen the page from your account to see them.</p>');
  }
  // follow a job until it has an outcome: polls back off from 3 s to 15 s; a failed poll is a reconnect, never a failure
  function publishPremiumRevision() {
    // Premium completion changes the purchased deliverable itself (the generated MP4s),
    // not an ordinary draft edit. Freeze that completed revision so the Client App
    // preview/download and builder export all use the same latest Creative result.
    if (!S || !S.projectId || S.status !== 'purchased' || !Number.isInteger(S.revision)) return Promise.resolve(null);
    return api('/api/projects/' + encodeURIComponent(S.projectId) + '/publish', { method: 'POST', body: { revision: S.revision } }).then(function (r) {
      if (!r.ok || !r.data || !r.data.ok) setSaveState('Saved, but the app preview could not be refreshed yet.');
      return r;
    }).catch(function () { setSaveState('Saved, but the app preview could not be refreshed yet.'); return null; });
  }

  function followPremium(jobId) {
    if (!jobId || (S.pvFollow && S.pvFollow.jobId === jobId)) return; var me = { jobId: jobId, delay: 3000, misses: 0 }; S.pvFollow = me; var mine = S;
    var next = function () { if (S !== mine || S.pvFollow !== me) return; setTimeout(poll, me.delay); me.delay = Math.min(15000, Math.round(me.delay * 1.4)); };
    // (a missed poll is a connection problem, not a premium one: said quietly, cleared as soon as a poll comes back)
    var reconnecting = function (on) { var box = document.getElementById('csPvLive'); if (!box) return; var p = box.querySelector('.cs-pv-reconnect'); if (on && !p) { p = h('p', { class: 'cs-pv-reconnect', text: 'Reconnecting… the videos keep being made on our side.' }); box.appendChild(p); } else if (!on && p) p.remove(); box.setAttribute('data-reconnecting', on ? 'yes' : 'no'); };
    var missed = function () { me.misses++; if (me.misses >= 2) reconnecting(true); me.delay = Math.min(me.delay, 4000); next(); };
    var poll = function () {
      if (S !== mine || S.pvFollow !== me) return;
      api('/api/creative/premium/status/' + encodeURIComponent(jobId)).then(function (r) {
        if (S !== mine) return;
        if (!r.ok || !r.data || !r.data.job) { if (r.status === 404) { S.pvFollow = null; return; } return missed(); }
        me.misses = 0; me.delay = Math.min(me.delay, 6000); var job = r.data.job; creditsFrom(r.data); showPremium(job); reconnecting(false);
        return attachDelivered(job).then(function () {
          if (job.terminal) {
            return publishPremiumRevision().then(function () {
              S.pvFollow = null; S.premiumResult = { planned: true, made: job.delivered.map(function (m) { return m.video.intent; }), message: job.message, reason: job.completed ? '' : 'provider_failed' };
              if (S.plan && els.csEditor && !els.csEditor.hidden) buildEditor(); showPremium(job);
            });
          }
          next();
        });
      }).catch(function () { missed(); });
    };
    poll();
  }
  // each delivered clip, once: attached to its moment (by its media id -- a repeated poll or a reopen never attaches it
  // twice), measured, the page retuned and saved
  function attachedIds() { var ids = {}; S.assets.forEach(function (a) { if (a.video && a.video.mediaId) ids[a.video.mediaId] = true; }); return ids; }
  function attachDelivered(job) {
    S.pvQueue = (S.pvQueue || Promise.resolve()).then(function () {
      var have = attachedIds(); var fresh = (job.delivered || []).filter(function (m) { return m.video && m.video.mediaId && !have[m.video.mediaId]; });
      if (!fresh.length || !S.plan) return;
      var multi = fresh.some(function (m) { return m.role; }) && Array.isArray(S.plan.premiumArc) && S.plan.premiumArc.length >= 2;
      var done;
      if (multi) done = integrateArc(fresh.filter(function (m) { return m.role; }));
      else { var m = fresh[0]; var a = S.assets.find(function (x) { return x.id === m.sourceAssetId; }); if (a) { a.video = m.video; a.premium = m.premium; } done = integrateVideo(a); }
      return done.then(function () { refresh(true); if (S.projectId) return save(); markDirty(); });
    }).catch(function () { /* the next poll tries again */ });
    return S.pvQueue;
  }
  // ---------- INTERACTIVE 3D ----------
  // One of the owner's own uploaded pictures as a real 3D model on the page (lib/three-d; creative-core's threeD). Shown
  // only on a Creative page, only when the server says 3D can be made, and only when there is an upload that suits it --
  // it is never switched on for a page by itself. The cost is shown before anything is made; the model is made by the
  // server's durable premium job (the same one as premium video) and followed here; when it is ready it is added to the
  // page ONCE, in the section its picture is in, previewed and saved. Closing the tab changes nothing: reopening the
  // page finds the job, or the finished model, again.
  var TD_PHASE = { queued: 'Waiting to start', submitting: 'Sending your picture', processing: 'Making the 3D model', downloading: 'Collecting the model', verifying: 'Checking the model', ready: 'Ready', failed: 'Not made', 'possible-cost': 'Not made' };
  function tdBlock() { return S.threeD && Array.isArray(S.threeD.assets) && S.threeD.assets.length ? S.threeD : null; }
  function tdSources() { var all = live(); var byId = new Map(all.map(function (a) { return [a.id, a]; })); return all.filter(function (a) { return a.origin === 'upload' && !a.cutoutOf && C.threeD.sourceEligible(a, { byId: byId }).ok; }); }
  // the cut-out of an upload (made here in the browser), if it has one: the free 3D model is shaped from it
  function tdCut(id) { return live().filter(function (a) { return a.cutoutOf === id && /^data:image\/png;base64,/.test(a.dataUrl || ''); })[0] || null; }
  // FREE 3D: the cut-out goes to the builder, which shapes the model (round products only) -- placed where the picture stands
  function td3Free() {
    var cut = tdCut(S.tdSource); if (!cut || S.tdBusy) return; var src = live().filter(function (a) { return a.id === S.tdSource; })[0] || {};
    S.tdBusy = true; S.tdNote = ''; build3D(); var mine = S;
    api('/api/creative/3d/lathe', { method: 'POST', body: { png: cut.dataUrl, sourceAssetId: S.tdSource, title: src.title || '' } }).then(function (r) {
      if (S !== mine) return; S.tdBusy = false;
      if (!r.ok || !r.data || !r.data.ok) { S.tdNote = (r.data && r.data.message) || 'The 3D model could not be made.'; build3D(); return; }
      var asset = Object.assign({}, r.data.asset, { dataUrl: r.data.dataUrl });
      if (!td3Place(asset, tdSectionFor(S.tdSource), r.data.composition || 'label-turn')) { S.tdNote = 'The 3D model was made, but could not be placed on this page.'; build3D(); return; }
      refresh(); markDirty(); build3D(); setSaveState('3D model added — free. Save to keep it.');
    }).catch(function () { if (S !== mine) return; S.tdBusy = false; S.tdNote = 'The 3D model could not be made.'; build3D(); });
  }
  function tdSceneName(id) { var s = (S.plan.scenes || []).find(function (x) { return x.id === id; }); return s ? (s.navLabel || (s.text && s.text.heading) || s.name || 'this section') : 'this section'; }
  // the section a model of this picture stands in: the first one after the opening that shows it (or its cut-out)
  function tdSectionFor(assetId) {
    // (every picture that comes from this photo -- its cut-out, a copy, a copy of its cut-out: C.threeD.rootPicture)
    var all = live(); var byIdT = new Map(all.map(function (a) { return [a.id, a]; }));
    var fam = {}; all.forEach(function (a) { var r = C.threeD.rootPicture(a, byIdT); if (r && r.id === assetId) fam[a.id] = true; });
    var shows = function (s) { return (s.layers || []).some(function (L) { return L.kind === 'image' && fam[L.asset]; }); }; var sc = S.plan.scenes || [];
    var hit = sc.filter(function (s, i) { return i > 0 && shows(s); })[0] || sc.filter(shows)[0] || sc[1] || sc[0]; return hit ? hit.id : '';
  }
  function load3D() {
    if (S.tdAvail !== undefined) return; S.tdAvail = null; var mine = S;
    api('/api/creative/premium/3d/availability').then(function (r) { if (S !== mine) return; S.tdAvail = r.ok && r.data && r.data.available ? r.data : false; build3D(); }).catch(function () { if (S === mine) S.tdAvail = false; });
  }
  function build3D() {
    var box = document.getElementById('cs3d'); if (!els.csEditor) return;
    if (S.plan && S.plan.v === 2 && S.tdAvail === undefined) load3D();
    var block = tdBlock(); var shown = block && (block.scenes || []).length; var job = S.tdJob; var sources = S.plan && S.plan.v === 2 ? tdSources() : [];
    var can = S.tdAvail && S.tdAvail.available;
    var freeOk = sources.some(function (a) { return tdCut(a.id); });
    if (!S.plan || S.plan.v !== 2 || !(shown || block || job || ((can || freeOk) && sources.length))) { if (box) box.remove(); return; }
    if (!box) { box = h('section', { id: 'cs3d', class: 'cs-3d', 'aria-live': 'polite' }); els.csEditor.insertBefore(box, els.csEditor.querySelector('.cs-tabs')); }
    var head = '<h3>Interactive 3D</h3>'; var note = S.tdNote ? '<p class="cs-3d-note" role="alert">' + esc(S.tdNote) + '</p>' : '';
    var html;
    if (job && !job.terminal) {
      var r0 = (job.roles || [])[0] || {};
      html = head + '<p><strong>' + esc(job.message) + '</strong></p><p class="cs-3d-phase" data-phase="' + esc(r0.phase || 'queued') + '">' + esc(TD_PHASE[r0.phase] || 'Working') + (r0.late ? ' (taking longer than usual)' : '') + '</p>'
        + '<p class="cs-hint">You can keep editing, or close this tab: the model keeps being made on our side and is added to the page when it is ready.</p>';
    } else if (shown) {
      var sc0 = block.scenes[0]; var a0 = block.assets.filter(function (a) { return a.id === sc0.assetId; })[0] || block.assets[0];
      html = head + '<p>This page shows a real 3D model' + (a0 && a0.title ? ' of <strong>' + esc(a0.title) + '</strong>' : '') + ' in “' + esc(tdSceneName(sc0.sectionId)) + '”. It turns as visitors scroll. Where 3D cannot run — reduced motion, an old device — they see your picture instead.</p>'
        + '<button type="button" class="cs-btn cs-ghost" id="cs3dRemove">Take the 3D model off the page</button>' + (cineModel() ? '<button type="button" class="cs-btn cs-ghost" id="cs3dCine">Make a cinematic video from it</button>' : '') + note;
    } else if (block) {
      html = head + '<p>You have a 3D model for this page. It is not shown at the moment.</p><button type="button" class="cs-btn" id="cs3dShow">Show it on the page</button>' + (cineModel() ? '<button type="button" class="cs-btn cs-ghost" id="cs3dCine">Make a cinematic video from it</button>' : '') + note;
    } else if (job && job.terminal && !job.completed) {
      html = head + '<p><strong>' + esc(job.message) + '</strong></p><button type="button" class="cs-btn cs-ghost" id="cs3dAgain">Try again</button>' + note;
    } else if (S.tdQuote) {
      var q = S.tdQuote.quote; var src = live().filter(function (a) { return a.id === S.tdQuote.sourceAssetId; })[0]; var n = q.credits; var bal = S.creditsRemaining;
      var short = typeof bal === 'number' && bal < n;
      html = head + '<div class="cs-3d-pick">' + (src ? '<figure><img src="' + esc(srcFor(src)) + '" alt=""></figure>' : '') + '<p><strong>This will use ' + n + ' credit' + (n === 1 ? '' : 's') + '</strong> — charged only if the model is made.' + (typeof bal === 'number' ? ' Your balance: ' + bal + '.' : '') + '</p></div>'
        + '<ul class="cs-3d-list"><li>A real 3D model of this picture, standing where the picture is in “' + esc(tdSceneName(S.tdQuote.sectionId)) + '”</li><li>Visitors turn it by scrolling</li><li>It is part of your website’s own files when you download them</li></ul>'
        + (short ? '<p class="cs-3d-note" role="alert">You need ' + (n - bal) + ' more credit' + (n - bal === 1 ? '' : 's') + ' for this.</p>' : '')
        + '<button type="button" class="cs-btn cs-primary" id="cs3dGo"' + (short || S.tdBusy ? ' disabled' : '') + '>' + (S.tdBusy ? 'Starting…' : 'Create the 3D model — ' + n + ' credit' + (n === 1 ? '' : 's')) + '</button><button type="button" class="cs-btn cs-ghost" id="cs3dCancel">Not now</button>' + note;
    } else {
      if (!S.tdSource || !sources.some(function (a) { return a.id === S.tdSource; })) S.tdSource = sources[0].id;
      html = head + '<p>Turn one of your uploaded product or object pictures into a real interactive 3D element.</p>'
        + '<div class="cs-3d-srcs" role="radiogroup" aria-label="Picture to turn into 3D">' + sources.map(function (a) { return '<button type="button" role="radio" aria-checked="' + (a.id === S.tdSource ? 'true' : 'false') + '" data-td-src="' + esc(a.id) + '" title="' + esc(a.title || 'Your upload') + '"><img src="' + esc(srcFor(a)) + '" alt="' + esc(a.alt || a.title || 'Your upload') + '"></button>'; }).join('') + '</div>'
        + '<p class="cs-hint">Works best with one clear object on a plain background. The model is made by AI from a single picture: sides the picture does not show are estimated, so it will not be a perfect copy.</p>'
        + (tdCut(S.tdSource) ? '<button type="button" class="cs-btn cs-primary" id="cs3dFree"' + (S.tdBusy ? ' disabled' : '') + '>' + (S.tdBusy ? 'Shaping it…' : 'Make 3D from this picture — free') + '</button><p class="cs-hint">Free for something round about its upright axis — a can, a bottle, a jar: shaped from your own picture, it turns as visitors scroll.</p>' : '')
        + (can ? '<button type="button" class="cs-btn" id="cs3dQuote"' + (S.tdBusy ? ' disabled' : '') + '>' + (S.tdBusy ? 'Working out the cost…' : 'See what it costs') + '</button>' : '') + note;
    }
    box.innerHTML = html;
    var on = function (id, fn) { var b = document.getElementById(id); if (b) b.addEventListener('click', fn); };
    [].forEach.call(box.querySelectorAll('[data-td-src]'), function (b) { b.addEventListener('click', function () { S.tdSource = b.getAttribute('data-td-src'); S.tdNote = ''; build3D(); }); });
    on('cs3dQuote', td3Quote); on('cs3dGo', td3Start); on('cs3dCine', cinematicFrom3D); on('cs3dFree', td3Free);
    on('cs3dCancel', function () { S.tdQuote = null; S.tdNote = ''; build3D(); });
    on('cs3dAgain', function () { S.tdJob = null; S.tdNote = ''; build3D(); });
    on('cs3dRemove', function () { S.threeD = C.threeD.normalise({ assets: S.threeD.assets, scenes: [] }, {}); refresh(); markDirty(); build3D(); });
    on('cs3dShow', function () { var a = S.threeD.assets[0]; td3Place(a, tdSectionFor(a.sourceAssetId), 'scroll-rotate'); refresh(); markDirty(); build3D(); });
  }
  // A CINEMATIC VIDEO FROM THE 3D MODEL: a premium clip is made with a generation (its mode, its one quote), so this opens
  // the generation setup again for this same page -- its pictures and its 3D model kept -- with the 3D source chosen. The
  // MODE stays the owner's: in base Creative the source is shown inactive until they choose a cinematic mode themselves
  // (Creative never uses Higgsfield). Nothing is made or charged until the owner creates; 'Back to the page' leaves
  // everything as it was.
  function cinematicFrom3D() {
    if (S.busy || !cineModel()) return; S.premiumSource = 'model3d';
    els.csBrief.value = S.brief || ''; els.csEditor.hidden = true; els.csBriefStep.hidden = false;
    var back = document.getElementById('csBackToPage'); if (back) back.hidden = !S.plan;
    renderThumbs(); renderPv(); priceSoon(0);
    setTimeout(function () { var pv = document.getElementById('csPv'); if (pv && pv.scrollIntoView) pv.scrollIntoView({ block: 'center' }); }, 30);
  }
  function backToPage() { if (!S.plan || S.busy) return; els.csBriefStep.hidden = true; els.csEditor.hidden = false; var back = document.getElementById('csBackToPage'); if (back) back.hidden = true; }
  // the model's scene: one stage, in one section, scroll-rotate (the one composition offered for now)
  function td3Place(asset, sectionId, composition) {
    var cur = tdBlock() || { assets: [], scenes: [] };
    var next = C.threeD.normalise({ assets: cur.assets.filter(function (a) { return a.id !== asset.id; }).concat([asset]), scenes: (cur.scenes || []).filter(function (s) { return s.sectionId !== sectionId; }).concat([{ id: 'td-' + sectionId, assetId: asset.id, sectionId: sectionId, composition: composition || 'scroll-rotate' }]) }, { sectionIds: (S.plan.scenes || []).map(function (s) { return s.id; }) });
    if (next) S.threeD = next; return !!next;
  }
  // QUOTE: the page is saved first (the server reads the picture from the saved project -- nothing is sent from here)
  function td3Quote() {
    if (!signedIn()) { needSignIn('Sign in to add a 3D model to your page.'); return; }
    if (S.tdBusy) return; S.tdBusy = true; S.tdNote = ''; build3D(); var mine = S;
    var saved = !S.projectId || S.dirty ? td3Save() : Promise.resolve(null);
    saved.then(function () {
      if (S !== mine) return null; if (!S.projectId || S.dirty) throw new Error('unsaved');
      return api('/api/creative/premium/3d/quote', { method: 'POST', body: { projectId: S.projectId, assetId: S.tdSource } });
    }).then(function (r) {
      if (S !== mine || !r) return; S.tdBusy = false; var d = r.data || {}; creditsFrom(d);
      if (r.ok && d.ok) S.tdQuote = d; else if (d.job) { S.tdJob = d.job; follow3D(d.job.jobId); } else S.tdNote = d.message || 'The cost could not be worked out. Please try again.';
      build3D();
    }).catch(function () { if (S !== mine) return; S.tdBusy = false; S.tdNote = 'Save the page to your account first, then try again.'; build3D(); });
  }
  // START: the quote is confirmed. Asking twice (a double click, a retry) returns the same job -- never a second model.
  function td3Start() {
    if (S.tdBusy || !S.tdQuote) return; S.tdBusy = true; S.tdNote = ''; build3D(); var mine = S; var quoteId = S.tdQuote.quote.id;
    var subject = (S.understanding && (S.understanding.subject || (S.understanding.identity && S.understanding.identity.name))) || '';
    var ask = function () { return api('/api/creative/premium/3d/start', { method: 'POST', body: { quoteId: quoteId, subject: subject } }); };
    var done = function (r) {
      if (S !== mine) return; var d = (r && r.data) || {}; creditsFrom(d);
      if (!r || (!r.ok && !r.status)) throw new Error('unreachable');
      S.tdBusy = false;
      if (d.job) { S.tdJob = d.job; S.tdQuote = null; build3D(); follow3D(d.job.jobId); return; }
      S.tdNote = d.message || 'The 3D model could not be started. Nothing was charged.'; if (d.reason === 'expired' || d.reason === 'price_changed' || d.reason === 'not_found') S.tdQuote = null; build3D();
    };
    ask().then(done).catch(function () { return new Promise(function (res) { setTimeout(res, 2500); }).then(ask).then(done); })
      .catch(function () { if (S !== mine) return; S.tdBusy = false; S.tdNote = 'The connection dropped. If the model was started it keeps being made — reopen this page to see it.'; build3D(); });
  }
  // follow the job to its outcome: a missed poll is a connection problem, never a failure of the model
  function follow3D(jobId) {
    if (!jobId || (S.tdFollow && S.tdFollow.jobId === jobId)) return; var me = { jobId: jobId, delay: 2000 }; S.tdFollow = me; var mine = S;
    var next = function () { if (S !== mine || S.tdFollow !== me) return; setTimeout(poll, me.delay); me.delay = Math.min(12000, Math.round(me.delay * 1.3)); };
    var poll = function () {
      if (S !== mine || S.tdFollow !== me) return;
      api('/api/creative/premium/status/' + encodeURIComponent(jobId)).then(function (r) {
        if (S !== mine) return;
        if (!r.ok || !r.data || !r.data.job) { if (r.status === 404) { S.tdFollow = null; S.tdJob = null; build3D(); return; } return next(); }
        var job = r.data.job; creditsFrom(r.data); S.tdJob = job; build3D();
        return attach3D(job).then(function () { if (job.terminal) { S.tdFollow = null; if (job.completed) S.tdJob = null; build3D(); } else next(); });
      }).catch(function () { next(); });
    };
    poll();
  }
  // the delivered model, once: its file comes from this account's own stored copy (never a provider's address), it gets its
  // scene, the page is previewed with it and saved
  function td3File(mediaId) {
    return fetch('/api/premium-media/' + encodeURIComponent(mediaId) + '/file', { credentials: 'same-origin' }).then(function (r) { if (!r.ok) throw new Error('file'); return r.blob(); })
      .then(function (b) { return new Promise(function (res, rej) { var fr = new FileReader(); fr.onload = function () { res('data:model/gltf-binary;base64,' + String(fr.result).split(',')[1]); }; fr.onerror = rej; fr.readAsDataURL(b); }); });
  }
  function attach3D(job) {
    S.tdQueue = (S.tdQueue || Promise.resolve()).then(function () {
      var mine = S; var have = {}; ((tdBlock() || {}).assets || []).forEach(function (a) { have[a.id] = true; });
      var m = (job.delivered || []).filter(function (x) { return x.kind === 'model3d' && x.threeD && x.threeD.id && !have[x.threeD.id]; })[0];
      if (!m || !S.plan) return;
      return td3File(m.premium.mediaId).then(function (dataUrl) {
        // (the model keeps the reference to the copy the job stored -- that is what the page saves; the bytes fetched here
        // are only this tab's preview of it)
        if (S !== mine) return; var asset = Object.assign({}, m.threeD, { dataUrl: dataUrl });
        var sec = (S.plan.scenes || []).some(function (s) { return s.id === m.sectionId; }) ? m.sectionId : tdSectionFor(m.sourceAssetId);
        if (!td3Place(asset, sec, m.composition)) { S.tdNote = 'The 3D model was made, but could not be placed on this page.'; return; }
        refresh(true); markDirty(); build3D();
        if (S.projectId) return td3Save().then(function (r) {
          // (only a page that was saved is published: a save that failed leaves the app on the version it already has)
          if (r && r.ok && r.data && r.data.ok) return publishPremiumRevision();
          S.tdNote = 'The 3D model is on the page, but the page could not be saved yet' + (r && r.data && r.data.message ? ' (' + r.data.message + ')' : '') + '. Save it to keep the model.'; build3D();
        });
      });
    }).catch(function () { /* the next poll, or reopening the page, tries again */ });
    return S.tdQueue;
  }
  // (a save already on its way is waited for, then the page WITH the model is saved)
  function td3Save(n) { if (S.saving && (n || 0) < 40) return new Promise(function (res) { setTimeout(res, 250); }).then(function () { return td3Save((n || 0) + 1); }); return Promise.resolve(save()); }
  // a reopened page: its 3D job is followed again, or the model that finished while the tab was closed is added now
  function resume3D(projectId) {
    var mine = S;
    api('/api/creative/premium/3d/for-project/' + encodeURIComponent(projectId)).then(function (r) {
      if (S !== mine || !r.ok || !r.data || !r.data.job) return; var job = r.data.job;
      if (!job.terminal) { S.tdJob = job; build3D(); follow3D(job.jobId); } else if (job.completed) attach3D(job);
    }).catch(function () { /* optional */ });
  }

  function proceedToDirection() {
    // one direction at a time: a second call (a repeated click at the gate) while one is being planned does nothing
    if (S.directing) return Promise.resolve();
    S.directing = true; S.gate = null; els.csChoices.innerHTML = ''; S.busy = true; els.csCreate.disabled = true;
    return planDirection('').then(function (res) {
      S.directing = false;
      if (res && res.stop) { step('direct', 'failed', res.stop); return fail(res.stop); }
      step('build', 'active'); refresh(true); step('build', 'done', visualNote());
      return runPremium().then(function () {
        S.busy = false; els.csCreate.disabled = false; S.name = S.name || pageTitle(); if (!S.projectId) { S.dirty = true; setSaveState('Not saved yet'); els.csSave.disabled = false; }
        els.csProgress.hidden = true; els.csEditor.hidden = false; buildEditor(); showBuy();
      });
    }, function (e) { S.directing = false; throw e; });
  }
  function preselect(review) {
    var ok = function (r) { return r.adoptable !== false && !r.watermarked; };
    var shape = function (r) { var a = (r.width || 1) / Math.max(1, r.height || 1); return a > 1.25 ? 'wide' : a < 0.8 ? 'tall' : 'square'; };
    var picked = [], kinds = [], sites = [];
    review.forEach(function (r, i) { if (picked.length || !ok(r)) return; picked.push(i); kinds.push(shape(r) + '|' + (r.framing || '')); sites.push(r.site || ''); });
    if (!picked.length) return picked;
    review.forEach(function (r, i) { var k = shape(r) + '|' + (r.framing || ''); if (picked.length >= 3 || picked.indexOf(i) >= 0 || !ok(r) || kinds.indexOf(k) >= 0) return; picked.push(i); kinds.push(k); sites.push(r.site || ''); });
    review.forEach(function (r, i) { if (picked.length >= 3 || picked.indexOf(i) >= 0 || !ok(r) || sites.indexOf(r.site || '') >= 0) return; picked.push(i); sites.push(r.site || ''); });
    return picked;
  }
  function showGate(g) {
    S.gate = g || {}; var u = S.understanding || {}; var name = (u.identity && u.identity.name) || u.subject || 'the subject';
    var cur = (S.research && S.research.curation) || {}; var review = (S.research && S.research.review) || []; var web = cur.web || {};
    var dg = (S.research && S.research.diagnostics) || null;
    var parts = []; if (web.ran) parts.push(web.provider === 'google-images' ? 'Google Images' : 'a web search');
    var sources = parts.join(' and ') || 'our picture sources';
    // the pick: the best picture the studio can fetch is pre-selected as the main picture; the owner decides
    // (real prompts: 15 usable pictures of the Opera House were found, 6 offered, and the page was built with one -- the
    // pre-selection now offers the main picture and up to two that add something different: another shape or framing,
    // else another source. Nothing changes about permission: the owner still builds only with what they confirm)
    if (!S.picked) S.picked = preselect(review);
    step('direct', 'wait', review.length ? 'Pick the pictures to build with (the page\'s price already includes this step)' : 'Waiting for your choice (the page\'s price already includes this step)');
    var h1 = S.gate.problem ? '<p><strong>' + esc(S.gate.problem) + '</strong></p>'
      : review.length ? '<p><strong>We found pictures of ' + esc(name) + ' on ' + esc(sources) + ', but their reuse rights could not be verified automatically.</strong> Pick the ones you have the right to use, or upload your own. The main picture leads the page.</p><p class="cs-hint">None of these states a free licence, so none is used without your choice. Whoever uses one is responsible for having the right to. Each picture is credited to its source on the page.</p>'
      : web.message && web.status && web.status !== 'nothing-found' && web.status !== 'used' ? '<p><strong>' + esc(web.message) + '</strong></p>'
      : '<p><strong>We couldn\'t find pictures of ' + esc(name) + ' through ' + esc(sources) + '.</strong></p>' + (cur.missing && cur.missing.length ? '<p class="cs-hint">Missing: ' + cur.missing.map(esc).join(' · ') + '</p>' : '') + (web.ran === false && web.reason ? '<p class="cs-hint">Picture search did not run: ' + esc(web.reason) + '</p>' : web.error ? '<p class="cs-hint">Picture search: ' + esc(web.error) + '</p>' : '');
    var checked = '';
    if (dg) {
      var wj = (dg.web && dg.web.candidates) || [];
      var n = function (list, fn) { return list.filter(fn).length; };
      var isForm = function (x) { return x.verdict && x.verdict.identity === 'form'; }, isFan = function (x) { return x.verdict && x.verdict.identity === 'exact' && x.verdict.origin === 'fan'; }, isIt = function (x) { return x.verdict && x.verdict.identity === 'exact' && (x.verdict.role === 'subject' || x.verdict.role === 'detail') && x.verdict.origin !== 'fan'; };
      checked = '<details class="cs-checked"><summary>What we checked</summary><ul>'
        + (dg.web && dg.web.ran !== false ? '<li>' + (dg.web.provider === 'serpapi' ? 'Google Images' + (dg.web.cached ? ' (saved results, no new search)' : '') + (dg.web.products ? ' (' + dg.web.products + ' shopping results skipped)' : '') : 'Web search') + ((dg.web.queries || []).length ? ' (“' + dg.web.queries.map(function (q) { return esc(String(q).replace(/\s-\S+/g, '')); }).join('”, “') + '”)' : '') + ': ' + wj.length + ' pictures looked at — ' + n(wj, isIt) + ' showing it, ' + n(wj, isFan) + ' fan-made and ' + n(wj, isForm) + ' real-world forms (cosplay, figures, merchandise) left out</li>' : '<li>Picture search did not run' + (dg.web && dg.web.reason ? ': ' + esc(dg.web.reason) : '') + '</li>')
        + (dg.web && dg.web.searchLog && dg.web.searchLog.length ? '<li>Searches: ' + dg.web.searchLog.map(function (q) { return esc(q.family) + (q.cached ? ' (saved)' : '') + ' — ' + q.results + ' results, ' + q.good + ' usable' + (q.weak ? ' (weak: ' + esc(q.why) + ')' : ''); }).join('; ') + (dg.web.stop ? ' · stopped: ' + esc(dg.web.stop) : '') + '</li>' : '')
        + (dg.web && dg.web.counts ? '<li>' + (function (c) { return c.uniqueResults + ' distinct results · ' + c.productsSkipped + ' shopping skipped · ' + c.visionJudged + ' looked at · ' + c.exactSubject + ' showing it (' + c.permissionFree + ' free, ' + c.permissionRestricted + ' rights reserved, ' + c.permissionUnclear + ' licence not stated) · ' + c.fanMade + ' fan-made · ' + c.formsCosplayMerch + ' cosplay/figures/merchandise · ' + c.logos + ' logos · ' + c.technicalFailures + ' could not be downloaded · ' + c.autoUsed + ' used automatically · ' + c.reviewOnly + ' for you to review'; })(dg.web.counts) + '</li>' : '')
        + (dg.note ? '<li>' + esc(dg.note) + '</li>' : '') + '</ul></details>';
    }
    var cards = review.map(function (r, i) {
      var at = S.picked.indexOf(i), can = r.adoptable !== false && !r.watermarked;
      return '<div class="cs-review' + (at >= 0 ? ' is-picked' : '') + '"><div class="cs-review-img">' + (r.preview ? '<img src="' + esc(r.preview) + '" alt="">' : '<span>No preview</span>') + '</div><div><strong>' + esc(r.depicts || r.title) + '</strong><small>' + esc(r.site || '') + ' · ' + esc(r.width + '×' + r.height) + ' · ' + ({ official: 'official material', unknown: 'origin not certain' }[r.origin] || 'official material') + '</small>'
        + '<small class="cs-perm">Licence: ' + (r.permission.status === 'restricted' ? 'rights reserved' + (r.permission.licence ? ' (' + esc(r.permission.licence) + ')' : '') : 'none stated') + '</small>'
        + '<a href="' + esc(r.pageUrl) + '" target="_blank" rel="noopener">Open its page ↗</a> '
        + (can ? '<span class="cs-pick-actions">' + (at === 0 ? '<span class="cs-main-badge">Main picture</span> ' : '') + '<button type="button" class="cs-btn cs-ghost" data-pick="' + i + '">' + (at >= 0 ? 'Remove' : 'Use this picture') + '</button>' + (at > 0 ? ' <button type="button" class="cs-btn cs-ghost" data-main="' + i + '">Make it the main picture</button>' : '') + '</span>'
          : r.watermarked ? '<small class="cs-perm">Watermarked' + (r.watermarked !== true ? ' (“' + esc(r.watermarked) + '”)' : '') + ': pick another picture.</small>' : '<small>This site does not let the studio download it: save it from its page and upload it.</small>') + '</div></div>';
    }).join('');
    var ok = usableSubject() && !S.gate.problem;
    var pickN = S.picked.length;
    els.csChoices.innerHTML = '<div class="cs-gate">' + h1 + cards
      + '<div class="cs-gate-actions">' + (pickN ? '<button type="button" class="cs-btn cs-primary" id="csGatePick">Build with ' + (pickN === 1 ? 'this picture' : 'these ' + pickN + ' pictures') + '</button>' : '')
      + (ok ? '<button type="button" class="cs-btn' + (pickN ? ' cs-ghost' : ' cs-primary') + '" id="csGateGo">Continue with the pictures I have</button>' : '') + '<button type="button" class="cs-btn" id="csGateUpload">Upload pictures</button>'
      + (S.refines < 2 ? '<span class="cs-refine"><input type="text" id="csGateQuery" maxlength="100" placeholder="Search again for… (e.g. ' + esc(name) + ' official art)"><button type="button" class="cs-btn cs-ghost" id="csGateSearch">Search again</button></span>' : '')
      + (S.gate.problem ? '' : '<button type="button" class="cs-btn cs-ghost" id="csGateAbstract">Continue with an abstract page instead</button>') + '</div>'
      + checked + '<p class="cs-hint">Your brief and research are kept whichever you choose.</p></div>';
    // one choice per gate: the buttons that start paid work lock the gate so a repeated click cannot start it twice
    var lock = function () { [].forEach.call(els.csChoices.querySelectorAll('.cs-gate button'), function (b) { b.disabled = true; }); };
    var pk = document.getElementById('csGatePick'); if (pk) pk.addEventListener('click', function () { if (S.busy) return; lock(); buildWithPicked(review); });
    var go = document.getElementById('csGateGo'); if (go) go.addEventListener('click', function () { if (S.busy) return; lock(); proceedToDirection(); });
    document.getElementById('csGateUpload').addEventListener('click', function () { S.gateUploadPending = true; els.csUpload.click(); });
    var ab = document.getElementById('csGateAbstract'); if (ab) ab.addEventListener('click', function () { if (S.busy) return; lock(); S.abstractChosen = true; proceedToDirection(); });
    var sb = document.getElementById('csGateSearch'); if (sb) sb.addEventListener('click', function () { var q = document.getElementById('csGateQuery').value.trim(); if (q && !S.busy) { lock(); S.picked = null; refineSearch(q); } });
    [].forEach.call(els.csChoices.querySelectorAll('[data-pick]'), function (b) { b.addEventListener('click', function () { var i = +b.getAttribute('data-pick'), at = S.picked.indexOf(i); if (at >= 0) S.picked.splice(at, 1); else if (S.picked.length < 4) S.picked.push(i); showGate(S.gate); }); });
    [].forEach.call(els.csChoices.querySelectorAll('[data-main]'), function (b) { b.addEventListener('click', function () { var i = +b.getAttribute('data-main'); S.picked = [i].concat(S.picked.filter(function (x) { return x !== i; })); showGate(S.gate); }); });
  }
  // the owner's pick: each picture is fetched by the server (only pictures it just offered), credited to its source page,
  // and recorded as chosen by the owner -- never as licensed; the first is the main picture; then the page is directed
  // the picks, checked at up to 1024 px for watermarks the thumbnails hid; a flagged one is taken back out and marked
  function checkWatermarks(got, chosen) {
    var picks = got.map(function (a, k) { return a ? { a: a, r: chosen[k] } : null; }).filter(Boolean); if (!picks.length) return Promise.resolve(false);
    step('direct', 'active', 'Checking the picture' + (picks.length > 1 ? 's' : '') + ' for watermarks…');
    return Promise.all(picks.map(function (p) { return loadImage(p.a.dataUrl).then(function (im) { var k = Math.min(1, 1024 / Math.max(im.naturalWidth, im.naturalHeight)); var cv = document.createElement('canvas'); cv.width = Math.max(1, Math.round(im.naturalWidth * k)); cv.height = Math.max(1, Math.round(im.naturalHeight * k)); var g = cv.getContext('2d'); g.fillStyle = '#808080'; g.fillRect(0, 0, cv.width, cv.height); g.drawImage(im, 0, 0, cv.width, cv.height); return { id: p.a.id, dataUrl: cv.toDataURL('image/jpeg', 0.85) }; }); }))
      .then(function (pictures) { return api('/api/creative/check-pictures', { method: 'POST', body: { pictures: pictures, jobId: S.jobId || '' } }); })
      .then(function (res) {
        if (!res.ok || !res.data || !res.data.ok) return false; // the check could not run: the owner's pick stands
        var bad = picks.filter(function (p) { var x = res.data.results[p.a.id]; return x && x.watermark; });
        if (!bad.length) return false;
        bad.forEach(function (p) { p.r.watermarked = res.data.results[p.a.id].text || true; S.assets = S.assets.filter(function (x) { return x.id !== p.a.id && x.cutoutOf !== p.a.id; }); });
        if (bad.some(function (p) { return p.a.id === S.mainAsset; })) S.mainAsset = null;
        // (real prompts: one of three confirmed pictures carried a title caption, and the whole build stopped -- the clean
        // pictures the owner confirmed go ahead; only when none is left does the owner pick again)
        var clean = picks.filter(function (p) { return bad.indexOf(p) < 0; });
        if (clean.length) {
          if (!S.mainAsset) S.mainAsset = clean[0].a.id;
          renderThumbs(); S.picked = null;
          step('direct', 'active', 'Left out ' + bad.length + ' picture' + (bad.length > 1 ? 's' : '') + ' carrying a watermark or caption (' + bad.map(function (p) { return '“' + (p.r.watermarked === true ? 'watermark' : p.r.watermarked) + '”'; }).join(', ') + '); building with the other' + (clean.length > 1 ? 's' : '') + '.');
          return false;
        }
        renderThumbs(); S.picked = null;
        els.csError.hidden = false; els.csError.textContent = 'The picture' + (bad.length > 1 ? 's' : '') + ' you picked ' + (bad.length > 1 ? 'carry' : 'carries') + ' a watermark (' + bad.map(function (p) { return '“' + (p.r.watermarked === true ? 'watermark' : p.r.watermarked) + '”'; }).join(', ') + '). Pick another picture.';
        showGate(S.gate); return true;
      }).catch(function () { return false; });
  }
  function buildWithPicked(review) {
    var chosen = S.picked.map(function (i) { return review[i]; }).filter(Boolean); if (!chosen.length) return Promise.resolve();
    step('direct', 'active', 'Fetching the picture' + (chosen.length > 1 ? 's' : '') + ' you picked…');
    var got = [];
    return chosen.reduce(function (p, r, k) {
      return p.then(function () {
        return api('/api/creative/fetch-image', { method: 'POST', body: { url: r.imageUrl } }).then(function (res) {
          if (!res.ok || !res.data.ok) { got.push(null); return; }
          var a = { id: 'p' + Date.now().toString(36) + k, origin: 'upload', ownerPicked: true, title: r.depicts || r.title, alt: r.depicts || '', author: r.site || '', relevance: 2, dataUrl: res.data.dataUrl, mime: res.data.mime, sourceUrl: r.imageUrl, pageUrl: r.pageUrl,
            curation: { role: r.role || 'subject', identity: r.identity || 'exact', depicts: r.depicts || '', origin: r.origin || 'unknown', issues: [] },
            rightsEvidence: ['chosen by the page owner from ' + r.pageUrl + '; no licence stated there'], ownerRole: got.filter(Boolean).length ? 'supporting' : 'main' };
          return processAsset(a).then(function (group) { S.assets = S.assets.concat(group); got.push(a); });
        });
      });
    }, Promise.resolve()).then(function () {
      return checkWatermarks(got, chosen);
    }).then(function (flagged) {
      if (flagged) return;
      // (the first picture fetched that is still in the project: one left out for a watermark is never the main picture)
      var first = got.filter(function (a) { return a && S.assets.some(function (x) { return x.id === a.id; }); })[0];
      if (!first) { els.csError.hidden = false; els.csError.textContent = 'None of the pictures you picked could be fetched. Save one from its page and upload it, or pick another.'; S.picked = null; showGate(S.gate); return; }
      S.mainAsset = first.id; renderThumbs(); S.picked = null;
      return proceedToDirection();
    });
  }
  // search again with the owner's words: the understanding is reused (no new understanding call)
  function refineSearch(q) {
    S.refines++; step('research', 'active', 'Searching again for “' + q + '”…'); els.csChoices.innerHTML = '';
    var uploads = S.assets.filter(function (a) { return a.origin === 'upload' && !a.removed; });
    return api('/api/creative/research', { method: 'POST', body: { brief: S.brief, supplied: S.suppliedText, refine: q, understanding: S.understanding, hasUploads: uploads.length, jobId: S.jobId || '' } }).then(function (r) {
      creditsFrom(r.data);
      if (!r.ok || !r.data.ok) { step('research', 'failed', (r.data && r.data.message) || 'The search failed.'); showGate(S.gate); return; }
      var d = r.data; if (d.research.log) { S.cost.researchRequests += d.research.log.requests || 0; S.cost.researchBytes += d.research.log.bytes || 0; }
      var keepFacts = S.research && S.research.facts; S.research = d.research; if ((!S.research.facts || !S.research.facts.length) && keepFacts) S.research.facts = keepFacts;
      var research = (d.images || []).map(function (i) { return { id: i.id + 's' + S.refines, origin: 'research', title: i.title, description: i.description, alt: cleanAlt(i), author: i.author, license: i.license, licenseUrl: i.licenseUrl, pageUrl: i.pageUrl, sourceUrl: i.sourceUrl, found: i.found, relevance: i.relevance, retrieved: i.retrieved, mime: i.mime, dataUrl: i.dataUrl, kind: i.kind || '', curation: i.curation || null, rightsEvidence: i.rightsEvidence }; });
      S.assets = S.assets.filter(function (a) { return a.origin === 'upload' || (a.origin === 'derived' && S.assets.some(function (b) { return b.id === a.cutoutOf && b.origin === 'upload'; })); });
      step('research', 'done', research.length + ' pictures found in the new search');
      return Promise.all(research.map(processAsset)).then(function (groups) { groups.forEach(function (g) { S.assets = S.assets.concat(g); }); return afterPictures(); });
    });
  }
  function describeUnderstanding(u) {
    if (!u) return '';
    if (u.identity && u.identity.what) return u.identity.name + ' — ' + u.identity.what;
    return u.kind === 'personal' ? 'A personal page about ' + (u.name || 'your ' + u.noun) : (u.kind === 'fictional' || u.kind === 'invented') ? 'An invented subject' : u.subject ? '“' + u.subject + '”' : '';
  }
  function pageTitle() { return S.plan.v === 2 ? (S.plan.scenes[0] && S.plan.scenes[0].text.heading) || S.plan.identity.name : S.plan.hero.title.text; }

  // ---------- the AI director (server), with the built-in director as an explicit, labelled fallback ----------
  // the built-in director reads the rules-style understanding; an AI understanding is mapped onto it
  var TONE_MAP = { extravagant: 'absurd', cinematic: 'cinematic', playful: 'playful', absurd: 'absurd', tender: 'tender', restrained: 'editorial', lyrical: 'lyrical', editorial: 'editorial', retro: 'retro', serious: 'editorial', reverent: 'lyrical' };
  function legacyU() {
    var u = S.understanding || {}; if (u.source !== 'ai') return u;
    var local = C.understand.understandBrief(S.brief, { supplied: S.suppliedText, uploads: S.assets.filter(function (a) { return a.origin === 'upload' && !a.removed; }).length });
    return Object.assign({}, local, { kind: u.kind === 'invented' ? 'fictional' : u.kind === 'ambiguous' ? 'recognizable' : u.kind, subject: u.subject || local.subject, name: u.name || local.name, species: u.species || local.species, noun: u.noun || local.noun, query: u.query, tone: TONE_MAP[u.tone && u.tone.register] || local.tone, brief: S.brief });
  }
  function inventory() {
    // (the owner's roles travel with the pictures: which one is the logo, which the main picture, which were picked from the
    // web rather than owned -- the pool, the logo and the premium permission gate depend on them)
    return live().map(function (a) { return { id: a.id, origin: a.origin, title: a.title, description: a.description, alt: a.alt, author: a.author, license: a.license, licenseUrl: a.licenseUrl, pageUrl: a.pageUrl, sourceUrl: a.sourceUrl, found: a.found, relevance: a.relevance, assess: a.assess, caps: a.caps, cutout: a.cutout, cutoutOf: a.cutoutOf, illustration: a.illustration, mime: a.mime, kind: a.kind, curation: a.curation, ownerRole: a.ownerRole, ownerPicked: a.ownerPicked, ownerAffirmed: a.ownerAffirmed, rightsEvidence: a.rightsEvidence, premium: a.premium, video: a.video, quality: a.quality }; });
  }
  // small thumbnails so the director can SEE what each picture depicts (transparent cutouts shown on grey)
  function thumbnails() {
    var order = live().slice().sort(function (a, b) { var s = function (x) { return (x.origin === 'upload' ? 4 : 0) + (x.cutout ? 2 : 0) + (x.relevance || 0); }; return s(b) - s(a); }).slice(0, 10);
    return Promise.all(order.map(function (a) {
      return loadImage(a.dataUrl).then(function (im) {
        var k = Math.min(1, 320 / Math.max(im.naturalWidth, im.naturalHeight)); var cv = document.createElement('canvas'); cv.width = Math.max(1, Math.round(im.naturalWidth * k)); cv.height = Math.max(1, Math.round(im.naturalHeight * k));
        var ctx = cv.getContext('2d'); ctx.fillStyle = '#808080'; ctx.fillRect(0, 0, cv.width, cv.height); ctx.drawImage(im, 0, 0, cv.width, cv.height);
        return { id: a.id, dataUrl: cv.toDataURL('image/jpeg', 0.72) };
      }).catch(function () { return null; });
    })).then(function (list) { return list.filter(Boolean); });
  }
  function ctx2() { var sp = supplied(); return { spatial: S.spatialOn ? 'on' : '', models: modelMeta(), page: (S.research && S.research.page) || null, mainAsset: null, assets: live(), facts: (S.research && S.research.facts) || (S.plan && S.plan.facts) || [], understanding: legacyU(), supplied: sp.facts.concat(sp.memories) }; }
  // the main picture's own colours, for the palette: the owner's main picture, else the best picture of the subject
  function pictureColours() {
    var pick = (S.mainAsset && S.assets.find(function (x) { return x.id === S.mainAsset && !x.removed && !x.failed; })) || live().filter(function (a) { return !a.cutoutOf; }).sort(function (a, b) { var s = function (x) { var k = x.curation; return (x.origin === 'upload' ? 4 : 0) + (k && k.role === 'subject' ? 2 : 0) + (x.relevance || 0); }; return s(b) - s(a); })[0];
    var a = pick && pick.assess; if (!a) return null;
    return { background: a.background && a.background.colour || '', plainBackground: !!(a.background && a.background.uniformity >= 0.8), colours: (a.colours || []).slice(0, 6) };
  }
  function liveMain() { var a = S.mainAsset && S.assets.find(function (x) { return x.id === S.mainAsset && !x.removed && !x.failed; }); return a ? a.id : null; }
  function planDirection(avoid, quoteId) {
    step('direct', 'active', 'The AI director is composing the page…'); var t0 = Date.now();
    return thumbnails().then(function (th) {
      var research = S.research || {};
      return api('/api/creative/plan', { method: 'POST', body: { jobId: S.jobId || '', brief: S.brief, understanding: S.understanding, page: research.page, facts: research.facts || [], supplied: supplied(), assets: inventory(), models: modelMeta(), thumbnails: th, avoid: avoid || '', quoteId: quoteId || '', avoidRecipe: avoid && S.plan && S.plan.art ? S.plan.art.recipe : '', recipes: recentRecipes(), asks: S.asks || null, seed: String(Date.now()), coverage: research.curation || null, mainAsset: liveMain(), abstractChosen: !!S.abstractChosen, pictureColours: pictureColours(), cinematicSource: cineSource() === 'model3d' ? { kind: 'model3d', sourceAssetId: cineModel().sourceAssetId } : undefined } });
    }).then(function (r) {
      if (r.status === 401) throw new Error('signed out');
      var d = r.data || {};
      creditsFrom(d); if (typeof d.spatial === 'boolean') S.spatialOn = d.spatial;
      // not enough credits, or no page job: nothing was spent, and the page is not swapped for a free layout
      if (d.creditsExceeded || d.needsJob || d.inProgress) return { stop: d.message || d.reason || 'This direction could not start.' };
      if (d.needsConfirmation && d.quote) return { stop: d.quote.message + ' Nothing was spent -- try again to confirm it.' };
      // (what this account made recently, so a built-in page steers away from it too)
      if (Array.isArray(d.recentRecipes)) S.recentRecipes = d.recentRecipes.filter(function (x) { return typeof x === 'string'; }).slice(0, 10);
      if (r.ok && d.ok && d.plan) rememberJob(true);
      if (r.ok && d.ok && d.plan) {
        var v = C.validate2.validatePlan2(d.plan, Object.assign(ctx2(), { mode: 'safety' })); var plan = v.plan; // accepted by the server: kept as composed if (S.fixture) plan.fixture = S.fixture;
        // the server and the studio both validate: each note once
        var uniq = function (xs) { return xs.filter(function (x, i) { return xs.indexOf(x) === i; }); };
        S.plan = plan; S.lastFixes = uniq((d.fixes || []).concat(v.fixes)); S.lastWarnings = uniq((d.warnings || []).concat(v.warnings)); S.visualPlan = d.visualPlan || null;
        S.planMeta = { source: plan.direction.source === 'mock' ? 'mock' : 'ai', model: plan.direction.model, at: plan.direction.at, usdEstimated: (d.meta && d.meta.usdEstimated) || 0, ms: (d.meta && d.meta.ms) || (Date.now() - t0), attempts: (d.meta && d.meta.attempts && d.meta.attempts.length) || 1, repaired: !!plan.direction.repaired,
          // what the one repair was for (this session only; not saved)
          repairFor: ((d.meta && d.meta.attempts) || []).filter(function (a) { return a.errors && a.errors.length; }).slice(0, 1).map(function (a) { return a.errors.slice(0, 4).map(function (e) { return String(e).slice(0, 160); }); })[0] || [] };
        S.cost.aiUsdEstimated = (S.cost.aiUsdEstimated || 0) + S.planMeta.usdEstimated; S.cost.aiCalls = (S.cost.aiCalls || 0) + modelCalls(d.meta, S.planMeta.attempts);
        step('direct', 'done', (S.planMeta.source === 'mock' ? 'MOCKED plan · ' : 'AI direction · ') + (plan.concept.title ? plan.concept.title + ' — ' : '') + plan.concept.logline + ' (' + (S.planMeta.ms / 1000).toFixed(1) + 's' + (S.planMeta.repaired ? ', repaired once' : '') + ')');
        return;
      }
      useFallback(d.reason || 'the AI director did not answer', d.meta, Date.now() - t0);
    }).catch(function (e) { useFallback('the AI director could not be reached (' + (e && e.message || e) + ')', null, Date.now() - t0); });
  }
  // model calls behind a direction: each attempt, plus the claim check that ran on it
  function modelCalls(meta, fallback) { var a = (meta && meta.attempts) || []; return a.length ? a.length + a.filter(function (x) { return x.claims && !x.claims.error; }).length : fallback; }
  // the model calls that were made (and paid for) before falling back are still recorded
  function useFallback(reason, meta, ms) {
    var tries = (meta && meta.attempts) || [];
    direct(); S.planMeta = { source: 'fallback', reason: reason, at: new Date().toISOString(), model: (tries[0] && tries[0].model) || '', usdEstimated: (meta && meta.usdEstimated) || 0, ms: (meta && meta.ms) || ms || 0, attempts: tries.length, repaired: false };
    if (tries.length) { S.cost.aiUsdEstimated = (S.cost.aiUsdEstimated || 0) + S.planMeta.usdEstimated; S.cost.aiCalls = (S.cost.aiCalls || 0) + modelCalls(meta, tries.length); }
    step('direct', 'wait', 'Built-in layout, not AI direction: ' + reason);
  }
  function rememberDirection() {
    if (!S.plan) return; var c = S.plan.v === 2 ? S.plan.concept : { title: '', logline: S.plan.concept.line };
    S.history = (S.history || []).concat([{ title: c.title || '', logline: c.logline || '', source: (S.planMeta && S.planMeta.source) || 'rules', at: new Date().toISOString(), recipe: (S.plan.art && S.plan.art.recipe) || undefined }]).slice(-6);
    S.previous = { plan: S.plan, planMeta: S.planMeta };
  }
  function anotherDirection() {
    if (S.busy || !S.plan) return Promise.resolve();
    return confirmQuote('creative_direction', S.dirty ? 'Try another direction? The current layout is kept so you can go back, but text edits made to it stay with it.' : 'Try another direction?').then(function (quoteId) { if (quoteId) return anotherDirectionConfirmed(quoteId); });
  }
  function anotherDirectionConfirmed(quoteId) {
    var avoid = S.plan.v === 2 ? (S.plan.concept.title + ': ' + S.plan.concept.logline + ' | scenes: ' + S.plan.scenes.map(function (s) { return s.name || s.purpose; }).join(' / ')) : S.plan.concept.line;
    rememberDirection(); S.busy = true; els.csProgress.hidden = false; steps([['direct', 'Directing the page again, differently'], ['build', 'Building the page']]);
    return planDirection((S.history || []).map(function (h) { return h.title + ': ' + h.logline; }).slice(-3).concat([avoid]).join(' || '), quoteId).then(function (res) {
      if (res && res.stop) { S.plan = S.previous.plan; S.planMeta = S.previous.planMeta; S.previous = null; S.history.pop(); S.busy = false; step('direct', 'failed', res.stop); els.csError.hidden = false; els.csError.textContent = res.stop; buildEditor(); return; }
      refresh(true); step('build', 'done'); S.busy = false; els.csProgress.hidden = true; S.name = pageTitle(); markDirty(); buildEditor();
    });
  }
  function previousDirection() {
    if (!S.previous) return; var cur = { plan: S.plan, planMeta: S.planMeta };
    S.plan = S.previous.plan; S.planMeta = S.previous.planMeta; S.previous = cur; refresh(true); markDirty(); buildEditor();
  }
  function cleanAlt(i) { var t = String(i.description || '').trim(); if (t.length > 8 && t.length < 200) return t; return C.render.cleanTitle(i.title); }
  function askChoice(options, question) {
    S.busy = false; els.csCreate.disabled = false;
    els.csChoices.innerHTML = '<p>' + esc(question || 'Which one did you mean?') + '</p>' + options.map(function (o, i) { return '<button type="button" class="cs-choice" data-i="' + i + '"><strong>' + esc(o.title) + '</strong><small>' + esc(o.description || '') + '</small></button>'; }).join('') + '<button type="button" class="cs-btn cs-ghost" id="csChoiceBack">Change the description</button>';
    [].forEach.call(els.csChoices.querySelectorAll('.cs-choice'), function (b) { b.addEventListener('click', function () { var o = options[+b.getAttribute('data-i')]; create(o.wikipediaTitle || o.title); }); });
    document.getElementById('csChoiceBack').addEventListener('click', function () { els.csProgress.hidden = true; els.csBriefStep.hidden = false; });
  }
  function supplied() { return { facts: lines(S.suppliedText).slice(0, 12), memories: lines(S.memoriesText).slice(0, 8) }; }
  // the built-in director (no AI, or the AI could not answer): an art-directed page all the same -- the same recipe
  // chooser as the AI path picks its motion, scroll and scene architecture, away from this account's recent recipes
  function recentRecipes() { return (S.history || []).map(function (h) { return h.recipe; }).filter(Boolean).concat(S.recentRecipes || []).slice(-10); }
  function direct() {
    var u = legacyU(); var research = S.research || {}; var ai = S.understanding && S.understanding.source === 'ai' ? S.understanding : null;
    var und = Object.assign({}, u, ai ? { tone: ai.tone || u.tone, motifs: ai.motifs, identity: ai.identity, kind: ai.kind === 'invented' ? 'invented' : u.kind } : {});
    var res = C.director2.direct({ understanding: und, research: { page: research.page, facts: research.facts || [] }, assets: live(), supplied: supplied(), seed: String(Date.now()), history: recentRecipes(), avoid: S.plan && S.plan.art ? S.plan.art.recipe : '', mainAsset: liveMain() });
    if (S.fixture) res.plan.fixture = S.fixture;
    var v = C.validate2.validatePlan2(res.plan, Object.assign(ctx2(), { art: res.recipe, mainAsset: liveMain() }));
    S.plan = v.plan; S.lastFixes = v.fixes; S.lastWarnings = v.warnings;
  }
  function live() { return S.assets.filter(function (a) { return !a.removed && !a.failed; }); }
  // edits, picture swaps and reopening keep the accepted layout (safety checks only); recompose is the owner's explicit choice
  function settle(plan, mode, recompose) { var v = plan.v === 2 ? C.validate2.validatePlan2(plan, Object.assign(ctx2(), { mode: mode || 'safety', recompose: recompose || null })) : C.validate.validatePlan(plan, live()); S.lastFixes = v.fixes; S.lastWarnings = v.warnings; return v.plan; }

  // ---------- preview ----------
  function srcFor(a) {
    if (!a || !a.dataUrl) return '';
    if (blobUrls[a.id] && blobUrls[a.id].d === a.dataUrl) return blobUrls[a.id].u;
    try {
      var i = a.dataUrl.indexOf(','); var bin = atob(a.dataUrl.slice(i + 1)); var arr = new Uint8Array(bin.length); for (var k = 0; k < bin.length; k++) arr[k] = bin.charCodeAt(k);
      var u = URL.createObjectURL(new Blob([arr], { type: a.mime || a.dataUrl.slice(5, a.dataUrl.indexOf(';')) }));
      blobUrls[a.id] = { d: a.dataUrl, u: u }; return u;
    } catch (e) { return a.dataUrl; }
  }
  function refresh(first) {
    var html = S.plan.v === 2 ? C.render2.renderCreative2(S.plan, (S.models || []).length ? live().concat(S.models) : live(), { mode: 'preview', src: srcFor, motion: S.previewMotion, threeD: S.threeD || undefined }) : C.render.renderCreative(S.plan, live(), { mode: 'preview', src: srcFor, motion: S.previewMotion });
    var y = 0; try { y = first ? 0 : frame.contentWindow.scrollY; } catch (e) { y = 0; }
    frame.onload = function () { try { if (y) frame.contentWindow.scrollTo(0, y); } catch (e) { /* ignore */ } };
    frame.srcdoc = html; S.lastHtml = html;
    els.csEmpty.hidden = true; els.csViewport.hidden = false; fit();
  }
  function narrowScreen() { try { return window.matchMedia('(max-width:860px)').matches; } catch (e) { return false; } }
  function fit() {
    [].forEach.call(root.querySelectorAll('[data-device]'), function (x) { x.setAttribute('aria-pressed', String(x.getAttribute('data-device') === S.device)); });
    if (!frame || els.csViewport.hidden) return;
    var stage = els.csStage.getBoundingClientRect(); var phone = S.device === 'phone';
    var W = phone ? 390 : 1440, H = phone ? 844 : 900; var k = Math.min((stage.width - 32) / W, (stage.height - 32) / H, 1);
    frame.style.width = W + 'px'; frame.style.height = H + 'px'; frame.style.transform = 'scale(' + k.toFixed(4) + ')';
    els.csViewport.style.width = Math.round(W * k) + 'px'; els.csViewport.style.height = Math.round(H * k) + 'px';
    els.csViewport.setAttribute('data-device', S.device);
  }
  function post(msg) { try { frame.contentWindow.postMessage(msg, '*'); } catch (e) { /* not ready */ } }

  // ---------- editor ----------
  function getPath(o, path) { return path.split('.').reduce(function (x, k) { return x == null ? x : x[/^\d+$/.test(k) ? +k : k]; }, o); }
  function setPath(o, path, v) { var ks = path.split('.'); var last = ks.pop(); var t = ks.reduce(function (x, k) { return x[/^\d+$/.test(k) ? +k : k]; }, o); t[/^\d+$/.test(last) ? +last : last] = v; }
  var TYPE_NAMES = { statement: 'Opening statement', specimen: 'Up close', dossier: 'The file', plate: 'Picture', facts: 'Facts', timeline: 'History', gallery: 'Pictures', ode: 'Ode (imagined)', story: 'Story (imagined)', closing: 'Closing line', about: 'About', memories: 'Memories', aside: 'General facts', ask: 'Your details (studio only)', sources: 'Sources' };
  function fieldsFor(plan) {
    var f = [['Hero', [['hero.title.kicker', 'Small line above'], ['hero.title.text', 'Title'], ['hero.title.tagline', 'Tagline (imagined)'], ['hero.title.lede', 'Introduction']]]];
    plan.sections.forEach(function (s, i) {
      if (s.type === 'sources') return; var k = 'sections.' + i; var list = [];
      if (s.eyebrow != null) list.push([k + '.eyebrow', 'Label']);
      if (s.title != null) list.push([k + '.title', s.type === 'statement' ? 'Statement' : s.type === 'closing' ? 'Closing line' : 'Heading']);
      if (s.body != null) list.push([k + '.body', 'Text']); if (s.note != null) list.push([k + '.note', 'Note']);
      (s.paragraphs || []).forEach(function (p, j) { list.push([k + '.paragraphs.' + j, 'Paragraph ' + (j + 1)]); });
      (s.items || []).forEach(function (it, j) { list.push([k + '.items.' + j + '.text', (it.kind === 'sourced' ? 'Fact ' : it.kind === 'supplied' ? 'Your line ' : 'Line ') + (j + 1)]); });
      if (list.length) f.push([TYPE_NAMES[s.type] || s.type, list]);
    });
    return f;
  }
  function fieldsFor2(plan) {
    return plan.scenes.map(function (s, i) {
      var k = 'scenes.' + i + '.text.'; var list = [];
      if (s.text.kicker || i === 0) list.push([k + 'kicker', 'Small line above']);
      if (s.text.heading || i === 0) list.push([k + 'heading', i === 0 ? 'Title' : 'Heading']);
      if (s.text.body) list.push([k + 'body', s.text.kind === 'sourced' ? 'Text (from the source)' : s.text.kind === 'supplied' ? 'Text (your words)' : 'Text (imagined)']);
      s.text.items.forEach(function (it, j) { if (it.label) list.push([k + 'items.' + j + '.label', 'Label ' + (j + 1)]); list.push([k + 'items.' + j + '.text', (it.kind === 'sourced' ? 'Fact ' : it.kind === 'supplied' ? 'Your line ' : 'Line ') + (j + 1)]); });
      return [(i === 0 ? 'Opening scene' : 'Scene ' + (i + 1)) + (s.name ? ' — ' + s.name : ''), list];
    }).filter(function (g) { return g[1].length; });
  }
  // what the direction is, where it came from, what it cost, and what it wanted but could not have
  // where this page's pictures came from (the sources that actually ran), for the studio's wording
  function pictureSources() {
    var r = S.research || {}; var cur = r.curation || {}; var parts = [];
    // (pictures come from Google Images or the owner -- the encyclopedia is for facts only)
    if (cur.web && cur.web.ran) parts.push(cur.web.provider === 'google-images' ? 'Google Images' : 'a web search');
    parts.push('your uploads'); return parts.join(', ');
  }
  function directionPanel() {
    var m = S.planMeta || { source: 'rules' }; var p = S.plan; var u = S.understanding || {};
    var badge = m.source === 'ai' ? '<span class="cs-src is-ai">AI direction</span>' : m.source === 'mock' ? '<span class="cs-src is-mock">MOCKED plan (test provider)</span>' : '<span class="cs-src is-fallback">Built-in layout — not AI direction</span>';
    var head = p.v === 2 ? '<strong>' + esc(p.concept.title || 'Untitled concept') + '</strong><p>' + esc(p.concept.logline) + '</p>' + (p.concept.why ? '<p class="cs-hint">' + esc(p.concept.why) + '</p>' : '') : '<p>' + esc(p.concept.line) + '</p>';
    var meta = m.source === 'ai' || m.source === 'mock' ? '<p class="cs-hint">' + esc(m.model || '') + ' · ' + ((m.ms || 0) / 1000).toFixed(1) + ' s · ' + (m.attempts || 1) + ' call' + ((m.attempts || 1) > 1 ? 's (one repair)' : '') + ' · about $' + (m.usdEstimated || 0).toFixed(3) + ' (estimated)</p>' : '<p class="cs-hint">Why: ' + esc(m.reason || 'AI direction is not available here') + '</p>';
    var ident = u.identity ? '<p class="cs-hint">Understood as: <strong>' + esc(u.identity.name) + '</strong> — ' + esc(u.identity.what || u.identity.kind) + (u.tone && u.tone.register ? ' · tone: ' + esc(u.tone.register) : '') + (u.motifs && u.motifs.length ? ' · motifs: ' + esc(u.motifs.slice(0, 5).join(', ')) : '') + '</p>' + (u.uncertainty && u.uncertainty.length ? '<p class="cs-hint">Uncertain: ' + esc(u.uncertainty.join(' · ')) + '</p>' : '') : '';
    var missing = p.v === 2 ? p.wants.filter(function (w) { return w.status === 'missing'; }) : [];
    var wants = missing.length ? '<div class="cs-wants"><p><strong>Pictures the direction wanted but we couldn\'t find among the usable ones (' + pictureSources() + '):</strong></p><ul>' + missing.map(function (w) { return '<li>' + esc(w.description) + (w.fallback ? ' <small>— instead: ' + esc(w.fallback) + '</small>' : '') + '</li>'; }).join('') + '</ul><button type="button" class="cs-btn cs-ghost" data-upload>Upload a picture</button></div>' : '';
    // the subject's imagery: degraded is said out loud, with the one picture that would fix it
    var im = p.v === 2 && p.imagery; var imagery = '';
    if (im && im.degraded) imagery = '<div class="cs-degraded"><p><strong>Degraded: ' + esc(im.note || 'the subject itself is not shown') + '.</strong></p>' + (im.missing && im.missing.length ? '<p>Missing: ' + im.missing.map(esc).join(' · ') + '</p>' : '') + '<p class="cs-hint">No free-licence picture of it was found. Upload one (your own, or one you have the rights to) and the page will use it.</p><button type="button" class="cs-btn" data-upload>Upload the missing picture</button></div>';
    else if (im && im.status === 'form') imagery = '<p class="cs-hint">Shown through a real-world form: ' + esc(im.note || '') + '</p>';
    var cur = S.research && S.research.curation;
    var dgw = S.research && S.research.diagnostics && S.research.diagnostics.web;
    var check = cur && cur.web && cur.web.ran && dgw && dgw.candidates ? '<p class="cs-hint">Picture check: ' + dgw.candidates.length + ' ' + (cur.web.provider === 'google-images' ? 'Google Images results' : 'found pictures') + ' looked at' + (cur.web.usd ? ', about $' + Number(cur.web.usd).toFixed(3) : '') + ' · fan art, cosplay, merchandise and watermarked pictures left out</p>'
      : cur ? '<p class="cs-hint">Picture check: ' + (cur.source === 'ai' ? 'the subject is ' + ({ strong: 'well covered', partial: 'only partly covered', none: 'not covered' }[cur.coverage] || 'unknown') + ' (' + (cur.judged || 0) + ' of ' + (cur.of || 0) + ' candidates looked at' + (cur.usd ? ', about $' + Number(cur.usd).toFixed(3) : '') + ')' : 'keyword ranking only — ' + esc(cur.reason || 'no picture check')) + '</p>' : '';
    var cl = p.v === 2 && p.claims; var claims = '';
    if (cl) claims = cl.status === 'verified' ? '<p class="cs-hint">Words checked against the facts: every line (' + cl.checked + ')' + (cl.removed ? ' · ' + cl.removed + ' unsupported line(s) taken out' : '') + '</p>' : cl.status === 'partial' ? '<p class="cs-warn">Words only partly checked: ' + cl.checked + ' of ' + cl.of + ' lines; the rest were taken out.</p>' : cl.status === 'unchecked' ? '<p class="cs-warn">The words could NOT be checked against the facts; invented paragraphs were left out.</p>' : '<p class="cs-hint">Claim check off.</p>';
    var old = p.v === 2 && p.layout && p.layout.version < C.validate2.LAYOUT_VERSION ? '<p class="cs-hint">This page was composed under older layout rules and stays exactly as saved. <button type="button" class="cs-btn cs-ghost" id="csRecompose">Re-apply today\'s layout rules</button></p>' : '';
    var lim = p.v === 2 && p.limitations.length ? '<details><summary>Limitations noted by the director (' + p.limitations.length + ')</summary><ul>' + p.limitations.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul></details>' : '';
    var hist = (S.history || []).length ? '<details><summary>Earlier directions (' + S.history.length + ')</summary><ul>' + S.history.map(function (h) { return '<li>' + esc(h.title ? h.title + ': ' : '') + esc(h.logline) + ' <small>(' + esc(h.source) + ')</small></li>'; }).join('') + '</ul></details>' : '';
    var pst = S.premiumResult || S.premium; var prem = pst ? '<p class="cs-premium-status" data-planned="' + (pst.planned ? 'yes' : 'no') + '" data-made="' + (pst.made && pst.made.length ? 'yes' : 'no') + '"><strong>' + esc(premiumHeadline(pst)) + '</strong></p>' : '';
    return '<div class="cs-direction">' + badge + head + meta + ident + prem + imagery + check + claims + wants + old + lim + hist + '<div class="cs-dir-actions"><button type="button" class="cs-btn" id="csAnother">Try another direction (priced before it runs)</button>' + (S.previous ? '<button type="button" class="cs-btn cs-ghost" id="csPrevious">Back to the previous one</button>' : '') + '</div></div>';
  }
  function buildEditor() {
    showFixture();
    var u = S.understanding || {}; var asks = [];
    if (u.kind === 'personal') {
      if (!S.assets.some(function (a) { return a.origin === 'upload' && !a.removed; })) asks.push('Add a photo of ' + (u.name || 'your ' + (u.noun || 'subject')) + ' — the page never uses other pictures for them.');
      if (!lines(S.suppliedText).length) asks.push('Add a few true details about ' + (u.name || 'them') + ' under “Your own details”, then create the page again.');
    }
    (S.lastWarnings || []).forEach(function (w) { asks.push(w); });
    els.csAsks.hidden = !asks.length; els.csAsks.innerHTML = asks.map(function (a) { return '<p>' + esc(a) + '</p>'; }).join('');
    var dp = document.getElementById('csDirection'); if (!dp) { dp = h('div', { id: 'csDirection' }); els.csEditor.insertBefore(dp, els.csEditor.firstChild); }
    dp.innerHTML = directionPanel();
    document.getElementById('csAnother').addEventListener('click', function () { anotherDirection(); });
    if (document.getElementById('csPrevious')) document.getElementById('csPrevious').addEventListener('click', previousDirection);
    [].forEach.call(dp.querySelectorAll('[data-upload]'), function (b) { b.addEventListener('click', function () { els.csUpload.click(); }); });
    if (document.getElementById('csRecompose')) document.getElementById('csRecompose').addEventListener('click', function () { S.plan = settle(S.plan, 'accept'); refresh(); buildEditor(); markDirty(); });
    // words
    var words = root.querySelector('[data-panel="words"]');
    words.innerHTML = '<p class="cs-hint">Edits show on the page as you type (the design stays as it is). A fact you rewrite becomes your own words and loses its source mark.</p>' + (S.plan.v === 2 ? fieldsFor2(S.plan) : fieldsFor(S.plan)).map(function (g) {
      return '<fieldset><legend>' + esc(g[0]) + '</legend>' + g[1].map(function (f) { var v = getPath(S.plan, f[0]); return '<label>' + esc(f[1]) + '<textarea rows="' + (String(v || '').length > 90 ? 3 : 1) + '" data-key="' + esc(f[0]) + '">' + esc(v || '') + '</textarea></label>'; }).join('') + '</fieldset>';
    }).join('');
    [].forEach.call(words.querySelectorAll('textarea[data-key]'), function (ta) {
      ta.addEventListener('input', function () {
        var key = ta.getAttribute('data-key'); setPath(S.plan, key, ta.value);
        var m = /^sections\.(\d+)\.items\.(\d+)\.text$/.exec(key);
        if (m) { var it = S.plan.sections[+m[1]].items[+m[2]]; if (it.kind === 'sourced') { it.kind = 'supplied'; delete it.cite; } }
        var m2 = /^scenes\.(\d+)\.text\.items\.(\d+)\.text$/.exec(key);
        if (m2) { var it2 = S.plan.scenes[+m2[1]].text.items[+m2[2]]; if (it2.kind === 'sourced') { it2.kind = 'supplied'; it2.cite = null; } }
        var m3 = /^scenes\.(\d+)\.text\.body$/.exec(key);
        if (m3) { var tx = S.plan.scenes[+m3[1]].text; if (tx.kind === 'sourced') { tx.kind = 'supplied'; tx.cite = null; } }
        if (key === 'hero.title.lede' && S.plan.hero.title.ledeKind === 'sourced') { S.plan.hero.title.ledeKind = 'supplied'; S.plan.hero.title.cite = null; }
        post({ type: 'cr-edit', key: key, text: ta.value }); markDirty();
      });
      ta.addEventListener('change', function () { S.plan = settle(S.plan); refresh(); });
    });
    buildPictures(); buildMotion(); buildSources(); build3D();
  }
  function roleOf(a) {
    var p = S.plan; if (!p) return 'Unused';
    if (p.v === 2) {
      var n2 = 0, focal = false; p.scenes.forEach(function (s, si) { s.layers.forEach(function (L) { if (L.asset === a.id) { n2++; if (si === 0 && L.role === 'focal') focal = true; } }); });
      return focal ? 'Main picture' + (n2 > 1 ? ' (+' + (n2 - 1) + ' more scene' + (n2 > 2 ? 's' : '') + ')' : '') : n2 ? 'In ' + n2 + ' scene' + (n2 > 1 ? 's' : '') : 'Unused';
    }
    if (p.hero.layers.some(function (l) { return l.asset === a.id && l.role === 'subject'; })) return 'Main picture';
    if (p.hero.layers.some(function (l) { return l.asset === a.id; })) return 'Hero companion';
    var n = p.sections.filter(function (s) { return s.asset === a.id || (s.assets || []).indexOf(a.id) >= 0; }).length;
    return n ? 'In ' + n + ' section' + (n > 1 ? 's' : '') : 'Unused';
  }
  function buildPictures() {
    var panel = root.querySelector('[data-panel="pictures"]');
    var list = S.assets.filter(function (a) { return !a.removed && a.origin !== 'derived'; });
    panel.innerHTML = '<p class="cs-hint">Pictures come from your uploads, from Google Images results whose pages state a free licence, or from found pictures you chose yourself -- each credited on the page. Cutouts are made here in your browser.</p>'
      + list.map(function (a) {
        var cut = S.assets.find(function (x) { return x.cutoutOf === a.id && !x.removed; });
        var role = roleOf(a); var cutRole = cut ? roleOf(cut) : '';
        var src = a.origin === 'upload' ? 'Your upload' + (S.fixture ? ' (test fixture)' : '') : 'Found online' + (a.author ? ' · ' + esc(a.author.slice(0, 60)) : '') + ' · ' + esc(a.license || 'licence as stated on its page');
        return '<div class="cs-pic' + (a.failed ? ' is-failed' : '') + '"><img src="' + esc(cut ? cut.dataUrl : a.dataUrl) + '" alt=""' + (cut ? ' class="is-cut"' : '') + '>'
          + '<div><strong>' + esc(C.render.cleanTitle(a.title).slice(0, 70)) + '</strong><small>' + (a.pageUrl ? '<a href="' + esc(a.pageUrl) + '" target="_blank" rel="noopener">' + src + '</a>' : src) + '</small>'
          + '<small>' + (a.assess ? a.assess.width + '×' + a.assess.height : '') + ' · ' + esc(cut ? cutRole : role) + '</small><small class="cs-proc">' + esc((cut && cut.processing) || a.processing || '') + '</small>'
          + (a.curation ? '<small class="cs-seen' + (a.curation.role === 'unrelated' || a.curation.identity === 'other' ? ' is-no' : '') + '">Picture check: ' + esc(a.curation.depicts || '') + ' — ' + esc({ subject: 'the subject', environment: 'a setting', supporting: 'supporting', detail: 'a detail', logo: 'a logo (reference only)', reference: 'a reference (map, diagram…)', unrelated: 'unrelated' }[a.curation.role] || a.curation.role) + (a.curation.identity === 'form' ? ', a real-world form (costume, figure, replica)' : '') + (a.curation.issues && a.curation.issues.length ? ' · ' + esc(a.curation.issues.join(', ')) : '') + '</small>' : '')
          + (function () { var n = S.plan && S.plan.v === 2 && S.plan.assetNotes.find(function (x) { return x.asset === a.id || (cut && x.asset === cut.id); }); return n ? '<small class="cs-seen' + (n.matches === 'no' ? ' is-no' : '') + '">The director saw: ' + esc(n.depicts) + ' — ' + (n.matches === 'yes' ? 'shows the subject' : n.matches === 'partly' ? 'partly the subject' : n.matches === 'no' ? 'not the subject, so not used' : 'unsure') + '</small>' : ''; })()
          + '<div class="cs-pic-actions"><button type="button" data-main="' + esc(cut ? cut.id : a.id) + '">Use as main</button><button type="button" data-replace="' + esc(a.id) + '">Replace…</button><button type="button" data-remove="' + esc(a.id) + '">Remove</button></div></div></div>';
      }).join('') + '<button type="button" class="cs-btn cs-ghost" id="csAddPic">+ Add a picture</button>';
    [].forEach.call(panel.querySelectorAll('[data-main]'), function (b) { b.addEventListener('click', function () { useAsMain(b.getAttribute('data-main')); }); });
    [].forEach.call(panel.querySelectorAll('[data-remove]'), function (b) { b.addEventListener('click', function () { removeAsset(b.getAttribute('data-remove')); }); });
    [].forEach.call(panel.querySelectorAll('[data-replace]'), function (b) { b.addEventListener('click', function () { pickFile(function (file) { replaceAsset(b.getAttribute('data-replace'), file); }); }); });
    document.getElementById('csAddPic').addEventListener('click', function () { els.csUpload.click(); });
  }
  function pickFile(cb) { var inp = h('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp' }); inp.addEventListener('change', function () { if (inp.files && inp.files[0]) cb(inp.files[0]); }); inp.click(); }
  function rebuildHero() { S.plan = settle(C.director.redirectHero(S.plan, live(), legacyU())); }
  // v2: the concept stays; the chosen picture takes the opening scene's focal place and the validator re-frames it
  function useAsMain(id) {
    var a = S.assets.find(function (x) { return x.id === id; }); if (!a) return;
    if (S.plan && S.plan.v === 2) {
      var hero = S.plan.scenes[0]; var f = hero.layers.find(function (L) { return L.role === 'focal'; });
      S.mainAsset = a.cutoutOf || id; S.assets.forEach(function (x) { if (x.ownerRole === 'main' && x.id !== S.mainAsset) x.ownerRole = 'auto'; });
      if (f && f.kind === 'image') { f.asset = id; delete f.frame; delete f.mfit; delete f.mfocus; if (a.focus) f.focus = a.focus; if (!(a.caps && a.caps.moveFreely)) { f.fit = 'cover'; if (f.mask === 'none') f.mask = 'window'; } else { f.fit = 'contain'; f.mask = 'none'; } } // a cutout floats free: no frame
      else hero.layers.unshift({ id: 'focal-main', kind: 'image', role: 'focal', asset: id, box: { d: [52, 10, 42, 80], m: [8, 4, 84, 92] }, z: 5, entrance: { kind: 'rise' }, loop: { kind: 'float', amp: 1, period: 9 }, scroll: { kind: 'parallax', amount: 0.3 } });
      S.plan = settle(S.plan, 'safety', [hero.id]); refresh(); buildEditor(); renderThumbs(); markDirty(); return;
    }
    S.assets.forEach(function (x) { if (x.relevance >= 5 && x.id !== id) x.relevance = x.origin === 'upload' ? 2 : 1; }); a.relevance = 5; rebuildHero(); refresh(); buildEditor(); markDirty();
  }
  function removeAsset(id) {
    S.assets.forEach(function (a) { if (a.id === id || a.cutoutOf === id) { a.removed = true; delete a.dataUrl; } });
    renderThumbs(); if (!S.plan) return;
    if (S.plan.v === 2) { S.plan = settle(S.plan); refresh(); buildEditor(); markDirty(); return; }
    var inHero = S.plan.hero.layers.some(function (l) { var a = S.assets.find(function (x) { return x.id === l.asset; }); return a && a.removed; });
    if (inHero) rebuildHero(); else S.plan = settle(S.plan);
    refresh(); buildEditor(); markDirty();
  }
  // a replacement takes the old picture's place: the hero is re-directed for it, sections point at it
  function replaceAsset(id, file) {
    fileToAsset(file, 0).then(function (na) {
      if (!na) return; var old = S.assets.find(function (x) { return x.id === id; }); var oldCut = S.assets.find(function (x) { return x.cutoutOf === id; });
      if (old && old.relevance >= 5) na.relevance = 5; else na.relevance = Math.max(2, (old && old.relevance) || 0);
      return processAsset(na).then(function (group) {
        var nCut = group.find(function (x) { return x.cutout; });
        if (S.plan.v === 2) {
          // same concept and composition; every layer that showed the old picture now shows the new one, framed for what it is
          var touched = []; if (S.mainAsset === id) S.mainAsset = na.id;
          S.plan.scenes.forEach(function (s) { s.layers.forEach(function (L) { if (L.asset === id || (oldCut && L.asset === oldCut.id)) { if (touched.indexOf(s.id) < 0) touched.push(s.id); var free = L.asset === (oldCut && oldCut.id) && nCut; L.asset = free ? nCut.id : na.id; delete L.frame; delete L.mfit; delete L.mfocus; if (!free && (L.mask === 'none' && L.role !== 'backdrop' && L.role !== 'texture')) { L.mask = 'window'; L.fit = 'cover'; } } }); });
          S.assets.forEach(function (a) { if (a.id === id || a.cutoutOf === id) { a.removed = true; delete a.dataUrl; } });
          S.assets = S.assets.concat(group); S.plan = settle(S.plan, 'safety', touched); refresh(); buildEditor(); renderThumbs(); markDirty(); return;
        }
        var wasMain = S.plan.hero.layers.some(function (l) { return l.role === 'subject' && (l.asset === id || (oldCut && l.asset === oldCut.id)); });
        if (wasMain) na.relevance = 5;
        S.plan.sections.forEach(function (s) { if (s.asset === id || (oldCut && s.asset === oldCut.id)) s.asset = (s.type === 'specimen' && nCut ? nCut.id : na.id); if (s.assets) s.assets = s.assets.map(function (x) { return x === id ? na.id : x; }); });
        S.assets.forEach(function (a) { if (a.id === id || a.cutoutOf === id) { a.removed = true; delete a.dataUrl; } });
        S.assets = S.assets.concat(group);
        S.plan.credits = S.plan.credits.filter(function (c) { return c.asset !== id; });
        rebuildHero(); refresh(); buildEditor(); renderThumbs(); markDirty();
      });
    });
  }
  function placeNewUploads(list) {
    if (S.plan.v === 2) return; // v2: new uploads join the inventory; "Use as main" or "Try another direction" places them
    var ids = list.map(function (a) { return a.id; }); var g = S.plan.sections.find(function (s) { return s.type === 'gallery'; });
    if (g) g.assets = (g.assets || []).concat(ids).slice(0, 6);
    else { var at = Math.max(0, S.plan.sections.findIndex(function (s) { return s.type === 'closing' || s.type === 'sources'; })); S.plan.sections.splice(at, 0, { id: 's-gallery-u', type: 'gallery', kind: S.understanding && S.understanding.kind === 'personal' ? 'supplied' : 'mixed', eyebrow: 'Pictures', title: 'Moments', assets: ids, layout: 'scatter' }); }
  }
  function buildMotion() {
    var panel = root.querySelector('[data-panel="motion"]'); var p = S.plan;
    if (p.v === 2) {
      var pinned = p.scenes.filter(function (s) { return s.pin; }).length; var layers = p.scenes.reduce(function (t, s) { return t + s.layers.length; }, 0);
      panel.innerHTML = '<fieldset><legend>Tempo</legend>' + ['still', 'slow', 'measured', 'lively'].map(function (t) { return '<label class="cs-radio"><input type="radio" name="csTempo" value="' + t + '"' + (p.motion.tempo === t ? ' checked' : '') + '> ' + t.charAt(0).toUpperCase() + t.slice(1) + '</label>'; }).join('') + '</fieldset>'
        + '<fieldset><legend>Preview</legend><label class="cs-radio"><input type="checkbox" id="csReduced"' + (S.previewMotion === 'reduced' ? ' checked' : '') + '> Show the reduced-motion version</label><p class="cs-hint">Visitors who ask their device for less motion always get the still version.</p><button type="button" class="cs-btn cs-ghost" id="csReplay">Replay the entrance</button></fieldset>'
        + '<fieldset><legend>The direction</legend><p class="cs-hint">' + esc(p.motion.signature || '') + '</p><p class="cs-hint">' + p.scenes.length + ' scenes · ' + layers + ' layers · ' + pinned + ' pinned · thread: ' + esc(p.thread.kind) + ' · ' + esc(p.atmosphere.backdrop) + ' backdrop, ' + esc(p.atmosphere.particles) + '</p><ol class="cs-scenes">' + p.scenes.map(function (s) { return '<li><strong>' + esc(s.name || s.id) + '</strong> <small>' + esc(s.height + (s.pin ? ', pinned' : '') + (s.camera !== 'none' ? ', camera ' + s.camera : '')) + '</small><br><small>' + esc(s.purpose) + '</small></li>'; }).join('') + '</ol>'
        + ((S.lastFixes || []).length ? '<details><summary>Checks and corrections (' + S.lastFixes.length + ')</summary><ul>' + S.lastFixes.map(function (f) { return '<li>' + esc(f) + '</li>'; }).join('') + '</ul></details>' : '') + '</fieldset>';
      [].forEach.call(panel.querySelectorAll('input[name="csTempo"]'), function (r) { r.addEventListener('change', function () { S.plan.motion.tempo = r.value; post({ type: 'cr-motion', motion: S.previewMotion, tempo: r.value }); markDirty(); }); });
      document.getElementById('csReduced').addEventListener('change', function (e) { S.previewMotion = e.target.checked ? 'reduced' : 'full'; refresh(); });
      document.getElementById('csReplay').addEventListener('click', function () { post({ type: 'cr-replay' }); });
      return;
    }
    panel.innerHTML = '<fieldset><legend>How much it moves</legend><label class="cs-radio"><input type="radio" name="csInt" value="lively"' + (p.motion.intensity === 'lively' ? ' checked' : '') + '> Lively</label><label class="cs-radio"><input type="radio" name="csInt" value="calm"' + (p.motion.intensity === 'calm' ? ' checked' : '') + '> Calm</label></fieldset>'
      + '<fieldset><legend>Preview</legend><label class="cs-radio"><input type="checkbox" id="csReduced"' + (S.previewMotion === 'reduced' ? ' checked' : '') + '> Show the reduced-motion version</label><p class="cs-hint">Visitors who ask their device for less motion always get the still version.</p><button type="button" class="cs-btn cs-ghost" id="csReplay">Replay the entrance</button></fieldset>'
      + '<fieldset><legend>The scene</legend><p class="cs-hint">' + esc(p.concept.line) + '</p><p class="cs-hint">World: ' + esc(p.world) + ' · connector: ' + esc(p.connector.kind) + ' · hero: ' + esc(p.hero.layout) + ' with ' + p.hero.layers.length + ' layer' + (p.hero.layers.length === 1 ? '' : 's') + '</p>'
      + ((S.lastFixes || []).length ? '<details><summary>Composition checks (' + S.lastFixes.length + ' adjustments)</summary><ul>' + S.lastFixes.map(function (f) { return '<li>' + esc(f) + '</li>'; }).join('') + '</ul></details>' : '') + '</fieldset>';
    [].forEach.call(panel.querySelectorAll('input[name="csInt"]'), function (r) { r.addEventListener('change', function () { S.plan.motion.intensity = r.value; post({ type: 'cr-motion', motion: S.previewMotion, intensity: r.value }); markDirty(); }); });
    document.getElementById('csReduced').addEventListener('change', function (e) { S.previewMotion = e.target.checked ? 'reduced' : 'full'; refresh(); });
    document.getElementById('csReplay').addEventListener('click', function () { post({ type: 'cr-replay' }); });
  }
  function buildSources() {
    var panel = root.querySelector('[data-panel="sources"]'); var r = S.research || {}; var p = S.plan;
    var kb = Math.round((S.cost.researchBytes || 0) / 1024);
    panel.innerHTML = (r.page ? '<p><strong>Facts from</strong> <a href="' + esc(r.page.url) + '" target="_blank" rel="noopener">' + esc(r.page.title) + ' — Wikipedia</a> (CC BY-SA 4.0, retrieved ' + esc(r.page.retrieved || '') + '). ' + p.facts.length + ' facts kept with the page; every factual line on it links to its source list.</p>' : '<p>No encyclopedia source: ' + (S.understanding && S.understanding.kind === 'personal' ? 'the words about them are yours.' : S.understanding && S.understanding.kind === 'fictional' ? 'the subject is invented, so everything is marked imagined.' : 'nothing reliable was found.') + '</p>')
      + '<p><strong>Picture credits</strong></p><ul class="cs-credits">' + (p.credits.map(function (c) { return '<li>' + esc(C.render.cleanTitle(c.title)) + (c.author ? ' — ' + esc(c.author) : '') + ' · ' + esc(c.license) + '</li>'; }).join('') || '<li>None (your own pictures only)</li>') + '</ul>'
      + '<p class="cs-hint">Behind this page: ' + (S.cost.researchRequests || 0) + ' requests to Wikipedia for facts (' + kb + ' KB) · ' + (S.cost.aiCalls || 0) + ' AI call(s) (direction and claim checks) · 0 generated images. Credits: as confirmed in the quote for this page (Creative 6, plus 12 for each premium video clip that is made); another direction is priced before it runs.</p>';
  }
  // (premium video is made only in the mode the owner chose for the generation: a director's premiumMedia suggestion is
  // never offered as a paid extra -- it only helps pick which upload each chosen moment starts from)
  function markDirty() { S.dirty = true; setSaveState('Unsaved changes'); els.csSave.disabled = false; }
  function setSaveState(t) { els.csSaveState.textContent = t; }

  // ---------- save / reopen ----------
  function direction() {
    return {
      mode: 'creative', meta: { id: S.localId || (S.localId = 'creative_' + Date.now().toString(36)), createdAt: S.createdAt || (S.createdAt = new Date().toISOString()), version: 'creative-1' },
      pages: [{ id: 'creative', label: 'Creative page', sections: [] }],
      creative: { v: 1, brief: S.brief, understanding: S.understanding, supplied: supplied(), research: S.research, assets: S.assets, models: (S.models || []).length ? S.models : undefined, threeD: tdForSave(), plan: S.plan, planMeta: S.planMeta, history: S.history, mainAsset: liveMain() || undefined, abstractChosen: S.abstractChosen || undefined, premiumJob: S.premiumJob || undefined, premiumSource: S.premiumSource === 'model3d' ? 'model3d' : undefined, motion: { intensity: (S.plan.motion && S.plan.motion.intensity) || 'lively' }, cost: S.cost, fixture: S.fixture || undefined, updatedAt: new Date().toISOString() },
    };
  }
  // the page's 3D block as it is SAVED: a model the server already stores goes by its reference, never as bytes (a model
  // may be up to 8 MB -- inline, with the page's pictures, it would push the save past the server's size limit and the
  // whole save would be refused). A model with no stored copy yet (none today) still goes as bytes.
  function tdForSave() {
    var b = S.threeD; if (!b || !Array.isArray(b.assets)) return b || undefined;
    return Object.assign({}, b, { assets: b.assets.map(function (a) { if (!a || !a.assetRef || !a.dataUrl) return a; var o = Object.assign({}, a); delete o.dataUrl; return o; }) });
  }
  function save() {
    if (!S.plan || S.saving) return; if (!signedIn()) { needSignIn('Sign in to save your Creative page.'); return; }
    S.saving = true; els.csSave.disabled = true; setSaveState('Saving…');
    var body = { name: S.name || pageTitle(), directionsState: { directions: [direction()], activeDirectionIndex: 0 } };
    var req = S.projectId ? api('/api/projects/' + encodeURIComponent(S.projectId), { method: 'PUT', body: Object.assign({ expectedRevision: S.revision }, body) }) : api('/api/projects', { method: 'POST', body: body });
    return req.then(function (r) {
      S.saving = false;
      if (r.ok && r.data.ok) {
        S.projectId = r.data.project.id; S.revision = r.data.project.revision; S.status = r.data.project.status || S.status; S.dirty = false; setSaveState('Saved to your account'); els.csSave.disabled = true; showBuy();
        try { localStorage.setItem(POINTER, JSON.stringify({ id: S.projectId, name: body.name })); } catch (e) { /* optional */ }
        if (typeof loadOwnedProjectsList === 'function') loadOwnedProjectsList();
      } else if (r.data && r.data.reason === 'conflict') { setSaveState('Changed on another device — reopen it from your projects to see that version.'); els.csSave.disabled = false; }
      else { setSaveState((r.data && r.data.message) || 'Could not save — try again.'); els.csSave.disabled = false; }
      return r;
    });
  }
  function resumePremium(projectId, saved) {
    var mine = S;
    var go = function (jobId) { if (S === mine && jobId) { S.premiumJob = { jobId: jobId }; followPremium(jobId); } };
    if (saved && saved.jobId) return go(saved.jobId);
    api('/api/creative/premium/for-project/' + encodeURIComponent(projectId)).then(function (r) { if (r.ok && r.data && r.data.job) go(r.data.job.jobId); });
  }
  function loadProject(p) {
    var d = (p.directionsState.directions || []).find(function (x) { return x && x.mode === 'creative'; }); if (!d || !d.creative) return fail('That project has no Creative page.');
    var c = d.creative; S = fresh();
    S.projectId = p.id; S.revision = p.revision; S.status = p.status || null; S.name = p.name; S.localId = d.meta && d.meta.id; S.createdAt = d.meta && d.meta.createdAt;
    S.brief = c.brief || ''; S.understanding = c.understanding; S.research = c.research; S.assets = c.assets || []; S.models = c.models || []; S.threeD = c.threeD || null; S.fixture = c.fixture || ''; S.planMeta = c.planMeta || null; S.history = c.history || []; S.mainAsset = c.mainAsset || null; S.abstractChosen = !!c.abstractChosen; S.premiumSource = c.premiumSource === 'model3d' ? 'model3d' : 'image';
    S.suppliedText = ((c.supplied && c.supplied.facts) || []).join('\n'); S.memoriesText = ((c.supplied && c.supplied.memories) || []).join('\n'); S.cost = Object.assign(S.cost, c.cost || {});
    resetUI();
    if (!c.plan) { els.csEmpty.hidden = false; return; }
    S.plan = settle(c.plan); els.csBriefStep.hidden = true; els.csEditor.hidden = false; buildEditor(); refresh(true); showBuy();
    setSaveState('Opened from your account'); els.csSave.disabled = true;
    resumePremium(p.id, c.premiumJob); resume3D(p.id);
    try { localStorage.setItem(POINTER, JSON.stringify({ id: p.id, name: p.name })); } catch (e) { /* optional */ }
  }

  window.SiteRemadeCreativeStudio = {
    open: open, close: close,
    // review / test hooks (no network, no side effects beyond this studio)
    state: function () { return S; }, html: function () { return S && S.lastHtml; }, save: save, create: create,
    setFixture: function (text) { if (!root) { build(); S = fresh(); resetUI(); } S.fixture = String(text || '').slice(0, 160); showFixture(); },
    addFiles: function (files) { return addUploads(files); },
    anotherDirection: function () { return anotherDirection(); }, previousDirection: function () { previousDirection(); },
    // the same as "Start a different page", without the confirmation
    reset: function () { if (!root) build(); S = fresh(); resetUI(); var dp = document.getElementById('csDirection'); if (dp) dp.innerHTML = ''; },
  };
})();
