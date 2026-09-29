'use strict';
// Creative character acceptance briefs (CREATIVE_MODE.md "Verification"): six recognizable franchise characters, each
// with its own visual direction, through the same production pipeline. Nothing in lib/creative refers to any of them.
// The main visual must be the character's own depiction (artwork, render, sprite, show or game still) -- never a
// cosplayer, figure, merchandise, painted vehicle, logo or shapes standing in for it. If no such picture can be used
// automatically, the studio stops at the missing-imagery gate BEFORE any paid direction ('stop'): the run records what
// was found, where it stopped and why, and spends nothing on a substitute page. If a clarification is asked, the harness
// answers with the character (choose).
module.exports = [
  { set: 'C', id: 'link', choose: 'link', brief: 'Link from The Legend of Zelda — a cinematic adventure through forests and ancient ruins, with Link himself as the focal subject', gate: 'stop' },
  { set: 'C', id: 'kirby', choose: 'kirby', brief: 'Kirby — playful, colourful and rounded, with energetic but controlled motion', gate: 'stop' },
  { set: 'C', id: 'pikachu', choose: 'pikachu', brief: 'Pikachu from Pokémon — a bold electric atmosphere, yellow and black contrast, and movement led by Pikachu', gate: 'stop' },
  { set: 'C', id: 'bmo', choose: 'bmo', brief: 'BMO from Adventure Time — charming, playful and all about BMO (its screen can matter, but this is not a software dashboard)', gate: 'stop' },
  { set: 'C', id: 'spongebob', choose: 'spongebob', brief: 'SpongeBob SquarePants — an expressive underwater world, SpongeBob himself front and centre, intentionally playful', gate: 'stop' },
  { set: 'C', id: 'silver-surfer', choose: 'silver surfer', brief: 'The Silver Surfer from Marvel — a dramatic cosmic composition, the metallic Surfer himself, space and flowing movement', gate: 'stop' },
];
