/* CREATIVE MODE — entry point (small; the only Creative file the Business page loads).
   The Business / Creative switch is available on every builder URL. The studio
   (creative-studio.css, creative-core.js, creative.js) loads only when Creative is chosen. */
(function () {
  'use strict';
  function enabled() { return true; }

  var loading = null;
  function load() {
    if (window.SiteRemadeCreativeStudio) return Promise.resolve(window.SiteRemadeCreativeStudio);
    if (loading) return loading;
    function script(src) { return new Promise(function (resolve, reject) { var s = document.createElement('script'); s.src = src; s.onload = resolve; s.onerror = function () { reject(new Error('Could not load ' + src)); }; document.head.appendChild(s); }); }
    // the deployed build id, uncached: the studio files load as one set that matches the server
    var version = fetch('/api/creative/version', { cache: 'no-store', credentials: 'same-origin' }).then(function (r) { return r.json(); }).then(function (d) { return String(d && d.v || ''); }).catch(function () { return ''; });
    loading = version.then(function (v) {
      var q = v ? '?v=' + encodeURIComponent(v) : '?t=' + Math.floor(Date.now() / 60000);
      var css = document.createElement('link'); css.rel = 'stylesheet'; css.href = 'creative-studio.css' + q; document.head.appendChild(css);
      return script('creative-core.js' + q).then(function () { return script('creative.js' + q); });
    }).then(function () { return window.SiteRemadeCreativeStudio; });
    loading.catch(function () { loading = null; });
    return loading;
  }

  function setMode(mode) {
    var sw = document.getElementById('modeSwitch'); if (!sw) return;
    [].forEach.call(sw.querySelectorAll('button[data-mode]'), function (b) { var on = b.getAttribute('data-mode') === mode; b.setAttribute('aria-pressed', on ? 'true' : 'false'); });
  }
  function openStudio(opts) {
    setMode('creative');
    return load().then(function (studio) { studio.open(Object.assign({ onClose: function () { setMode('business'); } }, opts || {})); })
      .catch(function (e) { setMode('business'); window.alert('Creative mode could not load. ' + e.message); });
  }
  function addSwitch() {
    var form = document.getElementById('generatorForm'); if (!form || document.getElementById('modeSwitch')) return;
    var sw = document.createElement('div'); sw.id = 'modeSwitch'; sw.className = 'mode-switch'; sw.setAttribute('role', 'group'); sw.setAttribute('aria-label', 'What are you making?');
    sw.innerHTML = '<button type="button" data-mode="business" aria-pressed="true">Business website</button><button type="button" data-mode="creative" aria-pressed="false">Creative page <small>preview</small></button>';
    sw.addEventListener('click', function (e) {
      var b = e.target.closest('button[data-mode]'); if (!b) return;
      if (b.getAttribute('data-mode') === 'creative') openStudio(); else { setMode('business'); if (window.SiteRemadeCreativeStudio) window.SiteRemadeCreativeStudio.close(); }
    });
    form.parentNode.insertBefore(sw, form);
    var style = document.createElement('style');
    style.textContent = '.mode-switch{display:inline-flex;gap:4px;padding:4px;margin:0 0 14px;border-radius:999px;background:rgba(127,127,127,.12);border:1px solid rgba(127,127,127,.2)}.mode-switch button{border:0;background:transparent;font:inherit;font-size:14px;font-weight:600;padding:8px 16px;border-radius:999px;cursor:pointer;color:inherit}.mode-switch button[aria-pressed="true"]{background:#fff;color:#111;box-shadow:0 2px 8px rgba(0,0,0,.12)}.mode-switch small{font-weight:500;opacity:.6;margin-left:4px}';
    document.head.appendChild(style);
  }

  window.SiteRemadeCreativeEntry = {
    enabled: enabled,
    open: openStudio,
    // a saved Creative project: always opens in Creative, even when the switch is not shown
    openProject: function (serverProject) { if (!document.getElementById('modeSwitch')) addSwitch(); return openStudio({ project: serverProject }); },
  };
  if (enabled()) { if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', addSwitch); else addSwitch(); }
  // OWNERSHIP + CREDITS: the client app's "Create" view links here with ?studio=creative to start a Creative website
  if (enabled() && /(^|[?&])studio=creative(&|$)/.test(location.search)) { var go = function () { openStudio(); }; if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go); else go(); }
})();
