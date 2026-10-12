// Builds the instructions for the AI writer from a design package: its rules (schema + design checks), notes on what
// the design shows and how it adapts, the default content as the exact shape to return, and the customer's brief.
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

// The writer's policy. The brief is the source of truth; the design is a visual reference whose content, switches,
// numbers and colours the writer adapts to the business. It decides ordinary design questions itself (and lists the
// decisions); it asks only for essential business facts (kinds price | legal | transaction), all in one round. In the
// final run (the owner has answered) it asks nothing. lib/design-sites.js enforces the same on what comes back.
const KINDS = ['price', 'legal', 'transaction'];
// reality: the lines the Realism Engine writes about this business (lib/reality writerBrief: real or concept, what is
// material, what must stay consistent, the facts already established)
function build(d, brief, briefSpec, { final = false, longNames = [], reality = [] } = {}) {
  const example = fs.readFileSync(path.join(d.dir, 'default.json'), 'utf8');
  const system = [
    'You write the content for a premium website design for a small business, as one JSON object. The design\'s animation, interactions and craft stay; its words, numbers, colours, switches and options are yours to set for this business.',
    'Return exactly one JSON object and nothing else, always complete. Same keys and nesting as the example. Lists keep the example\'s length where the rules say "exactly"; where they allow a range, size them to the business (as many services, staff or items as the brief gives, within the range).',
    '',
    'THE BRIEF IS THE SOURCE OF TRUTH; THE DESIGN IS A VISUAL REFERENCE.',
    '- The example content describes another business. Where the design (as described below) shows something the brief contradicts or does not have, adapt it: change the numbers, switch the section off, replace the option, recolour the finish. A demo, a section, a part or a picture must never claim something that is untrue of this business. A 72-hour demo for a 42-hour product is wrong; a feature the product does not have is removed.',
    '- When the design cannot show something from the brief exactly, pick the closest honest representation it can show and say so in "_decisions". Never keep an inaccurate representation to preserve the design, and never ask the owner whether to.',
    '- You decide all ordinary design questions yourself: which sections to show, animation and demo values, visual representations, colours, wording, ordering, and what to do about the design\'s limits. List each such decision in "_decisions", a short sentence each, e.g. "Switched off the dual-time section: the brief\'s watch is a three-hand watch".',
    '- Keep the design\'s quality: write as well as the example does, and keep every animation and interaction the brief allows.',
    '',
    'FACTS',
    '- Facts the brief gives (names, prices, sizes, times, phone numbers, addresses, opening hours, specifications) are used exactly: never change, rescale or reword one to satisfy a rule. If a rule can only be met by changing a fact, show it another way the design allows (shorter wording around it, another field or section) and record the decision.',
    '- Where the brief is silent, make reasonable, modest assumptions consistent with the brief and with each other (one lead time, one deposit, one size everywhere it appears). List each assumed path in "_assumed"; the owner reviews them after the page is built.',
    '- For a new, concept or fictional business, invented details may fill gaps, but never present them as verified: no awards, certifications, test results, ratings, reviews, press mentions, founding years or customer counts the brief does not give.',
    ...(reality.length ? ['', 'THIS BUSINESS', ...reality.map((l) => '- ' + l)] : []),
    '',
    final ? 'THE OWNER HAS ANSWERED YOUR QUESTIONS (after the brief). Use the answers, decide everything else yourself, and ask nothing: "_questions" must be an empty list.' : [
      'QUESTIONS (rare)',
      '- Ask only for essential business information you cannot responsibly assume: an actual selling price the page must state (kind "price"), a legal statement the business must make (kind "legal"), or information needed to process a real transaction, such as how a deposit is taken (kind "transaction"). Nothing else is a question: design choices, animation details, representations, specifications and copy are yours to decide.',
      '- Put every such question in "_questions" at once, as [{ "question": "...", "kind": "price" | "legal" | "transaction" }], at most five, in plain words. There is one round of questions only, so ask everything essential now. Still return the full JSON with your best values in place.',
    ].join('\n'),
    longNames.length ? `- The name "${longNames.map((x) => x.value).join('", "')}" is longer than the design can show. Write the shortest natural form of it in its place${final ? '' : '; the owner will be asked which short name they trade under'}.` : '',
    '',
    'Extra keys: "_assumed" (paths whose values the brief does not support), "_decisions" (what you adapted or decided, one sentence each), "_questions" (see above; usually empty).',
    '',
    'WRITING',
    '- Never reuse the example\'s headlines, titles or taglines, even reworded by one word. When the brief says little about the business, write from what it does say: the place, the trade, the customers.',
    '- Write headings, descriptions and captions fresh, in the business\'s own voice. Descriptions may say what things smell, look or feel like.',
    '- Choose theme colours from the brief\'s brand colours where possible, within the colour rules. The business name is the brand.',
    '',
    'What the design shows, and how it adapts:',
    ...briefSpec.writerNotes.map((n) => '- ' + n),
    '',
    'The rules your content must pass:',
    rulesText(d),
  ].join('\n').replace(/\n{3,}/g, '\n\n');
  const a = brief._answers;
  const user = [
    `The example content (another business; adapt it, return the same shape):\n${example}`,
    'The brief from the new business:',
    ...briefSpec.fields.map((f) => `${f.label}: ${String(brief[f.key] || '').trim() || '(not given)'}`),
    ...(a ? [`The owner's answers to your questions${a.questions && a.questions.length ? ' (' + a.questions.join(' / ') + ')' : ''}:\n${a.text}`] : []),
  ].join('\n\n');
  return { system, user };
}

function retry(errors) {
  return `The checker rejected that draft:\n${errors.map((e) => '- ' + e).join('\n')}\n\nReturn the full corrected JSON object. Change only what these errors need; keep everything else as it was. Do not ask about these errors: fix them.`;
}

module.exports = { build, retry, rulesText, KINDS };
