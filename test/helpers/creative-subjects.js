'use strict';
// SIX VERY DIFFERENT CREATIVE SUBJECTS for the art-direction regression and the browser review (test/creative-direction.test.js,
// test/review/creative-direction-review.js): a beverage (the cola of test/helpers/brand-fixture.js), a sneaker, a piece of
// software, a car, a luxury skincare serum and an editorial/personal portfolio -- each with the pictures a real page would
// have, measured the way the studio measures them (assets.js), so the director, the validator, the critique and the renderer
// see what a real page would. Every brand is invented; nothing in the code knows any of them by name.
const B = require('./brand-fixture');
const { A, ms, R } = B;
const cut = (of, title, w, h, cols) => A(`c-${of}`, { origin: 'derived', cutout: true, cutoutOf: of, title, caps: { moveFreely: true, frame: false, backdrop: false, heroSize: true }, assess: ms(w, h, '#ffffff', cols, [0.02, 0.02, 0.98, 0.98], { transparent: true, transparentShare: 0.45, background: { colour: '#ffffff', uniformity: 0, tolerance: 0 } }) });
const main = (id, title, depicts, w, h, bg, cols, subject) => A(id, { title, ownerRole: 'main', curation: { role: 'subject', identity: 'exact', depicts, issues: [] }, assess: ms(w, h, bg, cols, subject, { background: { colour: bg, uniformity: 0.93, tolerance: 22 } }) });
const logo = (id, cols) => A(id, { title: `${id}`, ownerRole: 'logo', relevance: 0, assess: ms(600, 200, '#ffffff', cols, [0.02, 0.1, 0.98, 0.9], { transparent: true }) });
const und = (name, brief, type, what, register, extra) => Object.assign({ kind: 'recognizable', subject: name, name, brief, tone: { register }, identity: { name, kind: 'recognizable', type, what }, visuals: { main: `the ${name} ${what}` } }, extra || {});
const facts = (name, lines) => lines.map((text, i) => ({ id: `f${i + 1}`, text: text.replace(/\$NAME/g, name), section: 'x' }));

const SUBJECTS = {
  beverage: { id: 'beverage', genre: 'product', label: 'Kolaro cola', understanding: B.UND, facts: B.FACTS, assets: B.ASSETS, mainAsset: 'can' },
  sneaker: {
    id: 'sneaker', genre: 'fashion', label: 'Vantage sneaker', mainAsset: 'shoe',
    understanding: und('Vantage Runner', 'A launch website for the Vantage Runner, a lightweight running sneaker with a carbon plate', 'product', 'running sneaker', 'energetic'),
    facts: facts('Vantage Runner', ['The $NAME has a full-length carbon plate.', 'The $NAME weighs 198 grams.', 'The $NAME upper is a single knitted piece.']),
    assets: [main('shoe', 'vantage runner', 'a white running sneaker with an orange sole, side view', 1600, 1000, '#efefef', ['#f2f2f2', '#ff5a1f', '#1b1b1b'], [0.12, 0.25, 0.88, 0.8]), cut('shoe', 'vantage runner', 1500, 820, ['#f2f2f2', '#ff5a1f', '#1b1b1b']),
      R('sole', 'carbon sole', 'close-up of a carbon running shoe sole', ms(1400, 1400, '#151515', ['#151515', '#ff5a1f', '#7a7a7a'], [0.15, 0.2, 0.85, 0.8])),
      R('track', 'running track', 'a runner on a red running track at dawn', ms(1800, 1000, '#b5452e', ['#b5452e', '#f0d2b0', '#2a2a2a'], [0.35, 0.2, 0.65, 0.95])),
      R('knit', 'knit upper', 'macro of a knitted shoe upper', ms(1200, 1500, '#e8e3dc', ['#e8e3dc', '#ff5a1f', '#bdb6ad'], [0.1, 0.1, 0.9, 0.9])), logo('vantage-logo', ['#ff5a1f', '#111111'])],
  },
  software: {
    id: 'software', genre: 'tech', label: 'Orbitly app', mainAsset: 'app',
    understanding: und('Orbitly', 'A website for Orbitly, project planning software for small design teams, with a timeline view and live collaboration', 'software', 'project planning software', 'serious'),
    facts: facts('Orbitly', ['$NAME shows every project on one timeline.', '$NAME updates live while the team edits.', '$NAME works in the browser and on iPad.']),
    assets: [main('app', 'orbitly timeline', 'a laptop showing a colourful project timeline interface', 1600, 1000, '#0f1424', ['#0f1424', '#6c7cff', '#f4f6ff'], [0.1, 0.12, 0.9, 0.9]),
      R('team', 'design team', 'a small design team around a table with laptops', ms(1600, 1066, '#d9d4cc', ['#d9d4cc', '#3a3a3a', '#6c7cff'], [0.1, 0.2, 0.9, 0.95])),
      R('tablet', 'tablet view', 'a tablet showing a project board on a desk', ms(1400, 1050, '#f1f1ef', ['#f1f1ef', '#6c7cff', '#262626'], [0.2, 0.15, 0.8, 0.85])),
      R('detail', 'interface detail', 'close-up of interface cards and a cursor', ms(1200, 1200, '#0f1424', ['#0f1424', '#6c7cff', '#ff8a5b'], [0.1, 0.1, 0.9, 0.9])), logo('orbitly-logo', ['#6c7cff', '#0f1424'])],
  },
  automotive: {
    id: 'automotive', genre: 'product', label: 'Halden GT', mainAsset: 'car',
    understanding: und('Halden GT', 'A launch website for the Halden GT, an electric grand tourer coupe', 'product', 'electric grand tourer car', 'cinematic'),
    facts: facts('Halden GT', ['The $NAME is an electric grand tourer.', 'The $NAME has a 620 km range.', 'The $NAME reaches 100 km/h in 3.4 seconds.']),
    assets: [main('car', 'halden gt', 'a dark blue electric coupe, three-quarter front view', 1800, 1000, '#d8dde3', ['#1c2a44', '#d8dde3', '#9aa7b8'], [0.08, 0.3, 0.92, 0.85]), cut('car', 'halden gt', 1700, 820, ['#1c2a44', '#9aa7b8', '#0c0c0c']),
      R('road', 'coastal road', 'a coupe on a winding coastal road at dusk', ms(1900, 1000, '#2b3a55', ['#2b3a55', '#e9a46a', '#0e1320'], [0.3, 0.45, 0.6, 0.75])),
      R('interior', 'cockpit', 'the cockpit of an electric car with a wide screen', ms(1600, 1000, '#141414', ['#141414', '#c9a46a', '#5c5c5c'], [0.1, 0.15, 0.9, 0.9])),
      R('wheel', 'wheel detail', 'close-up of a sports car wheel and brake caliper', ms(1300, 1300, '#101010', ['#101010', '#b8b8b8', '#1c2a44'], [0.15, 0.15, 0.85, 0.85])), logo('halden-logo', ['#1c2a44', '#ffffff'])],
  },
  skincare: {
    id: 'skincare', genre: 'luxury', label: 'Maison Ivre serum', mainAsset: 'serum',
    understanding: und('Maison Ivre', 'A website for Maison Ivre, a luxury face serum in a frosted glass bottle', 'product', 'luxury face serum', 'restrained'),
    facts: facts('Maison Ivre', ['$NAME serum is made in Grasse.', '$NAME uses cold-pressed rosehip oil.']),
    assets: [main('serum', 'maison ivre serum', 'a frosted glass serum bottle with a gold cap', 1000, 1500, '#ece6df', ['#ece6df', '#c9a46a', '#8e7a68'], [0.32, 0.1, 0.68, 0.92]), cut('serum', 'maison ivre serum', 560, 1400, ['#ece6df', '#c9a46a', '#8e7a68']),
      R('drop', 'serum drop', 'a golden drop of oil falling from a pipette', ms(1200, 1500, '#e8dccb', ['#e8dccb', '#c9a46a', '#5a4a3a'], [0.35, 0.2, 0.65, 0.8])),
      R('rose', 'rosehips', 'rosehips and petals on linen', ms(1600, 1066, '#e2d4c6', ['#e2d4c6', '#a8433a', '#6b5a4a'], [0.15, 0.2, 0.85, 0.85])), logo('ivre-logo', ['#8e7a68', '#ffffff'])],
  },
  editorial: {
    id: 'editorial', genre: 'editorial', label: 'Ines Achebe portfolio', mainAsset: 'portrait',
    understanding: Object.assign(und('Ines Achebe', 'A personal portfolio website for Ines Achebe, a documentary photographer and writer', 'person', 'documentary photographer', 'serious'), { kind: 'personal' }),
    facts: facts('Ines Achebe', ['$NAME photographs coastal communities.', '$NAME has published two photo books.']),
    assets: [main('portrait', 'ines achebe', 'a black and white portrait of a photographer holding a camera', 1200, 1500, '#d9d9d9', ['#d9d9d9', '#2a2a2a', '#8a8a8a'], [0.25, 0.08, 0.75, 0.95]),
      A('work1', { title: 'harbour at dawn', curation: { role: 'supporting', identity: 'related', depicts: 'fishing boats in a harbour at dawn', issues: [] }, assess: ms(1800, 1200, '#5d6b78', ['#5d6b78', '#d8c9a8', '#1f262c'], [0.1, 0.3, 0.9, 0.85]) }),
      A('work2', { title: 'net mender', curation: { role: 'supporting', identity: 'related', depicts: 'a fisherman mending nets', issues: [] }, assess: ms(1400, 1750, '#7a6a55', ['#7a6a55', '#2b2520', '#d6c4a2'], [0.2, 0.15, 0.8, 0.9]) }),
      A('work3', { title: 'shoreline', curation: { role: 'supporting', identity: 'related', depicts: 'a wide empty shoreline with a lone figure', issues: [] }, assess: ms(2000, 1000, '#9fb0b8', ['#9fb0b8', '#e9e4da', '#3c4448'], [0.4, 0.4, 0.55, 0.75]) })],
  },
};
module.exports = { SUBJECTS, IDS: Object.keys(SUBJECTS) };
