'use strict';
// A mocked consumer brand for the look's regression (test/creative-look.test.js): a cola soft drink with a red-and-white
// logo, a red can (and its cut-out), a cola pour, a glass bottle and a festival crowd -- measured the way the studio
// measures pictures (assets.js), so the director, the validator and the renderer see exactly what a real page would.
// The brand is invented: nothing in the code knows any brand by name.

const A = (id, extra) => Object.assign({ id, origin: 'upload', title: id, relevance: 2, mime: 'image/png', assetRef: 'a'.repeat(64), caps: { moveFreely: false, frame: true, backdrop: true, heroSize: true } }, extra);
const ms = (w, h, bg, cols, subject, more) => Object.assign({ width: w, height: h, aspect: +(w / h).toFixed(3), orientation: w > h * 1.15 ? 'landscape' : h > w * 1.15 ? 'portrait' : 'square', background: { colour: bg, uniformity: 0.7, tolerance: 60 }, colours: cols, subject, luminance: 120, transparent: false, transparentShare: 0, megapixels: (w * h) / 1e6 }, more || {});
const R = (id, title, depicts, a) => A(id, { origin: 'research', title, license: 'CC BY 4.0', pageUrl: `https://example.org/${id}`, author: 'Example', curation: { role: 'subject', identity: 'exact', depicts, issues: [] }, assess: a });

const CAN = A('can', { title: 'kolaro can', ownerRole: 'main', curation: { role: 'subject', identity: 'exact', depicts: 'a red cola can', issues: [] }, assess: ms(900, 1400, '#f4f4f4', ['#d50f1f', '#ffffff', '#3a1d12'], [0.3, 0.1, 0.7, 0.92], { background: { colour: '#f4f4f4', uniformity: 0.95, tolerance: 20 } }) });
const CANCUT = A('c-can', { origin: 'derived', cutout: true, cutoutOf: 'can', title: 'kolaro can', caps: { moveFreely: true, frame: false, backdrop: false, heroSize: true }, assess: ms(560, 1300, '#ffffff', ['#d50f1f', '#ffffff', '#3a1d12'], [0.02, 0.02, 0.98, 0.98], { transparent: true, transparentShare: 0.4, background: { colour: '#ffffff', uniformity: 0, tolerance: 0 } }) });
const POUR = R('pour', 'cola pour', 'cola poured into a glass with ice', ms(1600, 1000, '#1a0d08', ['#4a2414', '#c8102e', '#f2e6d8'], [0.3, 0.1, 0.7, 0.9]));
const BOTTLE = R('bottle', 'glass bottle', 'a classic glass cola bottle', ms(1000, 1400, '#e9e9e9', ['#2b1309', '#d4141e', '#e9e9e9'], [0.35, 0.05, 0.65, 0.95]));
const CROWD = R('crowd', 'summer crowd', 'people sharing cola at a summer festival', ms(1600, 900, '#c8102e', ['#c8102e', '#ffffff', '#1d1d1d'], [0.1, 0.2, 0.9, 0.9]));
const LOGO = A('logo', { title: 'kolaro logo', ownerRole: 'logo', relevance: 0, assess: ms(600, 200, '#ffffff', ['#e30613', '#ffffff'], [0.02, 0.1, 0.98, 0.9], { transparent: true }) });
const ASSETS = [CAN, CANCUT, POUR, BOTTLE, CROWD, LOGO];
const UND = { kind: 'recognizable', subject: 'Kolaro', name: 'Kolaro', brief: 'Make a website for Kolaro, the classic cola soft drink brand', tone: { register: 'playful' }, identity: { name: 'Kolaro', kind: 'recognizable', type: 'product', what: 'a cola soft drink brand' }, visuals: { main: 'the Kolaro can' } };
const FACTS = [{ id: 'f1', text: 'Kolaro is a carbonated cola soft drink.', section: 'x' }];

module.exports = { A, ms, R, ASSETS, UND, FACTS, CAN, CANCUT, POUR, BOTTLE, CROWD, LOGO };
