'use strict';
// CREATE WEBSITE: which design a business is built on. The owner describes the business once; the router reads what
// it is (the realism engine's industry modules) and which designs can honestly carry it. A design only fits a
// business it can represent truthfully -- a pizzeria design is not a sushi bar, a barber shop is not a nail studio --
// so a business with no fitting design yet is told so and goes to the classic builder (the fallback), never forced
// into a design that would misrepresent it.
//
//   route(text) -> { industry: { id, label }, fits: [{ design, score, words }], best: design | null }
// Pure; no model calls.
const reality = require('./reality');
const { wordMatch } = require('./premium/grounding');

// what each design can truthfully represent (whole words, matched in the description)
const FIT = {
  aldane: ['watch', 'watches', 'watchmaker', 'watchmaking', 'timepiece', 'wristwatch', 'chronograph', 'horology', 'mechanical watch'],
  keel: ['roofing', 'roofer', 'roofers', 'roof', 'roofs', 'roof repair', 'roof replacement', 're-roof', 'reroof', 'reroofing', 'shingles', 'metal roofing', 'standing seam', 'cedar shake', 'roofing contractor'],
  lintel: ['real estate', 'realtor', 'realty', 'estate agent', 'listing', 'for sale', 'house for sale', 'home for sale', 'property listing', 'open house'],
  beadline: ['car detailing', 'detailing', 'auto detailing', 'ceramic coating', 'paint correction', 'paint protection film', 'ppf', 'car wash', 'valeting'],
  halcyra: ['perfume', 'perfumery', 'fragrance', 'fragrances', 'parfum', 'eau de parfum', 'cologne', 'scent'],
  steadyhand: ['barber', 'barbers', 'barbershop', 'barber shop', 'fade', 'beard trim', 'hot towel shave', "men's grooming"],
  nube: ['coffee shop', 'cafe', 'café', 'espresso bar', 'coffee bar', 'coffeehouse', 'specialty coffee'],
  ventricle: ['gym', 'strength club', 'fitness club', 'crossfit', 'boxing gym', 'training studio', 'hiit', 'spin studio', 'fitness studio'],
  forno: ['pizzeria', 'pizza', 'pizzas', 'wood-fired pizza', 'neapolitan pizza'],
  saltglass: ['dentist', 'dental', 'dental clinic', 'dental practice', 'orthodontist', 'teeth whitening', 'invisalign', 'hygienist'],
  kova: ['sneaker', 'sneakers', 'trainers', 'running shoe', 'running shoes', 'footwear', 'shoe drop', 'shoes'],
  clutch: ['brick set', 'building set', 'building bricks', 'brick kit', 'construction toy', 'model kit', 'toy', 'toys'],
  ondo: ['headphones', 'earbuds', 'headset', 'earphones', 'wireless audio', 'over-ear', 'noise cancelling', 'noise-cancelling'],
};
const ORDER = Object.keys(FIT);
// the kinds of business each design stands for: a word match from another kind ("booking software for barbers" is
// software, not a barbershop) is not a fit. 'other' (the realism engine found nothing more specific) never vetoes.
const KINDS = {
  aldane: ['watch', 'product', 'retail'], lintel: ['realestate', 'professional'], keel: ['trades'], beadline: ['trades', 'product', 'appointments'], halcyra: ['product', 'retail'],
  steadyhand: ['appointments'], nube: ['hospitality', 'retail'], ventricle: ['fitness'], forno: ['hospitality'], saltglass: ['appointments'],
  kova: ['product', 'retail'], clutch: ['product', 'retail'], ondo: ['product', 'retail'],
};

function route(text) {
  const t = String(text || '');
  const mod = reality.industries.detect(t);
  const fits = ORDER.map((design) => {
    const words = FIT[design].filter((w) => wordMatch(t, w));
    return { design, score: words.length, words };
  }).filter((f) => f.score > 0 && (mod.id === 'other' || KINDS[f.design].includes(mod.id))).sort((a, b) => b.score - a.score || ORDER.indexOf(a.design) - ORDER.indexOf(b.design));
  return { industry: { id: mod.id, label: mod.label }, fits, best: fits.length ? fits[0].design : null };
}

module.exports = { route, FIT, KINDS };
