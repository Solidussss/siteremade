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
  plait: ['saas', 'software', 'app', 'apps', 'platform', 'web app', 'b2b', 'startup', 'productivity', 'workflow', 'project management', 'task management', 'crm', 'api', 'dashboard', 'integrations', 'subscription software'],
  ochre: ['hair salon', 'hair salons', 'hairdresser', 'hairdressers', 'hairdressing', 'colourist', 'colorist', 'colour salon', 'color salon', 'balayage', 'highlights', 'blow-dry', 'blowout', 'hair colour', 'hair color', 'hair stylist', 'hairstylist', 'curl specialist'],
  larder: ['restaurant', 'restaurants', 'bistro', 'brasserie', 'trattoria', 'osteria', 'tavern', 'gastropub', 'eatery', 'diner', 'fine dining', 'tasting menu', 'dinner', 'supper club', 'seafood', 'sushi', 'sushi bar', 'ramen', 'noodle bar', 'tapas', 'curry house', 'steakhouse', 'grill', 'kitchen and bar'],
  halden: ['law firm', 'solicitor', 'solicitors', 'lawyer', 'lawyers', 'attorney', 'attorneys', 'legal services', 'conveyancing', 'barrister', 'notary', 'accountant', 'accountants', 'accountancy', 'accounting firm', 'bookkeeping', 'bookkeeper', 'tax return', 'tax returns', 'tax advisor', 'tax adviser', 'cpa', 'chartered accountant', 'payroll services', 'probate', 'estate planning'],
  sereine: ['skincare', 'skin care', 'serum', 'serums', 'moisturiser', 'moisturizer', 'face cream', 'face oil', 'face oils', 'cleanser', 'beauty brand', 'clean beauty', 'cosmetics', 'retinol', 'vitamin c serum', 'spf', 'sunscreen', 'body lotion'],
  fettle: ['plumber', 'plumbers', 'plumbing', 'electrician', 'electricians', 'electrical', 'heating engineer', 'heating', 'boiler', 'boilers', 'boiler repair', 'gas engineer', 'hvac', 'air conditioning', 'drain', 'drains', 'emergency plumber', 'emergency electrician', 'rewire', 'rewiring'],
  brisk: ['cleaning', 'cleaner', 'cleaners', 'cleaning company', 'cleaning service', 'cleaning services', 'house cleaning', 'home cleaning', 'house cleaner', 'domestic cleaning', 'domestic cleaner', 'deep clean', 'deep cleaning', 'end of tenancy', 'move-out cleaning', 'move out cleaning', 'maid', 'maids', 'maid service', 'janitorial', 'office cleaning', 'commercial cleaning', 'carpet cleaning'],
  verge: ['landscaping', 'landscaper', 'landscapers', 'landscape gardener', 'landscape gardeners', 'landscape design', 'landscape designer', 'landscape contractor', 'garden design', 'garden designer', 'gardener', 'gardeners', 'gardening', 'garden maintenance', 'garden care', 'lawn care', 'lawn', 'lawns', 'turfing', 'paving', 'patios', 'hardscaping', 'hardscape', 'hedge trimming', 'yard work', 'backyard', 'planting design', 'garden makeover'],
  camber: ['car garage', 'independent garage', 'local garage', 'family garage', 'motor garage', 'garage services', 'car repair', 'car repairs', 'auto repair', 'auto shop', 'auto service', 'mechanic', 'mechanics', 'car mechanic', 'car service', 'car servicing', 'mot', 'mot centre', 'mot center', 'mot testing', 'oil change', 'brake repair', 'brake pads', 'tyre fitting', 'tire shop', 'car maintenance', 'vehicle repair', 'van servicing', 'clutch repair', 'transmission repair', 'car diagnostics'],
  northlight: ['photographer', 'photographers', 'photography', 'photo studio', 'photography studio', 'wedding photographer', 'wedding photography', 'portrait photographer', 'portrait photography', 'portraits', 'headshots', 'family photographer', 'newborn photographer', 'product photographer', 'product photography', 'brand photography', 'event photographer', 'photoshoot', 'photo shoot'],
  stillwater: ['yoga', 'yoga studio', 'yoga classes', 'hot yoga', 'vinyasa', 'yin yoga', 'pilates', 'pilates studio', 'reformer', 'reformer pilates', 'mat pilates', 'barre', 'personal trainer', 'personal training', 'small group training', 'fitness classes', 'meditation', 'breathwork', 'stretch classes'],
  axis: ['physio', 'physiotherapy', 'physiotherapist', 'physical therapy', 'physical therapist', 'chiropractor', 'chiropractic', 'osteopath', 'osteopathy', 'sports massage', 'massage therapist', 'massage therapy', 'remedial massage', 'sports injury', 'sports injuries', 'injury clinic', 'rehab', 'rehabilitation', 'back pain', 'acupuncture', 'sports therapist'],
  scruff: ['dog groomer', 'dog groomers', 'dog grooming', 'groomer', 'groomers', 'pet grooming', 'pet groomer', 'dog salon', 'grooming salon', 'mobile groomer', 'mobile dog grooming', 'dog spa', 'cat grooming', 'vet', 'vets', 'veterinary', 'veterinarian', 'vet practice', 'animal clinic', 'animal hospital', 'pet clinic'],
  proof: ['bakery', 'bakeries', 'bakehouse', 'baker', 'bakers', 'sourdough', 'bread', 'artisan bread', 'patisserie', 'pastry', 'pastries', 'cake maker', 'cake makers', 'cake shop', 'cake studio', 'celebration cakes', 'custom cakes', 'wedding cakes', 'birthday cakes', 'cupcakes', 'cupcake'],
  inkwell: ['tattoo', 'tattoos', 'tattoo studio', 'tattoo studios', 'tattoo parlour', 'tattoo parlor', 'tattoo shop', 'tattoo artist', 'tattoo artists', 'tattooist', 'tattooer', 'flash tattoos', 'fine line tattoo', 'fine-line tattoo', 'blackwork'],
  petal: ['florist', 'florists', 'flower shop', 'flower shops', 'flowers', 'flower delivery', 'bouquet', 'bouquets', 'floristry', 'wedding flowers', 'event flowers', 'flower farm', 'floral design', 'floral designer', 'flower arranging'],
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
  aldane: ['watch', 'product', 'retail'], lintel: ['realestate', 'professional'], keel: ['trades'], plait: ['software'], ochre: ['appointments', 'hospitality'], larder: ['hospitality'], halden: ['professional'], sereine: ['product', 'retail'], fettle: ['trades'], brisk: ['trades', 'appointments'], verge: ['trades'], camber: ['trades', 'appointments', 'retail'], northlight: ['creative', 'appointments'], stillwater: ['fitness', 'appointments'], axis: ['appointments', 'fitness'], scruff: ['appointments', 'trades'], proof: ['hospitality', 'retail', 'product'], inkwell: ['appointments', 'creative', 'retail'], petal: ['retail', 'product', 'creative'], beadline: ['trades', 'product', 'appointments'], halcyra: ['product', 'retail'],
  steadyhand: ['appointments'], nube: ['hospitality', 'retail'], ventricle: ['fitness'], forno: ['hospitality'], saltglass: ['appointments'],
  kova: ['product', 'retail'], clutch: ['product', 'retail'], ondo: ['product', 'retail'],
};

// designs for a whole kind of business (any restaurant): on a tie they give way to the specialist (a pizzeria, a cafe)
const GENERAL = new Set(['larder', 'proof']);

function route(text) {
  const t = String(text || '');
  const mod = reality.industries.detect(t);
  const fits = ORDER.map((design) => {
    const words = FIT[design].filter((w) => wordMatch(t, w));
    return { design, score: words.length, words };
  }).filter((f) => f.score > 0 && (mod.id === 'other' || KINDS[f.design].includes(mod.id))).sort((a, b) => b.score - a.score || GENERAL.has(a.design) - GENERAL.has(b.design) || ORDER.indexOf(a.design) - ORDER.indexOf(b.design));
  return { industry: { id: mod.id, label: mod.label }, fits, best: fits.length ? fits[0].design : null };
}

module.exports = { route, FIT, KINDS };
