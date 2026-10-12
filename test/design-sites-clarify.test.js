'use strict';
// DESIGN SITES, the clarification workflow (lib/design-sites.js, design-packages/prompt.js): the brief is the source of
// truth and the writer decides ordinary design questions itself. Regressions for the endless clarification loop:
//   - a design whose demo contradicts the brief (Meridian 38 on Aldane: a 42 h watch, no second time zone, straps that
//     aren't the drawn ones) is adapted and built with no question to the owner;
//   - questions about non-essential things (design, animation, specs) are decided, not asked, and listed for review;
//   - essential questions (price, legal, transaction) come in ONE round; after the owner's answers the final run never
//     asks again, even when the writer does.
// Scripted writers only -- never the paid AI.
process.env.SITEREMADE_DB_PATH = ':memory:';
process.env.SITEREMADE_DESIGN_OWNER_CUTOFF = '2999-01-01T00:00:00.000Z';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { app, setDesignDeps } = require('../server.js');
const designSites = require('../lib/design-sites');
const prompt = require('../design-packages/prompt');
const { loadDesign } = require('../design-packages/engine/engine');

const FIX = path.join(__dirname, 'fixtures', 'design-sites');
const OWNER = 'jaydenflynn9@gmail.com';

// A writer that answers from a script, one entry per call, and keeps every prompt and feedback it was given.
function scripted(answers) {
  const log = { prompts: [], feedback: [], calls: 0 };
  let i = 0;
  const factory = () => {
    const usage = { calls: 0, input: 0, output: 0, cacheWrite: 0, cacheRead: 0 };
    return {
      name: 'scripted', usage,
      start(p) { log.prompts.push(p); }, feedback(t) { log.feedback.push(t); },
      async next() { usage.calls++; log.calls++; if (i >= answers.length) throw new Error('the writer was called more often than scripted'); const a = answers[i++]; return typeof a === 'string' ? a : JSON.stringify(a); },
    };
  };
  return { factory, log };
}

async function server() {
  const srv = app.listen(0, '127.0.0.1'); await new Promise((r) => srv.on('listening', r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  let cookie = '';
  const call = async (method, p, body) => {
    const r = await fetch(base + p, { method, headers: { 'content-type': 'application/json', cookie }, body: body ? JSON.stringify(body) : undefined });
    const sc = r.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
    const text = await r.text(); let json = null; try { json = JSON.parse(text); } catch (e) { /* html */ }
    return { status: r.status, json, text };
  };
  // (one database for the whole file: the owner signs up once, then signs in)
  const creds = { email: OWNER, password: 'correct-horse-battery-staple' };
  if ((await call('POST', '/api/auth/signup', creds)).status !== 200) assert.equal((await call('POST', '/api/auth/signin', creds)).status, 200);
  return { srv, call };
}
const settled = async (call, id) => { const t0 = Date.now(); for (;;) { const r = await call('GET', `/api/designs/sites/${id}`); if (r.json.site.status !== 'writing') return r.json.site; if (Date.now() - t0 > 10000) throw new Error('timed out'); await new Promise((ok) => setTimeout(ok, 30)); } };

// ---------- Meridian 38: the design contradicts the brief ----------
const MERIDIAN_BRIEF = {
  businessName: 'Meridian 38', brand: 'Meridian',
  watch: 'Meridian 38, calibre MW-42: a hand-wound three-hand watch (hours, minutes, seconds; no date, no second time zone). 38 mm steel case, 11 mm thick, water resistant to 100 m, 42-hour power reserve, 17 jewels, 4 Hz.',
  options: 'Cases: brushed steel $1,850 (6 weeks), black DLC steel $2,150 (8 weeks), bronze $2,400 (10 weeks). Dials: silver and black included, field green and cream +$120. Straps: black rubber included, navy canvas +$60, olive nylon +$40, sand leather +$90.',
  reserve: 'A $300 deposit holds a build slot; deliveries in November, December and January.',
  currency: '$',
};
const meridian = () => JSON.parse(fs.readFileSync(path.join(FIX, 'meridian-38.json'), 'utf8'));

test('contradictory design features: Meridian 38 is adapted and built without asking', async () => {
  const draft = meridian();
  // the writer also raises the contradictions as questions (as it used to with _blocked); none is essential
  draft._blocked = ['The design shows a 72-hour winding demo but the brief says 42 hours. Should it stay?'];
  draft._questions = [{ question: 'Should the GMT section be kept for a three-hand watch?', kind: 'design' }, { question: 'The drawn straps are leather; is that OK for rubber and canvas?' }];
  const w = scripted([draft]);
  setDesignDeps({ writer: w.factory });
  const { srv, call } = await server();
  try {
    const started = await call('POST', '/api/designs/sites', { design: 'aldane', brief: MERIDIAN_BRIEF });
    assert.equal(started.status, 200, started.text);
    assert.equal(started.json.site.status, 'writing', 'nothing is asked before the writer runs');
    const site = await settled(call, started.json.site.id);
    assert.equal(site.status, 'built', JSON.stringify(site));
    assert.deepEqual(site.questions, [], 'no question reached the owner');
    assert.equal(w.log.calls, 1, 'one draft, no second round');

    // the writer was told the brief wins and how this design adapts
    const sys = w.log.prompts[0].system;
    assert.match(sys, /THE BRIEF IS THE SOURCE OF TRUTH/);
    assert.match(sys, /movement\.reserve/); assert.match(sys, /features\.dualTime/); assert.match(sys, /colour "#rrggbb"/);
    assert.doesNotMatch(sys, /_blocked/, 'no design note tells the writer to stop and ask');

    // the page shows the watch the brief describes
    const html = (await call('GET', `/api/designs/sites/${site.id}/preview`)).text;
    assert.match(html, /aria-valuemax="42"/, 'the winding demo runs 42 hours');
    assert.match(html, /let R = \d+; \/\/ hours/);
    assert.match(html, /R = Math\.min\(42, R \+ use \/ 360 \* 1\.4\)/, '1.4 h a turn, 30 turns');
    assert.match(html, /<b id="resTurns">[\d.]+ \/ 30<\/b>/);
    assert.match(html, /enough for 42 hours/); assert.doesNotMatch(html, /72 h|72 hours|seventy-two/i, 'nothing left of the 72-hour demo');
    assert.match(html, /<section class="sec alt" id="dualtime" aria-labelledby="dualH" hidden>/, 'no dual-time section on a three-hand watch');
    assert.doesNotMatch(html, /href="#dualtime"/, 'and no nav link to it');
    assert.match(html, /--tan:#1b1c1f;--tan-st:#3a3c40/, 'the first strap is drawn black rubber');
    assert.match(html, /--cordovan:#26324d/, 'navy canvas');
    assert.match(html, /--ti-mid:#3a3d42/, 'black DLC case');

    // the writer's decisions and its non-essential questions are listed for review, not asked
    const decided = site.confirm.filter((c) => c.why === 'decided by the writer').map((c) => c.value);
    assert.ok(decided.some((v) => /42 hours/.test(v)), decided.join(' | '));
    assert.ok(decided.some((v) => /^Decided without asking: Should the GMT section/.test(v)));
    assert.ok(decided.some((v) => /^Decided without asking: The design shows a 72-hour/.test(v)), 'old-style _blocked is decided too');
    assert.ok(site.confirm.some((c) => c.path === 'movement.turns'), 'the assumed crown turns are listed');
  } finally { srv.close(); }
});

// ---------- missing non-essential specifications ----------
test('missing non-essential specifications: assumed and listed, never asked', async () => {
  const draft = meridian();
  draft._assumed = ['movement.turns', 'specs.rows.2.mm', 'configure.cases.0.weeks'];
  draft._questions = [
    { question: 'What is the lug-to-lug length?', kind: 'spec' },
    { question: 'How many crown turns from empty?', kind: 'specification' },
    'What should the hero animation timing be?',
  ];
  const w = scripted([draft]);
  setDesignDeps({ writer: w.factory });
  const { srv, call } = await server();
  try {
    const brief = { ...MERIDIAN_BRIEF, watch: 'Meridian 38, a hand-wound three-hand watch with a 42-hour power reserve.' };
    const site = await settled(call, (await call('POST', '/api/designs/sites', { design: 'aldane', brief })).json.site.id);
    assert.equal(site.status, 'built');
    assert.deepEqual(site.questions, []);
    for (const p of ['movement.turns', 'specs.rows.2.mm', 'configure.cases.0.weeks']) assert.ok(site.confirm.some((c) => c.path === p), p + ' is listed for review');
    assert.equal(site.confirm.filter((c) => /^Decided without asking/.test(c.value)).length, 3);
  } finally { srv.close(); }
});

// ---------- repeated clarification loop ----------
test('repeated clarification loop: one round of essential questions, then the site is written', async () => {
  const attempt1 = JSON.parse(fs.readFileSync(path.join(FIX, 'attempt-1.txt'), 'utf8').replace(/^[^{]*/, ''));
  const attempt2 = JSON.parse(fs.readFileSync(path.join(FIX, 'attempt-2.txt'), 'utf8').replace(/^[^{]*/, ''));
  const ask = (qs) => ({ ...attempt1, _questions: qs });
  const w = scripted([
    // run 1: two essential questions, one design question (dropped), and a duplicate
    ask([{ question: 'What do you charge for the ceramic coating?', kind: 'price' }, { question: 'Is a deposit taken when booking?', kind: 'transaction' },
      { question: 'Should the paint animation be slower?', kind: 'design' }, { question: 'What do you charge for the ceramic coating?', kind: 'price' }]),
    // run 2 (after the answers): the writer finds new questions and its first draft breaks a rule -- it must still finish
    ask([{ question: 'What is your VAT number?', kind: 'legal' }]),
    { ...attempt2, _questions: [{ question: 'Which payment cards do you take?', kind: 'transaction' }] },
  ]);
  setDesignDeps({ writer: w.factory });
  const { srv, call } = await server();
  try {
    const { brief } = JSON.parse(fs.readFileSync(path.join(FIX, 'brief.json'), 'utf8'));
    const id = (await call('POST', '/api/designs/sites', { design: 'beadline', brief })).json.site.id;
    const asked = await settled(call, id);
    assert.equal(asked.status, 'needs_owner');
    assert.deepEqual(asked.questions, ['What do you charge for the ceramic coating?', 'Is a deposit taken when booking?'], 'essential only, all at once, no duplicates');

    const ans = await call('POST', `/api/designs/sites/${id}/answer`, { answers: 'Ceramic coating is £650. A £50 deposit by card when booking.' });
    assert.equal(ans.status, 200, ans.text);
    const done = await settled(call, id);
    assert.equal(done.status, 'built', 'the final run never stops to ask: ' + JSON.stringify(done.questions));
    assert.deepEqual(done.questions, []);
    assert.equal(w.log.calls, 3);

    // the final run saw the answers and was told not to ask
    const final = w.log.prompts[1];
    assert.match(final.system, /THE OWNER HAS ANSWERED/); assert.doesNotMatch(final.system, /QUESTIONS \(rare\)/);
    assert.match(final.user, /£650/); assert.match(final.user, /What do you charge for the ceramic coating\?/);
    assert.equal(w.log.feedback.length, 1, 'the rule break was fixed by a retry, not a question');
    const decided = done.confirm.filter((c) => c.why === 'decided by the writer').map((c) => c.value);
    assert.ok(decided.includes("Went ahead with the owner's answers: Which payment cards do you take?"), decided.join(' | '));

    // nothing left to answer
    assert.equal((await call('POST', `/api/designs/sites/${id}/answer`, { answers: 'more' })).status, 409);
  } finally { srv.close(); }
});

test('a name the design cannot fit is asked in the same single round, then shortened if still too long', async () => {
  const attempt2 = JSON.parse(fs.readFileSync(path.join(FIX, 'attempt-2.txt'), 'utf8').replace(/^[^{]*/, ''));
  const w = scripted([
    { ...attempt2, _questions: [{ question: 'What do you charge for paint correction?', kind: 'price' }] },
    { ...attempt2, business: { ...attempt2.business, name: 'GlossMasters' } },
  ]);
  setDesignDeps({ writer: w.factory });
  const { srv, call } = await server();
  try {
    const { brief } = JSON.parse(fs.readFileSync(path.join(FIX, 'brief.json'), 'utf8'));
    const long = 'GlossMasters Pro Detailing & Ceramic Coating Specialists LLC';
    const id = (await call('POST', '/api/designs/sites', { design: 'beadline', brief: { ...brief, businessName: long } })).json.site.id;
    const asked = await settled(call, id);
    assert.equal(asked.status, 'needs_owner');
    assert.equal(asked.questions.length, 2, 'the name and the price, together');
    assert.match(asked.questions[0], /shorter name/);
    await call('POST', `/api/designs/sites/${id}/answer`, { answers: 'We trade as GlossMasters. Paint correction is £300.' });
    const done = await settled(call, id);
    assert.equal(done.status, 'built', JSON.stringify(done.attempts));
    const html = (await call('GET', `/api/designs/sites/${id}/preview`)).text;
    assert.match(html, /GlossMasters/);
    assert.ok(done.confirm.some((c) => c.value === `Shortened the name "${long}" to "GlossMasters" to fit the design`));
  } finally { srv.close(); }
});

// ---------- units ----------
test('triage: only price, legal and transaction questions reach the owner', () => {
  const t = designSites.triage({
    _questions: [{ question: 'Price of the large?', kind: 'price' }, { question: 'Required disclaimer text?', kind: 'Legal' }, { question: 'Deposit by card or bank?', kind: 'transaction' },
      { question: 'Keep the GMT section?', kind: 'design' }, { question: 'Animation speed?', kind: 'animation' }, { question: 'No kind given' }, '', { question: '' }],
    _blocked: ['Old-style question'],
  });
  assert.deepEqual(t.essential, ['Price of the large?', 'Required disclaimer text?', 'Deposit by card or bank?']);
  assert.deepEqual(t.decided, ['Keep the GMT section?', 'Animation speed?', 'No kind given', 'Old-style question']);
  const many = designSites.triage({ _questions: Array.from({ length: 9 }, (_, i) => ({ question: 'Price ' + i + '?', kind: 'price' })) });
  assert.equal(many.essential.length, 5, 'at most five, in one round');
  assert.deepEqual(designSites.triage({}), { essential: [], decided: [] });
  assert.deepEqual(designSites.triage(null), { essential: [], decided: [] });
});

test('shortName: the owner\'s words only, else whole words from the start', () => {
  const x = { value: 'GlossMasters Pro Detailing & Ceramic Coating Specialists LLC', limit: 24 };
  assert.equal(designSites.shortName(x, 'GlossMasters Pro', ''), 'GlossMasters Pro');
  assert.equal(designSites.shortName(x, 'Shiny Cars', ''), 'GlossMasters Pro', 'an invented name is not used');
  assert.equal(designSites.shortName(x, 'Gloss Co', 'We trade as Gloss Co.'), 'Gloss Co', 'a name from the owner\'s answers is');
  assert.equal(designSites.shortName(x, 'GlossMasters Pro Detailing & Ceramic', ''), 'GlossMasters Pro', 'too long');
  assert.equal(designSites.shortName({ value: 'Supercalifragilisticexpialidocious', limit: 10 }, '', ''), 'Supercalif');
});

test('prompt: brief over design, decisions over questions, and a final mode', () => {
  const D = loadDesign(path.join(__dirname, '..', 'design-packages', 'design', 'aldane'));
  const spec = JSON.parse(fs.readFileSync(path.join(D.dir, 'brief.json'), 'utf8'));
  const first = prompt.build(D, MERIDIAN_BRIEF, spec);
  assert.match(first.system, /THE BRIEF IS THE SOURCE OF TRUTH; THE DESIGN IS A VISUAL REFERENCE/);
  assert.match(first.system, /never ask the owner whether to/);
  assert.match(first.system, /"price" \| "legal" \| "transaction"/);
  assert.match(first.system, /never present them as verified/);
  assert.match(first.system, /_decisions/);
  assert.doesNotMatch(first.system, /The design is fixed/);
  const final = prompt.build(D, { ...MERIDIAN_BRIEF, _answered: true, _answers: { questions: ['Deposit?'], text: 'Card, $300.' } }, spec, { final: true });
  assert.match(final.system, /ask nothing/); assert.doesNotMatch(final.system, /QUESTIONS \(rare\)/);
  assert.match(final.user, /The owner's answers to your questions \(Deposit\?\):\nCard, \$300\./);
  // every design's notes: adapt, never stop to ask
  for (const d of designSites.designs()) {
    const s = fs.readFileSync(path.join(__dirname, '..', 'design-packages', 'design', d.design, 'brief.json'), 'utf8');
    assert.doesNotMatch(s, /_blocked/, d.design);
  }
});
