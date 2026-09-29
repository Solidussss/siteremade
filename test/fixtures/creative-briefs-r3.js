'use strict';
// Creative stage-3 review briefs (CREATIVE_MODE.md "Verification"). Chosen before any real run of this round.
// R: the same briefs as before, to reproduce the stage-2 defects and compare before/after.
// U: unfamiliar subjects, chosen after the implementation was finished and never used while building it;
//    "backrooms" is expected to be asset-poor (the original photograph is not freely licensed).
// S: the fictional subject again, with SUPPLIED artwork (a labelled test fixture) -- reported separately:
//    success with an upload does not prove automatic sourcing works.
// Nothing in lib/creative refers to any of them.
const path = require('path');
const IMG = path.join(__dirname, 'creative');

const R = [
  { set: 'R', id: 'zelda', brief: 'Zelda — make it feel like setting off on an adventure', choose: 'series' },
  { set: 'R', id: 'toilet-paper', brief: 'A website about toilet paper — make it grand and a bit absurd', edit: 'Two-ply. Twelve rolls. One destiny.' },
  { set: 'R', id: 'distracted-boyfriend', brief: 'The distracted boyfriend meme, retold as a Shakespearean tragedy' },
  {
    set: 'R', id: 'bubbles', brief: 'A celebration page for my goldfish Bubbles — make it fun',
    supplied: ['Bubbles has lived with our family since 2019.', 'He is a common goldfish with bright orange scales.', 'He races to the front of the tank whenever someone walks into the kitchen.', 'His favourite food is shelled peas, one at a time.'],
    memories: ['The week he learned to nudge his floating ball across the tank.', 'Moving house in 2022: he rode in a bucket on the back seat and did not seem bothered at all.'],
    uploads: [path.join(IMG, 'fixture-goldfish-cc0.jpg')],
    fixture: 'Synthetic test data: “Bubbles” and every detail about him are invented; the “uploaded” photo is a CC0 goldfish photo from Wikimedia Commons.',
    replaceWith: path.join(IMG, 'fixture-goldfish-pd.jpg'),
  },
];
const U = [
  { set: 'U', id: 'antikythera', brief: 'The Antikythera mechanism — precise, mysterious, a little awe-struck' },
  { set: 'U', id: 'backrooms', brief: 'The Backrooms — the internet\'s endless yellow rooms; make it quietly unsettling' },
];
const S = [
  {
    set: 'S', id: 'zelda-art', brief: 'Zelda — make it feel like setting off on an adventure', choose: 'series',
    uploads: [path.join(IMG, 'fixture-zelda-botw-cosplay-ccby.jpg')],
    fixture: 'Supplied-artwork test: the “uploaded” picture stands in for the owner\'s artwork — it is a CC BY 2.0 cosplay photo from Wikimedia Commons (Stéphane Gallay).',
  },
];

module.exports = R.concat(U, S);
module.exports.R = R; module.exports.U = U; module.exports.S = S;
