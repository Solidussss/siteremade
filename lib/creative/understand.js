'use strict';
// CREATIVE — what a brief is asking for, before anything is researched or drawn.
//
//   understandBrief(text, { supplied, uploads })  ->  {
//     kind:     'recognizable' | 'personal' | 'fictional' | 'ambiguous'
//     subject:  the thing the site is about ("toilet paper", "Sherlock Holmes", "Bubbles")
//     query:    what to look up (recognizable subjects; for a pet, its species)
//     species / relation: for personal subjects ("goldfish", "my")
//     tone:     'lyrical' | 'cinematic' | 'playful' | 'absurd' | 'tender' | 'editorial' | 'retro'
//     purpose:  'showcase' | 'fan' | 'tribute' | 'memorial' | 'joke' | 'story'
//     asks:     what the owner still needs to supply (personal subjects: a photo, the facts)
//   }
//   classifyResearch(page)  ->  category from the looked-up page ('character', 'object', 'food', 'animal', ...)
// Pure; no network. The research step (server) confirms 'recognizable' or turns it into
// 'ambiguous' (a disambiguation page) with choices for the owner.

const clean = s => String(s || '').replace(/\s+/g, ' ').trim();
const RELATIONS = /\b(my|our|his|her|their)\s+(?:(?:little|old|late|beloved|pet|dear|sweet|best)\s+){0,2}(goldfish|fish|dog|puppy|cat|kitten|pet|hamster|rabbit|bunny|bird|parrot|budgie|tortoise|turtle|guinea pig|horse|pony|lizard|snake|ferret|gerbil|chicken|grandma|grandmother|nan|nana|granny|grandad|grandfather|grandpa|mum|mom|mother|dad|father|friend|wife|husband|partner|son|daughter|brother|sister|aunt|uncle|teacher|band|garden|car|house|plant|tree)\b/i;
const PETS = /^(goldfish|fish|dog|puppy|cat|kitten|pet|hamster|rabbit|bunny|bird|parrot|budgie|tortoise|turtle|guinea pig|horse|pony|lizard|snake|ferret|gerbil|chicken)$/i;
const FICTION = /\b(imaginary|invented|fictional|made[- ]up|fake|parody|a world where|what if|alternate|pretend|mock(?:umentary)?)\b/i;
const TONES = [
  ['tender', /\b(in memory|memorial|passed away|rest in peace|\brip\b|remember(?:ing)?|tribute to|who died|departed|farewell)\b/i],
  ['absurd', /\b(absurd|ridiculous|over[- ]the[- ]top|overly dramatic|unhinged|chaotic|deranged|meme|shitpost|deadpan|mock[- ]epic|grandiose)\b/i],
  ['playful', /\b(funny|silly|hilarious|playful|fun|cheeky|goofy|cute|whimsical|joke)\b/i],
  ['cinematic', /\b(cinematic|epic|dramatic|movie|film|trailer|moody|dark|noir|atmospheric|mysterious)\b/i],
  ['lyrical', /\b(beautiful|elegant|gorgeous|luxurious|serene|dreamy|poetic|delicate|calm|minimal|gallery)\b/i],
  ['retro', /\b(retro|pixel|8[- ]bit|arcade|vintage|old[- ]school|90s|80s)\b/i],
];
const PURPOSES = [['memorial', /\b(in memory|memorial|passed away|rest in peace|who died)\b/i], ['fan', /\b(fan (?:site|page)|fansite|shrine|obsessed|stan)\b/i], ['tribute', /\b(tribute|celebrat\w*|honou?r\w*|ode to|appreciation)\b/i], ['joke', /\b(joke|meme|parody|prank|funny)\b/i], ['story', /\b(story|tale|saga|legend|chronicle)\b/i]];

// "a website about toilet paper, make it grand" -> "toilet paper"; "Sherlock Holmes fan site" -> "Sherlock Holmes"
function extractSubject(text) {
  const t = clean(text).replace(/^(please\s+)?(make|create|build|design|generate)\s+(me\s+)?/i, '');
  const about = /\b(?:web ?site|site|page|homepage|landing page|shrine|tribute|celebration|ode)\s+(?:all\s+)?(?:about|for|to|celebrating|dedicated to|on|honou?ring)\s+(?:the\s+(?=[A-Z]))?(.+?)(?=\s*(?:[,.;:!?—–]|\s-\s|\bthat\b|\bwhich\b|\bwith\b|\bmake it\b|\bin the style\b|\bin a\b|\bbut\b|\bwhere\b|$))/i.exec(t);
  if (about) return clean(about[1]).replace(/^(a|an)\s+/i, '');
  const fan = /^(.+?)\s+(?:fan ?site|fan page|shrine|tribute(?: site| page)?|memorial(?: site| page)?|web ?site|site|page)\b/i.exec(t);
  if (fan && fan[1].split(' ').length <= 6) return clean(fan[1]).replace(/^(a|an|the)\s+/i, '');
  const first = t.split(/[,.;:!?—–]|\s-\s/)[0];
  return clean(first).replace(/^(a|an|the)\s+/i, '').split(' ').slice(0, 6).join(' ');
}
const titleCase = s => String(s || '').replace(/\b([a-z])/g, (m, c) => c.toUpperCase());

function understandBrief(text, ctx) {
  const c = ctx || {}; const t = clean(text); const supplied = clean(c.supplied || '');
  const rel = RELATIONS.exec(t) || RELATIONS.exec(supplied);
  const tone = (TONES.find(([, re]) => re.test(t)) || [null])[0];
  const purpose = (PURPOSES.find(([, re]) => re.test(t)) || [null])[0];
  if (rel) {
    // a personal subject: its name if the owner gives one ("my goldfish Bubbles", "named Bubbles", "Bubbles, my goldfish")
    const noun = rel[2].toLowerCase(); const both = `${t} ${supplied}`;
    const named = new RegExp(`\\b(?:named|called)\\s+([A-Z][\\w'-]*(?:\\s[A-Z][\\w'-]*)?)`).exec(both)
      || new RegExp(`\\b${rel[1]}\\s+(?:\\w+\\s+){0,2}${noun}\\s*,?\\s+([A-Z][\\w'-]*)`, 'i').exec(both)
      || new RegExp(`^([A-Z][\\w'-]*)\\s*,?\\s+(?:is\\s+)?${rel[1]}\\s+`, 'i').exec(both);
    const name = named ? named[1] : '';
    const isPet = PETS.test(noun);
    return {
      kind: 'personal', subject: name || `${rel[1].toLowerCase()} ${noun}`, name, relation: rel[1].toLowerCase(), species: isPet ? noun : null, noun,
      query: isPet && noun !== 'pet' ? noun : null, // the species may be looked up (clearly as the species, never as this pet)
      tone: tone || (purpose === 'memorial' ? 'tender' : 'playful'), purpose: purpose || (/\b(passed|died|late)\b/i.test(both) ? 'memorial' : 'tribute'),
      asks: [c.uploads ? null : `a photo of ${name || `your ${noun}`}`, supplied ? null : `a few true details about ${name || `your ${noun}`} (age, habits, favourite things)`].filter(Boolean),
      brief: t,
    };
  }
  const subject = extractSubject(t);
  if (FICTION.test(t)) return { kind: 'fictional', subject, query: null, tone: tone || 'playful', purpose: purpose || 'story', asks: [], brief: t };
  if (!subject || subject.length < 2) return { kind: 'ambiguous', subject: '', query: null, tone: tone || 'editorial', purpose: purpose || 'showcase', asks: ['what the site should be about'], brief: t };
  return { kind: 'recognizable', subject, query: subject, tone, purpose: purpose || 'showcase', asks: [], brief: t };
}

// the looked-up page's own description decides what sort of thing the subject is
const CATEGORY_RULES = [
  ['character', /\b(fictional|character|detective|superhero|villain|protagonist|mascot|creature from|cartoon)\b/i],
  ['game', /\b(video game|board game|card game|game franchise|arcade game|tabletop)\b/i],
  ['food', /\b(food|dish|sandwich|burger|hamburger|snack|drink|beverage|cuisine|dessert|cake|bread|confection|fast food|soup|fruit|vegetable)\b/i],
  ['animal', /\b(species|breed|genus|animal|fish|bird|mammal|reptile|insect|freshwater|marine)\b/i],
  ['person', /\b(born|actor|actress|singer|musician|painter|writer|author|politician|scientist|athlete|footballer|rapper|poet|composer)\b/i],
  ['object', /\b(product|paper|tool|device|object|instrument|appliance|furniture|toy|container|material|garment|household)\b/i],
  ['vehicle', /\b(car|automobile|aircraft|airplane|ship|train|locomotive|bicycle|motorcycle|spacecraft|rocket)\b/i],
  ['place', /\b(city|town|village|country|island|mountain|river|lake|building|landmark|park|museum|region|capital)\b/i],
];
// the article's own short description decides first; its opening sentences only when that says nothing
function classifyResearch(page) {
  const desc = String((page && page.description) || ''); const lead = ((page && page.extract) || '').split('. ').slice(0, 2).join('. ');
  return (CATEGORY_RULES.find(([, re]) => re.test(desc)) || CATEGORY_RULES.find(([, re]) => re.test(lead)) || ['concept'])[0];
}

module.exports = { understandBrief, extractSubject, classifyResearch, titleCase };
