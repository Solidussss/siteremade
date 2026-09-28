'use strict';
// Builds <runDir>/index.html: the evidence for one creative-review run -- per brief: what the
// studio understood and produced, the pictures and their provenance, the exported page at
// desktop and phone size (entrance, loop, scroll recordings, full page, reduced motion,
// failed pictures) and the measurements taken while it ran.
//   node test/review/creative-report.js <runDir>
const fs = require('fs');
const path = require('path');
const dir = path.resolve(process.argv[2]);
const studio = JSON.parse(fs.readFileSync(path.join(dir, 'studio-results.json'), 'utf8'));
const cap = fs.existsSync(path.join(dir, 'capture-report.json')) ? JSON.parse(fs.readFileSync(path.join(dir, 'capture-report.json'), 'utf8')) : {};
const calls = fs.existsSync(path.join(dir, 'provider-calls-count.txt')) ? fs.readFileSync(path.join(dir, 'provider-calls-count.txt'), 'utf8').trim() : '?';
const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const rel = f => path.relative(dir, f).split(path.sep).join('/');
const has = f => fs.existsSync(path.join(dir, f));
const img = (f, cls) => (has(f) ? `<a href="${f}"><img class="${cls || ''}" src="${f}" loading="lazy"></a>` : '<span class="miss">missing</span>');
const vid = f => (has(f) ? `<video src="${f}" controls muted loop playsinline preload="metadata"></video>` : '');
const yes = v => (v ? '<b class="ok">yes</b>' : '<b class="bad">no</b>');

function viewBlock(id, view) {
  const r = (cap[id] || {})[view]; const p = `pages/${id}/${view}`;
  if (!r) return `<p class="miss">${view}: not captured</p>`;
  if (r.error) return `<p class="bad">${view}: ${esc(r.error)}</p>`;
  const h = r.hero || {}; const s = h.subject || {};
  const texts = (h.texts || []).map(t => `<tr><td>${esc(t.el)}</td><td>${esc(t.text)}</td><td>${yes(t.inside)}</td><td>${t.clipped ? '<b class="bad">clipped</b>' : 'no'}</td><td>${t.overSubject}</td><td>${t.readable}</td></tr>`).join('');
  return `<div class="view"><h4>${view === 'desktop' ? 'Desktop 1440×900' : 'Phone 390×844'}</h4>
  <div class="row">${img(`${p}/entrance-a.png`)}${img(`${p}/entrance-b.png`)}${img(`${p}/entrance-c.png`)}${img(`${p}/loop-a.png`)}${img(`${p}/loop-b.png`)}</div>
  <p class="cap">entrance (early → settled) · resting loop a / b — ${r.loopChangedPct}% of pixels changed over 3.5 s (motion)</p>
  <div class="row">${vid(`${p}/entrance.mp4`)}${vid(`${p}/scroll.mp4`)}</div>
  <p class="cap">recordings: entrance (${esc(r.entranceVideo)}) · scroll top to bottom (${esc(r.scrollVideo)})</p>
  <table><tr><th>subject on screen</th><td>${s.w}×${s.h}px at ${s.x},${s.y} · ${Math.round((s.viewportShare || 0) * 100)}% of the viewport · ${Math.round((s.uncovered || 0) * 100)}% uncovered</td></tr>
  <tr><th>horizontal overflow</th><td>${h.horizontalOverflow ? '<b class="bad">yes</b>' : 'none'} (scroll steps with overflow: ${(r.scroll && r.scroll.overflowAt.length) || 0})</td></tr>
  <tr><th>blank frames while scrolling</th><td>${(r.scroll && r.scroll.blankFrames.length) || 0} of ${(r.scroll && r.scroll.steps) || 0}</td></tr>
  <tr><th>after scrolling</th><td>sections never revealed: ${r.after.unrevealedCount} · connector drawn: ${r.after.connectorDrawnShare == null ? 'none' : Math.round(r.after.connectorDrawnShare * 100) + '%'} (${r.after.connectorLength}px) · pictures loaded ${r.after.imagesLoaded}/${r.after.images} · clipped headings: ${r.after.clippedHeadings.length}</td></tr>
  <tr><th>reduced motion</th><td>${r.reducedChangedPct}% changed over 3 s (0 = still) · sections unrevealed: ${r.reducedAfter ? r.reducedAfter.unrevealedCount : '?'} · connector drawn: ${r.reducedAfter && r.reducedAfter.connectorDrawnShare != null ? Math.round(r.reducedAfter.connectorDrawnShare * 100) + '%' : '-'}</td></tr></table>
  <table class="small"><tr><th>hero text</th><th></th><th>inside</th><th>clipped</th><th>share over subject</th><th>readable</th></tr>${texts}</table>
  <div class="row">${img(`${p}/reduced-a.png`)}${img(`${p}/failed-hero.png`)}${img(`${p}/failed-section.png`)}</div>
  <p class="cap">reduced motion (first frame, already complete) · main picture file deleted · a section picture deleted</p>
  <details><summary>full page</summary>${img(`${p}/full.png`, 'full')}${has(`${p}/reduced-full.png`) ? `<p class="cap">reduced motion, full page</p>${img(`${p}/reduced-full.png`, 'full')}` : ''}</details></div>`;
}

const cases = studio.cases.map(c => {
  const s = c.summary || {}; const id = c.id; const f = (cap[id] || {}).failure || {};
  const assets = (s.assets || []).map(a => `<tr><td>${esc(a.id)}</td><td>${esc(a.origin)}</td><td>${esc(String(a.title).replace(/^File:/, ''))}</td><td>${esc(a.author)}</td><td>${esc(a.license)}</td><td>${esc(a.size)}</td><td>${esc(a.found)}</td><td>${a.relevance}</td><td>${esc(a.processing)}</td><td>${a.removed ? 'removed' : ''}</td></tr>`).join('');
  const secs = (s.sections || []).map(x => `${esc(x.type)}<small> ${esc(x.kind)}</small>`).join(' → ');
  return `<section id="${id}"><h2>${esc(c.brief)}</h2>
  <p class="meta">understood as <b>${esc(s.understanding && s.understanding.kind)}</b> · subject “${esc(s.understanding && s.understanding.subject)}” · category ${esc(s.category)} · tone ${esc(s.tone)} · created in ${(c.timings.createMs / 1000).toFixed(1)} s · research ${s.research && s.research.log ? `${s.research.log.requests} requests, ${Math.round(s.research.log.bytes / 1024)} KB, ${(s.research.log.ms / 1000).toFixed(1)} s` : 'none'} · page ${Math.round((s.htmlBytes || 0) / 1024)} KB</p>
  <p class="concept">${esc(s.concept)}</p>
  <p>Hero: <b>${esc(s.layout)}</b>, ${(s.layers || []).map(l => `${l.role} ${l.asset} (${l.frame}, ${l.entrance} → ${l.loop})`).join(', ')} · connector <b>${esc(s.connector)}</b></p>
  <p>Sections: ${secs}</p>
  <p class="cap">Composition checks: ${esc((s.fixes || []).join(' · ') || 'none needed')}${(s.warnings || []).length ? ' · warnings: ' + esc(s.warnings.join(' · ')) : ''}</p>
  <div class="row">${img(`${id}-studio-desktop.png`)}${img(`${id}-studio-phone.png`)}${img(`${id}-studio-tab-pictures.png`)}${img(`${id}-studio-tab-sources.png`)}</div>
  <p class="cap">the studio: preview desktop / phone, the Pictures tab (provenance + processing), the Sources tab (facts, credits, cost)</p>
  ${c.edit ? `<p>Text edit: typed a new tagline → shown in the same preview document without a rebuild: ${yes(c.edit.sameDocument && c.edit.shown === c.edit.plan)} ${img(`${id}-studio-edited.png`, 'thumb')}</p>` : ''}
  ${c.replace ? `<p>Picture replacement: main picture ${esc(c.replace.from)} replaced by an upload → hero re-directed as <b>${esc(c.replace.summary.layout)}</b> ${img(`${id}-studio-replaced.png`, 'thumb')}</p>` : ''}
  ${c.remove ? `<p>Picture removal: ${esc(c.remove.asset)} removed → sections now ${esc(c.remove.sections.join(', '))}</p>` : ''}
  <p>Save → reload the whole app → reopen from the account: reopened ${yes(c.reopen && c.reopen.ok)} · scene plan identical ${yes(c.reopen && c.reopen.planIdentical)} · Business state untouched (no Business project written: ${yes(c.reopen && c.reopen.businessUntouched && c.reopen.businessUntouched.lastProject === null)}) · reopen ${c.timings.reopenMs} ms ${img(`${id}-studio-reopened.png`, 'thumb')}</p>
  <details><summary>pictures and provenance (${(s.assets || []).length})</summary><table class="small"><tr><th>id</th><th>origin</th><th>title</th><th>author</th><th>licence</th><th>size</th><th>found by</th><th>relevance</th><th>processing</th><th></th></tr>${assets}</table></details>
  <h3>Exported page</h3><p class="cap">network requests the exported page attempted: ${(cap[id] || {}).blockedCount} · failure test removed: ${esc((f.removed || []).join(', '))} → missing figures shown with stand-ins: ${f.desktopAfter ? f.desktopAfter.missingFigures : '?'}</p>
  ${viewBlock(id, 'desktop')}${viewBlock(id, 'phone')}</section>`;
}).join('');

fs.writeFileSync(path.join(dir, 'index.html'), `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Creative mode review</title><style>
body{font:14px/1.5 system-ui,sans-serif;margin:24px;background:#f4f3f0;color:#111;max-width:1500px}h1{margin:0 0 6px}h2{margin:40px 0 6px;font-size:22px}section{border-top:3px solid #111;padding-top:8px}
.row{display:flex;gap:8px;flex-wrap:wrap;align-items:flex-start}.row img{height:240px;border:1px solid #ccc;background:#fff}.row video{height:260px;background:#000}
img.thumb{height:90px;vertical-align:middle;border:1px solid #ccc}img.full{width:420px;border:1px solid #ccc}.cap{color:#555;font-size:12px;margin:2px 0 12px}.concept{font-size:16px;font-style:italic}
table{border-collapse:collapse;margin:6px 0 10px}td,th{border:1px solid #ddd;padding:3px 6px;text-align:left;vertical-align:top}table.small{font-size:12px}.ok{color:#08711b}.bad{color:#b00020}.miss{color:#b00020}.view{margin:10px 0 18px;padding:10px;background:#fff;border:1px solid #e3e1dc}
.meta{color:#333}small{color:#777}</style></head><body>
<h1>Creative mode — review run</h1>
<p>Real studio (Electron) against a local server.js with every provider key blank; real Wikipedia / Wikimedia Commons; exports compiled by lib/export-compiler.js; captured by test/review/creative-capture.js. Paid provider calls during the run: <b>${esc(calls)}</b>. The Bubbles brief is <b>synthetic test data</b> (labelled on the page).</p>
<p>${studio.cases.map(c => `<a href="#${c.id}">${esc(c.brief)}</a>`).join(' · ')}</p>
<p class="cap">Business page before Creative was chosen: switch shown ${yes(studio.businessBefore && studio.businessBefore.switch)} (review mode) · Creative code loaded ${studio.businessBefore && studio.businessBefore.creativeLoaded ? '<b class="bad">yes</b>' : 'no (lazy)'} ${img('business-with-switch.png', 'thumb')}</p>
${cases}</body></html>`);
console.log('wrote ' + path.join(dir, 'index.html'));
