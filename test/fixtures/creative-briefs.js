'use strict';
// The Creative mode proof briefs (CREATIVE_MODE.md "Verification"). All four go through the
// same pipeline; nothing in lib/creative refers to any of them. `rubber-ducks` was fixed
// before the first run and never used while tuning (the unseen brief).
// The personal brief is SYNTHETIC FIXTURE DATA: "Bubbles" and every detail about him are
// invented for testing, and his "uploaded" photo is a CC0 goldfish photo from Wikimedia
// Commons (File:Goldfish, which has been brought up for about 15 years.JPG) standing in for
// an owner's own picture. The page itself carries a visible TEST FIXTURE label.
const path = require('path');
const IMG = path.join(__dirname, 'creative');

module.exports = [
  { id: 'toilet-paper', brief: 'A website about toilet paper — make it grand and a bit absurd', edit: 'Two-ply. Twelve rolls. One destiny.', remove: true },
  { id: 'sherlock', brief: 'Sherlock Holmes fan site, cinematic and moody' },
  {
    id: 'bubbles', brief: 'A celebration page for my goldfish Bubbles — make it fun',
    supplied: ['Bubbles has lived with our family since 2019.', 'He is a common goldfish with bright orange scales.', 'He races to the front of the tank whenever someone walks into the kitchen.', 'His favourite food is shelled peas, one at a time.'],
    memories: ['The week he learned to nudge his floating ball across the tank.', 'Moving house in 2022: he rode in a bucket on the back seat and did not seem bothered at all.'],
    uploads: [path.join(IMG, 'fixture-goldfish-cc0.jpg')],
    fixture: 'Synthetic test data: “Bubbles” and every detail about him are invented; the “uploaded” photo is a CC0 goldfish photo from Wikimedia Commons.',
    replaceWith: path.join(IMG, 'fixture-goldfish-pd.jpg'),
  },
  { id: 'rubber-ducks', brief: 'A fun page about rubber ducks' },
];
