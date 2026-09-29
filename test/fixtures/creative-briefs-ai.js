'use strict';
// Creative AI-direction review briefs (CREATIVE_MODE.md "Verification"). Chosen BEFORE any prompt or
// renderer tuning for this round; all go through the same production path (understanding ->
// research -> pictures -> AI direction -> validation -> render). Nothing in lib/creative refers to
// any of them. Set B was chosen after the implementation, and is marked as such.
// "Bubbles" is SYNTHETIC test data (see creative/README.md); the page carries a TEST FIXTURE label.
const path = require('path');
const IMG = path.join(__dirname, 'creative');

const A = [
  { set: 'A', id: 'toilet-paper', brief: 'A website about toilet paper — make it grand and a bit absurd', edit: 'Two-ply. Twelve rolls. One destiny.', another: true },
  { set: 'A', id: 'zelda', brief: 'Zelda — make it feel like setting off on an adventure', choose: 'series' },
  {
    set: 'A', id: 'bubbles', brief: 'A celebration page for my goldfish Bubbles — make it fun',
    supplied: ['Bubbles has lived with our family since 2019.', 'He is a common goldfish with bright orange scales.', 'He races to the front of the tank whenever someone walks into the kitchen.', 'His favourite food is shelled peas, one at a time.'],
    memories: ['The week he learned to nudge his floating ball across the tank.', 'Moving house in 2022: he rode in a bucket on the back seat and did not seem bothered at all.'],
    uploads: [path.join(IMG, 'fixture-goldfish-cc0.jpg')],
    fixture: 'Synthetic test data: “Bubbles” and every detail about him are invented; the “uploaded” photo is a CC0 goldfish photo from Wikimedia Commons.',
    replaceWith: path.join(IMG, 'fixture-goldfish-pd.jpg'),
  },
  { set: 'A', id: 'tunguska', brief: 'The Tunguska event of 1908 — told seriously, with a sense of scale' },
];
// chosen after the implementation was finished (unseen during tuning; no prompt or renderer change was made for them)
const B = [
  { set: 'B', id: 'axolotl', brief: 'A page about axolotls — dreamy, soft and a little bit silly' },
  { set: 'B', id: 'distracted-boyfriend', brief: 'The distracted boyfriend meme, retold as a Shakespearean tragedy' },
  { set: 'B', id: 'rosetta', brief: 'The Rosetta Stone — restrained and scholarly' },
];

module.exports = A.concat(B);
module.exports.A = A; module.exports.B = B;
