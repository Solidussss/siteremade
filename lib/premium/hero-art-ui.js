'use strict';
// HERO ART -- product interfaces for software businesses, drawn as SVG with real,
// readable labels (an image model cannot draw legible UI). Two layouts per
// interface: `wide` (the desktop lead) and `compact` (phones swap to it, see
// styles.css .ha-ui). Labels are the owner's own words or generic UI verbs.
// HONESTY: no invented numbers, customer names, ratings or metrics -- charts and
// bars carry no values, people are roles ("New patient"), not names.
const A = require('./hero-art');
const { mix, lighten, darken } = A;
const { rect, circ, ell, path, line, g, n1 } = A._svg;

const FONT = "Inter,'Helvetica Neue',Arial,sans-serif";
function txt(x, y, s, size, fill, o) {
  const k = o || {};
  const t = String(s == null ? '' : s);
  const max = k.max || 0; const shown = max && t.length > max ? t.slice(0, max - 1) + '…' : t;
  return `<text x="${n1(x)}" y="${n1(y)}" fill="${fill}" font-size="${n1(size)}" text-anchor="${k.anchor || 'start'}" style="font-family:${FONT};font-weight:${k.weight || 500};letter-spacing:${k.spacing || '-0.005em'}"${k.opacity != null ? ` opacity="${k.opacity}"` : ''}>${A.esc(shown)}</text>`;
}
const cap = s => { s = String(s || '').trim(); return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; };
// a small theme from the site accent: light or dark product chrome
function theme(e) {
  const acc = e.accent; const dark = e.dark;
  return {
    acc, accSoft: dark ? mix(acc, '#15161b', 0.7) : mix(acc, '#ffffff', 0.86), accInk: A.inkOn(acc),
    bg: dark ? '#111217' : '#f5f6f8', panel: dark ? '#1a1c23' : '#ffffff', panel2: dark ? '#22252e' : '#f0f2f5', line: dark ? '#2c2f3a' : '#e3e6eb',
    ink: dark ? '#eef0f4' : '#1d2230', mute: dark ? '#9aa1b1' : '#6b7385', faint: dark ? '#4a5061' : '#c7ccd6',
    ok: '#2fb67c', warn: '#f2a33a', bad: '#e5534b', info: '#4a8fe7',
  };
}
function chrome(e, T, W, H, title, nav, activeIdx, o) {
  const k = o || {}; let s = rect(0, 0, W, H, T.bg);
  s += rect(0, 0, W, 44, T.panel) + line(0, 44, W, 44, T.line, 1);
  s += rect(18, 13, 18, 18, T.acc, { rx: 5 }) + txt(44, 27, title, 15, T.ink, { weight: 700, max: 22 });
  if (!k.compact) (nav || []).slice(0, 4).forEach((n, i) => { const x = 250 + i * 110; s += txt(x, 27, n, 13, i === activeIdx ? T.ink : T.mute, { weight: i === activeIdx ? 650 : 500, max: 14 }); if (i === activeIdx) s += rect(x, 40, Math.min(90, String(n).length * 7.4), 3, T.acc, { rx: 1.5 }); });
  s += circ(W - 30, 22, 11, T.panel2) + circ(W - 30, 19, 4, T.faint) + path(`M${W - 37} 29 Q${W - 30} 22 ${W - 23} 29`, T.faint);
  return s;
}
function chip(x, y, label, bg, ink, size) { const w = Math.max(40, String(label).length * (size || 11) * 0.62 + 18); return rect(x, y, w, (size || 11) + 11, bg, { rx: ((size || 11) + 11) / 2 }) + txt(x + w / 2, y + (size || 11) + 4, label, size || 11, ink, { anchor: 'middle', weight: 650 }); }
function statusDot(x, y, c) { return circ(x, y, 5, c) + circ(x, y, 9, c, { opacity: 0.2 }); }

// ---- scheduling / booking -------------------------------------------------------------------------------------------
function schedule(e, T, p, compact) {
  const who = cap(p.audience || 'Clients'); const kinds = (p.items && p.items.length ? p.items : ['Appointment', 'Follow-up', 'Consultation']).map(cap);
  if (compact) {
    const W = 400, H = 300; let s = chrome(e, T, W, H, p.title, [], 0, { compact: true });
    s += txt(18, 72, 'Today', 16, T.ink, { weight: 700 }) + chip(W - 118, 57, 'Book', T.acc, T.accInk, 12);
    ['9:00', '10:30', '1:00', '3:30'].forEach((t, i) => { const y = 88 + i * 50; s += rect(14, y, W - 28, 42, T.panel, { rx: 10 }) + rect(14, y, 5, 42, i === 1 ? T.warn : T.acc, { rx: 2.5 }) + txt(30, y + 18, t, 12, T.mute, { weight: 600 }) + txt(30, y + 34, kinds[i % kinds.length], 14, T.ink, { weight: 650, max: 26 }) + txt(W - 28, y + 26, i === 1 ? (p.reminders ? 'Reminder sent' : 'Pending') : 'Confirmed', 11, i === 1 ? T.warn : T.ok, { anchor: 'end', weight: 650 }); });
    return { s, W, H };
  }
  const W = 800, H = 500; let s = chrome(e, T, W, H, p.title, ['Calendar', who, p.reminders ? 'Reminders' : 'Services', 'Settings'], 0);
  s += rect(16, 60, 172, H - 76, T.panel, { rx: 12 }) + txt(32, 88, 'This week', 14, T.ink, { weight: 700 });
  // mini month
  for (let r = 0; r < 5; r++) for (let c = 0; c < 7; c++) { const d = r * 7 + c; const x = 36 + c * 20, y = 110 + r * 20; s += d === 17 ? circ(x, y - 4, 9, T.acc) : ''; s += txt(x, y, String((d % 30) + 1), 10, d === 17 ? T.accInk : T.mute, { anchor: 'middle', weight: 500 }); }
  s += line(32, 212, 172, 212, T.line, 1) + txt(32, 238, 'Services', 12, T.mute, { weight: 650, spacing: '0.04em' });
  kinds.slice(0, 4).forEach((k2, i) => { s += rect(32, 252 + i * 30, 10, 10, [T.acc, T.warn, T.info, T.ok][i % 4], { rx: 3 }) + txt(50, 262 + i * 30, k2, 12.5, T.ink, { max: 18 }); });
  s += rect(32, H - 64, 140, 34, T.acc, { rx: 9 }) + txt(102, H - 42, '+ New booking', 13, T.accInk, { anchor: 'middle', weight: 700 });
  // week grid
  const gx = 204, gy = 60, gw = W - gx - 16, gh = H - 76; const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']; const cw = (gw - 48) / 5;
  s += rect(gx, gy, gw, gh, T.panel, { rx: 12 });
  days.forEach((d, i) => { s += txt(gx + 48 + i * cw + cw / 2, gy + 26, d, 12.5, i === 2 ? T.acc : T.mute, { anchor: 'middle', weight: 650 }); });
  ['9 am', '10', '11', '12 pm', '1', '2', '3', '4'].forEach((t, i) => { const y = gy + 52 + i * 46; s += txt(gx + 40, y + 4, t, 10.5, T.mute, { anchor: 'end' }) + line(gx + 48, y, gx + gw - 10, y, T.line, 1); });
  const blocks = [[0, 0.2, 1.6, 0], [1, 1.1, 1.2, 1], [2, 0.1, 1, 2], [2, 2.4, 1.6, 0], [3, 0.6, 1.4, 3], [4, 1.4, 1, 1], [0, 3.2, 1.2, 2], [3, 3.6, 1.2, 0], [1, 4.4, 1.3, 3], [4, 4, 1.4, 2]];
  const cols = [T.acc, T.warn, T.info, T.ok];
  blocks.forEach(([d, start, len, ci], i) => { const x = gx + 52 + d * cw, y = gy + 52 + start * 46, h = len * 46 - 6, c = cols[ci]; s += rect(x, y, cw - 8, h, mix(c, T.panel, e.dark ? 0.55 : 0.82), { rx: 7 }) + rect(x, y, 4, h, c, { rx: 2 }) + txt(x + 11, y + 17, kinds[i % kinds.length], 11.5, T.ink, { weight: 650, max: 15 }) + (h > 40 ? txt(x + 11, y + 32, i % 3 === 0 ? `New ${who.toLowerCase().replace(/s$/, '')}` : 'Confirmed', 10.5, T.mute, { max: 16 }) : ''); });
  // now line
  s += line(gx + 48, gy + 52 + 2.2 * 46, gx + gw - 10, gy + 52 + 2.2 * 46, T.bad, 1.6) + circ(gx + 48, gy + 52 + 2.2 * 46, 4, T.bad);
  return { s, W, H };
}
// ---- monitoring / infrastructure --------------------------------------------------------------------------------------
function spark(x, y, w, h, seed, c, fill) {
  const R = A.rng(seed); let d = '', pts = [];
  for (let i = 0; i <= 24; i++) { const v = 0.35 + 0.25 * Math.sin(i / 3 + seed % 7) + R() * 0.2 + (i === 17 ? 0.35 : 0); pts.push([x + i * w / 24, y + h - Math.min(0.98, v) * h]); }
  d = pts.map((p2, i) => `${i ? 'L' : 'M'}${n1(p2[0])} ${n1(p2[1])}`).join(' ');
  return (fill ? path(`${d} L${n1(x + w)} ${n1(y + h)} L${n1(x)} ${n1(y + h)} Z`, c, { opacity: 0.14 }) : '') + path(d, 'none', { stroke: c, 'stroke-width': 2, 'stroke-linejoin': 'round' });
}
function monitor(e, T, p, compact) {
  const svcs = (p.items && p.items.length ? p.items : ['api', 'web', 'worker', 'database', 'queue']).slice(0, 5);
  if (compact) {
    const W = 400, H = 300; let s = chrome(e, T, W, H, p.title, [], 0, { compact: true });
    s += txt(18, 72, 'Services', 16, T.ink, { weight: 700 }) + chip(W - 112, 57, 'Healthy', mix(T.ok, T.panel, 0.75), T.ok, 11);
    svcs.slice(0, 3).forEach((sv, i) => { const y = 86 + i * 46; s += rect(14, y, W - 28, 38, T.panel, { rx: 9 }) + statusDot(32, y + 19, i === 1 ? T.warn : T.ok) + txt(48, y + 24, sv, 14, T.ink, { weight: 650, max: 16 }) + spark(W - 170, y + 6, 140, 26, 11 + i, i === 1 ? T.warn : T.acc); });
    s += rect(14, 232, W - 28, 52, mix(T.warn, T.panel, e.dark ? 0.8 : 0.88), { rx: 10 }) + txt(30, 254, 'Alert · latency above threshold', 13, T.ink, { weight: 650 }) + txt(30, 272, `${cap(svcs[1] || 'web')} · acknowledged`, 11.5, T.mute);
    return { s, W, H };
  }
  const W = 800, H = 500; let s = chrome(e, T, W, H, p.title, ['Overview', 'Services', 'Alerts', 'Logs'], 0);
  s += rect(16, 60, 168, H - 76, T.panel, { rx: 12 }) + txt(32, 88, 'Services', 13, T.mute, { weight: 650, spacing: '0.04em' });
  svcs.forEach((sv, i) => { const y = 104 + i * 36; s += (i === 0 ? rect(24, y - 6, 152, 30, T.accSoft, { rx: 8 }) : '') + statusDot(40, y + 9, i === 2 ? T.warn : T.ok) + txt(56, y + 14, sv, 13, T.ink, { weight: i === 0 ? 700 : 500, max: 14 }); });
  s += txt(32, H - 60, 'Region', 11, T.mute, { weight: 650, spacing: '0.04em' }) + chip(32, H - 50, 'All regions', T.panel2, T.ink, 11);
  // latency chart
  s += rect(200, 60, W - 216, 210, T.panel, { rx: 12 }) + txt(220, 88, 'Latency', 14, T.ink, { weight: 700 }) + txt(292, 88, 'p50 · p95 · p99', 12, T.mute) + chip(W - 150, 72, 'Last 24 hours', T.panel2, T.ink, 11);
  for (let i = 0; i < 4; i++) s += line(220, 120 + i * 36, W - 36, 120 + i * 36, T.line, 1);
  s += spark(220, 108, W - 256, 140, 7, T.acc, true) + spark(220, 140, W - 256, 110, 3, T.info) + spark(220, 170, W - 256, 80, 5, T.faint);
  s += line(220 + (W - 256) * 17 / 24, 104, 220 + (W - 256) * 17 / 24, 250, T.warn, 1.2, { 'stroke-dasharray': '4 4' }) + chip(220 + (W - 256) * 17 / 24 - 40, 98, 'Deploy', mix(T.warn, T.panel, 0.7), darken(T.warn, 0.3), 10);
  // uptime strips + alert card
  s += rect(200, 286, (W - 232) * 0.6, H - 302, T.panel, { rx: 12 }) + txt(220, 314, 'Availability', 14, T.ink, { weight: 700 });
  svcs.slice(0, 4).forEach((sv, r) => { const y = 332 + r * 32; s += txt(220, y + 13, sv, 12, T.mute, { max: 10 }); for (let i = 0; i < 30; i++) s += rect(300 + i * ((W - 232) * 0.6 - 120) / 30, y, ((W - 232) * 0.6 - 120) / 30 - 2, 18, (r === 2 && (i === 21 || i === 22)) ? T.warn : T.ok, { rx: 2, opacity: 0.85 }); });
  const ax = 216 + (W - 232) * 0.6, aw = W - 16 - ax;
  s += rect(ax, 286, aw, H - 302, T.panel, { rx: 12 }) + txt(ax + 18, 314, 'Alerts', 14, T.ink, { weight: 700 });
  [['Latency above threshold', T.warn, 'Acknowledged'], ['Error rate', T.ok, 'Resolved'], ['Disk usage', T.ok, 'Resolved']].forEach(([t, c, st], i) => { const y = 330 + i * 46; s += rect(ax + 12, y, aw - 24, 38, T.panel2, { rx: 8 }) + statusDot(ax + 28, y + 19, c) + txt(ax + 42, y + 17, t, 12, T.ink, { weight: 650, max: 24 }) + txt(ax + 42, y + 31, st, 10.5, T.mute); });
  return { s, W, H };
}
// ---- pipeline / kanban -------------------------------------------------------------------------------------------------
function pipeline(e, T, p, compact) {
  const stages = (p.items && p.items.length >= 3 ? p.items : ['New', 'Contacted', 'Proposal', 'Won']).slice(0, 4).map(cap); const cols = [T.info, T.warn, T.acc, T.ok];
  const W = compact ? 400 : 800, H = compact ? 300 : 500; let s = chrome(e, T, W, H, p.title, ['Pipeline', 'Contacts', 'Tasks', 'Reports'], 0, { compact });
  const n = compact ? 2 : 4; const cw = (W - 16 - n * 12) / n;
  stages.slice(0, n).forEach((st, c) => { const x = 16 + c * (cw + 12); s += rect(x, 60, cw, H - 76, T.panel2, { rx: 12 }) + circ(x + 18, 82, 5, cols[c]) + txt(x + 30, 87, st, 13.5, T.ink, { weight: 700, max: 16 });
    const cards = compact ? 3 : 4 - (c % 2);
    for (let i = 0; i < cards; i++) { const y = 104 + i * (compact ? 58 : 86); const h = compact ? 50 : 76; s += rect(x + 10, y, cw - 20, h, T.panel, { rx: 9 }) + rect(x + 22, y + 14, cw * (0.45 + ((i + c) % 3) * 0.12), 9, T.ink, { rx: 4.5, opacity: 0.8 }) + rect(x + 22, y + 30, cw * 0.4, 7, T.faint, { rx: 3.5 }) + (compact ? '' : rect(x + 22, y + 48, 44, 16, mix(cols[c], T.panel, 0.8), { rx: 8 }) + circ(x + cw - 34, y + 56, 10, T.panel2) + circ(x + cw - 34, y + 53, 3.5, T.faint)); } });
  return { s, W, H };
}
// ---- invoices / accounting ---------------------------------------------------------------------------------------------
function ledger(e, T, p, compact) {
  const W = compact ? 400 : 800, H = compact ? 300 : 500; let s = chrome(e, T, W, H, p.title, ['Invoices', 'Expenses', 'Clients', 'Reports'], 0, { compact });
  const statuses = [['Paid', T.ok], ['Sent', T.info], ['Overdue', T.bad], ['Draft', T.faint], ['Paid', T.ok], ['Sent', T.info]];
  const x0 = 16, w = W - 32; s += rect(x0, 60, w, H - 76, T.panel, { rx: 12 }) + txt(x0 + 18, 90, cap((p.items && p.items[0]) || 'Invoices'), 16, T.ink, { weight: 700 }) + chip(x0 + w - (compact ? 96 : 136), 72, compact ? '+ New' : '+ New invoice', T.acc, T.accInk, 11.5);
  if (!compact) ['Client', 'Issued', 'Due', 'Status', 'Amount'].forEach((h2, i) => { s += txt(x0 + 18 + [0, 240, 360, 480, 600][i], 126, h2, 11.5, T.mute, { weight: 650, spacing: '0.04em' }); });
  statuses.slice(0, compact ? 4 : 6).forEach(([st, c], i) => { const y = (compact ? 104 : 140) + i * (compact ? 44 : 52); s += line(x0 + 12, y - 8, x0 + w - 12, y - 8, T.line, 1) + circ(x0 + 30, y + 12, 11, T.panel2) + rect(x0 + 50, y + 4, compact ? 120 : 150, 9, T.ink, { rx: 4.5, opacity: 0.75 }) + (compact ? '' : rect(x0 + 258, y + 6, 70, 7, T.faint, { rx: 3.5 }) + rect(x0 + 378, y + 6, 70, 7, T.faint, { rx: 3.5 })) + chip(x0 + (compact ? w - 150 : 498), y + 1, st, mix(c, T.panel, e.dark ? 0.7 : 0.82), c === T.faint ? T.mute : darken(c, e.dark ? -0.2 : 0.2), 10.5) + rect(x0 + w - (compact ? 64 : 110), y + 5, compact ? 46 : 80, 9, T.ink, { rx: 4.5, opacity: 0.55 }); });
  return { s, W, H };
}
// ---- support inbox ------------------------------------------------------------------------------------------------------
function inbox(e, T, p, compact) {
  const W = compact ? 400 : 800, H = compact ? 300 : 500; let s = chrome(e, T, W, H, p.title, ['Inbox', 'Assigned', 'Resolved', 'Help center'], 0, { compact });
  const lw = compact ? 0 : 250;
  if (!compact) { s += rect(16, 60, lw, H - 76, T.panel, { rx: 12 }); for (let i = 0; i < 6; i++) { const y = 72 + i * 66; s += (i === 0 ? rect(22, y - 4, lw - 12, 60, T.accSoft, { rx: 9 }) : '') + circ(46, y + 22, 14, T.panel2) + rect(68, y + 10, 120, 8, T.ink, { rx: 4, opacity: 0.75 }) + rect(68, y + 26, 160, 6, T.faint, { rx: 3 }) + rect(68, y + 38, 110, 6, T.faint, { rx: 3 }) + (i < 2 ? circ(lw - 4, y + 14, 4, T.acc) : ''); } }
  const tx = 16 + lw + (compact ? 0 : 14), tw = W - tx - 16; s += rect(tx, 60, tw, H - 76, T.panel, { rx: 12 }) + txt(tx + 18, 88, cap((p.items && p.items[0]) || 'Customer question'), 15, T.ink, { weight: 700, max: 30 }) + chip(tx + tw - 100, 72, 'Open', mix(T.info, T.panel, 0.8), T.info, 11);
  const bub = (x, y, w, mine, lines) => rect(x, y, w, 18 + lines * 14, mine ? T.acc : T.panel2, { rx: 12 }) + Array.from({ length: lines }, (_, i) => rect(x + 14, y + 12 + i * 14, w * (i === lines - 1 ? 0.5 : 0.8), 6, mine ? T.accInk : T.faint, { rx: 3, opacity: mine ? 0.8 : 1 })).join('');
  s += bub(tx + 18, 110, tw * 0.62, false, 3) + bub(tx + tw * 0.34, 186, tw * 0.6, true, 2) + (compact ? '' : bub(tx + 18, 252, tw * 0.5, false, 2));
  s += rect(tx + 14, H - 74, tw - 28, 44, T.panel2, { rx: 10 }) + txt(tx + 30, H - 47, 'Write a reply…', 13, T.mute) + chip(tx + tw - 90, H - 64, 'Send', T.acc, T.accInk, 11);
  return { s, W, H };
}
// ---- design / content editor -------------------------------------------------------------------------------------------
function editor(e, T, p, compact) {
  const W = compact ? 400 : 800, H = compact ? 300 : 500; let s = chrome(e, T, W, H, p.title, ['Projects', 'Editor', 'Assets', 'Share'], 1, { compact });
  const lx = compact ? 16 : 16, lw = compact ? 0 : 60; if (!compact) { s += rect(16, 60, lw, H - 76, T.panel, { rx: 12 }); for (let i = 0; i < 6; i++) s += rect(32, 78 + i * 46, 28, 28, i === 1 ? T.acc : T.panel2, { rx: 7 }); }
  const cx = lx + lw + (compact ? 0 : 14), cw = W - cx - (compact ? 16 : 200); s += rect(cx, 60, cw, H - 76, T.panel2, { rx: 12 });
  s += rect(cx + cw * 0.12, 90, cw * 0.76, H - 140, T.panel, { rx: 6 }) + rect(cx + cw * 0.18, 112, cw * 0.4, (H - 140) * 0.44, mix(T.acc, T.panel, 0.25), { rx: 8 }) + circ(cx + cw * 0.3, 112 + (H - 140) * 0.18, (H - 140) * 0.08, lighten(T.acc, 0.5)) + rect(cx + cw * 0.62, 112, cw * 0.2, (H - 140) * 0.2, T.panel2, { rx: 6 }) + rect(cx + cw * 0.18, 112 + (H - 140) * 0.52, cw * 0.54, 12, T.ink, { rx: 6, opacity: 0.8 }) + rect(cx + cw * 0.18, 132 + (H - 140) * 0.52, cw * 0.4, 8, T.faint, { rx: 4 });
  s += rect(cx + cw * 0.18 - 3, 109, cw * 0.4 + 6, (H - 140) * 0.44 + 6, 'none', { stroke: T.info, 'stroke-width': 1.6 }) + [[0, 0], [1, 0], [0, 1], [1, 1]].map(([a, b]) => rect(cx + cw * 0.18 - 6 + a * (cw * 0.4 + 6), 106 + b * ((H - 140) * 0.44 + 6), 7, 7, T.panel, { stroke: T.info, 'stroke-width': 1.4 })).join('');
  if (!compact) { const px = W - 186; s += rect(px, 60, 170, H - 76, T.panel, { rx: 12 }) + txt(px + 16, 88, 'Layers', 13, T.mute, { weight: 650, spacing: '0.04em' }); ((p.items && p.items.length ? p.items : ['Headline', 'Image', 'Button', 'Background'])).slice(0, 5).forEach((it, i) => { s += (i === 1 ? rect(px + 8, 102 + i * 34, 154, 28, T.accSoft, { rx: 7 }) : '') + rect(px + 18, 110 + i * 34, 12, 12, [T.acc, T.info, T.warn, T.ok, T.faint][i], { rx: 3 }) + txt(px + 38, 120 + i * 34, cap(it), 12.5, T.ink, { max: 16 }); }); }
  return { s, W, H };
}
// ---- storefront builder ---------------------------------------------------------------------------------------------------
function store(e, T, p, compact) {
  const W = compact ? 400 : 800, H = compact ? 300 : 500; let s = chrome(e, T, W, H, p.title, ['Products', 'Orders', 'Customers', 'Storefront'], 0, { compact });
  const cols = compact ? 2 : 4, rows = compact ? 1 : 2; const cw = (W - 32 - (cols - 1) * 14) / cols, ch = compact ? 200 : 196; const tones = [T.acc, T.warn, T.info, T.ok, lighten(T.acc, 0.4), T.bad];
  const items = (p.items && p.items.length ? p.items : ['Product', 'Product', 'Product', 'Product']).map(cap);
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) { const i = r * cols + c; const x = 16 + c * (cw + 14), y = 60 + r * (ch + 14); s += rect(x, y, cw, ch, T.panel, { rx: 12 }) + rect(x + 10, y + 10, cw - 20, ch * 0.56, mix(tones[i % tones.length], T.panel, 0.7), { rx: 8 }) + circ(x + cw / 2, y + 10 + ch * 0.28, ch * 0.13, mix(tones[i % tones.length], T.panel, 0.25)) + txt(x + 14, y + ch * 0.56 + 34, items[i % items.length], 13, T.ink, { weight: 650, max: Math.floor(cw / 8) }) + rect(x + 14, y + ch * 0.56 + 46, cw * 0.35, 8, T.faint, { rx: 4 }) + rect(x + cw - 64, y + ch - 34, 50, 22, T.acc, { rx: 11 }) + txt(x + cw - 39, y + ch - 19, 'Add', 11, T.accInk, { anchor: 'middle', weight: 700 }); }
  return { s, W, H };
}
// ---- analytics ---------------------------------------------------------------------------------------------------------------
function analytics(e, T, p, compact) {
  const W = compact ? 400 : 800, H = compact ? 300 : 500; let s = chrome(e, T, W, H, p.title, ['Overview', 'Reports', 'Segments', 'Exports'], 0, { compact });
  const kpis = (p.items && p.items.length ? p.items : ['Visitors', 'Signups', 'Retention', 'Revenue']).slice(0, compact ? 2 : 4).map(cap); const kw = (W - 32 - (kpis.length - 1) * 12) / kpis.length;
  kpis.forEach((k2, i) => { const x = 16 + i * (kw + 12); s += rect(x, 60, kw, 86, T.panel, { rx: 12 }) + txt(x + 16, 86, k2, 12.5, T.mute, { weight: 650, max: 18 }) + rect(x + 16, 100, kw * 0.45, 16, T.ink, { rx: 5, opacity: 0.85 }) + spark(x + kw * 0.55, 96, kw * 0.38, 34, 21 + i, [T.acc, T.info, T.ok, T.warn][i]); });
  s += rect(16, 160, compact ? W - 32 : (W - 44) * 0.64, H - 176, T.panel, { rx: 12 }) + txt(34, 188, 'Trend', 14, T.ink, { weight: 700 }) + spark(34, 206, (compact ? W - 32 : (W - 44) * 0.64) - 36, H - 250, 9, T.acc, true) + spark(34, 226, (compact ? W - 32 : (W - 44) * 0.64) - 36, H - 270, 4, T.info);
  if (!compact) { const bx = 28 + (W - 44) * 0.64, bw = W - 16 - bx; s += rect(bx, 160, bw, H - 176, T.panel, { rx: 12 }) + txt(bx + 18, 188, 'By channel', 14, T.ink, { weight: 700 }); ['Search', 'Direct', 'Social', 'Email', 'Referral'].forEach((c, i) => { const y = 210 + i * 50; s += txt(bx + 18, y + 12, c, 12, T.mute) + rect(bx + 18, y + 20, (bw - 36), 10, T.panel2, { rx: 5 }) + rect(bx + 18, y + 20, (bw - 36) * [0.82, 0.64, 0.5, 0.36, 0.24][i], 10, [T.acc, T.info, T.warn, T.ok, T.faint][i], { rx: 5 }); }); }
  return { s, W, H };
}
// ---- courses / learning ------------------------------------------------------------------------------------------------------
function learning(e, T, p, compact) {
  const W = compact ? 400 : 800, H = compact ? 300 : 500; let s = chrome(e, T, W, H, p.title, ['My courses', 'Lessons', 'Progress', 'Community'], 0, { compact });
  const mods = (p.items && p.items.length ? p.items : ['Getting started', 'Core skills', 'Practice', 'Review']).map(cap);
  if (!compact) { s += rect(16, 60, 480, 290, T.panel2, { rx: 12 }) + rect(16, 60, 480, 290, e.lin([[0, mix(T.acc, '#000', 0.2)], [1, mix(T.acc, '#000', 0.55)]], { x1: 0, y1: 0, x2: 1, y2: 1 }), { rx: 12 }) + circ(256, 205, 30, '#ffffff', { opacity: 0.9 }) + path('M248 190 L270 205 L248 220 Z', T.acc) + rect(36, 322, 440, 5, '#ffffff', { rx: 2.5, opacity: 0.35 }) + rect(36, 322, 180, 5, '#ffffff', { rx: 2.5 }); s += txt(16, 380, mods[0], 17, T.ink, { weight: 700, max: 40 }) + rect(16, 394, 300, 8, T.faint, { rx: 4 }) + rect(16, 410, 240, 8, T.faint, { rx: 4 }); }
  const lx = compact ? 16 : 512, lw = W - lx - 16; s += rect(lx, 60, lw, H - 76, T.panel, { rx: 12 }) + txt(lx + 16, 88, 'Modules', 13, T.mute, { weight: 650, spacing: '0.04em' });
  mods.slice(0, compact ? 4 : 6).forEach((m, i) => { const y = 102 + i * (compact ? 44 : 62); s += rect(lx + 10, y, lw - 20, compact ? 38 : 52, i === 1 ? T.accSoft : T.panel2, { rx: 9 }) + circ(lx + 32, y + (compact ? 19 : 26), 10, i < 1 ? T.ok : (i === 1 ? T.acc : T.faint)) + txt(lx + 50, y + (compact ? 24 : 24), m, 13, T.ink, { weight: 650, max: compact ? 26 : 18 }) + (compact ? '' : rect(lx + 50, y + 34, lw - 90, 6, T.line, { rx: 3 }) + rect(lx + 50, y + 34, (lw - 90) * [1, 0.55, 0.2, 0, 0, 0][i], 6, T.acc, { rx: 3 })); });
  return { s, W, H };
}
// ---- documents / extraction ------------------------------------------------------------------------------------------------
function docs(e, T, p, compact) {
  const W = compact ? 400 : 800, H = compact ? 300 : 500; let s = chrome(e, T, W, H, p.title, ['Documents', 'Review', 'Templates', 'Exports'], 1, { compact });
  const fields = (p.items && p.items.length ? p.items : ['Party', 'Effective date', 'Term', 'Signature']).map(cap);
  if (!compact) { s += rect(16, 60, 360, H - 76, T.panel2, { rx: 12 }) + rect(44, 80, 304, H - 116, '#fdfcf8', { rx: 3 }); for (let i = 0; i < 16; i++) s += rect(66, 104 + i * 20, [240, 260, 180, 250][i % 4], 6, '#c9c4ba', { rx: 3 }); [2, 7, 12].forEach(i => { s += rect(62, 98 + i * 20, 180, 16, mix(T.acc, '#ffffff', 0.7), { rx: 3, opacity: 0.8 }); }); }
  const fx = compact ? 16 : 392, fw = W - fx - 16; s += rect(fx, 60, fw, H - 76, T.panel, { rx: 12 }) + txt(fx + 18, 88, 'Extracted fields', 14, T.ink, { weight: 700 });
  fields.slice(0, compact ? 4 : 6).forEach((f, i) => { const y = 104 + i * (compact ? 44 : 56); s += txt(fx + 18, y + 12, f, 12, T.mute, { weight: 650, max: 26 }) + rect(fx + 18, y + 18, fw - 36, compact ? 20 : 26, T.panel2, { rx: 7 }) + rect(fx + 28, y + (compact ? 25 : 27), (fw - 80) * (0.4 + (i % 3) * 0.15), 7, T.ink, { rx: 3.5, opacity: 0.7 }) + circ(fx + fw - 32, y + (compact ? 28 : 31), 7, T.ok); });
  return { s, W, H };
}
// ---- workflow / automation ---------------------------------------------------------------------------------------------------
function workflow(e, T, p, compact) {
  const steps = (p.items && p.items.length >= 3 ? p.items : ['Trigger', 'Understand', 'Review', 'Deliver']).slice(0, 4).map(cap);
  const W = compact ? 400 : 800, H = compact ? 300 : 500; let s = chrome(e, T, W, H, p.title, ['Workflows', 'Runs', 'Connections', 'Settings'], 0, { compact });
  s += rect(16, 60, W - 32, H - 76, T.panel2, { rx: 12 });
  for (let y = 80; y < H - 20; y += 22) for (let x = 36; x < W - 20; x += 22) s += circ(x, y, 1, T.faint, { opacity: 0.6 });
  const pos = compact ? [[40, 90], [210, 90], [210, 190], [40, 190]] : [[50, 120], [240, 220], [430, 120], [600, 250]];
  const nw = compact ? 150 : 170, nh = compact ? 60 : 74;
  for (let i = 1; i < steps.length; i++) {
    const [ax, ay] = pos[i - 1], [bx, by] = pos[i];
    let d;
    if (bx === ax) d = `M${ax + nw / 2} ${ay + nh} C ${ax + nw / 2} ${ay + nh + 20}, ${bx + nw / 2} ${by - 20}, ${bx + nw / 2} ${by}`;
    else if (bx > ax) d = `M${ax + nw} ${ay + nh / 2} C ${ax + nw + 50} ${ay + nh / 2}, ${bx - 50} ${by + nh / 2}, ${bx} ${by + nh / 2}`;
    else d = `M${ax} ${ay + nh / 2} C ${ax - 30} ${ay + nh / 2}, ${bx + nw + 30} ${by + nh / 2}, ${bx + nw} ${by + nh / 2}`;
    s += path(d, 'none', { stroke: T.acc, 'stroke-width': 2, opacity: 0.8 });
  }
  steps.forEach((st, i) => { const [x, y] = pos[i]; s += rect(x, y, nw, nh, T.panel, { rx: 12, stroke: i === 1 ? T.acc : T.line, 'stroke-width': i === 1 ? 2 : 1 }) + rect(x + 14, y + 14, 26, 26, [T.info, T.acc, T.warn, T.ok][i], { rx: 7 }) + txt(x + 50, y + 32, st, 14, T.ink, { weight: 700, max: 14 }) + (compact ? '' : rect(x + 14, y + 52, nw - 60, 7, T.faint, { rx: 3.5 })) + circ(x + nw - 18, y + 27, 5, i < 2 ? T.ok : T.faint); });
  return { s, W, H };
}

const INTERFACES = { schedule, monitor, pipeline, ledger, inbox, editor, store, analytics, learning, docs, workflow };
const INTERFACE_KINDS = Object.keys(INTERFACES);
// Both layouts in one element; styles.css shows `wide` on desktop and `compact` on phones.
function renderInterface(e, kind, params) {
  const fn = INTERFACES[kind] || INTERFACES.analytics; const T = theme(e); const p = Object.assign({ title: 'Product' }, params || {});
  const out = [false, true].map(compact => { const r = fn(e, T, p, compact); return `<svg class="ha-ui-${compact ? 'compact' : 'wide'}" viewBox="0 0 ${r.W} ${r.H}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="${A.esc(`${p.title} interface`)}" xmlns="http://www.w3.org/2000/svg">${r.s}</svg>`; });
  // the whole screen is always visible; the frame around it takes the product's own background
  return `<div class="ha-ui" data-ui="${A.esc(kind)}" style="background:${T.bg}">${out.join('')}</div>`;
}
// a phone showing one notification card -- the supporting "moment" for a software site
function phoneNotice(e, x, y, H, o) {
  const k = o || {}; const T = theme(e); const W = H * 0.5; let s = e.shadow(x + W * 0.1, y + H * 0.52, W * 0.6, H * 0.04, 0.4);
  s += rect(x - W / 2, y - H / 2, W, H, '#16171b', { rx: W * 0.16 }) + rect(x - W / 2 + W * 0.05, y - H / 2 + W * 0.05, W * 0.9, H - W * 0.1, e.lin([[0, mix(T.acc, '#0c0d12', 0.55)], [1, mix(T.acc, '#0c0d12', 0.85)]], { x1: 0, y1: 0, x2: 0.4, y2: 1 }), { rx: W * 0.12 }) + rect(x - W * 0.14, y - H / 2 + W * 0.09, W * 0.28, W * 0.06, '#000', { rx: W * 0.03 });
  s += txt(x, y - H * 0.28, k.time || '9:41', W * 0.2, '#ffffff', { anchor: 'middle', weight: 300 });
  const cy = y - H * 0.08; s += rect(x - W * 0.42, cy, W * 0.84, H * 0.16, 'rgba(255,255,255,0.88)', { rx: W * 0.06 }) + rect(x - W * 0.36, cy + H * 0.025, W * 0.1, W * 0.1, T.acc, { rx: W * 0.025 }) + txt(x - W * 0.22, cy + H * 0.05, k.app || 'App', W * 0.07, '#1d2230', { weight: 700, max: 16 }) + txt(x - W * 0.36, cy + H * 0.1, k.title || 'New booking', W * 0.075, '#1d2230', { weight: 650, max: 22 }) + txt(x - W * 0.36, cy + H * 0.135, k.body || 'Tomorrow · confirmed', W * 0.065, '#5b6273', { max: 26 });
  return s;
}

module.exports = { INTERFACES, INTERFACE_KINDS, renderInterface, phoneNotice, theme };
