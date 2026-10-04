'use strict';
// CREATIVE -- THE DIRECTION ASKS: a few quick questions the studio puts to the owner before a page is made, so the page
// starts in the direction they want instead of the one the brief happened to suggest. Fixed questions, tap to answer,
// any of them may be left open ("the director chooses"); nothing here calls a model.
//
// Each answer steers what already exists -- never a new system:
//   - the art direction's own preference (art.choose input.prefer: personality, mode, family), so the recipe the page is
//     built on leans that way (a family the pictures cannot carry is still never forced: art.js familyFits decides);
//   - one line to the director (ai.js directContent ownerDirection), in words.
//
//   QUESTIONS                -> what the studio shows (ids, labels, hints)
//   normalise(raw)           -> { mood?, motion?, lead?, colour? } -- only known answers
//   prefer(answers)          -> { personality?, mode?, family? } for art.choose
//   words(answers)           -> the owner's direction in a sentence ('' when nothing was chosen)
//   guess(brief)             -> answers the brief already gives (the studio pre-selects them)

const QUESTIONS = [
  { id: 'mood', title: 'How should it feel?', options: [
    { id: 'bold', label: 'Bold and loud', hint: 'campaign energy, huge type, colour floods', prefer: { personality: 'kinetic' }, words: 'bold and loud -- campaign energy, huge type, colour floods' },
    { id: 'premium', label: 'Clean and premium', hint: 'space, restraint, the product as the jewel', prefer: { personality: 'luxe' }, words: 'clean and premium -- space, restraint, the subject as the jewel' },
    { id: 'cinematic', label: 'Dark and cinematic', hint: 'full-screen pictures, dramatic light', prefer: { personality: 'cinematic' }, words: 'dark and cinematic -- full-screen pictures, dramatic light, like a film trailer' },
    { id: 'playful', label: 'Playful', hint: 'bright, bouncy, fun', prefer: { personality: 'playful' }, words: 'playful -- bright, bouncy and fun' },
  ] },
  { id: 'motion', title: 'How much should it move?', options: [
    { id: 'calm', label: 'Calm', hint: 'scrolls like a magazine', prefer: { mode: 'editorial' }, words: 'calm motion -- it scrolls like a beautiful magazine' },
    { id: 'scroll', label: 'Moves as you scroll', hint: 'scenes that move and hand over', prefer: { mode: 'expressive' }, words: 'motion as you scroll -- scenes that move and hand over to each other' },
    { id: 'show', label: 'Full show', hint: 'big scroll set-pieces', prefer: { mode: 'immersive' }, words: 'a full show -- big held scroll set-pieces, one continuous experience' },
  ] },
  { id: 'lead', title: 'What should lead?', options: [
    { id: 'product', label: 'The product, big', hint: 'carried through the page', prefer: { family: 'object-story' }, words: 'the product leads -- shown big and carried through the page' },
    { id: 'name', label: 'The name, huge', hint: 'monumental type', prefer: { family: 'typography-led' }, words: 'the name leads -- monumental type' },
    { id: 'photos', label: 'Full-screen photos', hint: 'the pictures take the screen', prefer: { family: 'cinematic-chapters' }, words: 'the pictures lead -- full-screen photographs' },
  ] },
  { id: 'colour', title: 'Colour?', options: [
    { id: 'brand', label: 'Its own colours', hint: 'from the logo and pictures', words: "its own colours -- from the logo and the pictures" },
    { id: 'dark', label: 'Dark', hint: 'deep, rich backgrounds', words: 'a dark page -- deep, rich backgrounds' },
    { id: 'light', label: 'Light and airy', hint: 'bright, open backgrounds', words: 'a light and airy page -- bright, open backgrounds' },
  ] },
];
const BY = new Map(QUESTIONS.map(q => [q.id, new Map(q.options.map(o => [o.id, o]))]));

function normalise(raw) {
  const out = {}; if (!raw || typeof raw !== 'object') return out;
  QUESTIONS.forEach(q => { const v = raw[q.id]; if (typeof v === 'string' && BY.get(q.id).has(v)) out[q.id] = v; });
  return out;
}
function prefer(answers) {
  const a = normalise(answers); const p = {};
  Object.keys(a).forEach(k => Object.assign(p, BY.get(k).get(a[k]).prefer || {}));
  return p;
}
function words(answers) {
  const a = normalise(answers); const parts = QUESTIONS.filter(q => a[q.id]).map(q => BY.get(q.id).get(a[q.id]).words);
  return parts.length ? `The owner chose this direction before the page was made -- follow it: ${parts.join('; ')}.` : '';
}
// (what the brief already says: a word in it answers the question, so the studio shows it chosen)
const GUESS = [
  ['mood', 'cinematic', /\b(cinematic|moody|dark|dramatic|trailer|film)\b/i], ['mood', 'premium', /\b(premium|luxur\w*|elegant|minimal|clean|quiet)\b/i],
  ['mood', 'playful', /\b(playful|fun|silly|cute|absurd|whimsical)\b/i], ['mood', 'bold', /\b(bold|loud|punchy|campaign|energetic|high energy)\b/i],
  ['motion', 'show', /\b(immersive|set-?pieces?|epic|experience)\b/i], ['motion', 'calm', /\b(calm|simple|magazine|editorial)\b/i],
  ['lead', 'product', /\b(show the (can|bottle|product)|product big|carry it)\b/i], ['lead', 'photos', /\bfull[- ]screen (images|photos|pictures)\b/i], ['lead', 'name', /\b(huge|giant|massive) (words|type|name)\b/i],
  ['colour', 'dark', /\bdark\b/i], ['colour', 'light', /\b(light and airy|bright and airy|airy|light page)\b/i],
];
function guess(brief) {
  const out = {}; const b = String(brief || '');
  GUESS.forEach(([q, o, re]) => { if (!out[q] && re.test(b)) out[q] = o; });
  return out;
}

module.exports = { QUESTIONS, normalise, prefer, words, guess };
