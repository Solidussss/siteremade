'use strict';
// Art-direction review briefs (test/review/creative-art-qa.js): eight deliberately different subjects and registers, run
// through the REAL studio (real Wikipedia / Wikimedia Commons research, the pictures read in the browser, the built-in
// art director -- no model is called), saved, reopened and exported. The point is visible diversity: if these read as
// one template in different clothes, the generator is not done. `another` runs "Try another direction" on the reopened
// page to show the same prompt producing a different recipe.
const path = require('path');
const IMG = path.join(__dirname, 'creative');

module.exports = [
  // (Commons has no picture the rules-only search accepts for this meme: the owner uploads one -- a CC BY-SA photo, labelled as a fixture)
  { id: 'grumpy-shrine', brief: 'An absurd shrine to Grumpy Cat, the internet meme -- grand, ridiculous, reverent', uploads: [path.join(IMG, 'fixture-grumpy-cat-ccbysa.jpg')], main: true, gate: 'pick', another: true,
    fixture: 'Test fixture: the "uploaded" picture is a CC BY-SA 3.0 photo by Gage Skidmore from Wikimedia Commons.' },
  { id: 'birkin', brief: 'Birkin bag -- a quiet, expensive luxury fashion page', gate: 'pick' },
  { id: 'eno', brief: 'An experimental page for Brian Eno, the ambient music pioneer', gate: 'pick' },
  { id: 'quantum', brief: 'A futuristic page about quantum computers', gate: 'pick', another: true },
  { id: 'great-wave', brief: 'The Great Wave off Kanagawa -- an editorial magazine long-read', gate: 'pick' },
  { id: 'doughnuts', brief: 'A playful page about doughnuts', gate: 'pick', another: true },
  { id: 'metropolis', brief: 'A cinematic page for the 1927 film Metropolis', gate: 'pick' },
  { id: 'brutalism', brief: 'Brutalist architecture -- a raw, brutalist art project', gate: 'pick', choose: 'Brutalist architecture' },
];
