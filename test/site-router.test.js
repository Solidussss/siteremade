'use strict';
// CREATE WEBSITE (lib/site-router.js): a business goes to the design that can show it truthfully, or to the classic
// builder when none can -- never into a design that would misrepresent it.
const test = require('node:test');
const assert = require('node:assert/strict');
const { route, FIT, KINDS } = require('../lib/site-router');
const designs = require('../lib/design-sites').designs().map((d) => d.design);

test('every design has fit words and kinds of business', () => {
  assert.deepEqual(Object.keys(FIT).sort(), designs.slice().sort());
  assert.deepEqual(Object.keys(KINDS).sort(), designs.slice().sort());
});

test('each kind of business reaches its design; others are told none fits', () => {
  const cases = [
    ['Meridian 38: a hand-wound three-hand watch with a 42-hour power reserve', 'aldane'],
    ['A neighbourhood barbershop in Leeds: fades and hot towel shaves', 'steadyhand'],
    ['A Neapolitan pizzeria with a wood-fired oven', 'forno'],
    ['A 3 bed house for sale in Portland, open house Saturday', 'lintel'],
    ['Noise-cancelling headphones from a new audio brand', 'ondo'],
    ['A specialty coffee shop and bakery', 'nube'],
    ['Running shoes drop: the Drift 2', 'kova'],
    ['Mobile car detailing and ceramic coating in Leeds', 'beadline'],
    ['Family dental practice, whitening and Invisalign', 'saltglass'],
    ['A small-batch perfume house', 'halcyra'],
    ['Strength gym with coached classes', 'ventricle'],
    ['A brick building set of a lunar lander', 'clutch'],
    ['A sushi bar in Seattle', 'larder'],
    ['A neighbourhood bistro with a seasonal menu', 'larder'],
    ['A pizza restaurant in Naples', 'forno'],
    ['A cafe and brunch restaurant', 'nube'],
    ['Roofing contractor in Austin', 'keel'],
    ['Plumber in Bristol, boiler repairs and leaks', 'fettle'],
    ['Emergency electrician', 'fettle'],
    ['House cleaning in North London, regular and deep cleans', 'brisk'],
    ['End of tenancy cleaning company in Manchester', 'brisk'],
    ['Maid service in Austin', 'brisk'],
    ['Landscaping and garden design in Surrey', 'verge'],
    ['Landscape gardener, patios and lawns', 'verge'],
    ['Garden maintenance and lawn care', 'verge'],
    ['Independent garage in Manchester, MOTs and servicing', 'camber'],
    ['Auto repair shop in Phoenix', 'camber'],
    ['Mobile mechanic', 'camber'],
    ['Wedding photographer in Edinburgh', 'northlight'],
    ['Product photography for ecommerce brands', 'northlight'],
    ['Family portraits and headshots', 'northlight'],
    ['Yoga studio in Brighton', 'stillwater'],
    ['Reformer pilates studio', 'stillwater'],
    ['Personal trainer and small group training', 'stillwater'],
    ['Physiotherapy clinic in Leeds', 'axis'],
    ['Chiropractor in Austin', 'axis'],
    ['Sports massage therapist', 'axis'],
    ['Dog grooming salon in Bristol', 'scruff'],
    ['Mobile dog groomer', 'scruff'],
    ['Veterinary clinic', 'scruff'],
    ['Sourdough bakery in Oxford', 'proof'],
    ['Celebration cake maker', 'proof'],
    ['Artisan bakery and patisserie', 'proof'],
    ['Pizzeria with wood-fired bread', 'forno'],
    ['Coffee shop with pastries', 'nube'],
    ['Florist in Hackney', 'petal'],
    ['Wedding florist', 'petal'],
    ['Flower delivery shop', 'petal'],
    ['We replace roofs: asphalt shingles and standing seam metal', 'keel'],
    ['Roofing software for contractors', 'plait'],
    ['A SaaS tool that pulls email and Slack into one task list', 'plait'],
    ['Booking software for barbers', 'plait'],
    ['A nail salon', null],
    ['A hair salon in Brighton doing balayage and glosses', 'ochre'],
    ['Hairdresser and colourist for curly hair', 'ochre'],
    ['An organic skincare brand', 'sereine'],
    ['A vitamin C serum from a new beauty brand', 'sereine'],
    ['A law firm for tenants', 'halden'],
    ['Accountants for small businesses in Leeds', 'halden'],
    ['A CPA firm doing tax returns', 'halden'],
  ];
  for (const [t, want] of cases) assert.equal(route(t).best, want, t);
  const r = route('Booking software for barbers');
  assert.equal(r.industry.id, 'software'); assert.deepEqual(r.fits.map((f) => f.design), ['plait'], 'the barber words do not make software a barbershop');
});
