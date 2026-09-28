'use strict';
// CREATIVE — the scene director. Turns what is known about a subject (understanding,
// research, supplied details, ASSESSED assets) into a scene plan: the world the subject
// lives in, its layers and depth, typography and copy, entrance / resting composition /
// ambient loop / scroll behaviour, the connector that carries the eye down the page, and a
// section outline chosen for the subject and purpose -- never a fixed template.
//
//   direct(input) -> plan      (then lib/creative/validate.js checks and settles it)
//   redirectHero(plan, assets) re-plans the hero only (after an image is replaced)
//
// The deterministic director is one source of plans; the model (/api/creative/plan) is the
// other. Both produce the same data and go through the same validator and renderer. Nothing
// here invents facts: sourced lines carry their source, supplied lines come from the owner,
// and imagined lines are marked as imagined.

const { titleCase } = require('./understand');

// ---- the world a subject lives in -------------------------------------------------------------------------------
// chosen from what the subject IS (its research text and category), then the requested tone
const WORLD_RULES = [
  ['underwater', /\b(fish|goldfish|koi|aquarium|ocean|sea|marine|coral|whale|shark|dolphin|octopus|jellyfish|reef|submarine)\b/i],
  ['night', /\b(space|planet|star|galaxy|astronaut|moon|rocket|astronomy|comet|orbit|nebula|satellite)\b/i],
  ['fog', /\b(detective|crime|mystery|victorian|noir|ghost|vampire|gothic|murder|fog|haunted|horror|sherlock)\b/i],
  ['sky', /\b(bird|flight|aircraft|airplane|kite|balloon|cloud|wind|sail|flying|butterfly)\b/i],
  ['warm', /\b(food|dish|burger|sandwich|pizza|cake|bread|coffee|tea|cookie|snack|dessert|soup|chocolate|kitchen|restaurant)\b/i],
];
const WORLDS = {
  // backdrop, light, particles, palette, display type
  monument: { light: 'spot', particles: 'dust', palette: { bg: '#15120f', bg2: '#2b231b', ink: '#f6efe3', muted: '#bfb2a0', accent: '#d8b46a', glow: '#fff1cf' }, display: 'didone' },
  studio: { light: 'spot', particles: 'none', palette: { bg: '#eee9e1', bg2: '#d9d1c4', ink: '#1d1a17', muted: '#6b6259', accent: '#c2502e', glow: '#ffffff' }, display: 'grotesk' },
  fog: { light: 'lamp', particles: 'fog', palette: { bg: '#0e1319', bg2: '#243140', ink: '#eef0ec', muted: '#9aa6b2', accent: '#c9a45c', glow: '#ffd38a' }, display: 'serif' },
  underwater: { light: 'caustics', particles: 'bubbles', palette: { bg: '#062c43', bg2: '#0d6784', ink: '#f2fbff', muted: '#a8d3e0', accent: '#ff9a3c', glow: '#bff4ff' }, display: 'rounded' },
  night: { light: 'rim', particles: 'stars', palette: { bg: '#05060d', bg2: '#1b1d3a', ink: '#f4f3ff', muted: '#a9a8c8', accent: '#8fb6ff', glow: '#dfe8ff' }, display: 'grotesk' },
  sky: { light: 'sun', particles: 'clouds', palette: { bg: '#8cc2ea', bg2: '#e8f4fb', ink: '#10273a', muted: '#3f5b71', accent: '#f0743e', glow: '#ffffff' }, display: 'rounded' },
  warm: { light: 'spot', particles: 'steam', palette: { bg: '#2a1a12', bg2: '#5a3320', ink: '#fff4e6', muted: '#e0c3a4', accent: '#ffb02e', glow: '#ffe2a8' }, display: 'slab' },
  paper: { light: 'none', particles: 'none', palette: { bg: '#efe6d2', bg2: '#d9cbb0', ink: '#231c14', muted: '#6d5d48', accent: '#8e2a1d', glow: '#fffaf0' }, display: 'serif' },
};
function chooseWorld(text, category, tone, subjectAsset) {
  const hit = WORLD_RULES.find(([, re]) => re.test(text));
  if (hit) return hit[0];
  if (subjectAsset && subjectAsset.illustration && (tone === 'lyrical' || tone === 'editorial')) return 'paper';
  if (category === 'food') return 'warm';
  if (tone === 'absurd' || tone === 'cinematic' || (category === 'object' && tone !== 'playful')) return 'monument';
  return 'studio';
}
// a thread that runs through the page, from what the subject is
const CONNECTOR_RULES = [['ribbon', /\b(roll|paper|ribbon|tape|scroll|film|tissue|string of|garland)\b/i], ['thread', /\b(detective|crime|mystery|clue|investigat|murder)\b/i], ['bubbles', /\b(fish|aquarium|ocean|sea|underwater|bubble|marine)\b/i], ['orbit', /\b(space|planet|orbit|star|moon|galaxy)\b/i]];

// ---- imagined lines (clearly imagined: moods, not facts -- no names, numbers or claims) ---------------------------
const MOOD_LINES = {
  absurd: ['Presented with the ceremony it has always been denied.', 'An appreciation, at the scale it deserves.', 'It asks for nothing. We are giving it everything anyway.'],
  cinematic: ['Some stories are best told in low light.', 'Look closer. Everything here is a clue.', 'Step in. The details are waiting.'],
  playful: ['A small celebration of a big favourite.', 'Pull up a chair. This one is fun.', 'Everything worth knowing, and a little more.'],
  lyrical: ['Quiet, familiar, and quietly remarkable.', 'A slow look at something we rarely stop to see.', 'Some things deserve a second look.'],
  tender: ['Remembered with love.', 'A little place to keep the good days.', 'For the one who made ordinary days better.'],
  editorial: ['A closer look.', 'The whole story, one page at a time.', 'What it is, where it came from, why it matters.'],
  retro: ['Press start.', 'Insert coin. Stay a while.', 'Loading the good old days.'],
};
const ODE = {
  absurd: s => [`Consider ${s}. It has never once asked for a spotlight.`, `Empires rise and fall. Fashions come and go. ${cap1(s)} simply waits, patient as marble, for the moment it is needed.`, `Today, it gets the stage.`],
  playful: s => [`Here is to ${s}: always there, rarely thanked.`, `If it could talk, it would probably be too polite to mention how much it does for us.`],
  lyrical: s => [`There is a kind of beauty in things made to be used.`, `${cap1(s)} is one of them — ordinary until you look, and then not ordinary at all.`],
  cinematic: s => [`Every legend starts somewhere quiet.`, `This one starts with ${s}.`],
  editorial: s => [`${cap1(s)}, seen up close.`],
  tender: s => [`Some lives are measured in the smallest joys.`],
  retro: s => [`${cap1(s)}: a classic worth replaying.`],
};

const KICKERS = { absurd: 'A monument to', cinematic: 'The legend of', playful: 'All about', lyrical: 'In praise of', editorial: 'A closer look at', retro: 'Press start for', tender: 'For' };

// ---- helpers ----------------------------------------------------------------------------------------------------------
function rng(seed) { let s = 2166136261; for (const ch of String(seed)) { s ^= ch.charCodeAt(0); s = Math.imul(s, 16777619); } return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; }
const cap1 = t => String(t).charAt(0).toUpperCase() + String(t).slice(1);
const pick = (r, list) => list[Math.floor(r() * list.length) % list.length];
const short = (s, n) => { const t = String(s || '').replace(/\s+/g, ' ').trim(); return t.length > n ? t.slice(0, n - 1).replace(/\s+\S*$/, '') + '…' : t; };
const YEAR = /\b(1[0-9]{3}|20[0-4][0-9])s?\b/;
function relLum(hex) { const c = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; }
function contrast(a, b) { const x = relLum(a), y = relLum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }
function saturated(hex) { const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16); const mx = Math.max(r, g, b), mn = Math.min(r, g, b); return mx > 60 && (mx - mn) / mx > 0.45; }

// ---- assets: which image plays which part ------------------------------------------------------------------------------
// asset: { id, origin, title, relevance, assess, cutout (bool: this IS a clean cutout), cutoutOf, illustration, caps }
function castAssets(assets, u) {
  const usable = (assets || []).filter(a => a && a.assess && !a.failed);
  const score = a => (a.origin === 'upload' ? 3 : 0) + (a.relevance || 0) + (a.caps && a.caps.moveFreely ? 1.2 : 0) + (a.caps && a.caps.heroSize ? 0.4 : 0) - (a.caps && a.caps.lowRes ? 1 : 0);
  // personal subjects: only the owner's own photos may show the subject
  const pool = u.kind === 'personal' ? usable.filter(a => a.origin === 'upload' || (a.cutoutOf && usable.find(b => b.id === a.cutoutOf && b.origin === 'upload'))) : usable;
  const ranked = pool.slice().sort((a, b) => score(b) - score(a));
  const subject = ranked[0] || null;
  const companions = ranked.filter(a => a !== subject && a.caps && a.caps.moveFreely && a.cutoutOf !== (subject && subject.id) && (subject && subject.cutoutOf) !== a.id).slice(0, 2);
  const used = new Set([subject, ...companions].filter(Boolean).map(a => a.id));
  // pictures for the sections: the framed originals (never a cutout duplicate of something already shown)
  const pictures = pool.filter(a => !used.has(a.id) && !a.cutout && !(subject && (subject.cutoutOf === a.id))).sort((a, b) => score(b) - score(a));
  return { subject, companions, pictures };
}

// ---- the hero ---------------------------------------------------------------------------------------------------------
// boxes are [x, y, w, h] in % of the stage (desktop stage ~16:9, phone stage portrait)
function heroPlan(cast, world, u, tone, r) {
  const s = cast.subject; const free = !!(s && s.caps && s.caps.moveFreely); const portrait = s && s.assess && s.assess.orientation === 'portrait';
  const layers = []; let layout;
  if (s && free) {
    layout = 'stage';
    const tall = portrait || (s.assess && s.assess.aspect < 0.9);
    const d = tall ? [52, 8, 38, 86] : [46, 16, 48, 72]; const m = tall ? [16, 30, 68, 60] : [8, 34, 84, 50];
    layers.push({ id: 'subject', role: 'subject', asset: s.id, box: { d, m }, z: 5, fit: 'contain', frame: 'none', shadow: world === 'underwater' || world === 'night' || world === 'sky' || (s.illustration && (world === 'fog' || world === 'monument')) ? 'glow' : 'floor',
      entrance: { kind: tone === 'absurd' ? 'descend' : tone === 'playful' ? 'pop' : 'rise', delay: 0.35, dur: 1.4 },
      loop: { kind: world === 'underwater' ? 'swim' : world === 'night' || world === 'sky' ? 'float' : tone === 'absurd' ? 'breathe' : 'float', amp: world === 'underwater' ? 2.2 : 1.4, period: world === 'underwater' ? 9 : 8 }, depth: 0.35 });
    cast.companions.forEach((c, i) => layers.push({ id: `companion-${i + 1}`, role: 'companion', asset: c.id, box: { d: i ? [4, 64, 18, 30] : [30, 58, 16, 34], m: i ? [70, 8, 26, 22] : [4, 10, 26, 22] }, z: i ? 7 : 3, fit: 'contain', frame: 'none', shadow: 'drop', entrance: { kind: 'fade', delay: 0.9 + i * 0.2, dur: 1.2 }, loop: { kind: 'sway', amp: 1, period: 11 + i * 2 }, depth: i ? 0.8 : 0.15 }));
  } else if (s && s.caps && s.caps.backdrop && u.kind !== 'personal') {
    layout = 'panorama';
    layers.push({ id: 'subject', role: 'subject', asset: s.id, box: { d: [0, 0, 100, 100], m: [0, 0, 100, 100] }, z: 1, fit: 'cover', frame: 'none', shadow: 'none', entrance: { kind: 'dolly', delay: 0, dur: 2.2 }, loop: { kind: 'drift', amp: 1.2, period: 16 }, depth: 0.2 });
  } else if (s) {
    layout = 'portrait';
    const frame = world === 'underwater' ? 'porthole' : world === 'fog' || world === 'paper' ? 'frame' : tone === 'tender' ? 'arch' : 'window';
    layers.push({ id: 'subject', role: 'subject', asset: s.id, box: { d: frame === 'porthole' ? [52, 12, 40, 72] : [54, 10, 34, 80], m: frame === 'porthole' ? [14, 24, 72, 54] : [18, 24, 64, 58] }, z: 5, fit: 'cover', focus: s.assess && s.assess.subject ? `${Math.round(((s.assess.subject[0] + s.assess.subject[2]) / 2) * 100)}% ${Math.round(((s.assess.subject[1] + s.assess.subject[3]) / 2) * 100)}%` : '50% 50%', frame, shadow: 'drop', entrance: { kind: 'unveil', delay: 0.3, dur: 1.5 }, loop: { kind: 'drift', amp: 0.8, period: 14 }, depth: 0.3 });
  } else {
    layout = 'type'; // no image of the subject: the name itself carries the scene, and the studio asks for a picture
  }
  const title = { place: { d: layout === 'panorama' ? 'bottom' : 'left', m: layout === 'panorama' ? 'bottom' : 'top' } };
  return { layout, layers, title };
}

// ---- sections -----------------------------------------------------------------------------------------------------------
function timelineItems(facts) {
  const seen = new Set();
  // the year of the event, not of a span in brackets ("During the Ming dynasty (1368-1644) ... in 1393")
  return facts.map(f => { const m = YEAR.exec(f.text.replace(/\([^)]*\)/g, '')); return m ? { year: m[1], text: f.text, cite: f.id, kind: 'sourced' } : null; }).filter(x => x && !seen.has(x.year) && seen.add(x.year)).sort((a, b) => Number(a.year) - Number(b.year)).slice(0, 6);
}
function sectionsFor(u, category, tone, facts, cast, supplied, subjectTitle, r, ledeFact) {
  const out = []; const add = s => { out.push(Object.assign({ id: `s-${s.type}-${out.length + 1}` }, s)); };
  const byLen = facts.slice().sort((a, b) => a.text.length - b.text.length);
  const pics = cast.pictures.slice(); const nextPic = () => pics.shift() || null;
  // every fact appears once on the page: the hero's, then the statement's, then the history, then the rest
  const used = new Set(ledeFact ? [ledeFact.id] : []);
  const take = (list, n, filter) => { const got = list.filter(f => !used.has(f.id) && (!filter || filter(f))).slice(0, n); got.forEach(f => used.add(f.id)); return got.map(f => ({ text: f.text, cite: f.id, kind: 'sourced' })); };
  const moodLine = pick(r, MOOD_LINES[tone] || MOOD_LINES.editorial);
  if (u.kind === 'personal') {
    const lines = (supplied.facts || []).map(t => ({ text: t, kind: 'supplied' }));
    const memories = (supplied.memories || []).map(t => ({ text: t, kind: 'supplied' }));
    if (lines.length) add({ type: 'about', kind: 'supplied', eyebrow: `About ${u.name || `this ${u.noun}`}`, title: u.name || titleCase(u.noun), items: lines.slice(0, 8), layout: 'ledger' });
    else add({ type: 'ask', kind: 'supplied', eyebrow: 'Your words go here', title: `Tell us about ${u.name || `your ${u.noun}`}`, body: `This page only shows what you tell it. Add a few true details (age, habits, favourite things) in the studio.`, studioOnly: true });
    const extra = cast.pictures.filter(p => p.origin === 'upload');
    if (extra.length) add({ type: 'gallery', kind: 'supplied', eyebrow: 'Photos', title: 'Moments', assets: extra.slice(0, 4).map(a => a.id), layout: 'scatter' });
    if (memories.length) add({ type: 'memories', kind: 'supplied', eyebrow: 'Memories', title: 'The good days', items: memories.slice(0, 6), layout: 'notes' });
    if (u.species && facts.length) add({ type: 'aside', kind: 'sourced', eyebrow: `About ${u.species} in general`, title: `A little about ${u.species}`, note: `General facts about ${u.species}, not about ${u.name || `this ${u.noun}`}.`, items: take(facts, 3, f => f.text.length < 220), layout: 'columns' });
    add({ type: 'closing', kind: 'imagined', title: u.purpose === 'memorial' ? 'Always remembered.' : pick(r, MOOD_LINES[tone] || MOOD_LINES.tender), layout: 'echo' });
  } else if (u.kind === 'fictional') {
    const ode = (ODE[tone] || ODE.playful)(u.subject);
    add({ type: 'statement', kind: 'imagined', title: ode[0], body: ode.slice(1).join(' '), layout: 'full' });
    add({ type: 'story', kind: 'imagined', eyebrow: 'Imagined', title: `The world of ${titleCase(u.subject)}`, paragraphs: ode, layout: 'column' });
    add({ type: 'closing', kind: 'imagined', title: moodLine, layout: 'echo' });
  } else {
    // the opening statement is a different fact from the one the hero already quotes
    const lead = facts.find(f => f !== ledeFact && f.text.length <= 200) || facts.find(f => f !== ledeFact) || null;
    if (lead) used.add(lead.id);
    const tl = timelineItems(facts.filter(f => !used.has(f.id))); tl.forEach(t => used.add(t.cite));
    const character = category === 'character' || category === 'person' || category === 'game';
    if (character) {
      const pic = nextPic();
      add({ type: 'dossier', kind: 'sourced', eyebrow: category === 'person' ? 'Who' : 'The file', title: subjectTitle, asset: pic && pic.id, items: take(facts, 4, f => f.text.length < 240), layout: 'dossier' });
    } else {
      add({ type: 'statement', kind: 'sourced', title: lead ? short(lead.text, 180) : subjectTitle, cite: lead && lead.id, layout: 'full' });
      if (cast.subject && cast.subject.caps && cast.subject.caps.moveFreely) add({ type: 'specimen', kind: 'sourced', eyebrow: 'Up close', title: `${subjectTitle}, up close`, asset: cast.subject.id, items: take(byLen, 3, f => f.text.length < 200), layout: 'callouts' });
    }
    const plate = nextPic();
    if (plate) add({ type: 'plate', kind: 'sourced', asset: plate.id, title: short(plate.title.replace(/^File:/, '').replace(/\.[a-z]+$/i, '').replace(/[_-]+/g, ' ').replace(/\s*\(\d{6,}\)/g, '').replace(/\s+\d{6,}$/, '').trim(), 90), layout: 'wide' });
    const factList = take(facts, 5, f => f.text.length < 260);
    if (factList.length >= 2) add({ type: 'facts', kind: 'sourced', eyebrow: 'Worth knowing', title: character ? 'The record' : `What makes ${subjectTitle.toLowerCase()} tick`, items: factList, layout: 'ledger' });
    if (tl.length >= 3) add({ type: 'timeline', kind: 'sourced', eyebrow: 'Over time', title: 'A short history', items: tl, layout: 'rail' });
    const more = [nextPic(), nextPic(), nextPic()].filter(Boolean);
    if (more.length >= 2) add({ type: 'gallery', kind: 'sourced', eyebrow: 'Pictures', title: 'Seen elsewhere', assets: more.map(a => a.id), layout: 'scatter' });
    if (tone === 'absurd' || tone === 'playful' || tone === 'lyrical') { const ode = (ODE[tone] || ODE.editorial)(u.subject); add({ type: 'ode', kind: 'imagined', eyebrow: 'Imagined', title: ode[0], paragraphs: ode.slice(1), layout: 'column' }); }
    add({ type: 'closing', kind: 'imagined', title: moodLine, layout: 'echo' });
  }
  add({ type: 'sources', kind: 'sourced', title: 'Sources and credits', layout: 'list' });
  return out;
}

// ---- the whole plan ------------------------------------------------------------------------------------------------------
// input: { understanding, research: { page, facts }, assets: [...], supplied: { facts[], memories[] }, seed }
function direct(input) {
  const u = input.understanding; const research = input.research || {}; const page = research.page || null; const facts = research.facts || [];
  const supplied = input.supplied || {}; const r = rng(input.seed || `${u.subject}|${u.brief}`);
  const category = u.kind === 'personal' ? (u.species ? 'animal' : 'person') : u.kind === 'fictional' ? 'concept' : (page && page.category) || 'concept';
  const tone = u.tone || ({ character: 'cinematic', person: 'editorial', object: 'editorial', food: 'playful', animal: 'lyrical', place: 'lyrical', game: 'retro', vehicle: 'cinematic' }[category]) || 'editorial';
  const cast = castAssets(input.assets, u);
  const worldText = `${u.subject} ${u.species || ''} ${page ? `${page.title} ${page.description} ${page.extract}` : ''} ${u.brief}`;
  const world = chooseWorld(worldText, category, tone, cast.subject);
  const W = WORLDS[world];
  const palette = Object.assign({}, W.palette);
  // the subject's own colour tints the accent when it is a strong one (an orange goldfish, a red jacket)
  // -- only when it stays legible: the accent colours the kicker, links and the button (whose label is the background colour)
  const subjectColour = cast.subject && cast.subject.assess && (cast.subject.assess.colours || []).find(c => saturated(c) && contrast(c, palette.bg) >= 3.2);
  if (subjectColour && world !== 'monument') palette.accent = subjectColour;
  const hero = heroPlan(cast, world, u, tone, r);
  const subjectTitle = u.kind === 'personal' ? (u.name || titleCase(u.noun)) : page ? page.title : titleCase(u.subject);
  // the hero quotes one complete, short sentence (never a sentence cut off mid-way)
  const lead = facts.slice(0, 4).find(f => f.text.length >= 40 && f.text.length <= 200) || facts[0] || null;
  // the kicker sets the tone (imagined); the encyclopedia's own description stays in the facts
  const kicker = u.kind === 'personal' ? (u.purpose === 'memorial' ? 'In memory' : `${u.relation === 'my' ? 'My' : 'Our'} ${u.noun}`) : u.kind === 'fictional' ? 'An invented world' : (KICKERS[tone] || KICKERS.editorial);
  hero.title = Object.assign(hero.title, {
    kicker, text: subjectTitle, tagline: pick(r, MOOD_LINES[tone] || MOOD_LINES.editorial), taglineKind: 'imagined',
    lede: u.kind === 'personal' ? ((supplied.facts || [])[0] || '') : u.kind === 'fictional' ? '' : lead ? short(lead.text, 220) : '',
    ledeKind: u.kind === 'personal' ? 'supplied' : 'sourced', cite: u.kind === 'recognizable' && lead ? lead.id : null,
  });
  hero.atmosphere = { light: W.light, particles: W.particles, count: W.particles === 'none' ? 0 : W.particles === 'fog' ? 5 : W.particles === 'stars' ? 60 : 18 };
  hero.camera = { entrance: hero.layout === 'panorama' ? 'none' : 'dolly', scroll: 'push' };
  const sections = sectionsFor(u, category, tone, facts, cast, supplied, subjectTitle, r, lead);
  // the closing line never repeats the hero's tagline
  const closing = sections.find(s => s.type === 'closing');
  if (closing && closing.title === hero.title.tagline) closing.title = (MOOD_LINES[tone] || MOOD_LINES.editorial).find(l => l !== hero.title.tagline) || closing.title;
  hero.cta = { label: u.kind === 'personal' ? `Meet ${u.name || `the ${u.noun}`}` : 'Scroll the story', target: `#${(sections[0] || {}).id || 'top'}` };
  const connectorKind = (CONNECTOR_RULES.find(([, re]) => re.test(worldText)) || [world === 'underwater' ? 'bubbles' : 'line'])[0];
  const sources = [];
  if (page) sources.push({ id: 'src-1', title: `${page.title} — Wikipedia`, url: page.url, license: 'CC BY-SA 4.0', retrieved: page.retrieved || null, used: 'facts' });
  const credits = (input.assets || []).filter(a => a.origin !== 'upload' && !a.cutoutOf).map(a => ({ asset: a.id, title: a.title, author: a.author || '', license: a.license || '', url: a.pageUrl || '', licenseUrl: a.licenseUrl || '' }));
  const derived = (input.assets || []).filter(a => a.cutoutOf).map(a => ({ asset: a.id, from: a.cutoutOf, note: 'background removed by SiteRemade' }));
  return {
    v: 1, kind: u.kind, category, tone, world,
    concept: { line: conceptLine(u, category, tone, world, hero.layout, connectorKind, subjectTitle), mood: tone },
    palette, type: { display: W.display },
    hero, connector: { kind: connectorKind, colour: palette.accent },
    sections, sources, credits, derived,
    motion: { intensity: tone === 'tender' || tone === 'lyrical' ? 'calm' : 'lively' },
    facts: facts.map(f => ({ id: f.id, text: f.text, section: f.section, source: 'src-1' })),
    director: 'deterministic',
  };
}
function conceptLine(u, category, tone, world, layout, connector, title) {
  const worldWords = { monument: 'a spotlit monument', studio: 'a clean studio set', fog: 'gas-lit fog', underwater: 'a sunlit tank of water', night: 'deep space', sky: 'open sky', warm: 'a warm, steamy counter', paper: 'the printed page' }[world];
  const thread = { ribbon: 'an unrolling ribbon', thread: 'a red investigator\'s thread', bubbles: 'a trail of bubbles', orbit: 'an orbit line', line: 'a single line' }[connector];
  return `${title} in ${worldWords}${layout === 'stage' ? ', lifted out as its own layer' : layout === 'panorama' ? ', filling the frame' : layout === 'portrait' ? ', framed' : ''}; ${thread} carries the story down the page (${tone}).`;
}

// the hero again, for the current assets (after a replacement) -- the rest of the plan is kept
function redirectHero(plan, assets, understanding) {
  const u = understanding; const cast = castAssets(assets, u); const r = rng(`${u.subject}|hero`);
  const hero = heroPlan(cast, plan.world, u, plan.tone, r);
  return Object.assign({}, plan, { hero: Object.assign({}, plan.hero, { layout: hero.layout, layers: hero.layers, title: Object.assign({}, plan.hero.title, { place: hero.title.place }) }) });
}

module.exports = { direct, redirectHero, castAssets, chooseWorld, WORLDS, MOOD_LINES };
