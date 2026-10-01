'use strict';
// CREATIVE — the picture pool and the visual plan: the page is planned around its pictures, before any words exist.
//
//   build(assets, opts) -> pool: ONE approved pool of the pictures the page may show -- what discovery found AND what the
//     owner uploaded or picked (neither replaces the other) -- plus the main picture, the logo (never a scene picture), and
//     every picture left out with the reason. opts: { mainAsset, personal }
//       pool.pictures   [{ id, cut, origin, source, role, colour, depicts, wide, tight, big, small }]  originals, main first
//       pool.main       { id, cut, reason } | null    reason: why the owner's choice could not lead ('' when it does)
//       pool.logo       the owner's logo upload id | null
//       pool.excluded   [{ id, reason }]
//       pool.counts     { discovered, uploaded, picked, premium, total }
//   assign(scenes, pool, opts) -> per recipe scene { asset, assets, colour, subject, relation } | null: the visual plan.
//     The main picture opens; every picture in the pool is shown before any is repeated; neighbouring scenes are ordered so
//     their colours lead into each other; the last scene returns to the main picture (the page closes on what it opened
//     with). Multi-picture layouts take several. Scenes that carry no pictures by design get none.
// Browser-safe (bundled into creative-core.js); data only.

const F = require('./framing');
const PAL = require('./palette');

// the same picture reached twice -- an owner's upload and the found picture it came from, or two sizes of one picture --
// has the same shape and the same measured colours: it is one picture, however many times it is in the inventory
function sameAs(a, b) { const x = a.assess, y = b.assess; return !!(x && y && Math.abs((x.aspect || 0) - (y.aspect || 0)) < 0.006 && (x.colours || []).length >= 3 && (x.colours || []).slice(0, 3).join() === (y.colours || []).slice(0, 3).join()); }
function distinctPictures(list) { const out = []; list.forEach(a => { if (!a.cutoutOf && out.some(b => !b.cutoutOf && sameAs(a, b))) return; out.push(a); }); return out; }

const ownerKept = a => a.origin === 'upload'; // an upload or a picture the owner picked from the web (stored as an upload)
const sourceOf = a => (a.premium && a.premium.mediaId ? 'premium' : a.origin === 'upload' ? (a.ownerPicked ? 'picked' : 'upload') : a.origin === 'research' ? 'discovered' : 'derived');
const curOf = (a, byId) => a.curation || (a.cutoutOf && byId.get(a.cutoutOf) && byId.get(a.cutoutOf).curation) || null;
const MIN_LEAD = 300; // a picture whose longest side is smaller cannot lead a page

function build(assets, opts) {
  const o = opts || {}; const all = (assets || []).filter(a => a && a.id);
  const byId = new Map(all.map(a => [a.id, a]));
  const excluded = []; const out = (a, reason) => excluded.push({ id: a.id, reason });
  const live = all.filter(a => { if (a.removed) return false; if (a.failed) { out(a, 'could not be read'); return false; } if (!a.assess) { out(a, 'not measured yet'); return false; } return true; });
  // the owner's logo: shown in the header, never as a scene picture (a logo found by research is only a reference)
  const logos = live.filter(a => !a.cutoutOf && a.ownerRole === 'logo' && ownerKept(a));
  const logo = logos[0] ? logos[0].id : null; logos.forEach(a => out(a, 'the logo (shown in the header, never as a scene picture)'));
  const originals = live.filter(a => !a.cutoutOf && a.ownerRole !== 'logo').sort((a, b) => ownerKept(b) - ownerKept(a));
  const kept = [];
  originals.forEach(a => {
    const k = curOf(a, byId);
    if (!ownerKept(a) && k && (k.role === 'unrelated' || k.role === 'logo' || k.role === 'reference' || k.identity === 'other')) return out(a, `the picture check: ${k.role === 'unrelated' || k.identity === 'other' ? `does not show the subject (${k.depicts || 'unrelated'})` : `a ${k.role}, supporting material only`}`);
    if (o.personal && !ownerKept(a)) return out(a, 'not the owner\'s own photo (a personal page shows only theirs)');
    const twin = kept.find(b => sameAs(a, b)); if (twin) return out(a, `the same picture as ${twin.id}`);
    kept.push(a);
  });
  const cutOf = a => live.find(x => x.cutoutOf === a.id && x.caps && x.caps.moveFreely) || null;
  const entry = a => {
    const p = F.profile(a); const k = curOf(a, byId); const w = (a.assess && a.assess.width) || 0, h = (a.assess && a.assess.height) || 0; const c = cutOf(a);
    return { id: a.id, cut: c ? c.id : null, origin: a.origin, source: sourceOf(a), role: a.ownerRole === 'background' ? 'environment' : k ? k.role : 'subject',
      colour: PAL.identity(a).hex || PAL.identity(c || a).hex, depicts: String((k && k.depicts) || a.alt || a.title || '').replace(/^File:/, '').replace(/\.[a-z]{3,4}$/i, '').slice(0, 100),
      wide: p.wide, tight: p.tight, big: p.big, small: Math.max(w, h) > 0 && Math.max(w, h) < MIN_LEAD, free: !!c || p.free };
  };
  const pictures = kept.map(entry);
  // the main picture: the owner's choice, unless it cannot lead -- then the best picture, and the reason is kept
  const want = o.mainAsset || ((originals.find(a => a.ownerRole === 'main') || {}).id) || null;
  const wantBase = want && byId.get(want) && byId.get(want).cutoutOf ? byId.get(want).cutoutOf : want;
  let reason = '';
  if (wantBase) {
    const a = byId.get(wantBase); const e = pictures.find(x => x.id === wantBase);
    if (!a || a.removed) reason = 'the chosen main picture is no longer in the project';
    else if (a.failed) reason = 'the chosen main picture could not be read';
    else if (a.ownerRole === 'logo') reason = 'the chosen main picture is marked as the logo';
    else if (!e) reason = ((excluded.find(x => x.id === wantBase) || {}).reason) || 'the chosen main picture is not usable';
    else if (e.small) reason = `the chosen main picture is too small to lead a page (${a.assess.width}x${a.assess.height} px)`;
  }
  const score = e => (e.source === 'upload' || e.source === 'picked' ? 4 : 0) + (e.role === 'subject' ? 3 : e.role === 'detail' ? 1 : 0) + (e.big ? 1 : 0) - (e.tight ? 0.5 : 0) - (e.small ? 6 : 0) + (e.cut ? 0.5 : 0);
  let main = null;
  if (wantBase && !reason) { const e = pictures.find(x => x.id === wantBase); main = { id: e.id, cut: e.cut, reason: '', chosen: true }; }
  else if (pictures.length) { const e = pictures.slice().sort((x, y) => score(y) - score(x))[0]; main = { id: e.id, cut: e.cut, reason, chosen: false }; }
  if (main) pictures.sort((x, y) => (y.id === main.id) - (x.id === main.id) || score(y) - score(x));
  const count = s => pictures.filter(p => p.source === s).length;
  return { pictures, main, logo, excluded, counts: { discovered: count('discovered'), uploaded: count('upload'), picked: count('picked'), premium: count('premium'), total: pictures.length }, mainReason: reason };
}

// layouts and how many pictures each takes in the visual plan (0: a scene that carries words by design)
const TAKES = { strip: 4, index: 4, gallery: 3, cardstream: 4, lineup: 4, collage: 3, scrapbook: 3, chapters: 3, floating: 2, 'sticky-steps': 2 };
const NONE = ['text', 'takeover', 'dense', 'brutalist', 'stage'];
// layouts that stand a subject on the stage (its cut-out when it has one)
const FREE = ['offcanvas', 'floating', 'shrine', 'poster', 'luxe', 'depth', 'giant-type', 'campaign', 'fullscreen-object', 'orbit', 'lineup'];
const RELATIONS = ['opens', 'continues', 'shifts', 'contrasts', 'returns'];
// how many times one photo may appear on a page with `n` distinct pictures (two normally; a weak pool shows its few
// pictures more often -- a detail crop, a full bleed, its cut-out -- rather than leave scenes as words alone)
function photoUses(n) { return n <= 1 ? 4 : n === 2 ? 3 : 2; }
// what a scene's words do for its picture (scene.visual.intent): the words answer the picture they sit beside
const INTENTS = ['introduce', 'momentum', 'roster', 'detail', 'story', 'celebrate', 'contrast', 'invite', 'close'];
function assign(scenes, pool, opts) {
  const o = opts || {}; const P = (pool && pool.pictures) || []; if (!P.length) return scenes.map(() => null);
  const main = pool.main ? P.find(p => p.id === pool.main.id) : P[0];
  // (a photo may appear twice; a picture with a clean cut-out a third time -- as its cut-out: validate2's own limits; a
  // small pool reuses its pictures more, through different framings, rather than leave scenes without one)
  const uses = new Map(); const limit = p => photoUses(P.length) + (p.cut ? 1 : 0); const left = p => (uses.get(p.id) || 0) < limit(p);
  const asset = new Map(); let layoutNow = '';
  const note = p => { const n = uses.get(p.id) || 0; asset.set(p, (FREE.includes(layoutNow) || n >= 2) && p.cut ? p.cut : p.id); uses.set(p.id, n + 1); return p; };
  const pickAsset = p => asset.get(p);
  let prevColour = ''; let prevBase = '';
  const next = (n, exclude) => {
    // unshown pictures first; among them the one whose colour leads on from the last scene's (a composition that stands
    // its subjects on the stage takes pictures that can float first: a flat photo would be dropped from it)
    const floats = FREE.includes(layoutNow);
    // (every picture is shown before any repeats: that comes first; art.js turns a cut-out composition into a photo one
    // when the picture it gets has no cut-out)
    const cands = P.filter(p => left(p) && !(exclude || []).includes(p.id)).sort((a, b) => ((uses.get(a.id) || 0) - (uses.get(b.id) || 0)) || (floats ? (!!b.cut || b.free) - (!!a.cut || a.free) : 0) || (PAL.distance(prevColour, a.colour) - PAL.distance(prevColour, b.colour)));
    return cands.slice(0, n);
  };
  const last = scenes.length - 1;
  return scenes.map((s, i) => {
    const layout = s && s.layout; if (!layout || NONE.includes(layout)) return null;
    layoutNow = layout; let picks;
    if (i === 0 && main) picks = [main];
    else if (i === last && main && left(main) && i > 1 && !TAKES[layout]) picks = [main];
    else picks = next(TAKES[layout] || 1);
    if (!picks.length) return null;
    // (a gallery-type scene shows the set: only its lead picture counts as an appearance -- validate2 counts the same)
    picks.forEach((p, k) => { if (k === 0 || (TAKES[layout] || 0) < 3) note(p); else asset.set(p, p.id); });
    const lead = picks[0];
    const relation = i === 0 ? 'opens' : lead.id === prevBase ? 'continues' : i === last && main && lead.id === main.id ? 'returns' : PAL.distance(prevColour, lead.colour) > 200 ? 'contrasts' : 'shifts';
    prevColour = lead.colour || prevColour; prevBase = lead.id;
    return { asset: pickAsset(lead), assets: picks.map(pickAsset), base: lead.id, colour: lead.colour || '', subject: lead.depicts || '', relation };
  });
}

module.exports = { build, assign, photoUses, sameAs, distinctPictures, sourceOf, TAKES, NONE, RELATIONS, INTENTS, MIN_LEAD };
