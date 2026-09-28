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
  var S = null; // studio state
  var root = null, frame = null, els = {};
  var blobUrls = {};

  function fresh() {
    return { brief: '', suppliedText: '', memoriesText: '', choice: '', understanding: null, research: null, assets: [], plan: null,
      projectId: null, revision: null, name: '', dirty: false, busy: false, device: 'desktop', previewMotion: 'full', fixture: '', cost: { researchRequests: 0, researchBytes: 0, paidCalls: 0, credits: 0 } };
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
      '<div class="cs-actions"><span class="cs-save-state" id="csSaveState" aria-live="polite"></span><button type="button" class="cs-btn" id="csSave" disabled>Save to my account</button><button type="button" class="cs-btn cs-ghost" id="csClose">Back to Business</button></div></header>',
      '<div class="cs-fixture" id="csFixture" hidden></div>',
      '<div class="cs-body"><aside class="cs-panel" id="csPanel">',
      '<section class="cs-step" id="csBriefStep"><h2>What is the page about?</h2>',
      '<p class="cs-hint">Anything: a character, a game, an everyday object, a food, your pet, a person you love. Say how it should feel.</p>',
      '<textarea id="csBrief" rows="3" maxlength="600" placeholder="A website about toilet paper — make it grand and a bit absurd"></textarea>',
      '<div class="cs-chips" id="csChips"></div>',
      '<details class="cs-personal" id="csPersonal"><summary>Your own details and photos <small>(for a personal page)</small></summary>',
      '<label for="csSupplied">True details, one per line</label><textarea id="csSupplied" rows="4" maxlength="2000" placeholder="Bubbles lived with us for nine years.\nHe raced to the glass whenever someone came home."></textarea>',
      '<label for="csMemories">Favourite memories, one per line (optional)</label><textarea id="csMemories" rows="3" maxlength="2000"></textarea>',
      '<p class="cs-hint">A personal page only ever shows your own photos of them and only says what you write here.</p></details>',
      '<div class="cs-uploads"><input type="file" id="csUpload" accept="image/png,image/jpeg,image/webp" multiple hidden><button type="button" class="cs-btn cs-ghost" id="csUploadBtn">+ Add your own pictures</button><div class="cs-thumbs" id="csThumbs"></div></div>',
      '<button type="button" class="cs-btn cs-primary" id="csCreate">Create the page</button>',
      '<p class="cs-cost" id="csCostNote">Uses free encyclopedia sources and your own pictures. No AI image generation, no paid AI calls, no credits.</p>',
      '</section>',
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
    ['csBrief', 'csSupplied', 'csMemories', 'csUpload', 'csUploadBtn', 'csThumbs', 'csCreate', 'csProgress', 'csProgressList', 'csChoices', 'csError', 'csEditor', 'csBriefStep', 'csStage', 'csViewport', 'csEmpty', 'csFrame', 'csSave', 'csSaveState', 'csClose', 'csNew', 'csAsks', 'csChips', 'csFixture', 'csPersonal'].forEach(function (id) { els[id] = document.getElementById(id); });
    frame = els.csFrame;
    ['A website about toilet paper — make it grand and a bit absurd', 'Sherlock Holmes fan site, cinematic and moody', 'A tribute to the Big Mac', 'A memorial page for my goldfish Bubbles'].forEach(function (t) {
      var b = h('button', { type: 'button', class: 'cs-chip', text: t.replace(/ —.*| fan site.*/, '') }); b.addEventListener('click', function () { els.csBrief.value = t; if (/my goldfish/.test(t)) els.csPersonal.open = true; els.csBrief.focus(); }); els.csChips.appendChild(b);
    });
    els.csClose.addEventListener('click', close);
    els.csCreate.addEventListener('click', function () { create(); });
    els.csUploadBtn.addEventListener('click', function () { els.csUpload.click(); });
    els.csUpload.addEventListener('change', function () { addUploads([].slice.call(els.csUpload.files || [])); els.csUpload.value = ''; });
    els.csSave.addEventListener('click', save);
    els.csNew.addEventListener('click', function () { if (S.dirty && !window.confirm('Start a different page? Unsaved changes to this one will be lost.')) return; S = fresh(); resetUI(); });
    [].forEach.call(root.querySelectorAll('[data-device]'), function (b) { b.addEventListener('click', function () { S.device = b.getAttribute('data-device'); [].forEach.call(root.querySelectorAll('[data-device]'), function (x) { x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); }); fit(); }); });
    [].forEach.call(root.querySelectorAll('[data-tab]'), function (b) { b.addEventListener('click', function () { showTab(b.getAttribute('data-tab')); }); });
    window.addEventListener('resize', fit);
    root.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !S.busy) close(); });
  }
  function showTab(name) {
    [].forEach.call(root.querySelectorAll('[data-tab]'), function (b) { b.setAttribute('aria-selected', b.getAttribute('data-tab') === name ? 'true' : 'false'); });
    [].forEach.call(root.querySelectorAll('[data-panel]'), function (p) { p.hidden = p.getAttribute('data-panel') !== name; });
  }
  function resetUI() {
    els.csBrief.value = S.brief; els.csSupplied.value = S.suppliedText; els.csMemories.value = S.memoriesText;
    els.csBriefStep.hidden = false; els.csProgress.hidden = true; els.csEditor.hidden = true; els.csViewport.hidden = true; els.csEmpty.hidden = false;
    els.csChoices.innerHTML = ''; els.csError.hidden = true; renderThumbs(); setSaveState(''); els.csSave.disabled = true; showFixture();
  }
  function showFixture() { els.csFixture.hidden = !S.fixture; els.csFixture.textContent = S.fixture ? 'TEST FIXTURE — ' + S.fixture : ''; }

  // ---------- open / close ----------
  var onClose = null;
  function open(opts) {
    if (!root) { build(); S = fresh(); resetUI(); }
    onClose = opts && opts.onClose;
    root.hidden = false; document.body.classList.add('cs-open');
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
      if (!a.transparent && a.background && a.background.uniformity >= 0.8) {
        var cut = C.assets.cutout(px.img, { holes: !asset.illustration });
        if (cut.clean && cut.img) {
          var cropped = C.assets.crop(cut.img, cut.bbox, 0.02); var ca = C.assets.assess(cropped);
          var derived = { id: 'c-' + asset.id, origin: 'derived', cutout: true, cutoutOf: asset.id, title: asset.title, alt: asset.alt, relevance: asset.relevance, illustration: asset.illustration,
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
        if (Math.max(im.naturalWidth, im.naturalHeight) > 2000 || dataUrl.length > 4e6) { var px = pixels(im, 2000); var alpha = /png|webp/.test(file.type); dataUrl = px.canvas.toDataURL(alpha ? 'image/png' : 'image/jpeg', 0.9); }
        return { id: 'u' + Date.now().toString(36) + n, origin: 'upload', title: file.name.replace(/\.[a-z]+$/i, ''), alt: '', relevance: 2, dataUrl: dataUrl, mime: dataUrl.slice(5, dataUrl.indexOf(';')) };
      }).catch(function () { return null; });
    });
  }
  function addUploads(files) {
    var uploads = S.assets.filter(function (a) { return a.origin === 'upload' && !a.removed; });
    return Promise.all(files.slice(0, Math.max(0, 8 - uploads.length)).map(fileToAsset)).then(function (list) {
      list = list.filter(Boolean); if (!list.length) return;
      return Promise.all(list.map(processAsset)).then(function (groups) {
        groups.forEach(function (g) { S.assets = S.assets.concat(g); });
        renderThumbs();
        if (S.plan) { placeNewUploads(list); rebuildHero(); refresh(); }
      });
    });
  }
  function renderThumbs() {
    var ups = S.assets.filter(function (a) { return a.origin === 'upload' && !a.removed; });
    els.csThumbs.innerHTML = ups.map(function (a) { return '<figure><img src="' + esc(a.dataUrl) + '" alt=""><button type="button" data-rm="' + esc(a.id) + '" aria-label="Remove">×</button></figure>'; }).join('');
    [].forEach.call(els.csThumbs.querySelectorAll('[data-rm]'), function (b) { b.addEventListener('click', function () { removeAsset(b.getAttribute('data-rm')); }); });
  }

  // ---------- create ----------
  function steps(list) { els.csProgressList.innerHTML = list.map(function (s) { return '<li data-step="' + s[0] + '"><i></i><span>' + esc(s[1]) + '</span><small></small></li>'; }).join(''); }
  function step(id, state, note) { var li = els.csProgressList.querySelector('[data-step="' + id + '"]'); if (!li) return; li.setAttribute('data-state', state); if (note != null) li.querySelector('small').textContent = note; }
  function fail(msg) { els.csError.hidden = false; els.csError.textContent = msg; S.busy = false; els.csCreate.disabled = false; els.csBriefStep.hidden = false; }
  function lines(t) { return String(t || '').split(/\n+/).map(function (x) { return x.trim(); }).filter(Boolean); }

  function create(choice) {
    if (S.busy) return;
    S.brief = els.csBrief.value.trim(); S.suppliedText = els.csSupplied.value; S.memoriesText = els.csMemories.value;
    if (!S.brief) { els.csBrief.focus(); return; }
    if (!signedIn()) { needSignIn('Sign in to make a Creative page — it saves to your account like any website.'); return; }
    if (S.dirty && S.plan && !choice && !window.confirm('Make a new page from this description? Your changes to the current page will be replaced.')) return;
    S.busy = true; els.csCreate.disabled = true; els.csError.hidden = true; els.csChoices.innerHTML = '';
    els.csProgress.hidden = false; els.csEditor.hidden = true; els.csBriefStep.hidden = true;
    steps([['understand', 'Understanding the brief'], ['research', 'Looking it up (encyclopedia and free-licence pictures)'], ['pictures', 'Reading the pictures (size, background, cutouts)'], ['direct', 'Directing the scene'], ['build', 'Building the page']]);
    var uploads = S.assets.filter(function (a) { return a.origin === 'upload' && !a.removed; });
    var u = C.understand.understandBrief(S.brief, { supplied: S.suppliedText, uploads: uploads.length });
    step('understand', 'done', u.kind === 'personal' ? 'A personal page about ' + (u.name || 'your ' + u.noun) : u.kind === 'fictional' ? 'An invented subject' : u.subject ? '“' + u.subject + '”' : '');
    step('research', 'active', u.kind === 'fictional' ? 'Not looked up: invented subjects stay invented' : '');
    var t0 = Date.now();
    return api('/api/creative/research', { method: 'POST', body: { brief: S.brief, supplied: S.suppliedText, choice: choice || '', hasUploads: uploads.length > 0 } }).then(function (r) {
      if (r.status === 401) { S.busy = false; els.csCreate.disabled = false; els.csBriefStep.hidden = false; needSignIn('Sign in to make a Creative page.'); return; }
      if (!r.ok || !r.data.ok) { step('research', 'failed', (r.data && r.data.message) || 'The lookup failed.'); return fail((r.data && r.data.message) || 'The lookup failed. Please try again.'); }
      var d = r.data; S.understanding = d.understanding; S.research = d.research; S.choice = choice || '';
      if (d.research.log) { S.cost.researchRequests += d.research.log.requests || 0; S.cost.researchBytes += d.research.log.bytes || 0; }
      if (d.research.status === 'ambiguous') { step('research', 'wait', 'More than one thing is called that'); return askChoice(d.research.options || []); }
      var note = d.research.page ? d.research.page.title + ' · ' + (d.research.facts || []).length + ' facts · ' + d.images.length + ' pictures' : d.understanding.kind === 'fictional' ? 'Nothing looked up' : 'Nothing found — the page uses your words and pictures';
      step('research', 'done', note + ' (' + ((Date.now() - t0) / 1000).toFixed(1) + 's)');
      step('pictures', 'active');
      var research = (d.images || []).map(function (i) { return { id: i.id, origin: 'research', title: i.title, description: i.description, alt: cleanAlt(i), author: i.author, license: i.license, licenseUrl: i.licenseUrl, pageUrl: i.pageUrl, sourceUrl: i.sourceUrl, found: i.found, relevance: i.relevance, retrieved: i.retrieved, mime: i.mime, dataUrl: i.dataUrl }; });
      // keep the owner's uploads; research pictures are replaced by this run's
      S.assets = S.assets.filter(function (a) { return a.origin === 'upload' || (a.origin === 'derived' && S.assets.some(function (b) { return b.id === a.cutoutOf && b.origin === 'upload'; })); });
      var todo = research.filter(function (a) { return !S.assets.some(function (b) { return b.id === a.id; }); });
      var done = 0;
      return todo.reduce(function (p, a) { return p.then(function () { return processAsset(a).then(function (g) { S.assets = S.assets.concat(g); done++; step('pictures', 'active', done + ' of ' + todo.length); return new Promise(function (res) { setTimeout(res, 0); }); }); }); }, Promise.resolve()).then(function () {
        var cut = S.assets.filter(function (a) { return a.cutout; }).length, bad = S.assets.filter(function (a) { return a.failed; }).length;
        step('pictures', 'done', S.assets.filter(function (a) { return !a.cutout; }).length + ' pictures · ' + cut + ' cut out as separate layers' + (bad ? ' · ' + bad + ' unreadable' : ''));
        step('direct', 'active');
        direct();
        step('direct', 'done', S.plan.concept.line);
        step('build', 'active'); refresh(true); step('build', 'done');
        S.busy = false; els.csCreate.disabled = false; S.dirty = true; S.name = S.plan.hero.title.text; setSaveState('Not saved yet'); els.csSave.disabled = false;
        els.csProgress.hidden = true; els.csEditor.hidden = false; buildEditor();
      });
    }).catch(function (e) { fail('Something went wrong: ' + (e && e.message || e)); });
  }
  function cleanAlt(i) { var t = String(i.description || '').trim(); if (t.length > 8 && t.length < 200) return t; return C.render.cleanTitle(i.title); }
  function askChoice(options) {
    S.busy = false; els.csCreate.disabled = false;
    els.csChoices.innerHTML = '<p>Which one did you mean?</p>' + options.map(function (o, i) { return '<button type="button" class="cs-choice" data-i="' + i + '"><strong>' + esc(o.title) + '</strong><small>' + esc(o.description || '') + '</small></button>'; }).join('') + '<button type="button" class="cs-btn cs-ghost" id="csChoiceBack">Change the description</button>';
    [].forEach.call(els.csChoices.querySelectorAll('.cs-choice'), function (b) { b.addEventListener('click', function () { create(options[+b.getAttribute('data-i')].title); }); });
    document.getElementById('csChoiceBack').addEventListener('click', function () { els.csProgress.hidden = true; els.csBriefStep.hidden = false; });
  }
  function supplied() { return { facts: lines(S.suppliedText).slice(0, 12), memories: lines(S.memoriesText).slice(0, 8) }; }
  function direct() {
    var u = S.understanding; var research = S.research || {};
    var plan = C.director.direct({ understanding: u, research: { page: research.page, facts: research.facts || [] }, assets: live(), supplied: supplied(), seed: S.brief + '|' + (S.choice || '') });
    if (S.fixture) plan.fixture = S.fixture;
    S.plan = settle(plan);
  }
  function live() { return S.assets.filter(function (a) { return !a.removed && !a.failed; }); }
  function settle(plan) { var v = C.validate.validatePlan(plan, live()); S.lastFixes = v.fixes; S.lastWarnings = v.warnings; return v.plan; }

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
    var html = C.render.renderCreative(S.plan, live(), { mode: 'preview', src: srcFor, motion: S.previewMotion });
    var y = 0; try { y = first ? 0 : frame.contentWindow.scrollY; } catch (e) { y = 0; }
    frame.onload = function () { try { if (y) frame.contentWindow.scrollTo(0, y); } catch (e) { /* ignore */ } };
    frame.srcdoc = html; S.lastHtml = html;
    els.csEmpty.hidden = true; els.csViewport.hidden = false; fit();
  }
  function fit() {
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
  function buildEditor() {
    showFixture();
    var u = S.understanding || {}; var asks = [];
    if (u.kind === 'personal') {
      if (!S.assets.some(function (a) { return a.origin === 'upload' && !a.removed; })) asks.push('Add a photo of ' + (u.name || 'your ' + u.noun) + ' — the page never uses other pictures for them.');
      if (!lines(S.suppliedText).length) asks.push('Add a few true details about ' + (u.name || 'them') + ' under “Your own details”, then create the page again.');
    }
    (S.lastWarnings || []).forEach(function (w) { asks.push(w); });
    els.csAsks.hidden = !asks.length; els.csAsks.innerHTML = asks.map(function (a) { return '<p>' + esc(a) + '</p>'; }).join('');
    // words
    var words = root.querySelector('[data-panel="words"]');
    words.innerHTML = '<p class="cs-hint">Edits show on the page as you type. A fact you rewrite becomes your own words and loses its source mark.</p>' + fieldsFor(S.plan).map(function (g) {
      return '<fieldset><legend>' + esc(g[0]) + '</legend>' + g[1].map(function (f) { var v = getPath(S.plan, f[0]); return '<label>' + esc(f[1]) + '<textarea rows="' + (String(v || '').length > 90 ? 3 : 1) + '" data-key="' + esc(f[0]) + '">' + esc(v || '') + '</textarea></label>'; }).join('') + '</fieldset>';
    }).join('');
    [].forEach.call(words.querySelectorAll('textarea[data-key]'), function (ta) {
      ta.addEventListener('input', function () {
        var key = ta.getAttribute('data-key'); setPath(S.plan, key, ta.value);
        var m = /^sections\.(\d+)\.items\.(\d+)\.text$/.exec(key);
        if (m) { var it = S.plan.sections[+m[1]].items[+m[2]]; if (it.kind === 'sourced') { it.kind = 'supplied'; delete it.cite; } }
        if (key === 'hero.title.lede' && S.plan.hero.title.ledeKind === 'sourced') { S.plan.hero.title.ledeKind = 'supplied'; S.plan.hero.title.cite = null; }
        post({ type: 'cr-edit', key: key, text: ta.value }); markDirty();
      });
      ta.addEventListener('change', function () { S.plan = settle(S.plan); refresh(); });
    });
    buildPictures(); buildMotion(); buildSources();
  }
  function roleOf(a) {
    var p = S.plan; if (!p) return 'Unused';
    if (p.hero.layers.some(function (l) { return l.asset === a.id && l.role === 'subject'; })) return 'Main picture';
    if (p.hero.layers.some(function (l) { return l.asset === a.id; })) return 'Hero companion';
    var n = p.sections.filter(function (s) { return s.asset === a.id || (s.assets || []).indexOf(a.id) >= 0; }).length;
    return n ? 'In ' + n + ' section' + (n > 1 ? 's' : '') : 'Unused';
  }
  function buildPictures() {
    var panel = root.querySelector('[data-panel="pictures"]');
    var list = S.assets.filter(function (a) { return !a.removed && a.origin !== 'derived'; });
    panel.innerHTML = '<p class="cs-hint">Pictures come from your uploads or from Wikimedia Commons (free licences only, credited on the page). Cutouts are made here in your browser.</p>'
      + list.map(function (a) {
        var cut = S.assets.find(function (x) { return x.cutoutOf === a.id && !x.removed; });
        var role = roleOf(a); var cutRole = cut ? roleOf(cut) : '';
        var src = a.origin === 'upload' ? 'Your upload' + (S.fixture ? ' (test fixture)' : '') : 'Wikimedia Commons' + (a.author ? ' · ' + esc(a.author.slice(0, 60)) : '') + ' · ' + esc(a.license || '');
        return '<div class="cs-pic' + (a.failed ? ' is-failed' : '') + '"><img src="' + esc(cut ? cut.dataUrl : a.dataUrl) + '" alt=""' + (cut ? ' class="is-cut"' : '') + '>'
          + '<div><strong>' + esc(C.render.cleanTitle(a.title).slice(0, 70)) + '</strong><small>' + (a.pageUrl ? '<a href="' + esc(a.pageUrl) + '" target="_blank" rel="noopener">' + src + '</a>' : src) + '</small>'
          + '<small>' + (a.assess ? a.assess.width + '×' + a.assess.height : '') + ' · ' + esc(cut ? cutRole : role) + '</small><small class="cs-proc">' + esc((cut && cut.processing) || a.processing || '') + '</small>'
          + '<div class="cs-pic-actions"><button type="button" data-main="' + esc(cut ? cut.id : a.id) + '">Use as main</button><button type="button" data-replace="' + esc(a.id) + '">Replace…</button><button type="button" data-remove="' + esc(a.id) + '">Remove</button></div></div></div>';
      }).join('') + '<button type="button" class="cs-btn cs-ghost" id="csAddPic">+ Add a picture</button>';
    [].forEach.call(panel.querySelectorAll('[data-main]'), function (b) { b.addEventListener('click', function () { useAsMain(b.getAttribute('data-main')); }); });
    [].forEach.call(panel.querySelectorAll('[data-remove]'), function (b) { b.addEventListener('click', function () { removeAsset(b.getAttribute('data-remove')); }); });
    [].forEach.call(panel.querySelectorAll('[data-replace]'), function (b) { b.addEventListener('click', function () { pickFile(function (file) { replaceAsset(b.getAttribute('data-replace'), file); }); }); });
    document.getElementById('csAddPic').addEventListener('click', function () { els.csUpload.click(); });
  }
  function pickFile(cb) { var inp = h('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp' }); inp.addEventListener('change', function () { if (inp.files && inp.files[0]) cb(inp.files[0]); }); inp.click(); }
  function rebuildHero() { var u = S.understanding || {}; S.plan = settle(C.director.redirectHero(S.plan, live(), u)); }
  function useAsMain(id) { S.assets.forEach(function (a) { if (a.relevance >= 5 && a.id !== id) a.relevance = a.origin === 'upload' ? 2 : 1; }); var a = S.assets.find(function (x) { return x.id === id; }); if (!a) return; a.relevance = 5; rebuildHero(); refresh(); buildEditor(); markDirty(); }
  function removeAsset(id) {
    S.assets.forEach(function (a) { if (a.id === id || a.cutoutOf === id) { a.removed = true; delete a.dataUrl; } });
    renderThumbs(); if (!S.plan) return;
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
    var ids = list.map(function (a) { return a.id; }); var g = S.plan.sections.find(function (s) { return s.type === 'gallery'; });
    if (g) g.assets = (g.assets || []).concat(ids).slice(0, 6);
    else { var at = Math.max(0, S.plan.sections.findIndex(function (s) { return s.type === 'closing' || s.type === 'sources'; })); S.plan.sections.splice(at, 0, { id: 's-gallery-u', type: 'gallery', kind: S.understanding && S.understanding.kind === 'personal' ? 'supplied' : 'mixed', eyebrow: 'Pictures', title: 'Moments', assets: ids, layout: 'scatter' }); }
  }
  function buildMotion() {
    var panel = root.querySelector('[data-panel="motion"]'); var p = S.plan;
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
      + '<p class="cs-hint">Cost of this page: ' + (S.cost.researchRequests || 0) + ' requests to Wikipedia / Wikimedia Commons (' + kb + ' KB) · 0 paid AI calls · 0 generated images · 0 credits.</p>';
  }
  function markDirty() { S.dirty = true; setSaveState('Unsaved changes'); els.csSave.disabled = false; }
  function setSaveState(t) { els.csSaveState.textContent = t; }

  // ---------- save / reopen ----------
  function direction() {
    return {
      mode: 'creative', meta: { id: S.localId || (S.localId = 'creative_' + Date.now().toString(36)), createdAt: S.createdAt || (S.createdAt = new Date().toISOString()), version: 'creative-1' },
      pages: [{ id: 'creative', label: 'Creative page', sections: [] }],
      creative: { v: 1, brief: S.brief, understanding: S.understanding, supplied: supplied(), research: S.research, assets: S.assets, plan: S.plan, motion: { intensity: S.plan.motion.intensity }, cost: S.cost, fixture: S.fixture || undefined, updatedAt: new Date().toISOString() },
    };
  }
  function save() {
    if (!S.plan || S.saving) return; if (!signedIn()) { needSignIn('Sign in to save your Creative page.'); return; }
    S.saving = true; els.csSave.disabled = true; setSaveState('Saving…');
    var body = { name: S.name || S.plan.hero.title.text, directionsState: { directions: [direction()], activeDirectionIndex: 0 } };
    var req = S.projectId ? api('/api/projects/' + encodeURIComponent(S.projectId), { method: 'PUT', body: Object.assign({ expectedRevision: S.revision }, body) }) : api('/api/projects', { method: 'POST', body: body });
    return req.then(function (r) {
      S.saving = false;
      if (r.ok && r.data.ok) {
        S.projectId = r.data.project.id; S.revision = r.data.project.revision; S.dirty = false; setSaveState('Saved to your account'); els.csSave.disabled = true;
        try { localStorage.setItem(POINTER, JSON.stringify({ id: S.projectId, name: body.name })); } catch (e) { /* optional */ }
        if (typeof loadOwnedProjectsList === 'function') loadOwnedProjectsList();
      } else if (r.data && r.data.reason === 'conflict') { setSaveState('Changed on another device — reopen it from your projects to see that version.'); els.csSave.disabled = false; }
      else { setSaveState((r.data && r.data.message) || 'Could not save — try again.'); els.csSave.disabled = false; }
      return r;
    });
  }
  function loadProject(p) {
    var d = (p.directionsState.directions || []).find(function (x) { return x && x.mode === 'creative'; }); if (!d || !d.creative) return fail('That project has no Creative page.');
    var c = d.creative; S = fresh();
    S.projectId = p.id; S.revision = p.revision; S.name = p.name; S.localId = d.meta && d.meta.id; S.createdAt = d.meta && d.meta.createdAt;
    S.brief = c.brief || ''; S.understanding = c.understanding; S.research = c.research; S.assets = c.assets || []; S.fixture = c.fixture || '';
    S.suppliedText = ((c.supplied && c.supplied.facts) || []).join('\n'); S.memoriesText = ((c.supplied && c.supplied.memories) || []).join('\n'); S.cost = Object.assign(S.cost, c.cost || {});
    resetUI();
    if (!c.plan) { els.csEmpty.hidden = false; return; }
    S.plan = settle(c.plan); els.csBriefStep.hidden = true; els.csEditor.hidden = false; buildEditor(); refresh(true);
    setSaveState('Opened from your account'); els.csSave.disabled = true;
    try { localStorage.setItem(POINTER, JSON.stringify({ id: p.id, name: p.name })); } catch (e) { /* optional */ }
  }

  window.SiteRemadeCreativeStudio = {
    open: open, close: close,
    // review / test hooks (no network, no side effects beyond this studio)
    state: function () { return S; }, html: function () { return S && S.lastHtml; }, save: save, create: create,
    setFixture: function (text) { if (!root) { build(); S = fresh(); resetUI(); } S.fixture = String(text || '').slice(0, 160); showFixture(); },
    addFiles: function (files) { return addUploads(files); },
  };
})();
