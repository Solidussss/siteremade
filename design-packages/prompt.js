// Builds the instructions for the AI writer from a design package: its rules (schema + design checks), notes on what
// the fixed animation shows, the default content as the exact shape to return, and the customer's brief.
// Nothing here is design-specific; it reads whatever the package declares.
'use strict';
const fs = require('fs');
const path = require('path');

function rulesText(d) {
  const S = d.schema, K = d.manifest.checks || {}, L = [];
  L.push('Text lengths (characters; *emphasis* markers do not count):');
  for (const [p, [lo, hi]] of Object.entries(S.text || {})) L.push(`  ${p}: ${lo}-${hi}`);
  L.push('List sizes:');
  for (const [p, [lo, hi]] of Object.entries(S.lists || {})) L.push(`  ${p}: ${lo === hi ? 'exactly ' + lo : lo + '-' + hi}`);
  if (Object.keys(S.numbers || {}).length) { L.push('Number ranges:'); for (const [p, [lo, hi]] of Object.entries(S.numbers)) L.push(`  ${p}: ${lo}-${hi}`); }
  L.push('Allowed values:');
  for (const [p, s] of Object.entries(S.choices || {})) L.push(`  ${p}: ${(Array.isArray(s) ? s : s.options).join(' | ')}${!Array.isArray(s) && s.optional ? ' (optional)' : ''}`);
  if (Object.keys(S.combined || {}).length) L.push('Combined lengths:');
  for (const [k, max] of Object.entries(S.combined || {})) L.push(`  ${k.split('+').join(' + ')}: at most ${max} characters together`);
  if ((S.widths || []).length) {
    L.push('Some text sits in fixed-width spots and is measured in the real font, so short words win. The checker will say if something is too wide:');
    for (const w of S.widths) L.push(`  ${w.path}: must fit ${w.label}`);
  }
  L.push(`Colours (#rrggbb): ${(S.colours || []).join(', ')}.`);
  for (const l of K.lightness || []) L.push(`  ${l.path}: lightness ${l.range[0]}-${l.range[1]} (HSL)${l.maxSaturation != null ? `, saturation at most ${l.maxSaturation}` : ''}${l.note ? ` - ${l.note}` : ''}`);
  if ((K.contrast || []).length) L.push(`  Text colours are checked for contrast (${K.contrast.map((c) => c[3]).join('; ')}).`);
  for (const [n, f] of Object.entries(d.manifest.families || {})) L.push(`  ${f.target}: ${f.about || n}`);
  for (const r of S.rules || []) L.push('Rule: ' + r);
  return L.join('\n');
}

function build(d, brief, briefSpec) {
  const example = fs.readFileSync(path.join(d.dir, 'default.json'), 'utf8');
  const system = [
    'You write the content for a premium website design for a real small business. The design is fixed: its animation, layout and code never change. You only supply the content as one JSON object.',
    'Return exactly one JSON object and nothing else. Same keys, same nesting and the same list lengths as the example. Add one extra key "_assumed": a list of the paths whose values are not supported by the brief.',
    'Facts (prices, durations, sizes, phone numbers, addresses, opening hours, percentages, batch numbers, years): use only what the brief says. Never invent a fact. If the design needs a fact the brief does not give, keep the example\'s value and list its path in "_assumed".',
    'Never change a fact from the brief to satisfy a rule: not a name, a price, a size, a currency or a time, and never rescale or reword numbers (no "thousands of", no new units). If a rule can only be met by changing such a fact, or the design needs more facts than the brief gives (for example three sizes when the brief has one), keep the fact exactly as given and add a key "_blocked": a list of short questions to ask the owner. The owner will be asked; that is the right outcome.',
    'Use "_blocked" only for: (a) a rule that can only be met by changing a fact from the brief; (b) prices, sizes or products the design must show that the brief does not give at all; (c) ingredients or services you would otherwise have to make up (a perfume note, a package the business does not offer). Ask only the questions that block the site, in plain words, at most five.',
    'Do not block for anything with a sensible default: timings and proportions, how long a process takes, vehicle-size surcharges, opening-hour details, colours, fonts, optional extras (leave them out where the design allows). Choose a modest value and list its path in "_assumed"; the owner confirms those before publishing.',
    'Descriptions may say what things smell, look or feel like, but do not state specific facts the brief does not give (origins, years, batch numbers, awards, ratings, guarantees).',
    'Never reuse the example\'s headlines, titles or taglines, even reworded by one word (the example is another business\'s site). When the brief says little about the business, write from what it does say: the place, the trade, the customers.',
    'Write everything else (headings, descriptions, captions) fresh, in the business\'s own voice from the brief. Keep the example\'s structure and the meaning of each field; do not copy the example business\'s name, place or story.',
    'Choose theme colours from the brief\'s brand colours where possible, within the colour rules. The business name is the brand; footer.fine says the site is a demo made with SiteRemade.',
    '',
    'What the fixed design shows (your content must match it):',
    ...briefSpec.writerNotes.map((n) => '- ' + n),
    '',
    'The rules your content must pass:',
    rulesText(d),
  ].join('\n');
  const user = [
    `The example content (the original business). Return the same shape:\n${example}`,
    'The brief from the new business:',
    ...briefSpec.fields.map((f) => `${f.label}: ${(brief[f.key] || '').trim() || '(not given)'}`),
  ].join('\n\n');
  return { system, user };
}

function retry(errors) {
  return `The checker rejected that draft:\n${errors.map((e) => '- ' + e).join('\n')}\n\nReturn the full corrected JSON object. Change only what these errors need; keep everything else as it was.`;
}

module.exports = { build, retry, rulesText };
