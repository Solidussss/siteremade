'use strict';
// HERO STORYBOARD -- a motion-designed hero built from SEVERAL separately
// generated images.
//
// Every generated site gets a storyboard: a visual concept for THIS business
// and 3-4 image layers, each a different subject (the lead image -- the
// product, the finished job, the room -- plus a close detail and a context
// or lifestyle shot), each generated as its own image through the normal
// image pipeline (slots 'hero', 'hero-2', 'hero-3', 'hero-4'), each with its
// own placement, depth and motion track. The layers move independently but on
// one shared loop, so the whole hero repeats cleanly: a short, choreographed
// motion sequence, not a pile of effects. Nothing here is video -- it is CSS
// motion over separate generated stills.
//
// Where a storyboard comes from:
//   * the existing Claude planning call returns `heroStoryboard` (server.js
//     plan schema); validatePlanned() checks it against THIS business
//     (industry vocabulary, offerings, distinct subjects, complete layers) and
//     rejects anything off-industry or incomplete;
//   * otherwise fallbackStoryboard() art-directs one from a per-category
//     concept library (with sub-types: a drink brand is not a skincare brand,
//     a cafe is not a coffee roaster), picked and varied deterministically
//     from the business's own words so same-category businesses differ.
// Pure (no I/O, no randomness); shared by the live preview (premium-core.js
// bundle), the export (lib/site-render.js), the save validator
// (lib/project-store.js) and the tests. Independent of PREMIUM_GENERATION_V1.
//
// Every layer also names WHAT it shows as an art spec: ./visual-subjects picks
// the subject from the owner's own words (the flavours, the product types and
// their real containers, the services listed), and when no paid image exists
// for a layer -- generation off or unfunded, failed, or still in flight -- the
// renderer draws that illustration (./hero-art-kinds) instead of dropping the
// layer. A software lead is always a drawn interface with readable labels.
const VS = require('./visual-subjects');
const ARTK = require('./hero-art-kinds');

// ---- vocabulary ----------------------------------------------------------------------------------------------
// Placement rectangles are [x, y, w, h] in % of the hero's image stage; `m` is
// the phone layout. Each composition says where the copy lives (copy-safe
// space the images never cover) and the default frame shape per anchor.
const COMPOSITIONS = {
  // product brands: the product big and central, two satellites
  'hero-stage': { copy: 'left', anchors: {
    lead: { d: [18, 5, 56, 90], m: [18, 2, 64, 70], shape: 'soft' },
    a: { d: [0, 7, 30, 38], m: [0, 50, 40, 34], shape: 'rounded' },
    b: { d: [64, 52, 36, 44], m: [58, 60, 42, 36], shape: 'circle' },
    c: { d: [70, 2, 28, 30], m: [64, 0, 36, 26], shape: 'rounded' } } },
  // outdoor / property / community: the finished result full-bleed, framed insets
  panorama: { copy: 'bottom-left', anchors: {
    lead: { d: [0, 0, 100, 100], m: [0, 0, 100, 100], shape: 'full' },
    a: { d: [60, 9, 22, 34], m: [46, 5, 48, 26], shape: 'frame' },
    b: { d: [77, 40, 20, 32], m: [62, 25, 34, 22], shape: 'frame' },
    c: { d: [58, 58, 17, 25], m: [8, 5, 34, 20], shape: 'frame' } } },
  // venues: the room tall, a detail and a moment overlapping it
  'venue-stack': { copy: 'left', anchors: {
    lead: { d: [30, 0, 68, 100], m: [22, 0, 78, 76], shape: 'soft' },
    a: { d: [0, 50, 42, 46], m: [0, 54, 52, 42], shape: 'frame' },
    b: { d: [4, 3, 32, 38], m: [0, 3, 38, 30], shape: 'rounded' },
    c: { d: [80, 68, 20, 28], m: [70, 70, 30, 26], shape: 'circle' } } },
  // fashion / creative / fitness: tall columns drifting against each other
  columns: { copy: 'left', anchors: {
    lead: { d: [35, 0, 31, 100], m: [35, 0, 31, 100], shape: 'rounded' },
    a: { d: [1, 12, 31, 78], m: [1, 12, 31, 78], shape: 'rounded' },
    b: { d: [69, 6, 31, 82], m: [69, 6, 31, 82], shape: 'rounded' },
    c: { d: [8, 76, 20, 22], m: [8, 76, 22, 22], shape: 'circle' } } },
  // care / appointments: an arch, a round detail, a quiet card
  'arch-cluster': { copy: 'left', anchors: {
    lead: { d: [22, 0, 50, 100], m: [20, 0, 60, 86], shape: 'arch' },
    a: { d: [0, 56, 34, 42], m: [0, 60, 38, 38], shape: 'circle' },
    b: { d: [66, 6, 34, 42], m: [62, 4, 38, 34], shape: 'rounded' },
    c: { d: [70, 60, 28, 34], m: [64, 62, 36, 30], shape: 'rounded' } } },
  // software: the product in a device frame, its world floating around it
  'device-float': { copy: 'top', anchors: {
    lead: { d: [17, 8, 66, 86], m: [4, 12, 92, 66], shape: 'device' },
    a: { d: [0, 22, 25, 46], m: [0, 60, 44, 36], shape: 'rounded' },
    b: { d: [76, 4, 24, 42], m: [56, 0, 44, 32], shape: 'rounded' },
    c: { d: [78, 58, 22, 36], m: [58, 66, 42, 32], shape: 'rounded' } } },
  // packaged goods / food: the lead centred, details orbiting it
  orbit: { copy: 'right', anchors: {
    lead: { d: [20, 8, 58, 84], m: [18, 6, 64, 76], shape: 'soft' },
    a: { d: [0, 2, 30, 36], m: [0, 0, 36, 32], shape: 'circle' },
    b: { d: [68, 58, 32, 38], m: [64, 62, 36, 32], shape: 'circle' },
    c: { d: [72, 2, 26, 30], m: [66, 0, 34, 26], shape: 'rounded' } } },
  // restaurants / vehicles / classes: a wide lead with a sliding strip below
  filmstrip: { copy: 'left', anchors: {
    lead: { d: [0, 0, 100, 60], m: [0, 0, 100, 58], shape: 'soft' },
    a: { d: [0, 64, 48, 36], m: [0, 62, 48, 36], shape: 'rounded' },
    b: { d: [52, 64, 48, 36], m: [52, 62, 48, 36], shape: 'rounded' },
    c: { d: [70, 4, 26, 30], m: [64, 4, 34, 24], shape: 'circle' } } },
  // professional / property: a lead with frames cascading down its side
  diagonal: { copy: 'left', anchors: {
    lead: { d: [30, 0, 70, 70], m: [18, 0, 82, 60], shape: 'soft' },
    a: { d: [8, 50, 42, 46], m: [0, 56, 54, 40], shape: 'frame' },
    b: { d: [0, 6, 26, 36], m: [62, 64, 38, 32], shape: 'rounded' },
    c: { d: [74, 72, 26, 28], m: [64, 30, 34, 24], shape: 'circle' } } },
  // moodboards / collections / lessons: cards spread like a hand of prints (`r`: a resting tilt, degrees)
  fan: { copy: 'right', anchors: {
    lead: { d: [27, 4, 46, 88], m: [25, 2, 50, 80], shape: 'rounded' },
    a: { d: [0, 14, 38, 70], m: [0, 12, 40, 64], shape: 'rounded', r: -7 },
    b: { d: [62, 14, 38, 70], m: [60, 12, 40, 64], shape: 'rounded', r: 7 },
    c: { d: [38, 70, 26, 28], m: [38, 72, 26, 26], shape: 'circle' } } },
  // before/after, the work and the result: two halves, a frame crossing the seam
  'split-duo': { copy: 'left', anchors: {
    lead: { d: [0, 0, 56, 100], m: [0, 0, 58, 80], shape: 'soft' },
    a: { d: [60, 0, 40, 58], m: [61, 0, 39, 48], shape: 'rounded' },
    b: { d: [42, 58, 42, 40], m: [34, 54, 52, 42], shape: 'frame', r: -3 },
    c: { d: [84, 66, 16, 26], m: [4, 76, 26, 20], shape: 'circle' } } },
};
const COMPOSITION_KEYS = Object.keys(COMPOSITIONS);
const ANCHORS = ['lead', 'a', 'b', 'c'];
const ROLES = ['lead', 'detail', 'context', 'accent'];
const ASPECTS = ['16:9', '4:3', '1:1', '4:5', '3:4'];
const SHAPES = ['soft', 'rounded', 'circle', 'arch', 'frame', 'full', 'device'];
const TONES = ['dark', 'light'];
const LIGHTS = ['sweep', 'glow', 'none'];
const REVEALS = ['wipe-left', 'wipe-right', 'wipe-up', 'iris', 'rise', 'scale'];
// Frame track: where the whole image card travels over one loop (it goes out
// to `to` and back, so the loop closes on its first frame). x/y in % of the
// card, s = scale, r = degrees. `amount` scales the travel.
const MOTION_PATHS = {
  'push-in': { f: [0, 0, 1, 0], t: [-2, -2, 1.1, 0] },
  'pull-out': { f: [0, 0, 1.1, 0], t: [0, 0, 1, 0] },
  'drift-left': { f: [6, 0, 1, 0], t: [-6, 0, 1, 0] },
  'drift-right': { f: [-6, 0, 1, 0], t: [6, 0, 1, 0] },
  rise: { f: [0, 7, 1, 0], t: [0, -7, 1, 0] },
  sink: { f: [0, -7, 1, 0], t: [0, 7, 1, 0] },
  orbit: { f: [-8, 5, 1, -4], t: [8, -5, 1, 4] },
  'orbit-reverse': { f: [8, -5, 1, 4], t: [-8, 5, 1, -4] },
  tilt: { f: [0, 3, 1, -5], t: [0, -3, 1.04, 5] },
  float: { f: [0, 5, 1, -2], t: [0, -5, 1.03, 2] },
  'slide-left': { f: [9, 0, 1, 0], t: [-9, 0, 1, 0] },
  'slide-right': { f: [-9, 0, 1, 0], t: [9, 0, 1, 0] },
  pulse: { f: [0, 0, 0.94, 0], t: [0, 0, 1.06, 0] },
  hold: { f: [0, 0, 1, 0], t: [0, 0, 1.03, 0] },
};
const MOTION_KEYS = Object.keys(MOTION_PATHS);
const AMOUNTS = { subtle: 0.6, medium: 1, bold: 1.5 };
// Content track: the picture moving INSIDE its frame (a pan across the scene, a
// slow zoom). The media box is oversized by 10% so it never shows an edge.
const PANS = {
  none: { f: [0, 0, 1], t: [0, 0, 1] },
  'pan-left': { f: [4, 0, 1.06], t: [-4, 0, 1.06] },
  'pan-right': { f: [-4, 0, 1.06], t: [4, 0, 1.06] },
  'pan-up': { f: [0, 4, 1.06], t: [0, -4, 1.06] },
  'zoom-in': { f: [0, 0, 1], t: [0, 0, 1.14] },
  'zoom-out': { f: [0, 0, 1.14], t: [0, 0, 1] },
};
const PAN_KEYS = Object.keys(PANS);
const COPY_SIDES = ['left', 'right', 'bottom-left', 'top'];

// ---- industry vocabulary (validation) -----------------------------------------------------------------------
// A layer is on-industry when its subject/prompt names something this kind of
// business actually shows. Business-specific words (name, offerings, the
// owner's own description) always count too.
const CUES = {
  retail: 'product,products,bottle,can,cans,jar,package,packaging,box,bag,label,ingredient,ingredients,flavour,flavor,texture,shelf,unboxing,formula,serum,cream,drink,snack,sauce,candle,ceramic,range,still-life,splash,fruit,skincare,dropper,swatch,chili,spice,wax,pour,glass,pet,collar,treat,jewellery,jewelry,ring',
  fashion: 'garment,garments,fabric,textile,weave,stitch,stitching,seam,denim,knit,jacket,dress,shirt,coat,sneaker,sneakers,shoe,shoes,model,silhouette,runway,lookbook,rail,hanger,fitting,atelier,collection,tailoring,veil,gown,bridal,accessory,accessories,jewellery,jewelry,ring',
  hospitality: 'cafe,café,coffee,espresso,latte,barista,pour-over,roast,roaster,roastery,beans,cup,mug,pastry,pastries,croissant,bread,bakery,oven,dough,flour,plate,dish,chef,kitchen,menu,table,dining,restaurant,bar,cocktail,counter,wine,glass,room,terrace,bistro,brunch,steam,taproom,inn,hotel,lobby,guest,cake,cakes,loaves,sourdough,pasta,pizza',
  creative: 'camera,lens,photograph,photographer,shoot,studio,print,prints,film,frame,lighting,moodboard,sketch,sketches,design,branding,swatch,swatches,typography,poster,edit,editing,set,storyboard,portfolio,artwork,canvas,easel,gallery,video',
  tech: 'software,app,screen,device,laptop,tablet,phone,interface,product,workflow,desk,team,keyboard,code,data,dashboard,calendar,booking,clinic,schedule,platform,tool,notification,reminder,api,developer,server,chip,cloud',
  finance: 'financial,finance,plan,planning,advisor,adviser,consultation,documents,paperwork,portfolio,retirement,savings,tax,accounts,accounting,bookkeeping,ledger,calculator,meeting,office,desk,notebook,pen,family,home,investment',
  fitness: 'gym,training,trainer,coach,coaching,workout,barbell,dumbbell,kettlebell,weights,chalk,boxing,gloves,bag,ring,mat,yoga,pilates,reformer,studio,class,athlete,run,runner,track,stretch,sweat,rowing,climbing',
  realestate: 'home,house,property,listing,exterior,interior,kitchen,living,room,street,neighbourhood,neighborhood,keys,porch,facade,façade,window,garden,condo,apartment,staging,open house,dusk,architecture',
  wellness: 'treatment,therapy,therapist,physio,physiotherapist,clinic,patient,massage,spa,stones,oil,oils,towel,towels,stretch,knee,shoulder,spine,rehab,recovery,needle,needling,acupuncture,calm,room,salon,stylist,hair,skin,facial,dental,dentist,chiropractor,wellness,care,hands,band,exercise',
  nonprofit: 'community,volunteer,volunteers,people,hands,neighbourhood,neighborhood,garden,food,bank,shelter,cleanup,river,shore,park,children,school,donation,donations,crates,crate,produce,seedlings,soil,table,meal,planting,tools,event,meeting',
  professional: 'consultation,meeting,office,desk,documents,paperwork,contract,law,legal,lawyer,counsel,advisor,consultant,strategy,whiteboard,workshop,notebook,pen,conference,table,city,window,client,files,library,books',
  education: 'tutor,tutoring,student,students,learning,classroom,class,lesson,books,notebook,desk,teacher,whiteboard,study,library,school,course,workshop,materials,pencil,chalkboard,lab,science',
  electrical: 'electrical,electrician,wiring,wire,wires,panel,breaker,lighting,light,lights,fixture,fixtures,switch,outlet,cable,conduit,pendant,lamp,interior,home,kitchen,ev charger,install',
  plumbing: 'plumbing,plumber,pipe,pipes,pipework,faucet,tap,sink,basin,shower,bathroom,kitchen,fixture,fixtures,drain,valve,water,heater,boiler,tile,wrench,copper,chrome',
  landscaping: 'yard,garden,gardens,patio,lawn,planting,plants,stone,flagstone,paver,pavers,hardscape,landscape,shrubs,beds,pathway,path,crew,soil,mulch,hedge,trees,terrace,backyard,grass,mower,edging,irrigation,retaining,wall,outdoor',
  painting: 'paint,painted,painter,painting,wall,walls,trim,brush,roller,colour,color,swatch,swatches,ladder,room,ceiling,exterior,interior,finish,drop cloth,tape,cabinet',
  roofing: 'roof,roofing,roofer,shingle,shingles,roofline,gutter,gutters,flashing,chimney,house,home,ridge,eaves,metal,tile,slate,skylight,ladder,harness',
  automotive: 'car,cars,vehicle,vehicles,paint,polish,polisher,detailing,detail,wheel,wheels,tyre,tire,headlight,interior,leather,engine,garage,bay,lift,mechanic,wrench,tools,foam,wash,hood,dashboard,steering',
  cleaning: 'clean,cleaning,cleaner,spotless,counter,countertop,kitchen,living,room,floor,window,windows,bathroom,microfiber,cloth,spray,vacuum,mop,office,sofa,bedroom,sparkling,surface,home,caddy,rubber gloves',
  renovation: 'renovation,renovated,kitchen,bathroom,tile,tiles,cabinet,cabinetry,joinery,framing,drywall,timber,wood,flooring,countertop,basement,contractor,build,builder,tools,saw,interior,home,room,beam',
  other: '',
};
const CUE_SETS = Object.fromEntries(Object.keys(CUES).map(k => [k, new Set(CUES[k].split(',').map(w => w.trim()).filter(Boolean))]));
// Words that mark a subject as belonging to a DIFFERENT kind of business
// entirely. One of these without any of the business's own cues = off-industry.
const OFF_INDUSTRY = {
  default: ['dashboard', 'spreadsheet', 'stock chart', 'server rack', 'code on screen', 'laptop screen', 'app interface', 'office cubicle', 'corporate handshake'],
  tech: ['plate of food', 'garden bed', 'lawn mower', 'roof shingles', 'massage table'],
  finance: ['lawn mower', 'plate of food', 'massage table'],
};

// ---- helpers --------------------------------------------------------------------------------------------------
function clip(s, n) { const t = String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); return t.length > n ? t.slice(0, n - 1).replace(/\s+\S*$/, '') : t; }
function hashStr(s) { let h = 2166136261; const t = String(s || ''); for (let i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function plain(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''); }
function words(s) { return plain(s).replace(/[^a-z0-9\s-]/g, ' ').split(/\s+/).filter(w => w.length > 2); }
function tokenSet(s) { return new Set(words(s).filter(w => !STOP.has(w))); }
const STOP = new Set('the,and,with,for,from,into,onto,that,this,its,their,your,our,one,two,three,frame,close,closeup,close-up,shot,photograph,photo,image,hero,light,lighting,soft,natural,warm,background,composition,shallow,depth,field,detail,focus,sharp,space,room,edges,moving,slow,camera,no,text,logos,watermarks,identifiable,faces,style,premium,editorial,cinematic,beautiful,real,quiet,clean,simple'.split(','));
function similarity(a, b) {
  const A = tokenSet(a), B = tokenSet(b);
  if (!A.size || !B.size) return 0;
  let inter = 0; A.forEach(w => { if (B.has(w)) inter++; });
  return inter / Math.min(A.size, B.size);
}
const num = (v, lo, hi, d) => { const n = Number(v); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : d; };
const pick = (v, list, d) => (list.includes(v) ? v : d);
const possessive = n => (/s$/i.test(n) ? `${n}'` : `${n}'s`);

function businessTokens(ctx) {
  const c = ctx || {};
  return new Set([...words(c.name), ...(c.offerings || []).flatMap(o => words(o)), ...words(c.noun), ...words(c.text).filter(w => w.length > 4)].filter(w => !STOP.has(w)));
}
// on-industry check for one layer's text: own cues (category vocabulary or the
// business's own words) must appear, and a different industry's signature
// subject must not dominate.
function relevance(text, ctx) {
  const c = ctx || {};
  const lower = plain(text);
  const toks = new Set(words(lower));
  const cueSet = CUE_SETS[c.categoryKey] || new Set();
  const hasCue = w => (w.includes(' ') ? lower.includes(w) : toks.has(w) || toks.has(w + 's'));
  const ownCues = [...cueSet].filter(hasCue);
  // the owner's own words count in either number ('charters' -> 'a charter boat')
  const bizHits = [...businessTokens(c)].filter(w => toks.has(w) || toks.has(w + 's') || (w.length > 4 && w.endsWith('s') && toks.has(w.slice(0, -1))));
  const off = (OFF_INDUSTRY[c.categoryKey] || []).concat(c.categoryKey === 'tech' ? [] : OFF_INDUSTRY.default).filter(w => lower.includes(w));
  return { ok: (ownCues.length + bizHits.length) > 0 && off.length === 0, ownCues, bizHits, off };
}

// ---- layer resolution (placement + keyframes) ---------------------------------------------------------------
function placementFor(composition, anchor) {
  const comp = COMPOSITIONS[composition] || COMPOSITIONS['hero-stage'];
  return comp.anchors[anchor] || comp.anchors.a;
}
function trackFor(path, amount) {
  const p = MOTION_PATHS[path] || MOTION_PATHS.hold;
  const k = AMOUNTS[amount] || 1;
  const sc = s => Math.round((1 + (s - 1) * k) * 1000) / 1000;
  const r2 = v => Math.round(v * k * 100) / 100;
  return { from: { x: r2(p.f[0]), y: r2(p.f[1]), s: sc(p.f[2]), r: r2(p.f[3]) }, to: { x: r2(p.t[0]), y: r2(p.t[1]), s: sc(p.t[2]), r: r2(p.t[3]) } };
}
// Everything the renderer (and the tests) need for one layer: placement on
// desktop and phone, depth, the frame track, the content track and timing.
function resolveLayers(sb) {
  const loop = num(sb && sb.loop, 8, 18, 12);
  return ((sb && sb.layers) || []).map((l, i) => {
    const place = placementFor(sb.composition, l.anchor);
    const track = trackFor(l.motion && l.motion.path, l.motion && l.motion.amount);
    if (place.r) { track.from.r = Math.round((track.from.r + place.r) * 100) / 100; track.to.r = Math.round((track.to.r + place.r) * 100) / 100; }
    const pan = PANS[l.pan] || PANS.none;
    const offset = num(l.motion && l.motion.offset, 0, 1, 0);
    return {
      slot: l.slot, role: l.role, anchor: l.anchor, subject: l.subject, shape: l.shape || place.shape,
      desktop: place.d, mobile: place.m, depth: l.depth, z: l.depth * 10 + i,
      track, pan: { from: pan.f, to: pan.t }, loop, delay: -Math.round(offset * loop * 100) / 100,
      reveal: l.reveal, revealDelay: Math.round((0.15 + i * 0.28) * 100) / 100,
    };
  });
}

// ---- stored shape (save validator) -------------------------------------------------------------------------
// Structure-only sanitizer for a storyboard read back from storage or the
// client: enums checked, numbers clamped, strings clipped, layers de-duplicated.
// Returns null when fewer than 3 usable layers remain (the renderer then uses
// its classic/statement fallback).
const FOCAL_RE = /^\d{1,3}% \d{1,3}%$/;
const HEX_RE = /^#[0-9a-f]{6}$/i;
// an art spec from storage or the planner: a known kind and a few short, typed params
function sanitizeArt(a) {
  if (!a || typeof a !== 'object' || !ARTK.KINDS[a.kind]) return null;
  const pr = a.params && typeof a.params === 'object' ? a.params : {};
  const out = {};
  ['label', 'sub', 'variant', 'ui', 'audience', 'container', 'side'].forEach(k => { if (typeof pr[k] === 'string' && pr[k].trim()) out[k] = clip(pr[k], 40); });
  if (typeof pr.colour === 'string' && HEX_RE.test(pr.colour)) out.colour = pr.colour;
  ['flavours', 'variants', 'items'].forEach(k => { if (Array.isArray(pr[k])) { const arr = pr[k].filter(x => typeof x === 'string' && x.trim()).slice(0, 6).map(x => clip(x, 32)); if (arr.length) out[k] = arr; } });
  ['reminders', 'glass', 'range'].forEach(k => { if (typeof pr[k] === 'boolean') out[k] = pr[k]; });
  return { kind: a.kind, params: out };
}
function sanitizeStored(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const composition = pick(raw.composition, COMPOSITION_KEYS, null);
  if (!composition) return null;
  const seenSlots = new Set(), seenAnchors = new Set();
  const layers = (Array.isArray(raw.layers) ? raw.layers : []).slice(0, 4).map(l => {
    if (!l || typeof l !== 'object') return null;
    const slot = /^hero(-[2-4])?$/.test(l.slot) ? l.slot : null;
    const anchor = pick(l.anchor, ANCHORS, null);
    if (!slot || !anchor || seenSlots.has(slot) || seenAnchors.has(anchor)) return null;
    seenSlots.add(slot); seenAnchors.add(anchor);
    const m = l.motion && typeof l.motion === 'object' ? l.motion : {};
    return {
      slot, role: pick(l.role, ROLES, 'context'), anchor,
      subject: clip(l.subject, 120), prompt: clip(l.prompt, 900), aspect: pick(l.aspect, ASPECTS, '1:1'),
      shape: pick(l.shape, SHAPES, placementFor(composition, anchor).shape), depth: Math.round(num(l.depth, 1, 5, 2)),
      motion: { path: pick(m.path, MOTION_KEYS, 'hold'), amount: pick(m.amount, Object.keys(AMOUNTS), 'medium'), offset: num(m.offset, 0, 1, 0) },
      pan: pick(l.pan, PAN_KEYS, 'none'), reveal: pick(l.reveal, REVEALS, 'rise'),
      art: sanitizeArt(l.art), render: l.render === 'art' ? 'art' : 'image', focal: FOCAL_RE.test(l.focal || '') ? l.focal : null,
    };
  }).filter(Boolean);
  if (layers.length < 3 || !layers.some(l => l.slot === 'hero' && l.anchor === 'lead')) return null;
  return {
    v: 2, source: raw.source === 'planner' ? 'planner' : 'fallback', fallbackReason: raw.fallbackReason ? clip(raw.fallbackReason, 160) : null,
    conceptId: clip(raw.conceptId, 60) || null, concept: clip(raw.concept, 160), composition,
    copySafe: pick(raw.copySafe, COPY_SIDES, COMPOSITIONS[composition].copy), tone: pick(raw.tone, TONES, 'dark'),
    light: pick(raw.light, LIGHTS, 'sweep'), loop: num(raw.loop, 8, 18, 12),
    baseHero: typeof raw.baseHero === 'string' ? clip(raw.baseHero, 40) : null,
    treatment: raw.treatment === 'illustration' ? 'illustration' : 'photo', look: raw.look ? clip(raw.look, 240) : null, layers,
  };
}

// ---- prompts ---------------------------------------------------------------------------------------------------
const ROLE_FRAMING = {
  lead: a => `Hero image in a ${a} frame, the subject filling most of the frame with a little breathing room at every edge for slow camera movement`,
  detail: a => `Tight ${a} close-up, the detail filling the frame, shallow depth of field, simple background`,
  context: a => `${a} environmental frame, candid and natural, the setting clearly readable`,
  accent: a => `${a} graphic still-life on a simple background`,
};
const TAIL = 'No text, lettering, logos or watermarks. No identifiable faces.';
// the picture has to survive the layer's own camera move
const PAN_FRAMING = {
  'pan-left': 'the scene continuing past both side edges for a slow sideways pan', 'pan-right': 'the scene continuing past both side edges for a slow sideways pan',
  'pan-up': 'the scene continuing above and below the frame for a slow vertical pan', 'zoom-in': 'the subject centred with generous margin for a slow push-in', 'zoom-out': 'the subject centred with margin all round for a slow pull-back',
};
// o: { pan, look, treatment }
function finishPrompt(shot, role, aspect, o) {
  const k = o || {};
  const framing = (ROLE_FRAMING[role] || ROLE_FRAMING.context)(aspect) + (PAN_FRAMING[k.pan] ? `, ${PAN_FRAMING[k.pan]}` : '');
  const style = k.treatment === 'illustration' ? ' Render it as a detailed editorial illustration, not a photograph.' : '';
  const tail = `${framing}.${style}${k.look ? ` ${String(k.look).trim()}` : ''} ${TAIL}`;
  shot = String(shot || '').trim(); shot = shot.charAt(0).toUpperCase() + shot.slice(1);
  let out = `${clip(shot, 480).replace(/[.\s]+$/, '')}. ${tail}`;
  if (out.length > 900) out = `${clip(shot, 900 - tail.length - 4).replace(/[.\s]+$/, '')}. ${tail}`;
  return out;
}

// ---- the planner's storyboard -----------------------------------------------------------------------------------
// ctx: { categoryKey, name, offerings, text, noun, place, accent, archetype, hero }
function validatePlanned(raw, ctx) {
  const problems = [];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, problems: ['no storyboard'] };
  const composition = pick(raw.composition, COMPOSITION_KEYS, null);
  if (!composition) problems.push(`unknown composition "${raw.composition}"`);
  const rawLayers = Array.isArray(raw.layers) ? raw.layers : [];
  if (rawLayers.length < 3) problems.push(`needs at least 3 image layers, got ${rawLayers.length}`);
  const leads = rawLayers.filter(l => l && l.role === 'lead');
  if (leads.length !== 1) problems.push(`needs exactly one lead image, got ${leads.length}`);
  const layers = [];
  const seenAnchors = new Set();
  rawLayers.slice(0, 4).forEach((l, i) => {
    if (!l || typeof l !== 'object') { problems.push(`layer ${i + 1}: not an object`); return; }
    const role = pick(l.role, ROLES, null);
    const anchor = pick(l.anchor, ANCHORS, null);
    const subject = clip(l.subject, 120);
    const prompt = clip(l.prompt, 900);
    if (!role) problems.push(`layer ${i + 1}: unknown role`);
    if (!anchor || seenAnchors.has(anchor)) problems.push(`layer ${i + 1}: missing or repeated placement anchor`);
    if (role === 'lead' && anchor !== 'lead') problems.push(`layer ${i + 1}: the lead image must use the lead anchor`);
    if (subject.length < 6) problems.push(`layer ${i + 1}: missing subject`);
    if (prompt.length < 40) problems.push(`layer ${i + 1}: prompt too thin to generate a specific image`);
    const rel = relevance(`${subject}. ${prompt}`, ctx);
    if (!rel.ok) problems.push(`layer ${i + 1} is off-industry for ${ctx.categoryKey}: "${subject}"${rel.off.length ? ` (${rel.off.join(', ')})` : ''}`);
    if (anchor) seenAnchors.add(anchor);
    layers.push({ role, anchor, subject, prompt, raw: l });
  });
  for (let i = 0; i < layers.length; i++) for (let j = i + 1; j < layers.length; j++) {
    if (similarity(layers[i].prompt, layers[j].prompt) > 0.7 || layers[i].subject.toLowerCase() === layers[j].subject.toLowerCase()) {
      problems.push(`layers ${i + 1} and ${j + 1} describe the same picture -- every hero image must be a different subject`);
    }
  }
  const facts = VS.factsFor(ctx);
  if (!problems.length) VS.planProblems(layers, facts).forEach(pr => problems.push(pr));
  if (problems.length) return { ok: false, problems };
  const ordered = layers.slice().sort((a, b) => (a.role === 'lead' ? -1 : 0) - (b.role === 'lead' ? -1 : 0));
  const loop = num(raw.loopSeconds, 8, 18, 12);
  const treatment = raw.treatment === 'illustration' ? 'illustration' : 'photo';
  const look = raw.look ? clip(raw.look, 240) : VS.lookLine({ tone: raw.tone, treatment }, ctx.accent);
  // the fallback for this business gives each role a sensible illustration when the planner's words match nothing drawable
  const reference = fallbackStoryboard(ctx, 'reference');
  const software = ctx.categoryKey === 'tech';
  const ifc = raw.interface && typeof raw.interface === 'object' ? raw.interface : null;
  const storyboard = sanitizeStored({
    source: 'planner', conceptId: `planner:${composition}`, concept: raw.concept, composition, tone: raw.tone, light: raw.light,
    copySafe: COMPOSITIONS[composition].copy, loop, baseHero: ctx.hero,
    treatment, look,
    layers: ordered.map((l, i) => ({
      slot: i === 0 ? 'hero' : `hero-${i + 1}`, role: l.role, anchor: l.anchor, subject: l.subject,
      prompt: finishPrompt(l.prompt, l.role, pick(l.raw.aspectRatio, ASPECTS, i === 0 ? '4:5' : '1:1'), { pan: pick(l.raw.pan, PAN_KEYS, i === 0 ? 'zoom-in' : 'none'), look, treatment }),
      art: software && l.role === 'lead'
        ? interfaceArt(reference.layers[0].art, ifc)
        : VS.artForText(`${l.subject}. ${l.prompt}`, l.role, facts, ctx, reference.layers[Math.min(i, reference.layers.length - 1)].art),
      render: software && l.role === 'lead' ? 'art' : 'image',
      aspect: pick(l.raw.aspectRatio, ASPECTS, i === 0 ? '4:5' : '1:1'), shape: pick(l.raw.shape, SHAPES, null) || undefined,
      depth: num(l.raw.depth, 1, 5, i === 0 ? 2 : 3 + (i % 2)),
      motion: { path: pick(l.raw.motion, MOTION_KEYS, i === 0 ? 'push-in' : 'float'), amount: pick(l.raw.intensity, Object.keys(AMOUNTS), 'medium'), offset: num(l.raw.offset, 0, 1, i / ordered.length) },
      pan: pick(l.raw.pan, PAN_KEYS, i === 0 ? 'zoom-in' : 'none'), reveal: REVEALS[i % REVEALS.length],
    })),
  });
  if (storyboard) {
    const key = a => `${a && a.kind}|${(a && a.params && a.params.variant) || ''}`; const seen = new Set();
    storyboard.layers.forEach((l, i) => { if (l.art && seen.has(key(l.art))) { const alt = [reference.layers[Math.min(i, reference.layers.length - 1)].art].concat(reference.layers.map(r => r.art)).find(a => a && !seen.has(key(a)) && !storyboard.layers.some(o => o !== l && key(o.art) === key(a))); if (alt) l.art = alt; } if (l.art) seen.add(key(l.art)); });
  }
  return storyboard ? { ok: true, storyboard, problems: [] } : { ok: false, problems: ['storyboard did not survive sanitising'] };
}

// a software lead: the drawn interface, labelled from the planner's interface brief when it gives one
const UI_KINDS = require('./hero-art-ui').INTERFACE_KINDS;
function interfaceArt(base, ifc) {
  const a = sanitizeArt(base) || { kind: 'interface', params: { ui: 'analytics' } };
  if (a.kind !== 'interface') return a;
  if (ifc && UI_KINDS.includes(ifc.kind)) a.params.ui = ifc.kind;
  // UI labels: short words only -- no digits, no names of people or companies
  const items = ifc && Array.isArray(ifc.items) ? ifc.items.filter(x => typeof x === 'string' && x.trim() && !/\d/.test(x) && x.length <= 28).slice(0, 6) : [];
  if (items.length >= 2) a.params.items = items.map(x => clip(x, 28));
  return a;
}
// ---- the fallback concept library ------------------------------------------------------------------------------
// Placeholders: {name} {Name's} {noun} {offer} {offer2} {offer3} {offers} {flavour} {place} {inPlace} {accent}
// Each concept: category, optional sub-type matcher, composition, tone, light,
// concept line, and 3 layers (lead + two supporting), each its own subject,
// shot, aspect, motion path/amount, content pan.
const L = (role, anchor, aspect, motion, amount, pan, subject, shot, shape) => ({ role, anchor, aspect, motion, amount, pan, subject, shot, shape });
const CONCEPTS = [
  // ---- retail: drinks
  { id: 'drink-chill', cat: 'retail', match: /\b(drink|drinks|beverage|soda|juice|sparkling|energy|kombucha|seltzer|tonic|lemonade|cold brew)\b/i, composition: 'hero-stage', tone: 'dark', light: 'sweep',
    concept: '{name}: the ice-cold can up close, a burst of {flavour}, and the moment it gets opened', layers: [
      L('lead', 'lead', '4:5', 'push-in', 'bold', 'zoom-in', 'ice-cold {name} {container} close-up', 'A single ice-cold {container} of {name}{flavourOf} standing on wet dark stone, fine condensation beading on the surface, dramatic {accent} rim light'),
      L('detail', 'a', '1:1', 'orbit', 'medium', 'pan-left', '{flavourPhrase} splash', 'A frozen-motion splash of sparkling water around freshly cut {flavourPhrase}, droplets suspended mid-air, bright backlight on a {accent} backdrop'),
      L('context', 'b', '1:1', 'float', 'bold', 'none', 'a cold {container} opened outdoors', 'A hand opening a cold {container} of {name} on a sunlit rooftop{inPlace} at golden hour, a glass poured over ice beside it, skyline softly out of focus')] },
  { id: 'drink-range', cat: 'retail', match: /\b(drink|drinks|beverage|soda|juice|sparkling|energy|kombucha|seltzer|tonic|lemonade|cold brew)\b/i, composition: 'orbit', tone: 'dark', light: 'glow',
    concept: '{name}: the full range lined up, the fruit behind each flavour, and a can on ice', layers: [
      L('lead', 'lead', '4:5', 'pulse', 'medium', 'pan-up', 'the {name} range lined up', 'Three {name} {containers} in {flavourColourways} standing in a staggered row on a glossy {accent} surface, crisp reflections, commercial beverage photography'),
      L('detail', 'a', '1:1', 'orbit', 'bold', 'zoom-in', 'sliced {flavour} and {flavour2} fruit', 'Halved ripe {flavour} and fresh {flavour2} arranged on crushed ice, glistening juice, overhead macro'),
      L('context', 'b', '1:1', 'orbit-reverse', 'bold', 'none', 'a {container} buried in crushed ice', 'A single {name} {container} half-buried in crushed ice in a steel cooler, frost on the rim, cool blue light')] },
  // ---- retail: skincare / beauty
  { id: 'skincare-ritual', cat: 'retail', match: /\b(skincare|skin care|serum|serums|cleanser|cleansers|moisturi[sz]er|cosmetic|cosmetics|beauty|spf|toner|balm)\b/i, composition: 'hero-stage', tone: 'light', light: 'glow',
    concept: '{name}: the bottle on stone, the formula up close, and the daily ritual', layers: [
      L('lead', 'lead', '4:5', 'push-in', 'medium', 'zoom-in', 'the {skinProduct} {skinContainerShort} on stone', 'The {name} {skinProduct} in a {skinContainer} resting on pale travertine, soft morning window light, a single sprig of greenery, minimal skincare still-life'),
      L('detail', 'a', '1:1', 'float', 'medium', 'pan-right', '{skinProduct2} texture swatch', 'A macro swatch of the {name} {skinProduct2} texture smeared across glass, tiny bubbles, pearlescent highlight'),
      L('context', 'b', '1:1', 'drift-left', 'medium', 'none', 'hands applying at the sink', 'Two hands massaging {skinProduct2} into the back of a hand beside a white ceramic basin, the {skinList} on the shelf above, towels folded nearby, calm bathroom daylight')] },
  { id: 'skincare-botanic', cat: 'retail', match: /\b(skincare|skin care|serum|serums|cleanser|cleansers|moisturi[sz]er|cosmetic|cosmetics|beauty|spf|toner|balm|botanical|botanicals)\b/i, composition: 'columns', tone: 'light', light: 'glow',
    concept: '{name}: ingredient, formula and routine side by side, drifting like a lookbook', layers: [
      L('lead', 'lead', '3:4', 'rise', 'medium', 'zoom-in', 'the {skinList} with botanicals', '{skinWithContainers} from {name}, arranged with fresh botanicals and oat on linen, soft top light'),
      L('detail', 'a', '3:4', 'sink', 'medium', 'none', 'raw botanical ingredients', 'Raw botanical ingredients -- chamomile, aloe leaf and oat grains -- scattered on pale stone, close overhead'),
      L('context', 'b', '3:4', 'rise', 'medium', 'none', 'a shelf routine in morning light', 'A bathroom shelf with the {name} {skinList}, a folded towel and a small plant, morning sun through frosted glass')] },
  // ---- retail: packaged food
  { id: 'food-product', cat: 'retail', match: /\b(sauce|sauces|hot sauce|snack|snacks|chocolate|granola|jam|honey|spice|spices|chips|candy|cookies|preserves|condiment|pickles|coffee beans|tea blends)\b/i, composition: 'orbit', tone: 'dark', light: 'glow',
    concept: '{name}: the jar, what goes into it, and the dish it finishes', layers: [
      L('lead', 'lead', '4:5', 'hold', 'bold', 'zoom-in', 'the {pantryLabel} hero', 'A {pantryNoun} of {name} {pantryLabel} on a dark wooden board, rich colour catching a warm side light, a spoon resting beside it'),
      L('detail', 'a', '1:1', 'orbit', 'bold', 'pan-left', 'raw ingredients', 'The raw ingredients behind the {pantryLabel}: {ingredientList} tumbling across slate, dramatic macro light'),
      L('context', 'b', '1:1', 'orbit-reverse', 'bold', 'none', 'the finished dish', 'A finished dish being finished with a drizzle of the sauce, steam rising, dinner-table light')] },
  // ---- retail: home goods
  { id: 'home-goods', cat: 'retail', match: /\b(candle|candles|ceramic|ceramics|furniture|homeware|home goods|decor|linen|pottery|vase|lighting)\b/i, composition: 'fan', tone: 'light', light: 'glow',
    concept: '{name}: the piece in a lived-in room, its material up close, and the making', layers: [
      L('lead', 'lead', '4:5', 'push-in', 'medium', 'pan-right', '{noun} styled in a room', 'A {name} {noun} styled on a sunlit oak sideboard in a calm living room, linen curtains, soft afternoon light'),
      L('detail', 'a', '1:1', 'float', 'medium', 'zoom-in', '{offer} material close-up', 'A macro of the {offer}: wax, glaze, grain and a hand-finished edge catching raking light'),
      L('context', 'b', '4:3', 'drift-right', 'medium', 'none', 'hands making the {offer2}', 'Hands pouring and finishing {offer2} in a small workshop, tools and materials in warm light')] },
  // ---- retail: pets / generic retail
  { id: 'retail-general', cat: 'retail', composition: 'hero-stage', tone: 'dark', light: 'sweep',
    concept: '{name}: the product as the hero, the craft in the detail, and the product in real use', layers: [
      L('lead', 'lead', '4:5', 'push-in', 'bold', 'zoom-in', 'the {noun} as a hero product shot', 'The {name} {noun} as a single hero product on a {accent} seamless backdrop, crisp studio light and soft reflection'),
      L('detail', 'a', '1:1', 'orbit', 'medium', 'pan-left', 'material and craft detail', 'A macro detail of the product material, stitching and finish, raking light showing texture'),
      L('context', 'b', '1:1', 'float', 'bold', 'none', 'the product in everyday use', 'The product in everyday use{inPlace}, hands holding it, natural light, candid lifestyle photograph')] },
  // ---- fashion
  { id: 'fashion-street', cat: 'fashion', match: /\b(streetwear|apparel|clothing|denim|hoodie|sneakers?|menswear|womenswear|knitwear|label)\b/i, composition: 'columns', tone: 'dark', light: 'sweep',
    concept: '{name}: the look in motion, the fabric up close, and the collection on the rail', layers: [
      L('lead', 'lead', '3:4', 'rise', 'bold', 'pan-up', 'a model walking in the {garment}', 'A model walking toward camera in a {name} {garment}, face turned away, fabric moving, concrete street at dusk, editorial fashion photography'),
      L('detail', 'a', '3:4', 'sink', 'bold', 'zoom-in', 'fabric and stitching macro', 'A macro of heavy fabric, bold stitching and a woven edge, raking light across the weave'),
      L('context', 'b', '3:4', 'rise', 'bold', 'none', 'collection on a clothing rail', 'The collection hanging on a steel clothing rail in a raw concrete studio, garments swaying slightly')] },
  { id: 'fashion-atelier', cat: 'fashion', match: /\b(bridal|wedding dress|gown|couture|tailor|tailoring|bespoke|jewellery|jewelry|atelier|dress)\b/i, composition: 'arch-cluster', tone: 'light', light: 'glow',
    concept: '{name}: the garment in soft light, the hand-finished detail, and the fitting', layers: [
      L('lead', 'lead', '3:4', 'hold', 'medium', 'zoom-in', 'the {offer} in soft window light', 'A {name} {offer} on a dress form by a tall window, fabric catching soft light, atelier setting'),
      L('detail', 'a', '1:1', 'float', 'medium', 'none', 'lace and hand-stitching detail', 'A macro of hand-sewn lace, beading and a silk seam, pins resting on fabric'),
      L('context', 'b', '4:3', 'drift-left', 'medium', 'pan-right', 'a fitting in the atelier', 'A fitting in progress in the atelier, a seamstress pinning a hem, face out of frame, warm light')] },
  { id: 'fashion-general', cat: 'fashion', composition: 'fan', tone: 'light', light: 'sweep',
    concept: '{name}: silhouette, texture and the collection, moving like a lookbook', layers: [
      L('lead', 'lead', '3:4', 'rise', 'medium', 'pan-up', 'a garment silhouette in motion', 'A {name} garment worn in motion, face out of frame, strong silhouette against a plain studio wall, editorial fashion campaign'),
      L('detail', 'a', '3:4', 'sink', 'medium', 'zoom-in', 'fabric texture macro', 'A macro of the fabric weave and a clean seam, raking studio light'),
      L('context', 'b', '3:4', 'rise', 'medium', 'none', 'folded collection flat-lay', 'The collection folded and laid flat on a paper backdrop, accessories arranged beside it, overhead')] },
  // ---- hospitality: coffee roaster (a product business)
  { id: 'coffee-roaster', cat: 'hospitality', match: /\b(coffee beans|coffee brand|coffee roaster|roaster|roastery|roasting|single-origin|single origin|tea brand|tea blends|loose[- ]leaf)\b/i, composition: 'hero-stage', tone: 'dark', light: 'glow',
    concept: '{name}: the bag and the beans, the pour-over bloom, and the roaster at work', layers: [
      L('lead', 'lead', '4:5', 'push-in', 'medium', 'zoom-in', 'coffee bag with roasted beans', 'An unbranded kraft coffee bag spilling freshly roasted beans across a dark wooden counter, oils glinting in warm light'),
      L('detail', 'a', '1:1', 'float', 'medium', 'zoom-in', 'pour-over bloom close-up', 'Hot water spiralling into a ceramic pour-over, the coffee bed blooming, steam rising, macro'),
      L('context', 'b', '4:3', 'drift-left', 'medium', 'pan-left', 'the drum roaster in the roastery', 'A drum coffee roaster in a working roastery, beans cascading into the cooling tray, warm industrial light')] },
  // ---- hospitality: cafe
  { id: 'cafe-venue', cat: 'hospitality', match: /\b(cafe|café|coffee shop|espresso bar|coffee bar|brunch)\b/i, composition: 'venue-stack', tone: 'light', light: 'glow',
    concept: '{name}: the room in morning light, the cup on the counter, and the barista at work', layers: [
      L('lead', 'lead', '4:5', 'push-in', 'medium', 'pan-right', 'the café room in morning light', 'The interior of a neighbourhood café{inPlace} in morning light, a long wooden counter, plants and a few guests seen from behind'),
      L('detail', 'a', '1:1', 'float', 'medium', 'zoom-in', 'latte art and {offer2} on the counter', 'A flat white with latte art beside {offer2} on a marble counter, steam curling, macro'),
      L('context', 'b', '4:3', 'drift-right', 'medium', 'none', "barista's hands pulling a shot", "A barista's hands tamping and pulling an espresso shot at the machine, crema pouring, face out of frame")] },
  // ---- hospitality: restaurant
  { id: 'restaurant-table', cat: 'hospitality', match: /\b(restaurant|bistro|dining|chef|tasting menu|kitchen|trattoria|izakaya|ramen|sushi|pizzeria|steakhouse|eatery)\b/i, composition: 'filmstrip', tone: 'dark', light: 'glow',
    concept: '{name}: the signature plate, the kitchen fire, and the dining room at night', layers: [
      L('lead', 'lead', '16:9', 'push-in', 'medium', 'pan-left', 'the signature {offer} plated', 'A signature plate of {offer} on a dark ceramic dish, sauce glossy under a warm spotlight, fine-dining food photography'),
      L('detail', 'a', '4:3', 'slide-left', 'bold', 'zoom-in', 'a second signature plate up close', 'A close-up of {offer2} plated on handmade ceramics at the pass, sauce glossy, garnish placed by hand, warm kitchen light'),
      L('context', 'b', '4:3', 'slide-right', 'bold', 'none', 'the dining room at night', 'The dining room at night{inPlace}, candlelit tables, guests seen from behind, warm amber light')] },
  // ---- hospitality: bakery
  { id: 'bakery-oven', cat: 'hospitality', match: /\b(bakery|baker|bakes|pastr\w*|bread|breads|croissants?|sourdough|patisserie|cakes?)\b/i, composition: 'orbit', tone: 'light', light: 'glow',
    concept: '{name}: loaves from the oven, flour and dough, and the shop window at dawn', layers: [
      L('lead', 'lead', '4:5', 'hold', 'bold', 'zoom-in', 'fresh {offer} on the counter', 'Freshly baked {offer} piled on a wooden bakery counter, crackling crusts, warm morning light'),
      L('detail', 'a', '1:1', 'orbit', 'bold', 'none', '{offer2} fresh from the oven', 'Fresh {offer2} cooling on a wire rack by the oven, flour dust in the air, crisp golden crusts, macro'),
      L('context', 'b', '1:1', 'orbit-reverse', 'bold', 'none', 'the bakery counter at dawn', 'The bakery counter at dawn{inPlace} with the menu board, trays of pastries and a coffee machine, warm light before opening')] },
  // ---- hospitality: bar / hotel / general
  { id: 'bar-night', cat: 'hospitality', match: /\b(bar|cocktail|cocktails|brewery|taproom|wine bar|pub|lounge|speakeasy)\b/i, composition: 'venue-stack', tone: 'dark', light: 'sweep',
    concept: '{name}: the bar after dark, a cocktail being poured, and the glassware glinting', layers: [
      L('lead', 'lead', '4:5', 'push-in', 'medium', 'pan-right', 'the bar after dark', 'The bar after dark{inPlace}, backlit bottles, brass and dark wood, a few guests seen from behind'),
      L('detail', 'a', '1:1', 'float', 'medium', 'zoom-in', 'a cocktail being poured', 'A bartender pouring a cocktail through a strainer into a coupe glass, ice glinting, face out of frame'),
      L('context', 'b', '1:1', 'drift-left', 'medium', 'none', 'glassware and garnish detail', 'Glassware, citrus peels and bitters bottles on the bar top, moody close-up')] },
  { id: 'hospitality-general', cat: 'hospitality', composition: 'venue-stack', tone: 'light', light: 'glow',
    concept: '{name}: the room, the food and drink, and the service moment', layers: [
      L('lead', 'lead', '4:5', 'push-in', 'medium', 'pan-right', 'the room ready for guests', 'The room at {name}{inPlace} ready for guests, tables set, warm practical lights receding into the space'),
      L('detail', 'a', '1:1', 'float', 'medium', 'zoom-in', '{offer} served on the table', '{offer} served on the table, close-up, steam and texture, natural light'),
      L('context', 'b', '4:3', 'drift-right', 'medium', 'none', 'staff serving guests', 'A server bringing plates to a table, guests seen from behind, candid moment')] },
  // ---- creative
  { id: 'creative-photo', cat: 'creative', match: /\b(photograph\w*|photo studio|wedding photo\w*|portrait studio|videograph\w*|film)\b/i, composition: 'filmstrip', tone: 'dark', light: 'sweep',
    concept: '{name}: the set lit and ready, the prints coming off the table, and the shoot on location -- sliding past like a film strip', layers: [
      L('lead', 'lead', '16:9', 'push-in', 'medium', 'pan-left', 'camera and lighting on set', 'A camera on a tripod in front of a lit studio set, softbox glowing, cables across the floor, behind-the-scenes photograph'),
      L('detail', 'a', '4:3', 'slide-left', 'bold', 'zoom-in', 'prints and contact sheets', 'A spread of printed photographs and contact sheets on a light table, a loupe resting on top'),
      L('context', 'b', '4:3', 'slide-right', 'bold', 'none', 'a shoot on location at golden hour', 'A photographer shooting on location at golden hour, seen from behind, reflector bouncing warm light')] },
  { id: 'creative-studio', cat: 'creative', composition: 'fan', tone: 'light', light: 'sweep',
    concept: '{name}: work pinned on the studio wall, materials up close, and the team at the table', layers: [
      L('lead', 'lead', '3:4', 'rise', 'medium', 'pan-up', 'studio wall of work in progress', 'A design studio wall covered in pinned sketches, prints and colour swatches, daylight from a tall window'),
      L('detail', 'a', '3:4', 'sink', 'medium', 'zoom-in', 'material swatches and type proofs', 'Paper samples, colour swatches and type proofs fanned out on a desk, close overhead'),
      L('context', 'b', '3:4', 'rise', 'medium', 'none', 'hands sketching at the table', 'Hands sketching layouts at a shared worktable, markers and laptops pushed aside, faces out of frame')] },
  // ---- tech
  { id: 'saas-vertical', cat: 'tech', match: /\b(for (?:clinics?|physio\w*|salons?|restaurants?|gyms?|contractors?|schools?|teams?|dentists?|agencies)|scheduling|booking|appointments?)\b/i, composition: 'device-float', tone: 'dark', light: 'glow',
    concept: '{name}: the product on screen, the people it serves, and the moment it saves them time', layers: [
      L('lead', 'lead', '16:9', 'hold', 'medium', 'pan-up', 'a laptop on the front desk it runs', 'A laptop open on the front desk of {served}, its display glowing softly out of focus, an appointment book and a coffee cup beside it, warm morning light, product photography'),
      L('detail', 'a', '4:5', 'float', 'bold', 'none', 'a phone lighting up with a reminder', 'A hand holding a phone lit by a soft notification glow, blurred and unreadable, shallow depth of field, a clinic waiting room behind'),
      L('context', 'b', '4:5', 'orbit', 'medium', 'none', 'the client business it serves', 'The kind of business {name} serves -- {served} -- calm, busy and organised, candid photograph')] },
  { id: 'saas-dev', cat: 'tech', match: /\b(api|developer|devops|code|engineering|infrastructure|cloud|data platform|analytics|ai)\b/i, composition: 'device-float', tone: 'dark', light: 'sweep',
    concept: '{name}: the product in a dark workspace, the hardware it runs on, and the team shipping', layers: [
      L('lead', 'lead', '16:9', 'hold', 'medium', 'pan-up', 'a dark developer workspace with the product', 'A dark developer workspace, an ultrawide monitor glowing with soft blurred light, a mechanical keyboard lit in {accent}'),
      L('detail', 'a', '4:5', 'tilt', 'bold', 'none', 'server hardware with status lights', 'Close-up of server hardware and network cables with glowing status lights, cool blue light'),
      L('context', 'b', '4:5', 'float', 'medium', 'none', 'a team shipping at a whiteboard', 'Engineers at a whiteboard covered in diagrams, seen from behind, a product launch taking shape')] },
  { id: 'tech-general', cat: 'tech', composition: 'device-float', tone: 'dark', light: 'glow',
    concept: '{name}: the product on its device, a detail of it in use, and the people using it', layers: [
      L('lead', 'lead', '16:9', 'hold', 'medium', 'pan-up', '{name} on a laptop on a clean desk', 'A laptop on a clean desk, its display glowing softly out of focus, warm ambient light, product photography for {name}'),
      L('detail', 'a', '4:5', 'float', 'bold', 'none', 'a phone with the app', 'A hand holding a phone lit by a soft glow, blurred and unreadable, shallow depth of field'),
      L('context', 'b', '4:5', 'orbit', 'medium', 'none', 'a small team working', 'A small team working together around a table with laptops, seen from behind, bright modern workspace')] },
  // ---- finance
  { id: 'finance-planning', cat: 'finance', composition: 'diagonal', tone: 'light', light: 'glow',
    concept: '{name}: a calm planning session, the paperwork made clear, and the life it protects', layers: [
      L('lead', 'lead', '16:9', 'push-in', 'subtle', 'pan-right', 'a financial planning session', 'A calm financial planning session across a clean table, documents and a laptop, two people\'s hands mid-conversation, faces out of frame'),
      L('detail', 'a', '4:3', 'float', 'medium', 'zoom-in', 'documents, calculator and pen', 'Neatly arranged financial documents, a calculator and a fountain pen on a desk, soft daylight'),
      L('context', 'b', '1:1', 'drift-left', 'medium', 'none', 'a family home at dusk', 'A family home at dusk with warm lights in the windows, the future the planning is for')] },
  // ---- professional
  { id: 'law-counsel', cat: 'professional', match: /\b(law|lawyer|legal|attorney|barrister|solicitor|notary)\b/i, composition: 'diagonal', tone: 'dark', light: 'glow',
    concept: '{name}: counsel across the table, the documents that matter, and the library behind it', layers: [
      L('lead', 'lead', '16:9', 'push-in', 'subtle', 'pan-right', 'a legal consultation at the table', 'A lawyer and client in consultation across a walnut table, documents between them, faces out of frame, warm office light'),
      L('detail', 'a', '4:3', 'float', 'medium', 'zoom-in', 'a contract being signed', 'A contract being signed with a fountain pen, close-up, papers and a leather folder'),
      L('context', 'b', '1:1', 'drift-left', 'medium', 'none', 'law books in the library', 'Shelves of law books in a quiet library, a reading lamp glowing')] },
  { id: 'consulting-workshop', cat: 'professional', composition: 'columns', tone: 'light', light: 'sweep',
    concept: '{name}: the working session, the thinking on the wall, and the city outside, rising and falling side by side', layers: [
      L('lead', 'lead', '3:4', 'rise', 'medium', 'pan-up', 'a strategy workshop in progress', 'A strategy workshop in progress, people around a table covered in notes, one standing at a whiteboard, seen from behind'),
      L('detail', 'a', '3:4', 'sink', 'bold', 'zoom-in', 'sticky notes and a marker on a whiteboard', 'A whiteboard covered in sticky notes and arrows, a hand holding a marker, close-up'),
      L('context', 'b', '3:4', 'rise', 'bold', 'none', 'the city from the office window', 'A city view{inPlace} from a bright office window at golden hour, a notebook on the sill')] },
  // ---- education
  { id: 'education-tutor', cat: 'education', composition: 'fan', tone: 'light', light: 'glow', treatment: 'illustration',
    concept: '{name}: learning at the table, the materials, and the moment it clicks', layers: [
      L('lead', 'lead', '16:9', 'push-in', 'medium', 'pan-left', 'a tutor and student working through a lesson', 'A tutor and a student working through a lesson at a bright table, notebooks open, hands pointing at a worked problem, faces out of frame'),
      L('detail', 'a', '4:3', 'slide-left', 'bold', 'zoom-in', 'books, pencils and notes', 'Open textbooks, sharpened pencils and handwritten notes spread on a desk, soft daylight'),
      L('context', 'b', '4:3', 'slide-right', 'bold', 'none', 'a quiet classroom in afternoon light', 'An empty classroom in warm afternoon light, chairs pushed in, a chalkboard at the front')] },
  // ---- fitness
  { id: 'fitness-boxing', cat: 'fitness', match: /\b(boxing|kickboxing|martial arts|mma|muay thai|jiu[- ]jitsu|bjj|karate)\b/i, composition: 'split-duo', tone: 'dark', light: 'sweep',
    concept: '{name}: the punch landing, the wraps going on, and the gym under the lights', layers: [
      L('lead', 'lead', '3:4', 'rise', 'bold', 'zoom-in', 'a boxer hitting the heavy bag', 'A boxer hitting a heavy bag mid-punch, sweat spraying, hard top light in a dark gym, face turned away'),
      L('detail', 'a', '3:4', 'sink', 'bold', 'none', 'hand wraps and gloves', 'Hands wrapping tape before training, red gloves on the bench beside them, macro'),
      L('context', 'b', '3:4', 'rise', 'bold', 'pan-up', 'the boxing ring under the lights', 'An empty boxing ring under hanging lights in a gritty gym, ropes glowing')] },
  { id: 'fitness-studio', cat: 'fitness', match: /\b(yoga|pilates|reformer|barre|stretch|mobility)\b/i, composition: 'arch-cluster', tone: 'light', light: 'glow',
    concept: '{name}: the studio in soft light, the movement, and the class together', layers: [
      L('lead', 'lead', '3:4', 'hold', 'medium', 'zoom-in', 'the studio with reformers in soft light', 'A calm studio with pilates reformers lined up in soft morning light, plants and pale wood floors'),
      L('detail', 'a', '1:1', 'float', 'medium', 'none', 'hands and feet on the mat', 'Hands and feet grounded on a yoga mat in a held pose, close crop, soft light'),
      L('context', 'b', '4:3', 'drift-left', 'medium', 'pan-right', 'a class moving together', 'A small class moving together through a stretch, seen from behind, bright airy studio')] },
  { id: 'fitness-gym', cat: 'fitness', composition: 'filmstrip', tone: 'dark', light: 'sweep',
    concept: '{name}: the lift, the chalk and steel, and the coach in the room', layers: [
      L('lead', 'lead', '16:9', 'push-in', 'bold', 'pan-left', 'an athlete mid-lift', 'An athlete driving a barbell up mid-lift in a warehouse gym, chalk dust in the light, face turned away'),
      L('detail', 'a', '4:3', 'slide-left', 'bold', 'zoom-in', 'kettlebells lined up on the floor', 'A row of kettlebells in graduated weights on a rubber gym floor, chalk dust in the light, low angle'),
      L('context', 'b', '4:3', 'slide-right', 'bold', 'none', 'the training mat set up for a session', 'A training mat set up for a coached session with resistance bands, a foam roller and dumbbells, bright gym light, three-quarter view')] },
  // ---- real estate
  { id: 'realestate-dusk', cat: 'realestate', composition: 'panorama', tone: 'dark', light: 'glow',
    concept: '{name}: the home at dusk, the kitchen inside, and the keys changing hands', layers: [
      L('lead', 'lead', '16:9', 'push-in', 'medium', 'pan-left', 'a home exterior at dusk', 'A beautiful family home exterior at dusk{inPlace}, warm light in every window, landscaped front walk'),
      L('detail', 'a', '4:3', 'float', 'medium', 'zoom-in', 'a bright staged kitchen', 'A bright staged kitchen with an island, pendant lights and flowers on the counter, natural light'),
      L('context', 'b', '4:3', 'drift-left', 'medium', 'none', 'keys handed over at the door', 'A set of house keys being handed over at a front door, close-up of hands, soft evening light')] },
  { id: 'realestate-condo', cat: 'realestate', match: /\b(condo|condos|apartment|apartments|loft|downtown|urban|luxury|high-end|penthouse)\b/i, composition: 'diagonal', tone: 'dark', light: 'sweep',
    concept: '{name}: the view from the top, the finishes, and the neighbourhood below', layers: [
      L('lead', 'lead', '16:9', 'push-in', 'medium', 'pan-right', 'a condo living room with a city view', 'A condo living room with floor-to-ceiling windows over the city{inPlace} at blue hour, designer furniture'),
      L('detail', 'a', '4:3', 'float', 'medium', 'zoom-in', 'kitchen finishes up close', 'A close-up of the condo kitchen: marble counter, brass fixtures and oak cabinetry, soft light'),
      L('context', 'b', '1:1', 'drift-left', 'medium', 'none', 'the neighbourhood street', 'A tree-lined neighbourhood street with cafés and townhouses, evening light')] },
  // ---- wellness
  { id: 'clinic-physio', cat: 'wellness', match: /\b(physio\w*|rehab\w*|chiropract\w*|osteopath\w*|sports injur\w*|clinic)\b/i, composition: 'arch-cluster', tone: 'light', light: 'glow',
    concept: '{name}: hands-on treatment, the recovery exercise, and the calm clinic room', layers: [
      L('lead', 'lead', '3:4', 'hold', 'medium', 'zoom-in', 'a physiotherapist treating a knee', 'A physiotherapist guiding a patient\'s knee through a gentle stretch on a treatment table, hands and posture in frame, faces out of frame, soft daylight'),
      L('detail', 'a', '1:1', 'float', 'medium', 'none', 'resistance band recovery exercise', 'A resistance band looped around an ankle during a recovery exercise, close crop, clinic floor'),
      L('context', 'b', '4:3', 'drift-left', 'medium', 'pan-right', 'the calm clinic reception', 'The calm reception of the clinic{inPlace} with a desk, a plant and chairs by a bright window, morning light, wide view')] },
  { id: 'spa-calm', cat: 'wellness', match: /\b(spa|massage|facial|sauna|retreat|day spa|salon|stylist|hair|nails|esthetic\w*)\b/i, composition: 'venue-stack', tone: 'light', light: 'glow',
    concept: '{name}: the quiet room, the ritual up close, and the treatment in progress', layers: [
      L('lead', 'lead', '4:5', 'push-in', 'subtle', 'pan-right', 'a calm treatment room', 'A calm treatment room with a made-up massage table, folded towels, candles and soft daylight through linen'),
      L('detail', 'a', '1:1', 'float', 'medium', 'zoom-in', 'oils, stones and towels', 'Warm basalt stones, a small bottle of oil and rolled towels on a wooden tray, macro'),
      L('context', 'b', '4:3', 'drift-right', 'medium', 'none', 'oils and creams by the basin', 'Massage oils and body creams lined up beside a stone basin with rolled towels, warm soft light, three-quarter view')] },
  { id: 'wellness-general', cat: 'wellness', composition: 'arch-cluster', tone: 'light', light: 'glow',
    concept: '{name}: care in progress, the details that make it calm, and the space itself', layers: [
      L('lead', 'lead', '3:4', 'hold', 'medium', 'zoom-in', 'a treatment in progress', 'A treatment in progress at {name}, hands in frame, faces out of frame, calm light-filled room'),
      L('detail', 'a', '1:1', 'float', 'medium', 'none', 'care tools and towels', 'The tools of the practice laid out neatly on a tray with folded towels, macro'),
      L('context', 'b', '4:3', 'drift-left', 'medium', 'pan-right', 'the calm practice room', 'The practice room at rest, plants, soft daylight, an inviting chair')] },
  // ---- nonprofit
  { id: 'nonprofit-community', cat: 'nonprofit', composition: 'panorama', tone: 'dark', light: 'glow',
    concept: '{name}: people working side by side, the hands doing it, and the place it changes', layers: [
      L('lead', 'lead', '16:9', 'push-in', 'medium', 'pan-left', 'a long table set for the community', 'Volunteers setting a long table for a community meal{inPlace}, bowls and flowers down the middle, string lights overhead, seen from behind, warm afternoon light'),
      L('detail', 'a', '4:3', 'float', 'medium', 'zoom-in', 'hands sorting donations', 'Hands sorting donated food into crates on a table, close-up'),
      L('context', 'b', '4:3', 'drift-left', 'medium', 'none', 'seedlings going into the community garden', 'Young seedlings just planted in a community garden bed, a trowel in the soil, soft daylight, low close-up')] },
  // ---- trades
  { id: 'landscape-build', cat: 'landscaping', match: /\b(design|patios?|stone|hardscap\w*|retaining|outdoor living|build)\b/i, composition: 'panorama', tone: 'dark', light: 'glow',
    concept: '{name}: the finished yard, the stonework up close, and the crew mid-build', layers: [
      L('lead', 'lead', '16:9', 'push-in', 'medium', 'pan-left', 'a finished backyard at golden hour', 'A finished backyard{inPlace} at golden hour: a natural stone patio, layered planting beds and a fresh green lawn'),
      L('detail', 'a', '4:3', 'float', 'medium', 'zoom-in', 'flagstone and planting detail', 'A close-up of freshly laid flagstone meeting a planted border, soil and mulch detail'),
      L('context', 'b', '4:3', 'drift-left', 'medium', 'none', 'fresh planting going in', 'Fresh perennials and ornamental grasses being planted into a dark mulched bed beside the new stonework, trowel and tray of plants, soft daylight')] },
  { id: 'lawn-care', cat: 'landscaping', match: /\b(lawn|lawns|mowing|turf|sod|yard maintenance|cleanups?|aeration|fertili[sz]\w*)\b/i, composition: 'filmstrip', tone: 'light', light: 'sweep',
    concept: '{name}: the striped lawn, the clean edge, and the seasonal cleanup', layers: [
      L('lead', 'lead', '16:9', 'push-in', 'medium', 'pan-right', 'a freshly striped lawn', 'A freshly mowed striped lawn in front of a suburban home{inPlace}, crisp edges, bright morning light'),
      L('detail', 'a', '4:3', 'slide-left', 'bold', 'zoom-in', 'edging along a garden bed', 'A string trimmer edging a clean line where lawn meets a mulched garden bed, grass clippings flying, macro'),
      L('context', 'b', '4:3', 'slide-right', 'bold', 'none', 'raking leaves in a fall cleanup', 'A crew member raking autumn leaves into a pile during a yard cleanup, seen from behind')] },
  { id: 'landscape-general', cat: 'landscaping', composition: 'panorama', tone: 'dark', light: 'glow',
    concept: '{name}: the finished garden, planting up close, and the work underway', layers: [
      L('lead', 'lead', '16:9', 'push-in', 'medium', 'pan-left', 'a finished garden', 'A finished garden{inPlace} with mature planting, a curving path and a lawn, soft evening light'),
      L('detail', 'a', '4:3', 'float', 'medium', 'zoom-in', 'planting detail', 'Close-up of fresh perennials planted into dark mulch, dew on the leaves'),
      L('context', 'b', '4:3', 'drift-left', 'medium', 'none', 'freshly clipped hedges', 'Freshly clipped hedges with crisp square edges framing a lawn, hedge shears resting on top, clear daylight')] },
  { id: 'roofing', cat: 'roofing', composition: 'panorama', tone: 'dark', light: 'glow',
    concept: '{name}: the finished roofline, the shingles up close, and the crew on the roof', layers: [
      L('lead', 'lead', '16:9', 'push-in', 'medium', 'pan-left', 'a finished roof on a family home', 'A family home{inPlace} with a crisp, newly finished roof, clean ridge line against a clear sky'),
      L('detail', 'a', '4:3', 'float', 'medium', 'zoom-in', 'new shingles and flashing close-up', 'Close-up of new architectural shingles and metal flashing, precise lines'),
      L('context', 'b', '4:3', 'drift-left', 'medium', 'none', 'a roofer installing shingles', 'A roofer in a harness nailing shingles mid-job, seen from behind, bright sky')] },
  { id: 'renovation', cat: 'renovation', composition: 'split-duo', tone: 'dark', light: 'glow',
    concept: '{name}: the finished room, the craftsmanship, and the build in progress', layers: [
      L('lead', 'lead', '16:9', 'push-in', 'medium', 'pan-right', 'a finished renovated kitchen', 'A finished renovated kitchen with a stone island, new cabinetry and pendant lights, natural light'),
      L('detail', 'a', '4:3', 'float', 'medium', 'zoom-in', 'tile and joinery detail', 'Close-up of freshly laid tile and precise cabinet joinery, clean grout lines'),
      L('context', 'b', '4:3', 'drift-left', 'medium', 'none', 'framing mid-renovation', 'A room mid-renovation with fresh timber framing, tools and sawdust, a builder at work seen from behind')] },
  { id: 'painting', cat: 'painting', composition: 'split-duo', tone: 'light', light: 'sweep',
    concept: '{name}: the freshly painted room, the brush cutting in, and the painter at work', layers: [
      L('lead', 'lead', '4:5', 'push-in', 'medium', 'pan-right', 'a freshly painted living room', 'A freshly painted living room with crisp walls and white trim, furniture back in place, afternoon light'),
      L('detail', 'a', '1:1', 'float', 'medium', 'zoom-in', 'a brush cutting a clean line', 'A paint brush cutting a perfectly straight line where a wall meets the trim, macro'),
      L('context', 'b', '4:3', 'drift-left', 'medium', 'none', 'a loaded roller and open paint', 'An open can of paint, a loaded roller resting in the tray and colour swatches on a drop cloth, three-quarter overhead view, soft light')] },
  { id: 'plumbing', cat: 'plumbing', composition: 'diagonal', tone: 'light', light: 'glow',
    concept: '{name}: the finished bathroom, the fixture up close, and the fix underway', layers: [
      L('lead', 'lead', '16:9', 'push-in', 'medium', 'pan-right', 'a finished modern bathroom', 'A finished modern bathroom with a walk-in shower, new chrome fixtures and clean tile, soft daylight'),
      L('detail', 'a', '4:3', 'float', 'medium', 'zoom-in', 'chrome faucet with running water', 'A new chrome faucet with water running into a white basin, macro'),
      L('context', 'b', '1:1', 'drift-left', 'medium', 'none', "plumber's hands on pipework", "A plumber's hands tightening copper pipework under a sink, tools beside them, close crop")] },
  { id: 'electrical', cat: 'electrical', composition: 'diagonal', tone: 'dark', light: 'glow',
    concept: '{name}: the room lit well, the neat panel, and the install in progress', layers: [
      L('lead', 'lead', '16:9', 'push-in', 'medium', 'pan-right', 'a home interior glowing with new lighting', 'A home interior{inPlace} glowing with warm new pendant and recessed lighting at dusk'),
      L('detail', 'a', '4:3', 'float', 'medium', 'zoom-in', 'a neatly wired electrical panel', 'A neatly wired electrical panel with labelled breakers and tidy cable runs, close-up'),
      L('context', 'b', '1:1', 'drift-left', 'medium', 'none', 'new outlets and switches', 'New white outlet and switch plates on a freshly painted wall, square and level, soft side light, close-up')] },
  { id: 'cleaning', cat: 'cleaning', composition: 'split-duo', tone: 'light', light: 'sweep',
    concept: '{name}: the spotless room, the sparkle up close, and the team at work', layers: [
      L('lead', 'lead', '4:5', 'push-in', 'medium', 'pan-right', 'a spotless sunlit living room', 'A spotless, sunlit living room after a deep clean, plumped cushions and gleaming floors'),
      L('detail', 'a', '1:1', 'float', 'medium', 'zoom-in', 'a gleaming countertop being wiped', 'A microfiber cloth wiping a gleaming kitchen countertop, streak-free shine, macro'),
      L('context', 'b', '4:3', 'drift-right', 'medium', 'none', 'a cleaner with a supply caddy', 'A cleaner carrying a supply caddy into a bright kitchen, seen from behind')] },
  { id: 'auto-detailing', cat: 'automotive', match: /\b(detail\w*|ceramic coating|paint correction|polish\w*|wash|ppf)\b/i, composition: 'orbit', tone: 'dark', light: 'sweep',
    concept: '{name}: the finish like a mirror, the polisher at work, and the interior reborn', layers: [
      L('lead', 'lead', '16:9', 'push-in', 'bold', 'pan-left', 'a freshly detailed car with a mirror finish', 'A freshly detailed car in a dark studio bay, paint reflecting overhead light strips like a mirror'),
      L('detail', 'a', '1:1', 'orbit', 'bold', 'zoom-in', 'a polisher correcting paint', 'A dual-action polisher correcting paint on a car hood, swirl marks disappearing, macro'),
      L('context', 'b', '1:1', 'orbit-reverse', 'bold', 'none', 'a freshly cleaned alloy wheel', 'A freshly cleaned alloy wheel and dressed tyre, a spotless brake caliper behind the spokes, close-up, studio light')] },
  { id: 'auto-repair', cat: 'automotive', composition: 'filmstrip', tone: 'dark', light: 'sweep',
    concept: '{name}: the car on the lift, the parts up close, and the mechanic at work', layers: [
      L('lead', 'lead', '16:9', 'push-in', 'medium', 'pan-left', 'a car on the lift in the garage bay', 'A car raised on a lift in a clean garage bay{inPlace}, tools on the wall, bright work lights'),
      L('detail', 'a', '4:3', 'slide-left', 'bold', 'zoom-in', 'engine parts and tools', 'Engine parts and a torque wrench laid out on a workbench, macro'),
      L('context', 'b', '4:3', 'slide-right', 'bold', 'none', 'a new tyre and wheel ready to fit', 'A new tyre and alloy wheel leaning by the lift ready to fit, torque wrench beside it, workshop light, close-up')] },
  // ---- other
  { id: 'other-product', cat: 'other', match: /\b(product|products|brand|made|make|makes|making|craft|crafts|handmade|goods|shop|store)\b/i, composition: 'venue-stack', tone: 'light', light: 'glow',
    concept: '{name}: the finished piece up close, the making of it, and the moment it is used', layers: [
      L('lead', 'lead', '4:5', 'push-in', 'medium', 'pan-right', '{offer} as a hero shot', '{offer} by {name} styled as a single hero subject on a {accent} surface, soft directional light'),
      L('detail', 'a', '1:1', 'tilt', 'bold', 'zoom-in', '{offer} being made', 'Hands making {offer}, tools and materials in frame, warm workshop light'),
      L('context', 'b', '4:3', 'drift-right', 'medium', 'none', '{offer2} in use', '{offer2} in real use{inPlace}, candid, natural light')] },
  { id: 'other-service', cat: 'other', composition: 'diagonal', tone: 'light', light: 'glow',
    concept: '{name}: the service being done well, its tools, and the people it helps', layers: [
      L('lead', 'lead', '16:9', 'push-in', 'medium', 'pan-right', '{offer} in progress', '{name} at work: {offer} in progress{inPlace}, hands and equipment in frame, faces out of frame, natural light'),
      L('detail', 'a', '4:3', 'float', 'medium', 'zoom-in', 'the equipment behind {offer}', 'The equipment and materials behind {offer} laid out neatly, close-up'),
      L('context', 'b', '1:1', 'drift-left', 'medium', 'none', 'guests enjoying {offer2}', 'Guests enjoying {offer2}{inPlace}, seen from behind, warm natural light')] },
];
// category -> sub-type-specific concepts first, then the category default(s)
function conceptsFor(categoryKey) { return CONCEPTS.filter(c => c.cat === categoryKey); }

const FLAVOURS = /\b(peach|cherry|citrus|lemon|lime|berry|berries|mango|grape|orange|mint|vanilla|chocolate|raspberry|strawberry|blueberry|watermelon|ginger|apple|coconut|pineapple|passionfruit|grapefruit|yuzu)\b/i;
function fill(tpl, v) {
  return String(tpl || '').replace(/\{(\w+)\}/g, (m, k) => (v[k] != null ? v[k] : ''))
    .replace(/\s+,/g, ',').replace(/\s{2,}/g, ' ').trim();
}
function servedPhrase(text) {
  const m = String(text || '').match(/\bfor ([a-z][a-z -]{3,40}?)(?: with| that| to|[.,]|$)/i);
  return m ? `a ${m[1].replace(/s$/, '')}` : 'a small business';
}
// "online shop selling small-batch hot sauce made with..." -> "small-batch hot sauce":
// the THING, without the storefront wrapped around it.
function cleanNoun(noun) {
  let n = String(noun || '').trim();
  n = n.replace(/^(?:an?\s+|the\s+)?(?:[a-z-]+\s+){0,2}?(?:shop|store|boutique|brand|company|business|studio|label|maker)\s+(?:selling|making|offering|that sells|that makes|of|for)\s+/i, '');
  n = n.replace(/\s+(?:made|made with|with|that|which|from)\b.*$/i, '').trim();
  return n.length > 50 ? n.split(/\s+(?:and|,)\s+/)[0] : n;
}
function templateVars(ctx, factsIn) {
  const c = Object.assign({}, ctx || {});
  const facts = factsIn || VS.factsFor(c);
  const fv = VS.varsFor(facts, c);
  c.noun = cleanNoun(c.noun);
  // own offerings first; a business the classifier could not place ('other') has only placeholder defaults,
  // so it uses what it says it does instead ('fishing charters and sunset boat tours' -> two offers)
  const own = (c.ownOfferings || []).filter(Boolean).map(o => String(o).toLowerCase());
  const activity = String(c.activity || '').toLowerCase().split(/\s*(?:,|\band\b)\s*/).map(x => x.trim()).filter(x => x.length > 2);
  const offers = own.length ? own : (c.categoryKey === 'other' && activity.length ? activity : (c.offerings || []).filter(Boolean).map(o => String(o).toLowerCase()));
  const flavourWords = [...new Set(((offers.join(' ') + ' ' + (c.text || '')).match(new RegExp(FLAVOURS.source, 'gi')) || []).map(w => w.toLowerCase()))];
  const name = c.name || 'the business';
  return {
    name, "Name's": possessive(name), noun: c.noun || 'product', offer: offers[0] || c.noun || 'the signature offering', offer2: offers[1] || offers[0] || 'the house favourite',
    offer3: offers[2] || offers[1] || 'the range', offers: offers.slice(0, 3).join(', ') || c.noun || 'the range',
    flavour: flavourWords[0] || (offers[0] || 'citrus'), flavour2: flavourWords[1] || flavourWords[0] || 'citrus', place: c.place || '', inPlace: c.place ? ` in ${c.place}` : '',
    accent: c.accent || 'warm', served: servedPhrase(c.text),
    container: fv.container, containers: fv.containers,
    flavourOf: fv.flavourList ? ` in ${fv.flavourList}` : '', flavourPhrase: fv.flavourList || 'citrus and mint', flavourColourways: fv.flavourList ? `${fv.flavourList} colourways` : 'three flavour colourways',
    skinProduct: fv.skinProduct, skinProduct2: fv.skinProduct2, skinList: fv.skinList, skinWithContainers: fv.skinWithContainers, skinContainer: fv.skinContainer, skinContainerShort: fv.skinContainer.split(' ').slice(-2).join(' '),
    pantryNoun: fv.pantryNoun, pantryLabel: fv.pantryProduct || cleanNoun(c.noun) || 'product', ingredientList: fv.flavourList || 'fresh chilies, garlic and spices',
    garment: facts.apparel ? fv.garment : (offers[0] || 'garment'),
  };
}
// Deterministic variety: the concept (among the category's matching ones),
// then per-layer motion amounts/offsets and the loop length are picked from the
// business's own description, so two landscapers or two drink brands differ.
function fallbackStoryboard(ctx, reason) {
  const c = ctx || {};
  // only the business's OWN words and offerings pick the sub-type -- never the category's default service list
  const text = plain(`${c.text || ''} ${(c.ownOfferings || []).join(' ')}`);
  // 'other' (no named category matched): a strong sub-type match anywhere in the
  // library still wins -- a tonic maker the classifier could not place is still
  // art-directed as a drinks brand, not as a generic "product".
  const own = conceptsFor(c.categoryKey).length ? conceptsFor(c.categoryKey) : conceptsFor('other');
  const pool = c.categoryKey === 'other' || !conceptsFor(c.categoryKey).length ? own.concat(CONCEPTS.filter(k => k.cat !== 'other' && k.match)) : own;
  // the sub-type the description matches MOST strongly wins (a drink brand that
  // says "natural flavours" is still a drink brand, not a botanical skincare line)
  const score = k => (k.match ? (text.match(new RegExp(k.match.source, 'gi')) || []).length : 0);
  const best = Math.max(0, ...pool.map(score));
  const matching = best > 0 ? pool.filter(k => score(k) === best) : [];
  const generic = pool.filter(k => !k.match);
  const candidates = matching.length ? matching : (generic.length ? generic : pool);
  const h = hashStr(`${c.name}|${c.text}|${c.variation || 0}`);
  const concept = candidates[h % candidates.length];
  const facts = VS.factsFor(c);
  const v = templateVars(c, facts);
  const loop = 10 + (h % 5); // 10-14s
  const amounts = ['subtle', 'medium', 'bold'];
  const special = VS.specialiseLayers(concept.id, concept.layers.map(l => ({ role: l.role, subject: fill(l.subject, v), shot: fill(l.shot, v) })), facts, c);
  const treatment = concept.treatment || 'photo';
  const look = VS.lookLine({ tone: concept.tone, treatment }, c.accent);
  const UI_NAMES = { schedule: 'scheduling', monitor: 'monitoring', ledger: 'invoicing', pipeline: 'pipeline', inbox: 'support inbox', docs: 'document review', learning: 'course', store: 'storefront', editor: 'editor', workflow: 'workflow', analytics: 'analytics' };
  const layers = concept.layers.map((l, i) => {
    const sp = special[i];
    const drawn = concept.cat === 'tech' && l.role === 'lead';
    // supporting layers vary between medium and bold (never faint) so the motion reads in a short capture
    const amount = i === 0 ? l.amount : amounts[Math.min(2, Math.max(1, amounts.indexOf(l.amount) + ((h >> (i * 3)) % 3) - 1))];
    return {
      slot: i === 0 ? 'hero' : `hero-${i + 1}`, role: l.role, anchor: l.anchor,
      subject: drawn ? `the ${v.name} ${UI_NAMES[(sp.art.params && sp.art.params.ui) || 'analytics'] || 'product'} screen` : sp.subject,
      prompt: finishPrompt(sp.shot, l.role, l.aspect, { pan: l.pan, look, treatment }), aspect: l.aspect, shape: l.shape,
      art: sp.art, render: drawn ? 'art' : 'image',
      depth: i === 0 ? 2 : 3 + (i % 2),
      motion: { path: l.motion, amount, offset: Math.round(((i / concept.layers.length) + ((h >> (i + 5)) % 7) / 40) % 1 * 100) / 100 },
      pan: l.pan, reveal: REVEALS[(i + h) % REVEALS.length],
    };
  });
  return sanitizeStored({
    source: 'fallback', fallbackReason: reason || null, conceptId: concept.id, concept: fill(concept.concept, v), composition: concept.composition,
    copySafe: COMPOSITIONS[concept.composition].copy, tone: concept.tone, light: concept.light, loop, baseHero: c.hero, treatment, look, layers,
  });
}
// The one entry point generation calls: the planner's storyboard when it
// validates, otherwise the fallback (with the reason recorded).
function storyboardFor(plannedRaw, ctx) {
  if (plannedRaw) {
    const res = validatePlanned(plannedRaw, ctx);
    if (res.ok) return res.storyboard;
    return fallbackStoryboard(ctx, `planner storyboard rejected: ${res.problems.slice(0, 3).join('; ')}`);
  }
  return fallbackStoryboard(ctx, 'no planner storyboard');
}
// The owner's own photo for one hero layer: an upload bound to that layer's slot
// (the editor's per-image "Replace" control), or -- for the lead only -- the
// general hero upload. Uploads always outrank generated images and drawings.
function layerUpload(project, slot) {
  const items = (project && project.assets && Array.isArray(project.assets.items)) ? project.assets.items : [];
  const own = items.find(a => a && a.type === 'hero' && a.slot === slot && a.dataUrl);
  if (own) return own;
  if (slot !== 'hero') return null;
  const planned = project.assets && project.assets.plan && project.assets.plan.hero;
  return items.find(a => a && a.id === planned && a.dataUrl && (!a.slot || a.slot === 'hero')) || null;
}
// the short label the editor shows for a layer: its role and what it shows
const ROLE_LABELS = { lead: 'Main image', detail: 'Detail', context: 'Scene', accent: 'Accent' };
function layerLabel(layer) { return `${ROLE_LABELS[layer.role] || 'Image'} · ${clip(layer.subject || '', 48)}`; }
function activeStoryboard(project) {
  if (!project || (project.meta && project.meta.isDemoShell)) return null;
  const sb = project.heroStoryboard;
  if (!sb || !Array.isArray(sb.layers) || sb.layers.length < 3 || !COMPOSITIONS[sb.composition]) return null;
  const hero = project.design && project.design.dimensions && project.design.dimensions.hero;
  if (sb.baseHero && hero && sb.baseHero !== hero) return null; // the owner picked another hero layout themselves
  return sb;
}
// Expected cost of the hero's images on a given route table: { route(model, quality, aspect) -> usd }.
function heroCostSummary(sb, routeFor) {
  const layers = (sb && sb.layers) || [];
  return layers.map(l => ({ slot: l.slot, role: l.role, aspect: l.aspect, ...routeFor(l) }));
}

// ---- markup -------------------------------------------------------------------------------------------------------
function esc(v) { return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }
const px = n => `${n}`;
// The illustration for one layer: its stored art spec, or (a storyboard saved
// before art specs existed) one matched on the layer's own subject.
// stage proportions (width / height) per copy side at a desktop width -- see styles.css .sb-stage
const STAGE_RATIO = { left: 1.11, right: 1.11, top: 2.2, 'bottom-left': 1.72 };
function frameRatio(sb, layer) { const d = placementFor(sb.composition, layer.anchor).d; return (d[2] / d[3]) * (STAGE_RATIO[sb.copySafe] || 1.11); }
function layerArtHtml(sb, layer, o) {
  const art = layer.art || VS.artForText(`${layer.subject}. ${layer.prompt}`, layer.role, VS.factsFor({ name: o.name, categoryKey: o.categoryKey || 'other', ownOfferings: o.offerings || [] }), { name: o.name }, null);
  // a full-bleed lead behind bottom-left copy: draw wider and pin the left edge, so the subject lands right of the words
  const behindCopy = sb.copySafe === 'bottom-left' && layer.anchor === 'lead';
  return ARTK.drawArt(art, { aspect: layer.aspect, ratio: frameRatio(sb, layer) * (behindCopy ? 1.25 : 1), align: behindCopy ? 'xMinYMid' : null, accent: o.accent, tone: sb.tone, role: layer.role, seed: `${sb.conceptId || ''}|${layer.slot}`, uid: `sb${layer.slot.replace(/\W/g, '')}${(ARTK.KINDS[art.kind] ? art.kind : 'x').replace(/\W/g, '').slice(0, 8)}` });
}
// opts: { storyboard, visuals: {slot: html|null}, accent, categoryKey, kickerHtml, headlineHtml, subHtml, ctaHtml, offerings[], name, place }
// visuals[slot] is the layer's real image (an upload or a ready generated
// image); every other layer draws its illustration, so the composition is
// always whole. Each layer carries its own placement and motion track as CSS
// custom properties consumed by the shared keyframes in styles.css.
function renderStoryboardHero(o) {
  const sb = o.storyboard;
  const resolved = resolveLayers(sb);
  const items = (o.offerings || []).filter(Boolean).slice(0, 4).map(esc);
  const layerHtml = resolved.map(l => {
    const [x, y, w, h] = l.desktop; const [mx, my, mw, mh] = l.mobile;
    const t = l.track;
    const style = [
      `--x:${px(x)}`, `--y:${px(y)}`, `--w:${px(w)}`, `--h:${px(h)}`, `--mx:${px(mx)}`, `--my:${px(my)}`, `--mw:${px(mw)}`, `--mh:${px(mh)}`, `--z:${l.z}`,
      `--fx:${t.from.x}%`, `--fy:${t.from.y}%`, `--fs:${t.from.s}`, `--fr:${t.from.r}deg`, `--tx:${t.to.x}%`, `--ty:${t.to.y}%`, `--ts:${t.to.s}`, `--tr:${t.to.r}deg`,
      `--ix0:${l.pan.from[0]}%`, `--iy0:${l.pan.from[1]}%`, `--is0:${l.pan.from[2]}`, `--ix1:${l.pan.to[0]}%`, `--iy1:${l.pan.to[1]}%`, `--is1:${l.pan.to[2]}`,
      `--delay:${l.delay}s`, `--rvd:${l.revealDelay}s`,
    ].join(';');
    const layer = sb.layers.find(x => x.slot === l.slot);
    const real = o.visuals && o.visuals[l.slot]; // an upload wins even over a drawn interface
    let media = real ? String(real) : layerArtHtml(sb, layer, o);
    // the owner's chosen focal point wins over any stored one
    if (real && layer.focal) media = /object-position:/.test(media) ? media.replace(/object-position:[^;"]*/, `object-position:${layer.focal}`) : media.replace(/<img /, `<img style="object-position:${layer.focal}" `);
    const kind = real ? 'image' : 'art';
    return `<figure class="sb-layer sb-role-${l.role} sb-shape-${l.shape}" data-slot="${esc(l.slot)}" data-motion="${esc(layer.motion.path)}" data-reveal="${esc(l.reveal)}" data-source="${kind}"${kind === 'art' && layer.art ? ` data-art="${esc(layer.art.kind)}"` : ''} style="${style}"><div class="sb-frame"><div class="sb-media">${media}</div></div></figure>`;
  }).join('');
  const copy = `<div class="cinema-copy sb-copy"><p class="cinema-kicker">${o.kickerHtml || ''}</p><h3>${o.headlineHtml || ''}</h3><p class="cinema-sub">${o.subHtml || ''}</p><div class="site-actions">${o.ctaHtml || ''}</div>${items.length ? `<ul class="sb-offers">${items.map(i => `<li>${i}</li>`).join('')}</ul>` : ''}</div>`;
  return `<div class="site-hero hero-cinema hero-storyboard" data-cinema="storyboard" data-composition="${esc(sb.composition)}" data-copy="${esc(sb.copySafe)}" data-tone="${esc(sb.tone)}" data-light="${esc(sb.light)}" data-concept="${esc(sb.conceptId || '')}" data-layers="${resolved.length}" style="--sb-loop:${sb.loop}s">
        <div class="sb-backdrop" aria-hidden="true"><span class="sb-glow"></span></div>
        ${copy}
        <div class="sb-stage">${layerHtml}<span class="sb-light" aria-hidden="true"></span></div>
      </div>`;
}

module.exports = {
  COMPOSITIONS, COMPOSITION_KEYS, ANCHORS, ROLES, ASPECTS, SHAPES, MOTION_PATHS, MOTION_KEYS, AMOUNTS, PANS, PAN_KEYS, REVEALS, CUES, CONCEPTS,
  relevance, similarity, placementFor, trackFor, resolveLayers, sanitizeStored, validatePlanned, fallbackStoryboard, storyboardFor,
  activeStoryboard, conceptsFor, templateVars, finishPrompt, heroCostSummary, renderStoryboardHero, sanitizeArt, layerArtHtml, layerUpload, layerLabel, ROLE_LABELS,
};
