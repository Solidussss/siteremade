'use strict';
// CREATIVE -- THE ASSET DIRECTOR: which pictures the page is built from, decided before the pool, the visual plan and
// every composition. Not a new measurement and not a new search: it reads what the studio already measured
// (assets.assess -- size, subject box, background, colours, and for new pictures a perceptual signature and sharpness),
// what the picture check already saw (curation: role, identity, issues, framing, separable, quality), where a picture
// came from (owner upload, discovered page, host) and the gates that already exist (premium-source.js for video,
// three-d.js for 3D) -- and makes the decisions nothing made before:
//
//   profile(asset)   a bounded profile: identity (exact / form / related / other, owner), resolution, sharpness,
//                    subject dominance, crop flexibility, negative space, background cleanliness, isolation, lighting,
//                    contamination (watermark, text, marketplace presentation), generic stock -- and a suitability per
//                    ROLE (hero, full bleed, cutout, actor, 3D source, cinematic source, detail, support, callback). Never
//                    one score.
//   groups()         near-duplicates: the same picture resized, mirrored, re-hosted or cropped (perceptual signature,
//                    file name, shape and colours, what it shows) -- the stronger copy is kept
//   decide()         the smallest strong, coherent set that carries the idea: the hero (the owner's main picture always;
//                    else the strongest picture able to carry the opening), the actor, a detail, the support, the 3D and
//                    cinematic sources among the eligible -- and every picture left out, with the reason. A quality
//                    floor for pictures the owner did not supply: a missing picture is better than a bad one. Scarcity
//                    (one strong picture) is reported so the page leans on type, colour and one callback rather than
//                    repeating it.
//   normalise()      plan.assetDirector (VERSION), the only door into a stored page
//
// Owner intent outranks it (an upload is never rejected for quality -- it is staged where it is strong), permissions
// outrank it (it only ever narrows what the permission rules allowed), and every later stage may scale, crop and stage
// its pictures but never bring back one it rejected (validate2.js). Pure and browser-safe.
const F = require('./framing');
const TD = require('./three-d');
const PS = require('./premium-source');

const VERSION = 1;
const IDW = { owner: 1, exact: 1, form: 0.7, related: 0.35, unknown: 0.5, other: 0 }; // how surely it is THIS subject
const ROLES = ['hero', 'bleed', 'cutout', 'actor', 'model3d', 'cinematic', 'detail', 'support', 'callback'];

// ---------------------------------------------------------------- where a picture came from, what it is called
// a marketplace is a presentation (listings, price tags, product grids); a stock library's previews carry watermarks;
// free stock is usually generic. A plain white background is none of these.
const MARKET_HOST = /(^|\.)(amazon|ebay|walmart|aliexpress|alibaba|etsy|target|bestbuy|temu|shein|wish|flipkart|rakuten|mercadolibre|newegg|jd|taobao|shopee|lazada|zalando|asos|wayfair|overstock|argos|currys|otto|bol|allegro|noon|mercari|poshmark|depop)\.[a-z.]+$/i;
const MARKET_WORDS = /(\bbuy\b|\bprice\b|\bsale\b|\bdiscount\b|% off|free shipping|add to cart|\bin stock\b|\blisting\b|\bbestseller\b|\bdeal\b|\bcoupon\b|[$£€]\s?\d)/i;
const WATERMARK_HOST = /(^|\.)(shutterstock|istockphoto|gettyimages|alamy|dreamstime|depositphotos|123rf|bigstockphoto|canstockphoto|vectorstock|pond5|freepik|stock\.adobe)\.[a-z.]+$/i;
const FREE_STOCK_HOST = /(^|\.)(unsplash|pexels|pixabay|stocksnap|burst\.shopify|kaboompics|rawpixel|picjumbo|gratisography|negativespace|lifeofpix)\.[a-z.]+$/i;
const GENERIC = /\b(handshake|shaking hands|office|team meeting|meeting room|business ?(man|woman|men|women|people|team|meeting)|colleagues|coworkers|smiling (people|team|woman|man|group)|laptop|smartphone|phone on (a )?(desk|table)|desk|workspace|workstation|coffee cup|skyline|cityscape|city at night|luxury interior|living room|spa|massage|candles|abstract background|stock photo|people (working|using)|typing)\b/i;
const hostOf = u => { const m = /^https?:\/\/([^/:?#]+)/i.exec(String(u || '')); return m ? m[1].toLowerCase().replace(/^www\./, '') : ''; };
const fileOf = u => { const m = /\/([^/?#]+?)(?:\.(?:jpe?g|png|webp|gif|avif))?(?:[?#].*)?$/i.exec(String(u || '')); return m ? m[1].toLowerCase().replace(/[-_](\d{2,4}x\d{2,4}|\d{2,4}px|thumb|small|medium|large|scaled|[a-z])$/i, '').replace(/^\d+px-/, '') : ''; };
const curOf = (a, byId) => a.curation || (a.cutoutOf && byId && byId.get(a.cutoutOf) && byId.get(a.cutoutOf).curation) || null;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// what the brief asks to see, against what a picture shows: a picture of the right KIND of thing in the wrong colour or
// the wrong form ("orange soda" for "lime soda", "white sneaker" for "black leather loafer") is a related subject, not
// this one -- whatever the picture check called it
const COLOURS = ['black', 'white', 'red', 'orange', 'yellow', 'green', 'lime', 'blue', 'navy', 'purple', 'pink', 'brown', 'grey', 'gray', 'silver', 'gold', 'beige', 'tan', 'cream'];
// (forms that are different PRODUCTS -- a loafer is not a sneaker, an SUV is not a coupe; a can, a bottle and a glass of the
// same drink are the same subject served differently, so packaging is not a form here)
const FORMS = [['sneaker', 'trainer', 'loafer', 'boot', 'heel', 'sandal', 'slipper', 'oxford', 'brogue', 'mule', 'clog'], [['coupe', 'tourer', 'gt'], 'sedan', 'suv', 'hatchback', 'pickup', 'truck', 'van', 'convertible', 'wagon', 'roadster'],
  ['dress', 'shirt', 'jacket', 'coat', 'skirt', 'trousers', 'jeans', 'hoodie', 'sweater']];
const words = s => String(s || '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter(Boolean);
function conflicts(want, shows) {
  const w = new Set(words(want)), s = new Set(words(shows)); if (!w.size || !s.size) return null;
  const wc = COLOURS.filter(c => w.has(c)), sc = COLOURS.filter(c => s.has(c));
  if (wc.length && sc.length && !sc.some(c => wc.includes(c) || (c === 'gray' && wc.includes('grey')) || (c === 'grey' && wc.includes('gray')))) return `${sc[0]}, not ${wc[0]}`;
  // (a form may have synonyms -- a grand tourer IS a coupe: [coupe, tourer, gt] is one form)
  const has = (set, f) => [].concat(f).some(x => set.has(x) || set.has(`${x}s`));
  for (const group of FORMS) { const wf = group.filter(f => has(w, f)), sf = group.filter(f => has(s, f)); if (wf.length && sf.length && !sf.some(f => wf.includes(f))) return `a ${[].concat(sf[0])[0]}, not a ${[].concat(wf[0])[0]}`; }
  return null;
}

// ---------------------------------------------------------------- the profile
// profile(asset, ctx) -> { id, owner, logo, identity, scores: { resolution, sharpness, dominance, crop, space, clean,
//   isolation, light }, flags: { watermark, text, marketplace, stock, lowQuality, dark, cropped }, roles: { hero, ... },
//   reasons } -- every number 0..1, null when it cannot be known
function profile(a, ctx) {
  const c = ctx || {}; const byId = c.byId || new Map(); const A = a.assess || {}; const k = curOf(a, byId); const issues = (k && k.issues) || [];
  const owner = a.origin === 'upload'; const host = hostOf(a.sourceUrl || a.pageUrl);
  const text = `${a.title || ''} ${a.alt || ''} ${(k && k.depicts) || ''} ${a.sourceUrl || ''} ${a.pageUrl || ''}`;
  const logo = a.ownerRole === 'logo' || a.kind === 'logo' || !!(k && k.role === 'logo');
  // identity: what the picture check saw -- demoted when it shows the right kind of thing in the wrong colour or form
  let identity = k ? k.identity : owner ? 'owner' : 'unknown'; const clash = !owner && c.want ? conflicts(c.want, (k && k.depicts) || `${a.title || ''} ${a.alt || ''}`) : null;
  if (clash && (identity === 'exact' || identity === 'unknown')) identity = 'related';
  const tech = c.genre === 'tech';
  const W = A.width || 0, H = A.height || 0; const short = Math.min(W, H);
  const resolution = short >= 1200 ? 1 : short >= 900 ? 0.9 : short >= 700 ? 0.75 : short >= 500 ? 0.55 : short >= 350 ? 0.3 : 0.1;
  const sh = a.quality && Number.isFinite(a.quality.sharpness) ? a.quality.sharpness : Number.isFinite(A.sharp) ? A.sharp : null;
  const sharpness = sh == null ? null : clamp((sh - 0.25) / 0.75, 0, 1); // (premium-source.sharpness: ~1 crisp, under 0.3 blurred)
  const box = Array.isArray(A.subject) && A.subject.length === 4 ? A.subject : null; const fr = k && k.framing;
  const dominance = box ? clamp((box[2] - box[0]) * (box[3] - box[1]), 0, 1) : fr === 'tight' ? 0.7 : fr === 'cropped' ? 0.6 : fr === 'whole' ? 0.35 : fr === 'scene' ? 0.15 : fr === 'texture' ? 1 : null;
  // (crop room: the smallest margin around the subject, both ways -- a subject touching the frame cannot be re-cropped)
  const crop = box ? clamp(Math.min(box[0], 1 - box[2], box[1], 1 - box[3]) * 4, 0, 1) * 0.7 + (1 - (dominance || 0)) * 0.3 : fr === 'scene' || fr === 'texture' ? 0.75 : fr === 'whole' ? 0.6 : fr === 'tight' ? 0.2 : fr === 'cropped' ? 0.1 : 0.5;
  const space = dominance == null ? null : clamp(1 - dominance, 0, 1);
  const clean = A.transparent ? 1 : A.background ? clamp(A.background.uniformity, 0, 1) : null;
  const cut = !!(byId && [...byId.values()].some(x => x.cutoutOf === a.id && x.caps && x.caps.moveFreely));
  const isolation = A.transparent || a.cutout || cut ? 1 : k && k.separable ? 0.8 : clean != null && clean >= 0.8 ? 0.6 : 0.2;
  const lum = A.luminance || 0; const light = issues.includes('dark') || (lum && lum < 40) ? 0.3 : lum > 235 ? 0.6 : 1;
  const flags = {
    watermark: issues.includes('watermark') || WATERMARK_HOST.test(host),
    text: issues.includes('text-heavy') || (!tech && issues.includes('screenshot')),
    // (marketplace PRESENTATION: a listing host, sales words, a collage or screenshot of a shop -- never a plain background)
    marketplace: MARKET_HOST.test(host) || MARKET_WORDS.test(`${a.title || ''} ${a.alt || ''}`) || (issues.includes('collage') && !owner),
    stock: !owner && identity !== 'exact' && (FREE_STOCK_HOST.test(host) || GENERIC.test(text)),
    lowQuality: issues.includes('low-quality') || (k && k.quality != null && k.quality > 0 && k.quality <= 1) || false,
    dark: light < 0.5, cropped: issues.includes('cropped') || fr === 'cropped', busy: issues.includes('busy'),
  };
  const idw = IDW[identity] == null ? 0.5 : IDW[identity];
  const dirt = (flags.watermark ? 0.6 : 0) + (flags.marketplace ? 0.5 : 0) + (flags.text ? 0.35 : 0) + (flags.stock ? 0.3 : 0) + (flags.lowQuality ? 0.25 : 0) + (flags.busy ? 0.1 : 0);
  const q = clamp(1 - dirt, 0, 1) * (sharpness == null ? 1 : 0.6 + 0.4 * sharpness) * light;
  // (full bleed at 1440 within its crop budget; a phone's tall frame costs a little where it cannot survive it)
  const p = F.profile(a); const bleedable = !p.free && F.canBleed(a, 1.6); const phone = !p.free && F.canBleed(a, 0.75);
  const role = (k && k.role) || (a.ownerRole === 'background' ? 'environment' : 'subject');
  const roles = {
    // the opening: the subject itself, big enough, croppable, with room for words -- and drama: a subject that commands
    hero: logo ? 0 : idw * (0.35 + 0.65 * resolution) * (0.6 + 0.4 * crop) * q * (role === 'subject' ? 1 : role === 'detail' ? 0.6 : 0.75) * (dominance == null ? 0.85 : dominance < 0.05 ? 0.5 : dominance > 0.85 ? 0.8 : 1),
    bleed: logo || p.free ? 0 : (bleedable ? 1 : 0.35) * (phone ? 1 : 0.8) * resolution * q * (fr === 'tight' || fr === 'cropped' ? 0.7 : 1),
    cutout: logo ? 0 : isolation * (0.4 + 0.6 * resolution) * (flags.cropped ? 0.3 : 1) * q,
    actor: logo ? 0 : (idw >= 0.7 ? 1 : 0.2) * isolation * (0.4 + 0.6 * resolution) * (flags.cropped ? 0.3 : 1) * q * (A.aspect && (A.aspect > 3 || A.aspect < 0.33) ? 0.5 : 1),
    model3d: 0, cinematic: 0,
    detail: logo ? 0 : (role === 'detail' || fr === 'tight' || fr === 'texture' ? 1 : 0.3) * Math.max(idw, 0.5) * (0.5 + 0.5 * resolution) * q,
    support: logo ? 0 : (role === 'environment' || role === 'supporting' ? 1 : 0.6) * Math.max(idw, 0.35) * (0.5 + 0.5 * resolution) * q,
    callback: 0,
  };
  // the 3D and cinematic sources: only among what the existing gates allow -- then the clearest, most complete subject
  const td = TD.sourceEligible(a, { byId }); if (td.ok) roles.model3d = isolation * (0.5 + 0.5 * resolution) * (flags.cropped ? 0.2 : 1) * (fr === 'whole' || !fr ? 1 : 0.7) * q * (sharpness == null ? 1 : 0.5 + 0.5 * sharpness);
  const vs = PS.eligible(a, { byId }); if (vs.ok) roles.cinematic = (0.5 + 0.5 * resolution) * (0.4 + 0.6 * crop) * (dominance == null ? 0.8 : dominance < 0.06 ? 0.3 : dominance > 0.8 ? 0.6 : 1) * (A.aspect >= 1.2 ? 1 : 0.75) * q * (flags.busy ? 0.6 : 1);
  roles.callback = roles.hero;
  Object.keys(roles).forEach(r => { roles[r] = Math.round(roles[r] * 1000) / 1000; });
  const r3 = v => (v == null ? null : Math.round(v * 1000) / 1000);
  return { id: a.id, owner, logo, host, identity, clash, role, scores: { resolution: r3(resolution), sharpness: r3(sharpness), dominance: r3(dominance), crop: r3(crop), space: r3(space), clean: r3(clean), isolation: r3(isolation), light: r3(light) }, flags, roles, short, sig: A.sig || null, file: fileOf(a.sourceUrl || a.pageUrl || ''), colours: (A.colours || []).slice(0, 3), aspect: A.aspect || 0, depicts: String((k && k.depicts) || '').toLowerCase().trim(), warm: warmth(A.colours) };
}
function warmth(cols) { const c = (cols || []).slice(0, 3).map(h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(5, 7), 16)]).filter(x => !isNaN(x[0])); return c.length ? Math.round(c.reduce((t, [r, b]) => t + (r - b), 0) / c.length) : 0; }

// ---------------------------------------------------------------- near-duplicates
// a 64-bit difference hash (assess.sig, 16 hex) -- the mirrored picture's hash is the bits of each row reversed
const bits = h => { const out = []; for (const ch of String(h)) { const v = parseInt(ch, 16); for (let i = 3; i >= 0; i--) out.push((v >> i) & 1); } return out; };
const hamming = (x, y) => { const a = bits(x), b = bits(y); let d = 0; for (let i = 0; i < 64; i++) d += a[i] !== b[i] ? 1 : 0; return d; };
const mirror = h => { const b = bits(h); const out = []; for (let r = 0; r < 8; r++) { const row = b.slice(r * 8, r * 8 + 8).reverse().map(v => 1 - v); out.push(...row); } let s = ''; for (let i = 0; i < 64; i += 4) s += ((out[i] << 3) | (out[i + 1] << 2) | (out[i + 2] << 1) | out[i + 3]).toString(16); return s; };
const near = (x, y) => { const v = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)); const a = v(x), b = v(y); return a.every((c, i) => Math.abs(c - b[i]) <= 28); };
// same(p, q) -> why two pictures are one, or null
function same(p, q) {
  if (p.sig && q.sig && /^[0-9a-f]{16}$/.test(p.sig) && /^[0-9a-f]{16}$/.test(q.sig)) { if (hamming(p.sig, q.sig) <= 10) return 'the same picture (another size or copy)'; if (hamming(mirror(p.sig), q.sig) <= 10) return 'the same picture, mirrored'; }
  if (p.file && q.file && p.file.length >= 6 && p.file === q.file && p.host !== q.host) return 'the same picture on another site';
  if (Math.abs(p.aspect - q.aspect) < 0.006 && p.colours.length >= 3 && p.colours.join() === q.colours.join()) return 'the same picture';
  // (a crop of the same photo: what it shows, its colours and its source page agree -- a weaker signal, so all three)
  if (p.depicts && p.depicts === q.depicts && p.depicts.split(' ').length >= 3 && p.colours.filter(x => q.colours.some(y => near(x, y))).length >= 2) return 'the same photo, cropped or re-shot from the same angle';
  return null;
}

// ---------------------------------------------------------------- the decision
// decide(assets, ctx) -> the decision (see normalise for its stored shape) + profiles
//   ctx: { mainAsset, want (what the brief asks to see: identity.what / visuals.main), genre, personal, choice (a validated
//          model choice: { hero, actor, detail, model3d, cinematic, reject: [] }), maxFound (default 5) }
function decide(assets, ctx) {
  const c = ctx || {}; const all = (assets || []).filter(a => a && a.id && !a.removed && !a.failed && a.assess);
  const byId = new Map(all.map(a => [a.id, a])); const originals = all.filter(a => !a.cutoutOf && !a.derivedFrom);
  const P = originals.map(a => profile(a, { byId, want: c.want, genre: c.genre })); const by = new Map(P.map(p => [p.id, p]));
  const rejected = []; const reject = (p, reason) => { if (!rejected.some(x => x.id === p.id)) rejected.push({ id: p.id, reason }); };
  const notes = [];
  const pics = P.filter(p => !p.logo); const logos = P.filter(p => p.logo);
  // 1. near-duplicates: the stronger copy stays (the owner's first, then the larger, the croppable, the clean)
  const strength = p => (p.owner ? 10 : 0) + (p.id === c.mainAsset ? 20 : 0) + p.scores.resolution * 2 + (p.scores.crop || 0) + (p.scores.clean || 0) * 0.3 + p.roles.hero;
  const live = [];
  pics.slice().sort((a, b) => strength(b) - strength(a)).forEach(p => { const twin = live.map(q => [q, same(p, q)]).find(x => x[1]); if (twin && !(p.owner && twin[0].owner && p.id === c.mainAsset)) reject(p, `near-duplicate: ${twin[1]} as ${twin[0].id}`); else live.push(p); });
  // 2. the floor for pictures the owner did not supply: never a watermark, a marketplace listing, a page of text, a
  //    thumbnail, a picture of something else -- and generic stock only when nothing better exists
  const strong = live.filter(p => (p.owner || p.identity === 'exact') && !p.flags.watermark && !p.flags.marketplace);
  live.slice().forEach(p => {
    if (p.owner) return;
    const why = p.flags.watermark ? 'watermarked' : p.flags.marketplace ? 'a marketplace listing, not photography' : p.flags.text ? 'text or a screenshot over the picture'
      : p.identity === 'other' ? 'does not show the subject' : p.short < 350 ? `too small (${p.short}px on its short side)` : p.flags.lowQuality && p.identity !== 'exact' ? 'low quality'
      : p.flags.stock && (strong.length || p.identity !== 'exact') ? 'generic stock' : p.clash && strong.length ? `another product, not this one (${p.clash})` : null;
    if (why) { reject(p, why); live.splice(live.indexOf(p), 1); }
  });
  // 3. the hero: the owner's main picture always (weak or not -- staged around); else the strongest able to open the page
  const choice = c.choice || {}; const okId = id => live.some(p => p.id === id);
  const ownerMain = c.mainAsset && by.get(c.mainAsset) && !by.get(c.mainAsset).logo ? c.mainAsset : (originals.find(a => a.ownerRole === 'main' && by.get(a.id) && !by.get(a.id).logo) || {}).id || null;
  // (the owner's own pictures outrank found ones for every role they can carry at all -- found pictures fill the rest)
  const rank = role => live.slice().sort((a, b) => (b.roles[role] + (b.owner && b.roles[role] >= 0.3 ? 0.5 : 0)) - (a.roles[role] + (a.owner && a.roles[role] >= 0.3 ? 0.5 : 0)));
  let hero = ownerMain && okId(ownerMain) ? ownerMain : null; const heroRank = rank('hero');
  if (!hero && choice.hero && okId(choice.hero) && by.get(choice.hero).roles.hero >= 0.3) hero = choice.hero;
  // (no change where the existing choice is already right: the pool's own pick -- an upload, the subject, a picture that
  // can be cut out for an actor -- leads unless it fell below the floor, is weak, or another picture is clearly stronger)
  const legacy = live.slice().sort((a, b) => legacyScore(b) - legacyScore(a))[0];
  if (!hero && legacy && legacy.roles.hero >= 0.45 && !(heroRank[0] && heroRank[0].roles.hero - legacy.roles.hero >= 0.2)) hero = legacy.id;
  if (!hero && heroRank[0] && heroRank[0].roles.hero >= 0.3) hero = heroRank[0].id;
  const hp = hero && by.get(hero); if (hp && ownerMain === hero && (hp.roles.hero < 0.55 || hp.short < 700 || hp.flags.cropped || hp.flags.dark)) notes.push(`the owner's main picture is weak for an opening (${weakness(by.get(hero))}): it leads, staged around its strength`);
  // 4. the actor, the detail, the 3D and cinematic sources (each among what can carry it; a model's choice when valid)
  const best = (role, min, excl) => { const want = choice[role === 'model3d' ? 'model3d' : role] ; if (want && okId(want) && by.get(want).roles[role] >= min) return want; const r = rank(role).filter(p => !(excl || []).includes(p.id))[0]; return r && r.roles[role] >= min ? r.id : null; };
  // (an actor floats over the page as a cut-out: only a picture that can be isolated -- the hero's own first)
  const isolated = id => by.get(id).scores.isolation >= 0.8;
  const actor = (() => { const h = hero && by.get(hero); if (h && isolated(hero) && h.roles.actor >= 0.45) return hero; const id = best('actor', 0.5); return id && isolated(id) ? id : null; })();
  const detail = best('detail', 0.45, [hero]);
  // (the 3D and cinematic sources keep today's choice -- the first picture, in the pool's own order, the gate allows -- unless
  // another is clearly stronger: a hand over the object, an edge-to-edge crop or a busy frame loses to a clean subject)
  const order = id => originals.findIndex(a => a.id === id);
  const today = role => live.filter(p => p.roles[role] > 0).sort((a, b) => (b.id === ownerMain) - (a.id === ownerMain) || legacyScore(b) - legacyScore(a) || order(a.id) - order(b.id))[0] || null;
  const keepToday = (role, pick) => { const t = today(role); if (!pick) return t ? t.id : null; if (!t || t.id === pick) return pick; if (choice[role] === pick) return pick; return by.get(pick).roles[role] - t.roles[role] >= 0.15 ? pick : t.roles[role] >= 0.35 ? t.id : pick; };
  const model3d = keepToday('model3d', best('model3d', 0.35)); const cinematic = keepToday('cinematic', best('cinematic', 0.35));
  // 5. the set: the smallest strong one -- every owner picture, then found pictures by what they add (support, detail,
  //    a picture a scene can bleed), never more than the page can show, never one that clashes with the set's light
  const keep = new Set([hero, actor, detail, model3d, cinematic].filter(Boolean)); live.filter(p => p.owner).forEach(p => keep.add(p.id));
  const maxFound = c.maxFound == null ? 6 : c.maxFound; const found = () => [...keep].filter(id => !by.get(id).owner).length;
  const temp = hero ? by.get(hero).warm : 0;
  rank('support').concat(rank('bleed')).forEach(p => {
    if (keep.has(p.id) || found() >= maxFound) return;
    if (p.roles.support < 0.25 && p.roles.bleed < 0.3) return;
    // (a picture whose light fights the hero's -- cold blue against warm amber -- does not join unless it is the subject)
    if (hero && Math.abs(p.warm - temp) > 110 && Math.sign(p.warm) !== Math.sign(temp) && p.role !== 'subject' && keep.size >= 3) { reject(p, 'its light and colour clash with the rest of the set'); return; }
    keep.add(p.id);
  });
  live.forEach(p => { if (!keep.has(p.id) && !rejected.some(x => x.id === p.id)) reject(p, 'not needed: the set already covers its role'); });
  const set = [...keep].filter(Boolean);
  // 6. scarcity: one strong picture carries the page with type, colour and one callback -- not repetition
  const strongN = set.filter(id => by.get(id).roles.hero >= 0.45 || by.get(id).roles.bleed >= 0.5).length; const scarce = strongN <= 1;
  if (scarce) notes.push(set.length ? 'one strong picture: type, colour and a single callback carry the rest' : 'no picture clears the floor: the page is carried by type and colour');
  // 7. confidence: is a second opinion (one cheap look at the shortlist) worth having?
  const uncertain = [];
  if (!ownerMain && heroRank.length >= 2 && heroRank[0].roles.hero - heroRank[1].roles.hero < 0.06 && heroRank[1].roles.hero >= 0.3) uncertain.push('hero');
  if (!live.some(p => p.owner || p.identity === 'exact') && live.length >= 2) uncertain.push('identity');
  logos.forEach(p => notes.push(`${p.id} is the logo: navigation and brand, never a scene picture`));
  const cutFor = id => (all.find(x => x.cutoutOf === id && x.caps && x.caps.moveFreely) || {}).id || null;
  // (what the existing ranking would have opened with, when the decision differs from it: the record of a real change)
  const replaced = legacy && hero && legacy.id !== hero && !ownerMain ? legacy.id : null;
  const decision = { v: VERSION, source: c.choice ? 'rules+ai' : 'rules', hero, replaced, actor: actor ? (cutFor(actor) || actor) : null, detail, model3d, cinematic, set, rejected, scarce, notes: notes.slice(0, 8), uncertain,
    shortlist: heroRank.slice(0, 6).map(p => p.id) };
  return Object.assign(decision, { profiles: P });
}
// the pool's own ranking (pool.js build): the owner's pictures, then the subject, a big one, one with a cut-out
function legacyScore(p) { return (p.owner ? 4 : 0) + (p.role === 'subject' ? 3 : p.role === 'detail' ? 1 : 0) + (p.short >= 700 ? 1 : 0) - (p.flags.cropped ? 0.5 : 0) - (p.short < 300 ? 6 : 0) + (p.scores.isolation >= 1 ? 0.5 : 0); }
function weakness(p) { return p.short < 700 ? 'low resolution' : p.flags.cropped ? 'tightly cropped' : (p.scores.dominance != null && p.scores.dominance < 0.05) ? 'a small subject' : p.flags.dark ? 'dark' : p.flags.busy ? 'busy' : 'little room to crop'; }

// a model's choice (one optional call over the shortlist), validated: known ids, on the shortlist, never a rejected,
// unlicensed or logo picture, never a role the picture cannot carry -- else ignored (the rules' decision stands)
function validChoice(raw, decision) {
  if (!raw || typeof raw !== 'object' || !decision) return null; const P = new Map((decision.profiles || []).map(p => [p.id, p]));
  const short = new Set(decision.shortlist || []); const bad = new Set((decision.rejected || []).map(x => x.id)); const out = {};
  ['hero', 'actor', 'detail', 'model3d', 'cinematic'].forEach(k => { const id = raw[k]; const p = typeof id === 'string' && P.get(id); if (p && short.has(id) && !bad.has(id) && !p.logo && p.roles[k] > 0) out[k] = id; });
  out.reject = (Array.isArray(raw.reject) ? raw.reject : []).filter(id => typeof id === 'string' && P.has(id) && !P.get(id).owner && short.has(id)).slice(0, 6);
  return Object.keys(out).some(k => k !== 'reject' && out[k]) || out.reject.length ? out : null;
}

// ---------------------------------------------------------------- the stored record (the only door)
const ID = /^[\w-]{1,40}$/;
function normalise(raw) {
  if (!raw || typeof raw !== 'object') return null; const id = x => (typeof x === 'string' && ID.test(x) ? x : null);
  return {
    v: Number.isInteger(raw.v) && raw.v >= 1 && raw.v <= VERSION ? raw.v : VERSION, source: ['rules', 'rules+ai'].includes(raw.source) ? raw.source : 'rules',
    hero: id(raw.hero), replaced: id(raw.replaced), actor: id(raw.actor), detail: id(raw.detail), model3d: id(raw.model3d), cinematic: id(raw.cinematic),
    set: (Array.isArray(raw.set) ? raw.set : []).map(id).filter(Boolean).slice(0, 24),
    rejected: (Array.isArray(raw.rejected) ? raw.rejected : []).filter(x => x && id(x.id)).slice(0, 40).map(x => ({ id: x.id, reason: String(x.reason || '').replace(/[\u0000-\u001f<>]/g, '').slice(0, 120) })),
    scarce: raw.scarce === true,
  };
}

module.exports = { VERSION, ROLES, profile, same, hamming, mirror, conflicts, decide, validChoice, normalise, hostOf, fileOf };
