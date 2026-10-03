'use strict';
// CREATIVE — the built-in art director (v2 plans). When the AI director is unavailable (no key, a budget, a failure),
// or for local review, the page is still ART-DIRECTED: the same recipe chooser the AI path uses (art.js) picks a motion
// personality, a scroll model and a scene architecture for this subject and these pictures (steering away from what this
// account made recently), and this module fills each scene with the right material -- the facts it carries (cited),
// the owner's own words (supplied), or clearly imagined mood lines -- and the pictures that suit its archetype. The
// archetypes then compose it (archetypes.js, through validatePlan2).
//
//   direct(input) -> { plan (raw v2, for validatePlan2 with ctx.art = recipe), recipe }
//   input: { understanding, research: { page, facts }, assets, supplied: { facts, memories }, seed, history, avoid,
//            mainAsset }
// Nothing here invents facts: every factual line is a given fact with its id; everything else is marked imagined.

const ART = require('./art');
const F = require('./framing');
const { chooseWorld, WORLDS, MOOD_LINES } = require('./director');
const { titleCase } = require('./understand');

const KICKERS = { absurd: 'A monument to', cinematic: 'The legend of', playful: 'All about', lyrical: 'In praise of', editorial: 'A closer look at', retro: 'Press start for', tender: 'For', extravagant: 'Behold', serious: 'On', restrained: 'On', reverent: 'In honour of' };
const HEADS = {
  facts: ['Worth knowing', 'The record', 'What we know', 'On the record', 'The particulars', 'In brief'],
  pictures: ['In pictures', 'Seen elsewhere', 'A few more looks', 'From every side'],
  picture: ['A closer look', 'Look again', 'Up close', 'Study'],
  prose: ['The longer story', 'A closer reading', 'The story so far'],
  statement: null, closing: null, opening: null,
};
// the look each personality reaches for (display face, scale, case, backdrop, light, particles, tempo, thread). The display
// face is only a hint: look.js chooses the page's type system from what the page is about (validate2), and no page gets a
// decorative line down its side (thread: none)
const LOOK = {
  editorial: { display: ['serif', 'neutral', 'humanist'], scale: 'large', case: 'normal', backdrop: ['paper', 'grain', 'solid'], light: 'none', particles: 'none', tempo: 'measured', thread: ['none'] },
  cinematic: { display: ['condensed', 'block', 'neutral'], scale: 'monumental', case: 'normal', backdrop: ['vignette', 'spotlight', 'fog'], light: 'spot', particles: 'dust', tempo: 'slow', thread: ['none'] },
  kinetic: { display: ['condensed', 'block', 'campaign'], scale: 'monumental', case: 'upper', backdrop: ['solid', 'grid'], light: 'none', particles: 'none', tempo: 'lively', thread: ['none'] },
  playful: { display: ['rounded', 'block'], scale: 'monumental', case: 'normal', backdrop: ['gradient', 'sunrise', 'solid'], light: 'sun', particles: 'confetti', tempo: 'lively', thread: ['none'] },
  luxe: { display: ['didone', 'wide', 'neutral'], scale: 'quiet', case: 'upper', backdrop: ['solid', 'vignette'], light: 'none', particles: 'none', tempo: 'slow', thread: ['none'] },
  mechanical: { display: ['mono', 'wide', 'neutral'], scale: 'large', case: 'upper', backdrop: ['grid', 'solid'], light: 'none', particles: 'none', tempo: 'measured', thread: ['none'] },
  chaotic: { display: ['campaign', 'condensed', 'slab'], scale: 'monumental', case: 'upper', backdrop: ['grain', 'gradient', 'solid'], light: 'none', particles: 'sparks', tempo: 'lively', thread: ['none'] },
  still: { display: ['humanist', 'serif'], scale: 'quiet', case: 'normal', backdrop: ['solid', 'paper'], light: 'lamp', particles: 'none', tempo: 'still', thread: ['none'] },
};
// palettes per personality, light and dark (a picture on a light background asks for a light page, and the reverse)
const PALETTES = {
  editorial: { light: { bg: '#f1ece2', bg2: '#e3dacb', ink: '#1a1612', muted: '#5f564b', accent: '#a63a24', glow: '#fff8ea' }, dark: { bg: '#15130f', bg2: '#27231d', ink: '#f2ece2', muted: '#b3a998', accent: '#e0795a', glow: '#fff1d8' } },
  cinematic: { light: { bg: '#e9e4dc', bg2: '#cfc6b8', ink: '#15120e', muted: '#5a5147', accent: '#8f3b1f', glow: '#fff6e6' }, dark: { bg: '#0b0c10', bg2: '#1c1f28', ink: '#f1efe9', muted: '#a7a39a', accent: '#d9a441', glow: '#ffe8b8' } },
  kinetic: { light: { bg: '#f4f4f0', bg2: '#e1e1da', ink: '#0d0d0d', muted: '#4a4a46', accent: '#ff3b1f', glow: '#ffffff' }, dark: { bg: '#0a0a0a', bg2: '#1b1b1b', ink: '#f5f5f0', muted: '#a9a9a2', accent: '#d7ff3a', glow: '#ffffff' } },
  playful: { light: { bg: '#fff1e0', bg2: '#ffd9c2', ink: '#241410', muted: '#6e4f43', accent: '#e8452c', glow: '#fff7ef' }, dark: { bg: '#2a1840', bg2: '#452a63', ink: '#fff5ec', muted: '#d7c3e8', accent: '#ffb629', glow: '#ffe9f6' } },
  luxe: { light: { bg: '#f3efe8', bg2: '#e4ddd1', ink: '#1b1814', muted: '#6b6257', accent: '#8c6d3f', glow: '#fffaf1' }, dark: { bg: '#0f0e0c', bg2: '#1e1b17', ink: '#efe9df', muted: '#a8a092', accent: '#c9a96a', glow: '#fff4dc' } },
  mechanical: { light: { bg: '#ededea', bg2: '#d9d9d4', ink: '#111111', muted: '#50504c', accent: '#1f4dff', glow: '#ffffff' }, dark: { bg: '#0c0d0f', bg2: '#1a1c20', ink: '#e9ebee', muted: '#9ca1aa', accent: '#39ff88', glow: '#e9fff2' } },
  chaotic: { light: { bg: '#f7f24a', bg2: '#ffd400', ink: '#111111', muted: '#3a3a1a', accent: '#e4002b', glow: '#ffffff' }, dark: { bg: '#16001f', bg2: '#33004a', ink: '#fff4fb', muted: '#d7b8e6', accent: '#ff2e88', glow: '#fff0f8' } },
  still: { light: { bg: '#efebe4', bg2: '#ded7cb', ink: '#1d1a16', muted: '#625a50', accent: '#6f5a3c', glow: '#fffaf2' }, dark: { bg: '#141412', bg2: '#22211d', ink: '#ece8e1', muted: '#a39d92', accent: '#bfa57a', glow: '#fff6e8' } },
};
// a few imagined words, for compositions made of giant type (never a claim)
const SHORT = { absurd: ['Behold.', 'All hail.', 'The icon.', 'Unbothered.'], playful: ['Yes, really.', 'Go on.', 'More, please.', 'Why not.'], cinematic: ['Look closer.', 'Out of the dark.', 'The frame.', 'Silence.'], editorial: ['In focus.', 'Look again.', 'Consider it.', 'The detail.'], lyrical: ['Quietly.', 'Look again.', 'Still.', 'Slowly.'], tender: ['Always.', 'Remembered.', 'Home.'], retro: ['Press start.', 'Level up.', 'Insert coin.'] };
const PARTICLES_BY_WORLD = { underwater: 'bubbles', night: 'stars', fog: 'fog', sky: 'clouds', warm: 'steam' };

const short = (s, n) => { const t = String(s || '').replace(/\s+/g, ' ').trim(); if (t.length <= n) return t; const cut = t.slice(0, n); const end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? ')); return end > n * 0.5 ? cut.slice(0, end + 1) : ''; };
function lum(hex) { const c = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; }
function saturated(hex) { const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16); const mx = Math.max(r, g, b), mn = Math.min(r, g, b); return mx > 60 && (mx - mn) / mx > 0.45; }
const pick = (r, list) => list[Math.floor(r() * list.length) % list.length];
// what a picture shows, when its title or the picture check says something real ("IMG_2031" or "photo" says nothing)
function meaningful(s) {
  const t = String(s || '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (t.length < 3 || /^(img|dsc|dscn|pxl|photo|image|picture|screenshot|untitled|file)\b[\s\d]*$/i.test(t) || /^[\d\s.]+$/.test(t) || !/[a-z]{3}/i.test(t)) return '';
  return t.charAt(0).toUpperCase() + t.slice(1, 80);
}
// what the scene's words do for its picture (scene.visual.intent)
function intentOf(layout, carries, personality, i, last) {
  if (i === 0) return 'introduce'; if (last) return 'close';
  if (['strip', 'lineup', 'index', 'gallery', 'collage', 'cardstream', 'scrapbook', 'chapters'].includes(layout)) return 'roster';
  if (layout === 'edge-crop') return 'detail';
  if (carries === 'facts' || carries === 'prose') return 'story';
  return ['kinetic', 'playful', 'chaotic'].includes(personality) ? 'momentum' : 'celebrate';
}
function registerOf(u) { const t = u && u.tone; return String((t && typeof t === 'object' ? t.register : t) || '').toLowerCase(); }

function direct(input) {
  const inp = input || {}; const u = inp.understanding || {}; const research = inp.research || {}; const page = research.page || null;
  const facts = (research.facts || []).filter(f => f && f.id && f.text);
  const sup = inp.supplied || { facts: [], memories: [] };
  const assets = (inp.assets || []).filter(a => a && !a.removed && !a.failed && a.assess);
  const kind = u.kind === 'personal' ? 'personal' : u.kind === 'fictional' ? 'fictional' : u.kind === 'invented' ? 'invented' : 'recognizable';
  const reg = registerOf(u) || 'editorial';
  const name = kind === 'personal' ? (u.name || titleCase(u.noun || u.subject || 'Them')) : (page && page.title) || titleCase(u.subject || 'The subject');
  // personal pages: only the owner's own photos show the subject
  const usable0 = kind === 'personal' ? assets.filter(a => a.origin === 'upload' || (a.cutoutOf && assets.some(b => b.id === a.cutoutOf && b.origin === 'upload'))) : assets.filter(a => !(a.curation && (a.curation.role === 'unrelated' || a.curation.identity === 'other' || a.curation.identity === 'form')));
  const recipe = ART.choose({ understanding: Object.assign({}, u, { name }), assets: usable0, facts, supplied: sup, page, seed: inp.seed, history: inp.history, avoid: inp.avoid, prefer: inp.prefer, mainAsset: inp.mainAsset, premium: inp.premium, ...(inp.assetDirector === false ? { assetDirector: false } : {}) });
  // (the asset director's rejections hold here too: a picture it left out -- and its cut-out -- is not a candidate)
  const out0 = new Set(((recipe.assetDirector && recipe.assetDirector.rejected) || []).map(x => x.id));
  const usable = usable0.filter(a => !out0.has(a.id) && !(a.cutoutOf && out0.has(a.cutoutOf)));
  // (the decided hero leads only where the asset director changed the opening -- where it confirmed the existing choice, the
  // built-in director's own staging rules stand, exactly as before)
  const adHero = recipe.assetDirector && recipe.assetDirector.replaced ? recipe.assetDirector.hero : null;
  const r = ART.rng(`${inp.seed || ''}|${name}|words`);
  const P0 = recipe.personality; const look = LOOK[P0];
  // ---- the pictures: the owner's main picture (or the best picture of the subject) leads, as its cut-out when it has one
  const cutOf = a => usable.find(x => x.cutoutOf === a.id && x.caps && x.caps.moveFreely);
  const score = a => (a.id === inp.mainAsset ? 100 : 0) + (!inp.mainAsset && a.id === adHero ? 50 : 0) + (a.origin === 'upload' ? 4 : 0) + (a.curation && a.curation.role === 'subject' ? 3 : 0) + (a.relevance || 0) + (F.profile(a).big ? 0.5 : 0) - (F.profile(a).tight ? 0.5 : 0);
  const heroLayout = recipe.scenes[0].layout;
  // compositions that stand a subject on the stage want its cut-out; these frame a photograph
  const FREE = ['offcanvas', 'floating', 'shrine', 'poster', 'luxe', 'depth', 'giant-type', 'stage', 'campaign', 'fullscreen-object', 'orbit', 'lineup'];
  const WIDE = ['editorial-hero', 'cinematic', 'image', 'split', 'magazine', 'splitscreen', 'chapters'];
  const wantsWhole = WIDE.includes(heroLayout);
  const originals = ART.distinctPictures(usable.filter(a => !a.cutoutOf).sort((a, b) => (b.origin === 'upload') - (a.origin === 'upload'))).sort((a, b) => (score(b) + (FREE.includes(heroLayout) && cutOf(b) ? 6 : 0)) - (score(a) + (FREE.includes(heroLayout) && cutOf(a) ? 6 : 0)));
  const mainOrig = originals[0] || usable[0] || null;
  const mainPic = mainOrig ? (!wantsWhole && cutOf(mainOrig)) || mainOrig : null;
  const others = originals.filter(a => a !== mainOrig);
  const env = others.filter(a => a.curation && (a.curation.role === 'environment' || a.curation.role === 'detail'));
  // every picture appears ONCE (its cut-out is the same picture -- the image ledger, look.js): the next unused suitable
  // picture comes next, and a scene with none left is carried by its words and colour
  const uses = new Map(); const limit = () => 1;
  const note = a => { if (a) { const k = a.cutoutOf || a.id; uses.set(k, (uses.get(k) || 0) + 1); } return a; };
  note(mainPic);
  // (a composition that frames a wide photograph asks for one: a wide, uncropped picture comes first)
  const wideOk = a => { const p = F.profile(a); return !p.free && !p.tight && F.coverCrop(p.aspect, 1.6).crop <= F.budgetFor(a, 'bleed'); };
  const pickPic = (free, exclude, wide) => {
    const c = originals.filter(a => (uses.get(a.id) || 0) < limit(a) && !(exclude || []).includes(a.id)).sort((a, b) => (wide ? wideOk(b) - wideOk(a) : 0) || (uses.get(a.id) || 0) - (uses.get(b.id) || 0) || score(b) - score(a));
    const a = (free && c.find(x => cutOf(x))) || c[0]; if (!a) return null;
    return note(free && cutOf(a) ? cutOf(a) : (uses.get(a.id) || 0) >= 2 && cutOf(a) ? cutOf(a) : a);
  };
  const take = (n, free) => { const got = []; for (let k = 0; k < n; k++) { const a = pickPic(free, got.map(x => x.cutoutOf || x.id)); if (!a) break; got.push(a); } return got; };
  // ---- the words
  const factsLeft = facts.slice(); const use = f => { const i = factsLeft.indexOf(f); if (i >= 0) factsLeft.splice(i, 1); return f; };
  const takeFacts = (n, max) => factsLeft.filter(f => f.text.length <= (max || 240)).slice(0, n).map(use);
  const lede = facts.find(f => f.text.length >= 40 && f.text.length <= 200) || null; if (lede) use(lede);
  const moods = (MOOD_LINES[{ extravagant: 'absurd', restrained: 'editorial', serious: 'editorial', reverent: 'lyrical' }[reg] || reg] || MOOD_LINES.editorial).slice();
  const mood = () => moods.splice(Math.floor(r() * moods.length) % Math.max(1, moods.length), 1)[0] || 'Some things deserve a second look.';
  const supLines = (sup.facts || []).map(t => ({ text: t, kind: 'supplied' })); const memLines = (sup.memories || []).map(t => ({ text: t, kind: 'supplied' }));
  const usedHeads = new Set();
  const head = key => { const list = (HEADS[key] || []).filter(h => !usedHeads.has(h)); const h = list.length ? pick(r, list) : mood(); usedHeads.add(h); return h; };
  const img = (a, role, frame) => (a ? Object.assign({ kind: 'image', role: role || 'focal', asset: a.id, box: { d: [50, 10, 40, 80], m: [10, 10, 80, 80] } }, frame ? { frame } : {}) : null);
  const scenes = recipe.scenes.map((rs, i) => {
    const s = { id: i === 0 ? 'opening' : `scene-${i + 1}`, name: '', purpose: '', height: 'screen', layout: rs.layout, choreo: rs.choreo, handoff: rs.handoff, layers: [], text: { kind: 'imagined', region: 'left', size: i === 0 ? 'display' : 'large', width: 'medium', items: [] } };
    const t = s.text; const L = rs.layout; const last = i === recipe.scenes.length - 1;
    if (i === 0) {
      s.name = 'Opening'; s.purpose = 'the subject, as the page first shows it';
      t.kicker = kind === 'personal' ? (u.purpose === 'memorial' ? 'In memory' : `${u.relation === 'my' ? 'My' : 'Our'} ${u.noun || 'friend'}`) : kind === 'invented' || kind === 'fictional' ? 'An invented world' : (KICKERS[reg] || KICKERS.editorial);
      t.heading = name.slice(0, 100);
      if (kind === 'personal' && supLines[0]) { t.body = supLines.shift().text.slice(0, 300); t.kind = 'supplied'; }
      else if (lede && kind !== 'invented') { t.body = short(lede.text, 220) || ''; if (t.body) { t.kind = 'sourced'; t.cite = lede.id; } }
      // (an opening inside the actor's run shows the subject as the actor, not as a picture of its own)
      if (mainPic && L !== 'stage') s.layers.push(img(mainPic, 'focal'));
      if (L === 'collage' || L === 'floating') take(L === 'collage' ? 3 : 2, L === 'floating').forEach(a => s.layers.push(img(a, 'support')));
      s.cta = kind === 'personal' ? `Meet ${name}`.slice(0, 40) : pick(r, ['Begin', 'Scroll the story', 'Step inside', 'Look closer']);
      if (mainPic && L !== 'stage') s.visual = { asset: mainPic.id, subject: meaningful(rs.visual && rs.visual.subject), intent: 'introduce', relation: 'opens' };
      return s;
    }
    const carries = rs.carries;
    s.name = { facts: 'The facts', pictures: 'Pictures', picture: 'A closer look', prose: 'The story', statement: 'Statement', closing: 'Closing' }[carries] || 'Scene';
    s.purpose = { facts: 'what is known, one line at a time', pictures: 'the pictures together', picture: 'one picture, looked at properly', prose: 'the longer story', statement: 'one thought, given room', closing: 'a quiet ending' }[carries] || 'a scene of the page';
    s.navLabel = { facts: 'Facts', pictures: 'Pictures', picture: 'Detail', prose: 'Story', statement: '', closing: '' }[carries] || '';
    if (carries === 'facts') {
      const lines = kind === 'personal' ? supLines.splice(0, 5).concat(memLines.splice(0, Math.max(0, 5 - supLines.length))) : takeFacts(L === 'dense' ? 6 : 5).map(f => ({ text: f.text, kind: 'sourced', cite: f.id }));
      t.heading = head('facts'); t.items = lines.map(x => Object.assign({}, x, { label: x.cite ? ((/\b(1[0-9]{3}|20[0-4][0-9])\b/.exec(x.text) || [])[1] || '') : '' }));
      t.list = t.items.some(x => x.label) ? 'timeline' : 'labelled';
      if (L === 'sticky-steps') { take(Math.min(3, Math.max(1, t.items.length - 1))).forEach((b, k) => s.layers.push(img(b, k ? 'support' : 'focal'))); }
      else if (L === 'brutalist' || L === 'dense' || L === 'orbit') { const a = take(1, L === 'orbit')[0]; if (a) s.layers.push(img(a, 'focal')); }
    } else if (carries === 'pictures') {
      t.heading = head('pictures');
      const picks = take(L === 'strip' || L === 'index' ? 6 : L === 'gallery' || L === 'cardstream' || L === 'lineup' ? 5 : L === 'scrapbook' ? 3 : 4, L === 'lineup');
      picks.forEach((a, k) => s.layers.push(img(a, k ? 'support' : 'focal')));
      if (L === 'gallery' || L === 'strip' || L === 'chapters' || L === 'cardstream' || L === 'index') { const f = takeFacts(1, 200)[0]; if (f) { t.body = f.text; t.kind = 'sourced'; t.cite = f.id; } }
    } else if (carries === 'picture') {
      const a = pickPic(false, null, WIDE.includes(L)); t.heading = head('picture');
      if (a) { s.layers.push(img(a, 'focal')); const f = takeFacts(1, 220)[0]; if (f) { t.body = f.text; t.kind = 'sourced'; t.cite = f.id; } }
    } else if (carries === 'prose') {
      const f = factsLeft.filter(x => x.text.length > 90 && x.text.length <= 500).sort((a, b) => b.text.length - a.text.length)[0];
      t.heading = head('prose'); if (f) { use(f); t.body = f.text; t.kind = 'sourced'; t.cite = f.id; } else if (kind === 'personal' && memLines[0]) { t.body = memLines.shift().text; t.kind = 'supplied'; }
      const a = L !== 'text' ? take(1)[0] : null; if (a) s.layers.push(img(a, 'focal'));
    } else if (carries === 'closing' || last) {
      t.heading = mood(); t.size = 'large';
      if (['shrine', 'luxe', 'floating', 'offcanvas', 'poster', 'depth', 'framed', 'split', 'image', 'cinematic', 'campaign', 'fullscreen-object', 'splitscreen'].includes(L)) { const a = pickPic(FREE.includes(L), null, WIDE.includes(L)); if (a) s.layers.push(img(a, 'focal')); }
      s.name = 'Closing'; s.purpose = 'a quiet ending';
    } else {
      // a statement: one thought -- a short fact given room, or an imagined line -- and the subject again, differently
      const f = takeFacts(1, 180)[0];
      const few = () => { const list = (SHORT[{ extravagant: 'absurd', restrained: 'editorial', serious: 'editorial', reverent: 'lyrical' }[reg] || reg] || SHORT.editorial).filter(h => !usedHeads.has(h)); const h = list.length ? pick(r, list) : mood(); usedHeads.add(h); return h; };
      const head0 = L === 'giant-type' || L === 'poster' || L === 'campaign' || L === 'fullscreen-object' ? few() : mood();
      if (f) { t.heading = head0; t.body = f.text; t.kind = 'sourced'; t.cite = f.id; } else { t.heading = head0; }
      const a = L === 'text' || L === 'takeover' || L === 'stage' ? null : pickPic(FREE.includes(L), null, WIDE.includes(L));
      if (a) s.layers.push(img(a, 'focal'));
      const tex = L === 'depth' && env.find(x => x.id !== (a && (a.cutoutOf || a.id)) && (uses.get(x.id) || 0) < 1);
      if (tex) { note(tex); s.layers.push(img(tex, 'texture', 'texture')); }
    }
    if (!t.heading) t.heading = mood();
    // the visual plan decides the scene's pictures (art.js / pool.js): the scene shows what it was planned around, and
    // its words name what that picture shows -- never a generic line next to an unrelated picture
    const vis = rs.visual; const byIdU = new Map(usable.map(a => [a.id, a]));
    if (vis && L !== 'stage') {
      const pics = (vis.assets || [vis.asset]).map(id => byIdU.get(id)).filter(Boolean);
      if (pics.length) {
        s.layers = pics.map((a, k) => img(a, k ? 'support' : 'focal')).concat(s.layers.filter(x => x.role === 'texture' && !pics.some(a => a.id === x.asset)));
        // (the closing scene's return to the opening picture is a marked narrative callback -- the ledger's one exception)
        if (vis.callback && s.layers[0]) s.layers[0].callback = true;
        const said = meaningful(vis.subject);
        if (said && i > 0 && carries !== 'facts') t.kicker = said.slice(0, 40);
        s.visual = { asset: pics[0].id, subject: said, intent: intentOf(L, carries, P0, i, last), relation: vis.relation };
      }
    }
    // (a second line for the moment the scene swaps its words: short, no numbers, never a fact)
    const altPool = (SHORT[{ extravagant: 'absurd', restrained: 'editorial', serious: 'editorial', reverent: 'lyrical' }[reg] || reg] || SHORT.editorial).filter(h => h !== t.heading);
    if (altPool.length) t.alt = altPool[Math.floor(r() * altPool.length) % altPool.length];
    return s;
  });
  // (a navigation label names one scene: a second scene of the same kind is reached by scrolling, not listed twice)
  const navSeen = new Set(); scenes.forEach(s => { if (!s.navLabel) return; if (navSeen.has(s.navLabel)) s.navLabel = ''; else navSeen.add(s.navLabel); });
  // the page has at least its opening and one more scene with words
  const personalOrTender = P0 === 'still';
  const bright = mainOrig && mainOrig.assess && mainOrig.assess.background && lum(mainOrig.assess.background.colour || '#000000') > 0.45 && mainOrig.assess.background.uniformity > 0.5;
  const lightPage = P0 === 'chaotic' ? r() < 0.55 : P0 === 'playful' ? r() < 0.7 : bright ? r() < 0.75 : r() < 0.35;
  const palette = Object.assign({}, PALETTES[P0][lightPage ? 'light' : 'dark']);
  // the subject's own strong colour tints the accent (an orange goldfish, a red jacket)
  const col = mainOrig && mainOrig.assess && (mainOrig.assess.colours || []).find(c => /^#[0-9a-f]{6}$/i.test(c) && saturated(c));
  if (col && P0 !== 'mechanical' && P0 !== 'luxe') palette.accent = col;
  const worldText = `${u.subject || ''} ${page ? `${page.title} ${page.description || ''}` : ''} ${u.brief || ''}`;
  const world = chooseWorld(worldText, page && page.category, reg, mainOrig);
  const particles = personalOrTender || P0 === 'mechanical' || P0 === 'luxe' || P0 === 'kinetic' ? 'none' : PARTICLES_BY_WORLD[world] || look.particles;
  const plan = {
    identity: { name: name.slice(0, 120), kind },
    concept: { title: `${name}: ${ART.MOTION[P0].label}`.slice(0, 80), logline: `${name}, told in ${recipe.scenes.length} scenes -- ${recipe.why}.`.slice(0, 300), why: recipe.why },
    palette, type: { display: pick(r, look.display), scale: look.scale, case: name.length > 18 ? 'normal' : look.case },
    atmosphere: { backdrop: pick(r, look.backdrop), light: look.light, particles, density: particles === 'none' ? 0 : 0.35, grain: P0 === 'editorial' || P0 === 'chaotic' },
    motion: { tempo: look.tempo, signature: `${ART.MOTION[P0].label}: ${recipe.scenes.map(s => s.choreo).filter(c => c !== 'settle').slice(0, 2).join(' and ') || 'a quiet settle'}` },
    thread: { kind: pick(r, look.thread) },
    art: recipe,
    // the persistent actor: the subject's own cut-out carries the run (the validator re-checks it, or drops the run)
    ...(recipe.actor && mainOrig && cutOf(mainOrig) ? { actor: Object.assign({}, recipe.actor, { asset: cutOf(mainOrig).id }) } : {}),
    assetNotes: [], wants: mainPic ? [] : [{ description: `a clear picture of ${name}`, role: 'subject', fallback: 'the page is built around its words and colours' }], limitations: mainPic ? [] : ['no picture of the subject was available'],
    scenes,
    direction: { source: 'built-in', model: '', at: new Date().toISOString(), attempt: 1, repaired: false, seed: String(inp.seed || '').slice(0, 40) },
  };
  return { plan, recipe };
}

module.exports = { direct, LOOK, PALETTES };
