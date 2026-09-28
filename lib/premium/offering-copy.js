'use strict';
// OFFERING COPY -- one honest line under each service/feature/menu item.
//
// Replaces the category-wide filler that used to sit under every card no
// matter what it was ("Real landscaping work, presented clearly.", "Built
// around X, without the busywork."). Each line describes what the offering
// IS, from a small lexicon of common offerings, and otherwise falls back to a
// sentence anchored to this business (its name and place). Rules:
//   * never an invented fact (no years, awards, prices, guarantees, numbers);
//   * product facts only when the owner's own description states them
//     ("zero sugar", "natural flavours", "for sensitive skin");
//   * the same input always gives the same line (no randomness).
// Pure, shared by the live preview (premium-core.js bundle) and the export
// (lib/site-render.js) -- same flag-independence as hero-direction.js.

const LEXICON = [
  // outdoor / landscaping
  [/\b(patio|patios|paver|pavers|flagstone|hardscap\w*|walkway|walkways|retaining wall|stonework|stone)\b/i, 'Patios, paths and stone walls laid to suit the yard you have.'],
  [/\b(garden design|landscape design|planting|garden beds?|perennials?|garden)\b/i, 'Planting plans and garden beds designed around your light, soil and how you use the space.'],
  [/\b(lawn|lawns|turf|sod)\b/i, 'Mowing, edging and feeding that keep the lawn thick and even.'],
  [/\b(clean ?ups?|seasonal|leaf|leaves|snow)\b/i, 'Spring and fall visits that clear beds and leaves and reset the yard for the season.'],
  [/\b(irrigation|sprinklers?)\b/i, 'Watering systems set up so the garden looks after itself.'],
  [/\b(trees?|pruning|hedges?)\b/i, 'Pruning and shaping that keep trees and hedges healthy and tidy.'],
  // trades
  [/\b(roof|roofs|roofing|shingles?)\b/i, 'Roof repairs and replacements, inspected and finished properly.'],
  [/\b(gutters?)\b/i, 'Gutters cleared, repaired or replaced so water goes where it should.'],
  [/\b(kitchens?)\b/i, 'Kitchens planned and rebuilt around how you actually cook.'],
  [/\b(bathrooms?|baths?)\b/i, 'Bathrooms rebuilt with fixtures and finishes chosen to last.'],
  [/\b(drains?|pipes?|pipework|leaks?|plumbing)\b/i, 'Leaks, drains and pipework found and fixed without the runaround.'],
  [/\b(wiring|panels?|electrical|lighting)\b/i, 'Wiring, panels and lighting, done safely and neatly.'],
  [/\b(painting|paint)\b/i, 'Walls and trim prepared properly, then painted cleanly.'],
  [/\b(deep clean\w*|move.?out|cleaning)\b/i, 'A thorough clean, room by room, on a schedule that suits you.'],
  [/\b(detailing|detail)\b/i, 'Inside-and-out detailing that brings the finish back.'],
  // care / wellness / fitness
  [/\b(sports injur\w*|injur\w*|rehab\w*)\b/i, 'An assessment first, then a step-by-step plan to get you back to what you do.'],
  [/\b(dry needling|needling|acupuncture)\b/i, 'Targeted needling to ease tight, painful muscles.'],
  [/\b(post.?surg\w*|post.?op\w*|recovery)\b/i, 'Guided recovery after surgery, from first movements back to full strength.'],
  [/\b(massage)\b/i, 'Hands-on massage to ease tension and help you recover.'],
  [/\b(pilates|yoga|classes?)\b/i, 'Small classes that build strength, balance and control.'],
  [/\b(personal training|coaching|training)\b/i, 'One-to-one sessions built around your goals.'],
  // food / hospitality
  [/\b(single.?origin|beans|roast\w*)\b/i, 'Whole-bean coffee to take home and brew your way.'],
  [/\b(pour.?over|espresso|coffee bar|brew\w*)\b/i, 'Coffee made to order at the bar, one cup at a time.'],
  [/\b(pastr\w*|croissants?|bak\w*|bread|cakes?)\b/i, 'Pastries and bakes, fresh from the counter.'],
  [/\b(brunch|breakfast)\b/i, 'Breakfast and brunch plates from the kitchen.'],
  [/\b(cocktails?|wine|bar)\b/i, 'Drinks from the bar, from the classics to house pours.'],
  [/\b(catering|events?)\b/i, 'Food for your event, planned with you from menu to service.'],
  // products
  [/\b(variety|pack|bundle|sampler|set)\b/i, 'A mix of the range in one order.'],
  [/\b(cleansers?)\b/i, 'A gentle cleanse for every day.'],
  [/\b(serums?)\b/i, 'Concentrated serums for targeted care.'],
  [/\b(moisturi[sz]ers?)\b/i, 'Daily moisture that sits comfortably on the skin.'],
  // software
  [/\b(online booking|booking|schedul\w*)\b/i, 'Clients book online at any hour, without a phone call.'],
  [/\b(reminders?|notifications?)\b/i, 'Automatic reminders sent before every appointment.'],
  [/\b(reports?|reporting|analytics|dashboards?)\b/i, 'Clear reports on what is working and what is not.'],
  [/\b(integrations?)\b/i, 'Connects with the tools you already use.'],
  [/\b(invoic\w*|billing|payments?)\b/i, 'Invoices and payments handled in one place.'],
];
const FLAVOURS = /\b(peach|cherry|citrus|lemon|lime|berry|berries|mango|grape|orange|mint|vanilla|chocolate|raspberry|strawberry|blueberry|watermelon|ginger|apple|coconut|pineapple|passionfruit)\b/i;
// Product facts the owner may state themselves -- carried through verbatim, never assumed.
const STATED_FACTS = [/\bzero sugar\b/i, /\bsugar[- ]free\b/i, /\bnatural (?:flavou?rs?|ingredients)\b/i, /\borganic\b/i, /\bvegan\b/i, /\bgluten[- ]free\b/i, /\bfragrance[- ]free\b/i, /\bcruelty[- ]free\b/i, /\bhandmade\b/i, /\bsmall[- ]batch\b/i, /\bfor sensitive skin\b/i];

const GROUP = {
  landscaping: 'crew', roofing: 'crew', renovation: 'crew', painting: 'crew', plumbing: 'crew', electrical: 'crew', cleaning: 'crew', automotive: 'crew',
  wellness: 'care', fitness: 'care', education: 'care',
  hospitality: 'venue', retail: 'range', fashion: 'range', tech: 'product', professional: 'advice', finance: 'advice',
};

function statedFacts(text) {
  const t = String(text || '');
  const out = [];
  STATED_FACTS.forEach(re => { const m = t.match(re); if (m && out.length < 2) out.push(m[0].toLowerCase()); });
  return out;
}
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);

// ctx: { categoryKey, name, place, text }
function describeOffering(label, ctx) {
  const c = ctx || {};
  const item = String(label || '').trim();
  if (!item) return '';
  const group = GROUP[c.categoryKey] || 'other';
  const flavour = (group === 'range' || /\b(drink|beverage|soda|juice|energy|tea|kombucha|candle)\b/i.test(c.text || '')) && item.match(FLAVOURS);
  if (flavour) {
    const facts = statedFacts(c.text);
    return `${cap(flavour[0].toLowerCase())} flavour${facts.length ? ` -- ${facts.join(', ')}` : ''}.`;
  }
  for (const [re, line] of LEXICON) if (re.test(item)) return line;
  const name = c.name ? String(c.name) : '';
  const place = c.place ? String(c.place) : '';
  switch (group) {
    case 'crew': return `${item}, planned and carried out by ${name ? `the ${name} team` : 'our own team'}${place ? ` across ${place}` : ''}.`;
    case 'care': return `${item}, one-to-one${name ? ` at ${name}` : ''}${place ? ` in ${place}` : ''}.`;
    case 'venue': return `${item}, served${name ? ` at ${name}` : ''}${place ? ` in ${place}` : ''}.`;
    case 'range': { const facts = statedFacts(c.text); return `${item}${name ? ` from the ${name} range` : ''}${facts.length ? ` -- ${facts.join(', ')}` : ''}.`; }
    case 'product': return `${item}, built into ${name || 'the product'}.`;
    case 'advice': return `${item}, handled directly${name ? ` by ${name}` : ''}.`;
    default: return `${item}${name ? ` from ${name}` : ''}${place ? ` in ${place}` : ''}.`;
  }
}

function esc(v) { return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }
// A menu of what the business actually offers -- replaces the invented
// "Starters / Mains / Desserts" groups and grey skeleton lines.
function renderMenuList(labels, ctx) {
  return `<ol class="menu-list">${(labels || []).map(l => `<li class="menu-item"><strong>${esc(l)}</strong><span class="menu-item-rule" aria-hidden="true"></span><p>${esc(describeOffering(l, ctx))}</p></li>`).join('')}</ol>`;
}

// The About statement in the owner's own words: the first sentence or two of
// the description they typed ("Fern & Flint is a specialty coffee roaster and
// cafe in Portland. Single-origin beans, pour-over bar and fresh pastries."),
// which is specific and true, instead of a category-wide line. null when the
// description is too thin to stand on its own (the caller keeps its fallback).
function ownWordsAbout(text) {
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  if (t.split(' ').length < 8) return null;
  const sentences = t.match(/[^.!?]+[.!?]+/g) || [t];
  let out = '';
  for (const s of sentences) { if ((out + s).length > 280) break; out += s; }
  out = (out || t.slice(0, 277) + '...').trim();
  if (!/[.!?]$/.test(out)) out += '.';
  return out.charAt(0).toUpperCase() + out.slice(1);
}

// A caption that names the business and what it offers -- used where a
// section had no copy of its own and used to repeat the hero's subheading.
function offeringsLine(name, place, offerings) {
  const items = (offerings || []).filter(Boolean).slice(0, 4);
  const who = [name, place].filter(Boolean).join(', ');
  if (!items.length) return who || null;
  return who ? `${who}: ${items.join(' · ')}` : items.join(' · ');
}

// The fallback FAQ, from the business itself: what it offers (and where), how
// to take the next step the way THIS kind of business actually converts, and
// where it is -- replacing "What does X actually do?" answered with a category
// tagline and "Is support included? Yes -- real help" on a clinic's site.
// Plain strings (the renderers escape). A planner's own FAQ items still win.
const NEXT_STEP = {
  care: ['How do I book?', "Book online or get in touch, and we'll find a time that suits you."],
  venue: ['How do I make a reservation?', "Get in touch or book ahead, and we'll have a place ready for you."],
  crew: ['How do I get a quote?', "Tell us about the job and where it is, and we'll come back with a clear quote."],
  range: ['How do I order?', 'Order online, and get in touch if you have a question about the range.'],
  product: ['How do I get started?', "Get in touch or sign up, and we'll help you get set up."],
  advice: ['How do I book a consultation?', "Get in touch, and we'll set up a first conversation."],
  other: ['How do I get started?', "Get in touch and we'll walk you through it."],
};
function listPhrase(items) { return items.length <= 1 ? (items[0] || '') : items.slice(0, -1).join(', ') + ' and ' + items[items.length - 1]; }
function faqItems(c) {
  const ctx = c || {};
  const name = ctx.name || '';
  const place = ctx.place || '';
  const offers = (ctx.offerings || []).filter(Boolean).slice(0, 5).map(o => String(o).toLowerCase());
  const group = GROUP[ctx.categoryKey] || 'other';
  const out = [];
  if (offers.length) out.push({ q: 'What does ' + (name || 'this business') + ' offer?', a: (name ? name + ' offers ' : 'We offer ') + listPhrase(offers) + (place ? ' in ' + place : '') + '.' });
  const next = NEXT_STEP[group] || NEXT_STEP.other;
  out.push({ q: next[0], a: next[1] });
  if (place) out.push({ q: 'Where are you based?', a: (name ? name + ' is' : "We're") + ' based in ' + place + '.' });
  else out.push({ q: 'What if I’m not sure this is right for me?', a: 'Get in touch -- we’re happy to talk through whether it’s a good fit.' });
  return out;
}

module.exports = { describeOffering, statedFacts, renderMenuList, ownWordsAbout, offeringsLine, faqItems, LEXICON };
