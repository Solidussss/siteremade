'use strict';
// Creative completion review (CREATIVE_MODE.md "Verification"). The same real pipeline for every case; nothing in
// lib/creative refers to any of them.
// A: the reported Pokémon failure (a Pokémon-painted airplane became the page; then abstract shapes). If the studio
//    stops for missing artwork, the request it shows is recorded, then the owner chooses an abstract page.
// S: Zelda with the owner's picture chosen as the main subject (a labelled test fixture): it must lead the page.
// K: pages that already worked (a floating object cutout; a personal page with a photo replacement) -- kept, not lost.
// U: unfamiliar subjects chosen after this round's fixes were finished; never used while building them.
const path = require('path');
const IMG = path.join(__dirname, 'creative');

module.exports = [
  { set: 'A', id: 'pokemon', brief: 'Generation I Pokémon — the original 151, bright and nostalgic', gate: 'abstract' },
  {
    set: 'S', id: 'zelda-main', brief: 'Zelda — make it feel like setting off on an adventure', choose: 'series', main: true,
    uploads: [path.join(IMG, 'fixture-zelda-botw-cosplay-ccby.jpg')],
    fixture: 'Supplied-artwork test: the “uploaded” main picture stands in for the owner\'s artwork — a CC BY 2.0 cosplay photo from Wikimedia Commons (Stéphane Gallay).',
  },
  { set: 'K', id: 'toilet-paper', brief: 'A website about toilet paper — make it grand and a bit absurd', edit: 'Two-ply. Twelve rolls. One destiny.' },
  {
    set: 'K', id: 'bubbles', brief: 'A celebration page for my goldfish Bubbles — make it fun',
    supplied: ['Bubbles has lived with our family since 2019.', 'He is a common goldfish with bright orange scales.', 'He races to the front of the tank whenever someone walks into the kitchen.', 'His favourite food is shelled peas, one at a time.'],
    memories: ['The week he learned to nudge his floating ball across the tank.', 'Moving house in 2022: he rode in a bucket on the back seat and did not seem bothered at all.'],
    uploads: [path.join(IMG, 'fixture-goldfish-cc0.jpg')],
    fixture: 'Synthetic test data: “Bubbles” and every detail about him are invented; the “uploaded” photo is a CC0 goldfish photo from Wikimedia Commons.',
    replaceWith: path.join(IMG, 'fixture-goldfish-pd.jpg'),
  },
  { set: 'U', id: 'tamagotchi', brief: 'Tamagotchi — the 90s pocket pet, nostalgic and cheerful', gate: 'stop' },
  { set: 'U', id: 'voynich', brief: 'The Voynich manuscript — cryptic, scholarly, a little eerie', gate: 'stop' },
];
