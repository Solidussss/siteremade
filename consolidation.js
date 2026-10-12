/* ONE GENERATOR (the consolidation; on only when the server says so: SITEREMADE_DESIGNS_OPEN=on).
   The homepage's "Describe your business" box starts the new generator (/designs: Create Website routes the business
   to the design that fits, or back here when none does). The Business / Creative switch and the photo button of the
   classic builder are not shown -- they stay for what still needs them: a link that opens an existing project
   (?project=), a business no design fits yet (?describe=, sent back from /designs), and ?creative=1.
   With the switch off this file does nothing and the page is exactly as before. */
(function () {
  'use strict';
  var q = new URLSearchParams(window.location.search);
  if (q.get('project') || q.get('creative') === '1') return; // an existing project, or Creative asked for by name
  var fallback = !!q.get('describe'); // a business no design fits: the classic builder (with its photos), no mode switch
  fetch('/api/site-config', { credentials: 'same-origin', cache: 'no-store' }).then(function (r) { return r.json(); }).then(function (cfg) {
    if (!cfg || !cfg.designsOpen) return;
    document.documentElement.setAttribute('data-one-generator', fallback ? 'classic' : '');
    var hide = function () { (fallback ? ['modeSwitch'] : ['modeSwitch', 'generatorUpload']).forEach(function (id) { var el = document.getElementById(id); if (el) el.hidden = true; }); };
    hide(); new MutationObserver(hide).observe(document.body, { childList: true, subtree: true });
    if (fallback) return;
    var form = document.getElementById('generatorForm');
    if (form) form.addEventListener('submit', function (e) {
      e.preventDefault(); e.stopImmediatePropagation();
      var text = (document.getElementById('generatorInput') || {}).value || '';
      window.location.href = '/designs#create=' + encodeURIComponent(text.trim().slice(0, 2000));
    }, true);
  }).catch(function () { /* the classic page, as before */ });
})();
