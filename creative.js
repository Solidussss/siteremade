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
      projectId: null, revision: null, name: '', dirty: false, busy: false, device: 'desktop', previewMotion: 'full', fixture: '', planMeta: null, history: [], previous: null, understandMeta: null, mainAsset: null, abstractChosen: false, refines: 0, directing: false,
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
      '<p class="cs-cost" id="csCostNote">Uses Wikipedia, Wikimedia Commons, web search and your own pictures, and paid AI calls (understanding, picture checks, direction, fact checks) within this site\'s daily limit. No AI image generation; no credits charged.</p>',
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
      // a logo or a map is never lifted out as a floating layer
      var reference = asset.curation && (asset.curation.role === 'logo' || asset.curation.role === 'reference');
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
        renderThumbs(); if (S.gate) showGate(S.gate);
        if (S.plan && S.plan.v === 2) { buildEditor(); markDirty(); }
        else if (S.plan) { placeNewUploads(list); rebuildHero(); refresh(); }
      });
    });
  }
  function renderThumbs() {
    var ups = S.assets.filter(function (a) { return a.origin === 'upload' && !a.removed; });
    var roles = [['auto', 'Let the page decide'], ['main', 'Main subject'], ['supporting', 'Supporting'], ['background', 'Background'], ['logo', 'Logo']];
    els.csThumbs.innerHTML = ups.map(function (a) { var r = S.mainAsset === a.id ? 'main' : (a.ownerRole || 'auto'); return '<figure><img src="' + esc(a.dataUrl) + '" alt=""><button type="button" data-rm="' + esc(a.id) + '" aria-label="Remove">×</button><select data-role-for="' + esc(a.id) + '" aria-label="Use this picture as">' + roles.map(function (x) { return '<option value="' + x[0] + '"' + (x[0] === r ? ' selected' : '') + '>' + x[1] + '</option>'; }).join('') + '</select>' + (a.ownerAffirmed ? '<small title="You said you have the rights to use it">from the web · your rights</small>' : '') + '</figure>'; }).join('');
    [].forEach.call(els.csThumbs.querySelectorAll('[data-rm]'), function (b) { b.addEventListener('click', function () { removeAsset(b.getAttribute('data-rm')); }); });
    [].forEach.call(els.csThumbs.querySelectorAll('[data-role-for]'), function (sel) { sel.addEventListener('change', function () { setUploadRole(sel.getAttribute('data-role-for'), sel.value); }); });
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
    steps([['understand', 'Understanding the brief'], ['research', 'Looking it up (encyclopedia and free-licence pictures)'], ['pictures', 'Reading the pictures (size, background, cutouts)'], ['direct', 'Directing the page'], ['build', 'Building the page']]);
    var uploads = S.assets.filter(function (a) { return a.origin === 'upload' && !a.removed; });
    step('understand', 'active', 'Reading the brief, then looking it up: encyclopedia, Wikimedia Commons, web search if needed, and a check of the pictures (up to a minute)');
    var t0 = Date.now();
    return api('/api/creative/research', { method: 'POST', body: { brief: S.brief, supplied: S.suppliedText, choice: choice || '', hasUploads: uploads.length } }).then(function (r) {
      if (r.status === 401) { S.busy = false; els.csCreate.disabled = false; els.csBriefStep.hidden = false; needSignIn('Sign in to make a Creative page.'); return; }
      if (!r.ok || !r.data.ok) { step('understand', 'failed', (r.data && r.data.message) || 'The lookup failed.'); return fail((r.data && r.data.message) || 'The lookup failed. Please try again.'); }
      var d = r.data; S.understanding = d.understanding; S.understandMeta = d.understandMeta || null; S.research = d.research; S.choice = choice || '';
      var u = d.understanding || {};
      step('understand', 'done', describeUnderstanding(u) + (S.understandMeta && S.understandMeta.source === 'ai' ? ' · AI (' + ((S.understandMeta.ms || 0) / 1000).toFixed(1) + 's)' : ' · built-in reader' + (S.understandMeta && S.understandMeta.reason ? ' (' + S.understandMeta.reason + ')' : '')));
      if (d.research.log) { S.cost.researchRequests += d.research.log.requests || 0; S.cost.researchBytes += d.research.log.bytes || 0; }
      if (d.research.status === 'ambiguous') { step('research', 'wait', d.research.question || 'More than one thing is called that'); return askChoice(d.research.options || [], d.research.question); }
      var cw = (d.research.curation && d.research.curation.web) || null; var fromWeb = (d.images || []).filter(function (i) { return i.found === 'web'; }).length;
      var note = d.research.page ? d.research.page.title + ' · ' + (d.research.facts || []).length + ' facts · ' + d.images.length + ' pictures' + (cw && cw.ran ? ' (' + fromWeb + ' from a web search of ' + (cw.pages || 0) + ' pages' + (cw.review ? '; ' + cw.review + ' more to review' : '') + ')' : '') : (u.kind === 'fictional' || u.kind === 'invented') && !d.research.page ? 'Nothing looked up' : 'Nothing found — the page uses your words and pictures';
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
    return S.assets.some(function (a) { if (a.removed || a.failed) return false; if (a.origin === 'upload') return a.ownerRole !== 'logo' && a.ownerRole !== 'background'; var k = a.curation; return !!(k && (k.role === 'subject' || k.role === 'detail') && k.identity !== 'other'); });
  }
  function mainProblem() {
    var a = S.mainAsset && S.assets.find(function (x) { return x.id === S.mainAsset && !x.removed; }); if (!S.mainAsset) return ''; if (!a) return 'The picture you chose as the main subject is no longer here.';
    if (a.failed) return 'The picture you chose as the main subject could not be read. Choose another or upload it again.';
    var w = a.assess && a.assess.width, hh = a.assess && a.assess.height; if (w && hh && Math.max(w, hh) < 300) return 'The picture you chose as the main subject is too small (' + w + '×' + hh + ' px) to lead a page. Upload a larger one.';
    return '';
  }
  function afterPictures() {
    var problem = mainProblem();
    if (problem || (needsSubjectPicture() && !usableSubject())) { S.busy = false; showGate({ problem: problem }); return Promise.resolve(); }
    return proceedToDirection();
  }
  function proceedToDirection() {
    // one direction at a time: a second call (a repeated click at the gate) while one is being planned does nothing
    if (S.directing) return Promise.resolve();
    S.directing = true; S.gate = null; els.csChoices.innerHTML = ''; S.busy = true; els.csCreate.disabled = true;
    return planDirection('').then(function () {
      S.directing = false;
      step('build', 'active'); refresh(true); step('build', 'done');
      S.busy = false; els.csCreate.disabled = false; S.dirty = true; S.name = pageTitle(); setSaveState('Not saved yet'); els.csSave.disabled = false;
      els.csProgress.hidden = true; els.csEditor.hidden = false; buildEditor();
    }, function (e) { S.directing = false; throw e; });
  }
  function showGate(g) {
    S.gate = g || {}; var u = S.understanding || {}; var name = (u.identity && u.identity.name) || u.subject || 'the subject';
    var cur = (S.research && S.research.curation) || {}; var review = (S.research && S.research.review) || []; var web = cur.web || {};
    var sources = 'Wikimedia Commons' + (web.ran ? ' and a web search' : '');
    step('direct', 'wait', 'Waiting for your choice (nothing is spent until you continue)');
    var h1 = S.gate.problem ? '<p><strong>' + esc(S.gate.problem) + '</strong></p>' : '<p><strong>We couldn\'t find usable artwork of ' + esc(name) + ' through ' + sources + '.</strong></p>' + (cur.missing && cur.missing.length ? '<p class="cs-hint">Missing: ' + cur.missing.map(esc).join(' · ') + '</p>' : '') + (web.ran === false && web.reason ? '<p class="cs-hint">Web search did not run: ' + esc(web.reason) + '</p>' : web.error ? '<p class="cs-hint">Web search: ' + esc(web.error) + '</p>' : '');
    var cards = review.map(function (r, i) {
      return '<div class="cs-review"><div class="cs-review-img">' + (r.preview ? '<img src="' + esc(r.preview) + '" alt="">' : '<span>No preview</span>') + '</div><div><strong>' + esc(r.depicts || r.title) + '</strong><small>' + esc(r.site || '') + ' · ' + esc(r.width + '×' + r.height) + '</small>'
        + '<small class="cs-perm">' + (r.permission.status === 'restricted' ? 'Rights reserved' : 'Permission unclear') + (r.permission.licence ? ' (' + esc(r.permission.licence) + ')' : '') + ' — ' + esc(r.permission.note || '') + '</small>'
        + '<a href="' + esc(r.pageUrl) + '" target="_blank" rel="noopener">Open its page ↗</a> <button type="button" class="cs-btn cs-ghost" data-adopt="' + i + '">Use it — I have the rights</button></div></div>';
    }).join('');
    var ok = usableSubject() && !S.gate.problem;
    els.csChoices.innerHTML = '<div class="cs-gate">' + h1
      + (review.length ? '<p>Found, but not free to republish automatically — open the page, and use one only if you have the rights to it:</p>' + cards : '')
      + '<div class="cs-gate-actions">' + (ok ? '<button type="button" class="cs-btn cs-primary" id="csGateGo">Continue with these pictures</button>' : '') + '<button type="button" class="cs-btn" id="csGateUpload">Upload pictures</button>'
      + (S.refines < 2 ? '<span class="cs-refine"><input type="text" id="csGateQuery" maxlength="100" placeholder="Search again for… (e.g. ' + esc(name) + ' official artwork)"><button type="button" class="cs-btn cs-ghost" id="csGateSearch">Search again</button></span>' : '')
      + (S.gate.problem ? '' : '<button type="button" class="cs-btn cs-ghost" id="csGateAbstract">Continue with an abstract page instead</button>') + '</div>'
      + '<p class="cs-hint">Your brief and research are kept whichever you choose.</p></div>';
    // one choice per gate: the buttons that start paid work lock the gate so a repeated click cannot start it twice
    var lock = function () { [].forEach.call(els.csChoices.querySelectorAll('.cs-gate button'), function (b) { b.disabled = true; }); };
    var go = document.getElementById('csGateGo'); if (go) go.addEventListener('click', function () { if (S.busy) return; lock(); proceedToDirection(); });
    document.getElementById('csGateUpload').addEventListener('click', function () { S.gateUploadPending = true; els.csUpload.click(); });
    var ab = document.getElementById('csGateAbstract'); if (ab) ab.addEventListener('click', function () { if (S.busy) return; lock(); S.abstractChosen = true; proceedToDirection(); });
    var sb = document.getElementById('csGateSearch'); if (sb) sb.addEventListener('click', function () { var q = document.getElementById('csGateQuery').value.trim(); if (q && !S.busy) { lock(); refineSearch(q); } });
    [].forEach.call(els.csChoices.querySelectorAll('[data-adopt]'), function (b) { b.addEventListener('click', function () { adoptFound(review[+b.getAttribute('data-adopt')], b); }); });
  }
  // a found picture the owner has the rights to: fetched by the server (only one it offered), then the owner's own
  function adoptFound(r, btn) {
    if (!r || !window.confirm('Use this picture on your page? Only do this if you have the rights to use it (your own, licensed to you, or free to reuse). The page will record it as supplied by you.')) return;
    btn.disabled = true; btn.textContent = 'Fetching…';
    return api('/api/creative/fetch-image', { method: 'POST', body: { url: r.imageUrl } }).then(function (res) {
      if (!res.ok || !res.data.ok) { btn.disabled = false; btn.textContent = 'Use it — I have the rights'; els.csError.hidden = false; els.csError.textContent = (res.data && res.data.message) || 'Could not fetch that picture.'; return; }
      var a = { id: 'u' + Date.now().toString(36) + 'w', origin: 'upload', title: r.depicts || r.title, alt: r.depicts || '', relevance: 2, dataUrl: res.data.dataUrl, mime: res.data.mime, sourceUrl: r.imageUrl, pageUrl: r.pageUrl, ownerAffirmed: true, rightsEvidence: ['supplied by the page owner, who affirmed they have the rights; found at ' + r.pageUrl].concat(r.permission.evidence || []).slice(0, 3), ownerRole: 'auto' };
      return processAsset(a).then(function (group) { S.assets = S.assets.concat(group); if (!S.mainAsset) { S.mainAsset = a.id; a.ownerRole = 'main'; } renderThumbs(); showGate(S.gate); });
    });
  }
  // search again with the owner's words: the understanding is reused (no new understanding call)
  function refineSearch(q) {
    S.refines++; step('research', 'active', 'Searching again for “' + q + '”…'); els.csChoices.innerHTML = '';
    var uploads = S.assets.filter(function (a) { return a.origin === 'upload' && !a.removed; });
    return api('/api/creative/research', { method: 'POST', body: { brief: S.brief, supplied: S.suppliedText, refine: q, understanding: S.understanding, hasUploads: uploads.length } }).then(function (r) {
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
    return live().map(function (a) { return { id: a.id, origin: a.origin, title: a.title, description: a.description, alt: a.alt, author: a.author, license: a.license, licenseUrl: a.licenseUrl, pageUrl: a.pageUrl, found: a.found, relevance: a.relevance, assess: a.assess, caps: a.caps, cutout: a.cutout, cutoutOf: a.cutoutOf, illustration: a.illustration, mime: a.mime, kind: a.kind, curation: a.curation }; });
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
  function ctx2() { var sp = supplied(); return { page: (S.research && S.research.page) || null, mainAsset: null, assets: live(), facts: (S.research && S.research.facts) || (S.plan && S.plan.facts) || [], understanding: legacyU(), supplied: sp.facts.concat(sp.memories) }; }
  function liveMain() { var a = S.mainAsset && S.assets.find(function (x) { return x.id === S.mainAsset && !x.removed && !x.failed; }); return a ? a.id : null; }
  function planDirection(avoid) {
    step('direct', 'active', 'The AI director is composing the page…'); var t0 = Date.now();
    return thumbnails().then(function (th) {
      var research = S.research || {};
      return api('/api/creative/plan', { method: 'POST', body: { brief: S.brief, understanding: S.understanding, page: research.page, facts: research.facts || [], supplied: supplied(), assets: inventory(), thumbnails: th, avoid: avoid || '', seed: String(Date.now()), coverage: research.curation || null, mainAsset: liveMain(), abstractChosen: !!S.abstractChosen } });
    }).then(function (r) {
      if (r.status === 401) throw new Error('signed out');
      var d = r.data || {};
      if (r.ok && d.ok && d.plan) {
        var v = C.validate2.validatePlan2(d.plan, Object.assign(ctx2(), { mode: 'safety' })); var plan = v.plan; // accepted by the server: kept as composed if (S.fixture) plan.fixture = S.fixture;
        // the server and the studio both validate: each note once
        var uniq = function (xs) { return xs.filter(function (x, i) { return xs.indexOf(x) === i; }); };
        S.plan = plan; S.lastFixes = uniq((d.fixes || []).concat(v.fixes)); S.lastWarnings = uniq((d.warnings || []).concat(v.warnings));
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
    S.history = (S.history || []).concat([{ title: c.title || '', logline: c.logline || '', source: (S.planMeta && S.planMeta.source) || 'rules', at: new Date().toISOString() }]).slice(-6);
    S.previous = { plan: S.plan, planMeta: S.planMeta };
  }
  function anotherDirection() {
    if (S.busy || !S.plan) return Promise.resolve();
    if (S.dirty && !window.confirm('Try another direction? The current layout is kept so you can go back, but text edits made to it stay with it.')) return Promise.resolve();
    var avoid = S.plan.v === 2 ? (S.plan.concept.title + ': ' + S.plan.concept.logline + ' | scenes: ' + S.plan.scenes.map(function (s) { return s.name || s.purpose; }).join(' / ')) : S.plan.concept.line;
    rememberDirection(); S.busy = true; els.csProgress.hidden = false; steps([['direct', 'Directing the page again, differently'], ['build', 'Building the page']]);
    return planDirection((S.history || []).map(function (h) { return h.title + ': ' + h.logline; }).slice(-3).concat([avoid]).join(' || ')).then(function () {
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
  function direct() {
    var u = legacyU(); var research = S.research || {};
    var plan = C.director.direct({ understanding: u, research: { page: research.page, facts: research.facts || [] }, assets: live(), supplied: supplied(), seed: S.brief + '|' + (S.choice || '') });
    if (S.fixture) plan.fixture = S.fixture;
    S.plan = settle(plan);
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
    var html = S.plan.v === 2 ? C.render2.renderCreative2(S.plan, live(), { mode: 'preview', src: srcFor, motion: S.previewMotion }) : C.render.renderCreative(S.plan, live(), { mode: 'preview', src: srcFor, motion: S.previewMotion });
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
  function directionPanel() {
    var m = S.planMeta || { source: 'rules' }; var p = S.plan; var u = S.understanding || {};
    var badge = m.source === 'ai' ? '<span class="cs-src is-ai">AI direction</span>' : m.source === 'mock' ? '<span class="cs-src is-mock">MOCKED plan (test provider)</span>' : '<span class="cs-src is-fallback">Built-in layout — not AI direction</span>';
    var head = p.v === 2 ? '<strong>' + esc(p.concept.title || 'Untitled concept') + '</strong><p>' + esc(p.concept.logline) + '</p>' + (p.concept.why ? '<p class="cs-hint">' + esc(p.concept.why) + '</p>' : '') : '<p>' + esc(p.concept.line) + '</p>';
    var meta = m.source === 'ai' || m.source === 'mock' ? '<p class="cs-hint">' + esc(m.model || '') + ' · ' + ((m.ms || 0) / 1000).toFixed(1) + ' s · ' + (m.attempts || 1) + ' call' + ((m.attempts || 1) > 1 ? 's (one repair)' : '') + ' · about $' + (m.usdEstimated || 0).toFixed(3) + ' (estimated)</p>' : '<p class="cs-hint">Why: ' + esc(m.reason || 'AI direction is not available here') + '</p>';
    var ident = u.identity ? '<p class="cs-hint">Understood as: <strong>' + esc(u.identity.name) + '</strong> — ' + esc(u.identity.what || u.identity.kind) + (u.tone && u.tone.register ? ' · tone: ' + esc(u.tone.register) : '') + (u.motifs && u.motifs.length ? ' · motifs: ' + esc(u.motifs.slice(0, 5).join(', ')) : '') + '</p>' + (u.uncertainty && u.uncertainty.length ? '<p class="cs-hint">Uncertain: ' + esc(u.uncertainty.join(' · ')) + '</p>' : '') : '';
    var missing = p.v === 2 ? p.wants.filter(function (w) { return w.status === 'missing'; }) : [];
    var wants = missing.length ? '<div class="cs-wants"><p><strong>Pictures the direction wanted but we couldn\'t find among the usable ones (Wikimedia Commons, web search, your uploads):</strong></p><ul>' + missing.map(function (w) { return '<li>' + esc(w.description) + (w.fallback ? ' <small>— instead: ' + esc(w.fallback) + '</small>' : '') + '</li>'; }).join('') + '</ul><button type="button" class="cs-btn cs-ghost" data-upload>Upload a picture</button></div>' : '';
    // the subject's imagery: degraded is said out loud, with the one picture that would fix it
    var im = p.v === 2 && p.imagery; var imagery = '';
    if (im && im.degraded) imagery = '<div class="cs-degraded"><p><strong>Degraded: ' + esc(im.note || 'the subject itself is not shown') + '.</strong></p>' + (im.missing && im.missing.length ? '<p>Missing: ' + im.missing.map(esc).join(' · ') + '</p>' : '') + '<p class="cs-hint">No free-licence picture of it was found. Upload one (your own, or one you have the rights to) and the page will use it.</p><button type="button" class="cs-btn" data-upload>Upload the missing picture</button></div>';
    else if (im && im.status === 'form') imagery = '<p class="cs-hint">Shown through a real-world form: ' + esc(im.note || '') + '</p>';
    var cur = S.research && S.research.curation;
    var check = cur ? '<p class="cs-hint">Picture check: ' + (cur.source === 'ai' ? 'the subject is ' + ({ strong: 'well covered', partial: 'only partly covered', none: 'not covered' }[cur.coverage] || 'unknown') + ' (' + (cur.judged || 0) + ' of ' + (cur.of || 0) + ' candidates looked at' + (cur.usd ? ', about $' + Number(cur.usd).toFixed(3) : '') + ')' : 'keyword ranking only — ' + esc(cur.reason || 'no picture check')) + '</p>' : '';
    var cl = p.v === 2 && p.claims; var claims = '';
    if (cl) claims = cl.status === 'verified' ? '<p class="cs-hint">Words checked against the facts: every line (' + cl.checked + ')' + (cl.removed ? ' · ' + cl.removed + ' unsupported line(s) taken out' : '') + '</p>' : cl.status === 'partial' ? '<p class="cs-warn">Words only partly checked: ' + cl.checked + ' of ' + cl.of + ' lines; the rest were taken out.</p>' : cl.status === 'unchecked' ? '<p class="cs-warn">The words could NOT be checked against the facts; invented paragraphs were left out.</p>' : '<p class="cs-hint">Claim check off.</p>';
    var old = p.v === 2 && p.layout && p.layout.version < C.validate2.LAYOUT_VERSION ? '<p class="cs-hint">This page was composed under older layout rules and stays exactly as saved. <button type="button" class="cs-btn cs-ghost" id="csRecompose">Re-apply today\'s layout rules</button></p>' : '';
    var lim = p.v === 2 && p.limitations.length ? '<details><summary>Limitations noted by the director (' + p.limitations.length + ')</summary><ul>' + p.limitations.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul></details>' : '';
    var hist = (S.history || []).length ? '<details><summary>Earlier directions (' + S.history.length + ')</summary><ul>' + S.history.map(function (h) { return '<li>' + esc(h.title ? h.title + ': ' : '') + esc(h.logline) + ' <small>(' + esc(h.source) + ')</small></li>'; }).join('') + '</ul></details>' : '';
    return '<div class="cs-direction">' + badge + head + meta + ident + imagery + check + claims + wants + old + lim + hist + '<div class="cs-dir-actions"><button type="button" class="cs-btn" id="csAnother">Try another direction</button>' + (S.previous ? '<button type="button" class="cs-btn cs-ghost" id="csPrevious">Back to the previous one</button>' : '') + '</div></div>';
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
    buildPictures(); buildMotion(); buildSources();
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
    panel.innerHTML = '<p class="cs-hint">Pictures come from your uploads or from Wikimedia Commons (free licences only, credited on the page). Cutouts are made here in your browser.</p>'
      + list.map(function (a) {
        var cut = S.assets.find(function (x) { return x.cutoutOf === a.id && !x.removed; });
        var role = roleOf(a); var cutRole = cut ? roleOf(cut) : '';
        var src = a.origin === 'upload' ? 'Your upload' + (S.fixture ? ' (test fixture)' : '') : 'Wikimedia Commons' + (a.author ? ' · ' + esc(a.author.slice(0, 60)) : '') + ' · ' + esc(a.license || '');
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
      if (f && f.kind === 'image') { f.asset = id; if (a.focus) f.focus = a.focus; if (!(a.caps && a.caps.moveFreely)) { f.fit = 'cover'; if (f.mask === 'none') f.mask = 'window'; } else { f.fit = 'contain'; } }
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
          S.plan.scenes.forEach(function (s) { s.layers.forEach(function (L) { if (L.asset === id || (oldCut && L.asset === oldCut.id)) { if (touched.indexOf(s.id) < 0) touched.push(s.id); var free = L.asset === (oldCut && oldCut.id) && nCut; L.asset = free ? nCut.id : na.id; if (!free && (L.mask === 'none' && L.role !== 'backdrop' && L.role !== 'texture')) { L.mask = 'window'; L.fit = 'cover'; } } }); });
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
      + '<p class="cs-hint">Cost of this page: ' + (S.cost.researchRequests || 0) + ' requests to Wikipedia / Wikimedia Commons (' + kb + ' KB) · ' + (S.cost.aiCalls || 0) + ' AI call(s) (direction and claim checks), about $' + (S.cost.aiUsdEstimated || 0).toFixed(3) + ' estimated' + (S.understandMeta && S.understandMeta.source === 'ai' ? ' + understanding about $' + (S.understandMeta.usd || 0).toFixed(4) : '') + ' · 0 generated images · 0 credits.</p>';
  }
  function markDirty() { S.dirty = true; setSaveState('Unsaved changes'); els.csSave.disabled = false; }
  function setSaveState(t) { els.csSaveState.textContent = t; }

  // ---------- save / reopen ----------
  function direction() {
    return {
      mode: 'creative', meta: { id: S.localId || (S.localId = 'creative_' + Date.now().toString(36)), createdAt: S.createdAt || (S.createdAt = new Date().toISOString()), version: 'creative-1' },
      pages: [{ id: 'creative', label: 'Creative page', sections: [] }],
      creative: { v: 1, brief: S.brief, understanding: S.understanding, supplied: supplied(), research: S.research, assets: S.assets, plan: S.plan, planMeta: S.planMeta, history: S.history, mainAsset: liveMain() || undefined, abstractChosen: S.abstractChosen || undefined, motion: { intensity: (S.plan.motion && S.plan.motion.intensity) || 'lively' }, cost: S.cost, fixture: S.fixture || undefined, updatedAt: new Date().toISOString() },
    };
  }
  function save() {
    if (!S.plan || S.saving) return; if (!signedIn()) { needSignIn('Sign in to save your Creative page.'); return; }
    S.saving = true; els.csSave.disabled = true; setSaveState('Saving…');
    var body = { name: S.name || pageTitle(), directionsState: { directions: [direction()], activeDirectionIndex: 0 } };
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
    S.brief = c.brief || ''; S.understanding = c.understanding; S.research = c.research; S.assets = c.assets || []; S.fixture = c.fixture || ''; S.planMeta = c.planMeta || null; S.history = c.history || []; S.mainAsset = c.mainAsset || null; S.abstractChosen = !!c.abstractChosen;
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
    anotherDirection: function () { return anotherDirection(); }, previousDirection: function () { previousDirection(); },
    // the same as "Start a different page", without the confirmation
    reset: function () { if (!root) build(); S = fresh(); resetUI(); var dp = document.getElementById('csDirection'); if (dp) dp.innerHTML = ''; },
  };
})();
