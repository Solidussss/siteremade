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
    ['A sushi bar in Seattle', null],
    ['Roofing contractor in Austin', 'keel'],
    ['We replace roofs: asphalt shingles and standing seam metal', 'keel'],
    ['Roofing software for contractors', 'plait'],
    ['A SaaS tool that pulls email and Slack into one task list', 'plait'],
    ['Booking software for barbers', 'plait'],
    ['A nail salon', null],
    ['An organic skincare brand', null],
    ['A law firm for tenants', null],
  ];
  for (const [t, want] of cases) assert.equal(route(t).best, want, t);
  const r = route('Booking software for barbers');
  assert.equal(r.industry.id, 'software'); assert.deepEqual(r.fits.map((f) => f.design), ['plait'], 'the barber words do not make software a barbershop');
});
