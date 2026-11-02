// THE STUDIO'S PAID AI SCREENS (server: /api/ai/*, lib/ai-jobs.js): your credits in the header, Buy Credits (the existing
// Stripe packs), and one confirmation before anything paid runs -- balance, what it costs, what's left -- then the job's
// progress and how it ended (what was charged, what was refunded, a retry for what's missing). Prices always come from
// the server; this page never sends one. Uses app.html's api(), esc() and $().
(function () {
  const AI = (window.AI = { cfg: null });
  const css = `
  .cpill{display:inline-flex;align-items:center;gap:6px;height:36px;padding:0 14px;border-radius:999px;border:1px solid var(--line);background:#fff;color:var(--text);font:600 13px/1 Inter,system-ui,sans-serif;cursor:pointer;margin-right:8px;white-space:nowrap}
  .cpill b{font-weight:800}.cpill:hover{border-color:#b9bec8}
  .aimodal{position:fixed;inset:0;z-index:1000;display:grid;place-items:center;padding:16px;background:rgba(13,14,17,.55);backdrop-filter:blur(3px)}
  .aibox{width:min(520px,100%);max-height:calc(100vh - 32px);overflow:auto;background:#fff;border-radius:22px;padding:26px 24px 22px;box-shadow:0 30px 80px rgba(0,0,0,.3)}
  .aibox h2{margin:0 0 6px;font-size:24px;letter-spacing:-.03em}.aibox h2 span{color:var(--muted);font-weight:500}.aibox .sub{margin:0 0 16px;color:var(--muted);font-size:14px;line-height:1.5}
  .aisum{display:grid;grid-template-columns:1fr auto;gap:8px 16px;margin:14px 0;padding:14px 16px;border:1px solid var(--line);border-radius:14px;font-size:15px}
  .aisum b{text-align:right}.aisum .tot{border-top:1px solid var(--line);padding-top:8px;font-weight:700}
  .aiparts{list-style:none;margin:10px 0;padding:0;font-size:14px}.aiparts li{display:flex;justify-content:space-between;gap:12px;padding:7px 0;border-bottom:1px solid #f0f1f4}
  .aiparts .st{font-weight:600}.aiparts .done{color:#118a4e}.aiparts .failed{color:#c0362c}.aiparts .running{color:var(--accent)}
  .aibar{display:flex;gap:10px;flex-wrap:wrap;margin-top:16px}
  .vpk{border:1px solid #e3e5ea;border-radius:16px;padding:14px 16px;margin-top:12px;background:#fafafb}.vpk-row{display:flex;justify-content:space-between;align-items:baseline;font-size:13px;font-weight:600;color:#30333a}.vpk-row b{font-size:15px;color:#111}
  .vpk input[type=range]{width:100%;margin:10px 0 4px;accent-color:#111;height:22px}.vpk-ticks{display:flex;justify-content:space-between;font-size:11px;color:#8a8e98}
  .vpk-q{display:flex;gap:6px;margin:8px 0 2px}.vpk-q button{flex:1;padding:9px 0;border-radius:10px;border:1px solid #d6d9e0;background:#fff;font:inherit;font-size:13px;font-weight:600;color:#30333a;cursor:pointer}.vpk-q button[aria-pressed=true]{background:#111;border-color:#111;color:#fff}
  .vpk-price{display:flex;justify-content:space-between;align-items:center;margin-top:12px;padding-top:12px;border-top:1px solid #e9eaee;font-size:14px;color:#55596a}.vpk-price b{font-size:18px;color:#111}.aimsg{margin:10px 0 0;font-size:14px;color:#c0362c}.aiok{color:#118a4e}
  .aipacks{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin:12px 0}
  .aipack{border:1px solid var(--line);border-radius:14px;padding:14px;background:#fff;text-align:left;cursor:pointer;font:inherit}
  .aipack b{display:block;font-size:20px}.aipack span{color:var(--muted);font-size:13px}.aipack:hover{border-color:var(--text)}
  .aitoast{position:fixed;left:50%;bottom:22px;transform:translateX(-50%);z-index:1001;background:#0d0e11;color:#fff;padding:12px 18px;border-radius:12px;font-size:14px;box-shadow:0 10px 30px rgba(0,0,0,.3)}
  @media(max-width:560px){.aipacks{grid-template-columns:1fr}.cpill{height:32px;padding:0 10px;font-size:12px}}`;
  const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);

  const key = () => (crypto.randomUUID ? crypto.randomUUID().replace(/-/g, '') : String(Date.now()) + Math.random().toString(36).slice(2, 12));
  const n = (x) => `${x} credit${x === 1 ? '' : 's'}`;
  function modal(html) {
    document.querySelectorAll('.aimodal').forEach((m) => m.remove());
    const m = document.createElement('div'); m.className = 'aimodal'; m.innerHTML = `<div class="aibox" role="dialog" aria-modal="true">${html}</div>`;
    document.body.appendChild(m); m.addEventListener('click', (e) => { if (e.target === m && !m.dataset.busy) m.remove(); });
    return m;
  }
  AI.toast = (t) => { const d = document.createElement('div'); d.className = 'aitoast'; d.textContent = t; document.body.appendChild(d); setTimeout(() => d.remove(), 4000); };

  // ---- the header: your balance (signed in only) -> Buy Credits
  function pill() {
    const bar = document.querySelector('.nav-actions'); let p = document.getElementById('crd');
    if (!AI.cfg) { if (p) p.remove(); return; }
    if (!p) { p = document.createElement('button'); p.type = 'button'; p.id = 'crd'; p.className = 'cpill'; bar.prepend(p); p.onclick = () => AI.buy(); }
    p.innerHTML = `<b>${AI.cfg.balance ?? 0}</b> credits`;
  }
  AI.load = async () => { const r = await api('/api/ai/config'); AI.cfg = r.ok ? r : null; pill(); return AI.cfg; };
  AI.refresh = async () => { if (!AI.cfg) return; const r = await api('/api/ai/config'); if (r.ok) { AI.cfg = r; pill(); } };

  // ---- Buy Credits: the existing one-time Stripe packs
  AI.buy = async (why) => {
    const packs = (AI.cfg && AI.cfg.packs) || (await api('/api/billing/catalog')).catalog?.packs || [];
    const m = modal(`<h2>Buy credits <span>· one-time</span></h2><p class="sub">${why ? esc(why) + ' ' : ''}Credits pay for AI updates, images and videos. Editing your website yourself is always free. No subscription.</p>
      <p class="sub">You have <b>${n(AI.cfg ? AI.cfg.balance : 0)}</b>.</p>
      <div class="aipacks">${packs.map((p) => `<button class="aipack" data-pack="${esc(p.id)}"><b>${p.credits} credits</b><span>${esc(p.display)}</span></button>`).join('')}</div>
      <p class="aimsg" id="buyerr"></p><div class="aibar"><button class="button button-secondary" id="buyx">Close</button></div>`);
    m.querySelector('#buyx').onclick = () => m.remove();
    m.querySelectorAll('[data-pack]').forEach((b) => b.onclick = async () => {
      b.disabled = true; const r = await api('/api/credits/checkout', { packId: b.dataset.pack });
      if (r.ok && r.url) { location.href = r.url; return; }
      b.disabled = false; m.querySelector('#buyerr').textContent = r.message || 'Checkout couldn’t start. Try again in a moment.';
    });
  };
  // back from Stripe: the credits arrive when Stripe confirms the payment (a few seconds)
  AI.afterPurchase = async () => {
    const q = new URLSearchParams(location.search); const state = q.get('credits'); if (!state) return;
    history.replaceState(null, '', location.pathname + location.hash);
    if (state === 'cancelled') return AI.toast('Checkout cancelled. Nothing was charged.');
    const id = q.get('purchase'); AI.toast('Payment received. Adding your credits…');
    for (let i = 0; i < 20 && id; i++) { const r = await api('/api/credits/purchases/' + encodeURIComponent(id)); if (r.ok && r.purchase && r.purchase.status === 'fulfilled') { await AI.refresh(); return AI.toast(`${r.purchase.credits} credits added.`); } await new Promise((ok) => setTimeout(ok, 1500)); }
    await AI.refresh();
  };

  // ---- the confirmation: AI.confirm({ kind, body, title, what }) -> resolves with the finished job, or null if cancelled
  const STATUS = { pending: 'Waiting', running: 'Making…', done: 'Done', failed: 'Failed · refunded' };
  AI.confirm = ({ kind, body = {}, title = 'Confirm', what = '' }) => new Promise(async (resolve) => {
    const q = await api('/api/ai/quote', Object.assign({ kind }, body));
    const m = modal(`<h2>${esc(title)}</h2>${what ? `<p class="sub">${esc(what)}</p>` : ''}<div id="aiq"></div>`);
    const box = m.querySelector('#aiq'); const cancel = () => { m.remove(); resolve(null); };
    if (!q.ok) { box.innerHTML = `<p class="aimsg">${esc(q.message || 'This isn’t available right now.')}</p><div class="aibar"><button class="button button-secondary" id="aix">Close</button></div>`; m.querySelector('#aix').onclick = cancel; return; }
    const parts = q.parts.length > 1 ? `<ul class="aiparts">${q.parts.map((p) => `<li><span>${esc(p.what)}</span><span>${n(p.credits)}</span></li>`).join('')}</ul>` : '';
    box.innerHTML = `${parts}<div class="aisum"><span>Your balance</span><b>${n(q.balance)}</b><span>This costs</span><b>${q.owner ? 'Free (owner)' : n(q.credits)}</b><span class="tot">Left after</span><b class="tot">${n(q.after)}</b></div>
      ${q.parts.length > 1 ? '<p class="sub">You’re only charged for what gets made. Anything that fails is refunded, and you can retry just the missing parts.</p>' : '<p class="sub">If it fails, the credits come straight back.</p>'}
      ${q.allowed ? '' : `<p class="aimsg">${esc(q.message)}</p>`}
      <div class="aibar">${q.allowed ? `<button class="button" id="aigo">Confirm · ${q.owner ? 'free' : n(q.credits)}</button>` : q.code === 'balance' ? '<button class="button" id="aibuy">Buy credits</button>' : ''}<button class="button button-secondary" id="aix">Cancel</button></div>`;
    m.querySelector('#aix').onclick = cancel;
    if (m.querySelector('#aibuy')) m.querySelector('#aibuy').onclick = () => { m.remove(); resolve(null); AI.buy('You need more credits for this.'); };
    if (!m.querySelector('#aigo')) return;
    const idemKey = key();   // one key per confirmation: a double click is the same job
    m.querySelector('#aigo').onclick = async () => {
      m.dataset.busy = '1'; m.querySelector('#aigo').disabled = true;
      const r = await api('/api/ai/jobs', Object.assign({ kind, idemKey }, body));
      if (!r.ok) { delete m.dataset.busy; m.querySelector('#aigo').disabled = false; box.insertAdjacentHTML('beforeend', `<p class="aimsg">${esc(r.message || 'It couldn’t start.')}</p>`); if (r.code === 'balance') AI.buy(r.message); return; }
      if (AI.cfg && r.balance != null) { AI.cfg.balance = r.balance; pill(); }
      resolve(await AI.watch(r.job, m, title));
    };
  });

  // ---- a job's progress, until it's done; a partial or failed one can be retried (only what's missing is paid again)
  AI.watch = (job, m, title = 'Working') => new Promise((resolve) => {
    m = m || modal(''); m.dataset.busy = '1';
    const draw = (j, balance) => {
      const end = !['queued', 'running'].includes(j.status);
      const head = { queued: 'Starting…', running: 'Making it…', succeeded: 'Done.', partial: 'Partly done.', failed: 'It didn’t work.' }[j.status];
      m.querySelector('.aibox').innerHTML = `<h2>${esc(title)} <span>· ${esc(head)}</span></h2>
        <ul class="aiparts">${j.parts.map((p) => `<li><span>${j.parts.length > 1 ? `Part ${p.n}` : 'Your request'}</span><span class="st ${p.status}">${STATUS[p.status] || p.status}</span></li>`).join('')}</ul>
        ${end ? `<p class="sub">${j.charged ? `Charged ${n(j.charged)}.` : 'Nothing was charged.'}${j.refunded ? ` ${n(j.refunded)} refunded for what failed.` : ''}${balance != null ? ` You have ${n(balance)} left.` : ''}</p>` : '<p class="sub">You can keep this open. It takes a few seconds for words and pictures, a few minutes for video.</p>'}
        ${j.error && end && j.status !== 'succeeded' ? `<p class="aimsg">${esc(j.error)}</p>` : ''}
        <div class="aibar">${end && j.status !== 'succeeded' ? '<button class="button" id="airetry">Retry what’s missing</button>' : ''}${end ? '<button class="button button-secondary" id="aiclose">Close</button>' : ''}</div>`;
      if (end) {
        delete m.dataset.busy;
        m.querySelector('#aiclose').onclick = () => { m.remove(); resolve(j); };
        if (m.querySelector('#airetry')) m.querySelector('#airetry').onclick = async () => {
          const r = await api(`/api/ai/jobs/${j.id}/retry`, {});
          if (!r.ok) { m.querySelector('.aibox').insertAdjacentHTML('beforeend', `<p class="aimsg">${esc(r.message || 'It couldn’t retry.')}</p>`); if (r.code === 'balance') AI.buy(r.message); return; }
          m.dataset.busy = '1'; tick(r.job);
        };
      }
      return end;
    };
    const tick = async (j) => { if (draw(j)) return; await new Promise((ok) => setTimeout(ok, 2000)); const r = await api('/api/ai/jobs/' + j.id); if (!r.ok) return tick(j);
      if (AI.cfg && r.balance != null) { AI.cfg.balance = r.balance; pill(); } if (draw(r.job, r.balance)) return; tick(r.job); };   // (resolved by Close: they see what was charged first)
    tick(job);
  });

  // ================================================================== MAKE IT YOUR OWN
  const Q = [['feel', 'How should it feel?', 'e.g. dark and premium, warm and family-run, bright and playful'], ['audience', 'Who is it for?', 'e.g. busy professionals, families, first-time buyers'],
    ['colours', 'Colours you like', 'e.g. black and gold, your brand green'], ['story', 'What makes you different?', 'one or two sentences in your own words'],
    ['start', 'Cinematic hero: the opening picture', 'e.g. our empty shop at dawn, chairs waiting'], ['end', 'The closing picture (optional)', 'e.g. the same shop full of customers at night'],
    ['motion', 'What happens in between?', 'e.g. the lights come on one by one and the camera glides to the front desk']];
  AI.ownFields = () => Q.map(([k, l, ph]) => `<label>${esc(l)}<textarea name="own_${k}" rows="2" maxlength="400" placeholder="${esc(ph)}"></textarea></label>`).join('');
  AI.ownAnswers = (root) => Object.fromEntries(Q.map(([k]) => [k, String((root.querySelector(`[name=own_${k}]`) || {}).value || '').trim()]));
  AI.ownMessage = (a) => Q.filter(([k]) => a[k]).map(([k, l]) => `${l.replace(/ \(optional\)$/, '')}: ${a[k]}`).join('\n');
  const KIND = { content: 'Words', design: 'Look', mixed: 'Words and look', none: 'Nothing to change' };
  const cell = (v) => (/^#[0-9a-f]{6}$/i.test(String(v)) ? `<i class="sw" style="background:${esc(v)}"></i>${esc(v)}` : esc(String(v == null ? '—' : typeof v === 'object' ? JSON.stringify(v) : v).replace(/\*/g, '').slice(0, 160)));
  AI.planHtml = (pl) => `<div class="aplan"><p><span class="pill">${esc(KIND[pl.kind] || 'Change')}</span> ${esc(pl.summary || '')}</p>${pl.question ? `<p class="q">${esc(pl.question)}</p>` : ''}
    ${pl.diff && pl.diff.length ? `<ul class="adiff">${pl.diff.map((x) => `<li><b>${esc(x.path)}</b><span>${cell(x.before)} → ${cell(x.after)}</span></li>`).join('')}</ul>` : ''}
    ${pl.cannot && pl.cannot.length ? `<div class="acant"><b>What this design can’t do</b><ul>${pl.cannot.map((c) => `<li>${esc(c)}</li>`).join('')}</ul></div>` : ''}</div>`;
  const resultOf = (job, n = 1) => { const p = job && job.parts.find((x) => x.n === n); return p && p.status === 'done' ? p.result : null; };
  // on a website you have: answers -> a plan (applied for free, with undo) -> start/end pictures -> a video for the hero
  AI.makeItYourOwn = (s, reopen) => {
    const P = (AI.cfg && AI.cfg.prices) || {};
    const m = modal(`<h2>Make it your own <span>· ${esc(s.businessName || 'your site')}</span></h2><p class="sub">Answer what you like. Claude turns it into changes you can check before anything is saved, and the prompts for a cinematic hero. Planning costs ${n(P.own_plan || 3)}; you see the price before each step.</p>
      <form class="bform" id="ownf" style="grid-template-columns:1fr">${AI.ownFields()}</form><p class="aimsg" id="ownerr"></p>
      <div class="aibar"><button class="button" id="owngo">Plan it</button><button class="button button-secondary" id="ownx">Close</button></div>`);
    m.querySelector('#ownx').onclick = () => m.remove();
    m.querySelector('#owngo').onclick = async () => {
      const answers = AI.ownAnswers(m); if (!Object.values(answers).some(Boolean)) { m.querySelector('#ownerr').textContent = 'Answer at least one question.'; return; }
      m.remove();
      const job = await AI.confirm({ kind: 'own_plan', body: { siteId: s.id, answers }, title: 'Make it your own', what: 'Claude plans the changes and writes the image and video prompts. Nothing on your site changes until you apply it.' });
      const r = resultOf(job); if (r) AI.ownResult(s, r, reopen);
    };
  };
  AI.ownResult = (s, r, reopen) => {
    const pr = r.prompts || {}, P = (AI.cfg && AI.cfg.prices) || {};
    const m = modal(`<h2>Your plan</h2>${r.plan ? AI.planHtml(r.plan) + (r.plan.diff && r.plan.diff.length ? '<div class="aibar"><button class="button" id="ownapply">Apply these changes · free</button></div><p class="aiok" id="ownapplied"></p>' : '') : ''}
      <h3 style="margin:18px 0 6px">Cinematic hero <span class="note">optional</span></h3>
      <form class="bform" id="ownp" style="grid-template-columns:1fr"><label>Opening picture<textarea name="start" rows="3">${esc(pr.start || '')}</textarea></label><label>Closing picture <small>optional</small><textarea name="end" rows="3">${esc(pr.end || '')}</textarea></label><label>What happens between<textarea name="motion" rows="2">${esc(pr.motion || '')}</textarea></label></form>
      <div class="aibar"><button class="button" id="ownimg">Make the pictures · ${esc(String(P.image || 2))} credits each</button><button class="button button-secondary" id="ownx">Close</button></div>`);
    m.querySelector('#ownx').onclick = () => m.remove();
    if (m.querySelector('#ownapply')) m.querySelector('#ownapply').onclick = async (e) => {
      e.target.disabled = true; const a = await api(`/api/designs/sites/${s.id}/edit`, { changes: r.plan.changes, ops: r.plan.ops, rename: r.plan.rename, via: 'ask' });
      m.querySelector('#ownapplied').textContent = a.ok ? 'Applied. You can undo it in the editor.' : (a.message || 'It couldn’t be applied.'); if (a.ok) s = a.site;
    };
    m.querySelector('#ownimg').onclick = async () => {
      const f = m.querySelector('#ownp'), start = f.start.value.trim(), end = f.end.value.trim(), motion = f.motion.value.trim();
      if (!start) { f.start.focus(); return; }
      m.remove();
      const job = await AI.confirm({ kind: 'image', body: { siteId: s.id, prompts: end ? [start, end] : [start], aspect: '16:9' }, title: end ? 'The opening and closing pictures' : 'The opening picture' });
      const a = resultOf(job, 1), b = resultOf(job, 2); if (a) AI.ownVideo(s, { start: a.url, end: b && b.url, motion }, reopen);
    };
  };
  AI.ownVideo = (s, v, reopen) => {
    const P = (AI.cfg && AI.cfg.prices) || {};
    const m = modal(`<h2>Your pictures</h2><div style="display:grid;grid-template-columns:repeat(${v.end ? 2 : 1},1fr);gap:8px">${[v.start, v.end].filter(Boolean).map((u) => `<img src="${esc(u)}" alt="" style="width:100%;border-radius:10px">`).join('')}</div>
      <p class="sub" style="margin-top:12px">${v.end ? (AI.cfg && AI.cfg.endFrames ? 'The video starts on the first picture and ends on the second.' : 'The video starts on the first picture and moves the way you described. (Ending exactly on the second picture isn’t switched on yet.)') : 'The video starts on this picture and moves the way you described.'}</p>
      <div id="ownpick"></div>
      <div class="aibar"><button class="button" id="ownvid">Make the video</button><button class="button button-secondary" id="ownx">Not now</button></div>`);
    m.querySelector('#ownx').onclick = () => m.remove();
    const pick = AI.videoPicker(m.querySelector('#ownpick'));
    m.querySelector('#ownvid').onclick = async () => {
      const vc = pick.get(); m.remove();
      const job = await AI.confirm({ kind: 'video', body: Object.assign({ siteId: s.id, start: v.start, end: v.end || undefined, prompt: v.motion }, vc), title: 'Your hero video' });
      const r = resultOf(job); if (!r) return;
      const done = modal(`<h2>Your hero video</h2><video src="${esc(r.url)}" poster="${esc(r.poster || '')}" controls playsinline muted loop autoplay style="width:100%;border-radius:12px"></video>
        <div class="aibar"><button class="button" id="ownuse">Use it on my website · free</button><a class="button button-secondary" href="${esc(r.url)}" download>Download</a><button class="button button-secondary" id="ownx">Close</button></div><p class="aimsg" id="ownuseerr"></p>`);
      done.querySelector('#ownx').onclick = () => done.remove();
      done.querySelector('#ownuse').onclick = async (e) => {
        e.target.disabled = true; const u = await api(`/api/designs/sites/${s.id}/hero-video`, { jobId: job.id });
        if (u.ok) { done.remove(); AI.toast('Your hero video is on the site.'); if (reopen) reopen(u.site); } else { e.target.disabled = false; done.querySelector('#ownuseerr').textContent = u.message || 'It couldn’t be added.'; }
      };
    };
  };

  // ================================================================== THE VIDEO PICKER (like Higgsfield's playground)
  // a length slider and quality buttons; the price updates as they move. times(seconds, quality) -> how many clips
  // (a showcase is one per pair of photos), plus = credits on top (Claude's part of Build your hero). The server quotes
  // the job again before anything is charged; this is the same sum, shown early.
  const VQ_LABEL = { '480p': 'Draft', '720p': 'HD', '1080p': 'Full HD' };
  AI.videoPicker = (host, { times = () => 1, plus = 0, seconds = 5 } = {}) => {
    const V = (AI.cfg && AI.cfg.video) || { min: 2, max: 30, quality: '1080p', qualities: [{ id: '1080p', creditsPerSecond: 1.68 }] };
    const st = { seconds: Math.min(V.max, Math.max(V.min, seconds)), quality: V.quality };
    host.innerHTML = `<div class="vpk"><div class="vpk-row"><span>Length</span><b data-v="sec"></b></div>
      <input type="range" min="${V.min}" max="${V.max}" step="1" value="${st.seconds}" aria-label="Length in seconds">
      <div class="vpk-ticks"><span>${V.min}s</span><span>${Math.round((V.min + V.max) / 2)}s</span><span>${V.max}s</span></div>
      <div class="vpk-row" style="margin-top:12px"><span>Quality</span></div>
      <div class="vpk-q">${V.qualities.map((q) => `<button type="button" data-q="${esc(q.id)}" aria-pressed="${q.id === st.quality}">${esc(q.id)}<br><small style="font-weight:500;opacity:.7">${esc(VQ_LABEL[q.id] || '')}</small></button>`).join('')}</div>
      <div class="vpk-price"><span data-v="what"></span><b data-v="price"></b></div></div>`;
    const each = () => { const q = V.qualities.find((x) => x.id === st.quality) || V.qualities[0]; return Math.ceil(+(st.seconds * q.creditsPerSecond).toFixed(6)); };
    const credits = () => plus + each() * Math.max(0, times(st.seconds, st.quality));
    const draw = () => {
      host.querySelector('[data-v=sec]').textContent = `${st.seconds} seconds`;
      const n = times(st.seconds, st.quality);
      host.querySelector('[data-v=what]').textContent = n > 1 ? `${n} clips × ${each()} credits${plus ? ` + ${plus}` : ''}` : n < 1 ? 'Add your photos to see the price' : `${st.quality} · ${st.seconds}s${plus ? ` + Claude ${plus}` : ''}`;
      host.querySelector('[data-v=price]').textContent = n < 1 ? '' : `${credits()} credits`;
    };
    host.querySelector('input[type=range]').addEventListener('input', (e) => { st.seconds = Number(e.target.value); draw(); });
    host.querySelectorAll('[data-q]').forEach((b) => { b.onclick = () => { st.quality = b.dataset.q; host.querySelectorAll('[data-q]').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); draw(); }; });
    draw();
    return { get: () => ({ seconds: st.seconds, quality: st.quality }), redraw: draw, credits };
  };

  // ================================================================== BUILD YOUR HERO (the simple way)
  // your own start image (and end image) -> one price -> Claude matches the rest of the website to them, Wan makes the
  // hero from exactly those images, and it goes onto the site
  AI.buildHero = (s, reopen) => {
    const P = (AI.cfg && AI.cfg.prices) || {}; const pics = { start: null, end: null };
    const slot = (k, label, hint) => `<div class="hslot" data-slot="${k}" style="border:1px dashed #c9cdd6;border-radius:14px;padding:10px;text-align:center"><div class="hpic" style="aspect-ratio:16/9;border-radius:10px;background:#f3f4f6;display:grid;place-items:center;overflow:hidden;color:#858995;font-size:13px">${esc(hint)}</div><label class="button button-secondary" style="margin-top:8px">${esc(label)}<input type="file" accept="image/*" hidden></label></div>`;
    const m = modal(`<h2>Build your hero <span>· ${esc(s.businessName || 'your site')}</span></h2>
      <p class="sub">Add the picture your hero starts on, and the one it ends on. We make the video from exactly your pictures, and Claude updates the rest of your website to match them.</p>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">${slot('start', 'Start image', 'Where it starts')}${slot('end', 'End image', 'Where it ends (optional)')}</div>
      <form class="bform" style="grid-template-columns:1fr;margin-top:10px"><label>What happens in between? <small>optional</small><textarea id="hbmo" rows="2" maxlength="900" placeholder="e.g. the lights come on one by one and the camera glides to the front desk"></textarea></label>
</form><div id="hbpick"></div>
      ${AI.cfg && AI.cfg.endFrames === false ? '<p class="sub" style="margin:6px 0 0">Your end picture helps Claude match your website. The video starts from your start picture.</p>' : ''}<p class="aimsg" id="hberr"></p>
      <div class="aibar"><button class="button" id="hbgo">Continue</button><button class="button button-secondary" id="hbx">Close</button></div>
      <p class="sub" style="margin-top:10px"><a href="#" id="hbq">No pictures yet? Answer a few questions instead.</a></p>`);
    m.querySelector('#hbx').onclick = () => m.remove();
    const pick = AI.videoPicker(m.querySelector('#hbpick'), { plus: P.own_plan || 3 });
    m.querySelector('#hbq').onclick = (e) => { e.preventDefault(); m.remove(); AI.makeItYourOwn(s, reopen); };
    m.querySelectorAll('[data-slot]').forEach((box) => box.querySelector('input').addEventListener('change', async (e) => {
      const f = e.target.files && e.target.files[0]; if (!f) return; const pic = box.querySelector('.hpic'); pic.textContent = 'Uploading…';
      try { const url = await shrinkPhoto(f); const u = await api('/api/ai/uploads', { photo: url }); if (!u.ok) throw new Error(u.message || 'Upload failed.'); pics[box.dataset.slot] = u.token; pic.innerHTML = `<img src="${url}" alt="" style="width:100%;height:100%;object-fit:cover">`; }
      catch (err) { pic.textContent = err.message; }
    }));
    m.querySelector('#hbgo').onclick = async () => {
      if (!pics.start) { m.querySelector('#hberr').textContent = 'Add your start image.'; return; }
      const body = { siteId: s.id, start: pics.start, end: pics.end || undefined, prompt: m.querySelector('#hbmo').value.trim(), ...pick.get() };
      m.remove();
      const job = await AI.confirm({ kind: 'hero_build', body, title: 'Build your hero', what: 'Claude matches your website to your pictures, then the video is made from them. Both go onto your site; you can undo the website changes in the editor.' });
      if (!job) return;
      const a = resultOf(job, 1), v = resultOf(job, 2);
      const done = modal(`<h2>${v ? 'Your hero is ready' : 'Partly done'}</h2>
        ${a ? `<p class="sub">${esc(a.look || '')} Claude changed ${a.applied} thing${a.applied === 1 ? '' : 's'} on your website to match${a.summary ? `: ${esc(a.summary)}` : '.'}</p>` : ''}
        ${v ? `<video src="${esc(v.url)}" poster="${esc(v.poster || '')}" controls playsinline muted loop autoplay style="width:100%;border-radius:12px"></video><p class="sub">${v.onSite ? 'It’s on your website now.' : 'This design’s hero doesn’t take a video, so download it instead.'}</p>` : ''}
        <div class="aibar">${v ? `<a class="button button-secondary" href="${esc(v.url)}" download>Download the video</a>` : ''}<button class="button" id="hbdone">See my website</button></div>`);
      done.querySelector('#hbdone').onclick = async () => { done.remove(); const r = await api('/api/designs/sites/' + s.id); if (r.ok && reopen) reopen(r.site); };
    };
  };

  // ================================================================== UPDATE THIS WEBSITE: a picture for a photo slot
  // -> a File the editor's own photo path takes (shrunk and saved like an upload), or null
  AI.generatePhoto = async (s, slotLabel) => {
    const prompt = await new Promise((ok) => {
      const m = modal(`<h2>Make a picture <span>· ${esc(slotLabel || 'photo')}</span></h2><p class="sub">Describe it. You see the price before anything is made.</p><form class="bform" style="grid-template-columns:1fr"><textarea id="gpq" rows="3" maxlength="900" placeholder="e.g. a warm, moody barbershop interior at dusk, leather chairs, no people"></textarea></form><div class="aibar"><button class="button" id="gpgo">Continue</button><button class="button button-secondary" id="gpx">Cancel</button></div>`);
      m.querySelector('#gpx').onclick = () => { m.remove(); ok(null); }; m.querySelector('#gpgo').onclick = () => { const v = m.querySelector('#gpq').value.trim(); if (!v) return; m.remove(); ok(v); };
    });
    if (!prompt) return null;
    const job = await AI.confirm({ kind: 'image', body: { siteId: s.id, prompts: [prompt], aspect: '16:9' }, title: 'A new picture' });
    const r = resultOf(job); if (!r) return null;
    const blob = await (await fetch(r.url)).blob(); return new File([blob], 'ai.jpg', { type: blob.type || 'image/jpeg' });
  };

  // ================================================================== PROPERTY VIDEO (its own page in the studio)
  AI.propertyVideo = async (root) => {
    const P = (AI.cfg && AI.cfg.prices) || {}; const photos = [];
    root.innerHTML = `<section class="studio-hero"><div><p class="eyebrow">PROPERTY VIDEO</p><h1>Your property,<span>in motion.</span></h1></div><p class="lede">One exterior photo becomes a cinematic animation, or up to nine photos become a showcase, room to room. You see the price before anything is made, and you’re only charged for what gets made.</p></section>
      <section class="panel"><div class="aibar" style="margin:0 0 16px"><button class="button" data-pv="exterior" aria-pressed="true">Exterior animation</button><button class="button button-secondary" data-pv="showcase">Property showcase</button></div>
        <p class="sub" id="pvsub"></p><div class="gthumbs" id="pvthumbs"></div>
        <label class="button button-secondary gadd" style="margin:10px 0">Add photos<input type="file" accept="image/*" multiple hidden id="pvfiles"></label>
        <form class="bform" style="grid-template-columns:1fr"><label>Anything to add? <small>optional</small><input id="pvnote" maxlength="300" placeholder="e.g. golden hour, slow push toward the front door"></label></form><div id="pvpick" style="max-width:560px"></div>
        <p class="aimsg" id="pverr"></p><div class="aibar"><button class="button" id="pvgo">Continue</button></div></section><section id="pvout"></section>`;
    let mode = 'exterior';
    const pick = AI.videoPicker(root.querySelector('#pvpick'), { times: () => (mode === 'exterior' ? 1 : Math.max(0, photos.length - 1)) });
    const sub = () => { root.querySelector('#pvsub').textContent = mode === 'exterior' ? 'One photo of the outside. Pick the length and quality; the price is below.' : `2 to 9 photos, in the order you want to walk through. Each pair becomes one segment of the length you pick, joined into one film.${AI.cfg && AI.cfg.endFrames ? '' : ' Each segment starts from its photo and moves toward the next room; it isn’t a frame-perfect morph.'}`; pick.redraw(); };
    const thumbs = () => { root.querySelector('#pvthumbs').innerHTML = photos.map((p, i) => `<span class="gth"><img src="${p.url}" alt=""><b style="position:absolute;left:6px;top:4px;color:#fff;text-shadow:0 1px 3px #000">${i + 1}</b><button type="button" data-rm="${i}" aria-label="Remove">×</button></span>`).join('');
      root.querySelectorAll('[data-rm]').forEach((b) => { b.onclick = () => { photos.splice(Number(b.dataset.rm), 1); thumbs(); }; }); pick.redraw(); };
    root.querySelectorAll('[data-pv]').forEach((b) => { b.onclick = () => { mode = b.dataset.pv; root.querySelectorAll('[data-pv]').forEach((x) => { x.className = 'button' + (x === b ? '' : ' button-secondary'); x.setAttribute('aria-pressed', String(x === b)); }); sub(); }; });
    sub();
    root.querySelector('#pvfiles').addEventListener('change', async (e) => {
      const max = mode === 'exterior' ? 1 : 9; const files = [...(e.target.files || [])].slice(0, max - photos.length); e.target.value = '';
      for (const f of files) { try { const url = await shrinkPhoto(f); const u = await api('/api/ai/uploads', { photo: url }); if (!u.ok) throw new Error(u.message || 'Upload failed.'); photos.push({ url, token: u.token }); thumbs(); } catch (err) { root.querySelector('#pverr').textContent = err.message; } }
    });
    root.querySelector('#pvgo').onclick = async () => {
      const err = root.querySelector('#pverr'); err.textContent = '';
      if (mode === 'exterior' && photos.length !== 1) { err.textContent = 'Add one exterior photo.'; return; }
      if (mode === 'showcase' && photos.length < 2) { err.textContent = 'Add at least 2 photos, in order.'; return; }
      const vc = pick.get(), note = root.querySelector('#pvnote').value.trim();
      const body = Object.assign(mode === 'exterior' ? { start: photos[0].token, prompt: note } : { images: photos.map((p) => p.token), prompt: note }, vc);
      const job = await AI.confirm({ kind: mode, body, title: mode === 'exterior' ? 'Exterior animation' : `Property showcase · ${photos.length} photos` });
      if (job) AI.propertyResult(root.querySelector('#pvout'), job);
    };
  };
  AI.propertyResult = async (out, job) => {
    const done = job.parts.filter((p) => p.status === 'done');
    out.innerHTML = `<section class="panel"><h2>${job.kind === 'showcase' ? 'Your showcase' : 'Your video'}</h2><div id="pvfull"></div>${done.map((p) => `<div style="margin:10px 0"><p class="sub">${job.parts.length > 1 ? `Segment ${p.n}` : ''}</p><video src="${esc(p.result.url)}" poster="${esc(p.result.poster || '')}" controls playsinline muted style="width:100%;border-radius:12px"></video><a class="button button-secondary" href="${esc(p.result.url)}" download>Download</a></div>`).join('')}</section>`;
    out.scrollIntoView({ behavior: 'smooth' });
    if (job.kind !== 'showcase' || done.length < 2) return;
    const film = `/ai-media/${job.id}/showcase.mp4`;
    for (let i = 0; i < 40; i++) { const h = await fetch(film, { method: 'HEAD' }); if (h.ok) { out.querySelector('#pvfull').innerHTML = `<p class="sub">The full film, every segment joined:</p><video src="${film}" controls playsinline muted style="width:100%;border-radius:12px"></video><a class="button" href="${film}" download>Download the film</a>`; return; } await new Promise((ok) => setTimeout(ok, 3000)); }
  };
})();
